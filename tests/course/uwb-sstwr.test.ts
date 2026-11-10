/**
 * `@uwb-sstwr`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024's SS-TWR (§10.29.1.2.2, §10.29.1.6, §10.32.4); ② says what this
 * simulator does with each point, and the tests below check that the engine does it; ③'s four runs
 * print figures, and every one of them is read back out of the lesson's own text here and compared
 * with a run — so editing a number in the lesson without the engine agreeing turns this red, and so
 * does an engine change that moves a number the lesson still prints.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbSstwr } from '../../src/course/uwb/uwb-sstwr'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { counterDiff } from '../../src/uwb/clock'
import { metresToNs, rctuToMetres, ssTwrCorrected, ssTwrRaw } from '../../src/uwb/ranging'
import { C_M_PER_NS, RCTU_NS, rstuNs, uwbSsTofReportBytes } from '../../src/uwb/phy'
import { Simulation } from '../../src/engine/simulation'
import { COUNTER_BITS } from '../../src/uwb/units'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** The ring the scene is built on: every anchor is exactly this far from the tag. */
const RING_M = 3.5

lessonShapeSuite(uwbSstwr, { runNs: RUN_NS })

const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbSstwr.scenario() : uwbSstwr.variants![variant].scenario()
/** The crystal offsets of a scene, read back from the scene itself: tag, anchors, and eA − eB. */
function ppmOf(variant?: number): { tag: number; anchors: number; delta: number } {
  const nodes = scenarioOf(variant).nodes
  const tag = nodes.find((n) => n.uwb!.role === 'tag')!.uwb!.ppm!
  const anchors = nodes.find((n) => n.uwb!.role === 'anchor')!.uwb!.ppm!
  return { tag, anchors, delta: tag - anchors }
}
const BASE_PPM = ppmOf()
const SESSION = uwbSstwr.scenario().uwb!

const recs = (variant?: number): TLRecord[] => runOf(uwbSstwr, variant, RUN_NS)
const ranges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE')
const rawErr = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): number => rctuToMetres(r.tofRawRctu!) - r.trueDistM
/** The raw error ① predicts for slot i: Tprop·eA + ½·Treply·(eA − eB), in metres. */
const predictedRawErrM = (slot: number, ppm: { tag: number; delta: number }): number => {
  const tpropNs = metresToNs(RING_M)
  const treplyNs = slot * 2 * MS - tpropNs
  return (tpropNs * ppm.tag * 1e-6 + (treplyNs * ppm.delta * 1e-6) / 2) * C_M_PER_NS
}
/** 1-σ of what the correction leaves behind for an anchor answering in slot i: ½·Treply·σ_cfo. */
const residualSigmaM = (slot: number): number =>
  ((slot * 2 * MS - metresToNs(RING_M)) * SESSION.cfoNoisePpm * 1e-6) / 2 * C_M_PER_NS
const minus = (s: string): string => s.replace('-', '−')
const signed = (x: number, d: number): string => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d)
const fmt = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')

const lab = (heading: string): Lab => {
  const l = uwbSstwr.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbSstwr.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbSstwr.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'note' in b ? b.note ?? '' : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-sstwr · the lesson', () => {
  it('is in the standard-first shape, in the two-clocks module', () => {
    expect(isStandardFirst(uwbSstwr)).toBe(true)
    expect(MODULES[uwbSstwr.module].title).toBe('两个时钟')
    expect(uwbSstwr.needs).toEqual(['uwb-frame'])
    expect(uwbSstwr.terms!.map((t) => t.term)).toEqual(['crystal', 'ppm', 'clock offset', 'SS-TWR', 'Coffs'])
    expect(uwbSstwr.limits).toEqual([])
    expect(uwbSstwr.observe).toEqual([])
    expect(uwbSstwr.tryThis).toEqual([])
    for (const q of uwbSstwr.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('cites each clause it teaches in ①, and says the measurement method is not specified', () => {
    const std = stdText()
    for (const c of ['§10.29.1.2.2', '§10.29.1.6', '§10.29.1.1', '§10.29.1.3', '§10.29.1.4', '§10.32.4', '§16.4.6', '§16.4.9']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('T̂prop = ½·(Tround − Treply·(1 − Coffs))')
    expect(std).toContain('标准不规定怎样测量')
  })

  it('the figures in `why` are the scene’s and the session’s', () => {
    // 「两端相差 20 ppm、等待 2 ms 时，距离偏长约 6 m」 and 「标准差 0.2 ppm 的高斯误差」
    expect(uwbSstwr.why).toContain(`两端相差 ${BASE_PPM.delta} ppm、等待 ${rstuNs(SESSION.slotRstu) / MS} ms 时，距离偏长约 ${Math.round(predictedRawErrM(1, BASE_PPM))} m`)
    expect(uwbSstwr.why).toContain(`标准差 ${SESSION.cfoNoisePpm} ppm`)
  })

  it('② is not all faithful, and every row has a kind', () => {
    const kinds = new Set(uwbSstwr.implementation!.map((r) => r.kind))
    expect(kinds.size).toBeGreaterThan(1)
    expect(kinds.has('absent')).toBe(true)
  })
})

describe('uwb-sstwr · ② says what the engine does, and the engine does it', () => {
  it('the Poll is one 42-byte frame with ARC, RR, RDM and RRMC; each Response 21 bytes with RRMC and RRTI', () => {
    const sim = implRow('一对多的帧').sim
    const tx = ofType(recs(), 'TX_START')
    const poll = tx.find((r) => r.frame.kind === 'uwbPoll')!
    expect(sim).toContain(`${poll.frame.bytes} 字节，带 ${poll.frame.uwb!.ies!.join('、')} 四个信息单元`)
    expect(poll.frame.uwb!.ies).toHaveLength(4)
    const resp = tx.filter((r) => r.frame.kind === 'uwbResp')
    expect(resp).toHaveLength(4)
    for (const r of resp) {
      expect(sim).toContain(`${r.frame.bytes} 字节的 Response，带 ${r.frame.uwb!.ies!.join(' 与 ')}`)
    }
    // no initiator's final frame: nobody asked for a result
    expect(tx.filter((r) => r.node === 'tag-1')).toHaveLength(1)
  })

  // 2026-11-11 (W4, audit #16): standard §10.29.8.3, §10.32.4 Figure 10-235 — a responder that sets the
  // RRMC TOF Request field gets its range in the initiator's broadcast RMI report.
  it('应答方得到距离: with ssTofRequest the tag broadcasts one RMI TOF report and every anchor holds its range', () => {
    expect(implRow('应答方得到距离').kind).toBe('faithful')
    expect(implRow('应答方得到距离').sim).toContain('15 + 6N 字节')
    expect(uwbSstwr.scenario().uwb!.ssTofRequest).toBe(false)
    const s = uwbSstwr.scenario()
    const rs = [...new Simulation({ ...s, uwb: { ...s.uwb!, ssTofRequest: true } }).runUntil(RUN_NS).records]
    const tx = ofType(rs, 'TX_START')
    const anchors = tx.filter((r) => r.frame.kind === 'uwbResp')
    expect(anchors.length).toBeGreaterThan(0)
    expect(anchors.every((r) => r.frame.uwb?.tofRequest === true)).toBe(true)
    const rep = tx.filter((r) => r.frame.kind === 'uwbReport')
    expect(rep.length).toBeGreaterThan(0)
    expect(rep[0].frame.bytes).toBe(uwbSsTofReportBytes(rep[0].frame.uwb!.tofList!.length))
    const tagR = ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1')
    const ancR = ofType(rs, 'UWB_RANGE').filter((r) => r.node !== 'tag-1')
    expect(ancR).toHaveLength(tagR.length)
    for (const a of ancR) {
      const t = tagR.find((x) => x.peer === a.node && x.block === a.block && x.round === a.round)!
      expect(a.tofRctu).toBe(Math.round(t.tofRctu))
    }
  })

  it('the range is the corrected formula; the raw value is the uncorrected one', () => {
    const ts = ofType(recs(), 'UWB_TS')
    const txPoll = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx')!
    for (const r of ranges()) {
      const rxPoll = ts.find((x) => x.node === r.peer && x.dir === 'rx')!
      const txResp = ts.find((x) => x.node === r.peer && x.dir === 'tx')!
      const rxResp = ts.find((x) => x.node === 'tag-1' && x.dir === 'rx' && x.peer === r.peer)!
      const treply = counterDiff(txResp.counter, rxPoll.counter)
      const tround = counterDiff(rxResp.counter, txPoll.counter)
      expect(ssTwrRaw(tround, treply)).toBe(r.tofRawRctu)
      const coffs = (2 * r.tofRctu - tround + treply) / treply
      expect(ssTwrCorrected(tround, treply, coffs)).toBeCloseTo(r.tofRctu, 9)
      // Coffs is the crystals' own offset, inside a few σ of the model's residual
      expect(Math.abs(coffs * 1e6 - (BASE_PPM.anchors - BASE_PPM.tag)), r.peer).toBeLessThan(4 * SESSION.cfoNoisePpm)
    }
  })

  it('the Coffs error is the session’s 0.2 ppm, the timestamp noise its 100 ps', () => {
    expect(implRow('Coffs 的误差').sim).toContain(`标准差取 ${SESSION.cfoNoisePpm} ppm`)
    expect(implRow('接收时间戳').sim).toContain(`标准差 ${SESSION.tsNoisePs} ps`)
  })

  it('the crystals are the scene’s own: +10 / −10, and 0 and ±1 in the variants', () => {
    const sim = implRow('晶振').sim
    expect(sim).toContain(`手机 +${BASE_PPM.tag} ppm、锚点 ${minus(String(BASE_PPM.anchors))} ppm`)
    expect(ppmOf(0)).toEqual({ tag: 0, anchors: 0, delta: 0 })
    expect(ppmOf(1).tag).toBe(1)
    expect(ppmOf(1).anchors).toBe(-1)
    expect(sim).toContain('两个变体分别取 0 与 ±1 ppm')
  })

  it('anchors transmit on the slot boundary, so Treply is whole slots minus one flight', () => {
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    resp.forEach((r, i) => expect(r.t, r.node).toBe((i + 1) * rstuNs(SESSION.slotRstu)))
  })

  it('the slot is 2400 RSTU, 2 ms; the counter 40 bits of 15.65 ps', () => {
    expect(implRow('时隙长度').sim).toContain(`${SESSION.slotRstu} RSTU`)
    expect(rstuNs(SESSION.slotRstu)).toBe(2 * MS)
    expect(implRow('测距计数器').sim).toContain(`${COUNTER_BITS} 位`)
    expect((RCTU_NS * 1000).toFixed(2)).toBe('15.65')
    expect(stdText()).toContain('约 15.65 ps')
  })
})

describe('uwb-sstwr · ③ every figure the labs print is the run', () => {
  it('the jump labels quote the run’s own raw errors', () => {
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    const labelled = uwbSstwr.jumps.flatMap((j) => {
      const m = /第(.)次测距：raw 偏长 (\d+) m/.exec(j.label)
      return m === null ? [] : [[cn(m[1]!), Number(m[2]), j] as const]
    })
    expect(labelled).toHaveLength(2)
    for (const [nth, over, j] of labelled) {
      expect(Math.round(rawErr(ranges()[nth - 1])), j.label).toBe(over)
      expect(ranges().findIndex(j.find), j.label).toBe(nth - 1)
    }
  })

  it('lab 1: four raw errors, against the formula of ①, and the figure', () => {
    const l = lab('四个锚点，四个 raw 误差')
    const rows = tableOf(l, '四个锚点，四个误差').rows
    const rs = ranges()
    expect(rows).toHaveLength(4)
    rows.forEach((row, i) => {
      const r = rs[i]
      expect(row[0]).toBe(r.peer)
      expect(row[1]).toBe(`${(i + 1) * 2} ms − Tprop`)
      expect(row[2]).toBe(`${predictedRawErrM(i + 1, BASE_PPM).toFixed(1)} m`)
      expect(row[3]).toBe(`${rctuToMetres(r.tofRawRctu!).toFixed(2)} m`)
      expect(row[4]).toBe(`${rawErr(r).toFixed(2)} m`)
      expect(FIG.rawErrM[i]).toBe(`+${rawErr(r).toFixed(2)} m`)
    })
    // 「9.51、15.47、21.49、27.42 m」 and 「在 3.41 到 3.51 m 之间」
    expect(l.expect).toContain(`${rs.map((r) => rctuToMetres(r.tofRawRctu!).toFixed(2)).join('、')} m`)
    const d = rs.map((r) => r.distM)
    expect(l.expect).toContain(`在 ${Math.min(...d).toFixed(2)} 到 ${Math.max(...d).toFixed(2)} m 之间`)
    // 「约增加 6 m」: every step of the raw ramp rounds to 6
    for (let i = 1; i < 4; i++) expect(Math.round(rawErr(rs[i]) - rawErr(rs[i - 1]))).toBe(6)
    // the meaning's arithmetic: 2 ms → 1 ms × 20 ppm = 20 ns ≈ 6 m
    expect(BASE_PPM.delta).toBe(20)
    expect(l.meaning).toContain(`乘以 ${BASE_PPM.delta} ppm 得 20 ns`)
    expect(Math.round(20 * C_M_PER_NS)).toBe(6)
  })

  it('lab 1’s figure: every instant is the run’s own', () => {
    const b = lab('四个锚点，四个 raw 误差').blocks!.find((x): x is Extract<Block, { kind: 'diagram' }> => x.kind === 'diagram')!
    const fig = b.spec as TimingSpec
    expect(fig.kind).toBe('timing')
    const tx = ofType(recs(), 'TX_START')
    const poll = tx.find((r) => r.frame.kind === 'uwbPoll')!
    expect([FIG.pollTx * 1000, FIG.pollTxEnd * 1000]).toEqual([poll.t, poll.t + poll.frame.txTimeNs])
    const resp = tx.filter((r) => r.frame.kind === 'uwbResp')
    resp.forEach((r, i) => {
      expect(r.t).toBe((i + 1) * FIG.slotUs * 1000)
      expect(r.frame.txTimeNs / 1000).toBeCloseTo(FIG.respUs, 3)
      expect(fig.lanes[i + 1].spans[0].toUs * 1000).toBe(r.t)
    })
    expect(Math.ceil(metresToNs(RING_M)) / 1000).toBeCloseTo(FIG.flightUs, 6)
    expect(b.caption).toContain(`${metresToNs(RING_M).toFixed(3)} ns`)
    const round = ofType(recs(), 'UWB_ROUND')[0]
    expect(FIG.windowUs * 1000).toBeGreaterThan(4 * FIG.slotUs * 1000 + FIG.respUs * 1000)
    expect(FIG.windowUs * 1000).toBeLessThan(round.slots * round.slotNs)
  })

  it('lab 2: what the correction leaves', () => {
    const l = lab('修正之后留下的误差')
    const rows = tableOf(l, '修正之后留下的').rows
    const rs = ranges()
    rows.forEach((row, i) => {
      expect(row[0]).toBe(rs[i].peer)
      expect(row[1]).toBe(`${(i + 1) * 2} ms`)
      expect(row[2]).toBe(`${(residualSigmaM(i + 1) * 100).toFixed(1)} cm`)
      expect(row[3]).toBe(`${signed((rs[i].distM - rs[i].trueDistM) * 100, 1)} cm`)
    })
    const d = rs.map((r) => r.distM.toFixed(2))
    expect(l.expect).toContain(`${d.slice(0, 3).join('、')} 与 ${d[3]} m`)
    // 「每多等 1 ms 增加 3.0 cm」
    expect(((residualSigmaM(2) - residualSigmaM(1)) / 2 * 100).toFixed(1)).toBe('3.0')
    expect(l.expect).toContain('每多等 1 ms 增加 3.0 cm')
    expect(l.meaning).toContain(`${SESSION.cfoNoisePpm} ppm`)
    // the quiz quotes slot 4's and slot 1's σ
    expect(uwbSstwr.quiz[2].options[1]).toContain(`1σ 为 ${(residualSigmaM(4) * 100).toFixed(1)} cm`)
    expect(uwbSstwr.quiz[2].options[1]).toContain(`锚点 1 只有 ${(residualSigmaM(1) * 100).toFixed(1)} cm`)
  })

  it('lab 3: the same ramp under three crystals', () => {
    const l = lab('三种晶振')
    const rows = tableOf(l, '同样的线性增长，三种晶振').rows
    const cases: [number | undefined, number][] = [[0, 0], [1, 1], [undefined, 2]]
    for (const [variant, at] of cases) {
      const row = rows[at]
      const ppm = ppmOf(variant)
      expect(row[1]).toBe(`${ppm.delta} ppm`)
      const r = ranges(variant)
      const cellOf = (x: number): string => Math.abs(x) < 0.1 ? `${signed(x * 100, 1)} cm` : `${x.toFixed(2)} m`
      expect(row[2], `variant ${variant}`).toBe(cellOf(rawErr(r[0])))
      expect(row[3], `variant ${variant}`).toBe(cellOf(rawErr(r[3])))
    }
    expect(rows[1][0]).toContain(`±${ppmOf(1).tag} ppm`)
    expect(rows[2][0]).toContain(`±${BASE_PPM.tag} ppm`)
    // 「每个时隙约 0.6 m」
    const t = ranges(1)
    expect(((rawErr(t[3]) - rawErr(t[0])) / 3).toFixed(1)).toBe('0.6')
    expect(l.expect).toContain('每个时隙约 0.6 m')
    expect(uwbSstwr.variants![l.variant!].label).toBe('理想晶振')
  })

  it('lab 4: anchor 1, step by step, is the run’s own four counters', () => {
    const rows = tableOf(lab('锚点 1 的逐步计算'), '锚点 1 的逐步计算').rows
    const ts = ofType(recs(), 'UWB_TS')
    const txPoll = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx' && r.frameKind === 'uwbPoll')!
    const rxPoll = ts.find((r) => r.node === 'anchor-1' && r.dir === 'rx' && r.frameKind === 'uwbPoll')!
    const txResp = ts.find((r) => r.node === 'anchor-1' && r.dir === 'tx' && r.frameKind === 'uwbResp')!
    const rxResp = ts.find((r) => r.node === 'tag-1' && r.dir === 'rx' && r.peer === 'anchor-1')!
    const treply = counterDiff(txResp.counter, rxPoll.counter)
    const tround = counterDiff(rxResp.counter, txPoll.counter)
    const r = ranges()[0]
    const coffs = (2 * r.tofRctu - tround + treply) / treply
    const raw = ssTwrRaw(tround, treply)
    expect(rows.map((x) => x[1])).toEqual([
      fmt(txPoll.counter), fmt(rxPoll.counter), fmt(txResp.counter), fmt(treply),
      fmt(rxResp.counter), fmt(tround), minus(`${(coffs * 1e6).toFixed(2)} ppm`),
      `${raw} · ${rctuToMetres(raw).toFixed(2)} m`,
      `${r.tofRctu.toFixed(1)} · ${r.distM.toFixed(2)} m`,
    ])
    const l = lab('锚点 1 的逐步计算')
    expect(l.expect).toContain(`多 ${tround - treply} 个计数单位`)
    expect(l.expect).toContain(`不计 Coffs 得 ${rctuToMetres(raw).toFixed(2)} m`)
    expect(l.expect).toContain(`计入 ${minus((coffs * 1e6).toFixed(2))} ppm 的 Coffs 得 ${r.distM.toFixed(2)} m，真值 ${r.trueDistM.toFixed(2)} m`)
    expect(l.meaning).toContain(minus(`${(coffs * 1e6).toFixed(2)} ppm`))
    expect(l.meaning).toContain(`设定的 ${BASE_PPM.delta} ppm 之差`)
  })
})
