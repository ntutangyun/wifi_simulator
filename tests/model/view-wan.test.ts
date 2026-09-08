import { describe, it, expect } from 'vitest'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { applyRecord, initViewState } from '../../src/model/view'
import { defaultScenario } from '../../src/model/scenario'

function seq(recs: Parameters<EmitFn>[0][]): TLRecord[] {
  const out: TLRecord[] = []
  const emit = makeEmitter((r) => out.push(r))
  recs.forEach(emit)
  return out
}

describe('cloud servers in the view', () => {
  it('starts with the scenario’s servers and zero traffic on each', () => {
    const vs = initViewState(defaultScenario())
    expect(Object.keys(vs.servers).sort()).toEqual(['srv-call', 'srv-game', 'srv-video', 'srv-web'])
    expect(vs.servers['srv-game']).toEqual({ bytesUp: 0, bytesDown: 0 })
    expect(vs.wan).toEqual([])
  })

  it('WAN records become flights on the AP–server line and count bytes', () => {
    const vs = initViewState(defaultScenario())
    for (const r of seq([
      { t: 1_000_000, type: 'WAN_TX', server: 'srv-game', msduId: 9, bytes: 300, to: 'sta-1', arriveNs: 13_500_000 },
      { t: 12_000_000, type: 'WAN_RX', server: 'srv-game', msduId: 4, bytes: 100, from: 'sta-1', sentNs: 5_000_000 },
    ])) applyRecord(vs, r)
    expect(vs.wan).toEqual([
      { server: 'srv-game', dir: 'down', peer: 'sta-1', startNs: 1_000_000, endNs: 13_500_000 },
      { server: 'srv-game', dir: 'up', peer: 'sta-1', startNs: 5_000_000, endNs: 12_000_000 },
    ])
    expect(vs.servers['srv-game']).toEqual({ bytesUp: 100, bytesDown: 300 })
  })

  it('finished flights are dropped once time passes their end', () => {
    const vs = initViewState(defaultScenario())
    for (const r of seq([
      { t: 1_000_000, type: 'WAN_TX', server: 'srv-game', msduId: 9, bytes: 300, to: 'sta-1', arriveNs: 13_500_000 },
      { t: 14_000_000, type: 'CCA_IDLE', node: 'ap' },
    ])) applyRecord(vs, r)
    expect(vs.wan).toEqual([])
  })

  it('delivering a reply frame credits the client with the application round trip', () => {
    const vs = initViewState(defaultScenario())
    for (const r of seq([
      { t: 40_000_000, type: 'ENQUEUE', node: 'ap', msduId: 9, bytes: 300, dst: 'sta-1', depth: 1, ac: 2, server: 'srv-game', rttFromNs: 10_000_000 },
      { t: 43_000_000, type: 'DEQUEUE', node: 'ap', msduId: 9, depth: 0, ac: 2 },
      { t: 50_000_000, type: 'ENQUEUE', node: 'ap', msduId: 10, bytes: 300, dst: 'sta-1', depth: 1, ac: 2, server: 'srv-game' },
      { t: 52_000_000, type: 'DEQUEUE', node: 'ap', msduId: 10, depth: 0, ac: 2 },
    ])) applyRecord(vs, r)
    const sta = vs.nodes['sta-1'].stats
    expect(sta.appRtt).toEqual({ n: 1, sumNs: 33_000_000, maxNs: 33_000_000 })
    expect(sta.appRttServer).toBe('srv-game')
    expect(vs.nodes['ap'].stats.appRtt.n).toBe(0)
    // the plain state update (no rttFromNs) still counts as Wi-Fi latency only
    expect(sta.rxLatency.n).toBe(2)
  })
})
