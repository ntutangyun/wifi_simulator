import { describe, it, expect } from 'vitest'
import { makeBss, msdu } from './helpers'

/**
 * §10.3.4.2: the no-backoff "basic access" path is only legal when the medium
 * stayed idle for the whole IFS with no deferral. If the IFS is interrupted by
 * a transmission, the station has deferred and MUST draw a random backoff
 * before it may transmit. Regression: onCcaBusy canceled the pending IFS
 * without setting needDraw, so after the medium cleared the re-armed IFS ran
 * straight into a transmission with no draw ever.
 *
 * Construction: A's frame arrives within a DIFS of a busy period it heard, so
 * its IFS is genuinely pending (not zero-length). C is deaf to everyone, so
 * C's first access transmits instantly — inside A's IFS window.
 */
describe('interrupted IFS forces a backoff draw', () => {
  it('a station whose IFS was cut short draws before transmitting', () => {
    const links: Record<string, number> = {
      'a>ap': -50, 'ap>a': -50, 'b>ap': -50, 'ap>b': -50, 'b>a': -50, 'a>b': -50,
      'c>ap': -50, 'c>a': -50, // nothing reaches C: it hears nobody
    }
    const bss = makeBss(['ap', 'a', 'b', 'c'], links, { seed: 42 })
    bss.enqueue(0, 'b', msdu('b', 'ap', 1500)) // B: TX 0-248 µs, AP ACK 264-292 → A's lastBusyEnd = 292
    bss.enqueue(297_000, 'a', msdu('a', 'ap', 1500)) // A: IFS 297-326 µs, pending, needDraw=false
    bss.enqueue(310_000, 'c', msdu('c', 'ap', 1500)) // C: deaf → transmits at 310, inside A's window
    bss.runUntil(3_000_000)

    // The scenario must actually exercise the interrupt: A's IFS at 297 µs is
    // canceled, so it has no IFS_END before A's next IFS_START.
    const aIfs = bss.records.filter((r) => (r.type === 'IFS_START' || r.type === 'IFS_END') && r.node === 'a')
    expect(aIfs[0]?.type).toBe('IFS_START')
    expect(aIfs[0]?.t).toBe(297_000)
    expect(aIfs[1]?.type, 'the 297 µs IFS must be interrupted, not completed').toBe('IFS_START')

    // The fix: having deferred, A must draw a backoff before its first TX.
    const aTx = bss.recs('TX_START', 'a')[0]
    expect(aTx, 'A must eventually transmit').toBeDefined()
    const draws = bss.recs('BACKOFF_DRAW', 'a').filter((r) => r.t <= aTx.t)
    expect(draws.length, `A transmitted at ${aTx.t} without ever drawing a backoff`).toBeGreaterThan(0)
  })
})
