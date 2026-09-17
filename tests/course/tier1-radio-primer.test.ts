import { describe, it, expect } from 'vitest'
import { radioPrimer, primerScenario } from '../../src/course/tier1/radio-primer'
import type { Block, L10n, Lesson } from '../../src/course/lessonKit'
import { linkBudget, mcsLadder, BAND_EXTRA_LOSS_DB } from '../../src/course/widgetModel'
import { Channel, PREAMBLE_DETECT_SINR_DB, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import {
  CCA_ED_DBM, CCA_PD_DBM, NOISE_FIGURE_DB, PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb, txTimeModeNs,
} from '../../src/engine/phy'
import { WALL_LOSS_DB, buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'

const MS = 1_000_000
const mw = (dbm: number) => Math.pow(10, dbm / 10)
const dbm = (m: number) => 10 * Math.log10(m)

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
const EXPECTED = [
  { mcs: 13, mbps: 172.1, rssi: '-31.7', snr: '62.3', airtime: 129_600 },
  { mcs: 10, mbps: 129.0, rssi: '-52.7', snr: '41.3', airtime: 143_200 },
  { mcs: 3, mbps: 34.4, rssi: '-72.3', snr: '21.7', airtime: 415_200 },
  { mcs: 1, mbps: 17.2, rssi: '-78.1', snr: '15.9', airtime: 768_800 },
]
const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))

describe('radio primer: lesson shape', () => {
  it('is well formed, and every scenario passes the schema', () => {
    const l: Lesson = radioPrimer
    expect(l.id).toBe('radio-primer')
    expect(l.module).toBe(0)
    expect(l.title.en).not.toMatch(/\d/)
    expect(l.quiz).toHaveLength(3)
    expect(l.tryThis).toHaveLength(2)
    for (const q of l.quiz) expect(q.answer).toBeLessThan(q.options.length)
    ScenarioSchema.parse(l.scenario())
    for (const v of l.variants!) ScenarioSchema.parse(v.scenario())
  })

  it('stated minutes = round5(EN words / 150 + 5 · observe + 5 · tryThis)', () => {
    const texts: string[] = []
    const add = (x?: L10n) => { if (x) texts.push(x.en) }
    add(radioPrimer.title)
    for (const b of radioPrimer.body as Block[]) {
      add(b.heading)
      if (b.kind === undefined || b.kind === 'p') add(b.text)
      else if (b.kind === 'formula') { add(b.text); add(b.note) }
      else if (b.kind === 'table') { b.head.forEach(add); b.rows.flat().forEach(add) }
      else if (b.kind === 'list' || b.kind === 'steps') b.items.forEach(add)
      else if (b.kind === 'widget') add(b.caption)
    }
    radioPrimer.observe.forEach(add)
    radioPrimer.tryThis.forEach(add)
    for (const q of radioPrimer.quiz) { add(q.q); q.options.forEach(add); add(q.explain) }
    const words = texts.join(' ').split(/\s+/).filter(Boolean).length
    const raw = words / 150 + 5 * radioPrimer.observe.length + 5 * radioPrimer.tryThis.length
    expect(radioPrimer.minutes).toBe(Math.round(raw / 5) * 5)
  })

  it('base scenario is the 9 m geometry; variants are 1, 5, 9 and 14 m on the centre line', () => {
    const pos = (s: Scenario) => {
      const ap = s.nodes.find((n) => n.id === 'ap')!.pos
      const sta = s.nodes.find((n) => n.id === 'sta-1')!.pos
      return Math.hypot(sta.x - ap.x, sta.y - ap.y, sta.z - ap.z)
    }
    expect(pos(radioPrimer.scenario())).toBeCloseTo(9, 12)
    expect(radioPrimer.variants!.map((v) => pos(v.scenario()))).toEqual(DISTANCES)
  })

  it('jump targets occur', () => {
    const recs = records(radioPrimer.scenario(), 50)
    for (const j of radioPrimer.jumps) expect(recs.some(j.find), j.label.en).toBe(true)
  })
})

describe('radio primer: dB, path loss, noise, SINR', () => {
  it('dBm table and dB rules', () => {
    expect(dbm(100)).toBeCloseTo(20, 12)
    expect(dbm(31.6).toFixed(1)).toBe('15.0')
    expect(dbm(1)).toBe(0)
    const s = primerScenario(9)
    expect(s.nodes.find((n) => n.id === 'ap')!.txPowerDbm).toBe(20)
    expect(s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm).toBe(15)
    const rssi = buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
    expect(rssi.toFixed(1)).toBe('-72.3')
    expect(mw(rssi).toExponential(2)).toBe('5.85e-8')
    expect(dbm(2).toFixed(2)).toBe('3.01')
  })

  it('path-loss model and wall losses', () => {
    expect(pathLossDb(1)).toBeCloseTo(46.7, 12)
    expect((pathLossDb(2) - pathLossDb(1)).toFixed(1)).toBe('9.0')
    expect(pathLossDb(10) - pathLossDb(1)).toBeCloseTo(30, 9)
    expect(WALL_LOSS_DB).toEqual({ drywall: 5, brick: 12, glass: 3 })
    expect(BAND_EXTRA_LOSS_DB['6g']).toBe(1.2)
  })

  it('noise floor per width', () => {
    expect(NOISE_FIGURE_DB).toBe(7)
    expect((noiseDbm(20) - NOISE_FIGURE_DB).toFixed(2)).toBe('-100.99')
    expect([20, 40, 80, 160, 320].map((w) => noiseDbm(w).toFixed(2))).toEqual(['-93.99', '-90.98', '-87.97', '-84.96', '-81.95'])
  })

  it('worked SINR example and equal interferers', () => {
    const n = noiseDbm(20)
    expect(mw(n).toExponential(2)).toBe('3.99e-10')
    expect(mw(-85).toExponential(2)).toBe('3.16e-9')
    const sum = mw(n) + mw(-85)
    expect(sum.toExponential(2)).toBe('3.56e-9')
    expect(dbm(sum).toFixed(2)).toBe('-84.48')
    expect((dbm(sum) + 85).toFixed(2)).toBe('0.52')
    const sig = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' }).rssiDbm
    expect(sig.toFixed(2)).toBe('-72.33')
    expect((sig - dbm(sum)).toFixed(2)).toBe('12.16')
    expect((sig - n).toFixed(2)).toBe('21.66')
    expect(dbm(2 * mw(-85)).toFixed(2)).toBe('-81.99')
  })
})

describe('radio primer: thresholds and the MCS ladder', () => {
  it('detection and CCA constants', () => {
    expect(CCA_PD_DBM).toBe(-82)
    expect(CCA_ED_DBM).toBe(-62)
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    expect(RATE_MARGIN_DB).toBe(3)
  })

  it('required SINR = sensitivity − kTB(20 MHz) − 10 dB, and the ladder table rows', () => {
    const rows = mcsLadder('eht')
    expect(rows).toHaveLength(14)
    for (const r of rows) expect(r.reqSinrDb).toBeCloseTo(r.sensDbm - (-174 + 10 * Math.log10(20e6)) - 10, 9)
    expect((rows[0].reqSinrDb - rows[0].sensDbm).toFixed(2)).toBe('90.99')
    const table: [number, number, number, number, string][] = [
      [0, 0.5, 8.6, -82, '8.99'], [1, 1, 17.2, -79, '11.99'], [3, 2, 34.4, -74, '16.99'],
      [7, 5, 86.0, -64, '26.99'], [10, 7.5, 129.0, -54, '36.99'], [13, 10, 172.1, -46, '44.99'],
    ]
    for (const [mcs, bits, mbps, sens, req] of table) {
      expect(PHY_MODES.eht.ndbps[mcs] / 234, `bits/tone MCS ${mcs}`).toBe(bits)
      expect(rows[mcs].mbps).toBe(mbps)
      expect(rows[mcs].sensDbm).toBe(sens)
      expect(rows[mcs].reqSinrDb.toFixed(2)).toBe(req)
    }
  })

  it('at 20 MHz the ceiling is the highest MCS whose sensitivity the RSSI meets', () => {
    for (const mode of ['he', 'eht'] as const) {
      PHY_MODES[mode].sensDbm.forEach((sens, mcs) => {
        expect(mcsForRssi(mode, sens + 0.01)).toBeGreaterThanOrEqual(mcs)
        if (mcs > 0) expect(mcsForRssi(mode, sens - 0.01)).toBe(mcs - 1)
      })
    }
  })

  it('widget params in the lesson produce the numbers the captions quote', () => {
    const widgets = radioPrimer.body.filter((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')
    const lbP = widgets.find((w) => w.widget === 'linkBudget')!.params!
    const walls = (['drywall', 'brick', 'glass'] as const).flatMap((m) => Array(Number(lbP[m])).fill(m))
    const lb = linkBudget({
      txDbm: Number(lbP.txDbm), distanceM: Number(lbP.distanceM), walls,
      widthMhz: Number(lbP.widthMhz), mode: lbP.mode as 'eht',
    })
    expect(walls).toEqual(['brick'])
    expect(lb.pathLossDb.toFixed(1)).toBe('75.3')
    expect(lb.wallLossDb).toBe(12)
    expect(lb.rssiDbm.toFixed(1)).toBe('-72.3')
    expect(lb.noiseDbm.toFixed(1)).toBe('-94.0')
    expect(lb.snrDb.toFixed(1)).toBe('21.7')
    expect(lb.mcs).toBe(3)

    const ladP = widgets.find((w) => w.widget === 'mcsLadder')!.params!
    expect(ladP.mode).toBe('eht')
    const snr = Number(ladP.snrDb)
    expect(snr).toBe(21.5)
    expect(Math.floor(lb.snrDb * 2) / 2).toBe(snr)
    const usable = mcsLadder('eht').filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB).map((r) => r.mcs)
    expect(usable).toEqual([0, 1, 2, 3])
    expect((reqSinrDb('eht', 3) + RATE_MARGIN_DB).toFixed(2)).toBe('19.99')
    expect((reqSinrDb('eht', 4) + RATE_MARGIN_DB).toFixed(2)).toBe('23.99')
  })
})

describe('radio primer: the simulation matches the widget', () => {
  const variantRecs = radioPrimer.variants!.map((v) => records(v.scenario(), 100))

  it('each variant: widget RSSI/SNR/MCS = link table and first data frame (MCS, Mbps, airtime)', () => {
    DISTANCES.forEach((d, i) => {
      const e = EXPECTED[i]
      const s = radioPrimer.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mcs).toBe(e.mcs)
      expect(lb.mbps).toBe(e.mbps)
      const data = txs(variantRecs[i], 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      for (const r of data) {
        expect(r.frame.mcs).toBe(e.mcs)
        expect(r.frame.mode).toBe('eht')
        expect(r.frame.widthMhz).toBe(20)
      }
      expect(data[0].frame.bytes).toBe(1530)
      expect(data[0].frame.mbps).toBe(e.mbps)
      expect(data[0].frame.txTimeNs).toBe(e.airtime)
    })
  })

  it('ACKs in the first 100 ms: 353 at the desk, 107 at the far wall (under a third)', () => {
    const acks = variantRecs.map((r) => txs(r, 'ap', 'ack').length)
    expect(acks[0]).toBe(353)
    expect(acks[3]).toBe(107)
    expect(acks[3] / acks[0]).toBeLessThan(1 / 3)
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
    expect(lb.snrDb).toBeLessThan(reqSinrDb('eht', 0))
    expect(lb.snrDb).toBeGreaterThanOrEqual(PREAMBLE_DETECT_SINR_DB)
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(CCA_PD_DBM)
    const recs = records(withWidth(primerScenario(14), 160), 100)
    const data = txs(recs, 'sta-1', 'data')
    expect(data.length).toBeGreaterThan(10)
    expect(txs(recs, 'ap', 'ack')).toHaveLength(0)
    expect(recs.some((r) => r.type === 'RX_MISS')).toBe(false)
    const fails = recs.filter((r): r is Extract<TLRecord, { type: 'RX_FAIL' }> => r.type === 'RX_FAIL' && r.node === 'ap')
    expect(fails.length).toBeGreaterThan(0)
    expect(fails.every((r) => r.reason === 'lowSinr')).toBe(true)
    expect(recs.some((r) => r.type === 'ACK_TIMEOUT')).toBe(true)
  })
})

describe('radio primer: try this', () => {
  it('living room with a glass wall: −63.3 dBm, MCS 7, 86.0 Mbps, 197.6 µs', () => {
    const s = primerScenario(9)
    const i = s.walls.findIndex((w) => w.x1 === 6 && w.x2 === 6)
    expect(s.walls[i].material).toBe('brick')
    s.walls[i].material = 'glass'
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['glass'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-63.3')
    expect(lb.mcs).toBe(7)
    const data = txs(records(s, 50), 'sta-1', 'data')
    expect(data.every((r) => r.frame.mcs === 7)).toBe(true)
    expect(data[0].frame.mbps).toBe(86.0)
    expect(data[0].frame.txTimeNs).toBe(197_600)
  })

  it('far wall at 12 dBm: −81.1 dBm, MCS 0, 1476.0 µs', () => {
    const s = primerScenario(14)
    s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm = 12
    const lb = linkBudget({ txDbm: 12, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-81.1')
    expect(lb.rssiDbm).toBeLessThan(PHY_MODES.eht.sensDbm[1])
    expect(lb.rssiDbm).toBeGreaterThanOrEqual(PHY_MODES.eht.sensDbm[0])
    const recs = records(s, 50)
    const data = txs(recs, 'sta-1', 'data')
    expect(data.every((r) => r.frame.mcs === 0)).toBe(true)
    expect(data[0].frame.txTimeNs).toBe(1_476_000)
    expect(txTimeModeNs('eht', 1530, 0)).toBe(1_476_000)
    expect(recs.some((r) => r.type === 'RX_FAIL')).toBe(false)
  })
})

describe('radio primer quiz 3: −82 vs −62 dBm after our own transmission', () => {
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
    const nop = (): PhyListener => ({ onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {} })
    for (const id of ['rx', 'j', 'x']) ch.register(id, nop())
    const f = (src: string, dst: string, dur: number): FrameDesc => ({ kind: 'data', src, dst, bytes: 1500, mbps: 54, durationFieldNs: 0, txTimeNs: dur })
    if (rxTransmits) q.schedule(0, () => ch.startTx('rx', f('rx', 'x', 1_000_000)))
    q.schedule(100_000, () => ch.startTx('j', f('j', 'x', 5_000_000)))
    let busy = false
    q.schedule(1_500_000, () => { busy = ch.isCcaBusy('rx') }, 2)
    for (;;) { if (q.peekTime() === null) break; const e = q.pop()!; now = e.t; e.fn() }
    return busy
  }

  it('missed preamble at −70 dBm: idle (below ED −62); heard preamble at −70 dBm: busy', () => {
    expect(ccaAfter(true)).toBe(false)
    expect(ccaAfter(false)).toBe(true)
  })
})
