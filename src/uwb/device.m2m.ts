/**
 * Many-to-many ranging for `UwbDevice` (standard §10.32.6 SS-TWR, §10.32.7 DS-TWR): the mode in
 * which **one transmission does two jobs**. Split out into its own file the way `device.tdoa.ts`
 * and `device.mms.ts` are, and for the same reason — `device.ts` is already a thousand lines —
 * with every function here taking the device as its first argument.
 *
 * ## The mechanism, and why only one side of a pair can finish it
 *
 * Participants 0…N−1 (design §5: every UWB node of the scenario, in node-id order). Participant i
 * transmits once in slot i, and its frame carries its own transmit time plus its arrival time for
 * each of slots 0…i−1 — everyone it has heard so far. For everyone later in the round that frame
 * is the question a Poll would have asked; for everyone earlier it is the answer a Response would
 * have given.
 *
 * Take a pair (i, j) with i < j:
 *
 * - i transmitted at `T_i(i)`, and j received it at `T_j(i)`.
 * - j transmitted at `T_j(j)`, and i received it at `T_i(j)`.
 * - **j's frame carries `T_j(j)` and `T_j(i)`** — i went first, so j had already heard it when it
 *   came to transmit.
 * - So **i holds all four times** the moment j's frame lands, and computes the range there and
 *   then: `ssTwrCorrected(T_i(j) − T_i(i), T_j(j) − T_j(i), coffs)`.
 * - **j cannot.** It would need `T_i(j)` — i's arrival time for j's frame — and at the instant i
 *   transmitted, that had not happened yet.
 *
 * So each pair's range belongs to the **earlier** participant alone: participant i ends the round
 * holding N−1−i ranges, participant 0 holds N−1 of them and participant N−1 holds none. They sum
 * to N(N−1)/2, every pair once (design §2). Note what that means for the last participant: it
 * reports N−1 arrival times, so it sends the **longest frame of the whole round**, and it computes
 * nothing at all. Everything in that frame is service to the others.
 *
 * ## DS is two passes, not two frames
 *
 * DS-TWR needs `tround2`/`treply2`, which require the *earlier* participant to transmit a second
 * time, so a DS many-to-many round is two passes of N slots (design §3). Mapping the pair (i, j)
 * onto DS-TWR's six instants: i's pass-0 frame is the Poll (T1), j's pass-0 frame the Response
 * (T2/T3), i's pass-1 frame the Final (T5). i already holds T1, T4 and T5 itself; what it needs
 * from j is T2 and T3 (in j's pass-0 frame) and T6 (in j's pass-1 frame, which comes after i's own
 * pass-1 frame, so j has had time to stamp it). A pass-1 frame therefore carries arrival times of
 * pass-1 frames — the same shape as a pass-0 frame, never a running tally of both — which is why
 * one frame-size law and one participant cap (`phy.ts#uwbM2mBytes`, `#uwbMaxParticipants`) serve
 * both methods.
 *
 * ## What is *not* here
 *
 * No arithmetic. Every range below is `ranging.ts`'s own `ssTwrCorrected` or `dsTwr` on the very
 * four times a two-way round feeds them: many-to-many changes the **road** those four times
 * travel, not the sum at the end of it. And no clock offset goes on the air (design §4): `coffs`
 * is measured on the carrier of the frame that arrives, exactly as the existing SS-TWR path
 * measures it (`UwbDevice.onResponse`), so a many-to-many frame carries one IE fewer.
 */
import type { FrameDesc } from '../model/frames'
import { counterDiff } from './clock'
import { makeM2m } from './frames'
import { dsTwr, ssTwrCorrected, ssTwrRaw } from './ranging'
import type { RoundPlan } from './session'
import type { RoundState, ScheduledAction, UwbDevice } from './device'
import { reportRange } from './device.report'

/**
 * What one participant holds for the duration of one many-to-many round. Null in every other mode.
 *
 * The two-element arrays are indexed by **pass** (design §3): SS uses index 0 only, DS uses both.
 * They are arrays rather than two named fields because the pass is a number the schedule hands
 * over (`SlotAction.pass`), and naming them `pass0`/`pass1` would put a branch at every use.
 */
export interface M2mRoundState {
  /** The round's participants in slot order — participant i transmits in slot i (design §5).
   * This, and never `RoundPlan.anchors`, is what a many-to-many path counts participants with:
   * `anchors` counts the devices *other than* the tag in a two-way round, and everyone in this
   * one, so the two quantities differ by one for the same number (slice ledger, Ruling 8). */
  participants: string[]
  /** This device's own place in that list, i.e. the slot it transmits in. */
  index: number
  /** Its own transmit counter per pass, null until it has transmitted in that pass. */
  txCounters: [number | null, number | null]
  /** Its own arrival counters per pass, by peer id: what its next frame will carry, and the `T4`
   * of every pair it is the earlier half of. A peer it never heard simply has no entry, and that
   * is what design §6 looks like from the inside — not an error path. */
  rxCounters: [Record<string, number>, Record<string, number>]
  /**
   * DS only, by peer id: the two times a later participant's **pass-0** frame brought, kept until
   * that participant's pass-1 frame arrives with the third. `t2` is its arrival time for this
   * device's pass-0 frame and `t3` its own pass-0 transmit time, both on its clock — DS-TWR's
   * `treply1 = T3 − T2`, and the `T3` that `tround2 = T6 − T3` is measured from.
   *
   * An entry exists only for a peer whose frame actually listed this device, which is exactly the
   * peers this device is the earlier half of the pair for. SS keeps nothing here: it holds all
   * four times the instant the peer's one frame lands, and finishes the range on the spot.
   */
  pass0: Map<string, { t2: number; t3: number }>
  /** The pass the slot now open belongs to, as the schedule announced it when it opened
   * (`SlotAction.pass`). Read, never re-derived: `slotAction` is the one thing that decides which
   * pass a slot is in, and a second formula here could disagree with it. */
  slotPass: 0 | 1
}

/**
 * Open a many-to-many round at one participant.
 *
 * Both invariants are checked rather than assumed, because a device that is not in the round's own
 * participant list, or a list that is not the length the round was planned for, would range
 * against the wrong slots in silence — and the two ways it could happen (a network that built the
 * plan from one count and the list from another) are precisely the ones a scenario cannot show you.
 */
export function freshM2m(plan: RoundPlan, participants: string[], selfId: string): M2mRoundState {
  if (participants.length !== plan.participants) {
    throw new Error(
      `freshM2m: the round was planned for ${plan.participants} participants but ${participants.length} were named`,
    )
  }
  const index = participants.indexOf(selfId)
  if (index < 0) throw new Error(`freshM2m: ${selfId} is not a participant of this many-to-many round`)
  return {
    participants: [...participants],
    index,
    txCounters: [null, null],
    rxCounters: [{}, {}],
    pass0: new Map(),
    slotPass: 0,
  }
}

/**
 * One slot of a many-to-many round. Exactly one participant owns it — the one the schedule named —
 * and **everyone else listens**, which is the cost of the mode: no device sleeps through a slot
 * the way a two-way anchor sleeps through the other anchors' Responses, because every one of those
 * transmissions is either a question this device must answer later or an answer it can use now.
 * N transmissions, N(N−1) receptions, N(N−1)/2 ranges.
 */
export function onM2mSlot(
  dev: UwbDevice, slot: number, action: ScheduledAction, r: RoundState,
  peers: { tag: string; anchors: string[] },
): void {
  const m = requireM2m(r, 'onM2mSlot')
  if (action.kind !== 'uwbM2m') {
    throw new Error(`onM2mSlot: a many-to-many round scheduled a '${action.kind}' action in slot ${slot}`)
  }
  m.slotPass = action.pass
  const txId = m.participants[action.index]
  if (txId === undefined) {
    throw new Error(`onM2mSlot: slot ${slot} names participant ${action.index}, and the round has ${m.participants.length}`)
  }
  if (txId === dev.id) {
    dev.transmitFor(action, slot, r, peers)
    return
  }
  dev.listenFor(slot, txId, 'uwbM2m')
}

/**
 * This participant's one transmission of one pass: its own transmit time, and its arrival time for
 * every participant it has heard **in this same pass**.
 *
 * In this same pass, and that is the whole of why a DS round costs 2N slots rather than a bigger
 * frame: a pass-1 frame answers the pass-1 transmissions, so it is the same shape as a pass-0 one
 * and the round's longest frame never outgrows `uwbM2mBytes(N − 1)` (design §3/§4).
 *
 * The frame goes out whatever this device has heard, including nothing at all: participant 0 has
 * heard no one when its slot comes round, and its frame — the one every later participant needs —
 * carries a transmit time and no arrival-times IE at all (`frames.ts#makeM2m`). By the same token
 * the **last** participant carries N−1 arrival times, which makes its frame the longest of the
 * round while the arithmetic below will give it nothing: it computes no range at all, because
 * every pair it is in it is the *later* half of. Everything in its frame is service to the others.
 */
export function transmitM2m(
  dev: UwbDevice, action: ScheduledAction, slot: number, r: RoundState, txCounter: number,
): void {
  const m = requireM2m(r, 'transmitM2m')
  if (action.kind !== 'uwbM2m') {
    throw new Error(`transmitM2m: a many-to-many round asked to transmit a '${action.kind}'`)
  }
  m.txCounters[action.pass] = txCounter
  dev.send(
    makeM2m(dev.id, r.plan.method, r.block, r.round, slot, {
      txCounter,
      // Copied by `makeM2m` as well, but sliced here too: what this frame said is fixed at the
      // instant it left, and the arrivals of the rest of the round must not appear in it.
      rxCounters: { ...m.rxCounters[action.pass] },
    }),
    txCounter,
  )
}

/**
 * A many-to-many frame has arrived. Two things happen, in this order:
 *
 * 1. **The arrival is banked**, always — it is what this device's own frame in this pass will
 *    carry, and it is the pair's `T4`.
 * 2. **If this device is the earlier half of the pair, the range is finished** (design §2). The
 *    test for that is not an index comparison but the frame itself: a peer's frame lists this
 *    device's arrival time only if it had already heard this device, which happens only if this
 *    device transmitted first. So "am I earlier?" and "did it hear me?" are the same question, and
 *    asking the frame answers both at once — which is also how design §6 falls out for free: a
 *    peer that never heard this device carries no entry for it, and that pair simply has no range.
 */
export function onM2mRx(
  dev: UwbDevice, r: RoundState, from: string, frame: FrameDesc, counter: number, coffs: number, fom: number,
): void {
  const m = requireM2m(r, 'onM2mRx')
  const times = frame.uwb?.m2m
  // Every `uwbM2m` frame is built by `makeM2m`, which always fills this in, and the slot's
  // expectation has already refused every other frame kind — so a frame that reaches here without
  // its times is not a many-to-many frame with something missing, it is a frame this branch should
  // never have been handed (slice ledger, Ruling 9).
  if (times === undefined) {
    throw new Error(`onM2mRx: a 'uwbM2m' frame from ${from} carries no many-to-many times`)
  }
  const pass = m.slotPass
  m.rxCounters[pass][from] = counter
  // Standard §10.36's receipt bit, written at the one place a many-to-many frame is decoded. **Pass
  // 0 only**: in this mode the opener is the question, and the question is the pass-0 transmission —
  // a DS round's pass-1 frame is the answer half (design §3), and counting it as an opener would let
  // a bit be set by a frame that is not what the bitmap reports on. Keyed by `from`, the initiator,
  // which in this mode is every other participant in turn (`UwbDevice.openerReceipt`).
  if (pass === 0) dev.noteOpener(from, r.block, r.plan)
  // `T_j(i)` / `T2`: when the sender heard *this* device, in this same pass. Absent when it did
  // not hear it — or when this device is the later half of the pair, which is the same thing.
  const rxOfMe: number | undefined = times.rxCounters[dev.id]
  const myTx = m.txCounters[pass]
  if (rxOfMe === undefined || myTx === null) return
  if (r.plan.method === 'ss') {
    // All four times, in one place, for the first time in the round: two this device measured
    // (its own transmission and this arrival) and two the frame brought. `coffs` is this
    // reception's own carrier-offset estimate — how much faster the sender's crystal runs than
    // this one — which is what puts the sender's reply interval on this device's timebase, the
    // identical job it does in `onResponse` (design §4/§8 of the reply-time slice).
    const tround = counterDiff(counter, myTx)
    const treply = counterDiff(times.txCounter, rxOfMe)
    reportRange(dev, r, from, 'ss', ssTwrCorrected(tround, treply, coffs), ssTwrRaw(tround, treply), fom)
    return
  }
  if (pass === 0) {
    // Nothing to compute yet: DS needs a second transmission from *this* device before the pair
    // has six instants. Keep the two the frame brought — they do not come again.
    m.pass0.set(from, { t2: rxOfMe, t3: times.txCounter })
    return
  }
  const first = m.pass0.get(from)
  const t1 = m.txCounters[0]
  const t4 = m.rxCounters[0][from]
  // A DS pair needs all six. Any one of them missing is a pair this round did not complete —
  // this device or that peer lost a frame in one of the two passes — so the pair has no range,
  // exactly as in SS. Branching rather than asserting is deliberate: `dsTwr(undefined, …)` is NaN
  // without an exception anywhere, and `reportRange` would bank that NaN as a UWB_RANGE.
  if (first === undefined || t1 === null || t4 === undefined) return
  const tround1 = counterDiff(t4, t1) // T4 − T1, on this device's clock
  const treply1 = counterDiff(first.t3, first.t2) // T3 − T2, on the peer's
  const tround2 = counterDiff(rxOfMe, first.t3) // T6 − T3, on the peer's
  const treply2 = counterDiff(myTx, t4) // T5 − T4, on this device's
  // No `tofRawRctu`: there is no uncorrected reading to compare against, because DS-TWR never
  // corrects for a clock offset in the first place — it cancels it (see `onFinal`/`onReport`,
  // which pass none either). The FoM is this pass-1 reception's, the last frame of the exchange.
  reportRange(dev, r, from, 'ds', dsTwr(tround1, treply1, tround2, treply2), undefined, fom)
}

/** The round's many-to-many state, or a throw naming the caller. `RoundState.m2m` is non-null for
 * exactly the rounds whose `plan.mode` is `'m2m'` (`UwbDevice.beginRound`), so a null here means a
 * many-to-many path is running against a device that was never opened into a many-to-many round —
 * never a legitimate state, and the sort of thing that has twice shipped on this branch looking
 * finished while doing nothing (slice ledger, Ruling 9). */
function requireM2m(r: RoundState, who: string): M2mRoundState {
  const m = r.m2m
  if (!m) throw new Error(`${who}: a '${r.plan.mode}' round carries no many-to-many state`)
  return m
}
