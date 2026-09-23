/**
 * Every empirical claim in "Fast talk, and when a frame gets through", measured
 * against the lesson's own scenario — radio-primer's walk through the flat, so
 * the two lessons share one run and one set of recorded hashes.
 *
 * The required-ratio derivation, the wide-channel corner case ("audible and
 * useless") and the model's simplifications moved into `deeper` during the
 * readability rewrite; each is still pinned below with the sentence it guards.
 * The old `.body!` widget lookup is retired: the widget lives in `numbers`.
 */
import { describe, it, expect } from 'vitest'
import { decodeThresholds } from '../../src/course/tier1/decode-thresholds'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { radioPrimer } from '../../src/course/tier1/radio-primer'
import { COURSE_ORDER } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import { linkBudget, mcsLadder } from '../../src/course/widgetModel'
import { Channel, PREAMBLE_DETECT_SINR_DB, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import {
  CCA_ED_DBM, CCA_PD_DBM, PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb, txTimeModeNs,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The same run length radio-primer uses, so the two lessons share the memo. */
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

const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/** The "One 1530-octet frame, by position" table: RSSI, SNR, MCS, needs + 3 dB, airtime. */
const TABLE = [
  { rssi: '-31.7', snr: '62.3', mcs: 13, reqPlus: '47.99', airtime: 129_600 },
  { rssi: '-52.7', snr: '41.3', mcs: 10, reqPlus: '39.99', airtime: 143_200 },
  { rssi: '-72.3', snr: '21.7', mcs: 3, reqPlus: '19.99', airtime: 415_200 },
  { rssi: '-78.1', snr: '15.9', mcs: 1, reqPlus: '14.99', airtime: 768_800 },
]

lessonShapeSuite(decodeThresholds, { proseMax: 1200, runNs: RUN_NS })

describe('decode-thresholds · the second lesson of the Wi-Fi track', () => {
  it('follows radio-primer, needs it, and owns the three words of the owner table', () => {
    expect(decodeThresholds.module).toBe(0)
    expect(COURSE_ORDER.indexOf('decode-thresholds')).toBe(COURSE_ORDER.indexOf('radio-primer') + 1)
    expect(decodeThresholds.needs).toEqual(['radio-primer'])
    // the amendment of 2026-09-23 adds the two quantities the rung procedure asks the reader to use
    expect(decodeThresholds.terms!.map((t) => t.term)).toEqual(['MCS', 'OFDM', 'CCA', 'sensitivity', 'rate margin'])
  })

  it('loads radio-primer’s own scene, variant for variant', () => {
    // "It loads exactly the scene radio-primer loads": the two radio lessons are one walk
    // through the flat, so nothing new is simulated and nothing new is recorded.
    expect(decodeThresholds.scenario()).toEqual(radioPrimer.scenario())
    expect(decodeThresholds.variants!.map((v) => v.scenario()))
      .toEqual(radioPrimer.variants!.map((v) => v.scenario()))
    expect(() => ScenarioSchema.parse(decodeThresholds.scenario())).not.toThrow()
    for (const v of decodeThresholds.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })
})

describe('decode-thresholds · the three questions', () => {
  it('the table’s conditions are the engine’s own constants', () => {
    // the rows "RSSI ≥ −82 dBm and SINR ≥ 4 dB as it arrives" and "Total power on the air
    //  ≥ −62 dBm", and the paragraph "−62 dBm, twenty decibels higher"
    expect(CCA_PD_DBM).toBe(-82)
    expect(CCA_ED_DBM).toBe(-62)
    expect(CCA_ED_DBM - CCA_PD_DBM).toBe(20)
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    expect(RATE_MARGIN_DB).toBe(3)
  })

  /** `rx` optionally transmits 0–1 ms; `j` starts a long frame at 100 µs, heard by rx at −70 dBm. */
  function ccaAfter(rxTransmits: boolean): boolean {
    const q = new EventQueue()
    let now = 0
    const table = new Map<string, Map<string, number>>([
      ['rx', new Map([['x', -40], ['j', -200]])],
      ['j', new Map([['rx', -70], ['x', -200]])],
      ['x', new Map([['rx', -200], ['j', -200]])],
    ])
    const ch = new Channel(q, () => now, table, makeEmitter(() => {}))
    const nop = (): PhyListener => ({
      onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {},
    })
    for (const id of ['rx', 'j', 'x']) ch.register(id, nop())
    const f = (src: string, dst: string, dur: number): FrameDesc =>
      ({ kind: 'data', src, dst, bytes: 1500, mbps: 54, durationFieldNs: 0, txTimeNs: dur })
    if (rxTransmits) q.schedule(0, () => ch.startTx('rx', f('rx', 'x', 1_000_000)))
    q.schedule(100_000, () => ch.startTx('j', f('j', 'x', 5_000_000)))
    let busy = false
    q.schedule(1_500_000, () => { busy = ch.isCcaBusy('rx') }, 2)
    for (;;) { if (q.peekTime() === null) break; const e = q.pop()!; now = e.t; e.fn() }
    return busy
  }

  it('quiz 2: a −70 dBm frame missed during our own transmission leaves CCA idle', () => {
    // "the preamble was missed, so only raw power counts, and −70 dBm is below −62 dBm", and the
    // explanation's closing sentence, which both languages now carry: "Had you been listening
    // when it began, −70 dBm would have held you off."
    expect(ccaAfter(true)).toBe(false)
    expect(ccaAfter(false)).toBe(true)
  })
})

describe('decode-thresholds · the ladder', () => {
  it('the six printed rungs are the engine’s, requirement and sensitivity alike', () => {
    // "Six of the fourteen rungs, 20 MHz, one stream": MCS, modulation, bits per sub-carrier,
    //  Mb/s, sensitivity, needs.
    const rows = mcsLadder('eht')
    expect(rows).toHaveLength(14)
    const printed: [number, number, number, number, string][] = [
      [0, 0.5, 8.6, -82, '8.99'], [1, 1, 17.2, -79, '11.99'], [3, 2, 34.4, -74, '16.99'],
      [7, 5, 86.0, -64, '26.99'], [10, 7.5, 129.0, -54, '36.99'], [13, 10, 172.1, -46, '44.99'],
    ]
    for (const [mcs, bits, mbps, sens, req] of printed) {
      // "Bits per sub-carrier": the ladder's own bits per data tone
      expect(PHY_MODES.eht.ndbps[mcs] / 234, `bits/tone MCS ${mcs}`).toBe(bits)
      expect(rows[mcs].mbps).toBe(mbps)
      expect(rows[mcs].sensDbm).toBe(sens)
      expect(rows[mcs].reqSinrDb.toFixed(2)).toBe(req)
    }
    // the picture's "Going up a rung loads each sub-carrier with more bits" — half a bit at the
    // bottom, ten at the top, for 36 dB more
    expect((rows[13].reqSinrDb - rows[0].reqSinrDb).toFixed(0)).toBe('36')
  })

  it('the modulation names count symbols, and a name plus its fraction gives the bits', () => {
    // the gloss under the table: "Each modulation name says how many symbols the sender chooses
    //  between: two (BPSK), four (QPSK), then the 16, 64, 1024 and 4096 of the QAM (a grid of
    //  signal levels) family. The fraction after it is the coding rate." — and `deeper`'s "MCS 3
    //  and MCS 7 use the same 16-QAM and 64-QAM families their names give, at different fractions."
    // Each printed cell is `<symbols>-QAM <rate>` (or BPSK/QPSK), and log2(symbols) × rate is the
    // row's own bits per sub-carrier, so a name that stopped matching the ladder fails here.
    const printed: [number, string, number, number][] = [
      [0, 'BPSK', 2, 1 / 2], [1, 'QPSK', 4, 1 / 2], [3, '16-QAM', 16, 1 / 2],
      [7, '64-QAM', 64, 5 / 6], [10, '1024-QAM', 1024, 3 / 4], [13, '4096-QAM', 4096, 5 / 6],
    ]
    for (const [mcs, name, symbols, rate] of printed) {
      // the two names without a number in front are the two- and four-symbol rungs
      if (name === 'BPSK') expect(symbols).toBe(2)
      if (name === 'QPSK') expect(symbols).toBe(4)
      if (name.includes('-QAM')) expect(Number(name.split('-')[0])).toBe(symbols)
      expect(Math.log2(symbols) * rate, `bits/tone MCS ${mcs}`).toBeCloseTo(PHY_MODES.eht.ndbps[mcs] / 234, 9)
    }
  })

  it('deeper: the requirement is the sensitivity table with the assumed noise taken back out', () => {
    // "required SINR = sensitivity − kTB(20 MHz) − 10 dB = sensitivity + 90.99 dB" and its note
    //  "MCS 0 at −82 dBm needs 8.99 dB … the simulator's own 7 dB noise figure beats the assumed
    //  10 dB by 3 dB, which the 3 dB rate margin gives straight back".
    const rows = mcsLadder('eht')
    for (const r of rows) expect(r.reqSinrDb).toBeCloseTo(r.sensDbm - (-174 + 10 * Math.log10(20e6)) - 10, 9)
    expect((rows[0].reqSinrDb - rows[0].sensDbm).toFixed(2)).toBe('90.99')
    expect(rows[0].reqSinrDb.toFixed(2)).toBe('8.99')
    // "the rung is the highest one whose sensitivity the RSSI meets", at 20 MHz, for both modes
    for (const mode of ['he', 'eht'] as const) {
      PHY_MODES[mode].sensDbm.forEach((sens, mcs) => {
        expect(mcsForRssi(mode, sens + 0.01)).toBeGreaterThanOrEqual(mcs)
        if (mcs > 0) expect(mcsForRssi(mode, sens - 0.01)).toBe(mcs - 1)
      })
    }
  })

  it('the widget marks the living-room link, and the margin picks the rung', () => {
    // the caption "the marker at the living-room laptop's SNR rounded down to 21.5 dB. The rungs
    //  it lights are the ones that fit: requirement plus the margin kept in hand."
    const w = decodeThresholds.numbers!.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('mcsLadder')
    expect(w.params!.mode).toBe('eht')
    const snr = Number(w.params!.snrDb)
    expect(snr).toBe(21.5)
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(Math.floor(lb.snrDb * 2) / 2).toBe(snr)
    expect(mcsLadder('eht').filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).map((r) => r.mcs)).toEqual([0, 1, 2, 3])
    expect((reqSinrDb('eht', 3) + RATE_MARGIN_DB).toFixed(2)).toBe('19.99')
    expect((reqSinrDb('eht', 4) + RATE_MARGIN_DB).toFixed(2)).toBe('23.99')
  })
})

/**
 * The rung procedure and the worked example beside it (amendment of
 * 2026-09-23): every line of the "living-room laptop" table is the step it
 * names, run against the engine rather than quoted from it.
 */
describe('decode-thresholds · choosing a rung, step by step', () => {
  const RSSI = -72.3
  const steps = decodeThresholds.numbers!.find((b) => b.kind === 'steps')

  it('states the procedure as five steps on the main path', () => {
    expect(steps).toBeDefined()
    expect((steps as Extract<Block, { kind: 'steps' }>).items).toHaveLength(5)
  })

  it('step 1: RSSI − the 20 MHz noise floor is the SNR the table prints', () => {
    expect(noiseDbm(20)).toBeCloseTo(-93.99, 2)
    expect(RSSI - noiseDbm(20)).toBeCloseTo(21.7, 1)
  })

  it('step 2: a required SINR is its sensitivity plus 90.99 dB', () => {
    for (let mcs = 0; mcs < PHY_MODES.eht.sensDbm.length; mcs++) {
      expect(reqSinrDb('eht', mcs)).toBeCloseTo(PHY_MODES.eht.sensDbm[mcs]! + 90.99, 2)
    }
  })

  it('step 3: MCS 3 fits with the margin and MCS 7 does not, so the rung is 3', () => {
    const snr = RSSI - noiseDbm(20)
    expect(reqSinrDb('eht', 3)).toBeCloseTo(16.99, 2)
    expect(reqSinrDb('eht', 3) + RATE_MARGIN_DB).toBeCloseTo(19.99, 2)
    expect(reqSinrDb('eht', 3) + RATE_MARGIN_DB).toBeLessThanOrEqual(snr)
    expect(reqSinrDb('eht', 7)).toBeCloseTo(26.99, 2)
    expect(reqSinrDb('eht', 7) + RATE_MARGIN_DB).toBeCloseTo(29.99, 2)
    expect(reqSinrDb('eht', 7) + RATE_MARGIN_DB).toBeGreaterThan(snr)
    expect(mcsForRssi('eht', RSSI, undefined, 20)).toBe(3)
  })

  it('step 5: at 20 MHz the shortcut picks the same rung as the arithmetic', () => {
    for (let dbm = -90; dbm <= -30; dbm += 0.5) {
      const bySensitivity = PHY_MODES.eht.sensDbm.reduce((best, sens, i) => (dbm >= sens ? i : best), 0)
      expect(mcsForRssi('eht', dbm, undefined, 20), `${dbm} dBm`).toBe(bySensitivity)
    }
  })
})

describe('decode-thresholds · the simulation matches the ladder', () => {
  it('the position table is the run: rung, requirement and airtime, four places', () => {
    // "One 1530-octet frame, by position", and the observations "Read the MCS of the first data
    //  frame in each of the four variants: 13, 10, 3 and 1" / "Now read the airtime of that
    //  frame: 129.6, 143.2, 415.2 and 768.8 µs."
    PRIMER_DISTANCES.forEach((d, i) => {
      const e = TABLE[i]
      const s = decodeThresholds.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mcs).toBe(e.mcs)
      // "the rung is the highest one whose sensitivity the RSSI meets": the table's own two columns
      expect(mcsForRssi('eht', lb.rssiDbm)).toBe(e.mcs)
      expect((reqSinrDb('eht', e.mcs) + RATE_MARGIN_DB).toFixed(2)).toBe(e.reqPlus)
      const data = txs(variantRecs(i), 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].t).toBe(0)
      for (const r of data) {
        expect(r.frame.mcs).toBe(e.mcs)
        expect(r.frame.mode).toBe('eht')
        expect(r.frame.widthMhz).toBe(20)
      }
      expect(data[0].frame.bytes).toBe(1530)
      expect(data[0].frame.txTimeNs).toBe(e.airtime)
    })
    // "Twelve rungs down costs nearly six times the air for the very same 1530 octets", and the
    // quiz's "129.6 µs at the desk and 768.8 µs at the far wall"
    expect(TABLE[0].mcs - TABLE[3].mcs).toBe(12)
    expect(TABLE[3].airtime / TABLE[0].airtime).toBeCloseTo(5.93, 2)
  })

  it('no variant shows a retry, a timeout or a failed reception', () => {
    // "A lone link at its ceiling still keeps 3 dB in hand — against a hard threshold, enough
    //  never to lose a frame."
    for (const i of PRIMER_DISTANCES.keys()) {
      const rs = variantRecs(i)
      expect(ofType(rs, 'RETRY')).toHaveLength(0)
      expect(ofType(rs, 'ACK_TIMEOUT')).toHaveLength(0)
      expect(ofType(rs, 'RX_FAIL')).toHaveLength(0)
      expect(ofType(rs, 'RX_MISS')).toHaveLength(0)
    }
  })
})

describe('decode-thresholds · deeper: audible and useless', () => {
  it('far wall at 80 MHz: under the margin, over the requirement, every frame acknowledged', () => {
    // "the noise floor rises to −87.97 dBm and the SNR falls to 9.89 dB — under MCS 0's 11.99 dB
    //  with the margin, but over its bare 8.99 dB requirement — and every frame is still acknowledged."
    const lb = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 80, mode: 'eht' })
    expect(lb.noiseDbm.toFixed(2)).toBe('-87.97')
    expect(lb.snrDb.toFixed(2)).toBe('9.89')
    expect(lb.usable).toBe(false)
    expect(lb.snrDb).toBeGreaterThanOrEqual(reqSinrDb('eht', 0))
    expect((reqSinrDb('eht', 0) + RATE_MARGIN_DB).toFixed(2)).toBe('11.99')
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
    // "At 160 MHz the SNR is 6.87 dB. The preamble is still detected, so the receiver starts and
    //  waits, but nothing decodes: every reception ends in RX_FAIL and every transmission in a timeout."
    const lb = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 160, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(2)).toBe('-78.08')
    expect(lb.noiseDbm.toFixed(2)).toBe('-84.96')
    expect(lb.snrDb.toFixed(2)).toBe('6.87')
    expect(linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' }).snrDb.toFixed(2)).toBe('15.91')
    expect(noiseDbm(20).toFixed(2)).toBe('-93.99')
    expect(lb.snrDb).toBeLessThan(reqSinrDb('eht', 0))
    expect(lb.snrDb).toBeGreaterThanOrEqual(PREAMBLE_DETECT_SINR_DB)
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(CCA_PD_DBM)
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

describe('decode-thresholds · try this', () => {
  it('far wall at 12 dBm: one rung down, and 768.8 µs becomes 1476.0 µs', () => {
    // "The received level falls just under the sensitivity of the rung it was using, so the
    //  frames drop a rung and stretch from 768.8 to 1476.0 µs."
    const s = primerScenario(14)
    s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm = 12
    const lb = linkBudget({ txDbm: 12, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-81.1')
    // just under MCS 1's −79 dBm, still above MCS 0's −82 dBm: exactly one rung
    expect(PHY_MODES.eht.sensDbm[1]).toBe(-79)
    expect(PHY_MODES.eht.sensDbm[0]).toBe(-82)
    expect(lb.rssiDbm).toBeLessThan(PHY_MODES.eht.sensDbm[1])
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(PHY_MODES.eht.sensDbm[0])
    const rs = runSc(s, 50 * MS)
    const data = txs(rs, 'sta-1', 'data')
    expect(data.every((r) => r.frame.mcs === 0)).toBe(true)
    expect(data[0].frame.txTimeNs).toBe(1_476_000)
    expect(txTimeModeNs('eht', 1530, 0)).toBe(1_476_000)
    expect(ofType(rs, 'RX_FAIL')).toHaveLength(0)
  })

  it('the ladder slider: MCS 1 at 15.9 dB, MCS 13 at 62.3 dB, and two rungs fewer on HE', () => {
    // "the top usable rung moves from MCS 1 to MCS 13, twelve rungs for 46 dB. Then press the
    //  HE (Wi-Fi 6) button: the two fastest rungs disappear."
    const top = (mode: 'he' | 'eht', snr: number) =>
      mcsLadder(mode).filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).pop()!.mcs
    expect(top('eht', 15.9)).toBe(1)
    expect(top('eht', 62.3)).toBe(13)
    expect(62.3 - 15.9).toBeCloseTo(46.4, 9)
    expect(mcsLadder('he')).toHaveLength(12)
    expect(mcsLadder('eht').length - mcsLadder('he').length).toBe(2)
  })
})
