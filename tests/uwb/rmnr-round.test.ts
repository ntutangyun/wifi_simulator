/**
 * Task 4 of docs/superpowers/specs/2026-10-01-rcm-validity-design.md: the device and network
 * layer, and the acceptance measurement for the whole RCM-validity / RMNR slice.
 *
 * Two published-standard features, one slice, because neither works without the other (design
 * §1): the ARC IE's **RCM Validity Rounds** field (IEEE Std 802.15.4-2024 §10.32.9.1) lets one
 * control message govern several ranging rounds, and §10.34's **ranging message non-receipt**
 * exchange is what a responder holding such a still-valid control message does when *this*
 * round's initiation message never arrived — it sends an RMNR frame in its own slot instead of
 * sitting silent there.
 *
 * Every test below runs whole blocks and reads the records they produced. That is not a style
 * choice: this branch has twice shipped a feature that looked finished and did nothing, and a
 * whole run is the only instrument that caught it.
 *
 * **The arithmetic is per ranging round set** (standard §10.32.3.2). Until 2026-11-10 this file said
 * "per block": each tag had one round a block and the window ran R blocks, which the standard does
 * not allow — an RCM's validity never exceeds the rounds remaining in its block (§10.32.9.1, audit
 * #23). Every scene here now runs `ROUNDS` rounds a tag in each block (`initiatorRounds`), so a set
 * of R = 4 is four rounds of one block. The saving is `(R − 1)(16 + 3A)` octets per tag per set —
 * 84 octets per four rounds at four anchors — which is why the runs here are one block (four rounds)
 * long. `rn` numbers a record's round across blocks, so "rounds 0–3" reads the way "blocks 0–3" did.
 */
import { describe, expect, it } from 'vitest'
import { hashStr } from '../../src/engine/hash'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { UWB_TX_POWER_DBM, uwbInitBytes, uwbPollBytes, uwbRmnrBytes } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

const MS = 1_000_000

/** Rounds each tag runs in a block: one ranging round set of R = 4 fits in one block. */
const ROUNDS = 4
/** The block length of every session below, read off the plan rather than retyped: 240 000 RSTU
 * is 200 ms, and one block holds the four rounds of a set. */
const BLOCK_NS = roundPlan(DEFAULT_UWB_SESSION, 4).blockNs
/** One block: rounds 0, 1, 2 and 3. One millisecond short of block 1, which must not open. */
const RUN_NS = BLOCK_NS - MS
/** A record's round, counted across blocks: block × ROUNDS + round (one tag per scene unless said). */
const rn = (r: { block: number; round: number }): number => r.block * ROUNDS + r.round

function uwbNode(
  id: string, x: number, y: number, role: 'anchor' | 'tag', txPowerDbm = UWB_TX_POWER_DBM,
): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 },
    txPowerDbm, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm: 0 },
  }
}

function scenario(nodes: NodeCfg[], session: Partial<UwbSessionCfg>): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 40, h: 30, name: 'hall' }],
    walls: [],
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    // `ROUNDS` rounds a tag in two-way ranging, the only mode with ranging round sets of more than
    // one round; every other mode runs one round a block and refuses anything else.
    uwb: {
      ...DEFAULT_UWB_SESSION, initiatorRounds: (session.mode ?? 'twr') === 'twr' ? ROUNDS : 1, ...session,
    },
  }
}

const run = (sc: Scenario): TLRecord[] => new Simulation(sc).runUntil(RUN_NS).records
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

// --- Scene A: four anchors, one tag, every link line of sight ---------------------
//
// The anchor count matters: `16 + 3A` is what the ARC, RR and RDM IEs cost, so A = 4 is the design's
// own worked example (30 + 3A = 42 octets of control message against a flat 14 of initiation).

const A = 4
const SCENE_A: NodeCfg[] = [
  uwbNode('anc-1', 0, 0, 'anchor'),
  uwbNode('anc-2', 8, 0, 'anchor'),
  uwbNode('anc-3', 0, 6, 'anchor'),
  uwbNode('anc-4', 8, 6, 'anchor'),
  uwbNode('tag-1', 4, 3, 'tag'),
]

/** Scene A at one validity setting. DS embedded, so both ends of every round produce a range and
 * the identity below has twice as much to disagree about. */
const sceneA = (rcmValidityRounds: number): TLRecord[] => run(scenario(SCENE_A, {
  method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds,
}))

/** The frame the tag opened each round with: the control message (Poll) or the initiation-only
 * message, whichever that round carried. `block` is the round's running number (`rn`). Read off `TX_START` — the octets the air actually
 * carried — never off the constants in phy.ts, which is a different claim. */
const openers = (rs: TLRecord[]): { block: number; kind: string; bytes: number; ies: string[] }[] =>
  of(rs, 'TX_START')
    .filter((r) => r.node === 'tag-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
    .map((r) => ({
      block: r.frame.uwb ? rn(r.frame.uwb) : -1,
      kind: r.frame.kind,
      bytes: r.frame.bytes,
      ies: [...(r.frame.uwb?.ies ?? [])],
    }))

describe('acceptance: one control message for a set of four rounds buys 3 × (16 + 3A) octets (design §2/§6)', () => {
  it('saves 84 octets over four rounds at four anchors, and measures the same distances', () => {
    const one = sceneA(1)
    const four = sceneA(4)
    const o1 = openers(one)
    const o4 = openers(four)
    // If either of these is empty the round never reached the point that produces an opener:
    // fix the round before looking anywhere else.
    expect(o1.map((o) => o.block), 'R = 1: one opener per round, four rounds').toEqual([0, 1, 2, 3])
    expect(o4.map((o) => o.block), 'R = 4: one opener per round, four rounds').toEqual([0, 1, 2, 3])

    // R = 1: every round carries the whole control message.
    expect(o1.map((o) => o.kind)).toEqual(['uwbPoll', 'uwbPoll', 'uwbPoll', 'uwbPoll'])
    expect(o1.map((o) => o.bytes)).toEqual([42, 42, 42, 42])
    // R = 4: the control message in round 0, the initiation message alone in rounds 1, 2 and 3.
    expect(o4.map((o) => o.kind)).toEqual(['uwbPoll', 'uwbInit', 'uwbInit', 'uwbInit'])
    expect(o4.map((o) => o.bytes)).toEqual([42, 14, 14, 14])

    const total = (os: { bytes: number }[]): number => os.reduce((s, o) => s + o.bytes, 0)
    // The measurement, and the two rulers it is taken with: `uwbPollBytes(A) - uwbInitBytes()` is
    // the 16 + 3A the ARC, RR and RDM IEs cost, and three is R − 1.
    expect(uwbPollBytes(A) - uwbInitBytes()).toBe(16 + 3 * A)
    expect(total(o1) - total(o4)).toBe(3 * (16 + 3 * A))
    expect(total(o1) - total(o4)).toBe(84)

    // …and the distances are the same ones, field for field. What was bought is control overhead,
    // not measurement (`src/uwb/ranging.ts` is untouched by this slice). `seq` is a position in
    // the record stream rather than a field of the measurement, and the shorter control message
    // does move the tag's own tx→idle instant, so it is dropped — `t` is not.
    const ranges = (rs: TLRecord[]): unknown[] =>
      of(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(one).length, 'DS embedded: a range at each end of each round').toBe(2 * A * 4)
    expect(ranges(four)).toEqual(ranges(one))
  })

  it('sends no RDM — and no ARC or RR — after the first round of each ranging round set', () => {
    const o4 = openers(sceneA(4))
    // The control message carries the ARC IE (which is where the validity field itself lives),
    // the RR IE (the block and round indices), the RDM IE (the responders' slot table) and the RRMC IE.
    expect(o4[0].ies).toEqual(['ARC', 'RR', 'RDM', 'RRMC'])
    for (const o of o4.slice(1)) {
      expect(o.ies, `block ${o.block}`).toEqual(['RRMC'])
      expect(o.ies, `block ${o.block}: no slot table is restated`).not.toContain('RDM')
      expect(o.ies, `block ${o.block}: no control content at all`).not.toContain('ARC')
    }
    // Every block of an R = 1 session still carries both, which is what "byte-identical by
    // default" means at the IE level.
    for (const o of openers(sceneA(1))) expect(o.ies, `R=1 round ${o.block}`).toEqual(['ARC', 'RR', 'RDM', 'RRMC'])
  })

  it('still reconstructs a fixed reply time from the initiation message it actually handled', () => {
    // `replyTime: 'fixed'` is the one shape whose arithmetic reads the opener's **airtime**
    // (design §6.1: the delay is counted from the end of its reception), and the initiation
    // message is 28 octets shorter than the control message. Both ends read it off the frame they
    // handled, so the range survives a block whose opener changed length — if either end assumed
    // a Poll, the reading would be out by that airtime: tens of metres, not centimetres.
    const rs = run(scenario(SCENE_A, {
      method: 'ss', replyTime: 'fixed', nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
      rcmValidityRounds: 4,
    }))
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges.length, 'four rounds × four anchors, at the tag').toBe(4 * A)
    for (const r of ranges) {
      expect(Math.abs(r.distM - r.trueDistM), `${r.peer} in round ${rn(r)}`).toBeLessThan(0.01)
    }
    // …and rounds 1–3 really did open with the shorter frame, so the assertion above was not
    // measured against four identical rounds.
    expect(openers(rs).map((o) => o.kind)).toEqual(['uwbPoll', 'uwbInit', 'uwbInit', 'uwbInit'])
  })
})

// --- Scene B: an anchor that walks out of the initiator's reach -------------------
//
// What §10.34 needs is a responder that **holds a valid control message but did not receive this
// round's initiation message**, and whose own frame still reaches the initiator. So the link has
// to be asymmetric, and the one lever this engine has for that is per-node transmit power: the
// tag transmits 10 dB below the anchors (a battery-powered tag, both powers at or under the
// −14 dBm the model's own default stands for). Link budget at channel 9 (pl0 ≈ 50.5 dB, free
// space squared, receiver floor −93 dBm):
//
//   tag −24 dBm → 5 m   = −88.5 dBm   heard
//   tag −24 dBm → 16 m  = −98.6 dBm   lost        ← the initiation message never arrives
//   anchor −14 dBm → 16 m = −88.6 dBm heard       ← but the RMNR frame does
//
// `anc-far` sits at 16 m from the start and therefore **never** receives a control message;
// `anc-walk` starts at 5 m, receives round 0's control message, and is moved to 16 m before
// round 1. Everything the two do differently afterwards is down to that one difference.

const TAG_DBM = -24
const SCENE_B: NodeCfg[] = [
  uwbNode('anc-1', 0, 0, 'anchor'),
  uwbNode('anc-2', 0, 4, 'anchor'),
  uwbNode('anc-walk', 3, 4, 'anchor'),
  uwbNode('anc-far', 0, 16, 'anchor'),
  uwbNode('tag-1', 0, 0.001, 'tag', TAG_DBM),
]

const sceneBcfg = (rmnr: boolean): Partial<UwbSessionCfg> => ({
  method: 'ss', replyTime: 'embedded', nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
  rcmValidityRounds: 4, rmnr,
})

/**
 * Scene B, four rounds, with `anc-walk` moved out of reach after round 0.
 *
 * This engine has no mobility of its own, and it does not need any: `UwbChannel` resolves every
 * position through `posOf → nodeOf(id).pos` at the instant it needs it, off the very node objects
 * the scenario handed it, and `Simulation.runUntil` is resumable. So moving the node between two
 * `runUntil` calls *is* the scene change. Round 1 follows round 0 back to back, so the move lands a
 * microsecond before round 0 ends — after its last transmission, before round 1's opener — at a
 * length read off the session's own round plan, since an SS, DS and contention round differ.
 */
function runSceneB(rmnr: boolean, session: Partial<UwbSessionCfg> = {}, untilNs = RUN_NS): TLRecord[] {
  const nodes = SCENE_B.map((n) => ({ ...n, pos: { ...n.pos } }))
  const sc = scenario(nodes, { ...sceneBcfg(rmnr), ...session })
  const sim = new Simulation(sc)
  const roundNs = roundPlan(sc.uwb!, 4).roundNs
  const before = sim.runUntil(roundNs - 1000).records
  const walker = nodes.find((n) => n.id === 'anc-walk')
  if (!walker) throw new Error('runSceneB: anc-walk is not in the scene')
  // In place, because the device holds the same Vec3 its scenario node does — which is what a
  // device that moved means.
  walker.pos.y = 16
  walker.pos.x = 0
  return [...before, ...sim.runUntil(untilNs).records]
}

const rxOf = (rs: TLRecord[], node: string, kind: string): number[] =>
  of(rs, 'UWB_TS').filter((r) => r.node === node && r.dir === 'rx' && r.frameKind === kind).map((r) => r.t)

describe('acceptance: RMNR turns one anchor\'s silence into something the initiator can name (design §3/§3.1)', () => {
  const off = runSceneB(false)
  const on = runSceneB(true)

  it('builds the scene it claims to: one responder loses the initiation message, one never held the control message', () => {
    for (const rs of [off, on]) {
      // `anc-walk` heard round 0's control message…
      expect(rxOf(rs, 'anc-walk', 'uwbPoll'), 'anc-walk: one control message, in round 0').toHaveLength(1)
      // …and nothing afterwards: the three initiation messages never reached it.
      expect(rxOf(rs, 'anc-walk', 'uwbInit'), 'anc-walk: no initiation message').toHaveLength(0)
      // `anc-far` heard neither, ever.
      expect(rxOf(rs, 'anc-far', 'uwbPoll'), 'anc-far: no control message').toHaveLength(0)
      expect(rxOf(rs, 'anc-far', 'uwbInit'), 'anc-far: no initiation message').toHaveLength(0)
      // …and the two near anchors heard all four openers, so the losses above are not the scene
      // being broken for everybody.
      for (const id of ['anc-1', 'anc-2']) {
        expect(rxOf(rs, id, 'uwbPoll').length + rxOf(rs, id, 'uwbInit').length, id).toBe(4)
      }
    }
  })

  it('leaves the initiator nothing but a timeout when rmnr is off', () => {
    expect(of(off, 'UWB_RMNR')).toHaveLength(0)
    const peers = of(off, 'UWB_TIMEOUT').filter((r) => r.node === 'tag-1').map((r) => r.peer)
    // Three silent slots from anc-walk (rounds 1–3) and four from anc-far, and the initiator
    // cannot tell any of the seven apart: "did not hear me", "answered and the answer was lost",
    // "gone" all look like this.
    expect(peers.filter((p) => p === 'anc-walk')).toHaveLength(3)
    expect(peers.filter((p) => p === 'anc-far')).toHaveLength(4)
  })

  it('names it when rmnr is on: the responder still holds the control message, and missed this round', () => {
    const named = of(on, 'UWB_RMNR')
    expect(named.map((r) => [r.node, r.peer, rn(r)])).toEqual([
      ['tag-1', 'anc-walk', 1],
      ['tag-1', 'anc-walk', 2],
      ['tag-1', 'anc-walk', 3],
    ])
    // The slot is the one the still-valid control message gave it — anchor index 2, so slot 3 —
    // and that, not any payload, is what says who is speaking (design §3).
    for (const r of named) expect(r.slot).toBe(3)
    // Those three slots are no longer silent, so they leave no timeout: what the initiator holds
    // for anc-walk is now a reason, not an absence.
    const peers = of(on, 'UWB_TIMEOUT').filter((r) => r.node === 'tag-1').map((r) => r.peer)
    expect(peers.filter((p) => p === 'anc-walk')).toHaveLength(0)
    // …and nothing was learned about anc-far, which is correct: it never spoke.
    expect(peers.filter((p) => p === 'anc-far')).toHaveLength(4)
  })

  it('puts an MHR + 2 + FCS frame carrying nothing but the RMNR IE on the air', () => {
    const sent = of(on, 'TX_START').filter((r) => r.frame.kind === 'uwbRmnr')
    expect(sent.map((r) => r.node)).toEqual(['anc-walk', 'anc-walk', 'anc-walk'])
    for (const r of sent) {
      expect(r.frame.bytes).toBe(uwbRmnrBytes())
      expect(r.frame.bytes).toBe(13)
      expect(r.frame.uwb?.ies).toEqual(['RMNR'])
    }
  })

  it('still ranges with every anchor that did hear the initiation message', () => {
    // Losing one responder loses nobody else: the two near anchors range in all four rounds, and
    // anc-walk ranges in the one round it was still in reach for.
    const byPeer = (rs: TLRecord[], peer: string): number[] =>
      of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === peer).map(rn)
    for (const rs of [off, on]) {
      expect(byPeer(rs, 'anc-1')).toEqual([0, 1, 2, 3])
      expect(byPeer(rs, 'anc-2')).toEqual([0, 1, 2, 3])
      expect(byPeer(rs, 'anc-walk')).toEqual([0])
      expect(byPeer(rs, 'anc-far')).toEqual([])
    }
    // …and switching rmnr on did not move a single reading: an RMNR frame replaces a silence, not
    // a measurement.
    const ranges = (rs: TLRecord[]): unknown[] => of(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(on)).toEqual(ranges(off))
  })

  it('does not send RMNR from a device that never held the control message', () => {
    // **The physical floor of this slice, not an edge case.** A responder that never received the
    // control message does not know which slot is its own — the slot table is the RDM IE's, and it
    // never decoded one — so an RMNR frame from it would be speaking in somebody else's slot. It
    // must stay silent, and `anc-far` is louder than the tag, so its silence is a decision rather
    // than a dead link: were it to transmit, the initiator would hear it.
    const sent = of(on, 'TX_START').filter((r) => r.node === 'anc-far')
    expect(sent, 'anc-far transmitted nothing at all').toHaveLength(0)
    expect(of(on, 'UWB_RMNR').filter((r) => r.peer === 'anc-far')).toHaveLength(0)
  })
})

describe('the control message this responder holds expires, which is what makes the state bounded', () => {
  it('stops answering once the ranging round set its control message opened is over', () => {
    // Ruling 1: "holds a valid control message" is the one piece of device state in this engine that
    // outlives a round, and **its expiry is what makes it an exception rather than a leak**. Round
    // 0's control message governs rounds 0–3 of block 0 and no round of block 1 (§10.32.9.1); block
    // 1 opens a new set with a control message `anc-walk` is far too distant to decode, so from
    // there on it holds nothing valid and must go back to the silence of a device that never held
    // one at all. Two blocks, eight rounds, so the set turns over once inside the run.
    const rs = runSceneB(true, {}, 2 * BLOCK_NS - MS)
    const named = of(rs, 'UWB_RMNR')
    expect(named.map(rn)).toEqual([1, 2, 3])
    // …and the run really did reach round 7, so the three above are not simply all the rounds there
    // were: the near anchors answered in every one of the eight.
    const heard = of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === 'anc-1')
    expect(heard.map(rn)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    // Rounds 4–7 are silent again for anc-walk, and the initiator is back to not knowing why —
    // which is the honest answer: nothing it holds about that responder is current any more.
    const peers = of(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'tag-1').map((r) => r.peer)
    expect(peers.filter((p) => p === 'anc-walk')).toHaveLength(4)
  })
})

describe('the same exchange in the shapes scene B does not use', () => {
  const sceneB = (session: Partial<UwbSessionCfg>): TLRecord[] => runSceneB(true, session)

  it('sends it in a DS round too, without disturbing the Final or the Reports', () => {
    // DS-TWR is this engine's *default* method, so a slice that only worked in SS would be a slice
    // that did nothing in the shape most sessions run. A DS round also has two more anchor-side
    // slots after the Response, and the responder owes an RMNR in exactly one of them: the Final
    // does not list it (it never answered), so it reports nothing either.
    const rs = sceneB({ method: 'ds' })
    const named = of(rs, 'UWB_RMNR')
    expect(named.map((r) => [r.peer, rn(r), r.slot])).toEqual([
      ['anc-walk', 1, 3], ['anc-walk', 2, 3], ['anc-walk', 3, 3],
    ])
    // One frame per round and no more: not a second one in the Report slot.
    expect(of(rs, 'TX_START').filter((r) => r.node === 'anc-walk' && r.frame.kind === 'uwbRmnr')).toHaveLength(3)
    expect(of(rs, 'TX_START').filter((r) => r.node === 'anc-walk' && r.frame.kind === 'uwbReport')).toHaveLength(1)
    // …and the anchors that did hear the initiation message still range at both ends of every
    // round, which is what says the Final and the Report phase came through untouched.
    for (const id of ['anc-1', 'anc-2']) {
      expect(of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === id).map(rn)).toEqual([0, 1, 2, 3])
      expect(of(rs, 'UWB_RANGE').filter((r) => r.node === id).map(rn)).toEqual([0, 1, 2, 3])
    }
  })

  it('still runs a contention round under a validity window, without rmnr', () => {
    // This test used to assert a second thing as well — that a contention round with `rmnr` on
    // emits no RMNR frame — and it was right about the physics: in a contention round the response
    // slot is the responder's **own draw**, made on the initiation message it did not receive
    // (standard §10.32.2 schedule mode 0), so a still-valid control message tells it how wide the
    // window is and not which slot inside it is its own.
    //
    // That half is gone because the controller turned the finding into a **schema refusal**: a
    // permitted configuration that provably does nothing is how a feature comes to look finished.
    // The reasoning now lives in the refusal's own message, and
    // `tests/model/rcm-validity-scenario.test.ts` pins it.
    //
    // What survives here is the half that is still reachable, and it is the more interesting one:
    // **one control message governing several contention rounds.** The anchors draw their slot off
    // each round's opener, whichever of the two messages that opener was.
    // maxAttempts 4 = the set's length, the most §10.32.9.6 allows: with the default cap of 1
    // an anchor would answer only the set's first round and stay silent for the rest.
    const rs = sceneB({ schedule: 'contention', contentionSlots: 8, rmnr: false, maxAttempts: 4 })
    const rounds = of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === 'anc-1').map(rn)
    expect(rounds).toEqual([0, 1, 2, 3])
    expect(openers(rs).map((o) => o.kind)).toEqual(['uwbPoll', 'uwbInit', 'uwbInit', 'uwbInit'])
  })
})

describe('determinism, and every other mode byte-identical', () => {
  /**
   * Captured from HEAD before any of Task 4 was written. Each of these modes has no control
   * message for a validity window to extend (the schema refuses a non-default `rcmValidityRounds`
   * for every one of them), so every record of theirs must be exactly what it was. It is expected
   * to pass before the implementation as well as after — it is the guard, not the goal. The
   * shipped scenes are pinned by `tests/fixtures/`; this pins the modes this file can reach.
   */
  // twr-ss, twr-ds and dl-tdoa re-captured 2026-11-10: the RCM is three octets longer (ARC IE to the
  // standard's content plus the RR IE, audit #9), and the two-way sessions here now run `ROUNDS`
  // rounds in their one block (audit #23). The run is one block rather than four now, which is why
  // ul-tdoa and m2m — untouched by either change — were re-captured with them.
  // All five re-captured again 2026-11-10 (W2): every PPDU is 896 chips longer (PHR 21 symbols, standard Table 16-2), which moves every instant in every mode; the RRTI and RMI content headers (§10.29.8.1/§10.29.8.4) lengthen the SS Response and the DS Final and reports.
  // 2026-11-11 (W2b): twr-ss and twr-ds re-captured — the time-scheduled Poll's RDM IE now carries each responder's Ranging Slot Index (§10.32.9.8), rounds are stretched to a whole divisor of the block (§10.32.2), and the DS Response carries Treply1 while the report carries Tround2 alone (§10.32.5, Figure 10-238).
  const BEFORE: Record<string, string> = {
    'twr-ss': 'e5e3b991',
    'twr-ds': 'ea68b51b',
    'dl-tdoa': '5faa07e9',
    'ul-tdoa': 'fa986dce',
    // 2026-11-11 (W3): m2m re-captured — the round is the standard's (§10.32.6): the controller's RCM,
    // the initiators' initiation messages and the responders' RRTI responses, no TXT/RXT IEs.
    m2m: '46fc3cb1',
  }

  const streamOf = (session: Partial<UwbSessionCfg>): string => {
    const rs = run(scenario(SCENE_A, session))
      .filter((r) => r.type.startsWith('UWB_') || r.type === 'MAC_STATE' || r.type === 'TX_START')
    return hashStr(JSON.stringify(rs)).toString(16)
  }

  const CASES: [string, Partial<UwbSessionCfg>][] = [
    ['twr-ss', { method: 'ss' }],
    ['twr-ds', { method: 'ds' }],
    ['dl-tdoa', { mode: 'dl-tdoa', method: 'ds' }],
    ['ul-tdoa', { mode: 'ul-tdoa', method: 'ss' }],
    ['m2m', { mode: 'm2m', method: 'ss' }],
  ]

  it('leaves every mode with no control message of its own exactly as it was', () => {
    // All five at once, so a diff names every mode that moved rather than only the first.
    const now: Record<string, string> = {}
    for (const [name, session] of CASES) now[name] = streamOf(session)
    expect(now).toEqual(BEFORE)
  })

  it('is deterministic: the same validity window twice is the same stream twice', () => {
    const once = JSON.stringify(sceneA(4).filter((r) => r.type.startsWith('UWB_')))
    const twice = JSON.stringify(sceneA(4).filter((r) => r.type.startsWith('UWB_')))
    expect(twice).toBe(once)
    // …and a four-round ranging round set is not the same stream as a one-round one, so the
    // comparison above is not trivially true of everything.
    expect(JSON.stringify(sceneA(1).filter((r) => r.type.startsWith('UWB_')))).not.toBe(once)
  })
})

describe('two tags, each with its own ranging round sets', () => {
  /**
   * Every tag runs its own `ROUNDS` rounds of the block back to back (tag 1 rounds 0–3, tag 2 rounds
   * 4–7), and each opens its own set with its own control message — `roundCarriesRcm` reads the
   * round's place in its tag's run, nothing that belongs to the other tag. If the validity state
   * were per-device rather than per-initiator, or if one tag's opener leaked into the other's
   * rounds, this is the scene that shows it.
   */
  const TWO_TAGS: NodeCfg[] = [
    uwbNode('anc-1', 0, 0, 'anchor'),
    uwbNode('anc-2', 8, 0, 'anchor'),
    uwbNode('tag-1', 4, 3, 'tag'),
    uwbNode('tag-2', 4, 5, 'tag'),
  ]
  const twoTags = (rcmValidityRounds: number): TLRecord[] => run(scenario(TWO_TAGS, {
    method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds,
  }))

  /** Each tag's opener per block, as the air carried it. */
  const perTag = (rs: TLRecord[], node: string): { block: number; kind: string }[] =>
    (rs as { type: string; node?: string; frame?: { kind: string; uwb?: { block: number } } }[])
      .filter((r) => r.type === 'TX_START' && r.node === node
        && (r.frame?.kind === 'uwbPoll' || r.frame?.kind === 'uwbInit'))
      .map((r) => ({ block: r.frame!.uwb!.block, kind: r.frame!.kind }))

  it('switches both tags at the same place in their own sets', () => {
    const rs = twoTags(4)
    const one = perTag(rs, 'tag-1')
    const two = perTag(rs, 'tag-2')
    expect(one.length).toBeGreaterThan(1)
    expect(two.map((x) => x.kind)).toEqual(one.map((x) => x.kind))
    // …and that pattern is the control message first, the initiation-only message after.
    expect(one[0].kind).toBe('uwbPoll')
    expect(one.slice(1).every((x) => x.kind === 'uwbInit')).toBe(true)
  })

  it('never answers a tag whose control message it has not decoded', () => {
    /**
     * The defect this test was written for, found by Task 6 while probing and measured before it
     * was fixed: `rcmBlock` was **one block index for the device**, with no record of whose control
     * message it held. So an anchor that decoded tag 1's control message answered **tag 2's** round
     * with an RMNR frame — a frame whose entire meaning is "I did receive your control message" —
     * having never decoded a single frame from tag 2.
     *
     * Fifteen such frames over five blocks, from three anchors, before the fix. The slot table is
     * the RDM IE's and the RDM IE belongs to one tag's Poll, so the validity it buys belongs to
     * that tag as well: the state is keyed by initiator.
     *
     * The scene puts the second tag 14 dB down so no anchor ever decodes it, which makes every
     * RMNR frame addressed to it a provable falsehood rather than a judgement call.
     */
    const QUIET = UWB_TX_POWER_DBM - 14
    const rs = run(scenario([
      uwbNode('anc-1', 0, 0, 'anchor'),
      uwbNode('anc-2', 10, 0, 'anchor'),
      uwbNode('anc-3', 0, 8, 'anchor'),
      uwbNode('tag-1', 5, 4, 'tag'),
      uwbNode('tag-2', 5, 6, 'tag', QUIET),
    ], { method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds: 4, rmnr: true }))

    // Nobody decodes the quiet tag — the premise, asserted rather than assumed.
    const decodedFrom = (src: string): Set<string> => new Set(
      (rs as { type: string; node?: string; frame?: { src: string } }[])
        .filter((r) => r.type === 'RX_OK' && r.frame?.src === src)
        .map((r) => r.node!),
    )
    expect(decodedFrom('tag-2').size).toBe(0)
    expect(decodedFrom('tag-1').size).toBeGreaterThan(0)

    // So no RMNR frame may claim otherwise. `node` is the initiator that received it, `peer` the
    // responder that sent it.
    const heardByTag2 = decodedFrom('tag-2')
    const lying = of(rs, 'UWB_RMNR').filter((r) => r.node === 'tag-2' && !heardByTag2.has(r.peer))
    expect(lying).toEqual([])

    // …and the tag that *is* heard still ranges, so the fix did not buy silence by breaking it.
    expect(of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1').length).toBeGreaterThan(0)
  })

  it('measures the same distances with two tags as with one control message each round', () => {
    const key = (rs: TLRecord[]): string[] =>
      of(rs, 'UWB_RANGE').map((r) => `${r.node}|${r.peer}|${r.block}|${r.distM.toFixed(9)}|${r.fom}`)
    const a = key(twoTags(1))
    const b = key(twoTags(4))
    expect(a.length).toBeGreaterThan(0)
    expect(b).toEqual(a)
  })
})
