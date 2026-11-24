import { loadLine, places, world } from './data.ts'
import type { Point } from './gis.ts'

export interface WalkingRoute { id: string; name: string; line: Point[] }
const [park, library, hall] = places
const route = (id: string, name: string, from: Point, via: number[][], to: Point): WalkingRoute => ({
  id, name, line: loadLine({type: 'LineString', coordinates: [from, ...via.map(([x,y]) => world(x,y)), to]})
})

const registry = [
  {from: park.id, to: library.id, routes: [
    route('central', '중앙 골목길', park.point, [[-90,-110],[-90,12],[123,12],[155,43],[155,108]], library.point),
    route('north', '북쪽 산책로', park.point, [[-261,64],[123,64],[155,95],[155,108]], library.point)
  ]},
  {from: park.id, to: hall.id, routes: [
    route('plaza', '광장 방면 보행로', park.point, [[-261,64],[-261,151]], hall.point)
  ]}
]

export function demoRoutes(from: string, to: string): WalkingRoute[] {
  const forward = registry.find(pair => pair.from === from && pair.to === to)
  if (forward) return forward.routes
  const backward = registry.find(pair => pair.from === to && pair.to === from)
  return backward?.routes.map(r => ({ ...r, line: [...r.line].reverse() })) ?? []
}

