import { useEffect, useRef, useState } from 'react'
import { origin } from './data.ts'

interface KakaoMaps {
  load(callback: () => void): void
  LatLng: new (latitude: number, longitude: number) => object
  Map: new (element: HTMLElement, options: { center: object; level: number }) => object
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

export function KakaoMap() {
  const container = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true
    loadKakaoMap().then(maps => {
      if (!active || !container.current) return
      const [longitude, latitude] = origin
      new maps.Map(container.current, { center: new maps.LatLng(latitude, longitude), level: 5 })
      setStatus('ready')
    }).catch(() => {
      if (active) setStatus('error')
    })
    return () => { active = false }
  }, [])

  return <section className="map" aria-label="전주 카카오 배경지도">
    <div className="kakao-map" ref={container} />
    {status === 'loading' && <p className="map-label" role="status">카카오 지도 불러오는 중</p>}
    {status === 'error' && <p className="map-label" role="alert">카카오 지도를 불러오지 못했습니다. 키와 SDK 도메인을 확인하세요.</p>}
    {status === 'ready' && <p className="map-label" role="status">카카오 지도 · 전주</p>}
  </section>
}
