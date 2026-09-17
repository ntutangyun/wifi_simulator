import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { defaultFeatures } from '../../src/model/caps'
import { defaultScenario, type Scenario } from '../../src/model/scenario'
import { QOS_HDR_BYTES, MAC_HDR_BYTES, FCS_BYTES } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
type Tx = Extract<TLRecord, { type: 'TX_START' }>

/** An AP and one station of the given generation, the station close enough to decode everything. */
function pair(gen: 'nonht' | 'he', profile: 'video' | 'saturated', rts = 3000): Scenario {
  const sc = defaultScenario()
  sc.rtsThresholdBytes = rts
  sc.nodes = [
    { ...sc.nodes[0], caps: { generation: 'eht', features: defaultFeatures('eht') } },
    { ...sc.nodes[1], id: 'sta-1', pos: { x: 3, y: 4.5, z: 1 }, profiles: [profile], caps: { generation: gen, features: defaultFeatures(gen) } },
  ]
  return sc
}

describe('the Retry bit marks a retransmission, not a retry count (§9.2.4.1.6)', () => {
  it('a frame whose MSDUs have never been on the air is not marked Retry, even after a failed RTS', () => {
    // far station: RTS attempts fail, so the MSDU's retry counter climbs while it is still unsent
    const sc = pair('he', 'saturated', 500)
    sc.nodes[1].pos = { x: 60, y: 60, z: 1 }
    const recs = new Simulation(sc).runUntil(200 * MS).records
    const rts = recs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'rts')
    expect(rts.length).toBeGreaterThan(3) // the RTS really is failing repeatedly
    const data = recs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')
    for (const d of data.slice(0, 1)) expect(d.frame.retryFlag ?? false).toBe(false)
  })

  it('a frame really retransmitted after a lost ACK is marked Retry', () => {
    const sc = pair('he', 'saturated')
    sc.nodes[1].pos = { x: 30, y: 25, z: 1 } // decodes at the AP sometimes; ACKs get lost
    const recs = new Simulation(sc).runUntil(400 * MS).records
    const data = recs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')
    const retried = data.filter((d) => d.frame.retryFlag)
    expect(retried.length).toBeGreaterThan(0)
    for (const d of retried) {
      const first = data.find((x) => x.frame.msduId === d.frame.msduId)!
      expect(first.t, 'a Retry frame repeats an MSDU that was already transmitted').toBeLessThan(d.t)
    }
  })
})

describe('QoS framing needs a QoS station at both ends (§9.2.4.5)', () => {
  it('an EDCA AP sends plain Data to a legacy station and QoS Data to a QoS station', () => {
    const legacy = new Simulation(pair('nonht', 'video')).runUntil(200 * MS).records
      .filter((r): r is Tx => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data')
    expect(legacy.length).toBeGreaterThan(0)
    for (const d of legacy.slice(0, 20)) {
      expect(d.frame.qos ?? false, 'no QoS Control to a non-QoS station').toBe(false)
      expect(d.frame.bytes - (d.frame.msduBytes?.[0] ?? 0)).toBe(MAC_HDR_BYTES + FCS_BYTES)
    }
    const qos = new Simulation(pair('he', 'video')).runUntil(200 * MS).records
      .filter((r): r is Tx => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data' && !r.frame.ampdu)
    expect(qos.length).toBeGreaterThan(0)
    for (const d of qos.slice(0, 20)) {
      expect(d.frame.qos).toBe(true)
      expect(d.frame.bytes - (d.frame.msduBytes?.[0] ?? 0)).toBe(QOS_HDR_BYTES + FCS_BYTES)
    }
  })
})
