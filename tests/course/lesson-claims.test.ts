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
import { CCA_PD_DBM, sinrThreshDb } from '../../src/engine/phy'

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

describe('lesson 7 · EDCA', () => {
  const rs = recs('edca', 300 * MS)

  it('VO draws from a tiny window; BK from 15 up with a longer AIFS; BK’s EIFS wait is 139 µs', () => {
    // "the caller’s show AC_VO with tiny CW; the backup’s show AC_BK with CW 15+ and a longer AIFS"
    const draws = (n: string) => ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === n)
    expect(draws('sta-1').length).toBeGreaterThan(0)
    for (const d of draws('sta-1')) {
      expect(d.ac).toBe(3)
      expect([3, 7]).toContain(d.cw)
    }
    expect(draws('sta-3').length).toBeGreaterThan(0)
    for (const d of draws('sta-3')) {
      expect(d.ac).toBe(0)
      expect(d.cw).toBeGreaterThanOrEqual(15)
    }
    const ifsLens = (n: string, kind: string) => new Set(ofType(rs, 'IFS_START')
      .filter((r) => r.node === n && r.kind === kind).map((r) => r.untilNs - r.t))
    expect(ifsLens('sta-1', 'AIFS')).toEqual(new Set([34_000]))
    expect(ifsLens('sta-3', 'AIFS')).toEqual(new Set([79_000]))
    // "BK: 94 − 34 + 79 = 139 µs"
    expect(ifsLens('sta-3', 'EIFS')).toEqual(new Set([139_000]))
  })

  it('voice gets through with lower delay than the saturated uploader', () => {
    // "Voice frames get through with low delay even while the uploader saturates the channel."
    const meanDelay = (n: string) => {
      const enq = new Map<number, number>()
      const ds: number[] = []
      for (const r of rs) {
        if (r.type === 'ENQUEUE' && r.node === n) enq.set(r.msduId, r.t)
        if (r.type === 'DEQUEUE' && r.node === n && enq.has(r.msduId)) ds.push(r.t - enq.get(r.msduId)!)
      }
      expect(ds.length).toBeGreaterThan(5)
      return ds.reduce((a, b) => a + b, 0) / ds.length
    }
    expect(meanDelay('sta-1')).toBeLessThan(meanDelay('sta-2'))
    expect(meanDelay('sta-1')).toBeLessThan(meanDelay('sta-3'))
  })
})

describe('lesson 8 · A-MPDU', () => {
  it('14 MPDUs per win, behind an RTS/CTS, and about 1.5× the goodput', () => {
    const agg = recs('ampdu', 200 * MS)
    const plain = recs('ampdu', 200 * MS, 0)
    // "Watch the queue in the inspector drain 14 frames per channel win instead of 1"
    const ampdus = txs(agg, (r) => r.frame.kind === 'data')
    expect(ampdus.length).toBeGreaterThan(50)
    for (const a of ampdus) expect(a.frame.ampdu?.mpduCount).toBe(14)
    // "once the RTS/CTS that opens it and the BlockAck are counted"
    expect(txs(agg, (r) => r.t < ampdus[0].t).map((r) => r.frame.kind)).toEqual(['rts', 'cts'])
    expect(txs(agg, (r) => r.frame.kind === 'ba').length).toBeGreaterThan(50)
    expect(txs(plain, (r) => r.frame.kind === 'data').every((r) => r.frame.ampdu === undefined)).toBe(true)
    // "same PHY rate, ~1.5× the goodput here"
    const delivered = (rs: TLRecord[]) => ofType(rs, 'DEQUEUE').filter((r) => r.node === 'sta-1').length
    expect(Math.round((delivered(agg) / delivered(plain)) * 10) / 10).toBe(1.5)
    expect(new Set([...ampdus, ...txs(plain, (r) => r.frame.kind === 'data')].map((r) => r.frame.mcs))).toEqual(new Set([8]))
  })
})

describe('lesson 9 · TXOP', () => {
  const rs = recs('txop', 300 * MS)

  it('the first TXOP (≈ 0.88 ms) serves TV 2 then, one SIFS after its ACK, TV 1', () => {
    // "The “first TXOP start” jump (≈ 0.88 ms) lands on a two-receiver burst: inside one TXOP the AP
    // sends to TV 2, gets its ACK, then after one SIFS sends to TV 1 — no AIFS, no backoff in between."
    const t0 = ofType(rs, 'TXOP_START')[0]
    expect(t0.node).toBe('ap')
    expect(t0.ac).toBe(2) // "TXOP: AC_VI"
    expect(Math.round(t0.t / 10_000) / 100).toBe(0.88)
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'ap' && r.t > t0.t)!
    const inside = txs(rs, (r) => r.t >= t0.t && r.t < end.t)
    expect(inside.map((r) => `${r.frame.kind}:${r.frame.dst}`)).toEqual(['data:sta-2', 'ack:ap', 'data:sta-1', 'ack:ap'])
    expect(inside[2].t).toBe(inside[1].t + inside[1].frame.txTimeNs + 16_000)
    expect(rs.some((r) => (r.type === 'BACKOFF_DRAW' || r.type === 'IFS_START') && r.node === 'ap' && r.t > t0.t && r.t < end.t)).toBe(false)
  })

  it('later TXOPs hold one exchange about as often as two', () => {
    // "Later TXOPs hold a single exchange about as often as two: … only about half the time."
    const perTxop: number[] = []
    let cur = -1
    for (const r of rs) {
      if (r.type === 'TXOP_START' && r.node === 'ap') { if (cur >= 0) perTxop.push(cur); cur = 0 }
      if (r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data' && cur >= 0) cur++
    }
    expect(new Set(perTxop)).toEqual(new Set([1, 2]))
    const single = perTxop.filter((n) => n === 1).length / perTxop.length
    expect(single).toBeGreaterThan(0.4)
    expect(single).toBeLessThan(0.6)
  })
})

describe('lesson 10 · protecting the burst', () => {
  const boundary = recs('txop-protect', 300 * MS)
  const single = recs('txop-protect', 300 * MS, 0)

  it('the 300 ms table: single vs boundary', () => {
    // table "This scenario, 300 ms": collisions 94 / 18, frames delivered 33 / 532,
    // retries 180 / 46, frames dropped 16 / 0
    const row = (rs: TLRecord[]) => [
      ofType(rs, 'COLLISION').length,
      ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length,
      ofType(rs, 'RETRY').length,
      ofType(rs, 'DROP').length,
    ]
    expect(row(single)).toEqual([94, 33, 180, 16])
    expect(row(boundary)).toEqual([18, 532, 46, 0])
  })

  it('of the 18 remaining collisions, 13 are RTS meeting RTS and 5 catch a data frame', () => {
    // "Of the 18 collisions that remain, 13 are RTS meeting RTS — two hidden stations starting within
    // one 28 µs RTS of each other … — and 5 catch a data frame already under way."
    const cs = ofType(boundary, 'COLLISION').map((c) => collisionFrames(boundary, c))
    const rtsRts = cs.filter(({ locked }) => locked.frame.kind === 'rts')
    const data = cs.filter(({ locked }) => locked.frame.kind === 'data')
    expect([rtsRts.length, data.length]).toEqual([13, 5])
    for (const { locked, others } of rtsRts) {
      const o = others.find((f) => f.frame.kind === 'rts')!
      expect(o).toBeDefined()
      expect(Math.abs(o.t - locked.t)).toBeLessThan(28_000)
    }
    // "“first collision” (28 µs) is an RTS meeting an RTS"
    expect(ofType(boundary, 'COLLISION')[0].t).toBe(28_000)
    expect(cs[0].locked.frame.kind).toBe('rts')
  })

  it('the observe list’s RTS, CTS, NAV and CF-End timings', () => {
    // "A and B both open with an RTS at t = 0"
    expect(txs(boundary, (r) => r.t === 0).map((r) => `${r.node}:${r.frame.kind}`).sort()).toEqual(['sta-1:rts', 'sta-2:rts'])
    // "A’s third try at 0.736 ms gets through: hover its RTS (Duration 2500 µs …)"
    const aRts = txs(boundary, (r) => r.node === 'sta-1' && r.frame.kind === 'rts')
    expect(aRts[2].t).toBe(736_000)
    expect(aRts[2].frame.durationFieldNs).toBe(2_500_000)
    const top = ofType(boundary, 'TXOP_START').find((r) => r.node === 'sta-1' && r.t === 736_000)!
    expect(top.untilNs - top.t).toBe(2_528_000)
    // "and the AP’s CTS at 0.780 ms (2456 µs …)"
    const cts = txs(boundary, (r) => r.frame.kind === 'cts')[0]
    expect([cts.t, cts.frame.durationFieldNs]).toEqual([780_000, 2_456_000])
    // "Hidden B’s lane turns NAV-purple until 3.264 ms"
    const nav = ofType(boundary, 'NAV_SET').find((r) => r.node === 'sta-2')!
    expect(nav.untilNs).toBe(3_264_000)
    // "“first CF-End” (≈ 3.11 ms): after four exchanges 168 µs of A’s reservation remain"
    const cf = txs(boundary, (r) => r.frame.kind === 'cfend')
    expect(cf[0].node).toBe('sta-1')
    expect(Math.round(cf[0].t / 10_000) / 100).toBe(3.11)
    const burst = txs(boundary, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > cts.t && r.t < cf[0].t)
    expect(burst.length).toBe(4)
    const lastAck = txs(boundary, (r) => r.frame.kind === 'ack' && r.t < cf[0].t).pop()!
    const lastAckEnd = lastAck.t + lastAck.frame.txTimeNs
    expect(top.untilNs - lastAckEnd).toBe(168_000)
    expect(cf[0].t).toBe(lastAckEnd + 16_000)
    // "too little for another 1500-byte frame and its ACK"
    expect(16_000 + burst[0].frame.txTimeNs + 16_000 + lastAck.frame.txTimeNs).toBeGreaterThan(168_000)
    // "the AP repeats it one SIFS later, and B’s NAV ends at 3.184 ms instead of 3.264 ms"
    expect(cf[1].node).toBe('ap')
    expect(cf[1].t).toBe(cf[0].t + cf[0].frame.txTimeNs + 16_000)
    expect(ofType(boundary, 'NAV_CLEAR').find((r) => r.node === 'sta-2')!.t).toBe(3_184_000)
  })
})

describe('lesson 11 · OFDMA downlink', () => {
  it('every DL MU PPDU serves two TVs, and their BlockAcks start together one SIFS after it', () => {
    // "After one SIFS, several BA blocks start at the *same instant* on different lanes"
    // "here one PPDU carries frames for two TVs at once and their BlockAcks come back together"
    const rs = recs('ofdma-dl', 300 * MS)
    const mu = txs(rs, (r) => r.frame.muParts !== undefined)
    expect(mu.length).toBeGreaterThan(20)
    for (const m of mu) {
      expect(m.frame.muParts!.length).toBe(2)
      const bas = txs(rs, (r) => r.frame.kind === 'ba' && r.t === m.t + m.frame.txTimeNs + 16_000)
      expect(bas.map((r) => r.node).sort()).toEqual(m.frame.muParts!.map((p) => p.dst).sort())
    }
  })
})

describe('lesson 12 · Trigger frames', () => {
  it('between triggered bursts the stations still contend via EDCA', () => {
    // "Between triggered bursts the stations still contend normally via EDCA."
    const rs = recs('ofdma-ul', 100 * MS)
    for (const n of ['sta-1', 'sta-2']) {
      expect(ofType(rs, 'BACKOFF_DRAW').some((r) => r.node === n)).toBe(true)
      expect(txs(rs, (r) => r.node === n && r.frame.kind === 'data' && r.frame.orthogonalGroup === undefined).length).toBeGreaterThan(0)
    }
    expect(txs(rs, (r) => r.frame.kind === 'trigger').length).toBeGreaterThan(0)
  })
})

describe('lesson 13 · MLO', () => {
  it('the laptop uses both links and its traffic leans toward 6 GHz', () => {
    // "The laptop has two lanes (·6G marked); both carry data blocks drawn from one queue."
    // "The 5 GHz-only neighbor congests that band — watch the laptop’s traffic lean toward 6 GHz."
    const rs = recs('mlo', 300 * MS)
    const laptop = txs(rs, (r) => r.frame.kind === 'data' && r.frame.src === 'sta-1')
    const on6 = laptop.filter((r) => r.node.includes('#6g')), on5 = laptop.filter((r) => !r.node.includes('#6g'))
    expect(on5.length).toBeGreaterThan(0)
    const bytes = (xs: Tx[]) => xs.reduce((a, r) => a + r.frame.bytes, 0)
    expect(bytes(on6)).toBeGreaterThan(2 * bytes(on5))
  })
})

describe('lesson 15 · channel width', () => {
  it('in the far corner an 802.11a laptop falls back to 20 MHz and gets ACKs, at over a millisecond a frame', () => {
    // "switch it to 802.11a (legacy) in the editor … the link falls back to 20 MHz — and the ACKs
    // come back, at over a millisecond per frame."
    const sc = lesson('width').scenario()
    const sta = sc.nodes.find((n) => n.id === 'sta-1')!
    sta.pos = { x: 15, y: 7, z: 1 }
    sta.caps.generation = 'nonht'
    const rs = runSc(sc, 200 * MS)
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data')
    expect(txs(rs, (r) => r.frame.kind === 'ack').length).toBeGreaterThan(50)
    for (const d of data) {
      expect(d.frame.widthMhz).toBe(20)
      expect(d.frame.txTimeNs).toBeGreaterThan(1_000_000)
    }
  })
})

describe('lesson 16 · spatial streams', () => {
  it('Router 4 · Phone 2 is frame-for-frame identical to 2 streams', () => {
    // "Router 4 · Phone 2 is indistinguishable from 2 streams: the same 88.8 µs, the same blocks in the same places."
    const trace = (v: number) => txs(recs('streams', 200 * MS, v)).map((r) => [r.t, r.node, r.frame.kind, r.frame.txTimeNs])
    expect(trace(3)).toEqual(trace(1))
  })
})

describe('lesson 17 · MU-MIMO', () => {
  it('without the laptop’s backup, multi-user PPDUs of either kind become rare', () => {
    // "Turn the laptop’s backup traffic off and reload. … multi-user PPDUs — of either kind — become rare"
    for (const v of [0, 1]) {
      const share = (rs: TLRecord[]) => {
        const ap = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'data')
        return ap.filter((r) => r.frame.muParts !== undefined).length / ap.length
      }
      const sc = lesson('mumimo').variants![v].scenario()
      sc.nodes.find((n) => n.id === 'sta-4')!.profiles = []
      expect(share(runSc(sc, 500 * MS))).toBeLessThan(0.05)
      expect(share(recs('mumimo', 500 * MS, v))).toBeGreaterThan(0.3)
    }
  })
})

describe('lesson 5 and 7 · experiments', () => {
  it('lesson 5: a door on the stations’ line of sight un-hides them; a door elsewhere does not', () => {
    // "punch a door near the top of a hallway wall, on the stations’ line of sight (y ≈ 7.2) — …
    // they start hearing each other again. A door elsewhere changes nothing"
    const link = (from: number | null) => {
      const sc = lesson('hidden').scenario()
      if (from !== null) sc.walls.find((w) => w.x1 === 4 && w.x2 === 4)!.openings = [{ from, to: from + 0.9 }]
      return buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('sta-2')!
    }
    expect(link(null)).toBeLessThan(CCA_PD_DBM)
    expect(link(6.8)).toBeGreaterThan(CCA_PD_DBM)
    expect(link(1)).toBe(link(null))
    expect(link(3.5)).toBe(link(null))
  })

  it('lesson 7: two VO queues collide more often than VO beside a BE uploader', () => {
    // "Change the uploader’s traffic to voice too — watch two VO queues collide more often."
    const rate = (rs: TLRecord[]) => ofType(rs, 'COLLISION').filter((c) => c.nodes.includes('sta-1')).length
      / txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data').length
    const sc = lesson('edca').scenario()
    sc.nodes.find((n) => n.id === 'sta-2')!.profiles = ['voice']
    expect(rate(runSc(sc, 1_000 * MS))).toBeGreaterThan(1.3 * rate(recs('edca', 1_000 * MS)))
  })
})

describe('lesson 14 · capstone', () => {
  const variant = (mod: (sc: Scenario) => void) => {
    const sc = lesson('capstone').scenario()
    mod(sc)
    const sim = new Simulation(sc)
    const r = [...sim.runUntil(5000 * MS).records]
    return { v: sim.view.nodes, r }
  }
  const mean = (x: { n: number; sumNs: number }) => x.sumNs / x.n / MS
  const base = variant(() => {})
  const noBackup = variant((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
  const noMlo = variant((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
  const sensorMoved = variant((sc) => { sc.nodes.find((n) => n.id === 'sta-5')!.pos = { x: 9.8, y: 0.2, z: 1 } })

  it('“it sends two short frames in five seconds”; the backup “takes well over half of 5 GHz and most of 6 GHz”', () => {
    const sensorTx = base.r.filter((x) => x.type === 'TX_START' && x.node === 'sta-5' && x.frame.kind === 'data')
    expect(sensorTx).toHaveLength(2)
    expect(base.v['sta-1'].stats.airtimeNs / (5000 * MS)).toBeGreaterThan(0.5)
    expect(base.v['sta-1#6g'].stats.airtimeNs / (5000 * MS)).toBeGreaterThan(0.8)
  })

  it('“moving it changes nothing”', () => {
    expect(mean(sensorMoved.v['sta-4'].stats.rxLatency)).toBe(mean(base.v['sta-4'].stats.rxLatency))
  })

  it('with the backup stopped “the tablet’s page latency falls from about 58 ms to under a millisecond, and even the voice call’s halves”', () => {
    expect(mean(base.v['sta-4'].stats.rxLatency)).toBeGreaterThan(50)
    expect(mean(base.v['sta-4'].stats.rxLatency)).toBeLessThan(65)
    expect(mean(noBackup.v['sta-4'].stats.rxLatency)).toBeLessThan(1)
    expect(mean(noBackup.v['sta-3'].stats.txLatency)).toBeLessThan(mean(base.v['sta-3'].stats.txLatency) / 2)
    for (const id of ['sta-2', 'sta-3', 'sta-4', 'sta-6']) {
      const s = noBackup.v[id].stats
      expect(mean(id === 'sta-3' ? s.txLatency : s.rxLatency), id).toBeLessThan(1)
    }
  })

  it('“turn it off and the tablet waits about 100 ms” — almost twice as long', () => {
    const t = mean(noMlo.v['sta-4'].stats.rxLatency)
    expect(t).toBeGreaterThan(90)
    expect(t).toBeLessThan(110)
    expect(t / mean(base.v['sta-4'].stats.rxLatency)).toBeGreaterThan(1.5)
  })
})
