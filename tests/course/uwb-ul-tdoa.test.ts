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
import { readFileSync } from 'node:fs'
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
    /*
     * **The two headings that say which block they are of**, uncovered by the 「第」 rule change
     * of 2026-10-14 — 「日志印出什么：badge-1，第 0 块」 and 「badge-1，第 0 块，对 anchor-…」.
     * A heading is prose with a figure in it, and this figure is a claim about which records sit
     * below it: the round line and the difference both carry the block they belong to.
     */
    const heads = tablesOf(uwbUlTdoa.numbers!)
      .flatMap((x) => (x.heading === undefined ? [] : [x.heading]))
      .filter((h) => /第 \d+ 块/.test(h))
    expect(heads.length, 'the headings that name a block').toBe(2)
    for (const h of heads) {
      const b = Number(/第 (\d+) 块/.exec(h)![1])
      expect(round.block, `「${h}」: the round line it quotes is of that block`).toBe(b)
      expect(ofType(rs, 'UWB_TDOA')[0]!.block,
        `「${h}」: and so is the first difference of the run`).toBe(b)
    }
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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The tables above are already read the right way round — a cell is compared with the string the
 * engine's own figures build, so moving a digit in the lesson reddens them. What the sampling
 * sweep of 2026-10-12 found (3 of 6) is everything **outside** the tables: `numbers`' three
 * paragraphs, the whole of `deeper`, `sources`, `observe`, `tryThis` and the two table
 * **headings** that carry a count of their own. This describe reads those, and it reads them the
 * same way: the figure is parsed out of the shipped string and compared with a live measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the σ formula is read as the root it is.** 「√2·c·√(σ_ts² + sync²)」 and the worked cell
 *    「√2·c·√(0.1² + 0²) ns = 4.2 cm」 give up four figures: the 2 under the first radical, the
 *    timestamp noise in nanoseconds, this scene's own calibration residual and the answer. The
 *    root is rebuilt from the parsed 2, so a 3 there is a different sigma and the cells no longer
 *    match the engine.
 *  - **the geometry experiment builds its scene out of its own sentence.** 「把 badge-1 拖到
 *    (9.8, 0.2)」 is parsed, and *that* badge is moved *there*; the GDOP, the ellipse and the
 *    worst of the seven fixes the same sentence quotes have to be what that run produces.
 *  - **`sources` is read against the schema's own comments.** The ±20 ppm tolerance and the
 *    clause it cites are written beside `NodeCfg.ppm` in `src/model/scenario.ts`, and the 1-σ of
 *    the 100 ps noise is written beside `tsNoisePs` — so the reader who walks over there has to
 *    find the same figures.
 *  - **the walk is driven by the four values `tryThis` prints**, not by a list typed here: each
 *    parsed value builds its own run, and the mean it produces has to be the one `deeper`'s
 *    table prints on that row.
 *
 * **One figure is exempt, class (c), and it is argued rather than waved:** 「都落在它的 4σ
 * 之内」. That sentence's content is an inequality — the base run's worst difference is 2.4σ and
 * the 1 ns run's is 0.96σ, so a 3 or a 5 in that place would be just as true of this run. What is
 * read instead is the claim itself: every difference and every fix of both runs is inside the
 * multiple the sentence names. The 68 % of 「不是 68 % 置信区间」 is exempt for the same reason
 * `@uwb-dl-tdoa` files it — it is the statistical convention the sentence is warning the reader
 * *not* to apply, and this repository holds no confidence interval of any size.
 */
describe('uwb-ul-tdoa · every figure the prose prints, read back out of it', () => {
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
  const NUMS = blockText(uwbUlTdoa.numbers)
  const DEEP = blockText(uwbUlTdoa.deeper)
  const LIM = blockText(uwbUlTdoa.limits)
  const SRC = blockText(uwbUlTdoa.sources)
  const OBS = blockText(uwbUlTdoa.observe)
  const TRY = blockText(uwbUlTdoa.tryThis)
  /** The schema file whose own comments answer two of `sources`' figures. */
  const SCENARIO_SRC = readFileSync(new URL('../../src/model/scenario.ts', import.meta.url), 'utf8')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** The view state the inspector builds, which is where two of `deeper`'s figures are printed. */
  const viewOf = (v: UwbUlTdoaVariant): ReturnType<typeof initViewState> => {
    const vs = initViewState(scenarioOf(v))
    for (const r of recs(v)) applyRecord(vs, r)
    return vs
  }

  it('reads the pseudo-range sentence, and both scenes’ sync error wherever it is printed', () => {
    // 「1 ns 就是 29.98 cm 的伪距」
    const [ns, cm] = figs(NUMS, /(\d+) ns 就是 ([\d.]+) cm 的伪距/, '`numbers` on one nanosecond')
    same(String(cm), ns! * C_M_PER_NS * 100, 'what a nanosecond of pseudo-range is worth')
    // 「默认的 0 ns 意味着锚点完美无缺，而变体把它设成 1 ns」 — and the steps say it again.
    const [dflt, variant] = figs(NUMS, /默认的 (\d+) ns 意味着锚点完美无缺，而变体把它设成 (\d+) ns/,
      '`numbers` on the two scenes')
    expect(dflt, 'the session default this scene takes').toBe(DEFAULT_UWB_SESSION.syncErrorNs)
    expect(dflt, 'which is what the base scene runs on').toBe(scenarioOf('base').uwb!.syncErrorNs)
    expect(variant, 'and the one the variant sets').toBe(scenarioOf('sync').uwb!.syncErrorNs)
    const [stepBase, stepVariant] = figs(NUMS, /本场景是 (\d+) ns，变体里是 (\d+) ns/,
      'the steps on the same two')
    expect([stepBase, stepVariant], 'the same two, in the steps').toEqual([dflt, variant])
    // 「载入“1 ns 的同步误差”」 — the experiment names the variant by its own label.
    const [tryNs] = figs(TRY, /载入“(\d+) ns 的同步误差”/, '`tryThis` on the variant it loads')
    expect(tryNs, 'the variant that experiment loads').toBe(variant)
    expect(uwbUlTdoa.variants![V_SYNC].label, 'and the label the variant carries')
      .toContain(`${tryNs} ns`)
    // 「然后把它调回 1 ns」, in `deeper`
    const [backTo] = figs(DEEP, /把它调回 (\d+) ns/, '`deeper` on the knob it returns to')
    expect(backTo, 'the same scene the geometry half of that experiment runs on').toBe(variant)
  })

  it('reads the two headings that carry a count of their own', () => {
    const fixes = (v: UwbUlTdoaVariant): number => fixErrM(recs(v)).length
    // 「两个场景，各七个块、各 70 次定位」 — the heading of the comparison table.
    const twoScenes = tablesOf(uwbUlTdoa.numbers!)[1]!
    const [perScene] = figs(twoScenes.heading!, /各 (\d+) 次定位/, 'the comparison table’s heading')
    expect(perScene, 'the fixes one scene of this lesson produces').toBe(fixes('base'))
    expect(perScene, 'in either scene').toBe(fixes('sync'))
    expect(twoScenes.rows, 'and the table has one row per scene').toHaveLength(2)
    // 「70 次里最差」 — a column heading of the sync-error walk, which is the same count.
    const walk = tablesOf(uwbUlTdoa.deeper!)[0]!
    const [perRow] = figs(walk.head.join(' · '), /(\d+) 次里最差/, 'the walk’s own column heading')
    expect(perRow, 'the fixes each row of the walk is measured over').toBe(perScene)
  })

  it('reads the sigma formula as the root it is, and the worked cell that spells it out', () => {
    // 「那个 σ 是 √2·c·√(σ_ts² + sync²)」
    const [root] = figs(NUMS, /那个 σ 是 √(\d+)·c·√\(σ_ts² \+ sync²\)/, '`numbers` on the formula')
    const sigmaFrom = (syncNs: number): number =>
      Math.sqrt(root!) * C_M_PER_NS * Math.hypot(DEFAULT_UWB_SESSION.tsNoisePs / 1000, syncNs)
    for (const [v, syncNs] of [['base', 0], ['sync', 1]] as [UwbUlTdoaVariant, number][]) {
      expect(sigmaFrom(syncNs), `${v}: the sigma that root builds`).toBeCloseTo(ulSigmaM(syncNs), 12)
      // …and it is the figure the table prints for that scene.
      expect(`${(sigmaFrom(syncNs) * 100).toFixed(1)} cm`, `${v}: the cell it has to fill`)
        .toBe(cell(1, syncNs === 0 ? 0 : 1, 1))
    }
    // 「√2·c·√(0.1² + 0²) ns = 4.2 cm」 — the worked table writes the same formula with its values.
    const ts = tablesOf(uwbUlTdoa.numbers!)
    const worked = ts[ts.length - 1]!.rows.find((r) => r[0]!.includes('σ'))![1]!
    const [cellRoot, tsNs, syncNs, answer] = figs(worked,
      /√(\d+)·c·√\(([\d.]+)² \+ (\d+)²\) ns = ([\d.]+) cm/, 'the worked table’s own sigma')
    expect(cellRoot, 'the same root').toBe(root)
    expect(tsNs! * 1000, 'the receive-timestamp noise, in picoseconds')
      .toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(syncNs, 'and this scene’s own calibration residual')
      .toBe(scenarioOf('base').uwb!.syncErrorNs)
    same(String(answer), sigmaFrom(syncNs!) * 100, 'the sigma those three make')
    /*
     * **Exempt, class (c): the 4 of 「都落在它的 4σ 之内」.** Argued in this describe's header.
     * What is read is the claim: both runs stay inside the multiple the sentence names.
     */
    const [mult] = figs(NUMS, /都落在它的 (\d+)σ 之内/, '`numbers` on the bound it claims')
    for (const [v, syncNs] of [['base', 0], ['sync', 1]] as [UwbUlTdoaVariant, number][]) {
      expect(Math.max(...diffErrM(recs(v))), `${v}: every difference`)
        .toBeLessThan(mult! * ulSigmaM(syncNs))
      expect(Math.max(...fixErrM(recs(v))), `${v}: and every fix`)
        .toBeLessThan(mult! * ulSigmaM(syncNs))
    }
  })

  it('reads the four drawn offsets, and the bias they leave on every one of badge 1’s rounds', () => {
    // 「在 1 ns 下，四次抽样得到 +0.14、−0.97、−0.34 与 −0.31 ns」
    const [underNs] = figs(DEEP, /在 (\d+) ns 下，四次抽样得到/, '`deeper` on the scene it draws in')
    expect(underNs, 'the scene those draws belong to').toBe(scenarioOf('sync').uwb!.syncErrorNs)
    const drawn = figs(DEEP,
      /四次抽样得到 ([+−][\d.]+)、([+−][\d.]+)、([+−][\d.]+) 与 ([+−][\d.]+) ns/,
      '`deeper` on the four draws')
    expect(drawn, 'the four anchors’ own residuals, in the order the infrastructure lists them')
      .toEqual(UL_ANCHORS.map((a) => Number(drawnOffsetNs(a.id, underNs!).toFixed(2))))
    // 「badge-1 相对 anchor-2 的时间差短了大约 1.15 ns」
    const bias = diffBiasNs(recs('sync'), 'anchor-2', 'badge-1')
    const [shortBy] = figs(DEEP, /的时间差短了大约 ([\d.]+) ns/, '`deeper` on the bias it leaves')
    same(String(shortBy), -mean(bias), 'the mean of the seven differences')
    // 「它的七次读数是 −1.18、−1.28、−1.16、−1.11、−1.12、−1.18 与 −0.99 ns」
    const [readings] = raw(DEEP, /它的七次读数是 ([−\d.、与 ]+) ns，/, '`deeper` on the seven readings')
    const seven = readings!.split(/、|\s*与\s*/).map(val)
    expect(seven, 'one reading per block, as the run produces them')
      .toEqual(bias.map((v) => Number(v.toFixed(2))))
    expect(seven.length, 'seven of them, which is the blocks of this run').toBe(BLOCKS)
    expect(seven.every((v) => v < 0), 'and not one of them changes sign').toBe(true)
  })

  it('reads badge 1’s own two fixes, and the drift the whole room takes', () => {
    // 「它自己的定位偏了 12.7 cm，而同步完好的那次只偏 2.1 cm」
    const [withSyncErr, clean] = raw(DEEP, /它自己的定位偏了 ([\d.]+) cm，而同步完好的那次只偏 ([\d.]+) cm/,
      '`deeper` on badge 1’s two fixes')
    const errOf = (v: UwbUlTdoaVariant): string =>
      uwbFixRow(viewOf(v).nodes['badge-1']!.uwb!.position!, STRINGS.uwb).error
    expect(`${withSyncErr} cm`, 'the fix the inspector shows in the 1 ns scene').toBe(errOf('sync'))
    expect(`${clean} cm`, 'and the one it shows in the synchronised scene').toBe(errOf('base'))
    // 「十个全都往东挪了 12 到 22 cm」
    const [from, to] = figs(DEEP, /十个全都往东挪了 (\d+) 到 (\d+) cm/, '`deeper` on the drift')
    const dx = BADGES.map((id) => meanOffsetM(recs('sync'), id).dx * 100)
    expect([from, to], 'the least and the most any badge moves')
      .toEqual([Math.min(...dx), Math.max(...dx)].map((v) => Number(v.toFixed(0))))
    expect(dx.every((v) => v > 0), 'and every one of them moves the same way').toBe(true)
  })

  it('reads the geometry experiment, building its scene out of its own sentence', () => {
    // 「把 badge-1 拖到 (9.8, 0.2)，即锚点矩形之外：GDOP 从 0.85 变成 3.43，椭圆从 32 cm 涨到
    //   1.4 m，七次定位里最差的一次到 45.3 cm」
    const [x, y] = figs(DEEP, /拖到 \(([\d.]+), ([\d.]+)\)，即锚点矩形之外/, '`deeper` on where it drags it')
    expect(x! > Math.max(...UL_ANCHORS.map((a) => a.x)) || y! < Math.min(...UL_ANCHORS.map((a) => a.y)),
      'a spot outside the anchor rectangle, as the sentence says').toBe(true)
    const out = runExtra(`moved-${x}-${y}`, () => moved('badge-1', x!, y!))
    const outFix = ofType(out, 'UWB_POSITION').filter((f) => f.of === 'badge-1')
    expect(outFix, 'seven fixes there too').toHaveLength(BLOCKS)
    const [was, now] = figs(DEEP, /GDOP 从 ([\d.]+) 变成 ([\d.]+)/, '`deeper` on the two GDOPs')
    const inside = ofType(recs('sync'), 'UWB_POSITION').filter((f) => f.of === 'badge-1')[0]!
    same(String(was), inside.gdop, 'the GDOP the badge has where it stands')
    same(String(now), outFix[0]!.gdop, 'and the one it has in the corner')
    const [small, big] = figs(DEEP, /椭圆从 (\d+) cm 涨到 ([\d.]+) m/, '`deeper` on the two ellipses')
    expect(small, 'the semi-major axis where it stands, to the nearest centimetre')
      .toBe(Math.round(inside.ellipse.a * 100))
    same(String(big), outFix[0]!.ellipse.a, 'and the one in the corner, in metres')
    const [worst] = figs(DEEP, /七次定位里最差的一次到 ([\d.]+) cm/, '`deeper` on the worst of the seven')
    same(String(worst), Math.max(...fixErrM(out, 'badge-1')) * 100, 'the worst fix that run makes')
  })

  it('reads what a listening round costs the anchors against what ten blinks cost', () => {
    // 「锚点都只花掉块的 0.505 %；而十个闪发的胸牌，七个块里要花掉 12.685 260 ms 的空口时间」
    const air = (rs: TLRecord[]): number =>
      ofType(rs, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    const [listening] = figs(DEEP, /锚点都只花掉块的 ([\d.]+) %/, '`deeper` on the listening round')
    const dl = runExtra('dl-ten', () => uwbDlTdoaScenario('ten'))
    same(String(listening), (100 * air(dl)) / BLOCKS / (200 * MS), 'what one listening round costs')
    const [blinks] = raw(DEEP, /七个块里要花掉 ([\d. ]+) ms 的空口时间/, '`deeper` on the blinks')
    same(blinks!, air(recs('base')) / MS, 'what ten blinking badges cost over the same blocks')
    expect(val(blinks!) / BLOCKS, 'which is ten blinks a block')
      .toBeCloseTo((BADGES.length * uwbPpduNs(UWB_BLINK_BYTES)) / MS, 9)
    expect(val(blinks!) / BLOCKS / (200), 'and it is the larger of the two shares')
      .toBeGreaterThan(listening! / 100)
    /*
     * **Exempt, class (a): the 68 % of 「不是 68 % 置信区间」**, in `deeper` and again in
     * `limits`. It is the statistical convention the sentence warns the reader not to apply, and
     * no confidence interval of any size exists in this engine. What is read is that both
     * printings say the same thing.
     */
    const [deepPct] = figs(DEEP, /而不是 (\d+) % 置信区间/, '`deeper` on the convention it refuses')
    const [limPct] = figs(LIM, /不是「重复测量有 (\d+) % 落在这里」/, '`limits` on the same refusal')
    expect(limPct, 'the same convention, named the same way in both places').toBe(deepPct)
  })

  it('reads `sources` against the comments the schema keeps beside those two fields', () => {
    // 「把胸牌设到的 ±20 ppm 晶振容差，出自 §16.4.9」
    const [ppm] = figs(SRC, /±(\d+) ppm 晶振容差/, '`sources` on the crystal tolerance')
    const [clause] = raw(SRC, /出自 (§[\d.]+)。/, '`sources` on the clause that gives it')
    const [schemaPpm] = figs(SCENARIO_SRC, /in ppm \(standard §[\d.]+ allows ±(\d+)\)/,
      '`scenario.ts` beside its own `ppm` field')
    expect(ppm, 'the tolerance the schema’s own comment names').toBe(schemaPpm)
    expect(SCENARIO_SRC, 'and the clause it cites, where the reader would go looking')
      .toContain(`standard ${clause} allows ±${schemaPpm}`)
    // 「发送它的那个 2 ms 时隙」
    const [slotMs] = figs(SRC, /发送它的那个 (\d+) ms 时隙/, '`sources` on the slot')
    expect(slotMs! * MS, 'the slot this session is scheduled on')
      .toBe(rstuNs(DEFAULT_UWB_SESSION.slotRstu))
    // 「每个接收时间戳上 100 ps 的 1σ 噪声；同步误差默认取 0 ns」
    const [ps, sigmas] = figs(SRC, /每个接收时间戳上 (\d+) ps 的 (\d)σ 噪声/, '`sources` on the noise')
    expect(ps, 'the timestamp noise this session runs on').toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(sigmas, 'and how many sigmas that figure is, as the schema writes it')
      .toBe(figs(SCENARIO_SRC, /(\d)-σ receive-timestamp noise in picoseconds/,
        '`scenario.ts` beside its own `tsNoisePs` field')[0])
    const [dflt] = figs(SRC, /同步误差默认取 (\d+) ns/, '`sources` on the default')
    expect(dflt, 'the default the session really carries').toBe(DEFAULT_UWB_SESSION.syncErrorNs)
  })

  it('reads the four arrival stamps `observe` sends the reader to', () => {
    // 「四个到达时间戳，分别在 181.234、181.237、181.240 与 181.242 µs」
    const stamps = ofType(recs('base'), 'UWB_TS').filter((r) => r.dir === 'rx' && r.t < 2 * MS)
    const printed = figs(OBS, /分别在 ([\d.]+)、([\d.]+)、([\d.]+) 与 ([\d.]+) µs/,
      '`observe` on the four stamps')
    expect(printed, 'the four arrivals of the first blink, in the order they are stamped')
      .toEqual(stamps.map((r) => Number((r.t / 1000).toFixed(3))))
    expect(printed, 'four of them, one per anchor').toHaveLength(UL_ANCHORS.length)
  })

  it('reads both experiments, and drives the walk from the four values `tryThis` prints', () => {
    // 「房间中部那个胸牌的椭圆增大到 32.1 × 16.8 cm」
    const [a, b] = figs(TRY, /椭圆增大到 ([\d.]+) × ([\d.]+) cm/, '`tryThis` on the ellipse')
    expect(`${a} × ${b} cm`, 'the ellipse the inspector shows for that badge')
      .toBe(uwbFixRow(viewOf('sync').nodes['badge-1']!.uwb!.position!, STRINGS.uwb).ellipse)
    // 「七十次定位的平均误差，从 3.2 cm 变成 16.7」
    const [before, after] = figs(TRY, /平均误差，从 ([\d.]+) cm 变成 ([\d.]+)/,
      '`tryThis` on the two means')
    same(String(before), mean(fixErrM(recs('base'))) * 100, 'the mean fix error of the base scene')
    same(String(after), mean(fixErrM(recs('sync'))) * 100, 'and of the 1 ns scene')
    // 「依次走过 0、1、2、4 ns」 — four scenes, and `deeper`'s table is their means.
    const walkNs = figs(TRY, /依次走过 (\d+)、(\d+)、(\d+)、(\d+) ns/, '`tryThis` on the walk')
    const walk = tablesOf(uwbUlTdoa.deeper!)[0]!
    expect(walkNs, 'the same four the walk’s table has rows for')
      .toEqual(walk.rows.map((r, i) => figs(r[0]!, /^(\d+) ns$/, `the walk’s row ${i}`)[0]))
    walkNs.forEach((ns, row) => {
      const run = ns === 0 ? recs('base') : ns === 1 ? recs('sync') : runExtra(`sync${ns}`, () => withSync(ns))
      const errs = fixErrM(run)
      same(raw(walk.rows[row]![1]!, /^([\d.]+) cm$/, `the walk’s mean at ${ns} ns`)[0]!,
        mean(errs) * 100, `the mean that scene produces at ${ns} ns`)
      same(raw(walk.rows[row]![2]!, /^([\d.]+) cm$/, `the walk’s worst at ${ns} ns`)[0]!,
        Math.max(...errs) * 100, `and the worst of its ${errs.length}`)
    })
    expect(walkNs[0], 'the walk starts at the scene’s own default').toBe(DEFAULT_UWB_SESSION.syncErrorNs)
  })
})
