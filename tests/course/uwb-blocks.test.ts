/**
 * Every empirical claim in the "Blocks, rounds and slots" lesson, measured
 * against the lesson's own scenario and its variant. Each assertion quotes the
 * sentence it guards, copied from the shipped string; the schedule constants,
 * frame sizes and slot-fit rule come from the engine's own exports
 * (src/uwb/session.ts, src/uwb/phy.ts) and from the scenario schema itself
 * rather than being re-typed here.
 */
import { describe, it, expect } from 'vitest'
import { uwbBlocks, uwbBlocksScenario } from '../../src/course/uwb/uwb-blocks'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { roundPlan } from '../../src/uwb/session'
import {
  ARC_IE_BYTES, RSTU_CHIPS, UWB_MAX_ANCHORS, UWB_SLOT_GUARD_NS, rdmIeBytes, rstuNs, uwbFinalBytes,
  uwbPollBytes, uwbPpduNs, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'

const MS = 1_000_000
/** Two blocks and a little more, so the repeat is visible and the second block's rounds all close. */
const RUN_NS = 300 * MS
const ANCHORS = 4
const TAGS = ['uwb-1', 'uwb-2', 'uwb-3']

/** The scenario each part of the lesson runs: the base, then variant 0. */
const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbBlocks.scenario() : uwbBlocks.variants![variant].scenario()

const SESSION = uwbBlocks.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

const memo = new Map<string, TLRecord[]>()
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) memo.set(key, [...new Simulation(scenarioOf(variant)).runUntil(RUN_NS).records])
  return memo.get(key)!
}

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)

/**
 * Nanoseconds a node's radio spends out of `idle` inside [0, untilNs) — the
 * uwbWait + rx + tx of the MAC_STATE lane, which is what the lesson calls the
 * radio share. Every device starts a run idle.
 */
function radioOnNs(rs: TLRecord[], node: string, untilNs: number): number {
  let state: string = 'idle'
  let since = 0
  let on = 0
  for (const r of ofType(rs, 'MAC_STATE')) {
    if (r.node !== node || r.t >= untilNs) continue
    if (state !== 'idle') on += r.t - since
    state = r.state
    since = r.t
  }
  if (state !== 'idle') on += untilNs - since
  return on
}

/** The lesson's nth table, rows kept in place so a cell can be checked by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbBlocks.body.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en

/** Everything the learner reads, joined — for "is this number actually printed?" checks. */
const prose = (): string => {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.en === 'string') { out.push(o.en); return }
    for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
  }
  walk({ body: uwbBlocks.body, observe: uwbBlocks.observe, tryThis: uwbBlocks.tryThis, quiz: uwbBlocks.quiz })
  return out.join('\n')
}

/** What the scenario schema says about a slot length, in this scene's geometry. */
function schemaIssues(slotRstu: number): string[] {
  const parsed = ScenarioSchema.safeParse(uwbBlocksScenario(slotRstu))
  return parsed.success ? [] : parsed.error.issues.map((i) => i.message)
}

describe('uwb-blocks · lesson shape', () => {
  it('the scenario and the variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbBlocks.scenario())).not.toThrow()
    expect(uwbBlocks.variants).toHaveLength(1)
    for (const v of uwbBlocks.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbBlocks) / 150
      + OBSERVE_MINUTES * uwbBlocks.observe.length + TRY_MINUTES * uwbBlocks.tryThis.length
    expect(lessonMinutes(uwbBlocks)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbBlocks)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbBlocks)).toBeLessThanOrEqual(25)
    // the header's word budget: 25 minutes needs at most 1724 words, because 1725 makes raw
    // exactly 27.5 and Math.round(5.5) rounds up
    expect(lessonWords(uwbBlocks)).toBeLessThanOrEqual(1724)
    const at1725 = 1725 / 150 + OBSERVE_MINUTES * 4 + TRY_MINUTES * 2
    expect(Math.round(at1725 / 5) * 5).toBe(30)
    // the module it belongs to: UWB Tier 1, "Ranging sessions and positioning"
    expect(uwbBlocks.module).toBe(12)
    expect(uwbBlocks.id).toBe('uwb-blocks')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbBlocks.jumps).toHaveLength(5)
    expect(uwbBlocks.observe).toHaveLength(4)
    expect(uwbBlocks.tryThis).toHaveLength(2)
    expect(uwbBlocks.quiz).toHaveLength(3)
    for (const q of uwbBlocks.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs()
    const at: number[] = []
    for (const j of uwbBlocks.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      at.push(i)
    }
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // the fix and the round end are the same instant, in that order; the second tag's
    // round opens there too, and the block repeats a whole block later
    expect(rs[at[0]].t).toBe(0)
    expect([rs[at[1]].t, rs[at[2]].t, rs[at[3]].t]).toEqual([PLAN.roundNs, PLAN.roundNs, PLAN.roundNs])
    expect(rs[at[4]].t).toBe(PLAN.blockNs)
  })

  it('every string a learner reads exists in both languages', () => {
    const seen: L10n[] = []
    const isL10n = (o: Record<string, unknown>): o is Record<string, unknown> & L10n =>
      typeof o.en === 'string' && typeof o.zh === 'string'
    const walk = (x: unknown): void => {
      if (x == null || typeof x === 'function') return
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isL10n(o)) { seen.push(o); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
    walk({ title: uwbBlocks.title, body: uwbBlocks.body, observe: uwbBlocks.observe, tryThis: uwbBlocks.tryThis, quiz: uwbBlocks.quiz, variants: uwbBlocks.variants, jumps: uwbBlocks.jumps })
    expect(seen.length).toBeGreaterThan(50)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('names the standard clauses it leans on, and the model numbers are the engine’s', () => {
    const first = uwbBlocks.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    for (const s of ['IEEE Std 802.15.4-2024', '§10.32.2', '§10.29.1.5', 'Table 10-145', '§10.32.9.1', '§10.32.9.8']) {
      expect(en, s).toContain(s)
    }
    for (const s of ['2 ms slot', '200 ms block', 'FiRa']) expect(en, s).toContain(s)
    // "the RSTU itself at 416 chips, which is 833.333 ns at 499.2 Mchip/s"
    expect(en).toContain('416 chips, which is 833.333 ns at 499.2 Mchip/s')
    expect(RSTU_CHIPS).toBe(416)
    expect((RSTU_CHIPS * 1000 / 499.2).toFixed(3)).toBe('833.333')
    // "the 200 ns of flight guard the slot-fit rule adds to the longest frame, the floor of
    //  300 RSTU the scenario schema puts under any slot, and the nine anchors one Final can list"
    expect(en).toContain('200 ns of flight guard')
    expect(UWB_SLOT_GUARD_NS).toBe(200)
    expect(en).toContain('floor of 300 RSTU')
    expect(schemaIssues(297)).toContain('Number must be greater than or equal to 300')
    expect(schemaIssues(300)).toEqual([])
    expect(en).toContain('nine anchors one Final can list')
    expect(UWB_MAX_ANCHORS).toBe(9)
  })
})

describe('uwb-blocks · the scene', () => {
  it('is lesson 2’s four anchors with three phones under them, and only the slot varies', () => {
    // "Lesson 2's four anchors, on the same 3.50 m ring around (5, 4) at 2.20 m, now serving
    //  three phones at desk height"
    const s = uwbBlocks.scenario()
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
    // "Load “0.5 ms slots”. At 600 RSTU the round falls to 5.0 ms"
    expect(uwbBlocks.variants![0].label).toEqual({ en: '0.5 ms slots', zh: '0.5 ms 时隙' })
    const v = uwbBlocks.variants![0].scenario()
    expect(v.uwb!.slotRstu).toBe(600)
    expect(rstuNs(600)).toBe(500_000)
    expect(JSON.stringify({ ...v, uwb: { ...v.uwb!, slotRstu: 2400 } }))
      .toBe(JSON.stringify(uwbBlocks.scenario()))
    expect(v).toEqual(uwbBlocksScenario(600))
    expect(uwbBlocks.scenario()).toEqual(uwbBlocksScenario(2400))
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

  it('ten rounds fit the block, three are used, and rounds 3 to 9 never open', () => {
    // "Ten rounds fit inside the block, and this scene holds three tags, so rounds 0, 1 and 2
    //  belong to uwb-1, uwb-2 and uwb-3 while rounds 3 to 9 — 140 ms of every block — stay
    //  empty." / "Rounds 3 to 9 never open at all."
    expect(PLAN.roundsPerBlock).toBe(10)
    expect(TAGS.length).toBe(3)
    expect((PLAN.roundsPerBlock - TAGS.length) * PLAN.roundNs).toBe(140 * MS)
    const rounds = ofType(recs(), 'UWB_ROUND')
    expect(rounds.filter((r) => r.block === 0).map((r) => `${r.node}/r${r.round}@${r.t / MS}`))
      .toEqual(['uwb-1/r0@0', 'uwb-2/r1@20', 'uwb-3/r2@40'])
    expect(rounds.filter((r) => r.block === 1).map((r) => `${r.node}/r${r.round}@${r.t / MS}`))
      .toEqual(['uwb-1/r0@200', 'uwb-2/r1@220', 'uwb-3/r2@240'])
    expect(new Set(rounds.map((r) => r.round))).toEqual(new Set([0, 1, 2]))
    // "uwb-1 again at 200 ms, uwb-2 at 220, uwb-3 at 240"
    expect(rounds.map((r) => r.t).slice(0, 6)).toEqual([0, 20, 40, 200, 220, 240].map((ms) => ms * MS))
    // "The round line reads “uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs”"
    expect(fmtRecord(rounds[0])).toBe('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs')
    // "its round ends": the end of each tag's round, at 20, 40 and 60 ms
    expect(ofType(recs(), 'UWB_ROUND_END').slice(0, 3).map((r) => `${r.node}@${r.t / MS}`))
      .toEqual(['uwb-1@20', 'uwb-2@40', 'uwb-3@60'])
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('each phone gets one fix per block — five a second — and each is 2 cm out or better', () => {
    // "Each phone therefore gets exactly one fix per block, five a second" /
    // "uwb-1 at (5.01, 3.99) m at 20 ms with a GDOP of 1.06, uwb-2 at (3.01, 2.52) m at 40 ms
    //  with 1.08, uwb-3 at (7.50, 6.01) m at 60 ms with 1.06"
    expect(1000 / (PLAN.blockNs / MS)).toBe(5)
    const fixes = ofType(recs(), 'UWB_POSITION')
    for (const tag of TAGS) expect(fixes.filter((f) => f.node === tag && f.block === 0)).toHaveLength(1)
    expect(fixes.filter((f) => f.block === 0).map((f) => `${f.node}@${f.t / MS}`))
      .toEqual(['uwb-1@20', 'uwb-2@40', 'uwb-3@60'])
    expect(fixes.filter((f) => f.block === 0).map((f) => fmtRecord(f))).toEqual([
      'uwb-1 position (5.01, 3.99) m, true (5.00, 4.00), error 0.02 m, GDOP 1.06, 4 anchors',
      'uwb-2 position (3.01, 2.52) m, true (3.00, 2.50), error 0.02 m, GDOP 1.08, 4 anchors',
      'uwb-3 position (7.50, 6.01) m, true (7.50, 6.00), error 0.01 m, GDOP 1.06, 4 anchors',
    ])
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
    // "a TX_START timestamp is its slot’s start to the nanosecond — the three Polls of block 0
    //  at 0, 20 000 000 and 40 000 000 ns" / "there is no IFS, no backoff draw and no NAV"
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.blockNs)
    for (const r of tx) expect(r.t % PLAN.slotNs, `${r.node}/${r.frame.kind}@${r.t}`).toBe(0)
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

  it('the Poll carries the whole schedule: an ARC IE of 10 octets and an RDM IE of 15', () => {
    // "it rides in the tag’s Poll, 39 octets" / "The ARC IE, 10 octets, … “SP1 · DS-TWR ·
    //  block 0 · round 0 · 4 responders”. The RDM IE, 15 octets, … “4 devices: anchor-1 slot 1,
    //  anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4” — three octets per device"
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame
    expect(poll.bytes).toBe(39)
    expect(poll.bytes).toBe(uwbPollBytes(ANCHORS))
    const fields = uwbFrameFields(poll).users[0].subframes[0].mpdu.fields
    const arc = fields.find((f) => f.key === 'ieArc')!
    const rdm = fields.find((f) => f.key === 'ieRdm')!
    expect(arc.bytes).toBe(ARC_IE_BYTES)
    expect(arc.bytes).toBe(10)
    expect(arc.value).toBe('SP1 · DS-TWR · block 0 · round 0 · 4 responders')
    expect(rdm.bytes).toBe(rdmIeBytes(ANCHORS))
    expect(rdm.bytes).toBe(15)
    expect(rdm.value).toBe('4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4')
    // three octets per device: a short address and a slot index
    expect(rdmIeBytes(5) - rdmIeBytes(4)).toBe(3)
  })
})

describe('uwb-blocks · what the radio costs', () => {
  it('the schedule share is 10 % for a tag and 30 % for an anchor', () => {
    // "a tag owns one round of ten, 20 ms of 200 ms, 10 %, while the anchors serve every round
    //  that has a tag in it — three of them, 60 ms, 30 %"
    expect((PLAN.roundNs / PLAN.blockNs * 100).toFixed(0)).toBe('10')
    expect(TAGS.length * PLAN.roundNs).toBe(60 * MS)
    expect((TAGS.length * PLAN.roundNs / PLAN.blockNs * 100).toFixed(0)).toBe('30')
  })

  it('the radio share of the block is 0.97 % for the tag and 1.22 % for the anchor', () => {
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
    rows.forEach((row, i) => row.forEach((v, j) => expect(cell(1, i, j), `${row[0]} ${j}`).toBe(v)))
    expect(Number(rows[0][3].replace(/[\sn]|s$/g, ''))).toBe(tag)
    expect(Number(rows[1][3].replace(/[\sn]|s$/g, ''))).toBe(anc)
    // the other two tags pay the same to the nanosecond-or-so, and every anchor pays the same
    for (const t of TAGS) expect(Math.abs(radioOnNs(recs(), t, PLAN.blockNs) - tag), t).toBeLessThan(100)
    for (let i = 1; i <= ANCHORS; i++) {
      expect(Math.abs(radioOnNs(recs(), `anchor-${i}`, PLAN.blockNs) - anc), `anchor-${i}`).toBeLessThan(100)
    }
  })

  it('the tag’s radio time is its round’s airtime plus 13 ns of flight per reception', () => {
    // "its 1 934 334 ns is exactly the round’s airtime, 1 934 230 ns, plus 13 ns of flight for
    //  each of the eight frames it receives"
    const airtime = ofType(recs(), 'TX_START')
      .filter((r) => r.t < PLAN.roundNs)
      .reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect(airtime).toBe(1_934_230)
    const rxCount = ofType(recs(), 'UWB_TS').filter((r) => r.node === 'uwb-1' && r.dir === 'rx' && r.t < PLAN.roundNs)
    expect(rxCount).toHaveLength(8)
    expect(radioOnNs(recs(), 'uwb-1', PLAN.blockNs)).toBe(airtime + 8 * 13)
  })

  it('the anchor wakes four times in a ten-slot round: 816 180 ns, three rounds over', () => {
    // "it hears the Poll, transmits its Response, hears the Final, transmits its Report — four
    //  wake-ups in ten slots, 816 180 ns — and is deaf through the other anchors’ slots
    //  entirely. Three rounds of that make 2 448 546 ns."
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
    expect(radioOnNs(recs(), 'anchor-1', PLAN.blockNs)).toBe(2_448_546)
    expect(3 * 816_180).toBeLessThan(2_448_546)
    expect(2_448_546 - 3 * 816_180).toBeLessThan(200)
  })
})

describe('uwb-blocks · the slot-fit rule', () => {
  it('the printed rule is the engine’s uwbSlotFitNs, term for term', () => {
    // "slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4"
    const formulas = uwbBlocks.body.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(formulas).toHaveLength(1)
    expect(formulas[0].text.en)
      .toBe('slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4')
    expect(formulas[0].text.zh).toBe(formulas[0].text.en)
    expect(uwbFinalBytes(ANCHORS)).toBe(62)
    expect(uwbPpduNs(uwbFinalBytes(ANCHORS))).toBe(236_603)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_603 + UWB_SLOT_GUARD_NS)
    expect(uwbSlotFitNs(ANCHORS)).toBe(236_803)
    // "the Final — 62 octets for four anchors, 236 603 ns on the air"; the 200 ns guard is 60 m
    expect((UWB_SLOT_GUARD_NS * 0.299792458).toFixed(0)).toBe('60')
    expect(prose()).toContain('200 ns guard, which is 60 m of flight')
  })

  it('the schema refuses 282 twice, refuses 285 on the floor alone, and takes 300', () => {
    // "282 RSTU (235.0 µs) is refused twice over, once by the floor and once by the fit rule,
    //  while 285 RSTU (237.5 µs) clears the fit rule by 697 ns and is still refused by the
    //  floor. The shortest slot this scene accepts is 300 RSTU, 250.0 µs."
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
    // "The fit rule only becomes the binding one once the Final grows: at six anchors it asks
    //  for 267 572 ns, which is 324 RSTU and past the floor."
    expect(uwbSlotFitNs(6)).toBe(267_572)
    expect(rstuNs(324)).toBeGreaterThanOrEqual(uwbSlotFitNs(6))
    expect(rstuNs(321)).toBeLessThan(uwbSlotFitNs(6))
    expect(rstuNs(324)).toBeGreaterThan(rstuNs(300))
    for (const n of [1, 2, 3, 4, 5]) expect(uwbSlotFitNs(n), `fit ${n}`).toBeLessThanOrEqual(rstuNs(300))
  })

  it('a 2 ms slot leaves the Final on 11.8 % of it, and 20 ppm over a block is 4 µs', () => {
    // "it leaves the Final occupying 11.8 % of its own slot" / "20 ppm across 200 ms is 4 µs
    //  each way"
    expect((uwbPpduNs(uwbFinalBytes(ANCHORS)) / PLAN.slotNs * 100).toFixed(1)).toBe('11.8')
    expect((PLAN.blockNs * 20e-6 / 1000).toFixed(0)).toBe('4')
  })
})

describe('uwb-blocks · the 0.5 ms variant', () => {
  it('the round falls to 5.0 ms, 40 rounds fit the block, and the fixes come at 5, 10 and 15 ms', () => {
    // "At 600 RSTU the round falls to 5.0 ms, all three tags are finished 15 ms into a 200 ms
    //  block, and 40 rounds fit where 10 did. The fixes arrive at 5, 10 and 15 ms"
    const vplan = roundPlan(scenarioOf(0).uwb!, ANCHORS)
    expect(vplan.slotNs).toBe(500_000)
    expect(vplan.roundNs).toBe(5 * MS)
    expect(vplan.slots).toBe(PLAN.slots)
    expect(vplan.blockNs).toBe(PLAN.blockNs)
    expect(vplan.roundsPerBlock).toBe(40)
    expect(ofType(recs(0), 'UWB_ROUND_END').slice(0, 3).map((r) => `${r.node}@${r.t / MS}`))
      .toEqual(['uwb-1@5', 'uwb-2@10', 'uwb-3@15'])
    expect(ofType(recs(0), 'UWB_POSITION').filter((f) => f.block === 0).map((f) => `${f.node}@${f.t / MS}`))
      .toEqual(['uwb-1@5', 'uwb-2@10', 'uwb-3@15'])
    expect(ofType(recs(0), 'UWB_TIMEOUT')).toHaveLength(0)
    expect(fmtRecord(ofType(recs(0), 'UWB_ROUND')[0]))
      .toBe('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 500.0 µs')
    // "the coloured spans are the same ten frames four times closer together"
    expect(ofType(recs(0), 'TX_START').filter((r) => r.t < vplan.roundNs).map((r) => `${r.node}/${r.frame.kind}`))
      .toEqual(ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs).map((r) => `${r.node}/${r.frame.kind}`))
    expect(PLAN.slotNs / vplan.slotNs).toBe(4)
  })

  it('the radio-on total does not move at all: 1 934 334 ns, 0.97 %, on both scenes', () => {
    // "The radio-on total does not move at all — 1 934 334 ns, 0.97 % of the block, to the
    //  nanosecond — because no frame changed length." / "each tag’s radio-on is still 1 934 334 ns"
    expect(radioOnNs(recs(0), 'uwb-1', PLAN.blockNs)).toBe(1_934_334)
    expect(radioOnNs(recs(0), 'uwb-1', PLAN.blockNs)).toBe(radioOnNs(recs(), 'uwb-1', PLAN.blockNs))
    expect((radioOnNs(recs(0), 'uwb-1', PLAN.blockNs) / PLAN.blockNs * 100).toFixed(2)).toBe('0.97')
    // the round's own share of the block is what moved: 10 % to 2.5 %
    const vplan = roundPlan(scenarioOf(0).uwb!, ANCHORS)
    expect((vplan.roundNs / vplan.blockNs * 100).toFixed(1)).toBe('2.5')
    // and the airtime of a round is identical, frame for frame
    const air = (rs: TLRecord[], until: number): number =>
      ofType(rs, 'TX_START').filter((r) => r.t < until).reduce((s, r) => s + r.frame.txTimeNs, 0)
    expect(air(recs(0), vplan.roundNs)).toBe(air(recs(), PLAN.roundNs))
  })

  it('deleting an anchor takes the round to eight slots and the Final down 12 octets', () => {
    // "“slots per round 8 · rounds per block 12”, because a DS round is 2N + 2 slots — a 16 ms
    //  round, and a Final 12 octets shorter"
    const three = roundPlan(SESSION, ANCHORS - 1)
    expect(three.slots).toBe(8)
    expect(three.slots).toBe(2 * (ANCHORS - 1) + 2)
    expect(three.roundNs).toBe(16 * MS)
    expect(three.roundsPerBlock).toBe(12)
    expect(uwbFinalBytes(ANCHORS) - uwbFinalBytes(ANCHORS - 1)).toBe(12)
  })
})
