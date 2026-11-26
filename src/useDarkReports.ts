import { useEffect, useState } from 'react'
import { connectCommunity, fetchSharedReports, saveDarkReport } from './communityClient.ts'
import type { CommunityMode } from './communityClient.ts'
import type { Point } from './gis.ts'
import { reportCell, reportCellKey } from './reportLocations.ts'
import type { ReportCell } from './reportLocations.ts'

export function useDarkReports() {
  const [mode, setMode] = useState<CommunityMode>('loading')
  const [safemap, setSafemap] = useState(false)
  const [reports, setReports] = useState<ReportCell[]>([])
  const [placing, setPlacing] = useState(false)
  const [pending, setPending] = useState<Point>()
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    connectCommunity(controller.signal).then(state => {
      if (controller.signal.aborted) return
      setMode(state.mode)
      setReports(state.reports)
      setSafemap(state.safemap)
    }).catch(() => {
      if (!controller.signal.aborted) setMode('unavailable')
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (mode !== 'shared') return
    let controller: AbortController | undefined
    function refresh() {
      if (document.hidden || controller) return
      const request = new AbortController()
      controller = request
      fetchSharedReports(request.signal).then(items => {
        if (!request.signal.aborted) setReports(items)
      }).catch(() => {}).finally(() => { controller = undefined })
    }
    const interval = window.setInterval(refresh, 30_000)
    return () => { window.clearInterval(interval); controller?.abort() }
  }, [mode])

  function start() {
    setPlacing(true)
    setNotice('')
  }

  function choose(point: Point) {
    if (saving) return
    const cell = reportCell(point)
    if (!cell) {
      setNotice('완산구 경계 안쪽에서 제보 위치를 선택해 주세요.')
      return
    }
    setPending(cell)
    setNotice('')
  }

  function cancel() {
    if (saving) return
    setPending(undefined)
    setPlacing(false)
    setNotice('')
  }

  async function submit() {
    if (!pending || saving) return
    setSaving(true)
    setNotice('')
    try {
      const item = await saveDarkReport(mode, pending)
      const key = reportCellKey(item.point)
      setReports(items => [...items.filter(other => reportCellKey(other.point) !== key), item])
      setPending(undefined)
      setPlacing(false)
      setNotice(mode === 'shared' ? '시민 제보 지도에 표시했습니다.' : '이 브라우저에 제보 위치를 저장했습니다.')
    } catch (error) {
      setNotice(error instanceof Error && error.message === 'rate_limited' ?
        '제보가 많습니다. 잠시 뒤에 다시 시도해 주세요.' : '제보를 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return { mode, safemap, reports, placing, pending, saving, notice, start, choose, cancel, submit }
}
