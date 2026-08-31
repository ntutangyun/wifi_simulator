import { useState } from 'react'
import { CoursePanel } from '../course/CoursePanel'
import { FloorPlanEditor } from '../editor/FloorPlanEditor'
import { Viewport } from '../scene/viewport'
import { EventLog } from './EventLog'
import { GuideWindow } from './GuideWindow'
import { useStrings } from './i18n'
import { Inspector } from './Inspector'
import { useUi } from './store'
import { TimelineStrip } from './TimelineStrip'
import { Transport } from './Transport'

const colCaption: React.CSSProperties = {
  padding: '5px 10px 4px', fontSize: 11, color: 'var(--dim)', letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
}

/** Inspector and log stacked in their own scroll column. */
function PanelColumn({ caption, children, divider }: { caption: string; children: React.ReactNode; divider?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, minWidth: 0,
      borderRight: divider ? '1px solid var(--border)' : undefined,
    }}>
      <div style={colCaption}>{caption}</div>
      <div style={{ overflow: 'hidden', display: 'grid', minHeight: 0, minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** Inspector and event log side by side; the guide lives in the floating window. */
function SidePanel() {
  const L = useStrings()
  return (
    <div style={{
      borderLeft: '1px solid var(--border)', background: 'var(--panel)',
      display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0, minWidth: 0,
    }}>
      <PanelColumn caption={L.panel.inspector} divider><Inspector /></PanelColumn>
      <PanelColumn caption={L.panel.log}><EventLog /></PanelColumn>
    </div>
  )
}

export function App() {
  const { mode, setMode, simError, lang, setLang, courseLoaded, simSession } = useUi()
  const L = useStrings()
  const [guideOpen, setGuideOpen] = useState(false)
  const simActive = mode === 'simulate' || (mode === 'course' && courseLoaded)
  /** Course mode keeps the player under the viewport so the lesson and side columns run full height. */
  const stackPlayer = mode === 'course'

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto auto', height: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        background: 'var(--panel)', borderBottom: '1px solid var(--border)',
      }}>
        <strong>Wi-Fi Airtime Simulator</strong>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>{L.header.subtitle}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className={guideOpen ? 'active' : ''} title={L.guideWindow.title} onClick={() => setGuideOpen((v) => !v)}>
            {L.panel.guide}
          </button>
          <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>{L.header.edit}</button>
          <button className={mode === 'simulate' ? 'active' : ''} onClick={() => setMode('simulate')}>{L.header.simulate}</button>
          <button className={mode === 'course' ? 'active' : ''} onClick={() => setMode('course')}>{L.header.course}</button>
          <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
          <button className={lang === 'en' ? 'active' : ''} style={{ padding: '3px 6px' }} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'zh' ? 'active' : ''} style={{ padding: '3px 6px' }} onClick={() => setLang('zh')}>中文</button>
        </div>
      </header>

      <main style={{
        position: 'relative', overflow: 'hidden', display: 'grid', minHeight: 0,
        gridTemplateColumns:
          mode === 'simulate' ? 'minmax(0, 1fr) minmax(420px, 560px)' :
          mode === 'course' ? '340px minmax(0, 1fr) minmax(360px, 460px)' : '1fr',
      }}>
        {mode === 'course' && (
          <div style={{ borderRight: '1px solid var(--border)', background: 'var(--panel)', overflow: 'hidden', display: 'grid', minHeight: 0 }}>
            <CoursePanel />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto auto', minHeight: 0, minWidth: 0 }}>
          <div style={{ position: 'relative', minHeight: 0 }}>
            {simError && (
              <pre style={{ color: '#f87171', padding: 16, whiteSpace: 'pre-wrap', position: 'absolute', zIndex: 5 }}>
                Simulation error: {simError}
              </pre>
            )}
            <div style={{ position: 'absolute', inset: 0 }}>
              {mode === 'edit' ? (
                <FloorPlanEditor />
              ) : simActive ? (
                <Viewport key={`vp-${mode}-${simSession}`} />
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--dim)', padding: 24, textAlign: 'center' }}>
                  {L.course.selectPrompt}
                </div>
              )}
            </div>
          </div>
          {stackPlayer && simActive && <TimelineStrip />}
          {stackPlayer && simActive && <Transport />}
        </div>
        {mode !== 'edit' && <SidePanel />}
      </main>

      {!stackPlayer && simActive && <TimelineStrip />}
      {!stackPlayer && simActive && <Transport />}

      {guideOpen && <GuideWindow onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
