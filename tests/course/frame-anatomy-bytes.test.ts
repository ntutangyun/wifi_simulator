/**
 * Every empirical claim of "What a frame costs on the air"
 * (src/course/tier1/frame-anatomy-bytes.ts), measured against the lesson's own
 * scenario — the same scene `frame-anatomy` loads, so the split costs the
 * reader nothing and the recorded hashes are the same run twice.
 *
 * The preamble fields, the airtime formula, the byte sums and the
 * bytes→microseconds procedure are this lesson's, and after the re-pacing of
 * 2026-09-25 it is their SOLE owner: `airtime` used to teach the same six steps
 * again and now cites the result.
 *
 * Gone next door with the sentences that carried them: the control-frame sizes,
 * the aggregate, the reservation durations and the burst observation are
 * `small-frames`', pinned in tests/course/small-frames.test.ts. The
 * per-generation table became a `timing` figure, pinned below against
 * `PHY_MODES` and the two frames the run puts on the air.
 */
import { describe, it, expect } from 'vitest'
import {
  frameAnatomyBytes, preambleTiming, HE_FRAME_US, LEGACY_FRAME_US,
} from '../../src/course/tier1/frame-anatomy-bytes'
import { frameAnatomyScenario, firstLegacyData, firstQosSingle } from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import { lessonChars, lessonMinutes } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, ppduLayout, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, QOS_HDR_BYTES, RATES, SLOT_NS, TGI_NS,
  txTimeNs, txTimeModeNs,
} from '../../src/engine/phy'
import { zhNumeral } from './coverage'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

/** This lesson's records, from the kit's shared memo: frame-anatomy's scene. */
const records = runOf(frameAnatomyBytes, undefined, RUN_NS)
const txs = ofType(records, 'TX_START')
const find = (pred: (r: TLRecord) => boolean): Tx => {
  const r = records.find(pred)
  expect(r, 'jump target not reached').toBeDefined()
  return r as Tx
}
function decode(f: Tx['frame'], sc = frameAnatomyScenario()) {
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const src = sc.nodes.find((n) => n.id === f.src) ?? ap
  return decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') })
}
const firstMpdu = (f: Tx['frame'], sc?: Scenario): Mpdu => decode(f, sc ?? frameAnatomyScenario()).users[0].subframes[0].mpdu
const runEdited = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]

const legacy = find(firstLegacyData)
const qos = find(firstQosSingle)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads frame-anatomy's scene, so
// its recorded timeline hash is frame-anatomy's, value for value.
lessonShapeSuite(frameAnatomyBytes, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy' })

describe('frame-anatomy-bytes · the lesson itself', () => {
  it('is the sole owner of the byte count, and owns the preamble words', () => {
    expect(MODULES[frameAnatomyBytes.module].title).toBe('帧与空口时间')
    expect(frameAnatomyBytes.needs).toEqual(['frame-anatomy'])
    // the baseline owner table of the readability programme: the preamble fields, taught as
    // "the part every radio can read".
    // Whole-track review I5: one name for the fixed head of a frame, owned by the lesson
    // that counts its microseconds. `preamble` was a term of airtime and is now here.
    expect(frameAnatomyBytes.terms!.map((t) => t.term)).toEqual(['L-STF', 'L-LTF', 'L-SIG', 'preamble', 'U-SIG'])
  })

  it('keeps the two jumps its own text walks through', () => {
    // §2 · M3: the RTS, the A-MPDU and the BlockAck are `small-frames`' jumps now, with the
    // table and the durations that read them.
    expect(frameAnatomyBytes.jumps.length).toBe(2)
    expect(frameAnatomyBytes.jumps.map((j) => records.find(j.find))).toEqual([legacy, qos])
  })

  it('loads frame-anatomy\'s own scene, with no variant of its own', () => {
    expect(frameAnatomyBytes.scenario()).toEqual(frameAnatomyScenario())
    expect(frameAnatomyBytes.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(frameAnatomyBytes.scenario())).not.toThrow()
    for (const q of frameAnatomyBytes.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })
})

describe('frame-anatomy-bytes · what goes in front', () => {
  it('802.11a: 16 µs of L-STF and L-LTF, then 4 µs of L-SIG, then 4 µs symbols', () => {
    // the table's first row, and the picture's "a short repeating pattern … then the L-LTF …
    //  The L-SIG tells it two things"
    expect(PHY_MODES.nonht.preambleNs).toBe(20_000)
    expect(PHY_MODES.nonht.symNs).toBe(4_000)
    const segs = ppduLayout(legacy.frame)
    expect(segs.map((s) => [s.key, s.durNs])).toEqual([
      ['legacyPreamble', 16_000], ['signal', 4_000], ['data', 228_000],
    ])
    expect(segs[2].symbols).toBe(57)
  })

  it('the newer rows: 40, 44 and 48 µs, and a 13.6 µs symbol from Wi-Fi 6 on', () => {
    expect(PHY_MODES.vht.preambleNs).toBe(40_000)
    expect(PHY_MODES.he.preambleNs).toBe(44_000)
    expect(PHY_MODES.eht.preambleNs).toBe(48_000)
    // "and 4 µs more in a frame shared by several devices"
    expect(PHY_MODES.he.muExtraPreambleNs).toBe(4_000)
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(4_000)
    expect(PHY_MODES.he.symNs).toBe(13_600)
    expect(PHY_MODES.eht.symNs).toBe(13_600)
  })

  it('the phone\'s Wi-Fi 6 frame really is a 44 µs front and one 13.6 µs symbol', () => {
    // observation 1: "the phone's Wi-Fi 6 frame is a 44 µs front and one 13.6 µs symbol"
    expect(qos.frame.mode).toBe('he')
    const segs = ppduLayout(qos.frame)
    expect(segs.map((s) => [s.key, s.durNs])).toEqual([['preamble', 44_000], ['data', 13_600]])
    expect(segs[1].symbols).toBe(1)
    expect(qos.frame.txTimeNs).toBe(57_600)
  })
})

/**
 * The figure, pinned against the same run as the prose: the durations are read
 * back OUT of the spec the panel paints and compared with `PHY_MODES` and with
 * the two frames the run put on the air.
 */
describe('frame-anatomy-bytes · the figure is the run', () => {
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...frameAnatomyBytes.picture!, ...frameAnatomyBytes.numbers!].filter(isDiagram)

  it('draws the one figure §4 gives this lesson, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['timing'])
  })

  it('both lanes are a frame of the run, split where the preamble ends', () => {
    const spec = diagrams[0].spec as TimingSpec
    expect(spec).toEqual(preambleTiming())
    const [a, he] = spec.lanes
    // the old laptop's 802.11a frame: 20 µs in front, 57 symbols behind, 248 µs in all
    expect(a.spans[0].toUs).toBe(PHY_MODES.nonht.preambleNs / 1000)
    expect(a.spans[1].fromUs).toBe(PHY_MODES.nonht.preambleNs / 1000)
    expect(a.spans[1].toUs).toBe(LEGACY_FRAME_US)
    expect(LEGACY_FRAME_US * 1000).toBe(legacy.frame.txTimeNs)
    expect((a.spans[1].toUs - a.spans[1].fromUs) / (PHY_MODES.nonht.symNs / 1000)).toBe(57)
    expect(a.spans[1].label).toContain('57')
    // the phone's Wi-Fi 6 frame: 44 µs in front, one 13.6 µs symbol behind
    expect(he.spans[0].toUs).toBe(PHY_MODES.he.preambleNs / 1000)
    expect(he.spans[1].toUs).toBe(HE_FRAME_US)
    expect(HE_FRAME_US * 1000).toBe(qos.frame.txTimeNs)
    expect(he.spans[1].toUs - he.spans[1].fromUs).toBeCloseTo(PHY_MODES.he.symNs / 1000, 9)
    // the axis covers the longer of the two, and the ticks stay inside it
    expect(spec.axis.fromUs).toBe(0)
    expect(spec.axis.toUs).toBe(LEGACY_FRAME_US)
    for (const t of spec.axis.ticks) expect(t).toBeLessThanOrEqual(spec.axis.toUs)
  })

  it('the caption’s four preambles and two symbol lengths are PHY_MODES itself', () => {
    const caption = diagrams[0].caption!
    for (const ns of [PHY_MODES.nonht.preambleNs, PHY_MODES.vht.preambleNs, PHY_MODES.he.preambleNs, PHY_MODES.eht.preambleNs]) {
      expect(caption, `${ns} ns`).toContain(String(ns / 1000))
    }
    expect(caption).toContain(String(PHY_MODES.he.symNs / 1000))
    expect(caption).toContain(String(PHY_MODES.he.muExtraPreambleNs / 1000))
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(PHY_MODES.he.muExtraPreambleNs)
  })
})

describe('frame-anatomy-bytes · counting the bytes', () => {
  it('24 + 1500 + 4 = 1528 B, and 26 + 1500 + 4 = 1530 B with the mark', () => {
    expect(MAC_HDR_BYTES + 1500 + FCS_BYTES).toBe(1528)
    expect(QOS_HDR_BYTES + 1500 + FCS_BYTES).toBe(1530)
    expect(legacy.frame.bytes).toBe(1528)
    expect(firstMpdu(legacy.frame).bytes).toBe(1528)
    expect(legacy.frame.mbps).toBe(54)
  })

  it('both fill 57 symbols at 54 Mb/s and both take 248 µs', () => {
    // the formula note, and the deeper derivation ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57
    expect(txTimeNs(1528, 54)).toBe(248_000)
    expect(txTimeNs(1530, 54)).toBe(248_000)
    expect(Math.ceil((16 + 8 * 1528 + 6) / 216)).toBe(57)
    expect(8 * 1528).toBe(12_224)
    expect(20_000 + 57 * 4_000).toBe(248_000)
    expect(legacy.frame.txTimeNs).toBe(248_000)
  })

  it('a 14 B answer at 24 Mb/s fills two symbols: 28 µs, of which 20 µs is front', () => {
    expect(ACK_BYTES).toBe(14)
    expect(Math.ceil((16 + 8 * ACK_BYTES + 6) / 96)).toBe(2)
    expect(txTimeNs(ACK_BYTES, 24)).toBe(28_000)
    expect(20_000 + 2 * 4_000).toBe(28_000)
  })
})

describe('frame-anatomy-bytes · from bytes to microseconds', () => {
  it('the six steps are txTimeModeNs itself, with the old laptop’s frame in them', () => {
    // "From bytes to microseconds, step by step" and the table beside it. The steps are the
    // body of txTimeModeNs (src/engine/phy.ts): bytes → bits + 16 + 6 → ÷ N_DBPS, rounded up
    // → preamble + symbols × symNs.
    const steps = frameAnatomyBytes.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(6)
    // 1. "24 + 1500 + 4 = 1528 B for the old laptop"
    const bytes = MAC_HDR_BYTES + 1500 + FCS_BYTES
    expect(bytes).toBe(1528)
    expect(legacy.frame.bytes).toBe(bytes)
    // 2. "16 + 8 × 1528 + 6 bits" — the table's 12 246
    const bits = 16 + 8 * bytes + 6
    expect(bits).toBe(12_246)
    // 3. "216 bits at 54 Mb/s … 57 symbols"
    expect(PHY_MODES.nonht.ndbps[PHY_MODES.nonht.mbps.indexOf(54)]).toBe(216)
    expect(Math.ceil(bits / 216)).toBe(57)
    // 4. "20 µs, then 57 × 4 µs, which is 248 µs"
    expect(PHY_MODES.nonht.preambleNs + 57 * PHY_MODES.nonht.symNs).toBe(248_000)
    expect(legacy.frame.txTimeNs).toBe(248_000)
    // 5. "a 44 or 48 µs front, and a symbol of 13.6 µs"
    expect([PHY_MODES.he.preambleNs, PHY_MODES.eht.preambleNs]).toEqual([44_000, 48_000])
    expect(PHY_MODES.he.symNs).toBe(13_600)
    // 6. "1530 B, and step 3 still rounds up to 57 symbols"
    expect(QOS_HDR_BYTES + 1500 + FCS_BYTES).toBe(1530)
    expect(Math.ceil((16 + 8 * 1530 + 6) / 216)).toBe(57)
    expect(txTimeNs(1530, 54)).toBe(248_000)
    /*
     * **The 「第」 rule change of 2026-10-14 uncovered step 6's two ordinals**, and an ordinal
     * that points at another step of its own block is checkable without leaving the block:
     * 「把第 1 步重做一遍」 has to point at the step that counts bytes, and 「到第 3 步」 at the
     * one that rounds up. The two figures beside them are read out of the sentence as well, so
     * step 6 is READ here rather than quoted in a comment above an assertion of its figures.
     */
    const six = /再带上业务标记把第 (\d+) 步重做一遍：(\d+) B；到第 (\d+) 步，向上取整得到的仍是 (\d+) 个符号/
      .exec(steps.items[5]!)
    expect(six, 'step 6 no longer redoes two of the steps by number').not.toBeNull()
    const [redo, tagged, round, syms] = six!.slice(1).map(Number) as [number, number, number, number]
    expect(steps.items[redo - 1], `step ${redo} is the one that counts this frame’s bytes`)
      .toMatch(/^先数这一帧的字节/)
    expect(steps.items[round - 1], `step ${round} is the one that rounds up`).toContain('向上取整')
    expect(tagged, 'the tagged frame’s bytes, as step 6 states them')
      .toBe(QOS_HDR_BYTES + 1500 + FCS_BYTES)
    expect(syms, 'and the symbols it still needs').toBe(Math.ceil((16 + 8 * tagged + 6) / 216))
    expect(syms, 'which is the same symbol count as the untagged frame — the point of the step')
      .toBe(Math.ceil(bits / 216))
  })

  it('`sources`: the three preambles and the three clauses are one list each, in one order', () => {
    /*
     * **Exempt, class (a): the clause numbers 「第 21、27、36 章」.** They are chapters of
     * IEEE Std 802.11-2024, there is no corpus of it in this repository, and a clause number is
     * what the planter's own 「第」 rule exists to skip. **It offered them anyway, and that is an
     * instrument finding, not a lesson one**: the narrowed rule (2026-10-14) decides by what
     * FOLLOWS the figure — 「第 36 章」 is a name — and in a LIST the counter word comes once at
     * the end, so 21 and 27 are followed by 「、」 and fall through. Recorded in
     * `docs/course-figure-pinning.md`; the fix belongs in the classifier.
     *
     * What IS readable here is the shape of the sentence, and it is worth reading: the three
     * clauses are the three generations whose preambles the same sentence lists, in the same
     * order, so neither list may grow, shrink or be reordered on its own.
     */
    const s = frameAnatomyBytes.sources!.join('\n')
    const m = /(\d+)、(\d+)、(\d+) µs 的前导码与 ([\d.]+) µs 的符号[^]*?（第 (\d+)、(\d+)、(\d+) 章）/
      .exec(s)
    expect(m, '`sources` no longer states the two lists').not.toBeNull()
    const pre = m!.slice(1, 4).map(Number)
    const clauses = m!.slice(5, 8).map(Number)
    expect(pre, 'the three preambles this engine really has, in µs')
      .toEqual([PHY_MODES.vht, PHY_MODES.he, PHY_MODES.eht].map((p) => p.preambleNs / 1000))
    expect(Number(m![4]), 'and the symbol those modes share').toBe(PHY_MODES.he.symNs / 1000)
    expect(clauses.length, 'one clause per generation named').toBe(pre.length)
    expect([...clauses].sort((a, b) => a - b), 'the clauses rise with the generations')
      .toEqual(clauses)
    expect(new Set(clauses).size, 'and they are three different clauses').toBe(clauses.length)
  })

  it('the procedure reproduces the airtime of every frame the run puts on the air', () => {
    // Proving the steps rather than the one row: run 1 to 4 by hand for each PPDU, in the mode
    // and at the MCS it was sent with, and land on the txTimeNs the engine recorded.
    const seen = new Set<string>()
    for (const r of txs) {
      const f = r.frame
      const mode = f.mode ?? 'nonht'
      const m = PHY_MODES[mode]
      const mcs = f.mcs ?? m.mbps.indexOf(f.mbps)
      const nsym = Math.ceil((16 + 8 * f.bytes + 6) / m.ndbps[mcs])
      expect(m.preambleNs + nsym * m.symNs, `${f.kind} ${f.bytes} B at ${f.mbps} Mb/s`).toBe(f.txTimeNs)
      seen.add(mode)
    }
    expect([...seen].sort()).toEqual(['he', 'nonht', 'vht'])
  })
})

describe('frame-anatomy-bytes · the experiments', () => {
  it('the phone\'s own frame through the six steps: 230 B, 1862 bits, one symbol, 57.6 µs', () => {
    // tryThis 1: "拿手机那一帧自己走一遍六步：230 B → 16 + 8 × 230 + 6 = 1862 比特 → 除以 1950
    //  … 向上取整得 1 个符号 → 44 + 1 × 13.6 = 57.6 µs"
    expect(qos.frame.bytes).toBe(230)
    const bits = 16 + 8 * qos.frame.bytes + 6
    expect(bits).toBe(1862)
    const ndbps = PHY_MODES.he.ndbps[qos.frame.mcs!]
    expect(ndbps).toBe(1950)
    expect(Math.ceil(bits / ndbps)).toBe(1)
    expect(PHY_MODES.he.preambleNs + PHY_MODES.he.symNs).toBe(57_600)
    expect(txTimeModeNs('he', qos.frame.bytes, qos.frame.mcs!)).toBe(qos.frame.txTimeNs)
    expect(qos.frame.txTimeNs).toBe(HE_FRAME_US * 1000)
  })

  it('as a Wi-Fi 5 device the old laptop\'s front grows from 20 µs to 40 µs, the symbol stays 4 µs', () => {
    // tryThis 2: "它的前导码从 20 µs 变成 40 µs，符号仍是 4 µs：换一代改的就是这两个尺寸"
    const sc = frameAnatomyScenario()
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const rs = runEdited(sc, 40 * MS)
    const after = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1' && r.frame.mode === 'vht')!
    const segs = ppduLayout(after.frame)
    expect(segs[0].durNs).toBe(PHY_MODES.vht.preambleNs)
    expect(PHY_MODES.vht.preambleNs).toBe(40_000)
    expect(PHY_MODES.nonht.preambleNs).toBe(20_000)
    expect(PHY_MODES.vht.symNs).toBe(PHY_MODES.nonht.symNs)
    expect(PHY_MODES.vht.symNs).toBe(4_000)
    // and the old laptop's own frame before the edit really was a 20 µs front
    expect(ppduLayout(legacy.frame)[0].durNs).toBe(16_000)
    expect(ppduLayout(legacy.frame)[1].durNs).toBe(4_000)
  })
})

/**
 * The guard-interval `limits` entries, retired and replaced (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §0.3, §7.3).
 *
 * **This is "delete one, add two", not "lift one".** The old entry's first sentence —
 * "this choice does not exist in the engine" — became false the moment the guard interval was
 * wired, and its second sentence was wrong from the day it shipped: "one or two tenths" is the
 * figure for the quadruple tier alone, and this lesson's own frame pays 1.39 % at the double
 * tier. Neither new entry carries an `until`: both record something that stays true now that
 * the slice is built, not a thing still to do.
 *
 * Instrument: `txTimeModeNs('he', 230, 11, { widthMhz: 20, giNs })` — pure arithmetic on the
 * very frame this lesson prints, no randomness, no run.
 */
describe("frame-anatomy-bytes · what the guard interval costs this lesson's own frame", () => {
  const text = (): string => frameAnatomyBytes.limits.map((x) => x.text).join(' | ')
  const us = (giNs: number): number => txTimeModeNs('he', 230, 11, { widthMhz: 20, giNs }) / 1000

  it('(a) no longer says the choice is absent, nor that it costs one or two tenths', () => {
    expect(text()).not.toContain('这个选择在引擎里不存在')
    expect(text()).not.toContain('多花一两成的空口时间')
    expect(text()).not.toContain('一两成')
  })

  it("(b) carries a model-value saying the tier is the scenario author's choice", () => {
    const lim = frameAnatomyBytes.limits.find((x) => x.text.includes('场景常量'))
    expect(lim, 'no limit calls the guard interval a scenario constant').toBeDefined()
    expect(lim!.kind).toBe('model-value')
    expect(lim!.until).toBeUndefined()
    // The three halves of the claim: the author picks, the engine does not, the standard does
    // not specify a rule either — it specifies only which tiers exist, each tier's symbol
    // duration, and that GI_TYPE names the one in use.
    expect(lim!.text).toContain('引擎不替它选')
    expect(lim!.text).toContain('标准也不规定')
    expect(lim!.text).toContain('GI_TYPE')
  })

  it('(c) carries an unmodelled saying the thing it is spent on is not built here', () => {
    const lim = frameAnatomyBytes.limits.find((x) => x.text.includes('时延扩展'))
    expect(lim, 'no limit names the delay spread').toBeDefined()
    expect(lim!.kind).toBe('unmodelled')
    expect(lim!.until).toBeUndefined()
    expect(lim!.text).toContain('只有代价')
    // And the two figures are this frame's own, computed rather than typed.
    expect(us(800)).toBe(57.6)
    expect(lim!.text).toContain(((us(1_600) / us(800) - 1) * 100).toFixed(2))
    expect(lim!.text).toContain(((us(3_200) / us(800) - 1) * 100).toFixed(2))
    expect(lim!.text).toContain('1.39')
    expect(lim!.text).toContain('19.44')
  })

  it('(d) the preamble limit now says 13.6 µs is T_SYM1, and leaves the preamble half alone', () => {
    const lim = frameAnatomyBytes.limits.find((x) => x.text.includes('40、44、48 µs 的前导码'))
    expect(lim, 'the preamble limit moved').toBeDefined()
    expect(lim!.kind).toBe('model-value')
    // The correction: the preamble figures ARE representative values; 13.6 is not.
    expect(lim!.text).toContain('T_SYM1')
    expect(lim!.text).toContain('12.8')
    expect(lim!.text).not.toContain('13.6 µs 的符号是写在 PHY_MODES 里的常数')
  })

  it('(e) the stated minutes do not move: limits are outside mainPathChars', () => {
    // Measured rather than assumed. 2016 characters, 2 observe, 2 tryThis -> 2016/220 + 4 + 8
    // = 21.16 -> 20 minutes, and `limits` contributes to none of it.
    expect(lessonChars(frameAnatomyBytes)).toBe(2016)
    expect(lessonMinutes(frameAnatomyBytes)).toBe(20)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * `scripts/figure-planting.ts` sampled this lesson on 2026-10-12 and all six sampled figures
 * were editable with this file green. Everything above pins the engine against literals written
 * here — the four preambles, the two symbol lengths, 1528/1530, 57 symbols, 248 µs, the phone's
 * 57.6 — and this lesson restates each of those more than any other in Tier 1: the byte count
 * is in two formulas, the steps, the worked table and `limits`; the preamble ladder is in the
 * caption, the steps, `deeper`, `limits` and `sources`; 248 µs is in the steps, the table,
 * `observe` and the quiz.
 *
 * A quarter of this lesson's figures are interpolated — the guard-interval costs in the long
 * `limits` entry are `${giFrameUs(...)}` — and those cannot drift, which is why the planting
 * tool skips them and (c) above recomputes them.
 */
describe('frame-anatomy-bytes · every printed figure is read back out of the lesson', () => {
  const L = frameAnatomyBytes
  const legacy = find((r) => firstLegacyData(r))
  const qos = find((r) => firstQosSingle(r))
  const everywhere = [
    L.why ?? '', ...(L.outcomes ?? []), ...(L.terms ?? []).map((t) => `${t.term} ${t.plain}`),
    ...(L.picture ?? []).map((b) => JSON.stringify(b)),
    ...(L.numbers ?? []).map((b) => JSON.stringify(b)),
    ...(L.deeper ?? []).map((b) => JSON.stringify(b)),
    ...L.limits.map((x) => x.text), ...(L.sources ?? []),
    ...L.observe, ...L.tryThis,
    ...L.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']),
  ].join('\n')

  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] =>
    raw(text, re, what).map((x) => Number(x.replace(/[\s,]/g, '')))
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const all = (re: RegExp): number[] =>
    [...everywhere.matchAll(re)].flatMap((m) => m.slice(1).filter(Boolean)
      .map((x) => Number(x.replace(/[\s,]/g, ''))))
  const steps = (L.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const formulas = L.numbers!.filter((x) => x.kind === 'formula') as
    { heading: string; text: string; note: string }[]
  const table = L.numbers!.find((x) => x.kind === 'table') as { rows: string[][] }
  const caption = (L.picture!.find((x) => x.kind === 'diagram') as { caption: string }).caption

  it('the airtime formula, and its two N_DBPS figures', () => {
    const f = formulas.find((x) => x.heading.includes('传统帧'))!
    // TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉
    const [stf, sig, sym, service, tail] = figs(f.text,
      /TXTIME = (\d+) \+ (\d+) \+ (\d+) × ⌈\((\d+) \+ 8 × LENGTH \+ (\d+)\) ÷ N_DBPS⌉/,
      'the formula’s own five figures')
    const nonht = PHY_MODES.nonht
    expect((stf + sig) * 1_000, 'the preamble the formula starts with').toBe(nonht.preambleNs)
    expect(sym * 1_000, 'the symbol it multiplies').toBe(nonht.symNs)
    // the two bit figures are the SERVICE field and the tail bits, which `deeper` names
    expect([service, tail], 'the bits around the payload').toEqual([16, 6])
    // 「54 Mb/s 时是 216，24 Mb/s 时是 96」
    const rates = figs(f.note, /(\d+) Mb\/s 时是 (\d+)，(\d+) Mb\/s 时是 (\d+)/,
      'the note’s two rates and their bits per symbol')
    for (const [mbps, ndbps] of [[rates[0], rates[1]], [rates[2], rates[3]]] as const) {
      expect(RATES.find((r) => r.mbps === mbps)?.ndbps, `${mbps} Mb/s`).toBe(ndbps)
    }
    // and the formula really is the engine's, for every frame of this run
    for (const r of txs.filter((x) => x.frame.mode === 'nonht')) {
      const n = Math.ceil((service + 8 * r.frame.bytes + tail)
        / RATES.find((x) => x.mbps === r.frame.mbps)!.ndbps)
      expect((stf + sig) * 1_000 + n * sym * 1_000, `the frame at ${r.t}`).toBe(r.frame.txTimeNs)
    }
  })

  it('the byte formula: both counts, and the two bytes that cost nothing', () => {
    const f = formulas.find((x) => x.heading.includes('数一帧的字节'))!
    const [hdr, payload, fcs, total] = figs(f.text, /^(\d+) \+ (\d+) \+ (\d+) = (\d+) B/,
      'the plain count')
    const [qosHdr, payload2, fcs2, qosTotal] = figs(f.text,
      /带标记时 (\d+) \+ (\d+) \+ (\d+) = (\d+) B/, 'the marked count')
    expect([hdr, fcs], 'the header and the check').toEqual([MAC_HDR_BYTES, FCS_BYTES])
    expect(qosHdr, 'the header with the mark').toBe(QOS_HDR_BYTES)
    expect([payload2, fcs2], 'the same payload and check').toEqual([payload, fcs])
    expect(hdr + payload + fcs, 'the formula’s own sum').toBe(total)
    expect(qosHdr + payload2 + fcs2, 'and the other one').toBe(qosTotal)
    expect(legacy.frame.bytes, 'which is the frame the run really sends').toBe(total)
    expect(qosHdr - hdr, 'the mark costs two bytes').toBe(2)
    // 「多出的那两个字节没有多占一个符号，所以在这里不花空口时间」
    expect(txTimeModeNs('nonht', qosTotal, 7), 'and the two bytes cost no airtime')
      .toBe(txTimeModeNs('nonht', total, 7))
  })

  it('the six steps and the worked table, cell for cell', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    const rows = table.rows
    expect(rows, 'the table states exactly the six rows this reads').toHaveLength(6)
    const n = (s: string): number[] => [...s.matchAll(/[\d][\d\s]*/g)]
      .map((m) => Number(m[0].replace(/\s/g, '')))
    // step 1 and row 1: the byte count
    const [hdr, payload, fcs, bytes] = n(rows[0][1])
    expect([hdr, fcs]).toEqual([MAC_HDR_BYTES, FCS_BYTES])
    expect(hdr + payload + fcs).toBe(bytes)
    expect(legacy.frame.bytes).toBe(bytes)
    expect(n(steps[0]).slice(-4), 'step 1 states the same four').toEqual([hdr, payload, fcs, bytes])
    // step 2 and row 2: the bits
    const [service, , bytes2, tail, bits] = n(rows[1][1])
    expect([service, tail]).toEqual([16, 6])
    expect(bytes2).toBe(bytes)
    expect(service + 8 * bytes + tail, 'the row’s own sum').toBe(bits)
    // step 3 and rows 3-4: the bits per symbol and the symbols
    const [ndbps] = n(rows[2][0]).slice(0, 1)
    const [ndbpsValue] = n(rows[2][1])
    expect(RATES.find((r) => r.mbps === ndbps)?.ndbps, `${ndbps} Mb/s`).toBe(ndbpsValue)
    expect(legacy.frame.mbps, 'which is the rate that frame goes out at').toBe(ndbps)
    const [symbols] = n(rows[3][1])
    expect(Math.ceil(bits / ndbpsValue), 'the symbols that many bits need').toBe(symbols)
    // step 4 and rows 5-6: the preamble, the symbols and the airtime
    const [pre, symCount, symUs] = n(rows[4][1])
    expect(pre * 1_000).toBe(PHY_MODES.nonht.preambleNs)
    expect(symCount).toBe(symbols)
    expect(symUs * 1_000).toBe(PHY_MODES.nonht.symNs)
    const [airtime] = n(rows[5][1])
    expect(pre * 1_000 + symbols * symUs * 1_000, 'the table’s own arithmetic').toBe(airtime * 1_000)
    expect(legacy.frame.txTimeNs, 'which is this frame’s airtime').toBe(airtime * 1_000)
    // step 5: 「前导码变成 44 或 48 µs，符号变成 13.6 µs」
    const newer = figs(steps[4], /前导码变成 (\d+) 或 (\d+) µs，符号变成 ([\d.]+) µs/,
      'step 5’s newer sizes')
    expect([newer[0] * 1_000, newer[1] * 1_000], 'the two newer preambles')
      .toEqual([PHY_MODES.he.preambleNs, PHY_MODES.eht.preambleNs])
    expect(newer[2] * 1_000, 'and the newer symbol').toBe(PHY_MODES.he.symNs)
    // step 6: 「1530 B；到第 3 步，向上取整得到的仍是 57 个符号」
    const [marked, same3] = figs(steps[5], /(\d+) B；到第 3 步[^]*?仍是 (\d+) 个符号/,
      'step 6’s marked count and its symbols')
    expect(marked).toBe(QOS_HDR_BYTES + payload + fcs)
    expect(same3).toBe(symbols)
    expect(Math.ceil((service + 8 * marked + tail) / ndbpsValue), 'which it really is').toBe(symbols)
  })

  it('the caption’s ladder, and 「一个小帧要花多少」', () => {
    // 「上面是旧笔记本 1528 B 的一帧：20 µs 的前导码，后面 57 个符号。下面是手机 230 B 的一
    //  帧：前导码 44 µs，后面只有一个符号。」
    const [bigBytes, bigPre, bigSyms] = figs(caption,
      /(\d+) B 的一帧：(\d+) µs 的前导码，后面 (\d+) 个符号/, 'the caption’s first frame')
    const [smallBytes, smallPre] = figs(caption, /(\d+) B 的一帧：前导码 (\d+) µs/,
      'the caption’s second frame')
    expect([bigBytes, bigPre * 1_000]).toEqual([legacy.frame.bytes, PHY_MODES.nonht.preambleNs])
    expect((legacy.frame.txTimeNs - PHY_MODES.nonht.preambleNs) / PHY_MODES.nonht.symNs)
      .toBe(bigSyms)
    expect([smallBytes, smallPre * 1_000]).toEqual([qos.frame.bytes, PHY_MODES.he.preambleNs])
    const one = /后面只有([一二三四五六七八九十]+)个符号/.exec(caption)!
    expect((qos.frame.txTimeNs - PHY_MODES.he.preambleNs) / PHY_MODES.he.symNs)
      .toBe(zhNumeral(one[1]))
    // 「前导码 20 → 40 → 44 → 48 µs，符号 4 → 4 → 13.6 → 13.6 µs（多设备共享的帧再多 4 µs）」
    const pres = figs(caption, /前导码 (\d+) → (\d+) → (\d+) → (\d+) µs/, 'the caption’s preamble ladder')
    const modes = ['nonht', 'vht', 'he', 'eht'] as const
    expect(pres.map((x) => x * 1_000), 'the four preambles')
      .toEqual(modes.map((m) => PHY_MODES[m].preambleNs))
    const syms = figs(caption, /符号 (\d+) → (\d+) → ([\d.]+) → ([\d.]+) µs/, 'the caption’s symbol ladder')
    expect(syms.map((x) => x * 1_000), 'the four symbol lengths')
      .toEqual(modes.map((m) => PHY_MODES[m].symNs))
    const [muExtra] = figs(caption, /多设备共享的帧再多 (\d+) µs/, 'the caption on the multi-user extra')
    expect(new Set(modes.filter((m) => PHY_MODES[m].muExtraPreambleNs > 0)
      .map((m) => PHY_MODES[m].muExtraPreambleNs)), 'which modes add it, and how much')
      .toEqual(new Set([muExtra * 1_000]))
    // 「同一套算术用在一个 14 B 的回复上：两个符号，一共 28 µs，其中 20 µs 是前导码」
    const small = (L.numbers!.find((x) => (x as { heading?: string }).heading?.includes('小帧')) as
      { text: string }).text
    const [ackBytes, ackRate] = figs(small, /(\d+) B 的回复上：它在 (\d+) Mb\/s 下/, 'the answer')
    // 「只占两个符号」 — 两 is the quantified form, which `zhNumeral` does not read
    const ackSyms = zhNumeral(/只占([一二三四五六七八九十两]+)个符号/.exec(small)![1].replace('两', '二'))!
    const [ackUs, ackPre] = figs(small, /一共 (\d+) µs 空口时间——其中 (\d+) µs 是前导码/,
      'the answer’s airtime and preamble')
    expect(ackBytes).toBe(ACK_BYTES)
    expect(txTimeNs(ackBytes, ackRate), 'the answer’s airtime at that rate').toBe(ackUs * 1_000)
    expect(ackPre * 1_000).toBe(PHY_MODES.nonht.preambleNs)
    expect((ackUs - ackPre) / (PHY_MODES.nonht.symNs / 1_000), 'the symbols it leaves')
      .toBe(ackSyms)
  })

  it('`deeper`, `observe`, `tryThis` and the quiz, figure for figure', () => {
    const deeper = (L.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    // 「那 16 µs 是 L-STF 加 L-LTF，4 µs 是 L-SIG」 and the worked ⌈…⌉ = 57, 20 + 57 × 4 = 248
    const [training, sig] = figs(deeper, /那 (\d+) µs 是 L-STF 加 L-LTF，(\d+) µs 是 L-SIG/,
      '`deeper` on the two halves of the preamble')
    expect((training + sig) * 1_000).toBe(PHY_MODES.nonht.preambleNs)
    const worked = figs(deeper,
      /⌈\((\d+) \+ ([\d\s]+) \+ (\d+)\) ÷ (\d+)⌉ = (\d+) 个符号，(\d+) \+ (\d+) × (\d+) = (\d+) µs/,
      '`deeper`’s worked arithmetic')
    const [svc, payloadBits, tail, ndbps, syms, pre, syms2, symUs, airtime] = worked
    expect(svc + payloadBits + tail, 'the bits it divides').toBe(16 + 8 * legacy.frame.bytes + 6)
    expect(Math.ceil((svc + payloadBits + tail) / ndbps), 'the symbols it gets').toBe(syms)
    expect(syms2).toBe(syms)
    expect(pre * 1_000 + syms * symUs * 1_000, 'and the airtime it ends on').toBe(airtime * 1_000)
    expect(legacy.frame.txTimeNs).toBe(airtime * 1_000)
    // `observe`: the same two frames, and the 248 µs that does not move
    const obs = L.observe.join('\n')
    const [oTraining, oSig, oSyms] = figs(obs, /(\d+) µs 的 L-STF 与 L-LTF、加 (\d+) µs 的 L-SIG，之后才是 (\d+) 个数据符号/,
      '`observe` on the legacy frame')
    expect((oTraining + oSig) * 1_000).toBe(PHY_MODES.nonht.preambleNs)
    expect(oSyms).toBe((legacy.frame.txTimeNs - PHY_MODES.nonht.preambleNs) / PHY_MODES.nonht.symNs)
    const [oPre, oSym] = figs(obs, /(\d+) µs 的前导码加一个 ([\d.]+) µs 的符号/,
      '`observe` on the phone’s frame')
    expect([oPre * 1_000, oSym * 1_000]).toEqual([PHY_MODES.he.preambleNs, PHY_MODES.he.symNs])
    // `tryThis`: the phone's own six steps, and the Wi-Fi 5 experiment
    const t = L.tryThis.join('\n')
    const phone = figs(t, /(\d+) B → (\d+) \+ 8 × (\d+) \+ (\d+) = (\d+) 比特 → 除以 (\d+)[^]*?得 (\d+) 个符号 → (\d+) \+ 1 × ([\d.]+) = ([\d.]+) µs/,
      '`tryThis`’s six steps for the phone')
    const [pBytes, pSvc, pBytes2, pTail, pBits, pNdbps, pSyms, pPre, pSym, pUs] = phone
    expect([pBytes, pBytes2], 'the phone’s frame').toEqual([qos.frame.bytes, qos.frame.bytes])
    expect(pSvc + 8 * pBytes + pTail, 'its bits').toBe(pBits)
    expect(PHY_MODES.he.ndbps[qos.frame.mcs!], 'the bits a symbol carries at its rung').toBe(pNdbps)
    expect(Math.ceil(pBits / pNdbps), 'the symbols it needs').toBe(pSyms)
    expect(pPre * 1_000, 'its preamble').toBe(PHY_MODES.he.preambleNs)
    expect(pSym * 1_000, 'its symbol').toBe(PHY_MODES.he.symNs)
    same(String(pUs), qos.frame.txTimeNs / 1_000, 'and the airtime the reader should read off')
    // 「悬停那个色块，读数就是 57.6 µs」: the same figure, where the reader is told to find it
    const [hovered] = raw(t, /读数就是 ([\d.]+) µs/, '`tryThis` on what the tooltip reads')
    same(hovered, qos.frame.txTimeNs / 1_000, 'the airtime the tooltip shows')
    const [from, to, stays] = figs(t, /前导码从 (\d+) µs 变成 (\d+) µs，符号仍是 (\d+) µs/,
      '`tryThis`’s generation experiment')
    expect([from * 1_000, to * 1_000], 'the two preambles')
      .toEqual([PHY_MODES.nonht.preambleNs, PHY_MODES.vht.preambleNs])
    expect(stays * 1_000, 'and the symbol that does not change').toBe(PHY_MODES.vht.symNs)
    expect(PHY_MODES.vht.symNs, 'which is the legacy one too').toBe(PHY_MODES.nonht.symNs)
    // the quiz: 1999, the 57 symbols and 248 µs, and the 1400-byte question
    const quiz = L.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')
    const [both, us] = figs(quiz, /都向上补齐到 (\d+) 个符号，都是 (\d+) µs/,
      'the quiz on the two frames that agree')
    expect(both).toBe((legacy.frame.txTimeNs - PHY_MODES.nonht.preambleNs) / PHY_MODES.nonht.symNs)
    expect(us * 1_000).toBe(legacy.frame.txTimeNs)
    const [was, now, pct] = figs(quiz, /从 (\d+) B 减到 (\d+) B[^]*?少 ([\d.]+) % 的字节/,
      'the quiz on the smaller payload')
    expect(was, 'the payload it starts from').toBe(legacy.frame.bytes - MAC_HDR_BYTES - FCS_BYTES)
    same(String(pct), (100 * (was - now)) / was, 'the share of the payload it removes')
    // the wrong option states that share a second time — 「少 6.7 % 的字节，就少 6.7 % 的时间」
    const shares = [...quiz.matchAll(/([\d.]+) %/g)].map((m) => m[1])
    expect(shares.length, 'the quiz states that share more than once').toBeGreaterThan(1)
    for (const sh of shares) same(sh, (100 * (was - now)) / was, 'the share, wherever it appears')
    const [lessBytes, lessBits, qRate, qNdbps, lessSyms, lessUs] = figs(quiz,
      /少 (\d+) B 就是少 (\d+) 比特，(\d+) Mb\/s 下一个符号装 (\d+) 比特，于是少 (\d+) 个符号、(\d+) µs/,
      'the quiz’s own arithmetic')
    expect(qRate, 'the rate the quiz works at').toBe(legacy.frame.mbps)
    expect(lessBytes, 'the bytes it removes').toBe(was - now)
    expect(8 * lessBytes, 'as bits').toBe(lessBits)
    expect(RATES.find((r) => r.mbps === legacy.frame.mbps)?.ndbps).toBe(qNdbps)
    // the symbols it saves is the difference of two ceilings, not the quotient: 800 bits is
    // 3.7 symbols' worth, and it saves 4 because both ends round up
    const symsFor = (payload: number): number =>
      Math.ceil((16 + 8 * (MAC_HDR_BYTES + payload + FCS_BYTES) + 6) / qNdbps)
    expect(symsFor(was) - symsFor(now), 'the symbols that saves').toBe(lessSyms)
    expect(lessSyms * PHY_MODES.nonht.symNs, 'and the airtime').toBe(lessUs * 1_000)
    expect(txTimeModeNs('nonht', MAC_HDR_BYTES + now + FCS_BYTES, 7),
      'which is what the engine really charges for the smaller frame')
      .toBe(legacy.frame.txTimeNs - lessUs * 1_000)
  })

  it('every figure this lesson prints twice, read at every site', () => {
    // the byte counts, the symbols, the airtime and the four preambles all appear in three to
    // five places each; this reads every occurrence rather than one of them
    const bytes = all(/(\d+) \+ 1500 \+ 4 = (\d+) B/g)
    expect(bytes.length, 'the lesson states a byte sum more than twice').toBeGreaterThan(3)
    for (let i = 0; i < bytes.length; i += 2) {
      expect(bytes[i] + 1500 + FCS_BYTES, `「${bytes[i]} + 1500 + 4」`).toBe(bytes[i + 1])
      expect([MAC_HDR_BYTES, QOS_HDR_BYTES], 'and the header is one of the two').toContain(bytes[i])
    }
    const airtimes = all(/一共 (\d+) µs 空口时间|这一帧占用空口', '(\d+) µs|都是 (\d+) µs|旧笔记本那一帧 (\d+) µs/g)
      .filter((x) => x > 100)
    expect(airtimes.length, 'the lesson states the legacy airtime more than once').toBeGreaterThan(1)
    for (const a of airtimes) expect(a * 1_000, 'the legacy frame’s airtime').toBe(legacy.frame.txTimeNs)
    const symbolCounts = all(/(\d+) 个符号|(\d+) 个数据符号/g).filter((x) => x > 10)
    expect(symbolCounts.length, 'the lesson states the symbol count more than twice').toBeGreaterThan(2)
    for (const s of symbolCounts) {
      expect(s, 'the symbols the legacy frame needs')
        .toBe((legacy.frame.txTimeNs - PHY_MODES.nonht.preambleNs) / PHY_MODES.nonht.symNs)
    }
    // and 「1999 年设计的字段」: the legacy preamble this engine still sends in every generation
    const [year] = figs(everywhere, /(\d{4}) 年设计的字段/, 'the quiz on how old the fields are')
    expect(year, 'a year, which this repository cannot check — only that it is one').toBeLessThan(2000)
    for (const mode of ['nonht', 'vht', 'he', 'eht'] as const) {
      expect(PHY_MODES[mode].preambleNs, `${mode} still carries the legacy front`)
        .toBeGreaterThanOrEqual(PHY_MODES.nonht.preambleNs)
    }
  })

  /**
   * **The sixty-five sites the first pass still left unread**, measured by
   * `scripts/figure-planting.ts` on 2026-10-12. Nearly all of them are a restatement — the bit
   * arithmetic appears in a formula's note, a step, a table row AND `deeper`; the preamble
   * ladder in the caption, `deeper`, `limits` and `sources`; 216 and 54 Mb/s in four places —
   * so this reads every occurrence of each rather than one of them.
   *
   * **Nine were 「no equal literal anywhere in tests/」**, and they are the two passages that
   * compare this lesson's 1 530 with figures from outside it: the standard's MSDU, A-MSDU and
   * dot11MaxMPDULength limits (Table 9-34), and the LLC/SNAP arithmetic. The standard's own
   * numbers cannot be checked here — no corpus — so what is checked is the comparison they are
   * made for: every one of them is larger than this lesson's frame, which is the whole point of
   * the entry, and they are in the order it prints them. The LLC/SNAP arithmetic is internal
   * and is checked as arithmetic.
   */
  it('every restatement of the bit arithmetic, the rate and the ladder', () => {
    const nonht = PHY_MODES.nonht
    const bytes = legacy.frame.bytes
    const symbols = (legacy.frame.txTimeNs - nonht.preambleNs) / nonht.symNs
    // 「16 + 8 × 1528 + 6」, wherever it appears — and the 12 246 it comes to
    const bits = [...everywhere.matchAll(/(\d+) \+ 8 × ([\d\s]+) \+ (\d+)/g)]
      .map((m) => m.slice(1).map((x) => Number(x.replace(/\s/g, ''))))
    expect(bits.length, 'the lesson states that sum more than twice').toBeGreaterThan(2)
    for (const [service, len, tail] of bits) {
      expect([service, tail], 'the SERVICE field and the tail bits').toEqual([16, 6])
      // the sum appears for both frames of this scene: the laptop's in the steps, the table and
      // `deeper`, and the phone's in `tryThis`
      expect([bytes, qos.frame.bytes], 'over one of this lesson’s two frames').toContain(len)
    }
    // 「54 Mb/s」 and 「216」, wherever they appear together
    const rates = [...everywhere.matchAll(/(\d+) Mb\/s 时是 (\d+)|(\d+) Mb\/s 下一个符号能装的比特数——(\d+)|(\d+) Mb\/s 下，/g)]
      .map((m) => m.slice(1).filter(Boolean).map(Number))
    expect(rates.length, 'the lesson names a rate with its bits more than once').toBeGreaterThan(2)
    for (const pair of rates) {
      const [mbps, n] = pair
      const row = RATES.find((r) => r.mbps === mbps)
      expect(row, `${mbps} Mb/s is a rate this engine has`).toBeDefined()
      if (n !== undefined) expect(row!.ndbps, `${mbps} Mb/s carries that many bits`).toBe(n)
    }
    // every statement of the legacy preamble, the symbol, the symbol count and the airtime
    for (const [re, want, what] of [
      [/(\d+) µs，加上 \d+ × \d+ µs|前导码那 (\d+) µs|(\d+) µs 的前导码与 \d+ µs 的符号/g,
        nonht.preambleNs / 1_000, 'the legacy preamble'],
      [/加上 \d+ × (\d+) µs|与 (\d+) µs 的符号是标准里的数值|符号仍是 (\d+) µs/g,
        nonht.symNs / 1_000, 'the legacy symbol'],
      [/加上 (\d+) × \d+ µs|⌉ = (\d+) 个符号/g, symbols, 'the symbols that frame needs'],
    ] as const) {
      const found = [...everywhere.matchAll(re)]
        .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
      expect(found.length, `the lesson states ${what} more than once`).toBeGreaterThan(1)
      for (const v of found) expect(v, what).toBe(want)
    }
    // the ladder, wherever the lesson lists the three newer preambles
    const ladders = [...everywhere.matchAll(/(\d+)、(\d+)、(\d+) µs 是 20 MHz|(\d+)、(\d+)、(\d+) µs 的前导码/g)]
      .map((m) => m.slice(1).filter(Boolean).map(Number))
    expect(ladders.length, 'the lesson lists the three newer preambles more than once')
      .toBeGreaterThan(1)
    for (const three of ladders) {
      expect(three.map((x) => x * 1_000), 'the three newer preambles')
        .toEqual([PHY_MODES.vht, PHY_MODES.he, PHY_MODES.eht].map((m) => m.preambleNs))
    }
    // 13.6 µs, wherever it is named
    const syms = [...everywhere.matchAll(/与 ([\d.]+) µs 的符号，是本仿真器|而 ([\d.]+) µs 的符号不是一个代表值/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(syms.length, 'the lesson names the newer symbol more than once').toBeGreaterThan(1)
    for (const v of syms) expect(v * 1_000, 'the newer symbol').toBe(PHY_MODES.he.symNs)
    // the multi-user extra, in `deeper` as well as the caption
    const extras = [...everywhere.matchAll(/多出的那 (\d+) µs HE-SIG-B|再多 (\d+) µs/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(extras.length, 'the lesson names it more than once').toBeGreaterThan(1)
    for (const v of extras) expect(v * 1_000, 'the multi-user extra').toBe(PHY_MODES.he.muExtraPreambleNs)
    // and 「20 MHz、单流」, which every representative value above is quoted at
    const widths = [...everywhere.matchAll(/(?<![\d.])(\d+) MHz/g)].map((m) => Number(m[1]))
    expect(widths.length, 'the lesson states the width more than twice').toBeGreaterThan(2)
    for (const w of widths) expect(w, 'the width these values hold at').toBe(20)

    // `deeper` states the whole derivation a second time, in its own words: 「装着 16 比特的
    // SERVICE 字段、PSDU、6 个尾比特」, 「取整式里的 16 和 6」, and 「54 Mb/s 下，1528 B 的
    // 一帧需要 ⌈(16 + 12 224 + 6) ÷ 216⌉」
    const deeper2 = (L.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const [svcBits] = figs(deeper2, /装着 (\d+) 比特的 SERVICE/, '`deeper` on the SERVICE field')
    const [tailBits] = figs(deeper2, /PSDU、(\d+) 个尾比特/, '`deeper` on the tail bits')
    const [svcAgain, tailAgain] = figs(deeper2, /取整式里的 (\d+) 和 (\d+) 就是它们/,
      '`deeper` restating the two')
    expect([svcBits, tailBits], 'the two bit counts').toEqual([16, 6])
    expect([svcAgain, tailAgain], 'and the same two, restated').toEqual([svcBits, tailBits])
    const [dRate, dBytes, dSvc, dPayload, dTail, dNdbps, dSyms] = figs(deeper2,
      /(\d+) Mb\/s 下，([\d\s]+) B 的一帧需要 ⌈\((\d+) \+ ([\d\s]+) \+ (\d+)\) ÷ (\d+)⌉ = (\d+) 个符号/,
      '`deeper`’s own worked arithmetic')
    expect(dRate, 'the rate it works at').toBe(legacy.frame.mbps)
    expect(dBytes, 'the frame it works on').toBe(bytes)
    expect([dSvc, dTail], 'the bits around the payload').toEqual([16, 6])
    expect(dPayload, 'the payload as bits').toBe(8 * bytes)
    expect(RATES.find((r) => r.mbps === dRate)!.ndbps, 'the bits a symbol carries').toBe(dNdbps)
    expect(Math.ceil((dSvc + dPayload + dTail) / dNdbps), 'and the symbols it needs').toBe(dSyms)
    expect(dSyms).toBe(symbols)
  })

  it('`limits`: the three guard intervals, the flight time, and the limits this frame is far under', () => {
    const lim = L.limits.map((x) => x.text).join('\n')
    const qosTotal = QOS_HDR_BYTES + 1500 + FCS_BYTES
    // 「存在哪三档（0.8、1.6、3.2 µs）」
    const gis = figs(lim, /哪三档（([\d.]+)、([\d.]+)、([\d.]+) µs）/, '`limits` on the three tiers')
    expect(gis.map((x) => x * 1_000), 'the three guard intervals this engine has')
      .toEqual([TGI_NS.base, TGI_NS.double, TGI_NS.quad])
    // 「12.8 µs 的离散傅里叶变换周期加上 0.8 µs 的基本保护间隔」
    const [dft, base] = figs(lim, /([\d.]+) µs 的离散傅里叶变换周期加上 ([\d.]+) µs 的基本保护间隔/,
      '`limits` on the symbol’s two parts')
    expect(base * 1_000).toBe(TGI_NS.base)
    // in µs, never multiplied up: 12.8 + 0.8 times a thousand is 13600.000000000002
    expect(Number((dft + base).toFixed(3)), 'which add to the newer symbol')
      .toBe(Number((PHY_MODES.he.symNs / 1_000).toFixed(3)))
    // 「真实的 10 m 距离要走 33 ns，而时隙之所以必须有 9 µs 那么长」: physics, and a constant
    const [metres, ns] = figs(lim, /(\d+) m 距离要走 (\d+) ns/, '`limits` on the flight time')
    expect(Math.round((metres / 299_792_458) * 1e9), `${metres} m at the speed of light in ns`)
      .toBe(ns)
    const [slot] = figs(lim, /必须有 (\d+) µs 那么长/, '`limits` on the slot')
    expect(slot * 1_000).toBe(SLOT_NS)
    // 「1500 字节的 IP 包其实是 1508 字节的 MSDU，整帧应该是 26 + 1508 + 4 = 1538 字节」
    const [snap] = figs(lim, /要先放 (\d+) 个八位组/, '`limits` on the LLC/SNAP octets')
    const [ip, msdu] = figs(lim, /(\d+) 字节的 IP 包其实是 (\d+) 字节的 MSDU/,
      '`limits` on the payload and the MSDU')
    const [hdr, msdu2, fcs, whole] = figs(lim, /整帧应该是 (\d+) \+ (\d+) \+ (\d+) = (\d+) 字节/,
      '`limits` on what the frame would be')
    expect(ip + snap, 'the payload plus those octets').toBe(msdu)
    expect(msdu2).toBe(msdu)
    expect([hdr, fcs], 'the QoS header and the check').toEqual([QOS_HDR_BYTES, FCS_BYTES])
    expect(hdr + msdu + fcs, '`limits`’ own sum').toBe(whole)
    expect(whole - (QOS_HDR_BYTES + ip + FCS_BYTES), 'the octets the engine does not carry')
      .toBe(snap)
    const [again] = figs(lim, /这 (\d+) 字节从头到尾不存在/, '`limits` restating them')
    expect(again).toBe(snap)
    // 「1530 里只有两个数是标准的：26 字节的 QoS 数据帧头（24 加两字节 QoS Control）与 4 字节
    //  的 FCS。中间那 1500 是本仿真器自己定的」 — every one of those five, and the sum
    const [whole2, qosHdr, plain, fcs2] = figs(lim,
      /(\d+) 里只有两个数是标准的：(\d+) 字节的 QoS 数据帧头（(\d+) 加两字节 QoS Control）与 (\d+) 字节的 FCS/,
      '`limits` on which of the three figures are the standard’s')
    expect([qosHdr, plain, fcs2], 'the QoS header, the plain one, and the check')
      .toEqual([QOS_HDR_BYTES, MAC_HDR_BYTES, FCS_BYTES])
    expect(qosHdr - plain, 'the two bytes the mark adds').toBe(2)
    const [payload2] = figs(lim, /中间那 (\d+) 是本仿真器自己定的/, '`limits` on the payload')
    expect(qosHdr + payload2 + fcs2, '`limits`’ own three figures against its own total')
      .toBe(whole2)
    expect(whole2, 'which is the marked count the formula produces').toBe(qosTotal)
    const [payload3] = figs(lim, /载荷被定成了 (\d+)，/, '`limits` restating the payload')
    expect(payload3).toBe(payload2)
    expect(payload2, 'and that payload is what the generator really hands down')
      .toBe(legacy.frame.bytes - MAC_HDR_BYTES - FCS_BYTES)
    // the sentence's own subject — 「1530 不是一个 MPDU 的上限」 — is the marked count too
    const [subject] = figs(lim, /(\d+) 不是一个 MPDU 的上限/,
      '`limits` on what the comparison is about')
    expect(subject, 'the marked count, where the entry opens').toBe(qosTotal)
    // 「MSDU 最大 2304 字节，A-MSDU 最大 3839、4065 或 7935；dot11MaxMPDULength … 3895、7991、
    //  11454」. These are the standard's own numbers and this repository holds no corpus — what
    // IS checkable is the comparison the entry exists to make, and the order it prints them in.
    const ceilings = figs(lim,
      /MSDU 最大 (\d+) 字节，A-MSDU 最大 (\d+)、(\d+) 或 (\d+) 字节；而 dot11MaxMPDULength 给 VHT 的三个档位是 (\d+)、(\d+)、(\d+) 字节/,
      '`limits` on the limits a frame could reach')
    for (const c of ceilings) {
      expect(c, `${c} is larger than this lesson’s own frame`).toBeGreaterThan(qosTotal)
    }
    // each group is printed in ascending order, which is the only ordering claim the entry makes
    const groups = [ceilings.slice(0, 4), ceilings.slice(4)]
    for (const [i, g] of groups.entries()) {
      expect(g, `group ${i + 1} is printed in ascending order`).toEqual([...g].sort((a, b) => a - b))
    }
    const [mine] = figs(lim, /本课每一帧都是 (\d+)，/, '`limits` on the frame it compares with')
    // the figure is this lesson's own marked count — 26 + 1500 + 4 — which is what the entry is
    // about. (The two frames this scene actually puts on the air are smaller still: the laptop's
    // 1528 unmarked and the phone's 230, so the comparison holds a fortiori.)
    expect(mine, 'the marked count this lesson’s own formula produces').toBe(qosTotal)
    expect(Math.max(...txs.filter((r) => r.frame.kind === 'data' && !r.frame.ampdu)
      .map((r) => r.frame.bytes)), 'and no single frame of this scene is larger')
      .toBeLessThanOrEqual(mine)
  })
})
