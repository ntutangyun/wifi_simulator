/**
 * Empirical claims in the lesson prose that no other test pins: every sentence
 * that tells the reader what the simulation shows (a timestamp, a count, a ratio,
 * an ordering) is measured here against the lesson's own scenario, so an engine
 * change that makes the prose untrue fails a test instead of misleading a reader.
 *
 * Grouped by lesson; each assertion quotes the sentence it guards. Claims already
 * pinned in quoted-timestamps.test.ts or lessons.test.ts are not repeated.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!
const runSc = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
const memo = new Map<string, TLRecord[]>()
/** Records of a lesson's scenario (or variant), memoised per test file run. */
function recs(id: string, ns: number, variant?: number): TLRecord[] {
  const key = `${id}/${variant ?? '-'}/${ns}`
  if (!memo.has(key)) {
    const l = lesson(id)
    memo.set(key, runSc(variant === undefined ? l.scenario() : l.variants![variant].scenario(), ns))
  }
  return memo.get(key)!
}
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

describe('lesson 1 · airtime', () => {
  const rs = recs('airtime', 100 * MS)

  it('the ACK follows exactly one SIFS after every data block', () => {
    // "The ACK follows exactly 16 µs (one SIFS) after the data block ends."
    const ends = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'data')
    const acks = txs(rs, (r) => r.frame.kind === 'ack')
    expect(acks.length).toBeGreaterThan(50)
    for (const a of acks) {
      const d = ends.filter((e) => e.t <= a.t).pop()!
      expect(a.t - d.t).toBe(16_000)
    }
  })

  it('the video leaves the medium idle most of the time', () => {
    // "Between exchanges the channel is idle — video at this rate uses under a fifth of the airtime."
    const air = txs(rs).reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(air / (100 * MS)).toBeLessThan(0.2)
    expect(air / (100 * MS)).toBeGreaterThan(0.1)
  })
})

describe('lesson 2 · SIFS, DIFS and the ACK dance', () => {
  const rs = recs('ifs', 100 * MS)

  it('DATA→ACK is always exactly one SIFS', () => {
    // "DATA→ACK gap is always exactly one SIFS (16 µs)"
    const ends = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'data')
    const acks = txs(rs, (r) => r.frame.kind === 'ack')
    expect(acks.length).toBeGreaterThan(100)
    for (const a of acks) expect(a.t - ends.filter((e) => e.t <= a.t).pop()!.t).toBe(16_000)
  })

  it('after every ACK the station waits a DIFS and then draws a fresh backoff', () => {
    // "The station waits DIFS after the ACK before its next access attempt"
    // "After each success the station still counts down a fresh backoff — post-transmission backoff"
    const okAcks = ofType(rs, 'RX_OK').filter((r) => r.node === 'sta-1' && r.frame.kind === 'ack')
    expect(okAcks.length).toBeGreaterThan(100)
    for (const a of okAcks) {
      const next = txs(rs, (r) => r.node === 'sta-1' && r.t > a.t)[0]
      if (!next) continue
      const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-1' && r.t === a.t)!
      expect(ifs.kind).toBe('DIFS')
      expect(ifs.untilNs - ifs.t).toBe(34_000)
      expect(ofType(rs, 'BACKOFF_DRAW').some((r) => r.node === 'sta-1' && r.t >= ifs.untilNs && r.t <= next.t)).toBe(true)
    }
  })
})
