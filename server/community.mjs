import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { reportCell, reportCellKey } from '../src/reportLocations.ts'
import { configuredLampSources, officialLampPositions } from './jeonju-lamps.mjs'
import { safemapTile } from './safemap.mjs'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const publicOrigin = process.env.COMMUNITY_ALLOWED_ORIGIN || 'https://yg23191.github.io'
const port = Number(process.env.PORT || 8787)
const dist = resolve('dist')
const filename = resolve(process.env.COMMUNITY_DB_FILE || '.community/reports.sqlite')
mkdirSync(dirname(filename), { recursive: true })
const db = new DatabaseSync(filename)
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reports (
    submission_id TEXT PRIMARY KEY,
    cell TEXT NOT NULL,
    lng REAL NOT NULL,
    lat REAL NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS reports_by_cell ON reports(cell);
`)
const addReport = db.prepare('INSERT OR IGNORE INTO reports VALUES (?, ?, ?, ?)')
const reportById = db.prepare('SELECT cell FROM reports WHERE submission_id = ?')
const countCell = db.prepare('SELECT count(*) AS count FROM reports WHERE cell = ?')
const groupedReports = db.prepare('SELECT lng, lat, count(*) AS count FROM reports GROUP BY cell')
const safeMapKey = process.env.SAFEMAP_SERVICE_KEY?.trim()
const reportLimits = new Map()
const maxBody = 1024

function reply(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const parts = []
  let size = 0
  for await (const part of req) {
    size += part.length
    if (size > maxBody) return undefined
    parts.push(part)
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { return undefined }
}

function withinSubmitLimit(req) {
  const now = Date.now()
  for (const [address, entry] of reportLimits) {
    if (entry.until <= now) reportLimits.delete(address)
  }
  const address = req.socket.remoteAddress
  const previous = reportLimits.get(address)
  if (previous && previous.count >= 15) return false
  if (!previous) reportLimits.set(address, { count: 1, until: now + 60_000 })
  else previous.count++
  return true
}

async function sendSafemap(url, res) {
  const result = await safemapTile(url.searchParams, safeMapKey)
  if (!result.data) return reply(res, result.status, { code: result.code })
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=180' })
  res.end(result.data)
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8'
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    const origin = req.headers.origin
    const sameHost = origin === 'http://' + req.headers.host || origin === 'https://' + req.headers.host
    if (origin && origin !== publicOrigin && !sameHost) return reply(res, 403, { code: 'origin_denied' })
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
      return res.end()
    }
    if (req.method === 'GET' && url.pathname === '/api/community/settings') {
      return reply(res, 200, { safemap: Boolean(safeMapKey), lamps: configuredLampSources() })
    }
    if (req.method === 'GET' && url.pathname === '/api/community/jeonju-lamps') {
      return reply(res, 200, await officialLampPositions())
    }
    if (req.method === 'GET' && url.pathname === '/api/community/reports') {
      return reply(res, 200, groupedReports.all().map(({ lng, lat, count }) => ({ point: [lng, lat], count })))
    }
    if (req.method === 'POST' && url.pathname === '/api/community/reports') {
      if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return reply(res, 415, { code: 'json_required' })
      if (!withinSubmitLimit(req)) return reply(res, 429, { code: 'too_many_reports' })
      const body = await readJson(req)
      const point = reportCell(body?.point)
      const id = body?.id
      if (!point || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
        return reply(res, 400, { code: 'invalid_report' })
      }
      const cell = reportCellKey(point)
      addReport.run(id, cell, ...point)
      if (reportById.get(id)?.cell !== cell) return reply(res, 409, { code: 'invalid_report' })
      return reply(res, 200, { point, count: countCell.get(cell).count })
    }
    if (req.method === 'GET' && url.pathname === '/api/community/crime-map') return sendSafemap(url, res)
    return reply(res, 404, { code: 'not_found' })
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { code: 'method_not_allowed' })
  const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
  const file = resolve(dist, '.' + name)
  if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) {
    return reply(res, 404, { code: 'not_found' })
  }
  res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream' })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) reply(res, 500, { code: 'server_error' })
    else res.destroy()
  })
}).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Community API listening on port ${port}`))
