import type { Point, Polygon } from './gis.ts'

export type Bounds = readonly [west: number, south: number, east: number, north: number]
export type Building = readonly [bounds: Bounds, geometry: Polygon[]]
export type Place = readonly [name: string, category: string, location: Point]

export function readLocationData<T>(file: string): Promise<T> {
  return fetch(import.meta.env.BASE_URL + 'data/' + file).then(response => {
    if (!response.ok) throw new Error('Location data unavailable')
    return response.json() as Promise<T>
  })
}
