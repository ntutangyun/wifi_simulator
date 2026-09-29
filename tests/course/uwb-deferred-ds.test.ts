/**
 * Every empirical claim in 「延后之后，锚点就只是一个应答器」, measured against the lesson's
 * own two scenarios. Each assertion names the sentence it guards.
 *
 * The three things this file has to keep honest, because the lesson rests its
 * whole argument on them: the Final's two lengths (read off `TX_START`, not off
 * `uwbFinalBytes`), the anchor cap each of them earns (searched against the PSDU
 * limit, so the "9 → 33" claim is derived rather than asserted), and design §7's
 * table of who ends up holding a range — which is read from the `node` field of
 * every `UWB_RANGE` the two rounds produced.
 */
import { describe, expect, it } from 'vitest'
import {
  BYTES, DEMAND, DROPPED_BYTES, FIG, FIG_ANCHORS, uwbDeferredDs, uwbDeferredDsFields,
  uwbDeferredDsScenario,
} from '../../src/course/uwb/uwb-deferred-ds'
import { BENCH_M, CAP, RANGE_M } from '../../src/course/uwb/uwb-reply-time'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { anchor } from '../../src/course/lessonKit'
import {
  RMI_FINAL_DEFERRED_ENTRY_BYTES, RMI_FINAL_ENTRY_BYTES, RRTI_IE_BYTES, UWB_MAX_PSDU_BYTES,
  uwbFinalBytes, uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS

lessonShapeSuite(uwbDeferredDs, { runNs: RUN_NS })

function run(replyTime: 'embedded' | 'deferred'): TLRecord[] {
  const sc = uwbDeferredDsScenario(replyTime)
  expect(() => ScenarioSchema.parse(sc), replyTime).not.toThrow()
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

const txOf = (rs: TLRecord[], kind: string) =>
  ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)

describe('uwb-deferred-ds · where it sits in the course', () => {
  it('is the second reply-time lesson of the two-clocks module, published standard only', () => {
    expect(uwbDeferredDs.module).toBe(13)
    expect(MODULES[uwbDeferredDs.module].title).toBe('两只钟')
    expect(basisOf(uwbDeferredDs.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbDeferredDs.needs).toEqual(['uwb-dstwr', 'uwb-reply-time'])
    const src = uwbDeferredDs.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
  })

  it('declares four limits, and the three of design §10 are among them', () => {
    expect(uwbDeferredDs.limits).toHaveLength(4)
    expect(uwbDeferredDs.limits.map((l) => l.kind))
      .toEqual(['out-of-scope', 'unmodelled', 'unmodelled', 'model-value'])
    const text = uwbDeferredDs.limits.map((l) => l.text).join('\n')
    expect(text).toContain('§10.29.6.2')
    expect(text).toContain('RRTN')
    expect(text).toContain('slotStartNs')
    expect(text).toContain('15 cm')
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
  })

  it('loads the bench of uwb-reply-time, measured the other way', () => {
    const mine = uwbDeferredDs.scenario()
    expect(mine.uwb!.method).toBe('ds')
    expect(mine.uwb!.replyTime).toBe('deferred')
    expect(mine.nodes).toHaveLength(2)
    expect(ofType(runOf(uwbDeferredDs, undefined, RUN_NS), 'UWB_RANGE')
      .every((r) => r.trueDistM === BENCH_M)).toBe(true)
    expect(uwbDeferredDs.variants!.map((v) => v.scenario().uwb!.replyTime)).toEqual(['embedded'])
  })
})

describe('uwb-deferred-ds · the Final, on the air', () => {
  it('is 16 octets deferred and 26 embedded at this one anchor', () => {
    // 「它只有 16 字节，而嵌入形态同一个场景里的 Final 有 26 字节」
    expect(txOf(run('deferred'), 'uwbFinal').map((r) => r.frame.bytes)).toEqual([BYTES.finalDeferredOne])
    expect(txOf(run('embedded'), 'uwbFinal').map((r) => r.frame.bytes)).toEqual([BYTES.finalEmbeddedOne])
    expect(BYTES.finalDeferredOne).toBe(16)
    expect(BYTES.finalEmbeddedOne).toBe(26)
    // observe: 「多出来的 10 个字节」
    expect(BYTES.finalEmbeddedOne - BYTES.finalDeferredOne).toBe(10)
  })

  it('still lists the responder when deferred, and carries no time for it', () => {
    // 「延后的 Final 不是空的……走掉的只是……往返时间，和那一整串装着标签自己那段等待的小节」
    const deferred = txOf(run('deferred'), 'uwbFinal')[0]
    const embedded = txOf(run('embedded'), 'uwbFinal')[0]
    expect(deferred.frame.uwb!.finalTimes!.map((e) => e.id)).toEqual(['anchor-1'])
    expect(deferred.frame.uwb!.finalTimes![0].tround1).toBeUndefined()
    expect(deferred.frame.uwb!.finalTimes![0].treply2).toBeUndefined()
    expect(embedded.frame.uwb!.finalTimes![0].tround1).toBeGreaterThan(0)
    expect(embedded.frame.uwb!.finalTimes![0].treply2).toBeGreaterThan(0)
    // 「RRTI IE」 is in the embedded Final and gone from the deferred one.
    expect(embedded.frame.uwb!.ies).toContain('RRTI')
    expect(deferred.frame.uwb!.ies).not.toContain('RRTI')
    expect(deferred.frame.uwb!.ies).toContain('RMI')
  })

  it('grows by 2 octets an anchor deferred and 12 embedded, so 122 against 32 at nine', () => {
    expect(uwbFinalBytes(2, 'deferred') - uwbFinalBytes(1, 'deferred')).toBe(RMI_FINAL_DEFERRED_ENTRY_BYTES)
    expect(RMI_FINAL_DEFERRED_ENTRY_BYTES).toBe(2)
    expect(uwbFinalBytes(2, 'embedded') - uwbFinalBytes(1, 'embedded'))
      .toBe(RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES)
    expect(RMI_FINAL_ENTRY_BYTES + RRTI_IE_BYTES).toBe(12)
    expect(FIG_ANCHORS).toBe(CAP.dsEmbedded)
    expect(BYTES.finalEmbeddedMany).toBe(122)
    expect(BYTES.finalDeferredMany).toBe(32)
    expect(DROPPED_BYTES).toBe(90)
  })
})

describe('uwb-deferred-ds · the fields figure', () => {
  const spec = uwbDeferredDsFields()

  it('adds up to the embedded Final, box for box', () => {
    const total = spec.fields.reduce((n, f) => n + f.size, 0)
    expect(total).toBe(BYTES.finalEmbeddedMany)
    expect(spec.unit).toBe('B')
  })

  it('the four boxes the deferred Final keeps add up to the deferred Final', () => {
    // 「延后留下第一、二、三、六格，共 32 字节——中间两格的 90 字节就是它拿掉的」
    const kept = [0, 1, 2, 5].reduce((n, i) => n + spec.fields[i].size, 0)
    const dropped = [3, 4].reduce((n, i) => n + spec.fields[i].size, 0)
    expect(kept).toBe(BYTES.finalDeferredMany)
    expect(dropped).toBe(DROPPED_BYTES)
    expect(spec.total).toContain(`延后 ${BYTES.finalDeferredMany} 字节`)
    expect(spec.total).toContain(`差 ${DROPPED_BYTES} 在中间两格`)
    // Half the dropped octets are round trips, half are the initiator's own waits.
    expect(spec.fields[3].size).toBe(36)
    expect(spec.fields[4].size).toBe(54)
  })
})

describe('uwb-deferred-ds · the cap and the slot move with the Final', () => {
  it('earns 9 embedded and 33 deferred, each searched against the 127-octet PSDU', () => {
    expect(CAP.dsEmbedded).toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    expect(CAP.dsDeferred).toBe(uwbMaxAnchors('twr', 'ds', 'deferred'))
    expect(CAP.dsEmbedded).toBe(9)
    expect(CAP.dsDeferred).toBe(33)
    expect(BYTES.psdu).toBe(UWB_MAX_PSDU_BYTES)
    for (const [rt, cap] of [['embedded', CAP.dsEmbedded], ['deferred', CAP.dsDeferred]] as const) {
      expect(uwbLongestFrameBytes(cap, 'twr', 'time', 'ds', rt), rt).toBeLessThanOrEqual(BYTES.psdu)
      expect(uwbLongestFrameBytes(cap + 1, 'twr', 'time', 'ds', rt), rt).toBeGreaterThan(BYTES.psdu)
    }
    // 「延后之后……卡住这一轮的换成了 Poll」
    expect(uwbLongestFrameBytes(CAP.dsDeferred, 'twr', 'time', 'ds', 'deferred'))
      .toBe(uwbPollBytes(CAP.dsDeferred))
    expect(BYTES.pollMany).toBe(uwbPollBytes(FIG_ANCHORS))
  })

  it('shortens the slot at nine anchors and moves not one slot out of the round', () => {
    expect(DEMAND.dsEmbedded).toBe(uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded'))
    expect(DEMAND.dsDeferred).toBe(uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'deferred'))
    expect(DEMAND.dsEmbedded).toBe(304_495)
    expect(DEMAND.dsDeferred).toBe(228_597)
    // 「时隙数一个都没省：两种形态都是 2A + 2 个」
    expect(uwbSlotsPerTag('ds', FIG_ANCHORS)).toBe(2 * FIG_ANCHORS + 2)
    expect(uwbSlotsPerTag('ds', FIG_ANCHORS)).toBe(20)
    for (const rt of ['embedded', 'deferred'] as const) {
      const rounds = ofType(run(rt), 'UWB_ROUND')
      expect(rounds.map((r) => r.slots), rt).toEqual([uwbSlotsPerTag('ds', 1)])
      expect(fmtRecord(rounds[0])).toContain(`${uwbSlotsPerTag('ds', 1)} slots`)
    }
  })

  it('refuses ten anchors embedded and accepts them deferred', () => {
    // tryThis: 「把锚点加到十个，仍用嵌入形态：场景会被拒……改成延后就通过了」
    const many = (replyTime: 'embedded' | 'deferred'): Scenario => {
      const base = uwbDeferredDsScenario(replyTime)
      const extra: NodeCfg[] = Array.from({ length: CAP.dsEmbedded }, (_v, i) =>
        anchor(`anchor-${i + 2}`, `Anchor ${i + 2}`, 1 + 0.4 * i, 1, 1.2, 20))
      return { ...base, nodes: [...base.nodes, ...extra] }
    }
    expect(many('embedded').nodes.filter((n) => n.uwb!.role === 'anchor')).toHaveLength(CAP.dsEmbedded + 1)
    const refused = ScenarioSchema.safeParse(many('embedded'))
    expect(refused.success).toBe(false)
    // …and refused for the cap, not for some other rule that happens to bite first
    expect(refused.success ? '' : refused.error.issues.map((i) => i.message).join(''))
      .toContain(`最多容纳 ${CAP.dsEmbedded} 个 anchor`)
    expect(() => ScenarioSchema.parse(many('deferred'))).not.toThrow()
    // and the Final that would not fit is the number the lesson prints
    expect(uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')).toBe(134)
    expect(uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')).toBeGreaterThan(BYTES.psdu)
  })
})

describe('uwb-deferred-ds · who ends up holding the range (design §7)', () => {
  it('gives the anchor a range in the embedded round only', () => {
    expect(ofType(run('deferred'), 'UWB_RANGE').map((r) => r.node)).toEqual(['tag-1'])
    expect(ofType(run('embedded'), 'UWB_RANGE').map((r) => r.node).sort()).toEqual(['anchor-1', 'tag-1'])
  })

  it('prints the two instants, and the same distance on both lanes', () => {
    // 「嵌入形态的锚点在 4.194 ms 就算出了 4.999075 m……标签要等到 6.191 ms」
    const emb = ofType(run('embedded'), 'UWB_RANGE')
    const atAnchor = emb.find((r) => r.node === 'anchor-1')!
    const atTag = emb.find((r) => r.node === 'tag-1')!
    expect((atAnchor.t / 1e6).toFixed(3)).toBe(FIG.anchorRangeUs)
    expect((atTag.t / 1e6).toFixed(3)).toBe(FIG.tagRangeUs)
    expect(atAnchor.distM).toBe(atTag.distM)
    expect(atAnchor.distM.toFixed(6)).toBe(RANGE_M.ds)
    // …and deferring the Final leaves the tag's own line untouched, to the last digit.
    const def = ofType(run('deferred'), 'UWB_RANGE')[0]
    expect(def.distM).toBe(atTag.distM)
    expect((def.t / 1e6).toFixed(3)).toBe(FIG.tagRangeUs)
  })

  it('reproduces the whole §7 column the lesson tabulates', () => {
    // The five rows of 「谁手里有距离」: only DS-TWR embedded ever gives the anchor one.
    const anchorRanges = (method: 'ss' | 'ds', replyTime: 'embedded' | 'deferred' | 'fixed'): number => {
      const sc = uwbDeferredDsScenario('deferred')
      const built: Scenario = { ...sc, uwb: { ...sc.uwb!, method, replyTime } }
      expect(() => ScenarioSchema.parse(built), `${method}/${replyTime}`).not.toThrow()
      const rs = [...new Simulation(built).runUntil(RUN_NS).records]
      return ofType(rs, 'UWB_RANGE').filter((r) => r.node === 'anchor-1').length
    }
    expect(anchorRanges('ss', 'embedded')).toBe(0)
    expect(anchorRanges('ss', 'fixed')).toBe(0)
    expect(anchorRanges('ss', 'deferred')).toBe(0)
    expect(anchorRanges('ds', 'embedded')).toBe(1)
    expect(anchorRanges('ds', 'deferred')).toBe(0)
  })
})
