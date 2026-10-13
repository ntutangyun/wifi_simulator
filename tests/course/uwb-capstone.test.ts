/**
 * Every empirical claim in "Locate the phone in this flat", measured against the
 * four scenes the brief offers.
 *
 * The lesson is a rubric, so most of what is pinned here is the four-scene table
 * and the three ranges of the base flat: the numbers the learner marks their own
 * three decisions against.
 *
 * Mechanism before metaphor (2026-09-23): the last describe pins the `steps`
 * block, which is the learner's method rather than the engine's loop. Each step
 * is held against the thing it sends the reader to — the inspector's own fix row
 * and ranges rows, replayed through the player's reducer in `inspectorAfter`, the
 * two counters of that panel, and the records the four-scene table names row by
 * row. Nothing asks for a residual: `solvePosition` computes one, no record
 * carries it and no row prints it, which is asserted rather than assumed.
 */
import { describe, it, expect } from 'vitest'
import {
  uwbCapstone, uwbCapstoneScenario, CAPSTONE_ANCHORS, FAR_ANCHOR, TAG_POS, ROUTER_POS,
  LAPTOP_POS, ANCHOR_Z, TAG_Z, WIFI_6G_CENTER_MHZ, FAST_BLOCK_RSTU,
} from '../../src/course/uwb/uwb-capstone'
import { DEFAULT_UWB_SESSION, ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { readFileSync } from 'node:fs'
import { UWB_NLOS_NS, FOM_LOS, FOM_NLOS, UWB_SIR_MIN_DB, fomText, rstuNs } from '../../src/uwb/phy'
import { azimuthFromPdoaDeg } from '../../src/uwb/aoa'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { solvePosition } from '../../src/uwb/position'
import { uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import type { Block } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

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
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
/** The four-scene table is transposed: a row is a figure and names where it is read, a column
 * is a scene. `scene(0)` is the flat as it stands, then the three variants in lesson order. */
const scene = (v: number): string[] => table(0).rows.map((r) => r[v + 1])
/** The learner's method: the `steps` block that closes `numbers`. */
const steps = (): Extract<Block, { kind: 'steps' }> => {
  const b = uwbCapstone.numbers!.at(-1)!
  if (b.kind !== 'steps') throw new Error('the method is the last block of `numbers`')
  return b
}
/** The phone's inspector after `blocks` blocks of a scene, through the player's own reducer:
 * what the learner actually sees when the method says "open the phone's inspector". */
const inspectorAfter = (variant: number | undefined, blocks: number): UwbNodeView => {
  const vs = initViewState(variant === undefined ? uwbCapstone.scenario() : uwbCapstone.variants![variant].scenario())
  const untilNs = blocks * 200 * MS + 10 * MS
  for (const r of recs(variant)) {
    if (r.t >= untilNs) break
    applyRecord(vs, r)
  }
  return vs.nodes[TAG].uwb!
}
const FOM_S = {
  fomWithin: STRINGS.uwb.fomWithin, noFom: STRINGS.uwb.noFom,
  integrityOk: STRINGS.uwb.integrityOk, integrityBad: STRINGS.uwb.integrityBad,
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
/** Every UWB node of the flat: the ranging session's own transmissions, not the router's. */
const UWB_NODES = new Set([...ANCHORS, TAG])
/** The session's own frames in one scene: how many, and how long they hold the air. */
const onAir = (variant?: number): { n: number; ms: string } => {
  const tx = ofType(recs(variant), 'TX_START').filter((r) => UWB_NODES.has(r.node))
  return { n: tx.length, ms: (tx.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS).toFixed(1) }
}
/** The three-range fixes of a scene, with the error of each. */
const threeRange = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
  .filter((f) => f.anchors.length === 3)
  .map((f) => ({ f, err: Math.hypot(f.x - f.trueX, f.y - f.trueY) }))

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(uwbCapstone, { runNs: RUN_NS })

describe('uwb-capstone · the lesson', () => {
  it('closes the UWB track: module 16, four prerequisites, two new words', () => {
    expect(uwbCapstone.id).toBe('uwb-capstone')
    expect(MODULES[uwbCapstone.module].title).toBe('测距综合实践')
    expect(uwbCapstone.needs).toEqual(['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'])
    expect(uwbCapstone.terms!.map((t) => t.term)).toEqual(['brief', 'duty cycle'])
    expect(uwbCapstone.outcomes).toHaveLength(4)
    expect(uwbCapstone.observe).toHaveLength(2)
    expect(uwbCapstone.tryThis).toHaveLength(2)
    expect(uwbCapstone.variants).toHaveLength(3)
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
      expect(got, `scene ${i}`).toEqual(want)
      expect(scene(i).slice(0, 4), `scene ${i}`).toEqual(want)
    }
  })

  it('the last two columns are what the session puts on the air, scene by scene', () => {
    // Review I1: one round for all three is NOT fewer transmissions. 44 → 294, 8.5 → 62.5 ms.
    const rows: [number | undefined, string, string][] = [
      [undefined, '44', '8.5 ms'], [V_FAR, '34', '6.5 ms'],
      [V_FAST, '81', '15.7 ms'], [V_OTM, '294', '62.5 ms'],
    ]
    for (const [i, [variant, n, ms]] of rows.entries()) {
      const air = onAir(variant)
      expect([String(air.n), `${air.ms} ms`], `scene ${i}`).toEqual([n, ms])
      expect(scene(i).slice(4), `scene ${i}`).toEqual([n, ms])
    }
    // seven times the airtime, and more receptions buried, for the same three ranges a block
    expect(onAir(V_OTM).n).toBeGreaterThan(6 * onAir(undefined).n)
    expect(count(V_OTM, 'UWB_INTERFERED')).toBeGreaterThan(count(undefined, 'UWB_INTERFERED'))
  })

  it('a three-range fix has one measurement to spare over TWO unknowns', () => {
    // Review I2: `deeper` used to say "no redundancy at all: three unknowns would be two
    // coordinates and nothing else" — self-contradictory, and the solver has two unknowns
    // (x and y; z is held at the tag's configured height, src/uwb/position.ts).
    // three ranges are the fewest the solver accepts, and it still computes a residual
    const three = ofType(recs(), 'UWB_POSITION').filter((f) => f.anchors.length === 3)
    expect(three.length).toBeGreaterThan(0)
    expect(three[0].anchors).toHaveLength(3)
    // and it agrees with uwb-position's quiz, which says the same thing
  })

  it('a faster block doubles the work and leaves the accuracy alone', () => {
    const err = (v?: number) => mean(ofType(recs(v), 'UWB_POSITION')
      .filter((f) => f.anchors.length === 3)
      .map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY)))
    expect(Math.abs(err(V_FAST) - err(undefined))).toBeLessThan(0.05)
    // twice the blocks, so about twice of everything the session costs
    expect(count(V_FAST, 'UWB_INTERFERED')).toBe(2 * count(undefined, 'UWB_INTERFERED'))
    expect(count(V_FAST, 'UWB_ROUND')).toBe(2 * count(undefined, 'UWB_ROUND'))
  })

  it('the far anchor leaves no three-range fix at all, and doubles the timeouts', () => {
    expect(ofType(recs(V_FAR), 'UWB_POSITION').every((f) => f.anchors.length === 1)).toBe(true)
    expect(ofType(recs(V_FAR), 'UWB_POSITION').every((f) => f.method === 'aoa')).toBe(true)
    expect(count(V_FAR, 'UWB_TIMEOUT')).toBe(40)
    expect(count(V_FAR, 'UWB_TIMEOUT')).toBeGreaterThan(2 * count(undefined, 'UWB_TIMEOUT') - 1)
    // anchor-3 never gets a range back through two brick walls
    expect(ofType(recs(V_FAR), 'UWB_RANGE').some((r) => r.peer === 'anchor-3')).toBe(false)
  })

  it('one round for all three is one round a block, with every anchor in it', () => {
    const rounds = ofType(recs(V_OTM), 'UWB_ROUND')
    expect(rounds).toHaveLength(7)
    for (const r of rounds) expect(r.mode).toBe('mms')
    const train = ofType(recs(V_OTM), 'UWB_MMS_TRAIN')[0]
    expect(train.responders).toEqual(ANCHORS)
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
    // the formula line's three figures are the run's own, whatever words carry them
    for (const n of [mean(errs).toFixed(2), Math.max(...errs).toFixed(2), three[0].gdop.toFixed(2)]) {
      expect(formula.text, n).toContain(n)
    }
  })

  it('the brief is closed: no scene meets half a metre, and the correction does', () => {
    // Review I2: the lesson asks for half a metre and never said whether anything delivers it.
    for (const v of [undefined, V_FAST, V_OTM]) {
      const errs = threeRange(v).map((x) => x.err)
      expect(errs.length, String(v)).toBeGreaterThan(0)
      expect(Math.max(...errs), String(v)).toBeGreaterThan(0.5)
    }
    expect(threeRange(V_FAR)).toHaveLength(0)
    // and the second experiment does deliver it: anchor-3's ranges less its own mean error
    const ranges = ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG)
    const bias = mean(ranges.filter((r) => r.peer === 'anchor-3').map((r) => r.distM - r.trueDistM))
    expect(bias.toFixed(2)).toBe('0.60')
    const block = threeRange()[0].f.block
    const inBlock = ranges.filter((r) => r.block === block)
    expect(inBlock).toHaveLength(3)
    const fix = solvePosition(
      CAPSTONE_ANCHORS.map((a) => ({ id: a.id, x: a.x, y: a.y, z: ANCHOR_Z })),
      inBlock.map((r) => ({ id: r.peer, distM: r.distM - (r.peer === 'anchor-3' ? bias : 0) })),
      TAG_Z, 0.021,
    )!
    expect(Math.hypot(fix.x - TAG_POS.x, fix.y - TAG_POS.y)).toBeLessThan(0.5)
    expect(Math.hypot(fix.x - TAG_POS.x, fix.y - TAG_POS.y).toFixed(2)).toBe('0.02')
  })
})

describe('uwb-capstone · the method the learner carries out', () => {
  it('is five steps, and it closes `numbers`', () => {
    expect(steps().items).toHaveLength(5)
    // the procedure closes the lesson: it is the last block of the main path, not of `deeper`
    expect(uwbCapstone.numbers!.at(-1)).toBe(steps())
    expect((uwbCapstone.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
  })

  it('step 1: every figure it sends the learner for is one the inspector prints', () => {
    const u = inspectorAfter(undefined, 1)
    expect(u.position, 'the phone has a fix after one block').not.toBeNull()
    const fix = uwbFixRow(u.position!, STRINGS.uwb)
    // "the latest fix, the truth and the error between them" — all three printed, and the
    // error is the distance between the other two, which is the quality figure the method uses
    const p = u.position!
    expect(fix.truth).toBe('(8.00, 4.00) m')
    expect(fix.estimate).toBe(`(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`)
    expect(fix.error).toBe(`${(Math.hypot(p.x - p.trueX, p.y - p.trueY) * 100).toFixed(1)} cm`)
    // "one row an anchor — measured, true, error, quality byte"
    const rows = uwbRangeRows(u, FOM_S)
    expect(rows.map((r) => r.peer)).toEqual(ANCHORS)
    for (const r of rows) {
      expect(Object.keys(r), r.peer).toEqual(
        expect.arrayContaining(['measured', 'trueDist', 'error', 'fom']),
      )
    }
    // and the two counters the method's figures come from are rows of that same panel
    expect([typeof u.timeouts, typeof u.interfered]).toEqual(['number', 'number'])
    expect([u.timeouts, u.interfered]).toEqual([0, 0])
  })

  it('step 2: the one-sided error is visible in the ranges table, block after block', () => {
    const errsOf = (peer: string) => ofType(recs(), 'UWB_RANGE')
      .filter((r) => r.node === TAG && r.peer === peer).map((r) => r.distM - r.trueDistM)
    // "Two stay within centimetres; one reads half a metre long every time"
    for (const peer of ['anchor-1', 'anchor-2']) {
      for (const x of errsOf(peer)) expect(Math.abs(x), peer).toBeLessThan(0.05)
    }
    for (const x of errsOf('anchor-3')) expect(x).toBeGreaterThan(0.5)
    // "and its quality byte is the worse" — as the inspector's own rows read it
    const rows = uwbRangeRows(inspectorAfter(undefined, 7), FOM_S)
    const bad = rows.find((r) => r.peer === 'anchor-3')!
    // the inspector reads the two bytes differently: anchor-3's quality string is not the
    // one the three clean ranges get, whichever words the string table uses for either
    const clean = rows.filter((r) => r.peer !== 'anchor-3')
    expect(clean).toHaveLength(2)
    for (const r of clean) expect(bad.fom, r.peer).not.toBe(r.fom)
    expect(new Set(clean.map((r) => r.fom)).size).toBe(1)
    expect(fomText(FOM_NLOS)).not.toBe(fomText(FOM_LOS))
  })

  it('step 3: the figures of the first table are records the run really carries', () => {
    const labels = table(0).rows.map((r) => r[0])
    // every row names the record or the counter it is read from, and that name exists
    const named = ['UWB_POSITION', 'UWB_TIMEOUT', 'UWB_INTERFERED', 'TX_START'] as const
    for (const t of named) {
      expect(labels.join(' '), t).toContain(t)
      expect(recs().some((r) => r.type === t), t).toBe(true)
    }
    // "load one variant from the menu, never two": the menu is the lesson's three variants
    expect(uwbCapstone.variants).toHaveLength(3)
  })

  it('step 4: the faster block doubles the air and leaves the fix error where it was', () => {
    const errOf = (v?: number) => mean(threeRange(v).map((x) => x.err))
    expect(Math.abs(errOf(V_FAST) - errOf(undefined))).toBeLessThan(0.05)
    expect(Number(onAir(V_FAST).ms) / Number(onAir(undefined).ms)).toBeGreaterThan(1.8)
  })
})

describe('uwb-capstone · the rubric and the sources', () => {
  it('the rubric names a decision per row and the honesty the write-up owes', () => {
    // The rubric used to ask for the residual. `solvePosition` computes one, no record carries
    // it and the inspector never prints it, so what the write-up quotes is the error the
    // inspector does print, against the truth it prints beside it.
    for (const t of [...uwbCapstone.numbers!, ...uwbCapstone.picture!]) {
      expect(JSON.stringify(t)).not.toContain('residual')
    }
    expect(Object.keys(ofType(recs(), 'UWB_POSITION')[0])).not.toContain('residual')
    // M1: the hedge belongs on the far-anchor row (18 → 40), not on the block rate (18 → 36)
    expect(count(V_FAST, 'UWB_TIMEOUT')).toBe(2 * count(undefined, 'UWB_TIMEOUT'))
    expect(count(V_FAR, 'UWB_TIMEOUT')).not.toBe(2 * count(undefined, 'UWB_TIMEOUT'))
  })

  it('says what is standard, what is draft and what is the flat’s own', () => {
    const src = uwbCapstone.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('P802.15.4ab')
  })
})

/**
 * The echo limit, pinned both ways.
 *
 * The entry used to assert, of the whole ranging track, that the medium delivers one direct path
 * and 「没有反射、没有回波、也没有第二条到达路径」. `scheduleEchoes` falsified the second half.
 * The structural claim the brief actually rests on is narrower and still exact: ranging reads the
 * direct arrival only, because `deliver` hands an echo to `deliverEcho`, which opens no
 * reception — so the +0.60 m the learner has to find stays a constant.
 */
describe('uwb-capstone · echoes exist, and none of the four scenes has an object to make one', () => {
  const text = uwbCapstone.limits.map((l) => l.text).join('\n')

  it('says echoes are gated on the scenario and never enter ranging', () => {
    expect(text).toContain('scheduleEchoes')
    expect(text).toContain('只在场景写了 scatterers 一节时才排回波')
    expect(text).toContain('deliverEcho')
    expect(text).toContain('测距读到的永远只是直射的那一次到达')
    // the half that is still true, and the one the brief's hardest claim rests on
    expect(text).toContain('在一串先后到达的回波里认出首径')
  })

  it('no longer claims the track has no reflections', () => {
    expect(text).not.toContain('没有反射、没有回波、也没有第二条到达路径')
    expect(text).not.toContain('整条测距轨道上，介质只投递一条直射路径')
  })

  it('and all four of its scenes carry no scatterers section, so none produces an echo', () => {
    const scenes = [uwbCapstone.scenario, ...(uwbCapstone.variants ?? []).map((v) => v.scenario)]
    expect(scenes).toHaveLength(4)
    for (const build of scenes) expect(build().scatterers).toBeUndefined()
    for (const variant of [undefined, V_FAR, V_FAST, V_OTM]) {
      expect(ofType(recs(variant), 'UWB_ECHO')).toHaveLength(0)
    }
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The two tables above are already held against the run — 「`expect(scene(i).slice(0, 4))
 * .toEqual(want)`」 — but through a literal typed on **this** side, and the prose around them is
 * not read at all. The sampling sweep of 2026-10-12 planted six of this lesson's figures and
 * **four went unnoticed**. Here every figure is parsed out of the shipped string, the tables
 * included, and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the four-scene table is read as the four runs it is, with the record its own row names.**
 *    A column is a scene (by the words of its heading, including the 「每 100 ms」 that is the
 *    variant's own block length) and a row is a figure that names where it is read — so each
 *    cell is counted with the record type printed in its own row label.
 *  - **「600 RSTU 是本仿真器允许 MMS 轮次使用的最短时隙」 is read by trying every shorter one.**
 *    Every slot from 1 to 599 RSTU is rejected by the scenario schema and 600 is accepted, which
 *    is what makes that sentence a claim about this simulator rather than a number.
 *  - **「±90° 的视场」 is measured by sweeping the estimator.** The phase difference is swept
 *    well past the array's unambiguous range and the extreme azimuths it returns are the two
 *    edges the sentence prints.
 *  - **the figures `deeper` counts are read as the solver's own arithmetic**: three ranges, two
 *    unknowns, one measurement to spare — and 「加第四个锚点」 is the anchor count plus one.
 *  - **the Chinese numerals are read too**, and in this lesson they carry half the claims:
 *    「两个房间」、「三个距离、三个方位」、「四个场景，七个块」、「一串片段，三个名字」.
 */
describe('uwb-capstone · every figure the prose prints, read back out of it', () => {
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
  const WHY = [uwbCapstone.why!, ...uwbCapstone.outcomes!].join('\n')
  const PIC = blockText(uwbCapstone.picture)
  const NUMS = blockText(uwbCapstone.numbers)
  const DEEP = blockText(uwbCapstone.deeper)
  const LIM = blockText(uwbCapstone.limits)
  const SRC = blockText(uwbCapstone.sources)
  const OBS = blockText(uwbCapstone.observe)
  const TRY = blockText(uwbCapstone.tryThis)
  const QUIZ = blockText(uwbCapstone.quiz)

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
  /** 「两」「三」「七」「十四」, and 「半」 for the half metre the brief asks for. */
  const cn = (s: string): number => {
    if (s === '半') return 0.5
    const d = (c: string): number => '零一二三四五六七八九'.indexOf(c === '两' ? '二' : c)
    const i = s.indexOf('十')
    if (i < 0) return d(s)
    return (i === 0 ? 1 : d(s.slice(0, i))) * 10 + (i === s.length - 1 ? 0 : d(s.slice(i + 1)))
  }
  const SCENES = [undefined, V_FAR, V_FAST, V_OTM]
  const fixesOf = (v?: number) => ofType(recs(v), 'UWB_POSITION')
  const tagRanges = (v?: number) => ofType(recs(v), 'UWB_RANGE').filter((r) => r.node === TAG)
  const errsOf = (peer: string) => tagRanges().filter((r) => r.peer === peer)
    .map((r) => r.distM - r.trueDistM)
  /** The scene a column of the four-scene table is about, by the words of its own heading. */
  const sceneOf = (head: string): number | undefined => {
    if (head.includes('现状')) return undefined
    if (head.includes('挪远')) return V_FAR
    if (head.includes('一个块')) return V_FAST
    if (head.includes('一轮')) return V_OTM
    throw new Error(`no scene for the column 「${head}」`)
  }

  it('reads the flat, and the half metre the brief asks for', () => {
    // 「两个房间，中间夹着一条走廊，隔断全是砖」
    const sc = uwbCapstone.scenario()
    const [roomsCn, hallsCn] = raw(PIC, /(.)个房间，中间夹着(.)条走廊/, '`picture` on the flat')
    const halls = sc.rooms.filter((r) => r.name.includes('Hallway'))
    expect(sc.rooms.length - halls.length, 'the rooms this flat really has').toBe(cn(roomsCn!))
    expect(halls.length, 'and the hallway between them').toBe(cn(hallsCn!))
    // 「它对面的墙上已经装了两个锚点，一头一个，第三个立在走廊里」
    const [pairCn, thirdCn] = raw(PIC, /已经装了(.)个锚点，一头一个，第(.)个立在走廊里/,
      '`picture` on where the anchors are')
    const inRoomB = CAPSTONE_ANCHORS.filter((a) => a.x > TAG_POS.x - 2)
    expect(inRoomB.length, 'the anchors beside the phone').toBe(cn(pairCn!))
    expect(cn(thirdCn!), 'and the one across the hallway wall, which is the last of them')
      .toBe(CAPSTONE_ANCHORS.length)
    expect(CAPSTONE_ANCHORS.filter((a) => !inRoomB.includes(a)).map((a) => a.id),
      'and it is anchor-3').toEqual(['anchor-3'])
    /*
     * 「把手机定位到半米以内」 — the brief, printed in `why`, in `picture` and again in the
     * method's last step. It is read as the figure it is: half a metre, against the worst
     * three-range fix of the flat as it stands, which does not meet it.
     */
    for (const [text, re, what] of [
      [WHY, /把一部手机定位到(.)米以内/, '`why` on the brief'],
      [PIC, /把手机定位到(.)米以内/, '`picture` on the brief'],
      [blockText(steps()), /能把每一次定位都压在(.)米以内/, 'the method on the brief'],
    ] as [string, RegExp, string][]) {
      const metres = cn(raw(text, re, what)[0]!)
      expect(Math.max(...threeRange().map((x) => x.err)), `${what}: and the flat misses it`)
        .toBeGreaterThan(metres)
    }
  })

  it('reads the four-scene table as the four runs it is, by the record each row names', () => {
    const tb = table(0)
    // 「四个场景，七个块」
    const [scenesCn, blocksCn] = raw(tb.heading!, /(.)个场景，(.)个块/, 'the table’s own heading')
    expect(cn(scenesCn!), 'the scenes the brief offers').toBe(1 + uwbCapstone.variants!.length)
    expect(cn(blocksCn!), 'and the blocks this window holds')
      .toBe(count(undefined, 'UWB_ROUND'))
    // 「每 100 ms 一个块」 — the column heading carries the variant's own block length
    const [fastMs] = figs(tb.head.join('\n'), /每 (\d+) ms 一个块/, 'the fast column’s heading')
    expect(fastMs! * MS, 'the block that variant really runs').toBe(rstuNs(FAST_BLOCK_RSTU))
    // 「一轮问遍三个」
    const [askCn] = raw(tb.head.join('\n'), /一轮问遍(.)个/, 'the one-round column’s heading')
    expect(cn(askCn!), 'the anchors one round really asks').toBe(ANCHORS.length)
    for (const [c, head] of tb.head.slice(1).entries()) {
      const v = sceneOf(head)
      for (const row of tb.rows) {
        const label = row[0]!
        const printed = row[c + 1]!
        const named = /(UWB_[A-Z]+|TX_START)/.exec(label)?.[1]
        if (named) {
          expect(recs().some((r) => r.type === named), `${named} is a record the flat carries`)
            .toBe(true)
        }
        if (label.includes('空口时间')) {
          expect(printed, `${label} · ${head}`).toBe(`${onAir(v).ms} ms`)
        } else if (label.includes('发射次数')) {
          // 「手机与三个锚点的 TX_START」 — the session's own frames, not the router's
          expect(cn(raw(label, /手机与(.)个锚点/, 'the row’s own label')[0]!),
            'the anchors it counts').toBe(ANCHORS.length)
          expect(val(printed), `${label} · ${head}`).toBe(onAir(v).n)
        } else if (label.includes('三距离交汇')) {
          const [threeCn] = raw(label, /记录里写着(.)个锚点的那些/, 'the row’s own label')
          expect(val(printed), `${label} · ${head}`)
            .toBe(fixesOf(v).filter((f) => f.anchors.length === cn(threeCn!)).length)
          expect(cn(threeCn!), 'and that is every anchor of the flat').toBe(ANCHORS.length)
        } else {
          expect(val(printed), `${label} · ${head}`).toBe(count(v, named as TLRecord['type']))
        }
      }
    }
    // 「每一列都是同一个 1300 ms 窗口」
    const [windowMs] = figs(NUMS, /每一列都是同一个 (\d+) ms 窗口/, 'the paragraph on the window')
    expect(windowMs! * MS, 'the window every column is counted over').toBe(RUN_NS)
    // 「凡不是三距离交汇的定位，都是某一个锚点单独测出的方位」
    for (const v of SCENES) {
      for (const f of fixesOf(v)) {
        if (f.anchors.length === ANCHORS.length) continue
        expect([f.anchors.length, f.method], `a lone fix of scene ${String(v)}`).toEqual([1, 'aoa'])
      }
    }
  })

  it('reads the ranges table, the formula and the brick wall behind the bias', () => {
    const tb = table(1)
    for (const row of tb.rows) {
      const [peer, trueM, errM, cause] = row as [string, string, string, string]
      const mine = tagRanges().filter((r) => r.peer === peer)
      expect(mine.length, `${peer} is a peer this run ranges to`).toBeGreaterThan(0)
      same(trueM.replace(' m', ''), mean(mine.map((r) => r.trueDistM)), `${peer}: the true distance`)
      same(errM.replace(' m', ''), mean(mine.map((r) => r.distM - r.trueDistM)),
        `${peer}: the mean error`)
      const nlos = cause.includes('砖墙')
      expect(mine[0]!.fom, `${peer}: the quality byte its cause implies`)
        .toBe(nlos ? FOM_NLOS : FOM_LOS)
      if (nlos) {
        expect(mine.every((r) => r.distM > r.trueDistM), `${peer}: every range of it reads long`)
          .toBe(true)
      }
    }
    /*
     * 「砖 2.0 ns」 — `limits` names the table the delay comes from, and the +0.60 m of the
     * ranges table is that delay in metres. Both are read, and the second from the first.
     */
    const [brickNs] = figs(LIM, /砖 ([\d.]+) ns/, '`limits` on the brick wall')
    expect(brickNs, 'the delay this engine charges a brick wall').toBe(UWB_NLOS_NS.brick)
    const [limBias] = figs(LIM, /那 \+([\d.]+) m 是一个定数/, '`limits` on the bias')
    same(String(limBias), brickNs! * C_M_PER_NS, 'the brick delay, in metres')
    same(String(limBias), mean(errsOf('anchor-3')), 'and the bias every block really carries')
    // 「平均误差 0.55 m，最差 0.57 m，GDOP 1.25」
    const formula = uwbCapstone.numbers!.find((b) => b.kind === 'formula') as unknown as
      { text: string; note: string }
    const [meanM, worstM, gdop] = figs(formula.text,
      /平均误差 ([\d.]+) m，最差 ([\d.]+) m，GDOP ([\d.]+)/, 'the formula line')
    const three = threeRange()
    same(String(meanM), mean(three.map((x) => x.err)), 'the mean error of a three-range fix')
    same(String(worstM), Math.max(...three.map((x) => x.err)), 'the worst of them')
    same(String(gdop), three[0]!.f.gdop, 'and the geometry’s own figure')
    // 「离散度极小」 — the note's own claim about the five of them
    expect(Math.max(...three.map((x) => x.err)) - Math.min(...three.map((x) => x.err)),
      'the spread the note calls very small').toBeLessThan(0.05)
  })

  it('reads 「有谁达到要求了吗」 and the correction that does meet the brief', () => {
    const [offsetM] = figs(NUMS, /光那个偏移就有 ([\d.]+) m/, 'the paragraph on the offset')
    const [halfCn] = raw(NUMS, /压在(.)米以内/, 'the paragraph on the brief')
    const [leftM] = figs(NUMS, /这个块就只差 ([\d.]+) m/, 'the paragraph on the corrected block')
    const bias = mean(errsOf('anchor-3'))
    same(String(offsetM), bias, 'the offset anchor-3 carries')
    expect(offsetM, 'which alone is more than the brief allows').toBeGreaterThan(cn(halfCn!))
    // 「没有哪个场景能把每一次定位都压在半米以内」
    for (const v of SCENES) {
      const errs = threeRange(v).map((x) => x.err)
      if (errs.length === 0) continue
      expect(Math.max(...errs), `scene ${String(v)} misses the brief`).toBeGreaterThan(cn(halfCn!))
    }
    // 「把这份偏移从 anchor-3 的距离里扣掉、再解一次，这个块就只差 0.02 m」
    const block = threeRange()[0]!.f.block
    const inBlock = tagRanges().filter((r) => r.block === block)
    expect(inBlock, 'the three ranges of that block').toHaveLength(ANCHORS.length)
    const fix = solvePosition(
      CAPSTONE_ANCHORS.map((a) => ({ id: a.id, x: a.x, y: a.y, z: ANCHOR_Z })),
      inBlock.map((r) => ({ id: r.peer, distM: r.distM - (r.peer === 'anchor-3' ? bias : 0) })),
      TAG_Z, 0.021,
    )!
    same(String(leftM), Math.hypot(fix.x - TAG_POS.x, fix.y - TAG_POS.y),
      'what the corrected block really leaves')
    expect(leftM, 'which does meet the brief').toBeLessThan(cn(halfCn!))
  })

  it('reads `deeper`: three ranges, two unknowns, one to spare, and a fourth anchor', () => {
    // 「在三个距离上做最小二乘，只比两个未知量——地面上的两个坐标…多出一个测量」
    const [rangesCn, unknownsCn, coordsCn] = raw(DEEP,
      /在(.)个距离上做最小二乘，只比(.)个未知量——地面上的(.)个坐标/, '`deeper` on the fit')
    expect(cn(rangesCn!), 'the ranges a three-range fix is made of').toBe(ANCHORS.length)
    expect(cn(unknownsCn!), 'and the unknowns the solver really has').toBe(cn(coordsCn!))
    /*
     * The two unknowns, measured: the solver takes the tag's z as an argument and refuses a
     * third range's worth of redundancy — three ranges are the fewest it will answer, and two
     * leave it with nothing to answer from.
     */
    const anchorsIn = CAPSTONE_ANCHORS.map((a) => ({ id: a.id, x: a.x, y: a.y, z: ANCHOR_Z }))
    const block = threeRange()[0]!.f.block
    const inBlock = tagRanges().filter((r) => r.block === block)
      .map((r) => ({ id: r.peer, distM: r.distM }))
    expect(solvePosition(anchorsIn, inBlock.slice(0, cn(unknownsCn!)), TAG_Z, 0.021),
      'two ranges are not enough for two unknowns').toBeNull()
    expect(solvePosition(anchorsIn, inBlock, TAG_Z, 0.021),
      'and three are the fewest it answers').not.toBeNull()
    expect(inBlock.length - cn(unknownsCn!), '「多出一个测量」').toBe(1)
    // 「要让解算器察觉到这一点，最便宜的办法就是加第四个锚点」, and `tryThis` says it again
    for (const [text, what] of [[DEEP, '`deeper`'], [TRY, '`tryThis`']] as [string, string][]) {
      const [nth] = raw(text, /第(.)个锚点/, `${what} on the extra anchor`)
      expect(cn(nth!), `${what}: one more than the flat has`).toBe(ANCHORS.length + 1)
    }
    /*
     * 「日志里每一个距离都带着一个品质因数…本仿真器的解算器完全没有去读它」 — read off the
     * solver's own signature: the records carry a `fom`, and what `solvePosition` accepts does
     * not have a field for one.
     */
    const POS_SRC = readFileSync(new URL('../../src/uwb/position.ts', import.meta.url), 'utf8')
    const [accepts] = raw(POS_SRC, /solvePosition\(\s*\n\s*anchors: AnchorPos\[\],\s*\n\s*ranges: \{([^}]*)\}/,
      'what the solver accepts')
    expect(accepts!.includes('fom'), 'the solver has no field for a quality byte').toBe(false)
    for (const r of tagRanges()) expect(typeof r.fom, 'while every range carries one').toBe('number')
    expect(tagRanges().find((r) => r.peer === 'anchor-3')!.fom, 'and the obstructed one is worse')
      .not.toBe(tagRanges().find((r) => r.peer === 'anchor-1')!.fom)
  })

  it('reads `sources`: the profile, the shortest slot, the noise and the threshold', () => {
    // 「200 ms 的测距块与 2 ms 的测距时隙来自 FiRa 的配置文件」
    const [blockMs, slotMs] = figs(SRC, /(\d+) ms 的测距块与 (\d+) ms 的测距时隙来自 FiRa/,
      '`sources` on the profile')
    expect(blockMs! * MS, 'the block this flat really runs').toBe(rstuNs(DEFAULT_UWB_SESSION.blockRstu))
    expect(slotMs! * MS, 'and the slot').toBe(rstuNs(DEFAULT_UWB_SESSION.slotRstu))
    expect(rstuNs(uwbCapstone.scenario().uwb!.blockRstu), 'which is the scene’s own block')
      .toBe(blockMs! * MS)
    /*
     * 「600 RSTU 是本仿真器允许 MMS 轮次使用的最短时隙，因为两个时隙必须装得下这一轮里最长的
     * 那条窄带消息」 — read by trying every shorter slot: the schema rejects all of them.
     */
    const [shortest, slotsCn] = raw(SRC,
      /(\d+) RSTU 是本仿真器允许 MMS 轮次使用的最短时隙，因为(.)个时隙必须装得下/,
      '`sources` on the shortest slot')
    const otm = uwbCapstone.variants![V_OTM]!.scenario()
    expect(otm.uwb!.slotRstu, 'the slot that variant really runs').toBe(val(shortest!))
    const parses = (s: number): boolean => {
      const sc = uwbCapstone.variants![V_OTM]!.scenario()
      sc.uwb!.slotRstu = s
      return ScenarioSchema.safeParse(sc).success
    }
    expect(parses(val(shortest!)), 'and the schema does accept it').toBe(true)
    const shorter = Array.from({ length: val(shortest!) - 1 }, (_, i) => i + 1).filter(parses)
    expect(shorter, 'while every shorter slot is refused').toEqual([])
    // and the rule the sentence gives: the capacity the engine checks is two slots' worth
    const SC_SRC = readFileSync(new URL('../../src/model/scenario.ts', import.meta.url), 'utf8')
    const [factor] = figs(SC_SRC, /RSTU 的时隙合起来是 \$\{\((\d) \* slotNs/, 'the engine’s own rule')
    expect(factor, 'the slots that rule adds up').toBe(cn(slotsCn!))
    // 「每个时间戳 100 ps 的 1σ 噪声」 and 「−12 dB 信干比门限」
    const [noisePs] = figs(SRC, /每个时间戳 (\d+) ps 的 1σ 噪声/, '`sources` on the timestamp noise')
    expect(noisePs, 'the noise this session really carries')
      .toBe(uwbCapstone.scenario().uwb!.tsNoisePs)
    const [sirDb] = figs(SRC, /打掉的 (−?\d+) dB 信干比门限/, '`sources` on the threshold')
    expect(sirDb, 'the threshold the engine really uses').toBe(UWB_SIR_MIN_DB)
    /*
     * 「它 ±90° 的视场」 — swept rather than quoted: the phase difference is pushed well past
     * the array's unambiguous range, and the two extremes the estimator returns are the edges.
     */
    const [fov] = figs(SRC, /以及它 ±(\d+)° 的视场/, '`sources` on the field of view')
    const swept: number[] = []
    for (let phi = -6; phi <= 6; phi += 0.01) swept.push(azimuthFromPdoaDeg(phi, 5))
    expect([Math.min(...swept), Math.max(...swept)], 'the azimuths this estimator can return')
      .toEqual([-fov!, fov!])
  })

  it('reads the anchor the brief moves, and the draft it names twice', () => {
    /*
     * **Three figures got past the reads above** (sweep of 2026-10-14), and two of them are the
     * same anchor's number: 「锚点 3 挪远」 in the table's own column heading and 「把锚点 3 挪到
     * 另一个房间」 in the quiz. Read as what they name: the one node this variant moves.
     */
    const base = uwbCapstone.scenario()
    const far = uwbCapstone.variants![V_FAR]!.scenario()
    const movedIds = base.nodes
      .filter((n, i) => JSON.stringify(n.pos) !== JSON.stringify(far.nodes[i]!.pos))
      .map((n) => n.id)
    for (const [text, re, what] of [
      [table(0).head.join('\n'), /锚点 (\d) 挪远/, 'the column heading'],
      [QUIZ, /把锚点 (\d) 挪到另一个房间/, 'the quiz'],
    ] as [string, RegExp, string][]) {
      const [n] = figs(text, re, what)
      expect(movedIds, `${what}: the only node this variant moves`).toEqual([`anchor-${n}`])
    }
    /*
     * 「见 P802.15.4ab（4ab 草案 15-22/0381r5 …）」 — the draft is named in full and then by its
     * short name in the same breath, so the short name is read as what it is: the tail of the
     * full one. No corpus ships with this repo, which is why this is all there is to check
     * (class (a)); `tests/course/doc-citations.test.ts` covers the document number itself.
     */
    const [full, short] = raw(SRC, /见 (P802\.15\.(\dab))（\dab 草案 \d\d-\d\d\/\d+r\d/,
      '`sources` on the draft')
    expect(full!.endsWith(short!), 'the short name is the tail of the full one').toBe(true)
    const [again] = raw(SRC, /（(\dab) 草案/, '`sources` on the same draft, named again')
    expect(again, 'and the two spellings agree').toBe(short)
  })

  it('reads `observe`, `tryThis`, the rubric and the quiz', () => {
    // 「三个距离、三个方位、一次三锚点定位」
    const [rangesCn, aoaCn, fixCn] = raw(OBS, /(.)个距离、(.)个方位、一次(.)锚点定位/,
      '`observe` on one block')
    const block = threeRange()[0]!.f.block
    expect(tagRanges().filter((r) => r.block === block).length, 'the ranges one block gives')
      .toBe(cn(rangesCn!))
    const bearings = new Set(ofType(recs(), 'UWB_AOA').filter((r) => r.block === block)
      .map((r) => r.node))
    expect(bearings.size, 'the anchors that report a bearing in it').toBe(cn(aoaCn!))
    expect(threeRange()[0]!.f.anchors.length, 'and the fix it ends in').toBe(cn(fixCn!))
    // 「一串片段，三个名字」
    const [namesCn] = raw(OBS, /一串片段，(.)个名字/, '`observe` on the train')
    const train = ofType(recs(V_OTM), 'UWB_MMS_TRAIN')[0]!
    expect(train.responders!.length, 'the responders one train really names').toBe(cn(namesCn!))
    expect(train.responders, 'and they are the three anchors').toEqual(ANCHORS)
    // 「先把三个决定写下来」 and 「把四个场景都跑一遍」
    const [decisionsCn] = raw(TRY, /先把(.)个决定写下来/, '`tryThis` on the decisions')
    expect(uwbCapstone.variants!.length, 'the decisions the brief offers').toBe(cn(decisionsCn!))
    const [allCn] = raw(TRY, /把(.)个场景都跑一遍/, '`tryThis` on the scenes')
    expect(1 + uwbCapstone.variants!.length, 'and the scenes they make').toBe(cn(allCn!))
    /*
     * 「定位次数少了一半，超时翻了一倍」 — the quiz's own explanation of the far anchor, read as
     * the two ratios it claims: the fixes really halve, exactly, and the timeouts more than
     * double.
     */
    const [halfCn, doubleCn] = raw(QUIZ, /定位次数少了一(.)，超时翻了一(.)/, 'the quiz on the far anchor')
    expect(halfCn, 'the lesson says 「一半」').toBe('半')
    expect(fixesOf(V_FAR).length * 2, 'and the fixes really halve').toBe(fixesOf(undefined).length)
    expect(doubleCn, 'and 「一倍」').toBe('倍')
    expect(count(V_FAR, 'UWB_TIMEOUT'), 'while the timeouts more than double')
      .toBeGreaterThanOrEqual(2 * count(undefined, 'UWB_TIMEOUT'))
    /*
     * 「超时数和被 Wi-Fi 打掉的接收都恰好翻倍；定位次数与空口占用则差一点」 — the rubric's own
     * row, and the reason it cannot be exact is read too: the window holds fourteen blocks, and
     * the fourteenth starts at the very instant the window closes.
     */
    const rubric = table(2).rows.find((r) => r[0]!.includes('节奏'))![1]!
    expect(count(V_FAST, 'UWB_TIMEOUT'), 'the timeouts a faster block really doubles')
      .toBe(2 * count(undefined, 'UWB_TIMEOUT'))
    expect(count(V_FAST, 'UWB_INTERFERED'), 'and the receptions Wi-Fi really buries')
      .toBe(2 * count(undefined, 'UWB_INTERFERED'))
    expect(rubric, 'the row says those two are exact').toContain('恰好翻倍')
    const [lastCn] = raw(rubric, /第(..)个块正好起在窗口末尾那一刻/, 'the rubric on the last block')
    const rounds = ofType(recs(V_FAST), 'UWB_ROUND')
    expect(rounds.length, 'the blocks the faster rhythm really starts').toBe(cn(lastCn!))
    expect(rounds.at(-1)!.t, 'and the last of them starts as the window closes').toBe(RUN_NS)
    const lastFrames = ofType(recs(V_FAST), 'TX_START')
      .filter((r) => UWB_NODES.has(r.node) && r.t >= rounds.at(-1)!.t)
    const [frameCn] = raw(rubric, /只发出了(.)帧/, 'the rubric on what it managed')
    expect(lastFrames.length, 'so it manages exactly that many frames').toBe(cn(frameCn!))
    expect(Number(onAir(V_FAST).ms) / Number(onAir(undefined).ms),
      'which is why the airtime is not exactly twice').toBeLessThan(2)
  })
})
