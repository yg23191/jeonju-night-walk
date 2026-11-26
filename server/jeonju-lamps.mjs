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

function number(value) {
  if (typeof value === 'number' || (typeof value === 'string' && value.trim())) return Number(value)
  return NaN
}

export function readLampPage(body) {
  const text = body.trim()
  if (/<!DOCTYPE/i.test(text)) throw new Error('Unexpected provider response')
  const decoded = text.startsWith('<') ? parser.parse(text) : JSON.parse(text)
  const points = []
  const sequence = []
  let code, pageSize, totalCount, recordCount = 0
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12) return
    if (Object.hasOwn(value, 'resultCode')) code = String(value.resultCode)
    if (Object.hasOwn(value, 'pageSize')) pageSize = number(value.pageSize)
    if (Object.hasOwn(value, 'totalCount')) totalCount = number(value.totalCount)
    if (Object.hasOwn(value, 'seq') || Object.hasOwn(value, 'posx') || Object.hasOwn(value, 'posy')) {
      recordCount++
      if (typeof value.seq === 'number' || (typeof value.seq === 'string' && value.seq.trim())) sequence.push(String(value.seq))
      const point = [number(value.posx), number(value.posy)]
      if (point.every(Number.isFinite)) points.push(point)
    }
    for (const item of Object.values(value)) visit(item, depth + 1)
  }
  visit(decoded)
  if (!code || !/^0+$/.test(code)) throw new Error('Jeonju API did not accept the request')
  return {
    points,
    pageSize: Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : undefined,
    totalCount: Number.isSafeInteger(totalCount) && totalCount >= 0 ? totalCount : undefined,
    recordCount,
    identity: recordCount > 0 && sequence.length === recordCount ? JSON.stringify(sequence) : undefined
  }
}

export async function fetchLampPositions(type, key, request = fetch) {
  const source = sources.find(source => source.type === type)
  if (!source || !key?.trim()) throw new Error('Jeonju lamp source is unavailable')
  const positions = new Map()
  const pageSize = 500
  const seenPages = new Set()
  for (let startPage = 1; startPage <= 200; startPage++) {
    const url = new URL('https://openapi.jeonju.go.kr/rest/' + source.path)
    url.search = new URLSearchParams({ authApiKey: key.trim(), startPage: String(startPage), pageSize: String(pageSize), ...source.params })
    const response = await request(url, { signal: AbortSignal.timeout(7000), redirect: 'error' })
    if (!response.ok) throw new Error('Jeonju API unavailable')
    const body = await response.text()
    if (body.length > 3_000_000) throw new Error('Jeonju API returned an oversized page')
    const page = readLampPage(body)
    if (page.identity && seenPages.has(page.identity)) throw new Error('Jeonju API repeated a data page')
    if (page.identity) seenPages.add(page.identity)
    for (const point of page.points) {
      if (inWansan(point)) positions.set(point.join(','), point)
    }
    const size = page.pageSize ?? pageSize
    // The streetlamp API documents totalCount as pages. The security-light API reports rows.
    const complete = page.totalCount === undefined ? page.recordCount < size :
      source.type === 'street' ? startPage >= page.totalCount : startPage * size >= page.totalCount
    if (complete) return [...positions.values()]
  }
  throw new Error('Jeonju API pagination incomplete')
}

export async function officialLampPositions() {
  const available = new Set(configuredLampSources())
  const results = await Promise.all(sources.filter(source => available.has(source.type)).map(async source => {
    const cached = snapshots.get(source.type)
    if (cached && (cached.pending || cached.until > Date.now())) return cached.promise
    const entry = { pending: true, until: 0, promise: null }
    entry.promise = fetchLampPositions(source.type, process.env[source.key]).then(points => {
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
