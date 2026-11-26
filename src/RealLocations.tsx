import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { loadKakaoMap } from './KakaoMap.tsx'
import { distance } from './gis.ts'
import type { Point } from './gis.ts'
import { LocationLayer, LOW_POINT_LEVEL, pickDarkReport, pickFieldSite, pickLowLight } from './LocationLayer.tsx'
import type { MapInstance } from './LocationLayer.tsx'
import { placeLabel, readLocationData } from './locationData.ts'
import type { Building, Place } from './locationData.ts'
import { inWansan, wansanBoundary } from './wansan.ts'
import { findWalkingPath } from './walkingNetwork.ts'
import type { WalkingNetwork } from './walkingNetwork.ts'
import { simulateRouteLighting } from './routeLighting.ts'
import { settings } from './light.ts'
import type { Estimate } from './light.ts'
import { useDarkReports } from './useDarkReports.ts'
import { useCrimeMap } from './useCrimeMap.ts'
import type { ReportCell } from './reportLocations.ts'
import { FieldPanel, fieldLabels } from './FieldPanel.tsx'
import { useFieldMeasurements } from './useFieldMeasurements.ts'
import type { FieldSite } from './fieldMeasurements.ts'
import { fetchOfficialLamps } from './communityClient.ts'
import type { OfficialLamps } from './communityClient.ts'

type End = 'from' | 'to'
type SelectedLocation = { point: Point; name?: string }
export type Locations = Partial<Record<End, SelectedLocation>>
const ends = ['from', 'to'] as const
const names = { from: '출발지', to: '도착지' }
const emptyBuildings: Building[] = []
const emptyPlaces: Place[] = []
const example: Locations = {
  from: { point: [127.147983,35.824229], name: '전주시청' },
  to: { point: [127.149739,35.815119], name: '경기전' }
}
const formatCount = (count: number) => count.toLocaleString('ko-KR')
const meters = (value: number) => `${formatCount(Math.round(value))} m`

interface Props {
  locations: Locations
  onChange: (locations: Locations) => void
}

export function RealLocations({ locations, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const fieldSection = useRef<HTMLDivElement>(null)
  const fieldLocationRequest = useRef(0)
  const [picking, setPicking] = useState<End>(locations.from && !locations.to ? 'to' : 'from')
  const [editing, setEditing] = useState(!locations.from || !locations.to)
  const [pointDetail, setPointDetail] = useState<Estimate>()
  const [reportDetail, setReportDetail] = useState<ReportCell>()
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [instance, setInstance] = useState<MapInstance>()
  const [buildings, setBuildings] = useState<Building[]>()
  const [places, setPlaces] = useState<Place[]>()
  const [network, setNetwork] = useState<WalkingNetwork>()
  const [dataErrors, setDataErrors] = useState<string[]>([])
  const [showBuildings, setShowBuildings] = useState(true)
  const [showPlaces, setShowPlaces] = useState(false)
  const [showCrime, setShowCrime] = useState(false)
  const [showReports, setShowReports] = useState(true)
  const [showLighting, setShowLighting] = useState(true)
  const [showPublicLamps, setShowPublicLamps] = useState(false)
  const [publicLamps, setPublicLamps] = useState<Point[]>()
  const [showOfficialLamps, setShowOfficialLamps] = useState(false)
  const [officialLamps, setOfficialLamps] = useState<OfficialLamps[]>()
  const [lampError, setLampError] = useState(false)
  const [showField, setShowField] = useState(true)
  const [fieldPicking, setFieldPicking] = useState(false)
  const [fieldPending, setFieldPending] = useState<{ point: Point; site?: FieldSite }>()
  const [fieldSelected, setFieldSelected] = useState('')
  const [fieldLocation, setFieldLocation] = useState<Point>()
  const [fieldLocationNotice, setFieldLocationNotice] = useState('')
  const [locatingField, setLocatingField] = useState(false)
  const [query, setQuery] = useState('')
  const reports = useDarkReports()
  const field = useFieldMeasurements()
  const fieldDetail = showField ? field.sites.find(site => site.id === fieldSelected) : undefined
  const activeLamps = useMemo(() => [
    ...(showPublicLamps ? publicLamps ?? [] : []),
    ...(showOfficialLamps ? (officialLamps ?? []).flatMap(source => source.points ?? []) : [])
  ], [showPublicLamps, publicLamps, showOfficialLamps, officialLamps])
  const crime = useCrimeMap(instance, showCrime, reports.safemap)
  const searchTerm = query.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
  const matches = useMemo(() => searchTerm && places ?
    places.filter(([name]) => name.toLocaleLowerCase('ko-KR').replace(/\s+/g, '').includes(searchTerm)) : [], [places, searchTerm])
  const route = useMemo(() => network && locations.from && locations.to ?
    findWalkingPath(network, locations.from.point, locations.to.point) : undefined, [network, locations])
  const lighting = useMemo(() => route ? simulateRouteLighting(route.line) : undefined, [route])

  useEffect(() => {
    let active = true
    loadKakaoMap().then(maps => {
      if (!active || !container.current) return
      const map = new maps.Map(container.current, { center: new maps.LatLng(35.811, 127.137), level: 5 })
      setInstance({ maps, map })
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!showPublicLamps || publicLamps) return
    let active = true
    readLocationData<Point[]>('wansan-registered-lights.json').then(data => {
      if (active) setPublicLamps(data)
    }).catch(() => {
      if (active) setNotice('공개 등록 가로등 자료를 불러오지 못했습니다.')
    })
    return () => { active = false }
  }, [showPublicLamps, publicLamps])

  useEffect(() => {
    if (!showOfficialLamps || officialLamps) return
    const controller = new AbortController()
    fetchOfficialLamps(controller.signal).then(data => {
      if (!controller.signal.aborted) {
        setOfficialLamps(data)
        setLampError(false)
      }
    }).catch(() => {
      if (!controller.signal.aborted) setLampError(true)
    })
    return () => controller.abort()
  }, [showOfficialLamps, officialLamps])

  useEffect(() => {
    let active = true
    function load<T>(file: string, label: string, set: (data: T) => void) {
      readLocationData<T>(file).then(data => {
        if (active) set(data)
      }).catch(() => {
        if (active) setDataErrors(errors => [...errors, label])
      })
    }
    load<Building[]>('wansan-buildings.json', '건물', setBuildings)
    load<Place[]>('wansan-places.json', '장소', setPlaces)
    load<WalkingNetwork>('wansan-walking.json', '보행 경로', setNetwork)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!instance) return
    const { maps, map } = instance
    const outline = new maps.Polygon({
      map,
      path: wansanBoundary.map(ring => ring.map(([longitude, latitude]) => new maps.LatLng(latitude, longitude))),
      strokeWeight: 2, strokeColor: '#245ab1', strokeOpacity: 0.85,
      fillColor: '#4688db', fillOpacity: 0.035
    })
    return () => outline.setMap(null)
  }, [instance])

  useEffect(() => {
    if (!instance) return
    const { maps, map } = instance
    const points = ends.flatMap(end => locations[end] ?
      [{ point: locations[end]!.point, label: names[end], role: end }] : [])
    const pins = points.map(({ point, label, role }) => {
      const [longitude, latitude] = point
      const element = document.createElement('span')
      element.className = 'kakao-pin real-pin'
      element.dataset.end = role
      element.textContent = label
      return new maps.CustomOverlay({
        map, position: new maps.LatLng(latitude, longitude), content: element, clickable: false
      })
    })
    return () => pins.forEach(pin => pin.setMap(null))
  }, [instance, locations])

  useEffect(() => {
    if (!instance || !route || route.line.length < 2) return
    const { maps, map } = instance
    const path = route.line.map(([longitude, latitude]) => new maps.LatLng(latitude, longitude))
    const outline = new maps.Polyline({map, path, strokeWeight: 8, strokeColor: '#fff', strokeOpacity: 0.9})
    const line = new maps.Polyline({map, path, strokeWeight: 5, strokeColor: '#1762d6', strokeOpacity: 1})
    return () => { outline.setMap(null); line.setMap(null) }
  }, [instance, route])

  function select(point: Point, name?: string) {
    if (!inWansan(point)) {
      setNotice('완산구 경계 안의 위치를 선택해 주세요.')
      return
    }
    const other = picking === 'from' ? 'to' : 'from'
    const otherPoint = locations[other]?.point
    if (otherPoint && distance(point, otherPoint) < 1) {
      setNotice('출발지와 도착지를 서로 다른 지점으로 선택해 주세요.')
      return
    }
    onChange({ ...locations, [picking]: { point, name } })
    setNotice('')
    setPointDetail(undefined)
    setReportDetail(undefined)
    setFieldSelected('')
    setEditing(!otherPoint)
    if (!otherPoint) setPicking(other)
  }
  const mapSelect = useEffectEvent((point: Point) => {
    if (fieldPicking) {
      if (!inWansan(point)) {
        setNotice('완산구 경계 안에서 실측 지점을 선택해 주세요.')
        return
      }
      clearFieldLocation()
      setFieldPending({ point })
      setNotice('')
      requestAnimationFrame(() => fieldSection.current?.scrollIntoView({ block: 'nearest' }))
      return
    }
    if (reports.placing) {
      reports.choose(point)
      return
    }
    if (instance && showField) {
      const hit = pickFieldSite(instance, field.sites, point)
      if (hit) {
        setFieldSelected(hit.id)
        setPointDetail(undefined)
        setReportDetail(undefined)
        return
      }
    }
    if (instance && showReports) {
      const report = pickDarkReport(instance, reports.reports, point)
      if (report) {
        setReportDetail(report)
        setPointDetail(undefined)
        setFieldSelected('')
        return
      }
    }
    if (editing || !route) {
      select(point)
      return
    }
    if (instance && lighting && showLighting) {
      const detail = pickLowLight(instance, lighting, point)
      if (detail) {
        setReportDetail(undefined)
        setFieldSelected('')
        setPointDetail(detail)
      }
    }
  })

  useEffect(() => {
    if (!instance) return
    const { maps, map } = instance
    const click = ({ latLng }: { latLng: ReturnType<typeof map.getCenter> }) =>
      mapSelect([latLng.getLng(), latLng.getLat()])
    maps.event.addListener(map, 'click', click)
    return () => maps.event.removeListener(map, 'click', click)
  }, [instance])

  function focusPoint(point: Point) {
    if (!instance) return
    const [longitude, latitude] = point
    instance.map.setLevel(LOW_POINT_LEVEL)
    instance.map.setCenter(new instance.maps.LatLng(latitude, longitude))
  }

  function zoomMap(amount: number) {
    if (!instance) return
    instance.map.setLevel(Math.max(1, Math.min(13, instance.map.getLevel() + amount)))
  }

  function showExample() {
    reports.cancel()
    cancelField()
    onChange(example)
    setPicking('from')
    setNotice('')
    setPointDetail(undefined)
    setReportDetail(undefined)
    setEditing(false)
    if (!instance) return
    const bounds = new instance.maps.LatLngBounds()
    for (const { point: [longitude, latitude] } of Object.values(example)) {
      bounds.extend(new instance.maps.LatLng(latitude, longitude))
    }
    instance.map.setBounds(bounds, 72)
  }

  function cancelField() {
    clearFieldLocation()
    setFieldPicking(false)
    setFieldPending(undefined)
    setFieldSelected('')
  }

  function clearFieldLocation() {
    fieldLocationRequest.current++
    setLocatingField(false)
    setFieldLocation(undefined)
    setFieldLocationNotice('')
  }

  function startField() {
    cancelField()
    reports.cancel()
    setPointDetail(undefined)
    setReportDetail(undefined)
    setNotice('')
    setShowField(true)
    setFieldPicking(true)
    container.current?.scrollIntoView({ block: 'nearest' })
  }

  function locateField() {
    startField()
    if (!window.isSecureContext || !navigator.geolocation) {
      setFieldLocationNotice('현재 위치 기능을 사용하려면 HTTPS 주소로 접속해 주세요.')
      return
    }
    const request = fieldLocationRequest.current
    const isCurrent = () => request === fieldLocationRequest.current && container.current !== null
    setLocatingField(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!isCurrent()) return
      setLocatingField(false)
      const point: Point = [coords.longitude, coords.latitude]
      if (!inWansan(point)) {
        setFieldLocationNotice('추정된 현재 위치가 완산구 밖입니다.')
        return
      }
      setFieldLocation(point)
      setFieldLocationNotice(`현재 위치 · 기기 추정 오차 약 ${meters(coords.accuracy)}.`)
      focusPoint(point)
      container.current?.scrollIntoView({ block: 'nearest' })
    }, error => {
      if (!isCurrent()) return
      setLocatingField(false)
      setFieldLocationNotice(error.code === error.PERMISSION_DENIED ? '위치 권한을 확인해 주세요.' : '현재 위치를 확인하지 못했습니다.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  return <main>
    <aside className="panel" aria-label="실제 위치 설정">
      <section>
        <div className="section-title">
          <h2>출발지와 도착지</h2>
          <button className="text-button" disabled={!locations.from && !locations.to} onClick={() => {
            reports.cancel()
            cancelField()
            onChange({})
            setPicking('from')
            setNotice('')
            setPointDetail(undefined)
            setReportDetail(undefined)
            setEditing(true)
          }}>초기화</button>
        </div>
        <p className="muted">완산구 안의 두 공공장소를 지도에서 선택하세요.</p>
        {ends.map(end => {
          const location = locations[end]
          return <div className="endpoint real-endpoint" key={end}>
            <button className={editing && picking === end ? 'pick active' : 'pick'} aria-pressed={editing && picking === end}
              onClick={() => { reports.cancel(); cancelField(); setPicking(end); setEditing(true); setPointDetail(undefined); setReportDetail(undefined); setNotice('') }}>{names[end]}</button>
            <span aria-label={names[end] + ' 장소'}>{location ? placeLabel(location.point, places ?? emptyPlaces, location.name) : '미선택'}</span>
          </div>
        })}
        <button className="text-button" onClick={showExample}>예시 지점 표시</button>
        <p className="notice" role="status">{notice}</p>
      </section>
      <div ref={fieldSection}>
        <FieldPanel field={field} active={fieldPicking} visible={showField} onVisible={setShowField}
          pending={fieldPending && { ...fieldPending, label: placeLabel(fieldPending.point, places ?? emptyPlaces, fieldPending.site?.siteName) }}
          onStart={startField} onCancel={cancelField} onLocate={instance ? locateField : undefined} locating={locatingField}
          onSaved={id => { cancelField(); setFieldSelected(id); setShowField(true) }}
          onSite={site => {
            reports.cancel()
            cancelField()
            setPointDetail(undefined)
            setReportDetail(undefined)
            setShowField(true)
            setFieldSelected(site.id)
            focusPoint(site.point)
            container.current?.scrollIntoView({ block: 'nearest' })
          }} titleFor={site => placeLabel(site.point, places ?? emptyPlaces, site.siteName)} />
      </div>
      <section aria-label="시민 제보와 범죄주의구간">
        <h2>시민 제보와 범죄주의구간</h2>
        <div className="layer-controls community-controls">
          <label><input type="checkbox" checked={showReports} onChange={e => {
            setShowReports(e.target.checked)
            if (!e.target.checked) setReportDetail(undefined)
          }} />어두워서 피하고 싶은 곳</label>
          <label><input type="checkbox" checked={showCrime} disabled={!reports.safemap} onChange={e => {
            setShowCrime(e.target.checked)
            if (e.target.checked) {
              setShowLighting(false)
              setPointDetail(undefined)
            }
          }} />공식 범죄주의구간</label>
          <label><input type="checkbox" checked={showPublicLamps} onChange={e => setShowPublicLamps(e.target.checked)} />공개 등록 가로등 · OSM</label>
          <label><input type="checkbox" checked={showOfficialLamps} disabled={!reports.lampSources.length}
            onChange={e => {
              setShowOfficialLamps(e.target.checked)
              if (e.target.checked && officialLamps?.some(source => source.error)) setOfficialLamps(undefined)
              setLampError(false)
            }} />전주시 가로등·보안등</label>
          {lighting && <label><input type="checkbox" checked={showLighting} onChange={e => {
            setShowLighting(e.target.checked)
            if (!e.target.checked) setPointDetail(undefined)
          }} />가상 조도</label>}
        </div>
        <p className="muted" role="status">{reports.mode === 'shared' ? `공유 제보 ${formatCount(reports.reports.reduce((total, item) => total + item.count, 0))}건` :
          reports.mode === 'local' ? '이 브라우저에만 저장됩니다. 공용 제보 서버 연결 전입니다.' :
          reports.mode === 'loading' ? '제보 현황을 불러오는 중입니다.' : '공용 제보 서버에 연결하지 못했습니다.'}</p>
        <p className="muted">{crime.status || (!reports.safemap && '공식 지도는 생활안전지도 키 연결이 필요합니다.')} <a href="https://www.safemap.go.kr/opna/data/dataViewRenew.do?objtId=205">공식 출처</a></p>
        {showOfficialLamps && <p className="muted" role="status">{lampError ? '전주시 조명 자료를 불러오지 못했습니다.' :
          !officialLamps ? '전주시 조명 자료를 불러오는 중입니다.' :
            officialLamps.map(source => `${source.type === 'street' ? '가로등' : '보안등'} ${source.error ? '로드 실패' :
              formatCount(source.points?.length ?? 0) + '곳'}${source.asOf ? ' · 공공데이터포털 ' + source.asOf + ' 기준' : ''}`).join(' · ')}</p>}
        <button className="pick report-start" disabled={reports.mode === 'loading' || reports.mode === 'unavailable' || reports.saving}
          aria-pressed={reports.placing} onClick={() => {
            if (reports.placing) reports.cancel()
            else {
              cancelField()
              setShowReports(true)
              setPointDetail(undefined)
              setReportDetail(undefined)
              reports.start()
              container.current?.scrollIntoView({ block: 'nearest' })
            }
          }}>{reports.placing ? '제보 취소' : '어두운 곳 제보하기'}</button>
        {reports.notice && <p className="notice" role="status">{reports.notice}</p>}
      </section>
      <section>
        <h2>보행 경로</h2>
        <p className="muted" role="status">{!locations.from || !locations.to ? '두 지점을 선택하면 등록 보행망에서 경로를 찾습니다.' :
          dataErrors.includes('보행 경로') ? '보행망 자료를 불러오지 못했습니다.' : !network ? '보행망 자료를 불러오는 중입니다.' :
          route ? '완산구 보행 경로가 연결되었습니다.' : '선택한 두 지점 사이에 연결된 보행 경로를 찾지 못했습니다.'}</p>
        {route && <p className="muted">가까운 보행망 연결점부터 계산한 거리입니다. 도로의 현장 상태는 달라질 수 있습니다.</p>}
      </section>
      <section>
        <h2>건물과 장소</h2>
        <div className="layer-controls">
          <label><input type="checkbox" checked={showBuildings} onChange={e => setShowBuildings(e.target.checked)}/>건물 {buildings && formatCount(buildings.length)}</label>
          <label><input type="checkbox" checked={showPlaces} onChange={e => setShowPlaces(e.target.checked)}/>장소 점 표시</label>
        </div>
        <label className="place-search">완산구 장소 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="장소 이름 입력" /></label>
        {searchTerm && <p className="muted" role="status">{dataErrors.includes('장소') ? '장소 자료를 불러오지 못했습니다.' : !places ? '장소 자료를 불러오는 중입니다.' :
          matches.length ? `검색 결과 ${formatCount(matches.length)}곳` : '일치하는 장소가 없습니다.'}</p>}
        {matches.length > 0 && <div className="routes location-results" aria-label="검색 결과">{matches.map(([name, , point], index) =>
          <button key={index} onClick={() => { reports.cancel(); cancelField(); select(point, name); focusPoint(point) }}>
            <span>{name}</span><span>{names[picking]}</span>
          </button>)}</div>}
        {dataErrors.length > 0 && <p className="notice" role="alert">{dataErrors.join(', ')} 자료를 불러오지 못했습니다.</p>}
      </section>
      {lighting && <section aria-label="가상 조도 결과">
        <h2>가상 조도 결과</h2>
        <p className="muted" role="status">임의 가로등 {formatCount(lighting.lamps.length)}개 · 예상 저조도 {formatCount(lighting.low.length)}지점</p>
        <p className="muted">임의 가로등으로 계산한 시연 결과입니다. 빨간색은 {settings.threshold} lx 미만을 뜻합니다.</p>
        {lighting.segments.length > 0 && <button className="text-button" onClick={() => {
          const sample = lighting.segments[0].candidate
          reports.cancel()
          cancelField()
          setShowLighting(true)
          setReportDetail(undefined)
          setPointDetail(sample)
          setEditing(false)
          focusPoint(sample.point)
        }}>최저 조도 지점 보기</button>}
      </section>}
    </aside>
    <div className="content">
      <section className="map" aria-label="실제 위치를 선택할 카카오 지도">
        <div className="kakao-map real-map" ref={container} />
        {instance && <LocationLayer instance={instance} buildings={showBuildings ? buildings ?? emptyBuildings : emptyBuildings}
          places={showPlaces ? places ?? emptyPlaces : emptyPlaces} lighting={showLighting ? lighting : undefined}
          selected={pointDetail} crime={crime.image} reports={showReports ? reports.reports : undefined} reportPreview={reports.pending}
          fieldSites={showField ? field.sites : undefined} fieldPreview={fieldPending?.point} selectedField={fieldSelected}
          fieldLocation={fieldLocation} publicLamps={activeLamps} />}
        {instance && <>
          <p className="map-label" role="status">{fieldPicking ? <>
            {locatingField ? '현재 위치를 찾는 중입니다. ' : fieldLocationNotice && `${fieldLocationNotice} `}
            조도계로 측정한 보행로 지점을 누르세요.
          </> :
            reports.placing ? '어두워서 피하고 싶은 공공 보행 구간을 누르세요.' :
            editing || !route ? `${names[picking]}로 지정할 지점을 누르세요.` :
              !showLighting ? '보행 경로를 확인하세요.' : lighting?.low.length || lighting?.segments.length ?
                '빨간 점이나 구간을 누르면 상세를 볼 수 있습니다.' : '현재 경로에서 표시할 저조도 지점이 없습니다.'}</p>
          <div className="zoom real-zoom" aria-label="지도 확대 및 축소">
            <button aria-label="지도 확대" onClick={() => zoomMap(-1)}>+</button>
            <button aria-label="지도 축소" onClick={() => zoomMap(1)}>−</button>
          </div>
        </>}
        {!instance && (failed ? <p className="map-label" role="alert">카카오 지도를 불러오지 못했습니다.</p> :
          <p className="map-label" role="status">카카오 지도 불러오는 중</p>)}
        {reports.pending && <section className="detail map-point-detail" aria-label="제보 위치 확인">
          <div className="section-title"><h2>어두워서 피하고 싶은 곳</h2></div>
          <p><strong>{placeLabel(reports.pending, places ?? emptyPlaces)}</strong></p>
          <p>위치는 20 m 안팎의 격자로 표시됩니다.</p>
          <button className="text-button" disabled={reports.saving} onClick={reports.submit}>{reports.saving ? '저장 중' : '이 위치 제보'}</button>
          <button className="text-button" disabled={reports.saving} onClick={reports.cancel}>취소</button>
          {reports.notice && <p className="notice" role="status">{reports.notice}</p>}
        </section>}
        {reportDetail && <section className="detail map-point-detail" aria-label="시민 제보 상세" aria-live="polite">
          <div className="section-title"><h2>{placeLabel(reportDetail.point, places ?? emptyPlaces)}</h2><button className="text-button" onClick={() => setReportDetail(undefined)}>닫기</button></div>
          <p>어두워서 피하고 싶은 곳 · 제보 {formatCount(reportDetail.count)}건</p>
        </section>}
        {fieldDetail && <section className="detail map-point-detail" aria-label="현장 실측 상세" aria-live="polite">
          <div className="section-title"><h2>{placeLabel(fieldDetail.point, places ?? emptyPlaces, fieldDetail.siteName)}</h2>
            <button className="text-button" onClick={() => setFieldSelected('')}>닫기</button></div>
          <p><strong>{fieldLabels[fieldDetail.status]}</strong> · 중앙값 {fieldDetail.median.toFixed(2)} lx · {fieldDetail.count}회</p>
          <p>측정 시각 {new Date(fieldDetail.measuredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
          <p className="muted">센서 높이 {fieldDetail.heightM === null ? '미기록' : `${fieldDetail.heightM} m`} · {fieldDetail.direction || '방향 미기록'}</p>
          {fieldDetail.reviewReason && <p className="muted">{fieldDetail.reviewReason}</p>}
          <button className="text-button" onClick={() => {
            setFieldPending({ point: fieldDetail.point, site: fieldDetail })
            setFieldPicking(true)
            setFieldSelected('')
            requestAnimationFrame(() => fieldSection.current?.scrollIntoView({ block: 'nearest' }))
          }}>이 지점 다시 측정</button>
        </section>}
        {pointDetail && <section className="detail map-point-detail" aria-label="저조도 지점 상세" aria-live="polite">
          <div className="section-title"><h2>저조도 지점 상세</h2><button className="text-button" onClick={() => setPointDetail(undefined)}>닫기</button></div>
          <dl className="point-details">
            <div><dt>예상 조도</dt><dd>{pointDetail.lux?.toFixed(2)} lx</dd></div>
            <div><dt>출발지에서 거리</dt><dd>{meters(pointDetail.meters)}</dd></div>
            <div><dt>반경 {settings.radius} m 임의 가로등</dt><dd>{formatCount(pointDetail.count)}개</dd></div>
          </dl>
          <p className="muted">가상 조명으로 계산한 값입니다.</p>
        </section>}
      </section>
      <div className="legend" aria-label="지도 범례">
        {showReports && <span><i className="report-symbol"/>어두워서 피하고 싶은 곳</span>}
        {showField && field.sites.length > 0 && <><span><i className="field-symbol"/>실측 저조도 확인</span>
          <span><i className="field-symbol above"/>실측 기준 이상</span><span><i className="field-symbol review"/>실측 검토 중</span></>}
        {showPublicLamps && <span><i className="registered-lamp-symbol"/>공개 등록 가로등 · OSM</span>}
        {showOfficialLamps && <span><i className="registered-lamp-symbol"/>전주시 가로등·보안등</span>}
        {crime.image && <span>범죄주의구간 · 생활안전지도</span>}
        {showLighting && lighting && <><span><i className="yellow"/>임의 가로등</span><span><i className="red"/>예상 저조도</span>
          {lighting.unknown.length > 0 && <span><i className="gray"/>경계 주변 자료 부족</span>}</>}
      </div>
      {route && <dl className="stats real-stats" aria-label="보행 경로 거리 요약">
        <div><dt>전체 보행 거리</dt><dd>{meters(route.meters)}</dd></div>
        <div><dt>저조도 예상 거리</dt><dd className="low">{lighting ? meters(lighting.lowMeters) : '자료 없음'}</dd></div>
      </dl>}
      <p className="map-note">확대하면 건물 도형이 표시됩니다. 장소 점은 왼쪽에서 켤 수 있습니다. 건물·장소는 <a href="https://docs.overturemaps.org/attribution/">Overture Maps Foundation, © OpenStreetMap contributors</a> 공개 자료입니다.</p>
      <p className="map-note">보행망 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. 완산구 경계는 통계청 SGIS(공공누리 제1유형)를 가공한 <a href="https://github.com/vuski/admdongkor">vuski/admdongkor</a>의 2026년 10월 1일 자료(<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)에서 추출했습니다.</p>
      {showOfficialLamps && officialLamps?.some(source => source.asOf) &&
        <p className="map-note">보안등 위치 출처 · <a href="https://www.data.go.kr/data/15017320/standard.do">전주시 제공 전국보안등정보표준데이터</a></p>}
    </div>
  </main>
}
