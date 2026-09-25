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
import type { Block } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, ppduLayout, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, QOS_HDR_BYTES, txTimeNs, txTimeModeNs,
} from '../../src/engine/phy'
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
