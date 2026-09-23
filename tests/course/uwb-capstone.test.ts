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
import { UWB_NLOS_NS, FOM_LOS, FOM_NLOS, fomText, rstuNs } from '../../src/uwb/phy'
import { C_M_PER_NS } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { solvePosition } from '../../src/uwb/position'
import { uwbFixRow, uwbRangeRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
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
/** The four-scene table is transposed: a row is a figure and names where it is read, a column
 * is a scene. `scene(0)` is the flat as it stands, then the three variants in lesson order. */
const scene = (v: number): string[] => table(0).rows.map((r) => r[v + 1].en)
/** The learner's method: the `steps` block that closes `numbers`. */
const steps = (): Extract<Block, { kind: 'steps' }> => {
  const b = uwbCapstone.numbers!.at(-1)!
  if (b.kind !== 'steps') throw new Error('the method is the last block of `numbers`')
  return b
}
const stepText = (): string => steps().items.map((i) => i.en).join(' · ')
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
  fomWithin: STRINGS.en.uwb.fomWithin, noFom: STRINGS.en.uwb.noFom,
  integrityOk: STRINGS.en.uwb.integrityOk, integrityBad: STRINGS.en.uwb.integrityBad,
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
lessonShapeSuite(uwbCapstone, { proseMax: 1185, runNs: RUN_NS })

describe('uwb-capstone · the lesson', () => {
  it('closes the UWB track: module 16, four prerequisites, two new words', () => {
    expect(uwbCapstone.id).toBe('uwb-capstone')
    expect(uwbCapstone.module).toBe(16)
    expect(uwbCapstone.needs).toEqual(['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'])
    expect(uwbCapstone.terms!.map((t) => t.term)).toEqual(['brief', 'duty cycle'])
    expect(uwbCapstone.outcomes).toHaveLength(4)
    expect(uwbCapstone.observe).toHaveLength(2)
    expect(uwbCapstone.tryThis).toHaveLength(2)
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
    const picture = uwbCapstone.picture!.map((b) => (b as { text?: { en: string } }).text?.en ?? '').join('\n')
    expect(picture).toContain('bought with far more time on the air')
    expect(picture).toContain('The variant drops the bearings too')
    expect(picture).not.toContain('fewer transmissions')
    expect(cell(2, 2, 1)).toContain('far more transmissions and airtime')
    expect(cell(2, 2, 1)).toContain('drops the bearings')
  })

  it('a lost fragment is one receiver’s loss, and `deeper` is where that is said', () => {
    // Review I1: the rubric used to claim all three anchors suffer together when a fragment
    // is lost. Loss is decided per receiver, per fragment (tests/uwb/mms-one-to-many.test.ts).
    const deeper = (uwbCapstone.deeper ?? []).map((b) => (b as { text: { en: string } }).text.en).join('\n')
    expect(deeper).toContain('A fragment is lost at one receiver and nowhere else')
    expect(deeper).toContain('the Poll that opens the round, or the phone’s own busy check')
    for (const s of [cell(2, 2, 1), ...uwbCapstone.picture!.map((b) => (b as { text?: { en: string } }).text?.en ?? '')]) {
      expect(s).not.toContain('all three then suffer together')
      expect(s).not.toContain('costs every anchor at once')
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
    expect(cell(2, 0, 1)).toContain('halves the fixes, roughly doubles the timeouts and leaves no three-range fix')
  })

  it('one round for all three is one round a block, with every anchor in it', () => {
    const rounds = ofType(recs(V_OTM), 'UWB_ROUND')
    expect(rounds).toHaveLength(7)
    for (const r of rounds) expect(r.mode).toBe('mms')
    const train = ofType(recs(V_OTM), 'UWB_MMS_TRAIN')[0]
    expect(train.responders).toEqual(ANCHORS)
    expect(uwbCapstone.observe[1].en).toContain('read its responder list')
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
    const brief = uwbCapstone.numbers!.find((b): b is Extract<Block, { kind?: 'p' }> =>
      (b.kind ?? 'p') === 'p' && b.heading?.en === 'Does anything meet the brief?')!
    expect(brief.text.en).toContain('no scene keeps every fix inside half a metre')
    expect(brief.text.en).toContain('the block lands 0.02 m out')
    expect(cell(2, 4, 0)).toBe('The brief')
    expect(cell(2, 4, 1)).toContain('no scene meets half a metre as it stands')
    expect(stepText()).toContain('does any scene keep every fix inside half a metre?')
  })
})

describe('uwb-capstone · the method the learner carries out', () => {
  it('is five steps, and it closes `numbers`', () => {
    expect(steps().items).toHaveLength(5)
    expect(steps().heading!.en).toBe('The method, step by step')
    // the procedure closes the lesson: it is the last block of the main path, not of `deeper`
    expect(uwbCapstone.numbers!.at(-1)).toBe(steps())
    expect((uwbCapstone.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
  })

  it('step 1: every figure it sends the learner for is one the inspector prints', () => {
    const u = inspectorAfter(undefined, 1)
    expect(u.position, 'the phone has a fix after one block').not.toBeNull()
    const fix = uwbFixRow(u.position!, STRINGS.en.uwb)
    // "the latest fix, the truth and the error between them" — all three printed, and the
    // error is the distance between the other two, which is the quality figure the method uses
    const p = u.position!
    expect(fix.truth).toBe('(8.00, 4.00) m')
    expect(fix.estimate).toBe(`(${p.x.toFixed(2)}, ${p.y.toFixed(2)}) m`)
    expect(fix.error).toBe(`${(Math.hypot(p.x - p.trueX, p.y - p.trueY) * 100).toFixed(1)} cm`)
    expect(stepText()).toContain('prints the latest fix, the truth and the error between them')
    // "one row an anchor — measured, true, error, quality byte"
    const rows = uwbRangeRows(u, FOM_S)
    expect(rows.map((r) => r.peer)).toEqual(ANCHORS)
    for (const r of rows) {
      expect(Object.keys(r), r.peer).toEqual(
        expect.arrayContaining(['measured', 'trueDist', 'error', 'fom']),
      )
    }
    expect(stepText()).toContain('one row an anchor — measured, true, error, quality byte')
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
    expect(bad.fom).toBe(fomText(FOM_NLOS))
    for (const r of rows.filter((r) => r.peer !== 'anchor-3')) {
      expect(r.fom, r.peer).toBe(fomText(FOM_LOS))
    }
    expect(fomText(FOM_NLOS)).not.toBe(fomText(FOM_LOS))
    expect(stepText()).toContain('one reads half a metre long every time, and its quality byte is the worse')
  })

  it('step 3: the figures of the first table are records the run really carries', () => {
    const labels = table(0).rows.map((r) => r[0].en)
    expect(labels.map((l) => l.split(' — ')[0]))
      .toEqual(['Fixes', 'Of them, three-range', 'Timeouts', 'Lost to Wi-Fi', 'Transmissions', 'Air'])
    // every row names the record or the counter it is read from, and that name exists
    const named = ['UWB_POSITION', 'UWB_TIMEOUT', 'UWB_INTERFERED', 'TX_START'] as const
    for (const t of named) {
      expect(labels.join(' '), t).toContain(t)
      expect(recs().some((r) => r.type === t), t).toBe(true)
    }
    // "load one variant from the menu, never two": the menu is the lesson's three variants
    expect(stepText()).toContain('load one variant from the menu, never two')
    expect(uwbCapstone.variants).toHaveLength(3)
  })

  it('step 4: the faster block doubles the air and leaves the fix error where it was', () => {
    const errOf = (v?: number) => mean(threeRange(v).map((x) => x.err))
    expect(Math.abs(errOf(V_FAST) - errOf(undefined))).toBeLessThan(0.05)
    expect(Number(onAir(V_FAST).ms) / Number(onAir(undefined).ms)).toBeGreaterThan(1.8)
    expect(stepText()).toContain('doubling the air while the fix error stays put buys smoothness, not accuracy')
  })
})

describe('uwb-capstone · the rubric and the sources', () => {
  it('the rubric names a decision per row and the honesty the write-up owes', () => {
    expect(table(2).rows.map((r) => r[0].en))
      .toEqual(['Anchor 3', 'Block rate', 'One round or three', 'The bias', 'The brief'])
    expect(cell(2, 3, 1)).toContain('Names anchor-3')
    // The rubric used to ask for the residual. `solvePosition` computes one, no record carries
    // it and the inspector never prints it, so what the write-up quotes is the error the
    // inspector does print, against the truth it prints beside it.
    expect(cell(2, 4, 1)).toContain('quotes the error the inspector prints')
    for (const t of [...uwbCapstone.numbers!, ...uwbCapstone.picture!]) {
      expect(JSON.stringify(t)).not.toContain('residual')
    }
    expect(Object.keys(ofType(recs(), 'UWB_POSITION')[0])).not.toContain('residual')
    // M1: the hedge belongs on the far-anchor row (18 → 40), not on the block rate (18 → 36)
    expect(cell(2, 0, 1)).toContain('roughly doubles the timeouts')
    expect(cell(2, 1, 1)).toContain('all double exactly')
    expect(count(V_FAST, 'UWB_TIMEOUT')).toBe(2 * count(undefined, 'UWB_TIMEOUT'))
    expect(count(V_FAR, 'UWB_TIMEOUT')).not.toBe(2 * count(undefined, 'UWB_TIMEOUT'))
  })

  it('says what is standard, what is draft and what is the flat’s own', () => {
    const src = uwbCapstone.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('600 RSTU is the shortest slot this simulator allows an MMS round')
    expect(src).toContain('Model choices in this flat')
  })
})
