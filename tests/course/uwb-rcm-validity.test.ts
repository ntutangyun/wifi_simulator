/**
 * `@uwb-rcm-validity`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites and the field it describes against the engine; ② row by
 * row against the engine (the merged first round, the initiation message alone after it, the
 * validity read off the received ARC IE, the slots taken from the scene, the 13-octet RMNR frame,
 * the two messages never split inside one round); ③ by reading every figure each lab prints back
 * out of the lesson text and comparing it with a run of the three scenes.
 *
 * `tests/course/uwb-receipt.test.ts` reads this lesson's `sources` for the indices of the validity
 * field (「字段里的第 9 到 14 位」), so that sentence is pinned here against the engine as well.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, FIG, ROUNDS, VALIDITY, WALLED_ANCHOR, uwbRcmValidity, uwbRcmValidityScenario, uwbRcmValidityTiming,
} from '../../src/course/uwb/uwb-rcm-validity'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  ARC_IE_BYTES, RDM_ENTRY_BYTES, RDM_IE_FIXED_BYTES, RMNR_IE_BYTES, RR_IE_BYTES, RRMC_IE_BYTES, UWB_FCS_BYTES,
  UWB_IE_HDR_BYTES, UWB_MHR_BYTES, rdmIeBytes, uwbInitBytes, uwbPollBytes, uwbRmnrBytes,
} from '../../src/uwb/phy'
import { roundPlan, slotAction } from '../../src/uwb/session'
import { uwbRcmValidityRoundsPatch } from '../../src/uwb/ui/UwbSessionFields'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Two blocks and the first rounds of a third. */
const RUN_NS = 450 * MS
const PLAN = roundPlan(uwbRcmValidityScenario().uwb!, ANCHORS)
const SHARED = undefined, EVERY = 0, WALLED = 1

lessonShapeSuite(uwbRcmValidity, { runNs: RUN_NS })

const recs = (variant?: number): TLRecord[] => runOf(uwbRcmValidity, variant, RUN_NS)
/** The frame the tag opened each round of block `b` with. */
const openers = (rs: TLRecord[], b = 0) => ofType(rs, 'TX_START')
  .filter((r) => r.node === 'uwb-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit') && r.frame.uwb!.block === b)
const ieField = (r: Extract<TLRecord, { type: 'TX_START' }>, key: string) =>
  uwbFrameFields(r.frame).users[0].subframes[0].mpdu.fields.find((f) => f.key === key)

const lab = (heading: string): Lab => {
  const l = uwbRcmValidity.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind'] & string>(l: Lab, kind: K): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind)
  expect(b, `${kind} in 「${l.heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbRcmValidity.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const num = (s: string, re: RegExp, what: string): number => {
  const m = re.exec(s)
  expect(m, `${what}: 「${re.source}」 not found`).not.toBeNull()
  return Number(m![1]!.replace(/\s/g, ''))
}
const stdText = (): string => uwbRcmValidity.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
/** The IE names a lesson cell lists, 「ARC、RR、RDM、RRMC」 → ['ARC', …]. */
const ies = (cell: string): string[] => cell.split('、')

describe('uwb-rcm-validity · the lesson', () => {
  it('is in the standard-first shape, in its own module, on the published standard alone', () => {
    expect(isStandardFirst(uwbRcmValidity)).toBe(true)
    expect(MODULES[uwbRcmValidity.module].title).toBe('控制消息的有效期')
    expect(basisOf(uwbRcmValidity.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbRcmValidity.needs).toEqual(['uwb-frame', 'uwb-blocks', 'uwb-dstwr'])
    expect(uwbRcmValidity.limits).toEqual([])
    expect(uwbRcmValidity.observe).toEqual([])
    expect(uwbRcmValidity.tryThis).toEqual([])
    expect(uwbRcmValidity.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+/)
  })

  it('cites each clause ① teaches, and ② is not all faithful', () => {
    for (const c of ['§10.32.1', '§10.32.2', '§10.32.9.1', '§10.32.3.2', '§10.32.9.8', '§10.34.1', '图 10-270', '§10.34.2.1']) {
      expect(stdText(), c).toContain(c)
    }
    const kinds = new Set(uwbRcmValidity.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'value', 'choice', 'differs', 'absent'] as const) expect(kinds, k).toContain(k)
  })

  it('the validity field is bits 9 to 14, six bits, 0 to 63 — as ① and `sources` say and the editor allows', () => {
    const [lo, hi] = [num(stdText(), /第 (\d+) 到 \d+ 位/, 'lo'), num(stdText(), /第 \d+ 到 (\d+) 位/, 'hi')]
    expect(num(stdText(), /共 (\d+) 位/, 'width')).toBe(hi - lo + 1)
    const src = uwbRcmValidity.sources!.join('\n')
    expect(src).toContain(`字段里的第 ${lo} 到 ${hi} 位`)
    expect(num(src, /取值是 0 到 (\d+) 轮/, 'max')).toBe(2 ** (hi - lo + 1) - 1)
    const s = uwbRcmValidityScenario()
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, rcmValidityRounds: 64, initiatorRounds: 63 } }).success).toBe(false)
  })
})

describe('uwb-rcm-validity · ② says what the engine does, and the engine does it', () => {
  it('the merged first round, then the initiation message alone', () => {
    const sim = implRow('两条消息合并').sim
    const o = openers(recs())
    expect(o.map((r) => r.frame.kind)).toEqual(['uwbPoll', 'uwbInit', 'uwbInit', 'uwbInit'])
    expect(sim).toContain(`带 ${o[0].frame.uwb!.ies!.join('、')} 四个信息单元`)
    expect(num(sim, /四个信息单元，(\d+) 字节/, 'poll')).toBe(o[0].frame.bytes)
    expect(sim).toContain(`只带 ${o[1].frame.uwb!.ies!.join('、')}`)
    expect(num(sim, /只带 RRMC，(\d+) 字节/, 'init')).toBe(o[1].frame.bytes)
  })

  it('the field carries the set\'s length; a validity above the rounds a block runs is refused', () => {
    const o = openers(recs())
    expect(ieField(o[0], 'ieArc')!.value).toContain(`有效轮数 ${VALIDITY}`)
    expect(o[0].frame.uwb!.arc!.validityRounds).toBe(VALIDITY)
    const s = uwbRcmValidityScenario()
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, rcmValidityRounds: ROUNDS + 1 } }).success).toBe(false)
    // and the editor raises the rounds a block runs alongside the validity
    expect(uwbRcmValidityRoundsPatch(ROUNDS + 1, false, false, ROUNDS)).toEqual({ rcmValidityRounds: ROUNDS + 1, initiatorRounds: ROUNDS + 1 })
  })

  it('the tag runs four rounds a block — exactly one set', () => {
    const m = /取每块(.)轮/.exec(implRow('标签每块运行几轮').sim)
    expect(m).not.toBeNull()
    expect('零一二三四五六七八九'.indexOf(m![1]!)).toBe(uwbRcmValidityScenario().uwb!.initiatorRounds)
    const rounds = ofType(recs(), 'UWB_ROUND').filter((r) => r.block === 0)
    expect(rounds.map((r) => r.round)).toEqual([0, 1, 2, 3])
  })

  it('the initiation message carries no ARC and so cannot extend the set', () => {
    for (const r of openers(recs()).slice(1)) expect(r.frame.uwb!.arc, `round ${r.frame.uwb!.round}`).toBeUndefined()
    // block 1 opens a fresh set with its own control message
    expect(openers(recs(), 1)[0].frame.kind).toBe('uwbPoll')
  })

  it('slots come from the scene: the walled anchor still waits in slots 0 and 5 (differs)', () => {
    const row = implRow('应答方怎样知道自己的时隙')
    expect(row.kind).toBe('differs')
    const mine = ofType(recs(WALLED), 'UWB_TIMEOUT').filter((r) => r.node === WALLED_ANCHOR && r.t < PLAN.roundNs)
    const slots = [num(row.sim, /在第 (\d+) 与/, 'a'), num(row.sim, /与第 (\d+) 个时隙/, 'b')]
    expect(mine.map((r) => r.slot)).toEqual(slots)
    expect(slotAction(PLAN, slots[0]).kind).toBe('uwbPoll')
    expect(slotAction(PLAN, slots[1]).kind).toBe('uwbFinal')
    // and it never answers
    expect(ofType(recs(WALLED), 'TX_START').filter((r) => r.node === WALLED_ANCHOR)).toEqual([])
  })

  it('the RMNR frame is MHR + IE header + FCS, 13 octets', () => {
    const sim = implRow('RMNR 帧').sim
    expect(num(sim, /帧头 (\d+) 字节/, 'mhr')).toBe(UWB_MHR_BYTES)
    expect(num(sim, /信息单元头 (\d+) 字节/, 'hdr')).toBe(UWB_IE_HDR_BYTES)
    expect(RMNR_IE_BYTES).toBe(UWB_IE_HDR_BYTES)
    expect(num(sim, /帧校验 (\d+) 字节/, 'fcs')).toBe(UWB_FCS_BYTES)
    expect(num(sim, /= (\d+) 字节/, 'rmnr')).toBe(uwbRmnrBytes())
  })

  it('no static scene of this lesson sends an RMNR (absent)', () => {
    expect(implRow('同一轮里的两帧').kind).toBe('absent')
    for (const v of [SHARED, EVERY, WALLED]) expect(ofType(recs(v), 'UWB_RMNR'), String(v)).toEqual([])
  })
})

describe('uwb-rcm-validity · ③ every figure the labs print is the run', () => {
  it('lab 1: the two openers, the figure and the ARC IE', () => {
    const l = lab('两种首帧')
    const o = openers(recs())
    const rows = blockOf(l, 'table').rows
    for (const [i, row] of rows.entries()) {
      expect(row[0]).toBe(`第 ${o[i].frame.uwb!.round} 轮`)
      expect(ies(row[2])).toEqual(o[i].frame.uwb!.ies)
      expect(row[3]).toBe(`${o[i].frame.bytes} 字节`)
    }
    expect(l.expect).toContain(`有效轮数 ${VALIDITY}`)
    expect(ieField(o[0], 'ieArc')!.value).toContain(`有效轮数 ${VALIDITY}`)
    expect(l.expect).toContain(`只剩 ${o[1].frame.uwb!.ies!.join('、')} 一个信息单元`)
    const d = blockOf(l, 'diagram')
    expect(d.spec).toEqual(uwbRcmValidityTiming())
    const lanes = (d.spec as TimingSpec).lanes
    expect(lanes[0].spans[0].label).toBe(`控制消息 ${o[0].frame.bytes} B`)
    expect(lanes[1].spans[0].label).toBe(`启动消息 ${o[1].frame.bytes} B`)
    expect(num(d.caption!, /是 (\d+) 字节的控制消息/, 'rcm')).toBe(o[0].frame.bytes)
    expect(num(d.caption!, /是 (\d+) 字节的启动消息/, 'init')).toBe(o[1].frame.bytes)
    expect(FIG.slots).toBe(PLAN.slots)
    expect(FIG.slotUs * 1000).toBe(PLAN.slotNs)
    // every response and report slot is the slot table's
    for (let s = FIG.responseFrom; s < FIG.finalAt; s++) expect(slotAction(PLAN, s).kind).toBe('uwbResp')
    for (let s = FIG.reportFrom; s < FIG.slots; s++) expect(slotAction(PLAN, s).kind).toBe('uwbReport')
  })

  it('lab 2: four rounds of openers at both settings, and the saving', () => {
    const l = lab('一组四轮的首帧字节')
    const rows = blockOf(l, 'table').rows
    const every = openers(recs(EVERY)).map((r) => r.frame.bytes)
    const shared = openers(recs()).map((r) => r.frame.bytes)
    expect(every).toHaveLength(VALIDITY)
    for (let i = 0; i < VALIDITY; i++) {
      expect(rows[i][0]).toBe(`第 ${i} 轮`)
      expect(rows[i][1]).toBe(`${every[i]} 字节`)
      expect(rows[i][2]).toBe(`${shared[i]} 字节${i === 0 ? '（控制消息）' : '（启动消息）'}`)
    }
    const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
    expect(rows[VALIDITY]).toEqual(['合计', `${sum(every)} 字节`, `${sum(shared)} 字节`])
    expect(blockOf(l, 'table').heading).toContain(`${VALIDITY} 轮`)
    // the formula and its note
    const f = blockOf(l, 'formula')
    const k = ARC_IE_BYTES + RR_IE_BYTES + RDM_IE_FIXED_BYTES
    expect(f.text).toBe(`省下 = (R − 1) × (${k} + ${RDM_ENTRY_BYTES}A)，每 R 轮`)
    expect(num(f.note!, /ARC (\d+) 字节/, 'arc')).toBe(ARC_IE_BYTES)
    expect(num(f.note!, /RR (\d+) 字节/, 'rr')).toBe(RR_IE_BYTES)
    expect(num(f.note!, /RDM (\d+) 字节/, 'rdm')).toBe(rdmIeBytes(ANCHORS))
    const perRound = uwbPollBytes(ANCHORS) - uwbInitBytes()
    expect(num(f.note!, /合起来 (\d+) 字节/, 'per')).toBe(perRound)
    expect(perRound).toBe(k + RDM_ENTRY_BYTES * ANCHORS)
    // the expect line
    expect(l.expect).toContain(`R = ${VALIDITY} 时每组节省 ${VALIDITY - 1} × ${perRound} = ${(VALIDITY - 1) * perRound} 字节`)
    expect((VALIDITY - 1) * perRound).toBe(sum(every) - sum(shared))
    expect(num(l.expect, /只有 (\d+) 轮换了短的首帧/, 'n')).toBe(VALIDITY - 1)
    expect(num(l.expect, /平均到每一轮是 (\d+) 字节/, 'spread')).toBe((VALIDITY - 1) * perRound / VALIDITY)
    expect(l.expect).toContain(`把 ${(VALIDITY - 1) * perRound} 字节算成每一轮的，就把节省夸大了四倍`)
    expect(VALIDITY).toBe(4)
  })

  it('lab 3: the same 32 ranges, field for field, at both settings', () => {
    const l = lab('测量没有改变')
    const of = (v?: number) => ofType(recs(v), 'UWB_RANGE').filter((r) => r.block === 0)
      .map((r) => ({ node: r.node, peer: r.peer, distM: r.distM, fom: r.fom, block: r.block, t: r.t }))
    const n = num(l.expect, /都测得 (\d+) 条测距结果/, 'rows')
    expect(of()).toHaveLength(n)
    expect(n).toBe(2 * ANCHORS * VALIDITY)
    expect(of(EVERY)).toEqual(of())
    expect(num(l.expect, /（(\d+) ps）/, 'ps')).toBe(uwbRcmValidityScenario().uwb!.tsNoisePs)
  })

  it('lab 4: block 1 opens a new set with its own control message', () => {
    const l = lab('进入下一组')
    const o = openers(recs(), 1)[0]
    expect(num(l.expect, /又是 (\d+) 字节/, 'bytes')).toBe(o.frame.bytes)
    expect(l.expect).toContain(`有效轮数 ${o.frame.uwb!.arc!.validityRounds}`)
    expect(ieField(o, 'ieArc')!.value).toContain(`有效轮数 ${VALIDITY}`)
    expect(l.expect).toContain(`块号 ${o.frame.uwb!.block}、轮号 ${o.frame.uwb!.round}`)
    expect(ieField(o, 'ieRr')!.value).toContain(`Ranging Block Index ${o.frame.uwb!.block}`)
    expect(openers(recs(), 0).map((r) => r.frame.kind)).toEqual(['uwbPoll', 'uwbInit', 'uwbInit', 'uwbInit'])
  })

  it('lab 5: the walled anchor sends nothing, the tag times out twice a round and fixes on three', () => {
    const l = lab('砖墙后的锚点')
    expect(uwbRcmValidity.variants![l.variant!].scenario().uwb!.rmnr).toBe(true)
    const rs = recs(WALLED)
    expect(ofType(rs, 'UWB_RMNR')).toEqual([])
    expect(ofType(rs, 'TX_START').filter((r) => r.node === WALLED_ANCHOR)).toEqual([])
    const perRound = num(l.expect, /标签每轮留下 (\d+) 次超时/, 'timeouts')
    const rounds = ofType(rs, 'UWB_ROUND').filter((r) => r.block === 0)
    for (const r of rounds) {
      const t = ofType(rs, 'UWB_TIMEOUT').filter((x) => x.node === 'uwb-1' && x.t > r.t && x.t <= r.t + PLAN.roundNs)
      expect(t, `round ${r.round}`).toHaveLength(perRound)
      expect(new Set(t.map((x) => x.peer)), `round ${r.round}`).toEqual(new Set([WALLED_ANCHOR]))
    }
    const fixes = ofType(rs, 'UWB_POSITION').filter((f) => f.block === 0)
    expect(fixes).toHaveLength(rounds.length)
    for (const f of fixes) expect(f.anchors).toHaveLength(num(l.expect, /其余 (\d+) 个锚点/, 'n'))
  })
})

describe('uwb-rcm-validity · the figures quoted in the quiz and `sources`', () => {
  it('quiz: 13 octets, 84 per set, 21 a round, 3 rounds of 28', () => {
    expect(uwbRcmValidity.quiz[1].q).toContain(`只有 ${uwbRmnrBytes()} 字节`)
    const per = uwbPollBytes(ANCHORS) - uwbInitBytes()
    const q = uwbRcmValidity.quiz[3]
    expect(q.q).toContain(`省下的 ${(VALIDITY - 1) * per} 字节`)
    expect(q.options[1]).toBe(`每四轮 ${(VALIDITY - 1) * per} 字节，平均到每一轮是 ${(VALIDITY - 1) * per / VALIDITY} 字节`)
    expect(q.explain).toContain(`只有 ${VALIDITY - 1} 轮换成了短的首帧，每轮节省 ${per} 字节`)
  })

  it('sources: the octet widths are the engine\'s', () => {
    const src = uwbRcmValidity.sources![1]
    expect(src).toBe(`字节宽度：帧头 ${UWB_MHR_BYTES}、信息单元头 ${UWB_IE_HDR_BYTES}、ARC ${ARC_IE_BYTES}、RR ${RR_IE_BYTES}、RDM ${RDM_IE_FIXED_BYTES} + ${RDM_ENTRY_BYTES}A（四个锚点 ${rdmIeBytes(ANCHORS)}）、RRMC ${RRMC_IE_BYTES}、帧校验 ${UWB_FCS_BYTES}，于是一帧完整的轮询帧 ${uwbPollBytes(0)} + ${RDM_ENTRY_BYTES}A、一帧启动消息 ${uwbInitBytes()}、一帧 RMNR ${uwbRmnrBytes()}。`)
  })

  it('the scene runs as the schema accepts it', () => {
    for (const s of [uwbRcmValidityScenario(), uwbRcmValidityScenario(1), uwbRcmValidityScenario(VALIDITY, true, true)] as Scenario[]) {
      expect(() => ScenarioSchema.parse(s)).not.toThrow()
      expect(() => new Simulation(s)).not.toThrow()
    }
  })
})
