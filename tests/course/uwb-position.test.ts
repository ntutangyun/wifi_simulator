/**
 * Every empirical claim in the "From four ranges to a point" lesson, measured
 * against the lesson's own scenario and its two variants. Each assertion quotes
 * the sentence it guards, copied from the shipped string; the solver, the range
 * sigma, the NLOS excess delays and the FoM bytes come from the engine's own
 * exports (src/uwb/position.ts, src/uwb/phy.ts, src/uwb/scene.ts) rather than
 * being re-typed here. The inspector rows are replayed through the player's own
 * reducer (initViewState + applyRecord), so they are the panel's by construction.
 */
import { describe, it, expect } from 'vitest'
import { uwbPosition, uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { uwbIntro } from '../../src/course/uwb/uwb-intro'
import { uwbSstwr } from '../../src/course/uwb/uwb-sstwr'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n, Lesson } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { wallsCrossed } from '../../src/engine/propagation'
import { C_M_PER_NS, FOM_LOS, FOM_NLOS, UWB_NLOS_NS, fomText } from '../../src/uwb/phy'
import { rangeSigmaM, solvePosition, type AnchorPos, type Fix } from '../../src/uwb/position'
import { ELLIPSE_DRAW_SCALE } from '../../src/uwb/scene'
import { uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'

const MS = 1_000_000
/** Seven ranging blocks: enough that "seven blocks" and "0.5 cm to 3.3 cm" are a sample, not an anecdote. */
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

const memo = new Map<string, TLRecord[]>()
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) memo.set(key, [...new Simulation(scenarioOf(variant)).runUntil(RUN_NS).records])
  return memo.get(key)!
}

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)
/** The tag's own ranges (the anchors compute their copies too); one per anchor per block. */
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')

/** The lesson's nth table, rows kept in place so a cell can be checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbPosition.body.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en

const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbPosition.body.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')

/** Everything a learner reads of one lesson, joined — for "is this number actually printed?" checks. */
const lessonProse = (l: Lesson): string => {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.en === 'string') { out.push(o.en); return }
    for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
  }
  walk({ body: l.body, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz })
  return out.join('\n')
}

/** …and this lesson's own, which is what nearly every check here reads. */
const prose = (): string => lessonProse(uwbPosition)

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
  const det = xx * yy - xy * xy
  return Math.sqrt((yy + xx) / det)
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

/**
 * The tag's inspector state after `blocks` ranging blocks, replayed through the
 * player's own reducer — `initViewState` then `applyRecord` per record — so the
 * pinned rows are the panel's by construction and not a hand-built lookalike.
 */
function inspectorAfter(variant: number | undefined, blocks: number): UwbNodeView {
  const sc = scenarioOf(variant)
  const vs = initViewState(sc)
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

const FOM_S = {
  fomWithin: STRINGS.en.uwb.fomWithin, noFom: STRINGS.en.uwb.noFom,
  integrityOk: STRINGS.en.uwb.integrityOk, integrityBad: STRINGS.en.uwb.integrityBad,
}

describe('uwb-position · lesson shape', () => {
  it('the scenario and both variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbPosition.scenario())).not.toThrow()
    expect(uwbPosition.variants).toHaveLength(2)
    for (const v of uwbPosition.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbPosition) / 150
      + OBSERVE_MINUTES * uwbPosition.observe.length + TRY_MINUTES * uwbPosition.tryThis.length
    expect(lessonMinutes(uwbPosition)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbPosition)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbPosition)).toBeLessThanOrEqual(25)
    // the header's word budget: 25 minutes needs at most 1724 words, because 1725 makes raw
    // exactly 27.5 and Math.round(5.5) rounds up
    expect(lessonWords(uwbPosition)).toBeLessThanOrEqual(1724)
    const at1725 = 1725 / 150 + OBSERVE_MINUTES * 4 + TRY_MINUTES * 2
    expect(Math.round(at1725 / 5) * 5).toBe(30)
    expect(uwbPosition.module).toBe(12)
    expect(uwbPosition.id).toBe('uwb-position')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbPosition.jumps).toHaveLength(5)
    expect(uwbPosition.observe).toHaveLength(4)
    expect(uwbPosition.tryThis).toHaveLength(2)
    expect(uwbPosition.quiz).toHaveLength(3)
    for (const q of uwbPosition.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs()
    const at: number[] = []
    for (const j of uwbPosition.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      at.push(i)
    }
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // the Poll opens the block, the fix and the round end share the round's last instant,
    // and the next block's fix is one 200 ms block later
    expect(rs[at[0]].t).toBe(0)
    expect(rs[at[2]].t).toBe(rs[at[3]].t)
    expect(rs[at[4]].t - rs[at[2]].t).toBe(200 * MS)
  })

  it('every string a learner reads exists in both languages', () => {
    const seen: L10n[] = []
    const isL10n = (o: Record<string, unknown>): o is Record<string, unknown> & L10n =>
      typeof o.en === 'string' && typeof o.zh === 'string'
    const walk = (x: unknown): void => {
      if (x == null || typeof x === 'function') return
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isL10n(o)) { seen.push(o); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
    walk({
      title: uwbPosition.title, body: uwbPosition.body, observe: uwbPosition.observe,
      tryThis: uwbPosition.tryThis, quiz: uwbPosition.quiz, variants: uwbPosition.variants,
      jumps: uwbPosition.jumps,
    })
    expect(seen.length).toBeGreaterThan(50)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('names the one standard clause it leans on and owns the rest as the model’s', () => {
    // "§10.29.1.7, with Tables 10-146, 10-147 and 10-148, defines the Figure of Merit byte" /
    // "The standard says nothing at all about how a tag turns ranges into a point"
    const first = uwbPosition.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    for (const s of ['IEEE Std 802.15.4-2024', '§10.29.1.7', 'Table', '10-146', '10-147', '10-148']) {
      expect(en, s).toContain(s)
    }
    expect(en).toContain('The standard says nothing at all about how a tag turns ranges into a point')
    expect(en).toContain('Gauss–Newton least squares')
    // "2.0 ns for brick, 0.5 ns for drywall and 0.2 ns for glass" — the engine's own table
    expect(en).toContain('2.0 ns for brick, 0.5 ns for drywall and 0.2 ns for glass')
    expect(UWB_NLOS_NS).toEqual({ brick: 2.0, drywall: 0.5, glass: 0.2 })
    // "the scene draws it N times over — a 17 cm semi-axis" / "drawn N times life size":
    // the factor is interpolated from the scene's own constant, never retyped
    expect(ELLIPSE_DRAW_SCALE).toBe(10)
    expect(prose()).toContain(`the scene draws it ${ELLIPSE_DRAW_SCALE} times over`)
    expect(prose()).toContain(`drawn ${ELLIPSE_DRAW_SCALE} times life size`)
    expect(prose()).toContain(`${ELLIPSE_DRAW_SCALE}× draw scale`)
  })
})

describe('uwb-position · the scene', () => {
  it('is four corner anchors at 2.20 m and one phone off centre at (4, 3.5, 1.0)', () => {
    const s = uwbPosition.scenario()
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
    // "A 1.5 m stub of brick stands between the tag and the anchor at (0.5, 0.5), and of the
    //  four tag-to-anchor rays it obstructs exactly that one."
    expect(uwbPosition.variants![0].label).toEqual({ en: 'A brick wall in one path', zh: '一堵砖墙挡住一条路径' })
    const v = scenarioOf(0)
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
    // "Load “Three anchors”: the corner at (9.5, 7.5) is gone."
    expect(uwbPosition.variants![1].label).toEqual({ en: 'Three anchors', zh: '三个锚点' })
    const v = scenarioOf(1)
    expect(v.nodes.map((n) => n.id)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'uwb-1'])
    expect(v.walls).toEqual(uwbPosition.scenario().walls)
    expect(JSON.stringify({ ...v, nodes: [...v.nodes.slice(0, 3), uwbPosition.scenario().nodes[3], v.nodes[3]] }))
      .toBe(JSON.stringify(uwbPosition.scenario()))
    expect(v).toEqual(uwbPositionScenario('three'))
  })
})

describe('uwb-position · the solver, GDOP and the ellipse', () => {
  it('the printed formulas are the solver’s own terms, and it converges to a micrometre', () => {
    // "r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r"
    expect(formulas()).toHaveLength(2)
    expect(formulas()[0].text.en).toBe('r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r')
    for (const f of formulas()) expect(f.text.zh).toBe(f.text.en)
    // "it converges to within a micrometre of the right answer on exact ranges"
    const exact = exactFix(TAG.x, TAG.y)
    expect(Math.hypot(exact.x - TAG.x, exact.y - TAG.y)).toBeLessThan(1e-6)
    expect(exact.residualM).toBeLessThan(1e-6)
    // "The engine starts at the anchors’ centroid and stops when a step falls under 1 mm, or
    //  after 20 iterations"
    expect(prose()).toContain('starts at the anchors’ centroid')
    expect(prose()).toContain('under 1 mm, or after 20 iterations')
    // "Under three ranges, or with anchors in a line, there is no fix."
    const three: AnchorPos[] = CORNERS.slice(0, 3).map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    expect(solvePosition(three.slice(0, 2), three.slice(0, 2).map((a) => ({ id: a.id, distM: 5 })), TAG.z, SIGMA_R)).toBeNull()
    // "or with anchors in a line, there is no fix"
    const line: AnchorPos[] = [1, 2, 3].map((i) => ({ id: `a${i}`, x: i, y: 4, z: ANCHOR_Z }))
    expect(solvePosition(line, line.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) })), TAG.z, SIGMA_R))
      .toBeNull()
    // "or a JᵀJ too near singular to invert" is not in the shipped prose; the shipped
    // clause is the line case, which is exactly what a singular JᵀJ means here.
  })

  it('GDOP at the tag is 1.05, and √trace((JᵀJ)⁻¹) is what the engine reports', () => {
    // "GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹      σ_r = c · σ_ts / √2 = 2.12 cm"
    expect(formulas()[1].text.en)
      .toBe('GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹      σ_r = c · σ_ts / √2 = 2.12 cm')
    const exact = exactFix(TAG.x, TAG.y)
    expect(exact.gdop).toBeCloseTo(1.0488, 4)
    expect(exact.gdop.toFixed(2)).toBe('1.05')
    // σ_r = c·σ_ts/√2 at the session's 100 ps
    expect(SIGMA_R).toBeCloseTo(C_M_PER_NS * 0.1 / Math.SQRT2, 12)
    expect((SIGMA_R * 100).toFixed(2)).toBe('2.12')
    // "the SS-TWR figure, the model’s conservative stand-in for DS, which lesson 3 measured at
    //  1.8–1.9 cm": rangeSigmaM documents c·σ_ts/√2 as exact for SS and 0.62–0.65·c·σ_ts for
    //  DS, so the printed σ_r is the larger, conservative one — 1/√2 = 0.707 against 0.65
    // "Lesson 1’s 2.1 cm of σ_r is c·σ_ts/√2": the formula is first written here, so the
    // credit to lesson 1 is only for the figure — which lesson 1 does print, in those words.
    const sigmaCm = `${(SIGMA_R * 100).toFixed(1)} cm`
    expect(prose()).toContain(`Lesson 1’s ${sigmaCm} of σ_r is c·σ_ts/√2`)
    expect(lessonProse(uwbIntro)).toContain(`${sigmaCm} of range-noise sigma`)
    expect(lessonProse(uwbSstwr)).not.toContain('c·σ_ts/√2')
    expect(prose()).toContain('the SS-TWR figure, the model’s conservative stand-in for DS')
    expect(prose()).toContain('lesson 3 measured at 1.8–1.9 cm')
    expect(SIGMA_R / (C_M_PER_NS * 0.1)).toBeCloseTo(1 / Math.SQRT2, 12)
    expect(SIGMA_R / (C_M_PER_NS * 0.1)).toBeGreaterThan(0.65)
    expect(SIGMA_R * 100).toBeGreaterThan(1.9)
    // every simulated fix prints the geometry's GDOP: the solved point wanders by centimetres,
    // so JᵀJ is evaluated a hair away from the truth, and 1.05 survives to two decimals
    for (const f of fixes()) {
      expect(f.gdop.toFixed(2), `block ${f.block}`).toBe('1.05')
      expect(Math.abs(f.gdop - exact.gdop), `block ${f.block}`).toBeLessThan(0.002)
    }
  })

  it('the ideal GDOP of four evenly spread anchors is 2/√N = 1.00, and this scene misses it twice over', () => {
    // "JᵀJ is exactly (N/2)·I, the trace of its inverse is 4/N and GDOP is 2/√N — exactly 1.00
    //  at four anchors"
    expect((2 / Math.sqrt(4)).toFixed(2)).toBe('1.00')
    // "each Jacobian row is the horizontal shadow of a slanted unit vector, only 0.968 to
    //  0.985 long"
    const rows = CORNERS.map(([, x, y]) => rowLen(TAG.x, TAG.y, x, y))
    expect(rows.map((r) => r.toFixed(3))).toEqual(['0.968', '0.982', '0.975', '0.985'])
    expect(Math.min(...rows)).toBeGreaterThan(0.9675)
    expect(Math.max(...rows)).toBeLessThan(0.9855)
    // "from the tag the bearings are 64.6°, 89.4°, 95.2° and 110.8° apart"
    expect(gapsAt(TAG.x, TAG.y, CORNERS.map(([id]) => id)).sort())
      .toEqual(['110.8', '64.6', '89.4', '95.2'].sort())
  })

  it('the anchors span 9 × 7 m, so no point sees four right angles — the room’s centre least of all', () => {
    // "the anchors span 9 × 7 m, not a square, so no point sees four right angles: … and the
    //  room’s centre is no better — 1.0544 against 1.0488"
    expect(CORNERS[1][1] - CORNERS[0][1]).toBe(9)
    expect(CORNERS[2][2] - CORNERS[0][2]).toBe(7)
    const centre = exactFix(5, 4)
    const tag = exactFix(TAG.x, TAG.y)
    expect(centre.gdop.toFixed(4)).toBe('1.0544')
    expect(tag.gdop.toFixed(4)).toBe('1.0488')
    // the sentence's whole point: moving to the centre makes it worse, not better
    expect(centre.gdop).toBeGreaterThan(tag.gdop)
    // and the centre's own bearings are 104.3 / 75.7 twice over — still not four right angles
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
    // "GDOP prints between 1.03 and 1.26 everywhere in this room" / "In the corner at (1, 1)
    //  it only reaches 1.18, at (0.6, 0.6) 1.23"
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
    expect(exactFix(0.6, 0.6).gdop.toFixed(2)).toBe('1.23')
  })

  it('the 1-σ ellipse is 1.7 × 1.4 cm at −86.8°, and the scene draws it ten times over', () => {
    // "Here it is 1.7 × 1.4 cm, its long axis nearly north–south at −86.8° from +x" /
    // "a 17 cm semi-axis for a 1.7 cm one"
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
    // "its axis ratio goes from 1.25 to 1.44"
    expect((e.a / e.b).toFixed(2)).toBe('1.25')
  })
})

describe('uwb-position · the base run', () => {
  it('one fix per block, seven of them in 1.3 s, each at the end of the tag’s round', () => {
    // "One fix per block, at the end of the tag’s round: seven in 1.3 s."
    expect(fixes()).toHaveLength(BLOCKS)
    expect(fixes().map((f) => f.block)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(fixes().map((f) => f.t)).toEqual([0, 1, 2, 3, 4, 5, 6].map((b) => 20 * MS + b * 200 * MS))
    const ends = ofType(recs(), 'UWB_ROUND_END')
    expect(ends).toHaveLength(BLOCKS)
    expect(ends.map((e) => e.t)).toEqual(fixes().map((f) => f.t))
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
    for (const f of fixes()) expect(f.anchors).toHaveLength(4)
  })

  it('block 0’s log line is the one the lesson quotes, word for word', () => {
    // "Block 0 reads “uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP
    //  1.05, 4 anchors”"
    const line = 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'
    expect(fmtRecord(fixes()[0])).toBe(line)
    expect(prose()).toContain(line)
  })

  it('the error runs 0.5 cm to 3.3 cm over the seven blocks, inside 4σ_r·GDOP = 8.9 cm', () => {
    // "across the seven the error runs 0.5 cm to 3.3 cm" / "Seven blocks put the fix 0.5 cm to
    //  3.3 cm from the truth, every one inside 4σ_r·GDOP = 8.9 cm"
    const cm = fixes().map((f) => fixErr(f) * 100)
    expect(cm.map((c) => c.toFixed(1))).toEqual(['0.7', '3.3', '0.5', '2.3', '2.8', '0.5', '1.8'])
    expect(Math.min(...cm).toFixed(1)).toBe('0.5')
    expect(Math.max(...cm).toFixed(1)).toBe('3.3')
    const envelope = 4 * SIGMA_R * exactFix(TAG.x, TAG.y).gdop
    expect((envelope * 100).toFixed(1)).toBe('8.9')
    for (const f of fixes()) expect(fixErr(f), `block ${f.block}`).toBeLessThan(envelope)
  })

  it('the inspector prints GDOP 1.05 and an error ellipse of 1.7 × 1.4 cm', () => {
    // "the inspector prints GDOP 1.05 and “error ellipse (1-σ) 1.7 × 1.4 cm”"
    const row = uwbFixRow(inspectorAfter(undefined, 1).position!, STRINGS.en.uwb)
    expect(row.gdop).toBe('1.05')
    expect(row.ellipse).toBe('1.7 × 1.4 cm')
    expect(row.estimate).toBe('(3.99, 3.50) m')
    expect(row.truth).toBe('(4.00, 3.50) m')
    expect(row.error).toBe('0.7 cm')
    expect(STRINGS.en.uwb.ellipse).toBe('error ellipse (1-σ)')
    // every block draws the same ellipse: it is geometry, not measurement
    for (const f of fixes()) {
      expect([(f.ellipse.a * 100).toFixed(1), (f.ellipse.b * 100).toFixed(1)], `block ${f.block}`).toEqual(['1.7', '1.4'])
    }
    // "four amber rings at the measured ranges"
    expect(tagRanges().filter((r) => r.block === 0)).toHaveLength(4)
    // the LOS byte on every range: 0x16, "97 % within 0.5 ns"
    for (const r of tagRanges()) expect(r.fom, r.peer).toBe(FOM_LOS)
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
  })
})

describe('uwb-position · a brick wall in one path', () => {
  it('the blocked range is long by 0.5996 m: 2.0 ns of brick times c', () => {
    // "A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight." / "The
    //  first block measures 5.33 m against a true 4.76 m, and over seven blocks the bias
    //  averages 59.4 cm, within a third of a σ_r of 0.5996 m."
    const bias = UWB_NLOS_NS.brick * C_M_PER_NS
    expect(bias.toFixed(4)).toBe('0.5996')
    expect(prose()).toContain('2.0 ns late, which is 0.5996 m of flight')
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
    // "the other three are within 1.4 cm at “97 % within 0.5 ns”"
    const clean = tagRanges(0).filter((r) => r.peer !== 'anchor-1' && r.block === 0)
    expect(clean).toHaveLength(3)
    for (const r of clean) expect(Math.abs(r.distM - r.trueDistM) * 100, r.peer).toBeLessThan(1.45)
  })

  it('the FoM flags that one range as 0x7b and the other three as 0x16', () => {
    // "that range carries 0x7b, “75 % within 12 ns”, the other three 0x16, “97 % within
    //  0.5 ns”"
    expect(FOM_NLOS).toBe(0x7b)
    expect(FOM_LOS).toBe(0x16)
    expect(fomText(FOM_NLOS)).toBe('75 % within 12 ns')
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
    for (const r of tagRanges(0)) expect(r.fom, `${r.peer} b${r.block}`).toBe(r.peer === 'anchor-1' ? FOM_NLOS : FOM_LOS)
    // the inspector's range table, in the reader's language
    const rows = uwbRangeRows(inspectorAfter(0, 1), FOM_S)
    const a1 = rows.find((r) => r.peer === 'anchor-1')!
    expect([a1.measured, a1.trueDist, a1.error, a1.fom]).toEqual(['5.33 m', '4.76 m', '57.1 cm', '75 % within 12 ns'])
    for (const r of rows.filter((r) => r.peer !== 'anchor-1')) expect(r.fom, r.peer).toBe('97 % within 0.5 ns')
  })

  it('the FoM is geometry: with NLOS cleared the bias goes and the byte stays', () => {
    // "clear the session’s NLOS switch and the range returns to centimetres while the byte
    //  still reads 0x7b" / "The run becomes the base run — the same seven fixes, error back
    //  inside 3.3 cm"
    const walled = scenarioOf(0)
    const ideal = [...new Simulation({ ...walled, uwb: { ...walled.uwb!, nlos: false } }).runUntil(RUN_NS).records]
    const rs = ofType(ideal, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
    for (const r of rs) expect(r.fom, `${r.peer} b${r.block}`).toBe(r.peer === 'anchor-1' ? FOM_NLOS : FOM_LOS)
    for (const r of rs) expect(Math.abs(r.distM - r.trueDistM), `${r.peer} b${r.block}`).toBeLessThan(4 * SIGMA_R)
    const idealFixes = ofType(ideal, 'UWB_POSITION')
    expect(idealFixes.map((f) => fmtRecord(f))).toEqual(fixes().map((f) => fmtRecord(f)))
    for (const f of idealFixes) expect(fixErr(f) * 100, `block ${f.block}`).toBeLessThan(3.35)
  })

  it('the fix moves 0.316 m, not 0.60 m, and away from the blocked anchor', () => {
    // "The fix lands at (4.18, 3.75) — 30.9 cm out, +0.18 m in x and +0.25 m in y, away from
    //  the blocked anchor in both. Noise-free the shift is 0.316 m, 53 % of the bias, on a
    //  bearing of 54°." / quiz 1: "yet the fix moves 0.316 m noise-free"
    const line = 'uwb-1 position (4.18, 3.75) m, true (4.00, 3.50), error 0.31 m, GDOP 1.05, 4 anchors'
    expect(fmtRecord(fixes(0)[0])).toBe(line)
    expect(prose()).toContain(line)
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
    expect((Math.atan2(biased.y - TAG.y, biased.x - TAG.x) * 180 / Math.PI).toFixed(0)).toBe('54')
    // away from anchor-1 at (0.5, 0.5): the shift has a positive component along anchor → tag
    const away = [(TAG.x - 0.5), (TAG.y - 0.5)]
    expect((biased.x - TAG.x) * away[0] + (biased.y - TAG.y) * away[1]).toBeGreaterThan(0)
    // "leaving a 21 cm residual where a clean round leaves a micrometre"
    expect((biased.residualM * 100).toFixed(0)).toBe('21')
    expect(exactFix(TAG.x, TAG.y).residualM).toBeLessThan(1e-6)
    // one number for the shift, everywhere it is quoted: the simulated 30.9 cm in the table,
    // the body and observe 3, and the noise-free 0.316 m in the body and quiz 1
    expect(prose()).toContain('30.9 cm out')
    expect(prose()).toContain('30.9 cm moved')
    expect(prose()).toContain('the shift is 0.316 m')
    expect(uwbPosition.quiz[0].q.en).toContain('0.316 m noise-free')
    expect(prose()).not.toContain('0.32 m')
  })

  it('GDOP and the ellipse do not move, and 30.9 cm is three and a half times their envelope', () => {
    // "GDOP still reads 1.05 and the ellipse still 1.7 × 1.4 cm" / "30.9 cm is three and a
    //  half times their 8.9 cm envelope"
    const exact = exactFix(TAG.x, TAG.y)
    for (const f of fixes(0)) {
      expect(f.gdop.toFixed(2), `block ${f.block}`).toBe('1.05')
      expect(Math.abs(f.gdop - exact.gdop), `block ${f.block}`).toBeLessThan(0.002)
      expect([(f.ellipse.a * 100).toFixed(1), (f.ellipse.b * 100).toFixed(1)], `block ${f.block}`)
        .toEqual(['1.7', '1.4'])
    }
    const row = uwbFixRow(inspectorAfter(0, 1).position!, STRINGS.en.uwb)
    expect([row.gdop, row.ellipse, row.error]).toEqual(['1.05', '1.7 × 1.4 cm', '30.9 cm'])
    const envelope = 4 * SIGMA_R * exact.gdop
    expect((envelope * 100).toFixed(1)).toBe('8.9')
    // "three and a half times", to the decimal the phrase claims — not "nearly four"
    expect((fixErr(fixes(0)[0]) / envelope).toFixed(1)).toBe('3.5')
    expect(prose()).toContain('three and a half times')
    expect(prose()).not.toContain('nearly four times')
  })
})

describe('uwb-position · three anchors', () => {
  it('GDOP rises to 1.26, the ellipse grows to 2.2 × 1.5 cm and its axis swings to +61.5°', () => {
    // "the ellipse grows to 2.2 × 1.5 cm, its axis ratio from 1.25 to 1.44, and its long axis
    //  swings from −86.8° to +61.5°, into the quadrant the anchor left empty"
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
    expect(prose()).toContain('into the quadrant the anchor left empty')
    expect(prose()).not.toContain('towards the corner')
  })

  it('the run keeps every fix within 3.1 cm, on three anchors and one spare measurement', () => {
    // "Three ranges and two unknowns leave one spare measurement, so there is still a fix and
    //  an ellipse, and the seven stay within 3.1 cm"
    expect(fixes(1)).toHaveLength(BLOCKS)
    for (const f of fixes(1)) {
      expect(f.anchors, `block ${f.block}`).toHaveLength(3)
      expect(fixErr(f) * 100, `block ${f.block}`).toBeLessThan(3.1)
    }
    // "one spare measurement": three ranges is exactly one above the solver's floor of three,
    // i.e. one above the two unknowns — drop to two and it refuses to answer at all
    const three: AnchorPos[] = CORNERS.slice(0, 3).map(([id, x, y]) => ({ id, x, y, z: ANCHOR_Z }))
    const exactRanges = three.map((a) => ({ id: a.id, distM: Math.hypot(TAG.x - a.x, TAG.y - a.y, TAG.z - a.z) }))
    expect(fixes(1)[0].anchors).toHaveLength(three.length)
    expect(three.length - 2).toBe(1)
    expect(solvePosition(three, exactRanges, TAG.z, SIGMA_R)).not.toBeNull()
    expect(solvePosition(three.slice(0, 2), exactRanges.slice(0, 2), TAG.z, SIGMA_R)).toBeNull()
    const envelope = 4 * SIGMA_R * exactFix(TAG.x, TAG.y, 'anchor-4').gdop
    expect((envelope * 100).toFixed(1)).toBe('10.7')
    for (const f of fixes(1)) expect(fixErr(f), `block ${f.block}`).toBeLessThan(envelope)
    expect(ofType(recs(1), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('block 0’s line ends in “3 anchors”, and the inspector’s ellipse is 2.2 × 1.5 cm', () => {
    // "“uwb-1 position (3.98, 3.48) m, true (4.00, 3.50), error 0.03 m, GDOP 1.26, 3 anchors”,
    //  and the inspector’s ellipse is 2.2 × 1.5 cm instead of 1.7 × 1.4 cm"
    const line = 'uwb-1 position (3.98, 3.48) m, true (4.00, 3.50), error 0.03 m, GDOP 1.26, 3 anchors'
    expect(fmtRecord(fixes(1)[0])).toBe(line)
    expect(prose()).toContain(line)
    const row = uwbFixRow(inspectorAfter(1, 1).position!, STRINGS.en.uwb)
    expect([row.gdop, row.ellipse, row.error]).toEqual(['1.26', '2.2 × 1.5 cm', '2.7 cm'])
  })

  it('standing on the anchor at (9.5, 0.5) zeroes its Jacobian row and takes GDOP to 2.32', () => {
    // "Drag the tag onto the anchor at (9.5, 0.5) and the three-anchor GDOP reaches 2.32:
    //  standing under an anchor makes its range blind to horizontal motion, so its Jacobian
    //  row is exactly zero and drops out of JᵀJ, leaving two anchors 37.9° apart to carry
    //  the fix."
    const here: [number, number] = [9.5, 0.5]
    const kept = CORNERS.slice(0, 3) // the three-anchor variant: 1, 2 and 3
    expect(scenarioOf(1).nodes.map((n) => n.id)).toEqual([...kept.map(([id]) => id), 'uwb-1'])
    // the tag stands under anchor-2, so its row is the shadow of a vertical unit vector: zero
    const rows = kept.map(([, x, y]) => jRow(here[0], here[1], x, y))
    expect(rows.map((r) => Math.hypot(...r).toFixed(4))).toEqual(['0.9912', '0.0000', '0.9945'])
    expect(rows[1]).toEqual([0, 0])
    expect(rowLen(here[0], here[1], ...([CORNERS[1][1], CORNERS[1][2]] as [number, number]))).toBe(0)
    // it therefore contributes nothing: the same GDOP with and without it, to every digit
    const withAll = gdopOfRows(rows)
    const withoutA2 = gdopOfRows([rows[0], rows[2]])
    expect(withAll).toBe(withoutA2)
    expect(withAll.toFixed(4)).toBe('2.3201')
    // and that is exactly what the solver reports on the variant's own geometry
    const solved = exactFix(here[0], here[1], 'anchor-4')
    expect(solved.gdop.toFixed(4)).toBe('2.3201')
    expect(solved.gdop.toFixed(2)).toBe('2.32')
    expect(solved.gdop).toBeGreaterThan(2.3)
    // "two anchors 37.9° apart": no two bearings coincide — the surviving pair is 37.9° apart
    const bearingTo = (ax: number, ay: number) => Math.atan2(ay - here[1], ax - here[0]) * 180 / Math.PI
    expect(Math.abs(bearingTo(0.5, 7.5) - bearingTo(0.5, 0.5)).toFixed(1)).toBe('37.9')
    expect(prose()).not.toContain('nearly coincide')
    // with all four anchors the same spot is unremarkable, still under the 1.26 the room's band tops out at
    expect(exactFix(here[0], here[1]).gdop.toFixed(2)).toBe('1.24')
    expect(exactFix(here[0], here[1]).gdop).toBeLessThan(1.26)
  })

  it('the comparison table is the three runs, cell by cell', () => {
    const rows: [string, string, string, string, string][] = [
      ['Four anchors', '1.05', '1.7 × 1.4 cm', '(3.99, 3.50) m', '0.7 cm'],
      ['A brick wall in one path', '1.05', '1.7 × 1.4 cm', '(4.18, 3.75) m', '30.9 cm'],
      ['Three anchors', '1.26', '2.2 × 1.5 cm', '(3.98, 3.48) m', '2.7 cm'],
    ]
    rows.forEach((row, i) => row.forEach((v, j) => expect(cell(0, i, j), `${row[0]} ${j}`).toBe(v)))
    const measured = [undefined, 0, 1].map((v) => uwbFixRow(inspectorAfter(v, 1).position!, STRINGS.en.uwb))
    rows.forEach(([, gdop, ellipse, estimate, error], i) => {
      expect(measured[i].gdop, rows[i][0]).toBe(gdop)
      expect(measured[i].ellipse, rows[i][0]).toBe(ellipse)
      expect(measured[i].estimate, rows[i][0]).toBe(estimate)
      expect(measured[i].error, rows[i][0]).toBe(error)
    })
    // the two variant labels the lesson tells the learner to load
    expect(rows[1][0]).toBe(uwbPosition.variants![0].label.en)
    expect(rows[2][0]).toBe(uwbPosition.variants![1].label.en)
  })
})
