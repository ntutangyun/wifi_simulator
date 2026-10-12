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
  airtime, exchangeTiming, giNumbers, ACK_US, DATA_US, EXCHANGE_US, PREAMBLE_US, SIFS_US,
} from '../../src/course/tier1/airtime'
import type { Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'
import { MANDATORY_MBPS, PHY_MODES, RATES, SIFS_NS, TGI_NS, ctrlRespRateFor, ctrlRespRateForMode, mcsRateMbps, preambleNsFor, symNsFor, txTimeModeNs, txTimeNs } from '../../src/engine/phy'
import { LESSONS } from '../../src/course/lessons'
import { MODULES, lessonChars, lessonMinutes } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'

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
    expect(airtime.needs).toEqual(['mcs-ladder', 'small-frames'])
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
    // The main scene writes no `guardInterval`, so it is byte-for-byte the scene whose hash
    // the fixture has always held. This used to read `variants` is undefined; the guard-interval
    // slice gave the lesson exactly one, which is pinned here and in detail below — a pin that
    // says "nothing yet" has to be re-stated rather than deleted when something arrives.
    expect('guardInterval' in airtime.scenario()).toBe(false)
    expect(airtime.variants).toHaveLength(1)
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

/**
 * The guard interval as this lesson's third dimension (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §7.1, §7.2, §7.3, §8 items 8/9/10).
 *
 * It is hung on `airtime` rather than given a lesson of its own, for the reason §7.1 gives: the
 * only honest `why` a lesson of its own could have is a statement about this simulator, and a
 * 20-minute lesson titled "this knob gets you nothing" is the shape that would make a reader
 * feel played. `airtime`'s `why` is already "how long does one frame hold the air", and airtime
 * is the ONLY thing the guard interval is modelled to change — and this lesson's `tryThis[0]`
 * already says in so many words "take the 125.6 µs block, subtract the 44.0 µs preamble, and
 * divide what is left by 13.6 µs". That 13.6 is T_SYM1; what this slice adds is that it can also
 * be 14.4 or 16.
 */
describe('airtime · the guard interval, its cost and the side that is not here', () => {
  const giScene = (): Scenario => airtime.variants![0].scenario()
  /** Every non-AMP non-UWB PPDU of a run — the instrument §5 item 4 is measured on. */
  const ppdusOf = (rs: TLRecord[]) =>
    ofType(rs, 'TX_START').map((r) => r.frame).filter((f) => !f.amp && !f.uwb)
  const octetsOf = (rs: TLRecord[]) =>
    ofType(rs, 'RX_OK').reduce((s, r) => s + (r.frame.kind === 'data' ? r.frame.bytes : 0), 0)
  const mainText = (): string => lessonStrings({
    why: airtime.why, outcomes: airtime.outcomes, terms: airtime.terms,
    picture: airtime.picture, numbers: airtime.numbers,
    observe: airtime.observe, tryThis: airtime.tryThis, quiz: airtime.quiz,
  }).join(' | ')

  // (a) §8 item 8. The budget is a hard constraint and it belongs in a test, not in someone's
  // memory. Before this slice: 1569 chars, 3 observe, 2 tryThis -> 21.13 raw -> 20 minutes.
  // With one more observe the window for 25 minutes is 1430 <= chars <= 2529.
  it('(a) lands on 25 minutes, with one observe added and no tryThis', () => {
    expect(airtime.observe.length).toBe(4)
    expect(airtime.tryThis.length).toBe(2)
    expect(lessonChars(airtime)).toBeLessThanOrEqual(2529)
    expect(lessonChars(airtime)).toBeGreaterThanOrEqual(1430)
    expect(lessonMinutes(airtime)).toBe(25)
  })

  // (b) The variant differs from the main scene by one section and nothing else.
  it('(b) has one variant whose scene differs only by the guardInterval section', () => {
    expect(airtime.variants).toHaveLength(1)
    expect(airtime.variants![0].label).toContain('3.2')
    const main = airtime.scenario()
    const { guardInterval, ...restOfVariant } = giScene()
    expect(guardInterval).toEqual({ gi: 'quad' })
    expect(main.guardInterval).toBeUndefined()
    expect('guardInterval' in main).toBe(false)
    // Field for field: nodes, rooms, walls, servers, seed, thresholds, everything.
    expect(restOfVariant).toEqual(main)
    // And both parse, so the variant is a scene the engine will actually accept.
    expect(() => ScenarioSchema.parse(giScene())).not.toThrow()
  })

  // (c) §4's `echoFacts` rule: every figure the lesson prints is computed.
  it('(c) giNumbers() is three rows and not one literal, and the symbol count does not move', () => {
    expect(giNumbers()).toEqual([
      { giUs: 0.8, name: '基本', symUs: 13.6, frameUs: 125.6, mbps: 143.4 },
      { giUs: 1.6, name: '双倍', symUs: 14.4, frameUs: 130.4, mbps: 135.4 },
      { giUs: 3.2, name: '四倍', symUs: 16, frameUs: 148.8, mbps: 121.9 },
    ])
    // Each cell recomputed independently from the PHY's own functions.
    const tiers = [TGI_NS.base, TGI_NS.double, TGI_NS.quad]
    giNumbers().forEach((row, i) => {
      const gi = tiers[i]
      expect(row.giUs).toBe(gi / 1000)
      expect(row.symUs).toBe(symNsFor('he', gi) / 1000)
      expect(row.frameUs).toBe(txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs: gi }) / 1000)
      expect(row.mbps).toBe(mcsRateMbps('he', 11, gi))
      // §7.2: six symbols in all three tiers. Only each symbol's length moves.
      expect((row.frameUs * 1000 - preambleNsFor('he', gi)) / symNsFor('he', gi)).toBe(6)
    })
    // The lesson's long-standing 125.6 now has an instrument welded to it.
    expect(DATA_US).toBe(giNumbers()[0].frameUs)
    // And the three rows really are what the lesson prints.
    for (const s of ['13.6', '14.4', '16', '125.6', '130.4', '148.8', '143.4', '135.4', '121.9']) {
      expect(mainText(), `the table no longer prints ${s}`).toContain(s)
    }
  })

  // (d) The three figures in the new observe come out of two real rounds, not out of prose.
  it('(d) the fourth observe reads a real round: 350 PPDUs, 250 250 octets, 26.88 -> 30.94 ms', () => {
    const base = [...new Simulation(airtime.scenario()).runUntil(150 * MS).records]
    const quad = [...new Simulation(giScene()).runUntil(150 * MS).records]
    expect(ppdusOf(base).length).toBe(350)
    expect(ppdusOf(quad).length).toBe(350)
    expect(octetsOf(base)).toBe(250_250)
    expect(octetsOf(quad)).toBe(250_250)
    const ms = (rs: TLRecord[]) => +(ppdusOf(rs).reduce((s, f) => s + f.txTimeNs, 0) / 1e6).toFixed(2)
    expect(ms(base)).toBe(26.88)
    expect(ms(quad)).toBe(30.94)
    // The lesson prints those three and no others of that kind.
    const obs = airtime.observe[3]
    expect(obs).toContain('350')
    expect(obs).toContain('250 250')
    expect(obs).toContain(String(ms(base)))
    expect(obs).toContain(String(ms(quad)))
    // Every HE PPDU of the variant really is on the quadruple tier.
    const he = ppdusOf(quad).filter((f) => f.mode === 'he' || f.mode === 'eht')
    expect(he.length).toBeGreaterThan(0)
    expect(he.every((f) => f.giNs === 3_200)).toBe(true)
    expect(he.every((f) => f.txTimeNs === 148_800)).toBe(true)
  })

  /**
   * (e) The four clause numbers, written to the clause and not to the section.
   *
   * **The negative half cannot be a substring test, and that is a trap worth naming.** The
   * plan asked for `not.toContain('§19.3.2')` and `not.toContain('§32.3')` — but `§19.3.2` is a
   * prefix of the correct `§19.3.20` and `§32.3` is a prefix of the correct `§32.3.13`, so those
   * two assertions are unsatisfiable as written: they would fail on the right answer. Anchored
   * on a digit boundary they say what was meant, which is that the lesson must not use 4a's
   * imprecise forms.
   */
  it('(e) names §19.3.20 / §27.3.23 / §32.3.13 / §36.3.22, and none of the loose forms', () => {
    const t = mainText()
    for (const c of ['§19.3.20', '§27.3.23', '§32.3.13', '§36.3.22']) {
      expect(t, `the lesson no longer cites ${c}`).toContain(c)
    }
    expect(t).toContain('时延扩展')
    expect(t).toContain('5956')
    // The loose or wrong forms 4a used, each anchored so that the correct form does not trip it.
    expect(t).not.toMatch(/§19\.3\.2(?![0-9])/)
    expect(t).not.toContain('§19.3.3')
    expect(t).not.toMatch(/§32\.3(?![0-9.])/)
    expect(t).not.toContain('§36.3.x')
  })

  // (f) §7.3. Both halves: 44.0 µs is a tier, and the 4x LTF's 8.8 µs bought something that is
  // not built. Without the second one the 8.8 µs looks like a cost paid for nothing at all.
  it('(f) the limits say 44.0 µs is a tier, and that the 4x LTF buys an unbuilt thing', () => {
    const l0 = airtime.limits[0]
    expect(l0.kind).toBe('model-value')
    expect(l0.text).toContain('2× LTF')
    expect(l0.text).toContain('52.8')
    expect(l0.text).toContain('T_SYM1')
    const ltf = airtime.limits.find((x) => x.text.includes('4× LTF') && x.text.includes('信道估计'))
    expect(ltf, 'no limit says what the 4x LTF was spent on').toBeDefined()
    expect(ltf!.kind).toBe('unmodelled')
    expect(ltf!.text).toContain('8.8')
    expect(ltf!.until).toBeUndefined()
    // `sources` carries the four tables and the four transmit procedures.
    const src = airtime.sources!.join(' | ')
    expect(src).toContain('Table 27-13')
    expect(src).toContain('Table 36-18')
    expect(src).toContain('Table 27-86')
    expect(src).toContain('Table 36-76')
    expect(src).toContain('Table 27-1')
    expect(src).toContain('§19.3.20')
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson, site by site.**
 *
 * `scripts/figure-planting.ts` measured this lesson on 2026-10-12 and found **74 of its 86
 * printed figures editable with this file green** — the worst result of the first three sweeps,
 * in a lesson the prose-readback ratchet counts as having a read-back. Both halves of that are
 * true, and the reason is one assertion shape:
 *
 * ```ts
 * for (const s of ['13.6', '14.4', '16', '125.6', …]) expect(mainText()).toContain(s)
 * ```
 *
 * `mainText()` is the whole lesson joined with ` | `, so **any** occurrence satisfies it. This
 * lesson prints 125.6 five times, 44.0 four times and 16 µs six times; editing one of them
 * leaves the others to pass the check. A figure is pinned when the site that prints it is read,
 * not when the lesson mentions the number somewhere.
 *
 * So what follows reads each site: every cell of the exchange table with its own decimals, the
 * caption's three shares, the three steps' arithmetic including 「125.6 + 16 + 28 = 169.6」, the
 * two experiments, the three quiz figures, all four `observe` lines (the fourth against two real
 * 150 ms runs), and `limits`, which the graded walk never reads and which here carries the
 * engine's own decomposition of the preamble — 12.8 + 0.8 for a symbol, 6.4 + 0.8 → 12.8 + 3.2
 * for the long training field, and the 8.8 µs that buys something this engine does not have.
 *
 * The figures the sweep cannot reach are named here rather than left silent: the second table's
 * cells are built by `giNumbers()` from the PHY's own functions (so they cannot drift and (c)
 * above recomputes each one), and every clause number is a claim about a document this
 * repository does not contain.
 */
describe('airtime · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const data = txs('data')
  const acks = txs('ack')
  const he = PHY_MODES.he

  const tables = airtime.numbers!.filter((x) => x.kind === 'table') as
    { heading: string; head: string[]; rows: string[][] }[]
  const steps = (airtime.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const formula = airtime.numbers!.find((x) => x.kind === 'formula') as
    { text: string; note: string }
  const picture = airtime.picture! as { text?: string; caption?: string; heading?: string }[]
  const caption = picture.find((b) => b.caption)!.caption!
  const pictureText = picture.map((b) => b.text ?? '').join('\n')
  const quizText = airtime.quiz!.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')
  const sourcesText = airtime.sources!.join('\n')

  /** The captures of `re`, as printed: a figure's own decimals are part of its claim. */
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] =>
    raw(text, re, what).map((x) => Number(x.replace(/[\s,]/g, '')))
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** 「44.0 µs」 → 「44.0」: a cell that is one figure and its unit, and nothing else. */
  const cell = (text: string, unit: string, what: string): string =>
    raw(text, new RegExp(`^([\\d,.]+)\\s*${unit}$`), what)[0]
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number => zhCount(raw(text, re, what)[0])
  const ZH = '[〇一二三四五六七八九十两]+'
  /**
   * **A measurement in nanoseconds, as microseconds.** Every conversion in this block goes this
   * way and never the other: `125.6 * 1000` is 125600.00000000001, `13.6 * 1000` is
   * 13600.000000000002 and `0.8 * 1000` is 800.0000000000001, so multiplying a printed decimal
   * up to nanoseconds fails against an integer the engine holds exactly.
   */
  const us = (ns: number): number => Number((ns / US).toFixed(3))
  /** A sum of printed figures, rounded the way the printed ones are. */
  const add = (...xs: number[]): number => Number(xs.reduce((a, b) => a + b, 0).toFixed(3))

  it('the exchange table: six rows, and every cell of them', () => {
    const rows = tables[0].rows
    expect(rows, 'the table states exactly the six rows this reads').toHaveLength(6)
    const [preamble, symbols, frame, pause, answer, exchange] = rows
      .map((r, i) => Number(cell(r[1], 'µs', `row ${i}’s duration`).replace(/,/g, '')))

    // 「数据帧的前导码 · 44.0 µs · 固定值，与帧里装了什么无关」
    same(cell(rows[0][1], 'µs', 'the preamble'), he.preambleNs / US, 'the preamble in µs')
    // 「固定值」: the same preamble for every frame length this mode can carry
    for (const len of [14, 300, 1430, 3000]) {
      expect(txTimeModeNs('he', len, 11) % he.symNs, `a ${len}-byte frame`).toBe(preamble * US % he.symNs)
    }

    // 「6 个数据符号 × 13.6 µs · 81.6 µs · 那 1430 字节的载荷」
    const [count, symUs] = figs(rows[1][0], /(\d+) 个数据符号 × ([\d.]+) µs/, 'the symbols and their length')
    same(String(symUs), he.symNs / US, 'a symbol’s length in µs')
    expect(us(count * he.symNs)).toBe(symbols)
    const [payload] = figs(rows[1][2], /那 ([\d,]+) 字节的载荷/, 'the payload the symbols carry')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([payload]))
    expect(Math.ceil((16 + 8 * payload + 6) / he.ndbps[11]), 'the symbols that payload needs')
      .toBe(count)

    // 「整个数据帧 · 125.6 µs · 时间轴上那个色块量的就是它」
    same(cell(rows[2][1], 'µs', 'the whole data frame'), data[0].frame.txTimeNs / US,
      'the frame’s airtime in µs')
    expect(new Set(data.map((r) => us(r.frame.txTimeNs)))).toEqual(new Set([frame]))
    expect(add(preamble, symbols), 'the table’s own two parts against its own total').toBe(frame)

    // 「回答之前的停顿 · 16 µs · 每一次交互都一样」
    same(cell(rows[3][1], 'µs', 'the pause'), SIFS_NS / US, 'the pause in µs')
    const ends = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'data')
    for (const a of acks) {
      expect(a.t - ends.filter((e) => e.t <= a.t).pop()!.t, `the pause before the answer at ${a.t}`)
        .toBe(pause * US)
    }

    // 「ACK · 28 µs · 14 个字节，速率在 6、12、24 Mb/s 这三个强制速率里取不超过本帧参考速率的
    //  最高一个：这里是 24 Mb/s」
    same(cell(rows[4][1], 'µs', 'the answer'), acks[0].frame.txTimeNs / US, 'the answer in µs')
    const [bytes] = figs(rows[4][2], /(\d+) 个字节/, 'the answer’s length')
    const mandatory = figs(rows[4][2], /速率在 (\d+)、(\d+)、(\d+) Mb\/s/, 'the mandatory rates')
    const [picked] = figs(rows[4][2], /这里是 (\d+) Mb\/s/, 'the rate the rule picks here')
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(mandatory).toEqual(MANDATORY_MBPS)
    expect(new Set(acks.map((r) => r.frame.mbps))).toEqual(new Set([picked]))
    for (const r of data) {
      expect(ctrlRespRateForMode(r.frame.mode!, r.frame.mcs!, r.frame.mbps),
        `the response to a frame at ${r.frame.mbps} Mb/s`).toBe(picked)
    }
    expect(txTimeNs(bytes, picked), 'the answer timed by the same formula').toBe(answer * US)

    // 「整次交互 · 169.6 µs · 其中固定开销 88.0 µs，载荷 81.6 µs」
    same(cell(rows[5][1], 'µs', 'the whole exchange'), add(frame, pause, answer),
      'the whole exchange in µs')
    const [fixed, load] = figs(rows[5][2], /固定开销 ([\d.]+) µs，载荷 ([\d.]+) µs/,
      'the fixed part and the payload’s part')
    expect(add(preamble, pause, answer), 'the three parts that are not payload').toBe(fixed)
    expect(load).toBe(symbols)
    expect(add(fixed, load)).toBe(exchange)
    // 「—」 in the last 出处 cell: this row is the table's own sum, not a clause
    expect(rows[5][3]).toBe('—')
  })

  it('the guard-interval table’s own head: the frame, its symbols and its rung', () => {
    const head = tables[1].head
    expect(head, 'the table states exactly the four columns this reads').toHaveLength(4)
    const [bytes] = figs(head[2], /（([\d,]+) B/, 'the frame the three tiers are about')
    const syms = counted(head[2], new RegExp(`，(${ZH})个符号）`), 'its symbol count')
    const [rung] = figs(head[3], /第 (\d+) 级/, 'the rung the rate column is for')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(new Set(data.map((r) => r.frame.mcs))).toEqual(new Set([rung]))
    // six symbols in all three tiers is the sentence the prose turns on, so it is read here too
    for (const row of giNumbers()) {
      expect((row.frameUs * US - preambleNsFor('he', row.giUs * US)) / symNsFor('he', row.giUs * US),
        `the ${row.name} tier`).toBe(syms)
    }
    expect(Math.ceil((16 + 8 * bytes + 6) / he.ndbps[rung])).toBe(syms)
  })

  it('「量具」: the transform period, the width it computes at, and the rung', () => {
    const text = (airtime.numbers!.find((x) => (x as { text?: string }).text?.startsWith('量具')) as
      { text: string }).text
    const [dft] = figs(text, /符号时长就是 ([\d.]+) µs 的离散傅里叶变换/, '「量具」 on the transform period')
    const [width] = figs(text, /在 (\d+) MHz、单流、单用户/, '「量具」 on the width')
    const [rung] = figs(text, /scheme, MCS）(\d+)。/, '「量具」 on the rung')
    expect(us(symNsFor('he', TGI_NS.base) - TGI_NS.base)).toBe(dft)
    expect(new Set(data.map((r) => r.frame.widthMhz))).toEqual(new Set([width]))
    expect(new Set(data.map((r) => r.frame.mcs))).toEqual(new Set([rung]))
    // 「各算一次」: the third column really is that function at that width, one stream, one user
    for (const row of giNumbers()) {
      expect(row.frameUs, `the ${row.name} tier`)
        .toBe(us(txTimeModeNs('he', data[0].frame.bytes, rung, { widthMhz: width, giNs: row.giUs * US })))
    }
  })

  it('the formula and its note name the symbol the table prints', () => {
    const [symUs] = figs(formula.note, /就是上表里那 ([\d.]+) µs/, 'the note’s symbol length')
    same(String(symUs), he.symNs / US, 'a symbol’s length in µs')
    // 「空口时间 = 前导码 + 符号时长 × ⌈载荷比特数 ÷ 每符号比特数⌉」, against the engine, for
    // every frame size — the formula is the claim, so it is checked as one
    for (const len of [14, 64, 300, 715, 1430, 3000]) {
      const nsym = Math.ceil((16 + 8 * len + 6) / he.ndbps[11])
      expect(txTimeModeNs('he', len, 11), `${len} octets`).toBe(he.preambleNs + he.symNs * nsym)
    }
    expect(formula.text).toContain('前导码')
  })

  it('`picture`: the frame, its preamble, the answer’s fourteen bytes and the caption’s shares', () => {
    const [frame, preamble] = figs(pictureText, /走完那六步是 ([\d.]+) µs，其中 ([\d.]+) µs 是前导码/,
      '`picture` on the frame and its preamble')
    same(String(frame), data[0].frame.txTimeNs / US, 'the frame’s airtime in µs')
    same(String(preamble), he.preambleNs / US, 'the preamble in µs')
    // 「讲字节数的那一课已经把这件事算过……走完那六步」: six steps, and they are that lesson's
    const sixth = counted(pictureText, new RegExp(`走完那(${ZH})步`), 'the steps it cites')
    const bytesLesson = LESSONS.find((l) => l.id === 'frame-anatomy-bytes')!
    const theirSteps = bytesLesson.numbers!.find((x) => x.kind === 'steps') as { items: string[] }
    expect(theirSteps.items, `@frame-anatomy-bytes states ${sixth} steps`).toHaveLength(sixth)
    // 「只有十四个字节」
    const ackBytes = counted(pictureText, new RegExp(`只有(${ZH})个字节`), '`picture` on the answer')
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([ackBytes]))

    // the caption: 「中间那道空白就是 16 µs 的停顿。169.6 µs 里，只有 81.6 µs 在搬运载荷——
    //  其余 88.0 µs 是前导码、停顿和确认。」
    const [pause] = figs(caption, /空白就是 (\d+) µs 的停顿/, 'the caption’s pause')
    const [whole, load, fixed] = figs(caption,
      /([\d.]+) µs 里，只有 ([\d.]+) µs 在搬运载荷——其余 ([\d.]+) µs/, 'the caption’s three shares')
    expect(pause * US).toBe(SIFS_NS)
    expect(us(data[0].frame.txTimeNs + SIFS_NS + acks[0].frame.txTimeNs)).toBe(whole)
    expect(us(data[0].frame.txTimeNs - he.preambleNs)).toBe(load)
    expect(us(he.preambleNs + SIFS_NS + acks[0].frame.txTimeNs)).toBe(fixed)
    expect(add(load, fixed), 'the caption’s own two parts against its own total').toBe(whole)
    // 「只有 81.6 µs 在搬运载荷」: the payload is the smaller half, which is the point
    expect(load).toBeLessThan(fixed)
  })

  it('`picture`: the guard interval’s one published side, and the page count of the other', () => {
    // 「时延扩展这个词在 802.11-2024 的 5956 页里只出现在那一句话上」 — a claim about the
    // document, which this repository does not hold. What is checked is the half that is here:
    // the four clause numbers are the ones `sources` gives, and the three tiers the lesson
    // promises are the three the engine builds.
    const [pages] = figs(pictureText, /的 ([\d\s]+) 页里/, 'the page count it cites')
    expect(pages).toBeGreaterThan(1000)
    for (const c of (pictureText.match(/§[\d.]+/g) ?? [])) {
      expect(sourcesText, `the picture cites ${c} and \`sources\` does not`).toContain(c)
    }
    const tiers = counted(pictureText, new RegExp(`(${ZH})档的符号`), 'the tiers it promises')
    expect(giNumbers()).toHaveLength(tiers)
  })

  it('the three steps: the cited frame, the response rule, and 125.6 + 16 + 28 = 169.6', () => {
    expect(steps, 'the lesson states exactly the three steps this reads').toHaveLength(3)
    // step 1: 「数据帧的 125.6 µs……1430 B，6 个符号，加 44.0 µs 的前导码」
    const [frame] = figs(steps[0], /数据帧的 ([\d.]+) µs/, 'step 1’s frame')
    const [bytes, syms, preamble] = figs(steps[0], /([\d,]+) B，(\d+) 个符号，加 ([\d.]+) µs 的前导码/,
      'step 1’s three ingredients')
    expect(us(data[0].frame.txTimeNs)).toBe(frame)
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(add(preamble, us(syms * he.symNs))).toBe(frame)
    expect(us(txTimeModeNs('he', bytes, 11))).toBe(frame)
    // step 2: 「在这条链路上是 24 Mb/s，而不是数据帧的那一档」
    const [picked] = figs(steps[1], /是 (\d+) Mb\/s/, 'step 2’s control response rate')
    expect(new Set(acks.map((r) => r.frame.mbps))).toEqual(new Set([picked]))
    expect(new Set(data.map((r) => r.frame.mbps)).has(picked),
      'the answer’s rate is the data frame’s after all, so the sentence has nothing to contrast')
      .toBe(false)
    // step 3: 「同一套算术用在 14 个字节上：在 24 Mb/s 下是两个 4 µs 的符号，前面挂一段 20 µs
    //  的前导码，合计 28 µs。再补上它前面那 16 µs 的停顿……125.6 + 16 + 28 = 169.6 µs」
    const [ackBytes] = figs(steps[2], /用在 (\d+) 个字节上/, 'step 3’s answer length')
    const [rate] = figs(steps[2], /在 (\d+) Mb\/s 下/, 'step 3’s rate')
    const nsym = counted(steps[2], new RegExp(`下是(${ZH})个`), 'step 3’s symbol count')
    const [symUs, preUs, total] = figs(steps[2],
      /个 ([\d.]+) µs 的符号，前面挂一段 ([\d.]+) µs 的前导码，合计 ([\d.]+) µs/,
      'step 3’s arithmetic')
    const nonht = PHY_MODES.nonht
    expect(rate).toBe(picked)
    expect(symUs * US).toBe(nonht.symNs)
    expect(preUs * US).toBe(nonht.preambleNs)
    expect(new Set(acks.map((r) => r.frame.bytes)), 'the answer this arithmetic is about')
      .toEqual(new Set([ackBytes]))
    expect(Math.ceil((16 + 8 * ackBytes + 6) / RATES.find((r) => r.mbps === rate)!.ndbps)).toBe(nsym)
    // 「再补上它前面那 16 µs 的停顿」, stated again before the sum and read again
    const [pauseAgain] = figs(steps[2], /再补上它前面那 (\d+) µs 的停顿/, 'step 3’s pause')
    expect(pauseAgain * US).toBe(SIFS_NS)
    expect(preUs * US + nsym * nonht.symNs).toBe(total * US)
    expect(txTimeNs(ackBytes, rate)).toBe(total * US)
    const [a, b, c, sum] = figs(steps[2], /([\d.]+) \+ (\d+) \+ (\d+) = ([\d.]+) µs/,
      'step 3’s closing sum')
    expect([a, b, c]).toEqual([data[0].frame.txTimeNs, SIFS_NS, acks[0].frame.txTimeNs].map(us))
    expect(add(a, b, c)).toBe(sum)
  })

  it('`observe`: the frame, the answer under a quarter of it, and the idle fifth', () => {
    const [bytes, frame] = figs(airtime.observe[0], /都是 ([\d,]+) 字节、([\d.]+) µs 的空口时间/,
      '`observe` on the data block')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(new Set(data.map((r) => us(r.frame.txTimeNs)))).toEqual(new Set([frame]))

    const [pause, answer] = figs(airtime.observe[1], /结束后 (\d+) µs 开始，持续 (\d+) µs/,
      '`observe` on the answer')
    expect(pause * US).toBe(SIFS_NS)
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([answer * US]))
    // 「比它所回答的那一帧的四分之一略少一点」: the fraction is read off the sentence, and
    // 「略少一点」 is a claim of its own — it is under that fraction, and not far under
    const quarter = counted(airtime.observe[1], new RegExp(`那一帧的(${ZH})分之一`),
      '`observe` on how it compares with the frame')
    expect(answer / frame).toBeLessThan(1 / quarter)
    expect(answer / frame).toBeGreaterThan(1 / (quarter + 1))

    const [ms] = figs(airtime.observe[2], /在前 (\d+) ms 里/, '`observe`’s window')
    const fifth = counted(airtime.observe[2], new RegExp(`不到(${ZH})分之一`), '`observe` on the busy share')
    expect(ms * MS).toBe(RUN_NS)
    const air = ofType(rs, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(air / RUN_NS, `the share of ${ms} ms this room is busy`).toBeLessThan(1 / fifth)
    expect(air / RUN_NS, 'and 「不到」 is not 「nowhere near」').toBeGreaterThan(1 / (fifth + 1))
  })

  it('`observe`: the quadruple tier delivers the same octets in more air', () => {
    const text = airtime.observe[3]
    const [gi] = figs(text, /「四倍保护间隔（([\d.]+) µs）」/, '`observe` on the variant it names')
    const [ppdus, dataFrames, ackFrames] = figs(text, /(\d+) 帧（(\d+) 个数据帧和它们的 (\d+) 个确认帧）/,
      '`observe` on the frames delivered')
    const [octets] = figs(text, /、([\d\s]+) 字节/, '`observe` on the octets delivered')
    const [before, after] = figs(text, /空口时间从 ([\d.]+) ms 涨到 ([\d.]+) ms/,
      '`observe` on the air it costs')

    expect(giNumbers().map((r) => r.giUs), 'the tier the label names is a tier of the table')
      .toContain(gi)
    expect(airtime.variants![0].label).toContain(String(gi))
    const base = [...new Simulation(airtime.scenario()).runUntil(150 * MS).records]
    const quad = [...new Simulation(airtime.variants![0].scenario()).runUntil(150 * MS).records]
    const ppdusOf = (x: TLRecord[]) =>
      ofType(x, 'TX_START').map((r) => r.frame).filter((f) => !f.amp && !f.uwb)
    const octetsOf = (x: TLRecord[]) =>
      ofType(x, 'RX_OK').reduce((s, r) => s + (r.frame.kind === 'data' ? r.frame.bytes : 0), 0)
    expect(ppdusOf(base).length).toBe(ppdus)
    expect(ppdusOf(quad).length).toBe(ppdus)
    expect(dataFrames + ackFrames, 'the two kinds the sentence counts against its own total')
      .toBe(ppdus)
    expect(ppdusOf(quad).filter((f) => f.kind === 'data').length).toBe(dataFrames)
    expect(ppdusOf(quad).filter((f) => f.kind === 'ack').length).toBe(ackFrames)
    expect(octetsOf(base)).toBe(octets)
    expect(octetsOf(quad)).toBe(octets)
    const ms = (x: TLRecord[]) => ppdusOf(x).reduce((s, f) => s + f.txTimeNs, 0) / MS
    same(String(before), ms(base), 'the air the base tier spends')
    same(String(after), ms(quad), 'the air the quadruple tier spends')
    expect(after).toBeGreaterThan(before)
  })

  it('`tryThis`: the arithmetic the reader is asked to do, and the legacy frame', () => {
    const [frame, preamble, symUs] = figs(airtime.tryThis[0],
      /拿 ([\d.]+) µs 的色块减去 ([\d.]+) µs 的前导码，再把剩下的除以 ([\d.]+) µs/,
      '`tryThis`’s subtraction')
    const sixth = counted(airtime.tryThis[0], new RegExp(`刚好得到(${ZH})个符号`), 'the answer it promises')
    expect(us(data[0].frame.txTimeNs)).toBe(frame)
    expect(us(he.preambleNs)).toBe(preamble)
    expect(us(he.symNs)).toBe(symUs)
    expect(Math.round((frame - preamble) / symUs), 'the division it asks for').toBe(sixth)

    const [gen] = raw(airtime.tryThis[1], /改成 (802\.11\w) 再载入/, 'the generation it asks for')
    const [stretched] = figs(airtime.tryThis[1], /拉长到了 (\d+) µs/, 'the airtime it promises')
    expect(gen).toBe('802.11a')
    const base = airtime.scenario()
    const legacy: Scenario = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'sta-1'
        ? { ...n, caps: { ...n.caps, generation: 'nonht' as const } } : n)),
    }
    const legacyData = ofType([...new Simulation(legacy).runUntil(50 * MS).records], 'TX_START')
      .filter((r) => r.frame.kind === 'data')
    expect(legacyData.length).toBeGreaterThan(10)
    expect(new Set(legacyData.map((r) => us(r.frame.txTimeNs)))).toEqual(new Set([stretched]))
    expect(stretched).toBeGreaterThan(us(data[0].frame.txTimeNs))
  })

  it('the quiz: halving the payload costs three symbols, not half the exchange', () => {
    const [whole] = figs(quizText, /那 ([\d.]+) µs 的交互会怎样/, 'the quiz on the exchange')
    const [saved] = figs(quizText, /减少 ([\d.]+) µs/, 'the quiz on what halving saves')
    const [lands] = figs(quizText, /整次交互落在 ([\d.]+) µs/, 'the quiz on where it lands')
    const [from, to] = [counted(quizText, new RegExp(`从(${ZH})个变成`), 'the symbols before'),
      counted(quizText, new RegExp(`变成(${ZH})个`), 'the symbols after')]
    const dropped = counted(quizText, new RegExp(`用不上的那(${ZH})个符号`), 'the symbols no longer needed')

    const exchange = data[0].frame.txTimeNs + SIFS_NS + acks[0].frame.txTimeNs
    expect(us(exchange)).toBe(whole)
    const bytes = data[0].frame.bytes
    const half = txTimeModeNs('he', bytes / 2, 11)
    expect((half - he.preambleNs) / he.symNs, 'the symbols half the payload needs').toBe(to)
    expect((data[0].frame.txTimeNs - he.preambleNs) / he.symNs).toBe(from)
    expect(from - to).toBe(dropped)
    expect(us(dropped * he.symNs)).toBe(saved)
    expect(us(data[0].frame.txTimeNs - half)).toBe(saved)
    expect(us(half + SIFS_NS + acks[0].frame.txTimeNs)).toBe(lands)
    // 「也跟着减半」 is the wrong option, and this is why
    expect(lands).toBeGreaterThan(us(exchange) / 2)
  })

  it('`limits`: the preamble is one tier of a constant, and the symbol is not a tier at all', () => {
    const l0 = airtime.limits[0].text
    const [preamble] = figs(l0, /^([\d.]+) µs 的前导码是写在 PHY_MODES 里的常数/,
      '`limits` on the preamble')
    const [fixed] = figs(l0, /固定开销 ([\d.]+) µs」这个数/, '`limits` on the fixed part')
    const [width] = figs(l0, /只在 (\d+) MHz/, '`limits` on the width it holds for')
    const [quad] = figs(l0, /四倍保护间隔下它是 ([\d.]+) µs/, '`limits` on the other tier')
    const [symUs, dft, gi] = figs(l0, /([\d.]+) µs 的符号.*?([\d.]+) µs 的离散傅里叶变换周期加 ([\d.]+) µs/,
      '`limits` on the symbol’s own decomposition')
    expect(us(he.preambleNs)).toBe(preamble)
    expect(us(he.preambleNs + SIFS_NS + acks[0].frame.txTimeNs)).toBe(fixed)
    expect(new Set(data.map((r) => r.frame.widthMhz))).toEqual(new Set([width]))
    const [tier] = figs(l0, /而 ([\d.]+) µs 本身还是一档/, '`limits` restating the preamble')
    expect(tier).toBe(preamble)
    expect(us(preambleNsFor('he', TGI_NS.base))).toBe(tier)
    expect(us(preambleNsFor('he', TGI_NS.quad))).toBe(quad)
    expect(us(symNsFor('he', TGI_NS.base))).toBe(symUs)
    // the symbol really is the transform period plus the guard interval the tier names
    expect(add(dft, gi)).toBe(symUs)
    expect(us(TGI_NS.base)).toBe(gi)
    expect(us(symNsFor('he', TGI_NS.base) - TGI_NS.base)).toBe(dft)
  })

  it('`limits`: the 8.8 µs the long training field costs, split the way it is spent', () => {
    const ltf = airtime.limits.find((x) => x.text.includes('4× LTF') && x.text.includes('信道估计'))!
    const [extra] = figs(ltf.text, /前导码多 ([\d.]+) µs/, '`limits` on what the 4× LTF costs')
    const [a, b, c, d] = figs(ltf.text, /（([\d.]+) \+ ([\d.]+) 变成 ([\d.]+) \+ ([\d.]+) µs）/,
      '`limits` on how that cost is made up')
    const [again] = figs(ltf.text, /所以这 ([\d.]+) µs 在这里/, '`limits` restating the cost')
    expect(us(preambleNsFor('he', TGI_NS.quad) - preambleNsFor('he', TGI_NS.base))).toBe(extra)
    expect(add(c, d, -a, -b), 'the sentence’s own arithmetic').toBe(extra)
    expect(us(TGI_NS.base)).toBe(b)
    expect(us(TGI_NS.quad)).toBe(d)
    expect(again).toBe(extra)
  })

  it('`limits`: the pause is exact to the nanosecond, every one of the run’s answers', () => {
    const l = airtime.limits.find((x) => x.text.includes('scheduleResponse'))!.text
    const [pause] = figs(l, /那 (\d+) µs 的停顿/, '`limits` on the pause')
    const [answers] = figs(l, /本轮 (\d+) 个回答/, '`limits` on how many answers it counted')
    expect(pause * US).toBe(SIFS_NS)
    // **This figure was 254 until 2026-10-12, and 254 is `@ifs`'s.** That lesson's saturated
    // uploader answers 254 times in 100 ms; this lesson's video TV answers 116 times in the
    // same window and 175 in the 150 ms the fourth observe uses, so the sentence's 「本轮」
    // named no run of this lesson at all. `scripts/figure-planting.ts` found it: of the 86
    // figures it plants here, this was one of two the suite could not notice.
    expect(acks.length).toBe(answers)
    const ends2 = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'data')
    for (const a of acks) {
      expect(a.t - ends2.filter((e) => e.t <= a.t).pop()!.t, `the answer at ${a.t}`).toBe(pause * US)
    }
    // 「这次交互里没有传播时延……所以 169.6 µs 是一个下限」
    const prop = airtime.limits.find((x) => x.text.includes('传播时延'))!.text
    const [floor] = figs(prop, /所以 ([\d.]+) µs 是一个下限/, '`limits` on the exchange as a lower bound')
    expect(us(data[0].frame.txTimeNs + SIFS_NS + acks[0].frame.txTimeNs)).toBe(floor)
    const starts = new Set(ofType(rs, 'TX_START').map((r) => r.t))
    for (const r of ofType(rs, 'RX_START')) {
      expect(starts.has(r.t), `a reception starting at ${r.t}`).toBe(true)
    }
  })

  it('`limits`: the busy fifth is this room’s, and the window it was counted over', () => {
    const scoped = airtime.limits.find((x) => x.kind === 'out-of-scope')!.text
    const [ms] = figs(scoped, /前 (\d+) ms/, '`limits` on the window')
    const fifth = counted(scoped, new RegExp(`忙不到(${ZH})分之一`), '`limits` on the busy share')
    expect(ms * MS).toBe(RUN_NS)
    const air = ofType(rs, 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(air / RUN_NS).toBeLessThan(1 / fifth)
    // 「一个接入点、一台站点、一路视频，没有邻居网络……一次重传也没有」
    expect(airtime.scenario().nodes.filter((n) => n.kind === 'ap')).toHaveLength(1)
    expect(airtime.scenario().nodes.filter((n) => n.kind === 'sta')).toHaveLength(1)
    expect(ofType(rs, 'TX_START').filter((r) => r.frame.retryFlag)).toHaveLength(0)
  })

  it('`sources`: the preamble, the symbol and the payload it calls model values', () => {
    const [preamble] = figs(sourcesText, /(\d+) µs 的高效率前导码/, '`sources` on the preamble')
    const [symUs] = figs(sourcesText, /而 ([\d.]+) µs 的符号不是代表值/, '`sources` on the symbol')
    const [dft, a, b, c] = figs(sourcesText,
      /T_DFT \+ T_GI，([\d.]+) µs 加 ([\d.]+)／([\d.]+)／([\d.]+) µs/, '`sources` on the three tiers')
    const [pause] = figs(sourcesText, /(\d+) µs 的停顿是 aSIFSTime/, '`sources` on the pause')
    const [bytes] = figs(sourcesText, /([\d,]+) 字节的帧、产生它的视频业务模型/, '`sources` on the frame')
    expect(preamble * US).toBe(he.preambleNs)
    expect(us(he.symNs)).toBe(symUs)
    expect(pause * US).toBe(SIFS_NS)
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    // the three guard intervals, and the transform period they are added to
    expect([a, b, c]).toEqual([TGI_NS.base, TGI_NS.double, TGI_NS.quad].map(us))
    for (const gi of [TGI_NS.base, TGI_NS.double, TGI_NS.quad]) {
      expect(us(symNsFor('he', gi)), `the symbol at ${gi / US} µs`).toBe(add(dft, us(gi)))
    }
  })
})
