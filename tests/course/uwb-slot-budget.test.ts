/**
 * `@uwb-slot-budget`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites and the figures it states against the engine's constants;
 * ② row by row against the engine (the slot-fit rule, the 200 ns guard, aTurnaroundTime — the
 * 300 RSTU floor is gone since 2026-11-11, W2b — the editor's clamp, the receiver enabled only for an expected frame, the 127-octet cap on the Final);
 * ③ by reading every figure each lab prints back out of the lesson text and comparing it with a run
 * of the scene this lesson shares with `uwb-blocks`.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbSlotBudget, uwbSlotBudgetTiming } from '../../src/course/uwb/uwb-slot-budget'
import { FIG as GRID, uwbBlocksScenario } from '../../src/course/uwb/uwb-blocks'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { MODULES } from '../../src/course/curriculum'
import { clampField } from '../../src/editor/planOps'
import { uwbSessionRepair, uwbSlotFloorRstu } from '../../src/uwb/ui/UwbSessionFields'
import { roundPlan } from '../../src/uwb/session'
import {
  RSTU_CHIPS, UWB_SLOT_GUARD_NS, UWB_TURNAROUND_NS, rstuNs, uwbFinalBytes, uwbMaxAnchors, uwbPpduNs, uwbSlotFitNs,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 300 * MS
const ANCHORS = 4
const TAGS = ['uwb-1', 'uwb-2', 'uwb-3']

const SESSION = uwbSlotBudget.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)
const VPLAN = roundPlan(uwbSlotBudget.variants![0].scenario().uwb!, ANCHORS)
const recs = (variant?: number): TLRecord[] => runOf(uwbSlotBudget, variant, RUN_NS)

// `sameSceneAs`: this lesson loads uwb-blocks' scene AND its one variant, so its recorded hashes
// are that lesson's, value for value.
lessonShapeSuite(uwbSlotBudget, { runNs: RUN_NS, sameSceneAs: 'uwb-blocks' })

const grp = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')

/** Nanoseconds a node's radio spends out of `idle` inside [fromNs, untilNs), off the MAC_STATE lane. */
function radioOnNs(rs: TLRecord[], node: string, untilNs: number, fromNs = 0): number {
  let state: string = 'idle'
  let since = fromNs
  let on = 0
  for (const r of ofType(rs, 'MAC_STATE')) {
    if (r.node !== node || r.t >= untilNs || r.t < fromNs) continue
    if (state !== 'idle') on += r.t - since
    state = r.state
    since = r.t
  }
  if (state !== 'idle') on += untilNs - since
  return on
}

function schemaIssues(slotRstu: number): string[] {
  const parsed = ScenarioSchema.safeParse(uwbBlocksScenario(slotRstu))
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

const lab = (heading: string): Lab => {
  const l = uwbSlotBudget.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind'] & string>(l: Lab, kind: K): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind)
  expect(b, `${kind} in 「${l.heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbSlotBudget.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const num = (s: string, re: RegExp, what: string): number => {
  const m = re.exec(s)
  expect(m, `${what}: 「${re.source}」 not found`).not.toBeNull()
  return Number(m![1]!.replace(/\s/g, ''))
}
const stdText = (): string => uwbSlotBudget.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-slot-budget · the lesson', () => {
  it('is in the standard-first shape, in the sessions module, after uwb-blocks', () => {
    expect(isStandardFirst(uwbSlotBudget)).toBe(true)
    expect(MODULES[uwbSlotBudget.module].title).toBe('会话网格')
    expect(uwbSlotBudget.needs).toEqual(['uwb-blocks'])
    expect(uwbSlotBudget.limits).toEqual([])
    expect(uwbSlotBudget.observe).toEqual([])
    expect(uwbSlotBudget.tryThis).toEqual([])
  })

  it('cites each clause ① teaches, and ② is not all faithful', () => {
    for (const c of ['§10.32.2', '§10.29.1.5', '§10.32.3.3', '§10.32.9.3', '§11.2.3', '§16.4.8', '§16.7', '§10.32.3.4']) {
      expect(stdText(), c).toContain(c)
    }
    expect(new Set(uwbSlotBudget.implementation!.map((r) => r.kind)).size).toBeGreaterThan(2)
  })

  it('① states the RSTU and the 127-octet payload the engine uses', () => {
    expect(num(stdText(), /是 (\d+) 个码片/, 'chips')).toBe(RSTU_CHIPS)
    expect(num(stdText(), /约 ([\d.]+) ns/, 'RSTU')).toBe(Number((rstuNs(1_000_000) / 1_000_000).toFixed(2)))
    const cap = num(stdText(), /负载最多 (\d+) 字节/, '127')
    const n = uwbMaxAnchors('twr', 'ds', 'embedded', 'time')
    expect(uwbFinalBytes(n)).toBeLessThanOrEqual(cap)
    expect(uwbFinalBytes(n + 1)).toBeGreaterThan(cap)
  })
})

describe('uwb-slot-budget · ② says what the engine does, and the engine does it', () => {
  // 2026-11-11 (W2b): the rule also holds aTurnaroundTime (Table 12-1, §11.2.3), so 306 and 321 RSTU.
  it('the slot-fit rule: the Final plus the guard plus aTurnaroundTime, 306 RSTU; 321 RSTU at five anchors', () => {
    const sim = implRow('时隙最短多长').sim
    expect(num(sim, /四个锚点时 (\d+) 字节/, 'Final')).toBe(uwbFinalBytes(ANCHORS))
    expect(num(sim, /空口 ([\d ]+) ns/, 'air')).toBe(uwbPpduNs(uwbFinalBytes(ANCHORS)))
    expect(num(sim, /下限 ([\d ]+) ns/, 'fit')).toBe(uwbSlotFitNs(ANCHORS))
    const r292 = num(sim, /合 (\d+) 个 RSTU/, 'rstu')
    expect(rstuNs(r292)).toBeGreaterThanOrEqual(uwbSlotFitNs(ANCHORS))
    expect(rstuNs(r292 - 1)).toBeLessThan(uwbSlotFitNs(ANCHORS))
    expect(num(sim, /五个锚点时要 ([\d ]+) ns/, 'fit5')).toBe(uwbSlotFitNs(5))
    const r307 = num(sim, /即 (\d+) RSTU/, 'rstu5')
    expect(rstuNs(r307)).toBeGreaterThanOrEqual(uwbSlotFitNs(5))
    expect(rstuNs(r307 - 1)).toBeLessThan(uwbSlotFitNs(5))
    // the Final really is the round's longest frame
    const longest = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
      .reduce((m, r) => (r.frame.txTimeNs > m.frame.txTimeNs ? r : m))
    expect(longest.frame.kind).toBe('uwbFinal')
  })

  it('the guard is 200 ns, 60 m of air', () => {
    const sim = implRow('飞行余量').sim
    expect(num(sim, /(\d+) ns/, 'guard')).toBe(UWB_SLOT_GUARD_NS)
    expect(num(sim, /相当于 (\d+) m/, 'm')).toBe(Math.round(UWB_SLOT_GUARD_NS * 0.299792458))
  })

  // 2026-11-11 (W2b): the standard has no floor (§10.32.2 asks only for one frame); the schema's 300 RSTU
  // floor is gone, so a slot that fits the round is legal whatever its size.
  it('no floor of the schema\'s own: 300 RSTU is refused only because the round does not fit it', () => {
    const row = implRow('时隙的下限')
    expect(row.kind).toBe('faithful')
    expect(row.sim).toContain('已经去掉')
    const floor = uwbSlotFloorRstu(SESSION, ANCHORS)
    expect(floor).toBe(306)
    expect(rstuNs(floor)).toBeGreaterThanOrEqual(uwbSlotFitNs(ANCHORS))
    expect(rstuNs(floor - 1)).toBeLessThan(uwbSlotFitNs(ANCHORS))
    expect(schemaIssues(300).join(' ')).toContain('aTurnaroundTime')
    expect(schemaIssues(300).join(' ')).not.toContain('greater than or equal to 300')
    // 320 RSTU divides the 240 000 RSTU block and fits the round: no issue at all
    expect(schemaIssues(320)).toEqual([])
  })

  it('aTurnaroundTime: 12 preamble symbols, 12 212 ns, counted by the slot rule', () => {
    const row = implRow('接收与发送之间的转换')
    expect(num(row.sim, /留出 ([\d ]+) ns/, 'turnaround')).toBe(UWB_TURNAROUND_NS)
    expect(num(row.sim, /12 × (\d+) 个码片/, 'chips')).toBe(508)
    expect(uwbSlotFitNs(ANCHORS)).toBe(uwbPpduNs(uwbFinalBytes(ANCHORS)) + UWB_SLOT_GUARD_NS + UWB_TURNAROUND_NS)
  })

  it('the scene\'s slot is 2 ms and the Final fills 12.1 % of it', () => {
    const sim = implRow('场景取的时隙长').sim
    expect(num(sim, /([\d ]+) RSTU，即/, 'slot')).toBe(SESSION.slotRstu)
    expect(num(sim, /即 (\d+) ms/, 'ms') * MS).toBe(PLAN.slotNs)
    expect(num(sim, /占它的 ([\d.]+) %/, 'pct')).toBe(Number((uwbPpduNs(uwbFinalBytes(ANCHORS)) / PLAN.slotNs * 100).toFixed(1)))
  })

  it('the editor clamps to the slot-fit floor and moves the block to a whole number of slots', () => {
    const floor = uwbSlotFloorRstu(SESSION, ANCHORS)
    expect(num(implRow('编辑器里的输入').sim, /本场景 (\d+) RSTU/, 'floor')).toBe(floor)
    expect(clampField('300', floor, 60_000, true)).toBe(floor)
    expect(clampField('2401', floor, 60_000, true)).toBe(2401)
    expect(uwbSessionRepair({ ...SESSION, slotRstu: floor }, ANCHORS, TAGS.length).blockRstu).toBe(239_904)
  })

  it('the anchor\'s radio wakes for an expected frame and closes when it is in', () => {
    expect(implRow('接收机何时开启').kind).toBe('faithful')
    const states = ofType(recs(), 'MAC_STATE').filter((r) => r.node === 'anchor-1' && r.t < PLAN.roundNs)
    expect(states.map((r) => `${r.t}:${r.state}`)).toEqual([
      '0:uwbWait', '13:rx', '217898:idle',
      // 2026-11-11 (W2b): the DS Response carries Treply1 (21 octets) and the report Tround2 alone (19),
      // §10.32.5 Figure 10-238.
      '2000000:tx', '2190192:idle',
      '10000000:uwbWait', '10000013:rx', '10242513:idle',
      '12000000:tx', '12188141:idle',
    ])
  })

  it('offset 0: every frame starts on its slot boundary', () => {
    for (const r of ofType(recs(), 'TX_START')) expect(r.t % PLAN.slotNs, `${r.node}@${r.t}`).toBe(0)
  })

  it('the Final is 18 + 12N octets, 138 at ten anchors, so nine is the cap', () => {
    const sim = implRow('一帧最长').sim
    expect(uwbFinalBytes(ANCHORS)).toBe(18 + 12 * ANCHORS)
    expect(num(sim, /十个锚点时 (\d+) 字节/, '138')).toBe(uwbFinalBytes(10))
    expect(num(sim, /超过 (\d+) 字节/, '127')).toBe(127)
    expect(sim).toContain('最多列九个锚点')
    expect(uwbMaxAnchors('twr', 'ds', 'embedded', 'time')).toBe(9)
  })
})

describe('uwb-slot-budget · ③ every figure the labs print is the run', () => {
  it('lab 1: the formula, and the share of its slot each frame fills', () => {
    const l = lab('一帧占自己时隙的几分之一')
    const f = blockOf(l, 'formula')
    const m = /= ([\d ]+) \+ (\d+) \+ ([\d ]+) = ([\d ]+) ns at N = (\d)/.exec(f.text)!
    const [air, guard, turn, fit, n] = [m[1], m[2], m[3], m[4], m[5]].map((x) => Number(x!.replace(/\s/g, '')))
    expect(n).toBe(ANCHORS)
    expect(air).toBe(uwbPpduNs(uwbFinalBytes(ANCHORS)))
    expect(guard).toBe(UWB_SLOT_GUARD_NS)
    expect(turn).toBe(UWB_TURNAROUND_NS)
    expect(fit).toBe(uwbSlotFitNs(ANCHORS))
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
    const poll = tx.find((r) => r.frame.kind === 'uwbPoll')!
    const fin = tx.find((r) => r.frame.kind === 'uwbFinal')!
    expect(num(l.expect, /Poll 的空口时间是 ([\d ]+) ns/, 'poll')).toBe(poll.frame.txTimeNs)
    expect(num(l.expect, /只占 2 ms 时隙的 ([\d.]+) %/, 'poll %')).toBe(Number((poll.frame.txTimeNs / PLAN.slotNs * 100).toFixed(1)))
    expect(num(l.expect, /Final 是 ([\d ]+) ns/, 'final')).toBe(fin.frame.txTimeNs)
    expect(num(l.expect, /也只占 ([\d.]+) %/, 'final %')).toBe(Number((fin.frame.txTimeNs / PLAN.slotNs * 100).toFixed(1)))
  })

  it('lab 2: radio-on against the schedule share, and what the phone\'s figure is made of', () => {
    const l = lab('射频开启的时间与分配到的时间')
    const t = blockOf(l, 'table')
    const tag = radioOnNs(recs(), 'uwb-1', PLAN.blockNs)
    const anc = radioOnNs(recs(), 'anchor-1', PLAN.blockNs)
    expect(t.rows[0]).toEqual(['uwb-1（三部之一）', `1 of ${PLAN.roundsPerBlock}`, `${PLAN.slots} of ${PLAN.slots}`,
      `${grp(tag)} ns`, `${(tag / PLAN.blockNs * 100).toFixed(2)} %`])
    expect(t.rows[1]).toEqual(['anchor-1（四个之一）', `${TAGS.length} of ${PLAN.roundsPerBlock}`, `4 of ${PLAN.slots} × ${TAGS.length}`,
      `${grp(anc)} ns`, `${(anc / PLAN.blockNs * 100).toFixed(2)} %`])
    expect(tag).toBe(FIG.radioOnNs)
    // 「相差十倍以上」
    expect(PLAN.roundNs / tag).toBeGreaterThan(10)
    expect(TAGS.length * PLAN.roundNs / anc).toBeGreaterThan(10)
    // 「空口时间 1 961 413 ns，再加上它接收的八帧、每帧 13 ns 的飞行时间」
    const airtime = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs).reduce((s, r) => s + r.frame.txTimeNs, 0)
    expect(num(l.expect, /空口时间 ([\d ]+) ns/, 'air')).toBe(airtime)
    const rx = ofType(recs(), 'UWB_TS').filter((r) => r.node === 'uwb-1' && r.dir === 'rx' && r.t < PLAN.roundNs)
    expect(rx).toHaveLength(8)
    expect(l.expect).toContain('八帧')
    expect(tag).toBe(airtime + rx.length * num(l.expect, /每帧 (\d+) ns 的飞行时间/, 'flight'))
    // 「锚点一轮只唤醒四次」
    const wakes = ofType(recs(), 'MAC_STATE').filter((r) => r.node === 'anchor-1' && r.t < PLAN.roundNs && r.state !== 'idle' && r.state !== 'rx')
    expect(wakes).toHaveLength(4)
  })

  it('lab 3: a quarter of the slot, four times the rounds, the same radio-on', () => {
    const l = lab('把时隙缩短到四分之一')
    expect(uwbSlotBudget.variants![l.variant!].label).toBe('0.5 ms 时隙')
    const rows = blockOf(l, 'table').rows
    for (const [row, plan, rs, rstu] of [[rows[0], PLAN, recs(), SESSION.slotRstu], [rows[1], VPLAN, recs(0), uwbSlotBudget.variants![0].scenario().uwb!.slotRstu]] as const) {
      expect(rstuNs(rstu)).toBe(plan.slotNs)
      expect(row[0]).toBe(`${grp(rstu)} RSTU · ${plan.slotNs / MS} ms`)
      expect(row[1]).toBe(`${(plan.roundNs / MS).toFixed(1)} ms`)
      expect(row[2]).toBe(String(plan.roundsPerBlock))
      expect(row[3]).toBe(`${ofType(rs, 'UWB_ROUND_END')[TAGS.length - 1].t / MS} ms`)
      expect(row[4]).toBe(`${grp(radioOnNs(rs, 'uwb-1', plan.blockNs))} ns`)
    }
    expect(VPLAN.blockNs).toBe(PLAN.blockNs)
    expect(VPLAN.roundsPerBlock).toBe(4 * PLAN.roundsPerBlock)
    const fixes = ofType(recs(0), 'UWB_POSITION').filter((f) => f.block === 0).map((f) => f.t / MS)
    expect(l.expect).toContain(`定位出现在 ${fixes.join('、')} ms`)
    for (const t of TAGS) expect(radioOnNs(recs(0), t, PLAN.blockNs), t).toBe(radioOnNs(recs(), t, PLAN.blockNs))
    // the figure: two rows, the same ten frames at the two slot lengths
    const d = blockOf(l, 'diagram')
    expect(d.spec).toEqual(uwbSlotBudgetTiming())
    const lanes = (d.spec as TimingSpec).lanes
    expect(FIG.slotUs * 1000).toBe(PLAN.slotNs)
    expect(FIG.shortSlotUs * 1000).toBe(VPLAN.slotNs)
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
    for (const lane of lanes) expect(lane.spans).toHaveLength(2 * tx.length)
    expect(GRID.frames.map((f) => Math.round(f.airUs * 1000))).toEqual(tx.map((r) => r.frame.txTimeNs))
    expect(ofType(recs(0), 'TX_START').filter((r) => r.t < VPLAN.roundNs).map((r) => r.frame.txTimeNs))
      .toEqual(tx.map((r) => r.frame.txTimeNs))
  })

  // 2026-11-11 (W2b): the floor is the slot-fit rule (frame + guard + aTurnaroundTime), 306 RSTU here,
  // and the block follows the slot to a whole number of slots (§10.32.2).
  it('lab 4: 300 goes to 306 and the block to 239 904; 320 stays, and the steps are the engine\'s rule', () => {
    const l = lab('编辑器里的最短时隙')
    const items = blockOf(l, 'steps').items
    expect(num(items[0], /四个锚点时 (\d+) 字节/, 'final')).toBe(uwbFinalBytes(ANCHORS))
    expect(num(items[0], /空口 ([\d ]+) ns/, 'air')).toBe(uwbPpduNs(uwbFinalBytes(ANCHORS)))
    expect(num(items[1], /加 (\d+) ns 飞行余量/, 'guard')).toBe(UWB_SLOT_GUARD_NS)
    expect(num(items[1], /与 ([\d ]+) ns 的 aTurnaroundTime/, 'turn')).toBe(UWB_TURNAROUND_NS)
    expect(num(items[1], /容量下限是 ([\d ]+) ns/, 'fit')).toBe(uwbSlotFitNs(ANCHORS))
    expect(rstuNs(num(items[1], /合 (\d+) 个 RSTU 还多一点/, '305'))).toBeLessThan(uwbSlotFitNs(ANCHORS))
    const floor = num(items[1], /至少要 (\d+) 个 RSTU/, '306')
    expect(floor).toBe(uwbSlotFloorRstu(SESSION, ANCHORS))
    const [a, b] = [...l.steps.join(' ').matchAll(/输入 (\d+)/g)].map((x) => Number(x[1]))
    expect([a, b]).toEqual([300, 320])
    expect(num(l.expect, /300 变为 (\d+)/, '306')).toBe(clampField(String(a), floor, 60_000, true))
    expect(clampField(String(b), floor, 60_000, true)).toBe(b)
    expect(num(l.expect, /300 RSTU（([\d.]+) µs）/, '250')).toBe(Number((rstuNs(300) / 1000).toFixed(1)))
    expect(num(l.expect, /要求的 ([\d.]+) µs/, 'fit')).toBe(Number((uwbSlotFitNs(ANCHORS) / 1000).toFixed(1)))
    expect(num(l.expect, /短 ([\d.]+) µs/, 'short')).toBe(Number(((uwbSlotFitNs(ANCHORS) - rstuNs(300)) / 1000).toFixed(1)))
    const repaired = uwbSessionRepair({ ...SESSION, slotRstu: floor }, ANCHORS, TAGS.length)
    expect(num(l.expect, /块长随之变为 ([\d ]+) RSTU/, 'block')).toBe(repaired.blockRstu)
    expect(num(l.expect, /即 (\d+) 个时隙/, 'slots')).toBe(repaired.blockRstu! / floor)
    expect(uwbSessionRepair({ ...SESSION, slotRstu: b }, ANCHORS, TAGS.length)).toEqual({})
    expect(num(l.expect, /正好是 (\d+) 个 320 RSTU/, '750')).toBe(SESSION.blockRstu / b)
    expect(schemaIssues(b)).toEqual([])
    const scene = uwbBlocksScenario(floor)
    expect(ScenarioSchema.safeParse({ ...scene, uwb: { ...scene.uwb!, blockRstu: repaired.blockRstu! } }).success).toBe(true)
  })
})
