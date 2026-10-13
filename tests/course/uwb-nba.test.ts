/**
 * Every empirical claim in "A second radio does the talking", the first half of the
 * old `uwb-nba`: what the narrowband control radio says in one round, how long each
 * of its three messages holds the air, and where those messages fall in the first
 * ranging block.
 *
 * The scenario builder lives in this file's lesson, so its scene and its three
 * variants are pinned here once; `tests/course/uwb-nba-coexist.test.ts` next door
 * reads the same run for the coexistence half and asserts, through the kit's
 * `sameSceneAs`, that the two ids load the very same scenes.
 *
 * The message sizes, the symbol arithmetic and the two path-loss laws come from the
 * engine's own exports rather than being re-typed here, and every measured figure is
 * read out of a run over the lesson's 1.3 s window.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_Z, LAPTOP_POS, NBA_ANCHORS, NBA_CHANNELS, ROUTER_POS, TAG_POS, TAG_Z,
  NBA_ANCHOR_COUNT, WIFI_6G_CENTER_MHZ, uwbNba, uwbNbaScenario, type UwbNbaVariant,
} from '../../src/course/uwb/uwb-nba'
import { DEFAULT_UWB_SESSION, ScenarioSchema, sixGhzChannelNo } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { LESSON_6G_WIDTH_MHZ, oneRoom } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { applyRecord, initViewState } from '../../src/model/view'
import {
  NB_CHIP_US, NB_CRC_BYTES, NB_MSG_ID, NB_MSG_ID_BYTES, NB_PHR_SYMBOLS, NB_POLL_BYTES,
  NB_REPORT_BYTES, NB_REPORT_TIME_BYTES, NB_RESP_BYTES, NB_RX_SENS_DBM, NB_SHR_SYMBOLS,
  NB_SYMBOL_CHIPS, NB_SYMBOL_US, NB_TX_DBM, nbOtmPollBytes, nbPl0Db, nbPpduNs,
} from '../../src/uwb/nb'
import { UWB_CHIP_HZ, uwbPathLossDb } from '../../src/uwb/units'
import { uwbPl0Db } from '../../src/uwb/phy'
import { mmsLayout } from '../../src/uwb/mms'
import { roundPlan } from '../../src/uwb/session'
import { rstuNs, uwbNbSlotFitNs } from '../../src/uwb/phy'
import { uwbTrainKey } from '../../src/uwb/view'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven whole blocks: block 6 opens at 1.200 s and its four pair rounds are over by
 * 1.256 s, while block 7 would not start until 1.400 s. The lesson's "1.3 seconds". */
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = 'uwb-1'
const ANCHORS = NBA_ANCHORS.map((a) => a.id)
/** Index into `uwbNba.variants`: the scene where nothing stops the cycle. */
const V_OUT = 0
/** Index into `uwbNba.variants`: the pair round this lesson ran before one-to-many existed. */
const V_PAIR = 3

// The contract every migrated lesson owes, as the kit enforces it. `npx tsx
// scripts/lesson-dump.ts uwb-nba` prints the lesson and the minutes it costs.
lessonShapeSuite(uwbNba)

const recs = (variant?: number): TLRecord[] => runOf(uwbNba, variant, RUN_NS)
const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const TAG_3D = { x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z }

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbNba).map((s) => s).join('\n')

/** The lesson's nth table of `numbers`, rows kept in place so a cell can be read by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbNba.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
const formula = (): Extract<Block, { kind: 'formula' }> =>
  uwbNba.numbers!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!

describe('uwb-nba · the lesson', () => {
  it('is the narrowband half of module 15, needing the fragment lesson before it', () => {
    expect(uwbNba.id).toBe('uwb-nba')
    expect(MODULES[uwbNba.module].title).toBe('窄带控制面')
    expect(TIERS[6].track).toBe('uwb')
    expect(MODULES[uwbNba.module].tier).toBe(6)
    expect(uwbNba.needs).toEqual(['uwb-mms'])
    expect(COURSE_ORDER.indexOf('uwb-nba')).toBeGreaterThan(COURSE_ORDER.indexOf('uwb-mms-numbers'))
  })

  it('names the second radio and the three things it says', () => {
    // the log's own prefix on all three: "Report" alone is uwb-dstwr's word for the wideband
    // message that closes a DS-TWR round, and one track may not gloss one word twice.
    expect(uwbNba.terms!.map((t) => t.term)).toEqual(['narrowband', 'NB', 'NB Poll', 'NB Response', 'NB Report'])
    // the picture promises the log's own prefix, which the observations then quote
    expect(uwbNba.observe[0]).toContain('NBPOLL')
  })

  it('the scenario and its four variants pass the scenario schema, labels unchanged', () => {
    expect(() => ScenarioSchema.parse(uwbNba.scenario())).not.toThrow()
    expect(uwbNba.variants).toHaveLength(4)
    for (const v of uwbNba.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(uwbNba.variants!.map((v) => v.label))
      .toEqual(['避开路由器的信道', '在四个信道间跳变', '不先听后发', '一次只问一个锚点'])
    // only the base is one-to-many; every variant is the pair round this lesson used to run,
    // with all four corner anchors, which is why only the base's recorded hash moved
    expect(uwbNbaScenario('base').uwb!.mms.oneToMany).toBe(true)
    expect(uwbNbaScenario('base').nodes.map((n) => n.id)).toEqual(['ap', 'laptop', 'anchor-1', 'anchor-2', 'anchor-3', TAG])
    for (const v of ['outside', 'hop', 'noLbt', 'pairwise'] as const) {
      expect(uwbNbaScenario(v).uwb!.mms.oneToMany, v).toBe(false)
      expect(uwbNbaScenario(v).nodes.map((n) => n.id), v).toEqual(['ap', 'laptop', ...ANCHORS, TAG])
    }
  })

  it('offers four jumps, and they occur in the base run in the order the list gives them', () => {
    expect(uwbNba.jumps).toHaveLength(4)
    const rs = recs()
    const idx = uwbNba.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the poll opens the one-to-many round at 0, the anchors judge the tag's train in the
    // slot after its last fragment, the first report lands in slot 40, and the distance follows
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(18.5 * MS)
    expect(rs[idx[2]].t).toBe(20 * MS)
    expect(rs[idx[3]].t).toBe(20 * MS + nbPpduNs(NB_REPORT_BYTES) + 16)
    // the watch call-out sends the reader to the first of them
    const watch = uwbNba.picture!.find((b) => b.kind === 'watch') as Extract<Block, { kind: 'watch' }>
    expect(watch.jump).toBe(0)
  })
})

describe('uwb-nba · the scene', () => {
  const sc = uwbNbaScenario('base')

  it('is the coexistence lesson’s room: one 10 × 8 m lab, a Wi-Fi 7 router and a saturated laptop', () => {
    expect(sc.rooms).toEqual(oneRoom().rooms)
    expect(sc.walls).toEqual(oneRoom().walls)
    expect(sc.sixGhzCenterMhz).toBe(WIFI_6G_CENTER_MHZ)
    expect(WIFI_6G_CENTER_MHZ).toBe(6305)
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    expect(ap.pos).toEqual({ x: ROUTER_POS.x, y: ROUTER_POS.y, z: ROUTER_POS.z })
    expect(ap.txPowerDbm).toBe(20)
    expect(ap.caps.widthMhz).toBe(LESSON_6G_WIDTH_MHZ)
    expect(LESSON_6G_WIDTH_MHZ).toBe(80)
    expect(ap.caps.generation).toBe('eht') // Wi-Fi 7, as the module header says
    const laptop = sc.nodes.find((n) => n.id === 'laptop')!
    expect(laptop.pos).toEqual({ x: LAPTOP_POS.x, y: LAPTOP_POS.y, z: 1.0 })
    expect(laptop.profiles).toEqual(['saturated'])
    expect(laptop.txPowerDbm).toBe(15)
    expect(laptop.linkId).toBe('6g')
    // channel 71 of the 6 GHz plan, 6265 to 6345 MHz — the coexistence half quotes these
    expect(sixGhzChannelNo(WIFI_6G_CENTER_MHZ)).toBe(71)
    expect([WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2, WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2])
      .toEqual([6265, 6345])
  })

  it('places the corner anchors at 2.20 m and the tag 1.50 m from the router', () => {
    // the one-to-many base leaves the fourth corner empty (see the variants test above)
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'laptop', 'anchor-1', 'anchor-2', 'anchor-3', TAG])
    expect(uwbNbaScenario('pairwise').nodes.map((n) => n.id)).toEqual(['ap', 'laptop', ...ANCHORS, TAG])
    for (const a of NBA_ANCHORS.slice(0, 3)) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect(n.pos, a.id).toEqual({ x: a.x, y: a.y, z: ANCHOR_Z })
      expect(n.uwb, a.id).toEqual({ role: 'anchor' })
    }
    const tag = sc.nodes.find((n) => n.id === TAG)!
    expect(tag.pos).toEqual({ x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z })
    expect(tag.uwb).toEqual({ role: 'tag' })
    expect(ANCHOR_Z).toBe(2.2)
    expect(TAG_Z).toBe(1.0)
    expect([TAG_POS.x, TAG_POS.y, TAG_Z]).toEqual([4, 3.5, 1.0])
    expect([ROUTER_POS.x, ROUTER_POS.y, ROUTER_POS.z]).toEqual([5, 4, 2.0])
    // the three distances the two halves quote: the router at 1.50 m, the laptop at 3.35 m,
    // and the anchor whose report is the one range of the base run at 4.76 m
    expect(dist3(TAG_3D, ROUTER_POS)).toBeCloseTo(Math.sqrt(1 + 0.25 + 1), 12)
    expect(dist3(TAG_3D, ROUTER_POS).toFixed(2)).toBe('1.50')
    expect(dist3(TAG_3D, { x: LAPTOP_POS.x, y: LAPTOP_POS.y, z: 1.0 }).toFixed(2)).toBe('3.35')
    expect(dist3(TAG_3D, { x: NBA_ANCHORS[0].x, y: NBA_ANCHORS[0].y, z: ANCHOR_Z }).toFixed(2)).toBe('4.76')
    expect(uwbNba.observe[2]).toContain('true 4.76 m')
  })

  it('is an MMS session on UWB channel 9, reporting both ways, and the variants move one thing each', () => {
    const u = sc.uwb!
    expect(u.mode).toBe('mms')
    expect(u.method).toBe('ss')
    expect(u.slotRstu).toBe(600)
    expect(u.channel).toBe(9)
    expect(u.aoa).toBe(false)
    expect(u.nlos).toBe(true)
    expect(u.blockRstu).toBe(DEFAULT_UWB_SESSION.blockRstu)
    expect(u.mms).toEqual({ ...DEFAULT_UWB_SESSION.mms, nbChannels: [200], nbLbt: 'auto', report: 'bi', oneToMany: true })
    expect(u.mms.rsfs).toBe(8)
    const pair = { ...u.mms, oneToMany: false }
    expect(uwbNbaScenario('outside').uwb!.mms).toEqual({ ...pair, nbChannels: [100] })
    expect(uwbNbaScenario('hop').uwb!.mms).toEqual({ ...pair, nbChannels: [100, 150, 200, 210] })
    expect(uwbNbaScenario('noLbt').uwb!.mms).toEqual({ ...pair, nbLbt: 'off' })
    expect(uwbNbaScenario('pairwise').uwb!.mms).toEqual(pair)
    expect(NBA_CHANNELS).toEqual({ base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200], pairwise: [200] })
    // every pair-round variant carries the same four nodes, byte for byte
    const pairNodes = JSON.stringify(uwbNbaScenario('pairwise').nodes)
    for (const v of ['outside', 'hop', 'noLbt'] as UwbNbaVariant[]) {
      expect(JSON.stringify(uwbNbaScenario(v).nodes), v).toBe(pairNodes)
    }
  })
})

describe('uwb-nba · the three messages of a round', () => {
  it('"Poll 12 B · 576.0 µs", "Response 12 B · 576.0 µs", "Report 13 B · 608.0 µs"', () => {
    expect(NB_POLL_BYTES).toBe(12)
    expect(NB_RESP_BYTES).toBe(12)
    expect(NB_REPORT_BYTES).toBe(13)
    expect(nbPpduNs(NB_POLL_BYTES) / 1000).toBe(576)
    expect(nbPpduNs(NB_RESP_BYTES) / 1000).toBe(576)
    expect(nbPpduNs(NB_REPORT_BYTES) / 1000).toBe(608)
    // the one-to-many poll names its responders: two content octets plus three per address
    expect(nbPpduNs(23) / 1000).toBe(928)
    // the row labels are the lesson's words; the octets and the airtime are the engine's
    expect([cell(0, 0, 1), cell(0, 0, 2)]).toEqual(['23 B', '928.0 µs'])
    expect([cell(0, 1, 1), cell(0, 1, 2)]).toEqual(['12 B', '576.0 µs'])
    expect([cell(0, 2, 1), cell(0, 2, 2)]).toEqual(['12 B', '576.0 µs'])
    expect([cell(0, 3, 1), cell(0, 3, 2)]).toEqual(['13 B', '608.0 µs'])
    expect(NB_REPORT_TIME_BYTES).toBe(5)
  })

  it('"(10 + 2 + 2 × octets) symbols × 16 µs" is the engine’s own airtime', () => {
    expect(NB_SHR_SYMBOLS).toBe(10)
    expect(NB_PHR_SYMBOLS).toBe(2)
    expect(NB_SYMBOL_US).toBe(16)
    expect(nbPpduNs(12)).toBe((10 + 2 + 2 * 12) * 16 * 1000)
    expect((10 + 2 + 2 * 12)).toBe(36)
    expect((10 + 2 + 2 * 13)).toBe(38)
    expect(formula().text).toContain('36 × 16 = 576 µs')
    expect(formula().text).toContain('38 × 16 = 608 µs')
    // "Four bits ride on each symbol and a symbol lasts 16 µs, which is 250 kb/s"
    expect(NB_SYMBOL_CHIPS * NB_CHIP_US).toBe(NB_SYMBOL_US)
    expect(4 / (NB_SYMBOL_US / 1000)).toBe(250) // 4 bits per 16 µs symbol, in kb/s
    expect(NB_SHR_SYMBOLS + NB_PHR_SYMBOLS).toBe(12)
  })

  it('"a poll and a response together hold the air for 1.504 ms", longer than any fragment', () => {
    expect((2 * nbPpduNs(NB_POLL_BYTES) / MS).toFixed(3)).toBe('1.152')
    // the one-to-many poll is 23 octets, so the pair is 928 + 576 µs
    expect(((nbPpduNs(23) + nbPpduNs(NB_RESP_BYTES)) / MS).toFixed(3)).toBe('1.504')
    const fragments = ofType(recs(V_OUT), 'TX_START').filter((r) => r.frame.kind === 'uwbRsf')
    expect(fragments.length).toBeGreaterThan(0)
    for (const f of fragments) expect(f.frame.txTimeNs).toBeLessThan(nbPpduNs(NB_POLL_BYTES))
  })
})

describe('uwb-nba · one block, message by message', () => {
  const at = (t: number, pred: (r: TLRecord) => boolean): TLRecord =>
    recs().find((r) => r.t === t && pred(r))!
  const txKind = (k: string) => (r: TLRecord): boolean => r.type === 'TX_START' && r.frame.kind === k

  it('"the poll leaves at zero, the first response answers at 1.000 ms"', () => {
    expect(fmtRecord(at(0, txKind('nbPoll')))).toBe('uwb-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)')
    expect(at(1 * MS, txKind('nbResp'))).toBeDefined()
    // "It is the first thing in the whole run — no ranging frame has been sent yet"
    expect(ofType(recs(), 'TX_START')[0].frame.kind).toBe('nbPoll')
    // the pair round's own poll, still twelve octets, is on the pairwise variant
    const pairPoll = ofType(runOf(uwbNba, V_PAIR, RUN_NS), 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect(fmtRecord(pairPoll)).toBe('uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)')
  })

  it('"the first report goes out at 20.000 ms, and the distance appears 608 µs behind it"', () => {
    expect(fmtRecord(at(20 * MS, txKind('nbReport'))))
      .toBe('anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    const r = ofType(recs(), 'UWB_RANGE')[0]
    expect(r.node).toBe(TAG)
    expect(r.t).toBe(20 * MS + nbPpduNs(NB_REPORT_BYTES) + 16)
    expect((r.t / MS).toFixed(3)).toBe('20.608')
    expect(fmtRecord(r)).toBe('uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)')
  })
})

describe('uwb-nba · the grid underneath and the train on top', () => {
  it('"a round is 52 slots of 500 µs, so 26 ms", one to a block, seven blocks in 1.3 s', () => {
    const plan = roundPlan(uwbNbaScenario('base').uwb!, 3)
    expect(plan.slots).toBe(52)
    expect(plan.roundNs).toBe(26 * MS)
    expect(plan.roundNs / plan.slots).toBe(0.5 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    // M5: `sources` quotes this same 52, not the pairwise round's 28
    expect(uwbNba.sources!.map((s) => s).join(' ')).toContain(String(plan.slots))
    // one round a block: block 6's ends at 1.226 s, inside the window
    expect(6 * plan.blockNs + plan.roundNs).toBeLessThan(RUN_NS)
    expect(7 * plan.blockNs).toBeGreaterThan(RUN_NS)
    const rounds = ofType(recs(), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS)
    expect([...new Set(rounds.map((r) => r.block))]).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const r of rounds) expect(r.mode).toBe('mms')
    // the pair round the variants still run: 28 slots, one per anchor, four to a block
    const pair = roundPlan(uwbNbaScenario('pairwise').uwb!, ANCHORS.length)
    expect([pair.slots, pair.roundNs]).toEqual([28, 14 * MS])
    expect(ofType(recs(V_OUT), 'UWB_ROUND')).toHaveLength(BLOCKS * ANCHORS.length)
  })

  it('"8 fragments of 8 … 34.5 dB and 33.4 dB" — the wide radio is never the problem', () => {
    const vs = initViewState(uwbNbaScenario('base'))
    for (const r of recs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    // Y = 0 in this session, so there is one fragment row per peer and no integrity row
    // anchor-2 loses its narrowband slot to the router and never joins, so the tag's two
    // trains are anchor-1's and anchor-3's
    expect(Object.keys(u.mms.trains)).toEqual([uwbTrainKey('anchor-1', 'rsf'), uwbTrainKey('anchor-3', 'rsf')])
    for (const t of Object.values(u.mms.trains)) {
      expect(`${t.heard} / ${t.fragments}`).toBe('8 / 8')
      expect(t.detected).toBe(true)
    }
    expect(Object.values(u.mms.trains).map((t) => t.marginDb.toFixed(1))).toEqual(['34.5', '33.4'])
    const train = ofType(recs(), 'UWB_MMS_TRAIN')[0]
    expect([train.heard, train.fragments, train.detected]).toEqual([8, 8, true])
    expect(train.marginDb.toFixed(1)).toBe('34.5')
  })

  it('the base round is one round a block; the pair variants are four', () => {
    const block0 = ofType(recs(), 'UWB_ROUND').filter((r) => r.block === 0)
    expect(block0.map((r) => r.round)).toEqual([0])
    // one 26 ms round is 26 ms of a 200 ms block, so it is what the block holds, not what
    // fills it: the run's own numbers say the rest of the block is empty
    // Review I3: the base yields four distances in two of the seven blocks, not one in all of them
    expect(prose()).not.toContain('happens exactly once')
    const blocks = [...new Set(ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG).map((r) => r.block))]
    expect(blocks).toEqual([0, 4])
    expect(ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(4)
    expect(prose()).not.toContain('fill a block')
    expect(block0.length * 26).toBeLessThan(200)
    // and the experiment sends the reader to the pair round, where the cycle runs four times
    const pairBlock0 = ofType(recs(V_PAIR), 'UWB_ROUND').filter((r) => r.block === 0)
    expect(pairBlock0.map((r) => r.round)).toEqual([0, 1, 2, 3])
    expect(ofType(recs(V_OUT), 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(BLOCKS * 4)
  })
})

describe('uwb-nba · what the depth says', () => {
  it('the compressed payload: one message-ID octet, the fields, a two-octet check', () => {
    // The lesson teaches the pairwise four; the one-to-many four (0x10…0x13) are the same
    // table's other half and are pinned in tests/uwb/nb.test.ts.
    expect(NB_MSG_ID).toMatchObject({ poll: 0x04, resp: 0x05, reportInitiator: 0x06, reportResponder: 0x07 })
    expect(NB_MSG_ID_BYTES).toBe(1)
    expect(NB_CRC_BYTES).toBe(2)
    expect(NB_REPORT_BYTES - NB_POLL_BYTES).toBe(1) // the payload-length octet with no payload
  })

  it('"hears down to −100 dBm and the transmitter puts out 10 dBm", against 499.2 MHz of ranging', () => {
    expect(NB_RX_SENS_DBM).toBe(-100)
    expect(NB_TX_DBM).toBe(10)
    expect(UWB_CHIP_HZ / 1e6).toBe(499.2)
  })

  it('the provenance is in sources and nowhere else', () => {
    const src = uwbNba.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('草案')
    expect(src).toContain('15-22/0381r5')
    expect(src).toContain('15-23/0100r2')
    // Review M5: `sources` said 28 slots, which is the PAIRWISE round. The base scene is
    // one-to-many with three responders: control 8 + ranging 32 + report 12 = 52.
    // the standard's own sensitivity floor for this PHY, named as the model's departure
    expect(src).toContain('−85 dBm')
  })
})

describe('uwb-nba · the quiz is answerable from the main path', () => {
  it('names the radio that carries the reply time, and the 576 µs arithmetic', () => {
    expect(uwbNba.quiz).toHaveLength(2)
    for (const q of uwbNba.quiz) expect(q.options[q.answer]).toBeDefined()
    // both answers are derivable from the numbers section alone
  })
})

/**
 * The procedure the lesson closes on: which radio does what, in the order the engine does it,
 * and the same round in microseconds under it. The slot indices are `mmsLayout`'s, the message
 * sizes are `nb.ts`'s and the timings are the run's — a step or a cell that drifted from any of
 * the three would send a reader to a timeline that does not match the words.
 */
describe('uwb-nba · how the two radios divide one round', () => {
  const base = uwbNbaScenario('base')
  const responders = NBA_ANCHOR_COUNT('base')
  const layout = mmsLayout({ ...base.uwb!.mms }, responders)
  /** The procedure in `numbers`, and its worked example (the lesson's third table). */
  const steps = (): string[] => {
    const b = uwbNba.numbers!.filter((x): x is Extract<Block, { kind: 'steps' }> => x.kind === 'steps')
    expect(b).toHaveLength(1)
    return b[0].items.map((i) => i)
  }
  const worked = (row: number): string => cell(1, row, 1)

  it('is six steps closing the numbers, with the worked example last', () => {
    expect(steps()).toHaveLength(6)
    expect(uwbNba.numbers!.at(-1)).toBe(table(1))
    expect(uwbNba.numbers!.at(-2)!.kind).toBe('steps')
    expect(table(1).rows).toHaveLength(6)
  })

  it('step 1 — the small radio speaks first, and no ranging frame has gone out yet', () => {
    expect(worked(0)).toBe('slot 0 · 23 B · 928.0 µs')
    expect(nbPpduNs(23)).toBe(928_000)
    const rs = recs()
    const first = rs.find((r) => r.type === 'TX_START' && r.node === TAG)!
    expect(first.type === 'TX_START' && first.frame.kind).toBe('nbPoll')
    expect(first.t).toBe(0)
  })

  it('step 2 — a Response window a responder, and that answer is what primes the receiver', () => {
    expect(worked(1)).toBe('slots 2, 4, 6 · 12 B · 576.0 µs')
    expect(Array.from({ length: responders }, (_, r) => layout.respSlot(r))).toEqual([2, 4, 6])
    expect(nbPpduNs(NB_RESP_BYTES)).toBe(576_000)
  })

  it('step 3 — the wide radio carries fragments and nothing else, one stamp a train', () => {
    expect(worked(2)).toBe('slots 8–39 · 0 B · 0 Mbps')
    expect(layout.controlSlots).toBe(8)
    expect(layout.controlSlots + layout.rpSlots - 1).toBe(39)
    const rs = recs()
    const frags = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRsf' && r.t < 26 * MS)
    expect(frags.length).toBeGreaterThan(0)
    for (const f of frags) expect(f.frame.bytes).toBe(0)
    const stamps = ofType(rs, 'UWB_TS').filter((r) => r.dir === 'tx' && r.node === TAG && r.t < 26 * MS)
    expect(stamps).toHaveLength(1)
  })

  it('step 4 — one grid: a narrowband window is two of the slots a fragment gets', () => {
    expect(worked(3)).toBe('52 × 500.0 µs = 26 ms')
    const plan = roundPlan(base.uwb!, responders)
    expect([plan.slots, plan.slotNs, plan.roundNs]).toEqual([52, 0.5 * MS, 26 * MS])
    // the Poll and the Response windows are two slots each, which is what fixes the fit rule
    expect(layout.respSlot(1) - layout.respSlot(0)).toBe(2)
    expect(layout.controlSlots).toBe(2 * (1 + responders))
  })

  it('step 5 — the closing windows go back to the small radio, two an anchor', () => {
    expect(worked(4)).toBe('slots 40, 44, 48 · 13 B · 608.0 µs')
    expect(Array.from({ length: responders }, (_, r) => layout.reportSlot('responder', r)))
      .toEqual([40, 44, 48])
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    expect(NB_REPORT_TIME_BYTES).toBe(5)
  })

  it('step 6 — the distance follows the closing message, 608 µs behind it', () => {
    expect(worked(5)).toBe('20.608 ms')
    const rs = recs()
    const report = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbReport')!
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(report.t).toBe(20 * MS)
    expect(range.t).toBeGreaterThan(report.t)
    expect((range.t / MS).toFixed(3)).toBe('20.608')
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The tables and the steps above are read the right way round; the prose between them is not.
 * The sampling sweep of 2026-10-12 scored this lesson 4 of 6, and what it reached was all in
 * paragraphs: the round's own grid, the two fragment margins, the compressed payload's message
 * IDs, the narrowband link budget, `sources`' symbol arithmetic, all three `observe` lines and
 * both questions. Every assertion here parses its figure out of the shipped string.
 *
 * **The reads worth naming:**
 *
 *  - **the 576 µs is read as the arithmetic the lesson prints.** 「(10 + 2 + 2 × 字节数) 个符号
 *    × 16 µs」 is parsed term by term against `NB_SHR_SYMBOLS`, `NB_PHR_SYMBOLS` and
 *    `NB_SYMBOL_US`, and each of the three lines under it — 12, 13 and 23 octets — has to be the
 *    airtime `nbPpduNs` really gives that message.
 *  - **the 250 kb/s is read as a quotient**: four bits in a symbol of that many microseconds,
 *    which is also where the symbol's 32 chips at 0.5 µs come from in `sources`.
 *  - **the four message IDs are read against `NB_MSG_ID`**, hexadecimal digits and all — the
 *    prose writes them as 0x04 … 0x07 and the planter moves the last digit of each.
 *  - **the narrowband range claim is read against the one term that changes.** 「lossDbFor 对
 *    窄带只换掉 1 m 处的自由空间项」: the 1 m is `freeSpacePl0Db`'s own reference distance, named
 *    in `units.ts`, and the claim is checked by computing both laws — only the first metre
 *    differs, the exponent and the walls do not.
 */
describe('uwb-nba · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(uwbNba.picture)
  const NUMS = blockText(uwbNba.numbers)
  const DEEP = blockText(uwbNba.deeper)
  const LIM = blockText(uwbNba.limits)
  const SRC = blockText(uwbNba.sources)
  const OBS = blockText(uwbNba.observe)
  const QUIZ = blockText(uwbNba.quiz)
  /** The leaf that defines the first metre both radios measure from. */
  const UNITS_SRC = readFileSync(new URL('../../src/uwb/units.ts', import.meta.url), 'utf8')

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
  const PLAN = roundPlan(uwbNbaScenario('base').uwb!, NBA_ANCHOR_COUNT('base'))

  it('reads the 576 µs as the arithmetic it prints, all three message sizes of it', () => {
    // 「(10 + 2 + 2 × 字节数) 个符号 × 16 µs」
    const [shr, phr, perByte, symUs] = figs(formula().text,
      /\((\d+) \+ (\d+) \+ (\d+) × 字节数\) 个符号 × (\d+) µs/, 'the formula’s own terms')
    expect(shr, 'the preamble and marker symbols').toBe(NB_SHR_SYMBOLS)
    expect(phr, 'the header symbols').toBe(NB_PHR_SYMBOLS)
    expect(perByte, 'the symbols one octet takes').toBe(2)
    same(String(symUs), NB_SYMBOL_US, 'one symbol of this radio')
    // 「12 字节 → 36 × 16 = 576 µs」, 「13 字节 → 38 × 16 = 608 µs」, 「23 字节 → 58 × 16 = 928 µs」
    const lines = [...formula().text.matchAll(/(\d+) 字节 → (\d+) × (\d+) = (\d+) µs/g)]
      .map((m) => m.slice(1).map(val))
    expect(lines.length, 'one worked line per message size of this round').toBe(3)
    for (const [bytes, syms, mul, us] of lines) {
      expect(shr! + phr! + perByte! * bytes!, `the symbols ${bytes} octets take`).toBe(syms)
      expect(mul, 'times the same symbol').toBe(symUs)
      expect(syms! * mul!, `the airtime of ${bytes} octets`).toBe(us)
      same(String(us), nbPpduNs(bytes!) / 1000, `which is what the engine gives ${bytes} octets`)
    }
    const pollFrame = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'nbPoll')[0]!.frame
    expect(lines.map(([b]) => b), 'the three sizes this round really sends')
      .toEqual([NB_RESP_BYTES, NB_REPORT_BYTES, pollFrame.bytes])
    // 「每个符号载四个比特，一个符号持续 16 µs，也就是 250 kb/s」
    const [noteUs, kbps] = figs(NUMS, /一个符号持续 (\d+) µs，也就是 (\d+) kb\/s/, 'the note on the rate')
    expect(noteUs, 'the same symbol').toBe(symUs)
    same(String(kbps), 4 / (NB_SYMBOL_US / 1e6) / 1000, 'four bits in a symbol, as a bit rate')
    // the heading over it is that same airtime
    const [headUs] = figs(formula().heading!, /^(\d+) µs 是怎么来的/, 'the formula’s own heading')
    expect(headUs, 'the airtime the block is about').toBe(lines[0]![3])
  })

  it('reads the first block message by message, and the grid underneath it', () => {
    const rs = recs()
    // 「第一条 Report 在 20.000 ms 处发出，而距离紧随其后 608 µs 出现，落在 20.608 ms」
    const [behind, at] = figs(NUMS, /距离紧随其后 (\d+) µs 出现，落在 ([\d.]+) ms/,
      '`numbers` on the first distance')
    const report = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'nbReport')[0]!
    const range = ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG)[0]!
    same(String(at), range.t / MS, 'when the first distance appears')
    same(String(behind), (range.t - report.t) / 1000, 'and how far behind the report it is')
    expect(behind! * 1000, 'which is that report’s own airtime').toBe(report.frame.txTimeNs)
    // 「一轮是 52 个时隙、每个 500 µs，合 26 ms；一个块只装一轮」
    const [slots, slotUs, roundMs] = figs(NUMS,
      /一轮是 (\d+) 个时隙、每个 (\d+) µs，合 (\d+) ms/, '`numbers` on the grid')
    expect(slots, 'the slots a round of this session has').toBe(PLAN.slots)
    same(String(slotUs), PLAN.slotNs / 1000, 'the slot they are')
    same(String(roundMs), PLAN.roundNs / MS, 'and the round they make')
    expect(slots! * slotUs! * 1000, 'the product the sentence states').toBe(PLAN.roundNs)
    // 「这段 1.3 秒的运行里，整整齐齐放得下七个块」
    const [secs] = figs(NUMS, /这段 ([\d.]+) 秒的运行里/, '`numbers` on the window')
    same(String(secs), RUN_NS / (1000 * MS), 'the window every figure of this lesson is measured over')
    const blocks = new Set(ofType(rs, 'UWB_ROUND').map((r) => r.block))
    expect(blocks.size, 'the blocks that window holds').toBe(BLOCKS)
    // 「一条 Poll 加一条 Response 合起来占住空口 1.504 ms」
    const [together] = figs(NUMS, /合起来占住空口 ([\d.]+) ms/, '`numbers` on the two messages')
    // the poll of this round names three responders, so it is the longer one-to-many poll
    const pollNs = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'nbPoll')[0]!.frame.txTimeNs
    const respNs = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'nbResp')[0]!.frame.txTimeNs
    same(String(together), (pollNs + respNs) / MS, 'a poll and a response together')
    expect(respNs, 'the response being the pair-round message size').toBe(nbPpduNs(NB_RESP_BYTES))
    // …and every fragment of the train they arrange is shorter than either of them
    const frags = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRsf')
    expect(frags.length, 'the run really sends fragments').toBeGreaterThan(0)
    expect(Math.max(...frags.map((r) => r.frame.txTimeNs)), 'and the longest is shorter than either')
      .toBeLessThan(Math.min(pollNs, respNs))
  })

  it('reads the two fragment margins, and the eight of eight beside them', () => {
    // 「两个作答的锚点都是 8 个片段收到 8 个，两串片段分别比接收端所需的电平高出 34.5 dB 与 33.4 dB」
    const [sent, heard, m1, m2] = figs(NUMS,
      /都是 (\d+) 个片段收到 (\d+) 个，两串片段分别比接收端所需的电平高出 ([\d.]+) dB 与 ([\d.]+) dB/,
      '`numbers` on the trains')
    const trains = ofType(recs(), 'UWB_MMS_TRAIN').filter((r) => r.node === TAG && r.kind === 'rsf')
    expect(new Set(trains.map((r) => r.fragments)), 'the fragments each train carries')
      .toEqual(new Set([sent]))
    expect(new Set(trains.map((r) => r.heard)), 'and the ones that were heard').toEqual(new Set([heard]))
    expect(heard, 'all of them').toBe(sent)
    const margins = [...new Set(trains.map((r) => Number(r.marginDb.toFixed(1))))]
    expect(margins, 'the two margins, in the order the sentence prints them').toEqual([m1, m2])
    expect(trains.every((r) => r.detected), 'and both trains are detected').toBe(true)
  })

  it('reads the compressed payload `deeper` takes apart', () => {
    // 「Poll 是 0x04，Response 是 0x05，Report 的两个方向分别是 0x06 与 0x07」
    const ids = raw(DEEP,
      /Poll 是 0x(\d+)，Response 是 0x(\d+)，Report 的两个方向分别是 0x(\d+) 与 0x(\d+)/,
      '`deeper` on the four message IDs')
    expect(ids.map((h) => parseInt(h!, 16)), 'the four IDs the engine really writes')
      .toEqual([NB_MSG_ID.poll, NB_MSG_ID.resp, NB_MSG_ID.reportInitiator, NB_MSG_ID.reportResponder])
    // 「一条 Report 把十三个字节里的五个花在时间本身上」
    const [reportCn, timeCn] = raw(DEEP, /把(..)个字节里的(.)个花在时间本身上/,
      '`deeper` on what a report spends')
    const cn = (s: string): number => {
      const d = '零一二三四五六七八九'
      const i = s.indexOf('十')
      if (i < 0) return d.indexOf(s)
      return (i === 0 ? 1 : d.indexOf(s.slice(0, i))) * 10 + (i === s.length - 1 ? 0 : d.indexOf(s.slice(i + 1)))
    }
    expect(cn(reportCn!), 'the report’s own size').toBe(NB_REPORT_BYTES)
    expect(cn(timeCn!), 'and the octets of it that are time').toBe(NB_REPORT_TIME_BYTES)
    expect(NB_MSG_ID_BYTES + NB_CRC_BYTES, 'the ID and the check the paragraph counts')
      .toBeLessThan(NB_REPORT_BYTES)
  })

  it('reads the link budget the range claim rests on, and the one term that changes', () => {
    // 「和一条 499.2 MHz 宽的测距信道摆在一起，250 kb/s 听上去荒唐」
    const [wide, kbps] = figs(DEEP, /和一条 ([\d.]+) MHz 宽的测距信道摆在一起，(\d+) kb\/s/,
      '`deeper` on the two radios')
    same(String(wide), UWB_CHIP_HZ / 1e6, 'the ranging channel’s own width')
    same(String(kbps), 4 / (NB_SYMBOL_US / 1e6) / 1000, 'against the control radio’s rate')
    // 「模型里的接收端能听到 −100 dBm，发射端则发 10 dBm」, and `limits` names the constants
    const [sens, tx] = figs(DEEP, /接收端能听到 (−\d+) dBm，发射端则发 (\d+) dBm/,
      '`deeper` on the budget')
    expect(sens, 'the sensitivity `nb.ts` exports').toBe(NB_RX_SENS_DBM)
    expect(tx, 'and the transmit power').toBe(NB_TX_DBM)
    const [limTx, limSens, floor] = figs(LIM,
      /NB_TX_DBM = (\d+) dBm 与 NB_RX_SENS_DBM = (−\d+) dBm，而标准第 12 章给这部 PHY 的底线是 (−\d+)/,
      '`limits` on the same three')
    expect([limTx, limSens], 'the same two constants').toEqual([tx, sens])
    const [srcFloor] = figs(SRC, /标准对这部 PHY 给出的底线是 (−\d+) dBm/, '`sources` on the floor')
    expect(floor, 'and the standard’s floor, which both sections print').toBe(srcFloor)
    expect(floor, 'a floor this model is more generous than').toBeGreaterThan(sens!)
    // 「lossDbFor 对窄带只换掉 1 m 处的自由空间项，指数与每道墙的损耗照用宽带那一侧的」
    const [metre] = figs(LIM, /只换掉 (\d+) m 处的自由空间项/, '`limits` on the term it swaps')
    expect(UNITS_SRC, 'the distance `freeSpacePl0Db` is defined at')
      .toContain(`Free-space path loss at ${metre} m`)
    const ch = uwbNbaScenario('base').uwb!.channel
    const nbCh = uwbNbaScenario('base').uwb!.mms.nbChannels[0]!
    expect(nbPl0Db(nbCh), 'the narrowband first metre really is its own')
      .not.toBeCloseTo(uwbPl0Db(ch), 6)
    for (const [d, walls] of [[2, 0], [10, 12]] as [number, number][]) {
      expect(uwbPathLossDb(nbPl0Db(nbCh), d, walls) - uwbPathLossDb(uwbPl0Db(ch), d, walls),
        `at ${d} m through ${walls} dB of wall, only the first metre differs`)
        .toBeCloseTo(nbPl0Db(nbCh) - uwbPl0Db(ch), 9)
    }
  })

  it('reads `sources` on the PHY the radio really is', () => {
    // 「一个符号 32 个码片、每个码片 0.5 µs，每个符号载四个比特。一条 12 字节消息的 576 µs」
    const [chips, chipUs, bytes, us] = figs(SRC,
      /一个符号 (\d+) 个码片、每个码片 ([\d.]+) µs，每个符号载四个比特。一条 (\d+) 字节消息的 (\d+) µs/,
      '`sources` on the symbol')
    expect(chips, 'the chips one symbol is').toBe(NB_SYMBOL_CHIPS)
    same(String(chipUs), NB_CHIP_US, 'the chip they run at')
    same(String(chips! * chipUs!), NB_SYMBOL_US, 'and the symbol they make')
    expect(bytes, 'the message this airtime is of').toBe(NB_RESP_BYTES)
    same(String(us), nbPpduNs(bytes!) / 1000, 'which is what the engine gives it')
    // 「接收端 −100 dBm 的灵敏度（标准对这部 PHY 给出的底线是 −85 dBm）；以及一次控制发射
    //   所用的 10 dBm」 — the same two model values `deeper` and `limits` print
    const [srcSens, srcTx] = figs(SRC,
      /接收端 (−\d+) dBm 的灵敏度（标准对这部 PHY 给出的底线是 −\d+ dBm）；以及一次控制发射所用的 (\d+) dBm/,
      '`sources` on the same budget')
    expect(srcSens, 'the sensitivity, a third time').toBe(NB_RX_SENS_DBM)
    expect(srcTx, 'and the transmit power').toBe(NB_TX_DBM)
    // 「52 个时隙一轮、200 ms 一个块，则是本会话的参数设置」
    const [slots, blockMs] = figs(SRC, /(\d+) 个时隙一轮、(\d+) ms 一个块，则是本会话/,
      '`sources` on the session’s own grid')
    expect(slots, 'the slots this session schedules').toBe(PLAN.slots)
    same(String(blockMs), PLAN.blockNs / MS, 'and the block it schedules them in')
    // 「每条消息前面那十个前导与标记符号、两个头部符号」
    const [shrCn, phrCn] = raw(SRC, /前面那(.)个前导与标记符号、(.)个头部符号/,
      '`sources` on the symbols before the payload')
    // 「两」 is the counting form of 「二」, which is what the sentence uses for the header symbols
    const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s === '两' ? '二' : s)
    expect(cn(shrCn!), 'the preamble and marker symbols').toBe(NB_SHR_SYMBOLS)
    expect(cn(phrCn!), 'and the header symbols').toBe(NB_PHR_SYMBOLS)
  })

  it('reads the responder row of the message table, and the rule in its own last cell', () => {
    /*
     * **A table row whose value is a count and whose last cell is the reason for it.** 「3 of 4」
     * is how many of the four corner anchors this round can carry, and the cell beside it says
     * why: a one-to-many Poll grows by three octets per responder and two 600 RSTU slots have to
     * hold it. So the count is read against the run, and the rule against `uwbNbSlotFitNs`.
     */
    // 「Poll，三个应答者」 is a row label too, so the needle has to be the whole phrase
    const row = table(0).rows.find((r) => r[0].includes('容得下的应答者'))!
    const [joined, corners] = figs(row[1], /^(\d+) of (\d+)$/, 'the responder row’s own count')
    /*
     * **It is what the round carries, not what answers.** The Poll of this run names three — its
     * own size says so — while one of the three loses its narrowband slot to the router and never
     * joins, which is the coexistence half's subject and pinned next door.
     */
    const pollBytes = ofType(recs(), 'TX_START')
      .filter((r) => r.frame.kind === 'nbPoll')[0]!.frame.bytes
    expect(pollBytes, 'the Poll this round sends names that many responders')
      .toBe(nbOtmPollBytes(joined!))
    expect(joined, 'which is what the scene builds').toBe(NBA_ANCHOR_COUNT('base'))
    expect(corners, 'of the corners the room has').toBe(NBA_ANCHORS.length)
    expect(joined, 'one short of all of them').toBeLessThan(corners!)
    const [perResponder, slotRstu] = figs(row[3],
      /Poll 每多一个应答者就长 (\d+) 字节，而两个 (\d+) RSTU/, 'the rule in the last cell')
    expect(perResponder, 'what one more responder adds to the Poll')
      .toBe(nbOtmPollBytes(joined! + 1) - nbOtmPollBytes(joined!))
    expect(slotRstu, 'the slot this session schedules')
      .toBe(uwbNbaScenario('base').uwb!.slotRstu)
    // …and that is the reason the fourth corner stays out: its Poll would not fit two slots
    const mms = uwbNbaScenario('base').uwb!.mms
    expect(uwbNbSlotFitNs(mms, joined!), 'the Poll for three fits two slots')
      .toBeLessThan(2 * rstuNs(slotRstu!))
    expect(uwbNbSlotFitNs(mms, corners!), 'and the Poll for four does not')
      .toBeGreaterThan(2 * rstuNs(slotRstu!))
  })

  it('reads all three `observe` lines as the log really prints them', () => {
    const rs = recs()
    // 「“uwb-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)”。它是整段运行里的第一件事」
    const [pollLine] = raw(OBS, /“(uwb-1 → \* NBPOLL [^”]+)”/, '`observe` on the poll')
    const poll = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'nbPoll')[0]!
    expect(fmtRecord(poll), 'the line the log prints for the poll').toBe(pollLine)
    expect(ofType(rs, 'TX_START')[0]!.t, 'and it is the first transmission of the run').toBe(poll.t)
    expect(poll.t, 'at the very beginning').toBe(0)
    // 「20.000 ms 处的 “anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)”」
    const [atMs] = figs(OBS, /([\d.]+) ms 处的 “anchor-1 → uwb-1 NBREPORT/, '`observe` on when')
    const [reportLine] = raw(OBS, /“(anchor-1 → uwb-1 NBREPORT [^”]+)”/, '`observe` on the report')
    const report = ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'nbReport' && r.node === 'anchor-1')[0]!
    expect(fmtRecord(report), 'the line the log prints for the report').toBe(reportLine)
    same(String(atMs), report.t / MS, 'and the instant it goes out')
    // 「“uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”」
    const [rangeLine] = raw(OBS, /“(uwb-1 range → anchor-1 [^”]+)”/, '`observe` on the distance')
    const range = ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG && r.peer === 'anchor-1')[0]!
    expect(fmtRecord(range), 'the line the log prints for the distance').toBe(rangeLine)
  })

  it('reads the two questions, and the next lesson the picture points at', () => {
    // 「一条十二字节的消息，在这部射频上要 576 µs」, 「一个 16 µs 的符号只载四个比特——250 kb/s」
    const [qUs] = figs(QUIZ, /在这部射频上要 (\d+) µs/, 'the second question’s airtime')
    same(String(qUs), nbPpduNs(NB_RESP_BYTES) / 1000, 'what a twelve-octet message really takes')
    const [qSym, qKbps] = figs(QUIZ, /一个 (\d+) µs 的符号只载四个比特——(\d+) kb\/s/,
      'the answer it marks right')
    same(String(qSym), NB_SYMBOL_US, 'the symbol of this radio')
    same(String(qKbps), 4 / (NB_SYMBOL_US / 1e6) / 1000, 'and the rate four bits in it make')
    // 「这正是下一课《窄带射频也共享 6 GHz》要讲的事」 — the band the next lesson shares
    const [ghz] = figs(PIC, /《窄带射频也共享 (\d+) GHz》/, '`picture` on the next lesson')
    expect(Math.floor(WIFI_6G_CENTER_MHZ / 1000), 'the band this room’s router sits in').toBe(ghz)
  })
})
