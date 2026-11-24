import boundary from './jeonju-boundary.json' with { type: 'json' }
import { containsDisk } from './gis.ts'
import type { Point, Polygon } from './gis.ts'

export const jeonjuBoundary: Polygon = boundary.geometry.coordinates.map(ring =>
  ring.map(([longitude, latitude]): Point => [longitude, latitude]))

export const inJeonju = (point: Point) => containsDisk(point, jeonjuBoundary, 0)
