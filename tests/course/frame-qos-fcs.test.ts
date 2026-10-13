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
import { EDCA_PARAMS, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES } from '../../src/engine/phy'
import { GEN_LABEL } from '../../src/model/caps'
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
const edited = new Map<string, TLRecord[]>()
const runEdited = (sc: Scenario, ns: number): TLRecord[] => {
  const key = JSON.stringify([sc, ns])
  const hit = edited.get(key)
  if (hit) return hit
  const out = [...new Simulation(sc).runUntil(ns).records]
  edited.set(key, out)
  return out
}

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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(qos.t).toBe(20_452_000)`, `expect([...TID_FOR_AC]).toEqual([1, 0, 5, 6])` — with the
 * lesson's sentence quoted in a comment. So the engine is pinned and the prose is not: the
 * sampling sweep of 2026-10-12 planted six of this lesson's figures and **all six went
 * unnoticed**. Here every figure is parsed out of the shipped string and compared with the same
 * measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the four-category table is read as a permutation.** Its middle column lists the user
 *    priorities of each class, and the four lists together have to be 0…7 exactly once each —
 *    so moving any one digit breaks the table whether or not that class's own row is read.
 *  - **the two columns are read against each other**: the mark a class is written with has to be
 *    one of the priorities its own row lists, and it has to be the mark the engine really writes
 *    for that access category (`EDCA_PARAMS` gives the row its index, `TID_FOR_AC` the mark).
 *  - **「CRC-32」 is read as a figure, not a name**: 32 bits is what this engine's four octets
 *    of FCS come to, which is the one thing about that name this repo can check.
 *  - **「四种」 failure reasons are read off the type that defines them**, minus the one its own
 *    doc comment excludes from RX_FAIL — so the sentence stays true only while that type does.
 *  - **the Chinese numerals are read too** — 「两个字节」 (four times), 「四个字节」, 「四类业务」
 *    and 「十四帧」 are all measurements, and the planter cannot reach any of them.
 */
describe('frame-qos-fcs · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const WHY = [frameQosFcs.why!, ...frameQosFcs.outcomes!].join('\n')
  const PIC = blockText(frameQosFcs.picture)
  const NUMS = blockText(frameQosFcs.numbers)
  const DEEP = blockText(frameQosFcs.deeper)
  const LIM = blockText(frameQosFcs.limits)
  const SRC = blockText(frameQosFcs.sources)
  const OBS = blockText(frameQosFcs.observe)
  const TRY = blockText(frameQosFcs.tryThis)
  const QUIZ = blockText(frameQosFcs.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, ''))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const dp = (printed.replace(/[\s,]/g, '').split('.')[1] ?? '').length
    expect(Number(printed.replace(/[\s,]/g, '')), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** 「两」「四」「十四」 — the counts this lesson writes in characters. */
  const cn = (s: string): number => {
    const d = (c: string): number => '零一二三四五六七八九'.indexOf(c === '两' ? '二' : c)
    const i = s.indexOf('十')
    if (i < 0) return d(s)
    const hi = i === 0 ? 1 : d(s.slice(0, i))
    const lo = i === s.length - 1 ? 0 : d(s.slice(i + 1))
    return hi * 10 + lo
  }
  const table = (): { heading: string; head: string[]; rows: string[][] } =>
    frameQosFcs.numbers!.find((b) => b.kind === 'table') as unknown as
      { heading: string; head: string[]; rows: string[][] }
  const steps = (): string[] =>
    (frameQosFcs.numbers!.find((b) => b.kind === 'steps') as unknown as { items: string[] }).items
  /** The access category index of a row of the table, by the engine's own name for it. */
  const acOf = (label: string): number => {
    const name = label.includes('背景') ? 'BK' : label.includes('尽力而为') ? 'BE'
      : label.includes('视频') ? 'VI' : label.includes('语音') ? 'VO' : ''
    const p = EDCA_PARAMS.find((x) => x.name === name)
    expect(p, `no access category for the row 「${label}」`).toBeDefined()
    return p!.ac
  }
  const qosOf = (m: Mpdu): string => field(m, 'qos').value as string
  const tidOf = (m: Mpdu): number => val(raw(qosOf(m), /TID (\d+)/, 'the mark a frame carries')[0]!)

  it('reads the four-category table as a permutation of the eight priorities', () => {
    const tb = table()
    const [classesCn, marksCn] = raw(tb.heading, /(.)类业务，(.)个标记/, 'the table’s own heading')
    expect(cn(classesCn!), 'as many classes as the engine has access categories')
      .toBe(EDCA_PARAMS.length)
    expect(cn(marksCn!), 'and a mark for each of them').toBe(TID_FOR_AC.length)
    expect(tb.rows.length, 'one row each').toBe(EDCA_PARAMS.length)
    const seen: number[] = []
    for (const row of tb.rows) {
      const [label, ups, tid] = row as [string, string, string]
      const ac = acOf(label)
      const priorities = ups.split('、').join(',').split(',').map((x) => val(x.trim()))
      expect(val(tid), `the mark this engine writes for 「${label}」`).toBe(TID_FOR_AC[ac])
      expect(priorities, `and it is one of the priorities 「${label}」 covers`).toContain(val(tid))
      seen.push(...priorities)
    }
    /*
     * **The whole middle column is one claim**: the four classes partition the eight user
     * priorities. Any planted digit either repeats a priority or steps outside the range.
     */
    expect([...seen].sort((a, b) => a - b), 'the eight priorities, each in exactly one class')
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    // 「这些数字是名字，不是次序：背景是 1、尽力而为是 0」
    const [bk, be] = figs(NUMS, /背景是 (\d)、尽力而为是 (\d)/, 'the paragraph on the two marks')
    expect(bk, 'background’s own mark').toBe(TID_FOR_AC[acOf('背景')])
    expect(be, 'and best effort’s').toBe(TID_FOR_AC[acOf('尽力而为')])
    expect(bk, 'and the sentence’s point: the bigger number is the one that gives way')
      .toBeGreaterThan(be!)
  })

  it('reads which mark each device in this room really writes', () => {
    // 「这个房间里的手机正在通话，所以它的帧标的是 6」
    const [phoneTid] = figs(NUMS, /所以它的帧标的是 (\d)/, 'the paragraph on the phone')
    expect(phoneTid, 'the mark the phone’s own frame carries').toBe(tidOf(firstMpdu(qos.frame)))
    expect(phoneTid, 'which is this engine’s mark for voice').toBe(TID_FOR_AC[acOf('语音')])
    // 「那个用 Wi-Fi 5 做备份的笔记本标的是 1——背景」
    const [gen, bkTid] = figs(NUMS, /那个用 Wi-Fi (\d) 做备份的笔记本标的是 (\d)/,
      'the paragraph on the backup laptop')
    const agg = txs.find((r) => r.frame.ampdu !== undefined)!
    const am = decode(agg.frame).users[0]!.subframes[0]!.mpdu
    expect(bkTid, 'the mark that laptop’s frames carry').toBe(tidOf(am))
    expect(bkTid, 'which is this engine’s mark for background').toBe(TID_FOR_AC[acOf('背景')])
    const laptop = frameAnatomyScenario().nodes.find((n) => n.id === agg.frame.src)!
    expect(GEN_LABEL[laptop.caps.generation], 'and the generation that laptop really is')
      .toContain(`Wi-Fi ${gen}`)
    // 「它的 QoS 控制字段写着“TID 6 · Normal Ack”」 — observe prints the field whole
    const [obsMs, obsField] = raw(OBS,
      /第一个 QoS 数据帧在 ([\d.]+) ms.*?写着“(TID \d+ · Normal Ack)”/s, '`observe` on the first one')
    same(obsMs!, qos.t / MS, 'when the first marked frame goes out')
    expect(obsField, 'the field, exactly as the decoder renders it').toBe(qosOf(firstMpdu(qos.frame)))
    expect(qos.frame.src, 'and the phone is who sends it').toBe('sta-2')
  })

  it('reads the two byte counts, in characters and in digits, and the air they share', () => {
    const plain = firstMpdu(legacy.frame)
    const marked = firstMpdu(qos.frame)
    const extra = QOS_HDR_BYTES - MAC_HDR_BYTES
    // 「走完了每一帧都有的那 24 个字节」 and 「多插两个字节」 and 「固定有四个字节」
    const [hdr] = figs(WHY, /每一帧都有的那 (\d+) 个字节/, '`why` on the header before this lesson')
    expect(hdr, 'the header every frame has').toBe(MAC_HDR_BYTES)
    for (const [text, re, what, want] of [
      [WHY, /多插(.)个字节/, '`why` on the two it adds', extra],
      [WHY, /固定有(.)个字节/, '`why` on the four at the end', FCS_BYTES],
      [PIC, /再加(.)个字节/, '`picture` on the two it adds', extra],
      [PIC, /这(.)个字节，就是普通数据帧/, '`picture` on what the difference is', extra],
      [PIC, /末尾都是(.)个字节的帧校验序列/, '`picture` on the check', FCS_BYTES],
      [QUIZ, /少了(.)个字节的 QoS 控制/, 'the quiz’s right answer', extra],
      [QUIZ, /少了(.)个字节的校验/, 'the quiz’s wrong option', FCS_BYTES],
    ] as [string, RegExp, string, number][]) {
      expect(cn(raw(text, re, what)[0]!), what).toBe(want)
    }
    // 「属于四类业务中的哪一类」
    expect(cn(raw(PIC, /属于(.)类业务中的哪一类/, '`picture` on the classes')[0]!),
      'as many classes as the engine has').toBe(EDCA_PARAMS.length)
    // 「它的帧头是 24 B，手机那一帧是 26 B」 — both measured off the two frames themselves
    const [plainB, markedB] = figs(OBS, /它的帧头是 (\d+) B，手机那一帧是 (\d+) B/,
      '`observe` on the two headers')
    expect(plainB! + field(plain, 'body').bytes + FCS_BYTES, 'the plain frame, header and all')
      .toBe(legacy.frame.bytes)
    expect(markedB! + field(marked, 'body').bytes + FCS_BYTES, 'and the marked one')
      .toBe(qos.frame.bytes)
    expect(markedB! - plainB!, 'the difference between them').toBe(extra)
    expect(plain.fields.some((x) => x.key === 'qos'), 'the plain frame has no such field').toBe(false)
    // 「旧笔记本的第一帧（0 µs）」
    const [zeroUs] = figs(OBS, /旧笔记本的第一帧（(\d+) µs）/, '`observe` on when it goes out')
    expect(zeroUs! * 1000, 'when the old laptop’s first frame goes out').toBe(legacy.t)
    // 「持续时间（Duration/ID）都是 44 µs」, in `picture` and again in `observe`
    for (const [text, re, what] of [
      [PIC, /持续时间（Duration\/ID）都是 (\d+) µs/, '`picture` on the duration they share'],
      [OBS, /两帧的持续时间都是 (\d+) µs/, '`observe` on the same'],
    ] as [string, RegExp, string][]) {
      const [us] = figs(text, re, what)
      expect(us! * 1000, `${what}: the marked frame`).toBe(qos.frame.durationFieldNs)
      expect(us! * 1000, `${what}: and the plain one`).toBe(legacy.frame.durationFieldNs)
    }
  })

  it('reads the steps: the policy, the two bits, and the retry that follows the silence', () => {
    const [s0, , , s3] = steps()
    // 「在 QoS 控制的另外两个比特里写上确认策略（Ack Policy）。单独一帧上写的是 Normal Ack」
    const [bitsCn] = raw(s0!, /另外(.)个比特里写上确认策略/, 'step 1 on the policy bits')
    const parts = qosOf(firstMpdu(qos.frame)).split(' · ')
    expect(parts.length, 'the two live things that field carries').toBe(cn(bitsCn!))
    expect(parts[1], 'and a single frame’s policy, as the decoder writes it').toBe('Normal Ack')
    /*
     * **Exempt, class (a): the width of the Ack Policy subfield.** 「另外两个比特」 is
     * §9.2.4.5's own, and this engine models that subfield as a rendered name rather than as
     * bits. What is read is the count that character stands for: the field carries exactly two
     * live things, which `limits` says in so many words below.
     */
    // 「把重发比特（Retry bit）置 1，再发一次——12.013 ms 那一帧就是这么来的」
    const [bit, retryMs] = raw(s3!, /把重发比特（Retry bit）置 (\d)，再发一次——([\d.]+) ms/,
      'step 4 on the retry')
    expect(bitOf(firstMpdu(retry.frame), 'retry'), 'the bit that frame really carries').toBe(bit)
    same(retryMs!, retry.t / MS, 'when the retry goes out')
    const orig = txs.find((r) => r.frame.src === retry.frame.src
      && r.frame.seqNo === retry.frame.seqNo && !r.frame.retryFlag)!
    expect(orig.t, 'and it is a second attempt at a frame sent earlier').toBeLessThan(retry.t)
    const answered = txs.filter((r) => r.frame.kind === 'ack' && r.frame.dst === retry.frame.src
      && r.t > orig.t && r.t < retry.t)
    expect(answered.length, '「没收下就什么都不回」').toBe(0)
  })

  it('reads `deeper` and `limits` on the check this engine never computes', () => {
    /*
     * 「失败原因只有 collision、lowSinr、txDuringRx 和 capture 四种」 — read off the type that
     * defines them, minus the one its own doc comment excludes from RX_FAIL. The sentence is
     * true only while that type is, and now it says so.
     */
    const REC_SRC = readFileSync(new URL('../../src/model/records.ts', import.meta.url), 'utf8')
    const union = raw(REC_SRC, /export type RxFailReason = ([^\n]+)/, 'the type that defines them')[0]!
      .split('|').map((x) => x.trim().replace(/'/g, ''))
    const [excluded] = raw(REC_SRC, /'(\w+)' marks a preamble missed under interference/,
      'the one its doc comment excludes')
    for (const [text, re, what] of [
      [DEEP, /只有 ([^\n。]+?) 四种/, '`deeper` on the four reasons'],
      [LIM, /只有 ([^\n。]+?) 四种/, '`limits` on the same four'],
    ] as [string, RegExp, string][]) {
      const listed = raw(text, re, what)[0]!.split(/[、和与]/).map((x) => x.trim())
      expect([...listed].sort(), `${what}: exactly the reasons RX_FAIL can carry`)
        .toEqual(union.filter((x) => x !== excluded).sort())
    }
    for (const [text, what] of [[DEEP, '`deeper`'], [LIM, '`limits`']] as [string, string][]) {
      const [cnt] = raw(text, /capture (.)种/, `${what} on how many kinds`)
      expect(cn(cnt!), `${what}: as many as the type allows on RX_FAIL`)
        .toBe(union.filter((x) => x !== excluded).length)
    }
    const seen = new Set(ofType(records, 'RX_FAIL').map((r) => r.reason))
    for (const r of seen) {
      expect(union.filter((x) => x !== excluded), 'and every failure of this run is one of them')
        .toContain(r)
    }
    // 「十四帧只换回一个回复，靠的就是它」
    const [fourteenCn, oneCn] = raw(DEEP, /(..)帧只换回(.)个回复/, '`deeper` on the aggregate')
    const agg = txs.find((r) => r.frame.ampdu !== undefined)!
    expect(cn(fourteenCn!), 'the subframes that aggregate really carries')
      .toBe(agg.frame.ampdu!.mpduCount)
    const replies = txs.filter((r) => r.frame.dst === agg.frame.src && r.t > agg.t
      && r.t < agg.t + agg.frame.txTimeNs + 100_000)
    expect(replies.length, 'and the replies it really draws').toBe(cn(oneCn!))
    expect(replies[0]!.frame.kind, 'which is a block acknowledgement').toBe('ba')
    expect(qosOf(decode(agg.frame).users[0]!.subframes[0]!.mpdu),
      'and inside it those same two bits read as the request').toContain('Implicit BAR')
    // 「那两个字节里只有两样东西是活的：TID 与确认策略」
    const [liveCn] = raw(LIM, /只有(.)样东西是活的/, '`limits` on what is modelled')
    expect(qosOf(firstMpdu(qos.frame)).split(' · ').length, 'the live halves of that field')
      .toBe(cn(liveCn!))
    /*
     * 「同一段业务在别家设备上可能标成 2 或 4」 — both are priorities the table lists, and
     * neither is a mark this engine writes: that is the whole claim.
     */
    const [other1, other2] = figs(LIM, /可能标成 (\d) 或 (\d)/, '`limits` on other implementations')
    const ups = table().rows.flatMap((r) => r[1]!.split('、').join(',').split(',')
      .map((x) => val(x.trim())))
    for (const x of [other1!, other2!]) {
      expect(ups, 'a priority the table lists').toContain(x)
      expect([...TID_FOR_AC], 'and not a mark this engine writes').not.toContain(x)
    }
    // 「FCS_BYTES 只是一个字节数」 — and `deeper`'s own evidence, which the file above checks
    expect(FCS_BYTES, 'the octets at the end of every frame').toBe(4)
    expect(MAC_HDR_BYTES + field(firstMpdu(legacy.frame), 'body').bytes + FCS_BYTES,
      'and they are in the length, nothing else').toBe(legacy.frame.bytes)
  })

  it('reads the table `sources` cites, and the mark a frame falls back to', () => {
    /*
     * **Three figures got past the reads above** (sweep of 2026-10-14), and two of them had reads
     * that any neighbouring digit would also satisfy.
     *
     * 「以及各自写入的 TID，见表 10-1」 — a standard table, and no corpus ships with this repo.
     * But this engine's own mapping cites the same table in the file `limits` names, so the two
     * citations are read against each other: move either digit and they stop agreeing.
     */
    const FF_SRC = readFileSync(new URL('../../src/model/frameFields.ts', import.meta.url), 'utf8')
    const [cited] = raw(SRC, /各自写入的 TID，见表 (\d+-\d+)/, '`sources` on the mapping table')
    const [named] = raw(LIM, /frameFields\.ts 的 (TID_FOR_AC)）/, '`limits` on the constant it names')
    const [inEngine] = raw(FF_SRC, new RegExp(`Table (\\d+-\\d+)[^\\n]*\\n[^\\n]*${named}`),
      'the table the engine’s own mapping cites')
    expect(cited, 'the same table, cited on both sides').toBe(inEngine)
    /*
     * 「什么都没少，只是 TID 变成了 0」 — the quiz's wrong option. The 0 is not any mark: it is
     * the one the decoder writes when a frame carries no access category of its own
     * (`TID_FOR_AC[a.ac ?? 1]` in frameFields.ts), which is what makes the option plausible —
     * and 「什么都没少」 is what makes it wrong, measured in the experiment read above.
     */
    const [fallbackAc] = figs(FF_SRC, /TID_FOR_AC\[a\.ac \?\? (\d)\]/, 'the decoder’s own fallback')
    const [notTid] = figs(QUIZ, /只是 TID 变成了 (\d)/, 'the quiz’s wrong option')
    expect(notTid, 'the mark a frame with no category of its own gets')
      .toBe(TID_FOR_AC[fallbackAc!])
    expect(EDCA_PARAMS[fallbackAc!]!.name, 'which is the category it falls back to').toBe('BE')
    /*
     * **Exempt, class (e): the 「2 或 4」 of `limits`.** 「同一段业务在别家设备上可能标成 2 或 4」
     * needs two priorities this engine never writes, and there are four of those — 3 or 7 would
     * make the same sentence true. What is read: each is a priority the table lists, neither is
     * a mark this engine writes, and the two come from two different classes, which is what the
     * sentence is for.
     */
    const [a, b] = figs(LIM, /可能标成 (\d) 或 (\d)/, '`limits` on other implementations')
    const rowOf = (up: number): number => table().rows
      .findIndex((r) => r[1]!.split('、').join(',').split(',').map((x) => val(x.trim())).includes(up))
    for (const x of [a!, b!]) {
      expect(rowOf(x), `${x} is a priority some class covers`).toBeGreaterThanOrEqual(0)
      expect([...TID_FOR_AC], `${x} is not a mark this engine writes`).not.toContain(x)
    }
    expect(rowOf(a!), 'and the two name two different classes').not.toBe(rowOf(b!))
  })

  it('reads `sources` and both experiments', () => {
    // 「它是对帧头与帧体计算的 CRC-32」 — the 32 is the width of this engine's own four octets
    const [crcBits] = figs(SRC, /计算的 CRC-(\d+)/, '`sources` on the check')
    expect(crcBits, 'the bits those four octets come to').toBe(FCS_BYTES * 8)
    // 「本仿真器写入的取值是：背景 1、尽力而为 0、视频 5、语音 6」 — in `sources` and in `limits`
    for (const [text, re, what] of [
      [SRC, /取值是：背景 (\d)、尽力而为 (\d)、视频 (\d)、语音 (\d)/, '`sources` on the four marks'],
      [LIM, /（背景 (\d)、尽力而为 (\d)、视频 (\d)、语音 (\d)）/, '`limits` on the same four'],
    ] as [string, RegExp, string][]) {
      const four = figs(text, re, what)
      for (const [i, label] of ['背景', '尽力而为', '视频', '语音'].entries()) {
        expect(four[i], `${what}: ${label}`).toBe(TID_FOR_AC[acOf(label)])
      }
    }
    // 「它的帧变成普通 Data 帧…帧头回到 24 B」 — the phone with its marking switched off
    const off = frameAnatomyScenario()
    off.nodes.find((n) => n.id === 'sta-2')!.caps.features = {}
    const offRs = runEdited(off, 40 * MS)
    const plainPhone = offRs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data'
      && r.frame.src === 'sta-2')!
    const pm = firstMpdu(plainPhone.frame, off)
    const [backTo] = figs(QUIZ, /帧头回到 (\d+) B/, 'the quiz on the header it goes back to')
    expect(backTo! + field(pm, 'body').bytes + FCS_BYTES, 'the header it really goes back to')
      .toBe(plainPhone.frame.bytes)
    expect(pm.fields.some((x) => x.key === 'qos'), 'with no such field at all').toBe(false)
    /*
     * 「什么都没少，只是 TID 变成了 0」 — the quiz's other wrong option. The 0 it names is a mark
     * this engine really writes (for best effort), which is what makes the option plausible;
     * what makes it wrong is measured above: the field is gone, not rewritten.
     */
    const [notTid] = figs(QUIZ, /只是 TID 变成了 (\d)/, 'the quiz’s other wrong option')
    expect([...TID_FOR_AC], 'a mark this engine does write, for another class').toContain(notTid)
    expect(tidOf(firstMpdu(qos.frame)), 'but not the one the phone carried').not.toBe(notTid)
    // 「把旧笔记本改成 Wi-Fi 5…标记写的是 0——尽力而为」
    const vht = frameAnatomyScenario()
    const old = vht.nodes.find((n) => n.id === 'sta-1')!
    old.caps.generation = 'vht'
    old.caps.features = { edca: true, ampdu: true, txop: true }
    const vhtRs = runEdited(vht, 40 * MS)
    const [tryGen] = figs(TRY, /把旧笔记本改成 Wi-Fi (\d)/, '`tryThis` on the generation')
    expect(GEN_LABEL[old.caps.generation], 'the generation it is set to').toContain(`Wi-Fi ${tryGen}`)
    const [tryTid] = figs(TRY, /标记写的是 (\d)——尽力而为/, '`tryThis` on the mark it then writes')
    const vhtAgg = vhtRs.find((r): r is Tx => r.type === 'TX_START' && r.frame.src === 'sta-1'
      && r.frame.ampdu !== undefined)!
    expect(tidOf(decode(vhtAgg.frame, vht).users[0]!.subframes[0]!.mpdu),
      'the mark it really writes then').toBe(tryTid)
    expect(tryTid, 'which is this engine’s mark for best effort').toBe(TID_FOR_AC[acOf('尽力而为')])
  })
})
