import { cleanLine, fromOffset, validPoint } from './gis.ts'
import type { Point, Polygon } from './gis.ts'

export interface Lamp {
  id: string
  point: Point
  source: string
  height?: number
  intensity?: number
  status?: string
  updatedAt?: string
}

const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
const optionalText = (v: unknown) => typeof v === 'string' ? v.trim() || undefined : undefined

export function loadLamps(input: unknown): Lamp[] {
  const collection = input as { type?: string; features?: unknown[] } | null
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('조명 자료는 GeoJSON FeatureCollection이어야 합니다.')
  }
  const lamps = new Map<string, Lamp>()
  for (const item of collection.features) {
    const feature = item as { geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> } | null
    const props = feature?.properties
    const geometry = feature?.geometry
    const id = optionalText(props?.id), source = optionalText(props?.source)
    if (!id || !source || geometry?.type !== 'Point' || !validPoint(geometry.coordinates)) continue
    const lamp: Lamp = {
      id, point: geometry.coordinates, source,
      height: positive(props?.height_m), intensity: positive(props?.intensity_cd),
      status: optionalText(props?.status), updatedAt: optionalText(props?.updated_at)
    }
    const time = (record: Lamp) => Date.parse(record.updatedAt ?? '') || 0
    const previous = lamps.get(id)
    if (!previous || time(lamp) >= time(previous)) lamps.set(id, lamp)
  }
  return [...lamps.values()]
}

export function loadLine(geometry: { type: string; coordinates: unknown }): Point[] {
  if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    throw new Error('경로는 GeoJSON LineString이어야 합니다.')
  }
  return cleanLine(geometry.coordinates)
}

export const origin: Point = [127.128, 35.812]
export const world = (x: number, y: number) => fromOffset(origin, x, y)
const ring = (pairs: number[][]) => pairs.map(([x, y]) => world(x, y))
export const demoArea: Polygon = [ring([[-355,-245],[320,-245],[355,-200],[355,220],[290,245],[-325,245],[-355,210]])]
export const coverage: Polygon = [ring([[-345,-225],[145,-225],[195,-155],[176,205],[-325,216],[-345,175]])]
export const places = [
  { id: 'park', name: '시연 공원', point: world(-264, -110) },
  { id: 'library', name: '시연 도서관', point: world(215, 108) },
  { id: 'hall', name: '시연 커뮤니티 광장', point: world(-104, 151) }
]

const lampSites = [
  [-269,-110],[-234,-112],[-202,-111],[-132,-108],[-107,-106],[-89,-79],
  [-91,-21],[-91,12],[-33,13],[1,14],[63,14],[110,11],[140,17],
  [-264,-68],[-263,-34],[-261,8],[-261,49],[-258,67],[-208,66],
  [-158,65],[-110,64],[-64,64],[-13,65],[32,65],[85,64],[133,64],
  [-247,152],[-202,152],[-153,152],[-108,152],[-51,150],[0,150]
]
export const lamps = loadLamps({
  type: 'FeatureCollection',
  features: lampSites.map(([x, y], i) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: world(x, y) },
    properties: { id: 'DEMO-' + (i + 1), source: '시연용 가상 데이터', ...(i % 4 === 0 ? {height_m: 6, intensity_cd: 340} : {}) }
  }))
})

