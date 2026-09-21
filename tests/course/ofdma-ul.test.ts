/**
 * Every empirical claim of "Trigger frames — the access point conducts the
 * uplink", measured against the lesson's own scenario.
 *
 * What is pinned here is what this lesson's own sentences say: the six rows of
 * the triggered round (the trigger frame's size, rate and airtime, the gaps,
 * the two equal answers, the multi-station BlockAck and the total), the claim
 * that the length and the slice came from the trigger frame rather than from
 * the device, the whole-run table (16 triggers, 2 of them unanswered, 28
 * answers against 54 contended sends and the bytes each carried), and the two
 * experiments.
 *
 * `tests/course/lesson-claims.test.ts` and `tests/course/lessons.test.ts` keep
 * their own pins on this lesson (that the stations still contend via EDCA
 * between bursts, and that every trigger names one length for all its users);
 * this file does not duplicate them. The lesson never had a `.body!` site in
 * any test.
 */
import { describe, it, expect } from 'vitest'
import { ofdmaUl } from '../../src/course/tier2/ofdma-ul'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
/** The window every number in this lesson is measured over. */
const RUN_NS = 100 * MS
const SIFS_NS = 16 * US
const UPLOADERS = ['sta-1', 'sta-2']

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const triggers = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'trigger')
const tbPpdus = (rs: TLRecord[]): Tx[] =>
  txs(rs, (r) => r.frame.kind === 'data' && r.frame.orthogonalGroup !== undefined)
const contended = (rs: TLRecord[]): Tx[] =>
  txs(rs, (r) => r.frame.kind === 'data' && r.frame.orthogonalGroup === undefined)
const bytes = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.bytes, 0)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
/** The lesson's scene with OFDMA switched off on the nodes named: the second experiment. */
function without(...ids: string[]): TLRecord[] {
  const sc: Scenario = ofdmaUl.scenario()
  for (const n of sc.nodes) {
    if (ids.includes(n.id)) n.caps.features = { ...n.caps.features, ofdma: false }
  }
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

lessonShapeSuite(ofdmaUl, { proseMax: 830, runNs: RUN_NS })

describe('ofdma-ul · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the downlink half of the idea', () => {
    expect(ofdmaUl.module).toBe(6)
    expect(ofdmaUl.needs).toEqual(['ofdma-dl'])
    expect(ofdmaUl.terms!.map((t) => t.term)).toEqual(['uplink', 'trigger frame', 'TB'])
  })

  it('is the same room it always was: one access point and two busy uploaders', () => {
    const sc = ofdmaUl.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', ...UPLOADERS])
    for (const id of UPLOADERS) {
      const n = sc.nodes.find((x) => x.id === id)!
      expect(n.caps.generation).toBe('he')
      expect(n.profiles).toEqual(['saturated'])
    }
    expect(ofdmaUl.variants).toBeUndefined()
  })
})

describe('ofdma-ul · one triggered round, end to end', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)
  const trig = triggers(rs)
  const tb = tbPpdus(rs)
  const mba = txs(rs, (r) => r.frame.kind === 'mba')

  it('the trigger frame: 40 bytes, 36 µs, sent slowly at 24 Mb/s from the access point', () => {
    expect(trig.length).toBe(16)
    expect(one(trig.map((r) => r.node))).toBe('ap')
    expect(one(trig.map((r) => r.frame.bytes))).toBe(40)
    expect(one(trig.map((r) => r.frame.txTimeNs))).toBe(36 * US)
    expect(one(trig.map((r) => r.frame.mbps))).toBe(24)
    // "the devices it names, and nobody else": two users, one length for both
    expect(one(trig.map((r) => r.frame.muParts!.map((p) => p.dst)))).toEqual(UPLOADERS)
    expect(one(trig.map((r) => r.frame.muParts!.map((p) => p.durNs)))).toEqual([1_988_800, 1_988_800])
  })

  it('the answers: both start one gap after the trigger frame and both run 1988.8 µs', () => {
    expect(tb.length).toBe(28)
    expect(one(tb.map((r) => r.frame.txTimeNs))).toBe(1988.8 * US)
    expect(one(tb.map((r) => r.frame.bytes))).toBe(16_894)
    for (const t of trig) {
      const answers = tb.filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)
      if (answers.length === 0) continue
      expect(answers.map((r) => r.node).sort()).toEqual([...UPLOADERS])
      // "one short gap after the trigger frame ends", and the length the trigger named
      for (const a of answers) {
        expect(a.t).toBe(t.t + t.frame.txTimeNs + SIFS_NS)
        expect(a.frame.txTimeNs).toBe(t.frame.muParts!.find((p) => p.dst === a.node)!.durNs)
      }
    }
  })

  it('one multi-station BlockAck of 36 µs closes the round, a gap after both answers end', () => {
    expect(mba.length).toBe(14)
    expect(one(mba.map((r) => r.frame.txTimeNs))).toBe(36 * US)
    expect(one(mba.map((r) => r.frame.muParts!.length))).toBe(2)
    for (const m of mba) {
      const answers = tb.filter((r) => r.t + r.frame.txTimeNs + SIFS_NS === m.t)
      expect(answers.length).toBe(2)
      expect(one(answers.map((r) => r.t + r.frame.txTimeNs))).toBe(m.t - SIFS_NS)
    }
  })

  it('"The whole round": 2092.8 µs on the air, 33,788 bytes up', () => {
    expect(36 * US + SIFS_NS + 1_988_800 + SIFS_NS + 36 * US).toBe(2_092_800)
    expect(2 * 16_894).toBe(33_788)
  })

  it('neither the length nor the slice came from the answering device', () => {
    // "the same length and the same 16,894 bytes, though the two uploaders are not the same
    //  distance away and their queues are not the same"
    const sc = ofdmaUl.scenario()
    const pos = UPLOADERS.map((id) => sc.nodes.find((n) => n.id === id)!.pos)
    expect(pos[0]).not.toEqual(pos[1])
    // both answers of a round share the group, which is what makes them non-overlapping
    for (const t of triggers(rs)) {
      const answers = tb.filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)
      for (const a of answers) expect(a.frame.orthogonalGroup).toBe(t.frame.orthogonalGroup)
    }
    expect(one(tb.map((r) => r.frame.mcs))).toBe(11)
    expect(one(tb.map((r) => r.frame.widthMhz))).toBe(20)
  })
})

describe('ofdma-ul · the uplink of two uploaders over 100 ms', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)

  it('16 triggers, 2 of which nobody answered; every other one brought back both answers', () => {
    const answered = triggers(rs).map((t) =>
      tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup).length)
    expect(answered.length).toBe(16)
    expect(answered.filter((n) => n === 0).length).toBe(2)
    expect(answered.filter((n) => n === 2).length).toBe(14)
    expect(new Set(answered)).toEqual(new Set([0, 2]))
  })

  it('28 triggered answers carry 473,032 bytes against 54 contended sends carrying 996,756', () => {
    const tb = tbPpdus(rs), su = contended(rs)
    expect(tb.length).toBe(28)
    expect(bytes(tb)).toBe(473_032)
    expect(su.length).toBe(54)
    expect(bytes(su)).toBe(996_756)
    // "About a third of what this pair sent up went in triggered rounds"
    expect(Math.round((bytes(tb) / (bytes(tb) + bytes(su))) * 100)).toBe(32)
    for (const r of [...tb, ...su]) expect(UPLOADERS).toContain(r.node)
  })

  it('"it collided six times doing so": every collision is outside a triggered round', () => {
    const collisions = ofType(rs, 'COLLISION')
    expect(collisions.length).toBe(6)
    for (const c of collisions) {
      const inside = tbPpdus(rs).some((t) => t.t <= c.t && c.t <= t.t + t.frame.txTimeNs)
      expect(inside, `collision at ${c.t}`).toBe(false)
    }
  })
})

describe('ofdma-ul · the experiments', () => {
  it('the Duration of the trigger frame covers the answers and the acknowledgement too', () => {
    const rs = runOf(ofdmaUl, undefined, RUN_NS)
    for (const t of triggers(rs)) {
      expect(t.frame.durationFieldNs).toBeGreaterThanOrEqual(SIFS_NS + 1988.8 * US + SIFS_NS + 36 * US)
    }
  })

  it('turning OFDMA off on one uploader stops every trigger frame, even for the other', () => {
    const rs = without('sta-1')
    expect(triggers(rs).length).toBe(0)
    expect(tbPpdus(rs).length).toBe(0)
    // the uplink still runs, the ordinary way
    expect(contended(rs).length).toBeGreaterThan(50)
  })
})
