import { containsDisk, distance, sampleLine } from './gis.ts'
import type { Point, Polygon, Sample } from './gis.ts'
import type { Lamp } from './data.ts'

export const settings = { spacing: 5, radius: 40, height: 6, intensity: 300, threshold: 5 }
export const lampActive = (lamp: Lamp) => !['off', 'broken', 'outage', 'inactive', '소등', '고장'].includes(lamp.status?.toLowerCase() ?? '')

export interface Estimate extends Sample { lux: number | null; count: number }

export function estimate(sample: Sample, lamps: readonly Lamp[], coverage: Polygon): Estimate {
  let lux = 0, count = 0
  for (const lamp of lamps) {
    if (!lampActive(lamp)) continue
    const d = distance(sample.point, lamp.point)
    if (d > settings.radius) continue
    const h = lamp.height ?? settings.height
    const i = lamp.intensity ?? settings.intensity
    lux += i * h / (d * d + h * h) ** 1.5
    count++
  }
  return { ...sample, lux: containsDisk(sample.point, coverage, settings.radius) ? lux : null, count }
}

export function analyze(line: Point[], lamps: Lamp[], coverage: Polygon) {
  const { samples, midpoints, length } = sampleLine(line, settings.spacing)
  return { samples: samples.map(p => estimate(p, lamps, coverage)), midpoints: midpoints.map(p => estimate(p, lamps, coverage)), length }
}

export function classify(sample: Estimate, threshold: number) {
  if (sample.lux === null) return 'unknown'
  return sample.lux < threshold ? 'low' : 'lit'
}

export function summarize(analysis: ReturnType<typeof analyze>, threshold: number) {
  let analyzed = 0, low = 0, unknown = 0
  const segments: { start: number; end: number; candidate: Estimate }[] = []
  let current: (typeof segments)[number] | undefined
  analysis.midpoints.forEach((midpoint, i) => {
    const start = analysis.samples[i].meters, end = analysis.samples[i + 1].meters
    const type = classify(midpoint, threshold)
    if (type === 'unknown') unknown += end - start
    else analyzed += end - start
    if (type !== 'low') {
      current = undefined
      return
    }
    low += end - start
    const candidate = [midpoint, analysis.samples[i], analysis.samples[i + 1]].reduce((best, p) =>
      p.lux !== null && p.lux < best.lux! ? p : best)
    if (!current) {
      current = {start, end, candidate}
      segments.push(current)
    } else {
      current.end = end
      if (candidate.lux! < current.candidate.lux!) current.candidate = candidate
    }
  })
  return { analyzed, low, unknown, segments: segments.sort((a,b) => a.candidate.lux! - b.candidate.lux!) }
}

