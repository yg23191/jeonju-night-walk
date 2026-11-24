import type { Lamp } from './data.ts'
import { cleanLine, distance, sampleLine } from './gis.ts'
import type { Point } from './gis.ts'
import { analyze, classify, settings, summarize } from './light.ts'
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
  const analysis = analyze(route, lamps, wansanBoundary)
  const summary = summarize(analysis, settings.threshold)
  const samplePoints = new Map(analysis.samples.map(sample => [sample.meters, sample.point]))
  let traversed = 0
  const vertices = route.map((point, index) => {
    if (index > 0) traversed += distance(route[index - 1], point)
    return { point, meters: traversed }
  })
  const segments = summary.segments.map(segment => ({
    ...segment,
    line: [
      samplePoints.get(segment.start)!,
      ...vertices.filter(({ meters }) => meters > segment.start && meters < segment.end).map(({ point }) => point),
      samplePoints.get(segment.end)!
    ]
  }))
  return {
    lamps: lamps.map(lamp => lamp.point),
    low: analysis.samples.filter(sample => classify(sample, settings.threshold) === 'low'),
    unknown: analysis.samples.filter(sample => classify(sample, settings.threshold) === 'unknown'),
    lowMeters: summary.low,
    segments
  }
}

export type RouteLighting = NonNullable<ReturnType<typeof simulateRouteLighting>>
