import { useEffect, useState } from 'react'
import { CoursePanel } from '../course/CoursePanel'
import { ColumnResizeHandle, useColumnWidth } from './columnResize'
import { FloorPlanEditor } from '../editor/FloorPlanEditor'
import { Viewport } from '../scene/viewport'
import { EventLog } from './EventLog'
import { GuideWindow } from './GuideWindow'
import { useStrings } from './i18n'
import { Inspector } from './Inspector'
import { useUi } from './store'
import { TimelineStrip } from './TimelineStrip'
import { Transport } from './Transport'
import { layoutFor, mainColumns, TIMELINE_H_COLLAPSED, type MainPane } from './layout'
import { useViewport } from './useViewport'

const tabBar: React.CSSProperties = {
  display: 'flex', gap: 2, padding: '4px 6px 0', borderBottom: '1px solid var(--border)',
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  fontSize: 11, letterSpacing: 0.5, padding: '4px 10px', border: 'none', borderRadius: '4px 4px 0 0',
  background: active ? 'var(--panel2)' : 'transparent', color: active ? 'var(--text)' : 'var(--dim)',
  borderBottom: active ? '1px solid var(--panel2)' : '1px solid transparent', marginBottom: -1,
  cursor: 'pointer',
})

/** Course column: default 340 px; it may not squeeze the viewport and side panel below ~660 px together. */
const COURSE_COL_DEFAULT = 340
const COURSE_COL_LIMITS = { min: 240, max: 900, reserve: 660 }

/**
 * Every row-only grid in the layout states this single column. Without it the
 * implicit column is `auto`, so a child wide enough to set its own width (the
 * 3-D viewport's canvas keeps the pixel width it was last given) makes the
 * column wider than the grid item and paints over the column beside it.
 */
const ONE_COLUMN = 'minmax(0, 1fr)'

type SideTab = 'inspector' | 'log'

/**
 * One right-hand column with the inspector and the event log behind tabs.
 * The inspector is the default: the log is a debugging aid that is seldom
 * needed, and giving it its own column halved the inspector's width.
 */
function SidePanel() {
  const L = useStrings()
  const [tab, setTab] = useState<SideTab>('inspector')
  const tabs: [SideTab, string][] = [['inspector', L.panel.inspector], ['log', L.panel.log]]
  return (
    <div style={{
      borderLeft: '1px solid var(--border)', background: 'var(--panel)',
      display: 'grid', gridTemplateRows: 'auto 1fr', gridTemplateColumns: ONE_COLUMN, minHeight: 0, minWidth: 0,
    }}>
      <div style={tabBar} role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} style={tabBtn(tab === id)} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ overflow: 'hidden', display: 'grid', gridTemplateColumns: ONE_COLUMN, minHeight: 0, minWidth: 0 }}>
        {tab === 'inspector' ? <Inspector /> : <EventLog />}
      </div>
    </div>
  )
}

export function App() {
  const { mode, setMode, simError, courseLoaded, simSession, viewRequest } = useUi()
  const L = useStrings()
  const [guideOpen, setGuideOpen] = useState(false)
  const [courseW, setCourseW] = useColumnWidth('wifi-sim.courseWidth', COURSE_COL_DEFAULT, COURSE_COL_LIMITS)
  const simActive = mode === 'simulate' || (mode === 'course' && courseLoaded)
  /** Course mode keeps the player under the viewport so the lesson and side columns run full height. */
  const stackPlayer = mode === 'course'

  // How the shell arranges itself for this viewport. See `layout.ts` — the
  // decision is a pure function of the two numbers so it can be tested, and the
  // hook exists because a foldable changes them without reloading the page.
  const vp = useViewport()
  const layout = layoutFor(vp.w, vp.h, vp.coarsePointer)
  /** Which of the lesson and the viewport the single-column shell shows. */
  const [pane, setPane] = useState<MainPane>('course')
  /**
   * One column: anything that sends the reader to the simulator has to bring the
   * viewport on screen. `pane` is local state and the store cannot reach it, so
   * loading a lesson left the reader on the prose with no canvas rendered at all
   * — the only thing that changed was the button's own label, from "载入并观察"
   * to "跳到那里".
   *
   * This watches `viewRequest`, not `simSession`. The two look interchangeable
   * and are not: `simSession` is also the `key` of `<Viewport>` a few lines
   * below, so every bump of it rebuilds the scene and puts the camera back at
   * its starting position. A load does restart the run and may; a jump — which
   * is `player.seekFirst`, a playhead move inside the recording already on
   * screen — must not, or "⚡ 跳到那里" would answer a missing pane with a reset
   * camera. `loadCourseScenario` therefore bumps both and the jump bumps only
   * `viewRequest`; see `store.ts` for which writer bumps which.
   *
   * `pane` still does not move into the store: what the store gained is the
   * event, not the arrangement. Simulate mode has no second pane, so the mode is
   * part of the condition.
   */
  useEffect(() => {
    if (viewRequest > 0 && mode === 'course' && layout.singleColumn) setPane('view')
    // The request alone is the dependency: this has to fire when the reader is
    // sent to the view and not when they fold the screen or tap the lesson tab
    // back, so `mode` and `layout` are read, deliberately, without being watched.
  }, [viewRequest])
  /** The side panel, when it is a drawer rather than a column. Closed by default:
   *  on a small screen the content is what the reader came for. */
  const [sideOpen, setSideOpen] = useState(false)
  /** The timeline can be folded away entirely — 190 px of a 511 px screen is a
   *  lot to spend on it, and a reader following a lesson often wants the room. */
  const [timelineOpen, setTimelineOpen] = useState(true)
  const timelineH = timelineOpen ? layout.timelineH : TIMELINE_H_COLLAPSED
  /**
   * The header's controls wear their short labels.
   *
   * 470 px cannot hold the wordmark, the pane switch and five fully labelled
   * controls. Measured in the browser at `index.css`'s coarse-pointer sizes —
   * the pointer type the device actually reports — the control row wanted
   * 441 px and had 283. The row is a `.hscroll`, and the 158 px that did not fit
   * scrolled out of sight: `▶ 仿真` sat at x 464-522 and `📚 课程` at 526-592
   * against a box ending at 462, i.e. **two of the three mode buttons were
   * entirely off screen**, with the scrollbar hidden by the class and the cut
   * falling in the 2 px gap between controls rather than through one. `.hscroll`
   * argues in `index.css` that "what the row scrolls is still visible: it cuts
   * off mid-control at the right edge" — at this width and in this mode that
   * claim is simply false, and it was the only affordance there was.
   *
   * So the fix is to stop overflowing rather than to decorate the overflow:
   * with the short labels the same measurement is 253 of 283, 30 px of room to
   * spare. What guards it is a browser check that measures each of these buttons
   * against the viewport, deliberately *not* excusing them for sitting inside a
   * declared scroller — an overflow test that skipped `.hscroll` could never
   * catch this defect coming back.
   */
  const short = layout.singleColumn
  const S = L.compact.short
  /** In one column, course mode shows the lesson or the viewport, never both. */
  const showCourseCol = mode === 'course' && (!layout.singleColumn || pane === 'course')
  const showViewCol = !(mode === 'course' && layout.singleColumn && pane === 'course')
  /**
   * The player's two strips, under the 3-D view, as two grid rows: the timeline,
   * then the controls, at every size. The stacked arrangement used to swap them so
   * the most-tapped row was off the bottom edge; the reader asked for the controls
   * at the bottom everywhere, and there is no longer an order to choose. Both call
   * sites — course mode's view pane and simulate mode — render this one value, so
   * they cannot drift into two arrangements of the same screen.
   *
   * What still varies is the row itself, and it takes its scrolling and its
   * left-to-right order as two separate props: `transportScroll` can be true
   * (unfolded, touch) without `rowStack` being true, and then the row scrolls but
   * keeps the wide order — see `layout.ts`.
   */
  const transport = <Transport scroll={layout.transportScroll} stacked={layout.rowStack} />
  const playerRows = (
    <>
      <TimelineStrip height={timelineH} open={timelineOpen} onToggle={() => setTimelineOpen((v) => !v)} />
      {transport}
    </>
  )

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto auto', gridTemplateColumns: ONE_COLUMN, height: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: layout.singleColumn ? 6 : 12,
        padding: layout.singleColumn ? '6px 8px' : '6px 12px',
        background: 'var(--panel)', borderBottom: '1px solid var(--border)',
        // Without these the row wraps its own words into vertical strips at phone
        // width and pushes the page into a horizontal scroll.
        whiteSpace: 'nowrap', minWidth: 0,
      }}>
        <strong style={{ flexShrink: 0 }}>{layout.singleColumn ? 'Wi-Fi Sim' : 'Wi-Fi Airtime Simulator'}</strong>
        {/* The subtitle is the first thing to go: it is context, not a control. */}
        {!layout.compact && <span style={{ color: 'var(--dim)', fontSize: 12 }}>{L.header.subtitle}</span>}
        {/* One column: the reader chooses which pane is on screen. It sits outside
            the scrolling group on the left, because on the right it scrolled out of
            sight — and it is the control this layout needs most. */}
        {mode === 'course' && layout.singleColumn && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className={pane === 'course' ? 'active' : ''} onClick={() => setPane('course')}>{L.compact.showCourse}</button>
            <button className={pane === 'view' ? 'active' : ''} onClick={() => setPane('view')}>{L.compact.showView}</button>
          </div>
        )}
        <div className="hscroll" style={{
          marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center',
          // The controls scroll among themselves rather than widening the page.
          // `hscroll` hides the scrollbar: at 470px wide the bar added 15px to the
          // header, which comes straight off the 3-D view below it. At any width
          // where this row does not overflow the class does nothing — and at one
          // column it is now `short` (above) that keeps it from overflowing, so
          // this scroll is the net under the labels and not the plan for them.
          minWidth: 0, overflowX: 'auto',
        }}>
          {/* The side panel has no column of its own at this width, so it needs a way in. */}
          {layout.sideAsDrawer && mode !== 'edit' && (
            <button className={sideOpen ? 'active' : ''} title={L.compact.openSide} onClick={() => setSideOpen((v) => !v)}>
              {sideOpen ? L.compact.closeSide : short ? S.openSide : L.compact.openSide}
            </button>
          )}
          <button className={guideOpen ? 'active' : ''} title={L.guideWindow.title} onClick={() => setGuideOpen((v) => !v)}>
            {short ? S.guide : L.panel.guide}
          </button>
          <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <button className={mode === 'edit' ? 'active' : ''} title={L.header.edit} onClick={() => setMode('edit')}>{short ? S.edit : L.header.edit}</button>
          <button className={mode === 'simulate' ? 'active' : ''} title={L.header.simulate} onClick={() => setMode('simulate')}>{short ? S.simulate : L.header.simulate}</button>
          <button className={mode === 'course' ? 'active' : ''} title={L.header.course} onClick={() => setMode('course')}>{short ? S.course : L.header.course}</button>
        </div>
      </header>

      <main style={{
        position: 'relative', overflow: 'hidden', display: 'grid', minHeight: 0,
        gridTemplateColumns: mainColumns(mode, layout, courseW, pane),
      }}>
        {showCourseCol && (
          <div style={{ position: 'relative', borderRight: '1px solid var(--border)', background: 'var(--panel)', overflow: 'hidden', display: 'grid', gridTemplateColumns: ONE_COLUMN, minHeight: 0, minWidth: 0 }}>
            {/* The handle drags a px width. In the compact shell the column is a
                fraction of the row, so there is no width to drag. */}
            {!layout.sideAsDrawer && (
              <ColumnResizeHandle
                edge="right" width={courseW} onWidth={setCourseW}
                onReset={() => setCourseW(COURSE_COL_DEFAULT)} title={L.panel.resizeHint}
              />
            )}
            <CoursePanel />
          </div>
        )}
        {showViewCol && (
        <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto auto', gridTemplateColumns: ONE_COLUMN, minHeight: 0, minWidth: 0 }}>
          <div style={{ position: 'relative', minHeight: 0 }}>
            {simError && (
              <pre style={{ color: '#f87171', padding: 16, whiteSpace: 'pre-wrap', position: 'absolute', zIndex: 5 }}>
                {L.simError(simError)}
              </pre>
            )}
            <div style={{ position: 'absolute', inset: 0 }}>
              {mode === 'edit' ? (
                <FloorPlanEditor />
              ) : simActive ? (
                <Viewport key={`vp-${mode}-${simSession}`} cameraButtons={layout.cameraPad} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: ONE_COLUMN, placeItems: 'center', height: '100%', color: 'var(--dim)', padding: 24, textAlign: 'center' }}>
                  {L.course.selectPrompt}
                </div>
              )}
            </div>
          </div>
          {stackPlayer && simActive && playerRows}
        </div>
        )}
        {/* A column when there is room for one, a drawer over the content when there is not. */}
        {mode !== 'edit' && !layout.sideAsDrawer && <SidePanel />}
        {mode !== 'edit' && layout.sideAsDrawer && sideOpen && (
          <>
            <div
              onClick={() => setSideOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20 }}
            />
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 21,
              width: `min(420px, 88%)`, display: 'grid', gridTemplateColumns: ONE_COLUMN,
              minHeight: 0, minWidth: 0, boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
            }}>
              <SidePanel />
            </div>
          </>
        )}
      </main>

      {!stackPlayer && simActive && playerRows}

      {guideOpen && <GuideWindow onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
