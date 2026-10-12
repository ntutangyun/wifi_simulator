/**
 * Every empirical claim of "What a small frame costs, and what one preamble
 * buys" (src/course/tier1/small-frames.ts), measured against the scene it
 * shares with `frame-anatomy-bytes`.
 *
 * This is the SECOND half of `frame-anatomy-bytes`, so the control-frame sizes,
 * the aggregation formula, the reservation durations, the burst observation and
 * both experiments arrive here from tests/course/frame-anatomy-bytes.test.ts
 * with the sentences that carry them: no pin was dropped in the move.
 *
 * The lesson is not registered in `src/course/lessons.ts` yet — the controller
 * does that when the batch lands — so the readability contract is applied here
 * by importing the lesson directly: `lessonShapeSuite` for the shape and the
 * minutes, and the terminology rule over `ZH_TERMS` for the English names.
 */
import { describe, it, expect } from 'vitest'
import {
  smallFrames, burstSequence, BURST_BYTES, BURST_MPDUS, RTS_AT, BURST_AT, BA_AT,
} from '../../src/course/tier1/small-frames'
import {
  frameAnatomyScenario, firstRtsFrame, firstAmpduFrame, firstBlockAck,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import type { Block, Lesson } from '../../src/course/lessonKit'
import type { SequenceSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, CTS_BYTES, MAX_AMPDU_MPDUS, MAX_PPDU_NS, PHY_MODES,
  RTS_BYTES, SIFS_NS, txTimeNs,
} from '../../src/engine/phy'
import {
  ZH_TERMS, cellTexts, lessonTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(smallFrames, undefined, RUN_NS)
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
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)!
const runEdited = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
/** The instant as the lesson prints it: "2.298 ms". */
const asMs = (ns: number): string => `${(ns / MS).toFixed(3)} ms`

/** The reader's own order over the main path, as tests/course/readability.test.ts walks it. */
const zhMain = (l: Lesson): string => [l.why!, ...(l.outcomes ?? [])]
  .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
  .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
  .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
  .join(' ')

function termFailures(l: Lesson): string[] {
  const zh = zhMain(l)
  const out: string[] = []
  for (const t of ZH_TERMS.filter((x) => !x.track || x.track === trackOf(l))) {
    const why = zhTermFailure(zh, t)
    if (why) out.push(`${l.id}: ${why}`)
    out.push(...zhAkaViolations(zh, t).map((a) => `${l.id}: ${a}`))
  }
  return out
}

const rts = find(firstRtsFrame)
const ampdu = find(firstAmpduFrame)
const ba = find(firstBlockAck)
const cts = txs.find((r) => r.frame.kind === 'cts')!
const ack = txs.find((r) => r.frame.kind === 'ack')!

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads its parent's scene, which is
// `frame-anatomy`'s builder, so all three recorded hashes are the same run.
lessonShapeSuite(smallFrames, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy-bytes' })

describe('small-frames · the lesson itself', () => {
  it('is the fourth lesson of the frames module and needs the byte count', () => {
    expect(MODULES[smallFrames.module].title).toBe('帧与空口时间')
    expect(smallFrames.needs).toEqual(['frame-anatomy-bytes'])
    expect(smallFrames.terms!.map((t) => t.term)).toEqual(['A-MPDU', 'BlockAck'])
  })

  it('loads its parent’s own scene, with no variant of its own', () => {
    expect(smallFrames.scenario()).toEqual(frameAnatomyScenario())
    expect(smallFrames.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(smallFrames.scenario())).not.toThrow()
    for (const q of smallFrames.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('brackets every official term at its first Chinese use', () => {
    expect(termFailures(smallFrames)).toEqual([])
  })
})

describe('small-frames · the small frames', () => {
  it('an answer and a go-ahead are 14 B and carry no sender address', () => {
    const am = firstMpdu(ack.frame)
    expect(am.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
    expect(am.bytes).toBe(ACK_BYTES)
    expect(ACK_BYTES).toBe(14)
    expect(cts.frame.bytes).toBe(CTS_BYTES)
    expect(CTS_BYTES).toBe(14)
    const cm = firstMpdu(cts.frame)
    expect(cm.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'fcs'])
  })

  it('a 14 B answer costs 28 µs, of which 20 µs is the front', () => {
    // the picture's "它在空口上要占 28 µs，其中 20 µs 是前导码"
    expect(txTimeNs(ACK_BYTES, 24)).toBe(28_000)
    expect(ack.frame.txTimeNs).toBe(28_000)
    expect(Math.ceil((16 + 8 * ACK_BYTES + 6) / 96)).toBe(2)
    expect(20_000 + 2 * 4_000).toBe(28_000)
    // the quiz: half the bytes saves one symbol, not half the time
    expect(Math.ceil((16 + 8 * 7 + 6) / 96)).toBe(1)
    expect(txTimeNs(7, 24)).toBe(24_000)
    expect(28_000 - txTimeNs(7, 24)).toBe(4_000)
  })

  it('a reservation is 20 B and does carry one, because the answer must find it', () => {
    expect(rts.frame.bytes).toBe(RTS_BYTES)
    expect(RTS_BYTES).toBe(20)
    const m = firstMpdu(rts.frame)
    expect(m.subtypeName).toBe('RTS')
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'fcs'])
    expect(field(m, 'addr1').roles).toEqual(['RA'])
    expect(field(m, 'addr2').roles).toEqual(['TA'])
    expect(m.bytes).toBe(20)
  })

  it('the one reply covering a burst is 32 B: both addresses, a starting number and a 64-bit map', () => {
    expect(ba.frame.bytes).toBe(BA_BYTES)
    expect(BA_BYTES).toBe(32)
    const m = firstMpdu(ba.frame)
    expect(m.fields.map((x) => x.key)).toEqual(['fc', 'duration', 'addr1', 'addr2', 'baControl', 'baInfo', 'fcs'])
    expect(field(m, 'baControl').bytes).toBe(2)
    expect(field(m, 'baInfo').bytes).toBe(10) // a 2 B starting sequence number + an 8 B (64-bit) bitmap
    expect(field(m, 'baControl').value).toBe('Compressed')
    expect(m.bytes).toBe(32)
  })

  it('the two small frames together are under three per cent of the burst', () => {
    // observation 2: "RTS 20 B、CTS 14 B，各占 28 µs，而且两个都是 24 Mb/s。
    //  它们加起来还不到那个突发的百分之三"
    expect(rts.frame.txTimeNs).toBe(28_000)
    expect(cts.frame.txTimeNs).toBe(28_000)
    expect(rts.frame.mbps).toBe(24)
    expect(cts.frame.mbps).toBe(24)
    expect((rts.frame.txTimeNs + cts.frame.txTimeNs) / ampdu.frame.txTimeNs).toBeLessThan(0.03)
  })
})

describe('small-frames · many frames behind one front', () => {
  it('fourteen frames: 13 × 1536 + 1534 = 21 502 B, one 4 B delimiter each, padding but the last', () => {
    expect(ampdu.frame.retryFlag).toBeFalsy()
    expect(ampdu.frame.ampdu!.mpduCount).toBe(BURST_MPDUS)
    expect(BURST_MPDUS).toBe(14)
    expect(ampdu.frame.bytes).toBe(BURST_BYTES)
    expect(BURST_BYTES).toBe(21_502)
    expect(13 * 1536 + 1534).toBe(21_502)
    const u = decode(ampdu.frame).users[0]
    expect(u.subframes.length).toBe(14)
    expect(u.bytes).toBe(21_502)
    for (const [i, sf] of u.subframes.entries()) {
      expect(sf.delimiterBytes).toBe(4)
      expect(sf.mpdu.bytes).toBe(1530)
      expect(sf.padBytes).toBe(i === 13 ? 0 : 2)
    }
    expect(ampdu.frame.txTimeNs).toBe(2_248_000)
  })

  it('the steps block: the queue, the threshold, the three durations and the one reply', () => {
    const steps = smallFrames.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(5)
    // 1. "每帧 1530 B，前面 4 B 的分隔符，再补齐到 4 的倍数——十四个之后是 21 502 B"
    expect(decode(ampdu.frame).users[0].subframes.every((sf) => sf.mpdu.bytes === 1530)).toBe(true)
    expect(ampdu.frame.bytes).toBe(21_502)
    // 2. "超过了本场景的预约门限 2000 B"
    expect(frameAnatomyScenario().rtsThresholdBytes).toBe(2000)
    expect(ampdu.frame.bytes).toBeGreaterThan(2000)
    expect(rts.t).toBe(2_298_000)
    expect(rts.frame.durationFieldNs).toBe(2_356_000)
    expect(28_000 + ampdu.frame.txTimeNs + 32_000 + 3 * SIFS_NS).toBe(2_356_000)
    // 3. "同一个预约，减去一个间隔和它自己"
    expect(cts.frame.durationFieldNs).toBe(2_312_000)
    expect(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs).toBe(2_312_000)
    // 4. "占 2248 µs 空口；它自己的持续时间只写 48 µs"
    expect(ampdu.frame.durationFieldNs).toBe(48_000)
    expect(SIFS_NS + 32_000).toBe(48_000)
    // 5. "4.650 ms，一个 32 B 的 BlockAck 一次回答十四帧，持续时间写 0"
    expect(ba.t).toBe(4_650_000)
    expect(ba.frame.durationFieldNs).toBe(0)
    expect(ba.frame.txTimeNs).toBe(32_000)
  })

  it('the deeper note: inside an aggregate the same two bits mean Implicit BAR', () => {
    const m = decode(ampdu.frame).users[0].subframes[0].mpdu
    expect(field(m, 'qos').value).toBe('TID 1 · Implicit BAR')
  })
})

describe('small-frames · the figure is the run', () => {
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...smallFrames.picture!, ...smallFrames.numbers!].filter(isDiagram)

  it('draws the one figure §4 gives this lesson, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['sequence'])
  })

  it('the four messages are the four transmissions of the run, at their own instants', () => {
    const seq = diagrams[0].spec as SequenceSpec
    expect(seq).toEqual(burstSequence())
    const sc = frameAnatomyScenario()
    for (const c of seq.columns) expect(sc.nodes.some((n) => n.id === c.id), c.id).toBe(true)
    // the burst is the laptop's, and the two small frames are its reservation
    expect(ampdu.frame.src).toBe('sta-3')
    expect(rts.frame.src).toBe('sta-3')
    expect(cts.frame.src).toBe('ap')
    expect(ba.frame.src).toBe('ap')
    expect(seq.messages.map((m) => [m.from, m.to])).toEqual([
      ['sta-3', 'ap'], ['ap', 'sta-3'], ['sta-3', 'ap'], ['ap', 'sta-3'],
    ])
    // every size in a label, and every instant in the gutter, is the run's own
    expect(seq.messages[0].label).toContain(`${rts.frame.bytes} B`)
    expect(seq.messages[1].label).toContain(`${cts.frame.bytes} B`)
    expect(seq.messages[2].label).toContain(String(ampdu.frame.ampdu!.mpduCount))
    expect(seq.messages[3].label).toContain(`${ba.frame.bytes} B`)
    expect([RTS_AT, BURST_AT, BA_AT]).toEqual([asMs(rts.t), asMs(ampdu.t), asMs(ba.t)])
    expect(seq.messages.flatMap((m) => (m.at ? [m.at] : []))).toEqual([asMs(rts.t), asMs(ampdu.t), asMs(ba.t)])
  })
})

describe('small-frames · the experiments', () => {
  it('with the reservation threshold above 21 502 B the bursts go out with nothing in front', () => {
    const sc = frameAnatomyScenario()
    sc.rtsThresholdBytes = 30_000
    const rs = runEdited(sc, RUN_NS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.ampdu !== undefined)!
    expect(agg.frame.bytes).toBeGreaterThan(21_000)
    expect(agg.frame.bytes).toBeLessThan(sc.rtsThresholdBytes!)
    expect(rs.some((r) => r.type === 'TX_START' && r.frame.kind === 'rts')).toBe(false)
    expect(rs.some((r) => r.type === 'TX_START' && r.frame.kind === 'cts')).toBe(false)
  })

  it('as a Wi-Fi 5 device the old laptop\'s lone frames become bursts opened by a reservation', () => {
    const sc = frameAnatomyScenario()
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const rs = runEdited(sc, 40 * MS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1' && r.frame.ampdu !== undefined)!
    expect(agg.frame.ampdu!.mpduCount).toBeGreaterThan(1)
    expect(agg.frame.bytes).toBeGreaterThan(sc.rtsThresholdBytes!)
    const before = rs.filter((r): r is Tx => r.type === 'TX_START' && r.t < agg.t && r.frame.src === 'sta-1')
    expect(before[before.length - 1].frame.kind).toBe('rts')
  })
})

// --- every figure the lesson prints ------------------------------------------------------------

/**
 * **Everything above pins the engine and nothing pins the lesson.** `expect(ACK_BYTES).toBe(14)`,
 * `expect(txTimeNs(ACK_BYTES, 24)).toBe(28_000)`, `expect(20_000 + 2 * 4_000).toBe(28_000)` — the
 * figures are typed here, so the ones a reader reads could be edited a digit at a time with the
 * suite green. Measured on 2026-10-12: six planted, six unnoticed, 71 plantable figures.
 *
 * Every figure below is read out of the passage that prints it. The four small frames and the
 * burst are one arithmetic — a frame, a delimiter, padding to four, fourteen of them — and the
 * two NAV durations are the same arithmetic read backwards, so each is fed back into the engine's
 * own function rather than compared with a literal.
 */
describe('small-frames · every figure the lesson prints, read back out of its own prose', () => {
  const EVERYWHERE = lessonTexts(smallFrames).map((t) => t.text).join('\n')
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

  it('the four frames of this lesson, at every size the lesson gives them', () => {
    // 「笔记本先用一个 20 B 的小帧预约信道，路由器用一个 14 B 的小帧回答允许；随后是 21 502 B
    //  的突发，最后是一个 32 B 的回复」 — the four, in the order the scene sends them
    const [rtsB, ctsB, burstB, baB] = figs(EVERYWHERE,
      /一个 (\d+) B 的小帧预约信道，路由器用一个 (\d+) B 的小帧回答允许；随后是 ([\d\s]+) B 的突发，最后是一个 (\d+) B 的回复/,
      'the four frames of the exchange')
    expect([rtsB, ctsB, baB], 'the three small ones this engine builds')
      .toEqual([rts.frame.bytes, cts.frame.bytes, ba.frame.bytes])
    expect(burstB, 'and the burst the engine assembles').toBe(ampdu.frame.bytes)
    // every 「14 B」 in the lesson is one of the two 14-octet frames it has
    for (const v of everyFig(/(\d+) 字节的回复|一个 (\d+) B 的确认帧|CTS (\d+) B|(\d+) B 的 CTS|(\d+) B 的 Ack/g,
      'a fourteen-octet frame', 4)) {
      expect(val(v), 'the answer and the go-ahead are the same size')
        .toBe(ack.frame.bytes)
    }
    expect(ack.frame.bytes, 'and that size is the CTS’s too').toBe(cts.frame.bytes)
    // 「RTS 20 B、CTS 14 B」 in `observe`
    const [obsRts, obsCts] = figs(smallFrames.observe.join('\n'), /RTS (\d+) B、CTS (\d+) B/,
      '`observe` on the two small frames')
    expect([obsRts, obsCts], 'the same two sizes').toEqual([rts.frame.bytes, cts.frame.bytes])
    // 「一个带 64 位位图、32 B 的 BlockAck，而不是十四个 14 B 的 Ack」
    const [bits, baAgain, ackAgain] = figs(EVERYWHERE,
      /一个带 (\d+) 位位图、(\d+) B 的 BlockAck，而不是十四个 (\d+) B 的 Ack/,
      '`deeper` on what fourteen frames buy back')
    expect(baAgain, 'the reply’s own size').toBe(ba.frame.bytes)
    expect(ackAgain, 'against the answer it replaces').toBe(ack.frame.bytes)
    // `baInfo` is a 2-octet starting sequence number followed by the bitmap itself
    const baInfo = field(firstMpdu(ba.frame), 'baInfo').bytes
    expect(bits, 'the bitmap this engine builds').toBe(8 * (baInfo - 2))
  })

  it('a small frame’s airtime: the front, the symbols, and what halving the bytes saves', () => {
    // 「它在空口上要占 28 µs，其中 20 µs 是前导码」, wherever the lesson says it
    const pairs = [...EVERYWHERE.matchAll(/占 (\d+) µs，其中 (\d+) µs 是前导码/g)]
      .map((m) => [val(m[1]), val(m[2])])
    expect(pairs.length, 'the lesson states that pair more than once').toBeGreaterThan(1)
    for (const [total, front] of pairs) {
      expect(total * 1000, 'the airtime of an answer').toBe(ack.frame.txTimeNs)
      expect(front * 1000, 'and the preamble inside it').toBe(PHY_MODES.nonht.preambleNs)
      expect((total - front) * 1000 % PHY_MODES.nonht.symNs,
        'what is left is a whole number of symbols').toBe(0)
    }
    // every 「24 Mb/s」: the rate a control frame answers at, here and in `limits`
    for (const v of everyFig(/恒为 (\d+) Mb\/s|都是 (\d+) Mb\/s|在 (\d+) Mb\/s 下要两个符号/g,
      'the rate the small frames go at', 3)) {
      expect(val(v), 'the rate this engine sends them at').toBe(ack.frame.mbps)
      expect(val(v), 'and the CTS too').toBe(cts.frame.mbps)
    }
    // the quiz: 「把它砍成 7 个字节，会省多少？」 「最多 4 µs」
    const [cut] = figs(EVERYWHERE, /把它砍成 (\d+) 个字节/, 'the smaller frame the quiz imagines')
    const [saved] = figs(EVERYWHERE, /最多 (\d+) µs/, 'what the quiz says that saves')
    expect(txTimeNs(ack.frame.bytes, ack.frame.mbps) - txTimeNs(cut, ack.frame.mbps),
      'which is one symbol').toBe(saved * 1000)
    expect(saved * 1000, 'and a symbol is what it is').toBe(PHY_MODES.nonht.symNs)
    // 「14 B 在 24 Mb/s 下要两个符号，7 B 只要一个」
    const symbols = (bytes: number, mbps: number): number =>
      (txTimeNs(bytes, mbps) - PHY_MODES.nonht.preambleNs) / PHY_MODES.nonht.symNs
    expect(symbols(ack.frame.bytes, ack.frame.mbps), 'two symbols for the answer').toBe(2)
    expect(symbols(cut, ack.frame.mbps), 'and one for the shorter frame').toBe(1)
    // 「一半：14 µs」 is the wrong answer, and what makes it wrong is that it IS half
    for (const v of everyFig(/一半：(\d+) µs/g, 'the wrong answer’s own figure', 1)) {
      expect(2 * val(v) * 1000, 'half the airtime, which is not what fewer bytes buy')
        .toBe(ack.frame.txTimeNs)
    }
  })

  it('the burst: a place in the queue, fourteen of them, and the 21 502 octets they come to', () => {
    // 「队列里的一个位置 = 4 B 的分隔符 + 那一帧 + 补齐到 4 的倍数的填充」
    const f = (smallFrames.numbers ?? []).find(
      (b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(f, 'the formula is gone from `numbers`').toBeDefined()
    const [delim, pad] = figs(f!.text,
      /= (\d+) B 的分隔符 \+ 那一帧 \+ 补齐到 (\d+) 的倍数的填充/, 'what a place in the queue costs')
    expect(delim, 'the delimiter this engine puts in front of every subframe')
      .toBe(AMPDU_DELIMITER_BYTES)
    // The 4-octet boundary has no constant of its own; what pins it is the arithmetic below,
    // which has to come out at the burst the engine really assembled.
    expect(pad, 'and the boundary it pads to is a whole number of octets')
      .toBeGreaterThan(1)
    // 「每帧 1530 B，前面 4 B 的分隔符，再补齐到 4 的倍数——十四个之后是 21 502 B」
    const [each, delim2, pad2, total] = figs(EVERYWHERE,
      /每帧 ([\d\s]+) B，前面 (\d+) B 的分隔符，再补齐到 (\d+) 的倍数——十四个之后是 ([\d\s]+) B/,
      'the burst, assembled')
    expect([delim2, pad2], 'the same two').toEqual([delim, pad])
    expect(each, 'the frame every place holds')
      .toBe(firstMpdu(ampdu.frame, smallFrames.scenario()).bytes)
    // 「13 × 1536 + 1534 = 21 502 B」: thirteen padded places and one unpadded
    const [n, padded, last, sum] = figs(EVERYWHERE,
      /：(\d+) × ([\d\s]+) \+ ([\d\s]+) = ([\d\s]+) B/, 'the arithmetic of the burst')
    expect(padded, 'a padded place is the frame, its delimiter and its padding')
      .toBe(Math.ceil((each + delim) / pad) * pad)
    expect(last, 'and the last place is not padded').toBe(each + delim)
    expect(n * padded + last, 'the lesson’s own sum').toBe(sum)
    expect(n + 1, 'over the subframes this burst really carries')
      .toBe(ampdu.frame.ampdu!.mpduCount)
    expect(sum, 'and the burst the engine assembles').toBe(ampdu.frame.bytes)
    expect([total, sum], 'the two places the total is printed agree').toEqual([sum, sum])
    // 「这 56 个字节在本模型里不起任何作用」: one delimiter for every subframe
    const [dead] = figs(EVERYWHERE, /这 (\d+) 个字节在本模型里不起任何作用/,
      '`limits` on the delimiters')
    expect(dead, 'a delimiter for every place in the burst')
      .toBe(delim * ampdu.frame.ampdu!.mpduCount)
    // 「一个突发最多 64 个子帧、最长 5.484 ms」
    const [maxSub, maxMs] = raw(EVERYWHERE, /最多 (\d+) 个子帧、最长 ([\d.]+) ms/,
      '`limits` on what a burst may reach')
    expect(val(maxSub), 'the subframes this engine allows').toBe(MAX_AMPDU_MPDUS)
    same(maxMs, MAX_PPDU_NS / 1_000_000, 'and the airtime it allows')
    expect(ampdu.frame.ampdu!.mpduCount, 'this burst is well under that')
      .toBeLessThan(val(maxSub))
  })

  it('the two reservations, the burst and the reply: every duration the lesson quotes', () => {
    // 「RTS 门限（本场景 2000 B）」, in `numbers`, `sources` and `limits`
    for (const v of everyFig(/门限（本场景 ([\d\s]+) B）|RTS 门限（RTS threshold）([\d\s]+) B|RTS 门限 ([\d\s]+) B/g,
      'the RTS threshold this scene sets', 2)) {
      expect(val(v), 'the threshold the scenario really carries')
        .toBe(smallFrames.scenario().rtsThresholdBytes)
    }
    // the four durations: the RTS, the CTS, the burst and the reply
    const [rtsNav] = figs(EVERYWHERE, /的 RTS，持续时间写 ([\d\s]+) µs/, 'the RTS’s own NAV')
    const [ctsNav] = figs(EVERYWHERE, /的 CTS 回答允许，持续时间写 ([\d\s]+) µs/, 'the CTS’s')
    const [burstUs] = figs(EVERYWHERE, /突发随后发出，占 ([\d\s]+) µs 空口/, 'the burst’s airtime')
    const [burstNav] = figs(EVERYWHERE, /它自己的持续时间只写 (\d+) µs/, 'and its own NAV')
    expect(rtsNav * 1000, 'the RTS reserves what the engine wrote in it')
      .toBe(rts.frame.durationFieldNs)
    expect(ctsNav * 1000, 'and so does the CTS').toBe(cts.frame.durationFieldNs)
    expect(burstUs * 1000, 'the burst’s airtime').toBe(ampdu.frame.txTimeNs)
    expect(burstNav * 1000, 'and the burst reserves only what follows it')
      .toBe(ampdu.frame.durationFieldNs)
    expect(rtsNav, 'the RTS covers more than the CTS').toBeGreaterThan(ctsNav)
    // 「一个 32 B 的 BlockAck 一次回答十四帧，持续时间写 0：它后面什么都没有了」
    const [baNav] = figs(EVERYWHERE, /持续时间写 (\d+)：它后面什么都没有了/, 'the reply’s NAV')
    expect(baNav * 1000, 'nothing follows the reply').toBe(ba.frame.durationFieldNs)
    // 「覆盖全部的那一个回复出现在 4.650 ms」 and the figure's own 「2.386 ms」
    for (const v of everyFig(/出现在 ([\d.]+) ms|回复出现在 ([\d.]+) ms/g,
      'when the reply is sent', 1)) {
      same(v, ba.t / 1_000_000, 'the instant the reply goes out')
    }
  })

  /**
   * **The first pass left twenty-five of the seventy-one unread, and every one of them was the
   * same figure in a shape the reads above did not match**: 「要花 28 µs」 beside 「占 28 µs，其中
   * 20 µs 是前导码」, 「一个 20 B 的 RTS」 beside 「一个 20 B 的小帧」, 「本课算出的 21 502 B」 beside
   * 「十四个之后是 21 502 B」. Four of them — every 「21 502」 — had no equal literal anywhere under
   * `tests/`, because this file imports `BURST_BYTES` instead of typing it, so nothing in the
   * repository was holding the figure a reader reads.
   *
   * This is the closing move of every lesson in this programme, and the measurement says to make
   * it the OPENING one: read each figure at every site it is printed, then go back for the ones
   * that need their own argument.
   */
  it('every size, every airtime and every count, at every site the lesson prints it', () => {
    const sizes = [rts.frame.bytes, cts.frame.bytes, ba.frame.bytes]
    for (const v of everyFig(
      /(?<![\d.])(\d+) B 的 RTS|(\d+) B 的 CTS|(\d+) B 的 BlockAck|(\d+) B 的小帧|一个 (\d+) B 的回复|(\d+) 字节的回复|一个 (\d+) B 的确认帧/g,
      'a small frame’s size', 6)) {
      expect(sizes, `${v} B is one of this lesson’s small frames`).toContain(val(v))
    }
    // every 「28 µs」 is a small frame's airtime, and all three have the same one
    for (const v of everyFig(/要花 (\d+) µs|占 (\d+) µs，其中|各占 (\d+) µs|的确认帧占 (\d+) µs|恒为 (\d+) µs/g,
      'the airtime of a small frame', 4)) {
      expect(val(v) * 1000, 'the airtime of a fourteen-octet control frame')
        .toBe(ack.frame.txTimeNs)
    }
    expect(new Set([ack.frame.txTimeNs, cts.frame.txTimeNs, rts.frame.txTimeNs]).size,
      'all three small frames take the same time').toBe(1)
    // every 「21 502 B」 is the burst this engine assembles, and every 「14 帧」 its subframes
    for (const v of everyFig(
      /([\d\s]+) B 的突发|十四个之后是 ([\d\s]+) B|本课算出的 ([\d\s]+) B|门限抬到 ([\d\s]+) B|突发之所以是 ([\d\s]+) B|帧、([\d\s]+) B/g,
      'the burst', 5)) {
      expect(val(v), 'the burst the engine assembles').toBe(ampdu.frame.bytes)
    }
    for (const v of everyFig(/那个突发：(\d+) 帧/g, 'the subframes of the burst', 1)) {
      expect(val(v), 'the subframes this burst carries').toBe(ampdu.frame.ampdu!.mpduCount)
    }
    // every delimiter, in `numbers`, `sources` and `limits`
    for (const v of everyFig(/(\d+) 个字节的分隔符|(\d+) 个八位组的分隔符|再补齐到 (\d+) 字节边界/g,
      'the delimiter and the boundary', 3)) {
      expect(val(v), 'the delimiter this engine puts in front of every subframe')
        .toBe(AMPDU_DELIMITER_BYTES)
    }
    // the field table, and `limits` on the bitmap: how wide it is and what it can say
    const bitmapBits = 8 * (field(firstMpdu(ba.frame), 'baInfo').bytes - 2)
    for (const v of everyFig(/一张 (\d+) 位位图|那张 (\d+) 位位图/g, 'the bitmap the reply carries', 2)) {
      expect(val(v), 'the bitmap this engine builds').toBe(bitmapBits)
    }
    const cells = (smallFrames.numbers ?? []).filter(
      (b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .flatMap((b) => b.rows.map((r) => r.join(' '))).join('\n')
    const addrs = (f: typeof ack.frame): number =>
      firstMpdu(f).fields.filter((x) => x.key.startsWith('addr')).length
    expect(figs(cells, /地址 (\d+)（Address \d+）、帧校验序列/, 'the one address an answer carries')[0],
      'the answer carries that many addresses').toBe(addrs(ack.frame))
    expect(figs(cells, /再加地址 (\d+)——回复得找得到它/, 'the address the reservation adds')[0],
      'which takes the reservation to that many').toBe(addrs(rts.frame))
    expect(addrs(rts.frame) - addrs(ack.frame), 'one more than the answer').toBe(1)
    // 「BlockAck 要么全是 1 要么这一串整个失败」: a set bit, which is all this model can say
    for (const v of everyFig(/要么全是 (\d+) 要么这一串整个失败/g, 'the bit the bitmap sets', 1)) {
      expect(val(v), 'a bit that is set').toBe(Number(true))
    }
    // 「4.650 ms」 and 「写的持续时间是 0」, where `numbers` and `observe` state them
    for (const v of everyFig(/(?:^|\n)([\d.]+) ms，一个|出现在 ([\d.]+) ms/g,
      'when the reply is sent', 2)) {
      same(v, ba.t / 1_000_000, 'the instant the reply goes out')
    }
    for (const v of everyFig(/写的持续时间是 (\d+)|持续时间写 (\d+)：/g, 'the reply’s own NAV', 2)) {
      expect(val(v) * 1000, 'nothing follows the reply').toBe(ba.frame.durationFieldNs)
    }
    // the quiz's explanation, which states the whole symbol argument a second time
    const symbols = (bytes: number, mbps: number): number =>
      (txTimeNs(bytes, mbps) - PHY_MODES.nonht.preambleNs) / PHY_MODES.nonht.symNs
    const [b1, rate, b2, symUs, preUs] = figs(EVERYWHERE,
      /(\d+) B 在 (\d+) Mb\/s 下要两个符号，(\d+) B 只要一个，省下的就是那一个 (\d+) µs 的符号。前面那 (\d+) µs/,
      'the quiz’s own explanation')
    expect(b1, 'the frame the quiz starts from').toBe(ack.frame.bytes)
    expect(rate, 'at the rate it goes out').toBe(ack.frame.mbps)
    expect([symbols(b1, rate), symbols(b2, rate)], 'two symbols, then one').toEqual([2, 1])
    expect(symUs * 1000, 'the symbol it saves').toBe(PHY_MODES.nonht.symNs)
    expect(preUs * 1000, 'and the front that never changes').toBe(PHY_MODES.nonht.preambleNs)
    expect(txTimeNs(b1, rate) - txTimeNs(b2, rate), 'which is exactly one symbol')
      .toBe(PHY_MODES.nonht.symNs)
    /*
     * And the shorter frame is HALF of the answer, at both sites the quiz names it. Nothing
     * about the airtime can pin that figure — 8 octets saves the same one symbol as 7 does, so
     * the sweep edited it and nothing noticed. What makes 7 the right number is the question
     * itself: 「把它砍成一半，会省多少？」, against a wrong answer that says 「一半：14 µs」.
     */
    for (const v of everyFig(/把它砍成 (\d+) 个字节|(\d+) B 只要一个/g, 'the halved frame', 2)) {
      expect(2 * val(v), 'half of the answer this lesson is about').toBe(ack.frame.bytes)
    }
  })
})
