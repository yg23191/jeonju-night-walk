import type { Lamp } from './data.ts'
import { cleanLine, sampleLine } from './gis.ts'
import type { Point } from './gis.ts'
import { analyze, classify, settings } from './light.ts'
import { wansanBoundary } from './wansan.ts'

export function simulateRouteLighting(line: Point[]) {
  if (line.length < 2 || line.every(([lng, lat]) => lng === line[0][0] && lat === line[0][1])) return undefined
  const route = cleanLine(line)
  const { samples, length } = sampleLine(route, 10)
  // Leave gaps between clusters so the demonstration shows both lit and dim stretches.
  const sites = length < 30 ? [samples[0]] : samples.filter(({ meters }) => meters % 120 >= 10 && meters % 120 < 55)
  const lamps: Lamp[] = sites.map(({ point }, index) => ({
    id: `route-demo-${index}`, point, source: '경로에 생성한 임의 가로등'
  }))
  const estimates = analyze(route, lamps, wansanBoundary).samples
  return {
    lamps: lamps.map(lamp => lamp.point),
    low: estimates.filter(sample => classify(sample, settings.threshold) === 'low'),
    unknown: estimates.filter(sample => classify(sample, settings.threshold) === 'unknown')
  }
}
