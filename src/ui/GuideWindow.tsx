/**
 * Floating, draggable reference window opened from the menu bar: a searchable
 * glossary of every term the UI uses, plus the narrative guide as a second tab.
 * Not modal — the simulation keeps running and stays clickable behind it.
 */
import { useEffect, useRef, useState } from 'react'
import { GLOSSARY } from './glossary'
import { Guide } from './Guide'
import { useStrings } from './i18n'
import { useUi } from './store'

const W = 620
const H_MAX = 680

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function GuideWindow({ onClose }: { onClose: () => void }) {
  const lang = useUi((s) => s.lang)
  const L = useStrings()
  const G = L.guideWindow
  const [tab, setTab] = useState<'terms' | 'overview'>('terms')
  const [q, setQ] = useState('')
  const [pos, setPos] = useState(() => ({
    x: Math.max(12, (typeof window === 'undefined' ? 1200 : window.innerWidth) - W - 24),
    y: 52,
  }))
  const drag = useRef<{ dx: number; dy: number } | null>(null)

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
        it.alt[lang].toLowerCase().includes(needle) ||
        it.def[lang].toLowerCase().includes(needle) ||
        it.alt.en.toLowerCase().includes(needle),
      ),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, width: W, maxHeight: `min(${H_MAX}px, calc(100vh - ${pos.y + 16}px))`,
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
          setPos({
            x: clamp(e.clientX - drag.current.dx, -W + 120, window.innerWidth - 120),
            y: clamp(e.clientY - drag.current.dy, 0, window.innerHeight - 60),
          })
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
                <h4 style={{ margin: '10px 0 4px', fontSize: 12.5, color: '#d5dae3' }}>{g.title[lang]}</h4>
                {g.items.map((it) => (
                  <div key={it.term} style={{ margin: '0 0 7px', fontSize: 11.5, lineHeight: 1.5 }}>
                    <div>
                      <b style={{ color: '#c3cad6' }}>{it.term}</b>{' '}
                      <span style={{ color: '#6f7787' }}>· {it.alt[lang]}</span>
                    </div>
                    <div style={{ color: 'var(--dim)' }}>{it.def[lang]}</div>
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
