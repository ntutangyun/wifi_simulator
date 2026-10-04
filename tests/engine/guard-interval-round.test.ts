/**
 * The guard interval in a real round (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §3.5, §5 items 2/2b/3/4, §8 items
 * 3/5/6).
 *
 * **Two of these are correctness and three are inertness, and the split is the point.** §3.5 is
 * the one place in this slice where leaving the code alone would be WRONG — the triggered uplink
 * sizes its PSDU from a duration budget — so it gets assertions of its own. The other three say
 * what the knob provably does not touch, because "a legal configuration that provably changes
 * nothing" is how a feature looks finished.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { maxPsduBytesFor } from '../../src/engine/mac'
import { PHY_MODES, TGI_NS, preambleNsFor, symNsFor, txTimeModeNs } from '../../src/engine/phy'
import { airtime } from '../../src/course/tier1/airtime'
import { node, tag } from '../../src/course/lessonKit'
import { oneRoom, sc } from '../../src/course/wifiScenes'
import type { GuardIntervalCfg, Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { bsScenario, bsTag } from './amp-bs-helpers'

const MS = 1_000_000
const RUN_NS = 150 * MS

const run = (s: Scenario, ns: number = RUN_NS): TLRecord[] => [...new Simulation(s).runUntil(ns).records]
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], t: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === t)

/** Every Wi-Fi PPDU of a run: any format, but never AMP and never UWB. */
const wifiPpdus = (rs: TLRecord[]) =>
  ofType(rs, 'TX_START').map((r) => r.frame).filter((f) => !f.amp && !f.uwb)

/** A saturated triggered-uplink scene, the shape `ofdma-ul` teaches. */
const ulScene = (gi?: GuardIntervalCfg): Scenario => sc(oneRoom(), [
  node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
  node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
  node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
], gi ? { guardInterval: gi } : {})

/** One eht link and one older link in the same room, so the section parses and one link is inert. */
const mixedScene = (oldGen: 'vht' | 'nonht', gi?: GuardIntervalCfg): Scenario => sc(oneRoom(), [
  node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
  node('sta-new', 'New', 'sta', 3.5, 5.5, 'eht', 'video'),
  node('sta-old', 'Old', 'sta', 6.5, 5.5, oldGen, 'video'),
], gi ? { guardInterval: gi } : {})

/** The lesson's own two-node scene, at a chosen tier. */
const airtimeScene = (gi?: GuardIntervalCfg): Scenario =>
  gi ? { ...airtime.scenario(), guardInterval: gi } as Scenario : airtime.scenario()

describe('guard interval · correctness: the triggered uplink must not overrun its budget', () => {
  // (a) §3.5 / §8 item 6. `maxPsduBytesFor` turns a DURATION budget into bytes, so a longer
  // symbol against the old divisor yields too many symbols and the TB PPDU runs past its budget.
  it('maxPsduBytesFor shrinks at the quadruple GI, and the bytes it returns still fit', () => {
    const base = maxPsduBytesFor('he', 11, 1, 2_000_000, 20, 1)
    const quad = maxPsduBytesFor('he', 11, 1, 2_000_000, 20, 1, TGI_NS.quad)
    expect(quad).toBeLessThan(base)
    expect(txTimeModeNs('he', base, 11, { widthMhz: 20, nss: 1 })).toBeLessThanOrEqual(2_000_000)
    expect(txTimeModeNs('he', quad, 11, { widthMhz: 20, nss: 1, giNs: TGI_NS.quad }))
      .toBeLessThanOrEqual(2_000_000)
  })

  it('both halves of the arithmetic move: the preamble is in the NUMERATOR', () => {
    // The trap. `nsym = floor((durNs - preambleNs) / symNs)`: swapping only the divisor leaves
    // the 4x LTF's 8.8 µs unpaid, and 8 800 / 16 000 = 0.55 of a symbol, so for some budgets the
    // count comes out one symbol too high and the PPDU overruns. Asserted as the identity rather
    // than as a figure, so no single lucky budget can satisfy it.
    for (const dur of [500_000, 1_000_000, 2_000_000, 2_735_000]) {
      const bytes = maxPsduBytesFor('he', 11, 1, dur, 20, 1, TGI_NS.quad)
      const nsym = Math.floor((dur - preambleNsFor('he', TGI_NS.quad)) / symNsFor('he', TGI_NS.quad))
      expect(bytes).toBe(Math.max(0, Math.floor((nsym * PHY_MODES.he.ndbps[11] - 22) / 8)))
      expect(txTimeModeNs('he', bytes, 11, { widthMhz: 20, nss: 1, giNs: TGI_NS.quad }))
        .toBeLessThanOrEqual(dur)
    }
  })

  it('every trigger-based PPDU of a quadruple-GI round fits the duration it was given', () => {
    const rs = run(ulScene({ gi: 'quad' }))
    const triggers = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'trigger')
    expect(triggers.length).toBeGreaterThan(0)
    // The budget `mac.ts` sizes a TB PPDU against is the Trigger's own per-user duration.
    const budget = new Map<string, number>()
    for (const t of triggers) for (const p of t.frame.muParts ?? []) budget.set(p.dst, p.durNs ?? 0)
    const tbs = wifiPpdus(rs).filter((f) => f.kind === 'data' && f.ru !== undefined)
    expect(tbs.length).toBeGreaterThan(0)
    for (const f of tbs) {
      expect(f.txTimeNs).toBeLessThanOrEqual(2_000_000)
      expect(f.txTimeNs).toBeLessThanOrEqual(budget.get(f.src) ?? 0)
      // And it really is on the quadruple tier, so none of this passes vacuously.
      expect(f.giNs).toBe(3_200)
    }
  })
})

describe('guard interval · correctness: the Duration field follows the longer PPDU', () => {
  // (b) The witness for injecting at ONE place. Miss any of the five `airModeNs` call sites and
  // the Duration field comes out shorter than the stretch of medium it is reserving.
  it('a quadruple-GI data frame is repriced, and still covers the SIFS and its answer', () => {
    const rs = run(airtimeScene({ gi: 'quad' }))
    const datas = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && !r.frame.muParts)
    expect(datas.length).toBeGreaterThan(0)
    const f = datas[0].frame
    expect(f.giNs).toBe(3_200)
    // 1430 B at HE MCS 11, 20 MHz, one stream: six 16 µs symbols behind a 52.8 µs preamble.
    expect(f.txTimeNs).toBe(txTimeModeNs('he', f.bytes, f.mcs!, { widthMhz: 20, nss: 1, giNs: TGI_NS.quad }))
    expect(f.txTimeNs).toBe(148_800)
    const ack = ofType(rs, 'TX_START').find((r) => r.t > datas[0].t && r.frame.kind === 'ack')!
    expect(f.durationFieldNs)
      .toBeGreaterThanOrEqual((ack.t - (datas[0].t + f.txTimeNs)) + ack.frame.txTimeNs)
    // The rate on the record is the quadruple column's, not the base one's (§3.6). Without this
    // the record would say 143.4 Mb/s while its own timeline said otherwise.
    expect(f.mbps).toBe(121.9)
    // And the answer's own rate is untouched: §10.6 sends it at a non-HT reference rate, and the
    // guard interval does not change the constellation.
    expect(ack.frame.mbps).toBe(24)
    expect(ack.frame.giNs).toBeUndefined()
  })

  it('the same scene at the base GI prints the base column, so the figures above are not constants', () => {
    const rs = run(airtimeScene())
    const f = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'data')!.frame
    expect(f.giNs).toBeUndefined()
    expect(f.mbps).toBe(143.4)
    expect(f.txTimeNs).toBe(125_600)
  })
})

describe('guard interval · inert on the pre-HE generations', () => {
  /**
   * §5 items 2 and 2b. The schema refuses a scene with no he/eht link at all, but ONE HE link is
   * enough to let the section through, and the older link beside it must not move.
   *
   * **Two cases rather than one.** "Neither old generation moves" reads like one assertion while
   * testing only one of them, and `nonht` sits further out than `vht`: Table 27-1's GI_TYPE row
   * defers to Table 21-1 for every other format, which is the LONG_GI / SHORT_GI enumeration and
   * not a narrower version of these three values.
   *
   * Baseline for the pure case, measured with the design's instrument B on three published
   * scenes that hold NO he/eht link at all (and so cannot carry the section, which is why they
   * are a note here and not a case): `ampdu` (vht station), `txop` (two vht) and `ifs` (nonht
   * station) give PPDU counts 243 / 702 / 765, delivered bytes 1 290 120 / 1 003 860 / 583 696
   * and airtimes 142.46 / 75.82 / 105.68 ms, each identical across all four GI tiers.
   */
  for (const oldGen of ['vht', 'nonht'] as const) {
    it(`a ${oldGen} link in a quadruple-GI scene keeps its PPDU durations and takes no giNs`, () => {
      const off = wifiPpdus(run(mixedScene(oldGen)))
      const on = wifiPpdus(run(mixedScene(oldGen, { gi: 'quad' })))
      const olds = (fs: typeof off) => fs.filter((f) => f.mode === oldGen && f.kind === 'data')
      expect(olds(off).length).toBeGreaterThan(0)
      expect(olds(on).length).toBeGreaterThan(0)
      // Not a pairwise comparison of the two runs' nth frames: the timeline moves, so the
      // sequences need not line up at all. What must hold is that the set of durations the old
      // generation produces is drawn from the very same values.
      const set = (fs: typeof off) => [...new Set(olds(fs).map((f) => f.txTimeNs))].sort((a, b) => a - b)
      expect(set(on)).toEqual(set(off))
      expect(olds(on).every((f) => f.giNs === undefined)).toBe(true)
      expect(olds(on).every((f) => f.mbps === olds(off)[0].mbps)).toBe(true)
      // While the eht link beside it really did move, so the scene is not inert as a whole.
      expect(on.some((f) => f.mode === 'eht' && f.giNs === 3_200)).toBe(true)
    })
  }
})

describe('guard interval · inert on AMP and UWB frames', () => {
  /**
   * §5 item 3. They are not OFDM Wi-Fi PPDUs: `ppduLayout` sends them to `ampPpduLayout` /
   * `uwbPpduLayout` and `txTimeModeNs` is never on their path. Without this the two AMP fixtures
   * could move in silence.
   *
   * **The design said these records are identical "field for field", and that is almost right —
   * `seq` is the exception, and excluding it is the whole finding rather than a loophole.**
   * Measured: every AMP quantity matches to the last float — `t`, `kind`, `slot`, `rxDbmAtAp`,
   * `snrDb`, `powered`, `incidentDbm`, `sent`, `acked` — while one `AMP_BS_REPLY` came back with
   * `seq` 110 instead of 112. `seq` is not an AMP quantity at all: it is the record stream's own
   * global counter, and it moved because the Wi-Fi side of the same scene emitted two records
   * fewer before that instant. Asserting it would be asserting that the Wi-Fi timeline did NOT
   * move, which is the opposite of what this slice does — and it is one of the three things the
   * timeline hash eats, which is exactly why `airtime#0` gets a hash of its own.
   *
   * **Two scenes, because one makes two of the three types vacuous.** Adding an active tag to
   * the backscatter scene takes the reader's polling over entirely and `AMP_BS_REPLY` /
   * `AMP_BS_BOOT` both drop to zero — a pass over an empty list. So the backscatter tier is
   * measured on its own scene and the Active Tx tier on its own, each with a floor under the
   * count of the records it is supposed to produce.
   */
  const strip = (r: TLRecord): string => {
    const { seq: _globalCounter, ...rest } = r as TLRecord & { seq?: number }
    return JSON.stringify(rest)
  }
  const sta = node('sta-1', 'TV', 'sta', 3, 2, 'he', 'video')

  const cases = [
    { what: 'the backscatter tier', scene: () => bsScenario({}, [bsTag('tag-1', 0.3)], [sta]), types: ['AMP_BS_REPLY', 'AMP_BS_BOOT'] as const },
    { what: 'the Active Tx tier', scene: () => bsScenario({}, [], [sta, tag('tag-a', 'Active', 6, 5)]), types: ['AMP_RESULT'] as const },
  ]

  for (const { what, scene, types } of cases) {
    it(`${what} beside a quadruple-GI Wi-Fi link is unchanged in every field it owns`, () => {
      const base = scene()
      const off = run(base)
      const on = run({ ...base, guardInterval: { gi: 'quad' } } as Scenario)
      for (const type of types) {
        const a = ofType(off, type)
        expect(a.length, `${type} must not be empty, or this passes over nothing`).toBeGreaterThan(0)
        expect(ofType(on, type).map(strip), type).toEqual(a.map(strip))
      }
      // Not one AMP or UWB PPDU carries the field, and their durations do not move either.
      const amps = (rs: TLRecord[]) => ofType(rs, 'TX_START').map((r) => r.frame).filter((f) => f.amp || f.uwb)
      expect(amps(off).length).toBeGreaterThan(0)
      expect(amps(on).length).toBe(amps(off).length)
      expect(amps(on).every((f) => f.giNs === undefined)).toBe(true)
      expect(amps(on).map((f) => f.txTimeNs)).toEqual(amps(off).map((f) => f.txTimeNs))
      // And the Wi-Fi side of the same scene really did move, so this is not a dead scene.
      expect(ofType(on, 'TX_START').some((r) => r.frame.giNs === 3_200)).toBe(true)
    })
  }
})

describe('guard interval · inert on an underloaded scene: a cost with no consequence', () => {
  /**
   * §5 item 4 / §8 item 5, and the sentence this lesson prints.
   *
   * **Instrument, stated once and precisely**: `airtime`'s OWN scenario (an eht access point and
   * an he TV, one video stream), `runUntil(150 ms)`, default seed, and **every non-AMP non-UWB
   * `TX_START` PPDU** — which on this scene is 175 data frames and their 175 ACKs.
   *
   * The plan's own sentence said "`TX_START` with `frame.mode` in {he, eht}", and **that
   * instrument contradicts the figures printed beside it**: filtering to HE/EHT gives 175 PPDUs
   * and 21.98 → 26.04 ms, not 350 and 26.88 → 30.94 ms. The published figures are the all-PPDU
   * ones, and they are also the honest ones for this lesson, whose whole subject is that an
   * exchange costs two airtimes and only one of them grows. Delivered bytes are the PSDU octets
   * of the data frames that arrived (175 × 1430 = 250 250), not their MSDU payloads
   * (175 × 1400 = 245 000).
   *
   * **Three tiers, and that covers all four rows of the design's §2.2 table.** Its fourth row,
   * "3.2 µs GI with the 4x LTF", IS `gi: 'quad'` here: §1.4 pairs the two, so the engine never
   * emits 3.2 µs with a 2x LTF. The difference in shape is between the design's instrument B
   * (which set `symNs` and `preambleNs` by hand and could therefore separate them) and this
   * implementation, not a round left unrun.
   */
  const TIERS = [undefined, { gi: 'double' } as const, { gi: 'quad' } as const]

  it('delivers the same 350 PPDUs and 250 250 octets at every tier, with zero loss', () => {
    const measured = TIERS.map((gi) => {
      const rs = run(airtimeScene(gi))
      const ppdus = wifiPpdus(rs)
      return {
        ppdus: ppdus.length,
        octets: ofType(rs, 'RX_OK').reduce((s, r) => s + (r.frame.kind === 'data' ? r.frame.bytes : 0), 0),
        rxFail: ofType(rs, 'RX_FAIL').length,
        drop: ofType(rs, 'DROP').length,
        airNs: ppdus.reduce((s, f) => s + f.txTimeNs, 0),
      }
    })
    expect(measured.map((m) => m.ppdus)).toEqual([350, 350, 350])
    expect(measured.map((m) => m.octets)).toEqual([250_250, 250_250, 250_250])
    expect(measured.map((m) => m.rxFail)).toEqual([0, 0, 0])
    expect(measured.map((m) => m.drop)).toEqual([0, 0, 0])
    // A cost with no consequence: the airtime strictly rises, and the quadruple tier is at least
    // 15 % over the base. This has to be pinned explicitly rather than left looking as though
    // the knob took effect on anything a reader would call a result.
    expect(measured[1].airNs).toBeGreaterThan(measured[0].airNs)
    expect(measured[2].airNs).toBeGreaterThan(measured[1].airNs)
    expect(measured.map((m) => +(m.airNs / 1e6).toFixed(2))).toEqual([26.88, 27.72, 30.94])
    expect(measured[2].airNs / measured[0].airNs).toBeGreaterThanOrEqual(1.15)
  })
})
