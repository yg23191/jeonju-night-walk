import { distance, validPoint } from './gis.ts'
import type { Point } from './gis.ts'
import { inWansan } from './wansan.ts'

export interface FieldReading {
  id: string
  point: Point
  lux: number
  measuredAt: string
  heightM: number | null
  direction: string
  repeat: number
}

export interface FieldRules { threshold: number; minReadings: number }
export const defaultFieldRules: FieldRules = { threshold: 5, minReadings: 3 }
export const fieldTemplate = 'id,longitude,latitude,lux,measured_at,height_m,direction,repeat_no\r\n'

export interface FieldSite {
  id: string
  point: Point
  median: number
  count: number
  measuredAt: string
  heightM: number | null
  direction: string
  status: 'dark' | 'above' | 'review'
}

function csvRows(input: string) {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false, closed = false
  function emit(end: boolean) {
    row.push(field.trim())
    field = ''
    closed = false
    if (!end) return
    if (row.some(Boolean)) rows.push(row)
    row = []
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else field += char
    } else if (char === ',') emit(false)
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      emit(true)
    } else if (char === '"' && !field && !closed) quoted = true
    else if (char === '"' || (closed && char !== ' ')) throw new Error('CSV의 따옴표 형식을 확인해 주세요.')
    else if (!closed) field += char
  }
  if (quoted) throw new Error('CSV의 닫는 따옴표가 빠졌습니다.')
  emit(true)
  return rows
}

export function validateFieldReading(reading: FieldReading) {
  if (!reading.id || reading.id.length > 64 || !validPoint(reading.point) || !inWansan(reading.point) ||
      typeof reading.lux !== 'number' || !Number.isFinite(reading.lux) || reading.lux < 0 || reading.lux > 200000 ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(reading.measuredAt) ||
      !Number.isFinite(Date.parse(reading.measuredAt)) ||
      Date.parse(reading.measuredAt) > Date.now() + 5 * 60 * 1000 ||
      (reading.heightM !== null && (!Number.isFinite(reading.heightM) || reading.heightM < 0 || reading.heightM > 50)) ||
      reading.direction.length > 40 || !Number.isInteger(reading.repeat) || reading.repeat < 1) {
    throw new Error('지점 ID, 완산구 좌표, 조도, 측정 시각, 센서 조건과 반복 번호를 확인해 주세요.')
  }
  return { ...reading, measuredAt: new Date(reading.measuredAt).toISOString() }
}

export function readFieldCsv(text: string): FieldReading[] {
  const [header, ...rows] = csvRows(text.replace(/^\uFEFF/, ''))
  const required = ['id', 'longitude', 'latitude', 'lux', 'measured_at']
  if (!header || !rows.length || required.some(key => !header.includes(key)) || new Set(header).size !== header.length) {
    throw new Error('측정 행과 id, longitude, latitude, lux, measured_at 열이 필요합니다.')
  }
  const visits = new Map<string, number>()
  return rows.map((row, i) => {
    const get = (name: string) => row[header.indexOf(name)] ?? ''
    const number = (name: string) => get(name) === '' ? NaN : Number(get(name))
    try {
      const id = get('id')
      const measuredAt = get('measured_at')
      const key = JSON.stringify([id, Date.parse(measuredAt)])
      const repeat = get('repeat_no') ? number('repeat_no') : (visits.get(key) ?? 0) + 1
      visits.set(key, Math.max(visits.get(key) ?? 0, repeat))
      return validateFieldReading({
        id, point: [number('longitude'), number('latitude')], lux: number('lux'), measuredAt,
        heightM: get('height_m') ? number('height_m') : null, direction: get('direction'), repeat
      })
    } catch (error) {
      throw new Error(`CSV 데이터 행 ${i + 1} · ${(error as Error).message}`)
    }
  })
}

export function mergeFieldReadings(previous: FieldReading[], incoming: FieldReading[]) {
  const combined = new Map<string, FieldReading>()
  const points = new Map<string, Point>()
  for (const raw of [...previous, ...incoming]) {
    const reading = validateFieldReading(raw)
    const initial = points.get(reading.id)
    if (initial && distance(initial, reading.point) > 5) throw new Error(`같은 지점 ID의 위치가 일치하지 않습니다. ID ${reading.id}`)
    points.set(reading.id, initial ?? reading.point)
    combined.set(JSON.stringify([reading.id, reading.measuredAt, reading.repeat]), reading)
  }
  return [...combined.values()]
}

export function summarizeFieldReadings(readings: FieldReading[], rules: FieldRules): FieldSite[] {
  const bySite = new Map<string, FieldReading[]>()
  for (const reading of readings) {
    const group = bySite.get(reading.id) ?? []
    group.push(reading)
    bySite.set(reading.id, group)
  }
  return [...bySite].map(([id, group]) => {
    const latest = group.reduce((best, reading) => reading.measuredAt > best.measuredAt ? reading : best)
    const time = Date.parse(latest.measuredAt)
    const current = group.filter(reading => time - Date.parse(reading.measuredAt) <= 15 * 60 * 1000 &&
      reading.heightM === latest.heightM && reading.direction === latest.direction)
    const values = current.map(reading => reading.lux).sort((a,b) => a - b)
    const middle = Math.floor(values.length / 2)
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
    const status = values.length < rules.minReadings || latest.heightM === null || !latest.direction ?
      'review' : median < rules.threshold ? 'dark' : 'above'
    return { id, point: latest.point, median, count: values.length, measuredAt: latest.measuredAt,
      heightM: latest.heightM, direction: latest.direction, status }
  })
}

export function fieldCsv(readings: FieldReading[]) {
  return fieldTemplate + readings.map(reading =>
    [reading.id, ...reading.point, reading.lux, reading.measuredAt, reading.heightM, reading.direction, reading.repeat]
      .map(value => {
        const text = String(value ?? '')
        const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? "'" + text : text
        return '"' + safe.replaceAll('"', '""') + '"'
      }).join(',')).join('\r\n')
}
