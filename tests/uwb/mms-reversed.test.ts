/**
 * The draft's **reversed order** — the last of the five features (4ab draft 15-25/0556r2).
 *
 * With the bit set, the responder puts its MMS packet on the air first and the initiator follows
 * `MMS_REVERSED_OFFSET_RSTU` — 600 RSTU, half a millisecond — into the ranging phase. It is only
 * legal non-interleaved, because interleaved both ends already send a fragment inside the same
 * millisecond and there is no "who goes first" left to swap.
 *
 * Two things were broken before this file existed, and they are why it exists:
 *
 * 1. **Any control phase ranged zero times.** The opening responder's RESP is slot 0 of the round
 *    and the POLL it would answer is at the head of the initiator's sub-round, after the whole of
 *    this responder's packet — so a RESP that waits for a POLL waits for something that cannot
 *    have happened yet, and nothing in the round ever transmitted a fragment.
 * 2. **A zero-length control phase reported about 65.9 km.** Single-sided two-way ranging has two
 *    times, and which end measured which is decided by who transmitted first. Reading it off the
 *    *role* instead asked `counterDiff` for an interval that ran backwards, and it answers with
 *    the counter's whole 2^40 modulus: 65 877.04 m at the initiator and 65 898.41 m at the
 *    responder, in a UWB_RANGE record, with `trueDistM: 3` beside it.
 *
 * The second is the worse of the two by far. A feature that produces nothing is a gap; a feature
 * that produces a confident false number reaches the records and the interface, and the whole
 * discipline of this simulator is that a stated number is the simulated one. Both figures above
 * were read off the broken runs before the fix and are pinned as the fix's own yardstick.
 *
 * The rounds below are the pairwise 3 m round at the draft's 600 RSTU slot, on the session's own
 * default train (X = 8 RSFs, no RIF), in each of the three control planes the draft allows: the
 * narrowband trio of Config 2, the same trio as SP0 packets on the UWB PHY under Config 1, and
 * Config 1 with no control phase at all.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, UwbMmsSchema, type NodeCfg, type Scenario,
  type UwbSessionCfg,
} from '../../src/model/scenario'
import { MMS_REVERSED_OFFSET_RSTU } from '../../src/uwb/mms'
import { UWB_TX_POWER_DBM } from '../../src/uwb/phy'
import { roundPlan, rstuNs, type RoundPlan } from '../../src/uwb/session'

const uwbNode = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y: 4, z: 1 },
  txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} },
  uwb: { role },
})

/** One anchor and one tag 3 m apart — the distance every range below is judged against. */
const TRUE_M = 3
/** Half a metre: wide enough that no reading of the noise this scene draws can fail it, and
 * narrow enough that the 65.9 km could never pass it. */
const TOL_M = 0.5

function scene(over: Partial<UwbSessionCfg['mms']>): Scenario {
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
      mms: { ...DEFAULT_UWB_SESSION.mms, nonInterleaved: true, ...over },
    },
  })
}

const plan = (over: Partial<UwbSessionCfg['mms']>): RoundPlan => roundPlan({
  ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600,
  mms: { ...DEFAULT_UWB_SESSION.mms, nonInterleaved: true, ...over },
}, 1)

/**
 * The three control planes, each in the shape its own configuration demands: Config 1 has no
 * narrowband radio, so its channel list is empty and its listen-before-talk is off.
 */
const PLANES = [
  { tag: 'Config 2, narrowband', mms: {} },
  { tag: 'Config 1, SP0', mms: { control: 'uwbd', uwbdControl: 'sp0', nbChannels: [], nbLbt: 'off' } },
  { tag: 'Config 1, no control phase', mms: { control: 'uwbd', uwbdControl: 'none', nbChannels: [], nbLbt: 'off' } },
] as const satisfies readonly { tag: string; mms: Partial<UwbSessionCfg['mms']> }[]

const run = (sc: Scenario, ns: number): TLRecord[] => new Simulation(sc).runUntil(ns).records
/** One round of the first block and no more — the longest round below is 48 slots (24 ms) — so
 * every instant here belongs to that round and a second round cannot supply what the first did
 * not. */
const ONE_ROUND_NS = 30 * 1_000_000

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txOf = (rs: TLRecord[], node: string, kind: string): number[] =>
  (rs.filter((r) => r.type === 'TX_START' && r.node === node && r.frame.kind === kind) as Tx[])
    .map((r) => r.t)
/** Every transmission of the round, in order, as `time node kind` — the whole round in one
 * readable list, so a guard over it catches a frame that moved as well as one that vanished. */
const script = (rs: TLRecord[]): string[] =>
  (rs.filter((r) => r.type === 'TX_START') as Tx[]).map((r) => `${r.t} ${r.node} ${r.frame.kind}`)
const rangesOf = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_RANGE' }>[] =>
  rs.filter((r) => r.type === 'UWB_RANGE') as never

// --- (a) it ranges at all, and it ranges the room it is in ------------------------------------

describe('a reversed round ranges, and reports a distance from this room', () => {
  /**
   * What each plane now measures, at the initiator and at the responder — read off the fixed runs.
   *
   * Five to seven centimetres out, and that is the mode's own arithmetic rather than the reversal's:
   * the reply time is a count of the far end's crystal, and what converts it is the ratio the train
   * measured — good to some 2·10⁻⁸ over a seven-millisecond train, which over an eleven-millisecond
   * turnaround is a couple of tenths of a nanosecond. The draft's own yardstick is 30 cm of range
   * per nanosecond of time-of-flight error (15-25/0556r2). The uncorrected figure the same two
   * times come to is tens of metres out, which is what the correction is for.
   */
  const REVERSED_M: Record<string, [number, number]> = {
    'Config 2, narrowband': [2.9436241544387176, 2.929333544993273],
    'Config 1, SP0': [2.9444472034665408, 2.930778113448544],
    'Config 1, no control phase': [2.947951076871337, 2.934903130150293],
  }

  for (const p of PLANES) {
    it(`${p.tag}`, () => {
      const rs = run(scene({ ...p.mms, reversedOrder: true }), ONE_ROUND_NS)
      const ranges = rangesOf(rs)
      expect(ranges.length).toBeGreaterThan(0)
      // Both ends, in that order: the responder's REPORT carries the round trip it measured over
      // the initiator's packet and the initiator's answer carries the reply time — the same
      // single-sided exchange as ever, with the two halves in the other pair of hands.
      expect(ranges.map((r) => r.node)).toEqual(['tag-1', 'anc-1'])
      expect(ranges.map((x) => x.distM)).toEqual(REVERSED_M[p.tag])
      for (const r of ranges) {
        expect(r.trueDistM).toBeCloseTo(TRUE_M, 6)
        expect(Math.abs(r.distM - TRUE_M), `${r.node}: ${r.distM} m`).toBeLessThan(TOL_M)
      }
    })
  }
})

describe('…and so does a one-to-many reversed round, anchor by anchor', () => {
  it('ranges all three, and not one of them from orbit', () => {
    // The shape that would hide the same defect twice over: three responders, three sub-rounds
    // ahead of the initiator's, and one held-back packet that all three of them have to hear.
    const sc = ScenarioSchema.parse({
      rooms: [{ x: 0, y: 0, w: 12, h: 8, name: 'hall' }],
      walls: [],
      nodes: [
        uwbNode('anc-1', 4, 'anchor'), uwbNode('anc-2', 6, 'anchor'), uwbNode('anc-3', 8, 'anchor'),
        uwbNode('tag-1', 1, 'tag'),
      ],
      servers: [],
      seed: 7,
      rtsThresholdBytes: 3000,
      snapshotIntervalMs: 10,
      uwb: {
        ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
        mms: {
          ...DEFAULT_UWB_SESSION.mms, nonInterleaved: true, oneToMany: true, reversedOrder: true,
        },
      },
    })
    const ranges = rangesOf(run(sc, 60 * 1_000_000))
    // One pair of REPORTs per responder: the round trip out of the responder that transmitted
    // first, the reply time back out of the initiator.
    expect(ranges).toHaveLength(6)
    for (const r of ranges) {
      expect(Math.abs(r.distM - r.trueDistM), `${r.node}→${r.peer}: ${r.distM} m`).toBeLessThan(TOL_M)
    }
    expect([...new Set(ranges.map((r) => r.trueDistM.toFixed(0)))].sort()).toEqual(['3', '5', '7'])
  })
})

// --- (b) the 600 RSTU the initiator waits ------------------------------------------------------

describe('the reversed initiator follows 600 RSTU into the ranging phase', () => {
  it('holds its packet back half a millisecond, and the responder holds nothing back', () => {
    const rs = run(scene({ ...PLANES[2].mms, reversedOrder: true }), ONE_ROUND_NS)
    // With no control phase the responder's sub-round IS the round's opening: its eight fragments
    // go out a millisecond apart from slot 0.
    expect(txOf(rs, 'anc-1', 'uwbRsf')).toEqual([
      0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000,
    ])
    // The initiator's sub-round starts at slot 20 (10.0 ms) and its packet starts 600 RSTU later.
    expect(txOf(rs, 'tag-1', 'uwbRsf')).toEqual([
      10_500_000, 11_500_000, 12_500_000, 13_500_000,
      14_500_000, 15_500_000, 16_500_000, 17_500_000,
    ])
    // …which is the constant and nothing else: 600 RSTU is 500 µs, and the sub-round boundary the
    // layout gave that first fragment is the 10.0 ms a forward round transmits it at.
    expect(rstuNs(MMS_REVERSED_OFFSET_RSTU)).toBe(500_000)
    const l = plan({ ...PLANES[2].mms, reversedOrder: true }).mms!.layout
    expect(l.fragmentSlot('initiator', 'rsf', 0) * rstuNs(600)).toBe(10_000_000)
  })

  it('and every one of those fragments still lands', () => {
    // The receive window is widened by the same constant, so the packet is heard where it really
    // is rather than where the layout would have put it — the offset costs no fragment.
    const rs = run(scene({ ...PLANES[2].mms, reversedOrder: true }), ONE_ROUND_NS)
    const heard = rs.filter((r) => r.type === 'RX_OK' && r.node === 'anc-1' && r.frame.kind === 'uwbRsf')
    expect(heard).toHaveLength(8)
  })

  it('is refused interleaved, where there is no order to reverse', () => {
    const mms = (over: Partial<UwbSessionCfg['mms']>): unknown => ({ ...DEFAULT_UWB_SESSION.mms, ...over })
    expect(UwbMmsSchema.safeParse(mms({ reversedOrder: true })).success).toBe(false)
    expect(UwbMmsSchema.safeParse(mms({ reversedOrder: true, nonInterleaved: true })).success).toBe(true)
  })
})

// --- (c) the guard: forward order is the round that shipped ------------------------------------

describe('forward order is unchanged in all three control planes', () => {
  /** Every transmission of the forward-order round, read off the engine before the reversed path
   * was fixed. Nothing of the fix may move any of them: the reversal is a setting, and a session
   * that has not asked for it is the session that shipped. */
  const FORWARD: Record<string, string[]> = {
    'Config 2, narrowband': [
      '0 tag-1 nbPoll',
      '1000000 tag-1 uwbRsf', '2000000 tag-1 uwbRsf', '3000000 tag-1 uwbRsf', '4000000 tag-1 uwbRsf',
      '5000000 tag-1 uwbRsf', '6000000 tag-1 uwbRsf', '7000000 tag-1 uwbRsf', '8000000 tag-1 uwbRsf',
      '11000000 anc-1 nbResp',
      '12000000 anc-1 uwbRsf', '13000000 anc-1 uwbRsf', '14000000 anc-1 uwbRsf', '15000000 anc-1 uwbRsf',
      '16000000 anc-1 uwbRsf', '17000000 anc-1 uwbRsf', '18000000 anc-1 uwbRsf', '19000000 anc-1 uwbRsf',
      '22000000 anc-1 nbReport', '23000000 tag-1 nbReport',
    ],
    'Config 1, SP0': [
      '0 tag-1 uwbSp0',
      '500000 tag-1 uwbRsf', '1500000 tag-1 uwbRsf', '2500000 tag-1 uwbRsf', '3500000 tag-1 uwbRsf',
      '4500000 tag-1 uwbRsf', '5500000 tag-1 uwbRsf', '6500000 tag-1 uwbRsf', '7500000 tag-1 uwbRsf',
      '10500000 anc-1 uwbSp0',
      '11000000 anc-1 uwbRsf', '12000000 anc-1 uwbRsf', '13000000 anc-1 uwbRsf', '14000000 anc-1 uwbRsf',
      '15000000 anc-1 uwbRsf', '16000000 anc-1 uwbRsf', '17000000 anc-1 uwbRsf', '18000000 anc-1 uwbRsf',
      '21000000 anc-1 uwbSp0', '21500000 tag-1 uwbSp0',
    ],
    'Config 1, no control phase': [
      '0 tag-1 uwbRsf', '1000000 tag-1 uwbRsf', '2000000 tag-1 uwbRsf', '3000000 tag-1 uwbRsf',
      '4000000 tag-1 uwbRsf', '5000000 tag-1 uwbRsf', '6000000 tag-1 uwbRsf', '7000000 tag-1 uwbRsf',
      '10000000 anc-1 uwbRsf', '11000000 anc-1 uwbRsf', '12000000 anc-1 uwbRsf', '13000000 anc-1 uwbRsf',
      '14000000 anc-1 uwbRsf', '15000000 anc-1 uwbRsf', '16000000 anc-1 uwbRsf', '17000000 anc-1 uwbRsf',
      '20000000 anc-1 uwbSp0', '20500000 tag-1 uwbSp0',
    ],
  }
  /** …and the two ranges each of them produced, to the digit. A sign flip buried in the
   * single-sided arithmetic would leave the script above untouched and show up only here. */
  const FORWARD_M: Record<string, [number, number]> = {
    'Config 2, narrowband': [2.982061211564830, 2.999417985346069],
    'Config 1, SP0': [2.982145860222017, 2.995194807254421],
    'Config 1, no control phase': [2.9855820564249815, 2.9946581369938743],
  }

  for (const p of PLANES) {
    it(`${p.tag}`, () => {
      const rs = run(scene({ ...p.mms, reversedOrder: false }), ONE_ROUND_NS)
      expect(script(rs)).toEqual(FORWARD[p.tag])
      const ranges = rangesOf(rs)
      expect(ranges.map((r) => r.node)).toEqual(['tag-1', 'anc-1'])
      expect(ranges.map((r) => r.distM)).toEqual(FORWARD_M[p.tag])
    })
  }
})
