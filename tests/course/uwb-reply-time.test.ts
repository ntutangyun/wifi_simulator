/**
 * Every empirical claim in 「你不能把一个数放进它自己测量的那一帧」, measured against the
 * lesson's own scenarios. Each assertion names the sentence it guards.
 *
 * The rule this file exists for: the lesson prints frame lengths, slot counts,
 * anchor caps, slot demands, a two-sided bound and five six-decimal ranges. Every
 * one of them is read back out of a run, or recomputed from the engine's own
 * exports (src/uwb/phy.ts, src/model/scenario.ts) — nothing here is a number
 * typed twice.
 */
import { describe, expect, it } from 'vitest'
import {
  BENCH_M, BYTES, CAP, DEMAND, DEMAND_ANCHORS, FIG, PPM, RANGE_M, SHORT_SLOT_NS,
  fixedWindowRstu, uwbReplyTime, uwbReplyTimeScenario, uwbReplyTimeTiming,
} from '../../src/course/uwb/uwb-reply-time'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { UwbReplyTime } from '../../src/uwb/phy'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { diagramTexts } from '../../src/course/diagram'
import { fmtRecord } from '../../src/ui/format'
import {
  UWB_MAX_PSDU_BYTES, UWB_SS_DEFER_BYTES, rstuNs, uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes,
  uwbPpduNs, uwbRespBytes, uwbSlotFitNs,
} from '../../src/uwb/phy'
import { ssTwrCorrected } from '../../src/uwb/ranging'
import {
  C_M_PER_NS, RRTI_IE_BYTES, UWB_FCS_BYTES, UWB_MHR_BYTES, UWB_SLOT_GUARD_NS, uwbFinalBytes,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One block is 200 ms and holds one round per tag; 30 ms is round 0 and nothing else. */
const RUN_NS = 30 * MS

lessonShapeSuite(uwbReplyTime, { runNs: RUN_NS })

/** Any of the five shapes, run straight off its scenario builder. */
function runShape(replyTime: UwbReplyTime, method: 'ss' | 'ds' = 'ss', ppm = true): TLRecord[] {
  const sc = ppm
    ? uwbReplyTimeScenario(replyTime, method)
    : matched(replyTime, method)
  expect(() => ScenarioSchema.parse(sc), `${method}/${replyTime}`).not.toThrow()
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

/** The same scene with the two crystals matched — the lesson's "两端对准" column. */
function matched(replyTime: UwbReplyTime, method: 'ss' | 'ds'): Scenario {
  const sc = uwbReplyTimeScenario(replyTime, method)
  return { ...sc, nodes: sc.nodes.map((n) => ({ ...n, uwb: { ...n.uwb!, ppm: 0 } })) }
}

const txOf = (rs: TLRecord[], kind: string) =>
  ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)

describe('uwb-reply-time · where it sits in the course', () => {
  it('is the reply-time lesson of the two-clocks module, checked against the published standard alone', () => {
    expect(uwbReplyTime.module).toBe(15)
    expect(MODULES[uwbReplyTime.module].title).toBe('两只钟')
    // 「这一课完全不依赖任何草案」 — the module's basis is the published revision and nothing else.
    expect(basisOf(uwbReplyTime.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbReplyTime.needs).toEqual(['uwb-sstwr'])
    // and the sources say so: no draft number, no contribution number anywhere in them.
    const src = uwbReplyTime.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
  })

  it('declares four limits, and the three of design §10 are among them', () => {
    expect(uwbReplyTime.limits).toHaveLength(4)
    expect(uwbReplyTime.limits.map((l) => l.kind))
      .toEqual(['out-of-scope', 'unmodelled', 'unmodelled', 'model-value'])
    const text = uwbReplyTime.limits.map((l) => l.text).join('\n')
    expect(text).toContain('§10.29.6.2') // no control-plane primitive
    expect(text).toContain('RRTN') // the two ends do not negotiate
    expect(text).toContain('armFixedReply') // the responder always hits the instant exactly
    expect(text).toContain('15 cm') // …and what 1 ns of that error is worth
    // 「这一刀不说『本仿真器有简化』」: the banned sentence, in both spellings.
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
  })
})

describe('uwb-reply-time · the scene', () => {
  const sc = uwbReplyTime.scenario()

  it('is one anchor and one tag exactly 5.00 m apart, crystals 35 ppm apart', () => {
    const anchor = sc.nodes.find((n) => n.uwb!.role === 'anchor')!
    const tag = sc.nodes.find((n) => n.uwb!.role === 'tag')!
    expect(sc.nodes).toHaveLength(2)
    const d = Math.hypot(anchor.pos.x - tag.pos.x, anchor.pos.y - tag.pos.y, anchor.pos.z - tag.pos.z)
    expect(d).toBeCloseTo(BENCH_M, 10)
    expect(BENCH_M).toBe(5)
    expect(anchor.uwb!.ppm).toBe(PPM.anchor)
    expect(tag.uwb!.ppm).toBe(PPM.tag)
    expect(PPM.anchor - PPM.tag).toBe(35)
  })

  it('runs the deferred shape, with both noise sources off and no wall in the way', () => {
    // 「本课这一轮把时间戳噪声与时钟偏差估计噪声都调成零，两端之间也没有墙」
    expect(sc.uwb!.method).toBe('ss')
    expect(sc.uwb!.replyTime).toBe('deferred')
    expect(sc.uwb!.tsNoisePs).toBe(0)
    expect(sc.uwb!.cfoNoisePpm).toBe(0)
    expect(sc.uwb!.nlos).toBe(false)
    const run = runOf(uwbReplyTime, undefined, RUN_NS)
    expect(ofType(run, 'UWB_RANGE').every((r) => r.trueDistM === BENCH_M)).toBe(true)
  })

  it('offers the other two SS-TWR shapes as its variants, and nothing else', () => {
    expect(uwbReplyTime.variants!.map((v) => v.scenario().uwb!.replyTime)).toEqual(['embedded', 'fixed'])
    for (const v of uwbReplyTime.variants!) expect(v.scenario().uwb!.method).toBe('ss')
  })
})

describe('uwb-reply-time · the frames the three shapes put on the air (§5 of the design)', () => {
  it('reads the octet table off the run, not off the constants', () => {
    // 「Response」 row: 20 embedded, 14 deferred, 14 fixed — and one deferred message of 17.
    const resp = (rt: UwbReplyTime) => txOf(runShape(rt), 'uwbResp').map((r) => r.frame.bytes)
    expect(resp('embedded')).toEqual([BYTES.respEmbedded])
    expect(resp('deferred')).toEqual([BYTES.respDeferred])
    expect(resp('fixed')).toEqual([BYTES.respFixed])
    expect(BYTES.respEmbedded).toBe(20)
    expect(BYTES.respDeferred).toBe(14)
    expect(BYTES.respFixed).toBe(14)
    // 「Response 相差的六个字节就是那段等待自己那一小节」
    expect(BYTES.respEmbedded - BYTES.respFixed).toBe(6)
    expect(BYTES.poll).toBe(uwbPollBytes(1))
    expect(BYTES.poll).toBe(30)
  })

  it('sends the deferred message only in the deferred shape, and it is 17 octets', () => {
    // 「延后报文 17 字节」 and 「那条只为一个数而发的报文」
    expect(txOf(runShape('deferred'), 'uwbSsDefer').map((r) => r.frame.bytes)).toEqual([UWB_SS_DEFER_BYTES])
    expect(BYTES.defer).toBe(17)
    for (const rt of ['embedded', 'fixed'] as const) {
      expect(txOf(runShape(rt), 'uwbSsDefer'), rt).toHaveLength(0)
    }
  })

  it('takes three slots for the deferred round and two for the other two', () => {
    // observe: 「整轮那一行写着 "3 slots"」, and 「嵌入形态只占两个」
    const slotsOf = (rt: UwbReplyTime) => ofType(runShape(rt), 'UWB_ROUND').map((r) => r.slots)
    expect(slotsOf('deferred')).toEqual([3])
    expect(slotsOf('embedded')).toEqual([2])
    expect(slotsOf('fixed')).toEqual([2])
    const round = ofType(runOf(uwbReplyTime, undefined, RUN_NS), 'UWB_ROUND')[0]
    expect(fmtRecord(round)).toContain('3 slots')
  })
})

describe('uwb-reply-time · the timing figure is the run', () => {
  const us = (ns: number): number => Math.round(ns / 1000 * 1000) / 1000

  it('puts every bar where the timeline puts the frame', () => {
    const emb = runShape('embedded')
    const def = runShape('deferred')
    const fix = runShape('fixed')
    const poll = txOf(emb, 'uwbPoll')[0]
    expect(poll.t).toBe(0)
    expect(us(poll.frame.txTimeNs)).toBe(FIG.pollEndUs)

    const respEmb = txOf(emb, 'uwbResp')[0]
    expect(us(respEmb.t)).toBe(FIG.slotUs)
    expect(us(respEmb.t + respEmb.frame.txTimeNs)).toBe(FIG.respEmbeddedUs)

    const respDef = txOf(def, 'uwbResp')[0]
    expect(us(respDef.t)).toBe(FIG.slotUs)
    expect(us(respDef.t + respDef.frame.txTimeNs)).toBe(FIG.respDeferredUs)

    const defer = txOf(def, 'uwbSsDefer')[0]
    expect(us(defer.t)).toBe(2 * FIG.slotUs)
    expect(us(defer.t + defer.frame.txTimeNs)).toBe(FIG.deferEndUs)

    // The one transmission in the simulator that no slot edge decides.
    const respFix = txOf(fix, 'uwbResp')[0]
    expect(us(respFix.t)).toBe(FIG.fixedStartUs)
    expect(us(respFix.t + respFix.frame.txTimeNs)).toBe(FIG.fixedEndUs)
    expect(respFix.t).not.toBe(rstuNs(uwbReplyTime.scenario().uwb!.slotRstu))
  })

  it('the fixed Response leaves one Poll airtime into its own slot', () => {
    // tryThis: 「从 2.000 ms 挪到了 2.198 ms——正好晚了一个 Poll 的空口时间」
    const slotNs = rstuNs(uwbReplyTime.scenario().uwb!.slotRstu)
    const intoSlot = FIG.fixedStartUs * 1000 - slotNs
    expect(intoSlot / uwbPpduNs(BYTES.poll)).toBeCloseTo(1, 3)
  })

  it('labels four lanes — a slot ruler and one per shape — and names the octets on each', () => {
    const texts = diagramTexts(uwbReplyTimeTiming())
    expect(uwbReplyTimeTiming().lanes.map((l) => l.label)).toEqual(['时隙', '嵌入', '固定', '延后'])
    for (const t of texts) expect(t.trim().length).toBeGreaterThan(0)
    expect(texts.join(' ')).toContain(`${BYTES.respEmbedded} B`)
    expect(texts.join(' ')).toContain(`延后报文 ${BYTES.defer} B`)
  })
})

describe('uwb-reply-time · one distance, five routes', () => {
  const tagRange = (rt: UwbReplyTime, method: 'ss' | 'ds', ppm = true): string => {
    const rs = runShape(rt, method, ppm)
    const mine = ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1')
    expect(mine, `${method}/${rt}`).toHaveLength(1)
    return mine[0].distM.toFixed(6)
  }

  it('prints the six-decimal reading each of the five shapes produced', () => {
    expect(tagRange('embedded', 'ss')).toBe(RANGE_M.embedded)
    expect(tagRange('deferred', 'ss')).toBe(RANGE_M.deferred)
    expect(tagRange('fixed', 'ss')).toBe(RANGE_M.fixed)
    expect(tagRange('embedded', 'ds')).toBe(RANGE_M.ds)
    expect(tagRange('deferred', 'ds')).toBe(RANGE_M.ds)
  })

  it('embedded and deferred agree to the last digit, and fixed does not', () => {
    // 「嵌入与延后读出的字面上是同一个数」 / 「固定读出的不一样」
    expect(RANGE_M.embedded).toBe(RANGE_M.deferred)
    expect(RANGE_M.fixed).not.toBe(RANGE_M.embedded)
    // 「双边的两种最接近真值」
    const err = (s: string) => Math.abs(Number(s) - BENCH_M)
    expect(err(RANGE_M.ds)).toBeLessThan(err(RANGE_M.embedded))
    expect(err(RANGE_M.ds)).toBeLessThan(err(RANGE_M.fixed))
  })

  it('with the crystals matched all five are bit-identical', () => {
    // 「两端晶振走得一样快时……三种形态读出同一个 5.001420 m，逐位相同」
    for (const [rt, method] of [
      ['embedded', 'ss'], ['deferred', 'ss'], ['fixed', 'ss'], ['embedded', 'ds'], ['deferred', 'ds'],
    ] as const) {
      expect(tagRange(rt, method, false), `${method}/${rt}`).toBe(RANGE_M.matched)
    }
  })
})

describe('uwb-reply-time · the cap each shape earns', () => {
  it('states the cap uwbMaxAnchors gives each shape', () => {
    expect(CAP.ssEmbedded).toBe(uwbMaxAnchors('twr', 'ss', 'embedded'))
    expect(CAP.ssDeferred).toBe(uwbMaxAnchors('twr', 'ss', 'deferred'))
    expect(CAP.ssFixed).toBe(uwbMaxAnchors('twr', 'ss', 'fixed'))
    expect(CAP.dsEmbedded).toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    expect(CAP.dsDeferred).toBe(uwbMaxAnchors('twr', 'ds', 'deferred'))
    // The two numbers the prose and the quiz name.
    expect(CAP.dsEmbedded).toBe(9)
    expect([CAP.ssEmbedded, CAP.ssDeferred, CAP.ssFixed, CAP.dsDeferred]).toEqual([33, 33, 33, 33])
  })

  it('each cap really is the largest count whose longest frame fits the PSDU', () => {
    for (const [method, rt, cap] of [
      ['ss', 'embedded', CAP.ssEmbedded], ['ss', 'deferred', CAP.ssDeferred], ['ss', 'fixed', CAP.ssFixed],
      ['ds', 'embedded', CAP.dsEmbedded], ['ds', 'deferred', CAP.dsDeferred],
    ] as const) {
      expect(uwbLongestFrameBytes(cap, 'twr', 'time', method, rt), `${method}/${rt} at cap`)
        .toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
      expect(uwbLongestFrameBytes(cap + 1, 'twr', 'time', method, rt), `${method}/${rt} past cap`)
        .toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    }
  })

  it('names the Poll as what binds every shape but the embedded DS-TWR Final', () => {
    // 「单边的三种形态轮里根本没有 Final，最长的是每锚点只长 3 字节的 Poll」
    for (const [method, rt] of [
      ['ss', 'embedded'], ['ss', 'deferred'], ['ss', 'fixed'], ['ds', 'deferred'],
    ] as const) {
      expect(uwbLongestFrameBytes(CAP.dsDeferred, 'twr', 'time', method, rt), `${method}/${rt}`)
        .toBe(uwbPollBytes(CAP.dsDeferred))
    }
    // …and the Poll grows by 3 octets an anchor, the embedded Final by 12.
    expect(uwbPollBytes(2) - uwbPollBytes(1)).toBe(3)
  })
})

describe('uwb-reply-time · the slot the shape asks for', () => {
  it('quotes the two slot demands at nine anchors, and their difference', () => {
    expect(DEMAND_ANCHORS).toBe(CAP.dsEmbedded)
    expect(DEMAND.ss).toBe(uwbSlotFitNs(DEMAND_ANCHORS, 'twr', 'time', undefined, 'ss', 'embedded'))
    expect(DEMAND.dsEmbedded).toBe(uwbSlotFitNs(DEMAND_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded'))
    expect(DEMAND.ss).toBe(228_597)
    expect(DEMAND.dsEmbedded).toBe(304_495)
    expect(DEMAND.dsEmbedded - DEMAND.ss).toBe(75_898)
  })

  it('a 300 RSTU slot holds nine anchors of SS-TWR and refuses six of embedded DS-TWR', () => {
    expect(SHORT_SLOT_NS).toBe(rstuNs(300))
    expect(SHORT_SLOT_NS).toBe(250_000)
    expect(DEMAND.ss).toBeLessThanOrEqual(SHORT_SLOT_NS)
    expect(uwbSlotFitNs(6, 'twr', 'time', undefined, 'ds', 'embedded')).toBeGreaterThan(SHORT_SLOT_NS)
  })
})

describe('uwb-reply-time · the two-sided bound on the fixed reply time (design §6.1)', () => {
  const session = uwbReplyTime.scenario().uwb!
  const w = fixedWindowRstu(BENCH_M, session.slotRstu)

  it('prints the whole RSTU the schema accepts at this geometry', () => {
    expect(w.lo).toBe(2163)
    expect(w.hi).toBe(4345)
    // 「会话的缺省值恰好是一整个时隙」, and it is comfortably inside.
    expect(session.fixedReplyRstu).toBe(session.slotRstu)
    expect(session.fixedReplyRstu).toBeGreaterThan(w.lo)
    expect(session.fixedReplyRstu).toBeLessThan(w.hi)
  })

  it('moves by exactly one RSTU between this bench and 200 m', () => {
    // 「把两台设备从 5 m 拉到 200 m，上界也只从 4345 降到 4344 RSTU，整整一个 RSTU」
    const far = fixedWindowRstu(200, session.slotRstu)
    expect(far.hi).toBe(4344)
    expect(w.hi - far.hi).toBe(1)
    expect(far.lo).toBe(w.lo) // and the lower bound does not move at all
  })

  it('is the bound the schema actually enforces, in both directions', () => {
    const at = (fixedReplyRstu: number): Scenario => {
      const sc = uwbReplyTimeScenario('fixed')
      return { ...sc, uwb: { ...sc.uwb!, fixedReplyRstu } }
    }
    // Each end itself is accepted; one RSTU past it is refused, and for two different reasons.
    expect(() => ScenarioSchema.parse(at(w.lo))).not.toThrow()
    expect(() => ScenarioSchema.parse(at(w.hi))).not.toThrow()
    expect(ScenarioSchema.safeParse(at(w.lo - 1)).success).toBe(false)
    const tooLate = ScenarioSchema.safeParse(at(w.hi + 1))
    expect(tooLate.success).toBe(false)
    expect(tooLate.success ? '' : tooLate.error.issues.map((i) => i.message).join('')).toContain('切掉')
    // tryThis: 「退到半个时隙……响应会落进还没轮到它的时隙」
    const tooEarly = ScenarioSchema.safeParse(at(session.slotRstu / 2))
    expect(tooEarly.success).toBe(false)
    expect(tooEarly.success ? '' : tooEarly.error.issues.map((i) => i.message).join('')).toContain('还没轮到它')
  })

  it('and half a slot really does put the answer inside slot 0', () => {
    // 「排头那个锚点就会在 1.20 ms 处发送，那时它自己的时隙还没开始」
    const session2 = uwbReplyTime.scenario().uwb!
    const at = (rstuNs(session2.slotRstu / 2) + uwbPpduNs(BYTES.poll)) / 1e6
    expect(at.toFixed(2)).toBe('1.20')
    expect(at * 1e6).toBeLessThan(rstuNs(session2.slotRstu))
  })
})

describe('uwb-reply-time · the deferred shape, end to end', () => {
  const rs = runOf(uwbReplyTime, undefined, RUN_NS)

  it('has no range at the Response and one when the deferred message lands', () => {
    // observe: 「测距行出现在 4.184 ms……不是 2.181 ms 的 Response 落地时」
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.node === 'tag-1' && r.dir === 'rx')
    const resp = stamps.find((r) => r.frameKind === 'uwbResp')!
    const defer = stamps.find((r) => r.frameKind === 'uwbSsDefer')!
    const ranges = ofType(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].node).toBe('tag-1')
    expect(ranges[0].t).toBeGreaterThan(resp.t)
    expect(ranges[0].t).toBeGreaterThanOrEqual(defer.t)
    expect((ranges[0].t / 1e6).toFixed(3)).toBe('4.184')
    expect((resp.t / 1e6).toFixed(3)).toBe('2.181')
  })

  it('stamps the deferred message at both ends, and no arithmetic reads those stamps', () => {
    // The `deeper` claim: 「两端都给它的到达与离开打了戳……但算术一个都不用」
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.frameKind === 'uwbSsDefer')
    expect(stamps.map((r) => `${r.node}/${r.dir}`).sort()).toEqual(['anchor-1/tx', 'tag-1/rx'])
    // Proof that the stamp is unused: the range is the one an SS-TWR round computes from the
    // Response's own round trip and the carried reply time, so it equals the embedded shape's
    // to the last digit — which it could not if this message's own arrival entered it.
    expect(RANGE_M.deferred).toBe(RANGE_M.embedded)
  })

  it('never gives the anchor a range, in any of the three shapes (design §7)', () => {
    for (const rt of ['embedded', 'deferred', 'fixed'] as const) {
      const nodes = ofType(runShape(rt), 'UWB_RANGE').map((r) => r.node)
      expect(nodes, rt).toEqual(['tag-1'])
    }
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The file above reads this lesson's figures off the module's own exports — `BYTES`, `CAP`,
 * `RANGE_M`, `FIG` — and measures those against runs, which is why so little of it is a number
 * typed twice. What it does not do is read the **sentences**: the sampling sweep of 2026-10-12
 * planted six of this lesson's figures and four went unnoticed, and the sweep of 2026-10-14 (the
 * first one that could see figures typed into a built string) found six more of nine. Here every
 * figure is parsed out of the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the arithmetic line is evaluated with the figures the lesson prints.** 「(Tround −
 *    Treply·(1 − Coffs)) / 2」 has two figures in it, and they are fed to the engine's own
 *    `ssTwrCorrected` as the 1 and the 2 — a planted either one makes the two disagree.
 *  - **「A + 1」 and 「2A + 1」 are evaluated at the A the table prints**, against the slots the
 *    engine really asks for, so the row of formulas and the row of counts cannot drift apart.
 *  - **the figure's own span labels are read against the run of the lane they are drawn in**:
 *    the embedded lane's bar says 20 B because the embedded Response is 20 octets.
 *  - **「1 RSTU 约 833 ns」 is read at the precision it prints** — the unit is 833.33… ns, and
 *    the term says 「约」, so it is read rounded to the nanosecond.
 *  - **「Treply 错 1 ns，距离就错约 15 cm」 is read as the arithmetic it describes**: half the
 *    error times the speed of light, rounded to the printed centimetre.
 */
describe('uwb-reply-time · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const TERMS = blockText(uwbReplyTime.terms)
  const PIC = blockText(uwbReplyTime.picture)
  const NUMS = blockText(uwbReplyTime.numbers)
  const DEEP = blockText(uwbReplyTime.deeper)
  const LIM = blockText(uwbReplyTime.limits)
  const SRC = blockText(uwbReplyTime.sources)
  const OBS = blockText(uwbReplyTime.observe)
  const TRY = blockText(uwbReplyTime.tryThis)
  const QUIZ = blockText(uwbReplyTime.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    uwbReplyTime.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  const formulas = (): { heading?: string; text: string; note?: string }[] =>
    uwbReplyTime.numbers!.filter((b) => b.kind === 'formula') as unknown as
      { heading?: string; text: string; note?: string }[]
  /** The shape a column of the octet table or the five-route table names. */
  const shapeOf = (head: string): UwbReplyTime => {
    if (head.includes('嵌入')) return 'embedded'
    if (head.includes('延后')) return 'deferred'
    if (head.includes('固定')) return 'fixed'
    throw new Error(`no shape for 「${head}」`)
  }
  const respBytes = (rt: UwbReplyTime, method: 'ss' | 'ds' = 'ss'): number =>
    txOf(runShape(rt, method), 'uwbResp')[0]!.frame.bytes
  const pollBytes = (rt: UwbReplyTime): number => txOf(runShape(rt), 'uwbPoll')[0]!.frame.bytes

  it('reads the term, the formula’s notation and the arithmetic line', () => {
    // 「1 RSTU 约 833 ns」 — the unit is 833.33… ns, and the term says 「约」
    const [one, ns] = figs(TERMS, /(\d) RSTU 约 (\d+) ns/, 'the term on the unit')
    expect(rstuNs(one!), 'the engine’s own conversion, to the nanosecond the term prints')
      .toBe(Math.round(rstuNs(one!)))
    expect(ns, 'and that is the figure').toBe(rstuNs(one!))
    /*
     * 「Treply = T3 − T2：T2 是锚点收到 Poll 的时刻，T3 是它发出 Response 的时刻」 — the two
     * subscripts are read as the two instants they name, measured at the anchor: the reply time
     * the engine carries is exactly the difference, and the later instant has the higher
     * subscript.
     */
    const [t3, t2, t2again] = figs(PIC, /Treply = T(\d) − T(\d)：T(\d) 是锚点收到 Poll 的时刻/,
      '`picture` on the two instants')
    expect(t2again, 'the same subscript, named twice in one sentence').toBe(t2)
    expect(t3! - t2!, 'the later instant is the next one').toBe(1)
    const rs = runShape('embedded')
    const resp = txOf(rs, 'uwbResp')[0]!
    const poll = txOf(rs, 'uwbPoll')[0]!
    expect(resp.t, 'and T3 really is after T2').toBeGreaterThan(poll.t)
    // 「T3 是这一帧自己的发送时刻」 — the same subscript again, four more times
    for (const re of [
      /T(\d) 是它发出 Response 的时刻/,
      /只有一件事不对劲——T(\d) 是这一帧自己的发送时刻/,
      /能做到，T(\d) 就在封帧之前已经是个已知数/,
      /此时 T(\d) 已是实测值/,
    ]) {
      expect(figs(PIC, re, '`picture` on the send instant')[0], 'the same instant as the formula’s')
        .toBe(t3)
    }
    /*
     * 「T̂prop = (Tround − Treply·(1 − Coffs)) / 2」 — the two figures of the line are fed to the
     * engine's own corrected SS-TWR, so a planted either one makes the two disagree.
     */
    const line = formulas().find((f) => f.text.includes('Tround'))!
    const [unity, half] = figs(line.text, /\(Tround − Treply·\((\d) − Coffs\)\) \/ (\d)/,
      'the arithmetic line')
    const round = 1_000_000
    const reply = 400_000
    const coffs = 35e-6
    expect(ssTwrCorrected(round, reply, coffs), 'the engine’s own corrected SS-TWR')
      .toBeCloseTo((round - reply * (unity! - coffs)) / half!, 6)
  })

  it('reads the bound’s own two slots, and the two figures `sources` quotes for a frame', () => {
    /*
     * **Five figures got past the reads above** (sweep of 2026-10-14), and two of them turned out
     * to be printed by a sentence the sweep attributed elsewhere: 「127」 and 「20」 are
     * interpolated where `numbers` and the figure print them, so the only literal in the file is
     * the one `sources` typed — and the sweep plants a site, not a sentence.
     *
     * 「时隙 − Poll − 飞行时间 ≤ F ≤ 2 × 时隙 − Poll − Response − 守卫 − 飞行时间」 — the 2 is
     * the one figure of that line, and it is read by rebuilding the bound with it: the upper edge
     * `fixedWindowRstu` really returns has to come out of the same arithmetic, at the slot and
     * the distance this scene runs.
     */
    const bound = formulas().find((f) => f.text.includes('≤  F  ≤') || f.text.includes('≤ F ≤'))!
    const [slots] = figs(bound.text, /≤\s+(\d) × 时隙 − Poll − Response − 守卫 − 飞行时间/,
      'the bound’s upper line')
    const sc = uwbReplyTimeScenario('fixed')
    const slotNs = rstuNs(sc.uwb!.slotRstu)
    const tofNs = BENCH_M / C_M_PER_NS
    const upperNs = slots! * slotNs - uwbPpduNs(uwbPollBytes(1))
      - uwbPpduNs(uwbRespBytes('ss', 'fixed')) - UWB_SLOT_GUARD_NS - tofNs
    const hi = fixedWindowRstu(BENCH_M, sc.uwb!.slotRstu).hi
    expect(rstuNs(hi), 'the last whole RSTU that bound allows').toBeLessThanOrEqual(upperNs)
    expect(rstuNs(hi + 1), 'and one more is past it').toBeGreaterThan(upperNs)
    // the lower line is the same arithmetic one slot down, which is why the window is one slot wide
    const lowerNs = slotNs - uwbPpduNs(uwbPollBytes(1)) - tofNs
    const lo = fixedWindowRstu(BENCH_M, sc.uwb!.slotRstu).lo
    expect(rstuNs(lo), 'the first whole RSTU it allows').toBeGreaterThanOrEqual(lowerNs)
    expect(rstuNs(lo - 1), 'and one below is short of it').toBeLessThan(lowerNs)
    // 「一帧最长 127 字节的 PSDU 由 §16.2.7 的物理头字段决定」
    const [psdu] = figs(SRC, /一帧最长 (\d+) 字节的 PSDU/, '`sources` on the PSDU')
    expect(psdu, 'the PSDU this engine allows').toBe(UWB_MAX_PSDU_BYTES)
    expect(psdu, 'and the same figure `numbers` prints when it computes the caps')
      .toBe(figs(NUMS, /还塞得进 (\d+) 字节 PSDU/, '`numbers` on the same PSDU')[0])
    /*
     * 「±20 ppm 的晶振容差来自 §16.4.9」 — the standard's tolerance (class (a): no corpus ships
     * with this repo), and this scene was built to sit on it: the anchor's crystal is exactly
     * that far out and the tag's is inside it, which is what makes 「两端晶振相差 35 ppm」 a
     * legal pair rather than an invented one.
     */
    const [tol] = figs(SRC, /±(\d+) ppm 的晶振容差/, '`sources` on the tolerance')
    expect(PPM.anchor, 'the anchor sits exactly on the tolerance').toBe(tol)
    expect(Math.abs(PPM.tag), 'and the tag inside it').toBeLessThanOrEqual(tol!)
    expect(PPM.anchor - PPM.tag, 'so the gap the table prints is a legal pair')
      .toBeLessThanOrEqual(2 * tol!)
  })

  it('reads the octet table and the figure’s own span labels against the three runs', () => {
    const tb = tables().find((x) => x.head[0] === '帧')!
    for (const [c, head] of tb.head.slice(1).entries()) {
      const rt = shapeOf(head)
      for (const row of tb.rows) {
        const label = row[0]!
        const printed = row[c + 1]!
        if (label === 'Poll') {
          same(printed.replace(' B', ''), pollBytes(rt), `${label} · ${head}`)
        } else if (label === 'Response') {
          same(printed.replace(' B', ''), respBytes(rt), `${label} · ${head}`)
        } else if (label === '延后报文') {
          const msgs = txOf(runShape(rt), 'uwbSsDefer')
          if (printed === '—') expect(msgs, `${label} · ${head}`).toHaveLength(0)
          else same(printed.replace(' B', ''), msgs[0]!.frame.bytes, `${label} · ${head}`)
        } else if (label.startsWith('A = ')) {
          /*
           * 「A = 9 时的时隙数」 — the row above prints the formula, this one its value, so the
           * two are read together: the formula is evaluated at the A this label prints.
           */
          const [a] = figs(label, /A = (\d+) 时/, 'the row’s own anchor count')
          expect(a, 'the anchor count the demand section uses').toBe(DEMAND_ANCHORS)
          const shape = tb.rows.find((r) => r[0] === '一轮的时隙数')![c + 1]!
          const [mul, add] = raw(shape, /^(\d?)A \+ (\d)$/, `the formula of ${head}`)
          expect(val(printed), `${label} · ${head}`)
            .toBe((mul === '' ? 1 : val(mul!)) * a! + val(add!))
        }
      }
    }
    // 「嵌入那一轮的 Response 最长」 — the figure's own bars, read against the lane they are in
    const lanes = uwbReplyTimeTiming().lanes
    for (const lane of lanes) {
      if (lane.label === '时隙') continue
      const rt = shapeOf(lane.label)
      for (const span of lane.spans) {
        const [bytes] = figs(span.label!, /(\d+) B$/, `the bar 「${span.label}」`)
        if (span.label!.startsWith('Poll')) same(String(bytes), pollBytes(rt), `${lane.label}: Poll`)
        else if (span.label!.startsWith('延后报文')) {
          same(String(bytes), txOf(runShape(rt), 'uwbSsDefer')[0]!.frame.bytes, `${lane.label}: defer`)
        } else same(String(bytes), respBytes(rt), `${lane.label}: Response`)
      }
    }
    // 「Response 相差的六个字节就是那段等待自己那一小节」
    const [sixCn] = raw(NUMS, /Response 相差的(.)个字节就是那段等待自己那一小节/,
      'the paragraph on the six octets')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    expect(respBytes('embedded') - respBytes('fixed'), 'what those octets really come to')
      .toBe(cn(sixCn!))
  })

  it('reads the two caps, what binds them and the PSDU they fit in', () => {
    // 「还塞得进 127 字节 PSDU」
    const [psdu] = figs(NUMS, /还塞得进 (\d+) 字节 PSDU/, 'the paragraph on the PSDU')
    expect(psdu, 'the PSDU this engine allows').toBe(UWB_MAX_PSDU_BYTES)
    // 「9 这个数属于双边嵌入式 Final…可单边…上限本该是 33」
    const tb = tables().find((x) => x.head[0] === '形态')!
    for (const row of tb.rows) {
      const [shape, longest, cap] = row as [string, string, string]
      const method = shape.startsWith('DS') ? 'ds' : 'ss'
      const rt = shapeOf(shape)
      expect(val(cap), `the cap ${shape} really earns`).toBe(uwbMaxAnchors('twr', method, rt))
      const binds = longest.includes('Final') ? 'Final' : 'Poll'
      expect(longest.startsWith(binds), `${shape}: the frame its own row names`).toBe(true)
      // the row prints the growth as `base + nA`: both figures are the engine's own arithmetic
      const [base, growth] = figs(longest, /(\d+) \+ (\d+)A/, `${shape}: how the frame grows`)
      const named = (a: number): number =>
        binds === 'Final' ? uwbFinalBytes(a, rt) : uwbPollBytes(a)
      expect(named(0), `${shape}: the frame its row names, with no anchor in it`).toBe(base)
      expect(named(1) - named(0), `${shape}: what one more anchor costs it`).toBe(growth)
      const longestAt = (a: number): number =>
        uwbLongestFrameBytes(a, 'twr', 'time', method, rt)
      const cap2 = uwbMaxAnchors('twr', method, rt)
      expect(longestAt(cap2), `${shape}: the cap really fits the PSDU`)
        .toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
      expect(longestAt(cap2 + 1), `${shape}: and one more anchor does not`)
        .toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    }
    // the quiz prints the same two caps and the same growth
    const [ssCap, dsCap] = figs(QUIZ, /单边三种形态的锚点上限都是 (\d+)，双边嵌入式却只有 (\d+)/,
      'the quiz on the two caps')
    expect(ssCap, 'the single-sided cap').toBe(uwbMaxAnchors('twr', 'ss', 'embedded'))
    expect(dsCap, 'and the double-sided one').toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    const [qGrowth] = figs(QUIZ, /最长的是每锚点长 (\d+) 字节的 Poll/, 'the quiz on the Poll’s growth')
    expect(uwbPollBytes(1) - uwbPollBytes(0), 'what one more anchor adds to the Poll').toBe(qGrowth)
  })

  it('reads the slot demand at nine anchors, and the 300 RSTU slot', () => {
    // 「单边一轮最长的帧要 X µs 的时隙，双边嵌入式要 Y µs——多出的 Z µs」
    const [anchors, ssUs, dsUs, diffUs] = figs(NUMS,
      /(\d+) 个锚点时，单边一轮最长的帧要 ([\d.]+) µs 的时隙，双边嵌入式要 ([\d.]+) µs——多出的 ([\d.]+) µs/,
      'the paragraph on the two demands')
    expect(anchors, 'the anchor count it is measured at').toBe(DEMAND_ANCHORS)
    same(String(ssUs), DEMAND.ss / 1000, 'the single-sided demand')
    same(String(dsUs), DEMAND.dsEmbedded / 1000, 'the double-sided one')
    same(String(diffUs), (DEMAND.dsEmbedded - DEMAND.ss) / 1000, 'and the difference')
    expect(DEMAND.dsEmbedded - DEMAND.ss, 'which is the Final a single-sided round never sends')
      .toBeGreaterThan(0)
    // 「一个 300 RSTU 的时隙有 X µs：装得下 9 个锚点的单边一轮，装不下六个锚点的双边嵌入式一轮」
    const [slotRstu, slotUs] = figs(NUMS, /一个 (\d+) RSTU（ranging slot time unit）的时隙有 (\d+) µs/,
      'the paragraph on the short slot')
    expect(rstuNs(slotRstu!), 'the slot the comparison is read against').toBe(SHORT_SLOT_NS)
    same(String(slotUs), SHORT_SLOT_NS / 1000, 'and what it comes to')
    const [fitsCn, failsCn] = raw(NUMS, /装得下 (\d+) 个锚点的单边一轮，装不下(.)个锚点的双边嵌入式一轮/,
      'the paragraph on what it holds')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    expect(uwbSlotFitNs(val(fitsCn!), 'twr', 'time', undefined, 'ss', 'deferred'),
      'the single-sided round it holds').toBeLessThanOrEqual(SHORT_SLOT_NS)
    expect(uwbSlotFitNs(cn(failsCn!), 'twr', 'time', undefined, 'ds', 'embedded'),
      'and the double-sided one it does not').toBeGreaterThan(SHORT_SLOT_NS)
  })

  it('reads the five-route table, and the reading the matched crystals give', () => {
    const tb = tables().find((x) => x.heading?.includes('五种走法'))!
    const [ppm] = figs(tb.head.join('\n'), /两端晶振相差 (\d+) ppm/, 'the table’s own column heading')
    expect(ppm, 'the gap between the two crystals this scene really runs')
      .toBe(PPM.anchor - PPM.tag)
    const tagRangeOf = (rs: TLRecord[]): string =>
      ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1')[0]!.distM.toFixed(6)
    for (const row of tb.rows) {
      const [shape, apart, aligned] = row as [string, string, string]
      const method = shape.startsWith('DS') ? 'ds' : 'ss'
      const rt = shapeOf(shape)
      expect(apart.replace(' m', ''), `${shape}: with the crystals apart`)
        .toBe(tagRangeOf(runShape(rt, method)))
      expect(aligned.replace(' m', ''), `${shape}: and with them matched`)
        .toBe(tagRangeOf(runShape(rt, method, false)))
    }
    // 「三种形态读出同一个 5.001420 m，逐位相同」 — the formula note's own figure
    const note = formulas().find((f) => f.note?.includes('逐位相同'))!.note!
    const [matchedM] = raw(note, /读出同一个 ([\d.]+) m，逐位相同/, 'the note on the matched reading')
    for (const rt of ['embedded', 'deferred', 'fixed'] as UwbReplyTime[]) {
      expect(matchedM, `${rt}, with the crystals matched`).toBe(tagRangeOf(runShape(rt, 'ss', false)))
    }
    // 「真值是 5.00 m」, and which of the five is nearest it
    const [truth] = raw(NUMS, /真值是 ([\d.]+) m/, 'the paragraph on the truth')
    same(truth!, BENCH_M, 'the distance this scene really is')
    const err = (s: string): number => Math.abs(Number(s) - BENCH_M)
    expect(err(tagRangeOf(runShape('embedded', 'ds'))), '「双边的两种最接近真值」')
      .toBeLessThan(err(tagRangeOf(runShape('embedded', 'ss'))))
  })

  it('reads `deeper`, `limits` and `sources` on the figures they carry', () => {
    /*
     * 「它在 T0 + Ap + ToF + F + k·S 处发送，而这一刻必须落在第 k+1 个时隙之内：不早于
     * T0 + (k+1)·S，也不晚到 T0 + (k+2)·S 减去 Ar 与守卫」 — the three T0 are one instant and
     * the two offsets are consecutive slots, read against the round this scene really runs.
     */
    const zeros = [...DEEP.matchAll(/T(\d)(?=、| \+ Ap| \+ \(k)/g)].map((m) => val(m[1]!))
    expect(zeros.length, 'the round start, named four times').toBe(4)
    expect(new Set(zeros).size, 'and it is the same instant each time').toBe(1)
    const [lo, hi] = figs(DEEP, /不早于 T\d \+ \(k\+(\d)\)·S，也不晚到 T\d \+ \(k\+(\d)\)·S/,
      '`deeper` on the two edges of the slot')
    expect(hi! - lo!, 'the slot a response must land in is one slot wide').toBe(1)
    const rs = runShape('fixed')
    const round = ofType(rs, 'UWB_ROUND')[0]!
    const resp = txOf(rs, 'uwbResp')[0]!
    const slotNs = rstuNs(uwbReplyTimeScenario('fixed').uwb!.slotRstu)
    expect(resp.t - round.t, 'and this scene’s only responder sends inside slot k+1')
      .toBeGreaterThanOrEqual(lo! * slotNs)
    expect(resp.t - round.t, 'and before the next one').toBeLessThan(hi! * slotNs)
    // 「Treply 错 1 ns，距离就错约 15 cm（误差是它的一半乘光速）」
    const [errNs, errCm] = figs(LIM, /Treply 错 (\d+) ns，距离就错约 (\d+) cm/,
      '`limits` on what a nanosecond costs')
    same(String(errCm), (errNs! / 2) * C_M_PER_NS * 100, 'half the error, times the speed of light')
    /*
     * 「2 ms 的测距时隙…时隙末尾 200 ns 的飞行守卫，以及各帧信息单元的宽度——帧头 9 字节、
     * RRTI IE 6 字节、帧校验 2 字节」 — four model values, each read off the engine.
     */
    const [slotMs] = figs(SRC, /模型选择：(\d+) ms 的测距时隙/, '`sources` on the slot')
    expect(rstuNs(uwbReplyTimeScenario('deferred').uwb!.slotRstu), 'the slot this scene runs')
      .toBe(slotMs! * MS)
    const [guardNs] = figs(SRC, /时隙末尾 (\d+) ns 的飞行守卫/, '`sources` on the guard')
    expect(guardNs, 'the guard the engine keeps').toBe(UWB_SLOT_GUARD_NS)
    const [mhr, ie, fcs] = figs(SRC, /帧头 (\d+) 字节、RRTI IE (\d+) 字节、帧校验 (\d+) 字节/,
      '`sources` on the three widths')
    expect([mhr, ie, fcs], 'the three widths this engine really uses')
      .toEqual([UWB_MHR_BYTES, RRTI_IE_BYTES, UWB_FCS_BYTES])
    expect(mhr! + ie! + fcs!, 'and together they are the deferred message')
      .toBe(txOf(runShape('deferred'), 'uwbSsDefer')[0]!.frame.bytes)
    // `limits` prints the same three widths and the two conclusions they decide
    const [limMhr, limIe, limFcs, limGuard] = figs(LIM,
      /帧头 (\d+) 字节、那一小节 (\d+) 字节、帧校验 (\d+) 字节、时隙守卫 (\d+) ns/,
      '`limits` on the same four')
    expect([limMhr, limIe, limFcs, limGuard], 'the same four, a second time')
      .toEqual([mhr, ie, fcs, guardNs])
    const [diff, deferB, capFrom, capTo] = figs(LIM,
      /「Response 差 (\d+) 个字节」「延后报文 (\d+) 字节」「上限从 (\d+) 跳到 (\d+)」/,
      '`limits` on the three conclusions')
    expect(diff, 'the octets the two Responses differ by')
      .toBe(respBytes('embedded') - respBytes('fixed'))
    expect(deferB, 'the deferred message')
      .toBe(txOf(runShape('deferred'), 'uwbSsDefer')[0]!.frame.bytes)
    expect([capFrom, capTo], 'and the two caps')
      .toEqual([uwbMaxAnchors('twr', 'ds', 'embedded'), uwbMaxAnchors('twr', 'ss', 'embedded')])
  })

  it('reads `observe` and `tryThis` against the two rounds they describe', () => {
    // 「测距行出现在 4.184 ms…不是 2.181 ms 的 Response 落地时」
    const rs = runShape('deferred')
    const [rangeMs, respMs] = figs(OBS, /测距行出现在 ([\d.]+) ms.*?不是 ([\d.]+) ms 的 Response 落地时/s,
      '`observe` on the two instants')
    const range = ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1')[0]!
    same(String(rangeMs), range.t / MS, 'when the range really appears')
    const resp = txOf(rs, 'uwbResp')[0]!
    same(String(respMs), (resp.t + resp.frame.txTimeNs) / MS, 'and when the Response really lands')
    expect(range.t, 'the range comes with the follow-up, not with the Response')
      .toBeGreaterThan(resp.t + resp.frame.txTimeNs)
    /*
     * 「它的发送时刻从 2.000 ms 挪到了 2.198 ms——正好晚了一个 Poll 的空口时间」 — the two sends
     * measured, and the difference read as the Poll's own airtime.
     */
    const [wasMs, nowMs] = figs(TRY, /它的发送时刻从 ([\d.]+) ms 挪到了 ([\d.]+) ms/,
      '`tryThis` on the fixed Response’s send')
    same(String(wasMs), txOf(runShape('deferred'), 'uwbResp')[0]!.t / MS, 'where it leaves today')
    const fixedResp = txOf(runShape('fixed'), 'uwbResp')[0]!
    same(String(nowMs), fixedResp.t / MS, 'and where the fixed shape puts it')
    /*
     * 「正好晚了一个 Poll 的空口时间」 — read on the measured instants rather than on the two
     * printed ones: the lesson prints them to the microsecond (2.000 and 2.198 ms), and the
     * airtime they differ by is 197.601 µs, so the claim is a ratio of one, to the precision
     * the two printed figures can carry.
     */
    const movedNs = fixedResp.t - txOf(runShape('deferred'), 'uwbResp')[0]!.t
    expect(movedNs / uwbPpduNs(uwbPollBytes(1)), 'which is one Poll airtime later')
      .toBeCloseTo(1, 3)
    expect(Math.round((nowMs! - wasMs!) * 1000), 'and the two printed figures say the same')
      .toBe(Math.round(movedNs / 1000))
    // 「越过 WINDOW.hi 会被拒…退到半个时隙也会被拒，理由完全不同」
    const sc = uwbReplyTimeScenario('fixed')
    const window = fixedWindowRstu(BENCH_M, sc.uwb!.slotRstu)
    const why = (f: number): string => {
      const edited = { ...sc, uwb: { ...sc.uwb!, fixedReplyRstu: f } }
      const r = ScenarioSchema.safeParse(edited)
      return r.success ? '' : r.error.issues.map((i) => i.message).join(' ')
    }
    const [hi, halfSlot] = figs(TRY, /越过 (\d+) 会被拒.*?退到半个时隙、也就是 (\d+) 也会被拒/s,
      '`tryThis` on the two refusals')
    expect(hi, 'the upper edge the schema really has').toBe(window.hi)
    expect(halfSlot! * 2, 'and the half slot it names').toBe(sc.uwb!.slotRstu)
    expect(why(hi! + 1), 'one past the top is refused').not.toBe('')
    expect(why(halfSlot!), 'and half a slot is refused too').not.toBe('')
    expect(why(hi! + 1), '「两种越界，两条不一样的错误消息」').not.toBe(why(halfSlot!))
    expect(why(sc.uwb!.fixedReplyRstu), 'while the default is accepted').toBe('')
  })
})
