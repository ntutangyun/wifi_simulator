/**
 * Config 1 of P802.15.4ab MMS — the **UWB-driven** control plane (4ab draft 15-25/0194r0).
 *
 * Config 2, which every shipped scene runs, carries its POLL, RESP and REPORT on the narrowband
 * radio, and that exchange is what primes both ends before a fragment goes out. Config 1 has no
 * narrowband radio at all, and the draft gives it two shapes: the control and report frames
 * become SP0 packets on the HRP UWB PHY, or — with both of the draft's slot counts zero — there
 * is no control phase and no report phase, and the packet's own leading SYNC+SFD fragment is the
 * poll and the response.
 *
 * What is pinned here: the two phase lengths are the control plane's rather than a constant; the
 * frames a UWB-driven round puts on the air are SP0 packets and never narrowband messages; a
 * round with no control phase is primed by the packet it acquires, so a responder that never
 * hears a fragment never sends one; and Config 2 is unchanged in every one of those.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import {
  MMS_DRAFT_DEFAULTS, MMS_SP0_NS, MMS_SP0_SEGMENT_NS, MMS_SP0_WINDOW_SLOTS, mmsControlSlots,
  mmsLayout, mmsReportSlots, type MmsPhy,
} from '../../src/uwb/mms'
import { UWB_SLOT_GUARD_NS, UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { roundPlan, rstuNs, slotAction, type RoundPlan } from '../../src/uwb/session'

/** A train at the draft's own defaults, with only the control plane moved. */
const phy = (over: Partial<MmsPhy> = {}): MmsPhy => ({
  rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS, ...over,
})

/** The UWB-driven control plane carries no narrowband settings: there is no radio for them. */
const UWBD = { control: 'uwbd', nbChannels: [] as number[], nbLbt: 'off' } as const

// --- the two phase lengths ------------------------------------------------------------------

describe('the control and report phases are as long as the control plane makes them', () => {
  it('narrowband-assisted keeps the two-slot windows it always had', () => {
    const one = mmsLayout(phy(), 1)
    expect([one.controlSlots, one.reportSlots]).toEqual([4, 4])
    const three = mmsLayout(phy(), 3)
    expect([three.controlSlots, three.reportSlots]).toEqual([8, 12])
    expect([one.windowSlots, one.reportWindowSlots]).toEqual([2, 2])
  })

  it('a UWB-driven round with SP0 still has both phases, in one-slot windows', () => {
    const l = mmsLayout(phy({ control: 'uwbd', uwbdControl: 'sp0' }), 1)
    expect(l.windowSlots).toBe(MMS_SP0_WINDOW_SLOTS)
    expect(l.controlSlots).toBe(2)
    expect(l.reportSlots).toBe(2)
    // The windows are where the layout says, and the ranging phase starts after them.
    expect(l.pollSlot()).toBe(0)
    expect(l.respSlot(0)).toBe(1)
    expect(l.fragmentSlot('initiator', 'rsf', 0)).toBe(2)
  })

  it('a UWB-driven round without SP0 loses its control phase and KEEPS its report phase', () => {
    // The two phases have their own pair of parameters in the draft, and its own figures
    // disagree about the interleaved case (slide 13 draws no Report, slide 17 does) — so the
    // report phase is not the control phase's dependent. 4ab draft 15-25/0194r0
    const l = mmsLayout(phy({ control: 'uwbd', uwbdControl: 'none' }), 1)
    expect(l.controlSlots).toBe(0)
    expect(l.windowSlots).toBe(0)
    expect(l.reportSlots).toBe(2)
    expect(l.reportWindowSlots).toBe(MMS_SP0_WINDOW_SLOTS)
    // The ranging phase opens the round, and the two report windows close it.
    expect(l.slots).toBe(l.rpSlots + 2)
    expect(l.fragmentSlot('initiator', 'rsf', 0)).toBe(0)
    expect(l.reportSlot('responder')).toBe(l.rpSlots)
    expect(l.reportSlot('initiator')).toBe(l.rpSlots + 1)
  })

  it('asking a round with no control phase where its POLL is is a bug, not slot 0', () => {
    const l = mmsLayout(phy({ control: 'uwbd', uwbdControl: 'none' }), 1)
    expect(() => l.pollSlot()).toThrow(/no control phase/)
    expect(() => l.respSlot(0)).toThrow(/no control phase/)
  })

  it('the two phase lengths are one function each, and the layout reads them', () => {
    for (const control of ['nba', 'uwbd'] as const) {
      for (const uwbdControl of ['sp0', 'none'] as const) {
        if (control === 'nba' && uwbdControl === 'none') continue
        for (const responders of [1, 2, 3]) {
          const p = phy({ control, uwbdControl })
          const tag = `${control}/${uwbdControl}/${responders}`
          expect(mmsLayout(p, responders).controlSlots, tag).toBe(mmsControlSlots(p, responders))
          expect(mmsLayout(p, responders).reportSlots, tag).toBe(mmsReportSlots(p, responders))
        }
      }
    }
  })

  it('the non-interleaved shape drops its scattered windows too, report phase aside', () => {
    const sp0 = mmsLayout(phy({ control: 'uwbd', uwbdControl: 'sp0', nonInterleaved: true }), 2)
    expect(sp0.controlSlots).toBe(sp0.subRounds * MMS_SP0_WINDOW_SLOTS)
    const none = mmsLayout(phy({ control: 'uwbd', uwbdControl: 'none', nonInterleaved: true }), 2)
    expect(none.controlSlots).toBe(0)
    expect(none.subRoundStart(1)).toBe(none.rpSlots)
    // …and the report phase is still there, after the last sub-round.
    expect(none.reportSlots).toBe(4)
    expect(none.reportSlot('responder', 0)).toBe(none.subRounds * none.rpSlots)
  })
})

// --- the SP0 packet's own length ------------------------------------------------------------

describe('the SP0 control frame', () => {
  it('is the draft table’s short packet, segment for segment', () => {
    const s = MMS_SP0_SEGMENT_NS
    expect(s.sync + s.sfd + s.phr + s.psdu).toBe(MMS_SP0_NS)
    expect(MMS_SP0_NS).toBe(117_600)
  })

  it('fits one ranging slot at every slot length an MMS session may use', () => {
    // 300 RSTU is the shortest slot the draft's own rule allows (a multiple of 300), which is
    // what makes a one-slot SP0 window legal everywhere — the 608 µs narrowband REPORT needs two.
    expect(MMS_SP0_NS + UWB_SLOT_GUARD_NS).toBeLessThan(rstuNs(300))
    expect(MMS_SP0_WINDOW_SLOTS).toBe(1)
  })
})

// --- the schedule ---------------------------------------------------------------------------

const plan = (over: Partial<UwbSessionCfg['mms']> = {}, anchors = 1): RoundPlan => roundPlan({
  ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600,
  mms: { ...DEFAULT_UWB_SESSION.mms, ...over },
}, anchors)

const at = (p: RoundPlan, slot: number): string => {
  const a = slotAction(p, slot) as Record<string, unknown>
  return [a.kind, a.role, a.tx, a.anchor, a.index].filter((v) => v !== undefined).join('/')
}

describe('the schedule puts SP0 packets where the narrowband messages were', () => {
  it('names the UWB-driven control and report windows as SP0', () => {
    const p = plan({ ...UWBD })
    const l = p.mms!.layout
    expect(at(p, l.pollSlot())).toBe('uwbSp0/poll/tag')
    expect(at(p, l.respSlot(0))).toBe('uwbSp0/resp/anchor/0')
    expect(at(p, l.reportSlot('responder', 0))).toBe('uwbSp0/report/anchor/0')
    expect(at(p, l.reportSlot('initiator', 0))).toBe('uwbSp0/report/tag/0')
  })

  it('schedules fragments and the two SP0 report windows when there is no control phase', () => {
    const p = plan({ ...UWBD, uwbdControl: 'none' })
    const kinds = new Set(Array.from({ length: p.slots }, (_, s) => slotAction(p, s).kind))
    expect([...kinds].sort()).toEqual(['idle', 'uwbRsf', 'uwbSp0'])
    const l = p.mms!.layout
    expect(at(p, l.reportSlot('responder', 0))).toBe('uwbSp0/report/anchor/0')
    expect(at(p, l.reportSlot('initiator', 0))).toBe('uwbSp0/report/tag/0')
  })

  it('leaves Config 2’s round exactly as it was', () => {
    const p = plan()
    const l = p.mms!.layout
    expect(at(p, l.pollSlot())).toBe('nbPoll/tag')
    expect(at(p, l.respSlot(0))).toBe('nbResp/anchor/0')
    expect(at(p, l.reportSlot('responder', 0))).toBe('nbReport/anchor/0')
  })
})

// --- what a round actually puts on the air --------------------------------------------------

const uwbNode = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y: 4, z: 1 },
  txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} },
  uwb: { role },
})

function scene(over: Partial<UwbSessionCfg['mms']>, anchorX = 3): Scenario {
  return ScenarioSchema.parse({
    rooms: [{ x: 0, y: 0, w: anchorX + 40, h: 8, name: 'hall' }],
    walls: [],
    nodes: [uwbNode('anc-1', anchorX, 'anchor'), uwbNode('tag-1', 1, 'tag')],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: {
      ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...over },
    },
  })
}

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
/** How many frames of each kind the run put on the air. */
function sent(rs: TLRecord[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rs) if (r.type === 'TX_START') out[r.frame.kind] = (out[r.frame.kind] ?? 0) + 1
  return out
}
const trains = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
  rs.filter((r) => r.type === 'UWB_MMS_TRAIN') as never

const BLOCK_NS = 40 * 1_000_000

describe('a UWB-driven round transmits no narrowband message at all', () => {
  it('sends SP0 packets in place of the POLL, the RESP and the REPORT', () => {
    const s = sent(run(scene({ ...UWBD }), BLOCK_NS))
    expect(s.nbPoll ?? 0).toBe(0)
    expect(s.nbResp ?? 0).toBe(0)
    expect(s.nbReport ?? 0).toBe(0)
    expect(s.uwbSp0).toBeGreaterThan(0)
    expect(s.uwbRsf).toBeGreaterThan(0)
  })

  it('puts those SP0 packets on the UWB PHY, at the table’s own length', () => {
    const rs = run(scene({ ...UWBD }), BLOCK_NS)
    const sp0 = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0')
    expect(sp0.length).toBeGreaterThan(0)
    for (const r of sp0) {
      const f = (r as Extract<TLRecord, { type: 'TX_START' }>).frame
      expect(f.txTimeNs).toBe(MMS_SP0_NS)
      // No narrowband message block: the channel routes on that field, and an SP0 packet is on
      // the UWB radio at the UWB power and the UWB sensitivity.
      expect(f.uwb?.nb).toBeUndefined()
      expect(f.uwb?.sp0).toBeDefined()
    }
  })

  it('still ranges: an SP0 report carries the reply time the narrowband one did', () => {
    const rs = run(scene({ ...UWBD }), BLOCK_NS)
    const reports = rs.filter((r) => r.type === 'TX_START' && r.frame.uwb?.sp0?.role === 'report')
    expect(reports.length).toBeGreaterThan(0)
    expect(reports.some((r) => {
      const sp0 = (r as Extract<TLRecord, { type: 'TX_START' }>).frame.uwb?.sp0
      return sp0?.replyRctu !== undefined || sp0?.roundTripRctu !== undefined
    })).toBe(true)
    expect(rs.some((r) => r.type === 'UWB_RANGE')).toBe(true)
  })

  it('sends fragments and the two reports when there is no control phase', () => {
    // No POLL and no RESP — the packet's own leading fragment does their work — but the report
    // phase survives, which is what lets a zero-length control phase still produce a range.
    const rs = run(scene({ ...UWBD, uwbdControl: 'none' }), BLOCK_NS)
    const s = sent(rs)
    expect(s.nbPoll ?? 0).toBe(0)
    expect(s.uwbRsf).toBeGreaterThan(0)
    expect(s.uwbSp0).toBeGreaterThan(0)
    const roles = new Set(rs
      .filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0')
      .map((r) => (r as Extract<TLRecord, { type: 'TX_START' }>).frame.uwb?.sp0?.role))
    expect([...roles]).toEqual(['report'])
    expect(rs.some((r) => r.type === 'UWB_RANGE')).toBe(true)
  })

  it('leaves Config 2 sending the narrowband trio and no SP0 packet', () => {
    const s = sent(run(scene({}), BLOCK_NS))
    expect(s.nbPoll).toBeGreaterThan(0)
    expect(s.nbResp).toBeGreaterThan(0)
    expect(s.nbReport).toBeGreaterThan(0)
    expect(s.uwbSp0 ?? 0).toBe(0)
  })
})

describe('with no control exchange, the packet is what primes the far end', () => {
  it('both ends range: the fragment that opens the packet is the poll and the response', () => {
    const rs = run(scene({ ...UWBD, uwbdControl: 'none' }), BLOCK_NS)
    const ts = trains(rs)
    expect(ts.some((t) => t.node === 'anc-1' && t.detected)).toBe(true)
    expect(ts.some((t) => t.node === 'tag-1' && t.detected)).toBe(true)
  })

  it('a responder that never hears a fragment never sends one', () => {
    // 400 m of free space: the premise is asserted first, so a retuned link budget fails here
    // rather than quietly turning this into a test of nothing.
    const rs = run(scene({ ...UWBD, uwbdControl: 'none' }, 401), BLOCK_NS)
    const heard = rs.some((r) => r.type === 'RX_OK' && r.node === 'anc-1' && r.frame.kind === 'uwbRsf')
    expect(heard, 'premise: no fragment reaches the anchor at this distance').toBe(false)
    const s = sent(rs)
    expect(s.uwbRsf ?? 0).toBeGreaterThan(0)
    expect(rs.some((r) => r.type === 'TX_START' && r.node === 'anc-1')).toBe(false)
  })

  it('…where Config 2’s narrowband POLL reaches that far and the responder answers', () => {
    const rs = run(scene({}, 401), BLOCK_NS)
    expect(rs.some((r) => r.type === 'RX_OK' && r.node === 'anc-1' && r.frame.kind === 'nbPoll')).toBe(true)
    expect(rs.some((r) => r.type === 'TX_START' && r.node === 'anc-1' && r.frame.kind === 'uwbRsf')).toBe(true)
  })
})
