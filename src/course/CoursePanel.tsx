import { useEffect, useState } from 'react'
import { useStrings } from '../ui/i18n'
import { player, useUi } from '../ui/store'
import { LESSONS, isMigrated, lessonIndex, type Block, type Lesson } from './lessons'
import { layoutDiagram, type Paint, type Shape } from './diagram'
import {
  BASES, CONTRIBUTIONS, MODULES, TIERS, TRACKS, basisOf, citedDocs, lessonBlocks, lessonMinutes,
  teachesDraft, trackHeadings, type StandardBasis,
} from './curriculum'
import { LinkBudget } from './widgets/LinkBudget'
import { McsLadder } from './widgets/McsLadder'

type Progress = Record<string, { done?: boolean; obs?: number[] }>

const LS_KEY = 'wifi-sim.course'

function loadProgress(): Progress {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (s) return JSON.parse(s) as Progress
  } catch {
    // fresh start
  }
  return {}
}

const h4: React.CSSProperties = { margin: '12px 0 4px', fontSize: 12, color: '#d5dae3' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const prose: React.CSSProperties = { margin: '4px 0', color: '#c3c9d4' }
const formulaBox: React.CSSProperties = {
  margin: '6px 0',
  padding: '6px 8px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  color: '#e6eaf2',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
}
const tableWrap: React.CSSProperties = { margin: '6px 0', overflowX: 'auto' }
const tableStyle: React.CSSProperties = { borderCollapse: 'collapse', fontSize: 11.5, minWidth: '100%' }
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '3px 8px',
  color: '#d5dae3',
  borderBottom: '1px solid rgba(255,255,255,0.18)',
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '3px 8px',
  color: '#c3c9d4',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  verticalAlign: 'top',
}
const listStyle: React.CSSProperties = { margin: '4px 0', paddingLeft: 20, color: '#c3c9d4' }
/** `why`: the opening paragraph, a shade larger than the rest so it reads first. */
const whyStyle: React.CSSProperties = { margin: '6px 0 2px', fontSize: 13.5, color: '#d5dae3' }
/** A `watch` call-out: go and look at the simulation now. */
const watchStyle: React.CSSProperties = {
  margin: '8px 0',
  padding: 8,
  borderLeft: '3px solid var(--accent)',
  background: 'rgba(59,130,246,0.08)',
  borderRadius: '0 4px 4px 0',
}
/** `deeper` and `sources`: present but out of the way until the reader wants them. */
const summaryStyle: React.CSSProperties = { ...h4, cursor: 'pointer', listStyle: 'revert' }

/**
 * A paint role as a colour: one of the app's own CSS variables, never a literal.
 * That is the whole of the diagram's theming — a figure is as readable as the
 * panel around it because it is painted in the panel's own tokens.
 */
const PAINT: Record<Paint, string> = {
  none: 'none',
  panel: 'var(--panel)',
  panel2: 'var(--panel2)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
}

/** The dash pattern every dashed shape uses, in viewBox units. */
const DASH = '4 3'

/** One primitive shape. The component paints; `layoutDiagram` did the thinking. */
function ShapeView({ sh }: { sh: Shape }) {
  switch (sh.s) {
    case 'rect':
      return (
        <rect
          x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.r ?? 0}
          style={{ fill: PAINT[sh.fill], stroke: PAINT[sh.stroke], strokeWidth: 1, fillOpacity: sh.opacity ?? 1 }}
          strokeDasharray={sh.dash ? DASH : undefined}
        />
      )
    case 'line':
      return (
        <line
          x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2}
          style={{ stroke: PAINT[sh.stroke], strokeWidth: 1 }}
          strokeDasharray={sh.dash ? DASH : undefined}
        />
      )
    case 'poly':
      return (
        <polygon
          points={sh.points.map(([x, y]) => `${x},${y}`).join(' ')}
          style={{ fill: PAINT[sh.fill], stroke: PAINT[sh.stroke] }}
        />
      )
    default:
      return (
        <text
          x={sh.x} y={sh.y} textAnchor={sh.anchor}
          style={{ fill: PAINT[sh.fill], fontSize: sh.size, fontWeight: sh.bold ? 600 : 400, fontFamily: 'inherit' }}
        >
          {sh.text}
        </text>
      )
  }
}

/**
 * A lesson figure as inline SVG: no image, no canvas, no library, nothing to
 * click. The viewBox is what makes it scale with the course column, which the
 * reader can drag between 240 and 900 px; `maxWidth` stops a wide column from
 * blowing the type up, and `width: 100%` lets a narrow one shrink it. The
 * geometry — and the proof that no two labels collide at either end — is in
 * `src/course/diagram.ts` and its test.
 */
function DiagramView({ b }: { b: Extract<Block, { kind: 'diagram' }> }) {
  const { width, height, shapes } = layoutDiagram(b.spec)
  // what the figure is, in as few words as it is titled with: its own heading,
  // else the label a `stack` already draws over itself, else its caption
  const label = b.heading ?? ('label' in b.spec ? b.spec.label : undefined) ?? b.caption ?? ''
  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        style={{ display: 'block', width: '100%', maxWidth: 320, height: 'auto', margin: '6px 0' }}
      >
        {shapes.map((sh, i) => <ShapeView key={i} sh={sh} />)}
      </svg>
      {b.caption && <p style={{ ...prose, ...dim, fontSize: 11.5 }}>{b.caption}</p>}
    </>
  )
}

/** Render one lesson body block. */
function BlockView({ b }: { b: Block }) {
  switch (b.kind ?? 'p') {
    case 'formula': {
      const f = b as Extract<Block, { kind: 'formula' }>
      return (
        <>
          <div style={formulaBox}>{f.text}</div>
          {f.note && <p style={{ ...prose, ...dim, fontSize: 11.5 }}>{f.note}</p>}
        </>
      )
    }
    case 'table': {
      const tb = b as Extract<Block, { kind: 'table' }>
      return (
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead>
              <tr>{tb.head.map((c, i) => <th key={i} style={th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {tb.rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => {
                  const s = c
                  // short cells (numbers, "34 µs") stay on one line in the narrow panel
                  return <td key={ci} style={s.length <= 14 ? { ...td, whiteSpace: 'nowrap' } : td}>{s}</td>
                })}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'list': {
      const l = b as Extract<Block, { kind: 'list' }>
      return <ul style={listStyle}>{l.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    }
    case 'steps': {
      const l = b as Extract<Block, { kind: 'steps' }>
      return <ol style={listStyle}>{l.items.map((it, i) => <li key={i}>{it}</li>)}</ol>
    }
    case 'diagram':
      return <DiagramView b={b as Extract<Block, { kind: 'diagram' }>} />
    case 'widget': {
      const w = b as Extract<Block, { kind: 'widget' }>
      return (
        <>
          {w.widget === 'linkBudget'
            ? <LinkBudget key={JSON.stringify(w.params ?? {})} params={w.params} />
            : <McsLadder key={JSON.stringify(w.params ?? {})} params={w.params} />}
          {w.caption && <p style={{ ...prose, ...dim, fontSize: 11.5 }}>{w.caption}</p>}
        </>
      )
    }
    default:
      return <p style={prose}>{(b as Extract<Block, { kind?: 'p' }>).text}</p>
  }
}

export function CoursePanel() {
  const { courseLessonId, selectLesson, loadCourseScenario, adoptCourseScenario, courseLoaded, courseLoadedFor, requestView, markJump } = useUi()
  const L = useStrings().course

  /**
   * The documents a section is checked against. A reader deciding how much to
   * trust a number needs to know whether it came from a ratified standard or
   * from a contribution to a draft still in ballot, and that is a property of
   * the section, not of a sentence buried in the lesson's sources.
   */
  const basisLine = (bases: StandardBasis[]): string =>
    L.basis(bases.map((b) => `${BASES[b].label}（${BASES[b].status}）`).join(' · '))
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [jumpMsg, setJumpMsg] = useState('')
  const [quizPick, setQuizPick] = useState<Record<number, number>>({})
  const [quizResult, setQuizResult] = useState<Record<number, boolean>>({})

  const save = (p: Progress) => {
    setProgress(p)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p))
    } catch {
      // non-persistent
    }
  }

  const lesson = courseLessonId ? LESSONS.find((l) => l.id === courseLessonId) ?? null : null

  // reset transient lesson state on lesson change
  useEffect(() => {
    setJumpMsg('')
    setQuizPick({})
    setQuizResult({})
  }, [courseLessonId])

  const doneCount = LESSONS.filter((l) => progress[l.id]?.done).length

  // The tiers the panel lists: modules and tiers with no lesson yet are not shown,
  // and the surviving list decides where the track headings fall.
  const shownTiers = TIERS
    .map((tier, ti) => ({
      tier, ti,
      mods: MODULES.map((m, mi) => ({ m, mi })).filter(({ m, mi }) => m.tier === ti && LESSONS.some((l) => l.module === mi)),
    }))
    .filter(({ mods }) => mods.length > 0)
  const opensTrack = trackHeadings(shownTiers.map((x) => x.tier))

  if (!lesson) {
    return (
      <div style={{ padding: 12, overflowY: 'auto', fontSize: 12.5 }}>
        <h3 style={{ margin: '2px 0 2px', fontSize: 14 }}>{L.title}</h3>
        <div style={{ ...dim, marginBottom: 10 }}>{L.progressOf(doneCount, LESSONS.length)}</div>
        <div style={{ ...dim, marginBottom: 12, lineHeight: 1.5 }}>{L.selectPrompt}</div>
        {shownTiers
          .map(({ tier, ti, mods }, shown) => {
          // a track heading opens each run of tiers that teach the same radio
          const newTrack = opensTrack[shown]
          return (
          <div key={ti} style={{ marginBottom: 14 }}>
            {newTrack && (
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e6eaf2', margin: shown === 0 ? '0 0 8px' : '18px 0 8px' }}>
                {TRACKS[tier.track]}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: '#d5dae3', marginBottom: 2 }}>{tier.label}</div>
            <div style={{
              fontSize: 10.5, marginBottom: 6, lineHeight: 1.45,
              color: tier.basis.some((b) => BASES[b].draft) ? '#e0a83a' : 'var(--dim)',
            }}>
              {basisLine(tier.basis)}
            </div>
        {mods.map(({ m, mi }, mNo) => (
          <div key={mi} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 0.5, marginBottom: 4 }}>
              {L.module} {mNo + 1} · {m.title}
            </div>
            {/* only a module whose documents differ from its tier's repeats them */}
            {m.basis && (
              <div style={{
                fontSize: 10.5, marginBottom: 4, lineHeight: 1.45,
                color: teachesDraft(mi) ? '#e0a83a' : 'var(--dim)',
              }}>
                {basisLine(m.basis)}
              </div>
            )}
            {LESSONS.filter((l) => l.module === mi).map((l) => (
              <div
                key={l.id}
                onClick={() => selectLesson(l.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', cursor: 'pointer',
                  borderRadius: 4, marginBottom: 2, background: 'var(--panel2)',
                }}
              >
                <span style={{ width: 14, textAlign: 'center', color: progress[l.id]?.done ? '#22c55e' : 'var(--dim)' }}>
                  {progress[l.id]?.done ? '✓' : '○'}
                </span>
                <span style={{ ...dim, width: 18, textAlign: 'right' }}>{lessonIndex(l.id) + 1}</span>
                <span style={{ flex: 1 }}>{l.title}</span>
                <span style={{ ...dim, fontSize: 10.5 }}>{L.minutes(lessonMinutes(l))}</span>
              </div>
            ))}
          </div>
        ))}
          </div>
          )
        })}
      </div>
    )
  }

  const idx = lessonIndex(lesson.id)
  const obs = new Set(progress[lesson.id]?.obs ?? [])
  const toggleObs = (i: number) => {
    const next = new Set(obs)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    save({ ...progress, [lesson.id]: { ...progress[lesson.id], obs: [...next] } })
  }

  /**
   * Both jump buttons go through here — the one inside a `watch` call-out and
   * every entry of the "跳转" list at the foot of the lesson — so the signal
   * below is sent from one place rather than two.
   *
   * `requestView` is what tells a one-column shell to put the 3-D view on
   * screen; `player.seekFirst` moves the playhead and writes no store field, so
   * without it the jump landed on a moment the reader could not see (the prose
   * stayed up). It is sent only when the seek found the moment: a miss prints
   * `jumpMsg` into the prose, and switching away would hide the one sentence
   * that explains why nothing happened.
   *
   * `markJump` is the second half of the same thought, and it was missing for as
   * long as `requestView` was: the view being on screen does not mean the ROW is.
   * The playhead says when, and one nanosecond can hold dozens of records, so
   * the log is told which `seq` to render and scroll to. Three of the course's
   * 293 jumps used to land on a record the log then dropped — the reader got the
   * clock and the inspector, and not the line they had clicked to read
   * (`src/ui/eventLogWindow.ts`).
   *
   * `r !== null` and never `if (r)`: `seq` starts at 0, and the first record of
   * a recording is a legitimate jump target.
   *
   * `seekFirstAhead` and not `seekFirst`, because "the recording has not got
   * there yet" was never an answer to what the reader asked. Two of the
   * course's jumps point past the 2 s the lookahead buffers — `queues`
   * 「AP 第一次因生存期丢帧」 at 2.182 806 360 s and `capstone` 「第一个触发帧」 at
   * 2.453 384 778 s — so on a freshly loaded lesson those two printed a
   * sentence and did nothing, and the reader's way out was to wait three or
   * seven minutes at the default slowdown. The player now asks the worker to
   * record further and lands when it has (`src/player/player.ts`), so `done`
   * fires straight away for 289 of the 293 and a few hundred milliseconds later
   * for these two — and for the last two, `amp-slots`' variant-only pair, it
   * runs the whole search and then says so. That census and the cost of that
   * worst case are measured in `tests/ui/eventLogWindow.test.ts`; the two are
   * still listed here, because the label names the variant they belong to and
   * `observe` sends the reader to load it. `searching` is what fills that gap; it is replaced by
   * whichever outcome arrives, and a jump that resolves synchronously never
   * paints it (React batches both writes into one render).
   */
  const jump = (find: Lesson['jumps'][0]['find'], label: string) => {
    setJumpMsg(`${label}: ${L.searching}`)
    player.seekFirstAhead(find, (r) => {
      setJumpMsg(r !== null ? '' : `${label}: ${L.notFound}`)
      if (r !== null) {
        markJump(r.seq)
        requestView()
      }
    })
  }

  /**
   * Whether the scene now loaded is THIS lesson's. A jump only makes sense
   * against this lesson's own recording: another lesson's scene may not hold
   * the moment the jump looks for, and if it does it is not the one the prose
   * is about. Anything else offers "load" instead.
   */
  const loaded = courseLoaded && courseLoadedFor === lesson.id

  /**
   * A call-out that sends the reader to the simulator: it loads the lesson's
   * scenario while nothing is loaded, and once something is, seeks straight to
   * the moment the call-out is about. A call-out without a jump target just
   * says what to look at.
   */
  const watchCallout = (b: Extract<Block, { kind: 'watch' }>) => {
    const target = b.jump === undefined ? undefined : lesson.jumps[b.jump]
    return (
      <div style={watchStyle}>
        <p style={{ ...prose, margin: 0 }}>{b.text}</p>
        {!loaded && (
          <button style={{ marginTop: 6, fontSize: 11.5 }} onClick={() => loadCourseScenario(lesson.scenario(), lesson.id)}>
            {L.watchLoad}
          </button>
        )}
        {loaded && target && (
          <button style={{ marginTop: 6, fontSize: 11.5 }} onClick={() => jump(target.find, target.label)}>
            {L.watchJump}
          </button>
        )}
      </div>
    )
  }

  /** One run of blocks, each with its optional heading. */
  const blocks = (bs: Block[], key: string) => bs.map((b, i) => (
    <div key={`${lesson.id}:${key}:${i}`}>
      {b.heading && <h4 style={h4}>{b.heading}</h4>}
      {b.kind === 'watch' ? watchCallout(b) : <BlockView b={b} />}
    </div>
  ))

  return (
    <div style={{ padding: 12, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={() => selectLesson(null)}>{L.back}</button>
        <button disabled={idx <= 0} onClick={() => selectLesson(LESSONS[idx - 1].id)}>{L.prev}</button>
        <button disabled={idx >= LESSONS.length - 1} onClick={() => selectLesson(LESSONS[idx + 1].id)}>{L.next}</button>
      </div>

      <div style={{ ...dim, fontSize: 11 }}>
        {TIERS[MODULES[lesson.module].tier].label} · {MODULES[lesson.module].title} · {L.minutes(lessonMinutes(lesson))}
      </div>
      {/* Inside a lesson the section heading is off screen, so the basis is
          repeated here: a draft's numbers are not a standard's numbers. */}
      <div style={{
        fontSize: 10.5, marginTop: 2, lineHeight: 1.45,
        color: teachesDraft(lesson.module) ? '#e0a83a' : 'var(--dim)',
      }}>
        {basisLine(basisOf(lesson.module))}
        {teachesDraft(lesson.module) && ` · ${L.draftMark}`}
      </div>
      {/* Which contributions this particular lesson rests on. The basis above says
          which standard; this says which documents, because a draft lesson's
          numbers are only checkable if the reader knows where to go. */}
      {citedDocs(lesson).length > 0 && (
        <div style={{ ...dim, fontSize: 10.5, marginTop: 2, lineHeight: 1.5 }}>
          {L.contributions}
          {citedDocs(lesson).map((d) => (
            <div key={d} style={{ paddingLeft: 8 }}>
              {d}{CONTRIBUTIONS[d] ? ` — ${CONTRIBUTIONS[d]}` : ''}
            </div>
          ))}
        </div>
      )}
      <h3 style={{ margin: '4px 0 2px', fontSize: 14 }}>{idx + 1} · {lesson.title}</h3>
      {/*
        The lesson's id, and it is here BECAUSE the number beside the title drifts.
        `idx + 1` is a position in `LESSONS`, so inserting one lesson renumbers every
        lesson after it — twice in two days a reader quoted a number («UWB 第 60 课»,
        then «第 61 课»), was right both times, and was stale by one by the time it was
        answered, because a lesson had landed in front of theirs in between. Today those
        two are 61 and 62: the same pair has drifted again since.

        Not fixed by freezing the number — the number IS the reading order and is worth
        printing. Fixed by giving the reader a second handle that an insertion cannot
        move. `@uwb-dstwr` is already how this repository's own documents cite a lesson
        (hundreds of times under docs/), and until now it was the one thing about a
        lesson the reader could not read off the screen.

        Here, and not in the catalogue row: the row is the narrowest content in the
        panel and already carries four items, an id would cost all 90 rows the width of
        its longest member (`@uwb-sensing-resolution`, 23 characters) to be useful on
        one, and the reader quotes a lesson from inside it, not from the list. Not
        beside 「再深一层」 either, for a measured reason: 15 of the 90 lessons have no
        `deeper` section at all — `@edca-tamper` and `@amp-slots` among them — so the
        handle would be missing from exactly those fifteen, and it is a `<details>` shut
        by default, so on the other 75 it would be hidden until opened.

        `tests/ui/lessonHandle.test.ts` holds the half of this a unit test can see.
      */}
      <div style={{ ...dim, fontSize: 10.5, margin: '0 0 8px', lineHeight: 1.45 }}>
        {L.lessonRef}
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', whiteSpace: 'nowrap' }}>
          @{lesson.id}
        </code>
      </div>

      {!isMigrated(lesson) && blocks(lessonBlocks(lesson), 'body')}

      {isMigrated(lesson) && (
        <>
          <p style={whyStyle}>{lesson.why!}</p>

          {(lesson.outcomes ?? []).length > 0 && (
            <>
              <h4 style={h4}>{L.outcomes}</h4>
              <ul style={listStyle}>
                {lesson.outcomes!.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </>
          )}

          {(lesson.needs ?? []).length > 0 && (
            <>
              <h4 style={h4}>{L.needs}</h4>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {lesson.needs!.map((id) => (
                  <button key={id} style={{ fontSize: 11.5 }} onClick={() => selectLesson(id)}>
                    {LESSONS.find((x) => x.id === id)?.title ?? id}
                  </button>
                ))}
              </div>
            </>
          )}

          {(lesson.terms ?? []).length > 0 && (
            <>
              <h4 style={h4}>{L.terms}</h4>
              <div style={tableWrap}>
                <table style={tableStyle}>
                  <tbody>
                    {lesson.terms!.map((term) => (
                      <tr key={term.term}>
                        <td style={{ ...td, whiteSpace: 'nowrap', color: '#e6eaf2' }}>{term.term}</td>
                        <td style={td}>{term.plain}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {blocks(lesson.picture ?? [], 'picture')}

          {(lesson.numbers ?? []).length > 0 && (
            <>
              <h4 style={h4}>{L.numbers}</h4>
              {blocks(lesson.numbers!, 'numbers')}
            </>
          )}

          {(lesson.deeper ?? []).length > 0 && (
            <details style={{ margin: '10px 0 4px' }}>
              <summary style={summaryStyle}>{L.deeper}</summary>
              {blocks(lesson.deeper!, 'deeper')}
            </details>
          )}
        </>
      )}

      <div style={{ margin: '10px 0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          className="active"
          style={{ padding: '6px 10px' }}
          title={L.loadHint}
          onClick={() => loadCourseScenario(lesson.scenario(), lesson.id)}
        >
          {loaded ? L.reload : L.load}
        </button>
        {lesson.variants?.map((v, i) => (
          <button key={i} onClick={() => loadCourseScenario(v.scenario(), lesson.id)}>
            {L.variants}: {v.label}
          </button>
        ))}
        <button onClick={() => adoptCourseScenario(lesson.scenario())} style={{ fontSize: 11.5 }}>
          {L.openInEditor}
        </button>
      </div>

      {loaded && lesson.jumps.length > 0 && (
        <div style={{ margin: '8px 0' }}>
          <div style={{ ...dim, fontSize: 11, marginBottom: 3 }}>{L.jumps}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {lesson.jumps.map((j, i) => (
              <button key={i} style={{ fontSize: 11.5 }} onClick={() => jump(j.find, j.label)}>
                ⚡ {j.label}
              </button>
            ))}
          </div>
          {jumpMsg && <div style={{ color: '#eab308', fontSize: 11, marginTop: 3 }}>{jumpMsg}</div>}
        </div>
      )}

      <h4 style={h4}>{L.observe}</h4>
      {lesson.observe.map((o, i) => (
        <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '3px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={obs.has(i)} onChange={() => toggleObs(i)} style={{ marginTop: 3 }} />
          <span style={{ color: obs.has(i) ? '#8a93a3' : '#c3c9d4', textDecoration: obs.has(i) ? 'line-through' : 'none' }}>
            {o}
          </span>
        </label>
      ))}

      <h4 style={h4}>{L.tryThis}</h4>
      <ul style={{ margin: '2px 0', paddingLeft: 18, color: '#c3c9d4' }}>
        {lesson.tryThis.map((x, i) => (
          <li key={i} style={{ marginBottom: 3 }}>{x}</li>
        ))}
      </ul>

      <h4 style={h4}>{L.quiz}</h4>
      {lesson.quiz.map((q, qi) => (
        <div key={qi} style={{ margin: '6px 0 10px', padding: 8, background: 'var(--panel2)', borderRadius: 5 }}>
          <div style={{ marginBottom: 4 }}>{q.q}</div>
          {q.options.map((o, oi) => (
            <label key={oi} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '2px 0', cursor: 'pointer', fontSize: 12 }}>
              <input
                type="radio"
                name={`quiz-${lesson.id}-${qi}`}
                checked={quizPick[qi] === oi}
                onChange={() => setQuizPick({ ...quizPick, [qi]: oi })}
                style={{ marginTop: 3 }}
              />
              <span>{o}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button
              disabled={quizPick[qi] === undefined}
              onClick={() => setQuizResult({ ...quizResult, [qi]: quizPick[qi] === q.answer })}
            >
              {L.check}
            </button>
            {quizResult[qi] === true && <span style={{ color: '#22c55e', fontSize: 12 }}>{L.correct} {q.explain}</span>}
            {quizResult[qi] === false && <span style={{ color: '#f87171', fontSize: 12 }}>{L.incorrect} {q.explain}</span>}
          </div>
        </div>
      ))}

      {/* Where the model is not the radio. Open by default and above `sources`,
          unlike the provenance: a reader who never opens a collapsed section
          should still not walk away trusting the simulator further than it
          deserves. The kind is shown, because "this is simplified" without
          saying which of the four it is, is the sentence this replaced. */}
      {lesson.limits.length > 0 && (
        <div style={{
          margin: '10px 0 4px', padding: '8px 10px', borderRadius: 4,
          background: 'var(--panel2)', borderLeft: '3px solid #e0a83a',
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>{L.limits}</div>
          <ul style={{ ...listStyle, fontSize: 11.5, marginBottom: 0 }}>
            {lesson.limits.map((lim, i) => (
              <li key={i}>
                <span style={{ color: 'var(--dim)' }}>{L.limitKind[lim.kind]}　</span>
                {lim.text}
                {/* Two different promises, and the reader is meant to tell them apart:
                    `until` says the simplification is GONE in that lesson, `seeAlso` says
                    that lesson goes deeper into it while the simplification stays. They are
                    mutually exclusive on one limit, enforced in tests/course/limits.test.ts
                    rather than by a fallback here. */}
                {lim.until && (
                  <span style={{ color: 'var(--dim)' }}>
                    {' '}{L.limitUntil(LESSONS.find((x) => x.id === lim.until)?.title ?? lim.until)}
                  </span>
                )}
                {lim.seeAlso && (
                  <span style={{ color: 'var(--dim)' }}>
                    {' '}{L.limitSeeAlso(LESSONS.find((x) => x.id === lim.seeAlso)?.title ?? lim.seeAlso)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lesson.sources && lesson.sources.length > 0 && (
        <details style={{ margin: '10px 0 4px' }}>
          <summary style={summaryStyle}>{L.sources}</summary>
          <ul style={{ ...listStyle, fontSize: 11.5 }}>
            {lesson.sources.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </details>
      )}

      <button
        className={progress[lesson.id]?.done ? 'active' : ''}
        style={{ margin: '6px 0 16px', padding: '6px 10px' }}
        onClick={() => save({ ...progress, [lesson.id]: { ...progress[lesson.id], done: !progress[lesson.id]?.done } })}
      >
        {progress[lesson.id]?.done ? L.done : L.markDone}
      </button>
    </div>
  )
}
