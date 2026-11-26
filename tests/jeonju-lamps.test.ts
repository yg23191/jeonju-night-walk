import assert from 'node:assert/strict'
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { configuredLampSources, fetchLampPositions, officialLampPositions, readLampPage, readSecurityLightSnapshot } from '../server/jeonju-lamps.mjs'

const first = [127.1468, 35.8244]
const second = [127.147983, 35.824229]
const outside = [126.978, 37.566]
const fixtureKey = 'test-key-never-transmitted'

function row(seq: number, point?: number[]) {
  return point ? { seq, posx: point[0], posy: point[1] } : { seq, posx: '', posy: null }
}

function feed(items: object[], totalCount?: number) {
  return Response.json({ header: { resultCode: '00', totalCount, pageSize: 2 }, body: { items } })
}

test('lamp parsing keeps raw row counts separate from usable coordinates', () => {
  const xml = `<rfcOpenApi><header><resultCode>00</resultCode><pageSize>2</pageSize><totalCount>4</totalCount></header>
    <body><item><seq>1</seq><posx>127.1468</posx><posy>35.8244</posy></item><item><seq>2</seq></item></body></rfcOpenApi>`
  const page = readLampPage(xml)
  assert.deepEqual(page.points, [first])
  assert.equal(page.recordCount, 2)
  assert.equal(page.pageSize, 2)
  assert.equal(page.totalCount, 4)
  assert.throws(() => readLampPage(xml.replace('>00<', '>10<')), /did not accept/)
})

test('streetlamp pagination uses the declared page count despite an all-invalid page', async () => {
  const calls: number[] = []
  const result = await fetchLampPositions('street', fixtureKey, async (url: URL) => {
    const page = Number(url.searchParams.get('startPage'))
    calls.push(page)
    assert.equal(url.pathname, '/rest/streetlamp/getStreetlamp')
    assert.equal(url.searchParams.has('gu'), false)
    return feed(page === 1 ? [row(1), row(2)] : [row(3, first), row(4, outside)], 2)
  })
  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(result, [first])
})

test('security-light pagination uses the declared record count and preserves later valid points', async () => {
  const calls: number[] = []
  const pages = [[row(1, first), row(2)], [row(3), row(4)], [row(5, second)]]
  const result = await fetchLampPositions('security', fixtureKey, async (url: URL) => {
    const page = Number(url.searchParams.get('startPage'))
    calls.push(page)
    assert.equal(url.pathname, '/rest/saftylight/getSaftylight')
    assert.equal(url.searchParams.get('gu'), '완산구')
    assert.ok(pages[page - 1], 'should stop after the third page')
    return feed(pages[page - 1], 5)
  })
  assert.deepEqual(calls, [1, 2, 3])
  assert.deepEqual(result, [first, second])
})

test('without count metadata a full page with missing coordinates still advances', async () => {
  const calls: number[] = []
  const result = await fetchLampPositions('street', fixtureKey, async (url: URL) => {
    const page = Number(url.searchParams.get('startPage'))
    calls.push(page)
    return feed(page === 1 ? [row(1, first), row(2)] : [row(3, second)])
  })
  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(result, [first, second])
})

test('actual repeated pages fail instead of caching incomplete positions', async () => {
  await assert.rejects(fetchLampPositions('security', fixtureKey, async () =>
    feed([row(1, first), row(2)], 4)), /repeated a data page/)
})

test('a failed provider request is retried and only a successful result is shared from cache', async t => {
  const previousStreet = process.env.JEONJU_STREETLAMP_API_KEY
  const previousSecurity = process.env.JEONJU_SECURITY_LIGHT_API_KEY
  t.after(() => {
    if (previousStreet === undefined) delete process.env.JEONJU_STREETLAMP_API_KEY
    else process.env.JEONJU_STREETLAMP_API_KEY = previousStreet
    if (previousSecurity === undefined) delete process.env.JEONJU_SECURITY_LIGHT_API_KEY
    else process.env.JEONJU_SECURITY_LIGHT_API_KEY = previousSecurity
  })
  process.env.JEONJU_STREETLAMP_API_KEY = fixtureKey
  delete process.env.JEONJU_SECURITY_LIGHT_API_KEY
  const request = t.mock.method(globalThis, 'fetch')
  request.mock.mockImplementationOnce(async () => Response.error())
  request.mock.mockImplementation(async () => feed([row(1, first)], 1))

  assert.deepEqual(await officialLampPositions(), [{ type: 'street', error: true }])
  assert.deepEqual(await officialLampPositions(), [{ type: 'street', points: [first] }])
  assert.deepEqual(await officialLampPositions(), [{ type: 'street', points: [first] }])
  assert.equal(request.mock.callCount(), 2)
})

test('the dated local security-light file is usable without credentials and returns only unique Wansan points', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'wansan-lamps-'))
  const file = join(dir, 'security.json')
  const previous = new Map(['JEONJU_STREETLAMP_API_KEY', 'JEONJU_SECURITY_LIGHT_API_KEY', 'JEONJU_SECURITY_LIGHT_SNAPSHOT_FILE']
    .map(name => [name, process.env[name]]))
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    unlinkSync(file)
    rmdirSync(dir)
  })
  writeFileSync(file, JSON.stringify({ asOf: '2025-02-10', points: [outside, first, first, [0, 0], second] }))
  delete process.env.JEONJU_STREETLAMP_API_KEY
  delete process.env.JEONJU_SECURITY_LIGHT_API_KEY
  process.env.JEONJU_SECURITY_LIGHT_SNAPSHOT_FILE = file
  assert.deepEqual(configuredLampSources(), ['security'])
  assert.deepEqual(readSecurityLightSnapshot(file), { type: 'security', asOf: '2025-02-10', points: [first, second] })
  assert.deepEqual(await officialLampPositions(), [{ type: 'security', asOf: '2025-02-10', points: [first, second] }])
})
