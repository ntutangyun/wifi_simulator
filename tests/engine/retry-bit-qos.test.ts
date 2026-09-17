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
  it('a frame whose MSDUs have never been on the air is not marked Retry, even after a failed RTS', async () => {
    // hidden stations with RTS protection: RTS attempts fail often, so retry
    // counters climb on MSDUs that have not been on the air, and data frames
    // do go out in between
    const { LESSONS } = await import('../../src/course/lessons')
    const sc = LESSONS.find((l) => l.id === 'hidden')!.variants![0].scenario()
    const recs = new Simulation(sc).runUntil(300 * MS).records
    const rts = recs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'rts')
    expect(rts.length).toBeGreaterThan(3) // the RTS really is failing repeatedly
    // the retry counters really did climb while the MSDU was still unsent
    const retries = recs.filter((r) => r.type === 'RETRY')
    expect(retries.length).toBeGreaterThan(3)
    expect(Math.max(...retries.map((r) => (r.type === 'RETRY' ? r.retries : 0)))).toBeGreaterThan(1)
    // every first transmission of an MSDU is unflagged, however often its RTS failed
    const data = recs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')
    const seen = new Set<number>()
    let firsts = 0
    for (const d of data) {
      const ids = d.frame.ampdu?.msduIds ?? [d.frame.msduId!]
      if (ids.every((id) => !seen.has(id))) {
        expect(d.frame.retryFlag ?? false, `first transmission @${d.t}`).toBe(false)
        firsts++
      }
      ids.forEach((id) => seen.add(id))
    }
    expect(firsts).toBeGreaterThan(0)
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

describe('the Retry bit on multi-user and triggered frames', () => {
  it('a retransmitted MU part or TB PPDU is flagged, and a first transmission is not', async () => {
    const { LESSONS } = await import('../../src/course/lessons')
    const edge = () => {
      const sc = LESSONS.find((l) => l.id === 'ofdma-dl')!.scenario()
      const stas = sc.nodes.filter((n) => n.kind === 'sta')
      const ap = sc.nodes.find((n) => n.kind === 'ap')!
      stas[stas.length - 1].pos = { x: ap.pos.x + 22, y: ap.pos.y + 10, z: 1 } // loses BlockAcks
      return sc
    }
    const scs = [{ scenario: edge }, LESSONS.find((l) => l.id === 'ofdma-ul')!]
    let checkedFirst = 0
    let checkedRetry = 0
    for (const lesson of scs) {
      const recs = new Simulation(lesson.scenario()).runUntil(400 * MS).records
      const seen = new Set<number>()
      for (const r of recs) {
        if (r.type !== 'TX_START' || r.frame.kind !== 'data') continue
        const parts = r.frame.muParts ?? []
        if (parts.length) {
          for (const p of parts) {
            const repeat = p.msduIds.some((id) => seen.has(id))
            expect(!!p.retryFlag, `MU part @${r.t}`).toBe(repeat)
            repeat ? checkedRetry++ : checkedFirst++
            p.msduIds.forEach((id) => seen.add(id))
          }
          continue
        }
        const ids = r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
        if (!ids.length) continue
        const repeat = ids.some((id) => seen.has(id))
        expect(!!r.frame.retryFlag, `frame @${r.t} on ${r.node}`).toBe(repeat)
        repeat ? checkedRetry++ : checkedFirst++
        ids.forEach((id) => seen.add(id))
      }
    }
    expect(checkedFirst).toBeGreaterThan(50)
    expect(checkedRetry).toBeGreaterThan(0)
  })
})
