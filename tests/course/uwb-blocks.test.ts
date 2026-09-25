/**
 * Every empirical claim in "Blocks, rounds and slots", measured against the
 * lesson's own scenario and its variant. Each assertion quotes the sentence or
 * the table cell it guards, copied from the shipped string; the schedule
 * constants, frame sizes and slot-fit rule come from the engine's own exports
 * (src/uwb/session.ts, src/uwb/phy.ts) and from the scenario schema itself
 * rather than being re-typed here.
 *
 * The lesson was rewritten to the zero-to-hero contract, so the quoted log
 * lines that used to sit in `observe` (an observation is capped at six numeric
 * quantities) now live in a table of `numbers`, and the slot-length arithmetic
 * in `deeper`. Every pin moved with its sentence; `.body!` is gone, and the
 * shape checks are the kit's.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbBlocks, uwbBlocksScenario } from '../../src/course/uwb/uwb-blocks'
import { DEFAULT_UWB_SESSION, ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { uwbTag, type Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { roundPlan } from '../../src/uwb/session'
import {
  ARC_IE_BYTES, RSTU_CHIPS, rdmIeBytes, rstuNs, uwbFinalBytes, uwbPollBytes, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** Two blocks and a little more, so the repeat is visible and the second block's rounds all close. */
const RUN_NS = 300 * MS
const ANCHORS = 4
const TAGS = ['uwb-1', 'uwb-2', 'uwb-3']

const SESSION = uwbBlocks.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbBlocks, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The section budgets are gone; a lesson is as long as its one topic needs, under
// the 30-minute ceiling (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md).
lessonShapeSuite(uwbBlocks, { runNs: RUN_NS })

/**
 * Nanoseconds a node's radio spends out of `idle` inside [fromNs, untilNs) — the
 * uwbWait + rx + tx of the MAC_STATE lane, which is what the lesson calls the
 * radio share. Every device starts a run idle, and every round of this scene
 * both starts and ends with its participants idle, so a window that begins on a
 * round boundary needs no carried-in state.
 */
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

/** The lesson's nth table of `numbers`, rows kept in place so a cell can be checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbBlocks.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]

/** The lesson's one figure, and the caption that took the deleted three-level table's place. */
const figureBlock = (): Extract<Block, { kind: 'diagram' }> =>
  uwbBlocks.picture!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
const figure = (): TimingSpec => figureBlock().spec as TimingSpec
const caption = (): string => figureBlock().caption!

/** What the scenario schema says about this scene, optionally with extra tags in it. */
function schemaIssues(slotRstu: number, extraTags = 0): string[] {
  const base = uwbBlocksScenario(slotRstu)
  const nodes = [
    ...base.nodes,
    ...Array.from({ length: extraTags }, (_, i) => uwbTag(`uwb-${TAGS.length + i + 1}`, `Phone ${TAGS.length + i + 1}`, 5, 4, 1.0)),
  ]
  const parsed = ScenarioSchema.safeParse({ ...base, nodes })
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

describe('uwb-blocks · the lesson’s own place in the track', () => {
  it('opens the sessions module and asks only for the frame lesson', () => {
    expect(MODULES[uwbBlocks.module].title).toBe('会话网格')
    expect(uwbBlocks.id).toBe('uwb-blocks')
    expect(uwbBlocks.needs).toEqual(['uwb-frame'])
    // the four words the grid is made of; RSTU is the unit every duration here is counted in.
    // `margin` left with the slot-length material: it is uwb-slot-budget's own word now.
    expect(uwbBlocks.terms!.map((t) => t.term)).toEqual(['block', 'round', 'slot', 'RSTU'])
  })

  it('it keeps all five jumps and both observations, and asks two new questions', () => {
    // §2: "uwb-blocks keeps all five jumps and both observe lines and needs one new quiz".
    // Both of the old questions went to uwb-slot-budget (they were about the radio bill and the
    // 0.5 ms slot), so both of these are new; the experiment that stayed is the anchor deletion,
    // because 2N + 2 slots to a round is step 1 of this lesson's own procedure.
    expect(uwbBlocks.jumps).toHaveLength(5)
    expect(uwbBlocks.observe).toHaveLength(2)
    expect(uwbBlocks.tryThis).toHaveLength(1)
    expect(uwbBlocks.quiz).toHaveLength(2)
    for (const q of uwbBlocks.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('the jump targets occur in the order the list gives them', () => {
    // the kit checks each one is found; the order is this lesson's own claim, because the
    // picture walks the reader through them: the Poll, the fix, the round's end, the next
    // tag's round, the block repeating.
    const rs = recs()
    const at = uwbBlocks.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(at).toEqual([...at].sort((a, b) => a - b))
    expect(rs[at[0]].t).toBe(0)
    expect([rs[at[1]].t, rs[at[2]].t, rs[at[3]].t]).toEqual([PLAN.roundNs, PLAN.roundNs, PLAN.roundNs])
    expect(rs[at[4]].t).toBe(PLAN.blockNs)
  })

  it('names the standard clauses it leans on in `sources`, and the model numbers are the engine’s', () => {
    // The provenance paragraph that used to open the lesson is now the collapsed
    // "Where these numbers come from", which is where the contract puts citations.
    const src = uwbBlocks.sources!.map((s) => s).join('\n')
    for (const s of ['IEEE Std 802.15.4-2024', '§10.32.2', '§10.29.1.5', '§10.32.9.1', '§10.32.9.8']) {
      expect(src, s).toContain(s)
    }
    for (const s of ['FiRa']) expect(src, s).toContain(s)
    // "fix the RSTU at 416 chips, which is 833.333 ns at 499.2 Mchip/s"
    expect(RSTU_CHIPS).toBe(416)
    expect((RSTU_CHIPS * 1000 / 499.2).toFixed(3)).toBe('833.333')
    // The 200 ns flight guard, the 300 RSTU floor and the nine anchors one Final can list went
    // to uwb-slot-budget with the slot-length rule they belong to, and are pinned there.
    for (const s of ['200 ns', '300 RSTU']) expect(src, s).not.toContain(s)
    // the two lists the picture describes without naming are the ARC and RDM information elements
    expect(src).toContain('ARC IE')
    expect(src).toContain('RDM IE')
  })
})

describe('uwb-blocks · the scene', () => {
  it('is four anchors on a 3.50 m ring with three phones under them, and only the slot varies', () => {
    // "Four anchors on a 3.50 m ring around (5, 4) at 2.20 m, serving three phones at desk height"
    const s = uwbBlocks.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(s.nodes.map((n) => n.id))
      .toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4', ...TAGS])
    expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'tag', 'tag', 'tag'])
    for (const a of s.nodes.slice(0, ANCHORS)) {
      expect(a.pos.z, a.id).toBe(2.2)
      expect(Math.hypot(a.pos.x - 5, a.pos.y - 4), a.id).toBeCloseTo(3.5, 12)
    }
    expect(s.nodes.slice(ANCHORS).map((n) => [n.pos.x, n.pos.y, n.pos.z]))
      .toEqual([[5, 4, 1], [3, 2.5, 1], [7.5, 6, 1]])
    // every crystal is drawn, not set; the session is the default one with DS and no NLOS
    expect(s.nodes.every((n) => n.uwb!.ppm === undefined)).toBe(true)
    expect(s.uwb).toEqual({ ...DEFAULT_UWB_SESSION, method: 'ds', nlos: false, slotRstu: 2400 })
    expect(s.uwb!.slotRstu).toBe(DEFAULT_UWB_SESSION.slotRstu)
    expect(s.uwb!.blockRstu).toBe(DEFAULT_UWB_SESSION.blockRstu)
    // no AP, no stations, no Wi-Fi traffic at all
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    expect(s.servers).toEqual([])
  })

  it('the variant changes the ranging slot and nothing else', () => {
    // the "Two slot lengths, one scene" table: "600 RSTU · 0.5 ms"
    expect(uwbBlocks.variants).toHaveLength(1)
    const v = uwbBlocks.variants![0].scenario()
    expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(v.uwb!.slotRstu).toBe(600)
    expect(rstuNs(600)).toBe(500_000)
    expect(JSON.stringify({ ...v, uwb: { ...v.uwb!, slotRstu: 2400 } }))
      .toBe(JSON.stringify(uwbBlocks.scenario()))
    expect(v).toEqual(uwbBlocksScenario(600))
    expect(uwbBlocks.scenario()).toEqual(uwbBlocksScenario(2400))
    // Both halves of the split list the same variant, which is what makes the recorded hash a
    // copy rather than a new run; the two cells that PRICED the two slot lengths went to
    // `uwb-slot-budget` with the experiment that loads this variant.
    expect(uwbBlocks.variants![0].label).toBe('0.5 ms 时隙')
  })
})

describe('uwb-blocks · the grid', () => {
  it('the three levels of the figure are the engine’s own plan, RSTU by RSTU', () => {
    // §5.4 deleted the 「三重嵌套的节拍」 table — "prose a diagram now says better" — so the
    // three RSTU/duration pairs are in the figure's caption and this pin reads them there:
    // "一个块 240 000 RSTU，200.0 ms，装得下十轮；一轮 24 000 RSTU，20.0 ms；轮里切成十个时隙，
    //  每个 2 400 RSTU，2 000.0 µs"
    expect(PLAN.blockNs).toBe(200 * MS)
    expect(rstuNs(240_000)).toBe(PLAN.blockNs)
    expect(SESSION.blockRstu).toBe(240_000)
    expect(PLAN.slots).toBe(uwbSlotsPerTag('ds', ANCHORS))
    expect(PLAN.slots).toBe(10)
    expect(PLAN.slotNs).toBe(2 * MS)
    expect(rstuNs(2400)).toBe(PLAN.slotNs)
    expect(PLAN.roundNs).toBe(20 * MS)
    expect(rstuNs(PLAN.slots * SESSION.slotRstu)).toBe(PLAN.roundNs)
    // Review M6: step 1 used to call all three lengths configured. Only the block and the
    // slot are: `roundNs = slots x slotNs` (src/uwb/session.ts), which is why the 0.5 ms
    // variant's round falls to 5 ms with nothing else touched.
    const cap = caption()
    const pairs: [number, string][] = [
      [SESSION.blockRstu, FIG.blockMs],
      [PLAN.slots * SESSION.slotRstu, FIG.roundMs],
      [SESSION.slotRstu, '2 000.0 µs'],
    ]
    for (const [rstu, dur] of pairs) {
      const shown = rstu.toLocaleString('en-US').replace(/,/g, ' ')
      expect(cap, shown).toContain(`${shown} RSTU`)
      expect(cap, dur).toContain(dur)
    }
    // and the figure's own constants are those same three, not a re-typed copy
    expect([FIG.blockRstu, FIG.roundRstu, FIG.slotRstu]).toEqual(pairs.map(([r]) => r))
    expect(FIG.slots).toBe(PLAN.slots)
    expect(FIG.roundUs * 1000).toBe(PLAN.roundNs)
    expect(FIG.slotUs * 1000).toBe(PLAN.slotNs)
  })

  it('ten rounds fit the block, three are used, and the other seven never open', () => {
    // "Ten rounds fit a block and this scene holds three phones, so the other seven — 140 ms of
    //  every block — stay empty." / observe: "the seven rounds nobody owns never open at all"
    expect(PLAN.roundsPerBlock).toBe(10)
    expect(TAGS.length).toBe(3)
    expect(PLAN.roundsPerBlock - TAGS.length).toBe(7)
    expect((PLAN.roundsPerBlock - TAGS.length) * PLAN.roundNs).toBe(140 * MS)
    const rounds = ofType(recs(), 'UWB_ROUND')
    expect(rounds.filter((r) => r.block === 0).map((r) => `${r.node}/r${r.round}@${r.t / MS}`))
      .toEqual(['uwb-1/r0@0', 'uwb-2/r1@20', 'uwb-3/r2@40'])
    expect(rounds.filter((r) => r.block === 1).map((r) => `${r.node}/r${r.round}@${r.t / MS}`))
      .toEqual(['uwb-1/r0@200', 'uwb-2/r1@220', 'uwb-3/r2@240'])
    expect(new Set(rounds.map((r) => r.round))).toEqual(new Set([0, 1, 2]))
    // the table cell "Where the rounds of block 0 open": "0, 20 and 40 ms; block 1 at 200, 220 and 240 ms"
    expect(cell(0, 1, 1)).toBe('0, 20 and 40 ms; block 1 at 200, 220 and 240 ms')
    expect(rounds.map((r) => r.t).slice(0, 6)).toEqual([0, 20, 40, 200, 220, 240].map((ms) => ms * MS))
    // the table cell "The round line"
    expect(cell(0, 0, 1)).toBe('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs')
    expect(fmtRecord(rounds[0])).toBe(cell(0, 0, 1))
    // "its round ends": the end of each tag's round, at 20, 40 and 60 ms
    expect(ofType(recs(), 'UWB_ROUND_END').slice(0, 3).map((r) => `${r.node}@${r.t / MS}`))
      .toEqual(['uwb-1@20', 'uwb-2@40', 'uwb-3@60'])
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('a fourth phone costs nothing but the next empty round, and the block breaks at the eleventh', () => {
    // "A fourth phone would cost nothing but the next empty round; the block breaks only at the
    //  eleventh." The schema is the oracle, as it is for the slot lengths further down.
    expect(schemaIssues(2400, 1)).toEqual([])
    expect(schemaIssues(2400, PLAN.roundsPerBlock - TAGS.length)).toEqual([])
    expect(schemaIssues(2400, PLAN.roundsPerBlock - TAGS.length + 1))
      .toEqual([`the UWB block fits ${PLAN.roundsPerBlock} tags at ${PLAN.slots} slots each (found 11); `
        + 'lengthen blockRstu or shorten slotRstu'])
    // ten tags is the ceiling and it is the round count, not the anchor count, that sets it
    expect(TAGS.length + (PLAN.roundsPerBlock - TAGS.length)).toBe(10)
  })

  it('each phone gets one fix per block — five a second — and each is 2 cm out or better', () => {
    // "Five fixes a second each, whatever the other two phones do, and each one 2 cm out or
    //  better." / the "One fix per phone per block" table: "(5.01, 3.99) m at 20 ms". The table
    // quotes position and time only: GDOP is uwb-geometry's word, two lessons further on.
    expect(1000 / (PLAN.blockNs / MS)).toBe(5)
    const fixes = ofType(recs(), 'UWB_POSITION')
    // "once per block": every block the run covers, not only the first
    for (const block of [0, 1]) {
      for (const tag of TAGS) {
        expect(fixes.filter((f) => f.node === tag && f.block === block), `${tag} b${block}`).toHaveLength(1)
      }
    }
    expect(fixes.filter((f) => f.block === 1).map((f) => `${f.node}@${f.t / MS}`))
      .toEqual(['uwb-1@220', 'uwb-2@240', 'uwb-3@260'])
    expect(fixes.filter((f) => f.block === 0).map((f) => `${f.node}@${f.t / MS}`))
      .toEqual(['uwb-1@20', 'uwb-2@40', 'uwb-3@60'])
    expect(fixes.filter((f) => f.block === 0).map((f) => fmtRecord(f))).toEqual([
      'uwb-1 position (5.01, 3.99) m, true (5.00, 4.00), error 0.02 m, GDOP 1.06, 4 anchors',
      'uwb-2 position (3.01, 2.52) m, true (3.00, 2.50), error 0.02 m, GDOP 1.08, 4 anchors',
      'uwb-3 position (7.50, 6.01) m, true (7.50, 6.00), error 0.01 m, GDOP 1.06, 4 anchors',
    ])
    // the table says the same thing in the shape a reader can scan: position and time
    const table2: [string, string][] = [
      ['uwb-1', '(5.01, 3.99) m at 20 ms'],
      ['uwb-2', '(3.01, 2.52) m at 40 ms'],
      ['uwb-3', '(7.50, 6.01) m at 60 ms'],
    ]
    // and it does not print GDOP, which uwb-geometry is where the reader meets
    for (const i of [0, 1, 2]) expect(cell(1, i, 1), `row ${i}`).not.toContain('GDOP')
    table2.forEach((row, i) => row.forEach((v, j) => expect(cell(1, i, j), `${row[0]} ${j}`).toBe(v)))
    // "Each phone is 2 cm out or better": on this seed, and inside 4-σ of the solver's own
    // 1-σ on a 4-anchor fix, so a reseed cannot quietly turn the sentence into a fiction
    for (const f of fixes) {
      expect(Math.hypot(f.x - f.trueX, f.y - f.trueY), `${f.node} b${f.block}`).toBeLessThan(0.08)
      expect(f.anchors).toHaveLength(ANCHORS)
    }
    for (const f of fixes.filter((x) => x.block === 0)) {
      expect(Math.hypot(f.x - f.trueX, f.y - f.trueY), `${f.node} within 2 cm`).toBeLessThan(0.025)
    }
  })

  it('every frame leaves exactly on its slot boundary: the three Polls at 0, 20 and 40 ms', () => {
    // the table cell "Where the three Polls of block 0 leave": "0, 20 000 000 and 40 000 000 ns" /
    // observe: "Every transmission sits on a slot boundary, to the nanosecond. There is no IFS,
    //  no backoff draw and no NAV anywhere on these lanes"
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.blockNs)
    for (const r of tx) expect(r.t % PLAN.slotNs, `${r.node}/${r.frame.kind}@${r.t}`).toBe(0)
    expect(cell(0, 2, 1)).toBe('0, 20 000 000 and 40 000 000 ns')
    expect(tx.filter((r) => r.frame.kind === 'uwbPoll').map((r) => `${r.node}@${r.t}`))
      .toEqual(['uwb-1@0', 'uwb-2@20000000', 'uwb-3@40000000'])
    // the whole first round, slot by slot: Poll, four Responses, Final, four Reports
    expect(tx.filter((r) => r.t < PLAN.roundNs).map((r) => `${r.node}/${r.frame.kind}@${r.t / MS}`)).toEqual([
      'uwb-1/uwbPoll@0',
      'anchor-1/uwbResp@2', 'anchor-2/uwbResp@4', 'anchor-3/uwbResp@6', 'anchor-4/uwbResp@8',
      'uwb-1/uwbFinal@10',
      'anchor-1/uwbReport@12', 'anchor-2/uwbReport@14', 'anchor-3/uwbReport@16', 'anchor-4/uwbReport@18',
    ])
    expect(ofType(recs(), 'BACKOFF_DRAW')).toHaveLength(0)
    expect(ofType(recs(), 'IFS_START')).toHaveLength(0)
    expect(ofType(recs(), 'NAV_SET')).toHaveLength(0)
  })

  it('the opening frame carries the whole schedule: a 10-octet list and a 15-octet one', () => {
    // the picture: "It rides in the phone’s opening frame, as two short lists: one says where in
    //  the session this round sits, the other names each anchor and the slot it is to answer in."
    // and the table rows that print both: "Poll, 39 octets" / "Its first list, 10 octets" /
    // "Its second list, 15 octets".
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame
    expect(cell(0, 3, 1)).toBe('Poll, 39 octets')
    expect(poll.bytes).toBe(39)
    expect(poll.bytes).toBe(uwbPollBytes(ANCHORS))
    const fields = uwbFrameFields(poll).users[0].subframes[0].mpdu.fields
    const arc = fields.find((f) => f.key === 'ieArc')!
    const rdm = fields.find((f) => f.key === 'ieRdm')!
    expect(arc.bytes).toBe(ARC_IE_BYTES)
    expect(arc.bytes).toBe(10)
    // The two cells print what the inspector prints, so they are pinned to the decoder itself
    // and not to a re-typed copy of it.
    expect(cell(0, 4, 1)).toBe(arc.value)
    expect(rdm.bytes).toBe(rdmIeBytes(ANCHORS))
    expect(rdm.bytes).toBe(15)
    expect(cell(0, 5, 1)).toBe(rdm.value)
    for (const a of ['anchor-1 时隙 1', 'anchor-2 时隙 2', 'anchor-3 时隙 3', 'anchor-4 时隙 4']) {
      expect(rdm.value!, a).toContain(a)
    }
    // "each anchor and the slot it is to answer in": three octets per device, an address and an index
    expect(rdmIeBytes(5) - rdmIeBytes(4)).toBe(3)
  })
})

/**
 * The `timing` figure §4 asks of this lesson (块 → 轮 → 时隙的三层嵌套). Its
 * geometry is checked course-wide in tests/course/diagram.test.ts; what belongs
 * here is that the three levels and the ten frames are this run's own, and that
 * it really does replace the table §5.4 deleted.
 */
describe('uwb-blocks · the figure', () => {
  it('is one diagram on the main path, after the paragraph that names a ranging slot', () => {
    expect(uwbBlocks.picture!.filter((b) => b.kind === 'diagram')).toHaveLength(1)
    expect((uwbBlocks.numbers ?? []).filter((b) => b.kind === 'diagram')).toHaveLength(0)
    // 测距时隙（ranging slot）is first named in picture[1]; a figure's labels are graded prose
    // and come before its caption, so the figure cannot sit above that paragraph.
    const at = uwbBlocks.picture!.findIndex((b) => b.kind === 'diagram')
    expect(at).toBeGreaterThan(1)
    expect(uwbBlocks.picture![1]).toMatchObject({ text: expect.stringContaining('测距时隙（ranging slot）') })
    // and the table it replaces is gone: three tables left, none of them the three-level one
    expect(uwbBlocks.numbers!.filter((b) => b.kind === 'table')).toHaveLength(3)
    for (const b of uwbBlocks.numbers!) {
      if (b.kind === 'table') expect(b.heading, b.heading).not.toBe('三重嵌套的节拍')
    }
  })

  it('the middle lane is the round’s ten slots and the bottom lane the ten frames it radiates', () => {
    const lanes = figure().lanes
    expect(lanes.map((l) => l.label)).toEqual(['块 0', '轮 0', '发帧'])
    // top lane: the whole window is one round of the block
    expect(lanes[0].spans).toEqual([{ label: '轮 0 · uwb-1，十轮之一', fromUs: 0, toUs: FIG.roundUs }])
    expect(PLAN.roundsPerBlock).toBe(10)
    // middle lane: ten equal slots, indexed 0…9, each exactly slotNs long
    expect(lanes[1].spans.map((s) => s.label)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    for (const s of lanes[1].spans) expect((s.toUs - s.fromUs) * 1000).toBe(PLAN.slotNs)
    // bottom lane: one sliver per frame, at its slot's own left edge, as long as its airtime
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
    expect(tx).toHaveLength(FIG.frames.length)
    tx.forEach((r, i) => {
      const span = lanes[2].spans[i]
      expect(span.fromUs * 1000, `frame ${i}`).toBe(r.t)
      expect(FIG.frames[i].slot, `frame ${i}`).toBe(r.t / PLAN.slotNs)
      expect(Math.abs((span.toUs - span.fromUs) * 1000 - r.frame.txTimeNs), `frame ${i}`).toBeLessThan(1)
      expect(span.tone).toBe('accent')
    })
    // only the phone's own two frames are labelled, and they are the Poll and the Final
    expect(lanes[2].spans.filter((s) => s.label).map((s) => s.label)).toEqual(['Poll', 'Final'])
    expect([tx[0].frame.kind, tx[5].frame.kind]).toEqual(['uwbPoll', 'uwbFinal'])
    expect(figure().axis).toEqual({ fromUs: 0, toUs: FIG.roundUs, ticks: [0, 10_000, 20_000], unit: 'µs' })
  })

  it('the caption names the two frames the figure labels and nothing it cannot show', () => {
    const cap = caption()
    for (const s of ['时隙 0', 'Poll', '时隙 5', 'Final', 'Response', 'Report']) {
      expect(cap, s).toContain(s)
    }
    // the window is one round, and the caption says so rather than letting the block lane lie
    expect(cap).toContain('装得下十轮')
  })
})

describe('uwb-blocks · one anchor fewer', () => {
  it('deleting an anchor takes the round to eight slots and the Final down 12 octets', () => {
    // the second experiment: "“slots per round 8 · rounds per block 12”, because a round of this
    // method is 2N + 2 slots"
    const three = roundPlan(SESSION, ANCHORS - 1)
    expect(three.slots).toBe(8)
    expect(three.slots).toBe(2 * (ANCHORS - 1) + 2)
    expect(three.roundNs).toBe(16 * MS)
    expect(three.roundsPerBlock).toBe(12)
    expect(uwbFinalBytes(ANCHORS) - uwbFinalBytes(ANCHORS - 1)).toBe(12)
  })

  it('the lesson quotes the plan line the editor prints, word for word', () => {
    // The sentence tells the learner to read the session section, so it has to quote what that
    // section renders — `E.uwbPlan(slots, rounds)` — in the language they are reading it in.
    // A Chinese learner never sees the English string, and a relabel must break this test.
    const three = roundPlan(SESSION, ANCHORS - 1)
    const quoted = (s: string): string => `“${s}”`
    expect(uwbBlocks.tryThis[0])
      .toContain(quoted(STRINGS.editor.uwbPlan(three.slots, three.roundsPerBlock)))
    // and the base scene's own plan is what the lesson quotes in the grid table
  })

})

/**
 * The procedure the 2026-09-23 amendment asks for ("mechanism before metaphor"):
 * the schedule as the engine builds and walks it. Each step is checked against
 * what it names — `uwbSlotsPerTag` and `roundPlan` for the three lengths and the
 * round count, `slotStartNs` for every slot boundary, `slotAction` for the one
 * device a slot belongs to, and the `UWB_SLOT` / `UWB_TIMEOUT` records for what
 * a device does with the answer.
 */
describe('uwb-blocks · the procedure, step by step', () => {
  /** The lesson's steps block of `numbers`. */
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbBlocks.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!

  it('is a steps block on the main path, not in `deeper`, and runs in the engine’s own order', () => {
    // amendment rule 3: the rule is written as a procedure, in `numbers`
    expect(uwbBlocks.numbers!.filter((b) => b.kind === 'steps')).toHaveLength(1)
    expect((uwbBlocks.deeper ?? []).filter((b) => b.kind === 'steps')).toHaveLength(0)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
    for (const s of steps().items) expect(s.trim().length).toBeGreaterThan(0)
  })

  it('step 1: the slot count is the method’s, two per anchor plus two', () => {
    expect(PLAN.slots).toBe(uwbSlotsPerTag(SESSION.method, ANCHORS))
    expect(PLAN.slots).toBe(2 * ANCHORS + 2)
    // and the two lengths the step says are fixed are the session's own, untouched by the run
    expect(PLAN.blockNs).toBe(rstuNs(SESSION.blockRstu))
    expect(PLAN.slotNs).toBe(rstuNs(SESSION.slotRstu))
  })

  it('step 2: round k belongs to phone k, in every block', () => {
    const rounds = ofType(recs(), 'UWB_ROUND')
    for (const r of rounds) expect(r.round, `${r.node} block ${r.block}`).toBe(TAGS.indexOf(r.node))
    // two blocks' worth, so "in every block" is measured and not assumed
    expect(new Set(rounds.map((r) => r.block)).size).toBeGreaterThan(1)
  })

  it('step 3: every slot boundary of the run is that one multiplication', () => {
    // block × block + round × round + slot × slot, for every UWB_SLOT the run emitted
    const slots = ofType(recs(), 'UWB_SLOT')
    expect(slots.length).toBeGreaterThan(50)
    const roundOf = new Map(ofType(recs(), 'UWB_ROUND').map((r) => [`${r.node}/${r.t}`, r]))
    for (const s of slots) {
      const open = [...roundOf.values()].filter((r) => r.node === s.node && r.t <= s.t).pop()!
      const at = open.block * PLAN.blockNs + open.round * PLAN.roundNs + s.slot * PLAN.slotNs
      expect(s.t, `${s.node} slot ${s.slot}`).toBe(at)
      expect(s.untilNs - s.t).toBe(PLAN.slotNs)
    }
  })

  it('steps 4 and 5: one transmitter a slot, and an anchor deaf through the other anchors’ slots', () => {
    // the schedule names the device; everyone else listens only for what is its own
    const first = ofType(recs(), 'TX_START').filter((r) => r.t < 20 * MS)
    expect(first.map((r) => `${r.node}/${r.frame.kind}`)).toEqual([
      'uwb-1/uwbPoll',
      'anchor-1/uwbResp', 'anchor-2/uwbResp', 'anchor-3/uwbResp', 'anchor-4/uwbResp',
      'uwb-1/uwbFinal',
      'anchor-1/uwbReport', 'anchor-2/uwbReport', 'anchor-3/uwbReport', 'anchor-4/uwbReport',
    ])
    // exactly one transmitter per slot, and never two at once
    expect(new Set(first.map((r) => r.t)).size).toBe(first.length)
    // the anchor's receiver is off through the other anchors' slots: measured, slot by
    // slot, over phone 1's round — anchor 1 owns slots 1 and 6 and listens in 0 and 5,
    // and its radio is off for the whole of every other slot
    for (const s of [2, 3, 4, 7, 8, 9]) {
      const from = s * PLAN.slotNs
      expect(radioOnNs(recs(), 'anchor-1', from + PLAN.slotNs, from), `slot ${s}`).toBe(0)
    }
    for (const s of [0, 1, 5, 6]) {
      const from = s * PLAN.slotNs
      expect(radioOnNs(recs(), 'anchor-1', from + PLAN.slotNs, from), `slot ${s}`).toBeGreaterThan(0)
    }
  })

  it('step 6: a missed slot is a UWB_TIMEOUT naming the slot and the frame, and nothing else happens', () => {
    // the lesson's own scene never loses a frame, so the claim is proved on a scene
    // that does: one anchor moved out to 40 m, past this receiver's sensitivity.
    const sc = uwbBlocksScenario(2400)
    const far = { ...sc, nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, pos: { ...n.pos, x: 60 } } : n)) }
    const rs = [...runOf({ ...uwbBlocks, id: 'uwb-blocks#far', scenario: () => far }, undefined, 60 * MS)]
    const outs = ofType(rs, 'UWB_TIMEOUT')
    expect(outs.length).toBeGreaterThan(0)
    for (const t of outs) {
      expect(t.peer, 'the record names the peer that did not answer').toBeTruthy()
      expect(typeof t.slot).toBe('number')
      expect(['uwbResp', 'uwbReport', 'uwbPoll', 'uwbFinal']).toContain(t.expected)
    }
    // no retry: the round still runs its ten slots and walks on to the next tag's
    expect(ofType(rs, 'UWB_SLOT').filter((r) => r.node === 'uwb-1' && r.t < 20 * MS)).toHaveLength(PLAN.slots)
    // and the Final leaves the silent anchor out, so it sends no Report
    const finals = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbFinal')
    expect(finals[0].frame.uwb!.finalTimes!.map((e) => e.id)).not.toContain('anchor-1')
    expect(ofType(rs, 'TX_START').some((r) => r.node === 'anchor-1' && r.frame.kind === 'uwbReport')).toBe(false)
  })

  it('the worked example is phone 2’s own round, read off the run', () => {
    const open = ofType(recs(), 'UWB_ROUND').find((r) => r.node === 'uwb-2' && r.block === 0)!
    expect([cell(2, 0, 1), cell(2, 1, 1)]).toEqual(['0 · 1', '1 × 20.0 ms = 20 ms'])
    expect(open.block).toBe(0)
    expect(open.round).toBe(1)
    expect(open.t).toBe(open.round * PLAN.roundNs)
    const slots = ofType(recs(), 'UWB_SLOT').filter((r) => r.node === 'uwb-2' && r.t < PLAN.blockNs)
    expect(cell(2, 2, 1)).toBe(`${slots[0].t.toLocaleString('en-US').replace(/,/g, ' ')} ns`)
    expect(cell(2, 3, 1)).toBe(`${slots[5].t.toLocaleString('en-US').replace(/,/g, ' ')} ns`)
    // slot 5 is the Final's, which is where the procedure's step 4 puts it
    expect(ofType(recs(), 'TX_START').find((r) => r.node === 'uwb-2' && r.frame.kind === 'uwbFinal')!.t)
      .toBe(slots[5].t)
    // the round ends, and the fix lands, at the end of its last slot
    const end = ofType(recs(), 'UWB_ROUND_END').find((r) => r.node === 'uwb-2')!
    const fix = ofType(recs(), 'UWB_POSITION').find((r) => r.node === 'uwb-2')!
    expect(cell(2, 4, 1)).toBe(`${end.t.toLocaleString('en-US').replace(/,/g, ' ')} ns`)
    expect(fix.t).toBe(end.t)
    expect(end.t).toBe(open.t + PLAN.roundNs)
  })
})
