import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DemoMap } from './DemoMap.tsx'
import { KakaoMap, hasKakaoKey } from './KakaoMap.tsx'
import { RealLocations } from './RealLocations.tsx'
import type { Locations } from './RealLocations.tsx'
import { coverage, lamps, places } from './data.ts'
import { distance } from './gis.ts'
import { analyze, classify, settings, summarize } from './light.ts'
import type { Estimate } from './light.ts'
import { demoRoutes } from './routes.ts'
import './style.css'

type End = 'from' | 'to'
const meters = (n: number) => new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(n) + ' m'
const lux = (n: number) => n.toFixed(2) + ' lx'
const empty: Estimate[] = []

function App() {
  const [showReal, setShowReal] = useState(hasKakaoKey)
  const [locations, setLocations] = useState<Locations>({})
  const [showKakao, setShowKakao] = useState(false)
  const [ends, setEnds] = useState({ from: '', to: '' })
  const [picking, setPicking] = useState<End>('from')
  const [choice,setChoice] = useState('')
  const [threshold,setThreshold] = useState<number>(settings.threshold)
  const [detail,setDetail] = useState<Estimate>()
  const [notice,setNotice] = useState('')
  const routes = useMemo(() => demoRoutes(ends.from,ends.to),[ends])
  const route = routes.length === 1 ? routes[0] : routes.find(r => r.id === choice)
  const analysis = useMemo(() => route ? analyze(route.line,lamps,coverage) : undefined,[route])
  const summary = useMemo(() => analysis && summarize(analysis,threshold),[analysis,threshold])

  function selectEnd(end: End, id: string) {
    if (id && id === ends[end === 'from' ? 'to' : 'from']) {
      setNotice('출발지와 도착지는 서로 다른 장소를 선택해 주세요.')
      return
    }
    setEnds({...ends,[end]:id})
    setChoice('')
    setDetail(undefined)
    setNotice('')
    if (id && end === 'from' && !ends.to) setPicking('to')
    else if (id && end === 'to' && !ends.from) setPicking('from')
  }

  function example() {
    setEnds({from:'park',to:'library'})
    setChoice('central')
    setDetail(undefined)
    setNotice('')
    setShowKakao(false)
  }

  function download() {
    if (!summary?.segments.length) return
    const lines = ['longitude,latitude,distance_m,estimated_lux,threshold_lux,source', ...summary.segments.map(({candidate}) =>
      [...candidate.point,candidate.meters.toFixed(2),candidate.lux!.toFixed(3),threshold,'시연용 가상 데이터'].join(','))]
    const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}))
    const anchor=document.createElement('a')
    anchor.href=url
    anchor.download='jeonju-demo-field-checks.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url),1000)
  }

  return <>
    <header className="top"><span className="mark" aria-hidden="true">☾</span><div><h1>전주 귀갓길 조도 지도</h1><p>가로등 기반 야간 예상 조도 · 실제 측정값과 다를 수 있음</p></div>{!showReal && <span className="badge">시연용 가상 데이터</span>}</header>
    {hasKakaoKey && <nav className="map-choice mode-choice" aria-label="서비스 모드">
      <button aria-pressed={showReal} onClick={() => setShowReal(true)}>실제 위치 선택</button>
      <button aria-pressed={!showReal} onClick={() => setShowReal(false)}>조도 분석 시연</button>
    </nav>}
    {showReal ? <RealLocations locations={locations} onChange={setLocations} /> : <main>
      <aside className="panel" aria-label="경로 분석 설정">
        <section>
          <div className="section-title"><h2>출발지와 도착지</h2><button className="text-button" onClick={example}>예시 경로</button></div>
          <p className="muted">지도 핀을 누르거나 목록에서 선택하세요.</p>
          {(['from','to'] as const).map(end => <div className="endpoint" key={end}>
            <button className={picking === end ? 'pick active' : 'pick'} aria-pressed={picking === end} onClick={() => {setPicking(end);setNotice('')}}>{end === 'from' ? '출발지' : '도착지'}</button>
            <select aria-label={end === 'from' ? '출발지' : '도착지'} value={ends[end]} onChange={e => selectEnd(end,e.target.value)}>
              <option value="">장소 선택</option>
              {places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}
            </select>
          </div>)}
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
        <section>
          <h2>보행 경로</h2>
          {!ends.from || !ends.to ? <p className="muted">두 장소를 선택하면 등록된 경로를 확인할 수 있습니다.</p> :
            routes.length === 0 ? <p className="notice" role="status">선택한 두 장소 사이에 등록된 시연 보행 경로가 없습니다.</p> :
            <div className="routes" aria-label="경로 선택">{routes.map(r => <button key={r.id} aria-pressed={route === r}
              onClick={() => {setChoice(r.id);setDetail(undefined);setShowKakao(false)}}>
              <span>{r.name}</span><span>{meters(r.line.slice(1).reduce((total,p,i) => total + distance(r.line[i],p),0))}</span>
            </button>)}</div>}
          {routes.length > 1 && !route && <p className="muted">분석할 경로를 선택하세요.</p>}
        </section>
        <section>
          <div className="section-title"><h2><label htmlFor="threshold">저조도 임계값</label></h2><output htmlFor="threshold">{threshold} lx</output></div>
          <input id="threshold" type="range" min="1" max="15" step="1" value={threshold} onChange={e => setThreshold(+e.target.value)}/>
          <div className="range-label"><span>1 lx</span><span>15 lx</span></div>
          <p className="muted">시연용 임시 기준 · 예상 조도가 기준 미만인 표본을 표시합니다.</p>
        </section>
        {summary && <section>
          <div className="section-title"><h2>현장 확인 후보</h2>{summary.segments.length > 0 && <button className="text-button" onClick={download}>CSV 저장</button>}</div>
          {summary.segments.length === 0 ? <p className="muted">현재 임계값에서 확인할 저조도 구간이 없습니다.</p> :
            <div className="routes candidates">{summary.segments.map(({start,end,candidate}) => <button key={start} onClick={() => setDetail(candidate)}>
              <span>{meters(start)} ~ {meters(end)}</span><span>{lux(candidate.lux!)}</span>
            </button>)}</div>}
        </section>}
      </aside>
      <div className="content">
        {hasKakaoKey && <div className="map-choice" aria-label="지도 보기">
          <button aria-pressed={!showKakao} onClick={() => setShowKakao(false)}>가상 분석 지도</button>
          <button aria-pressed={showKakao} onClick={() => setShowKakao(true)}>카카오 배경지도</button>
        </div>}
        {showKakao ? <>
          <KakaoMap from={ends.from} to={ends.to} picking={picking} onPlace={id => selectEnd(picking,id)} />
          <p className="map-note">핀은 시연용 가상 장소입니다. 경로와 조도 결과는 가상 분석 지도에서 확인할 수 있습니다.</p>
        </> : <>
        <DemoMap from={ends.from} to={ends.to} line={route?.line ?? []} estimates={analysis?.samples ?? empty} threshold={threshold}
          selected={detail?.meters} onPlace={id => selectEnd(picking,id)} onSample={setDetail}
          onEmpty={outside => setNotice(outside ? '전주시 대상 시연 범위 밖입니다. 지도에 표시된 장소를 선택해 주세요.' : '지도에 표시된 시연 장소 핀을 선택해 주세요.')}/>
        <div className="legend" aria-label="지도 범례">
          <span><i className="blue"/>보행 경로</span><span><i className="yellow"/>가로등</span>
          <span><i className="red"/>예상 저조도</span><span><i className="gray"/>자료 부족</span>
          <span><i className="coverage"/>조명 조사 범위</span>
        </div>
        {summary && <dl className="stats" aria-live="polite">
          <div><dt>분석 가능 거리</dt><dd>{meters(summary.analyzed)}</dd></div>
          <div><dt>저조도 예상 거리</dt><dd className="low">{meters(summary.low)}</dd></div>
          <div><dt>자료 부족 거리</dt><dd>{meters(summary.unknown)}</dd></div>
        </dl>}
        {detail && <section className="detail" aria-label="선택 지점 상세" aria-live="polite">
          <div className="section-title"><h2>선택 지점 · 출발지부터 {meters(detail.meters)}</h2><button className="text-button" onClick={() => setDetail(undefined)}>닫기</button></div>
          <p>{detail.lux === null ? '자료 부족' : '예상 조도 '+lux(detail.lux)} · 임계값 {threshold} lx · 반경 40 m 등록 가로등 {detail.count}개</p>
          {classify(detail,threshold) === 'unknown' && <p className="muted">반경 40 m의 조사 범위를 확인할 수 없습니다.</p>}
          {detail.lux === 0 && <p className="muted">반경 내 등록 조명 없음 · 모델 계산값 0 lx</p>}
        </section>}
        <details className="model"><summary>조도 모델과 자료 범위</summary><p>경로를 5 m 간격으로 분석합니다. 지면에서 반경 40 m 이내의 가로등 기여를 합산하며, 상태가 미확인인 등은 점등으로 가정합니다. 높이와 광도가 없으면 6 m와 300 cd를 씁니다. 건물·나무 차폐, 배광, 상가 조명, 날씨, 실시간 점등은 반영 범위에 포함되지 않습니다. 지도와 장소, 경로, 조명 및 조사 범위는 모두 시연을 위해 생성했습니다.</p></details>
        </>}
      </div>
    </main>}
  </>
}

createRoot(document.getElementById('root')!).render(<App />)

