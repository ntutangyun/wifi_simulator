import { describe, it, expect } from 'vitest'
import { decodeThresholds } from '../../src/course/tier1/decode-thresholds'
import { primerScenario } from '../../src/course/tier1/radioLink'
import { COURSE_ORDER, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import type { Block, Lesson } from '../../src/course/lessonKit'
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

const MS = 1_000_000

function records(s: Scenario, ms: number): TLRecord[] {
  const sim = new Simulation(s)
  const out: TLRecord[] = []
  for (let t = 50 * MS; t <= ms * MS; t += 50 * MS) out.push(...sim.runUntil(t).records)
  return out
}
type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string) =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)

function withWidth(s: Scenario, w: 20 | 40 | 80 | 160): Scenario {
  for (const n of s.nodes) n.caps.widthMhz = w
  return s
}

const DISTANCES = [1, 5, 9, 14]
const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/** The lesson's position table: RSSI, SNR, MCS, required + 3 dB, airtime. */
const EXPECTED = [
  { mcs: 13, rssi: '-31.7', snr: '62.3', reqPlus: '47.99', airtime: 129_600 },
  { mcs: 10, rssi: '-52.7', snr: '41.3', reqPlus: '39.99', airtime: 143_200 },
  { mcs: 3, rssi: '-72.3', snr: '21.7', reqPlus: '19.99', airtime: 415_200 },
  { mcs: 1, rssi: '-78.1', snr: '15.9', reqPlus: '14.99', airtime: 768_800 },
]

describe('decode thresholds: lesson shape', () => {
  it('is well formed, listed in the course order, and every scenario passes the schema', () => {
    const l: Lesson = decodeThresholds
    expect(l.id).toBe('decode-thresholds')
    expect(COURSE_ORDER).toContain(l.id)
    expect(COURSE_ORDER.indexOf('decode-thresholds')).toBe(COURSE_ORDER.indexOf('radio-primer') + 1)
    expect(l.module).toBe(0)
    expect(l.title.en).not.toMatch(/\d/)
    expect('minutes' in l).toBe(false)
    expect(l.quiz).toHaveLength(2)
    for (const q of l.quiz) expect(q.answer).toBeLessThan(q.options.length)
    ScenarioSchema.parse(l.scenario())
    for (const v of l.variants!) ScenarioSchema.parse(v.scenario())
  })

  it('computed study time is 15–25 minutes and follows the curriculum formula', () => {
    const raw = lessonWords(decodeThresholds) / 150 + 5 * decodeThresholds.observe.length + 5 * decodeThresholds.tryThis.length
    expect(lessonMinutes(decodeThresholds)).toBe(Math.round(raw / 5) * 5)
    expect(lessonMinutes(decodeThresholds)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(decodeThresholds)).toBeLessThanOrEqual(25)
  })

  it('jump targets occur', () => {
    const recs = records(decodeThresholds.scenario(), 50)
    for (const j of decodeThresholds.jumps) expect(recs.some(j.find), j.label.en).toBe(true)
  })
})

describe('decode thresholds: the three questions', () => {
  it('detection, CCA and rate-margin constants', () => {
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

  it('quiz 2: a −70 dBm frame missed during our own TX leaves CCA idle; heard from the start it is busy', () => {
    expect(ccaAfter(true)).toBe(false)
    expect(ccaAfter(false)).toBe(true)
  })
})

describe('decode thresholds: required SINR and the ladder', () => {
  it('required SINR = sensitivity − kTB(20 MHz) − 10 dB, and the widget caption’s numbers', () => {
    const rows = mcsLadder('eht')
    expect(rows).toHaveLength(14)
    for (const r of rows) expect(r.reqSinrDb).toBeCloseTo(r.sensDbm - (-174 + 10 * Math.log10(20e6)) - 10, 9)
    expect((rows[0].reqSinrDb - rows[0].sensDbm).toFixed(2)).toBe('90.99')
    expect(rows[0].reqSinrDb.toFixed(2)).toBe('8.99')
    expect(PHY_MODES.eht.ndbps[0] / 234).toBe(0.5)
    expect(PHY_MODES.eht.ndbps[13] / 234).toBe(10)
    expect((rows[13].reqSinrDb - rows[0].reqSinrDb).toFixed(0)).toBe('36')
    expect(mcsLadder('he')).toHaveLength(12)

    const w = decodeThresholds.body.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('mcsLadder')
    expect(w.params!.mode).toBe('eht')
    const snr = Number(w.params!.snrDb)
    expect(snr).toBe(21.5)
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(Math.floor(lb.snrDb * 2) / 2).toBe(snr)
    expect(rows.filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).map((r) => r.mcs)).toEqual([0, 1, 2, 3])
    expect((reqSinrDb('eht', 3) + RATE_MARGIN_DB).toFixed(2)).toBe('19.99')
    expect((reqSinrDb('eht', 4) + RATE_MARGIN_DB).toFixed(2)).toBe('23.99')
  })

  it('at 20 MHz the ceiling is the highest MCS whose sensitivity the RSSI meets', () => {
    for (const mode of ['he', 'eht'] as const) {
      PHY_MODES[mode].sensDbm.forEach((sens, mcs) => {
        expect(mcsForRssi(mode, sens + 0.01)).toBeGreaterThanOrEqual(mcs)
        if (mcs > 0) expect(mcsForRssi(mode, sens - 0.01)).toBe(mcs - 1)
      })
    }
  })

  it('the rate ceiling keeps the 3 dB margin: at 20.5 dB the ceiling is MCS 3, not MCS 4', () => {
    expect(reqSinrDb('eht', 3).toFixed(2)).toBe('16.99')
    expect(reqSinrDb('eht', 4).toFixed(2)).toBe('20.99')
    const snr = 20.5
    const best = mcsLadder('eht').filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).pop()!.mcs
    expect(best).toBe(3)
  })
})

describe('decode thresholds: the simulation matches the ladder', () => {
  const variantRecs = decodeThresholds.variants!.map((v) => records(v.scenario(), 100))

  it('each variant: the position table, and every data frame carries that MCS and airtime', () => {
    DISTANCES.forEach((d, i) => {
      const e = EXPECTED[i]
      const s = decodeThresholds.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mcs).toBe(e.mcs)
      expect((reqSinrDb('eht', e.mcs) + RATE_MARGIN_DB).toFixed(2)).toBe(e.reqPlus)
      const data = txs(variantRecs[i], 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      for (const r of data) {
        expect(r.frame.mcs).toBe(e.mcs)
        expect(r.frame.mode).toBe('eht')
        expect(r.frame.widthMhz).toBe(20)
      }
      expect(data[0].frame.bytes).toBe(1530)
      expect(data[0].frame.txTimeNs).toBe(e.airtime)
    })
    expect(EXPECTED[3].airtime / EXPECTED[0].airtime).toBeCloseTo(5.93, 2)
    expect(EXPECTED[0].mcs - EXPECTED[3].mcs).toBe(12)
  })

  it('no variant shows a retry, an ACK timeout or a failed reception', () => {
    for (const recs of variantRecs) {
      expect(recs.some((r) => r.type === 'RETRY' || r.type === 'ACK_TIMEOUT' || r.type === 'RX_FAIL' || r.type === 'RX_MISS')).toBe(false)
    }
  })

  it('far wall at 80 MHz: below the margin but above the requirement, every frame acknowledged', () => {
    const lb = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 80, mode: 'eht' })
    expect(lb.noiseDbm.toFixed(2)).toBe('-87.97')
    expect(lb.snrDb.toFixed(2)).toBe('9.89')
    expect(lb.usable).toBe(false)
    expect(lb.snrDb).toBeGreaterThanOrEqual(reqSinrDb('eht', 0))
    expect((reqSinrDb('eht', 0) + RATE_MARGIN_DB).toFixed(2)).toBe('11.99')
    const recs = records(withWidth(primerScenario(14), 80), 100)
    const data = txs(recs, 'sta-1', 'data')
    const acks = txs(recs, 'ap', 'ack')
    expect(data.length).toBeGreaterThan(10)
    expect(data.every((r) => r.frame.mcs === 0 && r.frame.widthMhz === 80)).toBe(true)
    expect(acks.length).toBeGreaterThanOrEqual(data.length - 1)
    expect(recs.some((r) => r.type === 'RX_FAIL' || r.type === 'ACK_TIMEOUT')).toBe(false)
  })

  it('far wall at 160 MHz: preamble detected, nothing decodes (RX_FAIL lowSinr, ACK timeouts)', () => {
    const lb = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 160, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(2)).toBe('-78.08')
    expect(lb.noiseDbm.toFixed(2)).toBe('-84.96')
    expect(lb.snrDb.toFixed(2)).toBe('6.87')
    expect(linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' }).snrDb.toFixed(2)).toBe('15.91')
    expect(noiseDbm(20).toFixed(2)).toBe('-93.99')
    expect(lb.snrDb).toBeLessThan(reqSinrDb('eht', 0))
    expect(lb.snrDb).toBeGreaterThanOrEqual(PREAMBLE_DETECT_SINR_DB)
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(CCA_PD_DBM)
    const recs = records(withWidth(primerScenario(14), 160), 100)
    expect(txs(recs, 'sta-1', 'data').length).toBeGreaterThan(10)
    expect(txs(recs, 'ap', 'ack')).toHaveLength(0)
    expect(recs.some((r) => r.type === 'RX_MISS')).toBe(false)
    const fails = recs.filter((r): r is Extract<TLRecord, { type: 'RX_FAIL' }> => r.type === 'RX_FAIL' && r.node === 'ap')
    expect(fails.length).toBeGreaterThan(0)
    expect(fails.every((r) => r.reason === 'lowSinr')).toBe(true)
    expect(recs.some((r) => r.type === 'ACK_TIMEOUT')).toBe(true)
  })
})

describe('decode thresholds: try this', () => {
  it('far wall at 12 dBm: −81.1 dBm, one rung down to MCS 0, 1476.0 µs', () => {
    const s = primerScenario(14)
    s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm = 12
    const lb = linkBudget({ txDbm: 12, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-81.1')
    expect(lb.rssiDbm).toBeLessThan(PHY_MODES.eht.sensDbm[1])
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(PHY_MODES.eht.sensDbm[0])
    expect(PHY_MODES.eht.sensDbm[1]).toBe(-79)
    expect(PHY_MODES.eht.sensDbm[0]).toBe(-82)
    const recs = records(s, 50)
    const data = txs(recs, 'sta-1', 'data')
    expect(data.every((r) => r.frame.mcs === 0)).toBe(true)
    expect(data[0].frame.txTimeNs).toBe(1_476_000)
    expect(txTimeModeNs('eht', 1530, 0)).toBe(1_476_000)
    expect(recs.some((r) => r.type === 'RX_FAIL')).toBe(false)
  })

  it('ladder widget: the top usable rung is MCS 1 at 15.9 dB and MCS 13 at 62.3 dB', () => {
    const top = (snr: number) => mcsLadder('eht').filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).pop()!.mcs
    expect(top(15.9)).toBe(1)
    expect(top(62.3)).toBe(13)
    expect(62.3 - 15.9).toBeCloseTo(46.4, 9)
  })
})
