/**
 * Every empirical claim in "首片段丢了，整轮就废": the fourteen trains of the run, which of them the
 * acquisition gate threw away, what margin each of those had while being thrown away, and what the
 * SFD attribute gives back.
 *
 * The two comparison runs are a controlled experiment and the first test here is what makes that
 * claim honest: with the attribute on and off, the air is identical — the same trains, the same
 * fragments missing — because this engine does not lengthen an RSF for the SFD. The lesson says so
 * in `sources`, and the assertion is here.
 */
import { describe, it, expect } from 'vitest'
import {
  ACQ_6G_CENTER_MHZ, ACQ_CLEAR_6G_MHZ, ACQ_HEARD, ACQ_N_MSR, uwbAcquisition,
  uwbAcquisitionScenario, uwbAcquisitionTiming,
} from '../../src/course/uwb/uwb-acquisition'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { UwbMmsSchema } from '../../src/model/scenario'
import { MMS_RSF_SFD_N_MSR, combineGainDb, mmsFragmentDbm, rsfNs } from '../../src/uwb/mms'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven ranging blocks — the window the lesson's tables are counted over. */
const RUN_NS = 1300 * MS

lessonShapeSuite(uwbAcquisition, { runNs: RUN_NS })

const SFD = 0
const NBA = 1
const CLEAR = 2

describe('uwb-acquisition · where it sits, and what its scenes are', () => {
  it('follows uwb-uwbd and needs it', () => {
    expect(MODULES[uwbAcquisition.module].title).toBe('窄带控制面')
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

  it('has four legal scenes: the gate, the attribute, Config 2, and no interference', () => {
    const all: Scenario[] = [uwbAcquisition.scenario(), ...uwbAcquisition.variants!.map((v) => v.scenario())]
    expect(all).toHaveLength(4)
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
})

// --- the controlled experiment ----------------------------------------------------------------

describe('uwb-acquisition · the attribute changes nothing on the air', () => {
  it('delivers the same fragments to the same trains with it on and off', () => {
    const off = ofType(runOf(uwbAcquisition, undefined, RUN_NS), 'UWB_MMS_TRAIN')
    const on = ofType(runOf(uwbAcquisition, SFD, RUN_NS), 'UWB_MMS_TRAIN')
    expect(off).toHaveLength(14)
    expect(on).toHaveLength(14)
    // Train for train: the same instant, the same receiver, the same count, the same level. This
    // engine does not add the SFD's chips to an RSF, so the comparison is exact — which the lesson
    // states as a known incompleteness rather than a feature.
    expect(on.map((t) => [t.t, t.node, t.heard, t.rxDbm, t.gainDb]))
      .toEqual(off.map((t) => [t.t, t.node, t.heard, t.rxDbm, t.gainDb]))
    expect(rsfNs(ACQ_N_MSR, 64)).toBe(131_282)
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

  it('lays the same indices into the figure, one span a fragment long', () => {
    const spec = uwbAcquisitionTiming()
    const fragUs = rsfNs(ACQ_N_MSR, 64) / 1000
    expect(spec.lanes).toHaveLength(3)
    expect(spec.lanes[0].spans).toHaveLength(8)
    expect(spec.lanes[0].spans.filter((s) => s.tone === 'muted').map((s) => s.fromUs / 1000)).toEqual([0, 1, 2])
    expect(spec.lanes[1].spans.map((s) => s.fromUs)).toEqual([0])
    expect(spec.lanes[2].spans.map((s) => s.fromUs / 1000)).toEqual([...ACQ_HEARD])
    for (const l of spec.lanes) for (const s of l.spans) expect(s.toUs - s.fromUs).toBeCloseTo(fragUs, 6)
  })
})
