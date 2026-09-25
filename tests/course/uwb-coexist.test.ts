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
import { lessonStrings } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
import { CCA_ED_DBM, noiseDbm, reqSinrDb } from '../../src/engine/phy'
import { uwbToWifiPathLossDb, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import {
  UWB_BAND_MHZ, UWB_MAX_INPUT_DBM_PER_MHZ, UWB_PL_EXP, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
  tsSigmaNs, uwbBandOverlap, uwbBandOverlapMhz, uwbInBandDbm, uwbPl0Db, uwbSinrDb,
} from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
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
// The prose window is the content contract's: `why` + `outcomes` + `terms` +
// `picture` + `numbers`, which `npx tsx scripts/lesson-dump.ts uwb-coexist en` prints.
lessonShapeSuite(uwbCoexist, { proseMax: 1270, runNs: RUN_NS })

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
    expect(uwbCoexist.module).toBe(13)
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
    expect(src).toContain(`a ${minus(UWB_SIR_MIN_DB)} dB signal-to-interference floor`)
    expect(src).toContain('The rest is the model.')
    expect(src).toContain('the 6 GHz channel numbering (802.11ax) are the model’s too')
  })

  it('the course seam puts it first in a second UWB tier, in module 13', () => {
    expect(TIERS[5]).toEqual({ track: 'uwb', en: 'UWB Tier 2 · Sessions in the real world', zh: 'UWB 第二阶段 · 真实环境中的会话' })
    expect(MODULES[13]).toEqual({ tier: 5, title: { en: 'Coexistence', zh: '共存' } })
    expect(MODULES[14]).toEqual({ tier: 5, title: { en: 'Other ranging modes', zh: '其他测距模式' } })
    expect(MODULES[uwbCoexist.module].tier).toBe(5)
    // the five tier-2 ids follow uwb-geometry (tier 3's follow them), and every one of them
    // now has a lesson
    const after = COURSE_ORDER.slice(COURSE_ORDER.indexOf('uwb-geometry') + 1, COURSE_ORDER.indexOf('uwb-mms'))
    expect(after).toEqual(['uwb-coexist', 'uwb-contention', 'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa'])
    const ids = LESSONS.map((l) => l.id)
    for (const id of after) expect(ids, id).toContain(id)
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
    expect(uwbCoexist.variants![CH9].label).toEqual({ en: 'UWB on channel 9', zh: 'UWB 使用 9 号信道' })
    expect(scenarioOf(CH9)).toEqual({ ...base, uwb: { ...base.uwb!, channel: 9 } })
    // "Wi-Fi on channel 7 (5 985 MHz)" — the 6 GHz centre, which is also the engine's default
    expect(uwbCoexist.variants![WIFI7].label).toBe('Wi-Fi on channel 7 (5 985 MHz)')
    expect(CLEAR_6G_CENTER_MHZ).toBe(DEFAULT_SIX_GHZ_CENTER_MHZ)
    expect(sixGhzChannelNo(CLEAR_6G_CENTER_MHZ)).toBe(7)
    expect(scenarioOf(WIFI7)).toEqual({ ...base, sixGhzCenterMhz: CLEAR_6G_CENTER_MHZ })
    // "Saturated upload" — the laptop's profile
    expect(uwbCoexist.variants![SAT].label).toEqual({ en: 'Saturated upload', zh: '饱和上传' })
    const sat = scenarioOf(SAT)
    expect(sat.nodes[1].profiles).toEqual(['saturated'])
    expect({ ...sat, nodes: [sat.nodes[0], base.nodes[1], ...sat.nodes.slice(2)] }).toEqual(base)
    // "No UWB" — the Wi-Fi pair alone, with no session left behind
    expect(uwbCoexist.variants![NO_UWB].label).toEqual({ en: 'No UWB', zh: '没有 UWB' })
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
    expect(f[0].note!).toContain('7.95 dB gone before the path loss starts')
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
    const src = uwbCoexist.sources!.map((s) => s).join('\n')
    expect(src).toContain('46.7 dB at one metre, plus 30·log10 d, plus 1.2 dB for 6 GHz')
    expect(src).toContain('48.69 dB at one metre on channel 5, plus 20·log10 d')
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
    expect(prose()).toContain('462.6 MHz of clear air')
    expect(deepCell(0, 3, 1)).toBe('0 MHz overlap · any Wi-Fi width')
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
    expect(cell(1, 2, 1)).toContain('4.76 to 6.91 m')
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
    expect(prose()).toContain('18.8 dB short')
    // quiz 1: "34 dB of transmit power, plus 7.95 dB of the UWB frame falling outside the 80 MHz"
    // ("EIRP" is the formula's word, and the formula body is the one place it is allowed) /
    // "20 dBm against −14 dBm is 34 dB before anything else"
    expect(20 - UWB_TX_POWER_DBM).toBe(34)
    for (const s of ['34 dB of transmit power', '34 dB before anything else']) expect(prose(), s).toContain(s)
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
    expect(prose()).toContain('18.57 dB under the energy-detect threshold')
    // deeper: "the router’s own uplink still holds 26 dB of SINR"
    const rssiUl = 15 - wifiToUwbPathLossDb(dist(LAPTOP, AP), 0)
    expect((rssiUl - (noiseDbm(WIDTH_MHZ) + noiseRiseDb(loudest))).toFixed(0)).toBe('26')
    expect(prose()).toContain('26 dB of SINR')
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
    expect(prose()).toContain('the crossover falls at 0.37 m')
    // at that distance the in-band power really is the threshold, and 1 cm inside it is above
    expect(uwbAt({ ...TAG, x: TAG.x + crossoverM }, TAG).toFixed(4)).toBe(CCA_ED_DBM.toFixed(4))
    expect(uwbAt({ ...TAG, x: TAG.x + crossoverM - 0.01 }, TAG)).toBeGreaterThan(CCA_ED_DBM)
    // both languages carry the cutoff, and neither claims CCA can never trip at all
    expect(prose()).toContain('within about 40 cm of a UWB transmitter')
    expect(proseZh()).toContain('40 cm')
    expect(prose()).not.toContain('at the loudest point in the room')
    // the room's own nearest Wi-Fi radio is nowhere near it
    const nearest = Math.min(...[TAG, ...CORNERS.map(([, x, y]) => ({ x, y, z: ANCHOR_Z }))]
      .flatMap((p) => [dist(p, AP), dist(p, LAPTOP)]))
    expect(nearest.toFixed(2)).toBe('3.14')
    expect(nearest).toBeGreaterThan(crossoverM)
    expect(prose()).toContain('the nearest Wi-Fi radio in this room, the router 3.14 m from the phone')
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
    expect(prose()).toContain('leaving 31.92 dB of SINR where its MCS 7 needs 26.99')
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
    expect(prose()).toContain('in every field but the shared sequence number')
    expect(mbps(recs(), 'laptop#6g').toFixed(3)).toBe('9.960')
    expect(mbps(recs(NO_UWB), 'laptop#6g').toFixed(3)).toBe('9.960')
    expect(prose()).toContain('9.960 Mb/s either way')
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
    expect(prose()).toContain('48.6 ms of the five seconds')
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
    expect(uwbCoexist.observe[0]).toContain('every 600 ms')
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
    expect(prose()).toContain('the slot times out 1.8 ms later')
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
    expect(prose()).toContain('the error still inside 4.2 cm')
    // quiz 2: "GDOP rises from 1.05 to 1.26"
    expect(uwbCoexist.quiz[1].options[1]).toContain('GDOP rises from 1.05 to 1.26')
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
    expect(uwbCoexist.observe[0]).toContain('At 418.191 ms')
    // the two position lines of the deeper table
    expect(fmtRecord(fixes()[0])).toBe(deepCell(1, 0, 1))
    expect(deepCell(1, 0, 1))
      .toBe('uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors')
    expect(fmtRecord(fixes()[2])).toBe(deepCell(1, 1, 1))
    expect(deepCell(1, 1, 1))
      .toBe('uwb-1 position (4.01, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.26, 3 anchors')
    // observe 2: the tag's row reaches 8 and every anchor's stays 0
    expect(STRINGS.en.uwb.interfered).toBe('lost to Wi-Fi')
    expect(uwbCoexist.observe[1]).toContain(`a “${STRINGS.en.uwb.interfered}” row`)
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
    expect(uwbCoexist.tryThis[0]).toContain('those of the channel-9 run to the last field')
    expect(prose()).toContain('the session produces exactly the records it produces on channel 9')
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
    expect(prose()).toContain('throughput falls from 276.816 to 274.128 Mb/s')
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
    expect(deepCell(0, 0, 1)).toBe('foreign −59.15 dBm · best SIR −17.10 dB')
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
    expect(deepCell(0, 0, 2)).toBe('no — it would take 11.09 m, or 14.21 m for the farthest anchor')
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
    expect(deepCell(0, 1, 1)).toBe('25 of 80 MHz · 31 % · 5.05 dB')
    const partial = [...new Simulation({ ...uwbCoexist.scenario(), sixGhzCenterMhz: PARTIAL }).runUntil(RUN_NS).records]
    const hit = ofType(partial, 'UWB_INTERFERED')
    expect(hit).toHaveLength(8)
    for (const r of hit) expect(r.sirDb.toFixed(2)).toBe('-25.76')
    expect((hit[0].sirDb - interfered()[0].sirDb).toFixed(2)).toBe((-shareDb).toFixed(2))
    expect(ofType(partial, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')).toHaveLength(92)
    expect(deepCell(0, 1, 2)).toBe('no — SIR −25.76 dB, the same eight losses')
    // row 2: "Wi-Fi centre to 6185 MHz, channel 47" / "0 MHz overlap" / "yes — the losses stop dead"
    const CLEAR = 6185
    expect(deepCell(0, 2, 0)).toContain('6185 MHz')
    expect(sixGhzChannelNo(CLEAR)).toBe(47)
    expect(uwbBandOverlapMhz(CLEAR, WIDTH_MHZ, 5)).toBe(0)
    const clear = [...new Simulation({ ...uwbCoexist.scenario(), sixGhzCenterMhz: CLEAR }).runUntil(RUN_NS).records]
    expect(ofType(clear, 'UWB_INTERFERED')).toEqual([])
    expect(ofType(clear, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')).toHaveLength(100)
    expect(deepCell(0, 2, 2)).toBe('yes — the losses stop dead')
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
    for (const i of steps().items) expect(i).not.toBe(i)
  })

  it('step 2: the band the phone reads the foreign power over is UWB channel 5’s own', () => {
    // "over its own 6240.0 to 6739.2 MHz"
    expect(stepsText()).toContain('6240.0 to 6739.2 MHz')
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
    expect(stepsText()).toContain('That level also widens the timestamp noise, so a surviving frame is stamped less precisely')
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
    expect(stepsText()).toContain('Nothing is retried inside the block')
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
    expect(stepsText()).toContain('18.57 dB under the energy-detect threshold of −62 dBm')
    // and the run bears it out: the Wi-Fi side's records are the no-UWB run's, field for field
    expect(wifiSide(recs())).toEqual(wifiSide(recs(NO_UWB)))
  })

  it('step 8: the boundary — only power crosses, and it crosses both ways', () => {
    expect(stepsText()).toContain('That is the boundary')
    expect(stepsText()).toContain('only power crosses')
    // the UWB side never emits a Wi-Fi record and vice versa: no shared MAC state at all
    const uwbTypes = new Set(recs().filter(isUwbSide).map((r) => r.type))
    expect(uwbTypes.has('CCA_BUSY')).toBe(false)
    // and with the bands disjoint the mediator is never built: the ranging side is the
    // channel-9 run's, so nothing but the overlap ever did anything
    expect(interfered(WIFI7)).toEqual([])
    expect(interfered(CH9)).toEqual([])
  })
})
