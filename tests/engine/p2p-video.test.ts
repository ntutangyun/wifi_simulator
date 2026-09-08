import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { defaultScenario } from '../../src/model/scenario'
import { scenarioFromJson, scenarioToJson } from '../../src/editor/planOps'
import { applyRecord, initViewState } from '../../src/model/view'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>

/** Phone A shares video to phone B in the same BSS: uplink to the AP, then the AP forwards downlink. */
function share() {
  const sc = defaultScenario()
  sc.nodes[1].profiles = ['p2pvideo']
  sc.nodes[1].p2pTarget = 'sta-2'
  sc.nodes[2].profiles = ['idle']
  return sc
}

describe('phone-to-phone video through the AP', () => {
  it('round-trips through the schema and rejects a missing or self target', () => {
    const back = scenarioFromJson(scenarioToJson(share()))
    expect(back.nodes[1].p2pTarget).toBe('sta-2')
    const bad = share(); bad.nodes[1].p2pTarget = 'nope'
    expect(() => scenarioFromJson(scenarioToJson(bad))).toThrow(/nope/)
    const self = share(); self.nodes[1].p2pTarget = 'sta-1'
    expect(() => scenarioFromJson(scenarioToJson(self))).toThrow(/itself/)
  })

  it('every uplink frame the AP acknowledges is forwarded to the target phone in AC_VI', () => {
    const recs = new Simulation(share()).runUntil(300 * MS).records
    const up = recs.filter((r): r is Rec<'ENQUEUE'> => r.type === 'ENQUEUE' && r.node === 'sta-1')
    const acked = recs.filter((r): r is Rec<'DEQUEUE'> => r.type === 'DEQUEUE' && r.node === 'sta-1')
    const fwd = recs.filter((r): r is Rec<'ENQUEUE'> => r.type === 'ENQUEUE' && r.node === 'ap' && r.dst === 'sta-2')
    expect(up.length).toBeGreaterThan(150) // ~8 Mb/s of 1400 B frames
    expect(up.every((r) => r.ac === 2 && r.bytes === 1400)).toBe(true)
    // forwarded frames: one per acknowledged uplink frame, stamped with the original birth time
    expect(fwd.length).toBeGreaterThanOrEqual(acked.length - 5)
    expect(fwd.every((r) => r.ac === 2 && r.relayFromNs !== undefined)).toBe(true)
    for (const r of fwd) {
      const a = acked.find((x) => x.t <= r.t && r.t - x.t <= 200_000)
      expect(a, `forward at ${r.t} follows an ACK within 200 µs`).toBeDefined()
    }
  })

  it('the receiving phone accumulates end-to-end latency: birth at the sender → delivery at the receiver', () => {
    const sc = share()
    const vs = initViewState(sc)
    for (const r of new Simulation(sc).runUntil(300 * MS).records) applyRecord(vs, r)
    const rx = vs.nodes['sta-2'].stats.relayLatency
    expect(rx.n).toBeGreaterThan(100)
    const meanMs = rx.sumNs / rx.n / 1e6
    expect(meanMs).toBeGreaterThan(0.3) // two Wi-Fi hops
    expect(meanMs).toBeLessThan(20)
    expect(vs.nodes['sta-1'].stats.relayLatency.n).toBe(0)
    // it is not a ping, so no RTT sample lands anywhere
    expect(vs.nodes['sta-2'].stats.appRtt.n).toBe(0)
  })
})
