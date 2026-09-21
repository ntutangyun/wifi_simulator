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
  WIFI_6G_CENTER_MHZ, uwbNba, uwbNbaScenario, type UwbNbaVariant,
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

// The contract every migrated lesson owes. The window is what `lessonBudget` reports —
// `npx tsx scripts/lesson-dump.ts uwb-nba en` prints it — and the kit enforces it.
lessonShapeSuite(uwbNba, { proseMax: 850 })

const recs = (variant?: number): TLRecord[] => runOf(uwbNba, variant, RUN_NS)
const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const TAG_3D = { x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z }

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbNba).map((s) => s.en).join('\n')

/** The lesson's nth table of `numbers`, rows kept in place so a cell can be read by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbNba.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col].en
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
    expect(uwbNba.terms!.map((t) => t.term)).toEqual(['narrowband', 'NB', 'Poll', 'Response', 'Report'])
    // the picture promises the log's own prefix, which the observations then quote
    expect(prose()).toContain('the log marks everything of its own with NB')
    expect(uwbNba.observe[0].en).toContain('NBPOLL')
  })

  it('the scenario and its three variants pass the scenario schema, labels unchanged', () => {
    expect(() => ScenarioSchema.parse(uwbNba.scenario())).not.toThrow()
    expect(uwbNba.variants).toHaveLength(3)
    for (const v of uwbNba.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(uwbNba.variants!.map((v) => v.label.en))
      .toEqual(['Outside the router’s channel', 'Hop over four channels', 'No LBT'])
    expect(uwbNba.variants!.map((v) => v.label.zh))
      .toEqual(['避开路由器的信道', '在四个信道间跳变', '不先听后发'])
  })

  it('offers four jumps, and they occur in the base run in the order the list gives them', () => {
    expect(uwbNba.jumps).toHaveLength(4)
    const rs = recs()
    const idx = uwbNba.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    // the poll opens the round at 0, the anchor judges the tag's train in the slot after its
    // last fragment, the report lands in slot 24, and the distance follows it
    expect(rs[idx[0]].t).toBe(0)
    expect(rs[idx[1]].t).toBe(9.5 * MS)
    expect(rs[idx[2]].t).toBe(12 * MS)
    expect(rs[idx[3]].t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 16)
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

  it('places four corner anchors at 2.20 m and the tag 1.50 m from the router', () => {
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'laptop', ...ANCHORS, TAG])
    for (const a of NBA_ANCHORS) {
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
    expect(uwbNba.observe[2].en).toContain('true 4.76 m')
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
    expect(u.mms).toEqual({ ...DEFAULT_UWB_SESSION.mms, nbChannels: [200], nbLbt: 'auto', report: 'bi' })
    expect(u.mms.rsfs).toBe(8)
    expect(uwbNbaScenario('outside').uwb!.mms).toEqual({ ...u.mms, nbChannels: [100] })
    expect(uwbNbaScenario('hop').uwb!.mms).toEqual({ ...u.mms, nbChannels: [100, 150, 200, 210] })
    expect(uwbNbaScenario('noLbt').uwb!.mms).toEqual({ ...u.mms, nbLbt: 'off' })
    expect(NBA_CHANNELS).toEqual({ base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200] })
    for (const v of ['base', 'outside', 'hop', 'noLbt'] as UwbNbaVariant[]) {
      expect(JSON.stringify(uwbNbaScenario(v).nodes), v).toBe(JSON.stringify(sc.nodes))
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
    expect([cell(0, 0, 0), cell(0, 0, 1), cell(0, 0, 2)]).toEqual(['Poll', '12 B', '576.0 µs'])
    expect([cell(0, 1, 0), cell(0, 1, 1), cell(0, 1, 2)]).toEqual(['Response', '12 B', '576.0 µs'])
    expect([cell(0, 2, 0), cell(0, 2, 1), cell(0, 2, 2)]).toEqual(['Report', '13 B', '608.0 µs'])
    // "the reply time, five octets of it"
    expect(NB_REPORT_TIME_BYTES).toBe(5)
    expect(cell(0, 2, 3)).toContain('five octets')
  })

  it('"(10 + 2 + 2 × octets) symbols × 16 µs" is the engine’s own airtime', () => {
    expect(NB_SHR_SYMBOLS).toBe(10)
    expect(NB_PHR_SYMBOLS).toBe(2)
    expect(NB_SYMBOL_US).toBe(16)
    expect(nbPpduNs(12)).toBe((10 + 2 + 2 * 12) * 16 * 1000)
    expect((10 + 2 + 2 * 12)).toBe(36)
    expect((10 + 2 + 2 * 13)).toBe(38)
    expect(formula().text.en).toContain('(10 + 2 + 2 × octets) symbols × 16 µs')
    expect(formula().text.en).toContain('12 octets → 36 × 16 = 576 µs')
    expect(formula().text.en).toContain('13 octets → 38 × 16 = 608 µs')
    // "Four bits ride on each symbol and a symbol lasts 16 µs, which is 250 kb/s"
    expect(NB_SYMBOL_CHIPS * NB_CHIP_US).toBe(NB_SYMBOL_US)
    expect(4 / (NB_SYMBOL_US / 1000)).toBe(250) // 4 bits per 16 µs symbol, in kb/s
    expect(formula().note!.en).toContain('a symbol lasts 16 µs, which is 250 kb/s')
    expect(formula().note!.en).toContain('twelve symbols of header')
    expect(NB_SHR_SYMBOLS + NB_PHR_SYMBOLS).toBe(12)
  })

  it('"a poll and a response together hold the air for 1.152 ms", longer than any fragment', () => {
    expect((2 * nbPpduNs(NB_POLL_BYTES) / MS).toFixed(3)).toBe('1.152')
    const fragments = ofType(recs(V_OUT), 'TX_START').filter((r) => r.frame.kind === 'uwbRsf')
    expect(fragments.length).toBeGreaterThan(0)
    for (const f of fragments) expect(f.frame.txTimeNs).toBeLessThan(nbPpduNs(NB_POLL_BYTES))
    expect(prose()).toContain('hold the air for 1.152 ms')
    expect(prose()).toContain('any single fragment of the train they set up is shorter than either of them')
  })
})

describe('uwb-nba · one block, message by message', () => {
  const at = (t: number, pred: (r: TLRecord) => boolean): TLRecord =>
    recs().find((r) => r.t === t && pred(r))!
  const txKind = (k: string) => (r: TLRecord): boolean => r.type === 'TX_START' && r.frame.kind === k

  it('"the poll leaves at zero, the response answers at 1.000 ms"', () => {
    expect(fmtRecord(at(0, txKind('nbPoll')))).toBe('uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)')
    expect(at(1 * MS, txKind('nbResp'))).toBeDefined()
    expect(uwbNba.observe[0].en).toContain('“uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”')
    // "It is the first thing in the whole run — no ranging frame has been sent yet"
    expect(ofType(recs(), 'TX_START')[0].frame.kind).toBe('nbPoll')
    expect(prose()).toContain('the poll leaves at zero, the response answers at 1.000 ms')
  })

  it('"the anchor’s report goes out at 12.000 ms, and the distance appears 608 µs behind it"', () => {
    expect(fmtRecord(at(12 * MS, txKind('nbReport'))))
      .toBe('anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)')
    expect(uwbNba.observe[1].en)
      .toContain('“anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)” at 12.000 ms')
    const r = ofType(recs(), 'UWB_RANGE')[0]
    expect(r.node).toBe(TAG)
    expect(r.t).toBe(12 * MS + nbPpduNs(NB_REPORT_BYTES) + 16)
    expect((r.t / MS).toFixed(3)).toBe('12.608')
    expect(fmtRecord(r)).toBe('uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)')
    expect(uwbNba.observe[2].en)
      .toContain('“uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”')
    expect(prose()).toContain('the distance appears 608 µs behind it, at 12.608 ms')
  })
})

describe('uwb-nba · the grid underneath and the train on top', () => {
  it('"a round is 28 slots of 500 µs, so 14 ms", four to a block, seven blocks in 1.3 s', () => {
    const plan = roundPlan(uwbNbaScenario('base').uwb!, ANCHORS.length)
    expect(plan.slots).toBe(28)
    expect(plan.roundNs).toBe(14 * MS)
    expect(plan.roundNs / plan.slots).toBe(0.5 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    // four anchors, one round each: the last of block 6 ends at 1.256 s, inside the window
    expect(6 * plan.blockNs + ANCHORS.length * plan.roundNs).toBeLessThan(RUN_NS)
    expect(7 * plan.blockNs).toBeGreaterThan(RUN_NS)
    const rounds = ofType(recs(V_OUT), 'UWB_ROUND')
    expect(rounds).toHaveLength(BLOCKS * ANCHORS.length)
    expect([...new Set(rounds.map((r) => r.block))]).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const r of rounds) expect(r.mode).toBe('mms')
    expect(prose()).toContain('a round is 28 slots of 500 µs, so 14 ms, and a block holds four of them')
    expect(prose()).toContain('Seven whole blocks fit in the 1.3 seconds of this run')
  })

  it('"8 fragments of 8 … 34.5 dB and 32.0 dB" — the wide radio is never the problem', () => {
    const vs = initViewState(uwbNbaScenario('base'))
    for (const r of recs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    // Y = 0 in this session, so there is one fragment row per peer and no integrity row
    expect(Object.keys(u.mms.trains)).toEqual([uwbTrainKey('anchor-1', 'rsf'), uwbTrainKey('anchor-2', 'rsf')])
    for (const t of Object.values(u.mms.trains)) {
      expect(`${t.heard} / ${t.fragments}`).toBe('8 / 8')
      expect(t.detected).toBe(true)
    }
    expect(Object.values(u.mms.trains).map((t) => t.marginDb.toFixed(1))).toEqual(['34.5', '32.0'])
    const train = ofType(recs(), 'UWB_MMS_TRAIN')[0]
    expect([train.heard, train.fragments, train.detected]).toEqual([8, 8, true])
    expect(train.marginDb.toFixed(1)).toBe('34.5')
    expect(prose()).toContain('Both listening anchors hear 8 fragments of 8')
    expect(prose()).toContain('by 34.5 dB and 32.0 dB')
    expect(uwbNba.observe[2].en).toContain('every fragment was heard and detected')
  })

  it('the round really is four pair rounds, one per anchor, when nothing stops it', () => {
    const block0 = ofType(recs(V_OUT), 'UWB_ROUND').filter((r) => r.block === 0)
    expect(block0.map((r) => r.round)).toEqual([0, 1, 2, 3])
    expect(prose()).toContain('Four rounds like that fill a block, one for each anchor in the room')
    // and the experiment says so: the cycle runs to the end for every anchor
    expect(ofType(recs(V_OUT), 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(BLOCKS * 4)
    expect(uwbNba.tryThis[0].en).toContain('Outside the router’s channel')
  })
})

describe('uwb-nba · what the depth says', () => {
  it('the compressed payload: one message-ID octet, the fields, a two-octet check', () => {
    expect(NB_MSG_ID).toEqual({ poll: 0x04, resp: 0x05, reportInitiator: 0x06, reportResponder: 0x07 })
    expect(NB_MSG_ID_BYTES).toBe(1)
    expect(NB_CRC_BYTES).toBe(2)
    expect(NB_REPORT_BYTES - NB_POLL_BYTES).toBe(1) // the payload-length octet with no payload
    for (const s of ['0x04 for a poll, 0x05 for a response, 0x06 and 0x07', 'two-octet CRC',
      'five of its thirteen octets on the time itself']) {
      expect(prose(), s).toContain(s)
    }
  })

  it('"hears down to −100 dBm and the transmitter puts out 10 dBm", against 499.2 MHz of ranging', () => {
    expect(NB_RX_SENS_DBM).toBe(-100)
    expect(NB_TX_DBM).toBe(10)
    expect(UWB_CHIP_HZ / 1e6).toBe(499.2)
    expect(prose()).toContain('hears down to −100 dBm and the transmitter puts out 10 dBm')
    expect(prose()).toContain('a ranging channel 499.2 MHz wide')
  })

  it('the provenance is in sources and nowhere else', () => {
    const src = uwbNba.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024 Clause 12')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('D5.0')
    expect(src).toContain('15-22/0381r5')
    expect(src).toContain('15-23/0100r2')
    expect(src).toContain('The balloted draft may differ')
    expect(src).toContain('Model choices')
    // the standard's own sensitivity floor for this PHY, named as the model's departure
    expect(src).toContain('−85 dBm')
    const zh = uwbNba.sources!.map((s) => s.zh).join('\n')
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('15-22/0381r5')
    expect(zh).toContain('D5.0')
  })
})

describe('uwb-nba · the quiz is answerable from the main path', () => {
  it('names the radio that carries the reply time, and the 576 µs arithmetic', () => {
    expect(uwbNba.quiz).toHaveLength(2)
    for (const q of uwbNba.quiz) expect(q.options[q.answer]).toBeDefined()
    expect(uwbNba.quiz[0].options[uwbNba.quiz[0].answer].en)
      .toBe('The narrowband radio, in the Report that closes the round')
    expect(uwbNba.quiz[1].options[uwbNba.quiz[1].answer].en)
      .toContain('Four bits ride on a 16 µs symbol — 250 kb/s — and twelve header symbols go in front')
    // both answers are derivable from the numbers section alone
    expect(formula().note!.en).toContain('Four bits ride on each symbol')
    expect(cell(0, 2, 3)).toContain('reply time')
  })
})
