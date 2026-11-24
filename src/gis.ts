export type Point = readonly [longitude: number, latitude: number]
export type Polygon = readonly (readonly Point[])[]
const earth = 6371008.8
const rad = Math.PI / 180

export function distance(a: Point, b: Point) {
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function offset(origin: Point, point: Point): Point {
  return [(point[0] - origin[0]) * rad * earth * Math.cos(origin[1] * rad), (point[1] - origin[1]) * rad * earth]
}

export function fromOffset(origin: Point, x: number, y: number): Point {
  return [origin[0] + x / (rad * earth * Math.cos(origin[1] * rad)), origin[1] + y / (rad * earth)]
}

export function validPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
}

export function cleanLine(points: readonly unknown[]): Point[] {
  if (!points.every(validPoint)) throw new Error('경로의 좌표가 유효하지 않습니다.')
  const line = points.filter((p, i) => i === 0 || distance(points[i - 1], p) > 0)
  if (line.length < 2) throw new Error('경로에는 서로 다른 좌표가 필요합니다.')
  return line
}

export interface Sample { point: Point; meters: number }

export function sampleLine(input: readonly Point[], step = 5) {
  const line = cleanLine(input)
  if (!Number.isFinite(step) || step <= 0) throw new Error('표본 간격이 유효하지 않습니다.')
  const ends = line.map(() => 0)
  for (let i = 1; i < line.length; i++) ends[i] = ends[i - 1] + distance(line[i - 1], line[i])
  const length = ends.at(-1)!
  let segment = 1
  function at(meters: number): Sample {
    while (segment < ends.length - 1 && meters > ends[segment]) segment++
    const fraction = (meters - ends[segment - 1]) / (ends[segment] - ends[segment - 1])
    const [a, b] = [line[segment - 1], line[segment]]
    return { meters, point: [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])] }
  }
  const samples: Sample[] = [{ meters: 0, point: line[0] }]
  const midpoints: Sample[] = []
  for (let meters = step; meters < length; meters += step) {
    midpoints.push(at((samples.at(-1)!.meters + meters) / 2))
    samples.push(at(meters))
  }
  midpoints.push(at((samples.at(-1)!.meters + length) / 2))
  samples.push({ meters: length, point: line.at(-1)! })
  return { samples, midpoints, length }
}

export function containsDisk(point: Point, polygon: Polygon, radius: number) {
  if (!polygon.length || polygon.some(ring => ring.length < 3)) return false
  let inside = false
  for (const ring of polygon) {
    const local = ring.map(p => offset(point, p))
    for (let i = 0, j = local.length - 1; i < local.length; j = i++) {
      const [ax, ay] = local[j]
      const [bx, by] = local[i]
      const dx = bx - ax, dy = by - ay
      const squared = dx * dx + dy * dy
      const t = squared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / squared)) : 0
      if (Math.hypot(ax + t * dx, ay + t * dy) < radius) return false
      if ((ay > 0) !== (by > 0) && ax - ay * dx / dy > 0) inside = !inside
    }
  }
  return inside
}

