/**
 * Every empirical claim in "首片段丢了，整轮就废": the fourteen trains of the run, which of them the
 * acquisition gate threw away, what margin each of those had while being thrown away, and what the
 * SFD attribute gives back.
 *
 * The two comparison runs are HALF a controlled experiment, and the first tests here are what
 * make that claim honest: with the attribute on and off the schedule is identical — the same
 * trains at the same instants, the same fragments missing — while each fragment of the SFD column
 * is one SFD longer and `mmsFragmentDbm` of that extra length quieter. The lesson says both, and
 * the assertions are here.
 *
 * Two of them are watchdogs rather than claims:
 *
 *  - **no timestamp moves.** The packet's RMARKER is fragment 0's first pulse and the fragments
 *    are spaced start to start, so appending an SFD must leave every counter and every range
 *    untouched. Reading the stamp after the trailing SFD instead would bias every range by
 *    5 800 ns — 1 739 m.
 *  - **the round does not get longer.** The occupancy does, by 8 x 5 800 ns a train; the round's
 *    own start and end do not, because the fragments sit on a one-millisecond grid.
 */
import { describe, it, expect } from 'vitest'
import {
  ACQ_6G_CENTER_MHZ, ACQ_CLEAR_6G_MHZ, ACQ_HEARD, ACQ_N_MSR, EDGE_ANCHOR_X, EDGE_TAG_X,
  uwbAcquisition, uwbAcquisitionScenario, uwbAcquisitionTiming,
} from '../../src/course/uwb/uwb-acquisition'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { UwbMmsSchema } from '../../src/model/scenario'
import {
  MMS_RSF_SFD_N_MSR, combineGainDb, mmsFragmentDbm, rsfAirNs, rsfNs,
} from '../../src/uwb/mms'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven ranging blocks — the window the lesson's tables are counted over. */
const RUN_NS = 1300 * MS
/** Three blocks: the edge scene has nothing to average and six trains is the whole claim. */
const EDGE_NS = 450 * MS

lessonShapeSuite(uwbAcquisition, { runNs: RUN_NS })

const SFD = 0
const NBA = 1
const CLEAR = 2
const EDGE = 3

/** What one fragment of this lesson's train gives up for its SFD, in dB — computed, never typed. */
const ACQ_PHY = { ...DEFAULT_UWB_SESSION.mms, nMsr: ACQ_N_MSR }
const SFD_COST_DB = mmsFragmentDbm(rsfAirNs({ ...ACQ_PHY, rsfSfd: true }))
  - mmsFragmentDbm(rsfAirNs({ ...ACQ_PHY, rsfSfd: false }))

/**
 * One run of a scenario the lesson does NOT ship as a variant.
 *
 * The timestamp watchdog needs the interference-free scene with the attribute on, and the edge
 * scene with it off — neither of which may become a variant, because a variant is a row in two
 * fixtures and these two scenarios exist to be compared against the shipped ones, not to be
 * shipped. Memoised on the scenario itself, like `runOf` is on the lesson.
 */
const sideRuns = new Map<string, TLRecord[]>()
function recordsOf(sc: Scenario, ns: number = RUN_NS): TLRecord[] {
  const key = `${ns}|${JSON.stringify(sc)}`
  const hit = sideRuns.get(key)
  if (hit) return hit
  const rs = [...new Simulation(sc).runUntil(ns).records]
  sideRuns.set(key, rs)
  return rs
}

/** The edge scene with the attribute turned back off — the comparison, not a shipped scene. */
const edgeWithout = (): Scenario => {
  const sc = uwbAcquisitionScenario('edge')
  return { ...sc, uwb: { ...sc.uwb!, mms: { ...sc.uwb!.mms, rsfSfd: false } } }
}

describe('uwb-acquisition · where it sits, and what its scenes are', () => {
  it('follows uwb-uwbd and needs it', () => {
    expect(MODULES[uwbAcquisition.module].title).toBe('另一种控制面与子轮')
    expect(COURSE_ORDER.indexOf('uwb-acquisition')).toBe(COURSE_ORDER.indexOf('uwb-uwbd') + 1)
    expect(uwbAcquisition.needs).toEqual(['uwb-uwbd', 'uwb-mms-numbers'])
  })

  it('runs at an RSF fragment length the draft allows an SFD after', () => {
    // The draft permits the attribute only at 32 or 64, and the schema refuses the rest — so a
    // scene that wants it has to be at one of them. That is why this lesson is not at the
    // session's own 40.
    expect(MMS_RSF_SFD_N_MSR).toContain(ACQ_N_MSR)
    const mms = uwbAcquisitionScenario('sfd').uwb!.mms
    expect([mms.nMsr, mms.rsfSfd, mms.control, mms.uwbdControl]).toEqual([ACQ_N_MSR, true, 'uwbd', 'none'])
    expect(UwbMmsSchema.safeParse({ ...mms, nMsr: 40 }).success).toBe(false)
  })

  it('has five legal scenes: the gate, the attribute, Config 2, no interference, and the edge', () => {
    const all: Scenario[] = [uwbAcquisition.scenario(), ...uwbAcquisition.variants!.map((v) => v.scenario())]
    expect(all).toHaveLength(5)
    for (const sc of all) expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    // The Wi-Fi channel is inside UWB channel 5 in three of them and clear of it in the fourth.
    expect(uwbAcquisition.scenario().sixGhzCenterMhz).toBe(ACQ_6G_CENTER_MHZ)
    expect(uwbAcquisitionScenario('clear').sixGhzCenterMhz).toBe(ACQ_CLEAR_6G_MHZ)
    expect(uwbAcquisition.scenario().uwb!.channel).toBe(5)
    // The router's corner is the design: interference at the anchor, 9 m from the tag.
    const sc = uwbAcquisition.scenario()
    const at = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
    expect(Math.hypot(at('tag-1').x - at('anchor-1').x, at('tag-1').y - at('anchor-1').y)).toBeCloseTo(9, 6)
    expect(Math.hypot(at('ap').x - at('anchor-1').x, at('ap').y - at('anchor-1').y))
      .toBeLessThan(Math.hypot(at('ap').x - at('tag-1').x, at('ap').y - at('tag-1').y))
  })

  it('puts the edge scene 5.40 m across two partitions, with no Wi-Fi in the room at all', () => {
    const sc = uwbAcquisitionScenario('edge')
    // Two radios and nothing else: this scene is about the link budget, not about interference.
    expect(sc.nodes.map((n) => n.id)).toEqual(['anchor-1', 'tag-1'])
    expect(Math.abs(EDGE_TAG_X - EDGE_ANCHOR_X)).toBeCloseTo(5.4, 6)
    // ...and the two brick partitions of the ranging hall are between them, which is where the
    // other 24 dB comes from.
    expect(sc.walls.filter((w) => w.x1 === w.x2 && w.x1 > EDGE_ANCHOR_X && w.x1 < EDGE_TAG_X))
      .toHaveLength(2)
    expect(sc.uwb!.mms.rsfSfd).toBe(true)
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })
})

// --- the controlled experiment ----------------------------------------------------------------

describe('uwb-acquisition · the attribute changes the fragment, not the schedule', () => {
  it('delivers the same fragments to the same trains with it on and off', () => {
    const off = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_MMS_TRAIN')
    const on = ofType(runOf(uwbAcquisition, SFD, RUN_NS), 'UWB_MMS_TRAIN')
    expect(off).toHaveLength(14)
    expect(on).toHaveLength(14)
    // Train for train: the same instant, the same receiver, the same count, the same combining
    // gain. What is NOT the same any more is the level, and by exactly one SFD's worth of peak
    // power — so the lesson's claim that only the verdict flips now holds for the verdict and not
    // for the fragment column.
    expect(on.map((t) => [t.t, t.node, t.heard, t.gainDb]))
      .toEqual(off.map((t) => [t.t, t.node, t.heard, t.gainDb]))
    for (let i = 0; i < off.length; i++) {
      expect(on[i].rxDbm - off[i].rxDbm, `train ${i}`).toBeCloseTo(SFD_COST_DB, 9)
    }
    expect(SFD_COST_DB).toBeCloseTo(-0.188, 3)
    expect(rsfNs(ACQ_N_MSR, 64)).toBe(131_282)
    expect(rsfAirNs({ ...ACQ_PHY, rsfSfd: true })).toBe(137_082)
  })

  it('moves no counter and no range — the RMARKER is still the fragment first pulse', () => {
    // The watchdog of the 2026-10-03 cut. On the interference-free scene both runs acquire
    // everything, so every timestamp and every range exists in both; appending an SFD to each
    // fragment must leave all of them byte for byte. A stamp read after the trailing SFD instead
    // would be 5 800 ns late, which is 1 739 m of range.
    const clear = uwbAcquisitionScenario('clear')
    const withSfd: Scenario = {
      ...clear, uwb: { ...clear.uwb!, mms: { ...clear.uwb!.mms, rsfSfd: true } },
    }
    expect(() => ScenarioSchema.parse(withSfd)).not.toThrow()
    const stamps = (sc: Scenario): unknown[] => recordsOf(sc)
      .filter((r) => r.type === 'UWB_TS')
      .map((r) => [r.t, r.node, r.dir, r.peer, r.frameKind, r.counter])
    const ranges = (sc: Scenario): unknown[] => recordsOf(sc)
      .filter((r) => r.type === 'UWB_RANGE')
      .map((r) => [r.t, r.node, r.peer, r.tofRctu, r.distM, r.trueDistM, r.fom])
    // Fourteen rounds, a transmit stamp and a receive stamp each.
    expect(stamps(clear)).toHaveLength(28)
    expect(stamps(withSfd)).toEqual(stamps(clear))
    expect(ranges(clear)).toHaveLength(14)
    expect(ranges(withSfd)).toEqual(ranges(clear))
  })

  it('occupies 46 400 ns more a train, and the round is not one nanosecond longer', () => {
    const off = runOf(uwbAcquisition, undefined, RUN_NS)
    const on = runOf(uwbAcquisition, SFD, RUN_NS)
    const isRsfTx = (r: TLRecord): boolean => r.type === 'TX_START' && r.frame.kind === 'uwbRsf'
    const rsfAir = (rs: TLRecord[]): number => rs.filter(isRsfTx)
      .reduce((n, r) => n + (r as Extract<TLRecord, { type: 'TX_START' }>).frame.txTimeNs, 0)
    const rsfs = (rs: TLRecord[]): number => rs.filter(isRsfTx).length
    expect(rsfs(on)).toBe(rsfs(off))
    const sfdNs = rsfAirNs({ ...DEFAULT_UWB_SESSION.mms, nMsr: ACQ_N_MSR, rsfSfd: true })
      - rsfNs(ACQ_N_MSR, DEFAULT_UWB_SESSION.mms.gap)
    expect(rsfAir(on) - rsfAir(off)).toBe(rsfs(off) * sfdNs)
    // Per packet — eight RSFs — that is the 46.4 microseconds the lesson quotes.
    expect(8 * sfdNs).toBe(46_400)
    // And the round's own boundaries do not move: the fragments sit on a one-millisecond grid and
    // 137 microseconds is still well inside it.
    const bounds = (rs: TLRecord[]): unknown[] => rs
      .filter((r) => r.type === 'UWB_ROUND' || r.type === 'UWB_ROUND_END')
      .map((r) => [r.type, r.t])
    expect(bounds(on)).toEqual(bounds(off))
  })

  it('flips seven verdicts, and only the verdicts', () => {
    const off = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_MMS_TRAIN')
    const on = ofType(runOf(uwbAcquisition, SFD, RUN_NS), 'UWB_MMS_TRAIN')
    expect(off.filter((t) => t.detected)).toHaveLength(7)
    expect(on.filter((t) => t.detected)).toHaveLength(14)
  })

  it('threw away seven trains that were 22 dB or more over the threshold', () => {
    const lost = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_MMS_TRAIN').filter((t) => !t.detected)
    expect(lost).toHaveLength(7)
    for (const t of lost) {
      expect(t.heard, 'fragments did arrive').toBeGreaterThan(0)
      expect(t.marginDb, 'combining margin').toBeGreaterThan(22)
      expect(t.marginDb).toBeLessThan(28)
      // The combining arithmetic the same record states: the sum cleared sensitivity easily.
      expect(t.rxDbm + combineGainDb(t.heard) - UWB_RX_SENS_DBM).toBeCloseTo(t.marginDb, 6)
    }
    // The lesson quotes the band 22.7…27.5 dB.
    const ms = lost.map((t) => Number(t.marginDb.toFixed(1)))
    expect(Math.min(...ms)).toBe(22.7)
    expect(Math.max(...ms)).toBe(27.5)
  })

  it('reads the fourteen fragment counts the table prints', () => {
    const heard = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_MMS_TRAIN').map((t) => t.heard)
    expect(heard).toEqual([5, 6, 5, 2, 6, 4, 6, 4, 5, 6, 6, 5, 6, 6])
    expect(ofType(runOf(uwbAcquisition, SFD, RUN_NS), 'UWB_MMS_TRAIN').map((t) => t.heard)).toEqual(heard)
    expect(ofType(runOf(uwbAcquisition, NBA, RUN_NS), 'UWB_MMS_TRAIN').map((t) => t.heard))
      .toEqual([6, 5, 6, 5, 6, 6, 7, 4, 5, 6, 6, 6, 5, 7])
    expect(ofType(runOf(uwbAcquisition, CLEAR, RUN_NS), 'UWB_MMS_TRAIN').map((t) => t.heard))
      .toEqual(Array.from({ length: 14 }, () => 8))
  })
})

// --- the four columns of the results table ------------------------------------------------------

describe('uwb-acquisition · what each of the four scenes measures', () => {
  const counts = (variant?: number): [number, number] => {
    const rs = runOf(uwbAcquisition, variant, RUN_NS)
    return [
      ofType(rs, 'UWB_MMS_TRAIN').filter((t) => t.detected).length,
      ofType(rs, 'UWB_RANGE').length,
    ]
  }

  it('is 7/3, 14/6, 14/14 and 14/14', () => {
    expect(counts()).toEqual([7, 3])
    expect(counts(SFD)).toEqual([14, 6])
    expect(counts(NBA)).toEqual([14, 14])
    expect(counts(CLEAR)).toEqual([14, 14])
  })

  it('does not get to fourteen with the attribute alone, because the REPORT is SP0', () => {
    // Every detected train is a time somebody could report; the ranges that are missing are the
    // ones whose SP0 REPORT did not survive the same interference.
    const rs = runOf(uwbAcquisition, SFD, RUN_NS)
    expect(ofType(rs, 'UWB_MMS_TRAIN').every((t) => t.detected)).toBe(true)
    expect(ofType(rs, 'UWB_RANGE').length).toBeLessThan(14)
    const sp0 = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0')
    const got = rs.filter((r) => r.type === 'RX_OK' && r.frame.kind === 'uwbSp0')
    expect(sp0.length).toBeGreaterThan(got.length)
    // Config 2's REPORT rides the narrowband radio in UNII-3, which this router cannot touch.
    const nba = runOf(uwbAcquisition, NBA, RUN_NS)
    expect(uwbAcquisitionScenario('nba').uwb!.mms.nbChannels).toEqual([3])
    expect(nba.filter((r) => r.type === 'TX_START' && r.frame.kind === 'nbReport').length)
      .toBe(nba.filter((r) => r.type === 'RX_OK' && r.frame.kind === 'nbReport').length)
  })

  it('loses fragments to Wi-Fi in three scenes and in none of the fourth', () => {
    for (const v of [undefined, SFD, NBA]) {
      expect(ofType(runOf(uwbAcquisition, v, RUN_NS), 'UWB_INTERFERED').length, String(v)).toBeGreaterThan(0)
    }
    expect(ofType(runOf(uwbAcquisition, CLEAR, RUN_NS), 'UWB_INTERFERED')).toHaveLength(0)
  })

  it('states the fragment level the ledger quotes', () => {
    const t = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_MMS_TRAIN')[0]
    expect(t.rxDbm).toBeCloseTo(-73.28, 2)
    expect(mmsFragmentDbm(rsfNs(ACQ_N_MSR, 64))).toBeCloseTo(-5.50, 2)
    // …and the combining line the lesson prints beside it.
    expect(t.rxDbm + combineGainDb(5)).toBeCloseTo(-66.29, 2)
  })
})

// --- the figure's own fragment pattern ---------------------------------------------------------

describe('uwb-acquisition · the figure is the run', () => {
  it('draws the fragments the anchor really received in the round of block 1', () => {
    const rs = runOf(uwbAcquisition, undefined, RUN_NS)
    const got = rs
      .filter((r) => r.type === 'RX_OK' && r.node === 'anchor-1' && r.frame.kind === 'uwbRsf'
        && r.t >= 200 * MS && r.t < 212 * MS)
      .map((r) => Math.round((r.t - 200 * MS) / MS))
    expect(got).toEqual([...ACQ_HEARD])
    expect(ACQ_HEARD).not.toContain(0)
    // …and that is the train the lesson quotes: five of eight, thrown away.
    const t = ofType(rs, 'UWB_MMS_TRAIN').find((x) => x.node === 'anchor-1' && x.t > 200 * MS)!
    expect([t.heard, t.detected]).toEqual([ACQ_HEARD.length, false])
  })

  it('lays the same indices into the figure, and the SFD lane one SFD longer', () => {
    const spec = uwbAcquisitionTiming()
    const fragUs = rsfAirNs({ ...ACQ_PHY, rsfSfd: false }) / 1000
    const sfdUs = rsfAirNs({ ...ACQ_PHY, rsfSfd: true }) / 1000
    expect(fragUs).toBeCloseTo(rsfNs(ACQ_N_MSR, 64) / 1000, 9)
    expect(spec.lanes).toHaveLength(3)
    expect(spec.lanes[0].spans).toHaveLength(8)
    expect(spec.lanes[0].spans.filter((s) => s.tone === 'muted').map((s) => s.fromUs / 1000)).toEqual([0, 1, 2])
    expect(spec.lanes[1].spans.map((s) => s.fromUs)).toEqual([0])
    expect(spec.lanes[2].spans.map((s) => s.fromUs / 1000)).toEqual([...ACQ_HEARD])
    // The arrival lane and the no-SFD lane are the base column; the SFD lane is the other one,
    // and the picture may not say they are the same length when they are not.
    for (const l of spec.lanes.slice(0, 2)) {
      for (const s of l.spans) expect(s.toUs - s.fromUs).toBeCloseTo(fragUs, 6)
    }
    for (const s of spec.lanes[2].spans) expect(s.toUs - s.fromUs).toBeCloseTo(sfdUs, 6)
  })
})

// --- the fifth scene: where the attribute costs a round ----------------------------------------

describe('uwb-acquisition · the edge, where the attribute loses a round it would have won', () => {
  const edgeTrains = (sfd: boolean) => sfd
    ? ofType(runOf(uwbAcquisition, EDGE, EDGE_NS), 'UWB_MMS_TRAIN')
    : ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_MMS_TRAIN')

  it('stands on a link with less margin than one SFD costs', () => {
    const off = edgeTrains(false)
    expect(off).toHaveLength(6)
    const marginDb = off[0].rxDbm - UWB_RX_SENS_DBM
    // Over the threshold without the attribute, by less than the attribute spends.
    expect(marginDb).toBeGreaterThan(0)
    expect(marginDb).toBeLessThan(Math.abs(SFD_COST_DB))
    expect(marginDb).toBeCloseTo(0.16, 2)
    expect(off[0].rxDbm).toBeCloseTo(-92.84, 2)
    // Every train in the scene is the same link; this is a budget, not a run of luck.
    for (const t of off) expect(t.rxDbm).toBeCloseTo(off[0].rxDbm, 9)
    expect(EDGE_ANCHOR_X).toBeLessThan(EDGE_TAG_X)
  })

  it('acquires all six rounds without it and none of them with it', () => {
    const off = edgeTrains(false)
    const on = edgeTrains(true)
    // Nothing was lost on the way: all eight fragments arrive in both runs, which is what makes
    // this a link-budget scene rather than an interference one.
    expect(off.map((t) => t.heard)).toEqual([8, 8, 8, 8, 8, 8])
    expect(on.map((t) => t.heard)).toEqual(off.map((t) => t.heard))
    expect(off.every((t) => t.detected)).toBe(true)
    expect(on.every((t) => !t.detected)).toBe(true)
    // The fragment is exactly one SFD's worth quieter, and that is what crosses the threshold.
    expect(on[0].rxDbm - off[0].rxDbm).toBeCloseTo(SFD_COST_DB, 9)
    expect(off[0].rxDbm).toBeGreaterThanOrEqual(UWB_RX_SENS_DBM)
    expect(on[0].rxDbm).toBeLessThan(UWB_RX_SENS_DBM)
  })

  it('takes twelve timestamps without it and no received one with it', () => {
    const stamps = (rs: TLRecord[]) => rs.filter((r) => r.type === 'UWB_TS')
    const off = stamps(recordsOf(edgeWithout(), EDGE_NS))
    const on = stamps(runOf(uwbAcquisition, EDGE, EDGE_NS))
    expect(off).toHaveLength(12)
    expect(off.filter((r) => r.dir === 'rx')).toHaveLength(6)
    // With the attribute on, no receiver ever opened a packet, so there is nothing to stamp on
    // arrival — only each transmitter's own stamp is left.
    expect(on.filter((r) => r.dir === 'rx')).toHaveLength(0)
    expect(on).toHaveLength(6)
  })

  it('has no range either way, because at this distance the SP0 REPORT cannot arrive', () => {
    // Worth pinning rather than glossing: the attribute's cost shows up in the acquisition
    // verdict and the timestamps, NOT in a range that appears and disappears. An SP0 frame is
    // sent at the node's own transmit power, not a fragment's burst power, so on a link this
    // long it is gone before the sensitivity penalty is even applied.
    expect(ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_RANGE')).toHaveLength(0)
    expect(ofType(runOf(uwbAcquisition, EDGE, EDGE_NS), 'UWB_RANGE')).toHaveLength(0)
    // …and the base scene really does produce ranges, so the assertion above is about this link
    // and not about the lesson having no ranging at all.
    expect(ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_RANGE').length).toBeGreaterThan(0)
  })
})

/**
 * **The lesson quotes the event log, and until 2026-10-12 nothing compared the quotes.**
 *
 * A sweep of all 91 lessons' graded prose against all 293 test files (figures carrying a decimal
 * point, or three or more digits) left 61 figures that appear in no test anywhere. Eight of them
 * were this lesson's — it quotes more log rows verbatim than any other, because its whole method is
 * 「go to this millisecond and read this row」. Two of the eight were wrong:
 *
 *  - `tryThis` said 「收到的还是 5/8，**余量还是 26.7 dB**，结论变成检出」, framing the SFD run as a
 *    controlled comparison in which only the verdict moves. The margin moves too — 26.7 → 26.5,
 *    exactly the 0.188 dB of peak power the SFD costs, which is this lesson's own mechanism two
 *    sections earlier. **And `numbers` already said so**: 「它不再是严格的受控对比」. One lesson, two
 *    sections, opposite claims. The corrected sentence carries the point better: less margin, and
 *    the verdict still flips, so the verdict was never about level.
 *  - `numbers` said the SFD lane arrives at **−73.47 dBm**. It arrives at −73.4648, which renders
 *    −73.46. The figure had been computed as (−73.28) − 0.188 — arithmetic on two numbers that were
 *    already rounded, the same mistake as §17's 479 characters computed from a displayed 30.32
 *    (`tests/course/wifi-coverage.test.ts`, the census line for that table).
 *
 * Everything else the quotes claim was exact: 1.131 ms / −30.2 dB / −43.1 dBm, the 7.500 and
 * 8.000 ms pair with 5/8 and 6/8 at 26.7 and 27.5 dB, 10.118 ms → 8.99 m, 207.500 ms, and the
 * seven dropped trains inside their 22.7–27.5 dB band. Every figure below is read out of the
 * lesson rather than retyped, so there is none on this side to drift.
 */
describe('uwb-acquisition · every figure the lesson quotes out of the log is the logged one', () => {
  const num = (s: string): number => Number(s.replace('−', '-'))
  interface Train { t: number; node: string; heard: number; rxDbm: number; marginDb: number; detected?: boolean }
  const trainsOf = (variant?: number): Train[] =>
    ofType(runOf(uwbAcquisition, variant, RUN_NS), 'UWB_MMS_TRAIN') as unknown as Train[]
  const at = (variant: number | undefined, ms: number): Train => {
    const hit = trainsOf(variant).find((t) => Math.abs(t.t - ms * MS) < MS / 2)
    expect(hit, `no UWB_MMS_TRAIN at ${ms} ms in variant ${String(variant)}`).toBeDefined()
    return hit!
  }
  const numbersText = JSON.stringify(uwbAcquisition.numbers)

  it('the interference line: its millisecond, its SIR and the intruder level', () => {
    const m = /^([\d.]+) ms 处写着[^]*?SIR [−-]([\d.]+) dB \(foreign [−-]([\d.]+) dBm\)/
      .exec(uwbAcquisition.observe[0])
    expect(m, 'observe[0] no longer quotes the interference line in the shape this reads').not.toBeNull()
    const first = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_INTERFERED')[0] as unknown as
      { t: number; sirDb: number; foreignDbm: number }
    expect(num(m![1]), 'the millisecond the lesson sends the reader to')
      .toBe(Number((first.t / MS).toFixed(3)))
    expect(-num(m![2]), 'the SIR the lesson quotes').toBe(Number(first.sirDb.toFixed(1)))
    expect(-num(m![3]), 'the intruder level the lesson quotes').toBe(Number(first.foreignDbm.toFixed(1)))
  })

  it('the first round: two verdicts, their counts, their margins, and the fix in metres', () => {
    const m = /([\d.]+) ms 与 ([\d.]+) ms 两条判定都检出了，(\d)\/8 与 (\d)\/8，余量 ([\d.]+) dB 与 ([\d.]+) dB，([\d.]+) ms 标签得出 ([\d.]+) m/
      .exec(uwbAcquisition.observe[1])
    expect(m, 'observe[1] no longer walks the first round in the shape this reads').not.toBeNull()
    const a = at(undefined, num(m![1]))
    const b = at(undefined, num(m![2]))
    expect([a.heard, b.heard], 'the two fragment counts').toEqual([Number(m![3]), Number(m![4])])
    expect([Number(a.marginDb.toFixed(1)), Number(b.marginDb.toFixed(1))], 'the two margins')
      .toEqual([num(m![5]), num(m![6])])
    expect([a.detected, b.detected], 'the lesson says both were detected').toEqual([true, true])
    const fix = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_RANGE')
      .find((r) => Math.abs(r.t - num(m![7]) * MS) < MS / 2) as unknown as { distM: number } | undefined
    expect(fix, `no UWB_RANGE at ${m![7]} ms`).toBeDefined()
    expect(num(m![8]), 'the distance the lesson quotes').toBe(Number(fix!.distM.toFixed(2)))
  })

  it('the discarded train: same count, that margin, and the verdict that makes the lesson', () => {
    const m = /跳到第一列作废的片段：([\d.]+) ms，“(\d)\/8 heard, margin ([\d.]+) dB → lost”/
      .exec(uwbAcquisition.observe[2])
    expect(m, 'observe[2] no longer quotes the discarded train in the shape this reads').not.toBeNull()
    const t = at(undefined, num(m![1]))
    expect(t.heard, 'the count in the quoted row').toBe(Number(m![2]))
    expect(Number(t.marginDb.toFixed(1)), 'the margin in the quoted row').toBe(num(m![3]))
    expect(t.detected, 'the row says 「lost」, so the train must not be detected').toBe(false)
  })

  it('the SFD run is NOT a controlled comparison, and `tryThis` states the measured margins', () => {
    // The sentence this pins is the one that was wrong: it claimed the margin was unchanged.
    const m = /再回到 ([\d.]+) ms 那一行：收到的还是 (\d)\/8，而余量反倒低了 ([\d.]+) dB（([\d.]+) dB，不是 ([\d.]+) dB/
      .exec(uwbAcquisition.tryThis[0])
    expect(m, 'tryThis[0] no longer states the SFD run in the shape this reads').not.toBeNull()
    const ms = num(m![1])
    const base = at(undefined, ms)
    const sfd = at(SFD, ms)
    expect(sfd.heard, 'the lesson says the same number of fragments was heard').toBe(Number(m![2]))
    expect(sfd.heard, 'and that it is the same as the base run').toBe(base.heard)
    expect(Number(sfd.marginDb.toFixed(1)), 'the SFD margin the lesson states').toBe(num(m![4]))
    expect(Number(base.marginDb.toFixed(1)), 'the base margin it is compared against').toBe(num(m![5]))
    expect(Number((base.marginDb - sfd.marginDb).toFixed(2)), 'the drop the lesson states, which is'
      + ' the SFD peak-power cost it computes two sections earlier').toBe(num(m![3]))
    // and the verdict flips although the margin went DOWN, which is the whole point
    expect([base.detected, sfd.detected], 'lost without the SFD, detected with it').toEqual([false, true])
  })

  it('the SFD lane arrives lower, and `numbers` states both measured levels', () => {
    const m = /到达电平是 [−-]([\d.]+) dBm 而不是 [−-]([\d.]+) dBm/.exec(numbersText)
    expect(m, 'the arrival-level sentence is gone from `numbers`').not.toBeNull()
    expect(-num(m![1]), 'the SFD lane level').toBe(Number(at(SFD, 207.5).rxDbm.toFixed(2)))
    expect(-num(m![2]), 'the base lane level').toBe(Number(at(undefined, 207.5).rxDbm.toFixed(2)))
  })

  it('the seven discarded trains, and the band the lesson gives for them', () => {
    const m = /被丢掉的那([一二三四五六七八九十]+)组，累加起来的余量在 ([\d.]+) 到 ([\d.]+) dB 之间/
      .exec(numbersText)
    expect(m, 'the dropped-train sentence is gone from `numbers`').not.toBeNull()
    const dropped = trainsOf(undefined).filter((t) => t.detected === false)
    expect(m![1], 'the lesson counts the dropped trains in Chinese numerals').toBe('七')
    expect(dropped).toHaveLength(7)
    const margins = dropped.map((t) => t.marginDb)
    expect(Number(Math.min(...margins).toFixed(1)), 'the bottom of the band').toBe(num(m![2]))
    expect(Number(Math.max(...margins).toFixed(1)), 'the top of the band').toBe(num(m![3]))
  })
})
