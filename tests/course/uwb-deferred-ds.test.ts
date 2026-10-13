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
  C_M_PER_NS, RMI_FINAL_DEFERRED_ENTRY_BYTES, RMI_FINAL_ENTRY_BYTES, RMI_FINAL_FIXED_BYTES,
  RRTI_IE_BYTES, UWB_FCS_BYTES, UWB_MAX_PSDU_BYTES, UWB_MHR_BYTES, UWB_SLOT_GUARD_NS, rstuNs,
  uwbFinalBytes, uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS

lessonShapeSuite(uwbDeferredDs, { runNs: RUN_NS })

const runs = new Map<string, TLRecord[]>()
function run(replyTime: 'embedded' | 'deferred'): TLRecord[] {
  const hit = runs.get(replyTime)
  if (hit) return hit
  const sc = uwbDeferredDsScenario(replyTime)
  expect(() => ScenarioSchema.parse(sc), replyTime).not.toThrow()
  const rs = [...new Simulation(sc).runUntil(RUN_NS).records]
  runs.set(replyTime, rs)
  return rs
}

const txOf = (rs: TLRecord[], kind: string) =>
  ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)

describe('uwb-deferred-ds · where it sits in the course', () => {
  it('is the second reply-time lesson of the two-clocks module, published standard only', () => {
    expect(uwbDeferredDs.module).toBe(15)
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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Almost every figure of this lesson is interpolated from its own module (`BYTES`, `CAP`,
 * `DEMAND`, `FIG`) and the file above measures those against runs. What is typed is the rest:
 * the PSDU ceiling in two places, the six field widths `sources` lists, the two instants in
 * `FIG`, the diagram's own labels and a few figures in `limits`.
 *
 * **The reads worth naming:**
 *
 *  - **the two instants are read as the two runs they belong to.** 「嵌入形态的锚点在 4.194 ms
 *    就算出了…而标签要等到 6.191 ms」 is the anchor's range record in the embedded round and the
 *    tag's in both — and 「把 Final 延后，那一行就整行消失」 is read as the absence of it.
 *  - **the 「谁手里有距离」 table is read as five runs' worth of presence and absence**, for the
 *    two this lesson can run: a ✓ means a range record on that lane, a ✗ means none.
 *  - **the six field widths are read off the constants `sources` names**, and their sum is the
 *    frame the run really sends.
 */
describe('uwb-deferred-ds · every figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(uwbDeferredDs.terms)
  const NUMS = blockText(uwbDeferredDs.numbers)
  const LIM = blockText(uwbDeferredDs.limits)
  const SRC = blockText(uwbDeferredDs.sources)
  const OBS = blockText(uwbDeferredDs.observe)

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
    uwbDeferredDs.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  const rangesOf = (rt: 'embedded' | 'deferred', node: string) =>
    ofType(run(rt), 'UWB_RANGE').filter((r) => r.node === node)
  const TAG = uwbDeferredDsScenario('deferred').nodes.find((n) => n.uwb!.role === 'tag')!.id
  const ANC = uwbDeferredDsScenario('deferred').nodes.find((n) => n.uwb!.role === 'anchor')!.id

  it('reads the two instants, and the row that disappears when the Final is deferred', () => {
    // 「嵌入形态的锚点在 4.194 ms 就算出了 4.99… m…而标签要等到 6.191 ms 才算出同一个数」
    const [anchorMs, tagMs] = raw(NUMS,
      /嵌入形态的锚点在 ([\d.]+) ms 就算出了 [\d.]+ m（真值 [\d.]+ m），而标签要等到 ([\d.]+) ms/,
      '`numbers` on the two instants')
    const anchorRange = rangesOf('embedded', ANC)
    const tagRange = rangesOf('embedded', TAG)
    expect(anchorRange, 'the embedded round really gives the anchor one').toHaveLength(1)
    same(anchorMs!, anchorRange[0]!.t / MS, 'when the anchor really has it')
    same(tagMs!, tagRange[0]!.t / MS, 'and when the tag does')
    expect(anchorRange[0]!.distM.toFixed(6), 'and they are the same number to the last digit')
      .toBe(tagRange[0]!.distM.toFixed(6))
    // 「把 Final 延后，4.194 ms 那一行就整行消失，标签那一行一个字都不变」
    const [goneMs] = raw(NUMS, /把 Final 延后，([\d.]+) ms 那一行就整行消失/,
      '`numbers` on the row that goes')
    expect(goneMs, 'the row that disappears is the anchor’s').toBe(anchorMs)
    expect(rangesOf('deferred', ANC), 'and in the deferred round there is none').toHaveLength(0)
    expect(fmtRecord(rangesOf('deferred', TAG)[0]!), 'while the tag’s line is unchanged')
      .toBe(fmtRecord(tagRange[0]!))
    // `observe` prints both instants again
    const [obsTag, obsAnchor] = raw(OBS,
      /在 ([\d.]+) ms、手机那条泳道上。载入「嵌入」，锚点那条泳道会在 ([\d.]+) ms 多出一条/,
      '`observe` on the same two')
    expect([obsTag, obsAnchor], 'the same two instants, a second time').toEqual([tagMs, anchorMs])
    // 「Final 在 4 ms 处发出」
    const [finalMs] = figs(OBS, /Final 在 (\d+) ms 处发出/, '`observe` on the Final')
    same(String(finalMs), txOf(run('deferred'), 'uwbFinal')[0]!.t / MS, 'when the Final really leaves')
  })

  it('reads the 「谁手里有距离」 table for the two rounds this lesson runs', () => {
    const tb = tables().find((x) => x.head[0] === '形态')!
    expect(tb.rows.length, 'five shapes').toBe(5)
    for (const row of tb.rows) {
      const [shape, tagCell, ancCell] = row as [string, string, string]
      if (!shape.startsWith('DS-TWR')) continue
      const rt = shape.includes('嵌入') ? 'embedded' : 'deferred'
      expect(tagCell.startsWith('✓'), `${shape}: the tag’s cell`).toBe(rangesOf(rt, TAG).length > 0)
      expect(ancCell.startsWith('✓'), `${shape}: the anchor’s cell`).toBe(rangesOf(rt, ANC).length > 0)
      // the tag's cell says WHEN, and in both rounds that is when the report lands
      expect(tagCell, `${shape}: and what the tag waits for`).toContain('报告')
      const report = txOf(run(rt), 'uwbReport').at(-1)!
      expect(rangesOf(rt, TAG)[0]!.t, `${shape}: the tag’s range follows the report`)
        .toBeGreaterThanOrEqual(report.t)
    }
  })

  it('reads the PSDU ceiling, the two caps and the two growths', () => {
    // 「一帧里真正装消息的那一段，最长 127 字节」 (a term) and 「一帧最长 127 字节的 PSDU」
    for (const [text, re, what] of [
      [TERMS, /最长 (\d+) 字节/, 'the term on the PSDU'],
      [SRC, /一帧最长 (\d+) 字节的 PSDU/, '`sources` on the same'],
    ] as [string, RegExp, string][]) {
      expect(figs(text, re, what)[0], what).toBe(UWB_MAX_PSDU_BYTES)
    }
    const tb = tables().find((x) => x.head[0] === '这一帧')!
    const cell = (needle: string): string[] => tb.rows.find((r) => r[0]!.includes(needle))!.slice(1)
    // 「Final 长度」: `base + nA` for each shape, read against the engine's own Final
    const [emb, def] = cell('Final 长度')
    for (const [printed, rt] of [[emb!, 'embedded'], [def!, 'deferred']] as const) {
      const [base, growth] = figs(printed, /(\d+) \+ (\d+)A/, `the ${rt} Final’s growth`)
      expect(uwbFinalBytes(0, rt), `${rt}: the Final with no anchor in it`).toBe(base)
      expect(uwbFinalBytes(1, rt) - uwbFinalBytes(0, rt), `${rt}: what one anchor adds`).toBe(growth)
    }
    // 「A = 1（本课这一轮）」 — the anchors this lesson's own scene really has
    const [oneRow] = raw(tb.rows.find((r) => r[0]!.startsWith('A = '))![0]!, /A = (\d+)（本课这一轮）/,
      'the row’s own anchor count')
    expect(uwbDeferredDsScenario('deferred').nodes.filter((n) => n.uwb!.role === 'anchor').length,
      'the anchors this round really asks').toBe(val(oneRow!))
    // 「锚点上限」 for the two shapes
    const [capEmb, capDef] = cell('锚点上限')
    expect(val(capEmb!), 'the embedded cap').toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    expect(val(capDef!), 'and the deferred one').toBe(uwbMaxAnchors('twr', 'ds', 'deferred'))
    // 「轮里最长的一帧」: a frame name, and for the deferred shape the Poll's own length
    const [longEmb, longDef] = cell('轮里最长的一帧')
    expect(longEmb, 'the embedded round’s longest frame').toBe('Final')
    const [pollBytes] = figs(longDef!, /Poll，(\d+) B/, 'the deferred round’s longest frame')
    expect(pollBytes, 'which is the Poll at the figure’s own anchor count')
      .toBe(uwbPollBytes(FIG_ANCHORS))
    expect(uwbLongestFrameBytes(FIG_ANCHORS, 'twr', 'time', 'ds', 'deferred'),
      'and the engine agrees it is the longest').toBe(pollBytes)
  })

  it('reads the six field widths `sources` lists, and the two model values beside them', () => {
    // 「2 ms 的测距时隙…时隙末尾 200 ns 的飞行守卫」
    const [slotMs] = figs(SRC, /(\d+) ms 的测距时隙/, '`sources` on the slot')
    expect(rstuNs(uwbDeferredDsScenario('deferred').uwb!.slotRstu), 'the slot this scene runs')
      .toBe(slotMs! * MS)
    const [guardNs] = figs(SRC, /时隙末尾 (\d+) ns 的飞行守卫/, '`sources` on the guard')
    expect(guardNs, 'the guard the engine keeps').toBe(UWB_SLOT_GUARD_NS)
    /*
     * 「帧头 9、RMI 表头 3、嵌入式每响应方 6、延后每响应方 2、每段回复时延 6、帧校验 2」 — six
     * widths, each read off the constant the same sentence names, and their sum is the frame the
     * run really sends at one anchor.
     */
    const six = figs(SRC,
      /帧头 (\d+)、RMI 表头 (\d+)、嵌入式每响应方 (\d+)、延后每响应方 (\d+)、每段回复时延 (\d+)、帧校验 (\d+)/,
      '`sources` on the field widths')
    expect(six, 'the six widths this engine really uses').toEqual([
      UWB_MHR_BYTES, RMI_FINAL_FIXED_BYTES, RMI_FINAL_ENTRY_BYTES,
      RMI_FINAL_DEFERRED_ENTRY_BYTES, RRTI_IE_BYTES, UWB_FCS_BYTES,
    ])
    const [mhr, hdr, embEntry, defEntry, rrti, fcs] = six
    expect(mhr! + hdr! + embEntry! + rrti! + fcs!, 'their sum is the embedded Final at one anchor')
      .toBe(txOf(run('embedded'), 'uwbFinal')[0]!.frame.bytes)
    expect(mhr! + hdr! + defEntry! + fcs!, 'and the deferred one')
      .toBe(txOf(run('deferred'), 'uwbFinal')[0]!.frame.bytes)
    // 「那段等待错 1 ns 就是约 15 cm 的距离误差」
    const [errNs, errCm] = figs(LIM, /那段等待错 (\d+) ns 就是约 (\d+) cm 的距离误差/,
      '`limits` on what a nanosecond costs')
    same(String(errCm), (errNs! / 2) * C_M_PER_NS * 100, 'half the error, times the speed of light')
  })

  it('reads the figure’s own labels, and the anchors it is drawn at', () => {
    // 「9 个锚点的 Final，一格一格看」
    const diagram = uwbDeferredDs.numbers!.find((b) => b.kind === 'diagram') as unknown as
      { heading: string; caption: string }
    const [anchors] = figs(diagram.heading, /(\d+) 个锚点的 Final/, 'the figure’s own heading')
    expect(anchors, 'the anchor count the figure is drawn at').toBe(FIG_ANCHORS)
    /*
     * Every label of the drawing carries its own width, and the widths have to add up to the
     * frame the engine builds at that anchor count — so a planted label breaks the sum.
     */
    const spec = uwbDeferredDsFields()
    const labels = spec.fields.map((f) => f.label)
    const sizes = spec.fields.map((f) => f.size)
    for (const [i, label] of labels.entries()) {
      // a label is either 「name N」 (its own width) or 「name ×N」 (one box per anchor)
      const times = /×(\d+)$/.exec(label!)
      if (times) {
        expect(val(times[1]!), `the label 「${label}」 counts the anchors`).toBe(anchors)
        expect(sizes[i]! % val(times[1]!), `and its width is that many equal entries`).toBe(0)
        continue
      }
      const m = /(\d+)$/.exec(label!)
      if (!m) continue
      expect(val(m[1]!), `the label 「${label}」 names its own width`).toBe(sizes[i])
    }
    expect(sizes.reduce((a, b) => a + b, 0), 'and the fields add up to the embedded Final')
      .toBe(uwbFinalBytes(anchors!, 'embedded'))
    // 「DROPPED_BYTES 个字节里，一半是…往返时间，一半是…回复时延」
    const [dropped] = figs(diagram.caption, /(\d+) 个字节里，一半是/, 'the caption on what goes')
    expect(dropped, 'the octets the deferred Final does without')
      .toBe(uwbFinalBytes(anchors!, 'embedded') - uwbFinalBytes(anchors!, 'deferred'))
    expect(dropped, 'and that is what the module computes').toBe(DROPPED_BYTES)
  })
})
