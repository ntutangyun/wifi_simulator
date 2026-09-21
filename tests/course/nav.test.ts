/**
 * Every empirical claim in "NAV — reserving with a promise", measured against
 * the lesson's own scene (two saturated talkers, one browsing listener).
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * 248 + 44 + 34 = 326 µs freeze, and "NAV ends exactly when the ACK ends, and
 * data Duration = SIFS + ACK airtime" — are re-asserted here beside the
 * sentences that now carry them; the originals stay where they are, so no pin
 * is lost. The lesson never had a `.body!` site in any test.
 */
import { describe, it, expect } from 'vitest'
import { nav } from '../../src/course/tier1/nav'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { DIFS_NS, SIFS_NS } from '../../src/engine/phy'

const MS = 1_000_000
/** 200 ms: the window the "576 data frames" and "513 countdowns" sentences are counted over. */
const RUN_NS = 200 * MS

const recs = (): TLRecord[] => runOf(nav, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)

lessonShapeSuite(nav, { proseMax: 800, runNs: RUN_NS })

describe('nav · the lesson’s own scene', () => {
  it('follows backoff and owns the reservation', () => {
    expect(nav.module).toBe(1)
    expect(nav.needs).toEqual(['backoff'])
    // the owner table of the readability programme gives this lesson NAV; `Duration` and
    // `virtual carrier sense` are the field it reads and the name for what it does.
    expect(nav.terms!.map((t) => t.term)).toEqual(['Duration', 'NAV', 'virtual carrier sense'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(nav.scenario())).not.toThrow()
    expect(nav.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2', 'sta-3'])
  })
})

describe('nav · where the 44 µs comes from', () => {
  it('a data frame announces the pause plus the answer, and the answer announces nothing', () => {
    // the "Where the 44 µs comes from" table: pause 16 µs, answer 28 µs, data frame
    //  announces 44 µs, answer announces 0 µs — and the observation "44 µs on every one of
    //  them, the pause plus the answer it is expecting"
    const data = txs('data')
    const acks = txs('ack')
    expect(data.length).toBe(576)
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([44_000]))
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([28_000]))
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([14]))
    expect(new Set(acks.map((r) => r.frame.durationFieldNs))).toEqual(new Set([0]))
    expect(SIFS_NS + 28_000).toBe(44_000)
    // and it really is the answer each frame expects, not a constant that happens to match
    for (const d of data) {
      const ack = acks.find((a) => a.t > d.t)
      if (ack) expect(d.frame.durationFieldNs).toBe(SIFS_NS + ack.frame.txTimeNs)
    }
  })

  it('the Listener’s 513 countdowns end at the exact nanosecond the answer ends', () => {
    // "the Listener’s countdown ends at the exact nanosecond the answer ends — 513 times
    //  over" and the observation "They end at the exact instant the answer ends — check any
    //  of the Listener’s 513 of them."
    const navs = ofType(recs(), 'NAV_SET').filter((r) => r.node === 'sta-3')
    expect(navs.length).toBe(513)
    for (const n of navs) {
      expect(n.untilNs - n.t).toBe(44_000)
      const ack = ofType(recs(), 'TX_END').find((r) => r.frame.kind === 'ack' && r.t > n.t)!
      expect(ack.t).toBe(n.untilNs)
    }
    // the Listener is never the addressee: every one of them comes from somebody else's data
    expect(new Set(navs.map((r) => r.source))).toEqual(new Set(['data:sta-1', 'data:sta-2']))
  })
})

describe('nav · one long freeze, taken apart', () => {
  it('248 + 44 + 34 = 326 µs, and Talker A resumes at 3', () => {
    // the "One long freeze, taken apart" table, and the paragraph "A freezes at 498 µs …
    //  B’s frame ends at 746 µs … running to 790 µs … carrying A to 824 µs"
    const freeze = ofType(recs(), 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === 498_000)!
    expect(freeze.value).toBe(3)
    const bEnd = ofType(recs(), 'TX_END').find((r) => r.node === 'sta-2' && r.t > 498_000)!
    expect(bEnd.t).toBe(746_000)
    expect(bEnd.t - freeze.t).toBe(248_000)
    const navSet = ofType(recs(), 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === 746_000)!
    expect(navSet.untilNs).toBe(790_000)
    expect(navSet.untilNs - navSet.t).toBe(44_000)
    const difs = ofType(recs(), 'IFS_START').find((r) => r.node === 'sta-1' && r.t === 790_000)!
    expect(difs.kind).toBe('DIFS')
    expect(difs.untilNs).toBe(824_000)
    expect(difs.untilNs - difs.t).toBe(DIFS_NS)
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === 824_000)!
    expect(resume.value).toBe(3)
    expect(resume.t - freeze.t).toBe(326_000)
    expect(248_000 + 44_000 + 34_000).toBe(326_000)
  })

  it('three quarters of the wait is over before its length can be worked out', () => {
    // `deeper`: "The 326 µs total first becomes computable at 746 µs, by which point
    //  248 µs — about three quarters of the wait — has already gone by", and the last
    //  ingredient being the 34 µs that could still be extended
    expect(248_000 / 326_000).toBeGreaterThan(0.7)
    expect(248_000 / 326_000).toBeLessThan(0.8)
    expect(326_000 - 248_000 - 44_000).toBe(DIFS_NS)
  })
})
