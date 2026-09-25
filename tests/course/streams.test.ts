/**
 * Every empirical claim in "Spatial streams — several words at once", measured
 * against the lesson's own five variants.
 *
 * The airtimes are also walked variant by variant in
 * tests/course/quoted-timestamps.test.ts, and the frame-for-frame identity of
 * "Router 4 · Phone 2" with "2 streams" in tests/course/lesson-claims.test.ts.
 * What is pinned here is what this lesson's own sentences say: the bits per
 * symbol of the table, the negotiation down to the weaker end, the width that
 * buys one last symbol, and the two experiments.
 *
 * Re-paced on 2026-09-25 (§2 M9: the lesson stays whole). The negotiation down to
 * the weaker end is now the stack figure as well as the worked table, so the
 * figure is pinned against `negotiatedNss` and the run below, and its geometry is
 * checked here as well as in tests/course/diagram.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { streams, streamsNegotiationStack } from '../../src/course/tier2/streams'
import { width } from '../../src/course/tier2/width'
import { widthScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { negotiatedNss, nssOf } from '../../src/model/caps'
import { PHY_MODES, mcsForRssi, noiseDbm, reqSinrDb, toneRatio, txTimeModeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
/** 1500 bytes of payload leave the station as 1530 octets on the air. */
const OCTETS = 1530

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const bigData = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.bytes > 1000)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}

lessonShapeSuite(streams, { runNs: RUN_NS })

describe('streams · the lesson’s own scene', () => {
  it('needs the width lesson, and owns two words of its own', () => {
    expect(MODULES[streams.module].title).toBe('容量旋钮与速率控制')
    expect(streams.needs).toEqual(['width'])
    // `sub-carrier`, `symbol` and `noise floor` are width's words; this lesson adds the two
    // the picture is built on.
    expect(streams.terms!.map((t) => t.term)).toEqual(['spatial stream', 'antenna'])
  })

  it('opens on a single stream and keeps the five variants unchanged', () => {
    // "The lesson opens on a single stream; the buttons above step it to two, to four, and
    //  then to the two mixed cases."
    expect(streams.scenario()).toEqual(widthScenario(20, 1))
    expect(streams.variants!.map((v) => v.scenario())).toEqual([
      widthScenario(20, 1), widthScenario(20, 2), widthScenario(20, 4),
      widthScenario(20, 2, 4), widthScenario(160, 4),
    ])
    expect(() => ScenarioSchema.parse(streams.scenario())).not.toThrow()
    for (const v of streams.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })
})

describe('streams · the same frame at one, two and four streams', () => {
  const quotes = [
    { streams: 1, ndbps: 2340, symbols: 6, airtimeNs: 129_600 },
    { streams: 2, ndbps: 4680, symbols: 3, airtimeNs: 88_800 },
    { streams: 4, ndbps: 9360, symbols: 2, airtimeNs: 75_200 },
  ]

  it.each(quotes.map((q, i) => [q.streams, i, q] as const))(
    '%i stream(s): the table row the lesson prints is the row the run produces', (_n, i, q) => {
      const rs = runOf(streams, i, RUN_NS)
      const data = bigData(rs)
      expect(data.length).toBeGreaterThan(50)
      expect(one(data.map((r) => r.frame.bytes))).toBe(OCTETS)
      expect(one(data.map((r) => r.frame.widthMhz))).toBe(20)
      // the observation "the rate line reads MCS 13 in every variant, one stream or four"
      expect(one(data.map((r) => r.frame.mcs))).toBe(13)
      expect(one(data.map((r) => r.frame.mbps))).toBe(172.1)
      expect(one(data.map((r) => r.frame.txTimeNs))).toBe(q.airtimeNs)
      // the "Bits per symbol" and "Symbols" columns
      expect(PHY_MODES.eht.ndbps[13] * q.streams).toBe(q.ndbps)
      expect(Math.ceil((16 + 8 * OCTETS + 6) / q.ndbps)).toBe(q.symbols)
      expect((q.airtimeNs - PHY_MODES.eht.preambleNs) / PHY_MODES.eht.symNs).toBe(q.symbols)
      expect(txTimeModeNs('eht', OCTETS, 13, { nss: q.streams })).toBe(q.airtimeNs)
    })

  it('the data part halves from one stream to two, and stops at a whole symbol from two to four', () => {
    // "One stream to two: the data part halves exactly, 81.6 µs to 40.8 µs. Two to four would
    //  halve it again, to 20.4 µs, but a frame goes out in whole symbols, so it stops at 27.2 µs."
    const dataPart = (ns: number) => (ns - 48 * US) / US
    expect(quotes.map((q) => dataPart(q.airtimeNs))).toEqual([81.6, 40.8, 27.2])
    expect(dataPart(129_600) / 2).toBe(40.8)
    expect(dataPart(88_800) / 2).toBe(20.4)
    expect(PHY_MODES.eht.symNs / US).toBe(13.6)
  })

  it('a stream costs no sensitivity, because the channel is the same size', () => {
    // "The channel is the same size as it was, so the noise floor and every step of the
    //  sensitivity ladder stay exactly where they were. … Width is the one that costs 3 dB."
    for (const q of quotes) {
      const sc = streams.variants![quotes.indexOf(q)].scenario()
      for (const n of sc.nodes) expect(n.caps.widthMhz).toBe(20)
    }
    // the requirement per rung is a function of the MCS alone (reqSinrDb takes no width and
    // no stream count), so only the width's noise floor can move it
    expect(reqSinrDb('eht', 13)).toBeGreaterThan(reqSinrDb('eht', 12))
    expect(Math.round((noiseDbm(40) - noiseDbm(20)) * 100) / 100).toBe(3.01)
  })
})

describe('streams · the two mixed variants', () => {
  it('Router 4 · Phone 2 runs two streams: 88.8 µs, not the four-stream 75.2 µs', () => {
    // "A router with four antennas talking to a phone with two is a two-stream link" / "it lands
    //  on the two-stream 88.8 µs, not the four-stream 75.2 µs"
    const sc = streams.variants![3].scenario()
    expect(nssOf(sc.nodes.find((n) => n.id === 'ap')!)).toBe(4)
    expect(nssOf(sc.nodes.find((n) => n.id === 'sta-1')!)).toBe(2)
    const data = bigData(runOf(streams, 3, RUN_NS))
    expect(data.length).toBeGreaterThan(50)
    expect(one(data.map((r) => r.frame.txTimeNs))).toBe(88_800)
    expect(txTimeModeNs('eht', OCTETS, 13, { nss: 4 })).toBe(75_200)
  })

  it('it is frame for frame the two-stream run: "the same blocks in the same places"', () => {
    // the observation "Router 4 · Phone 2 is indistinguishable from 2 streams", and the
    // experiment "hunt for a difference on the timeline. There is none."
    const trace = (v: number) =>
      txs(runOf(streams, v, RUN_NS)).map((r) => [r.t, r.node, r.frame.kind, r.frame.txTimeNs])
    expect(trace(3)).toEqual(trace(1))
  })

  it('160 MHz · 4 streams is 61.6 µs: the widest channel’s own time, one symbol', () => {
    // "the frame comes out no shorter than the widest channel managed on its own: it was already
    //  down to a single symbol" / "Eight times the sub-carriers on top of four streams buys
    //  exactly one symbol: 61.6 µs against the four-stream 75.2 µs."
    const data = bigData(runOf(streams, 4, RUN_NS))
    expect(data.length).toBeGreaterThan(50)
    expect(one(data.map((r) => r.frame.widthMhz))).toBe(160)
    expect(one(data.map((r) => r.frame.mcs))).toBe(13)
    expect(one(data.map((r) => r.frame.txTimeNs))).toBe(61_600)
    // the same value the width lesson's widest variant produces — the table's "Same as" column
    expect(txTimeModeNs('eht', OCTETS, 13, { widthMhz: 160 })).toBe(61_600)
    expect(width.variants![3].scenario().nodes.find((n) => n.id === 'sta-1')!.caps.widthMhz).toBe(160)
    // one symbol is the floor: four streams on top of eight times the sub-carriers still round up
    expect((61_600 - 48 * US) / PHY_MODES.eht.symNs).toBe(1)
    expect(Math.ceil((16 + 8 * OCTETS + 6) / (2340 * toneRatio('eht', 160) * 4))).toBe(1)
    expect(75_200 - 61_600).toBe(PHY_MODES.eht.symNs)
  })

  it('the worked example is the engine’s own five steps, value for value', () => {
    // "Four streams, and the mixed pair, run through the steps": every row of that table,
    // from the functions the steps name — negotiatedNss (step 1), mcsForRssi, which takes
    // no stream count at all (2), the mode's N_DBPS times the stream count (3), and the
    // symbol count and airtime of txTimeModeNs (4 and 5).
    const ends = (v: number): [number, number] => {
      const sc = streams.variants![v].scenario()
      const ap = sc.nodes.find((n) => n.id === 'ap')!
      const sta = sc.nodes.find((n) => n.id === 'sta-1')!
      return [nssOf(ap), nssOf(sta)]
    }
    // step 1: "what each end can run", and "so the link runs" — the smaller of the two
    expect(ends(2)).toEqual([4, 4])
    expect(ends(3)).toEqual([4, 2])
    const link = (v: number): number => {
      const sc = streams.variants![v].scenario()
      return negotiatedNss(sc.nodes.find((n) => n.id === 'ap')!, sc.nodes.find((n) => n.id === 'sta-1')!)
    }
    expect([link(2), link(3)]).toEqual([4, 2])
    // step 2: the rung is chosen from the RSSI and the width; no stream count reaches it,
    // and both variants run the same width, so both land on the same rung the run shows
    const sc = streams.variants![3].scenario()
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    expect(mcsForRssi('eht', rssi, 13, 20)).toBe(13)
    expect(mcsForRssi('eht', rssi, 13, 20)).toBe(mcsForRssi('eht', rssi, 13, 20))
    expect(one(bigData(runOf(streams, 3, RUN_NS)).map((r) => r.frame.mcs))).toBe(13)
    // step 3: bits per symbol, as the table prints the arithmetic
    expect(PHY_MODES.eht.ndbps[13]).toBe(2340)
    expect(toneRatio('eht', 20)).toBe(1)
    expect([2340 * 4, 2340 * 2]).toEqual([9360, 4680])
    // steps 4 and 5: the whole-symbol rounding, and the fixed opening plus 13.6 µs a symbol
    expect(16 + 8 * OCTETS + 6).toBe(12_262)
    expect([Math.ceil(12_262 / 9360), Math.ceil(12_262 / 4680)]).toEqual([2, 3])
    expect([48 * US + 13_600 * 2, 48 * US + 13_600 * 3]).toEqual([75_200, 88_800])
    expect(txTimeModeNs('eht', OCTETS, 13, { nss: 4 })).toBe(75_200)
    expect(txTimeModeNs('eht', OCTETS, 13, { nss: 2 })).toBe(88_800)
    // and the mixed pair really does produce the two-stream time on the timeline
    expect(one(bigData(runOf(streams, 3, RUN_NS)).map((r) => r.frame.txTimeNs))).toBe(88_800)
  })

  it('the experiment: two streams here take the same 88.8 µs as 40 MHz did, for no extra signal', () => {
    // "compare 2 streams here with the 40 MHz variant of the last lesson: the same frame, the
    //  same 88.8 µs. Only one of the two asked the laptop for 3 dB more signal."
    expect(txTimeModeNs('eht', OCTETS, 13, { nss: 2 })).toBe(88_800)
    expect(txTimeModeNs('eht', OCTETS, 13, { widthMhz: 40 })).toBe(88_800)
    expect(Math.round((noiseDbm(40) - noiseDbm(20)) * 100) / 100).toBe(3.01)
  })
})

/**
 * The stack figure (§4: "发端天线、流、收端天线，以及取较小者"), which replaced the
 * paragraph that worked the 4-against-2 example in prose and the one that restated
 * the worked table's first two rows.
 */
describe('streams · the figure is the mixed variant’s own three numbers', () => {
  const spec = streamsNegotiationStack()

  it('three nested limits: the router’s four, the sender’s two, and the two it runs', () => {
    const sc = streams.variants![3].scenario()
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    const sta = sc.nodes.find((n) => n.id === 'sta-1')!
    // the boxes are sized by the counts themselves, so the innermost is the smaller end's
    expect(spec.layers.map((l) => l.bytes)).toEqual([nssOf(ap), nssOf(sta), negotiatedNss(ap, sta)])
    expect(spec.layers[2].bytes).toBe(Math.min(spec.layers[0].bytes, spec.layers[1].bytes))
    // the station is the one sending in this scene, which is what the middle layer's note says
    expect(sta.profiles).toEqual(['saturated'])
    expect(ap.profiles).toEqual(['idle'])
    // the innermost note and the total are the run's own bits per symbol and airtime
    expect(spec.layers[2].note).toBe(`每符号 ${PHY_MODES.eht.ndbps[13] * 2} 比特`)
    const data = bigData(runOf(streams, 3, RUN_NS))
    expect(spec.total).toBe(`一帧 ${one(data.map((r) => r.frame.txTimeNs)) / US} µs——两流的时间`)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(spec)
    const ts = lay.shapes.filter((x): x is Extract<Shape, { s: 'text' }> => x.s === 'text')
    expect(ts.length).toBeGreaterThan(5)
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
