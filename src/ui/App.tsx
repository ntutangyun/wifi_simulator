import { useState } from 'react'
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
  const { mode, setMode, simError, courseLoaded, simSession } = useUi()
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
  const layout = layoutFor(vp.w, vp.h)
  /** Which of the lesson and the viewport the single-column shell shows. */
  const [pane, setPane] = useState<MainPane>('course')
  /** The side panel, when it is a drawer rather than a column. Closed by default:
   *  on a small screen the content is what the reader came for. */
  const [sideOpen, setSideOpen] = useState(false)
  /** The timeline can be folded away entirely — 190 px of a 511 px screen is a
   *  lot to spend on it, and a reader following a lesson often wants the room. */
  const [timelineOpen, setTimelineOpen] = useState(true)
  const timelineH = timelineOpen ? layout.timelineH : TIMELINE_H_COLLAPSED
  /** In one column, course mode shows the lesson or the viewport, never both. */
  const showCourseCol = mode === 'course' && (!layout.singleColumn || pane === 'course')
  const showViewCol = !(mode === 'course' && layout.singleColumn && pane === 'course')

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
        <div style={{
          marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center',
          // The controls scroll among themselves rather than widening the page.
          minWidth: 0, overflowX: 'auto',
        }}>
          {/* The side panel has no column of its own at this width, so it needs a way in. */}
          {layout.sideAsDrawer && mode !== 'edit' && (
            <button className={sideOpen ? 'active' : ''} onClick={() => setSideOpen((v) => !v)}>
              {sideOpen ? L.compact.closeSide : L.compact.openSide}
            </button>
          )}
          <button className={guideOpen ? 'active' : ''} title={L.guideWindow.title} onClick={() => setGuideOpen((v) => !v)}>
            {L.panel.guide}
          </button>
          <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>{L.header.edit}</button>
          <button className={mode === 'simulate' ? 'active' : ''} onClick={() => setMode('simulate')}>{L.header.simulate}</button>
          <button className={mode === 'course' ? 'active' : ''} onClick={() => setMode('course')}>{L.header.course}</button>
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
                <Viewport key={`vp-${mode}-${simSession}`} />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: ONE_COLUMN, placeItems: 'center', height: '100%', color: 'var(--dim)', padding: 24, textAlign: 'center' }}>
                  {L.course.selectPrompt}
                </div>
              )}
            </div>
          </div>
          {stackPlayer && simActive && <TimelineStrip height={timelineH} open={timelineOpen} onToggle={() => setTimelineOpen((v) => !v)} />}
          {stackPlayer && simActive && <Transport />}
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

      {!stackPlayer && simActive && <TimelineStrip height={timelineH} open={timelineOpen} onToggle={() => setTimelineOpen((v) => !v)} />}
      {!stackPlayer && simActive && <Transport />}

      {guideOpen && <GuideWindow onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
