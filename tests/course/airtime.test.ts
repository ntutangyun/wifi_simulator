/**
 * Every empirical claim in "One exchange, and how much of it is not your
 * payload", measured against the lesson's own scene (the oneRoom access point
 * and the video TV).
 *
 * Re-paced on 2026-09-25: the lesson stays one lesson and gives up the
 * bytes→microseconds derivation it shared with `frame-anatomy-bytes` (§5.1
 * item 1), so what used to be a six-step procedure and a worked table is now
 * three steps — the answer's own rate and the pause — over a cited result. Not
 * one pin went with the prose: the arithmetic below still guards the 125.6 µs
 * the lesson quotes, and the two paragraphs that restated the exchange table
 * are replaced by a `timing` figure, pinned here against the same run.
 *
 * The two claims this lesson used to share with tests/course/lesson-claims.test.ts
 * — "the ACK follows exactly one SIFS after every data block" and "the video
 * leaves the medium idle most of the time" — are re-asserted here beside the
 * sentences that now carry them; the originals stay where they are, so no pin
 * is lost. The lesson never had a `.body!` site in any test.
 */
import { describe, it, expect } from 'vitest'
import {
  airtime, exchangeTiming, ACK_US, DATA_US, EXCHANGE_US, PREAMBLE_US, SIFS_US,
} from '../../src/course/tier1/airtime'
import type { Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MANDATORY_MBPS, PHY_MODES, RATES, SIFS_NS, ctrlRespRateFor, ctrlRespRateForMode, txTimeModeNs, txTimeNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** 100 ms: the window the "117 frames" and the busy-fraction sentences are counted over. */
const RUN_NS = 100 * MS

const recs = (): TLRecord[] => runOf(airtime, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)

lessonShapeSuite(airtime, { runNs: RUN_NS })

describe('airtime · the lesson’s own scene', () => {
  it('is a Tier 1 lesson that names the lessons its words come from', () => {
    expect(MODULES[airtime.module].title).toBe('帧与空口时间')
    // Whole-track review I5, "the preamble has three names": `preamble` is now a term of
    // frame-anatomy-bytes, the lesson that counts its microseconds, and that lesson stays
    // in `needs` — this lesson uses the word and does not own it.
    // §6 of the re-pacing plan moves this to mcs-ladder / frame-anatomy-bytes / small-frames.
    // Two of those three are unregistered while the batches land, and `needs` is graded
    // against COURSE_ORDER, so the edge that names the byte count is the one that matters
    // here and the controller finishes the row when it registers the new ids.
    expect(airtime.needs).toEqual(['decode-thresholds', 'frame-anatomy-bytes'])
    // the owner table of the readability programme gives this lesson ACK; it is also
    // held to the opening rules (at most four new words) while it may be the first
    // migrated Wi-Fi lesson a reader meets.
    expect(airtime.terms!.map((t) => t.term)).toEqual(['ACK', 'payload'])
    expect(airtime.terms!.length).toBeLessThanOrEqual(4)
    expect(airtime.picture!.some((b) => b.kind === 'table')).toBe(false)
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(airtime.scenario())).not.toThrow()
    expect(airtime.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1'])
    expect(airtime.variants).toBeUndefined()
  })
})

describe('airtime · one exchange in this room', () => {
  it('the data frame is 1430 bytes and 125.6 µs, the same one every time', () => {
    // the table's "The whole data frame … 125.6 µs" and "the 1430-byte payload" rows, and
    // the observation "1430 bytes and 125.6 µs of air, every time"
    const data = txs('data')
    expect(data.length).toBe(117)
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([1430]))
    expect(new Set(data.map((r) => r.frame.txTimeNs))).toEqual(new Set([125_600]))
    expect(new Set(data.map((r) => r.frame.mcs))).toEqual(new Set([11]))
    expect((125_600 / US).toFixed(1)).toBe('125.6')
  })

  it('44.0 µs of it is preamble and 81.6 µs is six symbols', () => {
    // the table's "Preamble of the data frame … 44.0 µs" and "6 data symbols × 13.6 µs …
    //  81.6 µs" rows, and the experiment "subtract the 44.0 µs preamble, divide the rest
    //  by 13.6 µs. You should land on exactly six symbols."
    const he = PHY_MODES.he
    expect(he.preambleNs).toBe(44_000)
    expect(he.symNs).toBe(13_600)
    expect((125_600 - 44_000) / 13_600).toBe(6)
    expect(6 * 13_600).toBe(81_600)
    expect(44_000 + 81_600).toBe(125_600)
    expect(txTimeModeNs('he', 1430, 11)).toBe(125_600)
  })

  it('the cited 125.6 µs is the engine’s own arithmetic, step for step', () => {
    // Step 1 of the steps block now CITES this instead of deriving it — "数据帧的 125.6 µs
    // 不必再算一遍：上一课的六步已经给出了它" — and `frame-anatomy-bytes` owns the derivation.
    // The pin stays here, because the lesson still quotes the number: it is checked against
    // txTimeModeNs in src/engine/phy.ts, the function that produced the 125.6 µs on the
    // timeline.
    const he = PHY_MODES.he
    const ndbps = he.ndbps[11]
    expect(ndbps).toBe(1950)
    const bits = 16 + 8 * 1430 + 6
    expect(bits).toBe(11_462)
    expect(Math.ceil(bits / ndbps)).toBe(6)
    expect(he.preambleNs + he.symNs * 6).toBe(125_600)
    // proving the rule rather than the one value: the step order reproduces the engine
    // for every frame size, padding of the last symbol included
    for (const len of [14, 64, 300, 715, 1430, 2304, 3000]) {
      const nsym = Math.ceil((16 + 8 * len + 6) / ndbps)
      expect(txTimeModeNs('he', len, 11)).toBe(he.preambleNs + he.symNs * nsym)
    }
  })

  it('the rate of the answer is the rule step 5 now states, not a fixed 24 Mb/s', () => {
    // Whole-track review I4: step 5 used to say the ACK goes out at 24 Mb/s "so that every
    // radio in the room can read it", which is neither the engine's rule nor true (the rate
    // every radio can read is 6). The rule is ctrlRespRateFor: the highest of 6, 12 and 24
    // that does not exceed the eliciting frame's non-HT reference rate.
    expect(MANDATORY_MBPS).toEqual([6, 12, 24])
    expect(ctrlRespRateFor(54)).toBe(24)
    expect(ctrlRespRateFor(24)).toBe(24)
    expect(ctrlRespRateFor(18)).toBe(12)
    expect(ctrlRespRateFor(6)).toBe(6)
    // "24 Mb/s on this link": the data frames of this scene read back as 24 through the
    // same function the engine calls for a control response.
    const data = txs('data')
    expect(data.length).toBeGreaterThan(0)
    for (const r of data) expect(ctrlRespRateForMode(r.frame.mode!, r.frame.mcs!, r.frame.mbps)).toBe(24)
  })

  it('the answer is timed by the same formula, two symbols at 24 Mb/s', () => {
    // the last two steps: "the ACK is 14 bytes" at that rate and "two symbols
    //  of 4 µs behind a 20 µs preamble — 28 µs"
    expect(new Set(txs('ack').map((r) => r.frame.mbps))).toEqual(new Set([24]))
    const nonht = PHY_MODES.nonht
    expect(nonht.preambleNs).toBe(20_000)
    expect(nonht.symNs).toBe(4_000)
    const ndbps = RATES.find((r) => r.mbps === 24)!.ndbps
    expect(ndbps).toBe(96)
    expect(Math.ceil((16 + 8 * 14 + 6) / ndbps)).toBe(2)
    expect(txTimeNs(14, 24)).toBe(28_000)
    expect(20_000 + 2 * 4_000).toBe(28_000)
    expect(125_600 + SIFS_NS + 28_000).toBe(169_600)
  })

  it('the answer is 14 bytes and 28 µs, and follows exactly one 16 µs pause', () => {
    // the table's "The ACK … 28 µs" and "The pause before the answer … 16 µs" rows, the
    //  observation "starts 16 µs after the data block ends and lasts 28 µs — under a
    //  quarter of the frame it answers", and the picture's "sent back after a short fixed pause"
    const acks = txs('ack')
    expect(acks.length).toBe(116)
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([14]))
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([28_000]))
    expect(SIFS_NS).toBe(16_000)
    const ends = ofType(recs(), 'TX_END').filter((r) => r.frame.kind === 'data')
    for (const a of acks) {
      const d = ends.filter((e) => e.t <= a.t).pop()!
      expect(a.t - d.t).toBe(SIFS_NS)
    }
    // "under a quarter of the frame it answers"
    expect(28_000 / 125_600).toBeLessThan(0.25)
  })

  it('the whole exchange is 169.6 µs, of which 88.0 µs is fixed', () => {
    // the table's "整次交互 … 169.6 µs … 其中固定开销 88.0 µs，载荷 81.6 µs" and the figure's
    //  caption, "169.6 µs 里，只有 81.6 µs 在搬运载荷——其余 88.0 µs 是前导码、停顿和确认"
    //  (the paragraph that used to say the same thing a third time is gone)
    const exchange = 125_600 + SIFS_NS + 28_000
    expect(exchange).toBe(169_600)
    const fixed = 44_000 + SIFS_NS + 28_000
    expect(fixed).toBe(88_000)
    expect(fixed + 81_600).toBe(exchange)
    // "under half" is the payload's share, so the fixed part is the larger one
    expect(81_600 / exchange).toBeLessThan(0.5)
    expect(fixed).toBeGreaterThan(81_600)
  })

  it('the room is busy about 18 % of the time, and idle for the rest', () => {
    // observation 3, "在前 100 ms 里，信道忙的时间不到五分之一，尽管这路视频流一刻也没停"
    //  — the paragraph that printed the 117 frames and the 18 % is gone (§5.3); the counts
    //  are still pinned above, and the share is still pinned here
    const air = ofType(recs(), 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(air).toBe(117 * 125_600 + 116 * 28_000)
    const share = air / RUN_NS
    expect(Math.round(share * 100)).toBe(18)
    expect(share).toBeLessThan(0.2)
    expect(share).toBeGreaterThan(0.1)
  })
})

/**
 * The figure, pinned against the same run as the prose: the spans are read back
 * OUT of the spec the panel paints and compared with the engine's constants and
 * the run's own frames, so a figure that drifts fails here rather than
 * misleading a reader.
 */
describe('airtime · the figure is the run', () => {
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...airtime.picture!, ...airtime.numbers!].filter(isDiagram)

  it('draws the one figure §4 gives this lesson, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['timing'])
  })

  it('the four parts of the exchange are the four the run measures, in place and to scale', () => {
    const spec = diagrams[0].spec as TimingSpec
    expect(spec).toEqual(exchangeTiming())
    const data = txs('data')[0]
    const ack = txs('ack')[0]
    const [ap, tv] = spec.lanes
    // the data lane: a fixed preamble, then the symbols, ending on the frame's own airtime
    expect(ap.spans[0].toUs).toBe(PHY_MODES.he.preambleNs / 1000)
    expect(PREAMBLE_US).toBe(44)
    expect(ap.spans[1].fromUs).toBe(PREAMBLE_US)
    expect(ap.spans[1].toUs).toBe(DATA_US)
    expect(DATA_US * 1000).toBe(data.frame.txTimeNs)
    expect((ap.spans[1].toUs - ap.spans[1].fromUs) / (PHY_MODES.he.symNs / 1000)).toBe(6)
    // the gap between the lanes is the pause, and it is aSIFSTime
    expect(tv.spans[0].fromUs - ap.spans[1].toUs).toBe(SIFS_US)
    expect(SIFS_US * 1000).toBe(SIFS_NS)
    // the answer's own span is the answer's own airtime, and the axis is the whole exchange
    expect(tv.spans[0].toUs - tv.spans[0].fromUs).toBe(ACK_US)
    expect(ACK_US * 1000).toBe(ack.frame.txTimeNs)
    expect(spec.axis.toUs).toBe(EXCHANGE_US)
    expect(EXCHANGE_US).toBe(169.6)
    expect(spec.axis.ticks.at(-1)).toBe(EXCHANGE_US)
  })

  it('the caption’s share is the run’s: 81.6 µs of 169.6, the rest fixed', () => {
    const caption = diagrams[0].caption!
    expect(caption).toContain('81.6')
    expect(caption).toContain('88.0')
    expect(caption).toContain(`${SIFS_US} µs`)
    expect(PREAMBLE_US + SIFS_US + ACK_US).toBe(88)
    expect(DATA_US - PREAMBLE_US).toBe(81.6)
  })
})

describe('airtime · the two experiments and the quiz', () => {
  it('a legacy TV stretches the same payload to 232 µs', () => {
    // tryThis: "set the TV to 802.11a and reload. Same payload, far fewer bits per symbol:
    //  the frame stretches to 232 µs." Built here rather than as a lesson variant, so the
    //  recorded scenario hash of `airtime` is untouched.
    const base = airtime.scenario()
    const legacy: Scenario = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'sta-1' ? { ...n, caps: { ...n.caps, generation: 'nonht' as const } } : n)),
    }
    const rs = [...new Simulation(legacy).runUntil(50 * MS).records]
    const data = rs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'data')
    expect(data.length).toBeGreaterThan(10)
    // the same video payload; the frame is two octets shorter on the air because a legacy
    // header carries no QoS control field, which is why the sentence says "same payload"
    // rather than "the same 1430 bytes"
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([1428]))
    expect(new Set(data.map((r) => r.frame.txTimeNs))).toEqual(new Set([232_000]))
    expect(232_000).toBeGreaterThan(125_600)
    // and it is the symbols, not the header, that did it: 53 legacy symbols against six
    expect((232_000 - 20_000) / 4_000).toBe(53)
  })

  it('halving the payload saves 40.8 µs, not half the exchange', () => {
    // the quiz option "It falls by 40.8 µs — the three symbols you no longer need" and its
    //  explanation "six to three … the exchange lands at 128.8 µs"
    const half = txTimeModeNs('he', 715, 11)
    expect(half).toBe(84_800)
    expect((half - 44_000) / 13_600).toBe(3)
    expect(125_600 - half).toBe(40_800)
    expect(half + SIFS_NS + 28_000).toBe(128_800)
    expect(128_800).toBeGreaterThan(169_600 / 2)
  })
})
