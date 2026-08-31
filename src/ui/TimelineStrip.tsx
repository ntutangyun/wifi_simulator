import { useEffect, useRef, useState } from 'react'
import { player, useUi } from './store'
import { recordsToSpans, xForT, type LaneSpan } from './laneLayout'
import { fmtNs } from './format'

const GUTTER = 90
const AXIS_H = 18
const MIN_SPAN = 100_000 // 100 µs visible
const MAX_SPAN = 1_000_000_000 // 1 s visible
const MARGIN = 50_000_000 // fetch 50 ms of records before the window

const SPAN_COLORS: Record<LaneSpan['kind'], string> = {
  tx: '#3b82f6', rx: '#8b5cf6', backoff: '#f59e0b', defer: '#6d5a1b', nav: '#9333ea', sifs: '#06b6d4',
}

function txColor(s: LaneSpan, apId: string): string {
  if (s.frameKind === 'data') return s.frameSrc === apId ? '#3b82f6' : '#22c55e'
  if (s.frameKind === 'ack') return '#e5e7eb'
  return '#f97316' // rts/cts
}

export function TimelineStrip() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [spanNs, setSpanNs] = useState(5_000_000) // 5 ms window
  const playheadNs = useUi((s) => s.playheadNs)
  const scenario = useUi((s) => s.scenario)
  const dragging = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const parent = canvas.parentElement!
    const dpr = window.devicePixelRatio || 1
    const W = parent.clientWidth
    const H = parent.clientHeight
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const a = playheadNs - spanNs * 0.7
    const b = playheadNs + spanNs * 0.3
    const nodeIds = scenario.nodes.map((n) => n.id)
    const apId = scenario.nodes.find((n) => n.kind === 'ap')?.id ?? 'ap'
    const laneW = W - GUTTER
    const laneH = (H - AXIS_H) / Math.max(1, nodeIds.length)

    ctx.fillStyle = '#14161c'
    ctx.fillRect(0, 0, W, H)

    // lanes + labels
    nodeIds.forEach((_id, i) => {
      const y = AXIS_H + i * laneH
      ctx.fillStyle = i % 2 ? '#171a21' : '#14161c'
      ctx.fillRect(GUTTER, y, laneW, laneH)
      ctx.fillStyle = '#8a93a3'
      ctx.font = '11px "Segoe UI"'
      ctx.textBaseline = 'middle'
      const name = scenario.nodes[i].name
      ctx.fillText(name.length > 12 ? name.slice(0, 12) + '…' : name, 6, y + laneH / 2)
    })

    // spans
    const records = player.store.recordsIn(Math.max(player.store.windowStartNs, a - MARGIN), b)
    const spans = recordsToSpans(records, nodeIds, a, b)
    for (const s of spans) {
      const i = nodeIds.indexOf(s.nodeId)
      if (i < 0) continue
      const y = AXIS_H + i * laneH
      const x0 = GUTTER + xForT(s.startNs, a, b, laneW)
      const x1 = GUTTER + xForT(s.endNs, a, b, laneW)
      const w = Math.max(1, x1 - x0)
      if (s.kind === 'tx') {
        ctx.fillStyle = txColor(s, apId)
        ctx.fillRect(x0, y + laneH * 0.15, w, laneH * 0.55)
      } else if (s.kind === 'rx') {
        ctx.fillStyle = SPAN_COLORS.rx
        ctx.globalAlpha = 0.5
        ctx.fillRect(x0, y + laneH * 0.3, w, laneH * 0.4)
        ctx.globalAlpha = 1
      } else if (s.kind === 'nav') {
        ctx.fillStyle = SPAN_COLORS.nav
        ctx.fillRect(x0, y + laneH * 0.82, w, laneH * 0.1)
      } else {
        ctx.fillStyle = SPAN_COLORS[s.kind]
        ctx.globalAlpha = s.kind === 'defer' ? 0.6 : 0.9
        ctx.fillRect(x0, y + laneH * 0.35, w, laneH * 0.3)
        ctx.globalAlpha = 1
      }
    }

    // collision ticks
    for (const r of records) {
      if (r.type !== 'COLLISION' || r.t < a || r.t > b) continue
      const x = GUTTER + xForT(r.t, a, b, laneW)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, AXIS_H)
      ctx.lineTo(x, H)
      ctx.stroke()
      ctx.lineWidth = 1
    }

    // time axis
    ctx.fillStyle = '#8a93a3'
    ctx.font = '10px Consolas, monospace'
    const step = niceStep(spanNs / 6)
    for (let t = Math.ceil(a / step) * step; t <= b; t += step) {
      const x = GUTTER + xForT(t, a, b, laneW)
      ctx.strokeStyle = '#242936'
      ctx.beginPath()
      ctx.moveTo(x, AXIS_H)
      ctx.lineTo(x, H)
      ctx.stroke()
      ctx.fillText(fmtTick(t, step), x + 2, 8)
    }

    // playhead
    const px = GUTTER + xForT(playheadNs, a, b, laneW)
    ctx.strokeStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, H)
    ctx.stroke()

    // frontier shading (unsimulated future)
    if (player.store.frontierNs < b) {
      const fx = GUTTER + xForT(player.store.frontierNs, a, b, laneW)
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(fx, AXIS_H, W - fx, H - AXIS_H)
    }
  }, [playheadNs, spanNs, scenario])

  const tFromEvent = (e: React.PointerEvent | React.WheelEvent): number => {
    const r = canvasRef.current!.getBoundingClientRect()
    const a = playheadNs - spanNs * 0.7
    const b = playheadNs + spanNs * 0.3
    const frac = (e.clientX - r.left - GUTTER) / (r.width - GUTTER)
    return a + Math.max(0, Math.min(1, frac)) * (b - a)
  }

  return (
    <div style={{ height: 170, borderTop: '1px solid var(--border)', position: 'relative', cursor: 'crosshair' }}
      onWheel={(e) => {
        const f = e.deltaY > 0 ? 1.4 : 1 / 1.4
        setSpanNs((s) => Math.round(Math.max(MIN_SPAN, Math.min(MAX_SPAN, s * f))))
      }}
      onPointerDown={(e) => {
        dragging.current = true
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        player.pause()
        player.seek(tFromEvent(e))
      }}
      onPointerMove={(e) => {
        if (dragging.current) player.seek(tFromEvent(e))
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div style={{ position: 'absolute', right: 8, top: 2, color: 'var(--dim)', fontSize: 10 }}>
        window {fmtNs(spanNs)} s · wheel to zoom · drag to scrub
      </div>
    </div>
  )
}

function niceStep(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= target) return m * pow
  }
  return 10 * pow
}

function fmtTick(t: number, step: number): string {
  if (step >= 1_000_000) return `${(t / 1_000_000).toFixed(0)}ms`
  return `${(t / 1_000).toFixed(0)}µs`
}
