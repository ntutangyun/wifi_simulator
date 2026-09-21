/**
 * Every empirical claim in "Listen-only positioning", measured against the
 * lesson's own scenario and its two variants. Each assertion quotes the sentence
 * it guards, copied from the shipped string; the frame sizes, the slot length,
 * the session defaults, the crystal tolerance and the difference sigma come from
 * the engine's own exports rather than being re-typed here, and the two-way
 * comparison is a fresh run of `uwb-position`'s scene, never a transcribed
 * result. The crystals the lesson quotes are checked twice over: once by
 * replaying the draw the engine makes, and once from the uncorrected run, which
 * measures the same offsets through the physics.
 *
 * The lesson was rewritten by the readability programme: the quoted log lines
 * and the correction's arithmetic moved into tables of `numbers`, and the
 * geometry, the ellipse and the pinned-crystal reruns into `deeper`. Every pin
 * moved with its sentence; the shape checks every migrated lesson owes are in
 * tests/course/kit.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_Z, DL_ANCHORS, TAG_COUNT, TAG_SPOTS, TAG_Z, uwbDlTdoa, uwbDlTdoaScenario,
  type UwbDlTdoaVariant,
} from '../../src/course/uwb/uwb-dl-tdoa'
import { uwbPosition, uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { Simulation } from '../../src/engine/simulation'
import { Rng } from '../../src/engine/rng'
import { hashStr } from '../../src/engine/hash'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import {
  C_M_PER_NS, UWB_PPM_MAX, rstuNs, uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes, uwbPpduNs,
} from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { solvePosition, solveTdoa } from '../../src/uwb/position'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { uwbFixRow, uwbTdoaRows } from '../../src/uwb/ui/rows'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven blocks, the window `uwb-position` measures over: block 6 starts at 1.200 s and its
 * 10 ms round is long finished by 1.300 s, while block 7 would not start until 1.400 s. */
const RUN_NS = 1300 * MS
const BLOCKS = 7

const REF = DL_ANCHORS[0].id
/** The three responders, in the slots they answer in. */
const RESPONDERS = DL_ANCHORS.slice(1).map((a) => a.id)
const BADGES = ['badge-1', 'badge-2', 'badge-3']
/** Index into `uwbDlTdoa.variants`. */
const V_RAW = 0, V_TEN = 1
const VARIANT_INDEX: Record<UwbDlTdoaVariant, number | undefined> = { base: undefined, raw: V_RAW, ten: V_TEN }

const scenarioOf = (v: UwbDlTdoaVariant): Scenario =>
  v === 'base' ? uwbDlTdoa.scenario() : uwbDlTdoa.variants![VARIANT_INDEX[v]!].scenario()

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (v: UwbDlTdoaVariant): TLRecord[] => runOf(uwbDlTdoa, VARIANT_INDEX[v], RUN_NS)

/** The scenes this file builds for itself — a pinned crystal, a moved badge, the two-way scene. */
const extra = new Map<string, TLRecord[]>()
const runExtra = (key: string, build: () => Scenario): TLRecord[] => {
  if (!extra.has(key)) extra.set(key, [...new Simulation(build()).runUntil(RUN_NS).records])
  return extra.get(key)!
}

const at = (rs: TLRecord[], node: string) =>
  rs.filter((r): r is Extract<TLRecord, { node: string }> => 'node' in r && r.node === node)

/** |measured − true| of every difference against one responder, as a distance. */
const diffErrM = (rs: TLRecord[], peer: string, node?: string): number[] =>
  ofType(rs, 'UWB_TDOA').filter((r) => r.peer === peer && (node === undefined || r.node === node))
    .map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
/** The same, keeping the sign: with the correction off the error is one-sided. */
const diffBiasM = (rs: TLRecord[], peer: string, node: string): number[] =>
  ofType(rs, 'UWB_TDOA').filter((r) => r.peer === peer && r.node === node)
    .map((r) => (r.dtNs - r.trueDtNs) * C_M_PER_NS)
const fixErrM = (rs: TLRecord[], node?: string): number[] =>
  ofType(rs, 'UWB_POSITION').filter((f) => node === undefined || f.node === node)
    .map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * 1-σ of one corrected difference, as a distance: the responder's clock-offset residual is
 * `cfoNoisePpm` of the reply time it corrects, and a responder answering in slot k waited k
 * slots. The lesson's "0.12 m per slot" is this at k = 1.
 */
const slotSigmaM = (slot: number): number =>
  slot * rstuNs(DEFAULT_UWB_SESSION.slotRstu) * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * C_M_PER_NS

/**
 * The crystal the engine draws for a node: one stream per UWB node, forked from the scenario's
 * seed by `hashStr(<id>#uwb)`, whose first draw is the ppm (UwbClock.fromRng). Replayed here so
 * the lesson's quoted values are checked against the draw itself and not only against the run.
 */
const drawnPpm = (id: string, seed = 7): number =>
  (new Rng(seed).fork(hashStr(`${id}#uwb`)).next() * 2 - 1) * UWB_PPM_MAX

/** The scene's anchors as the solver takes them. */
const ANCHOR_POS = DL_ANCHORS.map((a) => ({ id: a.id, x: a.x, y: a.y, z: ANCHOR_Z }))
/**
 * The GDOP the hyperbolic solver reports for a tag standing exactly at (x, y), from noise-free
 * differences: the geometry on its own, with no draw in it. `sigmaRangeM` scales the ellipse and
 * not the GDOP, so the value it is given here does not matter.
 */
const trueGdopAt = (x: number, y: number): number | null => {
  const d = (a: { x: number; y: number; z: number }): number => Math.hypot(x - a.x, y - a.y, TAG_Z - a.z)
  const deltas = ANCHOR_POS.slice(1).map((a) => ({ id: a.id, dtNs: (d(a) - d(ANCHOR_POS[0])) / C_M_PER_NS }))
  const fix = solveTdoa(ANCHOR_POS, REF, deltas, TAG_Z, 0.26)
  return fix === null ? null : fix.gdop
}

/** Distance between two of the scene's anchors, in metres (they share a height). */
const anchorGapM = (a: string, b: string): number => {
  const p = (id: string) => DL_ANCHORS.find((x) => x.id === id)!
  return Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y)
}

/** The base scene with one node's crystal pinned instead of drawn. */
const pinned = (ppm: Record<string, number>): Scenario => {
  const s = uwbDlTdoaScenario('base')
  return {
    ...s,
    nodes: s.nodes.map((n): NodeCfg => (ppm[n.id] === undefined ? n : { ...n, uwb: { ...n.uwb!, ppm: ppm[n.id] } })),
  }
}
/** The base scene with one badge moved, for the geometry experiment. */
const moved = (id: string, x: number, y: number): Scenario => {
  const s = uwbDlTdoaScenario('base')
  return { ...s, nodes: s.nodes.map((n): NodeCfg => (n.id === id ? { ...n, pos: { ...n.pos, x, y } } : n)) }
}

/** Everything a learner reads of one lesson, joined — `deeper` and `sources` included. */
const lessonProse = (l: Lesson): string => lessonStrings(l).map((s) => s.en).join('\n')
const prose = (): string => lessonProse(uwbDlTdoa)

const tablesOf = (blocks: Block[]): Extract<Block, { kind: 'table' }>[] =>
  blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
/** The nth table of `numbers`: who is in the room, the five slots, the correction, the scenes, the log. */
const cell = (table: number, row: number, col: number): string =>
  tablesOf(uwbDlTdoa.numbers!)[table].rows[row][col].en
/** The nth table of `deeper`: where badge 1 was dragged to. */
const deepCell = (table: number, row: number, col: number): string =>
  tablesOf(uwbDlTdoa.deeper!)[table].rows[row][col].en
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbDlTdoa.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')

// The contract every migrated lesson owes, written once in tests/course/kit.ts. The jump
// targets live in the round at 10 ms, so the shape suite shares these tests' long run.
lessonShapeSuite(uwbDlTdoa, { proseMax: 900, runNs: RUN_NS })

describe('uwb-dl-tdoa · the lesson’s own place in the track', () => {
  it('asks for the positioning lesson and adds four words', () => {
    expect(uwbDlTdoa.module).toBe(14)
    expect(uwbDlTdoa.id).toBe('uwb-dl-tdoa')
    expect(uwbDlTdoa.needs).toEqual(['uwb-position'])
    expect(uwbDlTdoa.terms!.map((t) => t.term)).toEqual(['TDoA', 'DL-TDoA', 'hyperbola', 'clock correction'])
  })

  it('it offers six jumps, three things to observe, two experiments and three questions', () => {
    expect(uwbDlTdoa.jumps).toHaveLength(6)
    expect(uwbDlTdoa.observe).toHaveLength(3)
    expect(uwbDlTdoa.tryThis).toHaveLength(2)
    expect(uwbDlTdoa.quiz).toHaveLength(3)
    for (const q of uwbDlTdoa.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx = uwbDlTdoa.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the round and the Poll open the run; the first arrival lands one PPDU later, the Final
    // goes out in slot 4 and the difference and the fix close the round at 10 ms
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(0)
    expect(rs[idx[2]].t).toBe(216_106)
    expect(rs[idx[3]].t).toBe(8 * MS)
    expect(rs[idx[4]].t).toBe(10 * MS)
    expect(rs[idx[5]].t).toBe(10 * MS)
    // the watch call-out sends the reader to the first time difference
    const watch = uwbDlTdoa.picture!.find((b) => b.kind === 'watch') as Extract<Block, { kind: 'watch' }>
    expect(uwbDlTdoa.jumps[watch.jump!].label.en).toBe('the first time difference')
  })

  it('names the clause it leans on, and only in `sources`', () => {
    // the provenance paragraph that used to open the lesson is now the collapsed section
    const src = uwbDlTdoa.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024 §10.29.1.2.5')
    expect(src).toContain('this lesson is the second')
    expect(src).toContain('synchronised nodes transmit')
    expect(src).toContain('The rest is the model')
    expect(src).toContain('the FiRa-style content of the three messages')
    expect(src).toContain('the badge’s clock-rate correction and each responder’s clock-offset correction')
    expect(src).toContain('§16.4.9')
  })

  it('it is the second lesson of module 14, after uwb-contention in the course order', () => {
    expect(MODULES[14]).toEqual({ tier: 5, title: { en: 'Other ranging modes', zh: '其他测距模式' } })
    expect(MODULES[uwbDlTdoa.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-dl-tdoa') - 1]).toBe('uwb-contention')
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-contention') + 1]).toBe('uwb-dl-tdoa')
    // and the lesson its `needs` names really does come before it
    expect(COURSE_ORDER.indexOf('uwb-position')).toBeLessThan(COURSE_ORDER.indexOf('uwb-dl-tdoa'))
  })
})

describe('uwb-dl-tdoa · the scene', () => {
  it('is uwb-position’s four corner anchors at 2.20 m and badges at 1.00 m that never transmit', () => {
    const s = uwbDlTdoa.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(s.nodes.map((n) => n.id)).toEqual([...DL_ANCHORS.map((a) => a.id), ...BADGES])
    for (const a of DL_ANCHORS) {
      const n = s.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb?.role, a.id).toBe('anchor')
    }
    BADGES.forEach((id, i) => {
      const n = s.nodes.find((x) => x.id === id)!
      expect(n.pos, id).toEqual({ x: TAG_SPOTS[i].x, y: TAG_SPOTS[i].y, z: TAG_Z })
      expect(n.uwb?.role, id).toBe('tag')
    })
    // "the corners ... are uwb-position's": the same four points at the same height
    const twr = uwbPositionScenario('base')
    for (const a of DL_ANCHORS) {
      expect(twr.nodes.find((n) => n.id === a.id)!.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
    }
    // the "Who is in the room" table: the room, the corners and the three badges' spots
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(cell(0, 0, 0)).toBe('anchor-1 … anchor-4')
    expect(cell(0, 0, 1)).toBe('4 corners, 10 × 8 m lab, 2.20 m')
    expect(cell(0, 1, 0)).toBe(BADGES.join(', '))
    expect(cell(0, 1, 1)).toBe('(4, 3.5), (7, 6) and (2, 6.5), 1.00 m')
    expect(TAG_SPOTS.slice(0, 3)).toEqual([{ x: 4, y: 3.5 }, { x: 7, y: 6 }, { x: 2, y: 6.5 }])
  })

  it('is a DL-TDoA session on the defaults, NLOS on, and every crystal drawn rather than set', () => {
    for (const v of ['base', 'raw', 'ten'] as UwbDlTdoaVariant[]) {
      expect(() => ScenarioSchema.parse(scenarioOf(v)), v).not.toThrow()
      const u = scenarioOf(v).uwb!
      expect(u.mode, v).toBe('dl-tdoa')
      expect(u.nlos, v).toBe(true)
      expect(u.schedule, v).toBe(DEFAULT_UWB_SESSION.schedule)
      expect(u.method, v).toBe(DEFAULT_UWB_SESSION.method)
      expect(u.slotRstu, v).toBe(DEFAULT_UWB_SESSION.slotRstu)
      expect(u.blockRstu, v).toBe(DEFAULT_UWB_SESSION.blockRstu)
      expect(u.tsNoisePs, v).toBe(DEFAULT_UWB_SESSION.tsNoisePs)
      expect(u.cfoNoisePpm, v).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
      expect(u.tdoaClockCorrection, v).toBe(v !== 'raw')
      for (const n of scenarioOf(v).nodes) expect(n.uwb?.ppm, `${v} ${n.id}`).toBeUndefined()
    }
    // "Nothing here is pinned: every crystal is drawn."
    expect(prose()).toContain('Nothing here is pinned: every crystal is drawn')
  })

  it('the variants are labelled as the lesson calls them and change one thing each', () => {
    expect(uwbDlTdoa.variants).toHaveLength(2)
    expect(uwbDlTdoa.variants![V_RAW].label).toEqual({ en: 'Clock correction off', zh: '关闭时钟修正' })
    expect(uwbDlTdoa.variants![V_TEN].label).toEqual({ en: 'Ten tags', zh: '十个标签' })
    // "clears tdoaClockCorrection and changes nothing else"
    const strip = (s: Scenario) => JSON.stringify({ ...s, uwb: { ...s.uwb!, tdoaClockCorrection: true } })
    expect(strip(scenarioOf('raw'))).toBe(strip(scenarioOf('base')))
    // "adds seven more listeners and changes nothing at all about the round"
    expect(TAG_COUNT).toEqual({ base: 3, raw: 3, ten: 10 })
    const ten = scenarioOf('ten')
    expect(ten.nodes).toHaveLength(DL_ANCHORS.length + 10)
    expect(JSON.stringify(ten.nodes.slice(0, DL_ANCHORS.length + 3)))
      .toBe(JSON.stringify(uwbDlTdoa.scenario().nodes))
    expect(JSON.stringify({ ...ten, nodes: [] })).toBe(JSON.stringify({ ...uwbDlTdoa.scenario(), nodes: [] }))
  })

  it('"Five slots of 2 ms, once a block": one round per block, seven of them in the window', () => {
    const plan = roundPlan(uwbDlTdoaScenario('base').uwb!, DL_ANCHORS.length)
    expect(plan.slots).toBe(DL_ANCHORS.length + 1)
    expect(plan.slotNs).toBe(2 * MS)
    expect(plan.roundNs).toBe(10 * MS)
    expect(plan.roundsPerBlock).toBe(1)
    expect(tablesOf(uwbDlTdoa.numbers!)[1].heading!.en).toBe('Five slots of 2 ms, once a block')
    for (const v of ['base', 'raw', 'ten'] as UwbDlTdoaVariant[]) {
      const rounds = ofType(recs(v), 'UWB_ROUND')
      // one round record per listening badge per block, all at the block boundary
      expect(rounds, v).toHaveLength(BLOCKS * TAG_COUNT[v])
      for (const r of rounds) {
        expect(r.mode, v).toBe('dl-tdoa')
        expect(r.slots, v).toBe(plan.slots)
        expect(r.slotNs, v).toBe(plan.slotNs)
        expect(r.untilNs, v).toBe(r.block * plan.blockNs + plan.roundNs)
      }
    }
  })
})

describe('uwb-dl-tdoa · the round the anchors run', () => {
  const rs = recs('base')

  it('gives every slot to an anchor and a badge none: "not one from a badge"', () => {
    const tx = ofType(rs, 'TX_START')
    expect(tx.filter((r) => r.node.startsWith('badge-'))).toEqual([])
    expect(ofType(recs('ten'), 'TX_START').filter((r) => r.node.startsWith('badge-'))).toEqual([])
    // slot order: Poll, three Responses, Final — anchor i answers in slot i
    expect(tx.filter((r) => r.t < 200 * MS).map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot])).toEqual([
      [REF, 'uwbPoll', 0],
      [RESPONDERS[0], 'uwbResp', 1], [RESPONDERS[1], 'uwbResp', 2], [RESPONDERS[2], 'uwbResp', 3],
      [REF, 'uwbFinal', 4],
    ])
    // two-way ranging never happens in this mode: no distance is ever measured
    expect(ofType(rs, 'UWB_RANGE')).toEqual([])
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
    // "Every transmission in the run belongs to an anchor — thirty-five, and not one from a badge."
    expect(ofType(rs, 'TX_START')).toHaveLength(BLOCKS * 5)
    expect(uwbDlTdoa.observe[0].en).toContain('thirty-five, and not one from a badge')
  })

  it('the table’s frames are the sizes and durations the engine gives them', () => {
    const want: [number, number][] = [
      [uwbDlPollBytes(RESPONDERS.length), 0], [uwbDlRespBytes(), 1], [uwbDlFinalBytes(RESPONDERS.length), 4],
    ]
    expect(want.map(([b]) => b)).toEqual([42, 30, 34])
    expect(want.map(([b]) => (uwbPpduNs(b) / 1000).toFixed(1))).toEqual(['216.1', '197.6', '201.7'])
    expect([cell(1, 0, 2), cell(1, 1, 2), cell(1, 2, 2)])
      .toEqual(['Poll, 42 B, 216.1 µs', 'Response, 30 B, 197.6 µs', 'Final, 34 B, 201.7 µs'])
    const tx = ofType(rs, 'TX_START').filter((r) => r.t < 200 * MS)
    expect(tx.map((r) => r.frame.bytes)).toEqual([42, 30, 30, 30, 34])
  })

  it('each frame carries what the table says it carries, and only that', () => {
    const frame = (kind: string, src: string) =>
      ofType(rs, 'TX_START').find((r) => r.frame.kind === kind && r.frame.src === src)!.frame
    const poll = frame('uwbPoll', REF)
    expect(poll.dst).toBe('*')
    expect(poll.uwb?.dl?.txCounter).toBeGreaterThan(0)
    expect(poll.uwb?.dl?.rxCounters).toEqual({}) // "its transmit counter, and who answers where"
    expect(poll.uwb?.schedule).toEqual(RESPONDERS)
    const resp = frame('uwbResp', RESPONDERS[1])
    expect(resp.dst).toBe('*')
    expect(Object.keys(resp.uwb?.dl?.rxCounters ?? {})).toEqual([REF])
    expect(typeof resp.uwb?.dl?.coffs).toBe('number') // "its clock offset to anchor 1"
    const final = frame('uwbFinal', REF)
    expect(Object.keys(final.uwb?.dl?.rxCounters ?? {})).toEqual(RESPONDERS)
  })

  it('"five arrival stamps" at the instants the second observation quotes', () => {
    const stamps = ofType(at(rs, 'badge-1'), 'UWB_TS').filter((r) => r.t < 200 * MS)
    expect(stamps.map((r) => r.dir)).toEqual(['rx', 'rx', 'rx', 'rx', 'rx'])
    expect(stamps.map((r) => r.t)).toEqual([216_106, 2_197_650, 4_197_647, 6_197_652, 8_201_747])
    expect(stamps.map((r) => r.peer)).toEqual([REF, ...RESPONDERS, REF])
    const o2 = uwbDlTdoa.observe[1].en
    expect(o2).toContain('five arrival stamps')
    for (const s of ['216.106 µs', '2.197 650 ms', '4.197 647 ms', '6.197 652 ms', '8.201 747 ms']) {
      expect(o2).toContain(s)
    }
    // "The first and the last are the span it times its own clock over."
    expect(o2).toContain('The first and the last are its own clock’s span')
    expect(fmtRecord(stamps[0])).toBe('badge-1 RX RMARKER ← anchor-1 poll: counter 1055768250362 (97 % within 0.5 ns)')
  })

  it('the log opens as the first observation says, and the table quotes its lines', () => {
    const round = ofType(rs, 'UWB_ROUND')[0]
    expect(round.t).toBe(0)
    expect(fmtRecord(round)).toBe('badge-1 UWB round 0 of block 0 (DL-TDoA): 5 slots × 2000.0 µs')
    expect(cell(4, 0, 1)).toBe(fmtRecord(round))
    // "a round line for each badge, then their first slots, and only then anchor 1's Poll":
    // everything a learner sees in between, MAC_STATE being the one type the event log filters
    // away. Only the badges open a slot in this mode — an anchor's round is the schedule itself.
    const firstTx = rs.findIndex((r) => r.type === 'TX_START')
    expect(rs.slice(0, firstTx).filter((r) => r.type !== 'MAC_STATE').map((r) => r.type))
      .toEqual(['UWB_ROUND', 'UWB_ROUND', 'UWB_ROUND', 'UWB_SLOT', 'UWB_SLOT', 'UWB_SLOT', 'UWB_TS'])
    expect(ofType(rs, 'UWB_SLOT').every((r) => r.node.startsWith('badge-'))).toBe(true)
    expect(uwbDlTdoa.observe[0].en)
      .toContain('a round line for each badge, then their first slots, and only then anchor 1’s Poll')
    // the difference and the fix of block 0, quoted in the same table
    const first = ofType(rs, 'UWB_TDOA').slice(0, 3)
    expect(first.map((r) => r.t)).toEqual([10 * MS, 10 * MS, 10 * MS])
    expect(cell(4, 1, 1)).toBe('badge-1 TDoA anchor-2 − anchor-1: 5.66 ns (true 5.39 ns)')
    expect(fmtRecord(first[0])).toBe(cell(4, 1, 1))
    const fix = ofType(rs, 'UWB_POSITION')[0]
    expect(cell(4, 2, 1)).toBe(
      'badge-1 position (3.90, 3.74) m, true (4.00, 3.50), error 0.26 m, GDOP 0.84, 4 anchors (DL-TDoA)',
    )
    expect(fmtRecord(fix)).toBe(cell(4, 2, 1))
    // "At the end of the round come three time differences and one place, the truth beside each."
    expect(uwbDlTdoa.observe[2].en).toContain('three time differences and one place, the truth beside each')
  })
})

describe('uwb-dl-tdoa · the clock correction', () => {
  it('"20 ppm ... 6 ms ... is 120 ns, or 36 m", over the round the differences really span', () => {
    const lastReplyNs = RESPONDERS.length * rstuNs(DEFAULT_UWB_SESSION.slotRstu)
    expect(lastReplyNs).toBe(6 * MS)
    expect(UWB_PPM_MAX).toBe(20)
    const ns = lastReplyNs * UWB_PPM_MAX * 1e-6
    expect(ns).toBeCloseTo(120, 6)
    expect((ns * C_M_PER_NS).toFixed(0)).toBe('36')
    expect(prose()).toContain('as far out as 20 ppm, and the last responder answers a whole 6 ms after the Poll')
    expect(prose()).toContain('That much of that long is 120 ns, or 36 m')
    // and the table beside it says what each responder waited
    expect([cell(2, 0, 1), cell(2, 1, 1), cell(2, 2, 1)]).toEqual(['2 ms', '4 ms', '6 ms'])
    expect([cell(2, 0, 0), cell(2, 1, 0), cell(2, 2, 0)]).toEqual(RESPONDERS)
  })

  it('the printed formula is the rate first and the geometry second, in both languages', () => {
    expect(formulas()).toHaveLength(1)
    const f = formulas()[0]
    expect(f.heading!.en).toBe('What a badge computes')
    expect(f.text.en.split('\n')).toHaveLength(2)
    expect(f.text.en.startsWith('r = (rx_F − rx_P)_badge ÷ (tx_F − tx_P)_anchor-1')).toBe(true)
    // a formula body is language-neutral apart from the names it labels
    expect(f.text.zh.split('\n')).toHaveLength(2)
    expect(f.note!.en).toContain('The first line is the rate')
  })

  it('"Anchor 1 comes out at −19.04 ppm and the three badges at 1.96, 17.65 and 4.08"', () => {
    expect(uwbDlTdoa.scenario().seed).toBe(7)
    expect(drawnPpm(REF).toFixed(2)).toBe('-19.04')
    expect(BADGES.map((id) => drawnPpm(id).toFixed(2))).toEqual(['1.96', '17.65', '4.08'])
    // "21.00, 36.69 and 23.12 ppm away from the reference"
    expect(BADGES.map((id) => (drawnPpm(id) - drawnPpm(REF)).toFixed(2))).toEqual(['21.00', '36.69', '23.12'])
    const en = prose()
    expect(en).toContain('Anchor 1 comes out at −19.04 ppm and the three badges at 1.96, 17.65 and 4.08')
    expect(en).toContain('21.00, 36.69 and 23.12 ppm away from the reference')
  })

  it('the Response’s clock-offset IE prints ppm: the responder’s crystal against the reference’s', () => {
    // The engine stores the offset as a fraction and the decoder multiplies by 1e6, so the row a
    // learner opens shows the tens of ppm the round is really correcting, not a rounded 0.00.
    const tx = ofType(recs('base'), 'TX_START')
    for (const id of RESPONDERS) {
      const resp = tx.find((r) => r.frame.kind === 'uwbResp' && r.frame.src === id)!.frame
      const row = uwbFrameFields(resp).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ieCoffs')!
      const printed = Number(/(-?[0-9.]+) ppm/.exec(row.value ?? '')?.[1] ?? NaN)
      // the estimator's own residual is the only thing between the printed number and the draw
      expect(Math.abs(printed - (drawnPpm(id) - drawnPpm(REF))), id).toBeLessThan(0.5)
    }
  })

  it('the uncorrected column is 22.02, 44.04 and 65.81 m — the ppm gap times the reply', () => {
    const raw = recs('raw')
    const bias = RESPONDERS.map((p) => mean(diffBiasM(raw, p, 'badge-2')))
    expect(bias.map((v) => v.toFixed(2))).toEqual(['22.02', '44.04', '65.81'])
    expect([cell(2, 0, 2), cell(2, 1, 2), cell(2, 2, 2)]).toEqual(['22.02 m', '44.04 m', '65.81 m'])
    // "that badge's gap to the reference crystal, 36.69 ppm, times the wait beside it": the
    // predicted bias comes from the draw, independently of the run, and what separates the two is
    // the ordinary clock-offset residual averaged over seven rounds
    const gapPpm = drawnPpm('badge-2') - drawnPpm(REF)
    expect(gapPpm.toFixed(2)).toBe('36.69')
    RESPONDERS.forEach((p, i) => {
      const predicted = (i + 1) * rstuNs(DEFAULT_UWB_SESSION.slotRstu) * gapPpm * 1e-6 * C_M_PER_NS
      expect(Math.abs(bias[i] - predicted), p).toBeLessThan(slotSigmaM(i + 1))
    })
    // every badge's bias is its own gap to the reference, not the responders' crystals
    for (const id of BADGES) {
      const g = drawnPpm(id) - drawnPpm(REF)
      const b = mean(diffBiasM(raw, RESPONDERS[2], id))
      expect(Math.abs(b - 6 * MS * g * 1e-6 * C_M_PER_NS), id).toBeLessThan(0.5)
    }
    expect(prose()).toContain('that badge’s gap to the reference crystal, 36.69 ppm, times the wait beside it')
  })

  it('correction off: "63 differences, 0 fixes" — no hyperbola holds a 65.81 m difference', () => {
    const raw = recs('raw')
    expect(ofType(raw, 'UWB_TDOA')).toHaveLength(BLOCKS * BADGES.length * RESPONDERS.length)
    expect(ofType(raw, 'UWB_TDOA')).toHaveLength(63)
    expect(ofType(raw, 'UWB_POSITION')).toEqual([])
    // "Larger than the gap between its two anchors, a difference lies on no hyperbola"
    expect(anchorGapM(REF, RESPONDERS[2]).toFixed(2)).toBe('11.40')
    expect(anchorGapM(REF, RESPONDERS[0]).toFixed(2)).toBe('9.00')
    expect(anchorGapM(REF, RESPONDERS[1]).toFixed(2)).toBe('7.00')
    expect(65.81).toBeGreaterThan(anchorGapM(REF, RESPONDERS[2]))
    const t1 = uwbDlTdoa.tryThis[0].en
    expect(t1).toContain('63 differences, 0 fixes')
    expect(t1).toContain('Larger than the gap between its two anchors, a difference lies on no hyperbola')
    // quiz 2's mechanism, at the solver and not only at the absent record: hand solveTdoa the
    // very same uncorrected differences and it returns nothing, while the corrected block of the
    // same scene solves — the fit is what fails, not the emitter
    const first = ofType(raw, 'UWB_TDOA').filter((r) => r.node === 'badge-2' && r.block === 0)
    const asDeltas = (rows: { peer: string; dtNs: number }[]) => rows.map((r) => ({ id: r.peer, dtNs: r.dtNs }))
    expect(solveTdoa(ANCHOR_POS, REF, asDeltas(first), TAG_Z, 0.26)).toBeNull()
    const corrected = ofType(recs('base'), 'UWB_TDOA').filter((r) => r.node === 'badge-2' && r.block === 0)
    expect(solveTdoa(ANCHOR_POS, REF, asDeltas(corrected), TAG_Z, 0.26)).not.toBeNull()
    expect(uwbDlTdoa.quiz[1].explain.en).toContain('describes no point at all')
  })

  it('correction on: the worst of 21 is 0.19, 0.44 and 0.51 m, inside 3σ of 0.12 m per slot', () => {
    const rs = recs('base')
    const maxima = RESPONDERS.map((p) => Math.max(...diffErrM(rs, p)))
    expect(maxima.map((v) => v.toFixed(2))).toEqual(['0.19', '0.44', '0.51'])
    expect([cell(2, 0, 3), cell(2, 1, 3), cell(2, 2, 3)]).toEqual(['0.19 m', '0.44 m', '0.51 m'])
    expect(ofType(rs, 'UWB_TDOA')).toHaveLength(63)
    expect(ofType(rs, 'UWB_ROUND')).toHaveLength(BLOCKS * BADGES.length)
    // "0.2 ppm of the reply time it corrects — 0.12 m per slot"
    expect(DEFAULT_UWB_SESSION.cfoNoisePpm).toBe(0.2)
    expect(slotSigmaM(1).toFixed(2)).toBe('0.12')
    expect([cell(2, 0, 4), cell(2, 1, 4), cell(2, 2, 4)]).toEqual(['0.36 m', '0.72 m', '1.08 m'])
    expect([1, 2, 3].map((k) => `${(3 * slotSigmaM(k)).toFixed(2)} m`))
      .toEqual([cell(2, 0, 4), cell(2, 1, 4), cell(2, 2, 4)])
    // "All 63 differences fall inside the last column."
    RESPONDERS.forEach((p, i) => {
      for (const e of diffErrM(rs, p)) expect(e, p).toBeLessThan(3 * slotSigmaM(i + 1))
    })
    // "so the last to answer is the worst": the residual grows with the slot answered in
    expect(maxima[0]).toBeLessThan(maxima[1])
    expect(maxima[1]).toBeLessThan(maxima[2])
    const en = prose()
    expect(en).toContain('0.2 ppm of the reply time it corrects — 0.12 m per slot, so the last to answer is the worst')
    expect(en).toContain('All 63 differences fall inside the last column')
  })

  it('"Pin anchor 1 at +20 ppm ... and the run reproduces 0.19, 0.44 and 0.51 m to the centimetre"', () => {
    // a 39 ppm swing: the reference was drawn at −19.04
    expect((20 - drawnPpm(REF)).toFixed(0)).toBe('39')
    const off = runExtra('ref20', () => pinned({ [REF]: 20 }))
    expect(RESPONDERS.map((p) => Math.max(...diffErrM(off, p)).toFixed(2))).toEqual(['0.19', '0.44', '0.51'])
    expect(ofType(off, 'UWB_POSITION')).toHaveLength(BLOCKS * BADGES.length)
    expect(prose()).toContain('Pin anchor 1 at +20 ppm — a 39 ppm swing — and the run reproduces 0.19, 0.44 and 0.51 m')
  })

  it('"Pin the badges at +20, −20 and 0 ppm too and the maxima are 0.24, 0.46 and 0.54 m"', () => {
    const both = runExtra('both20', () => pinned({
      [REF]: 20, 'badge-1': 20, 'badge-2': -20, 'badge-3': 0,
    }))
    expect(RESPONDERS.map((p) => Math.max(...diffErrM(both, p)).toFixed(2))).toEqual(['0.24', '0.46', '0.54'])
    // "still decimetres, still 21 fixes"
    RESPONDERS.forEach((p, i) => {
      for (const e of diffErrM(both, p)) expect(e, p).toBeLessThan(3 * slotSigmaM(i + 1))
    })
    expect(ofType(both, 'UWB_POSITION')).toHaveLength(21)
    expect(prose()).toContain('the maxima are 0.24, 0.46 and 0.54 m: still decimetres, still 21 fixes')
  })
})

describe('uwb-dl-tdoa · the fix, the geometry and the ellipse', () => {
  const rs = recs('base')

  it('the three-scene table is what seven blocks produce', () => {
    const scenes: [UwbDlTdoaVariant, number, number, string, number, string][] = [
      ['base', 0, 63, '0.51 m', 21, '0.11–0.36 m'],
      ['raw', 1, 63, '66.29 m', 0, 'no fix at all'],
      ['ten', 2, 210, '0.51 m', 70, '0.02–0.37 m'],
    ]
    for (const [v, row, diffs, worst, fixes, err] of scenes) {
      const run = recs(v)
      expect(ofType(run, 'UWB_TDOA'), v).toHaveLength(diffs)
      expect(cell(3, row, 1), v).toBe(String(diffs))
      const all = ofType(run, 'UWB_TDOA').map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
      expect(cell(3, row, 2), v).toBe(`${Math.max(...all).toFixed(2)} m`)
      expect(cell(3, row, 2), v).toBe(worst)
      expect(ofType(run, 'UWB_POSITION'), v).toHaveLength(fixes)
      expect(cell(3, row, 3), v).toBe(String(fixes))
      const errs = fixErrM(run)
      const span = errs.length === 0 ? 'no fix at all' : `${Math.min(...errs).toFixed(2)}–${Math.max(...errs).toFixed(2)} m`
      expect(cell(3, row, 4), v).toBe(span)
      expect(cell(3, row, 4), v).toBe(err)
      // the two variant rows are named exactly as their variant picker names them, so the table
      // doubles as the lookup for it
      if (v !== 'base') expect(cell(3, row, 0), v).toBe(uwbDlTdoa.variants![row - 1].label.en)
    }
  })

  it('"the middle of the room" row: badge 1’s seven fixes land 11 to 26 cm out', () => {
    const mid = fixErrM(rs, 'badge-1')
    expect(mid).toHaveLength(BLOCKS)
    expect([Math.min(...mid), Math.max(...mid)].map((v) => (v * 100).toFixed(0))).toEqual(['11', '26'])
    expect(deepCell(0, 0, 3)).toBe('11–26 cm')
    expect(deepCell(0, 0, 1)).toBe('0.84')
    expect(ofType(rs, 'UWB_POSITION')[0].gdop.toFixed(2)).toBe('0.84')
    // and it really is the middle one: it is the badge nearest the anchors' centroid
    const centre = { x: mean(DL_ANCHORS.map((a) => a.x)), y: mean(DL_ANCHORS.map((a) => a.y)) }
    const fromCentre = TAG_SPOTS.slice(0, 3).map((p) => Math.hypot(p.x - centre.x, p.y - centre.y))
    expect(fromCentre.indexOf(Math.min(...fromCentre))).toBe(0)
    // the table's progression: middle 26 cm, baseline 34 cm, past its end 2.64 m
    expect(Math.max(...mid)).toBeLessThan(0.34)
    const errs = fixErrM(rs)
    expect(errs).toHaveLength(21)
    for (const id of BADGES) expect(fixErrM(rs, id), id).toHaveLength(BLOCKS)
    for (const f of ofType(rs, 'UWB_POSITION')) {
      expect(f.method).toBe('dl-tdoa')
      expect(f.anchors).toEqual([REF, ...RESPONDERS])
    }
  })

  it('"at the centre of a square of anchors its floor is √(2/3) = 0.82 where trilateration’s is 1.00"', () => {
    // a genuine square, tag in the anchors' own plane: the best case both solvers can reach
    const sq = [
      { id: 'a', x: -5, y: -5, z: 1 }, { id: 'b', x: 5, y: -5, z: 1 },
      { id: 'c', x: -5, y: 5, z: 1 }, { id: 'd', x: 5, y: 5, z: 1 },
    ]
    const d = (a: typeof sq[0]): number => Math.hypot(a.x, a.y, a.z - 1)
    const deltas = sq.slice(1).map((a) => ({ id: a.id, dtNs: (d(a) - d(sq[0])) / C_M_PER_NS }))
    const fix = solveTdoa(sq, 'a', deltas, 1, 0.26)!
    expect(fix.gdop).toBeCloseTo(Math.sqrt(2 / 3), 6)
    expect(Math.sqrt(2 / 3).toFixed(2)).toBe('0.82')
    // the other half of the sentence: the same square through the two-way solver
    const twr = solvePosition(sq, sq.map((a) => ({ id: a.id, distM: d(a) })), 1, 0.02)!
    expect(twr.gdop).toBeCloseTo(1, 9)
    expect(prose()).toContain('its floor is √(2/3) = 0.82 where trilateration’s is 1.00')
  })

  it('the two-way fixes of “From four ranges to a point” stayed at 0.5 to 3.3 cm, these at 11 to 36', () => {
    const twr = runExtra('twr', () => uwbPositionScenario('base'))
    const errs = fixErrM(twr)
    expect(errs).toHaveLength(BLOCKS)
    expect([Math.min(...errs), Math.max(...errs)].map((v) => (v * 100).toFixed(1))).toEqual(['0.5', '3.3'])
    expect(ofType(twr, 'UWB_POSITION')[0].method).toBe('twr')
    // "against that lesson's 1.7 cm" of semi-major axis
    expect((ofType(twr, 'UWB_POSITION')[0].ellipse.a * 100).toFixed(1)).toBe('1.7')
    // the lesson is named by its title, which is the title that lesson ships
    expect(uwbPosition.title.en).toBe('From four ranges to a point')
    expect(prose()).toContain('The two-way fixes of “From four ranges to a point”, in this same room')
    expect(prose()).toContain('stayed between 0.5 and 3.3 cm; these run between 11 and 36 cm')
    // an order of magnitude, in the same room with the same anchors
    expect(Math.max(...fixErrM(rs)) / Math.max(...errs)).toBeGreaterThan(10)
  })

  it('"18.6 to 23.0 cm of semi-major axis ... and every fix lands inside 1.6 of those semi-axes"', () => {
    const fixes = ofType(rs, 'UWB_POSITION')
    const a = fixes.map((f) => f.ellipse.a * 100)
    expect([Math.min(...a), Math.max(...a)].map((v) => v.toFixed(1))).toEqual(['18.6', '23.0'])
    expect(deepCell(0, 0, 2)).toBe('18.6–23.0 cm')
    const ratios = fixes.map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY) / f.ellipse.a)
    expect(Math.max(...ratios)).toBeLessThan(1.6)
    // "only 4 cm of it timestamp noise": the term that does not grow with the reply time
    const tsTermM = Math.SQRT2 * C_M_PER_NS * (DEFAULT_UWB_SESSION.tsNoisePs / 1000)
    expect((tsTermM * 100).toFixed(0)).toBe('4')
    // and the whole of it, responder by responder, is what the ellipse is built from
    const sigma = (k: number) => Math.hypot(tsTermM, slotSigmaM(k))
    const rms = Math.sqrt([1, 2, 3].reduce((s, k) => s + sigma(k) ** 2, 0) / 3)
    expect(rms).toBeGreaterThan(Math.min(...a) / 100)
    expect(rms).toBeLessThan(Math.max(...a) / 100 * 1.2)
    expect(prose()).toContain('only 4 cm of it timestamp noise')
    expect(prose()).toContain('every fix lands inside 1.6 of those semi-axes')
  })

  it('the "Badge 1, moved" table: the baseline, past its end, and the room’s best spot', () => {
    const cases: [number, number, string, string, string | null, number][] = [
      [5, 0.5, '1.06', 'worst 34 cm', null, 1],
      [9.8, 0.2, '1.49', 'worst 2.64 m', '35.7 cm', 2],
      [3.0, 4.8, '0.83', '16–24 cm', null, 3],
    ]
    for (const [x, y, gdop, err, ellipse, row] of cases) {
      const run = runExtra(`moved-${x}-${y}`, () => moved('badge-1', x, y))
      const fixes = ofType(run, 'UWB_POSITION').filter((f) => f.node === 'badge-1')
      expect(fixes, `${x},${y}`).toHaveLength(BLOCKS)
      expect(fixes[0].gdop.toFixed(2), `${x},${y}`).toBe(gdop)
      expect(deepCell(0, row, 1), `${x},${y}`).toBe(gdop)
      const errs = fixErrM(run, 'badge-1')
      const printed = err.startsWith('worst')
        ? `worst ${Math.max(...errs) >= 1 ? `${Math.max(...errs).toFixed(2)} m` : `${(Math.max(...errs) * 100).toFixed(0)} cm`}`
        : `${(Math.min(...errs) * 100).toFixed(0)}–${(Math.max(...errs) * 100).toFixed(0)} cm`
      expect(printed, `${x},${y}`).toBe(err)
      expect(deepCell(0, row, 3), `${x},${y}`).toBe(err)
      if (ellipse !== null) {
        expect(`${(fixes[0].ellipse.a * 100).toFixed(1)} cm`, `${x},${y}`).toBe(ellipse)
        expect(deepCell(0, row, 2), `${x},${y}`).toBe(ellipse)
      }
    }
    // and (3.0, 4.8) really is "the room's best spot": on a 0.1 m grid of noise-free differences
    // over the whole room, nowhere does better by more than a thousandth
    let floor = Infinity
    for (let ix = 1; ix <= 99; ix++) {
      for (let iy = 1; iy <= 79; iy++) {
        const g = trueGdopAt(ix / 10, iy / 10)
        if (g !== null && g < floor) floor = g
      }
    }
    expect(trueGdopAt(3.0, 4.8)!).toBeLessThan(floor + 0.001)
    expect(trueGdopAt(3.0, 4.8)!.toFixed(2)).toBe('0.83')
    expect(deepCell(0, 3, 0)).toContain('the room’s best spot')
  })

  it('the inspector shows time differences, not distances, and the table’s last row', () => {
    const vs = initViewState(uwbDlTdoa.scenario())
    for (const r of recs('base')) applyRecord(vs, r)
    const u = vs.nodes['badge-1'].uwb!
    // "the scene draws no rings at all": this is the data reason — a one-way lane holds no ranges
    expect(u.ranges).toEqual({})
    const rows = uwbTdoaRows(u)
    expect(rows.map((r) => r.peer)).toEqual(RESPONDERS)
    expect(rows.map((r) => r.rounds)).toEqual([String(BLOCKS), String(BLOCKS), String(BLOCKS)])
    expect(rows.map((r) => r.error)).toEqual(['-0.51 ns', '0.47 ns', '-1.53 ns'])
    const fix = uwbFixRow(u.position!, STRINGS.en.uwb)
    expect(fix).toEqual({
      estimate: '(4.20, 3.49) m', truth: '(4.00, 3.50) m', error: '19.6 cm',
      gdop: '0.85', ellipse: '19.8 × 10.3 cm', method: 'DL-TDoA',
    })
    expect(cell(4, 3, 1)).toBe('error 19.6 cm, GDOP 0.85, ellipse 19.8 × 10.3 cm, DL-TDoA')
    expect(STRINGS.en.uwb.tdoa).toBe('time differences')
    expect(uwbFixRow(u.position!, STRINGS.zh.uwb).method).toBe('下行到达时间差 (DL-TDoA)')
    expect(uwbDlTdoa.observe[2].en).toContain('its table is headed “time differences”')
  })
})

describe('uwb-dl-tdoa · what ten listeners cost', () => {
  it('"the anchors send 35 frames, 7.074 935 ms of air, 0.505 % of the time"', () => {
    const airNs = (rs: TLRecord[]): number => ofType(rs, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    const base = recs('base')
    const ten = recs('ten')
    expect(ofType(ten, 'TX_START')).toHaveLength(ofType(base, 'TX_START').length)
    expect(ofType(ten, 'TX_START')).toHaveLength(35)
    expect(airNs(ten)).toBe(airNs(base))
    expect(airNs(ten)).toBe(7_074_935)
    // "0.505 % of the time": one round's air in one 200 ms block
    const perRound = airNs(base) / BLOCKS
    expect((perRound / rstuNs(DEFAULT_UWB_SESSION.blockRstu) * 100).toFixed(3)).toBe('0.505')
    // "the frames are identical sender for sender"
    expect(ofType(ten, 'TX_START').map((r) => [r.t, r.node, r.frame.kind, r.frame.bytes]))
      .toEqual(ofType(base, 'TX_START').map((r) => [r.t, r.node, r.frame.kind, r.frame.bytes]))
    expect(prose()).toContain('35 frames, 7.074 935 ms of air, 0.505 % of the time')
    expect(uwbDlTdoa.tryThis[1].en).toContain('off exactly the frames the anchors sent before')
  })

  it('"70 places instead of 21" — one per badge per block', () => {
    const ten = recs('ten')
    expect(ofType(ten, 'UWB_POSITION')).toHaveLength(BLOCKS * 10)
    expect(uwbDlTdoa.tryThis[1].en).toContain('70 places instead of 21')
    for (let i = 1; i <= 10; i++) expect(fixErrM(ten, `badge-${i}`), `badge-${i}`).toHaveLength(BLOCKS)
    // the three badges of the base scene get exactly the run they got before
    for (const id of BADGES) expect(fixErrM(ten, id), id).toEqual(fixErrM(recs('base'), id))
  })

  it('"a 200 ms block holds ten 20 ms rounds, so ten is its ceiling at 100 frames a block"', () => {
    const twr = roundPlan({ ...uwbDlTdoaScenario('base').uwb!, mode: 'twr' }, DL_ANCHORS.length)
    expect(twr.slots).toBe(2 * DL_ANCHORS.length + 2)
    expect(twr.roundNs).toBe(20 * MS)
    expect(twr.roundsPerBlock).toBe(10)
    // one frame per slot: ten rounds of ten slots
    expect(twr.roundsPerBlock * twr.slots).toBe(100)
    const dl = roundPlan(uwbDlTdoaScenario('base').uwb!, DL_ANCHORS.length)
    expect(dl.roundsPerBlock * dl.slots).toBe(5)
    expect(prose()).toContain('a 200 ms block holds ten 20 ms rounds, so ten is its ceiling at 100 frames a block against this round’s five')
  })

  it('replays bit-for-bit, in every scene', () => {
    for (const v of ['base', 'raw', 'ten'] as UwbDlTdoaVariant[]) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})
