import { useEffect, useState } from 'react'
import { getCrimeImage } from './communityClient.ts'
import type { MapInstance } from './LocationLayer.tsx'
import type { Bounds } from './locationData.ts'
import { wansanBounds } from './wansan.ts'

export interface CrimeImage { image: HTMLImageElement; bounds: Bounds }

export function useCrimeMap(instance: MapInstance | undefined, enabled: boolean, allowed: boolean) {
  const [image, setImage] = useState<CrimeImage>()
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!instance || !enabled || !allowed) return
    const { map, maps } = instance
    let previous = ''
    let pending: AbortController | undefined
    const [minLng, minLat, maxLng, maxLat] = wansanBounds

    function update() {
      const bounds = map.getBounds()
      const sw = bounds.getSouthWest(), ne = bounds.getNorthEast()
      const visible: Bounds = [
        Math.max(minLng, sw.getLng()), Math.max(minLat, sw.getLat()),
        Math.min(maxLng, ne.getLng()), Math.min(maxLat, ne.getLat())
      ]
      const [west, south, east, north] = visible
      if (west >= east || south >= north) {
        pending?.abort()
        previous = ''
        setImage(undefined)
        setStatus('완산구로 이동하면 범죄주의구간을 볼 수 있습니다.')
        return
      }
      const span = Math.max(east - west, north - south)
      const width = Math.max(64, Math.round(768 * (east - west) / span))
      const height = Math.max(64, Math.round(768 * (north - south) / span))
      const signature = visible.join(',')
      if (signature === previous) return
      previous = signature
      pending?.abort()
      const controller = new AbortController()
      pending = controller
      setStatus('공식 범죄주의구간을 불러오는 중입니다.')
      getCrimeImage(visible, width, height, controller.signal).then(image => {
        if (controller.signal.aborted) return
        setImage({ image, bounds: visible })
        setStatus('경찰청 밀도분석을 생활안전지도에서 제공한 지도입니다.')
      }).catch(() => {
        if (controller.signal.aborted) return
        previous = ''
        setImage(undefined)
        setStatus('공식 범죄주의구간을 불러오지 못했습니다.')
      })
    }

    maps.event.addListener(map, 'idle', update)
    update()
    return () => {
      pending?.abort()
      maps.event.removeListener(map, 'idle', update)
      setImage(undefined)
      setStatus('')
    }
  }, [allowed, enabled, instance])

  return { image: enabled ? image : undefined, status }
}
