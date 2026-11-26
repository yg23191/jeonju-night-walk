import { useEffect, useRef } from 'react'
import type { loadKakaoMap } from './KakaoMap.tsx'
import type { Building, Place } from './locationData.ts'
import type { Point } from './gis.ts'
import type { Estimate } from './light.ts'
import type { RouteLighting } from './routeLighting.ts'
import type { ReportCell } from './reportLocations.ts'
import type { CrimeImage } from './useCrimeMap.ts'
import { wansanBoundary } from './wansan.ts'

type SDK = Awaited<ReturnType<typeof loadKakaoMap>>
export type MapInstance = { maps: SDK; map: InstanceType<SDK['Map']> }
export const LOW_POINT_LEVEL = 3

function pixels({ map, maps }: MapInstance) {
  const projection = map.getProjection()
  return ([lng, lat]: Point) => projection.containerPointFromCoords(new maps.LatLng(lat, lng))
}

export function pickLowLight(instance: MapInstance, lighting: RouteLighting, position: Point): Estimate | undefined {
  const pixel = pixels(instance)
  const target = pixel(position)
  let nearest: Estimate | undefined
  let minPixels = 13
  if (instance.map.getLevel() <= LOW_POINT_LEVEL) {
    for (const sample of lighting.low) {
      const { x, y } = pixel(sample.point)
      const gap = Math.hypot(x - target.x, y - target.y)
      if (gap < minPixels) {
        minPixels = gap
        nearest = sample
      }
    }
    return nearest
  }
  for (const { line, candidate } of lighting.segments) {
    let a = pixel(line[0])
    for (const point of line.slice(1)) {
      const b = pixel(point)
      const dx = b.x - a.x, dy = b.y - a.y
      const squared = dx * dx + dy * dy
      const fraction = squared ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / squared)) : 0
      const gap = Math.hypot(target.x - (a.x + fraction * dx), target.y - (a.y + fraction * dy))
      if (gap < minPixels) {
        minPixels = gap
        nearest = candidate
      }
      a = b
    }
  }
  return nearest
}

export function pickDarkReport(instance: MapInstance, reports: ReportCell[], position: Point) {
  const pixel = pixels(instance)
  const target = pixel(position)
  let closest = 13
  let selected: ReportCell | undefined
  for (const report of reports) {
    const { x, y } = pixel(report.point)
    const gap = Math.hypot(x - target.x, y - target.y)
    if (gap < closest) {
      closest = gap
      selected = report
    }
  }
  return selected
}

interface Props {
  instance: MapInstance
  buildings: Building[]
  places: Place[]
  lighting?: RouteLighting
  selected?: Estimate
  crime?: CrimeImage
  reports?: ReportCell[]
  reportPreview?: Point
}

export function LocationLayer({ instance, buildings, places, lighting, selected, crime, reports, reportPreview }: Props) {
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
      const pixel = pixels(instance)
      const level = map.getLevel()

      if (level <= 5) {
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
      if (crime) {
        const [minLng, minLat, maxLng, maxLat] = crime.bounds
        const topLeft = pixel([minLng, maxLat])
        const topRight = pixel([maxLng, maxLat])
        const bottomLeft = pixel([minLng, minLat])
        ctx.save()
        ctx.beginPath()
        for (const ring of wansanBoundary) {
          ring.forEach((point, index) => {
            const { x, y } = pixel(point)
            if (index === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.closePath()
        }
        ctx.clip('evenodd')
        ctx.transform(topRight.x - topLeft.x, topRight.y - topLeft.y,
          bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y, topLeft.x, topLeft.y)
        ctx.drawImage(crime.image, 0, 0, 1, 1)
        ctx.restore()
      }
      function dot(point: Point, radius: number, color: string) {
        if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) return
        const { x, y } = pixel(point)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      if (level <= 6) {
        for (const [, , point] of places) dot(point, 3, '#086a80')
      }
      if (lighting) {
        if (level <= LOW_POINT_LEVEL) {
          for (const point of lighting.lamps) dot(point, 4, '#d6930d')
          for (const { point } of lighting.unknown) dot(point, 3, '#7c8593')
          for (const { point } of lighting.low) dot(point, 4, '#e8273c')
        } else {
          ctx.beginPath()
          for (const { line } of lighting.segments) {
            line.forEach((point, index) => {
              const { x, y } = pixel(point)
              if (index === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            })
          }
          ctx.lineJoin = 'round'
          ctx.lineCap = 'butt'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 8
          ctx.stroke()
          ctx.strokeStyle = '#e8273c'
          ctx.lineWidth = 5.5
          ctx.stroke()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1
          for (const point of lighting.lamps) dot(point, 2.5, '#d6930d')
        }
        if (selected) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          dot(selected.point, 7, '#b4112c')
        }
      }
      function reportMarker(point: Point, radius: number, preview: boolean, count = 1) {
        if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) return
        const { x, y } = pixel(point)
        ctx.fillStyle = preview ? '#fff' : '#6432a0'
        ctx.strokeStyle = preview ? '#6432a0' : '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, y - radius)
        ctx.lineTo(x + radius, y)
        ctx.lineTo(x, y + radius)
        ctx.lineTo(x - radius, y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        if (count > 1 && level <= 5) {
          ctx.font = '600 11px system-ui'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 3
          ctx.strokeText(String(count), x + radius + 2, y + 3)
          ctx.fillStyle = '#41276a'
          ctx.fillText(String(count), x + radius + 2, y + 3)
        }
      }
      for (const report of reports ?? []) reportMarker(report.point, 7, false, report.count)
      if (reportPreview) reportMarker(reportPreview, 10, true)
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
  }, [instance, buildings, places, lighting, selected, crime, reports, reportPreview])

  return <canvas ref={canvasRef} className="location-layer" aria-hidden="true" />
}
