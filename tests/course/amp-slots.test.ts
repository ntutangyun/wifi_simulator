/**
 * Every empirical claim in the "Slotted random access" lesson, measured against
 * the lesson's own scenario and its three variants. Each assertion quotes the
 * sentence it guards; standard constants are checked against the engine's
 * exports (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { ampSlots, ampSlotsScenario } from '../../src/course/amp/amp-slots'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_ACK_BYTES, AMP_SIFS_NS, AMP_TAG_DL_SENS_DBM, AMP_UL_CHIP_NS, AMP_UL_SYNC_CHIPS,
  ampDlPpduNs, ampRespBytes, ampTriggerBytes, ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { CTS_BYTES, ERP_2G, txTimeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { decodeFrame } from '../../src/model/frameFields'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** 30 rounds at one round every 20 ms. The 31st round starts at 600 ms and is not counted. */
const ROUNDS = 30
const RUN_NS = 600 * MS

const AP = 'ap#2g'
const TAGS = [1, 2, 3, 4, 5, 6].map((i) => `tag-${i}#2g`)

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? ampSlots.scenario() : ampSlots.variants![variant].scenario()
    memo.set(key, [...new Simulation(s).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ACWE1 = 0, ACWE3 = 1, TWO_PHASE = 2

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const results = (rs: TLRecord[]) => ofType(rs, 'AMP_RESULT')
const acked = (rs: TLRecord[]) => results(rs).filter((r) => r.acked).length

/** Slots of the run classified by how many responses started inside them. */
function slotCensus(rs: TLRecord[], reachable: number) {
  const resp = txs(rs, 'ampResp')
  const slots = ofType(rs, 'AMP_SLOT').filter((s) => s.slot <= reachable)
  const per = slots.map((s) => resp.filter((r) => r.t >= s.t && r.t < s.untilNs).length)
  return {
    slots: slots.length,
    empty: per.filter((n) => n === 0).length,
    success: per.filter((n) => n === 1).length,
    collision: per.filter((n) => n > 1).length,
  }
}

/**
 * The lesson's analytic slot model. q = 1/(ACW+1) is the chance one tag lands
 * in a given reachable slot; a tag transmits at all with probability p.
 */
function model(M: number, acw: number, slots: number) {
  const q = 1 / (acw + 1)
  const empty = (1 - q) ** M
  const success = M * q * (1 - q) ** (M - 1)
  return { q, p: Math.min(slots, acw + 1) / (acw + 1), reachable: Math.min(slots, acw + 1), empty, success, collision: 1 - empty - success }
}

/** The tolerance the lesson prose states for measured-versus-model. */
const TOL = 0.05

describe('amp-slots · lesson shape', () => {
  it('the scenario and all three variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(ampSlots.scenario())).not.toThrow()
    for (const v of ampSlots.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(ampSlots.variants!.length).toBe(3)
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(ampSlots) / 150
      + OBSERVE_MINUTES * ampSlots.observe.length + TRY_MINUTES * ampSlots.tryThis.length
    expect(lessonMinutes(ampSlots)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(ampSlots)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(ampSlots)).toBeLessThanOrEqual(25)
  })

  it('every jump target occurs where its label says it does', () => {
    const rs = recs()
    const find = (en: string) => ampSlots.jumps.find((j) => j.label.en === en)!
    for (const en of ['first collision in a slot', 'first Ack naming the router itself', 'first lost response']) {
      expect(rs.some(find(en).find), en).toBe(true)
    }
    // the two jumps whose labels name a variant
    expect(recs(ACWE3).some(find('first sit-out (ACWE 3 variant)').find)).toBe(true)
    expect(recs(TWO_PHASE).some(find('first scheduled trigger (two-phase variant)').find)).toBe(true)
  })

  it('the scene is one router and six tags on a 2 m ring, all at the same signal level', () => {
    // "Six tags sit on a ring 2 m from the router … every one hears the router at −37.2 dBm and reaches
    //  it at −57.2 dBm"
    const s = ampSlots.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', ...TAGS.map(() => 'amp')])
    expect(s.nodes[0].ampAp).toMatchObject({ pollIntervalMs: 20, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline' })
    const links = buildLinkTable(s.nodes, s.walls)
    const dl = s.nodes.slice(1).map((n) => links.get('ap')!.get(n.id)!)
    const ul = s.nodes.slice(1).map((n) => links.get(n.id)!.get('ap')!)
    for (const v of dl) expect(v.toFixed(1)).toBe('-37.2')
    for (const v of ul) expect(v.toFixed(1)).toBe('-57.2')
    // "34.8 dB of downlink margin, 36.8 dB up — and the spread across the six is under a hundredth of a decibel"
    expect((dl[0] - AMP_TAG_DL_SENS_DBM).toFixed(1)).toBe('34.8')
    expect((ul[0] - ampUlSensDbm(250)).toFixed(1)).toBe('36.8')
    // equal power ⇒ no capture: the 5 dB capture margin the prose quotes is pinned in
    // tests/engine/amp-collision.test.ts ("a 5 dB stronger one is captured"); here nothing has it.
    expect(Math.max(...ul) - Math.min(...ul)).toBeLessThan(0.01)
    // the three variants: ACWE 1, ACWE 3, and two-phase at ACWE 2
    expect(ampSlots.variants![ACWE1].scenario().nodes[0].ampAp).toMatchObject({ acwe: 1, slots: 4, readMode: 'inline' })
    expect(ampSlots.variants![ACWE3].scenario().nodes[0].ampAp).toMatchObject({ acwe: 3, slots: 4, readMode: 'inline' })
    expect(ampSlots.variants![TWO_PHASE].scenario().nodes[0].ampAp).toMatchObject({ acwe: 2, slots: 4, readMode: 'twoPhase' })
  })
})

describe('amp-slots · standard constants', () => {
  it('ACW = 2^ACWE − 1: 1, 3 and 7 for the three ACWE values the lesson uses', () => {
    // "ACWE 1 → ACW 1, ACWE 2 → ACW 3, ACWE 3 → ACW 7"
    expect([1, 2, 3].map((e) => 2 ** e - 1)).toEqual([1, 3, 7])
    // and the engine agrees, in the ACW the tags record
    const acwOf = (rs: TLRecord[]) => [...new Set(ofType(rs, 'AMP_ABOC').map((r) => r.acw))]
    expect(acwOf(recs(ACWE1))).toEqual([1])
    expect(acwOf(recs())).toEqual([3])
    expect(acwOf(recs(ACWE3))).toEqual([7])
  })

  it('the slot is 528 µs with a reading and 272 µs for an identity-only response', () => {
    // "a reading slot is 528 µs … the two-phase random slot carries 7 octets and is 272 µs"
    expect(ampRespBytes(true)).toBe(15)
    expect(ampRespBytes(false)).toBe(7)
    expect(ampUlPpduNs(250, ampRespBytes(true))).toBe(528 * US)
    expect(ampUlPpduNs(250, ampRespBytes(false))).toBe(272 * US)
  })

  it('the triggers are 618 µs broadcast and 810 µs when they list three tags', () => {
    // "the scheduled trigger is 19 octets and 810 µs, six octets longer than the 13-octet, 618 µs broadcast one"
    const ext = ERP_2G.signalExtNs
    expect(ampTriggerBytes(0)).toBe(13)
    expect(ampTriggerBytes(3)).toBe(19)
    expect(ampDlPpduNs(250, ampTriggerBytes(0), ext)).toBe(618 * US)
    expect(ampDlPpduNs(250, ampTriggerBytes(3), ext)).toBe(810 * US)
    expect(ampDlPpduNs(250, AMP_ACK_BYTES, ext)).toBe(330 * US)
    expect(txTimeNs(CTS_BYTES, 6) + ext).toBe(50 * US)
    expect(AMP_SIFS_NS).toBe(10 * US)
    // "the 48 µs of AMP-Sync that is an uplink response’s whole preamble" — the capture window up here
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250]).toBe(48 * US)
  })
})

describe('amp-slots · the draw', () => {
  const rs = recs()

  it('every tag that decodes the trigger draws once a round: six draws, 180 in thirty rounds', () => {
    // "All six tags decode every trigger, so every round opens with six ABOC draws — 180 in the thirty
    //  rounds this lesson measures."
    const rounds = ofType(rs, 'AMP_ROUND')
    expect(rounds.length).toBe(ROUNDS)
    expect(rounds.every((r) => r.phase === 'random')).toBe(true)
    const draws = ofType(rs, 'AMP_ABOC')
    expect(draws.length).toBe(6 * ROUNDS)
    for (const r of rounds) {
      const inRound = draws.filter((d) => d.t >= r.t && d.t < r.untilNs)
      expect(inRound.length).toBe(6)
      expect(new Set(inRound.map((d) => d.node))).toEqual(new Set(TAGS))
    }
  })

  it('every draw is in [0, ACW] and every draw becomes slot ABOC + 1 or a sit-out', () => {
    // "the tag draws an ABOC uniformly from 0 to ACW and arms slot ABOC + 1; a draw of ACW ≥ N is a sit-out"
    for (const [v, acw] of [[ACWE1, 1], [undefined, 3], [ACWE3, 7]] as const) {
      const draws = ofType(recs(v), 'AMP_ABOC')
      for (const d of draws) {
        expect(d.acw).toBe(acw)
        expect(d.aboc).toBeGreaterThanOrEqual(0)
        expect(d.aboc).toBeLessThanOrEqual(acw)
        expect(d.slot).toBe(d.aboc < 4 ? d.aboc + 1 : null)
      }
      // every value in [0, ACW] really is drawn somewhere
      expect(new Set(draws.map((d) => d.aboc)).size).toBe(acw + 1)
    }
  })

  it('at ACWE 2 no tag sits out and every response lands in the slot its draw armed', () => {
    // "With ACW 3 and four slots no draw is ever wasted: all 180 draws transmit, each in the slot it armed."
    const draws = ofType(rs, 'AMP_ABOC')
    expect(draws.filter((d) => d.slot === null).length).toBe(0)
    const resp = txs(rs, 'ampResp')
    expect(resp.length).toBe(6 * ROUNDS)
    const slots = ofType(rs, 'AMP_SLOT')
    for (const r of resp) {
      const s = slots.filter((x) => x.t <= r.t && r.t < x.untilNs).pop()!
      expect(s.slot).toBe(r.frame.amp!.slot)
    }
    // "no tag ever misses an Ack here, so no response is ever transmitted a slot late"
    expect(results(rs).filter((r) => !r.sent).length).toBe(0)
  })

  it('each tag uses all four ABOC values across the thirty rounds — the draw is fresh every round', () => {
    // "No tag keeps a slot: over the thirty rounds each of the six draws all four ABOC values at least once,
    //  so a tag that loses a slot to a collision is somewhere else in the next round."
    for (const t of TAGS) {
      const mine = ofType(rs, 'AMP_ABOC').filter((d) => d.node === t)
      expect(mine.length).toBe(ROUNDS)
      expect(new Set(mine.map((d) => d.aboc))).toEqual(new Set([0, 1, 2, 3]))
    }
  })
})

describe('amp-slots · one round, slot by slot', () => {
  const rs = recs()

  it('the round is the same 4190 µs as lesson 1, now 20.95 % of every 20 ms', () => {
    // "The round is unchanged from lesson 1 — 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs — but the
    //  router now polls every 20 ms, so it costs 20.95 % of the channel instead of 4.19 %."
    expect(50 + 10 + 618 + 4 * (10 + 528 + 10 + 330)).toBe(4190)
    const cts = txs(rs, 'cts')
    expect(cts[0].t).toBe(0)
    expect(cts[1].t).toBe(20 * MS)
    expect(cts[0].frame.durationFieldNs).toBe(4140 * US)
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t < 20 * MS).pop()!
    expect(lastAck.t - cts[0].t).toBe(4190 * US)
    expect(((4190 / 20_000) * 100).toFixed(2)).toBe('20.95')
    expect(((4190 / 100_000) * 100).toFixed(2)).toBe('4.19')
  })

  it('the first round draws 1, 0, 2, 3, 2, 2 and packs three tags into slot 3', () => {
    // the "The first round" table: "Tag 1 draws 1 → slot 2, Tag 2 draws 0 → slot 1, Tags 3, 5 and 6 all
    //  draw 2 → slot 3, Tag 4 draws 3 → slot 4."
    const draws = ofType(rs, 'AMP_ABOC').filter((d) => d.t < 20 * MS)
    expect(draws.map((d) => d.t)).toEqual(draws.map(() => 678 * US))
    expect(draws.map((d) => [d.node, d.aboc, d.slot])).toEqual([
      ['tag-1#2g', 1, 2], ['tag-2#2g', 0, 1], ['tag-3#2g', 2, 3],
      ['tag-4#2g', 3, 4], ['tag-5#2g', 2, 3], ['tag-6#2g', 2, 3],
    ])
    // "Slot 1 carries Tag 2 alone and slot 2 Tag 1; slot 4 carries Tag 4. Three readings arrive; three do not."
    const resp = txs(rs, 'ampResp').filter((r) => r.t < 20 * MS)
    expect(resp.map((r) => [r.t / US, r.node, r.frame.amp!.slot])).toEqual([
      [688, 'tag-2#2g', 1], [1566, 'tag-1#2g', 2],
      [2444, 'tag-3#2g', 3], [2444, 'tag-5#2g', 3], [2444, 'tag-6#2g', 3],
      [3322, 'tag-4#2g', 4],
    ])
    const first = results(rs).filter((r) => r.t < 20 * MS)
    expect(first.filter((r) => r.acked).map((r) => [r.t / US, r.node])).toEqual([
      [1556, 'tag-2#2g'], [2434, 'tag-1#2g'], [4190, 'tag-4#2g'],
    ])
    expect(first.filter((r) => !r.acked).map((r) => [r.t / US, r.node])).toEqual([
      [3312, 'tag-3#2g'], [3312, 'tag-5#2g'], [3312, 'tag-6#2g'],
    ])
  })

  it('the three tags in slot 3 start together at 2444 µs and the AP hears none of them', () => {
    // "All three start at 2444 µs, at the same power, and the AP decodes nothing: it records one COLLISION
    //  at 2972 µs, the instant the slot closes."
    const coll = ofType(rs, 'COLLISION').filter((c) => c.t < 20 * MS)
    expect(coll.length).toBe(1)
    expect(coll[0].t).toBe(2972 * US)
    expect([...coll[0].nodes].sort()).toEqual(['tag-3#2g', 'tag-5#2g', 'tag-6#2g'])
    // "the AP never captures one of them: not one RX_FAIL with reason capture in the whole run, on any node"
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'capture').length).toBe(0)
    // "with equal power nothing is even acquired as a preamble, so the AP's record is RX_MISS, not RX_FAIL"
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP).length).toBe(0)
    const miss = ofType(rs, 'RX_MISS').filter((r) => r.node === AP && r.t < 20 * MS)
    expect(miss.length).toBe(3)
    expect(new Set(miss.map((r) => r.reason))).toEqual(new Set(['preambleSinr']))
  })

  it('the Ack closing a collided slot names the router, and the tags learn 330 µs later', () => {
    // "The Ack at 2982 µs carries the router's own identifier … all three tags read it at 3312 µs and
    //  book the round as lost."
    const ack = txs(rs, 'ampAck').find((r) => r.t === 2982 * US)!
    expect(ack.frame.dst).toBe(ack.frame.src)
    expect(ack.frame.amp!.ackFor).toBe(3)
    expect(ack.t + ack.frame.txTimeNs).toBe(3312 * US)
    // "over the thirty rounds 46 of the 120 Acks name a tag and 74 name the router"
    const acks = txs(rs, 'ampAck')
    expect(acks.length).toBe(4 * ROUNDS)
    expect(acks.filter((r) => r.frame.dst !== r.frame.src).length).toBe(46)
    expect(acks.filter((r) => r.frame.dst === r.frame.src).length).toBe(74)
  })
})

describe('amp-slots · the analytic slot model', () => {
  /** The three rows of the model table: ACWE, ACW, reachable slots, model and measured fractions. */
  const ROWS = [
    { variant: ACWE1 as number | undefined, acwe: 1, acw: 1 },
    { variant: undefined, acwe: 2, acw: 3 },
    { variant: ACWE3 as number | undefined, acwe: 3, acw: 7 },
  ]

  it('the formula reproduces the model column of the table to a tenth of a percentage point', () => {
    // "empty 1.6 %, success 9.4 %, collision 89.1 %" / "17.8 %, 35.6 %, 46.6 %" / "44.9 %, 38.5 %, 16.7 %"
    const pct = (x: number) => (x * 100).toFixed(1)
    const m1 = model(6, 1, 4), m2 = model(6, 3, 4), m3 = model(6, 7, 4)
    expect([m1.reachable, m2.reachable, m3.reachable]).toEqual([2, 4, 4])
    expect([pct(m1.p), pct(m2.p), pct(m3.p)]).toEqual(['100.0', '100.0', '50.0'])
    expect([pct(m1.empty), pct(m1.success), pct(m1.collision)]).toEqual(['1.6', '9.4', '89.1'])
    expect([pct(m2.empty), pct(m2.success), pct(m2.collision)]).toEqual(['17.8', '35.6', '46.6'])
    expect([pct(m3.empty), pct(m3.success), pct(m3.collision)]).toEqual(['44.9', '38.5', '16.7'])
  })

  it('the measured column of the table is what thirty rounds actually produce', () => {
    // "measured over thirty rounds: 0.0 / 11.7 / 88.3 %, 16.7 / 38.3 / 45.0 %, 42.5 / 43.3 / 14.2 %"
    const pct = (n: number, d: number) => ((n / d) * 100).toFixed(1)
    const want = [['0.0', '11.7', '88.3'], ['16.7', '38.3', '45.0'], ['42.5', '43.3', '14.2']]
    ROWS.forEach((row, i) => {
      const m = model(6, row.acw, 4)
      const c = slotCensus(recs(row.variant), m.reachable)
      expect(c.slots, `ACWE ${row.acwe} reachable slots`).toBe(m.reachable * ROUNDS)
      expect([pct(c.empty, c.slots), pct(c.success, c.slots), pct(c.collision, c.slots)], `ACWE ${row.acwe}`).toEqual(want[i])
    })
  })

  it('measured and model never differ by more than 0.05 in any of the nine cells', () => {
    // "No measured fraction is further than 0.05 — five percentage points — from the formula."
    let worst = 0
    for (const row of ROWS) {
      const m = model(6, row.acw, 4)
      const c = slotCensus(recs(row.variant), m.reachable)
      for (const k of ['empty', 'success', 'collision'] as const) {
        const d = Math.abs(c[k] / c.slots - m[k])
        expect(d, `ACWE ${row.acwe} ${k}`).toBeLessThan(TOL)
        worst = Math.max(worst, d)
      }
    }
    // "the largest gap anywhere in the table is 4.9 points, on the success column at ACWE 3"
    expect((worst * 100).toFixed(1)).toBe('4.9')
  })

  it('the sit-out rate matches 1 − p: none below ACWE 3, 50.6 % against 50 % at ACWE 3', () => {
    // "1 − p predicts half the draws sit out at ACWE 3; 91 of the 180 draws do, 50.6 %."
    expect(ofType(recs(ACWE1), 'AMP_ABOC').filter((d) => d.slot === null).length).toBe(0)
    expect(ofType(recs(), 'AMP_ABOC').filter((d) => d.slot === null).length).toBe(0)
    const sit = ofType(recs(ACWE3), 'AMP_ABOC').filter((d) => d.slot === null)
    expect(sit.length).toBe(91)
    expect(((91 / 180) * 100).toFixed(1)).toBe('50.6')
    expect((model(6, 7, 4).p * 100).toFixed(0)).toBe('50')
  })
})

describe('amp-slots · choosing ACW', () => {
  it('ACWE 1 wastes half the slots outright: nothing ever lands in slot 3 or slot 4', () => {
    // "ACW + 1 = 2 is below the four slots on offer, so slots 3 and 4 are unreachable by construction: all
    //  60 of them are empty, and the 1756 µs they cost is paid in every round."
    const rs = recs(ACWE1)
    expect(new Set(txs(rs, 'ampResp').map((r) => r.frame.amp!.slot))).toEqual(new Set([1, 2]))
    const dead = ofType(rs, 'AMP_SLOT').filter((s) => s.slot >= 3)
    expect(dead.length).toBe(2 * ROUNDS)
    expect(2 * (10 + 528 + 10 + 330)).toBe(1756)
    expect(((1756 / 4190) * 100).toFixed(1)).toBe('41.9')
  })

  it('the three ACWE values deliver 0.23, 1.53 and 1.73 readings a round', () => {
    // "0.23 readings a round at ACWE 1, 1.53 at ACWE 2 and 1.73 at ACWE 3."
    expect(acked(recs(ACWE1))).toBe(7)
    expect(acked(recs())).toBe(46)
    expect(acked(recs(ACWE3))).toBe(52)
    expect([7, 46, 52].map((n) => (n / ROUNDS).toFixed(2))).toEqual(['0.23', '1.53', '1.73'])
    // the COLLISION records behind the collision column of the model table
    expect(ofType(recs(ACWE1), 'COLLISION').length).toBe(53)
    expect(ofType(recs(), 'COLLISION').length).toBe(54)
    expect(ofType(recs(ACWE3), 'COLLISION').length).toBe(17)
  })

  it('ACWE 1 starves two of the six tags, while ACWE 2 and 3 acknowledge every tag', () => {
    // "two of the six tags are never acknowledged once" / "ACWE 2 … its thinnest tag getting 4 through
    //  against 6 at ACWE 3"
    const perTag = (rs: TLRecord[]) => TAGS.map((t) => results(rs).filter((r) => r.node === t && r.acked).length)
    expect(perTag(recs(ACWE1))).toEqual([0, 1, 2, 0, 2, 2])
    expect(Math.min(...perTag(recs()))).toBe(4)
    expect(Math.min(...perTag(recs(ACWE3)))).toBe(6)
    expect(perTag(recs()).every((n) => n > 0)).toBe(true)
    expect(perTag(recs(ACWE3)).every((n) => n > 0)).toBe(true)
  })

  it('a seventh tag costs the other six: 1.03 readings a round instead of 1.53', () => {
    // "Add a seventh tag at the same range and the delivery falls from 1.53 readings a round to 1.03,
    //  while the collided share of the slots climbs from 45.0 % to 59.2 % — the model says 55.5 %."
    const rs = [...new Simulation(ampSlotsScenario({ acwe: 2, readMode: 'inline', tags: 7 })).runUntil(RUN_NS).records]
    expect(ofType(rs, 'AMP_ABOC').length).toBe(7 * ROUNDS)
    expect(acked(rs)).toBe(31)
    expect((31 / ROUNDS).toFixed(2)).toBe('1.03')
    const c = slotCensus(rs, 4)
    expect(((c.collision / c.slots) * 100).toFixed(1)).toBe('59.2')
    expect((model(7, 3, 4).collision * 100).toFixed(1)).toBe('55.5')
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'capture').length).toBe(0)
  })
})

describe('amp-slots · the two-phase variant', () => {
  const rs = recs(TWO_PHASE)

  it('each poll is two rounds: a 272 µs random phase and a 528 µs scheduled one', () => {
    // "the random phase's slots carry 7 octets and last 272 µs; the scheduled phase's carry the reading and
    //  last 528 µs"
    const rounds = ofType(rs, 'AMP_ROUND')
    expect(rounds.filter((r) => r.phase === 'random').length).toBe(ROUNDS)
    expect(rounds.filter((r) => r.phase === 'scheduled').length).toBe(26)
    expect(new Set(rounds.filter((r) => r.phase === 'random').map((r) => r.slotNs))).toEqual(new Set([272 * US]))
    expect(new Set(rounds.filter((r) => r.phase === 'scheduled').map((r) => r.slotNs))).toEqual(new Set([528 * US]))
    // "four rounds in thirty hear nobody at all, and then no scheduled phase follows"
    expect(ROUNDS - 26).toBe(4)
  })

  it('the scheduled trigger lists exactly the tags the random phase heard, in slot order', () => {
    // "The scheduled trigger of the first round names Tag 2, Tag 1 and Tag 4 — the three the random phase
    //  heard, in the order it heard them — and gives each of them a slot by list position."
    const sched = txs(rs, 'ampTrigger').filter((r) => r.frame.amp!.phase === 'scheduled')
    expect(sched.length).toBe(26)
    expect(sched[0].t).toBe(3176 * US)
    expect(sched[0].frame.amp!.staIds).toEqual(['tag-2', 'tag-1', 'tag-4'])
    expect(sched[0].frame.bytes).toBe(19)
    expect(sched[0].frame.txTimeNs).toBe(810 * US)
    // each listed tag answers in its list position
    const resp = txs(rs, 'ampResp').filter((r) => r.t > sched[0].t && r.t < 20 * MS)
    expect(resp.map((r) => [r.node, r.frame.amp!.slot])).toEqual([['tag-2#2g', 1], ['tag-1#2g', 2], ['tag-4#2g', 3]])
    // every scheduled trigger lists what the round before it acknowledged
    for (const s of sched) {
      const heard = txs(rs, 'ampAck').filter((a) => a.t < s.t && a.t > s.t - 4 * MS && a.frame.dst !== a.frame.src)
      expect(s.frame.amp!.staIds).toEqual(heard.map((a) => a.frame.dst))
    }
  })

  it('the first two-phase round costs 6620 µs against the inline round’s 4190 µs, for the same three readings', () => {
    // "3166 µs of random phase, then 10 + 810 + 3 × 878 = 3454 µs of scheduled phase: 6620 µs in all, where
    //  the inline round delivered the same three readings in 4190 µs."
    expect(50 + 10 + 618 + 4 * (10 + 272 + 10 + 330)).toBe(3166)
    expect(10 + 528 + 10 + 330).toBe(878)
    expect(10 + 810 + 3 * 878).toBe(3454)
    expect(3166 + 3454).toBe(6620)
    const cts = txs(rs, 'cts')[0]
    const last = ofType(rs, 'TX_END').filter((r) => r.t < 20 * MS).pop()!
    expect(last.t - cts.t).toBe(6620 * US)
    expect(6620 - 4190).toBe(2430)
    // "the CTS-to-self must now reserve 7512 µs, because it is sized for a scheduled phase of four tags"
    expect(cts.frame.durationFieldNs).toBe(7512 * US)
  })

  it('two-phase delivers the same 46 readings as inline and spends 8.0 % more air doing it', () => {
    // "Both modes deliver 46 readings in the thirty rounds. Inline spends 154 730 µs of PPDU on them and
    //  two-phase 167 130 µs — 8.0 % more."
    const air = (x: TLRecord[]) => ofType(x, 'TX_START').reduce((s, r) => s + r.frame.txTimeNs, 0) / US
    const sched = txs(rs, 'ampTrigger').filter((r) => r.frame.amp!.phase === 'scheduled')
    const readings = sched.reduce((s, r) => s + r.frame.amp!.staIds!.length, 0)
    expect(readings).toBe(46)
    expect(acked(recs())).toBe(46)
    expect(air(recs())).toBe(154_730)
    expect(air(rs)).toBe(167_130)
    expect((((167_130 / 154_730) - 1) * 100).toFixed(1)).toBe('8.0')
  })
})

describe('amp-slots · what the UI shows', () => {
  const CTX = { apId: 'ap', isEdca: false }

  it('the trigger body prints the ACWE, the ACW it implies and the slot plan', () => {
    // "Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading"
    const body = (rs: TLRecord[]) => {
      const trig = txs(rs, 'ampTrigger')[0]
      return decodeFrame(trig.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'body')!.value
    }
    expect(body(recs())).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading')
    expect(body(recs(ACWE1))).toBe('Session 1 · ACWE 1 (ACW 1) · 4 slots × 528 µs · reading')
    expect(body(recs(ACWE3))).toBe('Session 1 · ACWE 3 (ACW 7) · 4 slots × 528 µs · reading')
    expect(body(recs(TWO_PHASE))).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 272 µs · id only')
  })

  it('the log prints a draw, a sit-out and a lost round the way the lesson quotes them', () => {
    // "“ABOC 1 of [0, 3] → slot 2”, “ABOC 5 of [0, 7] → sits out” and “slot 3: not acknowledged”"
    expect(fmtRecord(ofType(recs(), 'AMP_ABOC')[0])).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    const sit = ofType(recs(ACWE3), 'AMP_ABOC').filter((d) => d.slot === null)[0]
    expect(sit.t).toBe(678 * US)
    expect(fmtRecord(sit)).toBe('tag-3#2g ABOC 5 of [0, 7] → sits out')
    const lost = results(recs()).filter((r) => !r.acked)[0]
    expect(fmtRecord(lost)).toBe('tag-3#2g slot 3: not acknowledged')
    expect(fmtRecord(ofType(recs(TWO_PHASE), 'AMP_ROUND')[0]))
      .toBe('ap#2g AMP round (random): 4 slots × 272.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
  })
})
