/**
 * Every empirical claim in "Protecting the burst — one question, one answer, the
 * whole turn announced", measured against the lesson's own scenario and its two
 * variants.
 *
 * The lesson had no test file of its own before the readability rewrite. Its
 * pins lived — and still live — in tests/course/lesson-claims.test.ts
 * ("lesson 10 · protecting the burst"): the four rows of the 300 ms table, the
 * reach of each policy's reservation, the 24-of-29 census of the single run, the
 * bare-threshold experiment (21 → 80 collisions, 614 → 344 deliveries) and every
 * timing of the observe list. That file is untouched and still passes.
 *
 * Re-paced on 2026-09-25 (§2 M8 of the re-pacing plan). What went to
 * tests/course/protect-policies.test.ts with the prose: the third column of both
 * tables (the multiple-protection run, which comes out identical to boundary),
 * the Durations a data frame carries under multiple protection, the CF-End census
 * and the arithmetic of the 288 µs it hands back. What stays here is the
 * announcement itself and what it buys, plus the new sequence figure, whose every
 * message is a record of this run.
 */
import { describe, it, expect } from 'vitest'
import { txopProtect, protectSequence } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = boundary protection; variant 0 = single; variant 1 = multiple. */
const boundary = (): TLRecord[] => runOf(txopProtect, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(txopProtect, 0, RUN_NS)
// variant 1, multiple protection, is `protect-policies`'s business now: this half's tables
// have two columns. The variant itself stays here, because the two halves must carry the
// same list (tests/course/kit.ts checks it scenario for scenario).

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
/** Air spent on the frames that do not carry data: the question, the answer and the closing frame. */
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
  it('sits in the QoS module and names the lessons its words come from', () => {
    expect(MODULES[txopProtect.module].title).toBe('QoS 与效率')
    // `nav` owns NAV, `hidden` owns RTS and CTS (§6 moves that edge to `rts-cts` when batch 4
    // lands), `txop` owns the burst this lesson protects.
    expect(txopProtect.needs).toEqual(['nav', 'hidden', 'txop'])
    // `protection` is this half's own word; CF-End and CTS-to-self went to `protect-policies`.
    expect(txopProtect.terms!.map((t) => t.term)).toEqual(['protection'])
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

describe('txop-protect · the figure of the burst at 0.736 ms', () => {
  const rs = boundary()
  const ms = (ns: number) => Number((ns / MS).toFixed(3))
  const msg = (i: number) => protectSequence().messages[i]

  it('every message is a record of this run, at the instant it prints', () => {
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && ms(r.t) === 0.736)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > rts.t)[0]
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= rts.t)!
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > rts.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > rts.t && r.t < end.t)
    // 1: the question, from the holder to the access point, carrying the whole turn
    expect([msg(0).from, msg(0).to, msg(0).at]).toEqual(['sta-1', 'ap', '0.736 ms'])
    expect(msg(0).label).toContain('2 500')
    expect(rts.node).toBe('sta-1')
    expect(rts.frame.durationFieldNs / US).toBe(2_500)
    // 2: the answer, addressed to the holder, carrying what is left
    expect([msg(1).from, msg(1).to, msg(1).at]).toEqual(['ap', 'sta-1', '0.780 ms'])
    expect(msg(1).label).toContain('2 456')
    expect([cts.node, cts.frame.dst]).toEqual(['ap', 'sta-1'])
    expect(ms(cts.t)).toBe(0.780)
    expect(cts.frame.durationFieldNs / US).toBe(2_456)
    // 3: the hidden station's own record — it loads the reservation from that answer
    expect([msg(2).from, msg(2).to, msg(2).at]).toEqual(['sta-2', 'sta-2', '0.808 ms'])
    expect(msg(2).label).toContain('3.264')
    expect(ms(nav.t)).toBe(0.808)
    expect(ms(nav.untilNs)).toBe(3.264)
    expect(nav.source).toBe('cts:ap')
    // 4 and 5: five exchanges of 416 µs, the last answer ending the turn at 2.888 ms
    expect([msg(3).from, msg(3).to, msg(3).at]).toEqual(['sta-1', 'ap', '0.824 ms'])
    expect(msg(3).label).toContain('416')
    expect(data).toHaveLength(5)
    expect(ms(data[0].t)).toBe(0.824)
    expect(data[1].t - data[0].t).toBe(416 * US)
    expect(msg(4).at).toBe('2.888 ms')
    expect(ms(end.t)).toBe(2.888)
    // the figure's three columns are the scene's three nodes
    expect(protectSequence().columns.map((c) => c.id)).toEqual(['sta-2', 'ap', 'sta-1'])
    expect(new Set(txopProtect.scenario().nodes.map((n) => n.id)))
      .toEqual(new Set(protectSequence().columns.map((c) => c.id)))
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(protectSequence())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})

describe('txop-protect · the same three hundred milliseconds, two ways', () => {
  it('the four counted rows are 46/21 collisions, 212/614 delivered, 112/47 retries, 6/1 dropped', () => {
    // the first table. (The same four rows are pinned in tests/course/lesson-claims.test.ts,
    // "the 300 ms table: single vs boundary"; here they guard this lesson's own two columns.)
    const row = (rs: TLRecord[]) => [
      ofType(rs, 'COLLISION').length, delivered(rs), ofType(rs, 'RETRY').length, ofType(rs, 'DROP').length,
    ]
    expect(row(single())).toEqual([46, 212, 112, 6])
    expect(row(boundary())).toEqual([21, 614, 47, 1])
  })

  it('the non-data frames cost 14.9 ms under single and 14.3 ms under boundary', () => {
    // table row "Air spent on questions, answers and the closing frame": 14.9 ms / 14.3 ms,
    // and the paragraph "both policies spend about a twentieth of the air on the frames that
    // carry no data — boundary spends slightly less"
    expect((announcingNs(single()) / MS).toFixed(1)).toBe('14.9')
    expect((announcingNs(boundary()) / MS).toFixed(1)).toBe('14.3')
    expect(announcingNs(boundary())).toBeLessThan(announcingNs(single()))
    for (const rs of [single(), boundary()]) {
      const share = announcingNs(rs) / RUN_NS
      expect(share).toBeGreaterThan(1 / 25)
      expect(share).toBeLessThan(1 / 17)
    }
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

  it('step 4 and the worked table: five exchanges of 416 µs, each carrying only 44 µs', () => {
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)
    // "five exchanges of 416 µs; the last answer lands at 2.888 ms"
    expect(data).toHaveLength(5)
    for (const d of data) expect(d.frame.durationFieldNs / US).toBe(44)
    expect(data[1].t - data[0].t).toBe(416 * US)
    expect(ms(end.t)).toBe(2.888)
    // "60 µs at most in this run" — the widest Duration a data frame carries under boundary
    expect(Math.max(...txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)) / US).toBe(60)
    // the last two rows of the worked table: 2 152 µs of burst, and 376 µs left announced
    expect((end.t - t0.t) / US).toBe(2_152)
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    expect((nav.untilNs - end.t) / US).toBe(376)
  })
})

describe('txop-protect · what is left over', () => {
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

  it('the quiz’s "2 ms instead of 0.4 ms": what a hidden station is exposed to, either way', () => {
    // the second quiz question. A single-protection reservation covers one exchange (about
    // 0.4 ms on average here); an unprotected burst runs for about 2 ms, which is what the far
    // station would be free to blunder into.
    const holds = ofType(boundary(), 'TXOP_START').filter((r) => r.node === 'sta-1')
    const ends = ofType(boundary(), 'TXOP_END').filter((r) => r.node === 'sta-1')
    const lens = holds.map((h) => (ends.find((e) => e.t > h.t)?.t ?? h.t) - h.t).filter((n) => n > 0)
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length
    expect(mean / MS).toBeGreaterThan(1.5)
    expect(mean / MS).toBeLessThan(2.5)
    // and one exchange, the most a single-protection answer ever announces here, is far shorter
    expect(meanNavNs(single()) / MS).toBeLessThan(1.5)
  })
})
