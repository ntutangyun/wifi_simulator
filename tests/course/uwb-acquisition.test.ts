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
  MMRS_LEN, MMS_RSF_SFD_N_MSR, MMS_SP0_PENALTY_DB, MMS_SP0_RX_SENS_DBM, MMS_SP0_SEGMENT_NS,
  MMS_SPREAD, UWB_MS_BUDGET_NJ, combineGainDb, mmsFragmentDbm, rsfAirNs, rsfChips, rsfNs,
} from '../../src/uwb/mms'
import { C_M_PER_NS, UWB_RX_SENS_DBM, chipsToNs } from '../../src/uwb/units'
import { PSYM_CHIPS, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { nbCenterMhz } from '../../src/uwb/nb'
import { LESSON_6G_WIDTH_MHZ } from '../../src/course/lessonKit'
import { lessonTexts } from '../../src/course/readability'
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

// --- every figure the lesson prints ------------------------------------------------------------

/**
 * **Everything above is hard on the engine and soft on the lesson.** The fourteen fragment counts,
 * the seven verdicts, the 22.7–27.5 dB band, the edge link's −92.84 dBm: every one of those
 * figures is typed on THIS side and compared with a run, which pins the engine and leaves the
 * prose free. `scripts/figure-planting.ts` measured exactly that on 2026-10-12 — six figures
 * planted in the lesson's own tables, six plantings unnoticed — and this is the lesson that prints
 * more figures than any other in the course (181 of them).
 *
 * So every figure below is read out of the lesson and compared with a measurement, and three of
 * them were wrong when they were first read:
 *
 *  - the room table said the router stands **1.1 m** from the anchor. It stands 3.04 m — the
 *    position that row was written for is gone. The claim the row exists to make (「路由器就在锚点
 *    墙角」) survives, which is why nothing caught it: the test asserted the comparison (closer to
 *    the anchor than to the tag) and never the figure.
 *  - the cost table's 32-sample row said **−2.858 dBm**. `mmsFragmentDbm` gives −2.8575, which
 *    renders −2.857. The figure had been computed as −2.490 − 0.368 — arithmetic on two numbers
 *    that were already rounded, the third time this lesson has made that mistake (the −73.47 of
 *    the docblock above, and §17's 479 characters before it).
 *  - the step table said the round of block 1 is detected with **26.7 dB** of margin once the
 *    attribute is on. It has 26.5: the attribute takes 0.188 dB of peak power, which is this
 *    lesson's own mechanism, and `tryThis` states 26.5 correctly three sections later. One lesson,
 *    two sections, opposite figures — the same shape as the `tryThis` defect the docblock above
 *    records, and it was still here because that fix read `tryThis` and nothing else.
 *
 * **Two exemptions, each with its argument.** 「序列码索引取 9–32」 and 「长 31 那几个老码」 are the
 * draft's code-index ranges and this repository holds no corpus for them — the lesson says so
 * itself (here the condition is satisfied by construction). What is checked instead is that every
 * statement of the range is the same range, and that its upper end is also the fragment length the
 * draft allows beside it. 「PSR128」 is the name of a column in the draft's table, not a quantity.
 */
describe('uwb-acquisition · every figure the lesson prints, read back out of its own prose', () => {
  /** Every string a reader sees, from the course's own walk — so 「every occurrence」 is exhaustive. */
  const EVERYWHERE = lessonTexts(uwbAcquisition).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/−/g, '-'))
  /** The figures of one printed shape, as strings, so each keeps the decimals it was printed to. */
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** A printed figure against a measured value, to the figure's own decimals. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** Every occurrence of one shape: this course prints the same figure in four places. */
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const tableOf = (heading: string): { head: string[]; rows: string[][] } => {
    const t = (uwbAcquisition.numbers ?? []).find(
      (b): b is { kind: 'table'; heading?: string; head: string[]; rows: string[][] } =>
        b.kind === 'table' && b.heading?.startsWith(heading) === true)
    expect(t, `the table 「${heading}」 is gone`).toBeDefined()
    return t!
  }
  const rowOf = (heading: string, starts: string): string[] => {
    const r = tableOf(heading).rows.find((x) => x[0].startsWith(starts))
    expect(r, `the row 「${starts}」 is gone from 「${heading}」`).toBeDefined()
    return r!
  }
  const SC = uwbAcquisition.scenario()
  const GAP = SC.uwb!.mms.gap
  const SFD_NS = MMS_SP0_SEGMENT_NS.sfd
  const COST_DB = Math.abs(SFD_COST_DB)
  const trainsOf = (variant?: number, ns: number = RUN_NS) =>
    ofType(runOf(uwbAcquisition, variant, ns), 'UWB_MMS_TRAIN')
  const trainAt = (variant: number | undefined, ms: number) => {
    const hit = trainsOf(variant).find((t) => Math.abs(t.t - ms * MS) < MS / 2)
    expect(hit, `no UWB_MMS_TRAIN at ${ms} ms in variant ${String(variant)}`).toBeDefined()
    return hit!
  }

  it('every 「置 1」 is the one value this attribute has, and every 「SP0」 a packet this engine sends', () => {
    // `phyUwbMmsRsfSfd` is one bit, so there is exactly one figure the prose can print here.
    for (const v of everyFig(/(?:不)?置 (\d+)/g, 'the attribute being set', 15)) {
      expect(val(v), 'the value the lesson sets the attribute to').toBe(Number(true))
    }
    expect(DEFAULT_UWB_SESSION.mms.rsfSfd, '「默认为零」 is the engine default').toBe(false)
    expect(SC.uwb!.mms.rsfSfd, 'the base scene leaves it alone').toBe(false)
    expect(uwbAcquisitionScenario('sfd').uwb!.mms.rsfSfd, 'and one scene sets it').toBe(true)
    const kinds = new Set([...runOf(uwbAcquisition, undefined, RUN_NS), ...runOf(uwbAcquisition, SFD, RUN_NS)]
      .filter((r) => r.type === 'TX_START').map((r) => r.frame.kind))
    for (const v of everyFig(/sp(\d)/gi, 'the control packet', 7)) {
      expect(kinds, `SP${v} is a packet this engine really sends`).toContain(`uwbSp${v}`)
    }
  })

  it('the draft two conditions, wherever the lesson states them', () => {
    // 「序列码索引取 9–32」 six times over, and the engine has no such quantity — so what is read
    // is that every statement is the SAME range, and that its upper end is a length the draft
    // allows an SFD after, which is the other condition and is in the engine.
    const ranges = [...EVERYWHERE.matchAll(/(\d+)–(\d+)/g)].map((m) => [val(m[1]), val(m[2])])
    expect(ranges.length, 'the code-index range is stated more than three times').toBeGreaterThan(3)
    for (const pair of ranges) expect(pair, 'the code-index range').toEqual(ranges[0])
    expect(MMS_RSF_SFD_N_MSR, 'its upper end is also a fragment length the draft allows')
      .toContain(ranges[0][1])
    // 「RSF 片段长度为 32 或 64」: the condition the schema does hold, and this is the list.
    const pairs = [...EVERYWHERE.matchAll(/(\d+) 或 (\d+)/g)].map((m) => [val(m[1]), val(m[2])])
    expect(pairs.length, 'the two lengths are stated more than twice').toBeGreaterThan(2)
    for (const p of pairs) expect(p, 'the two lengths an SFD may follow').toEqual([...MMS_RSF_SFD_N_MSR])
    expect(figs(EVERYWHERE, /本课的场景把它设成 (\d+)/, 'the length this lesson runs at')[0])
      .toBe(SC.uwb!.mms.nMsr)
  })

  it('the room table: the room, the three distances, the channel, the fragment and its level', () => {
    const pos = (id: string) => SC.nodes.find((n) => n.id === id)!.pos
    const apart = (a: string, b: string) => Math.hypot(pos(a).x - pos(b).x, pos(a).y - pos(b).y)
    const [w, h] = figs(rowOf('这个房间', '房间')[1], /(\d+) × (\d+) m，没有内墙/, 'the room')
    expect([w, h], 'the room this scene runs in').toEqual([SC.rooms[0].w, SC.rooms[0].h])
    expect(SC.walls, '「没有内墙」: the shell, and nothing inside it').toHaveLength(4)
    same(rowOf('这个房间', '锚点与标签')[1].replace(' m', ''), apart('anchor-1', 'tag-1'),
      'the separation this whole lesson is about')
    const [router, laptop] = raw(rowOf('这个房间', '路由器与笔记本')[1],
      /距锚点 ([\d.]+) m 与 ([\d.]+) m/, 'where the two Wi-Fi radios stand')
    same(router, apart('ap', 'anchor-1'), 'the router distance from the anchor')
    same(laptop, apart('laptop', 'anchor-1'), 'and the laptop one')
    // 「路由器就在锚点墙角」 is the design; the figures above are what it is, this is what it means.
    expect(apart('ap', 'anchor-1'), 'the router is at the anchor corner, not the tag one')
      .toBeLessThan(apart('ap', 'tag-1'))
    const [mhz, width] = figs(rowOf('这个房间', 'Wi-Fi 信道')[1], /(\d+) MHz · (\d+) MHz/, 'the Wi-Fi channel')
    expect([mhz, width], 'the channel this router sits on')
      .toEqual([SC.sixGhzCenterMhz, LESSON_6G_WIDTH_MHZ])
    for (const v of everyFig(/它的 (\d+) MHz 整条压在/g, 'the width that lands in the band', 1)) {
      expect(val(v), 'the same width, where `picture` names it').toBe(LESSON_6G_WIDTH_MHZ)
    }
    // 「64 × 4 × (128 + 2 × 64) = 65 536 码片 · 131.282 µs，带 SFD 时 137.082 µs」
    const frag = rowOf('这个房间', '一个片段')[1]
    const [nMsr, spread, mmrs, two, gap, chips] = figs(frag,
      /(\d+) × (\d+) × \((\d+) \+ (\d+) × (\d+)\) = ([\d\s]+) 码片/, 'the chip arithmetic')
    expect([nMsr, spread, mmrs, gap], 'the four quantities the sequence is made of')
      .toEqual([ACQ_N_MSR, MMS_SPREAD, MMRS_LEN, GAP])
    expect(two, 'the gap sits on both sides of B').toBe(2)
    expect(nMsr * spread * (mmrs + two * gap), 'the lesson own arithmetic').toBe(chips)
    expect(chips, 'and the chips this engine counts').toBe(rsfChips(ACQ_N_MSR, GAP))
    const [bare, withSfd] = raw(frag, /· ([\d.]+) µs，带 SFD 时 ([\d.]+) µs/, 'the fragment, both lengths')
    same(bare, rsfNs(ACQ_N_MSR, GAP) / 1000, 'the sequence itself')
    same(withSfd, rsfAirNs({ ...SC.uwb!.mms, rsfSfd: true }) / 1000, 'and with the SFD appended')
    same(rowOf('这个房间', '一个片段到达')[1].replace(' dBm', ''), trainsOf()[0].rxDbm,
      'the level one fragment arrives at')
  })

  it('the four scenes, cell for cell, against the four runs', () => {
    same(raw(tableOf('四个场景').head.join(' '), /每 ([\d.]+) 秒的距离数/,
      'the window the ranges are counted over')[0], RUN_NS / 1e9, 'that window')
    const rows: [string, number | undefined][] = [
      ['零长控制阶段', undefined], ['每个 RSF 带 SFD', SFD], ['窄带辅助', NBA], ['把 Wi-Fi 挪出', CLEAR],
    ]
    for (const [label, v] of rows) {
      const r = rowOf('四个场景', label)
      const rs = runOf(uwbAcquisition, v, RUN_NS)
      const column = ofType(rs, 'UWB_MMS_TRAIN')
      // the second row does not print the column; it claims the first row one, which is pinned above
      if (/^[\d,]+$/.test(r[1])) {
        expect(r[1].split(',').map(Number), `${label}: the fragment count of every train`)
          .toEqual(column.map((x) => x.heard))
      }
      const [got, all] = figs(r[2], /(\d+) \/ (\d+)/, `${label}: the detected count`)
      expect([got, all], `${label}: trains detected, of all of them`)
        .toEqual([column.filter((x) => x.detected).length, column.length])
      expect(val(r[3]), `${label}: the ranges in the window`).toBe(ofType(rs, 'UWB_RANGE').length)
    }
    // every 「Config N」 — the row label, the variant label and `tryThis` — is the same one
    const configs = everyFig(/Config (\d+)/g, 'the draft configuration number', 3)
    for (const c of configs) expect(c, 'the same configuration everywhere').toBe(configs[0])
    expect(uwbAcquisitionScenario('nba').uwb!.mms.control, 'and it is the narrowband control plane')
      .not.toBe('uwbd')
    // the table own row labels are the labels the reader clicks
    for (const [label] of rows.slice(1)) {
      expect(uwbAcquisition.variants!.map((x) => x.label).filter((x) => x.startsWith(label)),
        `「${label}」 is a scene the reader can load`).toHaveLength(1)
    }
  })

  it('the cost table: both fragment lengths, their air times and their peak powers', () => {
    for (const label of ['64', '32']) {
      const r = rowOf('这个属性的代价', label)
      const nMsr = figs(r[0], /^(\d+)/, 'the row own fragment length')[0]
      expect(MMS_RSF_SFD_N_MSR, `${nMsr} is a length the draft allows an SFD after`).toContain(nMsr)
      const bare = rsfNs(nMsr, GAP)
      const withSfd = bare + SFD_NS
      if (nMsr === ACQ_N_MSR) {
        expect(rsfAirNs({ ...SC.uwb!.mms, rsfSfd: true }), 'which is `rsfAirNs` at this lesson length')
          .toBe(withSfd)
      }
      same(raw(r[1], /([\d.]+) µs/, `${label}: the sequence itself`)[0], bare / 1000, `${label}: µs`)
      same(raw(r[2], /([\d.]+) µs/, `${label}: with the SFD`)[0], withSfd / 1000, `${label}: + SFD µs`)
      const [from, to, drop] = raw(r[3], /−([\d.]+) → −([\d.]+) dBm，低 ([\d.]+) dB/,
        `${label}: the peak power`)
      same(`-${from}`, mmsFragmentDbm(bare), `${label}: the bare fragment peak power`)
      same(`-${to}`, mmsFragmentDbm(withSfd), `${label}: and the one with the SFD`)
      same(drop, mmsFragmentDbm(bare) - mmsFragmentDbm(withSfd), `${label}: what it gives up`)
    }
    expect(figs(EVERYWHERE, /定额 (\d+) nJ/, 'the millisecond energy budget')[0])
      .toBe(UWB_MS_BUDGET_NJ)
    // 「32 那一行是 64 那一行的两倍」. It is 1.96, so 「两倍」 is the sentence rounding — which is
    // why this reads the ratio to one decimal and the two row labels exactly.
    const [shorter, longer] = figs(EVERYWHERE, /：(\d+) 那一行是 (\d+) 那一行的两倍/,
      'the two rows it compares')
    const cost = (n: number): number =>
      mmsFragmentDbm(rsfNs(n, GAP)) - mmsFragmentDbm(rsfNs(n, GAP) + SFD_NS)
    expect(cost(shorter) / cost(longer), 'the shorter fragment pays about twice').toBeCloseTo(2, 1)
    expect(shorter, 'and the shorter of the two is the shorter one').toBeLessThan(longer)
    expect([shorter, longer].map((x) => MMS_RSF_SFD_N_MSR.includes(x as 32 | 64)),
      'both of them are lengths the draft allows').toEqual([true, true])
  })

  it('the formula: the combining line clears the threshold, the acquisition line never ran', () => {
    const f = (uwbAcquisition.numbers ?? []).find(
      (b): b is { kind: 'formula'; text: string; note?: string } => b.kind === 'formula')
    expect(f, 'the formula is gone from `numbers`').toBeDefined()
    const t = trainAt(undefined, 207.5)
    const [lvl, ten, base, heard, sum, sens] = raw(f!.text,
      /累加：−([\d.]+) dBm \+ (\d+)·log(\d+)\((\d+)\) = −([\d.]+) dBm ≥ −(\d+) dBm/, 'the combining line')
    same(`-${lvl}`, t.rxDbm, 'the level one fragment arrives at')
    expect([val(ten), val(base)], 'ten times the base-ten logarithm').toEqual([10, 10])
    expect(val(heard), 'the fragments it adds up').toBe(t.heard)
    same(`-${sum}`, t.rxDbm + combineGainDb(t.heard), 'what those fragments come to')
    expect(-val(sens), 'the sensitivity they clear').toBe(UWB_RX_SENS_DBM)
    const [one, sens2] = raw(f!.text, /捕获：单个片段 −([\d.]+) dBm ≥ −(\d+) dBm/, 'the acquisition line')
    same(`-${one}`, t.rxDbm, 'one fragment, which would clear it on its own')
    expect(-val(sens2), 'against the same sensitivity').toBe(UWB_RX_SENS_DBM)
    // 「但那个片段没有到」: the one index this column does not hold is the one that may open
    expect(ACQ_HEARD, 'fragment 0 is not in this column').not.toContain(0)
    expect(t.detected, 'and so the train is lost although the sum clears by 26 dB').toBe(false)
  })

  it('the six steps, and the table that walks them over the round of block 1', () => {
    expect(rowOf('这六步', '开了窗')[1].split(', ').map(Number), 'the fragments that arrived')
      .toEqual([...ACQ_HEARD])
    expect(figs(rowOf('这六步', '无 SFD 时')[1], /只有片段 (\d+)/,
      'the only opener without the attribute')[0], 'the packet own leading fragment').toBe(0)
    const [opener, margin] = raw(rowOf('这六步', '判定，带 SFD')[1],
      /片段 (\d+) 开场，余量 ([\d.]+) dB/, 'what the attribute changes')
    expect(val(opener), 'the first fragment that did arrive').toBe(ACQ_HEARD[0])
    const withSfd = trainAt(SFD, 207.5)
    same(margin, withSfd.marginDb, 'the margin that train has WITH the attribute')
    expect(withSfd.detected, '「检出」').toBe(true)
    expect(trainAt(undefined, 207.5).detected, 'and 「整列丢失」 without it').toBe(false)
    const steps = (uwbAcquisition.numbers ?? []).find(
      (b): b is { kind: 'steps'; items: string[] } => b.kind === 'steps')
    expect(steps, 'the steps are gone from `numbers`').toBeDefined()
    expect(-figs(steps!.items.join('\n'), /不低于 −(\d+) dBm/, 'the acquisition threshold')[0])
      .toBe(UWB_RX_SENS_DBM)
  })

  it('the fifth scene: its heading, its link, both verdicts, and what the REPORT gives up', () => {
    const off = ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_MMS_TRAIN')
    const on = ofType(runOf(uwbAcquisition, EDGE, EDGE_NS), 'UWB_MMS_TRAIN')
    // the table heading and the variant label print the same ceiling: what one SFD costs
    for (const v of everyFig(/余量不到 ([\d.]+) dB/g, 'the margin this link does not reach', 2)) {
      same(v, COST_DB, `「${v} dB」, which is the peak power one SFD costs`)
    }
    same(rowOf('第五个场景', '房间与距离')[1].replace(/.*，/, '').replace(' m', ''),
      Math.abs(EDGE_TAG_X - EDGE_ANCHOR_X), 'the separation of the edge scene')
    const [arrives, sens] = raw(rowOf('第五个场景', '一个片段到达')[1],
      /−([\d.]+) dBm，而灵敏度是 −(\d+) dBm/, 'the level and the threshold')
    same(`-${arrives}`, off[0].rxDbm, 'the level a fragment arrives at without the attribute')
    expect(-val(sens), 'the threshold it clears').toBe(UWB_RX_SENS_DBM)
    const [marginDb, sfdCost] = raw(rowOf('第五个场景', '余量')[1],
      /([\d.]+) dB，比 SFD 的 ([\d.]+) dB 还小/, 'the margin and the cost')
    same(marginDb, off[0].rxDbm - UWB_RX_SENS_DBM, 'the margin this link has')
    same(sfdCost, COST_DB, 'and what the SFD spends')
    expect(off[0].rxDbm - UWB_RX_SENS_DBM, 'which really is the smaller of the two')
      .toBeLessThan(COST_DB)
    expect(off.filter((x) => x.detected), 'every round acquires without it').toHaveLength(off.length)
    expect(on.filter((x) => x.detected), 'and none of them with it').toHaveLength(0)
    // 「SP0 报告比一个片段还差 8.5 dB」: a fragment burns the millisecond budget inside its own
    // length, an SP0 frame goes out at the node own power. The figure is the bare fragment
    // advantage; with the attribute on it is 0.188 dB less, and the claim it carries — no range
    // either way — does not depend on which of the two.
    const [worse] = raw(EVERYWHERE, /报告比一个片段还差 ([\d.]+) dB/, 'how much worse the REPORT is')
    same(worse, mmsFragmentDbm(rsfNs(ACQ_N_MSR, GAP)) - UWB_TX_POWER_DBM,
      'the peak power a fragment has over a frame sent at the node own power')
  })

  it('`deeper`: the two code families, the two costs, and the threshold an SP0 packet is judged by', () => {
    const deeper = (uwbAcquisition.deeper ?? [])
      .map((b) => `${b.heading ?? ''}\n${'text' in b ? b.text : ''}`).join('\n')
    // 「当这个包用 91 长码或 127 长码」 — the length-127 family is `PSYM_CHIPS` at L = 4, and the
    // length-91 one is the symbol `limits` derives the SFD out of, eight of them.
    const [l91, l127] = figs(deeper, /当这个包用 (\d+) 长码或 (\d+) 长码/, 'the two code families')
    expect(l127 * MMS_SPREAD, 'the length-127 family, spread by four').toBe(PSYM_CHIPS)
    const [symChips] = figs(EVERYWHERE, /个前导符号 × (\d+) 码片/, 'the symbol the SFD is eight of')
    expect(l91 * MMS_SPREAD, 'and the length-91 family, spread by four').toBe(symChips)
    // the two peak-power costs, which the cost table above measures
    const [atThisLength, shortN, atThatLength] = raw(deeper,
      /峰值低 ([\d.]+) dB（片段长度取 (\d+) 时是 ([\d.]+) dB）/, '`deeper` on the two costs')
    same(atThisLength, COST_DB, 'the cost at this lesson own fragment length')
    const shorter = rsfNs(val(shortN), GAP)
    same(atThatLength, mmsFragmentDbm(shorter) - mmsFragmentDbm(shorter + SFD_NS),
      'and the cost at the shorter one')
    // 「那个包按 −89 dBm 判定，比片段苛刻 4 dB」
    const [sp0Sens, penalty] = figs(deeper, /那个包按 −(\d+) dBm 判定，比片段苛刻 (\d+) dB/,
      'the threshold an SP0 packet is judged by')
    expect(-sp0Sens, 'the SP0 sensitivity').toBe(MMS_SP0_RX_SENS_DBM)
    expect(penalty, 'how much harsher it is').toBe(MMS_SP0_PENALTY_DB)
    expect(-sp0Sens - UWB_RX_SENS_DBM, 'which is the difference of the two thresholds').toBe(penalty)
    // 「第五个场景就是这条链路：余量 0.16 dB」, the same link the table measures
    same(raw(deeper, /这条链路：余量 ([\d.]+) dB/, '`deeper` restating the edge margin')[0],
      ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_MMS_TRAIN')[0].rxDbm - UWB_RX_SENS_DBM,
      'the edge link margin')
  })

  it('`limits` and `sources`: the SFD two derivations, the bias it does not add, the thresholds', () => {
    const lim = uwbAcquisition.limits.map((x) => x.text).join('\n')
    const src = (uwbAcquisition.sources ?? []).join('\n')
    const spec = uwbAcquisitionTiming()
    // Every duration in nanoseconds the lesson prints is one of three, each of them computed:
    // the SFD, one for every fragment of a train, and the standard own derivation of the SFD.
    const derived = chipsToNs(8 * val(raw(lim, /个前导符号 × (\d+) 码片/, 'the SFD symbol')[0]))
    const allowed = [SFD_NS, SFD_NS * spec.lanes[0].spans.length, Math.round(derived)]
    for (const v of everyFig(/(\d{1,3}(?: \d{3})*) ns/g, 'a duration in nanoseconds', 6)) {
      expect(allowed, `${v} ns is one of the three durations this lesson has`).toContain(val(v))
    }
    expect(val(raw(EVERYWHERE, /因此多占 ([\d ]+) ns/, 'what a train pays')[0]),
      'one SFD for every fragment of the train').toBe(SFD_NS * spec.lanes[0].spans.length)
    // 「8 个前导符号 × 364 码片 = 5 833 ns，两者差 0.57%」
    const [eight, chipsPer, standardNs] = raw(lim,
      /(\d+) 个前导符号 × (\d+) 码片 = ([\d ]+) ns/, 'the standard own derivation of the SFD')
    same(standardNs, chipsToNs(val(eight) * val(chipsPer)), 'what that route gives')
    same(raw(lim, /两者差 ([\d.]+)%/, 'how far the two derivations are apart')[0],
      (100 * (chipsToNs(val(eight) * val(chipsPer)) - SFD_NS)) / SFD_NS, 'the gap between them')
    for (const v of everyFig(/(\d+) 个前导符号/g, 'the symbols an SFD is made of', 2)) {
      expect(val(v), 'the same count, wherever the lesson names it').toBe(val(eight))
    }
    // 「每个读数就会多 5 800 ns 的偏置，乘光速是 1 739 m」 — the bias it would add if it moved the
    // timestamp, which is why the watchdog above exists.
    const [bias, metres] = raw(lim, /就会多 ([\d ]+) ns 的偏置，乘光速是 ([\d ]+) m/,
      'the bias reading the stamp after the SFD would add')
    expect(val(bias), 'the bias is one SFD').toBe(SFD_NS)
    same(metres, val(bias) * C_M_PER_NS, 'and what that is in metres')
    expect(figs(lim, /仍然是片段 (\d+) 的第一个脉冲/, 'the fragment the RMARKER sits on')[0]).toBe(0)
    // 「137 µs 还远在格子里」: the fragment with its SFD, against the millisecond it sits in
    const [inside] = figs(EVERYWHERE, /格子排，(\d+) µs 还远在格子里/, 'the fragment on the grid')
    expect(inside, 'the fragment with its SFD, to the µs')
      .toBe(Math.round(rsfAirNs({ ...SC.uwb!.mms, rsfSfd: true }) / 1000))
    expect(inside * 1000, 'and a millisecond is the grid it sits on').toBeLessThan(MS)
    // the narrowband control channel, and the band the router is in
    same(raw(EVERYWHERE, /控制信道在 ([\d.]+) MHz/, 'the narrowband control channel')[0],
      nbCenterMhz(uwbAcquisitionScenario('nba').uwb!.mms.nbChannels![0]), 'its centre frequency')
    expect(figs(src, /这条 (\d+) GHz 信道/, 'the band the router is in')[0])
      .toBe(Math.floor(SC.sixGhzCenterMhz! / 1000))
    // every whole-number dBm the lesson prints is one of this engine two thresholds
    for (const v of everyFig(/−(\d+) dBm/g, 'a dBm threshold', 6)) {
      expect([-UWB_RX_SENS_DBM, -MMS_SP0_RX_SENS_DBM],
        `−${v} dBm is one of this engine two thresholds`).toContain(val(v))
    }
  })

  /**
   * **The first pass left twenty-one sites unread, and all of them were restatements.** The
   * sweep's own list: 「长 127」 five times, 「长 91」 five, the four fragment lengths across
   * `picture` and both tables, and the peak-power cost at ten sites. The reads above each took
   * one site of each — the one where the figure is derived — so this takes every occurrence,
   * which is the closing move of every lesson in this programme.
   *
   * 「PSR128」 stays unread: it is the name of a column of the draft's acquisition table, which
   * this repository has no corpus for, and 「长 31」 is the code family the draft's range
   * excludes. Both are counted rather than checked — see the histogram below.
   */
  it('the figures this lesson prints four and five times over, at every one of their sites', () => {
    const lim = uwbAcquisition.limits.map((x) => x.text).join('\n')
    // the two families in use, from the engine and from the SFD derivation
    const l91 = val(raw(lim, /个前导符号 × (\d+) 码片/, 'the symbol the SFD is eight of')[0])
      / MMS_SPREAD
    const inUse = [PSYM_CHIPS / MMS_SPREAD, l91]
    // 「长 (\d+)」 would also read 「每个片段长 5 800 ns」 as the family 5, so a grouped
    // thousand right after it is not a code length.
    const families = everyFig(/长 (\d+)(?! \d{3})/g, 'a code family', 8).map(val)
    const excluded = families.filter((v) => !inUse.includes(v))
    expect(excluded, '「长 31」: one site names the codes the draft excludes, and only one')
      .toHaveLength(1)
    expect(excluded[0], 'and it is shorter than both families in use')
      .toBeLessThan(Math.min(...inUse))
    // 「phy.ts 的 PSYM_CHIPS = 127 × 4」: the spread both families are taken at
    const [named, spread] = figs(lim, /PSYM_CHIPS = (\d+) × (\d+)/, 'the constant `limits` names')
    expect(spread, 'the spreading factor').toBe(MMS_SPREAD)
    expect(named * spread, 'and what that constant multiplies out to').toBe(PSYM_CHIPS)
    // every 「N µs」 is one of the four fragment lengths, each of them computed
    const lengths = [32, 64].flatMap((n) => [rsfNs(n, GAP), rsfNs(n, GAP) + SFD_NS])
      .map((x) => x / 1000)
    for (const v of everyFig(/([\d.]+) µs/g, 'a fragment length', 8)) {
      const dp = (v.split('.')[1] ?? '').length
      expect(lengths.map((x) => Number(x.toFixed(dp))),
        `${v} µs is one of the four fragment lengths this lesson prints`).toContain(val(v))
    }
    // every peak-power cost is the cost at one of those two lengths
    const costs = [64, 32].map((n) =>
      mmsFragmentDbm(rsfNs(n, GAP)) - mmsFragmentDbm(rsfNs(n, GAP) + SFD_NS))
    for (const v of everyFig(
      /低了? ([\d.]+) dB|降了 ([\d.]+) dB|峰值功率差 ([\d.]+) dB|那 ([\d.]+) dB 的峰值|SFD 的 ([\d.]+) dB|余量不到 ([\d.]+) dB/g,
      'the peak power an SFD costs', 8)) {
      const dp = (v.split('.')[1] ?? '').length
      expect(costs.map((c) => Number(c.toFixed(dp))),
        `${v} dB is the SFD's cost at one of the two fragment lengths`).toContain(val(v))
    }
    // Every 「X ms」 the lesson sends the reader to is a record's own instant, to the decimals it
    // prints. The `at()` helper of the block above finds a train within half a millisecond, which
    // leaves the last decimal and part of the first free — the sweep edited 8.000 to 8.100 and
    // nothing noticed.
    const stamps = new Set([...runOf(uwbAcquisition, undefined, RUN_NS),
      ...runOf(uwbAcquisition, SFD, RUN_NS)].map((r) => r.t))
    for (const v of everyFig(/([\d.]+) ms/g, 'an instant the lesson sends the reader to', 6)) {
      const dp = (v.split('.')[1] ?? '').length
      expect([...stamps].some((t) => Number((t / MS).toFixed(dp)) === val(v)),
        `${v} ms is an instant this run really has a record at`).toBe(true)
    }
    // every 「余量 X dB」: the quoted row, its restatement one sentence later, the step table,
    // the quiz, and `deeper` on the edge link — three measured margins between them
    const margins = [trainAt(undefined, 207.5).marginDb, trainAt(SFD, 207.5).marginDb,
      ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_MMS_TRAIN')[0].rxDbm - UWB_RX_SENS_DBM]
    for (const v of everyFig(/余量(?:写着)? ([\d.]+) dB/g, 'a margin', 4)) {
      const dp = (v.split('.')[1] ?? '').length
      expect(margins.map((x) => Number(x.toFixed(dp))),
        `${v} dB is one of the three margins this lesson measures`).toContain(val(v))
    }
    // 「闯进来那一路有 −43.1 dBm，而一个片段只有 −73.28 dBm」 — `observe`'s own tail restates both
    const [foreign, frag] = raw(uwbAcquisition.observe[0],
      /闯进来那一路有 −([\d.]+) dBm，而一个片段只有 −([\d.]+) dBm/, 'the two levels it compares')
    const hit = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_INTERFERED')[0]
    same(`-${foreign}`, hit.foreignDbm, 'the intruder level, restated')
    same(`-${frag}`, trainsOf()[0].rxDbm, 'and the fragment level it is compared with')
  })
})
