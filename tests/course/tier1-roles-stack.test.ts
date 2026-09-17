/**
 * Pins every empirical claim of the Tier 1 lesson “Roles and the stack”
 * (src/course/tier1/roles-stack.ts), its stated duration and its jump targets.
 */
import { describe, it, expect } from 'vitest'
import {
  rolesStack, rolesStackScenario, firstUplinkData, firstDownlinkData, firstRelayHop1, firstRelayHop2,
} from '../../src/course/tier1/roles-stack'
import type { Block, L10n } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { LatencyStats } from '../../src/model/view'
import { ACK_BYTES, FCS_BYTES, QOS_HDR_BYTES, SIFS_NS } from '../../src/engine/phy'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000
const PHONES = ['sta-3', 'sta-4']

function run(sc: Scenario, ms: number) {
  const sim = new Simulation(sc)
  const records = [...sim.runUntil(ms * MS).records]
  return { records, view: sim.view }
}
const mean = (l: LatencyStats): number => l.sumNs / l.n
const ids = (r: Tx): number[] => r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
const dataTx = (rs: TLRecord[]): Tx[] => rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')

function words(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}
function blockTexts(b: Block): L10n[] {
  const out: L10n[] = b.heading ? [b.heading] : []
  switch (b.kind) {
    case 'table': return [...out, ...b.head, ...b.rows.flat()]
    case 'list':
    case 'steps': return [...out, ...b.items]
    case 'formula': return [...out, b.text, ...(b.note ? [b.note] : [])]
    default: return [...out, b.text]
  }
}

describe('roles-stack · structure', () => {
  it('scenario passes the schema; every quiz answer is in range', () => {
    expect(() => ScenarioSchema.parse(rolesStack.scenario())).not.toThrow()
    for (const q of rolesStack.quiz) expect(q.answer).toBeLessThan(q.options.length)
    expect(rolesStack.observe.length).toBeGreaterThanOrEqual(3)
    expect(rolesStack.tryThis.length).toBe(2)
  })

  it('minutes = round-to-5 of EN words / 150 + 5 per observe + 5 per try-this', () => {
    const texts: L10n[] = [
      rolesStack.title,
      ...rolesStack.body.flatMap(blockTexts),
      ...rolesStack.observe, ...rolesStack.tryThis,
      ...rolesStack.quiz.flatMap((q) => [q.q, ...q.options, q.explain]),
    ]
    const n = texts.reduce((s, t) => s + words(t.en), 0)
    const raw = n / 150 + 5 * rolesStack.observe.length + 5 * rolesStack.tryThis.length
    expect(rolesStack.minutes).toBe(Math.round(raw / 5) * 5)
  })
})

describe('roles-stack · the base scenario', () => {
  const { records: rs1s, view: v1s } = run(rolesStackScenario(), 1000)

  it('every jump target occurs, at the quoted instants', () => {
    for (const j of rolesStack.jumps) expect(rs1s.some(j.find), j.label.en).toBe(true)
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const hop2 = rs1s.find(firstRelayHop2) as Tx
    expect(hop1.t).toBe(1_415_723)
    expect(hop1.node).toBe('sta-4')
    expect(hop2.t).toBe(1_635_323)
    expect(hop2.frame.dst).toBe('sta-3')
    expect(ids(hop2)).toEqual(ids(hop1))
    expect((rs1s.find(firstDownlinkData) as Tx).node).toBe('ap')
    expect((rs1s.find(firstUplinkData) as Tx).frame.dst).toBe('ap')
  })

  it('the first relayed MSDU, hop by hop', () => {
    // steps block: 1.4157 → 1.5413 → ACK +16 µs, 28 µs → 1.5853 → +50 µs 1.6353 → 1.8049; 169.6 µs per hop, 389.2 µs total
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const id = ids(hop1)[0]
    const arrivalB = rs1s.find((r) => r.type === 'ARRIVAL' && r.node === 'sta-4' && r.msduId === id)!
    expect(arrivalB.t).toBe(hop1.t) // “sends at once”
    expect(hop1.frame.txTimeNs).toBe(125_600)
    expect(hop1.frame.mcs).toBe(11)
    expect(hop1.frame.mode).toBe('he')
    expect(hop1.frame.widthMhz ?? 20).toBe(20)
    expect(hop1.frame.bytes).toBe(QOS_HDR_BYTES + 1400 + FCS_BYTES)
    expect(hop1.frame.bytes).toBe(1430)
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
    expect(arrAp.t - deqB.t).toBe(50_000)
    const hop2 = rs1s.find(firstRelayHop2) as Tx
    expect(hop2.t).toBe(arrAp.t) // “the AP sends it at once”
    const deqAp = rs1s.find((r) => r.type === 'DEQUEUE' && r.node === 'ap' && r.msduId === id)!
    expect(deqAp.t).toBe(1_804_923)
    expect(deqAp.t - hop2.t).toBe(169_600)
    expect(deqAp.t - arrivalB.t).toBe(389_200)
    // “Phone A could not even decode that first frame from Phone B (RX_FAIL, SINR too low)”
    const failA = rs1s.find((r) => r.type === 'RX_FAIL' && r.node === 'sta-3' && r.t === hop1.t + hop1.frame.txTimeNs)
    expect(failA).toMatchObject({ from: 'sta-4', reason: 'lowSinr' })
  })

  it('no data frame goes straight from one STA to another; every relayed MSDU crosses the air twice', () => {
    const data = dataTx(rs1s)
    expect(data.some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    const delivered = rs1s.filter((r) => r.type === 'DEQUEUE' && r.node === 'ap')
      .map((r) => (r as Extract<TLRecord, { type: 'DEQUEUE' }>).msduId)
    const hop1Ids = new Set(data.filter((r) => PHONES.includes(r.node)).flatMap(ids))
    const hop2Ids = new Set(data.filter((r) => r.node === 'ap' && PHONES.includes(r.frame.dst)).flatMap(ids))
    const relayed = delivered.filter((id) => hop1Ids.has(id))
    expect(relayed.length).toBeGreaterThan(1000)
    for (const id of relayed) expect(hop2Ids.has(id)).toBe(true)
  })

  it('relay latency = hop 1 + 50 µs forwarding + hop 2, for every relayed MSDU', () => {
    const arr = new Map<string, number>()
    const born = new Map<number, number>()
    const hop1 = new Map<number, number>()
    let checked = 0
    for (const r of rs1s) {
      if (r.type === 'ARRIVAL') {
        arr.set(`${r.node}/${r.msduId}`, r.t)
        if (PHONES.includes(r.node)) born.set(r.msduId, r.t)
      } else if (r.type === 'DEQUEUE') {
        const a = arr.get(`${r.node}/${r.msduId}`)!
        if (PHONES.includes(r.node)) hop1.set(r.msduId, r.t - a)
        else if (r.node === 'ap' && born.has(r.msduId)) {
          expect(r.t - born.get(r.msduId)!).toBe(hop1.get(r.msduId)! + 50_000 + (r.t - a))
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('the Laptop’s first uplink frame is a 50-MPDU aggregate behind an RTS; the TV only ever sends ACKs', () => {
    const ul = rs1s.find(firstUplinkData) as Tx
    expect(ul.frame.ampdu?.mpduCount).toBe(50)
    const before = rs1s.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-1' && r.t < ul.t)
    expect(before.at(-1)?.frame.kind).toBe('rts')
    const tv = rs1s.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2')
    expect(tv.length).toBeGreaterThan(500)
    expect(tv.every((r) => r.frame.kind !== 'data')).toBe(true)
    for (const kind of ['ack', 'ba', 'cts']) expect(tv.some((r) => r.frame.kind === kind), kind).toBe(true)
  })

  it('the relay costs close to double: ~1.3 ms phone-to-phone against ~0.7 ms for the TV', () => {
    for (const { view } of [{ view: v1s }, run(rolesStackScenario(), 3000)]) {
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

  it('stated traffic shapes', () => {
    // TV: “a 1400-octet MSDU about every 0.85 ms”; phones: “every 1.4–1.7 ms each way”
    const arrivals = (node: string) => rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && r.node === node && r.dst === (node === 'ap' ? 'sta-2' : 'ap'))
    const tv = arrivals('ap')
    expect(tv.every((r) => r.bytes === 1400)).toBe(true)
    expect(1000 / tv.length).toBeGreaterThan(0.8)
    expect(1000 / tv.length).toBeLessThan(0.9)
    for (const p of PHONES) {
      const a = arrivals(p)
      for (let i = 1; i < a.length; i++) {
        const gap = a[i].t - a[i - 1].t
        expect(gap).toBeGreaterThanOrEqual(1.4 * MS)
        expect(gap).toBeLessThanOrEqual(1.7 * MS)
      }
    }
    // Laptop: bursts of 50 × 1500 every 60 ms
    const lap = rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> => r.type === 'ARRIVAL' && r.node === 'sta-1')
    const times = [...new Set(lap.map((r) => r.t))]
    expect(lap.every((r) => r.bytes === 1500)).toBe(true)
    expect(lap.length).toBe(50 * times.length)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(60 * MS)
  })
})

describe('roles-stack · try this', () => {
  it('Phone B next to Phone A: still no direct frame, still ~1.3 ms', () => {
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

  it('Laptop idle: phone-to-phone falls to ~0.7 ms, TV to ~0.3 ms, still about twice', () => {
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
