import { describe, it, expect } from 'vitest'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { applyRecord, cloneView, initViewState } from '../../src/model/view'
import { defaultScenario } from '../../src/model/scenario'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'

const frame: FrameDesc = {
  kind: 'data', src: 'sta-1', dst: 'ap', bytes: 1428, mbps: 54,
  durationFieldNs: 60_000, txTimeNs: 232_000, seqNo: 0, msduId: 5,
}

function seq(recs: Parameters<EmitFn>[0][]): TLRecord[] {
  const out: TLRecord[] = []
  const emit = makeEmitter((r) => out.push(r))
  recs.forEach(emit)
  return out
}

describe('view reducer', () => {
  it('tracks a full uplink exchange', () => {
    const vs = initViewState(defaultScenario())
    const records = seq([
      { t: 0, type: 'ENQUEUE', node: 'sta-1', msduId: 5, bytes: 1400, dst: 'ap', depth: 1 },
      { t: 0, type: 'MAC_STATE', node: 'sta-1', state: 'defer' },
      { t: 0, type: 'IFS_START', node: 'sta-1', kind: 'DIFS', untilNs: 34_000 },
      { t: 34_000, type: 'IFS_END', node: 'sta-1' },
      { t: 34_000, type: 'BACKOFF_DRAW', node: 'sta-1', value: 3, cw: 15 },
      { t: 43_000, type: 'BACKOFF_DEC', node: 'sta-1', value: 2 },
      { t: 61_000, type: 'BACKOFF_DEC', node: 'sta-1', value: 0 },
      { t: 61_000, type: 'MAC_STATE', node: 'sta-1', state: 'tx' },
      { t: 61_000, type: 'TX_START', node: 'sta-1', frame },
      { t: 61_000, type: 'RX_START', node: 'ap', from: 'sta-1', frame },
      { t: 293_000, type: 'TX_END', node: 'sta-1', frame },
      { t: 293_000, type: 'RX_OK', node: 'ap', from: 'sta-1', frame },
      { t: 293_000, type: 'DEQUEUE', node: 'sta-1', msduId: 5, depth: 0 },
    ])
    for (const r of records) applyRecord(vs, r)
    expect(vs.t).toBe(293_000)
    expect(vs.nodes['sta-1'].queue).toHaveLength(0)
    expect(vs.nodes['sta-1'].state).toBe('tx')
    expect(vs.nodes['sta-1'].stats.airtimeNs).toBe(232_000)
    expect(vs.nodes['sta-1'].stats.txOk).toBe(1)
    expect(vs.nodes['ap'].stats.bytesDelivered).toBe(1400)
    expect(vs.inFlight).toHaveLength(0)
  })

  it('mid-flight state shows the transmission and backoff value', () => {
    const vs = initViewState(defaultScenario())
    const records = seq([
      { t: 34_000, type: 'BACKOFF_DRAW', node: 'sta-1', value: 3, cw: 15 },
      { t: 61_000, type: 'TX_START', node: 'sta-1', frame },
    ])
    for (const r of records) applyRecord(vs, r)
    expect(vs.inFlight).toHaveLength(1)
    expect(vs.inFlight[0]).toMatchObject({ from: 'sta-1', startNs: 61_000, endNs: 293_000 })
    expect(vs.nodes['sta-1'].currentTx).toEqual(frame)
  })

  it('tracks concurrent IFS periods per access category', () => {
    const vs = initViewState(defaultScenario())
    const records = seq([
      { t: 0, type: 'IFS_START', node: 'sta-1', kind: 'AIFS', untilNs: 35_000, ac: 3 },
      { t: 1_000, type: 'IFS_START', node: 'sta-1', kind: 'AIFS', untilNs: 80_000, ac: 0 },
    ])
    for (const r of records) applyRecord(vs, r)
    const n = vs.nodes['sta-1']
    expect(n.acs![3].ifs).toEqual({ kind: 'AIFS', untilNs: 35_000 })
    expect(n.acs![0].ifs).toEqual({ kind: 'AIFS', untilNs: 80_000 })
    // the node-level summary is the earliest-expiring active IFS…
    expect(n.ifs).toEqual({ kind: 'AIFS', untilNs: 35_000, ac: 3 })
    // …and one AC ending must not hide the other, still-running one
    applyRecord(vs, seq([{ t: 35_000, type: 'IFS_END', node: 'sta-1', ac: 3 }])[0])
    expect(n.acs![3].ifs).toBeNull()
    expect(n.ifs).toEqual({ kind: 'AIFS', untilNs: 80_000, ac: 0 })
  })

  it('clears the per-AC backoff display when the transmission starts', () => {
    const vs = initViewState(defaultScenario())
    const f: FrameDesc = { ...frame, ac: 2 }
    const records = seq([
      { t: 0, type: 'BACKOFF_DRAW', node: 'sta-1', value: 0, cw: 15, ac: 2 },
      { t: 0, type: 'TX_START', node: 'sta-1', frame: f },
    ])
    for (const r of records) applyRecord(vs, r)
    expect(vs.nodes['sta-1'].backoff).toBeNull()
    expect(vs.nodes['sta-1'].acs![2].backoff).toBeNull()
  })

  it('does not double-count a retransmission whose first copy arrived (lost ACK)', () => {
    const vs = initViewState(defaultScenario())
    const retry: FrameDesc = { ...frame, retryFlag: true }
    const records = seq([
      { t: 293_000, type: 'RX_OK', node: 'ap', from: 'sta-1', frame },
      // ACK lost → sender retransmits the same seqNo; the receiver must
      // recognize the duplicate (§10.3.2.11) and not count it again.
      { t: 600_000, type: 'RX_OK', node: 'ap', from: 'sta-1', frame: retry },
    ])
    for (const r of records) applyRecord(vs, r)
    expect(vs.nodes['sta-1'].stats.txOk).toBe(1)
    expect(vs.nodes['ap'].stats.bytesDelivered).toBe(1400)
  })

  it('cloneView is independent of the original', () => {
    const vs = initViewState(defaultScenario())
    const c = cloneView(vs)
    c.nodes['sta-1'].cw = 1023
    expect(vs.nodes['sta-1'].cw).toBe(15)
  })
})

describe('an interrupted IFS is not shown as still running', () => {
  // The MAC cancels every pending IFS when CCA goes busy or a NAV is set
  // (§10.3.4.2: the wait is a deferral, not a completion), and emits no
  // IFS_END for it. The view must drop the IFS on those records, or the 3D
  // label and inspector keep showing "AIFS 0 µs" while the node is in fact
  // held by NAV.
  it('CCA_BUSY clears a legacy node’s pending IFS', () => {
    const vs = initViewState(defaultScenario())
    for (const r of seq([
      { t: 0, type: 'IFS_START', node: 'sta-1', kind: 'DIFS', untilNs: 34_000 },
      { t: 10_000, type: 'CCA_BUSY', node: 'sta-1', cause: 'preamble' },
    ])) applyRecord(vs, r)
    expect(vs.nodes['sta-1'].ifs).toBeNull()
  })

  it('NAV_SET clears every access category’s pending IFS', () => {
    const vs = initViewState(defaultScenario())
    for (const r of seq([
      { t: 0, type: 'IFS_START', node: 'sta-1', kind: 'AIFS', untilNs: 35_000, ac: 3 },
      { t: 0, type: 'IFS_START', node: 'sta-1', kind: 'AIFS', untilNs: 80_000, ac: 0 },
      { t: 10_000, type: 'NAV_SET', node: 'sta-1', untilNs: 300_000, source: 'data:sta-2' },
    ])) applyRecord(vs, r)
    const n = vs.nodes['sta-1']
    expect(n.acs![3].ifs).toBeNull()
    expect(n.acs![0].ifs).toBeNull()
    expect(n.ifs).toBeNull()
    expect(n.navUntilNs).toBe(300_000)
  })

  it('lesson 7: the view never holds an IFS whose deadline has already passed', () => {
    // Regression for the Backup station reading "AIFS 0 µs" while under NAV:
    // an IFS the MAC cancelled (CCA busy / NAV set) must not linger in the
    // view past its own deadline. Checked at every record over 60 ms.
    const lesson = LESSONS.find((l) => l.id === 'edca')!
    const sim = new Simulation(lesson.scenario())
    const vs = initViewState(lesson.scenario())
    let stale = 0
    for (const r of sim.runUntil(60_000_000).records) {
      applyRecord(vs, r)
      for (const [id, n] of Object.entries(vs.nodes)) {
        if (n.ifs && n.ifs.untilNs < r.t) stale++
        for (const a of n.acs ?? []) if (a.ifs && a.ifs.untilNs < r.t) stale++
        if (stale) throw new Error(`${id} holds an expired IFS at t=${r.t}`)
      }
    }
    expect(stale).toBe(0)
  })
})

describe('queue view: the AC table and the queue list agree', () => {
  const vi: FrameDesc = {
    kind: 'data', src: 'ap', dst: 'sta-1', bytes: 1430, mbps: 78,
    durationFieldNs: 44_000, txTimeNs: 188_000, seqNo: 0, msduId: 1, ac: 2,
  }

  it('counts a frame in flight as queued until it is acknowledged, and marks it', () => {
    const vs = initViewState(defaultScenario())
    // engine depth excludes the claimed frame: both ENQUEUEs say depth 1
    const records = seq([
      { t: 0, type: 'ENQUEUE', node: 'ap', msduId: 1, bytes: 1400, dst: 'sta-1', depth: 1, ac: 2 },
      { t: 0, type: 'TX_START', node: 'ap', frame: vi },
      { t: 50_000, type: 'ENQUEUE', node: 'ap', msduId: 2, bytes: 1400, dst: 'sta-2', depth: 1, ac: 2 },
    ])
    for (const r of records) applyRecord(vs, r)
    const ap = vs.nodes['ap']
    expect(ap.queue).toHaveLength(2)
    expect(ap.acs![2].queueLen).toBe(2)
    expect(ap.queue[0].inFlight).toBe(true)
    expect(ap.queue[1].inFlight).toBe(false)

    // a failed attempt puts it back: no longer in flight, still queued
    applyRecord(vs, seq([{ t: 250_000, type: 'RETRY', node: 'ap', msduId: 1, src: 1, lrc: 0, ssrc: 1, slrc: 0, ac: 2 }])[0])
    expect(ap.queue[0].inFlight).toBe(false)
    expect(ap.acs![2].queueLen).toBe(2)

    // delivery removes it from both
    applyRecord(vs, seq([{ t: 500_000, type: 'DEQUEUE', node: 'ap', msduId: 1, depth: 1, ac: 2 }])[0])
    expect(ap.queue).toHaveLength(1)
    expect(ap.acs![2].queueLen).toBe(1)
  })

  it('lesson 9 AP at t = 943 111 ns: AC_VI count equals the listed queue', () => {
    const l = LESSONS.find((x) => x.id === 'txop')!
    const sc = l.scenario()
    const vs = initViewState(sc)
    for (const r of new Simulation(sc).runUntil(1_000_000).records) {
      if (r.t > 943_111) break
      applyRecord(vs, r)
    }
    const ap = vs.nodes['ap']
    expect(ap.queue).toHaveLength(2)
    expect(ap.acs![2].queueLen).toBe(2)
    expect(ap.queue.filter((m) => m.inFlight).map((m) => m.dst)).toEqual(['sta-2'])
  })

  it('every EDCA node, at every record: per-AC counts sum to the listed queue (lessons 9, 13)', () => {
    for (const id of ['txop', 'mlo']) {
      const sc = LESSONS.find((x) => x.id === id)!.scenario()
      const vs = initViewState(sc)
      for (const r of new Simulation(sc).runUntil(150_000_000).records) {
        applyRecord(vs, r)
        for (const [vid, n] of Object.entries(vs.nodes)) {
          if (!n.acs) continue
          // MLO: the list lives on the primary link's node; both links' tables mirror it
          const holder = vid.includes('#6g') && vs.nodes[vid.replace('#6g', '')] ? vs.nodes[vid.replace('#6g', '')] : n
          const sum = n.acs.reduce((s, a) => s + a.queueLen, 0)
          expect(sum, `${id} ${vid} @${r.t}`).toBe(holder.queue.length)
        }
      }
    }
  })
})
