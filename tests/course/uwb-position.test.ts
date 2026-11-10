/**
 * `@uwb-position`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites and for saying nothing of the solver; ② row by row
 * against the engine (the solver, the range sigma and the record come from the engine's own
 * exports); ③ figure by figure: every number the labs print is read back out of the lesson text
 * and compared with a run. The scenario builder lives here, so its three scenes are pinned here
 * too; `uwb-geometry` loads the same builder.
 */
import { describe, it, expect } from 'vitest'
import { uwbPosition, uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { wallsCrossed } from '../../src/engine/propagation'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { MIN_DET, rangeSigmaM, solvePosition, type AnchorPos } from '../../src/uwb/position'
import { uwbFixRow } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven ranging blocks. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = { x: 4, y: 3.5, z: 1.0 }
const ANCHOR_Z = 2.2
const CORNERS: [string, number, number][] = [
  ['anchor-1', 0.5, 0.5], ['anchor-2', 9.5, 0.5], ['anchor-3', 0.5, 7.5], ['anchor-4', 9.5, 7.5],
]
const SIGMA_R = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)

const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbPosition.scenario() : uwbPosition.variants![variant].scenario()
const recs = (variant?: number): TLRecord[] => runOf(uwbPosition, variant, RUN_NS)

lessonShapeSuite(uwbPosition, { runNs: RUN_NS })

const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
const anchorsOf = (variant?: number): AnchorPos[] =>
  CORNERS.filter(([id]) => variant !== 1 || id !== 'anchor-4').map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))

/** Each block re-solved from the tag's own ranges — `UWB_POSITION` carries no residual. */
function roundResidualsCm(variant?: number): number[] {
  const rs = tagRanges(variant)
  const blocks = [...new Set(rs.map((r) => r.block))].sort((a, b) => a - b)
  expect(blocks).toHaveLength(BLOCKS)
  return blocks.map((b) => {
    const fix = solvePosition(anchorsOf(variant), rs.filter((r) => r.block === b).map((r) => ({ id: r.peer, distM: r.distM })), TAG.z, SIGMA_R)
    expect(fix).not.toBeNull()
    return fix!.residualM * 100
  })
}

function inspectorAfter(variant: number | undefined, blocks: number): UwbNodeView {
  const vs = initViewState(scenarioOf(variant))
  for (const r of recs(variant)) {
    if (r.t >= blocks * 200 * MS + 10 * MS) break
    applyRecord(vs, r)
  }
  return vs.nodes['uwb-1'].uwb!
}

const lab = (heading: string): Lab => {
  const l = uwbPosition.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbPosition.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

describe('uwb-position · the lesson and its scene', () => {
  it('sits in the sessions module, in the standard-first shape', () => {
    expect(isStandardFirst(uwbPosition)).toBe(true)
    expect(MODULES[uwbPosition.module].title).toBe('定位')
    expect(uwbPosition.needs).toEqual(['uwb-blocks', 'uwb-dstwr'])
    expect(uwbPosition.terms!.map((t) => t.term)).toEqual(['trilateration', 'residual'])
    expect(uwbPosition.limits).toEqual([])
    expect(uwbPosition.observe).toEqual([])
    expect(uwbPosition.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and ① says nothing of the solver', () => {
    const std = JSON.stringify(uwbPosition.standard)
    for (const c of ['§10.29.1.1', '§10.29.1.2.1', '§10.29.1.2.3', '§10.29.1.2.4', '§10.32.5', '§10.29.6.1', '§10.29.1.2.5']) expect(std, c).toContain(c)
    for (const sim of ['高斯', '形心', '1 mm', '残差', '本仿真器', 'uwb-1']) expect(std, sim).not.toContain(sim)
  })

  it('is four corner anchors at 2.20 m and one phone at (4, 3.5, 1.0); DS-TWR with NLOS on', () => {
    for (const v of [undefined, 0, 1]) expect(() => ScenarioSchema.parse(scenarioOf(v))).not.toThrow()
    const s = uwbPosition.scenario()
    expect(s.nodes.map((n) => [n.id, n.pos.x, n.pos.y, n.pos.z])).toEqual([
      ...CORNERS.map(([id, x, y]) => [id, x, y, ANCHOR_Z]), ['uwb-1', TAG.x, TAG.y, TAG.z],
    ])
    expect(s.uwb).toMatchObject({ method: 'ds', nlos: true })
    expect(uwbPositionScenario('base')).toEqual(s)
  })

  it('the wall variant adds one brick stub, crossed by the tag → anchor-1 ray only', () => {
    const v = scenarioOf(0)
    expect(v.walls.length).toBe(uwbPosition.scenario().walls.length + 1)
    const stub = v.walls[v.walls.length - 1]
    expect(stub).toEqual({ x1: 2, y1: 1.5, x2: 2, y2: 3, material: 'brick', openings: [] })
    const crossings = CORNERS.map(([id, x, y]) => `${id}:${wallsCrossed(TAG, { x, y, z: ANCHOR_Z }, [stub]).length}`)
    expect(crossings).toEqual(['anchor-1:1', 'anchor-2:0', 'anchor-3:0', 'anchor-4:0'])
    expect(v).toEqual(uwbPositionScenario('wall'))
  })

  it('the three-anchor variant deletes the corner at (9.5, 7.5) and nothing else', () => {
    expect(scenarioOf(1).nodes.map((n) => n.id)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'uwb-1'])
    expect(scenarioOf(1).walls).toEqual(uwbPosition.scenario().walls)
  })
})

describe('uwb-position · ② says what the engine does, and the engine does it', () => {
  it('one-to-many DS-TWR: Final with RMI and RRTI, anchors compute, then report back', () => {
    const tx = ofType(recs(), 'TX_START').filter((r) => r.frame.uwb?.block === 0)
    const final = tx.find((r) => r.frame.kind === 'uwbFinal')!
    expect(final.frame.uwb!.ies).toEqual(['RMI', 'RRTI'])
    // each anchor computes its own range on the Final, before any report comes back
    const anchorRanges = ofType(recs(), 'UWB_RANGE').filter((r) => r.node !== 'uwb-1' && r.block === 0)
    expect(anchorRanges.map((r) => r.node).sort()).toEqual(CORNERS.map(([id]) => id))
    const reports = tx.filter((r) => r.frame.kind === 'uwbReport')
    expect(reports).toHaveLength(4)
    for (const r of anchorRanges) expect(r.t).toBeLessThan(Math.min(...reports.map((x) => x.t)))
  })

  it('the solver: centroid start, 1 mm and 20 iterations, and it converges to a micrometre', () => {
    const anchors = anchorsOf()
    const exact = solvePosition(anchors, anchors.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) })), TAG.z, SIGMA_R)!
    expect(Math.hypot(exact.x - TAG.x, exact.y - TAG.y)).toBeLessThan(1e-6)
    expect(implRow('由距离到位置').sim).toContain('1 mm')
    expect(implRow('由距离到位置').sim).toContain('20 次')
  })

  it('the height is held: the true 1.00 m, and a wrong height moves the answer', () => {
    expect(implRow('未知数').sim).toContain(`${TAG.z.toFixed(2)} m`)
    const anchors = anchorsOf()
    const ranges = anchors.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    const off = solvePosition(anchors, ranges, TAG.z + 0.5, SIGMA_R)!
    expect(Math.hypot(off.x - TAG.x, off.y - TAG.y)).toBeGreaterThan(1e-3)
  })

  it('no fix under three ranges, or with the anchors in a line (det < 1e-9)', () => {
    expect(MIN_DET).toBe(1e-9)
    expect(implRow('何时不输出').sim).toContain('1e-9')
    const three = anchorsOf().slice(0, 3)
    const ranges = three.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    expect(solvePosition(three, ranges.slice(0, 2), TAG.z, SIGMA_R)).toBeNull()
    const line: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: i, y: 4, z: ANCHOR_Z }))
    expect(solvePosition(line, line.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) })), TAG.z, SIGMA_R)).toBeNull()
  })

  it('the residual is computed but never written into the record', () => {
    expect(Object.keys(fixes()[0])).not.toContain('residualM')
    expect(implRow('残差').sim).toContain('不写入记录')
  })

  it('σ_r = c·σ_ts/√2 = 2.12 cm at 100 ps', () => {
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    const sim = implRow('单条距离的噪声').sim
    expect(sim).toContain(`σ_ts 取 ${DEFAULT_UWB_SESSION.tsNoisePs} ps，得 ${(SIGMA_R * 100).toFixed(2)} cm`)
    expect(SIGMA_R).toBeCloseTo(C_M_PER_NS * 0.1 / Math.SQRT2, 12)
  })

  it('one fix per block, at the end of the tag’s round, after the last range', () => {
    expect(fixes().map((f) => f.t)).toEqual([0, 1, 2, 3, 4, 5, 6].map((b) => 20 * MS + b * 200 * MS))
    expect(ofType(recs(), 'UWB_ROUND_END').map((e) => e.t)).toEqual(fixes().map((f) => f.t))
    const last0 = Math.max(...tagRanges().filter((r) => r.block === 0).map((r) => r.t))
    expect(fixes()[0].t).toBeGreaterThanOrEqual(last0)
  })
})

describe('uwb-position · ③ every figure the labs print is the run', () => {
  it('lab 1: the log line, the inspector’s figure and the seven errors', () => {
    const rows = blockOf(lab('一轮之后的一个点'), 'table', '一轮末尾日志输出什么').rows
    const b = Number(/第 (\d+) 块的定位/.exec(rows[0][0])![1])
    expect(fixes()[0].block).toBe(b)
    expect(rows[0][1]).toBe(fmtRecord(fixes()[0]))
    const row = uwbFixRow(inspectorAfter(undefined, 1).position!, STRINGS.uwb)
    expect(rows[1][1]).toBe(row.error)
    const cm = fixes().map((f) => (fixErr(f) * 100).toFixed(1))
    expect(cm).toHaveLength(BLOCKS)
    expect(rows[2][1]).toBe(`${cm.join(', ')} cm`)
    const e = lab('一轮之后的一个点').expect
    const nums = fixes().map((f) => fixErr(f) * 100)
    expect(e).toContain(`误差在 ${Math.min(...nums).toFixed(1)} 到 ${Math.max(...nums).toFixed(1)} cm 之间`)
    expect(e).toContain(`${['零', '一', '二', '三', '四', '五', '六', '七'][BLOCKS]}次定位`)
  })

  it('lab 2: the worked table is block 0 put through the solver, row by row', () => {
    const t = blockOf(lab('照解算步骤复算第 0 块'), 'table', '本次运行的第 0 块，按上述步骤计算一遍')
    const b = Number(/第 (\d+) 块/.exec(t.heading!)![1])
    const rs = tagRanges().filter((r) => r.block === b)
    const anchors = anchorsOf()
    const fix = solvePosition(anchors, rs.map((r) => ({ id: r.peer, distM: r.distM })), TAG.z, SIGMA_R)!
    const cx = CORNERS.reduce((s, [, x]) => s + x, 0) / CORNERS.length
    const cy = CORNERS.reduce((s, [, , y]) => s + y, 0) / CORNERS.length
    const f = fixes()[b]
    expect(t.rows.map((r) => r[1])).toEqual([
      `${rs.map((r) => r.distM.toFixed(4)).join(', ')} m`,
      `(${cx.toFixed(2)}, ${cy.toFixed(2)}) m`,
      `(${fix.x.toFixed(4)}, ${fix.y.toFixed(4)}) m`,
      `${(fix.residualM * 100).toFixed(2)} cm`,
      `(${TAG.x.toFixed(2)}, ${TAG.y.toFixed(2)}) m`,
      `error ${fixErr(f).toFixed(2)} m — ${(fixErr(f) * 100).toFixed(2)} cm`,
    ])
    expect(fix.x).toBeCloseTo(f.x, 12)
    expect(fix.y).toBeCloseTo(f.y, 12)
    // the steps print the start point and the held height
    const steps = blockOf(lab('照解算步骤复算第 0 块'), 'steps', '本仿真器的解算器：逐步说明（标准没有规定这一过程）').items.join('\n')
    expect(steps).toContain(`(${cx.toFixed(2)}, ${cy.toFixed(2)}) m`)
    expect(steps).toContain(`${TAG.z.toFixed(2)} m`)
    // the expectation
    const e = lab('照解算步骤复算第 0 块').expect
    expect(e).toContain(`迭代终止于 (${fix.x.toFixed(4)}, ${fix.y.toFixed(4)}) m，残差的均方根 ${(fix.residualM * 100).toFixed(2)} cm`)
    expect(e).toContain(`单条距离的噪声 ${(SIGMA_R * 100).toFixed(2)} cm`)
    expect(fix.residualM).toBeLessThan(SIGMA_R)
  })

  it('lab 2: σ_r through its own formula', () => {
    const f = blockOf(lab('照解算步骤复算第 0 块'), 'formula', '单次测距的噪声有多大')
    expect(f.text).toBe(`σ_r = c · σ_ts / √2 = ${(SIGMA_R * 100).toFixed(2)} cm`)
  })

  it('lab 3: the residuals of the three scenes, one ruler', () => {
    const rows = blockOf(lab('残差是一道检查'), 'table', '七个块的残差，三个场景').rows
    const range = (xs: number[]) => `${Math.min(...xs).toFixed(2)} 到 ${Math.max(...xs).toFixed(2)} cm`
    const clean = roundResidualsCm()
    const wall = roundResidualsCm(0)
    expect(rows[0][1]).toBe(range(clean))
    expect(rows[1][1]).toBe(range(wall))
    expect(rows[2][1]).toBe(`${clean[0].toFixed(2)} cm 对 ${roundResidualsCm(1)[0].toFixed(2)} cm`)
    // 「干净的七个块都在 2.12 cm 以内；有墙的七个块升至二十厘米左右；三个锚点的残差反而比四个锚点小」
    const e = lab('残差是一道检查').expect
    expect(e).toContain(`都在 ${(SIGMA_R * 100).toFixed(2)} cm 以内`)
    for (const c of clean) expect(c / 100).toBeLessThan(SIGMA_R)
    for (const c of wall) expect(Math.abs(c - 20)).toBeLessThan(3)
    expect(roundResidualsCm(1)[0]).toBeLessThan(clean[0])
  })
})
