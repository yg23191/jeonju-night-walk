import boundary from './wansan-boundary.json' with { type: 'json' }
import { containsDisk } from './gis.ts'
import type { Point, Polygon } from './gis.ts'

export const wansanBoundary: Polygon = boundary.geometry.coordinates.map(ring =>
  ring.map(([longitude, latitude]): Point => [longitude, latitude]))

export const inWansan = (point: Point) => containsDisk(point, wansanBoundary, 0)
