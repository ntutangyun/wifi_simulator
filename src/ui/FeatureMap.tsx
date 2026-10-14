/**
 * **The feature map: what the standard defines, what a draft proposes, what this engine built.**
 *
 * One box per feature group, one arrow per dependency, and under every box a bar showing what the
 * engine did with the rows inside it. Click a box and the rows appear with their evidence —
 * clause numbers, engine symbols, lesson ids — exactly as the coverage document writes them.
 *
 * Everything on this screen is computed from `docs/wifi-feature-coverage.md` and
 * `docs/uwb-feature-coverage.md` at build time (`src/course/featureGraph.ts`). There is no copy of
 * either table here: edit a row in the document and this screen changes with it. The only thing
 * authored on this side is the spine — which group a row belongs to and which group needs which —
 * and `tests/course/feature-graph.test.ts` holds it to covering every row and every lesson.
 */
import { useMemo, useState } from 'react'
import {
  BOX_H, BOX_W, DOC_PATH, graphFor, wrapCjk,
  type FeatureGroup, type FeatureRow, type StatusKind, type Track,
} from '../course/featureGraph'
import { LESSONS } from '../course/lessons'
import { trackOf } from '../course/curriculum'
import { useStrings } from './i18n'

/** The four families, as border colours. Kept here because they are a drawing decision. */
const FAMILY_COLOR: Record<FeatureGroup['family'], string> = {
  core: '#4aa3ff', draft: '#b07cff', derived: '#8a93a3', absent: '#4b5563',
}
const ENGINE_COLOR: Record<string, string> = {
  已建模: '#35c08a', 部分建模: '#e0b341', 未建模: '#4b5563',
}
const KINDS: StatusKind[] = ['published', 'draft', 'contested', 'unsettled', 'none']
const STATUS_COLOR: Record<StatusKind, string> = {
  published: '#4aa3ff', draft: '#b07cff', contested: '#ff8a4a',
  unsettled: '#8a93a3', none: '#6b7280',
}

const tag = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '0 6px', borderRadius: 999, fontSize: 11,
  whiteSpace: 'nowrap', border: `1px solid ${color}`, color,
})

/** The evidence cell is Markdown: `code` and **bold** are the only two shapes it uses. */
function Evidence({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter((p) => p !== '')
  return (
    <span>
      {parts.map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} style={{
              background: 'var(--panel2)', borderRadius: 3, padding: '0 3px',
              fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5,
            }}>{p.slice(1, -1)}</code>
          )
        }
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}

function RowList({ rows }: { rows: FeatureRow[] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.feature} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600 }}>{r.feature}</span>
            <span style={tag(STATUS_COLOR[r.statusKind])}>{r.status}</span>
            <span style={tag(ENGINE_COLOR[r.engine] ?? 'var(--dim)')}>{r.engine}</span>
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
            <Evidence text={r.evidence} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function FeatureMap() {
  const L = useStrings()
  const [track, setTrack] = useState<Track>('wifi')
  const [selected, setSelected] = useState<string | null>(null)
  const lessonIds = useMemo(
    () => LESSONS.filter((l) => trackOf(l) === track).map((l) => l.id), [track])
  // The two documents are ~170 KB of Markdown between them; parsing is per track and memoised.
  const g = useMemo(() => graphFor(track, lessonIds), [track, lessonIds])
  const sel = g.groups.find((x) => x.id === selected) ?? null

  const switchTrack = (t: Track): void => { setTrack(t); setSelected(null) }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 12, display: 'grid', gap: 12,
      alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['wifi', 'uwb'] as Track[]).map((t) => (
            <button key={t} className={track === t ? 'active' : ''} onClick={() => switchTrack(t)}>
              {L.map.track[t]}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>
          {L.map.counts(g.rows.length, g.groups.length)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
        {g.engineCounts.map(([e, n]) => (
          <span key={e} style={tag(ENGINE_COLOR[e] ?? 'var(--dim)')}>{e} {n}</span>
        ))}
        {KINDS.map((k) => {
          const n = g.rows.filter((r) => r.statusKind === k).length
          return n === 0 ? null
            : <span key={k} style={tag(STATUS_COLOR[k])}>{L.map.kind[k]} {n}</span>
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5,
        color: 'var(--dim)' }}>
        {(['core', 'draft', 'derived', 'absent'] as FeatureGroup['family'][]).map((f) => (
          <span key={f}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2,
              background: FAMILY_COLOR[f], marginRight: 4 }} />
            {L.map.family[f]}
          </span>
        ))}
        <span>
          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
            background: '#ff8a4a', marginRight: 4 }} />
          {L.map.openBadge}
        </span>
      </div>

      {/* **A scroll container's min-content height is zero**, so inside a grid it is handed
          whatever is left — 41 px of a 708 px drawing, measured at 939x511. It gets a height of
          its own: its natural one, capped so the picture never pushes the panel's text off a
          short screen. */}
      <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--panel)', height: `min(62vh, ${g.height + 4}px)` }}>
        <svg width={g.width} height={g.height} role="img" aria-label={L.map.title}>
          <defs>
            <marker id="fm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7"
              markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--border)" />
            </marker>
          </defs>
          {g.edges.map((e) => (
            <path key={`${e.from}-${e.to}`} d={e.d} fill="none" stroke="var(--border)"
              strokeWidth={1.5} markerEnd="url(#fm-arrow)" />
          ))}
          {g.boxes.map(({ group, x, y }) => {
            const on = group.id === selected
            const barW = BOX_W - 24
            let run = 0
            return (
              <g key={group.id} transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }}
                onClick={() => setSelected(on ? null : group.id)}>
                <title>{`${group.title}　${group.note}`}</title>
                <rect width={BOX_W} height={BOX_H} rx={10} fill="var(--panel2)"
                  stroke={FAMILY_COLOR[group.family]} strokeWidth={on ? 3 : 1.5} />
                <text x={12} y={22} fill="var(--text)" fontSize={13} fontWeight={600}>
                  {group.title}
                </text>
                <text x={12} y={40} fill="var(--dim)" fontSize={11}>
                  {L.map.boxCounts(group.rows.length, group.lessons.length)}
                </text>
                {wrapCjk(group.note, 15, 2).map((line, i) => (
                  <text key={i} x={12} y={58 + i * 14} fill="var(--dim)" fontSize={11}>{line}</text>
                ))}
                {group.open > 0 && (
                  <>
                    <circle cx={BOX_W - 18} cy={16} r={8} fill="#ff8a4a" />
                    <text x={BOX_W - 18} y={20} fontSize={10.5} fontWeight={700} fill="#111318"
                      textAnchor="middle">{group.open}</text>
                  </>
                )}
                {(['已建模', '部分建模', '未建模'] as const).map((e) => {
                  const n = group.rows.filter((r) => r.engine === e).length
                  if (n === 0) return null
                  const w = (n / group.rows.length) * barW
                  const x0 = 12 + run
                  run += w
                  return (
                    <rect key={e} x={x0} y={BOX_H - 22} width={w} height={8} rx={4}
                      fill={ENGINE_COLOR[e]} />
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      {sel === null ? (
        <p style={{ color: 'var(--dim)', fontSize: 12, margin: 0 }}>{L.map.pickPrompt}</p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12,
          background: 'var(--panel)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15 }}>{sel.title}</b>
            <span style={{ color: 'var(--dim)', fontSize: 12 }}>{sel.note}</span>
          </div>
          <p style={{ color: 'var(--dim)', fontSize: 12, margin: '6px 0 10px' }}>
            {L.map.needs}
            {sel.needs.length === 0 ? L.map.noNeeds
              : sel.needs.map((n) => g.groups.find((x) => x.id === n)?.title ?? n).join('、')}
            {'　'}
            {L.map.lessonsLabel}
            {sel.lessons.length === 0 ? L.map.noLessons : sel.lessons.map((x) => `@${x}`).join('、')}
          </p>
          <RowList rows={sel.rows} />
        </div>
      )}

      {g.orphanLessons.length > 0 && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12,
          background: 'var(--panel)' }}>
          <b>{L.map.orphanTitle(g.orphanLessons.length)}</b>
          <p style={{ color: 'var(--dim)', fontSize: 12, margin: '6px 0' }}>{L.map.orphanNote}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {g.orphanLessons.map((id) => (
              <span key={id} style={tag('var(--dim)')}>@{id}</span>
            ))}
          </div>
        </div>
      )}

      <p style={{ color: 'var(--dim)', fontSize: 11.5, margin: 0 }}>
        {L.map.source(DOC_PATH[track])}
      </p>
    </div>
  )
}
