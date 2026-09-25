/**
 * Every empirical claim in the "Slotted random access" lesson, measured against
 * the lesson's own scenario and its three variants. Each assertion quotes the
 * sentence it guards **verbatim** from the shipped prose (EN unless the claim
 * only exists in ZH); standard constants are checked against the engine's
 * exports (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { ampSlots, ampSlotsScenario } from '../../src/course/amp/amp-slots'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_ACK_BYTES, AMP_SIFS_NS, AMP_STA_ID_BYTES, AMP_TAG_DL_SENS_DBM, AMP_TRIGGER_BODY_BYTES,
  AMP_UL_CHIP_NS, AMP_UL_SYNC_CHIPS,
  ampDlPpduNs, ampRespBytes, ampTriggerBytes, ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { CTS_BYTES, ERP_2G, txTimeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { rssiOn } from './rssi'
import { decodeFrame } from '../../src/model/frameFields'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'

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
