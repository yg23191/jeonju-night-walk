import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { coverage, demoArea, lamps, origin, places, world } from './data.ts'
import { containsDisk, offset } from './gis.ts'
import type { Point } from './gis.ts'
import { classify, lampActive } from './light.ts'
import type { Estimate } from './light.ts'

const width = 800, height = 550
const xy = (p: Point) => {
  const [x,y] = offset(origin,p)
  return [400 + x, 275 - y] as const
}
const points = (line: readonly Point[]) => line.map(p => xy(p).join(',')).join(' ')
const blocks = [
  [73,68,116,48],[223,68,55,43],[327,56,83,56],[458,64,75,41],[587,67,123,54],
  [96,141,81,51],[210,143,88,50],[346,142,86,52],[466,138,57,59],[602,145,83,58],
  [77,228,37,92],[153,228,83,101],[253,228,46,72],[342,278,105,52],
  [461,278,69,61],[584,227,107,58],[587,313,105,47],[342,356,96,35],[471,365,88,51],
  [73,422,104,49],[211,423,74,54],[332,420,83,53],[597,411,97,54]
]
const streets = [
  '47,122 730,122','48,211 523,211 555,177 729,177','48,385 310,385 310,263 523,263 555,232 555,167 730,167',
  '47,483 727,483','139,35 139,518','310,40 310,518','555,35 555,517','725,42 725,502',
  '48,343 269,343','449,264 449,498','555,387 726,387'
]
const keyActivate = (event: KeyboardEvent<SVGGElement>, action: () => void) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}

interface Props {
  from: string
  to: string
  line: Point[]
  estimates: Estimate[]
  threshold: number
  selected?: number
  onPlace: (id: string) => void
  onEmpty: (outside: boolean) => void
  onSample: (sample: Estimate) => void
}

export function DemoMap({from,to,line,estimates,threshold,selected,onPlace,onEmpty,onSample}: Props) {
  const [zoom,setZoom] = useState(1)
  const [center,setCenter] = useState<readonly [number,number]>([400,275])
  const bounds = [center[0]-width/2/zoom, center[1]-height/2/zoom,width/zoom,height/zoom]
  function mapClick(event: MouseEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM()
    if (!matrix) return
    const {x,y} = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
    const point = world(x-400,275-y)
    if (!containsDisk(point,demoArea,0)) {
      onEmpty(true)
    } else if (zoom > 1) {
      setCenter([x,y])
    } else {
      onEmpty(false)
    }
  }
  function changeZoom(next: number) {
    setZoom(next)
    if (next === 1) setCenter([400,275])
    else if (zoom === 1 && selected !== undefined) {
      const sample = estimates.find(p => p.meters === selected)
      if (sample) setCenter(xy(sample.point))
    }
  }
  return <section className="map" aria-label="시연 지도">
    <svg viewBox={bounds.join(' ')} onClick={mapClick} aria-label="가상 보행 경로와 예상 조도">
      <defs>
        <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#273d50" strokeWidth=".6"/></pattern>
        <pattern id="coverage" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9L9 0" stroke="#59bfad" strokeOpacity=".16"/></pattern>
      </defs>
      <rect width={width} height={height} fill="#0e1c2a"/>
      <rect width={width} height={height} fill="url(#grid)"/>
      <path d="M760 -20 Q696 101 757 250T746 570" fill="none" stroke="#173a51" strokeWidth="37"/>
      <polygon points={points(demoArea[0])} fill="#182b3a" fillOpacity=".58" stroke="#70859b" strokeDasharray="6 6"/>
      {blocks.map(([x,y,w,h]) => <rect key={x+','+y} x={x} y={y} width={w} height={h} rx="6" fill="#233747" stroke="#2c4558"/>)}
      {streets.map(street => <polyline key={street} points={street} fill="none" stroke="#344a5c" strokeWidth="8" strokeLinejoin="round" />)}
      <polygon points={points(coverage[0])} fill="url(#coverage)" stroke="#579f9b" strokeDasharray="4 5"/>
      <text x="67" y="472" fill="#9ab6bd" fontSize="12">가상 조명 조사 범위</text>
      {line.length > 0 && <>
        <polyline points={points(line)} className="route-halo"/>
        <polyline points={points(line)} className="route-line"/>
      </>}
      {lamps.filter(lampActive).map(lamp => {
        const [x,y] = xy(lamp.point)
        return <g key={lamp.id} transform={'translate('+x+' '+y+')'} pointerEvents="none">
          <circle r="6" fill="#ffcf62" opacity=".17"/>
          <path d="M-2 -2a2 2 0 1 1 4 0c0 1-1 2-1 3h-2c0-1-1-2-1-3m1 5h2" fill="#ffe091" stroke="#ffe091" strokeWidth=".6"/>
        </g>
      })}
      {estimates.map(sample => {
        const status = classify(sample,threshold)
        if (status === 'lit' && selected !== sample.meters) return null
        const [x,y] = xy(sample.point)
        const select = () => onSample(sample)
        return <g key={sample.meters} transform={'translate('+x+' '+y+')'} className="sample" role="button"
          tabIndex={0} aria-label={Math.round(sample.meters)+'m '+(status === 'unknown' ? '자료 부족' : '예상 조도 '+sample.lux?.toFixed(2)+' lx')}
          onClick={e => { e.stopPropagation(); select() }} onKeyDown={e => keyActivate(e,select)}>
          <circle r={selected === sample.meters ? 6 : 2.8} fill={status === 'low' ? '#ff6672' : status === 'unknown' ? '#a0aab8' : '#67b6ff'} stroke={selected === sample.meters ? '#fff' : '#142333'} strokeWidth=".8"/>
        </g>
      })}
      {places.map(place => {
        const [x,y] = xy(place.point)
        const active = place.id === from || place.id === to
        const choose = () => onPlace(place.id)
        return <g key={place.id} transform={'translate('+x+' '+y+')'} className="place" role="button" tabIndex={0}
          aria-label={place.name} onClick={e => {e.stopPropagation(); choose()}} onKeyDown={e => keyActivate(e,choose)}>
          <circle r="12" fill={active ? '#4da6ff' : '#203b53'} stroke={active ? '#cde8ff' : '#67a4cf'} strokeWidth="2"/>
          <text textAnchor="middle" y="4" fill="#fff" fontSize="10" fontWeight="700">{place.id === from ? '출' : place.id === to ? '도' : '•'}</text>
          <text className="place-label" textAnchor="middle" y="-19">{place.name}</text>
        </g>
      })}
    </svg>
    <span className="map-label">가상 SVG 지도</span>
    <div className="zoom" aria-label="지도 확대 및 축소">
      <button aria-label="지도 확대" onClick={() => changeZoom(Math.min(zoom * 1.5, 5))} disabled={zoom >= 5}>+</button>
      <button aria-label="지도 축소" onClick={() => changeZoom(Math.max(zoom / 1.5, 1))} disabled={zoom <= 1}>−</button>
      <button aria-label="지도 초기 보기" onClick={() => changeZoom(1)}>⌂</button>
    </div>
  </section>
}

