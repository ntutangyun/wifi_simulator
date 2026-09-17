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

describe('lesson 3 · random backoff & collisions', () => {
  const rs = recs('backoff', 300 * MS)
  const both = ['sta-1', 'sta-2']

  it('the retry’s DIFS is counted from the end of the ACK timeout', () => {
    // "So the retry’s DIFS is counted from the end of the timeout — 293 µs — and the fresh
    // backoff is drawn only at 327 µs, a full 34 µs later."
    for (const n of both) {
      const ifs = ofType(rs, 'IFS_START').find((r) => r.node === n && r.t === 293_000)!
      expect(ifs.kind).toBe('DIFS')
      expect(ifs.untilNs).toBe(327_000)
      const draw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === n && r.t > 248_000)!
      expect(draw.t).toBe(327_000)
      // "After a collision, both stations show CW → 31"
      expect(draw.cw).toBe(31)
      expect(ofType(rs, 'CW_CHANGE').find((r) => r.node === n && r.t === 293_000)?.cw).toBe(31)
      // "the retry frame carries the Retry flag"
      expect(txs(rs, (r) => r.node === n && r.t > 293_000)[0].frame.retryFlag).toBe(true)
    }
  })

  it('the first collision is a t = 0 start with no backoff; the next is a same-slot countdown', () => {
    // "That first one happens at the very start — both stations find the medium already idle at
    // t = 0 and transmit at once, with no backoff at all."
    const cols = ofType(rs, 'COLLISION')
    expect(cols[0].t).toBe(248_000)
    expect(txs(rs, (r) => r.t === 0).map((r) => r.node).sort()).toEqual(both)
    expect(ofType(rs, 'BACKOFF_DRAW').some((r) => r.t < 248_000)).toBe(false)
    // "The next one, at about 8.1 ms, is the classic kind: step backwards from it and watch both
    // backoff counters reach zero in the same slot"
    const second = cols[1]
    expect(Math.round(second.t / 100_000) / 10).toBe(8.1)
    const starts = txs(rs, (r) => r.frame.kind === 'data' && r.t < second.t && r.t + r.frame.txTimeNs >= second.t)
    expect(starts.map((r) => r.node).sort()).toEqual(both)
    expect(starts[0].t).toBe(starts[1].t)
    for (const n of both) {
      expect(ofType(rs, 'BACKOFF_DEC').some((r) => r.node === n && r.t === starts[0].t && r.value === 0)).toBe(true)
    }
  })

  it('idle slots between DIFS end and TX start equal the drawn value', () => {
    // "Count the idle slots between DIFS end and TX start — it always equals the drawn backoff value."
    const last = new Map<string, { t: number; v: number; frozen: boolean }>()
    let checked = 0
    for (const r of rs) {
      if (r.type === 'BACKOFF_DRAW') last.set(r.node, { t: r.t, v: r.value, frozen: false })
      if (r.type === 'BACKOFF_FREEZE' && last.has(r.node)) last.get(r.node)!.frozen = true
      if (r.type === 'TX_START' && r.frame.kind === 'data' && last.has(r.node)) {
        const d = last.get(r.node)!
        if (!d.frozen) {
          expect(r.t - d.t).toBe(d.v * 9_000)
          checked++
        }
        last.delete(r.node)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('frozen counters resume at the same value, and retries draw from a wider window', () => {
    // "they freeze when the other station transmits and resume at the same value"
    for (const n of both) {
      const ev = rs.filter((r): r is Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }> =>
        (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === n)
      let pairs = 0
      for (let i = 0; i + 1 < ev.length; i++) {
        if (ev[i].type === 'BACKOFF_FREEZE' && ev[i + 1].type === 'BACKOFF_RESUME') {
          expect(ev[i + 1].value).toBe(ev[i].value)
          pairs++
        }
      }
      expect(pairs).toBeGreaterThan(50)
    }
    // "Retries draw from the doubled window: gaps before retransmissions are visibly longer on average."
    const mean = (cw: number) => {
      const v = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.cw === cw).map((r) => r.value)
      return v.reduce((a, b) => a + b, 0) / v.length
    }
    expect(mean(31)).toBeGreaterThan(1.5 * mean(15))
  })
})
