/**
 * Every empirical claim in "How loud a radio arrives", measured against the
 * lesson's own scenario — the walk through the flat that decode-thresholds
 * shares, so both lessons read one run.
 *
 * The lesson is the Wi-Fi track's opener, so the shape suite holds it to the
 * stricter opening budget (1000 main-path words) as well as the usual ones.
 * The decibel arithmetic, the worked interference sum, the noise floor of every
 * width and the router's reply moved into `deeper` during the readability
 * rewrite; each one is still pinned below, with the sentence it guards quoted.
 * The old `.body!` widget lookup is retired: the widget lives in `numbers`.
 */
import { describe, it, expect } from 'vitest'
import { radioPrimer } from '../../src/course/tier1/radio-primer'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { COURSE_ORDER } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import { linkBudget, BAND_EXTRA_LOSS_DB } from '../../src/course/widgetModel'
import { NOISE_FIGURE_DB, noiseDbm } from '../../src/engine/phy'
import { WALL_LOSS_DB, buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, runOf } from './kit'

const MS = 1_000_000
/** Long enough for the "first 100 ms" observation; every run of this file shares it. */
const RUN_NS = 100 * MS
const mw = (dbm: number) => Math.pow(10, dbm / 10)
const dbm = (m: number) => 10 * Math.log10(m)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string): Tx[] =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)
/** The records of variant `i`, from the kit's shared memo. */
const variantRecs = (i: number): TLRecord[] => runOf(radioPrimer, i, RUN_NS)

const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/** The "The same laptop, four places" table: RSSI, SNR (1 decimal) and the rate of its frames. */
const TABLE = [
  { rssi: '-31.7', snr: '62.3', mbps: 172.1 },
  { rssi: '-52.7', snr: '41.3', mbps: 129.0 },
  { rssi: '-72.3', snr: '21.7', mbps: 34.4 },
  { rssi: '-78.1', snr: '15.9', mbps: 17.2 },
]

// The contract every migrated lesson owes (tests/course/kit.ts). `totalMax` is the
// spec's rule for a track's first lesson: the point of the programme is that it is short.
lessonShapeSuite(radioPrimer, { proseMax: 700, totalMax: 1000, runNs: RUN_NS })

describe('radio-primer · the opener of the Wi-Fi track', () => {
  it('opens the course, needs nothing, and owns the three ratio words', () => {
    expect(radioPrimer.id).toBe('radio-primer')
    expect(COURSE_ORDER[0]).toBe('radio-primer')
    expect(radioPrimer.module).toBe(0)
    // the one lesson the contract lets have an empty `needs`
    expect(radioPrimer.needs).toEqual([])
    // the baseline owner table of the readability programme: these three words are this
    // lesson's to introduce, and a track's first lesson may hold at most four.
    expect(radioPrimer.terms!.map((t) => t.term)).toEqual(['RSSI', 'SNR', 'SINR'])
  })

  it('walks the flat: 9 m to open, then 1, 5, 9 and 14 m on the centre line', () => {
    const pos = (s: Scenario) => {
      const ap = s.nodes.find((n) => n.id === 'ap')!.pos
      const sta = s.nodes.find((n) => n.id === 'sta-1')!.pos
      return Math.hypot(sta.x - ap.x, sta.y - ap.y, sta.z - ap.z)
    }
    expect(pos(radioPrimer.scenario())).toBeCloseTo(9, 12)
    expect(radioPrimer.variants!.map((v) => pos(v.scenario()))).toEqual(PRIMER_DISTANCES)
    expect(() => ScenarioSchema.parse(radioPrimer.scenario())).not.toThrow()
    for (const v of radioPrimer.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })
})

describe('radio-primer · what arrives', () => {
  it('the formula is the engine’s own path loss, and its note prices every wall', () => {
    // "RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ walls" and the note "plasterboard 5 dB,
    //  brick 12 dB, glass 3 dB. Doubling the distance costs 9.0 dB, so one brick wall is
    //  worth moving two and a half times further away."
    expect(pathLossDb(1)).toBeCloseTo(46.7, 12)
    expect((pathLossDb(2) - pathLossDb(1)).toFixed(1)).toBe('9.0')
    expect(pathLossDb(10) - pathLossDb(1)).toBeCloseTo(30, 9)
    expect(WALL_LOSS_DB).toEqual({ drywall: 5, brick: 12, glass: 3 })
    expect((pathLossDb(2.5) - pathLossDb(1)).toFixed(0)).toBe('12')
    // the picture's "plasterboard costs a little, glass a little, brick a lot"
    expect(WALL_LOSS_DB.brick).toBeGreaterThan(WALL_LOSS_DB.drywall)
    expect(WALL_LOSS_DB.drywall).toBeGreaterThan(WALL_LOSS_DB.glass)
  })

  it('the four-place table is the link budget, the link table and the first frame, all agreeing', () => {
    // "The same laptop, four places": −31.7/−52.7/−72.3/−78.1 dBm, 62.3/41.3/21.7/15.9 dB,
    //  172.1/129.0/34.4/17.2 Mbps — and the observation "Jump to the first data frame in each
    //  of the four variants and read the rate".
    PRIMER_DISTANCES.forEach((d, i) => {
      const e = TABLE[i]
      const s = radioPrimer.variants![i].scenario()
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls: [...wallsFor(d)], widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.snrDb.toFixed(1)).toBe(e.snr)
      expect(lb.mbps).toBe(e.mbps)
      const data = txs(variantRecs(i), 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].frame.mbps).toBe(e.mbps)
      // "Laptop, router and traffic are identical in all four": one 1530-octet frame throughout
      expect(data[0].frame.bytes).toBe(1530)
    })
    // "the difference is 46 dB of distance and brick"
    expect((Number(TABLE[0].rssi) - Number(TABLE[3].rssi)).toFixed(0)).toBe('46')
  })

  it('the widget is preset to the living room, and lands on the table’s own row', () => {
    // the caption "Preset to the living-room laptop: 15 dBm, 9 m, one brick wall"
    const w = radioPrimer.numbers!.find((b): b is Extract<Block, { kind: 'widget' }> => b.kind === 'widget')!
    expect(w.widget).toBe('linkBudget')
    const p = w.params!
    const walls = (['drywall', 'brick', 'glass'] as const).flatMap((m) => Array(Number(p[m])).fill(m))
    expect(walls).toEqual(['brick'])
    expect(Number(p.txDbm)).toBe(15)
    expect(Number(p.distanceM)).toBe(9)
    const lb = linkBudget({
      txDbm: Number(p.txDbm), distanceM: Number(p.distanceM), walls,
      widthMhz: Number(p.widthMhz), mode: p.mode as 'eht',
    })
    expect(lb.pathLossDb.toFixed(1)).toBe('75.3')
    expect(lb.wallLossDb).toBe(12)
    expect(lb.rssiDbm.toFixed(1)).toBe(TABLE[2].rssi)
    expect(lb.noiseDbm.toFixed(1)).toBe('-94.0')
    expect(lb.snrDb.toFixed(1)).toBe(TABLE[2].snr)
  })
})

describe('radio-primer · the floor of the room', () => {
  it('the noise formula is kTB plus the simulator’s noise figure', () => {
    // "N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB → N(20 MHz) = −93.99 dBm"
    expect(NOISE_FIGURE_DB).toBe(7)
    expect((noiseDbm(20) - NOISE_FIGURE_DB).toFixed(2)).toBe('-100.99')
    expect(noiseDbm(20).toFixed(2)).toBe('-93.99')
  })

  it('each doubling of the channel adds 3 dB, and the widest floor is −84.96 dBm', () => {
    // the note "each doubling of the channel adds 3 dB, and on the widest channel here the
    //  floor has risen to −84.96 dBm", and the deeper table of every width
    expect([20, 40, 80, 160, 320].map((w) => noiseDbm(w).toFixed(2)))
      .toEqual(['-93.99', '-90.98', '-87.97', '-84.96', '-81.95'])
    expect((noiseDbm(40) - noiseDbm(20)).toFixed(2)).toBe('3.01')
    // "the widest channel here": the lessons' own scene runs at 20 MHz, and 160 MHz is the
    // width the quiz moves it to
    expect((noiseDbm(160) - noiseDbm(20)).toFixed(2)).toBe('9.03')
  })

  it('quiz 2: the width changes the floor and not the RSSI', () => {
    // "The RSSI is unchanged; the floor rises about 9 dB, to −84.96 dBm" / "Listening eight
    //  times as wide takes in eight times the noise — 9.03 dB — and the SNR falls by exactly that."
    const narrow = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 20, mode: 'eht' })
    const wide = linkBudget({ txDbm: 15, distanceM: 14, walls: ['brick'], widthMhz: 160, mode: 'eht' })
    expect(wide.rssiDbm).toBeCloseTo(narrow.rssiDbm, 12)
    expect((wide.noiseDbm - narrow.noiseDbm).toFixed(2)).toBe('9.03')
    expect((narrow.snrDb - wide.snrDb).toFixed(2)).toBe('9.03')
    expect(wide.noiseDbm.toFixed(2)).toBe('-84.96')
  })
})

describe('radio-primer · and when the neighbour joins in', () => {
  it('one neighbour at −85 dBm turns an SNR of 21.66 dB into a SINR of 12.16 dB', () => {
    // numbers: "A neighbour arriving at −85 dBm during the living-room laptop's frame drops the
    //  margin from an SNR of 21.66 dB to a SINR of 12.16 dB — 9.5 dB gone to one other talker."
    // deeper, step by step: 3.99 × 10⁻¹⁰ mW, 3.16 × 10⁻⁹ mW, 3.56 × 10⁻⁹ mW = −84.48 dBm, 0.52 dB.
    const n = noiseDbm(20)
    expect(mw(n).toExponential(2)).toBe('3.99e-10')
    expect(mw(-85).toExponential(2)).toBe('3.16e-9')
    const sum = mw(n) + mw(-85)
    expect(sum.toExponential(2)).toBe('3.56e-9')
    expect(dbm(sum).toFixed(2)).toBe('-84.48')
    expect((dbm(sum) + 85).toFixed(2)).toBe('0.52')
    const sig = linkBudget({ txDbm: 15, distanceM: 9, walls: ['brick'], widthMhz: 20, mode: 'eht' }).rssiDbm
    expect(sig.toFixed(2)).toBe('-72.33')
    expect((sig - n).toFixed(2)).toBe('21.66')
    expect((sig - dbm(sum)).toFixed(2)).toBe('12.16')
    expect(((sig - n) - (sig - dbm(sum))).toFixed(1)).toBe('9.5')
  })

  it('deeper: two equal neighbours are +3 dB, −81.99 dBm, and never −170', () => {
    // "Two equal neighbours at −85 dBm are twice the power, +3 dB: −81.99 dBm, not −170."
    expect(dbm(2 * mw(-85)).toFixed(2)).toBe('-81.99')
    expect(dbm(2).toFixed(2)).toBe('3.01')
  })
})

describe('radio-primer · what the run shows', () => {
  it('353 frames acknowledged at the desk, 107 at the far wall, under a third as many', () => {
    // observe: "In the first 100 ms the router acknowledges 353 frames from the desk but only
    //  107 from the far wall, under a third as many."
    const acks = radioPrimer.variants!.map((_v, i) => txs(variantRecs(i), 'ap', 'ack').length)
    expect(acks[0]).toBe(353)
    expect(acks[3]).toBe(107)
    expect(acks[3] / acks[0]).toBeLessThan(1 / 3)
  })

  it('deeper: the router’s reply is 24 Mbps and 28 µs, and only 12 Mbps and 32 µs at the far wall', () => {
    // "24 Mbps in the first three variants and 12 Mbps only at the far wall, 28 µs of air
    //  against 32 µs … while the data frames stretch nearly sixfold."
    const acks = radioPrimer.variants!.map((_v, i) => txs(variantRecs(i), 'ap', 'ack')[0].frame)
    expect(acks.map((f) => f.mbps)).toEqual([24, 24, 24, 12])
    expect(acks.map((f) => f.txTimeNs)).toEqual([28_000, 28_000, 28_000, 32_000])
    const data = radioPrimer.variants!.map((_v, i) => txs(variantRecs(i), 'sta-1', 'data')[0].frame.txTimeNs)
    expect(data[3] / data[0]).toBeGreaterThan(5)
    expect(data[3] / data[0]).toBeLessThan(6)
  })
})

describe('radio-primer · try this', () => {
  it('4.5 → 9 → 18 m with one brick wall: −63.3, −72.3, −81.4 dBm, the same step each time', () => {
    // "The received level reads −63.3, −72.3 and −81.4 dBm: the same step down for each doubling."
    const rssi = [4.5, 9, 18].map((d) =>
      linkBudget({ txDbm: 15, distanceM: d, walls: ['brick'], widthMhz: 20, mode: 'eht' }).rssiDbm)
    expect(rssi.map((r) => r.toFixed(1))).toEqual(['-63.3', '-72.3', '-81.4'])
    expect((rssi[0] - rssi[1]).toFixed(1)).toBe('9.0')
    expect((rssi[1] - rssi[2]).toFixed(1)).toBe('9.0')
  })

  it('brick swapped for glass in the living room: −63.3 dBm and 86.0 Mbps', () => {
    // "The received level rises to −63.3 dBm — the 4.5 m brick figure — and the frames speed up
    //  from 34.4 to 86.0 Mbps."
    const s = primerScenario(9)
    const i = s.walls.findIndex((w) => w.x1 === 6 && w.x2 === 6)
    expect(s.walls[i].material).toBe('brick')
    s.walls[i].material = 'glass'
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['glass'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-63.3')
    expect(lb.mbps).toBe(86.0)
    const data = txs([...new Simulation(s).runUntil(50 * MS).records], 'sta-1', 'data')
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((r) => r.frame.mbps === 86.0)).toBe(true)
  })
})

describe('radio-primer · deeper: decibels', () => {
  it('the powers the paragraph names are the scenario’s own', () => {
    // "The router transmits 100 mW (20 dBm) and the laptop 31.6 mW (15 dBm); 9 m and one brick
    //  wall later that laptop is 5.85 × 10⁻⁸ mW, or −72.3 dBm, at the router."
    expect(dbm(100)).toBeCloseTo(20, 12)
    expect(dbm(31.6).toFixed(1)).toBe('15.0')
    expect(dbm(1)).toBe(0)
    const s = primerScenario(9)
    expect(s.nodes.find((n) => n.id === 'ap')!.txPowerDbm).toBe(20)
    expect(s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm).toBe(15)
    const rssi = buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
    expect(rssi.toFixed(1)).toBe('-72.3')
    expect(mw(rssi).toExponential(2)).toBe('5.85e-8')
  })

  it('a 6 GHz link pays a further 1.2 dB', () => {
    // "A 6 GHz link pays a further 1.2 dB, the extra free-space loss of the higher frequency."
    expect(BAND_EXTRA_LOSS_DB['6g']).toBe(1.2)
  })
})
