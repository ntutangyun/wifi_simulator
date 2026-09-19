/**
 * Every empirical claim in "One blink per tag", measured against the lesson's own
 * scenario and its variant. Each assertion quotes the sentence it guards, copied
 * from the shipped string; the blink's size and duration, the slot and block
 * lengths, the session defaults and the difference sigma come from the engine's
 * own exports rather than being re-typed here, and the comparison with the
 * listen-only lesson is a fresh run of that lesson's scene, never a transcribed
 * result. The anchors' calibration offsets are checked twice over: once by
 * replaying the draw the engine makes, and once through the run, which measures
 * the same offsets as a bias on every difference.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_Z, TAG_SPOTS, TAG_Z, UL_ANCHORS, uwbUlTdoa, uwbUlTdoaScenario, type UwbUlTdoaVariant,
} from '../../src/course/uwb/uwb-ul-tdoa'
import { TAG_SPOTS as DL_TAG_SPOTS, uwbDlTdoaScenario } from '../../src/course/uwb/uwb-dl-tdoa'
import { Simulation } from '../../src/engine/simulation'
import { Rng } from '../../src/engine/rng'
import { hashStr } from '../../src/engine/hash'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n, Lesson } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, OBSERVE_MINUTES, TIERS, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { fmtRecord } from '../../src/ui/format'
import { C_M_PER_NS, UWB_BLINK_BYTES, rstuNs, uwbPpduNs } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { gaussian, UwbClock } from '../../src/uwb/clock'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbFixRow, uwbTdoaRows } from '../../src/uwb/ui/rows'
import { STRINGS } from '../../src/ui/i18n'

const MS = 1_000_000
/** Seven blocks, the window lessons 5 and 6 measure over: block 6 starts at 1.200 s and its
 * ten one-slot rounds are finished 20 ms later, while block 7 would not start until 1.400 s. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const BADGES = TAG_SPOTS.map((_, i) => `badge-${i + 1}`)
/** The reference anchor: every difference is taken against its stamp, and it emits the records. */
const REF = UL_ANCHORS[0].id
const PEERS = UL_ANCHORS.slice(1).map((a) => a.id)
/** Index into `uwbUlTdoa.variants`. */
const V_SYNC = 0

const scenarioOf = (v: UwbUlTdoaVariant): Scenario =>
  v === 'base' ? uwbUlTdoa.scenario() : uwbUlTdoa.variants![V_SYNC].scenario()

const memo = new Map<string, TLRecord[]>()
const runOf = (key: string, build: () => Scenario): TLRecord[] => {
  if (!memo.has(key)) memo.set(key, [...new Simulation(build()).runUntil(RUN_NS).records])
  return memo.get(key)!
}
const recs = (v: UwbUlTdoaVariant): TLRecord[] => runOf(v, () => scenarioOf(v))

const of = <K extends TLRecord['type']>(rs: TLRecord[], type: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

/** |measured − true| of every difference, as a distance. */
const diffErrM = (rs: TLRecord[], peer?: string, badge?: string): number[] =>
  of(rs, 'UWB_TDOA').filter((r) => (peer === undefined || r.peer === peer) && (badge === undefined || r.of === badge))
    .map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
/** The same, in nanoseconds and keeping the sign: a calibration offset is one-sided. */
const diffBiasNs = (rs: TLRecord[], peer: string, badge: string): number[] =>
  of(rs, 'UWB_TDOA').filter((r) => r.peer === peer && r.of === badge).map((r) => r.dtNs - r.trueDtNs)
/** Fix errors, in metres; UL-TDoA fixes are emitted by the reference anchor and named `of` a badge. */
const fixErrM = (rs: TLRecord[], badge?: string): number[] =>
  of(rs, 'UWB_POSITION').filter((f) => badge === undefined || f.of === badge)
    .map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
/** Where a badge's fixes sit on average, relative to the truth: a bias moves them all one way. */
const meanOffsetM = (rs: TLRecord[], badge: string): { dx: number; dy: number } => {
  const fs = of(rs, 'UWB_POSITION').filter((f) => f.of === badge)
  return { dx: mean(fs.map((f) => f.x - f.trueX)), dy: mean(fs.map((f) => f.y - f.trueY)) }
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * 1-σ of one UL-TDoA difference, as a distance: two independent receive timestamps and two
 * anchors' residual calibration offsets, all in one subtraction. This is the figure the lesson's
 * table quotes and the sigma the solver is given for the ellipse.
 */
const ulSigmaM = (syncNs: number): number =>
  Math.SQRT2 * C_M_PER_NS * Math.hypot(DEFAULT_UWB_SESSION.tsNoisePs / 1000, syncNs)

/**
 * The residual calibration offset the engine draws for an anchor: one stream per UWB node,
 * forked by `hashStr(<id>#uwb)`, whose first two draws are the crystal (UwbClock.fromRng) and
 * whose next is this, scaled by the session's 1-σ — exactly the order network.ts takes them in.
 * Replayed here so the lesson's quoted offsets are checked against the draw itself.
 */
const drawnOffsetNs = (id: string, syncErrorNs: number, seed = 7): number => {
  const rng = new Rng(seed).fork(hashStr(`${id}#uwb`))
  UwbClock.fromRng(rng, undefined)
  return gaussian(rng) * syncErrorNs
}

/** The base scene with one knob moved, for the editor experiment. */
const withSync = (ns: number): Scenario => {
  const s = uwbUlTdoaScenario('base')
  return { ...s, uwb: { ...s.uwb!, syncErrorNs: ns } }
}
/** The 1 ns scene with one badge moved, for the geometry half of the same experiment. */
const moved = (id: string, x: number, y: number): Scenario => {
  const s = uwbUlTdoaScenario('sync')
  return { ...s, nodes: s.nodes.map((n): NodeCfg => (n.id === id ? { ...n, pos: { ...n.pos, x, y } } : n)) }
}

/** Everything a learner reads of this lesson, joined — for "is this number actually printed?". */
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
const prose = (): string => lessonProse(uwbUlTdoa)

const tables = (): Extract<Block, { kind: 'table' }>[] =>
  uwbUlTdoa.body.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
const cell = (table: number, row: number, col: number): string => tables()[table].rows[row][col].en

describe('uwb-ul-tdoa · lesson shape', () => {
  it('the scenario and its variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbUlTdoa.scenario())).not.toThrow()
    expect(uwbUlTdoa.variants).toHaveLength(1)
    for (const v of uwbUlTdoa.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbUlTdoa) / 150
      + OBSERVE_MINUTES * uwbUlTdoa.observe.length + TRY_MINUTES * uwbUlTdoa.tryThis.length
    expect(lessonMinutes(uwbUlTdoa)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbUlTdoa)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbUlTdoa)).toBeLessThanOrEqual(25)
    // the header's word budget: 25 minutes needs at most 1724 words, because 1725 makes raw
    // exactly 27.5 and Math.round(5.5) rounds up
    expect(lessonWords(uwbUlTdoa)).toBeLessThanOrEqual(1724)
    const at1725 = 1725 / 150 + OBSERVE_MINUTES * 4 + TRY_MINUTES * 2
    expect(Math.round(at1725 / 5) * 5).toBe(30)
    expect(uwbUlTdoa.module).toBe(14)
    expect(uwbUlTdoa.id).toBe('uwb-ul-tdoa')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbUlTdoa.jumps).toHaveLength(5)
    expect(uwbUlTdoa.observe).toHaveLength(4)
    expect(uwbUlTdoa.tryThis).toHaveLength(2)
    expect(uwbUlTdoa.quiz).toHaveLength(3)
    for (const q of uwbUlTdoa.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbUlTdoa.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      idx.push(i)
    }
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the round and the blink open the run; the first anchor stamps it one PPDU later, and the
    // difference and the fix close the slot at 2 ms
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(0)
    expect(rs[idx[2]].t).toBe(181_234)
    expect(rs[idx[3]].t).toBe(2 * MS)
    expect(rs[idx[4]].t).toBe(2 * MS)
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
      title: uwbUlTdoa.title, body: uwbUlTdoa.body, observe: uwbUlTdoa.observe,
      tryThis: uwbUlTdoa.tryThis, quiz: uwbUlTdoa.quiz, variants: uwbUlTdoa.variants,
      jumps: uwbUlTdoa.jumps,
    })
    expect(seen.length).toBeGreaterThan(40)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('names the clause it leans on and owns the blink, the timebase and its error as the model’s', () => {
    const first = uwbUlTdoa.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    expect(en).toContain('IEEE Std 802.15.4-2024')
    expect(en).toContain('§10.29.1.2.5')
    expect(en).toContain('this lesson is the first')
    expect(en).toContain('a mobile node transmits, fixed nodes whose clocks are synchronised with one another receive it')
    expect(en).toContain('The rest is the model')
    expect(en).toContain('the fourteen octets of the blink and the fact that it carries no times')
    expect(en).toContain('its wired-sync calibration and the fixed residual error each anchor is left with')
  })

  it('it is the third lesson of module 14, after uwb-dl-tdoa in the course order', () => {
    expect(MODULES[14]).toEqual({ tier: 5, title: { en: 'Other ranging modes', zh: '其他测距模式' } })
    expect(MODULES[uwbUlTdoa.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-ul-tdoa') - 1]).toBe('uwb-dl-tdoa')
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-dl-tdoa') + 1]).toBe('uwb-ul-tdoa')
    // the last id of the tier has no lesson yet and is simply skipped
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-ul-tdoa') + 1]).toBe('uwb-aoa')
    expect(ids).not.toContain('uwb-aoa')
  })
})

describe('uwb-ul-tdoa · the scene', () => {
  it('is lesson 6’s four corner anchors and its ten spots, with badges that only transmit', () => {
    const s = uwbUlTdoa.scenario()
    expect(s.nodes.map((n) => n.id)).toEqual([...UL_ANCHORS.map((a) => a.id), ...BADGES])
    for (const a of UL_ANCHORS) {
      const n = s.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb?.role, a.id).toBe('anchor')
    }
    BADGES.forEach((id, i) => {
      const n = s.nodes.find((x) => x.id === id)!
      expect(n.pos, id).toEqual({ x: TAG_SPOTS[i].x, y: TAG_SPOTS[i].y, z: TAG_Z })
      expect(n.uwb?.role, id).toBe('tag')
    })
    // "four anchors in the corners of the 10 × 8 m lab at 2.20 m, ten badges at 1.00 m,
    // the same ten spots" — lesson 6's scene, node for node
    const six = uwbDlTdoaScenario('ten')
    for (const a of UL_ANCHORS) {
      expect(six.nodes.find((n) => n.id === a.id)!.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
    }
    expect(TAG_SPOTS).toEqual(DL_TAG_SPOTS)
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    // "None of them is directly under an anchor": the nearest is 0.71 m away in plan
    const gaps = TAG_SPOTS.map((p) => Math.min(...UL_ANCHORS.map((a) => Math.hypot(a.x - p.x, a.y - p.y))))
    expect(Math.min(...gaps)).toBeGreaterThan(0.7)
    expect(prose()).toContain('ten badges at 1.00 m, the same ten spots')
  })

  it('is a UL-TDoA session on the defaults, NLOS on, and every crystal drawn rather than set', () => {
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const u = scenarioOf(v).uwb!
      expect(u.mode, v).toBe('ul-tdoa')
      expect(u.nlos, v).toBe(true)
      expect(u.schedule, v).toBe(DEFAULT_UWB_SESSION.schedule)
      expect(u.method, v).toBe(DEFAULT_UWB_SESSION.method)
      expect(u.slotRstu, v).toBe(DEFAULT_UWB_SESSION.slotRstu)
      expect(u.blockRstu, v).toBe(DEFAULT_UWB_SESSION.blockRstu)
      expect(u.tsNoisePs, v).toBe(DEFAULT_UWB_SESSION.tsNoisePs)
      expect(u.cfoNoisePpm, v).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
      expect(u.tdoaClockCorrection, v).toBe(DEFAULT_UWB_SESSION.tdoaClockCorrection)
      for (const n of scenarioOf(v).nodes) expect(n.uwb?.ppm, `${v} ${n.id}`).toBeUndefined()
    }
    // "the default of 0 ns makes them perfect"; the variant sets 1 and nothing else
    expect(DEFAULT_UWB_SESSION.syncErrorNs).toBe(0)
    expect(scenarioOf('base').uwb!.syncErrorNs).toBe(0)
    expect(scenarioOf('sync').uwb!.syncErrorNs).toBe(1)
    expect(uwbUlTdoa.variants![V_SYNC].label).toEqual({ en: '1 ns of sync error', zh: '1 ns 的同步误差' })
    const strip = (s: Scenario) => JSON.stringify({ ...s, uwb: { ...s.uwb!, syncErrorNs: 0 } })
    expect(strip(scenarioOf('sync'))).toBe(strip(scenarioOf('base')))
  })

  it('"a badge owns one slot of 2 ms per 200 ms block", and the block holds a hundred of them', () => {
    const plan = roundPlan(uwbUlTdoaScenario('base').uwb!, UL_ANCHORS.length)
    expect(plan.slots).toBe(1)
    expect(plan.slotNs).toBe(2 * MS)
    expect(plan.roundNs).toBe(2 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    // "240 000 RSTU ÷ 2 400 RSTU per slot" = "100 badges"
    expect(plan.roundsPerBlock).toBe(Math.floor(DEFAULT_UWB_SESSION.blockRstu / DEFAULT_UWB_SESSION.slotRstu))
    expect(plan.roundsPerBlock).toBe(100)
    expect(cell(0, 3, 1)).toBe('100 badges (240 000 ÷ 2 400 RSTU), 9.06 %')
    expect(DEFAULT_UWB_SESSION.blockRstu).toBe(240_000)
    expect(DEFAULT_UWB_SESSION.slotRstu).toBe(2_400)
    expect(rstuNs(DEFAULT_UWB_SESSION.slotRstu)).toBe(2 * MS)
    expect(cell(0, 1, 1)).toBe('1 slot of 2 ms, 1 frame')
    // 9.06 %: a hundred blinks in one block
    expect((100 * uwbPpduNs(UWB_BLINK_BYTES) / plan.blockNs * 100).toFixed(2)).toBe('9.06')
    // one round per badge per block, each one slot long, all seven blocks of them
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const rounds = of(recs(v), 'UWB_ROUND')
      expect(rounds, v).toHaveLength(BLOCKS * BADGES.length)
      for (const r of rounds) {
        expect(r.mode, v).toBe('ul-tdoa')
        expect(r.slots, v).toBe(1)
        expect(r.slotNs, v).toBe(plan.slotNs)
        expect(r.untilNs, v).toBe(r.block * plan.blockNs + (r.round + 1) * plan.roundNs)
      }
    }
  })
})

describe('uwb-ul-tdoa · one frame, and then nothing', () => {
  const rs = recs('base')

  it('spends one 14-octet blink per badge per block and nothing else, anywhere', () => {
    const tx = of(rs, 'TX_START')
    // "a badge is the only thing that transmits": ten blinks a block, in the badges' own order
    expect(tx.filter((r) => r.t < 200 * MS).map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot]))
      .toEqual(BADGES.map((id) => [id, 'uwbBlink', 0]))
    expect(tx).toHaveLength(BLOCKS * BADGES.length)
    expect(tx).toHaveLength(70)
    expect(tx.every((r) => r.node.startsWith('badge-'))).toBe(true)
    // "fourteen octets, 181.218 µs of air, broadcast, and no times at all inside it"
    expect(UWB_BLINK_BYTES).toBe(14)
    expect(uwbPpduNs(UWB_BLINK_BYTES)).toBe(181_218)
    expect(tx.every((r) => r.frame.bytes === UWB_BLINK_BYTES)).toBe(true)
    expect(tx.every((r) => r.frame.txTimeNs === uwbPpduNs(UWB_BLINK_BYTES))).toBe(true)
    expect(tx.every((r) => r.frame.dst === '*')).toBe(true)
    // "a blink is a broadcast that names its sender"
    expect(tx.map((r) => r.frame.src).slice(0, 3)).toEqual(BADGES.slice(0, 3))
    expect(tx[0].frame.uwb?.ies).toEqual(['BLINK'])
    // "14 B (9 + 3 + 2)": MHR, blink IE, FCS
    expect(cell(0, 0, 1)).toBe('14 B (9 + 3 + 2), 181.218 µs')
    expect(9 + 3 + 2).toBe(UWB_BLINK_BYTES)
    // no round trip exists in this mode, so nothing is ever measured as a distance or timed out
    expect(of(rs, 'UWB_RANGE')).toEqual([])
    expect(of(rs, 'UWB_TIMEOUT')).toEqual([])
  })

  it('"its radio is off until the next block": tx, idle, and nothing for 199.8 ms', () => {
    const states = of(rs, 'MAC_STATE').filter((r) => r.node === 'badge-1')
    expect(states.map((r) => [r.t, r.state])).toEqual(
      Array.from({ length: BLOCKS }, (_, b) => [[b * 200 * MS, 'tx'], [b * 200 * MS + 181_218, 'idle']]).flat(),
    )
    // and the badge never opens a receiver: no arrival is ever stamped at a badge
    expect(of(rs, 'UWB_TS').filter((r) => r.node.startsWith('badge-')).every((r) => r.dir === 'tx')).toBe(true)
  })

  it('"70 transmissions … 12.685 260 ms of air", and ten badges cost a block 0.906 %', () => {
    const airNs = (records: TLRecord[]): number =>
      of(records, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(airNs(rs)).toBe(BLOCKS * BADGES.length * uwbPpduNs(UWB_BLINK_BYTES))
    expect(airNs(rs)).toBe(12_685_260)
    const perBlock = airNs(rs) / BLOCKS
    expect(perBlock).toBe(1_812_180)
    expect((perBlock / (200 * MS) * 100).toFixed(3)).toBe('0.906')
    expect(cell(0, 2, 1)).toBe('1.812 180 ms, 0.906 %')
    expect(tables()[0].head).toHaveLength(2)
    const en = prose()
    expect(en).toContain('70 transmissions, every one of them a blink, 12.685 260 ms of air')
    // the air is identical in the 1 ns scene: a calibration error changes nothing a radio does
    expect(airNs(recs('sync'))).toBe(airNs(rs))
    expect(prose()).toContain('the same 70 blinks, the same 12.685 260 ms')
  })

  it('observe 1 quotes the lines fmtRecord prints for the round and the blink', () => {
    const round = of(rs, 'UWB_ROUND')[0]
    expect(round.t).toBe(0)
    expect(fmtRecord(round)).toBe('badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs')
    expect(fmtRecord(of(rs, 'TX_START')[0])).toBe('badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)')
    // "Badge 2's round opens at 2 ms"
    expect(of(rs, 'UWB_ROUND')[1].t).toBe(2 * MS)
    expect(of(rs, 'UWB_ROUND')[1].node).toBe('badge-2')
    const o1 = uwbUlTdoa.observe[0].en
    expect(o1).toContain('badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs')
    expect(o1).toContain('badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)')
    expect(o1).toContain('All 70 TX_START lines in the run belong to a badge')
  })

  it('observe 2: four stamps, in distance order, eight nanoseconds apart end to end', () => {
    const stamps = of(rs, 'UWB_TS').filter((r) => r.dir === 'rx' && r.t < 2 * MS)
    expect(stamps.map((r) => r.node)).toEqual([REF, 'anchor-3', 'anchor-2', 'anchor-4'])
    expect(stamps.map((r) => r.t)).toEqual([181_234, 181_237, 181_240, 181_242])
    expect(stamps.every((r) => r.peer === 'badge-1')).toBe(true)
    expect(stamps[3].t - stamps[0].t).toBe(8)
    // "in order of their distance from (4, 3.5)"
    const d = (id: string): number => {
      const a = UL_ANCHORS.find((x) => x.id === id)!
      return Math.hypot(a.x - TAG_SPOTS[0].x, a.y - TAG_SPOTS[0].y, ANCHOR_Z - TAG_Z)
    }
    const byDistance = stamps.map((r) => d(r.node))
    expect(byDistance).toEqual([...byDistance].sort((a, b) => a - b))
    const o2 = uwbUlTdoa.observe[1].en
    for (const s of ['181.234', '181.237', '181.240', '181.242']) expect(o2).toContain(s)
    expect(o2).toContain('anchor 1, anchor 3, anchor 2, anchor 4')
    expect(o2).toContain('Eight nanoseconds separate the first stamp from the last')
  })
})

describe('uwb-ul-tdoa · positioned by somebody else', () => {
  const rs = recs('base')

  it('the reference anchor emits three differences and one fix per blink, each named `of` a badge', () => {
    const diffs = of(rs, 'UWB_TDOA')
    expect(diffs).toHaveLength(BLOCKS * BADGES.length * PEERS.length)
    expect(diffs.every((d) => d.node === REF && d.ref === REF)).toBe(true)
    expect(diffs.slice(0, 3).map((d) => [d.peer, d.of])).toEqual(PEERS.map((p) => [p, 'badge-1']))
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS * BADGES.length)
    expect(fixes.every((f) => f.node === REF && f.method === 'ul-tdoa')).toBe(true)
    expect(fixes.slice(0, BADGES.length).map((f) => f.of)).toEqual(BADGES)
    expect(fixes[0].anchors).toEqual(UL_ANCHORS.map((a) => a.id))
    for (const id of BADGES) expect(fixErrM(rs, id), id).toHaveLength(BLOCKS)
  })

  it('observe 3: the differences and the fix at 2.000 000 ms, as the log prints them', () => {
    const first = of(rs, 'UWB_TDOA').slice(0, 3)
    expect(first.map((r) => r.t)).toEqual([2 * MS, 2 * MS, 2 * MS])
    expect(fmtRecord(first[0])).toBe('anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)')
    expect(first.slice(1).map((r) => [r.dtNs.toFixed(2), r.trueDtNs.toFixed(2)]))
      .toEqual([['2.49', '2.29'], ['7.19', '7.15']])
    const fix = of(rs, 'UWB_POSITION')[0]
    expect(fix.t).toBe(2 * MS)
    expect(fmtRecord(fix)).toBe(
      'anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)',
    )
    const o3 = uwbUlTdoa.observe[2].en
    expect(o3).toContain('anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)')
    expect(o3).toContain('anchor 3 at 2.49 against 2.29 and anchor 4 at 7.19 against 7.15')
    expect(o3).toContain('anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)')
  })

  it('observe 4: the badge’s lane holds it all and the anchor that computed it holds nothing', () => {
    const vs = initViewState(uwbUlTdoa.scenario())
    for (const r of recs('base')) applyRecord(vs, r)
    const u = vs.nodes['badge-1'].uwb!
    expect(u.ranges).toEqual({})
    const rows = uwbTdoaRows(u)
    expect(rows.map((r) => r.peer)).toEqual(PEERS)
    expect(rows.map((r) => r.rounds)).toEqual([String(BLOCKS), String(BLOCKS), String(BLOCKS)])
    expect(rows.map((r) => r.error)).toEqual(['0.12 ns', '0.11 ns', '0.09 ns'])
    expect(uwbFixRow(u.position!, STRINGS.en.uwb)).toEqual({
      estimate: '(3.99, 3.48) m', truth: '(4.00, 3.50) m', error: '2.1 cm',
      gdop: '0.85', ellipse: '3.2 × 1.7 cm', method: 'UL-TDoA',
    })
    expect(uwbFixRow(u.position!, STRINGS.zh.uwb).method).toBe('上行到达时间差 (UL-TDoA)')
    // "Then open anchor 1, which did all of that arithmetic: its own lane is empty."
    const ref = vs.nodes[REF].uwb!
    expect(ref.position).toBeNull()
    expect(ref.tdoa).toEqual({})
    expect(ref.ranges).toEqual({})
    // the panel prints no leading plus, so the prose says the sign in words instead
    expect(rows.every((r) => !r.error.startsWith('+'))).toBe(true)
    const o4 = uwbUlTdoa.observe[3].en
    expect(o4).toContain('0.12, 0.11 and 0.09 ns — all three positive')
    expect(o4).toContain('a fix 2.1 cm from the truth, GDOP 0.85, error ellipse 3.2 × 1.7 cm, solved from UL-TDoA')
  })

  it('the badges’ crystals move the counters they write and nothing else whatever', () => {
    // The formula block's claim, taken at the engine: every timestamp in the arithmetic belongs
    // to an anchor, so pinning the badges at the ends of the ±20 ppm tolerance leaves the run
    // where it was — except in the one field a badge writes from its own clock and nobody reads.
    const s = uwbUlTdoaScenario('base')
    const pinned = (): Scenario => ({
      ...s,
      nodes: s.nodes.map((n): NodeCfg => (n.uwb?.role === 'tag'
        ? { ...n, uwb: { ...n.uwb, ppm: Number(n.id.slice(-1)) % 2 === 0 ? 20 : -20 } } : n)),
    })
    const base = recs('base')
    const off = runOf('ppm20', pinned)
    // "every record at the same instant and of the same type" — which is exactly what the
    // timeline hash is taken over (`t:seq:type`), so the two runs share one
    const hashOf = (build: () => Scenario): string => {
      const sim = new Simulation(build())
      sim.runUntil(RUN_NS)
      return sim.timelineHash()
    }
    expect(hashOf(pinned)).toBe(hashOf(() => uwbUlTdoaScenario('base')))
    expect(off).toHaveLength(base.length)
    expect(off.map((r) => [r.t, r.type])).toEqual(base.map((r) => [r.t, r.type]))
    // "and the same seventy fix errors"
    expect(fixErrM(off)).toEqual(fixErrM(base))
    expect(fixErrM(off)).toHaveLength(BLOCKS * BADGES.length)
    // "The only thing that moves is the counter a badge writes into its own transmit stamp":
    // 70 records of the 2520, one per blink; every difference, fix and anchor stamp is identical
    const differing = off.filter((r, i) => JSON.stringify(r) !== JSON.stringify(base[i]))
    expect(differing).toHaveLength(BLOCKS * BADGES.length)
    expect(differing.every((r) => r.type === 'UWB_TS' && r.dir === 'tx' && r.node.startsWith('badge-')))
      .toBe(true)
    const en = prose()
    expect(en).toContain('No interval is measured on anybody’s crystal')
    expect(en).toContain('the run comes back the same: every record at the same instant and of the same type, and the same seventy fix errors')
    expect(en).toContain('The only thing that moves is the counter a badge writes into its own transmit stamp, which nothing here reads')
  })
})

describe('uwb-ul-tdoa · what one nanosecond buys', () => {
  it('"One nanosecond is 29.98 cm of pseudo-range"', () => {
    expect((C_M_PER_NS * 100).toFixed(2)).toBe('29.98')
    expect(prose()).toContain('One nanosecond is 29.98 cm of pseudo-range')
  })

  it('"the four draws come out +0.14, −0.97, −0.34 and −0.31 ns", from the anchors’ own streams', () => {
    expect(uwbUlTdoa.scenario().seed).toBe(7)
    const offs = UL_ANCHORS.map((a) => drawnOffsetNs(a.id, 1))
    expect(offs.map((o) => o.toFixed(2))).toEqual(['0.14', '-0.97', '-0.34', '-0.31'])
    // the base scene draws the same standard normals and scales them by zero
    expect(UL_ANCHORS.every((a) => drawnOffsetNs(a.id, 0) === 0)).toBe(true)
    expect(prose()).toContain('+0.14, −0.97, −0.34 and −0.31 ns')
  })

  it('"badge 1’s difference against anchor 2 reads about 1.15 ns short — in every round"', () => {
    const bias = diffBiasNs(recs('sync'), 'anchor-2', 'badge-1')
    expect(bias).toHaveLength(BLOCKS)
    expect(bias.map((v) => v.toFixed(2)))
      .toEqual(['-1.18', '-1.28', '-1.16', '-1.11', '-1.12', '-1.18', '-0.99'])
    expect(mean(bias).toFixed(2)).toBe('-1.15')
    // it is the two anchors' draws and nothing else: the difference of the two offsets, to
    // within the timestamp noise of one subtraction
    const predicted = drawnOffsetNs('anchor-2', 1) - drawnOffsetNs(REF, 1)
    expect(Math.abs(mean(bias) - predicted)).toBeLessThan(ulSigmaM(0) / C_M_PER_NS)
    expect(bias.every((v) => v < 0)).toBe(true)
    // the synchronised run has no such thing: the same seven readings change sign
    const clean = diffBiasNs(recs('base'), 'anchor-2', 'badge-1')
    expect(clean.some((v) => v > 0) && clean.some((v) => v < 0)).toBe(true)
    expect(Math.abs(mean(clean))).toBeLessThan(0.1)
    const en = prose()
    expect(en).toContain('reads about 1.15 ns short — in every round of the run')
    expect(en).toContain('−1.18, −1.28, −1.16, −1.11, −1.12, −1.18 and −0.99 ns')
  })

  it('the two-scene table is what seven blocks produce, and everything lands inside 4σ', () => {
    const scenes: [UwbUlTdoaVariant, number, number][] = [['base', 0, 0], ['sync', 1, 1]]
    for (const [v, row, syncNs] of scenes) {
      const run = recs(v)
      // "σ per difference": √2·c·√(σ_ts² + sync²), the figure the solver is also given
      expect(cell(1, row, 1), v).toBe(`${(ulSigmaM(syncNs) * 100).toFixed(1)} cm`)
      const diffs = diffErrM(run)
      expect(diffs, v).toHaveLength(BLOCKS * BADGES.length * PEERS.length)
      expect(cell(1, row, 2), v).toBe(`${Math.max(...diffs).toFixed(2)} m`)
      const errs = fixErrM(run)
      expect(errs, v).toHaveLength(BLOCKS * BADGES.length)
      expect(cell(1, row, 3), v).toBe(
        `${(Math.min(...errs) * 100).toFixed(1)}–${(Math.max(...errs) * 100).toFixed(1)} cm, mean ${(mean(errs) * 100).toFixed(1)}`,
      )
      const a = of(run, 'UWB_POSITION').map((f) => f.ellipse.a * 100)
      expect(cell(1, row, 4), v).toBe(`${Math.min(...a).toFixed(1)}–${Math.max(...a).toFixed(1)} cm`)
      // "Every difference and every fix in both runs lands inside 4σ of it"
      expect(Math.max(...diffs), v).toBeLessThan(4 * ulSigmaM(syncNs))
      expect(Math.max(...errs), v).toBeLessThan(4 * ulSigmaM(syncNs))
    }
    expect([cell(1, 0, 1), cell(1, 0, 2), cell(1, 0, 3), cell(1, 0, 4)])
      .toEqual(['4.2 cm', '0.10 m', '0.2–7.7 cm, mean 3.2', '3.0–4.1 cm'])
    expect([cell(1, 1, 1), cell(1, 1, 2), cell(1, 1, 3), cell(1, 1, 4)])
      .toEqual(['42.6 cm', '0.41 m', '10.4–27.9 cm, mean 16.7', '30.5–41.5 cm'])
  })

  it('"all ten badges are pushed east, by 12 to 22 cm on average" — a distortion, not a scatter', () => {
    const sync = BADGES.map((id) => meanOffsetM(recs('sync'), id))
    expect(sync.every((o) => o.dx > 0)).toBe(true)
    const dx = sync.map((o) => o.dx * 100)
    expect([Math.min(...dx), Math.max(...dx)].map((v) => v.toFixed(0))).toEqual(['12', '22'])
    // the synchronised run scatters instead: the average of seven fixes is near zero and
    // the sign is not shared
    const base = BADGES.map((id) => meanOffsetM(recs('base'), id))
    expect(Math.max(...base.map((o) => Math.abs(o.dx)))).toBeLessThan(0.03)
    expect(base.some((o) => o.dx > 0) && base.some((o) => o.dx < 0)).toBe(true)
    expect(prose()).toContain('all ten badges are pushed east, by 12 to 22 cm on average')
  })

  it('"The ellipse grows tenfold with it, from the same σ", and it is honest', () => {
    const a = (v: UwbUlTdoaVariant): number[] => of(recs(v), 'UWB_POSITION').map((f) => f.ellipse.a)
    const ratio = mean(a('sync')) / mean(a('base'))
    expect(ratio).toBeGreaterThan(9)
    expect(ratio).toBeLessThan(11)
    // the σ it is built from grows by the same factor
    expect(ulSigmaM(1) / ulSigmaM(0)).toBeCloseTo(ratio, 1)
    // "how far the fix may be off rather than a 68 % interval": in both scenes the semi-major
    // axis is at least the worst error of the seventy, and within a factor of two of it
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const worst = Math.max(...fixErrM(recs(v)))
      expect(Math.max(...a(v)), v).toBeGreaterThan(worst / 2)
      expect(Math.min(...a(v)), v).toBeGreaterThan(worst / 3)
    }
    expect(prose()).toContain('read it as how far the fix may be off, not as a 68 % interval')
  })

  it('try-this 1: the 1 ns scene, badge 1’s rows and the whole spread', () => {
    const vs = initViewState(uwbUlTdoaScenario('sync'))
    for (const r of recs('sync')) applyRecord(vs, r)
    const u = vs.nodes['badge-1'].uwb!
    expect(uwbTdoaRows(u).map((r) => r.error)).toEqual(['-0.99 ns', '-0.37 ns', '-0.36 ns'])
    expect(uwbFixRow(u.position!, STRINGS.en.uwb).error).toBe('12.7 cm')
    expect(uwbFixRow(u.position!, STRINGS.en.uwb).ellipse).toBe('32.1 × 16.8 cm')
    const t1 = uwbUlTdoa.tryThis[0].en
    expect(t1).toContain('−0.99, −0.37 and −0.36 ns')
    expect(t1).toContain('its fix is 12.7 cm out and its ellipse has grown to 32.1 × 16.8 cm')
    expect(t1).toContain('10.4 to 27.9 cm against 0.2 to 7.7, a mean of 16.7 against 3.2')
  })

  it('try-this 2: the sync-error walk is linear, and geometry multiplies what the clocks hand it', () => {
    const means: string[] = []
    const worsts: string[] = []
    for (const ns of [0, 1, 2, 4]) {
      const run = ns === 0 ? recs('base') : ns === 1 ? recs('sync') : runOf(`sync${ns}`, () => withSync(ns))
      const errs = fixErrM(run)
      means.push((mean(errs) * 100).toFixed(1))
      worsts.push((Math.max(...errs) * 100).toFixed(1))
      expect(Math.max(...errs), String(ns)).toBeLessThan(4 * ulSigmaM(ns))
    }
    expect(means).toEqual(['3.2', '16.7', '33.4', '70.4'])
    expect(worsts).toEqual(['7.7', '27.9', '54.4', '135.3'])
    // "linear in the sigma, once it is clear of the timestamp noise": doubling the sync error
    // doubles the mean error from 1 ns on (to within a tenth), but not from 0
    for (const k of [2, 3]) {
      const ratio = Number(means[k]) / Number(means[k - 1])
      expect(ratio, String(k)).toBeGreaterThan(1.9)
      expect(ratio, String(k)).toBeLessThan(2.2)
    }
    expect(Number(means[1]) / Number(means[0])).toBeGreaterThan(4)
    // (9.8, 0.2) is outside the anchor rectangle, and the 1 ns scene's own badge 1 is inside it
    const out = runOf('moved-9.8-0.2', () => moved('badge-1', 9.8, 0.2))
    const fixes = of(out, 'UWB_POSITION').filter((f) => f.of === 'badge-1')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes[0].gdop.toFixed(2)).toBe('3.43')
    expect((fixes[0].ellipse.a * 100).toFixed(1)).toBe('143.5')
    expect(fixes[0].ellipse.a.toFixed(1)).toBe('1.4')
    expect((Math.max(...fixErrM(out, 'badge-1')) * 100).toFixed(1)).toBe('45.3')
    expect(of(recs('sync'), 'UWB_POSITION')[0].gdop.toFixed(2)).toBe('0.85')
    // "the anchor sync error field is live in UL-TDoA only": the field's label and its
    // disabled-elsewhere tooltip exist in both languages, and the walk stays inside the range the
    // schema — and so the field — allows. (The `disabled` binding itself lives in the editor's
    // own tests; this pins the claim as far as a headless course test can reach.)
    expect(STRINGS.en.editor.uwbSyncError).toBe('Anchor sync error')
    expect(STRINGS.zh.editor.uwbSyncError).toBe('锚点同步误差')
    expect(STRINGS.en.editor.uwbUlOnly).toContain('only UL-TDoA uses this')
    expect(STRINGS.zh.editor.uwbUlOnly.length).toBeGreaterThan(0)
    for (const ns of [0, 1, 2, 4]) expect(() => ScenarioSchema.parse(withSync(ns)), String(ns)).not.toThrow()
    expect(() => ScenarioSchema.parse(withSync(11))).toThrow()
    const t2 = uwbUlTdoa.tryThis[1].en
    expect(t2).toContain('the anchor sync error field is live in UL-TDoA only')
    expect(t2).toContain('mean errors of 3.2, 16.7, 33.4 and 70.4 cm, and worst cases of 7.7, 27.9, 54.4 and 135.3')
    expect(t2).toContain('GDOP goes from 0.85 to 3.43, the ellipse from 32 cm to 1.4 m, and the worst of its seven fixes to 45.3 cm')
  })
})

describe('uwb-ul-tdoa · blink, or listen', () => {
  it('"a listening round costs the anchors 0.505 % of the block", measured on lesson 6’s scene', () => {
    const dl = runOf('dl-ten', () => uwbDlTdoaScenario('ten'))
    const air = of(dl, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect((air / BLOCKS / (200 * MS) * 100).toFixed(3)).toBe('0.505')
    // "whether three badges hear it or three thousand": the same air for three listeners
    const three = runOf('dl-three', () => uwbDlTdoaScenario('base'))
    expect(of(three, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)).toBe(air)
    // "a blink costs one slot each": ten badges here cost nearly twice that, and every badge
    // that joins costs another slot
    const ul = of(recs('base'), 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(ul / BLOCKS / (200 * MS) * 100).toBeGreaterThan(air / BLOCKS / (200 * MS) * 100)
    expect(prose()).toContain('0.505 % of the block whether three badges hear it or three thousand')
    // "the block runs out at a hundred"
    expect(roundPlan(uwbUlTdoaScenario('base').uwb!, UL_ANCHORS.length).roundsPerBlock).toBe(100)
    expect(prose()).toContain('the block runs out at a hundred')
  })

  it('quiz 3’s four hundred tags need four blocks of slots', () => {
    const perBlock = roundPlan(uwbUlTdoaScenario('base').uwb!, UL_ANCHORS.length).roundsPerBlock
    expect(400 / perBlock).toBe(4)
    expect(uwbUlTdoa.quiz[2].explain.en).toContain('Four hundred tags need four blocks of slots')
  })

  it('replays bit-for-bit, in both scenes', () => {
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})
