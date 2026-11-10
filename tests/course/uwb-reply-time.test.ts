/**
 * `@uwb-reply-time`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024's three SS-TWR procedures (§10.29.6.3–§10.29.6.5, §10.29.8.1) and the
 * one-to-many fixed reply times of §10.32.2; ② says what this simulator does with each — RRTN is not
 * implemented, the deferred message takes a slot of its own, FRTi = FRT1 + (i − 1) slots — and the
 * tests below check that the engine does it; ③'s four runs print frame lengths, slot counts, caps,
 * a two-sided bound and five six-decimal ranges, every one read back out of the lesson's text here
 * and compared with a run or with the engine's own exports.
 */
import { describe, expect, it } from 'vitest'
import {
  BENCH_M, BYTES, CAP, DEFERRED_REPORT_GROWTH, DEMAND_ANCHORS, FIG, FIXED_REPLY_RSTU, PPM, RANGE_M,
  fixedWindowRstu, uwbReplyTime, uwbReplyTimeScenario, uwbReplyTimeTiming,
} from '../../src/course/uwb/uwb-reply-time'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { UwbReplyTime } from '../../src/uwb/phy'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import {
  C_M_PER_NS, RDM_ENTRY_BYTES, RRTI_IE_BYTES, UWB_MAX_PSDU_BYTES, UWB_SLOT_GUARD_NS, UWB_SS_DEFER_BYTES,
  rstuNs, uwbDsDeferredReportBytes, uwbFinalBytes, uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes,
  uwbPpduNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS

lessonShapeSuite(uwbReplyTime, { runNs: RUN_NS })

const SESSION = uwbReplyTime.scenario().uwb!
const memo = new Map<string, TLRecord[]>()
/** Any of the five shapes, run straight off its scenario builder; `ppm = false` matches the crystals. */
function runShape(replyTime: UwbReplyTime, method: 'ss' | 'ds' = 'ss', ppm = true): TLRecord[] {
  const key = `${replyTime}/${method}/${ppm}`
  if (!memo.has(key)) {
    const base = uwbReplyTimeScenario(replyTime, method)
    const sc: Scenario = ppm ? base : { ...base, nodes: base.nodes.map((n) => ({ ...n, uwb: { ...n.uwb!, ppm: 0 } })) }
    expect(() => ScenarioSchema.parse(sc), key).not.toThrow()
    memo.set(key, [...new Simulation(sc).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const txOf = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const tagRange = (rs: TLRecord[]) => {
  const mine = ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1')
  expect(mine).toHaveLength(1)
  return mine[0]
}
const us3 = (ns: number): number => Math.round(ns) / 1000

const lab = (heading: string): Lab => {
  const l = uwbReplyTime.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const formulaOf = (l: Lab): Extract<Block, { kind: 'formula' }> =>
  (l.blocks ?? []).find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
const implRow = (topic: string) => {
  const row = uwbReplyTime.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbReplyTime.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-reply-time · the lesson', () => {
  it('is standard-first, in the two-clocks module, published standard only', () => {
    expect(isStandardFirst(uwbReplyTime)).toBe(true)
    expect(MODULES[uwbReplyTime.module].title).toBe('两个时钟')
    expect(basisOf(uwbReplyTime.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbReplyTime.needs).toEqual(['uwb-sstwr'])
    expect(uwbReplyTime.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    expect(uwbReplyTime.limits).toEqual([])
    expect(uwbReplyTime.observe).toEqual([])
    expect(uwbReplyTime.tryThis).toEqual([])
  })

  it('① cites the three procedures, the RRTI condition and the FRTi rules', () => {
    const std = stdText()
    for (const c of ['§10.29.1.2.2', '§10.29.6.3', '§10.29.6.4', '§10.29.6.5', '§10.29.8.1', '§10.29.8.6', '§10.32.2']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('FRTi > FRTj')
    expect(std).toContain('FRTN 加包长小于 (N + 1) 个时隙')
    expect(std).toContain('飞行时间每错 1 ns，距离约错 30 cm')
    // 「每错 1 ns……约错 30 cm」: c × 1 ns
    expect(Math.round(C_M_PER_NS * 100)).toBe(30)
  })

  it('the RRTI is 7 bytes as ① says: 2 + 1 + 4', () => {
    expect(RRTI_IE_BYTES).toBe(2 + 1 + 4)
    expect(stdText()).toContain(`一个回复时延的 RRTI 共 ${RRTI_IE_BYTES} 字节`)
  })

  it('the scene: one anchor and one tag 5.00 m apart, crystals 35 ppm apart, no noise', () => {
    const sc = uwbReplyTime.scenario()
    expect(sc.nodes).toHaveLength(2)
    expect(sc.uwb!.replyTime).toBe('deferred')
    expect(sc.uwb!.tsNoisePs).toBe(0)
    expect(sc.uwb!.cfoNoisePpm).toBe(0)
    expect(PPM.anchor - PPM.tag).toBe(35)
    expect(uwbReplyTime.why).toContain(`相差 ${PPM.anchor - PPM.tag} ppm`)
    expect(uwbReplyTime.variants!.map((v) => v.scenario().uwb!.replyTime)).toEqual(['embedded', 'fixed'])
  })

  it('② carries an `absent` row (RRTN) and is not all faithful', () => {
    expect(implRow('约定的方式').kind).toBe('absent')
    expect(new Set(uwbReplyTime.implementation!.map((r) => r.kind)).size).toBeGreaterThan(2)
  })
})

describe('uwb-reply-time · ② says what the engine does, and the engine does it', () => {
  it('embedded: a 21-byte Response with RRMC and RRTI', () => {
    const r = txOf(runShape('embedded'), 'uwbResp')[0]
    expect(r.frame.bytes).toBe(BYTES.respEmbedded)
    expect(r.frame.uwb!.ies).toEqual(['RRMC', 'RRTI'])
    expect(implRow('嵌入').sim).toContain(`${RRTI_IE_BYTES} 字节的 RRTI，共 ${r.frame.bytes} 字节`)
  })

  it('deferred: a 14-byte Response, then a 19-byte message of one RMI', () => {
    const rs = runShape('deferred')
    const r = txOf(rs, 'uwbResp')[0]
    const d = txOf(rs, 'uwbSsDefer')
    expect(r.frame.uwb!.ies).toEqual(['RRMC'])
    expect(d).toHaveLength(1)
    expect(d[0].frame.uwb!.ies).toEqual(['RMI'])
    expect(d[0].frame.bytes).toBe(UWB_SS_DEFER_BYTES)
    expect(implRow('延后').sim).toContain(`Response 只带 RRMC（${r.frame.bytes} 字节）；随后一条 ${d[0].frame.bytes} 字节的消息`)
    for (const rt of ['embedded', 'fixed'] as const) expect(txOf(runShape(rt), 'uwbSsDefer'), rt).toHaveLength(0)
  })

  it('the deferred message goes in the next slot: 2A + 1 against A + 1', () => {
    const rs = runShape('deferred')
    expect(txOf(rs, 'uwbSsDefer')[0].t - txOf(rs, 'uwbResp')[0].t).toBe(rstuNs(SESSION.slotRstu))
    for (const a of [1, 2, DEMAND_ANCHORS]) {
      const slots = (rt: UwbReplyTime) => uwbSlotsPerTag('ss', a, 'time', SESSION.contentionSlots, 'twr', undefined, undefined, rt)
      expect(slots('deferred')).toBe(2 * a + 1)
      expect(slots('embedded')).toBe(a + 1)
      expect(slots('fixed')).toBe(a + 1)
    }
    expect(implRow('延后消息的时隙').sim).toContain('2A + 1 个时隙，而嵌入与固定各占 A + 1 个')
  })

  it('FRT is RMARKER to RMARKER on the anchor’s crystal; FRT1 = 2600 RSTU', () => {
    const sc = uwbReplyTimeScenario('fixed')
    expect(sc.uwb!.fixedReplyRstu).toBe(FIXED_REPLY_RSTU)
    expect(implRow('各响应方的值').sim).toContain(`FRT1 = ${FIXED_REPLY_RSTU} RSTU`)
    const start = txOf(runShape('fixed'), 'uwbResp')[0].t
    const expected = rstuNs(FIXED_REPLY_RSTU) / (1 + PPM.anchor * 1e-6) + BENCH_M / C_M_PER_NS
    expect(Math.abs(start - expected)).toBeLessThan(1)
  })

  it('the editor’s bound, with the 200 ns guard', () => {
    expect(UWB_SLOT_GUARD_NS).toBe(200)
    expect(implRow('FRT1 的上下界').sim).toContain(`守卫 ${UWB_SLOT_GUARD_NS} ns`)
  })
})

describe('uwb-reply-time · ③ every figure the labs print is the run', () => {
  it('lab 1: three frames, three slots, and the range when the deferred message lands', () => {
    const l = lab('只为传送一个数值而发送的消息')
    const rs = runOf(uwbReplyTime, undefined, RUN_NS)
    const tx = ofType(rs, 'TX_START')
    expect(tx.map((r) => r.frame.kind)).toEqual(['uwbPoll', 'uwbResp', 'uwbSsDefer'])
    expect(l.expect).toContain(`${tx[0].frame.bytes} 字节的 Poll、${tx[1].frame.bytes} 字节的 Response 与 ${tx[2].frame.bytes} 字节的延后消息`)
    // 2026-11-11 (W2b): the three-slot exchange runs in a 4-slot round, a whole divisor of the 100-slot
    // block (standard §10.32.2).
    expect(l.expect).toContain(`写着 ${ofType(rs, 'UWB_ROUND')[0].slots} slots`)
    expect(ofType(rs, 'UWB_ROUND')[0].slots).toBe(4)
    expect(l.expect).toContain('排成 4 个时隙，最后一个空闲')
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.node === 'tag-1' && r.dir === 'rx')
    const respAt = stamps.find((r) => r.frameKind === 'uwbResp')!.t
    const range = tagRange(rs)
    expect(l.expect).toContain(`测距行出现在 ${(range.t / 1e6).toFixed(3)} ms`)
    expect(l.expect).toContain(`而不是 ${(respAt / 1e6).toFixed(3)} ms 的 Response 到达时`)
    expect(range.t).toBeGreaterThanOrEqual(stamps.find((r) => r.frameKind === 'uwbSsDefer')!.t)
  })

  it('lab 1’s figure: every bar where the timeline puts the frame', () => {
    const emb = runShape('embedded'); const def = runShape('deferred'); const fix = runShape('fixed')
    const poll = txOf(emb, 'uwbPoll')[0]
    expect(us3(poll.frame.txTimeNs)).toBe(FIG.pollEndUs)
    const re = txOf(emb, 'uwbResp')[0]
    expect(us3(re.t)).toBe(FIG.slotUs)
    expect(us3(re.t + re.frame.txTimeNs)).toBe(FIG.respEmbeddedUs)
    const rd = txOf(def, 'uwbResp')[0]
    expect(us3(rd.t + rd.frame.txTimeNs)).toBe(FIG.respDeferredUs)
    const d = txOf(def, 'uwbSsDefer')[0]
    expect(us3(d.t)).toBe(2 * FIG.slotUs)
    expect(us3(d.t + d.frame.txTimeNs)).toBe(FIG.deferEndUs)
    const rf = txOf(fix, 'uwbResp')[0]
    expect(us3(rf.t)).toBe(FIG.fixedStartUs)
    expect(us3(rf.t + rf.frame.txTimeNs)).toBe(FIG.fixedEndUs)
    expect(uwbReplyTimeTiming().lanes.map((x) => x.label)).toEqual(['时隙', '嵌入', '固定', '延后'])
  })

  it('lab 2: the octet table, the slot counts at nine anchors, and the caps', () => {
    const l = lab('三种形态的帧长、时隙与锚点上限')
    const rows = tableOf(l, '三种形态的帧长差异').rows
    const resp = (rt: UwbReplyTime) => txOf(runShape(rt), 'uwbResp')[0].frame.bytes
    const poll = txOf(runShape('embedded'), 'uwbPoll')[0].frame.bytes
    expect(rows[0]).toEqual(['Poll', `${poll} B`, `${poll} B`, `${poll} B`])
    expect(rows[1]).toEqual(['Response', `${resp('embedded')} B`, `${resp('deferred')} B`, `${resp('fixed')} B`])
    expect(rows[2]).toEqual(['延后消息', '—', `${txOf(runShape('deferred'), 'uwbSsDefer')[0].frame.bytes} B`, '—'])
    const slots = (rt: UwbReplyTime, a: number) => uwbSlotsPerTag('ss', a, 'time', SESSION.contentionSlots, 'twr', undefined, undefined, rt)
    // 「A + 1」 / 「2A + 1」 evaluated at the A the next row prints
    expect(rows[3]).toEqual(['一轮的时隙数', 'A + 1', '2A + 1', 'A + 1'])
    expect(rows[4][0]).toBe(`A = ${DEMAND_ANCHORS} 时的时隙数`)
    expect(rows[4].slice(1)).toEqual([slots('embedded', DEMAND_ANCHORS), slots('deferred', DEMAND_ANCHORS), slots('fixed', DEMAND_ANCHORS)].map(String))
    // one-anchor rounds: two, three, two slots of exchange (2026-11-11, W2b: counted off the frames on the
    // air; the round itself is stretched to a whole divisor of the block, §10.32.2)
    for (const [rt, n] of [['embedded', 2], ['deferred', 3], ['fixed', 2]] as const) {
      expect(ofType(runShape(rt), 'TX_START').filter((r) => r.frame.uwb?.block === 0).length, rt).toBe(n)
    }
    expect(l.expect).toContain('嵌入与固定的一轮用两个时隙，延后用三个')
    expect(l.expect).toContain(`相差的 ${resp('embedded') - resp('fixed')} 个字节就是 RRTI 信息单元`)
    // caps
    const caps = tableOf(l, '每种形态自己的锚点上限').rows
    const want: [string, 'ss' | 'ds', UwbReplyTime][] = [
      ['SS-TWR 嵌入', 'ss', 'embedded'], ['SS-TWR 延后', 'ss', 'deferred'], ['SS-TWR 固定', 'ss', 'fixed'],
      ['DS-TWR 嵌入', 'ds', 'embedded'], ['DS-TWR 延后', 'ds', 'deferred'],
    ]
    want.forEach(([label, method, rt], i) => {
      const cap = uwbMaxAnchors('twr', method, rt)
      expect(caps[i][0]).toBe(label)
      expect(caps[i][2]).toBe(String(cap))
      expect(uwbLongestFrameBytes(cap, 'twr', 'time', method, rt)).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
      expect(uwbLongestFrameBytes(cap + 1, 'twr', 'time', method, rt)).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    })
    expect(caps[0][1]).toBe(`Poll，${uwbPollBytes(0)} + ${RDM_ENTRY_BYTES}A`)
    expect(uwbPollBytes(1) - uwbPollBytes(0)).toBe(RDM_ENTRY_BYTES)
    expect(caps[3][1]).toBe(`Final，${uwbFinalBytes(0, 'embedded')} + ${uwbFinalBytes(1, 'embedded') - uwbFinalBytes(0, 'embedded')}A`)
    expect(caps[4][1]).toBe(`延后数据帧，${uwbDsDeferredReportBytes(0)} + ${DEFERRED_REPORT_GROWTH}A`)
    expect(l.expect).toContain(`单边三种形态的上限都是 ${CAP.ssEmbedded}，双边嵌入是 ${CAP.dsEmbedded}，双边延后是 ${CAP.dsDeferred}`)
    expect(l.meaning).toContain(`每个锚点只增长 ${RDM_ENTRY_BYTES} 字节的 Poll`)
  })

  it('lab 3: one distance, five routes, and the matched crystals', () => {
    const l = lab('同一段距离，五种方式')
    const got = {
      embedded: tagRange(runShape('embedded')).distM.toFixed(6),
      deferred: tagRange(runShape('deferred')).distM.toFixed(6),
      fixed: tagRange(runShape('fixed')).distM.toFixed(6),
      dsE: tagRange(runShape('embedded', 'ds')).distM.toFixed(6),
      dsD: tagRange(runShape('deferred', 'ds')).distM.toFixed(6),
    }
    // 2026-11-11 (W2b): deferred DS's tag reads the TOF the anchor reported, a whole number of RCTU in
    // the RMI IE (§10.29.6.6 Figure 10-206, §10.29.8.4, §10.29.1.4).
    expect([got.embedded, got.deferred, got.fixed, got.dsE, got.dsD])
      .toEqual([RANGE_M.embedded, RANGE_M.deferred, RANGE_M.fixed, RANGE_M.ds, RANGE_M.dsDeferredTag])
    for (const [rt, m] of [['embedded', 'ss'], ['deferred', 'ss'], ['fixed', 'ss'], ['embedded', 'ds'], ['deferred', 'ds']] as const) {
      expect(tagRange(runShape(rt, m, false)).distM.toFixed(6), `${m}/${rt} matched`).toBe(RANGE_M.matched)
    }
    const rows = tableOf(l, '同一段距离，五种方式的测量结果').rows
    expect(rows.map((r) => r[1])).toEqual([RANGE_M.embedded, RANGE_M.deferred, RANGE_M.fixed, RANGE_M.ds, RANGE_M.dsDeferredTag].map((x) => `${x} m`))
    expect(l.expect).toContain(`取整之后是 ${RANGE_M.dsDeferredTag} m`)
    for (const r of rows) expect(r[2]).toBe(`${RANGE_M.matched} m`)
    expect(l.expect).toContain(`真值是 ${BENCH_M.toFixed(2)} m`)
    expect(RANGE_M.embedded).toBe(RANGE_M.deferred)
    expect(RANGE_M.fixed).not.toBe(RANGE_M.embedded)
    const err = (s: string) => Math.abs(Number(s) - BENCH_M)
    expect(err(RANGE_M.ds)).toBeLessThan(err(RANGE_M.embedded))
    expect(err(RANGE_M.ds)).toBeLessThan(err(RANGE_M.fixed))
    expect(l.meaning).toContain(`晶振快 ${PPM.anchor} ppm`)
    expect(formulaOf(l).text).toBe('T̂prop = (Tround − Treply·(1 − Coffs)) / 2')
  })

  it('lab 4: the fixed Response’s instant, and the two-sided bound', () => {
    const l = lab('固定回复时间的上下界')
    const rf = txOf(runShape('fixed'), 'uwbResp')[0]
    expect(l.steps[0]).toContain(`从 ${(rstuNs(SESSION.slotRstu) / 1e6).toFixed(3)} ms 推迟到 ${(rf.t / 1e6).toFixed(3)} ms`)
    expect(l.steps[0]).toContain(`${FIXED_REPLY_RSTU} RSTU`)
    const w = fixedWindowRstu(BENCH_M, SESSION.slotRstu)
    const far = fixedWindowRstu(200, SESSION.slotRstu)
    expect(formulaOf(l).note).toContain(`F 只能取 ${w.lo} 到 ${w.hi} RSTU`)
    expect(formulaOf(l).note).toContain(`时隙 ${SESSION.slotRstu} RSTU，Response ${(uwbPpduNs(BYTES.respFixed) / rstuNs(1)).toFixed(1)} RSTU`)
    expect(l.expect).toContain(`上界只从 ${w.hi} 降到 ${far.hi} RSTU`)
    expect(l.expect).toContain(`从 ${BENCH_M} m 增加到 200 m`)
    expect(l.expect).toContain(`在 ${(rstuNs(SESSION.slotRstu / 2) / 1e6).toFixed(2)} ms 处发送`)
    // the schema enforces it in both directions, with two different reasons
    const at = (f: number): Scenario => {
      const sc = uwbReplyTimeScenario('fixed')
      return { ...sc, uwb: { ...sc.uwb!, fixedReplyRstu: f } }
    }
    expect(ScenarioSchema.safeParse(at(w.lo)).success).toBe(true)
    expect(ScenarioSchema.safeParse(at(w.hi)).success).toBe(true)
    const late = ScenarioSchema.safeParse(at(w.hi + 1))
    expect(late.success).toBe(false)
    expect(late.success ? '' : late.error.issues.map((i) => i.message).join('')).toContain('切掉')
    const early = ScenarioSchema.safeParse(at(SESSION.slotRstu / 2))
    expect(early.success).toBe(false)
    expect(early.success ? '' : early.error.issues.map((i) => i.message).join('')).toContain('还没轮到它')
    expect(l.steps[1]).toContain(`越过 ${w.hi} 会被拒绝`)
    expect(l.steps[1]).toContain(`即 ${SESSION.slotRstu / 2} RSTU`)
    // 「本课取 2600 而不是下界 2400」 and 「约 23 ns」: one slot on a 20 ppm-fast crystal, minus the flight
    expect(l.meaning).toContain(`本课取 ${FIXED_REPLY_RSTU} 而不是下界 ${w.lo}`)
    const earlyNs = rstuNs(SESSION.slotRstu) - (rstuNs(SESSION.slotRstu) / (1 + PPM.anchor * 1e-6) + BENCH_M / C_M_PER_NS)
    expect(Math.round(earlyNs)).toBe(23)
    expect(l.meaning).toContain('约 23 ns')
    expect(l.meaning).toContain(`晶振快 ${PPM.anchor} ppm`)
  })
})
