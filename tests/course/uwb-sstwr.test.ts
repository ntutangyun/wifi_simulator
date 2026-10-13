/**
 * Every empirical claim in "The clock inside the reply time", measured against
 * the lesson's own scenario and both of its variants. Each assertion quotes the
 * sentence it guards; the formulas and constants are checked against the
 * engine's own exports (src/uwb/ranging.ts, src/uwb/phy.ts, src/uwb/clock.ts)
 * rather than re-typed.
 *
 * The lesson was rewritten to the zero-to-hero contract, so the shape checks
 * come from tests/course/kit.ts and the pins below moved with their sentences:
 * the provenance is in `sources`, the Figure of Merit byte, the two surviving
 * error terms and anchor 1's counters are in `deeper`, and the crystal ramp of
 * the two experiments is also tabulated in `numbers`.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbSstwr, uwbSstwrScenario } from '../../src/course/uwb/uwb-sstwr'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { lessonTexts, paragraphTexts } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM, solvePosition } from '../../src/uwb/position'
import { metresToNs, rctuToMetres, ssTwrCorrected, ssTwrRaw } from '../../src/uwb/ranging'
import { C_M_PER_NS, FOM_LOS, RCTU_NS, UWB_PPM_MAX, fomDecode, fomText } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { zhNumeral } from './coverage'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** The ring the scene is built on: every anchor is exactly this far from the tag. */
const RING_M = 3.5

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The section budgets are gone; a lesson is as long as its one topic needs, under
// the 30-minute ceiling (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md).
lessonShapeSuite(uwbSstwr, { runNs: RUN_NS })

/** The scenario each part of the lesson runs: the base, then variant 0 and variant 1. */
const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbSstwr.scenario() : uwbSstwr.variants![variant].scenario()
/** The crystal offsets of a scene, read back from the scene itself: tag, anchors, and eA − eB. */
function ppmOf(variant?: number): { tag: number; anchors: number; delta: number } {
  const nodes = scenarioOf(variant).nodes
  const tag = nodes.find((n) => n.uwb!.role === 'tag')!.uwb!.ppm!
  const anchors = nodes.find((n) => n.uwb!.role === 'anchor')!.uwb!.ppm!
  return { tag, anchors, delta: tag - anchors }
}
const BASE_PPM = ppmOf()
const PERFECT_PPM = ppmOf(0)
const TCXO_PPM = ppmOf(1)
/** The session's noise model, likewise read back rather than re-typed. */
const SESSION = uwbSstwr.scenario().uwb!
/** 1-σ of one SS-TWR range at the session's 100 ps timestamp noise: 21.2 mm. */
const SIGMA_R = rangeSigmaM(SESSION.tsNoisePs)
/** 1-σ of what the correction leaves behind for an anchor answering in slot i: ½·Treply·σ_cfo. */
const residualSigmaM = (slot: number): number =>
  ((slot * 2 * MS - metresToNs(RING_M)) * SESSION.cfoNoisePpm * 1e-6) / 2 * C_M_PER_NS
/** The raw error the formula predicts for slot i: Tprop·eA + ½·Treply·(eA − eB), in metres. */
const predictedRawErrM = (slot: number, ppm: { tag: number; delta: number }): number => {
  const tpropNs = metresToNs(RING_M)
  const treplyNs = slot * 2 * MS - tpropNs
  return (tpropNs * ppm.tag * 1e-6 + (treplyNs * ppm.delta * 1e-6) / 2) * C_M_PER_NS
}

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbSstwr, variant, RUN_NS)
const ranges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE')
const rawErr = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): number =>
  rctuToMetres(r.tofRawRctu!) - r.trueDistM

/** The lesson's nth table of `numbers`, rows kept in place so a cell is checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbSstwr.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbSstwr.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
/** Every paragraph of `deeper`, joined — the depth the picture no longer carries. */
const deeperProse = (): string => paragraphTexts(uwbSstwr.deeper!).map((p) => p).join('\n')
/** The lesson's one `steps` block, item by item — read by two suites, so it lives up here. */
const stepItems = (): string[] =>
  uwbSstwr.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!.items

describe('uwb-sstwr · the lesson’s own place in the track', () => {
  it('is the third lesson of the UWB track and needs the frame lesson', () => {
    expect(MODULES[uwbSstwr.module].title).toBe('两只钟')
    expect(uwbSstwr.id).toBe('uwb-sstwr')
    expect(uwbSstwr.needs).toEqual(['uwb-frame'])
    // the five new words, in the order the "New words" table lists them
    expect(uwbSstwr.terms!.map((t) => t.term))
      .toEqual(['crystal', 'ppm', 'clock offset', 'SS-TWR', 'Coffs'])
  })

  it('it offers four jumps, three things to observe, two experiments and three questions', () => {
    expect(uwbSstwr.jumps).toHaveLength(4)
    expect(uwbSstwr.observe).toHaveLength(3)
    expect(uwbSstwr.tryThis).toHaveLength(2)
    expect(uwbSstwr.quiz).toHaveLength(3)
    for (const q of uwbSstwr.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('the two jump labels that quote a number quote the number the run produces', () => {
    // "the first range: raw is 6 m long" / "the fourth range: raw is 24 m long"
    expect(Math.round(rawErr(ranges()[0]))).toBe(6)
    expect(Math.round(rawErr(ranges()[3]))).toBe(24)
    // the last jump is a pure predicate on the record, and it finds the fourth range
    const fourth = uwbSstwr.jumps[3].find
    expect(recs().filter(fourth)).toHaveLength(1)
    expect(ranges().findIndex(fourth)).toBe(3)
  })

  it('names the standard clauses it leans on and the three numbers that are model, in `sources`', () => {
    // the provenance that used to open the lesson; the contract test pins that it appears
    // nowhere else, this pins that it is still said.
    const src = uwbSstwr.sources!.map((s) => s).join('\n')
    for (const s of ['IEEE Std 802.15.4-2024', '§10.29.1.2.2', '§10.29.1.6', '§10.29.1.7', '§16.4.9']) {
      expect(src, s).toContain(s)
    }
    for (const s of ['100 ps', '0.2 ppm', 'FiRa']) expect(src, s).toContain(s)
  })
})

describe('uwb-sstwr · the scene', () => {
  it('is four anchors on a 3.50 m ring round one phone, all at 2.20 m, in a 10 × 8 m lab', () => {
    // picture: "four anchors on a ring around it, every one the same distance away and at the
    //  same height" — the numbers behind that sentence, which the picture no longer prints
    const s = uwbSstwr.scenario()
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(s.walls).toHaveLength(4)
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
    expect(s.uwb).toMatchObject({ method: 'ss', nlos: false, slotRstu: 2400, tsNoisePs: 100, cfoNoisePpm: 0.2 })
    // the noise model every bound in this file is built from, taken from the scene, not re-typed
    expect(SESSION.tsNoisePs).toBe(100)
    expect(SESSION.cfoNoisePpm).toBe(0.2)
  })

  it('the scenario and both variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbSstwr.scenario())).not.toThrow()
    expect(uwbSstwr.variants).toHaveLength(2)
    for (const v of uwbSstwr.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the base run is the phone 10 ppm fast against anchors 10 ppm slow, inside the ±20 ppm allowed', () => {
    // picture: "This phone runs a little fast, every anchor a little slow" — and the crystals
    // table's "This scene, ±10 ppm | 20 ppm" row
    expect(uwbSstwr.scenario().nodes.map((n) => n.uwb!.ppm)).toEqual([-10, -10, -10, -10, 10])
    expect(BASE_PPM).toEqual({ tag: 10, anchors: -10, delta: 20 })
    expect(UWB_PPM_MAX).toBe(20)
    expect(Math.abs(BASE_PPM.tag)).toBeLessThan(UWB_PPM_MAX)
    expect(Math.abs(BASE_PPM.anchors)).toBeLessThan(UWB_PPM_MAX)
  })

  it('the two variants change the crystals and nothing else', () => {
    // "Perfect crystals" / "Temperature-compensated, ±1 ppm" — "which pins both ends to zero and
    // changes nothing else". The label spells the part out rather than writing TCXO, which is
    // glossed nowhere in the track and which a reader meets in a table cell and an experiment.
    expect(uwbSstwr.variants![0].scenario()).toEqual(uwbSstwrScenario({ tag: 0, anchors: 0 }))
    expect(uwbSstwr.variants![1].scenario()).toEqual(uwbSstwrScenario({ tag: 1, anchors: -1 }))
    expect(uwbSstwr.scenario()).toEqual(uwbSstwrScenario({ tag: 10, anchors: -10 }))
    expect(PERFECT_PPM).toEqual({ tag: 0, anchors: 0, delta: 0 })
    expect(TCXO_PPM).toEqual({ tag: 1, anchors: -1, delta: 2 })
    const strip = (s: Scenario): unknown =>
      JSON.stringify({ ...s, nodes: s.nodes.map((n) => ({ ...n, uwb: { role: n.uwb!.role } })) })
    for (const v of uwbSstwr.variants!) expect(strip(v.scenario())).toEqual(strip(uwbSstwr.scenario()))
  })

  it('one poll at 0 ns reaches all four anchors after 12 ns, and the round is five 2 ms slots', () => {
    // observe 1: "One poll at 0 ns produces four RX_START records, all at 12 ns: the anchors are
    //  equally far. The round spends five slots of 2 ms."
    const rs = recs()
    expect(metresToNs(RING_M).toFixed(3)).toBe('11.675')
    expect(Math.ceil(metresToNs(RING_M))).toBe(12)
    const txs = ofType(rs, 'TX_START')
    expect(txs.map((r) => `${r.node}/${r.frame.kind}@${r.t}`)).toEqual([
      'tag-1/uwbPoll@0', 'anchor-1/uwbResp@2000000', 'anchor-2/uwbResp@4000000',
      'anchor-3/uwbResp@6000000', 'anchor-4/uwbResp@8000000',
    ])
    const polls = ofType(rs, 'RX_START').filter((r) => r.t < MS)
    expect(polls).toHaveLength(4)
    for (const r of polls) expect(r.t, r.node).toBe(12)
    const round = ofType(rs, 'UWB_ROUND')
    expect(round).toHaveLength(1)
    expect(round[0].method).toBe('ss')
    expect(round[0].slots).toBe(5)
    expect(round[0].slotNs).toBe(2 * MS)
    expect(ofType(rs, 'UWB_SLOT').map((r) => r.t)).toEqual([0, 2 * MS, 4 * MS, 6 * MS, 8 * MS])
  })
})

describe('uwb-sstwr · the raw error the crystal offset buys', () => {
  it('the formula note’s reply term is 6.0 m, and the flight term is micrometres', () => {
    // the raw formula's note: "The first scales the flight: micrometres. The second scales the
    //  wait — half of a 2 ms reply at 20 ppm is 20 ns, or 6.0 m." / deeper: "Tprop·eA scales an
    //  11.675 ns flight by 10 ppm: 0.12 picoseconds, 35 micrometres" / "about a hundred and
    //  seventy thousand times the flight"
    const tpropNs = metresToNs(RING_M)
    const flightTermNs = tpropNs * BASE_PPM.tag * 1e-6
    expect((flightTermNs * 1000).toFixed(2)).toBe('0.12') // picoseconds
    expect(Math.round(flightTermNs * C_M_PER_NS * 1e6)).toBe(35) // micrometres
    expect(flightTermNs * C_M_PER_NS).toBeLessThan(1e-3) // "micrometres", not millimetres
    // "a hundred and seventy thousand times the flight": the ratio is 171 306, and it is that
    // number rounded to the nearest ten thousand that the prose speaks
    expect(Math.round((2 * MS) / tpropNs / 10_000) * 10_000).toBe(170_000)
    const replyTermNs = (2 * MS * BASE_PPM.delta * 1e-6) / 2
    expect(replyTermNs).toBe(20)
    expect((replyTermNs * C_M_PER_NS).toFixed(1)).toBe('6.0')
    // the raw formula, operand for operand, and the two terms it expands to
    expect(formulas()[0].text).toContain('(Tround·(1 + eA) − Treply·(1 + eB)) / 2')
    expect(formulas()[0].text).toContain('Tprop + Tprop·eA + ½·Treply·(eA − eB)')
    expect(deeperProse()).toContain('Tround = Treply + 2·Tprop')
  })

  it('every anchor answers in its own slot, so Treply is i × 2 ms − Tprop — on the anchor’s clock', () => {
    // the table's "Treply" column, "i ms − Tprop", and the picture's "The anchor in the first slot
    //  waits one slot before answering, the anchor in the fourth waits four"
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    expect(resp).toHaveLength(4)
    resp.forEach((r, i) => {
      const treplyNs = r.frame.uwb!.replyRctu! * RCTU_NS
      const trueNs = (i + 1) * 2 * MS - metresToNs(RING_M)
      // the anchors run 10 ppm slow, so each measures the interval 1 + eB times too long
      expect(treplyNs, `slot ${i + 1}`).toBeCloseTo(trueNs * (1 + BASE_PPM.anchors * 1e-6), 0)
      // halved, that shortfall is 3 m per slot — half the raw error; the tag's own +10 ppm on
      // Tround supplies the other half, which is how eA − eB rather than either alone appears
    })
  })

  it('every cell of the four-anchor table is either the formula or the run', () => {
    // the four rows "anchor-i | i ms − Tprop | predicted | raw range | raw error"
    expect(table(0).rows).toHaveLength(4)
    const rs = ranges()
    table(0).rows.forEach((_row, i) => {
      const slot = i + 1
      const r = rs[i]
      expect(cell(0, i, 0), 'anchor').toBe(r.peer)
      expect(cell(0, i, 1), 'Treply').toBe(`${slot * 2} ms − Tprop`)
      // "Predicted error": the formula, to one decimal — and it lands on exactly i × 6.0 m
      expect(predictedRawErrM(slot, BASE_PPM).toFixed(1)).toBe((slot * 6).toFixed(1))
      expect(cell(0, i, 2), 'predicted').toBe(`${(slot * 6).toFixed(1)} m`)
      // "Raw range" and "Raw error": what the run reports, to two decimals
      expect(cell(0, i, 3), 'raw range').toBe(`${rctuToMetres(r.tofRawRctu!).toFixed(2)} m`)
      expect(cell(0, i, 4), 'raw error').toBe(`${rawErr(r).toFixed(2)} m`)
    })
  })

  it('the four raw ranges are 9.51, 15.47, 21.49 and 27.42 m against a true 3.50 m', () => {
    // the "Raw range" and "Raw error" columns, and the paragraph "The phone sits 3.50 m from every
    //  anchor and believes it is 9.51 m from one and 27.42 m from another."
    const rs = ranges()
    expect(rs).toHaveLength(4)
    expect(rs.map((r) => r.peer)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4'])
    expect(rs.every((r) => r.trueDistM === RING_M)).toBe(true)
    expect(rs.map((r) => rctuToMetres(r.tofRawRctu!).toFixed(2))).toEqual(['9.51', '15.47', '21.49', '27.42'])
    expect(rs.map((r) => rawErr(r).toFixed(2))).toEqual(['6.01', '11.97', '17.99', '23.92'])
    // each is within a decimetre of the prediction, and is the engine's own raw figure
    rs.forEach((r, i) => {
      expect(Math.abs(rawErr(r) - predictedRawErrM(i + 1, BASE_PPM)), r.peer).toBeLessThan(0.15)
    })
    // and observe 2 walks the same four figures in order
    expect(uwbSstwr.observe[1])
      .toContain(rs.map((r) => rctuToMetres(r.tofRawRctu!).toFixed(2)).join(' → '))
  })

  it('the consecutive raw steps are 5.96, 6.02 and 5.93 m: one 2 ms of waiting costs six metres', () => {
    // observe 3: "Take the differences of consecutive raw values: 5.96, 6.02, 5.93 m. Every extra
    //  slot of waiting costs six more metres"
    const raw = ranges().map((r) => rctuToMetres(r.tofRawRctu!))
    const steps = [1, 2, 3].map((i) => raw[i] - raw[i - 1])
    expect(steps.map((d) => d.toFixed(2))).toEqual(['5.96', '6.02', '5.93'])
    for (const d of steps) expect(uwbSstwr.observe[2], d.toFixed(2)).toContain(d.toFixed(2))
    for (const d of steps) expect(Math.round(d)).toBe(6)
  })

  it('the raw estimate is exactly ssTwrRaw of the two counter differences', () => {
    // deeper, "The number the phone subtracts": "Anchor 1 stamps two ranging counters,
    //  26 381 597 885 and 26 509 391 059. Their difference, 127 793 174 RCTU, is exactly the reply
    //  time its response carries … The phone’s own pair differs from it by 4056 ticks."
    const rs = recs()
    const ts = ofType(rs, 'UWB_TS')
    const tagTx = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx')!.counter
    const a1 = ts.filter((r) => r.node === 'anchor-1')
    expect(a1.map((r) => r.counter)).toEqual([26_381_597_885, 26_509_391_059])
    const treply = counterDiff(a1[1].counter, a1[0].counter)
    expect(treply).toBe(127_793_174)
    const resp = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbResp')[0]
    expect(resp.frame.uwb!.replyRctu).toBe(treply)
    const tagRx = ts.find((r) => r.node === 'tag-1' && r.dir === 'rx')!.counter
    const tround = counterDiff(tagRx, tagTx)
    expect(tround - treply).toBe(4056)
    expect(ranges()[0].tofRawRctu).toBe(ssTwrRaw(tround, treply))
    // Re-paced 2026-09-26: §5.3 deletes the depth paragraph 「手机减掉的那个数」, which
    // re-printed the three counters the worked table prints one screen above it. The pin
    // moved with them: the counters are now checked against the table's own cells, and the
    // 4056 the depth still quotes is checked where it still stands.
    for (const [row, want] of [[1, '26 381 597 885'], [2, '26 509 391 059'], [3, '127 793 174']] as const) {
      expect(cell(3, row, 1), want).toBe(want)
    }
    expect(deeperProse()).toContain('4056')
  })
})

describe('uwb-sstwr · what the clock-offset correction puts back', () => {
  it('the corrected formula is the engine’s ssTwrCorrected, Treply scaled by (1 − Coffs)', () => {
    // "T̂prop = (Tround − Treply·(1 − Coffs)) / 2" — the second formula block
    expect(formulas()[1].text).toBe('T̂prop = (Tround − Treply·(1 − Coffs)) / 2')
    expect(ssTwrCorrected(1000, 800, 0)).toBe(ssTwrRaw(1000, 800))
    // Coffs is the responder's rate relative to the initiator's: here −20 ppm, and it removes the bias
    const eA = BASE_PPM.tag * 1e-6
    const eB = BASE_PPM.anchors * 1e-6
    const treply = 2 * MS / RCTU_NS
    const tround = treply + 2 * (metresToNs(RING_M) / RCTU_NS)
    const biased = ssTwrRaw(tround * (1 + eA), treply * (1 + eB))
    expect(rctuToMetres(biased) - RING_M).toBeCloseTo(6, 1)
    const fixed = ssTwrCorrected(tround * (1 + eA), treply * (1 + eB), eB - eA)
    expect(rctuToMetres(fixed)).toBeCloseTo(RING_M, 3)
  })

  it('the Coffs the engine actually used is −20 ppm, the responder’s rate minus the initiator’s', () => {
    // picture: "That ratio is the clock offset, measured rather than assumed, and the simulator
    //  carries it on every received frame as Coffs."
    // Coffs is on no record, so recover it by inverting ssTwrCorrected:
    //   2·tof = Tround − Treply·(1 − Coffs)  ⇒  Coffs = (2·tof − Tround + Treply) / Treply
    const rs = recs()
    const ts = ofType(rs, 'UWB_TS')
    const tagTx = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx')!.counter
    const tagRx = ts.filter((r) => r.node === 'tag-1' && r.dir === 'rx').map((r) => r.counter)
    const replies = ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'uwbResp').map((r) => r.frame.uwb!.replyRctu!)
    const nominal = (BASE_PPM.anchors - BASE_PPM.tag) * 1e-6 // eB − eA = −20 ppm
    expect(nominal).toBeCloseTo(-20e-6, 12)
    ranges().forEach((r, i) => {
      const tround = counterDiff(tagRx[i], tagTx)
      const coffs = (2 * r.tofRctu - tround + replies[i]) / replies[i]
      // within five sigma of the estimator's own 0.2 ppm noise, and −20 ppm to the nearest ppm
      expect(Math.abs(coffs - nominal), `${r.peer}: ${(coffs * 1e6).toFixed(2)} ppm`)
        .toBeLessThan(5 * SESSION.cfoNoisePpm * 1e-6)
      expect(Math.round(coffs * 1e6), r.peer).toBe(-20)
    })
  })

  it('the four corrected ranges read 3.45, 3.42, 3.41 and 3.51 m against a true 3.50 m', () => {
    // the corrected formula's note: "The four range lines now read 3.45, 3.42, 3.41 and 3.51 m,
    //  on a ring built at one distance."
    expect(ranges().map((r) => fmtRecord(r))).toEqual([
      'tag-1 range → anchor-1 (SS): 3.45 m (true 3.50 m, raw 9.51 m)',
      'tag-1 range → anchor-2 (SS): 3.42 m (true 3.50 m, raw 15.47 m)',
      'tag-1 range → anchor-3 (SS): 3.41 m (true 3.50 m, raw 21.49 m)',
      'tag-1 range → anchor-4 (SS): 3.51 m (true 3.50 m, raw 27.42 m)',
    ])
    for (const r of ranges()) expect(formulas()[1].note!, r.peer).toContain(r.distM.toFixed(2))
    for (const r of ranges()) expect(rctuToMetres(r.tofRctu)).toBeCloseTo(r.distM, 9)
  })

  it('observe 2’s span holds: the corrected column stays between 3.41 and 3.51 m', () => {
    // "The corrected figures stay between 3.41 and 3.51 m" — anchor 4 is 3.51 m, not "about 3.4 m",
    // and quiz 3 turns on exactly that: it is the most accurate of the four at +0.5 cm.
    // by number, then formatted: comparing the fixed(2) strings happens to agree here, but
    // would order "10.00" below "9.00" the moment a scene put an anchor past ten metres.
    const shown = ranges().map((r) => r.distM)
    const lo = Math.min(...shown).toFixed(2)
    const hi = Math.max(...shown).toFixed(2)
    expect([lo, hi]).toEqual(['3.41', '3.51'])
    expect(uwbSstwr.observe[1]).toContain(`${lo} 与 ${hi} m`)
    // quiz 3: anchor 4 really is the closest to the truth of the four
    const err = ranges().map((r) => Math.abs(r.distM - RING_M))
    expect(err.indexOf(Math.min(...err))).toBe(3)
  })

  it('every cell of "What the correction leaves" is the residual formula or the run', () => {
    // the table Anchor | Reply | Leftover, 1-σ | Error this run, and deeper's "the leftover is
    //  3.0 cm for every millisecond the anchor waited. Anchor 3’s −9.5 cm is well inside its own
    //  18.0 cm sigma."
    expect(table(2).rows).toHaveLength(4)
    const fmtCm = (m: number): string => `${m >= 0 ? '+' : '−'}${Math.abs(m * 100).toFixed(1)} cm`
    table(2).rows.forEach((_row, i) => {
      const slot = i + 1
      const r = ranges()[i]
      expect(cell(2, i, 0), 'anchor').toBe(r.peer)
      expect(cell(2, i, 1), 'reply').toBe(`${slot * 2} ms`)
      expect(cell(2, i, 2), 'sigma').toBe(`${(residualSigmaM(slot) * 100).toFixed(1)} cm`)
      expect(cell(2, i, 3), 'error').toBe(fmtCm(r.distM - RING_M))
    })
    // the two figures deeper quotes, and the per-millisecond rate behind the column
    expect((residualSigmaM(1) * 100).toFixed(1)).toBe('6.0')
    expect((residualSigmaM(4) * 100).toFixed(1)).toBe('24.0')
    expect(((SESSION.cfoNoisePpm * 1e-6 * MS) / 2 * C_M_PER_NS * 100).toFixed(1)).toBe('3.0')
    const deep = deeperProse()
    for (const s of ['20 ppm', '0.2 ppm', '3.0 cm', '−9.5 cm', '18.0 cm']) expect(deep, s).toContain(s)
  })

  it('every corrected error stays inside three sigma of its own slot’s residual', () => {
    // the last paragraph of `numbers`: "The last column is one draw from those distributions,
    //  which is why it does not grow: the widest of them landed nearest the truth."
    ranges().forEach((r, i) => {
      const bound = 3 * Math.hypot(residualSigmaM(i + 1), SIGMA_R)
      expect(Math.abs(r.distM - RING_M), `${r.peer} inside ${bound.toFixed(3)} m`).toBeLessThan(bound)
    })
    // anchor 3's −9.5 cm is inside one sigma of its own 18.0 cm residual
    expect(Math.abs(ranges()[2].distM - RING_M)).toBeLessThan(residualSigmaM(3))
    // the widest distribution is the last one, and it drew the smallest error
    const sigmas = [1, 2, 3, 4].map(residualSigmaM)
    expect(sigmas.indexOf(Math.max(...sigmas))).toBe(3)
    // and every corrected error is at least an order of magnitude smaller than its raw error
    for (const r of ranges()) expect(Math.abs(r.distM - RING_M)).toBeLessThan(Math.abs(rawErr(r)) / 40)
  })

  it('the Figure of Merit byte on every received timestamp decodes to 97 % within 0.5 ns', () => {
    // Re-paced 2026-09-26: §5.1 · 9 makes `uwb-nlos` the single home of this byte, so the depth
    // paragraph that decoded 0x16 bit by bit is gone from this lesson. The pin did not go with
    // it — it now guards the ENGINE alone (`fomDecode`, `fomText`, `FOM_LOS`) plus the one claim
    // this lesson still makes about the byte in step 7: the record carries a FoM and never an
    // error bar. The three lookup tables are waiting for `uwb-nlos` to claim the sentences.
    expect(FOM_LOS).toBe(0x16)
    expect(FOM_LOS & 0x7).toBe(6)
    expect((FOM_LOS >> 3) & 0x3).toBe(2)
    expect((FOM_LOS >> 5) & 0x3).toBe(0)
    expect(fomDecode(FOM_LOS)).toEqual({ levelPct: 97, intervalNs: 0.5 })
    // the two parenthetical lookups separately, decoded rather than assumed: the four scale
    // indices are a fixed ladder, and whichever of them is the identity is the one whose decode
    // equals the byte's own interval read at scale 2 — so nothing here presumes index 1 is ×1.
    const atScale = (i: number) => fomDecode((FOM_LOS & 0x1f) | (i << 5)).intervalNs
    expect([0, 1, 2, 3].map(atScale)).toEqual([0.5, 1, 2, 4])
    const identity = [0, 1, 2, 3].findIndex((i) => atScale(i) === atScale(2) / 2)
    expect(atScale(identity)).toBe(1) // interval index 2 is 1 ns, read at the identity scale
    expect(fomDecode(FOM_LOS).intervalNs).toBe(0.5 * atScale(identity))
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
    expect((0.5 / 2).toFixed(2)).toBe('0.25')
    expect(((fomDecode(FOM_LOS).intervalNs / 2) * C_M_PER_NS * 100).toFixed(1)).toBe('7.5')
    const rxTs = ofType(recs(), 'UWB_TS').filter((r) => r.dir === 'rx')
    expect(rxTs).toHaveLength(8)
    for (const r of rxTs) expect(fmtRecord(r), r.node).toContain('(97 % within 0.5 ns)')
    for (const r of ranges()) expect(r.fom).toBe(FOM_LOS)
    // step 7 names the byte and says what it is NOT; nothing on the main path or in the
    // depth decodes it any more, which is what §5.1 · 9 asked for.
    expect(stepItems()[6]).toContain('品质因数（figure of merit, FoM）')
    expect(stepItems()[6]).toContain('从来没有误差棒')
    for (const s of ['0x16', '97 %', '7.5 cm', '置信']) expect(deeperProse(), s).not.toContain(s)
  })
})

/**
 * The `timing` figure §4 asks of this lesson (Tround 与 Treply 画在两只钟上，四个
 * 时隙上的斜坡). Its geometry — nothing outside the viewBox, no two labels touching
 * — is checked course-wide in tests/course/diagram.test.ts; what belongs here is
 * that every instant and every number in it is this run's own.
 */
describe('uwb-sstwr · the figure', () => {
  const fig = (): TimingSpec => {
    const b = uwbSstwr.picture!.find((x): x is Extract<Block, { kind: 'diagram' }> => x.kind === 'diagram')!
    expect(b.spec.kind).toBe('timing')
    return b.spec as TimingSpec
  }

  it('is one diagram, on the main path, after the paragraph that names the crystals', () => {
    const at = uwbSstwr.picture!.findIndex((b) => b.kind === 'diagram')
    expect(uwbSstwr.picture!.filter((b) => b.kind === 'diagram')).toHaveLength(1)
    expect((uwbSstwr.numbers ?? []).filter((b) => b.kind === 'diagram')).toHaveLength(0)
    // 晶振（crystal）and ppm are named in the paragraph above it: a figure's labels are
    // graded prose, and they come before its caption in the reader's order.
    expect(at).toBeGreaterThan(uwbSstwr.picture!.findIndex((b) => b.heading === '一块从没被校准过的晶振'))
  })

  it('the phone’s lane is the run’s own five transmissions and receptions', () => {
    const tx = ofType(recs(), 'TX_START')
    const poll = tx.find((r) => r.frame.kind === 'uwbPoll')!
    expect([FIG.pollTx * 1000, FIG.pollTxEnd * 1000]).toEqual([poll.t, poll.t + poll.frame.txTimeNs])
    const resp = tx.filter((r) => r.frame.kind === 'uwbResp')
    expect(resp).toHaveLength(4)
    resp.forEach((r, i) => {
      expect(r.t, `slot ${i + 1}`).toBe((i + 1) * FIG.slotUs * 1000)
      expect(r.frame.txTimeNs / 1000).toBeCloseTo(FIG.respUs, 3)
    })
    // the flight the figure draws is the ring's own, rounded to the nanosecond the log prints
    expect(Math.ceil(metresToNs(RING_M)) / 1000).toBeCloseTo(FIG.flightUs, 6)
    const lanes = fig().lanes
    expect(lanes).toHaveLength(5)
    expect(lanes[0].label).toBe('手机 tag-1')
    expect(lanes[0].spans).toHaveLength(5)
    expect(lanes[0].spans[0].label).toBe('发 Poll')
  })

  it('each anchor’s grey bar is its own reply time, and its label its own raw error', () => {
    const lanes = fig().lanes.slice(1)
    expect(lanes.map((l) => l.label)).toEqual(['锚点 1', '锚点 2', '锚点 3', '锚点 4'])
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    lanes.forEach((l, i) => {
      expect(l.spans, l.label).toHaveLength(1)
      // the bar ends exactly when that anchor answers, so its length IS Treply
      expect(l.spans[0].toUs * 1000, l.label).toBe(resp[i].t)
      const treplyNs = resp[i].frame.uwb!.replyRctu! * RCTU_NS
      expect(Math.abs((l.spans[0].toUs - l.spans[0].fromUs) * 1000 - treplyNs), l.label).toBeLessThan(200)
      // and the label is the run's own raw error, to two decimals, as the table's last column
      const want = `+${rawErr(ranges()[i]).toFixed(2)} m`
      expect(l.spans[0].label, l.label).toBe(want)
      expect(FIG.rawErrM[i]).toBe(want)
      expect(cell(0, i, 4)).toBe(want.slice(1))
    })
    // the four bars really do ramp: each one slot longer than the last
    const ends = lanes.map((l) => l.spans[0].toUs)
    expect(ends).toEqual([2000, 4000, 6000, 8000])
  })

  it('the window holds the whole round and the axis ticks fall inside it', () => {
    const round = ofType(recs(), 'UWB_ROUND')[0]
    expect(round.slots * round.slotNs).toBe(10_000_000)
    // the figure stops after the fourth answer rather than drawing the empty fifth slot
    expect(FIG.windowUs * 1000).toBeGreaterThan(4 * FIG.slotUs * 1000 + FIG.respUs * 1000)
    expect(FIG.windowUs * 1000).toBeLessThan(round.slots * round.slotNs)
    expect(fig().axis).toEqual({ fromUs: 0, toUs: FIG.windowUs, ticks: [0, 4000, 8000], unit: 'µs' })
  })
})

describe('uwb-sstwr · the two variants and the crystals table', () => {
  it('"Perfect crystals": the ramp disappears and only timestamp noise is left', () => {
    // try-this 1: "The ramp vanishes: the raw errors are centimetres either way … What is left is
    //  timestamp noise, whose 1-σ is 2.1 cm."
    const rs = ranges(0)
    expect(rs).toHaveLength(4)
    expect(rs.map((r) => (rawErr(r) * 100).toFixed(1))).toEqual(['1.9', '-1.9', '0.7', '-6.1'])
    for (const r of rs) expect(Math.abs(rawErr(r)), r.peer).toBeLessThan(0.15)
    expect((SIGMA_R * 100).toFixed(1)).toBe('2.1')
    expect(uwbSstwr.tryThis[0]).toContain(`${(SIGMA_R * 100).toFixed(1)} cm`)
    // nothing about the raw error now depends on the slot: every one is inside the timestamp-noise
    // envelope (4 σ, so that the −6.1 cm draw at anchor 4 — 2.9 σ — is not one sample from flapping)
    for (const r of rs) expect(Math.abs(rawErr(r)), r.peer).toBeLessThan(4 * SIGMA_R)
  })

  it('"TCXOs, ±1 ppm" is a TENTH of the base offset, and gives a tenth of the ramp', () => {
    // try-this 2: "a tenth of the base offset" / "about 0.60 m a slot" / "Better crystals buy an
    //  order of magnitude" — all three say the same factor, 10, which the crystals table prints
    //  as 20 ppm against 2 ppm.
    expect(BASE_PPM.delta).toBe(20)
    expect(TCXO_PPM.delta).toBe(2)
    expect(BASE_PPM.delta / TCXO_PPM.delta).toBe(10)
    expect(uwbSstwr.tryThis[1]).toContain('十分之一')
    // the formula's per-slot cost is a tenth too: 0.5996 m against 5.996 m
    for (const slot of [1, 2, 3, 4]) {
      expect(predictedRawErrM(slot, BASE_PPM) / predictedRawErrM(slot, TCXO_PPM)).toBeCloseTo(10, 6)
    }
    expect(predictedRawErrM(1, TCXO_PPM).toFixed(2)).toBe('0.60')
    expect(predictedRawErrM(1, BASE_PPM).toFixed(2)).toBe('6.00')
    expect(uwbSstwr.tryThis[1]).toContain(predictedRawErrM(1, TCXO_PPM).toFixed(2))
  })

  it('"TCXOs, ±1 ppm": the ramp survives at 0.60 m per slot, still metres on a 3.50 m range', () => {
    // the crystals table's TCXO row, and try-this 2's "The ramp survives at about 0.60 m a slot"
    const rs = ranges(1)
    expect(rs).toHaveLength(4)
    expect(rs.map((r) => rawErr(r).toFixed(2))).toEqual(['0.62', '1.18', '1.80', '2.34'])
    rs.forEach((r, i) => {
      const predictedM = predictedRawErrM(i + 1, TCXO_PPM)
      expect(predictedM.toFixed(2), r.peer).toBe(((i + 1) * 0.5996).toFixed(2))
      expect(Math.abs(rawErr(r) - predictedM), r.peer).toBeLessThan(0.15)
      // and the measured ramp is a tenth of the measured base ramp, to within the timestamp noise
      expect(Math.abs(rawErr(r) * 10 - rawErr(ranges()[i])), r.peer).toBeLessThan(10 * 0.15)
    })
    // the last one is still most of the distance again — a 3.50 m range measured metres wrong
    expect(Math.abs(rawErr(rs[3]))).toBeGreaterThan(RING_M / 2)
  })

  it('every cell of the crystals table is a scene’s own offset or a run’s own error', () => {
    // "The same ramp, three pairs of crystals": Crystals | eA − eB | Raw error, slot 1 | slot 4
    const rows: [string, { delta: number }, number | undefined][] = [
      ['Perfect crystals', PERFECT_PPM, 0],
      ['Temperature-compensated, ±1 ppm', TCXO_PPM, 1],
      ['This scene, ±10 ppm', BASE_PPM, undefined],
    ]
    rows.forEach(([label, ppm, variant], i) => {
      expect(cell(1, i, 1), 'delta').toBe(`${ppm.delta} ppm`)
      const rs = ranges(variant)
      // centimetres for the perfect pair, metres for the other two: whichever the cell prints,
      // it prints the run's own figure
      const shown = [rs[0], rs[3]].map((r) => rawErr(r))
      const expected = shown.map((m) => (Math.abs(m) < 0.1
        ? `${m >= 0 ? '+' : '−'}${Math.abs(m * 100).toFixed(1)} cm`
        : `${m.toFixed(2)} m`.replace('-', '−')))
      expect([cell(1, i, 2), cell(1, i, 3)], label).toEqual(expected)
    })
    // the two labels are the variant labels the reader sees in the panel
    expect(cell(1, 0, 0)).toBe(uwbSstwr.variants![0].label)
  })

  it('the correction rescues all three crystal settings alike', () => {
    // the whole point: the corrected column is flat whatever the crystals do
    for (const v of [undefined, 0, 1]) {
      const rs = ranges(v)
      rs.forEach((r, i) => {
        const bound = 3 * Math.hypot(residualSigmaM(i + 1), SIGMA_R)
        expect(Math.abs(r.distM - RING_M), `${String(v)} ${r.peer}`).toBeLessThan(bound)
      })
    }
  })
})

/**
 * The procedure the 2026-09-23 amendment asks for ("mechanism before metaphor"):
 * the steps the engine actually takes, in its order, and the worked example that
 * runs them on anchor 1. Every step is checked against the function or the record
 * it names — the four `UWB_TS` records for the stamps, `counterDiff` for the two
 * subtractions, `ssTwrRaw` / `ssTwrCorrected` for the halving and `rctuToMetres`
 * for the last multiplication.
 */
describe('uwb-sstwr · the procedure, step by step', () => {
  /** The lesson's steps block of `numbers`. */
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbSstwr.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  /** A counter as the worked example prints it: thousands separated by a thin space. */
  const fmt = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')
  /** The four ranging-counter readings of the anchor-1 exchange, in the order they are taken. */
  const stamps = () => {
    const ts = ofType(recs(), 'UWB_TS')
    const txPoll = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx' && r.frameKind === 'uwbPoll')!
    const rxPoll = ts.find((r) => r.node === 'anchor-1' && r.dir === 'rx' && r.frameKind === 'uwbPoll')!
    const txResp = ts.find((r) => r.node === 'anchor-1' && r.dir === 'tx' && r.frameKind === 'uwbResp')!
    const rxResp = ts.find((r) => r.node === 'tag-1' && r.dir === 'rx' && r.peer === 'anchor-1')!
    const treply = counterDiff(txResp.counter, rxPoll.counter)
    const tround = counterDiff(rxResp.counter, txPoll.counter)
    // invert ssTwrCorrected: the tof the record carries names exactly one Coffs
    const coffs = (2 * ranges()[0].tofRctu - tround + treply) / treply
    return { txPoll, rxPoll, txResp, rxResp, treply, tround, coffs }
  }

  it('is a steps block on the main path, not in `deeper`, and runs in the engine’s own order', () => {
    // amendment rule 3: the rule is written as a procedure, in `numbers`
    expect(uwbSstwr.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbSstwr.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    // the order the steps are written in is the order device.ts runs them in: stamp
    // the Poll out, stamp the Response out and carry Treply, stamp it in and subtract
    // Tround, read Coffs off the same reception, halve, scale to metres, report
    // the standard symbols the procedure has to name, in the order device.ts computes them
    const joined = steps().items.join(' | ')
    const at = ['Treply', 'Tround', 'Coffs'].map((t) => joined.indexOf(t))
    for (const [i, x] of at.entries()) expect(x, String(i)).toBeGreaterThanOrEqual(0)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('the four stamps of the worked example are the four UWB_TS counters of the run', () => {
    const { txPoll, rxPoll, txResp, rxResp } = stamps()
    expect([cell(3, 0, 1), cell(3, 1, 1), cell(3, 2, 1), cell(3, 4, 1)])
      .toEqual([fmt(txPoll.counter), fmt(rxPoll.counter), fmt(txResp.counter), fmt(rxResp.counter)])
    // two at each end, and each end subtracts only its own pair (device.ts `onResponse`)
    expect(txPoll.node).toBe(rxResp.node)
    expect(rxPoll.node).toBe(txResp.node)
    expect(txPoll.node).not.toBe(rxPoll.node)
  })

  it('Treply and Tround are the two differences the engine takes, and the cells print them', () => {
    const { treply, tround } = stamps()
    expect(cell(3, 3, 1)).toBe(fmt(treply))
    expect(cell(3, 5, 1)).toBe(fmt(tround))
    // the reply is a whole 2 ms slot of waiting, and the round trip differs from it
    // by 4056 counts — twice the flight, plus the whole of the clock error
    expect((treply * RCTU_NS) / MS).toBeCloseTo(2, 3)
    expect(tround - treply).toBe(4056)
  })

  it('Coffs is the crystals’ own offset, and the cell prints what the run implies', () => {
    const { coffs } = stamps()
    const shown = `${(coffs * 1e6).toFixed(2)} ppm`.replace('-', '−')
    expect(cell(3, 6, 1)).toBe(shown)
    expect(steps().items[3]).toContain(shown)
    // and it is the two crystals' difference, inside the estimator's own residual
    expect(Math.abs(coffs * 1e6 - (BASE_PPM.anchors - BASE_PPM.tag))).toBeLessThan(4 * SESSION.cfoNoisePpm)
  })

  it('the two half-differences are ssTwrRaw and ssTwrCorrected, in counts and in metres', () => {
    const { treply, tround, coffs } = stamps()
    const range = ranges()[0]
    const raw = ssTwrRaw(tround, treply)
    expect(raw).toBe(range.tofRawRctu)
    expect(cell(3, 7, 1)).toBe(`${raw} · ${rctuToMetres(raw).toFixed(2)} m`)
    // the corrected half-difference is the record's own tof, and its metres the record's distM
    expect(ssTwrCorrected(tround, treply, coffs)).toBeCloseTo(range.tofRctu, 9)
    expect(cell(3, 8, 1)).toBe(`${range.tofRctu.toFixed(1)} · ${range.distM.toFixed(2)} m`)
    expect(steps().items[5]).toContain(`${range.distM.toFixed(2)} m`)
    expect(steps().items[5]).toContain(`${range.trueDistM.toFixed(2)} m`)
  })

  it('one count is 15.65 ps, and the last multiplication is by it and by c', () => {
    expect((RCTU_NS * 1000).toFixed(2)).toBe('15.65')
    expect(steps().items[5]).toContain('15.65 ps')
    // proven rather than asserted: over every range of every variant, metres are
    // always counts × one count × c
    for (const v of [undefined, 0, 1]) {
      for (const r of ranges(v)) expect(r.distM, r.peer).toBeCloseTo(r.tofRctu * RCTU_NS * C_M_PER_NS, 12)
    }
  })

  it('the record carries a Figure of Merit and no error bar; the 1-σ is computed apart', () => {
    // last step: "a Figure of Merit byte — never an error bar"
    for (const r of ranges()) {
      expect(r.fom).toBe(FOM_LOS)
      expect(Object.keys(r)).not.toContain('sigmaM')
    }
    // Review I4: `rangeSigmaM` enters the COVARIANCE only (Σ = σ_r²(JᵀJ)⁻¹); the Gauss–Newton
    // normal equations are unweighted and no caller reads a per-range sigma, so the step now
    // says the ellipse, not the fix — which is what uwb-geometry has said all along.
    expect(SIGMA_R).toBeCloseTo((C_M_PER_NS * SESSION.tsNoisePs) / 1000 / Math.SQRT2, 12)
    expect(steps().items[6]).toContain(`${(SIGMA_R * 100).toFixed(1)} cm`)
    expect(steps().items[6]).toContain(`${SESSION.tsNoisePs} ps`)
    // the solver's own answer does not move when the sigma does: only the ellipse and GDOP do
    const anchors = [
      { id: 'a', x: 0, y: 0, z: 2 }, { id: 'b', x: 8, y: 0, z: 2 },
      { id: 'c', x: 8, y: 6, z: 2 }, { id: 'd', x: 0, y: 6, z: 2 },
    ]
    const rs = anchors.map((a2) => ({ id: a2.id, distM: Math.hypot(a2.x - 3, a2.y - 2, a2.z - 1) + 0.01 }))
    const one = solvePosition(anchors, rs, 1, SIGMA_R)!
    const ten = solvePosition(anchors, rs, 1, SIGMA_R * 10)!
    expect([one.x, one.y]).toEqual([ten.x, ten.y])
    expect(one.residualM).toBe(ten.residualM)
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The tables, the worked example and the steps are read back above; the derivation that leads
 * to them is not.** The sweep of 2026-10-13 plants one edit per printed figure and runs this
 * file: of the 148 figures this lesson prints, **87** could be edited with the suite green, four
 * of them without an equal literal anywhere under `tests/` — including the two scale factors
 * 1.00001 and 0.99999, which are the whole mechanism of the lesson.
 *
 * Nothing new is measured below. Every assertion calls the same `recs`, `ranges`, `rawErr`,
 * `predictedRawErrM`, `residualSigmaM`, `ssTwrRaw`, `stamps`-style helpers the tests above call,
 * and the figure comes out of the prose instead of out of this file.
 */
describe('uwb-sstwr · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uwbSstwr).map((t) => t.text).join('\n')
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
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const pic = (uwbSstwr.picture ?? []).map(blockText).join('\n')
  const nums = (uwbSstwr.numbers ?? []).map(blockText).join('\n')
  const deep = (uwbSstwr.deeper ?? []).map(blockText).join('\n')
  const limitsText = (uwbSstwr.limits ?? []).map((l) => l.text).join('\n')
  const srcText = (uwbSstwr.sources ?? []).join('\n')
  const obs = uwbSstwr.observe.join('\n')
  const trys = uwbSstwr.tryThis.join('\n')
  const quizText = uwbSstwr.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  const ANCHORS = ranges().length
  const FLIGHT_NS = metresToNs(RING_M)
  /** The slot this session runs, measured: two anchors' responses are one slot apart. */
  const SLOT_MS = (() => {
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    expect(resp.length, 'the run really sends responses').toBeGreaterThan(1)
    return (resp[1]!.t - resp[0]!.t) / MS
  })()

  it('every ppm the lesson names is a crystal this lesson runs, or the estimator’s own noise', () => {
    const known = new Set<number>([
      Math.abs(BASE_PPM.tag), Math.abs(BASE_PPM.anchors), Math.abs(BASE_PPM.delta),
      Math.abs(PERFECT_PPM.tag), Math.abs(PERFECT_PPM.delta),
      Math.abs(TCXO_PPM.tag), Math.abs(TCXO_PPM.delta),
      SESSION.cfoNoisePpm, UWB_PPM_MAX,
    ])
    for (const v of everyFig(/([\d.]+) ppm/g, 'a ppm the prose names', 12)) {
      const ppm = val(v)
      // the Coffs the run reports is the two crystals' difference plus the estimator's residual
      if (Math.abs(ppm - Math.abs(BASE_PPM.delta)) <= 4 * SESSION.cfoNoisePpm && ppm !== Math.abs(BASE_PPM.delta)) continue
      expect([...known], `${ppm} ppm is a crystal this lesson runs, or its estimator’s noise`)
        .toContain(ppm)
    }
    // 「标准给的晶振容差是 ±20 ppm（§16.4.9）」, and the pair the scene picks inside it
    const [tol] = figs(pic, /标准给的晶振容差是 ±(\d+) ppm/, '`picture` on the standard’s tolerance')
    expect(tol, 'the tolerance `phy.ts` exports').toBe(UWB_PPM_MAX)
    const [tagPpm, anchorPpm, delta] = figs(pic,
      /手机 \+(\d+) ppm，锚点 −(\d+) ppm，差出 (\d+) ppm/,
      '`picture` on the pair it picks out of that range')
    expect(tagPpm, 'the tag’s own crystal').toBe(BASE_PPM.tag)
    expect(-anchorPpm!, 'the anchors’ own').toBe(BASE_PPM.anchors)
    expect(delta, 'and the difference between them').toBe(Math.abs(BASE_PPM.delta))
    expect(Math.max(tagPpm!, anchorPpm!), 'both inside the standard’s tolerance')
      .toBeLessThanOrEqual(tol!)
  })

  it('the two scale factors, which are the whole mechanism', () => {
    /*
     * 「手机快 10 ppm……它量出来的往返是真值的 1.00001 倍……每个锚点慢 10 ppm，它量出来的灰条是
     * 真值的 0.99999 倍」. **Neither factor had an equal literal anywhere under `tests/`** — the
     * one pair of numbers the whole lesson turns on was the one nothing was watching.
     */
    const [fastPpm, fast, slowPpm, slow] = raw(pic,
      /手机快 (\d+) ppm[\s\S]*?它量出来的往返是真值的 ([\d.]+) 倍[\s\S]*?每个锚点慢 (\d+) ppm，它量出来的灰条是真值的 ([\d.]+) 倍/,
      '`picture` on the two factors')
    expect(val(fastPpm!), 'the tag’s crystal').toBe(BASE_PPM.tag)
    expect(-val(slowPpm!), 'and the anchors’').toBe(BASE_PPM.anchors)
    same(fast!, 1 + BASE_PPM.tag * 1e-6, 'the factor the tag’s own clock scales by')
    same(slow!, 1 + BASE_PPM.anchors * 1e-6, 'and the factor the anchors’ clocks scale by')
    // 「一个乘 1.00001，一个乘 0.99999，而它们接下来是要相减的」 — both printed a second time
    const again = [...pic.matchAll(/一个乘 ([\d.]+)，一个乘 ([\d.]+)/g)].map((m) => m.slice(1))
    expect(again.length, 'the pair is restated once more').toBe(1)
    expect(again[0], 'and both times they are the same two factors').toEqual([fast, slow])
  })

  it('the chain from a 2 ms reply to six metres, every step of it', () => {
    // 「一趟飞行只有 11.675 ns」 — in `picture` and again in `deeper`
    for (const v of everyFig(/([\d.]+) ns 的飞行时间|一趟飞行只有 ([\d.]+) ns/g,
      'the flight time of this ring', 2)) {
      same(v, FLIGHT_NS, 'the flight time the ring’s radius gives')
    }
    // 「一个锚点等 1 个时隙，灰条是 2 ms：取一半得 1 ms，乘 20 ppm 得 20 ns。20 ns 是光走 5.996 m
    //  要的时间，于是 raw 距离就长出将近六米」
    const [slots, grey, half, ppm, ns, nsAgain, metres] = figs(pic,
      /等 (\d+) 个时隙，灰条是 (\d+) ms：取一半得 (\d+) ms，乘 (\d+) ppm 得 (\d+) ns。(\d+) ns 是光走 ([\d.]+) m 要的时间/,
      '`picture` on the chain from a reply to a distance')
    expect(grey! / slots!, 'the slot this scene runs').toBe(SLOT_MS)
    expect(half! * 2, 'half of that reply').toBe(grey)
    expect(ppm, 'the crystals’ difference').toBe(Math.abs(BASE_PPM.delta))
    expect(half! * MS * ppm! * 1e-6, 'half the reply scaled by the difference, in nanoseconds')
      .toBeCloseTo(ns!, 9)
    expect(nsAgain, 'the same nanoseconds, restated in the same sentence').toBe(ns)
    same(String(metres), ns! * C_M_PER_NS, 'and what light covers in them')
    // the formula's own note: 「2 ms 的应答取一半再乘 20 ppm，就是 20 ns，合 6.0 m」
    const [noteMs, notePpm, noteNs, noteM] = figs(nums,
      /(\d+) ms 的应答取一半再乘 (\d+) ppm，就是 (\d+) ns，合 ([\d.]+) m/,
      'the formula’s note on the same chain')
    expect([noteMs, notePpm, noteNs], 'the same three figures the picture works through')
      .toEqual([grey, ppm, ns])
    same(String(noteM), ((noteMs! * MS) / 2) * notePpm! * 1e-6 * C_M_PER_NS,
      'and the metres its own arithmetic gives')
    // 「图上四条灰条标的 +6.01、+11.97、+17.99、+23.92 m，就是这一步乘 1、2、3、4」
    const printed = figs(pic,
      /图上四条灰条标的 \+([\d.]+)、\+([\d.]+)、\+([\d.]+)、\+([\d.]+) m，就是这一步乘 (\d)、(\d)、(\d)、(\d)/,
      '`picture` on the four grey bars')
    const errs = printed.slice(0, 4)
    const mult = printed.slice(4)
    expect(mult, 'the multipliers are one per slot, in order')
      .toEqual(Array.from({ length: ANCHORS }, (_x, i) => i + 1))
    ranges().forEach((r, i) => {
      same(String(errs[i]), rawErr(r), `anchor ${i + 1}: the raw error the run really makes`)
    })
    // 「这不是散布：四次读数全都偏长，每一个都是第一个的整数倍。手机距每个锚点都是 3.50 m」
    const [ring] = raw(nums, /手机距每个锚点都是 ([\d.]+) m/, '`numbers` on the ring’s radius')
    for (const r of ranges()) same(ring!, r.trueDistM, 'the true distance to every anchor')
    for (const [i, r] of ranges().entries()) {
      expect(Math.round(rawErr(r) / rawErr(ranges()[0]!)), `anchor ${i + 1} is that multiple of the first`)
        .toBe(i + 1)
    }
  })

  it('the three-crystal table’s own labels, and the two slots it compares', () => {
    const t = table(1)
    // 「时隙 1 的 raw 误差」 / 「时隙 4 的 raw 误差」 — the two columns are the first and last slot
    const [first, last] = [t.head[2]!, t.head[3]!].map(
      (h) => figs(h, /时隙 (\d) 的 raw 误差/, `the column heading 「${h}」`)[0]!)
    expect(first, 'the first slot an anchor answers in').toBe(1)
    expect(last, 'and the last of them').toBe(ANCHORS)
    // 「温补晶振，±1 ppm」 / 「本场景，±10 ppm」 — the row labels name the variants' own crystals
    const [tcxo] = figs(t.rows[1]![0]!, /±(\d+) ppm/, 'the TCXO row’s own label')
    expect(tcxo, 'the crystal that variant ships').toBe(Math.abs(TCXO_PPM.tag))
    const [mine] = figs(t.rows[2]![0]!, /±(\d+) ppm/, 'the shipped row’s own label')
    expect(mine, 'the crystal this scene ships').toBe(Math.abs(BASE_PPM.tag))
    // 「剩余误差 1σ」 — the sigma the residual column is quoted at
    const [sigmas] = figs(table(2).head[2]!, /剩余误差 (\d)σ/, 'the residual column’s own heading')
    expect(sigmas, 'one sigma').toBe(1)
  })

  it('the steps: the slot it starts in, the two half-differences and the ellipse’s own sigma', () => {
    const items = uwbSstwr.numbers!
      .find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!.items
    const joined = items.join('\n')
    // 「时隙 0。手机给 Poll 离开时的 RMARKER 打一个戳」
    const [slot0] = figs(joined, /时隙 (\d)。手机给 Poll 离开/, 'the steps on which slot the poll is in')
    const poll = ofType(recs(), 'UWB_TS')
      .find((r) => r.node === 'tag-1' && r.dir === 'tx' && r.frameKind === 'uwbPoll')!
    expect(slot0, 'the poll goes out in the round’s first slot').toBe(0)
    expect(poll.t, 'which starts the round').toBe(0)
    // 「这里是 −20.24 ppm——两块晶振相差的 20 ppm，加上估计器弄错的 0.2 ppm」
    const [coffsPpm, crystals, noise] = raw(joined,
      /这里是 (−[\d.]+) ppm——两块晶振相差的 (\d+) ppm，加上估计器弄错的 ([\d.]+) ppm/,
      'the steps on where Coffs comes from')
    expect(val(crystals!), 'the crystals’ own difference').toBe(Math.abs(BASE_PPM.delta))
    expect(val(noise!), 'and the estimator’s residual').toBe(SESSION.cfoNoisePpm)
    expect(Math.abs(Math.abs(val(coffsPpm!)) - Math.abs(BASE_PPM.delta)),
      'and the two together are what it reports').toBeLessThanOrEqual(4 * SESSION.cfoNoisePpm)
    // 「不算 Coffs 得到 2028 格……再折半，得到 734.6 格」 — neither had a literal anywhere
    const r0 = ranges()[0]!
    const [rawCounts] = raw(joined, /不算 Coffs 得到 (\d+) 格/, 'the steps on the raw half-difference')
    expect(val(rawCounts!), 'the raw half-difference the record carries').toBe(r0.tofRawRctu)
    const [corrCounts] = raw(joined, /再折半，得到 ([\d.]+) 格/, 'and on the corrected one')
    same(corrCounts!, r0.tofRctu, 'the corrected half-difference the record carries')
    // 「乘以一格的 15.65 ps，再乘以光速：3.45 m，真值是 3.50 m」
    const [ps, got, truth] = raw(joined, /乘以一格的 ([\d.]+) ps，再乘以光速：([\d.]+) m，真值是 ([\d.]+) m/,
      'the steps on the last multiplication')
    same(ps!, RCTU_NS * 1000, 'one count, in picoseconds')
    same(got!, r0.distM, 'the distance it reports')
    same(truth!, r0.trueDistM, 'and the one it should have')
    // 「100 ps ÷ √2 × 光速，合 2.1 cm」
    const [noisePs, root, cm] = raw(joined, /(\d+) ps ÷ √(\d) × 光速，合 ([\d.]+) cm/,
      'the steps on the ellipse’s own sigma')
    expect(val(noisePs!), 'the timestamp noise this session runs with').toBe(SESSION.tsNoisePs)
    same(cm!, ((C_M_PER_NS * val(noisePs!)) / 1000 / Math.sqrt(val(root!))) * 100,
      'and the sigma its own arithmetic gives')
    same(cm!, SIGMA_R * 100, 'which is what `rangeSigmaM` returns')
  })

  it('`deeper`: the term that can be forgotten, and the one that cannot', () => {
    // 「Tprop·eA 是拿 10 ppm 去缩放 11.675 ns 的飞行时间：0.12 皮秒，合 35 微米」
    const [ppm, ns, ps, um] = raw(deep,
      /拿 (\d+) ppm 去缩放 ([\d.]+) ns 的飞行时间：([\d.]+) 皮秒，合 (\d+) 微米/,
      '`deeper` on the term that can be forgotten')
    expect(val(ppm!), 'the tag’s own crystal').toBe(BASE_PPM.tag)
    same(ns!, FLIGHT_NS, 'the flight time it scales')
    same(ps!, FLIGHT_NS * val(ppm!) * 1e-6 * 1000, 'and the picoseconds that leaves')
    expect(Math.round(FLIGHT_NS * val(ppm!) * 1e-6 * C_M_PER_NS * 1e6), 'which is that many microns')
      .toBe(val(um!))
    // 「2 ms 的应答时长大约是飞行时间的十七万倍」 — 「十七万」 is Chinese, so the claim is the ratio
    const [replyMsPrinted] = figs(deep, /(\d+) ms 的应答时长/, '`deeper` on the reply it scales')
    expect(Math.round((replyMsPrinted! * MS) / FLIGHT_NS / 1e4), 'the reply over the flight, in units of ten thousand')
      .toBe(17)
    // 「两端各自那一对读数相差 4056 格，本该只是两趟飞行」
    const [diff] = figs(deep, /相差 (\d+) 格/, '`deeper` on the difference of the two differences')
    const ts = ofType(recs(), 'UWB_TS')
    const txPoll = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx' && r.frameKind === 'uwbPoll')!
    const rxPoll = ts.find((r) => r.node === 'anchor-1' && r.dir === 'rx' && r.frameKind === 'uwbPoll')!
    const txResp = ts.find((r) => r.node === 'anchor-1' && r.dir === 'tx' && r.frameKind === 'uwbResp')!
    const rxResp = ts.find((r) => r.node === 'tag-1' && r.dir === 'rx' && r.peer === 'anchor-1')!
    expect(counterDiff(rxResp.counter, txPoll.counter) - counterDiff(txResp.counter, rxPoll.counter),
      'the counts the two ends’ own pairs differ by').toBe(diff)
    // 「1 ms 的 0.2 ppm 取一半是 0.1 ns，于是锚点每多等 1 ms，剩余误差就多 3.0 cm」
    const [perMs, noise, halfNs, perMs2, cm] = raw(deep,
      /(\d+) ms 的 ([\d.]+) ppm 取一半是 ([\d.]+) ns，于是锚点每多等 (\d+) ms，剩余误差就多 ([\d.]+) cm/,
      '`deeper` on how the residual grows')
    expect(val(noise!), 'the estimator’s residual').toBe(SESSION.cfoNoisePpm)
    expect(val(perMs2!), 'the same millisecond, restated').toBe(val(perMs!))
    same(halfNs!, (val(perMs!) * MS * val(noise!) * 1e-6) / 2, 'half of that, in nanoseconds')
    same(cm!, ((val(perMs!) * MS * val(noise!) * 1e-6) / 2) * C_M_PER_NS * 100,
      'and the centimetres it is worth')
    // 「锚点 3 的 −9.5 cm 稳稳落在它自己 18.0 cm 的 σ 之内」
    const [which, err, sigma] = raw(deep, /锚点 (\d) 的 (−[\d.]+) cm 稳稳落在它自己 ([\d.]+) cm 的 σ 之内/,
      '`deeper` on one anchor’s own residual')
    const r = ranges()[val(which!) - 1]!
    same(err!, (r.distM - r.trueDistM) * 100, `anchor ${which}: the error this run leaves`)
    same(sigma!, residualSigmaM(val(which!)) * 100, 'and the sigma it belongs to')
    expect(Math.abs(val(err!)), 'which really is inside it').toBeLessThan(val(sigma!))
  })

  it('the halving, every slot the prose names, and the anchor the worked example follows', () => {
    const ts = ofType(recs(), 'UWB_TS')
    const stamp = (node: string, dir: 'tx' | 'rx', kind: string) =>
      ts.find((r) => r.node === node && r.dir === dir && r.frameKind === kind)!
    // 「传播时间 =（往返 − 应答时长）÷ 2」 — the halving, fed back through the engine's own pair
    const [halve] = figs(pic, /（往返 − 应答时长）÷ (\d)/, '`picture` on the halving')
    const treply = counterDiff(
      stamp('anchor-1', 'tx', 'uwbResp').counter, stamp('anchor-1', 'rx', 'uwbPoll').counter)
    const tround = counterDiff(
      ts.find((r) => r.node === 'tag-1' && r.dir === 'rx' && r.peer === 'anchor-1')!.counter,
      stamp('tag-1', 'tx', 'uwbPoll').counter)
    expect((tround - treply) / halve!, 'the half-difference `ssTwrRaw` takes')
      .toBe(ssTwrRaw(tround, treply))
    // every 「N ms」 that is a slot is this session's own slot
    for (const v of everyFig(/它是 (\d+) ms|不把这 (\d+) ms|花掉五个 (\d+) ms|灰条是 (\d+) ms/g,
      'the ranging slot, wherever the prose names it', 4)) {
      expect(val(v), 'the slot two responses really are apart').toBe(SLOT_MS)
    }
    // 「等 2、3、4 个时隙的锚点，灰条成倍」 — the slots the other three anchors answer in
    const slots = figs(pic, /等 (\d)、(\d)、(\d) 个时隙的锚点/, '`picture` on the other three anchors')
    expect(slots, 'one slot per anchor after the first')
      .toEqual(Array.from({ length: ANCHORS - 1 }, (_x, i) => i + 2))
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    for (const [i, n] of slots.entries()) {
      expect(Math.round((resp[i + 1]!.t - resp[0]!.t) / MS / SLOT_MS) + 1,
        `the anchor answering in slot ${n}`).toBe(n)
    }
    // 「锚点 1，照着步骤走一遍」 and the two cells that name it — the worked example's own anchor
    const [heading] = figs(table(3).heading ?? '', /锚点 (\d)，照着步骤走一遍/,
      'the worked example’s own heading')
    for (const v of everyFig(/它到达锚点 (\d)|锚点 (\d) 的 Response/g,
      'the anchor the worked example follows', 2)) {
      expect(val(v), 'the same anchor the heading names').toBe(heading)
    }
    expect(stamp(`anchor-${heading}`, 'rx', 'uwbPoll'), 'and that anchor really stamped the poll in')
      .toBeDefined()
    expect(cell(3, 1, 1), 'and its own counter is the cell under it')
      .toBe(stamp(`anchor-${heading}`, 'rx', 'uwbPoll').counter.toLocaleString('en-US').replace(/,/g, ' '))
    // every 「1σ」 of the prose is one sigma
    for (const v of everyFig(/那个 (\d)σ|它的 (\d)σ|剩余误差 (\d)σ|的 (\d)σ 噪声/g, 'one sigma', 3)) {
      expect(val(v), 'one of them').toBe(1)
    }
    // 「±1 ppm 的温补晶振」 — the variant's own label, and the crystal it ships
    const [tcxo] = figs(trys, /±(\d+) ppm 的温补晶振/, '`tryThis` on which variant to load')
    expect(tcxo, 'the crystal that variant ships').toBe(Math.abs(TCXO_PPM.tag))
    expect(uwbSstwr.variants!.map((v) => v.label).join('\n'), 'which is the variant it names')
      .toContain(`±${tcxo} ppm`)
    // the quiz's own anchors: 「锚点 1 与锚点 4 一样远」 and 「修正之后锚点 4 的距离反而最准」
    const [a1, a4] = figs(quizText, /锚点 (\d) 与锚点 (\d) 一样远/, 'the quiz on the two anchors')
    expect([a1, a4], 'the first and the last of them').toEqual([1, ANCHORS])
    const errs = ranges().map((r) => Math.abs(r.distM - r.trueDistM))
    const [best] = figs(quizText, /修正之后锚点 (\d) 的距离反而最准/, 'the quiz on which one came out best')
    expect(errs.indexOf(Math.min(...errs)) + 1, 'the anchor whose corrected distance really is closest')
      .toBe(best)
    const [askSlot] = figs(quizText, /在时隙 (\d) 作答是不是最好/, 'the quiz’s own question')
    expect(askSlot, 'which is that anchor’s own slot').toBe(best)
    // 「精度是真实的，但它来自锚点 4 所在的位置」 — the same anchor, a third time in that answer
    for (const v of everyFig(/锚点 (\d) 所在的位置|锚点 (\d) 的距离反而最准/g,
      'the anchor that came out best, wherever the answer names it', 2)) {
      expect(val(v), 'the one whose corrected distance really is closest').toBe(best)
    }
  })

  it('`limits`, `sources`, `observe`, `tryThis` and the quiz: every figure each one restates', () => {
    // 「那 0.2 ppm 的残余误差是模型取值（会话的 cfoNoisePpm）」 and the same figure again
    for (const v of everyFig(/那 ([\d.]+) ppm 的残余误差|误差却始终是 ([\d.]+) ppm|残留的 ([\d.]+) ppm/g,
      'the estimator’s residual, wherever it is named', 3)) {
      expect(val(v), 'the session’s own `cfoNoisePpm`').toBe(SESSION.cfoNoisePpm)
    }
    // 「时间戳噪声会按 phy.ts 的 tsNoiseScale 随信干噪比放大到十倍」 — 「十倍」 is Chinese
    expect(limitsText, '`limits` still names the scale that does it').toContain('tsNoiseScale')
    // 「Treply 恰好是整数个 2 ms 减去一趟飞行」 and 「2 ms 的测距时隙」
    for (const v of everyFig(/整数个 (\d+) ms|(\d+) ms 的测距时隙|灰条是 (\d+) ms/g,
      'the ranging slot, wherever it is named', 3)) {
      expect(val(v), 'the slot this session runs').toBe(SLOT_MS)
    }
    // 「每个接收时间戳上 100 ps 的 1σ 噪声」
    const [ps, sigma] = figs(srcText, /(\d+) ps 的 (\d)σ 噪声/, '`sources` on the timestamp noise')
    expect(ps, 'the noise this session runs with').toBe(SESSION.tsNoisePs)
    expect(sigma, 'one sigma of it').toBe(1)
    // 「±20 ppm 的晶振容差来自 §16.4.9」
    const [tol] = figs(srcText, /±(\d+) ppm 的晶振容差/, '`sources` on the tolerance')
    expect(tol, 'the tolerance `phy.ts` exports').toBe(UWB_PPM_MAX)
    // 「0 ns 处的一帧 Poll 产生四条 RX_START，全都在 12 ns：四个锚点一样远」
    const [at0, at12] = figs(obs, /(\d) ns 处的一帧 Poll 产生四条 RX_START，全都在 (\d+) ns/,
      '`observe` on the poll and its four receptions')
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(poll.t, 'the poll goes out at that instant').toBe(at0)
    const starts = ofType(recs(), 'RX_START').filter((r) => r.t < 1 * MS)
    expect(starts, 'four anchors hear it').toHaveLength(ANCHORS)
    for (const s of starts) {
      expect(Math.round(s.t), 'and every one of them at that instant').toBe(at12)
    }
    // 「整轮花掉五个 2 ms 的时隙」 — 「五」 is Chinese; the slot is read above
    const [slotsZh] = raw(obs, /整轮花掉(.)个/, '`observe` on how many slots the round takes')
    expect(zhNumeral(slotsZh!.replace(/两/g, '二')), 'one per anchor, plus the poll’s own')
      .toBe(ANCHORS + 1)
    // 「修正后的读数落在 3.41 与 3.51 m 之间，括号里的 raw 值却一路爬升：9.51 → 15.47 → 21.49 → 27.42 m」
    const [lo, hi] = raw(obs, /落在 ([\d.]+) 与 ([\d.]+) m 之间/, '`observe` on the corrected spread')
    const corrected = ranges().map((r) => r.distM)
    same(lo!, Math.min(...corrected), 'the closest of the four')
    same(hi!, Math.max(...corrected), 'and the furthest')
    const climb = raw(obs, /：([\d.]+) → ([\d.]+) → ([\d.]+) → ([\d.]+) m/,
      '`observe` on the raw values')
    ranges().forEach((r, i) => {
      same(climb[i]!, rctuToMetres(r.tofRawRctu!), `anchor ${i + 1}: the raw value the record carries`)
    })
    // 「把相邻的 raw 值相减：5.96、6.02、5.93 m」
    const gaps = raw(obs, /把相邻的 raw 值相减：([\d.]+)、([\d.]+)、([\d.]+) m/,
      '`observe` on the differences between them')
    gaps.forEach((g, i) => {
      same(g!, rctuToMetres(ranges()[i + 1]!.tofRawRctu!) - rctuToMetres(ranges()[i]!.tofRawRctu!),
        `the step from anchor ${i + 1} to ${i + 2}`)
    })
    // 「剩下的只有时间戳噪声，它的 1σ 是 2.1 cm」 and 「每个时隙约 0.60 m」
    const [sig, cm] = raw(trys, /它的 (\d)σ 是 ([\d.]+) cm/, '`tryThis` on the perfect-crystal run')
    expect(val(sig!), 'one sigma').toBe(1)
    same(cm!, SIGMA_R * 100, 'the sigma the timestamps alone leave')
    const [perSlot] = raw(trys, /每个时隙约 ([\d.]+) m/, '`tryThis` on the TCXO run’s own slope')
    const tcxoErrs = ranges(1).map(rawErr)
    expect(Number((tcxoErrs[0]!).toFixed(1)), 'the slope one slot of the TCXO run gives')
      .toBe(Number(val(perSlot!).toFixed(1)))
    // the quiz: 「时隙 4 的剩余误差最宽，1σ 为 24.0 cm，而锚点 1 只有 6.0 cm」
    const [slotN, wide, anchorN, narrow] = raw(quizText,
      /时隙 (\d) 的剩余误差最宽，1σ 为 ([\d.]+) cm，而锚点 (\d) 只有 ([\d.]+) cm/,
      'the quiz on the two residual sigmas')
    same(wide!, residualSigmaM(val(slotN!)) * 100, `slot ${slotN}: its own sigma`)
    same(narrow!, residualSigmaM(val(anchorN!)) * 100, `anchor ${anchorN}: and its own`)
    expect(val(wide!), 'and the later slot really is the wider').toBeGreaterThan(val(narrow!))
  })
})
