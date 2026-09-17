import { describe, it, expect } from 'vitest'
import { DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT } from '../../src/engine/queues'
import { defaultScenario, ScenarioSchema } from '../../src/model/scenario'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1']

describe('MAC queue limit (ns-3 WifiMacQueue MaxSize, DROP_NEWEST)', () => {
  it('defaults to 500 MSDUs per access category and a 500 ms lifetime', () => {
    expect(DEFAULT_QUEUE_LIMIT).toBe(500)
    expect(DEFAULT_MSDU_LIFETIME_NS).toBe(500_000_000)
  })

  it('an arrival that finds the queue full is dropped without being queued', () => {
    // the AP never answers, so nothing leaves the queue except by retry-limit drops
    const b = makeBss(NODES, { 'sta-1>ap': -90, 'ap>sta-1': -90 }, { queueLimit: 3 })
    for (let i = 0; i < 6; i++) b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(1_100_000)
    const enq = b.recs('ENQUEUE', 'sta-1')
    const full = b.recs('DROP', 'sta-1').filter((r) => r.reason === 'queueFull')
    // all six arrive in the same instant, before the MAC claims any for the air
    expect(enq).toHaveLength(3)
    expect(full).toHaveLength(3)
    for (const d of full) expect(enq.some((e) => e.msduId === d.msduId)).toBe(false)
  })
})

describe('MSDU lifetime (dot11EDCATableMSDULifetime, ns-3 MaxDelay)', () => {
  it('an MSDU older than its lifetime is discarded when the MAC next builds a transmission', () => {
    const b = makeBss(NODES, { 'sta-1>ap': -90, 'ap>sta-1': -90 }, { msduLifetimeNs: 50_000_000 })
    for (let i = 0; i < 4; i++) b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(400_000_000)
    const life = b.recs('DROP', 'sta-1').filter((r) => r.reason === 'lifetime')
    expect(life.length).toBeGreaterThan(0)
    // every lifetime drop happens after the lifetime, and is also dequeued
    for (const d of life) {
      expect(d.t).toBeGreaterThanOrEqual(1_000_000 + 50_000_000)
      expect(b.recs('DEQUEUE', 'sta-1').some((q) => q.msduId === d.msduId && q.t === d.t)).toBe(true)
    }
    // nothing is transmitted once it has expired
    const firstLife = life[0].t
    const late = b.recs('TX_START', 'sta-1').filter((r) => r.t > firstLife && life.some((d) => d.msduId === r.frame.msduId && d.t < r.t))
    expect(late).toHaveLength(0)
  })
})

describe('scenario queue settings', () => {
  it('are optional and validated', () => {
    const sc = defaultScenario()
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
    expect(ScenarioSchema.safeParse({ ...sc, queue: { limit: 50, lifetimeMs: 100 } }).success).toBe(true)
    expect(ScenarioSchema.safeParse({ ...sc, queue: { limit: 0, lifetimeMs: 100 } }).success).toBe(false)
  })
})

describe('a discarded uplink frame never reaches its cloud server', () => {
  it('frames dropped at the retry limit produce no WAN arrival', async () => {
    const { Simulation } = await import('../../src/engine/simulation')
    const sc = defaultScenario()
    const sta = sc.nodes.find((n) => n.kind === 'sta')!
    sta.profiles = ['gaming']
    sta.pos = { x: 80, y: 80, z: 1 } // out of range: every attempt fails
    const recs = new Simulation(sc).runUntil(3_000_000_000).records
    const drops = recs.filter((r) => r.type === 'DROP' && r.node === sta.id)
    expect(drops.length).toBeGreaterThan(0)
    expect(recs.filter((r) => r.type === 'WAN_RX' && r.from === sta.id)).toHaveLength(0)
  })
})

describe('the view does not time discarded frames as deliveries', () => {
  it('a retry-limit drop adds no latency sample, and QSRC returns to 0 on success', async () => {
    const { Simulation } = await import('../../src/engine/simulation')
    const sc = defaultScenario()
    const far = sc.nodes.find((n) => n.kind === 'sta')!
    far.profiles = ['saturated']
    far.pos = { x: 80, y: 80, z: 1 } // every attempt fails: drops, no deliveries
    const sim = new Simulation(sc)
    sim.runUntil(2_000_000_000)
    const v = sim.view.nodes[far.id]
    expect(v.stats.drops).toBeGreaterThan(0)
    expect(v.stats.txLatency.n, 'no delivery was timed').toBe(0)

    const near = new Simulation(defaultScenario())
    near.runUntil(200_000_000)
    // the AP delivers to a close station, so its QSRC is back at 0 after each success
    expect(near.view.nodes['ap'].qsrc).toBe(0)
    expect(near.view.nodes['ap'].stats.txLatency.n).toBeGreaterThan(0)
  })
})
