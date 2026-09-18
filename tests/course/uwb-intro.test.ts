/**
 * Every empirical claim in the "Timestamps, not throughput" lesson, measured
 * against the lesson's own scenario and its 20 m variant. Each assertion quotes
 * the sentence it guards; standard constants are checked against the engine's
 * exports (src/uwb/phy.ts, src/uwb/ranging.ts, src/uwb/clock.ts) rather than
 * re-typed.
 */
import { describe, it, expect } from 'vitest'
import { uwbIntro, uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { L10n } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import {
  COUNTER_BITS, COUNTER_MOD, C_M_PER_NS, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, RCTU_NS, RCTU_PS,
  RSTU_NS, SFD_SYMBOLS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS, UWB_CHIP_HZ, UWB_CHIP_NS,
  UWB_PPM_MAX, UWB_RMARKER_CHIPS, chipsToNs, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from '../../src/uwb/phy'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
/** 1-σ of one SS-TWR range at the session's 100 ps timestamp noise: 42.4 mm. */
const SIGMA_R = rangeSigmaM(100)

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
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)

describe('uwb-intro · lesson shape', () => {
  it('the scenario and the variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbIntro.scenario())).not.toThrow()
    for (const v of uwbIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbIntro) / 150
      + OBSERVE_MINUTES * uwbIntro.observe.length + TRY_MINUTES * uwbIntro.tryThis.length
    expect(lessonMinutes(uwbIntro)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbIntro)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbIntro)).toBeLessThanOrEqual(25)
    // the module the lesson opens: UWB Tier 1, "Time of flight"
    expect(uwbIntro.module).toBe(11)
  })

  it('every jump target occurs in the base run', () => {
    const rs = recs()
    for (const j of uwbIntro.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
  })

  it('the scene is one anchor and one phone, both crystals pinned to 0 ppm', () => {
    // "One anchor and one phone, five metres apart" / "Both crystals are pinned to 0 ppm in this
    //  scenario, which no real pair of devices ever is"
    for (const s of [uwbIntro.scenario(), uwbIntro.variants![0].scenario()]) {
      expect(s.nodes.map((n) => n.kind)).toEqual(['uwb', 'uwb'])
      expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'tag'])
      expect(s.nodes.map((n) => n.uwb!.ppm)).toEqual([0, 0])
      // no AP, no stations, no Wi-Fi traffic at all
      expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
      expect(s.servers).toEqual([])
      // "single-sided two-way ranging" with nothing in the way
      expect(s.uwb).toMatchObject({ method: 'ss', nlos: false, slotRstu: 2400, blockRstu: 240_000, tsNoisePs: 100, cfoNoisePpm: 0.2 })
    }
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
    const walk = (x: unknown): void => {
      if (x == null || typeof x === 'function') return
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (typeof o.en === 'string' && typeof o.zh === 'string') { seen.push(o as unknown as L10n); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
    walk({ title: uwbIntro.title, body: uwbIntro.body, observe: uwbIntro.observe, tryThis: uwbIntro.tryThis, quiz: uwbIntro.quiz, variants: uwbIntro.variants, jumps: uwbIntro.jumps })
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
    // "sends its pulses at 499.2 MHz, so one chip lasts 2.003 ns. The ranging counter runs 128 times
    //  finer: one ranging counter time unit (RCTU) is 2⁻⁷ of a chip, 15.650 ps."
    expect(UWB_CHIP_HZ).toBe(499.2e6)
    expect(UWB_CHIP_NS.toFixed(3)).toBe('2.003')
    expect(RCTU_NS).toBe(UWB_CHIP_NS / 2 ** 7)
    expect(RCTU_PS.toFixed(3)).toBe('15.650')
    // the quiz: "The counter runs 128 times finer than the 499.2 MHz chip rate."
    expect(UWB_CHIP_NS / RCTU_NS).toBe(128)
    // the FiRa slot the lesson names: 2400 RSTU is 2 ms
    expect(RSTU_NS.toFixed(3)).toBe('833.333')
    expect(Math.round(2400 * RSTU_NS)).toBe(2 * MS)
  })

  it('one metre is 3.3356 ns and 213.1 ticks, so a tick is 4.7 mm of flight and 2.3 mm of range', () => {
    // "Light covers one metre in 3.3356 ns, which is 213.1 RCTU, so one tick of the counter is 4.7 mm
    //  of flight — and because two-way ranging halves a round trip, one tick of timing error is 2.3 mm
    //  of distance error."
    const nsPerMetre = 1 / C_M_PER_NS
    expect(nsPerMetre.toFixed(4)).toBe('3.3356')
    expect((nsPerMetre / RCTU_NS).toFixed(1)).toBe('213.1')
    expect((rctuToMetres(1) * 1000).toFixed(1)).toBe('4.7')
    expect(((rctuToMetres(1) / 2) * 1000).toFixed(1)).toBe('2.3')
  })

  it('the 40-bit counter wraps after 17.2 seconds', () => {
    // "The counter is 40 bits wide in this model; the standard asks only for 32 or more. At 15.650 ps a
    //  tick, 2⁴⁰ ticks is 17.2 seconds, and then it wraps to zero."
    expect(COUNTER_BITS).toBe(40)
    expect(COUNTER_MOD).toBe(2 ** 40)
    expect(((COUNTER_MOD * RCTU_NS) / 1e9).toFixed(1)).toBe('17.2')
    // "every subtraction below is modulo 2⁴⁰"
    expect(counterDiff(5, COUNTER_MOD - 5)).toBe(10)
  })

  it('the standard allows ±20 ppm, which costs six metres on a 2 ms reply', () => {
    // "the standard allows ±20 ppm (§16.4.9). At 20 ppm of relative offset, the anchor’s 2 ms reply is
    //  mismeasured by 40 ns, half of which lands straight on the range — 20 ns, six metres"
    expect(UWB_PPM_MAX).toBe(20)
    const errNs = 2 * MS * 20e-6
    expect(errNs).toBe(40)
    expect((errNs / 2) * C_M_PER_NS).toBeCloseTo(6, 1)
  })
})

describe('uwb-intro · what 197.628 µs is made of', () => {
  const poll = txs(recs(), 'uwbPoll')[0]
  const layout = uwbPpduLayout(poll.frame)
  const durOf = (key: string, nth = 0): number => layout.filter((s) => s.key === key)[nth].durNs

  it('the poll is 30 octets and 197.628 µs, exactly the PPDU the engine builds', () => {
    // the table's "PSDU, 30 octets" row and its "The whole poll … 197.628 µs" row
    expect(uwbPollBytes(1)).toBe(30)
    expect(poll.frame.bytes).toBe(30)
    expect(uwbPpduNs(30)).toBe(197_628)
    expect(poll.frame.txTimeNs).toBe(197_628)
    expect((197_628 / US).toFixed(3)).toBe('197.628')
  })

  it('every field duration in the table is chipsToNs of its chip count', () => {
    // the "Duration" column: SYNC 65.128, SFD 8.141, STS gap 1.026, STS 65.641, PHR 19.487, PSDU 37.179
    expect(durOf('sync')).toBe(chipsToNs(SYNC_SYMBOLS * PSYM_CHIPS))
    expect(durOf('sync')).toBe(65_128)
    expect(durOf('sfd')).toBe(chipsToNs(SFD_SYMBOLS * PSYM_CHIPS))
    expect(durOf('sfd')).toBe(8_141)
    expect(durOf('stsGap')).toBe(chipsToNs(STS_GAP_CHIPS))
    expect(durOf('stsGap')).toBe(1_026)
    expect(durOf('stsGap', 1)).toBe(1_026)
    expect(durOf('sts')).toBe(chipsToNs(STS_ACTIVE_CHIPS))
    expect(durOf('sts')).toBe(65_641)
    expect(durOf('phr')).toBe(chipsToNs(PHR_SYMBOLS * PHR_SYMBOL_CHIPS))
    expect(durOf('phr')).toBe(19_487)
    expect(durOf('psdu')).toBe(37_179)
    expect(layout.reduce((s, x) => s + x.durNs, 0)).toBe(197_628)
  })

  it('160.449 µs of the poll is structure and only 37.179 µs is the message', () => {
    // "160.449 µs of it is structure; only 37.179 µs is the message"
    const structure = layout.filter((s) => s.key !== 'psdu').reduce((s, x) => s + x.durNs, 0)
    expect(structure).toBe(160_449)
    expect(structure + 37_179).toBe(197_628)
  })

  it('the RMARKER is the first chip after the SFD, 73.269 µs in', () => {
    // "The RMARKER is the first chip after the SFD (§10.29.1.1), 65.128 + 8.141 = 73.269 µs into the
    //  PPDU." — and the quiz option "the first chip after the SFD — 73.269 µs into the frame"
    expect(UWB_RMARKER_CHIPS).toBe((SYNC_SYMBOLS + SFD_SYMBOLS) * PSYM_CHIPS)
    expect(chipsToNs(UWB_RMARKER_CHIPS)).toBe(73_269)
    expect(65_128 + 8_141).toBe(73_269)
    expect(layout.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs).toBe(73_269)
  })

  it('the response is 20 octets and 187.372 µs, differing from the poll only in its PSDU', () => {
    // "The 20-octet response is built the same way and differs only in its PSDU: 26.923 µs of payload,
    //  187.372 µs in all, with its RMARKER at the very same 73.269 µs offset."
    const resp = txs(recs(), 'uwbResp')[0]
    expect(uwbRespBytes('ss')).toBe(20)
    expect(resp.frame.bytes).toBe(20)
    expect(resp.frame.txTimeNs).toBe(187_372)
    const rl = uwbPpduLayout(resp.frame)
    expect(rl.find((s) => s.key === 'psdu')!.durNs).toBe(26_923)
    expect(rl.filter((s) => s.key !== 'psdu').map((s) => s.durNs))
      .toEqual(layout.filter((s) => s.key !== 'psdu').map((s) => s.durNs))
    expect(rl.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs).toBe(73_269)
    // "Of those 4 ms, 385 µs carries a frame and the rest is schedule."
    expect(Math.round((197_628 + 187_372) / US)).toBe(385)
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
    //  of air" / "Jump to the poll’s TX_START at 0 ns, then look at the anchor’s lane: RX_START at 17 ns."
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

  it('17 ns is the 16.678 ns flight rounded UP onto the 1 ns event grid', () => {
    // "Five metres at c is 16.678 ns, and the event queue counts whole nanoseconds. The arrival is
    //  scheduled at the next whole nanosecond up — rounded up, never to nearest, so no frame is ever
    //  delivered a hair earlier than physics allows" — ceil is what the engine does.
    const flightNs = 5 / C_M_PER_NS
    expect(flightNs.toFixed(3)).toBe('16.678')
    expect(Math.ceil(flightNs)).toBe(17)
    expect(Math.ceil(20 / C_M_PER_NS)).toBe(67)
  })

  it('the round is two 2 ms slots and the response leaves at exactly 2 000 000 ns', () => {
    // "the round is two slots of 2 ms, the poll in slot 0 and the response in slot 1, which starts at
    //  exactly 2 000 000 ns" / "the anchor answers in the next ranging slot"
    const rs = recs()
    const round = ofType(rs, 'UWB_ROUND')
    expect(round).toHaveLength(1)
    expect(round[0].t).toBe(0)
    expect(round[0].node).toBe('tag-1')
    expect(round[0].method).toBe('ss')
    expect(round[0].slots).toBe(2)
    expect(round[0].slotNs).toBe(2 * MS)
    expect(ofType(rs, 'UWB_SLOT').map((r) => r.t)).toEqual([0, 2 * MS])
    expect(txs(rs, 'uwbResp')[0].t).toBe(2 * MS)
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
    //  = 5.02 m" — the try-this experiment asks the learner to do exactly this.
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
    // "The truth is 16.678 ns, or 1065.7 ticks: the reading is 4.3 ticks long because each of the two
    //  receive counters carries 100 ps of noise, and the ticks themselves are integers."
    const trueRctu = 5 / C_M_PER_NS / RCTU_NS
    expect(trueRctu.toFixed(1)).toBe('1065.7')
    expect((1070 - trueRctu).toFixed(1)).toBe('4.3')
  })

  it('the anchor’s reply is 2 ms − Tprop and the tag’s round trip 2 ms + Tprop', () => {
    // "In this lab the anchor answers in the next ranging slot, so Treply is 2 ms − Tprop and Tround is
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
    // "a few centimetres out, from timestamp noise and a clock correction that had nothing to correct"
    // — raw and corrected differ even at 0 ppm, so neither is pinned to equality.
    const r = ofType(recs(), 'UWB_RANGE')[0]
    expect(SIGMA_R.toFixed(3)).toBe('0.042')
    expect(Math.abs(rctuToMetres(r.tofRctu) - 5)).toBeLessThan(3 * SIGMA_R)
    expect(Math.abs(rctuToMetres(r.tofRawRctu!) - 5)).toBeLessThan(3 * SIGMA_R)
    expect(rctuToMetres(r.tofRctu)).toBeCloseTo(r.distM, 9)
  })

  it('the correction moves a perfect-crystal answer by 7 cm, the 0.2 ppm the estimator cannot see past', () => {
    // "it moves the answer by 7 cm, because the estimator itself is noisy to 0.2 ppm, and 0.2 ppm of a
    //  2 ms reply is 0.4 ns" / "Both errors are small: the raw reading is 2 cm long, the corrected one
    //  5 cm short, against 4.2 cm of range-noise sigma"
    const r = ofType(recs(), 'UWB_RANGE')[0]
    const raw = rctuToMetres(r.tofRawRctu!)
    const corrected = rctuToMetres(r.tofRctu)
    expect(Math.round((raw - corrected) * 100)).toBe(7)
    expect(Math.round((raw - 5) * 100)).toBe(2)
    expect(Math.round((corrected - 5) * 100)).toBe(-5)
    expect((SIGMA_R * 100).toFixed(1)).toBe('4.2')
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
    expect(Math.abs(r.distM - 20)).toBeLessThan(3 * SIGMA_R)
    expect(Math.abs(rctuToMetres(r.tofRawRctu!) - 20)).toBeLessThan(3 * SIGMA_R)
  })
})
