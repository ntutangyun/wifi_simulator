import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { TimelineStore } from '../../src/player/timelineStore'
import { defaultScenario, type Scenario } from '../../src/model/scenario'
import { cloneView } from '../../src/model/view'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

function saturated(): Scenario {
  const sc = defaultScenario()
  sc.nodes[1].profiles = ['saturated']
  sc.nodes[2].profiles = ['saturated']
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

/**
 * `ingest` takes a `Batch`, and for a long time it took one only up to a size
 * nobody had written down.
 *
 * It was `this.records.push(...b.records)`. Spread passes every element as its
 * own argument and the argument count is bounded by the stack, so past roughly
 * a hundred thousand records the call threw `RangeError: Maximum call stack
 * size exceeded` — a store that silently refuses a big batch while its type
 * says otherwise. It was found from the other side: a test that wanted a whole
 * lesson's recording in a store had to cut the batch into 2 000-record pieces
 * to get past this line, and the comment explaining why was the bug report.
 *
 * The browser never hit it. The worker posts 50 ms sim-time chunks and the
 * biggest one in the course is 16 433 records, six times under the limit — so
 * this is a limit on the API and not on the app, which is why the check below
 * is a unit check and there is no browser half to it.
 */
describe('TimelineStore.ingest takes the whole batch, however big', () => {
  /** Small, so 300 000 of them cost ~40 MB rather than ~40 MiB×4. */
  const bigBatch = (n: number) => ({
    records: Array.from({ length: n }, (_, i) => ({ type: 'WAN_TX', t: i + 1, seq: i } as unknown as TLRecord)),
    snapshots: [],
    frontierNs: n + 1,
  })

  /**
   * 300 000: about 2.4× the smallest batch measured to throw, so this is not a
   * check sitting on the edge of a threshold. The threshold itself is a
   * property of the engine's stack and is measured in the next test rather
   * than assumed here.
   */
  const N = 300_000

  it(`swallows a ${N}-record batch in one call, in order`, () => {
    const store = new TimelineStore()
    const b = bigBatch(N)
    // Put the spread form back in `ingest` and this line is the RangeError.
    store.ingest(b)
    expect(store.recordCount).toBe(N)
    expect(store.frontierNs).toBe(N + 1)
    // Order kept, which is what every lookup in this class assumes: `recordsIn`
    // walks forward from a binary search and stops at the first record past the
    // end of its span.
    const span = store.recordsIn(1_000, 1_009)
    expect(span.map((r) => r.t)).toEqual([1_000, 1_001, 1_002, 1_003, 1_004, 1_005, 1_006, 1_007, 1_008, 1_009])
    expect(store.nextRecordTime(5_000)).toBe(5_001)
    expect(store.prevRecordTime(5_000)).toBe(4_999)
  })

  it('and the spread it replaced really does fail on that same batch', () => {
    // Without this the test above is green against both implementations on a
    // machine with a big enough stack, and would be proving nothing. Measured
    // on node 24.15 with the default stack: 100 000 elements go through,
    // 125 000 throw. The assertion is on the smaller claim — that there is a
    // size under N at which it throws — so it does not depend on where exactly
    // this engine's limit sits.
    const b = bigBatch(N)
    const limit = (() => {
      for (let n = 1_000; n <= N; n *= 2) {
        try {
          const dst: TLRecord[] = []
          dst.push(...b.records.slice(0, n))
        } catch {
          return n
        }
      }
      return null
    })()
    expect(limit, `no batch size up to ${N} made the spread form throw`).not.toBeNull()
    expect(limit!).toBeLessThanOrEqual(N)
  })
})
