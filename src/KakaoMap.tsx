import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { origin, places } from './data.ts'

interface KakaoBounds {
  extend(position: object): void
}

interface KakaoMapInstance {
  setBounds(bounds: KakaoBounds, padding: number): void
}

interface KakaoOverlay {
  setMap(map: KakaoMapInstance | null): void
}

interface KakaoMaps {
  load(callback: () => void): void
  LatLng: new (latitude: number, longitude: number) => object
  LatLngBounds: new () => KakaoBounds
  Map: new (element: HTMLElement, options: { center: object; level: number }) => KakaoMapInstance
  CustomOverlay: new (options: {
    map: KakaoMapInstance
    position: object
    content: HTMLElement
    clickable: boolean
  }) => KakaoOverlay
}

const key = import.meta.env.VITE_KAKAO_MAP_JS_KEY?.trim()
export const hasKakaoKey = Boolean(key)
let loading: Promise<KakaoMaps> | undefined

function loadKakaoMap() {
  if (!loading) {
    loading = new Promise<KakaoMaps>((resolve, reject) => {
      const script = document.createElement('script')
      const url = new URL('https://dapi.kakao.com/v2/maps/sdk.js')
      url.searchParams.set('appkey', key)
      url.searchParams.set('autoload', 'false')
      script.src = url.href
      script.async = true
      const timeout = window.setTimeout(fail, 12000)

      function fail() {
        window.clearTimeout(timeout)
        script.remove()
        reject(new Error('Kakao Maps SDK unavailable'))
      }

      script.onerror = fail
      script.onload = () => {
        const maps = (window as Window & { kakao?: { maps: KakaoMaps } }).kakao?.maps
        if (!maps?.load) {
          fail()
          return
        }
        maps.load(() => {
          window.clearTimeout(timeout)
          resolve(maps)
        })
      }
      document.head.append(script)
    }).catch(error => {
      loading = undefined
      throw error
    })
  }
  return loading
}

interface Props {
  from: string
  to: string
  picking: 'from' | 'to'
  onPlace: (id: string) => void
}

export function KakaoMap({ from, to, picking, onPlace }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('loading')
  const [pins] = useState(() => places.map(place => ({
    ...place,
    content: document.createElement('div')
  })))

  useEffect(() => {
    let active = true
    const overlays: KakaoOverlay[] = []
    loadKakaoMap().then(maps => {
      if (!active || !container.current) return
      const [longitude, latitude] = origin
      const map = new maps.Map(container.current, { center: new maps.LatLng(latitude, longitude), level: 5 })
      const bounds = new maps.LatLngBounds()
      for (const pin of pins) {
        const [longitude, latitude] = pin.point
        const position = new maps.LatLng(latitude, longitude)
        bounds.extend(position)
        overlays.push(new maps.CustomOverlay({ map, position, content: pin.content, clickable: true }))
      }
      map.setBounds(bounds, 64)
      setStatus('ready')
    }).catch(() => {
      if (active) setStatus('error')
    })
    return () => {
      active = false
      overlays.forEach(overlay => overlay.setMap(null))
    }
  }, [pins])

  return <section className="map" aria-label="전주 카카오 배경지도">
    <div className="kakao-map" ref={container} />
    {status === 'loading' && <p className="map-label" role="status">카카오 지도 불러오는 중</p>}
    {status === 'error' && <p className="map-label" role="alert">카카오 지도를 불러오지 못했습니다. 키와 SDK 도메인을 확인하세요.</p>}
    {status === 'ready' && <p className="map-label" role="status">
      {picking === 'from' ? '출발지로' : '도착지로'} 사용할 시연 핀을 선택하세요.
    </p>}
    {status === 'ready' && pins.map(pin => {
      const selected = pin.id === from ? '출발지' : pin.id === to ? '도착지' : ''
      return createPortal(<button type="button" className="kakao-pin" aria-pressed={Boolean(selected)}
        onClick={() => onPlace(pin.id)}>
        {pin.name}{selected && <span> · {selected}</span>}
      </button>, pin.content, pin.id)
    })}
  </section>
}
