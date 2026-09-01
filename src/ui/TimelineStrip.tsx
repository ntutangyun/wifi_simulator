import { useEffect, useRef, useState } from 'react'
import { player, useUi } from './store'
import { recordsToSpans, spanTooltip, topSpanAt, xForT, type LaneSpan } from './laneLayout'
import { fmtNs } from './format'
import { useStrings } from './i18n'
import { linkPlanFor, physicalId } from '../model/caps'

const GUTTER = 96
const AXIS_H = 18
const LEGEND_H = 22
const MIN_SPAN = 100_000 // 100 µs visible
const MAX_SPAN = 1_000_000_000 // 1 s visible
const MARGIN = 50_000_000 // fetch 50 ms of records before the window

const SPAN_COLORS: Record<LaneSpan['kind'], string> = {
  tx: '#3b82f6', rx: '#8b5cf6', backoff: '#f59e0b', defer: '#6d5a1b', nav: '#9333ea', sifs: '#06b6d4',
}

function txColor(s: LaneSpan, apId: string): string {
  if (s.frameKind === 'data') return s.frameSrc === apId ? '#3b82f6' : '#22c55e'
  if (s.frameKind === 'ack') return '#e5e7eb'
  if (s.frameKind === 'ba' || s.frameKind === 'mba') return '#d8b4fe'
  if (s.frameKind === 'trigger') return '#facc15'
  return '#f97316' // rts/cts
}


interface Tip {
  x: number
  y: number
  lines: string[]
}

export function TimelineStrip() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wheelRef = useRef<HTMLDivElement>(null)
  const [spanNs, setSpanNs] = useState(5_000_000) // 5 ms window
  const [tip, setTip] = useState<Tip | null>(null)
  /** Bumped by the ResizeObserver so the canvas is re-measured when the column resizes. */
  const [sizeTick, setSizeTick] = useState(0)
  const playheadNs = useUi((s) => s.playheadNs)
  const scenario = useUi((s) => s.scenario)
  const selectedFrame = useUi((s) => s.selectedFrame)
  const L = useStrings()
  const drawn = useRef<{ spans: LaneSpan[]; a: number; b: number; laneW: number; laneH: number; nodeIds: string[] }>({
    spans: [], a: 0, b: 1, laneW: 1, laneH: 1, nodeIds: [],
  })

  const plan = linkPlanFor(scenario.nodes)
  const nodeIds = plan.virtualIds
  const laneLabel = (vid: string): string => {
    const cfg = scenario.nodes.find((n) => n.id === physicalId(vid))
    const name = cfg?.name ?? vid
    if (plan.links.length < 2) return name
    return `${name} · ${vid.includes('#6g') ? '6G' : '5G'}`
  }

  useEffect(() => {
    const parent = canvasRef.current?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  // Wheel moves the playhead; Ctrl+wheel zooms. Native non-passive listener so
  // preventDefault can stop page scroll / browser zoom (React's onWheel is passive).
  useEffect(() => {
    const el = wheelRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const f = e.deltaY > 0 ? 1.4 : 1 / 1.4
        setSpanNs((s) => Math.round(Math.max(MIN_SPAN, Math.min(MAX_SPAN, s * f))))
      } else {
        let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        if (e.deltaMode === 1) d *= 33 // line-scroll browsers report ~3 lines per notch
        player.pause()
        player.seek(player.playheadNs + (d / 100) * spanNs * 0.1)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [spanNs])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const parent = canvas.parentElement!
    const dpr = window.devicePixelRatio || 1
    const W = parent.clientWidth
    const H = parent.clientHeight - LEGEND_H
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const a = playheadNs - spanNs * 0.7
    const b = playheadNs + spanNs * 0.3
    const apId = scenario.nodes.find((n) => n.kind === 'ap')?.id ?? 'ap'
    const laneW = W - GUTTER
    const laneH = (H - AXIS_H) / Math.max(1, nodeIds.length)

    ctx.fillStyle = '#14161c'
    ctx.fillRect(0, 0, W, H)

    // lanes + labels
    nodeIds.forEach((vid, i) => {
      const y = AXIS_H + i * laneH
      ctx.fillStyle = i % 2 ? '#171a21' : '#14161c'
      ctx.fillRect(GUTTER, y, laneW, laneH)
      ctx.fillStyle = '#8a93a3'
      ctx.font = '11px "Segoe UI"'
      ctx.textBaseline = 'middle'
      const name = laneLabel(vid)
      ctx.fillText(name.length > 14 ? name.slice(0, 14) + '…' : name, 6, y + laneH / 2)
    })

    // spans
    const records = player.store.recordsIn(Math.max(player.store.windowStartNs, a - MARGIN), b)
    const spans = recordsToSpans(records, nodeIds, a, b)
    drawn.current = { spans, a, b, laneW, laneH, nodeIds }
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
        if (s.frame?.ampdu && w > 20) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          ctx.font = '9px Consolas'
          ctx.fillText(`×${s.frame.ampdu.mpduCount}`, x0 + 3, y + laneH * 0.42)
        }
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
      if (selectedFrame && s.frame === selectedFrame.frame && (s.kind === 'tx' || s.kind === 'rx')) {
        ctx.strokeStyle = '#f8fafc'
        ctx.lineWidth = 1.5
        ctx.strokeRect(x0 - 1, y + laneH * 0.1, w + 2, laneH * 0.66)
        ctx.lineWidth = 1
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
  }, [playheadNs, spanNs, scenario, sizeTick, selectedFrame])

  const hitSpan = (e: React.PointerEvent): LaneSpan | null => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { spans, a, b, laneW, laneH, nodeIds: ids } = drawn.current
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < GUTTER || y < AXIS_H) return null
    const lane = Math.floor((y - AXIS_H) / laneH)
    if (lane < 0 || lane >= ids.length) return null
    const t = a + ((x - GUTTER) / laneW) * (b - a)
    return topSpanAt(spans, ids[lane], t)
  }

  const tipFor = (e: React.PointerEvent): Tip | null => {
    const s = hitSpan(e)
    if (!s) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, lines: spanTooltip(s, L.tooltips) }
  }

  return (
    <div style={{ height: 190, borderTop: '1px solid var(--border)', position: 'relative' }}>
      <div ref={wheelRef} style={{ position: 'relative', height: `calc(100% - ${LEGEND_H}px)`, cursor: 'crosshair' }}
        onPointerDown={(e) => {
          const s = hitSpan(e)
          const sel = useUi.getState().selectFrame
          if (s?.frame && (s.kind === 'tx' || s.kind === 'rx')) {
            sel({ frame: s.frame, nodeId: s.nodeId, side: s.kind, startNs: s.fullStartNs, endNs: s.fullEndNs })
          } else {
            sel(null)
          }
        }}
        onPointerMove={(e) => setTip(tipFor(e))}
        onPointerLeave={() => setTip(null)}
      >
        {/* Absolute so the canvas's own inline width can't prop its column open —
            in-flow it would block ancestors from ever shrinking (e.g. on browser zoom-in),
            and the ResizeObserver would never fire. */}
        <canvas ref={canvasRef} style={{ display: 'block', position: 'absolute', left: 0, top: 0 }} />
        {tip && (
          <div style={{
            position: 'absolute', left: Math.min(tip.x, (canvasRef.current?.clientWidth ?? 600) - 300), top: Math.max(2, tip.y - 14 * tip.lines.length),
            background: '#0b0d12', border: '1px solid var(--border)', borderRadius: 4,
            padding: '5px 8px', fontSize: 11, maxWidth: 320, pointerEvents: 'none', zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: 600 }}>{tip.lines[0]}</div>
            {tip.lines.slice(1).map((l, i) => (
              <div key={i} style={{ color: 'var(--dim)', marginTop: 1 }}>{l}</div>
            ))}
          </div>
        )}
        <div style={{ position: 'absolute', right: 8, top: 2, color: 'var(--dim)', fontSize: 10 }}>
          {fmtNs(spanNs)} s · {L.strip.windowHint}
        </div>
      </div>
      <div style={{
        height: LEGEND_H, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px',
        background: 'var(--panel)', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--dim)',
        overflowX: 'auto', whiteSpace: 'nowrap',
      }}>
        {L.legend.map((l) => (
          <span key={l.label} title={l.hint} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
            <span style={{ width: 10, height: 10, background: l.color, borderRadius: 2, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
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
