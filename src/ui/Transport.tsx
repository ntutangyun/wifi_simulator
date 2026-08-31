import { player, useUi } from './store'
import { fmtNs } from './format'
import { useStrings } from './i18n'

export function Transport() {
  const { playheadNs, playing, buffering, speedUsPerSec, setSpeed } = useUi()
  const L = useStrings()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      background: 'var(--panel)', borderTop: '1px solid var(--border)',
    }}>
      <button title="previous frame exchange" onClick={() => player.stepExchange(-1)}>{L.transport.prevExch}</button>
      <button title="previous event" onClick={() => player.stepEvent(-1)}>{L.transport.prevEv}</button>
      <button title="−1 slot (9 µs)" onClick={() => player.stepSlot(-1)}>{L.transport.minusSlot}</button>
      <button title="−1 µs" onClick={() => player.stepMicro(-1)}>{L.transport.minusUs}</button>
      <button
        className={playing ? 'active' : ''}
        style={{ minWidth: 72 }}
        onClick={() => (playing ? player.pause() : player.play())}
      >
        {playing ? L.transport.pause : L.transport.play}
      </button>
      <button title="+1 µs" onClick={() => player.stepMicro(1)}>{L.transport.plusUs}</button>
      <button title="+1 slot (9 µs)" onClick={() => player.stepSlot(1)}>{L.transport.plusSlot}</button>
      <button title="next event" onClick={() => player.stepEvent(1)}>{L.transport.nextEv}</button>
      <button title="next frame exchange" onClick={() => player.stepExchange(1)}>{L.transport.nextExch}</button>

      <span style={{ marginLeft: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'Consolas, monospace' }}>
        t = {fmtNs(playheadNs)} s
      </span>
      {buffering && <span style={{ color: '#eab308' }}>{L.transport.simulating}</span>}

      <span style={{ marginLeft: 'auto', color: 'var(--dim)' }}>{L.transport.speed}</span>
      <select value={speedUsPerSec} onChange={(e) => setSpeed(Number(e.target.value))}>
        {L.transport.speeds.map((s) => (
          <option key={s.us} value={s.us}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
