/**
 * Every empirical claim in "When the controller does not know who is there",
 * measured against the lesson's own scenario and its two variants. Each
 * assertion quotes the sentence or the table cell it guards, copied from the
 * shipped string; the capture margin, the slot length, the session defaults and
 * the single-sided residual come from the engine's own exports rather than
 * being re-typed here, and the analytic model is computed from the formula the
 * lesson prints, never from a transcribed result. The inspector rows are
 * replayed through the player's own reducer (initViewState + applyRecord).
 *
 * The lesson was rewritten to the zero-to-hero contract, so the clauses that
 * used to open the body now live in `sources`, the thirty-round totals and the
 * per-slot error ramp in `deeper`, and the three windows in tables of
 * `numbers`. Every pin moved with its sentence; `.body!` is gone, and the shape
 * checks are the kit's.
 */
import { describe, it, expect } from 'vitest'
import {
  CONTENTION_ANCHORS, CONTENTION_SLOTS, RING_CENTER, RING_RADIUS_M,
  uwbContention, uwbContentionScenario, type UwbContentionVariant,
} from '../../src/course/uwb/uwb-contention'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { fmtRecord } from '../../src/ui/format'
import { UWB_CAPTURE_DB, UWB_TX_POWER_DBM, rstuNs } from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/**
 * Exactly thirty rounds. One tag means one round per 200 ms block, so block 29
 * starts at 5.800 s and its 34 ms round (the widest variant) is long over by
 * 5.900 s, while block 30 would not start until 6.000 s.
 */
const RUN_NS = 5900 * MS
const ROUNDS = 30

const VARIANTS: UwbContentionVariant[] = ['base', 'slots4', 'slots16']
/** Index into `uwbContention.variants`. */
const V4 = 0, V16 = 1

const TAG = 'uwb-1'
const ANCHOR_IDS = Array.from({ length: CONTENTION_ANCHORS }, (_, i) => `anchor-${i + 1}`)

const scenarioOf = (v: UwbContentionVariant): Scenario =>
  v === 'base' ? uwbContention.scenario() : uwbContention.variants![v === 'slots4' ? V4 : V16].scenario()

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (v: UwbContentionVariant): TLRecord[] =>
  runOf(uwbContention, v === 'base' ? undefined : (v === 'slots4' ? V4 : V16), RUN_NS)

/**
 * The base scene with the schedule swapped back to a roll call: the reference the lesson prices
 * against. **Memoised** — eight `it`s ask for it, and it is the only run in this file that is not
 * already shared through the kit's memo (tests/simCost.ts bounds the suite's simulated work).
 */
let rollCall: TLRecord[] | undefined
function timeScheduled(): TLRecord[] {
  if (rollCall) return rollCall
  const s = uwbContentionScenario('base')
  rollCall = [...new Simulation({ ...s, uwb: { ...s.uwb!, schedule: 'time' } }).runUntil(RUN_NS).records]
  return rollCall
}

const tagRounds = (rs: TLRecord[]) => ofType(rs, 'UWB_ROUND').filter((r) => r.node === TAG)
const tagRanges = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG)
const draws = (rs: TLRecord[]) => ofType(rs, 'UWB_CONTEND').filter((r) => r.slot !== null)
const sitOuts = (rs: TLRecord[]) => ofType(rs, 'UWB_CONTEND').filter((r) => r.slot === null)
const collided = (rs: TLRecord[]) => ofType(rs, 'UWB_CONTEND_COLLISION')

/**
 * Walk the timeline once, tagging every record with the tag's round index and
 * the response slot each anchor drew in it. Everything per-round below reads
 * off this, so no claim depends on a record's position in the array.
 */
interface Round {
  /** Anchor id -> response slot it drew this round (absent when it sat the round out). */
  drew: Map<string, number>
  sat: string[]
  /** Slots in which the tag recorded a collision. */
  collidedSlots: Set<number>
  /** Anchor id -> the slot its range was decoded in. */
  ranged: Map<string, number>
  /** |measured − true| in cm, by anchor. */
  errCm: Map<string, number>
}
function rounds(v: UwbContentionVariant): Round[] {
  const out: Round[] = []
  let slot = -1
  for (const r of recs(v)) {
    if (r.type === 'UWB_ROUND' && r.node === TAG) out.push({ drew: new Map(), sat: [], collidedSlots: new Set(), ranged: new Map(), errCm: new Map() })
    const cur = out[out.length - 1]
    if (cur === undefined) continue
    if (r.type === 'UWB_SLOT' && r.node === TAG) slot = r.slot
    if (r.type === 'UWB_CONTEND') { if (r.slot === null) cur.sat.push(r.node); else cur.drew.set(r.node, r.slot) }
    if (r.type === 'UWB_CONTEND_COLLISION') cur.collidedSlots.add(r.slot)
    if (r.type === 'UWB_RANGE' && r.node === TAG) {
      cur.ranged.set(r.peer, slot)
      cur.errCm.set(r.peer, Math.abs(r.distM - r.trueDistM) * 100)
    }
  }
  return out
}

/** N·(1 − 1/S)^(N−1): the lesson's own formula, never a transcribed result. */
const expectedResponses = (n: number, slots: number): number => n * (1 - 1 / slots) ** (n - 1)
const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
const round2 = (x: number): number => Math.round(x * 100) / 100

const tablesOf = (bs: Block[]): Extract<Block, { kind: 'table' }>[] =>
  bs.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
/** numbers' tables: 0 the three windows, 1 the contenders, 2 round 0's draws, 3 what width costs. */
const table = (n: number) => tablesOf(uwbContention.numbers!)[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
/** Row index of a variant in the tables that list the three windows in 4 · 8 · 16 order. */
const ROW: Record<UwbContentionVariant, number> = { slots4: 0, base: 1, slots16: 2 }

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(uwbContention, { runNs: RUN_NS })

describe('uwb-contention · the lesson’s own place in the track', () => {
  it('opens module 14 and asks only for the coexistence lesson', () => {
    expect(MODULES[uwbContention.module].title).toBe('竞争式测距')
    expect(uwbContention.id).toBe('uwb-contention')
    expect(uwbContention.needs).toEqual(['uwb-coexist'])
    // the four words a contention round is made of
    expect(uwbContention.terms!.map((t) => t.term))
      .toEqual(['response window', 'RCPS', 'RCMA', 'sit-out'])
  })

  it('it offers five jumps, two things to observe, two experiments and two questions', () => {
    expect(uwbContention.jumps).toHaveLength(5)
    expect(uwbContention.observe).toHaveLength(2)
    expect(uwbContention.tryThis).toHaveLength(2)
    expect(uwbContention.quiz).toHaveLength(2)
    for (const q of uwbContention.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const at = uwbContention.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // the poll opens the run; the first draw follows its reception, the first collision is in
    // the same round, the first sit-out is three rounds later and the first fix six rounds later
    expect(rs[at[0]].t).toBe(0)
    expect(rs[at[1]].t).toBe(198_666)
    expect(rs[at[2]].t).toBe(8_187_384)
    expect(rs[at[3]].t).toBe(3 * 200 * MS + 198_666)
    expect(rs[at[4]].t).toBe(1218 * MS)
  })

  it('names the clauses it leans on and owns the defaults and the feedback loop as the model’s', () => {
    const src = uwbContention.sources!.map((s) => s).join('\n')
    for (const id of ['IEEE Std 802.15.4-2024', '§10.32.2', '§10.32.9.5', '§10.32.9.6', '§10.32.1']) {
      expect(src, id).toContain(id)
    }
    // the defaults are the engine's own, not the standard's, and `sources` prints them
    expect(src).toContain(String(DEFAULT_UWB_SESSION.contentionSlots))
    expect(src).toContain(String(DEFAULT_UWB_SESSION.maxAttempts))
  })

  it('it opens its module, after uwb-coexist in the course order', () => {
    expect(MODULES[uwbContention.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids.indexOf('uwb-coexist')).toBeLessThan(ids.indexOf('uwb-contention'))
    expect(COURSE_ORDER.indexOf('uwb-coexist')).toBeLessThan(COURSE_ORDER.indexOf('uwb-contention'))
  })
})

describe('uwb-contention · the scene', () => {
  it('is six anchors every 60° on a 3.5 m ring, at the tag’s own height, so every true range is 3.50 m', () => {
    const s = uwbContention.scenario()
    expect(s.nodes.map((n) => n.id)).toEqual([...ANCHOR_IDS, TAG])
    const tag = s.nodes.find((n) => n.id === TAG)!
    expect(tag.pos).toEqual(RING_CENTER)
    const angles: number[] = []
    for (const id of ANCHOR_IDS) {
      const p = s.nodes.find((n) => n.id === id)!.pos
      expect(p.z, id).toBe(RING_CENTER.z)
      // "every anchor here is 3.50 m from the phone": the 3-D distance, not just the plan view
      expect(Math.hypot(p.x - RING_CENTER.x, p.y - RING_CENTER.y, p.z - RING_CENTER.z), id).toBeCloseTo(RING_RADIUS_M, 6)
      angles.push(Math.round(Math.atan2(p.y - RING_CENTER.y, p.x - RING_CENTER.x) * 180 / Math.PI))
    }
    expect(angles.map((a) => (a + 360) % 360)).toEqual([0, 60, 120, 180, 240, 300])
    // the room holds the ring: oneRoom() is 10 × 8 m
    expect(s.rooms[0].w).toBe(10)
    expect(s.rooms[0].h).toBe(8)
  })

  it('is SS-TWR on a contention schedule, NLOS off, and only contentionSlots differs between the scenes', () => {
    expect(() => ScenarioSchema.parse(uwbContention.scenario())).not.toThrow()
    expect(uwbContention.variants).toHaveLength(2)
    for (const v of VARIANTS) {
      expect(() => ScenarioSchema.parse(scenarioOf(v)), v).not.toThrow()
      const u = scenarioOf(v).uwb!
      expect(u.method, v).toBe('ss')
      expect(u.schedule, v).toBe('contention')
      expect(u.nlos, v).toBe(false)
      expect(u.contentionSlots, v).toBe(CONTENTION_SLOTS[v])
      // everything else is the session default, including the 3-attempt RCMA budget
      expect(u.maxAttempts, v).toBe(DEFAULT_UWB_SESSION.maxAttempts)
      expect(u.slotRstu, v).toBe(DEFAULT_UWB_SESSION.slotRstu)
      expect(u.tsNoisePs, v).toBe(DEFAULT_UWB_SESSION.tsNoisePs)
      expect(u.cfoNoisePpm, v).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
    }
    expect(CONTENTION_SLOTS.base).toBe(DEFAULT_UWB_SESSION.contentionSlots)
    // "the crystals drawn": no node pins a crystal offset, so the engine draws one for each
    for (const n of uwbContention.scenario().nodes) expect(n.uwb?.ppm, n.id).toBeUndefined()
  })

  it('the variants are labelled by their window and change only that', () => {
    const strip = (s: Scenario) => JSON.stringify({ ...s, uwb: { ...s.uwb!, contentionSlots: 0 } })
    expect(strip(scenarioOf('slots4'))).toBe(strip(scenarioOf('base')))
    expect(strip(scenarioOf('slots16'))).toBe(strip(scenarioOf('base')))
  })

  it('the Round column is 1 + S slots of 2 ms, against 14 ms for a roll call of six anchors', () => {
    const slotNs = rstuNs(DEFAULT_UWB_SESSION.slotRstu)
    expect(slotNs).toBe(2 * MS)
    const want: Record<UwbContentionVariant, number> = { slots4: 10, base: 18, slots16: 34 }
    for (const v of VARIANTS) {
      const r = tagRounds(recs(v))[0]
      expect(r.slots, v).toBe(1 + CONTENTION_SLOTS[v])
      expect(r.slotNs, v).toBe(slotNs)
      expect(r.untilNs, v).toBe(want[v] * MS)
      expect(r.method, v).toBe('ss')
      // the table prints the window and the round it makes
      expect(cell(0, ROW[v], 0), v).toBe(String(CONTENTION_SLOTS[v]))
      expect(cell(0, ROW[v], 1), v).toBe(`${want[v]} ms`)
    }
    // the roll call the lesson prices against: one poll slot plus one per anchor
    const t = tagRounds(timeScheduled())[0]
    expect(t.slots).toBe(1 + CONTENTION_ANCHORS)
    expect(t.untilNs).toBe(14 * MS)
    expect(cell(0, 3, 1)).toBe('14 ms')
    // "in a round 4 ms shorter"
    expect((tagRounds(recs('base'))[0].untilNs - t.untilNs) / MS).toBe(4)
  })

  it('every scene runs exactly thirty rounds in the measurement window', () => {
    for (const v of VARIANTS) expect(tagRounds(recs(v)), v).toHaveLength(ROUNDS)
    expect(tagRounds(timeScheduled())).toHaveLength(ROUNDS)
  })
})

describe('uwb-contention · the analytic model', () => {
  it('"N = 6 anchors: S = 4 → 1.42, S = 8 → 3.08, S = 16 → 4.35" follows from the printed formula', () => {
    const formula = uwbContention.numbers!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    expect(CONTENTION_ANCHORS).toBe(6)
    const at = (s: number) => expectedResponses(CONTENTION_ANCHORS, s).toFixed(2)
    expect(at(4)).toBe('1.42')
    expect(at(8)).toBe('3.08')
    expect(at(16)).toBe('4.35')
    expect(formula.text).toContain(`S = 4 → ${at(4)}      S = 8 → ${at(8)}      S = 16 → ${at(16)}`)
    // the table's Formula column quotes the same three numbers
    expect([cell(0, 0, 2), cell(0, 1, 2), cell(0, 2, 2)]).toEqual([at(4), at(8), at(16)])
    // and the roll call's row is the trivial one: six of six, every round
    expect([cell(0, 3, 2), cell(0, 3, 3)]).toEqual(['6.00', '6.00'])
    expect(ofType(timeScheduled(), 'UWB_RANGE').filter((r) => r.node === TAG))
      .toHaveLength(ROUNDS * CONTENTION_ANCHORS)
  })

  it('"Doubling the window from 8 slots to 16 buys 1.27 more responses a round and costs 16 ms"', () => {
    const gain = expectedResponses(CONTENTION_ANCHORS, 16) - expectedResponses(CONTENTION_ANCHORS, 8)
    expect(gain.toFixed(2)).toBe('1.27')
    const longer = tagRounds(recs('slots16'))[0].untilNs - tagRounds(recs('base'))[0].untilNs
    expect(longer).toBe(16 * MS)
  })

  /**
   * Which column the gain came from, pinned 2026-10-04.
   *
   * 1.27 is the difference of the FORMULA column (4.35 - 3.08). The table the
   * reader has just finished reading has a measured column beside it, and the
   * lesson spends a whole table teaching why the two differ -- so by the time
   * the verdict arrives the reader has been trained to read the measured one,
   * where the difference is 1.50 (4.13 - 2.63, and 124 - 79 = 45 over thirty
   * rounds). The sentence used to print 1.27 and name no column, which is an
   * 18 % understatement of the thing it is the sole evidence for: whether 16
   * slots are worth 16 ms. It now gives both and says which is which.
   */
  it('the gain sentence names its column, and both numbers are the simulation’s own', () => {
    expect(tagRanges(recs('base')).length).toBe(79)
    expect(tagRanges(recs('slots16')).length).toBe(124)
    expect(((124 - 79) / ROUNDS).toFixed(2)).toBe('1.50')
    // the same 1.50 read off the two cells the reader actually sees
    expect((Number(cell(0, ROW.slots16, 3)) - Number(cell(0, ROW.base, 3))).toFixed(2)).toBe('1.50')
    const formula = expectedResponses(CONTENTION_ANCHORS, 16) - expectedResponses(CONTENTION_ANCHORS, 8)
    expect(formula.toFixed(2)).toBe('1.27')
    const text = (uwbContention.deeper ?? []).map((b) => ('text' in b ? b.text : '')).join(' / ')
    for (const owed of [
      '实测那一列每轮只多换来 1.50 个应答',
      '2.63 → 4.13', '三十轮 79 → 124 条',
      '公式那一列给的是 1.27', '3.08 → 4.35',
      '每轮多用 16 ms',
    ]) expect(text, owed).toContain(owed)
  })

  it('the table’s measured column, collided slots, sit-outs and fixes are what thirty rounds produce', () => {
    const rows: [UwbContentionVariant, number, number, number][] = [
      // variant, responses, collided slots, sit-outs
      ['slots4', 47, 46, 23],
      ['base', 79, 43, 11],
      ['slots16', 124, 26, 1],
    ]
    const fixes: Record<UwbContentionVariant, number> = { slots4: 7, base: 15, slots16: 27 }
    for (const [v, resp, coll, sat] of rows) {
      const rs = recs(v)
      const row = ROW[v]
      expect(tagRanges(rs).length, v).toBe(resp)
      expect(collided(rs).length, v).toBe(coll)
      expect(sitOuts(rs).length, v).toBe(sat)
      expect(ofType(rs, 'UWB_POSITION').length, v).toBe(fixes[v])
      expect(cell(0, row, 3), v).toBe(round2(resp / ROUNDS).toFixed(2))
      expect(cell(0, row, 4), v).toBe(String(coll))
      expect(cell(0, row, 5), v).toBe(String(sat))
      expect(cell(0, row, 6), v).toBe(`${fixes[v]} / ${ROUNDS}`)
    }
    // "1.57", "2.63" and "4.13" — the measured column, quoted to two decimals
    expect([cell(0, 0, 3), cell(0, 1, 3), cell(0, 2, 3)]).toEqual(['1.57', '2.63', '4.13'])
    // the roll call loses nothing at all
    expect([cell(0, 3, 4), cell(0, 3, 5), cell(0, 3, 6)]).toEqual(['0', '0', `${ROUNDS} / ${ROUNDS}`])
    const ref = timeScheduled()
    expect(ofType(ref, 'UWB_CONTEND')).toHaveLength(0)
    expect(ofType(ref, 'UWB_POSITION')).toHaveLength(ROUNDS)
  })

  it('the contenders column: "5.23 at 4 slots, 5.63 at 8, 5.97 at 16"', () => {
    const want: Record<UwbContentionVariant, string> = { slots4: '5.23', base: '5.63', slots16: '5.97' }
    for (const v of VARIANTS) {
      expect((draws(recs(v)).length / ROUNDS).toFixed(2), v).toBe(want[v])
      expect(cell(1, ROW[v], 1), v).toBe(want[v])
      // a draw or a sit-out for every anchor in every round: nobody ever misses the poll
      expect(draws(recs(v)).length + sitOuts(recs(v)).length, v).toBe(ROUNDS * CONTENTION_ANCHORS)
    }
  })

  it('"Expected with that many" is 1.54, 3.02 and 4.33 a round', () => {
    const want: Record<UwbContentionVariant, string> = { slots4: '1.54', base: '3.02', slots16: '4.33' }
    for (const v of VARIANTS) {
      const s = CONTENTION_SLOTS[v]
      const perRound = rounds(v).map((r) => expectedResponses(r.drew.size, s))
      expect((perRound.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(2), v).toBe(want[v])
      expect(cell(1, ROW[v], 2), v).toBe(want[v])
    }
  })

  it('"lifting the expectation from 1.42 to 1.69" — thinning helps at 4 slots only', () => {
    expect(expectedResponses(6, 4).toFixed(2)).toBe('1.42')
    expect(expectedResponses(4, 4).toFixed(2)).toBe('1.69')
    // and hurts at every wider window, which is the direction the other two rows deviate in
    for (const s of [8, 16]) expect(expectedResponses(4, s), String(s)).toBeLessThan(expectedResponses(6, s))
    // "4 slots comes out above the formula, 8 and 16 below"
    expect(tagRanges(recs('slots4')).length / ROUNDS).toBeGreaterThan(expectedResponses(CONTENTION_ANCHORS, 4))
    expect(tagRanges(recs('base')).length / ROUNDS).toBeLessThan(expectedResponses(CONTENTION_ANCHORS, 8))
    expect(tagRanges(recs('slots16')).length / ROUNDS).toBeLessThan(expectedResponses(CONTENTION_ANCHORS, 16))
  })

  it('"47 against 46.1", "79 against 90.7" and "124 against 129.9", each inside a 4σ binomial envelope', () => {
    const quoted: Record<UwbContentionVariant, [number, string, string]> = {
      // measured total, expectation given the round's real contenders, |z|
      slots4: [47, '46.1', '0.2'], base: [79, '90.7', '1.8'], slots16: [124, '129.9', '1.0'],
    }
    for (const v of VARIANTS) {
      const s = CONTENTION_SLOTS[v]
      const rs = rounds(v)
      const exp = rs.reduce((a, r) => a + expectedResponses(r.drew.size, s), 0)
      const sd = Math.sqrt(rs.reduce((a, r) => {
        const p = (1 - 1 / s) ** (r.drew.size - 1)
        return a + r.drew.size * p * (1 - p)
      }, 0))
      const [measured, expStr, zStr] = quoted[v]
      expect(tagRanges(recs(v)).length, v).toBe(measured)
      expect(exp.toFixed(1), v).toBe(expStr)
      expect((Math.abs(measured - exp) / sd).toFixed(1), v).toBe(zStr)
      expect(cell(1, ROW[v], 3), v).toBe(`${measured} against ${expStr} · ${zStr} σ`)
      // deeper: "All three totals sit inside a 4σ binomial envelope of the printed formula",
      // the formula being the all-six one the lesson prints
      const exp6 = ROUNDS * expectedResponses(CONTENTION_ANCHORS, s)
      const p6 = (1 - 1 / s) ** (CONTENTION_ANCHORS - 1)
      const sd6 = Math.sqrt(ROUNDS * CONTENTION_ANCHORS * p6 * (1 - p6))
      expect(measured, v).toBeGreaterThan(exp6 - 4 * sd6)
      expect(measured, v).toBeLessThan(exp6 + 4 * sd6)
      // "none is the number it printed"
      expect(measured, v).not.toBe(Math.round(exp6))
    }
  })
})

describe('uwb-contention · the draw, the collisions and the sit-outs', () => {
  it('round 0’s six draws are the ones the table prints, and two pairs share a slot', () => {
    const r0 = rounds('base')[0]
    expect([...r0.drew]).toEqual([
      ['anchor-1', 4], ['anchor-2', 7], ['anchor-3', 1], ['anchor-4', 4], ['anchor-5', 8], ['anchor-6', 7],
    ])
    expect(r0.sat).toEqual([])
    // the "Round 0: six draws, two ranges" table, anchor by anchor
    for (const [i, [id, slot]] of [...r0.drew].entries()) {
      expect(cell(2, i, 0), id).toBe(id)
      expect(cell(2, i, 1), id).toBe(`slot ${slot}`)
    }
    // "Two pairs picked the same slot", and the two that were heard are the two the table
    // marks "ranged"
    expect([...r0.collidedSlots].sort((a, b) => a - b)).toEqual([4, 7])
    expect([...r0.ranged.keys()].sort()).toEqual(['anchor-3', 'anchor-5'])
    // every draw is inside the advertised window, in every round of every scene
    for (const v of VARIANTS) {
      for (const r of rounds(v)) for (const [id, s] of r.drew) {
        expect(s, `${v} ${id}`).toBeGreaterThanOrEqual(1)
        expect(s, `${v} ${id}`).toBeLessThanOrEqual(CONTENTION_SLOTS[v])
      }
    }
  })

  it('observe 1’s log line is the one fmtRecord prints, all six at 198.666 µs and all attempt 1', () => {
    const first = ofType(recs('base'), 'UWB_CONTEND').slice(0, CONTENTION_ANCHORS)
    expect(first.map((r) => r.t)).toEqual(new Array(CONTENTION_ANCHORS).fill(198_666))
    expect(first.map((r) => r.attempt)).toEqual(new Array(CONTENTION_ANCHORS).fill(1))
    expect(fmtRecord(first[0])).toBe('anchor-1 contends: slot 4 (attempt 1)')
  })

  it('"not one range was decoded in a slot that also recorded a collision" — no capture at equal distances', () => {
    let captured = 0
    for (const v of VARIANTS) for (const r of rounds(v)) {
      for (const slot of r.ranged.values()) if (r.collidedSlots.has(slot)) captured++
    }
    expect(captured).toBe(0)
    // "Across the ninety rounds of the three scenes"
    expect(VARIANTS.length * ROUNDS).toBe(90)
    // and the reason: six equal ranges cannot clear the medium's capture margin
    expect(UWB_CAPTURE_DB).toBe(6)
    const s = uwbContention.scenario()
    // "transmits at the same −14 dBm"
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(new Set(s.nodes.filter((n) => n.kind === 'uwb').map((n) => n.txPowerDbm)))
      .toEqual(new Set([UWB_TX_POWER_DBM]))
    const d = s.nodes.filter((n) => n.id !== TAG)
      .map((n) => Math.hypot(n.pos.x - RING_CENTER.x, n.pos.y - RING_CENTER.y, n.pos.z - RING_CENTER.z))
    const spreadDb = 20 * Math.log10(Math.max(...d) / Math.min(...d))
    expect(spreadDb).toBeLessThan(0.001)
  })

  it('the tag’s "slots collided" row is a per-slot count, and the first is slot 4 at 8.187 ms', () => {
    const first = collided(recs('base'))[0]
    expect(first.node).toBe(TAG)
    expect(first.slot).toBe(4)
    expect(first.t).toBe(8_187_384)
    expect(fmtRecord(first)).toBe('uwb-1 contention collision in slot 4')
    // one record per slot, not one per answer lost: round 0 doomed four answers in two slots
    expect(rounds('base')[0].collidedSlots.size).toBe(2)
    expect(collided(recs('base')).filter((r) => r.t < 200 * MS)).toHaveLength(2)
    // the inspector row the observe item quotes, through the player's own reducer
    const vs = initViewState(uwbContention.scenario())
    for (const r of recs('base')) applyRecord(vs, r)
    expect(vs.nodes[TAG].uwb!.contendCollisions).toBe(43)
    expect(cell(0, ROW.base, 4)).toBe('43')
    // the two editor labels tryThis[1] quotes, so a rename cannot leave the lesson naming a
    // caption that no longer exists
    for (const label of [STRINGS.editor.uwbContentionSlots, STRINGS.editor.uwbMaxAttempts]) {
      expect(uwbContention.tryThis[1], label).toContain(label)
    }
  })

  it('no timeout record is emitted in any of the three scenes', () => {
    for (const v of VARIANTS) expect(ofType(recs(v), 'UWB_TIMEOUT'), v).toHaveLength(0)
  })

  it('"anchor-2 draws in three rounds running, is never heard, and in the fourth sits out"', () => {
    const rs = rounds('base')
    const attemptsOf = (id: string) => ofType(recs('base'), 'UWB_CONTEND').filter((r) => r.node === id)
    expect(attemptsOf('anchor-2').slice(0, 4).map((r) => (r.slot === null ? 'out' : r.attempt))).toEqual([1, 2, 3, 'out'])
    for (const i of [0, 1, 2]) expect(rs[i].sat, `round ${i}`).toEqual([])
    expect(rs[3].sat).toEqual(['anchor-2'])
    // it was heard in none of those three rounds, which is what spent the budget
    for (const i of [0, 1, 2]) expect(rs[i].ranged.has('anchor-2'), `round ${i}`).toBe(false)
    const firstOut = sitOuts(recs('base'))[0]
    expect(firstOut.node).toBe('anchor-2')
    expect(firstOut.attempt).toBe(0)
    expect(fmtRecord(firstOut)).toBe('anchor-2 sits out this round')
    // the inspector row observe 2 quotes
    const vs = initViewState(uwbContention.scenario())
    for (const r of recs('base')) { applyRecord(vs, r); if (r === firstOut) break }
  })
})

describe('uwb-contention · what it costs', () => {
  it('"3.0 cm for every millisecond the answer waits, so 6.0 cm a slot"', () => {
    // the surviving term of a single-sided range, ½·Treply·σcfo, in centimetres
    const slotMs = rstuNs(DEFAULT_UWB_SESSION.slotRstu) / 1e6
    const perSlotCm = 0.5 * slotMs * 1e-3 * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * 299_792_458 * 100
    expect(perSlotCm.toFixed(1)).toBe('6.0')
    expect((perSlotCm / slotMs).toFixed(1)).toBe('3.0')
    // the base run's per-slot RMS, quoted in `deeper`
    const bySlot = new Map<number, number[]>()
    for (const r of rounds('base')) for (const [id, slot] of r.ranged) {
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), r.errCm.get(id)!])
    }
    const ramp = Array.from({ length: CONTENTION_SLOTS.base }, (_, i) => rms(bySlot.get(i + 1)!).toFixed(1))
    expect(ramp).toEqual(['7.3', '14.9', '16.2', '23.5', '28.2', '32.0', '22.8', '47.1'])
  })

  it('the average wait column is (S + 1)/2 slots, and the runs’ own draws agree', () => {
    const meanDrawn = (v: UwbContentionVariant): number => {
      const drawn = rounds(v).flatMap((r) => [...r.drew.values()])
      return drawn.reduce((a, b) => a + b, 0) / drawn.length
    }
    for (const v of VARIANTS) {
      expect(meanDrawn(v), v).toBeCloseTo((CONTENTION_SLOTS[v] + 1) / 2, 0)
      expect(cell(3, ROW[v], 1), v).toBe(`${(CONTENTION_SLOTS[v] + 1) / 2} slots`)
    }
    // try-this 1: "waits eight and a half slots instead of four and a half"
    expect((CONTENTION_SLOTS.slots16 + 1) / 2).toBe(8.5)
    expect((CONTENTION_SLOTS.base + 1) / 2).toBe(4.5)
  })

  it('"14.6 cm at 4 slots, 26.8 at 8 and 51.4 at 16 — against 20.4 cm" for the roll call', () => {
    const errsOf = (v: UwbContentionVariant) => rounds(v).flatMap((r) => [...r.errCm.values()])
    const want: Record<UwbContentionVariant, string> = { slots4: '14.6', base: '26.8', slots16: '51.4' }
    for (const v of VARIANTS) {
      expect(rms(errsOf(v)).toFixed(1), v).toBe(want[v])
      expect(cell(3, ROW[v], 2), v).toBe(`${want[v]} cm`)
    }
    const ref = ofType(timeScheduled(), 'UWB_RANGE').filter((r) => r.node === TAG)
    expect(rms(ref.map((r) => Math.abs(r.distM - r.trueDistM) * 100)).toFixed(1)).toBe('20.4')
    expect(cell(3, 3, 2)).toBe('20.4 cm')
    // "three and a half times worse": 51.4 / 14.6 = 3.52
    expect(rms(errsOf('slots16')) / rms(errsOf('slots4'))).toBeCloseTo(3.5, 1)
    // "a 4-slot window never gets past slot 4", while a roll call of six must reach slot 6
    expect(Math.max(...rounds('slots4').flatMap((r) => [...r.drew.values()]))).toBe(4)
    expect(tagRounds(timeScheduled())[0].slots - 1).toBe(6)
  })

  it('"79 of a possible 180 responses and 15 fixes … the first not until block 6 at 1.218 s"', () => {
    const fixes = ofType(recs('base'), 'UWB_POSITION')
    expect(tagRanges(recs('base'))).toHaveLength(79)
    expect(ROUNDS * CONTENTION_ANCHORS).toBe(180)
    expect(fixes).toHaveLength(15)
    expect(fixes[0].block).toBe(6)
    expect(fixes[0].t).toBe(1218 * MS)
    // "six of those fifteen on only three anchors"
    expect(fixes.filter((f) => f.anchors.length === 3)).toHaveLength(6)
    // and the roll-call reference: 180 of 180 responses, 30 of 30 fixes
    const ref = timeScheduled()
    expect(ofType(ref, 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(ROUNDS * CONTENTION_ANCHORS)
    expect(ofType(ref, 'UWB_POSITION')).toHaveLength(ROUNDS)
  })

  it('the 4-slot scene’s seven fixes are all three-anchor fixes', () => {
    const fixes = ofType(recs('slots4'), 'UWB_POSITION')
    expect(fixes).toHaveLength(7)
    expect(new Set(fixes.map((f) => f.anchors.length))).toEqual(new Set([3]))
  })
})

/**
 * The 2026-09-23 amendment ("mechanism before metaphor"): the contention rule is
 * written out as a procedure, graded against `UwbDevice.drawContentionSlot` and the
 * round-boundary feedback — reached through the records they emit — rather than
 * against the old prose. The worked example is anchor-2's first four rounds of the
 * base run, which is where the attempt budget runs out and a sit-out follows.
 */
describe('uwb-contention · the procedure, against the device', () => {
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbContention.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  const stepsText = (): string => steps().items.map((i) => i).join('\n')
  const SLOTS = CONTENTION_SLOTS.base
  const ATTEMPTS = DEFAULT_UWB_SESSION.maxAttempts
  /** Every UWB_CONTEND of one anchor in the base run, in time order. */
  const contendsOf = (id: string) => ofType(recs('base'), 'UWB_CONTEND').filter((r) => r.node === id)

  it('is a steps block on the main path, not in `deeper`', () => {
    expect(uwbContention.numbers!.some((b) => b.kind === 'steps')).toBe(true)
    expect((uwbContention.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
  })

  it('step 1: the two figures the poll advertises are the session’s own', () => {
    // "the window holds 8 response slots, and a responder may make 3 tries"
    expect(SLOTS).toBe(8)
    expect(ATTEMPTS).toBe(3)
    expect(uwbContentionScenario('base').uwb!.contentionSlots).toBe(SLOTS)
    expect(uwbContentionScenario('base').uwb!.maxAttempts).toBe(ATTEMPTS)
    // poll and responder cannot disagree: no attempt number in the whole run exceeds the budget
    for (const r of ofType(recs('base'), 'UWB_CONTEND')) expect(r.attempt).toBeLessThanOrEqual(ATTEMPTS)
  })

  it('steps 3 and 4: the draw is uniform over the window, and the poll’s own slot is never drawn', () => {
    // "one plus a uniform integer below S": every value of 1…S occurs and 0 never does
    const drawn = draws(recs('base')).map((r) => r.slot!)
    expect(Math.min(...drawn)).toBe(1)
    expect(Math.max(...drawn)).toBe(SLOTS)
    expect(new Set(drawn).size).toBe(SLOTS)
    expect(drawn).not.toContain(0)
    // and over three windows the bound follows the window, not the anchor count
    for (const v of VARIANTS) {
      const d = draws(recs(v)).map((r) => r.slot!)
      expect(Math.max(...d)).toBe(CONTENTION_SLOTS[v])
    }
  })

  it('step 5: an empty response slot writes no timeout, in any of the three scenes', () => {
    for (const v of VARIANTS) {
      // most slots of every window are empty, and still not one timeout is emitted
      const empty = rounds(v).reduce((a, r) => a + CONTENTION_SLOTS[v] - new Set(r.drew.values()).size, 0)
      expect(empty).toBeGreaterThan(0)
      expect(ofType(recs(v), 'UWB_TIMEOUT')).toHaveLength(0)
    }
  })

  it('step 6: no answer can capture another here, and a collision is recorded once per slot', () => {
    expect(stepsText()).toContain('6 dB')
    expect(UWB_CAPTURE_DB).toBe(6)
    // every anchor is the same distance from the tag at the same power, so no pair can lead by 6 dB
    for (const n of uwbContentionScenario('base').nodes) expect(n.txPowerDbm).toBe(UWB_TX_POWER_DBM)
    for (const id of ANCHOR_IDS) {
      const a = uwbContentionScenario('base').nodes.find((n) => n.id === id)!
      expect(Math.hypot(a.pos.x - RING_CENTER.x, a.pos.y - RING_CENTER.y, a.pos.z - RING_CENTER.z))
        .toBeCloseTo(RING_RADIUS_M, 6)
    }
    // one record per shared slot, not one per answer lost in it, and nothing decodes there
    for (const r of rounds('base')) {
      const shared = new Set<number>()
      const seen = new Map<number, number>()
      for (const s of r.drew.values()) { seen.set(s, (seen.get(s) ?? 0) + 1) }
      for (const [s, n] of seen) if (n > 1) shared.add(s)
      expect([...r.collidedSlots].sort()).toEqual([...shared].sort())
      for (const s of shared) expect([...r.ranged.values()]).not.toContain(s)
    }
  })

  it('step 7: the budget is spent and refilled at the round boundary, with nothing on the air', () => {
    const rs = rounds('base')
    const by = contendsOf('anchor-2')
    // the worked example, round by round: the table's own cells
    // each cell carries that round's drawn slot and attempt number, in the lesson's own words
    for (const i of [0, 1, 2]) {
      expect(cell(4, i, 1), `row ${i}`).toContain(String(by[i].slot))
      expect(cell(4, i, 1), `row ${i}`).toContain(String(by[i].attempt))
    }
    expect(cell(4, 3, 1)).toContain(String(by[3].attempt))
    expect(by[3].slot).toBeNull()
    expect(by[3].attempt).toBe(0)
    // three rounds of not being heard, then the sit-out, then a full budget again
    for (const i of [0, 1, 2]) expect(rs[i].ranged.has('anchor-2')).toBe(false)
    expect(by.slice(0, 3).map((r) => r.attempt)).toEqual([1, 2, 3])
    expect(rs[3].sat).toContain('anchor-2')
    expect(by[4].attempt).toBe(1)
    // the loop really is closed at the boundary: an anchor that WAS ranged starts at attempt 1 again
    const heardAgain = ANCHOR_IDS.filter((id) => rs[0].ranged.has(id))
    expect(heardAgain.length).toBeGreaterThan(0)
    for (const id of heardAgain) expect(contendsOf(id)[1].attempt).toBe(1)
    // and nothing is transmitted to say so: the only frames in a round are the poll and answers
    const kinds = new Set(ofType(recs('base'), 'TX_START').map((r) => r.frame.kind))
    expect([...kinds].sort()).toEqual(['uwbPoll', 'uwbResp'])
  })

  it('step 8: the drawn slot is the reply time, at 2 ms a slot and 6.0 cm of error per slot', () => {
    expect(rstuNs(DEFAULT_UWB_SESSION.slotRstu) / MS).toBe(2)
    // the error really does climb with the slot the answer was decoded in
    const bySlot = new Map<number, number[]>()
    for (const r of rounds('base')) {
      for (const [id, s] of r.ranged) bySlot.set(s, [...(bySlot.get(s) ?? []), r.errCm.get(id)!])
    }
    const lowSlots = [...bySlot].filter(([s]) => s <= 3).flatMap(([, e]) => e)
    const highSlots = [...bySlot].filter(([s]) => s >= 6).flatMap(([, e]) => e)
    expect(lowSlots.length).toBeGreaterThan(3)
    expect(highSlots.length).toBeGreaterThan(3)
    expect(rms(highSlots)).toBeGreaterThan(rms(lowSlots))
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The four tables above are read the right way round already — a cell against the string the
 * run's own figures build. What the sampling sweep of 2026-10-12 found (3 of 6) is the prose: the
 * formula block, the two paragraphs between the tables, the whole of `deeper`, `limits`,
 * `sources`, both experiments and both questions, where the same measurements are printed a
 * second time and nothing was reading them.
 *
 * **The reads worth naming:**
 *
 *  - **the birthday formula is read as the formula it prints.** `N·(1 − 1/S)^(N−1)` is parsed
 *    out of the block — the exponent and the reciprocal included — and the three answers beside
 *    it have to be what *that* expression gives for the three windows the scenes really run.
 *  - **the residual error is read through the two factors that make it.** 「每多等一毫秒，就是
 *    3.0 cm，于是每个时隙 6.0 cm」 is ½·T·σ_cfo with the session's own `cfoNoisePpm` and the
 *    slot it really schedules, so the per-millisecond figure and the per-slot figure cannot drift
 *    apart from each other or from the session.
 *  - **the Chinese numerals are read too.** 「正好三点五倍」, 「八点五个时隙」 and 「四点五」 are
 *    figures a planter cannot touch but a reader can check, so they are mapped back to numbers
 *    and compared with the ratio and the means the runs produce.
 *  - **the two neighbours of the capture threshold are read as neighbours.** 「领先 5 dB 未必
 *    必输，领先 7 dB 也未必必赢」 is the sentence's way of saying the engine's 6 dB is a cliff
 *    where a real receiver has a curve, so the two figures are read as one below and one above
 *    `UWB_CAPTURE_DB`, each exactly one decibel from it.
 */
describe('uwb-contention · every figure the prose prints, read back out of it', () => {
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
  const NUMS = blockText(uwbContention.numbers)
  const DEEP = blockText(uwbContention.deeper)
  const LIM = blockText(uwbContention.limits)
  const SRC = blockText(uwbContention.sources)
  const OBS = blockText(uwbContention.observe)
  const TRY = blockText(uwbContention.tryThis)
  const QUIZ = blockText(uwbContention.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** A Chinese numeral, 「三点五」 and 「十五」 included — the course writes counts this way. */
  const cn = (s: string): number => {
    const d = '零一二三四五六七八九'
    if (s.includes('点')) {
      const [a, b] = s.split('点')
      return d.indexOf(a!) + d.indexOf(b!) / 10
    }
    const i = s.indexOf('十')
    if (i < 0) return d.indexOf(s)
    const tens = i === 0 ? 1 : d.indexOf(s.slice(0, i))
    const ones = i === s.length - 1 ? 0 : d.indexOf(s.slice(i + 1))
    return tens * 10 + ones
  }
  /** The response slots each scene really advertises, by the window the prose names. */
  const sceneOf = (slots: number): UwbContentionVariant => {
    const hit = VARIANTS.find((v) => CONTENTION_SLOTS[v] === slots)
    expect(hit, `no scene of this lesson advertises ${slots} slots`).toBeDefined()
    return hit!
  }
  const errsOf = (v: UwbContentionVariant): number[] =>
    rounds(v).flatMap((r) => [...r.errCm.values()])

  it('reads the birthday formula as the expression it prints', () => {
    // 「P(独占自己的时隙) = (1 − 1/S)^(N−1)      期望应答数 = N·(1 − 1/S)^(N−1)」
    const [one, sub1, nMul, one2, sub2] = figs(NUMS,
      /P\(独占自己的时隙\) = \((\d) − 1\/S\)\^\(N−(\d)\)\s+期望应答数 = N·\((\d) − 1\/S\)\^\(N−(\d)\)/,
      'the formula block’s own expression')
      .concat([0])
    expect([one, nMul], 'the same shape printed twice: one minus the reciprocal').toEqual([1, 1])
    expect([sub1, one2, sub2].slice(0, 2), 'and the same exponent, N − 1').toEqual([1, 1])
    // 「N = 6 个锚点：      S = 4 → 1.42      S = 8 → 3.08      S = 16 → 4.35」
    const [n, s1, e1, s2, e2, s3, e3] = figs(NUMS,
      /N = (\d) 个锚点：\s+S = (\d+) → ([\d.]+)\s+S = (\d+) → ([\d.]+)\s+S = (\d+) → ([\d.]+)/,
      'the formula block’s three answers')
    expect(n, 'the anchors this ring really has').toBe(CONTENTION_ANCHORS)
    for (const [slots, want] of [[s1, e1], [s2, e2], [s3, e3]] as [number, number][]) {
      const v = sceneOf(slots)
      expect(CONTENTION_SLOTS[v], `S = ${slots} is a window this lesson runs`).toBe(slots)
      same(String(want), expectedResponses(n!, slots), `the expectation at S = ${slots}`)
    }
    expect([s1, s2, s3], 'the three windows, in the order the table lists them')
      .toEqual(VARIANTS.map((v) => CONTENTION_SLOTS[v]).sort((a, b) => a - b))
  })

  it('reads the residual error through the two factors that make it', () => {
    // 「应答每多等一毫秒，就是 3.0 cm，于是每个时隙 6.0 cm」
    const [perMs, perSlot] = figs(NUMS, /应答每多等一毫秒，就是 ([\d.]+) cm，于是每个时隙 ([\d.]+) cm/,
      '`numbers` on the residual error')
    const slotMs = rstuNs(DEFAULT_UWB_SESSION.slotRstu) / 1e6
    const cmPerMs = 0.5 * 1e-3 * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * 299_792_458 * 100
    same(String(perMs), cmPerMs, 'half the reply delay times the session’s own frequency error')
    same(String(perSlot), cmPerMs * slotMs, 'and the same thing over one slot')
    expect(slotMs, 'the slot this session schedules').toBe(2)
    // the steps print the per-slot figure again, with the slot beside it
    const [stepSlotMs, stepCm] = figs(NUMS,
      /就要等 k 个 (\d) ms 的时隙，这在单边测距里折合成每个时隙 ([\d.]+) cm/, 'the steps on the same cost')
    expect(stepSlotMs, 'the same slot').toBe(slotMs)
    expect(stepCm, 'and the same centimetres').toBe(perSlot)
  })

  it('reads the error ramp, slot by slot, and the three runs it adds up to', () => {
    // 「八个应答时隙上的分时隙测距误差 RMS 依次是 7.3、14.9、16.2、23.5、28.2、32.0、22.8 与 47.1 cm」
    const [listed] = raw(DEEP, /分时隙测距误差 RMS 依次是 ([\d.、与 ]+) cm/, '`deeper` on the ramp')
    const ramp = listed!.split(/、|\s*与\s*/).map(val)
    const bySlot = new Map<number, number[]>()
    for (const r of rounds('base')) {
      for (const [id, slot] of r.ranged) bySlot.set(slot, [...(bySlot.get(slot) ?? []), r.errCm.get(id)!])
    }
    expect(ramp, 'one RMS per response slot of the base window')
      .toHaveLength(CONTENTION_SLOTS.base)
    ramp.forEach((cm, i) => {
      same(String(cm), rms(bySlot.get(i + 1)!), `the RMS of slot ${i + 1}`)
    })
    // 「大约每格 6 cm 的一道斜坡」: the slope the ramp really climbs, to the nearest centimetre
    const [slope] = figs(DEEP, /大约每格 (\d+) cm 的一道斜坡/, '`deeper` on the slope')
    const fit = (ramp[ramp.length - 1]! - ramp[0]!) / (ramp.length - 1)
    expect(slope, 'the climb per slot, to the nearest centimetre').toBe(Math.round(fit))
    // 「整段运行合起来是 26.8 cm，而四个时隙是 14.6 cm、十六个时隙是 51.4 cm：
    //   51.4 除以 14.6，正好三点五倍」
    const [whole, narrowSlots, narrow, wide] = figs(DEEP,
      /整段运行合起来是 ([\d.]+) cm，而(.)个时隙是 ([\d.]+) cm、十六个时隙是 ([\d.]+) cm/,
      '`deeper` on the three runs')
      .map((x, i) => (i === 1 ? x : x))
    const narrowScene = sceneOf(cn(raw(DEEP, /而(.)个时隙是 [\d.]+ cm/, 'the narrow window')[0]!))
    same(String(whole), rms(errsOf('base')), 'the base run’s own RMS')
    same(String(narrow), rms(errsOf(narrowScene)), 'the narrow window’s')
    same(String(wide), rms(errsOf('slots16')), 'and the wide one’s')
    expect(narrowSlots, 'the narrow window, as a Chinese numeral').toBe(NaN)
    /*
     * **The ratio clause prints both of them again** (「51.4 除以 14.6，正好三点五倍」), and the
     * sweep of 2026-10-13 caught both second printings: a read of the sentence before it never
     * looks here. So the two are parsed again and required to be the same two.
     */
    const [overCn, underCn, ratio] = raw(DEEP, /([\d.]+) 除以 ([\d.]+)，正好(...)倍/,
      '`deeper` on the ratio')
    expect([val(overCn!), val(underCn!)], 'the same two figures the sentence just stated')
      .toEqual([wide, narrow])
    expect(cn(ratio!), 'how many times worse the wide window is')
      .toBe(Math.round((wide! / narrow!) * 10) / 10)
  })

  it('reads what thirty rounds give, against the roll call that answers every time', () => {
    const base = recs('base')
    const fixes = ofType(base, 'UWB_POSITION')
    // 「在三十轮里交出 79 次应答（满打满算本可有 180 次）与 15 次定位，这十五次里有六次只用上
    //   三个锚点，而第一次要等到第 6 个块、1.218 s 才出现」
    const [heard, possible, got] = figs(DEEP,
      /在三十轮里交出 (\d+) 次应答（满打满算本可有 (\d+) 次）与 (\d+) 次定位/,
      '`deeper` on what the base run gives')
    expect(heard, 'the responses the tag really hears').toBe(tagRanges(base).length)
    expect(possible, 'every anchor in every round').toBe(ROUNDS * CONTENTION_ANCHORS)
    expect(got, 'and the fixes they make').toBe(fixes.length)
    const [threeAnchor] = raw(DEEP, /这十五次里有(.)次只用上三个锚点/, '`deeper` on the thin fixes')
    expect(cn(threeAnchor!), 'the fixes that had only three anchors to work with')
      .toBe(fixes.filter((f) => f.anchors.length === 3).length)
    const [block, secs] = figs(DEEP, /第一次要等到第 (\d+) 个块、([\d.]+) s 才出现/,
      '`deeper` on when the first fix comes')
    expect(block, 'the block the first fix falls in').toBe(fixes[0]!.block)
    same(String(secs), fixes[0]!.t / (1000 * MS), 'and the second it falls at')
    // 「同样六个锚点改用点名，则是 180 次应答、30 次定位」
    const [refHeard, refFixes] = figs(DEEP, /改用点名，则是 (\d+) 次应答、(\d+) 次定位/,
      '`deeper` on the roll call')
    const ref = timeScheduled()
    expect(refHeard, 'a roll call loses nothing')
      .toBe(ofType(ref, 'UWB_RANGE').filter((r) => r.node === TAG).length)
    expect(refFixes, 'and fixes every round').toBe(ofType(ref, 'UWB_POSITION').length)
    expect(refHeard, 'which is every anchor in every round').toBe(possible)
    // 「四个时隙时，七次定位全都只勉强用上三个锚点」
    const [narrowFixes] = raw(DEEP, /四个时隙时，(.)次定位全都只勉强用上三个锚点/,
      '`deeper` on the narrow window’s fixes')
    const nf = ofType(recs('slots4'), 'UWB_POSITION')
    expect(cn(narrowFixes!), 'the fixes the narrow window makes').toBe(nf.length)
    expect(new Set(nf.map((f) => f.anchors.length)), 'every one of them on three anchors')
      .toEqual(new Set([3]))
    // 「第一轮起就每轮都有，而且每轮还短 4 ms」
    const [shorter] = figs(DEEP, /而且每轮还短 (\d+) ms/, '`deeper` on the roll call’s round')
    same(String(shorter), (tagRounds(base)[0]!.untilNs - tagRounds(ref)[0]!.untilNs) / MS,
      'how much shorter a roll call’s round is')
  })

  it('reads the doubling sentence: both columns, and what the width costs', () => {
    // 「窗口从 8 个时隙翻倍到 16 个，实测那一列每轮只多换来 1.50 个应答（2.63 → 4.13，
    //   三十轮 79 → 124 条），公式那一列给的是 1.27（3.08 → 4.35）；代价都是每轮多用 16 ms」
    const [from, to, gain, was, now, totalWas, totalNow] = figs(DEEP,
      /窗口从 (\d+) 个时隙翻倍到 (\d+) 个，实测那一列每轮只多换来 ([\d.]+) 个应答（([\d.]+) → ([\d.]+)，三十轮 (\d+) → (\d+) 条）/,
      '`deeper` on the measured column')
    expect(to, 'twice the base window').toBe(2 * from!)
    expect([from, to], 'both of them windows this lesson runs')
      .toEqual([CONTENTION_SLOTS[sceneOf(from!)], CONTENTION_SLOTS[sceneOf(to!)]])
    const perRound = (v: UwbContentionVariant): number => tagRanges(recs(v)).length / ROUNDS
    same(String(was), perRound(sceneOf(from!)), 'the responses a round of the base window')
    same(String(now), perRound(sceneOf(to!)), 'and of the wide one')
    expect(totalWas, 'the thirty rounds behind the first').toBe(tagRanges(recs(sceneOf(from!))).length)
    expect(totalNow, 'and behind the second').toBe(tagRanges(recs(sceneOf(to!))).length)
    same(String(gain), now! - was!, 'the difference the sentence calls the gain')
    const [fGain, fWas, fNow] = figs(DEEP, /公式那一列给的是 ([\d.]+)（([\d.]+) → ([\d.]+)）/,
      '`deeper` on the formula column')
    same(String(fWas), expectedResponses(CONTENTION_ANCHORS, from!), 'the formula at the base window')
    same(String(fNow), expectedResponses(CONTENTION_ANCHORS, to!), 'and at the wide one')
    same(String(fGain), fNow! - fWas!, 'the gain the formula promises')
    const [costMs] = figs(DEEP, /代价都是每轮多用 (\d+) ms/, '`deeper` on what it costs')
    const roundMs = (v: UwbContentionVariant): number => tagRounds(recs(v))[0]!.untilNs / MS
    same(String(costMs), roundMs(sceneOf(to!)) - roundMs(sceneOf(from!)),
      'the milliseconds the wider window adds to a round')
    /*
     * **Exempt, class (c): the 4σ of 「三个总数都落在所印公式的 4σ 二项包络之内」.** The
     * sentence's content is an inequality, and the widest of the three is 1.8σ out, so a 3 or a
     * 5 would be just as true of this run. What is read is the claim itself, for all three.
     */
    const [sigmas] = figs(DEEP, /落在所印公式的 (\d+)σ 二项包络之内/, '`deeper` on the envelope')
    for (const v of VARIANTS) {
      const p = (1 - 1 / CONTENTION_SLOTS[v]) ** (CONTENTION_ANCHORS - 1)
      const mean = ROUNDS * CONTENTION_ANCHORS * p
      const sd = Math.sqrt(ROUNDS * CONTENTION_ANCHORS * p * (1 - p))
      expect(Math.abs(tagRanges(recs(v)).length - mean), `${v} is inside ${sigmas}σ`)
        .toBeLessThan(sigmas! * sd)
    }
  })

  it('reads the thinning sentence, which moves the expectation both ways', () => {
    // 「竞争者变少，在四个时隙时会把期望抬高——从 1.42 抬到 1.69；在更宽的窗口里则会把期望压低」
    const [lifted, to] = figs(NUMS, /会把期望抬高——从 ([\d.]+) 抬到 ([\d.]+)/,
      '`numbers` on the thinning')
    same(String(lifted), expectedResponses(CONTENTION_ANCHORS, CONTENTION_SLOTS.slots4),
      'the formula at six contenders')
    /*
     * **The illustration is at four contenders**, which is the count the first question spells
     * out in Chinese — the paragraph itself only says 「竞争者变少」. So the figure is read as the
     * formula at that count, and the contenders the scene really has must sit between the two.
     */
    const [thinnedCn] = raw(QUIZ, /竞争者只有(.)个时/, 'the contender count the question names')
    same(String(to), expectedResponses(cn(thinnedCn!), CONTENTION_SLOTS.slots4),
      'and at the count the question thins them to')
    expect(to, 'which is higher, in the narrow window').toBeGreaterThan(lifted!)
    const contenders = (v: UwbContentionVariant): number =>
      rounds(v).reduce((a, r) => a + r.drew.size, 0) / ROUNDS
    expect(contenders('slots4'), 'while the run itself sits between the two counts')
      .toBeGreaterThan(cn(thinnedCn!))
    expect(contenders('slots4'), 'and under the six the formula assumes')
      .toBeLessThan(CONTENTION_ANCHORS)
    // …and lower in the wide one, which is the other half of the same sentence
    expect(expectedResponses(contenders('slots16'), CONTENTION_SLOTS.slots16),
      'while thinning costs the wide window')
      .toBeLessThan(expectedResponses(CONTENTION_ANCHORS, CONTENTION_SLOTS.slots16))
  })

  it('reads `limits` and `sources` on the defaults, the mode and the threshold', () => {
    // 「8 个时隙与 3 次尝试是会话的默认值」, in `limits` and again in `sources`
    for (const [slots, tries] of every([LIM, SRC].join('\n'), /(\d+) 个时隙与 (\d+) 次尝试/g,
      'the two session defaults, printed twice', 2)) {
      expect(val(slots!), 'the window the session defaults to')
        .toBe(DEFAULT_UWB_SESSION.contentionSlots)
      expect(val(tries!), 'and the attempts it allows').toBe(DEFAULT_UWB_SESSION.maxAttempts)
    }
    expect(uwbContentionScenario('base').uwb!.contentionSlots, 'which is what this scene runs')
      .toBe(DEFAULT_UWB_SESSION.contentionSlots)
    // 「调度模式 0」
    const [mode] = figs(SRC, /调度模式 (\d+)/, '`sources` on the schedule mode')
    expect(mode, 'the mode a contention round is, as the clause numbers it').toBe(0)
    // 「一条 6 dB 的硬门限（phy.ts 的 UWB_CAPTURE_DB）：领先 6 dB 的那一路整帧解出」
    for (const [db] of every(LIM, /(\d+) dB 的(?:硬门限|那一路)/g, 'the threshold, printed twice', 2)) {
      expect(val(db!), 'the capture margin the engine applies').toBe(UWB_CAPTURE_DB)
    }
    // 「领先 5 dB 未必必输，领先 7 dB 也未必必赢」
    const [below, above] = figs(LIM, /领先 (\d+) dB 未必必输，领先 (\d+) dB 也未必必赢/,
      '`limits` on what a real receiver does')
    expect([UWB_CAPTURE_DB - below!, above! - UWB_CAPTURE_DB],
      'one decibel under the threshold and one over it').toEqual([1, 1])
    // 「6 dB 的捕获余量」 in `sources`, and once more in `deeper`, are the same threshold
    const [srcDb] = figs(SRC, /(\d+) dB 的捕获余量/, '`sources` on the same margin')
    expect(srcDb, 'the same margin again').toBe(UWB_CAPTURE_DB)
    const [deepDb] = figs(DEEP, /只要较强的一路领先 (\d+) dB，介质就放它过去/,
      '`deeper` on the same margin')
    expect(deepDb, 'and a third time, where `deeper` explains why no capture happens here')
      .toBe(UWB_CAPTURE_DB)
    // 「每个锚点都在 3.50 m 处、功率相同」 and 「发的都是同样的 −14 dBm」
    const [ringM] = figs(NUMS, /而这里每个锚点都在 ([\d.]+) m 处/, 'the steps on the ring')
    same(String(ringM), RING_RADIUS_M, 'the ring this scene really lays out')
    const [dbm] = figs(DEEP, /发的都是同样的 (−\d+) dBm/, '`deeper` on the transmit power')
    expect(dbm, 'the power every UWB frame goes out at').toBe(UWB_TX_POWER_DBM)
    const [deepRing] = figs(DEEP, /每个锚点离手机都是 ([\d.]+) m/, '`deeper` on the same ring')
    expect(deepRing, 'the same radius').toBe(ringM)
  })

  it('reads the draw the steps describe, and the log line `observe` quotes', () => {
    // 「应答窗口里有 8 个时隙，一个应答者可以尝试 3 次」
    const [slots, tries] = figs(NUMS, /应答窗口里有 (\d+) 个时隙，一个应答者可以尝试 (\d+) 次/,
      'the steps on what the poll announces')
    expect(slots, 'the window this scene advertises')
      .toBe(uwbContentionScenario('base').uwb!.contentionSlots)
    expect(tries, 'and the attempts it allows').toBe(DEFAULT_UWB_SESSION.maxAttempts)
    // 「1 加上一个小于 S 的均匀整数」 — the draw's own range, and the run stays inside it
    const [base1] = figs(NUMS, /它抽一个时隙：(\d+) 加上一个小于 S 的均匀整数/, 'the steps on the draw')
    const drawn = rounds('base').flatMap((r) => [...r.drew.values()])
    expect(Math.min(...drawn), 'the lowest slot anyone draws').toBe(base1)
    expect(Math.max(...drawn), 'and the highest').toBe(base1! + slots! - 1)
    // 「“anchor-1 contends: slot 4 (attempt 1)”」
    const [who, slot, attempt] = raw(OBS, /“(anchor-\d) contends: slot (\d+) \(attempt (\d+)\)”/,
      '`observe` on the log line')
    const first = draws(recs('base'))[0]!
    expect(fmtRecord(first), 'the line the log really prints')
      .toBe(`${who} contends: slot ${slot} (attempt ${attempt})`)
    expect(first.node, 'the anchor that draws first').toBe(who)
    // 「“uwb-1 contention collision in slot 4”」
    const [colSlot] = figs(DEEP, /contention collision in slot (\d+)”/, '`deeper` on the collision line')
    expect(colSlot, 'the slot the first collision is recorded in').toBe(collided(recs('base'))[0]!.slot)
  })

  it('reads both experiments and both questions', () => {
    // 「载入“16 个应答时隙”。…一轮长到 34 ms…平均一路应答现在要等八点五个时隙，而不是四点五个」
    const [wide] = figs(TRY, /载入“(\d+) 个应答时隙”/, '`tryThis` on the scene it loads')
    expect(uwbContention.variants![V16].label, 'the label that variant carries')
      .toContain(`${wide} 个应答时隙`)
    const [roundMs] = figs(TRY, /一轮长到 (\d+) ms/, '`tryThis` on its round')
    same(String(roundMs), tagRounds(recs(sceneOf(wide!)))[0]!.untilNs / MS, 'the round it runs')
    const [wideWait, baseWait] = raw(TRY, /要等(...)个时隙，而不是(...)个/, '`tryThis` on the two waits')
    const meanDrawn = (v: UwbContentionVariant): number => {
      const d = rounds(v).flatMap((r) => [...r.drew.values()])
      return d.reduce((a, b) => a + b, 0) / d.length
    }
    expect(cn(wideWait!), 'the slots a wide-window answer waits on average')
      .toBe((CONTENTION_SLOTS[sceneOf(wide!)] + 1) / 2)
    expect(cn(baseWait!), 'and a base-window one').toBe((CONTENTION_SLOTS.base + 1) / 2)
    expect(cn(wideWait!), 'which the runs’ own draws agree with')
      .toBeCloseTo(meanDrawn(sceneOf(wide!)), 0)
    const [narrow] = figs(TRY, /再载入“(\d+) 个应答时隙”/, '`tryThis` on the other scene')
    expect(uwbContention.variants![V4].label, 'the label that one carries')
      .toContain(`${narrow} 个应答时隙`)
    const [against] = figs(TRY, /把测距误差与 (\d+) 个时隙那一次比一比/, '`tryThis` on the comparison')
    expect(against, 'the narrow window, which is the one it compares against').toBe(narrow)
    expect(rms(errsOf(sceneOf(narrow!))), 'and a roll call really is worse than it')
      .toBeLessThan(rms(ofType(timeScheduled(), 'UWB_RANGE').filter((r) => r.node === TAG)
        .map((r) => Math.abs(r.distM - r.trueDistM) * 100)))
    // quiz 1: 「在 4 个应答时隙下，六个锚点每轮给出 1.57 次测距，而公式预测 1.42」
    const [qSlots, measured, formula] = figs(QUIZ,
      /在 (\d+) 个应答时隙下，六个锚点每轮给出 ([\d.]+) 次测距，而公式预测 ([\d.]+)/,
      'the first question’s two figures')
    const scene = sceneOf(qSlots!)
    same(String(measured), tagRanges(recs(scene)).length / ROUNDS, 'what that scene really gives')
    same(String(formula), expectedResponses(CONTENTION_ANCHORS, qSlots!), 'and what the formula says')
    const [onThinned, notFormula, back, stillMeasured] = figs(QUIZ,
      /期望是 ([\d.]+) 而不是 ([\d.]+)；按每一轮实测的竞争者数逐轮代回去，平均是 ([\d.]+)，而实测是 ([\d.]+)/,
      'the first question’s explanation')
    const [thinnedCn] = raw(QUIZ, /竞争者只有(.)个时/, 'the thinned contender count')
    expect(cn(thinnedCn!), 'a count written as a Chinese numeral, and a real one')
      .toBeGreaterThan(0)
    same(String(onThinned), expectedResponses(cn(thinnedCn!), qSlots!),
      'the expectation at that many contenders')
    expect(notFormula, 'against the one at six').toBe(formula)
    /*
     * **Round by round, then averaged** — which is what the table's own column does, and what
     * the explanation now says (correction of 2026-10-13: it used to say 「把实测的 5.23 代回去」,
     * and substituting that rounded mean gives 1.55, not the 1.54 the column prints: the gap is
     * the formula's curvature, so the operation the sentence named was not the one behind it).
     */
    same(String(back), rounds(scene).reduce((a, r) => a + expectedResponses(r.drew.size, qSlots!), 0) / ROUNDS,
      'the expectation those contenders give, round by round')
    expect(cell(1, ROW[scene], 2), 'which is the column the table prints').toBe(String(back))
    expect(stillMeasured, 'and the measurement it is still short of').toBe(measured)
    // quiz 2: 「为什么 16 个时隙窗口下的测距误差是 4 个时隙窗口的三点五倍？」
    const [qWide, qNarrow] = figs(QUIZ, /为什么 (\d+) 个时隙窗口下的测距误差是 (\d+) 个时隙窗口的/,
      'the second question’s two windows')
    const [qRatio] = raw(QUIZ, /个时隙窗口的(...)倍/, 'the second question’s ratio')
    expect(cn(qRatio!), 'the ratio between the two runs’ RMS')
      .toBe(Math.round((rms(errsOf(sceneOf(qWide!))) / rms(errsOf(sceneOf(qNarrow!)))) * 10) / 10)
    const [qCm, qSigma] = figs(QUIZ, /每个时隙留下 ([\d.]+) cm 的 (\d)σ/, 'the second question’s per-slot cost')
    const slotMs = rstuNs(DEFAULT_UWB_SESSION.slotRstu) / 1e6
    const perSlotCm = 0.5 * slotMs * 1e-3 * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * 299_792_458 * 100
    same(String(qCm), perSlotCm, 'the residual error one slot of waiting leaves')
    expect(qSigma, 'and how many sigmas that figure is').toBe(1)
    // …and the explanation under it prints the slot and the same two figures over again
    const [exSlotMs, exCm, exSigma] = figs(QUIZ,
      /要等 k 个 (\d) ms 的时隙，于是每个时隙 ([\d.]+) cm 的 (\d)σ/,
      'the second question’s explanation')
    expect(exSlotMs, 'the slot this session schedules').toBe(slotMs)
    same(String(exCm), perSlotCm, 'the same centimetres a slot of waiting costs')
    expect(exSigma, 'and the same one sigma').toBe(qSigma)
  })
})
