/**
 * A draggable width for a side column: the width is kept in localStorage,
 * clamped to a range that leaves the rest of the layout room, and changed
 * by dragging a thin handle on the column's edge (double-click resets it).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ColumnLimits {
  /** Narrowest the column may become, px. */
  min: number
  /** Widest the column may become, px, before viewport reserve is applied. */
  max: number
  /** Pixels the rest of the layout must keep; the column never exceeds viewport − reserve. */
  reserve: number
}

/** Clamp a requested width to [min, min(max, viewport − reserve)]; never below min. */
export function clampColumnWidth(w: number, limits: ColumnLimits, viewportWidth: number): number {
  const hi = Math.max(limits.min, Math.min(limits.max, viewportWidth - limits.reserve))
  if (!Number.isFinite(w)) return limits.min
  return Math.round(Math.min(hi, Math.max(limits.min, w)))
}

function viewportWidth(): number {
  return typeof window !== 'undefined' ? window.innerWidth : Number.POSITIVE_INFINITY
}

function readStored(key: string): number | null {
  try {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    if (s == null) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Persisted, clamped column width. Returns the width and a setter; the setter
 * clamps and stores. The width is re-clamped when the window shrinks.
 */
export function useColumnWidth(key: string, initial: number, limits: ColumnLimits): [number, (w: number) => void] {
  const [w, setW] = useState(() => clampColumnWidth(readStored(key) ?? initial, limits, viewportWidth()))
  const set = useCallback((next: number) => {
    const c = clampColumnWidth(next, limits, viewportWidth())
    setW(c)
    try { localStorage.setItem(key, String(c)) } catch { /* storage unavailable */ }
  }, [key, limits])
  useEffect(() => {
    const onResize = () => setW((cur) => clampColumnWidth(cur, limits, viewportWidth()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [limits])
  return [w, set]
}

interface HandleProps {
  /** Which edge of the column the handle sits on. Dragging away from the column widens it. */
  edge: 'left' | 'right'
  width: number
  onWidth: (w: number) => void
  onReset: () => void
  title: string
}

/**
 * Thin vertical grab strip laid over the column's edge. The parent must be
 * `position: relative`. Uses pointer capture so the drag survives leaving the strip.
 */
export function ColumnResizeHandle({ edge, width, onWidth, onReset, title }: HandleProps) {
  const drag = useRef<{ x0: number; w0: number } | null>(null)
  const [active, setActive] = useState(false)
  const sign = edge === 'right' ? 1 : -1

  const end = () => {
    drag.current = null
    setActive(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        drag.current = { x0: e.clientX, w0: width }
        setActive(true)
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        e.preventDefault()
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        onWidth(drag.current.w0 + sign * (e.clientX - drag.current.x0))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      style={{
        position: 'absolute', top: 0, bottom: 0, [edge]: 0, width: 6, zIndex: 6,
        cursor: 'col-resize', touchAction: 'none',
        background: active ? 'rgba(96, 165, 250, 0.45)' : 'transparent',
        transition: active ? 'none' : 'background 120ms',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(96, 165, 250, 0.25)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    />
  )
}
