import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { fieldCsv, readFieldCsv } from './fieldMeasurements.ts'
import type { FieldSite } from './fieldMeasurements.ts'
import type { Point } from './gis.ts'
import type { useFieldMeasurements } from './useFieldMeasurements.ts'

export const fieldLabels: Record<FieldSite['status'], string> = {
  dark: '실측 저조도 확인', above: '실측 기준 이상', review: '실측 검토 중'
}

const seoulTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
})
const sensorDirections = ['수평·위쪽', '수직·진행 방향', '수직·반대 방향']

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface Props {
  field: ReturnType<typeof useFieldMeasurements>
  active: boolean
  visible: boolean
  onVisible: (value: boolean) => void
  pending?: { point: Point; label: string; site?: FieldSite }
  onStart: () => void
  onCancel: () => void
  onSaved: (id: string) => void
  onSite: (site: FieldSite) => void
  titleFor: (site: FieldSite) => string
}

export function FieldPanel({ field, active, visible, onVisible, pending, onStart, onCancel, onSaved, onSite, titleFor }: Props) {
  const [message, setMessage] = useState('')
  const [confirmRemove, setConfirmRemove] = useState('')
  const previousDirection = pending?.site?.direction || sensorDirections[0]
  const directions = sensorDirections.includes(previousDirection) ? sensorDirections : [...sensorDirections, previousDirection]

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pending) return
    const data = new FormData(event.currentTarget)
    const id = String(data.get('id')).trim()
    const siteName = String(data.get('siteName')).trim()
    const lux = data.getAll('lux').map(String).filter(value => value.trim() !== '').map(Number)
    if (!lux.length) {
      setMessage('조도 측정값을 한 개 이상 입력해 주세요.')
      return
    }
    const measuredAt = String(data.get('time')) + '+09:00'
    try {
      const old = field.readings.filter(row => row.id === id && Date.parse(row.measuredAt) === Date.parse(measuredAt))
      const maxRepeat = Math.max(0, ...old.map(row => row.repeat))
      field.store(lux.map((value, index) => ({
        id, siteName, point: pending.point, lux: value, measuredAt,
        heightM: Number(data.get('height')), direction: String(data.get('direction')), repeat: maxRepeat + index + 1
      })))
      onSaved(id)
      setMessage(`${lux.length}회 실측값을 저장했습니다.`)
    } catch (error) { setMessage((error as Error).message) }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('CSV를 2 MB 이하로 나눠서 가져오세요.')
      const imported = readFieldCsv(await file.text())
      field.store(imported)
      onVisible(true)
      setMessage(`CSV 측정값 ${imported.length}행을 가져왔습니다.`)
    } catch (error) { setMessage((error as Error).message) }
  }

  return <section aria-label="현장 실측">
    <div className="section-title"><h2>현장 실측</h2><output>{field.sites.length}곳</output></div>
    <p className="muted">등록한 측정값은 이 브라우저에 보관됩니다.</p>
    {field.storageIssue && <p className="notice" role="alert">{field.storageIssue}</p>}
    <p className="muted">현재 판정 · 중앙값 {field.rules.threshold} lx 미만 · 최소 {field.rules.minReadings}회</p>
    <div className="layer-controls">
      <label><input type="checkbox" checked={visible} onChange={event => onVisible(event.target.checked)} />실측 지점 표시</label>
    </div>
    <button className="pick" onClick={() => { setMessage(''); if (active) onCancel(); else onStart() }}>{active ? '실측 선택 취소' : '실측 지점 찍기'}</button>
    {pending && <form className="field-form" key={pending.site?.id ?? pending.point.join(',')} onSubmit={save}>
      <strong>{pending.label}</strong>
      <label>지점 ID<input required name="id" maxLength={64} readOnly={Boolean(pending.site)}
        defaultValue={pending.site?.id ?? `WS-${Math.round(pending.point[0] * 100000)}-${Math.round(pending.point[1] * 100000)}`} /></label>
      <label>지점 이름 · 선택<input name="siteName" maxLength={80} defaultValue={pending.site?.siteName ?? ''}
        placeholder="예시 경기전 서쪽 보행로" /></label>
      <label>측정 시각 · 한국시간<input required type="datetime-local" name="time" step="1" defaultValue={seoulTime.format(new Date()).replace(' ', 'T')} /></label>
      <fieldset><legend>반복 측정값 · lx</legend>
        {[1, 2, 3].map(i => <input key={i} aria-label={`${i}회 측정값`} type="number" name="lux" min="0" max="200000" step="any" placeholder={i + '회'} />)}
      </fieldset>
      <label>센서 높이 · m<input required type="number" name="height" defaultValue={pending.site?.heightM ?? 1} min="0" max="50" step="any" /></label>
      <label>센서 방향<select name="direction" defaultValue={previousDirection}>
        {directions.map(direction => <option key={direction}>{direction}</option>)}
      </select></label>
      <button className="pick active" type="submit">실측값 저장</button>
    </form>}
    <details className="field-options">
      <summary>판정 기준과 CSV</summary>
      <div className="field-form">
        <div className="section-title"><label htmlFor="field-threshold">저조도 임계값</label><output>{field.rules.threshold} lx</output></div>
        <input id="field-threshold" type="range" min="1" max="15" step="1" value={field.rules.threshold}
          onChange={e => field.changeRules({ ...field.rules, threshold: Number(e.target.value) })} />
        <label>최소 반복 횟수<select value={field.rules.minReadings} onChange={e =>
          field.changeRules({ ...field.rules, minReadings: Number(e.target.value) })}>
          <option value={1}>1회</option><option value={2}>2회</option><option value={3}>3회</option>
        </select></label>
        <p className="muted">마지막 측정 시각부터 15분 이내에 같은 높이와 방향으로 잰 값의 중앙값이 기준 미만이면 저조도로 표시합니다.</p>
        <label>CSV 가져오기<input type="file" accept=".csv,text/csv" onChange={upload} /></label>
        <div className="section-title">
          <button className="text-button" onClick={() => download('wansan-field-template.csv', fieldCsv([]))}>빈 양식 받기</button>
          <button className="text-button" disabled={!field.readings.length}
            onClick={() => download('wansan-field-readings.csv', fieldCsv(field.readings))}>실측값 내보내기</button>
        </div>
      </div>
    </details>
    {field.sites.length > 0 && <div className="routes location-results" aria-label="저장된 실측 지점">
      {field.sites.map(site => <div key={site.id} className="field-site-row">
        <button onClick={() => onSite(site)}><span>{titleFor(site)}</span><span>{site.median.toFixed(2)} lx</span></button>
        {confirmRemove === site.id ? <div className="section-title"><span className="muted">이 지점의 실측값 삭제?</span>
          <button className="text-button" onClick={() => setConfirmRemove('')}>취소</button>
          <button className="text-button" onClick={() => {
            try { field.removeSite(site.id); setConfirmRemove(''); setMessage('지점의 실측값을 삭제했습니다.') }
            catch (error) { setMessage((error as Error).message) }
          }}>삭제 확인</button></div> :
          <button className="text-button" onClick={() => setConfirmRemove(site.id)}>지점 삭제</button>}
      </div>)}
    </div>}
    {message && <p className="notice" role="status">{message}</p>}
  </section>
}
