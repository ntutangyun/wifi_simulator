/**
 * Many-to-many ranging, IEEE Std 802.15.4-2024 §10.32.6 (SS-TWR, Figure 10-240) and §10.32.7 (DS-TWR,
 * Figure 10-241). 2026-11-11 (W3, audit #2): rewritten for the standard's round — a controller's RCM
 * (ARC Multi-node Mode 2, RDM roles and slots), M initiators' ranging initiation messages, N responders'
 * responses (SS: one RRTI per initiator; DS: RRMC (3)), and, DS only, the initiators' final frames
 * (RRTI + RMI). Until then every device was initiator and responder at once and carried two IEs the
 * standard does not define (TXT, RXT); the tests that pinned that behaviour are gone.
 *
 * Every test runs whole rounds and reads the records they produced.
 */
import { describe, expect, it } from 'vitest'
import { hashStr } from '../../src/engine/hash'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import {
  UWB_MAX_PSDU_BYTES, UWB_TX_POWER_DBM, rrtiIeBytes, uwbFinalBytes, uwbInitBytes, uwbM2mLongestBytes,
  uwbM2mOverflow, uwbM2mRcmBytes, uwbM2mRespBytes, uwbPollBytes, uwbSlotsPerTag, UWB_BARE_RESP_BYTES,
  UWB_MHR_BYTES, UWB_FCS_BYTES,
} from '../../src/uwb/phy'
import { m2mRoles, roundPlan, slotAction } from '../../src/uwb/session'

const MS = 1_000_000
/** One 200 ms block's first round (the longest below is well under 30 ms) and no second block. */
const RUN_NS = 100 * MS

/** Initiator k is `t-k` (a tag), responder j is `a-j` (an anchor); ids sort into slot order. */
const tId = (k: number): string => `t-${k}`
const aId = (j: number): string => `a-${j}`
const T_PLACES = [{ x: 5, y: 5 }, { x: 13, y: 10 }, { x: 17, y: 8 }]
const A_PLACES = [{ x: 1, y: 1 }, { x: 19, y: 1 }, { x: 19, y: 15 }, { x: 1, y: 15 }]
const PPM = [0, 18, -14, 9, -20, 5, 12]

function node(id: string, role: 'anchor' | 'tag', p: { x: number; y: number }, ppm = 0): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { ...p, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} }, uwb: { role, ppm },
  }
}

function group(m: number, n: number, ppm = false): NodeCfg[] {
  return [
    ...Array.from({ length: m }, (_, k) => node(tId(k), 'tag', T_PLACES[k], ppm ? PPM[k] : 0)),
    ...Array.from({ length: n }, (_, j) => node(aId(j), 'anchor', A_PLACES[j], ppm ? PPM[m + j] : 0)),
  ]
}

/** No timestamp noise, no carrier-offset estimator noise, no excess delay. */
const QUIET: Partial<UwbSessionCfg> = { nlos: false, tsNoisePs: 0, cfoNoisePpm: 0 }

function scenario(nodes: NodeCfg[], session: Partial<UwbSessionCfg>, walls: Wall[] = []): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'lab' }], walls, nodes, servers: [], seed: 7,
    rtsThresholdBytes: 3000, snapshotIntervalMs: 10, uwb: { ...DEFAULT_UWB_SESSION, ...session },
  }
}
const run = (sc: Scenario): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return new Simulation(sc).runUntil(RUN_NS).records
}
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never
const m2m = (m: number, n: number, method: 'ss' | 'ds', extra: Partial<UwbSessionCfg> = {}, walls: Wall[] = []): TLRecord[] =>
  run(scenario(group(m, n), { mode: 'm2m', method, ...QUIET, ...extra }, walls))

describe('frame sizes (standard §10.32.6/§10.32.7; 2026-11-11, W3)', () => {
  it('the controller\'s RCM is the time-scheduled Poll over the M − 1 + N controlees', () => {
    expect(uwbM2mRcmBytes(2, 4)).toBe(uwbPollBytes(5))
    expect(uwbM2mRcmBytes(2, 4)).toBe(45)
  })
  it('SS response: MHR + one RRTI IE with an addressed element per initiator + FCS, no RRMC (Figure 10-240)', () => {
    for (const m of [1, 2, 5]) expect(uwbM2mRespBytes('ss', m)).toBe(UWB_MHR_BYTES + rrtiIeBytes(m, true) + UWB_FCS_BYTES)
    expect(uwbM2mRespBytes('ss', 2)).toBe(26)
  })
  it('DS response: RRMC (3) alone (Figure 10-241); DS final: RMI + RRTI per responder (§10.32.7)', () => {
    expect(uwbM2mRespBytes('ds', 7)).toBe(UWB_BARE_RESP_BYTES)
    expect(uwbM2mLongestBytes('ds', 2, 4)).toBe(uwbFinalBytes(4))
  })
  it('the overflow rule names the frame that outgrows the PSDU, and the RDM List Length', () => {
    expect(uwbM2mOverflow('ss', 2, 4)).toBeNull()
    let m = 1
    while (uwbM2mRespBytes('ss', m + 1) <= UWB_MAX_PSDU_BYTES) m++
    expect(uwbM2mOverflow('ss', m, 1)).toBeNull()
    expect(uwbM2mOverflow('ss', m + 1, 1)?.frame).toBe('resp')
    let n = 1
    while (uwbFinalBytes(n + 1) <= UWB_MAX_PSDU_BYTES) n++
    expect(uwbM2mOverflow('ds', 1, n)).toBeNull()
    expect(uwbM2mOverflow('ds', 1, n + 1)?.frame).toBe('final')
    expect(uwbM2mOverflow('ss', 1, 33)?.frame).toBe('rcm')
  })
})

describe('the round layout (§10.32.6/§10.32.7, sequentially scheduled)', () => {
  it('SS: M initiation slots then N response slots; DS adds M final slots', () => {
    const cfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m' as const }
    expect(uwbSlotsPerTag('ss', 4, 'time', 8, 'm2m', undefined, undefined, undefined, undefined, 2)).toBe(6)
    expect(uwbSlotsPerTag('ds', 4, 'time', 8, 'm2m', undefined, undefined, undefined, undefined, 2)).toBe(8)
    const ss = roundPlan({ ...cfg, method: 'ss' }, 4, 2)
    const ds = roundPlan({ ...cfg, method: 'ds' }, 4, 2)
    expect([ss.initiators, ss.anchors, ss.rangingSlots]).toEqual([2, 4, 6])
    const phases = (p: typeof ss) => Array.from({ length: p.rangingSlots }, (_, s) => {
      const a = slotAction(p, s)
      return a.kind === 'uwbM2m' ? `${a.phase}${a.index}` : a.kind
    })
    expect(phases(ss)).toEqual(['init0', 'init1', 'resp0', 'resp1', 'resp2', 'resp3'])
    expect(phases(ds)).toEqual(['init0', 'init1', 'resp0', 'resp1', 'resp2', 'resp3', 'final0', 'final1'])
  })
  it('m2mRoles: tags are the initiators and anchors the responders, each in node-id order', () => {
    const nodes = [node('t-b', 'tag', T_PLACES[0]), node('a-z', 'anchor', A_PLACES[0]), node('t-a', 'tag', T_PLACES[1]), node('a-y', 'anchor', A_PLACES[1])]
    expect(m2mRoles(nodes)).toEqual({ initiators: ['t-a', 't-b'], responders: ['a-y', 'a-z'] })
  })
})

describe('an SS round: M + N frames, M × N ranges at the initiators (§10.32.6)', () => {
  const rs = m2m(2, 4, 'ss')
  const tx = of(rs, 'TX_START')
  it('the controller\'s RCM: ARC Multi-node Mode 2, an RDM element per controlee with role and slot', () => {
    const rcm = tx[0]
    expect(rcm.node).toBe(tId(0))
    expect(rcm.frame.kind).toBe('uwbPoll')
    expect(rcm.frame.uwb!.ies).toEqual(['ARC', 'RR', 'RDM', 'RRMC'])
    expect(rcm.frame.uwb!.arc!.multiNode).toBe(2)
    expect(rcm.frame.uwb!.arc!.roundUsage).toBe(1)
    expect(rcm.frame.uwb!.arc!.deferred).toBe(0)
    expect(rcm.frame.uwb!.rdm).toEqual([
      { id: tId(1), slot: 1, initiator: true },
      ...[0, 1, 2, 3].map((j) => ({ id: aId(j), slot: 2 + j, initiator: false })),
    ])
    expect(rcm.frame.bytes).toBe(uwbM2mRcmBytes(2, 4))
  })
  it('then the other initiator\'s initiation message and one response per responder, nothing else', () => {
    expect(tx.map((r) => `${r.node}:${r.frame.kind}:${r.frame.uwb!.slot}`)).toEqual([
      't-0:uwbPoll:0', 't-1:uwbInit:1', 'a-0:uwbResp:2', 'a-1:uwbResp:3', 'a-2:uwbResp:4', 'a-3:uwbResp:5',
    ])
    expect(tx[1].frame.bytes).toBe(uwbInitBytes())
    for (const r of tx.slice(2)) {
      expect(r.frame.uwb!.ies).toEqual(['RRTI'])
      expect(r.frame.uwb!.rrti!.map((e) => e.id)).toEqual([tId(0), tId(1)])
      expect(r.frame.bytes).toBe(uwbM2mRespBytes('ss', 2))
    }
  })
  it('no frame carries the TXT or RXT IE the standard does not define', () => {
    for (const r of tx) for (const ie of ['TXT', 'RXT']) expect(r.frame.uwb!.ies).not.toContain(ie)
  })
  it('every initiator computes a range to every responder, and the ranges are right', () => {
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(8)
    expect(new Set(ranges.map((r) => r.node))).toEqual(new Set([tId(0), tId(1)]))
    expect(new Set(ranges.map((r) => `${r.node}~${r.peer}`)).size).toBe(8)
    for (const r of ranges) expect(Math.abs(r.distM - r.trueDistM), `${r.node}→${r.peer}`).toBeLessThan(0.01)
  })
})

describe('a DS round: 2M + N frames, M × N ranges at the responders (§10.32.7)', () => {
  const rs = run(scenario(group(2, 4, true), { mode: 'm2m', method: 'ds', ...QUIET }))
  const tx = of(rs, 'TX_START')
  it('responses carry RRMC alone; each initiator then sends a final frame with RMI + RRTI per responder', () => {
    expect(tx.map((r) => `${r.node}:${r.frame.kind}`)).toEqual([
      't-0:uwbPoll', 't-1:uwbInit', 'a-0:uwbResp', 'a-1:uwbResp', 'a-2:uwbResp', 'a-3:uwbResp', 't-0:uwbFinal', 't-1:uwbFinal',
    ])
    for (const r of tx.filter((x) => x.frame.kind === 'uwbResp')) expect(r.frame.uwb!.ies).toEqual(['RRMC'])
    for (const r of tx.filter((x) => x.frame.kind === 'uwbFinal')) {
      expect(r.frame.uwb!.ies).toEqual(['RMI', 'RRTI'])
      expect(r.frame.uwb!.finalTimes!.map((e) => e.id)).toEqual([0, 1, 2, 3].map(aId))
      expect(r.frame.bytes).toBe(uwbFinalBytes(4))
    }
    expect(tx[0].frame.uwb!.arc!.roundUsage).toBe(2)
  })
  it('every responder computes a range to every initiator, cancelling the crystal offsets', () => {
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(8)
    expect(new Set(ranges.map((r) => r.node))).toEqual(new Set([0, 1, 2, 3].map(aId)))
    for (const r of ranges) expect(Math.abs(r.distM - r.trueDistM), `${r.node}→${r.peer}`).toBeLessThan(0.01)
  })
})

describe('participation comes from the RCM (§10.32.9.8)', () => {
  /** Three brick boxes around a point: 36 dB, nothing in or out. */
  const box = (p: { x: number; y: number }): Wall[] => [0.5, 0.7, 0.9].flatMap((r) => [
    [p.x - r, p.y - r, p.x + r, p.y - r], [p.x + r, p.y - r, p.x + r, p.y + r],
    [p.x + r, p.y + r, p.x - r, p.y + r], [p.x - r, p.y + r, p.x - r, p.y - r],
  ].map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, material: 'brick' as const, openings: [] })))
  it('a responder that missed the RCM never transmits: the round loses its M ranges', () => {
    const rs = m2m(2, 4, 'ss', {}, box(A_PLACES[0]))
    expect(of(rs, 'TX_START').some((r) => r.node === aId(0))).toBe(false)
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(6)
    for (const r of ranges) expect(r.peer).not.toBe(aId(0))
  })
  it('an initiator that missed the RCM never transmits either: the round loses its N ranges', () => {
    const rs = m2m(3, 4, 'ss', {}, box(T_PLACES[2]))
    expect(of(rs, 'TX_START').some((r) => r.node === tId(2))).toBe(false)
    expect(of(rs, 'UWB_RANGE')).toHaveLength(8)
    for (const r of of(rs, 'TX_START').filter((x) => x.frame.kind === 'uwbResp')) {
      expect(r.frame.uwb!.rrti!.map((e) => e.id)).toEqual([tId(0), tId(1)])
    }
  })
  it('the controller unheard: only its RCM goes out, and the round measures nothing', () => {
    const rs = m2m(2, 4, 'ss', {}, box(T_PLACES[0]))
    expect(of(rs, 'TX_START').map((r) => r.node)).toEqual([tId(0)])
    expect(of(rs, 'UWB_RANGE')).toEqual([])
    expect(of(rs, 'UWB_TIMEOUT').filter((r) => r.slot === 0)).toHaveLength(5)
  })
})

describe('receipt confirmation comes from the RCM\'s ARC (§10.36.1, §10.32.9.1)', () => {
  it('each responder confirms the M initiators in a slot of its own; the controller\'s ARC carries MMRCR', () => {
    const rs = m2m(2, 4, 'ss', { mmrcr: true })
    const tx = of(rs, 'TX_START')
    expect(tx[0].frame.uwb!.arc!.mmrcr).toBe(1)
    const conf = tx.filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(conf.map((r) => r.node)).toEqual([0, 1, 2, 3].map(aId))
    for (const r of conf) {
      expect(r.frame.dst).toBe('*')
      expect(r.frame.uwb!.mmrc!.map((e) => e.initiator)).toEqual([tId(0), tId(1)])
    }
    // each initiator reads its own entry from every responder: its own slot's bit set
    const got = of(rs, 'UWB_MMRCM')
    expect(got).toHaveLength(8)
    for (const r of got) {
      const k = Number(r.node.slice(2))
      expect(r.received.flatMap((b, i) => (b ? [i] : []))).toEqual([k])
    }
  })
  it('the request off: no confirmation at all', () => {
    expect(of(m2m(2, 4, 'ss'), 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm')).toEqual([])
  })
})

describe('the schema (§10.32.6/§10.32.7)', () => {
  const sc = (m: number, n: number, extra: Partial<UwbSessionCfg> = {}) => scenario(
    [
      ...Array.from({ length: m }, (_, k) => node(`t-${String(k).padStart(2, '0')}`, 'tag', { x: 1 + (k % 18), y: 1 + Math.floor(k / 18) })),
      ...Array.from({ length: n }, (_, j) => node(`a-${String(j).padStart(2, '0')}`, 'anchor', { x: 1 + (j % 18), y: 8 + Math.floor(j / 18) })),
    ],
    { mode: 'm2m', ...extra },
  )
  it('needs at least one initiator (tag) and one responder (anchor)', () => {
    expect(ScenarioSchema.safeParse(sc(2, 4)).success).toBe(true)
    expect(ScenarioSchema.safeParse(sc(0, 4)).success).toBe(false)
    expect(ScenarioSchema.safeParse(sc(3, 0)).success).toBe(false)
  })
  it('refuses a group whose frames outgrow the PSDU', () => {
    let m = 1
    while (uwbM2mRespBytes('ss', m + 1) <= UWB_MAX_PSDU_BYTES) m++
    expect(ScenarioSchema.safeParse(sc(m, 1, { method: 'ss', slotRstu: 6000, blockRstu: 600_000 })).success).toBe(true)
    expect(ScenarioSchema.safeParse(sc(m + 1, 1, { method: 'ss', slotRstu: 6000, blockRstu: 600_000 })).success).toBe(false)
    let n = 1
    while (uwbFinalBytes(n + 1) <= UWB_MAX_PSDU_BYTES) n++
    expect(ScenarioSchema.safeParse(sc(1, n, { method: 'ds' })).success).toBe(true)
    expect(ScenarioSchema.safeParse(sc(1, n + 1, { method: 'ds' })).success).toBe(false)
  })
  it('refuses what is not implemented: contention, deferred/fixed reply times, SP3, RMNR, ancillary, AoA', () => {
    for (const extra of [
      { schedule: 'contention' as const }, { replyTime: 'deferred' as const }, { replyTime: 'fixed' as const },
      { sp3: true }, { rmnr: true }, { ancillary: true }, { aoa: true }, { rcmValidityRounds: 2 },
    ]) expect(ScenarioSchema.safeParse(sc(2, 4, extra)).success, JSON.stringify(extra)).toBe(false)
  })
})

describe('determinism, and every other mode byte-identical', () => {
  /** The four non-m2m modes' record streams for one five-node scene — the values `tests/uwb/
   * m2m-round.test.ts` pinned before W3 (2026-11-11 W2b capture). W3 touched no other mode. */
  const BEFORE: Record<string, string> = {
    // 2026-11-11 (W4, merged after W3): dl-tdoa and ul-tdoa re-captured — the one-way round is Figure 10-225's "<OWR>" (RCM + bare ranging messages from synchronized anchors, §10.29.1.2.5) and the blink the 12-octet multipurpose frame.
    'twr/ss': '8a632d1c', 'twr/ds': 'e5a12d28', 'dl-tdoa': '24b7ecf1', 'ul-tdoa': '3291000c',
  }
  const OLD_PLACES = [{ x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 }, { x: 11, y: 9 }, { x: 5, y: 13 }]
  const streamOf = (s: Scenario): string => hashStr(JSON.stringify(
    new Simulation(s).runUntil(RUN_NS).records.filter((r) => r.type.startsWith('UWB_') || r.type === 'MAC_STATE'),
  )).toString(16)
  it('is deterministic, and twr / DL-TDoA / UL-TDoA did not move', () => {
    for (const method of ['ss', 'ds'] as const) {
      const s = scenario(group(2, 4, true), { mode: 'm2m', method })
      expect(streamOf(s)).toBe(streamOf(s))
    }
    const five = Array.from({ length: 5 }, (_, i) => node(`p-${i}`, i === 4 ? 'tag' : 'anchor', OLD_PLACES[i], PPM[i]))
    expect({
      'twr/ss': streamOf(scenario(five, { mode: 'twr', method: 'ss' })),
      'twr/ds': streamOf(scenario(five, { mode: 'twr', method: 'ds' })),
      'dl-tdoa': streamOf(scenario(five, { mode: 'dl-tdoa', method: 'ds' })),
      'ul-tdoa': streamOf(scenario(five, { mode: 'ul-tdoa', method: 'ss' })),
    }).toEqual(BEFORE)
  })
})

describe('the schema: round-trip and block fit (§10.32.2, §10.32.3.3)', () => {
  it('parses its own output for an m2m session, SS and DS', () => {
    for (const method of ['ss', 'ds'] as const) {
      const once = ScenarioSchema.parse(scenario(group(2, 4), { mode: 'm2m', method }))
      expect(ScenarioSchema.parse(once)).toEqual(once)
    }
  })
  it('accepts a block of exactly one exchange (M + N or 2M + N slots), refuses one slot short', () => {
    for (const method of ['ss', 'ds'] as const) {
      const cfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m' as const, method }
      const slots = uwbSlotsPerTag(method, 4, 'time', 8, 'm2m', undefined, undefined, undefined, undefined, 2)
      expect(slots).toBe(method === 'ss' ? 6 : 8)
      expect(ScenarioSchema.safeParse(scenario(group(2, 4), { ...cfg, blockRstu: slots * cfg.slotRstu })).success, method).toBe(true)
      const r = ScenarioSchema.safeParse(scenario(group(2, 4), { ...cfg, blockRstu: (slots - 1) * cfg.slotRstu }))
      expect(r.success, method).toBe(false)
      if (!r.success) expect(r.error.issues.map((i) => i.message).join('\n')).toMatch(/装不下一轮多对多测距/)
    }
  })
})
