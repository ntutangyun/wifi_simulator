/**
 * Every empirical claim in the "A radio that measures time" lesson, measured
 * against the lesson's own scenario and its 20 m variant. Each assertion quotes
 * the sentence it guards; standard constants are checked against the engine's
 * exports (src/uwb/phy.ts, src/uwb/ranging.ts, src/uwb/clock.ts) rather than
 * re-typed.
 *
 * The frame anatomy — the 197.628 µs table, the RMARKER offset and the two-slot
 * round — moved with its sentences to tests/course/uwb-frame.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbIntro, uwbIntroScenario, uwbIntroTiming } from '../../src/course/uwb/uwb-intro'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { SLOT_NS } from '../../src/engine/phy'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import type { Block } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import {
  COUNTER_BITS, COUNTER_MOD, C_M_PER_NS, RCTU_NS, RCTU_PS, RSTU_NS, UWB_CHIP_HZ, UWB_CHIP_NS,
  UWB_PPM_MAX, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
} from '../../src/uwb/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
/** 1-σ of one SS-TWR range at the session's 100 ps timestamp noise: 21.2 mm. */
const SIGMA_R = rangeSigmaM(100)
/** 1-σ of the corrected SS-TWR reading's clock-correction residual: ½·Treply·σ_cfo, 6.0 cm at a 2 ms reply. */
const CFO_RESIDUAL_M = ((2 * MS * 0.2e-6) / 2) * C_M_PER_NS

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbIntro, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// A track's first lesson is held to 1000 main-path words, not 1300, and the
// prose window (why + outcomes + terms + picture + numbers) to the same 1000.
lessonShapeSuite(uwbIntro, { runNs: RUN_NS })

describe('uwb-intro · the lesson’s own scene', () => {
  it('is the opening lesson of the UWB track', () => {
    // at most four new words, and no table in the picture
    expect(uwbIntro.terms!.map((t) => t.term)).toEqual(['UWB', 'anchor', 'RMARKER', 'RCTU'])
    expect(uwbIntro.picture!.some((b) => b.kind === 'table')).toBe(false)
    // it assumes Wi-Fi Tier 1 and nothing else
    expect(uwbIntro.needs).toEqual(['radio-primer', 'frame-anatomy'])
    // the module the lesson opens: UWB Tier 1, "Time of flight"
    expect(MODULES[uwbIntro.module].title).toBe('飞行时间')
  })

  it('the scenario and the variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbIntro.scenario())).not.toThrow()
    for (const v of uwbIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the scene is one anchor and one phone, both crystals pinned to 0 ppm', () => {
    // "one anchor, one phone, four timestamps, one distance" / "Both crystals are pinned to 0 ppm
    //  here, which no real pair ever is"
    for (const s of [uwbIntro.scenario(), uwbIntro.variants![0].scenario()]) {
      expect(s.nodes.map((n) => n.kind)).toEqual(['uwb', 'uwb'])
      expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'tag'])
      expect(s.nodes.map((n) => n.uwb!.ppm)).toEqual([0, 0])
      // no AP, no stations, no Wi-Fi traffic at all
      expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
      expect(s.servers).toEqual([])
      // "single-sided two-way ranging" with nothing in the way
      expect(s.uwb).toMatchObject({ method: 'ss', nlos: false, slotRstu: 2400, blockRstu: 240_000, tsNoisePs: 100, cfoNoisePpm: 0.2 })
      // "−14 dBm of transmit power" — the kit takes it from the engine, so the lesson cannot drift
      expect(s.nodes.every((n) => n.txPowerDbm === UWB_TX_POWER_DBM)).toBe(true)
    }
  })

  it('the two model constants the lesson invites you to argue with are the engine’s own', () => {
    // sources: "−14 dBm of transmit power, −93 dBm of sensitivity, 100 ps of 1-σ noise on every
    //  received timestamp, and 0.2 ppm of residual error in the clock-offset estimate"
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(UWB_RX_SENS_DBM).toBe(-93)
    expect(uwbIntro.scenario().nodes.map((n) => n.txPowerDbm)).toEqual([-14, -14])
  })

  it('the two placements are exactly 5 m and 20 m apart, in line and at one height', () => {
    // the base scene and its variant, measured off the scenarios themselves
    const sep = (s: Scenario): number => {
      const [a, t] = s.nodes
      return Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y, t.pos.z - a.pos.z)
    }
    expect(sep(uwbIntroScenario(5))).toBe(5)
    expect(sep(uwbIntroScenario(20))).toBe(20)
    expect(sep(uwbIntro.scenario())).toBe(5)
    expect(sep(uwbIntro.variants![0].scenario())).toBe(20)
  })

})

describe('uwb-intro · the units', () => {
  it('the chip is 2.003 ns at 499.2 MHz and the counter unit 15.650 ps', () => {
    // the "Units" table: "A 499.2 MHz chip | 2.003 ns" and "One RCTU = 2⁻⁷ chip | 15.650 ps",
    // and the quiz's "The counter runs 128 times finer than the 499.2 MHz chip rate."
    expect(UWB_CHIP_HZ).toBe(499.2e6)
    expect(UWB_CHIP_NS.toFixed(3)).toBe('2.003')
    expect(RCTU_NS).toBe(UWB_CHIP_NS / 2 ** 7)
    expect(RCTU_PS.toFixed(3)).toBe('15.650')
    expect(UWB_CHIP_NS / RCTU_NS).toBe(128)
    // the wrong quiz option "One chip, 2.003 ns, about 60 cm" is wrong by being right about the chip
    expect((UWB_CHIP_NS * C_M_PER_NS * 100).toFixed(0)).toBe('60')
    // the two FiRa numbers the sources name: "the 2 ms ranging slot and the 200 ms ranging block"
    expect(RSTU_NS.toFixed(3)).toBe('833.333')
    expect(Math.round(2400 * RSTU_NS)).toBe(2 * MS)
    expect(Math.round(240_000 * RSTU_NS)).toBe(200 * MS)
  })

  it('the 1 ns timeline grid is 64 ranging ticks wide', () => {
    // numbers: "The counter does not round: it is stamped in 15.650 ps units, a grid 64 times
    //  finer." (finer, that is, than the 1 ns grid the timeline counts in)
    expect(Math.round(1 / RCTU_NS)).toBe(64)
  })

  it('one metre is 3.3356 ns and 213.1 ticks, so a tick is 4.7 mm of flight and 2.3 mm of range', () => {
    // the "Units" table: "One metre of flight | 3.3356 ns = 213.1 RCTU | c = 0.299792458 m/ns" and
    // "A tick of timing error | 4.7 mm flight, 2.3 mm range | a round trip, halved"
    const nsPerMetre = 1 / C_M_PER_NS
    expect(C_M_PER_NS).toBe(0.299792458)
    expect(nsPerMetre.toFixed(4)).toBe('3.3356')
    expect((nsPerMetre / RCTU_NS).toFixed(1)).toBe('213.1')
    expect((rctuToMetres(1) * 1000).toFixed(1)).toBe('4.7')
    expect(((rctuToMetres(1) / 2) * 1000).toFixed(1)).toBe('2.3')
  })

  it('the 40-bit counter wraps after 17.2 seconds', () => {
    // "Going deeper": "The counter is 40 bits wide in this model; the standard asks only for 32 or
    //  more. At 15.650 ps a tick, 2⁴⁰ ticks is 17.2 seconds, and then it wraps to zero."
    expect(COUNTER_BITS).toBe(40)
    expect(COUNTER_MOD).toBe(2 ** 40)
    expect(((COUNTER_MOD * RCTU_NS) / 1e9).toFixed(1)).toBe('17.2')
    // "every subtraction above is modulo 2⁴⁰"
    expect(counterDiff(5, COUNTER_MOD - 5)).toBe(10)
  })

  it('the standard allows ±20 ppm, which costs six metres on a 2 ms reply', () => {
    // `sources`: "the ±20 ppm crystal tolerance of §16.4.9 is not needed until the lesson about
    //  clock rate". The depth paragraph that spent that number here — "at 20 ppm of relative
    //  offset the anchor's 2 ms reply is mismeasured by 40 ns, half of which lands on the range"
    //  — went with the 2026-09-26 re-pacing (§5.1 · 8), because it pre-played the whole of
    //  `uwb-sstwr`. The claim is not lost: `uwb-sstwr` states it in the note of "what the raw
    //  estimate really holds" and pins it in tests/course/uwb-sstwr.test.ts. What is measured
    //  here is the tolerance this lesson's own `sources` still cites, and what it would cost
    //  on this lesson's own 2 ms reply — which is why the forward pointer is honest.
    expect(UWB_PPM_MAX).toBe(20)
    const errNs = 2 * MS * 20e-6
    expect(errNs).toBe(40)
    expect((errNs / 2) * C_M_PER_NS).toBeCloseTo(6, 1)
  })
})

describe('uwb-intro · the figure of the round', () => {
  // §4 gives this lesson a `timing` figure, 两只钟上的四个计数读数. Every instant it
  // prints is read back out of the run here, so the picture cannot drift from the
  // timeline: the two frames each device sends, and the two it receives.
  const rs = recs()
  const spec = uwbIntroTiming()
  const lane = (i: number) => spec.lanes[i].spans.map((s) => [s.fromUs * US, s.toUs * US])

  it('the four spans are the run’s own two transmissions and two receptions', () => {
    const tx = ofType(rs, 'TX_START')
    const rx = ofType(rs, 'RX_START')
    expect(tx).toHaveLength(2)
    expect(rx).toHaveLength(2)
    expect(spec.lanes.map((l) => l.label)).toEqual(['手机 tag-1', '锚点 anchor-1'])
    // the phone sends the poll and receives the answer; the anchor the other way round
    expect(tx.map((r) => r.node)).toEqual(['tag-1', 'anchor-1'])
    expect(rx.map((r) => r.node)).toEqual(['anchor-1', 'tag-1'])
    expect(lane(0)).toEqual([
      [tx[0].t, tx[0].t + tx[0].frame.txTimeNs],
      [rx[1].t, rx[1].t + tx[1].frame.txTimeNs],
    ])
    expect(lane(1)).toEqual([
      [rx[0].t, rx[0].t + tx[0].frame.txTimeNs],
      [tx[1].t, tx[1].t + tx[1].frame.txTimeNs],
    ])
  })

  it('the caption’s claim: the wait between the two frames dwarfs the flight it measures', () => {
    // "the 2 ms between the two frames is five orders of magnitude bigger than the flight"
    const flightNs = 5 / C_M_PER_NS
    const waitNs = FIG.respTx * US - FIG.pollTxEnd * US
    expect(Math.round(Math.log10(waitNs / flightNs))).toBe(5)
    // and the whole figure holds the round: the range line falls inside its window
    expect(ofType(rs, 'UWB_RANGE')[0].t).toBeLessThanOrEqual(FIG.windowUs * US)
    expect(ofType(rs, 'UWB_RANGE')[0].t).toBe(FIG.respRxEnd * US)
    // four stamps, one per span
    expect(ofType(rs, 'UWB_TS')).toHaveLength(4)
  })
})

describe('uwb-intro · the flight time on the timeline', () => {
  const gaps = (rs: TLRecord[]): number[] => {
    const t = ofType(rs, 'TX_START')
    const r = ofType(rs, 'RX_START')
    expect(t).toHaveLength(2)
    expect(r).toHaveLength(2)
    return [r[0].t - t[0].t, r[1].t - t[1].t]
  }

  it('five metres of air is a 17 ns gap between TX_START and RX_START, both ways', () => {
    // observe: "TX_START on the phone’s lane at 0 ns, RX_START on the anchor’s at 17 ns. Five
    //  metres of air, to scale for once." / the numbers table "Flight, and where it lands on the
    //  timeline": "5 m | 16.678 ns | 17 ns"
    const rs = recs()
    expect(ofType(rs, 'TX_START')[0].t).toBe(0)
    expect(gaps(rs)).toEqual([17, 17])
  })

  it('twenty metres is 67 ns — four times the distance, four times the delay', () => {
    // tryThis: "The arrival gap grows from 17 ns to 67 ns — four times the distance, four times
    //  the flight." / the same table's second row: "20 m | 66.713 ns | 67 ns"
    expect(gaps(recs(0))).toEqual([67, 67])
    expect((20 / C_M_PER_NS).toFixed(3)).toBe('66.713')
    expect((4 * (5 / C_M_PER_NS)).toFixed(3)).toBe('66.713')
  })

  it('the engine rounds the flight UP, never to nearest — measured where the two differ', () => {
    // numbers: "The event queue counts whole nanoseconds, always rounding up so nothing arrives
    //  too early", against the table's 16.678 ns of flight showing as 17 ns
    // Both lesson distances have a fraction above 0.5, so Math.round would give the same 17 and 67:
    // this measures a scratch placement whose fraction is 0.336, where round gives 3 and ceil 4.
    const scratch = uwbIntroScenario(5)
    const near: Scenario = {
      ...scratch,
      nodes: scratch.nodes.map((n) => (n.uwb!.role === 'tag' ? { ...n, pos: { ...n.pos, x: 2 } } : n)),
    }
    const rs = [...new Simulation(near).runUntil(RUN_NS).records]
    const flight1m = 1 / C_M_PER_NS
    expect(flight1m.toFixed(3)).toBe('3.336')
    expect(Math.round(flight1m)).toBe(3)
    const gap1m = ofType(rs, 'RX_START')[0].t - ofType(rs, 'TX_START')[0].t
    expect(gap1m).toBe(Math.ceil(flight1m))
    expect(gap1m).toBe(4)
    // and at both lesson distances the gap is the flight rounded up, never down
    for (const [variant, d] of [[undefined, 5], [0, 20]] as const) {
      const flightNs = d / C_M_PER_NS
      const [poll, resp] = gaps(recs(variant))
      for (const gap of [poll, resp]) {
        expect(gap).toBeGreaterThanOrEqual(flightNs)
        expect(gap).toBeLessThan(flightNs + 1)
      }
    }
    expect((5 / C_M_PER_NS).toFixed(3)).toBe('16.678')
  })

  it('the Wi-Fi channel, by contrast, delivers a frame at the instant it was transmitted', () => {
    // "Going deeper": "The Wi-Fi half of this simulator delivers a frame at the instant it was
    //  transmitted, deliberately. Across a flat, propagation delay is tens of nanoseconds against a
    //  9 µs slot, so dropping it costs the MAC nothing."
    expect(SLOT_NS).toBe(9 * US)
    const wifi = LESSONS.find((l) => l.id === 'airtime')!.scenario()
    const rs = [...new Simulation(wifi).runUntil(20 * MS).records]
    const tx = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data')
    expect(tx.length).toBeGreaterThan(0)
    for (const t of tx.slice(0, 5)) {
      const rx = ofType(rs, 'RX_START').filter((r) => r.from === t.node && r.t >= t.t && r.t < t.t + t.frame.txTimeNs)
      expect(rx.length, `RX_START for the frame at ${t.t}`).toBeGreaterThan(0)
      for (const r of rx) expect(r.t, 'the Wi-Fi channel adds no flight time').toBe(t.t)
    }
  })
})

describe('uwb-intro · the four lines to subtract', () => {
  const rs = recs()
  const ts = ofType(rs, 'UWB_TS')

  it('the round stamps exactly four counters, tag-tx, anchor-rx, anchor-tx, tag-rx', () => {
    // "This round produces exactly four of them, in this order." — and the four "Log line" rows
    expect(ts.map((r) => `${r.node} ${r.dir} ${r.frameKind}`)).toEqual([
      'tag-1 tx uwbPoll', 'anchor-1 rx uwbPoll', 'anchor-1 tx uwbResp', 'tag-1 rx uwbResp',
    ])
    for (let i = 1; i < ts.length; i++) expect(ts[i].t).toBeGreaterThan(ts[i - 1].t)
  })

  it('the counters in the table are the counters in the log', () => {
    // the "Counter (RCTU)" column, and the log lines the "Log line" column quotes
    expect(ts.map((r) => r.counter)).toEqual([336_207_494_656, 26_381_598_252, 26_509_392_384, 336_335_290_928])
    expect(ts.map((r) => fmtRecord(r).split(': counter ')[0])).toEqual([
      'tag-1 TX RMARKER → * poll',
      'anchor-1 RX RMARKER ← tag-1 poll',
      'anchor-1 TX RMARKER → tag-1 resp',
      'tag-1 RX RMARKER ← anchor-1 resp',
    ])
  })

  it('subtracting them by hand gives 1070 RCTU, 16.75 ns, 5.02 m — the range line’s raw figure', () => {
    // "Tround = 336 335 290 928 − 336 207 494 656 = 127 796 272 / Treply = 26 509 392 384 −
    //  26 381 598 252 = 127 794 132 / T̂prop = (127 796 272 − 127 794 132) / 2 = 1070 RCTU = 16.75 ns
    //  = 5.02 m" — the try-this experiment of uwb-frame asks the learner to do exactly this.
    const [t1, t2, t3, t4] = ts.map((r) => r.counter)
    const tround = counterDiff(t4, t1)
    const treply = counterDiff(t3, t2)
    expect(tround).toBe(127_796_272)
    expect(treply).toBe(127_794_132)
    expect(tround - treply).toBe(2140)
    const tof = ssTwrRaw(tround, treply)
    expect(tof).toBe(1070)
    expect((tof * RCTU_NS).toFixed(2)).toBe('16.75')
    expect(rctuToMetres(tof).toFixed(2)).toBe('5.02')
    // it is the engine's own raw figure, not a coincidence of arithmetic
    expect(ofType(rs, 'UWB_RANGE')[0].tofRawRctu).toBe(tof)
  })

  it('1070 is 4.3 ticks long: the truth is 16.678 ns, or 1065.7 ticks', () => {
    // the formula note: "A difference of 2140 between two numbers in the hundreds of billions.
    //  The truth is 1065.7 ticks: the reading runs 4.3 ticks long, because each receive counter
    //  carries 100 ps of noise and ticks are whole." — 1065.7 ticks is the table's 16.678 ns
    const trueRctu = 5 / C_M_PER_NS / RCTU_NS
    expect(trueRctu.toFixed(1)).toBe('1065.7')
    expect((1070 - trueRctu).toFixed(1)).toBe('4.3')
  })

  it('the anchor’s reply is 2 ms − Tprop and the phone’s round trip 2 ms + Tprop', () => {
    // step 3 of "From four counters to metres": "One slot later, 2 ms on, the anchor stamps its
    //  answer's RMARKER" — so the reply dwarfs the flight by five orders of magnitude, and the
    //  formula of the same section cancels it.
    const [t1, t2, t3, t4] = ts.map((r) => r.counter)
    const flightNs = 5 / C_M_PER_NS
    expect(counterDiff(t3, t2) * RCTU_NS).toBeCloseTo(2 * MS - flightNs, 0)
    expect(counterDiff(t4, t1) * RCTU_NS).toBeCloseTo(2 * MS + flightNs, 0)
    expect(Math.round(Math.log10((2 * MS) / flightNs))).toBe(5)
  })
})

describe('uwb-intro · the range the log reports', () => {
  it('the range line reads 4.95 m against a true 5.00 m, with raw 5.02 m beside it', () => {
    // the numbers formula "What the range line says": "tag-1 range → anchor-1 (SS): 4.95 m
    //  (true 5.00 m, raw 5.02 m)" / observe: "Find the UWB_RANGE line at 2 187 389 ns."
    const rs = recs()
    const ranges = ofType(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].t).toBe(2_187_389)
    expect(ranges[0].node).toBe('tag-1')
    expect(ranges[0].peer).toBe('anchor-1')
    expect(ranges[0].method).toBe('ss')
    expect(ranges[0].trueDistM).toBe(5)
    expect(fmtRecord(ranges[0])).toBe('tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)')
  })

  it('both readings land within three sigma of the true 5 m', () => {
    // "The distance the log reports will sit a few centimetres either side of the truth" —
    // raw and corrected differ even at 0 ppm, so neither is pinned to equality.
    const r = ofType(recs(), 'UWB_RANGE')[0]
    expect(SIGMA_R.toFixed(3)).toBe('0.021')
    // the raw reading carries the timestamp noise alone; the corrected one also carries the
    // CFO estimator's residual (½·Treply·σ_cfo = 6.0 cm at a 2 ms reply), so its envelope is the two combined.
    expect(Math.abs(rctuToMetres(r.tofRctu) - 5)).toBeLessThan(3 * Math.hypot(SIGMA_R, CFO_RESIDUAL_M))
    expect(Math.abs(rctuToMetres(r.tofRawRctu!) - 5)).toBeLessThan(3 * SIGMA_R)
    expect(rctuToMetres(r.tofRctu)).toBeCloseTo(r.distM, 9)
  })

  it('the correction moves a perfect-crystal answer by 7 cm, the 0.2 ppm the estimator cannot see past', () => {
    // numbers: "Both crystals are perfect here, so there was nothing to correct — yet the answer
    //  moved 7 cm, because the correction rests on an estimate that is itself noisy". The 0.2 ppm
    //  of that estimate is named in `sources`, and where it comes from is `uwb-sstwr`'s subject
    //  (§5.1 · 8); the observation reads "a few centimetres out, against 2.1 cm of
    //  range-noise sigma" — a figure uwb-position quotes back as "Lesson 1’s 2.1 cm of σ_r".
    const r = ofType(recs(), 'UWB_RANGE')[0]
    const raw = rctuToMetres(r.tofRawRctu!)
    const corrected = rctuToMetres(r.tofRctu)
    expect(Math.round((raw - corrected) * 100)).toBe(7)
    expect(Math.round((raw - 5) * 100)).toBe(2)
    expect(Math.round((corrected - 5) * 100)).toBe(-5)
    expect((SIGMA_R * 100).toFixed(1)).toBe('2.1')
    // one sigma of the correction itself: 2 ms × 0.2 ppm, halved, in metres
    const cfoNoisePpm = uwbIntro.scenario().uwb!.cfoNoisePpm
    expect(cfoNoisePpm).toBe(0.2)
    expect((2 * MS * cfoNoisePpm * 1e-6).toFixed(1)).toBe('0.4')
    expect(Math.abs(raw - corrected)).toBeLessThan(3 * ((2 * MS * cfoNoisePpm * 1e-6) / 2) * C_M_PER_NS)
  })

  it('at 20 m the range reads 19.95 m and the error has not grown with the distance', () => {
    // "the range line now reads 19.95 m against a true 20.00 m. Note what did not grow: the error is
    //  still about 5 cm, because timestamp noise does not care how far the frame flew."
    const r = ofType(recs(0), 'UWB_RANGE')[0]
    expect(r.trueDistM).toBe(20)
    expect(r.distM.toFixed(2)).toBe('19.95')
    expect(Math.round((r.distM - 20) * 100)).toBe(-5)
    expect(Math.abs(r.distM - 20)).toBeLessThan(3 * Math.hypot(SIGMA_R, CFO_RESIDUAL_M))
    expect(Math.abs(rctuToMetres(r.tofRawRctu!) - 20)).toBeLessThan(3 * SIGMA_R)
  })
})

describe('uwb-intro · the procedure, step by step', () => {
  // The steps block "From four counters to metres" is the path src/uwb/device.ts takes, in its
  // order: `transmitFor` stamps `clock.counter(t + UWB_RMARKER_NS)` before it sends; the receive
  // branch of `onRx` stamps the arriving RMARKER; the anchor's uwbResp case subtracts its own two
  // readings into `replyRctu`; `onResponse` subtracts the tag's two, calls `ssTwrRaw`, and
  // `reportRange` turns ticks into metres with `rctuToMetres`.
  const rs = recs()
  const ts = ofType(rs, 'UWB_TS')
  const steps = uwbIntro.numbers!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>

  it('the lesson states the procedure as six steps, on the main path', () => {
    expect(steps).toBeDefined()
    expect(steps.items).toHaveLength(6)
    expect(uwbIntro.picture!.some((b) => b.kind === 'steps')).toBe(false)
  })

  it('steps 1 and 2: the phone stamps what it is about to send, the anchor what arrives', () => {
    // "The phone stamps the RMARKER it is about to send, then sends the poll." /
    // "The anchor stamps that same RMARKER as it arrives."
    expect(ts[0]).toMatchObject({ node: 'tag-1', dir: 'tx', frameKind: 'uwbPoll', t: 0 })
    expect(ts[1]).toMatchObject({ node: 'anchor-1', dir: 'rx', frameKind: 'uwbPoll' })
    // the transmit stamp is taken before the frame leaves: it shares the instant of its TX_START
    expect(ofType(rs, 'TX_START')[0].t).toBe(ts[0].t)
    // and both name the same landmark, 17 ns apart on the timeline — five metres of air
    expect(ofType(rs, 'RX_START')[0].t - ofType(rs, 'TX_START')[0].t).toBe(17)
  })

  it('step 3: one slot on, the anchor subtracts its own two readings into the answer', () => {
    // "One slot later, 2 ms on, the anchor stamps its answer's RMARKER, subtracts its own two
    //  readings, and writes that reply time into the answer."
    expect(ts[2]).toMatchObject({ node: 'anchor-1', dir: 'tx', frameKind: 'uwbResp', t: 2 * MS })
    expect(ts[2].t - ts[0].t).toBe(2 * MS)
    const resp = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbResp')!
    expect(resp.frame.uwb!.replyRctu).toBe(counterDiff(ts[2].counter, ts[1].counter))
    expect(resp.frame.uwb!.replyRctu).toBe(127_794_132)
  })

  it('steps 4 to 6: round trip, halved difference, and the metres that come out', () => {
    // "The phone stamps the answer on arrival and subtracts its own two readings: the round trip."
    // "Reply time out of round trip, halved: one flight, still in ticks."
    // "Ticks × 15.650 ps × 0.299792458 m/ns: the metres the range line prints."
    expect(ts[3]).toMatchObject({ node: 'tag-1', dir: 'rx', frameKind: 'uwbResp' })
    const tround = counterDiff(ts[3].counter, ts[0].counter)
    const treply = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbResp')!.frame.uwb!.replyRctu!
    const flight = ssTwrRaw(tround, treply)
    expect(flight).toBe((tround - treply) / 2)
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(range.tofRawRctu).toBe(flight)
    // the last step is exactly this arithmetic, with no third constant hiding in it
    expect(rctuToMetres(flight)).toBeCloseTo(flight * (RCTU_PS / 1000) * C_M_PER_NS, 12)
    expect((RCTU_PS / 1000) * 1000).toBeCloseTo(15.650, 3)
    expect(rctuToMetres(flight).toFixed(2)).toBe('5.02')
  })

  it('the procedure is the whole of it: four stamps in, one range out, nothing else', () => {
    // the steps name four stampings and one range, and the run holds exactly that
    expect(ts).toHaveLength(4)
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(1)
    expect(ofType(rs, 'UWB_STS_REJECT')).toHaveLength(0)
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(0)
  })
})

/**
 * The echo limit, pinned both ways.
 *
 * The entry used to say the medium delivers one direct path and no echo at all. That stopped
 * being true when `scheduleEchoes` landed in src/uwb/channel.ts, so the sentence now says what
 * the engine does: an echo exists only when the scenario carries a `scatterers` section, and
 * even then `deliver` routes it to `deliverEcho`, which opens no reception. The false phrasing
 * is asserted absent so it cannot come back, and the run is checked so the sentence's claim
 * about *this* scene is measured rather than asserted.
 */
describe('uwb-intro · echoes exist in the medium; this hall has nothing to reflect off', () => {
  const text = uwbIntro.limits.map((l) => l.text).join('\n')

  it('says echoes are gated on the scenario and that they open no reception', () => {
    expect(text).toContain('scheduleEchoes')
    expect(text).toContain('只在场景写了 scatterers 一节时才排回波')
    expect(text).toContain('deliverEcho')
    expect(text).toContain('不开启任何一次接收')
    // the half of the old sentence that is still true, and the reason the limit exists at all
    expect(text).toContain('真实接收端要在一串先后到达的回波里判断哪一条是首径')
  })

  it('no longer claims the medium has no echoes', () => {
    expect(text).not.toContain('没有反射、没有回波、也没有第二条到达路径')
    expect(text).not.toContain('介质只投递一条直射路径')
  })

  it('and both of its scenes carry no scatterers section, so neither produces an echo', () => {
    const scenes = [uwbIntro.scenario, ...(uwbIntro.variants ?? []).map((v) => v.scenario)]
    expect(scenes).toHaveLength(2)
    for (const build of scenes) expect(build().scatterers).toBeUndefined()
    for (const variant of [undefined, 0]) {
      expect(ofType(recs(variant), 'UWB_ECHO')).toHaveLength(0)
    }
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file's own header says it: 「Each assertion quotes the sentence it guards」 — in a
 * comment. The figure beside it is typed here. The sampling sweep of 2026-10-12 planted six of
 * this lesson's figures and every one went unnoticed, 6 of 6, which is what a quotation in a
 * comment cannot do and a parse can.
 *
 * **The reads worth naming:**
 *
 *  - **the units table is one chain of conversions, and it is read as one.** A chip at
 *    499.2 MHz, a tick at 2⁻⁷ of it, a metre at 3.3356 ns and 213.1 ticks, a tick as 4.7 mm of
 *    flight and 2.3 mm of range: every one of those is computed from the one before it and from
 *    the engine's own constants, so a cell that drifts out of the chain fails even if it still
 *    looks plausible.
 *  - **the counter's own width decides two figures.** 「2⁴⁰ 格就是 17.2 秒」 is read as the
 *    modulus times the tick, and the 40 is read against `COUNTER_BITS`.
 *  - **「读数偏大 4.3 格」 is read as the difference of the two figures printed beside it** —
 *    1070 against the truth's 1065.7 — rather than as a figure of its own.
 *  - **the three distances of the range line are three different quantities**, and the lesson
 *    prints all three twice: the corrected reading, the truth, and the raw time-of-flight. Each
 *    is read against its own source, and the pair that must differ is required to differ.
 */
describe('uwb-intro · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const PIC = blockText(uwbIntro.picture)
  const NUMS = blockText(uwbIntro.numbers)
  const DEEP = blockText(uwbIntro.deeper)
  const SRC = blockText(uwbIntro.sources)
  const LIM = blockText(uwbIntro.limits)
  const OBS = blockText(uwbIntro.observe)
  const TRY = blockText(uwbIntro.tryThis)
  const QUIZ = blockText(uwbIntro.quiz)
  const ALL = [PIC, NUMS, DEEP, SRC, LIM, OBS, TRY, QUIZ].join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tableOf = (needle: string): { head: string[]; rows: string[][] } => {
    const b = uwbIntro.numbers!.find((x) => x.kind === 'table'
      && (x as { heading?: string }).heading?.includes(needle))
    expect(b, `no table whose heading contains 「${needle}」`).toBeDefined()
    return b as { head: string[]; rows: string[][] }
  }
  const cellsOf = (needle: string): string[][] => tableOf(needle).rows
  const occ = (text: string, needle: string): number => text.split(needle).length - 1
  const rs = recs()
  const range = ofType(rs, 'UWB_RANGE')[0]!

  it('reads the units table as the chain of conversions it is', () => {
    const rows = cellsOf('单位换算')
    const flat = rows.map((r) => r.join(' · ')).join('\n')
    // The chip rate, and the chip it gives.
    const [mhz] = figs(flat, /([\d.]+) MHz 的一个码片/, 'the chip rate')
    expect(mhz! * 1e6, 'the chip rate the engine runs at').toBe(UWB_CHIP_HZ)
    // 「一个 RCTU = 2⁻⁷ 码片」: the tick as a fraction of a chip.
    const [base] = figs(flat, /一个 RCTU = (\d+)⁻⁷ 码片/, 'the tick’s own definition')
    expect(base, 'a binary fraction of a chip').toBe(2)
    expect(RCTU_NS * base! ** 7, 'and seven halvings of it are one chip').toBeCloseTo(UWB_CHIP_NS, 9)
    // 「3.3356 ns = 213.1 RCTU」: one metre, both ways.
    const [ns, ticks] = figs(flat, /([\d.]+) ns = ([\d.]+) RCTU/, 'one metre in time and in ticks')
    same(String(ns), 1 / C_M_PER_NS, 'one metre of flight, in nanoseconds')
    same(String(ticks), ns! / RCTU_NS, 'and the same metre in counter ticks')
    // 「c = 0.299792458 m/ns」
    const [c] = figs(flat, /c = ([\d.]+) m\/ns/, 'the speed of light')
    expect(c, 'the speed of light the engine uses').toBe(C_M_PER_NS)
    // 「飞行 4.7 mm，测距 2.3 mm」: one tick, as flight and as range.
    const [flightMm, rangeMm] = figs(flat, /飞行 ([\d.]+) mm，测距 ([\d.]+) mm/, 'one tick in millimetres')
    same(String(flightMm), RCTU_NS * C_M_PER_NS * 1000, 'what one tick is worth in flight')
    same(String(rangeMm), (RCTU_NS * C_M_PER_NS * 1000) / 2, 'and in range, which is half of it')
  })

  it('reads the flight table, its own column heading included', () => {
    /*
     * **The grid is in the column heading, not in a cell** — the shape this programme calls the
     * ninth: 「落在 1 ns 网格上」 is the third column's name, and a table read row by row never
     * looks at it.
     */
    const t2 = tableOf('飞行时间')
    const [gridNs] = figs(t2.head[2]!, /落在 (\d+) ns 网格上/, 'the third column’s own heading')
    expect(gridNs, 'the grid the event queue rounds to').toBe(1)
    // Both rows: the distance, its flight time, and the whole nanosecond it lands on.
    for (const row of t2.rows) {
      const [m] = figs(row[0]!, /^(\d+) m$/, `the distance of 「${row[0]}」`)
      const [ns] = figs(row[1]!, /^([\d.]+) ns$/, `the flight time of 「${row[0]}」`)
      const [grid] = figs(row[2]!, /^(\d+) ns$/, `the grid cell of 「${row[0]}」`)
      same(String(ns), m! / C_M_PER_NS, `the flight time of ${m} m`)
      expect(grid, 'which the queue rounds up, never to nearest').toBe(Math.ceil(ns!))
    }
    // …and the two distances really are the two placements this lesson ships.
    const apart = (sc: Scenario): number => {
      const [a, b] = sc.nodes.filter((n) => n.uwb !== undefined)
      return Math.hypot(a!.pos.x - b!.pos.x, a!.pos.y - b!.pos.y)
    }
    expect(t2.rows.map((r) => figs(r[0]!, /^(\d+) m$/, 'a distance cell')[0]),
      'the near placement and the far one')
      .toEqual([Math.round(apart(uwbIntro.scenario())),
        Math.round(apart(uwbIntro.variants![0]!.scenario()))])
  })

  it('reads the tick and the grid, and the factor between them', () => {
    // 「它以 15.650 ps 为一格，比时间线精细 64 倍」 — and the same tick in four more places.
    const [ps, times] = figs(NUMS, /它以 ([\d.]+) ps 为一格，比时间线精细 (\d+) 倍/, '`numbers` on the tick')
    same(String(ps), RCTU_PS, 'the counter’s own tick')
    expect(times, 'how much finer than the timeline’s nanosecond it is').toBe(Math.round(1000 / RCTU_PS))
    // Every printing of a time in picoseconds is one of two quantities, at the precision printed.
    for (const [p] of every(ALL, /([\d.]+) ps/g, 'every printing of a time in picoseconds', 8)) {
      const dp = (p!.split('.')[1] ?? '').length
      expect([RCTU_PS, uwbIntro.scenario().uwb!.tsNoisePs].map((x) => Number(x.toFixed(dp))),
        `「${p} ps」`).toContain(val(p!))
    }
    // The two figures that are the counter's width.
    const [bits, floor] = figs(DEEP, /计数器是 (\d+) 位宽，标准只要求至少 (\d+) 位/, '`deeper` on the width')
    expect(bits, 'the width this engine gives it').toBe(COUNTER_BITS)
    expect(floor, 'and the floor the standard asks for').toBeLessThan(bits!)
    const [modBase, secs] = figs(DEEP, /每格 [\d.]+ ps，(\d+)⁴⁰ 格就是 ([\d.]+) 秒/, '`deeper` on the wrap')
    expect(modBase, 'a binary counter').toBe(2)
    expect(modBase! ** bits!, 'whose modulus the engine computes').toBe(COUNTER_MOD)
    same(String(secs), (COUNTER_MOD * RCTU_PS) / 1e12, 'how long it takes to wrap')
    // `sources` prints the pair again.
    const [srcBits, srcFloor] = figs(SRC, /(\d+) 位计数器是模型取值，标准正文只要求至少 (\d+) 位/,
      '`sources` on the same pair')
    expect([srcBits, srcFloor], 'the same two widths').toEqual([bits, floor])
  })

  it('reads the five figures the sweep of 2026-10-13 walked through', () => {
    /*
     * **Five sites the first pass missed, and four of them are second printings.** The speed of
     * light is in the units table AND in the sentence that walks the reader through the
     * multiplication; the counter's modulus base is in 「2⁴⁰ 格就是 17.2 秒」 AND in 「每一次相减
     * 都是模 2⁴⁰ 的」; and 「只有 1σ 会随信干噪比按 1/√SNR 放大」 carries two of them in one
     * clause. 「Clause 16」 is the fifth, and it is a chapter number with no corpus here — so it
     * is pinned by occurrence, which is this programme's instrument for a citation.
     */
    const [c] = figs(NUMS, /ps × ([\d.]+) m\/ns/, '`numbers` on the speed of light')
    expect(c, 'the speed of light, in the sentence that multiplies by it').toBe(C_M_PER_NS)
    const [modBase] = figs(DEEP, /每一次相减都是模 (\d+)⁴⁰ 的/, '`deeper` on the modulus')
    expect(modBase! ** COUNTER_BITS, 'the modulus every subtraction is taken under')
      .toBe(COUNTER_MOD)
    const [sigma, one] = figs(LIM, /只有 (\d+)σ 会随信干噪比按 (\d+)\/√SNR 放大/,
      '`limits` on how the noise scales')
    expect(sigma, 'one standard deviation').toBe(1)
    expect(one, 'and the numerator of the Cramér-Rao shape').toBe(1)
    expect(occ(ALL, 'Clause 16'), 'the chapter the units come from, cited once').toBe(1)
  })

  it('reads the four-counter subtraction and the error it leaves', () => {
    const f = uwbIntro.numbers!.find((b) => b.kind === 'formula') as { text: string }
    const [half] = figs(f.text, /und − Treply\) \/ (\d+)/, 'the formula’s own divisor')
    expect(half, 'a round trip is two flights').toBe(2)
    // 「两个几千亿量级的数字，差值只有 2140。真值是 1065.7 格：读数偏大 4.3 格」
    const [diff] = figs(NUMS, /差值只有 ([\d,]+)。/, '`numbers` on the difference')
    const [truth] = figs(NUMS, /真值是 ([\d.]+) 格/, '`numbers` on the truth')
    const [over] = figs(NUMS, /读数偏大 ([\d.]+) 格/, '`numbers` on the error')
    const sels = ofType(rs, 'UWB_TS')
    expect(sels.length, 'the round stamps four counters').toBeGreaterThanOrEqual(4)
    expect(diff, 'the difference of the two round-trip counters').toBe(2 * range.tofRawRctu!)
    const trueNs = range.trueDistM / C_M_PER_NS
    same(String(truth), trueNs / RCTU_NS, 'the ticks five metres of flight really is')
    same(String(over), range.tofRawRctu! - trueNs / RCTU_NS, 'how many ticks the reading is over')
    // 「因为两次接收计数各带 100 ps 噪声」
    const [noisePs] = figs(NUMS, /各带 (\d+) ps 噪声/, '`numbers` on the stamp noise')
    expect(noisePs, 'the noise this session quotes its stamps at')
      .toBe(uwbIntro.scenario().uwb!.tsNoisePs)
    // 「raw 就是上面那个 1070」
    const [rawTicks] = figs(NUMS, /raw 就是上面那个 ([\d,]+)/, '`numbers` on the raw ticks')
    expect(rawTicks, 'the ticks the raw figure comes from').toBe(range.tofRawRctu)
  })

  it('reads the three distances of the range line, each against its own source', () => {
    const fmt = fmtRecord(range)
    // The value block prints the line itself: 「4.95 m (true 5.00 m, raw 5.02 m)」
    const [got, truth, rawM] = figs(NUMS, /: ([\d.]+) m \(true ([\d.]+) m, raw ([\d.]+) m\)/,
      '`numbers` on the range line')
    same(String(got), range.distM, 'the corrected reading')
    same(String(truth), range.trueDistM, 'the truth')
    same(String(rawM), rctuToMetres(range.tofRawRctu!), 'and the raw time-of-flight in metres')
    expect(fmt, 'and the line the engine prints carries all three').toContain(`${got} m`)
    expect(got, 'the corrected reading is not the raw one').not.toBe(rawM)
    // `observe` prints the same three, and the noise behind the gap.
    const [oGot, oTruth, oRaw] = figs(OBS, /报出 ([\d.]+) m，真值 ([\d.]+) m[^]*?raw 的 ([\d.]+) m/,
      '`observe` on the same three')
    expect([oGot, oTruth, oRaw], 'the same three figures').toEqual([got, truth, rawM])
    same(raw(OBS, /噪声标准差就是 ([\d.]+) cm/, '`observe` on the noise')[0]!, 100 * SIGMA_R,
      'one standard deviation of a single reading')
    // 「本来无事可修，可答案还是挪动了 7 cm」
    const [movedCm] = figs(NUMS, /答案还是挪动了 (\d+) cm/, '`numbers` on what the correction moves')
    expect(movedCm, 'the correction’s own residual, in centimetres')
      .toBe(Math.round(100 * Math.abs(rctuToMetres(range.tofRawRctu!) - range.distM)))
    // 「找到 2 187 389 ns 处的 UWB_RANGE」
    const [atNs] = figs(OBS, /找到 ([\d ]+) ns 处的 UWB_RANGE/, '`observe` on when the line appears')
    expect(atNs, 'when the round reports').toBe(range.t)
  })

  it('reads the flight time, both placements, and the arrival gaps', () => {
    const gap = (variant?: number): number => {
      const r = recs(variant)
      const tx = ofType(r, 'TX_START')[0]!
      const rx = ofType(r, 'RX_START').find((x) => x.t >= tx.t)!
      return rx.t - tx.t
    }
    // 「TX_START 在 0 ns，锚点泳道上的 RX_START 在 17 ns」
    const [at, arrive] = figs(OBS, /TX_START 在 (\d+) ns，锚点泳道上的 RX_START 在 (\d+) ns/,
      '`observe` on the first two records')
    expect(at, 'when the first frame goes out').toBe(ofType(rs, 'TX_START')[0]!.t)
    expect(arrive, 'and when it arrives').toBe(gap())
    // 「到达间隔从 17 ns 变成 67 ns——距离四倍，飞行时间也四倍」
    const [near, far] = figs(TRY, /到达间隔从 (\d+) ns 变成 (\d+) ns/, '`tryThis` on the two gaps')
    expect(near, 'the gap at five metres').toBe(gap())
    expect(far, 'and at twenty').toBe(gap(0))
    expect(Math.round(far! / near!), 'four times the distance, four times the delay').toBe(4)
    // 「测距行报出 19.95 m，真值 20.00 m」
    const farRange = ofType(recs(0), 'UWB_RANGE')[0]!
    const [farGot, farTruth] = figs(TRY, /测距行报出 ([\d.]+) m，真值 ([\d.]+) m/, '`tryThis` on the far range')
    same(String(farGot), farRange.distM, 'what the far round reports')
    same(String(farTruth), farRange.trueDistM, 'and its truth')
    // The variant's own label, and the 2 ms slot the picture and `sources` both name.
    const [labelM] = figs(uwbIntro.variants![0]!.label, /相距 (\d+) m/, 'the variant’s label')
    expect(labelM, 'the distance that variant sets').toBe(Math.round(farRange.trueDistM))
    const [tryM] = figs(TRY, /载入 (\d+) m 变体/, '`tryThis` on which variant to load')
    expect(tryM, 'the same variant, named in the experiment').toBe(labelM)
  })

  it('reads the slot, the block and the four model values `sources` invites argument with', () => {
    const round = ofType(rs, 'UWB_ROUND')[0]!
    // 「2 ms 的测距时隙和 200 ms 的测距块」 — and the slot again in `picture` and in `numbers`.
    const [slotMs, blockMs] = figs(SRC, /(\d+) ms 的测距时隙和 (\d+) ms 的测距块/, '`sources` on the two')
    expect(slotMs! * MS, 'the slot the round runs on').toBe(round.slotNs)
    expect(blockMs! * MS, 'and the block it sits in')
      .toBe((uwbIntro.scenario().uwb!.blockRstu * RSTU_NS))
    for (const [ms] of every([PIC, NUMS].join('\n'), /(\d+) ms (?:的等待|后，锚点)/g,
      'the slot, named twice more', 2)) {
      expect(val(ms!) * MS, 'the wait between the two frames').toBe(round.slotNs)
    }
    // 「−14 dBm 发射功率、−93 dBm 接收灵敏度、每个接收时间戳上 100 ps 的 1σ 噪声、……0.2 ppm」
    const [tx, sens, ps, sigma, ppm] = figs(SRC,
      /−(\d+) dBm 发射功率、−(\d+) dBm 接收灵敏度、每个接收时间戳上 (\d+) ps 的 (\d+)σ 噪声、时钟偏差估计中残留的 ([\d.]+) ppm/,
      '`sources` on the four model values')
    expect(-tx!, 'the transmit power').toBe(UWB_TX_POWER_DBM)
    expect(-sens!, 'the receive sensitivity').toBe(UWB_RX_SENS_DBM)
    expect(ps, 'the timestamp noise').toBe(uwbIntro.scenario().uwb!.tsNoisePs)
    expect(sigma, 'quoted as one standard deviation').toBe(1)
    expect(ppm, 'and the clock-offset residual').toBe(uwbIntro.scenario().uwb!.cfoNoisePpm)
    // `limits`: the same noise, the same sigma, and the crystals this lesson pins.
    const [limPs] = figs(LIM, /那 (\d+) ps 是模型取值/, '`limits` on the noise')
    expect(limPs, 'the same figure').toBe(ps)
    const [pinned] = figs(LIM, /把两端的晶振都钉在 (\d+) ppm/, '`limits` on the crystals')
    expect(new Set(uwbIntro.scenario().nodes.map((n) => n.uwb?.ppm ?? 0)),
      'both crystals, as the scene sets them').toEqual(new Set([pinned]))
    // 「传播时延不过几十纳秒，而时隙是 9 µs」
    const [slotUs] = figs(DEEP, /而时隙是 (\d+) µs/, '`deeper` on the Wi-Fi slot')
    expect(slotUs! * US, 'the Wi-Fi contention slot it is compared with').toBe(SLOT_NS)
  })

  it('reads the quiz, which is the units table asked as four questions', () => {
    // 「一个码片，2.003 ns，约 60 cm」
    const [chipNs, chipCm] = figs(QUIZ, /一个码片，([\d.]+) ns，约 (\d+) cm/, 'the quiz on the chip')
    same(String(chipNs), UWB_CHIP_NS, 'one chip, in nanoseconds')
    expect(chipCm, 'and in centimetres of flight, as the option rounds it')
      .toBe(Math.round(10 * UWB_CHIP_NS * C_M_PER_NS) * 10)
    // 「码片的 2⁻⁷，15.650 ps，约 4.7 mm 的飞行距离」
    const [base, ps, mm] = figs(QUIZ, /码片的 (\d+)⁻⁷，([\d.]+) ps，约 ([\d.]+) mm/, 'the quiz on the tick')
    expect(base, 'a binary fraction').toBe(2)
    same(String(ps), RCTU_PS, 'the tick')
    same(String(mm), RCTU_NS * C_M_PER_NS * 1000, 'and its flight')
    // 「一纳秒，也就是时间线的网格，约 30 cm」
    const [gridCm] = figs(QUIZ, /也就是时间线的网格，约 (\d+) cm/, 'the quiz on the grid')
    expect(gridCm, 'a nanosecond of flight, as the option rounds it')
      .toBe(Math.round(100 * C_M_PER_NS / 10) * 10)
    // 「计数器比 499.2 MHz 的码片速率再细 128 倍；一米是 213.1 格」
    const [mhz, finer, perM] = figs(QUIZ, /比 ([\d.]+) MHz 的码片速率再细 (\d+) 倍；一米是 ([\d.]+) 格/,
      'the quiz on the counter')
    expect(mhz! * 1e6, 'the chip rate').toBe(UWB_CHIP_HZ)
    expect(finer, 'how much finer the counter is').toBe(Math.round(UWB_CHIP_NS / RCTU_NS))
    same(String(perM), 1 / C_M_PER_NS / RCTU_NS, 'and one metre in ticks')
  })
})
