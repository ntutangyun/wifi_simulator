/**
 * `@uwb-subrounds`, in the standard-first shape (2026-11-10).
 *
 * ① teaches the draft's non-interleaved sub-rounds (§10.39.7, via 15-25/0292r1) and the adopted
 * resolution 15-25/0681r1 — Predicted Reply Time in the Response Compact frame — which superseded
 * the fixed reply time and reversed order of 15-25/0224r2 and 15-25/0556r2. ② says the engine has
 * no Predicted Reply Time, lays interleaved fragments out differently from the draft (audit #22),
 * and that the two variants still run the superseded proposals (audit #6).
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run or
 * with the layout the engine schedules.
 */
import { describe, expect, it } from 'vitest'
import {
  SUBROUND_ANCHORS, SUBROUND_RESPONDERS, SUBROUND_SLOT_RSTU, SUBROUND_TAG_X,
  uwbSubrounds, uwbSubroundsScenario, uwbSubroundsTiming,
} from '../../src/course/uwb/uwb-subrounds'
import { ScenarioSchema, UwbMmsSchema, type Scenario } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_REVERSED_OFFSET_RSTU, MS_RSTU, rsfNs } from '../../src/uwb/mms'
import { roundPlan, rstuNs } from '../../src/uwb/session'
import { rctuToMetres } from '../../src/uwb/ranging'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One 200 ms ranging block: long enough for a 43 ms non-interleaved round and its report phase. */
const BLOCK_NS = 200 * MS
const INTERLEAVED = 0
const FIXED = 1
const REVERSED = 2

const recs = (v?: number) => runOf(uwbSubrounds, v, BLOCK_NS)
const ms3 = (ns: number): string => (ns / MS).toFixed(3)
const SLOT_NS = rstuNs(SUBROUND_SLOT_RSTU)
const planOf = (variant: Parameters<typeof uwbSubroundsScenario>[0]) =>
  roundPlan(uwbSubroundsScenario(variant).uwb!, SUBROUND_RESPONDERS)

/** The fixed-reply scene with the option switched off: the comparison lab 3 asks for in the editor. */
const fixedOff = (): TLRecord[] => {
  const sc = uwbSubroundsScenario('fixed')
  const off: Scenario = ScenarioSchema.parse({ ...sc, uwb: { ...sc.uwb!, mms: { ...sc.uwb!.mms, fixedReplyRstu: null } } })
  return [...new Simulation(off).runUntil(BLOCK_NS).records]
}

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
      expect([sc.uwb!.mms.control, sc.uwb!.mms.uwbdControl]).toEqual(['uwbd', 'none'])
    }
    expect(SUBROUND_ANCHORS.map((a) => a.x - SUBROUND_TAG_X)).toEqual([3, 6, 9])
  })

  it('① teaches the adopted resolution and names the superseded proposals as superseded', () => {
    const std = stdText()
    for (const s of ['§10.39.7', '15-25/0292r1', '15-25/0681r1', '15-26/0006r0', '§10.39.11.3.6', '§10.39.11.3.10',
      'Predicted Reply Time', '5 个八位组', '15-25/0224r2', '15-25/0556r2', '§10.29.6.5', '12/13/1', '15-26/0425r0']) {
      expect(std, s).toContain(s)
    }
    expect(std).toContain('只用于非交织形态')
    expect(std).toContain('反序没有出现在决议里')
    expect(std).toContain(`默认值为 ${MMS_FIXED_REPLY_RSTU_DEFAULT} RSTU`)
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
  it('no Predicted Reply Time; the two variants and the interleaved layout differ', () => {
    expect(implRow('预测回复时间').kind).toBe('absent')
    expect(implRow('「固定回复时间」变体').kind).toBe('differs')
    expect(implRow('「反序」变体').kind).toBe('differs')
    expect(implRow('交织时的片段间隔').kind).toBe('differs')
    // no compact frame anywhere in the lesson's scenes
    for (const v of [undefined, INTERLEAVED, FIXED, REVERSED]) {
      expect(ofType(recs(v), 'TX_START').some((r) => /compact/i.test(r.frame.kind)), String(v)).toBe(false)
    }
  })

  it('one device a sub-round: 20 slots each, a 6-slot report phase, 86 in all', () => {
    const l = planOf('base').mms!.layout
    const sim = implRow('一对多的排法').sim
    expect(l.subRounds).toBe(SUBROUND_RESPONDERS + 1)
    expect(sim).toContain(`每个子轮 ${l.rpSlots} 个时隙`)
    expect(sim).toContain(`${l.reportSlots} 个时隙的报告阶段，一轮共 ${l.slots} 个时隙`)
    expect(implRow('非交织子轮').sim).toContain(`${SUBROUND_SLOT_RSTU} RSTU 的时隙上是 ${l.fragGapSlots} 个时隙、${l.fragGapSlots * SLOT_NS / MS} ms`)
    expect(l.fragGapSlots).toBe(Math.ceil(MS_RSTU / SUBROUND_SLOT_RSTU))
  })

  it('interleaved: one slot a device a millisecond, 2 ms at three responders', () => {
    const l = planOf('interleaved').mms!.layout
    expect(l.fragGapSlots).toBe(SUBROUND_RESPONDERS + 1)
    expect(implRow('交织时的片段间隔').sim).toContain(`三个应答方时是 ${l.fragGapSlots} 个时隙，${SUBROUND_SLOT_RSTU} RSTU 上就是 ${l.fragGapSlots * SLOT_NS / MS} ms`)
  })

  it('the fixed-reply variant: 600 RSTU after the whole packet, and the schema keeps it pairwise', () => {
    const fixed = uwbSubroundsScenario('fixed').uwb!.mms
    expect(fixed.fixedReplyRstu).toBe(MMS_FIXED_REPLY_RSTU_DEFAULT)
    expect(implRow('「固定回复时间」变体').sim).toContain(`之后 ${MMS_FIXED_REPLY_RSTU_DEFAULT} RSTU 发送`)
    expect(UwbMmsSchema.safeParse({ ...fixed, oneToMany: true }).success).toBe(false)
    expect(implRow('「反序」变体').sim).toContain(`隔 ${MMS_REVERSED_OFFSET_RSTU} RSTU 再发送`)
  })
})

describe('uwb-subrounds · ③ every figure the labs print is the run', () => {
  it('lab 1: the two-shapes table is the layout and the run', () => {
    const rows = tableOf(lab('两种排法，同一个房间'), '同一个房间，两种排法').rows
    const gaps = (v?: number): number[] => {
      const ts = ofType(recs(v), 'TX_START').filter((r) => r.frame.kind === 'uwbRsf' && r.node === 'tag-1').map((r) => r.t).slice(0, 8)
      return ts.slice(1).map((t, i) => t - ts[i])
    }
    for (const [col, variant, v] of [[1, 'interleaved', INTERLEAVED], [2, 'base', undefined]] as const) {
      const l = planOf(variant).mms!.layout
      expect(rows[0][col]).toBe(String(l.subRounds))
      expect(rows[1][col]).toBe(l.subRounds === 1 ? `${l.rpSlots} 时隙` : `每子轮 ${l.rpSlots} 时隙`)
      expect(rows[2][col]).toBe(`${l.reportSlots} 时隙`)
      expect(rows[3][col]).toBe(`${l.slots} 时隙 · ${l.slots * SLOT_NS / MS} ms`)
      expect(new Set(gaps(v))).toEqual(new Set([l.fragGapSlots * SLOT_NS]))
      expect(rows[4][col]).toBe(`${l.fragGapSlots} 时隙 · ${l.fragGapSlots * SLOT_NS / MS} ms`)
      expect(rows[5][col]).toBe(`${gaps(v).reduce((a, b) => a + b, 0) / MS} ms`)
      expect(rows[6][col]).toBe(String(ofType(recs(v), 'UWB_RANGE').length))
    }
  })

  it('lab 1: the round line as the log prints it, in both shapes', () => {
    const e = lab('两种排法，同一个房间').expect
    const m = /([\d.]+) ms 那一行写着 “([^”]+)”，交错场景是 (\d+) slots/.exec(e)
    expect(m).not.toBeNull()
    const r0 = ofType(recs(), 'UWB_ROUND')[0]
    expect(m![1]).toBe(ms3(r0.t))
    expect(fmtRecord(r0)).toContain(m![2])
    expect(fmtRecord(ofType(recs(INTERLEAVED), 'UWB_ROUND')[0])).toContain(`${m![3]} slots`)
    expect(e).toContain(`每块都得到 ${ofType(recs(), 'UWB_RANGE').length} 个距离`)
  })

  it('lab 1: the figure draws four lanes at the slots the layout names', () => {
    const spec = uwbSubroundsTiming()
    expect(spec.lanes.map((l) => l.spans.length)).toEqual([8, 24, 8, 24])
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

  it('lab 3: the fixed-reply table, off against on', () => {
    const rows = tableOf(lab('被取代的固定回复时间提案'), '固定回复时间：关闭与打开').rows
    const off = fixedOff()
    const on = recs(FIXED)
    // three pairwise rounds in the block, one per anchor, with the option on or off
    const roundsOf = (rs: TLRecord[]) => new Set(ofType(rs, 'UWB_ROUND').filter((r) => r.block === 0).map((r) => r.round)).size
    const rounds = roundsOf(on)
    expect(rounds).toBe(SUBROUND_ANCHORS.length)
    expect(roundsOf(off)).toBe(rounds)
    const sp0 = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp0').length / rounds
    expect(rows[0].slice(1)).toEqual([`${sp0(off)} 个`, `${sp0(on)} 个`])
    const mine = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === 'anchor-1')[0]
    expect(rows[1].slice(1)).toEqual([`${ms3(mine(off).t)} ms`, `${ms3(mine(on).t)} ms`])
    expect(rows[2].slice(1)).toEqual([`${rctuToMetres(mine(off).tofRawRctu!).toFixed(2)} m`, `${rctuToMetres(mine(on).tofRawRctu!).toFixed(2)} m`])
    expect(rows[3][0]).toBe(`修正后的距离，真值 ${mine(on).trueDistM.toFixed(2)} m`)
    expect(rows[3].slice(1)).toEqual([`${mine(off).distM.toFixed(2)} m`, `${mine(on).distM.toFixed(2)} m`])
    const e = lab('被取代的固定回复时间提案').expect
    expect(e).toContain(`在 ${ms3(mine(on).t)} ms 就得出距离`)
    expect(e).toContain(`从 ${rctuToMetres(mine(off).tofRawRctu!).toFixed(2)} m 降到 ${rctuToMetres(mine(on).tofRawRctu!).toFixed(2)} m`)
    expect(e).toContain(`缩短为 ${MMS_FIXED_REPLY_RSTU_DEFAULT} RSTU，即半毫秒`)
    expect(rstuNs(MMS_FIXED_REPLY_RSTU_DEFAULT)).toBe(MS / 2)
    // both ends still range with the option on
    expect([...new Set(ofType(on, 'UWB_RANGE').filter((r) => r.node === 'anchor-1' || r.peer === 'anchor-1').map((r) => r.node))].sort()).toEqual(['anchor-1', 'tag-1'])
  })

  it('lab 3: the harmless timeout, as the log prints it', () => {
    const m = /日志里仍有一行 “([^”]+)”/.exec(lab('被取代的固定回复时间提案').expect)
    expect(m).not.toBeNull()
    expect(ofType(recs(FIXED), 'UWB_TIMEOUT').some((r) => fmtRecord(r).includes(m![1]))).toBe(true)
  })

  it('lab 4: the reversed order ranges all six, within the centimetres it states', () => {
    const ranges = ofType(recs(REVERSED), 'UWB_RANGE')
    expect(ranges).toHaveLength(6)
    const worstCm = Math.max(...ranges.map((r) => Math.abs(r.distM - r.trueDistM) * 100))
    expect(lab('反序').expect).toContain(`六个距离都测得，与真值相差不超过 ${worstCm.toFixed(1)} cm`)
  })

  it('the why: 7 ms against 14 ms, 38 slots against 86', () => {
    const w = uwbSubrounds.why!
    const non = planOf('base').mms!.layout
    const inter = planOf('interleaved').mms!.layout
    expect(w).toContain(`一列八个片段只占 ${7 * non.fragGapSlots * SLOT_NS / MS} ms`)
    expect(w).toContain(`它要 ${7 * inter.fragGapSlots * SLOT_NS / MS} ms`)
    expect(w).toContain(`一轮从 ${inter.slots} 个时隙增加到 ${non.slots} 个`)
  })
})
