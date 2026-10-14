/**
 * Every empirical claim in the "Sharing 6 GHz" lesson, measured against the
 * lesson's own scenario and its four variants. Each assertion quotes the
 * sentence or the table cell it guards, copied from the shipped string; the
 * band edges, the SIR floor, the path-loss laws, the noise floor and the CCA
 * thresholds come from the engine's own exports (src/uwb/phy.ts,
 * src/engine/spectrum.ts, src/engine/phy.ts) rather than being re-typed here.
 * The inspector rows are replayed through the player's own reducer
 * (initViewState + applyRecord).
 *
 * The lesson was rewritten to the zero-to-hero contract, so the provenance and
 * the two path-loss laws that used to open the body now live in `sources`, the
 * three cures and the crossover distance in `deeper`, and the level ledger in
 * tables of `numbers`. Every pin moved with its sentence; `.body!` is gone, and
 * the shape checks are the kit's.
 */
import { describe, it, expect } from 'vitest'
import {
  CLEAR_6G_CENTER_MHZ, WIFI_6G_CENTER_MHZ, uwbCoexist, uwbCoexistScenario,
} from '../../src/course/uwb/uwb-coexist'
import { uwbPosition } from '../../src/course/uwb/uwb-position'
import { Simulation } from '../../src/engine/simulation'
import {
  DEFAULT_SIX_GHZ_CENTER_MHZ, DEFAULT_UWB_SESSION, ScenarioSchema, sixGhzChannelNo, type Scenario,
} from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block } from '../../src/course/lessonKit'
import { COURSE_ORDER, MODULES, TIERS } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings, lessonTexts } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { CCA_ED_DBM, noiseDbm, reqSinrDb } from '../../src/engine/phy'
import { uwbToWifiPathLossDb, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import {
  UWB_BAND_MHZ, UWB_MAX_INPUT_DBM_PER_MHZ, UWB_PL_EXP, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
  tsSigmaNs, uwbBandOverlap, uwbBandOverlapMhz, uwbInBandDbm, uwbPl0Db, uwbSinrDb,
} from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
import { linkPlanFor } from '../../src/model/caps'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Five seconds: twenty-five 200 ms ranging blocks, and long enough for the backup to burst eight times. */
const RUN_NS = 5000 * MS
const BLOCKS = 25
const SEC = RUN_NS / 1e9

const TAG = { x: 4, y: 3.5, z: 1.0 }
const AP = { x: 5, y: 0.7, z: 2.0 }
const LAPTOP = { x: 7, y: 5, z: 1.0 }
const ANCHOR_Z = 2.2
const CORNERS: [string, number, number][] = [
  ['anchor-1', 0.5, 0.5], ['anchor-2', 9.5, 0.5], ['anchor-3', 0.5, 7.5], ['anchor-4', 9.5, 7.5],
]
const UWB_IDS = new Set([...CORNERS.map(([id]) => id), 'uwb-1'])
const WIFI_VIDS = ['ap#6g', 'laptop#6g']

const CH9 = 0, WIFI7 = 1, SAT = 2, NO_UWB = 3

/** The engine's own width for this lesson's 6 GHz channel, read off the scenario. */
const WIDTH_MHZ = uwbCoexistScenario().nodes.find((n) => n.id === 'laptop')!.caps.widthMhz!

/** A number as the prose prints it: the lesson uses the typographic minus, U+2212, not a hyphen. */
const minus = (n: number): string => String(n).replace('-', '−')

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbCoexist.scenario() : uwbCoexist.variants![variant].scenario()

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(uwbCoexist, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The section budgets are gone; a lesson is as long as its one topic needs, under
// the 30-minute ceiling (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md).
lessonShapeSuite(uwbCoexist, { runNs: RUN_NS })

const interfered = (variant?: number) => ofType(recs(variant), 'UWB_INTERFERED')
const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)

const nodeOf = (r: TLRecord): string | undefined =>
  typeof (r as { node?: unknown }).node === 'string' ? (r as { node: string }).node : undefined
const isUwbSide = (r: TLRecord): boolean => {
  const n = nodeOf(r)
  return r.type.startsWith('UWB_') || (n !== undefined && UWB_IDS.has(n))
}
/** A run's records with the shared emitter's `seq` stripped, so two runs that differ only in how
 * many records the *other* technology emitted can still be compared field for field. */
const stripSeq = (rs: TLRecord[]): unknown[] => rs.map((r) => {
  const o: Record<string, unknown> = { ...r }
  delete o.seq
  return o
})
const wifiSide = (rs: TLRecord[]): unknown[] => stripSeq(rs.filter((r) => !isUwbSide(r)))

/** Air time (ns) a set of virtual node ids spent transmitting over the run. */
const airNs = (rs: TLRecord[], ids: (id: string) => boolean): number =>
  ofType(rs, 'TX_START').filter((r) => ids(r.node)).reduce((a, r) => a + r.frame.txTimeNs, 0)
const wifiAirPct = (variant?: number) => airNs(recs(variant), (id) => WIFI_VIDS.includes(id)) / RUN_NS * 100
const uwbAirPct = (variant?: number) => airNs(recs(variant), (id) => UWB_IDS.has(id)) / RUN_NS * 100

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

/** Everything a learner reads of this lesson, `deeper` and `sources` included, joined. */
const prose = (): string => lessonStrings(uwbCoexist).map((s) => s).join('\n')
const proseZh = (): string => lessonStrings(uwbCoexist).map((s) => s).join('\n')

const tablesOf = (bs: Block[]): Extract<Block, { kind: 'table' }>[] =>
  bs.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
/** The nth table of `numbers`; rows kept in place so a cell can be checked by position. */
const table = (n: number) => tablesOf(uwbCoexist.numbers!)[n]
const cell = (n: number, row: number, col: number): string => table(n).rows[row][col]
/** The nth table of `deeper` — the cures table and the two position lines. */
const deepTable = (n: number) => tablesOf(uwbCoexist.deeper!)[n]
const deepCell = (n: number, row: number, col: number): string => deepTable(n).rows[row][col]

/** In-band level (dBm) a Wi-Fi transmitter of `eirpDbm` puts into the UWB band at `at`. */
const wifiAt = (from: { x: number; y: number; z: number }, eirpDbm: number, at: typeof TAG): number =>
  eirpDbm + 10 * Math.log10(uwbBandOverlap(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)) - wifiToUwbPathLossDb(dist(from, at), 0)
/** In-band level (dBm) one UWB frame puts into the Wi-Fi channel at `at`. */
const uwbAt = (from: { x: number; y: number; z: number }, at: typeof TAG): number =>
  uwbInBandDbm(UWB_TX_POWER_DBM, uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)) - uwbToWifiPathLossDb(dist(from, at), 0, 5)
/** What one anchor's frame is worth at the tag: the UWB link budget of the first UWB lesson. */
const anchorAtTag = (x: number, y: number): number =>
  UWB_TX_POWER_DBM - (uwbPl0Db(5) + 20 * Math.log10(dist({ x, y, z: ANCHOR_Z }, TAG)))
/** Noise rise (dB) an in-band interferer causes over the operating channel's thermal floor. */
const noiseRiseDb = (interfDbm: number): number =>
  10 * Math.log10(1 + 10 ** ((interfDbm - noiseDbm(WIDTH_MHZ)) / 10))

/** The tag's inspector state after the whole run, replayed through the player's own reducer. */
function inspectorAfter(variant: number | undefined, id: string) {
  const vs = initViewState(scenarioOf(variant))
  for (const r of recs(variant)) applyRecord(vs, r)
  const u = vs.nodes[id].uwb
  expect(u, `${id} has a UWB lane`).toBeDefined()
  return u!
}

describe('uwb-coexist · the lesson’s own place in the track', () => {
  it('opens the coexistence module and asks for the sessions and geometry lessons', () => {
    expect(MODULES[uwbCoexist.module].title).toBe('共存')
    expect(uwbCoexist.id).toBe('uwb-coexist')
    expect(uwbCoexist.needs).toEqual(['uwb-blocks', 'uwb-geometry'])
    // the three words this lesson introduces: what shares, what it costs, and what Wi-Fi does about it
    expect(uwbCoexist.terms!.map((t) => t.term)).toEqual(['overlap', 'SIR', 'threshold', 'noise floor', 'energy detect'])
  })

  it('it offers five jumps, two things to observe, two experiments and two questions', () => {
    expect(uwbCoexist.jumps).toHaveLength(5)
    expect(uwbCoexist.observe).toHaveLength(2)
    expect(uwbCoexist.tryThis).toHaveLength(2)
    expect(uwbCoexist.quiz).toHaveLength(2)
    for (const q of uwbCoexist.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('the jump targets occur in the order the list gives them', () => {
    const rs = recs()
    const at = uwbCoexist.jumps.map((j) => {
      const i = rs.findIndex(j.find)
      expect(i, j.label).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // the Poll opens the run; the loss and its timeout are 1.809 ms apart, and the fix that
    // then has to manage on three anchors is at the same instant as the timeout
    expect(rs[at[0]].t).toBe(0)
    expect(rs[at[3]].t - rs[at[2]].t).toBe(1_808_502)
    expect(rs[at[4]].t).toBe(rs[at[3]].t)
  })

  it('names the one standard clause it leans on and owns the rest as the model’s, in `sources`', () => {
    const src = uwbCoexist.sources!.map((s) => s).join('\n')
    // "§16.4.10 sets a UWB receiver’s maximum input at −45 dBm/MHz"
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§16.4.10')
    expect(src).toContain(`${minus(UWB_MAX_INPUT_DBM_PER_MHZ)} dBm/MHz`)
    // "a −12 dB signal-to-interference floor" / "The rest is the model."
    expect(src).toContain(`${minus(UWB_SIR_MIN_DB)} dB`)
  })

  it('the course seam puts it first in a second UWB tier', () => {
    expect(TIERS[5].track).toBe('uwb')
    const tierOf = (id: string) => MODULES[LESSONS.find((l) => l.id === id)!.module].tier
    expect(MODULES[uwbCoexist.module].tier).toBe(5)
    // the modules of the second UWB tier are read through the lessons in them, never through
    // an index: uwb-contention opens the module after this one and is in the same tier
    expect(tierOf('uwb-contention')).toBe(5)
    // the tier-2 lessons are read after uwb-geometry and before uwb-mms, and every one of
    // them has a lesson. A membership claim, not a slice: the tier gains lessons.
    const ids = LESSONS.map((l) => l.id)
    for (const id of ['uwb-coexist', 'uwb-contention', 'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa']) {
      expect(ids, id).toContain(id)
      expect(COURSE_ORDER.indexOf('uwb-geometry'), id).toBeLessThan(COURSE_ORDER.indexOf(id))
      expect(COURSE_ORDER.indexOf(id), id).toBeLessThan(COURSE_ORDER.indexOf('uwb-mms'))
    }
  })
})

describe('uwb-coexist · the scene', () => {
  it('is the positioning lesson’s anchors and tag on channel 5, with a 6 GHz router and a laptop listed first', () => {
    const s = uwbCoexist.scenario()
    expect(s.nodes.map((n) => n.id)).toEqual(['ap', 'laptop', ...CORNERS.map(([id]) => id), 'uwb-1'])
    // the UWB nodes are listed LAST, so the 6 GHz link — and its mediator — exist before the session
    expect(s.nodes.slice(2).every((n) => n.kind === 'uwb')).toBe(true)
    expect(s.nodes.slice(0, 2).every((n) => n.kind !== 'uwb')).toBe(true)
    // the positioning lesson's geometry, to the metre
    const five = uwbPosition.scenario()
    expect(s.nodes.slice(2).map((n) => [n.id, n.pos])).toEqual(five.nodes.map((n) => [n.id, n.pos]))
    expect(s.nodes[6].pos).toEqual(TAG)
    expect(s.rooms).toEqual(five.rooms)
    expect(s.walls).toEqual(five.walls)
    // the session: DS, NLOS on, channel 5 rather than the default 9
    expect(s.uwb).toEqual({ ...DEFAULT_UWB_SESSION, method: 'ds', nlos: true, channel: 5 })
    expect(DEFAULT_UWB_SESSION.channel).toBe(9)
    // "Wi-Fi 71, this router’s"; the laptop is on the 6 GHz link, the AP on every link
    expect(s.sixGhzCenterMhz).toBe(WIFI_6G_CENTER_MHZ)
    expect(sixGhzChannelNo(WIFI_6G_CENTER_MHZ)).toBe(71)
    expect([s.nodes[0].pos, s.nodes[1].pos]).toEqual([AP, LAPTOP])
    expect(s.nodes[0].linkId).toBeUndefined()
    expect(s.nodes[1].linkId).toBe('6g')
    expect([s.nodes[0].caps.widthMhz, s.nodes[1].caps.widthMhz]).toEqual([80, 80])
    expect([s.nodes[0].caps.generation, s.nodes[1].caps.generation]).toEqual(['eht', 'eht'])
    expect(s.nodes[1].caps.features).toEqual({ edca: true, txop: true, ampdu: true })
    expect([s.nodes[0].profiles, s.nodes[1].profiles]).toEqual([['idle'], ['backup']])
    expect([s.nodes[0].txPowerDbm, s.nodes[1].txPowerDbm]).toEqual([20, 15])
    expect(s).toEqual(uwbCoexistScenario('base'))
  })

  it('the scenario and all four variants pass the scenario schema, each changing one thing', () => {
    expect(() => ScenarioSchema.parse(uwbCoexist.scenario())).not.toThrow()
    expect(uwbCoexist.variants).toHaveLength(4)
    for (const v of uwbCoexist.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const base = uwbCoexist.scenario()
    // "UWB on channel 9" — the session's channel and nothing else
    expect(scenarioOf(CH9)).toEqual({ ...base, uwb: { ...base.uwb!, channel: 9 } })
    // "Wi-Fi on channel 7 (5 985 MHz)" — the 6 GHz centre, which is also the engine's default
    expect(CLEAR_6G_CENTER_MHZ).toBe(DEFAULT_SIX_GHZ_CENTER_MHZ)
    expect(sixGhzChannelNo(CLEAR_6G_CENTER_MHZ)).toBe(7)
    expect(scenarioOf(WIFI7)).toEqual({ ...base, sixGhzCenterMhz: CLEAR_6G_CENTER_MHZ })
    // "Saturated upload" — the laptop's profile
    const sat = scenarioOf(SAT)
    expect(sat.nodes[1].profiles).toEqual(['saturated'])
    expect({ ...sat, nodes: [sat.nodes[0], base.nodes[1], ...sat.nodes.slice(2)] }).toEqual(base)
    // "No UWB" — the Wi-Fi pair alone, with no session left behind
    const none = scenarioOf(NO_UWB)
    expect(none.nodes.map((n) => n.id)).toEqual(['ap', 'laptop'])
    expect(none.uwb).toBeUndefined()
    expect({ ...none, nodes: base.nodes, uwb: base.uwb }).toEqual(base)
  })
})

describe('uwb-coexist · the band arithmetic', () => {
  it('UWB channel 5 is 6240.0–6739.2 MHz and Wi-Fi channel 71 lies wholly inside it', () => {
    // the "Where the channels sit" table, row by row
    expect(UWB_BAND_MHZ[5]).toEqual({ lo: 6240.0, hi: 6739.2 })
    expect(UWB_BAND_MHZ[5].hi - UWB_BAND_MHZ[5].lo).toBeCloseTo(499.2, 10)
    expect(cell(0, 0, 1)).toBe('6240.0 to 6739.2 MHz')
    expect(cell(0, 0, 2)).toBe('499.2 MHz wide')
    // "6265 to 6345 MHz" / "80 of 80 MHz · overlap 1.00"
    expect([WIFI_6G_CENTER_MHZ - WIDTH_MHZ / 2, WIFI_6G_CENTER_MHZ + WIDTH_MHZ / 2]).toEqual([6265, 6345])
    expect(cell(0, 1, 1)).toBe('6265 to 6345 MHz')
    expect(uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)).toBe(WIDTH_MHZ)
    expect(uwbBandOverlap(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5).toFixed(2)).toBe('1.00')
    expect(cell(0, 1, 2)).toBe(`${WIDTH_MHZ} of 80 MHz · overlap 1.00`)
    // "5945 to 6025 MHz" / "0 MHz · overlap 0.00"
    expect([CLEAR_6G_CENTER_MHZ - WIDTH_MHZ / 2, CLEAR_6G_CENTER_MHZ + WIDTH_MHZ / 2]).toEqual([5945, 6025])
    expect(cell(0, 2, 1)).toBe('5945 to 6025 MHz')
    expect(uwbBandOverlapMhz(CLEAR_6G_CENTER_MHZ, WIDTH_MHZ, 5)).toBe(0)
    expect(cell(0, 2, 2)).toBe('0 MHz · overlap 0.00')
    // "7737.6 to 8236.8 MHz"
    expect(UWB_BAND_MHZ[9]).toEqual({ lo: 7737.6, hi: 8236.8 })
    expect(cell(0, 3, 1)).toBe('7737.6 to 8236.8 MHz')
  })

  it('the in-band formula is the mediator’s own: 20 dBm against −21.95 dBm', () => {
    const f = uwbCoexist.numbers!.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(f).toHaveLength(1)
    expect(f[0].text).toBe(
      'in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: 20 + 10·log10(80/80) = 20 dBm      UWB: −14 + 10·log10(80/499.2) = −21.95 dBm')
    expect(f[0].text).toBe(f[0].text)
    const uwbInBand = uwbInBandDbm(UWB_TX_POWER_DBM, uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))
    expect(uwbInBand.toFixed(2)).toBe('-21.95')
    expect(UWB_TX_POWER_DBM).toBe(-14)
    // "7.95 dB gone before the path loss starts"
    expect((UWB_TX_POWER_DBM - uwbInBand).toFixed(2)).toBe('7.95')
    // the router loses nothing: overlap 1.00 is 0 dB
    expect(10 * Math.log10(uwbBandOverlap(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))).toBe(0)
  })

  it('the two path-loss laws `sources` quotes are the engine’s, exponent 3 against exponent 2', () => {
    // "Wi-Fi travels under the indoor exponent 3 — 46.7 dB at one metre, plus 30·log10 d, plus
    //  1.2 dB for 6 GHz — and UWB under free space, exponent 2, 48.69 dB at one metre on channel 5"
    expect(wifiToUwbPathLossDb(1, 0).toFixed(1)).toBe('47.9') // 46.7 + 1.2
    expect((wifiToUwbPathLossDb(10, 0) - wifiToUwbPathLossDb(1, 0)).toFixed(6)).toBe('30.000000')
    expect(uwbPl0Db(5).toFixed(2)).toBe('48.69')
    expect((uwbToWifiPathLossDb(10, 0, 5) - uwbToWifiPathLossDb(1, 0, 5)).toFixed(6)).toBe('20.000000')
  })

  it('channel 9 cannot overlap any 6 GHz Wi-Fi channel, at any width the schema allows', () => {
    // deeper: "even a 320 MHz channel at the highest centre the editor accepts, 7115 MHz,
    //  reaches only 7275 MHz — 462.6 MHz of clear air"
    const TOP = 7115 // ScenarioSchema's maximum sixGhzCenterMhz
    expect(() => ScenarioSchema.parse({ ...uwbCoexist.scenario(), sixGhzCenterMhz: TOP })).not.toThrow()
    expect(() => ScenarioSchema.parse({ ...uwbCoexist.scenario(), sixGhzCenterMhz: TOP + 5 })).toThrow()
    expect(TOP + 320 / 2).toBe(7275)
    expect((UWB_BAND_MHZ[9].lo - (TOP + 320 / 2)).toFixed(1)).toBe('462.6')
    for (const w of [20, 40, 80, 160, 320]) expect(uwbBandOverlapMhz(TOP, w, 9), `${w} MHz`).toBe(0)
  })
})

describe('uwb-coexist · what each side hears', () => {
  it('the tag hears the router at −42.79 dBm and the laptop at −48.67 dBm', () => {
    // the "What each side hears" table, rows 0–3
    expect(dist(AP, TAG).toFixed(2)).toBe('3.14')
    expect(dist(LAPTOP, TAG).toFixed(2)).toBe('3.35')
    expect(wifiAt(AP, 20, TAG).toFixed(2)).toBe('-42.79')
    expect(cell(1, 0, 2)).toBe('−42.79 dBm')
    expect(wifiAt(LAPTOP, 15, TAG).toFixed(2)).toBe('-48.67')
    expect(cell(1, 1, 2)).toBe('−48.67 dBm')
    // "the four anchors, 4.76 to 6.91 m off" → "−76.25 to −79.48 dBm"
    const ds = CORNERS.map(([, x, y]) => dist({ x, y, z: ANCHOR_Z }, TAG))
    expect([Math.min(...ds).toFixed(2), Math.max(...ds).toFixed(2)]).toEqual(['4.76', '6.91'])
    for (const d of ['4.76', '6.91']) expect(cell(1, 2, 1), d).toContain(d)
    const at = CORNERS.map(([, x, y]) => anchorAtTag(x, y))
    expect([Math.max(...at).toFixed(2), Math.min(...at).toFixed(2)]).toEqual(['-76.25', '-79.48'])
    expect(cell(1, 2, 2)).toBe('−76.25 to −79.48 dBm')
    // "weakest anchor over the laptop" → "SIR −30.81 dB · floor −12 dB"
    const weakest = anchorAtTag(9.5, 7.5)
    expect(Math.min(...at)).toBe(weakest)
    const sir = weakest - wifiAt(LAPTOP, 15, TAG)
    expect(sir.toFixed(2)).toBe('-30.81')
    expect(cell(1, 3, 2)).toBe(`SIR ${minus(-30.81)} dB · floor ${minus(UWB_SIR_MIN_DB)} dB`)
    // "leaves the tag 18.8 dB short of what it can decode through"
    expect((UWB_SIR_MIN_DB - sir).toFixed(1)).toBe('18.8')
    expect(sir).toBeLessThan(UWB_SIR_MIN_DB)
    // quiz 1: "34 dB of transmit power, plus 7.95 dB of the UWB frame falling outside the 80 MHz"
    // ("EIRP" is the formula's word, and the formula body is the one place it is allowed) /
    // "20 dBm against −14 dBm is 34 dB before anything else"
    expect(20 - UWB_TX_POWER_DBM).toBe(34)
  })

  it('the loudest UWB signal at a Wi-Fi radio is −80.57 dBm: 8.12 dB of noise, 18.57 dB under CCA', () => {
    // "the tag, 3.14 m off" at the router: −21.95 dBm of in-band EIRP minus 58.62 dB of free-space loss
    expect(uwbToWifiPathLossDb(dist(TAG, AP), 0, 5).toFixed(2)).toBe('58.62')
    const loudest = uwbAt(TAG, AP)
    expect(loudest.toFixed(2)).toBe('-80.57')
    expect(cell(1, 4, 2)).toBe('−80.57 dBm')
    // it really is the loudest: every UWB node against both Wi-Fi radios
    const all = [TAG, ...CORNERS.map(([, x, y]) => ({ x, y, z: ANCHOR_Z }))]
      .flatMap((p) => [uwbAt(p, AP), uwbAt(p, LAPTOP)])
    expect(Math.max(...all)).toBe(loudest)
    // "its own noise, 80 MHz wide" → "−87.97 dBm · rise 8.12 dB"
    expect(noiseDbm(WIDTH_MHZ).toFixed(2)).toBe('-87.97')
    expect(noiseRiseDb(loudest).toFixed(2)).toBe('8.12')
    expect(cell(1, 5, 2)).toBe('−87.97 dBm · rise 8.12 dB')
    // "the energy-detect threshold" → "−62 dBm · 18.57 dB above"
    expect(CCA_ED_DBM).toBe(-62)
    expect((CCA_ED_DBM - loudest).toFixed(2)).toBe('18.57')
    expect(cell(1, 6, 2)).toBe('−62 dBm · 18.57 dB above')
    // deeper: "the router’s own uplink still holds 26 dB of SINR"
    const rssiUl = 15 - wifiToUwbPathLossDb(dist(LAPTOP, AP), 0)
    expect((rssiUl - (noiseDbm(WIDTH_MHZ) + noiseRiseDb(loudest))).toFixed(0)).toBe('26')
  })

  it('the CCA claim is qualified by distance: the threshold is reachable at 0.37 m, quoted as 40 cm', () => {
    // deeper: "a Wi-Fi radio brought within about 40 cm of a UWB transmitter would trip it. But
    //  the nearest Wi-Fi radio in this room, the router 3.14 m from the phone, is nowhere near that
    //  close". Solving uwbInBandDbm(…) − uwbPl0Db(5) − 10·UWB_PL_EXP·log10(d) = CCA_ED_DBM for d,
    // from the engine's own constants — the same derivation tests/ui/uwb-guide.test.ts makes for
    // the Guide, whose paragraph this lesson is the reference for. Quoted rounded UP to 10 cm.
    const crossoverM = 10 ** (
      (uwbInBandDbm(UWB_TX_POWER_DBM, WIDTH_MHZ) - uwbPl0Db(5) - CCA_ED_DBM) / (10 * UWB_PL_EXP))
    expect(crossoverM.toFixed(2)).toBe('0.37')
    expect(crossoverM).toBeGreaterThan(0.36)
    expect(crossoverM).toBeLessThan(0.40)
    // at that distance the in-band power really is the threshold, and 1 cm inside it is above
    expect(uwbAt({ ...TAG, x: TAG.x + crossoverM }, TAG).toFixed(4)).toBe(CCA_ED_DBM.toFixed(4))
    expect(uwbAt({ ...TAG, x: TAG.x + crossoverM - 0.01 }, TAG)).toBeGreaterThan(CCA_ED_DBM)
    // the lesson carries the cutoff, and does not claim CCA can never trip at all
    expect(proseZh()).toContain('40 cm')
    // the room's own nearest Wi-Fi radio is nowhere near it
    const nearest = Math.min(...[TAG, ...CORNERS.map(([, x, y]) => ({ x, y, z: ANCHOR_Z }))]
      .flatMap((p) => [dist(p, AP), dist(p, LAPTOP)]))
    expect(nearest.toFixed(2)).toBe('3.14')
    expect(nearest).toBeGreaterThan(crossoverM)
  })

  it('and in this room it never fires: the base run’s CCA records are the No-UWB run’s', () => {
    // "carrier sense never calls busy"
    const withUwb = stripSeq(recs().filter((r) => r.type === 'CCA_BUSY' || r.type === 'CCA_IDLE'))
    const without = stripSeq(recs(NO_UWB).filter((r) => r.type === 'CCA_BUSY' || r.type === 'CCA_IDLE'))
    expect(withUwb.length).toBeGreaterThan(100)
    expect(withUwb).toEqual(without)
    // and no CCA_BUSY of either run begins while only a UWB frame is on the air
    const spans = (rs: TLRecord[], ids: (id: string) => boolean) =>
      ofType(rs, 'TX_START').filter((r) => ids(r.node)).map((r) => [r.t, r.t + r.frame.txTimeNs] as const)
    const uwbSpans = spans(recs(), (id) => UWB_IDS.has(id))
    const wifiSpans = spans(recs(), (id) => WIFI_VIDS.includes(id))
    const inside = (t: number, ss: readonly (readonly [number, number])[]) => ss.some(([a, b]) => t >= a && t < b)
    for (const c of ofType(recs(), 'CCA_BUSY')) {
      if (inside(c.t, uwbSpans)) expect(inside(c.t, wifiSpans), `CCA_BUSY at ${c.t}`).toBe(true)
    }
  })

  it('the eight encounters cost the Wi-Fi link nothing: 31.92 dB of SINR where MCS 7 needs 26.99', () => {
    // deeper: "exactly eight UWB frames share the air with a Wi-Fi burst in five seconds, all
    //  eight from anchor-4"
    const spans = (ids: (id: string) => boolean) =>
      ofType(recs(), 'TX_START').filter((r) => ids(r.node))
        .map((r) => ({ id: r.node, a: r.t, b: r.t + r.frame.txTimeNs }))
    const pairs: [string, string][] = []
    for (const u of spans((id) => UWB_IDS.has(id))) {
      for (const w of spans((id) => WIFI_VIDS.includes(id))) {
        if (u.a < w.b && w.a < u.b) pairs.push([u.id, w.id])
      }
    }
    expect(pairs).toHaveLength(8)
    expect([...new Set(pairs.map(([u, w]) => `${u}|${w}`))]).toEqual(['anchor-4|laptop#6g'])
    // "8.16 m from the router, arriving at −88.87 dBm and lifting the noise 2.58 dB"
    expect(dist({ x: 9.5, y: 7.5, z: ANCHOR_Z }, AP).toFixed(2)).toBe('8.16')
    const atAp = uwbAt({ x: 9.5, y: 7.5, z: ANCHOR_Z }, AP)
    expect(atAp.toFixed(2)).toBe('-88.87')
    expect(noiseRiseDb(atAp).toFixed(2)).toBe('2.58')
    // "The laptop’s uplink comes in at −53.46 dBm, leaving 31.92 dB of SINR where its MCS 7
    //  needs 26.99"
    const rssiUl = 15 - wifiToUwbPathLossDb(dist(LAPTOP, AP), 0)
    expect(rssiUl.toFixed(2)).toBe('-53.46')
    expect((rssiUl - (noiseDbm(WIDTH_MHZ) + noiseRiseDb(atAp))).toFixed(2)).toBe('31.92')
    expect(reqSinrDb('eht', 7).toFixed(2)).toBe('26.99')
    // MCS 7 is what the laptop actually sends, on every data PPDU of the run
    const mcs = new Set(ofType(recs(), 'TX_START')
      .filter((r) => r.node === 'laptop#6g' && r.frame.kind === 'data').map((r) => r.frame.mcs))
    expect(mcs).toEqual(new Set([7]))
    // "All eight decode": no Wi-Fi reception fails anywhere in the run
    expect(ofType(recs(), 'RX_FAIL').filter((r) => !UWB_IDS.has(r.node))).toHaveLength(0)
  })

  it('the Wi-Fi side is identical but for the shared sequence number, with and without the session', () => {
    // deeper: "its record stream is identical to a run with no UWB nodes in every field but the
    //  shared sequence number — 9.960 Mb/s either way"
    expect(wifiSide(recs())).toEqual(wifiSide(recs(NO_UWB)))
    expect(wifiSide(recs()).length).toBeGreaterThan(10_000)
    // the exception is real and is exactly one field: `seq` counts both technologies' records, so
    // the base run's Wi-Fi records carry higher numbers than the No-UWB run's
    const seqs = (rs: TLRecord[]) => rs.filter((r) => !isUwbSide(r)).map((r) => (r as { seq: number }).seq)
    expect(seqs(recs())).not.toEqual(seqs(recs(NO_UWB)))
    expect(mbps(recs(), 'laptop#6g').toFixed(3)).toBe('9.960')
    expect(mbps(recs(NO_UWB), 'laptop#6g').toFixed(3)).toBe('9.960')
  })
})

describe('uwb-coexist · the base run', () => {
  it('twenty-five blocks in five seconds, Wi-Fi on the air 3.07 % of it and UWB 48.6 ms', () => {
    // "Five seconds, twenty-five blocks" / the table's "3.07 %"
    expect(fixes()).toHaveLength(BLOCKS)
    expect(ofType(recs(), 'UWB_ROUND_END')).toHaveLength(BLOCKS)
    expect(wifiAirPct().toFixed(2)).toBe('3.07')
    expect(cell(2, 0, 1)).toBe('3.07 %')
    // deeper: "The whole session is on the air for 48.6 ms of the five seconds", and its own
    // share is 0.97 % — a number the lesson prints exactly once, for the saturated run's cost
    expect(uwbAirPct().toFixed(2)).toBe('0.97')
    expect((airNs(recs(), (id) => UWB_IDS.has(id)) / 1e6).toFixed(1)).toBe('48.6')
    expect(prose().match(/0\.97 %/g)).toHaveLength(1)
  })

  it('eight frames are lost, one every third block, all the tag losing anchor-4 at −30.81 dB', () => {
    // "The backup run loses one ranging frame every third block, always the tag losing the far
    //  anchor’s report, and the slot times out 1.8 ms later."
    const hit = interfered()
    expect(hit).toHaveLength(8)
    expect(cell(2, 0, 2)).toBe(String(hit.length))
    expect([...new Set(hit.map((r) => `${r.node}|${r.from}`))]).toEqual(['uwb-1|anchor-4'])
    for (const r of hit) {
      expect(r.sirDb.toFixed(2)).toBe('-30.81')
      expect(r.foreignDbm.toFixed(2)).toBe('-48.67')
      expect(r.sirDb).toBeLessThan(UWB_SIR_MIN_DB)
    }
    // the eight are 600 ms apart — the backup's own burst period, as observe 1 says
    const gaps = hit.slice(1).map((r, i) => r.t - hit[i].t)
    expect(new Set(gaps)).toEqual(new Set([600 * MS]))
    // every third block loses one, counted off the blocks with a three-anchor fix
    expect(fixes().filter((f) => f.anchors.length === 3).map((f) => f.block))
      .toEqual([2, 5, 8, 11, 14, 17, 20, 23])
    // the loss is a lowSinr RX_FAIL at the tag, and the slot times out 1.809 ms later
    const fails = ofType(recs(), 'RX_FAIL')
    expect(fails).toHaveLength(8)
    for (const f of fails) expect([f.node, f.reason]).toEqual(['uwb-1', 'lowSinr'])
    const timeouts = ofType(recs(), 'UWB_TIMEOUT')
    expect(timeouts).toHaveLength(8)
    for (const [i, t] of timeouts.entries()) expect(t.t - hit[i].t).toBe(1_808_502)
  })

  it('92 of 100 ranges survive and all 25 fixes are made, eight of them on three anchors', () => {
    // "Eight ranges of a hundred go — yet all twenty-five fixes are made, eight on three anchors,
    //  the error still inside 4.2 cm"
    expect(tagRanges()).toHaveLength(92)
    expect(tagRanges(CH9)).toHaveLength(100)
    expect(cell(2, 0, 3)).toBe('92 / 100')
    expect(cell(2, 0, 4)).toBe('25')
    const three = fixes().filter((f) => f.anchors.length === 3)
    expect(three).toHaveLength(8)
    expect(fixes().filter((f) => f.anchors.length === 4)).toHaveLength(17)
    for (const f of three) {
      expect(f.anchors, `block ${f.block}`).not.toContain('anchor-4')
      expect(f.gdop.toFixed(2), `block ${f.block}`).toBe('1.26')
    }
    for (const f of fixes().filter((f) => f.anchors.length === 4)) expect(f.gdop.toFixed(2)).toBe('1.05')
    const cm = fixes().map((f) => fixErr(f) * 100)
    expect([Math.min(...cm).toFixed(1), Math.max(...cm).toFixed(1)]).toEqual(['0.1', '4.2'])
    // quiz 2: "GDOP rises from 1.05 to 1.26"
    // the channel-9 run is the clean reference
    const clean = fixes(CH9).map((f) => fixErr(f) * 100)
    expect([Math.min(...clean).toFixed(1), Math.max(...clean).toFixed(1)]).toEqual(['0.3', '3.5'])
    expect(fixes(CH9).every((f) => f.anchors.length === 4)).toBe(true)
  })

  it('the log lines and the inspector rows are the ones the lesson quotes', () => {
    // observe 1, word for word
    const line = 'uwb-1 UWB frame from anchor-4 lost to Wi-Fi: SIR -30.8 dB (foreign -48.7 dBm)'
    expect(fmtRecord(interfered()[0])).toBe(line)
    expect(uwbCoexist.observe[0]).toContain(line)
    expect((interfered()[0].t / 1e6).toFixed(3)).toBe('418.191')
    expect(uwbCoexist.observe[0]).toContain('418.191')
    // the two position lines of the deeper table
    expect(fmtRecord(fixes()[0])).toBe(deepCell(1, 0, 1))
    expect(deepCell(1, 0, 1))
      .toBe('uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors')
    expect(fmtRecord(fixes()[2])).toBe(deepCell(1, 1, 1))
    expect(deepCell(1, 1, 1))
      .toBe('uwb-1 position (4.01, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.26, 3 anchors')
    // observe 2: the tag's row reaches 8 and every anchor's stays 0
    expect(uwbCoexist.observe[1]).toContain(STRINGS.uwb.interfered)
    const tag = inspectorAfter(undefined, 'uwb-1')
    expect([tag.interfered, tag.timeouts]).toEqual([8, 8])
    for (const [id] of CORNERS) expect(inspectorAfter(undefined, id).interfered, id).toBe(0)
  })
})

describe('uwb-coexist · the variants', () => {
  it('a mediator exists only where the two bands actually meet', () => {
    expect(new Simulation(uwbCoexist.scenario()).spectrum).not.toBeNull()
    expect(new Simulation(scenarioOf(SAT)).spectrum).not.toBeNull()
    for (const v of [CH9, WIFI7, NO_UWB]) expect(new Simulation(scenarioOf(v)).spectrum, String(v)).toBeNull()
  })

  it('channel 9 and Wi-Fi channel 7 lose nothing, and their ranging records are the same records', () => {
    // try-this 1: "The ranging records become those of the channel-9 run to the last field, and
    //  the Wi-Fi side does not move"
    for (const v of [CH9, WIFI7]) {
      expect(interfered(v), String(v)).toEqual([])
      expect(tagRanges(v), String(v)).toHaveLength(100)
      expect(fixes(v), String(v)).toHaveLength(BLOCKS)
      expect(ofType(recs(v), 'UWB_TIMEOUT'), String(v)).toHaveLength(0)
      expect(cell(2, v + 1, 2), String(v)).toBe('0')
      expect(cell(2, v + 1, 3), String(v)).toBe('100 / 100')
    }
    // "to the last field" / deeper's "the session produces exactly the records it produces on
    // channel 9": here the two runs emit the same records in the same order, so `seq` is compared
    // too and the claim is literal — unlike the base-vs-No-UWB pair, where `seq` must differ.
    const uwbRaw = (rs: TLRecord[]) => rs.filter(isUwbSide)
    expect(uwbRaw(recs(WIFI7))).toEqual(uwbRaw(recs(CH9)))
    expect(uwbRaw(recs(CH9)).length).toBeGreaterThan(1000)
    expect(wifiSide(recs(CH9))).toEqual(wifiSide(recs(WIFI7)))
    expect(wifiSide(recs(CH9))).toEqual(wifiSide(recs()))
  })

  it('the saturated upload takes 91.28 % of the air and every ranging frame with it', () => {
    // "Every ranging frame meets a burst, 200 are lost in five seconds, and not one position is
    //  solved."
    expect(wifiAirPct(SAT).toFixed(2)).toBe('91.28')
    expect(cell(2, 3, 1)).toBe('91.28 %')
    expect(interfered(SAT)).toHaveLength(200)
    expect(interfered(SAT).length / SEC).toBe(40)
    expect(ofType(recs(SAT), 'UWB_TIMEOUT')).toHaveLength(400)
    expect(tagRanges(SAT)).toHaveLength(0)
    expect(fixes(SAT)).toHaveLength(0)
    expect(ofType(recs(SAT), 'UWB_ROUND_END')).toHaveLength(BLOCKS)
    expect([cell(2, 3, 2), cell(2, 3, 3), cell(2, 3, 4)]).toEqual(['200', '0 / 100', '0'])
    // every one of the 200 is an anchor losing the tag's frame, 50 per anchor
    const per: Record<string, number> = {}
    for (const r of interfered(SAT)) {
      expect(r.from).toBe('uwb-1')
      per[r.node] = (per[r.node] ?? 0) + 1
    }
    expect(per).toEqual({ 'anchor-1': 50, 'anchor-2': 50, 'anchor-3': 50, 'anchor-4': 50 })
  })

  it('and it costs the Wi-Fi link 0.97 %: 274.128 Mb/s against 276.816 with the session removed', () => {
    // "throughput falls from 276.816 to 274.128 Mb/s — but that is 0.97 %"
    // the reference scene is the saturated one with the whole session removed — the nodes AND the
    // `uwb` block, so it is a legal scenario rather than one carrying an orphan session
    const { uwb: _session, ...sat } = scenarioOf(SAT)
    const alone: Scenario = { ...sat, nodes: sat.nodes.filter((n) => n.kind !== 'uwb') }
    expect(alone.uwb).toBeUndefined()
    expect(() => ScenarioSchema.parse(alone)).not.toThrow()
    expect(alone.nodes.map((n) => n.id)).toEqual(scenarioOf(NO_UWB).nodes.map((n) => n.id))
    const without = [...new Simulation(alone).runUntil(RUN_NS).records]
    const a = mbps(recs(SAT), 'laptop#6g')
    const b = mbps(without, 'laptop#6g')
    expect(a.toFixed(3)).toBe('274.128')
    expect(b.toFixed(3)).toBe('276.816')
    expect(((b - a) / b * 100).toFixed(2)).toBe('0.97')
    expect(ofType(recs(SAT), 'RX_FAIL').filter((r) => !UWB_IDS.has(r.node))).toHaveLength(50)
    expect(ofType(without, 'RX_FAIL').filter((r) => !UWB_IDS.has(r.node))).toHaveLength(0)
  })
})

describe('uwb-coexist · the three cures', () => {
  it('no spot in the room puts the laptop far enough away: 7.50 m against the 11.09 m needed', () => {
    // the cures table, row 0: "Laptop to the far corner, 7.50 m" / "foreign −59.15 dBm · best
    //  SIR −17.10 dB" / "no — it would take 11.09 m, or 14.21 m for the farthest anchor"
    const room = uwbCoexist.scenario().rooms[0]
    let far = 0
    for (let x = 0; x <= room.w + 1e-9; x += 0.05) {
      for (let y = 0; y <= room.h + 1e-9; y += 0.05) {
        far = Math.max(far, dist({ x, y, z: LAPTOP.z }, TAG))
      }
    }
    expect(far.toFixed(2)).toBe('7.50')
    expect(deepCell(0, 0, 0)).toContain('7.50 m')
    const foreign = 15 + 10 * Math.log10(uwbBandOverlap(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)) - wifiToUwbPathLossDb(far, 0)
    expect(foreign.toFixed(2)).toBe('-59.15')
    const best = Math.max(...CORNERS.map(([, x, y]) => anchorAtTag(x, y))) - foreign
    expect(best.toFixed(2)).toBe('-17.10')
    expect(best).toBeLessThan(UWB_SIR_MIN_DB)
    for (const x of ['−59.15', '−17.10']) expect(deepCell(0, 0, 1), x).toContain(x)
    // "11.09 m, or 14.21 m for the farthest anchor"
    const needed = (rssi: number): number => {
      // solve 15 + 0 dB of share − (47.9 + 30·log10 d) = rssi − UWB_SIR_MIN_DB
      let lo = 0.1, hi = 1000
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2
        const f = 15 - wifiToUwbPathLossDb(mid, 0)
        if (rssi - f < UWB_SIR_MIN_DB) lo = mid; else hi = mid
      }
      return hi
    }
    expect(needed(anchorAtTag(0.5, 0.5)).toFixed(2)).toBe('11.09')
    expect(needed(anchorAtTag(9.5, 7.5)).toFixed(2)).toBe('14.21')
    for (const x of ['11.09', '14.21']) expect(deepCell(0, 0, 2), x).toContain(x)
    expect(far).toBeLessThan(needed(anchorAtTag(0.5, 0.5)))
  })

  it('31 % of overlap is worth 5.05 dB and changes nothing; zero overlap stops the losses dead', () => {
    // the cures table, row 1: "Wi-Fi centre to 6225 MHz, channel 55" / "25 of 80 MHz · 31 % ·
    //  5.05 dB" / "no — SIR −25.76 dB, the same eight losses"
    const PARTIAL = 6225
    expect(deepCell(0, 1, 0)).toContain('6225 MHz')
    expect(sixGhzChannelNo(PARTIAL)).toBe(55)
    expect(uwbBandOverlapMhz(PARTIAL, WIDTH_MHZ, 5)).toBe(25)
    expect((uwbBandOverlap(PARTIAL, WIDTH_MHZ, 5) * 100).toFixed(0)).toBe('31')
    const shareDb = 10 * Math.log10(uwbBandOverlap(PARTIAL, WIDTH_MHZ, 5))
    expect(shareDb.toFixed(2)).toBe('-5.05')
    for (const x of ['25', '80 MHz', '31 %', '5.05 dB']) expect(deepCell(0, 1, 1), x).toContain(x)
    const partial = [...new Simulation({ ...uwbCoexist.scenario(), sixGhzCenterMhz: PARTIAL }).runUntil(RUN_NS).records]
    const hit = ofType(partial, 'UWB_INTERFERED')
    expect(hit).toHaveLength(8)
    for (const r of hit) expect(r.sirDb.toFixed(2)).toBe('-25.76')
    expect((hit[0].sirDb - interfered()[0].sirDb).toFixed(2)).toBe((-shareDb).toFixed(2))
    expect(ofType(partial, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')).toHaveLength(92)
    expect(deepCell(0, 1, 2)).toContain('−25.76')
    // row 2: "Wi-Fi centre to 6185 MHz, channel 47" / "0 MHz overlap" / "yes — the losses stop dead"
    const CLEAR = 6185
    expect(deepCell(0, 2, 0)).toContain('6185 MHz')
    expect(sixGhzChannelNo(CLEAR)).toBe(47)
    expect(uwbBandOverlapMhz(CLEAR, WIDTH_MHZ, 5)).toBe(0)
    const clear = [...new Simulation({ ...uwbCoexist.scenario(), sixGhzCenterMhz: CLEAR }).runUntil(RUN_NS).records]
    expect(ofType(clear, 'UWB_INTERFERED')).toEqual([])
    expect(ofType(clear, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')).toHaveLength(100)
  })
})

/**
 * The 2026-09-23 amendment ("mechanism before metaphor"): the lesson writes the
 * sharing out as a procedure, and each step is graded against the mediator and the
 * UWB channel — `bandOverlapMhz`, the in-band arithmetic, `UWB_SIR_MIN_DB`,
 * `CCA_ED_DBM` — rather than against the old prose. The worked example is the
 * first loss of the base run, at 418.191 ms, value by value.
 */
describe('uwb-coexist · the procedure, against the mediator', () => {
  const steps = (): Extract<Block, { kind: 'steps' }> =>
    uwbCoexist.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
  const stepsText = (): string => steps().items.map((i) => i).join('\n')
  const firstLoss = () => interfered()[0]
  /** A fixed-point string with the typographic minus the lesson prints. */
  const mn = (x: string): string => x.replace('-', '−')

  it('is a steps block on the main path, not in `deeper`', () => {
    expect(uwbCoexist.numbers!.some((b) => b.kind === 'steps')).toBe(true)
    expect((uwbCoexist.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
    expect(steps().items.length).toBeGreaterThanOrEqual(3)
  })

  it('step 2: the band the phone reads the foreign power over is UWB channel 5’s own', () => {
    // "over its own 6240.0 to 6739.2 MHz"
    expect(UWB_BAND_MHZ[5].lo.toFixed(1)).toBe('6240.0')
    expect(UWB_BAND_MHZ[5].hi.toFixed(1)).toBe('6739.2')
    // the Wi-Fi channel lies wholly inside it, so the overlap is its whole width
    expect(uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)).toBe(WIDTH_MHZ)
  })

  it('step 3: the worked example’s foreign level is the laptop’s, through the mediator’s own arithmetic', () => {
    // "its power plus ten times the log of overlapping width over its own width, less its path
    //  loss at that distance and the walls between" — rebuilt here, and equal to the record's
    const f = firstLoss()
    expect(cell(3, 1, 1)).toBe(`${mn(f.foreignDbm.toFixed(2))} dBm`)
    const laptopEirp = uwbCoexistScenario().nodes.find((n) => n.id === 'laptop')!.txPowerDbm
    expect(wifiAt(LAPTOP, laptopEirp, TAG)).toBeCloseTo(f.foreignDbm, 6)
    // and it is the laptop, not the router: the router's own level is a different number
    expect(wifiAt(AP, laptopEirp, TAG)).not.toBeCloseTo(f.foreignDbm, 2)
  })

  it('step 4: SIR is the frame’s own level minus that, against the engine’s −12 dB floor', () => {
    const f = firstLoss()
    const rssi = anchorAtTag(9.5, 7.5)
    expect(f.from).toBe('anchor-4')
    expect(cell(3, 0, 1)).toBe(`${mn(rssi.toFixed(2))} dBm`)
    expect(cell(3, 2, 1)).toBe(`${mn(rssi.toFixed(2))} − (${mn(f.foreignDbm.toFixed(2))}) = ${mn(f.sirDb.toFixed(2))} dB`)
    expect(rssi - f.foreignDbm).toBeCloseTo(f.sirDb, 6)
    // "At or above −12 dB it decodes; below, it is lost" — the floor is the engine's constant,
    // and every loss in the run is under it
    expect(stepsText()).toContain('−12 dB')
    expect(UWB_SIR_MIN_DB).toBe(-12)
    for (const r of interfered()) expect(r.sirDb).toBeLessThan(UWB_SIR_MIN_DB)
    // Review M8: the step had only the hard branch. The same foreign level also enters the
    // timestamp draw (src/uwb/device.ts -> uwbSinrDb -> tsSigmaNs), so a frame that survives
    // is stamped at a wider sigma than the same frame in a quiet room.
    const quiet = tsSigmaNs(100, uwbSinrDb(-85, -Infinity))
    const loud = tsSigmaNs(100, uwbSinrDb(-85, -80))
    expect(loud).toBeGreaterThan(quiet)
  })

  it('step 5: each loss is an RX_FAIL, a UWB_INTERFERED and then a timeout, in that order', () => {
    expect(cell(3, 3, 1)).toBe('RX_FAIL · UWB_INTERFERED · UWB_TIMEOUT')
    const rs = recs()
    const f = firstLoss()
    const i = rs.indexOf(f)
    const before = rs[i - 1]
    expect(before.type).toBe('RX_FAIL')
    expect((before as Extract<TLRecord, { type: 'RX_FAIL' }>).reason).toBe('lowSinr')
    expect((before as Extract<TLRecord, { type: 'RX_FAIL' }>).node).toBe('uwb-1')
    // the slot the answer should have filled then times out, naming the same anchor
    const to = ofType(rs, 'UWB_TIMEOUT').find((r) => r.t > f.t)!
    expect(to.peer).toBe(f.from)
    expect(to.node).toBe('uwb-1')
    // one timeout per loss over the whole run
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(interfered().length)
    // "Nothing is retried inside the block": the anchor answers once a block and no more
    const lostBlock = fixes().find((p2) => p2.t > f.t)!.block
    expect(tagRanges().filter((r) => r.peer === 'anchor-4' && r.block === lostBlock)).toHaveLength(0)
  })

  it('step 6: the block still fixes, on three anchors, and the table says so', () => {
    const f = firstLoss()
    const after = fixes().find((p) => p.t > f.t)!
    expect(after.anchors).toHaveLength(3)
    expect(after.anchors).not.toContain('anchor-4')
    expect(cell(3, 4, 1)).toBe(`GDOP ${after.gdop.toFixed(2)}, ${after.anchors.length} anchors`)
    expect(fmtRecord(after)).toContain(`GDOP ${after.gdop.toFixed(2)}, 3 anchors`)
    // every block of the run still produces one
    expect(fixes()).toHaveLength(BLOCKS)
  })

  it('step 7: the other direction stops at the noise — nothing reaches the energy-detect threshold', () => {
    // "the loudest one here sits 18.57 dB under the energy-detect threshold of −62 dBm"
    const loudest = Math.max(...[TAG, ...CORNERS.map(([, x, y]) => ({ x, y, z: ANCHOR_Z }))]
      .flatMap((p) => [uwbAt(p, AP), uwbAt(p, LAPTOP)]))
    expect(CCA_ED_DBM).toBe(-62)
    expect((CCA_ED_DBM - loudest).toFixed(2)).toBe('18.57')
    // and the run bears it out: the Wi-Fi side's records are the no-UWB run's, field for field
    expect(wifiSide(recs())).toEqual(wifiSide(recs(NO_UWB)))
  })

  it('step 8: the boundary — only power crosses, and it crosses both ways', () => {
    // the UWB side never emits a Wi-Fi record and vice versa: no shared MAC state at all
    const uwbTypes = new Set(recs().filter(isUwbSide).map((r) => r.type))
    expect(uwbTypes.has('CCA_BUSY')).toBe(false)
    // and with the bands disjoint the mediator is never built: the ranging side is the
    // channel-9 run's, so nothing but the overlap ever did anything
    expect(interfered(WIFI7)).toEqual([])
    expect(interfered(CH9)).toEqual([])
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The tables of this lesson are read cell by cell above — against literals typed HERE.** That
 * does catch an edit to a cell (the comparison is `toBe('6240.0 to 6739.2 MHz')`, so the cell is
 * the received value), but it leaves every figure in the prose around them free: the sweep of
 * 2026-10-13 could edit **109 of this lesson's 184** figures with the suite green, three of them
 * without an equal literal anywhere under `tests/`.
 *
 * Nothing new is measured below. Every assertion calls the same `wifiAt`, `uwbAt`, `anchorAtTag`,
 * `noiseRiseDb`, `uwbBandOverlapMhz`, `recs` the tests above call, and the figure comes out of
 * the prose instead of out of this file.
 */
describe('uwb-coexist · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uwbCoexist).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const nums = (uwbCoexist.numbers ?? []).map(blockText).join('\n')
  const deep = (uwbCoexist.deeper ?? []).map(blockText).join('\n')
  const limitsText = (uwbCoexist.limits ?? []).map((l) => l.text).join('\n')
  const srcText = (uwbCoexist.sources ?? []).join('\n')
  const obs = uwbCoexist.observe.join('\n')
  const trys = uwbCoexist.tryThis.join('\n')
  const quizText = uwbCoexist.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  const SESSION = uwbCoexistScenario().uwb!
  const UWB_CH = SESSION.channel
  const CH9_CH = uwbCoexistScenario('ch9').uwb!.channel

  it('every channel number the lesson names, and the band each one occupies', () => {
    // 「本会话所用的 UWB 5 号」/「会话默认的 UWB 9 号」 — the row labels of the channel table
    for (const v of everyFig(/UWB (\d) 号/g, 'a UWB channel the prose names', 3)) {
      expect([UWB_CH, CH9_CH], `UWB channel ${v} is one this lesson runs`).toContain(val(v))
    }
    // 「UWB 9 号信道占据 7737.6 至 8236.8 MHz」
    const [ch, lo, hi] = figs(deep, /UWB (\d) 号信道占据 ([\d.]+) 至 ([\d.]+) MHz/,
      '`deeper` on where channel 9 sits')
    expect(ch, 'the channel the session falls back to').toBe(CH9_CH)
    expect(UWB_BAND_MHZ[ch as 5 | 9], 'the band `phy.ts` gives it')
      .toEqual({ lo, hi })
    // 「一帧测距帧的功率摊在 499.2 MHz 上，进到 80 MHz 接收机里的只有 80 MHz——先丢掉 7.95 dB」
    const [own, rx, overlap, lost] = raw(nums,
      /功率摊在 ([\d.]+) MHz 上，进到 (\d+) MHz 接收机里的只有 (\d+) MHz——路径损耗（path loss）还没开始，就先丢掉 ([\d.]+) dB/,
      '`numbers` on what an overlap costs a ranging frame')
    const band = UWB_BAND_MHZ[UWB_CH as 5 | 9]
    same(own!, band.hi - band.lo, 'the width a ranging frame spreads over')
    expect(val(rx!), 'the receiver’s own width').toBe(WIDTH_MHZ)
    expect(val(overlap!), 'and the part of the frame that lands in it')
      .toBe(uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))
    const inBand = uwbInBandDbm(UWB_TX_POWER_DBM, uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))
    same(lost!, UWB_TX_POWER_DBM - inBand, 'what it loses before the path loss starts')
    // 「中介每报一次变动，手机就在自己的 6240.0 至 6739.2 MHz 上重读外来功率」
    const [sLo, sHi] = figs(nums, /手机就在自己的 ([\d.]+) 至 ([\d.]+) MHz 上重读外来功率/,
      'the steps on the band the tag reads over')
    expect({ lo: sLo, hi: sHi }, 'which is its own channel’s band')
      .toEqual(UWB_BAND_MHZ[UWB_CH as 5 | 9])
    // 「把它挪进 6 GHz 路由器工作的那条信道」 and the title — the band the Wi-Fi link is on
    for (const v of everyFig(/(\d) GHz/g, 'the band this lesson shares', 5)) {
      expect(linkPlanFor(uwbCoexistScenario().nodes).links, `${v} GHz is the band these radios share`)
        .toContain(`${v}g`)
    }
    // 「Wi-Fi 使用 7 号信道（5 985 MHz）」 — the variant's own label, and the channel it ships
    const [chNo, mhz] = figs(uwbCoexist.variants![WIFI7]!.label, /(\d) 号信道（([\d\s]+) MHz）/,
      'the variant label')
    expect(mhz, 'the centre that variant ships')
      .toBe(uwbCoexistScenario('wifi7').sixGhzCenterMhz)
    expect(chNo, 'and the channel number that centre is').toBe(sixGhzChannelNo(mhz!))
    // and every other 「N 号信道」 of the prose is a channel number of its own centre
    const pairs = [...EVERYWHERE.matchAll(/中心挪到 (\d+) MHz，(\d+) 号信道/g)]
      .map((m) => [val(m[1]!), val(m[2]!)] as const)
    expect(pairs.length, '`deeper` names two more of them').toBeGreaterThanOrEqual(2)
    for (const [centre, no] of pairs) {
      expect(no, `${centre} MHz is channel ${no}`).toBe(sixGhzChannelNo(centre))
    }
  })

  it('the level ledger’s own distances and the three decibels the prose takes from it', () => {
    // 「路由器，相距 3.14 m」「笔记本，相距 3.35 m」「手机，相距 3.14 m」
    for (const v of everyFig(/相距 ([\d.]+) m/g, 'a distance the ledger prints', 3)) {
      const m = val(v)
      expect([dist(AP, TAG), dist(LAPTOP, TAG)].map((d) => Number(d.toFixed(2))),
        `${m} m is a distance of this scene`).toContain(m)
    }
    // 「对上笔记本，最弱的那个锚点离可解调的程度还差 18.8 dB」
    const [short] = raw(nums, /最弱的那个锚点离可解调的程度还差 ([\d.]+) dB/,
      '`numbers` on how far the weakest anchor is from being decodable')
    /*
     * The laptop is a WI-FI transmitter, so what it is worth at the tag comes from `wifiAt` and
     * its own EIRP — read off the ledger's own cell rather than named here, which is what makes
     * this a read-back of the sentence and not a second typing of 15 dBm.
     */
    const weakest = Math.min(...CORNERS.map(([, x, y]) => anchorAtTag(x, y)))
    const [laptopCell] = raw(cell(1, 1, 2), /(−[\d.]+) dBm/, 'the ledger’s own laptop cell')
    const laptop = val(laptopCell!)
    const sir = weakest - laptop
    same(short!, UWB_SIR_MIN_DB - sir,
      'the weakest anchor against the laptop, and the floor it would need')
    expect(sir, 'which really is under the floor').toBeLessThan(UWB_SIR_MIN_DB)
    // 「这里没有哪一帧能达到 −62 dBm 这条能量检测门限的 18.57 dB 以内」
    const [ed, within] = raw(nums,
      /没有哪一帧能达到 (−\d+) dBm 这条能量检测门限（energy detection threshold）的 ([\d.]+) dB 以内/,
      'the steps on the other direction')
    expect(val(ed!), 'the threshold `phy.ts` exports').toBe(CCA_ED_DBM)
    same(within!, Math.abs(uwbAt(TAG, AP) - CCA_ED_DBM), 'and how far under it the loudest frame is')
    // 「低于 −12 dB 门限」 — the SIR floor, wherever it appears
    // `dB(?!m)`: without it, 「达到 −62 dBm」 matches too — dB is a prefix of dBm
    for (const v of everyFig(/(−\d+) dB(?!m) 门限|达到 (−\d+) dB(?!m)|(−\d+) dB(?!m) 这条线/g,
      'the SIR floor', 3)) {
      expect(val(v), 'the floor `phy.ts` exports').toBe(UWB_SIR_MIN_DB)
    }
  })

  it('the five seconds: the losses, the timeout, the error and the margin', () => {
    const rs = recs()
    // 「备份那次运行每三个块丢一帧测距帧……而 1.8 ms 之后那个时隙超时」
    const [timeoutMs] = raw(nums, /而 ([\d.]+) ms 之后那个时隙超时/,
      '`numbers` on when the slot times out')
    const lost = interfered()[0]!
    const out = ofType(rs, 'UWB_TIMEOUT').find((r) => r.t > lost.t)!
    same(timeoutMs!, (out.t - lost.t) / MS, 'the gap between the loss and the timeout')
    // 「一百次测距丢了八次——可二十五次定位一次也没少，其中八次只用三个锚点，误差依然在 4.2 cm 以内」
    const [err] = raw(nums, /误差依然在 ([\d.]+) cm 以内/, '`numbers` on the error of the three-anchor fixes')
    const three = fixes().filter((f) => f.anchors.length === 3)
    expect(three.length, 'the run really makes three-anchor fixes').toBeGreaterThan(0)
    expect(Math.max(...three.map(fixErr)) * 100, 'every one of them inside that')
      .toBeLessThanOrEqual(val(err!))
    expect(Math.ceil(Math.max(...three.map(fixErr)) * 1000) / 10,
      'and that is the figure rounded up to the millimetre').toBe(val(err!))
    // 「五秒里丢掉 200 帧，一次定位也解不出来」 — the saturated variant
    const [sat] = figs(deep, /五秒里丢掉 (\d+) 帧，一次定位也解不出来/,
      '`deeper` on the saturated upload')
    expect(sat, 'the ranging frames the saturated run loses').toBe(interfered(SAT).length)
    expect(fixes(SAT), 'and it makes no fix at all').toHaveLength(0)
    // 「吞吐从 276.816 Mb/s 掉到 274.128 Mb/s——但那只是 0.97 %」
    const [was, now, pct] = raw(deep,
      /吞吐从 ([\d.]+) Mb\/s 掉到 ([\d.]+) Mb\/s——但那只是 ([\d.]+) %/,
      '`deeper` on what the saturated run costs the Wi-Fi')
    expect(val(now!), 'the lower of the two is the run with the session')
      .toBeLessThan(val(was!))
    same(pct!, 100 * (1 - val(now!) / val(was!)), 'and the share between them is its own arithmetic')
    // 「两边都是 9.960 Mb/s」
    const [both] = raw(deep, /两边都是 ([\d.]+) Mb\/s/, '`deeper` on the backup’s own goodput')
    expect(val(both!), 'a goodput the prose states for both runs').toBeGreaterThan(0)
  })

  it('`deeper`: channel 9’s headroom, and the 40 cm the threshold is reachable at', () => {
    // 「6 GHz 的 Wi-Fi 频段到 7125 MHz 为止；即便用编辑器允许的最高中心频率 7115 MHz 开一条
    //  320 MHz 的信道，其上边沿也只到 7275 MHz——距 9 号信道的下边沿还有 462.6 MHz 的净空」
    const [bandTop, top, width, edge, clear] = figs(deep,
      /频段到 (\d+) MHz 为止；即便用编辑器允许的最高中心频率 (\d+) MHz 开一条 (\d+) MHz 的信道，其上边沿也只到 (\d+) MHz——距 9 号信道的下边沿还有 ([\d.]+) MHz 的净空/,
      '`deeper` on the clear air above channel 9')
    expect(() => ScenarioSchema.parse({ ...uwbCoexist.scenario(), sixGhzCenterMhz: top }),
      'that centre is the highest the schema takes').not.toThrow()
    expect(() => ScenarioSchema.parse({ ...uwbCoexist.scenario(), sixGhzCenterMhz: top! + 5 }))
      .toThrow()
    expect(top! + width! / 2, 'the upper edge that centre and that width reach').toBe(edge)
    same(String(clear), UWB_BAND_MHZ[CH9_CH as 5 | 9].lo - edge!, 'and the gap to channel 9')
    expect(bandTop, 'while the band itself stops below that edge').toBeLessThan(edge!)
    for (const w of [20, 40, 80, 160, width!]) {
      expect(uwbBandOverlapMhz(top!, w, CH9_CH as 5 | 9), `${w} MHz at that centre still misses it`)
        .toBe(0)
    }
    // 「把一帧测距帧的带内电平与 −62 dBm 的能量检测门限解一个等式，交叉点落在 0.37 m，正文里
    //  向上取整到十厘米：把一台 Wi-Fi 收发机放到离 UWB 发射机约 40 cm 以内」
    const [edDbm, cross, cm] = raw(deep,
      /与 (−\d+) dBm 的能量检测门限解一个等式，交叉点落在 ([\d.]+) m，正文里向上取整到十厘米：把一台 Wi-Fi 收发机放到离 UWB 发射机约 (\d+) cm 以内/,
      '`deeper` on where the threshold is reachable')
    expect(val(edDbm!), 'the threshold').toBe(CCA_ED_DBM)
    const inBand = uwbInBandDbm(UWB_TX_POWER_DBM, uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))
    const solve = (): number => {
      let lo = 0.01, hi = 100
      for (let i = 0; i < 200; i++) {
        const m = (lo + hi) / 2
        if (inBand - uwbToWifiPathLossDb(m, 0, 5) >= CCA_ED_DBM) lo = m
        else hi = m
      }
      return lo
    }
    same(cross!, solve(), 'the distance that equation crosses at')
    expect(Math.ceil(solve() * 10) * 10, 'and the ten-centimetre figure the prose rounds it up to')
      .toBe(val(cm!))
    // 「离手机 3.14 m 的路由器——远远没有那么近。即使在手机造成的 8.12 dB 噪声抬升之下，路由器
    //  自己的上行仍然保有 26 dB 的信干噪比」
    const [away, rise, sinr] = raw(deep,
      /离手机 ([\d.]+) m 的路由器——远远没有那么近。即使在手机造成的 ([\d.]+) dB 噪声抬升之下，路由器自己的上行仍然保有 (\d+) dB 的信干噪比/,
      '`deeper` on the router’s own margin')
    same(away!, dist(AP, TAG), 'how far the router is from the tag')
    same(rise!, noiseRiseDb(uwbAt(TAG, AP)), 'the noise rise the tag causes there')
    expect(val(sinr!), 'and the SINR the uplink keeps').toBeGreaterThan(0)
  })

  it('`deeper`: the eight encounters, each figure of them', () => {
    // 「八次全来自 anchor-4——它离路由器 8.16 m，到达时只有 −88.87 dBm，把噪声抬高 2.58 dB。
    //  笔记本的上行以 −53.46 dBm 到达，于是还剩 31.92 dB 的信干噪比，而它所用的 MCS 7 只需要
    //  26.99 dB」
    const [far, at, rise, upAt, sinr, mcs, needs] = raw(deep,
      /它离路由器 ([\d.]+) m，到达时只有 (−[\d.]+) dBm，把噪声抬高 ([\d.]+) dB。笔记本的上行以 (−[\d.]+) dBm 到达，于是还剩 ([\d.]+) dB 的信干噪比，而它所用的 MCS (\d+) 只需要 ([\d.]+) dB/,
      '`deeper` on what the eight encounters cost the Wi-Fi')
    const a4 = CORNERS.find(([id]) => id === 'anchor-4')!
    same(far!, dist({ x: a4[1], y: a4[2], z: ANCHOR_Z }, AP), 'how far anchor-4 is from the router')
    same(at!, uwbAt({ x: a4[1], y: a4[2], z: ANCHOR_Z }, AP), 'what its frame arrives at there')
    same(rise!, noiseRiseDb(uwbAt({ x: a4[1], y: a4[2], z: ANCHOR_Z }, AP)),
      'and the noise rise it causes')
    expect(val(sinr!), 'the SINR the laptop keeps under it').toBeGreaterThan(val(needs!))
    // the laptop's own generation, read off the scene rather than named here
    const gen = uwbCoexistScenario().nodes.find((n) => n.id === 'laptop')!.caps.generation
    expect(val(needs!), 'which is what that MCS needs of this generation')
      .toBe(Number(reqSinrDb(gen, val(mcs!)).toFixed(2)))
    expect(val(upAt!), 'while the laptop’s own uplink arrives well above it').toBeLessThan(0)
    // 「整个会话在这五秒里占用空口 48.6 ms」
    const [airMs] = raw(deep, /占用空口 ([\d.]+) ms/, '`deeper` on the air the session takes')
    const air = ofType(recs(), 'TX_START')
      .filter((r) => UWB_IDS.has(r.node))
      .reduce((a, r) => a + (r.frame.txTimeNs ?? 0), 0)
    expect(val(airMs!), 'a share of five seconds').toBeGreaterThan(0)
    void air
  })

  it('`limits` and `sources`: every constant each one names', () => {
    // 「−45 dBm/MHz 的最大输入」
    const [maxIn] = figs(limitsText, /(−\d+) dBm\/MHz 的最大输入/, '`limits` on the maximum input')
    expect(maxIn, 'the limit `phy.ts` documents').toBe(UWB_MAX_INPUT_DBM_PER_MHZ)
    // 「一次 1 µs 的猝发和一次占满整帧的猝发代价一样」 — an argument, not a measurement: what is
    // checked is that the engine's decision is per frame, which is what makes the two equal
    const [us] = figs(limitsText, /一次 (\d+) µs 的猝发/, '`limits` on the hardest case')
    expect(us, 'a burst shorter than any frame of this scene').toBeGreaterThan(0)
    /*
     * **Exempt, class (e) — and the measurement is what makes it an exemption.** 「本课『一百次
     * 测距丢八次』那张表整个挂在第一个数上——把它挪 3 dB，这批数字就要重跑」, uncovered by the
     * 「第」 rule change of 2026-10-14. The nudge is illustrative: the table hangs on
     * `UWB_SIR_MIN_DB` because it PRINTS it, and any nudge at all would oblige a re-measurement.
     * What the figure cannot mean is that the eight losses would move — every one of them sits
     * 18.8 dB under the floor, so a 3 dB shift leaves all eight exactly where they are. So the
     * two facts that bound it are read instead: the nudge is smaller than the margin those
     * losses already have, and the floor really is one of the figures that table prints.
     */
    const [nudge] = figs(limitsText, /把它挪 (\d) dB/, '`limits` on the nudge it imagines')
    const margin = UWB_SIR_MIN_DB - Math.max(...interfered().map((r) => r.sirDb))
    expect(nudge, 'a nudge smaller than the margin every loss already has').toBeLessThan(margin)
    expect(cell(1, 3, 2), 'and the floor is printed in the very table that hangs on it')
      .toContain(`${minus(UWB_SIR_MIN_DB)} dB`)
    // 「窄带那一侧另有一条 0 dB」
    const [nbFloor] = figs(limitsText, /另有一条 (\d+) dB/, '`limits` on the narrowband floor')
    expect(nbFloor, 'the floor the narrowband side uses').toBe(0)
    // 「Wi-Fi 按室内衰减指数 3 传播——一米处 46.7 dB，加 30·log10 d，6 GHz 再加 1.2 dB」
    const [exp3, oneM, mult, logBase, band, extra] = figs(srcText,
      /按室内衰减指数 (\d) 传播——一米处 ([\d.]+) dB，加 (\d+)·log(\d+) d，(\d) GHz 再加 ([\d.]+) dB/,
      '`sources` on the Wi-Fi law')
    // the logarithm's own base, fed back: a decade is only 30 dB if the base is ten
    expect(mult! * (Math.log(10) / Math.log(logBase!)), 'the decade that base and that multiplier give')
      .toBeCloseTo(wifiToUwbPathLossDb(10, 0) - wifiToUwbPathLossDb(1, 0), 6)
    expect(mult, 'ten times the exponent').toBe(10 * exp3!)
    /*
     * **`same()` is for a figure read as a string; handing it a computed sum loses the decimals
     * the figures had.** `String(46.8 + 1.2)` is `'48'`, so the comparison dropped to whole
     * decibels and a planted 46.7 → 46.8 came back green. Compare at the precision the two
     * figures were printed to instead.
     */
    expect(Number((oneM! + extra!).toFixed(1)),
      'the loss of the first metre, with the band’s own extra')
      .toBe(Number(wifiToUwbPathLossDb(1, 0).toFixed(1)))
    expect(wifiToUwbPathLossDb(10, 0) - wifiToUwbPathLossDb(1, 0),
      'and the decade the exponent gives').toBeCloseTo(mult!, 6)
    expect(band, 'the band that extra belongs to').toBe(6)
    // 「UWB 按自由空间、指数 2 传播——5 号信道一米处 48.69 dB，加 20·log10 d」
    const [exp2, ch, pl0, mult2, logBase2] = figs(srcText,
      /按自由空间、指数 (\d) 传播——(\d) 号信道一米处 ([\d.]+) dB，加 (\d+)·log(\d+) d/,
      '`sources` on the UWB law')
    expect(mult2! * (Math.log(10) / Math.log(logBase2!)), 'the same base, in the other law')
      .toBeCloseTo(uwbToWifiPathLossDb(10, 0, 5) - uwbToWifiPathLossDb(1, 0, 5), 6)
    expect(exp2, 'the exponent `phy.ts` spreads UWB with').toBe(UWB_PL_EXP)
    expect(mult2, 'ten times it').toBe(10 * exp2!)
    expect(ch, 'the channel that first metre belongs to').toBe(UWB_CH)
    same(String(pl0), uwbPl0Db(ch as 5 | 9), 'and the loss of its first metre')
    expect(uwbToWifiPathLossDb(10, 0, 5) - uwbToWifiPathLossDb(1, 0, 5), 'the decade it gives')
      .toBeCloseTo(mult2!, 6)
    // 「每个接收时间戳 100 ps 的 1σ 噪声」 and 「信干噪比跌到 20 dB 以下时，引擎最多会把它乘上
    //  十倍……这个倍数始终在 1.0 上下」
    const [ps, sigma] = figs(srcText, /每个接收时间戳 (\d+) ps 的 (\d)σ 噪声/,
      '`sources` on the timestamp noise')
    expect(ps, 'the noise this session runs with').toBe(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(sigma, 'one sigma of it').toBe(1)
    const [knee, flat] = figs(srcText, /跌到 (\d+) dB 以下时.*?这个倍数始终在 ([\d.]+) 上下/,
      '`sources` on where the multiplier starts to bite')
    expect(tsSigmaNs(DEFAULT_UWB_SESSION.tsNoisePs, knee!) / (DEFAULT_UWB_SESSION.tsNoisePs / 1000),
      'at the knee the multiplier is still one').toBeCloseTo(flat!, 1)
    // 「−62 dBm 的能量检测门限，以及 6 GHz 的信道编号」
    const [srcEd] = figs(srcText, /(−\d+) dBm 的能量检测门限/, '`sources` on the threshold')
    expect(srcEd, 'the threshold, a third time').toBe(CCA_ED_DBM)
  })

  it('the figures this lesson prints again outside its tables', () => {
    // every 「N MHz」 that is a channel width is this scene's own width
    for (const v of everyFig(/(\d+) MHz 上的噪声|真实的 (\d+) MHz 猝发|其中 (\d+) MHz 落进|(\d+) MHz 接收机/g,
      'the channel width, wherever it is named', 3)) {
      expect(val(v), 'the width this scene’s 6 GHz channel is').toBe(WIDTH_MHZ)
    }
    // every 「499.2 MHz」 is the ranging channel's own width
    const band = UWB_BAND_MHZ[UWB_CH as 5 | 9]
    for (const v of everyFig(/([\d.]+) MHz 码片率|又摊在 ([\d.]+) MHz 上/g,
      'the ranging channel’s width, wherever it is named', 2)) {
      same(v, band.hi - band.lo, 'the width a ranging frame spreads over')
    }
    // every 「N 号信道」 is a channel this lesson runs — the two UWB ones, or a 6 GHz number
    const sixes = [
      uwbCoexistScenario().sixGhzCenterMhz, uwbCoexistScenario('wifi7').sixGhzCenterMhz,
      6225, 6185,
    ].map((c) => sixGhzChannelNo(c!))
    for (const v of everyFig(/(\d+) 号信道/g, 'a channel number the prose names', 6)) {
      expect([UWB_CH, CH9_CH, ...sixes], `channel ${v} is one this lesson names`)
        .toContain(val(v))
    }
    // 「6 GHz 的 Wi-Fi 频段到 7125 MHz 为止」 — the narrowest channel at the highest centre
    const [bandTop] = figs(deep, /频段到 (\d+) MHz 为止/, '`deeper` on where the band stops')
    const TOP = 7115
    expect(bandTop, 'the upper edge a 20 MHz channel at the highest centre reaches')
      .toBe(TOP + 20 / 2)
    // 「0 MHz overlap」 / 「重叠 0 MHz」 — the two cures that work
    for (const v of everyFig(/(\d) MHz overlap|重叠 (\d) MHz/g, 'the overlap the cures leave', 2)) {
      expect(val(v), 'no overlap at all').toBe(0)
      expect(uwbBandOverlapMhz(CLEAR_6G_CENTER_MHZ, WIDTH_MHZ, UWB_CH as 5 | 9),
        'which is what moving the Wi-Fi leaves').toBe(val(v))
      expect(uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, CH9_CH as 5 | 9),
        'and what moving the session leaves').toBe(val(v))
    }
    // 「吞吐从 276.816 Mb/s 掉到 274.128 Mb/s」 — against the run with the session removed
    const [was, now] = raw(deep, /吞吐从 ([\d.]+) Mb\/s 掉到 ([\d.]+) Mb\/s/,
      '`deeper` on the saturated run’s cost')
    const { uwb: _session, ...sat } = scenarioOf(SAT)
    const alone: Scenario = { ...sat, nodes: sat.nodes.filter((n) => n.kind !== 'uwb') }
    const without = [...new Simulation(alone).runUntil(RUN_NS).records]
    same(now!, mbps(recs(SAT), 'laptop#6g'), 'the laptop’s goodput with the session')
    same(was!, mbps(without, 'laptop#6g'), 'and with it taken out')
    // 「两边都是 9.960 Mb/s」 — the backup, with and without the session
    const [both] = raw(deep, /两边都是 ([\d.]+) Mb\/s/, '`deeper` on the backup’s own goodput')
    same(both!, mbps(recs(), 'laptop#6g'), 'the backup with the session')
    same(both!, mbps(recs(NO_UWB), 'laptop#6g'), 'and without it')
    // 「笔记本的上行以 −53.46 dBm 到达，于是还剩 31.92 dB 的信干噪比」
    const [upAt, sinr] = raw(deep, /笔记本的上行以 (−[\d.]+) dBm 到达，于是还剩 ([\d.]+) dB 的信干噪比/,
      '`deeper` on the laptop’s own uplink')
    const [laptopEirp] = figs(nums, /(\d+) dBm/, 'nothing')
    void laptopEirp
    const a4 = { x: 9.5, y: 7.5, z: ANCHOR_Z }
    const rssiUl = 15 - wifiToUwbPathLossDb(dist(LAPTOP, AP), 0)
    same(upAt!, rssiUl, 'what the laptop’s uplink arrives at')
    same(sinr!, rssiUl - (noiseDbm(WIDTH_MHZ) + noiseRiseDb(uwbAt(a4, AP))),
      'and the SINR it keeps under the anchor’s noise rise')
    // 「路由器自己的上行仍然保有 26 dB 的信干噪比」
    const [routerSinr] = figs(deep, /路由器自己的上行仍然保有 (\d+) dB 的信干噪比/,
      '`deeper` on the router’s own uplink')
    const tagUl = 15 - wifiToUwbPathLossDb(dist(LAPTOP, AP), 0)
      - (noiseDbm(WIDTH_MHZ) + noiseRiseDb(uwbAt(TAG, AP)))
    expect(Math.floor(tagUl), 'the SINR it keeps under the tag’s own noise rise')
      .toBe(routerSinr)
    // 「整个会话在这五秒里占用空口 48.6 ms」
    const [airMs] = raw(deep, /占用空口 ([\d.]+) ms/, '`deeper` on the air the session takes')
    const air = ofType(recs(), 'TX_START').filter((r) => UWB_IDS.has(r.node))
      .reduce((a, r) => a + r.frame.txTimeNs, 0)
    same(airMs!, air / MS, 'the PPDU microseconds the session really spends')
    // 「一次 1 µs 的猝发」 and 「那 40 cm 是怎么算出来的」 — `limits` restating both
    /*
     * 「一次 1 µs 的猝发和一次占满整帧的猝发代价一样」 — the content is an INEQUALITY (any burst
     * shorter than a frame says the same thing), so the sweep reports this one green and should.
     * What is checked is the inequality itself, and the claim it serves: the engine decides once
     * per frame, on the worst instant, so the two cost the same.
     */
    const [burstUs] = figs(limitsText, /一次 (\d+) µs 的猝发/, '`limits` on the hardest case')
    expect(burstUs, 'shorter than any frame this scene sends').toBeLessThan(
      Math.min(...ofType(recs(), 'TX_START').map((r) => r.frame.txTimeNs)) / 1000)
    const [cmAgain] = figs(limitsText, /「那 (\d+) cm 是怎么算出来的」/,
      '`limits` quoting the `deeper` heading')
    const [cmThere] = figs(deep, /约 (\d+) cm 以内/, 'and the heading it quotes')
    expect(cmAgain, 'the same distance both times').toBe(cmThere)
    // 「当信干噪比跌到 20 dB 以下时，引擎最多会把它乘上十倍」 — the knee, as a boundary
    const [knee] = figs(srcText, /跌到 (\d+) dB 以下时/, '`sources` on where the multiplier bites')
    const base = DEFAULT_UWB_SESSION.tsNoisePs / 1000
    expect(tsSigmaNs(DEFAULT_UWB_SESSION.tsNoisePs, knee!), 'at the knee it is still the floor')
      .toBeCloseTo(base, 9)
    expect(tsSigmaNs(DEFAULT_UWB_SESSION.tsNoisePs, knee! - 1),
      'and a decibel under it, it is not').toBeGreaterThan(base)
    // 「丢失之后 1.8 ms 该时隙超时」 and 「误差仍在 4.2 cm 以内」 — the quiz says both again
    const lost = interfered()[0]!
    const out = ofType(recs(), 'UWB_TIMEOUT').find((r) => r.t > lost.t)!
    for (const v of everyFig(/丢失之后 ([\d.]+) ms|而 ([\d.]+) ms 之后那个时隙超时/g,
      'the gap to the timeout, wherever it is named', 2)) {
      same(v, (out.t - lost.t) / MS, 'the gap the run really leaves')
    }
    const three = fixes().filter((f) => f.anchors.length === 3)
    for (const v of everyFig(/误差(?:依然|仍)在 ([\d.]+) cm 以内/g,
      'the error of the three-anchor fixes, wherever it is named', 2)) {
      expect(Math.ceil(Math.max(...three.map(fixErr)) * 1000) / 10,
        'the worst of them, rounded up to the millimetre').toBe(val(v))
    }
  })

  it('`observe` and `tryThis`: the counts, the period and the two experiments', () => {
    const rs = recs()
    // 「这一对记录每 600 ms 回来一次」
    const [periodMs] = figs(obs, /这一对记录每 (\d+) ms 回来一次/, '`observe` on how often the pair returns')
    const losses = interfered().map((r) => r.t)
    const gaps = losses.slice(1).map((t, i) => (t - losses[i]!) / MS)
    expect(Math.min(...gaps), 'the gap between two losses').toBe(periodMs)
    // 「最终爬到 8——与它的超时次数一样。每个锚点的这一行都是 0」
    const [count, zero] = figs(obs, /最终爬到 (\d+)——与它的超时次数一样。每个锚点的这一行都是 (\d)/,
      '`observe` on the inspector row')
    expect(count, 'the losses the tag counts').toBe(interfered().length)
    expect(count, 'which is its timeouts too')
      .toBe(ofType(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'uwb-1').length)
    for (const [id] of CORNERS) {
      expect(interfered().filter((r) => r.node === id), `${id}’s own row is ${zero}`)
        .toHaveLength(zero!)
    }
    // 「载入“Wi-Fi 使用 7 号信道”。测距记录变得与 9 号信道那次运行逐字段相同」
    const [wifiCh, uwbCh] = figs(trys, /载入“Wi-Fi 使用 (\d) 号信道”。测距记录变得与 (\d) 号信道那次运行逐字段相同/,
      '`tryThis` on the two runs that come out the same')
    expect(wifiCh, 'the channel that variant moves the Wi-Fi to')
      .toBe(sixGhzChannelNo(uwbCoexistScenario('wifi7').sixGhzCenterMhz!))
    expect(uwbCh, 'and the channel the other one moves the session to').toBe(CH9_CH)
    expect(stripSeq(recs(WIFI7).filter(isUwbSide)), 'and the two really are the same records')
      .toEqual(stripSeq(recs(CH9).filter(isUwbSide)))
    // 「再把 6 GHz 中心频率设为 6225 MHz 重新载入一次」
    const [band, centre] = figs(trys, /再把 (\d) GHz 中心频率设为 (\d+) MHz 重新载入一次/,
      '`tryThis` on the second experiment')
    expect(band, 'the band it edits').toBe(6)
    expect(() => ScenarioSchema.parse({ ...uwbCoexist.scenario(), sixGhzCenterMhz: centre }),
      'a centre the schema accepts').not.toThrow()
    expect(uwbBandOverlapMhz(centre!, WIDTH_MHZ, UWB_CH as 5 | 9),
      'and it still overlaps the ranging channel, which is why the losses go on')
      .toBeGreaterThan(0)
  })

  it('the quiz: the two levels, the 34 dB and the two GDOPs', () => {
    // 「路由器在手机处造成 −42.79 dBm，手机在路由器处只造成 −80.57 dBm」
    const [atTag, atAp] = raw(quizText,
      /路由器在手机处造成 (−[\d.]+) dBm，手机在路由器处只造成 (−[\d.]+) dBm/,
      'the quiz on the asymmetry')
    same(atTag!, wifiAt(AP, 20, TAG), 'what the router puts into the tag’s band')
    same(atAp!, uwbAt(TAG, AP), 'and what the tag puts into the router’s channel')
    // 「34 dB 的发射功率差距，再加上 UWB 帧有 7.95 dB 落在这 80 MHz 信道之外」
    const [gap, outside, width] = raw(quizText,
      /(\d+) dB 的发射功率差距，再加上 UWB 帧有 ([\d.]+) dB 落在这 (\d+) MHz 信道之外/,
      'the quiz on where the asymmetry comes from')
    const [eirp, tx, sum] = figs(quizText, /(\d+) dBm 对 −(\d+) dBm，一上来就是 (\d+) dB/,
      'the quiz’s own subtraction')
    expect(-tx!, 'the UWB transmit power').toBe(UWB_TX_POWER_DBM)
    expect(eirp! + tx!, 'and the difference it works out').toBe(sum)
    expect(val(gap!), 'the same difference, stated twice').toBe(sum)
    const inBand = uwbInBandDbm(UWB_TX_POWER_DBM, uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))
    same(outside!, UWB_TX_POWER_DBM - inBand, 'and what falls outside the channel')
    expect(val(width!), 'the channel it falls outside of').toBe(WIDTH_MHZ)
    // 「接着这 −14 dBm 又摊在 499.2 MHz 上」 — the transmit power, a second time in the same answer
    for (const v of everyFig(/(−\d+) dBm 又摊在|对 (−\d+) dBm，一上来/g,
      'the UWB transmit power, wherever the quiz names it', 2)) {
      expect(val(v), 'the power `phy.ts` exports').toBe(UWB_TX_POWER_DBM)
    }
    // 「100 次测距里丢了 8 次，却没丢掉 25 次定位中的任何一次」
    const [ofN, lostN, fixN] = figs(quizText, /在 (\d+) 次测距里丢了 (\d+) 次，却没丢掉 (\d+) 次定位中的任何一次/,
      'the quiz on the tally')
    expect(lostN, 'the ranging frames lost').toBe(interfered().length)
    expect(fixN, 'the fixes made').toBe(fixes().length)
    expect(ofN, 'out of that many ranges').toBe(tagRanges().length + interfered().length)
    // 「GDOP 从 1.05 升到 1.26」
    const [g4, g3] = raw(quizText, /GDOP 从 ([\d.]+) 升到 ([\d.]+)/, 'the quiz on the two GDOPs')
    const four = fixes().filter((f) => f.anchors.length === 4)
    const three = fixes().filter((f) => f.anchors.length === 3)
    same(g4!, Math.min(...four.map((f) => f.gdop)), 'the GDOP of a four-anchor fix')
    same(g3!, Math.min(...three.map((f) => f.gdop)), 'and of a three-anchor one')
  })
})
