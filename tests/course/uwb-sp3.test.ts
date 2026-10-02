/**
 * Every empirical claim in 「最短的测距帧，不构成最短的轮」, measured against runs.
 *
 * The lesson prints one frame length that is not measured in octets at all (an SP3 marker: 0
 * octets, `uwbSp3Ns()` of airtime), three whole-round air times at four anchors, a per-responder
 * net saving, a crossover anchor count, and the two things the SRRR request bits change. Every one
 * of them is read back out of a simulation or recomputed from `src/uwb/phy.ts` — nothing here is a
 * number typed twice, and nothing is defended by a string match.
 *
 * **The round totals are the claim most worth measuring rather than deriving**, because the
 * lesson's A = 1…6 table is computed from the frame-size functions: so this file runs a real round
 * at every one of those six anchor counts, for all three shapes, and requires the formula to equal
 * the air the medium actually radiated. The ruler is each `TX_START`'s own `frame.txTimeNs` — the
 * PPDU time as the PHY computed it — summed over a window that holds exactly block 0's one round.
 * (A window of exactly 200 ms would hold block 1's control message too and every RCM figure would
 * come out doubled; that is the mistake the slice's own fix round made and caught, so the window
 * here is 150 ms.)
 *
 * The identity claim is checked from the side a lesson run can see: the markers carry `bytes: 0`,
 * `ies: []` and `sp: 3`, and each `UWB_SP3` record's `peer` is the device the round plan gives that
 * slot — never anything the frame could have said. The mutation that makes the distances *present
 * and wrong* lives in tests/uwb/sp3-round.test.ts, which is what the lesson's own prose cites.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, BYTES, CHIPS, GAP, MS, MULT, NS, PAY, PHASE, PLACES, ROUND, SAVE, SLOTS, SWEEP, TAG,
  TAG_ID, crossoverAnchors, grp, idOf, sp1DeferredRoundNs, sp1EmbeddedRoundNs, sp3RoundNs, us,
  uwbSp1Scenario, uwbSp3, uwbSp3Fields, uwbSp3Scenario, uwbSp3SweepScenario,
} from '../../src/course/uwb/uwb-sp3'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { diagramTexts } from '../../src/course/diagram'
import {
  SRRR_IE_BYTES, UWB_IE_HDR_BYTES, UWB_PHR_CHIPS, UWB_SHR_CHIPS, UWB_SP3_RAOA_ITEM_BYTES,
  UWB_SS_DEFER_BYTES, UWB_STS_CHIPS, srrrIeBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes,
  uwbSp3Chips, uwbSp3InitReportBytes, uwbSp3Ns, uwbSp3PollBytes,
} from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'
import { roundPlan, slotAction } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS_NS
/** A window that holds exactly block 0's one round, and no part of block 1 (see the header). */
const ONE_ROUND_NS = 150 * MS_NS
/** How far a correct range may sit from the geometry: five times the range's own 1-σ at this
 * session's timestamp noise, derived rather than written down. */
const RANGE_BUDGET_M = 5 * rangeSigmaM(uwbSp3Scenario().uwb!.tsNoisePs)

lessonShapeSuite(uwbSp3, { runNs: RUN_NS })

const run = (sc: Scenario, ns: number): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ns).records]
}

/** Every transmission of block 0, in slot order, as the medium radiated it. */
const air = (rs: TLRecord[]): { slot: number; kind: string; node: string; bytes: number; ns: number; ies: string[]; sp: number }[] =>
  ofType(rs, 'TX_START')
    .filter((r) => (r.frame.uwb?.block ?? -1) === 0)
    .map((r) => ({
      slot: r.frame.uwb?.slot ?? -1, kind: r.frame.kind, node: r.node, bytes: r.frame.bytes,
      ns: r.frame.txTimeNs, ies: [...(r.frame.uwb?.ies ?? [])], sp: r.frame.uwb?.sp ?? -1,
    }))
    .sort((a, b) => a.slot - b.slot)

/** The whole round's air time, summed off the frames themselves — the lesson's own ruler. */
const roundNs = (rs: TLRecord[]): number => air(rs).reduce((n, f) => n + f.ns, 0)

describe('uwb-sp3 · where it sits in the course', () => {
  it('is the SP3 lesson of its own module, checked against the published standard alone', () => {
    expect(MODULES[uwbSp3.module].title).toBe('SP3 分组测距')
    expect(MODULES[uwbSp3.module].tier).toBe(5)
    // 「本课完全不依赖任何草案」: the module inherits the published revision from its tier and
    // declares nothing of its own, so the two can never drift apart.
    expect(MODULES[uwbSp3.module].basis).toBeUndefined()
    expect(basisOf(uwbSp3.module)).toEqual(['ieee-802-15-4-2024'])
    // the two lessons it is built out of: the deferred road, and the request bit that costs nothing
    expect(uwbSp3.needs).toEqual(['uwb-reply-time', 'uwb-receipt'])
    const src = uwbSp3.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    // the clauses the lesson rests on, and the figure the standard draws for the first of them
    expect(src).toContain('§10.32.8')
    expect(src).toContain('§10.32.9.9')
    expect(src).toContain('§10.29.6.3')
    expect(src).toContain('§10.29.8.4')
    expect(src).toContain('Figure 10-242')
  })

  it('declares five limits, each about something this engine does not do', () => {
    expect(uwbSp3.limits).toHaveLength(5)
    expect(uwbSp3.limits.map((l) => l.kind))
      .toEqual(['unmodelled', 'unmodelled', 'out-of-scope', 'out-of-scope', 'model-value'])
    const text = uwbSp3.limits.map((l) => l.text).join('\n')
    // STS is airtime and nothing else — the same reason `uwb-sts`'s own first limit gives
    expect(text).toContain('UWB_STS_CHIPS')
    expect(text).toContain('没有一处密码学')
    expect(text).toContain('@uwb-sts')
    // the three things §10.32.8.2 asks for that are not built
    expect(text).toContain('MLME-STS')
    expect(text).toContain('RSSD')
    expect(text).toContain('STS 计数器')
    // one-to-many only, and the schema is what makes that true rather than a convention
    expect(text).toContain('§10.32.8.1')
    expect(text).toContain('m2m')
    // SP2 is a scope decision, and the type is the evidence
    expect(text).toContain('SP2')
    expect(text).toContain('sp 字段')
    // the bearing travels the other way round from the figure's, and that is a model value
    expect(text).toContain('makeSsDefer')
    expect(text).toContain('UWB_AOA')
    // 「不许写『本仿真器有简化』」, in both spellings, and no limit calls the standard a draft
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
    expect(text).not.toContain('草案')
  })

  it('names every engine symbol its limits point at', () => {
    // Each claim is checkable only if the thing it names exists; a renamed export turns a limit
    // into a sentence about nothing.
    const symbols: [string, string][] = [
      ['phy.ts', 'UWB_STS_CHIPS'], ['frames.ts', 'makeSsDefer'], ['session.ts', 'slotAction'],
    ]
    for (const [file, symbol] of symbols) {
      const src = readSrc(`uwb/${file}`)
      expect(new RegExp(`export (?:const|function|class|interface|type) ${symbol}\\b`).test(src), symbol)
        .toBe(true)
    }
    // …and the two structures the limits name that are not exports: UwbInfo's `sp` field admits
    // exactly 1 and 3, so SP2 has nowhere to be written down, and no IE is called RSSD.
    expect(readSrc('uwb/frames.ts')).toContain('sp: 1 | 3')
    expect(readSrc('uwb/frameFields.ts')).not.toContain('RSSD')
    // no cryptography anywhere on the UWB side: the one place AES is named is a comment saying
    // the narrowband hopping sequence uses a string hash INSTEAD of it
    expect(readSrc('uwb/phy.ts')).not.toMatch(/\bAES\b/)
    expect(readSrc('uwb/device.sp3.ts')).not.toMatch(/\bAES\b/)
  })
})

/** One source file of the engine, for the claims above. */
function readSrc(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs').readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8') as string
}

describe('uwb-sp3 · the scene is the one the lesson describes', () => {
  const sc = uwbSp3Scenario()

  it(`is ${ANCHORS} anchors and one tag in the 22 × 8 m hall, no two distances alike`, () => {
    expect(sc.nodes).toHaveLength(ANCHORS + 1)
    expect(sc.nodes.map((n) => n.id)).toEqual([...Array.from({ length: ANCHORS }, (_v, i) => idOf(i)), TAG_ID])
    for (const [i, p] of PLACES.slice(0, ANCHORS).entries()) {
      expect([sc.nodes[i].pos.x, sc.nodes[i].pos.y]).toEqual([p.x, p.y])
    }
    const tag = sc.nodes[ANCHORS]
    expect([tag.pos.x, tag.pos.y]).toEqual([TAG.x, TAG.y])
    // every pairwise distance to the tag different, so a range filed under the wrong anchor
    // disagrees with its own trueDistM — the property the identity claim rests on
    const six = uwbSp3SweepScenario(PLACES.length, 'sp3').nodes
    const d = (i: number): number => Math.hypot(
      PLACES[i].x - TAG.x, PLACES[i].y - TAG.y, six[i].pos.z - tag.pos.z,
    )
    const ds = PLACES.map((_p, i) => d(i).toFixed(3))
    expect(new Set(ds).size, ds.join(' ')).toBe(PLACES.length)
    // …and the band the distance check below uses really does discriminate a swap: the closest
    // two anchors of the base scene are further apart than it is wide
    const near = PLACES.slice(0, ANCHORS).map((_p, i) => d(i)).sort((a, b) => a - b)
    const gaps = near.slice(1).map((x, i) => x - near[i])
    expect(Math.min(...gaps), `${gaps.map((g) => g.toFixed(3)).join(' ')} vs ${RANGE_BUDGET_M}`)
      .toBeGreaterThan(2 * RANGE_BUDGET_M)
    // the two knobs this lesson turns off, and the one it keeps (sources says why)
    expect(sc.uwb!.cfoNoisePpm).toBe(0)
    expect(sc.uwb!.nlos).toBe(false)
    expect(sc.uwb!.tsNoisePs).toBeGreaterThan(0)
    // the session is the one SP3 forces: deferred reply time, SS-TWR, time-scheduled, both bits off
    expect(sc.uwb!.sp3).toBe(true)
    expect(sc.uwb!.replyTime).toBe('deferred')
    expect(sc.uwb!.method).toBe('ss')
    expect(sc.uwb!.schedule).toBe('time')
    expect(sc.uwb!.srrr).toEqual({ raoa: false, rrtt: false })
    // and the two figures the sources quote come off the plan, not off FiRa's usual two numbers
    expect(MS.slot).toBe(2)
    expect(MS.block).toBe(200)
  })

  it(`lays out ${SLOTS.sp3} slots: the RCM, 1 + ${ANCHORS} markers, then ${ANCHORS} reports`, () => {
    const plan = roundPlan(uwbSp3Scenario().uwb!, ANCHORS)
    expect(SLOTS.sp3).toBe(plan.slots)
    expect(SLOTS.sp3).toBe(2 * ANCHORS + 2)
    // slot for slot, off the engine's own answer rather than off the lesson's description
    expect(slotAction(plan, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    expect(slotAction(plan, 1)).toEqual({ kind: 'uwbSp3', tx: 'tag' })
    for (let i = 0; i < ANCHORS; i++) {
      expect(slotAction(plan, 2 + i)).toEqual({ kind: 'uwbSp3', tx: 'anchor', anchor: i })
      expect(slotAction(plan, ANCHORS + 2 + i)).toEqual({ kind: 'uwbSsDefer', tx: 'anchor', anchor: i })
    }
    // the other three shapes the lesson prints
    expect(SLOTS.deferred).toBe(roundPlan(uwbSp1Scenario('deferred').uwb!, ANCHORS).slots)
    expect(SLOTS.embedded).toBe(roundPlan(uwbSp1Scenario('embedded').uwb!, ANCHORS).slots)
    expect(SLOTS.sp3Rrtt).toBe(roundPlan(uwbSp3Scenario({ raoa: true, rrtt: true }).uwb!, ANCHORS).slots)
    expect([SLOTS.embedded, SLOTS.deferred, SLOTS.sp3, SLOTS.sp3Rrtt])
      .toEqual([ANCHORS + 1, 2 * ANCHORS + 1, 2 * ANCHORS + 2, 2 * ANCHORS + 3])
  })
})

describe('uwb-sp3 · one frame, and what it cannot carry', () => {
  const rs = run(uwbSp3Scenario(), ONE_ROUND_NS)

  it('「0 字节，一个信息单元也没有」: every marker, as the medium radiated it', () => {
    const markers = air(rs).filter((f) => f.kind === 'uwbSp3')
    expect(markers).toHaveLength(ANCHORS + 1)
    for (const m of markers) {
      expect(m.bytes, `slot ${m.slot}`).toBe(0)
      expect(m.ies, `slot ${m.slot}`).toEqual([])
      expect(m.sp, `slot ${m.slot}`).toBe(3)
      expect(m.ns, `slot ${m.slot}`).toBe(NS.marker)
    }
    // the initiator's own is the first of them, and it is slot 1 — not slot 0, which has to carry
    // the slot table and therefore cannot be a marker at all
    expect(markers[0].slot).toBe(1)
    expect(markers[0].node).toBe(TAG_ID)
    expect(markers.slice(1).map((m) => m.node)).toEqual(PLACES.slice(0, ANCHORS).map((_p, i) => idOf(i)))
    // the chips the lesson prints, and the one segment a marker does not have
    expect(CHIPS.marker).toBe(uwbSp3Chips())
    expect(CHIPS.marker).toBe(UWB_SHR_CHIPS + UWB_STS_CHIPS)
    expect(CHIPS.phr).toBe(UWB_PHR_CHIPS)
    expect(NS.marker).toBe(uwbSp3Ns())
    expect(grp(CHIPS.marker)).toBe('70 368')
  })

  it('「身份来自时隙」: every record names the slot\'s own device, which no frame said', () => {
    const plan = roundPlan(uwbSp3Scenario().uwb!, ANCHORS)
    const owner = (slot: number): string => {
      const a = slotAction(plan, slot)
      return 'tx' in a && a.tx === 'tag' ? TAG_ID : idOf((a as { anchor: number }).anchor)
    }
    const marks = ofType(rs, 'UWB_SP3')
    // one per receiver per marker: every anchor hears the initiator's, and the tag hears each of
    // the anchors' — so 2A records for A anchors
    expect(marks).toHaveLength(2 * ANCHORS)
    for (const m of marks) {
      expect(m.peer, `${m.node} slot ${m.slot}`).toBe(owner(m.slot))
      expect(m.node, `${m.node} slot ${m.slot}`).not.toBe(m.peer)
    }
    // the tag's four are the four anchors, in slot order, and nothing in those frames said so
    expect(marks.filter((m) => m.node === TAG_ID).map((m) => m.peer))
      .toEqual(PLACES.slice(0, ANCHORS).map((_p, i) => idOf(i)))
    for (const f of air(rs).filter((x) => x.kind === 'uwbSp3')) expect(f.bytes).toBe(0)
  })

  it('「要等报告落地才算得出距离」: four ranges, all of them the tag\'s, all correct', () => {
    const ranges = ofType(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(ANCHORS)
    for (const r of ranges) {
      expect(r.node, r.peer).toBe(TAG_ID)
      expect(Math.abs(r.distM - r.trueDistM), `${r.peer}: ${r.distM} vs ${r.trueDistM}`)
        .toBeLessThan(RANGE_BUDGET_M)
    }
    // …and each one lands only after that responder's report frame, never in the ranging phase
    const lastMarker = Math.max(...ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'uwbSp3').map((r) => r.t))
    for (const r of ranges) expect(r.t, r.peer).toBeGreaterThan(lastMarker)
  })
})

describe('uwb-sp3 · the frame lengths, against the engine', () => {
  it('「一帧有多长」: every row of the table', () => {
    expect(BYTES.rcmSp3).toBe(uwbSp3PollBytes(ANCHORS))
    expect(BYTES.rcmSp3).toBe(uwbPollBytes(ANCHORS) + srrrIeBytes(ANCHORS))
    expect(BYTES.rcmSp3 - BYTES.rcmSp1).toBe(BYTES.srrrAll)
    expect(BYTES.srrrAll).toBe(ANCHORS * SRRR_IE_BYTES)
    expect(BYTES.srrrIe).toBe(UWB_IE_HDR_BYTES + 1)
    expect(BYTES.respDeferred).toBe(uwbRespBytes('ss', 'deferred'))
    expect(BYTES.respEmbedded).toBe(uwbRespBytes('ss', 'embedded'))
    expect(BYTES.report).toBe(UWB_SS_DEFER_BYTES)
    expect(BYTES.reportRaoa - BYTES.report).toBe(UWB_SP3_RAOA_ITEM_BYTES)
    expect(BYTES.initReport).toBe(uwbSp3InitReportBytes(ANCHORS))
    for (const [k, b] of [['report', BYTES.report], ['reportRaoa', BYTES.reportRaoa],
      ['initReport', BYTES.initReport], ['rcmSp3', BYTES.rcmSp3]] as const) {
      expect(NS[k as keyof typeof NS], k).toBe(uwbPpduNs(b as number))
    }
  })

  it('「省下的那一截」: both savings, and the multiple against each baseline', () => {
    expect(SAVE.shortest).toBe(uwbPpduNs(uwbRespBytes('ss', 'deferred')) - uwbSp3Ns())
    expect(SAVE.embedded).toBe(uwbPpduNs(uwbRespBytes('ss', 'embedded')) - uwbSp3Ns())
    // the shortest SP1 ranging frame this engine sends really is the deferred Response
    expect(BYTES.respDeferred).toBe(uwbRespBytes('ds'))
    expect(SAVE.embedded).toBeGreaterThan(SAVE.shortest)
    expect(us(SAVE.shortest)).toBe('40.256')
    expect(us(SAVE.embedded)).toBe('46.410')
    // the two multiples, each against the baseline the prose names for it (design §2.2)
    expect(MULT.embedded).toBe((NS.report / SAVE.embedded).toFixed(3))
    expect(MULT.shortest).toBe((NS.report / SAVE.shortest).toFixed(3))
    expect([MULT.embedded, MULT.shortest]).toEqual(['3.971', '4.578'])
  })

  it('「到第几个响应方才抵得过」: the arithmetic, and the crossover it predicts', () => {
    // the SRRR term is the MARGINAL cost of one responder's IE, which is what the note says
    expect(PAY.srrrPerResponder).toBe(uwbPpduNs(uwbSp3PollBytes(1)) - uwbPpduNs(uwbPollBytes(1)))
    expect(PAY.net).toBe(PAY.perResponder - PAY.srrrPerResponder)
    expect(us(PAY.net)).toBe('37.179')
    expect(PAY.responders).toBe((NS.marker / PAY.net).toFixed(2))
    expect(PAY.responders).toBe('3.79')
    // the crossover is SEARCHED against the round totals, and the arithmetic above predicts it
    expect(PAY.crossover).toBe(crossoverAnchors(false))
    expect(PAY.crossover).toBe(Math.ceil(NS.marker / PAY.net))
    expect(PAY.crossover).toBe(ANCHORS)
    expect(PAY.crossoverRrtt).toBe(crossoverAnchors(true))
    expect(PAY.crossoverRrtt).toBe(11)
    // both bits on is a third shape again, and the tryThis line prints ITS crossover rather than
    // reusing the RRTT-only one: every responder's report is a bearing item longer there
    expect(PAY.crossoverBoth).toBe(crossoverAnchors(true, true))
    expect(PAY.crossoverBoth).toBeGreaterThan(PAY.crossoverRrtt)
    expect(PAY.crossoverBoth).toBe(13)
    expect(sp3RoundNs(PAY.crossoverBoth - 1, true, true))
      .toBeGreaterThan(sp1DeferredRoundNs(PAY.crossoverBoth - 1))
    expect(sp3RoundNs(PAY.crossoverBoth, true, true))
      .toBeLessThan(sp1DeferredRoundNs(PAY.crossoverBoth))
    // …and it is a crossover in both directions, which is the half a threshold could fake
    expect(sp3RoundNs(PAY.crossover - 1, false)).toBeGreaterThan(sp1DeferredRoundNs(PAY.crossover - 1))
    expect(sp3RoundNs(PAY.crossover, false)).toBeLessThan(sp1DeferredRoundNs(PAY.crossover))
  })
})

describe('uwb-sp3 · the round totals, measured from rounds that ran', () => {
  /** The three shapes' formulas, against the air of a real round at every A the table prints. */
  it.each(SWEEP)('A = %i: all three shapes radiate exactly what the lesson computes', (a) => {
    const sp3 = roundNs(run(uwbSp3SweepScenario(a, 'sp3'), ONE_ROUND_NS))
    const rrtt = roundNs(run(uwbSp3SweepScenario(a, 'sp3-rrtt'), ONE_ROUND_NS))
    const def = roundNs(run(uwbSp3SweepScenario(a, 'deferred'), ONE_ROUND_NS))
    const emb = roundNs(run(uwbSp3SweepScenario(a, 'embedded'), ONE_ROUND_NS))
    expect(sp3).toBeCloseTo(sp3RoundNs(a, false), 6)
    expect(rrtt).toBeCloseTo(sp3RoundNs(a, true), 6)
    expect(def).toBeCloseTo(sp1DeferredRoundNs(a), 6)
    expect(emb).toBeCloseTo(sp1EmbeddedRoundNs(a), 6)
    // the two rows of the lesson's table, off the air rather than off the functions
    expect(sp3 - def).toBeCloseTo(GAP.vsDeferred[a - 1], 6)
    expect(sp3 - emb).toBeCloseTo(GAP.vsEmbedded[a - 1], 6)
    // against the embedded shape SP3 is longer at every A, and the gap strictly widens
    expect(sp3 - emb).toBeGreaterThan(0)
    if (a > 1) expect(GAP.vsEmbedded[a - 1]).toBeGreaterThan(GAP.vsEmbedded[a - 2])
    // against the deferred shape the sign is what the crossover says it is
    expect(sp3 - def > 0, `A=${a}`).toBe(a < PAY.crossover)
  })

  it(`「三种轮形，同一个场景」: the ${ANCHORS}-anchor row of each, and the 1.600 µs the base scene is`, () => {
    expect(roundNs(run(uwbSp3Scenario(), ONE_ROUND_NS))).toBeCloseTo(ROUND.sp3, 6)
    expect(roundNs(run(uwbSp1Scenario('deferred'), ONE_ROUND_NS))).toBeCloseTo(ROUND.deferred, 6)
    expect(roundNs(run(uwbSp1Scenario('embedded'), ONE_ROUND_NS))).toBeCloseTo(ROUND.embedded, 6)
    // the third variant turns BOTH request bits on, so its round is RRTT's extra frame AND a
    // bearing item in every report — not `sp3Rrtt`, which is the RRTT-only shape the crossover
    // search uses. The lesson's own tryThis line prints this one.
    expect(roundNs(run(uwbSp3Scenario({ raoa: true, rrtt: true }), ONE_ROUND_NS)))
      .toBeCloseTo(ROUND.sp3Both, 6)
    expect(ROUND.sp3Both - ROUND.sp3Rrtt).toBeCloseTo(ANCHORS * (NS.reportRaoa - NS.report), 6)
    expect([us(ROUND.embedded), us(ROUND.deferred), us(ROUND.sp3), us(ROUND.sp3Both)])
      .toEqual(['956.347', '1668.911', '1667.311', '1889.552'])
    // the observe line: the base scene sits 1.600 µs the right side of the deferred round
    expect(us(Math.abs(GAP.vsDeferred[ANCHORS - 1]))).toBe('1.600')
    expect(GAP.vsDeferred[ANCHORS - 1]).toBeLessThan(0)
    // and the tryThis line: with both request bits on it is longer again
    expect(us(ROUND.sp3Both - ROUND.deferred)).toBe('220.641')
  })

  it('「报告相位 … 整轮最长的一段」: the figure sums to the round, phase by phase', () => {
    const rs = run(uwbSp3Scenario(), ONE_ROUND_NS)
    const byKind = (k: string): number => air(rs).filter((f) => f.kind === k).reduce((n, f) => n + f.ns, 0)
    expect(byKind('uwbPoll')).toBeCloseTo(PHASE.rcm, 6)
    expect(byKind('uwbSp3')).toBeCloseTo(PHASE.ranging, 6)
    expect(byKind('uwbSsDefer')).toBeCloseTo(PHASE.report, 6)
    expect(PHASE.rcm + PHASE.ranging + PHASE.report).toBeCloseTo(ROUND.sp3, 6)
    // the report phase is the largest of the three, which is the whole point of the figure
    expect(PHASE.report).toBeGreaterThan(PHASE.ranging)
    expect(PHASE.report).toBeGreaterThan(PHASE.rcm)
    const fig = uwbSp3Fields()
    expect(fig.unit).toBe('µs')
    expect(fig.fields).toHaveLength(3)
    expect(fig.fields.reduce((n, f) => n + f.size, 0)).toBeCloseTo(ROUND.sp3 / 1000, 3)
    for (const s of diagramTexts(fig)) expect(s.trim().length, s).toBeGreaterThan(0)
  })
})

describe('uwb-sp3 · both SRRR request bits really change the air', () => {
  const off = run(uwbSp3Scenario(), ONE_ROUND_NS)
  const on = run(uwbSp3Scenario({ raoa: true, rrtt: true }), ONE_ROUND_NS)

  it(`RAOA: the report frame grows by exactly ${BYTES.raoaItem} octets, and a bearing arrives`, () => {
    const reports = (rs: TLRecord[]) => air(rs).filter((f) => f.kind === 'uwbSsDefer')
    expect(reports(off).map((f) => f.bytes)).toEqual(Array(ANCHORS).fill(BYTES.report))
    expect(reports(on).map((f) => f.bytes)).toEqual(Array(ANCHORS).fill(BYTES.reportRaoa))
    expect(reports(off)[0].ns).toBe(NS.report)
    expect(reports(on)[0].ns).toBe(NS.reportRaoa)
    expect(reports(on)[0].ies).toEqual(['RRTI', 'RAOA'])
    expect(reports(off)[0].ies).toEqual(['RRTI'])
    // the octets are not empty: the bearing arrives exactly when the bit asked for it
    const atTag = (rs: TLRecord[]) => ofType(rs, 'UWB_SP3_REPORT').filter((r) => r.node === TAG_ID)
    expect(atTag(on)).toHaveLength(ANCHORS)
    for (const r of atTag(on)) expect(r.thetaDeg, r.peer).toBeTypeOf('number')
    for (const r of atTag(off)) expect(r.thetaDeg, r.peer).toBeUndefined()
  })

  it('RRTT: the initiator sends a report frame of its own, in a slot only this shape has', () => {
    expect(air(off).some((f) => f.node === TAG_ID && f.kind === 'uwbReport')).toBe(false)
    const mine = air(on).filter((f) => f.node === TAG_ID && f.kind === 'uwbReport')
    expect(mine).toHaveLength(1)
    expect(mine[0].bytes).toBe(BYTES.initReport)
    expect(mine[0].ns).toBe(NS.initReport)
    // it opens the report phase, in the slot the extra one is
    expect(mine[0].slot).toBe(ANCHORS + 2)
    expect(air(on)).toHaveLength(SLOTS.sp3Rrtt)
    expect(air(off)).toHaveLength(SLOTS.sp3)
    // and it is answered: every responder reads its own round trip out of that one frame
    const rtt = ofType(on, 'UWB_SP3_REPORT').filter((r) => r.roundTripRctu !== undefined)
    expect(rtt.map((r) => r.node).sort()).toEqual(PLACES.slice(0, ANCHORS).map((_p, i) => idOf(i)))
    for (const r of rtt) expect(r.peer).toBe(TAG_ID)
    expect(ofType(off, 'UWB_SP3_REPORT').filter((r) => r.roundTripRctu !== undefined)).toHaveLength(0)
    // the frame grows with the responder count, which is why the crossover moves
    expect(uwbSp3InitReportBytes(ANCHORS + 1)).toBeGreaterThan(BYTES.initReport)
  })

  it('「请求不是免费的」: the RCM is 3A octets longer, where §10.36\'s request adds none', () => {
    const rcm = (rs: TLRecord[]): number => air(rs).find((f) => f.slot === 0)!.bytes
    expect(rcm(off)).toBe(BYTES.rcmSp3)
    expect(rcm(on)).toBe(BYTES.rcmSp3)
    // the request bits do not change the RCM's length — the IEs' PRESENCE does, and they are there
    // whenever `sp3` is on, one per responder
    expect(rcm(off) - rcm(run(uwbSp1Scenario('deferred'), ONE_ROUND_NS))).toBe(srrrIeBytes(ANCHORS))
    expect(srrrIeBytes(ANCHORS)).toBe(BYTES.srrrAll)
    // which is why the table's row is about what the IEs cost and NOT about turning the bits off:
    // an SP3 round with both bits clear carries the same 3A octets of SRRR IEs as one with both set
    expect(rcm(on)).toBe(rcm(off))
    // one 'SRRR' label in the frame's own IE list, A entries' worth of octets in its length: the
    // frame inspector is what expands it into one row per responder (uwb/frameFields.ts).
    expect(air(off).find((f) => f.slot === 0)!.ies).toEqual(['ARC', 'RDM', 'RRMC', 'SRRR'])
  })
})

describe('uwb-sp3 · the base run the fixture replays', () => {
  const rs = runOf(uwbSp3, undefined, RUN_NS)

  it('runs the same round in every block, seven of them', () => {
    const blocks = [...new Set(ofType(rs, 'UWB_ROUND').map((r) => r.block))].sort((a, b) => a - b)
    expect(blocks).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(ofType(rs, 'UWB_SP3')).toHaveLength(7 * 2 * ANCHORS)
    expect(ofType(rs, 'UWB_SP3_REPORT')).toHaveLength(7 * ANCHORS)
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(7 * ANCHORS)
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('every jump the lesson offers lands on the frame it names', () => {
    const at = (i: number) => ofType(rs, 'TX_START').filter(uwbSp3.jumps[i].find)
    // 0: the round's first frame is the control message, and it cannot be a marker
    expect(at(0)[0].frame.kind).toBe('uwbPoll')
    expect(at(0)[0].frame.bytes).toBe(BYTES.rcmSp3)
    expect(at(0)[0].frame.uwb?.slot).toBe(0)
    // 1: the initiator's own marker, slot 1, 0 octets
    expect(at(1)[0].frame.kind).toBe('uwbSp3')
    expect(at(1)[0].node).toBe(TAG_ID)
    expect(at(1)[0].frame.uwb?.slot).toBe(1)
    expect(at(1)[0].frame.bytes).toBe(0)
    // 2: the first responder's marker, one slot later
    expect(at(2)[0].node).toBe(idOf(0))
    expect(at(2)[0].frame.uwb?.slot).toBe(2)
    // 3: the report phase's first frame; 5: the first marker of either end is the initiator's
    expect(at(3)[0].frame.kind).toBe('uwbSsDefer')
    expect(at(3)[0].frame.uwb?.slot).toBe(ANCHORS + 2)
    expect(at(5)[0]).toEqual(at(1)[0])
    // 4: the first range, which is a record rather than a transmission
    expect(ofType(rs, 'UWB_RANGE').some(uwbSp3.jumps[4].find)).toBe(true)
  })
})
