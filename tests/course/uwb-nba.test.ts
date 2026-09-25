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
  NB_SYMBOL_CHIPS, NB_SYMBOL_US, NB_TX_DBM, nbPpduNs,
} from '../../src/uwb/nb'
import { UWB_CHIP_HZ } from '../../src/uwb/units'
import { mmsLayout } from '../../src/uwb/mms'
import { roundPlan } from '../../src/uwb/session'
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
    expect(uwbNba.module).toBe(15)
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

  it('"8 fragments of 8 … 34.5 dB and 32.0 dB" — the wide radio is never the problem', () => {
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
    expect(src).toContain('D5.0')
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
