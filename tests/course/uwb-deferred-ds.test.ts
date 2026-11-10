/**
 * Every empirical claim in 「延后形态：发起方的两个时间晚一帧送到锚点」, measured against the
 * lesson's own two scenarios.
 *
 * 2026-11-10 (audit #3): rewritten with the engine — the deferred DS round now follows standard
 * §10.29.6.6 / §10.32.5 Figure 10-237 (bare Final, then the initiator's deferred RMI report, then the
 * anchors compute). The Final's lengths and the deferred report are read off `TX_START`, the caps are
 * searched against the PSDU limit, and who holds a range is read from every `UWB_RANGE`.
 */
import { describe, expect, it } from 'vitest'
import {
  BYTES, DEMAND, DROPPED_BYTES, FIG, FIG_ANCHORS, GROWTH, RRTI_FIXED_BYTES, dsSlots, uwbDeferredDs,
  uwbDeferredDsFields, uwbDeferredDsScenario,
} from '../../src/course/uwb/uwb-deferred-ds'
import { BENCH_M, CAP, RANGE_M } from '../../src/course/uwb/uwb-reply-time'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { anchor } from '../../src/course/lessonKit'
import {
  C_M_PER_NS, RMI_FIXED_BYTES, RMI_TIME_BYTES, UWB_FCS_BYTES, UWB_MAX_PSDU_BYTES, UWB_MHR_BYTES,
  UWB_SHORT_ADDR_BYTES, UWB_SLOT_GUARD_NS, rstuNs, uwbDsDeferredReportBytes, uwbFinalBytes,
  uwbLongestFrameBytes, uwbMaxAnchors, uwbPollBytes, uwbSlotFitNs,
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
    expect(MODULES[uwbDeferredDs.module].title).toBe('两个时钟')
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
    expect(text).toContain('设备就在时隙边界那一纳秒发射')
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

describe('uwb-deferred-ds · the Final and the deferred report, on the air', () => {
  // 2026-11-10 (audit #3, standard §10.29.6.6, §10.32.5 Figure 10-237): the deferred Final carries
  // no IE at all, and the initiator's two times follow in a deferred Data frame (one RMI IE).
  it('is an 11-octet bare Final deferred and 30 octets embedded at this one anchor', () => {
    expect(txOf(run('deferred'), 'uwbFinal').map((r) => r.frame.bytes)).toEqual([BYTES.finalDeferredOne])
    expect(txOf(run('embedded'), 'uwbFinal').map((r) => r.frame.bytes)).toEqual([BYTES.finalEmbeddedOne])
    expect(BYTES.finalDeferredOne).toBe(UWB_MHR_BYTES + UWB_FCS_BYTES)
    expect(BYTES.finalDeferredOne).toBe(11)
    expect(BYTES.finalEmbeddedOne).toBe(30)
    const deferred = txOf(run('deferred'), 'uwbFinal')[0]
    expect(deferred.frame.uwb!.ies).toEqual([])
    expect(deferred.frame.uwb!.finalTimes).toBeUndefined()
    const embedded = txOf(run('embedded'), 'uwbFinal')[0]
    expect(embedded.frame.uwb!.ies).toEqual(['RMI', 'RRTI'])
  })

  it('sends the two times in the slot after the Final, one RMI element per anchor', () => {
    const fromTag = txOf(run('deferred'), 'uwbReport').filter((r) => r.node === 'tag-1')
    expect(fromTag.map((r) => r.frame.bytes)).toEqual([BYTES.deferredReportOne])
    expect(BYTES.deferredReportOne).toBe(25)
    const f = fromTag[0]!
    expect(f.frame.uwb!.ies).toEqual(['RMI'])
    expect(f.frame.uwb!.finalTimes!.map((e) => e.id)).toEqual(['anchor-1'])
    expect(f.frame.uwb!.finalTimes![0].tround1).toBeGreaterThan(0)
    expect(f.frame.uwb!.finalTimes![0].treply2).toBeGreaterThan(0)
    const final = txOf(run('deferred'), 'uwbFinal')[0]!
    expect(f.t - final.t).toBe(FIG.slotUs * 1000)
    // and the embedded round sends no such frame
    expect(txOf(run('embedded'), 'uwbReport').filter((r) => r.node === 'tag-1')).toHaveLength(0)
  })

  it('grows by 12 octets an anchor embedded and 10 deferred, so 126 against 105 at nine', () => {
    expect(GROWTH.finalEmbedded).toBe(12)
    expect(GROWTH.deferredReport).toBe(10)
    expect(uwbFinalBytes(2, 'deferred')).toBe(uwbFinalBytes(1, 'deferred'))
    expect(FIG_ANCHORS).toBe(CAP.dsEmbedded)
    expect(BYTES.finalEmbeddedMany).toBe(126)
    expect(BYTES.deferredReportMany).toBe(105)
    expect(BYTES.finalDeferredMany).toBe(11)
    expect(DROPPED_BYTES).toBe(115)
  })
})

describe('uwb-deferred-ds · the fields figure', () => {
  const spec = uwbDeferredDsFields()

  it('adds up to the embedded Final, box for box', () => {
    const total = spec.fields.reduce((n, f) => n + f.size, 0)
    expect(total).toBe(BYTES.finalEmbeddedMany)
    expect(spec.unit).toBe('B')
  })

  it('the deferred Final keeps the first and last box; the six between are the two IEs', () => {
    const kept = spec.fields[0].size + spec.fields[spec.fields.length - 1].size
    const dropped = spec.fields.slice(1, -1).reduce((n, f) => n + f.size, 0)
    expect(kept).toBe(BYTES.finalDeferredMany)
    expect(dropped).toBe(DROPPED_BYTES)
    expect(spec.total).toContain(`延后 ${BYTES.finalDeferredMany} 字节`)
    expect(spec.total).toContain(`差 ${DROPPED_BYTES} 在中间六格`)
    // RMI: 4 + 6·9; RRTI: 3 + 6·9 (standard §10.29.8.4 / §10.29.8.1)
    expect(spec.fields.slice(1, 4).reduce((n, f) => n + f.size, 0)).toBe(4 + 6 * FIG_ANCHORS)
    expect(spec.fields.slice(4, 7).reduce((n, f) => n + f.size, 0)).toBe(3 + 6 * FIG_ANCHORS)
  })
})

describe('uwb-deferred-ds · the cap and the slot move with the shape', () => {
  it('earns 9 embedded and 11 deferred, each searched against the 127-octet PSDU', () => {
    expect(CAP.dsEmbedded).toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    expect(CAP.dsDeferred).toBe(uwbMaxAnchors('twr', 'ds', 'deferred'))
    expect(CAP.dsEmbedded).toBe(9)
    expect(CAP.dsDeferred).toBe(11)
    expect(BYTES.psdu).toBe(UWB_MAX_PSDU_BYTES)
    for (const [rt, cap] of [['embedded', CAP.dsEmbedded], ['deferred', CAP.dsDeferred]] as const) {
      expect(uwbLongestFrameBytes(cap, 'twr', 'time', 'ds', rt), rt).toBeLessThanOrEqual(BYTES.psdu)
      expect(uwbLongestFrameBytes(cap + 1, 'twr', 'time', 'ds', rt), rt).toBeGreaterThan(BYTES.psdu)
    }
    // 「延后数据帧……是轮中最长的一帧」
    expect(uwbLongestFrameBytes(CAP.dsDeferred, 'twr', 'time', 'ds', 'deferred'))
      .toBe(uwbDsDeferredReportBytes(CAP.dsDeferred))
    expect(BYTES.pollMany).toBe(uwbPollBytes(FIG_ANCHORS))
  })

  it('needs one slot more deferred: 2A + 3 against 2A + 2', () => {
    expect(DEMAND.dsEmbedded).toBe(uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded'))
    expect(DEMAND.dsDeferred).toBe(uwbSlotFitNs(FIG_ANCHORS, 'twr', 'time', undefined, 'ds', 'deferred'))
    expect(dsSlots(FIG_ANCHORS, 'embedded')).toBe(2 * FIG_ANCHORS + 2)
    expect(dsSlots(FIG_ANCHORS, 'deferred')).toBe(2 * FIG_ANCHORS + 3)
    for (const rt of ['embedded', 'deferred'] as const) {
      const rounds = ofType(run(rt), 'UWB_ROUND')
      expect(rounds.map((r) => r.slots), rt).toEqual([dsSlots(1, rt)])
      expect(fmtRecord(rounds[0])).toContain(`${dsSlots(1, rt)} slots`)
    }
  })

  it('refuses ten anchors embedded and accepts them deferred', () => {
    const many = (replyTime: 'embedded' | 'deferred'): Scenario => {
      const base = uwbDeferredDsScenario(replyTime)
      const extra: NodeCfg[] = Array.from({ length: CAP.dsEmbedded }, (_v, i) =>
        anchor(`anchor-${i + 2}`, `Anchor ${i + 2}`, 1 + 0.4 * i, 1, 1.2, 20))
      return { ...base, nodes: [...base.nodes, ...extra] }
    }
    expect(many('embedded').nodes.filter((n) => n.uwb!.role === 'anchor')).toHaveLength(CAP.dsEmbedded + 1)
    const refused = ScenarioSchema.safeParse(many('embedded'))
    expect(refused.success).toBe(false)
    expect(refused.success ? '' : refused.error.issues.map((i) => i.message).join(''))
      .toContain(`最多容纳 ${CAP.dsEmbedded} 个 anchor`)
    expect(() => ScenarioSchema.parse(many('deferred'))).not.toThrow()
    expect(uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')).toBe(138)
    expect(uwbFinalBytes(CAP.dsEmbedded + 1, 'embedded')).toBeGreaterThan(BYTES.psdu)
  })
})

describe('uwb-deferred-ds · who ends up holding the range', () => {
  it('gives the anchor a range in both DS rounds (standard §10.29.6.6)', () => {
    expect(ofType(run('deferred'), 'UWB_RANGE').map((r) => r.node).sort()).toEqual(['anchor-1', 'tag-1'])
    expect(ofType(run('embedded'), 'UWB_RANGE').map((r) => r.node).sort()).toEqual(['anchor-1', 'tag-1'])
  })

  it('prints the four instants, and the same distance on every lane', () => {
    const at = (rt: 'embedded' | 'deferred', node: string) =>
      ofType(run(rt), 'UWB_RANGE').find((r) => r.node === node)!
    expect((at('embedded', 'anchor-1').t / 1e6).toFixed(3)).toBe(FIG.anchorRangeUs)
    expect((at('embedded', 'tag-1').t / 1e6).toFixed(3)).toBe(FIG.tagRangeUs)
    expect((at('deferred', 'anchor-1').t / 1e6).toFixed(3)).toBe(FIG.anchorDeferredUs)
    expect((at('deferred', 'tag-1').t / 1e6).toFixed(3)).toBe(FIG.tagDeferredUs)
    for (const rt of ['embedded', 'deferred'] as const) {
      for (const n of ['anchor-1', 'tag-1']) expect(at(rt, n).distM.toFixed(6), `${rt} ${n}`).toBe(RANGE_M.ds)
    }
    // the deferred anchor range lands right after the initiator's deferred report
    const rep = txOf(run('deferred'), 'uwbReport').find((r) => r.node === 'tag-1')!
    expect(at('deferred', 'anchor-1').t).toBeGreaterThan(rep.t)
    expect(at('deferred', 'anchor-1').t - rep.t).toBeLessThan(FIG.slotUs * 1000)
  })

  it('reproduces the whole column the lesson tabulates', () => {
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
    expect(anchorRanges('ds', 'deferred')).toBe(1)
  })
})

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

  it('reads the four instants', () => {
    const [anchorMs, tagMs] = raw(NUMS,
      /嵌入形态的锚点在 ([\d.]+) ms 就算出了 [\d.]+ m（真值 [\d.]+ m），而标签要等到 ([\d.]+) ms/,
      '`numbers` on the embedded instants')
    same(anchorMs!, rangesOf('embedded', ANC)[0]!.t / MS, 'when the embedded anchor has it')
    same(tagMs!, rangesOf('embedded', TAG)[0]!.t / MS, 'and the embedded tag')
    const [defAnchorMs, defTagMs] = raw(NUMS, /锚点的那一行推迟到 ([\d.]+) ms，标签的那一行推迟到 ([\d.]+) ms/,
      '`numbers` on the deferred instants')
    same(defAnchorMs!, rangesOf('deferred', ANC)[0]!.t / MS, 'when the deferred anchor has it')
    same(defTagMs!, rangesOf('deferred', TAG)[0]!.t / MS, 'and the deferred tag')
    const [o1, o2, o3, o4] = raw(OBS,
      /锚点那条泳道的测距行在 ([\d.]+) ms，手机那条在 ([\d.]+) ms。载入「嵌入」，两行分别提前到 ([\d.]+) ms 与 ([\d.]+) ms/,
      '`observe` on the same four')
    expect([o1, o2, o3, o4]).toEqual([defAnchorMs, defTagMs, anchorMs, tagMs])
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
      expect(tagCell).toContain('报告')
      const report = txOf(run(rt), 'uwbReport').filter((r) => r.node === ANC).at(-1)!
      expect(rangesOf(rt, TAG)[0]!.t).toBeGreaterThanOrEqual(report.t)
    }
  })

  it('reads the PSDU ceiling, the two caps and the growths', () => {
    for (const [text, re, what] of [
      [TERMS, /最长 (\d+) 字节/, 'the term on the PSDU'],
      [SRC, /一帧最长 (\d+) 字节的 PSDU/, '`sources` on the same'],
    ] as [string, RegExp, string][]) {
      expect(figs(text, re, what)[0], what).toBe(UWB_MAX_PSDU_BYTES)
    }
    const tb = tables().find((x) => x.head[0] === '这一帧')!
    const cell = (needle: string): string[] => tb.rows.find((r) => r[0]!.includes(needle))!.slice(1)
    const [emb, def] = cell('Final 长度')
    const [base, growth] = figs(emb!, /(\d+) \+ (\d+)A/, 'the embedded Final’s growth')
    expect(uwbFinalBytes(0, 'embedded')).toBe(base)
    expect(uwbFinalBytes(1, 'embedded') - uwbFinalBytes(0, 'embedded')).toBe(growth)
    const [defFinal] = figs(def!, /^(\d+)/, 'the deferred Final')
    expect(uwbFinalBytes(5, 'deferred')).toBe(defFinal)
    const [, rep] = cell('延后数据帧')
    const [rb, rg] = figs(rep!, /(\d+) \+ (\d+)A/, 'the deferred report’s growth')
    expect(uwbDsDeferredReportBytes(0)).toBe(rb)
    expect(uwbDsDeferredReportBytes(1) - uwbDsDeferredReportBytes(0)).toBe(rg)
    const [capEmb, capDef] = cell('锚点上限')
    expect(val(capEmb!)).toBe(uwbMaxAnchors('twr', 'ds', 'embedded'))
    expect(val(capDef!)).toBe(uwbMaxAnchors('twr', 'ds', 'deferred'))
  })

  it('reads the field widths `sources` lists, and the two model values beside them', () => {
    const [slotMs] = figs(SRC, /(\d+) ms 的测距时隙/, '`sources` on the slot')
    expect(rstuNs(uwbDeferredDsScenario('deferred').uwb!.slotRstu)).toBe(slotMs! * MS)
    const [guardNs] = figs(SRC, /时隙末尾 (\d+) ns 的飞行守卫/, '`sources` on the guard')
    expect(guardNs).toBe(UWB_SLOT_GUARD_NS)
    const six = figs(SRC,
      /帧头 (\d+)、RMI 表头 (\d+)、每个时间 (\d+)、短地址 (\d+)、RRTI 表头 (\d+)、帧校验 (\d+)/,
      '`sources` on the field widths')
    expect(six).toEqual([UWB_MHR_BYTES, RMI_FIXED_BYTES, RMI_TIME_BYTES, UWB_SHORT_ADDR_BYTES, RRTI_FIXED_BYTES, UWB_FCS_BYTES])
    const [mhr, rmi, t, a, rrti, fcs] = six
    expect(mhr! + rmi! + (t! + a!) + rrti! + (t! + a!) + fcs!, 'embedded Final at one anchor')
      .toBe(txOf(run('embedded'), 'uwbFinal')[0]!.frame.bytes)
    expect(mhr! + fcs!, 'the deferred Final').toBe(txOf(run('deferred'), 'uwbFinal')[0]!.frame.bytes)
    expect(mhr! + rmi! + 2 * t! + a! + fcs!, 'the deferred report')
      .toBe(txOf(run('deferred'), 'uwbReport').find((r) => r.node === TAG)!.frame.bytes)
    const [errNs, errCm] = figs(LIM, /等待时间偏差 (\d+) ns 就是约 (\d+) cm 的距离误差/,
      '`limits` on what a nanosecond costs')
    same(String(errCm), (errNs! / 2) * C_M_PER_NS * 100, 'half the error, times the speed of light')
  })

  it('reads the figure’s own labels, and the anchors it is drawn at', () => {
    const diagram = uwbDeferredDs.numbers!.find((b) => b.kind === 'diagram') as unknown as
      { heading: string; caption: string }
    const [anchors] = figs(diagram.heading, /(\d+) 个锚点的 Final/, 'the figure’s own heading')
    expect(anchors).toBe(FIG_ANCHORS)
    const spec = uwbDeferredDsFields()
    for (const [i, label] of spec.fields.map((f) => f.label).entries()) {
      const times = /×(\d+)$/.exec(label!)
      if (times) {
        expect(val(times[1]!)).toBe(anchors)
        expect(spec.fields[i]!.size % val(times[1]!)).toBe(0)
        continue
      }
      const m = /(\d+)$/.exec(label!)
      if (m) expect(val(m[1]!), label).toBe(spec.fields[i]!.size)
    }
    const [dropped] = figs(diagram.caption, /去掉的 (\d+) 个字节/, 'the caption on what goes')
    expect(dropped).toBe(uwbFinalBytes(anchors!, 'embedded') - uwbFinalBytes(anchors!, 'deferred'))
    const [rep] = figs(diagram.caption, /共 (\d+) 字节/, 'the caption on the deferred report')
    expect(rep).toBe(uwbDsDeferredReportBytes(anchors!))
  })
})
