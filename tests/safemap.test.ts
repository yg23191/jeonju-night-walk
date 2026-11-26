import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safemapTile } from '../server/safemap.mjs'
import { wansanBounds } from '../src/wansan.ts'

const bbox = wansanBounds.join(',')
const params = () => new URLSearchParams({ bbox, width: '512', height: '256' })
const fixtureKey = 'fixture/+key='
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/wioAAAAASUVORK5CYII=', 'base64')

test('SafeMap requests the documented transparent crime layer and preserves image bytes', async () => {
  const result = await safemapTile(params(), fixtureKey, async (url: URL, init: RequestInit) => {
    assert.equal(url.origin + url.pathname, 'https://www.safemap.go.kr/openapi2/IF_0087_WMS')
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      serviceKey: fixtureKey, service: 'WMS', request: 'GetMap', version: '1.1.1',
      layers: 'A2SM_CRMNLHSPOT_TOT', styles: 'A2SM_CrmnlHspot_Tot_Tot', srs: 'EPSG:4326',
      bbox, width: '512', height: '256', format: 'image/png', transparent: 'TRUE'
    })
    assert.equal(init.redirect, 'error')
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } })
  })
  assert.deepEqual(result, { status: 200, data: png })
})

test('SafeMap never requests tiles without a key or beyond the Wansan request bounds', async () => {
  let calls = 0
  const request = async () => { calls++; return Response.error() }
  assert.deepEqual(await safemapTile(params(), '', request), { status: 503, code: 'safemap_key_missing' })
  const beyond = params()
  beyond.set('bbox', [wansanBounds[0] - .01, ...wansanBounds.slice(1)].join(','))
  assert.deepEqual(await safemapTile(beyond, fixtureKey, request), { status: 400, code: 'invalid_bounds' })
  const oversized = params()
  oversized.set('width', '2048')
  assert.deepEqual(await safemapTile(oversized, fixtureKey, request), { status: 400, code: 'invalid_bounds' })
  assert.equal(calls, 0)
})

test('SafeMap does not display an error response as an official crime tile', async () => {
  for (const response of [
    Response.json({ message: 'rejected' }, { status: 401 }),
    new Response('<ServiceExceptionReport/>', { headers: { 'Content-Type': 'application/xml' } }),
    new Response('error', { headers: { 'Content-Type': 'image/png' } })
  ]) {
    assert.deepEqual(await safemapTile(params(), fixtureKey, async () => response), {
      status: 502, code: 'safemap_unavailable'
    })
  }
})
