import { player, useUi } from './store'
import { fmtNs } from './format'

const SPEEDS = [
  { us: 100, label: '×10 000 slower' },
  { us: 300, label: '×3 333 slower' },
  { us: 1000, label: '×1 000 slower' },
  { us: 3000, label: '×333 slower' },
  { us: 10_000, label: '×100 slower' },
  { us: 100_000, label: '×10 slower' },
  { us: 1_000_000, label: 'real time' },
]

export function Transport() {
  const { playheadNs, playing, buffering, speedUsPerSec, setSpeed } = useUi()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      background: 'var(--panel)', borderTop: '1px solid var(--border)',
    }}>
      <button title="previous frame exchange" onClick={() => player.stepExchange(-1)}>⏮ exch</button>
      <button title="previous event" onClick={() => player.stepEvent(-1)}>← ev</button>
      <button title="−1 slot (9 µs)" onClick={() => player.stepSlot(-1)}>−slot</button>
      <button title="−1 µs" onClick={() => player.stepMicro(-1)}>−µs</button>
      <button
        className={playing ? 'active' : ''}
        style={{ minWidth: 64 }}
        onClick={() => (playing ? player.pause() : player.play())}
      >
        {playing ? '❚❚ pause' : '▶ play'}
      </button>
      <button title="+1 µs" onClick={() => player.stepMicro(1)}>+µs</button>
      <button title="+1 slot (9 µs)" onClick={() => player.stepSlot(1)}>+slot</button>
      <button title="next event" onClick={() => player.stepEvent(1)}>ev →</button>
      <button title="next frame exchange" onClick={() => player.stepExchange(1)}>exch ⏭</button>

      <span style={{ marginLeft: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'Consolas, monospace' }}>
        t = {fmtNs(playheadNs)} s
      </span>
      {buffering && <span style={{ color: '#eab308' }}>⏳ simulating…</span>}

      <span style={{ marginLeft: 'auto', color: 'var(--dim)' }}>speed</span>
      <select value={speedUsPerSec} onChange={(e) => setSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s.us} value={s.us}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
