/**
 * `@uwb-dl-tdoa`, in the standard-first shape (2026-11-10).
 *
 * ① teaches IEEE Std 802.15.4-2024 §10.29.1.2.5's second TDOA case only. ② is checked against the
 * frames the engine actually sends: since 2026-11-11 (W4, docs/uwb-standard-audit.md #15) that is the
 * standard's own case — the controller's RCM (ARC Ranging Round Usage = 0, RR, RDM) and one bare
 * ranging message per synchronized anchor (Figure 10-225 "<OWR>"); until then a FiRa-style round with
 * TXT, RXT and COFF IEs the standard does not define.
 *
 * Every figure the labs print is read back out of the lesson's own text and compared with a run,
 * so editing a number without the engine agreeing turns this red, and so does an engine change
 * that moves a number the lesson still prints.
 */
import { describe, expect, it } from 'vitest'
import {
  DL_ANCHORS, TAG_COUNT, uwbDlTdoa, uwbDlTdoaScenario, type UwbDlTdoaVariant,
} from '../../src/course/uwb/uwb-dl-tdoa'
import { Rng } from '../../src/engine/rng'
import { hashStr } from '../../src/engine/hash'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { C_M_PER_NS, UWB_FCS_BYTES, UWB_MHR_BYTES, UWB_PPM_MAX, rstuNs, uwbPpduNs } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven blocks: block 6 starts at 1.200 s and its 10 ms round is finished by 1.300 s. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const REF = DL_ANCHORS[0].id
const RESPONDERS = DL_ANCHORS.slice(1).map((a) => a.id)
const VARIANT_INDEX: Record<UwbDlTdoaVariant, number | undefined> = { base: undefined, raw: 0, ten: 1 }

const recs = (v: UwbDlTdoaVariant): TLRecord[] => runOf(uwbDlTdoa, VARIANT_INDEX[v], RUN_NS)

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const diffErrM = (rs: TLRecord[], peer: string): number[] =>
  ofType(rs, 'UWB_TDOA').filter((r) => r.peer === peer).map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
const diffBiasM = (rs: TLRecord[], peer: string, node: string): number[] =>
  ofType(rs, 'UWB_TDOA').filter((r) => r.peer === peer && r.node === node).map((r) => (r.dtNs - r.trueDtNs) * C_M_PER_NS)
const airNs = (rs: TLRecord[]): number => ofType(rs, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)

/** The crystal the engine draws for a node (UwbClock.fromRng's first draw on the node's own stream). */
const drawnPpm = (id: string, seed = 7): number =>
  (new Rng(seed).fork(hashStr(`${id}#uwb`)).next() * 2 - 1) * UWB_PPM_MAX

const lab = (heading: string): Lab => {
  const l = uwbDlTdoa.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbDlTdoa.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const firstTx = (kind: string, src: string) =>
  ofType(recs('base'), 'TX_START').find((r) => r.frame.kind === kind && r.frame.src === src)!.frame

lessonShapeSuite(uwbDlTdoa, { runNs: RUN_NS })

describe('uwb-dl-tdoa · the lesson', () => {
  it('is in the standard-first shape, in the one-way ranging module', () => {
    expect(isStandardFirst(uwbDlTdoa)).toBe(true)
    expect(uwbDlTdoa.module).toBe(25)
    expect(MODULES[uwbDlTdoa.module]).toBeDefined()
    expect(uwbDlTdoa.limits).toEqual([])
    expect(uwbDlTdoa.observe).toEqual([])
    expect(uwbDlTdoa.tryThis).toEqual([])
    expect(uwbDlTdoa.needs).toEqual(['uwb-geometry'])
    expect(uwbDlTdoa.terms!.map((t) => t.term)).toEqual(['TDoA', 'DL-TDoA', 'hyperbola', 'clock correction'])
  })

  it('cites each clause it teaches in ①, and ① names no simulator element', () => {
    const std = uwbDlTdoa.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.29.1.1', '§10.29.1.2.5', '§10.32.2', '表 10-164', '图 10-225', '§10.32.9.8']) expect(std, clause).toContain(clause)
    for (const invented of ['TXT', 'RXT', 'COFF', '参考锚点', '胸牌', 'anchor-']) expect(std, invented).not.toContain(invented)
    expect(std).toContain('已知的发送时刻偏移')
  })

  // 2026-11-11 (W4, audit #15): the engine runs §10.29.1.2.5's second case with the standard's own
  // frames, so no ② row is "differs" any more and none names an invented IE.
  it('② has no "differs" row and names no invented IE; the absent row is the measurement report', () => {
    const kinds = uwbDlTdoa.implementation!.map((r) => r.kind)
    expect(kinds).not.toContain('differs')
    const all = uwbDlTdoa.implementation!.map((r) => `${r.topic} ${r.standard} ${r.sim}`).join(' ')
    for (const invented of ['TXT', 'RXT', 'COFF']) expect(all, invented).not.toContain(invented)
    expect(implRow('测量报告阶段').kind).toBe('absent')
    expect(implRow('固定节点是否同步').kind).toBe('faithful')
    expect(implRow('发送时刻偏移').kind).toBe('faithful')
    expect(implRow('同步的方式与精度').kind).toBe('choice')
    expect(implRow('移动设备的时钟').kind).toBe('choice')
  })
})

describe('uwb-dl-tdoa · ② says what the engine does, and the engine does it', () => {
  it('the RCM: ARC with Ranging Round Usage 0, Multi-node Mode 1, Schedule Mode 1, and an RDM over slots 1–4', () => {
    const rcm = firstTx('uwbRcm', REF)
    expect(rcm.uwb?.slot).toBe(0)
    expect(rcm.uwb?.arc?.roundUsage).toBe(0)
    expect(rcm.uwb?.arc?.multiNode).toBe(1)
    expect(rcm.uwb?.arc?.scheduleMode).toBe(1)
    expect(rcm.uwb?.ies).toEqual(['ARC', 'RR', 'RDM'])
    expect(rcm.uwb?.rdm).toEqual(DL_ANCHORS.map((a, i) => ({ id: a.id, slot: i + 1, initiator: false })))
    const row = implRow('测距控制消息').sim
    for (const s of ['Ranging Round Usage 为 0', 'Multi-node Mode 为 1', 'Schedule Mode 为 1', 'anchor-1 到 anchor-4 依次指定第 1 到 4 号时隙']) {
      expect(row, s).toContain(s)
    }
  })

  it('no frame carries a time: the ranging messages are bare 11-octet broadcasts sent on the slot boundary', () => {
    const tx = ofType(recs('base'), 'TX_START')
    for (const r of tx.filter((x) => x.frame.kind === 'uwbResp')) {
      expect(r.frame.uwb?.ies).toEqual([])
      expect(r.frame.bytes).toBe(UWB_MHR_BYTES + UWB_FCS_BYTES)
      expect(r.frame.dst).toBe('*')
      // the known offset: anchor k sends exactly at the start of slot k + 1
      const k = DL_ANCHORS.findIndex((a) => a.id === r.node)
      expect(r.t % (200 * MS)).toBe((k + 1) * rstuNs(DEFAULT_UWB_SESSION.slotRstu))
    }
    expect(implRow('测距消息的内容').sim).toContain(`${UWB_MHR_BYTES + UWB_FCS_BYTES} 字节`)
    for (const r of tx) expect(r.frame.uwb).not.toHaveProperty('dl')
  })

  it('the badge crystals ② quotes are the draw, inside the ±20 ppm of §16.4.9', () => {
    expect(UWB_PPM_MAX).toBe(20)
    const row = implRow('晶振容差').sim
    const badges = ['badge-1', 'badge-2', 'badge-3'].map((id) => drawnPpm(id).toFixed(2))
    expect(row).toContain(`${badges[0]}、${badges[1]} 与 ${badges[2]} ppm`)
  })

  it('the noise values and the slot plan ② quotes are the session defaults', () => {
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(implRow('接收时间戳').sim).toContain('100 ps')
    expect(DEFAULT_UWB_SESSION.cfoNoisePpm).toBe(0.2)
    expect(implRow('移动设备的时钟').sim).toContain('0.2 ppm')
    expect(rstuNs(DEFAULT_UWB_SESSION.slotRstu)).toBe(2 * MS)
    expect(rstuNs(DEFAULT_UWB_SESSION.blockRstu)).toBe(200 * MS)
    expect(ofType(recs('base'), 'UWB_ROUND')[0].slots).toBe(5)
  })

  it('the solver checks nothing before it solves: the raw run still produces fixes, metres off', () => {
    expect(implRow('求交点').sim).toContain('求解前不检查')
    expect(ofType(recs('raw'), 'UWB_POSITION').length).toBeGreaterThan(0)
  })
})

describe('uwb-dl-tdoa · ③ every figure the labs print is the run', () => {
  it('lab 1: five frames a round, their sizes, airtimes and IEs; 35 sends, none from a badge', () => {
    const l = lab('锚点自行完成的一轮')
    const rows = tableOf(l, '一轮五帧，每块一次').rows
    const tx = ofType(recs('base'), 'TX_START')
    const round0 = tx.filter((r) => r.t < 200 * MS)
    expect(round0.map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot])).toEqual([
      [REF, 'uwbRcm', 0], ...DL_ANCHORS.map((a, i) => [a.id, 'uwbResp', i + 1]),
    ])
    const shown: [number, { bytes: number; txTimeNs: number; uwb?: { ies?: string[] } }][] = [
      [0, round0[0].frame], [1, round0[1].frame],
    ]
    for (const [i, f] of shown) {
      expect(rows[i][3], rows[i][2]).toBe(`${f.bytes} B, ${(uwbPpduNs(f.bytes) / 1000).toFixed(1)} µs`)
      expect(f.txTimeNs).toBe(uwbPpduNs(f.bytes))
      expect(rows[i][4], rows[i][2]).toBe(f.uwb!.ies!.length === 0 ? '无' : f.uwb!.ies!.join('、'))
    }
    // all four ranging messages are alike
    for (const r of round0.slice(1)) expect([r.frame.bytes, r.frame.uwb?.ies]).toEqual([round0[1].frame.bytes, round0[1].frame.uwb?.ies])
    expect(l.expect).toContain(`共 ${tx.length} 次发送`)
    expect(tx).toHaveLength(BLOCKS * 5)
    expect(tx.filter((r) => r.node.startsWith('badge-'))).toEqual([])
    expect(l.expect).toContain(`七个块`)
  })

  it('lab 2: badge-1\'s three differences and its fix in block 0, at 10 ms', () => {
    const l = lab('第一个时间差和由它解出的位置')
    const rows = tableOf(l, 'badge-1，第 0 块').rows
    const rs = recs('base')
    const diffs = ofType(rs, 'UWB_TDOA').filter((r) => r.node === 'badge-1' && r.block === 0)
    expect(diffs.map((r) => r.peer)).toEqual(RESPONDERS)
    diffs.forEach((d, i) => {
      expect(rows[i][0]).toBe(`${d.peer} − ${REF}`)
      expect(rows[i][1]).toBe(`${d.dtNs.toFixed(2)} ns`)
      expect(rows[i][2]).toBe(`${d.trueDtNs.toFixed(2)} ns`)
    })
    const fix = ofType(rs, 'UWB_POSITION').find((f) => f.node === 'badge-1')!
    expect(fix.block).toBe(0)
    expect(rows[3][1]).toBe(`(${fix.x.toFixed(2)}, ${fix.y.toFixed(2)}) m`)
    expect(rows[3][2]).toBe(`(${fix.trueX.toFixed(2)}, ${fix.trueY.toFixed(2)}) m`)
    expect(l.expect).toContain(`第 ${fix.t / MS} ms`)
    expect(diffs.every((d) => d.t === fix.t)).toBe(true)
    expect(l.expect).toContain(`定位误差为 ${Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY).toFixed(2)} m`)
    expect(fmtRecord(fix)).toContain(`error ${Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY).toFixed(2)} m`)
    expect(ofType(rs, 'UWB_RANGE')).toEqual([])
  })

  it('lab 3: the raw run — 63 differences, 14 fixes metres off, none for badge-2; the bias is the badge crystal times the offset', () => {
    const l = lab('关闭时钟修正')
    expect(uwbDlTdoa.variants![l.variant!].label).toBe('关闭时钟修正')
    const rows = tableOf(l, '胸牌的晶振带来的偏差').rows
    const raw = recs('raw')
    const base = recs('base')
    RESPONDERS.forEach((p, i) => {
      expect(rows[i][0]).toBe(p)
      expect(rows[i][1]).toBe(`${(i + 1) * rstuNs(DEFAULT_UWB_SESSION.slotRstu) / MS} ms`)
      expect(rows[i][2]).toBe(`${mean(diffBiasM(raw, p, 'badge-2')).toFixed(2)} m`)
      expect(rows[i][3]).toBe(`${Math.max(...diffErrM(base, p)).toFixed(2)} m`)
    })
    expect(ofType(base, 'UWB_TDOA')).toHaveLength(21 * 3)
    expect(l.steps.join(' ')).toContain(`修正后 ${ofType(base, 'UWB_POSITION').length} 次定位所用的 ${ofType(base, 'UWB_TDOA').length} 个时间差`)
    const rawFixes = ofType(raw, 'UWB_POSITION')
    expect(l.expect).toContain(`仍有 ${ofType(raw, 'UWB_TDOA').length} 个时间差，定位只有 ${rawFixes.length} 次`)
    expect(new Set(rawFixes.map((f) => f.node))).toEqual(new Set(['badge-1', 'badge-3']))
    const errs = rawFixes.map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
    expect(l.expect).toContain(`误差 ${Math.min(...errs).toFixed(2)} 到 ${Math.max(...errs).toFixed(2)} m`)
    expect(l.expect).toContain('badge-2 一次也定不了位')
    // the anchors are synchronized (0 ppm), so the gap is the badge's own crystal
    const ppm = drawnPpm('badge-2')
    expect(l.expect).toContain(`${ppm.toFixed(2)} ppm`)
    expect(Math.abs(ppm)).toBeGreaterThan(Math.abs(drawnPpm('badge-1')))
    expect(Math.abs(ppm)).toBeGreaterThan(Math.abs(drawnPpm('badge-3')))
    // "约等于" the crystal times the offset: within the timestamp noise of 21 means
    RESPONDERS.forEach((p, i) => {
      const offsetNs = (i + 1) * rstuNs(DEFAULT_UWB_SESSION.slotRstu)
      const predicted = offsetNs * ppm * 1e-6 * C_M_PER_NS
      expect(Math.abs(mean(diffBiasM(raw, p, 'badge-2')) - predicted), p).toBeLessThan(0.05)
    })
    // "发送偏移最大的 anchor-4 误差最大"
    const maxima = RESPONDERS.map((p) => Math.max(...diffErrM(base, p)))
    expect(Math.max(...maxima)).toBe(maxima[2])
    // the why's figures
    expect(uwbDlTdoa.why).toContain('badge-2 七个块里一次也定不了位')
    expect(uwbDlTdoa.why).toContain(`偏离 ${Math.round(Math.min(...errs))} 到 ${Math.round(Math.max(...errs))} m`)
  })

  it('lab 4: ten badges cost the anchors nothing — same frames, same air; 21 fixes become 70', () => {
    const l = lab('三个胸牌与十个胸牌')
    expect(uwbDlTdoa.variants![l.variant!].label).toBe('十个胸牌')
    const rows = tableOf(l, '七个块，两个场景').rows
    const scenes: [UwbDlTdoaVariant, number][] = [['base', 0], ['ten', 1]]
    for (const [v, i] of scenes) {
      const rs = recs(v)
      const air = (airNs(rs) / MS).toFixed(6)
      expect(rows[i][1], v).toBe(String(ofType(rs, 'TX_START').length))
      expect(rows[i][2], v).toBe(`${air.slice(0, -3)} ${air.slice(-3)} ms`)
      expect(rows[i][3], v).toBe(String(ofType(rs, 'UWB_TDOA').length))
      expect(rows[i][4], v).toBe(String(ofType(rs, 'UWB_POSITION').length))
      expect(ofType(rs, 'UWB_POSITION'), v).toHaveLength(BLOCKS * TAG_COUNT[v])
    }
    expect(rows[1][0]).toBe(uwbDlTdoa.variants![1].label)
    expect(ofType(recs('ten'), 'TX_START').map((r) => [r.t, r.node, r.frame.kind, r.frame.bytes]))
      .toEqual(ofType(recs('base'), 'TX_START').map((r) => [r.t, r.node, r.frame.kind, r.frame.bytes]))
    expect(l.expect).toContain(`从 ${ofType(recs('base'), 'UWB_POSITION').length} 次增加到 ${ofType(recs('ten'), 'UWB_POSITION').length} 次`)
  })

  it('the scene still builds the same nodes it always did', () => {
    const s = uwbDlTdoaScenario('base')
    expect(s.uwb!.mode).toBe('dl-tdoa')
    expect(s.nodes.filter((n) => n.uwb?.role === 'tag')).toHaveLength(3)
  })
})
