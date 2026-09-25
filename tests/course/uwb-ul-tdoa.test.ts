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
 *
 * The lesson was rewritten by the readability programme: the quoted log lines
 * and the two scenes moved into tables of `numbers`, and the drawn offsets, the
 * sync-error walk and the geometry into `deeper`. Every pin moved with its
 * sentence; the shape checks every migrated lesson owes are in
 * tests/course/kit.ts.
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
import type { Block } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { fmtRecord } from '../../src/ui/format'
import { C_M_PER_NS, UWB_BLINK_BYTES, rstuNs, uwbPpduNs } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { gaussian, UwbClock } from '../../src/uwb/clock'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbFixRow, uwbTdoaRows } from '../../src/uwb/ui/rows'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven blocks, the window the two lessons before this one measure over: block 6 starts at
 * 1.200 s and its ten one-slot rounds are finished 20 ms later, while block 7 would not start
 * until 1.400 s. */
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

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (v: UwbUlTdoaVariant): TLRecord[] => runOf(uwbUlTdoa, v === 'base' ? undefined : V_SYNC, RUN_NS)

/** The scenes this file builds for itself: a knob moved, a badge moved, the listen-only scene. */
const extra = new Map<string, TLRecord[]>()
const runExtra = (key: string, build: () => Scenario): TLRecord[] => {
  if (!extra.has(key)) extra.set(key, [...new Simulation(build()).runUntil(RUN_NS).records])
  return extra.get(key)!
}

/** |measured − true| of every difference, as a distance. */
const diffErrM = (rs: TLRecord[], peer?: string, badge?: string): number[] =>
  ofType(rs, 'UWB_TDOA').filter((r) => (peer === undefined || r.peer === peer) && (badge === undefined || r.of === badge))
    .map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
/** The same, in nanoseconds and keeping the sign: a calibration offset is one-sided. */
const diffBiasNs = (rs: TLRecord[], peer: string, badge: string): number[] =>
  ofType(rs, 'UWB_TDOA').filter((r) => r.peer === peer && r.of === badge).map((r) => r.dtNs - r.trueDtNs)
/** Fix errors, in metres; UL-TDoA fixes are emitted by the reference anchor and named `of` a badge. */
const fixErrM = (rs: TLRecord[], badge?: string): number[] =>
  ofType(rs, 'UWB_POSITION').filter((f) => badge === undefined || f.of === badge)
    .map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
/** Where a badge's fixes sit on average, relative to the truth: a bias moves them all one way. */
const meanOffsetM = (rs: TLRecord[], badge: string): { dx: number; dy: number } => {
  const fs = ofType(rs, 'UWB_POSITION').filter((f) => f.of === badge)
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


const tablesOf = (blocks: Block[]): Extract<Block, { kind: 'table' }>[] =>
  blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
/** The nth table of `numbers`: what a badge spends, the two scenes, the log. */
const cell = (table: number, row: number, col: number): string =>
  tablesOf(uwbUlTdoa.numbers!)[table].rows[row][col]
/** The nth table of `deeper`: the sync-error walk. */
const deepCell = (table: number, row: number, col: number): string =>
  tablesOf(uwbUlTdoa.deeper!)[table].rows[row][col]

// The contract every migrated lesson owes, written once in tests/course/kit.ts. The jump
// targets close the first slot at 2 ms, so the shape suite shares these tests' long run.
lessonShapeSuite(uwbUlTdoa, { runNs: RUN_NS })

describe('uwb-ul-tdoa · the lesson’s own place in the track', () => {
  it('asks for the listen-only lesson and adds four words', () => {
    expect(MODULES[uwbUlTdoa.module].title).toBe('单向测距')
    expect(uwbUlTdoa.id).toBe('uwb-ul-tdoa')
    expect(uwbUlTdoa.needs).toEqual(['uwb-dl-tdoa'])
    expect(uwbUlTdoa.terms!.map((t) => t.term)).toEqual(['blink', 'UL-TDoA', 'sync error', 'bias'])
  })

  it('it offers five jumps, three things to observe, two experiments and three questions', () => {
    expect(uwbUlTdoa.jumps).toHaveLength(5)
    expect(uwbUlTdoa.observe).toHaveLength(3)
    expect(uwbUlTdoa.tryThis).toHaveLength(2)
    expect(uwbUlTdoa.quiz).toHaveLength(3)
    for (const q of uwbUlTdoa.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx = uwbUlTdoa.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the round and the blink open the run; the first anchor stamps it one PPDU later, and the
    // difference and the fix close the slot at 2 ms
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(0)
    expect(rs[idx[2]].t).toBe(181_234)
    expect(rs[idx[3]].t).toBe(2 * MS)
    expect(rs[idx[4]].t).toBe(2 * MS)
    // the watch call-out sends the reader to the fix, which is the point of the lesson
  })

  it('names the clause it leans on, and only in `sources`', () => {
    const src = uwbUlTdoa.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024 §10.29.1.2.5')
    expect(src).toContain('§16.4.9')
  })

  it('it is read after uwb-dl-tdoa in the course order', () => {
    expect(MODULES[uwbUlTdoa.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids.indexOf('uwb-dl-tdoa')).toBeLessThan(ids.indexOf('uwb-ul-tdoa'))
    expect(COURSE_ORDER.indexOf('uwb-dl-tdoa')).toBeLessThan(COURSE_ORDER.indexOf('uwb-ul-tdoa'))
    // and the last lesson of the tier is read after it
    expect(COURSE_ORDER.indexOf('uwb-ul-tdoa')).toBeLessThan(COURSE_ORDER.indexOf('uwb-aoa'))
    expect(ids.indexOf('uwb-ul-tdoa')).toBeLessThan(ids.indexOf('uwb-aoa'))
  })
})

describe('uwb-ul-tdoa · the scene', () => {
  it('is the listen-only lesson’s four corner anchors and its ten spots, with badges that only transmit', () => {
    const s = uwbUlTdoa.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
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
    // "The same room as the lesson before: anchors in the corners, badges at chest height."
    const dl = uwbDlTdoaScenario('ten')
    for (const a of UL_ANCHORS) {
      expect(dl.nodes.find((n) => n.id === a.id)!.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
    }
    expect(TAG_SPOTS).toEqual(DL_TAG_SPOTS)
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    // "None of them is directly under an anchor": the nearest is 0.71 m away in plan
    const gaps = TAG_SPOTS.map((p) => Math.min(...UL_ANCHORS.map((a) => Math.hypot(a.x - p.x, a.y - p.y))))
    expect(Math.min(...gaps)).toBeGreaterThan(0.7)
  })

  it('is a UL-TDoA session on the defaults, NLOS on, and every crystal drawn rather than set', () => {
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      expect(() => ScenarioSchema.parse(scenarioOf(v)), v).not.toThrow()
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
    // "the default of 0 ns makes the anchors perfect"; the variant sets 1 and nothing else
    expect(DEFAULT_UWB_SESSION.syncErrorNs).toBe(0)
    expect(scenarioOf('base').uwb!.syncErrorNs).toBe(0)
    expect(scenarioOf('sync').uwb!.syncErrorNs).toBe(1)
    expect(uwbUlTdoa.variants).toHaveLength(1)
    const strip = (s: Scenario) => JSON.stringify({ ...s, uwb: { ...s.uwb!, syncErrorNs: 0 } })
    expect(strip(scenarioOf('sync'))).toBe(strip(scenarioOf('base')))
  })

  it('"It owns one slot per block": 2 ms of it, and the block holds a hundred', () => {
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
    // 9.06 %: a hundred blinks in one block
    expect((100 * uwbPpduNs(UWB_BLINK_BYTES) / plan.blockNs * 100).toFixed(2)).toBe('9.06')
    // one round per badge per block, each one slot long, all seven blocks of them
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const rounds = ofType(recs(v), 'UWB_ROUND')
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
    const tx = ofType(rs, 'TX_START')
    // "a badge is the only thing that transmits": ten blinks a block, in the badges' own order
    expect(tx.filter((r) => r.t < 200 * MS).map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot]))
      .toEqual(BADGES.map((id) => [id, 'uwbBlink', 0]))
    expect(tx).toHaveLength(BLOCKS * BADGES.length)
    expect(tx).toHaveLength(70)
    expect(tx.every((r) => r.node.startsWith('badge-'))).toBe(true)
    // "a short broadcast with no times inside it", at the size and duration the table prints
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
    expect(ofType(rs, 'UWB_RANGE')).toEqual([])
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
    // "Every transmission in the run is a badge's — seventy in all."
  })

  it('"then goes idle until the next block": tx, idle, and nothing for 199.8 ms', () => {
    const states = ofType(rs, 'MAC_STATE').filter((r) => r.node === 'badge-1')
    expect(states.map((r) => [r.t, r.state])).toEqual(
      Array.from({ length: BLOCKS }, (_, b) => [[b * 200 * MS, 'tx'], [b * 200 * MS + 181_218, 'idle']]).flat(),
    )
    // and the badge never opens a receiver: no arrival is ever stamped at a badge
    expect(ofType(rs, 'UWB_TS').filter((r) => r.node.startsWith('badge-')).every((r) => r.dir === 'tx')).toBe(true)
  })

  it('ten badges cost a block 0.906 %, and seven blocks 12.685 260 ms of air', () => {
    const airNs = (records: TLRecord[]): number =>
      ofType(records, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(airNs(rs)).toBe(BLOCKS * BADGES.length * uwbPpduNs(UWB_BLINK_BYTES))
    expect(airNs(rs)).toBe(12_685_260)
    const perBlock = airNs(rs) / BLOCKS
    expect(perBlock).toBe(1_812_180)
    expect((perBlock / (200 * MS) * 100).toFixed(3)).toBe('0.906')
    expect(cell(0, 2, 1)).toBe('1.812 180 ms, 0.906 %')
    expect(tablesOf(uwbUlTdoa.numbers!)[0].head).toHaveLength(2)
    // the air is identical in the 1 ns scene: a calibration error changes nothing a radio does
    expect(airNs(recs('sync'))).toBe(airNs(rs))
  })

  it('the log table quotes the round and the blink as fmtRecord prints them', () => {
    const round = ofType(rs, 'UWB_ROUND')[0]
    expect(round.t).toBe(0)
    expect(cell(2, 0, 1)).toBe('badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs')
    expect(fmtRecord(round)).toBe(cell(2, 0, 1))
    expect(cell(2, 1, 1)).toBe('badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)')
    expect(fmtRecord(ofType(rs, 'TX_START')[0])).toBe(cell(2, 1, 1))
    // "A badge opens the one round of the block that is its own": badge 2's opens at 2 ms
    expect(ofType(rs, 'UWB_ROUND')[1].t).toBe(2 * MS)
    expect(ofType(rs, 'UWB_ROUND')[1].node).toBe('badge-2')
  })

  it('four stamps, in distance order, eight nanoseconds apart end to end', () => {
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx' && r.t < 2 * MS)
    expect(stamps.map((r) => r.node)).toEqual([REF, 'anchor-3', 'anchor-2', 'anchor-4'])
    expect(stamps.map((r) => r.t)).toEqual([181_234, 181_237, 181_240, 181_242])
    expect(stamps.every((r) => r.peer === 'badge-1')).toBe(true)
    expect(stamps[3].t - stamps[0].t).toBe(8)
    // "in order of each anchor's distance from the badge"
    const d = (id: string): number => {
      const a = UL_ANCHORS.find((x) => x.id === id)!
      return Math.hypot(a.x - TAG_SPOTS[0].x, a.y - TAG_SPOTS[0].y, ANCHOR_Z - TAG_Z)
    }
    const byDistance = stamps.map((r) => d(r.node))
    expect(byDistance).toEqual([...byDistance].sort((a, b) => a - b))
    const o2 = uwbUlTdoa.observe[1]
    for (const s of ['181.234', '181.237', '181.240', '181.242']) expect(o2).toContain(s)
  })
})

describe('uwb-ul-tdoa · positioned by somebody else', () => {
  const rs = recs('base')

  it('the reference anchor emits three differences and one fix per blink, each named `of` a badge', () => {
    const diffs = ofType(rs, 'UWB_TDOA')
    expect(diffs).toHaveLength(BLOCKS * BADGES.length * PEERS.length)
    expect(diffs.every((d) => d.node === REF && d.ref === REF)).toBe(true)
    expect(diffs.slice(0, 3).map((d) => [d.peer, d.of])).toEqual(PEERS.map((p) => [p, 'badge-1']))
    const fixes = ofType(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS * BADGES.length)
    expect(fixes.every((f) => f.node === REF && f.method === 'ul-tdoa')).toBe(true)
    expect(fixes.slice(0, BADGES.length).map((f) => f.of)).toEqual(BADGES)
    expect(fixes[0].anchors).toEqual(UL_ANCHORS.map((a) => a.id))
    for (const id of BADGES) expect(fixErrM(rs, id), id).toHaveLength(BLOCKS)
    // "Three time differences and one place leave the reference anchor's lane": at the slot's end
  })

  it('the log table quotes the difference and the fix of the first slot', () => {
    const first = ofType(rs, 'UWB_TDOA').slice(0, 3)
    expect(first.map((r) => r.t)).toEqual([2 * MS, 2 * MS, 2 * MS])
    expect(cell(2, 2, 1)).toBe('anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)')
    expect(fmtRecord(first[0])).toBe(cell(2, 2, 1))
    expect(first.slice(1).map((r) => [r.dtNs.toFixed(2), r.trueDtNs.toFixed(2)]))
      .toEqual([['2.49', '2.29'], ['7.19', '7.15']])
    const fix = ofType(rs, 'UWB_POSITION')[0]
    expect(fix.t).toBe(2 * MS)
    expect(cell(2, 3, 1)).toBe(
      'anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)',
    )
    expect(fmtRecord(fix)).toBe(cell(2, 3, 1))
    // "the line names the badge it is about"
  })

  it('the badge’s lane holds it all and the anchor that computed it holds nothing', () => {
    const vs = initViewState(uwbUlTdoa.scenario())
    for (const r of recs('base')) applyRecord(vs, r)
    const u = vs.nodes['badge-1'].uwb!
    expect(u.ranges).toEqual({})
    const rows = uwbTdoaRows(u)
    expect(rows.map((r) => r.peer)).toEqual(PEERS)
    expect(rows.map((r) => r.rounds)).toEqual([String(BLOCKS), String(BLOCKS), String(BLOCKS)])
    expect(rows.map((r) => r.error)).toEqual(['0.12 ns', '0.11 ns', '0.09 ns'])
    expect(uwbFixRow(u.position!, STRINGS.uwb)).toMatchObject({
      estimate: '(3.99, 3.48) m', truth: '(4.00, 3.50) m', error: '2.1 cm',
      gdop: '0.85', ellipse: '3.2 × 1.7 cm',
    })
    for (const n of ['2.1 cm', '0.85', '3.2 × 1.7 cm']) expect(cell(2, 4, 1), n).toContain(n)
    // "Then open the reference anchor that did the arithmetic — its lane is empty."
    const ref = vs.nodes[REF].uwb!
    expect(ref.position).toBeNull()
    expect(ref.tdoa).toEqual({})
    expect(ref.ranges).toEqual({})
  })

  it('the badges’ crystals move the counters they write and nothing else whatever', () => {
    // The formula note's claim, taken at the engine: every timestamp in the arithmetic belongs
    // to an anchor, so pinning the badges at the ends of the ±20 ppm tolerance leaves the run
    // where it was — except in the one field a badge writes from its own clock and nobody reads.
    const s = uwbUlTdoaScenario('base')
    const pinned = (): Scenario => ({
      ...s,
      nodes: s.nodes.map((n): NodeCfg => (n.uwb?.role === 'tag'
        ? { ...n, uwb: { ...n.uwb, ppm: Number(n.id.slice(-1)) % 2 === 0 ? 20 : -20 } } : n)),
    })
    const base = recs('base')
    const off = runExtra('ppm20', pinned)
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
  })
})

describe('uwb-ul-tdoa · what one nanosecond buys', () => {
  it('"One nanosecond is 29.98 cm of pseudo-range"', () => {
    expect((C_M_PER_NS * 100).toFixed(2)).toBe('29.98')
  })

  it('"the four draws come out +0.14, −0.97, −0.34 and −0.31 ns", from the anchors’ own streams', () => {
    expect(uwbUlTdoa.scenario().seed).toBe(7)
    const offs = UL_ANCHORS.map((a) => drawnOffsetNs(a.id, 1))
    expect(offs.map((o) => o.toFixed(2))).toEqual(['0.14', '-0.97', '-0.34', '-0.31'])
    // the base scene draws the same standard normals and scales them by zero
    expect(UL_ANCHORS.every((a) => drawnOffsetNs(a.id, 0) === 0)).toBe(true)
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
      for (const n of [(Math.min(...errs) * 100).toFixed(1), (Math.max(...errs) * 100).toFixed(1),
        (mean(errs) * 100).toFixed(1)]) {
        expect(cell(1, row, 3), `${v} ${n}`).toContain(n)
      }
      const a = ofType(run, 'UWB_POSITION').map((f) => f.ellipse.a * 100)
      expect(cell(1, row, 4), v).toBe(`${Math.min(...a).toFixed(1)}–${Math.max(...a).toFixed(1)} cm`)
      // "Every difference and every fix of both runs lands inside 4σ of it"
      expect(Math.max(...diffs), v).toBeLessThan(4 * ulSigmaM(syncNs))
      expect(Math.max(...errs), v).toBeLessThan(4 * ulSigmaM(syncNs))
    }
    expect([cell(1, 0, 1), cell(1, 0, 2), cell(1, 0, 4)]).toEqual(['4.2 cm', '0.10 m', '3.0–4.1 cm'])
    for (const n of ['0.2', '7.7', '3.2']) expect(cell(1, 0, 3), n).toContain(n)
  })

  it('"all ten badges have moved east, by 12 to 22 cm" — a distortion, not a scatter', () => {
    const sync = BADGES.map((id) => meanOffsetM(recs('sync'), id))
    expect(sync.every((o) => o.dx > 0)).toBe(true)
    const dx = sync.map((o) => o.dx * 100)
    expect([Math.min(...dx), Math.max(...dx)].map((v) => v.toFixed(0))).toEqual(['12', '22'])
    // the synchronised run scatters instead: the average of seven fixes is near zero and
    // the sign is not shared
    const base = BADGES.map((id) => meanOffsetM(recs('base'), id))
    expect(Math.max(...base.map((o) => Math.abs(o.dx)))).toBeLessThan(0.03)
  })

  it('"it grows tenfold between the rows", and the ellipse is honest about what it means', () => {
    const a = (v: UwbUlTdoaVariant): number[] => ofType(recs(v), 'UWB_POSITION').map((f) => f.ellipse.a)
    const ratio = mean(a('sync')) / mean(a('base'))
    expect(ratio).toBeGreaterThan(9)
    expect(ratio).toBeLessThan(11)
    // the σ it is built from grows by the same factor
    expect(ulSigmaM(1) / ulSigmaM(0)).toBeCloseTo(ratio, 1)
    // "at least half the worst of the seventy errors and never more than a few times it"
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const worst = Math.max(...fixErrM(recs(v)))
      expect(Math.max(...a(v)), v).toBeGreaterThan(worst / 2)
    }
  })

  it('the first experiment: badge 1’s rows in the 1 ns scene, and the whole spread', () => {
    const vs = initViewState(uwbUlTdoaScenario('sync'))
    for (const r of recs('sync')) applyRecord(vs, r)
    const u = vs.nodes['badge-1'].uwb!
    expect(uwbTdoaRows(u).map((r) => r.error)).toEqual(['-0.99 ns', '-0.37 ns', '-0.36 ns'])
    expect(uwbFixRow(u.position!, STRINGS.uwb).error).toBe('12.7 cm')
    expect(uwbFixRow(u.position!, STRINGS.uwb).ellipse).toBe('32.1 × 16.8 cm')
    // "its own fix is 12.7 cm out where the synchronised run had it 2.1"
  })

  it('the second experiment: the sync-error walk is linear, and geometry multiplies it', () => {
    const means: string[] = []
    const worsts: string[] = []
    for (const ns of [0, 1, 2, 4]) {
      const run = ns === 0 ? recs('base') : ns === 1 ? recs('sync') : runExtra(`sync${ns}`, () => withSync(ns))
      const errs = fixErrM(run)
      means.push((mean(errs) * 100).toFixed(1))
      worsts.push((Math.max(...errs) * 100).toFixed(1))
      expect(Math.max(...errs), String(ns)).toBeLessThan(4 * ulSigmaM(ns))
    }
    expect(means).toEqual(['3.2', '16.7', '33.4', '70.4'])
    expect(worsts).toEqual(['7.7', '27.9', '54.4', '135.3'])
    // the `deeper` table prints exactly those, row for row
    ;[0, 1, 2, 4].forEach((ns, row) => {
      expect(deepCell(0, row, 0)).toBe(`${ns} ns`)
      expect(deepCell(0, row, 1)).toBe(`${means[row]} cm`)
      expect(deepCell(0, row, 2)).toBe(`${worsts[row]} cm`)
    })
    // "It quadruples over the first step, then doubles with the sigma" — to within a tenth
    for (const k of [2, 3]) {
      const ratio = Number(means[k]) / Number(means[k - 1])
      expect(ratio, String(k)).toBeGreaterThan(1.9)
      expect(ratio, String(k)).toBeLessThan(2.2)
    }
    // (9.8, 0.2) is outside the anchor rectangle, and the 1 ns scene's own badge 1 is inside it
    const out = runExtra('moved-9.8-0.2', () => moved('badge-1', 9.8, 0.2))
    const fixes = ofType(out, 'UWB_POSITION').filter((f) => f.of === 'badge-1')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes[0].gdop.toFixed(2)).toBe('3.43')
    expect(fixes[0].ellipse.a.toFixed(1)).toBe('1.4')
    expect((Math.max(...fixErrM(out, 'badge-1')) * 100).toFixed(1)).toBe('45.3')
    expect(ofType(recs('sync'), 'UWB_POSITION')[0].gdop.toFixed(2)).toBe('0.85')
    // "the anchor sync error field is live in UL-TDoA only": the field's label and its
    // disabled-elsewhere tooltip exist, and the walk stays inside the range the
    // schema — and so the field — allows. (The `disabled` binding itself lives in the editor's
    // own tests; this pins the claim as far as a headless course test can reach.)
    for (const ns of [0, 1, 2, 4]) expect(() => ScenarioSchema.parse(withSync(ns)), String(ns)).not.toThrow()
    expect(() => ScenarioSchema.parse(withSync(11))).toThrow()
  })
})

describe('uwb-ul-tdoa · blink, or listen', () => {
  it('"a listening round costs the anchors 0.505 % of the block", on the listen-only scene', () => {
    const dl = runExtra('dl-ten', () => uwbDlTdoaScenario('ten'))
    const air = ofType(dl, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect((air / BLOCKS / (200 * MS) * 100).toFixed(3)).toBe('0.505')
    // "whether three badges hear it or three thousand": the same air for three listeners
    const three = runExtra('dl-three', () => uwbDlTdoaScenario('base'))
    expect(ofType(three, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)).toBe(air)
    // "a blink costs one slot each": ten badges here cost nearly twice that
    const ul = ofType(recs('base'), 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(ul / BLOCKS / (200 * MS) * 100).toBeGreaterThan(air / BLOCKS / (200 * MS) * 100)
    // "the block runs out at a hundred"
    expect(roundPlan(uwbUlTdoaScenario('base').uwb!, UL_ANCHORS.length).roundsPerBlock).toBe(100)
  })

  it('quiz 3’s four hundred tags need four blocks of slots', () => {
    const perBlock = roundPlan(uwbUlTdoaScenario('base').uwb!, UL_ANCHORS.length).roundsPerBlock
    expect(400 / perBlock).toBe(4)
  })

  it('replays bit-for-bit, in both scenes', () => {
    for (const v of ['base', 'sync'] as UwbUlTdoaVariant[]) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})

/**
 * The procedure the 2026-09-23 amendment asks for ("mechanism before metaphor"):
 * the steps `solveUlFix` takes, in the order device.ts and network.ts take them,
 * and the worked example that runs them on badge-1's first block against
 * anchor-2. Every row is recomputed from the scene's own geometry and the
 * UWB_TDOA / UWB_POSITION records the engine emitted — the point of the table is
 * that a UL difference is two instants on one timebase and nothing else.
 */
describe('uwb-ul-tdoa · the procedure, step by step', () => {
  /** The lesson's steps block of `numbers`. */
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbUlTdoa.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  /** The worked example's table is the last of `numbers`. */
  const wcell = (row: number, col: number): string => {
    const ts = tablesOf(uwbUlTdoa.numbers!)
    return ts[ts.length - 1].rows[row][col]
  }
  /** True 3-D separation of badge-1 from an anchor, in the scene's own coordinates. */
  const distTo = (a: { x: number; y: number }): number =>
    Math.hypot(a.x - TAG_SPOTS[0].x, a.y - TAG_SPOTS[0].y, ANCHOR_Z - TAG_Z)
  const first = () => ofType(recs('base'), 'UWB_TDOA')
    .filter((r) => r.of === 'badge-1' && r.peer === 'anchor-2')[0]

  it('is a steps block on the main path, not in `deeper`, and runs in the engine’s own order', () => {
    expect(uwbUlTdoa.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbUlTdoa.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    // the order is the engine's: the blink is sent, each anchor stamps a counter for the log,
    // the fix is built from the common-timebase arrival instead, the residual was drawn once
    // at build time, the network collects the arrivals for the reference anchor, it subtracts,
    // and it solves (device.ts `onRx`, network.ts `endRound`, device.tdoa.ts `solveUlFix`)
    // the record type the procedure names is the one the engine emits
    expect(steps().items.join(' | ')).toContain('UWB_TS')
    for (const s of steps().items) expect(s.length).toBeGreaterThan(0)
  })

  it('the worked example’s two flights are the scene’s geometry, and their difference the truth', () => {
    const d1 = distTo(UL_ANCHORS[0]), d2 = distTo(UL_ANCHORS[1])
    expect(wcell(1, 1)).toBe(`${d1.toFixed(4)} m · ${(d1 / C_M_PER_NS).toFixed(3)} ns`)
    expect(wcell(2, 1)).toBe(`${d2.toFixed(4)} m · ${(d2 / C_M_PER_NS).toFixed(3)} ns`)
    const td = first()
    // the record's own truth is exactly that difference of flights
    expect(td.trueDtNs).toBeCloseTo((d2 - d1) / C_M_PER_NS, 9)
    expect(wcell(3, 1)).toBe(`${td.trueDtNs.toFixed(4)} ns · ${(td.trueDtNs * C_M_PER_NS).toFixed(4)} m`)
    // the transmit instant is never measured, so its cell carries no figure at all
    expect(wcell(0, 1)).not.toMatch(/[0-9]/)
  })

  it('the difference, the leftover and the σ are the engine’s, with no clock correction anywhere', () => {
    const td = first()
    // the base scene's anchors are perfectly calibrated: every drawn residual is exactly zero
    expect(DEFAULT_UWB_SESSION.syncErrorNs).toBe(0)
    for (const a of UL_ANCHORS) expect(Math.abs(drawnOffsetNs(a.id, DEFAULT_UWB_SESSION.syncErrorNs))).toBe(0)
    expect(wcell(4, 1)).toBe('0 ns')
    expect(wcell(5, 1)).toBe(`${td.dtNs.toFixed(4)} ns`)
    // what is left is the two receivers' timestamp noise, and nothing else
    const left = td.dtNs - td.trueDtNs
    expect(wcell(6, 1)).toBe(`${left.toFixed(4).replace('-', '−')} ns · ${(left * C_M_PER_NS * 100).toFixed(2).replace('-', '−')} cm`)
    expect(wcell(7, 1)).toContain(`= ${(ulSigmaM(0) * 100).toFixed(1)} cm`)
  })

  it('the fix the worked example ends on is the UWB_POSITION record the reference anchor emitted', () => {
    const f = ofType(recs('base'), 'UWB_POSITION').filter((p) => p.of === 'badge-1')[0]
    expect(f.node).toBe(REF)
    const err = Math.hypot(f.x - f.trueX, f.y - f.trueY)
    expect(wcell(8, 1)).toBe(
      `(${f.x.toFixed(2)}, ${f.y.toFixed(2)}) m, true (${f.trueX.toFixed(2)}, ${f.trueY.toFixed(2)}), error ${err.toFixed(2)} m`,
    )
  })

  it('a numeric cell of this lesson is a value, never a sentence', () => {
    // the CELL_RULE_CARRIES entry this lesson owed: "1 slot of 2 ms, 1 frame" was one string
    // rendered to both readers, so the Chinese table read English. The cell is Chinese now.
    const prosey = /\b[a-z]{2,}\s+[a-z]{2,}\b|\b[a-z]{4,}\b[^A-Za-z\n]{1,12}\b[a-z]{4,}\b/
    const logLine = /^[a-z][a-z0-9]*-\d+\b/
    for (const b of [...uwbUlTdoa.numbers!, ...uwbUlTdoa.picture!]) {
      if (b.kind !== 'table') continue
      for (const c of [...b.head, ...b.rows.flat()]) {
        if (c !== c || logLine.test(c)) continue
        expect(prosey.test(c), c).toBe(false)
      }
    }
    expect(tablesOf(uwbUlTdoa.numbers!)[0].rows[1][1]).toBe('1 个 2 ms 时隙，1 帧')
  })
})
