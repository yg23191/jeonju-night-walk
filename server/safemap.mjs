import { wansanBounds } from '../src/wansan.ts'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const upstreamError = { status: 502, code: 'safemap_unavailable' }

export async function safemapTile(params, key, request = fetch) {
  if (!key) return { status: 503, code: 'safemap_key_missing' }
  const raw = params.get('bbox')?.split(',')
  const box = raw?.map(Number)
  const [west, south, east, north] = wansanBounds
  const width = Number(params.get('width'))
  const height = Number(params.get('height'))
  if (!box || box.length !== 4 || raw.some(part => !part.trim()) || !box.every(Number.isFinite) ||
      box[0] < west || box[1] < south || box[2] > east || box[3] > north || box[0] >= box[2] || box[1] >= box[3] ||
      ![width, height].every(value => Number.isInteger(value) && value >= 32 && value <= 1024)) {
    return { status: 400, code: 'invalid_bounds' }
  }

  const upstream = new URL('https://www.safemap.go.kr/openapi2/IF_0087_WMS')
  upstream.search = new URLSearchParams({
    serviceKey: key, service: 'WMS', request: 'GetMap', version: '1.1.1',
    layers: 'A2SM_CRMNLHSPOT_TOT', styles: 'A2SM_CrmnlHspot_Tot_Tot', srs: 'EPSG:4326',
    bbox: box.join(','), width: String(width), height: String(height), format: 'image/png', transparent: 'TRUE'
  }).toString()
  try {
    const source = await request(upstream, { redirect: 'error', signal: AbortSignal.timeout(8500) })
    if (!source.ok || !/^image\/png\b/i.test(source.headers.get('content-type') || '')) {
      return upstreamError
    }
    const data = Buffer.from(await source.arrayBuffer())
    if (data.length < 33 || !data.subarray(0, pngSignature.length).equals(pngSignature)) return upstreamError
    return { status: 200, data }
  } catch {
    return upstreamError
  }
}
