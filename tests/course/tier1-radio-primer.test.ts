import { describe, it, expect } from 'vitest'
import { radioPrimer } from '../../src/course/tier1/radio-primer'
import { primerScenario } from '../../src/course/tier1/radioLink'
import { COURSE_ORDER, OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { linkBudget, BAND_EXTRA_LOSS_DB } from '../../src/course/widgetModel'
import { NOISE_FIGURE_DB, noiseDbm } from '../../src/engine/phy'
import { WALL_LOSS_DB, buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
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

const DISTANCES = [1, 5, 9, 14]
const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/** RSSI / SNR (1 decimal), MCS, PHY rate and airtime of one 1530-octet frame. */
const EXPECTED = [
  { mcs: 13, mbps: 172.1, rssi: '-31.7', snr: '62.3', airtime: 129_600 },
  { mcs: 10, mbps: 129.0, rssi: '-52.7', snr: '41.3', airtime: 143_200 },
  { mcs: 3, mbps: 34.4, rssi: '-72.3', snr: '21.7', airtime: 415_200 },
  { mcs: 1, mbps: 17.2, rssi: '-78.1', snr: '15.9', airtime: 768_800 },
]

describe('radio primer: lesson shape', () => {
  it('is well formed, listed in the course order, and every scenario passes the schema', () => {
    const l: Lesson = radioPrimer
    expect(l.id).toBe('radio-primer')
    expect(COURSE_ORDER).toContain(l.id)
    expect(l.module).toBe(0)
    expect(l.title.en).not.toMatch(/\d/)
    expect('minutes' in l).toBe(false)
    expect(l.observe).toHaveLength(3)
    expect(l.tryThis).toHaveLength(2)
    for (const q of l.quiz) expect(q.answer).toBeLessThan(q.options.length)
    ScenarioSchema.parse(l.scenario())
    for (const v of l.variants!) ScenarioSchema.parse(v.scenario())
  })

  it('computed study time is 15–25 minutes and follows the curriculum formula', () => {
    const raw = lessonWords(radioPrimer) / 150 + OBSERVE_MINUTES * radioPrimer.observe.length + TRY_MINUTES * radioPrimer.tryThis.length
    expect(lessonMinutes(radioPrimer)).toBe(Math.round(raw / 5) * 5)
    expect(lessonMinutes(radioPrimer)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(radioPrimer)).toBeLessThanOrEqual(25)
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

  it('path-loss model, wall losses and the 2.5× equivalence of one brick wall', () => {
    expect(pathLossDb(1)).toBeCloseTo(46.7, 12)
    expect((pathLossDb(2) - pathLossDb(1)).toFixed(1)).toBe('9.0')
    expect(pathLossDb(10) - pathLossDb(1)).toBeCloseTo(30, 9)
    expect(WALL_LOSS_DB).toEqual({ drywall: 5, brick: 12, glass: 3 })
    expect((pathLossDb(2.5) - pathLossDb(1)).toFixed(0)).toBe('12')
    expect(BAND_EXTRA_LOSS_DB['6g']).toBe(1.2)
  })

  it('noise floor per width', () => {
    expect(NOISE_FIGURE_DB).toBe(7)
    expect((noiseDbm(20) - NOISE_FIGURE_DB).toFixed(2)).toBe('-100.99')
    expect([20, 40, 80, 160, 320].map((w) => noiseDbm(w).toFixed(2)))
      .toEqual(['-93.99', '-90.98', '-87.97', '-84.96', '-81.95'])
    expect((noiseDbm(160) - noiseDbm(20)).toFixed(2)).toBe('9.03')
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
    expect(((sig - n) - (sig - dbm(sum))).toFixed(1)).toBe('9.5')
    expect(dbm(2 * mw(-85)).toFixed(2)).toBe('-81.99')
  })
})

describe('radio primer: widget and simulation agree', () => {
  it('the linkBudget widget params produce the numbers the caption quotes', () => {
    const w = radioPrimer.body.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('linkBudget')
    const p = w.params!
    const walls = (['drywall', 'brick', 'glass'] as const).flatMap((m) => Array(Number(p[m])).fill(m))
    expect(walls).toEqual(['brick'])
    const lb = linkBudget({
      txDbm: Number(p.txDbm), distanceM: Number(p.distanceM), walls,
      widthMhz: Number(p.widthMhz), mode: p.mode as 'eht',
    })
    expect(lb.pathLossDb.toFixed(1)).toBe('75.3')
    expect(lb.wallLossDb).toBe(12)
    expect(lb.rssiDbm.toFixed(1)).toBe('-72.3')
    expect(lb.noiseDbm.toFixed(1)).toBe('-94.0')
    expect(lb.snrDb.toFixed(1)).toBe('21.7')
  })

  it('each variant: widget RSSI/SNR/rate = link table and the first data frame', () => {
    DISTANCES.forEach((d, i) => {
      const e = EXPECTED[i]
      const s = radioPrimer.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mbps).toBe(e.mbps)
      const data = txs(records(s, 50), 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].frame.mbps).toBe(e.mbps)
      expect(data[0].frame.bytes).toBe(1530)
    })
    expect((Number(EXPECTED[0].rssi) - Number(EXPECTED[3].rssi)).toFixed(0)).toBe('46')
  })

  it('the router’s ACK: 24 Mbps / 28 µs in the first three variants, 12 Mbps / 32 µs at the far wall', () => {
    const acks = radioPrimer.variants!.map((v) => txs(records(v.scenario(), 50), 'ap', 'ack')[0].frame)
    expect(acks.map((f) => f.mbps)).toEqual([24, 24, 24, 12])
    expect(acks.map((f) => f.txTimeNs)).toEqual([28_000, 28_000, 28_000, 32_000])
  })

  it('ACKs in the first 100 ms: 353 at the desk, 107 at the far wall (under a third)', () => {
    const acks = radioPrimer.variants!.map((v) => txs(records(v.scenario(), 100), 'ap', 'ack').length)
    expect(acks[0]).toBe(353)
    expect(acks[3]).toBe(107)
    expect(acks[3] / acks[0]).toBeLessThan(1 / 3)
  })
})

describe('radio primer: try this', () => {
  it('doubling the distance with one brick wall: −63.3, −72.3, −81.4 dBm', () => {
    const rssi = [4.5, 9, 18].map((d) =>
      linkBudget({ txDbm: 15, distanceM: d, walls: ['brick'], widthMhz: 20, mode: 'eht' }).rssiDbm)
    expect(rssi.map((r) => r.toFixed(1))).toEqual(['-63.3', '-72.3', '-81.4'])
    expect((rssi[0] - rssi[1]).toFixed(1)).toBe('9.0')
    expect((rssi[1] - rssi[2]).toFixed(1)).toBe('9.0')
  })

  it('living room with a glass wall instead of brick: −63.3 dBm, 86.0 Mbps', () => {
    const s = primerScenario(9)
    const i = s.walls.findIndex((w) => w.x1 === 6 && w.x2 === 6)
    expect(s.walls[i].material).toBe('brick')
    s.walls[i].material = 'glass'
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['glass'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-63.3')
    expect(lb.mbps).toBe(86.0)
    const data = txs(records(s, 50), 'sta-1', 'data')
    expect(data.every((r) => r.frame.mbps === 86.0)).toBe(true)
  })
})
