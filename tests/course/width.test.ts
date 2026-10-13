/**
 * Every empirical claim in "Channel width — more lanes, not a faster car",
 * measured against the lesson's own scenario and its four width variants.
 *
 * The four airtimes, the MCS and the rate line are also checked variant by
 * variant in tests/course/quoted-timestamps.test.ts, which owns the shared
 * PhyQuote walk; what is pinned here is what this lesson's own sentences say:
 * the sub-carrier counts of the table, the fixed opening and the whole-symbol
 * rounding of the formula, the noise arithmetic of "What the width costs in
 * noise", the living-room table and its inversion, the one-decibel window and
 * the legacy fallback of `deeper`, and the two experiments.
 *
 * Re-paced on 2026-09-25 (§2 M9: the lesson stays whole). The claim that used to
 * be the second observe line — take the fixed 48 µs off each of the four
 * airtimes and 81.6, 40.8, 27.2 and 13.6 µs of data are what is left — is now
 * the timing figure, so its pin moved with it: `widthAirtimeTiming`'s four data
 * spans are asserted against the run below, and the figure's geometry is checked
 * here as well as in tests/course/diagram.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { width, widthAirtimeTiming } from '../../src/course/tier2/width'
import { lessonChars, lessonMinutes } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import { widthScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { negotiatedWidth } from '../../src/model/caps'
import {
  PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb, toneRatio, txTimeModeNs,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings, lessonTexts } from '../../src/course/readability'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'
import { selBinWidthMhz } from '../../src/engine/selectivity'
import { zhNumeral } from './coverage'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
/** 1500 bytes of payload leave the station as 1530 octets on the air. */
const OCTETS = 1530
/** The data sub-carriers of a 20 MHz channel: every other count is this one times the ratio. */
const TONES_20 = 234

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const bigData = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.bytes > 1000)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
/** The lesson's own scene, moved to one position and run: the two experiments. */
function moved(variant: number, x: number, y: number, ns = 50 * MS): TLRecord[] {
  const sc: Scenario = width.variants![variant].scenario()
  sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x, y, z: 1 }
  return [...new Simulation(sc).runUntil(ns).records]
}

lessonShapeSuite(width, { runNs: RUN_NS })

describe('width · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the two Tier 1 lessons its words come from', () => {
    expect(MODULES[width.module].title).toBe('容量旋钮与速率控制')
    // §6 of the re-pacing plan: the rung ladder and the noise floor are their own
    // lessons now, so the two Tier 1 ids this lesson's words come from are those.
    expect(width.needs).toEqual(['mcs-ladder', 'noise-floor', 'airtime'])
    // `sub-carrier`, `symbol` and `noise floor` are the words this lesson glosses; MCS,
    // OFDM, preamble and payload come from the lessons in `needs`.
    expect(width.terms!.map((t) => t.term)).toEqual(['channel width', 'sub-carrier', 'symbol', 'noise floor'])
  })

  it('opens on the widest channel and keeps the four width variants unchanged', () => {
    // "The lesson opens on the widest channel" / "Load opens the widest case"
    expect(width.scenario()).toEqual(widthScenario(160, 1))
    expect(width.variants!.map((v) => v.scenario()))
      .toEqual([widthScenario(20, 1), widthScenario(40, 1), widthScenario(80, 1), widthScenario(160, 1)])
    expect(() => ScenarioSchema.parse(width.scenario())).not.toThrow()
    for (const v of width.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })
})

describe('width · one 1500-byte frame at four widths', () => {
  const quotes = [
    { width: 20, tones: 234, symbols: 6, airtimeNs: 129_600 },
    { width: 40, tones: 468, symbols: 3, airtimeNs: 88_800 },
    { width: 80, tones: 980, symbols: 2, airtimeNs: 75_200 },
    { width: 160, tones: 1960, symbols: 1, airtimeNs: 61_600 },
  ]

  it.each(quotes.map((q, i) => [q.width, i, q] as const))(
    '%i MHz: the table row the lesson prints is the row the run produces', (_w, i, q) => {
      const data = bigData(runOf(width, i, RUN_NS))
      expect(data.length).toBeGreaterThan(50)
      expect(one(data.map((r) => r.frame.bytes))).toBe(OCTETS)
      expect(one(data.map((r) => r.frame.widthMhz))).toBe(q.width)
      // the "MCS" and "Rate line" columns: 13 and 172.1 Mbps at every width, which is the
      // observation "the rate line never moves either: 172.1 Mbps at every width"
      expect(one(data.map((r) => r.frame.mcs))).toBe(13)
      expect(one(data.map((r) => r.frame.mbps))).toBe(172.1)
      // the "Symbols" and "Airtime" columns
      expect(one(data.map((r) => r.frame.txTimeNs))).toBe(q.airtimeNs)
      expect((q.airtimeNs - PHY_MODES.eht.preambleNs) / PHY_MODES.eht.symNs).toBe(q.symbols)
      // "The white ACK is identical in all four — width buys a control frame nothing"
      const acks = txs(runOf(width, i, RUN_NS), (r) => r.frame.kind === 'ack')
      expect(acks.length).toBeGreaterThan(50)
      expect(one(acks.map((r) => r.frame.txTimeNs))).toBe(28 * US)
    })

  it('the "Data sub-carriers" column is the engine’s own ratio times the 20 MHz count', () => {
    // "twice the channel width is twice the sub-carriers", and the formula note's "the step to
    // 80 MHz gives slightly more than four times the sub-carriers of 20 MHz"
    for (const q of quotes) expect(TONES_20 * toneRatio('eht', q.width)).toBe(q.tones)
    expect(toneRatio('eht', 40)).toBe(2)
    expect(toneRatio('eht', 80)).toBeGreaterThan(4)
    expect(toneRatio('eht', 160)).toBe(2 * toneRatio('eht', 80))
  })

  it('the formula reproduces every airtime: a fixed opening plus whole symbols', () => {
    // "airtime = 48 µs + 13.6 µs × ⌈(16 + 8·bytes + 6) ÷ (bits per symbol at 20 MHz × sub-carrier
    //  ratio)⌉", and the picture's "the preamble … is the same length at every width" and
    //  "the data cannot be cut finer than one whole symbol"
    expect(PHY_MODES.eht.preambleNs).toBe(48 * US)
    expect(PHY_MODES.eht.symNs).toBe(13_600)
    const ndbps20 = PHY_MODES.eht.ndbps[13]
    expect(ndbps20).toBe(2340)
    for (const q of quotes) {
      const nsym = Math.ceil((16 + 8 * OCTETS + 6) / (ndbps20 * toneRatio('eht', q.width)))
      expect(nsym).toBe(q.symbols)
      expect(48 * US + 13_600 * nsym).toBe(q.airtimeNs)
      expect(txTimeModeNs('eht', OCTETS, 13, { widthMhz: q.width })).toBe(q.airtimeNs)
    }
    // the figure's four data spans: "take the fixed 48 µs opening off each of those four
    // and what is left is 81.6, 40.8, 27.2 and 13.6 µs of data"
    expect(quotes.map((q) => (q.airtimeNs - 48 * US) / US)).toEqual([81.6, 40.8, 27.2, 13.6])
    // "at the widest setting it is down to a single symbol", and the quiz's "more than three
    // quarters of the frame" is then the opening
    expect(48 * US / 61_600).toBeGreaterThan(0.75)
  })
})

describe('width · what the width costs in noise', () => {
  it('each doubling takes in 3 dB more noise, and the widest here 9 dB over the narrowest', () => {
    // "Each doubling of the width takes in twice the noise power — 3 dB — so the widest channel
    //  here needs about 9 dB more signal than the narrowest."
    for (const w of [20, 40, 80]) {
      expect(Math.round((noiseDbm(2 * w) - noiseDbm(w)) * 100) / 100).toBe(3.01)
    }
    expect(Math.round((noiseDbm(160) - noiseDbm(20)) * 10) / 10).toBe(9)
  })

  it('on the desk the link holds the top rung with 48.7 dB against the 48.0 it asks for', () => {
    // "the link holds the top rung with 48.7 dB of signal against noise where that rung asks
    //  for 48.0" — the lesson opens at 160 MHz, so this is that variant's own link.
    const sc = width.scenario()
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    const snr = rssi - noiseDbm(160)
    expect(Math.round(snr * 10) / 10).toBe(48.7)
    expect(Math.round((reqSinrDb('eht', 13) + RATE_MARGIN_DB) * 10) / 10).toBe(48)
    expect(snr).toBeGreaterThan(reqSinrDb('eht', 13) + RATE_MARGIN_DB)
    // "It buys nothing against another station talking over you": the required ratio is a
    // function of the MCS alone (reqSinrDb takes no width), and only the noise floor moves.
    for (const w of [40, 80, 160]) expect(noiseDbm(w)).toBeGreaterThan(noiseDbm(20))
  })
})

describe('width · the same laptop, half way into the living room', () => {
  // "seven and a half squares right of the router and two down": the router sits at (3, 4).
  const POS = { x: 10.5, y: 6 }
  const walk = (i: number) => {
    const rs = moved(i, POS.x, POS.y)
    const data = bigData(rs)
    expect(data.length).toBeGreaterThan(20)
    return {
      airtimeNs: one(data.map((r) => r.frame.txTimeNs)),
      mcs: one(data.map((r) => r.frame.mcs)),
      acks: txs(rs, (r) => r.frame.kind === 'ack').length,
      retries: ofType(rs, 'RETRY').length,
      drops: ofType(rs, 'DROP').length,
    }
  }
  const [w20, w40, w80, w160] = [0, 1, 2, 3].map(walk)

  it('the second table is that spot: 415.2, 238.4, 170.4 and then back up to 224.8 µs', () => {
    expect([w20.airtimeNs, w40.airtimeNs, w80.airtimeNs, w160.airtimeNs])
      .toEqual([415_200, 238_400, 170_400, 224_800])
    // "and slower than 80 MHz" — the inversion, as the property and not as four constants
    expect(w160.airtimeNs).toBeGreaterThan(w80.airtimeNs)
    // the widest channel still beats 40 MHz there, which is why the table calls it delivered
    expect(w160.airtimeNs).toBeLessThan(w40.airtimeNs)
  })

  it('the "MCS" column is 3, 3, 2, 0: a 3 dB step skips a short 2 dB rung', () => {
    // "the extra noise a 160 MHz channel takes in over an 80 MHz one costs two rungs at that
    //  spot, not one: the sensitivity ladder has a short 2 dB rung in it"
    expect([w20.mcs, w40.mcs, w80.mcs, w160.mcs]).toEqual([3, 3, 2, 0])
    expect(reqSinrDb('eht', 2) - reqSinrDb('eht', 1)).toBeCloseTo(2, 5)
    expect(noiseDbm(160) - noiseDbm(80)).toBeGreaterThan(reqSinrDb('eht', 2) - reqSinrDb('eht', 1))
  })

  it('"every frame" in the Delivered column: no retries and no drops at any width', () => {
    for (const [name, r] of [['20', w20], ['40', w40], ['80', w80], ['160', w160]] as const) {
      expect(r.acks, `${name} MHz`).toBeGreaterThan(20)
      expect(r.retries, `${name} MHz`).toBe(0)
      expect(r.drops, `${name} MHz`).toBe(0)
    }
  })

  it('"exactly double the sub-carriers cannot pay back a third of the bits per symbol"', () => {
    // 160 MHz has twice 80 MHz's sub-carriers, and MCS 0 carries a third of MCS 2's bits
    expect(toneRatio('eht', 160) / toneRatio('eht', 80)).toBe(2)
    expect(PHY_MODES.eht.ndbps[2] / PHY_MODES.eht.ndbps[0]).toBe(3)
  })

  it('the worked example is the engine’s own six steps, value for value', () => {
    // "The living-room laptop, run through the steps at the two widest settings": every row
    // of that table, taken from the functions the steps name — negotiatedWidth (step 1),
    // noiseDbm (2), the RSSI of this very link (3), mcsForRssi with RATE_MARGIN_DB (4),
    // the mode's N_DBPS times toneRatio (5) and the symbol count and airtime (6).
    const sc = width.variants![3].scenario()
    const sta = sc.nodes.find((n) => n.id === 'sta-1')!
    sta.pos = { x: POS.x, y: POS.y, z: 1 }
    // step 1: both ends are set to the variant's width, and a link runs the narrower of the two
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    expect([sta.caps.widthMhz, ap.caps.widthMhz]).toEqual([160, 160])
    expect(negotiatedWidth(sta, ap)).toBe(160)
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    expect(Math.round(rssi * 100) / 100).toBe(-70.51)
    const r1 = (x: number) => Math.round(x * 10) / 10
    const r2 = (x: number) => Math.round(x * 100) / 100
    // step 2, and the step's own two constants
    expect(r2(noiseDbm(20))).toBe(-93.99)
    expect(r2(noiseDbm(40) - noiseDbm(20))).toBe(3.01)
    expect([r2(noiseDbm(80)), r2(noiseDbm(160))]).toEqual([-87.97, -84.96])
    // step 3
    const snr = (w: number) => rssi - noiseDbm(w)
    expect([r2(snr(80)), r2(snr(160))]).toEqual([17.46, 14.45])
    // step 4: the rung, what it asks for, and what the rung above it asks for
    expect([mcsForRssi('eht', rssi, 13, 80), mcsForRssi('eht', rssi, 13, 160)]).toEqual([2, 0])
    expect([r2(reqSinrDb('eht', 2)), r2(reqSinrDb('eht', 0))]).toEqual([13.99, 8.99])
    expect(RATE_MARGIN_DB).toBe(3)
    expect([r2(reqSinrDb('eht', 2) + 3), r2(reqSinrDb('eht', 0) + 3)]).toEqual([16.99, 11.99])
    expect([r2(reqSinrDb('eht', 3) + 3), r2(reqSinrDb('eht', 1) + 3)]).toEqual([19.99, 14.99])
    expect(snr(80)).toBeGreaterThan(reqSinrDb('eht', 2) + RATE_MARGIN_DB)
    expect(snr(80)).toBeLessThan(reqSinrDb('eht', 3) + RATE_MARGIN_DB)
    expect(snr(160)).toBeGreaterThan(reqSinrDb('eht', 0) + RATE_MARGIN_DB)
    expect(snr(160)).toBeLessThan(reqSinrDb('eht', 1) + RATE_MARGIN_DB)
    // "misses the rung above it by half a decibel"
    expect(r2(reqSinrDb('eht', 1) + RATE_MARGIN_DB - snr(160))).toBe(0.54)
    // step 5: the rung's bits per symbol at 20 MHz times the sub-carrier ratio, as printed
    expect([PHY_MODES.eht.ndbps[2], PHY_MODES.eht.ndbps[0]]).toEqual([351, 117])
    expect([r1(toneRatio('eht', 80)), r1(toneRatio('eht', 160))]).toEqual([4.2, 8.4])
    const ndbps = (mcs: number, w: number) => PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', w)
    expect([ndbps(2, 80), ndbps(0, 160)]).toEqual([1470, 980])
    // step 6: the frame's bits, the whole-symbol rounding and the airtime
    expect(16 + 8 * OCTETS + 6).toBe(12_262)
    expect([Math.ceil(12_262 / 1470), Math.ceil(12_262 / 980)]).toEqual([9, 13])
    expect([48 * US + 13_600 * 9, 48 * US + 13_600 * 13]).toEqual([170_400, 224_800])
    expect(txTimeModeNs('eht', OCTETS, 2, { widthMhz: 80 })).toBe(170_400)
    expect(txTimeModeNs('eht', OCTETS, 0, { widthMhz: 160 })).toBe(224_800)
    // and it is the airtime the run itself produces at that spot
    expect([w80.airtimeNs, w160.airtimeNs]).toEqual([170_400, 224_800])
  })

  it('deeper: the window in which the inversion happens at all is about one decibel wide', () => {
    // "The band of received power in which 160 MHz is genuinely slower than 80 MHz while both
    //  still decode every frame is only about one decibel wide. The living-room position sits
    //  at −70.51 dBm, near the middle of it, with roughly half a decibel to either edge."
    const sc = width.variants![3].scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x: POS.x, y: POS.y, z: 1 }
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    expect(Math.round(rssi * 100) / 100).toBe(-70.51)
    const decodes = (r: number, w: number): boolean =>
      r - noiseDbm(w) >= reqSinrDb('eht', mcsForRssi('eht', r, 13, w))
    const airtime = (r: number, w: number): number =>
      txTimeModeNs('eht', OCTETS, mcsForRssi('eht', r, 13, w), { widthMhz: w })
    const inverts = (r: number): boolean =>
      airtime(r, 160) > airtime(r, 80) && decodes(r, 160) && decodes(r, 80)
    let lo = Number.POSITIVE_INFINITY, hi = Number.NEGATIVE_INFINITY
    for (let n = -8000; n <= -6000; n++) {
      const r = n / 100
      if (inverts(r)) { lo = Math.min(lo, r); hi = Math.max(hi, r) }
    }
    expect(inverts(rssi)).toBe(true)
    expect(hi - lo).toBeGreaterThan(0.9)
    expect(hi - lo).toBeLessThan(1.1)
    // "roughly half a decibel to either edge"
    expect(rssi - lo).toBeGreaterThan(0.4)
    expect(hi - rssi).toBeGreaterThan(0.4)
  })
})

describe('width · the far corner', () => {
  const FAR = { x: 15, y: 7 }
  const corner = (i: number) => {
    const rs = moved(i, FAR.x, FAR.y, 200 * MS)
    const data = bigData(rs)
    return {
      acks: txs(rs, (r) => r.frame.kind === 'ack').length,
      drops: ofType(rs, 'DROP').length,
      airtimes: new Set(data.map((r) => r.frame.txTimeNs)),
    }
  }

  it('at the widest setting not one ACK comes back, and the three narrower ones deliver', () => {
    // "At the widest setting not one ACK comes back: every frame is sent and dropped. Step the
    //  width down and the link returns — 80 MHz delivers at 401.6 µs a frame, 20 MHz at 524.0,
    //  and 40 MHz, one rung lower still, is slowest of the three at 768.8."
    const [c20, c40, c80, c160] = [0, 1, 2, 3].map(corner)
    expect(c160.acks).toBe(0)
    expect(c160.drops).toBeGreaterThan(0)
    for (const [name, c] of [['20', c20], ['40', c40], ['80', c80]] as const) {
      expect(c.acks, `${name} MHz`).toBeGreaterThan(50)
    }
    expect([...c20.airtimes]).toEqual([524_000])
    expect([...c40.airtimes]).toEqual([768_800])
    expect([...c80.airtimes]).toEqual([401_600])
    // "slowest of the three": 40 MHz is one rung lower than 20 MHz there
    expect(768_800).toBeGreaterThan(524_000)
  })

  it('deeper: a legacy laptop falls back to 20 MHz and is acknowledged, at 704 µs and 18 Mb/s', () => {
    // "A legacy radio has no wide mode, so the link falls back to 20 MHz — and the
    //  acknowledgements come back, at 704 µs a frame and 18 Mb/s: five and a half times the
    //  airtime the same frame took on the desk."
    const sc = width.scenario()
    const sta = sc.nodes.find((n) => n.id === 'sta-1')!
    sta.pos = { x: FAR.x, y: FAR.y, z: 1 }
    sta.caps.generation = 'nonht'
    const rs = [...new Simulation(sc).runUntil(200 * MS).records]
    const data = bigData(rs)
    expect(txs(rs, (r) => r.frame.kind === 'ack').length).toBeGreaterThan(50)
    expect(one(data.map((r) => r.frame.widthMhz))).toBe(20)
    expect(one(data.map((r) => r.frame.txTimeNs))).toBe(704 * US)
    expect(one(data.map((r) => r.frame.mbps))).toBe(18)
    // "five and a half times the airtime the same frame took on the desk" (129.6 µs at 20 MHz)
    expect(Math.round((704_000 / 129_600) * 2) / 2).toBe(5.5)
  })
})

/**
 * The timing figure (§4: "同一帧在四种带宽下：前导码不动，数据段变短"), which replaced
 * the paragraph that said only the data block moves and the observe line that
 * subtracted the fixed opening from each of the four airtimes.
 */
describe('width · the figure is the run’s own four airtimes', () => {
  const spec = widthAirtimeTiming()
  const lane = (label: string) => spec.lanes.find((l) => l.label === label)!

  it('one lane per variant, each a fixed 48 µs opening and then the data', () => {
    expect(spec.lanes.map((l) => l.label)).toEqual(['20 MHz', '40 MHz', '80 MHz', '160 MHz'])
    for (const [i, label] of ['20 MHz', '40 MHz', '80 MHz', '160 MHz'].entries()) {
      const data = bigData(runOf(width, i, RUN_NS))
      const airtimeUs = one(data.map((r) => r.frame.txTimeNs)) / US
      const spans = lane(label).spans
      // the opening: the same span four times over, and it is the mode's own preamble
      expect([spans[0].fromUs, spans[0].toUs], label).toEqual([0, PHY_MODES.eht.preambleNs / US])
      // the data: from the end of that opening to the airtime the run prints
      expect([spans[1].fromUs, spans[1].toUs], label).toEqual([48, airtimeUs])
      expect(spans[1].tone, label).toBe('accent')
    }
    // "81.6、40.8、27.2, and at the widest setting a single 13.6 µs symbol"
    expect(spec.lanes.map((l) => Math.round((l.spans[1].toUs - l.spans[1].fromUs) * 10) / 10))
      .toEqual([81.6, 40.8, 27.2, 13.6])
    expect(spec.lanes[3].spans[1].toUs - spec.lanes[3].spans[1].fromUs)
      .toBeCloseTo(PHY_MODES.eht.symNs / US, 9)
    // the axis holds every span
    expect(spec.axis.toUs).toBeGreaterThan(Math.max(...spec.lanes.map((l) => l.spans[1].toUs)))
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(spec)
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})

/**
 * The subcarrier table a reader asked about. Its numbers come from 802.11be-2024's
 * Table 36-19 and cannot be derived, so what this pins is the relation the lesson
 * claims about them: data plus pilot is the total, and the data count grows by more
 * than the bandwidth ratio because the guard at each edge is paid once per channel
 * rather than once per 20 MHz. A table that drifts into self-contradiction fails here
 * even though nothing in the engine produces these figures.
 */
describe('width · the subcarrier table adds up', () => {
  const rows = width.numbers!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
    .find((b) => b.heading?.includes('子载波数是怎么来的'))!.rows
  const n = (s: string): number => Number(s.replace(/[^0-9]/g, ''))

  it('has data + pilot === total on every row', () => {
    expect(rows.length).toBe(4)
    for (const r of rows) expect(n(r[1]) + n(r[2]), r[0]).toBe(n(r[3]))
  })

  it('grows faster than the bandwidth ratio, which is the row the lesson explains', () => {
    const data = rows.map((r) => n(r[1]))
    // 20 -> 40 is exactly double; every wider step beats its own ratio.
    expect(data[1]).toBe(data[0] * 2)
    expect(data[2]).toBeGreaterThan(data[0] * 4)
    expect(data[3]).toBeGreaterThan(data[0] * 8)
  })

  it('matches the data column of the airtime table it explains', () => {
    const air = width.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('1500 字节的帧'))!.rows
    expect(rows.map((r) => n(r[1]))).toEqual(air.map((r) => n(r[1])))
  })
})

/**
 * The limit this slice is about: the one that had to change DIRECTION, and then had to get
 * SHORTER.
 *
 * It used to predict that a wider channel meets a dead patch more often. Task 6 of the
 * selectivity slice turned that around and carried the whole measurement into this one entry —
 * five drop rates, both ends of the deepest-bin column, the margin they are pooled at, the gap
 * between a 40 000-draw mean and a single round, and the noise floor's own rise. Task 7 then
 * registered the `selectivity` lesson immediately after this one, which is where all of that
 * belongs, so the entry now keeps the conclusion and hands the figures over through `until` —
 * the shape every other `until` in this course has (`ifs` → `edca`: 「那把梯子是后面一课的题目」).
 *
 * The pins are therefore about the HANDOVER, and the rule they enforce is that a figure has
 * exactly one home:
 *  - the mechanism, the direction, and the prediction the next sentence contradicts stay here;
 *  - no figure of the measurement is here, and every one of them is on `selectivity`'s main
 *    path, where tests/course/selectivity.test.ts measures it against the scene that produced
 *    it. Two lessons printing 14.39 % is two places to drift;
 *  - the three sentences this slice may never write stay forbidden here too, because the reason
 *    they are wrong does not depend on which lesson prints them: a drop COUNT (14/44/47/23/4
 *    and 871/252 are the four-width round sweep's, the rates are the pooled five-width group's —
 *    one sentence, one data set: review findings 1 and 4d), and §4.1's open-loop 34.43 % →
 *    7.14 %, which no lesson run produces (spec fix 124be31).
 */
describe('width · the flat-channel limit, the direction it changed, and the lesson it hands to', () => {
  const text = width.limits.map((l) => l.text).join('\n')
  const entry = width.limits.find((l) => l.until === 'selectivity')
  const sel = LESSONS.find((l) => l.id === 'selectivity')!
  const selText = lessonStrings(sel).join('\n')

  it('hands the figures to a lesson that exists and is the very next one', () => {
    expect(entry, 'the flat-channel limit no longer points at `selectivity`').toBeDefined()
    expect(COURSE_ORDER.indexOf('selectivity')).toBe(COURSE_ORDER.indexOf('width') + 1)
  })

  /**
   * **Split 2026-10-05, and the `kind` corrected with it (slice 4e, criterion A).**
   *
   * This used to be ONE `unmodelled` entry carrying the `until`, and it was compound. The
   * trunk — a flat channel, one level for the whole band — is a class of SCENARIO, and
   * `selectivity` really does open it: `selectivityScenario` is `widthScenario` plus the
   * top-level `fading` and `selectivity` sections, and this lesson's four scenes have
   * neither (pinned at the bottom of this file). That is the cleanest lift in the course.
   * The tail — no inter-bin correlation — is genuinely `unmodelled`, and NOTHING lifts it:
   * every lesson runs the same `fading.ts`, and `selectivity`'s own `limits[1]` declares it
   * again (「格间相关长度没有取值」), which is what "never lifted" looks like from the other
   * end. So the tail carries no pointer at all — not even `seeAlso`, because the lesson it
   * would point at restates it rather than deepening it.
   *
   * The trunk's opening sentence was rewritten in that commit and it is the only lesson
   * SENTENCE slice 4e changed. The reason is mechanical: the panel prefixes an
   * `out-of-scope` limit with 「这个模型答不了：」, and 「这个模型答不了：带宽在这里只是一个
   * 倍数」is not a sentence. It now opens on the scene instead and borrows `selectivity`'s
   * own `out-of-scope` idiom (「所以不要拿本课的场景去问……」). No figure moved.
   */
  it('splits the scenario-class trunk from the unmodelled tail, and only the trunk promises', () => {
    expect(entry!.kind, 'a promise to lift is only coherent about a scenario class').toBe('out-of-scope')
    // the rewritten opening: the scene first, so the 「这个模型答不了：」 prefix reads
    expect(entry!.text).toContain('本课这四档的信道是平的')
    expect(entry!.text).toContain('不要拿本课的场景去问')
    // and the trunk no longer opens on the multiplier, which is what made the prefix a non-sentence
    expect(entry!.text.startsWith('带宽在这里只是一个倍数')).toBe(false)

    const tail = width.limits.find((l) => l.text.includes('格间相关'))!
    expect(tail, 'the inter-bin-correlation tail is its own entry now').toBeDefined()
    expect(tail).not.toBe(entry)
    /*
     * **And the tail sits immediately after the trunk (2026-10-05 fix 4).** It opens
     * 「仍然没有的是格间相关」, and 「仍然」 has no antecedent of its own — it borrows the
     * trunk's, which works only because the panel renders `limits` in array order and these
     * two are adjacent. Keeping the cross-entry reference was a deliberate call (breaking it
     * costs a sentence), and the house rule is that something you chose to depend on gets
     * pinned. Without this line, inserting a limit between them — or sorting `width.limits`
     * by `kind` — would leave 「仍然」 pointing at the 3 dB rate-margin entry with every test
     * still green. `ru-diversity.test.ts` and `ofdma-dl.test.ts` freeze their whole kind
     * arrays for the same class of reason.
     */
    expect(width.limits.indexOf(tail)).toBe(width.limits.indexOf(entry!) + 1)
    expect(tail.kind).toBe('unmodelled')
    // no pointer of either sort: `selectivity` re-declares this one, it does not remove it
    expect(tail.until, 'no lesson lifts inter-bin correlation').toBeUndefined()
    expect(tail.seeAlso, '`selectivity` restates it rather than deepening it').toBeUndefined()
    expect(selText + sel.limits.map((l) => l.text).join('\n')).toContain('格间相关长度没有取值')
  })

  it('keeps the mechanism, and the prediction the next sentence contradicts', () => {
    // the bin width is the mechanism, not a measurement, and it is computed rather than typed
    expect(text).toContain(`${selBinWidthMhz()} MHz 一格`)
    // the prediction has to be made before it is contradicted, or the quotation marks argue with
    // something the text never said (review finding 6)
    expect(text).toContain('听起来就该越糟')
    expect(text).toContain('编码跨整条信道')
    expect(text).toContain('格间相关')
    // the conclusion, stated without any of the numbers behind it
    expect(text).toContain('可余量可比时的掉帧率是随带宽一路下降的')
    // and it still says which of its own figures the floor's rise is
    expect(text).toContain('噪声地板按带宽抬高的那一份')
  })

  it('prints no figure of the measurement, and `selectivity` prints every one', () => {
    for (const n of ['14.66', '13.10', '9.81', '5.61', '0.75', '12.05', '24.09', '10.29', '3.62', '2.36', '12.04']) {
      expect(text, `width's limits still print ${n}`).not.toContain(n)
      expect(selText, `selectivity does not print ${n}`).toContain(n)
    }
    // the shallower single-round figure in either spelling, and the column `9604fbc` retired
    // (those five rates were measured while the non-HT ACKs were still being binned)
    expect(text).not.toContain('10.1 dB')
    for (const stale of ['14.39', '12.71', '9.48', '5.09', '0.52', '10.08']) {
      expect(text, `width prints the retired ${stale}`).not.toContain(stale)
      expect(selText, `selectivity prints the retired ${stale}`).not.toContain(stale)
    }
  })

  it('no longer predicts that the wider channel is the one that drops more', () => {
    expect(text).not.toContain('而信道越宽，踩到这种坑的机会越多')
    expect(text).not.toContain('即便在编辑器里打开衰落也补不上这一条')
  })

  it('quotes no count from the other data set, and neither open-loop figure', () => {
    for (const n of ['14、44', '871', '252', '并不单调', '34.43', '7.14']) expect(text).not.toContain(n)
    // The round sweep's own statement, which is about a different grouping: it is true of
    // `selectivity`'s scene (where 20 MHz settles at 6.62 dB) and false of the pooled group, so
    // it may not appear here at all.
    expect(text).not.toContain('20 MHz 已经先降了一级')
    expect(text).not.toContain('不按余量分组看反倒显得它好')
  })

  it('and the four width variants are still the flat channel the limit opens with', () => {
    for (const sc of [width.scenario(), ...(width.variants ?? []).map((v) => v.scenario())]) {
      expect(sc.selectivity).toBeUndefined()
    }
  })
})

/**
 * The guard interval on a wide channel (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §7.3).
 *
 * **The -5.14 % below and the design's pooled +5.14 % are a coincidence of digits and nothing
 * else**, which is why the noise gate (tests/course/guard-interval-noise.test.ts) judges that
 * figure by FILE and never by number: the pooled one is instrument A's airtime RISE over 36
 * lessons and 9463 PPDUs, this one is instrument B's delivered-byte FALL on this lesson's own
 * 160 MHz scene. The limit states its own instrument beside the number, which is the only thing
 * that tells the two apart for a reader.
 */
describe('width · the guard interval costs a wide channel almost entirely in the preamble', () => {
  const MS_NS = 1_000_000
  const tier = (gi?: 'double' | 'quad') => {
    const base = width.scenario()
    const s = gi ? ({ ...base, guardInterval: { gi } } as Scenario) : base
    const rs = [...new Simulation(s).runUntil(150 * MS_NS).records]
    const octets = rs.filter((r): r is Extract<TLRecord, { type: 'RX_OK' }> => r.type === 'RX_OK')
      .reduce((a, r) => a + (r.frame.kind === 'data' ? r.frame.bytes : 0), 0)
    return { octets, rxFail: rs.filter((r) => r.type === 'RX_FAIL').length }
  }

  it('carries an out-of-scope limit that states its instrument beside its figures', () => {
    const lim = width.limits.find((x) => x.text.includes('保护间隔'))
    expect(lim, 'no limit mentions the guard interval').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.until).toBeUndefined()
    // The instrument, in the limit's own words rather than only in this test.
    expect(lim!.text).toContain('160 MHz')
    expect(lim!.text).toContain('150 ms')
    expect(lim!.text).toContain('送达字节')
  })

  it('and the two percentages it quotes are what this scene really does', () => {
    const base = tier()
    const dbl = tier('double')
    const quad = tier('quad')
    expect(base.rxFail).toBe(0)
    expect(quad.rxFail).toBe(0)
    const pct = (x: { octets: number }) => (((x.octets / base.octets) - 1) * 100).toFixed(2)
    expect(pct(dbl)).toBe('-0.43')
    expect(pct(quad)).toBe('-5.14')
    const lim = width.limits.find((x) => x.text.includes('保护间隔'))!
    expect(lim.text).toContain('0.43')
    expect(lim.text).toContain('5.14')
  })

  it('does not move the stated minutes: limits are outside mainPathChars', () => {
    expect(lessonChars(width)).toBe(2447)
    expect(lessonMinutes(width)).toBe(25)
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The four tables and the figure are read back above; the arithmetic that explains them is
 * not.** `scripts/figure-planting.ts` plants one edit per printed figure and runs this file: of
 * the 145 figures this lesson prints, PLACEHOLDER could be edited with the suite green.
 *
 * Nothing new is measured below. Every assertion calls the same `runOf`, `moved`, `bigData`,
 * `txTimeModeNs`, `noiseDbm`, `reqSinrDb`, `toneRatio`, `mcsForRssi` the tests above call, and
 * the figure comes out of the prose instead of out of this file — including `OCTETS` and
 * `TONES_20`, the two constants this file used to type for itself.
 */
describe('width · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(width).map((t) => t.text).join('\n')
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
  const nums = (width.numbers ?? []).map(blockText).join('\n')
  const deep = (width.deeper ?? []).map(blockText).join('\n')
  const limitsText = (width.limits ?? []).map((l) => l.text).join('\n')
  const srcText = (width.sources ?? []).join('\n')
  const obs = width.observe.join('\n')
  const quizText = width.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
  const tableOf = (fragment: string): Extract<Block, { kind: 'table' }> => {
    const b = width.numbers!.find(
      (x): x is Extract<Block, { kind: 'table' }> =>
        x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b!
  }
  const WIDTHS = [20, 40, 80, 160] as const
  /** 「路由器右边七格半、下面两格」, off the router's own place — read, not typed. */
  const LIVING_ROOM = (() => {
    const [rightZh, downZh] = raw(width.tryThis.join('\n'),
      /把笔记本拖到路由器右边(.+?)格半、下面(.)格/, '`tryThis` on where to drag the laptop')
    const ap = width.scenario().nodes.find((n) => n.id === 'ap')!
    return {
      x: ap.pos.x + zhNumeral(rightZh!.replace(/两/g, '二'))! + 0.5,
      y: ap.pos.y + zhNumeral(downZh!.replace(/两/g, '二'))!,
    }
  })()

  it('the octets and the tones this file used to type for itself', () => {
    // 「同一个 1500 字节的帧（空口上 1530 字节）」 — the heading of the lesson's own first table
    const [payload, octets] = figs(tableOf('同一个').heading ?? '',
      /同一个 (\d+) 字节的帧（空口上 (\d+) 字节）/, 'the first table’s own heading')
    const onAir = bigData(runOf(width, undefined, RUN_NS))[0]!
    expect(octets, 'the octets that frame really goes out as').toBe(onAir.frame.bytes)
    expect(payload, 'and the payload inside them').toBeLessThan(octets!)
    expect(octets, 'which is what this file calls OCTETS').toBe(OCTETS)
    // 「20 MHz 下每符号比特数」 and the 234 of the subcarrier table: the base every ratio is of
    const tones = tableOf('那一列子载波数').rows
    expect(val(tones[0]![1]!), 'the data tones of a 20 MHz channel').toBe(TONES_20)
    expect(PHY_MODES.eht.ndbps[0] * 2, 'which is what the engine’s own lowest rung implies')
      .toBe(val(tones[0]![1]!))
  })

  it('the subcarrier table’s own sums, and the relation the paragraph draws from them', () => {
    const rows = tableOf('那一列子载波数').rows
    // 「234 加 8 是 242，980 加 16 是 996」 — two of the table's own rows, restated in prose
    const sums = [...nums.matchAll(/(\d+) 加 (\d+) 是 (\d+)/g)].map((m) => m.slice(1).map(val))
    expect(sums.length, 'the paragraph works two of the rows out').toBeGreaterThanOrEqual(2)
    for (const [data, pilot, total] of sums) {
      const row = rows.find((r) => val(r[1]!) === data)
      expect(row, `a row whose data tones are ${data}`).toBeDefined()
      expect([val(row![2]!), val(row![3]!)], 'the pilots and the total that row prints')
        .toEqual([pilot, total])
      expect(data! + pilot!, 'and the sum is its own arithmetic').toBe(total)
    }
    // 「比四倍多 44 根」/「比八倍多 88 根」 — the last column, as its own arithmetic
    for (const row of rows) {
      const m = /比(.)倍多 (\d+) 根/.exec(row[4]!)
      if (m === null) continue
      const mult = zhNumeral(m[1]!.replace(/两/g, '二'))!
      expect(val(row[1]!) - mult * TONES_20, `${row[0]} MHz: how far past ${mult}× it is`)
        .toBe(val(m[2]!))
    }
    /*
     * 「带宽翻倍，数据音调不止翻倍」 — and the table's own last column says against what: every
     * row is compared with its own multiple of the 20 MHz value, not with the row above it
     * (160's tones ARE exactly twice 80's; what is more than the multiple is 1960 against
     * 8 × 234). 40 MHz's cell says 「数据恰好翻倍」, and it is exactly twice.
     */
    for (const [i, row] of rows.entries()) {
      if (i === 0) continue
      const mult = val(row[0]!) / val(rows[0]![0]!)
      if (row[4]!.includes('恰好翻倍')) {
        expect(val(row[1]!), `${row[0]} MHz: exactly its multiple, as its own cell says`)
          .toBe(mult * TONES_20)
      } else {
        expect(val(row[1]!), `${row[0]} MHz: past its multiple, as its own cell says`)
          .toBeGreaterThan(mult * TONES_20)
      }
    }
  })

  it('the airtime formula, fed back at all four widths', () => {
    const f = width.numbers!.find(
      (b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    // 「48 µs + 13.6 µs × ⌈(16 + 8·字节数 + 6) ÷ (20 MHz 下每符号比特数 × 子载波倍数)⌉」
    const [pre, sym, service, bits, tail] = figs(f.text,
      /(\d+) µs \+ ([\d.]+) µs × ⌈\((\d+) \+ (\d)·字节数 \+ (\d)\) ÷/,
      'the formula’s own terms')
    expect(pre! * US, 'the preamble this engine gives these PPDUs').toBe(PHY_MODES.eht.preambleNs)
    expect(sym! * US, 'and the symbol').toBe(PHY_MODES.eht.symNs)
    expect(bits, 'eight bits to an octet').toBe(8)
    const onAir = bigData(runOf(width, undefined, RUN_NS))[0]!
    for (const w of WIDTHS) {
      const ndbps = PHY_MODES.eht.ndbps[13]! * toneRatio('eht', w)
      const syms = Math.ceil((service! + bits! * onAir.frame.bytes + tail!) / ndbps)
      expect(pre! * US + sym! * US * syms, `${w} MHz: the lesson’s own formula`)
        .toBe(txTimeModeNs('eht', onAir.frame.bytes, 13, { widthMhz: w }))
    }
    // 「80 MHz 给的子载波比 20 MHz 的四倍还多一点点」 — the note's own claim about the ratio
    expect(toneRatio('eht', 80), 'the ratio 80 MHz really gets').toBeGreaterThan(4)
    expect(toneRatio('eht', 80), 'but only a little past it').toBeLessThan(4.5)
  })

  it('the noise the width costs, and the margin the desk has', () => {
    // 「带宽每翻一倍，收进来的噪声功率也翻一倍——3 dB——所以这里最宽的一档要比最窄的一档多约 9 dB」
    const [perDouble, across] = figs(nums,
      /也翻一倍——(\d) dB——所以这里最宽的一档要比最窄的一档多约 (\d) dB/,
      '`numbers` on what the width costs in noise')
    expect(Math.round(noiseDbm(2 * WIDTHS[0]) - noiseDbm(WIDTHS[0])),
      'one doubling of the width').toBe(perDouble)
    expect(Math.round(noiseDbm(WIDTHS[3]) - noiseDbm(WIDTHS[0])),
      'and the three doublings between the ends').toBe(across)
    // 「链路稳稳停在最高一级，信噪比 48.7 dB，而那一级要的是 48.0 dB」
    const [snr, needs] = raw(nums, /信噪比（signal-to-noise ratio, SNR）([\d.]+) dB，而那一级要的是 ([\d.]+) dB/,
      '`numbers` on the desk’s own margin')
    const rs = runOf(width, undefined, RUN_NS)
    const sc = width.scenario()
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    const top = PHY_MODES.eht.ndbps.length - 1
    same(snr!, rssi - noiseDbm(WIDTHS[3]), 'the SNR this link has at the widest channel')
    same(needs!, reqSinrDb('eht', top) + RATE_MARGIN_DB,
      'and what the top rung asks for, margin included')
    expect(bigData(rs)[0]!.frame.mcs, 'which is the rung it really sends at').toBe(top)
  })

  it('the step table of the living room, and the inversion it explains', () => {
    const rows = tableOf('照着步骤走一遍').rows
    /*
     * The position is read out of `tryThis` — 「把笔记本拖到路由器右边七格半、下面两格」 — in
     * squares off the router's own place, so neither coordinate is typed here.
     */
    const [rightZh, downZh] = raw(width.tryThis.join('\n'),
      /把笔记本拖到路由器右边(.+?)格半、下面(.)格/, '`tryThis` on where to drag the laptop')
    const right = zhNumeral(rightZh!.replace(/两/g, '二'))! + 0.5
    const down = zhNumeral(downZh!.replace(/两/g, '二'))!
    const ap = width.scenario().nodes.find((n) => n.id === 'ap')!
    const [x, y] = [ap.pos.x + right, ap.pos.y + down]
    const runs = [80, 160].map((w) => moved(WIDTHS.indexOf(w as 20 | 40 | 80 | 160), x, y))
    // 「这条链路的 RSSI −70.51 dBm」 — the same at both widths
    for (const col of [1, 2]) {
      const [dbm] = raw(rows[0]![col]!, /(−[\d.]+) dBm/, `the RSSI cell of column ${col}`)
      const sc = width.variants![0]!.scenario()
      sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x, y, z: 1 }
      same(dbm!, buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!, 'the link’s own level')
    }
    // the floor, the SNR, the rung and the two requirements, column by column
    for (const [i, w] of [80, 160].entries()) {
      const col = i + 1
      const [floor] = raw(rows[1]![col]!, /(−[\d.]+) dBm/, `${w} MHz: the noise floor cell`)
      same(floor!, noiseDbm(w), `${w} MHz: the floor this width gives`)
      const [snr] = raw(rows[2]![col]!, /([\d.]+) dB/, `${w} MHz: the SNR cell`)
      const sc = width.variants![0]!.scenario()
      sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x, y, z: 1 }
      const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
      same(snr!, rssi - noiseDbm(w), `${w} MHz: and the difference between them`)
      const [mcs] = figs(rows[3]![col]!, /MCS (\d+)/, `${w} MHz: the rung cell`)
      expect(mcs, `${w} MHz: the rung the engine picks there`)
        .toBe(mcsForRssi('eht', rssi, undefined, w))
      expect(bigData(runs[i]!)[0]!.frame.mcs, `${w} MHz: and the rung it really sends at`).toBe(mcs)
      // 「它要求 13.99 + 3 = 16.99 ✓」 and 「再上一级要求 16.99 + 3 = 19.99 ✗」
      const [needs, margin, total] = figs(rows[4]![col]!, /([\d.]+) \+ (\d) = ([\d.]+)/,
        `${w} MHz: what that rung requires`)
      same(String(needs), reqSinrDb('eht', mcs!), `${w} MHz: the rung’s own requirement`)
      expect(margin, 'the margin the engine takes it with').toBe(RATE_MARGIN_DB)
      expect(needs! + margin!, 'and their sum').toBeCloseTo(total!, 9)
      expect(total, 'which the SNR clears').toBeLessThanOrEqual(val(snr!))
      const [nextNeeds, nextMargin, nextTotal] = figs(rows[5]![col]!, /([\d.]+) \+ (\d) = ([\d.]+)/,
        `${w} MHz: what the next rung up requires`)
      same(String(nextNeeds), reqSinrDb('eht', mcs! + 1), `${w} MHz: the next rung’s requirement`)
      expect(nextNeeds! + nextMargin!, 'its own sum').toBeCloseTo(nextTotal!, 9)
      expect(nextTotal, 'which the SNR does not clear').toBeGreaterThan(val(snr!))
      // 「每符号比特数：20 MHz 的值 × 倍数」 — 「351 × 4.19 = 1470」
      const [base, ratio, product] = figs(rows[6]![col]!, /(\d+) × ([\d.]+) = (\d+)/,
        `${w} MHz: the bits a symbol carries`)
      expect(base, `${w} MHz: the 20 MHz value of that rung`).toBe(PHY_MODES.eht.ndbps[mcs!])
      same(String(ratio), toneRatio('eht', w), `${w} MHz: the tone ratio`)
      expect(Math.floor(base! * ratio!), 'and their product, as the engine floors it').toBe(product)
      // 「符号数：⌈12262 ÷ 它⌉」 and 「空口时间：48 + 13.6 × 符号数」
      const [syms] = figs(rows[7]![col]!, /^(\d+)$/, `${w} MHz: the symbol count`)
      const [airUs] = raw(rows[8]![col]!, /([\d.]+) µs/, `${w} MHz: the airtime`)
      same(airUs!, txTimeModeNs('eht', bigData(runs[i]!)[0]!.frame.bytes, mcs!, { widthMhz: w }) / US,
        `${w} MHz: the airtime the engine builds`)
      expect(syms, `${w} MHz: and the symbols inside it`)
        .toBe(Math.round((val(airUs!) * US - PHY_MODES.eht.preambleNs) / PHY_MODES.eht.symNs))
    }
    // 「⌈12262 ÷ 它⌉」 — the bits one frame is, service and tail included
    const [bitsTotal] = figs(rows[7]![0]!, /⌈(\d+) ÷/, 'the step row on the bits of one frame')
    const onAir = bigData(runs[0]!)[0]!
    expect(bitsTotal, 'the bits one frame carries, service and tail included')
      .toBe(16 + 8 * onAir.frame.bytes + 6)
    // 「阶梯上有一级只比下一级高 2 dB，而噪声地板抬高 3 dB 的这一步，正好把它整个跨了过去」
    const [narrow, rise] = figs(nums, /有一级只比下一级高 (\d) dB，而噪声地板抬高 (\d) dB/,
      '`numbers` on the narrow rung the inversion needs')
    /*
     * 「阶梯上有一级只比下一级高 2 dB」 — **a** rung, not the narrowest one (the ladder's smallest
     * step is 1 dB). What makes the sentence true is that a step of exactly that size exists
     * between two rungs, and that the floor's own step clears it — which is why the width jumps
     * the rung entirely.
     */
    const steps = PHY_MODES.eht.sensDbm.slice(1)
      .map((s, i) => s - PHY_MODES.eht.sensDbm[i]!)
    expect(steps, 'the ladder really takes a step that size').toContain(narrow)
    expect(Math.round(noiseDbm(160) - noiseDbm(80)), 'and the step the floor takes').toBe(rise)
    expect(rise, 'which is the larger of the two').toBeGreaterThan(narrow!)
  })

  it('`deeper`: the one-decibel window, and the legacy radio that still gets through', () => {
    // 「只有约一分贝宽……客厅那个位置落在 −70.51 dBm，靠近这个区间的正中，离两端各约半分贝」
    const [at] = raw(deep, /落在 (−[\d.]+) dBm/, '`deeper` on where the living room sits')
    const sc = width.variants![0]!.scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.pos = { ...LIVING_ROOM, z: 1 }
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    same(at!, rssi, 'the level that position really has')
    /*
     * 「约一分贝宽」 and 「各约半分贝」 are approximations in words (the lesson writes 「约」), so
     * what is measured is the window itself: the levels at which 160 MHz is slower than 80 MHz
     * and both still decode. One decibel is what that interval comes out as.
     */
    const inverted = (dbm: number): boolean => {
      const m80 = mcsForRssi('eht', dbm, undefined, 80)
      const m160 = mcsForRssi('eht', dbm, undefined, 160)
      if (m80 < 0 || m160 < 0) return false
      const bytes = OCTETS
      return txTimeModeNs('eht', bytes, m160, { widthMhz: 160 }) > txTimeModeNs('eht', bytes, m80, { widthMhz: 80 })
    }
    const span = (() => {
      let lo = rssi, hi = rssi
      while (inverted(lo - 0.01)) lo -= 0.01
      while (inverted(hi + 0.01)) hi += 0.01
      return hi - lo
    })()
    expect(Math.round(span), 'the window, to the decibel the lesson rounds it to').toBe(1)
    expect(Math.min(rssi - (rssi - span / 2), span / 2), 'and the position sits near its middle')
      .toBeGreaterThan(0.3)
    // 「每帧 704 µs、18 Mb/s：是同一帧在书桌上所花空口时间的五倍半」
    const [us, mbps] = raw(deep, /每帧 (\d+) µs、(\d+) Mb\/s/, '`deeper` on the legacy radio')
    const [times] = raw(deep, /是同一帧在书桌上所花空口时间的(.+?)倍/, 'and on how many times that is')
    // 「同一帧在书桌上所花空口时间」: the legacy radio falls back to 20 MHz, so that is the
    // airtime the five-and-a-half is against — the narrowest of the four, not the lesson's own
    const desk = bigData(runOf(width, 0, RUN_NS))[0]!.frame.txTimeNs / US
    expect(Math.round((val(us!) / desk) * 2) / 2, 'the ratio, to the half the sentence gives')
      .toBe(5.5)
    expect(times, 'which the lesson writes in Chinese').toContain('五')
    expect(val(mbps!), 'a legacy rate the engine has').toBeGreaterThan(0)
  })

  it('`limits` and `sources`: the margin that makes the inversion, and the two noise figures', () => {
    // 「把它改成 2 dB，客厅那个位置上 160 MHz 就落在 MCS 1 而不是 MCS 0，一帧 143.2 µs，比
    //  80 MHz 的 170.4 µs 更快——倒挂整个不存在了」
    const [newMargin, nowMcs, wasMcs, nowUs, thenUs] = figs(limitsText,
      /把它改成 (\d) dB，客厅那个位置上 160 MHz 就落在 MCS (\d) 而不是 MCS (\d)，一帧 ([\d.]+) µs，比 80 MHz 的 ([\d.]+) µs 更快/,
      '`limits` on what a smaller margin would do')
    const sc = width.variants![0]!.scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.pos = { ...LIVING_ROOM, z: 1 }
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    expect(mcsForRssi('eht', rssi, undefined, 160), 'the rung the shipped margin gives')
      .toBe(wasMcs)
    /*
     * `mcsForRssi` takes no margin — `RATE_MARGIN_DB` is a module constant — so the rung a
     * smaller margin would pick is worked out the way that function works it out, with the
     * lesson's own 2 dB in place of the engine's 3.
     */
    const rungAt = (margin: number, w: number): number => {
      const snr = rssi - noiseDbm(w)
      let best = 0
      for (let i = 0; i < PHY_MODES.eht.ndbps.length; i++) {
        if (reqSinrDb('eht', i) + margin <= snr) best = i
      }
      return best
    }
    expect(rungAt(RATE_MARGIN_DB, 160), 'the engine’s own margin gives the rung the table prints')
      .toBe(wasMcs)
    expect(rungAt(newMargin!, 160), 'and a 2 dB margin gives the one `limits` names').toBe(nowMcs)
    same(String(nowUs), txTimeModeNs('eht', OCTETS, nowMcs!, { widthMhz: 160 }) / US,
      'the airtime that rung would take')
    same(String(thenUs), txTimeModeNs('eht', OCTETS, mcsForRssi('eht', rssi, undefined, 80), { widthMhz: 80 }) / US,
      'against what 80 MHz takes')
    expect(nowUs, 'and it really would be the faster of the two').toBeLessThan(thenUs!)
    // 「算噪声地板用本仿真器选的 7 dB，而反推每一级所需信噪比时用的是标准灵敏度表自带的 10 dB」
    const [ours, theirs] = figs(limitsText,
      /算噪声地板用本仿真器选的 (\d+) dB，而反推每一级所需信噪比时用的是标准灵敏度表自带的 (\d+) dB/,
      '`limits` on the two noise figures')
    expect(Math.round(noiseDbm(20) - noiseDbm(20, 0)), 'the one the floor is computed with')
      .toBe(ours)
    expect(Math.round(PHY_MODES.eht.sensDbm[0]! - noiseDbm(20, theirs!) - reqSinrDb('eht', 0)),
      'and the one the sensitivity table carries').toBe(0)
    // 「信道按 2.03125 MHz 一格各抽一次衰落」
    const [bin] = raw(limitsText, /按 ([\d.]+) MHz 一格各抽一次衰落/, '`limits` on the selectivity grid')
    same(bin!, selBinWidthMhz(), 'the grid `selectivity.ts` uses')
    // 「跑三轮、runUntil(150 ms)」 and the two deltas
    const [ms] = figs(limitsText, /runUntil\((\d+) ms\)/, '`limits` on its own measurement')
    expect(ms! * MS, 'a window longer than this file’s own').toBeGreaterThan(RUN_NS)
    const [doubled, pre48, pre568, quad] = figs(limitsText,
      /双倍档 (−[\d.]+) %、四倍档（它连着 4× LTF，前导码从 (\d+) 变 ([\d.]+) µs）(−[\d.]+) %/,
      '`limits` on the guard-interval deltas') as (number | undefined)[]
    void doubled
    void quad
    expect(pre48! * US, 'the preamble the lesson’s own PPDUs use').toBe(PHY_MODES.eht.preambleNs)
    expect(pre568, 'and the longer one 4× LTF gives').toBeGreaterThan(pre48!)
    // `sources`: the four tone counts, the preamble and the symbol, and the 3 dB
    const four = figs(srcText, /(\d+)、(\d+)、(\d+)、(\d+) 这几个数据子载波数/,
      '`sources` on the four tone counts')
    expect(four, 'the four the table prints')
      .toEqual(tableOf('那一列子载波数').rows.map((r) => val(r[1]!)))
    const [pre, sym] = figs(srcText, /(\d+) µs 的前导码与 ([\d.]+) µs 的符号/,
      '`sources` on the two durations it owns')
    expect(pre! * US, 'the preamble').toBe(PHY_MODES.eht.preambleNs)
    expect(sym! * US, 'and the symbol').toBe(PHY_MODES.eht.symNs)
    const [perDouble] = figs(srcText, /“每翻一倍 (\d) dB”/, '`sources` on the noise law')
    expect(Math.round(noiseDbm(40) - noiseDbm(20)), 'one doubling').toBe(perDouble)
    const [narrow] = figs(srcText, /那一档 (\d) dB 窄阶/, '`sources` on the narrow rung')
    const steps = PHY_MODES.eht.sensDbm.slice(1)
      .map((s, i) => s - PHY_MODES.eht.sensDbm[i]!)
    expect(steps, 'a step of that size is what lets the inversion happen').toContain(narrow)
    expect(Math.round(noiseDbm(160) - noiseDbm(80)), 'and the floor’s own step clears it')
      .toBeGreaterThan(narrow!)
  })

  it('every width, every preamble and every symbol the prose names, wherever it names them', () => {
    const airtimes = WIDTHS.map(
      (_w, i) => bigData(runOf(width, i, RUN_NS))[0]!.frame.txTimeNs)
    // every 「N MHz」 of the lesson is one of the four widths it runs
    for (const v of everyFig(/(?<![\d.])(\d+) MHz/g, 'a width the prose names', 12)) {
      expect(WIDTHS, `${v} MHz is one of the four this lesson runs`).toContain(val(v))
    }
    // 「一条链路占用的频段有多宽：20、40、80 或 160 MHz」 — `terms`, in order
    const four = figs((width.terms ?? []).map((t) => t.plain).join('\n'),
      /有多宽：(\d+)、(\d+)、(\d+) 或 (\d+) MHz/, '`terms` on the four widths')
    expect(four, 'the four this lesson runs, in order').toEqual([...WIDTHS])
    /*
     * **A family read has to match the figure by its SHAPE, never by its value.** The first
     * version of this wrote `/(48) µs/g` — and a planted 49 simply dropped out of the match set
     * while the other copies still satisfied the count, so four sites stayed green. Every
     * sentence that gives one of the two durations is read on its own instead, by what is
     * around the number rather than by the number.
     */
    const [sameAcross] = raw(nums, /四条道上的前导码是同一段 ([\d.]+) µs/,
      'the caption on the preamble all four share')
    same(sameAcross!, PHY_MODES.eht.preambleNs / US, 'the preamble these PPDUs carry')
    const [oneSymbol] = raw(nums, /只剩一个 ([\d.]+) µs 的符号/,
      'the caption on what the widest frame is left with')
    same(oneSymbol!, PHY_MODES.eht.symNs / US, 'one symbol')
    const [stepPre, stepSym] = raw(nums, /就是 ([\d.]+) µs 的前导码，加上每个符号 ([\d.]+) µs/,
      'the steps on where the airtime goes')
    same(stepPre!, PHY_MODES.eht.preambleNs / US, 'the preamble, in the steps')
    same(stepSym!, PHY_MODES.eht.symNs / US, 'and the symbol')
    const [quizPre] = raw(quizText, /(\d+) µs 的前导码纹丝不动/, 'the quiz on the preamble')
    same(quizPre!, PHY_MODES.eht.preambleNs / US, 'the preamble, in the quiz')
    // 「变短的只有后面那截数据：81.6、40.8、27.2，到最宽的一档只剩一个 13.6 µs 的符号」
    const data = figs(nums, /那截数据：([\d.]+)、([\d.]+)、([\d.]+)，/,
      'the caption on the data part of each of the first three')
    data.forEach((us, i) => {
      same(String(us), (airtimes[i]! - PHY_MODES.eht.preambleNs) / US,
        `${WIDTHS[i]} MHz: the data part of that frame`)
    })
    expect(airtimes[3]! - PHY_MODES.eht.preambleNs, 'and the widest one is a single symbol')
      .toBe(PHY_MODES.eht.symNs)
    // 「数据 81.6」 and 「前导码 48」 — the figure's own labels
    const spec = JSON.stringify(widthAirtimeTiming())
    const [preLabel] = figs(spec, /前导码 (\d+)/, 'the figure’s preamble label')
    expect(preLabel! * US, 'the preamble it draws').toBe(PHY_MODES.eht.preambleNs)
    const [dataLabel] = figs(spec, /数据 ([\d.]+)/, 'the figure’s own first data label')
    same(String(dataLabel), (airtimes[0]! - PHY_MODES.eht.preambleNs) / US,
      'the data part it draws for the narrowest width')
    // 「式子里的 16 和 6，是每一帧都要在负载之外添上的服务位与尾位」 — and the formula body again
    const svcTail = [...EVERYWHERE.matchAll(/⌈\((\d+) \+ 8·字节数 \+ (\d)\)|式子里的 (\d+) 和 (\d)，/g)]
      .map((m) => m.slice(1).filter((x) => x !== undefined).map(val))
    expect(svcTail.length, 'the service and tail bits are named twice').toBeGreaterThanOrEqual(2)
    for (const p of svcTail) expect(p, 'and both namings agree').toEqual(svcTail[0])
    const onAir = bigData(runOf(width, undefined, RUN_NS))[0]!
    for (const [service, tail] of svcTail) {
      for (const [i, w] of WIDTHS.entries()) {
        const ndbps = PHY_MODES.eht.ndbps[13]! * toneRatio('eht', w)
        const syms = Math.ceil((service! + 8 * onAir.frame.bytes + tail!) / ndbps)
        expect(PHY_MODES.eht.preambleNs + PHY_MODES.eht.symNs * syms,
          `${w} MHz: those two bits give the engine’s own airtime`).toBe(airtimes[i])
      }
    }
    // 「20 MHz 是 −93.99 dBm，每翻一倍再加 3.01 dB」
    const [floor, perDouble] = raw(nums, /(?:20) MHz 是 (−[\d.]+) dBm，每翻一倍再加 ([\d.]+) dB/,
      'the steps on the noise floor')
    same(floor!, noiseDbm(WIDTHS[0]), 'the floor of the narrowest channel')
    same(perDouble!, noiseDbm(2 * WIDTHS[0]) - noiseDbm(WIDTHS[0]), 'and one doubling of it')
    // every 「3 dB 速率余量」 is the engine's own margin
    for (const v of everyFig(/\+ (\d) dB 速率余量|是 (\d) dB 这个速率余量/g, 'the rate margin', 2)) {
      expect(val(v), 'the margin `phy.ts` exports').toBe(RATE_MARGIN_DB)
    }
    // the living-room table: every airtime cell, and the row that is slower than the one above
    const rows = tableOf('同一台笔记本，挪到客厅中间').rows
    rows.forEach((row, i) => {
      const w = val(row[0]!)
      expect(WIDTHS, `row ${i}: a width this lesson runs`).toContain(w)
      const rs = moved(WIDTHS.indexOf(w as 20 | 40 | 80 | 160), LIVING_ROOM.x, LIVING_ROOM.y)
      const tx = bigData(rs)[0]!
      expect(val(row[1]!), `${w} MHz: the rung it sends at there`).toBe(tx.frame.mcs)
      same(row[2]!, tx.frame.txTimeNs / US, `${w} MHz: and the airtime it takes`)
    })
    const [slowerThan] = figs(rows[3]![3]!, /却比 (\d+) MHz 还慢/, 'the last row’s own remark')
    const slowRun = bigData(moved(WIDTHS.indexOf(160), LIVING_ROOM.x, LIVING_ROOM.y))[0]!
    const fastRun = bigData(moved(
      WIDTHS.indexOf(slowerThan as 20 | 40 | 80 | 160), LIVING_ROOM.x, LIVING_ROOM.y))[0]!
    expect(slowRun.frame.txTimeNs, `160 MHz really is slower than ${slowerThan} MHz there`)
      .toBeGreaterThan(fastRun.frame.txTimeNs)
  })

  it('`observe`, `tryThis` and the quiz: the four airtimes and the rate that never moves', () => {
    // 「129.6 µs、88.8、75.2、61.6」 — the four airtimes, in `observe` and again in the quiz
    const airtimes = WIDTHS.map(
      (_w, i) => bigData(runOf(width, i, RUN_NS))[0]!.frame.txTimeNs / US)
    const four = everyFig(/([\d.]+) µs、([\d.]+)、([\d.]+)、([\d.]+)/g,
      'the four blue blocks, wherever the prose lists them', 4).map(val)
    four.forEach((us, i) => {
      same(String(us), airtimes[i]!, `${WIDTHS[i]} MHz: the airtime that run really takes`)
    })
    // 「四种带宽都是 172.1 Mb/s，因为它报的是一组 20 MHz 子载波能装多少」
    const [mbps] = raw(obs, /都是 ([\d.]+) Mb\/s/, '`observe` on the rate row')
    for (const [i, w] of WIDTHS.entries()) {
      const tx = bigData(runOf(width, i, RUN_NS))[0]!
      same(mbps!, PHY_MODES.eht.mbps[tx.frame.mcs!]!, `${w} MHz: the rate row never moves`)
    }
    // the quiz: 「最窄的一档要 129.6 µs；到最宽的一档，子载波是八倍，却仍要 61.6 µs」
    const [narrowUs, mult, wideUs] = figs(quizText,
      /最窄的一档要 ([\d.]+) µs；到最宽的一档，子载波是(.)倍，却仍要 ([\d.]+) µs/,
      'the quiz on why it is not an eighth') as (number | undefined)[]
    same(String(narrowUs), airtimes[0]!, 'the narrowest channel’s airtime')
    same(String(wideUs), airtimes[3]!, 'and the widest one’s')
    expect(mult, 'the multiple is written in Chinese').toBeNaN()
    const [zh] = raw(quizText, /子载波是(.)倍/, 'the quiz on the tone multiple')
    expect(zhNumeral(zh!.replace(/两/g, '二')), 'eight times the tones')
      .toBe(Math.round(toneRatio('eht', 160) / toneRatio('eht', 20)))
    // 「81.6 µs 的符号最后只剩一个 13.6 µs 的符号。48 µs 的前导码纹丝不动，此时已占了整帧四分之三以上」
    const [dataUs, oneSym, pre] = figs(quizText,
      /([\d.]+) µs 的符号最后只剩一个 ([\d.]+) µs 的符号。(\d+) µs 的前导码/,
      'the quiz on where the time goes')
    expect(dataUs! * US, 'the data part at the narrowest width')
      .toBe(airtimes[0]! * US - PHY_MODES.eht.preambleNs)
    expect(oneSym! * US, 'one symbol').toBe(PHY_MODES.eht.symNs)
    expect(pre! * US, 'and the preamble').toBe(PHY_MODES.eht.preambleNs)
    expect(PHY_MODES.eht.preambleNs / (airtimes[3]! * US), 'which is over three quarters of the widest frame')
      .toBeGreaterThan(0.75)
  })
})
