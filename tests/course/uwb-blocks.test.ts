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
import { uwbBlocks, uwbBlocksScenario } from '../../src/course/uwb/uwb-blocks'
import { DEFAULT_UWB_SESSION, ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { uwbTag, type Block } from '../../src/course/lessonKit'
import { lessonStrings } from '../../src/course/readability'
import { clampField } from '../../src/editor/planOps'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { roundPlan } from '../../src/uwb/session'
import {
  ARC_IE_BYTES, RSTU_CHIPS, UWB_MAX_ANCHORS, UWB_SLOT_GUARD_NS, rdmIeBytes, rstuNs, uwbFinalBytes,
  uwbPollBytes, uwbPpduNs, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

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
// The prose window is the content contract's: `why` + outcomes + terms + picture
// + numbers, which the spec's own section budgets (900 + 550, as the 2026-09-23
// amendment raised them to pay for a procedure) already bound. The ratchet below
// sits just above what the lesson actually spends, so growth is deliberate.
lessonShapeSuite(uwbBlocks, { proseMax: 1130, runNs: RUN_NS })

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
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en

/** Everything the learner reads, joined — for "is this number actually printed?" checks. */
const prose = (): string => lessonStrings(uwbBlocks).map((s) => s.en).join('\n')

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
    expect(uwbBlocks.module).toBe(12)
    expect(uwbBlocks.id).toBe('uwb-blocks')
    expect(uwbBlocks.needs).toEqual(['uwb-frame'])
    // the four words the grid is made of; RSTU is the unit every duration in the tables is counted in
    expect(uwbBlocks.terms!.map((t) => t.term)).toEqual(['block', 'round', 'slot', 'RSTU'])
  })

  it('it offers five jumps, two things to observe, two experiments and two questions', () => {
    expect(uwbBlocks.jumps).toHaveLength(5)
    expect(uwbBlocks.observe).toHaveLength(2)
    expect(uwbBlocks.tryThis).toHaveLength(2)
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
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
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
    const src = uwbBlocks.sources!.map((s) => s.en).join('\n')
    for (const s of ['IEEE Std 802.15.4-2024', '§10.32.2', '§10.29.1.5', 'Table 10-145', '§10.32.9.1', '§10.32.9.8']) {
      expect(src, s).toContain(s)
    }
    for (const s of ['2 ms ranging slot', '200 ms ranging block', 'FiRa']) expect(src, s).toContain(s)
    // "fix the RSTU at 416 chips, which is 833.333 ns at 499.2 Mchip/s"
    expect(src).toContain('416 chips, which is 833.333 ns at 499.2 Mchip/s')
    expect(RSTU_CHIPS).toBe(416)
    expect((RSTU_CHIPS * 1000 / 499.2).toFixed(3)).toBe('833.333')
    // "the 200 ns of flight guard the slot-fit rule adds to the longest frame, the floor of
    //  300 RSTU the scenario schema puts under any slot, and the nine anchors one Final can list"
    expect(src).toContain('200 ns of flight guard')
    expect(UWB_SLOT_GUARD_NS).toBe(200)
    expect(src).toContain('floor of 300 RSTU')
    expect(schemaIssues(297)).toContain('Number must be greater than or equal to 300')
    expect(schemaIssues(300)).toEqual([])
    expect(src).toContain('nine anchors one Final can list')
    expect(UWB_MAX_ANCHORS).toBe(9)
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
    expect(uwbBlocks.variants![0].label).toEqual({ en: '0.5 ms slots', zh: '0.5 ms 时隙' })
    const v = uwbBlocks.variants![0].scenario()
    expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(v.uwb!.slotRstu).toBe(600)
    expect(rstuNs(600)).toBe(500_000)
    expect(JSON.stringify({ ...v, uwb: { ...v.uwb!, slotRstu: 2400 } }))
      .toBe(JSON.stringify(uwbBlocks.scenario()))
    expect(v).toEqual(uwbBlocksScenario(600))
    expect(uwbBlocks.scenario()).toEqual(uwbBlocksScenario(2400))
    expect(cell(4, 0, 0)).toBe('2 400 RSTU · 2 ms')
    expect(cell(4, 1, 0)).toBe('600 RSTU · 0.5 ms')
  })
})

describe('uwb-blocks · the grid', () => {
  it('the three levels of the table are the engine’s own plan, RSTU by RSTU', () => {
    // block 240 000 RSTU / 200.0 ms, round 24 000 RSTU / 20.0 ms, slot 2 400 RSTU / 2 000.0 µs
    expect(PLAN.blockNs).toBe(200 * MS)
    expect(rstuNs(240_000)).toBe(PLAN.blockNs)
    expect(SESSION.blockRstu).toBe(240_000)
    expect(PLAN.slots).toBe(uwbSlotsPerTag('ds', ANCHORS))
    expect(PLAN.slots).toBe(10)
    expect(PLAN.slotNs).toBe(2 * MS)
    expect(rstuNs(2400)).toBe(PLAN.slotNs)
    expect(PLAN.roundNs).toBe(20 * MS)
    expect(rstuNs(PLAN.slots * SESSION.slotRstu)).toBe(PLAN.roundNs)
    const rows: [string, string, string][] = [
      ['Ranging block', '240 000', '200.0 ms'],
      ['Ranging round', '24 000', '20.0 ms'],
      ['Ranging slot', '2 400', '2 000.0 µs'],
    ]
    rows.forEach(([level, rstu, dur], i) => {
      expect(cell(0, i, 0), level).toBe(level)
      expect(cell(0, i, 1), level).toBe(rstu)
      expect(cell(0, i, 2), level).toBe(dur)
    })
    expect(Number(rows[0][1].replace(/\s/g, ''))).toBe(SESSION.blockRstu)
    expect(Number(rows[1][1].replace(/\s/g, ''))).toBe(PLAN.slots * SESSION.slotRstu)
    expect(Number(rows[2][1].replace(/\s/g, ''))).toBe(SESSION.slotRstu)
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
    expect(cell(1, 1, 1)).toBe('0, 20 and 40 ms; block 1 at 200, 220 and 240 ms')
    expect(rounds.map((r) => r.t).slice(0, 6)).toEqual([0, 20, 40, 200, 220, 240].map((ms) => ms * MS))
    // the table cell "The round line"
    expect(cell(1, 0, 1)).toBe('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs')
    expect(fmtRecord(rounds[0])).toBe(cell(1, 0, 1))
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
    for (const i of [0, 1, 2]) expect(cell(2, i, 1), `row ${i}`).not.toContain('GDOP')
    table2.forEach((row, i) => row.forEach((v, j) => expect(cell(2, i, j), `${row[0]} ${j}`).toBe(v)))
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
    expect(cell(1, 2, 1)).toBe('0, 20 000 000 and 40 000 000 ns')
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
    expect(cell(1, 3, 1)).toBe('Poll, 39 octets')
    expect(poll.bytes).toBe(39)
    expect(poll.bytes).toBe(uwbPollBytes(ANCHORS))
    const fields = uwbFrameFields(poll).users[0].subframes[0].mpdu.fields
    const arc = fields.find((f) => f.key === 'ieArc')!
    const rdm = fields.find((f) => f.key === 'ieRdm')!
    expect(arc.bytes).toBe(ARC_IE_BYTES)
    expect(arc.bytes).toBe(10)
    expect(cell(1, 4, 0)).toBe('Its first list, 10 octets')
    expect(cell(1, 4, 1)).toBe('SP1 · DS-TWR · block 0 · round 0 · 4 responders')
    expect(arc.value).toBe(cell(1, 4, 1))
    expect(rdm.bytes).toBe(rdmIeBytes(ANCHORS))
    expect(rdm.bytes).toBe(15)
    expect(cell(1, 5, 0)).toBe('Its second list, 15 octets')
    expect(cell(1, 5, 1)).toBe('4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4')
    expect(rdm.value).toBe(cell(1, 5, 1))
    // "each anchor and the slot it is to answer in": three octets per device, an address and an index
    expect(rdmIeBytes(5) - rdmIeBytes(4)).toBe(3)
  })
})

describe('uwb-blocks · what the radio costs', () => {
  it('the schedule share is one round in ten for a phone and three for an anchor', () => {
    // "The schedule hands a phone one round in ten and an anchor three" — and the table's
    // "1 of 10" / "3 of 10" rows
    expect((PLAN.roundNs / PLAN.blockNs * 100).toFixed(0)).toBe('10')
    expect(TAGS.length * PLAN.roundNs).toBe(60 * MS)
    expect((TAGS.length * PLAN.roundNs / PLAN.blockNs * 100).toFixed(0)).toBe('30')
    expect(cell(3, 0, 1)).toBe('1 of 10')
    expect(cell(3, 1, 1)).toBe('3 of 10')
  })

  it('the two shares differ tenfold and more: 10.3× on the phone, 24.5× on the anchor', () => {
    // "The two shares differ tenfold and more." — "and more" is the anchor's row, which is the
    // larger ratio of the two
    const tagRatio = PLAN.roundNs / radioOnNs(recs(), 'uwb-1', PLAN.blockNs)
    const ancRatio = TAGS.length * PLAN.roundNs / radioOnNs(recs(), 'anchor-1', PLAN.blockNs)
    expect(tagRatio.toFixed(1)).toBe('10.3')
    expect(ancRatio.toFixed(1)).toBe('24.5')
    for (const r of [tagRatio, ancRatio]) expect(r).toBeGreaterThanOrEqual(10)
    expect(ancRatio).toBeGreaterThan(tagRatio)
    expect(prose()).toContain('The two shares differ tenfold and more')
  })

  it('the radio-on share of the block is 0.97 % for the phone and 1.22 % for the anchor', () => {
    // the radio table: uwb-1, 1 of 10 rounds, 10 of 10 slots, 1 934 334 ns, 0.97 %;
    //                  anchor-1, 3 of 10 rounds, 4 of 10 slots × 3, 2 448 546 ns, 1.22 %
    const tag = radioOnNs(recs(), 'uwb-1', PLAN.blockNs)
    const anc = radioOnNs(recs(), 'anchor-1', PLAN.blockNs)
    expect(tag).toBe(1_934_334)
    expect(anc).toBe(2_448_546)
    expect((tag / PLAN.blockNs * 100).toFixed(2)).toBe('0.97')
    expect((anc / PLAN.blockNs * 100).toFixed(2)).toBe('1.22')
    const rows: [string, string, string, string, string][] = [
      ['uwb-1', '1 of 10', '10 of 10', '1 934 334 ns', '0.97 %'],
      ['anchor-1', '3 of 10', '4 of 10 × 3', '2 448 546 ns', '1.22 %'],
    ]
    rows.forEach((row, i) => row.forEach((v, j) => expect(cell(3, i, j), `${row[0]} ${j}`).toBe(v)))
    expect(Number(rows[0][3].replace(/[\sn]|s$/g, ''))).toBe(tag)
    expect(Number(rows[1][3].replace(/[\sn]|s$/g, ''))).toBe(anc)
    // "barely one part in a hundred of the block", the picture's claim for the anchor
    expect(anc / PLAN.blockNs).toBeLessThan(0.013)
    // the other two tags pay the same to the nanosecond-or-so, and every anchor pays the same
    for (const t of TAGS) expect(Math.abs(radioOnNs(recs(), t, PLAN.blockNs) - tag), t).toBeLessThan(100)
    for (let i = 1; i <= ANCHORS; i++) {
      expect(Math.abs(radioOnNs(recs(), `anchor-${i}`, PLAN.blockNs) - anc), `anchor-${i}`).toBeLessThan(100)
    }
  })

  it('the phone’s radio time is its round’s airtime plus 13 ns of flight per reception', () => {
    // "Going deeper": "its 1 934 334 ns is exactly the round’s airtime, 1 934 230 ns, plus 13 ns
    //  of flight for each of the eight frames it receives"
    const airtime = ofType(recs(), 'TX_START')
      .filter((r) => r.t < PLAN.roundNs)
      .reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect(airtime).toBe(1_934_230)
    const rxCount = ofType(recs(), 'UWB_TS').filter((r) => r.node === 'uwb-1' && r.dir === 'rx' && r.t < PLAN.roundNs)
    expect(rxCount).toHaveLength(8)
    expect(radioOnNs(recs(), 'uwb-1', PLAN.blockNs)).toBe(airtime + 8 * 13)
    expect(prose()).toContain('the round’s airtime, 1 934 230 ns, plus 13 ns of flight')
  })

  it('the anchor wakes four times in a ten-slot round: 816 180 ns in the first, 2 448 546 over three', () => {
    // "Going deeper": "it hears the Poll, sends its Response, hears the Final, sends its Report —
    //  four wake-ups in ten slots, 816 180 ns in the first round — and is deaf through the other
    //  anchors’ slots. Three rounds, differing by nanoseconds of flight, make 2 448 546 ns."
    expect(radioOnNs(recs(), 'anchor-1', PLAN.roundNs)).toBe(816_180)
    // four wake-ups: each is an idle → (uwbWait | tx) transition inside the round
    const states = ofType(recs(), 'MAC_STATE').filter((r) => r.node === 'anchor-1' && r.t < PLAN.roundNs)
    expect(states.map((r) => `${r.t}:${r.state}`)).toEqual([
      '0:uwbWait', '13:rx', '206872:idle',
      '2000000:tx', '2181218:idle',
      '10000000:uwbWait', '10000013:rx', '10236616:idle',
      '12000000:tx', '12191474:idle',
    ])
    // deaf in slots 1–4 except its own, and in slots 6–9 except its own: it never leaves idle there
    expect(states.filter((r) => r.state !== 'idle').map((r) => Math.floor(r.t / PLAN.slotNs)))
      .toEqual([0, 0, 1, 5, 5, 6])
    // the three rounds are not equal: the flight to each tag rounds differently, so the total is
    // the measured sum and not three times the first round. The prose says exactly that.
    const perRound = [0, 1, 2].map((k) =>
      radioOnNs(recs(), 'anchor-1', (k + 1) * PLAN.roundNs, k * PLAN.roundNs))
    expect(perRound).toEqual([816_180, 816_194, 816_172])
    expect(perRound.reduce((a, b) => a + b, 0)).toBe(2_448_546)
    expect(radioOnNs(recs(), 'anchor-1', PLAN.blockNs)).toBe(2_448_546)
    // "differing by nanoseconds of flight": tens of ns apart, never microseconds
    expect(Math.max(...perRound) - Math.min(...perRound)).toBeLessThan(100)
    expect(perRound.some((v) => v !== perRound[0])).toBe(true)
    expect(prose()).toContain('four wake-ups in ten slots, 816 180 ns in the first round')
  })
})

describe('uwb-blocks · the slot-fit rule', () => {
  it('the printed rule is the engine’s uwbSlotFitNs, term for term', () => {
    // "slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4"
    const formulas = uwbBlocks.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(formulas).toHaveLength(1)
    expect(formulas[0].text.en)
      .toBe('slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4')
    expect(formulas[0].text.zh).toBe(formulas[0].text.en)
    expect(uwbFinalBytes(ANCHORS)).toBe(62)
    expect(uwbPpduNs(uwbFinalBytes(ANCHORS))).toBe(236_603)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_603 + UWB_SLOT_GUARD_NS)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_803)
    // "a 200 ns flight guard, which is 60 m of air"
    expect((UWB_SLOT_GUARD_NS * 0.299792458).toFixed(0)).toBe('60')
    expect(prose()).toContain('a 200 ns flight guard, which is 60 m of air')
    // "Going deeper": "A four-anchor Final is 62 octets and 236 603 ns on the air"
    expect(prose()).toContain('Final is 62 octets and 236 603 ns on the air')
  })

  it('the schema refuses 282 twice, refuses 285 on the floor alone, and takes 300', () => {
    // "Going deeper": "282 RSTU (235.0 µs) is refused twice, by the floor and by the fit rule,
    //  while 285 RSTU (237.5 µs) clears the fit rule by 697 ns and is still refused by the floor.
    //  The shortest slot this scene accepts is therefore 300 RSTU, 250.0 µs."
    const floor = 'Number must be greater than or equal to 300'
    expect(rstuNs(282)).toBe(235_000)
    expect(rstuNs(285)).toBe(237_500)
    expect(rstuNs(300)).toBe(250_000)
    const at282 = schemaIssues(282)
    expect(at282).toHaveLength(2)
    expect(at282).toContain(floor)
    expect(at282.some((m) => m.includes('235.0 µs') && m.includes('236.8 µs'))).toBe(true)
    expect(rstuNs(282)).toBeLessThan(uwbSlotFitNs(ANCHORS))
    const at285 = schemaIssues(285)
    expect(at285).toEqual([floor])
    expect(rstuNs(285) - uwbSlotFitNs(ANCHORS)).toBe(697)
    expect(schemaIssues(300)).toEqual([])
    // 285 and 282 are both whole numbers of 3-RSTU units, so that rule is not what refuses them
    expect(285 % 3).toBe(0)
    expect(285 / 3).toBe(95)
    expect(282 % 3).toBe(0)
    // "The fit rule only overtakes the floor once the Final grows: at six anchors it asks
    //  267 572 ns, which is 324 RSTU."
    expect(uwbSlotFitNs(6)).toBe(267_572)
    expect(rstuNs(324)).toBeGreaterThanOrEqual(uwbSlotFitNs(6))
    expect(rstuNs(321)).toBeLessThan(uwbSlotFitNs(6))
    expect(rstuNs(324)).toBeGreaterThan(rstuNs(300))
    for (const n of [1, 2, 3, 4, 5]) expect(uwbSlotFitNs(n), `fit ${n}`).toBeLessThanOrEqual(rstuNs(300))
  })

  it('a 2 ms slot leaves the Final on 11.8 % of it, and 20 ppm over a block is 4 µs', () => {
    // "it leaves that frame on 11.8 % of its own slot" / "Going deeper": "here a slot boundary is
    //  exact, but 20 ppm across a 200 ms block is 4 µs each way"
    expect((uwbPpduNs(uwbFinalBytes(ANCHORS)) / PLAN.slotNs * 100).toFixed(1)).toBe('11.8')
    expect((PLAN.blockNs * 20e-6 / 1000).toFixed(0)).toBe('4')
    // "nearly nine tenths silence": the Final is under a seventh of its slot
    expect(uwbPpduNs(uwbFinalBytes(ANCHORS)) / PLAN.slotNs).toBeLessThan(0.15)
    // "here a slot boundary is exact": the schedule is laid out in true time, so a slot start
    // never drifts, whatever each device's own crystal does (which the model does draw)
    for (const r of ofType(recs(), 'TX_START')) expect(r.t % PLAN.slotNs, `${r.node}@${r.t}`).toBe(0)
  })
})

describe('uwb-blocks · the 0.5 ms variant', () => {
  it('the round falls to 5.0 ms, 40 rounds fit the block, and the fixes come at 5, 10 and 15 ms', () => {
    // the "Two slot lengths, one scene" table's second row, and the first experiment: "the three
    // rounds finish by 15 ms, the fixes land at 5, 10 and 15 ms, and the editor plans 40 rounds
    // per block instead of ten"
    const vplan = roundPlan(uwbBlocks.variants![0].scenario().uwb!, ANCHORS)
    expect(vplan.slotNs).toBe(500_000)
    expect(vplan.roundNs).toBe(5 * MS)
    expect(vplan.slots).toBe(PLAN.slots)
    expect(vplan.blockNs).toBe(PLAN.blockNs)
    expect(vplan.roundsPerBlock).toBe(40)
    const vrows: [string, string, string, string, string][] = [
      ['2 400 RSTU · 2 ms', '20.0 ms', '10', '60 ms', '1 934 334 ns'],
      ['600 RSTU · 0.5 ms', '5.0 ms', '40', '15 ms', '1 934 334 ns'],
    ]
    vrows.forEach((row, i) => row.forEach((v, j) => expect(cell(4, i, j), `${row[0]} ${j}`).toBe(v)))
    expect(ofType(recs(0), 'UWB_ROUND_END').slice(0, 3).map((r) => `${r.node}@${r.t / MS}`))
      .toEqual(['uwb-1@5', 'uwb-2@10', 'uwb-3@15'])
    expect(ofType(recs(0), 'UWB_POSITION').filter((f) => f.block === 0).map((f) => `${f.node}@${f.t / MS}`))
      .toEqual(['uwb-1@5', 'uwb-2@10', 'uwb-3@15'])
    expect(ofType(recs(0), 'UWB_TIMEOUT')).toHaveLength(0)
    expect(fmtRecord(ofType(recs(0), 'UWB_ROUND')[0]))
      .toBe('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 500.0 µs')
    // "The same ten frames, four times closer together"
    expect(ofType(recs(0), 'TX_START').filter((r) => r.t < vplan.roundNs).map((r) => `${r.node}/${r.frame.kind}`))
      .toEqual(ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs).map((r) => `${r.node}/${r.frame.kind}`))
    expect(PLAN.slotNs / vplan.slotNs).toBe(4)
  })

  it('the radio-on total does not move: 1 934 334 ns, 0.97 %, on both scenes', () => {
    // "the radio-on total does not move, to the nanosecond, because no frame changed length" —
    // and the table's last column, identical on both rows
    expect(radioOnNs(recs(0), 'uwb-1', PLAN.blockNs)).toBe(1_934_334)
    expect((radioOnNs(recs(0), 'uwb-1', PLAN.blockNs) / PLAN.blockNs * 100).toFixed(2)).toBe('0.97')
    expect(cell(4, 0, 4)).toBe(cell(4, 1, 4))
    // all three phones, each identical to its own figure in the base run
    for (const t of TAGS) {
      expect(radioOnNs(recs(0), t, PLAN.blockNs), t).toBe(radioOnNs(recs(), t, PLAN.blockNs))
      expect(Math.abs(radioOnNs(recs(0), t, PLAN.blockNs) - 1_934_334), t).toBeLessThan(100)
    }
    // the round's own share of the block is what moved: 10 % to 2.5 %
    const vplan = roundPlan(uwbBlocks.variants![0].scenario().uwb!, ANCHORS)
    expect((vplan.roundNs / vplan.blockNs * 100).toFixed(1)).toBe('2.5')
    // and the airtime of a round is identical, frame for frame
    const air = (rs: TLRecord[], until: number): number =>
      ofType(rs, 'TX_START').filter((r) => r.t < until).reduce((s, r) => s + r.frame.txTimeNs, 0)
    expect(air(recs(0), vplan.roundNs)).toBe(air(recs(), PLAN.roundNs))
  })

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

  it('each language quotes the plan line its own editor prints, word for word', () => {
    // The sentence tells the learner to read the session section, so it has to quote what that
    // section renders — `E.uwbPlan(slots, rounds)` — in the language they are reading it in.
    // A Chinese learner never sees the English string, and a relabel must break this test.
    const three = roundPlan(SESSION, ANCHORS - 1)
    const quoted = (s: string): string => `“${s}”`
    expect(uwbBlocks.tryThis[1].en)
      .toContain(quoted(STRINGS.en.editor.uwbPlan(three.slots, three.roundsPerBlock)))
    expect(uwbBlocks.tryThis[1].zh)
      .toContain(quoted(STRINGS.zh.editor.uwbPlan(three.slots, three.roundsPerBlock)))
    // and the base scene's own plan is what the lesson quotes in the grid table
    expect(prose()).toContain(`${PLAN.slots} slots × 2000.0 µs`)
  })

  it('typing 285 into the editor’s slot field really does snap to 300', () => {
    // "Then type 285 into the slot field and leave it: it snaps to 300." The field is an
    // RstuInput with lo = 300 that clamps on blur and rounds to a whole 3-RSTU unit
    // (src/uwb/ui/UwbSessionFields.tsx), so this is that pair of steps.
    const to3 = (rstu: number): number => Math.max(3, Math.round(rstu / 3) * 3)
    expect(to3(clampField('285', 300, 60_000, true))).toBe(300)
    expect(to3(clampField('282', 300, 60_000, true))).toBe(300)
    // and 300 is exactly the floor the schema refuses to go under
    expect(schemaIssues(300)).toEqual([])
    expect(schemaIssues(297)).toContain('Number must be greater than or equal to 300')
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
    // the order of the engine: the plan's three lengths, the round each tag owns,
    // the slot's start, who transmits in it, who listens, and the miss
    const en = steps().items.map((s) => s.en)
    const order = ['slot count', 'Round k goes to phone k', 'multiplication', 'may transmit', 'own id', 'no retry']
    order.forEach((token, i) => expect(en[i], token).toContain(token))
  })

  it('step 1: the slot count is the method’s, two per anchor plus two', () => {
    expect(PLAN.slots).toBe(uwbSlotsPerTag(SESSION.method, ANCHORS))
    expect(PLAN.slots).toBe(2 * ANCHORS + 2)
    expect(steps().items[0].en).toContain('two per anchor plus two')
    // and the two lengths the step says are fixed are the session's own, untouched by the run
    expect(PLAN.blockNs).toBe(rstuNs(SESSION.blockRstu))
    expect(PLAN.slotNs).toBe(rstuNs(SESSION.slotRstu))
  })

  it('step 2: round k belongs to phone k, in every block', () => {
    const rounds = ofType(recs(), 'UWB_ROUND')
    for (const r of rounds) expect(r.round, `${r.node} block ${r.block}`).toBe(TAGS.indexOf(r.node))
    // two blocks' worth, so "in every block" is measured and not assumed
    expect(new Set(rounds.map((r) => r.block)).size).toBeGreaterThan(1)
    expect(steps().items[1].en).toContain('rounds 0, 1 and 2')
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
    expect([cell(5, 0, 1), cell(5, 1, 1)]).toEqual(['0 · 1', '1 × 20.0 ms = 20 ms'])
    expect(open.block).toBe(0)
    expect(open.round).toBe(1)
    expect(open.t).toBe(open.round * PLAN.roundNs)
    const slots = ofType(recs(), 'UWB_SLOT').filter((r) => r.node === 'uwb-2' && r.t < PLAN.blockNs)
    expect(cell(5, 2, 1)).toBe(`${slots[0].t.toLocaleString('en-US').replace(/,/g, ' ')} ns`)
    expect(cell(5, 3, 1)).toBe(`${slots[5].t.toLocaleString('en-US').replace(/,/g, ' ')} ns`)
    // slot 5 is the Final's, which is where the procedure's step 4 puts it
    expect(ofType(recs(), 'TX_START').find((r) => r.node === 'uwb-2' && r.frame.kind === 'uwbFinal')!.t)
      .toBe(slots[5].t)
    // the round ends, and the fix lands, at the end of its last slot
    const end = ofType(recs(), 'UWB_ROUND_END').find((r) => r.node === 'uwb-2')!
    const fix = ofType(recs(), 'UWB_POSITION').find((r) => r.node === 'uwb-2')!
    expect(cell(5, 4, 1)).toBe(`${end.t.toLocaleString('en-US').replace(/,/g, ' ')} ns`)
    expect(fix.t).toBe(end.t)
    expect(end.t).toBe(open.t + PLAN.roundNs)
  })
})
