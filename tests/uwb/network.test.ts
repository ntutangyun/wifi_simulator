import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { hashStr } from '../../src/engine/hash'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { Spectrum, wifiToUwbPathLossDb, type Emission } from '../../src/engine/spectrum'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, defaultScenario, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import { brick, node as wifiNode, rangingLab } from '../../src/course/lessonKit'
import { mmsSet, ratioSigma, rsfNs } from '../../src/uwb/mms'
import { nbBand, nbCenterMhz, nbChannelForBlock, NB_LBT_THRESHOLD_DBM } from '../../src/uwb/nb'
import { UwbNetwork } from '../../src/uwb/network'
import {
  C_M_PER_NS, UWB_BAND_MHZ, UWB_MAX_ANCHORS, UWB_NLOS_NS, UWB_RMARKER_NS, UWB_RX_SENS_DBM,
  UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
} from '../../src/uwb/phy'
import { aoaSigmaDeg } from '../../src/uwb/aoa'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres } from '../../src/uwb/ranging'

const MS = 1_000_000

interface Place { x: number; y: number; z: number; ppm?: number; txPowerDbm?: number; yawDeg?: number }

function uwbNode(id: string, p: Place, role: 'anchor' | 'tag'): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x: p.x, y: p.y, z: p.z },
    txPowerDbm: p.txPowerDbm ?? UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: {
      role,
      ...(p.ppm !== undefined ? { ppm: p.ppm } : {}),
      ...(p.yawDeg !== undefined ? { yawDeg: p.yawDeg } : {}),
    },
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

// --- DL-TDoA: the anchors run the round and the tags only listen (§10.32.3) ----

/**
 * The lesson-5 lab: four anchors in the corners of a 10 × 8 m room and three tags that never
 * transmit. The anchors' crystals are exact — anchor 1 is the reference every arrival is
 * differenced against — and two of the tags sit at the ±20 ppm ends of the tolerance the
 * standard allows, which is the whole point of the mode's clock correction.
 */
const CORNERS: Place[] = [
  { x: 0.5, y: 0.5, z: 2.4, ppm: 0 }, { x: 9.5, y: 0.5, z: 2.4, ppm: 0 },
  { x: 9.5, y: 7.5, z: 2.4, ppm: 0 }, { x: 0.5, y: 7.5, z: 2.4, ppm: 0 },
]
const LISTENERS: Place[] = [
  { x: 5, y: 4, z: 1, ppm: 20 }, { x: 2, y: 6, z: 1, ppm: -20 }, { x: 8, y: 2, z: 1, ppm: 7 },
]
const dl = (session: Partial<UwbSessionCfg> = {}, anchors: Place[] = CORNERS): Scenario =>
  uwbScenario(anchors, LISTENERS, { mode: 'dl-tdoa', nlos: false, ...session })
/** Three 200 ms blocks, i.e. three anchor rounds — one per block, whoever is listening. */
const DL_RUN_NS = 3 * 200 * MS - 1
/** What a corrected difference is left with: the responder's own clock-offset estimate carries
 * 1 σ = cfoNoisePpm, and it multiplies a reply time of one slot per slot the responder waited —
 * so the residual grows with the slot it answered in. 12 cm per slot here. */
const dlSigmaM = (slot: number): number =>
  slot * 2 * MS * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * C_M_PER_NS
const dtErrM = (rs: TLRecord[], peer: string, node?: string): number[] =>
  of(rs, 'UWB_TDOA', node).filter((r) => r.peer === peer).map((r) => Math.abs(r.dtNs - r.trueDtNs) * C_M_PER_NS)

describe('UwbNetwork — DL-TDoA rounds', () => {
  const rs = run(dl(), DL_RUN_NS)

  it('gives every slot of the round to an anchor, and a tag none at all', () => {
    const first = of(rs, 'TX_START').filter((r) => r.t < 200 * MS)
    expect(first.map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot])).toEqual([
      ['anc-1', 'uwbPoll', 0], ['anc-2', 'uwbResp', 1], ['anc-3', 'uwbResp', 2],
      ['anc-4', 'uwbResp', 3], ['anc-1', 'uwbFinal', 4],
    ])
    // Not one transmission from a tag in any block, and not one two-way range anywhere: this
    // mode has no round trip in it at all.
    expect(of(rs, 'TX_START').some((r) => r.node.startsWith('tag-'))).toBe(false)
    expect(of(rs, 'UWB_RANGE')).toEqual([])
  })

  it('carries each sender’s own times, and only those', () => {
    const frameOf = (kind: string, src: string) =>
      of(rs, 'TX_START').find((r) => r.frame.kind === kind && r.frame.src === src)!.frame
    const poll = frameOf('uwbPoll', 'anc-1')
    // The Poll opens the round: its own transmit instant, no arrival times, and a schedule of
    // the three responders (anchor 1 keeps slot 0 and the Final for itself).
    expect(poll.uwb?.schedule).toEqual(['anc-2', 'anc-3', 'anc-4'])
    expect(poll.uwb?.dl?.rxCounters).toEqual({})
    expect(poll.uwb?.ies).toEqual(['ARC', 'RDM', 'RRMC', 'TXT'])
    expect(poll.dst).toBe('*')
    const resp = frameOf('uwbResp', 'anc-3')
    expect(Object.keys(resp.uwb?.dl?.rxCounters ?? {})).toEqual(['anc-1'])
    expect(resp.uwb?.dl?.coffs).toBeCloseTo(0, 5) // exact crystals: all of it is estimator noise
    expect(resp.uwb?.ies).toEqual(['RRMC', 'TXT', 'RXT', 'COFF'])
    expect(resp.uwb?.replyRctu).toBeUndefined() // a listening tag wants instants, not round trips
    const final = frameOf('uwbFinal', 'anc-1')
    expect(Object.keys(final.uwb?.dl?.rxCounters ?? {})).toEqual(['anc-2', 'anc-3', 'anc-4'])
    expect(final.uwb?.finalTimes).toBeUndefined()
  })

  it('gives every tag three differences and one fix per block, from the one round', () => {
    // All three tags share the round: one UWB_ROUND each, at the same instant, every block.
    expect(of(rs, 'UWB_ROUND').filter((r) => r.t === 0).map((r) => [r.node, r.mode, r.slots]))
      .toEqual([['tag-1', 'dl-tdoa', 5], ['tag-2', 'dl-tdoa', 5], ['tag-3', 'dl-tdoa', 5]])
    for (const id of ['tag-1', 'tag-2', 'tag-3']) {
      const diffs = of(rs, 'UWB_TDOA', id)
      expect(diffs, id).toHaveLength(9)
      expect(diffs.every((d) => d.ref === 'anc-1'), id).toBe(true)
      expect(diffs.slice(0, 3).map((d) => d.peer), id).toEqual(['anc-2', 'anc-3', 'anc-4'])
      const fixes = of(rs, 'UWB_POSITION', id)
      expect(fixes.map((f) => f.block), id).toEqual([0, 1, 2])
      expect(fixes.every((f) => f.method === 'dl-tdoa'), id).toBe(true)
      expect(fixes[0].anchors, id).toEqual(['anc-1', 'anc-2', 'anc-3', 'anc-4'])
    }
  })

  it('leaves decimetres on a difference, growing with the slot the responder answered in', () => {
    const maxima = ['anc-2', 'anc-3', 'anc-4'].map((p) => Math.max(...dtErrM(rs, p)))
    // Measured over nine rounds: 22 / 40 / 57 cm, all of it the clock-offset residual of the
    // responder's reply time — which is one slot longer for each slot further into the round.
    expect(maxima.map((v) => v.toFixed(2))).toEqual(['0.22', '0.40', '0.57'])
    maxima.forEach((v, i) => {
      expect(dlSigmaM(i + 1) * 100, `sigma ${i}`).toBeCloseTo(12 * (i + 1), 0)
      expect(v, `peer ${i}`).toBeLessThan(3 * dlSigmaM(i + 1))
    })
    expect(maxima[0]).toBeLessThan(maxima[1])
    expect(maxima[1]).toBeLessThan(maxima[2])
  })

  it('fixes every tag to within half a metre without ever measuring a distance', () => {
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(9)
    const errs = fixes.map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
    expect(Math.max(...errs).toFixed(2)).toBe('0.40')
    for (const f of fixes) expect(f.gdop).toBeLessThan(1) // difference rows are longer than unit ones
    // The ellipse is drawn from what a difference really carries: the tag's two timestamps
    // (4.2 cm) and each responder's clock-offset residual, 0.2 ppm of its own reply time —
    // 12 / 24 / 36 cm at 2, 4 and 6 ms, RMS 26 cm. So it lands in the decimetres the measured
    // errors are in, instead of claiming 2 cm beside a 40 cm error.
    expect(fixes[0].ellipse.a.toFixed(2)).toBe('0.20')
    expect(fixes[0].ellipse.a).toBeGreaterThan(Math.max(...errs) / 3)
    expect(fixes[0].ellipse.a).toBeLessThan(Math.max(...errs))
  })

  it('needs every responder: one it cannot hear leaves too few differences to fix', () => {
    const far: Place[] = [...CORNERS]
    far[3] = { x: 0, y: -40, z: 2.4, ppm: 0 }
    const lost = run(dl({}, far), 200 * MS - 1)
    // anc-4 never hears the Poll, so it never answers, and each tag's slot-3 deadline says so.
    expect(of(lost, 'TX_START').some((r) => r.node === 'anc-4')).toBe(false)
    expect(of(lost, 'UWB_TIMEOUT', 'tag-1').map((r) => [r.slot, r.expected])).toEqual([[3, 'uwbResp']])
    expect(of(lost, 'UWB_TDOA', 'tag-1').map((r) => r.peer)).toEqual(['anc-2', 'anc-3'])
    // Three anchors are two differences: a hyperbolic fix needs three, so the round produces none.
    expect(of(lost, 'UWB_POSITION')).toEqual([])
  })
})

describe('UwbNetwork — DL-TDoA, a tag that misses the Poll and the Final', () => {
  // Two brick walls across the line from anchor 1 to tag-2 only: 24 dB, enough to put the
  // reference's frames under the receiver's sensitivity at that tag while leaving every other
  // pair in the room in the clear - the responders still answer, and tag-2 still hears them.
  const walls = [5.0, 5.1].map((y) => ({ x1: 1, y1: y, x2: 2.5, y2: y, material: 'brick' as const, openings: [] }))
  const rs = run(uwbScenario(CORNERS, LISTENERS, { mode: 'dl-tdoa', nlos: false }, walls), DL_RUN_NS)

  it('produces no difference and no fix that round, while the other tags are untouched', () => {
    // it heard the three Responses, and neither end of the rate interval
    const heardBy2 = of(rs, 'RX_OK', 'tag-2').map((r) => r.from)
    expect([...new Set(heardBy2)].sort()).toEqual(['anc-2', 'anc-3', 'anc-4'])
    // so the round is incomplete: a rate measured over half an interval is no rate at all
    expect(of(rs, 'UWB_TDOA', 'tag-2')).toEqual([])
    expect(of(rs, 'UWB_POSITION', 'tag-2')).toEqual([])
    // and the walls are between anchor 1 and that tag alone
    for (const id of ['tag-1', 'tag-3']) {
      expect(of(rs, 'UWB_TDOA', id), id).toHaveLength(9)
      expect(of(rs, 'UWB_POSITION', id).map((f) => f.block), id).toEqual([0, 1, 2])
    }
  })
})

describe('UwbNetwork — DL-TDoA without the tag’s clock-rate correction', () => {
  const rs = run(dl({ tdoaClockCorrection: false }), DL_RUN_NS)

  it('lets the tag’s own crystal swamp the differences: metres per slot of the round', () => {
    // tag-1 runs 20 ppm fast, so an arrival i slots after the Poll is stamped i·2 ms·20 ppm =
    // i·40 ns late on its own clock — i·12 m of range difference that is not geometry.
    const ppmM = (slot: number): number => slot * 2 * MS * 20e-6 * C_M_PER_NS
    expect(ppmM(1).toFixed(2)).toBe('11.99')
    for (const [i, peer] of ['anc-2', 'anc-3', 'anc-4'].entries()) {
      // What is left beside it is the same clock-offset residual a corrected round has.
      for (const err of dtErrM(rs, peer, 'tag-1')) {
        expect(Math.abs(err - ppmM(i + 1)), peer).toBeLessThan(3 * dlSigmaM(i + 1))
      }
    }
    // tag-3's crystal is only 7 ppm off, so its differences are wrong by a smaller multiple of
    // the same thing — the error is the tag's own, not the anchors'.
    expect(Math.max(...dtErrM(rs, 'anc-4', 'tag-3'))).toBeLessThan(ppmM(3) / 2)
  })

  it('produces no fix at all: no point in the plane explains differences that large', () => {
    expect(of(rs, 'UWB_TDOA')).toHaveLength(27)
    // 36 m of range difference between two anchors 11 m apart is not a hyperbola anyone stands
    // on; Gauss–Newton walks out to where the difference rows go parallel and the solver, rather
    // than inventing a position, returns nothing.
    expect(of(rs, 'UWB_POSITION')).toEqual([])
  })
})

describe('UwbNetwork — DL-TDoA with the anchors off frequency', () => {
  it('puts each responder’s reply time on the reference’s clock before differencing it', () => {
    // The responders are +20, −20 and +13 ppm off the reference. Uncorrected, that is the same
    // metres-per-slot error as an uncorrected tag; corrected by the offset each responder
    // measured on the Poll's carrier, it is decimetres again.
    const rs = run(dl({}, [
      CORNERS[0], { ...CORNERS[1], ppm: 20 }, { ...CORNERS[2], ppm: -20 }, { ...CORNERS[3], ppm: 13 },
    ]), DL_RUN_NS)
    const maxima = ['anc-2', 'anc-3', 'anc-4'].map((p) => Math.max(...dtErrM(rs, p)))
    for (const [i, v] of maxima.entries()) expect(v, `peer ${i}`).toBeLessThan(3 * dlSigmaM(i + 1))
    expect(of(rs, 'UWB_POSITION')).toHaveLength(9)
  })

  it('cancels the reference anchor’s own crystal: +20 ppm on anchor 1 changes nothing', () => {
    // The rate ratio is one interval over the other — the tag's two arrivals over anchor 0's own
    // two transmit instants, both of which ride in the Poll and the Final — so it is the tag's
    // clock against anchor 0's and never against true time. Anchor 0 may run at any ppm: its
    // crystal scales the numerator and the denominator of everything the tag computes alike.
    const off = run(dl({}, [{ ...CORNERS[0], ppm: 20 }, ...CORNERS.slice(1)]), DL_RUN_NS)
    const maxima = ['anc-2', 'anc-3', 'anc-4'].map((p) => Math.max(...dtErrM(off, p)))
    expect(maxima.map((v) => v.toFixed(2))).toEqual(['0.22', '0.40', '0.57'])
    for (const [i, v] of maxima.entries()) expect(v, `peer ${i}`).toBeLessThan(3 * dlSigmaM(i + 1))
    const errs = of(off, 'UWB_POSITION').map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
    expect(errs).toHaveLength(9)
    expect(Math.max(...errs)).toBeLessThan(0.5)
    // Every anchor 20 ppm fast is the same round again, relative to the reference: the reference
    // is what the whole round is measured in, and a common offset is not an error at all.
    const allOff = run(dl({}, CORNERS.map((c) => ({ ...c, ppm: 20 }))), DL_RUN_NS)
    expect(['anc-2', 'anc-3', 'anc-4'].map((p) => Math.max(...dtErrM(allOff, p)).toFixed(2)))
      .toEqual(['0.22', '0.40', '0.57'])
  })
})

describe('UwbNetwork — DL-TDoA determinism, and two-way ranging left alone', () => {
  it('replays bit-for-bit', () => {
    expect(run(dl(), DL_RUN_NS)).toEqual(run(dl(), DL_RUN_NS))
  })

  it('changes not one record of a two-way session, whatever the one-way knobs say', () => {
    const twr = (session: Partial<UwbSessionCfg>): TLRecord[] =>
      run(uwbScenario(ring(0), [{ x: 0, y: 0, z: 1, ppm: 0 }], { nlos: false, ...session }), 3 * 200 * MS)
    const base = twr({})
    expect(twr({ mode: 'twr', tdoaClockCorrection: false, syncErrorNs: 4 })).toEqual(base)
    expect(of(base, 'UWB_TDOA')).toEqual([])
    expect(of(base, 'UWB_POSITION').every((f) => f.method === 'twr')).toBe(true)
  })
})

// --- UL-TDoA: the tag blinks once and the infrastructure positions it ----------

/**
 * The lesson-6 lab: the same four corner anchors, and ten tags spread over the room, each with
 * one slot of its own per block. Their crystals are at the ±20 ppm ends of the tolerance, which
 * in this mode changes nothing at all — a blink carries no times, and no interval is ever
 * measured on a tag's clock.
 */
const BLINKERS: Place[] = ([[2, 2], [5, 2], [8, 2], [2, 4], [5, 4], [8, 4], [2, 6], [5, 6], [8, 6], [6.5, 3]] as const)
  .map(([x, y], i) => ({ x, y, z: 1, ppm: i % 2 === 0 ? 20 : -20 }))
const ul = (session: Partial<UwbSessionCfg> = {}): Scenario =>
  uwbScenario(CORNERS, BLINKERS, { mode: 'ul-tdoa', nlos: false, ...session })
/** Two 200 ms blocks: ten rounds of one slot each per block, one per tag. */
const UL_RUN_NS = 2 * 200 * MS - 1
const TAG_IDS = BLINKERS.map((_, i) => `tag-${i + 1}`)
/**
 * 1-σ of one UL-TDoA difference: two independent receive timestamps and two anchors' residual
 * calibration offsets, all in one subtraction. This is exactly the sigma the solver draws its
 * ellipse from — see the assertions below, which pin the semi-axis against it.
 */
const ulSigmaM = (syncNs: number): number =>
  Math.SQRT2 * Math.hypot(DEFAULT_UWB_SESSION.tsNoisePs / 1000, syncNs) * C_M_PER_NS
const posErr = (rs: TLRecord[]): number[] =>
  of(rs, 'UWB_POSITION').map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))

describe('UwbNetwork — UL-TDoA blinks', () => {
  const rs = run(ul(), UL_RUN_NS)

  it('spends one 14-octet blink per tag per block, and nothing else anywhere', () => {
    const tx = of(rs, 'TX_START')
    // Ten tags, ten rounds, one transmission each — and not one from an anchor: the
    // infrastructure only listens, and no frame in this mode is ever answered.
    expect(tx.filter((r) => r.t < 200 * MS).map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot]))
      .toEqual(TAG_IDS.map((id) => [id, 'uwbBlink', 0]))
    expect(tx).toHaveLength(2 * TAG_IDS.length)
    expect(tx.every((r) => r.frame.bytes === 14 && r.frame.txTimeNs === 181_218)).toBe(true)
    expect(tx[0].frame.dst).toBe('*')
    expect(tx[0].frame.uwb?.ies).toEqual(['BLINK'])
    // No round trip exists in this mode, so no anchor and no tag ever reports a distance.
    expect(of(rs, 'UWB_RANGE')).toEqual([])
    expect(of(rs, 'UWB_TIMEOUT')).toEqual([])
    // The tag's radio is off the moment its blink has left: it waits for nothing.
    expect(of(rs, 'MAC_STATE', 'tag-1').map((r) => r.state)).toEqual(['tx', 'idle', 'tx', 'idle'])
  })

  it('has the reference anchor solve each tag, and the view put the fix on the tag’s lane', () => {
    const diffs = of(rs, 'UWB_TDOA')
    expect(diffs).toHaveLength(2 * TAG_IDS.length * 3) // three differences per blink
    expect(diffs.every((d) => d.node === 'anc-1' && d.ref === 'anc-1')).toBe(true)
    expect(diffs.slice(0, 3).map((d) => [d.peer, d.of])).toEqual([
      ['anc-2', 'tag-1'], ['anc-3', 'tag-1'], ['anc-4', 'tag-1'],
    ])
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes.map((f) => [f.node, f.of, f.method, f.block])).toEqual(
      [0, 1].flatMap((block) => TAG_IDS.map((id) => ['anc-1', id, 'ul-tdoa', block])),
    )
    expect(fixes[0].anchors).toEqual(['anc-1', 'anc-2', 'anc-3', 'anc-4'])
    // `of` routes the measurement to the node it is about: the tag that never transmits again
    // is where the reader — and the 3-D overlay — finds its own position and its differences.
    const sim = new Simulation(ul())
    sim.runUntil(UL_RUN_NS)
    const tag = sim.view.nodes['tag-1'].uwb!
    expect(tag.position?.method).toBe('ul-tdoa')
    expect(tag.position?.n).toBe(2)
    expect(Object.keys(tag.tdoa)).toEqual(['anc-2', 'anc-3', 'anc-4'])
    expect(tag.ranges).toEqual({})
    expect(sim.view.nodes['anc-1'].uwb!.position).toBeNull()
    expect(sim.view.nodes['anc-1'].uwb!.tdoa).toEqual({})
  })

  it('leaves nothing on a difference but the two receivers’ timestamp noise', () => {
    // Perfectly synchronised anchors: no clock-rate correction is needed anywhere, because no
    // interval is measured on anybody's crystal — only two instants on one shared timebase.
    const dtErr = of(rs, 'UWB_TDOA').map((d) => Math.abs(d.dtNs - d.trueDtNs) * C_M_PER_NS)
    expect(ulSigmaM(0) * 100).toBeCloseTo(4.24, 2) // 4.2 cm per difference
    expect(Math.max(...dtErr)).toBeLessThan(4 * ulSigmaM(0))
    expect(Math.max(...dtErr).toFixed(2)).toBe('0.11')
    const errs = posErr(rs)
    expect(errs).toHaveLength(2 * TAG_IDS.length)
    // Centimetres, from a tag that spent 181 µs of air and learned nothing: over 20 fixes the
    // worst is 6 cm, well inside four difference-sigmas of geometry (GDOP is about 1 here).
    expect(Math.max(...errs).toFixed(2)).toBe('0.06')
    expect(Math.max(...errs)).toBeLessThan(4 * ulSigmaM(0))
    for (const f of of(rs, 'UWB_POSITION')) expect(f.gdop).toBeLessThan(1.1)
  })

  it('turns a nanosecond of anchor sync error into decimetres of position error', () => {
    // syncErrorNs is a *fixed* draw per anchor, not a per-round one: a miscalibrated anchor is
    // wrong the same way in every round, so averaging blinks does not help. 1 ns is 30 cm of
    // range difference, and it lands almost whole in the fix.
    const off = run(ul({ syncErrorNs: 1 }), UL_RUN_NS)
    const dtErr = of(off, 'UWB_TDOA').map((d) => Math.abs(d.dtNs - d.trueDtNs) * C_M_PER_NS)
    expect(ulSigmaM(1) * 100).toBeCloseTo(42.6, 1) // 43 cm per difference, ten times σ at 0 ns
    expect(Math.max(...dtErr).toFixed(2)).toBe('1.02')
    expect(Math.max(...dtErr)).toBeLessThan(4 * ulSigmaM(1))
    const errs = posErr(off)
    expect(Math.max(...errs).toFixed(2)).toBe('0.73')
    expect(Math.max(...errs)).toBeLessThan(4 * ulSigmaM(1))
    // An order of magnitude worse than the synchronised run, for one nanosecond.
    expect(Math.max(...errs)).toBeGreaterThan(10 * Math.max(...posErr(rs)))
    // The ellipse grows with it, because `syncErrorNs` is in the sigma the solver is given:
    // 35 cm against the 3.6 cm of the synchronised run, beside a 73 cm worst case. It is a
    // first-order figure — a per-anchor bias is not white noise, as the inspector's hint says —
    // but it is now the same order as the error instead of twenty times under it.
    const ellipseA = (records: TLRecord[]): number => of(records, 'UWB_POSITION')[0].ellipse.a
    expect(ellipseA(rs).toFixed(3)).toBe('0.036')
    expect(ellipseA(off).toFixed(2)).toBe('0.35')
    expect(ellipseA(off)).toBeGreaterThan(Math.max(...errs) / 3)
    expect(ellipseA(off)).toBeLessThan(Math.max(...errs))
  })

  it('replays bit-for-bit, and needs the reference anchor to have heard the blink', () => {
    expect(run(ul(), UL_RUN_NS)).toEqual(run(ul(), UL_RUN_NS))
    // Anchor 1 is the reference every difference is taken against. Move it out of earshot and
    // the round produces nothing at all — not a set of differences against some other anchor.
    const deaf: Place[] = [{ x: 0, y: -60, z: 2.4, ppm: 0 }, ...CORNERS.slice(1)]
    const lost = run(uwbScenario(deaf, BLINKERS, { mode: 'ul-tdoa', nlos: false }), 200 * MS - 1)
    expect(of(lost, 'UWB_TDOA')).toEqual([])
    expect(of(lost, 'UWB_POSITION')).toEqual([])
  })
})

// --- contention rounds (standard §10.32.2 schedule mode 0) ---------------------

/**
 * A contention session as small as one can be: poll plus a two-slot response window, one
 * round per block (900 RSTU = 750 µs), so two anchors land in the same slot half the time.
 */
const TIGHT: Partial<UwbSessionCfg> = {
  method: 'ss', nlos: false, schedule: 'contention', contentionSlots: 2, slotRstu: 300, blockRstu: 900,
}
const TIGHT_ROUND_NS = 750_000

/** `n` anchors on a 5 m circle around the origin, ceiling height, crystals exact. */
const circle = (n: number, txPowerDbm?: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    x: 5 * Math.cos((2 * Math.PI * i) / n), y: 5 * Math.sin((2 * Math.PI * i) / n), z: 2, ppm: 0,
    ...(txPowerDbm === undefined ? {} : { txPowerDbm }),
  }))

const TAG_AT_ORIGIN: Place = { x: 0, y: 0, z: 1, ppm: 0 }

describe('UwbNetwork — contention rounds, two anchors of equal strength', () => {
  const sc = uwbScenario(circle(2), [TAG_AT_ORIGIN], TIGHT)
  // Six rounds: three collisions spend the whole retry budget, the fourth is sat out.
  const rs = run(sc, 6 * TIGHT_ROUND_NS - 1)
  const inRound = <T extends TLRecord['type']>(type: T, k: number, node?: string) =>
    of(rs, type, node).filter((r) => r.t >= k * TIGHT_ROUND_NS && r.t < (k + 1) * TIGHT_ROUND_NS)

  it('reserves the window the session asked for, and advertises it in the poll', () => {
    const round = of(rs, 'UWB_ROUND')[0]
    expect(round.slots).toBe(3) // poll + two response slots
    expect(of(rs, 'UWB_SLOT').filter((r) => r.t < TIGHT_ROUND_NS).map((r) => r.slot)).toEqual([0, 1, 2])
    const poll = of(rs, 'TX_START', 'tag-1')[0].frame
    expect(poll.uwb?.ies).toEqual(['ARC', 'RCPS', 'RCMA', 'RRMC'])
    expect(poll.uwb?.contention).toEqual({ firstSlot: 1, lastSlot: 2, maxAttempts: 3 })
    expect(poll.uwb?.schedule).toBeUndefined() // nobody is assigned a slot
  })

  it('loses both answers when both anchors draw the same slot', () => {
    expect(inRound('UWB_CONTEND', 0).map((r) => [r.node, r.slot, r.attempt]))
      .toEqual([['anc-1', 2, 1], ['anc-2', 2, 1]])
    // Neither leads the other by the 6 dB capture margin, so the medium dooms both.
    expect(inRound('RX_FAIL', 0, 'tag-1').map((r) => [r.from, r.reason]))
      .toEqual([['anc-1', 'collision'], ['anc-2', 'collision']])
    expect(inRound('UWB_RANGE', 0)).toEqual([])
    // One record per slot, not one per doomed answer.
    expect(inRound('UWB_CONTEND_COLLISION', 0).map((r) => [r.node, r.slot])).toEqual([['tag-1', 2]])
  })

  it('spends one attempt per unheard round, then sits exactly one round out', () => {
    // maxAttempts is 3: attempts 1, 2 and 3 all collide, the fourth round is silent
    // (slot null, attempt 0), and the fifth starts a fresh budget at attempt 1.
    expect(of(rs, 'UWB_CONTEND', 'anc-1').map((r) => [r.slot, r.attempt]))
      .toEqual([[2, 1], [1, 2], [1, 3], [null, 0], [1, 1], [2, 2]])
    expect(of(rs, 'UWB_CONTEND', 'anc-2').map((r) => [r.slot, r.attempt]))
      .toEqual([[2, 1], [1, 2], [1, 3], [null, 0], [1, 1], [1, 2]])
    // Nothing at all is transmitted in the round both anchors sit out…
    expect(inRound('TX_START', 3).map((r) => r.node)).toEqual(['tag-1'])
    // …and the fifth round, drawn from a refilled budget, collides once more.
    expect(inRound('UWB_RANGE', 4)).toEqual([])
    // The sixth separates them, and both are heard — so both go back to attempt 1 after it.
    expect(inRound('UWB_RANGE', 5).map((r) => r.peer)).toEqual(['anc-2', 'anc-1'])
  })

  it('never reports a silent contention slot as a timeout: the slot belongs to nobody', () => {
    // Round 3 is silent in both response slots and round 5 fills both; neither is a
    // peer that failed to answer, so no UWB_TIMEOUT is emitted anywhere in the run.
    expect(of(rs, 'UWB_TIMEOUT')).toEqual([])
  })
})

describe('UwbNetwork — a contention anchor that never heard the Poll', () => {
  // anc-2 stands 200 m away: the Poll reaches it far below the receiver's sensitivity, so it has
  // nothing to answer. `endRound` says a round whose Poll an anchor never heard is not its doing
  // - it neither draws a slot nor spends an attempt - and that carve-out is the one branch of
  // the guard nothing else exercises: delete it and every other test stays green while a missed
  // Poll quietly costs a responder its budget.
  const sc = uwbScenario([circle(2)[0], { x: 200, y: 0, z: 2, ppm: 0 }], [TAG_AT_ORIGIN], TIGHT)
  const rs = run(sc, 6 * TIGHT_ROUND_NS - 1)

  it('draws nothing, spends nothing, and leaves the near anchor’s rounds alone', () => {
    expect(of(rs, 'UWB_CONTEND', 'anc-2')).toEqual([])
    expect(of(rs, 'TX_START').some((r) => r.node === 'anc-2')).toBe(false)
    // the near anchor is ranged every round, so its budget is refilled every round: attempt 1
    // throughout, which is exactly what a spent attempt at the far anchor could not produce
    const near = of(rs, 'UWB_CONTEND', 'anc-1')
    expect(near).toHaveLength(6)
    expect(near.map((r) => r.attempt)).toEqual([1, 1, 1, 1, 1, 1])
    expect(of(rs, 'UWB_RANGE').map((r) => r.peer)).toEqual(Array(6).fill('anc-1'))
  })
})

describe('UwbNetwork — contention rounds, capture inside one slot', () => {
  // anc-2 radiates 10 dB above anc-1 from the same distance, so it clears the 6 dB
  // capture margin at the tag and is decoded through the other anchor's answer.
  const sc = uwbScenario([circle(2)[0], { ...circle(2)[1], txPowerDbm: UWB_TX_POWER_DBM + 10 }], [TAG_AT_ORIGIN], TIGHT)
  const rs = run(sc, TIGHT_ROUND_NS - 1)

  it('keeps the stronger answer and loses only the weaker one', () => {
    expect(of(rs, 'UWB_CONTEND').map((r) => [r.node, r.slot])).toEqual([['anc-1', 2], ['anc-2', 2]])
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].peer).toBe('anc-2')
    expect(Math.abs(ranges[0].distM - ranges[0].trueDistM)).toBeLessThan(3 * SS_CORRECTED_SIGMA_M)
    expect(of(rs, 'RX_FAIL', 'tag-1').map((r) => [r.from, r.reason])).toEqual([['anc-1', 'collision']])
    // A captured slot still cost the round one answer, so it is counted as a collision.
    expect(of(rs, 'UWB_CONTEND_COLLISION').map((r) => r.slot)).toEqual([2])
  })
})

describe('UwbNetwork — the contention draw', () => {
  /** One anchor the tag always hears: it is at attempt 1 in every round, so all 200
   * draws come from a full retry budget and the histogram is the raw distribution. */
  const solo = (): Scenario => uwbScenario(
    [{ x: 5, y: 0, z: 2, ppm: 0 }], [TAG_AT_ORIGIN],
    { method: 'ss', nlos: false, schedule: 'contention', contentionSlots: 8, slotRstu: 300, blockRstu: 2700 },
  )
  const ROUNDS = 200
  const draws = (sc: Scenario): (number | null)[] =>
    of(run(sc, ROUNDS * 2_250_000 - 1), 'UWB_CONTEND').map((r) => r.slot)

  it('is uniform over the whole response window', () => {
    const slots = draws(solo())
    expect(slots).toHaveLength(ROUNDS)
    expect(slots.every((s) => s !== null && s >= 1 && s <= 8)).toBe(true)
    const counts = Array.from({ length: 8 }, (_, i) => slots.filter((s) => s === i + 1).length)
    const expected = ROUNDS / 8
    const chi2 = counts.reduce((a, c) => a + (c - expected) ** 2 / expected, 0)
    // 7 degrees of freedom: the 99.9 % point is 24.3, so 30 is a loose bound that a
    // uniform generator passes and a biased one does not. Measured here: 10.48.
    expect(chi2).toBeLessThan(30)
  })

  it('is deterministic: the same seed draws the same 200 slots', () => {
    expect(draws(solo())).toEqual(draws(solo()))
  })

  it('leaves a time-scheduled session exactly as it was', () => {
    const timed = (session: Partial<UwbSessionCfg>): TLRecord[] =>
      run(uwbScenario(circle(4), [TAG_AT_ORIGIN], { method: 'ss', nlos: false, ...session }), 3 * 200 * MS)
    const base = timed({})
    // A time-scheduled round reads neither knob and draws nothing from any anchor's
    // stream, so moving both cannot shift one timestamp of the run.
    expect(timed({ contentionSlots: 31, maxAttempts: 9 })).toEqual(base)
    expect(of(base, 'UWB_CONTEND')).toEqual([])
    expect(of(base, 'UWB_CONTEND_COLLISION')).toEqual([])
  })
})

describe('UwbNetwork — six anchors contending, the numbers the lesson quotes', () => {
  // 400 µs slots (the smallest that fits a 6-anchor round) and one round per block, so
  // a variant's round is 1 + S slots long and 30 blocks are 30 rounds.
  const SIX: Partial<UwbSessionCfg> = {
    method: 'ss', nlos: false, schedule: 'contention', slotRstu: 480, blockRstu: 8160,
  }
  const BLOCK_NS = 6_800_000

  const measure = (contentionSlots: number) => {
    const rs = run(uwbScenario(circle(6), [TAG_AT_ORIGIN], { ...SIX, contentionSlots }), 30 * BLOCK_NS - 1)
    return {
      rounds: of(rs, 'UWB_ROUND').length,
      ranges: of(rs, 'UWB_RANGE').length,
      collisions: of(rs, 'UWB_CONTEND_COLLISION').length,
      sitOuts: of(rs, 'UWB_CONTEND').filter((r) => r.slot === null).length,
      fixes: of(rs, 'UWB_POSITION').length,
    }
  }

  it.each([
    { S: 4, ranges: 50, collisions: 45, sitOuts: 20, fixes: 5 },
    { S: 8, ranges: 90, collisions: 36, sitOuts: 8, fixes: 19 },
    { S: 16, ranges: 125, collisions: 25, sitOuts: 4, fixes: 25 },
  ])('S = $S: $ranges responses heard in 30 rounds', ({ S, ranges, collisions, sitOuts, fixes }) => {
    const m = measure(S)
    expect(m.rounds).toBe(30)
    expect(m).toEqual({ rounds: 30, ranges, collisions, sitOuts, fixes })
    // The analytic model of the lesson: N anchors, S slots, an anchor is alone in its
    // slot with probability (1 − 1/S)^(N−1), so N·(1 − 1/S)^(N−1) are heard per round.
    // The measurement runs a little above it at small S, because an anchor that has
    // just spent its budget sits the next round out and thins the field for the others.
    const analytic = 6 * (1 - 1 / S) ** 5
    expect(m.ranges / 30).toBeGreaterThan(analytic - 0.5)
    expect(m.ranges / 30).toBeLessThan(analytic + 0.5)
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

// --- 6 GHz coexistence ---------------------------------------------------------

/**
 * The coexistence lab: the four corner anchors of lesson 5 with one tag in the
 * middle on UWB channel 5, and — optionally — a 6 GHz BSS in the same room: one
 * eht AP and an 80 MHz laptop pulling a saturated download.
 *
 * The UWB nodes are listed LAST on purpose: traffic streams are seeded from a
 * node's index, so putting Wi-Fi stations in front must not renumber anything.
 */
function coexistScenario(opts: { wifi: boolean; centerMhz?: number }): Scenario {
  const laptop = wifiNode('laptop', 'laptop', 'sta', 6, 4, 'eht', 'saturated')
  const corners: Place[] = [
    { x: 0.5, y: 0.5, z: 2.4, ppm: 0 }, { x: 9.5, y: 0.5, z: 2.4, ppm: 0 },
    { x: 9.5, y: 7.5, z: 2.4, ppm: 0 }, { x: 0.5, y: 7.5, z: 2.4, ppm: 0 },
  ]
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'lab' }],
    walls: [],
    nodes: [
      ...(opts.wifi
        ? [
          wifiNode('ap', 'AP', 'ap', 5, 1, 'eht', 'idle'),
          { ...laptop, linkId: '6g' as const, caps: { ...laptop.caps, widthMhz: 80 as const } },
        ]
        : []),
      ...corners.map((p, i) => uwbNode(`anc-${i + 1}`, p, 'anchor')),
      uwbNode('tag-1', { x: 5, y: 4, z: 1, ppm: 0 }, 'tag'),
    ],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, channel: 5, nlos: false },
    ...(opts.centerMhz === undefined ? {} : { sixGhzCenterMhz: opts.centerMhz }),
  }
}

/** Every UWB record of a run, with the shared emitter's seq stripped: Wi-Fi records
 * are numbered from the same counter, so seq shifts as soon as a BSS is there. */
const uwbOnly = (rs: TLRecord[]): unknown[] => rs
  .filter((r) => r.type.startsWith('UWB_'))
  .map((r) => {
    const o: Record<string, unknown> = { ...r }
    delete o.seq
    return o
  })

describe('UwbNetwork — beside a 6 GHz Wi-Fi link', () => {
  it('changes not one ranging record when the two bands do not meet', () => {
    // Channel 7 (5945–6025 MHz) is clear of UWB channel 5, so no mediator is built
    // and the UWB engine is handed a null spectrum: the session runs as if alone.
    const beside = new Simulation(coexistScenario({ wifi: true, centerMhz: 5985 }))
    const alone = new Simulation(coexistScenario({ wifi: false }))
    expect(beside.spectrum).toBeNull()
    expect(alone.spectrum).toBeNull()
    const withWifi = uwbOnly(beside.runUntil(1000 * MS).records)
    expect(withWifi.length).toBeGreaterThan(50)
    expect(withWifi).toEqual(uwbOnly(alone.runUntil(1000 * MS).records))
  })

  it('loses ranging frames to an overlapping link, and none to one beside it', () => {
    const interfered = (centerMhz: number): Extract<TLRecord, { type: 'UWB_INTERFERED' }>[] => {
      const sim = new Simulation(coexistScenario({ wifi: true, centerMhz }))
      const rs = sim.runUntil(1000 * MS).records
      expect(sim.spectrum === null).toBe(centerMhz === 5985)
      return of(rs, 'UWB_INTERFERED')
    }
    const hit = interfered(6305)
    expect(hit.length).toBeGreaterThan(0)
    // Every one is a UWB receiver losing a UWB peer's frame, far under the −12 dB
    // its correlation gain is good for, to an AP a few metres away.
    for (const r of hit) {
      expect(r.sirDb).toBeLessThan(-12)
      expect(r.foreignDbm).toBeGreaterThan(-70)
    }
    expect(interfered(5985)).toEqual([])
  })
})

/**
 * Angle of arrival. One anchor, one tag, and a bearing on every frame the anchor receives
 * from it — which under DS-TWR is two per round (the Poll and the Final), the second of
 * which is the one the round's fix is built from.
 *
 * The geometry: an anchor at (5, 0.5) on the south wall, turned to face the room (`yawDeg`
 * 90, i.e. +y), and a tag 4 m away at 45° off that boresight. Both at z = 1, so the range is
 * exactly horizontal and the fix carries no slant-range bias to argue about.
 */
describe('UwbNetwork — angle of arrival', () => {
  const R_M = 4
  const THETA_DEG = 45
  const ANCHOR = { x: 5, y: 0.5, z: 1, ppm: 0, yawDeg: 90 }
  /** Where `R_M` at a world bearing puts a device. */
  const polar = (a: { x: number; y: number }, worldDeg: number): Place => ({
    x: a.x + R_M * Math.cos((worldDeg * Math.PI) / 180),
    y: a.y + R_M * Math.sin((worldDeg * Math.PI) / 180),
    z: 1, ppm: 0,
  })
  const TAG = polar(ANCHOR, ANCHOR.yawDeg + THETA_DEG)
  /** 1-σ of a bearing at the angle it is measured at (3.87° here), and of the fix across the ray. */
  const SIGMA_THETA_DEG = aoaSigmaDeg(THETA_DEG)
  const SIGMA_CROSS_M = R_M * SIGMA_THETA_DEG * (Math.PI / 180)

  const aoaScenario = (session: Partial<UwbSessionCfg> = {}): Scenario =>
    uwbScenario([ANCHOR], [TAG], { aoa: true, nlos: false, ...session })
  const BLOCKS = 3
  const rs = run(aoaScenario(), BLOCKS * 200 * MS)

  it('measures a bearing on every frame the anchor receives from the tag', () => {
    const bearings = of(rs, 'UWB_AOA')
    // Two per round of a DS exchange — the Poll and the Final — and none anywhere else:
    // the tag has one antenna and measures no angle at all.
    expect(bearings).toHaveLength(2 * BLOCKS)
    expect(new Set(bearings.map((r) => `${r.node} sees ${r.peer}`))).toEqual(new Set(['anc-1 sees tag-1']))
    for (const b of bearings) expect(b.trueThetaDeg).toBeCloseTo(THETA_DEG, 9)
    // The first block's two measurements, pinned: the phase noise is worth a few degrees here.
    expect(bearings[0].thetaDeg).toBeCloseTo(41.6236488, 6)
    expect(bearings[1].thetaDeg).toBeCloseTo(44.9876414, 6)
    // …and every one of them is inside 4 σ_θ of the truth.
    expect(SIGMA_THETA_DEG).toBeCloseTo(3.8688, 4)
    for (const b of bearings) expect(Math.abs(b.thetaDeg - b.trueThetaDeg)).toBeLessThan(4 * SIGMA_THETA_DEG)
  })

  it('fixes the tag from one anchor: a range along a bearing', () => {
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    for (const f of fixes) {
      // It is the anchor's record, about the tag — the one fix in the simulator that names a
      // single anchor, because a circle and a ray already meet in one point.
      expect(f.node).toBe('anc-1')
      expect(f.of).toBe('tag-1')
      expect(f.method).toBe('aoa')
      expect(f.anchors).toEqual(['anc-1'])
      expect(f.gdop).toBe(1)
      expect(f.trueX).toBeCloseTo(TAG.x, 9)
      expect(f.trueY).toBeCloseTo(TAG.y, 9)

      // Split the error into the two measurements it is made of: along the measured ray it is
      // the range's error, across it the bearing's. They are worth wildly different amounts.
      const bearingRad = Math.atan2(f.y - ANCHOR.y, f.x - ANCHOR.x)
      const ex = f.x - f.trueX
      const ey = f.y - f.trueY
      const along = ex * Math.cos(bearingRad) + ey * Math.sin(bearingRad)
      const across = -ex * Math.sin(bearingRad) + ey * Math.cos(bearingRad)
      expect(Math.abs(along)).toBeLessThan(4 * SIGMA_R)
      expect(Math.abs(across)).toBeLessThan(4 * SIGMA_CROSS_M)
      // The ellipse says the same thing: a sliver r·σ_θ long across the ray (27 cm) and σ_r
      // wide along it (2.1 cm), so the major axis is turned a quarter turn off the bearing.
      expect(f.ellipse.b).toBeCloseTo(SIGMA_R, 9)
      expect(f.ellipse.a).toBeCloseTo(SIGMA_CROSS_M, 1)
      expect(f.ellipse.thetaRad).toBeCloseTo(bearingRad + Math.PI / 2, 2)
    }
    // The tag itself solves nothing: one anchor is one range, and three are needed for a
    // two-way fix. Everything the tag's lane shows about its position came from the anchor.
    expect(of(rs, 'UWB_POSITION', 'tag-1')).toEqual([])
  })

  it('routes the anchor’s bearing and fix to the lanes they are about', () => {
    const sim = new Simulation(aoaScenario())
    sim.runUntil(BLOCKS * 200 * MS)
    // The bearing is the anchor's own measurement and stays on its lane…
    const anchor = sim.view.nodes['anc-1'].uwb!
    expect(anchor.aoa['tag-1'].n).toBe(2 * BLOCKS)
    expect(anchor.aoa['tag-1'].trueThetaDeg).toBeCloseTo(THETA_DEG, 9)
    expect(anchor.position).toBeNull()
    // …while the position it solved is about the tag, so it lands on the tag's lane (`of`).
    const tag = sim.view.nodes['tag-1'].uwb!
    expect(tag.aoa).toEqual({})
    expect(tag.position?.method).toBe('aoa')
    expect(tag.position?.anchors).toEqual(['anc-1'])
    expect(tag.position?.n).toBe(BLOCKS)
  })

  it('walks out the horizontal leg of a slant range, not the range itself', () => {
    // The lesson's own mounting: the anchor on the wall at 2.2 m, the tag at head height, and
    // 4 m between them on the floor. The flight time measures the slant distance — 4.18 m —
    // and multiplying *that* by a horizontal bearing would push the fix 18 cm past the tag,
    // every round, in the same direction. The fix uses √(r² − Δz²) against the height the tag
    // is configured at, exactly as solvePosition is handed a tag's z rather than solving it.
    const high = { ...ANCHOR, z: 2.2 }
    const tag = { ...polar(high, high.yawDeg + THETA_DEG), z: 1 }
    const slantM = Math.hypot(R_M, high.z - tag.z)
    expect(slantM).toBeCloseTo(4.176, 3)

    const rsHigh = run(uwbScenario([high], [tag], { aoa: true, nlos: false }), BLOCKS * 200 * MS)
    const ranges = of(rsHigh, 'UWB_RANGE', 'anc-1')
    expect(ranges).toHaveLength(BLOCKS)
    for (const r of ranges) expect(r.trueDistM).toBeCloseTo(slantM, 9) // the radio measures the slant
    const fixes = of(rsHigh, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    // The bias the correction removes is 17.6 cm, twice what four sigmas of range noise could
    // ever explain — so it is the *along-ray* component of the error that proves the point:
    // cross-range noise (27 cm of 1-σ here) lands in the other component and cannot hide it.
    expect(slantM - R_M).toBeCloseTo(0.176, 3)
    expect(slantM - R_M).toBeGreaterThan(4 * SIGMA_R)
    for (const f of fixes) {
      const horizM = Math.hypot(f.x - high.x, f.y - high.y)
      expect(horizM).toBeCloseTo(R_M, 1) // not the 4.18 m the radio measured
      const bearingRad = Math.atan2(f.y - high.y, f.x - high.x)
      const ex = f.x - f.trueX
      const ey = f.y - f.trueY
      const along = ex * Math.cos(bearingRad) + ey * Math.sin(bearingRad)
      const across = -ex * Math.sin(bearingRad) + ey * Math.cos(bearingRad)
      expect(Math.abs(along)).toBeLessThan(4 * SIGMA_R) // centimetres, not 17.6 of them
      expect(Math.abs(across)).toBeLessThan(4 * SIGMA_CROSS_M)
      // The cross-range axis is the *horizontal* range's, not the slant range's: it is
      // exactly rh·σ_θ at the angle this round measured.
      const thetaHat = (bearingRad * 180) / Math.PI - high.yawDeg
      expect(f.ellipse.a).toBeCloseTo(horizM * aoaSigmaDeg(thetaHat) * (Math.PI / 180), 9)
    }
  })

  it('mirrors a tag behind the anchor into the field of view', () => {
    // The same anchor, moved into the room and still facing +y, with the tag 135° off its
    // boresight — behind it. Two antennas cannot tell front from back, so the phase is the
    // phase of 45° and the bearing comes back as 45°: the fix is the tag's mirror image.
    const behind = { x: 5, y: 5, z: 1, ppm: 0, yawDeg: 90 }
    const tag = polar(behind, behind.yawDeg + 135)
    const rsBehind = run(uwbScenario([behind], [tag], { aoa: true, nlos: false }), 200 * MS)
    const bearings = of(rsBehind, 'UWB_AOA')
    expect(bearings).toHaveLength(2)
    for (const b of bearings) {
      expect(b.trueThetaDeg).toBeCloseTo(135, 9)
      expect(Math.abs(b.thetaDeg - 45)).toBeLessThan(4 * SIGMA_THETA_DEG)
    }
    const fix = of(rsBehind, 'UWB_POSITION')[0]
    // The range is right — a distance is measured by flight time and knows nothing of
    // antennas — and only the direction is a lie: the reflection across the array *baseline*,
    // the line through the anchor perpendicular to its boresight (here y = 5), not across the
    // boresight itself. sin(180° − θ) = sin θ sends 135° to +45°, which is this mirror; a
    // reflection in the boresight would have sent it to −135°.
    expect(Math.hypot(fix.x - behind.x, fix.y - behind.y)).toBeCloseTo(R_M, 1)
    expect(Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY)).toBeGreaterThan(5)
    // the mirror image itself, not merely an error of about the right size
    expect(fix.x).toBeCloseTo(tag.x, 1)
    expect(fix.y).toBeCloseTo(2 * behind.y - tag.y, 1)
    // and the error is twice the tag's distance from that baseline
    expect(Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY)).toBeCloseTo(2 * Math.abs(behind.y - tag.y), 1)
  })

  it('measures nothing, and draws nothing, when the session leaves AoA off', () => {
    const off = run(aoaScenario({ aoa: false }), BLOCKS * 200 * MS)
    expect(of(off, 'UWB_AOA')).toEqual([])
    expect(of(off, 'UWB_POSITION')).toEqual([])
    expect(of(off, 'UWB_RANGE')).toHaveLength(2 * BLOCKS) // the anchor's and the tag's, per block

    // Only the *anchor* draws for a bearing, and only after that reception's timestamp noise
    // and carrier-offset residual: so the tag's own stream is untouched, every stamp of it
    // identical with the feature on, while the anchor's stamps agree up to its first phase
    // draw (the Poll's) and part company from the next reception on (the Final's). That the
    // whole record stream of a session with AoA off is unchanged is pinned by the lesson
    // hashes, tests/engine/lesson-hashes.test.ts.
    const stamps = (rec: TLRecord[], node: string): number[] =>
      of(rec, 'UWB_TS', node).map((r) => r.counter)
    expect(stamps(rs, 'tag-1')).toEqual(stamps(off, 'tag-1'))
    const rxAt = (rec: TLRecord[]): number[] =>
      of(rec, 'UWB_TS', 'anc-1').filter((r) => r.dir === 'rx').map((r) => r.counter)
    expect(rxAt(rs)[0]).toBe(rxAt(off)[0]) // the Poll: stamped before the first phase draw
    expect(rxAt(rs)[1]).not.toBe(rxAt(off)[1]) // the Final: stamped after it
  })
})

// --- P802.15.4ab: the pairwise MMS cycle ------------------------------------------

/**
 * The 22 × 8 m hall of the MMS lessons. An MMS round holds exactly one tag and one anchor, so
 * the scenes below are read pair by pair: tag t and anchor k own round t·A + k of every block,
 * and the tag's fix is the block's, not the round's.
 *
 * The session is the draft's own ranging-cycle default — X = 8 RSFs of 82.05 µs, no integrity
 * train, one UNII-3 control channel — on the 600 RSTU (0.5 ms) slot the draft's §1.1.1 asks for.
 */
const MMS_SESSION: Partial<UwbSessionCfg> = { mode: 'mms', method: 'ss', slotRstu: 600, aoa: false }

const mmsCfg = (over: Partial<UwbSessionCfg['mms']> = {}): Partial<UwbSessionCfg> =>
  ({ ...MMS_SESSION, mms: { ...DEFAULT_UWB_SESSION.mms, ...over } })

function mmsScene(
  anchors: Place[], tags: Place[], session: Partial<UwbSessionCfg> = {}, walls: Wall[] = [],
): Scenario {
  const lab = rangingLab()
  return {
    rooms: lab.rooms,
    walls: [...lab.walls, ...walls],
    nodes: [
      ...anchors.map((p, i) => uwbNode(`anc-${i + 1}`, p, 'anchor')),
      ...tags.map((p, i) => uwbNode(`tag-${i + 1}`, p, 'tag')),
    ],
    servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...MMS_SESSION, ...session },
  }
}

/** The round of one pair round: 28 slots of 0.5 ms. */
const MMS_ROUND_NS = 14 * MS
/** 1-σ of the train-derived clock ratio at X = 8: √2 · 100 ps over the train's 7 ms span. */
const RATIO_SIGMA_PPM = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, 7) * 1e6

/** Three anchors in the first bay and one tag in the middle of the hall, all line of sight. */
const LOS_ANCHORS: Place[] = [
  { x: 1, y: 1, z: 1, ppm: 5 }, { x: 1, y: 7, z: 1, ppm: -7 }, { x: 8, y: 4, z: 1, ppm: 12 },
]
const LOS_TAG: Place = { x: 4, y: 4, z: 1, ppm: -15 }

describe('UwbNetwork — MMS, the shape of a pair round', () => {
  const sc = mmsScene(LOS_ANCHORS, [LOS_TAG], { nlos: false })
  const rs = run(sc, 210 * MS)

  it('runs one 28-slot round per tag–anchor pair, three to a block', () => {
    const rounds = of(rs, 'UWB_ROUND')
    expect(rounds.slice(0, 4).map((r) => [r.node, r.t, r.round, r.block, r.slots, r.mode])).toEqual([
      ['tag-1', 0, 0, 0, 28, 'mms'],
      ['tag-1', MMS_ROUND_NS, 1, 0, 28, 'mms'],
      ['tag-1', 2 * MMS_ROUND_NS, 2, 0, 28, 'mms'],
      ['tag-1', 200 * MS, 0, 1, 28, 'mms'],
    ])
    expect(rounds[0].method).toBe('ss')
    expect(rounds[0].untilNs).toBe(MMS_ROUND_NS)
  })

  it('opens each round on the narrowband radio and closes it on narrowband reports', () => {
    const kinds = of(rs, 'TX_START').filter((r) => r.t < MMS_ROUND_NS).map((r) => [r.node, r.frame.kind])
    expect(kinds.slice(0, 2)).toEqual([['tag-1', 'nbPoll'], ['anc-1', 'nbResp']])
    // Eight fragments each way, interleaved, then one report each way.
    expect(kinds.filter((k) => k[1] === 'uwbRsf')).toHaveLength(16)
    expect(kinds.slice(-2)).toEqual([['anc-1', 'nbReport'], ['tag-1', 'nbReport']])
  })

  it('puts every frame in the slot the layout gives it', () => {
    const at = (t: number) => Math.round(t / 500_000)
    const first = of(rs, 'TX_START').filter((r) => r.t < MMS_ROUND_NS)
    expect(first.map((r) => [at(r.t), r.frame.kind, r.node]).slice(0, 6)).toEqual([
      [0, 'nbPoll', 'tag-1'], [2, 'nbResp', 'anc-1'],
      [4, 'uwbRsf', 'tag-1'], [5, 'uwbRsf', 'anc-1'],
      [6, 'uwbRsf', 'tag-1'], [7, 'uwbRsf', 'anc-1'],
    ])
    expect(first.slice(-2).map((r) => [at(r.t), r.node])).toEqual([[24, 'anc-1'], [26, 'tag-1']])
  })

  it('stamps the train’s RMARKER at the first fragment’s TX instant, with no SHR offset', () => {
    const clock = new Simulation(sc).uwb!.devices.get('tag-1')!.clock
    const tx = of(rs, 'UWB_TS', 'tag-1').find((r) => r.dir === 'tx')!
    expect(tx.frameKind).toBe('uwbRsf')
    // Slot 4 of round 0: the fragment has no preamble at all, so its RMARKER is its first pulse.
    expect(tx.t).toBe(2 * MS)
    expect(tx.counter).toBe(clock.counter(2 * MS))
    expect(tx.counter).not.toBe(clock.counter(2 * MS + UWB_RMARKER_NS))
    // One TX stamp per train, not one per fragment.
    expect(of(rs, 'UWB_TS', 'tag-1').filter((r) => r.dir === 'tx' && r.t < MMS_ROUND_NS)).toHaveLength(1)
  })

  it('reports one train per side per round, all eight fragments heard', () => {
    const trains = of(rs, 'UWB_MMS_TRAIN').filter((r) => r.t < MMS_ROUND_NS)
    expect(trains.map((t) => [t.node, t.peer, t.kind, t.heard, t.fragments, t.detected]))
      .toEqual([['anc-1', 'tag-1', 'rsf', 8, 8, true], ['tag-1', 'anc-1', 'rsf', 8, 8, true]])
    for (const t of trains) {
      expect(t.gainDb).toBeCloseTo(10 * Math.log10(8), 9)
      expect(t.marginDb).toBeCloseTo(t.rxDbm + t.gainDb - UWB_RX_SENS_DBM, 9)
    }
  })

  it('never times out a lost fragment, and never stamps one on arrival', () => {
    // Every UWB_TS of an MMS round is a train's, not a fragment's: two per round per side.
    expect(of(rs, 'UWB_TIMEOUT')).toEqual([])
    const ts = of(rs, 'UWB_TS').filter((r) => r.t < MMS_ROUND_NS)
    expect(ts.map((r) => `${r.node} ${r.dir}`))
      .toEqual(['tag-1 tx', 'anc-1 tx', 'anc-1 rx', 'tag-1 rx'])
  })
})

describe('UwbNetwork — MMS, what a train measures', () => {
  const sc = mmsScene(LOS_ANCHORS, [LOS_TAG], { nlos: false })
  const rs = run(sc, 210 * MS)

  it('ranges every pair to the timestamp floor', () => {
    const ranges = of(rs, 'UWB_RANGE', 'tag-1')
    expect(ranges.map((r) => r.peer)).toEqual(['anc-1', 'anc-2', 'anc-3'])
    for (const r of ranges) {
      expect(r.method).toBe('ss')
      // The train's ratio leaves 1.5 mm of clock residual, so what is left is the two receive
      // timestamps: σ = c·σ_ts/√2 = 2.1 cm.
      expect(Math.abs(r.distM - r.trueDistM), `${r.peer} b${r.block}`).toBeLessThan(3 * SIGMA_R)
      expect(r.integrity).toBeUndefined() // no integrity train in this session
    }
  })

  it('measures the peer’s crystal against its own, over the whole length of the train', () => {
    const ppm: Record<string, number> = { 'tag-1': -15, 'anc-1': 5, 'anc-2': -7, 'anc-3': 12 }
    for (const t of of(rs, 'UWB_MMS_TRAIN')) {
      expect(t.ratioPpm).not.toBeNull()
      // The ratio is this device's counter per the peer's, i.e. its own ppm minus the peer's.
      const truth = ppm[t.node] - ppm[t.peer]
      expect(Math.abs(t.ratioPpm! - truth), `${t.node} ← ${t.peer}`).toBeLessThan(4 * RATIO_SIGMA_PPM)
    }
    expect(RATIO_SIGMA_PPM).toBeCloseTo(0.0202, 4)
  })

  it('the corrected range is at the timestamp floor over twenty rounds, not at the carrier’s', () => {
    const long = run(mmsScene(LOS_ANCHORS, [LOS_TAG], { nlos: false }), 20 * 200 * MS)
    const errs = of(long, 'UWB_RANGE', 'tag-1').filter((r) => r.peer === 'anc-3')
      .map((r) => r.distM - r.trueDistM)
    expect(errs.length).toBeGreaterThanOrEqual(20)
    const rms = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length)
    // The timestamp floor is 2.1 cm; the carrier-only correction would add 1.5 cm in quadrature
    // and 20 ppm uncorrected would be 1.5 m. Anything near the floor says the ratio did its job.
    expect(rms).toBeGreaterThan(0.5 * SIGMA_R)
    expect(rms).toBeLessThan(1.6 * SIGMA_R)
  })

  it('fixes the tag once a block, after its last pair round, from the block’s three ranges', () => {
    const fixes = of(rs, 'UWB_POSITION')
    expect(fixes.map((f) => [f.node, f.t, f.block, f.method]))
      .toEqual([['tag-1', 3 * MMS_ROUND_NS, 0, 'twr']])
    expect(fixes[0].anchors).toEqual(['anc-1', 'anc-2', 'anc-3'])
    expect(Math.hypot(fixes[0].x - fixes[0].trueX, fixes[0].y - fixes[0].trueY)).toBeLessThan(0.1)
    // …and the round's own end follows the fix, as in every other mode.
    const ends = of(rs, 'UWB_ROUND_END', 'tag-1')
    expect(ends.filter((e) => e.t === 3 * MMS_ROUND_NS)).toHaveLength(1)
    expect(fixes[0].seq).toBeLessThan(ends.find((e) => e.t === 3 * MMS_ROUND_NS)!.seq)
  })
})

describe('UwbNetwork — MMS, reach behind two brick walls', () => {
  // The lesson's geometry: three anchors in the first bay, the tag two full-height brick
  // partitions away, 12.5 m off. Every fragment lands at −100.26 dBm, seven decibels under the
  // receiver's own sensitivity; only the train can rescue it.
  const walls = [brick(5, 0, 5, 8), brick(10, 0, 10, 8)]
  const anchors: Place[] = [{ x: 0.5, y: 0.5, z: 2.2 }, { x: 0.5, y: 7.5, z: 2.2 }, { x: 4.5, y: 4, z: 2.2 }]
  const tag: Place[] = [{ x: 13, y: 4, z: 1 }]
  /** Trains at the tag, per anchor. The two far anchors are 13.03 m off, the third only
   * 8.58 m — three and a half decibels nearer, which is more than the whole span the X = 4 /
   * X = 8 lesson lives in, so the two groups are read apart. */
  const at = (rsfs: UwbSessionCfg['mms']['rsfs'], peer: string) =>
    of(run(mmsScene(anchors, tag, mmsCfg({ rsfs }), walls), 3 * 14 * MS), 'UWB_MMS_TRAIN', 'tag-1')
      .filter((t) => t.peer === peer)

  it('hears eight fragments into a range, with one to two decibels of margin', () => {
    for (const peer of ['anc-1', 'anc-2']) {
      const trains = at(8, peer)
      expect(trains.length, peer).toBeGreaterThan(0)
      for (const t of trains) {
        expect(t.heard, peer).toBe(8)
        // No single fragment is audible on its own: only the train is.
        expect(t.rxDbm, peer).toBeLessThan(UWB_RX_SENS_DBM)
        expect(t.marginDb, peer).toBeGreaterThan(1)
        expect(t.marginDb, peer).toBeLessThan(2)
        expect(t.detected, peer).toBe(true)
      }
    }
    const rs = run(mmsScene(anchors, tag, mmsCfg({ rsfs: 8 }), walls), 3 * 14 * MS)
    expect(of(rs, 'UWB_RANGE', 'tag-1').map((r) => r.peer)).toEqual(['anc-1', 'anc-2', 'anc-3'])
  })

  it('hears four of them into nothing at all, from the two anchors furthest away', () => {
    for (const peer of ['anc-1', 'anc-2']) {
      const trains = at(4, peer)
      expect(trains.length, peer).toBeGreaterThan(0)
      for (const t of trains) {
        expect(t.heard, peer).toBe(4)
        expect(t.marginDb, peer).toBeLessThan(0)
        expect(t.detected, peer).toBe(false)
        expect(t.ratioPpm, peer).toBeNull()
      }
    }
    // Neither side of those two pairs holds an RMARKER, so neither reports a thing, and both
    // report windows expire instead. (The window stops before the near anchor's own round.)
    const rs = run(mmsScene(anchors, tag, mmsCfg({ rsfs: 4 }), walls), 2 * 14 * MS)
    expect(of(rs, 'UWB_RANGE')).toEqual([])
    expect(of(rs, 'UWB_TIMEOUT').map((r) => r.expected)).toContain('nbReport')
  })

  it('is three decibels a doubling either way: the near anchor keeps its train at four', () => {
    const t4 = at(4, 'anc-3')[0]
    const t8 = at(8, 'anc-3')[0]
    expect(t4.detected).toBe(true)
    expect(t8.marginDb - t4.marginDb).toBeCloseTo(10 * Math.log10(2), 9)
  })

  it('combines sixteen fragments into twelve decibels', () => {
    const t = at(16, 'anc-1')[0]
    expect(t.heard).toBe(16)
    expect(t.marginDb).toBeCloseTo(t.rxDbm + 10 * Math.log10(16) - UWB_RX_SENS_DBM, 9)
    expect(t.detected).toBe(true)
  })
})

describe('UwbNetwork — MMS, one fragment falls back to the carrier', () => {
  /** The tag's own random stream, as the network forks it: crystal origin, then the draws. */
  const tagStream = (seed: number): () => number => {
    const r = new Rng(seed).fork(hashStr('tag-1#uwb'))
    r.next() // the counter origin (the crystal itself is configured, so it is not drawn)
    return () => {
      const u1 = Math.max(r.next(), 1e-12)
      const u2 = r.next()
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    }
  }
  const anchor: Place[] = [{ x: 1, y: 1, z: 1, ppm: 5 }]
  const tag: Place[] = [{ x: 4, y: 4, z: 1, ppm: -15 }]
  /** coffs, recovered from the record: tofRctu − tofRawRctu = reply · coffs / 2. */
  const coffsOf = (rs: TLRecord[]): number => {
    const r = of(rs, 'UWB_RANGE', 'tag-1')[0]
    const reply = of(rs, 'TX_START', 'anc-1').map((x) => x.frame.uwb?.nb?.replyRctu).find((x) => x !== undefined)!
    return (2 * (r.tofRctu - r.tofRawRctu!)) / reply
  }

  it('measures no ratio from one fragment, and draws the carrier residual instead', () => {
    const rs = run(mmsScene(anchor, tag, mmsCfg({ rsfs: 1 }), []), 14 * MS)
    for (const t of of(rs, 'UWB_MMS_TRAIN')) {
      expect(t.heard).toBe(1)
      expect(t.detected).toBe(true)
      expect(t.ratioPpm).toBeNull()
    }
    // The draws, in the spec's order: the RMARKER stamp first, then — because there is no
    // second fragment to measure a span over — the carrier-offset residual, once.
    const next = tagStream(7)
    next() // the RMARKER stamp of the anchor's single fragment
    const residual = next()
    const truth = (5 - -15) * 1e-6 // the responder's crystal against the initiator's
    expect(coffsOf(rs)).toBeCloseTo(truth + residual * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6, 15)
  })

  it('takes the ratio from two fragments, and draws no carrier residual at all', () => {
    const rs = run(mmsScene(anchor, tag, mmsCfg({ rsfs: 2 }), []), 14 * MS)
    const train = of(rs, 'UWB_MMS_TRAIN', 'tag-1')[0]
    expect(train.ratioPpm).not.toBeNull()
    // The initiator inverts the ratio it measured — the correction is always the responder's
    // rate against the initiator's — and nothing else is drawn for it.
    const ratio = 1 + train.ratioPpm! * 1e-6
    expect(coffsOf(rs)).toBeCloseTo(1 / ratio - 1, 15)
  })
})

describe('UwbNetwork — MMS, a train whose leading fragment was lost', () => {
  // ±20 ppm, the widest pair of crystals the standard allows (standard §16.4.9), so the
  // walk-back to a lost RMARKER is the worst it can be.
  const TAG_PPM = -20
  const ANC_PPM = 20

  /**
   * One pair on UWB channel 5, driven by hand so a `Spectrum` can be put around it, with a
   * single Wi-Fi emission parked over the UWB channel for one slot only. There is no production
   * hook for dropping a fragment, and none is wanted: the channel's own SIR rule does it, and
   * the window is cut so that only the initiator's fragment 0 — slot 4, 2.000 ms — is inside it.
   * Its fragment 1 (slot 6, 3.000 ms) and the responder's whole train (slots 5, 7, …) are not.
   */
  const runWithOneSlotOfWifi = (): TLRecord[] => {
    const nodes = [
      uwbNode('anc-1', { x: 1, y: 1, z: 1, ppm: ANC_PPM }, 'anchor'),
      uwbNode('tag-1', { x: 4, y: 4, z: 1, ppm: TAG_PPM }, 'tag'),
    ]
    const q = new EventQueue()
    let now = 0
    const recs: TLRecord[] = []
    const emit = makeEmitter((x) => recs.push(x as TLRecord))
    const sp = new Spectrum([], q, () => now)
    const band = UWB_BAND_MHZ[5]
    const wifi: Emission = {
      txId: 'ap', eirpDbm: 20, bandLoMhz: band.lo, bandHiMhz: band.hi,
      // A metre from the anchor: an in-band Wi-Fi reading far above the fragment's own power,
      // which is well under the receiver's −12 dB correlation margin — the fragment is lost.
      pos: { x: 2, y: 1, z: 1 }, lossDb: wifiToUwbPathLossDb,
    }
    q.schedule(2 * MS - 1, () => sp.emit('wifi', wifi), 0)
    q.schedule(2 * MS + 400_000, () => sp.retire('wifi', wifi), 0)
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, ...MMS_SESSION, channel: 5, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms },
    }
    new UwbNetwork(q, () => now, nodes, [], cfg, new Rng(7), emit, sp, 7)
    for (;;) {
      const t = q.peekTime()
      if (t === null || t > 30 * MS) break
      const e = q.pop()!
      now = e.t
      e.fn()
    }
    return recs
  }

  const recs = runWithOneSlotOfWifi()

  it('loses the initiator’s first fragment, and that one only', () => {
    const lost = of(recs, 'UWB_INTERFERED')
    expect(lost.map((r) => [r.node, r.from])).toEqual([['anc-1', 'tag-1']])
    // Slot 4 is 2.000 ms; the fragment flies 4.24 m (15 ns, rounded up) and is 82.05 µs long,
    // so its reception ends there — the only reception the Wi-Fi window ever touched.
    expect(lost[0].t).toBe(2 * MS + 15 + rsfNs(DEFAULT_UWB_SESSION.mms.nMsr, DEFAULT_UWB_SESSION.mms.gap))
    expect(lost[0].sirDb).toBeLessThan(UWB_SIR_MIN_DB)
  })

  it('hears seven of the eight and still detects the train', () => {
    const trains = of(recs, 'UWB_MMS_TRAIN').filter((t) => t.t < MMS_ROUND_NS)
    expect(trains.map((t) => [t.node, t.peer, t.heard, t.fragments, t.detected]))
      .toEqual([['anc-1', 'tag-1', 7, 8, true], ['tag-1', 'anc-1', 8, 8, true]])
    // The responder still has a span to measure the ratio over — six milliseconds, not seven.
    expect(trains[0].ratioPpm).not.toBeNull()
    expect(Math.abs(trains[0].ratioPpm! - (ANC_PPM - TAG_PPM)))
      .toBeLessThan(4 * ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, 6) * 1e6)
  })

  it('walks the RMARKER back by the train’s own ratio, and so ranges through the loss', () => {
    // What the walk-back costs when it covers an undrifted millisecond instead: the responder's
    // reply time comes out short by index × 1 ms × the initiator's ppm, and half of that is
    // time of flight.
    const wouldBeErrM = ((1 * MS * Math.abs(TAG_PPM) * 1e-6) / 2) * C_M_PER_NS
    expect(wouldBeErrM).toBeCloseTo(3.0, 1)

    const ranges = of(recs, 'UWB_RANGE').filter((r) => r.block === 0 && r.round === 0)
    expect(ranges.map((r) => r.node)).toEqual(['tag-1', 'anc-1'])
    for (const r of ranges) {
      // Still at the timestamp floor: nothing of the lost millisecond survives in the range.
      expect(Math.abs(r.distM - r.trueDistM), r.node).toBeLessThan(4 * SIGMA_R)
      expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(wouldBeErrM / 20)
    }
  })
})

describe('UwbNetwork — MMS, the integrity train', () => {
  const anchor: Place[] = [{ x: 0.5, y: 4, z: 1 }]
  const mixed5 = mmsSet('mixed-5') // X = 2 RSFs, Y = 2 RIFs

  it('flags a range the integrity train vouched for', () => {
    const rs = run(mmsScene(anchor, [{ x: 6, y: 4, z: 1 }], mmsCfg(mixed5), []), 14 * MS)
    const kinds = of(rs, 'UWB_MMS_TRAIN', 'tag-1').map((t) => [t.kind, t.detected])
    expect(kinds).toEqual([['rsf', true], ['rif', true]])
    expect(of(rs, 'UWB_RANGE', 'tag-1').map((r) => r.integrity)).toEqual([true])
  })

  it('still ranges when the integrity train is lost, and says the range is unverified', () => {
    // The same train with a four-times longer STS segment: an integrity fragment then spends
    // its millisecond over 262 µs instead of 66, which is 4.6 dB quieter than an RSF. One brick
    // wall and 20 m puts exactly that gap across the receiver's sensitivity.
    const rs = run(mmsScene(
      anchor, [{ x: 20.5, y: 4, z: 1 }],
      mmsCfg({ ...mixed5, stsLen: 256 }), [brick(11, 0, 11, 8)],
    ), 14 * MS)
    const trains = of(rs, 'UWB_MMS_TRAIN', 'tag-1')
    expect(trains.map((t) => [t.kind, t.detected])).toEqual([['rsf', true], ['rif', false]])
    expect(trains[0].marginDb - trains[1].marginDb).toBeCloseTo(4.59, 2)
    const ranges = of(rs, 'UWB_RANGE', 'tag-1')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].integrity).toBe(false)
    // The range itself is the RSF train's, and the integrity train's loss costs it nothing.
    // What is left is the brick wall's own 2 ns of excess delay: both RMARKERs cross it, so the
    // round trip keeps it rather than cancelling it — 60 cm of honest NLOS bias.
    const biasM = UWB_NLOS_NS.brick * C_M_PER_NS
    expect(Math.abs(ranges[0].distM - ranges[0].trueDistM - biasM)).toBeLessThan(3 * SIGMA_R)
  })
})

describe('UwbNetwork — MMS, who reports and who ranges', () => {
  const lane = (report: 'responder' | 'initiator' | 'bi'): TLRecord[] =>
    run(mmsScene(
      [{ x: 1, y: 1, z: 1, ppm: 5 }], [{ x: 4, y: 4, z: 1, ppm: -15 }], mmsCfg({ report }), [],
    ), 14 * MS)

  it('gives the range to the side the report mode names', () => {
    expect(of(lane('responder'), 'UWB_RANGE').map((r) => r.node)).toEqual(['tag-1'])
    expect(of(lane('initiator'), 'UWB_RANGE').map((r) => r.node)).toEqual(['anc-1'])
    expect(of(lane('bi'), 'UWB_RANGE').map((r) => r.node)).toEqual(['tag-1', 'anc-1'])
  })

  it('puts exactly one narrowband report on the air per reporting side', () => {
    const reports = (m: 'responder' | 'initiator' | 'bi') =>
      of(lane(m), 'TX_START').filter((r) => r.frame.kind === 'nbReport').map((r) => r.node)
    expect(reports('responder')).toEqual(['anc-1'])
    expect(reports('initiator')).toEqual(['tag-1'])
    expect(reports('bi')).toEqual(['anc-1', 'tag-1'])
  })

  it('agrees on the distance from both ends, to the ratio’s own noise', () => {
    const both = of(lane('bi'), 'UWB_RANGE')
    // The two sides compute from the same round trip and reply time and differ only in the
    // clock ratio each measured for itself: ½·T_reply·√2·σ_ratio, 2.1 mm at a 0.5 ms reply.
    expect(Math.abs(both[0].distM - both[1].distM)).toBeLessThan(0.01)
    expect(both[0].trueDistM).toBeCloseTo(both[1].trueDistM, 9)
  })
})

describe('UwbNetwork — MMS, the narrowband control plane', () => {
  it('hops the control channel per block, over the session’s allow list', () => {
    const list = [100, 150, 200, 210]
    const rs = run(mmsScene(
      [{ x: 1, y: 1, z: 1 }], [{ x: 4, y: 4, z: 1 }], mmsCfg({ nbChannels: list, nbLbt: 'off' }), [],
    ), 620 * MS)
    const polls = of(rs, 'TX_START', 'tag-1').filter((r) => r.frame.kind === 'nbPoll')
    expect(polls.map((r) => r.frame.uwb?.nb?.channel))
      .toEqual([0, 1, 2, 3].map((b) => nbChannelForBlock(list, 7, b)))
    // …and the frame carries the centre the channel plan gives it, for the decoder to print.
    expect(polls[0].frame.uwb?.nb?.centerMhz).toBe(nbCenterMhz(polls[0].frame.uwb!.nb!.channel))
  })

  /**
   * One pair, driven by hand so a `Spectrum` can be built around it — the simulator makes its
   * own, and a listen-before-talk check has nothing to read without one. `wifiBand` null leaves
   * the air empty; otherwise a Wi-Fi emission is parked on that band for the whole run.
   */
  const runWithSpectrum = (
    wifiBand: { lo: number; hi: number } | null, session: Partial<UwbSessionCfg['mms']> = {},
  ): TLRecord[] => {
    const nodes = [
      uwbNode('anc-1', { x: 1, y: 1, z: 1, ppm: 5 }, 'anchor'),
      uwbNode('tag-1', { x: 4, y: 4, z: 1, ppm: -15 }, 'tag'),
    ]
    const q = new EventQueue()
    let now = 0
    const recs: TLRecord[] = []
    const emit = makeEmitter((x) => recs.push(x as TLRecord))
    const sp = wifiBand === null ? null : new Spectrum([], q, () => now)
    if (sp && wifiBand) {
      sp.emit('wifi', {
        txId: 'ap', eirpDbm: 20, bandLoMhz: wifiBand.lo, bandHiMhz: wifiBand.hi,
        pos: { x: 5, y: 5, z: 1 }, lossDb: wifiToUwbPathLossDb,
      })
    }
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, ...MMS_SESSION, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...session },
    }
    new UwbNetwork(q, () => now, nodes, [], cfg, new Rng(7), emit, sp, 7)
    for (;;) {
      const t = q.peekTime()
      if (t === null || t > 30 * MS) break
      const e = q.pop()!
      now = e.t
      e.fn()
    }
    return recs
  }

  /** The control channel's own 2.5 MHz, widened by 10 MHz each way so the overlap is total. */
  const overNbChannel = (): { lo: number; hi: number } => {
    const band = nbBand(DEFAULT_UWB_SESSION.mms.nbChannels[0])
    return { lo: band.lo - 10, hi: band.hi + 10 }
  }

  it('a busy listen-before-talk check costs the whole block, not one message', () => {
    // A Wi-Fi emission parked over the control channel, loud enough at the tag to sit above the
    // draft's −71.02 dBm energy-detection threshold.
    const recs = runWithSpectrum(overNbChannel(), { nbLbt: 'on' })
    const busy = of(recs, 'UWB_NB_LBT')
    expect(busy.map((r) => [r.node, r.channel, r.block, r.round]))
      .toEqual([['tag-1', DEFAULT_UWB_SESSION.mms.nbChannels[0], 0, 0]])
    expect(busy[0].thresholdDbm).toBeCloseTo(NB_LBT_THRESHOLD_DBM, 9)
    expect(busy[0].foreignDbm).toBeGreaterThanOrEqual(NB_LBT_THRESHOLD_DBM)
    // Nothing goes on the air at all: with no poll there is no cycle, on either side.
    expect(of(recs, 'TX_START')).toEqual([])
    // The responder is left waiting for a poll that never came, and says so exactly once.
    expect(of(recs, 'UWB_TIMEOUT').map((r) => [r.node, r.slot, r.expected]))
      .toEqual([['anc-1', 0, 'nbPoll']])
    expect(of(recs, 'UWB_RANGE')).toEqual([])
  })

  it('draws nothing and says nothing when there is no mediator to read at all', () => {
    const rs = run(mmsScene(
      [{ x: 1, y: 1, z: 1, ppm: 5 }], [{ x: 4, y: 4, z: 1, ppm: -15 }], mmsCfg({ nbLbt: 'on' }), [],
    ), 14 * MS)
    expect(of(rs, 'UWB_NB_LBT')).toEqual([])
    // A clear check must not move the stream either: the same session with the check off is
    // record for record the same run.
    const off = run(mmsScene(
      [{ x: 1, y: 1, z: 1, ppm: 5 }], [{ x: 4, y: 4, z: 1, ppm: -15 }], mmsCfg({ nbLbt: 'off' }), [],
    ), 14 * MS)
    expect(rs).toEqual(off)
  })

  it('draws nothing and says nothing when the mediator is there and the channel is clear', () => {
    // The stronger case: a Wi-Fi link really is on the air, on 6 GHz channel 71 — 500 MHz above
    // the control channel and outside UWB channel 9 as well, so it overlaps neither radio.
    const clear = runWithSpectrum({ lo: 6265, hi: 6345 }, { nbLbt: 'on' })
    expect(of(clear, 'UWB_NB_LBT')).toEqual([])
    // The window holds one pair round — the block is 200 ms — and its poll went out.
    expect(of(clear, 'TX_START', 'tag-1').filter((r) => r.frame.kind === 'nbPoll')).toHaveLength(1)
    expect(of(clear, 'UWB_RANGE').length).toBeGreaterThan(0)
    // …and it drew nothing for the check: the run is record for record the one with no mediator
    // at all, which a single extra draw anywhere would break.
    expect(clear).toEqual(runWithSpectrum(null, { nbLbt: 'on' }))
  })
})

describe('UwbNetwork — MMS, the block must hold every pair', () => {
  it('counts pairs, not tags, and says so', () => {
    const nodes = [
      uwbNode('anc-1', { x: 0, y: 0, z: 1 }, 'anchor'), uwbNode('anc-2', { x: 5, y: 0, z: 1 }, 'anchor'),
      uwbNode('tag-1', { x: 1, y: 1, z: 1 }, 'tag'), uwbNode('tag-2', { x: 2, y: 2, z: 1 }, 'tag'),
    ]
    // 28 slots × 0.5 ms = 14 ms a round; a 42 ms block holds three, and four pairs need four.
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, ...MMS_SESSION, blockRstu: 50_400,
      mms: { ...DEFAULT_UWB_SESSION.mms },
    }
    expect(() => new UwbNetwork(new EventQueue(), () => 0, nodes, [], cfg, new Rng(1), makeEmitter(() => {})))
      .toThrow(/4 pairs need 4 rounds, but a 42000000 ns block holds 3 rounds/)
  })

  it('takes more anchors than a Final could ever list, because no MMS frame lists them', () => {
    const anchors: Place[] = Array.from({ length: UWB_MAX_ANCHORS + 2 }, (_, i) => ({ x: 1 + i * 0.5, y: 1, z: 1 }))
    // Eleven pairs of 14 ms need 154 ms, which one 200 ms block holds; the window stops just
    // short of the next block, so the counts below are exactly one block's.
    expect(anchors.length).toBeGreaterThan(UWB_MAX_ANCHORS)
    const rs = run(mmsScene(anchors, [{ x: 4, y: 4, z: 1 }], mmsCfg(), []), 199 * MS)
    expect(of(rs, 'UWB_ROUND')).toHaveLength(anchors.length)
    expect(of(rs, 'UWB_RANGE', 'tag-1')).toHaveLength(anchors.length)
  })
})

describe('UwbNetwork — MMS determinism, and the older modes left alone', () => {
  it('replays bit-for-bit', () => {
    const build = (): Scenario => mmsScene(LOS_ANCHORS, [LOS_TAG], { nlos: false })
    expect(run(build(), 60 * MS)).toEqual(run(build(), 60 * MS))
  })

  it('changes not one record of a two-way session, whatever the MMS knobs say', () => {
    const twr = (session: Partial<UwbSessionCfg>): TLRecord[] =>
      run(uwbScenario(ring(0), [{ x: 0, y: 0, z: 1, ppm: 0 }], { nlos: false, ...session }), 3 * 200 * MS)
    const base = twr({})
    expect(twr({ mms: { ...DEFAULT_UWB_SESSION.mms, rsfs: 16, nbLbt: 'on', report: 'initiator' } })).toEqual(base)
    expect(of(base, 'UWB_MMS_TRAIN')).toEqual([])
    expect(of(base, 'UWB_NB_LBT')).toEqual([])
  })
})
