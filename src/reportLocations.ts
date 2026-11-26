import { validPoint } from './gis.ts'
import type { Point } from './gis.ts'
import { inWansan } from './wansan.ts'

export interface ReportCell { point: Point; count: number }

// Publish coarse coordinates (roughly 18 by 22 m in Wansan), never the original click.
const scale = 5000
export function reportCell(input: unknown): Point | undefined {
  if (!validPoint(input) || !inWansan(input)) return undefined
  const point: Point = [Math.round(input[0] * scale) / scale, Math.round(input[1] * scale) / scale]
  return inWansan(point) ? point : undefined
}

export const reportCellKey = ([lng, lat]: Point) => `${Math.round(lng * scale)},${Math.round(lat * scale)}`
