import { describe, it, expect } from 'vitest'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { applyRecord, cloneView, initViewState } from '../../src/model/view'
import { defaultScenario } from '../../src/model/scenario'

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
