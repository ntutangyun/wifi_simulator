/**
 * Task 3 of the SP3 grouped-ranging slice: the device and network layer, and the acceptance
 * measurement for the whole slice.
 *
 * Every test here runs a **whole round** through `UwbNetwork` and reads the records it produced.
 * Nothing below asserts against a helper or a hand-written constant: the air times come from the
 * `TX_START` records' own `frame.txTimeNs` (the ruler — see the comment on `airByKind`), and every
 * expected byte count is imported from `src/uwb/phy.ts` rather than retyped.
 *
 * The one test the slice exists for is `identifies the sender by its slot`: an SP3 packet is
 * SYNC + SFD + STS (standard §10.32.8.2) — no PHR, no PSDU — so it can carry neither an identity
 * nor a timestamp. Shuffling the slot→device table the initiator resolves identity with has to
 * make the distances **wrong**; if it left them right, something in the frame would be carrying
 * the identity after all and the lesson's premise would be gone.
 *
 * See `docs/superpowers/specs/2026-10-02-sp3-design.md`, especially §2.1 (there is no crossover)
 * and §3.2 (identity comes from the slot).
 */
import { describe, expect, it } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, type NodeCfg, type UwbSessionCfg } from '../../src/model/scenario'
import type { FrameDesc } from '../../src/model/frames'
import type { UwbFrameKind } from '../../src/uwb/frames'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { UwbNetwork } from '../../src/uwb/network'
import { rangeSigmaM } from '../../src/uwb/position'
import {
  UWB_SP3_RAOA_ITEM_BYTES, UWB_SS_DEFER_BYTES, UWB_TX_POWER_DBM,
  srrrIeBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSp3Ns, uwbSp3PollBytes, uwbSp3ReportBytes,
} from '../../src/uwb/phy'

const MS = 1_000_000
/** One block is 200 ms; every round below is finished long before that, so a run of this length
 * holds exactly block 0's one round and nothing else. */
const RUN_NS = 120 * MS

/**
 * How far a correct range may sit from the geometry: five times the range's own 1-σ
 * (`rangeSigmaM` of the session's timestamp noise — 2.1 cm at the default 100 ps), derived rather
 * than written down. A loose band on purpose: the point of every use below is that it is three
 * orders of magnitude under the metres a wrong slot attribution produces, not that it is tight.
 */
const RANGE_BUDGET_M = 5 * rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)

/** Anchor distances from the tag, in metres, in anchor order — deliberately all different, so a
 * range attached to the wrong anchor is a range that disagrees with its own `trueDistM`. */
const ANCHOR_X = [0, 3, 8, 11, 2, 9]
const TAG_X = 5

function uwbNode(id: string, x: number, role: 'anchor' | 'tag', y = 0): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 },
    txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm: 0 },
  }
}

function nodesFor(anchors: number, xs: number[] = ANCHOR_X): NodeCfg[] {
  const list: NodeCfg[] = []
  for (let k = 0; k < anchors; k++) list.push(uwbNode(`anc-${k + 1}`, xs[k], 'anchor'))
  list.push(uwbNode('tag-1', TAG_X, 'tag'))
  return list
}

interface RunOpts {
  anchors?: number
  /** Where the anchors stand, in anchor order. An anchor far enough out hears no Poll at all,
   * which is how the test below reaches the silent-slot path. */
  anchorX?: number[]
  /**
   * The mutation of the acceptance test: hand the **initiator** a slot→device table that is the
   * reverse of the real one, leaving every responder's own table truthful. Nothing else about the
   * run changes — the same devices transmit in the same slots at the same instants — so the only
   * thing that moves is which device the initiator believes each slot belongs to.
   */
  shuffleTagSlots?: boolean
}

/**
 * One round, run straight off `UwbNetwork`, with every record it produced.
 *
 * Built without the scenario schema in front of it for the same reason `tests/uwb/
 * reply-time-round.test.ts` does it: the mutation above is not a configuration the schema has (or
 * should have) a field for — it is a disagreement between the two ends of a round about whose slot
 * is whose, and the only way to watch what a round *does* under one is to build the round directly.
 */
function run(
  session: Partial<UwbSessionCfg>,
  { anchors = 2, anchorX = ANCHOR_X, shuffleTagSlots = false }: RunOpts = {},
): TLRecord[] {
  const q = new EventQueue()
  let now = 0
  const recs: TLRecord[] = []
  const nodes = nodesFor(anchors, anchorX)
  const net = new UwbNetwork(
    q, () => now, nodes, [], { ...DEFAULT_UWB_SESSION, ...session }, new Rng(7),
    makeEmitter((x) => recs.push(x as TLRecord)),
  )
  if (shuffleTagSlots) {
    const tag = net.devices.get('tag-1')!
    const real = tag.beginRound.bind(tag)
    // `beginRound`'s `anchors` argument is the one copy of the slot table the initiator resolves a
    // marker's sender from (`RoundState.anchors`). Reversing it here — and only here — is the
    // shuffle: `onSlot`'s own `peers.anchors`, which decides who *transmits*, is untouched.
    tag.beginRound = (block, round, plan, tagId, anchorIds, opts) =>
      real(block, round, plan, tagId, [...anchorIds].reverse(), opts)
  }
  for (;;) {
    const t = q.peekTime()
    if (t === null || t > RUN_NS) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return recs
}

const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

/** The decoded payload rows of one frame, as the frame inspector lays them out. */
const rows = (f: FrameDesc) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields

/**
 * Total air time per frame kind, in nanoseconds, from the round that actually ran.
 *
 * **The ruler**: every transmission's own `TX_START` record carries the `FrameDesc` the medium
 * radiated, and `frame.txTimeNs` is that PPDU's airtime as the PHY computed it — `uwbPpduNs` for
 * an SP1 frame, `uwbSp3Ns()` for a marker. So this counts what went on the air, once per
 * transmission, rather than re-deriving it from a byte count at the measuring end.
 */
function airByKind(rs: TLRecord[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of of(rs, 'TX_START')) {
    out[r.frame.kind] = (out[r.frame.kind] ?? 0) + r.frame.txTimeNs
  }
  return out
}

const sumAir = (rs: TLRecord[]): number =>
  of(rs, 'TX_START').reduce((n, r) => n + r.frame.txTimeNs, 0)

/**
 * How many SP3 markers the round put on the air. Every test that compares an SP3 round against an
 * SP1 one asserts this first: with `sp3` inert, an "SP3" run is byte-for-byte the SP1 deferred run,
 * and every comparison below would pass without a single marker ever having existed.
 */
const markerCount = (rs: TLRecord[]): number =>
  of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp3').length

/** The ranging phase: the responders' ranging frames, whichever packet format they take. */
const rangingAir = (rs: TLRecord[]): number => {
  const a = airByKind(rs)
  return (a['uwbSp3'] ?? 0) + (a['uwbResp'] ?? 0)
}
/** The data report phase: standard §10.32.8.1's third phase, one frame per reporting responder. */
const reportAir = (rs: TLRecord[]): number => airByKind(rs)['uwbSsDefer'] ?? 0

/** A deferred SS-TWR round with SP3 markers in its ranging phase — the shape the slice builds. */
const SP3: Partial<UwbSessionCfg> = { method: 'ss', replyTime: 'deferred', sp3: true }
/** The same round with SP1 Responses: the shape SP3 replaces frame for frame. */
const SP1_DEFERRED: Partial<UwbSessionCfg> = { method: 'ss', replyTime: 'deferred' }
/** The shape §2.1's accounting compares a whole SP3 round against: the reply time rides the
 * Response, so there is no report phase at all. */
const SP1_EMBEDDED: Partial<UwbSessionCfg> = { method: 'ss', replyTime: 'embedded' }

const rangesOf = (rs: TLRecord[]): { peer: string; distM: number; trueDistM: number }[] =>
  of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1')
    .map((r) => ({ peer: r.peer, distM: r.distM, trueDistM: r.trueDistM }))

describe('SP3 grouped ranging: a whole round', () => {
  it('measures the same distances as an SP1 round', () => {
    const sp3run = run(SP3)
    expect(markerCount(sp3run)).toBe(2)
    const sp3 = rangesOf(sp3run)
    const sp1 = rangesOf(run(SP1_DEFERRED))
    expect(sp3.length).toBe(2)
    // Exactly equal, not merely close: the marker's RMARKER sits the same `UWB_RMARKER_NS` into
    // the PPDU as the Response's did and starts at the same slot boundary, and the round takes the
    // same draws from the same generator in the same order — so the only thing that changed is how
    // much air time the frame spent *after* the instant that was measured.
    expect(sp3).toEqual(sp1)
    // …and the distances are the geometry, not just each other.
    for (const r of sp3) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(RANGE_BUDGET_M)
    // Against the embedded shape the draws differ (one reception per anchor instead of two), so
    // this one is within the noise rather than identical.
    const emb = rangesOf(run(SP1_EMBEDDED))
    expect(emb.length).toBe(2)
    for (const r of emb) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(RANGE_BUDGET_M)
  })

  it('spends less air on the ranging phase and more on the report phase', () => {
    const sp3 = run(SP3)
    const emb = run(SP1_EMBEDDED)
    // Phase by phase, both sums read off the rounds that ran.
    expect(rangingAir(sp3)).toBeLessThan(rangingAir(emb))
    expect(reportAir(emb)).toBe(0)
    expect(reportAir(sp3)).toBeGreaterThan(0)
    // And the report phase more than eats the saving: that is the whole of §2.1.
    expect(reportAir(sp3)).toBeGreaterThan(rangingAir(emb) - rangingAir(sp3))
    // The ranging phase's saving is exactly the per-frame saving, A times over — the number the
    // lesson opens with, now measured from a round rather than from the primitives.
    const perFrame = uwbPpduNs(uwbRespBytes('ss', 'embedded')) - uwbSp3Ns()
    expect(rangingAir(emb) - rangingAir(sp3)).toBeCloseTo(2 * perFrame, 6)
  })

  it('costs more air time than an SP1 round at every anchor count', () => {
    let lastGap = 0
    for (let a = 1; a <= ANCHOR_X.length; a++) {
      const sp3 = run(SP3, { anchors: a })
      expect(markerCount(sp3)).toBe(a)
      const gap = sumAir(sp3) - sumAir(run(SP1_EMBEDDED, { anchors: a }))
      expect(gap).toBeGreaterThan(0)
      expect(gap).toBeGreaterThan(lastGap)
      lastGap = gap
    }
  })

  /**
   * The number §2.1 asks the lesson to carry, measured from the rounds rather than from the
   * primitives: how many times over one report frame costs what one marker saves.
   *
   * It is **not** Task 1's 4.578, and the difference is the denominator, not a disagreement about
   * the conclusion. Task 1 measured the marker against the shortest SP1 frame there is
   * (`uwbRespBytes('ds')`, 14 octets); a whole-round comparison against the embedded shape has to
   * measure it against the frame that shape actually sends, the 20-octet embedded SS Response, which
   * the marker saves more against. Both are computed here from the same primitives so that neither
   * number can be mistaken for the other.
   */
  it('pins how many times over the report phase costs what the markers saved', () => {
    const sp3 = run(SP3)
    const emb = run(SP1_EMBEDDED)
    const saved = rangingAir(emb) - rangingAir(sp3)
    const againstEmbedded = uwbPpduNs(UWB_SS_DEFER_BYTES) / (uwbPpduNs(uwbRespBytes('ss', 'embedded')) - uwbSp3Ns())
    const againstShortest = uwbPpduNs(UWB_SS_DEFER_BYTES) / (uwbPpduNs(uwbRespBytes('ds')) - uwbSp3Ns())
    expect(reportAir(sp3) / saved).toBeCloseTo(againstEmbedded, 6)
    expect(againstShortest).toBeGreaterThan(againstEmbedded)
  })

  /**
   * …and the other half of the accounting, which §2.1's table does not say out loud: a whole SP3
   * round is **cheaper** than the SP1 *deferred* round it is built out of.
   *
   * There is no contradiction. The report phase is what makes an SP3 round dearer, and the deferred
   * shape (§10.29.6.3) already pays for that phase before SP3 arrives — SP3 then shortens the
   * ranging frame inside it. So "SP3 costs more at every anchor count" is a statement about the
   * **embedded** shape, which is the shape §2.1 names, and this test pins the other comparison so
   * that the lesson cannot quietly widen it into "more than any SP1 round".
   */
  it('is cheaper than the SP1 deferred round it is built on', () => {
    for (let a = 1; a <= ANCHOR_X.length; a++) {
      const sp3 = run(SP3, { anchors: a })
      const def = run(SP1_DEFERRED, { anchors: a })
      expect(markerCount(sp3)).toBe(a)
      expect(sumAir(sp3)).toBeLessThan(sumAir(def))
      // The whole of the difference is the ranging phase's, less what the RCM's SRRR IEs cost.
      const srrrCost = airByKind(sp3)['uwbPoll'] - airByKind(def)['uwbPoll']
      expect(srrrCost).toBeGreaterThan(0)
      expect(sumAir(def) - sumAir(sp3)).toBeCloseTo(rangingAir(def) - rangingAir(sp3) - srrrCost, 6)
    }
  })

  it('identifies the sender by its slot, with nothing in the frame to help', () => {
    const honest = run(SP3)
    // Every marker was attributed to the device its slot belongs to, and the SP3 frames that
    // carried those markers have no payload at all to have carried a name in.
    for (const r of of(honest, 'TX_START')) {
      if (r.frame.kind !== 'uwbSp3') continue
      expect(r.frame.bytes).toBe(0)
      expect(r.frame.uwb?.ies).toEqual([])
      expect(r.frame.uwb?.sp).toBe(3)
    }
    const markers = of(honest, 'UWB_SP3').filter((r) => r.node === 'tag-1')
    expect(markers.map((m) => m.peer)).toEqual(['anc-1', 'anc-2'])
    for (const r of rangesOf(honest)) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(RANGE_BUDGET_M)

    // The mutation: the initiator's slot table is reversed and nothing else moves. If anything in
    // the frame were carrying the sender's identity, the ranges below would still be right.
    const shuffled = run(SP3, { shuffleTagSlots: true })
    const mutated = of(shuffled, 'UWB_SP3').filter((r) => r.node === 'tag-1')
    expect(mutated.map((m) => m.peer)).toEqual(['anc-2', 'anc-1'])
    const ranges = rangesOf(shuffled)
    expect(ranges.length).toBe(2)
    // Wrong, not merely absent: a round that simply fell silent under the mutation would prove
    // nothing, because an identity read off the frame would have fallen silent too.
    for (const r of ranges) expect(Math.abs(r.distM - r.trueDistM)).toBeGreaterThan(1)
    // …and wrong in exactly the way a swapped slot table makes them wrong — **bit for bit** the
    // other anchor's measurement. Nothing about the air changed under the mutation: the same two
    // markers were stamped with the same two counters in the same two slots, and the same draws came
    // off the same generator in the same order. Only the name each measurement was filed under moved.
    const byPeer = new Map(ranges.map((r) => [r.peer, r.distM]))
    const honestByPeer = new Map(rangesOf(honest).map((r) => [r.peer, r.distM]))
    expect(byPeer.get('anc-1')).toBe(honestByPeer.get('anc-2'))
    expect(byPeer.get('anc-2')).toBe(honestByPeer.get('anc-1'))
  })

  it('reports only what SRRR asked for', () => {
    const off = run({ ...SP3, aoa: true })
    const on = run({ ...SP3, aoa: true, srrr: { raoa: true, rrtt: false } })
    const reportBytes = (rs: TLRecord[]): number[] =>
      of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSsDefer').map((r) => r.frame.bytes)
    expect(reportBytes(off)).toEqual([UWB_SS_DEFER_BYTES, UWB_SS_DEFER_BYTES])
    expect(reportBytes(on)).toEqual([uwbSp3ReportBytes(true), uwbSp3ReportBytes(true)])
    // The difference is exactly the bearing item and nothing else.
    for (let i = 0; i < 2; i++) {
      expect(reportBytes(on)[i] - reportBytes(off)[i]).toBe(UWB_SP3_RAOA_ITEM_BYTES)
    }
    // …and the request is not free at the other end of the round either: the RCM carries one SRRR
    // IE per responder (§10.32.9.9), the mirror image of §10.36's MMRCR bit, which rides a control
    // octet the RCM carries anyway.
    const pollBytes = (rs: TLRecord[]): number =>
      of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame.bytes
    expect(pollBytes(on)).toBe(uwbSp3PollBytes(2))
    expect(pollBytes(on) - pollBytes(run(SP1_DEFERRED))).toBe(srrrIeBytes(2))
    expect(pollBytes(run(SP1_DEFERRED))).toBe(uwbPollBytes(2))
    // The bearing actually arrives: a report frame that grew by four octets and delivered nothing
    // would be the same bug as a frame that claims an identity it cannot carry.
    const reported = of(on, 'UWB_SP3_REPORT').filter((r) => r.node === 'tag-1')
    expect(reported.length).toBe(2)
    for (const r of reported) expect(typeof r.thetaDeg).toBe('number')
    for (const r of of(off, 'UWB_SP3_REPORT')) expect(r.thetaDeg).toBeUndefined()
  })

  /**
   * The frame inspector decodes a frame's payload from its own `ies` list, and `uwbFrameFields`
   * **throws** on an IE name it has no case for — a decoder, unlike the tooltip chain, fails loudly
   * rather than silently, but only once someone opens the inspector on that frame. `tsc -b` cannot
   * see it either way: `ies` is a `string[]`.
   *
   * So both shapes this slice puts new IEs on are decoded here, straight off the frames a real round
   * radiated, and their rows are required to tile the PSDU exactly — the invariant
   * `tests/model/uwb-frameFields.test.ts` holds for every frame shape that existed before this one.
   */
  it('decodes the two frames it gave new information units to, and their rows tile the PSDU', () => {
    const rs = run({ ...SP3, aoa: true, srrr: { raoa: true, rrtt: true } }, { anchors: 3 })
    const shapes = of(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbSsDefer')
    expect(shapes.length).toBe(4)
    for (const r of shapes) {
      const d = uwbFrameFields(r.frame)
      expect(rows(r.frame).reduce((n, f) => n + f.bytes, 0), r.frame.kind).toBe(r.frame.bytes)
      expect(d.bytes, r.frame.kind).toBe(r.frame.bytes)
    }
    // One SRRR IE per responder, not one IE of 3A octets (§10.32.9.9) — the shape that makes the
    // request's cost grow with the responder count.
    const srrrRows = rows(shapes.find((r) => r.frame.kind === 'uwbPoll')!.frame)
      .filter((f) => f.key === 'ieSrrr')
    expect(srrrRows.length).toBe(3)
    expect(srrrRows.reduce((n, f) => n + f.bytes, 0)).toBe(srrrIeBytes(3))
    // …and one bearing row on each report, worth exactly the item the request bought.
    const raoaRows = rows(shapes.find((r) => r.frame.kind === 'uwbSsDefer')!.frame)
      .filter((f) => f.key === 'ieRaoa')
    expect(raoaRows.length).toBe(1)
    expect(raoaRows[0].bytes).toBe(UWB_SP3_RAOA_ITEM_BYTES)
  })

  it('is deterministic, and every other mode byte-identical', () => {
    expect(markerCount(run(SP3))).toBe(2)
    expect(run(SP3)).toEqual(run(SP3))
    // `sp3` off is the default, and the SRRR bits mean nothing without it: a session that sets
    // them with the feature off runs byte-for-byte the round it always ran.
    expect(run({ ...SP1_DEFERRED, srrr: { raoa: false, rrtt: true } })).toEqual(run(SP1_DEFERRED))
    expect(run({ method: 'ds', replyTime: 'embedded' })).toEqual(run({ method: 'ds', replyTime: 'embedded', sp3: false }))
  })

  /**
   * The SRRR IE has two request bits and this engine's round can answer only one of them.
   *
   * RRTT asks the **initiator** for the round-trip time (§10.32.8.2: the initiator conveys the AOA
   * and the round trip to the responder that requested them). In an SS-TWR round the round trip is
   * the initiator's own measurement and the responder never holds one — and `uwbSlotsPerTag`'s
   * `2A + 1` budgets no slot for a frame *from* the initiator in the report phase. So the request
   * goes on the air, in the RCM's SRRR IE, and **nothing answers it**.
   *
   * This test pins exactly that, rather than letting `rrtt` ship as a switch that looks wired: the
   * request is visible in the control message, and every frame of the report phase is byte-identical
   * with it off. A later slice that gives the initiator a report frame of its own has to make this
   * test fail — which is the point of writing it down.
   */
  it('carries the RRTT request but has no frame that can answer it', () => {
    const asked = run({ ...SP3, srrr: { raoa: false, rrtt: true } })
    const silent = run(SP3)
    expect(markerCount(silent)).toBe(2)
    // The request reached the responders: it is in the RCM, and it is readable there.
    const srrrRow = (rs: TLRecord[]) =>
      rows(of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame)
        .filter((f) => f.key === 'ieSrrr')
    expect(srrrRow(asked).length).toBe(2)
    expect(srrrRow(asked)).not.toEqual(srrrRow(silent))
    // And nothing came back for it: the report phase is byte-for-byte the phase it was without it.
    const reports = (rs: TLRecord[]) =>
      of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSsDefer').map((r) => r.frame)
    expect(reports(asked)).toEqual(reports(silent))
    expect(reportAir(asked)).toBe(reportAir(silent))
    // …nor into the records the initiator keeps of that phase.
    expect(of(asked, 'UWB_SP3_REPORT')).toEqual(of(silent, 'UWB_SP3_REPORT'))
  })

  /** DS-TWR with `sp3` on is a legal configuration, so it has to do something measurable: its
   * responders' ranging frames are markers too, and the round's air time falls by that much. */
  it('shortens a DS round\'s ranging phase too', () => {
    const sp3 = run({ method: 'ds', replyTime: 'deferred', sp3: true })
    const sp1 = run({ method: 'ds', replyTime: 'deferred' })
    expect(markerCount(sp3)).toBe(2)
    expect(markerCount(sp1)).toBe(0)
    expect(rangingAir(sp3)).toBeLessThan(rangingAir(sp1))
    expect(rangingAir(sp1) - rangingAir(sp3)).toBeCloseTo(2 * (uwbPpduNs(uwbRespBytes('ds')) - uwbSp3Ns()), 6)
  })

  /**
   * A marker that never arrives still names the responder whose slot it was.
   *
   * This is the one thing the open wait an SP3 round needs could have cost: a marker carries no
   * address, so the wait cannot filter on the sender — but the slot still belongs to exactly one
   * responder, and a silent slot is still that responder's timeout. A contention round's open slot
   * reports nothing on purpose (nobody owes it an answer); this one is not that.
   */
  it('still names the responder when its marker never arrives', () => {
    // anc-2 stands 400 m away: it hears no Poll, so it transmits nothing in its own marker slot.
    const rs = run(SP3, { anchors: 2, anchorX: [0, 400] })
    const timeouts = of(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'tag-1')
    const expected: UwbFrameKind = 'uwbSp3'
    expect(timeouts.map((r) => ({ peer: r.peer, slot: r.slot, expected: r.expected })))
      .toContainEqual({ peer: 'anc-2', slot: 2, expected })
    // …and the responder that is there still ranges, in its own slot.
    expect(rangesOf(rs).map((r) => r.peer)).toEqual(['anc-1'])
    expect(of(rs, 'UWB_SP3').filter((r) => r.node === 'tag-1').map((r) => r.slot)).toEqual([1])
  })
})
