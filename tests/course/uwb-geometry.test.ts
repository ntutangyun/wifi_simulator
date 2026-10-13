/**
 * Every empirical claim in "Where the anchors stand", the second half of the old
 * `uwb-position`: GDOP, the 1-σ error ellipse, the brick wall in one path and the
 * three-anchor layout. It loads exactly the scene `uwb-position` loads — the same
 * builder, the same two variants — so the split costs the reader nothing and the
 * recorded hashes of the two ids are equal, which the kit's `sameSceneAs` check
 * asserts here and the controller's fixtures record once it is registered.
 *
 * The scenario builder and its three scenes are pinned next door, in
 * tests/course/uwb-position.test.ts (describe "uwb-position · the scene"), which
 * is where the builder lives. Everything below is about what the geometry does
 * to a fix, and the solver, the FoM bytes and the NLOS delays come from the
 * engine's own exports rather than being re-typed.
 */
import { describe, it, expect } from 'vitest'
import { uwbGeometry } from '../../src/course/uwb/uwb-geometry'
import { uwbPosition, uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { C_M_PER_NS, FOM_LOS, FOM_NLOS, UWB_NLOS_NS, fomText } from '../../src/uwb/phy'
import { MIN_DET, rangeSigmaM, solvePosition, type AnchorPos, type Fix } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'
import { uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** Seven ranging blocks, as next door: "over seven blocks the bias averages 59.4 cm". */
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

// The contract every migrated lesson owes, plus the split rule: uwb-geometry loads
// uwb-position's own scene, so its recorded timeline hashes are uwb-position's, value
// for value. (Until the controller registers this lesson, the readability suite does
// not see it; the shape checks below are the kit's.)
lessonShapeSuite(uwbGeometry, { sameSceneAs: 'uwb-position' })

const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')

/** The lesson's nth table of `numbers`, rows kept in place so a cell can be checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbGeometry.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
/** A cell with the lesson's typographic minus put back to the one `toFixed` writes. */
const cellAscii = (n: number, row: number, col: number): string => cell(n, row, col).replace(/−/g, '-')
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbGeometry.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbGeometry).map((s) => s).join('\n')

/** The solver run on exact geometry: what GDOP and the ellipse are before any noise. */
function exactFix(px: number, py: number, drop?: string): Fix {
  const anchors: AnchorPos[] = CORNERS.filter(([id]) => id !== drop)
    .map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
  const ranges = anchors.map((a) => ({ id: a.id, distM: Math.hypot(px - a.x, py - a.y, TAG.z - a.z) }))
  const fix = solvePosition(anchors, ranges, TAG.z, SIGMA_R)
  expect(fix, `exact fix at ${px},${py}`).not.toBeNull()
  return fix!
}

/**
 * The residual of each round AS THE RUN LEAVES IT, in centimetres to two places.
 *
 * The lesson's 「19.85 到 22.25 cm」 and 「0.78 到 1.98 cm」 are these, not `exactFix`'s:
 * `UWB_POSITION` carries no residual, so each block is re-solved from the tag's own
 * measured ranges — same anchors, same held height, same σ_r — and the solver's own
 * `residualM` at the point the engine emitted is what comes back.
 */
function roundResidualsCm(variant?: number): string[] {
  // variant 1 is "three anchors": the far corner is not in the scene, so not in the solve
  const anchors: AnchorPos[] = CORNERS.filter(([id]) => variant !== 1 || id !== 'anchor-4')
    .map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
  const rs = tagRanges(variant)
  const blocks = [...new Set(rs.map((r) => r.block))].sort((a, b) => a - b)
  expect(blocks, `variant ${variant ?? 'base'}`).toHaveLength(BLOCKS)
  return blocks.map((b) => {
    const fix = solvePosition(
      anchors,
      rs.filter((r) => r.block === b).map((r) => ({ id: r.peer, distM: r.distM })),
      TAG.z, SIGMA_R,
    )
    expect(fix, `block ${b} of variant ${variant ?? 'base'}`).not.toBeNull()
    return (fix!.residualM * 100).toFixed(2)
  })
}

/** A numeral the lesson spells out in Chinese, as a number. */
function zhNum(s: string): number {
  const n = zhNumeral(s.replace(/两/g, '二'))
  expect(n, `「${s}」 is not a numeral this file knows how to read`).not.toBeNull()
  return n!
}

/**
 * The lowest and highest GDOP the panel prints anywhere in the room, swept once per run.
 *
 * The grid runs to the room's bounds, because the extremes live in the corner strip the old
 * 0.2-inset grid never visited. Memoised because two suites need it and the sweep is 32 000
 * solves: the figure-planting sweep runs this file once per plantable figure.
 */
let roomBandCache: { lo: number; hi: number } | undefined
function roomBand(): { lo: number; hi: number } {
  if (roomBandCache === undefined) {
    let lo = Infinity
    let hi = 0
    for (let x = 0; x <= 10.0001; x += 0.05) {
      for (let y = 0; y <= 8.0001; y += 0.05) {
        const g = exactFix(x, y).gdop
        lo = Math.min(lo, g)
        hi = Math.max(hi, g)
      }
    }
    roomBandCache = { lo, hi }
  }
  return roomBandCache
}

/** A Jacobian row at (px, py): the horizontal part of the 3-D unit vector to an anchor. */
function jRow(px: number, py: number, ax: number, ay: number): [number, number] {
  const dx = px - ax, dy = py - ay, dz = TAG.z - ANCHOR_Z
  const d3 = Math.hypot(dx, dy, dz)
  return [dx / d3, dy / d3]
}
const rowLen = (px: number, py: number, ax: number, ay: number): number => Math.hypot(...jRow(px, py, ax, ay))

/** GDOP straight from a set of Jacobian rows, so a row can be dropped past the solver's 3-range floor. */
function gdopOfRows(rows: [number, number][]): number {
  let xx = 0, xy = 0, yy = 0
  for (const [ux, uy] of rows) { xx += ux * ux; xy += ux * uy; yy += uy * uy }
  return Math.sqrt((yy + xx) / (xx * yy - xy * xy))
}

/** The gaps between the bearings of the named anchors as seen from (px, py), in degrees. */
function gapsAt(px: number, py: number, ids: string[]): string[] {
  const bs = CORNERS.filter(([id]) => ids.includes(id))
    .map(([, x, y]) => Math.atan2(y - py, x - px) * 180 / Math.PI)
    .sort((a, b) => a - b)
  const gaps = bs.map((b, i) => (bs[(i + 1) % bs.length] - b + 360) % 360)
  expect(gaps.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 9)
  return gaps.map((g) => g.toFixed(1))
}

/** The tag's inspector state after `blocks` blocks, replayed through the player's own reducer. */
function inspectorAfter(variant: number | undefined, blocks: number): UwbNodeView {
  const vs = initViewState(scenarioOf(variant))
  const untilNs = blocks * 200 * MS + 10 * MS
  for (const r of recs(variant)) {
    if (r.t >= untilNs) break
    applyRecord(vs, r)
  }
  const u = vs.nodes['uwb-1'].uwb
  expect(u!.position, 'the tag has a fix').not.toBeNull()
  return u!
}

const FOM_S = {
  fomWithin: STRINGS.uwb.fomWithin, noFom: STRINGS.uwb.noFom,
  integrityOk: STRINGS.uwb.integrityOk, integrityBad: STRINGS.uwb.integrityBad,
}

describe('uwb-geometry · the second half of the split', () => {
  it('follows uwb-position in the sessions module and loads its scene', () => {
    expect(uwbGeometry.id).toBe('uwb-geometry')
    expect(MODULES[uwbGeometry.module].title).toBe('定位')
    expect(uwbGeometry.module).toBe(uwbPosition.module)
    expect(uwbGeometry.needs).toEqual(['uwb-position'])
    // the three words this half adds
    expect(uwbGeometry.terms!.map((t) => t.term)).toEqual(['GDOP', 'NLOS', 'FoM'])
    // the same builder, the same three arguments: no new scenario, so no new recorded run
    expect(uwbGeometry.scenario()).toEqual(uwbPositionScenario('base'))
    expect(uwbGeometry.variants!.map((v) => v.scenario()))
      .toEqual([uwbPositionScenario('wall'), uwbPositionScenario('three')])
    expect(uwbGeometry.variants!.map((v) => v.label)).toEqual(uwbPosition.variants!.map((v) => v.label))
  })

  it('it offers four jumps, three things to observe, two experiments and three questions', () => {
    expect(uwbGeometry.jumps).toHaveLength(4)
    expect(uwbGeometry.observe).toHaveLength(3)
    expect(uwbGeometry.tryThis).toHaveLength(2)
    expect(uwbGeometry.quiz).toHaveLength(3)
    for (const q of uwbGeometry.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('names the one standard clause it leans on and owns the rest as the model’s', () => {
    // "§10.29.1.7, with Tables 10-146, 10-147 and 10-148, defines the Figure of Merit byte" —
    // in `sources`, which is the only place the contract allows a citation.
    const src = uwbGeometry.sources!.map((s) => s).join('\n')
    for (const s of ['IEEE Std 802.15.4-2024', '§10.29.1.7', '10-146', '10-147', '10-148']) {
      expect(src, s).toContain(s)
    }
    // "2.0 ns for brick, 0.5 ns for drywall and 0.2 ns for glass" — the engine's own table
    expect(UWB_NLOS_NS).toEqual({ brick: 2.0, drywall: 0.5, glass: 0.2 })
    // "the ten-times draw scale of the ellipse" / "the scene draws it ten times over"
    expect(ELLIPSE_DRAW_SCALE).toBe(10)
  })
})

describe('uwb-geometry · what the geometry charges', () => {
  it('GDOP at the tag is 1.05, and √trace((JᵀJ)⁻¹) is what the engine reports', () => {
    // "GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹"
    expect(formulas()).toHaveLength(1)
    expect(formulas()[0].text).toBe('GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹')
    expect(formulas()[0].text).toBe(formulas()[0].text)
    const exact = exactFix(TAG.x, TAG.y)
    expect(exact.gdop).toBeCloseTo(1.0488, 4)
    expect(exact.gdop.toFixed(2)).toBe('1.05')
    // every simulated fix prints the geometry's GDOP: the solved point wanders by centimetres,
    // so JᵀJ is evaluated a hair away from the truth, and 1.05 survives to two decimals
    for (const f of fixes()) {
      expect(f.gdop.toFixed(2), `block ${f.block}`).toBe('1.05')
      expect(Math.abs(f.gdop - exact.gdop), `block ${f.block}`).toBeLessThan(0.002)
    }
    expect(cell(0, 0, 1)).toBe('1.05')
  })

  it('the ideal GDOP of four evenly spread anchors is 2/√N = 1.00, and this scene misses it twice over', () => {
    // "Going deeper": "JᵀJ is exactly (N/2)·I, the trace of its inverse is 4/N and GDOP is
    //  2/√N — 1.00 at four anchors", and the note's "With four anchors whose bearings are
    //  spread evenly around the point, GDOP would be exactly 1.00."
    expect((2 / Math.sqrt(4)).toFixed(2)).toBe('1.00')
    // "each row is the horizontal shadow of a slanted unit vector, only 0.968 to 0.985 long"
    const rows = CORNERS.map(([, x, y]) => rowLen(TAG.x, TAG.y, x, y))
    expect(rows.map((r) => r.toFixed(3))).toEqual(['0.968', '0.982', '0.975', '0.985'])
    expect(Math.min(...rows)).toBeGreaterThan(0.9675)
    expect(Math.max(...rows)).toBeLessThan(0.9855)
    // "from the phone the bearings are 64.6°, 89.4°, 95.2° and 110.8° apart"
    expect(gapsAt(TAG.x, TAG.y, CORNERS.map(([id]) => id)).sort())
      .toEqual(['110.8', '64.6', '89.4', '95.2'].sort())
  })

  it('the anchors span 9 × 7 m, so no point sees four right angles — the room’s centre least of all', () => {
    // "they span a rectangle rather than a square" / "The room’s centre is no better: 1.0544
    //  against 1.0488."
    expect(CORNERS[1][1] - CORNERS[0][1]).toBe(9)
    expect(CORNERS[2][2] - CORNERS[0][2]).toBe(7)
    const centre = exactFix(5, 4)
    const tag = exactFix(TAG.x, TAG.y)
    expect(centre.gdop.toFixed(4)).toBe('1.0544')
    expect(tag.gdop.toFixed(4)).toBe('1.0488')
    // the sentence's whole point: moving to the centre makes it worse, not better
    expect(centre.gdop).toBeGreaterThan(tag.gdop)
    // the centre's own bearings are 104.3 / 75.7 twice over — still not four right angles
    expect(gapsAt(5, 4, CORNERS.map(([id]) => id))).toEqual(['104.3', '75.7', '104.3', '75.7'])
    // nowhere in the room, on a 0.1 m grid over the full bounds, are all four gaps 90°
    let bestSpread = Infinity
    for (let x = 0; x <= 10.0001; x += 0.1) {
      for (let y = 0; y <= 8.0001; y += 0.1) {
        const g = gapsAt(x, y, CORNERS.map(([id]) => id)).map(Number)
        bestSpread = Math.min(bestSpread, Math.max(...g.map((v) => Math.abs(v - 90))))
      }
    }
    expect(bestSpread).toBeGreaterThan(1)
  })

  it('across the whole room the four-anchor GDOP prints between 1.03 and 1.26', () => {
    // "Four corner anchors hold this room between 1.03 and 1.26 wherever the phone stands" /
    // the experiment: "even the corner at (1, 1) only reaches 1.18".
    // The sweep runs to the room's bounds, because the extremes live in the corner strip the
    // old 0.2-inset grid never visited; "prints" is the load-bearing word — the true minimum
    // is 1.0286, which the panel's two decimals show as 1.03.
    const { lo, hi } = roomBand()
    expect(lo.toFixed(4)).toBe('1.0286')
    expect(hi.toFixed(4)).toBe('1.2574')
    expect(lo.toFixed(2)).toBe('1.03')
    expect(hi.toFixed(2)).toBe('1.26')
    expect(exactFix(1, 1).gdop.toFixed(2)).toBe('1.18')
  })

  it('the 1-σ ellipse is 1.7 × 1.4 cm at −86.8°, and the scene draws it ten times over', () => {
    // "Going deeper": "the ellipse is 1.7 × 1.4 cm, its long axis nearly north–south at −86.8°
    //  from +x, and its axis ratio 1.25; the scene draws it ten times over — a 17 cm semi-axis"
    const e = exactFix(TAG.x, TAG.y).ellipse
    expect([(e.a * 100).toFixed(1), (e.b * 100).toFixed(1)]).toEqual(['1.7', '1.4'])
    expect((e.thetaRad * 180 / Math.PI).toFixed(1)).toBe('-86.8')
    expect(Math.abs(e.thetaRad * 180 / Math.PI)).toBeGreaterThan(85)
    expect((e.a * ELLIPSE_DRAW_SCALE * 100).toFixed(0)).toBe('17')
    // Σ = σ_r²(JᵀJ)⁻¹ scales with σ_r, so the axes are σ_r times a pure number of the geometry
    const doubled = solvePosition(
      CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z })),
      CORNERS.map(([id, x, y]) => ({ id, distM: Math.hypot(TAG.x - x, TAG.y - y, TAG.z - ANCHOR_Z) })),
      TAG.z, 2 * SIGMA_R,
    )!
    expect(doubled.ellipse.a).toBeCloseTo(2 * e.a, 12)
    expect(doubled.gdop).toBeCloseTo(exactFix(TAG.x, TAG.y).gdop, 12)
    expect((e.a / e.b).toFixed(2)).toBe('1.25')
    expect(cell(0, 0, 2)).toBe('1.7 × 1.4 cm')
  })

  it('the base run’s fix and its inspector row are the table’s first line', () => {
    // the "Three scenes, the same radio" table, first row: four anchors, 1.05,
    // 1.7 × 1.4 cm, (3.99, 3.50) m, 0.7 cm
    const row = uwbFixRow(inspectorAfter(undefined, 1).position!, STRINGS.uwb)
    expect([row.gdop, row.ellipse, row.estimate, row.error]).toEqual(['1.05', '1.7 × 1.4 cm', '(3.99, 3.50) m', '0.7 cm'])
    // every block draws the same ellipse: it is geometry, not measurement
    for (const f of fixes()) {
      expect([(f.ellipse.a * 100).toFixed(1), (f.ellipse.b * 100).toFixed(1)], `block ${f.block}`).toEqual(['1.7', '1.4'])
    }
    // the clean run's byte on every range: 0x16, "97 % within 0.5 ns"
    for (const r of tagRanges()) expect(r.fom, r.peer).toBe(FOM_LOS)
  })
})

describe('uwb-geometry · a brick wall in one path', () => {
  it('the blocked range is long by 0.5996 m: 2.0 ns of brick times c', () => {
    // "A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight." / "The
    //  blocked range reads 5.33 m against a true 4.76 m in the first block, and over seven
    //  blocks the bias averages 59.4 cm — within a third of a σ_r of the ideal figure above."
    const bias = UWB_NLOS_NS.brick * C_M_PER_NS
    expect(bias.toFixed(4)).toBe('0.5996')
    const blocked = tagRanges(0).filter((r) => r.peer === 'anchor-1')
    expect(blocked).toHaveLength(BLOCKS)
    const first = blocked[0]
    expect([first.distM.toFixed(2), first.trueDistM.toFixed(2)]).toEqual(['5.33', '4.76'])
    expect(((first.distM - first.trueDistM) * 100).toFixed(1)).toBe('57.1')
    const mean = blocked.reduce((s, r) => s + (r.distM - r.trueDistM), 0) / blocked.length
    expect((mean * 100).toFixed(1)).toBe('59.4')
    expect(Math.abs(mean - bias)).toBeLessThan(SIGMA_R / 3)
    // every block's blocked range sits within 4σ_r of the ideal bias — a reseed cannot hide it
    for (const r of blocked) expect(Math.abs(r.distM - r.trueDistM - bias), `block ${r.block}`).toBeLessThan(4 * SIGMA_R)
    // the table's "the other three · under 1.4 cm"
    const clean = tagRanges(0).filter((r) => r.peer !== 'anchor-1' && r.block === 0)
    expect(clean).toHaveLength(3)
    for (const r of clean) expect(Math.abs(r.distM - r.trueDistM) * 100, r.peer).toBeLessThan(1.45)
    expect(cell(1, 1, 1)).toContain('1.4 cm')
  })

  it('the FoM flags that one range as 0x7b and the other three as 0x16', () => {
    // the "The byte on each range, walled scene" table: anchor-1 | 57.1 cm | 0x7b — 75 % within
    // 12 ns, and "the other three" | under 1.4 cm | 0x16 — 97 % within 0.5 ns
    expect(FOM_NLOS).toBe(0x7b)
    expect(FOM_LOS).toBe(0x16)
    expect(fomText(FOM_NLOS)).toBe('75 % within 12 ns')
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
    expect(cell(1, 0, 1)).toBe('57.1 cm')
    expect(cell(1, 0, 2)).toBe(`0x7b — ${fomText(FOM_NLOS)}`)
    expect(cell(1, 1, 2)).toBe(`0x16 — ${fomText(FOM_LOS)}`)
    for (const r of tagRanges(0)) expect(r.fom, `${r.peer} b${r.block}`).toBe(r.peer === 'anchor-1' ? FOM_NLOS : FOM_LOS)
    // the inspector's range table, as the string table words it
    const rows = uwbRangeRows(inspectorAfter(0, 1), FOM_S)
    const a1 = rows.find((r) => r.peer === 'anchor-1')!
    // the three figures are the run's; the quality byte's wording is the string table's
    expect([a1.measured, a1.trueDist, a1.error]).toEqual(['5.33 m', '4.76 m', '57.1 cm'])
  })

  it('the FoM is geometry: with NLOS cleared the bias goes and the byte stays', () => {
    // "clear the session’s NLOS switch and the range returns to centimetres while the byte
    //  reads the same" / the experiment: "The run becomes the clean one — the same seven
    //  fixes, the error back to a few centimetres"
    const walled = scenarioOf(0)
    const ideal = [...new Simulation({ ...walled, uwb: { ...walled.uwb!, nlos: false } }).runUntil(RUN_NS).records]
    const rs = ofType(ideal, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
    for (const r of rs) expect(r.fom, `${r.peer} b${r.block}`).toBe(r.peer === 'anchor-1' ? FOM_NLOS : FOM_LOS)
    for (const r of rs) expect(Math.abs(r.distM - r.trueDistM), `${r.peer} b${r.block}`).toBeLessThan(4 * SIGMA_R)
    const idealFixes = ofType(ideal, 'UWB_POSITION')
    expect(idealFixes.map((f) => fmtRecord(f))).toEqual(fixes().map((f) => fmtRecord(f)))
    for (const f of idealFixes) expect(fixErr(f) * 100, `block ${f.block}`).toBeLessThan(3.35)
  })

  it('the fix moves 30.9 cm, not 60, and away from the blocked anchor', () => {
    // "The fix moves 30.9 cm, not 60. Noise-free the shift is 0.316 m, 53 % of the bias, on a
    //  bearing that points away from the blocked anchor." / the table row "(4.18, 3.75) m ·
    //  30.9 cm" / quiz 1: "yet the fix moves 0.316 m noise-free"
    const line = 'uwb-1 position (4.18, 3.75) m, true (4.00, 3.50), error 0.31 m, GDOP 1.05, 4 anchors'
    expect(fmtRecord(fixes(0)[0])).toBe(line)
    expect(cell(0, 1, 3)).toBe('(4.18, 3.75) m')
    expect(cell(0, 1, 4)).toBe('30.9 cm')
    expect(fixes(0)).toHaveLength(BLOCKS)
    for (const f of fixes(0)) {
      expect(f.x - f.trueX, `block ${f.block} x`).toBeGreaterThan(0)
      expect(f.y - f.trueY, `block ${f.block} y`).toBeGreaterThan(0)
      expect(fixErr(f), `block ${f.block}`).toBeLessThan(UWB_NLOS_NS.brick * C_M_PER_NS)
    }
    // the noise-free shift: exact ranges with the brick bias on anchor-1 alone
    const bias = UWB_NLOS_NS.brick * C_M_PER_NS
    const anchors: AnchorPos[] = CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const biased = solvePosition(anchors, anchors.map((a) => ({
      id: a.id,
      distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) + (a.id === 'anchor-1' ? bias : 0),
    })), TAG.z, SIGMA_R)!
    const shift = Math.hypot(biased.x - TAG.x, biased.y - TAG.y)
    expect(shift.toFixed(3)).toBe('0.316')
    expect((shift / bias * 100).toFixed(0)).toBe('53')
    // away from anchor-1 at (0.5, 0.5): the shift has a positive component along anchor → tag
    const away = [(TAG.x - 0.5), (TAG.y - 0.5)]
    expect((biased.x - TAG.x) * away[0] + (biased.y - TAG.y) * away[1]).toBeGreaterThan(0)
    // 「同样扣掉噪声，它在身后留下 21 cm 的残差」: 21 cm is the NOISE-FREE residual of this
    // same biased solve, which is the only ruler the sentence around it uses. The run's own
    // residuals are pinned in "the residual the lesson quotes is the run's own" below — the
    // lesson used to put the noise-free figure and 「干净的一轮只留下一微米」 where a reader
    // would read them as the thing on screen.
    expect((biased.residualM * 100).toFixed(0)).toBe('21')
    expect(uwbGeometry.quiz[0].explain).toContain('同样扣掉噪声')
    expect(exactFix(TAG.x, TAG.y).residualM).toBeLessThan(1e-6)
    // one number for the shift, everywhere it is quoted
    expect(uwbGeometry.quiz[0].q).toContain('0.316 m')
    expect(prose()).not.toContain('0.32 m')
  })

  it('GDOP and the ellipse do not move, and 30.9 cm is three and a half times their envelope', () => {
    // "GDOP and the ellipse do not move" / "That 30.9 cm is three and a half times the 8.9 cm
    //  envelope the geometry promises."
    const exact = exactFix(TAG.x, TAG.y)
    for (const f of fixes(0)) {
      expect(f.gdop.toFixed(2), `block ${f.block}`).toBe('1.05')
      expect(Math.abs(f.gdop - exact.gdop), `block ${f.block}`).toBeLessThan(0.002)
      expect([(f.ellipse.a * 100).toFixed(1), (f.ellipse.b * 100).toFixed(1)], `block ${f.block}`)
        .toEqual(['1.7', '1.4'])
    }
    const row = uwbFixRow(inspectorAfter(0, 1).position!, STRINGS.uwb)
    expect([row.gdop, row.ellipse, row.error]).toEqual(['1.05', '1.7 × 1.4 cm', '30.9 cm'])
    // the table says the clean row and the walled row carry the same GDOP and the same ellipse
    expect(cell(0, 1, 1)).toBe(cell(0, 0, 1))
    expect(cell(0, 1, 2)).toBe(cell(0, 0, 2))
    const envelope = 4 * SIGMA_R * exact.gdop
    expect((envelope * 100).toFixed(1)).toBe('8.9')
    // "three and a half times", to the decimal the phrase claims — not "nearly four"
    expect((fixErr(fixes(0)[0]) / envelope).toFixed(1)).toBe('3.5')
    expect(prose()).not.toContain('nearly four times')
  })

  /**
   * The envelope is DEFINED where it is used, added 2026-10-04.
   *
   * This lesson's whole discipline is that the reader re-derives every number
   * it prints, and the 「三倍半」 verdict rests entirely on 8.9 cm. The prose
   * used to name 「8.9 cm 包络」 with no definition anywhere: the reader had
   * GDOP 1.05, the 1σ ellipse 1.7 × 1.4 cm and σ_r 2.12 cm, and no combination
   * of those gives 8.9 — the factor of 4 lived only in this file. Both the
   * sentence and the quiz explanation now carry the recipe, and each factor is
   * checked against the solver rather than against itself.
   */
  it('the prose states the recipe for the 8.9 cm envelope, not just the answer', () => {
    const scale = 4
    const exact = exactFix(TAG.x, TAG.y)
    expect((SIGMA_R * 100).toFixed(2)).toBe('2.12')
    expect(exact.gdop.toFixed(4)).toBe('1.0488')
    // the 1σ scale of the fix, which is what the four multiplies: σ_r · GDOP, and the same
    // thing as the quadrature sum of the two ellipse semi-axes the table already prints
    expect((SIGMA_R * exact.gdop * 100).toFixed(2)).toBe('2.22')
    expect((Math.hypot(exact.ellipse.a, exact.ellipse.b) * 100).toFixed(2)).toBe('2.22')
    expect((scale * SIGMA_R * exact.gdop * 100).toFixed(1)).toBe('8.9')
    const text = prose()
    for (const owed of ['2.12', '1.0488', '2.22 cm', '8.9 cm', '四倍']) {
      expect(text, `the reader is given ${owed}`).toContain(owed)
    }
    // the quiz explanation is read on its own, so it carries the recipe too
    const explain = uwbGeometry.quiz[1].explain!
    expect(explain).toContain('4σ')
    expect(explain).toContain('4 × 2.12 × 1.0488 = 8.9 cm')
    // and the claim it is three and a half OF is the one this file computes
    expect(explain).toContain('三倍半')
    // 「上一课干净的七个块全在它以内」: the envelope is only worth quoting if the clean run
    // really sits under it, and this scene IS the previous lesson's base scene (pinned above
    // as `uwbGeometry.scenario()` === `uwbPositionScenario('base')`).
    const envelope = scale * SIGMA_R * exact.gdop
    const clean = fixes()
    expect(clean).toHaveLength(BLOCKS)
    for (const f of clean) expect(fixErr(f), `block ${f.block}`).toBeLessThan(envelope)
    expect(text).toContain('上一课干净的七个块全在它以内')
  })
})

describe('uwb-geometry · three anchors', () => {
  it('GDOP rises to 1.26, the ellipse grows to 2.2 × 1.5 cm and its axis swings to +61.5°', () => {
    // "Going deeper": "Drop the far corner and it grows to 2.2 × 1.5 cm, the ratio to 1.44, and
    //  the long axis swings to +61.5°, into the quadrant the anchor left empty."
    const three = exactFix(TAG.x, TAG.y, 'anchor-4')
    const four = exactFix(TAG.x, TAG.y)
    expect(three.gdop.toFixed(2)).toBe('1.26')
    expect(three.gdop / four.gdop).toBeGreaterThan(1.2)
    expect([(three.ellipse.a * 100).toFixed(1), (three.ellipse.b * 100).toFixed(1)]).toEqual(['2.2', '1.5'])
    expect((three.ellipse.a / three.ellipse.b).toFixed(2)).toBe('1.44')
    expect((four.ellipse.a / four.ellipse.b).toFixed(2)).toBe('1.25')
    expect((three.ellipse.thetaRad * 180 / Math.PI).toFixed(1)).toBe('61.5')
    expect((four.ellipse.thetaRad * 180 / Math.PI).toFixed(1)).toBe('-86.8')
    // "into the quadrant the anchor left empty": the deleted corner bears 36.0° from the tag,
    // and the new axis at 61.5° lies in the same quadrant — the lesson claims the quadrant,
    // not the bearing, because the three anchors that remain still shape the covariance and
    // leave 25.5° between the two.
    const removed = Math.atan2(7.5 - TAG.y, 9.5 - TAG.x) * 180 / Math.PI
    const axis = three.ellipse.thetaRad * 180 / Math.PI
    expect(removed.toFixed(1)).toBe('36.0')
    expect(Math.floor(removed / 90)).toBe(Math.floor(axis / 90))
    expect((axis - removed).toFixed(1)).toBe('25.5')
    expect(prose()).not.toContain('towards the corner')
    expect([cell(0, 2, 1), cell(0, 2, 2)]).toEqual(['1.26', '2.2 × 1.5 cm'])
  })

  it('the run keeps every fix within 3.1 cm, on three anchors and one spare measurement', () => {
    expect(fixes(1)).toHaveLength(BLOCKS)
    for (const f of fixes(1)) {
      expect(f.anchors, `block ${f.block}`).toHaveLength(3)
      expect(fixErr(f) * 100, `block ${f.block}`).toBeLessThan(3.1)
    }
    const envelope = 4 * SIGMA_R * exactFix(TAG.x, TAG.y, 'anchor-4').gdop
    expect((envelope * 100).toFixed(1)).toBe('10.7')
    for (const f of fixes(1)) expect(fixErr(f), `block ${f.block}`).toBeLessThan(envelope)
    expect(ofType(recs(1), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('block 0’s line ends in “3 anchors”, and the inspector’s ellipse is 2.2 × 1.5 cm', () => {
    // observe: "The line now ends in three anchors instead of four, the inspector’s ellipse is
    //  visibly bigger" / the table's third row: (3.98, 3.48) m, 2.7 cm
    const line = 'uwb-1 position (3.98, 3.48) m, true (4.00, 3.50), error 0.03 m, GDOP 1.26, 3 anchors'
    expect(fmtRecord(fixes(1)[0])).toBe(line)
    expect(line.endsWith('3 anchors')).toBe(true)
    const row = uwbFixRow(inspectorAfter(1, 1).position!, STRINGS.uwb)
    expect([row.gdop, row.ellipse, row.error]).toEqual(['1.26', '2.2 × 1.5 cm', '2.7 cm'])
    expect([cell(0, 2, 3), cell(0, 2, 4)]).toEqual(['(3.98, 3.48) m', '2.7 cm'])
  })

  it('standing under an anchor zeroes its Jacobian row and takes GDOP to 2.32', () => {
    // "standing directly under one of the three remaining anchors, the figure reaches 2.32" /
    // "Going deeper": "its Jacobian row is exactly zero and drops out of JᵀJ altogether,
    //  leaving two anchors 37.9° apart to carry the fix by themselves. With all four anchors
    //  the same spot is unremarkable — 1.24".
    const here: [number, number] = [9.5, 0.5]
    const kept = CORNERS.slice(0, 3) // the three-anchor variant: 1, 2 and 3
    expect(scenarioOf(1).nodes.map((n) => n.id)).toEqual([...kept.map(([id]) => id), 'uwb-1'])
    // the tag stands under anchor-2, so its row is the shadow of a vertical unit vector: zero
    const rows = kept.map(([, x, y]) => jRow(here[0], here[1], x, y))
    expect(rows.map((r) => Math.hypot(...r).toFixed(4))).toEqual(['0.9912', '0.0000', '0.9945'])
    expect(rows[1]).toEqual([0, 0])
    expect(rowLen(here[0], here[1], CORNERS[1][1], CORNERS[1][2])).toBe(0)
    // it therefore contributes nothing: the same GDOP with and without it, to every digit
    const withAll = gdopOfRows(rows)
    const withoutA2 = gdopOfRows([rows[0], rows[2]])
    expect(withAll).toBe(withoutA2)
    expect(withAll.toFixed(4)).toBe('2.3201')
    // and that is exactly what the solver reports on the variant's own geometry
    const solved = exactFix(here[0], here[1], 'anchor-4')
    expect(solved.gdop.toFixed(4)).toBe('2.3201')
    expect(solved.gdop.toFixed(2)).toBe('2.32')
    // "two anchors 37.9° apart": no two bearings coincide — the surviving pair is 37.9° apart
    const bearingTo = (ax: number, ay: number) => Math.atan2(ay - here[1], ax - here[0]) * 180 / Math.PI
    expect(Math.abs(bearingTo(0.5, 7.5) - bearingTo(0.5, 0.5)).toFixed(1)).toBe('37.9')
    expect(prose()).not.toContain('nearly coincide')
    // with all four anchors the same spot is unremarkable, still under the band's 1.26
    expect(exactFix(here[0], here[1]).gdop.toFixed(2)).toBe('1.24')
    expect(exactFix(here[0], here[1]).gdop).toBeLessThan(1.26)
  })
})

/**
 * The 2026-09-23 amendment ("mechanism before metaphor"): the lesson writes the
 * pricing out as a procedure, and each step is graded against `fixFrom` — reached
 * through `solvePosition`, which is the only way in — rather than against prose.
 * The worked-example table is the base scene's four corners at the tag's true
 * place, noise-free, so that every row is geometry and nothing else.
 */
describe('uwb-geometry · the procedure, against the solver', () => {
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbGeometry.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  const stepsText = (): string => steps().items.map((i) => i).join('\n')
  /** The four rows of J at the tag's true place, which is where the noise-free fit stops. */
  const jRows = (): [number, number][] => CORNERS.map(([, x, y]) => jRow(TAG.x, TAG.y, x, y))
  const normal = (rs: [number, number][]) => {
    let xx = 0, xy = 0, yy = 0
    for (const [ux, uy] of rs) { xx += ux * ux; xy += ux * uy; yy += uy * uy }
    return { xx, xy, yy, det: xx * yy - xy * xy }
  }
  const allAnchors = (): AnchorPos[] => CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
  const exactRanges = () => allAnchors().map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))

  it('is a steps block on the main path, not in `deeper`', () => {
    expect(uwbGeometry.numbers!.some((b) => b.kind === 'steps')).toBe(true)
    expect((uwbGeometry.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
  })

  it('step 2: a row is a direction — its length never exceeds one, and it carries no metres', () => {
    for (const [ux, uy] of jRows()) expect(Math.hypot(ux, uy)).toBeLessThanOrEqual(1)
    // rows built at one point are the same rows however long the ranges to it were: put the
    // solver at the tag's place with exact ranges, and the four rows are the table's own
    const f = exactFix(TAG.x, TAG.y)
    expect(Math.hypot(f.x - TAG.x, f.y - TAG.y)).toBeLessThan(1e-6)
    expect(Math.sqrt(normal(jRows()).yy / normal(jRows()).det + normal(jRows()).xx / normal(jRows()).det))
      .toBeCloseTo(f.gdop, 12)
  })

  it('steps 3 to 5: the worked table is JᵀJ, its inverse and the GDOP, in that order', () => {
    const r = jRows()
    const n = normal(r)
    expect(cellAscii(2, 0, 1)).toBe(`(${r[0][0].toFixed(4)}, ${r[0][1].toFixed(4)}) · (${r[1][0].toFixed(4)}, ${r[1][1].toFixed(4)})`)
    expect(cellAscii(2, 1, 1)).toBe(`(${r[2][0].toFixed(4)}, ${r[2][1].toFixed(4)}) · (${r[3][0].toFixed(4)}, ${r[3][1].toFixed(4)})`)
    expect(cellAscii(2, 2, 1)).toBe(`${n.xx.toFixed(4)}, ${n.xy.toFixed(4)}, ${n.yy.toFixed(4)} · det ${n.det.toFixed(4)}`)
    expect(cellAscii(2, 3, 1)).toBe(`${(n.yy / n.det).toFixed(4)}, ${(-n.xy / n.det).toFixed(4)}, ${(n.xx / n.det).toFixed(4)}`)
    const trace = n.yy / n.det + n.xx / n.det
    expect(cellAscii(2, 4, 1)).toBe(`√(${(n.yy / n.det).toFixed(4)} + ${(n.xx / n.det).toFixed(4)}) = √${trace.toFixed(4)} = ${Math.sqrt(trace).toFixed(4)}`)
    expect(Math.sqrt(trace)).toBeCloseTo(exactFix(TAG.x, TAG.y).gdop, 12)
    expect(exactFix(TAG.x, TAG.y).gdop.toFixed(4)).toBe('1.0488')
    // "Under 1e-9 there is no answer at all"
    expect(stepsText()).toContain('1e-9')
    const line: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: i, y: 4, z: ANCHOR_Z }))
    expect(solvePosition(line, line.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) })), TAG.z, SIGMA_R)).toBeNull()
  })

  it('step 6: the ellipse is σ_r² times the inverse — eigenvalues, angle and scale', () => {
    const f = exactFix(TAG.x, TAG.y)
    const n = normal(jRows())
    const s2 = SIGMA_R * SIGMA_R
    const sxx = s2 * (n.yy / n.det), sxy = s2 * (-n.xy / n.det), syy = s2 * (n.xx / n.det)
    const tr = sxx + syy, d2 = sxx * syy - sxy * sxy
    const sq = Math.sqrt(Math.max(tr * tr / 4 - d2, 0))
    expect(Math.sqrt(tr / 2 + sq)).toBeCloseTo(f.ellipse.a, 12)
    expect(Math.sqrt(tr / 2 - sq)).toBeCloseTo(f.ellipse.b, 12)
    expect(0.5 * Math.atan2(2 * sxy, sxx - syy)).toBeCloseTo(f.ellipse.thetaRad, 12)
    for (const n2 of [(f.ellipse.a * 100).toFixed(2), (f.ellipse.b * 100).toFixed(2),
      (f.ellipse.thetaRad * 180 / Math.PI).toFixed(1)]) {
      expect(cellAscii(2, 5, 1), n2).toContain(n2)
    }
    // "σ_r², the 2.12 cm range noise squared": the axes scale with σ_r and the GDOP does not
    expect(stepsText()).toContain('2.12 cm')
    expect((SIGMA_R * 100).toFixed(2)).toBe('2.12')
    const doubled = solvePosition(allAnchors(), exactRanges(), TAG.z, 2 * SIGMA_R)!
    expect(doubled.ellipse.a / f.ellipse.a).toBeCloseTo(2, 9)
    expect(doubled.gdop).toBeCloseTo(f.gdop, 12)
  })

  it('step 7: a wrong range moves the point and leaves every figure after it alone', () => {
    const ranges = exactRanges()
    const clean = solvePosition(allAnchors(), ranges, TAG.z, SIGMA_R)!
    const lied = solvePosition(
      allAnchors(),
      ranges.map((r, i) => (i === 0 ? { ...r, distM: r.distM + C_M_PER_NS * UWB_NLOS_NS.brick } : r)),
      TAG.z, SIGMA_R,
    )!
    expect(Math.hypot(lied.x - clean.x, lied.y - clean.y)).toBeGreaterThan(0.3)
    // the figures after step 1 are rebuilt at the moved point, so they stir in the last
    // digits — but not by anything the fix line or the inspector shows
    expect(lied.gdop.toFixed(2)).toBe(clean.gdop.toFixed(2))
    expect((lied.ellipse.a * 100).toFixed(1)).toBe((clean.ellipse.a * 100).toFixed(1))
    expect((lied.ellipse.b * 100).toFixed(1)).toBe((clean.ellipse.b * 100).toFixed(1))
    // what does move is the residual, the one figure that is built from the ranges. Both
    // figures here are noise-free, which is this step's point — the lesson's own centimetres
    // are the next test's.
    expect(clean.residualM).toBeLessThan(1e-6)
    expect((lied.residualM * 100).toFixed(0)).toBe('21')
  })

  it('the residual the lesson quotes is the run’s own, on both sides of the criterion', () => {
    // 「这次运行的七个块留下 19.85 到 22.25 cm 的残差，而上一课那干净的七个块留下的是
    //  0.78 到 1.98 cm——同一套锚点、同一个种子、同样 100 ps 的时间戳噪声」
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    // 「同一套锚点、同一个种子」: the two scenes differ by the brick stub and nothing else
    expect(uwbPositionScenario('wall').seed).toBe(uwbPositionScenario('base').seed)
    expect(uwbPositionScenario('wall').uwb).toEqual(uwbPositionScenario('base').uwb)
    const wall = roundResidualsCm(0).map(Number)
    const clean = roundResidualsCm().map(Number)
    expect([Math.min(...wall).toFixed(2), Math.max(...wall).toFixed(2)]).toEqual(['19.85', '22.25'])
    expect([Math.min(...clean).toFixed(2), Math.max(...clean).toFixed(2)]).toEqual(['0.78', '1.98'])
    expect(prose()).toContain('19.85 到 22.25 cm')
    expect(prose()).toContain('0.78 到 1.98 cm')
    // 「残差也从一厘米上下跳到了二十厘米上下」, to the words the picture uses
    expect(prose()).toContain('从一厘米上下跳到了二十厘米上下')
    for (const c of clean) expect(c, `clean ${c} cm`).toBeLessThan(2)
    for (const c of wall) { expect(c).toBeGreaterThan(19); expect(c).toBeLessThan(23) }
    // the criterion itself: the clean rounds are inside one σ_r, the walled ones four outside
    for (const c of clean) expect(c / 100, `clean ${c} cm`).toBeLessThan(SIGMA_R)
    for (const c of wall) expect(c / 100, `wall ${c} cm`).toBeGreaterThan(4 * SIGMA_R)
    // and the two retired claims, which no run of this scene ever produced
    expect(prose()).not.toContain('干净的一轮只留下一微米')
    expect(prose()).not.toContain('几乎没有')
  })
})

/**
 * The multipath limit, pinned both ways.
 *
 * The entry used to open 「介质里没有多径」 and justify it with `transmit` queueing one delivery
 * per receiver. `scheduleEchoes` falsified that: the medium does queue echoes, one per
 * (receiver, object), whenever the scenario carries a `scatterers` section. What survives is the
 * lesson's real point — an echo never reaches the solver, so no range, fix or quality byte in
 * this lesson can move because of one — and that is what the sentence now says.
 */
describe('uwb-geometry · the medium queues echoes; none of these three scenes has an object', () => {
  const text = uwbGeometry.limits.map((l) => l.text).join('\n')

  it('says where echoes come from and why they cannot reach the solver', () => {
    expect(text).toContain('scheduleEchoes')
    expect(text).toContain('只在场景写了 scatterers 一节时才排回波')
    expect(text).toContain('deliverEcho')
    expect(text).toContain('距离、定位与品质因数字节一个都不会变')
    // the half that was always true, and is why the lesson's wall is the gentlest kind of NLOS
    expect(text).toContain('真实房间里最常见的非视距是直射路径干脆没了')
  })

  it('no longer claims the medium has no multipath', () => {
    expect(text).not.toContain('介质里没有多径')
    expect(text).not.toContain('transmit 对每个接收机只排一次投递')
  })

  it('and all three of its scenes carry no scatterers section, so none produces an echo', () => {
    const scenes = [uwbGeometry.scenario, ...(uwbGeometry.variants ?? []).map((v) => v.scenario)]
    expect(scenes).toHaveLength(3)
    for (const build of scenes) expect(build().scatterers).toBeUndefined()
    for (const variant of [undefined, 0, 1]) {
      expect(ofType(recs(variant), 'UWB_ECHO')).toHaveLength(0)
    }
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above pins the solver against a figure typed on *this* side of the file. The
 * worked-example table is the exception and was already a read-back — each of its cells is
 * built from `jRows()` and compared with `toBe`, so an edited cell reddens it. The prose was
 * not: `expect(text).toContain('2.12')` says the figure appears *somewhere*, and 2.12 appears
 * in three places, so editing any one of them leaves the row green.
 *
 * Nothing new is measured here. Every assertion calls the same `exactFix`, `fixes`,
 * `tagRanges`, `roundResidualsCm`, `jRow`, `gdopOfRows`, `gapsAt` and `inspectorAfter` the
 * tests above call — the figure is parsed **out of the lesson** instead of being written down
 * beside the measurement.
 */
describe('uwb-geometry · every figure the prose prints, read back out of it', () => {
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
  const NUMS = blockText(uwbGeometry.numbers)
  const DEEP = blockText(uwbGeometry.deeper)
  const LIMITS = blockText(uwbGeometry.limits)
  const SRC = blockText(uwbGeometry.sources)
  const TRY = blockText(uwbGeometry.tryThis)
  const QUIZ = blockText(uwbGeometry.quiz)

  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`)
      .not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const normalOf = (rs: [number, number][]) => {
    let xx = 0, xy = 0, yy = 0
    for (const [ux, uy] of rs) { xx += ux * ux; xy += ux * uy; yy += uy * uy }
    return { xx, xy, yy, det: xx * yy - xy * xy }
  }
  /** N unit rows spread evenly in bearing — the ideal layout the lesson's algebra is about. */
  const evenRows = (n: number): [number, number][] =>
    Array.from({ length: n }, (_x, i) =>
      [Math.cos((2 * Math.PI * i) / n), Math.sin((2 * Math.PI * i) / n)] as [number, number])
  const BIAS_M = UWB_NLOS_NS.brick * C_M_PER_NS
  /** The noise-free solve with the brick bias on anchor-1 alone — the shift the lesson quotes. */
  const biasedFix = (): Fix => {
    const anchors: AnchorPos[] = CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const f = solvePosition(anchors, anchors.map((a) => ({
      id: a.id,
      distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z)
        + (a.id === 'anchor-1' ? BIAS_M : 0),
    })), TAG.z, SIGMA_R)
    expect(f, 'the biased solve converges').not.toBeNull()
    return f!
  }

  it('the two GDOP figures of the formula, and the algebra `deeper` does them with', () => {
    same(raw(NUMS, /GDOP = √trace\(\(JᵀJ\)⁻¹\) = ([\d.]+)/, 'the formula')[0]!,
      exactFix(TAG.x, TAG.y).gdop, 'the GDOP this layout charges at the tag')
    /*
     * "JᵀJ is exactly (N/2)·I, the trace of its inverse is 4/N, and GDOP is 2/√N — 1.00 at
     * four anchors." Three divisors and a multiplier, all read off the lesson and all fed
     * back through rows that really are spread evenly, at three different N.
     */
    const [half] = figs(DEEP, /JᵀJ 恰好等于 \(N\/(\d)\)·I/, '`deeper` on the ideal JᵀJ')
    const [traceNum] = figs(DEEP, /其逆的迹为 (\d)\/N/, '`deeper` on the trace of its inverse')
    const [gdopNum] = figs(DEEP, /于是 GDOP = (\d)\/√N/, '`deeper` on the GDOP that gives')
    for (const n of [4, 6, 8]) {
      const q = normalOf(evenRows(n))
      expect(q.xx, `N = ${n}: JᵀJ really is (N/${half}) on the diagonal`).toBeCloseTo(n / half!, 9)
      expect(q.yy, `N = ${n}: on both diagonal entries`).toBeCloseTo(n / half!, 9)
      expect(q.xy, `N = ${n}: and nothing off it`).toBeCloseTo(0, 9)
      expect(q.yy / q.det + q.xx / q.det, `N = ${n}: the trace of its inverse`)
        .toBeCloseTo(traceNum! / n, 9)
      expect(gdopOfRows(evenRows(n)), `N = ${n}: and the GDOP`)
        .toBeCloseTo(gdopNum! / Math.sqrt(n), 9)
    }
    // "1.00 at four anchors" — in the formula's note, in `deeper` and in the third answer
    for (const [text, re, what] of [
      [NUMS, /GDOP 会恰好是 ([\d.]+)/, 'the formula’s note'],
      [DEEP, /为什么均匀分布的锚点恰好给出 ([\d.]+)/, '`deeper`’s own heading'],
      [DEEP, /四个锚点时是 ([\d.]+)。本场景读作/, '`deeper`, after the algebra'],
      [QUIZ, /四个这样的锚点恰好给出 ([\d.]+)/, 'the third answer'],
      [QUIZ, /这里它比 ([\d.]+) 略高/, 'the third explanation'],
    ] as const) {
      same(raw(text, re, what)[0]!, gdopOfRows(evenRows(CORNERS.length)),
        `${what}: what four evenly spread anchors would give`)
    }
    /*
     * And what this scene reads instead — the figure on the right of the same sentence. The
     * sweep of 2026-10-13 planted it with the suite green: the read above captured the ideal
     * 1.00 on its left and stopped at the full stop.
     */
    const [here] = raw(DEEP, /本场景读作 ([\d.]+)，原因有二/,
      '`deeper` on what this scene reads instead')
    same(here!, exactFix(TAG.x, TAG.y).gdop, 'the GDOP this layout really charges')
    expect(val(here!), 'which is worse than the ideal, as the sentence says')
      .toBeGreaterThan(gdopOfRows(evenRows(CORNERS.length)))
    /*
     * And the whole number the third question rounds it to. 「接近 1」 is a claim with a width:
     * nowhere in the room does the figure round to anything else, which is what makes the
     * question answerable and a planted 2 wrong.
     */
    const [near] = figs(QUIZ, /GDOP 为什么接近 (\d)？/, 'the third question')
    expect(Math.round(gdopOfRows(evenRows(CORNERS.length))),
      'the whole number the ideal rounds to').toBe(near)
    const band = roomBand()
    expect(Math.round(band.lo), 'and so does the whole room, at its lowest').toBe(near)
    expect(Math.round(band.hi), 'and at its highest').toBe(near)
  })

  it('the three-scenes table: every cell of every row, against that scene’s own first fix', () => {
    const variants = [undefined, 0, 1]
    table(0).rows.forEach((_row, i) => {
      const v = variants[i]
      const f = fixes(v)[0]
      expect(f, `row ${i}: that scene produced a first fix`).toBeDefined()
      same(cell(0, i, 1), f!.gdop, `row ${i}: the GDOP it prints`)
      const [a, b] = raw(cell(0, i, 2), /([\d.]+) × ([\d.]+) cm/, `row ${i}: the ellipse cell`)
      same(a!, f!.ellipse.a * 100, `row ${i}: the long semi-axis`)
      same(b!, f!.ellipse.b * 100, `row ${i}: and the short one`)
      const [x, y] = raw(cell(0, i, 3), /\(([\d.]+), ([\d.]+)\) m/, `row ${i}: the estimate cell`)
      same(x!, f!.x, `row ${i}: the x the solver gave`)
      same(y!, f!.y, `row ${i}: and the y`)
      same(raw(cell(0, i, 4), /([\d.]+) cm/, `row ${i}: the error cell`)[0]!,
        fixErr(f!) * 100, `row ${i}: and how far off it was`)
      // the same four figures are what the inspector shows for that run
      const row = uwbFixRow(inspectorAfter(v, 1).position!, STRINGS.uwb)
      expect([row.gdop, row.ellipse, row.estimate, row.error],
        `row ${i}: the inspector prints the same four`)
        .toEqual([cell(0, i, 1), cell(0, i, 2), cell(0, i, 3), cell(0, i, 4)])
    })
    // "the walled row carries the same GDOP and the same ellipse as the clean one"
    expect([cell(0, 1, 1), cell(0, 1, 2)], 'the wall moved neither')
      .toEqual([cell(0, 0, 1), cell(0, 0, 2)])
  })

  it('the band the four corners hold the room inside, and the spot that breaks it', () => {
    const band = roomBand()
    const [lo, hi] = raw(NUMS, /这个数都落在 ([\d.]+) 与 ([\d.]+) 之间/,
      '`numbers` on the band the room is held inside')
    same(lo!, band.lo, 'the lowest GDOP the panel prints anywhere in the room')
    same(hi!, band.hi, 'and the highest')
    // the experiment repeats the band and names one corner of it
    const [tLo, tHi, cx, cy, corner] = raw(TRY, /都在 ([\d.]+) 与 ([\d.]+) 之间，连 \((\d), (\d)\) 那个角落也只升到 ([\d.]+)/,
      '`tryThis` on the same band')
    same(tLo!, band.lo, '`tryThis`: the same floor')
    same(tHi!, band.hi, '`tryThis`: the same ceiling')
    same(corner!, exactFix(val(cx!), val(cy!)).gdop, '`tryThis`: and that corner’s own figure')
    expect(val(corner!), 'which is inside the band the sentence just gave')
      .toBeLessThanOrEqual(val(tHi!))
    // "drop a corner and the floor goes with it: standing under one of the three it reaches 2.32"
    const [here] = raw(NUMS, /它会达到 ([\d.]+)。/, '`numbers` on the worst spot of three anchors')
    const [ax, ay] = raw(DEEP, /把手机拖到 \(([\d.]+), ([\d.]+)\) 的锚点上/,
      '`deeper` on which anchor it is')
    const under = exactFix(val(ax!), val(ay!), 'anchor-4')
    same(here!, under.gdop, 'the GDOP of standing under that anchor on three')
    expect(val(here!), 'which is outside the band four corners hold').toBeGreaterThan(band.hi)
    // `deeper` prints the same figure to four places, and the four-anchor figure beside it
    same(raw(DEEP, /GDOP 会达到 ([\d.]+)。/, '`deeper` on the same spot')[0]!, under.gdop,
      'the same spot, to four places')
    same(raw(DEEP, /同一个位置平平无奇——([\d.]+)，仍落在/, '`deeper` with all four anchors')[0]!,
      exactFix(val(ax!), val(ay!)).gdop, 'that spot with the fourth anchor back')
    expect(exactFix(val(ax!), val(ay!)).gdop, 'and it is back inside the band')
      .toBeLessThan(band.hi)
    // "two anchors 37.9° apart carry the fix by themselves"
    const kept = CORNERS.slice(0, 3)
    const rows = kept.map(([, x, y]) => jRow(val(ax!), val(ay!), x, y))
    const zeroed = rows.filter((r) => Math.hypot(...r) === 0)
    expect(zeroed, 'one row is exactly zero: the anchor overhead').toHaveLength(1)
    const live = kept.filter((_c, i) => Math.hypot(...rows[i]!) > 0)
    const bearing = (ax2: number, ay2: number): number =>
      (Math.atan2(ay2 - val(ay!), ax2 - val(ax!)) * 180) / Math.PI
    same(raw(DEEP, /只剩两个相隔 ([\d.]+)° 的锚点/, '`deeper` on the surviving pair')[0]!,
      Math.abs(bearing(live[0]![1], live[0]![2]) - bearing(live[1]![1], live[1]![2])),
      'how far apart the two live bearings are')
  })

  it('the brick wall: the delay, the flight distance it is, and the range it lengthens', () => {
    // "A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight"
    const [ns, m] = raw(NUMS, /首径（first path）迟到 ([\d.]+) ns，折合 ([\d.]+) m 的飞行距离/,
      '`numbers` on the cost of one wall')
    same(ns!, UWB_NLOS_NS.brick, 'the delay channel.ts gives brick')
    same(m!, UWB_NLOS_NS.brick * C_M_PER_NS, 'and the flight distance it is')
    // the same three materials, in `sources` and in `limits`
    for (const [text, re, what] of [
      [SRC, /砖墙 ([\d.]+) ns、石膏板 ([\d.]+) ns、玻璃 ([\d.]+) ns/, '`sources`'],
      [LIMITS, /（砖 ([\d.]+) ns、石膏板 ([\d.]+)、玻璃 ([\d.]+)）/, '`limits`'],
    ] as const) {
      const [brick, drywall, glass] = raw(text, re, `${what} on the material table`)
      expect([val(brick!), val(drywall!), val(glass!)], `${what}: UWB_NLOS_NS, value for value`)
        .toEqual([UWB_NLOS_NS.brick, UWB_NLOS_NS.drywall, UWB_NLOS_NS.glass])
    }
    same(raw(LIMITS, /永远正好把距离拉长 ([\d.]+) m/, '`limits` on the constant it is')[0]!,
      UWB_NLOS_NS.brick * C_M_PER_NS, 'the one distance a brick wall ever adds here')
    /*
     * 「GDOP 与 1σ 椭圆都是仿真器自己的模型取值」 — the multiple is not decoration: the solver's
     * semi-axes are exactly that many standard deviations of Σ = σ_r²(JᵀJ)⁻¹, so a planted 2
     * reddens this. (The sweep of 2026-10-13 planted it with the suite green.)
     */
    const [sigmas] = figs(SRC, /GDOP 与 (\d)σ 椭圆都是仿真器自己的/,
      '`sources` on what the model owns')
    const fx = exactFix(TAG.x, TAG.y)
    const nq = normalOf(CORNERS.map(([, x, y]) => jRow(TAG.x, TAG.y, x, y)))
    const s2q = SIGMA_R * SIGMA_R
    const qxx = (s2q * nq.yy) / nq.det
    const qxy = (-s2q * nq.xy) / nq.det
    const qyy = (s2q * nq.xx) / nq.det
    const trq = qxx + qyy
    const detq = qxx * qyy - qxy * qxy
    const lamMax = trq / 2 + Math.sqrt(Math.max((trq * trq) / 4 - detq, 0))
    expect(sigmas! * Math.sqrt(lamMax), 'the long semi-axis is that many standard deviations')
      .toBeCloseTo(fx.ellipse.a, 12)
    // "the blocked range reads 5.33 m against a true 4.76 m in the first block"
    const blocked = tagRanges(0).filter((r) => r.peer === 'anchor-1')
    const [read, truth] = raw(NUMS, /这条被挡住的距离报出 ([\d.]+) m，真值是 ([\d.]+) m/,
      '`numbers` on the first block’s blocked range')
    same(read!, blocked[0]!.distM, 'what that range measured')
    same(truth!, blocked[0]!.trueDistM, 'and what it really was')
    // "over seven blocks the bias averages 59.4 cm — within a third of a σ_r of the ideal"
    const [of, bias] = raw(NUMS, /(.)个块平均下来，偏差是 ([\d.]+) cm/,
      '`numbers` on the mean bias')
    expect(blocked, 'the blocks that range was measured in').toHaveLength(zhNum(of!))
    const mean = blocked.reduce((s, r) => s + (r.distM - r.trueDistM), 0) / blocked.length
    same(bias!, mean * 100, 'the bias those blocks averaged')
    expect(Math.abs(mean - BIAS_M), 'which is within a third of a σ_r of the ideal figure')
      .toBeLessThan(SIGMA_R / 3)
    // the FoM table: that range's own error, and "the other three, under 1.4 cm"
    same(raw(cell(1, 0, 1), /([\d.]+) cm/, 'the FoM table’s error cell')[0]!,
      (blocked[0]!.distM - blocked[0]!.trueDistM) * 100, 'that range’s own error')
    const [under] = raw(cell(1, 1, 1), /不到 ([\d.]+) cm/, 'the FoM table’s other-three cell')
    const clean = tagRanges(0).filter((r) => r.peer !== 'anchor-1' && r.block === 0)
    expect(clean, 'the three honest ranges of that block').toHaveLength(CORNERS.length - 1)
    for (const r of clean) {
      expect(Math.abs(r.distM - r.trueDistM) * 100, `${r.peer}: inside that figure`)
        .toBeLessThan(val(under!))
    }
    // and the figure is the tightest tenth of a centimetre that holds them
    const worst = Math.max(...clean.map((r) => Math.abs(r.distM - r.trueDistM) * 100))
    expect(val(under!), 'and no looser than it has to be')
      .toBeLessThanOrEqual(Math.ceil(worst * 10) / 10)
  })

  it('the quality byte, read back out of its own two numbers', () => {
    const [nlosHex, nlosPct, nlosNs] = raw(cell(1, 0, 2),
      /0x([0-9a-f]+) — (\d+) % within (\d+) ns/, 'the FoM cell of the blocked range')
    expect(parseInt(nlosHex!, 16), 'the byte ranging.ts returns for an obstructed path')
      .toBe(FOM_NLOS)
    expect(`${nlosPct} % within ${nlosNs} ns`, 'and the wording phy.ts gives that byte')
      .toBe(fomText(FOM_NLOS))
    const [losHex, losPct, losNs] = raw(cell(1, 1, 2),
      /0x([0-9a-f]+) — (\d+) % within ([\d.]+) ns/, 'the FoM cell of the other three')
    expect(parseInt(losHex!, 16), 'the byte it returns for a clean one').toBe(FOM_LOS)
    expect(`${losPct} % within ${losNs} ns`, 'and its wording').toBe(fomText(FOM_LOS))
    expect(val(losNs!), 'the clean byte promises the tighter window')
      .toBeLessThan(val(nlosNs!))
    expect(val(losPct!), 'and the higher confidence').toBeGreaterThan(val(nlosPct!))
    // `limits` names the same two bytes as the only two values the function has
    const [onHex, offHex] = raw(LIMITS, /为真时返回 0x([0-9a-f]+)，否则 0x([0-9a-f]+)/,
      '`limits` on the two values fomFor has')
    expect([parseInt(onHex!, 16), parseInt(offHex!, 16)], 'the two bytes, in that order')
      .toEqual([FOM_NLOS, FOM_LOS])
    const seen = new Set(tagRanges(0).map((r) => r.fom))
    expect([...seen].sort((a, b) => a - b), 'and the run only ever carries those two')
      .toEqual([FOM_LOS, FOM_NLOS].sort((a, b) => a - b))
  })

  it('what the wall did to the fix: the shift, the share of the bias, and the residuals', () => {
    const f = fixes(0)[0]!
    const [moved, notThis] = raw(NUMS, /而定位只挪了 ([\d.]+) cm，不是 (\d+)。/,
      '`numbers` on the shift')
    same(moved!, fixErr(f) * 100, 'how far the fix moved')
    expect(val(notThis!), 'against the bias it did not move by')
      .toBe(Math.round(BIAS_M * 100))
    const biased = biasedFix()
    const shift = Math.hypot(biased.x - TAG.x, biased.y - TAG.y)
    const [noiseFree, share] = raw(NUMS, /位移是 ([\d.]+) m，即偏差的 (\d+) %/,
      '`numbers` on the noise-free shift')
    same(noiseFree!, shift, 'the shift with no noise at all')
    same(share!, (shift / BIAS_M) * 100, 'and that shift as a share of the bias')
    // the first question and its explanation print the same two figures
    const [qBias, qShift] = raw(QUIZ, /一条长了 ([\d.]+) m，可扣掉噪声后定位只移动了 ([\d.]+) m/,
      'the first question')
    expect(val(qBias!), 'the bias, to the two places the question gives it')
      .toBe(Number(BIAS_M.toFixed(2)))
    same(qShift!, shift, 'and the shift it moved instead')
    same(raw(QUIZ, /为什么不是 ([\d.]+) m？/, 'the first question’s own closing')[0]!,
      BIAS_M, 'the figure the question asks why it is not')
    same(raw(QUIZ, /位移是偏差的 (\d+) %/, 'the first explanation')[0]!,
      (shift / BIAS_M) * 100, 'the same share, in the explanation')
    same(raw(QUIZ, /它在身后留下 (\d+) cm 的残差/, 'the first explanation’s residual')[0]!,
      biased.residualM * 100, 'the residual that same noise-free solve leaves')
    // "19.85 to 22.25 cm this run, 0.78 to 1.98 cm the clean one — same anchors, same seed,
    //  the same 100 ps of timestamp noise"
    const [wLo, wHi, cLo, cHi, ps] = raw(NUMS,
      /七个块留下 ([\d.]+) 到 ([\d.]+) cm 的残差，而上一课那干净的七个块留下的是 ([\d.]+) 到 ([\d.]+) cm——[\s\S]*?同样 (\d+) ps 的时间戳噪声/,
      '`numbers` on the residuals')
    const wall = roundResidualsCm(0).map(Number)
    const cleanR = roundResidualsCm().map(Number)
    same(wLo!, Math.min(...wall), 'the smallest residual the walled run leaves')
    same(wHi!, Math.max(...wall), 'and the largest')
    same(cLo!, Math.min(...cleanR), 'the smallest the clean run leaves')
    same(cHi!, Math.max(...cleanR), 'and its largest')
    expect(val(ps!), 'the timestamp noise both runs use')
      .toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(val(cHi!), 'the clean run’s worst is inside the walled run’s best')
      .toBeLessThan(val(wLo!))
  })

  it('the envelope the geometry promises, each factor read out of the sentence that uses it', () => {
    const exact = exactFix(TAG.x, TAG.y)
    const [measured, sigma, gdop, oneSigma] = raw(NUMS,
      /来量这 ([\d.]+) cm：σ_r 乘 GDOP 就是定位误差的 1σ 尺度，([\d.]+) × ([\d.]+) = ([\d.]+) cm/,
      '`numbers` on the envelope')
    same(measured!, fixErr(fixes(0)[0]!) * 100, 'the error the sentence is measuring')
    same(sigma!, SIGMA_R * 100, 'the range noise the solver was given')
    same(gdop!, exact.gdop, 'the GDOP of this layout, to four places')
    same(oneSigma!, SIGMA_R * exact.gdop * 100, 'and the 1σ scale those two give')
    // the same 1σ scale is the quadrature sum of the two semi-axes the table already prints
    same(oneSigma!, Math.hypot(exact.ellipse.a, exact.ellipse.b) * 100,
      'which is the ellipse the table prints, in one number')
    const [times, envelope] = raw(NUMS, /取(.)倍得 ([\d.]+) cm/, '`numbers` on the envelope itself')
    same(envelope!, zhNum(times!) * SIGMA_R * exact.gdop * 100, 'the envelope that multiple gives')
    const [over] = raw(NUMS, /([\d.]+) cm 是它的(?:.)倍半。/, '`numbers` on the verdict')
    same(over!, fixErr(fixes(0)[0]!) * 100, 'the error, once more')
    const [howMany] = raw(NUMS, /cm 是它的(.)倍半。/, '`numbers` on how many times over it is')
    expect((fixErr(fixes(0)[0]!) / (zhNum(times!) * SIGMA_R * exact.gdop)).toFixed(1),
      'and the error really is that many times the envelope')
      .toBe(`${zhNum(howMany!)}.5`)
    // "the clean seven blocks of the previous lesson are all inside it"
    const env = zhNum(times!) * SIGMA_R * exact.gdop
    for (const g of fixes()) expect(fixErr(g), `block ${g.block} is inside it`).toBeLessThan(env)
    // the second explanation writes the whole recipe out a second time
    const [qN, qRecipe, qAgain, qSig, qG, qEnv] = raw(QUIZ,
      /(\d)σ 包络（(\d) × σ_r × GDOP = (\d) × ([\d.]+) × ([\d.]+) = ([\d.]+) cm）/,
      'the second explanation')
    expect([qN, qRecipe, qAgain], 'the same multiple, all three times it is written')
      .toEqual([String(zhNum(times!)), String(zhNum(times!)), String(zhNum(times!))])
    same(qSig!, SIGMA_R * 100, 'the same range noise')
    same(qG!, exact.gdop, 'the same GDOP')
    same(qEnv!, zhNum(times!) * SIGMA_R * exact.gdop * 100, 'and the same envelope')
    same(raw(QUIZ, /有墙的场景里定位偏了 (\d+) cm/, 'the second question')[0]!,
      fixErr(fixes(0)[0]!) * 100, 'the error the question opens with')
  })

  it('the procedure: the determinant floor, σ_r² and the angle of the long axis', () => {
    const steps = uwbGeometry.numbers!
      .find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    const text = steps.items.join('\n')
    same(raw(text, /也就是 ([\d.]+) cm 测距噪声的平方/, 'step 6 on σ_r')[0]!, SIGMA_R * 100,
      'the range noise the solver squares')
    /*
     * 「小于 1e-9 就根本没有答案」 — `position.ts` now exports the floor, which is the only way
     * this figure can be read back: the solver applies it at **every Gauss-Newton iterate**, so
     * bisecting a near-collinear layout for the determinant at which it starts answering
     * measures the iterate's wander and not the constant (it lands around 0.05).
     */
    const [mantissa, exp] = raw(text, /小于 (\d+)e-(\d+) 就根本没有答案/,
      'step 3 on the determinant floor')
    expect(val(mantissa!) * 10 ** -val(exp!), 'the floor position.ts applies').toBe(MIN_DET)
    /*
     * And the sentence's claim as behaviour: three anchors on a line cannot fix a point. The
     * determinant that goes under the floor is NOT the one at the truth — the rows there are
     * bearings to three different places and JᵀJ is a healthy 0.055. It is an iterate's: the
     * fit has nothing to pin it along the line, walks off, and crosses the floor out there.
     */
    const line: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: i, y: 4, z: ANCHOR_Z }))
    const ranges = line.map((a) =>
      ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    expect(solvePosition(line, ranges, TAG.z, SIGMA_R), 'the solver has no answer').toBeNull()
    expect(normalOf(line.map((a) => jRow(TAG.x, TAG.y, a.x, a.y))).det,
      'though at the truth itself JᵀJ is nowhere near the floor').toBeGreaterThan(MIN_DET)
    // "½·atan2(2Σ_xy, Σ_xx − Σ_yy) is the tilt of its long axis"
    const [arity, twice] = figs(text, /½·atan(\d)\((\d)Σ_xy, Σ_xx − Σ_yy\)/,
      'step 6 on the angle')
    const fn = (Math as unknown as Record<string, unknown>)[`atan${arity}`]
    expect(typeof fn, 'the lesson names a function that exists').toBe('function')
    expect(fn, 'and it is the two-argument arctangent the solver uses').toBe(Math.atan2)
    const f = exactFix(TAG.x, TAG.y)
    const n = normalOf(CORNERS.map(([, x, y]) => jRow(TAG.x, TAG.y, x, y)))
    const s2 = SIGMA_R * SIGMA_R
    const sxx = (s2 * n.yy) / n.det
    const sxy = (-s2 * n.xy) / n.det
    const syy = (s2 * n.xx) / n.det
    expect(0.5 * Math.atan2(twice! * sxy, sxx - syy),
      'and that multiplier gives the solver’s own tilt').toBeCloseTo(f.ellipse.thetaRad, 12)
  })

  it('`deeper`: why this room misses 1.00, and what the ellipse does when a corner goes', () => {
    // "the anchors are at 2.20 m and the phone at 1.00 m, so every row is the horizontal
    //  shadow of a slanted unit vector, only 0.968 to 0.985 long"
    const [aZ, tZ, shortest, longest] = raw(DEEP,
      /锚点在 ([\d.]+) m 而手机在 ([\d.]+) m[\s\S]*?长度只有 ([\d.]+) 到 ([\d.]+)/,
      '`deeper` on the slanted rows')
    same(aZ!, ANCHOR_Z, 'the height the anchors hang at')
    same(tZ!, TAG.z, 'and the height the phone is held at')
    const lens = CORNERS.map(([, x, y]) => rowLen(TAG.x, TAG.y, x, y))
    same(shortest!, Math.min(...lens), 'the shortest row this layout gives')
    same(longest!, Math.max(...lens), 'and the longest')
    expect(Math.max(...lens), 'all of them short of a full unit vector').toBeLessThan(1)
    // "the four anchors span 9 × 7 m, and from the phone the bearings are 64.6°, 89.4°,
    //  95.2° and 110.8° apart"
    const [w, h] = figs(DEEP, /四个锚点张成 (\d+) × (\d+) m/, '`deeper` on the span')
    expect(w, 'the width the four corners span')
      .toBe(Math.max(...CORNERS.map(([, x]) => x)) - Math.min(...CORNERS.map(([, x]) => x)))
    expect(h, 'and the height')
      .toBe(Math.max(...CORNERS.map(([, , y]) => y)) - Math.min(...CORNERS.map(([, , y]) => y)))
    expect(w, 'a rectangle, not a square — which is the sentence’s point').not.toBe(h)
    const gaps = figs(DEEP, /方位角间隔是 ([\d.]+)°、([\d.]+)°、([\d.]+)° 与 ([\d.]+)°/,
      '`deeper` on the four bearings')
    expect([...gaps].sort((a, b) => a - b), 'the gaps this layout really leaves')
      .toEqual(gapsAt(TAG.x, TAG.y, CORNERS.map(([id]) => id)).map(Number)
        .sort((a, b) => a - b))
    // "the room’s centre is no better: 1.0544 against 1.0488"
    const [centre, atTag] = raw(DEEP, /房间正中还要更差一点：([\d.]+) 对 ([\d.]+)。/,
      '`deeper` on the room’s centre')
    const mid = { x: (Math.min(...CORNERS.map(([, x]) => x)) + Math.max(...CORNERS.map(([, x]) => x))) / 2,
      y: (Math.min(...CORNERS.map(([, , y]) => y)) + Math.max(...CORNERS.map(([, , y]) => y))) / 2 }
    same(centre!, exactFix(mid.x, mid.y).gdop, 'the GDOP at the middle of the four corners')
    same(atTag!, exactFix(TAG.x, TAG.y).gdop, 'against the GDOP where the phone stands')
    expect(val(centre!), 'and the middle really is the worse of the two')
      .toBeGreaterThan(val(atTag!))
    // the ellipse, axis by axis, on four anchors and on three
    const four = exactFix(TAG.x, TAG.y)
    const three = exactFix(TAG.x, TAG.y, 'anchor-4')
    const [a4, b4, tilt4, ratio4] = raw(DEEP,
      /四个锚点时椭圆是 ([\d.]+) × ([\d.]+) cm[\s\S]*?与 \+x 轴成 −([\d.]+)°，长短轴之比 ([\d.]+)/,
      '`deeper` on the four-anchor ellipse')
    same(a4!, four.ellipse.a * 100, 'its long semi-axis')
    same(b4!, four.ellipse.b * 100, 'its short one')
    same(tilt4!, -((four.ellipse.thetaRad * 180) / Math.PI), 'the tilt of its long axis')
    same(ratio4!, four.ellipse.a / four.ellipse.b, 'and the ratio between the two')
    const [scale, drawn] = raw(DEEP, /场景把它放大(.)倍来画——长半轴 (\d+) cm/,
      '`deeper` on how the scene draws it')
    expect(zhNum(scale!), 'the factor scene.ts draws it at').toBe(ELLIPSE_DRAW_SCALE)
    expect(val(drawn!), 'and the semi-axis that gives on screen')
      .toBe(Number((four.ellipse.a * ELLIPSE_DRAW_SCALE * 100).toFixed(0)))
    const [aPanel, bPanel] = raw(DEEP, /检视面板照实印出 ([\d.]+) × ([\d.]+) cm/,
      '`deeper` on what the inspector prints instead')
    expect(`${aPanel} × ${bPanel} cm`, 'the inspector prints the true size')
      .toBe(uwbFixRow(inspectorAfter(undefined, 1).position!, STRINGS.uwb).ellipse)
    const [a3, b3, ratio3, tilt3] = raw(DEEP,
      /它增大到 ([\d.]+) × ([\d.]+) cm，比值变成 ([\d.]+)，长轴摆到 \+([\d.]+)°/,
      '`deeper` on the three-anchor ellipse')
    same(a3!, three.ellipse.a * 100, 'its long semi-axis')
    same(b3!, three.ellipse.b * 100, 'its short one')
    same(ratio3!, three.ellipse.a / three.ellipse.b, 'the ratio between them')
    same(tilt3!, (three.ellipse.thetaRad * 180) / Math.PI, 'and where its long axis swung to')
    expect(three.ellipse.a, 'it really did grow').toBeGreaterThan(four.ellipse.a)
    expect(three.ellipse.a / three.ellipse.b, 'and really did stretch')
      .toBeGreaterThan(four.ellipse.a / four.ellipse.b)
  })
})
