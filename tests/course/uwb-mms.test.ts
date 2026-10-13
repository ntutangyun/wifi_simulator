/**
 * Every empirical claim in "Sixteen milliseconds of energy", the picture half of the
 * old `uwb-mms`: the room a frame cannot cross, the shape of one round, what the
 * narrowband radio carries, and what the walls charge whatever the train achieves.
 * Each assertion quotes the sentence it guards, copied from the shipped string; the
 * narrowband message sizes, the round layout, the wall delay and the range floor come
 * from the engine's own exports rather than being re-typed here.
 *
 * The arithmetic — the millisecond's energy budget, the combining gains, the clock
 * ratio and the honest share of the gain over a 4z poll — is pinned next door, in
 * tests/course/uwb-mms-numbers.test.ts, which runs this same scene.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_Z, MMS_ANCHORS, TAG_POS, TAG_Z, uwbMms, uwbMmsScenario, type UwbMmsVariant,
} from '../../src/course/uwb/uwb-mms'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { brick, twoWallLab } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import {
  C_M_PER_NS, UWB_NLOS_NS, UWB_PL_EXP, UWB_RX_SENS_DBM, UWB_SLOT_GUARD_NS, fomText, rstuNs,
  uwbNbSlotFitNs, uwbPl0Db, uwbSlotFitNs,
} from '../../src/uwb/phy'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import {
  UWB_MS_BUDGET_NJ, combineGainDb, mmrsSymbolChips, mmsFragmentDbm, mmsLayout, mmsSet, rifStartMs,
  rsfChips, rsfNs, trainDetected,
} from '../../src/uwb/mms'
import {
  NB_CHIP_US, NB_DEFAULT_CHANNELS, NB_POLL_BYTES, NB_REPORT_BYTES, NB_REPORT_TIME_BYTES,
  NB_RESP_BYTES, NB_SYMBOL_CHIPS, NB_SYMBOL_US, nbCenterMhz, nbOtmPollBytes, nbPpduNs,
} from '../../src/uwb/nb'
import { rangeSigmaM } from '../../src/uwb/position'
import { roundPlan } from '../../src/uwb/session'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbFixRow, uwbNbChannelText, uwbTrainRows } from '../../src/uwb/ui/rows'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven blocks: block 6's three pair rounds are over by 1.242 s, block 7 starts at 1.400 s. */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = 'tag-1'
const ANCHORS = MMS_ANCHORS.map((a) => a.id)
/** Indices into `uwbMms.variants`. */
const V: Record<Exclude<UwbMmsVariant, 'base'>, number> = { four: 0, rsf1: 1, twr: 2, pairwise: 3 }

const scenarioOf = (v: UwbMmsVariant): Scenario =>
  v === 'base' ? uwbMms.scenario() : uwbMms.variants![V[v]].scenario()
const recs = (v: UwbMmsVariant): TLRecord[] => runOf(uwbMms, v === 'base' ? undefined : V[v], RUN_NS)

/** 3-D distance from an anchor to the tag, as the scene places them. */
const distTo = (a: { x: number; y: number }): number =>
  Math.hypot(a.x - TAG_POS.x, a.y - TAG_POS.y, ANCHOR_Z - TAG_Z)

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbMms).map((s) => s).join('\n')

/** The lesson's nth table of `numbers`: 0 is the room, 1 is the round's log lines. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbMms.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
/** The right-hand column of the log table, which is the line the log prints. */
const logLine = (row: number): string => cell(1, row, 1)
/** One row of the one-to-many/pairwise comparison table (table 2), without its "where" cell. */
/** The two figures of a comparison row — MMS and 4z. The label is the lesson's own words. */
const comparison = (row: number): string[] => [cell(2, row, 1), cell(2, row, 2)]
/** The procedure the lesson closes on: "One round, step by step", the only `steps` of `numbers`. */
const steps = (): string[] => {
  const b = uwbMms.numbers!.filter((x): x is Extract<Block, { kind: 'steps' }> => x.kind === 'steps')
  expect(b).toHaveLength(1)
  return b[0].items.map((i) => i)
}
/** The worked example under it (table 3): step `row` run on this scene, as one value cell. */
const worked = (row: number): string => cell(3, row, 1)

// The contract every migrated lesson owes. `npx tsx scripts/lesson-dump.ts uwb-mms`
// prints the lesson and the minutes it costs.
lessonShapeSuite(uwbMms)

describe('uwb-mms · the lesson', () => {
  it('opens UWB Tier 3, after uwb-aoa, and names its four new words', () => {
    expect(uwbMms.id).toBe('uwb-mms')
    expect(MODULES[uwbMms.module].title).toBe('多毫秒片段')
    // uwb-geometry too: the picture's last paragraph leans on the quality byte each range
    // carries flagging an obstructed path, which is uwb-geometry's FoM.
    expect(uwbMms.needs).toEqual(['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'])
    expect(uwbMms.terms!.map((t) => t.term)).toEqual(['MMS', 'fragment', 'RSF', 'RIF', 'sensitivity', 'margin'])
    expect(TIERS[6].track).toBe('uwb')
    expect(MODULES[uwbMms.module].tier).toBe(6)
    expect(COURSE_ORDER.indexOf('uwb-aoa')).toBeLessThan(COURSE_ORDER.indexOf('uwb-mms'))
    const ids = LESSONS.map((l) => l.id)
    expect(ids.indexOf('uwb-aoa')).toBeLessThan(ids.indexOf('uwb-mms'))
    // the reader is sent to the verdict on a train, which is what the lesson is about
  })

  it('it offers five jumps, three things to observe, two experiments and two questions', () => {
    expect(uwbMms.jumps).toHaveLength(5)
    expect(uwbMms.observe).toHaveLength(3)
    expect(uwbMms.tryThis).toHaveLength(2)
    expect(uwbMms.quiz).toHaveLength(2)
    for (const q of uwbMms.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbMms.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      idx.push(i)
    }
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // One-to-many: the poll opens the round at 0 and is followed by a response window per
    // anchor, so the first fragment goes out in slot 8 (4 ms) rather than slot 4; the train is
    // judged in the slot after the last fragment and the first report lands in slot 40.
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(4 * MS)
    expect(rs[idx[2]].t).toBe(18.5 * MS)
    expect(rs[idx[3]].t).toBe(20 * MS)
    expect(rs[idx[4]].t).toBe(20 * MS + nbPpduNs(NB_REPORT_BYTES) + 44)
  })

  it('says what is standard, what is draft and what is the room’s own — all of it in `sources`', () => {
    const src = uwbMms.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('草案')
    for (const doc of ['15-22/0381r5', '15-23/0100r2', '15-23/0502r3', '15-22/0205r0']) {
      expect(src, doc).toContain(doc)
    }
    const zh = uwbMms.sources!.map((s) => s).join('\n')
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('草案')
    expect(zh).toContain('15-22/0205r0')
    // the narrowband radio really is Clause 12's: 32 chips a symbol at 0.5 µs, 4 bits a
    // symbol — 250 kb/s, and 576 µs for 12 octets
    expect(NB_SYMBOL_CHIPS * NB_CHIP_US).toBe(NB_SYMBOL_US)
    expect(4 / (NB_SYMBOL_US / 1000)).toBe(250)
    expect(nbPpduNs(NB_POLL_BYTES) / 1000).toBe(576)
    // and the picture itself never says "draft": the word lives here, with the numbers
    expect(prose().includes('P802.15.4ab')).toBe(true)
    for (const b of uwbMms.picture!) {
      const t = (b as Extract<Block, { kind?: 'p' }>).text
      expect(t, t.slice(0, 40)).not.toContain('draft')
      expect(t, t.slice(0, 40)).not.toContain('草案')
    }
  })
})

describe('uwb-mms · the scene', () => {
  const sc = uwbMmsScenario('base')

  it('is a 22 × 8 m hall with full-height brick partitions at x = 5 and x = 10', () => {
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    for (const v of uwbMms.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(sc.rooms).toEqual([{ x: 0, y: 0, w: 22, h: 8, name: 'Hall' }])
    expect(sc.walls).toEqual(twoWallLab().walls)
    expect(sc.walls).toContainEqual(brick(5, 0, 5, 8))
    expect(sc.walls).toContainEqual(brick(10, 0, 10, 8))
    for (const w of sc.walls) expect(w.openings).toEqual([])
    // the table of `numbers`, row by row
    expect(cell(0, 0, 1)).toBe('22 × 8 m')
    expect(cell(0, 1, 1)).toBe('x = 5 m, x = 10 m')
  })

  it('places three anchors in the first bay and the tag in the third, crystals set', () => {
    expect(sc.nodes.map((n) => n.id)).toEqual([...ANCHORS, TAG])
    for (const a of MMS_ANCHORS) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb, a.id).toEqual({ role: 'anchor', ppm: a.ppm })
    }
    const tag = sc.nodes.find((n) => n.id === TAG)!
    expect(tag.pos).toEqual({ x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z })
    expect(tag.uwb).toEqual({ role: 'tag', ppm: TAG_POS.ppm })
    expect(ANCHOR_Z).toBe(2.2)
    expect(TAG_Z).toBe(1.0)
    for (const a of MMS_ANCHORS) expect(a.x, a.id).toBeLessThan(5)
    expect(TAG_POS.x).toBeGreaterThan(10)
    // "13.04, 13.04, 12.76 m" and "24 dB", as the room table prints them
    expect(MMS_ANCHORS.map((a) => distTo(a).toFixed(2))).toEqual(['13.04', '13.04', '12.76'])
    expect(cell(0, 2, 1)).toBe('13.04, 13.04, 12.76 m')
    expect(2 * WALL_LOSS_DB.brick).toBe(24)
    expect(cell(0, 3, 1)).toBe('24 dB')
    // "Going deeper": "an anchor pushed up against the first partition would be 8.58 m away,
    //  3.6 decibels louder" — the partition stands at x = 5
    const nearWall = Math.hypot(4.5 - TAG_POS.x, 4 - TAG_POS.y, ANCHOR_Z - TAG_Z)
    expect(nearWall.toFixed(2)).toBe('8.58')
    const louder = 10 * UWB_PL_EXP * Math.log10(distTo(MMS_ANCHORS[0]) / nearWall)
    expect(louder.toFixed(1)).toBe('3.6')
  })

  it('is an MMS session on the draft defaults, one UNII-3 control channel, responder reporting', () => {
    const u = sc.uwb!
    expect(u.mode).toBe('mms')
    expect(u.method).toBe('ss')
    expect(u.slotRstu).toBe(600)
    expect(u.slotRstu % 300).toBe(0)
    expect(u.blockRstu).toBe(DEFAULT_UWB_SESSION.blockRstu)
    expect(u.nlos).toBe(true)
    expect(u.aoa).toBe(false)
    expect(u.tsNoisePs).toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(u.cfoNoisePpm).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
    // the base scene is a one-to-many round; every variant is a pair round, and `pairwise`
    // is byte for byte the scene this lesson's base used to be
    expect(u.mms).toEqual({ ...DEFAULT_UWB_SESSION.mms, nbChannels: [3], report: 'responder', oneToMany: true })
    expect(uwbMmsScenario('pairwise').uwb!.mms.oneToMany).toBe(false)
    expect(u.mms.rsfs).toBe(8)
    expect(u.mms.rifs).toBe(0)
    expect(u.mms.nMsr).toBe(40)
    expect(u.mms.gap).toBe(64)
    expect(u.mms.nbChannels).toEqual(NB_DEFAULT_CHANNELS)
    // the variants move one thing each, and the labels a reader picks them by
    const pair = { ...u.mms, oneToMany: false }
    expect(uwbMmsScenario('four').uwb!.mms).toEqual({ ...pair, rsfs: 4 })
    expect(uwbMmsScenario('rsf1').uwb!.mms).toEqual({ ...pair, ...mmsSet('rsf-1') })
    expect(uwbMmsScenario('pairwise').uwb!.mms).toEqual(pair)
    const twr = uwbMmsScenario('twr').uwb!
    expect(twr.mode).toBe('twr')
    expect(twr.method).toBe('ss')
    expect(twr.slotRstu).toBe(600)
    expect(JSON.stringify(uwbMmsScenario('twr').nodes)).toBe(JSON.stringify(sc.nodes))
  })

  it('"52 slots of 500 µs, so 26 ms" — one round for all three anchors, once a block', () => {
    const plan = roundPlan(sc.uwb!, ANCHORS.length)
    expect(plan.slots).toBe(52)
    expect(plan.slotNs).toBe(0.5 * MS)
    expect(plan.roundNs).toBe(26 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    const layout = mmsLayout({ ...sc.uwb!.mms }, ANCHORS.length)
    expect([layout.controlSlots, layout.rpSlots, layout.reportSlots]).toEqual([8, 32, 12])
    expect(layout.slots).toBe(52)
    // the comparison table's own row, and the rule that fixes the responder count
    expect(comparison(0)).toEqual(['52', '28'])
    expect(comparison(1)).toEqual(['26 ms', '14 ms'])
    expect(comparison(2)).toEqual(['1', '3'])
    expect(comparison(3)).toEqual(['26 ms', '42 ms'])
    // and the run agrees: one 52-slot round a block, holding every anchor
    const rounds = ofType(recs('base'), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS)
    expect(rounds.slice(0, 2).map((r) => [r.node, r.t, r.round, r.block, r.slots, r.mode])).toEqual([
      [TAG, 0, 0, 0, 52, 'mms'],
      [TAG, 200 * MS, 0, 1, 52, 'mms'],
    ])
  })

  it('the pairwise variant is the round this lesson used to run: 28 slots, three a block', () => {
    const plan = roundPlan(uwbMmsScenario('pairwise').uwb!, ANCHORS.length)
    expect(plan.slots).toBe(28)
    expect(plan.roundNs).toBe(14 * MS)
    expect(plan.roundsPerBlock).toBe(14)
    const layout = mmsLayout({ ...uwbMmsScenario('pairwise').uwb!.mms })
    expect([layout.controlSlots, layout.rpSlots, layout.reportSlots]).toEqual([4, 20, 4])
    expect(layout.reportSlot('responder')).toBe(24)
    const rounds = ofType(recs('pairwise'), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS * ANCHORS.length)
    expect(rounds.slice(0, 4).map((r) => [r.t, r.round, r.slots])).toEqual([
      [0, 0, 28], [14 * MS, 1, 28], [28 * MS, 2, 28], [200 * MS, 0, 28],
    ])
    // and its block fix waits for the third of them, at 42 ms
    expect(ofType(recs('pairwise'), 'UWB_POSITION').map((f) => f.t))
      .toEqual(Array.from({ length: BLOCKS }, (_, b) => b * 200 * MS + 42 * MS))
  })

  it('replays bit-for-bit, in all four scenes', () => {
    for (const v of ['base', 'four', 'rsf1', 'twr'] as UwbMmsVariant[]) {
      const again = [...new Simulation(scenarioOf(v)).runUntil(RUN_NS).records]
      expect(again, v).toEqual(recs(v))
    }
  })
})

describe('uwb-mms · a room one frame cannot cross', () => {
  it('"−100.26 / −100.07 dBm" a fragment, against a −93 dBm receiver', () => {
    const trains = ANCHORS.map((p) => ofType(recs('base'), 'UWB_MMS_TRAIN').find((t) => t.node === TAG && t.peer === p)!)
    expect(trains.map((t) => t.rxDbm.toFixed(2))).toEqual(['-100.26', '-100.26', '-100.07'])
    // the same figures from the closed form: a fragment's own EIRP, free space on channel 9,
    // two brick walls
    const closed = (d: number) =>
      mmsFragmentDbm(rsfNs(40, 64)) - (uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick)
    expect(MMS_ANCHORS.map((a) => closed(distTo(a)).toFixed(2))).toEqual(['-100.26', '-100.26', '-100.07'])
    expect(cell(0, 4, 1)).toBe('−100.26 / −100.07 dBm')
    expect(UWB_RX_SENS_DBM).toBe(-93)
    expect(cell(0, 5, 1)).toBe('−93 dBm')
    // "about seven decibels under the receiver"
    expect(Math.round(UWB_RX_SENS_DBM - trains[0].rxDbm)).toBe(7)
    // "either all three are heard or none of them is"
    for (const t of trains) expect(t.detected, t.peer).toBe(true)
    for (const t of ofType(recs('four'), 'UWB_MMS_TRAIN')) expect(t.detected, t.peer).toBe(false)
  })

  it('"a fragment carries nothing": zero octets, no data rate, one stamp per train', () => {
    const tx = ofType(recs('base'), 'TX_START').filter((r) => r.t < 26 * MS)
    const frags = tx.filter((r) => r.frame.kind === 'uwbRsf')
    // four devices, eight fragments each, all inside the one round
    expect(frags).toHaveLength(32)
    for (const f of frags) {
      expect(f.frame.bytes).toBe(0)
      expect(f.frame.txTimeNs).toBe(82_051)
    }
    // "One transmit stamp per train": one TX_TS per sender in the round, not one per fragment
    const txStamps = ofType(recs('base'), 'UWB_TS')
      .filter((r) => r.dir === 'tx' && r.t < 26 * MS && r.node === TAG)
    expect(txStamps).toHaveLength(1)
    expect(frags.filter((f) => f.node === TAG)).toHaveLength(8)
    expect(txStamps[0].t).toBe(4 * MS)
    expect(logLine(3)).toBe(fmtRecord(frags[0]))
    expect(logLine(3)).toBe('tag-1 → * UWBRSF 0 B @0 Mbps (82.1 µs)')
  })

  it('the log table is the round, line for line', () => {
    const rs = recs('base')
    expect(logLine(0)).toBe(fmtRecord(ofType(rs, 'UWB_ROUND')[0]))
    expect(logLine(0)).toBe('tag-1 UWB round 0 of block 0 (MMS): 52 slots × 500.0 µs')
    const poll = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect(logLine(1)).toBe(fmtRecord(poll))
    // the one-to-many POLL is addressed to the whole round and names its responders, so it is
    // eleven octets longer than the pair round's and takes 928 µs instead of 576
    expect(logLine(1)).toBe('tag-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)')
    const resp = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbResp')!
    expect(logLine(2)).toBe(fmtRecord(resp))
    expect(logLine(2)).toBe('anchor-1 → tag-1 NBRESP 12 B @0.25 Mbps (576.0 µs)')
    const train = ofType(rs, 'UWB_MMS_TRAIN').find((t) => t.node === 'anchor-1')!
    expect(train.t).toBe(18.5 * MS)
    expect(train.responders).toEqual(ANCHORS)
    expect(logLine(4)).toBe(fmtRecord(train))
    expect(logLine(4)).toBe('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.997 ppm · responders: anchor-1, anchor-2, anchor-3')
    const report = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbReport')!
    expect(report.t).toBe(20 * MS)
    expect(logLine(5)).toBe(fmtRecord(report))
    expect(logLine(5)).toBe('anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(logLine(6)).toBe(fmtRecord(range))
    expect(logLine(6)).toBe('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
    expect(logLine(7)).toBe(fmtRecord(ofType(rs, 'UWB_POSITION')[0]))
    // the "When" column agrees with the records it quotes
    expect([cell(1, 4, 0), cell(1, 5, 0), cell(1, 7, 0)]).toEqual(['18.500 ms', '20.000 ms', '26.000 ms'])
    expect((range.t / MS).toFixed(3)).toBe('20.608')
    // "only then does a receive stamp appear": the verdict comes first, in the same slot
    expect(ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx' && r.t < 18.5 * MS)).toEqual([])
  })

  it('"Going deeper": the timestamp is the first pulse of the first fragment', () => {
    const rs = recs('base')
    const firstFragment = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbRsf')!
    const txStamp = ofType(rs, 'UWB_TS').find((r) => r.dir === 'tx')!
    expect(txStamp.t).toBe(firstFragment.t)
    // "no range in the run carries an integrity verdict at all"
    expect(uwbMmsScenario('base').uwb!.mms.rifs).toBe(0)
    for (const r of ofType(rs, 'UWB_RANGE')) expect(r.integrity, r.peer).toBeUndefined()
  })
})

describe('uwb-mms · who does the talking', () => {
  const rs = () => recs('base')

  it('"a Poll … a Response … a Report", 12, 12 and 13 octets', () => {
    expect([NB_POLL_BYTES, NB_RESP_BYTES, NB_REPORT_BYTES]).toEqual([12, 12, 13])
    expect(nbPpduNs(NB_POLL_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_RESP_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    const tx = ofType(rs(), 'TX_START').filter((r) => r.t < 26 * MS)
    // one Poll for the round, then a Response from each anchor in its own window
    expect(tx.map((r) => [r.node, r.frame.kind, r.t]).slice(0, 5)).toEqual([
      [TAG, 'nbPoll', 0], ['anchor-1', 'nbResp', MS], ['anchor-2', 'nbResp', 2 * MS],
      ['anchor-3', 'nbResp', 3 * MS], [TAG, 'uwbRsf', 4 * MS],
    ])
    expect(tx.at(-1)!.frame.kind).toBe('nbReport')
    expect(tx.at(-1)!.t).toBe(24 * MS)
    for (const r of tx) {
      const want = r.frame.kind === 'uwbRsf' ? 82_051 : nbPpduNs(r.frame.bytes)
      expect(r.frame.txTimeNs, r.frame.kind).toBe(want)
    }
    // "each answers in a slot of its own" — one response window per responder
    // three reports per round now, one from each responder, instead of one per pair round
    expect(ofType(rs(), 'TX_START').filter((r) => r.frame.kind === 'nbReport').map((r) => r.node))
      .toEqual(Array.from({ length: BLOCKS }, () => ANCHORS).flat())
    expect(uwbMmsScenario('base').uwb!.mms.report).toBe('responder')
  })

  it('"4.480 ms of the round’s 7.106 ms of air … all thirty-two fragments are 2.626 ms"', () => {
    const air = ofType(rs(), 'TX_START').filter((r) => r.t < 26 * MS)
    const sum = (kinds: string[]): number =>
      air.filter((r) => kinds.includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(sum(['nbPoll', 'nbResp', 'nbReport'])).toBe(4_480_000)
    expect(sum(['uwbRsf'])).toBe(32 * 82_051)
    expect((sum(['uwbRsf']) / MS).toFixed(3)).toBe('2.626')
    expect((air.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS).toFixed(3)).toBe('7.106')
    // the pair round it replaces, with its old figures, now pinned on the pairwise variant
    const pairAir = ofType(recs('pairwise'), 'TX_START').filter((r) => r.t < 14 * MS)
    const pairSum = (kinds: string[]): number =>
      pairAir.filter((r) => kinds.includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(pairSum(['nbPoll', 'nbResp', 'nbReport'])).toBe(1_760_000)
    expect(pairSum(['uwbRsf'])).toBe(16 * 82_051)
    expect((pairAir.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS).toFixed(3)).toBe('3.073')
  })

  it('the control channel is 3 at 5733.75 MHz, and UNII-3 asks for no listen before talk', () => {
    expect(nbCenterMhz(3)).toBe(5733.75)
    const poll = ofType(rs(), 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect(poll.frame.uwb?.nb?.channel).toBe(3)
    expect(poll.frame.uwb?.nb?.centerMhz).toBe(5733.75)
    expect(poll.frame.mbps).toBe(0.25)
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of rs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    expect(uwbNbChannelText(u, STRINGS.uwb)).toBe('3 · 5733.75 MHz')
    expect(uwbNbChannelText(u, STRINGS.uwb)).toBe('3 · 5733.75 MHz')
    expect(u.mms.lbtBusy).toBe(0)
    expect(ofType(rs(), 'UWB_NB_LBT')).toEqual([])
  })

  it('the inspector’s train table says what the third observation sends the reader to read', () => {
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of recs('base')) applyRecord(vs, r)
    const rows = uwbTrainRows(vs.nodes[TAG].uwb!, STRINGS.uwb)
    // the figures are the trains'; `kind` and `detected` are the string table's words
    expect(rows.map((r) => [r.peer, r.heard, r.margin])).toEqual([
      ['anchor-1', '8 / 8', '+1.8 dB'],
      ['anchor-2', '8 / 8', '+1.8 dB'],
      ['anchor-3', '8 / 8', '+2.0 dB'],
    ])
    // the third observation is what sends the reader to the responder list
  })
})

describe('uwb-mms · reach is not accuracy', () => {
  const rs = () => recs('base')

  it('"long by the same 1.199 m": 2 ns of brick each way, kept rather than cancelled', () => {
    expect(UWB_NLOS_NS.brick).toBe(2)
    const biasM = 2 * UWB_NLOS_NS.brick * C_M_PER_NS
    expect(biasM.toFixed(3)).toBe('1.199')
    for (const r of ofType(rs(), 'UWB_RANGE')) {
      expect(Math.abs(r.distM - r.trueDistM - biasM), `${r.peer} b${r.block}`)
        .toBeLessThan(4 * rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs))
      expect(fomText(r.fom), r.peer).toBe('75 % within 12 ns')
      expect(r.method).toBe('ss')
    }
  })

  it('"(14.22, 4.05) m against a true (13.00, 4.00)", and the ellipse stays at centimetres', () => {
    const fixes = ofType(rs(), 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    for (const f of fixes) {
      expect(f.node).toBe(TAG)
      expect(f.method).toBe('twr')
      expect(f.anchors).toEqual(ANCHORS)
      expect(f.x - f.trueX).toBeGreaterThan(1.2) // pushed east by the walls' own delay
    }
    // the block fix comes at the end of the block's one round — 26 ms, where three pair
    // rounds took 42 (pinned on the pairwise variant above)
    expect(fixes.map((f) => f.t)).toEqual(Array.from({ length: BLOCKS }, (_, b) => b * 200 * MS + 26 * MS))
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of rs()) applyRecord(vs, r)
    const row = uwbFixRow(vs.nodes[TAG].uwb!.position!, STRINGS.uwb)
    // the inspector shows the block's LAST fix; the log table quotes the first, at 26 ms
    expect(row.estimate).toBe('(14.22, 4.05) m')
    expect(row.truth).toBe('(13.00, 4.00) m')
    expect(row.error).toBe('122.3 cm')
    expect(row.ellipse).toBe('6.1 × 1.3 cm')
    // M2: the inspector shows the block-6 fix, and the log table three blocks up quotes
    // block 0's — the prose now says which is which
    expect(logLine(7)).toContain('(14.24, 4.08)')
  })

  it('"4z for comparison": not one range in the same room, 42 timeouts instead', () => {
    const rsTwr = recs('twr')
    expect(ofType(rsTwr, 'UWB_RANGE')).toEqual([])
    expect(ofType(rsTwr, 'UWB_POSITION')).toEqual([])
    const outs = ofType(rsTwr, 'UWB_TIMEOUT')
    expect(outs).toHaveLength(42)
    const byKind: Record<string, number> = {}
    for (const o of outs) byKind[o.expected] = (byKind[o.expected] ?? 0) + 1
    // every anchor waits for a poll it never hears; the tag waits out all three response slots
    expect(byKind).toEqual({ uwbPoll: BLOCKS * ANCHORS.length, uwbResp: BLOCKS * ANCHORS.length })
    expect(new Set(outs.filter((o) => o.expected === 'uwbPoll').map((o) => o.node))).toEqual(new Set(ANCHORS))
    expect(new Set(outs.filter((o) => o.expected === 'uwbResp').map((o) => o.node))).toEqual(new Set([TAG]))
    expect(ofType(rsTwr, 'UWB_ROUND')).toHaveLength(BLOCKS)
    expect(ofType(rsTwr, 'UWB_ROUND')[0].slots).toBe(4)
    expect(ofType(rsTwr, 'UWB_MMS_TRAIN')).toEqual([])
  })
})

/**
 * The procedure the lesson closes on, step against engine, and the worked example under it row
 * by row. The steps say in words what the engine does; the table under them says the same thing
 * in figures on this scene, and every figure is read back out of `mmsLayout`, `mms.ts`, `nb.ts`
 * and the run rather than re-typed — the point of writing the round out as a procedure is that a
 * reader can redo it, and a step that drifted from the engine would be worse than the paragraph
 * it replaced.
 */
describe('uwb-mms · one round, step by step', () => {
  const base = uwbMmsScenario('base')
  const layout = mmsLayout({ ...base.uwb!.mms }, ANCHORS.length)
  /** The round's own fragment spacing, derived — never a typed literal (UWB track review, I1). */
  const plan = roundPlan(base.uwb!, ANCHORS.length)

  it('is seven steps and a seven-row worked example, in the same order', () => {
    expect(steps()).toHaveLength(7)
    expect(table(3).rows).toHaveLength(8)
    expect(uwbMms.numbers!.at(-1)).toBe(table(3))
    expect(uwbMms.numbers!.at(-2)!.kind).toBe('steps')
  })

  it('step 1 — the Poll opens the round in its first slot, naming every anchor', () => {
    expect(worked(0)).toBe('slot 0 · 23 B · 928.0 µs')
    expect(nbOtmPollBytes(ANCHORS.length)).toBe(23)
    expect(nbPpduNs(23)).toBe(928_000)
    const poll = ofType(recs('base'), 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect([poll.t, poll.node, poll.frame.bytes, poll.frame.txTimeNs]).toEqual([0, TAG, 23, 928_000])
  })

  it('step 2 — a Response window an anchor, and only a primed pair listens', () => {
    expect(worked(1)).toBe('slots 2, 4, 6 · 12 B · 576.0 µs')
    expect(ANCHORS.map((_, r) => layout.respSlot(r))).toEqual([2, 4, 6])
    expect(NB_RESP_BYTES).toBe(12)
    expect(nbPpduNs(NB_RESP_BYTES)).toBe(576_000)
  })

  it('step 3 — one slot each, and a device’s own fragments four slots (2 ms) apart', () => {
    expect(worked(2)).toBe('slots 8–39 · 4 per 2 ms · 8 fragments')
    expect(layout.controlSlots).toBe(8)
    expect(layout.rpSlots).toBe(32)
    expect(layout.controlSlots + layout.rpSlots - 1).toBe(39)
    // the tag's fragment first, then one per anchor, and the next round of four a gap later
    expect(layout.fragmentSlot('initiator', 'rsf', 0)).toBe(8)
    expect(ANCHORS.map((_, r) => layout.fragmentSlot('responder', 'rsf', 0, r))).toEqual([9, 10, 11])
    expect(layout.fragmentSlot('initiator', 'rsf', 1)).toBe(12)
    expect(layout.fragmentSlot('initiator', 'rsf', 7)).toBe(36)
    expect(base.uwb!.mms.rsfs).toBe(8)
    // the gap is (responders + 1) slots — four here, not one millisecond
    const gapSlots = layout.fragmentSlot('initiator', 'rsf', 1) - layout.fragmentSlot('initiator', 'rsf', 0)
    expect(gapSlots).toBe(ANCHORS.length + 1)
    expect(gapSlots).toBe(4)
    expect(plan.mms!.fragGapNs).toBe(gapSlots * plan.slotNs)
    expect(plan.mms!.fragGapNs).toBe(2 * MS)
    // a millisecond is what the PAIRWISE round comes to, which is why the claim looked true
    const pair = roundPlan(uwbMmsScenario('pairwise').uwb!, ANCHORS.length)
    expect(pair.mms!.fragGapNs).toBe(1 * MS)
  })

  it('step 4 — one symbol repeated, a whole millisecond’s energy in it, two stamps a train', () => {
    expect(worked(3)).toBe('40 × 1 024 = 40 960 chips · 82.051 µs · 37 nJ')
    expect(mmrsSymbolChips(64)).toBe(1024)
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(rsfNs(40, 64)).toBe(82_051)
    expect(UWB_MS_BUDGET_NJ).toBe(37)
    // one tx stamp a train, taken at the transmission instant — no preamble offset to subtract
    const rs = recs('base')
    const first = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRsf' && r.node === TAG)[0]
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.dir === 'tx' && r.node === TAG && r.t < 26 * MS)
    expect(stamps).toHaveLength(1)
    expect(stamps[0].t).toBe(first.t)
  })

  it('step 5 — add what was heard, take the sensitivity off, detect on what is left', () => {
    expect(worked(4)).toBe('−100.26 + 9.03 = −91.23 dBm · +1.77 dB')
    expect(combineGainDb(8).toFixed(2)).toBe('9.03')
    expect(UWB_RX_SENS_DBM).toBe(-93)
    const t = ofType(recs('base'), 'UWB_MMS_TRAIN').find((r) => r.node === TAG && r.peer === ANCHORS[0])!
    expect(t.heard).toBe(8)
    expect((t.rxDbm + combineGainDb(t.heard)).toFixed(2)).toBe('-91.23')
    expect((t.rxDbm + combineGainDb(t.heard) - UWB_RX_SENS_DBM).toFixed(2)).toBe('1.77')
    expect(trainDetected(t.rxDbm, t.heard)).toBe(true)
    expect(t.detected).toBe(true)
  })

  it('step 6 — two report windows an anchor, and the pair of times is the distance', () => {
    expect(worked(5)).toBe('slots 40, 44, 48 · 13 B · 608.0 µs')
    expect(layout.reportSlots).toBe(12)
    expect(ANCHORS.map((_, r) => layout.reportSlot('responder', r))).toEqual([40, 44, 48])
    expect(ANCHORS.map((_, r) => layout.reportSlot('initiator', r))).toEqual([42, 46, 50])
    expect(NB_REPORT_BYTES).toBe(13)
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    expect(NB_REPORT_TIME_BYTES).toBe(5)
  })

  it('step 7 — the three checks on the slot, and the fourth anchor the schema refuses', () => {
    expect(worked(6)).toBe('600 % 300 = 0 · 82.3 < 500.0 · 928.2 < 1000.0 µs')
    expect(worked(7)).toBe('1024.2 > 1000.0 µs')
    const mms = { ...base.uwb!.mms }
    expect(base.uwb!.slotRstu).toBe(600)
    expect(base.uwb!.slotRstu % 300).toBe(0)
    const slotNs = rstuNs(base.uwb!.slotRstu)
    expect(slotNs).toBe(500_000)
    // one slot holds the longest fragment plus the flight guard
    expect(UWB_SLOT_GUARD_NS).toBe(200)
    expect(uwbSlotFitNs(0, 'mms', 'time', mms)).toBe(82_251)
    expect(uwbSlotFitNs(0, 'mms', 'time', mms)).toBeLessThan(slotNs)
    // two slots hold the round's longest narrowband message, which is the one-to-many Poll
    expect(uwbNbSlotFitNs(mms, 3)).toBe(928_200)
    expect(uwbNbSlotFitNs(mms, 3)).toBeLessThan(2 * slotNs)
    expect(nbOtmPollBytes(4)).toBe(26)
    expect(uwbNbSlotFitNs(mms, 4)).toBe(1_024_200)
    expect(uwbNbSlotFitNs(mms, 4)).toBeGreaterThan(2 * slotNs)
    // and the schema is what refuses it: a fourth anchor in this scene does not validate
    const four: Scenario = {
      ...base,
      nodes: [
        ...base.nodes.slice(0, 3),
        { ...base.nodes[0], id: 'anchor-4', name: 'Anchor 4', pos: { ...base.nodes[0].pos, y: 2.0 } },
        ...base.nodes.slice(3),
      ],
    }
    const bad = ScenarioSchema.safeParse(four)
    expect(bad.success).toBe(false)
    expect(bad.error!.issues.map((i) => i.path.join('.'))).toEqual(['uwb'])
    expect(bad.error!.issues[0].message).toContain(`${(uwbNbSlotFitNs(mms, 4) / 1000).toFixed(1)} µs`)
  })

  it('an integrity verdict here is a detection outcome, not a comparison', () => {
    // I6: the `integrity` flag on UWB_RANGE is `p.rifDetected` — whether the integrity train
    // cleared sensitivity. Nothing generates a sequence and nothing compares one.
    // …and a relay cannot be run against an MMS round: the MMS branch returns before the
    // attacker branch every reception of this mode would otherwise reach.
    const relayed = { ...base, uwb: { ...base.uwb!, attacker: { advanceNs: 100 } } } as Scenario
    const rs = ofType([...new Simulation(ScenarioSchema.parse(relayed)).runUntil(RUN_NS).records], 'UWB_RANGE')
    const plain = ofType(recs('base'), 'UWB_RANGE')
    expect(rs).toHaveLength(plain.length)
    expect(rs.map((r) => r.distM.toFixed(3))).toEqual(plain.map((r) => r.distM.toFixed(3)))
  })

  it('the integrity fragments this scene does not send start at X + Z + y − 1', () => {
    const x = base.uwb!.mms.rsfs
    const z = base.uwb!.mms.gapMs
    for (const y of [0, 1, 2, 3]) expect(rifStartMs(x, z, y)).toBe(x + z + y - 1)
    expect(base.uwb!.mms.rifs).toBe(0)
    expect(ofType(recs('base'), 'TX_START').filter((r) => r.frame.kind === 'uwbRif')).toEqual([])
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The tables above are already read the right way round — a whole cell against the string the
 * engine's own figures build. What the sampling sweep of 2026-10-12 found (2 of 6) is the prose:
 * the paragraphs between the tables, the whole of `deeper`, `limits`, `sources`, `observe` and
 * `tryThis`, where the same figures are printed a second time and nothing was reading them.
 * Every assertion here parses its figure out of the shipped string and compares it with a live
 * measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the round's airtime is read as the three shares it is.** 「整轮 7.106 ms 空口时间里的
 *    4.480 ms，而三十二个片段加起来才 2.626 ms」 is three figures and two counts, and the counts
 *    are **Chinese numerals** — 「七条消息」 and 「三十二个片段」 — which a planter cannot touch
 *    but a reader can check, so they are mapped back to numbers and counted off the run.
 *  - **the wall's bias is read through the arithmetic that makes it.** 「偏长同样的 1.199 m：
 *    砖墙给首径添 2 ns」 — the nanoseconds are `UWB_NLOS_NS.brick`, the metres are two walls'
 *    worth of them at the speed of light, and every range of the run has to sit that far long.
 *  - **the anchor that is not there is read as a pair of figures that hold each other up.**
 *    「只有 8.58 m 远、电平高 3.6 个分贝」 is one hypothetical position, so the distance and the
 *    decibels are computed from the same spot: moving either one alone breaks the pair.
 *  - **`limits` is read against the engine file it names.** 「evaluateTrain 取 frags[0].rssiDbm」
 *    and 「10·log10(N)」 are checked against `src/uwb/mms.ts` itself — the index it really takes
 *    and the gain it really returns for the fragment counts this lesson's scenes run.
 *
 * **One figure is exempt, class (c), and it is argued rather than waved:** the 0.1 of 「差 0.1 dB
 * 整串就判为未检出」. The sentence's content is that the test is `margin >= 0` with no hysteresis
 * at all, so any shortfall whatever would do — 0.2 or 0.05 would be just as true. What is read
 * instead is the claim itself: `trainDetected` says yes at a margin of zero and no at a margin
 * that is short by the amount the sentence names, and by a tenth of it.
 */
describe('uwb-mms · every figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(uwbMms.terms)
  const NUMS = blockText(uwbMms.numbers)
  const DEEP = blockText(uwbMms.deeper)
  const LIM = blockText(uwbMms.limits)
  const SRC = blockText(uwbMms.sources)
  const OBS = blockText(uwbMms.observe)
  const TRY = blockText(uwbMms.tryThis)
  /** The two engine files `limits` names by function, by field and by constant. */
  const MMS_SRC = readFileSync(new URL('../../src/uwb/mms.ts', import.meta.url), 'utf8')
  const DEV_MMS_SRC = readFileSync(new URL('../../src/uwb/device.mms.ts', import.meta.url), 'utf8')

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
  /** A Chinese numeral up to 九十九, which is how this lesson writes its two counts. */
  const cn = (s: string): number => {
    const d = '零一二三四五六七八九'
    const i = s.indexOf('十')
    if (i < 0) return d.indexOf(s)
    const tens = i === 0 ? 1 : d.indexOf(s.slice(0, i))
    const ones = i === s.length - 1 ? 0 : d.indexOf(s.slice(i + 1))
    return tens * 10 + ones
  }

  it('reads the sensitivity `terms` prints against the receiver the engine gives this lesson', () => {
    const [sens] = figs(TERMS, /本课是 (−?[\d.]+) dBm/, '`terms` on the receiver’s own threshold')
    expect(sens, 'the sensitivity every train of this lesson is judged against').toBe(UWB_RX_SENS_DBM)
  })

  it('reads the round’s airtime as the three shares it is, Chinese counts and all', () => {
    const [whole, nb, frags] = figs(NUMS,
      /整轮 ([\d.]+) ms 空口时间（airtime）里的 ([\d.]+) ms，而三十二个片段加起来才 ([\d.]+) ms/,
      '`numbers` on the three shares')
    // the window is the round the comparison table gives this scene, read out of that table
    const [roundMs] = figs(comparison(1)[0]!, /^(\d+) ms$/, 'the comparison table on the round')
    const air = ofType(recs('base'), 'TX_START').filter((r) => r.t < roundMs! * MS)
    const sum = (kinds: string[]): number =>
      air.filter((r) => kinds.includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
    same(String(whole), air.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS, 'the whole round’s air')
    same(String(nb), sum(['nbPoll', 'nbResp', 'nbReport']) / MS, 'what the narrowband side takes')
    same(String(frags), sum(['uwbRsf']) / MS, 'and what every fragment of it takes')
    expect(nb! + frags!, 'the two shares are the whole of it').toBeCloseTo(whole!, 3)
    expect(nb!, 'and the slow side is the narrowband one').toBeGreaterThan(frags!)
    // 「它那七条消息」 and 「三十二个片段」: counts, written as Chinese numerals.
    const [msgs] = raw(NUMS, /它那(.)条消息/, '`numbers` on how many narrowband messages')
    expect(cn(msgs!), 'the narrowband messages one round sends')
      .toBe(air.filter((r) => r.frame.kind.startsWith('nb')).length)
    const [count] = raw(NUMS, /而(...)个片段加起来/, '`numbers` on how many fragments')
    expect(cn(count!), 'the fragments the same round sends')
      .toBe(air.filter((r) => r.frame.kind === 'uwbRsf').length)
  })

  it('reads the wall’s bias through the arithmetic that makes it', () => {
    const [metres, ns] = figs(NUMS, /每一次测距都偏长同样的 ([\d.]+) m：砖墙给首径添 ([\d.]+) ns/,
      '`numbers` on the bias and the brick that causes it')
    expect(ns, 'the extra delay one brick partition adds to the first path')
      .toBe(UWB_NLOS_NS.brick)
    same(String(metres), 2 * ns! * C_M_PER_NS, 'two partitions’ worth of it, as a distance')
    for (const r of ofType(recs('base'), 'UWB_RANGE')) {
      expect(Math.abs(r.distM - r.trueDistM - metres!), `${r.peer} b${r.block}`)
        .toBeLessThan(4 * rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs))
    }
  })

  it('reads the fix the inspector shows, and the three distances `deeper` prints again', () => {
    const [x, y, trueX, trueY] = raw(NUMS,
      /显示的是最后一个块的结果：\(([\d.]+), ([\d.]+)\) m，真值 \(([\d.]+), ([\d.]+)\)/,
      '`numbers` on the inspector’s own fix')
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of recs('base')) applyRecord(vs, r)
    const row = uwbFixRow(vs.nodes[TAG].uwb!.position!, STRINGS.uwb)
    expect(`(${x}, ${y}) m`, 'the estimate the panel shows').toBe(row.estimate)
    expect(`(${trueX}, ${trueY}) m`, 'and the truth beside it').toBe(row.truth)
    // 「三个锚点到标签分别是 13.04、13.04 与 12.76 m」 — the room table's third row, again.
    const printed = raw(DEEP, /三个锚点到标签分别是 ([\d.]+)、([\d.]+) 与 ([\d.]+) m/,
      '`deeper` on the three distances')
    expect(printed, 'the three distances this scene really has')
      .toEqual(MMS_ANCHORS.map((a) => distTo(a).toFixed(2)))
    expect(cell(0, 2, 1), 'which is what the room table prints too')
      .toBe(`${printed.join(', ')} m`)
  })

  it('reads the anchor that is not there as a pair of figures that hold each other up', () => {
    const [near, louder] = figs(DEEP, /它就只有 ([\d.]+) m 远、电平高 ([\d.]+) 个分贝/,
      '`deeper` on the anchor pushed against the partition')
    /*
     * **One hypothetical spot, two figures.** 「贴到第一道砖墙上」 is read as half a metre short
     * of the first partition — whose x the room table prints — on the middle anchor's own line,
     * and both figures are computed from that one spot, so moving either alone breaks the pair.
     */
    const [wallX] = figs(cell(0, 1, 1), /^x = (\d+) m/, 'the room table on the first partition')
    const spot = { x: wallX! - 0.5, y: MMS_ANCHORS[2].y }
    same(String(near), distTo(spot), 'how far that spot is from the tag')
    same(String(louder), 10 * UWB_PL_EXP * Math.log10(distTo(MMS_ANCHORS[0]) / distTo(spot)),
      'and how much louder the tag is there')
    expect(spot.x, 'a spot still inside the first bay').toBeLessThan(wallX!)
  })

  it('reads the room `sources` calls the simulator’s own', () => {
    const [w, h, wall, ns] = figs(SRC,
      /(\d+) × (\d+) m 的大厅、两道各 (\d+) dB 的砖墙、每道砖墙 ([\d.]+) ns/,
      '`sources` on the room it built')
    const sc = uwbMmsScenario('base')
    expect([w, h], 'the hall this scene lays out').toEqual([sc.rooms[0].w, sc.rooms[0].h])
    expect(wall, 'the loss one of them charges').toBe(WALL_LOSS_DB.brick)
    expect(ns, 'and the delay each of them adds').toBe(UWB_NLOS_NS.brick)
    expect(cell(0, 0, 1), 'the same hall the room table prints').toBe(`${w} × ${h} m`)
    // the room table prints the PAIR, which is why its figure is twice this one
    expect(cell(0, 3, 1), 'and both of them together').toBe(`${2 * wall!} dB`)
  })

  it('reads the verdict `limits` describes: the margin, the two fragment counts, the gain', () => {
    const trains = (v: UwbMmsVariant): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
      ofType(recs(v), 'UWB_MMS_TRAIN').filter((r) => r.kind === 'rsf')
    // 「所以 +1.77 dB 这个余量七个块都是同一个数」
    const [margin] = figs(LIM, /所以 \+([\d.]+) dB 这个余量七个块都是同一个数/,
      '`limits` on the margin that never moves')
    /*
     * **「七个块都是同一个数」 is per pair, not per room.** The third anchor stands 12.76 m
     * away where the other two are 13.04, so its fragments land 0.19 dB louder and its margin is
     * its own constant. What the sentence says is that a pair's margin never moves between
     * blocks — which is read here pair by pair — and the figure it prints is the one the worked
     * table runs through, anchor 1's.
     */
    const byPair = new Map<string, Set<number>>()
    for (const r of trains('base')) {
      const k = `${r.node}|${r.peer}`
      byPair.set(k, (byPair.get(k) ?? new Set()).add(Number(r.marginDb.toFixed(2))))
    }
    for (const [k, s] of byPair) {
      expect([...s], `${k}: one margin for every block`).toHaveLength(1)
      expect(trains('base').filter((r) => `${r.node}|${r.peer}` === k), `${k}: and one train a block`)
        .toHaveLength(BLOCKS)
    }
    const first = [...new Set(trains('base')
      .filter((r) => r.node === ANCHORS[0] || r.peer === ANCHORS[0])
      .map((r) => Number(r.marginDb.toFixed(2))))]
    expect(first, 'the margin anchor 1 has, which is the one the lesson prints').toEqual([margin])
    // 「「X = 8 成、X = 4 败」在现实里是一条成功率曲线」
    const [pass, fail] = figs(LIM, /「X = (\d+) 成、X = (\d+) 败」/,
      '`limits` on the two fragment counts')
    expect(pass, 'the train length this scene runs').toBe(uwbMmsScenario('base').uwb!.mms.rsfs)
    expect(fail, 'and the one the half-train variant runs').toBe(uwbMmsScenario('four').uwb!.mms.rsfs)
    expect(trains('base').every((r) => r.detected), 'every train of the first is detected').toBe(true)
    expect(trains('four').some((r) => r.detected), 'and not one of the second').toBe(false)
    /*
     * **Exempt, class (c): the 0.1 dB.** Argued in this describe's header — the claim is that
     * `trainDetected` is `margin >= 0` and nothing else, so any shortfall at all would serve.
     */
    const [short] = figs(LIM, /差 ([\d.]+) dB 整串就判为未检出/, '`limits` on the shortfall')
    const t0 = trains('base')[0]!
    const atMargin = (m: number): boolean => trainDetected(t0.rxDbm - (t0.marginDb - m), t0.heard)
    expect(atMargin(0), 'a train with nothing to spare is still detected').toBe(true)
    expect(atMargin(-short!), 'one short by what the sentence names is not').toBe(false)
    expect(atMargin(-short! / 10), 'and nor is one short by a tenth of that').toBe(false)
    // 「evaluateTrain 取 frags[0].rssiDbm 当作整串的电平」
    const [idx] = figs(LIM, /取 frags\[(\d+)\]\.rssiDbm/, '`limits` on the fragment it takes')
    expect(DEV_MMS_SRC, 'the index `evaluateTrain` really takes')
      .toContain(`frags[${idx}].rssiDbm`)
    // 「combineGainDb 那一项，也就是 10·log10(N)」, printed twice
    for (const [mult, base] of every(LIM, /(\d+)·log(\d+)\(/g, '`limits` on the combining gain', 2)) {
      for (const n of [uwbMmsScenario('base').uwb!.mms.rsfs, uwbMmsScenario('four').uwb!.mms.rsfs]) {
        expect(val(mult!) * Math.log(n) / Math.log(val(base!)), `the gain at N = ${n}`)
          .toBeCloseTo(combineGainDb(n), 9)
      }
    }
  })

  it('reads the instant `observe` sends the reader to, and the delay `tryThis` measures', () => {
    // 「读一读 18.500 ms 处那条判定」
    const [ms] = figs(OBS, /读一读 ([\d.]+) ms 处那条判定/, '`observe` on where the verdict is')
    const verdict = ofType(recs('base'), 'UWB_MMS_TRAIN')[0]!
    same(String(ms), verdict.t / MS, 'the instant the first train is judged')
    // 「本块的定位也从 26 ms 推迟到 42 ms」
    const [was, now] = figs(TRY, /本块的定位也从 (\d+) ms 推迟到 (\d+) ms/,
      '`tryThis` on the two fixes')
    const fixAt = (v: UwbMmsVariant): number => ofType(recs(v), 'UWB_POSITION')[0]!.t / MS
    same(String(was), fixAt('base'), 'when this scene has its block fix')
    same(String(now), fixAt('pairwise'), 'and when one anchor at a time has it')
    expect([`${was} ms`, `${now} ms`], 'the same two the comparison table prints')
      .toEqual(comparison(3))
  })

  it('reads the log table’s own clock column, every row of it', () => {
    /*
     * **The left column of a log table is a figure too.** Each row quotes a line the log really
     * prints, so the instant beside it is that record's own `t` — which is how all eight rows
     * are read at once, including the three nobody was reading (1.000, 4.000 and 20.608 ms).
     */
    const when = new Map<string, number>()
    for (const r of recs('base')) {
      const line = fmtRecord(r)
      if (!when.has(line)) when.set(line, r.t)
    }
    const rows = table(1).rows
    expect(rows.length, 'one row per line of the round').toBeGreaterThan(0)
    rows.forEach((row, i) => {
      const at = when.get(row[1])
      expect(at, `row ${i}: the log never prints 「${row[1]}」`).toBeDefined()
      same(raw(row[0], /^([\d.]+) ms$/, `the clock of row ${i}`)[0], at! / MS,
        `when row ${i} happens`)
    })
  })

  it('reads the「出处」column of the comparison table, which carries figures of its own', () => {
    // 「52 × 500 µs」 — where the round's length comes from.
    const [slots, slotUs] = figs(cell(2, 1, 3), /(\d+) × (\d+) µs/,
      'the comparison table on where its round length comes from')
    const round = ofType(recs('base'), 'UWB_ROUND')[0]!
    expect(slots, 'the slots this round really has').toBe(round.slots)
    same(String(slotUs), round.slotNs / 1000, 'and the slot it counts them in')
    expect(figs(comparison(1)[0], /^(\d+) ms$/, 'the row’s own one-to-many cell')[0],
      'which is the product of the two').toBe((slots! * slotUs!) / 1000)
    // 「两个 600 RSTU 时隙要装下 Poll，而 Poll 每多一个应答者就长 3 字节」
    const [rstu, perResponder] = figs(cell(2, 5, 3),
      /两个 (\d+) RSTU 时隙要装下 Poll，而 Poll 每多一个应答者就长 (\d+) 字节/,
      'the comparison table on the Poll window')
    expect(rstu, 'the slot this session runs').toBe(uwbMmsScenario('base').uwb!.slotRstu)
    expect(perResponder, 'what one more responder adds to the Poll')
      .toBe(nbOtmPollBytes(ANCHORS.length + 1) - nbOtmPollBytes(ANCHORS.length))
    // …and the responders that window really holds, which is the row's own two cells.
    const [holds, pairHolds] = comparison(5).map((c, i) =>
      figs(c, /^(\d+)$/, `the row’s own cell ${i}`)[0]!)
    expect(uwbNbSlotFitNs(uwbMmsScenario('base').uwb!.mms, holds!),
      'the Poll for that many fits two slots').toBeLessThan(2 * rstuNs(rstu!))
    expect(uwbNbSlotFitNs(uwbMmsScenario('base').uwb!.mms, holds! + 1),
      'and the Poll for one more does not').toBeGreaterThan(2 * rstuNs(rstu!))
    expect(pairHolds, 'while a pair round asks one anchor at a time').toBe(1)
  })

  it('reads the row label the worked table gives those gates', () => {
    // 「三关，600 RSTU」 — a row LABEL, which no read of the value column ever looks at.
    const row = table(3).rows.find((r) => r[0].includes('三关'))!
    const [rstu] = figs(row[0], /三关，(\d+) RSTU/, 'the worked table’s own row label')
    expect(rstu, 'the slot those three gates are applied to')
      .toBe(uwbMmsScenario('base').uwb!.slotRstu)
    expect(figs(row[1], /^(\d+) % /, 'the value cell beside it')[0],
      'which is the slot the cell itself goes on to test').toBe(rstu)
  })

  it('reads the three gates the slot has to pass, and the multiple they start from', () => {
    const [rstu] = figs(NUMS, /它要是 (\d+) RSTU（ranging slot time unit）的整数倍/,
      'the steps on the first gate')
    const slot = uwbMmsScenario('base').uwb!.slotRstu
    expect(slot % rstu!, 'the slot this session runs really is a multiple of it').toBe(0)
    expect(MMS_SRC, 'and it is the minimum `mms.ts` keeps for a fixed reply')
      .toContain(`MMS_FIXED_REPLY_RSTU_MIN = ${rstu}`)
    // the worked table states the same gate on this scene's own slot
    const [printedSlot, printedRstu, remainder] = figs(worked(6), /(\d+) % (\d+) = (\d+)/,
      'the worked table on the same gate')
    expect([printedSlot, printedRstu, remainder], 'the slot, the multiple and the remainder')
      .toEqual([slot, rstu, 0])
  })
})
