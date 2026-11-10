/**
 * `@mcs-ladder`, in the standard-first shape (2026-11-11).
 *
 * ① is what the standard specifies — the HE-MCS and EHT-MCS tables, the two BPSK-DCM rungs EHT
 * adds, that rate switching is beyond the scope (§10.6.1), and the link-adaptation feedback it
 * defines (§10.31, §26.13). ② is this simulator's rate choice. ③ is `radio-primer`'s scene plus
 * the far wall at 12 dBm. Every figure the lesson prints is read back out of its own text and
 * compared with `PHY_MODES`, `reqSinrDb`, `mcsForRssi`, the link table and the run.
 *
 * The lesson is imported as `mcsLadderLesson` because `mcsLadder` is the widget model's function
 * (tests/course/prose-readback.test.ts reads that alias out of this import).
 */
import { describe, it, expect } from 'vitest'
import { mcsLadder as mcsLadderLesson } from '../../src/course/tier1/mcs-ladder'
import { primerScenario } from '../../src/course/tier1/radioLink'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { mcsLadder } from '../../src/course/widgetModel'
import {
  PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb,
} from '../../src/engine/phy'
import { FAILURES_TO_STEP_DOWN } from '../../src/engine/rate'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 100 * MS
const L = mcsLadderLesson

const lab = (heading: string): Lab => {
  const l = L.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = L.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => L.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

const neg = (v: number, d: number): string => v.toFixed(d).replace('-', '−')
const db2 = (v: number): string => `${v.toFixed(2)} dB`
const upDbm = (s: Scenario): number => buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
const firstData = (rs: TLRecord[]) => ofType(rs, 'TX_START').find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
const us1 = (ns: number): string => `${(ns / 1000).toFixed(1)} µs`
const RATE: Record<string, number> = { '1/2': 1 / 2, '3/4': 3 / 4, '2/3': 2 / 3, '5/6': 5 / 6 }
const N_SD = 234

lessonShapeSuite(L, { sameSceneAs: 'decode-thresholds', runNs: RUN_NS })

describe('mcs-ladder · the lesson', () => {
  it('is in the standard-first shape, fourth in M1', () => {
    expect(isStandardFirst(L)).toBe(true)
    expect(MODULES[L.module].title).toBe('信号与链路')
    expect(L.needs).toEqual(['decode-thresholds'])
    expect(L.terms!.map((t) => t.term)).toEqual(['MCS', 'OFDM'])
    expect(L.limits).toEqual([])
    expect(L.observe).toEqual([])
    expect(L.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and keeps the selection algorithm out of the standard', () => {
    const std = stdText()
    for (const c of ['§27.5', '表 27-86', '§36.5.6', '表 36-76', '表 36-67', '表 36-87', '§10.6.1', '§10.31', '§26.13']) expect(std, c).toContain(c)
    expect(std).toContain('不在标准范围之内')
    expect(std).toContain(`N_SD = ${N_SD}`)
    for (const sim of ['3 dB', '90.99', '全知']) expect(std, sim).not.toContain(sim)
  })

  it('①: the six rungs are the engine’s, and N_DBPS = N_SD × N_BPSCS × R holds on every row', () => {
    const t = tableOf(L.standard!, '20 MHz、单空间流、0.8 µs 保护间隔，十四级中的六级')
    expect(t.rows.map((r) => r[0])).toEqual(['0', '1', '3', '7', '10', '13'])
    for (const [mcs, , r, nbpscs, ndbps, rate, sens] of t.rows) {
      const i = Number(mcs)
      expect(Number(ndbps), mcs).toBe(PHY_MODES.eht.ndbps[i])
      expect(N_SD * Number(nbpscs) * RATE[r]).toBeCloseTo(Number(ndbps), 9)
      expect(rate, mcs).toBe(`${PHY_MODES.eht.mbps[i].toFixed(1)} Mb/s`)
      expect(sens, mcs).toBe(`${neg(PHY_MODES.eht.sensDbm[i], 0)} dBm`)
    }
    // HE has twelve rungs, EHT fourteen in this engine
    expect(PHY_MODES.he.sensDbm).toHaveLength(12)
    expect(PHY_MODES.eht.sensDbm).toHaveLength(14)
    expect(stdText()).toContain('HE 有 MCS 0 到 11')
  })

  it('the why’s 36 dB is the span of the EHT ladder', () => {
    const s = PHY_MODES.eht.sensDbm
    expect(L.why).toContain(`高 ${s[s.length - 1] - s[0]} dB`)
    expect(L.why).toContain(`${N_SD} 个数据子载波`)
  })

  it('marks what differs and what is absent', () => {
    expect(implRow('到达电平从哪里来').kind).toBe('differs')
    expect(implRow('EHT 的 MCS 14、15').kind).toBe('absent')
    expect(implRow('MCS 反馈（MRQ、MFB、HLA）').kind).toBe('absent')
    expect(implRow('MCS 表').kind).toBe('faithful')
  })
})

describe('mcs-ladder · ② says what the engine does, and the engine does it', () => {
  it('the selection keeps 3 dB above the required SINR, which is the sensitivity plus 90.99 dB', () => {
    expect(RATE_MARGIN_DB).toBe(3)
    const sim = implRow('选级算法').sim
    expect(sim).toContain(`所需 SINR + ${RATE_MARGIN_DB} dB ≤ SNR`)
    expect(sim).toContain(`灵敏度 + ${(-noiseDbm(20, 10)).toFixed(2)} dB`)
  })

  it('the failure-driven step is two failures down, ten successes up', () => {
    expect(FAILURES_TO_STEP_DOWN).toBe(2)
    expect(implRow('失败之后').sim).toContain('连续两次失败降一级，连续十次成功升一级')
    for (let i = 0; i < 4; i++) expect(ofType(runOf(L, i, RUN_NS), 'RX_FAIL')).toEqual([])
  })

  it('at 20 MHz the arithmetic and the look-up shortcut pick the same rung, at every level', () => {
    for (let rssi = -95; rssi <= -30; rssi += 0.25) {
      const s = PHY_MODES.eht.sensDbm
      let lookup = 0
      for (let i = 0; i < s.length; i++) if (s[i] <= rssi) lookup = i
      expect(mcsForRssi('eht', rssi), `${rssi}`).toBe(lookup)
    }
  })
})

describe('mcs-ladder · ③ every figure the labs print is the run', () => {
  it('lab 1: four places, four rungs, and the airtime of the same frame', () => {
    const l = lab('四个位置，四个等级')
    const rows = tableOf(l.blocks!, '同一个 1530 字节帧，按位置').rows
    const air: number[] = []
    rows.forEach((row, i) => {
      const s = L.variants![i].scenario()
      const f = firstData(runOf(L, i, RUN_NS))
      const rx = upDbm(s)
      expect(f.frame.bytes).toBe(1530)
      expect(row[1]).toBe(`${neg(rx, 1)} dBm`)
      expect(row[2]).toBe(`${(rx - noiseDbm(20)).toFixed(1)} dB`)
      expect(row[3]).toBe(String(f.frame.mcs))
      expect(f.frame.mcs).toBe(mcsForRssi('eht', rx))
      expect(row[4]).toBe(db2(reqSinrDb('eht', f.frame.mcs!) + RATE_MARGIN_DB))
      expect(row[5]).toBe(us1(f.frame.txTimeNs))
      air.push(f.frame.txTimeNs)
    })
    expect(l.expect).toContain(`依次选到 MCS ${rows.map((r) => r[3]).join('、')}`)
    expect(l.expect).toContain(`从 ${rows[0][5]} 增加到 ${rows[3][5]}，约为 ${(air[3] / air[0]).toFixed(1)} 倍`)
    expect(L.why).toContain(`下降${['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][Number(rows[0][3]) - Number(rows[3][3])]}级`)
  })

  it('lab 2: the living room, rung by rung, and the widget marking it', () => {
    const l = lab('客厅：逐级检查')
    const rows = tableOf(l.blocks!, '客厅那台笔记本的计算过程').rows
    const rx = upDbm(L.scenario())
    const snr = rx - noiseDbm(20)
    const f = firstData(runOf(L, undefined, RUN_NS))
    const m = f.frame.mcs!
    expect(rows[0][1]).toBe(`${neg(rx, 1)} dBm`)
    expect(rows[1][1]).toBe(`${neg(noiseDbm(20), 2)} dBm`)
    expect(rows[2][1]).toBe(`${snr.toFixed(1)} dB`)
    expect(rows[3][0]).toBe(`MCS ${m} 的要求加余量`)
    expect(rows[3][1]).toBe(`${reqSinrDb('eht', m).toFixed(2)} + 3 = ${db2(reqSinrDb('eht', m) + 3)} ✓`)
    expect(rows[4][0]).toBe(`MCS ${m + 1} 的要求加余量`)
    expect(rows[4][1]).toBe(`${reqSinrDb('eht', m + 1).toFixed(2)} + 3 = ${db2(reqSinrDb('eht', m + 1) + 3)} ✗`)
    expect(snr).toBeGreaterThanOrEqual(reqSinrDb('eht', m) + 3)
    expect(snr).toBeLessThan(reqSinrDb('eht', m + 1) + 3)
    expect(rows[5][1]).toBe(`MCS ${m}`)
    expect(l.expect).toContain(`使用 MCS ${m}，${f.frame.mbps.toFixed(1)} Mb/s`)
    const w = l.blocks!.find((b) => b.kind === 'widget') as Extract<Block, { kind: 'widget' }>
    expect(w.widget).toBe('mcsLadder')
    expect(w.params!.snrDb).toBe(Math.floor(snr * 2) / 2)
    // the widget lights the same top rung the run uses
    const lit = mcsLadder('eht').filter((r) => Number(w.params!.snrDb) >= r.reqSinrDb + RATE_MARGIN_DB)
    expect(lit[lit.length - 1].mcs).toBe(m)
  })

  it('lab 3: 3 dB less transmit power at the far wall', () => {
    const l = lab('把发射功率（transmit power）降低 3 dB')
    expect(l.variant).toBe(3)
    const rows = tableOf(l.blocks!, '远端墙边，两种发射功率').rows
    const at = (p: number): Scenario => {
      const s = primerScenario(14)
      return { ...s, nodes: s.nodes.map((n) => (n.id === 'sta-1' ? { ...n, txPowerDbm: p } : n)) }
    }
    ;[15, 12].forEach((p, i) => {
      const s = at(p)
      const rx = upDbm(s)
      const f = firstData([...new Simulation(s).runUntil(10 * MS).records])
      expect(rows[i][0]).toBe(`${p} dBm`)
      expect(rows[i][1]).toBe(`${neg(rx, 1)} dBm`)
      expect(rows[i][2]).toBe(`${(rx - noiseDbm(20)).toFixed(1)} dB`)
      expect(rows[i][3]).toBe(String(f.frame.mcs))
      expect(rows[i][4]).toBe(us1(f.frame.txTimeNs))
    })
    expect(l.expect).toContain(`降到 ${rows[1][1]}，SNR ${rows[1][2]} 不再满足 MCS ${rows[0][3]} 的 ${db2(reqSinrDb('eht', Number(rows[0][3])) + 3)}`)
    expect(l.expect).toContain(`从 ${rows[0][4]} 增加到 ${rows[1][4]}`)
  })
})

describe('mcs-ladder · the quiz is the run', () => {
  it('the airtime question, and the −73 dBm shortcut', () => {
    const q2 = L.quiz[1]
    const desk = firstData(runOf(L, 0, RUN_NS)), far = firstData(runOf(L, 3, RUN_NS))
    expect(q2.q).toContain(`只要 ${us1(desk.frame.txTimeNs)}`)
    expect(q2.q).toContain(`却要 ${us1(far.frame.txTimeNs)}`)
    expect(q2.explain).toContain(`使用 MCS ${far.frame.mcs} 而不是 MCS ${desk.frame.mcs}`)
    expect(q2.explain).toContain(`从 ${PHY_MODES.eht.ndbps[desk.frame.mcs!]} 降到 ${PHY_MODES.eht.ndbps[far.frame.mcs!]}`)
    const q3 = L.quiz[2]
    expect(mcsForRssi('eht', -73)).toBe(3)
    expect(q3.options[q3.answer]).toContain(`灵敏度 ${neg(PHY_MODES.eht.sensDbm[3], 0)} dBm`)
    expect(q3.options[q3.answer]).toContain(`MCS 4 要 ${neg(PHY_MODES.eht.sensDbm[4], 0)} dBm`)
    const q1 = L.quiz[0]
    expect(q1.options[q1.answer]).toContain(`${PHY_MODES.eht.mbps[3].toFixed(1)} Mb/s`)
  })
})
