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
 */
import { describe, it, expect } from 'vitest'
import { streams } from '../../src/course/tier2/streams'
import { width } from '../../src/course/tier2/width'
import { widthScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { nssOf } from '../../src/model/caps'
import { PHY_MODES, noiseDbm, reqSinrDb, toneRatio, txTimeModeNs } from '../../src/engine/phy'
import { lessonShapeSuite, runOf } from './kit'

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

lessonShapeSuite(streams, { proseMax: 700, runNs: RUN_NS })

describe('streams · the lesson’s own scene', () => {
  it('needs the width lesson, and owns two words of its own', () => {
    expect(streams.module).toBe(3)
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

  it('the experiment: two streams here take the same 88.8 µs as 40 MHz did, for no extra signal', () => {
    // "compare 2 streams here with the 40 MHz variant of the last lesson: the same frame, the
    //  same 88.8 µs. Only one of the two asked the laptop for 3 dB more signal."
    expect(txTimeModeNs('eht', OCTETS, 13, { nss: 2 })).toBe(88_800)
    expect(txTimeModeNs('eht', OCTETS, 13, { widthMhz: 40 })).toBe(88_800)
    expect(Math.round((noiseDbm(40) - noiseDbm(20)) * 100) / 100).toBe(3.01)
  })
})
