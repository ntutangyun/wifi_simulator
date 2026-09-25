/**
 * Every empirical claim in "Protecting the burst — one answer for the whole
 * turn", measured against the lesson's own scenario and its two variants.
 *
 * The lesson had no test file of its own before the readability rewrite. Its
 * pins lived — and still live — in tests/course/lesson-claims.test.ts
 * ("lesson 10 · protecting the burst"): the four rows of the 300 ms table, the
 * reach of each policy's reservation, the 24-of-29 census of the single run,
 * the bare-threshold experiment (21 → 80 collisions, 614 → 344 deliveries) and
 * every timing of the observe list. That file is untouched and still passes.
 * What this file adds is what the rewritten lesson now states on top of those:
 * the third column of both tables (the multiple-protection run, which comes
 * out identical to boundary), the airtime and average-reservation rows, the
 * Durations the two experiments hover over, and the census of what is left of
 * the collisions. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { txopProtect } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = boundary protection; variant 0 = single; variant 1 = multiple. */
const boundary = (): TLRecord[] => runOf(txopProtect, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(txopProtect, 0, RUN_NS)
const multiple = (): TLRecord[] => runOf(txopProtect, 1, RUN_NS)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
/** Air spent on the frames that do the announcing: the question, the answer and CF-End. */
const announcingNs = (rs: TLRecord[]): number =>
  txs(rs, (r) => ['rts', 'cts', 'cfend'].includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
const allAirNs = (rs: TLRecord[]): number => txs(rs).reduce((a, r) => a + r.frame.txTimeNs, 0)
/** How long a reservation the hidden station loads lasts, averaged over the run. */
const meanNavNs = (rs: TLRecord[]): number => {
  const set = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2')
  expect(set.length).toBeGreaterThan(20)
  return set.reduce((a, r) => a + (r.untilNs - r.t), 0) / set.length
}

lessonShapeSuite(txopProtect, { runNs: RUN_NS })

describe('txop-protect · the lesson’s own scene', () => {
  it('is the last lesson of the QoS module and names the three lessons its words come from', () => {
    expect(txopProtect.module).toBe(2)
    // `nav` owns NAV, `hidden` owns RTS and CTS, `txop` owns the burst this lesson protects.
    expect(txopProtect.needs).toEqual(['nav', 'hidden', 'txop'])
    // `protection`, `CF-End` and `CTS-to-self` are this lesson's own three words.
    expect(txopProtect.terms!.map((t) => t.term)).toEqual(['protection', 'CF-End', 'CTS-to-self'])
  })

  it('loads the hidden-node hallway with bursts, an RTS threshold of 500 B and boundary protection', () => {
    // the picture's "This is the hallway house of the hidden-node lesson" and `deeper`'s
    // "this scene sets the threshold at 500 bytes"
    const s = txopProtect.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(s.rtsThresholdBytes).toBe(500)
    for (const id of ['sta-1', 'sta-2']) {
      const n = s.nodes.find((x) => x.id === id)!
      expect(n.txopProtection).toBe('boundary')
      expect(n.caps.features.txop).toBe(true)
    }
    // the two variants differ from the base in the protection policy and nothing else
    const vs = txopProtect.variants!.map((v) => v.scenario())
    for (const v of vs) expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(vs.map((v) => v.nodes.find((n) => n.id === 'sta-1')!.txopProtection)).toEqual([undefined, 'multiple'])
    for (const v of vs) {
      expect(v.rtsThresholdBytes).toBe(500)
      expect(v.nodes.map((n) => ({ ...n, txopProtection: undefined })))
        .toEqual(s.nodes.map((n) => ({ ...n, txopProtection: undefined })))
    }
  })
})

describe('txop-protect · the same three hundred milliseconds, three ways', () => {
  it('the multiple-protection column of both tables equals the boundary column', () => {
    // numbers: "the run comes out identical to boundary, collision for collision", and the
    // third column of both tables. (The single/boundary columns themselves — 46/21
    // collisions, 212/614 delivered, 112/47 retries, 6/1 dropped — are pinned in
    // tests/course/lesson-claims.test.ts, "the 300 ms table: single vs boundary".)
    const row = (rs: TLRecord[]) => [
      ofType(rs, 'COLLISION').length, delivered(rs), ofType(rs, 'RETRY').length, ofType(rs, 'DROP').length,
    ]
    expect(row(boundary())).toEqual([21, 614, 47, 1])
    expect(row(multiple())).toEqual(row(boundary()))
    expect(row(single())).toEqual([46, 212, 112, 6])
    // and the airtime rows of the second table agree column for column too
    expect(announcingNs(multiple())).toBe(announcingNs(boundary()))
    expect(allAirNs(multiple())).toBe(allAirNs(boundary()))
    expect(meanNavNs(multiple())).toBe(meanNavNs(boundary()))
    // the try-this claim "the same 21 collisions, the same 614 frames delivered"
    expect([ofType(multiple(), 'COLLISION').length, delivered(multiple())]).toEqual([21, 614])
  })

  it('the announcing frames cost 14.9 ms under single and 14.3 ms under boundary', () => {
    // table row "Air spent on questions, answers and CF-End": 14.9 ms / 14.3 ms / 14.3 ms,
    // and the paragraph "both policies spend about a twentieth of the air on the frames that
    // do the announcing — boundary spends slightly less"
    expect((announcingNs(single()) / MS).toFixed(1)).toBe('14.9')
    expect((announcingNs(boundary()) / MS).toFixed(1)).toBe('14.3')
    expect(announcingNs(boundary())).toBeLessThan(announcingNs(single()))
    for (const rs of [single(), boundary()]) {
      const share = announcingNs(rs) / RUN_NS
      expect(share).toBeGreaterThan(1 / 25)
      expect(share).toBeLessThan(1 / 17)
    }
    // single spends its budget on questions and answers alone; boundary buys CF-End with it
    expect(txs(single(), (r) => r.frame.kind === 'cfend')).toHaveLength(0)
    const cf = txs(boundary(), (r) => r.frame.kind === 'cfend')
    expect(cf.length).toBeGreaterThan(20)
    expect(cf.filter((r) => r.node === 'ap').length).toBe(cf.length / 2)
  })

  it('a frame delivered costs 1281 µs of air under single and 422 µs under boundary', () => {
    // table row "Air spent per frame delivered", and the paragraph's "nearly three times the
    // frames for a third of the air each"
    expect((allAirNs(single()) / delivered(single()) / US).toFixed(0)).toBe('1281')
    expect((allAirNs(boundary()) / delivered(boundary()) / US).toFixed(0)).toBe('422')
    const ratio = (allAirNs(single()) / delivered(single())) / (allAirNs(boundary()) / delivered(boundary()))
    expect(ratio).toBeGreaterThan(2.9)
    expect(ratio).toBeLessThan(3.1)
    // "the room delivers nearly three times the frames"
    expect(delivered(boundary()) / delivered(single())).toBeGreaterThan(2.8)
  })

  it('the reservation a hidden station loads lasts 2.45 ms instead of 1.05 ms', () => {
    // table row "Average reservation a hidden station loads", and the paragraph "the
    // reservation a hidden station loads now lasts 2.45 ms instead of 1.05 ms, so it sits
    // the burst out". The far station is genuinely deaf to the holder, so every one of those
    // reservations was loaded from a frame of the access point's.
    expect((meanNavNs(single()) / MS).toFixed(2)).toBe('1.05')
    expect((meanNavNs(boundary()) / MS).toFixed(2)).toBe('2.45')
    const from = ofType(boundary(), 'NAV_SET').filter((r) => r.node === 'sta-2')
    expect(from.length).toBeGreaterThan(20)
    for (const n of from) {
      const src = txs(boundary(), (r) => r.t <= n.t && r.t + r.frame.txTimeNs >= n.t - 1).pop()!
      expect(src.node).toBe('ap')
    }
  })
})

describe('txop-protect · the burst that starts at 0.736 ms, step by step', () => {
  const rs = boundary()
  const ms = (ns: number) => Number((ns / MS).toFixed(3))
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!

  it('steps 1 to 3: the question announces the whole turn, and the answer carries the rest', () => {
    const rts = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t === t0.t)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
    // step 1: the turn is the access category's limit, 2 528 µs
    expect((t0.untilNs - t0.t) / US).toBe(2_528)
    // step 2: "the whole turn less the question's own 28 µs: 2 500 µs"
    expect(rts.frame.bytes).toBe(20)
    expect(rts.frame.txTimeNs / US).toBe(28)
    expect(rts.frame.durationFieldNs / US).toBe(2_500)
    expect(rts.frame.durationFieldNs).toBe(t0.untilNs - t0.t - rts.frame.txTimeNs)
    // step 3: the answer carries what is left after the pause and itself
    expect(cts.node).toBe('ap')
    expect(cts.frame.durationFieldNs / US).toBe(2_456)
    expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - 16 * US - cts.frame.txTimeNs)
    // "the only frame the far room can hear": the hidden station's reservation comes from it
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    expect(nav.source).toBe('cts:ap')
    expect(ms(nav.t)).toBe(0.808)
    expect(ms(nav.untilNs)).toBe(3.264)
  })

  it('steps 4 and 5: five exchanges, then CF-End hands 376 µs back', () => {
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)
    // "five exchanges of 416 µs; the last answer lands at 2.888 ms"
    expect(data).toHaveLength(5)
    for (const d of data) expect(d.frame.durationFieldNs / US).toBe(44)
    expect(data[1].t - data[0].t).toBe(416 * US)
    expect(ms(end.t)).toBe(2.888)
    // "left on the announced reservation" / "one more exchange would need 416 µs"
    const announced = t0.t + 2_500 * US + 28 * US
    expect((announced - end.t) / US).toBe(376)
    expect(376).toBeLessThan(416)
    // step 5: CF-End, repeated by the access point, ends the reservation early
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)
    expect(ms(cf[0].t)).toBe(2.904)
    expect(cf[0].node).toBe('sta-1')
    expect(cf[1].node).toBe('ap')
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    expect(ms(clear.t)).toBe(2.976)
    expect(clear.t).toBeLessThan(announced)
  })
})

describe('txop-protect · what the data frames carry, and what is left over', () => {
  it('multiple protection puts up to 2.164 ms on a data frame where boundary carries 60 µs', () => {
    // step 4: "44 µs on this one, 60 µs at most in this run", and
    // the experiment "its Duration now reaches the end of the turn, 2.164 ms at the longest"
    const durs = (rs: TLRecord[]) => txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)
    expect(Math.max(...durs(multiple()))).toBe(2_164 * US)
    expect(Math.max(...durs(boundary()))).toBe(60 * US)
    // a data frame under multiple protection reaches the end of the turn it is inside
    const tops = ofType(multiple(), 'TXOP_START')
    const long = txs(multiple(), (r) => r.frame.kind === 'data' && r.frame.durationFieldNs > 60 * US)
    expect(long.length).toBeGreaterThan(50)
    for (const d of long.slice(0, 20)) {
      const top = tops.filter((s) => s.node === d.node && s.t <= d.t).pop()!
      expect(d.t + d.frame.txTimeNs + d.frame.durationFieldNs).toBe(top.untilNs)
    }
  })

  it('turning bursting off leaves one exchange per turn and nothing to protect', () => {
    // the experiment "turn bursting off on both stations … no station holds the air for two
    // frames in a row, and there is no burst left to protect"
    const s = txopProtect.scenario()
    for (const n of s.nodes) n.caps.features = { ...n.caps.features, txop: false }
    const rs = [...new Simulation(s).runUntil(RUN_NS).records]
    expect(ofType(rs, 'TXOP_START')).toHaveLength(0)
    expect(txs(rs, (r) => r.frame.kind === 'cfend')).toHaveLength(0)
    expect(txs(rs, (r) => r.frame.kind === 'data').length).toBeGreaterThan(50)
  })

  it('of the 21 collisions left, 18 are question against question and 3 catch a data frame', () => {
    // numbers: "Of the 21 collisions that survive, 18 are one question meeting another …
    // losing 20 bytes each instead of a burst. Only 3 catch a data frame already under way."
    // The frame the collision is recorded against is the one that ends at the collision's
    // instant; the others are whatever was still in the air when it started. (The same census
    // is held next door in lesson-claims, which is where this sentence's numbers began.)
    const rs = boundary()
    const cols = ofType(rs, 'COLLISION')
    expect(cols).toHaveLength(21)
    const locked = cols.map((c) => txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
      .filter((r) => r.t + r.frame.txTimeNs === c.t)[0])
    expect(locked.filter((r) => r.frame.kind === 'rts')).toHaveLength(18)
    expect(locked.filter((r) => r.frame.kind === 'data')).toHaveLength(3)
    // "two hidden stations starting within one short question of each other"
    for (const l of locked.filter((r) => r.frame.kind === 'rts')) {
      const other = txs(rs, (r) => r.node !== l.node && r.frame.kind === 'rts'
        && Math.abs(r.t - l.t) < l.frame.txTimeNs)
      expect(other.length).toBeGreaterThan(0)
    }
    // "losing 20 bytes each": a question is 20 bytes of air
    expect(new Set(txs(boundary(), (r) => r.frame.kind === 'rts').map((r) => r.frame.bytes))).toEqual(new Set([20]))
  })
})
