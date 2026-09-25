/**
 * Every empirical claim of "Who is who in one network"
 * (src/course/tier1/roles-stack.ts), measured against the lesson's own
 * scenario. The lesson is rewritten to the zero-to-hero contract, so the shape,
 * the budgets and the jump targets come from `lessonShapeSuite`; what is left
 * here is the module, the `needs`, the exact `terms`, the scenario schema and
 * the numbers the prose quotes.
 *
 * The scenario builder is unchanged, so `lesson-hashes.json` is untouched and
 * the recorded timeline is the one the fixture already holds. The `.body!`
 * word-count walk of the old test is retired: `lessonShapeSuite` counts the
 * sections instead.
 */
import { describe, it, expect } from 'vitest'
import {
  rolesStack, rolesStackScenario, firstUplinkData, firstDownlinkData, firstRelayHop1, firstRelayHop2,
  ROLES_FRAME_BYTES, ROLES_PAYLOAD_BYTES, ROLES_PPDU_US,
} from '../../src/course/tier1/roles-stack'
import type { StackSpec, TopologySpec } from '../../src/course/diagram'
import type { Block } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { LatencyStats } from '../../src/model/view'
import { ACK_BYTES, FCS_BYTES, QOS_HDR_BYTES, SIFS_NS } from '../../src/engine/phy'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

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

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The laptop's backup leaves in bursts every 60 ms, so its first uplink frame is outside the
// kit's default 30 ms window; the suite gets the same 1000 ms run the claims below share.
lessonShapeSuite(rolesStack, { runNs: RUN_NS })

describe('roles-stack · the lesson itself', () => {
  it('is the third lesson of Wi-Fi Tier 1 and owns the architecture words', () => {
    expect(MODULES[rolesStack.module].title).toBe('一张网里的角色')
    // decode-thresholds joined when rule 2 stopped grading vacuously: the opening
    // sentence uses its `rate margin`, so the lesson has to declare it.
    expect(rolesStack.needs).toEqual(['radio-primer', 'decode-thresholds'])
    // the baseline owner table of the readability programme: BSS, BSSID and SSID are this
    // lesson's to introduce, and DS comes with them because "everything goes through the
    // middle" cannot be told without it.
    expect(rolesStack.terms!.map((t) => t.term)).toEqual(['BSS', 'BSSID', 'SSID', 'DS'])
  })

  it('the scenario passes the schema and every quiz answer is in range', () => {
    expect(() => ScenarioSchema.parse(rolesStack.scenario())).not.toThrow()
    expect(rolesStack.scenario()).toEqual(rolesStackScenario())
    for (const q of rolesStack.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })
})

describe('roles-stack · the base scenario', () => {
  // one shared run for every claim below; the kit memoises it per worker
  const rs1s = runOf(rolesStack, undefined, RUN_NS)
  const { view: v1s } = run(rolesStackScenario(), 1000)

  it('every jump target occurs, at the quoted instants', () => {
    for (const j of rolesStack.jumps) expect(rs1s.some(j.find), j.label).toBe(true)
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

  it('the steps block: one payload from phone to phone, instant by instant', () => {
    // "At 1.4157 ms it arrives at Phone B, which finds the room quiet and sends it straight
    //  away." … "That frame is 125.6 µs long. The access point has it at 1.5413 ms and answers
    //  16 µs later." … "The answer is 28 µs of air. The first hop is over at 1.5853 ms, having
    //  cost 169.6 µs." … "Forwarding costs 50 µs, so at 1.6353 ms the payload is queued for
    //  Phone A and goes out at once." … "Phone A has answered by 1.8049 ms. The second hop cost
    //  169.6 µs too: 389.2 µs door to door."
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const id = ids(hop1)[0]
    const arrivalB = rs1s.find((r) => r.type === 'ARRIVAL' && r.node === 'sta-4' && r.msduId === id)!
    expect(arrivalB.t).toBe(hop1.t)
    expect(hop1.frame.txTimeNs).toBe(125_600)
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
    expect(hop2.t).toBe(arrAp.t) // "goes out at once"
    const deqAp = rs1s.find((r) => r.type === 'DEQUEUE' && r.node === 'ap' && r.msduId === id)!
    expect(deqAp.t).toBe(1_804_923)
    expect(deqAp.t - hop2.t).toBe(169_600)
    expect(deqAp.t - arrivalB.t).toBe(389_200)
  })

  it('the wrapping the stack figure draws is the frame the engine builds', () => {
    // The four-row table this pinned is gone: the nested figure in `numbers` says the
    // same thing with the boxes drawn to the octets. The pins are unchanged, and the
    // figure's own numbers are pinned against this same run below.
    // "1400 B of video" → "26 + 1400 + 4 = 1430 B" → "1430 B; the laptop hands over 50"
    //  → "125.6 µs at 20 MHz"
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    expect(hop1.frame.bytes).toBe(QOS_HDR_BYTES + 1400 + FCS_BYTES)
    expect(hop1.frame.bytes).toBe(1430)
    expect(QOS_HDR_BYTES).toBe(26)
    expect(FCS_BYTES).toBe(4)
    expect(hop1.frame.mode).toBe('he')
    expect(hop1.frame.mcs).toBe(11)
    expect(hop1.frame.widthMhz ?? 20).toBe(20)
    expect(hop1.frame.txTimeNs).toBe(125_600)
    expect((rs1s.find(firstUplinkData) as Tx).frame.ampdu?.mpduCount).toBe(50)
  })

  it('the deeper note: Phone A cannot decode Phone B directly, and the reason is the SINR', () => {
    // "Phone A cannot even decode Phone B's first frame … the record is an RX_FAIL."
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const failA = rs1s.find((r) => r.type === 'RX_FAIL' && r.node === 'sta-3' && r.t === hop1.t + hop1.frame.txTimeNs)
    expect(failA).toMatchObject({ from: 'sta-4', reason: 'lowSinr' })
    // "at 6 m apart across the room": Phone A at (2, 6), Phone B at (8, 6)
    const sc = rolesStackScenario()
    const a = sc.nodes.find((n) => n.id === 'sta-3')!.pos
    const b = sc.nodes.find((n) => n.id === 'sta-4')!.pos
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBe(6)
  })

  it('no data frame goes straight from one station to another; every relayed payload crosses twice', () => {
    // the picture's "A station has exactly one peer it may send data to" and the first
    // observation's "No data frame here goes straight from one station to another"
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

  it('relay latency = hop 1 + 50 µs of forwarding + hop 2, for every relayed payload', () => {
    // the table's "a fixed 50 µs to forward"
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

  it('the Laptop opens with a reservation frame, and the TV never sends a data frame', () => {
    // observation 2: "the Laptop sends a short reservation frame, then one burst carrying 50
    //  payloads. The TV's lane holds no data frame at all … still transmits, but only to answer."
    const ul = rs1s.find(firstUplinkData) as Tx
    expect(ul.frame.ampdu?.mpduCount).toBe(50)
    const before = rs1s.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-1' && r.t < ul.t)
    expect(before.at(-1)?.frame.kind).toBe('rts')
    const tv = rs1s.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2')
    expect(tv.length).toBeGreaterThan(500)
    expect(tv.every((r) => r.frame.kind !== 'data')).toBe(true)
    for (const kind of ['ack', 'ba', 'cts']) expect(tv.some((r) => r.frame.kind === kind), kind).toBe(true)
  })

  it('one hop or two: about 0.7 ms against about 1.3 ms, close to double', () => {
    // the "One hop or two" table and the paragraph under it
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

  it('what each device is doing, as the table states it', () => {
    // "50 × 1500 B every 60 ms" · "1400 B about every 0.85 ms" · "1400 B every 1.4–1.7 ms each way"
    const arrivals = (node: string) => rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && r.node === node && r.dst === (node === 'ap' ? 'sta-2' : 'ap'))
    const tv = arrivals('ap')
    expect(tv.every((r) => r.bytes === 1400)).toBe(true)
    expect(1000 / tv.length).toBeGreaterThan(0.8)
    expect(1000 / tv.length).toBeLessThan(0.9)
    for (const p of PHONES) {
      const a = arrivals(p)
      expect(a.every((r) => r.bytes === 1400)).toBe(true)
      for (let i = 1; i < a.length; i++) {
        const gap = a[i].t - a[i - 1].t
        expect(gap).toBeGreaterThanOrEqual(1.4 * MS)
        expect(gap).toBeLessThanOrEqual(1.7 * MS)
      }
    }
    const lap = rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> => r.type === 'ARRIVAL' && r.node === 'sta-1')
    const times = [...new Set(lap.map((r) => r.t))]
    expect(lap.every((r) => r.bytes === 1500)).toBe(true)
    expect(lap.length).toBe(50 * times.length)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(60 * MS)
  })
})

/**
 * The two figures of the pilot lesson, pinned against the same run as its prose.
 * A diagram in this course is derived from the run wherever the figures exist
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md), and this is
 * what that means in practice: the numbers are read back OUT of the spec the
 * panel paints and compared with the engine, so a figure that drifts fails here
 * rather than misleading a reader.
 */
describe('roles-stack · the two figures are the run', () => {
  const rs = runOf(rolesStack, undefined, RUN_NS)
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...rolesStack.picture!, ...rolesStack.numbers!].filter(isDiagram)
  const topology = diagrams.find((b) => b.spec.kind === 'topology')!.spec as TopologySpec
  const stack = diagrams.find((b) => b.spec.kind === 'stack')!.spec as StackSpec

  it('draws the two figures the lesson is for, and no others', () => {
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['topology', 'stack'])
  })

  it('the topology figure is the scene this lesson loads, node for node', () => {
    const sc = rolesStackScenario()
    expect(topology.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    for (const n of topology.nodes) {
      const real = sc.nodes.find((x) => x.id === n.id)!
      expect([n.x, n.y], n.id).toEqual([real.pos.x, real.pos.y])
      expect(n.role, n.id).toBe(real.kind === 'ap' ? 'ap' : 'sta')
      expect(n.label.trim(), n.id).not.toBe('')
    }
    // the ring is the whole BSS: every node of the scene, and nothing else
    expect(topology.ring!.nodes).toEqual(sc.nodes.map((n) => n.id))
  })

  it('every line the figure draws is a path the run agrees about', () => {
    // every solid link has the access point at one end, because the run has no
    // station-to-station data frame at all
    const solid = topology.links.filter((l) => l.tone !== 'muted')
    for (const l of solid) expect([l.from, l.to], `${l.from}→${l.to}`).toContain('ap')
    expect(dataTx(rs).some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    // and the one dashed link is the one pair the run refuses: Phone A cannot
    // decode Phone B, which is an RX_FAIL in the timeline
    const dashed = topology.links.filter((l) => l.tone === 'muted')
    expect(dashed.length).toBe(1)
    expect([dashed[0].from, dashed[0].to].sort()).toEqual([...PHONES].sort())
    expect(rs.some((r) => r.type === 'RX_FAIL' && r.node === 'sta-3' && r.from === 'sta-4')).toBe(true)
    // the two labelled hops are the relay the `watch` call-out jumps to
    const hop1 = rs.find(firstRelayHop1) as Tx
    const hop2 = rs.find(firstRelayHop2) as Tx
    expect(solid.filter((l) => l.label).map((l) => [l.from, l.to]))
      .toEqual([[hop1.node, hop1.frame.dst], [hop2.node, hop2.frame.dst]])
  })

  it('the stack figure carries the octets the engine builds and the airtime the run measures', () => {
    const hop1 = rs.find(firstRelayHop1) as Tx
    const [air, frame, payload] = stack.layers
    // the boxes are sized by these, so a wrong number is a wrong picture
    expect(frame.bytes).toBe(hop1.frame.bytes)
    expect(air.bytes).toBe(hop1.frame.bytes)
    expect(payload.bytes).toBe(hop1.frame.bytes - QOS_HDR_BYTES - FCS_BYTES)
    expect(ROLES_FRAME_BYTES).toBe(hop1.frame.bytes)
    expect(ROLES_PAYLOAD_BYTES).toBe(payload.bytes)
    // every arrival of that payload really is 1400 B, not just the relayed one
    const arrivals = rs.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && PHONES.includes(r.node))
    expect(arrivals.length).toBeGreaterThan(500)
    expect(arrivals.every((r) => r.bytes === payload.bytes)).toBe(true)
    // the notes and the total quote the same figures back
    expect(frame.note).toBe(`${QOS_HDR_BYTES} B 头 + ${payload.bytes} B 载荷 + ${FCS_BYTES} B 校验`)
    expect(ROLES_PPDU_US * 1000).toBe(hop1.frame.txTimeNs)
    expect(air.note).toContain(`${hop1.frame.txTimeNs / 1000} µs`)
    expect(stack.total).toContain(`${QOS_HDR_BYTES + FCS_BYTES} B`)
    expect(stack.total).toContain('2.1 %')
    // and the cadence the innermost box quotes is the one the run keeps
    expect(payload.note).toContain('1.4–1.7 ms')
  })
})

describe('roles-stack · the experiments', () => {
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
