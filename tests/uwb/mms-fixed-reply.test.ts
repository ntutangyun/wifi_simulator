/**
 * The draft's **fixed reply time** — the option the working group itself calls "MMS without
 * report" (4ab draft 15-25/0224r2, 15-25/0376r2, 15-25/0556r2, 15-25/0681r1).
 *
 * Single-sided two-way ranging needs two times: the round trip the initiator measures, and the
 * reply time the responder measures and sends back. Make the reply time a constant the two ends
 * agreed on beforehand and the initiator holds both already — so the responder's report has
 * nothing left to carry, and the energy the option saves is the energy of sending it.
 *
 * The responder starts its own packet a fixed interval after it **finishes receiving** the
 * initiator's, which is why the option is tied to the non-interleaved shape: the arrival estimate
 * the reply is measured from is only available at the end of the packet there.
 *
 * What is pinned here: the responder's fragment column starts from that instant and not from its
 * sub-round boundary; its REPORT is not sent, so the round costs one control frame less and less
 * air; the range still appears **at the initiator**, which is the whole point of the option; and a
 * session that leaves `fixedReplyRstu` null runs exactly as it did.
 *
 * The rounds below are Config 1 with a zero-length control phase — the shape the draft's own
 * non-interleaved figure draws (15-25/0194r0 slide 17), where the packet is its own poll and
 * response and the report phase is all that is left of the control plane. That is the shape the
 * option is worth something in: there is exactly one frame in the round besides the fragments, and
 * this option is what removes it.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, UwbMmsSchema, type NodeCfg, type Scenario,
  type UwbSessionCfg,
} from '../../src/model/scenario'
import {
  MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_SP0_NS, mmsLayout, mmsPacketFragments, mmsPacketSpanNs,
  type MmsPhy,
} from '../../src/uwb/mms'
import { UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { roundPlan, rstuNs, type RoundPlan } from '../../src/uwb/session'

const uwbNode = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y: 4, z: 1 },
  txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} },
  uwb: { role },
})

/** Config 1 with a zero-length control phase, non-interleaved: no narrowband radio, no POLL and no
 * RESP, and the report phase the draft's own figure keeps over it. */
const SHAPE = {
  control: 'uwbd', uwbdControl: 'none', nonInterleaved: true,
  nbChannels: [] as number[], nbLbt: 'off',
} as const

const FIXED = { fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT } as const

/** One anchor and one tag 3 m apart, on the session's own default train (X = 8 RSFs, no RIF) at
 * the draft's 600 RSTU ranging slot. */
function scene(over: Partial<UwbSessionCfg['mms']> = {}): Scenario {
  return ScenarioSchema.parse({
    rooms: [{ x: 0, y: 0, w: 12, h: 8, name: 'hall' }],
    walls: [],
    nodes: [uwbNode('anc-1', 4, 'anchor'), uwbNode('tag-1', 1, 'tag')],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: {
      ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...SHAPE, ...over },
    },
  })
}

const plan = (over: Partial<UwbSessionCfg['mms']> = {}): RoundPlan => roundPlan({
  ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600,
  mms: { ...DEFAULT_UWB_SESSION.mms, ...SHAPE, ...over },
}, 1)

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
/** One round of the first block and no more (the round is 42 slots, 21 ms), so every instant below
 * belongs to that round and a second round cannot quietly supply what the first did not. */
const ONE_ROUND_NS = 30 * 1_000_000

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txOf = (rs: TLRecord[], node: string, kind: string): Tx[] =>
  rs.filter((r) => r.type === 'TX_START' && r.node === node && r.frame.kind === kind) as never
const rangesOf = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_RANGE' }>[] =>
  rs.filter((r) => r.type === 'UWB_RANGE') as never

// --- (a) where the responder's column starts -------------------------------------------------

describe('the responder starts its packet a fixed interval after the initiator finished', () => {
  it('starts from the end of the packet it received, not from its own sub-round', () => {
    // The initiator's packet opens the round: eight fragments a millisecond apart from slot 0, so
    // the last leaves at 7.0 ms and runs one RSF (82.051 µs) long. 3 m of flight is 11 ns as the
    // channel rounds it, and 600 RSTU is 500 µs — which the responder counts on its own crystal,
    // so the wait is 9 ns short of nominal here. Every number below was read off this run.
    const rs = run(scene(FIXED), ONE_ROUND_NS)
    expect(txOf(rs, 'tag-1', 'uwbRsf').map((r) => r.t)).toEqual([
      0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
    ])
    const resp = txOf(rs, 'anc-1', 'uwbRsf').map((r) => r.t)
    expect(resp).toHaveLength(8)
    expect(resp[0]).toBe(7_582_053)
    // …and a millisecond apart from there, exactly as any other train.
    expect(resp.map((t) => t - resp[0])).toEqual([
      0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
    ])
    // Every one of them landed: the initiator opened a window at each instant of its own accord,
    // because the round's own fragment slots are not where the column is any more.
    const heard = rs.filter((r) => r.type === 'RX_OK' && r.node === 'tag-1' && r.frame.kind === 'uwbRsf')
    expect(heard).toHaveLength(8)
  })

  it('and that start is nowhere near the sub-round boundary the layout gave it', () => {
    // Without the option the responder's column opens its own sub-round, at slot 20 of a 42-slot
    // round — 10.0 ms at 600 RSTU. The fixed reply pulls it 2.4 ms earlier, into the tail of the
    // initiator's own ranging phase, which is free air: the initiator has stopped transmitting.
    const plain = txOf(run(scene(), ONE_ROUND_NS), 'anc-1', 'uwbRsf').map((r) => r.t)
    expect(plain[0]).toBe(10_000_000)
    const l = plan().mms!.layout
    expect(l.fragmentSlot('responder', 'rsf', 0)).toBe(20)
    expect(20 * rstuNs(600)).toBe(10_000_000)
  })
})

// --- (b) the report that is no longer sent ---------------------------------------------------

describe('the responder REPORT is not sent, and that is the saving', () => {
  it('drops the responder half of the report exchange', () => {
    const plain = run(scene(), ONE_ROUND_NS)
    const fixed = run(scene(FIXED), ONE_ROUND_NS)
    expect(txOf(plain, 'anc-1', 'uwbSp0')).toHaveLength(1)
    expect(txOf(fixed, 'anc-1', 'uwbSp0')).toHaveLength(0)
    // The initiator's own REPORT is untouched: what the draft drops is the reply time travelling
    // back, not the round trip travelling out — the responder ranges off that as it always did.
    expect(txOf(fixed, 'tag-1', 'uwbSp0')).toHaveLength(1)
  })

  it('costs the round one control frame and its air', () => {
    const air = (rs: TLRecord[]): { count: number; airNs: number } => {
      const msgs = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbSp0') as Tx[]
      return { count: msgs.length, airNs: msgs.reduce((a, r) => a + r.frame.txTimeNs, 0) }
    }
    const plain = air(run(scene(), ONE_ROUND_NS))
    const fixed = air(run(scene(FIXED), ONE_ROUND_NS))
    expect(plain).toEqual({ count: 2, airNs: 2 * MMS_SP0_NS })
    expect(fixed).toEqual({ count: 1, airNs: MMS_SP0_NS })
    // …and the fragments are untouched: the option removes a report, never part of a packet.
    expect(txOf(run(scene(FIXED), ONE_ROUND_NS), 'anc-1', 'uwbRsf')).toHaveLength(8)
  })
})

// --- (c) off by default ----------------------------------------------------------------------

describe('a session that names no fixed reply time is the session that shipped', () => {
  it('leaves the column and the report exactly where they were', () => {
    const rs = run(scene(), ONE_ROUND_NS)
    expect(txOf(rs, 'anc-1', 'uwbRsf').map((r) => r.t)).toEqual([
      10_000_000, 11_000_000, 12_000_000, 13_000_000,
      14_000_000, 15_000_000, 16_000_000, 17_000_000,
    ])
    expect(txOf(rs, 'anc-1', 'uwbSp0')).toHaveLength(1)
  })

  it('is the schema default, and the schema knows what the option needs', () => {
    const mms = (over: Partial<UwbSessionCfg['mms']>): unknown =>
      ({ ...DEFAULT_UWB_SESSION.mms, ...over })
    expect(UwbMmsSchema.parse(mms({})).fixedReplyRstu).toBeNull()
    // Interleaved has no "finished receiving the packet" to reply from; one-to-many would have
    // every responder reply at the same instant, and the draft carries the reply time in a
    // *one-to-one* Response Compact frame; and the opener of a reversed round has nothing to
    // reply to at all.
    expect(UwbMmsSchema.safeParse(mms(FIXED)).success).toBe(false)
    expect(UwbMmsSchema.safeParse(mms({ ...FIXED, nonInterleaved: true })).success).toBe(true)
    expect(UwbMmsSchema.safeParse(mms({ ...FIXED, nonInterleaved: true, oneToMany: true })).success)
      .toBe(false)
    expect(UwbMmsSchema.safeParse(mms({ ...FIXED, nonInterleaved: true, reversedOrder: true })).success)
      .toBe(false)
  })
})

// --- (d) the point of the whole thing --------------------------------------------------------

describe('with the report gone, the range still appears at the initiator', () => {
  it('ranges at the initiator from a reply time nobody sent it', () => {
    const rs = run(scene(FIXED), ONE_ROUND_NS)
    const mine = rangesOf(rs).filter((r) => r.node === 'tag-1')
    expect(mine).toHaveLength(1)
    expect(mine[0].peer).toBe('anc-1')
    expect(mine[0].trueDistM).toBeCloseTo(3, 6)
    // Nothing carried the reply time: the range is timed the moment the initiator finishes timing
    // the responder's train, which is its nominal close-out slot and well before the report phase.
    expect(mine[0].t).toBe(17_500_000)
    expect(mine[0].distM).toBeCloseTo(3.029, 3)
    // And it is the train-measured clock ratio that earns that: the pre-agreed constant is a count
    // of the *responder's* counter, and the uncorrected figure — the same two times with no ratio
    // applied — is more than a metre out. The draft's own yardstick is 30 cm per nanosecond of
    // time-of-flight error (15-25/0556r2), and 237 RCTU is 3.7 ns of it.
    expect(mine[0].tofRawRctu).toBeCloseTo(237.5, 1)
  })

  it('…and the responder still ranges off the initiator REPORT, which is still sent', () => {
    const rs = run(scene(FIXED), ONE_ROUND_NS)
    const theirs = rangesOf(rs).filter((r) => r.node === 'anc-1')
    expect(theirs).toHaveLength(1)
    expect(theirs[0].distM).toBeCloseTo(3, 1)
  })

  it('…and a round with both reports ranges at both ends, as it always did', () => {
    const nodes = new Set(rangesOf(run(scene(), ONE_ROUND_NS)).map((r) => r.node))
    expect([...nodes].sort()).toEqual(['anc-1', 'tag-1'])
  })
})

// --- the packet span both ends measure the reply against --------------------------------------

describe('the packet span is one number, read from both sides of the round', () => {
  it('is the last fragment’s millisecond plus that fragment’s own length', () => {
    const phy: MmsPhy = { ...DEFAULT_UWB_SESSION.mms, ...SHAPE }
    const l = mmsLayout(phy, 1)
    const fragGapNs = l.fragGapSlots * rstuNs(600)
    expect(fragGapNs).toBe(1_000_000)
    // Eight RSFs a millisecond apart: the last starts at 7 ms and is 82.051 µs long.
    expect(mmsPacketSpanNs(phy, fragGapNs)).toBe(7_082_051)
  })

  it('counts the idle milliseconds and the RIFs when the train has them', () => {
    const phy: MmsPhy = { ...DEFAULT_UWB_SESSION.mms, ...SHAPE, rsfs: 2, rifs: 2, gapMs: 2 }
    // RSF 0 and 1 at 0 and 1 ms; `rifStartMs` puts the first RIF at X + Z − 1 = 3 ms and the
    // second a millisecond later, and a 64-unit STS segment is 65.641 µs.
    expect(mmsPacketFragments(phy, 1_000_000).map((f) => f.offsetNs))
      .toEqual([0, 1_000_000, 3_000_000, 4_000_000])
    expect(mmsPacketSpanNs(phy, 1_000_000)).toBe(4_065_641)
  })

  it('agrees with the slot the layout puts the same fragment in', () => {
    // The two are the same arithmetic over the same milliseconds, so a fragment's offset from the
    // packet's RMARKER has to be its slot offset from the packet's first slot.
    const phy: MmsPhy = { ...DEFAULT_UWB_SESSION.mms, ...SHAPE, rsfs: 4, rifs: 2, gapMs: 2 }
    const l = mmsLayout(phy, 1)
    const slotNs = rstuNs(600)
    const fragGapNs = l.fragGapSlots * slotNs
    const first = l.fragmentSlot('initiator', 'rsf', 0)
    for (const f of mmsPacketFragments(phy, fragGapNs)) {
      expect((l.fragmentSlot('initiator', f.kind, f.index) - first) * slotNs, `${f.kind}/${f.index}`)
        .toBe(f.offsetNs)
    }
  })
})
