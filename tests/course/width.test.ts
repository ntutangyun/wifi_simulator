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
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

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
