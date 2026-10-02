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
  srrrIeBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSp3InitReportBytes, uwbSp3Ns,
  uwbSp3PollBytes, uwbSp3ReportBytes,
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

/**
 * The **responders'** ranging frames alone: A markers in an SP3 round, A Responses in an SP1 one.
 *
 * Deliberately not the whole ranging phase. Both shapes have A + 1 ranging transmissions, but the
 * initiator's is a frame of its own in SP3 (a bare marker, §10.32.8.2) and the **Poll itself** in
 * SP1, where one frame is the control message and the ranging initiation at once. So "the ranging
 * phase" is not a like-for-like sum until you decide how much of SP1's Poll to call ranging, and
 * this quantity needs no such decision: it is the per-frame saving, A times over.
 */
const responderRangingAir = (rs: TLRecord[]): number => {
  const a = airByKind(rs)
  return (a['uwbSp3'] ?? 0) - initiatorMarkerAir(rs) + (a['uwbResp'] ?? 0)
}
/** The initiator's own SP3 marker (§10.32.8.2's ranging initiation, Figure 10-242) — one frame,
 * and a cost SP1 does not have, because SP1's initiation rides its Poll. */
const initiatorMarkerAir = (rs: TLRecord[]): number =>
  of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp3' && r.frame.src === 'tag-1')
    .reduce((n, r) => n + r.frame.txTimeNs, 0)
/** The whole ranging phase: every marker of an SP3 round, the Responses of an SP1 one. */
const rangingAir = (rs: TLRecord[]): number => {
  const a = airByKind(rs)
  return (a['uwbSp3'] ?? 0) + (a['uwbResp'] ?? 0)
}
/** The data report phase: standard §10.32.8.1's third phase — one frame per reporting responder,
 * plus the initiator's own when the SRRR IE's RRTT bit asked it for one. */
const reportAir = (rs: TLRecord[]): number =>
  (airByKind(rs)['uwbSsDefer'] ?? 0) + (airByKind(rs)['uwbReport'] ?? 0)

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
    // A + 1 markers (Figure 10-242): the initiator's own ranging initiation and one per responder.
    expect(markerCount(sp3run)).toBe(3)
    const sp3 = rangesOf(sp3run)
    expect(sp3.length).toBe(2)
    // Within the noise, not bit for bit — and the reason is the initiator's own marker. It is a
    // **second** reception from the initiator at every responder (the RCM is the first), so each
    // responder's reply time is stamped from a different draw of its own generator than the SP1
    // round's was. The measurement is the same measurement; its noise realisation is not.
    for (const r of sp3) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(RANGE_BUDGET_M)
    for (const r of rangesOf(run(SP1_DEFERRED))) {
      expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(RANGE_BUDGET_M)
    }
    const emb = rangesOf(run(SP1_EMBEDDED))
    expect(emb.length).toBe(2)
    for (const r of emb) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThan(RANGE_BUDGET_M)
    // …and the round that measured them is §10.32.8.1's three phases, in the shape Figure 10-242
    // draws: the RCM, A + 1 markers, A report frames. Counted, so that a missing phase cannot hide
    // behind a correct distance.
    const kinds = airByKind(sp3run)
    expect(Object.keys(kinds).sort()).toEqual(['uwbPoll', 'uwbSp3', 'uwbSsDefer'])
  })

  it('spends less air on the ranging phase and more on the report phase', () => {
    const sp3 = run(SP3)
    const emb = run(SP1_EMBEDDED)
    // The responders' ranging frames, which is the comparison that needs no decision about how much
    // of SP1's Poll to call ranging (see `responderRangingAir`): A markers against A Responses.
    const perFrame = uwbPpduNs(uwbRespBytes('ss', 'embedded')) - uwbSp3Ns()
    expect(responderRangingAir(emb) - responderRangingAir(sp3)).toBeCloseTo(2 * perFrame, 6)
    // The initiator's own marker is a cost SP1 does not have at all, and it is counted here rather
    // than left out of the ledger: SP1's ranging initiation rides its Poll.
    expect(initiatorMarkerAir(sp3)).toBeCloseTo(uwbSp3Ns(), 6)
    expect(initiatorMarkerAir(emb)).toBe(0)
    // The whole ranging phase is still the cheaper one even with that frame in it, because SP1's
    // own initiation — its Poll — is dearer than a marker too.
    expect(rangingAir(sp3)).toBeLessThan(rangingAir(emb) + airByKind(emb)['uwbPoll'])
    expect(reportAir(emb)).toBe(0)
    expect(reportAir(sp3)).toBeGreaterThan(0)
    // And the report phase more than eats the whole saving, the initiator's extra marker included:
    // that is §2.2's conclusion against the embedded shape, measured.
    expect(reportAir(sp3)).toBeGreaterThan(
      responderRangingAir(emb) - responderRangingAir(sp3) - initiatorMarkerAir(sp3),
    )
  })

  it('costs more air time than an SP1 round at every anchor count', () => {
    let lastGap = 0
    for (let a = 1; a <= ANCHOR_X.length; a++) {
      const sp3 = run(SP3, { anchors: a })
      expect(markerCount(sp3)).toBe(a + 1)
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
    const saved = responderRangingAir(emb) - responderRangingAir(sp3)
    const againstEmbedded = uwbPpduNs(UWB_SS_DEFER_BYTES) / (uwbPpduNs(uwbRespBytes('ss', 'embedded')) - uwbSp3Ns())
    const againstShortest = uwbPpduNs(UWB_SS_DEFER_BYTES) / (uwbPpduNs(uwbRespBytes('ds')) - uwbSp3Ns())
    expect(reportAir(sp3) / saved).toBeCloseTo(againstEmbedded, 6)
    expect(againstShortest).toBeGreaterThan(againstEmbedded)
  })

  /**
   * …and the other half of the accounting (§2.2): against the SP1 **deferred** round — the road SP3
   * is built on — SP3 is the shorter one, but **not at every anchor count**, and this is the test
   * that says where the line is.
   *
   * §2.2 was written off a measurement taken before the initiator's own marker existed, and said
   * "每个 A 都更短". With the marker built (§4.1) SP3 pays one frame SP1 deferred does not, so the
   * saving has to buy that frame back before anything is left over: the crossover is computed here
   * from the primitives rather than written down, and the sweep pins both sides of it.
   *
   * The crossover against the deferred shape exists; the one §2.1 looked for — against the
   * **embedded** shape — still does not, and the test above holds it at every A.
   */
  it('is cheaper than the SP1 deferred round it is built on only above a crossover', () => {
    // What one responder's marker saves against one deferred SP1 Response, less what that
    // responder's SRRR IE adds to the RCM; and what the initiator's own marker costs on top.
    const perResponder = uwbPpduNs(uwbRespBytes('ss', 'deferred')) - uwbSp3Ns()
      - (uwbPpduNs(uwbSp3PollBytes(1)) - uwbPpduNs(uwbPollBytes(1)))
    const crossover = Math.ceil(uwbSp3Ns() / perResponder)
    expect(crossover).toBeGreaterThan(1)
    for (let a = 1; a <= ANCHOR_X.length; a++) {
      const sp3 = run(SP3, { anchors: a })
      const def = run(SP1_DEFERRED, { anchors: a })
      expect(markerCount(sp3)).toBe(a + 1)
      if (a >= crossover) expect(sumAir(sp3)).toBeLessThan(sumAir(def))
      else expect(sumAir(sp3)).toBeGreaterThan(sumAir(def))
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
    // The responders read the initiator's own marker off its slot the same way, and for the same
    // reason — it carries no address either (§10.32.8.2, Figure 10-242's ranging initiation).
    // Sorted by node: the order these land in is the medium's delivery order for one broadcast,
    // which is not a fact this test is about.
    const atAnchors = of(honest, 'UWB_SP3').filter((r) => r.node !== 'tag-1')
      .map((m) => ({ node: m.node, peer: m.peer, slot: m.slot }))
      .sort((a, b) => a.node.localeCompare(b.node))
    expect(atAnchors)
      .toEqual([{ node: 'anc-1', peer: 'tag-1', slot: 1 }, { node: 'anc-2', peer: 'tag-1', slot: 1 }])
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
    expect(markerCount(run(SP3))).toBe(3)
    expect(run(SP3)).toEqual(run(SP3))
    // `sp3` off is the default, and the SRRR bits mean nothing without it: a session that sets
    // them with the feature off runs byte-for-byte the round it always ran.
    expect(run({ ...SP1_DEFERRED, srrr: { raoa: false, rrtt: true } })).toEqual(run(SP1_DEFERRED))
    expect(run({ method: 'ds', replyTime: 'embedded' })).toEqual(run({ method: 'ds', replyTime: 'embedded', sp3: false }))
  })

  /**
   * The RRTT request bit, answered (§4.1).
   *
   * RRTT asks the **initiator** for the round-trip time, and §10.32.8.2's Figure 10-242 has the
   * initiator send it in a measurement report of its own. Before that frame existed the bit went on
   * the air in the RCM's SRRR IE and the whole report phase was byte-identical with it set — a
   * permitted configuration that provably did nothing, the second instance of that defect on this
   * branch after `contention` + `rmnr`.
   *
   * So the measurement is the inverse of what it was: with the bit set the report phase gains
   * **exactly one frame**, carrying one round-trip entry per responder, and every responder reads
   * its own out of it. The round also gains the slot that frame needs — and only then.
   */
  it('answers the RRTT request with the initiator own report frame', () => {
    const asked = run({ ...SP3, srrr: { raoa: false, rrtt: true } })
    const silent = run(SP3)
    // The request still reaches the responders in the RCM, and is still readable there.
    const srrrRow = (rs: TLRecord[]) =>
      rows(of(rs, 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame)
        .filter((f) => f.key === 'ieSrrr')
    expect(srrrRow(asked).length).toBe(2)
    expect(srrrRow(asked)).not.toEqual(srrrRow(silent))
    // One more frame in the report phase, from the initiator, and nothing else moved: the
    // responders' own reports are byte-for-byte the frames they were.
    const byKind = (rs: TLRecord[], k: string) =>
      of(rs, 'TX_START').filter((r) => r.frame.kind === k).map((r) => r.frame)
    expect(byKind(silent, 'uwbReport')).toEqual([])
    expect(byKind(asked, 'uwbReport').length).toBe(1)
    expect(byKind(asked, 'uwbReport')[0].src).toBe('tag-1')
    // The responders' own reports are the same frames carrying the same bytes — what moves is only
    // *when*: the initiator's frame takes the first slot of the report phase, so each of theirs sits
    // one slot later and says so in its own `uwb.slot`. Compared on what the request was supposed to
    // change (nothing of theirs) rather than on the slot index, which it was supposed to change.
    expect(byKind(asked, 'uwbSsDefer').map((f) => ({ bytes: f.bytes, src: f.src, ies: f.uwb?.ies })))
      .toEqual(byKind(silent, 'uwbSsDefer').map((f) => ({ bytes: f.bytes, src: f.src, ies: f.uwb?.ies })))
    expect(byKind(asked, 'uwbSsDefer').map((f) => f.uwb?.slot))
      .toEqual(byKind(silent, 'uwbSsDefer').map((f) => (f.uwb?.slot ?? 0) + 1))
    // Its length is one RMI entry per responder — address plus round-trip time — so the answer,
    // like the request, grows with the responder count.
    expect(byKind(asked, 'uwbReport')[0].bytes).toBe(uwbSp3InitReportBytes(2))
    expect(reportAir(asked) - reportAir(silent)).toBeCloseTo(uwbPpduNs(uwbSp3InitReportBytes(2)), 6)
    // And it arrives: each responder reads its own round trip out of the frame. Without this the
    // extra frame would be a cost with no effect, which is the defect the other way round.
    const got = of(asked, 'UWB_SP3_REPORT').filter((r) => r.node !== 'tag-1')
    // Sorted: one broadcast frame reaches both, and the order it reaches them in is the medium's.
    expect(got.map((r) => r.node).sort()).toEqual(['anc-1', 'anc-2'])
    for (const r of got) {
      expect(r.peer).toBe('tag-1')
      expect(typeof r.roundTripRctu).toBe('number')
    }
    expect(of(silent, 'UWB_SP3_REPORT').filter((r) => r.node !== 'tag-1')).toEqual([])
    // The round is one slot longer, and only because the frame is in it.
    const slotsOf = (rs: TLRecord[]) => of(rs, 'UWB_ROUND')[0].slots
    expect(slotsOf(asked)).toBe(slotsOf(silent) + 1)
  })

  /** DS-TWR with `sp3` on is a legal configuration, so it has to do something measurable: its
   * responders' ranging frames are markers too, and the round's air time falls by that much. */
  it('shortens a DS round\'s ranging phase too', () => {
    const sp3 = run({ method: 'ds', replyTime: 'deferred', sp3: true })
    const sp1 = run({ method: 'ds', replyTime: 'deferred' })
    expect(markerCount(sp3)).toBe(3)
    expect(markerCount(sp1)).toBe(0)
    expect(responderRangingAir(sp3)).toBeLessThan(responderRangingAir(sp1))
    expect(responderRangingAir(sp1) - responderRangingAir(sp3))
      .toBeCloseTo(2 * (uwbPpduNs(uwbRespBytes('ds')) - uwbSp3Ns()), 6)
    // …and the initiator's own marker is there too: a DS round gets Figure 10-242's ranging
    // initiation for the same reason an SS one does, and `uwbSlotsPerTag` budgets its slot.
    expect(initiatorMarkerAir(sp3)).toBeCloseTo(uwbSp3Ns(), 6)
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
    // Slot 1 is the initiator's own marker, so the responders' markers start at slot 2.
    expect(timeouts.map((r) => ({ peer: r.peer, slot: r.slot, expected: r.expected })))
      .toContainEqual({ peer: 'anc-2', slot: 3, expected })
    // …and the responder that is there still ranges, in its own slot.
    expect(rangesOf(rs).map((r) => r.peer)).toEqual(['anc-1'])
    expect(of(rs, 'UWB_SP3').filter((r) => r.node === 'tag-1').map((r) => r.slot)).toEqual([2])
  })
})
