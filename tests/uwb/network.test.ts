import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, defaultScenario, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import { node as wifiNode } from '../../src/course/lessonKit'
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
 * calibration offsets, all in one subtraction. (The ellipse the solver draws uses √2·σ_r, i.e.
 * c·σ_ts — a √2 below this, as in DL-TDoA: it is the model's documented approximation.)
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
