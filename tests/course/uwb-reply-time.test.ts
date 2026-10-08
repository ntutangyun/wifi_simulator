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
  uwbPpduNs, uwbSlotFitNs,
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
    expect(uwbReplyTime.module).toBe(14)
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
