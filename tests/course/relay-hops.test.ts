/**
 * Every empirical claim of "A phone to a phone goes twice"
 * (src/course/tier1/relay-hops.ts), measured against the scene it shares with
 * `roles-stack`.
 *
 * This is the SECOND half of the old `roles-stack`, so the five-step timeline,
 * the 1430 B frame and its 125.6 µs, the 50 µs of forwarding, the
 * one-hop-against-two averages and both experiments arrive here from
 * tests/course/roles-stack.test.ts with the sentences that carry them: no pin
 * was dropped in the move.
 *
 * The lesson is not registered in `src/course/lessons.ts` yet — the controller
 * does that when the batch lands — so the readability contract is applied here
 * by importing the lesson directly: `lessonShapeSuite` for the shape and the
 * minutes, and the terminology rule over `ZH_TERMS` for the English names.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  relayHops, relayHopsSequence, RELAY_FRAME_BYTES, RELAY_FRAME_US, RELAY_FWD_US,
  RELAY_PAYLOAD_BYTES, RELAY_HOP1_AT, RELAY_HOP2_AT, RELAY_DONE_AT,
} from '../../src/course/tier1/relay-hops'
import {
  rolesStackScenario, firstUplinkData, firstRelayHop1, firstRelayHop2,
} from '../../src/course/tier1/roles-stack'
import type { SequenceSpec } from '../../src/course/diagram'
import type { Block, Lesson } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { LatencyStats, ViewState } from '../../src/model/view'
import { ACK_BYTES, FCS_BYTES, QOS_HDR_BYTES, SIFS_NS } from '../../src/engine/phy'
import { decodeFrame } from '../../src/model/frameFields'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { lessonShapeSuite, runOf } from './kit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000
const RUN_NS = 1000 * MS
const PHONES = ['sta-3', 'sta-4']

const runs = new Map<string, { records: TLRecord[]; view: ViewState }>()
function run(sc: Scenario, ms: number) {
  const key = JSON.stringify([sc, ms])
  const hit = runs.get(key)
  if (hit) return hit
  const sim = new Simulation(sc)
  const records = [...sim.runUntil(ms * MS).records]
  const out = { records, view: sim.view }
  runs.set(key, out)
  return out
}
const mean = (l: LatencyStats): number => l.sumNs / l.n
const ids = (r: Tx): number[] => r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
const dataTx = (rs: TLRecord[]): Tx[] => rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')
/** The instant as the lesson prints it: "1.4157 ms". */
const asMs = (ns: number): string => `${(ns / MS).toFixed(4)} ms`

/** The reader's own order over the main path, as tests/course/readability.test.ts walks it. */
const zhMain = (l: Lesson): string => [l.why!, ...(l.outcomes ?? [])]
  .concat(paragraphTexts(l.picture ?? []), cellTexts(l.picture ?? []))
  .concat(paragraphTexts(l.numbers ?? []), cellTexts(l.numbers ?? []))
  .concat(l.observe, l.tryThis, l.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
  .join(' ')

/** Every failure of the terminology rule in one lesson, collected rather than asserted one by one. */
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

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: this lesson loads roles-stack's scene, so its
// recorded timeline hash is roles-stack's, value for value.
lessonShapeSuite(relayHops, { runNs: RUN_NS, sameSceneAs: 'roles-stack' })

describe('relay-hops · the lesson itself', () => {
  it('is the second lesson of the module about roles, and needs the first', () => {
    expect(MODULES[relayHops.module].title).toBe('一张网里的角色')
    expect(relayHops.needs).toEqual(['roles-stack'])
    expect(relayHops.terms!.map((t) => t.term)).toEqual(['DS'])
  })

  it('loads roles-stack\'s own scene, with no variant of its own', () => {
    expect(relayHops.scenario()).toEqual(rolesStackScenario())
    expect(relayHops.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(relayHops.scenario())).not.toThrow()
    for (const q of relayHops.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('brackets every official term at its first Chinese use', () => {
    expect(termFailures(relayHops)).toEqual([])
  })
})

describe('relay-hops · one payload, instant by instant', () => {
  const rs1s = runOf(relayHops, undefined, RUN_NS)
  const hop1 = rs1s.find(firstRelayHop1) as Tx
  const hop2 = rs1s.find(firstRelayHop2) as Tx

  it('the two hops happen at the instants the steps and the figure print', () => {
    expect(hop1.t).toBe(1_415_723)
    expect(hop1.node).toBe('sta-4')
    expect(hop2.t).toBe(1_635_323)
    expect(hop2.frame.dst).toBe('sta-3')
    expect(ids(hop2)).toEqual(ids(hop1))
    expect(asMs(hop1.t)).toBe(RELAY_HOP1_AT)
    expect(asMs(hop2.t)).toBe(RELAY_HOP2_AT)
  })

  it('the steps block: one payload from phone to phone, value by value', () => {
    // "1.4157 ms，它到达手机 B；屋里正安静，手机 B 立刻把它发了出去。" … "这一帧长 125.6 µs。
    //  接入点在 1.5413 ms 收齐，隔 16 µs 后作答。" … "这个回复占 28 µs 空口。第一跳在 1.5853 ms
    //  结束，花掉 169.6 µs。" … "转发花 50 µs，于是 1.6353 ms 时这份载荷进入发往手机 A 的队列，
    //  并立刻发出。" … "到 1.8049 ms，手机 A 已经作答。第二跳同样花 169.6 µs：全程 389.2 µs。"
    const id = ids(hop1)[0]
    const arrivalB = rs1s.find((r) => r.type === 'ARRIVAL' && r.node === 'sta-4' && r.msduId === id)!
    expect(arrivalB.t).toBe(hop1.t)
    expect(hop1.frame.txTimeNs).toBe(125_600)
    expect(RELAY_FRAME_US * 1000).toBe(hop1.frame.txTimeNs)
    const rxAp = rs1s.find((r) => r.type === 'RX_OK' && r.node === 'ap' && r.t >= hop1.t)!
    expect(rxAp.t).toBe(1_541_323)
    const ack1 = rs1s.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'ack' && r.node === 'ap' && r.t > hop1.t)!
    expect(ack1.t - rxAp.t).toBe(16_000)
    expect(SIFS_NS).toBe(16_000)
    expect(ack1.frame.txTimeNs).toBe(28_000)
    expect(ack1.frame.bytes).toBe(ACK_BYTES)
    const deqB = rs1s.find((r) => r.type === 'DEQUEUE' && r.node === 'sta-4' && r.msduId === id)!
    expect(deqB.t).toBe(1_585_323)
    expect(deqB.t - hop1.t).toBe(169_600)
    const arrAp = rs1s.find((r) => r.type === 'ARRIVAL' && r.node === 'ap' && r.msduId === id)!
    expect(arrAp.t - deqB.t).toBe(RELAY_FWD_US * 1000)
    expect(hop2.t).toBe(arrAp.t) // "并立刻发出"
    const deqAp = rs1s.find((r) => r.type === 'DEQUEUE' && r.node === 'ap' && r.msduId === id)!
    expect(deqAp.t).toBe(1_804_923)
    expect(asMs(deqAp.t)).toBe(RELAY_DONE_AT)
    expect(deqAp.t - hop2.t).toBe(169_600)
    expect(deqAp.t - arrivalB.t).toBe(389_200)
  })

  it('the frame the figure and the caption quote is the frame the engine builds', () => {
    // the caption's "1430 B" by way of the steps' 125.6 µs, and the payload behind it
    expect(hop1.frame.bytes).toBe(QOS_HDR_BYTES + RELAY_PAYLOAD_BYTES + FCS_BYTES)
    expect(hop1.frame.bytes).toBe(RELAY_FRAME_BYTES)
    expect(RELAY_FRAME_BYTES).toBe(1430)
    expect(hop1.frame.mode).toBe('he')
    expect(hop1.frame.widthMhz ?? 20).toBe(20)
    const arrivals = rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && PHONES.includes(r.node))
    expect(arrivals.length).toBeGreaterThan(500)
    expect(arrivals.every((r) => r.bytes === RELAY_PAYLOAD_BYTES)).toBe(true)
  })

  it('the paragraph under the table: 50 µs of 389.2 µs, and the rest is queueing and waiting', () => {
    // "389.2 µs 的全程里，转发只占 50 µs"
    expect(RELAY_FWD_US * 1000).toBe(50_000)
    expect(50_000 / 389_200).toBeLessThan(0.13)
    // and the two hops each cost the same 169.6 µs, which is where the time went
    expect(2 * 169_600 + 50_000).toBe(389_200)
  })

  it('relay latency = hop 1 + 50 µs of forwarding + hop 2, for every relayed payload', () => {
    const arr = new Map<string, number>()
    const born = new Map<number, number>()
    const hop1Ns = new Map<number, number>()
    let checked = 0
    for (const r of rs1s) {
      if (r.type === 'ARRIVAL') {
        arr.set(`${r.node}/${r.msduId}`, r.t)
        if (PHONES.includes(r.node)) born.set(r.msduId, r.t)
      } else if (r.type === 'DEQUEUE') {
        const a = arr.get(`${r.node}/${r.msduId}`)!
        if (PHONES.includes(r.node)) hop1Ns.set(r.msduId, r.t - a)
        else if (r.node === 'ap' && born.has(r.msduId)) {
          expect(r.t - born.get(r.msduId)!).toBe(hop1Ns.get(r.msduId)! + 50_000 + (r.t - a))
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('the laptop opens with a reservation frame and a burst of fifty', () => {
    // observation 2: "笔记本先发一个短的预约帧，接着是一个突发：50 份载荷跟在同一个前导码后面"
    const ul = rs1s.find(firstUplinkData) as Tx
    expect(ul.frame.ampdu?.mpduCount).toBe(50)
    const before = rs1s.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-1' && r.t < ul.t)
    expect(before.at(-1)?.frame.kind).toBe('rts')
  })

  it('one hop or two: about 0.7 ms against about 1.3 ms, close to double', () => {
    // the "一跳还是两跳" table and the paragraph under it, and observation 2's two averages
    for (const { view } of [run(rolesStackScenario(), 1000), run(rolesStackScenario(), 3000)]) {
      const tv = mean(view.nodes['sta-2'].stats.rxLatency)
      expect(tv).toBeGreaterThan(0.6 * MS)
      expect(tv).toBeLessThan(0.8 * MS)
      for (const p of PHONES) {
        const p2p = mean(view.nodes[p].stats.relayLatency)
        expect(p2p).toBeGreaterThan(1.2 * MS)
        expect(p2p).toBeLessThan(1.4 * MS)
        expect(p2p / tv).toBeGreaterThan(1.7)
        expect(p2p / tv).toBeLessThan(2.0)
      }
    }
  })
})

describe('relay-hops · the figure is the run', () => {
  const rs = runOf(relayHops, undefined, RUN_NS)
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...relayHops.picture!, ...relayHops.numbers!].filter(isDiagram)

  it('draws the one figure §4 gives this lesson, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['sequence'])
  })

  it('every column is a node of the scene, and every message is a transmission of the run', () => {
    const seq = diagrams[0].spec as SequenceSpec
    expect(seq).toEqual(relayHopsSequence())
    const sc = rolesStackScenario()
    for (const c of seq.columns) expect(sc.nodes.some((n) => n.id === c.id), c.id).toBe(true)
    const hop1 = rs.find(firstRelayHop1) as Tx
    const hop2 = rs.find(firstRelayHop2) as Tx
    // the two data arrows are the two hops, in that order and between those parties
    const data = seq.messages.filter((m) => m.label === '数据帧')
    expect(data.map((m) => [m.from, m.to])).toEqual([[hop1.node, hop1.frame.dst], [hop2.node, hop2.frame.dst]])
    // the AP's self-message is the forward, and the run really takes that long over it
    const self = seq.messages.find((m) => m.from === m.to)!
    expect(self.from).toBe('ap')
    expect(self.label).toBe(`转发 ${RELAY_FWD_US} µs`)
    // every instant in the gutter is an instant of the run
    const id = ids(hop1)[0]
    const deqAp = rs.find((r) => r.type === 'DEQUEUE' && r.node === 'ap' && r.msduId === id)!
    expect(seq.messages.flatMap((m) => (m.at ? [m.at] : [])))
      .toEqual([asMs(hop1.t), asMs(hop2.t), asMs(deqAp.t)])
  })
})

describe('relay-hops · the experiments', () => {
  it('Phone B beside Phone A: still no direct frame, still about 1.3 ms', () => {
    const sc = rolesStackScenario()
    const b = sc.nodes.find((n) => n.id === 'sta-4')!
    b.pos = { ...b.pos, x: 2.5, y: 6 }
    const { records, view } = run(sc, 1000)
    expect(dataTx(records).some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    for (const p of PHONES) {
      const p2p = mean(view.nodes[p].stats.relayLatency)
      expect(p2p).toBeGreaterThan(1.2 * MS)
      expect(p2p).toBeLessThan(1.4 * MS)
    }
  })

  it('Laptop idle: phone to phone about 0.7 ms, the TV about 0.3 ms, still close to double', () => {
    const sc = rolesStackScenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle']
    const { view } = run(sc, 1000)
    const tv = mean(view.nodes['sta-2'].stats.rxLatency)
    expect(tv).toBeGreaterThan(0.25 * MS)
    expect(tv).toBeLessThan(0.35 * MS)
    for (const p of PHONES) {
      const p2p = mean(view.nodes[p].stats.relayLatency)
      expect(p2p).toBeGreaterThan(0.6 * MS)
      expect(p2p).toBeLessThan(0.75 * MS)
      expect(p2p / tv).toBeGreaterThan(1.8)
      expect(p2p / tv).toBeLessThan(2.4)
    }
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(rxAp.t).toBe(1_541_323)` — with the lesson's step quoted in a comment. So the engine
 * is pinned and the prose is not: the sampling sweep of 2026-10-12 planted six of this lesson's
 * figures and **all six went unnoticed**. Here every figure is parsed out of the shipped string
 * and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the five steps are read as one payload's own records.** Every figure in them — the instant
 *    it arrives, the length of the frame, the instant the access point has it, the silence, the
 *    answer's air, the end of the first hop, the forward, the instant the second hop starts, the
 *    instant the far phone has answered, and the two hop costs — comes from the records of the
 *    **same `msduId`**, so no step can be read against a different payload than its neighbour.
 *  - **the table's middle column is read as the air transmissions a payload really takes.** 「1」
 *    and 「2」 are counted by following one payload id through every data frame of the run, which
 *    is what makes that column a measurement rather than a label.
 *  - **「约 0.7 ms」 is read to the digit it is printed to.** A figure with 「约」 in front of it
 *    is not exempt: it is read at the precision it shows, so 0.7 passes and 0.8 does not.
 *  - **the Chinese numerals are read too.** 「走两趟」 and 「两跳比一跳」 are the same count the
 *    table's middle column prints, and the planter cannot reach them — but a reader can.
 */
describe('relay-hops · every figure the prose prints, read back out of it', () => {
  const rs = run(rolesStackScenario(), 1000).records
  const view = run(rolesStackScenario(), 1000).view
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
  const WHY = [relayHops.why!, ...relayHops.outcomes!].join('\n')
  const PIC = blockText(relayHops.picture)
  const NUMS = blockText(relayHops.numbers)
  const DEEP = blockText(relayHops.deeper)
  const SRC = blockText(relayHops.sources)
  const OBS = blockText(relayHops.observe)
  const TRY = blockText(relayHops.tryThis)
  const QUIZ = blockText(relayHops.quiz)
  const LIM = blockText(relayHops.limits)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, ''))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  /** A printed figure against a measurement, at the precision the lesson prints it to. */
  const same = (printed: string, measured: number, what: string): void => {
    const dp = (printed.replace(/[\s,]/g, '').split('.')[1] ?? '').length
    expect(Number(printed.replace(/[\s,]/g, '')), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
  const steps = (): string[] =>
    (relayHops.numbers!.find((b) => b.kind === 'steps') as unknown as { items: string[] }).items
  const table = (): { head: string[]; rows: string[][] } =>
    relayHops.numbers!.find((b) => b.kind === 'table') as unknown as { head: string[]; rows: string[][] }
  const caption = (): string =>
    (relayHops.picture!.find((b) => b.kind === 'diagram') as unknown as { caption: string }).caption

  const hop1 = rs.find(firstRelayHop1) as Tx
  const hop2 = rs.find(firstRelayHop2) as Tx
  const id = ids(hop1)[0]!
  const at = (type: string, node: string, from = 0): TLRecord =>
    rs.find((r) => r.type === type && (r as { node?: string }).node === node
      && (r as { msduId?: number }).msduId === id && r.t >= from)!
  /** Every data frame of the run that carries this payload, in order. */
  const carrying = (msdu: number): Tx[] =>
    rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && ids(r).includes(msdu))

  it('reads the five steps as one payload’s own records, figure by figure', () => {
    const [s0, s1, s2, s3, s4] = steps()
    // 「1.4157 ms，它到达手机 B；屋里正安静，手机 B 立刻把它发了出去。」
    const arrivalB = at('ARRIVAL', 'sta-4')
    const [arrMs, phoneB] = raw(s0!, /^([\d.]+) ms，它到达手机 (.)；/, 'step 1 on the arrival')
    expect(arrMs, 'when the payload reaches the phone').toBe(asMs(arrivalB.t).replace(' ms', ''))
    expect(hop1.node, `手机 ${phoneB} is the phone that sends it`).toBe('sta-4')
    expect(hop1.t, 'and 「立刻」 means it goes out at that same instant').toBe(arrivalB.t)
    // 「这一帧长 125.6 µs。接入点在 1.5413 ms 收齐，隔 16 µs 后作答。」
    const [frameUs] = figs(s1!, /这一帧长 ([\d.]+) µs/, 'step 2 on the frame')
    expect(frameUs! * 1000, 'the air this frame really takes').toBe(hop1.frame.txTimeNs)
    const rxAp = rs.find((r) => r.type === 'RX_OK' && r.node === 'ap' && r.t >= hop1.t)!
    const [gotMs, silenceUs] = raw(s1!, /接入点在 ([\d.]+) ms 收齐，隔 (\d+) µs 后作答/,
      'step 2 on the access point')
    same(gotMs!, rxAp.t / MS, 'when the access point has it whole')
    const ack1 = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'ack'
      && r.node === 'ap' && r.t > hop1.t)!
    expect(val(silenceUs!) * 1000, 'the silence it keeps before answering').toBe(ack1.t - rxAp.t)
    expect(val(silenceUs!) * 1000, 'which is the engine’s own short silence').toBe(SIFS_NS)
    // 「这个回复占 28 µs 空口。第一跳在 1.5853 ms 结束，花掉 169.6 µs。」
    const [ackUs] = figs(s2!, /这个回复占 (\d+) µs 空口/, 'step 3 on the answer')
    expect(ackUs! * 1000, 'the air the answer really takes').toBe(ack1.frame.txTimeNs)
    const deqB = at('DEQUEUE', 'sta-4')
    const [endMs, hopUs] = raw(s2!, /第一跳在 ([\d.]+) ms 结束，花掉 ([\d.]+) µs/, 'step 3 on the first hop')
    same(endMs!, deqB.t / MS, 'when the first hop is done')
    expect(val(hopUs!) * 1000, 'and what it cost').toBe(deqB.t - hop1.t)
    // 「转发花 50 µs，于是 1.6353 ms 时这份载荷进入发往手机 A 的队列，并立刻发出。」
    const arrAp = at('ARRIVAL', 'ap')
    const [fwdUs, queueMs, phoneA] = raw(s3!,
      /转发花 (\d+) µs，于是 ([\d.]+) ms 时这份载荷进入发往手机 (.) 的队列/, 'step 4 on the forward')
    expect(val(fwdUs!) * 1000, 'how long the forward really takes').toBe(arrAp.t - deqB.t)
    expect(val(fwdUs!), 'which is the constant the lesson names').toBe(RELAY_FWD_US)
    same(queueMs!, arrAp.t / MS, 'when it enters the queue for the other phone')
    expect(hop2.frame.dst, `手机 ${phoneA} is who the second hop goes to`).toBe('sta-3')
    expect(hop2.t, '「并立刻发出」: the second hop starts at that instant').toBe(arrAp.t)
    // 「到 1.8049 ms，手机 A 已经作答。第二跳同样花 169.6 µs：全程 389.2 µs。」
    const deqAp = at('DEQUEUE', 'ap')
    const [doneMs, hop2Us, allUs] = raw(s4!,
      /到 ([\d.]+) ms，手机 . 已经作答。第二跳同样花 ([\d.]+) µs：全程 ([\d.]+) µs/,
      'step 5 on the end')
    same(doneMs!, deqAp.t / MS, 'when the far phone has answered')
    expect(val(hop2Us!) * 1000, 'what the second hop cost').toBe(deqAp.t - hop2.t)
    expect(val(hop2Us!), '「同样」: the same as the first hop').toBe(val(hopUs!))
    expect(val(allUs!) * 1000, 'and the whole way').toBe(deqAp.t - arrivalB.t)
  })

  it('reads the caption, and the payload the figure is drawn from', () => {
    // 「两次发送各带一个确认帧…中间是接入点固定 50 µs 的转发；…全程 389.2 µs」
    const cap = caption()
    const [fwdUs] = figs(cap, /接入点固定 (\d+) µs 的转发/, 'the caption on the forward')
    const [allUs] = figs(cap, /全程 ([\d.]+) µs/, 'the caption on the whole way')
    const arrivalB = at('ARRIVAL', 'sta-4')
    const deqAp = at('DEQUEUE', 'ap')
    const deqB = at('DEQUEUE', 'sta-4')
    const arrAp = at('ARRIVAL', 'ap')
    expect(fwdUs! * 1000, 'the forward this payload really waits out').toBe(arrAp.t - deqB.t)
    expect(allUs! * 1000, 'and the whole way, on the same payload').toBe(deqAp.t - arrivalB.t)
    // 「两次发送各带一个确认帧」 — two sends, and an answer to each
    const [sendsCn, perCn] = raw(cap, /(.)次发送各带(.)个确认帧/, 'the caption on the two sends')
    expect(cn(sendsCn!), 'the air transmissions this payload really takes').toBe(carrying(id).length)
    const acks = rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'ack'
      && r.t > hop1.t && r.t <= deqAp.t)
    expect(acks.length, 'each one answered once').toBe(cn(sendsCn!) * cn(perCn!))
  })

  it('reads the one-hop-against-two table, middle column and all', () => {
    const tb = table()
    expect(tb.head.length, 'a route, a hop count and an average').toBe(3)
    const [windowCn] = raw(
      (relayHops.numbers!.find((b) => b.kind === 'table') as unknown as { heading: string }).heading,
      /整整(.)秒的平均/, 'the table’s own window')
    expect(cn(windowCn!) * 1000 * MS, 'the window every average is taken over').toBe(RUN_NS)
    for (const row of tb.rows) {
      const [label, hops, avg] = row as [string, string, string]
      const toTv = label.includes('电视')
      /*
       * The payload the row is about: a downlink one to the television, or one of the phones'
       * relayed ones. The hop count is counted by following that payload id through the run.
       */
      const first = toTv
        ? rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data'
          && r.node === 'ap' && r.frame.dst === 'sta-2')!
        : hop1
      expect(val(hops), `how many air transmissions 「${label}」 really takes`)
        .toBe(carrying(ids(first)[0]!).length)
      const [about, ms] = raw(avg, /^(约 )?([\d.]+) ms$/, `the average of 「${label}」`)
      expect(about, 'the lesson says 「约」, and is read to the digit it prints').toBe('约 ')
      if (toTv) same(ms!, mean(view.nodes['sta-2']!.stats.rxLatency) / MS, `${label} average`)
      else for (const p of PHONES) {
        same(ms!, mean(view.nodes[p]!.stats.relayLatency) / MS, `${label} average, ${p}`)
      }
    }
  })

  it('reads the paragraph under the table, and `deeper`’s arithmetic', () => {
    // 「389.2 µs 的全程里，转发只占 50 µs」
    const [allUs, fwdUs] = figs(NUMS, /([\d.]+) µs 的全程里，转发只占 (\d+) µs/,
      'the paragraph on where the time goes')
    const arrivalB = at('ARRIVAL', 'sta-4')
    const deqAp = at('DEQUEUE', 'ap')
    const deqB = at('DEQUEUE', 'sta-4')
    const arrAp = at('ARRIVAL', 'ap')
    expect(allUs! * 1000, 'the whole way').toBe(deqAp.t - arrivalB.t)
    expect(fwdUs! * 1000, 'of which the forward is this much').toBe(arrAp.t - deqB.t)
    // 「就算把它算成 0，两跳也还是 169.6 × 2 = 339.2 µs，对一跳的 169.6 µs」
    const [zero, hopsCn] = raw(DEEP, /就算把它算成 (\d)，(.)跳也还是/, '`deeper` on dropping the forward')
    expect(val(zero), 'the forward, counted as nothing').toBe(0)
    expect(cn(hopsCn!), 'the hops that remain').toBe(carrying(id).length)
    const [one, times, sum, against] = figs(DEEP,
      /([\d.]+) × (\d) = ([\d.]+) µs，对一跳的 ([\d.]+) µs/, '`deeper` on the two hops')
    expect(one! * 1000, 'what one hop really costs').toBe(deqB.t - hop1.t)
    expect(against, 'the same hop, printed again as the one-hop case').toBe(one)
    expect(times, 'how many of them the relay pays').toBe(carrying(id).length)
    expect(sum, 'and their sum, which is the lesson’s own arithmetic').toBe(one! * times!)
    expect((sum! + fwdUs!) * 1000, 'and with the forward back in, the whole way')
      .toBe(deqAp.t - arrivalB.t)
    // 「每一份载荷…都要在空口上走两趟」 and 「说出两跳比一跳多花的是什么」
    for (const [text, re, what] of [
      [WHY, /都要在空口上走(.)趟/, '`why` on the two trips'],
      [WHY, /说出(.)跳比一跳多花的是什么/, 'the outcome on the two hops'],
    ] as [string, RegExp, string][]) {
      expect(cn(raw(text, re, what)[0]!), what).toBe(carrying(id).length)
    }
  })

  it('reads `observe`, both experiments and the quiz against the same runs', () => {
    // 「50 份载荷跟在同一个前导码后面」
    const ul = rs.find(firstUplinkData) as Tx
    const [burst] = figs(OBS, /(\d+) 份载荷跟在同一个前导码/, '`observe` on the burst')
    expect(burst, 'the subframes that one preamble really carries').toBe(ul.frame.ampdu?.mpduCount)
    // 「跑满一秒，电视的接收数值稳定在约 0.7 ms，而手机互传是 1.3 ms」
    const [secCn] = raw(OBS, /跑满(.)秒/, '`observe` on the window')
    expect(cn(secCn!) * 1000 * MS, 'the window those averages are taken over').toBe(RUN_NS)
    const [tvMs, p2pMs] = raw(OBS,
      /电视的接收数值稳定在约 ([\d.]+) ms，而手机互传是 ([\d.]+) ms/, '`observe` on the two averages')
    same(tvMs!, mean(view.nodes['sta-2']!.stats.rxLatency) / MS, 'the television’s average')
    for (const p of PHONES) same(p2pMs!, mean(view.nodes[p]!.stats.relayLatency) / MS, `${p} average`)
    // 「把手机 B 拖到手机 A 旁边…仍约 1.3 ms」
    const moved = rolesStackScenario()
    const b = moved.nodes.find((n) => n.id === 'sta-4')!
    b.pos = { ...b.pos, x: 2.5, y: 6 }
    const movedView = run(moved, 1000).view
    const [movedMs] = raw(TRY, /每一份载荷仍要绕经接入点，仍约 ([\d.]+) ms/, '`tryThis` on the moved phone')
    for (const p of PHONES) {
      same(movedMs!, mean(movedView.nodes[p]!.stats.relayLatency) / MS, `${p} with the phone moved`)
    }
    // 「把笔记本改成 idle 再跑一遍。手机互传降到约 0.7 ms，电视降到约 0.3 ms」
    const idle = rolesStackScenario()
    idle.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle']
    const idleView = run(idle, 1000).view
    const [idleP2p, idleTv] = raw(TRY,
      /手机互传降到约 ([\d.]+) ms，电视降到约 ([\d.]+) ms/, '`tryThis` on the idle laptop')
    for (const p of PHONES) {
      same(idleP2p!, mean(idleView.nodes[p]!.stats.relayLatency) / MS, `${p} with the laptop idle`)
    }
    same(idleTv!, mean(idleView.nodes['sta-2']!.stats.rxLatency) / MS, 'the television with it idle')
    // 「转发只占全程 389.2 µs 里的 50 µs」 — the quiz prints the same pair a third time
    const [quizAll, quizFwd] = figs(QUIZ, /转发只占全程 ([\d.]+) µs 里的 (\d+) µs/, 'the quiz on the forward')
    const arrivalB = at('ARRIVAL', 'sta-4')
    const deqAp = at('DEQUEUE', 'ap')
    const deqB = at('DEQUEUE', 'sta-4')
    const arrAp = at('ARRIVAL', 'ap')
    expect(quizAll! * 1000, 'the whole way, a third time').toBe(deqAp.t - arrivalB.t)
    expect(quizFwd! * 1000, 'and the forward inside it').toBe(arrAp.t - deqB.t)
    // 「两次：手机 A 到接入点，接入点再到手机 B」 — the right option, as a count
    const [optCn] = raw(QUIZ, /(.)次：手机 . 到接入点，接入点再到手机 ./, 'the quiz’s right option')
    expect(cn(optCn!), 'the air transmissions one relayed payload really takes')
      .toBe(carrying(id).length)
  })

  it('reads the forward everywhere it is printed again, and the fields `limits` describes', () => {
    /*
     * **Nine figures got past the file above** (sweep of 2026-10-14), and five of them are the
     * same 50 µs: the paragraph under the table, `deeper`'s heading, `deeper`'s own sentence,
     * `limits`, and the quiz's wrong option. Each is read against the forward this payload
     * really waits out — 「同一个数印第二遍就是第二个窝」 once more.
     */
    const deqB = at('DEQUEUE', 'sta-4')
    const arrAp = at('ARRIVAL', 'ap')
    const fwdNs = arrAp.t - deqB.t
    for (const [text, re, what] of [
      [NUMS, /不是因为那 (\d+) µs 的转发/, 'the paragraph under the table'],
      [DEEP, /那 (\d+) µs 是模型，不是标准/, '`deeper`’s own heading'],
      [DEEP, /接入点把载荷转发出去所花的 (\d+) µs/, '`deeper` on the forward'],
      [LIM, /那 (\d+) µs 是一个常数/, '`limits` on the forward'],
      [QUIZ, /因为接入点要花 (\d+) µs 把它转发过去/, 'the quiz’s wrong option'],
    ] as [string, RegExp, string][]) {
      expect(figs(text, re, what)[0]! * 1000, what).toBe(fwdNs)
    }
    /*
     * 「src/engine/simulation.ts 的 RELAY_FWD_NS，任何负载下都不变」 — the entry names a constant,
     * so the constant is read out of the file it names: the name has to be there, and the value
     * it is given has to be the forward measured above.
     */
    const SIM_SRC = readFileSync(new URL('../../src/engine/simulation.ts', import.meta.url), 'utf8')
    const [name] = raw(LIM, /simulation\.ts 的 (RELAY_FWD_NS)/, '`limits` on the constant it names')
    const srcNs = Number(raw(SIM_SRC, new RegExp(`const ${name} = ([\\d_]+)`),
      'the constant itself')[0]!.replace(/_/g, ''))
    expect(srcNs, 'the value the engine really gives it').toBe(fwdNs)
    expect(figs(LIM, /那 (\d+) µs 是一个常数/, '`limits` on the forward')[0]! * 1000,
      'and the figure the entry prints for it').toBe(srcNs)
    /*
     * 「解码器按 To DS 规则把 addr3 填成 apId」 and 「真实的上行帧地址 3 就是最终目的地址」 —
     * both are about the **third** address of the first hop's frame, so both are read off the
     * decoder: that field carries the access point, and the payload's real destination is
     * somewhere else entirely. Moving the digit names a field the decoder does not build.
     */
    const CTX = { apId: 'ap', isEdca: true }
    const up = decodeFrame(hop1.frame, CTX).users[0]!.subframes[0]!.mpdu.fields
    const [limN] = figs(LIM, /把 addr(\d) 填成 apId/, '`limits` on the address it fills')
    const [proseN] = figs(LIM, /真实的上行帧地址 (\d) 就是最终目的地址/, '`limits` on the real one')
    expect(proseN, 'the same address, named twice in one entry').toBe(limN)
    const third = up.find((f) => f.key === `addr${limN}`)
    expect(third, `addr${limN} is a field this decoder really builds`).toBeDefined()
    expect(third!.node, 'and this engine fills it with the access point').toBe(CTX.apId)
    expect(hop2.frame.dst, 'while the payload’s real destination is the other phone')
      .not.toBe(third!.node)
    /*
     * 「一个已关联的站点把数据帧发往 AP（To DS = 1），AP 再以 From DS = 1 发出」 — the two bits,
     * read off the two hops of the same payload.
     */
    const down = decodeFrame(hop2.frame, CTX).users[0]!.subframes[0]!.mpdu.fields
    const bitOf = (fields: typeof up, key: string): string =>
      fields.find((f) => f.key === 'fc')!.bits!.find((b) => b.key === key)!.value
    const [toDs] = raw(SRC, /数据帧发往 AP（To DS = (\d)）/, '`sources` on the uplink bit')
    const [fromDs] = raw(SRC, /AP 再以 From DS = (\d) 发出/, '`sources` on the downlink bit')
    expect(bitOf(up, 'toDs'), 'the uplink hop’s own To DS bit').toBe(toDs)
    expect(bitOf(up, 'fromDs'), 'and its From DS bit, which is the other one').toBe('0')
    expect(bitOf(down, 'fromDs'), 'the downlink hop’s own From DS bit').toBe(fromDs)
    expect(bitOf(down, 'toDs'), 'and its To DS bit, which is the other one').toBe('0')
  })

  it('reads `picture` and `sources` on the figures they print again', () => {
    // 「16 µs 的静默是 aSIFSTime（§17.4.4）」
    const [sifsUs] = figs(SRC, /(\d+) µs 的静默是 aSIFSTime/, '`sources` on the silence')
    expect(sifsUs! * 1000, 'the engine’s own short silence').toBe(SIFS_NS)
    /*
     * 「125.6 µs、28 µs 与 169.6 µs 都是本场景实测」 — the entry says so, and these are the three
     * measurements: the frame, the answer and one hop, each from this run.
     */
    const [frameUs, ackUs, hopUs] = figs(SRC, /([\d.]+) µs、(\d+) µs 与 ([\d.]+) µs 都是本场景实测/,
      '`sources` on the three measured figures')
    const ack1 = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'ack'
      && r.node === 'ap' && r.t > hop1.t)!
    const deqB = at('DEQUEUE', 'sta-4')
    expect(frameUs! * 1000, 'the frame').toBe(hop1.frame.txTimeNs)
    expect(ackUs! * 1000, 'the answer').toBe(ack1.frame.txTimeNs)
    expect(hopUs! * 1000, 'and one hop').toBe(deqB.t - hop1.t)
    // 「接入点转发的 50 µs 是本仿真器的模型取值」 — and the name it gives the constant
    const [srcFwd] = figs(SRC, /接入点转发的 (\d+) µs 是本仿真器的模型取值/, '`sources` on the forward')
    expect(srcFwd, 'the same forward the figure labels').toBe(RELAY_FWD_US)
    /*
     * **Exempt, class (a): the clause numbers of `sources`.** §4.3, §5.2, Table 9-30 and §17.4.4
     * are the standard's own and no corpus ships with this repo; `tests/course/doc-citations`
     * covers the paths. What is read of them above: the figure one of them is quoted for
     * (aSIFSTime) is this engine's own silence.
     */
    expect(SRC, 'the address table the first entry cites').toContain('9-30')
    // 「50 份载荷」 in `picture` is the burst `observe` points at
    const [picBurst] = figs(PIC, /(\d+) µs 的转发/, '`picture`’s caption on the forward')
    expect(picBurst, 'the same forward again').toBe(RELAY_FWD_US)
  })
})
