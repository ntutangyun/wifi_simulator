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
import type { Block } from '../../src/course/lessonKit'
import { width } from '../../src/course/tier2/width'
import { widthScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { negotiatedNss, nssOf } from '../../src/model/caps'
import {
  FCS_BYTES, PHY_MODES, QOS_HDR_BYTES, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, toneRatio,
  txTimeModeNs,
} from '../../src/engine/phy'
import { lessonTexts } from '../../src/course/readability'
import { buildLinkTable } from '../../src/engine/propagation'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
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

/**
 * The nine-thousand-bit symbol a reader asked about. Nothing in the engine publishes the
 * decomposition, so what this pins is that the lesson's arithmetic is the engine's: the per-stream
 * figure is EHT's own N_DBPS for this MCS, the four-stream figure is that times the streams, and
 * the rate it implies is the one the width lesson prints for a single stream. A table that drifts
 * from `txTimeModeNs`'s inputs fails here.
 */
describe('streams · the 9360 bits in one symbol are the engine’s own', () => {
  const rows = streams.numbers!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
    .find((b) => b.heading?.includes('1500 字节的帧'))!.rows
  const n = (s: string): number => Number(s.replace(/[^0-9]/g, ''))
  const MCS13 = PHY_MODES.eht.ndbps.length - 1

  it('uses EHT’s own N_DBPS for one stream, and multiplies by the stream count', () => {
    const perStream = PHY_MODES.eht.ndbps[MCS13]
    expect(n(rows[0][1])).toBe(perStream)
    for (const r of rows) expect(n(r[1]), r[0]).toBe(perStream * n(r[0]))
  })

  it('implies the single-stream rate the width lesson prints', () => {
    const perStream = PHY_MODES.eht.ndbps[MCS13]
    const mbps = perStream / (PHY_MODES.eht.symNs / 1000)
    expect(Math.round(mbps * 10) / 10).toBe(172.1)
  })
})

/**
 * The reader's own framing, and it is the engine's: a station emits one symbol at a time, and
 * every kind of parallelism multiplies what fits inside that one. `symNs` is a per-mode constant
 * — width, streams, MCS and RU share all leave it alone — while they all multiply `ndbps`. This
 * pins both halves, because a lesson claiming it is only worth the claim if the engine agrees.
 */
describe('streams · the symbol is the quantum of time, not of bits', () => {
  it('keeps one symbol duration whatever the width, the streams or the rate', () => {
    const sym = PHY_MODES.eht.symNs
    for (const widthMhz of [20, 40, 80, 160]) {
      for (const nss of [1, 2, 4]) {
        // airtime minus preamble must be a whole number of that one constant
        const t = txTimeModeNs('eht', 1530, PHY_MODES.eht.ndbps.length - 1, { widthMhz, nss })
        const body = t - PHY_MODES.eht.preambleNs
        expect(body % sym, `${widthMhz} MHz / ${nss} ss`).toBe(0)
        expect(body / sym).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('puts width and streams on the same side of the multiplication', () => {
    const mcs = PHY_MODES.eht.ndbps.length - 1
    // doubling the width and doubling the streams buy the same symbol count
    const wide = txTimeModeNs('eht', 1530, mcs, { widthMhz: 40, nss: 1 })
    const deep = txTimeModeNs('eht', 1530, mcs, { widthMhz: 20, nss: 2 })
    expect(wide).toBe(deep)
  })
})

/**
 * **The ruler for this lesson's one `until` (slice 4e, 2026-10-05).**
 *
 * `until` renders as 「（这一条在《…》里会被解除）」 — the named lesson REMOVES the
 * simplification — and until this commit nothing behind it was checked anywhere:
 * `tests/course/limits.test.ts` asked only that `mumimo` exists and is not `streams`, and
 * this file never mentioned `mumimo` once.
 *
 * The promise is kept, and the axis is worth writing down because it is NOT a capability
 * flag. The limit's own subject is 「这张桌子上只有一台站点」 — a station COUNT — and that
 * is what `mumimo` changes: one station here, four there. Measuring the difference in
 * negotiated feature flags instead would pass for the wrong reason (what differs is
 * `ampdu`/`txop`/`ofdma`, none of which this limit mentions), which is why criterion B in
 * `limits.test.ts` records the axis as prose a human wrote rather than as something a test
 * computes.
 */
describe('streams · the one-station limit, and the lesson that changes the room', () => {
  const lim = streams.limits.find((l) => l.until === 'mumimo')
  const stations = (id: string) => LESSONS.find((l) => l.id === id)!.scenario()
    .nodes.filter((n) => n.id !== 'ap')

  it('promises a lift, on the only kind a lift is coherent about', () => {
    expect(lim, 'the one-station limit no longer points at `mumimo`').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.seeAlso).toBeUndefined()
    expect(lim!.text).toContain('只有一台站点')
    // it already says what the lift requires, which is what makes the axis checkable
    expect(lim!.text).toContain('至少有两台设备同时排着队的房间')
  })

  it('and the axis is the station count, not a capability flag: one here, four there', () => {
    expect(stations('streams')).toHaveLength(1)
    expect(stations('mumimo')).toHaveLength(4)
  })

  it('and the flag difference would have passed for the wrong reason', () => {
    // Recorded, not asserted as a rule: the flags that differ between the two scenes are
    // `ampdu`/`txop`/`ofdma`, and this limit's sentence mentions none of them. A check that
    // went green off evidence it never asked for is worse than no check.
    const flags = (id: string) => new Set(
      stations(id).flatMap((n) => Object.entries(n.caps.features).filter(([, v]) => v).map(([k]) => k)),
    )
    const extra = [...flags('mumimo')].filter((f) => !flags('streams').has(f)).sort()
    expect(extra).toEqual(['ampdu', 'ofdma', 'txop'])
    for (const f of extra) expect(lim!.text, `the limit never mentions ${f}`).not.toContain(f)
  })
})

// --- every figure the lesson prints ------------------------------------------------------------

/**
 * **Every figure above is typed on this side.** `expect(PHY_MODES.eht.ndbps[13]).toBe(2340)`,
 * `expect([2340 * 4, 2340 * 2]).toEqual([9360, 4680])`, `expect(48 * US + 13_600 * 2)` — the
 * engine is pinned hard and the three tables a reader actually reads are free. Measured on
 * 2026-10-12: six figures planted in this lesson, six plantings unnoticed, 83 plantable figures.
 *
 * So each one is read out of the cell or the sentence it is printed in. The lesson's own
 * arithmetic makes most of it a chain: the subcarrier count, the bits a tone carries and the
 * code rate multiply out to the bits a symbol carries, which divides the frame into symbols,
 * which times the symbol plus the preamble is the airtime — and every link of that chain is
 * printed somewhere in the lesson, so every link is read.
 */
describe('streams · every figure the lesson prints, read back out of its own prose', () => {
  const EVERYWHERE = lessonTexts(streams).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/−/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
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
  type Tbl = { kind: 'table'; heading?: string; head: string[]; rows: string[][] }
  const tableOf = (by: string): Tbl => {
    const t = (streams.numbers ?? []).filter((b): b is Tbl => b.kind === 'table')
      .find((b) => (b.heading ?? '').includes(by))
    expect(t, `the table 「${by}」 is gone`).toBeDefined()
    return t!
  }
  const rowOf = (by: string, starts: string): string[] => {
    const r = tableOf(by).rows.find((x) => x[0].startsWith(starts))
    expect(r, `the row 「${starts}」 is gone from 「${by}」`).toBeDefined()
    return r!
  }

  it('the heading of the main table is the frame, the width and the rung the run really uses', () => {
    const t = tableOf('同一个')
    const [msdu, octets, width, mcs] = figs(t.heading!,
      /同一个 (\d+) 字节的帧（空口上 (\d+) 字节），(\d+) MHz，MCS (\d+)/, 'what the table holds fixed')
    expect(octets, 'the frame on the air is the payload plus a QoS header and the check')
      .toBe(msdu + QOS_HDR_BYTES + FCS_BYTES)
    const sent = bigData(runOf(streams, undefined, RUN_NS))
    expect(one(sent.map((r) => r.frame.bytes)), 'and it is the frame this scene sends').toBe(octets)
    expect(one(sent.map((r) => r.frame.mcs)), 'at the rung the heading names').toBe(mcs)
    for (const n of streams.scenario().nodes) {
      expect(n.caps.widthMhz, 'every radio at the width it names').toBe(width)
    }
  })

  it('the main table: one, two and four streams, cell for cell', () => {
    const t = tableOf('同一个')
    const [, octets, width, mcs] = figs(t.heading!,
      /同一个 (\d+) 字节的帧（空口上 (\d+) 字节），(\d+) MHz，MCS (\d+)/, 'what the table holds fixed')
    const perStream = PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', width)
    for (const r of t.rows) {
      const nss = val(r[0])
      expect(val(r[1]), `${nss} streams: the bits a symbol carries`).toBe(perStream * nss)
      const nsym = val(r[2])
      expect(Math.ceil((16 + 8 * octets + 6) / (perStream * nss)),
        `${nss} streams: the symbols that frame needs`).toBe(nsym)
      same(r[3], txTimeModeNs('eht', octets, mcs, { nss, widthMhz: width }) / 1000,
        `${nss} streams: the airtime`)
      expect(PHY_MODES.eht.preambleNs + nsym * PHY_MODES.eht.symNs,
        `${nss} streams: which is the preamble plus its symbols`)
        .toBe(txTimeModeNs('eht', octets, mcs, { nss, widthMhz: width }))
    }
    // 「符号数」 stops falling before 「空口时间」 does: the 4-stream row is one symbol over two
    const syms = t.rows.map((r) => val(r[2]))
    expect(syms[0] / syms[1], 'two streams halve the symbols of one').toBe(2)
    expect(syms[1] - syms[2], 'and four take only one more off').toBe(1)
  })

  it('the symbol, the tones, the bits and the code rate: the chain that produces 2340', () => {
    // 「T_SYM = T_DFT + T_GI … 这里是 13.6 µs」, and every other statement of the symbol
    for (const v of everyFig(/这里是 ([\d.]+) µs|而是 ([\d.]+) µs 里|每个符号 ([\d.]+) µs|÷ ([\d.]+) µs/g,
      'the symbol interval', 3)) {
      same(v, PHY_MODES.eht.symNs / 1000, 'the symbol of this generation')
    }
    // 「20 MHz 上有 234 根数据子载波」, 「每根子载波一次携带 12 个比特」, 「五分之六是数据」
    const [width, tones] = figs(EVERYWHERE, /(\d+) MHz 上有 (\d+) 根数据子载波/,
      'the tones a 20 MHz channel carries')
    const [bits] = figs(EVERYWHERE, /每根子载波一次携带 (\d+) 个比特/, 'the bits a tone carries')
    const [tones2, bits2, five, six, perStream] = figs(EVERYWHERE,
      /一条流一个符号装 (\d+) × (\d+) × (\d+)\/(\d+) = (\d+) 个数据比特/, 'the chain, multiplied out')
    expect([tones2, bits2], 'the same tones and the same bits').toEqual([tones, bits])
    expect(tones * bits * (five / six), 'the lesson’s own arithmetic').toBe(perStream)
    expect(perStream, 'and that is what this engine says a symbol carries')
      .toBe(PHY_MODES.eht.ndbps[13] * toneRatio('eht', width))
    // 「234 × 4 = 936 个并排的星座点，每个带 12 个原始比特，六分之五是数据，合起来 9360」
    const [t3, nss, points, bits3, total] = figs(EVERYWHERE,
      /(\d+) × (\d+) = (\d+) 个并排的星座点，每个带 (\d+) 个原始比特，六分之五是数据，合起来 (\d+)/,
      'the constellation points of four streams')
    expect([t3, bits3], 'the same tones and bits again').toEqual([tones, bits])
    expect(t3 * nss, 'the points a symbol holds').toBe(points)
    expect(points * bits3 * (five / six), 'and the data bits they come to').toBe(total)
    expect(total, 'which is the engine’s own figure for that many streams')
      .toBe(PHY_MODES.eht.ndbps[13] * toneRatio('eht', width) * nss)
    // 「9360 ÷ 13.6 µs = 688.2 Mb/s」, and 「一条流那一行正好是 172.1 Mb/s」
    const [bits4, us, mbps] = raw(EVERYWHERE,
      /就是 (\d+) ÷ ([\d.]+) µs = ([\d.]+) Mb\/s/, 'the rate four streams reach')
    expect(val(bits4), 'the same bits a symbol carries').toBe(total)
    same(us, PHY_MODES.eht.symNs / 1000, 'over one symbol')
    same(mbps, val(bits4) / (PHY_MODES.eht.symNs / 1000), 'is that rate')
    same(raw(EVERYWHERE, /正好是第三十三课反复出现的那个 ([\d.]+) Mb\/s/,
      'the single-stream rate the width lesson prints')[0], mcsRateMbps('eht', 13),
      'the rate of one stream at this rung')
  })

  it('the two mixed variants, and the figure that says which end decides', () => {
    const t = tableOf('两个混合变体')
    for (const [starts, v] of [['路由器 4', 3], ['160 MHz', 4]] as const) {
      const r = t.rows.find((x) => x[0].startsWith(starts))!
      const sc = streams.variants![v].scenario()
      const ap = sc.nodes.find((n) => n.id === 'ap')!
      const sta = sc.nodes.find((n) => n.id === 'sta-1')!
      expect(val(r[1]), `${starts}: the streams the link runs`).toBe(negotiatedNss(ap, sta))
      const airtimeNs = one(bigData(runOf(streams, v, RUN_NS)).map((r) => r.frame.txTimeNs))
      same(r[2].replace(' µs', ''), airtimeNs / 1000, `${starts}: its airtime`)
      // the variant's own label names the two ends, and the label is where the reader reads them
      const [a, b] = figs(streams.variants![v].label, /(\d+)[^\d]+(\d+)/, `${starts}: the label`)
      if (starts === '路由器 4') {
        expect([a, b], 'the antennas the two ends have').toEqual([nssOf(ap), nssOf(sta)])
      } else {
        expect([a, b], 'the width and the streams the label names')
          .toEqual([ap.caps.widthMhz, negotiatedNss(ap, sta)])
      }
    }
    // 「落在两流的 88.8 µs 上，而不是四流的 75.2 µs」, in the caption
    const [two, four] = raw(EVERYWHERE,
      /落在两流的 ([\d.]+) µs 上，而不是四流的 ([\d.]+) µs/, 'the two airtimes the caption compares')
    const octets = one(bigData(runOf(streams, 3, RUN_NS)).map((r) => r.frame.bytes))
    same(two, txTimeModeNs('eht', octets, 13, { nss: 2 }) / 1000, 'two streams')
    same(four, txTimeModeNs('eht', octets, 13, { nss: 4 }) / 1000, 'and four')
    // the figure's own labels: the antennas, the streams, the bits and the airtime
    const spec = streamsNegotiationStack()
    const labels = JSON.stringify(spec)
    const [apAnt] = figs(labels, /路由器 (\d+) 根天线/, 'the router’s antennas')
    const [staAnt] = figs(labels, /手机 (\d+) 根天线/, 'the phone’s')
    const sc = streams.variants![3].scenario()
    expect([apAnt, staAnt], 'what the two ends really have').toEqual([
      nssOf(sc.nodes.find((n) => n.id === 'ap')!), nssOf(sc.nodes.find((n) => n.id === 'sta-1')!),
    ])
    const [runs] = figs(labels, /链路跑 (\d+) 条流/, 'what the link runs')
    expect(runs, 'the smaller of the two').toBe(Math.min(apAnt, staAnt))
    const [perSym] = figs(labels, /每符号 (\d+) 比特/, 'the bits a symbol carries there')
    expect(perSym, 'that many streams of this rung').toBe(PHY_MODES.eht.ndbps[13] * runs)
    same(raw(labels, /一帧 ([\d.]+) µs/, 'and the airtime it ends on')[0],
      txTimeModeNs('eht', octets, 13, { nss: runs }) / 1000, 'the frame')
  })

  it('the five steps, and the worked table that walks them', () => {
    const steps = (streams.numbers ?? []).find(
      (b): b is { kind: 'steps'; items: string[] } => b.kind === 'steps')!
    const [width] = figs(steps.items.join('\n'), /该级在 (\d+) MHz 下的每符号比特数/,
      'the width the steps start from')
    const [pre, sym] = figs(steps.items.join('\n'),
      /= (\d+) µs 的前导码（preamble），加上每个符号 ([\d.]+) µs/, 'the airtime the steps end on')
    expect(pre * 1000, 'the preamble of this generation').toBe(PHY_MODES.eht.preambleNs)
    expect(sym * 1000, 'and its symbol').toBe(PHY_MODES.eht.symNs)
    // the worked table: the two ends, the streams, the rung, the bits, the symbols, the airtime
    const ends = rowOf('照着步骤走一遍', '两端各能跑几条')
    const runs = rowOf('照着步骤走一遍', '于是链路跑')
    const rung = rowOf('照着步骤走一遍', '级别')
    const perSym = rowOf('照着步骤走一遍', '每符号比特数')
    const nsym = rowOf('照着步骤走一遍', '符号数')
    const airtime = rowOf('照着步骤走一遍', '空口时间')
    const [bitsLabel] = figs(nsym[0], /⌈(\d+) ÷ 它⌉/, 'the bits the frame becomes')
    for (const [col, v] of [[1, 2], [2, 3]] as const) {
      const sc = streams.variants![v].scenario()
      const ap = sc.nodes.find((n) => n.id === 'ap')!
      const sta = sc.nodes.find((n) => n.id === 'sta-1')!
      const [a, b] = figs(ends[col], /(\d+) 和 (\d+)/, `column ${col}: what the two ends can run`)
      expect([a, b], `column ${col}: the antennas they have`).toEqual([nssOf(ap), nssOf(sta)])
      const nss = val(runs[col])
      expect(nss, `column ${col}: the streams the link runs`).toBe(negotiatedNss(ap, sta))
      expect(nss, 'which is the smaller of the two').toBe(Math.min(a, b))
      const [mcs] = figs(rung[col], /MCS (\d+)/, `column ${col}: the rung`)
      expect(mcs, `column ${col}: the rung the run uses`)
        .toBe(one(bigData(runOf(streams, v, RUN_NS)).map((r) => r.frame.mcs)))
      const [one20, times, product] = figs(perSym[col], /(\d+) × (\d+) = (\d+)/,
        `column ${col}: the bits a symbol carries`)
      expect(one20, 'the bits one stream carries at this width')
        .toBe(PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', width))
      expect(times, 'times the streams').toBe(nss)
      expect(one20 * times, 'is that many bits').toBe(product)
      const octets = one(bigData(runOf(streams, v, RUN_NS)).map((r) => r.frame.bytes))
      expect(bitsLabel, 'the bits this frame becomes').toBe(16 + 8 * octets + 6)
      expect(Math.ceil(bitsLabel / product), `column ${col}: the symbols`).toBe(val(nsym[col]))
      same(airtime[col].replace(' µs', ''),
        txTimeModeNs('eht', octets, mcs, { nss, widthMhz: width }) / 1000,
        `column ${col}: the airtime`)
    }
    // 「空口时间：48 + 13.6 × 符号数」 — the row label carries the same two constants
    const [pre2, sym2] = figs(airtime[0], /(\d+) \+ ([\d.]+) × 符号数/, 'the label of the last row')
    expect([pre2 * 1000, sym2 * 1000], 'the preamble and the symbol again')
      .toEqual([PHY_MODES.eht.preambleNs, PHY_MODES.eht.symNs])
  })

  /**
   * **The first pass left thirty-eight of the eighty-three unread** — the worst first pass of
   * this programme, and for one reason: it followed the lesson's chain of arithmetic and the
   * lesson states every link of that chain again in `observe`, in `tryThis`, in the quiz and in
   * the variant labels. 「88.8 µs」 appears four times, 「2 条流」 six, 「20 MHz」 five, 「3 dB」
   * three. The reads below take each quantity at every site, which is where every lesson in this
   * programme has ended up: **do this first, then go back for the figures that need an argument
   * of their own.**
   *
   * One exemption: `sources` says the draft's EHT-LTF counts are 「1、2、4、4」 for one, two,
   * three and four streams. This engine has no LTF count at all — the preamble is one constant —
   * so the four figures have nothing here to be checked against, and the sentence exists to say
   * that the airtime a reader computes from this lesson is not the whole PPDU.
   */
  it('the widths, the stream counts, the airtimes and the three decibels, at every site', () => {
    const scenes = [streams.scenario(), ...streams.variants!.map((v) => v.scenario())]
    // 「和上一课的 40 MHz 变体比一比」: the width lesson's scenes count too, and this file
    // already loads them for the comparison that sentence asks the reader to make.
    const widths = new Set<number>()
    for (const sc of [...scenes, width.scenario(), ...(width.variants ?? []).map((v) => v.scenario())]) {
      for (const n of sc.nodes) if (n.caps.widthMhz) widths.add(n.caps.widthMhz)
    }
    const octets = one(bigData(runOf(streams, undefined, RUN_NS)).map((r) => r.frame.bytes))
    const mcs = one(bigData(runOf(streams, undefined, RUN_NS)).map((r) => r.frame.mcs))!
    const perStream = PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', 20)
    const nssOfScene = (sc: Scenario): number => negotiatedNss(
      sc.nodes.find((n) => n.id === 'ap')!, sc.nodes.find((n) => n.id === 'sta-1')!)
    // every 「N MHz」 is a width one of this lesson's own scenes runs at
    for (const v of everyFig(/(?<![\d.])(\d+) MHz/g, 'a channel width', 6)) {
      expect([...widths], `${v} MHz is a width one of this lesson’s scenes runs at`)
        .toContain(val(v))
    }
    // every 「N 条流」 is a stream count one of them negotiates
    const counts = new Set(scenes.map(nssOfScene))
    for (const v of everyFig(/(?<![\d.])(\d+) 条流/g, 'a stream count', 6)) {
      expect([...counts], `${v} streams is what one of these scenes negotiates`)
        .toContain(val(v))
    }
    /*
     * And every variant LABEL that names a stream count names its own scene's. The membership
     * read above cannot do this one: 「1 条流」 edited to 「2 条流」 is still a count some scene
     * of this lesson negotiates, so the set contains it and the planting passes.
     */
    for (const [i, variant] of streams.variants!.entries()) {
      const m = /(\d+) 条流/.exec(variant.label)
      if (m) {
        expect(val(m[1]), `variant ${i + 1}: its label names its own stream count`)
          .toBe(nssOfScene(variant.scenario()))
      }
    }
    // every 「路由器 4 · 手机 2」 names the two ends of the mixed scene
    const mixed = streams.variants![3].scenario()
    const ends = [nssOf(mixed.nodes.find((n) => n.id === 'ap')!),
      nssOf(mixed.nodes.find((n) => n.id === 'sta-1')!)]
    const pairs = [...EVERYWHERE.matchAll(/路由器 (\d+) · 手机 (\d+)/g)]
      .map((m) => [val(m[1]), val(m[2])])
    expect(pairs.length, 'the lesson names that pair more than twice').toBeGreaterThan(2)
    for (const pair of pairs) expect(pair, 'the antennas of the two ends').toEqual(ends)
    // every airtime: 88.8 µs and 75.2 µs are the two the lesson compares, at two and four streams
    const airtimeAt = (nss: number): number => txTimeModeNs('eht', octets, mcs, { nss }) / 1000
    for (const v of everyFig(/同样是 ([\d.]+) µs|同样的 ([\d.]+) µs|帧要 ([\d.]+) µs|不是四流的 ([\d.]+) µs/g,
      'an airtime the lesson compares', 4)) {
      const dp = (v.split('.')[1] ?? '').length
      expect([...counts].map((n) => Number(airtimeAt(n).toFixed(dp))),
        `${v} µs is the airtime of one of these stream counts`).toContain(val(v))
    }
    // 「81.6 µs 变 40.8 µs。从两条到四条本该再减半到 20.4 µs，但帧只能按整数个符号发出去，所以
    //  停在 27.2 µs」: the data part at one, two and four streams, and the halving that is not one
    const dataUs = (nss: number): number =>
      (txTimeModeNs('eht', octets, mcs, { nss }) - PHY_MODES.eht.preambleNs) / 1000
    const [one1, two1, halfOfTwo, four1] = raw(streams.observe.join('\n'),
      /正好减半，([\d.]+) µs 变 ([\d.]+) µs。从两条到四条本该再减半到 ([\d.]+) µs[^]*?所以停在 ([\d.]+) µs/,
      '`observe` on the data part')
    same(one1, dataUs(1), 'the data part of one stream')
    same(two1, dataUs(2), 'and of two')
    same(halfOfTwo, dataUs(2) / 2, 'half of the two-stream part, which no frame can be')
    same(four1, dataUs(4), 'and what four streams really stop at')
    expect(val(four1) * 1000 % PHY_MODES.eht.symNs, 'because a frame is whole symbols').toBe(0)
    // 「每个变体的“速率”一行都是 MCS 13」
    for (const v of everyFig(/都是 MCS (\d+)/g, 'the rung every variant lands on', 1)) {
      for (const [i] of streams.variants!.entries()) {
        expect(one(bigData(runOf(streams, i, RUN_NS)).map((r) => r.frame.mcs)),
          `variant ${i + 1} runs at that rung`).toBe(val(v))
      }
    }
    // 「带宽那个倍数每翻一倍都要付 3 dB」, and the two places the lesson says it again
    const narrow = Math.min(...widths)
    for (const v of everyFig(/每翻一倍都要付 (\d+) dB|多要了 (\d+) dB 的信号|这就是那 (\d+) dB/g,
      'what a doubling of the width costs', 3)) {
      expect(val(v), 'the floor rises by that much when the channel doubles')
        .toBe(Math.round(noiseDbm(2 * narrow) - noiseDbm(narrow)))
    }
    // 「四条流就是它的四倍，9360」 and `sources` 「20 MHz 的一个符号装 2340 个数据比特」
    const [fourfold] = figs(EVERYWHERE, /四条流就是它的四倍，(\d+)/, 'the four-stream figure')
    expect(fourfold, 'four streams of this rung at this width').toBe(4 * perStream)
    const [srcWidth, srcBits] = figs(EVERYWHERE,
      /最高调制下 (\d+) MHz 的一个符号装 (\d+) 个数据比特/, '`sources` on one stream’s symbol')
    expect(srcBits, 'what one stream carries at that width')
      .toBe(PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', srcWidth))
    // 「上表里 2 条流那一行」 and 「上一课里单靠 160 MHz 的结果」, the two 「等同于」 cells
    const t = tableOf('两个混合变体')
    t.rows.forEach((r, i) => {
      const v = streams.variants![3 + i].scenario()
      const [, refNss] = /(\d+) 条流那一行/.exec(r[3]) ?? []
      if (refNss) {
        expect(val(refNss), `row ${i + 1}: the row of the main table it is equal to`)
          .toBe(nssOfScene(v))
      }
      const [, refWidth] = /单靠 (\d+) MHz/.exec(r[3]) ?? []
      if (refWidth) {
        expect([...v.nodes.map((n) => n.caps.widthMhz)],
          `row ${i + 1}: the width it is equal to`).toContain(val(refWidth))
      }
    })
  })
})
