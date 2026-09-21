/**
 * Every empirical claim in "Locate the phone in this flat", measured against the
 * four scenes the brief offers.
 *
 * The lesson is a rubric, so most of what is pinned here is the four-scene table
 * and the three ranges of the base flat: the numbers the learner marks their own
 * three decisions against.
 */
import { describe, it, expect } from 'vitest'
import {
  uwbCapstone, uwbCapstoneScenario, CAPSTONE_ANCHORS, FAR_ANCHOR, TAG_POS, ROUTER_POS,
  LAPTOP_POS, ANCHOR_Z, TAG_Z, WIFI_6G_CENTER_MHZ, FAST_BLOCK_RSTU,
} from '../../src/course/uwb/uwb-capstone'
import { DEFAULT_UWB_SESSION, ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { UWB_NLOS_NS, FOM_LOS, FOM_NLOS, rstuNs } from '../../src/uwb/phy'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import type { Block } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The window every UWB lesson measures over: seven 200 ms blocks. */
const RUN_NS = 1300 * MS
const TAG = 'uwb-1'
const ANCHORS = CAPSTONE_ANCHORS.map((a) => a.id)
/** Variant indices, in the order the lesson lists them. */
const V_FAR = 0
const V_FAST = 1
const V_OTM = 2

const recs = (variant?: number): TLRecord[] => runOf(uwbCapstone, variant, RUN_NS)
const count = (variant: number | undefined, type: TLRecord['type']): number =>
  recs(variant).filter((r) => r.type === type).length
/** The lesson's nth table of `numbers`: 0 the four scenes, 1 the three ranges, 2 the rubric. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbCapstone.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(uwbCapstone, { proseMax: 950, runNs: RUN_NS })

describe('uwb-capstone · the lesson', () => {
  it('closes the UWB track: module 16, four prerequisites, two new words', () => {
    expect(uwbCapstone.id).toBe('uwb-capstone')
    expect(uwbCapstone.module).toBe(16)
    expect(uwbCapstone.needs).toEqual(['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'])
    expect(uwbCapstone.terms!.map((t) => t.term)).toEqual(['brief', 'duty cycle'])
    expect(uwbCapstone.outcomes).toHaveLength(4)
    expect(uwbCapstone.variants).toHaveLength(3)
    expect(uwbCapstone.variants!.map((v) => v.label.en))
      .toEqual(['Anchor 3 in the far room', 'A block every 100 ms', 'One round for all three'])
  })

  it('the flat: three anchors, one phone, a router in the hallway and a laptop', () => {
    const sc = uwbCapstoneScenario('base')
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'laptop', ...ANCHORS, TAG])
    expect(sc.rooms.map((r) => r.name)).toEqual(['Room A', 'Hallway', 'Room B'])
    for (const a of CAPSTONE_ANCHORS) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb, a.id).toEqual({ role: 'anchor', yawDeg: a.yawDeg })
    }
    expect(sc.nodes.find((n) => n.id === TAG)!.pos).toEqual({ x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z })
    expect(sc.sixGhzCenterMhz).toBe(WIFI_6G_CENTER_MHZ)
    // the phone is in Room B with two anchors, and the third is across the hallway wall at x = 6
    expect(TAG_POS.x).toBeGreaterThan(6)
    expect(CAPSTONE_ANCHORS.filter((a) => a.x > 6)).toHaveLength(2)
    expect(CAPSTONE_ANCHORS.find((a) => a.id === 'anchor-3')!.x).toBeLessThan(6)
    expect([ROUTER_POS.x, LAPTOP_POS.x]).toEqual([5, 7])
  })

  it('the three decisions are exactly the three variants', () => {
    const base = uwbCapstoneScenario('base')
    // anchor placement: only anchor-3 moves, into the far room, two brick walls away
    const far = uwbCapstoneScenario('farAnchor')
    expect(far.nodes.find((n) => n.id === 'anchor-3')!.pos)
      .toEqual({ x: FAR_ANCHOR.x, y: FAR_ANCHOR.y, z: ANCHOR_Z })
    expect(far.uwb).toEqual(base.uwb)
    expect(FAR_ANCHOR.x).toBeLessThan(4)
    // block timing: only the block length moves, from 200 ms to 100
    const fast = uwbCapstoneScenario('fastBlock')
    expect(fast.nodes).toEqual(base.nodes)
    expect(fast.uwb!.blockRstu).toBe(FAST_BLOCK_RSTU)
    expect(rstuNs(FAST_BLOCK_RSTU)).toBe(100 * MS)
    expect(rstuNs(base.uwb!.blockRstu)).toBe(200 * MS)
    // one round for all three: the multi-millisecond mode, at the shortest legal MMS slot
    const otm = uwbCapstoneScenario('oneToMany')
    expect(otm.nodes).toEqual(base.nodes)
    expect(otm.uwb!.mode).toBe('mms')
    expect(otm.uwb!.mms.oneToMany).toBe(true)
    expect(otm.uwb!.slotRstu).toBe(600)
    expect(otm.uwb!.aoa).toBe(false)
    expect(roundPlan(otm.uwb!, ANCHORS.length).slots).toBe(52)
    for (const v of ['base', 'farAnchor', 'fastBlock'] as const) {
      expect(uwbCapstoneScenario(v).uwb!.method, v).toBe('ds')
      expect(uwbCapstoneScenario(v).uwb!.aoa, v).toBe(true)
      expect(uwbCapstoneScenario(v).uwb!.channel, v).toBe(5)
    }
    expect(DEFAULT_UWB_SESSION.mms.oneToMany).toBe(false)
  })
})

describe('uwb-capstone · the four scenes over seven blocks', () => {
  it('the table is the run: fixes, three-range fixes, timeouts and losses to Wi-Fi', () => {
    const rows: [number | undefined, string[]][] = [
      [undefined, ['20', '5', '18', '6']],
      [V_FAR, ['10', '0', '40', '4']],
      [V_FAST, ['36', '9', '36', '12']],
      [V_OTM, ['7', '7', '0', '14']],
    ]
    for (const [i, [variant, want]] of rows.entries()) {
      const fixes = ofType(recs(variant), 'UWB_POSITION')
      const three = fixes.filter((f) => f.anchors.length === 3)
      const got = [
        String(fixes.length), String(three.length),
        String(count(variant, 'UWB_TIMEOUT')), String(count(variant, 'UWB_INTERFERED')),
      ]
      expect(got, `row ${i}`).toEqual(want)
      expect([cell(0, i, 1), cell(0, i, 2), cell(0, i, 3), cell(0, i, 4)], `row ${i}`).toEqual(want)
    }
  })

  it('a faster block doubles the work and leaves the accuracy alone', () => {
    const err = (v?: number) => mean(ofType(recs(v), 'UWB_POSITION')
      .filter((f) => f.anchors.length === 3)
      .map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY)))
    expect(Math.abs(err(V_FAST) - err(undefined))).toBeLessThan(0.05)
    // twice the blocks, so about twice of everything the session costs
    expect(count(V_FAST, 'UWB_INTERFERED')).toBe(2 * count(undefined, 'UWB_INTERFERED'))
    expect(count(V_FAST, 'UWB_ROUND')).toBe(2 * count(undefined, 'UWB_ROUND'))
    expect(uwbCapstone.quiz[1].explain.en).toContain('Doubling the rate doubles the fixes')
  })

  it('the far anchor leaves no three-range fix at all, and doubles the timeouts', () => {
    expect(ofType(recs(V_FAR), 'UWB_POSITION').every((f) => f.anchors.length === 1)).toBe(true)
    expect(ofType(recs(V_FAR), 'UWB_POSITION').every((f) => f.method === 'aoa')).toBe(true)
    expect(count(V_FAR, 'UWB_TIMEOUT')).toBe(40)
    expect(count(V_FAR, 'UWB_TIMEOUT')).toBeGreaterThan(2 * count(undefined, 'UWB_TIMEOUT') - 1)
    // anchor-3 never gets a range back through two brick walls
    expect(ofType(recs(V_FAR), 'UWB_RANGE').some((r) => r.peer === 'anchor-3')).toBe(false)
    expect(cell(2, 0, 1)).toContain('halves the fixes, doubles the timeouts and leaves no three-range fix at all')
  })

  it('one round for all three is one round a block, with every anchor in it', () => {
    const rounds = ofType(recs(V_OTM), 'UWB_ROUND')
    expect(rounds).toHaveLength(7)
    for (const r of rounds) expect(r.mode).toBe('mms')
    const train = ofType(recs(V_OTM), 'UWB_MMS_TRAIN')[0]
    expect(train.responders).toEqual(ANCHORS)
    expect(uwbCapstone.observe[2].en).toContain('read its responder list')
    // three ranges a block either way, but from one round instead of three exchanges
    expect(ofType(recs(V_OTM), 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(21)
    expect(ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(15)
  })
})

describe('uwb-capstone · the one-sided error', () => {
  it('anchor-3 reads long by the brick wall’s own delay; the other two do not', () => {
    const errsOf = (peer: string) => ofType(recs(), 'UWB_RANGE')
      .filter((r) => r.node === TAG && r.peer === peer).map((r) => r.distM - r.trueDistM)
    expect(mean(errsOf('anchor-1')).toFixed(2)).toBe('-0.02')
    expect(mean(errsOf('anchor-2')).toFixed(2)).toBe('-0.00')
    expect(mean(errsOf('anchor-3')).toFixed(2)).toBe('0.60')
    // one brick wall each way, and a two-way range keeps it rather than cancelling it
    expect(UWB_NLOS_NS.brick).toBe(2)
    expect((UWB_NLOS_NS.brick * C_M_PER_NS).toFixed(2)).toBe('0.60')
    // every anchor-3 range is long: an offset, not noise
    expect(errsOf('anchor-3').every((e) => e > 0)).toBe(true)
    expect([cell(1, 0, 2), cell(1, 1, 2), cell(1, 2, 2)]).toEqual(['−0.02 m', '−0.00 m', '+0.60 m'])
    expect([cell(1, 0, 1), cell(1, 2, 1)]).toEqual(['3.99 m', '3.23 m'])
  })

  it('the quality byte flags it, and the solver ignores the byte', () => {
    const fom = (peer: string) => ofType(recs(), 'UWB_RANGE')
      .find((r) => r.node === TAG && r.peer === peer)!.fom
    expect(fom('anchor-1')).toBe(FOM_LOS)
    expect(fom('anchor-3')).toBe(FOM_NLOS)
    const deeper = (uwbCapstone.deeper ?? []).map((b) => (b as Extract<Block, { kind?: 'p' }>).text.en).join('\n')
    expect(deeper).toContain('Nothing in this simulator\'s solver reads it')
  })

  it('"three-range fix: mean error 0.55 m, worst 0.57 m, GDOP 1.25"', () => {
    const three = ofType(recs(), 'UWB_POSITION').filter((f) => f.anchors.length === 3)
    expect(three).toHaveLength(5)
    const errs = three.map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
    expect(mean(errs).toFixed(2)).toBe('0.55')
    expect(Math.max(...errs).toFixed(2)).toBe('0.57')
    expect(three[0].gdop.toFixed(2)).toBe('1.25')
    for (const f of three) {
      expect(f.node).toBe(TAG)
      expect(f.method).toBe('twr')
      expect(f.anchors).toEqual(ANCHORS)
    }
    const formula = uwbCapstone.numbers!.find((b) => b.kind === 'formula')!
    expect(formula.text.en).toBe('three-range fix: mean error 0.55 m, worst 0.57 m, GDOP 1.25')
  })
})

describe('uwb-capstone · the rubric and the sources', () => {
  it('the rubric names a decision per row and the honesty the write-up owes', () => {
    expect(table(2).rows.map((r) => r[0].en))
      .toEqual(['Anchor 3', 'Block rate', 'One round or three', 'The bias', 'Honesty'])
    expect(cell(2, 3, 1)).toContain('Names anchor-3')
    expect(cell(2, 4, 1)).toContain('States the residual it cannot explain')
  })

  it('says what is standard, what is draft and what is the flat’s own', () => {
    const src = uwbCapstone.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('600 RSTU is the shortest slot this simulator allows an MMS round')
    expect(src).toContain('Model choices in this flat')
  })
})
