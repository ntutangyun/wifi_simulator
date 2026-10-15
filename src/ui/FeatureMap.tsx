/**
 * **The feature map: one column per feature, one row per quarter.**
 *
 * Left to right is the order features entered the record — the published spine first, then each
 * draft feature in the quarter it was first tabled, then the models this engine built with no
 * clause to point at. Down a column is that one feature's history: every mentor document its rows
 * cite, and the day the lesson that teaches it was added here. The two together are the point:
 * 「tabled 2022-07, still being argued 2026-10, taught here since 2026-09」 is one column, read
 * top to bottom.
 *
 * **Clicking a column opens it in place.** The detail is not a panel somewhere else: the column
 * widens, its header becomes a card (rows and their evidence, dependencies with their reasons,
 * companies), and its cells spell out the events they were drawing as dots. The open column's
 * dependencies are drawn as arcs across the strip above the grid, and the columns they point at
 * are outlined.
 *
 * Everything here is computed from `docs/wifi-feature-coverage.md`,
 * `docs/uwb-feature-coverage.md`, `src/course/docMeta.json` and `src/course/lessonMeta.json`
 * (`src/course/featureGraph.ts`). There is no copy of either table: edit a row in the document
 * and this screen changes with it. The only thing authored on this side is the spine — which
 * group a row belongs to and which group needs which — and `tests/course/feature-graph.test.ts`
 * holds it to covering every row and every lesson.
 */
import { useMemo, useState } from 'react'
import {
  BASELINE, DOC_PATH, graphFor,
  type FeatureGroup, type FeatureRow, type MatrixColumn, type StatusKind, type TimeEvent,
  type Track,
} from '../course/featureGraph'
import { LESSONS } from '../course/lessons'
import { trackOf } from '../course/curriculum'
import { useStrings } from './i18n'

/** The four families, as the colour of a column's top edge. A drawing decision, so it lives here. */
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
/** What a dot means: the standard's paperwork (blue, purple) or ours (green). */
const EVENT_COLOR: Record<TimeEvent['kind'], string> = {
  published: '#4aa3ff', doc: '#b07cff', lesson: '#35c08a',
}

const GUTTER = 84
const COL_W = 158
const OPEN_W = 376
const ROW_H = 28
const ARCS_H = 34

const tag = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '0 6px', borderRadius: 999, fontSize: 11,
  whiteSpace: 'nowrap', border: `1px solid ${color}`, color,
})

/**
 * **A company gets a colour and its initials, never its logo.**
 *
 * A logo is someone's trademark, it would have to be fetched and committed as an image, and this
 * repository carries no third-party assets — so the chips are drawn from the one thing the corpus
 * gives us: the name printed in the affiliation field. The colour is a hash of that name, so it
 * is stable across renders and across tracks without a table to maintain, and the full name is in
 * the tooltip and spelled out when the column is open.
 */
const ORG_HUES = [206, 268, 152, 24, 340, 48, 188, 292, 120, 8]
function orgColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 100000
  return `hsl(${ORG_HUES[h % ORG_HUES.length]} 52% 46%)`
}
function orgInitials(name: string): string {
  const words = name.split(/[\s.,-]+/).filter((w) => w !== '')
  if (words.length >= 2 && /^[A-Za-z]/.test(words[0]!)) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const chipStyle = (background: string): React.CSSProperties => ({
  display: 'inline-block', width: 15, height: 15, borderRadius: 4, fontSize: 8, fontWeight: 700,
  color: '#fff', textAlign: 'center', lineHeight: '15px', background,
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
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.feature} style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>{r.feature}</span>
            <span style={tag(STATUS_COLOR[r.statusKind])}>{r.status}</span>
            <span style={tag(ENGINE_COLOR[r.engine] ?? 'var(--dim)')}>{r.engine}</span>
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 11.5, marginTop: 3, lineHeight: 1.55 }}>
            <Evidence text={r.evidence} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** How many blocks a closed cell shows before it says 「there are more, open the column」. */
const BLOCKS = 5

/**
 * A closed column's cell: **one block per thing that happened**, not one dot.
 *
 * A dot could only say 「something happened here」; the block says which document it was, what
 * kind of document, and whose name is on it — which is the whole of what the matrix knows before
 * a column is opened. The cap keeps one busy quarter (14 comment resolutions landed on MMS
 * ranging in 2026Q3) from setting the height of its whole row.
 */
function EventBlocks({ events }: { events: TimeEvent[] }) {
  const L = useStrings()
  const shown = events.slice(0, BLOCKS)
  return (
    <div style={{ display: 'grid', gap: 2, paddingTop: 2 }}>
      {shown.map((e) => (
        <div key={e.label} title={`${e.date === '' ? L.map.baseline : e.date}　${e.label}`
          + `${e.docKind === undefined ? '' : `　${L.map.docKind[e.docKind] ?? e.docKind}`}`
          + `${e.detail === '' ? '' : `　${e.detail}`}`
          + `${e.orgs.length > 0 ? `　${e.orgs.join('、')}` : ''}`}
        style={{ display: 'flex', gap: 4, alignItems: 'center', borderRadius: 4,
          borderLeft: `3px solid ${EVENT_COLOR[e.kind]}`, background: 'rgba(127,127,127,.12)',
          padding: '1px 4px', fontSize: 9.5, lineHeight: '14px', overflow: 'hidden' }}>
          <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap' }}>
            {e.kind === 'published' ? L.map.baseline : e.label}
          </span>
          {e.docKind !== undefined && (
            <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>
              {L.map.docKindShort[e.docKind] ?? L.map.docKind[e.docKind] ?? e.docKind}
            </span>
          )}
          {e.orgs.slice(0, 3).map((o) => (
            <span key={o} title={o} style={{ width: 11, height: 11, borderRadius: 3, fontSize: 6.5,
              fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: '11px',
              background: orgColor(o), flex: '0 0 auto' }}>{orgInitials(o)}</span>
          ))}
        </div>
      ))}
      {events.length > BLOCKS && (
        <div title={events.slice(BLOCKS).map((e) => `${e.date} ${e.label}`).join('、')}
          style={{ fontSize: 9, color: 'var(--dim)', paddingLeft: 5 }}>
          {L.map.morePapers(events.length - BLOCKS)}
        </div>
      )}
    </div>
  )
}

/** An open column's cell: the same events, spelled out where they happened. */
function EventLines({ events }: { events: TimeEvent[] }) {
  const L = useStrings()
  return (
    <div style={{ display: 'grid', gap: 3, paddingLeft: 14 }}>
      {events.map((e) => (
        <div key={e.label} style={{ fontSize: 11, lineHeight: 1.45 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: EVENT_COLOR[e.kind], marginRight: 5 }} />
          {e.kind === 'published' ? <b>{L.map.baseline}</b> : (
            <>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace',
                color: 'var(--dim)' }}>{e.date}</span>
              {' '}
              <b>{e.label}</b>
              {e.docKind !== undefined && (
                <span style={{ color: 'var(--dim)' }}>　{L.map.docKind[e.docKind] ?? e.docKind}</span>
              )}
              {e.orgs.length > 0 && (
                <span style={{ color: 'var(--dim)' }}>　{e.orgs.join('、')}</span>
              )}
              {e.detail !== '' && (
                <div style={{ color: 'var(--dim)', paddingLeft: 12 }}>{e.detail}</div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The open column's header: everything the old panel held, inside the column it belongs to.
 * It scrolls on its own, so opening a column cannot push the time axis off the screen.
 */
function OpenCard({ column, dependants, onPick, titleOf }: {
  column: MatrixColumn
  dependants: FeatureGroup[]
  onPick: (id: string) => void
  titleOf: (id: string) => string
}) {
  const L = useStrings()
  const g = column.group
  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ marginTop: 6, maxHeight: 200, overflow: 'auto', fontSize: 12,
        borderTop: '1px solid var(--border)', paddingTop: 6, cursor: 'default' }}>
      <div style={{ color: 'var(--dim)', fontSize: 11.5, marginBottom: 6 }}>{g.note}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 6 }}>
        <span style={tag(g.since === null ? 'var(--dim)' : '#4aa3ff')}>
          {g.since === null ? L.map.baseline : L.map.firstSeen(g.since)}
        </span>
        {g.until !== null && g.until !== g.since && (
          <span style={{ color: 'var(--dim)' }}>{L.map.lastSeen(g.until)}</span>
        )}
        <span style={{ color: 'var(--dim)' }}>{L.map.eventCount(column.events.length)}</span>
      </div>
      {g.since === null && (
        <p style={{ color: 'var(--dim)', fontSize: 11, margin: '0 0 6px' }}>
          {g.era === BASELINE ? L.map.baselineWhy : L.map.undatedWhy}
        </p>
      )}
      {g.orgs.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>{L.map.orgsLabel}</span>
            {g.orgs.map((o) => (
              <span key={o.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11.5 }}>
                <span style={chipStyle(orgColor(o.name))}>{orgInitials(o.name)}</span>
                {o.name}<span style={{ color: 'var(--dim)' }}>×{o.docs}</span>
              </span>
            ))}
          </div>
          <p style={{ color: 'var(--dim)', fontSize: 11, margin: '3px 0 0' }}>{L.map.orgsNote}</p>
        </div>
      )}
      {/* **Every dependency gets its reason on screen.** An arrow with no reason is a teaching
          order wearing an arrowhead; writing them out is what kept the two apart when this spine
          was re-derived as feature dependencies. */}
      <div style={{ display: 'grid', gap: 3, marginBottom: 6 }}>
        <div style={{ color: 'var(--dim)', fontSize: 11.5 }}>
          {L.map.needs}{g.needs.length === 0 ? L.map.noNeeds : ''}
        </div>
        {g.needs.map((n) => (
          <div key={n.id} style={{ fontSize: 11.5, paddingLeft: 8 }}>
            <button style={{ padding: '0 6px', fontSize: 11.5 }}
              onClick={() => onPick(n.id)}>{titleOf(n.id)}</button>
            <span style={{ color: 'var(--dim)' }}>　{n.why}</span>
          </div>
        ))}
        {dependants.length > 0 && (
          <div style={{ color: 'var(--dim)', fontSize: 11.5 }}>
            {L.map.feeds}{dependants.map((d) => d.title).join('、')}
          </div>
        )}
        <div style={{ color: 'var(--dim)', fontSize: 11.5 }}>
          {L.map.lessonsLabel}
          {g.lessons.length === 0 ? L.map.noLessons : g.lessons.map((x) => `@${x}`).join('、')}
        </div>
      </div>
      {/* The rows fold away: on a 511 px screen the open column's header is most of the view,
          and the thing a reader came for — the column's own history — is in the cells below. */}
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--dim)', fontSize: 11.5 }}>
          {L.map.rowsLabel(g.rows.length)}
        </summary>
        <div style={{ marginTop: 6 }}><RowList rows={g.rows} /></div>
      </details>
    </div>
  )
}

export function FeatureMap() {
  const L = useStrings()
  const [track, setTrack] = useState<Track>('wifi')
  const [open, setOpen] = useState<string | null>(null)
  const lessonIds = useMemo(
    () => LESSONS.filter((l) => trackOf(l) === track).map((l) => l.id), [track])
  // The two documents are ~170 KB of Markdown between them; parsing is per track and memoised.
  const g = useMemo(() => graphFor(track, lessonIds), [track, lessonIds])

  const sel = g.columns.find((c) => c.group.id === open) ?? null
  /** The other half of a dependency: who would stop making sense without this one. */
  const dependants = sel === null ? []
    : g.groups.filter((x) => x.needs.some((n) => n.id === sel.group.id))

  /** Column widths decide every x in the picture, arcs included. One source, nothing measured. */
  const widths = g.columns.map((c) => (c.group.id === open ? OPEN_W : COL_W))
  const xOf = (i: number): number => GUTTER + widths.slice(0, i).reduce((a, b) => a + b, 0)
  const totalW = GUTTER + widths.reduce((a, b) => a + b, 0)
  const indexOf = (id: string): number => g.columns.findIndex((c) => c.group.id === id)

  const switchTrack = (t: Track): void => { setTrack(t); setOpen(null) }
  const needIds = new Set(sel?.group.needs.map((n) => n.id) ?? [])

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 12, display: 'grid', gap: 10,
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
        color: 'var(--dim)', alignItems: 'center' }}>
        {(['published', 'doc', 'lesson'] as TimeEvent['kind'][]).map((k) => (
          <span key={k}>
            <span style={{ display: 'inline-block', width: 10, height: 9, borderRadius: 2,
              borderLeft: `3px solid ${EVENT_COLOR[k]}`, background: 'rgba(127,127,127,.2)',
              marginRight: 4 }} />
            {L.map.event[k]}
          </span>
        ))}
        {(['core', 'draft', 'derived', 'absent'] as FeatureGroup['family'][]).map((f) => (
          <span key={f}>
            <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 2,
              background: FAMILY_COLOR[f], marginRight: 4, verticalAlign: 'middle' }} />
            {L.map.family[f]}
          </span>
        ))}
      </div>

      <details style={{ color: 'var(--dim)', fontSize: 11.5 }}>
        <summary style={{ cursor: 'pointer' }}>{L.map.axisShort}</summary>
        <p style={{ margin: '4px 0 0' }}>{L.map.axisNote}</p>
      </details>

      {/* **A scroll container's min-content height is zero**, so inside a grid it is handed
          whatever is left — 41 px of a 700 px drawing, measured at 939x511. It gets a height of
          its own, capped so the matrix never pushes the rest of the screen away. */}
      <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--panel)', maxHeight: '72vh' }}>
        <div style={{ position: 'relative', width: totalW }}>
          {/* The dependency arcs, drawn only for the open column so the strip never becomes a
              mat. Every x comes from `widths`, the array the grid itself is built from. */}
          <svg width={totalW} height={ARCS_H} style={{ display: 'block' }}
            role="img" aria-label={L.map.arcsLabel}>
            <defs>
              <marker id="fm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7"
                markerHeight="7" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--border)" />
              </marker>
            </defs>
            {sel !== null && sel.group.needs.map((n) => {
              const from = indexOf(n.id)
              const to = indexOf(sel.group.id)
              if (from < 0 || to < 0) return null
              const x1 = xOf(from) + COL_W / 2
              const x2 = xOf(to) + COL_W / 2
              return (
                <path key={n.id} fill="none" stroke={FAMILY_COLOR[sel.group.family]}
                  strokeWidth={1.4} markerEnd="url(#fm-arrow)"
                  d={`M${x1} ${ARCS_H - 3} C${x1} 4 ${x2} 4 ${x2} ${ARCS_H - 3}`}>
                  <title>{`${g.groups.find((x) => x.id === n.id)?.title} → `
                    + `${sel.group.title}　${n.why}`}</title>
                </path>
              )
            })}
          </svg>

          <div style={{ display: 'grid',
            gridTemplateColumns: `${GUTTER}px ${widths.map((w) => `${w}px`).join(' ')}` }}>
            {/* ---- the header row: features, left to right in the order they appeared ---- */}
            <div style={{ position: 'sticky', left: 0, top: 0, zIndex: 3,
              background: 'var(--panel)', borderBottom: '1px solid var(--border)',
              borderRight: '1px solid var(--border)', padding: '6px 8px', fontSize: 11,
              color: 'var(--dim)' }}>
              {L.map.timeAxis}
            </div>
            {g.columns.map((c) => {
              const on = c.group.id === open
              const need = needIds.has(c.group.id)
              return (
                <div key={c.group.id} onClick={() => setOpen(on ? null : c.group.id)}
                  style={{ position: 'sticky', top: 0, zIndex: 2, cursor: 'pointer',
                    background: on ? 'var(--panel2)' : 'var(--panel)',
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    borderTop: `3px solid ${FAMILY_COLOR[c.group.family]}`,
                    outline: need ? `1px dashed ${FAMILY_COLOR[sel!.group.family]}` : undefined,
                    outlineOffset: -2, padding: '6px 8px', alignSelf: 'start' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3 }}>
                      {c.group.title}
                    </span>
                    {c.group.open > 0 && (
                      <span title={L.map.openBadge} style={{ marginLeft: 'auto',
                        background: '#ff8a4a', color: '#111318', borderRadius: 999, fontSize: 10,
                        fontWeight: 700, padding: '0 5px' }}>{c.group.open}</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--dim)', fontSize: 10.5, marginTop: 2 }}>
                    {L.map.boxCounts(c.group.rows.length, c.group.lessons.length)}
                  </div>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden',
                    margin: '4px 0 2px' }}>
                    {(['已建模', '部分建模', '未建模'] as const).map((e) => {
                      const n = c.group.rows.filter((r) => r.engine === e).length
                      return n === 0 ? null : (
                        <span key={e} title={`${e} ${n}`}
                          style={{ flex: n, background: ENGINE_COLOR[e] }} />
                      )
                    })}
                  </div>
                  {!on && c.group.orgs.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 3 }}>
                      {c.group.orgs.slice(0, 4).map((o) => (
                        <span key={o.name} title={`${o.name}　${L.map.docCount(o.docs)}`}
                          style={chipStyle(orgColor(o.name))}>{orgInitials(o.name)}</span>
                      ))}
                      {c.group.orgs.length > 4 && (
                        <span title={c.group.orgs.slice(4).map((o) => o.name).join('、')}
                          style={chipStyle('var(--dim)')}>+{c.group.orgs.length - 4}</span>
                      )}
                    </div>
                  )}
                  {on && (
                    <OpenCard column={c} dependants={dependants} onPick={setOpen}
                      titleOf={(id) => g.groups.find((x) => x.id === id)?.title ?? id} />
                  )}
                </div>
              )
            })}

            {/* ---- one row per quarter, the published marker above them all ---- */}
            {g.matrixRows.map((r, row) => (
              <div key={r.key} style={{ display: 'contents' }}>
                <div style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--panel)',
                  borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  padding: r.events === 0 ? '0 8px' : '4px 8px',
                  fontSize: r.events === 0 ? 9.5 : 11, color: 'var(--dim)',
                  opacity: r.events === 0 ? 0.6 : 1, lineHeight: r.events === 0 ? '12px' : 1.5,
                  fontWeight: r.quarter === 1 || r.key === BASELINE ? 700 : 400 }}>
                  {r.key === BASELINE ? L.map.baseline : `${r.year} Q${r.quarter}`}
                </div>
                {g.columns.map((c) => {
                  const es = c.events.filter((e) => e.row === row)
                  const inside = c.firstRow >= 0 && row >= c.firstRow && row <= c.lastRow
                  const on = c.group.id === open
                  return (
                    <div key={c.group.id} onClick={() => setOpen(on ? null : c.group.id)}
                      style={{ borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        background: on ? 'var(--panel2)' : undefined,
                        minHeight: r.events === 0 ? 12 : ROW_H,
                        padding: r.events === 0 ? 0 : '2px 6px', cursor: 'pointer',
                        position: 'relative' }}>
                      {/* The lane: from a feature's first event to its last, so a column with a
                          gap in the middle still reads as one thing. */}
                      {inside && (
                        <span style={{ position: 'absolute', left: 3, top: 0,
                          bottom: 0, width: 2, background: 'rgba(127,127,127,.38)' }} />
                      )}
                      {es.length > 0 && (on ? <EventLines events={es} /> : <EventBlocks events={es} />)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {open === null && (
        <p style={{ color: 'var(--dim)', fontSize: 12, margin: 0 }}>{L.map.pickPrompt}</p>
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
