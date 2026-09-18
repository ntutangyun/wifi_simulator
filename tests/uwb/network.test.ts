import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, defaultScenario, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import { UwbNetwork } from '../../src/uwb/network'
import { C_M_PER_NS, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres } from '../../src/uwb/ranging'

const MS = 1_000_000

interface Place { x: number; y: number; z: number; ppm?: number; txPowerDbm?: number }

function uwbNode(id: string, p: Place, role: 'anchor' | 'tag'): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x: p.x, y: p.y, z: p.z },
    txPowerDbm: p.txPowerDbm ?? UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ...(p.ppm !== undefined ? { ppm: p.ppm } : {}) },
  }
}

/** A scenario that is nothing but a UWB session: no AP, no stations, no servers. */
function uwbScenario(anchors: Place[], tags: Place[], session: Partial<UwbSessionCfg> = {}, walls: Wall[] = []): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 12, h: 10, name: 'lab' }],
    walls,
    nodes: [
      ...anchors.map((p, i) => uwbNode(`anc-${i + 1}`, p, 'anchor')),
      ...tags.map((p, i) => uwbNode(`tag-${i + 1}`, p, 'tag')),
    ],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
  }
}

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T, node?: string): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type && (node === undefined || (r as { node?: string }).node === node)) as never

/** The four anchors of the lesson scene: 5 m from a tag at the origin, on the axes. */
const ring = (ppm: number): Place[] => [
  { x: 5, y: 0, z: 1, ppm }, { x: 0, y: 5, z: 1, ppm }, { x: -5, y: 0, z: 1, ppm }, { x: 0, y: -5, z: 1, ppm },
]

const SIGMA_R = rangeSigmaM(100) // 1-σ of one range at 100 ps timestamp noise: 21.2 mm
/** 1-σ of the corrected SS reading's clock-correction residual: ½·Treply·σ_cfo, 6.0 cm at a 2 ms reply.
 * A corrected SS range carries it on top of SIGMA_R; a DS range does not. */
const SS_CORRECTED_SIGMA_M = Math.hypot(SIGMA_R, ((2 * MS * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6) / 2) * C_M_PER_NS)

describe('UwbNetwork — SS-TWR, one anchor, perfect crystals', () => {
  const sc = uwbScenario([{ x: 0, y: 0, z: 1, ppm: 0 }], [{ x: 5, y: 0, z: 1, ppm: 0 }], { method: 'ss', nlos: false })
  const rs = run(sc, 30 * MS)

  it('produces exactly one range, at the tag, accurate to the timestamp noise', () => {
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].node).toBe('tag-1')
    expect(ranges[0].peer).toBe('anc-1')
    expect(ranges[0].method).toBe('ss')
    expect(ranges[0].trueDistM).toBeCloseTo(5, 9)
    expect(Math.abs(ranges[0].distM - 5)).toBeLessThan(3 * SS_CORRECTED_SIGMA_M)
  })

  it('agrees raw with corrected when neither crystal is off', () => {
    const r = of(rs, 'UWB_RANGE')[0]
    // raw and corrected differ by treply·coffs/2; with ppm 0/0 the whole of
    // coffs is the CFO estimator's own noise (1 σ = cfoNoisePpm = 0.2 ppm),
    // so the gap is 1 σ = 2 ms · 0.2e-6 / 2 · c = 60 mm.
    const gapSigmaM = (2 * MS * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6) / 2 * C_M_PER_NS
    expect(Math.abs(rctuToMetres(r.tofRawRctu!) - rctuToMetres(r.tofRctu))).toBeLessThan(3 * gapSigmaM)
  })

  it('stamps four ranging counters: tx/rx of the poll, then tx/rx of the response', () => {
    const ts = of(rs, 'UWB_TS')
    expect(ts.map((r) => `${r.node} ${r.dir} ${r.frameKind}`)).toEqual([
      'tag-1 tx uwbPoll', 'anc-1 rx uwbPoll', 'anc-1 tx uwbResp', 'tag-1 rx uwbResp',
    ])
    for (let i = 1; i < ts.length; i++) expect(ts[i].t).toBeGreaterThan(ts[i - 1].t)
  })

  it('opens a two-slot round at t = 0 and walks both slots', () => {
    const rounds = of(rs, 'UWB_ROUND')
    expect(rounds).toHaveLength(1)
    expect(rounds[0].t).toBe(0)
    expect(rounds[0].node).toBe('tag-1')
    expect(rounds[0].slots).toBe(2)
    expect(rounds[0].method).toBe('ss')
    expect(rounds[0].untilNs).toBe(4 * MS)
    expect(of(rs, 'UWB_SLOT').map((r) => r.t)).toEqual([0, 2 * MS])
  })

  it('transmits the response in slot 1 and both frames fly 5 m in 17 ns', () => {
    const txs = of(rs, 'TX_START')
    expect(txs).toHaveLength(2)
    expect(txs[1].t).toBe(2_000_000)
    const rxs = of(rs, 'RX_START')
    expect(rxs).toHaveLength(2)
    expect(rxs[0].t - txs[0].t).toBe(17)
    expect(rxs[1].t - txs[1].t).toBe(17)
  })
})

describe('UwbNetwork — SS-TWR with ±10 ppm crystals', () => {
  const sc = uwbScenario(ring(-10), [{ x: 0, y: 0, z: 1, ppm: 10 }], { method: 'ss', nlos: false })
  const rs = run(sc, 30 * MS)
  const ranges = of(rs, 'UWB_RANGE')

  it('ranges to all four anchors', () => {
    expect(ranges).toHaveLength(4)
    expect(ranges.map((r) => r.peer)).toEqual(['anc-1', 'anc-2', 'anc-3', 'anc-4'])
  })

  it('shows the raw error growing 6 m per slot of reply delay', () => {
    // raw − ToF = Treply·(ppmTag − ppmAnchor)/2 = (i+1)·2 ms · 10e-6 = (i+1)·20 ns
    const expected = [5.996, 11.99, 17.99, 23.98]
    ranges.forEach((r, i) => {
      expect(rctuToMetres(r.tofRawRctu!) - 5).toBeCloseTo(expected[i], 1)
      expect(Math.abs(rctuToMetres(r.tofRawRctu!) - 5 - expected[i])).toBeLessThan(0.15)
    })
  })

  it('removes that error with the carrier-frequency-offset correction', () => {
    // What is left after the correction is the CFO estimator's own residual,
    // Treply·cfoNoisePpm/2 — it still grows with the reply delay, which is
    // exactly why DS-TWR exists. Measured here: 31 / 62 / 77 / 13 mm.
    for (const r of ranges) expect(Math.abs(r.distM - 5)).toBeLessThan(0.15)
    ranges.forEach((r) => {
      expect(Math.abs(r.distM - 5)).toBeLessThan(Math.abs(rctuToMetres(r.tofRawRctu!) - 5) / 40)
    })
  })
})

describe('UwbNetwork — DS-TWR with ±10 ppm crystals', () => {
  const sc = uwbScenario(ring(-10), [{ x: 0, y: 0, z: 1, ppm: 10 }], { nlos: false })
  const rs = run(sc, 30 * MS)

  it('measures the range twice: once at each anchor, once at the tag', () => {
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(8)
    expect(ranges.filter((r) => r.node.startsWith('anc-'))).toHaveLength(4)
    const atTag = ranges.filter((r) => r.node === 'tag-1')
    expect(atTag).toHaveLength(4)
    for (const r of atTag) {
      expect(r.method).toBe('ds')
      expect(r.trueDistM).toBeCloseTo(5, 9)
      expect(Math.abs(r.distM - 5)).toBeLessThan(3 * SIGMA_R)
    }
  })

  it('solves the tag position from the four ranges', () => {
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(1)
    expect(fixes[0].node).toBe('tag-1')
    expect(Math.hypot(fixes[0].x - 0, fixes[0].y - 0)).toBeLessThan(0.2)
    expect(fixes[0].anchors).toEqual(['anc-1', 'anc-2', 'anc-3', 'anc-4'])
    expect(fixes[0].trueX).toBe(0)
    expect(fixes[0].trueY).toBe(0)
  })

  it('fits the whole round inside its 20 ms', () => {
    const uwbRecs = rs.filter((r) => r.type.startsWith('UWB_'))
    for (const r of uwbRecs) expect(r.t).toBeLessThanOrEqual(20 * MS)
    // only the fix lands on the round boundary itself; every frame is done before it
    for (const r of rs.filter((x) => x.type === 'TX_END' || x.type === 'RX_OK')) {
      expect(r.t).toBeLessThan(20 * MS)
    }
    expect(of(rs, 'UWB_POSITION')[0].t).toBe(20 * MS)
  })

  it('sends a 62-octet Final in slot 5, 236 603 ns of air', () => {
    const final = of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!
    expect(final.t).toBe(10 * MS)
    expect(final.frame.uwb?.slot).toBe(5)
    expect(final.frame.bytes).toBe(62)
    expect(final.frame.txTimeNs).toBe(236_603)
    expect(final.frame.uwb?.finalTimes).toHaveLength(4)
  })
})

describe('UwbNetwork — an anchor out of range', () => {
  const far = ring(0)
  far[3] = { x: 0, y: -40, z: 1, ppm: 0 }
  const sc = uwbScenario(far, [{ x: 0, y: 0, z: 1, ppm: 0 }], { nlos: false })
  const rs = run(sc, 30 * MS)

  it('times the missing anchor out at both ends', () => {
    const atTag = of(rs, 'UWB_TIMEOUT', 'tag-1')
    expect(atTag.some((r) => r.expected === 'uwbResp' && r.peer === 'anc-4' && r.slot === 4)).toBe(true)
    const atAnchor = of(rs, 'UWB_TIMEOUT', 'anc-4')
    expect(atAnchor.some((r) => r.expected === 'uwbPoll' && r.peer === 'tag-1' && r.slot === 0)).toBe(true)
    // the three anchors that heard the poll never time out
    for (const id of ['anc-1', 'anc-2', 'anc-3']) expect(of(rs, 'UWB_TIMEOUT', id)).toHaveLength(0)
  })

  it('carries only the three answering anchors in the Final, and still fixes the position', () => {
    const final = of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!
    expect(final.frame.uwb?.finalTimes).toHaveLength(3)
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(1)
    expect(fixes[0].anchors).toEqual(['anc-1', 'anc-2', 'anc-3'])
    expect(Math.hypot(fixes[0].x, fixes[0].y)).toBeLessThan(0.3)
  })
})

describe('UwbNetwork — an anchor the tag cannot hear back', () => {
  // The link is asymmetric because path loss is computed from the *transmitter's*
  // power: anc-4 hears the tag's Poll and Final at −78 dBm, but its own Response
  // reaches the tag at −105 dBm, well under the −93 dBm sensitivity.
  const deaf = ring(0)
  deaf[3] = { x: 0, y: -5, z: 1, ppm: 0, txPowerDbm: -40 }
  const sc = uwbScenario(deaf, [{ x: 0, y: 0, z: 1, ppm: 0 }], { nlos: false })
  const rs = run(sc, 30 * MS)
  const txOf = (id: string, kind: string): boolean =>
    of(rs, 'TX_START').some((r) => r.frame.src === id && r.frame.kind === kind)

  it('answers the Poll but is left out of the Final', () => {
    expect(txOf('anc-4', 'uwbResp')).toBe(true)
    expect(of(rs, 'UWB_TIMEOUT', 'anc-4')).toHaveLength(0) // it heard both tag frames
    const final = of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbFinal')!
    expect(final.frame.uwb?.finalTimes?.map((e) => e.id)).toEqual(['anc-1', 'anc-2', 'anc-3'])
  })

  it('stays silent in its Report slot, so no half-measured range reaches the timeline', () => {
    expect(txOf('anc-4', 'uwbReport')).toBe(false)
    expect(of(rs, 'UWB_RANGE').some((r) => r.node === 'anc-4' || r.peer === 'anc-4')).toBe(false)
    expect(of(rs, 'UWB_TIMEOUT', 'tag-1').map((r) => [r.slot, r.expected])).toEqual([
      [4, 'uwbResp'], [9, 'uwbReport'],
    ])
    expect(of(rs, 'UWB_POSITION')[0].anchors).toEqual(['anc-1', 'anc-2', 'anc-3'])
  })
})

describe('UwbNetwork — the block must hold every tag', () => {
  it('refuses more tags than the block has rounds', () => {
    const nodes = [
      uwbNode('anc-1', { x: 0, y: 0, z: 1 }, 'anchor'), uwbNode('anc-2', { x: 5, y: 0, z: 1 }, 'anchor'),
      uwbNode('tag-1', { x: 1, y: 1, z: 1 }, 'tag'), uwbNode('tag-2', { x: 2, y: 2, z: 1 }, 'tag'),
    ]
    // 2 anchors, DS: 6 slots of 2 ms = a 12 ms round; a 20 ms block holds one.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, blockRstu: 24_000 }
    expect(() => new UwbNetwork(new EventQueue(), () => 0, nodes, [], cfg, new Rng(1), makeEmitter(() => {})))
      .toThrow(/holds 1 rounds/)
  })
})

describe('UwbNetwork — three tags share the block', () => {
  const sc = uwbScenario(ring(0), [
    { x: 0, y: 0, z: 1, ppm: 0 }, { x: 1, y: 1, z: 1, ppm: 0 }, { x: -1, y: 2, z: 1, ppm: 0 },
  ], { nlos: false })
  // 470 ms, not 450: tag-3's block-2 round only closes at 460 ms.
  const rs = run(sc, 470 * MS)

  it('gives each tag its own round, one block after the other', () => {
    const rounds = of(rs, 'UWB_ROUND')
    expect(rounds.slice(0, 6).map((r) => [r.node, r.t])).toEqual([
      ['tag-1', 0], ['tag-2', 20 * MS], ['tag-3', 40 * MS],
      ['tag-1', 200 * MS], ['tag-2', 220 * MS], ['tag-3', 240 * MS],
    ])
    expect(rounds.slice(0, 3).every((r) => r.block === 0)).toBe(true)
    expect(rounds.slice(3, 6).every((r) => r.block === 1)).toBe(true)
  })

  it('fixes every tag once per block', () => {
    for (const id of ['tag-1', 'tag-2', 'tag-3']) {
      const fixes = of(rs, 'UWB_POSITION', id)
      expect(fixes.map((f) => f.block)).toEqual([0, 1, 2])
      for (const f of fixes) expect(f.anchors).toHaveLength(4)
    }
  })
})

describe('UwbNetwork — determinism', () => {
  it('replays bit-for-bit', () => {
    const build = (): Scenario => uwbScenario(ring(-10), [{ x: 0, y: 0, z: 1, ppm: 10 }], { nlos: false })
    expect(run(build(), 60 * MS)).toEqual(run(build(), 60 * MS))
  })
})

describe('UwbNetwork — beside a Wi-Fi BSS', () => {
  function withUwb(): Scenario {
    const sc = defaultScenario()
    sc.nodes.push(
      uwbNode('anc-1', { x: 0.5, y: 0.5, z: 2.4 }, 'anchor'),
      uwbNode('anc-2', { x: 5.5, y: 0.5, z: 2.4 }, 'anchor'),
      uwbNode('anc-3', { x: 3, y: 7.5, z: 2.4 }, 'anchor'),
      uwbNode('uwb-tag', { x: 3, y: 4, z: 1 }, 'tag'),
    )
    sc.uwb = { ...DEFAULT_UWB_SESSION }
    return sc
  }

  const uwbIds = new Set(['anc-1', 'anc-2', 'anc-3', 'uwb-tag'])
  const wifiOnly = (rs: TLRecord[]): unknown[] => rs
    .filter((r) => !r.type.startsWith('UWB_'))
    .filter((r) => !('node' in r && typeof r.node === 'string' && uwbIds.has(r.node)))
    .map((r) => {
      const o: Record<string, unknown> = { ...r }
      delete o.seq // the shared emitter numbers UWB records too, so seq shifts
      return o
    })

  it('leaves the Wi-Fi timeline untouched', () => {
    const combined = run(withUwb(), 100 * MS)
    const alone = run(defaultScenario(), 100 * MS)
    expect(wifiOnly(combined)).toEqual(wifiOnly(alone))
  })

  it('still ranges', () => {
    const rs = run(withUwb(), 100 * MS)
    expect(of(rs, 'UWB_POSITION', 'uwb-tag')).toHaveLength(1)
    expect(of(rs, 'UWB_RANGE', 'uwb-tag')).toHaveLength(3)
  })
})
