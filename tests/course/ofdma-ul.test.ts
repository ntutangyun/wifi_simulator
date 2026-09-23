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
import { ACK_TIMEOUT_NS, PHY_MODES, multiStaBaBytes, triggerBytes } from '../../src/engine/phy'
import { maxPsduBytesFor } from '../../src/engine/mac'
import { ampduPsduBytes } from '../../src/model/frames'
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

lessonShapeSuite(ofdmaUl, { proseMax: 1160, runNs: RUN_NS })

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

describe('ofdma-ul · the procedure, against the engine that runs it', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)

  it('steps 2 and 3: between two and four users, each on 1/n of the tones, one format for the round', () => {
    for (const t of triggers(rs)) {
      const users = t.frame.muParts!
      expect(users.length).toBeGreaterThanOrEqual(2)
      expect(users.length).toBeLessThanOrEqual(4)
      // one rung and one width for the whole round, dictated by the trigger and not by the device
      expect(t.frame.ulMode).toBe('he')
      expect(t.frame.ulWidthMhz).toBe(20)
      expect(new Set(users.map((p) => p.mcs))).toEqual(new Set([11]))
    }
    // the answers really do sit on a half each: the length they were given is the length
    // 1/2 of a 20 MHz channel needs for the bytes that fit a 2 ms answer
    expect(1 / 2).toBe(1 / triggers(rs)[0].frame.muParts!.length)
  })

  it('step 4: the longest backlog that fits 2 ms is 17,425 B, 143 symbols, 1988.8 µs', () => {
    const budget = maxPsduBytesFor('he', 11, 0.5, 2 * MS, 20, 1)
    expect(budget).toBe(17_425)
    expect(PHY_MODES.he.ndbps[11] * 0.5).toBe(975)
    expect(Math.ceil((16 + 8 * budget + 6) / 975)).toBe(143)
    expect(PHY_MODES.he.preambleNs + 143 * PHY_MODES.he.symNs).toBe(1988.8 * US)
    // and that is the one length every user of every round is given
    for (const t of triggers(rs)) {
      expect(new Set(t.frame.muParts!.map((p) => p.durNs))).toEqual(new Set([1988.8 * US]))
    }
    // a TB PPDU carries no per-user map: 44 µs of opening, not the 48 of a DL MU PPDU
    for (const r of tbPpdus(rs)) expect(r.frame.txTimeNs).toBe(1988.8 * US)
  })

  it('step 6: the 16,894 B answer is eleven whole frames, and the other 531 B is padding', () => {
    for (const r of tbPpdus(rs)) {
      expect(r.frame.ampdu!.mpduCount).toBe(11)
      expect(new Set(r.frame.msduBytes!)).toEqual(new Set([1500]))
      expect(r.frame.bytes).toBe(16_894)
      // eleven of these frames is what the PSDU holds, and a twelfth would not fit the
      // length the trigger named — so the rest of that length goes out as padding
      expect(ampduPsduBytes(new Array<number>(11).fill(1500))).toBe(16_894)
      expect(ampduPsduBytes(new Array<number>(12).fill(1500))).toBeGreaterThan(17_425)
    }
    expect(17_425 - 16_894).toBe(531)
  })

  it('steps 5 and 7: 28 + 6 per user, 32 + 8 per extra user, and a 45 µs response timeout', () => {
    expect(triggerBytes(2)).toBe(28 + 6 * 2)
    expect(triggerBytes(2)).toBe(40)
    expect(multiStaBaBytes(2)).toBe(32 + 8)
    expect(multiStaBaBytes(2)).toBe(40)
    expect(ACK_TIMEOUT_NS).toBe(45 * US)
    for (const m of txs(rs, (r) => r.frame.kind === 'mba')) expect(m.frame.bytes).toBe(40)
    // step 5's Duration: the gap, the answers, the second gap and the acknowledgement
    for (const t of triggers(rs)) {
      expect(t.frame.durationFieldNs).toBe(SIFS_NS + 1988.8 * US + SIFS_NS + 36 * US)
    }
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
