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
 * budgets, the bilingual walk, the first watch — is the kit's `lessonShapeSuite`, and the
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
import { UWB_CHANNEL_MHZ } from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbAoaRows, uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

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

// The contract every migrated lesson owes: the sections, the section budgets, the stated
// minutes, the jump targets, the bilingual walk and the first watch. The window is what
// `npx tsx scripts/lesson-dump.ts uwb-aoa en` reports for why + outcomes + terms + picture
// + numbers.
lessonShapeSuite(uwbAoa, { proseMax: 1195 })

describe('uwb-aoa · the lesson', () => {
  it('sits in module 14, needs the double-sided and the geometry lesson, and names four new words', () => {
    expect(uwbAoa.id).toBe('uwb-aoa')
    expect(uwbAoa.module).toBe(14)
    // uwb-geometry as well as uwb-dstwr: a whole picture section is "An ellipse across the
    // line of sight", the numbers table carries an Ellipse column and the log line a GDOP.
    expect(uwbAoa.needs).toEqual(['uwb-dstwr', 'uwb-geometry'])
    expect(uwbAoa.terms!.map((t) => t.term)).toEqual(['AoA', 'phase difference', 'boresight', 'field of view'])
    // the reader is sent to the bearing itself, not to the Poll that carried it
    const watch = uwbAoa.picture!.find((b) => b.kind === 'watch') as Extract<Block, { kind: 'watch' }>
    expect(uwbAoa.jumps[watch.jump!].label).toBe('the bearing the anchor takes off it')
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
    expect(src).toContain('lists angle of arrival among the results a ranging round may report')
    expect(src).toContain('two receive antennas half a wavelength apart')
    expect(src).toContain('a phase measurement with σ_φ = 0.15 rad')
    expect(src).toContain('the mirror behind the anchor')
    expect(src).toContain('in the style of the FiRa profiles rather than of anything the standard specifies')
    // "DS is not optional here" is a scene choice, so it is owned in `sources` too
    expect(src).toContain('a double-sided session')
  })

  it('it is the last lesson of module 14, and UWB Tier 3 follows it', () => {
    expect(MODULES[14]).toEqual({ tier: 5, title: { en: 'Other ranging modes', zh: '其他测距模式' } })
    expect(MODULES[uwbAoa.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-aoa') - 1]).toBe('uwb-ul-tdoa')
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-aoa') + 1]).toBe('uwb-mms')
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
    expect(uwbAoa.variants!.map((x) => x.label)).toEqual(['45° at 4 m', '60° at 5 m', 'Behind the anchor'])
    expect(uwbAoa.variants!.map((x) => x.label)).toEqual(['4 m 处 45°', '5 m 处 60°', '锚点背后'])
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
    expect([cell(0, 1, 0), cell(0, 2, 0)]).toEqual(['45° to its right, 4 m', '60° to its right, 5 m'])
    expect(uwbAoa.tryThis[0]).toContain('Load “45° at 4 m”, then “60° at 5 m”')
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
    expect(uwbAoa.sources!.map((s) => s).join('\n'))
      .toContain('the anchor would hold a bearing and never compute a range to cross it with')
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
    const en = prose()
    expect(en).toContain('on channel 9, antennas 1.88 cm apart under a 3.75 cm carrier')
    expect(en).toContain('Channel 9’s carrier is 3.75 cm with antennas 1.88 cm apart; channel 5’s are 4.62 cm and 2.31 cm')
    // and the ratio really is all that matters: the same true azimuth gives the same phase and
    // the same estimate on both channels
    for (const t of [0, -45, -60, 80]) {
      expect(pdoaRad(t, 5), String(t)).toBeCloseTo(pdoaRad(t, 9), 12)
      expect(azimuthFromPdoaDeg(pdoaRad(t, 9), 5), String(t)).toBeCloseTo(azimuthFromPdoaDeg(pdoaRad(t, 9), 9), 12)
    }
  })

  it('the formula is the shipped one, and nothing wraps inside the field of view', () => {
    expect(formulas()).toHaveLength(2)
    expect(formulas()[0].text).toBe('Δφ = 2π·(d/λ)·sin θ = π·sin θ   (at d = λ/2)\nθ̂ = asin(Δφ/π),  clamped to ±90°')
    expect(formulas()[1].text).toBe('σ_θ = σ_φ / (π·cos θ)')
    for (const f of formulas()) expect(f.text.length).toBeGreaterThan(0)
    // "The whole field of view maps onto one turn of phase, so nothing wraps"
    expect(pdoaRad(90, 9)).toBeCloseTo(Math.PI, 12)
    expect(pdoaRad(-90, 9)).toBeCloseTo(-Math.PI, 12)
    expect(pdoaRad(0, 9)).toBe(0)
    // "Going deeper": "2.221 rad at 45° off boresight, 2.721 rad at 60°, and π at the edge"
    expect(Math.abs(pdoaRad(-45, 9)).toFixed(3)).toBe('2.221')
    expect(Math.abs(pdoaRad(-60, 9)).toFixed(3)).toBe('2.721')
    expect(prose()).toContain('2.221 rad at 45° off boresight, 2.721 rad at 60°, and π at the edge of the field of view')
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
    expect(prose()).toContain('0.15 rad or about 8.6°')
    expect(prose()).toContain('Straight ahead it inverts to 2.74° of bearing noise')
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
    expect(prose()).toContain('σ_θ is 15.75°, six of the fourteen bearings come back pinned at −90.0°, and the worst ellipse has a semi-major axis of 3.16 m')
    expect(prose()).toContain('about ±86.5° off boresight')
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
    expect(prose()).toContain('GDOP is 1.00 here by construction and has nothing to say')
    // "The 2.12 cm range sigma is the model constant the positioning lessons use"
    expect((rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(2)).toBe('2.12')
    expect(uwbAoa.sources!.map((s) => s).join('\n'))
      .toContain('The 2.12 cm range sigma is the model constant the positioning lessons use, σ_r = c · σ_ts / √2 at 100 ps of timestamp noise')
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
  })

  it('the log table is the round, line for line', () => {
    const as = ofType(rs, 'UWB_AOA')
    expect(as[0].t).toBe(197_636)
    expect(as[1].t).toBe(4_193_534)
    expect(cell(1, 0, 0)).toBe('First bearing, at 197.636 µs')
    expect(cell(1, 0, 1)).toBe(fmtRecord(as[0]))
    expect(cell(1, 0, 1)).toBe('anc-1 AoA ← badge-1: 2.3° (true 0.0°)')
    expect(cell(1, 1, 0)).toBe('Second, off the Final, at 4.193 534 ms')
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
    expect(uwbAoa.observe[1]).toContain('Three lines land together at the end of the round')
    // "always with the later bearing": the ellipse is turned a quarter turn from yaw + θ̂ of the
    // SECOND bearing of the round, not the first
    const fix = ofType(rs, 'UWB_POSITION')[0]
    const bearingRad = (YAW_IN + as[1].thetaDeg) * (Math.PI / 180)
    expect(fix.ellipse.thetaRad).toBeCloseTo(bearingRad + Math.PI / 2, 12)
    expect(uwbAoa.observe[1]).toContain('always with the later bearing, measured closest in time to the range it crosses')
  })

  it('the anchor holds the bearing, the badge holds the fix — the table’s last row', () => {
    const vs = initViewState(uwbAoa.scenario())
    for (const r of rs) applyRecord(vs, r)
    const a = vs.nodes[ANC].uwb!
    // "The range row beside it reads 2.31 m against a true 2.33, −2.4 cm, over seven rounds of DS-TWR"
    expect(uwbRangeRows(a, STRINGS.en.uwb)).toEqual([{
      peer: TAG, measured: '2.31 m', trueDist: '2.33 m', error: '-2.4 cm',
      fom: '97 % within 0.5 ns', rounds: String(BLOCKS), method: 'DS-TWR',
    }])
    expect(prose()).toContain('reads 2.31 m against a true 2.33, −2.4 cm, over seven rounds of DS-TWR')
    expect(uwbAoaRows(a)).toEqual([{
      peer: TAG, measured: '-3.7°', trueTheta: '0.0°', error: '-3.7°',
      sigma: '± 2.7°', rounds: String(2 * BLOCKS),
    }])
    // "A bearing belongs to the anchor that measured it, a fix to whoever it is of"
    expect(a.position).toBeNull()
    const t = vs.nodes[TAG].uwb!
    expect(uwbAoaRows(t)).toEqual([])
    const row = uwbFixRow(t.position!, STRINGS.en.uwb)
    expect(row).toEqual({
      estimate: '(5.13, 2.47) m', truth: '(5.00, 2.50) m', error: '13.3 cm',
      gdop: '1.00', ellipse: '9.4 × 2.1 cm', method: 'angle of arrival',
    })
    expect(uwbFixRow(t.position!, STRINGS.zh.uwb).method).toBe('到达角 (AoA)')
    expect(cell(1, 4, 0)).toBe('The badge’s row, after seven rounds')
    expect(cell(1, 4, 1))
      .toBe(`${row.estimate}, true ${row.truth}, ${row.error}, GDOP ${row.gdop}, ellipse ${row.ellipse}`)
    expect(uwbAoa.observe[1]).toContain('Open the badge and the fix is in its lane')
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
      expect(cell(0, row, 5), v).toBe(`${cm(Math.min(...fe))}–${cm(Math.max(...fe))} cm, mean ${cm(mean(fe))}`)
    }
    expect([cell(0, 0, 3), cell(0, 1, 3), cell(0, 2, 3)]).toEqual(['9.5 cm', '27.0 cm', '47.7 cm'])
    // "The range error is the same in all three rows"
    expect([cell(0, 0, 4), cell(0, 1, 4), cell(0, 2, 4)]).toEqual(['2.0 cm', '2.0 cm', '2.0 cm'])
    expect([cell(0, 0, 5), cell(0, 1, 5), cell(0, 2, 5)])
      .toEqual(['2.1–15.6 cm, mean 9.6', '5.8–44.5 cm, mean 26.5', '10.4–87.7 cm, mean 48.2'])
    // "grows fivefold", to the decimals the table prints
    expect(crossSigmaM('off60') / crossSigmaM('base')).toBeGreaterThan(4.5)
    expect(table(0).head).toHaveLength(7)
    expect(table(0).rows.every((r) => r.length === 7)).toBe(true)
    expect(prose()).toContain('the cross-range error rh·σ_θ grows fivefold and takes the fix error with it')
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
    expect(prose()).toContain('all twenty-one of them stay inside 9 cm, under four times the range sigma')
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
    expect(prose()).toContain('The ellipse is those two measurements as semi-axes, a quarter turn from the bearing; its short axis never moves')
    expect(uwbAoa.tryThis[0]).toContain('Watch the ellipse stretch while its short axis stands still')
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
    const en = prose()
    expect(en).toContain('the radio measures 4.176 m where the plan shows 4.000')
    expect(en).toContain('that would plant the point 17.6 cm too far')
    expect(en).toContain('the fix walks out √(r² − Δz²) instead')
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
    expect(prose()).toContain('± 2.7°, ± 4.3° and ± 7.5° at the three spots, where the model’s σ_θ at the true bearings is 2.74°, 3.87° and 5.47°')
    expect(uwbAoa.observe[0]).toContain('It does this on every frame from the badge, so one round leaves two bearings')
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
    expect(uwbAoa.tryThis[1]).toContain('Only the anchor’s Facing changed, so it now looks at its own wall')
    // "The range is as right there as anywhere and the clamp never fires"
    expect(ancRangeErrM(recs('behind'))).toEqual(ancRangeErrM(recs('base')))
    expect(cm(mean(ancRangeErrM(recs('behind'))))).toBe('2.0')
    expect(behind.some((a) => Math.abs(a.thetaDeg) === 90)).toBe(false)
    expect(uwbAoa.quiz[2].explain).toContain('The range is as right there as anywhere and the clamp never fires')
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
    expect(cell(0, 0, 5)).toBe(`${cm(Math.min(...fixed))}–${cm(Math.max(...fixed))} cm, mean ${cm(mean(fixed))}`)
    // "with the same tidy ellipse around it": the ellipse is the base run's, unchanged
    expect(fs.map((f) => f.ellipse.a)).toEqual(ofType(recs('base'), 'UWB_POSITION').map((f) => f.ellipse.a))
    const en = prose()
    expect(en).toContain('The seven fixes then land near (5.06, −1.47) m, 3.97 to 4.03 m from the badge — twice the floor distance, outside the room')
    expect(en).toContain('Facing the wall, the badge is 180.0° off boresight')
    expect(uwbAoa.tryThis[1]).toContain('Put Facing back and the error returns to centimetres')
  })

  it('"the editor’s Facing field" exists in both languages, and yaw stays inside the schema', () => {
    expect(STRINGS.en.editor.uwbYaw).toBe('Facing')
    expect(STRINGS.zh.editor.uwbYaw).toBe('朝向')
    expect(STRINGS.en.editor.uwbAoa).toContain('Angle of arrival')
    expect(STRINGS.zh.editor.uwbAoa.length).toBeGreaterThan(0)
    for (const v of ALL) expect(Math.abs(scenarioOf(v).nodes[0].uwb!.yawDeg!), v).toBeLessThanOrEqual(180)
    const behind = uwbAoaScenario('behind')
    const outOfRange = {
      ...behind,
      nodes: behind.nodes.map((n): NodeCfg => (n.id === ANC ? { ...n, uwb: { ...n.uwb!, yawDeg: 270 } } : n)),
    }
    expect(() => ScenarioSchema.parse(outOfRange)).toThrow()
    // the reader is told which control to reach for, in both languages
    expect(uwbAoa.tryThis[1]).toContain('Facing')
    expect(uwbAoa.tryThis[1]).toContain('朝向')
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
    const order = ['stamps the RMARKER', 'true azimuth', 'phase', 'asin', 'slant', 'Walk that leg']
    order.forEach((token, i) => expect(steps().items[i], token).toContain(token))
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

  it('the picture says the model has one receive chain, where the reader first meets the two antennas', () => {
    // the amendment asks for a simplification to be named where the reader meets it, not in `deeper`
    const pic = uwbAoa.picture!.filter((b) => (b.kind ?? 'p') === 'p')
      .map((b) => (b as Extract<Block, { kind?: 'p' }>).text)
    const en = pic.map((t) => t).join('\n')
    expect(en).toContain('The simulator has neither')
    expect(pic.some((t) => t.includes('仿真器两路都没有'))).toBe(true)
    // it is said in the picture, and the first two paragraphs are where the antennas are introduced
    expect(pic.slice(0, 2).some((t) => t.includes('The simulator has neither'))).toBe(true)
  })
})
