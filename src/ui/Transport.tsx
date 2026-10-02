import { Fragment, type ReactNode } from 'react'
import { player, useUi } from './store'
import { fmtNs } from './format'
import { useStrings } from './i18n'
import { transportOrder, type TransportItem } from './layout'

export interface TransportProps {
  /**
   * One row that scrolls sideways, with the time, play and the speed leftmost,
   * instead of a block that wraps. The shell passes `layout.rowStack`; see
   * `layout.ts` for which viewports that is and why.
   */
  rowStack?: boolean
}

export function Transport({ rowStack = false }: TransportProps = {}) {
  const { playheadNs, playing, buffering, speedUsPerSec, setSpeed } = useUi()
  const L = useStrings()

  const step = (title: string, label: string, onClick: () => void): ReactNode => (
    <button title={title} onClick={onClick}>{label}</button>
  )

  /**
   * What a readout needs to survive a row that does not wrap. `index.css` gives
   * every button and select `flex-shrink: 0`, and a span was never covered: in a
   * `nowrap` row the two spans shrank to their minimum content width instead and
   * broke their own text into a column one or two characters wide — 't = 0.000
   * 000 000 s' came out 36px wide and 60px tall, which is what set the row's
   * height. Only applied when stacked, so the wide row keeps shrinking as it did.
   */
  const noShrink: React.CSSProperties = rowStack ? { flexShrink: 0, whiteSpace: 'nowrap' } : {}

  /** Every control by name. `transportOrder` decides which goes where. */
  const items: Record<TransportItem, ReactNode> = {
    prevExch: step('previous frame exchange', L.transport.prevExch, () => player.stepExchange(-1)),
    prevEv: step('previous event', L.transport.prevEv, () => player.stepEvent(-1)),
    minusSlot: step('−1 slot (9 µs)', L.transport.minusSlot, () => player.stepSlot(-1)),
    minusUs: step('−1 µs', L.transport.minusUs, () => player.stepMicro(-1)),
    play: (
      <button
        className={playing ? 'active' : ''}
        style={{ minWidth: 72 }}
        onClick={() => (playing ? player.pause() : player.play())}
      >
        {playing ? L.transport.pause : L.transport.play}
      </button>
    ),
    plusUs: step('+1 µs', L.transport.plusUs, () => player.stepMicro(1)),
    plusSlot: step('+1 slot (9 µs)', L.transport.plusSlot, () => player.stepSlot(1)),
    nextEv: step('next event', L.transport.nextEv, () => player.stepEvent(1)),
    nextExch: step('next frame exchange', L.transport.nextExch, () => player.stepExchange(1)),
    time: (
      // The gap before the readout is a wide row's separator between the steps
      // and the numbers. Stacked, the readout is the first thing in the row and
      // the gap would only be a dent in the left edge.
      <span style={{
        marginLeft: rowStack ? 0 : 12, ...noShrink,
        fontVariantNumeric: 'tabular-nums', fontFamily: 'Consolas, monospace',
      }}>
        t = {fmtNs(playheadNs)} s
      </span>
    ),
    busy: buffering ? <span style={{ color: '#eab308', ...noShrink }}>{L.transport.simulating}</span> : null,
    speed: (
      <>
        {/* `auto` pins the speed to the right end of a wide row. In a row that
            scrolls it must not: an auto margin would eat the slack before the row
            overflows, and the speed is third from the left here, not last. */}
        <span style={{ marginLeft: rowStack ? 0 : 'auto', color: 'var(--dim)', ...noShrink }}>{L.transport.speed}</span>
        <select value={speedUsPerSec} onChange={(e) => setSpeed(Number(e.target.value))}>
          {L.transport.speeds.map((s) => (
            <option key={s.us} value={s.us}>{s.label}</option>
          ))}
        </select>
      </>
    ),
  }

  return (
    <div className={rowStack ? 'hscroll' : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      // Stacked, wrapping is the thing being avoided: a second row of buttons
      // costs the 3-D view another 40-odd px of a 511 px screen.
      flexWrap: rowStack ? 'nowrap' : 'wrap',
      // 4px rather than 6px of vertical padding (model): at `pointer: coarse`
      // `index.css` floors a button at 34px, so the row is 34 + 2 x pad + the
      // border and the padding is all that is left to trim. 4px keeps a visible
      // separation from the view above without touching the tap target.
      padding: rowStack ? '4px 8px' : '6px 10px',
      background: 'var(--panel)', borderTop: '1px solid var(--border)',
      ...(rowStack ? {
        // Native overflow scrolling, and `pan-x` so the browser does the panning.
        // The timeline below owns a horizontal one-finger drag of its own through
        // pointer events under 'pan-y'; the two never see the same finger because
        // they are separate elements, and stating the axis on each keeps it that
        // way — this row never takes a vertical drag, the strip never takes a
        // horizontal one. `contain` stops a flick past the end turning into the
        // browser's back gesture.
        overflowX: 'auto', overflowY: 'hidden',
        touchAction: 'pan-x', overscrollBehaviorX: 'contain',
      } : null),
    }}>
      {transportOrder(rowStack).map((id) => (
        <Fragment key={id}>{items[id]}</Fragment>
      ))}
    </div>
  )
}
