import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { coverage, lamps, loadLamps, world } from '../src/data.ts'
import { containsDisk, distance, sampleLine } from '../src/gis.ts'
import { analyze, classify, estimate, summarize } from '../src/light.ts'
import { demoRoutes } from '../src/routes.ts'
import { inWansan } from '../src/wansan.ts'
import { findWalkingPath } from '../src/walkingNetwork.ts'
import { simulateRouteLighting } from '../src/routeLighting.ts'
import { placeLabel } from '../src/locationData.ts'
import { reportCell, reportCellKey } from '../src/reportLocations.ts'
import { defaultFieldRules, fieldCsv, mergeFieldReadings, readFieldCsv, summarizeFieldReadings } from '../src/fieldMeasurements.ts'

test('field readings use the median of the latest comparable repeats and round-trip through CSV', () => {
  const csv = `id,longitude,latitude,lux,measured_at,height_m,direction,repeat_no
WS-01,127.1468,35.8244,1.5,2026-11-26T20:00:00+09:00,1,수평·위쪽,1
WS-01,127.1468,35.8244,4,2026-11-26T20:00:00+09:00,1,수평·위쪽,2
WS-01,127.1468,35.8244,8,2026-11-26T20:00:00+09:00,1,수평·위쪽,3
WS-01,127.1468,35.8244,80,2026-11-26T19:00:00+09:00,1,수평·위쪽,1`
  const readings = readFieldCsv(csv)
  assert.deepEqual(readFieldCsv(fieldCsv(readings)),readings)
  assert.equal(mergeFieldReadings(readings,readings).length,4)
  const [site] = summarizeFieldReadings(readings,defaultFieldRules)
  assert.equal(site.median,4)
  assert.equal(site.count,3)
  assert.equal(site.status,'dark')
  assert.equal(summarizeFieldReadings(readings,{threshold:4,minReadings:3})[0].status,'above')
  assert.equal(summarizeFieldReadings(readings.slice(0,2),defaultFieldRules)[0].status,'review')
  assert.throws(() => readFieldCsv(csv.replace('127.1468','126.978')),/완산구/)
  assert.throws(() => readFieldCsv(csv.replace('2026-11-26','2099-11-26')),/측정 시각/)
  assert.throws(() => readFieldCsv(csv.replace('2026-11-26','2026-04-31')),/측정 시각/)
  assert.throws(() => readFieldCsv(csv + ',extra'),/열 개수/)

  const corrected = { ...readings[0], lux: 9 }
  assert.throws(() => mergeFieldReadings(readings,[corrected]),/이미 저장된 측정/)
  assert.equal(summarizeFieldReadings(readings,defaultFieldRules)[0].median,4)

  const formulaFields = [{...readings[0], id: '=WS-01', direction: "'+위쪽"}]
  const backup = fieldCsv(formulaFields)
  assert.ok(backup.includes("'=WS-01"))
  assert.deepEqual(readFieldCsv(backup),formulaFields)

  const mixed = [...readings, {...readings[0], direction:'수직·진행 방향', repeat:4}]
  const [review] = summarizeFieldReadings(mixed,defaultFieldRules)
  assert.equal(review.status,'review')
  assert.match(review.reviewReason!,/서로 다른 센서 조건/)
  assert.deepEqual(summarizeFieldReadings([...mixed].reverse(),defaultFieldRules),[review])
})


test('public report cells are coarse, consistent and limited to Wansan', () => {
  const a = reportCell([127.14682,35.82430])
  const b = reportCell([127.14681,35.82432])
  assert.ok(a && b)
  assert.equal(reportCellKey(a),reportCellKey(b))
  assert.deepEqual(reportCell(a),a)
  assert.equal(reportCell([127.161,35.849]),undefined)
  assert.equal(reportCell([127.1468,'35.8244']),undefined)
})

test('endpoint labels prefer the selected name and identify nearby public places', () => {
  const place = [['전주시청','government',[127.1468,35.8244]]] as const
  assert.equal(placeLabel([127.1468,35.8244],[...place]),'전주시청')
  assert.equal(placeLabel([127.1469,35.8244],[...place]),'전주시청 인근')
  assert.equal(placeLabel([127.1469,35.8244],[...place],'선택한 장소'),'선택한 장소')
  assert.equal(placeLabel([127.131,35.81],[...place]),'이름이 등록되지 않은 지점')
})

test('actual point selection is limited to Wansan-gu', () => {
  assert.equal(inWansan([127.148, 35.824]), true)
  assert.equal(inWansan([127.161, 35.849]), false)
  assert.equal(inWansan([126.978, 37.566]), false)
})

test('the example can be routed through the Wansan-gu walking network', () => {
  const network = JSON.parse(readFileSync(new URL('../public/data/wansan-walking.json', import.meta.url), 'utf8'))
  const route = findWalkingPath(network,[127.147983,35.824229],[127.149739,35.815119])
  assert.ok(route && route.meters > 800 && route.line.length > 3)
  assert.ok(route.line.every(inWansan))
  const lighting = simulateRouteLighting(route.line)
  assert.ok(lighting && lighting.lamps.length > 0 && lighting.low.length > 0)
  assert.ok(lighting.low.every(sample => sample.lux !== null && sample.lux < 5 && inWansan(sample.point)))
  assert.ok(lighting.lamps.every(inWansan))
  assert.ok(lighting.lowMeters > 0 && lighting.lowMeters < route.meters)
  assert.ok(lighting.segments.every(segment => segment.end > segment.start && segment.line.length >= 2))
  assert.ok(Math.abs(lighting.segments.reduce((total, segment) => total + segment.end - segment.start, 0) - lighting.lowMeters) < 1e-6)
  assert.equal(simulateRouteLighting([route.line[0], route.line[0]]), undefined)
  assert.equal(findWalkingPath(network,[126.978,37.566],[127.15015,35.81613]),undefined)
})

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

