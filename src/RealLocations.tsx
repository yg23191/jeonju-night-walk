import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { loadKakaoMap } from './KakaoMap.tsx'
import { origin } from './data.ts'
import { distance } from './gis.ts'
import type { Point } from './gis.ts'
import { inJeonju, jeonjuBoundary } from './jeonju.ts'

type End = 'from' | 'to'
export type Locations = Partial<Record<End, Point>>
const ends = ['from', 'to'] as const
const names = { from: '출발지', to: '도착지' }

interface Props {
  locations: Locations
  onChange: (locations: Locations) => void
}

export function RealLocations({ locations, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [picking, setPicking] = useState<End>(locations.from && !locations.to ? 'to' : 'from')
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  type SDK = Awaited<ReturnType<typeof loadKakaoMap>>
  const [instance, setInstance] = useState<{ maps: SDK; map: InstanceType<SDK['Map']> }>()

  useEffect(() => {
    let active = true
    loadKakaoMap().then(maps => {
      if (!active || !container.current) return
      const [longitude, latitude] = origin
      const map = new maps.Map(container.current, { center: new maps.LatLng(latitude, longitude), level: 6 })
      setInstance({ maps, map })
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!instance) return
    const { maps, map } = instance
    const outline = new maps.Polygon({
      map,
      path: jeonjuBoundary.map(ring => ring.map(([longitude, latitude]) => new maps.LatLng(latitude, longitude))),
      strokeWeight: 2, strokeColor: '#245ab1', strokeOpacity: 0.85,
      fillColor: '#4688db', fillOpacity: 0.035
    })
    return () => outline.setMap(null)
  }, [instance])

  useEffect(() => {
    if (!instance) return
    const { maps, map } = instance
    const pins = ends.flatMap(end => {
      const point = locations[end]
      if (!point) return []
      const [longitude, latitude] = point
      const label = document.createElement('span')
      label.className = 'kakao-pin real-pin'
      label.dataset.end = end
      label.textContent = names[end]
      return [new maps.CustomOverlay({
        map, position: new maps.LatLng(latitude, longitude), content: label, clickable: false
      })]
    })
    return () => pins.forEach(pin => pin.setMap(null))
  }, [instance, locations])

  const select = useEffectEvent((point: Point) => {
    if (!inJeonju(point)) {
      setNotice('전주시 경계 안의 위치를 선택해 주세요.')
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
  })

  useEffect(() => {
    if (!instance) return
    const { maps, map } = instance
    const click = ({ latLng }: { latLng: ReturnType<typeof map.getCenter> }) =>
      select([latLng.getLng(), latLng.getLat()])
    maps.event.addListener(map, 'click', click)
    return () => maps.event.removeListener(map, 'click', click)
  }, [instance])

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
        <p className="muted">전주시 안의 두 공공장소를 지도에서 선택하세요.</p>
        {ends.map(end => {
          const point = locations[end]
          return <div className="endpoint real-endpoint" key={end}>
            <button className={picking === end ? 'pick active' : 'pick'} aria-pressed={picking === end}
              onClick={() => { setPicking(end); setNotice('') }}>{names[end]}</button>
            <span aria-label={names[end] + ' 좌표'}>{point ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : '미선택'}</span>
          </div>
        })}
        <p className="notice" role="status">{notice}</p>
      </section>
      <section><p className="muted">실제 보행 경로와 조도 데이터는 연결 전입니다. 선택한 좌표는 현재 화면에서만 사용합니다.</p></section>
    </aside>
    <div className="content">
      <section className="map" aria-label="실제 위치를 선택할 카카오 지도">
        <div className="kakao-map real-map" ref={container} />
        {instance && <p className="map-label" role="status">{names[picking]}로 지정할 지점을 누르세요.</p>}
        {!instance && (failed ? <p className="map-label" role="alert">카카오 지도를 불러오지 못했습니다.</p> :
          <p className="map-label" role="status">카카오 지도 불러오는 중</p>)}
      </section>
      <p className="map-note">파란 선은 전주시 경계입니다. 경계 자료는 통계청 SGIS(공공누리 제1유형)를 가공한 <a href="https://github.com/vuski/admdongkor">vuski/admdongkor</a>의 2026년 10월 1일 자료(<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)에서 추출했습니다.</p>
    </div>
  </main>
}
