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
import { uwbIntro, uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { SLOT_NS } from '../../src/engine/phy'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isMigrated, type L10n } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonBlocks, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import {
  COUNTER_BITS, COUNTER_MOD, C_M_PER_NS, RCTU_NS, RCTU_PS, RSTU_NS, UWB_CHIP_HZ, UWB_CHIP_NS,
  UWB_PPM_MAX, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
} from '../../src/uwb/phy'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
/** 1-σ of one SS-TWR range at the session's 100 ps timestamp noise: 21.2 mm. */
const SIGMA_R = rangeSigmaM(100)
/** 1-σ of the corrected SS-TWR reading's clock-correction residual: ½·Treply·σ_cfo, 6.0 cm at a 2 ms reply. */
const CFO_RESIDUAL_M = ((2 * MS * 0.2e-6) / 2) * C_M_PER_NS

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? uwbIntro.scenario() : uwbIntro.variants![variant].scenario()
    memo.set(key, [...new Simulation(s).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

describe('uwb-intro · lesson shape', () => {
  it('is written to the zero-to-hero contract', () => {
    expect(isMigrated(uwbIntro)).toBe(true)
    // the first lesson of the UWB track: at most four new words, and no table in the picture
    expect(uwbIntro.terms!.map((t) => t.term)).toEqual(['UWB', 'anchor', 'RMARKER', 'RCTU'])
    expect(uwbIntro.picture!.some((b) => b.kind === 'table')).toBe(false)
    // the reader is sent to the simulator before the mechanism is finished
    const firstWatch = uwbIntro.picture!.findIndex((b) => b.kind === 'watch')
    expect(firstWatch).toBeGreaterThanOrEqual(0)
    expect(firstWatch).toBeLessThan(3)
    // it assumes Wi-Fi Tier 1 and nothing else
    expect(uwbIntro.needs).toEqual(['radio-primer', 'frame-anatomy'])
  })

  it('the scenario and the variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbIntro.scenario())).not.toThrow()
    for (const v of uwbIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays under 20 minutes', () => {
    const raw = lessonWords(uwbIntro) / 150
      + OBSERVE_MINUTES * uwbIntro.observe.length + TRY_MINUTES * uwbIntro.tryThis.length
    expect(lessonMinutes(uwbIntro)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbIntro)).toBeLessThanOrEqual(20)
    // the module the lesson opens: UWB Tier 1, "Time of flight"
    expect(uwbIntro.module).toBe(11)
  })

  it('fits one sitting: 900–1300 words on the main path', () => {
    expect(lessonWords(uwbIntro)).toBeGreaterThanOrEqual(900)
    expect(lessonWords(uwbIntro)).toBeLessThanOrEqual(1300)
    // what the reader reads before the simulator: why, outcomes, terms, picture, numbers.
    // The split budgeted 600–900 for this lesson; observe, tryThis and quiz add the rest.
    const prose = lessonWords({ ...uwbIntro, observe: [], tryThis: [], quiz: [] })
    expect(prose).toBeGreaterThanOrEqual(600)
    expect(prose).toBeLessThanOrEqual(1000)
    expect(lessonBlocks(uwbIntro).length).toBe(uwbIntro.picture!.length + uwbIntro.numbers!.length)
  })

  it('every jump target occurs in the base run', () => {
    const rs = recs()
    for (const j of uwbIntro.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
    for (const b of uwbIntro.picture!) {
      if (b.kind === 'watch' && b.jump !== undefined) expect(uwbIntro.jumps[b.jump]).toBeDefined()
    }
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
    // "five metres apart on a line" / the variant labelled "20 m apart"
    const sep = (s: Scenario): number => {
      const [a, t] = s.nodes
      return Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y, t.pos.z - a.pos.z)
    }
    expect(sep(uwbIntroScenario(5))).toBe(5)
    expect(sep(uwbIntroScenario(20))).toBe(20)
    expect(uwbIntro.variants![0].label.en).toBe('20 m apart')
    expect(sep(uwbIntro.scenario())).toBe(5)
    expect(sep(uwbIntro.variants![0].scenario())).toBe(20)
  })

  it('every string a learner reads exists in both languages', () => {
    // A cell of numbers, log lines or protocol names reads the same in both (N());
    // anything holding two consecutive English words is prose and must be translated.
    const seen: L10n[] = []
    const isL10n = (o: Record<string, unknown>): o is Record<string, unknown> & L10n =>
      typeof o.en === 'string' && typeof o.zh === 'string'
    const walk = (x: unknown): void => {
      if (x == null || typeof x === 'function') return
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isL10n(o)) { seen.push(o); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
    walk({
      title: uwbIntro.title, why: uwbIntro.why, outcomes: uwbIntro.outcomes, terms: uwbIntro.terms,
      picture: uwbIntro.picture, numbers: uwbIntro.numbers, deeper: uwbIntro.deeper, sources: uwbIntro.sources,
      observe: uwbIntro.observe, tryThis: uwbIntro.tryThis, quiz: uwbIntro.quiz,
      variants: uwbIntro.variants, jumps: uwbIntro.jumps,
    })
    expect(seen.length).toBeGreaterThan(50)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })
})

describe('uwb-intro · the units', () => {
  it('the chip is 2.003 ns at 499.2 MHz and the counter unit 15.650 ps', () => {
    // the "Units" table: "One chip at 499.2 MHz | 2.003 ns" and "One RCTU (2⁻⁷ of a chip) | 15.650 ps",
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
    // "The timeline is drawn on a 1 ns grid; the ranging underneath runs 64 times finer."
    expect(Math.round(1 / RCTU_NS)).toBe(64)
  })

  it('one metre is 3.3356 ns and 213.1 ticks, so a tick is 4.7 mm of flight and 2.3 mm of range', () => {
    // the "Units" table: "One metre of flight | 3.3356 ns = 213.1 RCTU | c = 0.299792458 m/ns" and
    // "One RCTU of timing error | 4.7 mm of flight, 2.3 mm of range"
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
    // "Going deeper": "the standard allows ±20 ppm. At 20 ppm of relative offset the anchor’s 2 ms
    //  reply is mismeasured by 40 ns, half of which lands straight on the range — 20 ns, six metres"
    expect(UWB_PPM_MAX).toBe(20)
    const errNs = 2 * MS * 20e-6
    expect(errNs).toBe(40)
    expect((errNs / 2) * C_M_PER_NS).toBeCloseTo(6, 1)
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
    // "TX_START on the phone’s lane is at 0 ns and RX_START on the anchor’s is at 17 ns — five metres
    //  of air" / "Why does the timeline show 17 ns of flight and not 16.68?"
    const rs = recs()
    expect(ofType(rs, 'TX_START')[0].t).toBe(0)
    expect(gaps(rs)).toEqual([17, 17])
  })

  it('twenty metres is 67 ns — four times the distance, four times the delay', () => {
    // "The arrival gap grows from 17 ns to 67 ns: four times the distance is four times the flight,
    //  16.678 ns becoming 66.713 ns, each rounded up onto the grid."
    expect(gaps(recs(0))).toEqual([67, 67])
    expect((20 / C_M_PER_NS).toFixed(3)).toBe('66.713')
    expect((4 * (5 / C_M_PER_NS)).toFixed(3)).toBe('66.713')
  })

  it('the engine rounds the flight UP, never to nearest — measured where the two differ', () => {
    // "Five metres at the speed of light is 16.678 ns, and the event queue counts whole nanoseconds.
    //  An arrival is scheduled at the next whole nanosecond up — rounded up, never to nearest, so no
    //  frame is ever delivered a hair earlier than physics allows."
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
    // "The truth is 16.678 ns, or 1065.7 ticks: the reading is 4.3 ticks long because each receive
    //  counter carries 100 ps of noise and ticks are integers."
    const trueRctu = 5 / C_M_PER_NS / RCTU_NS
    expect(trueRctu.toFixed(1)).toBe('1065.7')
    expect((1070 - trueRctu).toFixed(1)).toBe('4.3')
  })

  it('the anchor’s reply is 2 ms − Tprop and the phone’s round trip 2 ms + Tprop', () => {
    // "Here the anchor answers in the next ranging slot, so Treply is 2 ms − Tprop and Tround is
    //  2 ms + Tprop: the reply dwarfs the flight by five orders of magnitude"
    const [t1, t2, t3, t4] = ts.map((r) => r.counter)
    const flightNs = 5 / C_M_PER_NS
    expect(counterDiff(t3, t2) * RCTU_NS).toBeCloseTo(2 * MS - flightNs, 0)
    expect(counterDiff(t4, t1) * RCTU_NS).toBeCloseTo(2 * MS + flightNs, 0)
    expect(Math.round(Math.log10((2 * MS) / flightNs))).toBe(5)
  })
})

describe('uwb-intro · the range the log reports', () => {
  it('the range line reads 4.95 m against a true 5.00 m, with raw 5.02 m beside it', () => {
    // "The log’s range line reads “tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)”." /
    // "Find the UWB_RANGE line at 2 187 389 ns."
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
    // "it still moves the answer by 7 cm, because the estimator itself is noisy to 0.2 ppm, and
    //  0.2 ppm of a 2 ms reply is 0.4 ns" / the observation "a few centimetres out, against 2.1 cm
    //  of range-noise sigma" — a figure uwb-position quotes back as "Lesson 1’s 2.1 cm of σ_r".
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
