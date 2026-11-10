/**
 * `@noise-floor`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11-2024 says about receiver noise — the 10 dB / 5 dB assumption of the
 * clause-17 sensitivity clause, the 3 dB-per-doubling of the HE and EHT tables, ANPI and RSNI;
 * ② is this simulator's kTB + 7 dB floor and its interference rule; ③ is `radio-primer`'s own
 * scene plus one editor change of channel width. Every figure the labs and the quiz print is read
 * back out of the lesson text and compared with the engine (`noiseDbm`, the link table, the run).
 */
import { describe, it, expect } from 'vitest'
import { noiseFloor } from '../../src/course/tier1/noise-floor'
import { radioPrimer } from '../../src/course/tier1/radio-primer'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { NOISE_FIGURE_DB, PHY_MODES, noiseDbm } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { NodeCfg, Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The same run length radio-primer uses, so the four M1 lessons share one memo. */
const RUN_NS = 100 * MS

const lab = (heading: string): Lab => {
  const l = noiseFloor.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = noiseFloor.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => noiseFloor.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

const neg = (v: number, d: number): string => v.toFixed(d).replace('-', '−')
const upDbm = (s: Scenario): number => buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
const withWidth = (s: Scenario, w: number): Scenario =>
  ({ ...s, nodes: s.nodes.map((n) => ({ ...n, caps: { ...n.caps, widthMhz: w as NodeCfg['caps']['widthMhz'] } })) })
const firstData = (rs: TLRecord[]) => ofType(rs, 'TX_START').find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
const widthRuns = new Map<number, TLRecord[]>()
const widthRecs = (w: number): TLRecord[] => {
  if (!widthRuns.has(w)) widthRuns.set(w, [...new Simulation(withWidth(primerScenario(9), w)).runUntil(RUN_NS).records])
  return widthRuns.get(w)!
}

lessonShapeSuite(noiseFloor, { sameSceneAs: 'radio-primer', runNs: RUN_NS })

describe('noise-floor · the lesson', () => {
  it('is in the standard-first shape, second in M1, after radio-primer', () => {
    expect(isStandardFirst(noiseFloor)).toBe(true)
    expect(MODULES[noiseFloor.module].title).toBe('信号与链路')
    expect(noiseFloor.module).toBe(radioPrimer.module)
    expect(noiseFloor.needs).toEqual(['radio-primer'])
    expect(noiseFloor.terms!.map((t) => t.term)).toEqual(['noise floor', 'ANPI', 'SINR'])
    expect(noiseFloor.limits).toEqual([])
    expect(noiseFloor.observe).toEqual([])
    expect(noiseFloor.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and keeps the simulator’s noise model out of it', () => {
    const std = stdText()
    for (const c of ['§17.3.10.2', '§18.4.8.2', '表 27-58', '表 36-67', '§11.10.9.4', '§9.4.2.39', '§17.3.10.7']) expect(std, c).toContain(c)
    expect(std).toContain('噪声系数 10 dB，实现余量 5 dB')
    expect(std).toContain('−10 dB 到 +117 dB')
    for (const sim of ['−93.99', '−174']) expect(std, sim).not.toContain(sim)
    expect(std).not.toMatch(/(^|[^0-9.])7 dB/)
  })

  it('①: the HE BPSK 1/2 row climbs 3 dB per doubling, as the engine’s 20 MHz entry starts it', () => {
    // 「HE 在 20、40、80、160 MHz 分别是 −82、−79、−76、−73 dBm，EHT 在 320 MHz 是 −70 dBm」
    const std = stdText()
    const base = PHY_MODES.he.sensDbm[0]
    expect(base).toBe(-82)
    expect(std).toContain([0, 1, 2, 3].map((k) => neg(base + 3 * k, 0)).join('、') + ' dBm')
    expect(std).toContain(`320 MHz 是 ${neg(base + 12, 0)} dBm`)
  })

  it('marks the rows the engine does not do, and does not call them faithful', () => {
    expect(implRow('ANPI、RCPI 与 RSNI').kind).toBe('absent')
    expect(implRow('接收机噪声').kind).toBe('value')
    expect(noiseFloor.implementation!.filter((r) => r.kind !== 'faithful').length).toBeGreaterThan(3)
  })
})

describe('noise-floor · ② says what the engine does, and the engine does it', () => {
  it('the floor is kTB plus a 7 dB noise figure, −93.99 dBm at 20 MHz', () => {
    expect(NOISE_FIGURE_DB).toBe(7)
    expect(noiseDbm(20)).toBeCloseTo(-174 + 10 * Math.log10(20e6) + 7, 12)
    const sim = implRow('接收机噪声').sim
    expect(sim).toContain(`+ ${NOISE_FIGURE_DB} dB`)
    expect(sim).toContain(`N = ${neg(noiseDbm(20), 2)} dBm`)
    expect(noiseFloor.why).toContain(`${neg(noiseDbm(20), 2)} dBm`)
  })

  it('each doubling of the width adds 3.01 dB', () => {
    const step = noiseDbm(40) - noiseDbm(20)
    expect(implRow('噪声随带宽').sim).toContain(`${step.toFixed(2)} dB`)
    expect(noiseFloor.why).toContain(`升高 ${step.toFixed(2)} dB`)
    expect(noiseFloor.why).toContain(`SNR 降低 ${(noiseDbm(160) - noiseDbm(20)).toFixed(2)} dB`)
  })
})

describe('noise-floor · ③ every figure the labs print is the run', () => {
  it('lab 1: one floor under four places, and the ratio between them', () => {
    const l = lab('一个噪声地板，四个位置')
    const rows = tableOf(l, '同一噪声地板，四个位置').rows
    const snrs: string[] = []
    PRIMER_DISTANCES.forEach((_d, i) => {
      const s = noiseFloor.variants![i].scenario()
      expect(s.nodes.every((n) => n.caps.widthMhz === 20)).toBe(true)
      const [, rssi, floor, snr, rate] = rows[i]
      expect(rssi).toBe(`${neg(upDbm(s), 1)} dBm`)
      expect(floor).toBe(`${neg(noiseDbm(20), 2)} dBm`)
      expect(snr).toBe(`${(upDbm(s) - noiseDbm(20)).toFixed(1)} dB`)
      snrs.push((upDbm(s) - noiseDbm(20)).toFixed(1))
      expect(rate).toBe(`${firstData(runOf(noiseFloor, i, RUN_NS)).frame.mbps.toFixed(1)} Mb/s`)
    })
    expect(l.expect).toContain(`噪声地板都是 ${neg(noiseDbm(20), 2)} dBm`)
    expect(l.expect).toContain(`SNR 依次是 ${snrs.join('、')} dB`)
  })

  it('lab 2: widening the living-room channel to 40, 80 and 160 MHz', () => {
    const l = lab('信道加宽，噪声地板升高')
    expect(l.variant).toBe(2)
    const rows = tableOf(l, '客厅那台笔记本，四种带宽').rows
    const widths = [20, 40, 80, 160]
    const rx = upDbm(primerScenario(9))
    widths.forEach((w, i) => {
      const [width, floor, snr, mcs] = rows[i]
      expect(width).toBe(`${w} MHz`)
      expect(upDbm(withWidth(primerScenario(9), w))).toBe(rx)
      expect(floor).toBe(`${neg(noiseDbm(w), 2)} dBm`)
      expect(snr).toBe(`${(rx - noiseDbm(w)).toFixed(1)} dB`)
      const f = firstData(widthRecs(w))
      expect(f.frame.widthMhz).toBe(w)
      expect(mcs).toBe(`MCS ${f.frame.mcs}`)
    })
    expect(l.expect).toContain(`始终是 ${neg(rx, 1)} dBm`)
    expect(l.expect).toContain(`升高 ${(noiseDbm(40) - noiseDbm(20)).toFixed(2)} dB`)
    expect(l.expect).toContain(`共升高 ${(noiseDbm(160) - noiseDbm(20)).toFixed(2)} dB`)
    expect(l.expect).toContain(`SNR 从 ${rows[0][2]} 降到 ${rows[3][2]}`)
    expect(l.expect).toContain(`MCS 从 ${firstData(widthRecs(20)).frame.mcs} 降到 ${firstData(widthRecs(160)).frame.mcs}`)
  })

  it('lab 3: one exchange alone on the air, and nothing lost in 100 ms anywhere', () => {
    const l = lab('这间屋里没有干扰')
    const rs = runOf(noiseFloor, undefined, RUN_NS)
    const d = firstData(rs)
    const ack = ofType(rs, 'TX_START').find((r) => r.node === 'ap' && r.frame.kind === 'ack')!
    const us = (ns: number) => String(Number((ns / 1000).toFixed(1)))
    expect(l.expect).toContain(`数据帧从 ${us(d.t)} 持续到 ${us(d.t + d.frame.txTimeNs)} µs`)
    expect(l.expect).toContain(`${us(ack.t - d.t - d.frame.txTimeNs)} µs 后路由器的确认帧开始，到 ${us(ack.t + ack.frame.txTimeNs)} µs 结束`)
    // nobody else in the flat: two nodes, and no transmission overlaps that exchange
    expect(noiseFloor.scenario().nodes).toHaveLength(2)
    for (const i of [undefined, 0, 1, 3]) {
      const r = runOf(noiseFloor, i, RUN_NS)
      expect(ofType(r, 'RX_FAIL'), `variant ${i}`).toEqual([])
      expect(ofType(r, 'RETRY'), `variant ${i}`).toEqual([])
    }
    expect(l.expect).toContain('接收失败 0 次，重传 0 次')
  })
})

describe('noise-floor · the quiz is the run', () => {
  it('20 → 160 MHz: the level stays, the floor rises 9.03 dB to −84.96 dBm', () => {
    const q = noiseFloor.quiz[1]
    expect(q.options[q.answer]).toContain(`升高 ${(noiseDbm(160) - noiseDbm(20)).toFixed(2)} dB 到 ${neg(noiseDbm(160), 2)} dBm`)
    const rx = upDbm(primerScenario(9))
    expect(q.explain).toContain(`SNR 从 ${(rx - noiseDbm(20)).toFixed(1)} dB 降到 ${(rx - noiseDbm(160)).toFixed(1)} dB`)
    expect(noiseFloor.quiz[0].options[noiseFloor.quiz[0].answer]).toContain('ANPI')
  })
})
