/**
 * The ranging ancillary information exchange for `UwbDevice` — the Request = 0 half of standard
 * §10.35 (design `docs/superpowers/specs/2026-10-02-ancillary-design.md`).
 *
 * **Why a file of its own.** The same reason `device.sp3.ts` gives for itself: the one rule a reader
 * will mistake for a bug has to be readable end to end to be audited, and `device.ts` is ninety
 * thousand characters. Here that rule is the role inversion below. Every function takes the device
 * as its first argument and `device.ts` reaches each of them from one branch, exactly as it reaches
 * `device.tdoa.ts`, `device.m2m.ts` and `device.sp3.ts`.
 *
 * **The roles are inverted in this clause.** §10.35.1 defines, for this exchange and this exchange
 * only, the *initiator* as the device that **sends** the ancillary information and the *responder*
 * as the one that **receives** it. Those are the opposite way round from the ranging roles of the
 * same two words, and this engine's slot table is built from the ranging ones (`slotAction`
 * dispatches on `tx: 'tag' | 'anchor'`). So in every round below:
 *
 *   ranging initiator  = the tag     = this exchange's **responder** = the receiver
 *   ranging responder  = an anchor   = this exchange's **initiator** = the sender
 *
 * A device that *answers* in ranging is the one that *speaks* here. Nothing in the code below can
 * make that less surprising, so it is written down instead — in this header, on
 * `ANCILLARY_SENDER_INDEX`, and in the record's own doc comment in `records.ts`.
 *
 * **What the exchange is.** One message too large for a single frame, segmented across consecutive
 * slots the round appends after its ranging phase (design §4.2). Each fragment carries a RAICT IE
 * (§10.35.2.1) whose Frames Remaining field counts down from N−1 to 0, and that countdown is the
 * whole mechanism: the receiver reads how many are still coming out of **every** fragment, so a gap
 * in the countdown names the fragment that never arrived, at the instant the next one lands, with
 * nothing waited for. That is what separates it from §10.34's RMNR (one round, reported back) and
 * §10.36's receipt bitmap (one validity window, reported back) — design §4.3's three granularities.
 */
import type { FrameDesc } from '../model/frames'
import type { RoundState, UwbDevice } from './device'
import { makeAncillary, makeAncillaryRcm, type UwbArcFields } from './frames'
import { ancillaryGrantFits, ancillarySlots } from './session'

/**
 * Which of the round's ranging responders sends the ancillary message: the first one, in the very
 * order the round's slots were laid out from.
 *
 * **It is a responder, and that is §10.35.1 rather than a quirk of this engine** — see this file's
 * header. The index is a model decision: the clause says an initiator of the ancillary exchange
 * sends the message, not which of several devices becomes one, and this simulator has no upper layer
 * to have a message to send. One sender per round, because the design builds one message
 * (design §4.2). model
 */
export const ANCILLARY_SENDER_INDEX = 0

/**
 * Everything one device holds for the ancillary exchange of the round in progress. Non-null exactly
 * when `roundCarriesAncillary` says this round runs the exchange — the same convention
 * `RoundState.mms` and `RoundState.m2m` follow.
 *
 * **All of it is per round, with no exception.** The two pieces of cross-round state on this branch
 * (`rcmBlock`, `openerReceipt`) exist because §10.34 and §10.36 are *about* something an earlier
 * round established. This clause is not: the whole message rides in one round's appended slots, so a
 * countdown that survived into the next round could only ever be a stale one, and a sender's drawn
 * placement belongs to the draw that made it.
 */
export interface AncillaryRoundState {
  /**
   * Sender: the appended-window index its run of fragments starts at, or null before it has
   * decided. Decided **once**, at the window's first slot — see `onAncillarySlot`.
   */
  start: number | null
  /** Sender: whether it has already decided (so the decision, and its random draw, happen once). */
  decided: boolean
  /** Receiver: the message number of the message in progress, or null before its first fragment. */
  messageNumber: number | null
  /** Receiver: the Frames Remaining of the last fragment it read; null before the first one. */
  lastRemaining: number | null
}

export function freshAncillary(): AncillaryRoundState {
  return { start: null, decided: false, messageNumber: null, lastRemaining: null }
}

/**
 * The message number this round's message carries (§10.35.2.1's Ranging Or Ancillary Message
 * Number): the block index, in one octet. Each initiator has one ancillary-information round per
 * block (`uwb/session.ts#roundsPerInitiator`), so counting blocks *is* counting messages — successive
 * messages get successive numbers, and the receiver uses the change to tell a new message's first
 * fragment from a stale reading of the last one (`onAncillaryRx`). Wrapped at 256 because the field
 * is one octet wide. model (the width is the standard's; which number goes in it is this engine's,
 * for want of an upper layer to number anything)
 */
export function ancillaryMessageNumber(r: RoundState): number {
  return r.block % 256
}

/**
 * Controller (the round's tag), slot 0 of the ancillary-information round: its RCM (standard
 * §10.35.1, ARC Ranging Round Usage = 3). How the round's slots are given out is in the RCM itself:
 *
 * - time schedule — an RDM IE with SIU = 1 (§10.32.9.8) assigning slots 1 … F (+1 for the request
 *   frame, when the sender asks for slots) to the sender, F being the session's message length or,
 *   once the controller has granted a request (§10.35.2.1), the granted count;
 * - contention schedule — an RCPS IE with one initiators' contention phase (Phase Indicator 0,
 *   §10.32.9.5) over the window `ancillarySlots` gives for that length.
 *
 * The window the controller announced is also how long it listens (`RoundState.ancillaryWindow`).
 */
export function transmitAncillaryRcm(dev: UwbDevice, r: RoundState, arc: UwbArcFields): void {
  const sender = ancillaryPeer(r)
  const frames = dev.ancillaryGrant() ?? r.plan.ancillaryFrames
  const requestFrames = r.plan.ancillaryRequest ? 1 : 0
  const window = ancillarySlots(r.plan, frames)
  r.ancillaryWindow = window
  const frame = r.plan.schedule === 'contention'
    ? makeAncillaryRcm(dev.id, r.block, r.round, arc, { kind: 'contention', firstSlot: 1, lastSlot: window })
    : makeAncillaryRcm(dev.id, r.block, r.round, arc, {
      kind: 'time', sender, slots: Array.from({ length: frames + requestFrames }, (_, i) => 1 + i),
    })
  dev.send(frame, null)
}

/**
 * Sender, on the ancillary round's RCM: how long its message is this time, read off the RCM.
 *
 * - time schedule — the slots the RDM IE assigned it, less the request frame's slot when it asks;
 * - contention schedule — the requested length if it has asked and the RCPS phase holds it plus the
 *   request frame, otherwise the session's own length.
 */
export function onAncillaryRcm(dev: UwbDevice, r: RoundState, frame: FrameDesc): void {
  if (dev.id !== ancillaryPeer(r)) return
  const requestFrames = r.plan.ancillaryRequest ? 1 : 0
  const u = frame.uwb
  if (u?.contention) {
    const window = u.contention.lastSlot - u.contention.firstSlot + 1
    r.ancillaryWindow = window
    const asked = dev.ancillaryAsked ? r.plan.ancillaryRequestSlots : null
    r.ancillaryFrames = asked !== null && window >= asked + requestFrames ? asked : r.plan.ancillaryFrames
    return
  }
  const assigned = (u?.rdm ?? []).filter((e) => e.id === dev.id).length
  r.ancillaryWindow = assigned
  r.ancillaryFrames = Math.max(0, assigned - requestFrames)
}

/**
 * One slot of the ancillary-information round after its RCM (standard §10.35.1; `AncillarySlotAction`).
 *
 * Three devices' worth of behaviour, and the branch order is the role inversion made explicit:
 *
 * - **the sender** — a ranging *responder*, this exchange's initiator. At the window's first slot it
 *   decides whether it sends at all and, under a contention schedule, draws where its run starts;
 *   in every slot its run covers, it puts one fragment on the air.
 * - **the receiver** — the ranging *initiator* (the controller), this exchange's responder. It
 *   listens through every slot of the window it announced.
 * - **everyone else** — the round's other responders, which have nothing to do here and leave their
 *   receivers off, exactly as they do in each other's Response slots.
 */
export function onAncillarySlot(
  dev: UwbDevice, slot: number, index: number, r: RoundState,
  peers: { tag: string; anchors: string[] },
): void {
  const a = r.ancillary
  if (!a) {
    throw new Error(
      `onAncillarySlot: slot ${slot} carries an ancillary fragment, and this round holds no ancillary state`,
    )
  }
  const sender = peers.anchors[ANCILLARY_SENDER_INDEX]
  if (sender === undefined) {
    throw new Error(
      `onAncillarySlot: slot ${slot} needs responder ${ANCILLARY_SENDER_INDEX}, and the round holds `
      + `${peers.anchors.length}`,
    )
  }
  if (dev.id === sender) {
    transmitAncillary(dev, slot, index, r, a)
    return
  }
  // The receiver — and only the receiver, through the window it announced. The wait is **silent**:
  // a fragment is one member of a message and the message is what evaluates it, and under a
  // contention schedule most of the window is empty by design; what names a loss is the countdown in
  // the *next* fragment (`onAncillaryRx`).
  if (dev.id === r.tagId && index < (r.ancillaryWindow ?? 0)) {
    dev.listenFor(slot, sender, 'uwbAncillary', slot + 1, true)
  }
}

/**
 * Sender: decide once, then put one fragment on the air in each slot its run covers.
 *
 * **The floor it has to clear**: this device must hold this ancillary round's RCM — the RCM is what
 * gave it slots at all (RDM) or opened the contention phase (RCPS). A sender that missed it stays
 * silent.
 *
 * **Where the run starts is where the two schedules part** (§10.35.1 allows either):
 *
 * - `'time'`: the first slot the RDM IE assigned it (index 0).
 * - `'contention'`: drawn, uniformly over every start in the RCPS phase that still holds the whole
 *   run, from this device's own stream.
 */
function transmitAncillary(
  dev: UwbDevice, slot: number, index: number, r: RoundState, a: AncillaryRoundState,
): void {
  const frames = r.ancillaryFrames
  // The run includes the request's own frame when the sender asks for slots (§10.35.2.1): the two
  // halves of the RAICT IE are different uses of one field, so the request cannot ride a fragment.
  const requestFrames = r.plan.ancillaryRequest ? 1 : 0
  if (!a.decided) {
    a.decided = true
    if (dev.holdsValidRcmFor(r) && r.ancillaryWindow !== null) {
      const starts = r.ancillaryWindow - (frames + requestFrames) + 1
      if (starts >= 1) a.start = r.plan.schedule === 'contention' ? dev.rng.int(starts - 1) : 0
    }
  }
  if (a.start === null) return
  const fragment = index - a.start
  if (requestFrames > 0 && fragment === frames) {
    requestSlots(dev, slot, r)
    return
  }
  if (fragment < 0 || fragment >= frames) return
  // Frames Remaining counts down to zero across the run (§10.35.2.1).
  const framesRemaining = frames - 1 - fragment
  dev.send(
    makeAncillary(
      dev.id, r.tagId, r.block, r.round, slot, true, true,
      { messageNumber: ancillaryMessageNumber(r), framesRemaining },
    ),
    null,
  )
}

/**
 * Sender: one frame asking the controller to schedule `ancillaryRequestSlots` slots for the next
 * exchange (standard §10.35.1's last sentence, §10.35.2.1's Request field). The RAICT IE carries
 * Request = 1, no message number, and Frames Remaining — the field §10.35.2.1 puts the count in.
 * The clause attaches the Request bit to the case "the initiator is not the controller", and here the
 * ancillary sender is a ranging responder while the controller is the ranging initiator.
 */
function requestSlots(dev: UwbDevice, slot: number, r: RoundState): void {
  dev.ancillaryAsked = true
  dev.send(
    makeAncillary(
      dev.id, r.tagId, r.block, r.round, slot, false, true,
      { framesRemaining: r.plan.ancillaryRequestSlots }, true,
    ),
    null,
  )
}

/**
 * Controller, on a request frame: decide what the next exchange gets, and say so in the record.
 *
 * **What it decides on is the ancillary round** (§10.35 defines no grant and no refusal, so the
 * policy is the model's): does the round — `plan.slots` long like every round, slot 0 its RCM — hold
 * the window the asked-for message needs (`ancillaryGrantFits`). Nothing here is a number somebody
 * picked.
 *
 * **A grant is sent with standard elements, and a refusal is silent.** §10.35.1 has the controller
 * "schedule" the slots, and the controller schedules slots with the RDM IE of the next ancillary
 * round's RCM (§10.32.9.8) — or, under contention, with that RCM's RCPS phase. A refused request
 * leaves the grant as it was; the asker reads the answer off the RCM it is given.
 */
function grantRequest(dev: UwbDevice, r: RoundState, from: string, requested: number): void {
  const fits = ancillaryGrantFits(r.plan, requested)
  if (fits) dev.setAncillaryGrant(requested)
  dev.emit({
    t: dev.now(), type: 'UWB_ANCILLARY', node: dev.id, peer: from, slot: r.slot,
    block: r.block, round: r.round,
    // A request reports no message number (§10.35.2.1's two uses are alternatives), so the record
    // carries the one this controller is already tracking for the block — the same number the
    // fragments of this very block used, which is what pairs the request with the message it
    // follows.
    messageNumber: ancillaryMessageNumber(r),
    // Frames Remaining is the requested count, and it is reported under its own name rather than
    // here: a reader who saw `framesRemaining: 6` on a request would read it as a countdown.
    framesRemaining: null, missing: [], complete: false,
    requestedSlots: requested, grantedSlots: fits ? requested : null,
  })
}

/**
 * Receiver, on a fragment: read the countdown, and name whatever the countdown proves is missing.
 *
 * **This is the acceptance of the whole slice.** The gap is computed here, inside the reception, and
 * nowhere else — no timer, no deadline, no comparison against the slot table. A receiver that last
 * read `prev` and now reads `remaining` is owed every number strictly between them, and those
 * numbers *are* the missing fragments: Frames Remaining is the only identifier the RAICT IE gives
 * one (there is no frame index and no total in the IE).
 *
 * **What it cannot do, and does not pretend to.** With no previous reading there is nothing to
 * compare against, so fragments lost *before* the first one that arrived are invisible — the IE
 * carries no total for the receiver to have expected them from. And the loss of the **last**
 * fragment leaves no next fragment to notice it, which is the one case `closeAncillary` below has to
 * report at a deadline instead. Both are written down because the alternative is a reader assuming
 * the field does more than it does.
 */
export function onAncillaryRx(dev: UwbDevice, r: RoundState, from: string, frame: FrameDesc): void {
  const a = r.ancillary
  if (!a) {
    throw new Error(`onAncillaryRx: a fragment from ${from} in a round that holds no ancillary state`)
  }
  const raict = frame.uwb?.raict
  // **A request is not a fragment, and the Request bit is the only thing that says so**
  // (§10.35.2.1): the one Frames Remaining field holds this message's remaining frames in one case
  // and the slots being asked for in the other, so a request fed to the countdown below would be
  // read as a message that jumped backwards. Routed here, before anything reads that field.
  if (raict?.request === true) {
    if (raict.framesRemaining === undefined) {
      throw new Error(
        `onAncillaryRx: a request frame from ${from} carries no slot count — the Request bit is set `
        + 'and Frames Remaining is where §10.35.2.1 puts the number',
      )
    }
    grantRequest(dev, r, from, raict.framesRemaining)
    return
  }
  // Every `uwbAncillary` frame is built by `makeAncillary`, which refuses to build one whose
  // presence bits and content disagree, and `transmitAncillary` above always sets both. So a
  // fragment without both fields is not one with something missing, it is one this branch should
  // never have been handed.
  if (raict === undefined || raict.messageNumber === undefined || raict.framesRemaining === undefined) {
    throw new Error(
      `onAncillaryRx: a 'uwbAncillary' frame from ${from} carries no message number and frames-remaining pair`,
    )
  }
  const { messageNumber, framesRemaining } = raict
  // A different message number is a different message, and the countdown starts over: the previous
  // message's last reading says nothing about this one, and carrying it forward is what would invent
  // a gap between two messages.
  if (a.messageNumber !== messageNumber) {
    a.messageNumber = messageNumber
    a.lastRemaining = null
  }
  const prev = a.lastRemaining
  const missing: number[] = []
  if (prev !== null) {
    // A countdown that did not go down. One sender, one message per round, no retransmission in this
    // engine and a fresh `RoundState` every round, so this cannot happen on purpose — and a silent
    // reconciliation here is precisely how a receiver would come to report a message it never got
    // (slice ledger, Ruling 9).
    if (framesRemaining >= prev) {
      throw new Error(
        `onAncillaryRx: ${from}'s message ${messageNumber} reports ${framesRemaining} frames remaining `
        + `after ${prev} — Frames Remaining counts down`,
      )
    }
    for (let k = prev - 1; k > framesRemaining; k--) missing.push(k)
  }
  a.lastRemaining = framesRemaining
  dev.emit({
    t: dev.now(), type: 'UWB_ANCILLARY', node: dev.id, peer: from, slot: r.slot,
    block: r.block, round: r.round, messageNumber,
    framesRemaining, missing, complete: framesRemaining === 0,
  })
}

/**
 * Receiver, at the round's end: the one record a **deadline** produces, and the only thing in this
 * file that is a deadline at all.
 *
 * It exists to be the measurement the acceptance is taken against. A message whose last fragment
 * was the one that went missing has no next fragment to notice the gap, so the countdown simply
 * stops short — and the earliest a receiver can know is when the message's own time is up, which in
 * this engine is the end of the round the fragments rode in (the ancillary window is the round's
 * tail, so the two instants are the same one). Every other loss is named at a *reception*, slots
 * earlier than this, and that difference is the point of the clause.
 *
 * Nothing is reported when the message completed (Frames Remaining reached 0) or when none of it
 * ever arrived: there is no message in progress to be owed anything.
 */
export function closeAncillary(dev: UwbDevice, r: RoundState): void {
  const a = r.ancillary
  if (!a || a.messageNumber === null || a.lastRemaining === null || a.lastRemaining === 0) return
  const missing: number[] = []
  for (let k = a.lastRemaining - 1; k >= 0; k--) missing.push(k)
  dev.emit({
    t: dev.now(), type: 'UWB_ANCILLARY', node: dev.id, peer: ancillaryPeer(r),
    slot: null, block: r.block, round: r.round,
    messageNumber: a.messageNumber,
    framesRemaining: null, missing, complete: false,
  })
}

/**
 * The sender this receiver's message came from, for the deadline record — which has no frame to read
 * an address off, because the whole of what it reports is a frame that never arrived.
 *
 * The round's own responder list is what answers it, the same list the fragments' slots were laid
 * out against (`ANCILLARY_SENDER_INDEX`). It **throws** rather than naming nobody: a deadline record
 * is only ever produced after at least one fragment arrived, so the sender exists by construction,
 * and a non-null assertion here would be no check at all.
 */
function ancillaryPeer(r: RoundState): string {
  const peer = r.anchors[ANCILLARY_SENDER_INDEX]
  if (peer === undefined) {
    throw new Error(
      `ancillaryPeer: responder ${ANCILLARY_SENDER_INDEX} of a round that holds ${r.anchors.length}`,
    )
  }
  return peer
}
