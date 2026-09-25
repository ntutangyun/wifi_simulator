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
    expect(decodeThresholds.needs).toEqual(['radio-primer'])
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
