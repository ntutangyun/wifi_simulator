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
  { t: 0, type: 'UWB_ROUND', node: 'tag-1', block: 3, round: 0, slots: 6, slotNs: 2_000_000, method: 'ds', mode: 'twr', untilNs: 12_000_000 },
  { t: 0, type: 'MAC_STATE', node: 'tag-1', state: 'uwbWait' },
  { t: 1_000_000, type: 'UWB_SLOT', node: 'tag-1', slot: 2, untilNs: 6_000_000 },
  { t: 1_000_000, type: 'UWB_TS', node: 'tag-1', dir: 'tx', peer: 'anc-1', frameKind: 'uwbPoll', counter: 1_234_567 },
  { t: 2_000_000, type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ds', tofRctu: 1_234, distM: 5.62, trueDistM: 5.66, fom: 0x16, block: 3, round: 0 },
  { t: 3_000_000, type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ds', tofRctu: 1_240, distM: 5.71, trueDistM: 5.66, fom: 0x16, block: 3, round: 1 },
  { t: 4_000_000, type: 'UWB_POSITION', node: 'tag-1', x: 4.1, y: 3.9, trueX: 4, trueY: 4, gdop: 1.8, ellipse, anchors: ['anc-1', 'anc-2'], block: 3, method: 'twr' },
  { t: 5_000_000, type: 'UWB_TIMEOUT', node: 'tag-1', slot: 3, peer: 'anc-2', expected: 'uwbResp' },
  { t: 6_000_000, type: 'UWB_RANGE', node: 'anc-1', peer: 'tag-1', method: 'ds', tofRctu: 1_240, distM: 5.71, trueDistM: 5.66, fom: 0x16, block: 3, round: 0 },
  { t: 6_000_000, type: 'UWB_ROUND_END', node: 'tag-1', block: 3, round: 0 },
]

describe('the UWB view reducer', () => {
  it('gives every UWB node a lane with its own ranging state', () => {
    const vs = initViewState(uwbScenario())
    expect(Object.keys(vs.nodes)).toEqual(['anc-1', 'anc-2', 'tag-1'])
    const tag = vs.nodes['tag-1']
    expect(tag.acs).toBeNull()
    expect(tag.uwb).toEqual({
      role: 'tag', block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, interfered: 0,
      contend: null, contendCollisions: 0, ranges: {}, tdoa: {}, tdoaRef: null, aoa: {}, position: null,
    })
    expect(vs.nodes['anc-1'].uwb?.role).toBe('anchor')
  })

  it('folds a round of records into the tag’s lane', () => {
    const vs = initViewState(uwbScenario())
    for (const r of seq(RECORDS)) applyRecord(vs, r)
    const n = vs.nodes['tag-1']
    expect(n.state).toBe('uwbWait')
    expect(vs.t).toBe(6_000_000)
    const u = n.uwb!
    expect(u.block).toBe(3)
    expect(u.round).toBe(0)
    // the round ended: the tag is between rounds, radio off, no slot to show
    expect(u.slot).toBeNull()
    expect(u.rounds).toBe(1)
    expect(u.timeouts).toBe(1)
    expect(u.ranges['anc-1'].n).toBe(2)
    expect(u.ranges['anc-1'].distM).toBeCloseTo(5.71, 6)
    expect(u.ranges['anc-1'].trueDistM).toBeCloseTo(5.66, 6)
    expect(u.ranges['anc-1'].method).toBe('ds')
    expect(u.position).toEqual({
      x: 4.1, y: 3.9, trueX: 4, trueY: 4, gdop: 1.8, ellipse, method: 'twr',
      anchors: ['anc-1', 'anc-2'], block: 3, n: 1,
    })
  })

  it('the tag’s slot ticks while the round runs and only UWB_ROUND_END clears it', () => {
    const vs = initViewState(uwbScenario())
    const records = seq(RECORDS)
    const end = records.findIndex((r) => r.type === 'UWB_ROUND_END')
    expect(end).toBeGreaterThan(0)
    for (const r of records.slice(0, end)) applyRecord(vs, r)
    expect(vs.nodes['tag-1'].uwb!.slot).toBe(2)
    applyRecord(vs, records[end])
    expect(vs.nodes['tag-1'].uwb!.slot).toBeNull()
    expect(vs.nodes['tag-1'].uwb!.rounds).toBe(1)
  })

  it('an anchor takes its block and round from its own ranges, not from the tag’s records', () => {
    const vs = initViewState(uwbScenario())
    for (const r of seq(RECORDS)) applyRecord(vs, r)
    const a1 = vs.nodes['anc-1'].uwb!
    expect(a1.block).toBe(3)
    expect(a1.round).toBe(0)
    expect(a1.slot).toBeNull()
    expect(a1.ranges['tag-1'].n).toBe(1)
    // anc-2 took part in nothing of its own: untouched by the tag's records
    expect(vs.nodes['anc-2'].uwb).toEqual({
      role: 'anchor', block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, interfered: 0,
      contend: null, contendCollisions: 0, ranges: {}, tdoa: {}, tdoaRef: null, aoa: {}, position: null,
    })
  })

  it('keeps the anchor’s latest contention draw and counts the tag’s lost slots', () => {
    const vs = initViewState(uwbScenario())
    const contention: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_CONTEND', node: 'anc-1', slot: 3, attempt: 1 },
      { t: 1_000_100, type: 'UWB_CONTEND', node: 'anc-2', slot: 3, attempt: 2 },
      { t: 1_500_000, type: 'UWB_CONTEND_COLLISION', node: 'tag-1', slot: 3 },
      { t: 2_000_000, type: 'UWB_CONTEND', node: 'anc-1', slot: null, attempt: 0 },
      { t: 2_500_000, type: 'UWB_CONTEND_COLLISION', node: 'tag-1', slot: 5 },
    ]
    for (const r of seq(contention)) applyRecord(vs, r)
    // An anchor sees no UWB_ROUND_END, so its row is the last draw it made — here the
    // round it is sitting out, which is a slot of null and no attempt.
    expect(vs.nodes['anc-1'].uwb!.contend).toEqual({ slot: null, attempt: 0 })
    expect(vs.nodes['anc-2'].uwb!.contend).toEqual({ slot: 3, attempt: 2 })
    // The collisions belong to the tag that lost the answers, not to the anchors.
    expect(vs.nodes['tag-1'].uwb!.contendCollisions).toBe(2)
    expect(vs.nodes['tag-1'].uwb!.contend).toBeNull()
    expect(vs.nodes['anc-1'].uwb!.contendCollisions).toBe(0)
  })

  it('keeps the latest time difference per peer, all against the same reference', () => {
    const vs = initViewState(uwbScenario())
    const listening: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_TDOA', node: 'tag-1', ref: 'anc-1', peer: 'anc-2', dtNs: 12.5, trueDtNs: 12.1, block: 0, round: 0 },
      { t: 1_000_100, type: 'UWB_TDOA', node: 'tag-1', ref: 'anc-1', peer: 'anc-2', dtNs: 12.9, trueDtNs: 12.1, block: 1, round: 0 },
      { t: 1_000_200, type: 'UWB_TDOA', node: 'tag-1', ref: 'anc-1', peer: 'anc-3', dtNs: -4.2, trueDtNs: -4, block: 1, round: 0 },
    ]
    for (const r of seq(listening)) applyRecord(vs, r)
    const u = vs.nodes['tag-1'].uwb!
    // One row per peer, counting the rounds it has been measured in — the reference anchor
    // itself never has a row, because it is what everything else is differenced against.
    expect(u.tdoa).toEqual({
      'anc-2': { dtNs: 12.9, trueDtNs: 12.1, n: 2 },
      'anc-3': { dtNs: -4.2, trueDtNs: -4, n: 1 },
    })
    // the anchor every row is against, carried once beside the map so the panel can name it
    expect(u.tdoaRef).toBe('anc-1')
    expect(u.ranges).toEqual({}) // a listening tag measures no distances at all
    expect(vs.nodes['anc-1'].uwb!.tdoa).toEqual({})
    expect(vs.nodes['anc-1'].uwb!.tdoaRef).toBeNull()
  })

  it('remembers what solved a fix, so the panel can say two-way or one-way', () => {
    const vs = initViewState(uwbScenario())
    const fixes: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_POSITION', node: 'tag-1', x: 4.1, y: 3.9, trueX: 4, trueY: 4, gdop: 1.8, ellipse, anchors: ['anc-1', 'anc-2'], block: 0, method: 'twr' },
      { t: 2_000_000, type: 'UWB_POSITION', node: 'tag-1', x: 4.2, y: 3.8, trueX: 4, trueY: 4, gdop: 0.9, ellipse, anchors: ['anc-1', 'anc-2'], block: 1, method: 'dl-tdoa' },
    ]
    for (const r of seq(fixes)) applyRecord(vs, r)
    const p = vs.nodes['tag-1'].uwb!.position!
    expect(p.method).toBe('dl-tdoa')
    expect(p.n).toBe(2)
  })

  it('puts a measurement about another node on that node’s lane (UL-TDoA’s `of`)', () => {
    const vs = initViewState(uwbScenario())
    // The reference anchor emits both records, and both are about the tag that blinked: the
    // lane a reader opens for the tag's position is the tag's, not the anchor's.
    const infra: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_TDOA', node: 'anc-1', ref: 'anc-1', peer: 'anc-2', dtNs: 3.5, trueDtNs: 3.4, block: 0, round: 0, of: 'tag-1' },
      { t: 1_000_100, type: 'UWB_POSITION', node: 'anc-1', x: 4.1, y: 3.9, trueX: 4, trueY: 4, gdop: 0.9, ellipse, anchors: ['anc-1', 'anc-2'], block: 0, method: 'ul-tdoa', of: 'tag-1' },
    ]
    for (const r of seq(infra)) applyRecord(vs, r)
    const tag = vs.nodes['tag-1'].uwb!
    expect(tag.tdoa).toEqual({ 'anc-2': { dtNs: 3.5, trueDtNs: 3.4, n: 1 } })
    expect(tag.position?.method).toBe('ul-tdoa')
    expect(tag.position?.n).toBe(1)
    // The anchor that did the arithmetic keeps a clean lane: it is not the subject of either.
    const anchor = vs.nodes['anc-1'].uwb!
    expect(anchor.tdoa).toEqual({})
    expect(anchor.position).toBeNull()
  })

  it('keeps each anchor’s own bearings on its own lane, and the fix they solve on the tag’s', () => {
    const vs = initViewState(uwbScenario())
    const bearings: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_AOA', node: 'anc-1', peer: 'tag-1', thetaDeg: 41.6, trueThetaDeg: 45, block: 4, round: 0 },
      { t: 1_100_000, type: 'UWB_AOA', node: 'anc-1', peer: 'tag-1', thetaDeg: 45.4, trueThetaDeg: 45, block: 4, round: 0 },
      { t: 1_200_000, type: 'UWB_AOA', node: 'anc-2', peer: 'tag-1', thetaDeg: -12.1, trueThetaDeg: -10, block: 4, round: 0 },
      {
        t: 1_300_000, type: 'UWB_POSITION', node: 'anc-1', x: 4.1, y: 3.9, trueX: 4, trueY: 4,
        gdop: 1, ellipse, anchors: ['anc-1'], block: 4, method: 'aoa', of: 'tag-1',
      },
    ]
    for (const r of seq(bearings)) applyRecord(vs, r)
    const a1 = vs.nodes['anc-1'].uwb!
    // One row per peer, the latest reading, counting every frame it was measured on — and the
    // anchor's block and round come from them, as they do from its ranges.
    expect(a1.aoa).toEqual({ 'tag-1': { thetaDeg: 45.4, trueThetaDeg: 45, n: 2 } })
    expect(a1.block).toBe(4)
    expect(vs.nodes['anc-2'].uwb!.aoa).toEqual({ 'tag-1': { thetaDeg: -12.1, trueThetaDeg: -10, n: 1 } })
    // The bearing belongs to the anchor; the position it helped solve belongs to the tag.
    expect(a1.position).toBeNull()
    const tag = vs.nodes['tag-1'].uwb!
    expect(tag.aoa).toEqual({})
    expect(tag.position?.method).toBe('aoa')
    expect(tag.position?.anchors).toEqual(['anc-1'])
    expect(tag.position?.gdop).toBe(1)
  })

  it('counts a frame lost to Wi-Fi at the receiver that lost it', () => {
    const vs = initViewState(uwbScenario())
    const lost: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_INTERFERED', node: 'anc-1', from: 'tag-1', foreignDbm: -42.2, sirDb: -34.5 },
      { t: 2_000_000, type: 'UWB_INTERFERED', node: 'anc-1', from: 'tag-1', foreignDbm: -41.0, sirDb: -33.3 },
    ]
    for (const r of seq(lost)) applyRecord(vs, r)
    expect(vs.nodes['anc-1'].uwb!.interfered).toBe(2)
    // It is the receiver's counter, not the transmitter's, and nothing else moved.
    expect(vs.nodes['tag-1'].uwb!.interfered).toBe(0)
    expect(vs.nodes['anc-1'].uwb!.timeouts).toBe(0)
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
