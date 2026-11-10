/**
 * W2b (2026-11-11): the UWB core behaviours that used to differ from IEEE Std 802.15.4-2024, each
 * pinned at the standard's behaviour with the clause it comes from. See
 * docs/superpowers/specs/2026-11-11-w2b-design.md.
 */
import { describe, expect, it } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import { UwbChannel } from '../../src/uwb/channel'
import { UwbClock } from '../../src/uwb/clock'
import { UwbDevice } from '../../src/uwb/device'
import { makePoll, withoutSts } from '../../src/uwb/frames'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import {
  RSTU_NS, UWB_STS_CHIPS, UWB_TURNAROUND_NS, chipsToNs, rstuNs, uwbPpduNs, uwbRespBytes, uwbSlotFitNs,
  uwbWholeRoundSlots,
} from '../../src/uwb/phy'
import { responderRangingSlot, roundPlan } from '../../src/uwb/session'
import { uwbSlotFloorRstu } from '../../src/uwb/ui/UwbSessionFields'
import { LESSONS } from '../../src/course/lessons'

const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

const uwbNode = (id: string, role: 'anchor' | 'tag', x: number, y: number): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: -14,
  profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
})

const scene = (nodes: NodeCfg[], session: Partial<UwbSessionCfg> = {}): Scenario => ({
  rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'lab' }], walls: [], nodes, servers: [], seed: 7,
  rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
  uwb: { ...DEFAULT_UWB_SESSION, nlos: false, ...session },
})

const ANCHORS = [uwbNode('anc-1', 'anchor', 0, 0), uwbNode('anc-2', 'anchor', 8, 0), uwbNode('anc-3', 'anchor', 0, 6)]
const TAG = uwbNode('tag-1', 'tag', 3, 2)
const run = (sc: Scenario, ns = 200_000_000): TLRecord[] => new Simulation(sc).runUntil(ns).records

function anchorDevice(): UwbDevice {
  const q = new EventQueue()
  const now = (): number => 0
  const emit = makeEmitter(() => undefined)
  const ch = new UwbChannel(q, now, [uwbNode('anc-1', 'anchor', 1, 0)], [], { channel: 9, nlos: false }, () => 0, emit)
  return new UwbDevice(
    'anc-1',
    {
      role: 'anchor', pos: { x: 1, y: 0, z: 1 }, tsNoisePs: 100, cfoNoisePpm: 0.2, maxAttempts: 3, rmnr: false,
      tdoaClockCorrection: true, syncOffsetNs: 0, syncErrorNs: 0, aoa: false, yawDeg: 0, channel: 9,
    },
    new UwbClock(0, 0), new Rng(1), q, now, ch, emit,
    { trueDistM: () => 1, anchorPos: (id) => ({ id, x: 0, y: 0, z: 1 }) },
  )
}

// §10.32.9.8: "When the SIU field is one, the RDM IE is used to allocate time slots and assign the
// ranging roles of controlees"; "Upon reception of the RCM, a controlee knows whether it is selected
// to participate in the ranging round(s)".
describe('a responder takes its slot from the RDM IE it decoded (§10.32.9.8)', () => {
  it('reads its place in the round off its own RDM List element, not off the scene order', () => {
    const plan = roundPlan(DEFAULT_UWB_SESSION, 3)
    for (const [slots, want] of [[[1, 2, 3], 0], [[3, 1, 2], 2], [[2, 3, 1], 1]] as const) {
      const dev = anchorDevice()
      dev.beginRound(0, 0, plan, 'tag-1', ['anc-1', 'anc-2', 'anc-3'], {})
      const r = dev.round!
      dev.holdRcm(r, makePoll('tag-1', ['anc-1', 'anc-2', 'anc-3'], 'ds', 0, 0, { rdmSlots: [...slots] }))
      expect(dev.heldRcmFor(r)?.responder, `RDM slots ${slots}`).toBe(want)
    }
  })

  it('holds no place at all when the RCM did not list it', () => {
    const plan = roundPlan(DEFAULT_UWB_SESSION, 2)
    const dev = anchorDevice()
    dev.beginRound(0, 0, plan, 'tag-1', ['anc-1', 'anc-2'], {})
    const r = dev.round!
    dev.holdRcm(r, makePoll('tag-1', ['anc-9', 'anc-2'], 'ds', 0, 0, { rdmSlots: [1, 2] }))
    expect(dev.heldRcmFor(r)?.responder).toBeNull()
  })

  it('the initiator writes each responder the slot of its ranging response, and the inspector shows it', () => {
    const rs = run(scene([...ANCHORS, TAG]))
    const poll = of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame
    const plan = roundPlan(DEFAULT_UWB_SESSION, 3)
    expect(poll.uwb!.rdm).toEqual(['anc-1', 'anc-2', 'anc-3'].map((id, i) => ({
      id, slot: responderRangingSlot(plan, i), initiator: false,
    })))
    const rdm = uwbFrameFields(poll).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ieRdm')!
    expect(rdm.value).toContain('anc-3')
  })

  it('a responder that never decoded an RCM keeps its receiver off past slot 0 (no Final it was not scheduled for)', () => {
    // anc-far is out of the tag's reach: it never decodes the RCM, so the only wait it arms is slot 0's.
    const far = uwbNode('anc-far', 'anchor', 400, 0)
    const rs = run(scene([...ANCHORS, far, TAG]))
    const waits = of(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'anc-far')
    expect(waits.length).toBeGreaterThan(0)
    for (const w of waits) {
      expect(w.slot, JSON.stringify(w)).toBe(0)
      expect(['uwbPoll', 'uwbInit']).toContain(w.expected)
    }
    // …and it sends nothing.
    expect(of(rs, 'TX_START').filter((r) => r.node === 'anc-far')).toEqual([])
  })
})

// §10.32.2: "Each ranging block consists of a whole number of ranging rounds"; §10.32.3.3.
describe('a block holds a whole number of rounds (§10.32.2, §10.32.3.3)', () => {
  it('stretches the round to the smallest whole divisor of the block, the rest of it idle', () => {
    expect(uwbWholeRoundSlots(8, 240_000, 2400, 'twr')).toBe(10)
    expect(uwbWholeRoundSlots(10, 240_000, 2400, 'twr')).toBe(10)
    expect(uwbWholeRoundSlots(11, 240_000, 2400, 'twr')).toBe(20)
    // The deleted-anchor case of `uwb-blocks`: three anchors' DS round is 8 slots, run as 10.
    const p = roundPlan(DEFAULT_UWB_SESSION, 3)
    expect(p.rangingSlots).toBe(8)
    expect(p.slots).toBe(10)
    expect(p.roundsPerBlock * p.roundNs).toBe(p.blockNs)
  })

  it('holds for every lesson scene outside the 4ab draft modes', () => {
    for (const l of LESSONS) {
      for (const sc of [l.scenario, ...(l.variants ?? []).map((v) => v.scenario)]) {
        const s = sc()
        if (!s.uwb || s.uwb.mode === 'mms') continue
        const parts = s.nodes.filter((n) => n.uwb).length
        const anchors = s.nodes.filter((n) => n.uwb?.role === 'anchor').length
        const p = roundPlan(s.uwb, s.uwb.mode === 'm2m' ? parts : anchors)
        expect((s.uwb.blockRstu / s.uwb.slotRstu) % p.slots, l.id).toBe(0)
      }
    }
  })

  it('refuses a block that is not a whole number of slots', () => {
    expect(() => ScenarioSchema.parse(scene([...ANCHORS, TAG], { blockRstu: 240_001 }))).toThrow(/§10\.32\.2/)
  })
})

// §10.32.2: a slot is "a time period of sufficient duration for the transmission of at least one
// RFRAME"; Table 12-1: aTurnaroundTime is 12 symbols, and §16.1: HRP MAC timing counts preamble symbols.
describe('no 300 RSTU floor: a slot holds its frame, the flight guard and aTurnaroundTime', () => {
  it('aTurnaroundTime is 12 preamble symbols of 508 chips', () => {
    expect(UWB_TURNAROUND_NS).toBe(chipsToNs(12 * 508))
    expect(UWB_TURNAROUND_NS).toBe(12_212)
  })

  it('accepts a slot below 300 RSTU when the round fits it, and refuses one RSTU less', () => {
    const one = [uwbNode('anc-1', 'anchor', 0, 0), TAG]
    const session: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ss' }
    const floor = uwbSlotFloorRstu(session, 1)
    expect(floor).toBeLessThan(300)
    expect(rstuNs(floor)).toBeGreaterThanOrEqual(uwbSlotFitNs(1, 'twr', 'time', undefined, 'ss', 'embedded'))
    expect(rstuNs(floor - 1)).toBeLessThan(uwbSlotFitNs(1, 'twr', 'time', undefined, 'ss', 'embedded'))
    expect(() => ScenarioSchema.parse(scene(one, { ...session, slotRstu: floor, blockRstu: floor * 400 }))).not.toThrow()
    expect(() => ScenarioSchema.parse(scene(one, { ...session, slotRstu: floor - 1, blockRstu: (floor - 1) * 400 })))
      .toThrow(/aTurnaroundTime/)
    expect(Math.floor(uwbSlotFitNs(1, 'twr', 'time', undefined, 'ss', 'embedded') / RSTU_NS)).toBeLessThan(floor)
  })
})

// §10.32.5, Figure 10-238 (embedded) and §10.29.6.6, Figure 10-206 (deferred).
describe('DS-TWR: Treply1 rides the Response, the report carries one measurement', () => {
  const ranges = (replyTime: 'embedded' | 'deferred') => {
    const rs = run(scene([...ANCHORS, TAG], { replyTime, tsNoisePs: 0, cfoNoisePpm: 0 }), 30_000_000)
    return { rs, at: (node: string) => of(rs, 'UWB_RANGE').filter((r) => r.node === node) }
  }

  it('embedded: the Response carries an RRTI with Treply1 and the report Tround2; both ends get the same range', () => {
    const { rs, at } = ranges('embedded')
    const resp = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    expect(resp.length).toBe(3)
    for (const r of resp) {
      expect(r.frame.uwb!.ies).toEqual(['RRMC', 'RRTI'])
      expect(r.frame.bytes).toBe(uwbRespBytes('ds', 'embedded'))
      expect(r.frame.uwb!.replyRctu).toBeGreaterThan(0)
    }
    const reports = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbReport')
    for (const r of reports) expect(Object.keys(r.frame.uwb!.reportTimes!)).toEqual(['tround2'])
    const tag = at('tag-1')
    expect(tag).toHaveLength(3)
    for (const r of tag) {
      const mine = at(r.peer).find((x) => x.peer === 'tag-1')!
      expect(r.distM).toBeCloseTo(mine.distM, 9)
    }
  })

  it('deferred: the Response carries no reply time and the report carries the TOF the responder computed', () => {
    const { rs, at } = ranges('deferred')
    for (const r of of(rs, 'TX_START').filter((x) => x.frame.kind === 'uwbResp')) expect(r.frame.uwb!.ies).toEqual(['RRMC'])
    const reports = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbReport' && r.node !== 'tag-1')
    expect(reports).toHaveLength(3)
    for (const r of reports) {
      expect(Object.keys(r.frame.uwb!.reportTimes!)).toEqual(['tof'])
      const anchorRange = at(r.node).find((x) => x.peer === 'tag-1')!
      expect(r.frame.uwb!.reportTimes!.tof).toBe(Math.round(anchorRange.tofRctu))
    }
    for (const r of at('tag-1')) {
      const mine = at(r.peer).find((x) => x.peer === 'tag-1')!
      expect(Math.abs(r.tofRctu - mine.tofRctu)).toBeLessThanOrEqual(0.5)
    }
  })
})

// Table 16-1: "No STS" is packet configuration 0; Table 10-165: STS Packet Config value 0.
describe('sequence off: every SP1 frame goes out as STS packet configuration 0', () => {
  it('is 33 792 chips shorter, marked SP0, and the ARC IE says 0', () => {
    const base = scene([...ANCHORS, TAG])
    const on = of(run(base, 30_000_000), 'TX_START')
    const off = of(run({ ...base, uwb: { ...base.uwb!, stsOff: true } }, 30_000_000), 'TX_START')
    expect(off.length).toBe(on.length)
    for (const r of off) {
      expect(r.frame.uwb!.sp).toBe(0)
      expect(r.frame.txTimeNs).toBe(uwbPpduNs(r.frame.bytes, false))
    }
    expect(on[0].frame.txTimeNs - off[0].frame.txTimeNs).toBe(uwbPpduNs(on[0].frame.bytes) - uwbPpduNs(on[0].frame.bytes, false))
    // 33 792 chips = 67 692.3 ns; each PPDU length is rounded to the nanosecond on its own.
    expect(Math.abs(uwbPpduNs(42) - uwbPpduNs(42, false) - chipsToNs(UWB_STS_CHIPS))).toBeLessThanOrEqual(1)
    expect(off[0].frame.uwb!.arc!.stsConfig).toBe(0)
    expect(on[0].frame.uwb!.arc!.stsConfig).toBe(1)
    const layout = uwbFrameFields(off[0].frame).ppdu.map((s) => s.key)
    expect(layout).toEqual(['sync', 'sfd', 'phr', 'psdu'])
  })

  it('withoutSts leaves an SP3 marker alone, and the schema refuses stsOff beside sp3', () => {
    const marker = { kind: 'uwbSp3', src: 'a', dst: 't', bytes: 0, mbps: 0, durationFieldNs: 0, txTimeNs: 1, uwb: { sp: 3, method: 'ss', block: 0, round: 0, slot: 2, ies: [] } } as const
    expect(withoutSts(marker as never)).toBe(marker)
    expect(() => ScenarioSchema.parse(scene([...ANCHORS, TAG], { method: 'ss', replyTime: 'deferred', sp3: true, stsOff: true })))
      .toThrow(/stsOff 与 sp3/)
  })
})
