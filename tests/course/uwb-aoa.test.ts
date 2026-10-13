/**
 * Every empirical claim in "One anchor is enough", measured against the lesson's own
 * scenario and its three variants. Each assertion quotes the sentence it guards, copied
 * from the shipped string; the wavelength, the antenna spacing, the phase sigma, the
 * bearing sigma and the range sigma come from the engine's own exports rather than being
 * re-typed here, and the geometry is recomputed from the scenario rather than transcribed,
 * so a coordinate that drifts fails the test instead of quietly contradicting the prose.
 *
 * The three things the lesson is really about are each checked twice: the bearing sigma
 * against `aoaSigmaDeg` and against the spread of the measurements; the cross-range error
 * against rh·σ_θ and against the fixes decomposed along and across the true ray; and the
 * mirror against sin(180° − θ) = sin θ and against the run, which reproduces the base
 * scene's fourteen bearings exactly while the fixes land outside the room.
 *
 * The lesson is written to the zero-to-hero contract, so the shape — the sections, the
 * the first watch — is the kit's `lessonShapeSuite`, and the
 * log lines a reader is shown live in a table of `numbers` rather than in an observe item.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_X, ANCHOR_Y, ANCHOR_Z, SPOTS, TAG_Z, YAW_IN, YAW_WALL,
  tagXY, uwbAoa, uwbAoaScenario, type UwbAoaVariant,
} from '../../src/course/uwb/uwb-aoa'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import {
  AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, antennaSpacingM, aoaSigmaDeg, azimuthFromPdoaDeg,
  pdoaRad, trueAzimuthDeg, wavelengthM,
} from '../../src/uwb/aoa'
import { rangeSigmaM } from '../../src/uwb/position'
import { C_M_PER_NS, UWB_CHANNEL_MHZ, tsNoiseScale } from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbAoaRows, uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'

const MS = 1_000_000
/** Seven blocks, the window every UWB lesson measures over: one DS round per 200 ms block. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const ANC = 'anc-1'
const TAG = 'badge-1'
/** Indices into `uwbAoa.variants`. */
const V: Record<Exclude<UwbAoaVariant, 'base'>, number> = { off45: 0, off60: 1, behind: 2 }

const scenarioOf = (v: UwbAoaVariant): Scenario =>
  v === 'base' ? uwbAoa.scenario() : uwbAoa.variants![V[v]].scenario()
/** The lesson's own scenes go through the kit's shared runs; the editor's do not. */
const recs = (v: UwbAoaVariant): TLRecord[] =>
  runOf(uwbAoa, v === 'base' ? undefined : V[v], RUN_NS)

/** A scene the reader builds in the editor rather than picks from the variant list. */
const extra = new Map<string, TLRecord[]>()
const runExtra = (key: string, build: () => Scenario): TLRecord[] => {
  if (!extra.has(key)) extra.set(key, [...new Simulation(build()).runUntil(RUN_NS).records])
  return extra.get(key)!
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const cm = (m: number): string => (m * 100).toFixed(1)

/** Fix errors in metres, in the order the anchor emitted them. */
const fixErrM = (rs: TLRecord[]): number[] =>
  ofType(rs, 'UWB_POSITION').map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
/** |measured − true| of every range the anchor reported, in metres. */
const ancRangeErrM = (rs: TLRecord[]): number[] =>
  ofType(rs, 'UWB_RANGE').filter((r) => r.node === ANC).map((r) => Math.abs(r.distM - r.trueDistM))
/**
 * Each fix split into its component along the true anchor→badge ray and its component
 * across it. This is the whole argument of the lesson's ellipse section, so it is measured
 * rather than asserted: the range owns the first and the bearing owns the second.
 */
const split = (rs: TLRecord[], v: UwbAoaVariant): { along: number[]; across: number[] } => {
  const t = tagXY(v)
  const bx = t.x - ANCHOR_X, by = t.y - ANCHOR_Y
  const L = Math.hypot(bx, by)
  const fs = ofType(rs, 'UWB_POSITION')
  return {
    along: fs.map((f) => ((f.x - f.trueX) * bx + (f.y - f.trueY) * by) / L),
    across: fs.map((f) => ((f.x - f.trueX) * -by + (f.y - f.trueY) * bx) / L),
  }
}
/** The horizontal leg the fix walks out: the plan distance, not the slant range. */
const horizM = (v: UwbAoaVariant): number => SPOTS[v].rangeM
/** The cross-range 1-σ the lesson quotes for a spot: rh · σ_θ at the true azimuth. */
const crossSigmaM = (v: UwbAoaVariant): number =>
  horizM(v) * aoaSigmaDeg(SPOTS[v].offBoresightDeg) * (Math.PI / 180)

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbAoa).map((s) => s).join('\n')

/** The lesson's nth table of `numbers`: 0 is the three spots, 1 is the log lines. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbAoa.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbAoa.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')

const ALL: UwbAoaVariant[] = ['base', 'off45', 'off60', 'behind']

// The contract every migrated lesson owes: the sections, the stated minutes, the jump
// targets and the first watch. `npx tsx scripts/lesson-dump.ts uwb-aoa` prints the lesson
// and the minutes it costs.
lessonShapeSuite(uwbAoa)

describe('uwb-aoa · the lesson', () => {
  it('sits in module 14, needs the double-sided and the geometry lesson, and names four new words', () => {
    expect(uwbAoa.id).toBe('uwb-aoa')
    expect(MODULES[uwbAoa.module].title).toBe('角度')
    // uwb-geometry as well as uwb-dstwr: a whole picture section is "An ellipse across the
    // line of sight", the numbers table carries an Ellipse column and the log line a GDOP.
    expect(uwbAoa.needs).toEqual(['uwb-dstwr', 'uwb-geometry'])
    expect(uwbAoa.terms!.map((t) => t.term)).toEqual(['AoA', 'phase difference', 'boresight', 'field of view'])
    // the reader is sent to the bearing itself, not to the Poll that carried it
  })

  it('it offers five jumps, two things to observe, two experiments and three questions', () => {
    expect(uwbAoa.jumps).toHaveLength(5)
    expect(uwbAoa.observe).toHaveLength(2)
    expect(uwbAoa.tryThis).toHaveLength(2)
    expect(uwbAoa.quiz).toHaveLength(3)
    for (const q of uwbAoa.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbAoa.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      idx.push(i)
    }
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the Poll opens the round; the bearing is taken off it one PPDU later; the Final goes out
    // at 4 ms and the range and the single-anchor fix close the round together
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(197_636)
    expect(rs[idx[2]].t).toBe(4 * MS)
    expect(rs[idx[3]].t).toBe(4_193_534)
    expect(rs[idx[4]].t).toBe(4_193_534)
    // the jumped-to fix is the AoA one, and it is the only kind of fix in the run
    expect(ofType(rs, 'UWB_POSITION').every((f) => f.method === 'aoa')).toBe(true)
  })

  it('names the one clause it leans on and owns the antennas, the sigma and the mirror as the model’s', () => {
    const src = uwbAoa.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§10.29.1.1')
    // "DS is not optional here" is a scene choice, so it is owned in `sources` too
  })

  it('it closes its module, and UWB Tier 3 follows it', () => {
    expect(MODULES[uwbAoa.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    // read after uwb-ul-tdoa and before uwb-mms - a precedence, not an offset, so a
    // lesson added between them does not break a claim that is still true
    expect(ids.indexOf('uwb-ul-tdoa')).toBeLessThan(ids.indexOf('uwb-aoa'))
    expect(COURSE_ORDER.indexOf('uwb-aoa')).toBeLessThan(COURSE_ORDER.indexOf('uwb-mms'))
    expect(COURSE_ORDER.filter((id) => !ids.includes(id))).toEqual([])
  })
})

describe('uwb-aoa · the scene', () => {
  it('is one anchor facing into the room and one badge, at the angles the prose names', () => {
    for (const v of ALL) {
      const s = scenarioOf(v)
      expect(() => ScenarioSchema.parse(s), v).not.toThrow()
      expect(s.nodes.map((n) => n.id), v).toEqual([ANC, TAG])
      const a = s.nodes[0]
      expect(a.pos, v).toEqual({ x: ANCHOR_X, y: ANCHOR_Y, z: ANCHOR_Z })
      expect(a.uwb?.role, v).toBe('anchor')
      expect(a.uwb?.yawDeg, v).toBe(v === 'behind' ? YAW_WALL : YAW_IN)
      const t = s.nodes[1]
      expect(t.uwb?.role, v).toBe('tag')
      expect(t.pos.z, v).toBe(TAG_Z)
      expect({ x: t.pos.x, y: t.pos.y }, v).toEqual(tagXY(v))
      expect(s.rooms, v).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
      // every badge is inside the 10 × 8 m room; the "behind" fix will not be
      expect(t.pos.x, v).toBeGreaterThan(0)
      expect(t.pos.x, v).toBeLessThan(10)
      expect(t.pos.y, v).toBeGreaterThan(0)
      expect(t.pos.y, v).toBeLessThan(8)
    }
    // "the distance is measured up to an anchor near the ceiling", "the height comes out of it first"
    expect(ANCHOR_Z).toBe(2.2)
    expect(TAG_Z).toBe(1)
    expect(ANCHOR_Z).toBeGreaterThan(TAG_Z)
  })

  it('the spots are exact polar coordinates, so the records read −45.000° and −60.000°', () => {
    // the geometry the prose claims, computed from the scenario rather than transcribed
    for (const v of ALL) {
      const s = scenarioOf(v)
      const t = s.nodes[1].pos
      const yaw = s.nodes[0].uwb!.yawDeg!
      const trueTheta = trueAzimuthDeg({ x: ANCHOR_X, y: ANCHOR_Y, z: ANCHOR_Z }, yaw, t)
      const expected = v === 'behind' ? 180 : -SPOTS[v].offBoresightDeg
      expect(trueTheta, v).toBeCloseTo(expected, 9)
      // and the plan distance is the r the spot was built from
      expect(Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y), v).toBeCloseTo(SPOTS[v].rangeM, 9)
      // which is what the engine says, to the last digit the log prints
      expect(ofType(recs(v), 'UWB_AOA')[0].trueThetaDeg.toFixed(3), v).toBe(expected.toFixed(3))
    }
    // the table's "True bearing" column, and the names of the two variants it is read with
    expect([cell(0, 0, 1), cell(0, 1, 1), cell(0, 2, 1)]).toEqual(['0.0°', '−45.0°', '−60.0°'])
    // "a badge to the anchor's right … has a negative azimuth"
    expect(tagXY('off45').x).toBeGreaterThan(ANCHOR_X)
    expect(tagXY('off60').x).toBeGreaterThan(ANCHOR_X)
  })

  it('is a DS-TWR session with AoA on, channel 9 and NLOS off, on otherwise-default knobs', () => {
    for (const v of ALL) {
      const u = scenarioOf(v).uwb!
      expect(u.mode, v).toBe('twr')
      expect(u.method, v).toBe('ds')
      expect(u.aoa, v).toBe(true)
      expect(u.channel, v).toBe(9)
      expect(u.nlos, v).toBe(false)
      expect(u.slotRstu, v).toBe(DEFAULT_UWB_SESSION.slotRstu)
      expect(u.blockRstu, v).toBe(DEFAULT_UWB_SESSION.blockRstu)
      expect(u.tsNoisePs, v).toBe(DEFAULT_UWB_SESSION.tsNoisePs)
      expect(u.cfoNoisePpm, v).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
      for (const n of scenarioOf(v).nodes) expect(n.uwb?.ppm, `${v} ${n.id}`).toBeUndefined()
    }
    // nothing else in the course turns this on
    expect(DEFAULT_UWB_SESSION.aoa).toBe(false)
    // `sources`: "with a single-sided one the anchor would hold a bearing and never compute a
    // range to cross it with" — in SS the anchor measures bearings and emits no fix at all
    const ss = uwbAoaScenario('base')
    const ssRun = runExtra('ss', () => ({ ...ss, uwb: { ...ss.uwb!, method: 'ss' } }))
    expect(ofType(ssRun, 'UWB_AOA').length).toBe(BLOCKS)
    expect(ofType(ssRun, 'UWB_POSITION')).toEqual([])
    expect(ofType(recs('base'), 'UWB_POSITION')).toHaveLength(BLOCKS)
  })

  it('replays bit-for-bit, in all four scenes', () => {
    for (const v of ALL) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})

describe('uwb-aoa · two antennas, one phase', () => {
  it('"antennas 1.88 cm apart under a 3.75 cm carrier" on channel 9, and only the ratio matters', () => {
    expect(UWB_CHANNEL_MHZ[9]).toBe(7987.2)
    expect((wavelengthM(9) * 100).toFixed(2)).toBe('3.75')
    expect((antennaSpacingM(9) * 100).toFixed(2)).toBe('1.88')
    expect(antennaSpacingM(9)).toBeCloseTo(wavelengthM(9) / 2, 12)
    // "Going deeper": "Channel 5’s are 4.62 cm and 2.31 cm"
    expect((wavelengthM(5) * 100).toFixed(2)).toBe('4.62')
    expect((antennaSpacingM(5) * 100).toFixed(2)).toBe('2.31')
    // and the ratio really is all that matters: the same true azimuth gives the same phase and
    // the same estimate on both channels
    for (const t of [0, -45, -60, 80]) {
      expect(pdoaRad(t, 5), String(t)).toBeCloseTo(pdoaRad(t, 9), 12)
      expect(azimuthFromPdoaDeg(pdoaRad(t, 9), 5), String(t)).toBeCloseTo(azimuthFromPdoaDeg(pdoaRad(t, 9), 9), 12)
    }
  })

  it('the formula is the shipped one, and nothing wraps inside the field of view', () => {
    expect(formulas()).toHaveLength(2)
    expect(formulas()[1].text).toBe('σ_θ = σ_φ / (π·cos θ)')
    for (const f of formulas()) expect(f.text.length).toBeGreaterThan(0)
    // "The whole field of view maps onto one turn of phase, so nothing wraps"
    expect(pdoaRad(90, 9)).toBeCloseTo(Math.PI, 12)
    expect(pdoaRad(-90, 9)).toBeCloseTo(-Math.PI, 12)
    expect(pdoaRad(0, 9)).toBe(0)
    // "Going deeper": "2.221 rad at 45° off boresight, 2.721 rad at 60°, and π at the edge"
    expect(Math.abs(pdoaRad(-45, 9)).toFixed(3)).toBe('2.221')
    expect(Math.abs(pdoaRad(-60, 9)).toFixed(3)).toBe('2.721')
    // "Noise can push the argument past ±π, where the arc sine has no answer, so the model clamps it"
    expect(azimuthFromPdoaDeg(Math.PI * 1.4, 9)).toBe(90)
    expect(azimuthFromPdoaDeg(-Math.PI * 1.4, 9)).toBe(-90)
  })

  it('"0.15 rad or about 8.6°" inverts to 2.74° ahead, 3.87° at 45° and 5.47° at 60°', () => {
    expect(AOA_SIGMA_PHI_RAD).toBe(0.15)
    expect((AOA_SIGMA_PHI_RAD * 180 / Math.PI).toFixed(1)).toBe('8.6')
    expect(aoaSigmaDeg(0).toFixed(2)).toBe('2.74')
    expect(aoaSigmaDeg(-45).toFixed(2)).toBe('3.87')
    expect(aoaSigmaDeg(-60).toFixed(2)).toBe('5.47')
    // σ_θ = σ_φ/(π·cos θ), to the letter
    for (const t of [0, -45, -60, 30]) {
      expect(aoaSigmaDeg(t), String(t)).toBeCloseTo((AOA_SIGMA_PHI_RAD / (Math.PI * Math.cos(t * Math.PI / 180))) * 180 / Math.PI, 12)
    }
    expect([cell(0, 0, 2), cell(0, 1, 2), cell(0, 2, 2)]).toEqual(['2.74°', '3.87°', '5.47°'])
    // and the measurements obey it: every one of the 14 bearings is inside 4 σ_θ of the truth
    for (const v of ['base', 'off45', 'off60'] as UwbAoaVariant[]) {
      const as = ofType(recs(v), 'UWB_AOA')
      expect(as, v).toHaveLength(2 * BLOCKS)
      for (const a of as) {
        expect(Math.abs(a.thetaDeg - a.trueThetaDeg), `${v} ${a.thetaDeg}`).toBeLessThan(4 * aoaSigmaDeg(a.trueThetaDeg))
      }
    }
  })

  it('"Going deeper": the two clamps, and the 80° spot where they begin to bite', () => {
    // "σ_θ itself is clamped at 45°, which the formula reaches at about ±86.5° off boresight"
    expect(aoaSigmaDeg(90)).toBe(AOA_SIGMA_CLAMP_DEG)
    expect(AOA_SIGMA_CLAMP_DEG).toBe(45)
    const crossoverDeg = Math.acos(AOA_SIGMA_PHI_RAD / (Math.PI * AOA_SIGMA_CLAMP_DEG * Math.PI / 180)) * 180 / Math.PI
    expect(crossoverDeg.toFixed(1)).toBe('86.5')
    expect(aoaSigmaDeg(86.4)).toBeLessThan(AOA_SIGMA_CLAMP_DEG)
    expect(aoaSigmaDeg(86.6)).toBe(AOA_SIGMA_CLAMP_DEG)
    // "neither fires anywhere the lesson sends the badge"
    expect(aoaSigmaDeg(-60)).toBeLessThan(AOA_SIGMA_CLAMP_DEG)
    for (const v of ['base', 'off45', 'off60'] as UwbAoaVariant[]) {
      expect(ofType(recs(v), 'UWB_AOA').some((a) => Math.abs(a.thetaDeg) === 90), v).toBe(false)
    }
    // the 80° spot: (8.94, 1.19) is 80° off boresight at 4 m, and inside the room
    const far = { x: ANCHOR_X + 4 * Math.sin(80 * Math.PI / 180), y: ANCHOR_Y + 4 * Math.cos(80 * Math.PI / 180) }
    expect([far.x.toFixed(2), far.y.toFixed(2)]).toEqual(['8.94', '1.19'])
    expect(aoaSigmaDeg(-80).toFixed(2)).toBe('15.75')
    expect(aoaSigmaDeg(-80)).toBeLessThan(AOA_SIGMA_CLAMP_DEG)
    const base = uwbAoaScenario('base')
    const run80 = runExtra('off80', () => ({
      ...base,
      nodes: base.nodes.map((n): NodeCfg => (n.id === TAG ? { ...n, pos: { ...n.pos, ...far } } : n)),
    }))
    const bearings = ofType(run80, 'UWB_AOA')
    expect(bearings).toHaveLength(2 * BLOCKS)
    expect(bearings.filter((b) => b.thetaDeg === -90)).toHaveLength(6)
    expect(Math.max(...ofType(run80, 'UWB_POSITION').map((f) => f.ellipse.a)).toFixed(2)).toBe('3.16')
  })
})

describe('uwb-aoa · a circle and a ray', () => {
  const rs = recs('base')

  it('the anchor measures a bearing on every frame from the badge, and fixes the badge alone', () => {
    // "It does this on every frame from the badge, so one round leaves two bearings"
    const as = ofType(rs, 'UWB_AOA')
    expect(as).toHaveLength(2 * BLOCKS)
    expect(as.every((a) => a.node === ANC && a.peer === TAG)).toBe(true)
    const fixes = ofType(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes.every((f) => f.node === ANC && f.of === TAG && f.method === 'aoa')).toBe(true)
    // "the anchor needs nobody else: it solves the badge's position by itself", and "GDOP is
    // 1.00 here by construction and has nothing to say"
    expect(fixes.every((f) => f.anchors.length === 1 && f.anchors[0] === ANC)).toBe(true)
    expect(fixes.every((f) => f.gdop === 1)).toBe(true)
    // "The 2.12 cm range sigma is the model constant the positioning lessons use"
    expect((rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(2)).toBe('2.12')
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
  })

  it('the log table is the round, line for line', () => {
    const as = ofType(rs, 'UWB_AOA')
    expect(as[0].t).toBe(197_636)
    expect(as[1].t).toBe(4_193_534)
    expect(cell(1, 0, 1)).toBe(fmtRecord(as[0]))
    expect(cell(1, 0, 1)).toBe('anc-1 AoA ← badge-1: 2.3° (true 0.0°)')
    expect(cell(1, 1, 1)).toBe(fmtRecord(as[1]))
    expect(cell(1, 1, 1)).toBe('anc-1 AoA ← badge-1: 1.8° (true 0.0°)')
    // the three lines observe 2 says land together
    const at = rs.filter((r) => r.t === 4_193_534 && (r.type === 'UWB_AOA' || r.type === 'UWB_RANGE' || r.type === 'UWB_POSITION'))
    expect(at.map((r) => r.type)).toEqual(['UWB_AOA', 'UWB_RANGE', 'UWB_POSITION'])
    expect(cell(1, 2, 1)).toBe(fmtRecord(at[1]))
    expect(cell(1, 2, 1)).toBe('anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)')
    expect(cell(1, 3, 1)).toBe(fmtRecord(at[2]))
    expect(cell(1, 3, 1)).toBe(
      'anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)',
    )
    // "always with the later bearing": the ellipse is turned a quarter turn from yaw + θ̂ of the
    // SECOND bearing of the round, not the first
    const fix = ofType(rs, 'UWB_POSITION')[0]
    const bearingRad = (YAW_IN + as[1].thetaDeg) * (Math.PI / 180)
    expect(fix.ellipse.thetaRad).toBeCloseTo(bearingRad + Math.PI / 2, 12)
  })

  it('the anchor holds the bearing, the badge holds the fix — the table’s last row', () => {
    const vs = initViewState(uwbAoa.scenario())
    for (const r of rs) applyRecord(vs, r)
    const a = vs.nodes[ANC].uwb!
    // the range row the anchor holds: the figures, not the labels the string table supplies
    expect(uwbRangeRows(a, STRINGS.uwb)).toMatchObject([{
      peer: TAG, measured: '2.31 m', trueDist: '2.33 m', error: '-2.4 cm', rounds: String(BLOCKS),
    }])
    expect(uwbAoaRows(a)).toEqual([{
      peer: TAG, measured: '-3.7°', trueTheta: '0.0°', error: '-3.7°',
      sigma: '± 2.7°', rounds: String(2 * BLOCKS),
    }])
    // "A bearing belongs to the anchor that measured it, a fix to whoever it is of"
    expect(a.position).toBeNull()
    const t = vs.nodes[TAG].uwb!
    expect(uwbAoaRows(t)).toEqual([])
    const row = uwbFixRow(t.position!, STRINGS.uwb)
    expect(row).toMatchObject({
      estimate: '(5.13, 2.47) m', truth: '(5.00, 2.50) m', error: '13.3 cm',
      gdop: '1.00', ellipse: '9.4 × 2.1 cm',
    })
    expect(cell(1, 4, 1))
      .toBe(`${row.estimate}, true ${row.truth}, ${row.error}, GDOP ${row.gdop}, ellipse ${row.ellipse}`)
  })
})

describe('uwb-aoa · the ellipse across the line of sight', () => {
  const SPOT_ROWS: [UwbAoaVariant, number][] = [['base', 0], ['off45', 1], ['off60', 2]]

  it('the three-spot table is what seven rounds produce at each spot', () => {
    for (const [v, row] of SPOT_ROWS) {
      const run = recs(v)
      // "Cross-range 1-σ" = rh·σ_θ at the true azimuth
      expect(cell(0, row, 3), v).toBe(`${cm(crossSigmaM(v))} cm`)
      // "Range error" — the anchor's own, to one decimal
      const re = ancRangeErrM(run)
      expect(re, v).toHaveLength(BLOCKS)
      expect(cell(0, row, 4), v).toBe(`${cm(mean(re))} cm`)
      // "Fix error"
      const fe = fixErrM(run)
      expect(fe, v).toHaveLength(BLOCKS)
      // the cell's own separators are the string table's; its three figures are the run's
      for (const n of [cm(Math.min(...fe)), cm(Math.max(...fe)), cm(mean(fe))]) {
        expect(cell(0, row, 5), `${v} ${n}`).toContain(n)
      }
    }
    expect([cell(0, 0, 3), cell(0, 1, 3), cell(0, 2, 3)]).toEqual(['9.5 cm', '27.0 cm', '47.7 cm'])
    // "The range error is the same in all three rows"
    expect([cell(0, 0, 4), cell(0, 1, 4), cell(0, 2, 4)]).toEqual(['2.0 cm', '2.0 cm', '2.0 cm'])
    for (const [row, fig] of [[0, '2.1'], [0, '15.6'], [0, '9.6'], [1, '5.8'], [1, '44.5'],
      [1, '26.5'], [2, '10.4'], [2, '87.7'], [2, '48.2']] as [number, string][]) {
      expect(cell(0, row, 5), fig).toContain(fig)
    }
    // "grows fivefold", to the decimals the table prints
    expect(crossSigmaM('off60') / crossSigmaM('base')).toBeGreaterThan(4.5)
    expect(table(0).head).toHaveLength(7)
    expect(table(0).rows.every((r) => r.length === 7)).toBe(true)
  })

  it('the error has a direction: across is the bearing’s, along stays inside 9 cm', () => {
    const alongAll: number[] = []
    for (const [v] of SPOT_ROWS) {
      const { along, across } = split(recs(v), v)
      alongAll.push(...along)
      // across ≈ the fix error, within a millimetre, at every spot
      const fe = fixErrM(recs(v))
      across.forEach((x, i) => expect(Math.abs(Math.abs(x) - fe[i]), `${v} ${i}`).toBeLessThan(0.01))
      // and it is what the cross-range sigma predicts: worst case inside 2σ
      expect(Math.max(...across.map(Math.abs)), v).toBeLessThan(2 * crossSigmaM(v))
    }
    // "Going deeper": "all twenty-one of them stay inside 9 cm, under four times the range sigma"
    expect(alongAll).toHaveLength(3 * BLOCKS)
    expect(alongAll).toHaveLength(21)
    expect(Math.max(...alongAll.map(Math.abs))).toBeLessThan(0.09)
    expect(Math.max(...alongAll.map(Math.abs))).toBeLessThan(4 * rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs))
  })

  it('the ellipse column is the run’s, and every ellipse is a quarter turn from the bearing', () => {
    const first = SPOT_ROWS.map(([v]) => ofType(recs(v), 'UWB_POSITION')[0])
    expect(first.map((f) => `${cm(f.ellipse.a)} × ${(f.ellipse.b * 100).toFixed(1)} cm`))
      .toEqual([cell(0, 0, 6), cell(0, 1, 6), cell(0, 2, 6)])
    expect([cell(0, 0, 6), cell(0, 1, 6), cell(0, 2, 6)])
      .toEqual(['9.4 × 2.1 cm', '25.7 × 2.1 cm', '43.1 × 2.1 cm'])
    // "The ellipse is those two measurements as semi-axes": b is the range sigma at every spot,
    // which is why "its short axis never moves"
    for (const f of first) expect(f.ellipse.b).toBeCloseTo(rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs), 12)
    // "a quarter turn from the bearing"
    for (const [v] of SPOT_ROWS) {
      for (const f of ofType(recs(v), 'UWB_POSITION')) {
        expect(f.ellipse.a, v).toBeGreaterThan(f.ellipse.b)
        const bearing = Math.atan2(f.y - ANCHOR_Y, f.x - ANCHOR_X)
        const turn = Math.abs(Math.atan2(Math.sin(f.ellipse.thetaRad - bearing), Math.cos(f.ellipse.thetaRad - bearing)))
        expect(turn, v).toBeCloseTo(Math.PI / 2, 9)
      }
    }
  })

  it('"the radio measures 4.176 m where the plan shows 4.000", and the fix walks out the plan leg', () => {
    const t = tagXY('off45')
    const slant = Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y, ANCHOR_Z - TAG_Z)
    expect(slant.toFixed(3)).toBe('4.176')
    expect(Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y).toFixed(3)).toBe('4.000')
    // "would plant the point 17.6 cm too far"
    expect(cm(slant - 4)).toBe('17.6')
    expect((slant - 4) / rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)).toBeGreaterThan(8)
    // it does not: every fix sits at √(r² − Δz²) from the anchor, and the along-ray error
    // is centimetres rather than the 17.6 cm bias the slant range would have left
    const fs = ofType(recs('off45'), 'UWB_POSITION')
    const rs45 = ofType(recs('off45'), 'UWB_RANGE').filter((r) => r.node === ANC)
    fs.forEach((f, i) => {
      const walked = Math.hypot(f.x - ANCHOR_X, f.y - ANCHOR_Y)
      const dz = ANCHOR_Z - TAG_Z
      expect(walked, String(i)).toBeCloseTo(Math.sqrt(rs45[i].distM ** 2 - dz * dz), 9)
    })
    expect(Math.max(...split(recs('off45'), 'off45').along.map(Math.abs))).toBeLessThan(0.05)
    // lifting the badge to the anchor's own height, where slant and plan agree, moves
    // no fix by more than a millimetre — the correction is doing exactly its job
    const lifted = uwbAoaScenario('off45')
    const flat = runExtra('off45-flat', () => ({
      ...lifted,
      nodes: lifted.nodes.map((n): NodeCfg => (n.id === TAG ? { ...n, pos: { ...n.pos, z: ANCHOR_Z } } : n)),
    }))
    fixErrM(flat).forEach((e, i) => expect(Math.abs(e - fixErrM(recs('off45'))[i]), String(i)).toBeLessThan(0.001))
  })

  it('the inspector’s ± is the last bearing’s, not the spot’s', () => {
    const vs = (v: UwbAoaVariant) => {
      const st = initViewState(scenarioOf(v))
      for (const r of recs(v)) applyRecord(st, r)
      return st
    }
    // "Going deeper": "± 2.7°, ± 4.3° and ± 7.5° at the three spots, where the model's σ_θ at
    //  the true bearings is 2.74°, 3.87° and 5.47°"
    const SPOT3: UwbAoaVariant[] = ['base', 'off45', 'off60']
    expect(SPOT3.map((v) => uwbAoaRows(vs(v).nodes[ANC].uwb!)[0].sigma))
      .toEqual(['± 2.7°', '± 4.3°', '± 7.5°'])
    // it really is the LAST bearing of the run and not the truth
    for (const v of SPOT3) {
      const last = ofType(recs(v), 'UWB_AOA').at(-1)!
      expect(uwbAoaRows(vs(v).nodes[ANC].uwb!)[0].sigma, v).toBe(`± ${aoaSigmaDeg(last.thetaDeg).toFixed(1)}°`)
      expect(last.thetaDeg, v).not.toBe(last.trueThetaDeg)
    }
    expect(SPOT3.map((v) => aoaSigmaDeg(SPOTS[v].offBoresightDeg).toFixed(2))).toEqual(['2.74', '3.87', '5.47'])
    // "the mean fix error grow towards half a metre while the range error does not move"
    expect(SPOT3.map((v) => cm(mean(fixErrM(recs(v)))))).toEqual(['9.6', '26.5', '48.2'])
    expect(SPOT3.map((v) => cm(mean(ancRangeErrM(recs(v)))))).toEqual(['2.0', '2.0', '2.0'])
  })
})

describe('uwb-aoa · the half it cannot see', () => {
  it('"sin(180° − θ) = sin θ": the mirror is in the model, not in a branch', () => {
    for (const t of [0, 20, 45, 60, 89]) {
      expect(pdoaRad(180 - t, 9), String(t)).toBeCloseTo(pdoaRad(t, 9), 12)
      expect(azimuthFromPdoaDeg(pdoaRad(180 - t, 9), 9), String(t)).toBeCloseTo(t, 9)
    }
    expect(prose()).toContain('sin(180° − θ) = sin θ')
  })

  it('"the fourteen bearings come back as the base scene’s, to every digit"', () => {
    const behind = ofType(recs('behind'), 'UWB_AOA')
    const base = ofType(recs('base'), 'UWB_AOA')
    // identical to every decimal anything prints: what separates them is the 4e-16 rad of
    // phase that sin(180°) leaves behind, fourteen places below the last digit on screen
    expect(behind).toHaveLength(base.length)
    behind.forEach((a, i) => expect(a.thetaDeg, String(i)).toBeCloseTo(base[i].thetaDeg, 12))
    expect(behind.every((a) => a.trueThetaDeg === 180)).toBe(true)
    expect(behind.every((a) => Math.abs(a.thetaDeg) < 4 * aoaSigmaDeg(0))).toBe(true)
    expect(fmtRecord(behind[0])).toBe('anc-1 AoA ← badge-1: 2.3° (true 180.0°)')
    // "the badge, which has not moved" — only the anchor's Facing, 90° to −90°
    expect(tagXY('behind')).toEqual(tagXY('base'))
    expect(scenarioOf('behind').nodes[0].uwb!.yawDeg).toBe(-90)
    expect(scenarioOf('base').nodes[0].uwb!.yawDeg).toBe(90)
    // "The range is as right there as anywhere and the clamp never fires"
    expect(ancRangeErrM(recs('behind'))).toEqual(ancRangeErrM(recs('base')))
    expect(cm(mean(ancRangeErrM(recs('behind'))))).toBe('2.0')
    expect(behind.some((a) => Math.abs(a.thetaDeg) === 90)).toBe(false)
  })

  it('"the seven fixes land near (5.06, −1.47) m … twice the floor distance"', () => {
    const fs = ofType(recs('behind'), 'UWB_POSITION')
    expect(fs).toHaveLength(BLOCKS)
    expect([fs[0].x.toFixed(2), fs[0].y.toFixed(2)]).toEqual(['5.06', '-1.47'])
    expect(fmtRecord(fs[0])).toContain('(5.06, -1.47) m, true (5.00, 2.50), error 3.97 m')
    const errs = fixErrM(recs('behind'))
    expect([Math.min(...errs).toFixed(2), Math.max(...errs).toFixed(2)]).toEqual(['3.97', '4.03'])
    // "outside the room", and exactly twice the floor distance
    expect(fs.every((f) => f.y < 0)).toBe(true)
    expect(mean(errs)).toBeCloseTo(2 * horizM('behind'), 1)
    // the fix is the truth reflected in the boresight: the component across the boresight
    // axis is the base run's, with its sign turned over
    const baseAcross = split(recs('base'), 'base').across
    const behindAcross = split(recs('behind'), 'behind').across
    behindAcross.forEach((x, i) => expect(x, String(i)).toBeCloseTo(-baseAcross[i], 9))
    // "Put Facing back and the error returns to centimetres"
    const fixed = fixErrM(recs('base'))
    expect([cm(Math.min(...fixed)), cm(Math.max(...fixed))]).toEqual(['2.1', '15.6'])
    for (const n of [cm(Math.min(...fixed)), cm(Math.max(...fixed)), cm(mean(fixed))]) {
      expect(cell(0, 0, 5), n).toContain(n)
    }
    // "with the same tidy ellipse around it": the ellipse is the base run's, unchanged
    expect(fs.map((f) => f.ellipse.a)).toEqual(ofType(recs('base'), 'UWB_POSITION').map((f) => f.ellipse.a))
  })

  it('"the editor’s Facing field" exists, and yaw stays inside the schema', () => {
    for (const v of ALL) expect(Math.abs(scenarioOf(v).nodes[0].uwb!.yawDeg!), v).toBeLessThanOrEqual(180)
    const behind = uwbAoaScenario('behind')
    const outOfRange = {
      ...behind,
      nodes: behind.nodes.map((n): NodeCfg => (n.id === ANC ? { ...n, uwb: { ...n.uwb!, yawDeg: 270 } } : n)),
    }
    expect(() => ScenarioSchema.parse(outOfRange)).toThrow()
    // the reader is told which control to reach for, by the editor's own label
    expect(uwbAoa.tryThis[1]).toContain(STRINGS.editor.uwbYaw)
  })
})

/**
 * The procedure the 2026-09-23 amendment asks for ("mechanism before metaphor"):
 * the steps `measureAoa` and `emitAoaFix` take, in device.report.ts's order, and
 * the worked example that runs them on the base scene's first round. Every row
 * is recomputed here from `src/uwb/aoa.ts`'s own functions and the run's own
 * records — the bearing, the range, the height correction and the ellipse — so
 * the table is the engine's arithmetic and not a transcript of it.
 */
describe('uwb-aoa · the procedure, step by step', () => {
  /** The lesson's steps block of `numbers`. */
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbAoa.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  /** The worked example's table is the last of `numbers`. */
  const wcell = (row: number, col: number): string => {
    const ts = uwbAoa.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
    return ts[ts.length - 1].rows[row][col]
  }
  /** Round 0 of the base scene: two bearings, one range, one fix. */
  const round0 = () => {
    const rs = recs('base')
    const bearings = ofType(rs, 'UWB_AOA').slice(0, 2)
    const range = ofType(rs, 'UWB_RANGE')[0]
    const fix = ofType(rs, 'UWB_POSITION')[0]
    // the fix is solved from the LATER bearing of the round (device.report.ts keeps the last)
    const theta = bearings[1].thetaDeg
    const dz = ANCHOR_Z - TAG_Z
    const horiz = Math.sqrt(range.distM * range.distM - dz * dz)
    return { bearings, range, fix, theta, dz, horiz }
  }

  it('is a steps block on the main path, not in `deeper`, and runs in the engine’s own order', () => {
    expect(uwbAoa.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbAoa.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    // device.ts stamps, draws the timestamp noise, draws the carrier offset and only then calls
    // measureAoa; measureAoa takes the true azimuth, turns it into a phase, adds one draw of
    // AOA_SIGMA_PHI_RAD and inverts it; reportRange then pairs the bearing with the range and
    // emitAoaFix takes the height out before walking the leg
    // the standard and code names the procedure has to name, in the engine's order
    const joined = steps().items.join(' | ')
    const at = ['RMARKER', 'asin'].map((t) => joined.indexOf(t))
    for (const [i, x] of at.entries()) expect(x, String(i)).toBeGreaterThanOrEqual(0)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    for (const s of steps().items) expect(s.length).toBeGreaterThan(0)
  })

  it('the worked example’s bearing is a phase plus one draw, inverted by the engine’s arc sine', () => {
    const r = round0()
    // the badge stands on the boresight, so the phase the model computes is exactly zero
    const truth = trueAzimuthDeg(
      { x: ANCHOR_X, y: ANCHOR_Y, z: ANCHOR_Z }, YAW_IN, { ...tagXY('base'), z: TAG_Z },
    )
    expect(wcell(0, 1)).toBe(`${truth.toFixed(3)}°`)
    expect(pdoaRad(truth, 9)).toBe(0)
    expect(wcell(1, 1)).toBe('π·sin 0° = 0.000 rad')
    // the draw is the whole of the hardware: the phase the record implies, back through π·sin θ̂
    const phi = Math.PI * Math.sin(r.theta * (Math.PI / 180))
    expect(wcell(2, 1)).toBe(`${phi.toFixed(4)} rad`)
    expect(azimuthFromPdoaDeg(phi, 9)).toBeCloseTo(r.theta, 9)
    expect(wcell(3, 1)).toBe(`${r.theta.toFixed(3)}°`)
    expect(AOA_SIGMA_PHI_RAD).toBe(0.15)
  })

  it('the height comes out of the range before the leg is walked, exactly as emitAoaFix does', () => {
    const r = round0()
    expect(wcell(4, 1)).toBe(`${r.range.distM.toFixed(4)} m, true ${r.range.trueDistM.toFixed(4)}`)
    expect(r.dz.toFixed(2)).toBe('1.20')
    expect(wcell(5, 1)).toBe(`√(${r.range.distM.toFixed(4)}² − 1.20²) = ${r.horiz.toFixed(4)} m`)
    // walking the leg out along the anchor's Facing plus the bearing lands on the record's fix
    const bearing = (YAW_IN + r.theta) * (Math.PI / 180)
    expect(ANCHOR_X + r.horiz * Math.cos(bearing)).toBeCloseTo(r.fix.x, 9)
    expect(ANCHOR_Y + r.horiz * Math.sin(bearing)).toBeCloseTo(r.fix.y, 9)
    expect(wcell(6, 1)).toBe(
      `(${r.fix.x.toFixed(3)}, ${r.fix.y.toFixed(3)}) m, true (${r.fix.trueX.toFixed(3)}, ${r.fix.trueY.toFixed(3)})`,
    )
  })

  it('the reported error is the range one way and the leg times the bearing sigma the other', () => {
    const r = round0()
    const across = r.horiz * aoaSigmaDeg(r.theta) * (Math.PI / 180)
    const along = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)
    // the ellipse the record carries is those two, major first
    expect(r.fix.ellipse.a).toBeCloseTo(Math.max(across, along), 12)
    expect(r.fix.ellipse.b).toBeCloseTo(Math.min(across, along), 12)
    expect(wcell(7, 1)).toBe(`across ${(across * 100).toFixed(1)} cm, along ${(along * 100).toFixed(1)} cm`)
    // and the across term is the one that grows: it is the leg, not the range, that carries the angle
    expect(across).toBeGreaterThan(along)
    expect(r.fix.gdop).toBe(1)
  })

})

/**
 * The multipath limit, pinned both ways.
 *
 * This entry's headline — multipath cannot move a bearing — survived `scheduleEchoes`; its
 * justification did not. It read 「channel.ts 只投递一条直射路径」, which is now false: the
 * medium queues an echo per (receiver, object) whenever the scenario carries a `scatterers`
 * section. The headline holds for a better reason, and the sentence now gives it — an echo goes
 * to `deliverEcho`, which opens no reception, so `measureAoa` is never called for one.
 */
describe('uwb-aoa · multipath cannot move a bearing, and the reason is structural', () => {
  const text = uwbAoa.limits.map((l) => l.text).join('\n')

  it('says why an echo can never reach measureAoa', () => {
    expect(text).toContain('多径在这里对方位角毫无影响')
    expect(text).toContain('scheduleEchoes')
    expect(text).toContain('deliverEcho')
    expect(text).toContain('measureAoa 根本不会为一条回波被调用一次')
    // the half that was always true: the dominant real-world AoA error this engine cannot show
    expect(text).toContain('室内到达角最大的误差来源正是从墙上反射过来的那一路')
  })

  it('no longer justifies it with a medium that has no echoes', () => {
    expect(text).not.toContain('channel.ts 只投递一条直射路径')
  })

  it('and all four of its scenes carry no scatterers section, so none produces an echo', () => {
    const scenes = [uwbAoa.scenario, ...(uwbAoa.variants ?? []).map((v) => v.scenario)]
    expect(scenes).toHaveLength(4)
    for (const build of scenes) expect(build().scatterers).toBeUndefined()
    for (const v of ['base', 'off45', 'off60', 'behind'] as const) {
      expect(ofType(recs(v), 'UWB_ECHO')).toHaveLength(0)
    }
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Two of this lesson's tables were already read-backs — the log-line table's cells are
 * `fmtRecord` of the records they quote, and the worked example's are built out of round 0 —
 * so forty of the 136 printed figures were already watched. The prose was not: the figures in
 * `picture`, in the formula notes, in the three-spot table's labels, in `deeper`, `limits`,
 * `sources`, `tryThis` and the quiz all had their twin typed on this side of the file.
 *
 * Nothing new is measured here. Every assertion calls the same `recs`, `fixErrM`,
 * `ancRangeErrM`, `split`, `crossSigmaM`, `runExtra`, `wavelengthM`, `antennaSpacingM`,
 * `pdoaRad`, `azimuthFromPdoaDeg`, `aoaSigmaDeg` and `trueAzimuthDeg` the tests above call —
 * the figure is parsed **out of the lesson** instead of being written down beside it.
 */
describe('uwb-aoa · every figure the prose prints, read back out of it', () => {
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
  const NUMS = blockText(uwbAoa.numbers)
  const DEEP = blockText(uwbAoa.deeper)
  const LIMITS = blockText(uwbAoa.limits)
  const SRC = blockText(uwbAoa.sources)
  const TRY = blockText(uwbAoa.tryThis)
  const QUIZ = blockText(uwbAoa.quiz)

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
  const zh = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a numeral this file knows how to read`).not.toBeNull()
    return n!
  }
  const CH = uwbAoa.scenario().uwb!.channel
  const ANC_POS = { x: ANCHOR_X, y: ANCHOR_Y, z: ANCHOR_Z }
  const truthAt = (v: UwbAoaVariant, yaw = YAW_IN): number =>
    trueAzimuthDeg(ANC_POS, yaw, { ...tagXY(v), z: TAG_Z })
  const SIGMA_R_M = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)

  it('the carrier, the spacing and the channel they belong to — in the note and in `deeper`', () => {
    for (const [text, re, what] of [
      [NUMS, /在信道 (\d) 上，就是 ([\d.]+) cm 载波下相距 ([\d.]+) cm 的两根天线/, 'the formula’s note'],
      [DEEP, /信道 (\d) 的载波是 ([\d.]+) cm，天线间距 ([\d.]+) cm/, '`deeper`'],
    ] as const) {
      const [ch, lambda, spacing] = raw(text, re, `${what} on the antennas`)
      expect(val(ch!), `${what}: the channel this scene runs`).toBe(CH)
      same(lambda!, wavelengthM(CH) * 100, `${what}: the carrier that channel has`)
      same(spacing!, antennaSpacingM(CH) * 100, `${what}: and the spacing aoa.ts uses`)
    }
    // "channel 5's are 4.62 cm and 2.31 cm" — the other channel, and only the ratio matters
    const [other, oLambda, oSpacing] = raw(DEEP, /信道 (\d) 则是 ([\d.]+) cm 与 ([\d.]+) cm/,
      '`deeper` on the other channel')
    expect(val(other!), 'a channel this engine carries').not.toBe(CH)
    same(oLambda!, wavelengthM(val(other!) as 5 | 9) * 100, 'its carrier')
    same(oSpacing!, antennaSpacingM(val(other!) as 5 | 9) * 100, 'and its spacing')
    const [half] = figs(NUMS, /相距 λ\/(\d) 的两根天线/, 'step 3 on the spacing')
    expect(antennaSpacingM(CH) * half!, 'the spacing really is that fraction of the carrier')
      .toBeCloseTo(wavelengthM(CH), 12)
    expect(antennaSpacingM(val(other!) as 5 | 9) * half!, 'on the other channel too')
      .toBeCloseTo(wavelengthM(val(other!) as 5 | 9), 12)
    // "45° off boresight is 2.221 rad, 60° is 2.721 rad" — the same on both channels
    const [a1, p1, a2, p2] = raw(DEEP,
      /偏离正前方 (\d+)° 时 ([\d.]+) rad，(\d+)° 时 ([\d.]+) rad/, '`deeper` on the two phases')
    for (const [deg, rad] of [[a1!, p1!], [a2!, p2!]] as const) {
      same(rad, Math.abs(pdoaRad(-val(deg), CH)), `${deg}° off boresight: the phase it gives`)
      expect(pdoaRad(-val(deg), val(other!) as 5 | 9), `${deg}°: and the other channel agrees`)
        .toBeCloseTo(pdoaRad(-val(deg), CH), 12)
    }
    // "behind the anchor the sine repeats: sin(180° − θ) = sin θ"
    const [turn] = figs(DEEP, /sin\((\d+)° − θ\) = sin θ/, '`deeper` on the mirror')
    for (const t of [10, 45, 60, 80]) {
      expect(Math.sin(((turn! - t) * Math.PI) / 180), `${t}°: the identity really holds`)
        .toBeCloseTo(Math.sin((t * Math.PI) / 180), 12)
    }
  })

  it('the phase noise, what it is in degrees, and the bearing noise it inverts to', () => {
    const [rad, deg, ahead] = raw(NUMS,
      /相位噪声，([\d.]+) rad，约合 ([\d.]+)°。正前方它反解出 ([\d.]+)° 的方位角噪声/,
      'the second formula’s note')
    same(rad!, AOA_SIGMA_PHI_RAD, 'the phase noise aoa.ts carries')
    same(deg!, (AOA_SIGMA_PHI_RAD * 180) / Math.PI, 'the same thing in degrees')
    same(ahead!, aoaSigmaDeg(0), 'and the bearing noise it inverts to at boresight')
    // the same constant in `sources`, in `limits` and in step 3
    for (const [text, re, what] of [
      [SRC, /σ_φ = ([\d.]+) rad 的相位测量/, '`sources`'],
      [LIMITS, /σ_φ = ([\d.]+) rad 是 aoa\.ts/, '`limits`'],
      [NUMS, /接收机相位噪声的抽样，σ_φ = ([\d.]+) rad/, 'step 3'],
    ] as const) same(raw(text, re, what)[0]!, AOA_SIGMA_PHI_RAD, `${what}: the phase noise`)
    // the three σ_θ `deeper` and the quiz quote, each at the spot it belongs to
    const spots: UwbAoaVariant[] = ['base', 'off45', 'off60']
    const three = figs(DEEP, /模型在真实方位角处的 σ_θ 是 ([\d.]+)°、([\d.]+)° 与 ([\d.]+)°/,
      '`deeper` on the three σ_θ')
    three.forEach((s, i) => {
      same(String(s), aoaSigmaDeg(truthAt(spots[i]!)), `${spots[i]}: the σ_θ at its true azimuth`)
      same(cell(0, i, 2).replace('°', ''), aoaSigmaDeg(truthAt(spots[i]!)),
        `${spots[i]}: and the table’s own cell`)
    })
    const [qAhead, qDeg, qThere] = raw(QUIZ,
      /σ_φ\/\(π·cos θ\) 正前方 ([\d.]+)°，(\d+)° 处 ([\d.]+)°/, 'the first answer')
    same(qAhead!, aoaSigmaDeg(0), 'the quiz: the σ_θ at boresight')
    same(qThere!, aoaSigmaDeg(-val(qDeg!)), 'and the σ_θ at the angle it names')
    expect(val(qThere!), 'which really is the larger of the two').toBeGreaterThan(val(qAhead!))
    // the inspector's ± is the LAST bearing's, not the spot's — three readings, three runs
    const panel = figs(DEEP, /分别读作 ± ([\d.]+)°、± ([\d.]+)° 与 ± ([\d.]+)°/,
      '`deeper` on what the inspector shows')
    panel.forEach((p, i) => {
      const vs = initViewState(scenarioOf(spots[i]!))
      for (const r of recs(spots[i]!)) applyRecord(vs, r)
      expect(uwbAoaRows(vs.nodes[ANC].uwb!)[0]!.sigma, `${spots[i]}: the row the panel shows`)
        .toBe(`± ${p.toFixed(1)}°`)
    })
  })

  it('the three spots: where each stands, its true bearing, and what seven rounds give', () => {
    const spots: UwbAoaVariant[] = ['base', 'off45', 'off60']
    const [oneSigma] = figs(blockText(table(0).head), /横向 (\d)-σ/, 'the cross-range column head')
    spots.forEach((v, i) => {
      // the label: "straight ahead, 2 m" / "45° right, 4 m" / "60° right, 5 m"
      const label = cell(0, i, 0)
      const off = /右偏 (\d+)°/.exec(label)
      const [range] = raw(label, /(?:，|方 )([\d.]+) m$/, `row ${i}: the distance in the label`)
      same(range!, SPOTS[v].rangeM, `row ${i}: the distance that scene puts the badge at`)
      if (off !== null) {
        expect(val(off[1]!), `row ${i}: how far off boresight the label says`)
          .toBe(SPOTS[v].offBoresightDeg)
      }
      // the true azimuth cell, and the bearing the run reports as true
      const truth = truthAt(v)
      same(cell(0, i, 1).replace('°', ''), truth, `row ${i}: the true azimuth`)
      for (const a of ofType(recs(v), 'UWB_AOA')) {
        same(cell(0, i, 1).replace('°', ''), a.trueThetaDeg,
          `row ${i}: and every record agrees about it`)
      }
      // the cross-range column is rh · σ_θ, at the multiple its own head names
      same(cell(0, i, 3).replace(' cm', ''), oneSigma! * crossSigmaM(v) * 100,
        `row ${i}: the cross-range 1-σ`)
      // the fix-error cell: the range of the seven, and their mean
      const [lo, hi, avg] = raw(cell(0, i, 5), /([\d.]+)–([\d.]+) cm，平均 ([\d.]+)/,
        `row ${i}: the fix-error cell`)
      const errs = fixErrM(recs(v)).map((e) => e * 100)
      expect(errs, `row ${i}: seven rounds`).toHaveLength(BLOCKS)
      same(lo!, Math.min(...errs), `row ${i}: the best of the seven`)
      same(hi!, Math.max(...errs), `row ${i}: the worst`)
      same(avg!, mean(errs), `row ${i}: and their mean`)
      // the ranging-error cell is the same in all three rows, which is the table's whole point
      same(cell(0, i, 4).replace(' cm', ''), mean(ancRangeErrM(recs(v))) * 100,
        `row ${i}: the ranging error`)
      expect(cell(0, i, 4), `row ${i}: unchanged across the three rows`).toBe(cell(0, 0, 4))
    })
    // the ellipse column: the two semi-axes the records carry
    spots.forEach((v, i) => {
      const [a, b] = raw(cell(0, i, 6), /([\d.]+) × ([\d.]+) cm/, `row ${i}: the ellipse cell`)
      // the FIRST fix of the run, which is the one the column was taken from
      const f0 = ofType(recs(v), 'UWB_POSITION')[0]!
      same(a!, f0.ellipse.a * 100, `row ${i}: the long semi-axis`)
      same(b!, f0.ellipse.b * 100, `row ${i}: and the short one`)
      same(b!, SIGMA_R_M * 100, `row ${i}: which is the range σ and never moves`)
    })
    // the two experiment labels are the two variants, by what they put the badge at
    const [d45, a45, d60, a60] = figs(TRY, /载入“(\d) m 处 (\d+)°”，再载入“(\d) m 处 (\d+)°”/,
      '`tryThis` on the two spots')
    expect([d45, a45], 'the first scene it names')
      .toEqual([SPOTS.off45.rangeM, SPOTS.off45.offBoresightDeg])
    expect([d60, a60], 'and the second')
      .toEqual([SPOTS.off60.rangeM, SPOTS.off60.offBoresightDeg])
    expect(uwbAoa.variants![V.off45]!.label, 'the first is a variant label')
      .toBe(`${d45} m 处 ${a45}°`)
    expect(uwbAoa.variants![V.off60]!.label, 'and so is the second')
      .toBe(`${d60} m 处 ${a60}°`)
  })

  it('the height correction, in metres and in the centimetres it would have cost', () => {
    const [slant, plan, off] = raw(NUMS,
      /射频量到 ([\d.]+) m，平面图上是 ([\d.]+) m。原样平着走出去，会把点钉远 ([\d.]+) cm/,
      '`numbers` on the height correction')
    const dz = ANCHOR_Z - TAG_Z
    same(slant!, Math.hypot(SPOTS.off45.rangeM, dz), 'the slant range at that spot')
    same(plan!, SPOTS.off45.rangeM, 'the plan distance it really is')
    same(off!, (Math.hypot(SPOTS.off45.rangeM, dz) - SPOTS.off45.rangeM) * 100,
      'and how far out the uncorrected leg would land')
    // step 2 and the worked example's first row: the badge stands on the boresight
    same(raw(NUMS, /本场景是 ([\d.]+)°，因为胸牌正站在正前方/, 'step 2')[0]!, truthAt('base'),
      'the true azimuth of the base scene')
    // step 6: GDOP is 1.00 by construction, and the along term is the range σ
    for (const [text, re, what] of [
      [NUMS, /GDOP 按构造恒为 ([\d.]+)。/, 'step 6'],
      [DEEP, /这里的 GDOP 恒为 ([\d.]+)、无话可说/, '`deeper`'],
    ] as const) {
      const [g] = raw(text, re, `${what} on the GDOP`)
      for (const f of ofType(recs('base'), 'UWB_POSITION')) {
        same(g, f.gdop, `${what}: the GDOP every fix of one anchor carries`)
      }
    }
    same(raw(NUMS, /沿射线是距离的 ([\d.]+) cm/, 'step 6 on the along term')[0]!,
      SIGMA_R_M * 100, 'the range σ the ellipse’s short axis is')
    // `sources`: σ_r = c · σ_ts / √2 at 100 ps
    const [sigmaCm] = raw(SRC, /([\d.]+) cm 的测距 σ/, '`sources` on the range σ')
    const [root, ps] = figs(SRC, /σ_r = c · σ_ts \/ √(\d)，代入 (\d+) ps 的时间戳噪声/,
      '`sources` on where it comes from')
    expect(ps, 'the timestamp noise the session carries').toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    same(sigmaCm!, SIGMA_R_M * 100, 'the range σ it gives')
    expect((C_M_PER_NS * (ps! / 1000)) / Math.sqrt(root!),
      'and the divisor the formula names').toBeCloseTo(SIGMA_R_M, 12)
    // `sources` also names the channel the scene runs
    expect(val(raw(SRC, /场景自己的取值是信道 (\d)/, '`sources` on the scene')[0]!),
      'the channel it runs on').toBe(CH)
    // `deeper`: along-track, no fix of the three spots is over 9 cm
    const [alongCm] = figs(DEEP, /二十一次定位无一超过 (\d+) cm/,
      '`deeper` on the along-track error')
    const alongs = (['base', 'off45', 'off60'] as UwbAoaVariant[])
      .flatMap((v) => split(recs(v), v).along.map(Math.abs))
    expect(alongs, 'twenty-one fixes').toHaveLength(3 * BLOCKS)
    expect(Math.ceil(Math.max(...alongs) * 100), 'and the bound is the tightest whole centimetre')
      .toBe(alongCm)
  })

  it('the two clamps, where each begins to bite, and the spot `deeper` sends the badge to', () => {
    // the azimuth clamp: ±90°, wherever the lesson names it
    for (const [text, re, what] of [
      [NUMS, /截断在 ±(\d+)°/, 'the formula'],
      [NUMS, /θ̂ = asin\(φ\/π\)，截断在 ±(\d+)°/, 'step 4'],
      [DEEP, /读数被钉在 ±([\d.]+)° 时/, '`deeper`'],
      [LIMITS, /读数被钉成 ±([\d.]+)°/, '`limits`'],
      [SRC, /反正弦及其 ±(\d+)° 截断/, '`sources`'],
      [QUIZ, /是 ±(\d+)° 的截断把读数折了回来/, 'the third question’s first option'],
    ] as const) {
      const [clamp] = raw(text, re, `${what} on the azimuth clamp`)
      same(clamp, azimuthFromPdoaDeg(Math.PI * 1.4, CH), `${what}: where the arc sine is pinned`)
      same(clamp, -azimuthFromPdoaDeg(-Math.PI * 1.4, CH), `${what}: and on the other side`)
    }
    // "azimuthFromPdoaDeg pins the arc sine's argument at ±1" — measured, not transcribed
    const [arg] = figs(LIMITS, /把反正弦的自变量钉在 ±(\d)/, '`limits` on the argument clamp')
    expect(azimuthFromPdoaDeg(Math.PI * arg!, CH),
      'at that argument the reading is already the clamp').toBe(90)
    let lo = 0
    let hi = 2
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      if (azimuthFromPdoaDeg(Math.PI * mid, CH) < 90) lo = mid
      else hi = mid
    }
    expect(Number(hi.toFixed(6)), 'and that is exactly where it starts being pinned').toBe(arg)
    // the σ_θ clamp: 45°, and the angle at which the formula reaches it
    for (const [text, re, what] of [
      [DEEP, /σ_θ 本身也截断在 (\d+)°/, '`deeper`'],
      [SRC, /σ_θ 的 (\d+)° 截断/, '`sources`'],
      [LIMITS, /又把 σ_θ 钉在 (\d+)°/, '`limits`'],
    ] as const) {
      const [clamp] = raw(text, re, `${what} on the σ_θ clamp`)
      same(clamp, aoaSigmaDeg(90), `${what}: what σ_θ is pinned at`)
      expect(val(clamp), 'which is the constant aoa.ts exports').toBe(AOA_SIGMA_CLAMP_DEG)
    }
    const [cross] = raw(DEEP, /公式大约在偏离正前方 ±([\d.]+)° 处到达这个值/,
      '`deeper` on where the formula reaches it')
    let clo = 0
    let chi = 90
    for (let i = 0; i < 200; i++) {
      const mid = (clo + chi) / 2
      if (aoaSigmaDeg(mid) < AOA_SIGMA_CLAMP_DEG) clo = mid
      else chi = mid
    }
    same(cross!, clo, 'the angle at which σ_θ first hits its clamp')
    // the 80° spot: its coordinates, its σ_θ, the pinned readings and the worst ellipse
    const [sx, sy, sr, sdeg] = raw(DEEP,
      /把胸牌拖到 \(([\d.]+), ([\d.]+)\)——(\d) m 处偏 (\d+)°——/, '`deeper` on the far spot')
    const far = {
      x: ANCHOR_X + val(sr!) * Math.sin((val(sdeg!) * Math.PI) / 180),
      y: ANCHOR_Y + val(sr!) * Math.cos((val(sdeg!) * Math.PI) / 180),
    }
    same(sx!, far.x, 'the x that spot really is')
    same(sy!, far.y, 'and the y')
    const [sigma, ofThem, pinned, clampedTo, maxA] = raw(DEEP,
      /σ_θ 是 ([\d.]+)°，(.+?)个方位角里有(.)个被钉在 −([\d.]+)°，最差的那个椭圆半长轴达 ([\d.]+) m/,
      '`deeper` on what happens there')
    same(sigma!, aoaSigmaDeg(-val(sdeg!)), 'the σ_θ at that angle')
    const base = uwbAoaScenario('base')
    const run80 = runExtra('off80', () => ({
      ...base,
      nodes: base.nodes.map((n): NodeCfg => (n.id === TAG ? { ...n, pos: { ...n.pos, ...far } } : n)),
    }))
    const bearings = ofType(run80, 'UWB_AOA')
    expect(bearings, 'the bearings that run leaves').toHaveLength(zh(ofThem!))
    const clampDeg = azimuthFromPdoaDeg(Math.PI * 1.4, CH)
    same(clampedTo!, clampDeg, 'the value the pinned ones are pinned to')
    expect(bearings.filter((b) => b.thetaDeg === -clampDeg), 'and how many are pinned there')
      .toHaveLength(zh(pinned!))
    same(maxA!, Math.max(...ofType(run80, 'UWB_POSITION').map((f) => f.ellipse.a)),
      'the longest semi-axis that run produces')
  })

  it('behind the anchor: the azimuth, the bearings it repeats, and where the fixes land', () => {
    const [behindDeg] = raw(DEEP, /胸牌偏离正前方 ([\d.]+)°/, '`deeper` on the mirror scene')
    same(behindDeg!, Math.abs(truthAt('behind', YAW_WALL)), 'how far off boresight it then is')
    // "the fourteen bearings match the base scene to every digit"
    const behind = ofType(recs('behind'), 'UWB_AOA')
    const ahead = ofType(recs('base'), 'UWB_AOA')
    expect(behind, 'as many bearings as the base scene').toHaveLength(ahead.length)
    behind.forEach((a, i) => {
      expect(a.thetaDeg, `bearing ${i} comes back as the base scene’s`)
        .toBeCloseTo(ahead[i]!.thetaDeg, 12)
    })
    // "so the seven fixes land near (5.06, −1.47) m, 3.97 to 4.03 m from the badge — twice the
    //  plan distance, and outside the room"
    const [fx, fy] = raw(DEEP, /七次定位落在 \(([\d.]+), −([\d.]+)\) m 一带/,
      '`deeper` on where they land')
    const fs = ofType(recs('behind'), 'UWB_POSITION')
    expect(fs, 'seven of them').toHaveLength(BLOCKS)
    // the first of the seven, which is what 「一带」 refers to: the others sit within a few
    // centimetres of it, and that is checked below by the spread of their distances
    same(fx!, fs[0]!.x, 'the x the first of them lands at')
    same(fy!, -fs[0]!.y, 'and the y')
    for (const f of fs) {
      expect(Math.hypot(f.x - fs[0]!.x, f.y - fs[0]!.y), 'and the rest land thereabouts')
        .toBeLessThan(0.3)
    }
    const [dLo, dHi, times] = raw(DEEP, /离胸牌 ([\d.]+) 到 ([\d.]+) m——正是平面距离的(.)倍/,
      '`deeper` on how far off they are')
    const offs = fs.map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
    same(dLo!, Math.min(...offs), 'the closest of the seven')
    same(dHi!, Math.max(...offs), 'and the furthest')
    expect(mean(offs) / SPOTS.behind.rangeM, 'which is that multiple of the plan distance')
      .toBeCloseTo(zh(times!), 1)
    expect(Math.min(...fs.map((f) => f.y)), 'and it is outside the room')
      .toBeLessThan(0)
  })

  /*
   * **A table's read-back has to cover the LABEL column too.**
   *
   * Both of this lesson's already-read-back tables check column 1 — the log-line table's cells
   * are `fmtRecord` of the records they quote, the worked example's are built out of round 0 —
   * and neither ever looks at column 0. The sweep of 2026-10-13 planted four figures that live
   * there with the suite green: the instant of each of the two bearings, the height that comes
   * out of the range, and the anchor's own Facing. Each is read here off the label that prints it.
   */
  it('the label column of both tables: the two instants, the height and the Facing', () => {
    const as = ofType(recs('base'), 'UWB_AOA')
    same(raw(cell(1, 0, 0), /首个方位角，([\d.]+) µs 处/, 'the first row’s label')[0]!,
      as[0]!.t / 1000, 'when the first bearing was measured')
    const [second] = raw(cell(1, 1, 0), /第二个，来自 Final，([\d. ]+) ms 处/,
      'the second row’s label')
    same(second!, as[1]!.t / 1e6, 'and when the second was')
    expect(as[1]!.t, 'which is the one the Final carried, later in the round')
      .toBeGreaterThan(as[0]!.t)
    // the worked example's own two labels
    const ws = uwbAoa.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
    const label = (row: number): string => ws[ws.length - 1]!.rows[row]![0]!
    same(raw(label(5), /扣掉 Δz = ([\d.]+) m/, 'the height row’s label')[0]!,
      ANCHOR_Z - TAG_Z, 'the height that comes out of the range')
    const [facing] = figs(label(6), /沿 (\d+)° \+ θ̂ 走出去/, 'the leg row’s label')
    expect(facing, 'the Facing the leg is walked from')
      .toBe(uwbAoa.scenario().nodes[0]!.uwb!.yawDeg)
    expect(facing, 'which is the one the scene ships').toBe(YAW_IN)
  })

  it('the inspector’s range row, and the two tallies the last questions quote', () => {
    const vs = initViewState(uwbAoa.scenario())
    for (const r of recs('base')) applyRecord(vs, r)
    const row = uwbRangeRows(vs.nodes[ANC].uwb!, STRINGS.uwb)[0]!
    const [measured, truth, diff, rounds] = raw(DEEP,
      /距离读作 ([\d.]+) m，真值 ([\d.]+)，差 −([\d.]+) cm，(.)轮 DS-TWR/,
      '`deeper` on the range row beside it')
    expect(row.measured, 'what the panel shows as measured').toBe(`${measured} m`)
    expect(row.trueDist, 'and as true').toBe(`${truth} m`)
    expect(row.error, 'and the difference between them').toBe(`-${diff} cm`)
    expect(row.rounds, 'over that many rounds').toBe(String(zh(rounds!)))
    // the second question: the mean fix error at the furthest spot, and its range error
    const [fixCm, rangeCm] = figs(QUIZ, /定位平均偏 (\d+) cm，它的距离却准到 (\d+) cm/,
      'the second question')
    same(String(fixCm), mean(fixErrM(recs('off60'))) * 100, 'the mean fix error there')
    same(String(rangeCm), mean(ancRangeErrM(recs('off60'))) * 100, 'and its mean range error')
    expect(fixCm, 'the fix error really is the larger').toBeGreaterThan(rangeCm!)
    same(raw(QUIZ, /rh·σ_θ 是 ([\d.]+) cm，正是椭圆的长轴/, 'the second answer')[0]!,
      crossSigmaM('off60') * 100, 'the cross-range 1-σ it names')
    // 「正是椭圆的长轴」 names WHICH axis it is, and that is checkable per round: each
    // fix's long semi-axis is its own leg times σ_θ, and its short one is the range σ
    for (const f of ofType(recs('off60'), 'UWB_POSITION')) {
      const leg = Math.hypot(f.trueX - ANCHOR_X, f.trueY - ANCHOR_Y)
      expect(f.ellipse.a, 'the long axis is the cross-range term')
        .toBeGreaterThan(0.8 * leg * aoaSigmaDeg(truthAt('off60')) * (Math.PI / 180))
      expect(f.ellipse.b, 'and the short one is the range σ').toBeCloseTo(SIGMA_R_M, 12)
      expect(f.ellipse.a, 'so the ellipse really does lie across the line of sight')
        .toBeGreaterThan(f.ellipse.b)
    }
    // `limits`: the timestamp σ is scaled by SINR and the phase σ is not
    const [sigmaMult, upTo] = raw(LIMITS, /时间戳的 (\d)σ 会按信干噪比放大最多(.)倍/,
      '`limits` on what scales and what does not')
    expect(val(sigmaMult!), 'the multiple of σ that line is about').toBe(1)
    const scales = Array.from({ length: 81 }, (_x, i) => tsNoiseScale(i - 20))
    expect(Math.max(...scales) / Math.min(...scales), 'the range tsNoiseScale spans')
      .toBeCloseTo(zh(upTo!), 6)
  })
})
