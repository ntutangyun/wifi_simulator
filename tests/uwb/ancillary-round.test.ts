/**
 * Task 3 of docs/superpowers/specs/2026-10-02-ancillary-design.md: the device and network layer of
 * the ranging ancillary information exchange (published standard §10.35, Request = 0 half), and
 * the acceptance measurement for the whole slice.
 *
 * **What this slice exists for is one sentence**: a lost frame is *noticed when the next frame
 * arrives*, not inferred from a timeout. Frames Remaining (§10.35.2.1) counts down in **every**
 * fragment, so a receiver that reads 3 and then 1 knows the fragment that would have said 2 never
 * came — immediately, at that reception, without waiting for anything. Every test below runs whole
 * blocks and reads the records they produced; the two in `acceptance:` measure the *instant* of the
 * discovery, not only that a number went missing.
 *
 * **The roles are inverted in this clause, and a reader will think it is a bug.** §10.35.1 defines
 * the ancillary *initiator* as the device that **sends** the ancillary information and the ancillary
 * *responder* as the one that **receives** it — the opposite way round from their ranging roles. The
 * slot table is still built from the ranging roles (`slotAction`), so in every scene below a device
 * that *answers* in ranging (an anchor) is the one that *sends* here, and the tag — the ranging
 * initiator — is the receiver.
 *
 * **The window is the one the slice before built.** §10.35.1 bounds the exchange to the current
 * round plus the rounds the RCM still governs, which is the ARC IE's own Ranging Validity Rounds
 * field (§10.32.9.1) — `rcmValidityRounds` and `session.ts#blockCarriesRcm`. This is its third
 * reuse, after §10.34's RMNR and §10.36's receipt bitmap, and no second boundary is invented.
 */
import { describe, expect, it } from 'vitest'
import { hashStr } from '../../src/engine/hash'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { UWB_TX_POWER_DBM, uwbAncillaryBytes, uwbAncillarySlots, raictIeBytes } from '../../src/uwb/phy'
import { ANCILLARY_MESSAGE_KIND } from '../../src/uwb/device.ancillary'
import { ancillarySlots, blockCarriesAncillary, blockSlots, roundPlan } from '../../src/uwb/session'

const MS = 1_000_000

/** Four anchors and one tag: the anchor count matters only in that it fixes the round's own slot
 * count, which is what bounds `ancillaryFrames` (the scenario schema's own cap). */
const A = 4
/** The message every scene below segments. Four fragments, so Frames Remaining runs 3, 2, 1, 0 —
 * the brief's own example, and the shortest countdown in which a *middle* fragment can be lost. */
const FRAMES = 4

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

const SCENE: NodeCfg[] = [
  uwbNode('anc-1', 0, 0, 'anchor'),
  uwbNode('anc-2', 8, 0, 'anchor'),
  uwbNode('anc-3', 0, 6, 'anchor'),
  uwbNode('anc-4', 8, 6, 'anchor'),
  uwbNode('tag-1', 4, 3, 'tag'),
]

function scenario(nodes: NodeCfg[], session: Partial<UwbSessionCfg>): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 40, h: 30, name: 'hall' }],
    walls: [],
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: cfg(session),
  }
}

/** The shape every scene here ranges in: SS-TWR with the reply time on the Response, no NLOS and
 * no timestamp noise, so a lost fragment is the only thing that can go missing. */
const BASE: Partial<UwbSessionCfg> = {
  method: 'ss', replyTime: 'embedded', nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
}

const cfg = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({
  ...DEFAULT_UWB_SESSION, ...BASE, ...over,
})

/** The plan the assertions below read their slot numbers and instants off, rather than retyping
 * any of them: this is the same `roundPlan` call `UwbNetwork` makes. */
const planOf = (over: Partial<UwbSessionCfg> = {}): ReturnType<typeof roundPlan> =>
  roundPlan(cfg(over), A)

const BLOCK_NS = planOf().blockNs
/** Two blocks, one millisecond short of the third. */
const RUN_NS = 2 * BLOCK_NS - MS

const run = (sc: Scenario, untilNs = RUN_NS): TLRecord[] => new Simulation(sc).runUntil(untilNs).records
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

/** Every ancillary record of a run, as the receiver wrote it. */
const anc = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_ANCILLARY' }>[] => of(rs, 'UWB_ANCILLARY')

/** Every ancillary fragment that actually went on the air, in order, as `TX_START` saw it. */
const sent = (rs: TLRecord[]): { node: string; slot: number; bytes: number; remaining?: number }[] =>
  of(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'uwbAncillary')
    .map((r) => ({
      node: r.node,
      slot: r.frame.uwb?.slot ?? -1,
      bytes: r.frame.bytes,
      remaining: r.frame.uwb?.raict?.framesRemaining,
    }))

// --- 1. Segmentation ------------------------------------------------------------

describe('acceptance: one message spread across N slots, counting down to zero (design §4.2)', () => {
  const session = { ancillary: true, ancillaryFrames: FRAMES }

  it('spreads one message across N slots, counting down to zero', () => {
    const p = planOf(session)
    const rs = run(scenario(SCENE, session))
    // The slots the fragments ride in are the ones the round appends after its ranging phase, in
    // order — read off the plan, never retyped.
    expect(ancillarySlots(p), 'a time-scheduled round appends exactly one slot per fragment')
      .toBe(FRAMES)
    const first = p.slots
    const windows = [first, first + 1, first + 2, first + 3]

    const tx = sent(rs)
    // Two blocks, one message each (rcmValidityRounds is 1 by default, so every block opens its
    // own window).
    expect(tx.map((f) => f.slot)).toEqual([...windows, ...windows])
    // §10.35.1's ancillary *initiator* is a ranging **responder**: an anchor sends, the tag
    // receives. This is the inversion the clause defines and the thing a reader mistakes for a bug.
    expect(new Set(tx.map((f) => f.node))).toEqual(new Set(['anc-1']))
    // Frames Remaining counts N−1 → 0, in every fragment, which is the whole mechanism.
    expect(tx.map((f) => f.remaining)).toEqual([3, 2, 1, 0, 3, 2, 1, 0])
    // …and each fragment is priced from `uwbAncillaryBytes`, with both presence bits set (the
    // message number and the count), never a literal.
    const bytes = uwbAncillaryBytes(true, true)
    for (const f of tx) expect(f.bytes).toBe(bytes)
    expect(bytes).toBeGreaterThan(uwbAncillaryBytes(false, false))
    expect(raictIeBytes(true, true)).toBe(raictIeBytes(false, false) + 2)

    // And what the receiver made of it: one record per fragment, on the tag's own lane, naming the
    // anchor that sent it — nothing missing anywhere, because nothing was lost.
    const got = anc(rs)
    expect(got.map((r) => [r.node, r.peer])).toEqual(tx.map(() => ['tag-1', 'anc-1']))
    expect(got.map((r) => r.framesRemaining)).toEqual([3, 2, 1, 0, 3, 2, 1, 0])
    expect(got.map((r) => r.slot)).toEqual([...windows, ...windows])
    for (const r of got) expect(r.missing, `slot ${r.slot}`).toEqual([])
    // The message is complete exactly once per block: at the fragment that said zero.
    expect(got.filter((r) => r.complete).map((r) => r.framesRemaining)).toEqual([0, 0])
    // One message number per block, and the two blocks' messages are told apart by it — without
    // that, a receiver could not tell a new message's first fragment from a stale one.
    expect(new Set(got.map((r) => r.messageNumber)).size).toBe(2)
    for (const r of got) expect(r.messageKind).toBe(ANCILLARY_MESSAGE_KIND)
  })

  it('does not disturb the ranging phase: every anchor still ranges in every block', () => {
    const rs = run(scenario(SCENE, session))
    for (const id of ['anc-1', 'anc-2', 'anc-3', 'anc-4']) {
      expect(of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === id).map((r) => r.block), id)
        .toEqual([0, 1])
    }
  })
})

// --- 2. The acceptance: when the loss is discovered -----------------------------

/**
 * One block of the scene above, with the anchor that sends the ancillary message moved out of
 * reach for exactly the span of one ancillary slot.
 *
 * This engine has no mobility and needs none: `UwbChannel` resolves a position through the very
 * node object the scenario handed it, at the instant it needs it, and `Simulation.runUntil` is
 * resumable (the trick `tests/uwb/rmnr-round.test.ts` established). The ancillary window is the
 * **tail** of the round, after every ranging slot, so a move inside it cannot touch a single
 * ranging frame — which is what makes "only this one fragment was lost" a fact rather than a hope.
 *
 * `lose` is the ancillary-window index to drop, 0…N−1.
 */
function runLosing(lose: number, session: Partial<UwbSessionCfg> = {}): TLRecord[] {
  const over = { ancillary: true, ancillaryFrames: FRAMES, ...session }
  const p = planOf(over)
  const nodes = SCENE.map((n) => ({ ...n, pos: { ...n.pos } }))
  const sim = new Simulation(scenario(nodes, over))
  const sender = nodes.find((n) => n.id === 'anc-1')
  if (!sender) throw new Error('runLosing: anc-1 is not in the scene')
  // Half a slot before the slot in question opens, and half a slot before the next one does. The
  // fragment radiates at its slot's start, so a position changed inside those two instants is the
  // position that one fragment flies through and no other.
  const at = (slot: number): number => (p.slots + slot) * p.slotNs - p.slotNs / 2
  const before = sim.runUntil(at(lose)).records
  sender.pos.y = 400
  const during = sim.runUntil(at(lose + 1)).records
  sender.pos.y = 0
  return [...before, ...during, ...sim.runUntil(BLOCK_NS - MS).records]
}

describe('acceptance: the missing frame is named when the NEXT frame arrives, not at a timeout', () => {
  const p = planOf({ ancillary: true, ancillaryFrames: FRAMES })

  it('names the missing frame when the NEXT frame arrives, not at a timeout', () => {
    // Fragment index 1 — the one whose Frames Remaining would have said 2 — never reaches the tag.
    const rs = runLosing(1)

    // The premise, asserted rather than assumed: four fragments went out, three arrived.
    expect(sent(rs).map((f) => f.remaining), 'the sender sent all four').toEqual([3, 2, 1, 0])
    const got = anc(rs)
    expect(got.map((r) => r.framesRemaining), 'the receiver saw three of them').toEqual([3, 1, 0])

    // **The acceptance.** The record that names the loss is the one the *next* fragment produced —
    // Frames Remaining 1, in the slot after the lost one — and it names the missing fragment by the
    // only identifier the IE gives it: the count that fragment would have carried.
    const named = got.filter((r) => r.missing.length > 0)
    expect(named).toHaveLength(1)
    expect(named[0].framesRemaining, 'discovered on the fragment that said 1').toBe(1)
    expect(named[0].missing, 'and the one it can prove never came is the one that would have said 2')
      .toEqual([2])

    // …and the instant. The discovery is **simultaneous with that reception** — same `t` as the
    // RX_OK of the fragment that produced it, to the nanosecond, because it is that reception.
    const rx = of(rs, 'RX_OK')
      .filter((r) => r.node === 'tag-1' && r.frame.kind === 'uwbAncillary')
    expect(rx).toHaveLength(3)
    expect(named[0].t).toBe(rx[1].t)

    // The only other instrument this receiver has is the message's own deadline — the end of the
    // round, which is where a receiver with no Frames Remaining field would first learn the message
    // never completed. The discovery beats it by the two slots the message still had to run.
    const end = of(rs, 'UWB_ROUND_END').filter((r) => r.node === 'tag-1')
    expect(end).toHaveLength(1)
    expect(named[0].t).toBeLessThan(end[0].t)
    expect(end[0].t - named[0].t).toBeGreaterThanOrEqual(2 * p.slotNs - p.slotNs / 2)
    // Nothing whatsoever reported the loss earlier: the lost slot leaves no record of its own, so
    // the record above is the first and only mention of it in the whole run.
    const earlier = rs.filter((r) => r.t < named[0].t
      && (r.type === 'UWB_ANCILLARY' ? r.missing.length > 0 : r.type === 'UWB_TIMEOUT'))
    expect(earlier, 'no timeout and no earlier gap record').toEqual([])
    // …and no ancillary slot ever produces a UWB_TIMEOUT, in this run or any other: a fragment is
    // one member of a message and the message is what evaluates it, the same division a
    // P802.15.4ab fragment train already follows (`Expectation.silent`).
    expect(of(rs, 'UWB_TIMEOUT').filter((r) => r.expected === 'uwbAncillary')).toEqual([])
  })

  it('is the last fragment that the mechanism cannot beat a deadline on, which is its honest edge', () => {
    // Lose the fragment that would have said **zero** and there is no next fragment to notice the
    // gap: the countdown simply stops at 1. So this is the one case the receiver does learn at the
    // deadline rather than at a reception — the boundary of what Frames Remaining can do, measured
    // rather than argued, and the contrast that makes the test above a claim about *timing*.
    const rs = runLosing(FRAMES - 1)
    expect(sent(rs).map((f) => f.remaining)).toEqual([3, 2, 1, 0])
    const got = anc(rs)
    // Three receptions, none of them able to name anything…
    const atSlot = got.filter((r) => r.slot !== null)
    expect(atSlot.map((r) => r.framesRemaining)).toEqual([3, 2, 1])
    for (const r of atSlot) expect(r.missing).toEqual([])
    expect(atSlot.some((r) => r.complete)).toBe(false)
    // …and one record at the deadline, which carries no slot because it is not a reception.
    const deadline = got.filter((r) => r.slot === null)
    expect(deadline).toHaveLength(1)
    expect(deadline[0].framesRemaining).toBeNull()
    expect(deadline[0].missing, 'the one fragment still owed').toEqual([0])
    expect(deadline[0].complete).toBe(false)
    const end = of(rs, 'UWB_ROUND_END').filter((r) => r.node === 'tag-1')
    expect(deadline[0].t, 'at the round end, not before it').toBe(end[0].t)
  })

  it('cannot name a leading fragment that never arrived, and says so by not claiming one', () => {
    // Lose fragment 0 and the receiver's first reading is 2: it has nothing to compare against, so
    // it cannot know a 3 was ever sent. The RAICT IE carries no total — only how many are left
    // (§10.35.2.1) — so the mechanism names gaps *between* readings and nothing before the first.
    // Written down because the alternative is a reader assuming the field does more than it does.
    const rs = runLosing(0)
    expect(sent(rs).map((f) => f.remaining)).toEqual([3, 2, 1, 0])
    const got = anc(rs)
    expect(got.map((r) => r.framesRemaining)).toEqual([2, 1, 0])
    for (const r of got) expect(r.missing, `remaining ${r.framesRemaining}`).toEqual([])
    // It still completes: the message ends where Frames Remaining says it does.
    expect(got.filter((r) => r.complete)).toHaveLength(1)
  })
})

// --- 3. Both schedules ----------------------------------------------------------

describe('acceptance: a contention run differs from a scheduled one, on the air (design §3/§5.4)', () => {
  it('runs under contention and produces a different record than under time', () => {
    const over = { ancillary: true, ancillaryFrames: FRAMES }
    const timed = planOf({ ...over, schedule: 'time' })
    const drawn = planOf({ ...over, schedule: 'contention', contentionSlots: 8 })

    // The window the fragments are placed in is itself a different width: a time-scheduled round
    // appends exactly one slot per fragment, because the slot table names their owner; a contention
    // round appends the round's own contention window, because nothing names one and the sender has
    // to draw where its run starts (standard §10.32.2 schedule mode 0). Both read off
    // `uwbAncillarySlots`, never a literal.
    expect(ancillarySlots(timed)).toBe(FRAMES)
    expect(ancillarySlots(drawn)).toBe(8)
    expect(ancillarySlots(drawn)).not.toBe(ancillarySlots(timed))

    const rsT = run(scenario(SCENE, { ...over, schedule: 'time' }))
    const rsC = run(scenario(SCENE, { ...over, schedule: 'contention', contentionSlots: 8 }))

    // Both really ran: four fragments per block, in both.
    expect(sent(rsT).map((f) => f.remaining)).toEqual([3, 2, 1, 0, 3, 2, 1, 0])
    expect(sent(rsC).map((f) => f.remaining)).toEqual([3, 2, 1, 0, 3, 2, 1, 0])

    // And the records differ in the one way §10.32.2 schedule mode 0 says they must: the slots are
    // no longer the pre-assigned ones. A time-scheduled run puts fragment k in appended slot k,
    // every block; a contention run puts the run wherever the sender drew, and the draw moves from
    // block to block.
    const windowIndex = (rs: TLRecord[], p: ReturnType<typeof roundPlan>): number[] =>
      sent(rs).map((f) => f.slot - p.slots)
    expect(windowIndex(rsT, timed), 'time: slot k holds fragment k, always').toEqual([0, 1, 2, 3, 0, 1, 2, 3])
    const drawnIdx = windowIndex(rsC, drawn)
    expect(drawnIdx, 'contention: four consecutive slots, starting where the draw fell')
      .toHaveLength(2 * FRAMES)
    const starts = [drawnIdx[0], drawnIdx[FRAMES]]
    for (const s of starts) {
      expect(s, 'the run has to fit the window it was drawn in').toBeLessThanOrEqual(8 - FRAMES)
      expect(s).toBeGreaterThanOrEqual(0)
    }
    expect(drawnIdx.slice(0, FRAMES)).toEqual([0, 1, 2, 3].map((k) => starts[0] + k))
    expect(drawnIdx.slice(FRAMES)).toEqual([0, 1, 2, 3].map((k) => starts[1] + k))
    // The thing that makes this not a second name for the same behaviour: at least one of the two
    // blocks' runs does not start at the window's own first slot, and the two blocks do not agree
    // with each other either — a drawn placement, not a fixed one dressed up.
    expect(starts[0] !== 0 || starts[1] !== 0, `starts ${JSON.stringify(starts)}`).toBe(true)
    expect(starts[0]).not.toBe(starts[1])

    // …and the receiver read the same message in both: what contention changed is where the
    // fragments sat, not what they said.
    expect(anc(rsC).map((r) => r.framesRemaining)).toEqual(anc(rsT).map((r) => r.framesRemaining))
    expect(anc(rsC).map((r) => r.slot)).not.toEqual(anc(rsT).map((r) => r.slot))
  })

  it('still runs when the message is longer than the window it draws from — the degenerate case', () => {
    // The scenario schema caps `ancillaryFrames` at the round's own slot count, which under
    // contention is `1 + contentionSlots` — so a message one fragment longer than the draw window is
    // a **permitted** configuration, and `uwbAncillarySlots` widens the window to the message rather
    // than letting the draw reach past it. One start, no choice, and a round that still runs: a
    // permitted configuration that threw at run time would be the same defect class as one that
    // silently did nothing.
    const over: Partial<UwbSessionCfg> = {
      ancillary: true, schedule: 'contention', contentionSlots: 2, ancillaryFrames: 3,
    }
    const p = planOf(over)
    expect(p.slots, 'contention: 1 + contentionSlots').toBe(3)
    expect(p.ancillaryFrames, 'the schema allows the message to fill the whole round').toBe(p.slots)
    expect(ancillarySlots(p), 'so the window is the message').toBe(3)
    const rs = run(scenario(SCENE, over))
    expect(sent(rs).map((f) => f.slot - p.slots), 'one start, and it is index 0').toEqual([0, 1, 2, 0, 1, 2])
    expect(anc(rs).map((r) => r.framesRemaining)).toEqual([2, 1, 0, 2, 1, 0])
  })

  it('is the draw itself that differs, not the seed: two seeds place the run differently', () => {
    // A placement that came out of the sender's own random stream is a placement that moves with
    // the stream. Without this, a "drawn" start that was really a constant would pass the test
    // above whenever the constant happened to be non-zero.
    const over: Partial<UwbSessionCfg> = {
      ancillary: true, ancillaryFrames: FRAMES, schedule: 'contention', contentionSlots: 8,
    }
    const p = planOf(over)
    const startsFor = (seed: number): number[] => {
      const sc = { ...scenario(SCENE, over), seed }
      return sent(run(sc)).map((f) => f.slot - p.slots).filter((_, i) => i % FRAMES === 0)
    }
    expect(startsFor(7)).not.toEqual(startsFor(99))
  })
})

// --- 4/5/6. What must not move -------------------------------------------------

describe('what switching the exchange on must not change', () => {
  const session = { ancillary: true, ancillaryFrames: FRAMES }

  it('leaves UWB_RANGE field-for-field identical with ancillary on', () => {
    // One tag, so the appended slots cannot move another round's start instant: with a single round
    // per block the ranging phase sits at exactly the instants it always did, and the identity holds
    // including `t`. `seq` is a position in the record stream, not a field of the measurement.
    const off = run(scenario(SCENE, { ancillary: false }))
    const on = run(scenario(SCENE, session))
    const ranges = (rs: TLRecord[]): unknown[] => of(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(off).length, 'SS embedded: one range per anchor per block').toBe(2 * A)
    expect(ranges(on)).toEqual(ranges(off))
    // …and so are the ranging timestamps: an ancillary fragment is not timed (its IE carries no
    // time at all), so the receiver spends no timestamp-noise or carrier-offset draw on one and the
    // random stream the ranging phase runs on is untouched.
    const stamps = (rs: TLRecord[]): unknown[] =>
      of(rs, 'UWB_TS').filter((r) => r.frameKind !== 'uwbAncillary').map(({ seq, ...rest }) => rest)
    expect(stamps(on)).toEqual(stamps(off))
    expect(of(on, 'UWB_TS').filter((r) => r.frameKind === 'uwbAncillary'), 'and none of its own')
      .toEqual([])
  })

  it('sends nothing at all when ancillary is off', () => {
    const rs = run(scenario(SCENE, { ancillary: false, ancillaryFrames: FRAMES }))
    // Not one frame, not one record, not one appended slot — at any `ancillaryFrames`, which is the
    // half that says the two switches are orthogonal rather than one switch spelled twice.
    expect(sent(rs)).toEqual([])
    expect(anc(rs)).toEqual([])
    const p = planOf({ ancillary: false, ancillaryFrames: FRAMES })
    expect(ancillarySlots(p)).toBe(0)
    for (let block = 0; block < 4; block++) {
      expect(blockSlots(p, block), `block ${block}`).toBe(p.slots)
      expect(blockCarriesAncillary(p, block)).toBe(false)
    }
    // …and `uwbAncillarySlots`, the one definition the scenario schema and the scheduler both
    // budget from, answers zero for the feature-off case whatever else is set.
    expect(uwbAncillarySlots('twr', 'time', 8, false, FRAMES)).toBe(0)
    expect(uwbAncillarySlots('twr', 'contention', 8, false, FRAMES)).toBe(0)
  })

  it('is deterministic, and every other mode byte-identical', () => {
    // Deterministic: the same session twice is the same stream twice, and a session with the
    // exchange on is *not* the same stream as one with it off — so the comparison is not trivially
    // true of everything.
    const streamOf = (over: Partial<UwbSessionCfg>): string => {
      const rs = run(scenario(SCENE, over)).filter((r) => r.type.startsWith('UWB_') || r.type === 'TX_START')
      return hashStr(JSON.stringify(rs)).toString(16)
    }
    expect(streamOf(session)).toBe(streamOf(session))
    expect(streamOf(session)).not.toBe(streamOf({ ancillary: false }))

    /**
     * Captured from HEAD before any of Task 3 was written. Every mode here either refuses
     * `ancillary` outright (the four mode rules the slice before wrote) or is the default-off
     * two-way session, so every record of theirs must be exactly what it was. Expected to pass
     * before the implementation as well as after — it is the guard, not the goal.
     */
    const BEFORE: Record<string, string> = {
      'twr-ss': 'ee01e2cc',
      'twr-ds': '9014ffdb',
      'dl-tdoa': '66c943a3',
      'ul-tdoa': 'a54ed982',
      m2m: '7e4b7a63',
    }
    const CASES: [string, Partial<UwbSessionCfg>][] = [
      ['twr-ss', { method: 'ss' }],
      ['twr-ds', { method: 'ds' }],
      ['dl-tdoa', { mode: 'dl-tdoa', method: 'ds' }],
      ['ul-tdoa', { mode: 'ul-tdoa', method: 'ss' }],
      ['m2m', { mode: 'm2m', method: 'ss' }],
    ]
    const now: Record<string, string> = {}
    for (const [name, over] of CASES) now[name] = streamOf(over)
    expect(now).toEqual(BEFORE)
  })
})

// --- The window, reused a third time -------------------------------------------

describe('the window is the RCM validity window, reused — not a second boundary (design §3)', () => {
  it('sends one message per validity window, at the window\'s opening block', () => {
    // §10.35.1 bounds the exchange to the current round plus the rounds the RCM still governs, and
    // `blockCarriesRcm` is already the one expression for where such a window opens — this is its
    // third reuse, after §10.34's RMNR and §10.36's receipt bitmap. With R = 4 the exchange runs in
    // blocks 0 and 4 and in none of the three between, which is what makes the window visible
    // rather than merely cited.
    const over = { ancillary: true, ancillaryFrames: FRAMES, rcmValidityRounds: 4 }
    const p = planOf(over)
    expect([0, 1, 2, 3, 4, 5].map((b) => blockCarriesAncillary(p, b)))
      .toEqual([true, false, false, false, true, false])
    expect([0, 1, 2, 3, 4].map((b) => blockSlots(p, b)))
      .toEqual([p.slots + FRAMES, p.slots, p.slots, p.slots, p.slots + FRAMES])

    const rs = run(scenario(SCENE, over), 6 * BLOCK_NS - MS)
    const blocks = of(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'uwbAncillary')
      .map((r) => r.frame.uwb?.block)
    expect(blocks).toEqual([0, 0, 0, 0, 4, 4, 4, 4])
    // …and the run really did reach block 5, so the two above are not simply all the blocks there
    // were.
    expect(of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === 'anc-1').map((r) => r.block))
      .toEqual([0, 1, 2, 3, 4, 5])
  })

  it('does not send from a responder that never decoded the control message', () => {
    // The same physical floor §10.34's RMNR frame and §10.36's confirmation both stand on: the slot
    // the ancillary message rides in is appended to *this initiator's* round, and which round that
    // is was settled by that initiator's RDM IE. A responder that never decoded one has no slot of
    // its own there, so speaking would be speaking in somebody else's.
    //
    // The scene puts the tag 10 dB down and the sending anchor 400 m away, so no control message
    // ever reaches it while its own frames would still carry: its silence is a decision, not a dead
    // link.
    const QUIET = UWB_TX_POWER_DBM - 10
    const rs = run(scenario([
      uwbNode('anc-1', 0, 400, 'anchor'),
      uwbNode('anc-2', 8, 0, 'anchor'),
      uwbNode('anc-3', 0, 6, 'anchor'),
      uwbNode('anc-4', 8, 6, 'anchor'),
      uwbNode('tag-1', 4, 3, 'tag', QUIET),
    ], { ancillary: true, ancillaryFrames: FRAMES }))
    expect(of(rs, 'RX_OK').filter((r) => r.node === 'anc-1'), 'anc-1 decoded nothing').toEqual([])
    expect(sent(rs), 'so it sent nothing either').toEqual([])
    expect(anc(rs)).toEqual([])
  })
})
