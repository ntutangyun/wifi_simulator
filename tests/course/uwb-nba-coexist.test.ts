/**
 * Every empirical claim in "The narrowband radio shares 6 GHz too", the second half of
 * the old `uwb-nba`: the listen-before-talk threshold, what one busy check costs, the
 * four ways of placing a control channel, and the price the Wi-Fi link pays when the
 * rule is switched off.
 *
 * It loads exactly the scene `uwb-nba` loads — the same builder, the same three
 * variants — so the split costs the reader nothing and the recorded hashes of the two
 * ids are equal, which the kit's `sameSceneAs` check asserts here and the controller's
 * fixtures record once the id is registered. The scenario builder and its four scenes
 * are pinned next door, in tests/course/uwb-nba.test.ts (describe "uwb-nba · the
 * scene"), which is where the builder lives.
 *
 * The channel plan, the threshold and the two path-loss laws come from the engine's
 * own exports rather than being re-typed here, and every measured figure — busy
 * checks, skipped blocks, distances, fixes, lost narrowband messages, the Wi-Fi side's
 * failed receptions and its throughput — is read out of a run over the 1.3 s window.
 */
import { describe, it, expect } from 'vitest'
import { uwbNbaCoexist } from '../../src/course/uwb/uwb-nba-coexist'
import {
  LAPTOP_POS, NBA_ANCHORS, NBA_CHANNELS, ROUTER_POS, TAG_POS, TAG_Z, WIFI_6G_CENTER_MHZ,
  uwbNba, uwbNbaScenario,
} from '../../src/course/uwb/uwb-nba'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { LESSON_6G_WIDTH_MHZ, oneRoom } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { applyRecord, initViewState } from '../../src/model/view'
import { uwbLbtText, uwbNbChannelText } from '../../src/uwb/ui/rows'
import {
  NB_CHANNELS, NB_CHANNEL_MHZ, NB_DEFAULT_CHANNELS, NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ,
  NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, NB_RX_SENS_DBM,
  NB_TX_DBM, nbBand, nbCenterMhz, nbChannelForBlock, nbLbtRequired, nbPl0Db, nbPpduNs,
} from '../../src/uwb/nb'
import { bandOverlapMhz, uwbToWifiPathLossDb, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import { CCA_ED_DBM } from '../../src/engine/phy'
import { UWB_PL_EXP, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven whole blocks, as next door: the lesson's "1.3 seconds". */
const RUN_NS = 1300 * MS
const SEC = RUN_NS / 1e9
const BLOCKS = 7
const TAG = 'uwb-1'
const ANCHORS = NBA_ANCHORS.map((a) => a.id)
const UWB_IDS = new Set([...ANCHORS, TAG])
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
/** The scenario's seed, which `nbChannelForBlock` hops over the block index. */
const SEED = 7
/** Indices into `uwbNbaCoexist.variants` — the same three scenes `uwb-nba` carries. */
const V_OUT = 0
const V_HOP = 1
const V_NOLBT = 2

// The contract every migrated lesson owes, plus the split rule: uwb-nba-coexist loads
// uwb-nba's own scene, so its recorded timeline hashes are uwb-nba's, value for value.
lessonShapeSuite(uwbNbaCoexist, { proseMax: 1210, sameSceneAs: 'uwb-nba' })

const recs = (variant?: number): TLRecord[] => runOf(uwbNbaCoexist, variant, RUN_NS)

/** The same Wi-Fi, with the ranging session and its nodes removed — the reference the
 * Wi-Fi-side numbers are read against. */
let noSession: TLRecord[] | undefined
const noSessionRecs = (): TLRecord[] => {
  if (noSession === undefined) {
    const { uwb: _s, ...bare } = uwbNbaScenario('base')
    const alone: Scenario = { ...bare, nodes: bare.nodes.filter((n) => n.kind !== 'uwb') }
    expect(alone.uwb).toBeUndefined()
    expect(() => ScenarioSchema.parse(alone)).not.toThrow()
    noSession = [...new Simulation(alone).runUntil(RUN_NS).records]
  }
  return noSession
}

const lbt = (v?: number) => ofType(recs(v), 'UWB_NB_LBT')
const ranges = (v?: number) => ofType(recs(v), 'UWB_RANGE')
const tagRanges = (v?: number) => ranges(v).filter((r) => r.node === TAG)
const fixes = (v?: number) => ofType(recs(v), 'UWB_POSITION')
/** The distinct ranging blocks this node lost to a busy check. */
const skippedBlocks = (v: number | undefined, node: string): number[] =>
  [...new Set(lbt(v).filter((l) => l.node === node).map((l) => l.block))]

/** Every narrowband transmission of the run, with the window it occupied the air for. */
const nbFrames = (v?: number) =>
  ofType(recs(v), 'TX_START').filter((r) => NB_KINDS.has(r.frame.kind))

/**
 * Times a Wi-Fi radio's clear-channel assessment went busy on **energy alone** while a
 * narrowband message was on the air and the radio was not itself starting to transmit.
 * `CCA_BUSY` carries only a cause, and 'energy' also covers a radio's own transmission,
 * so both filters are needed; the "Outside the router's channel" run, where no mediator
 * exists at all, is the control that says the count is really the narrowband radio's.
 */
const nbDeferrals = (v?: number) => {
  const wins = nbFrames(v).map((f) => [f.t, f.t + f.frame.txTimeNs] as const)
  const ownTx = new Set(ofType(recs(v), 'TX_START').map((r) => `${r.node}@${r.t}`))
  return ofType(recs(v), 'CCA_BUSY').filter((c) => c.cause === 'energy' && !UWB_IDS.has(c.node)
    && !ownTx.has(`${c.node}@${c.t}`) && wins.some(([a, b]) => c.t >= a && c.t <= b))
}

/** Wi-Fi receptions that failed to decode — the Wi-Fi side's own losses. */
const wifiRxFail = (rs: TLRecord[]) => ofType(rs, 'RX_FAIL').filter((r) => !UWB_IDS.has(r.node))
/** Narrowband messages a UWB device lost to a Wi-Fi burst, with the kind that was lost. */
const nbLosses = (v?: number) =>
  ofType(recs(v), 'RX_FAIL').filter((r) => UWB_IDS.has(r.node)).map((r) => ({
    rx: r,
    kind: ofType(recs(v), 'TX_START').find((t) => t.node === r.from && t.t <= r.t
      && t.t + t.frame.txTimeNs + 1000 >= r.t)!.frame.kind,
  }))

/** Goodput in Mb/s, MSDU sizes taken from the engine's own ENQUEUE records. */
function mbps(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const bytes = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.node === node).map((r) => [r.msduId, r.bytes]))
  let bits = 0
  for (const r of ofType(rs, 'DEQUEUE')) {
    if (r.node === node && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
  }
  return bits / SEC / 1e6
}

/** In-band level (dBm) a Wi-Fi transmitter of `eirpDbm` over `widthMhz` puts into one
 * 2.5 MHz narrowband channel `dM` away, under the Wi-Fi link's own law. */
const wifiInNbDbm = (eirpDbm: number, widthMhz: number, dM: number): number =>
  eirpDbm + 10 * Math.log10(NB_CHANNEL_MHZ / widthMhz) - wifiToUwbPathLossDb(dM, 0)

/** The distance at which `f` crosses `targetDbm` — a bisection, not a transcription. */
const crossingM = (f: (d: number) => number, targetDbm: number): number => {
  let lo = 0.1
  let hi = 1000
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) >= targetDbm) lo = mid
    else hi = mid
  }
  return lo
}

const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const TAG_3D = { x: TAG_POS.x, y: TAG_POS.y, z: TAG_Z }

/** Everything a learner reads of this lesson, joined — `deeper` and `sources` included. */
const prose = (): string => lessonStrings(uwbNbaCoexist).map((s) => s).join('\n')

/** The lesson's nth table of `numbers`, rows kept in place so a cell can be read by position. */
const table = (n: number): Extract<Block, { kind: 'table' }> =>
  uwbNbaCoexist.numbers!.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
const thresholdFormula = (): Extract<Block, { kind: 'formula' }> =>
  uwbNbaCoexist.numbers!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
const reachFormula = (): Extract<Block, { kind: 'formula' }> =>
  uwbNbaCoexist.deeper!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!

describe('uwb-nba-coexist · the lesson', () => {
  it('is the second half of module 15, needing its own first half and the coexistence lesson', () => {
    expect(uwbNbaCoexist.id).toBe('uwb-nba-coexist')
    expect(uwbNbaCoexist.module).toBe(15)
    expect(MODULES[uwbNbaCoexist.module].tier).toBe(6)
    expect(uwbNbaCoexist.needs).toEqual(['uwb-nba', 'uwb-coexist'])
    for (const id of uwbNbaCoexist.needs!) expect(COURSE_ORDER, id).toContain(id)
    expect(uwbNbaCoexist.terms!.map((t) => t.term)).toEqual(['LBT', 'threshold', 'allow list', 'hop'])
  })

  it('loads uwb-nba’s scene and its three variants, labels and all', () => {
    expect(uwbNbaCoexist.scenario()).toEqual(uwbNba.scenario())
    expect(uwbNbaCoexist.variants!.map((v) => v.label))
      .toEqual(uwbNba.variants!.map((v) => v.label))
    expect(uwbNbaCoexist.variants!.map((v) => v.scenario()))
      .toEqual(uwbNba.variants!.map((v) => v.scenario()))
    expect(NBA_CHANNELS.hop).toEqual([100, 150, 200, 210])
  })

  it('offers three jumps, all of them in the base run, and the watch points at the first', () => {
    expect(uwbNbaCoexist.jumps).toHaveLength(3)
    const rs = recs()
    const idx = uwbNbaCoexist.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(rs[idx[0]].t).toBe(2 * MS) // the busy check that ends the block
    expect(rs[idx[1]].t).toBe(0) // the one poll that did get out
    const watch = uwbNbaCoexist.picture!.find((b) => b.kind === 'watch') as Extract<Block, { kind: 'watch' }>
    expect(watch.jump).toBe(0)
  })
})

describe('uwb-nba-coexist · the threshold and the channel it applies to', () => {
  it('"−75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm", and the 9 µs assessment', () => {
    expect(NB_LBT_EDT_DBM_PER_MHZ).toBe(-75)
    expect(NB_CHANNEL_MHZ).toBe(2.5)
    expect(NB_LBT_CCA_US).toBe(9)
    expect(NB_LBT_THRESHOLD_DBM).toBeCloseTo(-75 + 10 * Math.log10(2.5), 12)
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    expect(thresholdFormula().text).toContain('threshold = −75 dBm/MHz + 10·log10(2.5 MHz) = −71.02 dBm')
    expect(thresholdFormula().note!).toContain('at least 9 µs')
    // every busy record the run emits carries that same threshold
    for (const l of lbt()) expect(l.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
  })

  it('"a couple of hundred narrow channels", and the router’s channel holds dozens', () => {
    expect(NB_CHANNELS).toBe(250)
    expect(nbCenterMhz(0)).toBe(5726.25)
    expect(nbCenterMhz(49)).toBe(5848.75)
    expect(nbCenterMhz(50)).toBe(5926.25)
    expect(nbCenterMhz(249)).toBe(6423.75)
    expect(20 / NB_CHANNEL_MHZ).toBe(8)
    const lo = WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2
    const hi = WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2
    const inside: number[] = []
    for (let n = 0; n < NB_CHANNELS; n++) {
      const b = nbBand(n)
      if (b.lo >= lo && b.hi <= hi) inside.push(n)
    }
    expect(inside).toHaveLength(32)
    expect([inside[0], inside[inside.length - 1]]).toEqual([186, 217])
    expect(inside).toContain(200)
    expect(inside).toContain(210)
    for (const s of ['250 channels of 2.5 MHz: 50 in UNII-3 from 5726.25 MHz up, and 200 in UNII-5',
      'One 20 MHz Wi-Fi channel covers eight of them',
      'wholly contains thirty-two, numbers 186 to 217']) {
      expect(prose(), s).toContain(s)
    }
    expect(prose()).toContain('a single Wi-Fi channel can hold dozens of them at once')
  })

  it('the four channels the lesson names, and which of them lie inside 6265–6345 MHz', () => {
    const lo = WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2
    const hi = WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2
    expect([100, 150, 200, 210].map((n) => nbCenterMhz(n))).toEqual([6051.25, 6176.25, 6301.25, 6326.25])
    expect([100, 150, 200, 210].map((n) => bandOverlapMhz(nbBand(n).lo, nbBand(n).hi, lo, hi) > 0))
      .toEqual([false, false, true, true])
    // "212.5 MHz of empty spectrum between its upper edge and the router’s lower one"
    expect(lo - nbBand(100).hi).toBe(212.5)
    expect(prose()).toContain('212.5 MHz of empty spectrum between its upper edge and the router’s lower one')
    expect(prose()).toContain('6326.25 MHz is inside too')
    expect([cell(1, 0, 1), cell(1, 1, 1), cell(1, 2, 1), cell(1, 3, 1)])
      .toEqual(['200 · 6301.25 MHz', '100 · 6051.25 MHz', '100 / 150 / 200 / 210', '200 · 6301.25 MHz'])
    // and the run agrees: every message of the base scene names channel 200 at 6301.25 MHz
    for (const f of nbFrames()) {
      expect(f.frame.uwb?.nb?.channel).toBe(200)
      expect(f.frame.uwb?.nb?.centerMhz).toBe(6301.25)
    }
  })

  it('"the allow list a session ships with by default is [3] — 5733.75 MHz, in UNII-3"', () => {
    expect(NB_DEFAULT_CHANNELS).toEqual([3])
    expect(nbCenterMhz(3)).toBe(5733.75)
    expect(nbCenterMhz(3)).toBeLessThan(5850)
    // "where listening first is optional" — and, on channel 200, it is not
    expect(nbLbtRequired(3, 'auto')).toBe(false)
    expect(nbLbtRequired(200, 'auto')).toBe(true)
    expect(nbLbtRequired(200, 'off')).toBe(false)
    expect(prose()).toContain('[3] — 5733.75 MHz, in UNII-3')
    expect(prose()).toContain('where listening first is optional')
  })

  it('"20 + 10·log10(2.5 / 80) = 4.95 dBm … d = 8.62 m" — arithmetic, labelled as such', () => {
    const inBand = 20 + 10 * Math.log10(NB_CHANNEL_MHZ / LESSON_6G_WIDTH_MHZ)
    expect(inBand.toFixed(2)).toBe('4.95')
    const d = crossingM((m) => wifiInNbDbm(20, LESSON_6G_WIDTH_MHZ, m), NB_LBT_THRESHOLD_DBM)
    expect(d.toFixed(2)).toBe('8.62')
    expect(reachFormula().text).toContain('20 + 10·log10(2.5 / 80) = 4.95 dBm')
    expect(reachFormula().text).toContain('4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m')
    expect(reachFormula().note!).toContain('Arithmetic, not a measurement')
    // the Wi-Fi law the lesson prints is the engine's own
    expect(wifiToUwbPathLossDb(1, 0)).toBeCloseTo(46.7 + 1.2, 12)
    expect(wifiToUwbPathLossDb(10, 0) - wifiToUwbPathLossDb(1, 0)).toBeCloseTo(30, 12)
    expect(dist3(TAG_3D, ROUTER_POS)).toBeLessThan(8.62)
  })
})

describe('uwb-nba-coexist · what the phone hears while it listens', () => {
  it('−48.23 / −42.21 / −63.72 dBm, and how far over the threshold each one is', () => {
    const dRouter = dist3(TAG_3D, ROUTER_POS)
    const dLaptop = dist3(TAG_3D, { x: LAPTOP_POS.x, y: LAPTOP_POS.y, z: 1.0 })
    expect(wifiInNbDbm(20, 80, dRouter).toFixed(2)).toBe('-48.23')
    expect(wifiInNbDbm(20, 20, dRouter).toFixed(2)).toBe('-42.21')
    expect(wifiInNbDbm(15, 80, dLaptop).toFixed(2)).toBe('-63.72')
    expect((wifiInNbDbm(20, 80, dRouter) - NB_LBT_THRESHOLD_DBM).toFixed(1)).toBe('22.8')
    expect((wifiInNbDbm(20, 20, dRouter) - NB_LBT_THRESHOLD_DBM).toFixed(1)).toBe('28.8')
    expect((wifiInNbDbm(15, 80, dLaptop) - NB_LBT_THRESHOLD_DBM).toFixed(1)).toBe('7.3')
    expect([cell(0, 0, 1), cell(0, 0, 2)]).toEqual(['−48.23 dBm', '22.8 dB over'])
    expect([cell(0, 1, 1), cell(0, 1, 2)]).toEqual(['−42.21 dBm', '28.8 dB over'])
    expect([cell(0, 2, 1), cell(0, 2, 2)]).toEqual(['−63.72 dBm', '7.3 dB over'])
    expect(cell(0, 0, 0)).toContain('1.50 m')
    expect(cell(0, 2, 0)).toContain('3.35 m')
    // and the phone's own busy checks read exactly the laptop's 80 MHz burst
    const tagChecks = lbt().filter((l) => l.node === TAG)
    expect(tagChecks.length).toBeGreaterThan(0)
    for (const l of tagChecks) expect(l.foreignDbm.toFixed(2)).toBe('-63.72')
    expect(prose()).toContain('Every one of the phone’s seven busy checks reads −63.72 dBm')
  })
})

describe('uwb-nba-coexist · the base scene, inside the router’s channel', () => {
  it('"Seven blocks, seven checks, seven skipped" — and two anchors in block 3', () => {
    expect(lbt()).toHaveLength(9)
    expect(skippedBlocks(undefined, TAG)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(lbt().filter((l) => l.node === TAG)).toHaveLength(BLOCKS)
    expect(skippedBlocks(undefined, 'anchor-1')).toEqual([])
    expect(skippedBlocks(undefined, 'anchor-2')).toEqual([0, 4])
    expect(skippedBlocks(undefined, 'anchor-3')).toEqual([])
    expect(cell(1, 0, 2)).toBe('7 of 7')
    expect(prose()).toContain('Seven blocks, seven checks, seven skipped')
    expect(prose()).toContain('one anchor loses two blocks to checks of its own as well')
  })

  it('"Two blocks in seven get anything out: four distances, and no position"', () => {
    expect(tagRanges()).toHaveLength(4)
    expect(ranges()).toHaveLength(4)
    expect(fixes()).toHaveLength(0)
    const r = tagRanges()[0]
    expect([r.peer, r.block, r.method]).toEqual(['anchor-1', 0, 'ss'])
    // two of the seven blocks, two ranges each: never the three one fix needs
    expect([...new Set(tagRanges().map((x) => x.block))]).toEqual([0, 4])
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(21)
    expect([cell(1, 0, 3), cell(1, 0, 4)]).toEqual(['4', '0'])
    expect(prose()).toContain('Two blocks in seven get anything out')
    // Review I3: the quiz questions were re-based too, so pin their text, not only the answers
    expect(uwbNbaCoexist.quiz[0].q).toContain('four distances in seven blocks')
    expect(uwbNbaCoexist.quiz[1].q).toContain('21 distances instead of four')
    expect(uwbNbaCoexist.quiz[0].explain).toContain('never a fix’s three')
    for (const s of [uwbNbaCoexist.quiz[0].q, uwbNbaCoexist.quiz[1].q, uwbNbaCoexist.quiz[0].explain]) {
      expect(s, s).not.toContain('one distance')
      expect(s, s).not.toContain('只量出一个距离')
    }
    expect(prose()).toContain('Four distances between them, and still no position, because a position needs three in one block')
    expect(uwbNbaCoexist.observe[2]).toContain('21 timeouts')
  })

  it('the busy check, the line it prints, and the silence the anchors then report', () => {
    // the run's first busy check is an anchor's, in its response window; the phone's own
    // comes at its report slot, 21 ms in
    const busy = lbt().find((l) => l.node === TAG)!
    expect(busy.t).toBe(21 * MS)
    expect(busy.block).toBe(0)
    expect(lbt()[0].t).toBe(2 * MS)
    expect(fmtRecord(lbt()[0])).toBe('anchor-2 NB LBT busy on ch 200: -69.6 dBm ≥ -71.0 — skipping the block')
    expect(fmtRecord(busy)).toBe('uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block')
    expect(uwbNbaCoexist.observe[0])
      .toContain('“uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 — skipping the block”')
    expect(uwbNbaCoexist.observe[0]).toContain('At 21.000 ms')
    // "the block's later rounds still run on the grid — the anchors turn up and wait"
    const to = ofType(recs(), 'UWB_TIMEOUT')
    expect(fmtRecord(to.find((r) => r.t === 22 * MS && r.node === 'anchor-1')!)).toBe('anchor-1 UWB slot 42: no nb-report from uwb-1')
    expect(fmtRecord(to.find((r) => r.t === 201 * MS && r.node === 'anchor-1')!)).toBe('anchor-1 UWB slot 0: no nb-poll from uwb-1')
    expect(uwbNbaCoexist.observe[1]).toContain('“anchor-1 UWB slot 42: no nb-report from uwb-1”')
    expect(uwbNbaCoexist.observe[1]).toContain('“anchor-1 UWB slot 0: no nb-poll from uwb-1”')
    const block0 = ofType(recs(), 'UWB_ROUND').filter((r) => r.block === 0)
    // one one-to-many round a block now, where the pair round had one per anchor
    expect(block0.map((r) => r.round)).toEqual([0])
    expect(nbFrames().filter((f) => f.frame.uwb!.block === 0 && f.frame.uwb!.round! > 0)).toHaveLength(0)
    expect(nbFrames()).toHaveLength(10)
  })

  it('the phone’s inspector: "200 · 6301.25 MHz" and "7 busy · 7 blocks skipped", EN and ZH', () => {
    const vs = initViewState(uwbNbaScenario('base'))
    for (const r of recs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    expect(uwbNbChannelText(u, STRINGS.en.uwb)).toBe('200 · 6301.25 MHz')
    expect(uwbNbChannelText(u, STRINGS.zh.uwb)).toBe('200 · 6301.25 MHz')
    expect(u.mms.lbtBusy).toBe(7)
    expect(u.mms.skippedBlocks).toBe(7)
    expect(uwbLbtText(u, STRINGS.en.uwb)).toBe('7 busy · 7 blocks skipped')
    expect(uwbLbtText(u, STRINGS.zh.uwb)).toBe('7 次忙 · 跳过 7 个块')
    expect(STRINGS.en.uwb.lbtBusy).toBe('listen before talk')
    expect(STRINGS.zh.uwb.lbtBusy).toBe('先听后发')
    expect(uwbNbaCoexist.observe[2]).toContain('“200 · 6301.25 MHz”')
    expect(uwbNbaCoexist.observe[2]).toContain('“7 busy · 7 blocks skipped”')
    expect(uwbNbaCoexist.observe[2]).toContain('“7 次忙 · 跳过 7 个块”')
    // "Its fragment rows are untouched" — the wide radio never fails here
    for (const t of Object.values(u.mms.trains)) {
      expect(`${t.heard} / ${t.fragments}`).toBe('8 / 8')
      expect(t.detected).toBe(true)
    }
  })
})

describe('uwb-nba-coexist · the other three placements', () => {
  it('outside the router’s channel: "not one busy check, 28 distances, a fix in every block"', () => {
    expect(lbt(V_OUT)).toHaveLength(0)
    expect(tagRanges(V_OUT)).toHaveLength(BLOCKS * ANCHORS.length)
    expect(tagRanges(V_OUT)).toHaveLength(28)
    expect(fixes(V_OUT)).toHaveLength(BLOCKS)
    for (const f of fixes(V_OUT)) expect(f.anchors).toHaveLength(4)
    expect(ofType(recs(V_OUT), 'UWB_TIMEOUT')).toHaveLength(0)
    expect([cell(1, 1, 2), cell(1, 1, 3), cell(1, 1, 4)]).toEqual(['0', '28', '7'])
    expect(uwbNbaCoexist.tryThis[0]).toContain('not one busy check, 28 distances, a fix in every block')
  })

  it('"a Wi-Fi side identical to a run with no ranging session": 407.215 Mb/s, not one failure', () => {
    expect(mbps(recs(V_OUT), 'laptop#6g').toFixed(3)).toBe('407.215')
    expect(mbps(noSessionRecs(), 'laptop#6g').toFixed(3)).toBe('407.215')
    expect(wifiRxFail(recs(V_OUT))).toHaveLength(0)
    expect(wifiRxFail(noSessionRecs())).toHaveLength(0)
    expect(nbDeferrals(V_OUT)).toHaveLength(0)
    // and it is a whole-record identity, not just a throughput one
    const wifiSide = (rs: TLRecord[]): string => JSON.stringify(
      rs.filter((r) => !UWB_IDS.has((r as { node?: string }).node ?? '')).map((r) => ({ ...r, seq: 0 })),
    )
    expect(wifiSide(recs(V_OUT))).toBe(wifiSide(noSessionRecs()))
    expect(uwbNbaCoexist.tryThis[0]).toContain('a Wi-Fi side identical to a run with no ranging session')
    expect(prose()).toContain('from 407.215 Mb/s to 362.631')
  })

  it('the hop map, replayed from nbChannelForBlock and read off the messages', () => {
    const replay = [0, 1, 2, 3, 4, 5, 6].map((b) => nbChannelForBlock(NBA_CHANNELS.hop, SEED, b))
    expect(replay).toEqual([100, 210, 200, 150, 100, 210, 200])
    expect(uwbNbaCoexist.variants![V_HOP].scenario().seed).toBe(SEED)
    const used = new Map<number, number>()
    for (const f of nbFrames(V_HOP)) used.set(f.frame.uwb!.block!, f.frame.uwb!.nb!.channel)
    for (const l of lbt(V_HOP)) used.set(l.block, l.channel)
    expect([...used.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect([0, 1, 2, 3, 4, 5, 6].map((b) => used.get(b))).toEqual(replay)
    expect(prose()).toContain('gives 100, 210, 200, 150, 100, 210, 200 over the seven blocks')
  })

  it('"Blocks 0, 3 and 4 land outside and run in full; 1, 2, 5 and 6 … are skipped"', () => {
    expect(skippedBlocks(V_HOP, TAG)).toEqual([1, 2, 5, 6])
    expect(lbt(V_HOP)).toHaveLength(4)
    for (const l of lbt(V_HOP)) expect(l.node).toBe(TAG)
    expect(fixes(V_HOP).map((f) => f.block)).toEqual([0, 3, 4])
    expect(tagRanges(V_HOP)).toHaveLength(13)
    const perBlock: Record<number, number> = {}
    for (const r of tagRanges(V_HOP)) perBlock[r.block] = (perBlock[r.block] ?? 0) + 1
    expect(perBlock).toEqual({ 0: 4, 3: 4, 4: 4, 5: 1 })
    expect([cell(1, 2, 2), cell(1, 2, 3), cell(1, 2, 4)]).toEqual(['4 of 7', '13', '3'])
    expect(prose()).toContain('though block 5 gets one distance out before its report slot is stopped')
    expect(prose()).toContain('Three fixes instead of seven')
    expect(uwbNbaCoexist.tryThis[0]).toContain('three blocks clear, three fixes')
    // the picture's claim that a block is all or nothing
    expect(prose()).toContain('a block is either whole or gone')
  })

  it('with the rule off: "21 distances, 5 fixes", and no busy check at all', () => {
    expect(lbt(V_NOLBT)).toHaveLength(0)
    expect(tagRanges(V_NOLBT)).toHaveLength(21)
    expect(fixes(V_NOLBT)).toHaveLength(5)
    expect(fixes(V_NOLBT).map((f) => f.block)).toEqual([1, 2, 3, 4, 5])
    expect(nbFrames(V_NOLBT)).toHaveLength(108)
    expect([cell(1, 3, 2), cell(1, 3, 3), cell(1, 3, 4)]).toEqual(['0', '21', '5'])
    expect(uwbNbaCoexist.tryThis[0]).toContain('21 distances, 5 fixes')
    expect(uwbNbaCoexist.quiz[1].q).toContain('the session gets 21 distances instead of four')
  })
})

describe('uwb-nba-coexist · what the narrowband radio costs Wi-Fi', () => {
  it('"10 dBm … reaches Wi-Fi’s energy-detect threshold 15.07 m away"', () => {
    expect(NB_TX_DBM).toBe(10)
    expect(CCA_ED_DBM).toBe(-62)
    expect(nbPl0Db(200).toFixed(2)).toBe('48.44')
    const radius = crossingM((d) => NB_TX_DBM - nbPl0Db(200) - 20 * Math.log10(d), CCA_ED_DBM)
    expect(radius.toFixed(2)).toBe('15.07')
    expect(radius).toBeGreaterThan(oneRoom().rooms[0].w) // "longer than this room"
    expect(prose()).toContain('reaches Wi-Fi’s energy-detect threshold 15.07 m away')
    expect(uwbNbaCoexist.quiz[1].explain).toContain('reaches the threshold 15.07 m out')
  })

  it('"a ranging frame’s −14 dBm, spread over 499.2 MHz, only trips … within about 40 cm"', () => {
    const inBand = UWB_TX_POWER_DBM + 10 * Math.log10(LESSON_6G_WIDTH_MHZ / 499.2)
    const radius = crossingM((d) => inBand - uwbToWifiPathLossDb(d, 0, 5), CCA_ED_DBM)
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(UWB_PL_EXP).toBe(2)
    expect(radius).toBeGreaterThan(0.35)
    expect(radius).toBeLessThan(0.45)
    expect(prose()).toContain('only trips the same threshold within about 40 cm')
  })

  it('"ten of them reach the air and six Wi-Fi frames fail behind them; … 108 messages and 87 failures"', () => {
    expect(nbFrames()).toHaveLength(10)
    expect(wifiRxFail(recs())).toHaveLength(6)
    expect(nbFrames(V_NOLBT)).toHaveLength(108)
    expect(wifiRxFail(recs(V_NOLBT))).toHaveLength(87)
    // every one of the base run's five failures happened while a narrowband message was on the air
    const wins = nbFrames().map((f) => [f.t, f.t + f.frame.txTimeNs] as const)
    for (const f of wifiRxFail(recs())) {
      expect(wins.some(([a, b]) => f.t >= a && f.t <= b), String(f.t)).toBe(true)
    }
    expect(prose()).toContain('ten of them reach the air and six Wi-Fi frames fail behind them')
    expect(prose()).toContain('with it off, 108 messages and 87 failures')
  })

  it('"407.215 Mb/s to 362.631, which is 44.58 Mb/s gone, or 10.95 %"', () => {
    const with_ = mbps(recs(V_NOLBT), 'laptop#6g')
    const without = mbps(recs(V_OUT), 'laptop#6g')
    expect(with_.toFixed(3)).toBe('362.631')
    expect(without.toFixed(3)).toBe('407.215')
    // the subtraction and the division the lesson used to gesture at, both written out
    expect((without - with_).toFixed(2)).toBe('44.58')
    expect(((without - with_) / without * 100).toFixed(2)).toBe('10.95')
    expect(prose()).toContain('which is 44.58 Mb/s gone, or 10.95 % of what it had')
    expect(uwbNbaCoexist.quiz[1].options[uwbNbaCoexist.quiz[1].answer])
      .toBe('87 failed frames and 10.95 % of the laptop’s throughput: 362.631 Mb/s against 407.215')
  })

  it('"44 in 1.3 seconds with the rule off … Not 108 twice over"', () => {
    expect(nbDeferrals(V_NOLBT)).toHaveLength(44)
    const byNode: Record<string, number> = {}
    for (const c of nbDeferrals(V_NOLBT)) byNode[c.node] = (byNode[c.node] ?? 0) + 1
    expect(byNode).toEqual({ 'ap#6g': 23, 'laptop#6g': 21 })
    expect(nbDeferrals(V_OUT)).toHaveLength(0)
    expect(nbDeferrals()).toHaveLength(7)
    expect(nbDeferrals(V_HOP)).toHaveLength(1)
    expect(prose()).toContain('44 in 1.3 seconds with the rule off, against none in the scene where the control channel sits outside')
    expect(prose()).toContain('Not 108 twice over')
    // the duration the model's single reading says nothing about
    expect(nbPpduNs(NB_POLL_BYTES) / 1000).toBe(576)
    expect(nbPpduNs(NB_RESP_BYTES) / 1000).toBe(576)
    expect(nbPpduNs(NB_REPORT_BYTES) / 1000).toBe(608)
    expect(prose()).toContain('says nothing about the 576 µs that follow')
  })

  it('"seven narrowband messages die at the phone — five reports and two responses"', () => {
    const lost = nbLosses(V_NOLBT)
    expect(lost).toHaveLength(7)
    for (const l of lost) {
      expect(l.rx.node).toBe(TAG)
      expect(l.rx.reason).toBe('lowSinr')
      expect(NB_KINDS.has(l.kind), l.kind).toBe(true)
    }
    expect(lost.filter((l) => l.kind === 'nbReport')).toHaveLength(5)
    expect(lost.filter((l) => l.kind === 'nbResp')).toHaveLength(2)
    const interfered = ofType(recs(V_NOLBT), 'UWB_INTERFERED')
    expect(interfered).toHaveLength(7)
    for (const i of interfered) {
      expect(i.node).toBe(TAG)
      expect(ANCHORS).toContain(i.from)
      expect(i.foreignDbm.toFixed(2)).toBe('-42.21')
      expect(i.sirDb).toBeLessThan(0)
    }
    expect(interfered[0].foreignDbm.toFixed(2))
      .toBe(wifiInNbDbm(20, 20, dist3(TAG_3D, ROUTER_POS)).toFixed(2))
    expect(fmtRecord(interfered[0]))
      .toBe('uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)')
    expect(prose()).toContain('“uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign -42.2 dBm)”')
    // a control message has no margin to spend: foreign power at its own level is enough
    expect(NB_RX_SENS_DBM).toBe(-100)
    expect(prose()).toContain('its receiver bottoms out at −100 dBm')
  })
})

describe('uwb-nba-coexist · the provenance is in sources and nowhere else', () => {
  it('names the regulation, the contributions and the model’s own reconstructions', () => {
    const src = uwbNbaCoexist.sources!.map((s) => s).join('\n')
    expect(src).toContain('ETSI EN 303 687')
    expect(src).toContain('−75 dBm/MHz')
    expect(src).toContain('9 µs')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('D5.0')
    expect(src).toContain('15-22/0381r5')
    expect(src).toContain('15-23/0100r2')
    expect(src).toContain('The balloted draft may differ')
    expect(src).toContain('the channel-centre formula is reconstructed from the published channel counts and band edges')
    expect(src).toContain('AES-128-CTR')
    expect(src).toContain('one instantaneous power reading stands in for the 9 µs assessment')
    const zh = uwbNbaCoexist.sources!.map((s) => s).join('\n')
    expect(zh).toContain('P802.15.4ab')
    expect(zh).toContain('15-22/0381r5')
    expect(zh).toContain('AES-128-CTR')
  })
})

/**
 * The procedure the lesson closes on: one busy check, in the order `nbClear`
 * (src/uwb/device.mms.ts) runs it, and the same check in figures under it. The arithmetic the
 * lesson used to gesture at — the threshold, the reading, the comparison and what the whole
 * thing costs the laptop — is written out step by step, and every figure is read back out of
 * `nb.ts` or out of the run.
 */
describe('uwb-nba-coexist \u00b7 one busy check, step by step', () => {
  const steps = (): string[] => {
    const b = uwbNbaCoexist.numbers!
      .filter((x): x is Extract<Block, { kind: 'steps' }> => x.kind === 'steps')
    expect(b).toHaveLength(1)
    return b[0].items.map((i) => i)
  }
  /** The worked example under the procedure — the lesson's third table. */
  const worked = (row: number): string => cell(2, row, 1)

  it('closes the numbers: six steps, then the seven-row worked example', () => {
    expect(steps()).toHaveLength(6)
    expect(uwbNbaCoexist.numbers!.at(-1)).toBe(table(2))
    expect(uwbNbaCoexist.numbers!.at(-2)!.kind).toBe('steps')
    expect(table(2).rows).toHaveLength(7)
  })

  it('leaves no pointer phrase where the arithmetic used to be gestured at', () => {
    for (const s of lessonStrings(uwbNbaCoexist)) {
      expect(s, s.slice(0, 50)).not.toContain('\u8fd9\u7b14\u8d26')
      expect(s, s.slice(0, 50)).not.toContain('\u90a3\u7b14\u8d26')
      expect(s, s.slice(0, 50)).not.toMatch(/head arithmetic/)
    }
  })

  it('step 1 — the upper band obliges the device to listen, the lower one does not', () => {
    expect(steps()[0]).toContain('whether this channel obliges it to listen at all')
    expect(steps()[0]).toContain('in the upper of the two bands it must, in the lower one it need not')
    expect(worked(0)).toBe('200 \u00b7 6301.25 MHz')
    expect(nbCenterMhz(200)).toBe(6301.25)
    expect(nbLbtRequired(200, 'auto')).toBe(true)
    // the session default sits in the lower band, where listening first is optional
    expect(nbLbtRequired(NB_DEFAULT_CHANNELS[0], 'auto')).toBe(false)
  })

  it('step 2 — it reads the power in that channel\u2019s 2.5 MHz, one reading for the window', () => {
    expect(steps()[1]).toContain('reads the power already sitting in that channel\u2019s 2.5 MHz')
    expect(steps()[1]).toContain('one instantaneous reading, standing in for the assessment window')
    expect(NB_CHANNEL_MHZ).toBe(2.5)
    const band = nbBand(200)
    expect(band.hi - band.lo).toBeCloseTo(NB_CHANNEL_MHZ, 9)
    expect(NB_LBT_CCA_US).toBe(9)
    expect(prose()).toContain('assessed for at least 9 \u00b5s before each transmission')
  })

  it('step 3 — the per-megahertz limit spread over the channel is \u221271.02 dBm', () => {
    expect(steps()[2]).toContain('the limit written per megahertz spread over the channel\u2019s own width')
    expect(steps()[2]).toContain('Below it the message goes out; at it or above, the channel counts as busy')
    expect(worked(1)).toBe('\u221275 dBm/MHz + 10\u00b7log10(2.5) = \u221271.02 dBm')
    expect(NB_LBT_EDT_DBM_PER_MHZ).toBe(-75)
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    expect((NB_LBT_EDT_DBM_PER_MHZ + 10 * Math.log10(NB_CHANNEL_MHZ)).toFixed(2)).toBe('-71.02')
  })

  it('step 4 — a busy reading is not a back-off: the whole block goes silent', () => {
    expect(steps()[3]).toContain('A busy reading is not a back-off')
    expect(steps()[3]).toContain('marks the whole ranging block and sends no narrowband message at all for the rest of it')
    expect(worked(2)).toBe('\u221263.72 dBm')
    expect(worked(3)).toBe('\u221263.72 \u2265 \u221271.02 dBm')
    const rs = recs()
    const lbts = ofType(rs, 'UWB_NB_LBT').filter((r) => r.node === TAG)
    expect(lbts.length).toBeGreaterThan(0)
    for (const l of lbts) {
      expect(l.foreignDbm.toFixed(2)).toBe('-63.72')
      expect(l.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
      expect(l.foreignDbm).toBeGreaterThanOrEqual(l.thresholdDbm)
    }
    // after a busy check the phone sends nothing more of its own in that block
    const first = lbts[0]
    const after = ofType(rs, 'TX_START').filter((r) =>
      r.node === TAG && NB_KINDS.has(r.frame.kind) && r.t > first.t && r.t < (first.block + 1) * 200 * MS)
    expect(after).toEqual([])
  })

  it('step 5 — with no Poll there is no round: the anchors wait and time out', () => {
    expect(steps()[4]).toContain('With no Poll there is no round')
    expect(steps()[4]).toContain('wait, and time out, and the block ends with nothing measured')
    expect(worked(4)).toBe('7')
    expect(worked(5)).toBe('4 \u00b7 0')
    const rs = recs()
    expect(ofType(rs, 'UWB_NB_LBT').filter((r) => r.node === TAG)).toHaveLength(BLOCKS)
    expect(ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(4)
    expect(ofType(rs, 'UWB_POSITION')).toEqual([])
    expect(ofType(rs, 'UWB_TIMEOUT').length).toBeGreaterThan(0)
  })

  it('step 6 — the next block draws again, which is all that hopping buys', () => {
    expect(steps()[5]).toContain('draws its channel from the allow list again')
    expect(steps()[5]).toContain('gets back exactly the share of blocks the draw puts somewhere quiet')
    const list = NBA_CHANNELS.hop
    const drawn = Array.from({ length: BLOCKS }, (_, b) => nbChannelForBlock(list, SEED, b))
    expect(drawn).toEqual([100, 210, 200, 150, 100, 210, 200])
    // the share that lands clear of the router is the share of blocks that run, and no more
    const clear = drawn.filter((c) => c === 100 || c === 150).length
    expect(clear).toBe(3)
    expect(ofType(recs(V_HOP), 'UWB_POSITION')).toHaveLength(clear)
  })

  it('the last row of the worked example is the bill the lesson used to point at', () => {
    expect(worked(6)).toBe('407.215 \u2192 362.631 Mb/s \u00b7 \u221244.58 \u00b7 10.95 %')
    expect(prose()).toContain('which is 44.58 Mb/s gone, or 10.95 % of what it had')
  })
})
