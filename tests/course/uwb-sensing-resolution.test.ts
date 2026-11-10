/**
 * `@uwb-sensing-resolution`, in the standard-first shape (2026-11-10).
 *
 * ① gives what IEEE Std 802.15.4-2024 fixes that bears on resolution — the chip duration, the
 * bandwidth NOTE, channel 9's band, the transmit pulse's correlation mask — and that it specifies
 * no receiver resolution. ② says the one-chip threshold and the yes/no verdict are the simulator's
 * own, checked against the engine's echo records. Every figure the labs and the summary print is
 * read back out of the lesson and compared with the runs.
 */
import { describe, expect, it } from 'vitest'
import { uwbSensingResolution, type UwbResolutionVariant } from '../../src/course/uwb/uwb-sensing-resolution'
import { PAIR_SPAN_M, uwbSensing } from '../../src/course/uwb/uwb-sensing'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { echoExcessM } from '../../src/engine/scatter'
import type { TLRecord } from '../../src/model/records'
import { C_M_PER_NS, UWB_CHIP_HZ, UWB_CHIP_NS } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const V: Record<Exclude<UwbResolutionVariant, 'pair'>, number> = { under: 0, over: 1 }
const recs = (v: UwbResolutionVariant): TLRecord[] =>
  runOf(uwbSensingResolution, v === 'pair' ? undefined : V[v], RUN_NS)
type Echo = Extract<TLRecord, { type: 'UWB_ECHO' }>
const echoes = (v: UwbResolutionVariant): Echo[] => ofType(recs(v), 'UWB_ECHO')
const off = (v: UwbResolutionVariant, id: string): Echo[] => echoes(v).filter((e) => e.scattererId === id)
const dbm = (x: number): string => `${x.toFixed(1).replace('-', '−')} dBm`
const RES_M = C_M_PER_NS * UWB_CHIP_NS
const rangeLine = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): string =>
  [r.t, r.node, r.peer, r.distM, r.trueDistM, r.method, r.fom, r.block, r.round].join('|')
/** The turning offset on a baseline of `spanM`: excess = c·Tc inverted for the perpendicular offset. */
const flipM = (spanM: number): number => Math.sqrt(((RES_M + spanM) / 2) ** 2 - (spanM / 2) ** 2)

const lab = (heading: string): Lab => {
  const l = uwbSensingResolution.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbSensingResolution.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
/** One echo as a row of the lab tables: offset, excess, verdict, level. */
const row = (e: Echo, offM: string): string[] => [
  `${offM} m`, `${e.excessM.toFixed(2)} m`, e.resolvable ? '可分辨' : '不可分辨', dbm(e.rssiDbm),
]

lessonShapeSuite(uwbSensingResolution, { runNs: RUN_NS })

describe('uwb-sensing-resolution · the lesson', () => {
  it('is in the standard-first shape, after the sensing lesson', () => {
    expect(isStandardFirst(uwbSensingResolution)).toBe(true)
    expect(uwbSensingResolution.module).toBe(27)
    expect(uwbSensingResolution.needs).toEqual(['uwb-sensing', 'uwb-frame'])
    expect(uwbSensingResolution.terms!.map((t) => t.term)).toEqual(['resolution', 'correlation peak', 'chip'])
    expect(uwbSensingResolution.limits).toEqual([])
    expect(uwbSensingResolution.observe).toEqual([])
    expect(uwbSensingResolution.tryThis).toEqual([])
  })

  it('① cites the clauses, says no receiver resolution is specified, and names no simulator choice', () => {
    const std = uwbSensingResolution.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''}`).join(' ')
    for (const s of ['§16.2.4', '表 16-27', '§16.4.4', '表 16-28', '§10.29.1.1', '499.2 MHz', '带宽不一定等于码片时长的倒数', '标准都没有规定']) {
      expect(std, s).toContain(s)
    }
    for (const sim of ['0.60', '回波', '可分辨', '门限']) expect(std, sim).not.toContain(sim)
    expect(UWB_CHIP_HZ).toBe(499.2e6)
  })

  it('② is not all faithful', () => {
    expect(uwbSensingResolution.implementation!.every((r) => r.kind !== 'faithful')).toBe(true)
    expect(implRow('感知过程').kind).toBe('absent')
  })
})

describe('uwb-sensing-resolution · ② says what the engine does, and the engine does it', () => {
  it('the threshold is one chip times c, and the verdict is that one comparison, never the level', () => {
    expect(implRow('分辨门限').sim).toContain(`一个码片 ${UWB_CHIP_NS.toFixed(6)} ns`)
    expect(implRow('分辨门限').sim).toContain(`得 ${RES_M.toFixed(2)} m`)
    for (const v of ['pair', 'under', 'over'] as UwbResolutionVariant[]) {
      for (const e of echoes(v)) {
        expect(e.resolutionM).toBeCloseTo(RES_M, 12)
        expect(e.resolvable).toBe(e.excessM > e.resolutionM)
      }
    }
  })

  it('both objects are the wardrobe\'s −10 dB', () => {
    for (const s of uwbSensingResolution.scenario().scatterers!) expect(s.extraLossDb).toBe(-10)
    expect(implRow('回波的电平').sim).toContain('−10 dB')
  })
})

describe('uwb-sensing-resolution · ③ every figure the labs and the summary print is the run', () => {
  it('lab 1: two records per transmission 3 ns apart; the near one merged and 5.7 dB louder', () => {
    const l = lab('电平更高的那个反而不可分辨')
    const near = off('pair', 'poster')
    const far = off('pair', 'wardrobe')
    expect(near).toHaveLength(4 * BLOCKS)
    expect(far).toHaveLength(4 * BLOCKS)
    const gaps = new Set(near.map((e, i) => far[i].t - e.t))
    expect(gaps.size).toBe(1)
    expect(l.expect).toContain(`相差 ${[...gaps][0]} ns`)
    const rows = tableOf(l, '同一次发送，两条回波记录').rows
    expect(rows[0]).toEqual(row(near[0], '0.2'))
    expect(rows[1]).toEqual(row(far[0], '1.0'))
    const louder = (near[0].rssiDbm - far[0].rssiDbm).toFixed(1)
    expect(l.expect).toContain(`高 ${louder} dB`)
    expect(uwbSensingResolution.why).toContain(`高 ${louder} dB`)
    expect(uwbSensingResolution.why).toContain(`额外路程只有 ${near[0].excessM.toFixed(2)} 米`)
    expect(uwbSensingResolution.why).toContain(`电平却是 ${dbm(near[0].rssiDbm)}`)
    expect(uwbSensingResolution.why).toContain(`c × 1 个码片 = ${RES_M.toFixed(2)} 米`)
    // the timing figure: each arrival one chip wide at the flight time the run reports
    const d = l.blocks!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
    const spec = d.spec as TimingSpec
    for (const lane of spec.lanes) expect(lane.spans[0].toUs - lane.spans[0].fromUs).toBeCloseTo(UWB_CHIP_NS, 12)
    expect(spec.lanes[1].spans[0].fromUs.toFixed(2)).toBe(near[0].propNs.toFixed(2))
    expect(spec.lanes[2].spans[0].fromUs.toFixed(2)).toBe(far[0].propNs.toFixed(2))
  })

  it('lab 2: the four positions are the four runs, and the flip is the condition inverted', () => {
    const l = lab('移动十厘米，判决翻转')
    expect(uwbSensingResolution.variants!.map((v) => v.label)).toEqual(['离连线 0.8 米', '离连线 0.9 米'])
    const rows = tableOf(l, '同一个物体，四个位置').rows
    expect(rows[0]).toEqual(row(off('pair', 'poster')[0], '0.2'))
    expect(rows[1]).toEqual(row(echoes('under')[0], '0.8'))
    expect(rows[2]).toEqual(row(echoes('over')[0], '0.9'))
    expect(rows[3]).toEqual(row(off('pair', 'wardrobe')[0], '1.0'))
    for (const e of echoes('under')) expect(e.resolvable).toBe(false)
    for (const e of echoes('over')) expect(e.resolvable).toBe(true)
    // the level column falls all the way down
    const levels = [off('pair', 'poster')[0], echoes('under')[0], echoes('over')[0], off('pair', 'wardrobe')[0]].map((e) => e.rssiDbm)
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1])
    // the formula note's flip offset, and the summary's
    const f = l.blocks!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    expect(f.note).toContain(`离连线 ${flipM(PAIR_SPAN_M).toFixed(2)} 米`)
    expect(uwbSensingResolution.why).toContain(`偏离连线 ${flipM(PAIR_SPAN_M).toFixed(2)} 米以上`)
    expect(0.8).toBeLessThan(flipM(PAIR_SPAN_M))
    expect(0.9).toBeGreaterThan(flipM(PAIR_SPAN_M))
    // 「十米长的连线上，翻转位置在离连线约 1.8 米处」
    expect(l.expect).toContain(`约 ${flipM(10).toFixed(1)} 米`)
    const a = { x: 0, y: 0, z: 1 }
    const b = { x: 10, y: 0, z: 1 }
    expect(echoExcessM(a, { x: 5, y: flipM(10), z: 1 }, b)).toBeCloseTo(RES_M, 9)
  })

  it('lab 3: the 14 ranges of all three scenes are the empty room\'s', () => {
    const l = lab('测距不受判决影响')
    const bare = ofType(runOf(uwbSensing, 1, RUN_NS), 'UWB_RANGE').map(rangeLine)
    expect(uwbSensing.variants![1].label).toBe('房间里空无一物')
    expect(l.expect).toContain(`${bare.length} 个距离`)
    for (const v of ['pair', 'under', 'over'] as UwbResolutionVariant[]) {
      expect(ofType(recs(v), 'UWB_RANGE').map(rangeLine), v).toEqual(bare)
    }
  })
})
