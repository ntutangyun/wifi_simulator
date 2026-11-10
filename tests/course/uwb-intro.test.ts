/**
 * `@uwb-intro`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites; ② row by row against the engine; ③ figure by figure:
 * every number the labs print is read back out of the lesson text and compared with a run, so
 * editing a figure without the engine agreeing turns this red, and so does an engine change that
 * moves a figure the lesson still prints.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbIntro, uwbIntroScenario, uwbIntroTiming } from '../../src/course/uwb/uwb-intro'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import {
  COUNTER_BITS, COUNTER_MOD, C_M_PER_NS, RCTU_NS, RCTU_PS, RSTU_NS, RRTI_IE_BYTES, TS_SIGMA_MAX,
  UWB_CHIP_HZ, UWB_CHIP_NS, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM, uwbRespBytes,
} from '../../src/uwb/phy'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS

const recs = (variant?: number): TLRecord[] => runOf(uwbIntro, variant, RUN_NS)

lessonShapeSuite(uwbIntro, { runNs: RUN_NS })

const lab = (heading: string): Lab => {
  const l = uwbIntro.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbIntro.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
/** A figure printed with spaces as thousands separators, back to a number. */
const num = (s: string): number => Number(s.replace(/ /g, ''))

describe('uwb-intro · the lesson', () => {
  it('opens the UWB track, in the standard-first shape', () => {
    expect(isStandardFirst(uwbIntro)).toBe(true)
    expect(MODULES[uwbIntro.module].title).toBe('飞行时间')
    expect(uwbIntro.needs).toEqual(['radio-primer', 'frame-anatomy'])
    // a track's first lesson introduces at most four words
    expect(uwbIntro.terms!.map((t) => t.term)).toEqual(['UWB', 'anchor', 'RMARKER', 'RCTU'])
    expect(uwbIntro.limits).toEqual([])
    expect(uwbIntro.observe).toEqual([])
    expect(uwbIntro.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①', () => {
    const std = uwbIntro.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'note' in b ? b.note ?? '' : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.29.1.1', '§10.29.1.2.1', '§10.29.1.2.2', '§10.29.1.3', '§10.29.1.4', '§10.29.1.7', '§10.29.6.1', '§10.29.6.3', '§10.29.6.4', '§10.29.6.5']) {
      expect(std, clause).toContain(clause)
    }
    // ① speaks of the standard only: none of this simulator's own values appear in it
    for (const simValue of ['2 ms', '100 ps', '0.2 ppm', '40 位', 'tag-1', 'anchor-1']) expect(std, simValue).not.toContain(simValue)
  })

  it('the scenario and the variant pass the schema; one anchor and one phone at 0 ppm, 5 m and 20 m apart', () => {
    const sep = (s: Scenario): number => {
      const [a, t] = s.nodes
      return Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y, t.pos.z - a.pos.z)
    }
    for (const [s, d] of [[uwbIntro.scenario(), 5], [uwbIntro.variants![0].scenario(), 20]] as const) {
      expect(() => ScenarioSchema.parse(s)).not.toThrow()
      expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'tag'])
      expect(s.nodes.map((n) => n.uwb!.ppm)).toEqual([0, 0])
      expect(s.uwb).toMatchObject({ method: 'ss', nlos: false, replyTime: 'embedded' })
      expect(sep(s)).toBe(d)
    }
    expect(uwbIntroScenario(5)).toEqual(uwbIntro.scenario())
  })
})

describe('uwb-intro · ② says what the engine does, and the engine does it', () => {
  const rs = recs()
  const ts = ofType(rs, 'UWB_TS')

  it('RMARKER: the transmit stamp shares its TX_START instant; only receive stamps carry noise', () => {
    expect(implRow('RMARKER').kind).toBe('faithful')
    expect(ts.map((r) => `${r.node} ${r.dir}`)).toEqual(['tag-1 tx', 'anchor-1 rx', 'anchor-1 tx', 'tag-1 rx'])
    expect(ofType(rs, 'TX_START')[0].t).toBe(ts[0].t)
    expect(ofType(rs, 'TX_START')[1].t).toBe(ts[2].t)
  })

  it('the counter is 40 bits and wraps after 17.2 s', () => {
    const sim = implRow('计数器的宽度').sim
    expect(sim).toContain(`${COUNTER_BITS} 位`)
    expect(COUNTER_MOD).toBe(2 ** COUNTER_BITS)
    expect(sim).toContain(`约 ${((COUNTER_MOD * RCTU_NS) / 1e9).toFixed(1)} s 回绕`)
    expect(counterDiff(5, COUNTER_MOD - 5)).toBe(10)
  })

  it('the unit is 15.650 ps, 2⁻⁷ of the 499.2 MHz chip', () => {
    expect(UWB_CHIP_HZ).toBe(499.2e6)
    expect(RCTU_NS).toBe(UWB_CHIP_NS / 2 ** 7)
    expect(implRow('计数单位').sim).toContain(`${RCTU_PS.toFixed(3)} ps`)
  })

  it('the timestamp noise: 100 ps, scaled at low SINR at most ten times', () => {
    const sim = implRow('接收时间戳的精度').sim
    expect(uwbIntro.scenario().uwb!.tsNoisePs).toBe(100)
    expect(sim).toContain(`${uwbIntro.scenario().uwb!.tsNoisePs} ps`)
    expect(TS_SIGMA_MAX).toBe(10)
    expect(sim).toContain('最多十倍')
  })

  it('one direct path: no echo in either scene', () => {
    for (const v of [undefined, 0]) {
      expect(uwbIntro.scenario().scatterers).toBeUndefined()
      expect(ofType(recs(v), 'UWB_ECHO')).toHaveLength(0)
    }
  })

  it('embedded reply time: the Response carries RRTI and is 21 octets', () => {
    expect(implRow('回复时间的传递').sim).toContain(`共 ${uwbRespBytes('ss', 'embedded')} 字节`)
    const resp = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbResp')!
    expect(resp.frame.uwb!.ies).toContain('RRTI')
    expect(resp.frame.bytes).toBe(21)
    expect(RRTI_IE_BYTES).toBe(7)
    expect(resp.frame.uwb!.replyRctu).toBe(counterDiff(ts[2].counter, ts[1].counter))
  })

  it('the anchor answers at the top of the next 2 ms slot', () => {
    expect(implRow('应答方等多久').sim).toContain('2 ms')
    expect(Math.round(uwbIntro.scenario().uwb!.slotRstu * RSTU_NS)).toBe(2 * MS)
    expect(ts[2].t - ts[0].t).toBe(2 * MS)
  })

  it('the clock-offset correction: 0.2 ppm residual, and it moves the answer 7 cm', () => {
    const sim = implRow('时钟偏差修正').sim
    expect(sim).toContain(`${uwbIntro.scenario().uwb!.cfoNoisePpm} ppm`)
    const r = ofType(rs, 'UWB_RANGE')[0]
    const cm = Math.round((rctuToMetres(r.tofRawRctu!) - rctuToMetres(r.tofRctu)) * 100)
    expect(sim).toContain(`相差 ${cm} cm`)
  })

  it('the model constants `sources` names are the engine’s', () => {
    const src = uwbIntro.sources!.join('\n')
    expect(src).toContain(`${UWB_TX_POWER_DBM} dBm`.replace('-', '−'))
    expect(src).toContain(`${UWB_RX_SENS_DBM} dBm`.replace('-', '−'))
    expect(Math.round(uwbIntro.scenario().uwb!.blockRstu * RSTU_NS)).toBe(200 * MS)
    expect(src).toContain('200 ms')
  })
})

describe('uwb-intro · ③ every figure the labs print is the run', () => {
  const rs = recs()
  const ts = ofType(rs, 'UWB_TS')

  it('lab 1: the figure’s four spans are the run’s two transmissions and two receptions', () => {
    const spec = uwbIntroTiming()
    expect(blockOf(lab('一轮测距的四个计数值'), 'diagram', '两个时钟上的四个读数').spec).toEqual(spec)
    const tx = ofType(rs, 'TX_START')
    const rx = ofType(rs, 'RX_START')
    const lane = (i: number) => spec.lanes[i].spans.map((s) => [s.fromUs * US, s.toUs * US])
    expect(lane(0)).toEqual([[tx[0].t, tx[0].t + tx[0].frame.txTimeNs], [rx[1].t, rx[1].t + tx[1].frame.txTimeNs]])
    expect(lane(1)).toEqual([[rx[0].t, rx[0].t + tx[0].frame.txTimeNs], [tx[1].t, tx[1].t + tx[1].frame.txTimeNs]])
    // 「两帧之间约 2 ms 的等待，比要测的飞行时间大五个数量级」
    expect(Math.round(Math.log10((FIG.respTx - FIG.pollTxEnd) * US / (5 / C_M_PER_NS)))).toBe(5)
  })

  it('lab 1: the four rows are the four UWB_TS lines, counter for counter', () => {
    const rows = blockOf(lab('一轮测距的四个计数值'), 'table', '参与相减的四行').rows
    expect(rows).toHaveLength(4)
    rows.forEach(([line, counter], i) => {
      expect(fmtRecord(ts[i]).split(': counter ')[0], line).toBe(line)
      expect(num(counter), line).toBe(ts[i].counter)
    })
    const gap = ofType(rs, 'RX_START')[0].t - ofType(rs, 'TX_START')[0].t
    const e = lab('一轮测距的四个计数值').expect
    expect(e).toContain(`TX_START 在 ${ofType(rs, 'TX_START')[0].t} ns`)
    expect(e).toContain(`RX_START 在 ${gap} ns`)
  })

  it('lab 2: the subtraction’s every figure, parsed out of the formula', () => {
    const f = blockOf(lab('亲手算出距离'), 'formula', '四个计数值，两次相减')
    const m = /Tround = ([\d ]+) − ([\d ]+) = ([\d ]+)\nTreply = ([\d ]+) − ([\d ]+) = ([\d ]+)\nT̂prop = \(([\d ]+) − ([\d ]+)\) \/ 2 = (\d+) RCTU = ([\d.]+) ns = ([\d.]+) m/.exec(f.text)
    expect(m, f.text).not.toBeNull()
    const [t4, t1, tround, t3, t2, treply, a, b, tof, ns, metres] = m!.slice(1)
    expect([num(t1), num(t2), num(t3), num(t4)]).toEqual(ts.map((r) => r.counter))
    expect(num(tround)).toBe(counterDiff(ts[3].counter, ts[0].counter))
    expect(num(treply)).toBe(counterDiff(ts[2].counter, ts[1].counter))
    expect([num(a), num(b)]).toEqual([num(tround), num(treply)])
    const raw = ssTwrRaw(num(tround), num(treply))
    expect(Number(tof)).toBe(raw)
    expect(ns).toBe((raw * RCTU_NS).toFixed(2))
    expect(metres).toBe(rctuToMetres(raw).toFixed(2))
    expect(ofType(rs, 'UWB_RANGE')[0].tofRawRctu).toBe(raw)
    // the note: 「真值是 1065.7 格：读数偏大 4.3 格」
    const n = /真值是 ([\d.]+) 格：读数偏大 ([\d.]+) 格/.exec(f.note!)
    const trueRctu = 5 / C_M_PER_NS / RCTU_NS
    expect(n![1]).toBe(trueRctu.toFixed(1))
    expect(n![2]).toBe((raw - trueRctu).toFixed(1))
  })

  it('lab 2: the range line is the log’s, and the expectation reads its three distances', () => {
    const r = ofType(rs, 'UWB_RANGE')[0]
    expect(blockOf(lab('亲手算出距离'), 'formula', '测距行').text).toBe(fmtRecord(r))
    const e = lab('亲手算出距离').expect
    const m = /算出 (\d+) RCTU，即测距行里的 raw ([\d.]+) m；测距行报出的 ([\d.]+) m 是修正后的值，与 raw 相差 (\d+) cm/.exec(e)
    expect(m, e).not.toBeNull()
    expect(Number(m![1])).toBe(r.tofRawRctu)
    expect(m![2]).toBe(rctuToMetres(r.tofRawRctu!).toFixed(2))
    expect(m![3]).toBe(r.distM.toFixed(2))
    expect(Number(m![4])).toBe(Math.round((rctuToMetres(r.tofRawRctu!) - rctuToMetres(r.tofRctu)) * 100))
    expect(lab('亲手算出距离').meaning).toContain(`${uwbIntro.scenario().uwb!.cfoNoisePpm} ppm`)
  })

  it('lab 2: the units table is one chain of conversions', () => {
    const rows = blockOf(lab('亲手算出距离'), 'table', '单位换算').rows
    expect(rows[0][1]).toBe(`${UWB_CHIP_NS.toFixed(3)} ns`)
    expect(rows[1][1]).toBe(`${RCTU_PS.toFixed(3)} ps`)
    expect(rows[2][1]).toBe(`${(1 / C_M_PER_NS).toFixed(4)} ns = ${(1 / C_M_PER_NS / RCTU_NS).toFixed(1)} RCTU`)
    expect(rows[2][2]).toBe(`c = ${C_M_PER_NS} m/ns`)
    expect(rows[3][1]).toBe(`飞行 ${(rctuToMetres(1) * 1000).toFixed(1)} mm，测距 ${(rctuToMetres(1) / 2 * 1000).toFixed(1)} mm`)
  })

  it('lab 3: 17 ns and 67 ns, the flight rounded up to the 1 ns grid', () => {
    const rows = blockOf(lab('相距 20 m'), 'table', '飞行时间，以及它落在时间线的哪一格').rows
    const gaps: number[] = []
    for (const [row, v, d] of [[rows[0], undefined, 5], [rows[1], 0, 20]] as const) {
      const g = ofType(recs(v), 'RX_START')[0].t - ofType(recs(v), 'TX_START')[0].t
      gaps.push(g)
      expect(row[0]).toBe(`${d} m`)
      expect(row[1]).toBe(`${(d / C_M_PER_NS).toFixed(3)} ns`)
      expect(row[2]).toBe(`${g} ns`)
      expect(g).toBe(Math.ceil(d / C_M_PER_NS))
    }
    const r = ofType(recs(0), 'UWB_RANGE')[0]
    const e = lab('相距 20 m').expect
    expect(e).toContain(`到达间隔从 ${gaps[0]} ns 变为 ${gaps[1]} ns`)
    expect(e).toContain(`测距行报出 ${r.distM.toFixed(2)} m，真值 ${r.trueDistM.toFixed(2)} m`)
    // 「误差仍是几厘米」
    expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(0.1)
    expect(lab('相距 20 m').meaning).toContain(`${RCTU_PS.toFixed(3)} ps`)
  })

  it('the quiz figures are the units table’s', () => {
    const q = uwbIntro.quiz[1].options.join(' ')
    expect(q).toContain(`${UWB_CHIP_NS.toFixed(3)} ns`)
    expect(q).toContain(`${RCTU_PS.toFixed(3)} ps`)
    expect(q).toContain(`${(rctuToMetres(1) * 1000).toFixed(1)} mm`)
    expect(q).toContain(`约 ${(UWB_CHIP_NS * C_M_PER_NS * 100).toFixed(0)} cm`)
    expect(uwbIntro.quiz[1].explain).toContain(`${(1 / C_M_PER_NS / RCTU_NS).toFixed(1)} 格`)
  })
})
