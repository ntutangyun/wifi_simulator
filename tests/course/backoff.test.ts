/**
 * Every empirical claim in "Random backoff & collisions", measured against the
 * lesson's own scene (two saturated legacy stations and one access point).
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * retry's DIFS counted from the end of the timeout, the t = 0 first collision
 * and the same-slot second one, the idle-slot count, the freeze-and-resume
 * pairs and the wider retry window — are re-asserted here beside the sentences
 * that now carry them (several of which moved into `numbers` or `deeper`); the
 * originals stay where they are, so no pin is lost. The lesson never had a
 * `.body!` site in any test.
 */
import { describe, it, expect } from 'vitest'
import { backoff } from '../../src/course/tier1/backoff'
import { ScenarioSchema } from '../../src/model/scenario'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TIMEOUT_NS, CW_MAX, CW_MIN, RX_START_DELAY_NS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS } from '../../src/engine/phy'

const MS = 1_000_000
/** 300 ms: the window every count in the "draws this run makes" table is taken over. */
const RUN_NS = 300 * MS
const BOTH = ['sta-1', 'sta-2']

const recs = (): TLRecord[] => runOf(backoff, undefined, RUN_NS)
const draws = () => ofType(recs(), 'BACKOFF_DRAW')
const data = () => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'data')
const meanOf = (cw: number): number => {
  const v = draws().filter((r) => r.cw === cw).map((r) => r.value)
  return v.reduce((a, b) => a + b, 0) / v.length
}

lessonShapeSuite(backoff, { runNs: RUN_NS })

describe('backoff · the lesson’s own scene', () => {
  it('follows ifs and owns the contention window', () => {
    expect(backoff.module).toBe(1)
    expect(backoff.needs).toEqual(['ifs'])
    // the owner table of the readability programme gives this lesson CW; `backoff` and
    // `ACK timeout` come with it, because they are the other two words the mechanism needs.
    expect(backoff.terms!.map((t) => t.term)).toEqual(['backoff', 'CW', 'ACK timeout'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(backoff.scenario())).not.toThrow()
    expect(backoff.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
  })
})

describe('backoff · the draws this run makes', () => {
  it('the three windows, their counts and their mean draws are the run’s own', () => {
    // the "draws this run makes" table: CW = 15 · 770 · 7.15 / CW = 31 · 89 · 16.07 /
    //  CW = 63 · 5 · 23.80, and the sentence "only five draws in the run come from a
    //  window as wide as 63"
    expect(CW_MIN).toBe(15)
    const byCw = new Map<number, number>()
    for (const d of draws()) byCw.set(d.cw, (byCw.get(d.cw) ?? 0) + 1)
    expect([...byCw.keys()].sort((a, b) => a - b)).toEqual([15, 31, 63])
    expect(byCw.get(15)).toBe(770)
    expect(byCw.get(31)).toBe(89)
    expect(byCw.get(63)).toBe(5)
    expect(meanOf(15).toFixed(2)).toBe('7.15')
    expect(meanOf(31).toFixed(2)).toBe('16.07')
    expect(meanOf(63).toFixed(2)).toBe('23.80')
    // every draw really does come from [0, CW]
    for (const d of draws()) expect(d.value).toBeGreaterThanOrEqual(0), expect(d.value).toBeLessThanOrEqual(d.cw)
  })

  it('the window ladder is the engine’s: floor 15, twice plus one, ceiling 1023, reset at seven', () => {
    // the procedure's steps 1, 5, 6 and 7, against bumpQsrc and resetQsrc in
    // src/engine/mac.ts. Proved over the whole ladder, not only the 15 → 31 this run reaches.
    expect(CW_MIN).toBe(15)
    expect(CW_MAX).toBe(1023)
    expect(SHORT_RETRY_LIMIT).toBe(7)
    const ladder = [CW_MIN]
    while (ladder[ladder.length - 1] < CW_MAX) ladder.push(Math.min(2 * ladder[ladder.length - 1] + 1, CW_MAX))
    expect(ladder).toEqual([15, 31, 63, 127, 255, 511, 1023])
    // and every window change either widens by that rule or drops back to the floor
    for (const n of BOTH) {
      let cw = CW_MIN
      for (const c of ofType(recs(), 'CW_CHANGE').filter((r) => r.node === n)) {
        expect([CW_MIN, Math.min(2 * cw + 1, CW_MAX)], `${n} at ${c.t}`).toContain(c.cw)
        cw = c.cw
      }
    }
  })

  it('the draw spans the whole window, both ends included', () => {
    // the procedure's step 2, "between 0 and CW, both ends included — sixteen possible
    //  values at CW 15, and zero is one of them"
    const v = draws().filter((r) => r.cw === CW_MIN).map((r) => r.value)
    expect(Math.min(...v)).toBe(0)
    expect(Math.max(...v)).toBe(CW_MIN)
    expect(new Set(v).size).toBe(CW_MIN + 1)
  })

  it('every transmission owes a fresh draw: no station sends twice without one', () => {
    // the procedure's step 7, "after any transmission at all the counter is cleared and a
    //  fresh draw is owed" — releaseTxop and failAttemptCore in src/engine/mac.ts both do it.
    for (const n of BOTH) {
      let owed = true // the first frame of the run goes out on an idle channel with no draw
      let frames = 0
      for (const r of recs()) {
        if (!('node' in r) || r.node !== n) continue
        if (r.type === 'BACKOFF_DRAW') { owed = true; continue }
        if (r.type !== 'TX_START' || r.frame.kind !== 'data') continue
        if (r.frame.retryFlag) continue // a retry of the same MSDU, not a second attempt won afresh
        expect(owed, `${n} sent at ${r.t} without drawing`).toBe(true)
        owed = false
        frames++
      }
      expect(frames).toBeGreaterThan(300)
    }
  })

  it('a slot is 9 µs, so the mean wait goes from about 64 µs to about 145 µs', () => {
    // "Every slot on that counter is 9 µs of waiting, so the mean wait roughly doubles with
    //  the window: about 64 µs at the smallest, 145 µs after one failure."
    expect(SLOT_NS).toBe(9_000)
    expect(Math.round(meanOf(15) * SLOT_NS / 1_000)).toBe(64)
    expect(Math.round(meanOf(31) * SLOT_NS / 1_000)).toBe(145)
    expect(meanOf(31)).toBeGreaterThan(1.5 * meanOf(15))
  })

  it('the counted idle slots between a draw and the frame equal the number drawn', () => {
    // tryThis: "Count the idle slots between the end of a DIFS and the frame that follows
    //  it. It always equals the number that station drew."
    const last = new Map<string, { t: number; v: number; frozen: boolean }>()
    let checked = 0
    for (const r of recs()) {
      if (r.type === 'BACKOFF_DRAW') last.set(r.node, { t: r.t, v: r.value, frozen: false })
      if (r.type === 'BACKOFF_FREEZE' && last.has(r.node)) last.get(r.node)!.frozen = true
      if (r.type === 'TX_START' && r.frame.kind === 'data' && last.has(r.node)) {
        const d = last.get(r.node)!
        if (!d.frozen) { expect(r.t - d.t).toBe(d.v * SLOT_NS); checked++ }
        last.delete(r.node)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('a frozen counter resumes at exactly the value it stopped at, 770 times over', () => {
    // the observation "they freeze and resume at the same value — 770 pairs here, not one
    //  losing a slot", and the quiz answer "7 — exactly where it stopped"
    let pairs = 0
    for (const n of BOTH) {
      const ev = recs().filter((r): r is Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }> =>
        (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === n)
      for (let i = 0; i + 1 < ev.length; i++) {
        if (ev[i].type === 'BACKOFF_FREEZE' && ev[i + 1].type === 'BACKOFF_RESUME') {
          expect(ev[i + 1].value).toBe(ev[i].value)
          pairs++
        }
      }
    }
    expect(pairs).toBe(770)
  })
})

describe('backoff · the deadline and the first collision', () => {
  it('the deadline is 16 + 9 + 20 = 45 µs', () => {
    // the "Why the deadline falls where it does" table: SIFS 16, one slot 9,
    //  signal-detect delay 20, ACK timeout 45
    expect(SIFS_NS).toBe(16_000)
    expect(SLOT_NS).toBe(9_000)
    expect(RX_START_DELAY_NS).toBe(20_000)
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
  })

  it('the first collision is a t = 0 start with no draw at all, reported at 248 µs', () => {
    // "Both find the channel idle at the start and send at once, with no draw at all. The
    //  overlap is reported at 248 µs"
    const cols = ofType(recs(), 'COLLISION')
    expect(cols[0].t).toBe(248_000)
    expect(ofType(recs(), 'TX_START').filter((r) => r.t === 0).map((r) => r.node).sort()).toEqual(BOTH)
    expect(draws().some((r) => r.t < 248_000)).toBe(false)
  })

  it('the deadline expires at 293 µs, both windows double to 31, and the redraw is at 327 µs', () => {
    // "the deadline expires at 293 µs, both windows double to 31, and the fresh draws come
    //  at 327 µs", the observation "both stations show CW 31 … and each retry frame carries
    //  the Retry flag", and `deeper`'s "counted from the end of the timeout at 293 µs
    //  rather than from the end of the collided frames at 248 µs"
    for (const n of BOTH) {
      expect(ofType(recs(), 'ACK_TIMEOUT').find((r) => r.node === n)!.t).toBe(293_000)
      expect(ofType(recs(), 'CW_CHANGE').find((r) => r.node === n && r.t === 293_000)!.cw).toBe(31)
      const difs = ofType(recs(), 'IFS_START').find((r) => r.node === n && r.t === 293_000)!
      expect(difs.kind).toBe('DIFS')
      expect(difs.untilNs).toBe(327_000)
      const draw = draws().find((r) => r.node === n && r.t > 248_000)!
      expect(draw.t).toBe(327_000)
      expect(draw.cw).toBe(31)
      expect(ofType(recs(), 'TX_START').find((r) => r.node === n && r.t > 293_000)!.frame.retryFlag).toBe(true)
    }
    expect(293_000 - 248_000).toBe(ACK_TIMEOUT_NS)
  })

  it('the second collision is at about 8.1 ms, both counters hitting zero in one slot', () => {
    // the observation "Jump to the second collision, at about 8.1 ms, and step backwards:
    //  both counters reach zero in the very same slot."
    const second = ofType(recs(), 'COLLISION')[1]
    expect(Math.round(second.t / 100_000) / 10).toBe(8.1)
    const starts = ofType(recs(), 'TX_START').filter((r) =>
      r.frame.kind === 'data' && r.t < second.t && r.t + r.frame.txTimeNs >= second.t)
    expect(starts.map((r) => r.node).sort()).toEqual(BOTH)
    expect(starts[0].t).toBe(starts[1].t)
    for (const n of BOTH) {
      expect(ofType(recs(), 'BACKOFF_DEC').some((r) => r.node === n && r.t === starts[0].t && r.value === 0)).toBe(true)
    }
  })
})

describe('backoff · how often it goes wrong', () => {
  it('864 frames and 47 collisions across 300 ms — roughly one attempt in twenty', () => {
    // "Across 300 ms these two stations send 864 frames and collide 47 times — roughly one
    //  attempt in twenty."
    expect(data().length).toBe(864)
    expect(ofType(recs(), 'COLLISION').length).toBe(47)
    const rate = 47 / 864
    expect(rate).toBeGreaterThan(0.04)
    expect(rate).toBeLessThan(0.08)
  })

  it('another seed gives other draws and the same rough rate', () => {
    // tryThis: "Change the seed in the editor and reload: different draws, different
    //  collision times, still roughly one attempt in twenty going wrong."
    for (const seed of [1, 2, 3, 11]) {
      const s: Scenario = { ...backoff.scenario(), seed }
      const rs = [...new Simulation(s).runUntil(RUN_NS).records]
      const d = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data').length
      const c = rs.filter((r) => r.type === 'COLLISION').length
      expect(c / d, `seed ${seed}`).toBeGreaterThan(0.04)
      expect(c / d, `seed ${seed}`).toBeLessThan(0.08)
    }
  })

  it('the access point locks onto neither preamble, so no EIFS is ever armed', () => {
    // `deeper`: "the access point starts no reception at all" and "Across this whole run
    //  not a single EIFS is ever started."
    const cols = ofType(recs(), 'COLLISION')
    for (const c of cols) {
      const starts = ofType(recs(), 'TX_START').filter((r) =>
        BOTH.includes(r.node) && r.frame.kind === 'data' && r.t < c.t && r.t + r.frame.txTimeNs >= c.t)
      expect(starts.length).toBe(2)
      expect(starts[0].t).toBe(starts[1].t)
      expect(ofType(recs(), 'RX_MISS').filter((r) => r.node === 'ap' && r.t === starts[0].t).map((r) => r.from).sort()).toEqual(BOTH)
    }
    expect(ofType(recs(), 'RX_FAIL').some((r) => r.node === 'ap')).toBe(false)
    expect(ofType(recs(), 'IFS_START').some((r) => r.kind === 'EIFS')).toBe(false)
  })
})
