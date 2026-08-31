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

  it('cloneView is independent of the original', () => {
    const vs = initViewState(defaultScenario())
    const c = cloneView(vs)
    c.nodes['sta-1'].cw = 1023
    expect(vs.nodes['sta-1'].cw).toBe(15)
  })
})
