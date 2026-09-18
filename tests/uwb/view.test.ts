import { describe, it, expect } from 'vitest'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { applyRecord, cloneView, initViewState } from '../../src/model/view'
import { DEFAULT_UWB_SESSION, nonht, type NodeCfg, type Scenario } from '../../src/model/scenario'

function uwbNode(id: string, role: 'anchor' | 'tag', x: number, y: number): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: -14,
    profiles: ['idle'], caps: { ...nonht }, uwb: { role },
  }
}

function uwbScenario(): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Hall' }],
    walls: [],
    nodes: [uwbNode('anc-1', 'anchor', 0, 0), uwbNode('anc-2', 'anchor', 8, 0), uwbNode('tag-1', 'tag', 4, 4)],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION },
  }
}

function seq(recs: Parameters<EmitFn>[0][]): TLRecord[] {
  const out: TLRecord[] = []
  const emit = makeEmitter((r) => out.push(r))
  recs.forEach(emit)
  return out
}

const ellipse = { a: 0.12, b: 0.07, thetaRad: 0.4 }

const RECORDS: Parameters<EmitFn>[0][] = [
  { t: 0, type: 'UWB_ROUND', node: 'tag-1', block: 3, round: 0, slots: 6, slotNs: 2_000_000, method: 'ds', untilNs: 12_000_000 },
  { t: 0, type: 'MAC_STATE', node: 'tag-1', state: 'uwbWait' },
  { t: 1_000_000, type: 'UWB_SLOT', node: 'tag-1', slot: 2, untilNs: 6_000_000 },
  { t: 1_000_000, type: 'UWB_TS', node: 'tag-1', dir: 'tx', peer: 'anc-1', frameKind: 'uwbPoll', counter: 1_234_567 },
  { t: 2_000_000, type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ds', tofRctu: 1_234, distM: 5.62, trueDistM: 5.66, fom: 0x16, block: 3, round: 0 },
  { t: 3_000_000, type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ds', tofRctu: 1_240, distM: 5.71, trueDistM: 5.66, fom: 0x16, block: 3, round: 1 },
  { t: 4_000_000, type: 'UWB_POSITION', node: 'tag-1', x: 4.1, y: 3.9, trueX: 4, trueY: 4, gdop: 1.8, ellipse, anchors: ['anc-1', 'anc-2'], block: 3 },
  { t: 5_000_000, type: 'UWB_TIMEOUT', node: 'tag-1', slot: 3, peer: 'anc-2', expected: 'uwbResp' },
]

describe('the UWB view reducer', () => {
  it('gives every UWB node a lane with its own ranging state', () => {
    const vs = initViewState(uwbScenario())
    expect(Object.keys(vs.nodes)).toEqual(['anc-1', 'anc-2', 'tag-1'])
    const tag = vs.nodes['tag-1']
    expect(tag.acs).toBeNull()
    expect(tag.uwb).toEqual({
      role: 'tag', block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, ranges: {}, position: null,
    })
    expect(vs.nodes['anc-1'].uwb?.role).toBe('anchor')
  })

  it('folds a round of records into the tag’s lane', () => {
    const vs = initViewState(uwbScenario())
    for (const r of seq(RECORDS)) applyRecord(vs, r)
    const n = vs.nodes['tag-1']
    expect(n.state).toBe('uwbWait')
    expect(vs.t).toBe(5_000_000)
    const u = n.uwb!
    expect(u.block).toBe(3)
    expect(u.round).toBe(0)
    expect(u.slot).toBe(2)
    expect(u.rounds).toBe(1)
    expect(u.timeouts).toBe(1)
    expect(u.ranges['anc-1'].n).toBe(2)
    expect(u.ranges['anc-1'].distM).toBeCloseTo(5.71, 6)
    expect(u.ranges['anc-1'].trueDistM).toBeCloseTo(5.66, 6)
    expect(u.ranges['anc-1'].method).toBe('ds')
    expect(u.position).toEqual({ x: 4.1, y: 3.9, trueX: 4, trueY: 4, gdop: 1.8, ellipse, n: 1 })
  })

  it('leaves the anchors’ lanes untouched by the tag’s records', () => {
    const vs = initViewState(uwbScenario())
    for (const r of seq(RECORDS)) applyRecord(vs, r)
    expect(vs.nodes['anc-1'].uwb).toEqual({
      role: 'anchor', block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, ranges: {}, position: null,
    })
  })

  it('snapshot + replay equals the live view (the reducer is the single source of truth)', () => {
    const records = seq(RECORDS)
    const mid = Math.floor(records.length / 2)
    const live = initViewState(uwbScenario())
    let snap: ReturnType<typeof cloneView> | null = null
    records.forEach((r, i) => {
      if (i === mid) snap = cloneView(live)
      applyRecord(live, r)
    })
    expect(snap).not.toBeNull()
    const replayed = snap!
    for (const r of records.slice(mid)) applyRecord(replayed, r)
    expect(replayed).toEqual(live)
  })
})
