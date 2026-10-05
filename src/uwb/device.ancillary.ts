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
import { makeAncillary } from './frames'
import { ancillaryGrantFits, ancillarySlots } from './session'

/**
 * The §10.35.2.1 message type every fragment this engine builds reports.
 *
 * One constant, not a value table: this simulator has one kind of ancillary message to carry, and
 * the clause's own type values describe upper-layer content it has no upper layer to produce
 * (design §6 — the same reason `ancillaryFrames` is a scenario setting rather than something
 * derived). model
 */
export const ANCILLARY_MESSAGE_KIND = 1

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
 * when `blockCarriesAncillary` says this block runs the exchange — the same convention
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
 * Number): the block the message goes out in, in one octet.
 *
 * The exchange runs once per RCM validity window, at the window's opening block
 * (`blockCarriesAncillary`), so the block index *is* a per-message number — successive messages get
 * successive numbers, and the receiver uses the change to tell a new message's first fragment from a
 * stale reading of the last one (`onAncillaryRx`). Wrapped at 256 because the field is one octet
 * wide, which `raictIeBytes` is what prices. model (the width is the standard's; which number goes
 * in it is this engine's, for want of an upper layer to number anything)
 */
export function ancillaryMessageNumber(r: RoundState): number {
  return r.block % 256
}

/**
 * One slot of the appended ancillary window (standard §10.35.1; `AncillarySlotAction`).
 *
 * Three devices' worth of behaviour, and the branch order is the role inversion made explicit:
 *
 * - **the sender** — a ranging *responder*, this exchange's initiator. At the window's first slot it
 *   decides whether it sends at all and, under a contention schedule, draws where its run starts;
 *   in every slot its run covers, it puts one fragment on the air.
 * - **the receiver** — the ranging *initiator*, this exchange's responder. It listens through every
 *   slot of the window.
 * - **everyone else** — the round's other responders, which have nothing to do here and leave their
 *   receivers off, exactly as they do in each other's Response slots.
 */
export function onAncillarySlot(
  dev: UwbDevice, slot: number, index: number, r: RoundState,
  peers: { tag: string; anchors: string[] },
): void {
  const a = r.ancillary
  // The schedule laid out a slot for an exchange this round is not running. `blockSlots` and
  // `blockSlotAction` read the identical `blockCarriesAncillary`, so reaching this would mean the
  // schedule and the round state disagree about which block this is — not a state the model can be
  // in on purpose (slice ledger, Ruling 9).
  if (!a) {
    throw new Error(
      `onAncillarySlot: slot ${slot} carries an ancillary fragment, and this round holds no ancillary state`,
    )
  }
  const sender = peers.anchors[ANCILLARY_SENDER_INDEX]
  // A round with no responder at all cannot run the exchange: there is no device §10.35.1's
  // initiator could be. The scenario schema already demands anchors of a two-way session, so this is
  // the same class of impossible-on-purpose as above rather than a case to fall through.
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
  // The receiver — and only the receiver. The wait is **silent**: a fragment is one member of a
  // message and the message is what evaluates it, which is the division a P802.15.4ab fragment train
  // already follows (`Expectation.silent`). A `UWB_TIMEOUT` per lost fragment would also be the
  // wrong instrument for this clause specifically: under a contention schedule most of the window is
  // empty by design, so an empty slot there is the ordinary outcome rather than an unanswered one,
  // and what names a loss is the countdown in the *next* fragment (`onAncillaryRx`).
  if (dev.id === r.tagId) dev.listenFor(slot, sender, 'uwbAncillary', slot + 1, true)
}

/**
 * Sender: decide once, then put one fragment on the air in each slot its run covers.
 *
 * **The decision is made at the window's first slot**, not when the round opened and not when the
 * opener arrived, and the instant matters: every ranging slot of the round has already run by then,
 * so the contention draw below cannot move a single ranging frame — which is what leaves `UWB_RANGE`
 * field for field what it was with the exchange off, draws included.
 *
 * **The floor it has to clear is the one §10.34's RMNR frame and §10.36's confirmation both stand
 * on**: this device must still hold a valid control message from this initiator. The slots the
 * message rides in are appended to *that initiator's* round, and which round that is was settled by
 * that initiator's RDM IE (§10.32.9.8) — so a responder that never decoded one has no slot of its
 * own here, and speaking anyway would be speaking in somebody else's.
 *
 * **Where the run starts is where the two schedules part** (§10.35.1 allows either, and the design's
 * §5.4 asks for a difference that is visible on the air):
 *
 * - `'time'`: index 0. The window is exactly as wide as the message and the slot table names its
 *   owner, so there is nothing to decide.
 * - `'contention'`: drawn, uniformly over every start that still holds the whole run — the same shape
 *   `drawContentionSlot` draws a response slot with (§10.32.2 schedule mode 0), from this device's
 *   own stream. Nothing names an owner in a contention window, so a run that always began at index 0
 *   would be a scheduled placement wearing a contention label.
 */
function transmitAncillary(
  dev: UwbDevice, slot: number, index: number, r: RoundState, a: AncillaryRoundState,
): void {
  // The message's length **in this round**, which is the session's figure until a request has been
  // granted and the granted width after (`RoundState.ancillaryFrames`). Read here rather than off
  // the plan so that the run and the window the schedule laid out are sized from one number.
  const frames = r.ancillaryFrames
  // …and the run includes the request's own frame when the session asks for slots (§10.35.2.1):
  // the two halves of the RAICT IE are different uses of one field, so the request cannot ride a
  // fragment. 0 when nothing is being requested, which restores every expression below word for
  // word.
  const requestFrames = r.plan.ancillaryRequest ? 1 : 0
  if (!a.decided) {
    a.decided = true
    if (dev.holdsValidRcmFor(r)) {
      // How many starts hold the whole run: the window's width less the run, plus one. Both read
      // off the plan and this round's own width — `ancillarySlots` is the one definition of the
      // width, and it is what `blockSlots` laid the slots out from — so the draw cannot reach past
      // the window it was told about. One, exactly, under a time schedule and in the degenerate
      // contention case the window's own doc comment describes.
      const starts = ancillarySlots(r.plan, frames) - (frames + requestFrames) + 1
      if (starts < 1) {
        throw new Error(
          `transmitAncillary: a ${frames}-fragment message plus ${requestFrames} request frame(s) `
          + `does not fit the ${ancillarySlots(r.plan, frames)}-slot window this round appended for it`,
        )
      }
      a.start = r.plan.schedule === 'contention' ? dev.rng.int(starts - 1) : 0
    }
  }
  if (a.start === null) return
  const fragment = index - a.start
  // **The request's own slot: the one straight after the run of fragments** (§10.35.2.1). Under a
  // time schedule that is the window's last index, which is what `AncillarySlotAction.request`
  // names; under a contention one it is wherever this device's drawn run ends, which no slot table
  // can know — so the position is computed from the draw, here, in the one place that holds it.
  if (requestFrames > 0 && fragment === frames) {
    requestSlots(dev, slot, r)
    return
  }
  if (fragment < 0 || fragment >= frames) return
  // Frames Remaining counts down to zero across the run (§10.35.2.1), so the last fragment says
  // "none left" rather than being silent about it — which is what lets the receiver know the message
  // is complete without waiting for the slot after.
  const framesRemaining = frames - 1 - fragment
  // Both presence bits set, and both values supplied: `makeAncillary` checks the two against each
  // other rather than reconciling them (Task 1), so the frame's declared width and its content
  // cannot disagree. `null` for the ranging counter, exactly as an RMNR or MMRCM frame passes —
  // nothing in this frame is timed.
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
 * exchange (standard §10.35.1's last sentence, §10.35.2.1's Request field).
 *
 * **The presence bits are the third of `raictIeBytes`' four combinations, and not by coincidence.**
 * `framesRemainingPresent` is true because that field is where the clause puts the slot count;
 * `numberPresent` is false because a request is not part of any message and has no message number
 * to report — §10.35.2.1 lists the two uses of the IE as alternatives, and reporting a message
 * number here would be making one frame do both. 4 octets of IE, 15 of frame, all of it priced by
 * `raictIeBytes`/`uwbAncillaryBytes`, which this slice did not have to touch.
 *
 * **Why this device is allowed to ask at all is §10.35.1 rather than a model choice.** The clause
 * attaches the Request bit to the case 「the initiator is not the controller」, and in this engine
 * the ancillary sender is a ranging *responder* (`ANCILLARY_SENDER_INDEX`) while the controller is
 * the ranging initiator. So the condition holds by construction, which is why no rule anywhere
 * checks it — and it is the first concrete thing the role inversion this file's header describes
 * ever earns a device.
 */
function requestSlots(dev: UwbDevice, slot: number, r: RoundState): void {
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
 * **What it decides on is the block, and only the block** (design §3.5). §10.35 defines no grant,
 * no refusal and no response, so a policy is the model's to choose and the only honest one is the
 * arithmetic the engine and the scenario schema already each do: does a block hold a round of
 * `plan.slots`, plus the receipt confirmation's batch, plus the window the asked-for message needs
 * (`ancillaryGrantFits`). Nothing here is a number somebody picked.
 *
 * **A refusal is silent, and visible anyway.** There is no frame to send back — the clause defines
 * none, and inventing one would put semantics in this repository that the standard does not have —
 * so a refused request leaves the grant as it was and the next exchange runs at the session's own
 * width. The asker reads the answer off the width of the window it is given, because both ends read
 * the same slot table. That is a property of this engine, not of the clause, and the lesson says so.
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
    // follows. `messageKind` likewise: one kind in this engine.
    messageNumber: ancillaryMessageNumber(r), messageKind: ANCILLARY_MESSAGE_KIND,
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
    block: r.block, round: r.round, messageNumber, messageKind: ANCILLARY_MESSAGE_KIND,
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
    messageNumber: a.messageNumber, messageKind: ANCILLARY_MESSAGE_KIND,
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
