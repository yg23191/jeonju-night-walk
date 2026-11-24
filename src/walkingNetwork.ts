import { distance, offset } from './gis.ts'
import type { Point } from './gis.ts'

type Edge = readonly [from: number, to: number, direction: number]
export interface WalkingNetwork { nodes: Point[]; edges: Edge[] }
type Neighbor = [id: number, meters: number]
type QueueEntry = [id: number, priority: number]

class PriorityQueue {
  private items: QueueEntry[] = []

  push(entry: QueueEntry) {
    const items = this.items
    let index = items.length
    items.push(entry)
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (items[parent][1] <= entry[1]) break
      items[index] = items[parent]
      index = parent
    }
    items[index] = entry
  }

  pop(): QueueEntry | undefined {
    const items = this.items
    const first = items[0], last = items.pop()
    if (!last || !items.length) return first
    let index = 0
    while (2 * index + 1 < items.length) {
      let child = 2 * index + 1
      if (child + 1 < items.length && items[child + 1][1] < items[child][1]) child++
      if (last[1] <= items[child][1]) break
      items[index] = items[child]
      index = child
    }
    items[index] = last
    return first
  }
}

function snap(point: Point, points: Point[], edges: Edge[]) {
  const local = points.map(p => offset(point, p))
  let best: { edge: Edge; fraction: number; point: Point; meters: number } | undefined
  for (const edge of edges) {
    const [a, b] = edge
    const [ax, ay] = local[a], [bx, by] = local[b]
    const dx = bx - ax, dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    if (!lengthSquared) continue
    const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
    const meters = Math.hypot(ax + fraction * dx, ay + fraction * dy)
    if (meters > 65 || (best && meters >= best.meters)) continue
    const [lng, lat] = points[a], [endLng, endLat] = points[b]
    best = { edge, fraction, meters, point: [lng + fraction * (endLng - lng), lat + fraction * (endLat - lat)] }
  }
  return best
}

export function findWalkingPath(network: WalkingNetwork, from: Point, to: Point) {
  const first = snap(from, network.nodes, network.edges)
  const last = snap(to, network.nodes, network.edges)
  if (!first || !last) return undefined
  const points = [...network.nodes, first.point, last.point]
  const start = points.length - 2, finish = points.length - 1
  const neighbors: Neighbor[][] = points.map(() => [])
  function link(a: number, b: number) {
    neighbors[a].push([b, distance(points[a], points[b])])
  }
  for (const [a,b,direction] of network.edges) {
    if (direction >= 0) link(a,b)
    if (direction <= 0) link(b,a)
  }
  const [firstA, firstB, firstDirection] = first.edge
  const [lastA, lastB, lastDirection] = last.edge
  if (firstDirection <= 0 || first.fraction === 0) link(start, firstA)
  if (firstDirection >= 0 || first.fraction === 1) link(start, firstB)
  if (lastDirection >= 0 || last.fraction === 0) link(lastA, finish)
  if (lastDirection <= 0 || last.fraction === 1) link(lastB, finish)
  if (first.edge === last.edge &&
      ((firstDirection >= 0 && first.fraction <= last.fraction) ||
       (firstDirection <= 0 && first.fraction >= last.fraction))) link(start, finish)

  const totals = points.map(() => Infinity), parents = points.map(() => -1)
  const closed = new Uint8Array(points.length)
  totals[start] = 0
  const queue = new PriorityQueue()
  queue.push([start, 0])
  for (let entry = queue.pop(); entry; entry = queue.pop()) {
    const [id] = entry
    if (closed[id]) continue
    if (id === finish) {
      const line: Point[] = []
      for (let current = finish; current >= 0; current = parents[current]) line.push(points[current])
      return { line: line.reverse(), meters: totals[finish], startOffset: first.meters, endOffset: last.meters }
    }
    closed[id] = 1
    for (const [next, meters] of neighbors[id]) {
      const total = totals[id] + meters
      if (total >= totals[next]) continue
      totals[next] = total
      parents[next] = id
      queue.push([next, total + distance(points[next], points[finish])])
    }
  }
  return undefined
}
