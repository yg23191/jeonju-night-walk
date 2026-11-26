import { XMLParser } from 'fast-xml-parser'
import { inWansan } from '../src/wansan.ts'

const parser = new XMLParser({ processEntities: false, parseTagValue: false })
const sources = [
  { type: 'street', key: 'JEONJU_STREETLAMP_API_KEY', path: 'streetlamp/getStreetlamp', params: {} },
  { type: 'security', key: 'JEONJU_SECURITY_LIGHT_API_KEY', path: 'saftylight/getSaftylight', params: { gu: '완산구' } }
]
const ttl = 60 * 60 * 1000
const snapshots = new Map()

export function configuredLampSources() {
  return sources.filter(source => process.env[source.key]?.trim()).map(source => source.type)
}

export function readLampPage(body) {
  const text = body.trim()
  if (/<!DOCTYPE/i.test(text)) throw new Error('Unexpected provider response')
  const decoded = text.startsWith('<') ? parser.parse(text) : JSON.parse(text)
  const points = []
  let code, pageSize
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return
    if (Object.hasOwn(value, 'resultCode')) code = String(value.resultCode)
    if (Object.hasOwn(value, 'pageSize')) pageSize = Number(value.pageSize)
    if (Object.hasOwn(value, 'posx') && Object.hasOwn(value, 'posy')) {
      const point = [Number(value.posx), Number(value.posy)]
      if (point.every(Number.isFinite)) points.push(point)
    }
    for (const item of Object.values(value)) visit(item, depth + 1)
  }
  visit(decoded)
  if (!code || !/^0+$/.test(code)) throw new Error('Jeonju API did not accept the request')
  return { points, pageSize }
}

async function requestLamps(source) {
  const key = process.env[source.key].trim()
  const positions = new Map()
  const pageSize = 500
  let previousPage = ''
  for (let startPage = 1; startPage <= 200; startPage++) {
    const url = new URL('https://openapi.jeonju.go.kr/rest/' + source.path)
    url.search = new URLSearchParams({ authApiKey: key, startPage: String(startPage), pageSize: String(pageSize), ...source.params })
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: 'error' })
    if (!response.ok) throw new Error('Jeonju API unavailable')
    const body = await response.text()
    if (body.length > 3_000_000) throw new Error('Jeonju API returned an oversized page')
    const page = readLampPage(body)
    const signature = JSON.stringify(page.points)
    if (page.points.length && signature === previousPage) throw new Error('Jeonju API repeated a data page')
    for (const point of page.points) {
      if (inWansan(point)) positions.set(point.join(','), point)
    }
    if (page.points.length < (page.pageSize || pageSize)) return [...positions.values()]
    previousPage = signature
  }
  throw new Error('Jeonju API pagination incomplete')
}

export async function officialLampPositions() {
  const available = new Set(configuredLampSources())
  const results = await Promise.all(sources.filter(source => available.has(source.type)).map(async source => {
    const cached = snapshots.get(source.type)
    if (cached && (cached.pending || cached.until > Date.now())) return cached.promise
    const entry = { pending: true, until: 0, promise: null }
    entry.promise = requestLamps(source).then(points => {
      entry.pending = false
      entry.until = Date.now() + ttl
      return { type: source.type, points }
    }).catch(() => {
      snapshots.delete(source.type)
      return { type: source.type, error: true }
    })
    snapshots.set(source.type, entry)
    return entry.promise
  }))
  return results
}
