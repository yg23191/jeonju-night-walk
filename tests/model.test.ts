import assert from 'node:assert/strict'
import test from 'node:test'
import { coverage, lamps, loadLamps, world } from '../src/data.ts'
import { containsDisk, distance, sampleLine } from '../src/gis.ts'
import { analyze, classify, estimate, summarize } from '../src/light.ts'
import { demoRoutes } from '../src/routes.ts'

test('5 m sampling follows a bend and includes both exact endpoints', () => {
  const a = world(-120, 0), b = world(-108, 0), c = world(-108, 11)
  const { samples, midpoints, length } = sampleLine([a,a,b,c])
  assert.deepEqual(samples[0].point,a)
  assert.deepEqual(samples.at(-1)?.point,c)
  assert.deepEqual(samples.slice(0,-1).map(p => p.meters),[0,5,10,15,20])
  assert.equal(samples[3].point[0],b[0])
  assert.ok(length > 22.9 && length < 23.1)
  assert.equal(midpoints.length,samples.length-1)
  assert.ok(distance(samples[3].point,b) < 3.1)
})

test('a 300 cd lamp at 6 m gives 8.33 lx directly below and less farther away', () => {
  const point = world(0,0), lamp = {id:'a',source:'test',point}
  const near = estimate({point,meters:0},[lamp],coverage)
  const far = estimate({point:world(15,0),meters:15},[lamp],coverage)
  assert.ok(Math.abs(near.lux! - 8.33333333) < 0.000001)
  assert.ok(far.lux! > 0 && far.lux! < near.lux!)
})

test('coverage is checked for the full disk and zero-lamp samples are distinct', () => {
  const point = world(0,0), edge = world(150,0)
  assert.ok(containsDisk(edge,coverage,0))
  assert.equal(containsDisk(edge,coverage,40),false)
  assert.equal(estimate({point:edge,meters:0},[],coverage).lux,null)
  assert.deepEqual(estimate({point,meters:0},[],coverage),{point,meters:0,lux:0,count:0})
  assert.equal(estimate({point,meters:0},[{id:'a',source:'test',point,status:'broken'}],coverage).count,0)
})

test('strict threshold changes classification without recalculating estimates', () => {
  const sample = {point:world(0,0),meters:0,lux:5,count:1}
  assert.equal(classify(sample,5),'lit')
  assert.equal(classify(sample,6),'low')
  assert.equal(classify({...sample,lux:null},6),'unknown')
})

test('route summaries partition the distance, keep the tail and change by threshold', () => {
  const routes = demoRoutes('park','library')
  const first = analyze(routes[0].line,lamps,coverage)
  const second = analyze(routes[1].line,lamps,coverage)
  const summary = summarize(first,5)
  assert.ok(summary.low > 0 && summary.unknown > 0)
  assert.ok(Math.abs(summary.analyzed + summary.unknown - first.length) < 1e-6)
  assert.ok(summarize(first,12).low >= summary.low)
  assert.notDeepEqual(first.samples,second.samples)
  assert.deepEqual(demoRoutes('library','park')[0].line,[...routes[0].line].reverse())
  assert.equal(demoRoutes('park','hall').length,1)
  assert.equal(demoRoutes('library','hall').length,0)
})

test('lamp loader keeps latest valid record and discards malformed coordinates', () => {
  const feature = (point: unknown, updated_at: string) => ({
    geometry: {type:'Point',coordinates:point}, properties: {id:'a',source:'test',updated_at}
  })
  const [lamp] = loadLamps({type:'FeatureCollection',features:[
    feature(world(0,0),'2025-01-01'),feature(world(10,0),'2024-01-01'),feature([300,0],'2026-01-01')
  ]})
  assert.deepEqual(lamp.point,world(0,0))
})

