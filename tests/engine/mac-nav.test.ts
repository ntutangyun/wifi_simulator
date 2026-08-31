import { describe, it, expect } from 'vitest'
import {
  CTS_BYTES, DIFS_NS, EIFS_NS, RTS_BYTES, SIFS_NS, SLOT_NS, txTimeNs,
} from '../../src/engine/phy'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1', 'sta-2']
// all strong links: everyone decodes everyone
const STRONG = {
  'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -56, 'ap>sta-2': -56,
  'sta-1>sta-2': -58, 'sta-2>sta-1': -58,
}

const DATA_TX = txTimeNs(1428, 54)
const ACK_TX = txTimeNs(14, 24)

describe('NAV / EIFS / RTS-CTS', () => {
  it('sets NAV from an overheard data frame and defers past CCA idle (§10.3.2.4)', () => {
    const b = makeBss(NODES, STRONG)
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(10_000_000)
    const nav = b.recs('NAV_SET', 'sta-2')[0]
    expect(nav).toBeDefined()
    // Duration field of the data frame = SIFS + ACKTxTime; NAV until data end + that
    expect(nav.untilNs).toBe(1_000_000 + DATA_TX + SIFS_NS + ACK_TX)
  })

  it('uses EIFS after a corrupted reception, DIFS after a subsequent correct one (§10.3.2.3.7)', () => {
    const b = makeBss(NODES, STRONG)
    // sta-1 and sta-2 transmit at the same instant → ap (and each other? both are tx'ing) —
    // third party is the AP here; give sta-2's frame to 'ap' as well. The AP locks one frame,
    // fails on SINR → corrupt → its next access IFS is EIFS.
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_000_000, 'sta-2', msdu('sta-2', 'ap'))
    b.enqueue(1_100_000, 'ap', msdu('ap', 'sta-1')) // AP has its own downlink frame to contend for
    b.runUntil(60_000_000)
    const apIfs = b.recs('IFS_START', 'ap')
    expect(apIfs.length).toBeGreaterThan(0)
    expect(apIfs[0].kind).toBe('EIFS')
    // eventually a correct reception happens (retries get through) and the AP goes back to DIFS
    expect(apIfs.some((r) => r.kind === 'DIFS')).toBe(true)
  })

  it('runs the exact RTS–CTS–DATA–ACK sequence when PSDU exceeds the threshold (§10.3.2.9)', () => {
    const b = makeBss(NODES, STRONG, { rtsThresholdBytes: 500 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(10_000_000)
    const t0 = 1_000_000
    const rtsTime = txTimeNs(RTS_BYTES, 24) // data at 54 → rts at mandatory 24
    const ctsTime = txTimeNs(CTS_BYTES, 24)
    const starts = b.records.filter((r) => r.type === 'TX_START')
    expect(starts.map((r) => (r as { frame: { kind: string } }).frame.kind)).toEqual(['rts', 'cts', 'data', 'ack'])
    expect(starts[0].t).toBe(t0)
    expect(starts[1].t).toBe(t0 + rtsTime + SIFS_NS)
    expect(starts[2].t).toBe(t0 + rtsTime + SIFS_NS + ctsTime + SIFS_NS)
    expect(starts[3].t).toBe(t0 + rtsTime + SIFS_NS + ctsTime + SIFS_NS + DATA_TX + SIFS_NS)
    expect(b.delivered).toHaveLength(1)
  })

  it('RTS/CTS mitigates hidden-node collisions', () => {
    const HIDDEN = {
      'sta-1>ap': -60, 'ap>sta-1': -60, 'sta-2>ap': -60, 'ap>sta-2': -60,
      'sta-1>sta-2': -95, 'sta-2>sta-1': -95, // mutually hidden
    }
    const run = (rtsThresholdBytes: number) => {
      const b = makeBss(NODES, HIDDEN, { rtsThresholdBytes })
      // sustained offered load from both hidden stations
      for (let i = 0; i < 40; i++) {
        // sta-2's arrivals land 100 µs into sta-1's ~232 µs data frames: a hidden
        // sender senses idle and transmits straight into the ongoing frame.
        b.enqueue(1_000_000 + i * 1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400))
        b.enqueue(1_100_000 + i * 1_000_000, 'sta-2', msdu('sta-2', 'ap', 1400))
      }
      b.runUntil(60_000_000)
      return b.recs('COLLISION').length
    }
    const withoutRts = run(3000)
    const withRts = run(500)
    expect(withoutRts).toBeGreaterThan(5)
    expect(withRts).toBeLessThan(withoutRts)
  })

  it('releases an RTS-set NAV when no CTS follows (§10.3.2.4)', () => {
    // sta-1 sends RTS to sta-2 which is out of range → no CTS ever; ap overhears the RTS
    const b = makeBss(NODES, {
      'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-1>sta-2': -200, 'sta-2>sta-1': -200,
      'ap>sta-2': -55, 'sta-2>ap': -55,
    }, { rtsThresholdBytes: 500 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'sta-2'))
    b.runUntil(10_000_000)
    const rtsTime = txTimeNs(RTS_BYTES, 6) // rate to unknown peer floors at 6 → mandatory 6
    const rtsEnd = 1_000_000 + rtsTime
    const nav = b.recs('NAV_SET', 'ap')[0]
    expect(nav).toBeDefined()
    const clear = b.recs('NAV_CLEAR', 'ap')[0]
    const ctsTime = txTimeNs(CTS_BYTES, 6)
    expect(clear.t).toBe(rtsEnd + 2 * SIFS_NS + ctsTime + 2 * SLOT_NS)
    expect(clear.t).toBeLessThan(nav.untilNs) // released early
    expect(b.recs('CTS_TIMEOUT', 'sta-1').length).toBeGreaterThanOrEqual(1)
  })

  it('third party defers for the whole exchange, first contends at ackEnd + DIFS (timing relations §10.3.7)', () => {
    const b = makeBss(NODES, STRONG)
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_010_000, 'sta-2', msdu('sta-2', 'ap'))
    b.runUntil(20_000_000)
    const ackEnd = 1_000_000 + DATA_TX + SIFS_NS + ACK_TX
    const draw = b.recs('BACKOFF_DRAW', 'sta-2')[0]
    const tx2 = b.recs('TX_START', 'sta-2')[0]
    expect(tx2.t).toBe(ackEnd + DIFS_NS + draw.value * SLOT_NS)
  })
})
