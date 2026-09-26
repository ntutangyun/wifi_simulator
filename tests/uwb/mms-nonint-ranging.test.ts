/**
 * The **non-interleaved** round, run end to end: does it produce a range at all?
 *
 * Every other test of the shape checks arithmetic — where a sub-round begins, which slot a
 * fragment lands in, how long the round comes to. All of that was right and the round still
 * measured nothing, because the two ends were waiting for each other. The order of a
 * non-interleaved sub-round is the opposite of the interleaved one's (4ab draft 15-25/0292r1
 * §10.39.7, restated in 15-25/0331r1): the initiator sends its MMS packet **without waiting** for
 * a response compact frame, and the responder sends its response **after receiving** that packet.
 * Interleaved, the response comes first and primes both ends before a fragment goes out.
 *
 * So the priming has to be the other way round too, and that is what is pinned here:
 *
 * | role | primed by |
 * | --- | --- |
 * | initiator | its own control window having passed — it waits for nobody |
 * | responder | the POLL it heard, which is all it gets before the packet arrives |
 *
 * A zero-length control phase is the same rule with the packet doing the control plane's work:
 * there is no POLL to hear, so the fragment is the poll, and `acquired` is what decides the
 * receiver ever found it (4ab draft 15-25/0194r0).
 *
 * The last describe is the guard on the other shape: interleaved priming is not touched by any of
 * this, and every stored plan in `tests/fixtures/` replays off it.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { UWB_TX_POWER_DBM } from '../../src/uwb/phy'

const uwbNode = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y: 4, z: 1 },
  txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} },
  uwb: { role },
})

/** One anchor and one tag 3 m apart on the session's own default train (X = 8 RSFs, no RIF) at
 * the draft's 600 RSTU ranging slot — the scene every other MMS round test is run in. */
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
      mms: { ...DEFAULT_UWB_SESSION.mms, ...over },
    },
  })
}

/** The three control planes of the draft, in the non-interleaved shape: Config 2's narrowband
 * messages, Config 1's SP0 packets on the UWB PHY, and Config 1 with no control phase at all.
 * 4ab draft 15-25/0194r0 */
const SHAPES = {
  'Config 2, narrowband control': { nonInterleaved: true, control: 'nba' },
  'Config 1, SP0 control': {
    nonInterleaved: true, control: 'uwbd', uwbdControl: 'sp0', nbChannels: [], nbLbt: 'off',
  },
  'Config 1, zero-length control phase': {
    nonInterleaved: true, control: 'uwbd', uwbdControl: 'none', nbChannels: [], nbLbt: 'off',
  },
} as const satisfies Record<string, Partial<UwbSessionCfg['mms']>>

/** The longest of the three rounds is Config 2's 48 slots — 24 ms at 600 RSTU — so this holds one
 * round of every shape and no second round can quietly supply what the first did not. */
const ONE_ROUND_NS = 30 * 1_000_000

const run = (over: Partial<UwbSessionCfg['mms']>): TLRecord[] =>
  new Simulation(scene(over)).runUntil(ONE_ROUND_NS).records

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const rangesOf = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_RANGE' }>[] =>
  rs.filter((r) => r.type === 'UWB_RANGE') as never
const txOf = (rs: TLRecord[], node: string, kind: string): Tx[] =>
  rs.filter((r) => r.type === 'TX_START' && r.node === node && r.frame.kind === kind) as never
/** When this device put its response on the air, whichever radio carried it: a narrowband RESP
 * under Config 2 and an SP0 packet with `role: 'resp'` under Config 1. */
const respAt = (rs: TLRecord[], node: string): number[] => [
  ...txOf(rs, node, 'nbResp').map((r) => r.t),
  ...txOf(rs, node, 'uwbSp0').filter((r) => r.frame.uwb?.sp0?.role === 'resp').map((r) => r.t),
]

// --- the defect itself -----------------------------------------------------------------------

describe('a non-interleaved round ranges in every control plane', () => {
  it('ranges in every configuration, not only the one with no control phase', () => {
    for (const [name, over] of Object.entries(SHAPES)) {
      const ranges = rangesOf(run(over))
      expect(ranges.length, name).toBeGreaterThan(0)
      // Both ends range: the responder off the initiator's REPORT, the initiator off the
      // responder's. Counted per node so a round that only half worked cannot pass.
      expect([...new Set(ranges.map((r) => r.node))].sort(), name).toEqual(['anc-1', 'tag-1'])
      for (const r of ranges) expect(r.trueDistM, `${name} ${r.node}`).toBeCloseTo(3, 6)
    }
  })

  it('and each of them ranges at the instant its own REPORT finishes arriving', () => {
    // Read off the runs, not recomputed here. The three rounds are 48, 44 and 42 slots long
    // (a control window of 2, 1 and 0 slots, twice over, plus a report phase of 4, 2 and 2), so
    // each shape's report phase opens earlier than the last — and the range lands where the
    // report it needed finished, not on a slot boundary.
    const pinned = {
      'Config 2, narrowband control': [
        ['tag-1', 22_608_011, 2.9821], ['anc-1', 23_608_011, 2.9994],
      ],
      'Config 1, SP0 control': [
        ['tag-1', 21_117_611, 2.9821], ['anc-1', 21_617_611, 2.9952],
      ],
      'Config 1, zero-length control phase': [
        ['tag-1', 20_117_611, 2.9856], ['anc-1', 20_617_611, 2.9947],
      ],
    } as const
    for (const [name, over] of Object.entries(SHAPES)) {
      const ranges = rangesOf(run(over))
      expect(ranges.map((r) => [r.node, r.t]), name)
        .toEqual(pinned[name as keyof typeof pinned].map(([node, t]) => [node, t]))
      ranges.forEach((r, i) => {
        expect(r.distM, `${name} ${r.node}`).toBeCloseTo(pinned[name as keyof typeof pinned][i][2], 4)
      })
    }
  })
})

// --- what each row of the rule costs when the control plane does not reach ---------------------

/** One anchor and one tag `apartM` apart in a corridor, which is the only way to a distance where
 * a single fragment is under sensitivity and eight of them are not. */
function corridor(apartM: number, over: Partial<UwbSessionCfg['mms']>): Scenario {
  return ScenarioSchema.parse({
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
  })
}

describe('each row of the rule is a different answer at the edge of the link', () => {
  /** Far enough that every fragment lands at −96.9 dBm — 3.9 dB under sensitivity, which eight of
   * them combine past and one of them never opens a packet with. 300 ms is two rounds. */
  const QUIET_M = 140
  const FAR_NS = 300 * 1_000_000
  const far = (over: Partial<UwbSessionCfg['mms']>): TLRecord[] =>
    new Simulation(corridor(QUIET_M, over)).runUntil(FAR_NS).records
  const fragsOf = (rs: TLRecord[], node: string): number => txOf(rs, node, 'uwbRsf').length
  const detectedOf = (rs: TLRecord[]): number =>
    rs.filter((r) => r.type === 'UWB_MMS_TRAIN' && r.detected).length

  it('primes over the narrowband POLL and accumulates blind, as Config 2 always has', () => {
    const rs = far(SHAPES['Config 2, narrowband control'])
    expect([fragsOf(rs, 'tag-1'), fragsOf(rs, 'anc-1')]).toEqual([16, 16])
    expect(detectedOf(rs)).toBe(4)
    expect(rangesOf(rs)).toHaveLength(4)
  })

  it('needs `acquired` to have found the packet when the control phase is zero-length', () => {
    // The row this shape is on: there is no POLL to be primed by, so the packet has to be found
    // on a single fragment with no combining — and at this distance it is not. Four trains whose
    // every fragment arrived, none of them detected, no range.
    const rs = far(SHAPES['Config 1, zero-length control phase'])
    expect([fragsOf(rs, 'tag-1'), fragsOf(rs, 'anc-1')]).toEqual([16, 16])
    expect(detectedOf(rs)).toBe(0)
    expect(rangesOf(rs)).toHaveLength(0)
  })

  it('leaves the initiator transmitting alone when the SP0 POLL does not arrive', () => {
    // And this is the initiator's row seen from the other side: its packet goes out whatever
    // happened to the control plane, because it waits for nobody. The responder heard no POLL, so
    // it never listened and never answered — the cycle is lost, and not quietly.
    const rs = far(SHAPES['Config 1, SP0 control'])
    expect([fragsOf(rs, 'tag-1'), fragsOf(rs, 'anc-1')]).toEqual([16, 0])
    expect(detectedOf(rs)).toBe(0)
    expect(rangesOf(rs)).toHaveLength(0)
  })
})

describe('the non-interleaved initiator does not wait for a response compact frame', () => {
  it('puts its first fragment on the air before any response exists', () => {
    for (const [name, over] of Object.entries(SHAPES)) {
      const rs = run(over)
      const frags = txOf(rs, 'tag-1', 'uwbRsf').map((r) => r.t)
      expect(frags, name).toHaveLength(8)
      const resp = respAt(rs, 'anc-1')
      // Config 1 with no control phase sends no response at all — there the packet is the
      // response, which is the same rule with nothing left to compare against.
      if (resp.length > 0) expect(frags[0], name).toBeLessThan(resp[0])
      // …and the whole packet is out before it: the response answers a packet, not a fragment.
      if (resp.length > 0) expect(frags[7], name).toBeLessThan(resp[0])
    }
  })
})

describe('the non-interleaved responder listens before it answers', () => {
  it('has the initiator’s fragments in hand by the time its response goes out', () => {
    for (const [name, over] of Object.entries(SHAPES)) {
      const rs = run(over)
      const heard = rs
        .filter((r) => r.type === 'RX_OK' && r.node === 'anc-1' && r.frame.kind === 'uwbRsf')
        .map((r) => r.t)
      expect(heard, name).toHaveLength(8)
      const resp = respAt(rs, 'anc-1')
      if (resp.length > 0) expect(heard[7], name).toBeLessThan(resp[0])
    }
  })

  it('and it heard the POLL first, which is the only thing it was told', () => {
    for (const name of ['Config 2, narrowband control', 'Config 1, SP0 control'] as const) {
      const rs = run(SHAPES[name])
      const poll = rs.filter((r) => (
        r.type === 'RX_OK' && r.node === 'anc-1'
        && (r.frame.kind === 'nbPoll' || r.frame.uwb?.sp0?.role === 'poll')
      ))
      expect(poll, name).toHaveLength(1)
      const heard = rs.filter((r) => r.type === 'RX_OK' && r.node === 'anc-1' && r.frame.kind === 'uwbRsf')
      expect(poll[0].t, name).toBeLessThan(heard[0].t)
    }
  })
})

// --- the guard on the other shape ------------------------------------------------------------

describe('interleaved priming is unchanged', () => {
  const INT = { nonInterleaved: false, control: 'nba' } as const

  it('still holds the initiator’s train until the response has arrived', () => {
    const rs = run(INT)
    const resp = txOf(rs, 'anc-1', 'nbResp').map((r) => r.t)
    expect(resp).toHaveLength(1)
    const frags = txOf(rs, 'tag-1', 'uwbRsf').map((r) => r.t)
    expect(frags).toHaveLength(8)
    // The other way round from the non-interleaved round above: the response comes first and is
    // what lets the initiator transmit at all.
    expect(resp[0]).toBeLessThan(frags[0])
  })

  it('still primes the responder by answering, not by hearing', () => {
    const rs = run(INT)
    const resp = txOf(rs, 'anc-1', 'nbResp').map((r) => r.t)
    const own = txOf(rs, 'anc-1', 'uwbRsf').map((r) => r.t)
    expect(own).toHaveLength(8)
    expect(resp[0]).toBeLessThan(own[0])
    // It listens for the initiator's fragments only once it has answered, so the first one it
    // takes in is after its own response — interleaved, they are in the same millisecond.
    const heard = rs.filter((r) => r.type === 'RX_OK' && r.node === 'anc-1' && r.frame.kind === 'uwbRsf')
    expect(heard).toHaveLength(8)
    expect(resp[0]).toBeLessThan(heard[0].t)
  })

  it('ranges at both ends on exactly the schedule it always did', () => {
    const rs = run(INT)
    expect(txOf(rs, 'tag-1', 'nbPoll').map((r) => r.t)).toEqual([0])
    expect(txOf(rs, 'anc-1', 'nbResp').map((r) => r.t)).toEqual([1_000_000])
    expect(txOf(rs, 'tag-1', 'uwbRsf').map((r) => r.t)).toEqual([
      2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000, 9_000_000,
    ])
    expect(txOf(rs, 'anc-1', 'uwbRsf').map((r) => r.t)).toEqual([
      2_500_000, 3_500_000, 4_500_000, 5_500_000, 6_500_000, 7_500_000, 8_500_000, 9_500_000,
    ])
    // The two reports, and the range each of them completes at the instant it finishes arriving.
    expect(txOf(rs, 'anc-1', 'nbReport').map((r) => r.t)).toEqual([12_000_000])
    expect(txOf(rs, 'tag-1', 'nbReport').map((r) => r.t)).toEqual([13_000_000])
    const ranges = rangesOf(rs)
    expect(ranges.map((r) => [r.node, r.t])).toEqual([
      ['tag-1', 12_608_011], ['anc-1', 13_608_011],
    ])
    expect(ranges[0].distM).toBeCloseTo(2.9651, 4)
    expect(ranges[1].distM).toBeCloseTo(2.9657, 4)
  })
})
