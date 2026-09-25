/**
 * Every empirical claim in "The fourteen rungs, and how a sender picks one",
 * measured against the scene it shares with `decode-thresholds` — which is
 * `radio-primer`'s — so all four M1 lessons read one run.
 *
 * The pins here are `decode-thresholds`'s before the 2026-09-25 re-pacing: the
 * six printed rungs, the modulation names, the `mcsLadder` widget, the
 * five-step rate-picking procedure, the worked living-room column, the
 * four-position table and both experiments. They moved together and on purpose
 * — a procedure and the scene that demonstrates it are not divided — which is
 * why the whole of "choosing a rung, step by step" is asserted below.
 *
 * The lesson is not registered yet (`src/course/lessons.ts` and `COURSE_ORDER`
 * are the controller's), so it is imported directly, and the terminology rule
 * readability.test.ts applies course-wide is re-run over it here.
 */
import { describe, it, expect } from 'vitest'
import { mcsLadder as mcsLadderLesson } from '../../src/course/tier1/mcs-ladder'
import { decodeThresholds } from '../../src/course/tier1/decode-thresholds'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { MODULES } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { linkBudget, mcsLadder } from '../../src/course/widgetModel'
import { PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb, txTimeModeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The same run length the other three M1 lessons use, so they share one memo. */
const RUN_NS = 100 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string): Tx[] =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)
const variantRecs = (i: number): TLRecord[] => runOf(mcsLadderLesson, i, RUN_NS)

const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/** The "One 1530-octet frame, by position" table: level, SNR, rung, needs + 3 dB, airtime. */
const TABLE = [
  { rssi: '-31.7', snr: '62.3', mcs: 13, reqPlus: '47.99', airtime: 129_600 },
  { rssi: '-52.7', snr: '41.3', mcs: 10, reqPlus: '39.99', airtime: 143_200 },
  { rssi: '-72.3', snr: '21.7', mcs: 3, reqPlus: '19.99', airtime: 415_200 },
  { rssi: '-78.1', snr: '15.9', mcs: 1, reqPlus: '14.99', airtime: 768_800 },
]

lessonShapeSuite(mcsLadderLesson, { sameSceneAs: 'decode-thresholds', runNs: RUN_NS })

describe('mcs-ladder · the fourth lesson of the Wi-Fi track', () => {
  it('sits in M1, follows decode-thresholds, and owns the two rung words', () => {
    expect(mcsLadderLesson.id).toBe('mcs-ladder')
    expect(MODULES[mcsLadderLesson.module].title).toBe('信号与链路')
    expect(mcsLadderLesson.module).toBe(decodeThresholds.module)
    expect(mcsLadderLesson.needs).toEqual(['decode-thresholds'])
    expect(mcsLadderLesson.terms!.map((t) => t.term)).toEqual(['MCS', 'OFDM'])
  })

  it('loads decode-thresholds’ own scene, variant for variant', () => {
    expect(mcsLadderLesson.scenario()).toEqual(decodeThresholds.scenario())
    expect(mcsLadderLesson.variants!.map((v) => v.scenario()))
      .toEqual(decodeThresholds.variants!.map((v) => v.scenario()))
    expect(() => ScenarioSchema.parse(mcsLadderLesson.scenario())).not.toThrow()
    for (const v of mcsLadderLesson.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('brackets every official term at its first Chinese use', () => {
    const l = mcsLadderLesson
    const zh = [l.why!, ...l.outcomes!]
      .concat(paragraphTexts(l.picture!), cellTexts(l.picture!))
      .concat(paragraphTexts(l.numbers!), cellTexts(l.numbers!))
      .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
      .join(' ')
    const wifi = ZH_TERMS.filter((t) => !t.track || t.track === 'wifi')
    const fails = wifi.flatMap((t) => [zhTermFailure(zh, t), ...zhAkaViolations(zh, t)].filter(Boolean))
    expect(fails).toEqual([])
    expect(wifi.filter((t) => zhTermFailure(zh, t) === null && zh.includes(t.zh ?? t.abbr!)).length)
      .toBeGreaterThanOrEqual(2)
  })
})

describe('mcs-ladder · the ladder itself', () => {
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
    // the picture's "going up a rung loads each sub-carrier with more bits" — half a bit at
    // the bottom, ten at the top, for 36 dB more
    expect((rows[13].reqSinrDb - rows[0].reqSinrDb).toFixed(0)).toBe('36')
  })

  it('the modulation names count symbols, and a name plus its fraction gives the bits', () => {
    // the gloss under the table: "two levels is BPSK, four is QPSK, then the 16, 64, 1024 and
    //  4096 of the QAM family; the fraction after it is the coding rate." Each printed cell is
    //  `<symbols>-QAM <rate>`, and log2(symbols) × rate is the row's own bits per sub-carrier,
    //  so a name that stopped matching the ladder fails here.
    const printed: [number, string, number, number][] = [
      [0, 'BPSK', 2, 1 / 2], [1, 'QPSK', 4, 1 / 2], [3, '16-QAM', 16, 1 / 2],
      [7, '64-QAM', 64, 5 / 6], [10, '1024-QAM', 1024, 3 / 4], [13, '4096-QAM', 4096, 5 / 6],
    ]
    for (const [mcs, name, symbols, rate] of printed) {
      if (name === 'BPSK') expect(symbols).toBe(2)
      if (name === 'QPSK') expect(symbols).toBe(4)
      if (name.includes('-QAM')) expect(Number(name.split('-')[0])).toBe(symbols)
      expect(Math.log2(symbols) * rate, `bits/tone MCS ${mcs}`).toBeCloseTo(PHY_MODES.eht.ndbps[mcs] / 234, 9)
    }
    // deeper: "rungs 3 and 7 are the 16-QAM and 64-QAM their names give, at different
    //  fractions — 2 bits against 5, and 10 dB more asked for"
    expect((reqSinrDb('eht', 7) - reqSinrDb('eht', 3)).toFixed(0)).toBe('10')
  })

  it('the widget marks the living-room link, and the margin picks the rung', () => {
    // the caption "the marker at the living-room laptop's SNR rounded down to 21.5 dB. The
    //  rungs it lights are the ones that fit: requirement plus the margin kept in hand."
    const w = mcsLadderLesson.numbers!.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('mcsLadder')
    expect(w.params!.mode).toBe('eht')
    const snr = Number(w.params!.snrDb)
    expect(snr).toBe(21.5)
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(Math.floor(lb.snrDb * 2) / 2).toBe(snr)
    expect(mcsLadder('eht').filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).map((r) => r.mcs)).toEqual([0, 1, 2, 3])
  })
})

/**
 * The procedure arrived here whole, and the worked column beside it is the
 * procedure run at one place: every line of "the living-room laptop, step by
 * step" is the step it names, checked against the engine rather than quoted.
 */
describe('mcs-ladder · choosing a rung, step by step', () => {
  const RSSI = -72.3
  const steps = mcsLadderLesson.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!

  it('states the whole procedure, all five steps, on the main path', () => {
    // the one thing the split had to get right: no half of a procedure in another lesson
    expect(steps.items).toHaveLength(5)
    expect([...mcsLadderLesson.picture!, ...mcsLadderLesson.numbers!].filter((b) => b.kind === 'steps')).toHaveLength(1)
  })

  it('step 1: the received level minus the 20 MHz noise floor is the SNR the column prints', () => {
    expect(noiseDbm(20)).toBeCloseTo(-93.99, 2)
    expect(RSSI - noiseDbm(20)).toBeCloseTo(21.7, 1)
  })

  it('step 2: a required SINR is its sensitivity plus 90.99 dB', () => {
    for (let mcs = 0; mcs < PHY_MODES.eht.sensDbm.length; mcs++) {
      expect(reqSinrDb('eht', mcs)).toBeCloseTo(PHY_MODES.eht.sensDbm[mcs]! + 90.99, 2)
    }
  })

  it('steps 3 and 4: rung 3 fits with the margin and rung 7 does not, so the frame goes at 3', () => {
    const snr = RSSI - noiseDbm(20)
    expect(reqSinrDb('eht', 3)).toBeCloseTo(16.99, 2)
    expect(reqSinrDb('eht', 3) + RATE_MARGIN_DB).toBeCloseTo(19.99, 2)
    expect(reqSinrDb('eht', 3) + RATE_MARGIN_DB).toBeLessThanOrEqual(snr)
    expect(reqSinrDb('eht', 7)).toBeCloseTo(26.99, 2)
    expect(reqSinrDb('eht', 7) + RATE_MARGIN_DB).toBeCloseTo(29.99, 2)
    expect(reqSinrDb('eht', 7) + RATE_MARGIN_DB).toBeGreaterThan(snr)
    expect(mcsForRssi('eht', RSSI, undefined, 20)).toBe(3)
  })

  it('step 5: at 20 MHz the look-up shortcut picks the same rung as the arithmetic', () => {
    for (let dbm = -90; dbm <= -30; dbm += 0.5) {
      const bySensitivity = PHY_MODES.eht.sensDbm.reduce((best, sens, i) => (dbm >= sens ? i : best), 0)
      expect(mcsForRssi('eht', dbm, undefined, 20), `${dbm} dBm`).toBe(bySensitivity)
    }
    // quiz 2 walks it once by hand: −73 dBm meets rung 3's −74 dBm and misses rung 4's −70 dBm
    expect(PHY_MODES.eht.sensDbm[3]).toBe(-74)
    expect(PHY_MODES.eht.sensDbm[4]).toBe(-70)
    expect(mcsForRssi('eht', -73, undefined, 20)).toBe(3)
  })
})

describe('mcs-ladder · the simulation matches the ladder', () => {
  it('the position table is the run: rung, requirement and airtime, four places', () => {
    // "One 1530-octet frame, by position", and the observations "Read the MCS of the first
    //  data frame in each of the four variants: 13, 10, 3 and 1" / "Now read the airtime of
    //  that frame: 129.6, 143.2, 415.2 and 768.8 µs."
    PRIMER_DISTANCES.forEach((d, i) => {
      const e = TABLE[i]
      const s = mcsLadderLesson.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mcs).toBe(e.mcs)
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
    // "twelve rungs down costs nearly six times the air for the very same 1530 octets", and
    // quiz 1's "129.6 µs at the desk and 768.8 µs at the far wall"
    expect(TABLE[0].mcs - TABLE[3].mcs).toBe(12)
    expect(TABLE[3].airtime / TABLE[0].airtime).toBeCloseTo(5.93, 2)
  })
})

describe('mcs-ladder · try this', () => {
  it('the slider: MCS 1 at 15.9 dB, MCS 13 at 62.3 dB, and two rungs fewer on HE', () => {
    // "the top usable rung moves from MCS 1 to MCS 13, twelve rungs for 46 dB. Then press the
    //  HE (Wi-Fi 6) button: the two fastest rungs disappear" — and deeper's "4096-QAM only
    //  arrived with Wi-Fi 7".
    const top = (mode: 'he' | 'eht', snr: number) =>
      mcsLadder(mode).filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).pop()!.mcs
    expect(top('eht', 15.9)).toBe(1)
    expect(top('eht', 62.3)).toBe(13)
    expect(62.3 - 15.9).toBeCloseTo(46.4, 9)
    expect(mcsLadder('he')).toHaveLength(12)
    expect(mcsLadder('eht').length - mcsLadder('he').length).toBe(2)
  })

  it('far wall at 12 dBm: one rung down, and 768.8 µs becomes 1476.0 µs', () => {
    // "the received level falls just under the sensitivity of the rung it was using, so the
    //  frames drop a rung and stretch from 768.8 to 1476.0 µs. 3 dB nearly doubles the airtime."
    const s = primerScenario(14)
    s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm = 12
    const lb = linkBudget({ txDbm: 12, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-81.1')
    // just under rung 1's −79 dBm, still above rung 0's −82 dBm: exactly one rung
    expect(PHY_MODES.eht.sensDbm[1]).toBe(-79)
    expect(PHY_MODES.eht.sensDbm[0]).toBe(-82)
    expect(lb.rssiDbm).toBeLessThan(PHY_MODES.eht.sensDbm[1])
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(PHY_MODES.eht.sensDbm[0])
    const rs = [...new Simulation(s).runUntil(50 * MS).records]
    const data = txs(rs, 'sta-1', 'data')
    expect(data.every((r) => r.frame.mcs === 0)).toBe(true)
    expect(data[0].frame.txTimeNs).toBe(1_476_000)
    expect(txTimeModeNs('eht', 1530, 0)).toBe(1_476_000)
    expect(ofType(rs, 'RX_FAIL')).toHaveLength(0)
    expect(TABLE[3].airtime * 2).toBeGreaterThan(1_476_000)
  })
})
