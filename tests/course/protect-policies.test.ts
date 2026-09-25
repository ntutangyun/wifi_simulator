/**
 * Every empirical claim in "Three ways of announcing, and handing the time back"
 * — the second half of `txop-protect`, split on 2026-09-25.
 *
 * It borrows the parent's scene AND both of its variants rather than declaring
 * any of its own, so `lessonShapeSuite(..., { sameSceneAs: 'txop-protect' })`
 * proves the two ids replay the same three timelines and its three recorded
 * hashes are copies rather than new runs.
 *
 * What moved here with the prose (§6 of the re-pacing plan, "~5 →
 * protect-policies (the three-policy tables)"): the third column of the 300 ms
 * table, the Durations a data frame carries under each policy, the CF-End census
 * and the arithmetic of the 288 µs the two copies hand back.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with
 * the same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { protectPolicies, policyReachTiming } from '../../src/course/tier2/protect-policies'
import { txopProtect } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { CF_END_BYTES, OFDM_5G } from '../../src/engine/phy'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = boundary protection; variant 0 = single; variant 1 = multiple — the parent's own three. */
const boundary = (): TLRecord[] => runOf(protectPolicies, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(protectPolicies, 0, RUN_NS)
const multiple = (): TLRecord[] => runOf(protectPolicies, 1, RUN_NS)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
const dataDurs = (rs: TLRecord[]): number[] => txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)
const lane = (label: string): TimingLane => policyReachTiming().lanes.find((l) => l.label === label)!

const ms = (ns: number) => Number((ns / MS).toFixed(3))

lessonShapeSuite(protectPolicies, { sameSceneAs: 'txop-protect', runNs: RUN_NS })

describe('protect-policies · the lesson’s own scene', () => {
  it('follows its parent in the QoS module and takes the two words it names', () => {
    expect(MODULES[protectPolicies.module].title).toBe('QoS 与效率')
    expect(MODULES[protectPolicies.module].title).toBe(MODULES[txopProtect.module].title)
    expect(protectPolicies.needs).toEqual(['txop-protect'])
    expect(protectPolicies.terms!.map((t) => t.term)).toEqual(['CF-End', 'CTS-to-self'])
  })

  it('is the parent’s scene and the parent’s two variants, undivided', () => {
    const sc = protectPolicies.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc).toEqual(txopProtect.scenario())
    expect(protectPolicies.variants!.map((v) => v.scenario()))
      .toEqual(txopProtect.variants!.map((v) => v.scenario()))
    expect(protectPolicies.variants!.map((v) => v.label)).toEqual(txopProtect.variants!.map((v) => v.label))
  })
})

describe('protect-policies · the three policies, counted', () => {
  it('multiple comes out identical to boundary, collision for collision', () => {
    // the table's three columns and "it comes out exactly like boundary protection, one
    // collision for one collision, one delivery for one delivery"
    const row = (rs: TLRecord[]) => [ofType(rs, 'COLLISION').length, delivered(rs)]
    expect(row(single())).toEqual([46, 212])
    expect(row(boundary())).toEqual([21, 614])
    expect(row(multiple())).toEqual(row(boundary()))
  })

  it('a data frame carries 60 µs at most under boundary and up to 2.164 ms under multiple', () => {
    // the table's third row, and step 3: "only while the remainder is longer than a pause plus
    // an answer does a data frame carry it; otherwise it carries just that pause and answer"
    expect(Math.max(...dataDurs(boundary())) / US).toBe(60)
    expect(Math.max(...dataDurs(single())) / US).toBe(60)
    expect(Math.max(...dataDurs(multiple())) / US).toBe(2_164)
    // and a long one really does reach the end of the turn it sits in
    const tops = ofType(multiple(), 'TXOP_START')
    const long = txs(multiple(), (r) => r.frame.kind === 'data' && r.frame.durationFieldNs > 60 * US)
    expect(long.length).toBeGreaterThan(50)
    for (const d of long.slice(0, 20)) {
      const top = tops.filter((s) => s.node === d.node && s.t <= d.t).pop()!
      expect(d.t + d.frame.txTimeNs + d.frame.durationFieldNs).toBe(top.untilNs)
    }
    // the floor every other frame falls back to is one pause plus one answer, and the answer's
    // own airtime depends on the rate it is sent at: 44, 48 or 60 µs in this run
    expect(new Set(dataDurs(boundary()).map((n) => n / US))).toEqual(new Set([44, 48, 60]))
    const ackTimes = new Set(txs(boundary(), (r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs))
    for (const d of new Set(dataDurs(boundary()))) expect(ackTimes).toContain(d - OFDM_5G.sifsNs)
    expect(Math.min(...dataDurs(multiple())) / US).toBeLessThanOrEqual(60)
  })

  it('198 CF-End frames under boundary and multiple, none under single, half of them the AP’s', () => {
    // the table's last row and the first observation: "198 in all, exactly half of them the
    // access point's" — step 4's repeat
    expect(txs(single(), (r) => r.frame.kind === 'cfend')).toHaveLength(0)
    for (const rs of [boundary(), multiple()]) {
      const cf = txs(rs, (r) => r.frame.kind === 'cfend')
      expect(cf).toHaveLength(198)
      expect(cf.filter((r) => r.node === 'ap')).toHaveLength(99)
      expect(new Set(cf.map((r) => r.frame.bytes))).toEqual(new Set([CF_END_BYTES]))
    }
  })
})

describe('protect-policies · the burst at 0.736 ms hands 288 µs back', () => {
  const rs = boundary()
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!

  it('every row of the worked table is that ending, record by record', () => {
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    // "the announced reservation runs to 3.264 ms" / "the last answer lands at 2.888 ms"
    expect(ms(nav.untilNs)).toBe(3.264)
    expect(ms(end.t)).toBe(2.888)
    // "376 µs left on it" / "one more exchange would need 416 µs"
    expect((nav.untilNs - end.t) / US).toBe(376)
    expect(376).toBeLessThan(416)
    // step 4: the holder's CF-End, then the access point's, one pause apart
    expect(ms(cf[0].t)).toBe(2.904)
    expect(cf[0].node).toBe('sta-1')
    expect(ms(cf[1].t)).toBe(2.948)
    expect(cf[1].node).toBe('ap')
    expect(cf[1].t - (cf[0].t + cf[0].frame.txTimeNs)).toBe(OFDM_5G.sifsNs)
    // step 5: the hidden station drops its reservation at 2.976 ms, not 3.264
    expect(ms(clear.t)).toBe(2.976)
    expect(clear.t).toBeLessThan(nav.untilNs)
    // "288 µs handed back"
    expect((nav.untilNs - clear.t) / US).toBe(288)
  })

  it('step 4’s condition holds: the announcement outran the burst by more than the test asks', () => {
    // "if the announced end is further off than now + a pause + a CF-End + one slot"
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)[0]
    const need = OFDM_5G.sifsNs + cf.frame.txTimeNs + OFDM_5G.slotNs
    expect(nav.untilNs - end.t).toBeGreaterThan(need)
    expect(need / US).toBe(16 + 28 + 9)
  })
})

describe('protect-policies · the figure of the three reaches', () => {
  const rs = boundary()
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!
  const rel = (t: number) => (t - t0.t) / US

  it('every span is a record of this run, or the engine’s own arithmetic over one', () => {
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && r.t === t0.t)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)

    // lane 1: the question, the answer, and the five exchanges
    const burst = lane('这一串').spans
    expect([burst[0].fromUs, burst[0].toUs]).toEqual([rel(rts.t), rel(rts.t + rts.frame.txTimeNs)])
    expect([burst[1].fromUs, burst[1].toUs]).toEqual([rel(cts.t), rel(cts.t + cts.frame.txTimeNs)])
    expect([burst[2].fromUs, burst[2].toUs]).toEqual([rel(data[0].t), rel(end.t)])
    // lane 2: what one exchange's answer announces — 2 × SIFS + the frame + its answer
    const one = lane('单次罩住').spans[0]
    expect(one.fromUs).toBe(rel(nav.t))
    expect(one.toUs - one.fromUs).toBe(416)
    expect((2 * OFDM_5G.sifsNs + data[0].frame.txTimeNs + 28 * US) / US).toBe(416)
    // and the single-protection run really does print 416 µs in that field for such a frame
    const s416 = txs(single(), (r) => r.frame.kind === 'cts' && r.frame.durationFieldNs === 416 * US)
    expect(s416.length).toBeGreaterThan(0)
    // lane 3: the 2 456 µs this run's answer carries, from the moment it ends
    const bnd = lane('边界罩住').spans[0]
    expect([bnd.fromUs, bnd.toUs]).toEqual([rel(nav.t), rel(nav.untilNs)])
    expect(bnd.toUs - bnd.fromUs).toBe(cts.frame.durationFieldNs / US)
    expect(bnd.label).toBe('2 456 µs')
    // lane 4: the two CF-End copies, and the reservation ending with the second
    const back = lane('还回去').spans[0]
    expect(back.fromUs).toBe(rel(cf[0].t))
    expect(back.toUs).toBe(rel(clear.t))
    expect(bnd.toUs - back.toUs).toBe(288)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(policyReachTiming())
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

describe('protect-policies · the experiment and the jumps', () => {
  it('single wakes the far station mid-burst; multiple leaves the counts untouched', () => {
    // the experiment: "single wakes up in the middle of every burst, multiple stays purple to
    // the end like boundary — and the counts are identical, because nobody here misses the answer"
    const navLen = (rs: TLRecord[]) => {
      const set = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2')
      expect(set.length).toBeGreaterThan(20)
      return set.reduce((a, r) => a + (r.untilNs - r.t), 0) / set.length
    }
    expect((navLen(single()) / MS).toFixed(2)).toBe('1.05')
    expect((navLen(multiple()) / MS).toFixed(2)).toBe('2.45')
    expect(navLen(multiple())).toBe(navLen(boundary()))
    expect([ofType(multiple(), 'COLLISION').length, delivered(multiple())]).toEqual([21, 614])
  })

  it('both jump targets occur in the base run', () => {
    for (const j of protectPolicies.jumps) expect(boundary().some(j.find), j.label).toBe(true)
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('protect-policies · every official term carries its English name', () => {
  const zh = [protectPolicies.why!, ...protectPolicies.outcomes!]
    .concat(paragraphTexts(protectPolicies.picture!), cellTexts(protectPolicies.picture!))
    .concat(paragraphTexts(protectPolicies.numbers!), cellTexts(protectPolicies.numbers!))
    .concat(protectPolicies.observe, protectPolicies.tryThis,
      protectPolicies.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(protectPolicies))

  it('brackets every official term at its first Chinese use', () => {
    const out: string[] = []
    for (const t of rows) {
      const why = zhTermFailure(zh, t)
      if (why) out.push(why)
      out.push(...zhAkaViolations(zh, t))
    }
    expect(out).toEqual([])
  })

  it('had its terminology actually graded', () => {
    expect(rows.filter((t) => bracketedAtFirstZhUse(zh, t) !== null).length).toBeGreaterThanOrEqual(2)
  })
})
