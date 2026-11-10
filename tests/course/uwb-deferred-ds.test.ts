/**
 * `@uwb-deferred-ds`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024's two DS-TWR procedures for the initiator's two times (§10.29.6.6
 * deferred, §10.29.6.7 embedded) and the one-to-many deferred round of §10.32.5 Figure 10-237;
 * ② says what this simulator does with each — the engine follows Figure 10-237 since W2 (audit #3):
 * a bare Final, then the initiator's deferred RMI Data frame, then the anchors compute — and the
 * tests below check it; ③'s three runs print figures, every one of them read back out of the
 * lesson's text here and compared with a run or with the engine's own frame-length functions.
 */
import { describe, expect, it } from 'vitest'
import {
  BYTES, DEMAND, DROPPED_BYTES, FIG, FIG_ANCHORS, GROWTH, dsSlots, uwbDeferredDs,
  uwbDeferredDsFields, uwbDeferredDsScenario,
} from '../../src/course/uwb/uwb-deferred-ds'
import { BENCH_M, CAP, RANGE_M } from '../../src/course/uwb/uwb-reply-time'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { anchor, isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import {
  UWB_FCS_BYTES, UWB_MAX_PSDU_BYTES, UWB_MHR_BYTES, UWB_REPORT_BYTES, UWB_SHORT_ADDR_BYTES,
  uwbDsDeferredReportBytes, uwbFinalBytes, uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes, uwbSlotFitNs,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS

lessonShapeSuite(uwbDeferredDs, { runNs: RUN_NS })

/** Base = deferred, variant 0 = embedded. */
const rec = (replyTime: 'embedded' | 'deferred'): TLRecord[] =>
  runOf(uwbDeferredDs, replyTime === 'deferred' ? undefined : 0, RUN_NS)
const txOf = (rs: TLRecord[], kind: string, node?: string) =>
  ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind && (node === undefined || r.node === node))
const rangeOf = (rs: TLRecord[], node: string) => ofType(rs, 'UWB_RANGE').find((r) => r.node === node)!
const ms3 = (ns: number): string => (ns / 1e6).toFixed(3)

const lab = (heading: string): Lab => {
  const l = uwbDeferredDs.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbDeferredDs.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbDeferredDs.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-deferred-ds · the lesson', () => {
  it('is standard-first, in the two-clocks module, published standard only', () => {
    expect(isStandardFirst(uwbDeferredDs)).toBe(true)
    expect(MODULES[uwbDeferredDs.module].title).toBe('两个时钟')
    expect(basisOf(uwbDeferredDs.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbDeferredDs.needs).toEqual(['uwb-dstwr', 'uwb-reply-time'])
    expect(uwbDeferredDs.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    expect(uwbDeferredDs.limits).toEqual([])
    expect(uwbDeferredDs.observe).toEqual([])
    expect(uwbDeferredDs.tryThis).toEqual([])
  })

  it('① teaches the standard’s procedure: the responder gets the times and computes', () => {
    const std = stdText()
    for (const c of ['§10.29.6.6', '§10.29.6.7', '§10.32.5', '§10.32.9.1', '§10.29.8.4', '§16.2.7']) expect(std, c).toContain(c)
    expect(std).toContain('{Ranging}')
    expect(std).toContain('Deferred Mode 字段为 1')
    expect(std).toContain('每个响应方集齐四段时间，算出飞行时间')
  })

  it('loads uwb-reply-time’s bench, measured the other way', () => {
    const mine = uwbDeferredDs.scenario()
    expect(mine.uwb!.method).toBe('ds')
    expect(mine.uwb!.replyTime).toBe('deferred')
    expect(mine.nodes).toHaveLength(2)
    expect(uwbDeferredDs.variants!.map((v) => v.scenario().uwb!.replyTime)).toEqual(['embedded'])
  })

  // 2026-11-11 (W2b): the one `differs` row (the responder's report) follows Figure 10-206 now.
  it('② carries an `absent` row and no `differs` row', () => {
    const kinds = uwbDeferredDs.implementation!.map((r) => r.kind)
    expect(kinds).not.toContain('differs')
    expect(kinds).toContain('absent')
  })
})

describe('uwb-deferred-ds · ② says what the engine does, and the engine does it', () => {
  it('the deferred Final is MHR + FCS, no IE, whatever the anchor count', () => {
    const final = txOf(rec('deferred'), 'uwbFinal')[0]
    expect(final.frame.bytes).toBe(UWB_MHR_BYTES + UWB_FCS_BYTES)
    expect(final.frame.uwb!.ies).toEqual([])
    expect(uwbFinalBytes(FIG_ANCHORS, 'deferred')).toBe(final.frame.bytes)
    expect(implRow('延后的 Final').sim).toContain(`帧头 ${UWB_MHR_BYTES} 字节加帧校验 ${UWB_FCS_BYTES} 字节，共 ${final.frame.bytes} 字节`)
  })

  it('the initiator’s deferred Data frame is one broadcast RMI, 15 + 10A', () => {
    const d = txOf(rec('deferred'), 'uwbReport', 'tag-1')
    expect(d).toHaveLength(1)
    expect(d[0].frame.uwb!.ies).toEqual(['RMI'])
    expect(d[0].frame.bytes).toBe(uwbDsDeferredReportBytes(1))
    expect(uwbDsDeferredReportBytes(0)).toBe(15)
    expect(GROWTH.deferredReport).toBe(10)
    expect(implRow('延后数据帧').sim).toContain(`共 ${uwbDsDeferredReportBytes(0)} + ${GROWTH.deferredReport}A 字节`)
    expect(implRow('延后数据帧').sim).toContain(`${UWB_SHORT_ADDR_BYTES} 字节的短地址`)
  })

  it('the Poll’s ARC IE says Deferred Mode 1 in both shapes: data frames follow the exchange in both', () => {
    const arc = (rt: 'embedded' | 'deferred') => txOf(rec(rt), 'uwbPoll')[0].frame.uwb!.arc!
    expect(arc('deferred').deferred).toBe(1)
    expect(arc('embedded').deferred).toBe(1)
    expect(txOf(rec('embedded'), 'uwbReport').length).toBeGreaterThan(0)
    expect(implRow('Deferred Mode 字段').sim).toContain('Deferred Mode 都为 1')
  })

  it('2A + 3 slots against 2A + 2; the anchor computes when the deferred frame lands', () => {
    for (const a of [1, 2, FIG_ANCHORS]) {
      expect(dsSlots(a, 'deferred')).toBe(2 * a + 3)
      expect(dsSlots(a, 'embedded')).toBe(2 * a + 2)
    }
    expect(ofType(rec('deferred'), 'UWB_ROUND')[0].slots).toBe(dsSlots(1, 'deferred'))
    const d = txOf(rec('deferred'), 'uwbReport', 'tag-1')[0]
    const a = rangeOf(rec('deferred'), 'anchor-1')
    expect(a.t).toBeGreaterThan(d.t)
    expect(a.t - d.t).toBeLessThan(2 * MS)
  })

  it('the anchor’s report: one unicast RMI with both its times, 23 bytes, and no RRTI in its Response', () => {
    const rep = txOf(rec('deferred'), 'uwbReport', 'anchor-1')[0]
    expect(rep.frame.bytes).toBe(UWB_REPORT_BYTES)
    expect(rep.frame.uwb!.ies).toEqual(['RMI'])
    expect(txOf(rec('deferred'), 'uwbResp')[0].frame.uwb!.ies).not.toContain('RRTI')
    expect(implRow('发起方也得到距离').sim).toContain(`${UWB_REPORT_BYTES} 字节的报告`)
    const t = rangeOf(rec('deferred'), 'tag-1')
    expect(t.t).toBeGreaterThan(rep.t)
  })

  it('the caps the address row names are the engine’s', () => {
    expect(CAP.dsEmbedded).toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    expect(CAP.dsDeferred).toBe(uwbMaxAnchors('twr', 'ds', 'deferred'))
    expect(implRow('地址').sim).toContain(`${CAP.dsEmbedded} 与 ${CAP.dsDeferred} 这两个上限`)
  })
})

describe('uwb-deferred-ds · ③ every figure the labs print is the run', () => {
  it('the figures in `why`: 11 bytes, 10 bytes an anchor, 9 → 11', () => {
    const why = uwbDeferredDs.why!
    expect(why).toContain(`共 ${BYTES.finalDeferredOne} 字节`)
    expect(why).toContain(`增长 ${GROWTH.deferredReport} 字节`)
    expect(why).toContain(`从嵌入形态的 ${CAP.dsEmbedded} 个变为 ${CAP.dsDeferred} 个`)
    expect(uwbDeferredDs.jumps[1].label).toContain(`${BYTES.finalDeferredOne} 字节`)
  })

  it('lab 1: the 11-byte Final, the deferred frame, and the two range rows', () => {
    const l = lab('一帧 11 字节的 Final')
    expect(l.heading).toContain(String(BYTES.finalDeferredOne))
    const rs = rec('deferred')
    const final = txOf(rs, 'uwbFinal')[0]
    expect(l.expect).toContain(`Final 在 ${final.t / MS} ms 处发出，只有 ${final.frame.bytes} 字节`)
    const d = txOf(rs, 'uwbReport', 'tag-1')[0]
    expect(d.t - final.t).toBe(2 * MS)
    expect(l.expect).toContain(`${d.frame.bytes} 字节的延后数据帧`)
    expect(l.expect).toContain(`整轮写着 ${ofType(rs, 'UWB_ROUND')[0].slots} slots`)
    const a = rangeOf(rs, 'anchor-1')
    const t = rangeOf(rs, 'tag-1')
    expect(FIG.anchorDeferredUs).toBe(ms3(a.t))
    expect(FIG.tagDeferredUs).toBe(ms3(t.t))
    expect(l.expect).toContain(`锚点的测距行在 ${ms3(a.t)} ms`)
    expect(l.expect).toContain(`手机的在 ${ms3(t.t)} ms`)
    // 2026-11-11 (W2b): the tag's range is the TOF the anchor reported in the RMI IE's TOF field, a whole
    // number of RCTU (§10.29.6.6 Figure 10-206, §10.29.8.4, §10.29.1.4) — not its own four-time sum.
    expect(a.distM.toFixed(6)).toBe(RANGE_M.ds)
    expect(t.distM.toFixed(6)).toBe(RANGE_M.dsDeferredTag)
    expect(t.tofRctu).toBe(Math.round(a.tofRctu))
    expect(a.trueDistM).toBe(BENCH_M)
    expect(l.expect).toContain(`锚点算出 ${RANGE_M.ds} m，真值 ${BENCH_M.toFixed(2)} m；手机读出 ${RANGE_M.dsDeferredTag} m`)
    const rep = txOf(rs, 'uwbReport', 'anchor-1')[0]
    expect(rep.frame.bytes).toBe(BYTES.report)
    expect(rep.frame.uwb!.reportTimes).toEqual({ tof: Math.round(a.tofRctu) })
  })

  it('lab 2: the embedded Final, and the same distance a slot earlier', () => {
    const l = lab('嵌入形态：Final 把两段时间带给锚点')
    const rs = rec('embedded')
    const final = txOf(rs, 'uwbFinal')[0]
    expect(final.frame.bytes).toBe(BYTES.finalEmbeddedOne)
    expect(final.frame.uwb!.ies).toEqual(['RMI', 'RRTI'])
    expect(l.expect).toContain(`Final 是 ${final.frame.bytes} 字节，带 RMI 与 RRTI 两个信息单元，比延后形态多 ${final.frame.bytes - BYTES.finalDeferredOne} 字节`)
    expect(l.expect).toContain(`整轮 ${ofType(rs, 'UWB_ROUND')[0].slots} slots`)
    const a = rangeOf(rs, 'anchor-1')
    const t = rangeOf(rs, 'tag-1')
    expect(FIG.anchorRangeUs).toBe(ms3(a.t))
    expect(FIG.tagRangeUs).toBe(ms3(t.t))
    expect(l.expect).toContain(`锚点在 ${ms3(a.t)} ms 算出 ${a.distM.toFixed(6)} m，手机在 ${ms3(t.t)} ms 算出同一个数`)
    expect(t.distM.toFixed(6)).toBe(a.distM.toFixed(6))
    expect(l.expect).toContain(`推迟到 ${FIG.anchorDeferredUs} ms 与 ${FIG.tagDeferredUs} ms`)
    // the table: both ends hold a range in both shapes
    const rows = tableOf(l, '本课的场景里哪一端在何时算出距离').rows
    expect(rows).toHaveLength(2)
    for (const rt of ['embedded', 'deferred'] as const) {
      expect(ofType(rec(rt), 'UWB_RANGE').map((r) => r.node).sort(), rt).toEqual(['anchor-1', 'tag-1'])
    }
  })

  it('lab 3: the caps, the field diagram and the slot demand', () => {
    const l = lab('锚点上限：轮中最长的一帧')
    for (const [rt, cap] of [['embedded', CAP.dsEmbedded], ['deferred', CAP.dsDeferred]] as const) {
      expect(uwbLongestFrameBytes(cap, 'twr', 'time', 'ds', rt)).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
      expect(uwbLongestFrameBytes(cap + 1, 'twr', 'time', 'ds', rt)).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    }
    expect(BYTES.psdu).toBe(UWB_MAX_PSDU_BYTES)
    expect(l.steps[0]).toContain(`Final 需要 ${uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')} 字节，超过 ${UWB_MAX_PSDU_BYTES} 字节`)
    // the editor really refuses ten anchors embedded and takes them deferred
    const withAnchors = (n: number, rt: 'embedded' | 'deferred'): Scenario => {
      const sc = uwbDeferredDsScenario(rt)
      const extra: NodeCfg[] = Array.from({ length: n - 1 }, (_, i) => anchor(`anchor-${i + 2}`, `A${i + 2}`, 1 + i * 0.5, 2, 1.2))
      return { ...sc, nodes: [...sc.nodes, ...extra] }
    }
    expect(ScenarioSchema.safeParse(withAnchors(CAP.dsEmbedded + 1, 'embedded')).success).toBe(false)
    expect(ScenarioSchema.safeParse(withAnchors(CAP.dsEmbedded + 1, 'deferred')).success).toBe(true)
    expect(ScenarioSchema.safeParse(withAnchors(CAP.dsDeferred, 'deferred')).success).toBe(true)
    expect(ScenarioSchema.safeParse(withAnchors(CAP.dsDeferred + 1, 'deferred')).success).toBe(false)
    // the table's cells
    const rows = tableOf(l, '两种形态，两个上限').rows
    expect(rows[0]).toEqual(['Final 长度', `${uwbFinalBytes(0, 'embedded')} + ${uwbFinalBytes(1, 'embedded') - uwbFinalBytes(0, 'embedded')}A`, `${uwbFinalBytes(0, 'deferred')}（不随 A 增长）`])
    expect(rows[2][1]).toBe(`Final ${uwbFinalBytes(FIG_ANCHORS, 'embedded')} B`)
    expect(rows[2][2]).toBe(`Final ${uwbFinalBytes(FIG_ANCHORS, 'deferred')} B，延后数据帧 ${uwbDsDeferredReportBytes(FIG_ANCHORS)} B`)
    expect(rows[5][1]).toBe(`${(uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded') / 1000).toFixed(1)} µs`)
    expect(rows[5][2]).toBe(`${(DEMAND.dsDeferred / 1000).toFixed(1)} µs`)
    // the diagram: what the deferred Final drops is everything between the MHR and the FCS
    const spec = uwbDeferredDsFields()
    const total = spec.fields.reduce((n, f) => n + f.size, 0)
    expect(total).toBe(uwbFinalBytes(FIG_ANCHORS, 'embedded'))
    expect(DROPPED_BYTES).toBe(total - UWB_MHR_BYTES - UWB_FCS_BYTES)
    // the growths the expect line quotes
    expect(GROWTH.finalEmbedded).toBe(12)
    expect(GROWTH.poll).toBe(uwbPollBytes(2) - uwbPollBytes(1))
    expect(GROWTH.deferredReport).toBeGreaterThan(GROWTH.poll)
    expect(l.expect).toContain(`${CAP.dsEmbedded} 个锚点时 ${BYTES.finalEmbeddedMany} 字节`)
  })
})
