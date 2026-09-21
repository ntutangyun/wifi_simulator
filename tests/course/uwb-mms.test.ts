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
import { C_M_PER_NS, UWB_NLOS_NS, UWB_PL_EXP, UWB_RX_SENS_DBM, fomText, uwbPl0Db } from '../../src/uwb/phy'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import { mmsFragmentDbm, mmsLayout, mmsSet, rsfNs } from '../../src/uwb/mms'
import {
  NB_CHIP_US, NB_DEFAULT_CHANNELS, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES,
  NB_SYMBOL_CHIPS, NB_SYMBOL_US, nbCenterMhz, nbPpduNs,
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
const V: Record<Exclude<UwbMmsVariant, 'base'>, number> = { four: 0, rsf1: 1, twr: 2 }

const scenarioOf = (v: UwbMmsVariant): Scenario =>
  v === 'base' ? uwbMms.scenario() : uwbMms.variants![V[v]].scenario()
const recs = (v: UwbMmsVariant): TLRecord[] => runOf(uwbMms, v === 'base' ? undefined : V[v], RUN_NS)

/** 3-D distance from an anchor to the tag, as the scene places them. */
const distTo = (a: { x: number; y: number }): number =>
  Math.hypot(a.x - TAG_POS.x, a.y - TAG_POS.y, ANCHOR_Z - TAG_Z)

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbMms).map((s) => s.en).join('\n')

/** The lesson's nth table of `numbers`: 0 is the room, 1 is the round's log lines. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbMms.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en
/** The right-hand column of the log table, which is the line the log prints. */
const logLine = (row: number): string => cell(1, row, 1)

// The contract every migrated lesson owes. The window is what `npx tsx
// scripts/lesson-dump.ts uwb-mms en` reports for why + outcomes + terms + picture + numbers.
lessonShapeSuite(uwbMms, { proseMax: 950 })

describe('uwb-mms · the lesson', () => {
  it('opens UWB Tier 3 and module 15, after uwb-aoa, and names its four new words', () => {
    expect(uwbMms.id).toBe('uwb-mms')
    expect(uwbMms.module).toBe(15)
    // uwb-geometry too: the picture's last paragraph leans on the quality byte each range
    // carries flagging an obstructed path, which is uwb-geometry's FoM.
    expect(uwbMms.needs).toEqual(['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'])
    expect(uwbMms.terms!.map((t) => t.term)).toEqual(['MMS', 'fragment', 'RSF', 'RIF'])
    expect(TIERS[6]).toEqual({
      track: 'uwb', en: 'UWB Tier 3 · What comes next: 802.15.4ab', zh: 'UWB 第三阶段 · 下一步：802.15.4ab',
    })
    expect(MODULES[15]).toEqual({
      tier: 6, title: { en: 'Narrowband-assisted multi-millisecond UWB', zh: '窄带辅助的多毫秒 UWB' },
    })
    expect(MODULES[uwbMms.module].tier).toBe(6)
    expect(COURSE_ORDER[COURSE_ORDER.indexOf('uwb-aoa') + 1]).toBe('uwb-mms')
    const ids = LESSONS.map((l) => l.id)
    expect(ids[ids.indexOf('uwb-mms') - 1]).toBe('uwb-aoa')
    // the reader is sent to the verdict on a train, which is what the lesson is about
    const watch = uwbMms.picture!.find((b) => b.kind === 'watch') as Extract<Block, { kind: 'watch' }>
    expect(uwbMms.jumps[watch.jump!].label.en).toBe('what the far end made of that train')
  })

  it('it offers five jumps, two things to observe, two experiments and two questions', () => {
    expect(uwbMms.jumps).toHaveLength(5)
    expect(uwbMms.observe).toHaveLength(2)
    expect(uwbMms.tryThis).toHaveLength(2)
    expect(uwbMms.quiz).toHaveLength(2)
    for (const q of uwbMms.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs('base')
    const idx: number[] = []
    for (const j of uwbMms.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      idx.push(i)
    }
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the narrowband poll opens the round at 0, the first fragment goes out in slot 4, the
    // train is judged in the slot after the last fragment, the report lands in slot 24
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(2 * MS)
    expect(rs[idx[2]].t).toBe(9.5 * MS)
    expect(rs[idx[3]].t).toBe(12 * MS)
    expect(rs[idx[4]].t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 44)
  })

  it('says what is standard, what is draft and what is the room’s own — all of it in `sources`', () => {
    const src = uwbMms.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('RSTU, RCTU, the block and its slots')
    expect(src).toContain('the Clause 12 O-QPSK PHY at 250 kb/s')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('D5.0')
    expect(src).toContain('The balloted draft may differ')
    for (const doc of ['15-22/0381r5', '15-23/0100r2', '15-23/0502r3', '15-22/0205r0']) {
      expect(src, doc).toContain(doc)
    }
    const zh = uwbMms.sources!.map((s) => s.zh).join('\n')
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
      expect(t.en, t.en.slice(0, 40)).not.toContain('draft')
      expect(t.zh, t.en.slice(0, 40)).not.toContain('草案')
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
    expect(prose()).toContain('a long hall cut into three bays by two full-height brick partitions')
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
    expect(prose()).toContain('would be 8.58 m away, 3.6 decibels louder')
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
    expect(u.mms).toEqual({ ...DEFAULT_UWB_SESSION.mms, nbChannels: [3], report: 'responder' })
    expect(u.mms.rsfs).toBe(8)
    expect(u.mms.rifs).toBe(0)
    expect(u.mms.nMsr).toBe(40)
    expect(u.mms.gap).toBe(64)
    expect(u.mms.nbChannels).toEqual(NB_DEFAULT_CHANNELS)
    // the variants move one thing each, and the labels a reader picks them by
    expect(uwbMms.variants!.map((v) => v.label.en))
      .toEqual(['Four fragments', 'Set rsf-1', '4z for comparison'])
    expect(uwbMms.variants!.map((v) => v.label.zh)).toEqual(['四个片段', '参数集 rsf-1', '拿 4z 作对照'])
    expect(uwbMmsScenario('four').uwb!.mms).toEqual({ ...u.mms, rsfs: 4 })
    expect(uwbMmsScenario('rsf1').uwb!.mms).toEqual({ ...u.mms, ...mmsSet('rsf-1') })
    const twr = uwbMmsScenario('twr').uwb!
    expect(twr.mode).toBe('twr')
    expect(twr.method).toBe('ss')
    expect(twr.slotRstu).toBe(600)
    expect(JSON.stringify(uwbMmsScenario('twr').nodes)).toBe(JSON.stringify(sc.nodes))
  })

  it('"28 slots of 500 µs, so 14 ms" — three pair rounds inside a 200 ms block', () => {
    const plan = roundPlan(sc.uwb!, ANCHORS.length)
    expect(plan.slots).toBe(28)
    expect(plan.slotNs).toBe(0.5 * MS)
    expect(plan.roundNs).toBe(14 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    expect(plan.roundsPerBlock).toBe(14)
    const layout = mmsLayout({ ...sc.uwb!.mms })
    expect([layout.controlSlots, layout.rpSlots, layout.reportSlots]).toEqual([4, 20, 4])
    expect(layout.slots).toBe(28)
    expect(layout.reportSlot('responder')).toBe(24)
    const en = prose()
    expect(en).toContain('A round is 28 slots of 500 µs, so 14 ms, and it holds one anchor; three of them fit easily inside the 200 ms block')
    expect(en).toContain('Four slots open the round, twenty carry the fragments, and the responder reports in slot 24')
    // and the run agrees: 28-slot MMS rounds, three a block, one per anchor
    const rounds = ofType(recs('base'), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS * ANCHORS.length)
    expect(rounds.slice(0, 4).map((r) => [r.node, r.t, r.round, r.block, r.slots, r.mode])).toEqual([
      [TAG, 0, 0, 0, 28, 'mms'],
      [TAG, 14 * MS, 1, 0, 28, 'mms'],
      [TAG, 28 * MS, 2, 0, 28, 'mms'],
      [TAG, 200 * MS, 0, 1, 28, 'mms'],
    ])
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
    expect(prose()).toContain('Each fragment lands about seven decibels under the receiver')
    // "either all three are heard or none of them is"
    for (const t of trains) expect(t.detected, t.peer).toBe(true)
    for (const t of ofType(recs('four'), 'UWB_MMS_TRAIN')) expect(t.detected, t.peer).toBe(false)
  })

  it('"a fragment carries nothing": zero octets, no data rate, one stamp per train', () => {
    const tx = ofType(recs('base'), 'TX_START').filter((r) => r.t < 14 * MS)
    const frags = tx.filter((r) => r.frame.kind === 'uwbRsf')
    expect(frags).toHaveLength(16)
    for (const f of frags) {
      expect(f.frame.bytes).toBe(0)
      expect(f.frame.txTimeNs).toBe(82_051)
    }
    // "One transmit stamp per train": one TX_TS per sender in the round, not one per fragment
    const txStamps = ofType(recs('base'), 'UWB_TS')
      .filter((r) => r.dir === 'tx' && r.t < 14 * MS && r.node === TAG)
    expect(txStamps).toHaveLength(1)
    expect(frags.filter((f) => f.node === TAG)).toHaveLength(8)
    expect(txStamps[0].t).toBe(2 * MS)
    expect(logLine(2)).toBe(fmtRecord(txStamps[0]))
    expect(logLine(2)).toBe('tag-1 TX RMARKER → anchor-1 RSF: counter 336330610684')
    expect(logLine(3)).toBe(fmtRecord(frags[0]))
    expect(logLine(3)).toBe('tag-1 → anchor-1 UWBRSF 0 B @0 Mbps (82.1 µs)')
    expect(uwbMms.observe[1].en).toContain('each of zero octets at no data rate — a fragment carries nothing')
    expect(prose()).toContain('no preamble to search for, no header, no address, no data')
  })

  it('the log table is the round, line for line', () => {
    const rs = recs('base')
    expect(logLine(0)).toBe(fmtRecord(ofType(rs, 'UWB_ROUND')[0]))
    expect(logLine(0)).toBe('tag-1 UWB round 0 of block 0 (MMS): 28 slots × 500.0 µs')
    const poll = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect(logLine(1)).toBe(fmtRecord(poll))
    expect(logLine(1)).toBe('tag-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)')
    const train = ofType(rs, 'UWB_MMS_TRAIN').find((t) => t.node === 'anchor-1')!
    expect(train.t).toBe(9.5 * MS)
    expect(logLine(4)).toBe(fmtRecord(train))
    expect(logLine(4)).toBe('anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm')
    const rx = ofType(rs, 'UWB_TS').find((r) => r.dir === 'rx')!
    expect(rx.t).toBe(9.5 * MS)
    expect(logLine(5)).toBe(fmtRecord(rx))
    expect(logLine(5)).toBe('anchor-1 RX RMARKER ← tag-1 RSF: counter 26504711136 (75 % within 12 ns)')
    const report = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbReport')!
    expect(report.t).toBe(12 * MS)
    expect(logLine(6)).toBe(fmtRecord(report))
    expect(logLine(6)).toBe('anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(logLine(7)).toBe(fmtRecord(range))
    expect(logLine(7)).toBe('tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)')
    // the "When" column agrees with the records it quotes
    expect([cell(1, 4, 0), cell(1, 6, 0)]).toEqual(['9.500 ms', '12.000 ms'])
    expect((range.t / MS).toFixed(3)).toBe('12.608')
    // "only then does a receive stamp appear": the verdict comes first, in the same slot
    expect(ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx' && r.t < 9.5 * MS)).toEqual([])
    expect(uwbMms.observe[1].en).toContain('each side rules on what it accumulated, and only then does a receive stamp appear')
  })

  it('"Going deeper": the timestamp is the first pulse of the first fragment', () => {
    const rs = recs('base')
    const firstFragment = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbRsf')!
    const txStamp = ofType(rs, 'UWB_TS').find((r) => r.dir === 'tx')!
    expect(txStamp.t).toBe(firstFragment.t)
    expect(prose()).toContain('the timestamp is simply the first pulse of the first fragment of the train')
    // "no range in the run carries an integrity verdict at all"
    expect(uwbMmsScenario('base').uwb!.mms.rifs).toBe(0)
    for (const r of ofType(rs, 'UWB_RANGE')) expect(r.integrity, r.peer).toBeUndefined()
    expect(prose()).toContain('no range in the run carries an integrity verdict at all')
  })
})

describe('uwb-mms · who does the talking', () => {
  const rs = () => recs('base')

  it('"a Poll … a Response … a Report", 12, 12 and 13 octets', () => {
    expect([NB_POLL_BYTES, NB_RESP_BYTES, NB_REPORT_BYTES]).toEqual([12, 12, 13])
    expect(nbPpduNs(NB_POLL_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_RESP_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    const tx = ofType(rs(), 'TX_START').filter((r) => r.t < 14 * MS)
    expect(tx.map((r) => [r.node, r.frame.kind, r.t]).slice(0, 3)).toEqual([
      [TAG, 'nbPoll', 0], ['anchor-1', 'nbResp', MS], [TAG, 'uwbRsf', 2 * MS],
    ])
    expect(tx.at(-1)!.frame.kind).toBe('nbReport')
    expect(tx.at(-1)!.t).toBe(12 * MS)
    for (const r of tx) {
      const want = r.frame.kind === 'uwbRsf' ? 82_051 : nbPpduNs(r.frame.bytes)
      expect(r.frame.txTimeNs, r.frame.kind).toBe(want)
    }
    // "the anchor answers half a millisecond later" — the responder's own slot
    expect(prose()).toContain('the anchor answers half a millisecond later, and only then is either side primed to listen')
    // one report per pair round, from the responder of that round
    expect(ofType(rs(), 'TX_START').filter((r) => r.frame.kind === 'nbReport').map((r) => r.node))
      .toEqual(Array.from({ length: BLOCKS }, () => ANCHORS).flat())
    expect(uwbMmsScenario('base').uwb!.mms.report).toBe('responder')
  })

  it('"1.760 ms of the round’s 3.073 ms of air … all sixteen fragments are 1.313 ms"', () => {
    const air = ofType(rs(), 'TX_START').filter((r) => r.t < 14 * MS)
    const sum = (kinds: string[]): number =>
      air.filter((r) => kinds.includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(sum(['nbPoll', 'nbResp', 'nbReport'])).toBe(1_760_000)
    expect(sum(['uwbRsf'])).toBe(16 * 82_051)
    expect((sum(['uwbRsf']) / MS).toFixed(3)).toBe('1.313')
    expect((air.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS).toFixed(3)).toBe('3.073')
    expect(prose()).toContain('take 1.760 ms of the round’s 3.073 ms of air, while all sixteen fragments together take 1.313 ms')
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
    expect(uwbNbChannelText(u, STRINGS.en.uwb)).toBe('3 · 5733.75 MHz')
    expect(uwbNbChannelText(u, STRINGS.zh.uwb)).toBe('3 · 5733.75 MHz')
    expect(u.mms.lbtBusy).toBe(0)
    expect(ofType(rs(), 'UWB_NB_LBT')).toEqual([])
    expect(uwbMms.sources!.map((s) => s.en).join('\n'))
      .toContain('the narrowband control channel in UNII-3, where nothing else in this scene is talking')
  })

  it('the inspector’s train table is what the second experiment sends the reader to', () => {
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of recs('base')) applyRecord(vs, r)
    const rows = uwbTrainRows(vs.nodes[TAG].uwb!, STRINGS.en.uwb)
    expect(rows.map((r) => [r.peer, r.kind, r.heard, r.margin, r.detected])).toEqual([
      ['anchor-1', '8 × RSF', '8 / 8', '+1.8 dB', 'detected'],
      ['anchor-2', '8 × RSF', '8 / 8', '+1.8 dB', 'detected'],
      ['anchor-3', '8 × RSF', '8 / 8', '+2.0 dB', 'detected'],
    ])
    expect(uwbTrainRows(vs.nodes[TAG].uwb!, STRINGS.zh.uwb)[0].detected).toBe('检出')
    expect(uwbMms.tryThis[1].en).toContain('how many fragments each peer’s train was heard in full and what the sum came to')
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
    expect(prose()).toContain('Every range is long by the same 1.199 m')
    expect(prose()).toContain('which the quality byte on each range flags as an obstructed path')
    expect(uwbMms.sources!.map((s) => s.en).join('\n')).toContain('an NLOS excess delay of 2.0 ns per brick wall')
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
    // the block fix comes at the tag's last pair round of the block
    expect(fixes.map((f) => f.t)).toEqual(Array.from({ length: BLOCKS }, (_, b) => b * 200 * MS + 42 * MS))
    const vs = initViewState(uwbMmsScenario('base'))
    for (const r of rs()) applyRecord(vs, r)
    const row = uwbFixRow(vs.nodes[TAG].uwb!.position!, STRINGS.en.uwb)
    expect(row.estimate).toBe('(14.22, 4.05) m')
    expect(row.truth).toBe('(13.00, 4.00) m')
    expect(row.error).toBe('122.4 cm')
    expect(row.ellipse).toBe('6.1 × 1.3 cm')
    expect(row.method).toBe('two-way ranging')
    expect(uwbFixRow(vs.nodes[TAG].uwb!.position!, STRINGS.zh.uwb).method).toBe('双向测距 (TWR)')
    expect(prose()).toContain('The fix inherits it whole — (14.22, 4.05) m against a true (13.00, 4.00)')
    expect(prose()).toContain('while the ellipse beside it, which knows only noise, stays at centimetres')
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
    expect(uwbMms.tryThis[0].en).toContain('Not one range comes back')
    expect(uwbMms.tryThis[0].en).toContain('the log fills with timeouts')
  })
})
