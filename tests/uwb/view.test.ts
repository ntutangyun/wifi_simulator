import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { applyRecord, cloneView, initViewState } from '../../src/model/view'
import { makeNbPoll } from '../../src/uwb/frames'
import type { UwbRecord } from '../../src/uwb/records'
import { STRINGS } from '../../src/ui/i18n'
import { UwbInspector } from '../../src/uwb/ui/UwbInspector'
import { applyUwbRecord, uwbTrainKey } from '../../src/uwb/view'
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
      role: 'tag', block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, rmnr: 0, mmrcm: 0,
      sp3: 0, sp3Reports: 0, interfered: 0,
      contend: null, contendCollisions: 0, ranges: {}, tdoa: {}, tdoaRef: null, aoa: {},
      mms: { trains: {}, nbChannel: null, lbtBusy: 0, skippedBlocks: 0, lastLbtBlock: null },
      position: null,
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

  it('counts a UWB_RMNR frame at the initiator, alongside (not instead of) a timeout from a different peer', () => {
    // Task 5: `UwbNodeView.rmnr` exists so the inspector can show where a round went once `rmnr`
    // takes it out of `timeouts` (view.ts's own comment on the field) — this pins the increment
    // the reducer's `case 'UWB_RMNR'` does, which nothing exercised end to end before this task.
    const vs = initViewState(uwbScenario())
    const withRmnr: Parameters<EmitFn>[0][] = [
      ...RECORDS,
      { t: 7_000_000, type: 'UWB_RMNR', node: 'tag-1', peer: 'anc-2', slot: 3, block: 4, round: 0 },
    ]
    for (const r of seq(withRmnr)) applyRecord(vs, r)
    const u = vs.nodes['tag-1'].uwb!
    expect(u.rmnr).toBe(1)
    // The one UWB_TIMEOUT already in RECORDS (anc-2, an earlier round) is untouched: the two
    // counters are independent tallies, not one state that flips from one into the other.
    expect(u.timeouts).toBe(1)
  })

  it('counts a UWB_MMRCM frame at the initiator, and claims the record so it never reaches the Wi-Fi reducer', () => {
    // Task 3 of the receipt-confirmation slice. `applyUwbRecord` ends in `default: return false`, so
    // a missing `case 'UWB_MMRCM'` is invisible to both `tsc -b` and grep — the record would simply
    // never reach a lane, and the counter would sit at zero for a session that was confirming
    // happily. Both halves are pinned: the increment, and the `true` that says the record was
    // handled here.
    const vs = initViewState(uwbScenario())
    const confirmation: Parameters<EmitFn>[0] = {
      t: 8_000_000, type: 'UWB_MMRCM', node: 'tag-1', peer: 'anc-2', slot: 6, block: 3, round: 0,
      windowRounds: 4, received: [true, false, true, true], initiators: 1,
    }
    for (const r of seq([...RECORDS, confirmation])) applyRecord(vs, r)
    const u = vs.nodes['tag-1'].uwb!
    expect(u.mmrcm).toBe(1)
    // …and it is a tally of its own: a confirmation neither adds to nor cancels a timeout.
    expect(u.timeouts).toBe(1)
    expect(u.rmnr).toBe(0)
    expect(applyUwbRecord(initViewState(uwbScenario()), { ...confirmation, seq: 0 })).toBe(true)
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
      role: 'anchor', block: 0, round: 0, slot: null, rounds: 0, timeouts: 0, rmnr: 0, mmrcm: 0,
      sp3: 0, sp3Reports: 0, interfered: 0,
      contend: null, contendCollisions: 0, ranges: {}, tdoa: {}, tdoaRef: null, aoa: {},
      mms: { trains: {}, nbChannel: null, lbtBusy: 0, skippedBlocks: 0, lastLbtBlock: null },
      position: null,
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

/** A fresh view of the scene above, and a helper that folds bare records into it. */
function fresh() {
  return initViewState(uwbScenario())
}

/** A record without its timeline stamp; distributive, so each member keeps its own shape. */
type Bare<T> = T extends unknown ? Omit<T, 't'> : never

function apply(vs: ReturnType<typeof fresh>, recs: Bare<Parameters<EmitFn>[0]>[]): void {
  for (const r of seq(recs.map((x) => ({ ...x, t: 0 } as Parameters<EmitFn>[0])))) applyRecord(vs, r)
}

// --- P802.15.4ab -----------------------------------------------------------------

describe('the MMS half of a node view', () => {
  it('keeps the latest train per peer and kind, and the range’s integrity flag beside it', () => {
    const vs = fresh()
    apply(vs, [
      {
        type: 'UWB_MMS_TRAIN', node: 'tag-1', peer: 'anc-1', kind: 'rsf', fragments: 8, heard: 8,
        rxDbm: -100.26, gainDb: 9.03, marginDb: 1.77, detected: true, ratioPpm: -20.03,
        block: 0, round: 0,
      },
      {
        type: 'UWB_MMS_TRAIN', node: 'tag-1', peer: 'anc-1', kind: 'rif', fragments: 2, heard: 0,
        rxDbm: -999, gainDb: 0, marginDb: -999, detected: false, ratioPpm: null, block: 0, round: 0,
      },
      {
        type: 'UWB_MMS_TRAIN', node: 'tag-1', peer: 'anc-2', kind: 'rif', fragments: 2, heard: 0,
        rxDbm: -999, gainDb: 0, marginDb: -999, detected: false, ratioPpm: null, block: 0, round: 1,
      },
      {
        type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ss', tofRctu: 900,
        distM: 4.24, trueDistM: 4.24, fom: 0x16, block: 0, round: 0, integrity: false,
      },
    ])
    const u = vs.nodes['tag-1'].uwb!
    // The integrity train of the same peer landed after it and did not overwrite it: the row
    // the range was actually made on is still there, margin and all.
    expect(u.mms.trains[uwbTrainKey('anc-1', 'rsf')]).toEqual({
      peer: 'anc-1', kind: 'rsf', fragments: 8, heard: 8, marginDb: 1.77, detected: true, ratioPpm: -20.03,
    })
    expect(Object.keys(u.mms.trains)).toEqual(['anc-1:rsf', 'anc-1:rif', 'anc-2:rif'])
    // Nothing heard: the record's sentinel is carried through unchanged, and the rows module
    // is what turns it into a dash.
    expect(u.mms.trains[uwbTrainKey('anc-2', 'rif')].marginDb).toBe(-999)
    expect(u.mms.trains[uwbTrainKey('anc-2', 'rif')].ratioPpm).toBeNull()
    expect(u.ranges['anc-1'].integrity).toBe(false)
    // A 4z range has no flag at all, not a false one.
    apply(vs, [{
      type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-3', method: 'ds', tofRctu: 900,
      distM: 4.24, trueDistM: 4.24, fom: 0x16, block: 0, round: 2,
    }])
    expect('integrity' in vs.nodes['tag-1'].uwb!.ranges['anc-3']).toBe(false)
  })

  it('counts a busy listen-before-talk check, and the block it cost', () => {
    const lbt = (block: number, round: number) => ({
      type: 'UWB_NB_LBT' as const, node: 'tag-1', channel: 3,
      foreignDbm: -41.9, thresholdDbm: -71.02, block, round,
    })
    const vs = fresh()
    apply(vs, [lbt(0, 0), lbt(1, 0)])
    const u = vs.nodes['tag-1'].uwb!
    expect(u.mms.lbtBusy).toBe(2)
    expect(u.mms.skippedBlocks).toBe(2)
    // It is the transmitter's own record: the anchor learns nothing from it.
    expect(vs.nodes['anc-1'].uwb!.mms.lbtBusy).toBe(0)
  })

  it('counts blocks, not checks: a second busy check inside one block costs no second block', () => {
    // The device stops checking for the rest of a block it found busy, so this is not what the
    // engine produces today — but the two counters mean different things and must not quietly
    // become one number if that ever changes.
    const lbt = (block: number, round: number) => ({
      type: 'UWB_NB_LBT' as const, node: 'tag-1', channel: 3,
      foreignDbm: -41.9, thresholdDbm: -71.02, block, round,
    })
    const vs = fresh()
    apply(vs, [lbt(0, 0), lbt(0, 1), lbt(0, 2), lbt(3, 0)])
    const u = vs.nodes['tag-1'].uwb!
    expect(u.mms.lbtBusy).toBe(4)
    expect(u.mms.skippedBlocks).toBe(2)
    expect(u.mms.lastLbtBlock).toBe(3)
  })

  it('takes the narrowband channel from the frames themselves, at both ends', () => {
    const vs = fresh()
    const poll = makeNbPoll('tag-1', 'anc-1', 37, 0, 0)
    apply(vs, [
      { type: 'TX_START', node: 'tag-1', frame: poll },
      { type: 'RX_OK', node: 'anc-1', from: 'tag-1', frame: poll },
    ])
    expect(vs.nodes['tag-1'].uwb!.mms.nbChannel).toBe(37)
    expect(vs.nodes['anc-1'].uwb!.mms.nbChannel).toBe(37)
    // …and the Wi-Fi reducer still owns those two records: the transmission is in flight.
    expect(vs.nodes['tag-1'].currentTx).toBe(poll)
  })
})

/**
 * **The structure `tsc -b` cannot index, and grep cannot audit.**
 *
 * `applyUwbRecord` is a `switch` on `TLRecord['type']` that ends in `default: return false`, so a
 * record type with no `case` compiles, greps clean, and is silently dropped: the record never
 * reaches a lane, its counter sits at zero for a session that is busy producing it, and `applyRecord`
 * hands it on to the Wi-Fi reducer, which does not want it either. This branch tracks three
 * structures with that property — `i18n.ts`'s `tooltips`, `laneLayout.ts`'s `spanTooltip` chain, and
 * this reducer. The first two are held by the `it.each(FRAME_KINDS)` in `tests/ui/laneLayout.test.ts`;
 * this one was not held at all, which is `branch-review.md`'s C4: `UWB_MMRCM` was pinned by hand,
 * `UWB_SP3` and `UWB_SP3_REPORT` were not, and deleting both of their `case` arms broke no test.
 *
 * This is that test, held the same way. `SAMPLES` is a mapped type over the record union, so
 * **adding a record type without adding a sample is a compile error** that names the type, and the
 * `it.each` over its keys then **fails until the reducer handles it**. Two walls, and neither of them
 * is a grep: a new record type has to be turned away deliberately rather than by omission.
 */
describe('applyUwbRecord claims every UWB record type', () => {
  /** One minimal record per type. The mapped type is what makes the list exhaustive and keeps each
   * value's own `type` matching its key — `Record<UwbRecord['type'], UwbRecord>` would allow
   * neither. Field values are the smallest legal thing of each kind; nothing here is asserted
   * about, only that the reducer recognises the record. */
  const SAMPLES: { [T in UwbRecord['type']]: Extract<UwbRecord, { type: T }> } = {
    UWB_ROUND: { type: 'UWB_ROUND', node: 'tag-1', block: 1, round: 0, slots: 4, slotNs: 2_000_000, method: 'ss', mode: 'twr', untilNs: 8_000_000 },
    UWB_SLOT: { type: 'UWB_SLOT', node: 'tag-1', slot: 1, untilNs: 4_000_000 },
    UWB_TS: { type: 'UWB_TS', node: 'tag-1', dir: 'tx', peer: 'anc-1', frameKind: 'uwbPoll', counter: 1_000 },
    UWB_RANGE: { type: 'UWB_RANGE', node: 'tag-1', peer: 'anc-1', method: 'ss', tofRctu: 1_000, distM: 5, trueDistM: 5, fom: 0x16, block: 1, round: 0 },
    UWB_TDOA: { type: 'UWB_TDOA', node: 'tag-1', ref: 'anc-1', peer: 'anc-2', dtNs: 1, trueDtNs: 1, block: 1, round: 0 },
    UWB_AOA: { type: 'UWB_AOA', node: 'anc-1', peer: 'tag-1', thetaDeg: 10, trueThetaDeg: 10, block: 1, round: 0 },
    UWB_POSITION: { type: 'UWB_POSITION', node: 'tag-1', x: 4, y: 4, trueX: 4, trueY: 4, gdop: 1.8, ellipse: { a: 0.1, b: 0.1, thetaRad: 0 }, anchors: ['anc-1', 'anc-2'], block: 1, method: 'twr' },
    UWB_TIMEOUT: { type: 'UWB_TIMEOUT', node: 'tag-1', slot: 2, peer: 'anc-2', expected: 'uwbResp' },
    UWB_RMNR: { type: 'UWB_RMNR', node: 'tag-1', peer: 'anc-2', slot: 2, block: 1, round: 0 },
    UWB_MMRCM: { type: 'UWB_MMRCM', node: 'tag-1', peer: 'anc-2', slot: 5, block: 1, round: 0, windowRounds: 2, received: [true, false], initiators: 1 },
    UWB_SP3: { type: 'UWB_SP3', node: 'tag-1', peer: 'anc-1', slot: 2, block: 1, round: 0 },
    UWB_SP3_REPORT: { type: 'UWB_SP3_REPORT', node: 'tag-1', peer: 'anc-1', slot: 4, block: 1, round: 0 },
    UWB_CONTEND: { type: 'UWB_CONTEND', node: 'anc-1', slot: 2, attempt: 1 },
    UWB_CONTEND_COLLISION: { type: 'UWB_CONTEND_COLLISION', node: 'tag-1', slot: 2 },
    UWB_ROUND_END: { type: 'UWB_ROUND_END', node: 'tag-1', block: 1, round: 0 },
    UWB_NB_LBT: { type: 'UWB_NB_LBT', node: 'tag-1', channel: 0, foreignDbm: -70, thresholdDbm: -80, block: 1, round: 0 },
    UWB_MMS_TRAIN: { type: 'UWB_MMS_TRAIN', node: 'tag-1', peer: 'anc-1', kind: 'rsf', fragments: 4, heard: 4, rxDbm: -80, gainDb: 6, marginDb: 6, detected: true, ratioPpm: null, block: 1, round: 0 },
    UWB_INTERFERED: { type: 'UWB_INTERFERED', node: 'tag-1', from: 'anc-1', foreignDbm: -60, sirDb: -3 },
    UWB_STS_REJECT: { type: 'UWB_STS_REJECT', node: 'anc-1', peer: 'tag-1', frameKind: 'uwbPoll', advanceNs: 20 },
    UWB_ECHO: { type: 'UWB_ECHO', node: 'anc-1', from: 'tag-1', scattererId: 's-1', pathM: 9, propNs: 30, excessM: 1, resolutionM: 0.3, rssiDbm: -90, resolvable: true },
  }

  /**
   * The one record type the reducer turns away on purpose, and the reason, so the `it.each` below
   * is a rule with one written-down exception rather than a rule with a hole.
   *
   * `UWB_STS_REJECT` holds no view state because there is none to hold: the record is emitted *in
   * place of* the `UWB_TS` the receiver did not take (its own doc comment), and the miss is then
   * reported by the slot's own deadline as a `UWB_TIMEOUT` — which this reducer does count. A
   * second counter here would be the same event twice. It reaches the event log and a lesson's
   * `watch` through the record stream, which is where it belongs.
   *
   * Adding a `case` for it is a fine thing to do; this list is then what has to change with it.
   */
  const NOT_VIEW_STATE: readonly UwbRecord['type'][] = ['UWB_STS_REJECT']

  const claims = (r: UwbRecord): boolean =>
    applyUwbRecord(initViewState(uwbScenario()), { ...r, t: 0, seq: 0 } as TLRecord)

  const TYPES = Object.keys(SAMPLES) as UwbRecord['type'][]

  it.each(TYPES.filter((t) => !NOT_VIEW_STATE.includes(t)))('%s reaches the reducer', (type) => {
    expect(claims(SAMPLES[type])).toBe(true)
  })

  it.each(NOT_VIEW_STATE)('%s is turned away deliberately, not by a missing case', (type) => {
    // If this one starts failing, the reducer grew a `case` for it — move the entry out of
    // `NOT_VIEW_STATE` rather than deleting this assertion.
    expect(claims(SAMPLES[type])).toBe(false)
  })

  it('samples every type the union has, so the walk above cannot go stale', () => {
    // The mapped type already makes a missing sample a compile error; this says the same thing at
    // run time, in case the union is ever widened by something `Extract` cannot see.
    expect(TYPES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(TYPES).size).toBe(TYPES.length)
    for (const type of TYPES) expect(SAMPLES[type].type).toBe(type)
  })
})

describe('the two phases of an SP3 round, through the reducer', () => {
  it('counts a marker and a data report at the initiator, and claims both records', () => {
    // branch-review C4: both `case` arms could be deleted without a single test failing, because
    // the only assertions touching these two fields were the initial-state snapshots, which pass
    // either way. Pinned the way `UWB_MMRCM` is — the increment and the `true` — and the pair is
    // pinned together, because the pair is the feature: the ranging phase stops carrying identity
    // and the report phase is what carries it instead.
    const vs = initViewState(uwbScenario())
    const markers: Parameters<EmitFn>[0][] = [
      { t: 7_000_000, type: 'UWB_SP3', node: 'tag-1', peer: 'anc-1', slot: 2, block: 3, round: 0 },
      { t: 7_100_000, type: 'UWB_SP3', node: 'tag-1', peer: 'anc-2', slot: 3, block: 3, round: 0 },
      { t: 8_000_000, type: 'UWB_SP3_REPORT', node: 'tag-1', peer: 'anc-1', slot: 4, block: 3, round: 0, replyRctu: 1_000 },
    ]
    for (const r of seq([...RECORDS, ...markers])) applyRecord(vs, r)
    const u = vs.nodes['tag-1'].uwb!
    expect(u.sp3).toBe(2)
    expect(u.sp3Reports).toBe(1)
    // …and each is a tally of its own: neither a marker nor a report touches the timeout count or
    // the other phase's. The one UWB_TIMEOUT already in RECORDS is untouched.
    expect(u.timeouts).toBe(1)
    expect(u.rmnr).toBe(0)
    // The anchor the markers came from counts nothing: both records are the initiator's.
    expect(vs.nodes['anc-1'].uwb!.sp3).toBe(0)
    expect(vs.nodes['anc-1'].uwb!.sp3Reports).toBe(0)
  })
})

/**
 * `branch-review.md`'s C4 in its other half: `UwbNodeView.sp3` and `sp3Reports` were written by
 * the reducer and read by nothing — no row in `UwbInspector`, no label in `i18n.ts`, no reader
 * anywhere in `src/` — while their own comment in `view.ts` called them "the two phases of
 * §10.32.8.1 made countable". Two counters computed on every SP3 round that nothing could ever
 * observe.
 *
 * This says they have a reader. It asserts against the `STRINGS` entries rather than against any
 * wording, so it holds the *row*, never the sentence — the wording is `docs/course-wording-contract.md`'s
 * business, and the rest of this panel has no test policing it either.
 */
describe('the inspector reads both SP3 counters', () => {
  it('prints a row for each, with its label and its count', () => {
    const vs = initViewState(uwbScenario())
    const rounds: Parameters<EmitFn>[0][] = [
      { t: 1_000_000, type: 'UWB_SP3', node: 'tag-1', peer: 'anc-1', slot: 2, block: 1, round: 0 },
      { t: 1_100_000, type: 'UWB_SP3', node: 'tag-1', peer: 'anc-2', slot: 3, block: 1, round: 0 },
      { t: 1_200_000, type: 'UWB_SP3', node: 'tag-1', peer: 'anc-1', slot: 2, block: 1, round: 1 },
      { t: 2_000_000, type: 'UWB_SP3_REPORT', node: 'tag-1', peer: 'anc-1', slot: 4, block: 1, round: 0 },
    ]
    for (const r of seq(rounds)) applyRecord(vs, r)
    const u = vs.nodes['tag-1'].uwb!
    expect([u.sp3, u.sp3Reports]).toEqual([3, 1])

    const U = STRINGS.uwb
    const markup = renderToStaticMarkup(createElement(UwbInspector, {
      nv: vs.nodes['tag-1'], nameOf: (id: string) => id,
    }))
    // Both labels and both hints are present — the row and the title a reader hovers for.
    for (const s of [U.sp3, U.sp3Hint, U.sp3Reports, U.sp3ReportsHint]) {
      expect(s.length, 'the label has to exist before a row can show it').toBeGreaterThan(0)
      expect(markup).toContain(s)
    }
    // …and the counts themselves reach the markup, which is the half C4 was about: a label with
    // nothing beside it would read the same as no row at all. 3 and 1 are distinguishable, so
    // neither row can be showing the other's number.
    expect(markup).toMatch(new RegExp(`${U.sp3}</span><span>3</span>`))
    expect(markup).toMatch(new RegExp(`${U.sp3Reports}</span><span>1</span>`))
  })

  it('shows both rows at zero too, because a hidden row cannot say the session never asked', () => {
    // The same reason `rmnr` and `mmrcm` are unconditional: with `sp3` on, every other row in the
    // panel reads exactly as it would in an SP1 round, so a row that appears only once it is
    // non-zero would make "no markers arrived" and "this is not an SP3 session" look alike.
    const vs = initViewState(uwbScenario())
    const markup = renderToStaticMarkup(createElement(UwbInspector, {
      nv: vs.nodes['tag-1'], nameOf: (id: string) => id,
    }))
    expect(markup).toContain(STRINGS.uwb.sp3)
    expect(markup).toContain(STRINGS.uwb.sp3Reports)
  })
})
