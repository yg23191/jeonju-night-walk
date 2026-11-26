import { distance } from './gis.ts'
import type { Point, Polygon } from './gis.ts'

export type Bounds = readonly [west: number, south: number, east: number, north: number]
export type Building = readonly [bounds: Bounds, geometry: Polygon[]]
export type Place = readonly [name: string, category: string, location: Point]

export function placeLabel(point: Point, places: Place[], selectedName?: string) {
  if (selectedName) return selectedName
  let match: string | undefined
  let closest = 55
  for (const [name, , location] of places) {
    const gap = distance(point, location)
    if (gap < closest) {
      match = name
      closest = gap
    }
  }
  return match ? (closest <= 1 ? match : `${match} 인근`) : '이름이 등록되지 않은 지점'
}

export function readLocationData<T>(file: string): Promise<T> {
  return fetch(import.meta.env.BASE_URL + 'data/' + file).then(response => {
    if (!response.ok) throw new Error('Location data unavailable')
    return response.json() as Promise<T>
  })
}
