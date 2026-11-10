/**
 * `@uwb-geometry`, in the standard-first shape (2026-11-10).
 *
 * ① is checked against the engine's own FoM decoding (the byte tables of §10.29.1.7); ② row by
 * row against the engine; ③ figure by figure: every number the labs print is read back out of
 * the lesson text and compared with a run of `uwb-position`'s scene or with the solver the
 * engine calls. The scenario builder and its three scenes are pinned in
 * tests/course/uwb-position.test.ts, where the builder lives.
 */
import { describe, it, expect } from 'vitest'
import { uwbGeometry } from '../../src/course/uwb/uwb-geometry'
import { uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { C_M_PER_NS, FOM_LOS, FOM_NLOS, UWB_NLOS_NS, fomText } from '../../src/uwb/phy'
import { MIN_DET, rangeSigmaM, solvePosition, type AnchorPos, type Fix } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'
import { uwbFixRow } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = { x: 4, y: 3.5, z: 1.0 }
const ANCHOR_Z = 2.2
const CORNERS: [string, number, number][] = [
  ['anchor-1', 0.5, 0.5], ['anchor-2', 9.5, 0.5], ['anchor-3', 0.5, 7.5], ['anchor-4', 9.5, 7.5],
]
const SIGMA_R = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)

const scenarioOf = (variant?: number) =>
  variant === undefined ? uwbGeometry.scenario() : uwbGeometry.variants![variant].scenario()
const recs = (variant?: number): TLRecord[] => runOf(uwbGeometry, variant, RUN_NS)

lessonShapeSuite(uwbGeometry, { runNs: RUN_NS, sameSceneAs: 'uwb-position' })

const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
const minus = (s: string): string => s.replace(/-/g, '−')

function exactFix(drop?: string, sigma = SIGMA_R, biasA1 = 0): Fix {
  const anchors: AnchorPos[] = CORNERS.filter(([id]) => id !== drop).map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
  const ranges = anchors.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) + (a.id === 'anchor-1' ? biasA1 : 0) }))
  return solvePosition(anchors, ranges, TAG.z, sigma)!
}
function jRow(ax: number, ay: number): [number, number] {
  const dx = TAG.x - ax, dy = TAG.y - ay, d3 = Math.hypot(dx, dy, TAG.z - ANCHOR_Z)
  return [dx / d3, dy / d3]
}
function inspectorAfter(variant: number | undefined, blocks: number): UwbNodeView {
  const vs = initViewState(scenarioOf(variant))
  for (const r of recs(variant)) {
    if (r.t >= blocks * 200 * MS + 10 * MS) break
    applyRecord(vs, r)
  }
  return vs.nodes['uwb-1'].uwb!
}
/** The §10.29.1.7 tables, as ① prints them. */
const CL = [null, 20, 55, 75, 85, 92, 97, 99]
const CI_NS = [0.1, 0.3, 1, 3]
const SCALE = [0.5, 1.0, 2.0, 4.0]
const decode = (b: number) => ({ cl: b & 7, ci: (b >> 3) & 3, sc: (b >> 5) & 3, ext: b >> 7 })

const lab = (heading: string): Lab => {
  const l = uwbGeometry.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbGeometry.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

describe('uwb-geometry · the lesson', () => {
  it('follows uwb-position and loads its scene, in the standard-first shape', () => {
    expect(isStandardFirst(uwbGeometry)).toBe(true)
    expect(MODULES[uwbGeometry.module].title).toBe('定位')
    expect(uwbGeometry.needs).toEqual(['uwb-position'])
    expect(uwbGeometry.terms!.map((t) => t.term)).toEqual(['GDOP', 'NLOS', 'FoM'])
    expect(uwbGeometry.scenario()).toEqual(uwbPositionScenario('base'))
    expect(uwbGeometry.limits).toEqual([])
    expect(uwbGeometry.observe).toEqual([])
    expect(uwbGeometry.tryThis).toEqual([])
  })

  it('cites the FoM clause and its tables in ①, and ① says nothing of GDOP as standard', () => {
    const std = JSON.stringify(uwbGeometry.standard)
    for (const c of ['§10.29.1.1', '§10.29.1.7', '图 10-200', '图 10-201', '表 10-146', '表 10-147', '表 10-148']) expect(std, c).toContain(c)
    expect(std).toContain('标准里没有 GDOP')
    for (const sim of ['0x16', '0x7b', '1.05', 'anchor-1', '本仿真器']) expect(std, sim).not.toContain(sim)
  })

  it('①’s FoM table is the one the engine decodes with', () => {
    const t = uwbGeometry.standard!.find((b) => b.kind === 'table') as Extract<Block, { kind: 'table' }>
    expect(t.rows[0][2]).toBe(`0 无品质因数；1 至 7 依次为 ${CL.slice(1).map((x) => `${x} %`).join('、')}`)
    expect(t.rows[1][2]).toBe('0 至 3 依次为 100 ps、300 ps、1 ns、3 ns')
    expect(t.rows[2][2]).toBe(`0 至 3 依次为 ${SCALE.map((x) => x.toFixed(1)).join('、')}`)
    // the engine's own wording of every byte it writes agrees with the tables
    for (const b of [FOM_LOS, FOM_NLOS]) {
      const d = decode(b)
      expect(d.ext).toBe(0)
      expect(fomText(b)).toBe(`${CL[d.cl]} % within ${+(CI_NS[d.ci] * SCALE[d.sc]).toFixed(1)} ns`)
    }
  })
})

describe('uwb-geometry · ② says what the engine does, and the engine does it', () => {
  it('the FoM byte follows the wall, not the error: two values, and NLOS off leaves it alone', () => {
    expect(implRow('品质因数怎样算出').sim).toContain('0x7b')
    expect(implRow('品质因数怎样算出').sim).toContain('0x16')
    for (const r of tagRanges(0)) expect(r.fom, `${r.peer} b${r.block}`).toBe(r.peer === 'anchor-1' ? FOM_NLOS : FOM_LOS)
    for (const r of tagRanges()) expect(r.fom).toBe(FOM_LOS)
    const walled = scenarioOf(0)
    const ideal = [...new Simulation({ ...walled, uwb: { ...walled.uwb!, nlos: false } }).runUntil(RUN_NS).records]
    const rs = ofType(ideal, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
    for (const r of rs) {
      expect(r.fom).toBe(r.peer === 'anchor-1' ? FOM_NLOS : FOM_LOS)
      expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(4 * SIGMA_R)
    }
  })

  it('the solver ignores the FoM: equal weights reproduce the engine’s fix', () => {
    const anchors: AnchorPos[] = CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const rs = tagRanges(0).filter((r) => r.block === 0)
    const fix = solvePosition(anchors, rs.map((r) => ({ id: r.peer, distM: r.distM })), TAG.z, SIGMA_R)!
    expect(fix.x).toBeCloseTo(fixes(0)[0].x, 12)
    expect(fix.y).toBeCloseTo(fixes(0)[0].y, 12)
  })

  it('GDOP and the ellipse: σ_r is the constant 2.12 cm, drawn ten times over', () => {
    const sim = implRow('GDOP 与椭圆').sim
    expect(sim).toContain(`σ_r 取常数 ${(SIGMA_R * 100).toFixed(2)} cm`)
    expect(ELLIPSE_DRAW_SCALE).toBe(10)
    expect(sim).toContain('放大十倍')
    const f = exactFix()
    const doubled = exactFix(undefined, 2 * SIGMA_R)
    expect(doubled.ellipse.a / f.ellipse.a).toBeCloseTo(2, 9)
    expect(doubled.gdop).toBeCloseTo(f.gdop, 12)
  })

  it('the NLOS delays per material are the engine’s', () => {
    const sim = implRow('非视距的时延').sim
    expect(sim).toContain(`砖 ${UWB_NLOS_NS.brick.toFixed(1)} ns、石膏板 ${UWB_NLOS_NS.drywall} ns、玻璃 ${UWB_NLOS_NS.glass} ns`)
  })

  it('no echo in any of the three scenes', () => {
    for (const v of [undefined, 0, 1]) {
      expect(scenarioOf(v).scatterers).toBeUndefined()
      expect(ofType(recs(v), 'UWB_ECHO')).toHaveLength(0)
    }
  })
})

describe('uwb-geometry · ③ every figure the labs print is the run', () => {
  it('lab 1: the formula’s GDOP, and every cell of the three-scenes table', () => {
    const f = blockOf(lab('三个场景，同一台射频'), 'formula', '几何的放大倍数')
    expect(f.text).toBe(`GDOP = √trace((JᵀJ)⁻¹) = ${exactFix().gdop.toFixed(2)}      Σ = σ_r² (JᵀJ)⁻¹`)
    const rows = blockOf(lab('三个场景，同一台射频'), 'table', '三个场景，同一台射频').rows
    for (const [row, v] of [[rows[0], undefined], [rows[1], 0], [rows[2], 1]] as const) {
      const fx = uwbFixRow(inspectorAfter(v, 1).position!, STRINGS.uwb)
      expect([row[1], row[2], row[3], row[4]], row[0]).toEqual([fx.gdop, fx.ellipse, fx.estimate, fx.error])
      expect(fmtRecord(fixes(v)[0])).toContain(`GDOP ${row[1]}`)
    }
    expect(fixes(1)[0].anchors).toHaveLength(3)
    const e = lab('三个场景，同一台射频').expect
    expect(e).toContain(`偏了 ${rows[1][4]}`)
    expect(e).toContain(`GDOP 升到 ${rows[2][1]}`)
    // and every walled block keeps the clean GDOP and ellipse
    for (const fx of fixes(0)) expect([fx.gdop.toFixed(2), (fx.ellipse.a * 100).toFixed(1)]).toEqual([rows[0][1], rows[0][2].split(' ')[0]])
  })

  it('lab 2: the worked table is JᵀJ, its inverse, the GDOP and the ellipse', () => {
    const rows = blockOf(lab('按步骤算出 GDOP'), 'table', '四个角的锚点，按上述步骤计算一遍').rows
    const r = CORNERS.map(([, x, y]) => jRow(x, y))
    let xx = 0, xy = 0, yy = 0
    for (const [ux, uy] of r) { xx += ux * ux; xy += ux * uy; yy += uy * uy }
    const det = xx * yy - xy * xy
    const p = (v: [number, number]) => `(${v[0].toFixed(4)}, ${v[1].toFixed(4)})`
    expect(rows[0][1]).toBe(minus(`${p(r[0])} · ${p(r[1])}`))
    expect(rows[1][1]).toBe(minus(`${p(r[2])} · ${p(r[3])}`))
    expect(rows[2][1]).toBe(minus(`${xx.toFixed(4)}, ${xy.toFixed(4)}, ${yy.toFixed(4)} · det ${det.toFixed(4)}`))
    expect(rows[3][1]).toBe(minus(`${(yy / det).toFixed(4)}, ${(-xy / det).toFixed(4)}, ${(xx / det).toFixed(4)}`))
    const tr = (yy + xx) / det
    expect(rows[4][1]).toBe(`√(${(yy / det).toFixed(4)} + ${(xx / det).toFixed(4)}) = √${tr.toFixed(4)} = ${Math.sqrt(tr).toFixed(4)}`)
    const f = exactFix()
    expect(Math.sqrt(tr)).toBeCloseTo(f.gdop, 12)
    expect(rows[5][1]).toBe(minus(`${(f.ellipse.a * 100).toFixed(2)} × ${(f.ellipse.b * 100).toFixed(2)} cm，${(f.ellipse.thetaRad * 180 / Math.PI).toFixed(1)}°`))
    const steps = blockOf(lab('按步骤算出 GDOP'), 'steps', '本仿真器怎样算 GDOP 与椭圆：逐步说明（标准没有规定）').items.join('\n')
    expect(MIN_DET).toBe(1e-9)
    expect(steps).toContain('1e-9')
    expect(steps).toContain(`${(SIGMA_R * 100).toFixed(2)} cm`)
  })

  it('lab 2: the expectation — 1.0488, −86.8°, and +61.5° into the empty quadrant', () => {
    const e = lab('按步骤算出 GDOP').expect
    const four = exactFix()
    const three = exactFix('anchor-4')
    const deg = (x: Fix) => x.ellipse.thetaRad * 180 / Math.PI
    expect(e).toContain(`GDOP 为 ${four.gdop.toFixed(4)}，椭圆 ${(four.ellipse.a * 100).toFixed(2)} × ${(four.ellipse.b * 100).toFixed(2)} cm，长轴与 +x 轴成 ${minus(deg(four).toFixed(1))}°`)
    expect(e).toContain(`长轴转到 +${deg(three).toFixed(1)}°`)
    const removed = Math.atan2(7.5 - TAG.y, 9.5 - TAG.x) * 180 / Math.PI
    expect(Math.floor(removed / 90)).toBe(Math.floor(deg(three) / 90))
  })

  it('lab 3: the bytes on each range, and each byte decoded through ①’s tables', () => {
    const rows = blockOf(lab('一条路径上的一堵砖墙'), 'table', '有墙的场景里每条距离上的字节').rows
    const b0 = tagRanges(0).filter((r) => r.block === 0)
    const a1 = b0.find((r) => r.peer === 'anchor-1')!
    expect(rows[0][1]).toBe(`${((a1.distM - a1.trueDistM) * 100).toFixed(1)} cm`)
    expect(rows[0][2]).toBe(`0x${a1.fom.toString(16)} — ${fomText(a1.fom)}`)
    const bound = Number(/不到 ([\d.]+) cm/.exec(rows[1][1])![1])
    for (const r of b0.filter((x) => x.peer !== 'anchor-1')) {
      expect(Math.abs(r.distM - r.trueDistM) * 100, r.peer).toBeLessThan(bound)
      expect(rows[1][2]).toBe(`0x${r.fom.toString(16)} — ${fomText(r.fom)}`)
    }
    const dec = blockOf(lab('一条路径上的一堵砖墙'), 'table', '两个字节，按 ① 的表格读').rows
    for (const row of dec) {
      const d = decode(parseInt(row[0], 16))
      expect(row[1]).toBe(`${d.cl}：${CL[d.cl]} %`)
      expect(row[2]).toBe(`${d.ci}：${CI_NS[d.ci] < 1 ? `${CI_NS[d.ci] * 1000} ps` : `${CI_NS[d.ci]} ns`}`)
      expect(row[3]).toBe(`${d.sc}：${SCALE[d.sc].toFixed(1)}`)
      expect(row[4]).toBe(`${+(CI_NS[d.ci] * SCALE[d.sc]).toFixed(1)} ns`)
    }
    expect(dec.map((r) => parseInt(r[0], 16))).toEqual([FOM_LOS, FOM_NLOS])
  })

  it('lab 3: the brick’s 0.5996 m, the 8.9 cm envelope and the noise-free shift', () => {
    const f = blockOf(lab('一条路径上的一堵砖墙'), 'formula', '定位偏了多少，几何允许多少')
    const m = /砖墙 ([\d.]+) ns × ([\d.]+) m\/ns = ([\d.]+) m\n4σ 包络 = 4 × ([\d.]+) × ([\d.]+) = ([\d.]+) cm/.exec(f.text)!
    expect(Number(m[1])).toBe(UWB_NLOS_NS.brick)
    expect(Number(m[2])).toBe(C_M_PER_NS)
    const bias = UWB_NLOS_NS.brick * C_M_PER_NS
    expect(m[3]).toBe(bias.toFixed(4))
    expect(m[4]).toBe((SIGMA_R * 100).toFixed(2))
    expect(m[5]).toBe(exactFix().gdop.toFixed(4))
    expect(m[6]).toBe((4 * SIGMA_R * exactFix().gdop * 100).toFixed(1))
    const biased = exactFix(undefined, SIGMA_R, bias)
    const shift = Math.hypot(biased.x - TAG.x, biased.y - TAG.y)
    expect(f.note).toContain(`移动 ${shift.toFixed(3)} m，即偏差的 ${(shift / bias * 100).toFixed(0)} %`)
    expect((biased.x - TAG.x) * (TAG.x - 0.5) + (biased.y - TAG.y) * (TAG.y - 0.5)).toBeGreaterThan(0)
    expect(uwbGeometry.quiz[0].q).toContain(`${shift.toFixed(3)} m`)
    expect(uwbGeometry.quiz[0].explain).toContain(`${(biased.residualM * 100).toFixed(0)} cm 的残差`)
    expect(uwbGeometry.quiz[1].explain).toContain(`4 × ${m[4]} × ${m[5]} = ${m[6]} cm`)
  })

  it('lab 3: the expectation — 5.33 against 4.76, 30.9 cm, three and a half times, GDOP 1.05', () => {
    const e = lab('一条路径上的一堵砖墙').expect
    const a1 = tagRanges(0).find((r) => r.peer === 'anchor-1' && r.block === 0)!
    expect(e).toContain(`anchor-1 测得 ${a1.distM.toFixed(2)} m，真值 ${a1.trueDistM.toFixed(2)} m`)
    const err = fixErr(fixes(0)[0])
    expect(e).toContain(`偏了 ${(err * 100).toFixed(1)} cm`)
    const envelope = 4 * SIGMA_R * exactFix().gdop
    expect(e).toContain(`是 ${(envelope * 100).toFixed(1)} cm 包络的三倍半`)
    expect((err / envelope).toFixed(1)).toBe('3.5')
    expect(e).toContain(`GDOP 仍是 ${fixes(0)[0].gdop.toFixed(2)}`)
    // the clean run sits under the envelope it is measured against
    for (const fx of fixes()) expect(fixErr(fx)).toBeLessThan(envelope)
    expect(fixes()).toHaveLength(BLOCKS)
  })

  it('the quiz’s 0x16 is decoded the way ① says', () => {
    const d = decode(FOM_LOS)
    const ex = uwbGeometry.quiz[2].explain
    expect(ex).toContain(`第 0–2 位是 ${d.cl}，即 ${CL[d.cl]} %`)
    expect(ex).toContain(`第 3–4 位是 ${d.ci}，即 ${CI_NS[d.ci]} ns`)
    expect(ex).toContain(`第 5–6 位是 ${d.sc}，即倍数 ${SCALE[d.sc]}`)
    expect(uwbGeometry.quiz[2].options[1]).toContain(fomText(FOM_LOS).replace(' within ', ' 的概率落在 ').replace(' ns', ' ns 宽'))
  })
})
