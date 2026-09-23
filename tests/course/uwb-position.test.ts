/**
 * Every empirical claim in "From four ranges to a point", measured against the
 * lesson's own scenario. The solver, the range sigma and the inspector rows come
 * from the engine's own exports (src/uwb/position.ts, src/uwb/phy.ts,
 * src/uwb/ui/rows.ts) rather than being re-typed here, and the inspector rows
 * are replayed through the player's own reducer (initViewState + applyRecord),
 * so they are the panel's by construction.
 *
 * The lesson was split by the readability programme: everything about the
 * anchors' geometry — GDOP, the error ellipse, the brick wall and the
 * three-anchor layout — moved to `uwb-geometry`, and so did its pins
 * (tests/course/uwb-geometry.test.ts). The scenario builder stays here, with
 * the checks on all three of its scenes, because `uwb-geometry` calls it.
 */
import { describe, it, expect } from 'vitest'
import { uwbPosition, uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { uwbIntro } from '../../src/course/uwb/uwb-intro'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { wallsCrossed } from '../../src/engine/propagation'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { rangeSigmaM, solvePosition, type AnchorPos, type Fix } from '../../src/uwb/position'
import { uwbFixRow } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven ranging blocks: enough that "seven blocks" and the error list are a sample, not an anecdote. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = { x: 4, y: 3.5, z: 1.0 }
const ANCHOR_Z = 2.2
/** The four corners the lesson installs, in the order the scenario lists them. */
const CORNERS: [string, number, number][] = [
  ['anchor-1', 0.5, 0.5], ['anchor-2', 9.5, 0.5], ['anchor-3', 0.5, 7.5], ['anchor-4', 9.5, 7.5],
]
const SIGMA_R = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)

const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbPosition.scenario() : uwbPosition.variants![variant].scenario()

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbPosition, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts. The
// last jump is the second block's fix, so the shape suite needs the long run too —
// and asking for the same length keeps it on the memoised records these tests use.
lessonShapeSuite(uwbPosition, { proseMax: 1050, runNs: RUN_NS })

const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)
/** The tag's own ranges (the anchors compute their copies too); one per anchor per block. */
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')

/** The lesson's nth table of `numbers`, rows kept in place so a cell can be checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbPosition.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en

const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbPosition.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')

/** Everything a learner reads of one lesson, joined — for "is this number actually printed?" checks. */
const lessonProse = (l: Lesson): string => lessonStrings(l).map((s) => s.en).join('\n')
/** …and this lesson's own, which is what nearly every check here reads. */
const prose = (): string => lessonProse(uwbPosition)

/** The solver run on exact geometry: what the fit is before any noise. */
function exactFix(px: number, py: number, drop?: string): Fix {
  const anchors: AnchorPos[] = CORNERS.filter(([id]) => id !== drop)
    .map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
  const ranges = anchors.map((a) => ({ id: a.id, distM: Math.hypot(px - a.x, py - a.y, TAG.z - a.z) }))
  const fix = solvePosition(anchors, ranges, TAG.z, SIGMA_R)
  expect(fix, `exact fix at ${px},${py}`).not.toBeNull()
  return fix!
}

/**
 * The tag's inspector state after `blocks` ranging blocks, replayed through the
 * player's own reducer — `initViewState` then `applyRecord` per record — so the
 * pinned rows are the panel's by construction and not a hand-built lookalike.
 */
function inspectorAfter(variant: number | undefined, blocks: number): UwbNodeView {
  const vs = initViewState(scenarioOf(variant))
  const untilNs = blocks * 200 * MS + 10 * MS
  for (const r of recs(variant)) {
    if (r.t >= untilNs) break
    applyRecord(vs, r)
  }
  const u = vs.nodes['uwb-1'].uwb
  expect(u, 'the tag has a UWB lane').toBeDefined()
  expect(u!.position, 'the tag has a fix').not.toBeNull()
  return u!
}

describe('uwb-position · the lesson’s own place in the track', () => {
  it('sits in the sessions module and asks for the schedule and the double-sided round', () => {
    expect(uwbPosition.module).toBe(12)
    expect(uwbPosition.id).toBe('uwb-position')
    expect(uwbPosition.needs).toEqual(['uwb-blocks', 'uwb-dstwr'])
    // the two words the lesson adds; GDOP, NLOS and the FoM byte belong to uwb-geometry
    expect(uwbPosition.terms!.map((t) => t.term)).toEqual(['trilateration', 'residual'])
  })

  it('it offers five jumps, three things to observe, one experiment and three questions', () => {
    expect(uwbPosition.jumps).toHaveLength(5)
    expect(uwbPosition.observe).toHaveLength(3)
    expect(uwbPosition.tryThis).toHaveLength(1)
    expect(uwbPosition.quiz).toHaveLength(3)
    for (const q of uwbPosition.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('the jump targets occur in the order the list gives them', () => {
    const rs = recs()
    const at = uwbPosition.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // the Poll opens the block, the fix and the round end share the round's last instant,
    // and the next block's fix is one 200 ms block later
    expect(rs[at[0]].t).toBe(0)
    expect(rs[at[2]].t).toBe(rs[at[3]].t)
    expect(rs[at[4]].t - rs[at[2]].t).toBe(200 * MS)
  })

  it('owns the arithmetic as the model’s, and cites only in `sources`', () => {
    // "The standard says nothing at all about how a phone turns ranges into a point" — the
    // provenance paragraph that used to open the lesson is now the collapsed section.
    const src = uwbPosition.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('The standard says nothing at all about how a phone turns ranges into a point')
    expect(src).toContain('Gauss–Newton least squares')
  })
})

describe('uwb-position · the scene', () => {
  it('is four corner anchors at 2.20 m and one phone off centre at (4, 3.5, 1.0)', () => {
    const s = uwbPosition.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(s.nodes.map((n) => n.id)).toEqual([...CORNERS.map(([id]) => id), 'uwb-1'])
    expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'tag'])
    expect(s.nodes.slice(0, 4).map((n) => [n.pos.x, n.pos.y, n.pos.z]))
      .toEqual(CORNERS.map(([, x, y]) => [x, y, ANCHOR_Z]))
    expect(s.nodes[4].pos).toEqual(TAG)
    // "every crystal is drawn rather than set"; the session is the default one, NLOS on
    expect(s.nodes.every((n) => n.uwb!.ppm === undefined)).toBe(true)
    expect(s.uwb).toEqual({ ...DEFAULT_UWB_SESSION, method: 'ds', nlos: true })
    expect(s.uwb!.nlos).toBe(true)
    expect(s.uwb!.tsNoisePs).toBe(100)
    // no Wi-Fi traffic at all, and the base scene is the plain four-wall shell
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    expect(s.servers).toEqual([])
    expect(s.walls).toHaveLength(4)
    expect(s).toEqual(uwbPositionScenario('base'))
  })

  it('the wall variant adds one brick stub, and only the tag → anchor-1 ray crosses it', () => {
    // The builder's own claim: "'wall' adds brick(2, 1.5, 2, 3), a 1.5 m stub that the
    // tag → anchor-1 ray crosses and no other tag → anchor ray does". The lesson that
    // spends its prose on this variant is uwb-geometry; the scene is built here.
    expect(uwbPosition.variants).toHaveLength(2)
    expect(uwbPosition.variants![0].label).toEqual({ en: 'A brick wall in one path', zh: '一堵砖墙挡住一条路径' })
    const v = scenarioOf(0)
    expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(v.walls).toHaveLength(5)
    const stub = v.walls[4]
    expect(stub).toEqual({ x1: 2, y1: 1.5, x2: 2, y2: 3, material: 'brick', openings: [] })
    expect(Math.hypot(stub.x2 - stub.x1, stub.y2 - stub.y1)).toBe(1.5)
    const crossings = CORNERS.map(([id, x, y]) =>
      [id, wallsCrossed(TAG, { x, y, z: ANCHOR_Z }, [stub])] as const)
    expect(crossings.map(([id, c]) => `${id}:${c.length}`)).toEqual(['anchor-1:1', 'anchor-2:0', 'anchor-3:0', 'anchor-4:0'])
    expect(crossings[0][1]).toEqual(['brick'])
    // nothing but the wall list changes
    expect(JSON.stringify({ ...v, walls: v.walls.slice(0, 4) })).toBe(JSON.stringify(uwbPosition.scenario()))
    expect(v).toEqual(uwbPositionScenario('wall'))
  })

  it('the three-anchor variant deletes the corner at (9.5, 7.5) and nothing else', () => {
    expect(uwbPosition.variants![1].label).toEqual({ en: 'Three anchors', zh: '三个锚点' })
    const v = scenarioOf(1)
    expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(v.nodes.map((n) => n.id)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'uwb-1'])
    expect(v.walls).toEqual(uwbPosition.scenario().walls)
    expect(JSON.stringify({ ...v, nodes: [...v.nodes.slice(0, 3), uwbPosition.scenario().nodes[3], v.nodes[3]] }))
      .toBe(JSON.stringify(uwbPosition.scenario()))
    expect(v).toEqual(uwbPositionScenario('three'))
  })
})

describe('uwb-position · the solver', () => {
  it('the printed formula is the solver’s own terms, and it converges to a micrometre', () => {
    // "r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r"
    expect(formulas()).toHaveLength(2)
    expect(formulas()[0].text.en).toBe('r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r')
    for (const f of formulas()) expect(f.text.zh).toBe(f.text.en)
    // "Fed exact distances the solver converges to within a micrometre"
    const exact = exactFix(TAG.x, TAG.y)
    expect(Math.hypot(exact.x - TAG.x, exact.y - TAG.y)).toBeLessThan(1e-6)
    expect(exact.residualM).toBeLessThan(1e-6)
    // "The engine starts at the anchors’ centroid and stops when a step falls under 1 mm, or
    //  after 20 iterations"
    expect(prose()).toContain('starts at the anchors’ centroid')
    expect(prose()).toContain('under 1 mm, or after 20 iterations')
  })

  it('refuses to answer under three ranges, or with the anchors in a line', () => {
    // "fed fewer than three, or anchors standing in a line, it refuses to answer at all"
    const three: AnchorPos[] = CORNERS.slice(0, 3).map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    expect(solvePosition(three.slice(0, 2), three.slice(0, 2).map((a) => ({ id: a.id, distM: 5 })), TAG.z, SIGMA_R)).toBeNull()
    const line: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: i, y: 4, z: ANCHOR_Z }))
    expect(solvePosition(line, line.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) })), TAG.z, SIGMA_R))
      .toBeNull()
    // "Two unknowns, not three": three ranges is one above the floor, and a fix is still had
    const exactRanges = three.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    expect(solvePosition(three, exactRanges, TAG.z, SIGMA_R)).not.toBeNull()
    expect(three.length - 2).toBe(1)
  })

  it('σ_r is c·σ_ts/√2 = 2.12 cm, the same figure the opening lesson prints', () => {
    // "σ_r = c · σ_ts / √2 = 2.12 cm" and its note: "The opening lesson’s 2.1 cm of range-noise
    //  sigma is this same σ_r, at 100 ps of timestamp noise … It is the single-sided figure,
    //  kept as a conservative stand-in — a double-sided round scatters a little less,
    //  1.8–1.9 cm."
    expect(formulas()[1].text.en).toBe('σ_r = c · σ_ts / √2 = 2.12 cm')
    expect(SIGMA_R).toBeCloseTo(C_M_PER_NS * 0.1 / Math.SQRT2, 12)
    expect((SIGMA_R * 100).toFixed(2)).toBe('2.12')
    // the phrase is one sentence written in two lessons: uwb-intro's observe prints the same
    // figure, and this lesson names it there. A reseed of either has to move both.
    const sigmaCm = `${(SIGMA_R * 100).toFixed(1)} cm`
    expect(prose()).toContain(`The opening lesson’s ${sigmaCm} of range-noise sigma`)
    expect(lessonProse(uwbIntro)).toContain(`${sigmaCm} of range-noise sigma`)
    // rangeSigmaM documents c·σ_ts/√2 as exact for SS-TWR and 0.62–0.65·c·σ_ts for DS-TWR, so
    // the printed σ_r is the larger, conservative one — 1/√2 = 0.707 against 0.65
    expect(prose()).toContain('a double-sided round scatters a little less, 1.8–1.9 cm')
    expect(SIGMA_R / (C_M_PER_NS * 0.1)).toBeCloseTo(1 / Math.SQRT2, 12)
    expect(SIGMA_R / (C_M_PER_NS * 0.1)).toBeGreaterThan(0.65)
    expect(SIGMA_R * 100).toBeGreaterThan(1.9)
    // and the provenance of that choice is in `sources`, where citations live
    expect(uwbPosition.sources!.map((s) => s.en).join('\n')).toContain('0.62–0.65 · c · σ_ts')
  })
})

describe('uwb-position · the base run', () => {
  it('one fix per block, seven of them, each at the end of the tag’s round', () => {
    // "One fix per block, at the end of the tag’s round" / "One fix per block, seven of them in
    //  this run, each a whole block after the last."
    expect(fixes()).toHaveLength(BLOCKS)
    expect(fixes().map((f) => f.block)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(fixes().map((f) => f.t)).toEqual([0, 1, 2, 3, 4, 5, 6].map((b) => 20 * MS + b * 200 * MS))
    const ends = ofType(recs(), 'UWB_ROUND_END')
    expect(ends).toHaveLength(BLOCKS)
    expect(ends.map((e) => e.t)).toEqual(fixes().map((f) => f.t))
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
    for (const f of fixes()) expect(f.anchors).toHaveLength(4)
    // "four amber rings at the ranges just measured": one range per anchor per block
    expect(tagRanges().filter((r) => r.block === 0)).toHaveLength(4)
    // "the point is only computed once the last of them is in"
    const lastRange = Math.max(...tagRanges().filter((r) => r.block === 0).map((r) => r.t))
    expect(fixes()[0].t).toBeGreaterThanOrEqual(lastRange)
  })

  it('block 0’s log line is the one the table quotes, word for word', () => {
    // the "What the log prints at the end of a round" table: "The fix of block 0" reads
    // "uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors"
    const line = 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'
    expect(cell(0, 0, 1)).toBe(line)
    expect(fmtRecord(fixes()[0])).toBe(line)
  })

  it('the seven errors are the seven the table lists, and the inspector prints the first', () => {
    // the table rows "Its error, as the inspector prints it" (0.7 cm) and "The seven fixes of
    // the run" (0.7, 3.3, 0.5, 2.3, 2.8, 0.5, 1.8 cm), and the paragraph "The error runs from
    // half a centimetre to a little over three"
    const cm = fixes().map((f) => fixErr(f) * 100)
    expect(cm.map((c) => c.toFixed(1))).toEqual(['0.7', '3.3', '0.5', '2.3', '2.8', '0.5', '1.8'])
    expect(cell(0, 2, 1)).toBe(`${cm.map((c) => c.toFixed(1)).join(', ')} cm`)
    expect(Math.min(...cm).toFixed(1)).toBe('0.5')
    expect(Math.max(...cm).toFixed(1)).toBe('3.3')
    // "a few times σ_r": every fix inside four sigma of one range, before geometry is charged
    for (const c of cm) expect(c / 100).toBeLessThan(4 * SIGMA_R)
    const row = uwbFixRow(inspectorAfter(undefined, 1).position!, STRINGS.en.uwb)
    expect(cell(0, 1, 1)).toBe('0.7 cm')
    expect(row.error).toBe('0.7 cm')
    expect(row.estimate).toBe('(3.99, 3.50) m')
    expect(row.truth).toBe('(4.00, 3.50) m')
  })

  it('a clean round leaves a residual too small to print', () => {
    // "A clean round leaves a residual too small to print. A range that lies leaves
    //  centimetres" — the clean half is this lesson's; the lying half is uwb-geometry's.
    expect(exactFix(TAG.x, TAG.y).residualM).toBeLessThan(1e-6)
    expect((exactFix(TAG.x, TAG.y).residualM * 100).toFixed(1)).toBe('0.0')
    // Review I5: the picture promised a tool the scene cannot give, three sections before
    // the disclaimer. `Fix.residualM` exists; UWB_POSITION has no such field, so the caveat
    // now travels with the claim — uwb-geometry's own half-sentence.
    const pic = uwbPosition.picture!.map((b) => (b as { text?: { en: string } }).text?.en ?? '').join(' ')
    expect(pic).toContain('but no record carries the figure, so on screen nothing moves')
    expect(uwbPosition.outcomes![2].en)
      .toBe('say what the fit cannot explain — the residual — and why the log never prints it')
    expect(Object.keys(fixes()[0])).not.toContain('residualM')
  })
})

/**
 * The 2026-09-23 amendment ("mechanism before metaphor"): the lesson now writes the
 * solver out as a procedure, and the procedure is graded against `solvePosition`
 * itself rather than against the old prose. Every step names a quantity the engine
 * really uses, and the worked-example table is block 0 of the base run put through
 * those steps value by value.
 */
describe('uwb-position · the procedure, against the solver', () => {
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbPosition.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  const stepsText = (): string => steps().items.map((i) => i.en).join('\n')
  /** Block 0 of the base run, as the tag measured it: the input to the worked example. */
  const block0 = () => tagRanges().filter((r) => r.block === 0)

  it('is a steps block on the main path, one step per thing the engine does', () => {
    expect(uwbPosition.numbers!.some((b) => b.kind === 'steps')).toBe(true)
    expect((uwbPosition.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    for (const i of steps().items) expect(i.zh).not.toBe(i.en)
  })

  it('step 1: under three matched ranges the round emits nothing', () => {
    // "Fewer than three matched, and the round emits nothing."
    expect(stepsText()).toContain('Fewer than three matched')
    const three: AnchorPos[] = CORNERS.slice(0, 3).map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const ranges = three.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    expect(solvePosition(three, ranges, TAG.z, SIGMA_R)).not.toBeNull()
    expect(solvePosition(three, ranges.slice(0, 2), TAG.z, SIGMA_R)).toBeNull()
    // a range naming an anchor the tag has no coordinates for does not count as matched
    expect(solvePosition(three, [...ranges.slice(0, 2), { id: 'anchor-9', distM: 5 }], TAG.z, SIGMA_R)).toBeNull()
  })

  it('step 2: the trial point starts at the mean of the anchors’ x and y', () => {
    // "the centre of the four corners, (5.00, 4.00) m" — the arithmetic, not a remembered value
    const cx = CORNERS.reduce((s, [, x]) => s + x, 0) / CORNERS.length
    const cy = CORNERS.reduce((s, [, , y]) => s + y, 0) / CORNERS.length
    expect([cx.toFixed(2), cy.toFixed(2)]).toEqual(['5.00', '4.00'])
    expect(stepsText()).toContain('(5.00, 4.00) m')
    expect(cell(1, 1, 1)).toBe('(5.00, 4.00) m')
    // the seed is inside the convex hull, so no iteration starts on the wrong side of the room
    expect(cx).toBeGreaterThan(0.5); expect(cx).toBeLessThan(9.5)
    expect(cy).toBeGreaterThan(0.5); expect(cy).toBeLessThan(7.5)
  })

  it('steps 3 and 4: the height is held, and an anchor overhead gives a zero row', () => {
    // "the tag’s height held at its configured 1.00 m" — only (x, y) is solved for, so a
    // solver handed the WRONG height moves the answer, which is what "held" means.
    expect(stepsText()).toContain('1.00 m')
    expect(uwbPosition.scenario().nodes[4].pos.z).toBe(TAG.z)
    const anchors: AnchorPos[] = CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const ranges = anchors.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    const offBy = (dz: number): number => {
      const p = solvePosition(anchors, ranges, TAG.z + dz, SIGMA_R)!
      return Math.hypot(p.x - TAG.x, p.y - TAG.y)
    }
    expect(offBy(0)).toBeLessThan(1e-6)
    expect(offBy(0.5)).toBeGreaterThan(1e-3)
    expect(offBy(1.0)).toBeGreaterThan(offBy(0.5))
    // "that pair is the anchor’s row of J" — the horizontal part of a unit vector, so an
    // anchor directly above the tag contributes nothing, and three such leave no fix
    const overhead: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: TAG.x, y: TAG.y, z: ANCHOR_Z + i }))
    expect(solvePosition(overhead, overhead.map((a) => ({ id: a.id, distM: a.z - TAG.z })), TAG.z, SIGMA_R)).toBeNull()
  })

  it('steps 5 and 6: a singular layout refuses, and the iteration is a millimetre and twenty', () => {
    expect(stepsText()).toContain('1e-9')
    expect(stepsText()).toContain('shorter than 1 mm')
    expect(stepsText()).toContain('twenty iterations')
    // collinear anchors: JᵀJ is singular and the round ends with nothing
    const line: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: i, y: 4, z: ANCHOR_Z }))
    expect(solvePosition(line, line.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) })), TAG.z, SIGMA_R)).toBeNull()
    // twenty iterations is never the binding stop here: a fit that had to be truncated would
    // not sit a micrometre from the truth on exact input
    expect(Math.hypot(exactFix(TAG.x, TAG.y).x - TAG.x, exactFix(TAG.x, TAG.y).y - TAG.y)).toBeLessThan(1e-6)
  })

  it('step 7: the residual the worked example prints is √(Σ r_i²/n) at the converged point', () => {
    const rs = block0()
    const anchors: AnchorPos[] = CORNERS.map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const fix = solvePosition(anchors, rs.map((r) => ({ id: r.peer, distM: r.distM })), TAG.z, SIGMA_R)!
    // the table's own rows, value by value
    expect(cell(1, 0, 1)).toBe(`${rs.map((r) => r.distM.toFixed(4)).join(', ')} m`)
    expect(cell(1, 2, 1)).toBe(`(${fix.x.toFixed(4)}, ${fix.y.toFixed(4)}) m`)
    expect(cell(1, 3, 1)).toBe(`${(fix.residualM * 100).toFixed(2)} cm`)
    expect(cell(1, 4, 1)).toBe(`(${TAG.x.toFixed(2)}, ${TAG.y.toFixed(2)}) m`)
    // and it is the fix the engine itself emitted for that block, not a re-solve that drifted
    expect(fix.x).toBeCloseTo(fixes()[0].x, 12)
    expect(fix.y).toBeCloseTo(fixes()[0].y, 12)
    // √(Σ r_i²/n) written out, against the solver's own figure
    const sumSq = rs.reduce((s, r) => {
      const a = anchors.find((x) => x.id === r.peer)!
      return s + (Math.hypot(fix.x - a.x, fix.y - a.y, TAG.z - a.z) - r.distM) ** 2
    }, 0)
    expect(Math.sqrt(sumSq / rs.length)).toBeCloseTo(fix.residualM, 12)
  })

  it('step 8: the printed error is the formatter’s, and the record carries no residual', () => {
    // "The error in the log is the formatter’s, not the solver’s" — the record holds the
    // estimate and the truth, and `fmtRecord` takes the distance between them.
    const f = fixes()[0]
    expect(Object.keys(f)).not.toContain('residualM')
    expect(Object.keys(f)).not.toContain('errorM')
    expect(fmtRecord(f)).toContain(`error ${Math.hypot(f.x - f.trueX, f.y - f.trueY).toFixed(2)} m`)
    expect(cell(1, 5, 1)).toBe(`error ${fixErr(f).toFixed(2)} m — ${(fixErr(f) * 100).toFixed(2)} cm`)
    // a tag with no truth column: the fields the formatter needs are the record's, and one
    // of them is the simulator's own knowledge of where the tag stands
    expect(f.trueX).toBe(TAG.x)
    expect(f.trueY).toBe(TAG.y)
  })
})
