/**
 * Every empirical claim in "Two round trips cancel the clock", measured against
 * the lesson's own scenario and its variant. Each assertion quotes the sentence
 * it guards, copied from the shipped string; formulas, frame sizes, IE rows and
 * session constants come from the engine's own exports (src/uwb/ranging.ts,
 * src/uwb/phy.ts, src/uwb/session.ts, src/uwb/frames.ts, src/uwb/frameFields.ts,
 * src/uwb/clock.ts) rather than being re-typed here.
 *
 * The lesson was rewritten to the zero-to-hero contract, so the shape checks
 * come from tests/course/kit.ts and the pins moved with their sentences: the
 * clauses and the model widths are in `sources`, the counters, the two lanes,
 * the Final's growth and the obstructed path are in `deeper`, and the per-slot
 * noise is a table in `numbers`.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbDstwr, uwbDstwrScenario } from '../../src/course/uwb/uwb-dstwr'
import { uwbSstwrScenario } from '../../src/course/uwb/uwb-sstwr'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'
import type { Block } from '../../src/course/lessonKit'
import type { SequenceSpec } from '../../src/course/diagram'
import { lessonTexts, paragraphTexts } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { dsTwr, metresToNs, rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  C_M_PER_NS, COUNTER_BITS, RCTU_NS, RMI_REPORT_IE_BYTES, RRTI_IE_BYTES, RS_BLOCK_BITS, UWB_FCS_BYTES,
  UWB_MHR_BYTES, UWB_NLOS_NS, UWB_PPM_MAX, UWB_REPORT_BYTES, rmiFinalIeBytes, uwbFinalBytes, uwbPollBytes,
  uwbPpduNs, uwbRespBytes,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { STRINGS } from '../../src/ui/i18n'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** The ring the scene is built on: every anchor is exactly this far from the tag. */
const RING_M = 3.5
const ANCHORS = 4

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The section budgets are gone; a lesson is as long as its one topic needs, under
// the 30-minute ceiling (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md).
lessonShapeSuite(uwbDstwr, { runNs: RUN_NS })

/** The scenario each part of the lesson runs: the base, then variant 0. */
const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbDstwr.scenario() : uwbDstwr.variants![variant].scenario()
function ppmOf(variant?: number): { tag: number; anchors: number } {
  const nodes = scenarioOf(variant).nodes
  return {
    tag: nodes.find((n) => n.uwb!.role === 'tag')!.uwb!.ppm!,
    anchors: nodes.find((n) => n.uwb!.role === 'anchor')!.uwb!.ppm!,
  }
}
/** The session's noise model and slot length, likewise read back rather than re-typed. */
const SESSION = uwbDstwr.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

/**
 * 1-σ of one DS-TWR range from the session's timestamp noise. Three noisy
 * receive stamps enter the result — the anchor's of the Poll, the phone's of
 * the Response, the anchor's of the Final — with sensitivities r2/S, ½ and
 * r1/S, where r1 and r2 are the two reply times and S their total, the whole
 * round measured twice. (The "Range noise, 1-σ" column: 1.9 cm in slots 1 and
 * 4, 1.8 cm in slots 2 and 3.)
 */
function dsSigmaM(slot: number): number {
  const r1 = slot * PLAN.slotNs
  const r2 = (ANCHORS + 1 - slot) * PLAN.slotNs
  const s = 2 * (r1 + r2)
  return Math.hypot(r2 / s, 0.5, r1 / s) * (SESSION.tsNoisePs / 1000) * C_M_PER_NS
}

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbDstwr, variant, RUN_NS)
const seedMemo = new Map<number, TLRecord[]>()
/** The base scene replayed on another seed: same geometry, same crystals, new noise draws. */
function seeded(seed: number): TLRecord[] {
  if (!seedMemo.has(seed)) {
    seedMemo.set(seed, [...new Simulation({ ...scenarioOf(), seed }).runUntil(RUN_NS).records])
  }
  return seedMemo.get(seed)!
}

const ranges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE')
const tagRanges = (variant?: number) => ranges(variant).filter((r) => r.node === 'tag-1')
const anchorRanges = (variant?: number) => ranges(variant).filter((r) => r.node.startsWith('anchor'))
/** The one Final of a run, as the engine built it. */
const finalFrame = (rs: TLRecord[]): FrameDesc =>
  ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!.frame

/** One ranging counter, found by the lane, the direction and the frame it stamps. */
function stamp(rs: TLRecord[], node: string, dir: 'tx' | 'rx', frameKind: string, peer?: string): number {
  const r = ofType(rs, 'UWB_TS').find((x) =>
    x.node === node && x.dir === dir && x.frameKind === frameKind && (peer === undefined || x.peer === peer))
  if (!r) throw new Error(`no ${dir} ${frameKind} stamp on ${node}`)
  return r.counter
}

/** The four times of one anchor's double-sided exchange, read off the UWB_TS records. */
function fourTimes(anchorId: string, rs: TLRecord[] = recs()): {
  tround1: number; treply1: number; tround2: number; treply2: number
} {
  const txPoll = stamp(rs, 'tag-1', 'tx', 'uwbPoll')
  const txFinal = stamp(rs, 'tag-1', 'tx', 'uwbFinal')
  const rxResp = stamp(rs, 'tag-1', 'rx', 'uwbResp', anchorId)
  const rxPoll = stamp(rs, anchorId, 'rx', 'uwbPoll')
  const txResp = stamp(rs, anchorId, 'tx', 'uwbResp')
  const rxFinal = stamp(rs, anchorId, 'rx', 'uwbFinal')
  return {
    tround1: counterDiff(rxResp, txPoll),
    treply1: counterDiff(txResp, rxPoll),
    tround2: counterDiff(rxFinal, txResp),
    treply2: counterDiff(txFinal, rxResp),
  }
}

/** The lesson's nth table of `numbers`, rows kept in place so a cell is checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbDstwr.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbDstwr.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
const numbersProse = (): string => paragraphTexts(uwbDstwr.numbers!).map((p) => p).join('\n')
const deeperProse = (): string => paragraphTexts(uwbDstwr.deeper!).map((p) => p).join('\n')
/** Everything the learner reads on the main path, joined — for "is this number printed?" checks. */
const prose = (): string => [
  numbersProse(),
  ...paragraphTexts(uwbDstwr.picture!).map((p) => p),
  ...uwbDstwr.observe.map((s) => s), ...uwbDstwr.tryThis.map((s) => s),
  ...uwbDstwr.quiz.flatMap((q) => [q.q, ...q.options.map((o) => o), q.explain]),
].join('\n')

/**
 * The `sequence` figure §4 asks of this lesson (Poll、四个 Response、Final、四份
 * Report). Its geometry is checked course-wide in tests/course/diagram.test.ts;
 * what belongs here is that every instant in its gutter and the one distance it
 * prints are this run's own.
 */
describe('uwb-dstwr · the figure', () => {
  const fig = (): SequenceSpec => {
    const b = uwbDstwr.picture!.find((x): x is Extract<Block, { kind: 'diagram' }> => x.kind === 'diagram')!
    expect(b.spec.kind).toBe('sequence')
    return b.spec as SequenceSpec
  }
  const ms = (ns: number): string => `${(ns / 1e6).toFixed(3)} ms`

  it('is the lesson’s one figure, and it sits where the walked paragraph used to', () => {
    expect(uwbDstwr.picture!.filter((b) => b.kind === 'diagram')).toHaveLength(1)
    expect((uwbDstwr.numbers ?? []).filter((b) => b.kind === 'diagram')).toHaveLength(0)
    // after the watch that sends the reader to the Final, so every name on it has been met
    expect(uwbDstwr.picture!.findIndex((b) => b.kind === 'diagram'))
      .toBeGreaterThan(uwbDstwr.picture!.findIndex((b) => b.kind === 'watch'))
    expect(fig().columns.map((c) => c.id)).toEqual(['tag-1', 'anchor-1', 'rest'])
    // the two real column ids are scenario nodes; `rest` stands for the other three anchors
    const ids = uwbDstwr.scenario().nodes.map((n) => n.id)
    expect(ids).toContain('tag-1')
    expect(ids).toContain('anchor-1')
    expect(ids.filter((i) => i.startsWith('anchor')).length - 1).toBe(3)
  })

  it('every instant in the gutter is the run’s own, in the order the run produces them', () => {
    const tx = ofType(recs(), 'TX_START')
    const at = (kind: string, node?: string): number =>
      tx.find((r) => r.frame.kind === kind && (node === undefined || r.node === node))!.t
    expect(FIG.poll).toBe(`${at('uwbPoll') / 1e6} ms`)
    expect(FIG.resp1).toBe(`${at('uwbResp', 'anchor-1') / 1e6} ms`)
    expect(FIG.final).toBe(`${at('uwbFinal') / 1e6} ms`)
    expect(FIG.report1).toBe(`${at('uwbReport', 'anchor-1') / 1e6} ms`)
    // the other three answer in slots 2–4 and report in slots 7–9
    const resp = tx.filter((r) => r.frame.kind === 'uwbResp').map((r) => r.t / 1e6)
    const rep = tx.filter((r) => r.frame.kind === 'uwbReport').map((r) => r.t / 1e6)
    expect(FIG.respRest).toBe(`${resp[1]}–${resp[3]} ms`)
    expect(FIG.reportRest).toBe(`${rep[1]}–${rep[3]} ms`)
    // the two self-messages: the anchor finishes when the Final lands, the phone at the report
    expect(FIG.anchorRange).toBe(ms(anchorRanges().find((r) => r.node === 'anchor-1')!.t))
    expect(FIG.tagRange).toBe(ms(tagRanges().find((r) => r.peer === 'anchor-1')!.t))
    expect(FIG.anchorRange).toBe('10.237 ms')
    expect(FIG.tagRange).toBe('12.191 ms')
    // and both print the same distance, which is the one number on the figure
    const a1 = anchorRanges().find((r) => r.node === 'anchor-1')!
    const t1 = tagRanges().find((r) => r.peer === 'anchor-1')!
    expect(FIG.rangeM).toBe(`${a1.distM.toFixed(2)} m`)
    expect(a1.tofRctu).toBe(t1.tofRctu)
  })

  it('the eight messages are the ten frames of the round, grouped, in time order', () => {
    const msgs = fig().messages
    expect(msgs).toHaveLength(8)
    expect(msgs.map((m) => m.label)).toEqual([
      'Poll', 'Response', 'Response ×3', 'Final', `算出 ${FIG.rangeM}`, 'Report', `同一个 ${FIG.rangeM}`, 'Report ×3',
    ])
    // 1 Poll + 4 Responses + 1 Final + 4 Reports = the ten slots the round has
    expect(1 + 4 + 1 + 4).toBe(PLAN.slots)
    expect(ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)).toHaveLength(PLAN.slots)
    // the accent is on the Final, which is the message this lesson exists for
    expect(msgs.filter((m) => m.tone === 'accent').map((m) => m.label)).toEqual(['Final'])
  })
})

describe('uwb-dstwr · the lesson’s own place in the track', () => {
  it('is the fourth lesson of the UWB track and needs the single-sided one', () => {
    expect(MODULES[uwbDstwr.module].title).toBe('两只钟')
    expect(uwbDstwr.id).toBe('uwb-dstwr')
    expect(uwbDstwr.needs).toEqual(['uwb-sstwr'])
    expect(uwbDstwr.terms!.map((t) => t.term)).toEqual(['DS-TWR', 'Final', 'Report', 'RMI'])
  })

  it('it offers five jumps, three things to observe, two experiments and three questions', () => {
    expect(uwbDstwr.jumps).toHaveLength(5)
    expect(uwbDstwr.observe).toHaveLength(3)
    expect(uwbDstwr.tryThis).toHaveLength(2)
    expect(uwbDstwr.quiz).toHaveLength(3)
    for (const q of uwbDstwr.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('the jumps occur in the order the list gives them, and the anchor lane finishes first', () => {
    const rs = recs()
    const at: number[] = []
    for (const j of uwbDstwr.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      at.push(i)
    }
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // "an anchor computes the range" is on an anchor lane, and it precedes "the first measurement report"
    const anchorJump = rs[at[2]]
    expect(anchorJump.type).toBe('UWB_RANGE')
    if (anchorJump.type !== 'UWB_RANGE') throw new Error('unreachable')
    expect(anchorJump.node.startsWith('anchor')).toBe(true)
    expect(anchorJump.t).toBeLessThan(rs[at[3]].t)
  })

  it('names the standard clauses it leans on, and the model numbers are the engine’s', () => {
    // the provenance that used to open the lesson, now in `sources`
    const src = uwbDstwr.sources!.map((s) => s).join('\n')
    for (const s of ['IEEE Std 802.15.4-2024', '§10.29.1.2.4', '§10.32.5', '§16.4.9']) {
      expect(src, s).toContain(s)
    }
    for (const s of ['100 ps', 'FiRa']) expect(src, s).toContain(s)
    expect(SESSION.tsNoisePs).toBe(100)
    expect(PLAN.slotNs).toBe(2 * MS)
    // "the Final’s RMI is 3 + 6N octets, one reply-time field 6, a report’s RMI 13"
    for (const n of [3, 4, 5]) expect(rmiFinalIeBytes(n), `RMI ${n}`).toBe(3 + 6 * n)
    expect(RRTI_IE_BYTES).toBe(6)
    expect(RMI_REPORT_IE_BYTES).toBe(13)
    // "the 40-bit ranging counter, where the standard asks for at least 32"
    expect(COUNTER_BITS).toBe(40)
    expect(COUNTER_BITS).toBeGreaterThanOrEqual(32)
  })
})

describe('uwb-dstwr · the scene', () => {
  it('is the previous lesson’s scene: four anchors on a 3.50 m ring, all at 2.20 m', () => {
    // picture: "The scene is unchanged" — the numbers behind it, which the picture no longer prints
    const s = uwbDstwr.scenario()
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(s.nodes.map((n) => n.id)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4', 'tag-1'])
    expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'tag'])
    expect(s.nodes.every((n) => n.pos.z === 2.2)).toBe(true)
    const t = s.nodes[4].pos
    expect([t.x, t.y]).toEqual([5, 4])
    for (const a of s.nodes.slice(0, 4)) {
      expect(Math.hypot(a.pos.x - t.x, a.pos.y - t.y, a.pos.z - t.z), a.id).toBeCloseTo(RING_M, 12)
    }
    // no AP, no stations, no Wi-Fi traffic at all
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    expect(s.servers).toEqual([])
    expect(s.uwb).toMatchObject({ method: 'ds', nlos: false, slotRstu: 2400, tsNoisePs: 100 })
    expect(() => ScenarioSchema.parse(uwbDstwr.scenario())).not.toThrow()
    for (const v of uwbDstwr.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('is the single-sided lesson’s scene to the letter: only the TWR method differs', () => {
    // The lesson modules may not import each other's lessons, so this is the one place the two
    // coordinate lists are held together.
    const sameBut = (s: Scenario): string => JSON.stringify({ ...s, uwb: { ...s.uwb!, method: 'ss' } })
    for (const p of [{ tag: 10, anchors: -10 }, { tag: 20, anchors: -20 }]) {
      expect(sameBut(uwbDstwrScenario(p)), JSON.stringify(p)).toBe(sameBut(uwbSstwrScenario(p)))
    }
    expect(uwbDstwrScenario({ tag: 10, anchors: -10 }).uwb!.method).toBe('ds')
    expect(uwbSstwrScenario({ tag: 10, anchors: -10 }).uwb!.method).toBe('ss')
  })

  it('the base run is the phone 10 ppm fast against anchors 10 ppm slow', () => {
    expect(ppmOf()).toEqual({ tag: 10, anchors: -10 })
    expect(uwbDstwr.scenario().nodes.map((n) => n.uwb!.ppm)).toEqual([-10, -10, -10, -10, 10])
    expect(uwbDstwr.scenario()).toEqual(uwbDstwrScenario({ tag: 10, anchors: -10 }))
  })

  it('the variant doubles both crystal offsets to the ±20 ppm the standard allows, and nothing else', () => {
    // try-this 1: "Load "Worst-case crystals, ±20 ppm", which doubles both offsets and nothing else."
    expect(uwbDstwr.variants).toHaveLength(1)
    expect(ppmOf(0)).toEqual({ tag: 20, anchors: -20 })
    expect(Math.abs(ppmOf(0).tag)).toBe(UWB_PPM_MAX)
    expect(ppmOf(0).tag).toBe(2 * ppmOf().tag)
    expect(ppmOf(0).anchors).toBe(2 * ppmOf().anchors)
    expect(uwbDstwr.variants![0].scenario()).toEqual(uwbDstwrScenario({ tag: 20, anchors: -20 }))
    const strip = (s: Scenario): string =>
      JSON.stringify({ ...s, nodes: s.nodes.map((n) => ({ ...n, uwb: { role: n.uwb!.role } })) })
    expect(strip(uwbDstwr.variants![0].scenario())).toEqual(strip(uwbDstwr.scenario()))
  })
})

describe('uwb-dstwr · ten slots and the frames that fill them', () => {
  it('a DS round is 2N + 2 slots: ten of 2 ms, ending at 20 000 000 ns', () => {
    // picture: "a round of four anchors takes ten slots where it took five" / observe 1: "The round
    //  line reads "10 slots × 2000.0 µs" and ends at 20 000 000 ns — twice the round of the lesson
    //  before, for the same anchors."
    expect(PLAN.slots).toBe(2 * ANCHORS + 2)
    expect(PLAN.slots).toBe(10)
    expect(roundPlan({ ...SESSION, method: 'ss' }, ANCHORS).slots).toBe(ANCHORS + 1)
    expect(PLAN.slotNs).toBe(2 * MS)
    expect(PLAN.roundNs).toBe(20 * MS)
    const round = ofType(recs(), 'UWB_ROUND')
    expect(round).toHaveLength(1)
    expect(round[0]).toMatchObject({ method: 'ds', slots: 10, slotNs: 2 * MS, untilNs: 20 * MS })
    expect(fmtRecord(round[0])).toBe('tag-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs')
    expect(uwbDstwr.observe[0]).toContain('10 slots × 2000.0 µs')
    expect(ofType(recs(), 'UWB_SLOT').map((r) => r.t))
      .toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18].map((ms) => ms * MS))
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('poll, four responses, the Final in slot 5 at 10 ms, four reports', () => {
    // the steps block's order, and observe 2: "The Final sits alone in the middle of the round, at
    //  10 ms: one frame for every anchor, after the last response and before the first report."
    expect(ofType(recs(), 'TX_START').map((r) => `${r.node}/${r.frame.kind}@${r.t / MS}`)).toEqual([
      'tag-1/uwbPoll@0',
      'anchor-1/uwbResp@2', 'anchor-2/uwbResp@4', 'anchor-3/uwbResp@6', 'anchor-4/uwbResp@8',
      'tag-1/uwbFinal@10',
      'anchor-1/uwbReport@12', 'anchor-2/uwbReport@14', 'anchor-3/uwbReport@16', 'anchor-4/uwbReport@18',
    ])
    expect(finalFrame(recs()).uwb!.slot).toBe(5)
    // "in the middle": as many slots before it as after it
    expect(finalFrame(recs()).uwb!.slot * PLAN.slotNs).toBe(PLAN.roundNs / 2)
  })

  it('the frame table’s cells are the engine’s own octets and airtimes, row by row', () => {
    // "Ten slots, and what fills them": Frame / Count / Octets / Airtime each
    const rows: [string, number, number][] = [
      ['Poll', uwbPollBytes(ANCHORS), 1],
      ['Response', uwbRespBytes('ds'), ANCHORS],
      ['Final', uwbFinalBytes(ANCHORS), 1],
      ['Report', UWB_REPORT_BYTES, ANCHORS],
    ]
    expect(rows.map((r) => r[1])).toEqual([39, 14, 62, 24])
    expect(rows.map((r) => uwbPpduNs(r[1]))).toEqual([206_859, 181_218, 236_603, 191_474])
    rows.forEach(([label, octets, count], i) => {
      expect(cell(1, i, 0), `${label} name`).toBe(label)
      expect(cell(1, i, 1), `${label} count`).toBe(String(count))
      expect(cell(1, i, 2), `${label} octets`).toBe(String(octets))
      expect(cell(1, i, 3), `${label} airtime`).toBe(`${(uwbPpduNs(octets) / 1000).toFixed(2)} µs`)
    })
    // its last row: Round total, 10 slots, 253 octets, 1 934.23 µs
    const octets = rows.reduce((sum, [, b, n]) => sum + b * n, 0)
    expect(octets).toBe(253)
    const airtime = ofType(recs(), 'TX_START').reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect(airtime).toBe(206_859 + 4 * 181_218 + 236_603 + 4 * 191_474)
    expect(airtime).toBe(1_934_230)
    expect(cell(1, 4, 1)).toBe(String(PLAN.slots))
    expect(cell(1, 4, 2)).toBe(String(octets))
    expect(cell(1, 4, 3)).toBe('1 934.23 µs')
    expect((airtime / 1000).toFixed(2)).toBe('1934.23')
  })

  it('the round radiates 9.67 % of its 20 ms, against 9.56 % for the single-sided round', () => {
    // "1 934.23 µs of radiation inside a 20 000 µs round is 9.67 %, against 9.56 % for the
    //  single-sided round of the lesson before."
    const airtime = ofType(recs(), 'TX_START').reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect((airtime / PLAN.roundNs * 100).toFixed(2)).toBe('9.67')
    const ssPlan = roundPlan({ ...SESSION, method: 'ss' }, ANCHORS)
    const ssAir = uwbPpduNs(uwbPollBytes(ANCHORS)) + ANCHORS * uwbPpduNs(uwbRespBytes('ss'))
    expect((ssAir / ssPlan.roundNs * 100).toFixed(2)).toBe('9.56')
    expect(ssPlan.roundNs).toBe(10 * MS)
    // the picture's claim that the share "barely moves": under a tenth of a point apart
    expect(Math.abs(airtime / PLAN.roundNs - ssAir / ssPlan.roundNs) * 100).toBeLessThan(0.2)
  })

  it('the Final is the largest frame and the one that grows fastest: 14 + 12N against the Poll’s 27 + 3N', () => {
    // deeper: "14 + 12N octets against the Poll’s 27 + 3N — 62 here, 496 bits, two Reed–Solomon
    //  blocks … A fifth anchor would add 12 octets to the Final and two slots, 4 ms, to the round."
    const sizes = [uwbPollBytes(ANCHORS), uwbRespBytes('ds'), uwbFinalBytes(ANCHORS), UWB_REPORT_BYTES]
    expect(Math.max(...sizes)).toBe(uwbFinalBytes(ANCHORS))
    expect(uwbFinalBytes(ANCHORS)).toBe(62)
    for (const n of [3, 4, 5]) {
      expect(uwbFinalBytes(n), `final ${n}`).toBe(14 + 12 * n)
      expect(uwbPollBytes(n), `poll ${n}`).toBe(27 + 3 * n)
    }
    // the Poll grows too — 3 octets an anchor — but the Final grows four times faster
    expect(uwbPollBytes(5) - uwbPollBytes(4)).toBe(3)
    expect(uwbFinalBytes(5) - uwbFinalBytes(4)).toBe(12)
    // the Response and the report do not grow at all
    expect(uwbRespBytes('ds')).toBe(14)
    expect(UWB_REPORT_BYTES).toBe(24)
    expect(8 * uwbFinalBytes(ANCHORS)).toBe(496)
    expect(Math.ceil(496 / RS_BLOCK_BITS)).toBe(2)
    const five = roundPlan(SESSION, 5)
    expect(five.slots - PLAN.slots).toBe(2)
    expect(five.roundNs - PLAN.roundNs).toBe(4 * MS)
  })

  it('the Final’s five IE rows are an RMI of 27 and four reply-time fields of 6', () => {
    // try-this 2: "an RMI listing four anchors, then one short field per anchor holding the
    //  phone’s second interval. Then open a report: one RMI with the anchor’s two."
    const final = finalFrame(recs())
    expect(final.bytes).toBe(62)
    const fields = uwbFrameFields(final).users[0].subframes[0].mpdu.fields
    const ies = fields.filter((f) => f.key.startsWith('ie')).map((f) => ({ key: f.key, bytes: f.bytes }))
    expect(ies).toEqual([
      { key: 'ieRmi', bytes: 27 },
      ...Array.from({ length: ANCHORS }, () => ({ key: 'ieRrti', bytes: RRTI_IE_BYTES })),
    ])
    expect(ies[0].bytes).toBe(rmiFinalIeBytes(ANCHORS))
    expect(ies.filter((x) => x.key === 'ieRrti')).toHaveLength(ANCHORS)
    // one reply time per row, named for the anchor it belongs to
    fields.filter((f) => f.key === 'ieRrti').forEach((f, i) => {
      const head = STRINGS.frameDetail.fields.uwbValue.finalReply(`anchor-${i + 1}`, '')
      expect(f.value!.startsWith(head)).toBe(true)
    })
    expect(UWB_MHR_BYTES + 27 + ANCHORS * RRTI_IE_BYTES + UWB_FCS_BYTES).toBe(62)
    // "Then open a report: one RMI with the anchor’s two."
    const report = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbReport')!.frame
    expect(report.bytes).toBe(UWB_REPORT_BYTES)
    const rIes = uwbFrameFields(report).users[0].subframes[0].mpdu.fields
      .filter((f) => f.key.startsWith('ie')).map((f) => ({ key: f.key, bytes: f.bytes }))
    expect(rIes).toEqual([{ key: 'ieRmi', bytes: RMI_REPORT_IE_BYTES }])
    expect(UWB_MHR_BYTES + RMI_REPORT_IE_BYTES + UWB_FCS_BYTES).toBe(UWB_REPORT_BYTES)
  })

  it('the Final carries each anchor’s round trip and the phone’s own wait', () => {
    // the procedure's steps 4 and 6: "The phone stamps one Final leaving and writes into it, per
    //  anchor that answered, that round trip and Treply2 … the two only it could measure." /
    //  "Each anchor then sends a Report carrying its own two."
    const u = finalFrame(recs()).uwb!
    expect(u.ies).toEqual(['RMI', 'RRTI'])
    expect(u.finalTimes).toHaveLength(ANCHORS)
    u.finalTimes!.forEach((e, i) => {
      const id = `anchor-${i + 1}`
      expect(e.id).toBe(id)
      const t = fourTimes(id)
      expect(e.tround1, `${id} tround1`).toBe(t.tround1)
      expect(e.treply2, `${id} treply2`).toBe(t.treply2)
    })
    // and the report carries the anchor's own two
    const rep = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbReport')!.frame.uwb!
    expect(rep.ies).toEqual(['RMI'])
    expect(rep.reportTimes).toEqual({
      treply1: fourTimes('anchor-1').treply1, tround2: fourTimes('anchor-1').tround2,
    })
  })
})

describe('uwb-dstwr · the four times', () => {
  it('anchor 1 stamps three counters that give its two intervals; the phone’s pair gives the others', () => {
    // deeper: "Anchor 1 stamps 26 381 597 885, 26 509 391 059 and 27 020 567 485, giving Treply1 =
    //  127 793 174 and Tround2 = 511 176 426 RCTU. The phone’s pair for it is Tround1 =
    //  127 797 230 and Treply2 = 511 185 160."
    const a1 = ofType(recs(), 'UWB_TS').filter((r) => r.node === 'anchor-1')
    expect(a1.map((r) => `${r.dir}/${r.frameKind}`))
      .toEqual(['rx/uwbPoll', 'tx/uwbResp', 'rx/uwbFinal', 'tx/uwbReport'])
    expect([
      stamp(recs(), 'anchor-1', 'rx', 'uwbPoll'),
      stamp(recs(), 'anchor-1', 'tx', 'uwbResp'),
      stamp(recs(), 'anchor-1', 'rx', 'uwbFinal'),
    ]).toEqual([26_381_597_885, 26_509_391_059, 27_020_567_485])
    expect(fourTimes('anchor-1')).toEqual({
      tround1: 127_797_230, treply1: 127_793_174, tround2: 511_176_426, treply2: 511_185_160,
    })
    const deep = deeperProse()
    for (const s of ['26 381 597 885', '26 509 391 059', '27 020 567 485', '127 793 174', '511 176 426',
      '127 797 230', '511 185 160']) expect(deep, s).toContain(s)
  })

  it('the two differences are +63 ns and −137 ns where both should be twice 11.675 ns', () => {
    // deeper: "Subtract each pair: +4056 and −8734 RCTU, or +63 ns and −137 ns, where both ought to
    //  be twice the 11.675 ns of flight."
    const { tround1, treply1, tround2, treply2 } = fourTimes('anchor-1')
    expect(tround1 - treply1).toBe(4_056)
    expect(tround2 - treply2).toBe(-8_734)
    expect(Math.round((tround1 - treply1) * RCTU_NS)).toBe(63)
    expect(Math.round((tround2 - treply2) * RCTU_NS)).toBe(-137)
    expect(metresToNs(RING_M).toFixed(3)).toBe('11.675')
    const deep = deeperProse()
    for (const s of ['+4056', '−8734', '+63 ns', '−137 ns', '11.675 ns']) expect(deep, s).toContain(s)
  })

  it('the denominator is the whole exchange: 10 ms on each clock, about 1 277 952 000 RCTU', () => {
    // the formula note: "The denominator is no wait at all: it is the whole exchange, timed once at
    //  each end." / deeper: "The four together sum to about 1 277 952 000 RCTU"
    const halfNs = PLAN.roundNs / 2
    expect(halfNs).toBe(10 * MS)
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1, tround2, treply2 } = fourTimes(`anchor-${i}`)
      // the phone's two intervals tile its Poll→Final, the anchor's tile its own
      expect(Math.abs((tround1 + treply2) * RCTU_NS - halfNs), `phone ${i}`).toBeLessThan(200)
      expect(Math.abs((treply1 + tround2) * RCTU_NS - halfNs), `anchor ${i}`).toBeLessThan(200)
      const sum = tround1 + treply1 + tround2 + treply2
      expect(Math.round(sum / 1000) * 1000, `sum ${i}`).toBe(1_277_952_000)
      expect(Math.abs(sum * RCTU_NS - 2 * halfNs), `sum ns ${i}`).toBeLessThan(400)
    }
    expect(deeperProse()).toContain('1 277 952 000 RCTU')
  })

  it('the printed formula is the engine’s dsTwr, operand for operand', () => {
    // "Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)"
    expect(formulas()).toHaveLength(1)
    expect(formulas()[0].text)
      .toBe('Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)')
    expect(formulas()[0].text).toBe(formulas()[0].text)
    // dsTwr(tround1, treply1, tround2, treply2) computes exactly that expression
    for (const [t1, r1, t2, r2] of [[1000, 800, 900, 700], [523, 41, 6007, 55], [12, 3, 4, 5]]) {
      expect(dsTwr(t1, r1, t2, r2), `${t1} ${r1} ${t2} ${r2}`)
        .toBeCloseTo((t1 * t2 - r1 * r2) / (t1 + t2 + r1 + r2), 12)
    }
  })

  it('both lanes are the engine’s dsTwr of those same four counters', () => {
    // deeper: "the same four counters through the same function"
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1, tround2, treply2 } = fourTimes(`anchor-${i}`)
      const tof = dsTwr(tround1, treply1, tround2, treply2)
      expect(tagRanges()[i - 1].tofRctu, `tag ${i}`).toBe(tof)
      expect(anchorRanges()[i - 1].tofRctu, `anchor ${i}`).toBe(tof)
    }
  })
})

describe('uwb-dstwr · two wrong halves', () => {
  it('the halves table is the two single-sided estimates the same counters give, cell by cell', () => {
    // "Two halves and the answer": anchor-1 reads 2 ms − Tprop, 9.51 m, −20.49 m, 3.51 m, and so on
    const first = ['9.51', '15.47', '21.49', '27.42']
    const second = ['−20.49', '−14.48', '−8.43', '−2.55']
    const ds = ['3.51', '3.49', '3.54', '3.45']
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1, tround2, treply2 } = fourTimes(`anchor-${i}`)
      const fmt = (rctu: number): string => rctuToMetres(rctu).toFixed(2).replace('-', '−')
      expect(fmt(ssTwrRaw(tround1, treply1)), `first half ${i}`).toBe(first[i - 1])
      expect(fmt(ssTwrRaw(tround2, treply2)), `second half ${i}`).toBe(second[i - 1])
      expect(fmt(dsTwr(tround1, treply1, tround2, treply2)), `ds ${i}`).toBe(ds[i - 1])
      expect(cell(0, i - 1, 0), `row ${i} anchor`).toBe(`anchor-${i}`)
      expect(cell(0, i - 1, 1), `row ${i} Treply1`).toBe(`${2 * i} ms − Tprop`)
      expect(cell(0, i - 1, 2), `row ${i} first half`).toBe(`${first[i - 1]} m`)
      expect(cell(0, i - 1, 3), `row ${i} second half`).toBe(`${second[i - 1]} m`)
      expect(cell(0, i - 1, 4), `row ${i} ds`).toBe(`${ds[i - 1]} m`)
    }
    expect(table(0).rows).toHaveLength(ANCHORS)
  })

  it('the first half is the previous lesson’s raw ramp: 6 m per slot of waiting', () => {
    // picture: "The first is exactly the raw estimate of the lesson before, too long by the same ramp."
    const ppm = ppmOf()
    const tpropNs = metresToNs(RING_M)
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1 } = fourTimes(`anchor-${i}`)
      const errM = rctuToMetres(ssTwrRaw(tround1, treply1)) - RING_M
      const predicted = (tpropNs * ppm.tag * 1e-6
        + ((i * PLAN.slotNs - tpropNs) * (ppm.tag - ppm.anchors) * 1e-6) / 2) * C_M_PER_NS
      expect(predicted.toFixed(1), `slot ${i}`).toBe((6 * i).toFixed(1))
      expect(Math.abs(errM - predicted), `slot ${i}`).toBeLessThan(0.15)
    }
  })

  it('the second half is negative, and averaging the two gives −5.49 m rather than 3.51 m', () => {
    // picture: "this time the phone waits, and the phone is the fast clock, so that half comes out
    //  negative" / numbers: "Averaging the first row’s two halves gives −5.49 m."
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround2, treply2 } = fourTimes(`anchor-${i}`)
      expect(ssTwrRaw(tround2, treply2), `slot ${i}`).toBeLessThan(0)
    }
    const { tround1, treply1, tround2, treply2 } = fourTimes('anchor-1')
    const mean = (ssTwrRaw(tround1, treply1) + ssTwrRaw(tround2, treply2)) / 2
    expect(rctuToMetres(mean).toFixed(2)).toBe('-5.49')
    expect(rctuToMetres(dsTwr(tround1, treply1, tround2, treply2)).toFixed(2)).toBe('3.51')
  })
})

/** The four true intervals of anchor `slot`'s exchange, in RCTU, before any clock error or noise. */
function trueTimes(slot: number): { tround1: number; treply1: number; tround2: number; treply2: number } {
  const tprop = metresToNs(RING_M) / RCTU_NS
  const treply1 = (slot * PLAN.slotNs) / RCTU_NS - tprop
  const treply2 = ((ANCHORS + 1 - slot) * PLAN.slotNs) / RCTU_NS - tprop
  return { tround1: treply1 + 2 * tprop, treply1, tround2: treply2 + 2 * tprop, treply2 }
}

describe('uwb-dstwr · why the crystals cancel', () => {
  it('the numerator scales by (1 + eA)(1 + eB) and the denominator by 1 + (eA + eB)/2', () => {
    // the formula note: "Each product in the numerator carries one factor from each clock, whatever
    //  the waits are. The denominator is no wait at all: it is the whole exchange, timed once at
    //  each end."
    for (const [eA, eB] of [[20e-6, -20e-6], [20e-6, 20e-6], [10e-6, -10e-6], [-5e-6, 20e-6]]) {
      for (const slot of [1, 2, 3, 4]) {
        const t = trueTimes(slot)
        const num = (x: typeof t): number => x.tround1 * x.tround2 - x.treply1 * x.treply2
        const den = (x: typeof t): number => x.tround1 + x.tround2 + x.treply1 + x.treply2
        // the phone measures tround1 and treply2; the anchor measures treply1 and tround2
        const m = {
          tround1: t.tround1 * (1 + eA), treply2: t.treply2 * (1 + eA),
          treply1: t.treply1 * (1 + eB), tround2: t.tround2 * (1 + eB),
        }
        expect(num(m) / num(t), `num ${eA} ${eB} ${slot}`).toBeCloseTo((1 + eA) * (1 + eB), 10)
        expect(den(m) / den(t), `den ${eA} ${eB} ${slot}`).toBeCloseTo(1 + (eA + eB) / 2, 6)
      }
    }
  })

  it('what survives is the flight scaled by ppm: 0.23 ps, well under a picosecond', () => {
    // the formula note: "What survives is the flight scaled by parts per million — a fraction of a
    //  picosecond." At the worst pair the standard allows, both crystals 20 ppm out the same way,
    //  that fraction is 0.23 ps: 0.07 mm of range.
    const e = UWB_PPM_MAX * 1e-6
    for (const slot of [1, 4]) {
      const t = trueTimes(slot)
      const tprop = metresToNs(RING_M) / RCTU_NS
      const est = dsTwr(t.tround1 * (1 + e), t.treply1 * (1 + e), t.tround2 * (1 + e), t.treply2 * (1 + e))
      const errPs = (est - tprop) * RCTU_NS * 1000
      expect(errPs.toFixed(2), `slot ${slot}`).toBe('0.23')
      expect(errPs, `slot ${slot}`).toBeLessThan(1) // "a fraction of a picosecond"
      expect(((est - tprop) * RCTU_NS * C_M_PER_NS * 1000).toFixed(2), `slot ${slot}`).toBe('0.07')
      expect(errPs).toBeCloseTo(metresToNs(RING_M) * e * 1000, 6)
    }
    // and with the two crystals opposed, as in this scene, it is nanometres
    for (const slot of [1, 4]) {
      const t = trueTimes(slot)
      const tprop = metresToNs(RING_M) / RCTU_NS
      const est = dsTwr(t.tround1 * (1 + e), t.treply1 * (1 - e), t.tround2 * (1 - e), t.treply2 * (1 + e))
      expect(Math.abs(rctuToMetres(est - tprop)), `slot ${slot}`).toBeLessThan(1e-8)
    }
  })
})

describe('uwb-dstwr · the same number on two lanes', () => {
  it('the anchors finish at the Final, 10 236 615 ns; the phone at each report, from 12 191 486 ns', () => {
    // deeper: "An anchor finishes when the Final arrives, at 10 236 615 ns; the phone waits for that
    //  anchor’s report — 12 191 486 ns for anchor 1, almost two milliseconds later." / observe 3:
    //  "All four anchor-lane ranges appear at 10 236 615 ns … the phone’s own follow at 12, 14, 16
    //  and 18 ms, each pair alike."
    expect(anchorRanges()).toHaveLength(ANCHORS)
    expect(tagRanges()).toHaveLength(ANCHORS)
    expect(anchorRanges().map((r) => r.t)).toEqual([10_236_615, 10_236_615, 10_236_615, 10_236_615])
    expect(tagRanges().map((r) => r.t)).toEqual([12_191_486, 14_191_486, 16_191_486, 18_191_486])
    expect(tagRanges()[0].t - anchorRanges()[0].t).toBeGreaterThan(1.9 * MS)
    expect(tagRanges()[0].t - anchorRanges()[0].t).toBeLessThan(2 * MS)
    expect(uwbDstwr.observe[2]).toContain('10 236 615 ns')
    expect(deeperProse()).toContain('12 191 486 ns')
  })

  it('each pair carries the same distance, identical to the last digit of tofRctu', () => {
    // deeper: "Both lanes carry the same distance, identical to the last digit" / the halves
    //  table's "DS result" column: 3.51, 3.49, 3.54 and 3.45 m
    for (let i = 0; i < ANCHORS; i++) {
      const a = anchorRanges()[i]
      const t = tagRanges()[i]
      expect(a.peer).toBe('tag-1')
      expect(t.peer).toBe(a.node)
      expect(t.tofRctu, a.node).toBe(a.tofRctu)
      expect(Math.abs(t.distM - a.distM), a.node).toBeLessThan(1e-9)
      // DS-TWR reports no raw figure: there is no uncorrected estimate to show
      expect(t.method).toBe('ds')
      expect(t.tofRawRctu).toBeUndefined()
      expect(t.trueDistM).toBe(RING_M)
    }
    expect(tagRanges().map((r) => fmtRecord(r))).toEqual([
      'tag-1 range → anchor-1 (DS): 3.51 m (true 3.50 m)',
      'tag-1 range → anchor-2 (DS): 3.49 m (true 3.50 m)',
      'tag-1 range → anchor-3 (DS): 3.54 m (true 3.50 m)',
      'tag-1 range → anchor-4 (DS): 3.45 m (true 3.50 m)',
    ])
  })

  it('the round ends in one fix, 2 cm out, with a GDOP of 1.00', () => {
    // deeper: "the four ranges become a fix at (5.01, 3.98) m against a true (5.00, 4.00): 2 cm out,
    //  GDOP 1.00 for this symmetric ring."
    const fixes = ofType(recs(), 'UWB_POSITION')
    expect(fixes).toHaveLength(1)
    const f = fixes[0]
    expect(f.t).toBe(PLAN.roundNs)
    expect(f.anchors).toHaveLength(ANCHORS)
    expect(f.gdop.toFixed(2)).toBe('1.00')
    expect(Math.hypot(f.x - f.trueX, f.y - f.trueY)).toBeLessThan(0.2)
    expect(fmtRecord(f)).toBe(
      'tag-1 position (5.01, 3.98) m, true (5.00, 4.00), error 0.02 m, GDOP 1.00, 4 anchors')
    // Review M10: `deeper` is exempt from the acronym rule, but this is where a reader first
    // meets the token — uwb-geometry names it four lessons later. So it carries a gloss,
    // the one uwb-position already uses.
  })
})

describe('uwb-dstwr · what the timestamp noise leaves', () => {
  it('only the receive stamps carry noise: the three that enter each result', () => {
    // numbers: "Three noisy receive stamps enter each result". A transmitter knows exactly when it
    //  fires, so an interval between two of its own transmit stamps is the same on every seed,
    //  while every interval that crosses a receive stamp scatters.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    const txOnly = seeds.map((s) =>
      counterDiff(stamp(seeded(s), 'tag-1', 'tx', 'uwbFinal'), stamp(seeded(s), 'tag-1', 'tx', 'uwbPoll')))
    expect(new Set(txOnly).size, `tx-only spans: ${txOnly.join(',')}`).toBe(1)
    // every interval that crosses a receive stamp moves with the seed, and moves by about the
    // 100 ps the session models — one sigma is 6.4 RCTU, so a few seeds span tens of ticks, not none
    // and not thousands
    const sigmaRctu = (SESSION.tsNoisePs / 1000) / RCTU_NS
    for (const k of ['tround1', 'treply1', 'tround2', 'treply2'] as const) {
      const vals = seeds.map((s) => fourTimes('anchor-1', seeded(s))[k])
      const spread = Math.max(...vals) - Math.min(...vals)
      expect(spread, `${k}: ${vals.join(',')}`).toBeGreaterThan(0)
      expect(spread, `${k}: ${vals.join(',')}`).toBeLessThan(8 * sigmaRctu)
    }
    // exactly three receive stamps feed one anchor's four times (its Poll and Final, the phone's Response)
    const rx = ofType(recs(), 'UWB_TS').filter((r) => r.dir === 'rx')
    expect(rx.filter((r) => r.node === 'anchor-1').map((r) => r.frameKind)).toEqual(['uwbPoll', 'uwbFinal'])
    expect(rx.filter((r) => r.node === 'tag-1' && r.peer === 'anchor-1' && r.frameKind === 'uwbResp')).toHaveLength(1)
  })

  it('every range is inside three sigma of its own slot, in both scenes', () => {
    for (const v of [undefined, 0]) {
      for (const [i, r] of tagRanges(v).entries()) {
        const bound = 3 * dsSigmaM(i + 1)
        expect(Math.abs(r.distM - RING_M), `${String(v)} ${r.peer} inside ${bound.toFixed(3)} m`).toBeLessThan(bound)
        expect(Math.abs(r.distM - r.trueDistM), `${String(v)} ${r.peer}`).toBeLessThan(0.15)
      }
    }
  })

  it('every cell of the noise table is the sigma formula or the run — and the column does not ramp', () => {
    // "What the timestamp noise leaves": Anchor | Answers in | Range noise, 1-σ | Error this run,
    //  and the paragraph "the column does not ramp: the anchor that waited four times as long gets
    //  the same figure."
    expect(table(2).rows).toHaveLength(ANCHORS)
    const fmtCm = (m: number): string => `${m >= 0 ? '+' : '−'}${Math.abs(m * 100).toFixed(1)} cm`
    table(2).rows.forEach((_row, i) => {
      const slot = i + 1
      const r = tagRanges()[i]
      expect(cell(2, i, 0), 'anchor').toBe(r.peer)
      expect(cell(2, i, 1), 'slot').toBe(`slot ${slot}`)
      expect(cell(2, i, 2), 'sigma').toBe(`${(dsSigmaM(slot) * 100).toFixed(1)} cm`)
      expect(cell(2, i, 3), 'error').toBe(fmtCm(r.distM - RING_M))
    })
    // "+1.4, −0.9, +3.7 and −5.2 cm — all inside 6 cm", as the halves table's DS column says too
    expect(tagRanges().map((r) => ((r.distM - RING_M) * 100).toFixed(1))).toEqual(['1.4', '-0.9', '3.7', '-5.2'])
    for (const r of tagRanges()) expect(Math.abs(r.distM - RING_M), r.peer).toBeLessThan(0.06)
    // 1.9 cm in slots 1 and 4, 1.8 cm in slots 2 and 3, and no ramp
    const sigmas = [1, 2, 3, 4].map(dsSigmaM)
    expect(sigmas.map((s) => (s * 100).toFixed(1))).toEqual(['1.9', '1.8', '1.8', '1.9'])
    expect(dsSigmaM(4)).toBeCloseTo(dsSigmaM(1), 15)
    expect(Math.max(...sigmas) / Math.min(...sigmas)).toBeLessThan(1.06)
    // …and it is smaller than the single-sided range noise of the lesson before, not larger
    expect(Math.max(...sigmas)).toBeLessThan(rangeSigmaM(SESSION.tsNoisePs))
  })

  it('the per-slot sigma is what a hundred seeds actually measure', () => {
    const rms = [0, 0, 0, 0]
    const SEEDS = 100
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rg = seeded(seed).filter((r): r is Extract<TLRecord, { type: 'UWB_RANGE' }> =>
        r.type === 'UWB_RANGE' && r.node === 'tag-1')
      expect(rg, `seed ${seed}`).toHaveLength(ANCHORS)
      rg.forEach((r, i) => { rms[i] += (r.distM - r.trueDistM) ** 2 })
    }
    rms.forEach((sq, i) => {
      const measured = Math.sqrt(sq / SEEDS)
      expect(measured / dsSigmaM(i + 1), `slot ${i + 1} rms ${(measured * 100).toFixed(2)} cm`)
        .toBeGreaterThan(0.75)
      expect(measured / dsSigmaM(i + 1), `slot ${i + 1} rms ${(measured * 100).toFixed(2)} cm`)
        .toBeLessThan(1.25)
    })
  })

  it('a delay common to all three receive stamps is added straight to the range', () => {
    // picture: "a first path that arrives late is added straight to the range" / deeper: "the
    //  denominator is untouched, and the excess delay is added straight to the range — not halved,
    //  not cancelled. One brick wall would put 60 cm on every range in this scene."
    const tprop = metresToNs(RING_M) / RCTU_NS
    for (const excessNs of [UWB_NLOS_NS.drywall, UWB_NLOS_NS.brick, UWB_NLOS_NS.glass]) {
      const d = excessNs / RCTU_NS
      for (const slot of [1, 2, 3, 4]) {
        const t = trueTimes(slot)
        const est = dsTwr(t.tround1 + d, t.treply1 - d, t.tround2 + d, t.treply2 - d)
        expect(est - tprop, `${excessNs} ns, slot ${slot}`).toBeCloseTo(d, 6)
        // in metres, the bias is the excess delay times c — not halved, not cancelled
        expect(rctuToMetres(est) - RING_M, `${excessNs} ns, slot ${slot}`)
          .toBeCloseTo(excessNs * C_M_PER_NS, 9)
      }
    }
    // one brick wall would add 60 cm to every range in this scene
    expect((UWB_NLOS_NS.brick * C_M_PER_NS).toFixed(2)).toBe('0.60')
    expect(deeperProse()).toContain('60 cm')
  })
})

describe('uwb-dstwr · the ±20 ppm variant', () => {
  it('the halves blow up while the DS ranges move by less than 3 mm', () => {
    // try-this 1: "the first anchor reads 15.51 m and −44.47 m, not 9.51 and −20.49 — while the
    //  four results move by under 3 mm."
    const { tround1, treply1, tround2, treply2 } = fourTimes('anchor-1', recs(0))
    expect(rctuToMetres(ssTwrRaw(tround1, treply1)).toFixed(2)).toBe('15.51')
    expect(rctuToMetres(ssTwrRaw(tround2, treply2)).toFixed(2)).toBe('-44.47')
    expect(tagRanges(0).map((r) => fmtRecord(r))).toEqual([
      'tag-1 range → anchor-1 (DS): 3.52 m (true 3.50 m)',
      'tag-1 range → anchor-2 (DS): 3.49 m (true 3.50 m)',
      'tag-1 range → anchor-3 (DS): 3.54 m (true 3.50 m)',
      'tag-1 range → anchor-4 (DS): 3.45 m (true 3.50 m)',
    ])
    tagRanges(0).forEach((r, i) => {
      expect(Math.abs(r.distM - tagRanges()[i].distM), r.peer).toBeLessThan(0.003)
    })
  })

  it('the fix is still 2 cm out', () => {
    const f = ofType(recs(0), 'UWB_POSITION')
    expect(f).toHaveLength(1)
    expect(Math.hypot(f[0].x - f[0].trueX, f[0].y - f[0].trueY).toFixed(2)).toBe('0.02')
    expect(f[0].gdop.toFixed(2)).toBe('1.00')
  })
})

/**
 * The procedure the 2026-09-23 amendment asks for ("mechanism before metaphor"):
 * the six stamps the engine takes, the four intervals they subtract to, and the
 * one division that cancels both crystals. Every step is checked against the
 * record or the function it names — the `UWB_TS` counters, `counterDiff`, and
 * `dsTwr` for the arithmetic itself.
 */
describe('uwb-dstwr · the procedure, step by step', () => {
  /** The lesson's steps block of `numbers`. */
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbDstwr.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  /** A counter as the worked example prints it: thousands separated by a thin space. */
  const fmt = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')

  it('is a steps block on the main path, not in `deeper`, and runs in the engine’s own order', () => {
    // amendment rule 3: the rule is written as a procedure, in `numbers`
    expect(uwbDstwr.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbDstwr.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    // the order of device.ts: Poll out, Response out (Treply1), Response in (Tround1),
    // Final out (Treply2), Final in (Tround2, and the anchor's own range), Report, the
    // arithmetic both lanes share
    // the four standard symbols appear in the engine's own order, whichever step
    // each one lands in: Treply1 before Tround1, then Treply2 before Tround2
    const joined = steps().items.join(' | ')
    const at = ['Treply1', 'Tround1', 'Treply2', 'Tround2'].map((t) => joined.indexOf(t))
    for (const [i, x] of at.entries()) expect(x, String(i)).toBeGreaterThanOrEqual(0)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('the six stamps of the worked example are the six UWB_TS counters of the run', () => {
    const rs = recs()
    const shown = [0, 1, 2, 3, 4, 5].map((i) => cell(3, i, 1))
    expect(shown).toEqual([
      stamp(rs, 'tag-1', 'tx', 'uwbPoll'),
      stamp(rs, 'anchor-1', 'rx', 'uwbPoll'),
      stamp(rs, 'anchor-1', 'tx', 'uwbResp'),
      stamp(rs, 'tag-1', 'rx', 'uwbResp', 'anchor-1'),
      stamp(rs, 'tag-1', 'tx', 'uwbFinal'),
      stamp(rs, 'anchor-1', 'rx', 'uwbFinal'),
    ].map(fmt))
    // three at each end — the extra leg is what the lesson before did not have
    const ts = ofType(rs, 'UWB_TS').filter((r) => r.t < 20 * MS)
    expect(ts.filter((r) => r.node === 'anchor-1').map((r) => `${r.dir}/${r.frameKind}`))
      .toEqual(['rx/uwbPoll', 'tx/uwbResp', 'rx/uwbFinal', 'tx/uwbReport'])
    expect(ts.filter((r) => r.node === 'tag-1' && (r.peer === 'anchor-1' || r.peer === '*'))
      .map((r) => `${r.dir}/${r.frameKind}`))
      .toEqual(['tx/uwbPoll', 'rx/uwbResp', 'tx/uwbFinal', 'rx/uwbReport'])
  })

  it('the four intervals of the worked example are the four counterDiffs of the run', () => {
    const t = fourTimes('anchor-1')
    expect([cell(3, 6, 1), cell(3, 7, 1), cell(3, 8, 1), cell(3, 9, 1)])
      .toEqual([t.treply1, t.tround2, t.tround1, t.treply2].map(fmt))
    // each row names whose pair it is, and the anchor's pair is the one the Report carries
  })

  it('the answer cell is dsTwr of those four, and both lanes print it', () => {
    const t = fourTimes('anchor-1')
    const tof = dsTwr(t.tround1, t.treply1, t.tround2, t.treply2)
    expect(cell(3, 10, 1)).toBe(`${tof.toFixed(1)} · ${rctuToMetres(tof).toFixed(2)} m`)
    // the two lanes: the anchor computes it at the Final, the phone at the Report,
    // and the records agree to the last digit
    const mine = ofType(recs(), 'UWB_RANGE').filter((r) => r.peer === 'anchor-1' || r.node === 'anchor-1')
    expect(mine).toHaveLength(2)
    expect(mine[0].tofRctu).toBe(mine[1].tofRctu)
    expect(mine[0].tofRctu).toBeCloseTo(tof, 9)
  })

  it('no clock offset is read: the last step’s claim, proven over every anchor', () => {
    // step 7: "Nothing is estimated; no clock offset is read." A DS record carries no raw
    // figure at all — there is nothing for a correction to have been applied to.
    for (const r of ofType(recs(), 'UWB_RANGE')) {
      expect(r.method, r.peer).toBe('ds')
      expect(r.tofRawRctu, r.peer).toBeUndefined()
      // and the four times alone reproduce it, with no offset anywhere in the call
      const t = fourTimes(r.node.startsWith('anchor') ? r.node : r.peer)
      expect(dsTwr(t.tround1, t.treply1, t.tround2, t.treply2), r.peer).toBeCloseTo(r.tofRctu, 9)
    }
  })
})

describe('uwb-dstwr · the quiz', () => {
  it('the quiz keys its answers to the numbers the lesson prints', () => {
    // every distractor that quotes a figure quotes one the main path also carries
    const text = prose()
    for (const s of ['9.67 %', '9.56 %', '−5.49 m', '9.51', '−20.49', '3.51 m']) {
      expect(text, s).toContain(s)
    }
    expect(uwbDstwr.quiz.map((q) => q.answer)).toEqual([1, 1, 1])
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **Twelve describes above, and the sweep still edits half the lesson.** `scripts/figure-planting`
 * plants one edit per printed figure and runs this file: of the 146 figures this lesson prints,
 * **75** could be edited with the suite green on 2026-10-13, four of them without an equal literal
 * anywhere under `tests/` — the round's own 20 000 µs and the 1 934.23 µs it radiates, the instant
 * the anchor finishes its arithmetic, and the nanosecond the round ends at.
 *
 * Nothing new is measured below. Every assertion calls the same `recs`, `ranges`, `fourTimes`,
 * `stamp`, `dsSigmaM`, `PLAN`, `finalFrame` the tests above call, and the figure comes out of the
 * prose instead of out of this file.
 */
describe('uwb-dstwr · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uwbDstwr).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
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
  const deep = deeperProse()
  const limitsText = (uwbDstwr.limits ?? []).map((l) => l.text).join('\n')
  const srcText = (uwbDstwr.sources ?? []).join('\n')
  const obs = uwbDstwr.observe.join('\n')
  const trys = uwbDstwr.tryThis.join('\n')
  const quizText = uwbDstwr.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  const A1 = 'anchor-1'
  const FLIGHT_NS = metresToNs(RING_M)
  /** The two half-rounds of one anchor, each the uncorrected SS-TWR estimate of its direction. */
  const halves = (anchorId: string, rs: TLRecord[] = recs()): [number, number] => {
    const t = fourTimes(anchorId, rs)
    return [rctuToMetres(ssTwrRaw(t.tround1, t.treply1)), rctuToMetres(ssTwrRaw(t.tround2, t.treply2))]
  }
  /** Every microsecond of UWB PPDU one round radiates. */
  const radiatedUs = (rs: TLRecord[]): number =>
    ofType(rs, 'TX_START').filter((r) => r.t < PLAN.roundNs)
      .reduce((a, r) => a + r.frame.txTimeNs, 0) / 1000

  it('the two half-rounds, their average, and the answer that is neither', () => {
    // 「把第一行的两个半场平均一下，得到 −5.49 m——也不是答案」
    const [avg] = raw(numbersProse(), /两个半场平均一下，得到 (−[\d.]+) m/,
      '`numbers` on the average of the two halves')
    const [first, second] = halves(A1)
    same(avg!, (first! + second!) / 2, 'the average of the two half-rounds')
    // and the quiz states all three: 「9.51 m 与 −20.49 m，答案却是 3.51 m」 and the average again
    const [q1, q2, ans] = raw(quizText,
      /两个半场是 ([\d.]+) m 与 (−[\d.]+) m，答案却是 ([\d.]+) m/,
      'the quiz on the same three figures')
    same(q1!, first!, 'the first half-round')
    same(q2!, second!, 'the second')
    same(ans!, ranges().find((r) => r.peer === A1 || r.node === A1)!.distM, 'and the answer')
    const [qAvg] = raw(quizText, /两者的平均是 (−[\d.]+) m/, 'the quiz on their average')
    expect(val(qAvg!), 'the same average the paragraph states').toBe(val(avg!))
    // 「锚点 4 作答前等四个时隙，锚点 1 只等一个」 — the two the quiz compares
    const [late, early] = figs(quizText, /锚点 (\d) 作答前等四个时隙，锚点 (\d) 只等一个/,
      'the quiz on the two anchors it compares')
    expect([early, late], 'the first and the last to answer').toEqual([1, ANCHORS])
    const errs = ranges().filter((r) => r.node === 'tag-1').map((r) => Math.abs(r.distM - r.trueDistM))
    expect(Math.max(...errs) / Math.min(...errs), 'and they really are of one accuracy')
      .toBeLessThan(10)
  })

  it('the frame table’s own prose: the shorter Response, and what the round radiates', () => {
    // 「这里的 Response 是 14 个字节，不是 20 个」
    const [now, before] = figs(numbersProse(), /Response 是 (\d+) 个字节，不是 (\d+) 个/,
      '`numbers` on why the Response shrank')
    const resp = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbResp')!
    expect(now, 'the octets a Response really carries here').toBe(resp.frame.bytes)
    const ss = [...new Simulation(uwbSstwrScenario({ tag: 10, anchors: -10 })).runUntil(RUN_NS).records]
    const ssResp = ofType(ss, 'TX_START').find((r) => r.frame.kind === 'uwbResp')!
    expect(before, 'and the octets it carried in the single-sided lesson')
      .toBe(ssResp.frame.bytes)
    /*
     * 「在 20 000 µs 的轮里辐射 1 934.23 µs，占 9.67 %，上一课那个单边轮是 9.56 %」 — the round
     * and the microseconds it radiates were two of the four figures with no equal literal
     * anywhere under `tests/`.
     */
    const [roundUs, radiated, share, ssShare] = raw(numbersProse(),
      /在 ([\d\s]+) µs 的轮里辐射 ([\d\s.]+) µs，占 ([\d.]+) %，上一课那个单边轮是 ([\d.]+) %/,
      '`numbers` on what the round costs')
    expect(val(roundUs!) * 1000, 'the round this session lays out').toBe(PLAN.roundNs)
    same(radiated!, radiatedUs(recs()), 'the microseconds it radiates')
    same(share!, (100 * radiatedUs(recs()) * 1000) / PLAN.roundNs, 'and the share that is')
    const ssPlan = roundPlan(uwbSstwrScenario({ tag: 10, anchors: -10 }).uwb!, ANCHORS)
    const ssRadiated = ofType(ss, 'TX_START').filter((r) => r.t < ssPlan.roundNs)
      .reduce((a, r) => a + r.frame.txTimeNs, 0) / 1000
    same(ssShare!, (100 * ssRadiated * 1000) / ssPlan.roundNs,
      'and the share the single-sided round took')
    // the quiz states both shares again
    const [qa, qb] = figs(quizText, /占比 ([\d.]+) % 对 ([\d.]+) %/, 'the quiz on the two shares')
    expect([qa, qb], 'the same pair').toEqual([val(share!), val(ssShare!)])
  })

  it('`deeper`: the four counters of anchor 1, and the two differences they leave', () => {
    // 「锚点 1 打出 26 381 597 885、26 509 391 059 与 27 020 567 485」
    const [which, c1, c2, c3] = raw(deep,
      /锚点 (\d) 打出 ([\d\s]+)、([\d\s]+) 与 ([\d\s]+)，/,
      '`deeper` on the three counters the anchor stamps')
    const id = `anchor-${val(which!)}`
    expect([val(c1!), val(c2!), val(c3!)], 'the three stamps that anchor really takes')
      .toEqual([
        stamp(recs(), id, 'rx', 'uwbPoll'),
        stamp(recs(), id, 'tx', 'uwbResp'),
        stamp(recs(), id, 'rx', 'uwbFinal'),
      ])
    // 「于是 Treply1 = 127 793 174，Tround2 = 511 176 426 RCTU。手机对它的那一对是
    //  Tround1 = 127 797 230 与 Treply2 = 511 185 160」
    const [treply1, tround2] = figs(deep, /Treply1 = ([\d\s]+)，Tround2 = ([\d\s]+) RCTU/,
      '`deeper` on the anchor’s own pair')
    const [tround1, treply2] = figs(deep, /Tround1 = ([\d\s]+) 与 Treply2 = ([\d\s]+)/,
      '`deeper` on the tag’s own pair')
    const t = fourTimes(id)
    expect({ treply1, tround2, tround1, treply2 }, 'the four times the records give')
      .toEqual({ treply1: t.treply1, tround2: t.tround2, tround1: t.tround1, treply2: t.treply2 })
    // 「把两对分别相减：+4056 与 −8734 RCTU，即 +63 ns 与 −137 ns——而两者本都应当是 11.675 ns
    //  飞行时间的两倍」
    const [d1, d2, ns1, ns2, flight] = raw(deep,
      /把两对分别相减：\+(\d+) 与 (−\d+) RCTU，即 \+(\d+) ns 与 (−\d+) ns——而两者本都应当是 ([\d.]+) ns/,
      '`deeper` on the two differences')
    expect(val(d1!), 'the first pair’s own difference').toBe(t.tround1 - t.treply1)
    expect(val(d2!), 'and the second pair’s').toBe(t.tround2 - t.treply2)
    expect(Math.round((t.tround1 - t.treply1) * RCTU_NS), 'the first, in nanoseconds').toBe(val(ns1!))
    expect(Math.round((t.tround2 - t.treply2) * RCTU_NS), 'and the second').toBe(val(ns2!))
    same(flight!, FLIGHT_NS, 'the flight time both of them should have been twice')
    // 「四者相加约为 1 277 952 000 RCTU：整场交互，被计了两遍」
    const [total] = figs(deep, /四者相加约为 ([\d\s]+) RCTU/, '`deeper` on the sum of all four')
    expect(Math.abs(t.tround1 + t.tround2 + t.treply1 + t.treply2 - total!) / total!,
      'the four times really add up to about that').toBeLessThan(1e-4)
  })

  it('`deeper`: the two instants, the fix the round ends with, and the frame that grows fastest', () => {
    // 「锚点在 Final 到达时就算完了，时刻是 10 236 615 ns；手机要等该锚点的报告——锚点 1 是
    //  12 191 486 ns，晚了将近两毫秒」
    const [anchorAt, which, tagAt] = raw(deep,
      /时刻是 ([\d\s]+) ns；手机要等该锚点的报告——锚点 (\d) 是 ([\d\s]+) ns/,
      '`deeper` on when each end finishes')
    const id = `anchor-${val(which!)}`
    const anchorRange = ranges().find((r) => r.node === id)!
    const tagRange = ranges().find((r) => r.node === 'tag-1' && r.peer === id)!
    expect(anchorRange.t, 'when the anchor finishes its own arithmetic').toBe(val(anchorAt!))
    expect(tagRange.t, 'and when the tag finishes the same arithmetic').toBe(val(tagAt!))
    expect(anchorRange.distM, 'and the two get the same distance, to the last digit')
      .toBe(tagRange.distM)
    // 「四个距离解算出 (5.01, 3.98) m 的定位，真值 (5.00, 4.00)：偏差 2 cm，……GDOP 为 1.00」
    const [x, y, tx, ty, errCm, gdop] = raw(deep,
      /解算出 \(([\d.]+), ([\d.]+)\) m 的定位，真值 \(([\d.]+), ([\d.]+)\)：偏差 (\d+) cm[\s\S]*?为 ([\d.]+)——/,
      '`deeper` on the fix the round ends with')
    const fix = ofType(recs(), 'UWB_POSITION')[0]!
    same(x!, fix.x, 'the fix’s own x')
    same(y!, fix.y, 'and its y')
    same(tx!, fix.trueX, 'the true x')
    same(ty!, fix.trueY, 'and the true y')
    expect(Math.round(Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY) * 100),
      'the error between them, to the centimetre').toBe(val(errCm!))
    same(gdop!, fix.gdop, 'and the GDOP this symmetric ring gives')
    // 「14 + 12N 字节，而 Poll 是 27 + 3N——此处 62 字节、496 位、两个 Reed–Solomon 码块」
    const [fBase, fPer, pBase, pPer, bytes, bits] = figs(deep,
      /：(\d+) \+ (\d+)N 字节，而 Poll 是 (\d+) \+ (\d+)N——此处 (\d+) 字节、(\d+) 位/,
      '`deeper` on how the two frames grow')
    const final = finalFrame(recs())
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame
    expect(fBase! + fPer! * ANCHORS, 'the octets a Final carries for four anchors').toBe(final.bytes)
    expect(pBase! + pPer! * ANCHORS, 'and the octets a Poll carries').toBe(poll.bytes)
    expect(bytes, 'which is the Final this run really sends').toBe(final.bytes)
    expect(bits, 'and the bits those octets are').toBe(final.bytes! * 8)
    // 「多一个锚点，Final 会多 12 字节，整轮会多两个时隙、即 4 ms」
    const [perAnchor, moreMs] = figs(deep, /Final 会多 (\d+) 字节，整轮会多两个时隙、即 (\d) ms/,
      '`deeper` on what one more anchor costs')
    expect(perAnchor, 'the octets one more anchor adds to the Final').toBe(fPer)
    expect(moreMs! * MS, 'and the two slots it adds to the round').toBe(2 * PLAN.slotNs)
  })

  it('the names, the labels and the indices — every one of them against the scene', () => {
    /*
     * **The four subscripted names are checked as a SET.** 「Treply1（锚点的等待）」 and
     * 「Treply2（手机的等待）」 are two cells of the worked table, so an edit to either subscript
     * makes the four no longer distinct — which is the only thing a subscript can be wrong
     * about, and it is what the standard's own figure 10-199 names them for.
     */
    const named = [...EVERYWHERE.matchAll(/= (T(?:round|reply)\d)（(.+?)）/g)]
      .map((m) => [m[1]!, m[2]!] as const)
    expect(named.length, 'the worked table names all four times').toBe(4)
    expect(new Set(named.map(([n]) => n)).size, 'and each name appears exactly once').toBe(4)
    const ends = new Map(named)
    expect(ends.get('Treply1'), 'the first reply is the anchor’s own wait').toContain('锚点')
    expect(ends.get('Tround2'), 'and the second round is the anchor’s').toContain('锚点')
    expect(ends.get('Tround1'), 'while the first round is the phone’s').toContain('手机')
    expect(ends.get('Treply2'), 'and the second reply is the phone’s').toContain('手机')
    // 「锚点 2–4」 — the figure's own lane label, against the anchors it stands for
    const [from, to] = figs(
      (uwbDstwr.picture ?? []).map((b) => ('spec' in b ? JSON.stringify(b.spec) : '')).join('\n'),
      /锚点 (\d)–(\d)/, 'the figure’s own lane label')
    expect([from, to], 'the anchors that lane stands for').toEqual([2, ANCHORS])
    // 「测距噪声 1σ」 — the noise column's own heading
    const [sigma] = figs(table(2).head[2]!, /测距噪声 (\d)σ/, 'the noise column’s own heading')
    expect(sigma, 'one sigma').toBe(1)
    // 「锚点 4 等了四倍长，拿到的数值一样准」 — the last anchor to answer
    const [longest] = figs(numbersProse(), /锚点 (\d) 等了四倍长/,
      '`numbers` on the anchor that waits longest')
    expect(longest, 'the last of them').toBe(ANCHORS)
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    expect(resp[longest! - 1]!.t, 'and it really answers last')
      .toBe(Math.max(...resp.map((r) => r.t)))
    // 「时隙 0。手机给 Poll 离开时的 RMARKER 打一个戳」 — the slot the poll goes out in
    const [slot0] = figs(numbersProse(), /时隙 (\d)。手机给 Poll 离开/,
      '`numbers` on which slot the poll is in')
    expect(ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.t,
      'the poll opens the round').toBe(slot0! * PLAN.slotNs)
    // 「锚点 1」 — the worked example's own anchor, wherever it is named
    const worked = figs(table(3).heading ?? '', /锚点 (\d)/, 'the worked table’s own heading')[0]!
    for (const v of everyFig(/锚点 (\d) 的四个计数值|锚点 (\d)，照着步骤走一遍|锚点 (\d) 的两个半场/g,
      'the anchor the worked example follows', 3)) {
      expect(val(v), 'the same anchor every time').toBe(worked)
    }
    expect(stamp(recs(), `anchor-${worked}`, 'rx', 'uwbPoll'),
      'and that anchor really stamped the poll in').toBeGreaterThan(0)
    // 「多一个锚点 Final 多 12 字节」 — `limits` quoting `deeper`, and the same octets
    const [perAnchorAgain] = figs(limitsText, /多一个锚点 Final 多 (\d+) 字节/,
      '`limits` quoting the figure `deeper` works out')
    expect(uwbFinalBytes(ANCHORS + 1) - uwbFinalBytes(ANCHORS),
      'the octets one more anchor really adds').toBe(perAnchorAgain)
    // 「一堵砖墙会给每一个距离加上 60 cm」 — `limits` quotes it too, and both must agree
    const walls = [...EVERYWHERE.matchAll(/加上 (\d+) cm/g)].map((m) => val(m[1]!))
    expect(walls.length, 'the wall’s own centimetres are stated twice').toBeGreaterThanOrEqual(2)
    for (const w of walls) {
      expect(Math.round(UWB_NLOS_NS.brick * C_M_PER_NS * 100), 'and both are the wall’s own')
        .toBe(w)
    }
    /*
     * 「标准只要求至少 32 位」 is **exempt**: it is a floor the standard sets and this repository
     * has no clause text to read it against (the first exemption class). What is checkable is
     * what the sentence is for — the engine's own width clears it — so the sweep goes on
     * reporting this one green, and that is correct.
     */
    const [least] = figs(srcText, /标准只要求至少 (\d+) 位/, '`sources` on the standard’s floor')
    expect(COUNTER_BITS, 'the width this engine runs clears it').toBeGreaterThan(least!)
    // 「四个结果的变化不到 3 mm」 — an upper bound, so it is read as the millimetre it rounds up to
    const [mm] = figs(trys, /变化不到 (\d+) mm/, '`tryThis` on how little the answers move')
    const base = ranges().filter((r) => r.node === 'tag-1')
    const worst = ranges(0).filter((r) => r.node === 'tag-1')
    const moved = worst.map((r, i) => Math.abs(r.distM - base[i]!.distM))
    expect(Math.ceil(Math.max(...moved) * 1000), 'the largest move, to the millimetre above it')
      .toBe(mm)
  })

  it('`limits` and `sources`: the widths they own, the wall, and the counter', () => {
    // 「Final 的 RMI 为 3 + 6N 字节、单个回复时延 6 字节、Report 的 RMI 13 字节」 — twice over
    /*
     * `limits` and `sources` each state the three widths, in their own words — so they are read
     * separately and then required to agree. 「这个数在别处读过了」 is not read; two printings of
     * one width are two sites.
     */
    const inLimits = figs(limitsText,
      /RMI 为 (\d+) \+ (\d+)N 字节、单个回复时延 (\d+) 字节、Report 的 RMI (\d+) 字节/,
      '`limits` on the three widths it owns')
    const inSources = figs(srcText,
      /RMI 为 (\d+) \+ (\d+)N 字节，单个应答时延字段为 (\d+) 字节，报告的 RMI 为 (\d+) 字节/,
      '`sources` on the same three')
    expect(inSources, 'and the two statements agree, figure for figure').toEqual(inLimits)
    const [rmiBase, rmiPer, replyBytes, reportRmi] = inLimits
    // the Final's own body is the RMI plus one reply-time field per anchor
    const final = finalFrame(recs())
    expect(rmiBase! + rmiPer! * ANCHORS, 'the RMI of a four-anchor Final')
      .toBeLessThanOrEqual(final.bytes!)
    expect(rmiPer, 'and the per-anchor part of it').toBe(replyBytes)
    const report = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbReport')!.frame
    expect(reportRmi, 'the RMI a report carries').toBeLessThanOrEqual(report.bytes!)
    // 「砖 2.0 ns」 and 「一堵砖墙会给每一个距离加上 60 cm」
    const [wallNs] = figs(limitsText, /砖 ([\d.]+) ns/, '`limits` on the wall’s own delay')
    expect(wallNs, 'the delay `channel.ts` gives a brick wall').toBe(UWB_NLOS_NS.brick)
    const [wallCm] = figs(EVERYWHERE, /一堵砖墙会给每一个距离加上 (\d+) cm/,
      'the sentence `limits` is about')
    // the delay enters the distance ONCE — 「既不打对折，也不会被抵消」 — so it is the wall's own
    expect(Math.round(UWB_NLOS_NS.brick * C_M_PER_NS * 100),
      'the wall’s own delay, in centimetres of distance').toBe(wallCm)
    // 「40 位的测距计数器——标准只要求至少 32 位」
    const [bits, least] = figs(srcText, /(\d+) 位的测距计数器——标准只要求至少 (\d+) 位/,
      '`sources` on the counter’s own width')
    expect(bits, 'the counter width `phy.ts` exports').toBe(COUNTER_BITS)
    expect(bits, 'which is wider than the standard’s floor').toBeGreaterThan(least!)
    // 「±20 ppm 的晶振容差」, 「2 ms 的测距时隙」 and 「100 ps 的 1σ 噪声」
    for (const v of everyFig(/±(\d+) ppm 的晶振容差/g, 'the crystal tolerance', 1)) {
      expect(val(v), 'the tolerance `phy.ts` exports').toBe(UWB_PPM_MAX)
    }
    for (const v of everyFig(/(\d) ms 的测距时隙|× ([\d.]+) µs/g, 'the ranging slot', 2)) {
      const n = val(v)
      expect(n === PLAN.slotNs / MS || n === PLAN.slotNs / 1000,
        `${n} is this session's own slot, in whichever unit it is quoted`).toBe(true)
    }
    const [ps, sigma] = figs(srcText, /(\d+) ps 的 (\d)σ 噪声/, '`sources` on the timestamp noise')
    expect(ps, 'the noise this session runs with').toBe(SESSION.tsNoisePs)
    expect(sigma, 'one sigma of it').toBe(1)
  })

  it('`observe` and `tryThis`: every instant, and what the worst crystals do', () => {
    // 「整轮那一行写着 "10 slots × 2000.0 µs"，到 20 000 000 ns 结束」
    const [slots, slotUs, endNs] = raw(obs,
      /"(\d+) slots × ([\d.]+) µs"，到 ([\d\s]+) ns 结束/,
      '`observe` on the round’s own line')
    expect(val(slots!), 'the slots this round lays out').toBe(PLAN.slots)
    same(slotUs!, PLAN.slotNs / 1000, 'and each one’s length')
    expect(val(endNs!), 'and where the round ends').toBe(PLAN.roundNs)
    // 「Final 独自坐在这一轮正中间，10 ms 处」
    const [midMs] = figs(obs, /正中间，(\d+) ms 处/, '`observe` on where the Final sits')
    const final = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!
    expect(final.t, 'when the Final goes out').toBe(midMs! * MS)
    expect(midMs! * MS * 2, 'which is the middle of the round').toBe(PLAN.roundNs)
    // 「四条锚点泳道上的测距都出现在 10 236 615 ns……手机自己那四条则在 12、14、16、18 ms 出现」
    const [atNs] = raw(obs, /都出现在 ([\d\s]+) ns/, '`observe` on when the anchors finish')
    for (const r of ranges().filter((x) => x.node.startsWith('anchor'))) {
      expect(r.t, 'every anchor finishes at that instant').toBe(val(atNs!))
    }
    const tagAt = figs(obs, /则在 (\d+)、(\d+)、(\d+)、(\d+) ms 出现/,
      '`observe` on when the tag finishes each of them')
    // the sentence gives whole milliseconds, so each is the millisecond its own report lands in
    const tagTimes = ranges().filter((x) => x.node === 'tag-1').map((x) => Math.floor(x.t / MS))
    expect(tagAt, 'the four milliseconds the tag’s own lane shows them in').toEqual(tagTimes)
    // 「载入“最差晶振，±20 ppm”……第一个锚点读到 15.51 m 与 −44.47 m，原先是 9.51 与 −20.49
    //  ——而四个结果的变化不到 3 mm」
    const [worstPpm, w1, w2, b1, b2, mm] = raw(trys,
      /±(\d+) ppm”[\s\S]*?第一个锚点读到 ([\d.]+) m 与 (−[\d.]+) m，原先是 ([\d.]+) 与 (−[\d.]+)[\s\S]*?变化不到 (\d+) mm/,
      '`tryThis` on the worst-crystal variant')
    expect(val(worstPpm!), 'the crystal that variant ships').toBe(Math.abs(ppmOf(0).tag))
    const worst = halves(A1, recs(0))
    same(w1!, worst[0]!, 'the first half-round at the worst crystals')
    same(w2!, worst[1]!, 'and the second')
    const base = halves(A1)
    same(b1!, base[0]!, 'against the first at the shipped crystals')
    same(b2!, base[1]!, 'and the second')
    const moved = ranges(0).filter((r) => r.node === 'tag-1')
      .map((r, i) => Math.abs(r.distM - ranges().filter((x) => x.node === 'tag-1')[i]!.distM))
    expect(Math.max(...moved) * 1000, 'while every one of the four answers moves less than that')
      .toBeLessThan(val(mm!))
  })
})
