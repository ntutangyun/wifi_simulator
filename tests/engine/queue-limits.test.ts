import { describe, it, expect } from 'vitest'
import { DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS, DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT, TU_NS } from '../../src/engine/queues'
import { defaultScenario, ScenarioSchema } from '../../src/model/scenario'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1']

describe('MAC queue limit (ns-3 WifiMacQueue MaxSize, DROP_NEWEST)', () => {
  // 2026-11-11 (W7b): the lifetimes are the MIB defaults, in TU (1 TU = 1024 µs), not ns-3's
  // 500 ms: dot11EDCATableMSDULifetime / dot11QAPEDCATableMSDULifetime DEFVAL { 500 } TUs, and
  // dot11MaxTransmitMSDULifetime DEFVAL { 512 } TUs (IEEE Std 802.11-2024 Annex C).
  it('defaults to 500 MSDUs per access category, 500 TU under EDCA and 512 TU under DCF', () => {
    expect(DEFAULT_QUEUE_LIMIT).toBe(500)
    expect(TU_NS).toBe(1_024_000)
    expect(DEFAULT_MSDU_LIFETIME_NS).toBe(512_000_000)
    expect(DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS).toBe(524_288_000)
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

describe('MSDU lifetime', () => {
  // 2026-11-11 (W7b): this case used the DCF helper and pinned the EDCA rule. It now runs EDCA,
  // where the timer starts when the MSDU is passed to the MAC (§10.23.2.12.1); the DCF rule —
  // timer from the first transmission attempt (§10.4) — has its own case below.
  it('EDCA: an MSDU older than its lifetime (from enqueue) is discarded when the MAC next builds a transmission', () => {
    const b = makeBss(NODES, { 'sta-1>ap': -90, 'ap>sta-1': -90 }, { msduLifetimeNs: 50_000_000, edca: true })
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
    // and an MSDU can expire without ever having been sent: the EDCA clock started at enqueue
    const sentIds = new Set(b.recs('TX_START', 'sta-1').map((r) => r.frame.msduId))
    expect(life.some((d) => !sentIds.has(d.msduId))).toBe(true)
  })

  it('DCF: the timer starts at the first transmission attempt, so an unsent MSDU never expires (§10.4)', () => {
    const LIFE = 2_000_000
    const b = makeBss(NODES, { 'sta-1>ap': -90, 'ap>sta-1': -90 }, { msduLifetimeNs: LIFE })
    for (let i = 0; i < 6; i++) b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(400_000_000)
    const life = b.recs('DROP', 'sta-1').filter((r) => r.reason === 'lifetime')
    expect(life.length, 'a 2 ms lifetime does expire attempted MSDUs').toBeGreaterThan(0)
    const tx = b.recs('TX_START', 'sta-1')
    for (const d of life) {
      const first = tx.find((r) => r.frame.msduId === d.msduId)
      expect(first, `MSDU ${d.msduId} expired without an attempt`).toBeDefined()
      expect(d.t - first!.t).toBeGreaterThan(LIFE)
    }
    // every MSDU queued for far longer than the lifetime before its first attempt was still sent
    const late = tx.filter((r, i) => tx.findIndex((x) => x.frame.msduId === r.frame.msduId) === i && r.t - 1_000_000 > LIFE)
    expect(late.length, 'MSDUs waited past the lifetime unsent and were still attempted').toBeGreaterThan(0)
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

describe('the view reflects every QSRC change, and queue-full drops do not accumulate', () => {
  it('a QSRC reset on a received CTS reaches the view', async () => {
    const { LESSONS } = await import('../../src/course/lessons')
    const { initViewState, applyRecord } = await import('../../src/model/view')
    const { Simulation } = await import('../../src/engine/simulation')
    const sc = LESSONS.find((l) => l.id === 'hidden')!.variants![0].scenario() // RTS/CTS on
    const recs = new Simulation(sc).runUntil(300_000_000).records
    // every CW_CHANGE carries the counter, so the view never shows a stale QSRC
    const cw = recs.filter((r) => r.type === 'CW_CHANGE')
    expect(cw.length).toBeGreaterThan(10)
    for (const r of cw) if (r.type === 'CW_CHANGE') expect(r.qsrc, `CW_CHANGE @${r.t}`).toBeDefined()
    // and a CTS that resets it emits one
    // a station that receives its CTS emits the reset in the same instant, and
    // replaying the records leaves the view showing it
    const vs = initViewState(sc)
    let sawReset = false
    for (const r of recs) {
      applyRecord(vs, r)
      // only the station the CTS answers resets its counter; bystanders just overhear it
      if (r.type !== 'RX_OK' || r.frame.kind !== 'cts' || r.frame.dst !== r.node || !vs.nodes[r.node]) continue
      const reset = recs.find((x) => x.type === 'CW_CHANGE' && x.node === r.node && x.t === r.t && x.qsrc === 0)
      expect(reset, `CTS @${r.t} resets QSRC visibly`).toBeDefined()
      sawReset = true
    }
    expect(sawReset).toBe(true)
  })

  it('queue-full drops never enter the discarded-id list (they are never dequeued)', async () => {
    const { initViewState, applyRecord } = await import('../../src/model/view')
    const { Simulation } = await import('../../src/engine/simulation')
    const sc = defaultScenario()
    sc.queue = { limit: 4, lifetimeMs: 500 }
    sc.nodes[1].profiles = ['saturated']
    sc.nodes[1].pos = { x: 40, y: 40, z: 1 }
    const recs = new Simulation(sc).runUntil(1_000_000_000).records
    expect(recs.filter((r) => r.type === 'DROP' && r.reason === 'queueFull').length).toBeGreaterThan(5)
    const vs = initViewState(sc)
    for (const r of recs) applyRecord(vs, r)
    for (const n of Object.values(vs.nodes)) expect(n.droppedIds.length).toBeLessThan(10)
  })
})
