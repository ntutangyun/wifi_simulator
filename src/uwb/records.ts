/**
 * UWB timeline records. They join the Wi-Fi ones in TLRecord, so the player,
 * the event log and the view reducer replay one single ordered stream.
 */
import type { UwbMode } from '../model/scenario'
import type { Ns } from '../model/types'
import type { UwbFrameKind } from './frames'

/** How a fix was solved: from two-way ranges, from downlink or uplink time differences, or
 * from an angle. The record carries it so one overlay, one log line and one inspector row can
 * say which of the four produced the position they are showing. */
export type UwbFixMethod = 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'aoa'

/** What a `UWB_MMS_TRAIN` carries for `rxDbm` and `marginDb` when nothing of the train was
 * heard: a received power no receiver could ever report, in place of the −Infinity the
 * arithmetic would give and JSON cannot carry. model */
export const NOTHING_HEARD_DBM = -999

export type UwbRecord =
  /** A ranging round: the round's shape, what it measures and the deadline of its last slot.
   * Opened by the tag's Poll in two-way ranging, by anchor 0's Poll in DL-TDoA (where every
   * listening tag emits one of these for the one round the anchors run). */
  | { type: 'UWB_ROUND'; node: string; block: number; round: number; slots: number; slotNs: Ns; method: 'ss' | 'ds'; mode: UwbMode; untilNs: Ns }
  /** The round has moved to this ranging slot. */
  | { type: 'UWB_SLOT'; node: string; slot: number; untilNs: Ns }
  /** A ranging counter reading: the RMARKER of a transmitted or received frame. */
  | { type: 'UWB_TS'; node: string; dir: 'tx' | 'rx'; peer: string; frameKind: UwbFrameKind; counter: number; fom?: number }
  /** One finished range to a peer, with the geometric truth beside it. `integrity` is present
   * only in an MMS round that carries an integrity train (Y > 0): it says whether that train
   * was detected, i.e. whether the scrambled-timestamp segments vouched for the range. */
  | { type: 'UWB_RANGE'; node: string; peer: string; method: 'ss' | 'ds'; tofRctu: number; tofRawRctu?: number; distM: number; trueDistM: number; fom: number; block: number; round: number; integrity?: boolean }
  /** One time difference of arrival: how much later the peer's message arrived than the
   * reference's, with the geometric truth beside it. `dtNs` is the measurement after every
   * correction the mode applies. In DL-TDoA the listening tag measures it and `trueDtNs` is
   * (d(node, peer) − d(node, ref)) / c; in UL-TDoA the infrastructure measures a *tag's* blink,
   * so `node` is the reference anchor, `of` names the tag, and the truth is about the tag:
   * (d(of, peer) − d(of, ref)) / c. */
  | { type: 'UWB_TDOA'; node: string; ref: string; peer: string; dtNs: number; trueDtNs: number; block: number; round: number; of?: string }
  /** One bearing: the azimuth an anchor measured to a tag from the phase difference between
   * its two antennas, in degrees from its own boresight (positive to its left), with the
   * geometric truth beside it. Emitted at the anchor, once per frame it received from the tag
   * in the round — and, behind the anchor, mirrored into the front half by the physics of a
   * two-element array (src/uwb/aoa.ts), which is exactly what `trueThetaDeg` is there to show. */
  | { type: 'UWB_AOA'; node: string; peer: string; thetaDeg: number; trueThetaDeg: number; block: number; round: number }
  /** A 2-D fix solved from this block's ranges or time differences. `method` says which, and
   * `of` names the node the fix is *about* when that is not `node` itself (UL-TDoA, where the
   * infrastructure solves a tag's position). */
  | { type: 'UWB_POSITION'; node: string; x: number; y: number; trueX: number; trueY: number; gdop: number; ellipse: { a: number; b: number; thetaRad: number }; anchors: string[]; block: number; method: UwbFixMethod; of?: string }
  /** A slot passed with no answer from the peer it was scheduled for. */
  | { type: 'UWB_TIMEOUT'; node: string; slot: number; peer: string; expected: UwbFrameKind }
  /**
   * Standard §10.34: a responder that **holds a still-valid control message** (the RCM an earlier
   * block's Poll carried, kept alive by that message's RCM Validity Rounds — §10.32.9.1) but did
   * **not** receive this round's ranging initiation message, saying so in the slot its Response
   * would have occupied.
   *
   * Emitted at the **initiator**, on the frame's arrival, because what the exchange changes is
   * what the initiator knows. A silent slot leaves one `UWB_TIMEOUT` and three explanations the
   * initiator cannot tell apart: this responder never heard me, it answered and the answer was
   * lost, it is gone. This record is the first of those three, named — and it says the second
   * thing too, by existing at all: the responder still holds the control message, which is what
   * sending the frame implicitly confirms (design §3).
   *
   * It carries no measurement, because the frame carries none: the RMNR IE has no Content field at
   * all, so everything the exchange says is said by *who* transmitted, *where* (the slot the
   * still-valid control message gave it) and *what it sent instead of* a timed response. `slot`,
   * `block` and `round` are those three coordinates; there is nothing else to report.
   */
  | { type: 'UWB_RMNR'; node: string; peer: string; slot: number; block: number; round: number }
  /**
   * Standard §10.36: a responder confirming, in one frame (the MMRCM, carrying an RMMRC IE), which
   * of this initiator's openers inside the current RCM validity window it actually received. The
   * request is free — bit 15 of the ARC IE's Content Control word, §10.32.9.1 — and this record is
   * the answer arriving.
   *
   * Emitted at the **initiator**, on the frame's arrival, for the same reason `UWB_RMNR` is: what
   * the exchange changes is what the initiator knows. Before it, a device knew what it had worked
   * out and not who had heard it (design §2/§4); after it, `received[i]` says whether
   * window-round `i`'s opener got through, and a zero bit names the block whose opener was lost —
   * which `UWB_TIMEOUT` could only report as an absence.
   *
   * `received` is **this** initiator's own entry of the MMRC list, not the whole list: one frame
   * may answer several initiators at once (`initiators` counts them), and each of them learns only
   * its own row. `windowRounds` is the window's length R, carried so a reader can check the bitmap
   * covers exactly the window it claims to rather than take `received.length` on trust.
   *
   * It carries no measurement, because the frame carries none: a receipt confirmation is an extra
   * message, not part of the ranging (`src/uwb/ranging.ts` is untouched by this slice).
   */
  | { type: 'UWB_MMRCM'; node: string; peer: string; slot: number; block: number; round: number; windowRounds: number; received: boolean[]; initiators: number }
  /**
   * Standard §10.32.8.2: an SP3 marker arrived, and **which responder it came from was read off the
   * slot it arrived in** — the only place that answer exists. An SP3 packet is SYNC + SFD + STS: no
   * PHR, no PSDU, so no address field and no timestamp field either. Nothing in the frame says who
   * sent it.
   *
   * So `peer` is not a fact about the frame; it is the schedule's answer, the device the round's
   * RDM IE (§10.32.9.8) gave this slot to, as `slotAction` reads it. That is the whole of the
   * lesson this record exists to make readable, and it is also what makes it falsifiable: shuffle
   * the slot table and this field changes while the air does not.
   *
   * Emitted at the **initiator**, on the marker's arrival. It carries no measurement — the
   * counter it was stamped with is already in this round's `UWB_TS`, and the time the marker
   * measures does not come back until the data report phase a slot or more later, which is the
   * other half of why the packet can be this short.
   */
  /**
   * Standard §10.35: one fragment of a ranging ancillary information message, **as the receiver
   * read it** — and, when the countdown proves one, the fragment that never came.
   *
   * Emitted at the **receiver**, which in this clause is the *ranging initiator*: §10.35.1 defines
   * the ancillary initiator as the device that **sends** the ancillary information and the ancillary
   * responder as the one that receives it, the opposite way round from their ranging roles. So
   * `node` is the tag and `peer` an anchor, and that inversion is the thing about this record a
   * reader will first mistake for a bug.
   *
   * **`missing` is what the slice exists for.** `framesRemaining` is the RAICT IE's own Frames
   * Remaining field (§10.35.2.1), carried by *every* fragment, counting down to 0 at the last one.
   * A receiver that read 3 and now reads 1 therefore knows the fragment that would have said 2 never
   * arrived — at this reception, with nothing waited for — and `missing` lists exactly those
   * numbers. They are named by their own Frames Remaining value because that is the only identifier
   * the IE gives a fragment: there is no frame index field and no total, which is also why a
   * *leading* fragment lost before the first one that arrived cannot be named at all (there is
   * nothing to compare against) and why `missing` is empty in that case rather than guessed at.
   *
   * Compare the other two granularities this engine already has, which is the comparison the lesson
   * turns on: §10.34's RMNR reports one round, §10.36's bitmap reports a whole validity window, and
   * both are reports *sent back afterwards*. This one is carried by the sender in every fragment, so
   * the receiver needs no report and no timer.
   *
   * **Two shapes, told apart by `slot`.** A reception carries the slot it arrived in and its own
   * `framesRemaining`. The one record a *deadline* produces — the round's end, with a message still
   * unfinished, which is the only thing left when it was the **last** fragment that was lost —
   * carries `null` for both, `complete: false`, and the fragments still owed in `missing`. That pair
   * is what makes the timing measurable inside the record stream rather than argued about.
   *
   * It carries no measurement, because the frame carries none: an ancillary fragment is not timed
   * at all (`src/uwb/ranging.ts` is untouched by this slice), which is also why switching the
   * exchange on leaves every `UWB_RANGE` of the round field for field as it was.
   *
   * `messageKind` is the §10.35.2.1 message type the Request = 0 half also reports. This engine
   * builds one kind of ancillary message, so it is a constant rather than a value table
   * (`ANCILLARY_MESSAGE_KIND`, design §6). model
   *
   * **A third shape, and the two fields that are its whole difference** (Request = 1,
   * §10.35.2.1; slice 3d): a controller that has just read a slot request emits this record with
   * `requestedSlots` — what the Frames Remaining field asked for — and `grantedSlots` — what it is
   * going to schedule, or `null` when it is scheduling nothing because the block does not hold it
   * (`uwb/session.ts#ancillaryGrantFits`). That `null` is the **refusal**, and it is the only place
   * in this engine where §10.35 is answered by something the clause does not define: the clause
   * gives a request and nothing else, no grant, no refusal and no response at all, so a controller
   * that drops a request is conformant and what this one does instead is model.
   *
   * **Both are absent, not `undefined`, on every other record** — and that is a hash invariant,
   * not a style preference. `tests/engine/uwb-record-hashes.test.ts#serialiseRecord` takes fields
   * with `Object.keys`, so a key explicitly assigned `undefined` is folded into the hash (as the
   * text `undefined`) while a key never assigned is not. Written as
   * `...(request ? { requestedSlots } : {})`, the shape `roundPlan` uses for `mms` and `UwbDevice`'s
   * constructor for `attacker`/`stsOff`.
   *
   * No measurement here either. A request is not timed, it is a frame in an appended slot, and the
   * grant it earns changes how many slots the *next* exchange gets — which the reader sees as the
   * first number of the next block's Frames Remaining countdown, not as anything in this record.
   */
  | { type: 'UWB_ANCILLARY'; node: string; peer: string; slot: number | null; block: number; round: number; messageNumber: number; messageKind: number; framesRemaining: number | null; missing: number[]; complete: boolean; requestedSlots?: number; grantedSlots?: number | null }
  | { type: 'UWB_SP3'; node: string; peer: string; slot: number; block: number; round: number }
  /**
   * Standard §10.32.8.1's third phase, arriving: **one frame of the data report phase, as the
   * device that received it read it** — and what the round's SRRR IE (§10.32.9.9) got that frame to
   * carry.
   *
   * One record type for one phase, in both of its directions, because §10.32.8.2's Figure 10-242
   * draws one phase with frames going both ways. Which fields are present says which frame this
   * was, and each of them is present exactly when it arrived:
   *
   * - `replyRctu` — a **responder's** report (at the initiator). Always there in that direction: a
   *   deferred round has no other route for the reply time at all (§10.29.6.3), so it is not
   *   something SRRR gates.
   * - `thetaDeg` — the bearing that responder measured, present exactly when the RAOA bit asked for
   *   one. In this engine the antenna array is on the anchors, so the bearing travels with the
   *   responder's report rather than with the initiator's.
   * - `roundTripRctu` — the **initiator's** report (at a responder), present exactly when the RRTT
   *   bit asked for it. It is this responder's own entry of that frame's RMI IE, never the whole
   *   list: one frame answers every responder that asked, and each learns only its own round trip.
   *
   * The record exists so that a request's effect is visible as something *arriving* rather than
   * only as more octets on the air. A report frame that grew and delivered nothing is the same
   * class of defect as a request that goes on the air and is never answered — which is exactly what
   * the RRTT bit was until the initiator's own frame was built (design §4.1).
   *
   * `peer` is read off the slot, like `UWB_SP3`'s, in both directions: a report's slot is the one
   * the same RDM IE gave that device, and the slot is what pairs the report with a marker that had
   * no address to pair on.
   */
  | { type: 'UWB_SP3_REPORT'; node: string; peer: string; slot: number; block: number; round: number; replyRctu?: number; thetaDeg?: number; roundTripRctu?: number }
  /** Contention round (standard §10.32.2 schedule mode 0): an anchor that decoded the Poll drew
   * the response slot it will answer in — `slot` null when its retry budget ran out and it sits
   * this round out, and `attempt` counts from 1 (0 while sitting out). */
  | { type: 'UWB_CONTEND'; node: string; slot: number | null; attempt: number }
  /** Contention round: the tag lost the response slot to overlapping answers. Emitted once per
   * slot, at the tag, whenever a response in it failed under the medium's capture rule — so a
   * slot where one anchor was captured 6 dB above another is counted too: a response was lost. */
  | { type: 'UWB_CONTEND_COLLISION'; node: string; slot: number }
  /** The tag's round is over (emitted after any UWB_POSITION it produced): the radio goes
   * off until the next block, and the view's `slot` returns to null. */
  | { type: 'UWB_ROUND_END'; node: string; block: number; round: number }
  /** P802.15.4ab: a narrowband transmission that never happened. The device sampled the
   * channel's foreign power before transmitting (the draft's listen-before-talk) and found it
   * at or above the energy-detection threshold, so it transmits nothing on narrowband for the
   * rest of the block. Emitted on a **busy** check only — a clear one is the ordinary case and
   * says nothing. */
  | { type: 'UWB_NB_LBT'; node: string; channel: number; foreignDbm: number; thresholdDbm: number; block: number; round: number }
  /**
   * P802.15.4ab: what one receiver made of one peer's fragment train, at the slot after that
   * train's last fragment. `fragments` is how many the train held (X for an RSF train, Y for an
   * RIF one) and `heard` how many arrived; `gainDb` is what those combine to (10·log10(heard)),
   * and `marginDb` how far the combined train clears the receiver's sensitivity — the number
   * the whole multi-millisecond idea is about. `marginDb = rxDbm + gainDb − UWB_RX_SENS_DBM`
   * holds whenever anything was heard at all, and only then: a train nothing was heard of
   * carries the sentinel below in both `rxDbm` and `marginDb`, and the identity says nothing
   * about it.
   *
   * `rxDbm` is one fragment's received power (they are equal in a static scene, so the first
   * heard one stands for the train). **Sentinel**: a train nothing was heard of has no received
   * power and no margin at all, and both fields carry `NOTHING_HEARD_DBM` (−999 dBm) rather than
   * −Infinity or null — every timeline record is serialised to JSON for the view and the
   * fixtures, and neither of those survives a round trip.
   *
   * `ratioPpm` is the clock ratio the train measured against this receiver's own crystal, minus
   * one, in ppm — null when fewer than two fragments were heard, which is the case the range
   * falls back to the narrowband carrier estimate in.
   *
   * That ratio is also what the train's `UWB_TS` is walked back with when the leading fragments
   * were lost: the RMARKER is `index` of the *peer's* milliseconds before the first fragment
   * that did arrive, and this receiver counts its own (`rmarkerFromFragment`, src/uwb/mms.ts).
   * With no ratio to scale by, the nominal millisecond leaves `index` × 1 ms × the offset
   * between the two crystals — 3.0 m of range per lost leading fragment at 20 ppm.
   *
   * `responders` is present only in a **one-to-many** round (P802.15.4ab): the ids of every
   * responder that round holds, in slot order. It is what says that the initiator's train in
   * this record went out once and was heard by all of them — a pair round has no such list, and
   * its record carries no such field.
   */
  | { type: 'UWB_MMS_TRAIN'; node: string; peer: string; kind: 'rsf' | 'rif'; fragments: number; heard: number; rxDbm: number; gainDb: number; marginDb: number; detected: boolean; ratioPpm: number | null; block: number; round: number; responders?: string[] }
  /** A reception that nothing else on the UWB medium spoiled was still lost, to in-band
   * Wi-Fi power: the worst signal-to-interference ratio over the frame fell below
   * `UWB_SIR_MIN_DB`. Emitted at the receiver, straight after that frame's RX_FAIL, so
   * the coexistence lesson can count what the 6 GHz link costs the ranging session. */
  | { type: 'UWB_INTERFERED'; node: string; from: string; foreignDbm: number; sirDb: number }
  /** The scrambled timestamp sequence did its job: this reception's leading edge arrived
   * `advanceNs` earlier than the geometry allows — a relay in the middle — and the sequence the
   * session's key generates did not correlate at that edge, so the receiver threw the stamp away
   * instead of ranging on it. Emitted at the receiver, in place of the `UWB_TS` it did not take;
   * the slot's own deadline then reports the miss as it always does. Only a session that carries
   * `uwb.attacker` and leaves `uwb.stsOff` off can produce one. model */
  | { type: 'UWB_STS_REJECT'; node: string; peer: string; frameKind: UwbFrameKind; advanceNs: number }
  /**
   * A PPDU came home a second way — off one of the scenario's reflecting objects — and this
   * receiver wrote down what that second arrival implies. **Sensing**, in one record.
   *
   * `node` is the receiver, `from` the transmitter, and `scattererId` the object the echo
   * bounced off: a bistatic measurement names three places, not two.
   *
   * `resolvable` is the interesting field, not the range. It says whether this receiver's PHY
   * could tell the echo from the direct path at all, and it is exactly `excessM > resolutionM`
   * — both of which the record carries so a reader can do the comparison rather than take the
   * verdict on trust. `resolutionM` is `c / B` of the PHY the frame went out on: 0.60 m for the
   * 499.2 MHz HRP UWB PHY, some 120 m for a 2.5 MHz narrowband message, which is why a
   * narrowband receiver resolves nothing in any room. An object standing on the line between
   * the two ends adds no excess path, so `excessM` is 0 and `resolvable` is false — it is
   * **invisible**, to real equipment as much as to this model, and that is design §4's whole
   * teaching point.
   *
   * `pathM` is the bistatic range |TX→S| + |S→RX| the echo implies and `propNs` its flight time,
   * `pathM / c`, never smaller than the direct ray's (the triangle inequality).
   *
   * **What no record of this kind can say**: that an echo arrived but was too weak to be used.
   * The medium hands an echo over only when it clears the direct path's own sensitivity, and
   * this engine has no separate sensing floor to compare against — so a faint echo produces
   * silence, not a record saying it was faint.
   */
  | { type: 'UWB_ECHO'; node: string; from: string; scattererId: string; pathM: number; propNs: number; excessM: number; resolutionM: number; rssiDbm: number; resolvable: boolean }
  /**
   * Standard §10.45 (a P802.15.4ab **draft** clause — see `phy.ts`'s `ssbdBoundNs` comment and
   * `docs/superpowers/specs/2026-10-03-ssbd-design.md` §0.1, since §10.45 does not exist in the
   * published IEEE Std 802.15.4-2024): one spectrum-sensing-based-deferral attempt, at the slot it
   * ran in.
   *
   * `nb` and `bf` are the algorithm's own two counters at the moment of this CCA (NB counts this
   * attempt's busy checks so far, BF is the backoff factor that CCA's wait was drawn against —
   * both reset to their initial values at the start of a fresh attempt). `drawnUnits` is the
   * number of backoff units `random(BF)` actually drew (CID 489/493); `backoffNs` is that draw
   * converted to nanoseconds and clamped against the narrowband window's own room
   * (`nbSlotSlackNs`) — the two can differ, and when they do `outcome` says `'clamped'`.
   *
   * `outcome`: `'idle'` — the CCA came back clear and the MAC transmits; `'txOnEnd'` — NB passed
   * `maxBackoffs` and the configured end action is to transmit anyway (§1.2); `'failOnEnd'` — the
   * same, but the end action is Failure, so no narrowband transmission follows; `'clamped'` — the
   * draw itself had to be cut down to fit the window before any CCA ran at all (the window's own
   * slack was already too small, independent of how the CCA came back).
   *
   * Emitted at the device running the algorithm, in **every narrowband transmit slot, not once a
   * block** (contrast `UWB_NB_LBT`, which this record does **not** replace: a session with `ssbd`
   * off keeps emitting `UWB_NB_LBT` exactly as it always has, byte for byte).
   *
   * One record per CCA that *decided* something, which is the CCA that ends the attempt plus any
   * whose draw had to be clamped — and not the busy ones the loop simply continues past, because
   * the four outcomes above are the four endings and a continuing busy check has none of them. It
   * is not lost either: the ending record's own `nb` is how many busy checks preceded it.
   * (`device.mms.ts#ssbdAttempt` is the one place this rule is implemented.)
   */
  | {
    type: 'UWB_SSBD'; node: string; block: number; round: number; slot: number; channel: number
    nb: number; bf: number; drawnUnits: number; backoffNs: Ns; foreignDbm: number; thresholdDbm: number
    outcome: 'idle' | 'txOnEnd' | 'failOnEnd' | 'clamped'
  }
