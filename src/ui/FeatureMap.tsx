/**
 * **The feature map: one column per feature, one row per quarter.**
 *
 * Left to right is the order features entered the record — the published spine first, then each
 * draft feature in the quarter it was first tabled, then (with no dated event at all) the models
 * this engine built with no clause to point at. Down a column is that one feature's history:
 * every mentor document its rows cite, in the quarter it was disclosed. 「Tabled 2022-07, still
 * being argued 2026-10」 is one column, read top to bottom.
 *
 * **Clicking a column slides a panel in from the right.** It held the detail in place for one
 * iteration — the column widened to 376 px and its cells spelled themselves out — and that cost
 * the thing the layout exists for: the open column shoved every column right of it off the
 * screen, so the one view you could not get was the open feature beside its neighbours. The panel
 * does not move the grid at all; the open column keeps its highlight, its dependencies keep their
 * arcs across the strip above the grid, and the columns those point at stay outlined.
 *
 * **The lessons are in the panel, as links.** They were green blocks in the grid until the dates
 * showed what that drew: every lesson of a track was written within five weeks of every other, so
 * the blocks were one bright stripe along the bottom saying nothing about the feature above it.
 * In the panel each one is a button that opens the lesson, with the day it was added beside it.
 *
 * Everything here is computed from `docs/wifi-feature-coverage.md`,
 * `docs/uwb-feature-coverage.md`, `src/course/docMeta.json` and `src/course/lessonMeta.json`
 * (`src/course/featureGraph.ts`). There is no copy of either table: edit a row in the document
 * and this screen changes with it. The only thing authored on this side is the spine — which
 * group a row belongs to and which group needs which — and `tests/course/feature-graph.test.ts`
 * holds it to covering every row and every lesson.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  BASELINE, DOC_PATH, graphFor,
  type DocGist, type FeatureGroup, type FeatureRow, type LessonRef, type MatrixColumn,
  type StatusKind, type TimeEvent, type Track,
} from '../course/featureGraph'
import orgLogos from '../course/orgLogos.json'
import { LESSONS } from '../course/lessons'
import { trackOf } from '../course/curriculum'
import { useStrings } from './i18n'
import { useUi } from './store'

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
/** What a block is: a published clause (blue) or a mentor contribution (purple). */
const EVENT_COLOR: Record<TimeEvent['kind'], string> = {
  published: '#4aa3ff', doc: '#b07cff',
}

const ORG_LOGOS = orgLogos.logos as Record<string, { slug: string; hex: string; path: string }>

const GUTTER = 84
const COL_W = 158
const ROW_H = 28
const ARCS_H = 34
/** The panel's width. It covers the grid rather than widening a column — see the file header. */
const PANEL_W = 400

const tag = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '0 6px', borderRadius: 999, fontSize: 11,
  whiteSpace: 'nowrap', border: `1px solid ${color}`, color,
})

/**
 * **The company's own mark, where there is one.**
 *
 * `src/course/orgLogos.json` holds one 24×24 path and one brand hex per company, taken from
 * simple-icons (CC0-1.0) by `scripts/org-logos.ts` and committed — **nothing is fetched while the
 * page runs**, so the map draws the same marks with the network off and no third party learns
 * who is reading it. The marks are their owners' trademarks and are here to identify who wrote a
 * contribution, nothing more.
 *
 * Seven of the sixteen companies on these documents have no mark in that set (Qorvo, Calterah,
 * Spark, Zigpos, HaiLa, Blind Creek Associates, Ultra-radio); they keep the initials chip, whose
 * colour is a hash of the name so it is stable without a table to maintain.
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

/**
 * One company, as a mark or as its initials.
 *
 * The mark always sits on a white tile: Apple's and NXP's own colour is black, and a black mark
 * on this app's dark panel would be a company that vanishes in one theme and not the other.
 */
function OrgMark({ name, size = 15, docs }: { name: string; size?: number; docs?: number }) {
  const L = useStrings()
  const logo = ORG_LOGOS[name]
  const title = `${name}${docs === undefined ? '' : `　${L.map.docCount(docs)}`}`
  if (logo === undefined) {
    return (
      <span title={title} style={{ display: 'inline-block', width: size, height: size,
        borderRadius: 4, fontSize: size * 0.53, fontWeight: 700, color: '#fff',
        textAlign: 'center', lineHeight: `${size}px`, background: orgColor(name),
        flex: '0 0 auto' }}>{orgInitials(name)}</span>
    )
  }
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', width: size, height: size, borderRadius: 4, background: '#fff',
      flex: '0 0 auto' }}>
      <svg width={size - 3} height={size - 3} viewBox="0 0 24 24" aria-label={name}>
        <path d={logo.path} fill={logo.hex} />
      </svg>
    </span>
  )
}

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

/**
 * **What a document did, in one line of counted facts** (`DocGist`).
 *
 * 「§10.39.1 · 26 条意见 · 接受 9／修订 2／否决 11」 says more about 15-26/0408 than its title does,
 * and every number in it is a count taken from the document's own text rather than a sentence
 * lifted out of it. The last three are counts of the words Accepted / Revised / Rejected, which
 * is why they are labelled 「字样」 and not 「dispositions」.
 */
function gistLine(gist: DocGist | undefined, L: ReturnType<typeof useStrings>): string {
  if (gist === undefined) return ''
  const parts: string[] = []
  if (gist.clause !== undefined) parts.push(`§${gist.clause}`)
  if (gist.cids !== undefined) parts.push(L.map.cids(gist.cids))
  const verdicts = [
    gist.acc === undefined ? '' : `${L.map.verdict.acc} ${gist.acc}`,
    gist.rev === undefined ? '' : `${L.map.verdict.rev} ${gist.rev}`,
    gist.rej === undefined ? '' : `${L.map.verdict.rej} ${gist.rej}`,
  ].filter((x) => x !== '')
  if (verdicts.length > 0) parts.push(`${verdicts.join('／')} ${L.map.verdict.counted}`)
  return parts.join(' · ')
}

/**
 * A closed column's cell: **one block per thing that happened**, and every one of them.
 *
 * A dot could only say 「something happened here」. The block says which document it was, what
 * kind, whose marks are on it, what it did (the gist line) and what it was called. There is no
 * cap: a quarter in which fourteen comment resolutions landed on MMS ranging **is** fourteen
 * blocks tall, and hiding four of them behind a 「+N」 was hiding the one quarter that mattered
 * most.
 */
function EventBlocks({ events }: { events: TimeEvent[] }) {
  const L = useStrings()
  return (
    <div style={{ display: 'grid', gap: 3, paddingTop: 2 }}>
      {events.map((e) => {
        const gist = gistLine(e.gist, L)
        return (
          <div key={e.label} title={`${e.date === '' ? L.map.baseline : e.date}　${e.label}`
            + `${e.docKind === undefined ? '' : `　${L.map.docKind[e.docKind] ?? e.docKind}`}`
            + `${e.detail === '' ? '' : `　${e.detail}`}`
            + `${e.orgs.length > 0 ? `　${e.orgs.join('、')}` : ''}`}
          style={{ borderRadius: 4, borderLeft: `3px solid ${EVENT_COLOR[e.kind]}`,
            background: 'rgba(127,127,127,.12)', padding: '2px 4px', fontSize: 9.5,
            lineHeight: '13px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace',
                whiteSpace: 'nowrap' }}>
                {e.kind === 'published' ? L.map.baseline : e.label}
              </span>
              {e.docKind !== undefined && (
                <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                  {L.map.docKindShort[e.docKind] ?? L.map.docKind[e.docKind] ?? e.docKind}
                </span>
              )}
              <span style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                {e.orgs.map((o) => <OrgMark key={o} name={o} size={11} />)}
              </span>
            </div>
            {gist !== '' && (
              <div style={{ color: 'var(--dim)', fontSize: 9 }}>{gist}</div>
            )}
            {e.detail !== '' && (
              <div style={{ color: 'var(--dim)', fontSize: 9, display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {e.detail}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The whole column, spelled out in the panel: every event of this feature, oldest first. */
function Timeline({ events }: { events: TimeEvent[] }) {
  const L = useStrings()
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {events.map((e) => (
        <div key={e.label} style={{ fontSize: 11.5, lineHeight: 1.5 }}>
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
                <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6,
                  verticalAlign: 'middle' }}>
                  {e.orgs.map((o) => <OrgMark key={o} name={o} size={13} />)}
                </span>
              )}
              {gistLine(e.gist, L) !== '' && (
                <div style={{ color: 'var(--dim)', paddingLeft: 12 }}>{gistLine(e.gist, L)}</div>
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
 * **The lessons that teach this feature, as links that open them.**
 *
 * A lesson id was a dim 「@uwb-mms」 in the old card and a green dot in the grid, and neither was
 * something a reader could act on. This is the one place in the map that reaches into the rest of
 * the app: it selects the lesson and switches to course mode, which is what the reader meant by
 * clicking a lesson's name. The day beside it is the day the lesson was added here (git), the
 * only date in this picture this repository is answerable for.
 */
function LessonLinks({ refs }: { refs: LessonRef[] }) {
  const L = useStrings()
  const { setMode, selectLesson } = useUi()
  const open = (id: string): void => { selectLesson(id); setMode('course') }
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {refs.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline',
          flexWrap: 'wrap' }}>
          <button title={L.map.openLesson} onClick={() => open(r.id)}
            style={{ fontSize: 11.5, padding: '1px 7px', textAlign: 'left' }}>
            {r.title === '' ? `@${r.id}` : r.title}
          </button>
          <code style={{ color: 'var(--dim)', fontSize: 11 }}>@{r.id}</code>
          <span style={{ color: 'var(--dim)', fontSize: 11 }}>{L.map.lessonAdded(r.added)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * **The panel: one feature, everything the table and the corpus say about it.**
 *
 * It slides over the right edge of the map and leaves the grid where it is, so the column it
 * describes stays highlighted in place beside its neighbours.
 */
function FeaturePanel({ column, dependants, onPick, onClose, titleOf }: {
  column: MatrixColumn
  dependants: FeatureGroup[]
  onPick: (id: string) => void
  onClose: () => void
  titleOf: (id: string) => string
}) {
  const L = useStrings()
  const g = column.group
  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 30,
      width: `min(${PANEL_W}px, 94%)`, background: 'var(--panel)',
      borderLeft: `1px solid var(--border)`, boxShadow: '-10px 0 28px rgba(0,0,0,.45)',
      display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        borderTop: `3px solid ${FAMILY_COLOR[g.family]}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{g.title}</div>
          <div style={{ color: 'var(--dim)', fontSize: 11 }}>
            {L.map.family[g.family]}　{L.map.boxCounts(g.rows.length, g.lessons.length)}
          </div>
        </div>
        <button onClick={onClose} title={L.map.close}
          style={{ marginLeft: 'auto', fontSize: 12, padding: '1px 8px' }}>✕</button>
      </div>
      <div style={{ overflow: 'auto', padding: 12, fontSize: 12 }}>
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
                  <OrgMark name={o.name} docs={o.docs} />
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
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--dim)', fontSize: 11.5, marginBottom: 3 }}>
            {L.map.lessonsLabel}{g.lessonRefs.length === 0 ? L.map.noLessons : ''}
          </div>
          <LessonLinks refs={g.lessonRefs} />
        </div>
        {/* Both lists fold: at 511 px the panel is 490 px tall, and which of the two a reader came
            for depends on the question they arrived with. */}
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--dim)', fontSize: 11.5 }}>
            {L.map.rowsLabel(g.rows.length)}
          </summary>
          <div style={{ marginTop: 6 }}><RowList rows={g.rows} /></div>
        </details>
        <details open={column.events.length <= 12} style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--dim)', fontSize: 11.5 }}>
            {L.map.timelineLabel(column.events.length)}
          </summary>
          <div style={{ marginTop: 6 }}><Timeline events={column.events} /></div>
        </details>
      </div>
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

  /** Every column is one width now, so an x is arithmetic and the arcs need no measuring. */
  const xOf = (i: number): number => GUTTER + i * COL_W
  const totalW = GUTTER + g.columns.length * COL_W
  const indexOf = (id: string): number => g.columns.findIndex((c) => c.group.id === id)

  const switchTrack = (t: Track): void => { setTrack(t); setOpen(null) }
  /** Escape shuts the panel: it covers the right of the map, and ✕ is 400 px from the column. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const needIds = new Set(sel?.group.needs.map((n) => n.id) ?? [])

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
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
        {(['published', 'doc'] as TimeEvent['kind'][]).map((k) => (
          <span key={k}>
            <span style={{ display: 'inline-block', width: 10, height: 9, borderRadius: 2,
              borderLeft: `3px solid ${EVENT_COLOR[k]}`, background: 'rgba(127,127,127,.2)',
              marginRight: 4 }} />
            {L.map.event[k]}
          </span>
        ))}
      </div>

      {/* The family colours are the thinnest band of information here (they are also the colour
          of each column's top edge), so at 470 px they fold away with the long explanation
          rather than spending two of the five lines above the matrix. */}
      <details style={{ color: 'var(--dim)', fontSize: 11.5 }}>
        <summary style={{ cursor: 'pointer' }}>{L.map.axisShort}</summary>
        <p style={{ margin: '4px 0 0' }}>{L.map.axisNote}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          {(['core', 'draft', 'derived', 'absent'] as FeatureGroup['family'][]).map((f) => (
            <span key={f}>
              <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 2,
                background: FAMILY_COLOR[f], marginRight: 4, verticalAlign: 'middle' }} />
              {L.map.family[f]}
            </span>
          ))}
        </div>
      </details>

      {/* **A scroll container's min-content height is zero**, so inside a grid it is handed
          whatever is left — 41 px of a 700 px drawing, measured at 939x511. It gets a height of
          its own, capped so the matrix never pushes the rest of the screen away. */}
      {/* **A grid row whose item scrolls has a min-height of zero**, so when the chrome above
          wraps onto five lines at 470 px this row gets handed what is left — 55 px of a 2 000 px
          matrix, measured. `minHeight` is the floor that stops it; the page scrolls instead. */}
      <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--panel)', minHeight: 260, maxHeight: '72vh' }}>
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
            gridTemplateColumns: `${GUTTER}px repeat(${g.columns.length}, ${COL_W}px)` }}>
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
                  {c.group.orgs.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 3 }}>
                      {c.group.orgs.slice(0, 5).map((o) => (
                        <OrgMark key={o.name} name={o.name} docs={o.docs} />
                      ))}
                      {c.group.orgs.length > 5 && (
                        <span title={c.group.orgs.slice(5).map((o) => o.name).join('、')}
                          style={{ display: 'inline-block', width: 15, height: 15, borderRadius: 4,
                            fontSize: 8, fontWeight: 700, color: '#fff', textAlign: 'center',
                            lineHeight: '15px', background: 'var(--dim)' }}>
                          +{c.group.orgs.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                  {/* An empty column is a statement, not a hole: no document in this corpus
                      dates this feature at all. Saying so here is what keeps it from reading
                      as a drawing that failed. */}
                  {c.events.length === 0 && (
                    <div style={{ color: 'var(--dim)', fontSize: 10, marginTop: 3 }}>
                      {L.map.noDocs}
                    </div>
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
                      {es.length > 0 && <EventBlocks events={es} />}
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
    {sel !== null && (
      <FeaturePanel column={sel} dependants={dependants} onPick={setOpen}
        onClose={() => setOpen(null)}
        titleOf={(id) => g.groups.find((x) => x.id === id)?.title ?? id} />
    )}
    </div>
  )
}
