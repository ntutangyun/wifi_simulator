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

// The contract every migrated lesson owes. The window is what `npx tsx
// scripts/lesson-dump.ts uwb-mms en` reports for why + outcomes + terms + picture + numbers.
lessonShapeSuite(uwbMms)

describe('uwb-mms · the lesson', () => {
  it('opens UWB Tier 3 and module 15, after uwb-aoa, and names its four new words', () => {
    expect(uwbMms.id).toBe('uwb-mms')
    expect(uwbMms.module).toBe(15)
    // uwb-geometry too: the picture's last paragraph leans on the quality byte each range
    // carries flagging an obstructed path, which is uwb-geometry's FoM.
    expect(uwbMms.needs).toEqual(['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'])
    expect(uwbMms.terms!.map((t) => t.term)).toEqual(['MMS', 'fragment', 'RSF', 'RIF', 'sensitivity', 'margin'])
    expect(TIERS[6].track).toBe('uwb')
    expect(MODULES[15].tier).toBe(6)
    expect(MODULES[uwbMms.module].tier).toBe(6)
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-aoa') + 1]).toBe('uwb-mms')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-mms') - 1]).toBe('uwb-aoa')
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
    expect(src).toContain('D5.0')
    for (const doc of ['15-22/0381r5', '15-23/0100r2', '15-23/0502r3', '15-22/0205r0']) {
      expect(src, doc).toContain(doc)
    }
    const zh = uwbMms.sources!.map((s) => s).join('\n')
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('D5.0')
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
    expect(JSON.stringify(bad.error!.issues)).toContain('4 responders')
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

