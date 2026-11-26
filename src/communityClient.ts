import { reportCell, reportCellKey } from './reportLocations.ts'
import type { ReportCell } from './reportLocations.ts'
import type { Point } from './gis.ts'

const configuredApi = import.meta.env.VITE_COMMUNITY_API_URL?.trim().replace(/\/+$/, '')
const api = (path: string) => (configuredApi || '') + '/api/community/' + path
const localKey = 'wansan-dark-reports-v1'
const idsKey = 'wansan-dark-report-ids-v1'

export type CommunityMode = 'loading' | 'shared' | 'local' | 'unavailable'
export type LampSource = 'street' | 'security'
export type OfficialLamps = { type: LampSource; points?: Point[]; error?: boolean }

function readStored<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

function localReports(): ReportCell[] {
  return readStored<Point[]>(localKey, []).filter(point => reportCell(point)).map(point => ({ point, count: 1 }))
}

export async function connectCommunity(signal: AbortSignal) {
  try {
    const response = await fetch(api('settings'), { signal, cache: 'no-store' })
    if (!response.ok) throw new Error('Community API unavailable')
    const settings = await response.json()
    if (typeof settings.safemap !== 'boolean') throw new Error('Community settings unavailable')
    const reports = await fetchSharedReports(signal)
    const lamps: LampSource[] = Array.isArray(settings.lamps)
      ? settings.lamps.filter((value: unknown) => value === 'street' || value === 'security') : []
    return { mode: 'shared' as const, reports, safemap: settings.safemap, lamps }
  } catch (error) {
    if (signal.aborted || configuredApi) throw error
    return { mode: 'local' as const, reports: localReports(), safemap: false, lamps: [] }
  }
}

export async function fetchOfficialLamps(signal: AbortSignal): Promise<OfficialLamps[]> {
  const result = await fetch(api('jeonju-lamps'), { signal })
  if (!result.ok) throw new Error('Official public lights unavailable')
  return result.json()
}

export async function fetchSharedReports(signal: AbortSignal): Promise<ReportCell[]> {
  const response = await fetch(api('reports'), { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('Report list unavailable')
  return response.json()
}

export async function saveDarkReport(mode: CommunityMode, point: Point): Promise<ReportCell> {
  const cell = reportCellKey(point)
  if (mode === 'local') {
    const existing = localReports()
    if (!existing.some(item => reportCellKey(item.point) === cell)) {
      localStorage.setItem(localKey, JSON.stringify([...existing.map(item => item.point), point]))
    }
    return { point, count: 1 }
  }
  if (mode !== 'shared') throw new Error('Report service unavailable')
  const ids = readStored<Record<string, string>>(idsKey, {})
  const id = ids[cell] || crypto.randomUUID()
  localStorage.setItem(idsKey, JSON.stringify({ ...ids, [cell]: id }))
  const response = await fetch(api('reports'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, point }),
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error(response.status === 429 ? 'rate_limited' : 'Report save failed')
  return response.json()
}

export async function getCrimeImage(bounds: readonly number[], width: number, height: number, signal: AbortSignal) {
  const query = new URLSearchParams({ bbox: bounds.join(','), width: String(width), height: String(height) })
  const response = await fetch(api('crime-map') + '?' + query, { signal })
  if (!response.ok) throw new Error('SafeMap unavailable')
  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
