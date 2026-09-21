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
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { UWB_CAPTURE_DB, UWB_TX_POWER_DBM, rstuNs } from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbContendText } from '../../src/uwb/ui/rows'
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

/** The base scene with the schedule swapped back to a roll call: the reference the lesson prices against. */
function timeScheduled(): TLRecord[] {
  const s = uwbContentionScenario('base')
  return [...new Simulation({ ...s, uwb: { ...s.uwb!, schedule: 'time' } }).runUntil(RUN_NS).records]
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

/** Everything a learner reads of this lesson, `deeper` and `sources` included, joined. */
const prose = (): string => lessonStrings(uwbContention).map((s) => s.en).join('\n')

const tablesOf = (bs: Block[]): Extract<Block, { kind: 'table' }>[] =>
  bs.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
/** numbers' tables: 0 the three windows, 1 the contenders, 2 round 0's draws, 3 what width costs. */
const table = (n: number) => tablesOf(uwbContention.numbers!)[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en
/** Row index of a variant in the tables that list the three windows in 4 · 8 · 16 order. */
const ROW: Record<UwbContentionVariant, number> = { slots4: 0, base: 1, slots16: 2 }

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(uwbContention, { proseMax: 950, runNs: RUN_NS })

describe('uwb-contention · the lesson’s own place in the track', () => {
  it('opens module 14 and asks only for the coexistence lesson', () => {
    expect(uwbContention.module).toBe(14)
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
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
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
    const src = uwbContention.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§10.32.2')
    expect(src).toContain('schedule mode 0')
    expect(src).toContain('§10.32.9.5 is the RCPS IE')
    expect(src).toContain('§10.32.9.6 is the RCMA IE')
    expect(src).toContain('The NOTE in §10.32.1 leaves the filtering of wrong results to the upper layer')
    // "the defaults of 8 slots and 3 attempts": both are the engine's own, not the standard's
    expect(src).toContain(`the defaults of ${DEFAULT_UWB_SESSION.contentionSlots} slots and ${DEFAULT_UWB_SESSION.maxAttempts} attempts`)
    expect(src).toContain('The rest is the model')
    expect(src).toContain('the feedback loop that lets an anchor learn at a round’s end whether the tag ranged it')
  })

  it('it is the first lesson of module 14, after uwb-coexist in the course order', () => {
    expect(MODULES[14]).toEqual({ tier: 5, title: { en: 'Other ranging modes', zh: '其他测距模式' } })
    expect(MODULES[uwbContention.module].tier).toBe(5)
    expect(TIERS[5].track).toBe('uwb')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-contention') - 1]).toBe('uwb-coexist')
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-coexist') + 1]).toBe('uwb-contention')
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
    expect(uwbContention.variants![V4].label.en).toBe('4 response slots')
    expect(uwbContention.variants![V4].label.zh).toBe('4 个应答时隙')
    expect(uwbContention.variants![V16].label.en).toBe('16 response slots')
    expect(uwbContention.variants![V16].label.zh).toBe('16 个应答时隙')
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
    expect(cell(0, 3, 0)).toBe('roll call, 6 anchors')
    expect(cell(0, 3, 1)).toBe('14 ms')
    // "in a round 4 ms shorter"
    expect((tagRounds(recs('base'))[0].untilNs - t.untilNs) / MS).toBe(4)
    expect(prose()).toContain('in a round 4 ms shorter')
  })

  it('every scene runs exactly thirty rounds in the measurement window', () => {
    for (const v of VARIANTS) expect(tagRounds(recs(v)), v).toHaveLength(ROUNDS)
    expect(tagRounds(timeScheduled())).toHaveLength(ROUNDS)
  })
})

describe('uwb-contention · the analytic model', () => {
  it('"N = 6 anchors: S = 4 → 1.42, S = 8 → 3.08, S = 16 → 4.35" follows from the printed formula', () => {
    const formula = uwbContention.numbers!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    expect(formula.text.en).toContain('P(alone in your slot) = (1 − 1/S)^(N−1)')
    expect(formula.text.en).toContain('expected responses = N·(1 − 1/S)^(N−1)')
    expect(CONTENTION_ANCHORS).toBe(6)
    const at = (s: number) => expectedResponses(CONTENTION_ANCHORS, s).toFixed(2)
    expect(at(4)).toBe('1.42')
    expect(at(8)).toBe('3.08')
    expect(at(16)).toBe('4.35')
    expect(formula.text.en).toContain(`S = 4 → ${at(4)}      S = 8 → ${at(8)}      S = 16 → ${at(16)}`)
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
    expect(prose()).toContain('buys 1.27 more responses a round and costs 16 ms')
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
    expect(prose()).toContain('lifting the expectation from 1.42 to 1.69')
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
    expect(prose()).toContain('All three totals sit inside a 4σ binomial envelope of the printed formula')
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
    expect(table(2).rows.filter((r) => r[2].en === 'ranged').map((r) => r[0].en))
      .toEqual(['anchor-3', 'anchor-5'])
    expect(uwbContention.observe[0].en).toContain('Two pairs picked the same slot')
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
    expect(uwbContention.observe[0].en).toContain('anchor-1 contends: slot 4 (attempt 1)')
    expect(uwbContention.observe[0].zh).toContain('anchor-1 contends: slot 4 (attempt 1)')
  })

  it('"not one range was decoded in a slot that also recorded a collision" — no capture at equal distances', () => {
    let captured = 0
    for (const v of VARIANTS) for (const r of rounds(v)) {
      for (const slot of r.ranged.values()) if (r.collidedSlots.has(slot)) captured++
    }
    expect(captured).toBe(0)
    // "Across the ninety rounds of the three scenes"
    expect(VARIANTS.length * ROUNDS).toBe(90)
    expect(prose()).toContain('Across the ninety rounds of the three scenes')
    // and the reason: six equal ranges cannot clear the medium's capture margin
    expect(UWB_CAPTURE_DB).toBe(6)
    expect(prose()).toContain('when it leads by 6 dB')
    const s = uwbContention.scenario()
    // "transmits at the same −14 dBm"
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(new Set(s.nodes.filter((n) => n.kind === 'uwb').map((n) => n.txPowerDbm)))
      .toEqual(new Set([UWB_TX_POWER_DBM]))
    expect(prose()).toContain('transmits at the same −14 dBm')
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
    expect(prose()).toContain('uwb-1 contention collision in slot 4')
    // one record per slot, not one per answer lost: round 0 doomed four answers in two slots
    expect(rounds('base')[0].collidedSlots.size).toBe(2)
    expect(collided(recs('base')).filter((r) => r.t < 200 * MS)).toHaveLength(2)
    expect(prose()).toContain('one record per slot, not one per answer lost')
    // the inspector row the observe item quotes, through the player's own reducer
    const vs = initViewState(uwbContention.scenario())
    for (const r of recs('base')) applyRecord(vs, r)
    expect(vs.nodes[TAG].uwb!.contendCollisions).toBe(43)
    expect(cell(0, ROW.base, 4)).toBe('43')
    expect(STRINGS.en.uwb.contendCollisions).toBe('slots collided')
    expect(uwbContention.observe[0].en).toContain(`the inspector’s “${STRINGS.en.uwb.contendCollisions}” row`)
    // the two editor labels tryThis[1] quotes, so a rename cannot leave the lesson naming a
    // caption that no longer exists
    expect(STRINGS.en.editor.uwbContentionSlots).toBe('Response slots')
    expect(STRINGS.en.editor.uwbMaxAttempts).toBe('Attempts')
    expect(uwbContention.tryThis[1].en)
      .toContain(`${STRINGS.en.editor.uwbContentionSlots} and ${STRINGS.en.editor.uwbMaxAttempts} grey out`)
  })

  it('no timeout record is emitted in any of the three scenes', () => {
    for (const v of VARIANTS) expect(ofType(recs(v), 'UWB_TIMEOUT'), v).toHaveLength(0)
    expect(prose()).toContain('no timeout record is emitted in any of the three scenes')
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
    expect(uwbContention.observe[1].en).toContain('anchor-2 sits out this round')
    // the inspector row observe 2 quotes
    const vs = initViewState(uwbContention.scenario())
    for (const r of recs('base')) { applyRecord(vs, r); if (r === firstOut) break }
    expect(uwbContendText(vs.nodes['anchor-2'].uwb!, STRINGS.en.uwb)).toBe('sitting this round out')
    expect(STRINGS.en.uwb.contend).toBe('contention draw')
    expect(uwbContention.observe[1].en).toContain('contention draw · sitting this round out')
  })
})

describe('uwb-contention · what it costs', () => {
  it('"3.0 cm for every millisecond the answer waits, so 6.0 cm a slot"', () => {
    // the surviving term of a single-sided range, ½·Treply·σcfo, in centimetres
    const slotMs = rstuNs(DEFAULT_UWB_SESSION.slotRstu) / 1e6
    const perSlotCm = 0.5 * slotMs * 1e-3 * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * 299_792_458 * 100
    expect(perSlotCm.toFixed(1)).toBe('6.0')
    expect((perSlotCm / slotMs).toFixed(1)).toBe('3.0')
    expect(prose()).toContain('3.0 cm for every millisecond the answer waits, so 6.0 cm a slot')
    expect(uwbContention.quiz[1].options[0].en).toContain('6.0 cm of 1-σ per slot')
    // the base run's per-slot RMS, quoted in `deeper`
    const bySlot = new Map<number, number[]>()
    for (const r of rounds('base')) for (const [id, slot] of r.ranged) {
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), r.errCm.get(id)!])
    }
    const ramp = Array.from({ length: CONTENTION_SLOTS.base }, (_, i) => rms(bySlot.get(i + 1)!).toFixed(1))
    expect(ramp).toEqual(['7.3', '14.9', '16.2', '23.5', '28.2', '32.0', '22.8', '47.1'])
    expect(prose()).toContain(ramp.join(', ').replace(/, ([^,]*)$/, ' and $1'))
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
    expect(uwbContention.tryThis[0].en).toContain('waits eight and a half slots instead of four and a half')
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
    expect(uwbContention.quiz[1].q.en).toContain('three and a half times worse')
    expect(prose()).toContain('51.4 / 14.6 is three and a half')
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
    expect(prose()).toContain('its first position is at 1.218 s')
    // "six of those fifteen on only three anchors"
    expect(fixes.filter((f) => f.anchors.length === 3)).toHaveLength(6)
    expect(prose()).toContain('six of those fifteen on only three anchors')
    // and the roll-call reference: 180 of 180 responses, 30 of 30 fixes
    const ref = timeScheduled()
    expect(ofType(ref, 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(ROUNDS * CONTENTION_ANCHORS)
    expect(ofType(ref, 'UWB_POSITION')).toHaveLength(ROUNDS)
    expect(prose()).toContain('deliver 180 responses and 30 fixes')
  })

  it('the 4-slot scene’s seven fixes are all three-anchor fixes', () => {
    const fixes = ofType(recs('slots4'), 'UWB_POSITION')
    expect(fixes).toHaveLength(7)
    expect(new Set(fixes.map((f) => f.anchors.length))).toEqual(new Set([3]))
    expect(prose()).toContain('all seven fixes are on the bare minimum of three anchors')
  })
})
