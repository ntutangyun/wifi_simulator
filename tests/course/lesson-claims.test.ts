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
import { buildLinkTable } from '../../src/engine/propagation'
import { sinrThreshDb } from '../../src/engine/phy'

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

/** The frames involved in a collision: the one whose reception failed, plus every overlapping
 *  station transmission from the other nodes the record names. */
function collisionFrames(rs: TLRecord[], c: Extract<TLRecord, { type: 'COLLISION' }>): { locked: Tx; others: Tx[] } {
  const all = txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
  const locked = all.filter((r) => r.t + r.frame.txTimeNs === c.t)[0]
  const others = all.filter((r) => r.node !== locked.node && r.t + r.frame.txTimeNs > locked.t)
  return { locked, others }
}

describe('lesson 4 · NAV', () => {
  const rs = recs('nav', 200 * MS)

  it('the long “waiting (DIFS)” block is 248 + 44 + 34 = 326 µs, and A resumes at 3', () => {
    // table: rest of B's data frame 248, NAV 44, DIFS 34, total 326, "Then A resumes at 3"
    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === 498_000)!
    expect(freeze.value).toBe(3)
    // "Now A knows this frame ends at 746"
    const bEnd = ofType(rs, 'TX_END').find((r) => r.node === 'sta-2' && r.t > 498_000)!
    expect(bEnd.t).toBe(746_000)
    expect(bEnd.t - freeze.t).toBe(248_000)
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === 746_000)!
    expect(nav.untilNs - nav.t).toBe(44_000)
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-1' && r.t === nav.untilNs)!
    expect(ifs.kind).toBe('DIFS')
    expect(ifs.untilNs - ifs.t).toBe(34_000)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === ifs.untilNs)!
    expect(resume.value).toBe(3)
    expect(resume.t - freeze.t).toBe(326_000)
  })

  it('NAV ends exactly when the ACK ends, and data Duration = SIFS + ACK airtime', () => {
    // "Thin purple bars under a lane = NAV; they end exactly when the ACK ends."
    // "Hover a data block: its Duration field equals SIFS + the ACK’s airtime."
    const navs = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-3' && r.source.startsWith('data:'))
    expect(navs.length).toBeGreaterThan(50)
    for (const n of navs) {
      const ack = ofType(rs, 'TX_END').find((r) => r.frame.kind === 'ack' && r.t > n.t)!
      expect(ack.t).toBe(n.untilNs)
    }
    for (const d of txs(rs, (r) => r.frame.kind === 'data')) {
      const ack = txs(rs, (r) => r.frame.kind === 'ack' && r.t > d.t)[0]
      if (ack) expect(d.frame.durationFieldNs).toBe(16_000 + ack.frame.txTimeNs)
    }
  })
})

describe('lesson 5 · hidden nodes & RTS/CTS', () => {
  const rs = recs('hidden', 3.3 * MS)

  it('B counts straight through A’s data frame and freezes only for the AP’s ACK', () => {
    // table: "A’s 1528 B data ≈ 2.29–2.82 ms … Counts straight through it — 106, 105, … 47"
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 2_200_000)[0]
    expect(a.frame.bytes).toBe(1528)
    expect(Math.round(a.t / 10_000) / 100).toBe(2.29)
    expect(Math.round((a.t + a.frame.txTimeNs) / 10_000) / 100).toBe(2.82)
    const decs = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-2' && r.t >= a.t && r.t <= a.t + a.frame.txTimeNs)
    expect(decs[0].value).toBe(106)
    expect(decs[decs.length - 1].value).toBe(47)
    expect(ofType(rs, 'BACKOFF_FREEZE').some((r) => r.node === 'sta-2' && r.t >= a.t && r.t < a.t + a.frame.txTimeNs)).toBe(false)
    // "AP’s ACK 2837–2865 µs … Freezes at 46, sits out the 28 µs ACK plus a 34 µs DIFS, resumes at 46."
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect([ack.t, ack.t + ack.frame.txTimeNs]).toEqual([2_837_000, 2_865_000])
    expect(ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-2' && r.t === ack.t)?.value).toBe(46)
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-2' && r.t === 2_865_000)!
    expect(ifs.untilNs - ifs.t).toBe(34_000)
    expect(ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-2' && r.t === ifs.untilNs)?.value).toBe(46)
    // "a final ACK carries Duration = 0, so it sets no NAV — moments later A starts its next
    // frame and B, deaf again, counts right through it"
    expect(ack.frame.durationFieldNs).toBe(0)
    expect(ofType(rs, 'NAV_SET').some((r) => r.node === 'sta-2' && r.t >= ack.t)).toBe(false)
    const next = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > ack.t)[0]
    const nextEnd = Math.min(next.t + next.frame.txTimeNs, 3_300_000)
    expect(ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-2' && r.t > next.t && r.t < nextEnd).length).toBeGreaterThan(10)
    expect(ofType(rs, 'BACKOFF_FREEZE').some((r) => r.node === 'sta-2' && r.t > next.t && r.t < nextEnd)).toBe(false)
  })

  it('RTS/CTS cuts data-frame collisions by about 95%, and the stragglers meet an RTS', () => {
    // "In this scene data collisions drop by about 95%; a few stragglers remain where a data frame meets an RTS."
    const base = recs('hidden', 300 * MS)
    const rts = recs('hidden', 300 * MS, 0)
    const withData = (rs2: TLRecord[]) => ofType(rs2, 'COLLISION').map((c) => collisionFrames(rs2, c))
      .filter(({ locked, others }) => [locked, ...others].some((f) => f.frame.kind === 'data'))
    const b = withData(base), r = withData(rts)
    expect(b.length).toBeGreaterThan(50)
    const cut = 1 - r.length / b.length
    expect(cut).toBeGreaterThanOrEqual(0.92)
    expect(cut).toBeLessThanOrEqual(0.98)
    expect(r.length).toBeGreaterThan(0)
    for (const { locked, others } of r) expect([locked, ...others].some((f) => f.frame.kind === 'rts')).toBe(true)
  })
})

describe('lesson 6 · rate anomaly', () => {
  const rs = recs('anomaly', 200 * MS)

  it('the far station’s 1044 µs frame, its 11 timeouts, and no collision mark', () => {
    // "The far station’s 1044 µs frame is destroyed in full."
    expect(txs(rs, (r) => r.t === 0 && r.node === 'sta-2')[0].frame.txTimeNs).toBe(1_044_000)
    // "Nothing on the timeline is drawn as a collision"
    expect(ofType(rs, 'COLLISION').some((r) => r.t <= 1_089_000)).toBe(false)
    // table: "ACK timeouts in 200 ms … Far 11"
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2').length).toBe(11)
    // "Both stations find the medium idle from the start, so neither needs a backoff"
    expect(ofType(rs, 'BACKOFF_DRAW').some((r) => r.t === 0)).toBe(false)
  })

  it('the capture table’s signal levels and margins', () => {
    const sc = lesson('anomaly').scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    const near = lt.get('sta-1')!.get('ap')!, far = lt.get('sta-2')!.get('ap')!
    const apAtNear = lt.get('ap')!.get('sta-1')!, farAtNear = lt.get('sta-2')!.get('sta-1')!
    // "Near data at the AP: −35 dBm, far station −75 dBm, 40 dB, 30 dB for 54 Mb/s"
    expect([Math.round(near), Math.round(far), Math.round(near - far)]).toEqual([-35, -75, 40])
    expect(sinrThreshDb(54)).toBe(30)
    // "ACK at the near station: −30 dBm, far station still on air −74 dBm, 44 dB, 21 dB"
    expect([Math.round(apAtNear), Math.round(farAtNear), Math.round(apAtNear - farAtNear)]).toEqual([-30, -74, 44])
    const ack = txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')[0]
    expect(sinrThreshDb(ack.frame.mbps!)).toBe(21)
  })

  it('comparable frame counts, four times the airtime, and a much faster near station alone', () => {
    // "both deliver a comparable number of frames (140 and 105 in the first 200 ms), yet the far
    // station holds four times the airtime."
    const acksTo = (rs2: TLRecord[], n: string) => txs(rs2, (r) => r.frame.kind === 'ack' && r.frame.dst === n).length
    expect(acksTo(rs, 'sta-1')).toBe(140)
    expect(acksTo(rs, 'sta-2')).toBe(105)
    const air = (n: string) => txs(rs, (r) => r.node === n).reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(Math.round(air('sta-2') / air('sta-1'))).toBe(4)
    // "The near station’s throughput is far below what it would get alone."
    const sc = lesson('anomaly').scenario()
    sc.nodes = sc.nodes.filter((n) => n.id !== 'sta-2')
    expect(acksTo(runSc(sc, 200 * MS), 'sta-1')).toBeGreaterThan(3 * 140)
  })

  it('the far station’s EIFS is cut short into a DIFS when a healthy frame arrives', () => {
    // lesson 3: "hovering the far station’s defer block even shows the EIFS being cut short into a
    // DIFS the moment a healthy frame arrives"
    const eifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-2' && r.kind === 'EIFS')
    const cut = eifs.filter((e) => ofType(rs, 'IFS_START').some((d) =>
      d.node === 'sta-2' && d.kind === 'DIFS' && d.t > e.t && d.t < e.untilNs
      && ofType(rs, 'RX_OK').some((ok) => ok.node === 'sta-2' && ok.t === d.t)))
    expect(cut.length).toBeGreaterThan(10)
  })
})
