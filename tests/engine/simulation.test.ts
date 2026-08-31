import { describe, it, expect } from 'vitest'
import { Simulation, type Batch } from '../../src/engine/simulation'
import { defaultScenario, type Scenario } from '../../src/model/scenario'
import { applyRecord, cloneView } from '../../src/model/view'

const MS = 1_000_000

function saturatedPair(): Scenario {
  const sc = defaultScenario()
  sc.nodes[1].profile = 'saturated'
  sc.nodes[2].profile = 'saturated'
  // both close to the AP, same room
  sc.nodes[2].pos = { x: 3.5, y: 4.5, z: 1 }
  return sc
}

describe('Simulation', () => {
  it('is deterministic: identical timeline hash for identical scenario+seed', () => {
    const a = new Simulation(defaultScenario())
    const b = new Simulation(defaultScenario())
    a.runUntil(100 * MS)
    b.runUntil(100 * MS)
    expect(a.timelineHash()).toBe(b.timelineHash())
    const c = new Simulation({ ...defaultScenario(), seed: 43 })
    c.runUntil(100 * MS)
    expect(c.timelineHash()).not.toBe(a.timelineHash())
  })

  it('snapshot + record replay reconstructs the live view exactly', () => {
    const sim = new Simulation(saturatedPair())
    const batches: Batch[] = []
    for (let t = 50 * MS; t <= 200 * MS; t += 50 * MS) batches.push(sim.runUntil(t))
    const records = batches.flatMap((b) => b.records)
    const snapshots = batches.flatMap((b) => b.snapshots)

    const target = 150 * MS
    const snap = [...snapshots].reverse().find((s) => s.t <= target)!
    expect(snap).toBeDefined()
    const reconstructed = cloneView(snap.view)
    for (const r of records) {
      if (r.t > snap.t && r.t <= target) applyRecord(reconstructed, r)
    }

    const live = new Simulation(saturatedPair())
    live.runUntil(target)
    const liveView = cloneView(live.view)
    liveView.t = reconstructed.t // both reflect the last record ≤ target
    reconstructed.t = liveView.t
    expect(reconstructed).toEqual(liveView)
  })

  it('two saturated stations share airtime roughly evenly with collisions occurring', () => {
    const sim = new Simulation(saturatedPair())
    sim.runUntil(300 * MS)
    const v = sim.view
    const ok1 = v.nodes['sta-1'].stats.txOk
    const ok2 = v.nodes['sta-2'].stats.txOk
    const total = ok1 + ok2
    expect(total).toBeGreaterThan(200) // sanity: the medium is actually being used
    expect(ok1 / total).toBeGreaterThan(0.35)
    expect(ok1 / total).toBeLessThan(0.65)
    expect(v.nodes['sta-1'].stats.collisions + v.nodes['sta-2'].stats.collisions).toBeGreaterThan(0)
    // modern nodes (HE/VHT with A-MPDU + TXOP) push well past legacy DCF rates
    const mbps = (v.nodes['ap'].stats.bytesDelivered * 8) / 0.3 / 1e6
    expect(mbps).toBeGreaterThan(40)
    expect(mbps).toBeLessThan(160)
  })

  it('legacy-only nodes stay in the classic DCF throughput envelope', () => {
    const sc = saturatedPair()
    for (const n of sc.nodes) n.caps = { generation: 'nonht', features: {} }
    const sim = new Simulation(sc)
    sim.runUntil(300 * MS)
    const mbps = (sim.view.nodes['ap'].stats.bytesDelivered * 8) / 0.3 / 1e6
    expect(mbps).toBeGreaterThan(15)
    expect(mbps).toBeLessThan(40)
  })

  it('rate anomaly: a far station behind brick uses a lower MCS and more airtime per frame', () => {
    const sc = defaultScenario()
    sc.nodes[1].profile = 'saturated'
    sc.nodes[2].profile = 'saturated'
    sc.nodes[2].pos = { x: 9.5, y: 7.5, z: 1 }
    sc.walls[4] = { ...sc.walls[4], material: 'brick', openings: [] } // solid brick divider
    const sim = new Simulation(sc)
    sim.runUntil(300 * MS)
    const v = sim.view
    const near = v.nodes['sta-1'].stats
    const far = v.nodes['sta-2'].stats
    expect(near.txOk).toBeGreaterThan(0)
    expect(far.txOk).toBeGreaterThan(0)
    expect(far.airtimeNs / far.txOk).toBeGreaterThan(near.airtimeNs / near.txOk)
  })

  it('produces seq-ordered records across batches and 10 ms snapshot cadence', () => {
    const sim = new Simulation(defaultScenario())
    const b1 = sim.runUntil(30 * MS)
    const b2 = sim.runUntil(60 * MS)
    const seqs = [...b1.records, ...b2.records].map((r) => r.seq)
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1])
    const snapTimes = [...b1.snapshots, ...b2.snapshots].map((s) => s.t)
    expect(snapTimes.slice(0, 4)).toEqual([0, 10 * MS, 20 * MS, 30 * MS])
  })
})
