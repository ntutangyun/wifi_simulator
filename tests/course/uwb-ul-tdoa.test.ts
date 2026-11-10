/**
 * `@uwb-ul-tdoa`, in the standard-first shape (2026-11-10).
 *
 * ① teaches IEEE Std 802.15.4-2024 §10.29.1.2.5's first TDOA case and §10.29.5's infrastructure
 * timestamps. ② is checked against the frames and records the engine produces; since 2026-11-11
 * (W4) the blink is the standard's own 12-octet multipurpose frame (§10.29.1.2.5, §7.3.5), no IE.
 *
 * Every figure the labs and the summary print is read back out of the lesson's own text and
 * compared with a run.
 */
import { describe, expect, it } from 'vitest'
import { TAG_SPOTS, UL_ANCHORS, uwbUlTdoa, uwbUlTdoaScenario, type UwbUlTdoaVariant } from '../../src/course/uwb/uwb-ul-tdoa'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import {
  C_M_PER_NS, UWB_BLINK_BYTES, UWB_EXT_ADDR_BYTES, UWB_FCS_BYTES, UWB_MP_SHORT_FC_BYTES, UWB_PPM_MAX, UWB_SEQ_BYTES, rstuNs, uwbPpduNs,
} from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const BADGES = TAG_SPOTS.map((_, i) => `badge-${i + 1}`)
const REF = UL_ANCHORS[0].id
const PEERS = UL_ANCHORS.slice(1).map((a) => a.id)

const recs = (v: UwbUlTdoaVariant): TLRecord[] => runOf(uwbUlTdoa, v === 'base' ? undefined : 0, RUN_NS)
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const diffErrM = (rs: TLRecord[]): number[] =>
  ofType(rs, 'UWB_TDOA').map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
const fixErrM = (rs: TLRecord[]): number[] =>
  ofType(rs, 'UWB_POSITION').map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
const ulSigmaM = (syncNs: number): number =>
  Math.SQRT2 * C_M_PER_NS * Math.hypot(DEFAULT_UWB_SESSION.tsNoisePs / 1000, syncNs)
const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`

const lab = (heading: string): Lab => {
  const l = uwbUlTdoa.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbUlTdoa.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(uwbUlTdoa, { runNs: RUN_NS })

describe('uwb-ul-tdoa · the lesson', () => {
  it('is in the standard-first shape, after the listen-only lesson', () => {
    expect(isStandardFirst(uwbUlTdoa)).toBe(true)
    expect(uwbUlTdoa.module).toBe(25)
    expect(uwbUlTdoa.needs).toEqual(['uwb-dl-tdoa'])
    expect(uwbUlTdoa.limits).toEqual([])
    expect(uwbUlTdoa.observe).toEqual([])
    expect(uwbUlTdoa.tryThis).toEqual([])
    expect(uwbUlTdoa.terms!.map((t) => t.term)).toEqual(['blink', 'UL-TDoA', 'sync error', 'bias'])
  })

  it('cites each clause it teaches in ①, and ① names no simulator element', () => {
    const std = uwbUlTdoa.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.29.1.2.5', '§10.29.5', '§10.29.1.1']) expect(std, clause).toContain(clause)
    for (const invented of ['BLINK', '参考锚点', '胸牌', 'anchor-', '同步误差']) expect(std, invented).not.toContain(invented)
    expect(std).toContain('12 个字节')
  })

  // 2026-11-11 (W4): the blink is §10.29.1.2.5's 12-octet multipurpose frame, so the row is faithful.
  it('② is not all faithful, and the blink row is faithful to §10.29.1.2.5', () => {
    expect(uwbUlTdoa.implementation!.filter((r) => r.kind !== 'faithful').length).toBeGreaterThan(0)
    expect(implRow('闪发帧').kind).toBe('faithful')
    expect(uwbUlTdoa.implementation!.map((r) => r.sim).join(' ')).not.toContain('BLINK')
    expect(uwbUlTdoa.why).not.toContain('BLINK')
  })
})

describe('uwb-ul-tdoa · ② says what the engine does, and the engine does it', () => {
  it('the blink: a 12-octet multipurpose frame, 1 + 1 + 8 + 2, no IE and no time in it', () => {
    expect([UWB_MP_SHORT_FC_BYTES, UWB_SEQ_BYTES, UWB_EXT_ADDR_BYTES, UWB_FCS_BYTES, UWB_BLINK_BYTES]).toEqual([1, 1, 8, 2, 12])
    const sim = implRow('闪发帧').sim
    expect(sim).toContain(`${UWB_BLINK_BYTES} 字节的多用途帧，短帧控制（Short Frame Control）${UWB_MP_SHORT_FC_BYTES} 字节、序列号 ${UWB_SEQ_BYTES} 字节、扩展源地址 ${UWB_EXT_ADDR_BYTES} 字节、帧校验 ${UWB_FCS_BYTES} 字节`)
    const blink = ofType(recs('base'), 'TX_START').find((r) => r.frame.kind === 'uwbBlink')!.frame
    expect(blink.bytes).toBe(UWB_BLINK_BYTES)
    expect(blink.uwb?.ies).toEqual([])
  })

  it('each badge owns a one-slot round per block, rounds 0–9, and a block holds a hundred', () => {
    const rounds = ofType(recs('base'), 'UWB_ROUND').filter((r) => r.block === 0)
    expect(rounds.map((r) => [r.node, r.round, r.slots])).toEqual(BADGES.map((id, i) => [id, i, 1]))
    expect(rstuNs(DEFAULT_UWB_SESSION.slotRstu)).toBe(2 * MS)
    expect(rstuNs(DEFAULT_UWB_SESSION.blockRstu)).toBe(200 * MS)
    const plan = roundPlan(uwbUlTdoaScenario('base').uwb!, UL_ANCHORS.length)
    expect(plan.roundsPerBlock).toBe(100)
    expect(implRow('闪发的发送时刻').sim).toContain(`第 0 到第 ${BADGES.length - 1} 轮`)
    expect(implRow('闪发的发送时刻').sim).toContain(`一个块最多排 ${plan.roundsPerBlock} 个胸牌`)
  })

  it('the sync error: 0 ns here and 1 ns in the variant, and the timestamp noise is 100 ps', () => {
    expect(uwbUlTdoaScenario('base').uwb!.syncErrorNs).toBe(0)
    expect(uwbUlTdoaScenario('sync').uwb!.syncErrorNs).toBe(1)
    expect(implRow('同步误差').sim).toContain('本课场景为 0 ns，变体为 1 ns')
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(implRow('时间戳噪声').sim).toContain('100 ps')
  })

  it('every anchor that hears a blink writes an RMARKER stamp; the reference anchor emits the rest', () => {
    const rs = recs('base')
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx')
    expect(stamps).toHaveLength(BLOCKS * BADGES.length * UL_ANCHORS.length)
    expect(new Set(ofType(rs, 'UWB_TDOA').map((r) => r.node))).toEqual(new Set([REF]))
    expect(new Set(ofType(rs, 'UWB_POSITION').map((r) => r.node))).toEqual(new Set([REF]))
  })

  it('pinning the badges at +20 and −20 ppm leaves the seventy fix errors exactly as they were', () => {
    expect(UWB_PPM_MAX).toBe(20)
    const s = uwbUlTdoaScenario('base')
    const pinned: Scenario = {
      ...s,
      nodes: s.nodes.map((n): NodeCfg => (n.uwb?.role === 'tag'
        ? { ...n, uwb: { ...n.uwb, ppm: Number(n.id.slice(-1)) % 2 === 0 ? 20 : -20 } } : n)),
    }
    const off = [...new Simulation(pinned).runUntil(RUN_NS).records]
    expect(fixErrM(off)).toEqual(fixErrM(recs('base')))
    expect(fixErrM(off)).toHaveLength(BLOCKS * BADGES.length)
    expect(implRow('胸牌的晶振').sim).toContain('+20 与 −20 ppm，七十次定位的误差完全相同')
  })
})

describe('uwb-ul-tdoa · ③ every figure the labs and the summary print is the run', () => {
  it('lab 1: the blink\'s size and air, its four arrival instants, 70 sends all from badges', () => {
    const l = lab('一帧闪发，四个到达时刻')
    const rs = recs('base')
    const rows = tableOf(l, 'badge-1 的第一帧闪发').rows
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx' && r.peer === 'badge-1' && r.t < 2 * MS)
    expect(rows.map((r) => r[0])).toEqual(stamps.map((s) => s.node))
    stamps.forEach((s, i) => expect(rows[i][1]).toBe(`${(s.t / 1000).toFixed(3)} µs`))
    expect(l.expect).toContain(`首尾相差 ${stamps[stamps.length - 1].t - stamps[0].t} ns`)
    expect(l.expect).toContain(`闪发 ${UWB_BLINK_BYTES} 字节、空口时间（airtime）${(uwbPpduNs(UWB_BLINK_BYTES) / 1000).toFixed(1)} µs`)
    const tx = ofType(rs, 'TX_START')
    expect(l.expect).toContain(`共 ${tx.length} 次发送`)
    expect(tx.every((r) => r.node.startsWith('badge-'))).toBe(true)
    expect(ofType(rs, 'RX_OK').filter((r) => r.node.startsWith('badge-'))).toEqual([])
  })

  it('lab 2: the reference anchor\'s three differences and fix for badge-1, at the slot\'s end', () => {
    const l = lab('由基础设施解出的位置')
    const rs = recs('base')
    const rows = tableOf(l, 'badge-1，第 0 块').rows
    const diffs = ofType(rs, 'UWB_TDOA').filter((r) => r.of === 'badge-1' && r.block === 0)
    expect(diffs.map((r) => r.peer)).toEqual(PEERS)
    diffs.forEach((d, i) => {
      expect(rows[i][0]).toBe(`${d.peer} − ${REF}`)
      expect(rows[i][1]).toBe(`${d.dtNs.toFixed(2)} ns`)
      expect(rows[i][2]).toBe(`${d.trueDtNs.toFixed(2)} ns`)
    })
    const fix = ofType(rs, 'UWB_POSITION').find((f) => f.of === 'badge-1')!
    expect(fix.node).toBe(REF)
    expect(rows[3][1]).toBe(`(${fix.x.toFixed(2)}, ${fix.y.toFixed(2)}) m`)
    expect(rows[3][2]).toBe(`(${fix.trueX.toFixed(2)}, ${fix.trueY.toFixed(2)}) m`)
    expect(l.expect).toContain(`第 ${fix.t / MS} ms`)
    expect(l.expect).toContain(`定位误差为 ${Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY).toFixed(2)} m`)
  })

  it('lab 3: the two-scene table, the bias on badge-1 against anchor-2, and the drift east', () => {
    const l = lab('1 ns 的同步误差')
    expect(uwbUlTdoa.variants![l.variant!].label).toBe('1 ns 的同步误差')
    const rows = tableOf(l, '两个场景，各七个块、各 70 次定位').rows
    const scenes: [UwbUlTdoaVariant, number, number][] = [['base', 0, 0], ['sync', 1, 1]]
    for (const [v, i, syncNs] of scenes) {
      const run = recs(v)
      const errs = fixErrM(run)
      expect(errs, v).toHaveLength(BLOCKS * BADGES.length)
      expect(rows[i][1], v).toBe(cm(ulSigmaM(syncNs)))
      expect(rows[i][2], v).toBe(`${Math.max(...diffErrM(run)).toFixed(2)} m`)
      expect(rows[i][3], v).toBe(`${(Math.min(...errs) * 100).toFixed(1)}–${(Math.max(...errs) * 100).toFixed(1)} cm`)
      expect(rows[i][4], v).toBe(cm(mean(errs)))
    }
    expect(rows[1][0]).toBe(uwbUlTdoa.variants![0].label)
    // the summary quotes the two means
    expect(uwbUlTdoa.why).toContain(`同步误差为 0 时平均定位误差为 ${cm(mean(fixErrM(recs('base'))))}`)
    expect(uwbUlTdoa.why).toContain(`为 1 ns 时增大到 ${cm(mean(fixErrM(recs('sync'))))}`)
    // badge-1 against anchor-2: all seven short, by 1.15 ns on average
    const bias = ofType(recs('sync'), 'UWB_TDOA').filter((r) => r.peer === 'anchor-2' && r.of === 'badge-1').map((r) => r.dtNs - r.trueDtNs)
    expect(bias).toHaveLength(BLOCKS)
    expect(bias.every((b) => b < 0)).toBe(true)
    expect(l.expect).toContain(`七个时间差全部偏短，平均偏短 ${(-mean(bias)).toFixed(2)} ns`)
    // every badge's mean fix moved east, by 12 to 22 cm
    const dx = BADGES.map((id) => mean(ofType(recs('sync'), 'UWB_POSITION').filter((f) => f.of === id).map((f) => f.x - f.trueX)) * 100)
    expect(dx.every((d) => d > 0)).toBe(true)
    expect(l.expect).toContain(`偏移量为 ${Math.min(...dx).toFixed(0)} 到 ${Math.max(...dx).toFixed(0)} cm`)
    // "空口上没有任何变化"
    expect(ofType(recs('sync'), 'TX_START').map((r) => [r.t, r.node, r.frame.bytes]))
      .toEqual(ofType(recs('base'), 'TX_START').map((r) => [r.t, r.node, r.frame.bytes]))
    // the formula note's σ_ts
    const f = l.blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(f.note).toContain(`σ_ts = ${DEFAULT_UWB_SESSION.tsNoisePs} ps`)
  })
})
