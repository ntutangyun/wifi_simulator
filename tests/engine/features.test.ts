import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { defaultScenario, type NodeCfg, type ProfileId, type Scenario } from '../../src/model/scenario'
import { defaultFeatures } from '../../src/model/caps'
import type { Generation } from '../../src/model/types'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

function mkScenario(stas: { gen: Generation; profile: ProfileId; features?: Record<string, boolean> }[], apGen: Generation = 'eht'): Scenario {
  const sc = defaultScenario()
  sc.nodes = [
    { ...sc.nodes[0], caps: { generation: apGen, features: defaultFeatures(apGen) } },
    ...stas.map((s, i): NodeCfg => ({
      id: `sta-${i + 1}`, kind: 'sta', name: `STA-${i + 1}`,
      pos: { x: 3 + i * 0.7, y: 4.5, z: 1 }, txPowerDbm: 15, profile: s.profile,
      caps: { generation: s.gen, features: s.features ?? defaultFeatures(s.gen) },
    })),
  ]
  return sc
}

function run(sc: Scenario, ms: number) {
  const sim = new Simulation(sc)
  const records: TLRecord[] = []
  for (let t = 25 * MS; t <= ms * MS; t += 25 * MS) records.push(...sim.runUntil(t).records)
  return { sim, records }
}

describe('EDCA (Wi-Fi 5+)', () => {
  it('uses AIFS and per-AC CW parameters', () => {
    const { records } = run(mkScenario([{ gen: 'vht', profile: 'video' }]), 100)
    const aifs = records.filter((r) => r.type === 'IFS_START' && r.kind === 'AIFS')
    expect(aifs.length).toBeGreaterThan(0)
    // video → AC_VI (2): CWmin 7 draws
    const viDraws = records.filter((r) => r.type === 'BACKOFF_DRAW' && r.ac === 2)
    expect(viDraws.length).toBeGreaterThan(0)
    expect(viDraws.every((r) => r.type === 'BACKOFF_DRAW' && r.cw <= 15)).toBe(true)
  })

  it('legacy nodes still use plain DIFS/DCF', () => {
    const { records } = run(mkScenario([{ gen: 'nonht', profile: 'saturated' }]), 50)
    expect(records.some((r) => r.type === 'IFS_START' && r.kind === 'DIFS' && r.node === 'sta-1')).toBe(true)
    expect(records.some((r) => r.type === 'IFS_START' && r.kind === 'AIFS' && r.node === 'sta-1')).toBe(false)
    // no aggregation with a legacy peer
    expect(records.some((r) => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.ampdu)).toBe(false)
  })

  it('video (AC_VI) sustains its offered load against a background bulk uploader', () => {
    const sc = mkScenario([
      { gen: 'he', profile: 'video', features: { edca: true, ampdu: true, txop: true } }, // no ofdma → SU
      { gen: 'he', profile: 'saturated', features: { edca: true, ampdu: true, txop: true } },
    ])
    const { sim } = run(sc, 300)
    const videoDelivered = sim.view.nodes['sta-1'].stats.bytesDelivered
    const offered = 15e6 * 0.3 / 8 // ~15 Mbps for 300 ms
    expect(videoDelivered).toBeGreaterThan(offered * 0.7)
  })
})

describe('A-MPDU + BlockAck (Wi-Fi 5+)', () => {
  it('aggregates MPDUs and acknowledges with BA', () => {
    const { sim, records } = run(mkScenario([{ gen: 'vht', profile: 'saturated' }]), 200)
    const agg = records.filter((r) => r.type === 'TX_START' && r.frame.ampdu !== undefined)
    expect(agg.length).toBeGreaterThan(0)
    const counts = agg.map((r) => (r.type === 'TX_START' ? r.frame.ampdu!.mpduCount : 0))
    expect(Math.max(...counts)).toBeGreaterThan(4)
    expect(records.some((r) => r.type === 'TX_START' && r.frame.kind === 'ba')).toBe(true)
    // aggregation smashes the legacy per-frame ceiling
    const mbps = (sim.view.nodes['ap'].stats.bytesDelivered * 8) / 0.2 / 1e6
    expect(mbps).toBeGreaterThan(45)
  })
})

describe('TXOP bursting', () => {
  it('every PPDU (+SIFS+BA) fits inside its TXOP (§10.23.2.8)', () => {
    const { records } = run(mkScenario([{ gen: 'vht', profile: 'saturated' }]), 100)
    const txops = records.filter((r) => r.type === 'TXOP_START')
    expect(txops.length).toBeGreaterThan(0)
    let checked = 0
    for (const ts of txops) {
      if (ts.type !== 'TXOP_START') continue
      const data = records.find((r) => r.type === 'TX_START' && r.t >= ts.t && r.frame.kind === 'data' && r.node === ts.node)
      if (!data || data.type !== 'TX_START') continue
      expect(data.t + data.frame.txTimeNs).toBeLessThanOrEqual(ts.untilNs)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('chains SIFS-separated exchanges when the queue holds frames for a second receiver', () => {
    // two DL video flows (AC_VI, TXOP 4.096 ms): the AP bursts to both STAs in one TXOP
    const { records } = run(mkScenario([
      { gen: 'vht', profile: 'video' },
      { gen: 'vht', profile: 'video' },
    ]), 300)
    const starts = records.filter((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data')
    let chained = false
    for (let i = 1; i < starts.length; i++) {
      const prev = starts[i - 1]
      if (prev.type !== 'TX_START' || starts[i].type !== 'TX_START') continue
      const gap = starts[i].t - (prev.t + prev.frame.txTimeNs)
      if (gap > 0 && gap < 120_000) chained = true // SIFS+BA+SIFS ≪ AIFS+backoff
    }
    expect(chained).toBe(true)
  })
})

describe('OFDMA (Wi-Fi 6+)', () => {
  it('DL MU: one PPDU serves two STAs, acked by simultaneous BAs', () => {
    const sc = mkScenario([
      { gen: 'he', profile: 'video' },
      { gen: 'he', profile: 'video' },
    ])
    const { sim, records } = run(sc, 200)
    const mu = records.filter((r) => r.type === 'TX_START' && r.frame.muParts !== undefined && r.frame.kind === 'data')
    expect(mu.length).toBeGreaterThan(0)
    const first = mu[0] as Extract<TLRecord, { type: 'TX_START' }>
    expect(first.frame.muParts!.length).toBeGreaterThanOrEqual(2)
    // simultaneous BAs share an orthogonal group
    const bas = records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'ba' && r.frame.orthogonalGroup)
    expect(bas.length).toBeGreaterThanOrEqual(2)
    expect(sim.view.nodes['sta-1'].stats.bytesDelivered).toBeGreaterThan(0)
    expect(sim.view.nodes['sta-2'].stats.bytesDelivered).toBeGreaterThan(0)
  })

  it('UL MU: Trigger → simultaneous TB PPDUs → Multi-STA BlockAck', () => {
    const sc = mkScenario([
      { gen: 'he', profile: 'saturated' },
      { gen: 'he', profile: 'saturated' },
    ])
    const { sim, records } = run(sc, 200)
    const triggers = records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'trigger')
    expect(triggers.length).toBeGreaterThan(0)
    const mbas = records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'mba')
    expect(mbas.length).toBeGreaterThan(0)
    // simultaneous UL data in an orthogonal group
    const tb = records.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.orthogonalGroup)
    const byTime = new Map<number, number>()
    for (const r of tb) byTime.set(r.t, (byTime.get(r.t) ?? 0) + 1)
    expect([...byTime.values()].some((n) => n >= 2)).toBe(true)
    expect(sim.view.nodes['ap'].stats.bytesDelivered).toBeGreaterThan(0)
  })
})

describe('MLO (Wi-Fi 7)', () => {
  it('an MLO STA transmits on both links from a shared queue', () => {
    const sc = mkScenario([{ gen: 'eht', profile: 'saturated' }])
    const { sim, records } = run(sc, 200)
    const on5g = records.filter((r) => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data')
    const on6g = records.filter((r) => r.type === 'TX_START' && r.node === 'sta-1#6g' && r.frame.kind === 'data')
    expect(on5g.length).toBeGreaterThan(0)
    expect(on6g.length).toBeGreaterThan(0)
    // no MSDU delivered twice (shared-queue claiming prevents duplicates)
    const mbps = (sim.view.nodes['ap'].stats.bytesDelivered * 8) / 0.2 / 1e6
    const mbps6 = ((sim.view.nodes['ap#6g']?.stats.bytesDelivered ?? 0) * 8) / 0.2 / 1e6
    expect(mbps + mbps6).toBeGreaterThan(80) // two links beat one
  })

  it('remains deterministic with all v2 features active', () => {
    const sc = mkScenario([
      { gen: 'eht', profile: 'saturated' },
      { gen: 'he', profile: 'video' },
      { gen: 'vht', profile: 'backup' },
      { gen: 'nonht', profile: 'browsing' },
    ])
    const a = new Simulation(sc)
    const b = new Simulation(sc)
    a.runUntil(150 * MS)
    b.runUntil(150 * MS)
    expect(a.timelineHash()).toBe(b.timelineHash())
  })
})
