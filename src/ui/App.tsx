import { useState } from 'react'
import { FloorPlanEditor } from '../editor/FloorPlanEditor'
import { Viewport } from '../scene/viewport'
import { EventLog } from './EventLog'
import { Inspector } from './Inspector'
import { useUi } from './store'
import { TimelineStrip } from './TimelineStrip'
import { Transport } from './Transport'

function SidePanel() {
  const [tab, setTab] = useState<'inspector' | 'log'>('inspector')
  return (
    <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border)' }}>
        <button className={tab === 'inspector' ? 'active' : ''} onClick={() => setTab('inspector')}>🔍 Inspector</button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>📜 Event log</button>
      </div>
      <div style={{ overflow: 'hidden', display: 'grid', minHeight: 0 }}>
        {tab === 'inspector' ? <Inspector /> : <EventLog />}
      </div>
    </div>
  )
}

export function App() {
  const { mode, setMode, simError } = useUi()

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto auto', height: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px',
        background: 'var(--panel)', borderBottom: '1px solid var(--border)',
      }}>
        <strong>Wi-Fi Airtime Simulator</strong>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>IEEE 802.11 DCF · µs timescale</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>✎ Edit</button>
          <button className={mode === 'simulate' ? 'active' : ''} onClick={() => setMode('simulate')}>▶ Simulate</button>
        </div>
      </header>

      <main style={{ position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: mode === 'simulate' ? '1fr 300px' : '1fr' }}>
        <div style={{ position: 'relative' }}>
          {simError && (
            <pre style={{ color: '#f87171', padding: 16, whiteSpace: 'pre-wrap', position: 'absolute', zIndex: 5 }}>
              Simulation error: {simError}
            </pre>
          )}
          <div style={{ position: 'absolute', inset: 0 }}>
            {mode === 'edit' ? <FloorPlanEditor /> : <Viewport key="vp" />}
          </div>
        </div>
        {mode === 'simulate' && <SidePanel />}
      </main>

      {mode === 'simulate' && <TimelineStrip />}
      {mode === 'simulate' && <Transport />}
    </div>
  )
}
