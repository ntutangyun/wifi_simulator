/**
 * SP3 grouped ranging for `UwbDevice` (standard §10.32.8; design
 * `docs/superpowers/specs/2026-10-02-sp3-design.md`).
 *
 * **Why a file of its own**, when SP3 is not a mode and every one of its hooks sits inside a branch
 * `device.ts` already has: because the one rule this slice must never have "fixed" — that the
 * identity of an SP3 marker's sender comes from the slot and from nowhere else (design §3.2) — is a
 * rule you have to be able to read end to end to audit. `device.ts` is ninety thousand characters.
 * This is the precedent `device.tdoa.ts`, `device.m2m.ts` and `device.report.ts` set, applied for
 * the auditability rather than for the size: every function here takes the device as its first
 * argument, and `device.ts` reaches each of them from a branch on the round's own `plan.sp3`.
 *
 * **What an SP3 packet is**: SYNC + SFD + STS, and nothing else (§10.32.8.2). No PHR, so no PSDU,
 * so no MHR, so **no address and no timestamp field**. Two consequences run through everything
 * below:
 *
 *  1. The receiver cannot filter its wait on the sender, because the frame names none — so the wait
 *     is opened to whoever transmits in that slot, and the slot's own owner (the round's RDM IE,
 *     §10.32.9.8, which `slotAction` already reads) is what the arrival is attributed to.
 *  2. The time the marker measures has to come back later, which is exactly the deferred
 *     reply-time path SS-TWR already has (§10.29.6.3) — the reason the scenario schema accepts
 *     `sp3` only with `replyTime: 'deferred'`.
 */
import type { FrameDesc } from '../model/frames'
import { counterDiff } from './clock'
import type { RoundState, UwbDevice } from './device'
import { makeSp3, UWB_BROADCAST } from './frames'
import { slotAction, type RoundPlan } from './session'

/**
 * Whether this round's responders answer with SP3 markers rather than SP1 Responses.
 *
 * Read off the **plan**, never off a device's own copy of the session config, for the reason every
 * other round-shape question in this engine is: both ends of a round have to reach the same
 * judgement, and two devices deriving it separately is one more way for them to disagree about what
 * is in the air. The schema refuses `sp3` in every mode but `'twr'`, and the `mode` test here is
 * what makes that refusal a fact this code can rely on rather than one it assumes.
 */
export function sp3Round(plan: RoundPlan): boolean {
  return plan.sp3 && plan.mode === 'twr'
}

/**
 * The responder a slot of an SP3 round belongs to: the schedule's answer, and the only answer there
 * is.
 *
 * It **throws** rather than returning null when the slot names no responder. Reaching that would
 * mean a device accepted a marker in a slot the round gave to nobody, i.e. that the expectation and
 * the slot table disagree — not a state the model can be in on purpose (Ruling 9 of the
 * many-to-many slice), and precisely the state a silent fallback would turn into a range attributed
 * to whichever device happened to be first in the list. A non-null assertion here would be no check
 * at all, which is the other discipline this branch has paid for.
 */
export function sp3SlotPeer(r: RoundState, slot: number): string {
  const action = slotAction(r.plan, slot)
  if (action.kind !== 'uwbResp' && action.kind !== 'uwbSsDefer') {
    throw new Error(`sp3SlotPeer: slot ${slot} of this round carries a '${action.kind}', not a responder's frame`)
  }
  const peer = r.anchors[action.anchor]
  if (peer === undefined) {
    throw new Error(
      `sp3SlotPeer: slot ${slot} is responder ${action.anchor} of a round that holds ${r.anchors.length}`,
    )
  }
  return peer
}

/**
 * Responder: its one ranging frame of the round, as an SP3 marker.
 *
 * `UWB_BROADCAST` as the destination, not the initiator's id: an SP3 packet has no MHR to put an
 * address in, in either field, and this engine's broadcast destination is already its way of saying
 * "there is no one peer named here" (`frames.ts`). It still takes a ranging counter — the marker is
 * the thing being timed, and that is the whole of what it is for.
 *
 * Nothing is added to the frame. A field here would not cost the lesson its saving, the way slice
 * 3's Ruling 3 would have; it would cost the lesson its **premise**, because a marker that names
 * its sender is not the frame §10.32.8.2 describes and the slot would have nothing left to do.
 */
export function transmitSp3Marker(dev: UwbDevice, r: RoundState, slot: number, txCounter: number): void {
  r.txRespCounter = txCounter
  dev.send(makeSp3(dev.id, UWB_BROADCAST, r.plan.method, r.block, r.round, slot), txCounter)
}

/**
 * Initiator, on an SP3 marker: bank the round trip against **the device whose slot this is**.
 *
 * This is the whole of design §3.2 in one line (`sp3SlotPeer`), and it is the line the slice's
 * acceptance test mutates: with the slot table shuffled, the round trips below are banked against
 * the wrong responders and every distance comes out wrong, which is what proves the attribution
 * never came from the frame. `from` is deliberately not a parameter of this function — there is
 * nothing it could honestly be used for here.
 *
 * What it banks is exactly what an SS-TWR Response's own arrival banks (`device.ts`'s
 * `onResponse`): the round trip is measured here, and the reply time cannot be — this frame's own
 * send time is what it would have had to contain. So no range is finished in this slot in either
 * method, and that is visible in the timeline rather than hidden.
 */
export function onSp3Marker(
  dev: UwbDevice, r: RoundState, slot: number, counter: number, coffs: number, fom: number,
): void {
  if (r.txPollCounter === null) return
  const peer = sp3SlotPeer(r, slot)
  const tround1 = counterDiff(counter, r.txPollCounter)
  r.peers.set(peer, { id: peer, rxRespCounter: counter, coffs, fom, tround1, treply2: null })
  dev.emit({
    t: dev.now(), type: 'UWB_SP3', node: dev.id, peer, slot, block: r.block, round: r.round,
  })
}

/**
 * Initiator, on a responder's data report (§10.32.8.1's third phase): the reply time its marker
 * could not carry, and whatever else the round's SRRR IE asked for.
 *
 * The peer comes from the slot here too, not from the frame's address — and not because this frame
 * lacks one (it is an ordinary SP1 PPDU with an MHR), but because **the slot is what pairs it with
 * a marker**. The marker had no address to pair on, so the only thing that can say which
 * measurement this report completes is the table that gave the two slots to the same responder. One
 * rule, read twice, rather than two rules that can disagree.
 *
 * The arithmetic itself is `device.ts`'s `onSsDefer`, reached through it so that there is exactly
 * one place in this engine where a deferred reply time becomes a range.
 */
export function onSp3Report(dev: UwbDevice, r: RoundState, slot: number, frame: FrameDesc): void {
  const peer = sp3SlotPeer(r, slot)
  const replyRctu = frame.uwb?.replyRctu
  if (replyRctu === undefined) return
  const thetaDeg = frame.uwb?.aoaThetaDeg
  dev.emit({
    t: dev.now(), type: 'UWB_SP3_REPORT', node: dev.id, peer, slot, block: r.block, round: r.round,
    replyRctu, ...(thetaDeg !== undefined ? { thetaDeg } : {}),
  })
  dev.finishDeferredRange(r, peer, replyRctu)
}

/**
 * Responder: the bearing its data report carries, or undefined when the round asked for none.
 *
 * Two conditions, and both have to hold: the round's SRRR IE set the RAOA bit (§10.32.9.9), and
 * this responder actually measured a bearing this round (`aoa` on, and a frame from the initiator
 * decoded — `device.report.ts`'s `measureAoa`). The schema already refuses `srrr.raoa` without
 * `aoa`, so the second condition is about this round rather than about the configuration: a
 * responder that never heard the initiator has no bearing, and a report frame four octets longer
 * with nothing in those octets is the stated-versus-simulated gap this repository keeps finding.
 */
export function sp3ReportBearing(r: RoundState): number | undefined {
  if (!r.plan.srrr.raoa) return undefined
  return r.aoaThetaDeg ?? undefined
}
