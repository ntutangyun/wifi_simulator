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
import type { LatencyStats } from '../../src/model/view'
import { ACK_BYTES, FCS_BYTES, QOS_HDR_BYTES, SIFS_NS } from '../../src/engine/phy'
import {
  ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { lessonShapeSuite, runOf } from './kit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000
const RUN_NS = 1000 * MS
const PHONES = ['sta-3', 'sta-4']

function run(sc: Scenario, ms: number) {
  const sim = new Simulation(sc)
  const records = [...sim.runUntil(ms * MS).records]
  return { records, view: sim.view }
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
