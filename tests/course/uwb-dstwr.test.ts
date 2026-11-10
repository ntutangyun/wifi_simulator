/**
 * `@uwb-dstwr`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024's DS-TWR (§10.29.1.2.3, §10.29.1.2.4, §10.32.5); ② says what this
 * simulator does with each point — one row is `differs`: Figure 10-238 brings Treply1 back in the
 * Response's RRTI IE and Tround2 in the report's RMI IE, while this engine's Response carries no
 * RRTI and its report carries both — and the tests below check that the engine does it; ③'s four
 * runs print figures, every one of them read back out of the lesson's text here and compared with
 * a run.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbDstwr, uwbDstwrSequence } from '../../src/course/uwb/uwb-dstwr'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { dsTwr, rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import { uwbFinalBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes } from '../../src/uwb/phy'
import { C_M_PER_NS, rstuNs } from '../../src/uwb/phy'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
const RING_M = 3.5
const ANCHORS = 4

lessonShapeSuite(uwbDstwr, { runNs: RUN_NS })

const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbDstwr.scenario() : uwbDstwr.variants![variant].scenario()
const SESSION = uwbDstwr.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

/**
 * 1-σ of one DS-TWR range from the session's timestamp noise. Three noisy receive stamps enter
 * the result — the anchor's of the Poll, the phone's of the Response, the anchor's of the Final —
 * with sensitivities r2/S, ½ and r1/S, where r1 and r2 are the two reply times and S their total.
 */
function dsSigmaM(slot: number): number {
  const r1 = slot * PLAN.slotNs
  const r2 = (ANCHORS + 1 - slot) * PLAN.slotNs
  const s = 2 * (r1 + r2)
  return Math.hypot(r2 / s, 0.5, r1 / s) * (SESSION.tsNoisePs / 1000) * C_M_PER_NS
}

const recs = (variant?: number): TLRecord[] => runOf(uwbDstwr, variant, RUN_NS)
const ranges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE')
const tagRanges = (variant?: number) => ranges(variant).filter((r) => r.node === 'tag-1')
const anchorRanges = (variant?: number) => ranges(variant).filter((r) => r.node.startsWith('anchor'))

function stamp(rs: TLRecord[], node: string, dir: 'tx' | 'rx', frameKind: string, peer?: string): number {
  const r = ofType(rs, 'UWB_TS').find((x) =>
    x.node === node && x.dir === dir && x.frameKind === frameKind && (peer === undefined || x.peer === peer))
  if (!r) throw new Error(`no ${dir} ${frameKind} stamp on ${node}`)
  return r.counter
}
function fourTimes(anchorId: string, rs: TLRecord[] = recs()) {
  const txPoll = stamp(rs, 'tag-1', 'tx', 'uwbPoll')
  const txFinal = stamp(rs, 'tag-1', 'tx', 'uwbFinal')
  const rxResp = stamp(rs, 'tag-1', 'rx', 'uwbResp', anchorId)
  const rxPoll = stamp(rs, anchorId, 'rx', 'uwbPoll')
  const txResp = stamp(rs, anchorId, 'tx', 'uwbResp')
  const rxFinal = stamp(rs, anchorId, 'rx', 'uwbFinal')
  return {
    txPoll, rxPoll, txResp, rxResp, txFinal, rxFinal,
    tround1: counterDiff(rxResp, txPoll), treply1: counterDiff(txResp, rxPoll),
    tround2: counterDiff(rxFinal, txResp), treply2: counterDiff(txFinal, rxResp),
  }
}
const halves = (anchorId: string, rs: TLRecord[] = recs()): [number, number] => {
  const t = fourTimes(anchorId, rs)
  return [rctuToMetres(ssTwrRaw(t.tround1, t.treply1)), rctuToMetres(ssTwrRaw(t.tround2, t.treply2))]
}
const m2 = (x: number): string => `${x.toFixed(2).replace('-', '−')} m`
const signedCm = (m: number): string => `${m >= 0 ? '+' : '−'}${Math.abs(m * 100).toFixed(1)} cm`
const fmt = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')
const ms3 = (ns: number): string => `${(ns / 1e6).toFixed(3)} ms`

const lab = (heading: string): Lab => {
  const l = uwbDstwr.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbDstwr.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbDstwr.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'note' in b ? b.note ?? '' : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-dstwr · the lesson', () => {
  it('is in the standard-first shape, in the two-clocks module', () => {
    expect(isStandardFirst(uwbDstwr)).toBe(true)
    expect(MODULES[uwbDstwr.module].title).toBe('两个时钟')
    expect(uwbDstwr.needs).toEqual(['uwb-sstwr'])
    expect(uwbDstwr.terms!.map((t) => t.term)).toEqual(['DS-TWR', 'Final', 'Report', 'RMI'])
    expect(uwbDstwr.limits).toEqual([])
    expect(uwbDstwr.observe).toEqual([])
    expect(uwbDstwr.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, including that the report needs a request', () => {
    const std = stdText()
    for (const c of ['§10.29.1.2.3', '§10.29.1.2.4', '§10.32.5', '§10.29.8.1', '§10.29.8.3', '§10.29.8.4', '§10.32.2']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('T̂prop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)')
    expect(std).toContain('不要求两段回复时延相等')
    expect(std).toContain('只在发起方请求时')
  })

  it('② carries a `differs` row and an `absent` row', () => {
    const kinds = uwbDstwr.implementation!.map((r) => r.kind)
    expect(kinds).toContain('differs')
    expect(kinds).toContain('absent')
  })
})

describe('uwb-dstwr · ② says what the engine does, and the engine does it', () => {
  it('the round is Poll, four Responses, Final, four Reports, with the IEs ② names', () => {
    const tx = ofType(recs(), 'TX_START')
    expect(tx.map((r) => r.frame.kind)).toEqual(['uwbPoll', 'uwbResp', 'uwbResp', 'uwbResp', 'uwbResp', 'uwbFinal', 'uwbReport', 'uwbReport', 'uwbReport', 'uwbReport'])
    const sim = implRow('一轮的帧').sim
    const ies = (k: string): string[] => tx.find((r) => r.frame.kind === k)!.frame.uwb!.ies!
    expect(sim).toContain(`带 ${ies('uwbPoll').join('、')}）`)
    expect(sim).toContain(`Response（带 ${ies('uwbResp').join('、')}）`)
    expect(sim).toContain(`Final（带 ${ies('uwbFinal').join(' 与 ')}）`)
    expect(sim).toContain(`Report（带 ${ies('uwbReport').join('、')}）`)
  })

  it('the Final is 18 + 12A bytes, 66 here', () => {
    expect(uwbFinalBytes(0)).toBe(18)
    expect(uwbFinalBytes(1) - uwbFinalBytes(0)).toBe(12)
    const final = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!
    expect(final.frame.bytes).toBe(uwbFinalBytes(ANCHORS))
    expect(implRow('Final 的内容').sim).toContain(`Final 为 ${uwbFinalBytes(0)} + ${uwbFinalBytes(1) - uwbFinalBytes(0)}A 字节，本课 ${final.frame.bytes} 字节`)
  })

  it('the differs row: the Response carries no RRTI, the Report one RMI with both times', () => {
    const tx = ofType(recs(), 'TX_START')
    const resp = tx.find((r) => r.frame.kind === 'uwbResp')!
    const rep = tx.find((r) => r.frame.kind === 'uwbReport')!
    expect(resp.frame.uwb!.ies).not.toContain('RRTI')
    expect(rep.frame.uwb!.ies).toEqual(['RMI'])
    const sim = implRow('回报给发起方的两段时间').sim
    expect(sim).toContain(`Response 不带 RRTI（${resp.frame.bytes} 字节）`)
    expect(sim).toContain(`${rep.frame.bytes} 字节`)
    expect(implRow('回报给发起方的两段时间').kind).toBe('differs')
  })

  it('both lanes compute, the anchor at the Final and the phone at each report, with dsTwr', () => {
    const final = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!
    for (const r of anchorRanges()) expect(r.t - final.t).toBeLessThan(PLAN.slotNs)
    const reports = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbReport')
    tagRanges().forEach((r, i) => {
      expect(r.t).toBeGreaterThan(reports[i].t)
      const t = fourTimes(r.peer)
      expect(r.tofRctu).toBeCloseTo(dsTwr(t.tround1, t.treply1, t.tround2, t.treply2), 9)
      const a = anchorRanges().find((x) => x.node === r.peer)!
      expect(a.tofRctu).toBe(r.tofRctu)
    })
  })

  it('2A + 2 slots of 2 ms; 100 ps of receive-stamp noise', () => {
    expect(PLAN.slots).toBe(2 * ANCHORS + 2)
    expect(rstuNs(SESSION.slotRstu)).toBe(2 * MS)
    expect(implRow('时隙安排').sim).toContain('2A + 2 个时隙，本课十个')
    expect(implRow('接收时间戳').sim).toContain(`标准差 ${SESSION.tsNoisePs} ps`)
  })
})

describe('uwb-dstwr · ③ every figure the labs print is the run', () => {
  it('lab 1: the two halves, their average, and the answer', () => {
    const l = lab('两个半场与答案')
    const rows = tableOf(l, '两个半场与答案').rows
    expect(rows).toHaveLength(ANCHORS)
    rows.forEach((row, i) => {
      const id = `anchor-${i + 1}`
      const t = fourTimes(id)
      const [h1, h2] = halves(id)
      expect(row).toEqual([id, `${2 * (i + 1)} ms − Tprop`, m2(h1), m2(h2), m2(rctuToMetres(dsTwr(t.tround1, t.treply1, t.tround2, t.treply2)))])
      expect(h2, id).toBeLessThan(0)
    })
    const [h1, h2] = halves('anchor-1')
    expect(l.expect).toContain(`平均是 ${m2((h1 + h2) / 2)}`)
    expect(uwbDstwr.quiz[1].explain).toContain(`平均是 ${m2((h1 + h2) / 2)}`)
    expect(uwbDstwr.quiz[1].q).toContain(`两个半场是 ${m2(h1)} 与 ${m2(h2)}，答案却是 ${m2(tagRanges()[0].distM)}`)
    expect(l.expect).toContain(`都在 ${RING_M.toFixed(2)} m 附近`)
    // 「锚点 1 等 2 ms，手机等 8 ms」
    const t = fourTimes('anchor-1')
    expect(Math.round(t.treply1 * 15.65e-3 / 1e6)).toBe(2)
    expect(l.meaning).toContain(`锚点 1 等 ${Math.round(PLAN.slotNs / MS)} ms，手机等 ${Math.round(ANCHORS * PLAN.slotNs / MS)} ms`)
  })

  it('lab 2: the ten frames, their octets and airtimes, and the share of the round', () => {
    const l = lab('十个时隙由哪些帧占用')
    const rows = tableOf(l, '十个时隙分别由哪些帧占用').rows
    const tx = ofType(recs(), 'TX_START')
    const kinds: [string, string][] = [['Poll', 'uwbPoll'], ['Response', 'uwbResp'], ['Final', 'uwbFinal'], ['Report', 'uwbReport']]
    kinds.forEach(([label, kind], i) => {
      const fs = tx.filter((r) => r.frame.kind === kind)
      expect(rows[i]).toEqual([label, String(fs.length), String(fs[0].frame.bytes), `${(fs[0].frame.txTimeNs / 1000).toFixed(2)} µs`])
    })
    const air = tx.reduce((a, r) => a + r.frame.txTimeNs, 0)
    const octets = tx.reduce((a, r) => a + r.frame.bytes, 0)
    const airStr = (air / 1000).toFixed(2).replace(/^(\d)(\d{3})/, '$1 $2')
    expect(rows[4]).toEqual(['整轮合计', String(tx.length), String(octets), `${airStr} µs`])
    const round = ofType(recs(), 'UWB_ROUND')[0]
    expect(l.expect).toContain(`写着 ${round.slots} 个时隙，到 ${round.slots * round.slotNs / MS} ms 结束`)
    const ssPlan = roundPlan({ ...SESSION, method: 'ss' }, ANCHORS)
    const ssAir = uwbPpduNs(uwbPollBytes(ANCHORS)) + ANCHORS * uwbPpduNs(uwbRespBytes('ss'))
    expect(ssPlan.roundNs * 2).toBe(PLAN.roundNs)
    const roundUs = String(PLAN.roundNs / 1000).replace(/^(\d+)(\d{3})$/, '$1 $2')
    expect(l.expect).toContain(`在 ${roundUs} µs 里辐射 ${airStr} µs，占 ${(air / PLAN.roundNs * 100).toFixed(2)} %，上一课的单边一轮是 ${(ssAir / ssPlan.roundNs * 100).toFixed(2)} %`)
  })

  it('lab 3: the two lanes, the figure, the worked counters and the fix', () => {
    const l = lab('两条泳道算出同一个数')
    const a1 = anchorRanges().find((r) => r.node === 'anchor-1')!
    const t1 = tagRanges()[0]
    expect(FIG.anchorRange).toBe(ms3(a1.t))
    expect(FIG.tagRange).toBe(ms3(t1.t))
    expect(FIG.rangeM).toBe(`${t1.distM.toFixed(2)} m`)
    expect(l.expect).toContain(`都出现在 ${ms3(a1.t)}`)
    expect(l.expect).toContain(`在 ${ms3(t1.t)} 起每 2 ms 一条`)
    for (let i = 1; i < 4; i++) expect(tagRanges()[i].t - tagRanges()[i - 1].t).toBe(2 * MS)
    // the figure's gutter: frame instants
    const tx = ofType(recs(), 'TX_START')
    const at = (k: string, node?: string) => tx.find((r) => r.frame.kind === k && (node === undefined || r.node === node))!.t
    expect(FIG.resp1).toBe(`${at('uwbResp', 'anchor-1') / MS} ms`)
    expect(FIG.final).toBe(`${at('uwbFinal') / MS} ms`)
    expect(FIG.report1).toBe(`${at('uwbReport', 'anchor-1') / MS} ms`)
    expect(uwbDstwrSequence().messages).toHaveLength(8)
    // the worked counters
    const t = fourTimes('anchor-1')
    expect(tableOf(l, '锚点 1 的逐步计算').rows.map((r) => r[1])).toEqual([
      fmt(t.txPoll), fmt(t.rxPoll), fmt(t.txResp), fmt(t.rxResp), fmt(t.txFinal), fmt(t.rxFinal),
      fmt(t.treply1), fmt(t.tround2), fmt(t.tround1), fmt(t.treply2),
      `${dsTwr(t.tround1, t.treply1, t.tround2, t.treply2).toFixed(1)} · ${t1.distM.toFixed(2)} m`,
    ])
    // the fix and its GDOP
    const pos = ofType(recs(), 'UWB_POSITION')[0]
    expect(l.expect).toContain(`(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) m 的位置，真值 (${pos.trueX.toFixed(2)}, ${pos.trueY.toFixed(2)}) m`)
    expect(l.expect).toContain(`GDOP）为 ${pos.gdop.toFixed(2)}`)
  })

  it('lab 4: the noise table, and what the worst crystals do', () => {
    const l = lab('时间戳噪声留下的误差')
    const rows = tableOf(l, '时间戳噪声留下的').rows
    rows.forEach((row, i) => {
      const r = tagRanges()[i]
      expect(row).toEqual([r.peer, `slot ${i + 1}`, `${(dsSigmaM(i + 1) * 100).toFixed(1)} cm`, signedCm(r.distM - RING_M)])
    })
    expect(dsSigmaM(4)).toBeCloseTo(dsSigmaM(1), 15)
    expect(Math.max(...[1, 2, 3, 4].map(dsSigmaM))).toBeLessThan(rangeSigmaM(SESSION.tsNoisePs))
    // the ±20 ppm variant: anchor 1's halves, and every result moves by under 3 mm
    const nodes = scenarioOf(0).nodes
    expect(nodes.find((n) => n.uwb!.role === 'tag')!.uwb!.ppm).toBe(20)
    expect(nodes.find((n) => n.uwb!.role === 'anchor')!.uwb!.ppm).toBe(-20)
    const [w1, w2] = halves('anchor-1', recs(0))
    expect(l.expect).toContain(`两个半场变为 ${m2(w1)} 与 ${m2(w2)}`)
    tagRanges(0).forEach((r, i) => expect(Math.abs(r.distM - tagRanges()[i].distM), r.peer).toBeLessThan(0.003))
    expect(l.expect).toContain('都不到 3 mm')
    expect(l.meaning).toContain(`${SESSION.tsNoisePs} ps`)
  })
})
