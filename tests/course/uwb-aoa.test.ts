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
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_X, ANCHOR_Y, ANCHOR_Z, SPOTS, TAG_Z, YAW_IN, YAW_WALL,
  tagXY, uwbAoa, uwbAoaScenario, type UwbAoaVariant,
} from '../../src/course/uwb/uwb-aoa'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n, Lesson } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, OBSERVE_MINUTES, TIERS, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
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

const memo = new Map<string, TLRecord[]>()
const runOf = (key: string, build: () => Scenario): TLRecord[] => {
  if (!memo.has(key)) memo.set(key, [...new Simulation(build()).runUntil(RUN_NS).records])
  return memo.get(key)!
}
const recs = (v: UwbAoaVariant): TLRecord[] => runOf(v, () => scenarioOf(v))

const of = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const cm = (m: number): string => (m * 100).toFixed(1)

/** Fix errors in metres, in the order the anchor emitted them. */
const fixErrM = (rs: TLRecord[]): number[] =>
  of(rs, 'UWB_POSITION').map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
/** |measured − true| of every range the anchor reported, in metres. */
const ancRangeErrM = (rs: TLRecord[]): number[] =>
  of(rs, 'UWB_RANGE').filter((r) => r.node === ANC).map((r) => Math.abs(r.distM - r.trueDistM))
/**
 * Each fix split into its component along the true anchor→badge ray and its component
 * across it. This is the whole argument of the lesson's ellipse section, so it is measured
 * rather than asserted: the range owns the first and the bearing owns the second.
 */
const split = (rs: TLRecord[], v: UwbAoaVariant): { along: number[]; across: number[] } => {
  const t = tagXY(v)
  const bx = t.x - ANCHOR_X, by = t.y - ANCHOR_Y
  const L = Math.hypot(bx, by)
  const fs = of(rs, 'UWB_POSITION')
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

/** Everything a learner reads of this lesson, joined — for "is this number actually printed?". */
const lessonProse = (l: Lesson): string => {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.en === 'string') { out.push(o.en); return }
    for (const [k, vv] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(vv)
  }
  walk({ body: l.body, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz })
  return out.join('\n')
}
const prose = (): string => lessonProse(uwbAoa)

const tables = (): Extract<Block, { kind: 'table' }>[] =>
  uwbAoa.body!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
const cell = (row: number, col: number): string => tables()[0].rows[row][col].en

const ALL: UwbAoaVariant[] = ['base', 'off45', 'off60', 'behind']

describe('uwb-aoa · lesson shape', () => {
  it('the scenario and its three variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbAoa.scenario())).not.toThrow()
    expect(uwbAoa.variants).toHaveLength(3)
    for (const v of uwbAoa.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(uwbAoa.variants!.map((x) => x.label.en)).toEqual(['45° at 4 m', '60° at 5 m', 'Behind the anchor'])
    expect(uwbAoa.variants!.map((x) => x.label.zh)).toEqual(['4 m 处 45°', '5 m 处 60°', '锚点背后'])
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbAoa) / 150
      + OBSERVE_MINUTES * uwbAoa.observe.length + TRY_MINUTES * uwbAoa.tryThis.length
    expect(lessonMinutes(uwbAoa)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbAoa)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbAoa)).toBeLessThanOrEqual(25)
    // the header's word budget: 25 minutes needs at most 1724 words, because 1725 makes raw
    // exactly 27.5 and Math.round(5.5) rounds up
    expect(lessonWords(uwbAoa)).toBeLessThanOrEqual(1724)
    const at1725 = 1725 / 150 + OBSERVE_MINUTES * 4 + TRY_MINUTES * 2
    expect(Math.round(at1725 / 5) * 5).toBe(30)
    expect(uwbAoa.module).toBe(14)
    expect(uwbAoa.id).toBe('uwb-aoa')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbAoa.jumps).toHaveLength(5)
    expect(uwbAoa.observe).toHaveLength(4)
    expect(uwbAoa.tryThis).toHaveLength(2)
    expect(uwbAoa.quiz).toHaveLength(3)
    for (const q of uwbAoa.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbAoa.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
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
    expect(of(rs, 'UWB_POSITION').every((f) => f.method === 'aoa')).toBe(true)
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
      for (const [k, vv] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(vv)
    }
    walk({
      title: uwbAoa.title, body: uwbAoa.body, observe: uwbAoa.observe,
      tryThis: uwbAoa.tryThis, quiz: uwbAoa.quiz, variants: uwbAoa.variants, jumps: uwbAoa.jumps,
    })
    expect(seen.length).toBeGreaterThan(40)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('names the clause it leans on and owns the antennas, the sigma and the mirror as the model’s', () => {
    const first = uwbAoa.body![0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    expect(en).toContain('IEEE Std 802.15.4-2024')
    expect(en).toContain('§10.29.1.1')
    expect(en).toContain('lists angle of arrival among the results a ranging round may report')
    expect(en).toContain('The rest is the model')
    expect(en).toContain('two antennas a half wavelength apart')
    expect(en).toContain('a phase measurement of σ_φ = 0.15 rad')
    expect(en).toContain('the mirror behind the anchor')
    expect(en).toContain('FiRa-style, not anything the standard specifies')
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
    // "at (5.00, 0.50) and 2.20 m up", "the 10 × 8 m lab", 1.00 m badges
    const en = prose()
    expect(en).toContain('at (5.00, 0.50) and 2.20 m up, facing into the room')
    expect(en).toContain('The anchor is at 2.20 m and the badge at 1.00 m')
    expect(ANCHOR_Z).toBe(2.2)
    expect(TAG_Z).toBe(1)
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
      expect(of(recs(v), 'UWB_AOA')[0].trueThetaDeg.toFixed(3), v).toBe(expected.toFixed(3))
    }
    expect([cell(0, 1), cell(1, 1), cell(2, 1)]).toEqual(['0.0°', '−45.0°', '−60.0°'])
    expect(prose()).toContain('The true bearing reads −45.0° and −60.0° exactly')
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
    // "the default of false" — nothing else in the course turns this on
    expect(DEFAULT_UWB_SESSION.aoa).toBe(false)
    // "DS is not optional here": in SS the anchor measures bearings and never a range, so it
    // has nothing to cross them with and emits no fix at all
    const ss = uwbAoaScenario('base')
    const ssRun = runOf('ss', () => ({ ...ss, uwb: { ...ss.uwb!, method: 'ss' } }))
    expect(of(ssRun, 'UWB_AOA').length).toBe(BLOCKS)
    expect(of(ssRun, 'UWB_POSITION')).toEqual([])
    expect(of(recs('base'), 'UWB_POSITION')).toHaveLength(BLOCKS)
  })

  it('replays bit-for-bit, in all four scenes', () => {
    for (const v of ALL) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})

describe('uwb-aoa · two antennas, one phase', () => {
  it('"two receive antennas 1.88 cm apart — half a wavelength on channel 9"', () => {
    expect(UWB_CHANNEL_MHZ[9]).toBe(7987.2)
    expect((wavelengthM(9) * 100).toFixed(2)).toBe('3.75')
    expect((antennaSpacingM(9) * 100).toFixed(2)).toBe('1.88')
    expect(antennaSpacingM(9)).toBeCloseTo(wavelengthM(9) / 2, 12)
    // "(Channel 5: λ = 4.62 cm, spacing 2.31 cm; only the ratio matters.)"
    expect((wavelengthM(5) * 100).toFixed(2)).toBe('4.62')
    expect((antennaSpacingM(5) * 100).toFixed(2)).toBe('2.31')
    const en = prose()
    expect(en).toContain('two receive antennas are 1.88 cm apart — half a wavelength on channel 9, whose 7 987.2 MHz carrier is 3.75 cm long')
    expect(en).toContain('Channel 5: λ = 4.62 cm, spacing 2.31 cm; only the ratio matters')
    // and the ratio really is all that matters: the same true azimuth gives the same phase and
    // the same estimate on both channels
    for (const t of [0, -45, -60, 80]) {
      expect(pdoaRad(t, 5), String(t)).toBeCloseTo(pdoaRad(t, 9), 12)
      expect(azimuthFromPdoaDeg(pdoaRad(t, 9), 5), String(t)).toBeCloseTo(azimuthFromPdoaDeg(pdoaRad(t, 9), 9), 12)
    }
  })

  it('"A badge 45° off boresight produces 2.221 rad, one 60° off 2.721 rad"', () => {
    expect(Math.abs(pdoaRad(-45, 9)).toFixed(3)).toBe('2.221')
    expect(Math.abs(pdoaRad(-60, 9)).toFixed(3)).toBe('2.721')
    // "the whole ±90° field of view maps onto exactly one turn of phase, and nothing wraps"
    expect(pdoaRad(90, 9)).toBeCloseTo(Math.PI, 12)
    expect(pdoaRad(-90, 9)).toBeCloseTo(-Math.PI, 12)
    expect(pdoaRad(0, 9)).toBe(0)
    // "σ_φ = 0.15 rad ≈ 8.6° of phase noise"
    expect(AOA_SIGMA_PHI_RAD).toBe(0.15)
    expect((AOA_SIGMA_PHI_RAD * 180 / Math.PI).toFixed(1)).toBe('8.6')
    // "the argument is clamped rather than dropped and the reading lands at the edge"
    expect(azimuthFromPdoaDeg(Math.PI * 1.4, 9)).toBe(90)
    expect(azimuthFromPdoaDeg(-Math.PI * 1.4, 9)).toBe(-90)
    const en = prose()
    expect(en).toContain('A badge 45° off boresight produces 2.221 rad, one 60° off 2.721 rad')
    expect(en).toContain('the argument is clamped rather than dropped and the reading lands at the edge of the field of view')
  })

  it('"Straight ahead that is 2.74°; at 45° it is 3.87°, at 60° 5.47°"', () => {
    expect(aoaSigmaDeg(0).toFixed(2)).toBe('2.74')
    expect(aoaSigmaDeg(-45).toFixed(2)).toBe('3.87')
    expect(aoaSigmaDeg(-60).toFixed(2)).toBe('5.47')
    // σ_θ = σ_φ/(π·cos θ), to the letter
    for (const t of [0, -45, -60, 30]) {
      expect(aoaSigmaDeg(t), String(t)).toBeCloseTo((AOA_SIGMA_PHI_RAD / (Math.PI * Math.cos(t * Math.PI / 180))) * 180 / Math.PI, 12)
    }
    // "at ±90° it diverges … The model clamps σ_θ itself at 45°, which it reaches at about
    // ±86.5° off boresight": the clamp is on the sigma, and it does not bite anywhere the lesson
    // sends the badge — not at 60°, and not at the 80° spot of try-this 1
    expect(aoaSigmaDeg(90)).toBe(AOA_SIGMA_CLAMP_DEG)
    expect(AOA_SIGMA_CLAMP_DEG).toBe(45)
    const crossoverDeg = Math.acos(AOA_SIGMA_PHI_RAD / (Math.PI * AOA_SIGMA_CLAMP_DEG * Math.PI / 180)) * 180 / Math.PI
    expect(crossoverDeg.toFixed(1)).toBe('86.5')
    expect(aoaSigmaDeg(86.4)).toBeLessThan(AOA_SIGMA_CLAMP_DEG)
    expect(aoaSigmaDeg(86.6)).toBe(AOA_SIGMA_CLAMP_DEG)
    expect(aoaSigmaDeg(-60)).toBeLessThan(AOA_SIGMA_CLAMP_DEG)
    expect(aoaSigmaDeg(-80)).toBeLessThan(AOA_SIGMA_CLAMP_DEG)
    expect(prose()).toContain('The model clamps σ_θ itself at 45°, which it reaches at about ±86.5° off boresight')
    expect(aoaSigmaDeg(-80).toFixed(2)).toBe('15.75')
    expect([cell(0, 2), cell(1, 2), cell(2, 2)]).toEqual(['2.74°', '3.87°', '5.47°'])
    expect(prose()).toContain('σ_θ = σ_φ/(π·cos θ)')
    // and the measurements obey it: every one of the 14 bearings is inside 4 σ_θ of the truth
    for (const v of ['base', 'off45', 'off60'] as UwbAoaVariant[]) {
      const as = of(recs(v), 'UWB_AOA')
      expect(as, v).toHaveLength(2 * BLOCKS)
      for (const a of as) {
        expect(Math.abs(a.thetaDeg - a.trueThetaDeg), `${v} ${a.thetaDeg}`).toBeLessThan(4 * aoaSigmaDeg(a.trueThetaDeg))
      }
    }
  })
})

describe('uwb-aoa · a circle and a ray', () => {
  const rs = recs('base')

  it('the anchor measures a bearing on every frame from the badge, and fixes the badge alone', () => {
    // "It does this on every frame from the badge, so a DS round yields two bearings"
    const as = of(rs, 'UWB_AOA')
    expect(as).toHaveLength(2 * BLOCKS)
    expect(as.every((a) => a.node === ANC && a.peer === TAG)).toBe(true)
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes.every((f) => f.node === ANC && f.of === TAG && f.method === 'aoa')).toBe(true)
    // "one anchor, one position" — and "GDOP is 1.00 by construction"
    expect(fixes.every((f) => f.anchors.length === 1 && f.anchors[0] === ANC)).toBe(true)
    expect(fixes.every((f) => f.gdop === 1)).toBe(true)
    expect(prose()).toContain('GDOP is 1.00 by construction and has nothing to say here')
    // "the 2.12 cm sigma it has had since module 11"
    expect((rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(2)).toBe('2.12')
    expect(prose()).toContain('with the 2.12 cm sigma it has had since module 11')
  })

  it('observe 1: the Poll, the bearing taken off it, and the Final’s bearing', () => {
    const as = of(rs, 'UWB_AOA')
    expect(as[0].t).toBe(197_636)
    expect(fmtRecord(as[0])).toBe('anc-1 AoA ← badge-1: 2.3° (true 0.0°)')
    expect(as[1].t).toBe(4_193_534)
    expect(fmtRecord(as[1])).toBe('anc-1 AoA ← badge-1: 1.8° (true 0.0°)')
    const o1 = uwbAoa.observe[0].en
    expect(o1).toContain('197.636 µs later')
    expect(o1).toContain('anc-1 AoA ← badge-1: 2.3° (true 0.0°)')
    expect(o1).toContain('the Final’s arrives at 4.193 534 ms reading 1.8°')
    expect(o1).toContain('Seven rounds, fourteen bearings')
  })

  it('observe 2: the three lines that land together at 4.193 534 ms', () => {
    const at = rs.filter((r) => r.t === 4_193_534 && (r.type === 'UWB_AOA' || r.type === 'UWB_RANGE' || r.type === 'UWB_POSITION'))
    expect(at.map((r) => r.type)).toEqual(['UWB_AOA', 'UWB_RANGE', 'UWB_POSITION'])
    const lines = at.map(fmtRecord)
    expect(lines[1]).toBe('anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)')
    expect(lines[2]).toBe(
      'anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)',
    )
    const o2 = uwbAoa.observe[1].en
    for (const l of lines) expect(o2, l).toContain(l)
    expect(o2).toContain('Three lines land together at 4.193 534 ms')
    // "The fix takes the Final's bearing": the ellipse is turned a quarter turn from
    // yaw + θ̂ of the SECOND bearing of the round, not the first
    const fix = of(rs, 'UWB_POSITION')[0]
    const bearingRad = (YAW_IN + of(rs, 'UWB_AOA')[1].thetaDeg) * (Math.PI / 180)
    expect(fix.ellipse.thetaRad).toBeCloseTo(bearingRad + Math.PI / 2, 12)
    expect(o2).toContain('The fix takes the Final’s bearing')
  })

  it('observe 3 and 4: the anchor holds the bearing, the badge holds the fix', () => {
    const vs = initViewState(uwbAoa.scenario())
    for (const r of rs) applyRecord(vs, r)
    const a = vs.nodes[ANC].uwb!
    expect(uwbRangeRows(a, STRINGS.en.uwb)).toEqual([{
      peer: TAG, measured: '2.31 m', trueDist: '2.33 m', error: '-2.4 cm',
      fom: '97 % within 0.5 ns', rounds: String(BLOCKS), method: 'DS-TWR',
    }])
    expect(uwbAoaRows(a)).toEqual([{
      peer: TAG, measured: '-3.7°', trueTheta: '0.0°', error: '-3.7°',
      sigma: '± 2.7°', rounds: String(2 * BLOCKS),
    }])
    // "A bearing belongs to the anchor that measured it; a fix belongs to whoever it is of"
    expect(a.position).toBeNull()
    const t = vs.nodes[TAG].uwb!
    expect(uwbAoaRows(t)).toEqual([])
    expect(uwbFixRow(t.position!, STRINGS.en.uwb)).toEqual({
      estimate: '(5.13, 2.47) m', truth: '(5.00, 2.50) m', error: '13.3 cm',
      gdop: '1.00', ellipse: '9.4 × 2.1 cm', method: 'angle of arrival',
    })
    expect(uwbFixRow(t.position!, STRINGS.zh.uwb).method).toBe('到达角 (AoA)')
    const o3 = uwbAoa.observe[2].en, o4 = uwbAoa.observe[3].en
    expect(o3).toContain('2.31 m against a true 2.33, −2.4 cm, 97 % within 0.5 ns, 7 rounds, DS-TWR')
    expect(o3).toContain('measured −3.7°, true 0.0°, error −3.7°, ± 2.7°, over 14 rounds')
    expect(o4).toContain('(5.13, 2.47) m against (5.00, 2.50), 13.3 cm out, GDOP 1.00, ellipse 9.4 × 2.1 cm')
  })
})

describe('uwb-aoa · the ellipse across the line of sight', () => {
  const SPOT_ROWS: [UwbAoaVariant, number][] = [['base', 0], ['off45', 1], ['off60', 2]]

  it('the three-spot table is what seven rounds produce at each spot', () => {
    for (const [v, row] of SPOT_ROWS) {
      const run = recs(v)
      // "Cross-range 1-σ" = rh·σ_θ at the true azimuth
      expect(cell(row, 3), v).toBe(`${cm(crossSigmaM(v))} cm`)
      // "Range error" — the anchor's own, to one decimal
      const re = ancRangeErrM(run)
      expect(re, v).toHaveLength(BLOCKS)
      expect(cell(row, 4), v).toBe(`${cm(mean(re))} cm`)
      // "Fix error"
      const fe = fixErrM(run)
      expect(fe, v).toHaveLength(BLOCKS)
      expect(cell(row, 5), v).toBe(`${cm(Math.min(...fe))}–${cm(Math.max(...fe))} cm, mean ${cm(mean(fe))}`)
    }
    expect([cell(0, 3), cell(1, 3), cell(2, 3)]).toEqual(['9.5 cm', '27.0 cm', '47.7 cm'])
    expect([cell(0, 4), cell(1, 4), cell(2, 4)]).toEqual(['2.0 cm', '2.0 cm', '2.0 cm'])
    expect([cell(0, 5), cell(1, 5), cell(2, 5)])
      .toEqual(['2.1–15.6 cm, mean 9.6', '5.8–44.5 cm, mean 26.5', '10.4–87.7 cm, mean 48.2'])
    expect(tables()[0].head).toHaveLength(6)
    expect(tables()[0].rows.every((r) => r.length === 6)).toBe(true)
  })

  it('"the cross-range error rh·σ_θ goes from 9.5 cm to 47.7" while the range does not', () => {
    // the whole argument of the section: the error has a direction
    const alongAll: number[] = []
    for (const [v] of SPOT_ROWS) {
      const { along, across } = split(recs(v), v)
      alongAll.push(...along)
      // across ≈ the fix error, within a millimetre, at every spot
      const fe = fixErrM(recs(v))
      across.forEach((x, i) => expect(Math.abs(Math.abs(x) - fe[i]), `${v} ${i}`).toBeLessThan(0.01))
      // and it is what the cross-range sigma predicts: worst case inside 2σ, none inside 0.1σ
      expect(Math.max(...across.map(Math.abs)), v).toBeLessThan(2 * crossSigmaM(v))
    }
    // "the along-the-ray component of all twenty-one fixes stays inside 9 cm"
    expect(alongAll).toHaveLength(3 * BLOCKS)
    expect(alongAll).toHaveLength(21)
    expect(Math.max(...alongAll.map(Math.abs))).toBeLessThan(0.09)
    // and that 9 cm is the range's doing: under 4 σ_r
    expect(Math.max(...alongAll.map(Math.abs))).toBeLessThan(4 * rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs))
    const en = prose()
    expect(en).toContain('the cross-range error rh·σ_θ goes from 9.5 cm to 47.7')
    expect(en).toContain('the along-the-ray component of all twenty-one fixes stays inside 9 cm')
  })

  it('"9.4 × 2.1 cm at the first fix, 25.7 × 2.1 at 45°, 43.1 × 2.1 at 60°", turned a quarter turn', () => {
    const first = SPOT_ROWS.map(([v]) => of(recs(v), 'UWB_POSITION')[0])
    expect(first.map((f) => `${cm(f.ellipse.a)} × ${(f.ellipse.b * 100).toFixed(1)}`))
      .toEqual(['9.4 × 2.1', '25.7 × 2.1', '43.1 × 2.1'])
    // "The ellipse's semi-axes are those two measurements": b is the range sigma at every spot
    for (const f of first) expect(f.ellipse.b).toBeCloseTo(rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs), 12)
    // "its major axis is the angle's and it is drawn a quarter turn from the bearing"
    for (const [v] of SPOT_ROWS) {
      for (const f of of(recs(v), 'UWB_POSITION')) {
        expect(f.ellipse.a, v).toBeGreaterThan(f.ellipse.b)
        const bearing = Math.atan2(f.y - ANCHOR_Y, f.x - ANCHOR_X)
        const turn = Math.abs(Math.atan2(Math.sin(f.ellipse.thetaRad - bearing), Math.cos(f.ellipse.thetaRad - bearing)))
        expect(turn, v).toBeCloseTo(Math.PI / 2, 9)
      }
    }
    expect(prose()).toContain('9.4 × 2.1 cm at the first fix, 25.7 × 2.1 at 45°, 43.1 × 2.1 at 60°')
  })

  it('"the radio measures 4.176 m where the plan shows 4.000", and the fix walks out the plan leg', () => {
    const t = tagXY('off45')
    const slant = Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y, ANCHOR_Z - TAG_Z)
    expect(slant.toFixed(3)).toBe('4.176')
    expect(Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y).toFixed(3)).toBe('4.000')
    // "would plant every fix 17.6 cm too far out, eight times the range's own sigma"
    expect(cm(slant - 4)).toBe('17.6')
    expect((slant - 4) / rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)).toBeGreaterThan(8)
    // it does not: every fix sits at √(r² − Δz²) from the anchor, and the along-ray error
    // is centimetres rather than the 17.6 cm bias the slant range would have left
    const fs = of(recs('off45'), 'UWB_POSITION')
    const rs45 = of(recs('off45'), 'UWB_RANGE').filter((r) => r.node === ANC)
    fs.forEach((f, i) => {
      const walked = Math.hypot(f.x - ANCHOR_X, f.y - ANCHOR_Y)
      const dz = ANCHOR_Z - TAG_Z
      expect(walked, String(i)).toBeCloseTo(Math.sqrt(rs45[i].distM ** 2 - dz * dz), 9)
    })
    expect(Math.max(...split(recs('off45'), 'off45').along.map(Math.abs))).toBeLessThan(0.05)
    // lifting the badge to the anchor's own height, where slant and plan agree, moves
    // no fix by more than a millimetre — the correction is doing exactly its job
    const lifted = uwbAoaScenario('off45')
    const flat = runOf('off45-flat', () => ({
      ...lifted,
      nodes: lifted.nodes.map((n): NodeCfg => (n.id === TAG ? { ...n, pos: { ...n.pos, z: ANCHOR_Z } } : n)),
    }))
    fixErrM(flat).forEach((e, i) => expect(Math.abs(e - fixErrM(recs('off45'))[i]), String(i)).toBeLessThan(0.001))
    const en = prose()
    expect(en).toContain('the radio measures 4.176 m where the plan shows 4.000')
    expect(en).toContain('17.6 cm too far out, eight times the range’s own sigma')
    expect(en).toContain('the fix walks out √(r² − Δz²) instead')
  })

  it('try-this 1: the three spots, and the 80° spot the editor reaches', () => {
    const vs = (v: UwbAoaVariant) => {
      const st = initViewState(scenarioOf(v))
      for (const r of recs(v)) applyRecord(st, r)
      return st
    }
    // "The inspector's 1-σ is σ_θ at the bearing that row happened to measure last, so it moves
    // with every draw: here it reads ± 2.7°, ± 4.3° and ± 7.5° where the model's σ_θ at the three
    // spots is 2.74°, 3.87° and 5.47°."
    const SPOT3: UwbAoaVariant[] = ['base', 'off45', 'off60']
    expect(SPOT3.map((v) => uwbAoaRows(vs(v).nodes[ANC].uwb!)[0].sigma))
      .toEqual(['± 2.7°', '± 4.3°', '± 7.5°'])
    // it really is the LAST bearing of the run and not the truth: the row is aoaSigmaDeg of it,
    // and at two of the three spots that is a different number from the model's σ_θ
    for (const v of SPOT3) {
      const last = of(recs(v), 'UWB_AOA').at(-1)!
      expect(uwbAoaRows(vs(v).nodes[ANC].uwb!)[0].sigma, v).toBe(`± ${aoaSigmaDeg(last.thetaDeg).toFixed(1)}°`)
      expect(last.thetaDeg, v).not.toBe(last.trueThetaDeg)
    }
    expect(SPOT3.map((v) => aoaSigmaDeg(SPOTS[v].offBoresightDeg).toFixed(2)))
      .toEqual(['2.74', '3.87', '5.47'])
    // and the sentence does not leave the reader with the row's trio as the model's
    expect(uwbAoa.tryThis[0].en).toContain('the model’s σ_θ at the three spots is 2.74°, 3.87° and 5.47°')
    expect(uwbAoa.tryThis[0].zh).toContain('2.74°、3.87° 与 5.47°')
    // "the mean fix error goes 9.6 → 26.5 → 48.2 cm while the range error stays at 2.0 cm"
    expect(SPOT3.map((v) => cm(mean(fixErrM(recs(v)))))).toEqual(['9.6', '26.5', '48.2'])
    expect(SPOT3.map((v) => cm(mean(ancRangeErrM(recs(v)))))).toEqual(['2.0', '2.0', '2.0'])
    // the 80° spot: (8.94, 1.19) is 80° off boresight at 4 m, and inside the room
    const far = { x: ANCHOR_X + 4 * Math.sin(80 * Math.PI / 180), y: ANCHOR_Y + 4 * Math.cos(80 * Math.PI / 180) }
    expect([far.x.toFixed(2), far.y.toFixed(2)]).toEqual(['8.94', '1.19'])
    const base = uwbAoaScenario('base')
    const run80 = runOf('off80', () => ({
      ...base,
      nodes: base.nodes.map((n): NodeCfg => (n.id === TAG ? { ...n, pos: { ...n.pos, ...far } } : n)),
    }))
    expect(aoaSigmaDeg(-80).toFixed(2)).toBe('15.75')
    const bearings = of(run80, 'UWB_AOA')
    expect(bearings).toHaveLength(2 * BLOCKS)
    expect(bearings.filter((b) => b.thetaDeg === -90)).toHaveLength(6)
    expect(Math.max(...of(run80, 'UWB_POSITION').map((f) => f.ellipse.a)).toFixed(2)).toBe('3.16')
    const t1 = uwbAoa.tryThis[0].en
    expect(t1).toContain('The inspector’s 1-σ is σ_θ at the bearing that row happened to measure last, so it moves with every draw: here it reads ± 2.7°, ± 4.3° and ± 7.5°')
    expect(t1).toContain('The mean fix error goes 9.6 → 26.5 → 48.2 cm while the range error stays at 2.0 cm')
    expect(t1).toContain('9.4 × 2.1, 25.7 × 2.1, 43.1 × 2.1 cm')
    // `ellipse.a` is the semi-major axis, the same convention the body and the inspector use
    expect(t1).toContain('(8.94, 1.19), 80° off at 4 m: σ_θ is 15.75°, six of the fourteen bearings are pinned at the −90.0° clamp, and the worst ellipse’s semi-major axis is 3.16 m')
    expect(prose()).toContain('The ellipse’s semi-axes are those two measurements')
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

  it('"the fourteen bearings come back identical to before, around 0°"', () => {
    const behind = of(recs('behind'), 'UWB_AOA')
    const base = of(recs('base'), 'UWB_AOA')
    // identical to every decimal anything prints: what separates them is the 4e-16 rad of
    // phase that sin(180°) leaves behind, fourteen places below the last digit on screen
    expect(behind).toHaveLength(base.length)
    behind.forEach((a, i) => expect(a.thetaDeg, String(i)).toBeCloseTo(base[i].thetaDeg, 12))
    expect(behind.every((a) => a.trueThetaDeg === 180)).toBe(true)
    expect(behind.every((a) => Math.abs(a.thetaDeg) < 4 * aoaSigmaDeg(0))).toBe(true)
    expect(fmtRecord(behind[0])).toBe('anc-1 AoA ← badge-1: 2.3° (true 180.0°)')
    // "only the anchor's Facing, 90° to −90°" — the badge did not move, and the "2.00 m" the
    // mirror section quotes is the plan distance, not the 2.33 m slant range observe 1 prints
    expect(tagXY('behind')).toEqual(tagXY('base'))
    const t = scenarioOf('behind').nodes[1].pos
    expect(Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y).toFixed(2)).toBe('2.00')
    expect(Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y, ANCHOR_Z - TAG_Z).toFixed(2)).toBe('2.33')
    expect(prose()).toContain('unmoved, still 2.00 m away on the floor')
    expect(uwbAoa.tryThis[1].en).toContain('same spot, same 2.00 m on the floor')
    expect(scenarioOf('behind').nodes[0].uwb!.yawDeg).toBe(-90)
    expect(scenarioOf('base').nodes[0].uwb!.yawDeg).toBe(90)
    // "the range is right to 2 cm there and the clamp never fires"
    expect(ancRangeErrM(recs('behind'))).toEqual(ancRangeErrM(recs('base')))
    expect(cm(mean(ancRangeErrM(recs('behind'))))).toBe('2.0')
    expect(behind.some((a) => Math.abs(a.thetaDeg) === 90)).toBe(false)
    expect(uwbAoa.quiz[2].explain.en).toContain('The range is right to 2 cm there and the clamp never fires')
  })

  it('"the seven fixes land near (5.06, −1.47) … The error is exactly twice the horizontal range"', () => {
    const fs = of(recs('behind'), 'UWB_POSITION')
    expect(fs).toHaveLength(BLOCKS)
    expect([fs[0].x.toFixed(2), fs[0].y.toFixed(2)]).toEqual(['5.06', '-1.47'])
    expect(fmtRecord(fs[0])).toContain('(5.06, -1.47) m, true (5.00, 2.50), error 3.97 m')
    const errs = fixErrM(recs('behind'))
    expect([cm(Math.min(...errs)), cm(Math.max(...errs)), cm(mean(errs))]).toEqual(['396.7', '403.0', '400.2'])
    // "3.97 to 4.03 m from the badge and outside the room", and exactly twice rh
    expect(fs.every((f) => f.y < 0)).toBe(true)
    expect(mean(errs)).toBeCloseTo(2 * horizM('behind'), 1)
    // the fix is the truth reflected in the boresight: same distance from the anchor, and the
    // component across the boresight axis is the base run's, with its sign turned over
    const baseAcross = split(recs('base'), 'base').across
    const behindAcross = split(recs('behind'), 'behind').across
    behindAcross.forEach((x, i) => expect(x, String(i)).toBeCloseTo(-baseAcross[i], 9))
    // "Put Facing back to 90° and the error returns to 2.1–15.6 cm"
    const fixed = fixErrM(recs('base'))
    expect([cm(Math.min(...fixed)), cm(Math.max(...fixed))]).toEqual(['2.1', '15.6'])
    // "with a confident 9.4 × 2.1 cm ellipse": the ellipse is the base run's, unchanged
    expect(of(recs('behind'), 'UWB_POSITION').map((f) => f.ellipse.a))
      .toEqual(of(recs('base'), 'UWB_POSITION').map((f) => f.ellipse.a))
    const en = prose()
    expect(en).toContain('the seven fixes land near (5.06, −1.47), 3.97 to 4.03 m from the badge and outside the room')
    expect(en).toContain('The error is exactly twice the horizontal range')
    const t2 = uwbAoa.tryThis[1].en
    expect(t2).toContain('the seven fixes are 396.7 to 403.0 cm out, mean 400.2')
    expect(t2).toContain('Put Facing back to 90° and the error returns to 2.1–15.6 cm')
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
    expect(prose()).toContain('the editor’s Facing field')
  })
})
