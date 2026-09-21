/**
 * Every empirical claim in "Retries, drops and queues", measured against the
 * lesson's own scenarios. Each assertion quotes the sentence it guards;
 * standard constants are checked against the engine's exports.
 *
 * The contract of the rewritten lesson (shape, budgets, jumps, the bilingual
 * walk) comes from `lessonShapeSuite`; everything below it is this lesson's
 * own empirical pins, which survived the rewrite sentence for sentence. The
 * scenario builder and both variants are unchanged, so the recorded timeline
 * hashes are the ones already in tests/fixtures/lesson-hashes.json.
 */
import { describe, it, expect } from 'vitest'
import { retriesQueues } from '../../src/course/tier1/retries-queues'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { CW_MAX, CW_MIN, SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import { DEFAULT_MSDU_LIFETIME_NS, DEFAULT_QUEUE_LIMIT } from '../../src/engine/queues'
import type { TLRecord } from '../../src/model/records'
import { decodeFrame, fmtRecord } from '../../src/ui/format'
import { lessonShapeSuite } from './kit'

const MS = 1_000_000
const RUN_NS = 3000 * MS

type Drop = Extract<TLRecord, { type: 'DROP' }>
type Retry = Extract<TLRecord, { type: 'RETRY' }>

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const sc: Scenario = variant === undefined
      ? retriesQueues.scenario()
      : retriesQueues.variants![variant].scenario()
    memo.set(key, [...new Simulation(sc).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const drops = (rs: TLRecord[], reason: Drop['reason'], node?: string): Drop[] =>
  ofType(rs, 'DROP').filter((r) => r.reason === reason && (node === undefined || r.node === node))

/** MSDUs removed from a queue without being dropped — i.e. acknowledged. */
function delivered(rs: TLRecord[]): Record<string, number> {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const out: Record<string, number> = {}
  for (const r of ofType(rs, 'DEQUEUE')) if (!dropped.has(r.msduId)) out[r.node] = (out[r.node] ?? 0) + 1
  return out
}

/** Queue-to-ACK delay (ms) of every frame the AP delivered, with its delivery time. */
function apDelays(rs: TLRecord[]): { atNs: number; ms: number }[] {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const enq = new Map<number, number>()
  const out: { atNs: number; ms: number }[] = []
  for (const r of rs) {
    if (r.type === 'ENQUEUE') enq.set(r.msduId, r.t)
    if (r.type === 'DEQUEUE' && r.node === 'ap' && !dropped.has(r.msduId) && enq.has(r.msduId)) {
      out.push({ atNs: r.t, ms: (r.t - enq.get(r.msduId)!) / MS })
    }
  }
  return out
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// The prose window: `why` + `outcomes` + `terms` + `picture` + `numbers`.
lessonShapeSuite(retriesQueues, { proseMax: 950, runNs: RUN_NS })

describe('retries-queues · the scene', () => {
  it('scenario and variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(retriesQueues.scenario())).not.toThrow()
    for (const v of retriesQueues.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('names the lessons whose words it uses', () => {
    // `retry` leans on the backoff lesson's window and deadline; `queue` on the
    // airtime lesson's ACK and payload.
    expect(retriesQueues.needs).toEqual(['airtime', 'backoff'])
    expect(retriesQueues.terms!.map((t) => t.term)).toEqual(['retry', 'retry limit', 'queue', 'lifetime'])
  })
})

describe('retries-queues · standard constants', () => {
  it('dot11ShortRetryLimit is 7', () => {
    // "when the count reaches dot11ShortRetryLimit = 7 the MSDU is discarded"
    expect(SHORT_RETRY_LIMIT).toBe(7)
  })

  it('the CW ladder is 15 → 31 → … → 1023, then back to 15 at the limit', () => {
    // "CW after k consecutive failures: 15 → 31 → 63 → 127 → 255 → 511 → 1023, then back to 15 at k = 7"
    const ladder: number[] = []
    let cw = CW_MIN
    for (let k = 1; k <= SHORT_RETRY_LIMIT; k++) {
      cw = k === SHORT_RETRY_LIMIT ? CW_MIN : Math.min(2 * cw + 1, CW_MAX)
      ladder.push(cw)
    }
    expect([CW_MIN, ...ladder]).toEqual([15, 31, 63, 127, 255, 511, 1023, 15])
  })

  it('the queue defaults are 500 MSDUs and a 500 ms MSDU lifetime', () => {
    // "Queue limit: 500 MSDUs" / "MSDU lifetime: 500 ms (dot11EDCATableMSDULifetime)"
    expect(DEFAULT_QUEUE_LIMIT).toBe(500)
    expect(DEFAULT_MSDU_LIFETIME_NS).toBe(500 * MS)
    const base = retriesQueues.scenario()
    expect(base.queue).toEqual({ limit: DEFAULT_QUEUE_LIMIT, lifetimeMs: 500 })
    expect(retriesQueues.variants![0].scenario().queue).toEqual({ limit: 100, lifetimeMs: 500 })
    expect(retriesQueues.variants![1].scenario().queue).toEqual({ limit: 500, lifetimeMs: 100 })
  })
})

describe('retries-queues · the retry model', () => {
  const rs = recs()
  const firstRl = drops(rs, 'retryLimit')[0]

  it("Hidden B's first frame is dropped at the retry limit at 27 689 µs after seven attempts", () => {
    // "Hidden B’s first frame: seven attempts, then DROP … 27 689 µs — DROP retryLimit"
    expect(firstRl.node).toBe('sta-2')
    expect(firstRl.t).toBe(27_689_118)
    const attempts = ofType(rs, 'TX_START').filter((r) => r.frame.msduId === firstRl.msduId)
    expect(attempts.length).toBe(SHORT_RETRY_LIMIT)
    // the table's TX start / rate / Retry bit columns
    expect(attempts.map((a) => [Math.round(a.t / 1000), a.frame.mbps, a.frame.retryFlag ? 1 : 0])).toEqual([
      [0, 48, 0], [526, 48, 1], [1683, 36, 1], [4544, 36, 1], [6999, 24, 1], [13_632, 24, 1], [26_940, 18, 1],
    ])
    // "All seven carry sequence number 0."
    expect(new Set(attempts.map((a) => a.frame.seqNo))).toEqual(new Set([0]))
    // "276 µs of airtime at 48 Mb/s, 704 µs at 18 Mb/s"
    expect(attempts[0].frame.txTimeNs).toBe(276_000)
    expect(attempts[6].frame.txTimeNs).toBe(704_000)
  })

  it('its RETRY records count 1…7 in both counters, and CW walks the ladder before resetting', () => {
    // the table's "Failure recorded" and "CW after" columns
    const retries = ofType(rs, 'RETRY').filter((r) => r.msduId === firstRl.msduId)
    expect(retries.map((r) => [Math.round(r.t / 1000), r.retries, r.qsrc])).toEqual([
      [321, 1, 1], [847, 2, 2], [2092, 3, 3], [4953, 4, 4], [7576, 5, 5], [14_209, 6, 6], [27_689, 7, 7],
    ])
    const cw = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-2' && r.t <= firstRl.t)
    expect(cw.map((r) => r.cw)).toEqual([31, 63, 127, 255, 511, 1023, 15])
    expect(cw[cw.length - 1].t).toBe(firstRl.t)
  })

  it('the next frame leaves at 27 741 µs with sequence number 1 and the Retry bit clear', () => {
    // "The next frame, sequence number 1, leaves at 27 741 µs with the Retry bit clear and CW back at 15."
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t > firstRl.t)!
    expect(Math.round(next.t / 1000)).toBe(27_741)
    expect(next.frame.seqNo).toBe(1)
    expect(next.frame.retryFlag).toBe(false)
  })

  it('a retransmission keeps its sequence number and sets the Retry bit', () => {
    // "A retransmission is the same MPDU sent again: it keeps its sequence number and sets the Retry bit"
    const seqOf = new Map<number, number>()
    let checked = 0
    for (const r of ofType(rs, 'TX_START')) {
      if (r.frame.kind !== 'data' || r.frame.msduId === undefined || r.frame.seqNo === undefined) continue
      const known = seqOf.get(r.frame.msduId)
      if (known === undefined) {
        seqOf.set(r.frame.msduId, r.frame.seqNo)
        expect(r.frame.retryFlag).toBe(false)
      } else {
        expect(r.frame.seqNo).toBe(known)
        expect(r.frame.retryFlag).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('over 3 s Hidden A delivers 76 frames and loses 62 at the retry limit; Hidden B, 69 and 61', () => {
    // "Hidden A gets 76 frames through and loses 62 at the retry limit; Hidden B gets 69 through and loses 61."
    expect(delivered(rs)['sta-1']).toBe(76)
    expect(delivered(rs)['sta-2']).toBe(69)
    expect(drops(rs, 'retryLimit', 'sta-1').length).toBe(62)
    expect(drops(rs, 'retryLimit', 'sta-2').length).toBe(61)
  })

  it('at 504 465 µs three of Hidden B’s frames expire at once and the two counters come apart', () => {
    // "Hidden B’s head frame (sequence number 17) has failed five times, so QSRC is 5, when the MAC finds
    //  it and the two frames behind it older than 500 ms and drops all three for lifetime."
    const life = drops(rs, 'lifetime', 'sta-2')
    expect(life[0].t).toBe(504_465_360)
    expect(life.filter((r) => r.t === life[0].t).length).toBe(3)
    const head = life[0].msduId
    const headRetries = ofType(rs, 'RETRY').filter((r) => r.msduId === head)
    expect(headRetries[headRetries.length - 1].qsrc).toBe(5)
    expect(headRetries.length).toBe(5)
    const headTx = ofType(rs, 'TX_START').find((r) => r.frame.msduId === head)!
    expect(headTx.frame.seqNo).toBe(17)
    // "The next frame, sequence number 18, fails once: its RETRY record reads retries = 1 but QSRC = 6,
    //  and CW jumps to 1023. After its second failure QSRC reaches 7, so CW resets to 15 … Its third
    //  failure reads retries = 3, QSRC = 1."
    const next = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t >= life[0].t)!
    expect(next.frame.seqNo).toBe(18)
    const nextRetries = ofType(rs, 'RETRY').filter((r) => r.msduId === next.frame.msduId).slice(0, 3)
    expect(nextRetries.map((r: Retry) => [r.retries, r.qsrc])).toEqual([[1, 6], [2, 7], [3, 1]])
    const cwAfter = (t: number) => ofType(rs, 'CW_CHANGE').find((r) => r.node === 'sta-2' && r.t === t)!.cw
    expect(cwAfter(nextRetries[0].t)).toBe(1023)
    expect(cwAfter(nextRetries[1].t)).toBe(15)
  })

  it('the frames that expired had been queued since t = 0', () => {
    // "Those three frames had waited since t = 0, behind predecessors that each burned several attempts."
    const life = drops(rs, 'lifetime', 'sta-2').filter((r) => r.t === 504_465_360)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    for (const d of life) expect(enq.get(d.msduId)).toBe(0)
  })
})

describe('retries-queues · what the UI shows', () => {
  const rs = recs()

  it('the event log prints the RETRY and DROP lines the lesson quotes', () => {
    // "The event log prints “retry #id (retries=7 QSRC=7)”" / "the log prints “DROP #id (reason)”"
    const rl = drops(rs, 'retryLimit')[0]
    const last = ofType(rs, 'RETRY').filter((r) => r.msduId === rl.msduId).pop()!
    expect(fmtRecord(last)).toBe(`sta-2 retry #${rl.msduId} (retries=7 QSRC=7)`)
    expect(fmtRecord(rl)).toBe(`sta-2 DROP #${rl.msduId} (retryLimit)`)
    expect(fmtRecord(drops(rs, 'queueFull', 'ap')[0])).toMatch(/^ap DROP #\d+ \(queueFull\)$/)
    expect(fmtRecord(drops(rs, 'lifetime', 'ap')[0])).toMatch(/^ap DROP #\d+ \(lifetime\)$/)
  })

  it('the frame detail of a data frame has Sequence number and Retry flag rows', () => {
    // "Frame detail of a data frame: Sequence number and Retry flag."
    const retryTx = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'data' && r.frame.retryFlag)!
    const fields = decodeFrame(retryTx.frame)
    expect(fields.find((f) => f.field === 'Sequence number')!.value).toBe(String(retryTx.frame.seqNo))
    expect(fields.find((f) => f.field === 'Retry flag')!.value).toBe('1')
  })
})

describe('retries-queues · queues under overload', () => {
  const rs = recs()

  it('Hidden A and Hidden B never hear each other', () => {
    // "Hidden A and Hidden B upload flat out from rooms that cannot hear each other"
    const hears = (rx: string, tx: string) => rs.some((r) => r.type === 'RX_START' && r.node === rx && r.from === tx)
    expect(hears('sta-1', 'sta-2')).toBe(false)
    expect(hears('sta-2', 'sta-1')).toBe(false)
  })

  it('after the first queue-full drop both reasons keep firing at the AP', () => {
    // "after the first queue-full drop at 1 963 852 µs, queueFull and lifetime drops alternate"
    const t0 = drops(rs, 'queueFull', 'ap')[0].t
    expect(drops(rs, 'queueFull', 'ap').filter((r) => r.t > t0).length).toBeGreaterThan(100)
    expect(drops(rs, 'lifetime', 'ap').filter((r) => r.t > t0).length).toBeGreaterThan(100)
  })

  it('a queueFull drop has no ENQUEUE record (DROP_NEWEST) and a lifetime drop has a DEQUEUE', () => {
    // "An arrival that finds the queue full is dropped and never queued (DROP_NEWEST) … with no ENQUEUE record."
    const enq = new Set(ofType(rs, 'ENQUEUE').map((r) => r.msduId))
    const deq = new Set(ofType(rs, 'DEQUEUE').map((r) => r.msduId))
    for (const d of drops(rs, 'queueFull')) expect(enq.has(d.msduId)).toBe(false)
    for (const d of drops(rs, 'lifetime')) expect(deq.has(d.msduId)).toBe(true)
  })

  it('the video offers the AP 3541 MSDUs of 1400 B (13.2 Mb/s) and 2644 are acknowledged (9.9 Mb/s)', () => {
    // "In 3 s the video offers the AP 3541 MSDUs of 1400 B, about 13.2 Mb/s … the AP gets 2644 of them
    //  acknowledged, about 9.9 Mb/s."
    const offered = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').length + drops(rs, 'queueFull', 'ap').length
    expect(offered).toBe(3541)
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap').every((r) => r.bytes === 1400)).toBe(true)
    expect(delivered(rs)['ap']).toBe(2644)
    expect(((offered * 1400 * 8) / 3 / 1e6).toFixed(1)).toBe('13.2')
    expect(((2644 * 1400 * 8) / 3 / 1e6).toFixed(1)).toBe('9.9')
    // "881 delivered per second"
    expect(Math.round(2644 / 3)).toBe(881)
  })

  it('the mean queue-to-ACK delay grows 19 → 149 → 228 → 324 → 472 → 472 ms', () => {
    // the "Delivered during / Mean queue-to-ACK delay" table
    const d = apDelays(rs)
    const windows = [0, 1, 2, 3, 4, 5].map((w) =>
      Math.round(mean(d.filter((x) => x.atNs >= w * 500 * MS && x.atNs < (w + 1) * 500 * MS).map((x) => x.ms))))
    expect(windows).toEqual([19, 149, 228, 324, 472, 472])
  })

  it('the queue fills at 1 963 852 µs and the lifetime bites at 2 182 806 µs, four frames at once', () => {
    // "At 1 963 852 µs the queue holds 500 MSDUs and the next video frame is refused … At 2 182 806 µs
    //  the lifetime bites as well: four frames aged 500.2 to 502.6 ms are dropped at once."
    const qf = drops(rs, 'queueFull', 'ap')[0]
    expect(qf.t).toBe(1_963_851_557)
    const depthBefore = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap' && r.t <= qf.t).pop()!.depth
    expect(depthBefore).toBe(500)
    const life = drops(rs, 'lifetime', 'ap')
    expect(life[0].t).toBe(2_182_806_360)
    const atOnce = life.filter((r) => r.t === life[0].t)
    expect(atOnce.length).toBe(4)
    const enq = new Map(ofType(rs, 'ENQUEUE').map((r) => [r.msduId, r.t]))
    const ages = atOnce.map((r) => Number(((r.t - enq.get(r.msduId)!) / MS).toFixed(1)))
    expect(Math.min(...ages)).toBe(500.2)
    expect(Math.max(...ages)).toBe(502.6)
    // "From then on the delay stops growing, because nothing older than 500 ms is ever sent."
    expect(Math.max(...apDelays(rs).map((x) => x.ms))).toBeLessThan(501)
  })
})

describe('retries-queues · the two knobs', () => {
  const base = recs(), q100 = recs(0), life100 = recs(1)

  it('a 100-MSDU queue overflows at 529 728 µs and never drops for lifetime at the AP', () => {
    // "With a 100-MSDU queue, overflow starts at 529 728 µs instead of after almost two seconds … the AP
    //  never drops for lifetime, and no delivered frame waits longer than 213 ms"
    expect(drops(q100, 'queueFull', 'ap')[0].t).toBe(529_728_227)
    expect(drops(q100, 'lifetime', 'ap').length).toBe(0)
    expect(Math.max(...apDelays(q100).map((x) => x.ms))).toBeLessThan(213)
    // "near the 113 ms that 100 frames at 881 delivered per second represent"
    expect(Math.round((100 / (delivered(q100)['ap'] / 3)) * 1000)).toBe(113)
  })

  it('a 100 ms lifetime never fills the queue; drops start at 588 851 µs and no frame waits over 101 ms', () => {
    // "With a 100 ms lifetime the queue never fills, lifetime drops start at 588 851 µs, and no delivered
    //  frame waits more than 101 ms"
    expect(drops(life100, 'queueFull').length).toBe(0)
    expect(drops(life100, 'lifetime', 'ap')[0].t).toBe(588_851_360)
    const max = Math.max(...apDelays(life100).map((x) => x.ms))
    expect(max).toBeGreaterThan(100)
    expect(max).toBeLessThan(101)
  })

  it('the mean delay over the last second is 472 / 117 / 88 ms, and all three runs deliver 2644 frames', () => {
    // "Over the last second of the run the mean queue-to-ACK delay is 472 ms at the defaults, 117 ms with
    //  the short queue and 88 ms with the short lifetime — and in all three runs the AP delivers exactly
    //  2644 frames."
    const lastSecond = (rs: TLRecord[]) =>
      Math.round(mean(apDelays(rs).filter((x) => x.atNs >= 2000 * MS).map((x) => x.ms)))
    expect([lastSecond(base), lastSecond(q100), lastSecond(life100)]).toEqual([472, 117, 88])
    for (const rs of [base, q100, life100]) expect(delivered(rs)['ap']).toBe(2644)
  })
})

describe('retries-queues · the drop table in the numbers', () => {
  const base = recs(), q100 = recs(0), life100 = recs(1)

  /** One row of "The same three seconds, three settings", read off a run. */
  const row = (rs: TLRecord[]) => [
    drops(rs, 'queueFull', 'ap').length,
    drops(rs, 'lifetime', 'ap').length,
    drops(rs, 'retryLimit', 'sta-1').length + drops(rs, 'retryLimit', 'sta-2').length,
    delivered(rs)['ap'],
  ]

  it('defaults: 213 turned away, 194 stale at the AP, 123 uploads given up, 2644 delivered', () => {
    expect(row(base)).toEqual([213, 194, 123, 2644])
  })

  it('short queue: 797 turned away, none stale at the AP, the same 123 and 2644', () => {
    expect(row(q100)).toEqual([797, 0, 123, 2644])
  })

  it('short lifetime: nothing turned away, 770 stale at the AP, only 40 uploads given up, still 2644', () => {
    expect(row(life100)).toEqual([0, 770, 40, 2644])
  })

  it('under the short lifetime the two uploaders lose 987 frames to age that the defaults never lose', () => {
    // "the uploaders then lose 987 frames of their own to age"
    const aged = (rs: TLRecord[]) => drops(rs, 'lifetime', 'sta-1').length + drops(rs, 'lifetime', 'sta-2').length
    expect(aged(life100)).toBe(987)
    expect(aged(base)).toBeLessThan(20)
  })
})
