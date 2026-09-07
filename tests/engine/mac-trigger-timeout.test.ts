import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { ACK_TIMEOUT_NS } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'

/**
 * §10.3.2.9 applies to a Trigger frame like any other frame that expects a
 * response: if no PHY-RXSTART for a triggered PPDU arrives within
 * SIFS + slot + RxPHYStartDelay (45 µs) after the trigger ends, the round
 * has failed. Regression: the AP armed only the end-of-window timer
 * (SIFS + up to 2 ms + SIFS) and sat in "wait ACK" for the whole window
 * after a trigger that collided and was heard by nobody — lesson 7 at
 * t = 23 133.6 µs, where the Caller's VO frame started in the same slot.
 */
describe('a trigger nobody answers times out after 45 µs', () => {
  const lesson = LESSONS.find((l) => l.id === 'edca')!
  const recs: TLRecord[] = new Simulation(lesson.scenario()).runUntil(30_000_000).records
  const ap = (r: TLRecord): r is TLRecord & { node: string } => 'node' in r && r.node === 'ap'

  it('lesson 7 @ 23 169.6 µs: the collided trigger fails at trigger end + 45 µs', () => {
    const trigEnd = recs.find((r) => r.type === 'TX_END' && r.node === 'ap' && r.frame.kind === 'trigger' && r.t >= 23_000_000)!
    expect(trigEnd.t).toBe(23_169_600)
    const deadline = trigEnd.t + ACK_TIMEOUT_NS
    // sanity: no reception began at the AP inside the response window
    expect(recs.some((r) => r.type === 'RX_START' && r.node === 'ap' && r.t > trigEnd.t && r.t <= deadline)).toBe(false)
    const timeout = recs.find((r) => r.type === 'ACK_TIMEOUT' && r.node === 'ap' && r.t > trigEnd.t)
    expect(timeout?.t).toBe(deadline)
    const cw = recs.find((r) => r.type === 'CW_CHANGE' && r.node === 'ap' && r.t === deadline)
    expect(cw, 'the failed trigger must double the AC’s CW').toBeDefined()
    const next = recs.find((r): r is Extract<TLRecord, { type: 'MAC_STATE' }> => r.type === 'MAC_STATE' && r.node === 'ap' && r.t > trigEnd.t)!
    expect(next.t).toBeLessThanOrEqual(deadline)
    expect(next.state).not.toBe('waitAck')
  })

  it('the AP never waits for a response longer than the timeout without a reception starting', () => {
    let waitSince: number | null = null
    let rxSinceWait = false
    for (const r of recs) {
      if (!ap(r)) continue
      if (r.type === 'RX_START' && waitSince !== null && r.t - waitSince <= ACK_TIMEOUT_NS) rxSinceWait = true
      if (r.type !== 'MAC_STATE') continue
      if (waitSince !== null && !rxSinceWait) {
        expect(r.t - waitSince, `silent wait from ${waitSince} to ${r.t}`).toBeLessThanOrEqual(ACK_TIMEOUT_NS + 100_000)
      }
      waitSince = r.state === 'waitAck' ? r.t : null
      rxSinceWait = false
    }
  })
})
