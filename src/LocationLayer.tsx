import { useEffect, useRef } from 'react'
import type { loadKakaoMap } from './KakaoMap.tsx'
import type { Building, Place } from './locationData.ts'
import type { Point } from './gis.ts'

type SDK = Awaited<ReturnType<typeof loadKakaoMap>>
export type MapInstance = { maps: SDK; map: InstanceType<SDK['Map']> }

interface Props {
  instance: MapInstance
  buildings: Building[]
  places: Place[]
  lights: Point[]
}

export function LocationLayer({ instance, buildings, places, lights }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const context = canvas.getContext('2d')
    if (!context) return
    const { map, maps } = instance
    let frame = 0

    function draw() {
      frame = 0
      const { clientWidth: width, clientHeight: height } = canvas
      const scale = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(width * scale)) canvas.width = Math.round(width * scale)
      if (canvas.height !== Math.round(height * scale)) canvas.height = Math.round(height * scale)
      const ctx = context!
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const bounds = map.getBounds()
      const sw = bounds.getSouthWest(), ne = bounds.getNorthEast()
      const west = sw.getLng(), south = sw.getLat(), east = ne.getLng(), north = ne.getLat()
      const projection = map.getProjection()
      const pixel = ([lng, lat]: Point) => projection.containerPointFromCoords(new maps.LatLng(lat, lng))

      if (map.getLevel() <= 5) {
        ctx.fillStyle = '#735bc43d'
        ctx.strokeStyle = '#5b3cad85'
        ctx.lineWidth = 0.75
        for (const [[xmin, ymin, xmax, ymax], polygons] of buildings) {
          if (xmax < west || xmin > east || ymax < south || ymin > north) continue
          ctx.beginPath()
          for (const polygon of polygons) {
            for (const ring of polygon) {
              ring.forEach((point, i) => {
                const { x, y } = pixel(point)
                if (i === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
              })
              ctx.closePath()
            }
          }
          ctx.fill('evenodd')
          ctx.stroke()
        }
      }
      if (map.getLevel() <= 6) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        function dot(point: Point, radius: number, color: string) {
          if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) return
          const { x, y } = pixel(point)
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
        for (const [, , point] of places) dot(point, 3, '#086a80')
        for (const point of lights) dot(point, 5, '#a45700')
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw)
    }

    const resize = new ResizeObserver(schedule)
    resize.observe(canvas)
    maps.event.addListener(map, 'bounds_changed', schedule)
    maps.event.addListener(map, 'idle', schedule)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      maps.event.removeListener(map, 'bounds_changed', schedule)
      maps.event.removeListener(map, 'idle', schedule)
    }
  }, [instance, buildings, places, lights])

  return <canvas ref={canvasRef} className="location-layer" aria-hidden="true" />
}
