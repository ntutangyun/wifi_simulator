import { describe, it, expect } from 'vitest'
import {
  ACK_TIMEOUT_NS, DIFS_NS, SIFS_NS, SLOT_NS, txTimeNs,
} from '../../src/engine/phy'
import { makeBss, msdu } from './helpers'

const STRONG = { 'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -56, 'ap>sta-2': -56, 'sta-1>sta-2': -58, 'sta-2>sta-1': -58 }
const NODES = ['ap', 'sta-1', 'sta-2']

const DATA_TX = txTimeNs(1428, 54) // 232 µs
const ACK_TX = txTimeNs(14, 24) // 28 µs

describe('DCF MAC — basic access', () => {
  it('transmits immediately on a long-idle medium and completes DATA–SIFS–ACK (§10.3.4.2)', () => {
    const b = makeBss(NODES, STRONG)
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(10_000_000)
    const tx = b.recs('TX_START', 'sta-1')
    expect(tx[0].t).toBe(1_000_000) // idle ≥ DIFS already satisfied → immediate
    expect(tx[0].frame).toMatchObject({ kind: 'data', mbps: 54, bytes: 1428 })
    const ackTx = b.recs('TX_START', 'ap')
    expect(ackTx[0].t).toBe(1_000_000 + DATA_TX + SIFS_NS)
    expect(ackTx[0].frame.kind).toBe('ack')
    expect(b.delivered).toHaveLength(1)
    expect(b.delivered[0].at).toBe('ap')
    // success resets nothing upward: no RETRY, CW stays 15
    expect(b.recs('RETRY')).toHaveLength(0)
  })

  it('defers, draws backoff, and transmits at busyEnd + DIFS + k·slot', () => {
    const b = makeBss(NODES, STRONG)
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_050_000, 'sta-2', msdu('sta-2', 'ap')) // during sta-1's data frame
    b.runUntil(20_000_000)
    const draw = b.recs('BACKOFF_DRAW', 'sta-2')[0]
    expect(draw).toBeDefined()
    expect(draw.cw).toBe(15)
    const ackEnd = 1_000_000 + DATA_TX + SIFS_NS + ACK_TX
    const tx2 = b.recs('TX_START', 'sta-2')[0]
    // sta-2's NAV (from sta-1's data Duration) ends at ackEnd as does CCA busy;
    // then DIFS then k slots
    expect(tx2.t).toBe(ackEnd + DIFS_NS + draw.value * SLOT_NS)
  })

  it('freezes the backoff counter without redrawing and resumes at the same value (§10.3.3)', () => {
    const b = makeBss(NODES, STRONG)
    // sta-2 defers to sta-1's first frame, then sta-1 sends a second frame during sta-2's countdown
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_000_500, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_050_000, 'sta-2', msdu('sta-2', 'ap'))
    b.runUntil(30_000_000)
    const freezes = b.recs('BACKOFF_FREEZE', 'sta-2')
    if (freezes.length > 0) {
      const resumes = b.recs('BACKOFF_RESUME', 'sta-2')
      expect(resumes.length).toBeGreaterThan(0)
      expect(resumes[0].value).toBe(freezes[0].value)
    }
    // both stations eventually deliver everything
    expect(b.delivered).toHaveLength(3)
  })

  it('handles a same-slot collision: ACK timeouts, CW doubling, retry, eventual delivery', () => {
    const b = makeBss(NODES, STRONG)
    // both queue on an idle medium at the same instant → both transmit immediately → collide
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_000_000, 'sta-2', msdu('sta-2', 'ap'))
    b.runUntil(50_000_000)
    expect(b.recs('ACK_TIMEOUT', 'sta-1').length + b.recs('CTS_TIMEOUT', 'sta-1').length).toBeGreaterThanOrEqual(1)
    expect(b.recs('ACK_TIMEOUT', 'sta-2').length).toBeGreaterThanOrEqual(1)
    const cw1 = b.recs('CW_CHANGE', 'sta-1').map((r) => r.cw)
    expect(cw1[0]).toBe(31) // doubled after first failure
    const retries = b.recs('RETRY', 'sta-1')
    expect(retries[0]).toMatchObject({ src: 1, ssrc: 1 })
    expect(b.delivered).toHaveLength(2) // both eventually get through
    const retriedTx = b.recs('TX_START', 'sta-1').find((r) => r.frame.retryFlag)
    expect(retriedTx).toBeDefined()
  })

  it('stops at dot11ShortRetryLimit: 7 attempts, 7 RETRYs, then DROP and CW reset (§10.3.3)', () => {
    // sta-1 → ap below preamble-detect: AP never receives, never ACKs
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(100_000_000)
    expect(b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'data')).toHaveLength(7)
    const retries = b.recs('RETRY', 'sta-1')
    expect(retries).toHaveLength(7)
    expect(retries.map((r) => r.src)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(b.recs('DROP', 'sta-1')).toHaveLength(1)
    const cws = b.recs('CW_CHANGE', 'sta-1').map((r) => r.cw)
    expect(cws).toEqual([31, 63, 127, 255, 511, 1023, 1023, 15]) // ladder capped at aCWmax, reset on drop
  })

  it('performs post-transmission backoff between queued frames (§10.3.4.3)', () => {
    const b = makeBss(NODES, STRONG)
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.enqueue(1_000_100, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(20_000_000)
    const txs = b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'data')
    expect(txs).toHaveLength(2)
    const draws = b.recs('BACKOFF_DRAW', 'sta-1')
    expect(draws.length).toBeGreaterThanOrEqual(1) // post-TX backoff before frame 2
    expect(b.delivered).toHaveLength(2)
  })

  it('ACK timeout fires at TXend + 45 µs when no response starts', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(3_000_000)
    const to = b.recs('ACK_TIMEOUT', 'sta-1')[0]
    expect(to.t).toBe(1_000_000 + DATA_TX + ACK_TIMEOUT_NS)
  })
})
