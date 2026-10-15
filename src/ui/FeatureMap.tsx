/**
 * **The feature map: what the standard defines, what a draft proposes, what this engine built.**
 *
 * One box per feature group, one arrow per dependency, and under every box a bar showing what the
 * engine did with the rows inside it. Click a box and the rows appear with their evidence —
 * clause numbers, engine symbols, lesson ids — exactly as the coverage document writes them.
 *
 * **Top to bottom is time**: a group sits in the year its earliest cited contribution was first
 * disclosed, so the picture reads as the history of the protocol rather than as a diagram of it.
 * Every arrow therefore wants to point downwards, and on both tracks every one of them does —
 * which is the dependency rule and the record agreeing, not an arrangement. The chips at the foot
 * of a box are the companies whose names are on those contributions.
 *
 * Everything on this screen is computed from `docs/wifi-feature-coverage.md` and
 * `docs/uwb-feature-coverage.md` at build time (`src/course/featureGraph.ts`). There is no copy of
 * either table here: edit a row in the document and this screen changes with it. The only thing
 * authored on this side is the spine — which group a row belongs to and which group needs which —
 * and `tests/course/feature-graph.test.ts` holds it to covering every row and every lesson.
 */
import { useMemo, useState } from 'react'
import {
  BASELINE, BOX_H, BOX_W, DOC_PATH, UNDATED, graphFor, wrapCjk,
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

/**
 * **A company gets a colour and its initials, never its logo.**
 *
 * A logo is someone's trademark, it would have to be fetched and committed as an image, and this
 * repository carries no third-party assets — so the chips are drawn from the one thing the
 * corpus actually gives us: the name printed in the affiliation field. The colour is a hash of
 * that name, so it is stable across renders and across tracks without a table to maintain, and
 * the full name is in the chip's tooltip and spelled out in the panel.
 */
const ORG_HUES = [206, 268, 152, 24, 340, 48, 188, 292, 120, 8]
function orgColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 100000
  return `hsl(${ORG_HUES[h % ORG_HUES.length]} 52% 46%)`
}

/** Two letters for a Latin name, the first two characters otherwise. */
function orgInitials(name: string): string {
  const words = name.split(/[\s.,-]+/).filter((w) => w !== '')
  if (words.length >= 2 && /^[A-Za-z]/.test(words[0]!)) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * The four chips a box has room for: the first three companies, then 「+N」 carrying the rest in
 * its tooltip. Three plus a count rather than four plus a label, because the fourth label and the
 * date span were drawn on the same line and overlapped at 196 px.
 */
function chipsOf(orgs: { name: string; docs: number }[]):
{ key: string; label: string; docs: number; rest: { name: string; docs: number }[] | null }[] {
  if (orgs.length <= 4) {
    return orgs.map((o) => ({ key: o.name, label: orgInitials(o.name), docs: o.docs, rest: null }))
  }
  const rest = orgs.slice(3)
  return [
    ...orgs.slice(0, 3).map((o) =>
      ({ key: o.name, label: orgInitials(o.name), docs: o.docs, rest: null })),
    { key: '+', label: `+${rest.length}`, docs: 0, rest },
  ]
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

/** A band's name: the two bands that are not years get one, a year is its own. */
function bandName(key: string, L: ReturnType<typeof useStrings>): string {
  if (key === BASELINE) return L.map.baseline
  if (key === UNDATED) return L.map.undated
  return key
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
  /** The other half of a dependency: who would stop making sense without this one. */
  const dependants = sel === null ? []
    : g.groups.filter((x) => x.needs.some((n) => n.id === sel.id))

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
        {g.edges.some((e) => e.kind === 'up') && <span>{L.map.upEdge}</span>}
      </div>

      <p style={{ color: 'var(--dim)', fontSize: 11.5, margin: 0 }}>{L.map.axisNote}</p>

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
          {/* **The bands are the time axis.** A year with nothing in it still gets a lane:
              2023, 2024 and 2025 are empty on the UWB side, and that pause is the fact —
              the features were tabled in 2021–2022 and everything since is argument. */}
          {g.bands.map((b, i) => (
            <g key={b.key}>
              <rect x={0} y={b.y - 8} width={g.width} height={b.height + 16}
                fill={i % 2 === 0 ? 'var(--panel2)' : 'transparent'} opacity={0.5} />
              <line x1={0} x2={g.width} y1={b.y - 8} y2={b.y - 8} stroke="var(--border)" />
              <text x={10} y={b.y + 14} fontSize={12.5} fontWeight={700}
                fill={b.groups === 0 ? 'var(--dim)' : 'var(--text)'}>
                {bandName(b.key, L)}
              </text>
              {b.groups === 0 && (
                <text x={10} y={b.y + 28} fontSize={10} fill="var(--dim)">{L.map.emptyYear}</text>
              )}
            </g>
          ))}
          {g.edges.map((e) => (
            <path key={`${e.from}-${e.to}`} d={e.d} fill="none"
              stroke={e.kind === 'up' ? '#ff8a4a' : 'var(--border)'}
              strokeDasharray={e.kind === 'up' ? '5 3' : undefined}
              strokeWidth={e.kind === 'down' ? 1.6 : 1.2} markerEnd="url(#fm-arrow)">
              <title>{`${g.groups.find((x) => x.id === e.from)?.title} → `
                + `${g.groups.find((x) => x.id === e.to)?.title}　${e.why}`}</title>
            </path>
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
                {/* The span, and the companies on the contributions it spans. */}
                {/* The band label already names a group with no date; repeating it in the box
                    would spend the one line the span has on saying nothing. */}
                {group.since !== null && (
                  <text x={12} y={BOX_H - 10} fill="var(--dim)" fontSize={9.5}>
                    {`${group.since.slice(0, 7)}→${(group.until ?? group.since).slice(0, 7)}`}
                  </text>
                )}
                {/* Four chips, and the fourth becomes 「+N」 when there are more — the row has
                    room for four, and a fifth label squeezed next to the span overlapped it. */}
                {chipsOf(group.orgs).map((c, i) => (
                  <g key={c.key} transform={`translate(${BOX_W - 14 - (i + 1) * 17},${BOX_H - 24})`}>
                    <title>{c.rest === null ? `${c.key}　${L.map.docCount(c.docs)}`
                      : c.rest.map((o) => `${o.name}×${o.docs}`).join('、')}</title>
                    <rect width={15} height={15} rx={4}
                      fill={c.rest === null ? orgColor(c.key) : 'var(--dim)'} />
                    <text x={7.5} y={11} fontSize={8} fontWeight={700} fill="#fff"
                      textAnchor="middle">{c.label}</text>
                  </g>
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
                    <rect key={e} x={x0} y={BOX_H - 42} width={w} height={8} rx={4}
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
          {/* **When it entered the record, and on whose paper.** */}
          <div style={{ margin: '6px 0 2px', fontSize: 12, display: 'flex', gap: 8,
            flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={tag(sel.since === null ? 'var(--dim)' : '#4aa3ff')}>
              {sel.since === null ? bandName(sel.era, L) : L.map.firstSeen(sel.since)}
            </span>
            {sel.until !== null && sel.until !== sel.since && (
              <span style={{ color: 'var(--dim)' }}>{L.map.lastSeen(sel.until)}</span>
            )}
            {sel.docs.length > 0 && (
              <span style={{ color: 'var(--dim)' }}>{L.map.docCount(sel.docs.length)}</span>
            )}
          </div>
          {sel.since === null && (
            <p style={{ color: 'var(--dim)', fontSize: 11.5, margin: '2px 0 6px' }}>
              {sel.era === BASELINE ? L.map.baselineWhy : L.map.undatedWhy}
            </p>
          )}
          {sel.orgs.length > 0 && (
            <div style={{ margin: '6px 0' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: 'var(--dim)', fontSize: 12 }}>{L.map.orgsLabel}</span>
                {sel.orgs.map((o) => (
                  <span key={o.name} style={{ display: 'inline-flex', alignItems: 'center',
                    gap: 4, fontSize: 11.5 }}>
                    <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 4,
                      background: orgColor(o.name), color: '#fff', fontSize: 8, fontWeight: 700,
                      textAlign: 'center', lineHeight: '14px' }}>{orgInitials(o.name)}</span>
                    {o.name}
                    <span style={{ color: 'var(--dim)' }}>×{o.docs}</span>
                  </span>
                ))}
              </div>
              <p style={{ color: 'var(--dim)', fontSize: 11, margin: '4px 0 0' }}>
                {L.map.orgsNote}
              </p>
            </div>
          )}
          {/* **Every dependency gets its reason on screen.** An arrow with no reason is a
              teaching order wearing an arrowhead; writing them out is what kept the two apart
              when this spine was re-derived as feature dependencies. */}
          <div style={{ margin: '8px 0 10px', display: 'grid', gap: 4 }}>
            <div style={{ color: 'var(--dim)', fontSize: 12 }}>
              {L.map.needs}{sel.needs.length === 0 ? L.map.noNeeds : ''}
            </div>
            {sel.needs.map((n) => (
              <div key={n.id} style={{ fontSize: 12, paddingLeft: 10 }}>
                <button style={{ padding: '0 6px', fontSize: 12 }} onClick={() => setSelected(n.id)}>
                  {g.groups.find((x) => x.id === n.id)?.title ?? n.id}
                </button>
                <span style={{ color: 'var(--dim)' }}>　{n.why}</span>
              </div>
            ))}
            {dependants.length > 0 && (
              <div style={{ color: 'var(--dim)', fontSize: 12, marginTop: 2 }}>
                {L.map.feeds}
                {dependants.map((d) => d.title).join('、')}
              </div>
            )}
            <div style={{ color: 'var(--dim)', fontSize: 12 }}>
              {L.map.lessonsLabel}
              {sel.lessons.length === 0 ? L.map.noLessons
                : sel.lessons.map((x) => `@${x}`).join('、')}
            </div>
          </div>
          {sel.docs.length > 0 && (
            <details style={{ margin: '0 0 10px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--dim)' }}>
                {L.map.chronoLabel}
              </summary>
              <div style={{ display: 'grid', gap: 3, marginTop: 6 }}>
                {sel.docs.map((d) => (
                  <div key={d.dcn} style={{ fontSize: 11.5, display: 'flex', gap: 6,
                    flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{d.date}</span>
                    <b>{d.dcn}</b>
                    <span style={tag('var(--dim)')}>{L.map.docKind[d.kind] ?? d.kind}</span>
                    <span style={{ color: 'var(--dim)' }}>
                      {d.orgs.length > 0 ? d.orgs.join('、') : '—'}
                    </span>
                    <span style={{ color: 'var(--dim)' }}>{d.title}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
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
