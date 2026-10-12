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
import { uwbPositionScenario } from '../../src/course/uwb/uwb-position'
import { Simulation } from '../../src/engine/simulation'
import { Rng } from '../../src/engine/rng'
import { hashStr } from '../../src/engine/hash'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { fmtRecord } from '../../src/ui/format'
import {
  C_M_PER_NS, RCTU_NS, UWB_PPM_MAX, rstuNs, uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes, uwbPpduNs,
} from '../../src/uwb/phy'
import { counterDiff } from '../../src/uwb/clock'
import { roundPlan } from '../../src/uwb/session'
import { solvePosition, solveTdoa } from '../../src/uwb/position'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { uwbFixRow, uwbTdoaRows } from '../../src/uwb/ui/rows'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { lessonTexts } from '../../src/course/readability'

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


const tablesOf = (blocks: Block[]): Extract<Block, { kind: 'table' }>[] =>
  blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
/** The nth table of `numbers`: who is in the room, the five slots, the correction, the scenes, the log. */
const cell = (table: number, row: number, col: number): string =>
  tablesOf(uwbDlTdoa.numbers!)[table].rows[row][col]
/** The nth table of `deeper`: where badge 1 was dragged to. */
const deepCell = (table: number, row: number, col: number): string =>
  tablesOf(uwbDlTdoa.deeper!)[table].rows[row][col]
const formulas = (): Extract<Block, { kind: 'formula' }>[] =>
  uwbDlTdoa.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')

// The contract every migrated lesson owes, written once in tests/course/kit.ts. The jump
// targets live in the round at 10 ms, so the shape suite shares these tests' long run.
lessonShapeSuite(uwbDlTdoa, { runNs: RUN_NS })

describe('uwb-dl-tdoa · the lesson’s own place in the track', () => {
  it('asks for the geometry lesson and adds four words', () => {
    expect(MODULES[uwbDlTdoa.module].title).toBe('单向测距')
    expect(uwbDlTdoa.id).toBe('uwb-dl-tdoa')
    // uwb-geometry, not uwb-position: the numbers table prints GDOP and an error ellipse and
    // the deeper section compares the two GDOP columns, and those are uwb-geometry's words.
    // uwb-geometry needs uwb-position, so the reader still arrives by way of the fix itself.
    expect(uwbDlTdoa.needs).toEqual(['uwb-geometry'])
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
      expect(i, j.label).toBeGreaterThanOrEqual(0)
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
  })

  it('names the clause it leans on, and only in `sources`', () => {
    // the provenance paragraph that used to open the lesson is now the collapsed section
    const src = uwbDlTdoa.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024 §10.29.1.2.5')
    expect(src).toContain('§16.4.9')
  })

  it('it is read after uwb-contention in the course order', () => {
    expect(MODULES[uwbDlTdoa.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids.indexOf('uwb-contention')).toBeLessThan(ids.indexOf('uwb-dl-tdoa'))
    expect(COURSE_ORDER.indexOf('uwb-contention')).toBeLessThan(COURSE_ORDER.indexOf('uwb-dl-tdoa'))
    // and the lesson its `needs` names really does come before it
    expect(COURSE_ORDER.indexOf('uwb-geometry')).toBeLessThan(COURSE_ORDER.indexOf('uwb-dl-tdoa'))
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
  })

  it('the variants are labelled as the lesson calls them and change one thing each', () => {
    expect(uwbDlTdoa.variants).toHaveLength(2)
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
    const o2 = uwbDlTdoa.observe[1]
    for (const s of ['216.106 µs', '2.197 650 ms', '4.197 647 ms', '6.197 652 ms', '8.201 747 ms']) {
      expect(o2).toContain(s)
    }
    // "The first and the last are the span it times its own clock over."
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
    // and the table beside it says what each responder waited
    expect([cell(2, 0, 1), cell(2, 1, 1), cell(2, 2, 1)]).toEqual(['2 ms', '4 ms', '6 ms'])
    expect([cell(2, 0, 0), cell(2, 1, 0), cell(2, 2, 0)]).toEqual(RESPONDERS)
  })

  it('the printed formula is the rate first and the geometry second', () => {
    expect(formulas()).toHaveLength(1)
    const f = formulas()[0]
    expect(f.text.split('\n')).toHaveLength(2)
    for (const term of ['(rx_F − rx_P)', '(tx_F − tx_P)']) expect(f.text, term).toContain(term)
    // a formula body is arithmetic apart from the names it labels
    expect(f.text.split('\n')).toHaveLength(2)
  })

  it('"Anchor 1 comes out at −19.04 ppm and the three badges at 1.96, 17.65 and 4.08"', () => {
    expect(uwbDlTdoa.scenario().seed).toBe(7)
    expect(drawnPpm(REF).toFixed(2)).toBe('-19.04')
    expect(BADGES.map((id) => drawnPpm(id).toFixed(2))).toEqual(['1.96', '17.65', '4.08'])
    // "21.00, 36.69 and 23.12 ppm away from the reference"
    expect(BADGES.map((id) => (drawnPpm(id) - drawnPpm(REF)).toFixed(2))).toEqual(['21.00', '36.69', '23.12'])
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
    // quiz 2's mechanism, at the solver and not only at the absent record: hand solveTdoa the
    // very same uncorrected differences and it returns nothing, while the corrected block of the
    // same scene solves — the fit is what fails, not the emitter
    const first = ofType(raw, 'UWB_TDOA').filter((r) => r.node === 'badge-2' && r.block === 0)
    const asDeltas = (rows: { peer: string; dtNs: number }[]) => rows.map((r) => ({ id: r.peer, dtNs: r.dtNs }))
    expect(solveTdoa(ANCHOR_POS, REF, asDeltas(first), TAG_Z, 0.26)).toBeNull()
    const corrected = ofType(recs('base'), 'UWB_TDOA').filter((r) => r.node === 'badge-2' && r.block === 0)
    expect(solveTdoa(ANCHOR_POS, REF, asDeltas(corrected), TAG_Z, 0.26)).not.toBeNull()
    // "badge 2's first block reads 65.60, 139.29 and 201.83 ns where the truth is
    //  −8.14, −6.07 and −18.17 ns" — the uncorrected readings themselves, in `deeper`
    expect(first.map((r) => r.dtNs.toFixed(2))).toEqual(['65.60', '139.29', '201.83'])
    expect(first.map((r) => r.trueDtNs.toFixed(2))).toEqual(['-8.14', '-6.07', '-18.17'])
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
  })

  it('"Pin anchor 1 at +20 ppm ... and the run reproduces 0.19, 0.44 and 0.51 m to the centimetre"', () => {
    // a 39 ppm swing: the reference was drawn at −19.04
    expect((20 - drawnPpm(REF)).toFixed(0)).toBe('39')
    const off = runExtra('ref20', () => pinned({ [REF]: 20 }))
    expect(RESPONDERS.map((p) => Math.max(...diffErrM(off, p)).toFixed(2))).toEqual(['0.19', '0.44', '0.51'])
    expect(ofType(off, 'UWB_POSITION')).toHaveLength(BLOCKS * BADGES.length)
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
  })
})

describe('uwb-dl-tdoa · the fix, the geometry and the ellipse', () => {
  const rs = recs('base')

  it('the three-scene table is what seven blocks produce', () => {
    const scenes: [UwbDlTdoaVariant, number, number, string, number][] = [
      ['base', 0, 63, '0.51 m', 21],
      ['raw', 1, 63, '66.29 m', 0],
      ['ten', 2, 210, '0.51 m', 70],
    ]
    for (const [v, row, diffs, worst, fixes] of scenes) {
      const run = recs(v)
      expect(ofType(run, 'UWB_TDOA'), v).toHaveLength(diffs)
      expect(cell(3, row, 1), v).toBe(String(diffs))
      const all = ofType(run, 'UWB_TDOA').map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)
      expect(cell(3, row, 2), v).toBe(`${Math.max(...all).toFixed(2)} m`)
      expect(cell(3, row, 2), v).toBe(worst)
      expect(ofType(run, 'UWB_POSITION'), v).toHaveLength(fixes)
      expect(cell(3, row, 3), v).toBe(String(fixes))
      const errs = fixErrM(run)
      // a scene with no fix says so in the lesson's own words; one with fixes prints the span
      for (const n of errs.length === 0 ? [] : [Math.min(...errs).toFixed(2), Math.max(...errs).toFixed(2)]) {
        expect(cell(3, row, 4), `${v} ${n}`).toContain(n)
      }
      // the two variant rows are named exactly as their variant picker names them, so the table
      // doubles as the lookup for it
      if (v !== 'base') expect(cell(3, row, 0), v).toBe(uwbDlTdoa.variants![row - 1].label)
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
    const fix = uwbFixRow(u.position!, STRINGS.uwb)
    expect(fix).toMatchObject({
      estimate: '(4.20, 3.49) m', truth: '(4.00, 3.50) m', error: '19.6 cm',
      gdop: '0.85', ellipse: '19.8 × 10.3 cm',
    })
    for (const n of ['19.6 cm', '0.85', '19.8 × 10.3 cm']) expect(cell(4, 3, 1), n).toContain(n)
    expect(uwbDlTdoa.observe[2]).toContain(STRINGS.uwb.tdoa)
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
  })

  it('"70 places instead of 21" — one per badge per block', () => {
    const ten = recs('ten')
    expect(ofType(ten, 'UWB_POSITION')).toHaveLength(BLOCKS * 10)
    expect(uwbDlTdoa.tryThis[1]).toContain('70')
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
  })

  it('replays bit-for-bit, in every scene', () => {
    for (const v of ['base', 'raw', 'ten'] as UwbDlTdoaVariant[]) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})

/**
 * The procedure the 2026-09-23 amendment asks for ("mechanism before metaphor"):
 * the steps `solveTdoaFix` takes, in its order, and the worked example that runs
 * them on badge-1's first block against anchor-2. Nothing in the table is
 * transcribed — every row is recomputed here from the run's own records (the
 * five arrivals badge-1 stamped, the instants anchor-1 wrote into its Poll and
 * Final, the reply time and clock offset anchor-2 wrote into its Response) and
 * the answer is checked against the UWB_TDOA record the engine emitted.
 */
describe('uwb-dl-tdoa · the procedure, step by step', () => {
  /** The lesson's steps block of `numbers`. */
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbDlTdoa.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  /** A counter as the worked example prints it: thousands separated by a thin space. */
  const fmt = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')
  /** The worked example's table is the last of `numbers`. */
  const wcell = (row: number, col: number): string => {
    const ts = tablesOf(uwbDlTdoa.numbers!)
    return ts[ts.length - 1].rows[row][col]
  }
  /** Block 0 of the base run, as the badge and the anchors recorded it. */
  const block0 = () => {
    const rs = recs('base')
    const rx = ofType(rs, 'UWB_TS').filter((r) => r.node === 'badge-1' && r.dir === 'rx').slice(0, 5)
    const dl = ofType(rs, 'TX_START').filter((r) => r.frame.uwb?.dl !== undefined).slice(0, 5)
    const poll = dl[0].frame.uwb!.dl!, final = dl[4].frame.uwb!.dl!, resp2 = dl[1].frame.uwb!.dl!
    const rxSpan = counterDiff(rx[4].counter, rx[0].counter)
    const txSpan = counterDiff(final.txCounter, poll.txCounter)
    const rate = rxSpan / txSpan
    const replyTime = counterDiff(resp2.txCounter, resp2.rxCounters[REF])
    const a1 = DL_ANCHORS[0], a2 = DL_ANCHORS[1]
    const tofRctu = Math.hypot(a2.x - a1.x, a2.y - a1.y, 0) / C_M_PER_NS / RCTU_NS
    const scaled = replyTime * (1 - resp2.coffs!)
    const arrivalGap = counterDiff(rx[1].counter, rx[0].counter)
    const leftover = arrivalGap / rate - (tofRctu + scaled)
    return {
      rx, poll, final, resp2, rxSpan, txSpan, rate, replyTime, tofRctu, scaled, arrivalGap, leftover,
      txOffset: tofRctu + scaled,
    }
  }

  it('is a steps block on the main path, not in `deeper`, and runs in the engine’s own order', () => {
    expect(uwbDlTdoa.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbDlTdoa.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    // the order is device.tdoa.ts's: the Poll opens the rate interval, the Responses carry
    // the reply times and the offsets, the Final closes it, the ratio is taken, each
    // responder's transmit offset is subtracted, a difference is emitted, the fix is solved
    // the record the procedure ends on is named in it, by the name the engine emits
    expect(steps().items.join(' | ')).toContain('UWB_TDOA')
    for (const s of steps().items) expect(s.length).toBeGreaterThan(0)
  })

  it('the worked example’s counters are the run’s own, and its ratio is the engine’s rate', () => {
    const b = block0()
    expect(wcell(0, 1)).toBe(`${fmt(b.rx[0].counter)}, ${fmt(b.rx[4].counter)}`)
    expect(wcell(1, 1)).toBe(`${fmt(b.poll.txCounter)}, ${fmt(b.final.txCounter)}`)
    // the ratio is exactly (rxFinal − rxPoll) ÷ (txFinal − txPoll), as solveTdoaFix takes it
    expect(wcell(2, 1)).toBe(`${fmt(b.rxSpan)} ÷ ${fmt(b.txSpan)} = 1.000 021 04`)
    expect(b.rate.toFixed(8)).toBe('1.00002104')
    expect(wcell(3, 1)).toBe(fmt(b.rx[1].counter))
  })

  it('the two subtractions of the worked example are the engine’s two corrections', () => {
    const b = block0()
    // the badge's own crystal, divided out by the ratio
    expect(wcell(4, 1)).toBe(`${fmt(b.arrivalGap)} → ${fmt(Math.round(b.arrivalGap / b.rate))}`)
    // the responder's reply time, put on anchor-1's timebase by its own clock offset
    expect((b.resp2.coffs! * 1e6).toFixed(3)).toBe('2.330')
    expect(wcell(5, 1)).toBe(`${fmt(b.replyTime)} → ${fmt(Math.round(b.scaled))}`)
    // plus the Poll's flight across the surveyed baseline: 9.00 m between anchor-1 and anchor-2
    expect(Math.hypot(DL_ANCHORS[1].x - DL_ANCHORS[0].x, DL_ANCHORS[1].y - DL_ANCHORS[0].y).toFixed(2)).toBe('9.00')
    expect(wcell(6, 1)).toBe(`+${Math.round(b.tofRctu)} = ${fmt(Math.round(b.txOffset))}`)
  })

  it('what is left is the UWB_TDOA record the engine emitted, and the truth beside it', () => {
    const b = block0()
    const td = ofType(recs('base'), 'UWB_TDOA').filter((r) => r.node === 'badge-1' && r.peer === 'anchor-2')[0]
    // the hand-run arithmetic reproduces the record to the picosecond
    expect(b.leftover * RCTU_NS).toBeCloseTo(td.dtNs, 9)
    expect(wcell(7, 1)).toBe(`${b.leftover.toFixed(1)} · ${td.dtNs.toFixed(2)} ns · ${(td.dtNs * C_M_PER_NS).toFixed(2)} m`)
    expect(wcell(8, 1)).toBe(`${td.trueDtNs.toFixed(2)} ns · ${(td.trueDtNs * C_M_PER_NS).toFixed(2)} m`)
    // and it is the line the log prints, to the two digits the lesson quotes
    expect(cell(4, 1, 1)).toContain(`${td.dtNs.toFixed(2)} ns (true ${td.trueDtNs.toFixed(2)} ns)`)
  })
})

// --- every figure the PROSE prints -------------------------------------------------------------

/**
 * **The tables above are read cell by cell; the sentences around them were not.**
 * `scripts/figure-planting.ts` swept this lesson on 2026-10-13: **98 of its 189 printed figures
 * could be edited with the suite green** — the worst first measurement of this programme, and in
 * a file whose assertions are otherwise as tight as any. The reason is visible in the sweep's
 * own list: every one of the 98 is a figure the tables already hold, restated in prose. The
 * ladder of the round is in `numbers`' table AND in the sentence under it; the three drawn
 * crystals are in `deeper`'s paragraph; 「0.19、0.44 与 0.51 m」 appears in a table column, in a
 * `deeper` sentence about pinning the reference, and again in the three-scene table.
 *
 * So the figures below are read where the reader reads them. Nothing here re-measures anything:
 * every assertion compares the prose with the same helper the tests above use, which keeps this
 * block free of new simulation.
 */
describe('uwb-dl-tdoa · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uwbDlTdoa).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const rd = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => rd(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const base = recs('base')
  const SLOT_NS_UWB = rstuNs(DEFAULT_UWB_SESSION.slotRstu)

  it('the round: five slots, who answers in which, and the reply each one waits', () => {
    // 「五个 2 ms 的时隙，每块一次」
    const [slotMs] = figs(EVERYWHERE, /个 ([\d.]+) ms 的时隙/, 'the length of one slot')
    same(String(slotMs), SLOT_NS_UWB / MS, 'the slot this session runs at')
    // 「时隙 0。anchor-1 广播」…「时隙 1 至 3。其余三个依次作答」…「时隙 4。anchor-1 发出」
    const [poll] = figs(EVERYWHERE, /时隙 (\d+)。anchor-1 广播/, 'the slot the Poll goes out in')
    const [from, to] = figs(EVERYWHERE, /时隙 (\d+) 至 (\d+)。其余三个依次作答/,
      'the slots the responders answer in')
    const [final] = figs(EVERYWHERE, /时隙 (\d+)。anchor-1 发出/, 'the slot the Final goes out in')
    expect(poll, 'the reference anchor opens the round').toBe(0)
    expect([from, to], 'the responders take the slots after it').toEqual([poll + 1, RESPONDERS.length])
    expect(final, 'and the Final is the slot after the last of them').toBe(to + 1)
    expect(final + 1, 'which makes the round as many slots as this session plans')
      .toBe(roundPlan(uwbDlTdoaScenario('base').uwb!, DL_ANCHORS.length).slots)
    // the table's own 「1–3」 cell, which is the same range the sentence under it states
    const [cellFrom, cellTo] = figs(cell(1, 1, 0) + ' ' + cell(1, 1, 1) + ' ' + cell(1, 2, 0),
      /(\d+)–(\d+)/, 'the slot range the table prints')
    expect([cellFrom, cellTo], 'the responders answer in those slots').toEqual([from, to])
    // 「它的 1σ 由两项合成：√2·c·σ_ts」 — the sigma and the root, where `numbers` states them
    const [oneSigma, root] = figs(EVERYWHERE, /它的 (\d)σ 由两项合成：√(\d)·c·σ_ts/,
      '`numbers` on how the sigma is built')
    expect([oneSigma, root], 'one sigma, and two differences sharing one reference stamp')
      .toEqual([1, 2])
    // 「它等了，偏差 +2.330 ppm」 and 「再加 9.00 m 基线」: the correction walk-through, cell by cell
    const [offsetPpm] = rd(EVERYWHERE, /它等了，偏差 \+([\d.]+) ppm/,
      'the offset the correction reads')
    // the second DL frame of the run is the first responder's Response, and its own clock-offset
    // IE is what the correction uses — the same frame the worked example above walks through
    const resp2 = ofType(base, 'TX_START')
      .filter((r) => r.frame.uwb?.dl !== undefined)[1].frame.uwb!.dl!
    same(offsetPpm, resp2.coffs! * 1e6, 'the offset that responder reported')
    const [baseline] = rd(EVERYWHERE, /再加 ([\d.]+) m 基线/, 'the baseline the walk adds')
    same(baseline, anchorGapM(REF, RESPONDERS[0]), 'the distance between the two anchors')
    // 「anchor-2/3/4」 — the responders, in the order they answer
    const [a, b, c] = figs(EVERYWHERE, /anchor-(\d)\/(\d)\/(\d)/, 'the three responders')
    expect([a, b, c].map((n) => `anchor-${n}`), 'the responders of this scene').toEqual(RESPONDERS)
    // 「最后一个应答锚点在 Poll 之后整整 6 ms 才作答」 and 「应答时延 2、4、6 ms」
    const [lastMs] = figs(EVERYWHERE, /整整 ([\d.]+) ms 才作答/, 'how long the last one waits')
    same(String(lastMs), (RESPONDERS.length * SLOT_NS_UWB) / MS, 'its reply time')
    const replies = figs(EVERYWHERE, /应答时延 ([\d.]+)、([\d.]+)、([\d.]+) ms/, 'the three reply times')
    expect(replies, 'one slot each, in the order they answer')
      .toEqual(RESPONDERS.map((_p, i) => ((i + 1) * SLOT_NS_UWB) / MS))
  })

  it('the ppm story: the tolerance, the bias it buys, and the residual that is left', () => {
    // 「胸牌的晶振最多可以偏到 20 ppm」 and `sources`' 「±20 ppm 的晶振容差」
    for (const v of everyFig(/最多可以偏到 (\d+) ppm|±(\d+) ppm 的晶振容差/g,
      'the crystal tolerance', 2)) {
      expect(val(v), 'the tolerance this engine draws inside').toBe(UWB_PPM_MAX)
    }
    // 「这么大的偏差乘上这么长的间隔，是 120 ns，折合 36 m」
    const [ns, m] = figs(EVERYWHERE, /是 (\d+) ns，折合 (\d+) m/, 'the bias the tolerance buys')
    const worst = UWB_PPM_MAX * 1e-6 * RESPONDERS.length * SLOT_NS_UWB
    same(String(ns), worst, 'the tolerance times the longest reply')
    same(String(m), worst * C_M_PER_NS, 'and the same thing as a distance')
    // 「0.2 ppm」 at every site, and 「每个时隙 0.12 m」
    for (const v of everyFig(/的 ([\d.]+) ppm——|再加 ([\d.]+) ppm 的白噪声|这个 ([\d.]+) ppm 是模型取值|偏差上 ([\d.]+) ppm 的剩余误差|T_reply,i·([\d.]+) ppm/g,
      'the residual the correction leaves', 4)) {
      expect(val(v), 'the engine’s own clock-offset noise').toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
    }
    const [perSlot] = rd(EVERYWHERE, /每个时隙 ([\d.]+) m/, 'what that residual is worth per slot')
    same(perSlot, slotSigmaM(1), 'one slot of it')
    // 「剩余误差的 3σ」, and the 63 differences and 21 fixes, wherever the lesson counts them
    for (const v of everyFig(/剩余误差的 (\d+)σ/g, 'how many sigmas the column holds', 1)) {
      expect(val(v), 'three of them').toBe(3)
    }
    for (const v of everyFig(/(\d+) 个时间差/g, 'the differences one run produces', 3)) {
      expect(val(v), 'seven blocks of three badges against three responders')
        .toBe(ofType(base, 'UWB_TDOA').length)
    }
    for (const v of everyFig(/修正后，(\d+) 次里最差|依然是 (\d+) 次定位|而不是 (\d+) 个/g,
      'the fixes one run produces', 3)) {
      expect(val(v), 'one per badge per block').toBe(ofType(base, 'UWB_POSITION').length)
    }
    // 「63 个时间差，0 次定位」: the uncorrected scene's own count, which is none
    for (const v of everyFig(/个时间差，(\d+) 次定位/g, 'the fixes the uncorrected scene makes', 1)) {
      expect(val(v), 'no hyperbola holds those differences')
        .toBe(ofType(recs('raw'), 'UWB_POSITION').length)
    }
  })

  it('`deeper`: the four drawn crystals and the three gaps they make', () => {
    const [ref, b1, b2, b3] = rd(EVERYWHERE,
      /anchor-1 抽到 −([\d.]+) ppm，三个胸牌抽到 ([\d.]+)、([\d.]+) 与 ([\d.]+)/,
      '`deeper` on the four crystals the seed drew')
    same(`-${ref}`, drawnPpm(REF), 'the reference anchor’s own crystal')
    BADGES.forEach((id, i) => same([b1, b2, b3][i], drawnPpm(id), `${id}’s crystal`))
    const gaps = rd(EVERYWHERE, /与参考锚点相差 ([\d.]+)、([\d.]+) 与 ([\d.]+) ppm/,
      'the three gaps to the reference')
    BADGES.forEach((id, i) => {
      same(gaps[i], drawnPpm(id) - drawnPpm(REF), `${id}’s gap to the reference`)
    })
    // 「正是这个胸牌与参考晶振之间 36.69 ppm 的差距」 — the same gap, named again
    for (const v of everyFig(/之间 ([\d.]+) ppm 的差距/g, 'the gap the bias column comes from', 1)) {
      same(v, drawnPpm('badge-2') - drawnPpm(REF), 'badge 2’s gap to the reference')
    }
  })

  it('`deeper`: pinning the crystals changes neither the maxima nor the count of fixes', () => {
    for (const v of everyFig(/设为 \+(\d+) ppm——相对原值/g, 'the value the reference is pinned at', 1)) {
      expect(val(v), 'the tolerance itself').toBe(UWB_PPM_MAX)
    }
    const [swing] = figs(EVERYWHERE, /相对原值摆动了 (\d+) ppm/, 'the swing the pin is')
    expect(swing, 'twenty less what the reference was drawn at')
      .toBe(Math.round(UWB_PPM_MAX - drawnPpm(REF)))
    const off = runExtra('ref20', () => pinned({ [REF]: UWB_PPM_MAX }))
    const pinnedMax = rd(EVERYWHERE, /运行结果仍是 ([\d.]+)、([\d.]+) 与 ([\d.]+) m，分毫不差/,
      'the maxima after pinning the reference')
    RESPONDERS.forEach((p, i) => {
      same(pinnedMax[i], Math.max(...diffErrM(off, p)), `${p}: the worst difference`)
    })
    const both = runExtra('both20', () => pinned({
      [REF]: UWB_PPM_MAX, 'badge-1': UWB_PPM_MAX, 'badge-2': -UWB_PPM_MAX, 'badge-3': 0,
    }))
    const [p1, p2, p3] = figs(EVERYWHERE, /再把三个胸牌设为 \+(\d+)、−(\d+) 与 (\d+) ppm/,
      'the three the badges are pinned at')
    expect([p1, p2, p3], 'the tolerance, its negative, and nothing')
      .toEqual([UWB_PPM_MAX, UWB_PPM_MAX, 0])
    const bothMax = rd(EVERYWHERE, /最大值是 ([\d.]+)、([\d.]+) 与 ([\d.]+) m/,
      'the maxima with the badges pinned too')
    RESPONDERS.forEach((p, i) => {
      same(bothMax[i], Math.max(...diffErrM(both, p)), `${p}: the worst difference, pinned`)
    })
    // 「关掉修正时，…65.60、139.29 与 201.83 ns，而真值是 −8.14、−6.07 与 −18.17 ns」
    const first = ofType(recs('raw'), 'UWB_TDOA').filter((r) => r.node === 'badge-2' && r.block === 0)
    const read = rd(EVERYWHERE,
      /([\d.]+)、([\d.]+) 与 ([\d.]+) ns，而真值是 −([\d.]+)、−([\d.]+) 与 −([\d.]+) ns/,
      '`deeper` on the uncorrected readings and the truth beside them')
    first.forEach((r, i) => {
      same(read[i], r.dtNs, `the ${i + 1}th uncorrected reading`)
      same(`-${read[i + 3]}`, r.trueDtNs, `and the truth under it`)
    })
  })

  it('`deeper`: the geometry floor, the ellipse, and the two lessons it compares with', () => {
    // 「锚点正方形中心处它的下限是 √(2/3) = 0.82，而三边定位的下限是 1.00」
    const [num, den, floor, tri] = figs(EVERYWHERE,
      /下限是 √\((\d)\/(\d)\) = ([\d.]+)，而三边定位的下限是 ([\d.]+)/,
      '`deeper` on the two floors')
    same(String(floor), Math.sqrt(num / den), 'the square root the lesson prints')
    /*
     * That floor is the one a SQUARE of anchors has. This room is 10 × 8 m, so its own centre
     * does a little worse — 0.86 against 0.82 — and the lesson is careful to say 「正方形中心处」.
     * What is checkable here is the arithmetic above and this relation: no place in this room
     * beats the square's floor.
     */
    const centre = trueGdopAt(5, 4)
    expect(centre, 'the solver reports a GDOP at the centre of this room').not.toBeNull()
    expect(centre!, 'and this rectangle is a little worse than the square’s floor')
      .toBeGreaterThan(Number(floor))
    expect(tri, 'while trilateration’s own floor is one').toBe(1)
    expect(Number(floor), 'which the hyperbolic floor is below').toBeLessThan(tri)
    // 「0.5 到 3.3 cm；这里则是 11 到 36 cm」: the two spans, and this lesson's is its own fixes
    // 「双向定位误差，保持在 0.5 到 3.3 cm」 and 「而那一课是 1.7 cm」: the two-way scene's own run
    const twr = runExtra('twr', () => uwbPositionScenario())
    const twrErr = fixErrM(twr).map((e) => e * 100)
    const [twrLo, twrHi] = rd(EVERYWHERE, /双向定位误差，保持在 ([\d.]+) 到 ([\d.]+) cm/,
      'the span of the two-way lesson’s fixes')
    same(twrLo, Math.min(...twrErr), 'the best two-way fix, in centimetres')
    same(twrHi, Math.max(...twrErr), 'and the worst')
    same(rd(EVERYWHERE, /而那一课是 ([\d.]+) cm/, 'its semi-major axis')[0],
      ofType(twr, 'UWB_POSITION')[0].ellipse.a * 100, 'the two-way ellipse')
    const [lo, hi] = figs(EVERYWHERE, /这里则是 (\d+) 到 (\d+) cm/, 'the span of this lesson’s fixes')
    // the lesson prints both ends rounded, which is how the three-scene table prints them too
    const errs = fixErrM(base).map((e) => e * 100)
    expect(Math.round(Math.min(...errs)), 'the best fix, in whole centimetres').toBe(lo)
    expect(Math.round(Math.max(...errs)), 'and the worst').toBe(hi)
    // 「长半轴在 18.6 到 23.0 cm 之间」 and 「其中只有 4 cm 来自时间戳噪声」
    const semi = ofType(base, 'UWB_POSITION').map((f) => f.ellipse.a * 100)
    const [sLo, sHi] = rd(EVERYWHERE, /长半轴在 ([\d.]+) 到 ([\d.]+) cm 之间/, 'the semi-major axes')
    same(sLo, Math.min(...semi), 'the smallest semi-major axis')
    same(sHi, Math.max(...semi), 'and the largest')
    const [tsOnly] = figs(EVERYWHERE, /只有 (\d+) cm 来自时间戳噪声/, 'what the timestamp noise alone is')
    const [sqrt2] = figs(EVERYWHERE, /它由 √\(\(√(\d)·c·σ_ts\)²/, 'the two in the formula')
    expect(sqrt2, 'two differences share one reference timestamp').toBe(2)
    expect(Math.round(Math.sqrt(sqrt2) * C_M_PER_NS * (DEFAULT_UWB_SESSION.tsNoisePs / 1000) * 100),
      'which is the timestamp term of that formula, in centimetres').toBe(tsOnly)
    // 「每一次定位都落在 1.6 个长半轴之内」
    /*
     * 「每一次定位都落在 1.6 个长半轴之内」. Read as 「every fix is inside it」 this is an
     * inequality and 1.7 says the same thing, so the figure is read as the TIGHTEST bound of
     * that shape: the worst ratio, rounded up to the decimal the lesson prints.
     */
    const [inside] = rd(EVERYWHERE, /落在 ([\d.]+) 个长半轴之内/, 'how many semi-axes the fixes land in')
    const ratios = ofType(base, 'UWB_POSITION')
      .map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY) / f.ellipse.a)
    for (const r of ratios) expect(r, 'inside that many semi-axes').toBeLessThan(val(inside))
    expect(Math.ceil(Math.max(...ratios) * 10) / 10, 'and no tighter bound of that shape holds')
      .toBe(val(inside))
    // 「而不是 68 % 置信区间」: a figure about what the ellipse is NOT, and the engine has no such
    // interval at all — what is checkable is that the lesson's own bound is not a one-sigma one.
    /*
     * 「而不是 68 % 置信区间」 stays unread, with its argument: 68 % is the mass inside one sigma
     * of a normal distribution, a statistical convention this engine holds nowhere — it draws no
     * confidence interval at all, which is exactly what the sentence is warning the reader about.
     * What IS checkable is the warning: the lesson's own bound is wider than one semi-axis.
     */
    const [conf] = figs(EVERYWHERE, /而不是 (\d+) % 置信区间/, 'the confidence it is not')
    expect(conf, 'the figure a one-sigma ellipse would carry').toBeGreaterThan(50)
    expect(val(inside), 'and the lesson’s own bound is wider than one').toBeGreaterThan(1)
  })

  it('`deeper`: the four places badge 1 was dragged to, and the air the anchors spend', () => {
    // the table's four position cells, against the scenes the lesson says it ran
    /*
     * The four position cells, which the test above does not read — it types the three moved
     * places into its own `cases`. Each cell is read here and the run it names is built from the
     * cell, so the two cannot drift; the GDOP column of the moved rows is pinned there, and the
     * baseline row's is pinned here against the base run's own fix.
     */
    const badge1 = (rs: TLRecord[]) =>
      ofType(rs, 'UWB_POSITION').filter((f) => f.node === 'badge-1')
    expect(tablesOf(uwbDlTdoa.deeper!)[0].rows, 'the table still has its four rows').toHaveLength(4)
    tablesOf(uwbDlTdoa.deeper!)[0].rows.forEach((row, i) => {
      const [px, py] = figs(row[0], /\(([\d.]+), ([\d.]+)\)/, `row ${i}: the place`)
      const run = i === 0 ? base : runExtra(`moved-${px}-${py}`, () => moved('badge-1', px, py))
      const fixes = badge1(run)
      expect(fixes.length, `row ${i}: the badge is fixed in every block`).toBe(BLOCKS)
      same(row[1], fixes[0].gdop, `row ${i}: the GDOP the run reports there`)
      /*
       * Each row's label makes a claim about WHERE that place is, and the claim is what pins the
       * coordinate — the GDOP alone does not, because it moves by less than a hundredth over ten
       * centimetres (the sweep edited (5, 0.5) to (5, 0.6) and the printed 1.06 still held).
       */
      if (i === 0) {
        expect([px, py], 'the baseline is where the scene starts the badge')
          .toEqual([TAG_SPOTS[0].x, TAG_SPOTS[0].y])
      }
      const a = ANCHOR_POS[0]
      const b = ANCHOR_POS[1]
      const alongTo = (x: number, y: number): number =>
        ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
      const offLine = (x: number, y: number): number =>
        Math.abs((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x))
        / Math.hypot(b.x - a.x, b.y - a.y)
      // the error column, measured on the run this cell's own coordinates build
      const errs = fixErrM(run, 'badge-1').map((e) => e * 100)
      const span = row[3].startsWith('worst')
        ? `worst ${Math.max(...errs) >= 100
          ? `${(Math.max(...errs) / 100).toFixed(2)} m` : `${Math.max(...errs).toFixed(0)} cm`}`
        : `${Math.min(...errs).toFixed(0)}–${Math.max(...errs).toFixed(0)} cm`
      expect(span, `row ${i}: the errors that place really produces`).toBe(row[3])
      /*
       * 「anchor-1 与 anchor-2 的连线上」 is exact here, and that is what pins the pair: those two
       * anchors share a y, so a place on their line has that y, and this one is at their midpoint.
       */
      if (row[0].includes('连线上')) {
        expect(py, 'the two anchors share a y, and that place is on it').toBe(a.y)
        expect(px, 'at the midpoint of the two').toBe((a.x + b.x) / 2)
      }
      if (row[0].includes('末端')) {
        expect(alongTo(px, py), 'that place is past the far end of the line').toBeGreaterThan(1)
        expect(offLine(px, py), 'and not far off it').toBeLessThan(0.5)
      }
      /*
       * 「全屋最好的位置」 is a PLATEAU, not a point: on a 0.1 m grid of noise-free differences
       * twenty-five places sit within a thousandth of the floor, and the argmin is (2.9, 4.8)
       * rather than the (3.0, 4.8) the lesson prints. So the pair is not determined by the claim
       * — the claim is that it is on that plateau, and that is what is checked. (The error column
       * above is read for this row too, which is the figure a reader would actually compare.)
       */
      if (row[0].includes('最好的位置')) {
        let floor = Infinity
        for (let ix = 1; ix <= 99; ix++) {
          for (let iy = 1; iy <= 79; iy++) {
            const g = trueGdopAt(ix / 10, iy / 10)
            if (g !== null && g < floor) floor = g
          }
        }
        expect(trueGdopAt(px, py)!, 'and that place is on the room’s own floor')
          .toBeLessThan(floor + 0.001)
      }
    })
    // 「三个场景里锚点都发出 35 帧、7.074 935 ms 的空口时间，占比 0.505 %」
    const [frames, msA, msB, pct] = rd(EVERYWHERE,
      /锚点都发出 (\d+) 帧、([\d.]+) (\d+) ms 的空口时间，占比 ([\d.]+) %/,
      '`deeper` on what the anchors spend')
    const air = ofType(base, 'TX_START').filter((r) => r.node.startsWith('anchor'))
    expect(val(frames), 'the frames the anchors send').toBe(air.length)
    const airNs = air.reduce((n, r) => n + r.frame.txTimeNs, 0)
    same(`${msA}${msB}`, airNs / MS, 'the air they occupy')
    // 「占比 0.505 %」 is ONE round's air inside ONE block, not the whole window's share — the
    // sentence is about what a round costs a block, which is what a listener would budget.
    same(pct, (100 * (airNs / BLOCKS)) / rstuNs(DEFAULT_UWB_SESSION.blockRstu),
      'and the share of a block one round of it is')
    // 「200 ms 的块里装得下十个 20 ms 的轮次…代价是每块 100 帧，而本轮只要 5 帧」
    const [blockMs, roundMs] = figs(EVERYWHERE, /(\d+) ms 的块里装得下十个 (\d+) ms 的轮次/,
      'the block and the two-way round it compares with')
    expect(blockMs / roundMs, 'ten of them in a block').toBe(10)
    const [perBlock, mine] = figs(EVERYWHERE, /代价是每块 (\d+) 帧，而本轮只要 (\d+) 帧/,
      'the frames each costs')
    const twrPlan = roundPlan({ ...uwbDlTdoaScenario('base').uwb!, mode: 'twr' }, DL_ANCHORS.length)
    expect(perBlock, 'one frame a slot, for every round a block holds')
      .toBe(twrPlan.roundsPerBlock * twrPlan.slots)
    expect(twrPlan.roundsPerBlock, 'which is as many rounds as the block fits')
      .toBe(blockMs / roundMs)
    expect(mine, 'and this round is one slot per anchor plus the Final')
      .toBe(roundPlan(uwbDlTdoaScenario('base').uwb!, DL_ANCHORS.length).slots)
  })

  it('`limits` and `sources`: the two model values and the solver’s own floor', () => {
    // 「(this.clock.ppm) × 1e−6 加上一次高斯抽样乘 cfoNoisePpm」
    const [one, six] = figs(EVERYWHERE, /× (\d)e−(\d)/, '`limits` on how the offset is formed')
    expect([one, six], 'parts per million').toEqual([1, 6])
    // 「时间戳的噪声会按 1/√SNR 放大最多十倍」
    const [overRoot] = figs(EVERYWHERE, /按 (\d)\/√SNR 放大/, 'how the timestamp noise scales')
    expect(overRoot, 'one over the root').toBe(1)
    // 「行列式掉到 MIN_DET（1e−9）以下才交出 null」
    const [detOne, detNine] = figs(EVERYWHERE, /MIN_DET（(\d)e−(\d)）/, 'the solver’s own floor')
    expect(detOne * 10 ** -detNine, 'the determinant floor `solveTdoa` uses').toBe(1e-9)
    // 「每个接收时间戳上 100 ps 的 1σ 噪声」
    const [ps, sigma] = figs(EVERYWHERE, /时间戳上 (\d+) ps 的 (\d)σ 噪声/,
      '`sources` on the timestamp noise')
    expect(ps, 'the noise this engine adds to every stamp').toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(sigma, 'as one sigma').toBe(1)
    // 「2 ms 的测距时隙」
    for (const v of everyFig(/([\d.]+) ms 的测距时隙/g, 'the slot `sources` names', 1)) {
      same(v, SLOT_NS_UWB / MS, 'the slot this session runs at')
    }
  })
})
