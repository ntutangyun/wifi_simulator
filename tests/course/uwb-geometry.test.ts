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
import { rangeSigmaM, solvePosition, type AnchorPos, type Fix } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'
import { uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

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
// not see it; the window below is what `lessonBudget` reports, and the kit enforces it.)
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
    expect(uwbGeometry.module).toBe(12)
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
    let lo = Infinity
    let hi = 0
    for (let x = 0; x <= 10.0001; x += 0.05) {
      for (let y = 0; y <= 8.0001; y += 0.05) {
        const g = exactFix(x, y).gdop
        lo = Math.min(lo, g)
        hi = Math.max(hi, g)
      }
    }
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
    // the inspector's range table, in the reader's language
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
    // "It leaves a 21 cm residual where a clean round leaves a micrometre"
    expect((biased.residualM * 100).toFixed(0)).toBe('21')
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
    // what does move is the residual, the one figure that is built from the ranges
    expect(clean.residualM).toBeLessThan(1e-6)
    expect((lied.residualM * 100).toFixed(0)).toBe('21')
  })
})
