/**
 * `@uwb-dl-tdoa`, in the standard-first shape (2026-11-10).
 *
 * ① teaches IEEE Std 802.15.4-2024 §10.29.1.2.5's second TDOA case only. ② says plainly that the
 * engine runs a FiRa-style round between unsynchronised anchors instead, with TXT, RXT and COFF
 * IEs the standard does not define (docs/uwb-standard-audit.md #15, W4) — and the rows are checked
 * against the frames the engine actually sends.
 *
 * Every figure the labs print is read back out of the lesson's own text and compared with a run,
 * so editing a number without the engine agreeing turns this red, and so does an engine change
 * (W4 will make one) that moves a number the lesson still prints.
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
import { C_M_PER_NS, UWB_PPM_MAX, rstuNs, uwbPpduNs } from '../../src/uwb/phy'
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
    for (const clause of ['§10.29.1.1', '§10.29.1.2.5', '§10.32.2', '表 10-164']) expect(std, clause).toContain(clause)
    for (const invented of ['TXT', 'RXT', 'COFF', '参考锚点', '胸牌', 'anchor-']) expect(std, invented).not.toContain(invented)
    expect(std).toContain('已知的发送时刻偏移')
  })

  it('② is not all faithful, and says each invented IE is not in the standard', () => {
    const kinds = uwbDlTdoa.implementation!.map((r) => r.kind)
    expect(kinds.filter((k) => k !== 'faithful').length).toBeGreaterThan(0)
    for (const topic of ['TXT 与 RXT 信息单元', 'COFF 信息单元']) {
      expect(implRow(topic).kind).toBe('differs')
      expect(implRow(topic).standard).toContain('标准里没有')
      expect(implRow(topic).sim).toContain('待改正的偏差')
    }
    expect(implRow('固定节点是否同步').kind).toBe('differs')
    expect(implRow('移动设备的时钟').kind).toBe('differs')
  })
})

describe('uwb-dl-tdoa · ② says what the engine does, and the engine does it', () => {
  it('the Poll: ARC with Ranging Round Usage 0 and Multi-node Mode 1, and an RDM over slots 1–3', () => {
    const poll = firstTx('uwbPoll', REF)
    expect(poll.uwb?.arc?.roundUsage).toBe(0)
    expect(poll.uwb?.arc?.multiNode).toBe(1)
    expect(poll.uwb?.ies).toContain('RDM')
    expect(poll.uwb?.schedule).toEqual(RESPONDERS)
    expect(implRow('测距轮用途').sim).toContain('Ranging Round Usage 为 0')
    expect(implRow('测距轮用途').sim).toContain('Multi-node Mode 为 1')
  })

  it('the frames really carry TXT, RXT and COFF — the elements ② calls not in the standard', () => {
    expect(firstTx('uwbPoll', REF).uwb?.ies).toContain('TXT')
    expect(firstTx('uwbResp', RESPONDERS[0]).uwb?.ies).toEqual(expect.arrayContaining(['TXT', 'RXT', 'COFF']))
    expect(firstTx('uwbFinal', REF).uwb?.ies).toEqual(expect.arrayContaining(['TXT', 'RXT']))
  })

  it('the crystals ② quotes are the draw, inside the ±20 ppm of §16.4.9', () => {
    expect(UWB_PPM_MAX).toBe(20)
    const row = implRow('晶振容差').sim
    expect(row).toContain(`anchor-1 为 ${drawnPpm(REF).toFixed(2).replace('-', '−')} ppm`)
    const badges = ['badge-1', 'badge-2', 'badge-3'].map((id) => drawnPpm(id).toFixed(2))
    expect(row).toContain(`${badges[0]}、${badges[1]} 与 ${badges[2]} ppm`)
  })

  it('the noise values and the slot plan ② quotes are the session defaults', () => {
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(implRow('接收时间戳').sim).toContain('100 ps')
    expect(DEFAULT_UWB_SESSION.cfoNoisePpm).toBe(0.2)
    expect(implRow('COFF 信息单元').sim).toContain('0.2 ppm')
    expect(rstuNs(DEFAULT_UWB_SESSION.slotRstu)).toBe(2 * MS)
    expect(rstuNs(DEFAULT_UWB_SESSION.blockRstu)).toBe(200 * MS)
    expect(ofType(recs('base'), 'UWB_ROUND')[0].slots).toBe(5)
  })

  it('the solver checks nothing before it fails: no fix comes out of the raw run at all', () => {
    expect(implRow('求交点').sim).toContain('求解前不检查')
    expect(ofType(recs('raw'), 'UWB_POSITION')).toEqual([])
  })
})

describe('uwb-dl-tdoa · ③ every figure the labs print is the run', () => {
  it('lab 1: five frames a round, their sizes, airtimes and IEs; 35 sends, none from a badge', () => {
    const l = lab('锚点自行发起的一轮')
    const rows = tableOf(l, '一轮五帧，每块一次').rows
    const tx = ofType(recs('base'), 'TX_START')
    const round0 = tx.filter((r) => r.t < 200 * MS)
    expect(round0.map((r) => [r.node, r.frame.uwb?.slot])).toEqual([[REF, 0], ...RESPONDERS.map((id, i) => [id, i + 1]), [REF, 4]])
    const shown: [number, { bytes: number; txTimeNs: number; uwb?: { ies?: string[] } }][] = [
      [0, round0[0].frame], [1, round0[1].frame], [2, round0[4].frame],
    ]
    for (const [i, f] of shown) {
      expect(rows[i][3], rows[i][2]).toBe(`${f.bytes} B, ${(uwbPpduNs(f.bytes) / 1000).toFixed(1)} µs`)
      expect(f.txTimeNs).toBe(uwbPpduNs(f.bytes))
      expect(rows[i][4], rows[i][2]).toBe(f.uwb!.ies!.join('、'))
    }
    // all three Responses are alike
    for (const r of round0.slice(1, 4)) expect([r.frame.bytes, r.frame.uwb?.ies]).toEqual([round0[1].frame.bytes, round0[1].frame.uwb?.ies])
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

  it('lab 3: the raw run — 63 differences, no fix, and a bias that is the crystal gap times the wait', () => {
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
    expect(l.steps.join(' ')).toContain(`修正后 ${ofType(base, 'UWB_POSITION').length} 次`)
    expect(l.expect).toContain(`有 ${ofType(raw, 'UWB_TDOA').length} 个时间差、${ofType(raw, 'UWB_POSITION').length} 次定位`)
    const gap = drawnPpm('badge-2') - drawnPpm(REF)
    expect(l.expect).toContain(`${gap.toFixed(2)} ppm`)
    // "约等于" the gap times the wait: within the 1σ COFF residual (0.2 ppm of the same wait)
    RESPONDERS.forEach((p, i) => {
      const waitNs = (i + 1) * rstuNs(DEFAULT_UWB_SESSION.slotRstu)
      const predicted = waitNs * gap * 1e-6 * C_M_PER_NS
      const sigma = waitNs * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * C_M_PER_NS
      expect(Math.abs(mean(diffBiasM(raw, p, 'badge-2')) - predicted), p).toBeLessThan(sigma)
    })
    // "最后应答的 anchor-4 误差最大"
    const maxima = RESPONDERS.map((p) => Math.max(...diffErrM(base, p)))
    expect(Math.max(...maxima)).toBe(maxima[2])
    // the why's 「七个块里一次定位也解不出来」
    expect(uwbDlTdoa.why).toContain('七个块里一次定位也解不出来')
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
