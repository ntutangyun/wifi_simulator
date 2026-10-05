/**
 * Floating, draggable reference window opened from the menu bar: a searchable
 * glossary of every term the UI uses, plus the narrative guide as a second tab.
 * Not modal — the simulation keeps running and stays clickable behind it.
 */
import { useEffect, useRef, useState } from 'react'
import { GLOSSARY } from './glossary'
import { Guide } from './Guide'
import { useStrings } from './i18n'
import { useViewport } from './useViewport'

/** The width this window wants. It gets it only where the viewport has it to give. */
const W = 620
const H_MAX = 680
/** The gutter left either side when the viewport is narrower than `W`.
 *  The browser side of this geometry is `tests/e2e/narrow-width.spec.ts`. */
const MARGIN = 12
/**
 * How much of the window a drag may push off the left edge of the screen — or
 * rather, how little of it must stay: 120 px of the title bar, enough to grab it
 * and drag it back. The right edge is not negotiable in the same way, because
 * the ✕ lives there; see `clampPos`.
 */
const KEEP = 120

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The window's width for a viewport of `vw`: what it wants, or what there is. */
export const guideWindowWidth = (vw: number): number => Math.min(W, vw - 2 * MARGIN)

/**
 * A position that keeps the window usable.
 *
 * The right edge is clamped flush with the viewport and no further, so the ✕ —
 * which sits at the window's own right edge — can never leave the screen. That
 * was the defect at 470 px: the window kept its desktop 620 px, 162 px of it
 * (the search box and the close button both) hung off the right, and `Escape`
 * was the only way to shut it. The device this app is read on is a phone, and a
 * phone has no `Escape` key. The left edge stays negotiable: a reader may shove
 * the window aside to read what is behind it, as long as `KEEP` px of the title
 * bar remain to drag it back by.
 */
export const clampGuidePos = (
  p: { x: number; y: number },
  w: number,
  vw: number,
  vh: number,
): { x: number; y: number } => ({
  x: clamp(p.x, Math.min(-(w - KEEP), vw - w), vw - w),
  y: clamp(p.y, 0, Math.max(0, vh - 60)),
})

export function GuideWindow({ onClose }: { onClose: () => void }) {
  const L = useStrings()
  const G = L.guideWindow
  const [tab, setTab] = useState<'terms' | 'overview'>('terms')
  const [q, setQ] = useState('')
  // The foldable is why this reads the viewport as state rather than once: the
  // same page goes from 939 px to 470 px without reloading, and a window parked
  // against the right edge of the open screen is entirely off the shut one.
  const vp = useViewport()
  const w = guideWindowWidth(vp.w)
  const [pos, setPos] = useState(() => ({
    x: Math.max(MARGIN, (typeof window === 'undefined' ? 1200 : window.innerWidth) - W - 24),
    y: 52,
  }))
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  // Fold, rotate or resize: bring the window back inside the new viewport. The
  // state is replaced only when the clamp really moved it, so this cannot loop.
  useEffect(() => {
    setPos((prev) => {
      const next = clampGuidePos(prev, guideWindowWidth(vp.w), vp.w, vp.h)
      return next.x === prev.x && next.y === prev.y ? prev : next
    })
  }, [vp.w, vp.h])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const needle = q.trim().toLowerCase()
  const groups = GLOSSARY
    .map((g) => ({
      ...g,
      items: g.items.filter((it) =>
        !needle ||
        it.term.toLowerCase().includes(needle) ||
        it.alt.toLowerCase().includes(needle) ||
        it.def.toLowerCase().includes(needle),
      ),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, width: w, maxHeight: `min(${H_MAX}px, calc(100vh - ${pos.y + 16}px))`,
      display: 'grid', gridTemplateRows: 'auto auto 1fr', zIndex: 50,
      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6,
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)', overflow: 'hidden',
    }}>
      {/* title bar — drag handle */}
      <div
        onPointerDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
          ;(e.target as Element).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          setPos(clampGuidePos(
            { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
            w, vp.w, vp.h,
          ))
        }}
        onPointerUp={() => { drag.current = null }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 12px',
          borderBottom: '1px solid var(--border)', cursor: 'move', userSelect: 'none',
          background: '#1b202b',
        }}
      >
        <strong style={{ fontSize: 12.5 }}>{G.title}</strong>
        <span style={{ color: 'var(--dim)', fontSize: 11 }}>{G.dragHint}</span>
        <button style={{ marginLeft: 'auto', padding: '1px 8px' }} onClick={onClose} title={G.close}>✕</button>
      </div>

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderBottom: '1px solid var(--border)' }}>
        <button className={tab === 'terms' ? 'active' : ''} onClick={() => setTab('terms')}>{G.terms}</button>
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>{G.overview}</button>
        {tab === 'terms' && (
          <input
            value={q}
            autoFocus
            placeholder={G.search}
            onChange={(e) => setQ(e.target.value)}
            style={{ marginLeft: 'auto', width: 190 }}
          />
        )}
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {tab === 'overview' ? <Guide /> : (
          <div style={{ padding: '4px 12px 14px' }}>
            {groups.length === 0 && <div style={{ color: 'var(--dim)', padding: '10px 0', fontSize: 11.5 }}>{G.empty}</div>}
            {groups.map((g) => (
              <div key={g.id}>
                <h4 style={{ margin: '10px 0 4px', fontSize: 12.5, color: '#d5dae3' }}>{g.title}</h4>
                {g.items.map((it) => (
                  <div key={it.term} style={{ margin: '0 0 7px', fontSize: 11.5, lineHeight: 1.5 }}>
                    <div>
                      <b style={{ color: '#c3cad6' }}>{it.term}</b>{' '}
                      <span style={{ color: '#6f7787' }}>· {it.alt}</span>
                    </div>
                    <div style={{ color: 'var(--dim)' }}>{it.def}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
