import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { TimelineStore } from '../../src/player/timelineStore'
import { defaultScenario, type Scenario } from '../../src/model/scenario'
import { cloneView } from '../../src/model/view'

const MS = 1_000_000

function saturated(): Scenario {
  const sc = defaultScenario()
  sc.nodes[1].profile = 'saturated'
  sc.nodes[2].profile = 'saturated'
  return sc
}

function filledStore(untilMs: number) {
  const sim = new Simulation(saturated())
  const store = new TimelineStore()
  for (let t = 25 * MS; t <= untilMs * MS; t += 25 * MS) store.ingest(sim.runUntil(t))
  return { sim, store }
}

describe('TimelineStore', () => {
  it('viewAt equals the live engine view at the same instant', () => {
    const { store } = filledStore(100)
    const live = new Simulation(saturated())
    live.runUntil(73 * MS)
    const fromStore = store.viewAt(73 * MS)!
    const liveView = cloneView(live.view)
    liveView.t = 73 * MS
    expect(fromStore).toEqual(liveView)
  })

  it('steps to next/prev record times', () => {
    const { store } = filledStore(50)
    const t1 = store.nextRecordTime(0)!
    expect(t1).toBeGreaterThan(0)
    const t2 = store.nextRecordTime(t1)!
    expect(t2).toBeGreaterThan(t1)
    expect(store.prevRecordTime(t2)).toBe(t1)
  })

  it('exchange stepping lands on data/rts TX_START times only', () => {
    const { store } = filledStore(50)
    const t = store.nextExchangeTime(0)!
    const recs = store.recordsIn(t, t)
    expect(recs.some((r) => r.type === 'TX_START' && (r.frame.kind === 'data' || r.frame.kind === 'rts'))).toBe(true)
    const t2 = store.nextExchangeTime(t)!
    expect(store.prevExchangeTime(t2)).toBe(t)
  })

  it('trimBefore keeps viewAt working at and after the trim point', () => {
    const { store } = filledStore(100)
    const before = store.viewAt(80 * MS)!
    store.trimBefore(50 * MS)
    expect(store.windowStartNs).toBeGreaterThan(0)
    expect(store.windowStartNs).toBeLessThanOrEqual(50 * MS)
    const after = store.viewAt(80 * MS)!
    expect(after).toEqual(before)
  })

  it('tracks the frontier across batches', () => {
    const { store } = filledStore(75)
    expect(store.frontierNs).toBe(75 * MS)
  })
})
