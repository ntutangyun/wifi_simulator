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
 * after a trigger that collided and was heard by nobody — originally seen in
 * lesson 9 where the Caller's VO frame started in the same slot. Lesson 12
 * (trigger-based uplink) collides a trigger within its first 30 ms.
 */
describe('a trigger nobody answers times out after 45 µs', () => {
  const lesson = LESSONS.find((l) => l.id === 'ofdma-ul')!
  const recs: TLRecord[] = new Simulation(lesson.scenario()).runUntil(30_000_000).records
  const ap = (r: TLRecord): r is TLRecord & { node: string } => 'node' in r && r.node === 'ap'
  type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>

  it('every trigger with no triggered PPDU inside 45 µs fails at exactly trigger end + 45 µs', () => {
    const ends = recs.filter((r): r is Rec<'TX_END'> => r.type === 'TX_END' && r.node === 'ap' && r.frame.kind === 'trigger')
    expect(ends.length).toBeGreaterThan(0)
    let unanswered = 0
    for (const te of ends) {
      const deadline = te.t + ACK_TIMEOUT_NS
      const started = recs.some((r) => r.type === 'RX_START' && r.node === 'ap' && r.t > te.t && r.t <= deadline)
      const timeout = recs.find((r) => r.type === 'ACK_TIMEOUT' && r.node === 'ap' && r.t > te.t && r.t <= deadline + 1)
      if (started) {
        expect(timeout, `trigger @ ${te.t}: a response started, no timeout may fire`).toBeUndefined()
        continue
      }
      unanswered++
      expect(timeout?.t, `trigger @ ${te.t} got no response`).toBe(deadline)
      expect(recs.some((r) => r.type === 'CW_CHANGE' && r.node === 'ap' && r.t === deadline), 'the failed trigger doubles the AC’s CW').toBe(true)
      const next = recs.find((r): r is Rec<'MAC_STATE'> => r.type === 'MAC_STATE' && r.node === 'ap' && r.t > te.t)!
      expect(next.t).toBeLessThanOrEqual(deadline)
      expect(next.state).not.toBe('waitAck')
    }
    // the lesson must actually exercise the unanswered case (a trigger that collided with a VO frame)
    expect(unanswered).toBeGreaterThan(0)
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
