/**
 * `@uwb-subrounds`, in the standard-first shape (2026-11-10).
 *
 * ① teaches the draft's two shapes and the adopted resolution 15-25/0681r1 — Predicted Reply Time in
 * the Response Compact frame — which superseded the fixed reply time and reversed order of
 * 15-25/0224r2 and 15-25/0556r2. ② (2026-11-11, W5): the engine implements the Predicted Reply Time
 * (audit #6) and the draft's interleaved layout (audit #22).
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run or
 * with the layout the engine schedules.
 */
import { describe, expect, it } from 'vitest'
import {
  SUBROUND_ANCHORS, SUBROUND_RESPONDERS, SUBROUND_SLOT_RSTU, SUBROUND_TAG_X,
  uwbSubrounds, uwbSubroundsScenario, uwbSubroundsTiming,
} from '../../src/course/uwb/uwb-subrounds'
import { ScenarioSchema } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { MS_RSTU, rsfNs } from '../../src/uwb/mms'
import { roundPlan, rstuNs } from '../../src/uwb/session'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One 200 ms ranging block: long enough for a 43 ms non-interleaved round and its report phase. */
const BLOCK_NS = 200 * MS
const INTERLEAVED = 0
const SP0 = 1
const PREDICTED = 2

const recs = (v?: number) => runOf(uwbSubrounds, v, BLOCK_NS)
const ms3 = (ns: number): string => (ns / MS).toFixed(3)
const SLOT_NS = rstuNs(SUBROUND_SLOT_RSTU)
const planOf = (variant: Parameters<typeof uwbSubroundsScenario>[0]) =>
  roundPlan(uwbSubroundsScenario(variant).uwb!, SUBROUND_RESPONDERS)

const lab = (heading: string): Lab => {
  const l = uwbSubrounds.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbSubrounds.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbSubrounds.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(uwbSubrounds, { runNs: 60 * MS })

describe('uwb-subrounds · the lesson', () => {
  it('is in the standard-first shape, closing the UWB-driven trio', () => {
    expect(isStandardFirst(uwbSubrounds)).toBe(true)
    expect(MODULES[uwbSubrounds.module].title).toBe('另一种控制面与子轮')
    expect(COURSE_ORDER.indexOf('uwb-subrounds')).toBe(COURSE_ORDER.indexOf('uwb-acquisition') + 1)
    expect(uwbSubrounds.needs).toEqual(['uwb-uwbd', 'uwb-slot-budget'])
    expect([uwbSubrounds.limits, uwbSubrounds.observe, uwbSubrounds.tryThis]).toEqual([[], [], []])
    for (const sc of [uwbSubrounds.scenario(), ...uwbSubrounds.variants!.map((v) => v.scenario())]) {
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
      expect(sc.uwb!.mms.control).toBe('uwbd')
    }
    expect(SUBROUND_ANCHORS.map((a) => a.x - SUBROUND_TAG_X)).toEqual([3, 6, 9])
  })

  it('① teaches the two shapes, the adopted resolution, and names the superseded proposals as superseded', () => {
    const std = stdText()
    for (const s of ['§10.39.7', '15-25/0292r1', '15-25/0681r1', '15-26/0006r0', '§10.39.11.3.6', '§10.39.11.3.10',
      'Predicted Reply Time', '5 个八位组', '15-25/0224r2', '15-25/0556r2', '§10.29.6.5', '12/13/1', '15-26/0425r0',
      '15-24/0633r1', '500 µs', '15-25/0213r2', 'CID 474']) {
      expect(std, s).toContain(s)
    }
    expect(std).toContain('只用于非交织形态')
    expect(std).toContain('反序没有出现在决议里')
  })
})

describe('uwb-subrounds · the quiz quotes the millisecond in RSTU', () => {
  // Planting (2026-11-10) found this figure written nowhere under tests/.
  it('1 ms is MS_RSTU = 1 200 RSTU (15-22/0381r5 §1.1.3)', () => {
    const quiz = uwbSubrounds.quiz.map((q) => q.explain).join(' ')
    expect(quiz).toContain(`${MS_RSTU.toLocaleString('en').replace(',', ' ')} RSTU`)
  })
})

describe('uwb-subrounds · ② says what the engine does, and the engine does it', () => {
  // 2026-11-11 (W5): the Predicted Reply Time is implemented (audit #6), the interleaved layout is
  // the draft's (audit #22), and the superseded proposals are gone.
  it('the interleaved layout and the Predicted Reply Time are faithful; the proposals absent', () => {
    expect(implRow('交织形态').kind).toBe('faithful')
    expect(implRow('预测回复时间').kind).toBe('faithful')
    expect(implRow('固定回复时间与反序').kind).toBe('absent')
    for (const v of [undefined, INTERLEAVED, SP0, PREDICTED]) {
      const mms = (v === undefined ? uwbSubrounds.scenario() : uwbSubrounds.variants![v].scenario()).uwb!.mms as unknown as Record<string, unknown>
      expect('fixedReplyRstu' in mms || 'reversedOrder' in mms, String(v)).toBe(false)
    }
  })

  it('non-interleaved: one device a sub-round, 20 slots each, a 6-slot report phase, 86 in all', () => {
    const l = planOf('base').mms!.layout
    const sim = implRow('一对多非交织的排法').sim
    expect(l.subRounds).toBe(SUBROUND_RESPONDERS + 1)
    expect(sim).toContain(`每个子轮 ${l.rpSlots} 个时隙`)
    expect(sim).toContain(`${l.reportSlots} 个时隙的报告阶段，一轮共 ${l.slots} 个时隙`)
    expect(implRow('非交织子轮').sim).toContain(`${SUBROUND_SLOT_RSTU} RSTU 的时隙上是 ${l.fragGapSlots} 个时隙、${l.fragGapSlots * SLOT_NS / MS} ms`)
    expect(l.fragGapSlots).toBe(Math.ceil(MS_RSTU / SUBROUND_SLOT_RSTU))
  })

  it('interleaved: a pair sub-round per responder, a millisecond apart, the responder a slot behind', () => {
    const l = planOf('interleaved').mms!.layout
    expect([l.fragGapSlots, l.respOffsetSlots, l.subRounds]).toEqual([2, 1, SUBROUND_RESPONDERS])
    expect(l.fragGapSlots * SLOT_NS).toBe(MS)
    expect(implRow('交织形态').sim).toContain(`每个子轮 ${l.slots / l.subRounds} 个时隙，一轮 ${l.slots} 个`)
  })

  it('the predicted variant carries the Predicted Reply Time in every RESP, and no responder reports', () => {
    const rs = recs(PREDICTED)
    const resps = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp0' && r.frame.uwb?.sp0?.role === 'resp')
    expect(resps).toHaveLength(SUBROUND_RESPONDERS)
    for (const r of resps) expect(r.frame.uwb!.sp0!.predictedReplyRctu).toBeGreaterThan(0)
    const reports = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp0' && r.frame.uwb?.sp0?.role === 'report')
    expect(reports.every((r) => r.node === 'tag-1')).toBe(true)
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
  })
})

describe('uwb-subrounds · ③ every figure the labs print is the run', () => {
  it('lab 1: the two-shapes table is the layout and the run', () => {
    const rows = tableOf(lab('两种形态，同一个房间'), '同一个房间，两种形态').rows
    const tagRsf = (v?: number) => ofType(recs(v), 'TX_START').filter((r) => r.frame.kind === 'uwbRsf' && r.node === 'tag-1' && r.t < 200 * MS)
    const gaps = (v?: number): number[] => {
      const ts = tagRsf(v).map((r) => r.t).slice(0, 8)
      return ts.slice(1).map((t, i) => t - ts[i])
    }
    for (const [col, variant, v] of [[1, 'interleaved', INTERLEAVED], [2, 'base', undefined]] as const) {
      const l = planOf(variant).mms!.layout
      expect(rows[0][col]).toBe(String(l.subRounds))
      expect(rows[1][col]).toBe(`每子轮 ${l.rpSlots} 时隙`)
      expect(rows[2][col]).toBe(`${l.slots} 时隙 · ${l.slots * SLOT_NS / MS} ms`)
      expect(new Set(gaps(v))).toEqual(new Set([l.fragGapSlots * SLOT_NS]))
      expect(rows[3][col]).toBe(`${l.fragGapSlots} 时隙 · ${l.fragGapSlots * SLOT_NS / MS} ms`)
      expect(rows[4][col]).toBe(`${gaps(v).reduce((a, b) => a + b, 0) / MS} ms`)
      expect(rows[5][col]).toBe(String(tagRsf(v).length))
      expect(rows[6][col]).toBe(String(ofType(recs(v), 'UWB_RANGE').length))
    }
  })

  it('lab 1: the round line as the log prints it, in both shapes', () => {
    const e = lab('两种形态，同一个房间').expect
    const m = /([\d.]+) ms 那一行写着 “([^”]+)”，交织场景是 (\d+) slots/.exec(e)
    expect(m).not.toBeNull()
    const r0 = ofType(recs(), 'UWB_ROUND')[0]
    expect(m![1]).toBe(ms3(r0.t))
    expect(fmtRecord(r0)).toContain(m![2])
    expect(fmtRecord(ofType(recs(INTERLEAVED), 'UWB_ROUND')[0])).toContain(`${m![3]} slots`)
    expect(e).toContain(`每块都得到 ${ofType(recs(), 'UWB_RANGE').length} 个距离`)
    expect(ofType(recs(INTERLEAVED), 'UWB_RANGE')).toHaveLength(ofType(recs(), 'UWB_RANGE').length)
  })

  it('lab 1: the figure draws four lanes at the slots the layout names', () => {
    const spec = uwbSubroundsTiming()
    expect(spec.lanes.map((l) => l.spans.length)).toEqual([24, 24, 8, 24])
    for (const l of spec.lanes) for (const s of l.spans) expect(s.toUs - s.fromUs).toBeCloseTo(rsfNs(40, 64) / 1000, 6)
  })

  it('lab 2: the sub-round boundary, the verdicts and the ranges', () => {
    const e = lab('子轮的边界').expect
    const rs = recs()
    const tagFrags = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRsf' && r.node === 'tag-1').slice(0, 8)
    expect(e).toContain(`在 ${tagFrags[0].t / MS} 到 ${tagFrags[7].t / MS} ms 之间发完`)
    const firstAnchor = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbRsf' && r.node !== 'tag-1')!
    expect(e).toContain(`第一个锚点在 ${ms3(firstAnchor.t)} ms 开始发送`)
    const tr = ofType(rs, 'UWB_MMS_TRAIN')
    const anchorT = [...new Set(tr.filter((t) => t.node !== 'tag-1').map((t) => ms3(t.t)))]
    expect(anchorT).toHaveLength(1)
    expect(e).toContain(`三个锚点的判定都在 ${anchorT[0]} ms`)
    expect(e).toContain(`标签的三条判定在 ${tr.filter((t) => t.node === 'tag-1').map((t) => ms3(t.t)).join('、')} ms`)
    const ranges = ofType(rs, 'UWB_RANGE')
    expect(e).toContain(`${ranges.length === 6 ? '六' : '?'}个距离出现在 ${ms3(ranges[0].t)} 到 ${ms3(ranges.at(-1)!.t)} ms 之间`)
    const mine = ranges.filter((r) => r.node === 'tag-1')
    expect(e).toContain(`标签测得的三个距离是 ${mine.map((r) => r.distM.toFixed(2)).join('、').replace(/、([^、]+)$/, ' 与 $1')} m，真值 ${mine.map((r) => r.trueDistM.toFixed(0)).join('、')} m`)
  })

  it('lab 3: the predicted-reply table, off against on', () => {
    const l3 = lab('应答帧带上预测回复时间')
    const rows = tableOf(l3, '预测回复时间：关闭与打开').rows
    const off = recs(SP0)
    const on = recs(PREDICTED)
    const sp0 = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp0' && r.t < 200 * MS)
    expect(rows[0].slice(1)).toEqual([`${sp0(off).length} 个`, `${sp0(on).length} 个`])
    const reports = (rs: TLRecord[]) => sp0(rs).filter((r) => r.frame.uwb?.sp0?.role === 'report' && r.node !== 'tag-1').length
    expect(rows[1].slice(1)).toEqual([`${reports(off)} 个`, `${reports(on)} 个`])
    const mine = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.t < 200 * MS)
    expect(rows[2].slice(1)).toEqual([`${ms3(mine(off)[0].t)} ms`, `${ms3(mine(on)[0].t)} ms`])
    const d = (rs: TLRecord[]) => `${mine(rs).map((r) => r.distM.toFixed(2)).join('、')} m`
    expect(rows[3][0]).toBe(`标签测得的三个距离，真值 ${mine(on).map((r) => r.trueDistM.toFixed(0)).join('、')} m`)
    expect(rows[3].slice(1)).toEqual([d(off), d(on)])
    // each predicted range lands at the instant the tag judged that anchor's train
    const trains = ofType(on, 'UWB_MMS_TRAIN').filter((t) => t.node === 'tag-1' && t.t < 200 * MS)
    expect(mine(on).map((r) => r.t)).toEqual(trains.map((t) => t.t))
    expect(l3.expect).toContain(`标签在 ${mine(on).map((r) => ms3(r.t)).join('、')} ms 各得到一个距离`)
    const anchors = ofType(on, 'UWB_RANGE').filter((r) => r.node !== 'tag-1' && r.t < 200 * MS)
    expect(l3.expect).toContain(`三个锚点仍在 ${ms3(anchors[0].t)} 到 ${ms3(anchors.at(-1)!.t)} ms 之间得到距离`)
  })

  it('the why: both shapes a millisecond apart, 66 slots against 86, and the first range earlier', () => {
    const w = uwbSubrounds.why!
    const non = planOf('base').mms!.layout
    const inter = planOf('interleaved').mms!.layout
    expect(non.fragGapSlots * SLOT_NS).toBe(MS)
    expect(inter.fragGapSlots * SLOT_NS).toBe(MS)
    expect(w).toContain(`交织的一轮 ${inter.slots} 个时隙、非交织 ${non.slots} 个`)
    const first = (v: number) => ms3(ofType(recs(v), 'UWB_RANGE').filter((r) => r.node === 'tag-1')[0].t)
    expect(w).toContain(`标签在 ${first(PREDICTED)} ms 就得到第一个距离，而不是 ${first(SP0)} ms`)
    expect(w).toContain('每轮少发 3 个报告')
  })
})
