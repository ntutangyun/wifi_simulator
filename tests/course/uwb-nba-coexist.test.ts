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
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
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
import { pathLossDb } from '../../src/engine/propagation'
import { UWB_BAND_MHZ, UWB_PL_EXP, UWB_TX_POWER_DBM, uwbInBandDbm } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'

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
lessonShapeSuite(uwbNbaCoexist, { sameSceneAs: 'uwb-nba' })

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
    expect(MODULES[uwbNbaCoexist.module].title).toBe('窄带控制面')
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
  })

  it('the four channels the lesson names, and which of them lie inside 6265–6345 MHz', () => {
    const lo = WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2
    const hi = WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2
    expect([100, 150, 200, 210].map((n) => nbCenterMhz(n))).toEqual([6051.25, 6176.25, 6301.25, 6326.25])
    expect([100, 150, 200, 210].map((n) => bandOverlapMhz(nbBand(n).lo, nbBand(n).hi, lo, hi) > 0))
      .toEqual([false, false, true, true])
    // "212.5 MHz of empty spectrum between its upper edge and the router’s lower one"
    expect(lo - nbBand(100).hi).toBe(212.5)
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
  })

  it('"20 + 10·log10(2.5 / 80) = 4.95 dBm … d = 8.62 m" — arithmetic, labelled as such', () => {
    const inBand = 20 + 10 * Math.log10(NB_CHANNEL_MHZ / LESSON_6G_WIDTH_MHZ)
    expect(inBand.toFixed(2)).toBe('4.95')
    const d = crossingM((m) => wifiInNbDbm(20, LESSON_6G_WIDTH_MHZ, m), NB_LBT_THRESHOLD_DBM)
    expect(d.toFixed(2)).toBe('8.62')
    expect(reachFormula().text).toContain('20 + 10·log10(2.5 / 80) = 4.95 dBm')
    expect(reachFormula().text).toContain('4.95 − (46.7 + 30·log10 d + 1.2) = −71.02  →  d = 8.62 m')
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
    // Review I3: the quiz questions were re-based too, so pin their text, not only the answers
    for (const s of [uwbNbaCoexist.quiz[0].q, uwbNbaCoexist.quiz[1].q, uwbNbaCoexist.quiz[0].explain]) {
      expect(s, s).not.toContain('one distance')
      expect(s, s).not.toContain('只量出一个距离')
    }
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
    expect(uwbNbaCoexist.observe[0]).toContain('21.000')
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
    expect(uwbNbChannelText(u, STRINGS.uwb)).toBe('200 · 6301.25 MHz')
    expect(uwbNbChannelText(u, STRINGS.uwb)).toBe('200 · 6301.25 MHz')
    expect(u.mms.lbtBusy).toBe(7)
    expect(u.mms.skippedBlocks).toBe(7)
    expect(uwbLbtText(u, STRINGS.uwb)).toBe('7 次忙 · 跳过 7 个块')
    expect(uwbNbaCoexist.observe[2]).toContain('“200 · 6301.25 MHz”')
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
    // the picture's claim that a block is all or nothing
  })

  it('with the rule off: "21 distances, 5 fixes", and no busy check at all', () => {
    expect(lbt(V_NOLBT)).toHaveLength(0)
    expect(tagRanges(V_NOLBT)).toHaveLength(21)
    expect(fixes(V_NOLBT)).toHaveLength(5)
    expect(fixes(V_NOLBT).map((f) => f.block)).toEqual([1, 2, 3, 4, 5])
    expect(nbFrames(V_NOLBT)).toHaveLength(108)
    expect([cell(1, 3, 2), cell(1, 3, 3), cell(1, 3, 4)]).toEqual(['0', '21', '5'])
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
  })

  it('"a ranging frame’s −14 dBm, spread over 499.2 MHz, only trips … within about 40 cm"', () => {
    const inBand = UWB_TX_POWER_DBM + 10 * Math.log10(LESSON_6G_WIDTH_MHZ / 499.2)
    const radius = crossingM((d) => inBand - uwbToWifiPathLossDb(d, 0, 5), CCA_ED_DBM)
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(UWB_PL_EXP).toBe(2)
    expect(radius).toBeGreaterThan(0.35)
    expect(radius).toBeLessThan(0.45)
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
  })

  it('"407.215 Mb/s to 362.631, which is 44.58 Mb/s gone, or 10.95 %"', () => {
    const with_ = mbps(recs(V_NOLBT), 'laptop#6g')
    const without = mbps(recs(V_OUT), 'laptop#6g')
    expect(with_.toFixed(3)).toBe('362.631')
    expect(without.toFixed(3)).toBe('407.215')
    // the subtraction and the division the lesson used to gesture at, both written out
    expect((without - with_).toFixed(2)).toBe('44.58')
    expect(((without - with_) / without * 100).toFixed(2)).toBe('10.95')
  })

  it('"44 in 1.3 seconds with the rule off … Not 108 twice over"', () => {
    expect(nbDeferrals(V_NOLBT)).toHaveLength(44)
    const byNode: Record<string, number> = {}
    for (const c of nbDeferrals(V_NOLBT)) byNode[c.node] = (byNode[c.node] ?? 0) + 1
    expect(byNode).toEqual({ 'ap#6g': 23, 'laptop#6g': 21 })
    expect(nbDeferrals(V_OUT)).toHaveLength(0)
    expect(nbDeferrals()).toHaveLength(7)
    expect(nbDeferrals(V_HOP)).toHaveLength(1)
    // the duration the model's single reading says nothing about
    expect(nbPpduNs(NB_POLL_BYTES) / 1000).toBe(576)
    expect(nbPpduNs(NB_RESP_BYTES) / 1000).toBe(576)
    expect(nbPpduNs(NB_REPORT_BYTES) / 1000).toBe(608)
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
  })
})

describe('uwb-nba-coexist · the provenance is in sources and nowhere else', () => {
  it('names the regulation, the contributions and the model’s own reconstructions', () => {
    const src = uwbNbaCoexist.sources!.map((s) => s).join('\n')
    expect(src).toContain('ETSI EN 303 687')
    expect(src).toContain('−75 dBm/MHz')
    expect(src).toContain('9 µs')
    expect(src).toContain('P802.15.4ab')
    expect(src).toContain('草案')
    expect(src).toContain('15-22/0381r5')
    expect(src).toContain('15-23/0100r2')
    expect(src).toContain('AES-128-CTR')
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
    expect(worked(0)).toBe('200 \u00b7 6301.25 MHz')
    expect(nbCenterMhz(200)).toBe(6301.25)
    expect(nbLbtRequired(200, 'auto')).toBe(true)
    // the session default sits in the lower band, where listening first is optional
    expect(nbLbtRequired(NB_DEFAULT_CHANNELS[0], 'auto')).toBe(false)
  })

  it('step 2 — it reads the power in that channel\u2019s 2.5 MHz, one reading for the window', () => {
    expect(NB_CHANNEL_MHZ).toBe(2.5)
    const band = nbBand(200)
    expect(band.hi - band.lo).toBeCloseTo(NB_CHANNEL_MHZ, 9)
    expect(NB_LBT_CCA_US).toBe(9)
  })

  it('step 3 — the per-megahertz limit spread over the channel is \u221271.02 dBm', () => {
    expect(worked(1)).toBe('\u221275 dBm/MHz + 10\u00b7log10(2.5) = \u221271.02 dBm')
    expect(NB_LBT_EDT_DBM_PER_MHZ).toBe(-75)
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    expect((NB_LBT_EDT_DBM_PER_MHZ + 10 * Math.log10(NB_CHANNEL_MHZ)).toFixed(2)).toBe('-71.02')
  })

  it('step 4 — a busy reading is not a back-off: the whole block goes silent', () => {
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
    expect(worked(4)).toBe('7')
    expect(worked(5)).toBe('4 \u00b7 0')
    const rs = recs()
    expect(ofType(rs, 'UWB_NB_LBT').filter((r) => r.node === TAG)).toHaveLength(BLOCKS)
    expect(ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG)).toHaveLength(4)
    expect(ofType(rs, 'UWB_POSITION')).toEqual([])
    expect(ofType(rs, 'UWB_TIMEOUT').length).toBeGreaterThan(0)
  })

  it('step 6 — the next block draws again, which is all that hopping buys', () => {
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
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above pins the engine against a figure typed on *this* side of the file, so the
 * sweep of 2026-10-13 (`scripts/figure-planting.ts uwb-nba-coexist`) could move the last digit
 * of **109 of the lesson's 154** figures with the suite still green: an edited lesson and an
 * untouched assertion agree about nothing, and nobody notices.
 *
 * Nothing new is measured here. Every assertion calls the same `recs`, `lbt`, `tagRanges`,
 * `fixes`, `nbFrames`, `nbDeferrals`, `nbLosses`, `mbps`, `wifiInNbDbm` and `crossingM` the
 * tests above call — the figure is parsed **out of the lesson** instead of being written down
 * beside the measurement. Three rules the earlier slices paid for:
 *
 * - a family read matches by **shape**, never by value: `/(2\.5)/g` cannot see a planted 2.6,
 *   because the planted site simply drops out of the match set while the others still satisfy
 *   the count. So each of the eighteen printings of the channel width is read by the words
 *   around it;
 * - `same()` takes a **string read off the lesson** and compares at the precision that string
 *   was printed to, so a tolerance can never be coarser than the figure;
 * - where two figures of one sentence are only pinned together (`46.7 … + 1.2`), the sum is
 *   sensitive to either, so moving either digit still reddens the row.
 */
describe('uwb-nba-coexist · every figure the prose prints, read back out of it', () => {
  /** Every string of a section, in order — tables, formula notes and `steps` items included. */
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
  const NUMS = blockText(uwbNbaCoexist.numbers)
  const DEEP = blockText(uwbNbaCoexist.deeper)
  const LIMITS = blockText(uwbNbaCoexist.limits)
  const SRC = blockText(uwbNbaCoexist.sources)
  const OBS = blockText(uwbNbaCoexist.observe)
  const TRY = blockText(uwbNbaCoexist.tryThis)
  const QUIZ = blockText(uwbNbaCoexist.quiz)

  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`)
      .not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zh = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a numeral this test knows how to read`).not.toBeNull()
    return n!
  }

  const nodeOf = (id: string): NodeCfg => {
    const n = uwbNbaScenario('base').nodes.find((x) => x.id === id)
    expect(n, `the scene no longer carries a node called ${id}`).toBeDefined()
    return n!
  }
  const AP = nodeOf('ap')
  const LAPTOP = nodeOf('laptop')
  const D_ROUTER = dist3(TAG_3D, AP.pos)
  const D_LAPTOP = dist3(TAG_3D, LAPTOP.pos)
  const SIX_LO = WIFI_6G_CENTER_MHZ - LESSON_6G_WIDTH_MHZ / 2
  const SIX_HI = WIFI_6G_CENTER_MHZ + LESSON_6G_WIDTH_MHZ / 2
  const overlapsSix = (ch: number): boolean =>
    bandOverlapMhz(nbBand(ch).lo, nbBand(ch).hi, SIX_LO, SIX_HI) > 0
  const chansOf = (v: 'base' | 'outside' | 'hop' | 'noLbt'): number[] => {
    const list = uwbNbaScenario(v).uwb!.mms!.nbChannels
    expect(list, `the ${v} scene no longer ships an allow list`).toBeDefined()
    return [...list!]
  }

  it('the per-megahertz limit, the channel it spreads over, and the threshold that gives', () => {
    /*
     * The formula and the worked example print the same arithmetic twice, down to the
     * multiplier and the base of the logarithm, so both are read as five figures and the
     * arithmetic is done with the figures the lesson itself printed.
     */
    const chain = (s: string, re: RegExp, what: string): void => {
      const [perMhz, mult, base, width, total] = raw(s, re, what)
      expect(-val(perMhz!), `${what}: the limit the regulation sets`)
        .toBe(NB_LBT_EDT_DBM_PER_MHZ)
      same(width!, NB_CHANNEL_MHZ, `${what}: the width of one narrowband channel`)
      same(width!, nbBand(200).hi - nbBand(200).lo, `${what}: which is the channel’s own band`)
      same(total!, -NB_LBT_THRESHOLD_DBM, `${what}: the threshold those two give`)
      // the multiplier and the base of the logarithm, fed back
      const got = val(perMhz!) - val(mult!) * (Math.log(val(width!)) / Math.log(val(base!)))
      same(total!, got, `${what}: and it is the arithmetic the line writes out`)
    }
    chain(NUMS, /threshold = −(\d+) dBm\/MHz \+ (\d+)·log(\d+)\(([\d.]+) MHz\) = −([\d.]+) dBm/,
      'the formula')
    chain(NUMS, /−(\d+) dBm\/MHz \+ (\d+)·log(\d+)\(([\d.]+)\) = −([\d.]+) dBm/,
      'the worked example’s second row')
    // the threshold wherever else it is printed, each reading by the words around it
    for (const [text, re, what] of [
      [NUMS, /拿来比对的电平是 −([\d.]+) dBm/, 'the formula’s note'],
      [NUMS, /与 −([\d.]+) dBm 相比/, 'the heading of the levels table'],
      [NUMS, /−[\d.]+ ≥ −([\d.]+) dBm/, 'the comparison row of the worked example'],
      [DEEP, /= −([\d.]+) {2}→ {2}d =/, '`deeper`’s own equation'],
    ] as const) same(raw(text, re, what)[0]!, -NB_LBT_THRESHOLD_DBM, `${what}: the threshold`)
    // and every busy record of the run carries it
    for (const l of lbt()) expect(l.thresholdDbm, 'the threshold the device compared against')
      .toBe(NB_LBT_THRESHOLD_DBM)
    // the per-megahertz limit, again, where `sources` names the regulation it comes from
    same(raw(SRC, /来自法规：−(\d+) dBm\/MHz/, '`sources` on the limit')[0]!,
      -NB_LBT_EDT_DBM_PER_MHZ, 'the limit the regulation sets')
    // the evaluation time the regulation asks for, in all four places it is named
    for (const [text, re, what] of [
      [NUMS, /每次发射之前至少评估 (\d+) µs/, 'the formula’s note'],
      [SRC, /能量检测门限与至少 (\d+) µs 的评估时间/, '`sources`, naming the regulation'],
      [SRC, /草案要求至少评估 (\d+) µs/, '`sources`, listing the model values'],
      [LIMITS, /代替草案要求的至少 (\d+) µs/, '`limits`'],
    ] as const) same(raw(text, re, what)[0]!, NB_LBT_CCA_US, `${what}: the evaluation time`)
  })

  it('the channel width, in every one of the sentences that prints it', () => {
    // read by SHAPE: a `/(2\.5)/g` family read cannot see the one site a sweep planted
    for (const [text, re, what] of [
      [NUMS, /一个窄带信道宽 ([\d.]+) MHz/, 'the formula’s note'],
      [NUMS, /全挤在一个 ([\d.]+) MHz 的信道里/, 'the paragraph on the other direction'],
      [NUMS, /它就读一下这条信道那 ([\d.]+) MHz 里/, 'step 2'],
      [DEEP, /在自己带内任意 ([\d.]+) MHz 的一片里/, '`deeper`’s note on the radius'],
      [DEEP, /共有 \d+ 个 ([\d.]+) MHz 的信道/, '`deeper` on the whole plan'],
      [LIMITS, /向中介要一次该 ([\d.]+) MHz 频段内/, '`limits` on the single reading'],
      [LIMITS, /而真实的 ([\d.]+) MHz 发射带着裙边/, '`limits` on the flat rectangle'],
      [QUIZ, /([\d.]+) MHz 里的 \d+ dBm/, 'the second answer’s explanation'],
    ] as const) same(raw(text, re, what)[0]!, NB_CHANNEL_MHZ, `${what}: one narrowband channel`)
    // the two sentences that count channels per Wi-Fi channel, and the band of the title
    const [wifiW, holds] = raw(DEEP, /一条 (\d+) MHz 的 Wi-Fi 信道能盖住其中(.)个/,
      '`deeper` on what one 20 MHz channel holds')
    expect(val(wifiW!), 'the Wi-Fi channel width that holds that many narrowband ones')
      .toBe(zh(holds!) * NB_CHANNEL_MHZ)
    for (const [text, re, what] of [
      [uwbNbaCoexist.title, /共享 (\d) GHz/, 'the title'],
      [DEEP, /UNII-5——也就是 (\d) GHz Wi-Fi 频段/, '`deeper` naming the upper band'],
      [DEEP, /落在整个 (\d) GHz Wi-Fi 频段之下/, '`deeper` on where the default list sits'],
      [SRC, /log10 d，(\d) GHz 再加/, '`sources` on the Wi-Fi law'],
      [SRC, /能量检测门限与 (\d) GHz 的信道编号/, '`sources` on the model values'],
      [LIMITS, /场景里没有 (\d) GHz Wi-Fi 链路/, '`limits` on a scene with no mediator'],
    ] as const) {
      expect(val(raw(text, re, what)[0]!), `${what}: the band this lesson runs in`)
        .toBe(Math.floor(WIFI_6G_CENTER_MHZ / 1000))
    }
  })

  it('the three levels the phone hears, each with the distance and the margin beside it', () => {
    /*
     * `wifiInNbDbm` is not a transcription of the lesson: the engine's own reported foreign
     * power is checked against it above (`interfered[0].foreignDbm`), which is what licenses
     * using it for the two rows no record of this run happens to report.
     */
    const [burstW, burstD] = raw(cell(0, 0, 0), /路由器的 (\d+) MHz 猝发，相距 ([\d.]+) m/,
      'row 1 of the levels table')
    expect(val(burstW!), 'the width the router’s data PPDUs go out at').toBe(AP.caps.widthMhz)
    same(burstD!, D_ROUTER, 'and how far the phone is from it')
    const [laptopDbm, laptopD] = raw(cell(0, 2, 0), /以 (\d+) dBm 发射的笔记本，相距 ([\d.]+) m/,
      'row 3 of the levels table')
    expect(val(laptopDbm!), 'the power the scene gives the laptop').toBe(LAPTOP.txPowerDbm)
    same(laptopD!, D_LAPTOP, 'and how far the phone is from it')
    /*
     * Row 2's 20 MHz is the fallback width `channel.ts` gives a PPDU that carries none — an
     * ACK, a BlockAck, RTS/CTS — and no record prints it. It is recovered from the level the
     * engine itself reported for exactly that frame, by inverting the in-band share.
     */
    const [ctlW] = figs(cell(0, 1, 0), /路由器的 (\d+) MHz 控制帧/, 'row 2 of the levels table')
    const reported = ofType(recs(V_NOLBT), 'UWB_INTERFERED')[0]!.foreignDbm
    const share = reported - AP.txPowerDbm + wifiToUwbPathLossDb(D_ROUTER, 0)
    expect(Math.round(NB_CHANNEL_MHZ / 10 ** (share / 10)),
      'the width that reproduces the level the engine reported for that frame').toBe(ctlW)
    // the three levels, and how far over the threshold each one is
    const levels: [number, number, number][] = [
      [AP.txPowerDbm, AP.caps.widthMhz!, D_ROUTER],
      [AP.txPowerDbm, ctlW!, D_ROUTER],
      [LAPTOP.txPowerDbm, LAPTOP.caps.widthMhz!, D_LAPTOP],
    ]
    levels.forEach(([eirp, width, d], i) => {
      const dbm = wifiInNbDbm(eirp, width, d)
      same(raw(cell(0, i, 1), /−([\d.]+) dBm/, `row ${i + 1}: the level`)[0]!, -dbm,
        `row ${i + 1}: the level at the phone`)
      same(raw(cell(0, i, 2), /([\d.]+) dB over/, `row ${i + 1}: the margin`)[0]!,
        dbm - NB_LBT_THRESHOLD_DBM, `row ${i + 1}: how far over the threshold it is`)
    })
    // the laptop's level is the one the run really reads, in all four places it is printed
    const read = lbt().filter((l) => l.node === TAG)
    expect(read.length, 'the phone does check').toBeGreaterThan(0)
    for (const [text, re, what] of [
      [NUMS, /每一次读到的都是 −([\d.]+) dBm/, '`numbers` on the seven busy checks'],
      [NUMS, /−([\d.]+) ≥ −[\d.]+ dBm/, 'the comparison row of the worked example'],
      [QUIZ, /光是那台笔记本在手机处就有 −([\d.]+) dBm/, 'the first answer'],
      [QUIZ, /七次读到 −([\d.]+) dBm 的检测/, 'the first explanation'],
    ] as const) {
      const printed = raw(text, re, what)[0]!
      for (const l of read) same(printed, -l.foreignDbm, `${what}: what each check read`)
    }
    // "1.50 m from the router", wherever the lesson says it
    for (const [text, re, what] of [
      [DEEP, /手机离路由器 ([\d.]+) m，稳稳落在/, '`deeper`’s note on the radius'],
      [DEEP, /控制帧：它从 ([\d.]+) m 外飞来/, '`deeper` on the frames that come back'],
      [QUIZ, /手机离路由器只有 ([\d.]+) m/, 'the first question'],
    ] as const) same(raw(text, re, what)[0]!, D_ROUTER, `${what}: the distance to the router`)
    // and the margin the quiz credits the wide radio with
    const vs = initViewState(uwbNbaScenario('base'))
    for (const r of recs()) applyRecord(vs, r)
    const margins = Object.values(vs.nodes[TAG].uwb!.mms.trains).map((t) => t.marginDb)
    expect(margins.length, 'the phone did accumulate fragment trains').toBeGreaterThan(0)
    same(raw(QUIZ, /它的片段还高出接收门限 ([\d.]+) dB/, 'the first question')[0]!,
      Math.max(...margins), 'the best train’s margin over the receiver’s threshold')
  })

  it('the seven busy checks, the blocks they cost, and the anchor that paid too', () => {
    const tagChecks = lbt().filter((l) => l.node === TAG)
    const [howMany] = raw(NUMS, /手机那(.)次判忙/, '`numbers` on the phone’s busy checks')
    expect(zh(howMany!), 'the busy checks the phone makes').toBe(tagChecks.length)
    const [blocks, checks, skipped] = raw(NUMS, /(.)个块，(.)次检测，(.)个被跳过/,
      '`numbers` on what the rule costs')
    expect(zh(blocks!), 'the blocks this run holds').toBe(BLOCKS)
    expect(zh(checks!), 'the checks it makes').toBe(tagChecks.length)
    expect(zh(skipped!), 'and the blocks it loses').toBe(skippedBlocks(undefined, TAG).length)
    const [anchors, anchorChecks, anchorBlocks] = raw(NUMS,
      /还有(.)个锚点，也因自己的(.)次判忙赔掉(.)个块/, '`numbers` on the anchor that paid too')
    const others = [...new Set(lbt().filter((l) => l.node !== TAG).map((l) => l.node))]
    expect(others, 'the anchors that check at all').toHaveLength(zh(anchors!))
    expect(lbt().filter((l) => l.node === others[0]), 'the checks that one makes')
      .toHaveLength(zh(anchorChecks!))
    expect(skippedBlocks(undefined, others[0]!), 'and the blocks it loses by them')
      .toHaveLength(zh(anchorBlocks!))
    // "two of the seven blocks get anything out: four distances, and still no position"
    const [ofBlocks, got, dists, need] = raw(NUMS,
      /(.)个块里只有(.)个有所收获[\s\S]*?(.)个距离，却依然解不出定位，因为解一个定位要同一个块里的(.)个距离/,
      '`numbers` on the two blocks that got through')
    expect(zh(ofBlocks!), 'the blocks of the run').toBe(BLOCKS)
    const byBlock = new Map<number, number>()
    for (const r of tagRanges()) byBlock.set(r.block, (byBlock.get(r.block) ?? 0) + 1)
    expect(byBlock.size, 'the blocks that produced a range at all').toBe(zh(got!))
    expect(tagRanges(), 'the ranges they produced between them').toHaveLength(zh(dists!))
    expect(Math.max(...byBlock.values()), 'neither has what one fix needs')
      .toBeLessThan(zh(need!))
    expect(fixes(), 'so the run solves none').toHaveLength(0)
    // the quiz restates both halves
    const [quizBlocks, quizDists] = raw(QUIZ, /基础场景(.)个块里只拿到(.)个距离/, 'the first question')
    expect(zh(quizBlocks!), 'the blocks, again').toBe(BLOCKS)
    expect(zh(quizDists!), 'and the ranges').toBe(tagRanges().length)
    const [each, short] = raw(QUIZ, /各自也只给出(.)个距离，凑不齐解一次定位所需的(.)个/,
      'the first explanation')
    expect([...byBlock.values()], 'what each of the two blocks gave')
      .toEqual(Array.from(byBlock, () => zh(each!)))
    expect(zh(each!), 'which is short of what a fix needs').toBeLessThan(zh(short!))
  })

  it('the four placements table: the channel each ships, and what each one measures', () => {
    const scenes = ['base', 'outside', 'hop', 'noLbt'] as const
    const variants = [undefined, V_OUT, V_HOP, V_NOLBT]
    table(1).rows.forEach((_row, i) => {
      const chans = chansOf(scenes[i]!)
      const list = cell(1, i, 1)
      if (list.includes('/')) {
        expect(list.split(' / ').map(Number), `row ${i}: the allow list that scene ships`)
          .toEqual(chans)
      } else {
        const [no, centre] = raw(list, /(\d+) · ([\d.]+) MHz/, `row ${i}: the channel cell`)
        expect([val(no!)], `row ${i}: the channel that scene ships`).toEqual(chans)
        same(centre!, nbCenterMhz(val(no!)), `row ${i}: and the centre that number is`)
      }
      const skip = raw(cell(1, i, 2), /^(\d+)(?: of (\d+))?$/, `row ${i}: the skipped-blocks cell`)
      expect(val(skip[0]!), `row ${i}: the blocks the phone loses`)
        .toBe(skippedBlocks(variants[i], TAG).length)
      if (skip[1] !== undefined) {
        expect(val(skip[1]!), `row ${i}: out of that many blocks`).toBe(BLOCKS)
      }
      expect(val(cell(1, i, 3)), `row ${i}: the ranges the phone gets`)
        .toBe(tagRanges(variants[i]).length)
      expect(val(cell(1, i, 4)), `row ${i}: and the fixes it solves`)
        .toBe(fixes(variants[i]).length)
    })
    // the worked example's own two counts, and the last row's bill
    expect(val(cell(2, 4, 1)), 'the worked example on the blocks skipped')
      .toBe(skippedBlocks(undefined, TAG).length)
    const [d, f] = figs(cell(2, 5, 1), /(\d+) · (\d+)/, 'the worked example on the outcome')
    expect(d, 'the ranges this run gets').toBe(tagRanges().length)
    expect(f, 'and the fixes').toBe(fixes().length)
    // step 1's two bands: one asks the device to listen first, the other does not
    const [two] = raw(NUMS, /(.)个频段里，上面那个要求，下面那个不要求/, 'step 1')
    const bands = [...new Set(Array.from({ length: NB_CHANNELS }, (_n, n) => nbBand(n).lo < 5850))]
    expect(bands, 'the plan really falls into that many bands').toHaveLength(zh(two!))
    expect(nbLbtRequired(NB_CHANNELS - 1, 'auto'), 'and the upper one asks').toBe(true)
    expect(nbLbtRequired(0, 'auto'), 'while the lower one does not').toBe(false)
  })

  it('the bill the laptop pays, and the messages the rule lets through', () => {
    // "10 dBm in one 2.5 MHz channel still reaches Wi-Fi’s threshold 15.07 m away"
    const radius = crossingM((d) => NB_TX_DBM - nbPl0Db(200) - 20 * Math.log10(d), CCA_ED_DBM)
    for (const [text, re, what] of [
      [NUMS, /它那 (\d+) dBm 全挤在一个[\s\S]*?它在 ([\d.]+) m 外仍能达到/, '`numbers`'],
      [LIMITS, /所以「(\d+) dBm 到 ([\d.]+) m 处仍够得着门限」/, '`limits`'],
      [QUIZ, /里的 (\d+) dBm 到 ([\d.]+) m 处仍能达到门限/, 'the second explanation'],
    ] as const) {
      const [dbm, reach] = raw(text, re, `${what} on how far the narrowband radio reaches`)
      expect(val(dbm!), `${what}: the power nb.ts gives it`).toBe(NB_TX_DBM)
      same(reach!, radius, `${what}: and the distance it still reaches the threshold at`)
    }
    expect(radius, 'which is longer than the room itself').toBeGreaterThan(oneRoom().rooms[0]!.w)
    // the distractor that calls that power harmless names the same figure
    expect(val(raw(QUIZ, /没有可测的代价——(\d+) dBm 远低于/, 'the second question’s first option')[0]!),
      'the power the option is wrong about').toBe(NB_TX_DBM)
    // "ten reach the air and six Wi-Fi frames fail behind them; 108 messages and 87 failures"
    const [onAir, failed, offMsgs, offFails] = raw(NUMS,
      /只有(.)条上了空口，其后有(.)个 Wi-Fi 帧解不出来；关掉之后，是 (\d+) 条消息与 (\d+) 次失败/,
      '`numbers` on what the rule changes')
    expect(zh(onAir!), 'the narrowband messages the rule lets out').toBe(nbFrames().length)
    expect(zh(failed!), 'and the Wi-Fi frames that failed anyway')
      .toBe(wifiRxFail(recs()).length)
    expect(val(offMsgs!), 'the messages that go out with the rule off')
      .toBe(nbFrames(V_NOLBT).length)
    expect(val(offFails!), 'and the Wi-Fi frames that failed then')
      .toBe(wifiRxFail(recs(V_NOLBT)).length)
    // "407.215 Mb/s to 362.631, 44.58 gone, 10.95 % of what it had"
    const was = mbps(recs(V_OUT), 'laptop#6g')
    const now = mbps(recs(V_NOLBT), 'laptop#6g')
    const [a, b, lost, pct] = raw(NUMS,
      /它的吞吐从 ([\d.]+) Mb\/s 降到 ([\d.]+) Mb\/s，少掉 ([\d.]+) Mb\/s，占它原有吞吐的 ([\d.]+) %/,
      '`numbers` on what the laptop pays')
    same(a!, was, 'the laptop’s goodput with the session clear of its channel')
    same(b!, now, 'and with the rule switched off')
    same(lost!, was - now, 'the difference between them')
    same(pct!, ((was - now) / was) * 100, 'and that difference as a share of what it had')
    // the worked example's last row, and the quiz, print the same four figures
    const [wa, wb, wlost, wpct] = raw(cell(2, 6, 1),
      /([\d.]+) → ([\d.]+) Mb\/s · −([\d.]+) · ([\d.]+) %/, 'the worked example’s last row')
    same(wa!, was, 'the worked example: the goodput it had')
    same(wb!, now, 'the worked example: the goodput it is left with')
    same(wlost!, was - now, 'the worked example: the difference')
    same(wpct!, ((was - now) / was) * 100, 'the worked example: the share')
    const [qFails, qPct, qNow, qWas] = raw(QUIZ,
      /(\d+) 个帧解调失败，以及笔记本吞吐的 ([\d.]+) %：([\d.]+) Mb\/s 对 ([\d.]+) Mb\/s/,
      'the second answer')
    expect(val(qFails!), 'the quiz: the Wi-Fi frames that failed')
      .toBe(wifiRxFail(recs(V_NOLBT)).length)
    same(qNow!, now, 'the quiz: the goodput with the rule off')
    same(qWas!, was, 'the quiz: and without the session in its channel')
    same(qPct!, ((was - now) / was) * 100, 'the quiz: the share between them')
    same(raw(LIMITS, /笔记本那 ([\d.]+) % 的吞吐损失/, '`limits`')[0]!,
      ((was - now) / was) * 100, '`limits`: the same share, hung on the flat rectangle')
  })

  it('`deeper`: the radius one reading can see, and the distance that solves for it', () => {
    const [eirp, wide, again, slice, widthAgain, inBand] = raw(DEEP,
      /(\d+) dBm 摊在 (\d+) MHz 上 → (\d+) \+ 10·log10\(([\d.]+) \/ (\d+)\) = ([\d.]+) dBm/,
      '`deeper`’s first line')
    expect(val(eirp!), 'the router’s own EIRP').toBe(AP.txPowerDbm)
    expect(val(again!), 'restated inside the same line').toBe(val(eirp!))
    expect(val(wide!), 'the width it spreads over').toBe(AP.caps.widthMhz)
    expect(val(widthAgain!), 'restated too').toBe(val(wide!))
    same(slice!, NB_CHANNEL_MHZ, 'the slice one narrowband channel is')
    same(inBand!, val(eirp!) + 10 * Math.log10(val(slice!) / val(wide!)),
      'and the share that lands in one channel')
    // the note says the same three figures again
    const [nEirp, nWide, nSlice, nShare] = raw(DEEP,
      /(\d+) dBm 的 (\d+) MHz 发射，在自己带内任意 ([\d.]+) MHz 的一片里都是 ([\d.]+) dBm/,
      '`deeper`’s note')
    expect([val(nEirp!), val(nWide!)], 'the note’s EIRP and width')
      .toEqual([AP.txPowerDbm, AP.caps.widthMhz])
    same(nSlice!, NB_CHANNEL_MHZ, 'the note’s slice')
    same(nShare!, val(inBand!), 'and the note’s share')
    /*
     * **The second printing of a figure is its own site.** The sweep of 2026-10-13 planted the
     * note's radius with the suite green: the equation's own `d = 8.62 m` was read below, and
     * the note says it a second time in words. Read here, where it is printed.
     */
    const [noteRadius] = raw(DEEP, /它在 ([\d.]+) m 处跨过门限/, '`deeper`’s note on the radius')
    same(noteRadius!, crossingM(
      (m) => wifiInNbDbm(AP.txPowerDbm, AP.caps.widthMhz!, m), NB_LBT_THRESHOLD_DBM),
    'the radius the note names in words')
    // "4.95 − (46.7 + 30·log10 d + 1.2) = −71.02 → d = 8.62 m"
    const [lhs, oneM, mult, extra, thr, metres] = raw(DEEP,
      /([\d.]+) − \(([\d.]+) \+ (\d+)·log10 d \+ ([\d.]+)\) = −([\d.]+) {2}→ {2}d = ([\d.]+) m/,
      '`deeper`’s equation')
    same(lhs!, val(inBand!), 'the equation starts from the share the line above gave')
    same(oneM!, pathLossDb(1), 'the first metre of the Wi-Fi law')
    same(extra!, wifiToUwbPathLossDb(1, 0) - pathLossDb(1), 'and what 6 GHz adds to it')
    same(mult!, pathLossDb(10) - pathLossDb(1), 'the decade that law takes')
    same(thr!, -NB_LBT_THRESHOLD_DBM, 'the threshold it solves against')
    const d = crossingM((m) => wifiInNbDbm(AP.txPowerDbm, AP.caps.widthMhz!, m),
      NB_LBT_THRESHOLD_DBM)
    same(metres!, d, 'and the radius that equation gives')
    expect(D_ROUTER, 'the phone sits well inside it').toBeLessThan(val(metres!))
    // `sources` prints the same law, term by term, with the exponent named
    const [exp, sOneM, sMult, sExtra] = raw(SRC,
      /按室内衰减指数 (\d+) 传播——一米处 ([\d.]+) dB，加 (\d+)·log10 d，\d GHz 再加 ([\d.]+) dB/,
      '`sources` on the Wi-Fi law')
    same(sOneM!, pathLossDb(1), '`sources`: the first metre')
    same(sExtra!, wifiToUwbPathLossDb(1, 0) - pathLossDb(1), '`sources`: and the 6 GHz adder')
    same(sMult!, pathLossDb(10) - pathLossDb(1), '`sources`: the decade')
    expect(val(sMult!), 'which is ten times the exponent it names').toBe(10 * val(exp!))
    // "the narrowband radio goes free-space: channel 200 is 48.44 dB at one metre"
    const [sCh, sPl0] = raw(SRC, /窄带射频按自由空间传播，(\d+) 号信道一米处 ([\d.]+) dB/,
      '`sources` on the narrowband law')
    expect(val(sCh!), 'the channel this scene uses').toEqual(chansOf('base')[0])
    same(sPl0!, nbPl0Db(val(sCh!)), 'and its loss at one metre')
    same(raw(SRC, /dB。−(\d+) dBm 的能量检测门限/, '`sources` on the Wi-Fi threshold')[0]!,
      -CCA_ED_DBM, 'the threshold phy.ts exports')
  })

  it('`deeper`: the hop, block by block, and the sequence `limits` restates', () => {
    const list = chansOf('hop')
    const [l0, l1, l2, l3, avoid, inside, fourth] = raw(DEEP,
      /允许列表 \[(\d+), (\d+), (\d+), (\d+)\] 里有(.)个信道避开了路由器的 \d+ MHz，另(.)个落在里面——([\d.]+) MHz 同样在里面/,
      '`deeper` on the allow list')
    expect([l0, l1, l2, l3].map((x) => val(x!)), 'the list that scene ships').toEqual(list)
    expect(list.filter((c) => !overlapsSix(c)), 'the ones that avoid the router')
      .toHaveLength(zh(avoid!))
    const within = list.filter((c) => overlapsSix(c))
    expect(within, 'and the ones that land inside it').toHaveLength(zh(inside!))
    same(fourth!, nbCenterMhz(within[within.length - 1]!),
      'the centre of the last of those, which the sentence names')
    expect(overlapsSix(within[within.length - 1]!), 'and it really is inside').toBe(true)
    same(raw(DEEP, /里有两个信道避开了路由器的 (\d+) MHz/, '`deeper` on the router’s width')[0]!,
      AP.caps.widthMhz!, 'the router’s own channel width')
    // "block b takes list[hash("7:b") mod 4]" — the seed and the length of the list
    const [seed, mod] = figs(DEEP, /list\[hash\(“(\d+):b”\) mod (\d)\]/,
      '`deeper` on how a block picks one')
    expect(seed, 'the seed that scene runs').toBe(uwbNbaCoexist.variants![V_HOP]!.scenario().seed)
    expect(mod, 'and the length of the list').toBe(list.length)
    // the seven channels it gives, and the same seven `limits` quotes back
    const replay = Array.from({ length: BLOCKS }, (_x, b) => nbChannelForBlock(list, seed!, b))
    const seq = figs(DEEP, /依次给出 (\d+)、(\d+)、(\d+)、(\d+)、(\d+)、(\d+)、(\d+)/,
      '`deeper` on the seven channels')
    expect(seq, 'the channels the hash really gives').toEqual(replay)
    const quoted = figs(LIMITS, /「七个块依次落在 (\d+)、(\d+)、(\d+)、(\d+)…」/,
      '`limits` quoting the same sequence')
    expect(quoted, 'the first four of it, as `limits` prints them')
      .toEqual(replay.slice(0, quoted.length))
    // "blocks 0, 3 and 4 land outside and run in full; 1, 2, 5 and 6 are skipped"
    const [out1, out2, out3] = figs(DEEP, /第 (\d)、(\d)、(\d) 块落在外面，完整跑完/,
      '`deeper` on the blocks that ran')
    expect(fixes(V_HOP).map((f) => f.block), 'the blocks that solved a fix')
      .toEqual([out1, out2, out3])
    const [in1, in2, in3, in4] = figs(DEEP, /第 (\d)、(\d)、(\d)、(\d) 块落在里面，被跳过/,
      '`deeper` on the blocks that were skipped')
    expect(skippedBlocks(V_HOP, TAG), 'the blocks the phone lost').toEqual([in1, in2, in3, in4])
    const [late, oneRange] = raw(DEEP, /其中第 (\d) 块在报告时隙被拦下之前还发出了(.)个距离/,
      '`deeper` on the block that got one out anyway')
    const perBlock = new Map<number, number>()
    for (const r of tagRanges(V_HOP)) perBlock.set(r.block, (perBlock.get(r.block) ?? 0) + 1)
    expect(perBlock.get(val(late!)), 'what that one block managed').toBe(zh(oneRange!))
    expect(skippedBlocks(V_HOP, TAG), 'and it is one of the skipped ones').toContain(val(late!))
    const [of7, got] = raw(DEEP, /(.)次定位变成(.)次/, '`deeper` on what hopping buys')
    expect(zh(of7!), 'the fixes the clear channel gets').toBe(fixes(V_OUT).length)
    expect(zh(got!), 'and the fixes hopping gets').toBe(fixes(V_HOP).length)
  })

  it('`deeper`: the deferrals counted, the wide radio next door, and the window one reading misses', () => {
    const [secs, count] = raw(DEEP, /关掉规则后，([\d.]+) 秒里 (\d+) 次/,
      '`deeper` on the deferrals it counts')
    same(secs!, SEC, 'the window every figure of this file is measured over')
    expect(val(count!), 'the deferrals the rule-off run causes')
      .toBe(nbDeferrals(V_NOLBT).length)
    expect(nbDeferrals(V_OUT), 'and the scene that avoids the router causes none').toHaveLength(0)
    const [notTwice, times] = raw(DEEP, /它不是 (\d+) 的(.)倍/, '`deeper` on why it is not double')
    expect(val(notTwice!), 'the messages that went out').toBe(nbFrames(V_NOLBT).length)
    expect(nbDeferrals(V_NOLBT).length, 'and the deferrals are fewer than that multiple')
      .toBeLessThan(zh(times!) * nbFrames(V_NOLBT).length)
    /*
     * "a ranging frame’s −14 dBm over 499.2 MHz only trips the same threshold within about
     * 40 cm" — 「约」, so the figure is the radius to the nearest ten centimetres, which is
     * still exact enough that moving its last digit reddens this row.
     */
    const [uwbDbm, uwbWide, cm] = raw(DEEP,
      /一帧测距帧的 −(\d+) dBm 摊在 ([\d.]+) MHz 上，只在约 (\d+) cm 以内/,
      '`deeper` on the wide radio next door')
    expect(-val(uwbDbm!), 'the power phy.ts gives a ranging frame').toBe(UWB_TX_POWER_DBM)
    same(uwbWide!, UWB_BAND_MHZ[5].hi - UWB_BAND_MHZ[5].lo, 'the band it spreads over')
    const overlap = bandOverlapMhz(UWB_BAND_MHZ[5].lo, UWB_BAND_MHZ[5].hi, SIX_LO, SIX_HI)
    const uwbRadius = crossingM(
      (d) => uwbInBandDbm(UWB_TX_POWER_DBM, overlap) - uwbToWifiPathLossDb(d, 0, 5), CCA_ED_DBM)
    expect(val(cm!), 'that radius, to the nearest ten centimetres')
      .toBe(Math.round((100 * uwbRadius) / 10) * 10)
    expect(uwbRadius, 'far shorter than the narrowband radio’s').toBeLessThan(1)
    // the duration a single reading at the top of a slot says nothing about
    for (const [text, re, what] of [
      [DEEP, /对随后的 (\d+) µs 什么也没说/, '`deeper`'],
      [LIMITS, /这一个读数对随后 (\d+) µs 里发生的事/, '`limits`'],
    ] as const) {
      const [us] = figs(text, re, `${what} on the window one reading misses`)
      expect(us! * 1000, `${what}: the narrowband message that follows it`)
        .toBe(nbPpduNs(NB_POLL_BYTES))
      expect(nbPpduNs(NB_RESP_BYTES), 'which a Response takes too').toBe(us! * 1000)
      expect(nbPpduNs(NB_REPORT_BYTES), 'while a Report takes longer still')
        .toBeGreaterThan(us! * 1000)
    }
    // "seven narrowband messages die at the phone — five Reports and two Responses"
    const lost = nbLosses(V_NOLBT)
    const [all, rep, resp, ctlW, away, dbm] = raw(DEEP,
      /有(.)条窄带消息在手机这里失败——(.)条 Report、(.)条 Response——[\s\S]*?那帧 (\d+) MHz 控制帧：它从 ([\d.]+) m 外飞来，到达时 −([\d.]+) dBm/,
      '`deeper` on the messages that die at the phone')
    expect(lost, 'the messages the phone loses with the rule off').toHaveLength(zh(all!))
    expect(lost.filter((l) => l.kind === 'nbReport'), 'the Reports among them')
      .toHaveLength(zh(rep!))
    expect(lost.filter((l) => l.kind === 'nbResp'), 'and the Responses').toHaveLength(zh(resp!))
    same(away!, D_ROUTER, 'how far the frame that killed them came')
    const reported = ofType(recs(V_NOLBT), 'UWB_INTERFERED')
    expect(reported.length, 'the engine does report them').toBe(lost.length)
    for (const i of reported) same(dbm!, -i.foreignDbm, 'and the level each one arrived at')
    same(dbm!, -wifiInNbDbm(AP.txPowerDbm, val(ctlW!), D_ROUTER),
      'which is that width’s own in-band share at that distance')
    same(raw(DEEP, /它的接收端到 −(\d+) dBm 就见了底/, '`deeper` on the receiver’s floor')[0]!,
      -NB_RX_SENS_DBM, 'the sensitivity nb.ts gives it')
  })

  it('`deeper`: the whole channel plan, the default list, and the gap the clear channel sits in', () => {
    const [total, slice, lower, lowFrom, upper, upFrom] = raw(DEEP,
      /整套规划共有 (\d+) 个 ([\d.]+) MHz 的信道：UNII-3 里 (\d+) 个，自 ([\d.]+) MHz 起；UNII-5[\s\S]*?里 (\d+) 个，自 ([\d.]+) MHz 起/,
      '`deeper` on the whole plan')
    expect(val(total!), 'the channels nb.ts plans').toBe(NB_CHANNELS)
    same(slice!, NB_CHANNEL_MHZ, 'the width of each')
    // the split is measured, not assumed: the one place consecutive centres are not 2.5 apart
    const centres = Array.from({ length: NB_CHANNELS }, (_x, n) => nbCenterMhz(n))
    const breaks = centres.flatMap((c, n) =>
      n > 0 && Math.abs(c - centres[n - 1]!) > NB_CHANNEL_MHZ ? [n] : [])
    expect(breaks, 'the plan has exactly one gap in it').toHaveLength(1)
    expect(val(lower!), 'the channels below that gap').toBe(breaks[0])
    expect(val(upper!), 'and the channels above it').toBe(NB_CHANNELS - breaks[0]!)
    expect(val(lower!) + val(upper!), 'which together are the whole plan').toBe(val(total!))
    same(lowFrom!, nbCenterMhz(0), 'the first channel of the lower band')
    same(upFrom!, nbCenterMhz(breaks[0]!), 'and the first of the upper one')
    expect(nbLbtRequired(breaks[0]!, 'auto'), 'the upper band is the one the rule applies to')
      .toBe(true)
    // "this router’s 80 MHz covers thirty-two of them, numbers 186 to 217"
    const [routerW, howMany, from, to] = raw(DEEP,
      /这台路由器的 (\d+) MHz 整整覆盖(.+?)个，编号 (\d+) 到 (\d+)/,
      '`deeper` on what the router covers')
    expect(val(routerW!), 'the router’s own width').toBe(AP.caps.widthMhz)
    const covered = centres.flatMap((_c, n) =>
      nbBand(n).lo >= SIX_LO && nbBand(n).hi <= SIX_HI ? [n] : [])
    expect(covered, 'the channels that fit entirely inside it').toHaveLength(zh(howMany!))
    expect([covered[0], covered[covered.length - 1]], 'and which ones they are')
      .toEqual([val(from!), val(to!)])
    expect(val(routerW!) / NB_CHANNEL_MHZ, 'as many as its width holds').toBe(zh(howMany!))
    // "the list a session ships with is [3] — 5733.75 MHz, in UNII-3"
    const [def, defMhz] = raw(DEEP, /默认允许列表是 \[(\d+)\]——([\d.]+) MHz/,
      '`deeper` on the default list')
    expect([val(def!)], 'the list nb.ts defaults to').toEqual([...NB_DEFAULT_CHANNELS])
    same(defMhz!, nbCenterMhz(val(def!)), 'and its own centre')
    expect(nbBand(val(def!)).hi, 'which sits below the whole 6 GHz band').toBeLessThan(SIX_LO)
    expect(nbLbtRequired(val(def!), 'auto'), 'where listening first is optional').toBe(false)
    // "channel 100, with 212.5 MHz of empty spectrum between its upper edge and the router’s"
    const [clear, gap] = raw(DEEP, /所用的 (\d+) 号[\s\S]*?隔着 ([\d.]+) MHz 的空白频谱/,
      '`deeper` on how far the clear channel sits')
    expect([val(clear!)], 'the channel that scene ships').toEqual(chansOf('outside'))
    same(gap!, SIX_LO - nbBand(val(clear!)).hi, 'and the empty spectrum between them')
    // `sources` counts the plan a second time
    expect(val(raw(SRC, /(\d+) 个窄带信道、带“整块中止”/, '`sources` on the plan')[0]!),
      'the channels, again').toBe(NB_CHANNELS)
  })

  it('`observe`, `tryThis` and the quiz: the instant, the two inspector rows, the two tallies', () => {
    const first = lbt().filter((l) => l.node === TAG)[0]!
    same(raw(OBS, /^([\d.]+) ms 处轮到手机自己的报告时隙/, '`observe` on when the block ends')[0]!,
      first.t / MS, 'when the phone’s own busy check happens')
    const vs = initViewState(uwbNbaScenario('base'))
    for (const r of recs()) applyRecord(vs, r)
    const u = vs.nodes[TAG].uwb!
    const [chRow] = raw(OBS, /检视面板上写着 “([^”]+)”/, '`observe` on the channel row')
    expect(uwbNbChannelText(u, STRINGS.uwb), 'the row the inspector really shows').toBe(chRow)
    const [lbtRow] = raw(OBS, /一行是 “([^”]+)”/, '`observe` on the listen-before-talk row')
    expect(uwbLbtText(u, STRINGS.uwb), 'and the row it shows for the rule').toBe(lbtRow)
    const [busy, blocksLost] = figs(lbtRow!, /(\d+) 次忙 · 跳过 (\d+) 个块/,
      'the two counts inside that row')
    expect(busy, 'the busy checks the phone made').toBe(lbt().filter((l) => l.node === TAG).length)
    expect(blocksLost, 'and the blocks it lost by them')
      .toBe(skippedBlocks(undefined, TAG).length)
    const [timeouts, dists] = raw(OBS, /超时有 (\d+) 次，测出的距离只有(.)个/,
      '`observe` on the two tallies')
    expect(val(timeouts!), 'the timeouts this run records')
      .toBe(ofType(recs(), 'UWB_TIMEOUT').length)
    expect(zh(dists!), 'and the ranges it gets').toBe(tagRanges().length)
    // `tryThis`: the three other scenes, by what each one measures
    const [outDists] = figs(TRY, /一次判忙也没有，(\d+) 个距离，每个块都解出定位/,
      '`tryThis` on the clear channel')
    expect(outDists, 'the ranges that scene gets').toBe(tagRanges(V_OUT).length)
    expect(fixes(V_OUT), 'and it solves one in every block').toHaveLength(BLOCKS)
    const [hopClear, hopFixes] = raw(TRY, /(.)个块落到清静处，给出(.)次定位/,
      '`tryThis` on the hopping scene')
    expect(zh(hopClear!), 'the blocks that land clear')
      .toBe(BLOCKS - skippedBlocks(V_HOP, TAG).length)
    expect(zh(hopFixes!), 'and the fixes they give').toBe(fixes(V_HOP).length)
    const [offDists, offFixes] = figs(TRY, /(\d+) 个距离、(\d+) 次定位/,
      '`tryThis` on the rule-off scene')
    expect(offDists, 'the ranges that scene gets').toBe(tagRanges(V_NOLBT).length)
    expect(offFixes, 'and the fixes').toBe(fixes(V_NOLBT).length)
    // the quiz restates the rule-off count, against the base run's own
    const [qOff, qBase] = raw(QUIZ, /会话拿到的是 (\d+) 个距离，而不是(.)个/, 'the second question')
    expect(val(qOff!), 'the ranges with the rule off').toBe(tagRanges(V_NOLBT).length)
    expect(zh(qBase!), 'and the ranges with it on').toBe(tagRanges().length)
  })
})
