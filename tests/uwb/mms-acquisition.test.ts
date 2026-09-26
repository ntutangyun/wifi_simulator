/**
 * Signal acquisition for the UWB-driven MMS configuration: the question `trainDetected` never
 * had to ask.
 *
 * Config 2 (narrowband-assisted) needs no acquisition at all. The narrowband POLL/RESP exchange
 * hands both ends the same time base before a single fragment goes out, so the receiver knows
 * where every fragment of the train will land and accumulates them blind — which is why
 * `trainDetected` may add `10·log10(heard)` dB to a fragment nobody could have heard alone.
 *
 * Config 1 (UWB-driven) has no narrowband radio, so the time base has to come out of the packet
 * itself: the leading SYNC+SFD fragment, or the SP0 control frame when the control phase is not
 * zero-length. That judgement is made on ONE fragment with NO combining, and that is the whole
 * distinction pinned here — four fragments 6 dB down are a detected train and still an
 * unacquired packet.
 *
 * Miss it and the round is lost outright, because nothing after it can be timestamped. That is
 * the cost `phyUwbMmsRsfSfd` buys off: an SFD after every RSF makes any RSF able to open the
 * packet, so a burst of interference over the head of the train is survivable.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  acquired, combineGainDb, trainDetected, MMS_DRAFT_DEFAULTS, MMS_SP0_PENALTY_DB,
  MMS_SP0_RX_SENS_DBM, type MmsPhy,
} from '../../src/uwb/mms'
import { UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'

/** The session's default train, with whichever draft features a case names. */
const phy = (over: Partial<MmsPhy> = {}): MmsPhy => ({
  rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1,
  ...MMS_DRAFT_DEFAULTS, ...over,
})

/** A train, written as the levels its fragments arrived at, head first. */
const f = (...dbm: number[]): { rssiDbm: number }[] => dbm.map((rssiDbm) => ({ rssiDbm }))

/** UWB-driven with a zero-length control phase, so acquisition rides the packet's own
 * SYNC+SFD fragment and no SP0 frame stands in front of it. */
const uwbd = (over: Partial<MmsPhy> = {}): MmsPhy =>
  phy({ control: 'uwbd', uwbdControl: 'none', ...over })

describe('what the narrowband exchange spares Config 2', () => {
  it('narrowband-assisted needs no acquisition at all', () => {
    // The POLL/RESP exchange already handed the receiver its time base, so there is nothing
    // to find: even a fragment 27 dB under sensitivity leaves the packet acquired.
    expect(acquired(phy({ control: 'nba' }), f(-120))).toBe(true)
    expect(acquired(phy({ control: 'nba' }), [])).toBe(true)
  })

  it('leaves every existing scenario untouched, because the default is narrowband-assisted', () => {
    expect(MMS_DRAFT_DEFAULTS.control).toBe('nba')
    expect(acquired(phy(), f(-140))).toBe(true)
  })
})

describe('UWB-driven acquisition is one fragment on its own', () => {
  it('acquires on the leading fragment alone, with no combining', () => {
    expect(acquired(uwbd(), f(UWB_RX_SENS_DBM))).toBe(true)
    expect(acquired(uwbd(), f(UWB_RX_SENS_DBM - 0.1))).toBe(false)
  })

  it('four quiet fragments do not add up to an acquisition', () => {
    // The whole distinction: ranging combines, acquisition does not. The same four fragments
    // are a detected train — 6 dB of combining gain clears sensitivity — and an unacquired
    // packet, so the round is lost with the train plainly there.
    expect(acquired(uwbd(), f(-99, -99, -99, -99))).toBe(false)
    expect(trainDetected(-99, 4)).toBe(true)
    expect(combineGainDb(4)).toBeCloseTo(6.02, 2)
  })

  it('asks nothing of a train that arrived empty', () => {
    expect(acquired(uwbd(), [])).toBe(false)
  })
})

describe('what an SP0 control frame costs, and where that cost is charged', () => {
  it('lives on the SP0 frame own reception threshold, 4 dB above the fragments', () => {
    // One threshold, one place. The SP0 packet really crosses the channel in this engine, so
    // the 4 dB is the sensitivity that packet is delivered against — and nowhere else.
    expect(MMS_SP0_RX_SENS_DBM).toBe(UWB_RX_SENS_DBM + MMS_SP0_PENALTY_DB)
  })

  it('gets the direction right: SP0 is the harder thing to acquire', () => {
    // Longer and at a lower peak power, so it is SP0 that defines the link budget when it is
    // there — never the other way round.
    expect(MMS_SP0_PENALTY_DB).toBeGreaterThan(0)
  })

  it('is not charged a second time on the fragments that follow it', () => {
    // With SP0 in front of the packet the receiver was primed by receiving that packet, so it
    // accumulates blind exactly as Config 2 does and `acquired` has nothing left to judge.
    // Charging the 4 dB here as well would be one threshold decided in two places.
    const sp0 = phy({ control: 'uwbd', uwbdControl: 'sp0' })
    expect(acquired(sp0, f(UWB_RX_SENS_DBM - 50))).toBe(true)
    expect(acquired(sp0, [])).toBe(true)
    // …and the zero-length control phase, which has no SP0 packet to have been primed by, is
    // judged at the plain sensitivity with no penalty at all.
    expect(acquired(uwbd(), f(UWB_RX_SENS_DBM))).toBe(true)
    expect(acquired(uwbd(), f(UWB_RX_SENS_DBM - 0.1))).toBe(false)
  })
})

describe('an SFD after every RSF is what saves the round', () => {
  it('RSF with SFD lets a later fragment open the packet', () => {
    const lost = [{ rssiDbm: -120 }, { rssiDbm: UWB_RX_SENS_DBM }]
    expect(acquired(uwbd({ rsfSfd: false }), lost)).toBe(false)
    // nMsr 64 because the draft allows the SFD only at an RSF length of 32 or 64 — the schema
    // refuses the rest, so a legal phy is the only kind worth testing.
    expect(acquired(uwbd({ rsfSfd: true, nMsr: 64 }), lost)).toBe(true)
  })

  it('loses a whole audible train to one inaudible head, and rsfSfd gives it back', () => {
    // The case the lesson is built on: interference sits over the head of the train and the
    // other seven fragments arrive loud. Without the SFD there is exactly one chance to open
    // the packet and it was taken away, so eight fine fragments are worth nothing.
    const head = -120
    const rest = UWB_RX_SENS_DBM + 6
    const train = f(head, rest, rest, rest, rest, rest, rest, rest)
    expect(acquired(uwbd({ rsfSfd: false }), train)).toBe(false)
    expect(acquired(uwbd({ rsfSfd: true, nMsr: 64 }), train)).toBe(true)
    // And it is acquisition, not detection, that decided it: the train itself was never in doubt.
    expect(trainDetected(rest, 8)).toBe(true)
  })

  it('does not rescue a train no fragment of which is audible on its own', () => {
    // The SFD adds chances, not sensitivity. Eight fragments 1 dB down are still eight
    // fragments that cannot open a packet.
    const train = f(...Array.from({ length: 8 }, () => UWB_RX_SENS_DBM - 1))
    expect(acquired(uwbd({ rsfSfd: true, nMsr: 64 }), train)).toBe(false)
  })

  it('has nothing to give back when an SP0 packet already opened the round', () => {
    // The SFD buys extra chances to find the packet, and with SP0 in front there was never a
    // chance to lose: the control packet handed over the time base, so the train is accumulated
    // blind whichever fragment arrived. That is the SP0 path's own trade, not this one's.
    const train = f(-120, UWB_RX_SENS_DBM + 1)
    expect(acquired(phy({ control: 'uwbd', uwbdControl: 'sp0', rsfSfd: false }), train)).toBe(true)
    expect(acquired(uwbd({ rsfSfd: false }), train)).toBe(false)
    expect(acquired(uwbd({ rsfSfd: true, nMsr: 64 }), train)).toBe(true)
  })
})

// --- and the same gate, standing in a running round -------------------------------------------

const MS = 1_000_000

const uwbNode = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y: 1, z: 1 },
  txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} },
  uwb: { role },
})

/** One anchor and one tag `apartM` apart, ranging in MMS mode. The room is a corridor because
 * the interesting distance is one where a single fragment is below sensitivity and the train
 * still clears it — which on the free-space law is tens of metres away. */
function pairScene(apartM: number, over: Partial<UwbSessionCfg['mms']> = {}): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: apartM + 4, h: 4, name: 'corridor' }],
    walls: [],
    nodes: [uwbNode('anc-1', 1, 'anchor'), uwbNode('tag-1', 1 + apartM, 'tag')],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: {
      ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...over },
    },
  }
}

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
const trainsOf = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_MMS_TRAIN' }>[] =>
  rs.filter((r) => r.type === 'UWB_MMS_TRAIN') as never
const rangesOf = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_RANGE' }>[] =>
  rs.filter((r) => r.type === 'UWB_RANGE') as never

/** Far enough that one fragment is inaudible and eight of them are not — see `QUIET_M`. */
const QUIET_M = 140

/** Config 1 carries no narrowband settings at all — there is no radio on that side for a channel
 * list or a listen-before-talk rule to act on, and `UwbMmsSchema` refuses a plan that keeps
 * them. 4ab draft 15-25/0194r0 */
const UWBD = { control: 'uwbd', nbChannels: [] as number[], nbLbt: 'off' } as const

/** The same pair, ranging in the two-way mode instead: a 4z Poll at the node's own power, judged
 * at the plain `UWB_RX_SENS_DBM`. It is the control for the SP0 threshold below. */
function twrPairScene(apartM: number): Scenario {
  const sc = pairScene(apartM)
  return { ...sc, uwb: { ...sc.uwb!, mode: 'twr' } }
}

describe('where the SP0 4 dB is really charged', () => {
  it('costs an SP0 packet the last stretch of link a 4z frame still has', () => {
    // `MMS_SP0_RX_SENS_DBM` runs out just under 17 m at this power on channel 9; the plain
    // sensitivity a 4z frame is judged at reaches past 26 m. So 14 m and 22 m bracket the SP0
    // threshold, and the 4 dB between the two is the whole of what separates them.
    const near = run(pairScene(14, { ...UWBD, uwbdControl: 'sp0' }), 400 * MS)
    expect(near.some((r) => r.type === 'RX_OK' && r.frame.kind === 'uwbSp0')).toBe(true)
    const far = run(pairScene(22, { ...UWBD, uwbdControl: 'sp0' }), 400 * MS)
    expect(far.some((r) => r.type === 'RX_OK' && r.frame.kind === 'uwbSp0')).toBe(false)
    // …and the round goes with it, because under Config 1 with SP0 being primed IS having
    // received that packet: nobody was told there was a peer, so no train goes out.
    expect(far.some((r) => r.type === 'TX_START' && r.frame.kind === 'uwbRsf')).toBe(false)
    // The control: the same 22 m carries a two-way Poll of the same transmitter perfectly well.
    const twr = run(twrPairScene(22), 400 * MS)
    expect(twr.some((r) => r.type === 'RX_OK' && r.frame.kind === 'uwbPoll')).toBe(true)
  })
})

describe('the gate, in a round that is actually running', () => {
  it('narrowband-assisted ranges a peer no single fragment of whose train was audible', () => {
    const trains = trainsOf(run(pairScene(QUIET_M), 400 * MS))
    expect(trains.length).toBeGreaterThan(0)
    // The premise of the two cases below: every fragment arrived under sensitivity, and only
    // the combining gain of the eight put the train over it.
    for (const t of trains) {
      expect(t.rxDbm).toBeLessThan(UWB_RX_SENS_DBM)
      expect(t.detected).toBe(true)
    }
    expect(rangesOf(run(pairScene(QUIET_M), 400 * MS)).length).toBeGreaterThan(0)
  })

  it('UWB-driven loses the same round outright, because nothing opened the packet', () => {
    const rs = run(pairScene(QUIET_M, { ...UWBD, uwbdControl: 'none' }), 400 * MS)
    expect(trainsOf(rs).length).toBeGreaterThan(0)
    // The fragments arrived and were counted; what is missing is the time base to stamp them
    // against, so the train is reported undetected — and with no timestamp there is no time to
    // put in the report the round does still have a window for, so no range either.
    for (const t of trainsOf(rs)) {
      expect(t.heard).toBeGreaterThan(0)
      expect(t.detected).toBe(false)
    }
    expect(rangesOf(rs)).toHaveLength(0)
  })

  it('leaves a UWB-driven round alone when the leading fragment is loud enough', () => {
    // The gate is not a tax on Config 1: close in, the packet opens on its own SYNC+SFD, every
    // train of the round is detected exactly as a narrowband-assisted one is, and the round
    // ranges — the report phase does not go with the control phase, so there is still a frame
    // to carry the reply time back to the initiator. 4ab draft 15-25/0194r0
    const rs = run(pairScene(6, { ...UWBD, uwbdControl: 'none' }), 400 * MS)
    const uwbd = trainsOf(rs)
    const nba = trainsOf(run(pairScene(6), 400 * MS))
    expect(uwbd.length).toBeGreaterThan(0)
    expect(uwbd.every((t) => t.detected)).toBe(true)
    expect(nba.every((t) => t.detected)).toBe(true)
    expect(rangesOf(rs).length).toBeGreaterThan(0)
  })
})
