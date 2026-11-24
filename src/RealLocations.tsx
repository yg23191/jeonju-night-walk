import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { loadKakaoMap } from './KakaoMap.tsx'
import { distance } from './gis.ts'
import type { Point } from './gis.ts'
import { LocationLayer } from './LocationLayer.tsx'
import type { MapInstance } from './LocationLayer.tsx'
import { readLocationData } from './locationData.ts'
import type { Building, Place } from './locationData.ts'
import { inWansan, wansanBoundary } from './wansan.ts'
import { findWalkingPath } from './walkingNetwork.ts'
import type { WalkingNetwork } from './walkingNetwork.ts'
import { simulateRouteLighting } from './routeLighting.ts'
import { settings } from './light.ts'

type End = 'from' | 'to'
export type Locations = Partial<Record<End, Point>>
const ends = ['from', 'to'] as const
const names = { from: '출발지', to: '도착지' }
const emptyBuildings: Building[] = []
const emptyPlaces: Place[] = []
const example: Locations = { from: [127.14865,35.82315], to: [127.15015,35.81613] }
const formatCount = (count: number) => count.toLocaleString('ko-KR')

interface Props {
  locations: Locations
  onChange: (locations: Locations) => void
}

export function RealLocations({ locations, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [picking, setPicking] = useState<End>(locations.from && !locations.to ? 'to' : 'from')
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [instance, setInstance] = useState<MapInstance>()
  const [buildings, setBuildings] = useState<Building[]>()
  const [places, setPlaces] = useState<Place[]>()
  const [network, setNetwork] = useState<WalkingNetwork>()
  const [dataErrors, setDataErrors] = useState<string[]>([])
  const [showBuildings, setShowBuildings] = useState(true)
  const [showPlaces, setShowPlaces] = useState(false)
  const [query, setQuery] = useState('')
  const searchTerm = query.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
  const matches = useMemo(() => searchTerm && places ?
    places.filter(([name]) => name.toLocaleLowerCase('ko-KR').replace(/\s+/g, '').includes(searchTerm)) : [], [places, searchTerm])
  const route = useMemo(() => network && locations.from && locations.to ?
    findWalkingPath(network, locations.from, locations.to) : undefined, [network, locations])
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
      [{ point: locations[end]!, label: names[end], role: end }] : [])
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

  function select(point: Point) {
    if (!inWansan(point)) {
      setNotice('완산구 경계 안의 위치를 선택해 주세요.')
      return
    }
    const other = picking === 'from' ? 'to' : 'from'
    const otherPoint = locations[other]
    if (otherPoint && distance(point, otherPoint) < 1) {
      setNotice('출발지와 도착지를 서로 다른 지점으로 선택해 주세요.')
      return
    }
    onChange({ ...locations, [picking]: point })
    setNotice('')
    if (!otherPoint) setPicking(other)
  }
  const mapSelect = useEffectEvent(select)

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
    instance.map.setLevel(3)
    instance.map.setCenter(new instance.maps.LatLng(latitude, longitude))
  }

  function showExample() {
    onChange(example)
    setPicking('from')
    setNotice('')
    if (!instance) return
    const bounds = new instance.maps.LatLngBounds()
    for (const [longitude, latitude] of Object.values(example)) {
      bounds.extend(new instance.maps.LatLng(latitude, longitude))
    }
    instance.map.setBounds(bounds, 72)
  }

  return <main>
    <aside className="panel" aria-label="실제 위치 설정">
      <section>
        <div className="section-title">
          <h2>출발지와 도착지</h2>
          <button className="text-button" disabled={!locations.from && !locations.to} onClick={() => {
            onChange({})
            setPicking('from')
            setNotice('')
          }}>초기화</button>
        </div>
        <p className="muted">완산구 안의 두 공공장소를 지도에서 선택하세요.</p>
        {ends.map(end => {
          const point = locations[end]
          return <div className="endpoint real-endpoint" key={end}>
            <button className={picking === end ? 'pick active' : 'pick'} aria-pressed={picking === end}
              onClick={() => { setPicking(end); setNotice('') }}>{names[end]}</button>
            <span aria-label={names[end] + ' 좌표'}>{point ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : '미선택'}</span>
          </div>
        })}
        <button className="text-button" onClick={showExample}>예시 지점 표시</button>
        <p className="notice" role="status">{notice}</p>
      </section>
      <section>
        <h2>보행 경로</h2>
        <p className="muted" role="status">{!locations.from || !locations.to ? '두 지점을 선택하면 등록 보행망에서 경로를 찾습니다.' :
          dataErrors.includes('보행 경로') ? '보행망 자료를 불러오지 못했습니다.' : !network ? '보행망 자료를 불러오는 중입니다.' :
          route ? `완산구 내 보행 경로 ${formatCount(Math.round(route.meters))} m` : '선택한 두 지점 사이에 연결된 보행 경로를 찾지 못했습니다.'}</p>
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
          <button key={index} onClick={() => { select(point); focusPoint(point) }}>
            <span>{name}</span><span>{names[picking]}</span>
          </button>)}</div>}
        {dataErrors.length > 0 && <p className="notice" role="alert">{dataErrors.join(', ')} 자료를 불러오지 못했습니다.</p>}
      </section>
      {lighting && <section aria-label="가상 조도 결과">
        <h2>가상 조도 결과</h2>
        <p className="muted" role="status">임의 가로등 {formatCount(lighting.lamps.length)}개 · 예상 저조도 {formatCount(lighting.low.length)}지점</p>
        <p className="muted">임의 가로등으로 계산한 시연 결과입니다. 빨간 점은 {settings.threshold} lx 미만을 뜻합니다.</p>
      </section>}
    </aside>
    <div className="content">
      <section className="map" aria-label="실제 위치를 선택할 카카오 지도">
        <div className="kakao-map real-map" ref={container} />
        {instance && <LocationLayer instance={instance} buildings={showBuildings ? buildings ?? emptyBuildings : emptyBuildings}
          places={showPlaces ? places ?? emptyPlaces : emptyPlaces} lighting={lighting} />}
        {instance && <p className="map-label" role="status">{names[picking]}로 지정할 지점을 누르세요.</p>}
        {!instance && (failed ? <p className="map-label" role="alert">카카오 지도를 불러오지 못했습니다.</p> :
          <p className="map-label" role="status">카카오 지도 불러오는 중</p>)}
      </section>
      {lighting && <div className="legend" aria-label="가상 조도 지도 범례">
        <span><i className="yellow"/>임의 가로등</span><span><i className="red"/>예상 저조도</span>
        {lighting.unknown.length > 0 && <span><i className="gray"/>경계 주변 자료 부족</span>}
      </div>}
      <p className="map-note">확대하면 건물 도형이 표시됩니다. 장소 점은 왼쪽에서 켤 수 있습니다. 건물·장소는 <a href="https://docs.overturemaps.org/attribution/">Overture Maps Foundation, © OpenStreetMap contributors</a> 공개 자료입니다.</p>
      <p className="map-note">보행망 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. 완산구 경계는 통계청 SGIS(공공누리 제1유형)를 가공한 <a href="https://github.com/vuski/admdongkor">vuski/admdongkor</a>의 2026년 10월 1일 자료(<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)에서 추출했습니다.</p>
    </div>
  </main>
}
