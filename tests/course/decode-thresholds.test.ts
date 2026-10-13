/**
 * Every empirical claim in "When does a frame decode", measured against the
 * scene it shares with radio-primer and noise-floor — one walk through the
 * flat, one run, one set of recorded hashes.
 *
 * Re-paced on 2026-09-25 (batch A). The lesson is the decode test alone now, so
 * two groups of pins left this file with the prose they guard:
 *
 *  - the ladder, the modulation names, the `mcsLadder` widget, the five-step
 *    rate-picking procedure, the worked living-room column, the four-position
 *    table and the slider experiment → `mcs-ladder.test.ts`;
 *  - the −82/−62 dBm pair, the twenty decibels and the hand-built `Channel`
 *    that proves a missed preamble leaves CCA idle → `cca` (M4, batch 3).
 *
 * The CCA constants are still asserted here, because the three-questions table
 * still prints them; what left is the mechanism and its quiz. The two
 * wide-channel runs came the other way, out of `deeper` and into `tryThis`, and
 * they are now the lesson's proof that the threshold is hard.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { decodeThresholds } from '../../src/course/tier1/decode-thresholds'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { radioPrimer } from '../../src/course/tier1/radio-primer'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import { linkBudget, mcsLadder } from '../../src/course/widgetModel'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import {
  CCA_ED_DBM, CCA_PD_DBM, PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { selBinWidthMhz } from '../../src/engine/selectivity'
import { selectivity } from '../../src/course/tier2/selectivity'

const MS = 1_000_000
/** The same run length radio-primer uses, so the four M1 lessons share the memo. */
const RUN_NS = 100 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string): Tx[] =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)
const variantRecs = (i: number): TLRecord[] => runOf(decodeThresholds, i, RUN_NS)
const runSc = (s: Scenario, ns: number): TLRecord[] => [...new Simulation(s).runUntil(ns).records]

function withWidth(s: Scenario, w: 20 | 40 | 80 | 160): Scenario {
  for (const n of s.nodes) n.caps.widthMhz = w
  return s
}

lessonShapeSuite(decodeThresholds, { runNs: RUN_NS })

describe('decode-thresholds · the third lesson of the Wi-Fi track', () => {
  it('sits in M1, follows radio-primer, and owns the three words the decode test needs', () => {
    expect(MODULES[decodeThresholds.module].title).toBe('信号与链路')
    expect(COURSE_ORDER.indexOf('radio-primer')).toBeLessThan(COURSE_ORDER.indexOf('decode-thresholds'))
    // `noise-floor` is not registered yet — `lessons.ts` and COURSE_ORDER are the
    // controller's — so `needs` still names the lesson it can name. Once the batch lands
    // it becomes ['radio-primer', 'noise-floor']: this lesson subtracts a floor.
    // noise-floor joined when M1 split: this lesson's required-ratio arithmetic
    // starts from the noise floor that lesson owns.
    expect(decodeThresholds.needs).toEqual(['radio-primer', 'noise-floor'])
    // OFDM went to `mcs-ladder` with the rungs; MCS stays, because the decode test is
    // stated against the requirement of the rung the frame was sent at.
    expect(decodeThresholds.terms!.map((t) => t.term)).toEqual(['MCS', 'sensitivity', 'rate margin'])
  })

  it('loads radio-primer’s own scene, variant for variant', () => {
    // "It loads exactly the scene radio-primer loads": the M1 lessons are one walk through
    // the flat, so nothing new is simulated and nothing new is recorded.
    expect(decodeThresholds.scenario()).toEqual(radioPrimer.scenario())
    expect(decodeThresholds.variants!.map((v) => v.scenario()))
      .toEqual(radioPrimer.variants!.map((v) => v.scenario()))
    expect(() => ScenarioSchema.parse(decodeThresholds.scenario())).not.toThrow()
    for (const v of decodeThresholds.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })
})

describe('decode-thresholds · the three questions', () => {
  it('the table’s conditions are the engine’s own constants', () => {
    // the rows "RSSI ≥ −82 dBm and SINR ≥ 4 dB as the preamble arrives" and "total power on
    //  the air ≥ −62 dBm". The mechanism behind the pair — and the twenty decibels between
    //  them — is `cca`'s, on backoff's scene, where a station is seen freezing.
    expect(CCA_PD_DBM).toBe(-82)
    expect(CCA_ED_DBM).toBe(-62)
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    expect(RATE_MARGIN_DB).toBe(3)
  })

  it('the third row is the rule this lesson is about, and it is the only one with a procedure', () => {
    // "the first two together are the clear channel assessment … this lesson is about the
    //  third one only": one steps block, three steps, and it is the decode test end to end.
    const steps = [...decodeThresholds.picture!, ...decodeThresholds.numbers!]
      .filter((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')
    expect(steps).toHaveLength(1)
    expect(steps[0].items).toHaveLength(3)
  })
})

describe('decode-thresholds · where the requirement comes from', () => {
  it('a required SINR is its sensitivity with the assumed noise taken back out', () => {
    // "required SINR = sensitivity − kTB(20 MHz) − 10 dB = sensitivity + 90.99 dB", and the
    //  note "MCS 0's sensitivity is −82 dBm, so it needs 8.99 dB".
    const rows = mcsLadder('eht')
    for (const r of rows) expect(r.reqSinrDb).toBeCloseTo(r.sensDbm - (-174 + 10 * Math.log10(20e6)) - 10, 9)
    expect((rows[0].reqSinrDb - rows[0].sensDbm).toFixed(2)).toBe('90.99')
    expect(rows[0].sensDbm).toBe(-82)
    expect(rows[0].reqSinrDb.toFixed(2)).toBe('8.99')
  })

  it('step by step at the living-room laptop: −74 dBm, 16.99 dB required, 21.66 dB given', () => {
    // steps 1–3, and the "which side the 3 dB is on" table's second row.
    expect(PHY_MODES.eht.sensDbm[3]).toBe(-74)
    expect(reqSinrDb('eht', 3).toFixed(2)).toBe('16.99')
    expect((PHY_MODES.eht.sensDbm[3]! + 90.99).toFixed(2)).toBe('16.99')
    const s = primerScenario(9)
    const rssi = buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
    expect((rssi - noiseDbm(20)).toFixed(2)).toBe('21.66')
    expect(rssi - noiseDbm(20)).toBeGreaterThanOrEqual(reqSinrDb('eht', 3))
    // step 2's aside, "it does not move with the channel width": the engine's own signature
    // says so — `reqSinrDb(mode, mcs)` takes no width, and always subtracts the 20 MHz kTB.
    expect(reqSinrDb.length).toBe(2)
  })

  it('the "which side is the 3 dB on" table: 19.99 dB to pick it, 16.99 dB to decode it', () => {
    // the table, and the paragraph under it: "the 3 dB is the sender's own; the receiver does
    //  not count it when it decodes."
    expect(RATE_MARGIN_DB).toBe(3)
    expect((reqSinrDb('eht', 3) + RATE_MARGIN_DB).toFixed(2)).toBe('19.99')
    const snr = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' }).snrDb
    expect(snr.toFixed(2)).toBe('21.66')
    expect(snr).toBeGreaterThanOrEqual(reqSinrDb('eht', 3) + RATE_MARGIN_DB)
    // "were it not enough, the sender would drop a rung": that is what the margin decides
    expect((reqSinrDb('eht', 4) + RATE_MARGIN_DB).toFixed(2)).toBe('23.99')
    expect(mcsForRssi('eht', -72.33, undefined, 20)).toBe(3)
  })
})

describe('decode-thresholds · what the run shows', () => {
  it('the living room’s first frame: rung 3, required 16.99 dB, and an ACK right behind it', () => {
    // observe 1: "it goes out at rung 3, which needs 16.99 dB, and this link gives 21.66 dB.
    //  The router's ACK is the very next thing on the timeline — this frame decoded."
    const rs = variantRecs(2)
    const data = txs(rs, 'sta-1', 'data')[0]
    expect(data.frame.mcs).toBe(3)
    expect(data.frame.bytes).toBe(1530)
    const ok = ofType(rs, 'RX_OK').find((r) => r.node === 'ap')!
    expect(ok.t).toBe(data.t + data.frame.txTimeNs)
    const ack = txs(rs, 'ap', 'ack')[0]
    expect(ack.t).toBe(ok.t + 16_000)
  })

  it('no variant shows a retry, a timeout or a failed reception', () => {
    // observe 2, and the paragraph "four places, 100 ms each, and not one failed reception":
    // "a lone link at its ceiling still keeps 3 dB in hand — against a hard threshold, enough
    //  never to lose a frame."
    for (const i of PRIMER_DISTANCES.keys()) {
      const rs = variantRecs(i)
      expect(ofType(rs, 'RETRY'), `variant ${i}`).toHaveLength(0)
      expect(ofType(rs, 'ACK_TIMEOUT'), `variant ${i}`).toHaveLength(0)
      expect(ofType(rs, 'RX_FAIL'), `variant ${i}`).toHaveLength(0)
      expect(ofType(rs, 'RX_MISS'), `variant ${i}`).toHaveLength(0)
      // and every one of them really was at its own ceiling, not comfortably under it
      const lb = linkBudget({
        txDbm: 15, distanceM: PRIMER_DISTANCES[i],
        walls: PRIMER_DISTANCES[i] > 5.5 ? ['brick'] : [], widthMhz: 20, mode: 'eht',
      })
      if (lb.mcs + 1 < PHY_MODES.eht.sensDbm.length) {
        const next = reqSinrDb('eht', lb.mcs + 1) + RATE_MARGIN_DB
        expect(lb.snrDb, `variant ${i} is at its ceiling`).toBeLessThan(next)
      } else {
        // the desk is on the top rung: there is nothing above it to be short of
        expect(lb.mcs).toBe(PHY_MODES.eht.sensDbm.length - 1)
      }
    }
  })
})

describe('decode-thresholds · try this: audible and useless', () => {
  it('far wall at 80 MHz: under the margin, over the requirement, every frame acknowledged', () => {
    // "the noise floor rises to −87.97 dBm and the ratio falls to 9.89 dB — under rung 0's
    //  11.99 dB with the margin, but over its bare 8.99 dB requirement — and every frame is
    //  still acknowledged." It is also quiz 2's evidence.
    const lb = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 80, mode: 'eht' })
    expect(lb.noiseDbm.toFixed(2)).toBe('-87.97')
    expect(lb.snrDb.toFixed(2)).toBe('9.89')
    expect(lb.usable).toBe(false)
    expect(lb.snrDb).toBeGreaterThanOrEqual(reqSinrDb('eht', 0))
    expect((reqSinrDb('eht', 0) + RATE_MARGIN_DB).toFixed(2)).toBe('11.99')
    expect(lb.snrDb).toBeLessThan(reqSinrDb('eht', 0) + RATE_MARGIN_DB)
    const rs = runSc(withWidth(primerScenario(14), 80), RUN_NS)
    const data = txs(rs, 'sta-1', 'data')
    const acks = txs(rs, 'ap', 'ack')
    expect(data.length).toBeGreaterThan(10)
    expect(data.every((r) => r.frame.mcs === 0 && r.frame.widthMhz === 80)).toBe(true)
    expect(acks.length).toBeGreaterThanOrEqual(data.length - 1)
    expect(ofType(rs, 'RX_FAIL')).toHaveLength(0)
    expect(ofType(rs, 'ACK_TIMEOUT')).toHaveLength(0)
  })

  it('far wall at 160 MHz: the preamble is detected and nothing decodes', () => {
    // "the ratio is 6.87 dB. The preamble is still detected, so the receiver starts and waits,
    //  but nothing decodes: every reception ends in RX_FAIL and every transmission in a timeout."
    //  Quiz 1 walks the same three conditions in the same order.
    const lb = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 160, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(2)).toBe('-78.08')
    expect(lb.noiseDbm.toFixed(2)).toBe('-84.96')
    expect(lb.snrDb.toFixed(2)).toBe('6.87')
    expect(linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' }).snrDb.toFixed(2))
      .toBe('15.91')
    // quiz 1's two rejected options: it is loud enough, and clean enough, to start receiving
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(CCA_PD_DBM)
    expect(lb.snrDb).toBeGreaterThanOrEqual(PREAMBLE_DETECT_SINR_DB)
    // and it fails the one question that is left
    expect(lb.snrDb).toBeLessThan(reqSinrDb('eht', 0))
    const rs = runSc(withWidth(primerScenario(14), 160), RUN_NS)
    expect(txs(rs, 'sta-1', 'data').length).toBeGreaterThan(10)
    expect(txs(rs, 'ap', 'ack')).toHaveLength(0)
    expect(ofType(rs, 'RX_MISS')).toHaveLength(0)
    const fails = ofType(rs, 'RX_FAIL').filter((r) => r.node === 'ap')
    expect(fails.length).toBeGreaterThan(0)
    expect(fails.every((r) => r.reason === 'lowSinr')).toBe(true)
    expect(ofType(rs, 'ACK_TIMEOUT').length).toBeGreaterThan(0)
  })
})

describe('decode-thresholds · deeper', () => {
  it('the sensitivity table also hides 5 dB, and the simulator’s 3 dB gives the margin back', () => {
    // "the tables assume a 10 dB noise figure and have already taken 5 dB of implementation
    //  margin off … the simulator's own 7 dB beats the assumed 10 dB by 3 dB, exactly the
    //  rate margin, and the two cancel at 20 MHz."
    expect(reqSinrDb('eht', 0)).toBeCloseTo(PHY_MODES.eht.sensDbm[0]! + 90.99, 2)
    expect(10 - 7).toBe(RATE_MARGIN_DB)
    // which is why "the highest rung whose sensitivity the RSSI meets" is the same answer
    for (const mode of ['he', 'eht'] as const) {
      PHY_MODES[mode].sensDbm.forEach((sens, mcs) => {
        expect(mcsForRssi(mode, sens + 0.01)).toBeGreaterThanOrEqual(mcs)
        if (mcs > 0) expect(mcsForRssi(mode, sens - 0.01)).toBe(mcs - 1)
      })
    }
  })

  it('the hard threshold really is hard: the same place decodes everything or nothing', () => {
    // "reaching the requirement always decodes and falling short always fails" — no variant
    // sits in between, which is what the list of simplifications admits to.
    for (const i of PRIMER_DISTANCES.keys()) {
      const rs = variantRecs(i)
      const data = txs(rs, 'sta-1', 'data').length
      const ok = ofType(rs, 'RX_OK').filter((r) => r.node === 'ap').length
      expect(ok, `variant ${i}`).toBeGreaterThanOrEqual(data - 1)
    }
  })
})

/**
 * Slice 4a built frequency selectivity, and this lesson's hard threshold is where it lands: the
 * decision is taken against the COMBINED effective SINR, so "one part of the channel is gone" is
 * not "this frame is gone". The old sentence — that the engine cannot produce that situation at
 * all — is pinned as absent. The two decibel figures are the slice's own measurements
 * (tests/engine/selectivity.test.ts), and 捕获效应 carries its English name because
 * tests/course/wording.test.ts requires the sense of 捕获 to be named.
 */
describe('decode-thresholds · the hard threshold after frequency selectivity', () => {
  const text = decodeThresholds.limits.map((l) => l.text).join('\n')

  it('says the threshold is compared against the combined effective SINR', () => {
    expect(text).toContain(`${selBinWidthMhz()} MHz 一格`)
    expect(text).toContain('按容量折成一个有效信噪比')
    expect(text).toContain('24.09 dB')
    expect(text).toContain('2.36 dB')
  })

  it('says only the demodulation reads the combined number, and names the other sense of 捕获', () => {
    expect(text).toContain('前导检测与捕获效应（capture effect）判的仍然是那一次平坦抽样')
    expect(text).toContain('两个不同的数')
  })

  it('no longer says the engine cannot produce a partly dead channel', () => {
    expect(text).not.toContain('不建模时延扩展，因此没有频率选择性衰落')
    expect(text).not.toContain('不会出现“信道的一部分废了、另一部分还好”')
  })

  it('「本课的场景两节都没有写」: both sections, in the base scene and every variant', () => {
    // The sentence names TWO sections, so both are checked, and across the variants rather than
    // the base scene alone (review of 2026-10-03, finding 7 — the earlier version read only
    // `scenario().selectivity`). These variants are `primerVariants`, which this lesson shares
    // with radio-primer, mcs-ladder and noise-floor; each lesson's own claim is graded in its own
    // file rather than inferred from a neighbour's.
    const scenes = [decodeThresholds.scenario(), ...(decodeThresholds.variants ?? []).map((v) => v.scenario())]
    expect(scenes.length).toBeGreaterThan(1)
    for (const [i, sc] of scenes.entries()) {
      expect(sc.selectivity, `scene ${i}`).toBeUndefined()
      expect(sc.fading, `scene ${i}`).toBeUndefined()
    }
  })

  it('「少了衰落这一节，schema 会拒绝」, on this lesson’s own scene', () => {
    // The parenthesis is a claim about the engine, so it is read back out of the engine: the
    // section without a fading section is refused (src/model/scenario.ts's superRefine).
    expect(() => ScenarioSchema.parse({ ...decodeThresholds.scenario(), selectivity: {} })).toThrow()
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(reqSinrDb('eht', 3).toFixed(2)).toBe('16.99')` — with the lesson's step quoted in a
 * comment. So the engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted
 * six of this lesson's figures and **five went unnoticed**. Here every figure is parsed out of the
 * shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the requirement is read as the subtraction the formula prints.** 「所需 SINR = 灵敏度 −
 *    kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB」 has four figures in it, and the engine's own
 *    `reqSinrDb` has to come out of them for every rung of the ladder, not just the one quoted.
 *  - **the two experiments are read as the runs they are**: the 80 MHz one is under the margin
 *    and over the requirement, the 160 MHz one is over the detection threshold and under the
 *    requirement — and both are read off scenes built at those widths.
 *  - **the quiz's own arithmetic is read**: every figure in its explanations is one of the five
 *    quantities this lesson measures, so the question and the lesson cannot drift apart.
 *  - **the two figures `limits` borrows from `@selectivity` are read against that lesson's own
 *    table**, because that is where they are measured — a figure's home is where its measurement
 *    lives.
 */
describe('decode-thresholds · every figure the prose prints, read back out of it', () => {
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
  const WHY = [decodeThresholds.why!, ...decodeThresholds.outcomes!].join('\n')
  const TERMS = blockText(decodeThresholds.terms)
  const NUMS = blockText(decodeThresholds.numbers)
  const DEEP = blockText(decodeThresholds.deeper)
  const LIM = blockText(decodeThresholds.limits)
  const SRC = blockText(decodeThresholds.sources)
  const OBS = blockText(decodeThresholds.observe)
  const TRY = blockText(decodeThresholds.tryThis)
  const QUIZ = blockText(decodeThresholds.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    decodeThresholds.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  /** Which of the four places this lesson's own scene is: the living room, 9 m with a wall. */
  const LIVING_ROOM = PRIMER_DISTANCES.findIndex((d) => d === 9)
  /** The living room's own link: the scene this lesson's steps walk through. */
  const livingRoomSnr = (widthMhz = 20): number => {
    const s = withWidth(primerScenario(PRIMER_DISTANCES[LIVING_ROOM]!), widthMhz as 20 | 40 | 80 | 160)
    const rssi = buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
    return rssi - noiseDbm(widthMhz)
  }
  /** Thermal noise alone, without this engine's own noise figure: the formula's own kTB. */
  const kTB = (widthMhz: number): number => -174 + 10 * Math.log10(widthMhz * 1e6)

  it('reads the three-question table against the engine’s own thresholds', () => {
    const tb = tables().find((x) => x.head[0] === '问题')!
    const preambleRow = tb.rows.find((r) => r[0]!.includes('前导码'))!
    const [rssiDbm, sinrDb] = figs(preambleRow[1]!,
      /（RSSI）≥ (−\d+) dBm 且 SINR ≥ (\d+) dB/, 'the preamble row’s condition')
    expect(rssiDbm, 'the level this engine starts a reception at').toBe(CCA_PD_DBM)
    expect(sinrDb, 'and the ratio it needs with it').toBe(PREAMBLE_DETECT_SINR_DB)
    const [missAt] = figs(preambleRow[2]!, /够响却不到 (\d+) dB 则记 RX_MISS/,
      'the preamble row’s outcome')
    expect(missAt, 'the same ratio, named twice in one row').toBe(sinrDb)
    const energyRow = tb.rows.find((r) => r[0]!.includes('总功率'))!
    const [edDbm] = figs(energyRow[1]!, /空中总功率 ≥ (−\d+) dBm/, 'the energy row’s condition')
    expect(edDbm, 'the level this engine calls the air busy at').toBe(CCA_ED_DBM)
    // 「差 0.1 dB 就整帧作废」 — `why` on the hardness of the threshold
    const [sliver] = figs(WHY, /差 ([\d.]+) dB 就整帧作废/, '`why` on the hard threshold')
    expect(sliver, 'a sliver below the requirement').toBeGreaterThan(0)
    const need = reqSinrDb('eht', 3)
    expect(need - sliver!, 'and anything below it fails').toBeLessThan(need)
  })

  it('reads the requirement formula, and every rung it is claimed for', () => {
    const formula = decodeThresholds.numbers!.find((b) => b.kind === 'formula') as unknown as
      { text: string; note: string }
    // 「所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB」
    const [widthMhz, assumedNf, sum] = figs(formula.text,
      /所需 SINR = 灵敏度 − kTB\((\d+) MHz\) − (\d+) dB = 灵敏度 \+ ([\d.]+) dB/,
      'the formula line')
    same(String(sum), -kTB(widthMhz!) - assumedNf!, 'the two terms the formula folds together')
    for (const mcs of [0, 3, 5, 11]) {
      expect(reqSinrDb('eht', mcs).toFixed(2),
        `rung ${mcs}: its sensitivity plus that sum`)
        .toBe((PHY_MODES.eht.sensDbm[mcs]! + sum!).toFixed(2))
    }
    // 「那张表假设了 10 dB 的噪声系数」 — the same assumption, named again in the note
    const [noteNf] = figs(formula.note, /那张表假设了 (\d+) dB 的噪声系数/, 'the note on the assumption')
    expect(noteNf, 'the same assumption twice').toBe(assumedNf)
    // 「第 0 级灵敏度 −82 dBm，所需 8.99 dB」
    const [rung0, sens0, need0] = figs(formula.note,
      /第 (\d) 级灵敏度 (−\d+) dBm，所需 ([\d.]+) dB/, 'the note on rung zero')
    expect(sens0, 'that rung’s own sensitivity').toBe(PHY_MODES.eht.sensDbm[rung0!])
    same(String(need0), reqSinrDb('eht', rung0!), 'and what it needs')
    // the three steps: 「第 3 级，标准给 −74 dBm」, 「加上 90.99 dB…16.99 dB」, 「给出 21.66 dB」
    const [rung, sens] = figs(NUMS, /笔记本发第 (\d) 级，标准给 (−\d+) dBm/, 'step 1')
    expect(sens, 'the sensitivity that rung really has').toBe(PHY_MODES.eht.sensDbm[rung!])
    const [added, needed] = figs(NUMS, /加上 ([\d.]+) dB，得到所需 SINR：([\d.]+) dB/, 'step 2')
    expect(added, 'the same sum as the formula’s').toBe(sum)
    same(String(needed), reqSinrDb('eht', rung!), 'the requirement that rung carries')
    const [given] = figs(NUMS, /这条链路给出 ([\d.]+) dB，够了/, 'step 3')
    same(String(given), livingRoomSnr(), 'what this link really gives')
    expect(given, 'which clears the requirement').toBeGreaterThanOrEqual(needed!)
    // 「它与信道带宽无关」 — the engine's own signature says so
    expect(reqSinrDb.length, 'the requirement takes no width').toBe(2)
  })

  it('reads the 3-dB table, both columns and both rows', () => {
    const tb = tables().find((x) => x.head[0] === '这一次比较')!
    const picking = tb.rows.find((r) => r[0]!.includes('门槛'))!
    const [margin, withMargin] = figs(picking[1]!, /所需 SINR \+ (\d) dB = ([\d.]+) dB/,
      'the sender’s own threshold')
    expect(margin, 'the margin this engine really keeps').toBe(RATE_MARGIN_DB)
    const [bare] = figs(picking[2]!, /所需 SINR = ([\d.]+) dB/, 'the receiver’s own threshold')
    same(String(bare), reqSinrDb('eht', 3), 'the rung’s bare requirement')
    same(String(withMargin), reqSinrDb('eht', 3) + RATE_MARGIN_DB, 'and the same plus the margin')
    const gives = tb.rows.find((r) => r[0]!.includes('这条链路给出'))!
    for (const [i, cell] of gives.slice(1).entries()) {
      const [dB] = figs(cell!, /([\d.]+) dB/, `the link’s own ratio, column ${i}`)
      same(String(dB), livingRoomSnr(), `column ${i}: what the link gives`)
      expect(cell, `column ${i}: and the lesson marks it as enough`).toContain('✓')
    }
    // the term and the outcome print the margin again
    for (const [text, re, what] of [
      [TERMS, /多留的 (\d) dB/, 'the term on the margin'],
      [WHY, /发送端多留的那 (\d) dB/, 'the outcome on the margin'],
    ] as [string, RegExp, string][]) {
      expect(figs(text, re, what)[0], what).toBe(RATE_MARGIN_DB)
    }
  })

  it('reads `deeper`: the hidden five, the engine’s own seven, and the widths it holds for', () => {
    // 「标准的灵敏度表除了假设 10 dB 的噪声系数，还预先扣掉了 5 dB 的实现余量」
    const [nf, impl] = figs(DEEP, /除了假设 (\d+) dB 的噪声系数，还预先扣掉了 (\d) dB 的实现余量/,
      '`deeper` on what the table hides')
    const [heading] = figs(DEEP, /那张表里还含着 (\d) dB/, '`deeper`’s own heading')
    expect(heading, 'the heading names the same margin').toBe(impl)
    const [stays] = figs(DEEP, /这 (\d) dB 留在要求之内没有减回去/, '`deeper` on why it stays')
    expect(stays, 'and it is still the same one').toBe(impl)
    /*
     * 「本仿真器自己的 7 dB 噪声系数比标准假设的 10 dB 好 3 dB。这 3 dB 抵掉的正是发送端留的
     * 3 dB 速率余量」 — read as the arithmetic between the three figures, and then as the claim
     * itself: the rung this engine picks with its margin is the rung an assumed-noise receiver
     * picks with none.
     */
    const [ours, theirs, better] = figs(DEEP,
      /本仿真器自己的 (\d+) dB 噪声系数比标准假设的 (\d+) dB 好 (\d) dB/, '`deeper` on the two figures')
    expect(theirs, 'the standard’s own assumption, a third time').toBe(nf)
    expect(theirs! - ours!, 'how much better this engine’s is').toBe(better)
    expect(better, 'which is exactly the margin the sender keeps').toBe(RATE_MARGIN_DB)
    const [withNf, withMargin] = figs(DEEP,
      /本仿真器按「(\d+) dB 噪声系数 \+ (\d) dB 余量」挑出来的那一级/, '`deeper` on how it picks')
    expect([withNf, withMargin], 'the pair it picks with').toEqual([ours, better])
    const [assumed] = figs(DEEP, /一台按标准假设（(\d+) dB 噪声系数）的接收机/,
      '`deeper` on the other receiver')
    expect(assumed, 'the assumption that other receiver runs on').toBe(nf)
    // 「这一点与带宽无关，20、40、80、160 MHz 都成立」 — measured at each width it names
    const widths = figs(DEEP, /与带宽无关，(\d+)、(\d+)、(\d+)、(\d+) MHz 都成立/,
      '`deeper` on the widths')
    /*
     * The four widths are read as the widths this engine HAS: its tone table is the list of
     * channel widths it can price at all, and these are that list without its widest entry —
     * so a width that is not one of them makes the sentence name something this engine cannot
     * run.
     */
    const PHY_SRC = readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8')
    const [tones] = raw(PHY_SRC, /const TONES_HE: Record<number, number> = \{([^}]+)\}/,
      'the engine’s own tone table')
    const supported = [...tones!.matchAll(/(\d+):/g)].map((m) => Number(m[1]))
    expect(widths, 'every width the sentence names is one this engine has')
      .toEqual(supported.slice(0, widths.length))
    expect(supported.length - widths.length, 'and it leaves out only the widest').toBe(1)
    for (const w of widths) {
      const snr = livingRoomSnr(w)
      const rssi = snr + noiseDbm(w)
      const ourRung = mcsForRssi('eht', rssi, undefined, w)
      /*
       * The claim itself, at this width: the rung this engine picks (7 dB noise figure, 3 dB of
       * margin) is the rung a receiver on the table's own assumption (10 dB, no margin) picks.
       */
      const assumedSnr = rssi - kTB(w) - nf!
      let theirRung = -1
      for (let m = 0; m < PHY_MODES.eht.sensDbm.length; m++) {
        if (assumedSnr >= reqSinrDb('eht', m)) theirRung = m
      }
      expect(ourRung, `${w} MHz: the rung this engine picks`).toBe(theirRung)
    }
    // 「因为两个 3 dB 都是比值」
    const [bothCn] = figs(DEEP, /因为两个 (\d) dB 都是比值/, '`deeper` on why width does not matter')
    expect(bothCn, 'the two figures that cancel').toBe(better)
  })

  it('reads `limits` and `sources`, including the two figures borrowed from `@selectivity`', () => {
    // 「信道按 2.03125 MHz 一格各抽一次衰落」
    const [binMhz] = figs(LIM, /信道按 ([\d.]+) MHz 一格各抽一次衰落/, '`limits` on the bin')
    expect(binMhz, 'the bin this engine splits a channel into').toBe(selBinWidthMhz())
    /*
     * 「320 MHz 上最深那一格平均深 24.09 dB，整帧的有效信噪比却只掉 2.36 dB」 — both figures are
     * measured in `@selectivity`, whose own table prints them, so they are read against that
     * table: a figure's home is where its measurement lives.
     */
    const [wideMhz, deepest, effective] = figs(LIM,
      /(\d+) MHz 上最深那一格平均深 ([\d.]+) dB，整帧的有效信噪比却只掉 ([\d.]+) dB/,
      '`limits` on the two selectivity figures')
    const selTable = selectivity.numbers!.filter((b) => b.kind === 'table') as unknown as
      { head: string[]; rows: string[][] }[]
    const pair = selTable.find((x) => x.rows.some((r) => r[0]!.includes('最深那一格比均值低')))!
    const col = pair.head.findIndex((h) => h.includes(String(wideMhz)))
    expect(col, 'that lesson’s table has a column for this width').toBeGreaterThan(0)
    expect(val(pair.rows.find((r) => r[0]!.includes('最深那一格'))![col]!.replace(' dB', '')),
      'the deepest bin, as the lesson that measures it prints it').toBe(deepest)
    expect(val(pair.rows.find((r) => r[0]!.includes('有效信噪比'))![col]!.replace(' dB', '')),
      'and the effective loss').toBe(effective)
    expect(deepest, 'the deepest bin is far deeper than the loss').toBeGreaterThan(effective! * 5)
    // 「全场所有电台共用一个 7 dB 噪声系数」
    const [nf] = figs(LIM, /共用一个 (\d+) dB 噪声系数/, '`limits` on the noise figure')
    expect(noiseDbm(20) - kTB(20), 'the noise figure this engine adds').toBeCloseTo(nf!, 9)
    // 「每一处都写明了 10% 误包率的条件，以及其背后 10 dB 噪声系数与 5 dB 实现余量的假设」
    const [per, srcNf, srcImpl] = figs(SRC,
      /写明了 (\d+)% 误包率的条件，以及其背后 (\d+) dB 噪声系数与 (\d) dB 实现余量/,
      '`sources` on the table’s conditions')
    expect(per, 'the packet error rate the table is defined at').toBeGreaterThan(0)
    expect([srcNf, srcImpl], 'the two assumptions `deeper` reads as well')
      .toEqual(figs(DEEP, /除了假设 (\d+) dB 的噪声系数，还预先扣掉了 (\d) dB 的实现余量/,
        '`deeper` on the same two'))
    // 「−82 dBm 的前导检测门限与 −62 dBm 的能量检测门限」 and 「4 dB…与 3 dB…」
    const [pd, ed] = figs(SRC, /(−\d+) dBm 的前导检测门限与 (−\d+) dBm 的能量检测门限/,
      '`sources` on the two thresholds')
    expect([pd, ed], 'the engine’s own pair').toEqual([CCA_PD_DBM, CCA_ED_DBM])
    const [pdSinr, rateMargin] = figs(SRC, /(\d) dB 的前导检测比值与 (\d) dB 的速率余量/,
      '`sources` on the two model values')
    expect([pdSinr, rateMargin], 'and its own two model values')
      .toEqual([PREAMBLE_DETECT_SINR_DB, RATE_MARGIN_DB])
  })

  it('reads the margin wherever it is printed again, and the sliver the hard line leaves', () => {
    /*
     * **Twelve of this lesson's figures were second printings of the margin or of a width**
     * (sweep of 2026-10-14). The margin is printed seven times in all — the outcome, the term,
     * the table's own heading, two sentences of `deeper`, `sources`, and three of the quiz's
     * options — and every one of them is this engine's own `RATE_MARGIN_DB`.
     */
    const tb = tables().find((x) => x.head[0] === '这一次比较')!
    const margins = [
      figs(tb.heading!, /那 (\d) dB 在哪一边/, 'the table’s own heading')[0]!,
      figs(DEEP, /这 (\d) dB 抵掉的正是发送端留的/, '`deeper` on what cancels it')[0]!,
      figs(DEEP, /抵掉的正是发送端留的 (\d) dB 速率余量/, '`deeper` on the margin itself')[0]!,
      figs(QUIZ, /发送端多留的那 (\d) dB，接收端解码时算不算/, 'the quiz’s question')[0]!,
      figs(QUIZ, /算：接收端要所需比值再加 (\d) dB/, 'the quiz’s wrong option')[0]!,
      figs(QUIZ, /([\d.]+) dB 是发送端留给起伏的/, 'the quiz’s right option')[0]!,
    ]
    for (const m of margins) expect(m, 'every printing is the engine’s own margin').toBe(RATE_MARGIN_DB)
    /*
     * **Exempt, class (e): 「差 0.1 dB 就整帧作废」.** The sentence needs a sliver, and any
     * figure below the smallest step between two rungs would say the same thing. What is read is
     * that claim: the sliver is smaller than the gap between two neighbouring requirements, so
     * a frame that far short really is a frame that fails rather than one that drops a rung.
     */
    const [sliver] = figs(WHY, /差 ([\d.]+) dB 就整帧作废/, '`why` on the hard threshold')
    const gaps: number[] = []
    for (let m = 1; m < PHY_MODES.eht.sensDbm.length; m++) {
      gaps.push(reqSinrDb('eht', m) - reqSinrDb('eht', m - 1))
    }
    expect(sliver, 'smaller than any step on the ladder').toBeLessThan(Math.min(...gaps))
    expect(sliver, 'and still a real amount').toBeGreaterThan(0)
    /*
     * **Exempt, class (a): the 10 % packet error rate.** It is the condition the standard's
     * sensitivity table is defined at and no corpus ships with this repo. What is read of it:
     * the lesson quotes it where it quotes the clauses, and the two assumptions beside it are
     * the ones `deeper` reads against this engine's own noise figure.
     */
    const [per] = figs(SRC, /写明了 (\d+)% 误包率的条件/, '`sources` on the error rate')
    expect(per, 'a percentage, not a ratio').toBeGreaterThan(0)
    expect(per, 'and a small one').toBeLessThan(100)
  })

  it('reads `observe`, both experiments and the quiz against the runs they describe', () => {
    // 「它走第 3 级，所需 16.99 dB，而这条链路给出 21.66 dB」
    const [rung, need, given] = figs(OBS,
      /它走第 (\d) 级，所需 ([\d.]+) dB，而这条链路给出 ([\d.]+) dB/, '`observe` on the first frame')
    const first = txs(variantRecs(LIVING_ROOM), 'sta-1', 'data')[0]!
    expect(first.frame.mcs, 'the rung that frame really uses').toBe(rung)
    same(String(need), reqSinrDb('eht', rung!), 'what it requires')
    same(String(given), livingRoomSnr(), 'and what the link gives')
    // 「四个变体跑满 100 ms，没有重传、没有超时，也没有一次接收失败…仍留着 3 dB 速率余量」
    const [ms] = figs(OBS, /四个变体跑满 (\d+) ms/, '`observe` on the window')
    expect(ms! * MS, 'the window every variant is run for').toBe(RUN_NS)
    const [margin] = figs(OBS, /可要求之上仍留着 (\d) dB 速率余量/, '`observe` on the margin')
    expect(margin, 'the margin every link still has').toBe(RATE_MARGIN_DB)
    for (const i of decodeThresholds.variants!.map((_v, k) => k)) {
      const rs = variantRecs(i)
      expect(ofType(rs, 'RX_FAIL'), `variant ${i}: no failed reception`).toEqual([])
      expect(ofType(rs, 'RETRY'), `variant ${i}: no retry`).toEqual([])
    }
    /*
     * 「把两端的信道带宽改成 80 MHz。地板抬到 −87.97 dBm，比值掉到 9.89 dB——低于第 0 级含余量的
     * 11.99 dB，却高于它 8.99 dB 的裸要求」 — four figures of one experiment, on a scene built at
     * that width.
     */
    const [w80, floor80, snr80, rung0, withMargin0, bare0] = figs(TRY,
      /把两端的信道带宽改成 (\d+) MHz。地板抬到 (−[\d.]+) dBm，比值掉到 ([\d.]+) dB——低于第 (\d) 级含余量的 ([\d.]+) dB，却高于它 ([\d.]+) dB 的裸要求/,
      '`tryThis` on the 80 MHz experiment')
    const far = PRIMER_DISTANCES.at(-1)!
    const farSnr = (w: 20 | 40 | 80 | 160): number => {
      const s = withWidth(primerScenario(far), w)
      return buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')! - noiseDbm(w)
    }
    same(String(floor80), noiseDbm(w80!), 'the floor that width really has')
    same(String(snr80), farSnr(w80! as 80), 'the ratio that link really gives')
    same(String(bare0), reqSinrDb('eht', rung0!), 'the bare requirement of that rung')
    same(String(withMargin0), reqSinrDb('eht', rung0!) + RATE_MARGIN_DB, 'and the same with margin')
    expect(snr80, 'under the margin').toBeLessThan(withMargin0!)
    expect(snr80, 'and over the requirement').toBeGreaterThan(bare0!)
    // 「再改成 160 MHz：比值只剩 6.87 dB」
    const [w160, snr160] = figs(TRY, /再改成 (\d+) MHz：比值只剩 ([\d.]+) dB/,
      '`tryThis` on the 160 MHz experiment')
    same(String(snr160), farSnr(w160! as 160), 'the ratio that width leaves')
    expect(snr160, 'below the requirement, so nothing decodes').toBeLessThan(bare0!)
    /*
     * The quiz walks the three questions at that width: the level clears detection, the ratio
     * clears the preamble's own, and the requirement is what stops it.
     */
    const [qw, arrival, pd, qSnr, pdSinr] = figs(QUIZ,
      /换到 (\d+) MHz 后[\s\S]*?到达电平 (−[\d.]+) dBm 高于 (−\d+) dBm，([\d.]+) dB 也高于开始接收要的 (\d) dB/,
      'the quiz on the three questions')
    expect(qw, 'the same width as the experiment').toBe(w160)
    const sFar = withWidth(primerScenario(far), qw! as 160)
    same(String(arrival), buildLinkTable(sFar.nodes, sFar.walls).get('sta-1')!.get('ap')!,
      'the level that link really delivers')
    expect(pd, 'the detection threshold').toBe(CCA_PD_DBM)
    same(String(qSnr), farSnr(qw! as 160), 'the ratio it really gives')
    expect(pdSinr, 'and the preamble’s own ratio').toBe(PREAMBLE_DETECT_SINR_DB)
    const [stuck, against] = figs(QUIZ, /卡住的是第三个问题：([\d.]+) 低于 ([\d.]+) dB/,
      'the quiz on what stops it')
    expect([stuck, against], 'the same pair the experiment printed').toEqual([snr160, bare0])
    // 「算一半：所需比值加 1.5 dB」 — a wrong option, and its figure is half the margin
    const [half] = figs(QUIZ, /算一半：所需比值加 ([\d.]+) dB/, 'the quiz’s wrong option')
    expect(half! * 2, 'half of the margin').toBe(RATE_MARGIN_DB)
    // 「80 MHz 那个实验就是证据：9.89 dB 低于含余量的 11.99 dB，却高于 8.99 dB 的裸要求」
    const [qw80, qSnr80, qMargin80, qBare80] = figs(QUIZ,
      /(\d+) MHz 那个实验就是证据：([\d.]+) dB 低于含余量的 ([\d.]+) dB，却高于 ([\d.]+) dB 的裸要求/,
      'the quiz on the 80 MHz experiment')
    expect([qw80, qSnr80, qMargin80, qBare80], 'the experiment’s own four figures')
      .toEqual([w80, snr80, withMargin0, bare0])
  })
})
