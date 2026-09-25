/**
 * Every empirical claim of "A traffic mark, and a check"
 * (src/course/tier1/frame-qos-fcs.ts), measured against the scene it shares
 * with `frame-anatomy`.
 *
 * This is the SECOND half of the old `frame-anatomy`, so the QoS Control field,
 * the four-category table, the TID values, the retransmission after silence,
 * the "nothing in this engine computes a CRC" evidence and both experiments
 * arrive here from tests/course/frame-anatomy.test.ts with the sentences that
 * carry them: no pin was dropped in the move.
 *
 * The lesson is not registered in `src/course/lessons.ts` yet — the controller
 * does that when the batch lands — so the readability contract is applied here
 * by importing the lesson directly: `lessonShapeSuite` for the shape and the
 * minutes, and the terminology rule over `ZH_TERMS` for the English names.
 */
import { describe, it, expect } from 'vitest'
import { frameQosFcs } from '../../src/course/tier1/frame-qos-fcs'
import {
  frameAnatomyScenario, firstLegacyData, firstQosSingle, firstLegacyRetry,
} from '../../src/course/tier1/frame-anatomy'
import { Simulation } from '../../src/engine/simulation'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { decodeFrame, TID_FOR_AC, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import { FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES } from '../../src/engine/phy'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { readFileSync, readdirSync } from 'node:fs'

const MS = 1_000_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(frameQosFcs, undefined, RUN_NS)
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
const bitOf = (m: Mpdu, key: string) => field(m, 'fc').bits!.find((b) => b.key === key)!.value
const runEdited = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]

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

const legacy = find(firstLegacyData)
const qos = find(firstQosSingle)
const retry = find(firstLegacyRetry)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads frame-anatomy's scene, so its
// recorded timeline hash is frame-anatomy's, value for value.
lessonShapeSuite(frameQosFcs, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy' })

describe('frame-qos-fcs · the lesson itself', () => {
  it('is the second lesson of the frames module and owns the two traffic words', () => {
    expect(MODULES[frameQosFcs.module].title).toBe('帧与空口时间')
    expect(frameQosFcs.needs).toEqual(['frame-anatomy'])
    expect(frameQosFcs.terms!.map((t) => t.term)).toEqual(['QOS', 'TID'])
  })

  it('loads frame-anatomy\'s own scene, with no variant of its own', () => {
    expect(frameQosFcs.scenario()).toEqual(frameAnatomyScenario())
    expect(frameQosFcs.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(frameQosFcs.scenario())).not.toThrow()
    for (const q of frameQosFcs.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('carries no figure of its own: §4 gives it the previous lesson’s', () => {
    const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
    expect([...frameQosFcs.picture!, ...frameQosFcs.numbers!].filter(isDiagram)).toEqual([])
  })

  it('brackets every official term at its first Chinese use', () => {
    expect(termFailures(frameQosFcs)).toEqual([])
  })
})

describe('frame-qos-fcs · the two bytes', () => {
  const m = firstMpdu(qos.frame)

  it('the first QoS data frame is the phone’s uplink at 20.452 ms, marked TID 6', () => {
    // observation 1: "第一个 QoS 数据帧在 20.452 ms，是手机发出去的。它的 QoS 控制字段写着
    //  『TID 6 · Normal Ack』"
    expect(qos.t).toBe(20_452_000)
    expect(qos.frame.src).toBe('sta-2')
    expect(m.subtypeName).toBe('QoS Data')
    expect(bitOf(m, 'subtype')).toBe('1000 (QoS Data)')
    expect(field(m, 'qos').bytes).toBe(QOS_HDR_BYTES - MAC_HDR_BYTES)
    expect(field(m, 'qos').value).toBe('TID 6 · Normal Ack')
    // "两帧的持续时间都是 44 µs：这两个字节没有占掉更多空口时间"
    expect(qos.frame.durationFieldNs).toBe(44_000)
    expect(legacy.frame.durationFieldNs).toBe(44_000)
    // and the same two addresses in the same roles as the plain frame
    expect(field(m, 'addr1').roles).toEqual(['RA', 'BSSID'])
    expect(field(m, 'addr2').roles).toEqual(['TA', 'SA'])
  })

  it('the plain frame has no such field, and the two headers are 24 B against 26 B', () => {
    // observation 2: "旧笔记本的第一帧（0 µs）里根本没有这个字段——它的帧头是 24 B，
    //  手机那一帧是 26 B"
    expect(firstMpdu(legacy.frame).fields.some((x) => x.key === 'qos')).toBe(false)
    expect(MAC_HDR_BYTES).toBe(24)
    expect(QOS_HDR_BYTES).toBe(26)
    expect(MAC_HDR_BYTES + field(firstMpdu(legacy.frame), 'body').bytes + FCS_BYTES).toBe(legacy.frame.bytes)
    expect(QOS_HDR_BYTES + field(m, 'body').bytes + FCS_BYTES).toBe(qos.frame.bytes)
  })

  it('the four kinds of traffic and the mark each one is written with', () => {
    // the table "四类业务，四个标记": background 1, best effort 0, video 5, voice 6
    expect([...TID_FOR_AC]).toEqual([1, 0, 5, 6])
    // "这个房间里的手机正在通话，所以它的帧标的是 6"
    expect(TID_FOR_AC[3]).toBe(6)
    expect(field(m, 'qos').value).toContain('TID 6')
    // "那个用 Wi-Fi 5 做备份的笔记本标的是 1——背景"
    const agg = txs.find((r) => r.frame.src === 'sta-3' && r.frame.ampdu !== undefined)!
    const am = decode(agg.frame).users[0].subframes[0].mpdu
    expect(field(am, 'qos').value).toContain('TID 1')
    expect(TID_FOR_AC[0]).toBe(1)
  })
})

describe('frame-qos-fcs · the check, and what this engine does instead', () => {
  it('the steps block: the policy, the ratio, the silence, the retry', () => {
    const steps = frameQosFcs.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBeGreaterThanOrEqual(3)
    // 1. "单独一帧上写的是 Normal Ack"
    expect(field(firstMpdu(qos.frame), 'qos').value).toContain('Normal Ack')
    // 2. "原因只会是干扰、太弱、自己正在发，或者被更强的帧压住"
    const reasons = new Set(ofType(records, 'RX_FAIL').map((r) => r.reason))
    expect(reasons.size).toBeGreaterThan(0)
    for (const r of reasons) expect(['collision', 'lowSinr', 'txDuringRx', 'capture']).toContain(r)
    // 3./4. "没收下就什么都不回 … 带着同一个序列号、把重发比特置 1，再发一次——12.013 ms
    //  那一帧就是这么来的"
    expect(retry.t).toBe(12_013_000)
    expect(retry.frame.seqNo).toBe(11)
    expect(bitOf(firstMpdu(retry.frame), 'retry')).toBe('1')
    const orig = txs.find((r) => r.frame.src === 'sta-1' && r.frame.seqNo === 11 && !r.frame.retryFlag)!
    expect(orig.t).toBe(11_650_000)
    // nothing answered the original: no ACK to sta-1 between the two attempts
    const acks = txs.filter((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1' && r.t > orig.t && r.t < retry.t)
    expect(acks.length).toBe(0)
  })

  it('no engine file computes a CRC, and FCS_BYTES is only a byte count', () => {
    // the deeper note "这台引擎里没有一次 CRC". Whole-track review I2: the picture used to say
    // "the receiver does the same and compares", and a quiz asked what it does when "the
    // arithmetic does not match" — an event this simulator cannot produce.
    const dir = new URL('../../src/engine/', import.meta.url)
    for (const f of readdirSync(dir)) {
      // ampBs.ts carries crc16Epc for AMP tag ids, which is not an 802.11 MPDU check.
      if (!f.endsWith('.ts') || f === 'ampBs.ts') continue
      // Comments stripped: amp.ts names a CRC-8 when it counts the bytes of an AMP-ACK,
      // which is a byte count in a note, not arithmetic this engine ever runs.
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
      expect(src.match(/crc/gi), `${f} computes a CRC`).toBeNull()
    }
    expect(FCS_BYTES).toBe(4)
  })

  it('the deeper note: inside an aggregate the same two bits mean Implicit BAR', () => {
    const agg = txs.find((r) => r.frame.ampdu !== undefined)!
    const m = decode(agg.frame).users[0].subframes[0].mpdu
    expect(field(m, 'qos').value).toContain('Implicit BAR')
    expect(field(firstMpdu(qos.frame), 'qos').value).toContain('Normal Ack')
  })
})

describe('frame-qos-fcs · the experiments', () => {
  it('with the phone\'s marking off its frames are plain Data, with no QoS Control', () => {
    const sc = frameAnatomyScenario()
    sc.nodes.find((n) => n.id === 'sta-2')!.caps.features = {}
    const rs = runEdited(sc, 40 * MS)
    const f = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-2')!
    const m = firstMpdu(f.frame, sc)
    expect(m.subtypeName).toBe('Data')
    expect(m.fields.some((x) => x.key === 'qos')).toBe(false)
    // "帧头回到 24 B"
    expect(MAC_HDR_BYTES + field(m, 'body').bytes + FCS_BYTES).toBe(f.frame.bytes)
  })

  it('as a Wi-Fi 5 device the old laptop marks its uploads 0 — best effort', () => {
    const sc = frameAnatomyScenario()
    const old = sc.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const rs = runEdited(sc, 40 * MS)
    const agg = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1' && r.frame.ampdu !== undefined)!
    const m = decode(agg.frame, sc).users[0].subframes[0].mpdu
    expect(m.subtypeName).toBe('QoS Data')
    expect(field(m, 'qos').value).toContain('TID 0')
    expect(TID_FOR_AC[1]).toBe(0)
  })
})
