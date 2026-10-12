/**
 * Every empirical claim in the "Slotted random access" lesson, measured against
 * the lesson's own scenario and its three variants. Each assertion quotes the
 * sentence it guards **verbatim** from the shipped prose (EN unless the claim
 * only exists in ZH); standard constants are checked against the engine's
 * exports (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ampSlots, ampSlotsScenario } from '../../src/course/amp/amp-slots'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_AMP_AP, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_ACK_BYTES, AMP_FCS_BYTES, AMP_HDR_BYTES, AMP_SIFS_NS, AMP_STA_ID_BYTES,
  AMP_TAG_DL_SENS_DBM, AMP_TRIGGER_BODY_BYTES,
  AMP_UL_CHIP_NS, AMP_UL_SYNC_CHIPS,
  ampDlPpduNs, ampRespBytes, ampTriggerBytes, ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { CTS_BYTES, ERP_2G, txTimeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { rssiOn } from './rssi'
import { decodeFrame } from '../../src/model/frameFields'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { lessonTexts } from '../../src/course/readability'
import { zhNumeral } from './coverage'

const MS = 1_000_000
const US = 1_000
/** 30 rounds at one round every 20 ms. The 31st round starts at 600 ms and is not counted. */
const ROUNDS = 30
const RUN_NS = 600 * MS

// `lessonShapeSuite` (tests/course/kit.ts) is not used here: its jump check runs
// only the BASE scenario, and two of this lesson's five jumps — the sit-out and
// the scheduled trigger — exist only in a variant (ACWE 3 and two-phase), by
// design, unchanged across the migration. The `lesson shape` describe below
// covers exactly that, per variant, so nothing here is actually ungraded.

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
/** Every run the lesson ships, for claims the prose makes about "the whole run". */
const ALL_RUNS: (number | undefined)[] = [undefined, ACWE1, ACWE3, TWO_PHASE]

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const results = (rs: TLRecord[]) => ofType(rs, 'AMP_RESULT')
const acked = (rs: TLRecord[]) => results(rs).filter((r) => r.acked).length
const captures = (rs: TLRecord[]) => ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'capture').length
/** Sensor readings the AP actually decoded: an ampResp carrying a reading, received without error. */
const readingsDelivered = (rs: TLRecord[]) =>
  ofType(rs, 'RX_OK').filter((r) => r.node === AP && r.frame.kind === 'ampResp' && r.frame.amp?.reading === true).length

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

  it('every jump predicate matches a record in the run it points at', () => {
    // The jumps, in declaration order: the collision in a slot, the Ack naming the
    // router itself, the lost response, then one per variant.
    expect(ampSlots.jumps.length).toBe(5)
    const rs = recs()
    for (const i of [0, 1, 2]) expect(rs.some(ampSlots.jumps[i].find), `jump ${i}`).toBe(true)
    // the two jumps that only happen in a variant
    expect(recs(ACWE3).some(ampSlots.jumps[3].find)).toBe(true)
    expect(recs(TWO_PHASE).some(ampSlots.jumps[4].find)).toBe(true)
  })

  it('the scene is one router and six tags on a 2 m ring, all at the same signal level', () => {
    // "Six tags sit on a ring 2 m from the router."
    const s = ampSlots.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', ...TAGS.map(() => 'amp')])
    expect(s.nodes[0].ampAp).toMatchObject({ pollIntervalMs: 20, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline' })
    // "The geometry is deliberate: every one hears the router at −30.7 dBm and reaches it at −50.7 dBm —
    //  41.3 dB of downlink margin, 43.3 dB up — with under a hundredth of a decibel between them."
    const links = buildLinkTable(s.nodes, s.walls)
    // on the 2.4 GHz link, where the lesson runs: rssiOn applies the band offset the engine applies
    const dl = s.nodes.slice(1).map((n) => rssiOn('2g', links, 'ap', n.id))
    const ul = s.nodes.slice(1).map((n) => rssiOn('2g', links, n.id, 'ap'))
    for (const v of dl) expect(v.toFixed(1)).toBe('-30.7')
    for (const v of ul) expect(v.toFixed(1)).toBe('-50.7')
    expect((dl[0] - AMP_TAG_DL_SENS_DBM).toFixed(1)).toBe('41.3')
    expect((ul[0] - ampUlSensDbm(250)).toFixed(1)).toBe('43.3')
    expect(Math.max(...ul) - Math.min(...ul)).toBeLessThan(0.01)
    expect(Math.max(...dl) - Math.min(...dl)).toBeLessThan(0.01)
    // the three variants: ACWE 1, ACWE 3, and two-phase at ACWE 2
    expect(ampSlots.variants![ACWE1].scenario().nodes[0].ampAp).toMatchObject({ acwe: 1, slots: 4, readMode: 'inline' })
    expect(ampSlots.variants![ACWE3].scenario().nodes[0].ampAp).toMatchObject({ acwe: 3, slots: 4, readMode: 'inline' })
    expect(ampSlots.variants![TWO_PHASE].scenario().nodes[0].ampAp).toMatchObject({ acwe: 2, slots: 4, readMode: 'twoPhase' })
  })
})

describe('amp-slots · standard constants', () => {
  it('ACW = 2^ACWE − 1: 1, 3 and 7 for the three ACWE values the lesson uses', () => {
    // "ACWE 1 → ACW 1, ACWE 2 → ACW 3, ACWE 3 → ACW 7."
    expect([1, 2, 3].map((e) => 2 ** e - 1)).toEqual([1, 3, 7])
    // and the engine agrees, in the ACW the tags record
    const acwOf = (rs: TLRecord[]) => [...new Set(ofType(rs, 'AMP_ABOC').map((r) => r.acw))]
    expect(acwOf(recs(ACWE1))).toEqual([1])
    expect(acwOf(recs())).toEqual([3])
    expect(acwOf(recs(ACWE3))).toEqual([7])
  })

  it('the slot is 528 µs with a reading and 272 µs for an identity-only response', () => {
    // "Its random phase asks only for identity: the response is 7 octets instead of 15, the slot 272 µs
    //  instead of 528 µs."
    expect(ampRespBytes(true)).toBe(15)
    expect(ampRespBytes(false)).toBe(7)
    expect(ampUlPpduNs(250, ampRespBytes(true))).toBe(528 * US)
    expect(ampUlPpduNs(250, ampRespBytes(false))).toBe(272 * US)
  })

  it('the triggers are 618 µs broadcast and 810 µs when they list three tags', () => {
    // "In the first round the random phase hears Tag 2, Tag 1 and Tag 4, and the scheduled trigger lists them
    //  in that order: 19 octets and 810 µs, six octets longer than the broadcast one, because each listed tag
    //  costs a 2-octet ID (that width and the 6-octet trigger body are model choices, not draft values)."
    const ext = ERP_2G.signalExtNs
    expect(ampTriggerBytes(0)).toBe(13)
    expect(ampTriggerBytes(3)).toBe(19)
    expect(ampTriggerBytes(3) - ampTriggerBytes(0)).toBe(6)
    expect(AMP_STA_ID_BYTES).toBe(2)
    expect(AMP_TRIGGER_BODY_BYTES).toBe(6)
    expect(ampDlPpduNs(250, ampTriggerBytes(0), ext)).toBe(618 * US)
    expect(ampDlPpduNs(250, ampTriggerBytes(3), ext)).toBe(810 * US)
    // "The round itself is unchanged from the first AMP lesson: 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs."
    expect(ampDlPpduNs(250, AMP_ACK_BYTES, ext)).toBe(330 * US)
    expect(txTimeNs(CTS_BYTES, 6) + ext).toBe(50 * US)
    expect(AMP_SIFS_NS).toBe(10 * US)
    // "Capture needs one signal 5 dB above the rest, inside the 48 µs of AMP-Sync that is an uplink
    //  response’s whole preamble."
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250]).toBe(48 * US)
  })
})

describe('amp-slots · the draw', () => {
  const rs = recs()

  it('every tag that decodes the trigger draws once a round: six draws, 180 in thirty rounds', () => {
    // "All six tags decode every trigger: six draws a round, 180 in the thirty measured here."
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
    // "the tag computes ACW = 2^ACWE − 1, draws an AMP backoff counter (ABOC) uniformly from 0 to ACW, and
    //  transmits in slot ABOC + 1. If the draw is too big for the slots on offer it sits the round out
    //  (11-26/1889r4 §39.4)." / the formula line "slot = ABOC + 1 if ABOC < N, otherwise sit out"
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
    // "The base scenario uses ACWE 2 with N = 4, so every draw reaches a slot." / "Here that never happens:
    //  all 180 responses go out in the slot their draw armed."
    const draws = ofType(rs, 'AMP_ABOC')
    expect(draws.filter((d) => d.slot === null).length).toBe(0)
    const resp = txs(rs, 'ampResp')
    expect(resp.length).toBe(6 * ROUNDS)
    const slots = ofType(rs, 'AMP_SLOT')
    for (const r of resp) {
      const s = slots.filter((x) => x.t <= r.t && r.t < x.untilNs).pop()!
      expect(s.slot).toBe(r.frame.amp!.slot)
    }
    // "A missed Ack is therefore a lost round — the tag counts one short, transmits a slot late, and the AP,
    //  which accepts a response only in the slot it is running, ignores it. Here that never happens"
    expect(results(rs).filter((r) => !r.sent).length).toBe(0)
  })

  it('each tag uses all four ABOC values across the thirty rounds — the draw is fresh every round', () => {
    // "Its ABOC changes with no memory of what just happened, and over thirty rounds it draws all four
    //  values — no window grows after a collision."
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
    // "The router polls every 20 ms, so thirty rounds fit into 600 ms — the window every number below is
    //  measured over. The round itself is unchanged from the first AMP lesson: 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330)
    //  = 4190 µs. Its price is not: 20.95 % of every 20 ms instead of 4.19 % of every 100 ms."
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
    // the rows of the "The first round, slot by slot" table: "1 | 688 µs | Tag 2 (ABOC 0) | acknowledged at
    // 1556 µs", "2 | 1566 µs | Tag 1 (ABOC 1) | acknowledged at 2434 µs", "3 | 2444 µs | Tags 3, 5 and 6
    // (ABOC 2) | collision; the Ack names the router", "4 | 3322 µs | Tag 4 (ABOC 3) | acknowledged at 4190 µs"
    const draws = ofType(rs, 'AMP_ABOC').filter((d) => d.t < 20 * MS)
    expect(draws.map((d) => d.t)).toEqual(draws.map(() => 678 * US))
    expect(draws.map((d) => [d.node, d.aboc, d.slot])).toEqual([
      ['tag-1#2g', 1, 2], ['tag-2#2g', 0, 1], ['tag-3#2g', 2, 3],
      ['tag-4#2g', 3, 4], ['tag-5#2g', 2, 3], ['tag-6#2g', 2, 3],
    ])
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
    // "Three tags drew 2 and all three start at 2444 µs. Their signals arrive within a hundredth of a decibel
    //  of each other, so nothing is acquired as a preamble at all: the AP records three RX_MISS with reason
    //  preambleSinr — not one RX_FAIL — and one COLLISION at 2972 µs, as the slot closes."
    const coll = ofType(rs, 'COLLISION').filter((c) => c.t < 20 * MS)
    expect(coll.length).toBe(1)
    expect(coll[0].t).toBe(2972 * US)
    expect([...coll[0].nodes].sort()).toEqual(['tag-3#2g', 'tag-5#2g', 'tag-6#2g'])
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP).length).toBe(0)
    const miss = ofType(rs, 'RX_MISS').filter((r) => r.node === AP && r.t < 20 * MS)
    expect(miss.length).toBe(3)
    expect(new Set(miss.map((r) => r.reason))).toEqual(new Set(['preambleSinr']))
  })

  it('no run of this lesson ever captures one signal out of a collided slot', () => {
    // "No node records an RX_FAIL with reason capture in the whole run." — the claim covers the base run and
    // all three variants, so all four are checked, plus the seven-tag scenario the try-this builds.
    for (const v of ALL_RUNS) expect(captures(recs(v)), `variant ${v ?? 'base'}`).toBe(0)
    // and each run really does contain collisions, so the zero is not vacuous
    for (const v of ALL_RUNS) expect(ofType(recs(v), 'COLLISION').length, `variant ${v ?? 'base'}`).toBeGreaterThan(0)
  })

  it('the Ack closing a collided slot names the router, and the tags learn 330 µs later', () => {
    // "The Ack at 2982 µs is the usual 330 µs PPDU, but its ID field carries the router’s own identifier.
    //  The three tags read it at 3312 µs and book the round as lost."
    const ack = txs(rs, 'ampAck').find((r) => r.t === 2982 * US)!
    expect(ack.frame.dst).toBe(ack.frame.src)
    expect(ack.frame.amp!.ackFor).toBe(3)
    expect(ack.frame.txTimeNs).toBe(330 * US)
    expect(ack.t + ack.frame.txTimeNs).toBe(3312 * US)
    // "Over the thirty rounds, 46 of the 120 Acks name a tag and 74 name the router."
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
    // the "Model / measured over thirty rounds (M = 6, N = 4)" table, model halves of each cell:
    // "1 (ACW 1) | 2 of 4 | 1.6 % / 0.0 % | 9.4 % / 11.7 % | 89.1 % / 88.3 %"
    // "2 (ACW 3) | 4 of 4 | 17.8 % / 16.7 % | 35.6 % / 38.3 % | 46.6 % / 45.0 %"
    // "3 (ACW 7) | 4 of 4 | 44.9 % / 42.5 % | 38.5 % / 43.3 % | 16.7 % / 14.2 %"
    const pct = (x: number) => (x * 100).toFixed(1)
    const m1 = model(6, 1, 4), m2 = model(6, 3, 4), m3 = model(6, 7, 4)
    expect([m1.reachable, m2.reachable, m3.reachable]).toEqual([2, 4, 4])
    expect([pct(m1.p), pct(m2.p), pct(m3.p)]).toEqual(['100.0', '100.0', '50.0'])
    expect([pct(m1.empty), pct(m1.success), pct(m1.collision)]).toEqual(['1.6', '9.4', '89.1'])
    expect([pct(m2.empty), pct(m2.success), pct(m2.collision)]).toEqual(['17.8', '35.6', '46.6'])
    expect([pct(m3.empty), pct(m3.success), pct(m3.collision)]).toEqual(['44.9', '38.5', '16.7'])
  })

  it('the measured column of the table is what thirty rounds actually produce', () => {
    // the same table, measured halves of each cell: "1.6 % / 0.0 %", "9.4 % / 11.7 %", "89.1 % / 88.3 %";
    // "17.8 % / 16.7 %", "35.6 % / 38.3 %", "46.6 % / 45.0 %";
    // "44.9 % / 42.5 %", "38.5 % / 43.3 %", "16.7 % / 14.2 %"
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
    // "Over only 120 slots a row, no measured fraction is further than 0.05 — five percentage points — from
    //  the formula; the largest gap is 4.87 points — 4.8 between the rounded cells — on success at ACWE 3."
    let worst = 0
    let worstAt = ''
    for (const row of ROWS) {
      const m = model(6, row.acw, 4)
      const c = slotCensus(recs(row.variant), m.reachable)
      for (const k of ['empty', 'success', 'collision'] as const) {
        const d = Math.abs(c[k] / c.slots - m[k])
        expect(d, `ACWE ${row.acwe} ${k}`).toBeLessThan(TOL)
        if (d > worst) { worst = d; worstAt = `ACWE ${row.acwe} ${k}` }
      }
    }
    expect(worstAt).toBe('ACWE 3 success')
    expect((worst * 100).toFixed(2)).toBe('4.87')
    // the same gap taken between the values the table prints, which round to one decimal
    expect((43.3 - 38.5).toFixed(1)).toBe('4.8')
  })

  it('the sit-out rate matches 1 − p: none below ACWE 3, 50.6 % against 50 % at ACWE 3', () => {
    // "The sit-out rate matches too: 1 − p predicts half the draws sit out at ACWE 3, and 91 of the 180 do,
    //  50.6 %. At ACWE 1 and 2, p = 1 and no tag sits out once."
    expect(ofType(recs(ACWE1), 'AMP_ABOC').filter((d) => d.slot === null).length).toBe(0)
    expect(ofType(recs(), 'AMP_ABOC').filter((d) => d.slot === null).length).toBe(0)
    const sit = ofType(recs(ACWE3), 'AMP_ABOC').filter((d) => d.slot === null)
    expect(sit.length).toBe(91)
    expect(((91 / 180) * 100).toFixed(1)).toBe('50.6')
    expect((model(6, 7, 4).p * 100).toFixed(0)).toBe('50')
    expect(model(6, 1, 4).p).toBe(1)
    expect(model(6, 3, 4).p).toBe(1)
  })
})

describe('amp-slots · choosing ACW', () => {
  it('ACWE 1 wastes half the slots outright: nothing ever lands in slot 3 or slot 4', () => {
    // "ACWE 1 is the pathological end: ACW + 1 = 2 is smaller than the four slots on offer, so slots 3 and 4
    //  are unreachable by construction. All 60 of them are empty, and the 1756 µs they cost — 41.9 % of the
    //  round — is paid for nothing."
    const rs = recs(ACWE1)
    expect(new Set(txs(rs, 'ampResp').map((r) => r.frame.amp!.slot))).toEqual(new Set([1, 2]))
    const dead = ofType(rs, 'AMP_SLOT').filter((s) => s.slot >= 3)
    expect(dead.length).toBe(2 * ROUNDS)
    expect(2 * (10 + 528 + 10 + 330)).toBe(1756)
    expect(((1756 / 4190) * 100).toFixed(1)).toBe('41.9')
  })

  it('the three ACWE values deliver 0.23, 1.53 and 1.73 readings a round', () => {
    // "watch the readings that get through: 0.23 a round at ACWE 1, 1.53 at ACWE 2, 1.73 at ACWE 3"
    expect(acked(recs(ACWE1))).toBe(7)
    expect(acked(recs())).toBe(46)
    expect(acked(recs(ACWE3))).toBe(52)
    expect([7, 46, 52].map((n) => (n / ROUNDS).toFixed(2))).toEqual(['0.23', '1.53', '1.73'])
    // "ACWE 3 is the other end and much kinder: half the draws sit out, only 17 collisions in thirty rounds,
    //  and 52 readings — 1.73 a round."
    expect(ofType(recs(ACWE3), 'COLLISION').length).toBe(17)
    // the COLLISION records behind the collision column of the model table
    expect(ofType(recs(ACWE1), 'COLLISION').length).toBe(53)
    expect(ofType(recs(), 'COLLISION').length).toBe(54)
  })

  it('ACWE 1 starves two of the six tags, while ACWE 2 and 3 acknowledge every tag', () => {
    // "Of the reachable slots 88.3 % end in a collision, only 7 readings arrive in the 600 ms (0.23 a round),
    //  and two of the six tags are never acknowledged once." / "ACWE 2 lands between them at 46 readings,
    //  1.53 a round, its thinnest tag getting 4 through against 6 at ACWE 3."
    const perTag = (rs: TLRecord[]) => TAGS.map((t) => results(rs).filter((r) => r.node === t && r.acked).length)
    expect(perTag(recs(ACWE1))).toEqual([0, 1, 2, 0, 2, 2])
    expect(perTag(recs(ACWE1)).filter((n) => n === 0).length).toBe(2)
    expect(Math.min(...perTag(recs()))).toBe(4)
    expect(Math.min(...perTag(recs(ACWE3)))).toBe(6)
  })

  it('a seventh tag costs the other six: 1.03 readings a round instead of 1.53', () => {
    // "Delivery falls from 1.53 readings a round to 1.03 while the collided share of the slots climbs from
    //  45.0 % to 59.2 % — the model predicts 55.5 %."
    const rs = [...new Simulation(ampSlotsScenario({ acwe: 2, readMode: 'inline', tags: 7 })).runUntil(RUN_NS).records]
    expect(ofType(rs, 'AMP_ABOC').length).toBe(7 * ROUNDS)
    expect(acked(rs)).toBe(31)
    expect((31 / ROUNDS).toFixed(2)).toBe('1.03')
    const c = slotCensus(rs, 4)
    expect(((c.collision / c.slots) * 100).toFixed(1)).toBe('59.2')
    expect((model(7, 3, 4).collision * 100).toFixed(1)).toBe('55.5')
    // "No node records an RX_FAIL with reason capture in the whole run." — true of the try-this scenario too
    expect(captures(rs)).toBe(0)
  })
})

describe('amp-slots · the two-phase variant', () => {
  const rs = recs(TWO_PHASE)

  it('each poll is two rounds: a 272 µs random phase and a 528 µs scheduled one', () => {
    // "Its random phase asks only for identity: the response is 7 octets instead of 15, the slot 272 µs
    //  instead of 528 µs."
    const rounds = ofType(rs, 'AMP_ROUND')
    expect(rounds.filter((r) => r.phase === 'random').length).toBe(ROUNDS)
    expect(rounds.filter((r) => r.phase === 'scheduled').length).toBe(26)
    expect(new Set(rounds.filter((r) => r.phase === 'random').map((r) => r.slotNs))).toEqual(new Set([272 * US]))
    expect(new Set(rounds.filter((r) => r.phase === 'scheduled').map((r) => r.slotNs))).toEqual(new Set([528 * US]))
    // "in 4 of the thirty rounds nobody is heard and no scheduled phase follows" — measured as the random
    // phases whose four Acks all name the router, each of which is followed by no scheduled round
    const acks = txs(rs, 'ampAck')
    const silent = rounds.filter((r) => r.phase === 'random'
      && acks.filter((a) => a.t >= r.t && a.t < r.untilNs && a.frame.dst !== a.frame.src).length === 0)
    expect(silent.length).toBe(4)
    for (const r of silent) {
      expect(rounds.some((x) => x.phase === 'scheduled' && x.t > r.t && x.t < r.untilNs + 2 * MS)).toBe(false)
    }
  })

  it('the scheduled trigger lists exactly the tags the random phase heard, in slot order', () => {
    // "In the first round the random phase hears Tag 2, Tag 1 and Tag 4, and the scheduled trigger lists them
    //  in that order: 19 octets and 810 µs, six octets longer than the broadcast one, because each listed tag
    //  costs a 2-octet ID (that width and the 6-octet trigger body are model choices, not draft values)."
    const sched = txs(rs, 'ampTrigger').filter((r) => r.frame.amp!.phase === 'scheduled')
    expect(sched.length).toBe(26)
    expect(sched[0].t).toBe(3176 * US)
    expect(sched[0].frame.amp!.staIds).toEqual(['tag-2', 'tag-1', 'tag-4'])
    expect(sched[0].frame.bytes).toBe(19)
    expect(sched[0].frame.txTimeNs).toBe(810 * US)
    // "answers with the reading in a slot fixed by list position"
    const resp = txs(rs, 'ampResp').filter((r) => r.t > sched[0].t && r.t < 20 * MS)
    expect(resp.map((r) => [r.node, r.frame.amp!.slot])).toEqual([['tag-2#2g', 1], ['tag-1#2g', 2], ['tag-4#2g', 3]])
    // "Whoever is heard is named in a second, scheduled trigger"
    for (const s of sched) {
      const heard = txs(rs, 'ampAck').filter((a) => a.t < s.t && a.t > s.t - 4 * MS && a.frame.dst !== a.frame.src)
      expect(s.frame.amp!.staIds).toEqual(heard.map((a) => a.frame.dst))
    }
  })

  it('the first two-phase round costs 6620 µs against the inline round’s 4190 µs, for the same three readings', () => {
    // the formula "random phase  = 50 + 10 + 618 + 4 × (10 + 272 + 10 + 330) = 3166 µs / scheduled phase =
    //  10 + 810 + 3 × (10 + 528 + 10 + 330) = 3454 µs → 6620 µs" and its note "Inline delivered the same
    //  three readings in 4190 µs, so two-phase costs 2430 µs more."
    expect(50 + 10 + 618 + 4 * (10 + 272 + 10 + 330)).toBe(3166)
    expect(10 + 528 + 10 + 330).toBe(878)
    expect(10 + 810 + 3 * 878).toBe(3454)
    expect(3166 + 3454).toBe(6620)
    const cts = txs(rs, 'cts')[0]
    const last = ofType(rs, 'TX_END').filter((r) => r.t < 20 * MS).pop()!
    expect(last.t - cts.t).toBe(6620 * US)
    expect(6620 - 4190).toBe(2430)
    // the first round of each mode delivers the same three readings
    expect(readingsDelivered(rs.filter((r) => r.t < 20 * MS))).toBe(3)
    expect(readingsDelivered(recs().filter((r) => r.t < 20 * MS))).toBe(3)
    // "Its CTS-to-self reserves 7512 µs, sized for four tags heard"
    expect(cts.frame.durationFieldNs).toBe(7512 * US)
  })

  it('two-phase delivers the same 46 readings as inline and spends 8.0 % more air doing it', () => {
    // "Both modes deliver the same 46 readings: inline spends 154 730 µs of PPDU, two-phase 167 130 µs,
    //  8.0 % more."
    // Readings are counted as they are delivered: an ampResp carrying a reading, decoded at the AP.
    expect(readingsDelivered(recs())).toBe(46)
    expect(readingsDelivered(rs)).toBe(46)
    const air = (x: TLRecord[]) => ofType(x, 'TX_START').reduce((s, r) => s + r.frame.txTimeNs, 0) / US
    expect(air(recs())).toBe(154_730)
    expect(air(rs)).toBe(167_130)
    expect((((167_130 / 154_730) - 1) * 100).toFixed(1)).toBe('8.0')
  })
})

describe('amp-slots · what the UI shows', () => {
  const CTX = { apId: 'ap', isEdca: false }

  it('the trigger body prints the ACWE, the ACW it implies and the slot plan', () => {
    // "The trigger’s 6-octet body: “Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”; in two-phase
    //  “… 4 slots × 272 µs · id only”."
    const body = (rs: TLRecord[]) => {
      const trig = txs(rs, 'ampTrigger')[0]
      const f = decodeFrame(trig.frame, CTX).users[0].subframes[0].mpdu.fields.find((x) => x.key === 'body')!
      expect(f.bytes).toBe(AMP_TRIGGER_BODY_BYTES)
      return f.value
    }
    expect(body(recs())).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading')
    expect(body(recs(ACWE1))).toBe('Session 1 · ACWE 1 (ACW 1) · 4 slots × 528 µs · reading')
    expect(body(recs(ACWE3))).toBe('Session 1 · ACWE 3 (ACW 7) · 4 slots × 528 µs · reading')
    expect(body(recs(TWO_PHASE))).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 272 µs · id only')
  })

  it('the log prints a draw, a sit-out and a lost round the way the lesson quotes them', () => {
    // "The log: “ABOC 1 of [0, 3] → slot 2”, “ABOC 5 of [0, 7] → sits out”, “slot 3: not acknowledged”."
    expect(fmtRecord(ofType(recs(), 'AMP_ABOC')[0])).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    const sit = ofType(recs(ACWE3), 'AMP_ABOC').filter((d) => d.slot === null)[0]
    // "Load the ACWE 3 variant and jump to the first sit-out at 678 µs: Tag 3 draws 5 of [0, 7] and stays
    //  silent all round."
    expect(sit.t).toBe(678 * US)
    expect(fmtRecord(sit)).toBe('tag-3#2g ABOC 5 of [0, 7] → sits out')
    const lost = results(recs()).filter((r) => !r.acked)[0]
    expect(fmtRecord(lost)).toBe('tag-3#2g slot 3: not acknowledged')
    expect(fmtRecord(ofType(recs(TWO_PHASE), 'AMP_ROUND')[0]))
      .toBe('ap#2g AMP round (random): 4 slots × 272.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
  })

  it('the ACWE 3 variant really is 42.5 % empty slots and 14.2 % collided ones', () => {
    // "42.5 % of the slots are empty — that is what buys the collision rate down to 14.2 %."
    const c = slotCensus(recs(ACWE3), 4)
    expect(((c.empty / c.slots) * 100).toFixed(1)).toBe('42.5')
    expect(((c.collision / c.slots) * 100).toFixed(1)).toBe('14.2')
  })
})

/**
 * **Both tables, read back out of the lesson.**
 *
 * This file is the most thorough in the AMP set: all eighteen cells of the model table have an
 * assertion, the per-slot walk has one, and the deviation claim is checked down to 4.87 points.
 * Every one of them compares the engine with a literal written HERE, with the lesson's row quoted
 * in a comment above it — and one even does arithmetic on the lesson's printed cells by hand
 * (`expect((43.3 - 38.5).toFixed(1)).toBe('4.8')`). A comment is not a comparison, and that
 * subtraction is two more figures typed on this side.
 *
 * `@amp-slots` prints 84 hand-typed figures into its graded prose and was on the list of lessons
 * whose test never touched it (`tests/course/prose-readback.test.ts`). The cells were all exact;
 * what follows is the other half of each assertion above, with no figure on this side.
 */
describe('amp-slots · both printed tables are read back out of the lesson', () => {
  const tableWith = (fragment: string): string[][] => {
    const b = ampSlots.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  const prose = (): string => JSON.stringify(ampSlots.numbers)
  /** The figure a cell OPENS with: 「688 µs」 → 688, 「1556 µs 被确认」 → 1556, 「1.6 %」 → 1.6. */
  const num = (s: string): number => Number(/^[\d.]+/.exec(s.trim())?.[0] ?? NaN)

  it('the slot-by-slot walk of the first round: start, who drew it, and when it closed', () => {
    const rows = tableWith('第一轮，逐时隙展开')
    const rs = recs()
    const slots = ofType(rs, 'AMP_SLOT').slice(0, rows.length)
    expect(slots, 'the lesson walks one row per slot of the first round').toHaveLength(rows.length)
    for (const [i, row] of rows.entries()) {
      expect(Number(row[0]), `row ${i}: the slot index, one-based as the lesson numbers them`)
        .toBe(i + 1)
      expect(num(row[1]), `row ${i}: when the slot opens`).toBe(slots[i].t / US)
      // who drew it: every tag the row names must have responded inside that slot, and no other
      // 「Tag 2」 but also 「Tag 3、5、6」 — one 「Tag 」 and then a 、-separated list
      const named = [...row[2].matchAll(/Tag ([\d、]+)/g)]
        .flatMap((m) => m[1].split('、'))
        .map((d) => `tag-${d}#2g`).sort()
      const inSlot = ofType(rs, 'TX_START')
        .filter((r) => TAGS.includes(r.node) && r.t >= slots[i].t && r.t < slots[i].untilNs)
        .map((r) => r.node).sort()
      expect(named, `row ${i}: the tags the lesson says drew this slot`).toEqual(inSlot)
      // and the ABOC the row prints is the draw that armed the slot
      const aboc = [...row[2].matchAll(/ABOC (\d)/g)].map((m) => Number(m[1]))
      expect(new Set(aboc).size, `row ${i}: one ABOC value per row`).toBe(1)
      expect(aboc[0], `row ${i}: ABOC ${aboc[0]} arms slot ${i + 1}`).toBe(i)
      // The result column takes one of two shapes, and which one is itself the claim: a time plus
      // 「被确认」 for a slot one tag had to itself, or 「碰撞」 with no time at all for the one three
      // tags drew. So the absence of a figure is read as a claim rather than skipped.
      const acks = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'ampAck')
      if (row[3].includes('碰撞')) {
        expect(/^[\d.]/.test(row[3]), `row ${i} says 「碰撞」, so it states no closing time`).toBe(false)
        expect(inSlot.length, `row ${i}: more than one tag answered in it`).toBeGreaterThan(1)
        // and the Ack that closes it names the router itself, which is the rest of the cell
        const closing = acks.find((r) => r.t >= slots[i].t && r.t < slots[i].untilNs + 1_000_000)
        expect(closing, `row ${i}: no ampAck closes the collided slot`).toBeDefined()
        expect(closing!.frame.dst, `row ${i}: 「Ack 点名的是路由器自己」`).toBe(closing!.frame.src)
      } else {
        const t = num(row[3])
        expect(Number.isNaN(t), `row ${i}: an acknowledged slot states the time it closed`).toBe(false)
        const closing = acks.find((r) => Math.abs(r.t / US - t) < 1)
        expect(closing, `row ${i}: no ampAck ends at ${t} µs`).toBeDefined()
        expect(inSlot, `row ${i} says it was acknowledged, so exactly one tag answered`).toHaveLength(1)
        // frame addresses are bare ids; node ids carry the link suffix
        expect(closing!.frame.dst, `row ${i}: and the Ack names that tag`)
          .toBe(inSlot[0].replace(/#.*$/, ''))
      }
    }
  })

  it('the model table: both halves of all nine cells, and the reachable-slot column', () => {
    const rows = tableWith('模型 / 三十轮实测')
    expect(rows, 'three ACWE values').toHaveLength(3)
    const header = /M = (\d+)，N = (\d+)/.exec(
      (ampSlots.numbers!.find((x) => x.kind === 'table'
        && (x.heading ?? '').includes('模型 / 三十轮实测')) as { heading: string }).heading,
    )
    expect(header, 'the heading no longer states M and N').not.toBeNull()
    const M = Number(header![1])
    const N = Number(header![2])
    expect([M, N], 'six tags and four slots, as the scene is built').toEqual([TAGS.length, 4])
    const byAcwe: Record<number, number | undefined> = { 1: ACWE1, 2: undefined, 3: ACWE3 }
    for (const row of rows) {
      const label = /^(\d+) \(ACW (\d+)\)$/.exec(row[0])
      expect(label, `the ACWE cell 「${row[0]}」 is not in the shape 「n (ACW m)」`).not.toBeNull()
      const acwe = Number(label![1])
      const acw = Number(label![2])
      // ACW = 2^ACWE − 1, which the lesson prints in the same cell
      expect(acw, `ACWE ${acwe}: the ACW it prints beside it`).toBe(2 ** acwe - 1)
      const m = model(M, acw, N)
      const reach = /^(\d+) of (\d+)$/.exec(row[1])
      expect(reach, `ACWE ${acwe}: the reachable cell is not 「a of b」`).not.toBeNull()
      expect([Number(reach![1]), Number(reach![2])], `ACWE ${acwe}: reachable of offered`)
        .toEqual([m.reachable, N])
      const c = slotCensus(recs(byAcwe[acwe]), m.reachable)
      const keys = ['empty', 'success', 'collision'] as const
      keys.forEach((k, j) => {
        const pair = /^([\d.]+) % \/ ([\d.]+) %$/.exec(row[2 + j])
        expect(pair, `ACWE ${acwe} ${k}: the cell is not 「model % / measured %」`).not.toBeNull()
        expect(Number(pair![1]), `ACWE ${acwe} ${k}: the model half`)
          .toBe(Number((m[k] * 100).toFixed(1)))
        expect(Number(pair![2]), `ACWE ${acwe} ${k}: the measured half`)
          .toBe(Number(((c[k] / c.slots) * 100).toFixed(1)))
      })
      // each row's three measured fractions are a partition of its reachable slots
      expect(c.empty + c.success + c.collision, `ACWE ${acwe}: the census covers every slot`)
        .toBe(c.slots)
    }
  })

  it('the deviation sentence, including the gap it takes between its own two cells', () => {
    const m = /实测比例与公式的偏差却都不超过 ([\d.]+)，也就是([一二三四五六七八九十]+)个百分点；全表最大的一处偏差是 ACWE (\d) 的“(..)”一列，([\d.]+) 个百分点（四舍五入后的表格单元格相差 ([\d.]+)）/
      .exec(prose())
    expect(m, 'the deviation sentence is gone, or its shape changed').not.toBeNull()
    expect(Number(m![1]), 'the tolerance the lesson claims, against TOL here').toBe(TOL)
    expect(zhNumeral(m![2]), 'the same tolerance stated in percentage points')
      .toBe(Number((TOL * 100).toFixed(0)))
    const byAcwe: Record<number, number | undefined> = { 1: ACWE1, 2: undefined, 3: ACWE3 }
    let worst = 0
    let worstAt = ''
    for (const acwe of [1, 2, 3]) {
      const mm = model(TAGS.length, 2 ** acwe - 1, 4)
      const c = slotCensus(recs(byAcwe[acwe]), mm.reachable)
      for (const k of ['empty', 'success', 'collision'] as const) {
        const d = Math.abs(c[k] / c.slots - mm[k])
        if (d > worst) { worst = d; worstAt = `${acwe}|${k}` }
      }
    }
    const COLUMN: Record<string, string> = { 空: 'empty', 成功: 'success', 碰撞: 'collision' }
    expect(`${m![3]}|${COLUMN[m![4]] ?? m![4]}`, 'the row and column the lesson says the worst gap is in')
      .toBe(worstAt)
    expect(Number(m![5]), 'the worst gap in percentage points').toBe(Number((worst * 100).toFixed(2)))
    // 「四舍五入后的表格单元格相差 4.8」: taken from the table's OWN two cells, not retyped
    const row = tableWith('模型 / 三十轮实测').find((r) => r[0].startsWith(`${m![3]} `))!
    const col = ['空', '成功', '碰撞'].indexOf(m![4]) + 2
    const pair = /^([\d.]+) % \/ ([\d.]+) %$/.exec(row[col])!
    expect(Number(m![6]), 'the gap between the two halves of that very cell')
      .toBe(Number(Math.abs(Number(pair![2]) - Number(pair![1])).toFixed(1)))
  })

  it('the sit-out sentence: the draws, the sit-outs and the rate', () => {
    const m = /实测 (\d+) 次中空转 (\d+) 次，([\d.]+) %/.exec(prose())
    expect(m, 'the sit-out sentence is gone, or its shape changed').not.toBeNull()
    const rs = recs(ACWE3)
    const draws = ofType(rs, 'AMP_ABOC')
    expect(Number(m![1]), 'draws over the thirty rounds').toBe(draws.length)
    expect(Number(m![1]), 'which is one per tag per round').toBe(TAGS.length * ROUNDS)
    const sat = draws.filter((d) => d.slot === null).length
    expect(Number(m![2]), 'draws that sat out').toBe(sat)
    expect(Number(m![3]), 'and the rate').toBe(Number(((100 * sat) / draws.length).toFixed(1)))
  })

  it('the Ack census: a hundred and twenty Acks, and who each of them named', () => {
    const m = /(.+?)轮下来，(\d+) 帧 Ack 里 (\d+) 帧点名了某个标签，(\d+) 帧写的是路由器自己/.exec(prose())
    expect(m, 'the Ack census sentence is gone, or its shape changed').not.toBeNull()
    const rs = recs()
    const acks = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ampAck')
    expect(Number(m![2]), 'Acks in the run').toBe(acks.length)
    expect(Number(m![2]), 'which is one per slot of every round').toBe(4 * ROUNDS)
    // 「点名了某个标签」 vs 「写的是路由器自己」: the self-addressed Ack is the collided-slot one
    const toTag = acks.filter((r) => r.frame.dst !== r.frame.src).length
    expect(Number(m![3]), 'Acks that named a tag').toBe(toTag)
    expect(Number(m![4]), 'and Acks that named the router itself').toBe(acks.length - toTag)
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The two printed tables are read out of the lesson; the rest of its prose was not.** Every
 * assertion in the describes above compares the engine with a literal written on THIS side, with
 * the lesson's own sentence quoted above it in a comment — and `scripts/figure-planting.ts` says
 * what that is worth: of the 223 figures this lesson prints, the sweep of 2026-10-13 could edit
 * **171** with the whole suite green, the worst first pass of any lesson in the course after
 * `@queues`. Two of them (the PPDU microseconds of the two read modes) had no equal literal
 * anywhere under `tests/` in any form the scanner could see. A comment is not a comparison.
 *
 * So the reads below put the lesson on the other side of each assertion. **Nothing new is
 * measured**: every one of them calls the same `recs`, `model`, `slotCensus`, `perSlot`,
 * `ampUlPpduNs`… the tests above call, and the figure comes out of the prose instead of out of
 * this file. Where a figure is printed in several places — the ACW formula is in `terms`, in
 * `picture` twice, in the formula block, in the steps and in a variant label — every occurrence
 * is read, because the one defect this instrument keeps finding is a figure printed four times
 * and read once.
 */
describe('amp-slots · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(ampSlots).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** Compare a printed figure with a measurement, to the decimals the lesson printed. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  /** Every string a block of the lesson carries, whatever kind of block it is. */
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const pic = (ampSlots.picture ?? []).map(blockText).join('\n')
  const nums = (ampSlots.numbers ?? []).map(blockText).join('\n')
  const limitsText = (ampSlots.limits ?? []).map((l) => l.text).join('\n')
  const quizText = ampSlots.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
  const formula = (needle: string): { text: string; note?: string } => {
    const b = ampSlots.numbers!.find((x) => x.kind === 'formula' && x.text.includes(needle))
    expect(b, `no formula block containing 「${needle}」`).toBeDefined()
    return b as { text: string; note?: string }
  }

  const cfgOf = (variant: number | undefined) =>
    (variant === undefined ? ampSlots.scenario() : ampSlots.variants![variant]!.scenario())
      .nodes[0]!.ampAp!
  const abocs = (variant: number | undefined) => ofType(recs(variant), 'AMP_ABOC')
  const acwOf = (variant: number | undefined): number => {
    const set = [...new Set(abocs(variant).map((r) => r.acw))]
    expect(set, 'one window for the whole run').toHaveLength(1)
    return set[0]!
  }
  /** The slots the AP opened in a run, each with the responses that started inside it. */
  const perSlot = (variant: number | undefined): { slot: number; t: number; until: number; n: number }[] => {
    const resp = txs(recs(variant), 'ampResp')
    return ofType(recs(variant), 'AMP_SLOT').map((s) => ({
      slot: s.slot, t: s.t, until: s.untilNs,
      n: resp.filter((r) => r.t >= s.t && r.t < s.untilNs).length,
    }))
  }
  /** Rounds each tag got acknowledged in, which is 「送达最少的那个标签送出 N 个」. */
  const perTag = (variant: number | undefined): number[] => TAGS.map((tag) =>
    results(recs(variant)).filter((r) => r.node === tag && r.acked).length)
  const EXT = ERP_2G.signalExtNs
  const SLOT_NS = AMP_SIFS_NS + ampUlPpduNs(250, ampRespBytes(true))
    + AMP_SIFS_NS + ampDlPpduNs(250, AMP_ACK_BYTES, EXT)
  const ROUND_NS = txTimeNs(CTS_BYTES, 6) + EXT + AMP_SIFS_NS
    + ampDlPpduNs(250, ampTriggerBytes(0), EXT) + cfgOf(undefined).slots * SLOT_NS

  it('`picture`: the ring, the two levels every tag sits at, and the two margins', () => {
    const s = ampSlots.scenario()
    const ap = s.nodes[0]!
    const tags = s.nodes.slice(1)
    const links = buildLinkTable(s.nodes, s.walls)
    // 「六个标签均匀分布在距路由器 2 m 的圆环上」 — a radius on the floor plan, not a 3-D distance
    const [radius] = figs(pic, /距路由器 (\d+) m 的圆环上/, '`picture` on the ring')
    for (const n of tags) {
      expect(Number(Math.hypot(n.pos.x - ap.pos.x, n.pos.y - ap.pos.y).toFixed(3)),
        `${n.id} sits on that ring`).toBe(radius)
    }
    // 「每个标签收到路由器的下行都是 −30.7 dBm，到达接入点的上行都是 −50.7 dBm」
    const [dlPrinted] = raw(pic, /下行（downlink, DL）都是 (−[\d.]+) dBm/, '`picture` on the downlink level')
    const [ulPrinted] = raw(pic, /上行（uplink, UL）都是 (−[\d.]+) dBm/, 'and on the uplink level')
    const dl = tags.map((n) => rssiOn('2g', links, 'ap', n.id))
    const ul = tags.map((n) => rssiOn('2g', links, n.id, 'ap'))
    for (const v of dl) same(dlPrinted!, v, 'the level every tag hears the router at')
    for (const v of ul) same(ulPrinted!, v, 'the level every tag reaches the router at')
    // 「下行余量 41.3 dB，上行余量 43.3 dB」 — each level against the sensitivity it is read with
    const [dlMargin, ulMargin] = raw(pic, /下行余量 ([\d.]+) dB，上行余量 ([\d.]+) dB/,
      '`picture` on the two margins')
    same(dlMargin!, dl[0]! - AMP_TAG_DL_SENS_DBM, 'the downlink margin')
    same(ulMargin!, ul[0]! - ampUlSensDbm(cfgOf(undefined).ulKbps), 'and the uplink margin')
    // 「六者之间的差异不到百分之一分贝」 — written in Chinese, so not a figure; it is why the ring exists
    expect(Math.max(...ul) - Math.min(...ul), 'the six are equal to within a hundredth of a dB')
      .toBeLessThan(0.01)
    expect(Math.max(...dl) - Math.min(...dl)).toBeLessThan(0.01)
  })

  /*
   * **The capture margin and the window it has to happen inside, wherever the lesson names them.**
   * `CAPTURE_MARGIN_DB` is file-local to `channel.ts`, and `limits` cites it by file and by name
   * — so the figure is read out of the file the citation points at, exactly as `@collisions-cw`
   * and `@bianchi` read the same constant. The window is an export, so it is read as one.
   */
  it('the 5 dB capture margin and the 48 µs it has to happen inside, everywhere both appear', () => {
    const cited = /（([a-z]+\.ts) 的 (CAPTURE_MARGIN_DB) 与 (\w+)）/.exec(limitsText)
    expect(cited, '`limits` no longer cites the margin and its window by name').not.toBeNull()
    const chan = readFileSync(`src/engine/${cited![1]!}`, 'utf8')
    const decl = new RegExp(`${cited![2]!} = (\\d+)`).exec(chan)
    expect(decl, `${cited![1]} declares ${cited![2]}`).not.toBeNull()
    expect(chan, `and ${cited![3]} as well`).toContain(cited![3]!)
    const margin = Number(decl![1])
    // 「要求某一路信号比其他路高出 5 dB」 — `picture`, `sources`, `limits` and the quiz explanation
    for (const v of everyFig(
      /高出 (\d+) dB|的 (\d+) dB 余量|固定的 (\d+) dB|需要的 (\d+) dB 差距|强出 (\d+) dB/g,
      'the capture margin', 5)) {
      expect(val(v), 'the margin the engine really uses').toBe(margin)
    }
    // 「落在上行回应仅有的那 48 µs AMP-Sync 之内」 — `picture` and the quiz explanation
    for (const v of everyFig(/那 (\d+) µs AMP-Sync/g, 'the uplink preamble’s whole length', 2)) {
      expect(val(v) * US, 'AMP-Sync, as the engine builds it')
        .toBe(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[cfgOf(undefined).ulKbps])
    }
    // and the claim those two numbers serve: no run of this lesson ever captures anything
    for (const variant of ALL_RUNS) expect(captures(recs(variant)), 'no capture anywhere').toBe(0)
  })

  it('the two formulas of the draw, fed back through every draw of every run', () => {
    // 「ACW = 2^ACWE − 1」 — the formula block, `picture` twice and the steps all print it
    const bases = [...EVERYWHERE.matchAll(/ACW = (\d)\^ACWE − (\d)/g)]
      .map((m) => [val(m[1]!), val(m[2]!)])
    expect(bases.length, 'the lesson gives the window formula more than once').toBeGreaterThan(1)
    for (const b of bases) expect(b, 'the same formula every time').toEqual(bases[0])
    const [base, off] = bases[0]!
    // 「slot = ABOC + 1（当 ABOC < N），否则空转」 and 「在第 ABOC + 1 个时隙发送」
    const slotOffs = [...EVERYWHERE.matchAll(/slot = ABOC \+ (\d)|在第 ABOC \+ (\d) 个时隙发送/g)]
      .flatMap((m) => m.slice(1).filter((x) => x !== undefined)).map(val)
    expect(slotOffs.length, 'and the slot rule more than once').toBeGreaterThan(1)
    for (const o of slotOffs) expect(o, 'the same rule every time').toBe(slotOffs[0])
    const slotOff = slotOffs[0]!
    /*
     * And now every draw the engine made, in every run the lesson ships. **A scheduled round is
     * not a draw**: the two-phase variant also emits an `AMP_ABOC` for each tag its scheduled
     * trigger names, with the slot the list gave it and no window at all — which is the whole
     * point of 「不抽签，也就不可能碰撞」. Those are counted here and checked to be exactly that.
     */
    for (const variant of ALL_RUNS) {
      const { acwe, slots } = cfgOf(variant)
      const drawn = abocs(variant).filter((r) => r.acw > 0)
      for (const r of abocs(variant).filter((r) => r.acw === 0)) {
        expect(variant, 'only two-phase hands out a slot without a draw').toBe(TWO_PHASE)
        expect(r.slot, 'and it is a slot the scheduled trigger named').not.toBeNull()
      }
      if (variant !== TWO_PHASE) {
        expect(drawn.length, `ACWE ${acwe}: every round of this run is a draw`)
          .toBe(abocs(variant).length)
      }
      for (const r of drawn) {
        expect(r.acw, `ACWE ${acwe}: the window the lesson’s formula gives`).toBe(base! ** acwe - off!)
        expect(r.aboc, 'every draw is inside it').toBeGreaterThanOrEqual(0)
        expect(r.aboc, 'every draw is inside it').toBeLessThanOrEqual(r.acw)
        expect(r.slot, `ABOC ${r.aboc} of [0, ${r.acw}]`)
          .toBe(r.aboc < slots ? r.aboc + slotOff : null)
      }
    }
    // 「ACWE 1 → ACW 1，ACWE 2 → ACW 3，ACWE 3 → ACW 7」 plus the two variant labels that repeat it
    const pairs = [...EVERYWHERE.matchAll(/ACWE (\d) → ACW (\d)|ACWE (\d)（ACW (\d)）/g)]
      .map((m) => m.slice(1).filter((x) => x !== undefined).map(val))
    expect(pairs.length, 'the lesson gives the mapping five times over').toBeGreaterThanOrEqual(5)
    for (const [e, w] of pairs) expect(w, `ACWE ${e} gives that window`).toBe(base! ** e! - off!)
    const named = new Set(pairs.map(([e]) => e!))
    for (const variant of [undefined, ACWE1, ACWE3]) {
      expect(named, `the run at ACWE ${cfgOf(variant).acwe} is one the prose names`)
        .toContain(cfgOf(variant).acwe)
      expect(acwOf(variant), 'and the engine’s own window agrees with the formula')
        .toBe(base! ** cfgOf(variant).acwe - off!)
    }
    // 「基础场景用 ACWE 2、N = 4 个时隙」
    const [baseAcwe, baseSlots] = figs(pic, /基础场景用 ACWE (\d)、N = (\d) 个时隙/,
      '`picture` on what the shipped scene uses')
    expect(baseAcwe, 'the ACWE the base scene ships').toBe(cfgOf(undefined).acwe)
    expect(baseSlots, 'and its slot count').toBe(cfgOf(undefined).slots)
    // 「六个标签每轮都能解出触发帧，所以每轮开头都有六次抽取——三十轮共 180 次」
    const [draws] = figs(pic, /三十轮共 (\d+) 次/, '`picture` on how many draws the run makes')
    expect(abocs(undefined), 'every tag draws once a round, all run long').toHaveLength(draws!)
    expect(draws! / ROUNDS, 'which is one draw per tag per round')
      .toBe(ampSlots.scenario().nodes.length - 1)
    // 「标签在 0 到 ACW 之间抽一个数」 — `terms` and `picture`; the 0 is the floor of every draw
    for (const v of everyFig(/在 (\d) 到 ACW 之间/g, 'the floor of the window', 2)) {
      expect(Math.min(...abocs(ACWE3).map((r) => r.aboc)), 'the smallest draw the run made')
        .toBe(val(v))
    }
  })

  it('the round’s own arithmetic, term by term, and what it costs at each poll interval', () => {
    // 「轮询间隔从 100 ms 收紧到 20 ms，于是三十轮正好装进 600 ms」
    const [was, now, window] = figs(nums,
      /轮询间隔从 (\d+) ms 收紧到 (\d+) ms，于是三十轮正好装进 (\d+) ms/,
      '`numbers` on the two poll intervals and the window')
    expect(was, 'the interval every other AMP scene uses, which is the engine’s own default')
      .toBe(DEFAULT_AMP_AP.pollIntervalMs)
    expect(now, 'and the one this lesson tightens it to').toBe(cfgOf(undefined).pollIntervalMs)
    expect(window! * MS, 'the window every figure below is measured in').toBe(RUN_NS)
    expect(window! / now!, 'which is exactly the rounds the lesson counts').toBe(ROUNDS)
    // 「50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs」 — every term against the engine
    const [cts, sifs1, trig, slots, sifs2, resp, sifs3, ack, round] = figs(nums,
      /：(\d+) \+ (\d+) \+ (\d+) \+ (\d) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs/,
      '`numbers` on how a round is spent')
    expect(cts! * US, 'the CTS-to-self that opens the round').toBe(txTimeNs(CTS_BYTES, 6) + EXT)
    for (const s of [sifs1, sifs2, sifs3]) expect(s! * US, 'an AMP SIFS').toBe(AMP_SIFS_NS)
    expect(trig! * US, 'the broadcast trigger').toBe(ampDlPpduNs(250, ampTriggerBytes(0), EXT))
    expect(slots, 'the slots the AP opens').toBe(cfgOf(undefined).slots)
    expect(resp! * US, 'a response carrying a reading').toBe(ampUlPpduNs(250, ampRespBytes(true)))
    expect(ack! * US, 'and the Ack that closes a slot').toBe(ampDlPpduNs(250, AMP_ACK_BYTES, EXT))
    expect(cts! + sifs1! + trig! + slots! * (sifs2! + resp! + sifs3! + ack!),
      'the sum the lesson prints is its own arithmetic').toBe(round)
    expect(round! * US, 'and it is the round this engine lays out').toBe(ROUND_NS)
    // the same round, measured: the CTS-to-self that opens it to the Ack that closes its last slot
    const firstCts = txs(recs(), 'cts')[0]!
    const lastAck = ends(recs(), 'ampAck').slice(0, slots!).pop()!
    expect((lastAck.t - firstCts.t) / US, 'from the first CTS-to-self to the last Ack').toBe(round)
    // 「占每 20 ms 的 20.95 %，而不是每 100 ms 的 4.19 %」
/*
     * 「占每 20 ms 的 20.95 %，而不是每 100 ms 的 4.19 %」. **The two intervals are printed a second
     * time here, and a second printing is its own site** — so they are captured rather than
     * walked over. A `\d+` that a pattern matches but never captures is a figure nobody compares,
     * which is how 「整整 600 ms」 below survived this file's first pass.
     */
    const [tightMs, tight, looseMs, loose] = raw(nums,
      /占每 (\d+) ms 的 ([\d.]+) %，而不是每 (\d+) ms 的 ([\d.]+) %/,
      '`numbers` on what the round costs at each interval')
    expect(val(tightMs!), 'the tightened interval, restated').toBe(now)
    expect(val(looseMs!), 'and the default one, restated').toBe(was)
    same(tight!, (100 * round! * US) / (now! * MS), 'the share of a tightened poll interval')
    same(loose!, (100 * round! * US) / (was! * MS), 'and of the default one')
  })

  it('the collided slot: the draw, the three instants, and the Ack that names the router', () => {
    const rs = recs()
    const collided = perSlot(undefined).find((s) => s.n > 1)!
    // 「三个标签都抽到了 2，于是在 2444 µs 同时开始发送」
    const [draw, startUs] = figs(nums, /个标签都抽到了 (\d)，于是在 (\d+) µs 同时开始发送/,
      '`numbers` on the collided slot')
    expect(collided.t / US, 'when that slot opens').toBe(startUs)
    const inIt = txs(rs, 'ampResp').filter((r) => r.t === collided.t)
    expect(inIt.length, 'every response of that slot starts at the same instant').toBe(collided.n)
    for (const r of inIt) {
      const d = abocs(undefined).find((a) => a.node === r.node && a.slot === collided.slot)!
      expect(d.aboc, `${r.node} had drawn that number`).toBe(draw)
    }
    // 「以及 2972 µs（时隙关闭那一瞬）的一条 COLLISION」 — and one RX_MISS per response, no RX_FAIL
    const [closeUs] = figs(nums, /以及 (\d+) µs（时隙关闭那一瞬）的一条 COLLISION/,
      '`numbers` on when the collision is recorded')
    expect(collided.until / US, 'which is the instant that slot closes').toBe(closeUs)
    const colls = ofType(rs, 'COLLISION').filter((r) => r.t === collided.until)
    expect(colls, 'one COLLISION, there').toHaveLength(1)
    const missed = ofType(rs, 'RX_MISS')
      .filter((r) => r.node === AP && r.t >= collided.t && r.t <= collided.until)
    expect(missed, 'one missed preamble per response').toHaveLength(collided.n)
    for (const m of missed) expect(m.reason, 'and all for the same reason').toBe('preambleSinr')
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP), 'and no RX_FAIL at all')
      .toHaveLength(0)
    // 「2982 µs 那帧 Ack 和平常一样是 330 µs 的 PPDU……三个标签都在 3312 µs 读到它」
    const [ackAt, ackUs, readAt] = figs(nums,
      /(\d+) µs 那帧 Ack 和平常一样是 (\d+) µs 的 PPDU[\s\S]*?都在 (\d+) µs 读到它/,
      '`numbers` on the Ack that closes it')
    const ackTx = txs(rs, 'ampAck').find((r) => r.t / US === ackAt)
    expect(ackTx, 'an Ack starts at that instant').toBeDefined()
    expect(ackTx!.frame.dst, 'and its ID field carries the router itself').toBe(ackTx!.frame.src)
    expect(ackTx!.frame.txTimeNs / US, 'an Ack’s own length').toBe(ackUs)
    expect(ackAt! + ackUs!, 'and the tags read it when it ends').toBe(readAt)
    // 「三十轮下来，120 帧 Ack 里 46 帧点名了某个标签，74 帧写的是路由器自己」
    const [acks, toTag, toSelf] = figs(nums,
      /(\d+) 帧 Ack 里 (\d+) 帧点名了某个标签，(\d+) 帧写的是路由器自己/,
      '`numbers` on the Ack census')
    const all = txs(rs, 'ampAck')
    expect(all, 'one Ack per slot per round').toHaveLength(acks!)
    expect(acks, 'which is the slots of the whole run').toBe(cfgOf(undefined).slots * ROUNDS)
    expect(all.filter((r) => r.frame.dst !== r.frame.src), 'the ones naming a tag')
      .toHaveLength(toTag!)
    expect(all.filter((r) => r.frame.dst === r.frame.src), 'and the ones naming the router')
      .toHaveLength(toSelf!)
  })

  it('the slot model’s four formulas, read out of the lesson and fed back', () => {
    const f = formula('P(空)')
    // 「q = 1/(ACW + 1)」 and 「p = min(N, ACW + 1)/(ACW + 1)」
    const [qNum, qOff, pOff, pDen] = figs(f.text,
      /q = (\d)\/\(ACW \+ (\d)\)\s+p = min\(N, ACW \+ (\d)\)\/\(ACW \+ (\d)\)/,
      'the formula block on q and p')
    // 「P(空) = (1 − q)^M     P(成功) = M·q·(1 − q)^(M−1)」
    const [eOne, sOne, sMinus] = figs(f.text,
      /P\(空\) = \((\d) − q\)\^M\s+P\(成功\) = M·q·\((\d) − q\)\^\(M−(\d)\)/,
      'and on the two it gives in closed form')
    const M = ampSlots.scenario().nodes.length - 1
    for (const variant of [ACWE1, undefined, ACWE3]) {
      const acw = acwOf(variant)
      const { slots, acwe } = cfgOf(variant)
      const mine = model(M, acw, slots)
      const q = qNum! / (acw + qOff!)
      expect(q, `ACWE ${acwe}: the q the lesson’s own formula gives`).toBeCloseTo(mine.q, 12)
      expect(Math.min(slots, acw + pOff!) / (acw + pDen!), 'and its p').toBeCloseTo(mine.p, 12)
      expect((eOne! - q) ** M, 'and its P(empty)').toBeCloseTo(mine.empty, 12)
      expect(M * q * (sOne! - q) ** (M - sMinus!), 'and its P(success)').toBeCloseTo(mine.success, 12)
    }
    // 「只有前 min(N, ACW + 1) 个时隙可达」 — which is the second column of the model table
    const rows = (ampSlots.numbers!.find(
      (b): b is Extract<typeof b, { kind: 'table' }> =>
        b.kind === 'table' && (b.heading ?? '').includes('模型 / 三十轮实测'))!).rows
    const order = [ACWE1, undefined, ACWE3]
    rows.forEach((row, i) => {
      const variant = order[i]
      const [reach, of] = figs(row[1]!, /(\d) of (\d)/, `row ${i + 1}: the reachable-slot cell`)
      expect(of, 'the slots the AP opens').toBe(cfgOf(variant).slots)
      expect(reach, 'and the ones a draw can reach')
        .toBe(Math.min(cfgOf(variant).slots, acwOf(variant) + pOff!))
    })
  })

  it('choosing ACW: what each end wastes, in the units the lesson prices it in', () => {
    const { slots } = cfgOf(undefined)
    // 「ACW + 1 = 2 小于本轮提供的四个时隙，于是时隙 3、4 从构造上就不可达」
    const [plusOne, from, to] = figs(nums,
      /ACW \+ 1 = (\d) 小于本轮提供的四个时隙，于是时隙 (\d)、(\d)/,
      '`numbers` on why ACWE 1 cannot fill the round')
    expect(plusOne, 'the slots a draw can reach at ACWE 1').toBe(acwOf(ACWE1) + 1)
    const reach1 = Math.min(slots, acwOf(ACWE1) + 1)
    expect([from, to], 'the slots nothing can reach')
      .toEqual(Array.from({ length: slots - reach1 }, (_x, i) => reach1 + 1 + i))
    for (const s of perSlot(ACWE1).filter((x) => x.slot > reach1)) {
      expect(s.n, `slot ${s.slot} is empty in every round`).toBe(0)
    }
    // 「60 个这样的时隙全是空的，它们占用的 1756 µs——整轮的 41.9 %——每轮都被浪费」
    const [count, us, share] = raw(nums,
      /(\d+) 个这样的时隙全是空的，它们占用的 (\d+) µs——整轮的 ([\d.]+) %/,
      '`numbers` on what those slots cost')
    expect(val(count!), 'two unreachable slots in every round of the run')
      .toBe((slots - reach1) * ROUNDS)
    expect(val(us!) * US, 'and this is the air they hold open').toBe((slots - reach1) * SLOT_NS)
    same(share!, (100 * (slots - reach1) * SLOT_NS) / ROUND_NS, 'as a share of the round')
    // the quiz prices the same pair again
    const [quizUs, quizShare] = raw(quizText, /照样要花 (\d+) µs，占每轮的 ([\d.]+) %/,
      'the quiz on the same two figures')
    expect(val(quizUs!), 'the quiz states the same microseconds').toBe(val(us!))
    expect(val(quizShare!), 'and the same share').toBe(val(share!))
    // 「可达时隙里 88.3 % 以碰撞收场，整整 600 ms 只送达 7 个读数（每轮 0.23 个）」
    const [collided, wholeRun, delivered, each] = raw(nums,
      /可达时隙里 ([\d.]+) % 以碰撞收场，整整 (\d+) ms 只送达 (\d+) 个读数（每轮 ([\d.]+) 个）/,
      '`numbers` on what ACWE 1 delivers')
    expect(val(wholeRun!) * MS, 'the window, which this sentence prints again').toBe(RUN_NS)
    const c1 = slotCensus(recs(ACWE1), reach1)
    same(collided!, (100 * c1.collision) / c1.slots, 'the share of reachable slots that collide')
    expect(val(delivered!), 'the readings the AP decoded').toBe(readingsDelivered(recs(ACWE1)))
    same(each!, readingsDelivered(recs(ACWE1)) / ROUNDS, 'and the same per round')
    // 「六个标签里有两个一次都没被确认过」 — both counts are Chinese, so neither is a figure here
    expect(perTag(ACWE1).filter((n) => n === 0).length, 'tags that never got through at ACWE 1')
      .toBeGreaterThan(1)
    // 「三十轮里只有 17 次碰撞，送达 52 个读数——每轮 1.73 个」
    const [coll3, read3, each3] = raw(nums,
      /三十轮里只有 (\d+) 次碰撞，送达 (\d+) 个读数——每轮 ([\d.]+) 个/,
      '`numbers` on what ACWE 3 delivers')
    const c3 = slotCensus(recs(ACWE3), Math.min(slots, acwOf(ACWE3) + 1))
    expect(val(coll3!), 'the collided slots of the whole run').toBe(c3.collision)
    expect(val(read3!), 'the readings it delivered').toBe(readingsDelivered(recs(ACWE3)))
    same(each3!, readingsDelivered(recs(ACWE3)) / ROUNDS, 'and the same per round')
    // 「ACWE 2 落在中间，46 个读数、每轮 1.53 个，送达最少的那个标签送出 4 个，而 ACWE 3 下是 6 个」
    const [read2, each2, worst2, worst3] = raw(nums,
      /ACWE 2 落在中间，(\d+) 个读数、每轮 ([\d.]+) 个，送达最少的那个标签送出 (\d+) 个，而 ACWE 3 下是 (\d+) 个/,
      '`numbers` on the middle')
    expect(val(read2!), 'the readings at ACWE 2').toBe(readingsDelivered(recs()))
    same(each2!, readingsDelivered(recs()) / ROUNDS, 'and the same per round')
    expect(val(worst2!), 'the tag that got through least often at ACWE 2')
      .toBe(Math.min(...perTag(undefined)))
    expect(val(worst3!), 'and at ACWE 3').toBe(Math.min(...perTag(ACWE3)))
  })

  it('the two counts the deviation and the margin paragraphs restate', () => {
    const { slots } = cfgOf(undefined)
    // 「每行只有 120 个时隙」 — the model table's rows are one run's reachable slots each
    const [perRow] = figs(nums, /每行只有 (\d+) 个时隙/, '`numbers` on how big each row’s sample is')
    expect(perRow, 'the slots one run of this lesson opens').toBe(slots * ROUNDS)
    for (const variant of [ACWE1, undefined, ACWE3]) {
      expect(ofType(recs(variant), 'AMP_SLOT'), 'in every one of the three runs')
        .toHaveLength(perRow!)
    }
    // 「余量高达几十分贝，180 次回应全部落在抽取所指定的时隙里」
    const [responses] = figs(nums, /(\d+) 次回应全部落在抽取所指定的时隙里/,
      '`numbers` on the responses that landed where they were armed')
    const drawn = abocs(undefined).filter((r) => r.slot !== null)
    expect(drawn, 'every draw of the base run armed a slot').toHaveLength(responses!)
    expect(txs(recs(), 'ampResp'), 'and every one of them became a response')
      .toHaveLength(responses!)
    for (const r of txs(recs(), 'ampResp')) {
      const slot = ofType(recs(), 'AMP_SLOT').find((x) => r.t >= x.t && r.t < x.untilNs)!
      const draw = abocs(undefined).filter((d) => d.node === r.node && d.t < r.t).pop()!
      expect(slot.slot, `${r.node} responded in the slot its draw armed`).toBe(draw.slot)
    }
  })

  it('two-phase: both phases’ own arithmetic, and the air the two modes spend', () => {
    const rs = recs(TWO_PHASE)
    // 「回应是 7 个字节而不是 15 个，时隙是 272 µs 而不是 528 µs」
    const [idBytes, readBytes, idUs, readUs] = figs(nums,
      /回应是 (\d+) 个字节而不是 (\d+) 个，时隙是 (\d+) µs 而不是 (\d+) µs/,
      '`numbers` on what the random phase asks for')
    expect(idBytes, 'an identity-only response').toBe(ampRespBytes(false))
    expect(readBytes, 'and one carrying a reading').toBe(ampRespBytes(true))
    expect(idUs! * US, 'the slot the short one needs').toBe(ampUlPpduNs(250, ampRespBytes(false)))
    expect(readUs! * US, 'and the long one').toBe(ampUlPpduNs(250, ampRespBytes(true)))
    // 「19 个字节、810 µs，比广播触发帧长六个字节」 — against the trigger the run really built
    const scheduled = txs(rs, 'ampTrigger').filter((r) => (r.frame.amp?.staIds ?? []).length > 0)
    expect(scheduled.length, 'the run builds scheduled triggers at all').toBeGreaterThan(0)
    const listed = (scheduled[0]!.frame.amp!.staIds ?? []).length
    const [schedBytes, schedUs] = figs(nums, /(\d+) 个字节、(\d+) µs，比广播触发帧长六个字节/,
      '`numbers` on the scheduled trigger')
    expect(schedBytes, 'a trigger listing that many tags').toBe(ampTriggerBytes(listed))
    expect(schedUs! * US, 'and how long it takes on the air')
      .toBe(ampDlPpduNs(250, ampTriggerBytes(listed), EXT))
    expect(schedBytes! - ampTriggerBytes(0), 'six octets longer, one ID each')
      .toBe(listed * AMP_STA_ID_BYTES)
    const [idWidth] = figs(nums, /每个标签都要占 (\d+) 个字节的 ID/, '`numbers` on the ID width')
    expect(idWidth, 'the width this simulator chose for an ID').toBe(AMP_STA_ID_BYTES)
    const [bodyBytes] = figs(nums, /而且 (\d+) 字节的触发帧帧体/, '`numbers` on the trigger body')
    expect(bodyBytes, 'and the width it chose for the body').toBe(AMP_TRIGGER_BODY_BYTES)
    // 「随机阶段 = 50 + 10 + 618 + 4 × (10 + 272 + 10 + 330) = 3166 µs」
    const two = formula('随机阶段')
    const [cts, s1, trig, slots, s2, idResp, s3, ack, randomTotal] = figs(two.text,
      /随机阶段 = (\d+) \+ (\d+) \+ (\d+) \+ (\d) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs/,
      'the random phase, term by term')
    expect(cts! * US, 'the CTS-to-self').toBe(txTimeNs(CTS_BYTES, 6) + EXT)
    expect(trig! * US, 'the broadcast trigger').toBe(ampDlPpduNs(250, ampTriggerBytes(0), EXT))
    expect(slots, 'the slots of the random phase').toBe(cfgOf(TWO_PHASE).slots)
    expect(idResp! * US, 'an identity-only response').toBe(ampUlPpduNs(250, ampRespBytes(false)))
    expect(ack! * US, 'and an Ack').toBe(ampDlPpduNs(250, AMP_ACK_BYTES, EXT))
    expect(cts! + s1! + trig! + slots! * (s2! + idResp! + s3! + ack!), 'its own sum')
      .toBe(randomTotal)
    // 「调度阶段 = 10 + 810 + 3 × (10 + 528 + 10 + 330) = 3454 µs   →  6620 µs」
    const [s4, sched, named, s5, longResp, s6, ack2, schedTotal, both] = figs(two.text,
      /调度阶段 =\s+(\d+) \+ (\d+) \+ (\d) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs\s+→\s+(\d+) µs/,
      'the scheduled phase, term by term')
    expect(sched! * US, 'the trigger that lists them')
      .toBe(ampDlPpduNs(250, ampTriggerBytes(listed), EXT))
    expect(named, 'one slot for each tag it heard').toBe(listed)
    expect(longResp! * US, 'each of them carrying a reading')
      .toBe(ampUlPpduNs(250, ampRespBytes(true)))
    expect(s4! + sched! + named! * (s5! + longResp! + s6! + ack2!), 'its own sum').toBe(schedTotal)
    expect(randomTotal! + schedTotal!, 'and the two together').toBe(both)
    // the poll the engine really runs: its CTS-to-self to the last thing on the air in that poll
    const ctsTx = txs(rs, 'cts')[0]!
    const lastInPoll = ofType(rs, 'TX_END').filter((r) => r.t < cfgOf(TWO_PHASE).pollIntervalMs * MS).pop()!
    expect((lastInPoll.t - ctsTx.t) / US, 'the first two-phase poll, end to end').toBe(both)
    // 「内联模式下同样的三个读数只花了 4190 µs，两阶段多花 2430 µs」
    const [inline, more] = figs(two.note!, /只花了 (\d+) µs，两阶段多花 (\d+) µs/,
      'the note on what the second phase costs')
    expect(inline! * US, 'the inline round').toBe(ROUND_NS)
    expect(both! - inline!, 'and the difference the note prints').toBe(more)
    const firstPoll = (x: TLRecord[]): TLRecord[] => x.filter((r) => r.t < 20 * MS)
    expect(readingsDelivered(firstPoll(rs)), 'for the same readings as inline’s first round')
      .toBe(readingsDelivered(firstPoll(recs())))
    // 「它的 CTS-to-self 要预留 7512 µs」, and 「三十轮里有 4 轮一个标签也没听到」
    const [reserve] = figs(two.note!, /要预留 (\d+) µs/, 'the note on the CTS-to-self')
    expect(reserve! * US, 'what the CTS-to-self really reserves').toBe(ctsTx.frame.durationFieldNs)
    const [silent] = figs(two.note!, /三十轮里有 (\d+) 轮一个标签也没听到/,
      'the note on the rounds with no scheduled phase')
    expect(silent, 'the polls that heard nobody').toBe(ROUNDS - scheduled.length)
    // 「两种模式送达的读数一样多，都是 46 个：内联花了 154 730 µs 的 PPDU，两阶段花了 167 130 µs，多 8.0 %」
    const [both46, airInline, airTwo, pct] = raw(nums,
      /都是 (\d+) 个：内联花了 ([\d\s]+) µs 的 PPDU，两阶段花了 ([\d\s]+) µs，多 ([\d.]+) %/,
      '`numbers` on the air the two modes spend')
    expect(val(both46!), 'the readings inline delivers').toBe(readingsDelivered(recs()))
    expect(val(both46!), 'and the readings two-phase delivers').toBe(readingsDelivered(rs))
    const air = (x: TLRecord[]): number =>
      ofType(x, 'TX_START').reduce((s, r) => s + r.frame.txTimeNs, 0) / US
    expect(val(airInline!), 'the PPDU microseconds inline spends').toBe(air(recs()))
    expect(val(airTwo!), 'and the ones two-phase spends').toBe(air(rs))
    same(pct!, 100 * (air(rs) / air(recs()) - 1), 'and what that is as a share')
  })

  it('`observe` and `tryThis`: the instants, the sit-out, the two shares and the seventh tag', () => {
    const obs = ampSlots.observe.join('\n')
    const trys = ampSlots.tryThis.join('\n')
    const { slots } = cfgOf(undefined)
    // 「三帧回应在 2444 µs 一起开始、在 2972 µs 结束，COLLISION 就落在那里。打开 2982 µs 那帧 Ack」
    const [from, to, ackAt] = figs(obs,
      /三帧回应在 (\d+) µs 一起开始、在 (\d+) µs 结束[\s\S]*?打开 (\d+) µs 那帧 Ack/,
      '`observe` on the collided slot')
    const collided = perSlot(undefined).find((s) => s.n > 1)!
    expect(collided.t / US, 'when those responses start').toBe(from)
    const resp = txs(recs(), 'ampResp').filter((r) => r.t === collided.t)
    expect(resp.length, 'three of them, together').toBe(collided.n)
    expect((resp[0]!.t + resp[0]!.frame.txTimeNs) / US, 'and when they end').toBe(to)
    expect(txs(recs(), 'ampAck').some((r) => r.t / US === ackAt), 'the Ack that follows').toBe(true)
    /*
     * 「选中 Tag 3，单步走过五轮……三十轮里四个取值它都抽到过」. The tag is read out of the
     * sentence rather than typed here — and then the claim is checked of **every** tag, which is
     * the argument for why this sentence may name any one of the six: all of them draw the whole
     * window over thirty rounds, so the figure carries no more than 「a tag」.
     */
    const [picked] = figs(obs, /选中 Tag (\d)/, '`observe` on which tag to step through')
    expect(TAGS, `Tag ${picked} is a node of this scene`).toContain(`tag-${picked}#2g`)
    for (const tag of TAGS) {
      expect(new Set(abocs(undefined).filter((r) => r.node === tag).map((r) => r.aboc)).size,
        `${tag} draws every value in the window, so the sentence holds whichever it names`)
        .toBe(acwOf(undefined) + 1)
    }
    const [howMany] = raw(obs, /三十轮里(.)个取值它都抽到过/,
      '`observe` on how many values Tag 3 draws')
    expect(zhNumeral(howMany!), 'four of them, which that sentence writes in Chinese')
      .toBe(acwOf(undefined) + 1)
    // 「跳到 678 µs 的第一次空转：Tag 3 从 [0, 7] 抽到 5，整轮保持沉默」
    const [sitAt, lo, hi, drew] = figs(obs,
      /跳到 (\d+) µs 的第一次空转：Tag 3 从 \[(\d), (\d)\] 抽到 (\d)/,
      '`observe` on the first sit-out')
    const sit = abocs(ACWE3).filter((r) => r.slot === null)[0]!
    expect(sit.t / US, 'when the first sit-out is recorded').toBe(sitAt)
    expect(sit.node, 'and whose it is').toBe('tag-3#2g')
    expect([lo, hi], 'the window it drew from').toEqual([0, acwOf(ACWE3)])
    expect(sit.aboc, 'and what it drew').toBe(drew)
    expect(drew!, 'which is past the slots on offer').toBeGreaterThanOrEqual(slots)
    // 「42.5 % 的时隙是空的——碰撞率降到 14.2 %」
    const [empty, coll] = raw(obs, /([\d.]+) % 的时隙是空的——碰撞率降到 ([\d.]+) %/,
      '`observe` on what ACWE 3 buys')
    const c3 = slotCensus(recs(ACWE3), slots)
    same(empty!, (100 * c3.empty) / c3.slots, 'the empty share at ACWE 3')
    same(coll!, (100 * c3.collision) / c3.slots, 'and the collided one')
    // 「ACWE 1 每轮 0.23 个，ACWE 2 每轮 1.53 个，ACWE 3 每轮 1.73 个」
    const [t1, t2, t3] = raw(trys,
      /ACWE 1 每轮 ([\d.]+) 个，ACWE 2 每轮 ([\d.]+) 个，ACWE 3 每轮 ([\d.]+) 个/,
      '`tryThis` on what each end delivers')
    same(t1!, readingsDelivered(recs(ACWE1)) / ROUNDS, 'ACWE 1 per round')
    same(t2!, readingsDelivered(recs()) / ROUNDS, 'ACWE 2 per round')
    same(t3!, readingsDelivered(recs(ACWE3)) / ROUNDS, 'ACWE 3 per round')
    /*
     * 「用编辑器在同样 2 m 的距离上再加第七个标签……送达率从每轮 1.53 个读数掉到 1.03 个，碰撞
     * 时隙占比从 45.0 % 升到 59.2 %——模型预测 55.5 %」. `ampSlotsScenario` keeps a seventh
     * position on the ring for exactly this experiment, so this IS the reader's own run.
     */
    const [seventh] = figs(trys, /在同样 (\d) m 的距离上再加第七个标签/,
      '`tryThis` on where the seventh tag goes')
    const sevenScene = ampSlotsScenario({ acwe: cfgOf(undefined).acwe, readMode: 'inline', tags: 7 })
    const ap = sevenScene.nodes[0]!
    for (const n of sevenScene.nodes.slice(1)) {
      expect(Number(Math.hypot(n.pos.x - ap.pos.x, n.pos.y - ap.pos.y).toFixed(3)),
        `${n.id} is on the same ring`).toBe(seventh)
    }
    const seven = [...new Simulation(sevenScene).runUntil(RUN_NS).records]
    const [was, now, wasColl, nowColl, predicted] = raw(trys,
      /从每轮 ([\d.]+) 个读数掉到 ([\d.]+) 个，碰撞时隙占比从 ([\d.]+) % 升到 ([\d.]+) %——模型预测 ([\d.]+) %/,
      '`tryThis` on what the seventh tag costs')
    same(was!, readingsDelivered(recs()) / ROUNDS, 'what six tags deliver')
    same(now!, readingsDelivered(seven) / ROUNDS, 'and what seven do')
    const c6 = slotCensus(recs(), slots), c7 = slotCensus(seven, slots)
    same(wasColl!, (100 * c6.collision) / c6.slots, 'the collided share with six')
    same(nowColl!, (100 * c7.collision) / c7.slots, 'and with seven')
    same(predicted!, 100 * model(7, acwOf(undefined), slots).collision,
      'and what the model says of seven')
  })

  /*
   * **`limits` prints four of the same figures again, and a second printing is its own site.**
   * Each of the three `model-value` entries names the constant it rests on, so each figure is
   * read against the export the sentence names — and the 810 µs is read against the trigger the
   * two-phase run really built, which is what makes 「换一个实现……810 µs 这个数字也会跟着变」
   * a checkable sentence rather than a remark.
   */
  /*
   * **The algebra outside the formula block.** `q = 1/(ACW + 1)`, `1 − p` and `ACW + 1` are
   * printed in the formula block, in two `numbers` paragraphs and in a quiz explanation — and
   * `@bianchi` is where this lesson was learnt: half the figures of an algebraic lesson are the
   * 1s and 2s inside its own identities, and a 1 that is only read where it was derived leaves
   * the other four printings free. Each is read where it is printed and substituted back.
   */
  it('the 1s and 2s of the algebra, at every one of the places the lesson prints them', () => {
    const M = ampSlots.scenario().nodes.length - 1
    const runs = [ACWE1, undefined, ACWE3] as const
    // 「q = 1/(ACW + 1)」 — the formula block and the quiz explanation
    const qs = [...EVERYWHERE.matchAll(/q = (\d)\/\(ACW \+ (\d)\)/g)]
      .map((m) => [val(m[1]!), val(m[2]!)])
    expect(qs.length, 'the lesson writes q more than once').toBeGreaterThan(1)
    for (const [num, off] of qs) {
      for (const variant of runs) {
        expect(num! / (acwOf(variant) + off!), `ACWE ${cfgOf(variant).acwe}: the q it writes`)
          .toBeCloseTo(model(M, acwOf(variant), cfgOf(variant).slots).q, 12)
      }
    }
    // every 「ACW + 1」 anywhere is that same offset, which is what makes a window a count
    for (const v of everyFig(/ACW \+ (\d)/g, 'the offset that turns a window into a count', 4)) {
      expect(val(v), 'the same offset every time').toBe(qs[0]![1])
      for (const variant of runs) {
        expect(acwOf(variant) + val(v), 'and ACW + 1 really is the values a draw can take')
          .toBe(new Set(abocs(variant).filter((r) => r.acw > 0).map((r) => r.aboc)).size)
      }
    }
    /*
     * 「于是 1 − p 就是空转率」 and 「1 − p 预言 ACWE 3 下有一半抽取会空转」. A tolerance is right
     * here and nowhere else in this file: this compares a MODEL with a measurement, not a
     * printed figure with one — 50.6 % against the predicted 50 % — and the printed 50.6 % and
     * 91 are read exactly by the sit-out test above.
     */
    for (const v of everyFig(/(\d) − p/g, 'the sit-out rate as the lesson writes it', 2)) {
      for (const variant of runs) {
        const drawn = abocs(variant).filter((r) => r.acw > 0)
        const sits = drawn.filter((r) => r.slot === null).length
        expect(val(v) - model(M, acwOf(variant), cfgOf(variant).slots).p,
          `ACWE ${cfgOf(variant).acwe}: 1 − p against the sit-outs that happened`)
          .toBeCloseTo(sits / drawn.length, 1)
      }
    }
    // 「ACWE 1 与 2 下公式给出 p = 1，实测也确实一次空转都没有」
    const [noSitA, noSitB, pIs] = figs(nums, /ACWE (\d) 与 (\d) 下公式给出 p = (\d)/,
      '`numbers` on where nothing sits out')
    for (const acwe of [noSitA!, noSitB!]) {
      // by INDEX, not by `find`: the base run is itself `undefined`, so a `find` that returns
      // `undefined` cannot tell 「the base run」 from 「no such run」
      const at = runs.findIndex((v) => cfgOf(v).acwe === acwe)
      expect(at, `ACWE ${acwe} is a run this lesson ships`).toBeGreaterThanOrEqual(0)
      const variant = runs[at]
      expect(model(M, acwOf(variant), cfgOf(variant).slots).p, `ACWE ${acwe}: p`).toBe(pIs)
      expect(abocs(variant).filter((r) => r.acw > 0 && r.slot === null),
        `ACWE ${acwe}: and nothing sits out`).toHaveLength(0)
    }
    // 「ABOC 是从 0 到 ACW = 1 之间抽的」 (the quiz, about ACWE 1)
    const [floor, acw1] = figs(quizText, /ABOC 是从 (\d) 到 ACW = (\d) 之间抽的/,
      'the quiz on the window at ACWE 1')
    expect(acw1, 'the window ACWE 1 gives').toBe(acwOf(ACWE1))
    expect(Math.min(...abocs(ACWE1).map((r) => r.aboc)), 'and the floor of every draw').toBe(floor)
    // 「抽到的只能是 0 或 1」
    const [only0, only1] = figs(quizText, /抽到的只能是 (\d) 或 (\d)/, 'the quiz on what ACWE 1 can draw')
    expect([...new Set(abocs(ACWE1).map((r) => r.aboc))].sort((a, b) => a - b),
      'the draws ACWE 1 really makes').toEqual([only0, only1])
  })

  /*
   * **Naming a run is not enough.** 「ACWE 1 与 2 下公式给出 p = 1」 survived a planting to
   * 「ACWE 2 与 2」, because ACWE 2's p really is 1 as well: a membership test over the three runs
   * this lesson ships is a set of three, and two of them satisfy that sentence. So each sentence
   * that singles a run out is checked against **the property it claims**, and against the claim
   * that no other run has it.
   */
  it('every ACWE the prose singles out is the run its own sentence describes', () => {
    const runs = [ACWE1, undefined, ACWE3] as const
    const M = ampSlots.scenario().nodes.length - 1
    const pOf = (v: number | undefined): number => model(M, acwOf(v), cfgOf(v).slots).p
    const reachOf = (v: number | undefined): number => Math.min(cfgOf(v).slots, acwOf(v) + 1)
    const asc = (x: number, y: number): number => x - y
    // 「ACWE 1 与 2 下公式给出 p = 1」 — exactly the runs whose p is that, and no others
    const [withP1A, withP1B, pIs] = figs(nums, /ACWE (\d) 与 (\d) 下公式给出 p = (\d)/,
      '`numbers` on where nothing sits out')
    expect([withP1A!, withP1B!].sort(asc), 'the runs whose p is 1, and there are no others')
      .toEqual(runs.filter((v) => pOf(v) === pIs).map((v) => cfgOf(v).acwe).sort(asc))
    // 「ACWE 1 是极端的一端」 / 「ACWE 1 下时隙 3 和 4」 / 「ACWE 1、本轮提供四个时隙时」
    const starved = runs.filter((v) => reachOf(v) < cfgOf(v).slots).map((v) => cfgOf(v).acwe)
    expect(starved, 'exactly one run cannot fill its own round').toHaveLength(1)
    for (const v of everyFig(/ACWE (\d) 是极端的一端|ACWE (\d) 下时隙|ACWE (\d)、本轮提供/g,
      'the run whose window is narrower than its round', 3)) {
      expect(val(v), 'the only run that cannot fill its own round').toBe(starved[0])
    }
    // 「ACWE 3 是另一端，宽松得多」 / 「1 − p 预言 ACWE 3 下有一半抽取会空转」
    const sitting = runs.filter((v) => pOf(v) < 1).map((v) => cfgOf(v).acwe)
    expect(sitting, 'exactly one run sits out at all').toHaveLength(1)
    for (const v of everyFig(/ACWE (\d) 是另一端|预言 ACWE (\d) 下有一半/g,
      'the run whose draws sit out', 2)) {
      expect(val(v), 'the only run whose draws fall outside the slots').toBe(sitting[0])
    }
    // 「依次载入 ACWE 1 与 ACWE 3 两个变体」 — the two inline variants beside the shipped scene
    const [load1, load2] = figs(ampSlots.tryThis.join('\n'),
      /依次载入 ACWE (\d) 与 ACWE (\d) 两个变体/, '`tryThis` on which variants to load')
    expect([load1!, load2!].sort(asc), 'the two inline variants this lesson ships')
      .toEqual([ACWE1, ACWE3].map((v) => cfgOf(v).acwe).sort(asc))
    // 「ACW + 1 = 2」 — `numbers` and the quiz explanation, both about ACWE 1
    for (const v of everyFig(/ACW \+ 1 = (\d)/g, 'the values a draw can take at ACWE 1', 2)) {
      expect(val(v), 'one more than that window').toBe(acwOf(ACWE1) + 1)
    }
    // 「每个标签 2 字节的 ID」 and 「6 字节的触发帧帧体」 — `sources` says it and `limits` says it
    for (const v of everyFig(/每个标签 (\d+) 字节的 ID/g, 'the ID width, twice', 2)) {
      expect(val(v), 'the width `amp.ts` exports').toBe(AMP_STA_ID_BYTES)
    }
    for (const v of everyFig(/(\d+) 字节的触发帧帧体/g, 'the trigger body, twice', 2)) {
      expect(val(v), 'the width `amp.ts` exports').toBe(AMP_TRIGGER_BODY_BYTES)
    }
  })

  it('every ACWE, every Tag and every slot the prose names is one this lesson has', () => {
    const { slots } = cfgOf(undefined)
    const reach1 = Math.min(slots, acwOf(ACWE1) + 1)
    const shipped = [undefined, ACWE1, ACWE3].map((v) => cfgOf(v).acwe)
    // every 「ACWE N」 in the whole lesson — `numbers`, `observe`, `tryThis`, the quiz, the labels
    for (const v of everyFig(/ACWE (\d)/g, 'an ACWE the prose names', 12)) {
      expect(shipped, `ACWE ${v} is one of the three runs this lesson ships`).toContain(val(v))
    }
    // every 「Tag N」 is a node of the scene
    for (const v of everyFig(/Tag (\d)/g, 'a tag the prose names', 8)) {
      expect(TAGS, `Tag ${v} is a node of this scene`).toContain(`tag-${val(v)}#2g`)
    }
    // 「时隙 3、4 从构造上就不可达」 / 「时隙 3 和 4 里永远什么都没有」 — three sites of one pair
    const unreachable = Array.from({ length: slots - reach1 }, (_x, i) => reach1 + 1 + i)
    const pairs = [...EVERYWHERE.matchAll(/时隙 (\d)\s*[、和]\s*(\d)\s*(?:从构造上|里永远)/g)]
      .map((m) => [val(m[1]!), val(m[2]!)])
    expect(pairs.length, 'the lesson names that pair of slots three times')
      .toBeGreaterThanOrEqual(3)
    for (const p of pairs) expect(p, 'the slots nothing can reach at ACWE 1').toEqual(unreachable)
    // 「因此只可能指向时隙 1 或 2」 / 「待发时隙只可能是 1 或 2」 — the complement, twice
    const reachPairs = [...EVERYWHERE.matchAll(/只可能(?:指向时隙|是) (\d) 或 (\d)/g)]
      .map((m) => [val(m[1]!), val(m[2]!)])
    expect(reachPairs.length, 'and the pair it can reach, twice').toBeGreaterThanOrEqual(2)
    const reachable = Array.from({ length: reach1 }, (_x, i) => i + 1)
    for (const p of reachPairs) expect(p, 'the slots a draw can reach at ACWE 1').toEqual(reachable)
    // 「选中 Tag 3」 / 「Tag 3 从 [0, 7] 抽到 5」 — the tag the sit-out belongs to, read not typed
    const [sitTag] = figs(ampSlots.observe.join('\n'), /Tag (\d) 从 \[\d, \d\] 抽到 \d/,
      '`observe` on whose sit-out it is')
    expect(abocs(ACWE3).filter((r) => r.slot === null)[0]!.node, 'the first tag to sit out')
      .toBe(`tag-${sitTag}#2g`)
    // 「随机阶段听到了 Tag 2、Tag 1 和 Tag 4，调度触发帧按这个顺序列出它们」
    const order = [...raw(nums, /随机阶段听到了 Tag (\d)、Tag (\d) 和 Tag (\d)/,
      '`numbers` on whom the random phase heard')].map(val)
    const sched = txs(recs(TWO_PHASE), 'ampTrigger')
      .filter((r) => (r.frame.amp?.staIds ?? []).length > 0)[0]!
    // the trigger carries bare node ids; `#2g` is the runtime link id the records carry
    expect(sched.frame.amp!.staIds, 'the scheduled trigger lists them in that order')
      .toEqual(order.map((n) => `tag-${n}`))
  })

  it('`limits`: the two widths it owns as model choices, and the trigger they size', () => {
    const scheduled = txs(recs(TWO_PHASE), 'ampTrigger')
      .filter((r) => (r.frame.amp?.staIds ?? []).length > 0)
    const listed = (scheduled[0]!.frame.amp!.staIds ?? []).length
    // 「两阶段调度触发帧里每个标签 2 字节的 ID（amp.ts 的 AMP_STA_ID_BYTES）与 6 字节的触发帧
    //  帧体（AMP_TRIGGER_BODY_BYTES）都是本仿真器自己选的宽度」
    const [idWidth, bodyWidth] = figs(limitsText,
      /每个标签 (\d+) 字节的 ID（amp\.ts 的 AMP_STA_ID_BYTES）与 (\d+) 字节的触发帧帧体/,
      '`limits` on the two widths it owns')
    expect(idWidth, 'the ID width `amp.ts` really exports').toBe(AMP_STA_ID_BYTES)
    expect(bodyWidth, 'and the trigger body').toBe(AMP_TRIGGER_BODY_BYTES)
    // 「调度触发帧可能用不一样的字节数，810 µs 这个数字也会跟着变」
    const [schedUs] = figs(limitsText, /(\d+) µs 这个数字也会跟着变/,
      '`limits` on the figure those widths decide')
    expect(schedUs! * US, 'the scheduled trigger this run really builds')
      .toBe(ampDlPpduNs(250, ampTriggerBytes(listed), EXT))
    expect(ampTriggerBytes(listed), 'out of those two widths and the list it carries')
      .toBe(AMP_TRIGGER_BODY_BYTES + listed * AMP_STA_ID_BYTES + AMP_HDR_BYTES + AMP_FCS_BYTES)
    // 「AP 的 ACWE 在一整次运行里是固定的场景参数（scenario.ts 的 AmpApCfg.acwe）」
    expect(limitsText, '`limits` still names the field the ACWE lives in')
      .toContain('AmpApCfg.acwe')
    for (const variant of ALL_RUNS) {
      expect([...new Set(abocs(variant).filter((r) => r.acw > 0).map((r) => r.acw))],
        'one window for the whole run, never adapted').toHaveLength(1)
    }
  })

  it('the strings the UI prints, quoted in `numbers` and read off the frames', () => {
    const CTX = { apId: 'ap', isEdca: false }
    const list = ampSlots.numbers!.find(
      (b): b is Extract<typeof b, { kind: 'list' }> => b.kind === 'list')!
    const quoted = list.items.join('\n')
    const body = (variant: number | undefined): { bytes: number; value: string } => {
      const trig = txs(recs(variant), 'ampTrigger')[0]!
      const f = decodeFrame(trig.frame, CTX).users[0]!.subframes[0]!.mpdu.fields
        .find((x) => x.key === 'body')!
      return { bytes: f.bytes, value: String(f.value) }
    }
    // 「触发帧 6 个字节的帧体：“Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading”」
    const [bodyBytes] = figs(quoted, /触发帧 (\d+) 个字节的帧体/, 'the body width `numbers` quotes')
    expect(bodyBytes, 'the body the engine builds').toBe(body(undefined).bytes)
    const [inlineBody] = raw(quoted, /帧体：“([^”]+)”/, 'the body line it quotes')
    expect(inlineBody, 'the string the inline trigger really prints').toBe(body(undefined).value)
    // 「两阶段下则是“…… 4 slots × 272 µs · id only”」
    const [twoTail] = raw(quoted, /两阶段下则是“…… ([^”]+)”/, 'and the two-phase tail')
    expect(body(TWO_PHASE).value, 'the two-phase trigger really ends with that')
      .toContain(twoTail!)
    // 「日志里：“ABOC 1 of [0, 3] → slot 2”、“ABOC 5 of [0, 7] → sits out”、“slot 3: not acknowledged”」
    const lines = [...quoted.matchAll(/“([^”]+)”/g)].map((m) => m[1]!)
      .filter((s) => s.startsWith('ABOC') || s.includes('not acknowledged'))
    expect(lines, '`numbers` quotes three log lines').toHaveLength(3)
    const printed = [
      fmtRecord(abocs(undefined)[0]!),
      fmtRecord(abocs(ACWE3).filter((r) => r.slot === null)[0]!),
      fmtRecord(results(recs()).filter((r) => !r.acked)[0]!),
    ]
    for (const [i, line] of lines.entries()) {
      expect(printed[i], `the log line the lesson quotes: ${line}`).toContain(line)
    }
  })
})
