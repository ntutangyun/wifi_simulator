/**
 * One HRP UWB ranging device — an anchor or a tag — driven entirely by the
 * session schedule (src/uwb/session.ts). It is a radio (UwbRadio) and a small
 * state machine. In a time-scheduled session it never contends for the medium,
 * because the session has already decided who transmits in every slot; in a
 * contention session (standard §10.32.2 schedule mode 0) the schedule reserves a
 * response window instead, and every anchor draws a slot in it from its own
 * stream — so two anchors can land in one slot and lose each other there.
 *
 * The state it shows on its lane is the Wi-Fi MAC_STATE vocabulary, so one
 * timeline reducer covers both technologies:
 *   idle     — between its slots; the receiver is off (that is what makes UWB
 *              ranging cheap: a tag listens for microseconds per block)
 *   uwbWait  — a slot it expects a frame in, receiver on, deadline armed
 *   rx       — a PPDU is arriving
 *   tx       — radiating; half-duplex, so listening() is false
 *
 * Every measurement is a pair of ranging counters (standard §10.29.1): the
 * transmitter stamps the RMARKER it is about to send, the receiver stamps the
 * RMARKER it saw. Only the receive stamps carry noise — a transmitter knows
 * exactly when it fires — so a round trip carries √2·σ_ts, not 2·σ_ts, and the
 * range, which halves it, carries σ_ts/√2 (see `rangeSigmaM`).
 *
 * This file holds the core state machine, config and two-way ranging (SS/DS-TWR)
 * logic, and every export the rest of the codebase imports from `./device`.
 * DL-/UL-TDoA lives in `./device.tdoa`, the P802.15.4ab MMS cycle in
 * `./device.mms`, many-to-many ranging (standard §10.32.6/§10.32.7) in
 * `./device.m2m`, and range/position record emission in `./device.report` —
 * each of them reached from this file by a branch on the round's own mode.
 */
import type { EventQueue } from '../engine/events'
import type { Rng } from '../engine/rng'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName, RxFailReason } from '../model/records'
import type { Ns, Vec3 } from '../model/types'
import type { UwbChannel, UwbRadio, UwbRxInfo } from './channel'
import { counterDiff, gaussian, type UwbClock } from './clock'
import {
  makeBlink, makeFinal, makeInit, makeMmrcm, makePoll, makeReport, makeResp, makeRmnr, makeSsDefer,
  UWB_BROADCAST, type UwbFrameKind, type UwbMmrcEntry,
} from './frames'
import { onDlRx, onDlSlot, onUlSlot, solveTdoaFix, solveUlFix as solveUlFixImpl, transmitDl, ulArrivalNs as ulArrivalNsImpl, type DlRoundState } from './device.tdoa'
import { freshMms, onMmsRx, onMmsSlot, solveMmsFix, type MmsRoundState } from './device.mms'
import { freshM2m, onM2mRx, onM2mSlot, transmitM2m, type M2mRoundState } from './device.m2m'
import { measureAoa, reportRange } from './device.report'
import { RCTU_NS, tsSigmaNs, UWB_RMARKER_NS, uwbMaxMmrcmInitiators, uwbSinrDb, type UwbChannelNo } from './phy'
import { rangeSigmaM, solvePosition, type AnchorPos } from './position'
import { dsTwr, fomFor, ssTwrCorrected, ssTwrRaw } from './ranging'
import { blockCarriesRcm, type MmrcmSlotAction, type RoundPlan, type SlotAction } from './session'

/** Per-device settings. The TWR method is NOT here: a round's `RoundPlan` is the
 * one truth about how that round is measured, and the device reads it from there. */
export interface UwbDeviceCfg {
  role: 'anchor' | 'tag'
  pos: Vec3
  tsNoisePs: number
  cfoNoisePpm: number
  /** Contention rounds only: this anchor's retry budget. The Poll's RCMA IE advertises the same
   * number, but the anchor reads it from here - every device in a session is configured from the
   * one session config, so the two cannot disagree today. An anchor spends one attempt per round
   * its response is not acknowledged by a range, and sits a round out when the budget is empty.
   * Ignored entirely by a time-scheduled round.
   *
   * Model: the budget is **one per anchor across every tag's rounds**, not one per (anchor, tag).
   * With several tags in a session, a miss in tag A's round can sit the anchor out of tag B's next
   * round. Nothing shipped is affected (the contention lesson has one tag); keying `attemptsLeft`
   * by tag id is the change a multi-tag contention lesson would need. */
  maxAttempts: number
  /**
   * Two-way ranging, responder: when this device holds a still-valid control message but did not
   * receive **this** round's ranging initiation message, send the ranging message non-receipt
   * frame in its own slot instead of sitting silent there (standard §10.34; `makeRmnr`).
   *
   * Read from here rather than off the round plan for the same reason `maxAttempts` above is: the
   * whole session is configured from one `UwbSessionCfg`, so the two cannot disagree today, and
   * what this decides is a device's own behaviour in its own slot rather than the shape of the
   * round (the slot table is untouched — `tests/uwb/rcm-validity-schedule.test.ts`).
   *
   * False — the default — leaves a responder that missed the initiation message exactly as silent
   * as it always was, and not a draw of any device's random stream moves.
   */
  rmnr: boolean
  /** DL-TDoA only: the listening tag measures its own clock rate against the round's Poll-to-Final
   * interval before it differences its arrival times. Off, it keeps its raw counter differences —
   * and up to ±20 ppm of crystal error over a whole round is metres of position error. */
  tdoaClockCorrection: boolean
  /** UL-TDoA only, anchor: this anchor's own residual calibration error to the infrastructure's
   * common timebase, in nanoseconds — one number, drawn once when the network is built (model:
   * "wired sync", the anchors' clocks are disciplined to one another, and what a real deployment
   * cannot calibrate away is this leftover). It is a fixed bias, not a per-round draw: a miscalibrated
   * anchor is wrong the same way in every round, which is exactly what makes it hard to spot. */
  syncOffsetNs: number
  /** UL-TDoA only: the session's 1-σ for the draw above — how well the anchors are calibrated,
   * as opposed to how wrong this one happens to be. The fix's error ellipse is drawn from it. */
  syncErrorNs: number
  /** Two-way ranging, anchor: measure the angle of arrival of every frame this device receives
   * from the tag (see `measureAoa`). Off — the default — nothing about the device changes, not
   * even the random stream it draws from. */
  aoa: boolean
  /** Anchor: the direction its antenna array faces, in degrees counter-clockwise from +x. Every
   * bearing it measures is relative to this, and so is the ±90° it can see at all. */
  yawDeg: number
  /** The session's channel: the wavelength an angle of arrival is measured in. */
  channel: UwbChannelNo
  /** Model, security: a relay between this device and its peers that makes every reception's
   * leading edge land `advanceNs` early. Absent — the default — there is no attacker, and not a
   * draw of this device's random stream moves. */
  attacker?: { advanceNs: number }
  /** Model, security: this session's frames carry no scrambled timestamp sequence, so a relayed
   * edge has nothing to fail to correlate against and is stamped at face value. */
  stsOff?: boolean
}

export interface UwbGeometry {
  /** 3-D separation of two nodes from the scenario: the truth a range is scored against. */
  trueDistM: (a: string, b: string) => number
  /**
   * An anchor's surveyed position, as the tag's solver knows it — and, in UL-TDoA, the tag's own
   * entry too: the infrastructure solves for a device whose height it assumes (every 2-D TDoA
   * deployment configures one) and scores the fix against where the scenario actually put it.
   */
  anchorPos: (id: string) => AnchorPos
}

export type UwbDeviceState = Extract<MacStateName, 'idle' | 'uwbWait' | 'rx' | 'tx'>

/**
 * Whether the frame that just arrived is the one this slot's wait was armed for. Exactly
 * `exp.kind === kind`, with one deliberate exception.
 *
 * **Standard §10.34**: the ranging message non-receipt frame arrives in the slot a Response should
 * have occupied, from the very responder that slot belongs to — "where a response should have been"
 * is the whole of what it says, since its IE carries no Content field at all (design §3). So the
 * wait for that Response is what accepts it; arming a second expectation for it would mean the
 * initiator had to know in advance which of the two was coming, which is exactly what it does not
 * know and exactly what the frame is there to tell it.
 *
 * It is a frame kind the responder never sends unless the session asked for it
 * (`UwbDeviceCfg.rmnr`), so no session that has it off can meet this clause.
 */
function expectationAccepts(exp: Expectation, kind: UwbFrameKind): boolean {
  return exp.kind === kind || (kind === 'uwbRmnr' && exp.kind === 'uwbResp')
}

/** A slot action that names a frame — every one but the MMS layout's `idle`. Its `kind` is a
 * `UwbFrameKind`, which is what lets one `listenFor` serve every mode. */
export type ScheduledAction = Exclude<SlotAction, { kind: 'idle' }>

/** The frame this device is waiting for in the slot it is in. */
interface Expectation {
  slot: number
  /** Null in an open slot, where the sender is not known in advance. */
  from: string | null
  kind: UwbFrameKind
  /**
   * The slot at whose *start* the wait expires. One slot on for every frame of a 4z round —
   * its deadline is the end of its own slot — and two for a P802.15.4ab narrowband message,
   * which the draft gives a two-slot window because a 608 µs PPDU does not fit one.
   */
  until: number
  /**
   * The slot is open: any anchor of the round may answer in it, and none has to.
   * True only in a contention round's response phase, where the slot belongs to
   * whoever drew it. An open slot that stays silent is the ordinary outcome of
   * the draw, not a peer that failed to answer, so it reports no UWB_TIMEOUT —
   * there is no peer the record could name.
   */
  open: boolean
  /**
   * Report nothing when this wait expires. The slot belongs to exactly one named peer — so
   * `open` would be wrong — but a miss is not worth a record: one fragment of a train of
   * sixteen is counted by the train's own evaluation, and a UWB_TIMEOUT per lost fragment
   * would bury every other record in the log.
   */
  silent: boolean
}

/** What a tag remembers about one anchor inside the round in progress. */
interface PeerMeasurement {
  id: string
  rxRespCounter: number
  coffs: number
  fom: number
  /** Poll→Response round trip, in the tag's own counter units. */
  tround1: number
  /** Response→Final reply, in the tag's own counter units; known once the Final goes out. */
  treply2: number | null
}

/** Everything one device holds for the duration of a single ranging round. */
export interface RoundState {
  block: number
  round: number
  plan: RoundPlan
  tagId: string
  anchors: string[]
  /** The slot the round is in, as the schedule last announced it. */
  slot: number
  /** Contention round, anchor: the response slot it drew on the Poll; null when it drew none
   * (it is sitting the round out, or it never heard the Poll). */
  contendSlot: number | null
  /** Contention round, tag: the slot a collision was already reported for, so two doomed
   * responses in one slot are one UWB_CONTEND_COLLISION and not two. */
  contendCollisionSlot: number | null
  // tag side
  txPollCounter: number | null
  txFinalCounter: number | null
  peers: Map<string, PeerMeasurement>
  ranges: { id: string; distM: number }[]
  /**
   * The airtime of this round's Poll, in nanoseconds, or null before it has been sent (tag) or
   * received (anchor). Both ends of the round know it — one transmitted that PPDU and the other
   * decoded it — and exactly one thing reads it: the fixed reply time's baseline, which design
   * §6.1 measures from the **end** of the Poll's reception rather than from its RMARKER, because
   * a responder cannot begin transmitting before it has finished receiving (see
   * `fixedReplyRctu`).
   */
  pollNs: Ns | null
  // anchor side
  rxPollCounter: number | null
  txRespCounter: number | null
  rxFinalCounter: number | null
  /** The Final listed this anchor, i.e. the tag did receive its Response. */
  finalListedMe: boolean
  /** One-way ranging state; non-null exactly in a DL-TDoA round. */
  dl: DlRoundState | null
  /** Narrowband-assisted multi-millisecond state; non-null exactly in an MMS round. */
  mms: MmsRoundState | null
  /** Many-to-many state; non-null exactly in an `m2m` round (standard §10.32.6/§10.32.7). It, not
   * `plan.anchors`, is where a many-to-many path reads the round's participants: see
   * `M2mRoundState.participants` and the slice ledger's Ruling 8 for why the two counts are not
   * the same quantity. */
  m2m: M2mRoundState | null
  /**
   * UL-TDoA, anchor: when this round's blink arrived, on the **infrastructure's common
   * timebase** rather than on this anchor's own crystal — that crystal is what the calibration
   * removes, and what it leaves behind is the receiver's timestamp noise plus this anchor's
   * fixed `syncOffsetNs`. Null until the blink lands, and in every other mode.
   */
  ulArrivalNs: number | null
  /**
   * Anchor, angle-of-arrival session: the bearing it last measured to this round's tag, in
   * degrees from its boresight — null until a frame from the tag arrives. A DS round measures
   * it twice (on the Poll and again on the Final) and the last one stands, so the bearing the
   * round's fix is built from is the one taken closest to the range that goes with it.
   */
  aoaThetaDeg: number | null
}

function freshRound(
  block: number, round: number, plan: RoundPlan, tagId: string, anchors: string[],
  mms: MmsRoundState | null, m2m: M2mRoundState | null,
): RoundState {
  return {
    block, round, plan, tagId, anchors: [...anchors],
    slot: 0, contendSlot: null, contendCollisionSlot: null,
    txPollCounter: null, txFinalCounter: null, peers: new Map(), ranges: [],
    pollNs: null,
    rxPollCounter: null, txRespCounter: null, rxFinalCounter: null, finalListedMe: false,
    // Fresh every round: a tag that heard half a round keeps nothing of it, so a missing Poll
    // or Final can never be filled in from the round before.
    dl: plan.mode === 'dl-tdoa'
      ? { rxPoll: null, rxFinal: null, txPoll: null, txFinal: null, responses: new Map(), coffsToRef: null, rxResp: {} }
      : null,
    mms,
    m2m,
    ulArrivalNs: null,
    aoaThetaDeg: null,
  }
}

/**
 * `Treply` for the responder that answers in `slot` under `replyTime: 'fixed'`, as a count of
 * **that responder's own ranging counter** (standard §10.29.6.5, design §6/§6.1).
 *
 * One definition, read by both ends of the round: the responder aims its transmission at it
 * (`UwbDevice.armFixedReply`) and the initiator subtracts it from the round trip
 * (`UwbDevice.onResponse`). It never goes on the air — that is the whole point of the shape, and
 * the reason the two readings have to come from one expression rather than two.
 *
 * Three terms, and each one is there for a reason:
 *
 * - `pollNs`, the Poll's airtime. The configured constant is the delay from the **end of the
 *   Poll's reception** to the start of the Response's transmission, which is the only delay a
 *   radio can actually honour — it cannot begin transmitting before it has finished receiving —
 *   and it is the convention design §6.1's slot budget and the scenario schema are both written
 *   against (`rxPollEnd + F + k·S`). `Treply`, though, is RMARKER to RMARKER, and the tail of the
 *   Poll between its RMARKER and its last symbol falls inside that interval. Both ends know this
 *   number: one transmitted that PPDU and the other decoded it.
 * - `fixedReplyNs`, the configured constant `F` itself, converted from RSTU once in `roundPlan`.
 * - `(slot − 1) · slotNs`, design §6's `k · slotRstu` stagger: responder 0 answers at the bare
 *   constant, responder 1 one slot later, and so on. That is what lets a single configured number
 *   serve every responder of the round, and it is also why design §6.1's bound does not depend on
 *   `k` — the `k·S` term cancels on both sides of it.
 *
 * Rounded to whole RCTU here, once, rather than at each end: a slot length whose nanoseconds are
 * not a whole number of counter units would otherwise be rounded twice, and the responder would
 * hit a value the initiator did not subtract.
 */
function fixedReplyRctu(plan: RoundPlan, slot: number, pollNs: Ns): number {
  return Math.round((pollNs + plan.fixedReplyNs + (slot - 1) * plan.slotNs) / RCTU_NS)
}

export class UwbDevice implements UwbRadio {
  state: UwbDeviceState = 'idle'
  round: RoundState | null = null
  private expect: Expectation | null = null
  /** Monotonic id of the transmission in progress; its end timer carries a copy. */
  private txSeq = 0
  /** The MHR's Sequence Number: one 8-bit counter per device, wrapping at 256. */
  private seqNo = 0
  /**
   * Contention rounds, anchor: what is left of the RCMA retry budget. SS-TWR gives a responder
   * no acknowledgement of its own — the exchange ends at the tag — so the anchor cannot know
   * whether it was heard. The model closes that loop at the round's end (see `endRound`): a
   * round that produced a range for this anchor refills the budget, a round that did not spends
   * one attempt of it, and an empty budget buys one silent round before the anchor tries again.
   */
  private attemptsLeft: number
  /**
   * P802.15.4ab: the ranging block this device found the narrowband channel busy in, or null.
   * The draft's listen-before-talk rule is not per frame but per block — a busy check stops
   * every narrowband transmission until the next block — and that is what this remembers.
   */
  nbSkipBlock: number | null = null
  /**
   * **The one piece of device state in this engine that outlives a ranging round, and it is a
   * deliberate exception.** Two-way ranging, responder: the block whose control message (today's
   * Poll, carrying ARC + RDM + RRMC) this device last decoded, or null if it has never decoded
   * one. Standard §10.32.9.1's ARC IE, "RCM Validity Rounds".
   *
   * Compare `freshRound`'s own comment, which says the opposite about everything in `RoundState`:
   * every field there is rebuilt per round *on purpose*, so a device that heard half a round keeps
   * nothing of it and a missing Poll can never be filled in from the round before. This feature
   * needs exactly the opposite of that, and could not exist without it — §10.34's responder is
   * defined as one that **holds a control message from an earlier round** and did not receive this
   * round's initiation message (design §1). So the state cannot live in `RoundState`, and it does
   * not: it belongs to the device, like the contention retry budget and the narrowband skip block
   * above, both of which also outlive a round.
   *
   * **What bounds it is what makes it an exception rather than a leak**: it expires after
   * `rcmValidityRounds` blocks (`holdsValidRcm`), which is the very window the control message
   * itself bought. So it can never fill a gap in a round — it answers one question, "is a control
   * message I decoded still valid for this block", and nothing of the round it was decoded in
   * survives with it: no counter, no slot, no reply time. A stale block index past the window is
   * indistinguishable from never having decoded one.
   *
   * It is **a block index, not a round index** (design §2.2): within a block the `round` parameter
   * names which tag the round belongs to and never moves for that tag, so a given tag's successive
   * ranging rounds are successive blocks.
   *
   * And it is **one block index per initiator**, not one for the device. A single number was the
   * first shape, and it made the feature lie: an anchor that had decoded tag 1's control message
   * answered **tag 2's** round with an RMNR frame, whose whole meaning is "I did receive your
   * control message" — from a tag it had never decoded a single frame of. Measured before fixing:
   * two tags, the second 14 dB down, `rcmValidityRounds` 4 — fifteen RMNR frames over five blocks
   * from three anchors that never decoded anything from tag 2, ever. The slot table is the RDM
   * IE's and the RDM IE belongs to one tag's Poll, so the validity it buys belongs to that tag too.
   */
  private rcmBlock = new Map<string, number>()
  /**
   * **The second piece of cross-round device state on this branch, and it copies the first one's
   * lesson verbatim: it is keyed by initiator.** Standard §10.36: for each initiator, which of that
   * initiator's openers inside *one* RCM validity window this device actually received — the
   * receipt bitmap an MMRCM carries (design §3.3). `window` is the block that window opened at, and
   * `received[i]` is window-round `i`, i.e. block `window + i`.
   *
   * **Why keyed, and what a single un-keyed value cost.** `rcmBlock` above was a single number
   * first, and that made RMNR lie: an anchor that had decoded tag 1's control message answered
   * **tag 2's** round with a frame whose whole meaning is "I did receive your control message",
   * from a tag it had never decoded a frame of — fifteen such frames over five blocks before it was
   * fixed. A bitmap is the same state one bit per block wider, so a single un-keyed array would
   * make exactly the same claim about exactly the same frame: "I received your openers", filled in
   * from somebody else's. The giveaway in that case was in the comment all along — the slot table is
   * the RDM IE's, and the RDM IE belongs to one tag's Poll — and it applies here unchanged.
   *
   * **What bounds it.** `window` does. A reading for a block outside the stored window is not a
   * stale bitmap read anyway, it is `false` everywhere (`receiptIn`), and a reception in a new
   * window discards the old array rather than extending it (`noteOpener`). So the state cannot
   * survive the window it describes, exactly as `rcmBlock`'s own expiry does not let a control
   * message outlive the rounds it bought — which is what makes both of these exceptions to
   * `freshRound`'s per-round rule rather than leaks.
   *
   * One entry per initiator this device has ever heard, so the map is bounded by the scenario's own
   * initiator count and never by the run length.
   */
  private openerReceipt = new Map<string, { window: number; received: boolean[] }>()
  /**
   * P802.15.4ab, tag: the ranges of the block in progress, one per anchor. An MMS round holds
   * one anchor, so a fix needs the ranges of several rounds; they are kept here, across those
   * rounds, and cleared when the block's last pair round has solved.
   */
  readonly blockRanges = new Map<string, number>()

  constructor(
    readonly id: string,
    public cfg: UwbDeviceCfg,
    readonly clock: UwbClock,
    public rng: Rng,
    private q: EventQueue,
    public now: () => Ns,
    public ch: UwbChannel,
    public emit: EmitFn,
    public geometry: UwbGeometry,
  ) {
    this.attemptsLeft = cfg.maxAttempts
  }

  get role(): 'anchor' | 'tag' {
    return this.cfg.role
  }

  // ---- schedule hooks -------------------------------------------------------

  /** Tag: open its round (UWB_ROUND) — in DL-TDoA that is the anchors' round, which every tag
   * opens a lane for because every tag measures the whole of it. Anchor: note the round it is
   * about to serve. In a many-to-many round there is no such split: every participant both
   * transmits and measures, so every one of them opens a round of its own (design §5). */
  beginRound(
    block: number, round: number, plan: RoundPlan, tagId: string, anchors: string[],
    /** What the schedule knows about this round that the plan does not, because it changes from
     * block to block or from round to round: the narrowband channel of an MMS block, and the
     * participant list of a many-to-many round. An options object rather than more positionals,
     * so the next such thing costs no caller a change. */
    opts: { nbChannel?: number | null; participants?: string[] } = {},
  ): void {
    const mp = plan.mms
    const nbChannel = opts.nbChannel ?? null
    // A device never re-derives the block's channel: the network draws it once and both ends of
    // the round are told the same number. Without one there is no MMS state, and the round
    // would run its twenty-eight slots in silence — no control exchange, no fragments, no
    // range, and nothing said about why. Say it here instead, as `uwbSlotsPerTag` does for the
    // train shape: a caller that plans an MMS round and forgets the channel is a bug.
    //
    // …unless the round has no narrowband radio to hop. Config 1 carries its whole control plane
    // on the UWB PHY, so null is the right answer there rather than a missing one, and the round
    // runs with nothing narrowband in it. 4ab draft 15-25/0194r0
    if (mp && mp.phy.control === 'nba' && nbChannel === null) {
      throw new Error("UwbDevice.beginRound: mode 'mms' needs the block's narrowband channel")
    }
    const mms = mp ? freshMms(mp, nbChannel) : null
    // The same rule as the channel above, for the same reason: a many-to-many round is laid out
    // over an *ordered participant list* (design §5), and the order is what decides which slot
    // each device transmits in and which half of each pair it is. A caller that plans the round
    // and forgets the list would leave every device unable to say where it stands, so it is said
    // here rather than guessed — and `RoundPlan.anchors` is deliberately not used as a fallback:
    // in this mode that number counts everyone rather than everyone-but-the-initiator, and a list
    // rebuilt from a role filter would not be the list the schedule dispatched against (Ruling 8).
    if (plan.mode === 'm2m' && opts.participants === undefined) {
      throw new Error("UwbDevice.beginRound: mode 'm2m' needs the round's ordered participant list")
    }
    const m2m = plan.mode === 'm2m' && opts.participants !== undefined
      ? freshM2m(plan, opts.participants, this.id)
      : null
    this.round = freshRound(block, round, plan, tagId, anchors, mms, m2m)
    // Many-to-many has no listener and no server: every participant measures the round it is in,
    // so every participant opens a lane for it. `uwb.role` decides only how a node is drawn
    // (design §5), and gating this on it would silence a whole round of all-anchor nodes.
    if (plan.mode !== 'm2m' && this.cfg.role !== 'tag') return
    this.emit({
      t: this.now(), type: 'UWB_ROUND', node: this.id, block, round,
      slots: plan.slots, slotNs: plan.slotNs, method: plan.method, mode: plan.mode,
      untilNs: this.now() + plan.roundNs,
    })
  }

  /**
   * Called at every slot start of a round this device takes part in.
   *
   * The action is `blockSlotAction`'s, not `slotAction`'s, so it may be the window-closing block's
   * `MmrcmSlotAction` (standard §10.36) as well as any of the ranging actions — those are the only
   * two shapes the schedule ever produces, and the union is kept explicit here rather than folded
   * into `SlotAction` so that the receipt confirmation cannot be reached by a mode that never asked
   * for one (`uwbMmrcmSlots` answers 0 for every such mode).
   */
  onSlot(
    slot: number, action: SlotAction | MmrcmSlotAction, slotEndNs: Ns,
    peers: { tag: string; anchors: string[] },
  ): void {
    this.closeSlot(slot)
    const r = this.round
    if (!r) return
    r.slot = slot
    // …and for the same reason, every participant of a many-to-many round reports its own slot:
    // each of them is measuring, so each of them has a lane the slot means something on.
    if (this.cfg.role === 'tag' || r.plan.mode === 'm2m') {
      this.emit({ t: this.now(), type: 'UWB_SLOT', node: this.id, slot, untilNs: slotEndNs })
    }
    // The window-closing block's extra slots (standard §10.36, design §3.3), handled before every
    // mode branch below because the exchange is the same exchange in both modes that have it: one
    // responder transmits, every initiator of the round listens. Only the two counts differ, and
    // `mmrcmAnswers` is where that difference lives.
    if (action.kind === 'uwbMmrcm') {
      this.onMmrcmSlot(slot, action, r, peers)
      return
    }
    if (r.plan.mode === 'mms') {
      onMmsSlot(this, slot, action, r, peers)
      return
    }
    // An idle slot is the MMS layout's alone — the second slot of a narrowband window, or a
    // ranging slot the train does not reach. No other mode ever schedules one, and after this
    // line every action below names a frame.
    if (action.kind === 'idle') return
    // Many-to-many (standard §10.32.6/§10.32.7, design §3/§5): one transmitter per slot and
    // everybody else listening — see ./device.m2m.
    if (r.plan.mode === 'm2m') {
      onM2mSlot(this, slot, action, r, peers)
      return
    }
    // A `uwbM2m` action outside an m2m round. `slotAction` produces one for `mode: 'm2m'` and for
    // nothing else, so reaching this is not a state the model can be in on purpose — it would mean
    // the schedule and the round plan disagree about which mode is running. It **throws** rather
    // than returning, which is the whole point: Task 3 left a silent `return` here, and a silent
    // return is how a feature ships looking finished while doing nothing at all (slice ledger,
    // Ruling 9). It is also what keeps the rest of this method type-checking, since every branch
    // below reads a `tx`/`anchor` shape a many-to-many action does not have.
    if (action.kind === 'uwbM2m') {
      throw new Error(`UwbDevice.onSlot: a many-to-many action in a '${r.plan.mode}' round, slot ${slot}`)
    }
    if (r.plan.mode === 'dl-tdoa') {
      onDlSlot(this, slot, action, r, peers)
      return
    }
    if (r.plan.mode === 'ul-tdoa') {
      onUlSlot(this, slot, action, r, peers)
      return
    }
    // A contention round's response phase belongs to nobody in advance: `slotAction` names no
    // anchor (its `anchor` is -1), each anchor drew its own slot when it decoded the Poll, and
    // the tag simply listens through the whole window for whoever turns up.
    if (r.plan.schedule === 'contention' && action.kind === 'uwbResp') {
      if (this.cfg.role === 'anchor') {
        if (r.contendSlot === slot && !this.repliesAtFixedDelay(r, action.kind)) {
          this.transmitFor(action, slot, r, peers)
        }
        return
      }
      this.listenOpen(slot)
      return
    }
    const txId = action.tx === 'tag' ? peers.tag : peers.anchors[action.anchor]
    if (txId === this.id) {
      // …unless this round's responder answers at a fixed delay from the Poll rather than at the
      // slot boundary (standard §10.29.6.5). Its Response was armed the instant the Poll arrived
      // and is already sitting in the queue, so the slot must not put a second one on the air.
      //
      // An RMNR frame is the exception to that exception, and for the reason the fixed shape
      // exists at all: the delay is counted from the reception of the initiation message, and
      // there was none. So it has no instant to aim off and goes out at the slot boundary, like
      // every other frame in this engine. Without this clause a `fixed` session would be the one
      // shape where §10.34 silently did nothing.
      if (!this.repliesAtFixedDelay(r, action.kind) || this.owesRmnr(r, action.kind)) {
        this.transmitFor(action, slot, r, peers)
      }
      return
    }
    // A device listens only for the frames addressed to it or broadcast to its
    // round: an anchor ignores the other anchors' slots entirely (receiver off),
    // and a tag ignores nothing, because every answer in the round is its own —
    // including, in a deferred SS round, the follow-up message that carries the reply
    // time its Response could not (standard §10.29.6.3).
    const mine = this.cfg.role === 'tag'
      ? action.kind === 'uwbResp' || action.kind === 'uwbSsDefer' || action.kind === 'uwbReport'
      : action.kind === 'uwbPoll' || action.kind === 'uwbFinal'
    if (!mine) return
    // What slot 0 actually carries this block: the control message (today's Poll) at the head of
    // each validity window, the initiation message alone in the blocks the window covers (standard
    // §10.32.9.1, design §2). The slot table does not move with it — slot 0 is the round's opener
    // either way — so the *action* is `uwbPoll` in both cases and only the frame differs; a
    // responder still waiting for a `uwbPoll` would reject the initiation message as not the frame
    // this slot is for, and the whole round would go silent behind it.
    this.listenFor(slot, txId, this.openerKind(r, action.kind))
  }

  /**
   * Tag: solve this round's fix, close the round, and return the anchors it ranged — the set the
   * network hands straight back to those anchors as `heard`, which is the whole of the feedback
   * model an SS-TWR responder has no frame for (standard §10.32.1 NOTE leaves the filtering of a
   * ranging result to the upper layer; here the upper layer is the network).
   *
   * Anchor: spend or refill the contention retry budget, and return nothing. Only an anchor that
   * actually drew a slot this round spends an attempt — a round it sat out is the price it has
   * already paid, and a round whose Poll it never heard is not its doing.
   *
   * `heard` is required rather than defaulting: false is the failure-shaped value (it spends an
   * attempt), and a caller that forgot the argument would quietly burn a responder's budget.
   */
  endRound(heard: boolean): string[] {
    this.closeSlot(null)
    const r = this.round
    this.round = null
    if (!r) return []
    // Many-to-many closes at every participant and hands nothing back. Every range of the round
    // was already reported in the slot the frame that completed it landed in (design §2: the
    // earlier participant of each pair finishes the arithmetic on arrival), there is no fix to
    // solve — a participant measures its peers, not its own position — and there is no contention
    // budget for a feedback flag to refill. It comes before the role check below because in this
    // mode `uwb.role` decides only how a node is drawn (design §5): an all-anchor round would
    // otherwise close silently, with no UWB_ROUND_END against the UWB_ROUND each participant
    // opened.
    if (r.plan.mode === 'm2m') {
      this.emit({ t: this.now(), type: 'UWB_ROUND_END', node: this.id, block: r.block, round: r.round })
      return []
    }
    if (this.cfg.role !== 'tag') {
      if (r.plan.schedule === 'contention' && r.contendSlot !== null) {
        this.attemptsLeft = heard ? this.cfg.maxAttempts : Math.max(0, this.attemptsLeft - 1)
      }
      return []
    }
    // Who solves the round's fix is the mode's defining question: in two-way ranging and DL-TDoA
    // the tag does, from what it measured itself; in UL-TDoA the tag measures nothing at all — it
    // blinked and went back to sleep — and the infrastructure solves for it (see `solveUlFix`).
    if (r.plan.mode === 'dl-tdoa') solveTdoaFix(this, r)
    else if (r.plan.mode === 'mms') solveMmsFix(this, r)
    else if (r.plan.mode === 'twr') this.solveFix(r)
    // The round is over whether or not it produced a fix: the tag's radio is off until
    // its round in the next block, and the view's slot returns to null.
    this.emit({ t: this.now(), type: 'UWB_ROUND_END', node: this.id, block: r.block, round: r.round })
    return r.ranges.map((x) => x.id)
  }

  /** Tag only: the round's 2-D fix from the anchors that answered, emitted as UWB_POSITION. */
  private solveFix(r: RoundState): void {
    if (r.ranges.length < 3) return
    const fix = solvePosition(
      r.anchors.map((id) => this.geometry.anchorPos(id)),
      r.ranges,
      this.cfg.pos.z,
      rangeSigmaM(this.cfg.tsNoisePs),
    )
    // Fewer than three usable ranges, or anchors too nearly collinear to invert:
    // the round simply produces no fix rather than a fabricated one.
    if (!fix) return
    this.emit({
      t: this.now(), type: 'UWB_POSITION', node: this.id,
      x: fix.x, y: fix.y, trueX: this.cfg.pos.x, trueY: this.cfg.pos.y,
      gdop: fix.gdop, ellipse: fix.ellipse, anchors: r.ranges.map((x) => x.id), block: r.block,
      method: 'twr',
    })
  }

  /**
   * UL-TDoA, anchor: the arrival it stamped for this round's blink, already on the
   * infrastructure's common timebase, or null if it never heard the blink. The network reads it
   * while the round is still open and hands the set to the reference anchor.
   */
  ulArrivalNs(): number | null {
    return ulArrivalNsImpl(this)
  }

  /**
   * UL-TDoA, the reference anchor: difference the anchors' arrivals and solve the tag's position
   * from them — see `solveUlFix` in `./device.tdoa` for the model.
   */
  solveUlFix(arrivals: { id: string; ns: number }[]): void {
    solveUlFixImpl(this, arrivals)
  }

  // ---- radio ----------------------------------------------------------------
  //
  // There is **no `onEcho` here, deliberately.** `UwbRadio` offers one, and a scenario with
  // reflecting objects in it does deliver a second arrival per object per pair — but a ranging
  // device is not the consumer of them. A 4z/4ab receiver locks the first path and suppresses
  // what follows it, so the receive timestamp below, the MMS train's `acquired` and the fragment
  // accumulation must all see exactly the arrivals they saw before, and they do: the medium
  // routes a marked arrival to `deliverEcho` instead, which opens no reception and calls a method
  // this class does not implement. Switching the scatterers on therefore leaves every
  // `UWB_RANGE` field-for-field what it was (sensing design §3 and §7, and
  // tests/uwb/echo-channel.test.ts, which is the test that decides it).
  //
  // The sensing consumer is `UwbSensor` (src/uwb/sensing.ts), which **wraps** one of these
  // rather than living inside it: src/uwb/network.ts registers the wrapper in place of the
  // device when, and only when, the scenario has a scatterers section. Everything it forwards
  // arrives below unchanged, and the echoes it keeps never get this far. Keep it that way — the
  // guarantee above is a fact about which object the medium holds, not a promise about a body.

  listening(): boolean {
    return this.state === 'uwbWait' || this.state === 'rx'
  }

  onRxStart(): void {
    if (this.state === 'uwbWait') this.setState('rx')
  }

  onRxFail(_from: string, reason: RxFailReason): void {
    const r = this.round
    // A response lost to overlap in a contention slot is the collision the whole schedule mode
    // is about, so the tag names the slot it happened in. It is keyed on the slot, not on the
    // reception: two responses that doom each other fail twice and are one collision, and a slot
    // where the stronger was captured still lost the weaker one.
    if (
      reason === 'collision' && r !== null && this.cfg.role === 'tag'
      && r.plan.schedule === 'contention' && r.contendCollisionSlot !== r.slot
    ) {
      r.contendCollisionSlot = r.slot
      this.emit({ t: this.now(), type: 'UWB_CONTEND_COLLISION', node: this.id, slot: r.slot })
    }
    // The slot's deadline is still armed; it will report the miss.
    if (this.state === 'rx') this.setState(this.expect ? 'uwbWait' : 'idle')
  }

  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void {
    // The channel gates deliveries at the arrival instant only; a device that
    // began transmitting (or went back to sleep) part-way through a reception
    // must not stamp a counter from it. Half-duplex is enforced here, not there.
    if (this.state !== 'uwbWait' && this.state !== 'rx') return
    const kind = frame.kind as UwbFrameKind
    const exp = this.expect
    const r = this.round
    if (!r || !exp || (exp.from !== null && exp.from !== from) || !expectationAccepts(exp, kind)) {
      // Not the frame this slot is for: no ranging counter is taken from it.
      if (this.state === 'rx') this.setState(this.expect ? 'uwbWait' : 'idle')
      return
    }

    // The ranging message non-receipt frame (standard §10.34), handled before every draw below
    // because **nothing in it is timed**: its IE has no Content field, no range is computed from
    // it, and taking a receive timestamp of it would spend this device's timestamp-noise and
    // carrier-offset draws on a frame whose whole content is that it exists (design §3). So a
    // session with `rmnr` on takes exactly the random stream it would have taken with the slot
    // silent, and what the initiator learns from the slot is this record instead of a UWB_TIMEOUT.
    if (kind === 'uwbRmnr') {
      this.clearExpectation()
      this.setState('idle')
      this.emit({
        t: this.now(), type: 'UWB_RMNR', node: this.id, peer: from,
        slot: r.slot, block: r.block, round: r.round,
      })
      return
    }

    // The receipt confirmation (standard §10.36), handled here for the identical reason and before
    // every draw below: **nothing in it is timed either.** It carries a bitmap, not a time, no range
    // is computed from it, and stamping it would spend this receiver's timestamp-noise and
    // carrier-offset draws on a frame that reports on frames already long gone. So a session with
    // `mmrcr` on takes exactly the random stream it would have taken without the extra slots, which
    // is what lets `UWB_RANGE` come out field-for-field identical with the feature switched on.
    //
    // It is also handled before the mode branches, unlike every ranging frame: the exchange is the
    // same in both modes that have it, and the only mode-dependent part — who the frame answers —
    // was decided when it was built.
    if (kind === 'uwbMmrcm') {
      this.clearExpectation()
      this.setState('idle')
      const entries = frame.uwb?.mmrc
      // Every `uwbMmrcm` frame is built by `makeMmrcm`, which always fills this in, and the slot's
      // expectation has already refused every other kind — so a frame without its list is not an
      // MMRCM with something missing, it is one this branch should never have been handed.
      if (entries === undefined) {
        throw new Error(`UwbDevice.onRxOk: a 'uwbMmrcm' frame from ${from} carries no MMRC list`)
      }
      // This device's own row of the list, and nothing else: one frame may answer several
      // initiators, and each of them learns only what was written about it. A frame that names none
      // of them is not an error — a broadcast confirmation in a many-to-many round reaches every
      // participant, including ones it has nothing to say to — it simply produces no record here.
      const mine = entries.find((e) => e.initiator === this.id)
      if (mine !== undefined) {
        this.emit({
          t: this.now(), type: 'UWB_MMRCM', node: this.id, peer: from,
          slot: r.slot, block: r.block, round: r.round,
          windowRounds: r.plan.rcmValidityRounds, received: [...mine.received], initiators: entries.length,
        })
      }
      return
    }

    // P802.15.4ab: neither a fragment nor a narrowband message is stamped on arrival. A
    // fragment is one member of a train and the train is timed as a whole, at its end; a
    // narrowband message carries times but is not one. So the MMS branch comes before every
    // draw below — a device in this mode takes nothing from the generator per reception.
    if (r.plan.mode === 'mms') {
      onMmsRx(this, r, from, frame, kind, info)
      return
    }

    // The receive stamp: the RMARKER's true instant, plus the extra delay this
    // receiver actually measures — the NLOS excess of an obstructed first path,
    // and the leading-edge estimator's own noise.
    //
    // That noise is not one number for the session: an estimator's 1-σ goes as 1/√SNR, so
    // `tsNoisePs` is what this receiver achieves at `TS_SNR_REF_DB` and a quieter frame is
    // stamped worse (`tsSigmaNs`). The draw itself is one draw from this device's stream,
    // taken here as it always was — only its scale moved — so a link at or above the
    // reference stamps exactly the counters it stamped before.
    //
    // Before any of it: the relay, if this session has one. An attacker between the two radios
    // re-emits the frame so its leading edge lands `advanceNs` early. With the scrambled
    // timestamp sequence switched off there is nothing in the frame the attacker cannot
    // reproduce, and the receiver stamps the early edge — each reception of the round pulls the
    // range in by the whole advance. With the sequence on, the attacker cannot generate the
    // session key's pulses ahead of time, so nothing correlates at that edge: the receiver
    // rejects the stamp and the slot's deadline reports the miss, exactly as a lost frame does.
    const atk = this.cfg.attacker
    if (atk !== undefined && atk.advanceNs > 0 && !this.cfg.stsOff) {
      this.emit({
        t: this.now(), type: 'UWB_STS_REJECT', node: this.id, peer: from,
        frameKind: kind, advanceNs: atk.advanceNs,
      })
      if (this.state === 'rx') this.setState(this.expect ? 'uwbWait' : 'idle')
      return
    }
    const advanceNs = atk !== undefined && this.cfg.stsOff === true ? atk.advanceNs : 0
    const trueRmarkerNs = info.txStartNs + UWB_RMARKER_NS + info.propNs
    const sigmaNs = tsSigmaNs(this.cfg.tsNoisePs, uwbSinrDb(info.rssiDbm, info.foreignDbm))
    const extraNs = info.nlosNs + gaussian(this.rng) * sigmaNs - advanceNs
    const counter = this.clock.counter(trueRmarkerNs, extraNs)
    const fom = fomFor(info.nlos)
    this.emit({ t: this.now(), type: 'UWB_TS', node: this.id, dir: 'rx', peer: from, frameKind: kind, counter, fom })
    // Clock-offset estimate from the carrier (standard §16.4.9): how much faster
    // the sender's crystal runs than mine, with the estimator's residual error.
    const coffs = (info.txPpm - this.clock.ppm) * 1e-6 + gaussian(this.rng) * this.cfg.cfoNoisePpm * 1e-6
    // The angle of arrival of the frame that just landed: the last draw of the *reception*,
    // after the receive timestamp's noise and the carrier-offset estimator's residual, in that
    // order (an SS contention round adds its slot draw after this one, below). Keeping it last
    // here is what makes `aoa: false` byte-identical to a session that never had the feature:
    // no other draw moves in the stream.
    if (this.cfg.aoa && this.cfg.role === 'anchor' && r.plan.mode === 'twr' && from === r.tagId) {
      measureAoa(this, r, from)
    }

    this.clearExpectation()
    this.setState('idle')

    if (r.plan.mode === 'ul-tdoa') {
      // Wired sync (model): the anchors' clocks are disciplined to one common timebase, so this
      // anchor reports the arrival on *that* — its own ppm is precisely what the calibration
      // removes, which is why the counter it just stamped above (its own crystal, for the log)
      // is not what the fix is computed from. What survives the calibration is the receiver's
      // timestamp noise, drawn above in the order every mode draws it, and this anchor's own
      // fixed residual offset.
      if (kind === 'uwbBlink' && this.cfg.role === 'anchor') {
        r.ulArrivalNs = trueRmarkerNs + extraNs + this.cfg.syncOffsetNs
      }
      return
    }

    if (r.plan.mode === 'dl-tdoa') {
      onDlRx(this, r, from, frame, kind, counter, coffs)
      return
    }

    // Many-to-many: one reception is both half of a round trip this device opened and the raw
    // material of the answer it will send later, so it is routed on the mode rather than by frame
    // kind — every frame of the round is the same kind (see ./device.m2m).
    if (r.plan.mode === 'm2m') {
      onM2mRx(this, r, from, frame, counter, coffs, fom)
      return
    }

    switch (kind) {
      case 'uwbPoll':
        // This engine's Poll is the control message **and** the initiation message at once (design
        // §1), so decoding it is also what buys this responder the validity window §10.34's
        // exchange needs. `rcmBlock` is the one piece of device state that outlives a round, and its
        // own comment says why that is a deliberate exception and what bounds it. Recorded whether
        // or not `rmnr` is on: it is a fact about the device, nothing but `owesRmnr` reads it, and a
        // session with the feature off therefore behaves and draws exactly as it did before.
        // Keyed by the initiator whose control message this is: validity is a fact about a
        // tag-and-responder pair, never about the responder alone.
        this.rcmBlock.set(r.tagId, r.block)
        this.onInitiation(r, frame, counter, trueRmarkerNs, extraNs)
        break
      case 'uwbInit':
        // The initiation message alone (standard §10.32.9.1): a block the control message decoded
        // earlier already paid for. It means exactly the initiation half of a Poll and not one bit
        // more — in particular it refreshes no validity window, which is what keeps the window the
        // length the control message bought rather than a thing that renews itself.
        this.onInitiation(r, frame, counter, trueRmarkerNs, extraNs)
        break
      case 'uwbResp':
        this.onResponse(r, from, frame, counter, coffs, fom)
        break
      case 'uwbSsDefer':
        this.onSsDefer(r, from, frame)
        break
      case 'uwbFinal':
        this.onFinal(r, from, frame, counter, fom)
        break
      case 'uwbReport':
        this.onReport(r, from, frame, fom)
        break
      case 'uwbM2m':
        // Only an m2m round ever waits for one of these, and that round returned above. A
        // many-to-many frame accepted by a two-way round's expectation would mean the two ends
        // disagree about the mode, which nothing can do on purpose (Ruling 9).
        throw new Error(`UwbDevice.onRxOk: a many-to-many frame from ${from} in a '${r.plan.mode}' round`)
      // No `case 'uwbRmnr'` here, and it is not an omission: the branch above returns on that kind
      // unconditionally, so `kind` is narrowed and tsc refuses the case outright ("not comparable")
      // rather than accepting a throw nobody could ever reach. Ruling 9 asks for a throw where a
      // state cannot happen on purpose; where the type checker can prove it cannot happen at all,
      // that proof is the stronger guard. Make the branch above conditional and this switch stops
      // compiling, which is exactly the warning a runtime throw would only have printed.
    }
  }

  // ---- slot handling --------------------------------------------------------

  /**
   * Close the slot that just ended: a slot whose expected frame never arrived
   * reports a UWB_TIMEOUT, and the receiver goes back to sleep.
   *
   * This is the whole deadline mechanism, and it needs no timer. A slot's
   * deadline is its end, and its end is the next slot's start — at which the
   * network calls `onSlot` on every participant of the round, whether or not
   * that participant has anything to do in the new slot. The round's last slot
   * ends in `endRound`, called on every participant too. So every armed slot is
   * closed at exactly the right instant by the schedule itself (the invariant
   * is recorded in network.ts, which is what guarantees it).
   */
  private closeSlot(atSlot: number | null): void {
    const exp = this.expect
    if (!exp) return
    // A narrowband message is two slots long, so its wait outlives the slot it was armed in:
    // the expectation names the slot it expires at, and a slot boundary before that leaves it
    // armed. `null` is the round's end, which closes every wait whatever it was waiting for.
    if (atSlot !== null && exp.until > atSlot) return
    this.expect = null
    // An open contention slot names no peer, so a silent one has nothing to report:
    // an empty slot is what most of the response window looks like by design; a fragment of a
    // train is named but not worth a record either (see `Expectation.silent`).
    if (!exp.open && !exp.silent && exp.from !== null) {
      this.emit({ t: this.now(), type: 'UWB_TIMEOUT', node: this.id, slot: exp.slot, peer: exp.from, expected: exp.kind })
    }
    this.setState('idle')
  }

  /**
   * Anchor, on the Poll of a contention round: draw the response slot to answer in, uniformly
   * over the window the round plan sets - the same window the Poll's RCPS IE advertises, since
   * both come from the one session config (standard §10.32.2 schedule mode 0). An anchor whose
   * RCMA budget is spent answers in no slot at all this round — the one back-off a responder
   * that cannot hear the other responders has — and starts the next round with a full budget.
   */
  private drawContentionSlot(r: RoundState): void {
    if (this.attemptsLeft === 0) {
      this.attemptsLeft = this.cfg.maxAttempts
      this.emit({ t: this.now(), type: 'UWB_CONTEND', node: this.id, slot: null, attempt: 0 })
      return
    }
    const slot = 1 + this.rng.int(r.plan.contentionSlots - 1)
    r.contendSlot = slot
    this.emit({
      t: this.now(), type: 'UWB_CONTEND', node: this.id, slot,
      attempt: this.cfg.maxAttempts - this.attemptsLeft + 1,
    })
  }

  /**
   * True when this round's Responses do not start at a slot boundary: `replyTime: 'fixed'`
   * (standard §10.29.6.5). `armFixedReply` has already queued the frame off the Poll's own
   * arrival, so the slot tick must stay out of the way — and it is asked about the frame kind,
   * not just the round, because every *other* frame of such a round (Poll, Final, Report) is
   * still perfectly slot-aligned.
   */
  private repliesAtFixedDelay(r: RoundState, kind: UwbFrameKind): boolean {
    return kind === 'uwbResp' && r.plan.mode === 'twr' && r.plan.replyTime === 'fixed'
  }

  /**
   * Whether a control message this device decoded is still valid for block `block` (standard
   * §10.32.9.1). The window a control message buys is the `rcmValidityRounds` blocks starting with
   * its own, and `blockCarriesRcm` is what puts one at the head of each of them — so a device that
   * decoded block `b`'s control message holds it for blocks `b … b + R − 1` and no further.
   *
   * Never true with no control message decoded at all: `null` is not block 0. That is the physical
   * floor of §10.34 and not a defensive nicety — a responder that never decoded a control message
   * does not know which slot is its own (the slot table is the RDM IE's), so it has no slot to
   * speak in, and speaking anyway would be speaking in somebody else's.
   */
  private holdsValidRcm(block: number, plan: RoundPlan, tagId: string): boolean {
    const since = this.rcmBlock.get(tagId)
    if (since === undefined) return false
    const age = block - since
    return age >= 0 && age < plan.rcmValidityRounds
  }

  /**
   * One of `initiator`'s openers arrived, in block `block`: write that bit down (standard §10.36,
   * design §3.3). Called from the two places a device decodes an opener — `onInitiation`, which is
   * where both of a two-way round's openers land (the control message and the initiation message
   * alike), and `onM2mRx` for a many-to-many round's pass-0 transmission, which *is* that mode's
   * opener.
   *
   * **This is the only writer**, and it writes only what this receiver experienced: it is called
   * from inside a reception, after the expectation has accepted the frame, so a bit can be set here
   * only by a frame this device actually decoded. Nothing reconstructs the bitmap from the record
   * stream or from the sender's own account of what it transmitted — which is the one property the
   * slice's acceptance test is built to check, by comparing the bitmap against the run's `RX_OK`
   * records bit for bit.
   *
   * Called whether or not `mmrcr` is on, the same way `rcmBlock` is recorded whether or not `rmnr`
   * is: it is a fact about the device, it costs no random draw and emits nothing, and only
   * `receiptIn` reads it — so a session with the feature off behaves and draws exactly as before.
   */
  noteOpener(initiator: string, block: number, plan: RoundPlan): void {
    const window = block - (block % plan.rcmValidityRounds)
    const held = this.openerReceipt.get(initiator)
    // A reception in a window this device holds nothing for yet replaces the old array outright
    // rather than growing it: the previous window's bits describe rounds this bitmap no longer
    // covers, and carrying them forward is what would let the state outlive its own expiry.
    const entry = held !== undefined && held.window === window
      ? held
      : { window, received: Array.from({ length: plan.rcmValidityRounds }, () => false) }
    entry.received[block - window] = true
    this.openerReceipt.set(initiator, entry)
  }

  /**
   * `initiator`'s receipt bitmap for the window block `block` belongs to: one bit per window round,
   * `false` wherever this device decoded nothing. Always exactly `plan.rcmValidityRounds` long,
   * which is what `makeMmrcm` refuses to let drift from the width the frame is priced for.
   *
   * All `false` when this device holds nothing for this window at all — including when what it
   * holds belongs to an *earlier* window, which is the expiry `openerReceipt`'s own comment turns
   * on: a bitmap from the window before is not a weaker answer, it is a false one.
   */
  private receiptIn(initiator: string, block: number, plan: RoundPlan): boolean[] {
    const window = block - (block % plan.rcmValidityRounds)
    const held = this.openerReceipt.get(initiator)
    if (held === undefined || held.window !== window) {
      return Array.from({ length: plan.rcmValidityRounds }, () => false)
    }
    return [...held.received]
  }

  /**
   * The frame slot 0 of this round carries, given the slot action it was laid out with: the control
   * message (`uwbPoll`) on the first block of each validity window, the initiation message alone
   * (`uwbInit`) on the blocks that window covers (standard §10.32.9.1, design §2). Any other action
   * is returned untouched.
   *
   * One expression, read by both ends of the round — the initiator builds the frame off it
   * (`transmitFor`) and the responders arm their wait off it (`onSlot`) — because the two deciding
   * separately is the only way they could disagree about which message this block's slot 0 holds.
   * `blockCarriesRcm` takes the **block** index (design §2.2): within a block the round index names
   * which tag the round belongs to and never cycles.
   *
   * Only `mode: 'twr'` is asked: DL-TDoA's Poll is an anchor's and no other mode has an ARC IE at
   * all, which is why the schema refuses a non-default `rcmValidityRounds` in each of them. With
   * `rcmValidityRounds: 1` — the default — every block is its own window and this is the identity.
   */
  private openerKind(r: RoundState, kind: UwbFrameKind): UwbFrameKind {
    if (kind !== 'uwbPoll' || r.plan.mode !== 'twr') return kind
    return blockCarriesRcm(r.plan, r.block) ? 'uwbPoll' : 'uwbInit'
  }

  /**
   * Responder, standard §10.34: this slot carries the ranging message non-receipt frame rather
   * than silence. Every clause is a precondition of the exchange, not a guard bolted on:
   *
   * - the session asks for it (`cfg.rmnr`, off by default — see `UwbDeviceCfg.rmnr`);
   * - this is a responder's own Response slot in a two-way round; one frame per round, so the
   *   round's other anchor-side slots (a deferred reply time, a Report) are not it;
   * - the round's initiation message never arrived (`rxPollCounter === null`), which is exactly the
   *   case that used to leave the slot empty;
   * - **and this device still holds a valid control message**, which is where its slot came from.
   *
   * Only a time-scheduled round can satisfy the last one. In a contention round the response slot
   * is the responder's **own draw**, made on the initiation message it did not receive
   * (`drawContentionSlot`), so the still-valid control message does not tell it where to answer —
   * it has no slot, and the floor above applies to it for the same reason it applies to a device
   * that never held a control message at all.
   */
  private owesRmnr(r: RoundState, kind: UwbFrameKind): boolean {
    return kind === 'uwbResp' && this.cfg.rmnr && this.cfg.role === 'anchor'
      && r.plan.mode === 'twr' && r.plan.schedule === 'time'
      && r.rxPollCounter === null && this.holdsValidRcm(r.block, r.plan, r.tagId)
  }

  /**
   * Which initiators a given responder's MMRCM answers (standard §10.36, design §3.2) — the MMRC
   * list's own count, which is **not** the slot count beside it: the list is one entry per
   * *initiator*, because one responder may have heard several, while the slots are one per
   * *responder*, because each responder sends its own frame (`uwb/phy.ts#uwbMmrcmSlots`).
   *
   * A two-way round has exactly one initiator — the tag the round belongs to — so an anchor's frame
   * carries a single entry, and an N-tag block confirms each tag in that tag's *own* round. That is
   * design §6's "one frame per initiator" read literally, and it is the reason this engine never
   * needs the multi-node downlink §6 declines to model.
   *
   * A many-to-many round has no such split: every participant is initiator and responder at once
   * (design §5), so a participant answers every *other* participant and its one frame carries N−1
   * entries. This is the case §3.2's list and `uwbMmrcmBytes`' own `initiators` parameter exist
   * for, and the addressing is the round's existing one — every frame of a many-to-many round is
   * already `UWB_BROADCAST`, because the round has no tag for anything to be addressed to.
   */
  private mmrcmAnswers(r: RoundState, responder: string): string[] {
    if (r.plan.mode !== 'm2m') return [r.tagId]
    const m = r.m2m
    if (!m) throw new Error(`mmrcmAnswers: a '${r.plan.mode}' round carries no many-to-many state`)
    return m.participants.filter((id) => id !== responder)
  }

  /**
   * Whether this responder may confirm receipt to `initiator` at all.
   *
   * In a two-way round: **only while it still holds a valid control message from that initiator**,
   * the identical floor §10.34 puts under an RMNR frame (`owesRmnr`), and for the identical reason.
   * The slot an MMRCM goes out in is one the window-closing block adds *to the initiator's own
   * round*, and which round that is was settled by that initiator's RDM IE — so a responder that
   * never decoded one has no slot of its own there, and speaking anyway would be speaking in
   * somebody else's. This is also what makes the slice-3 defect unreachable rather than merely
   * absent: the one thing an anchor could have answered tag 2's round with is a bitmap it holds for
   * tag 1, and an anchor that never decoded tag 2 does not reach the frame at all.
   *
   * In a many-to-many round the floor is already met by construction and there is nothing to check:
   * there is no control message in the mode at all (the schema pins `rcmValidityRounds` at 1 for
   * it), and the slot comes from the participant list every participant was handed with the round
   * (`m2mParticipants`, in node-id order), not from anybody's IE.
   */
  private mayConfirmTo(initiator: string, r: RoundState): boolean {
    if (r.plan.mode === 'm2m') return true
    return this.holdsValidRcm(r.block, r.plan, initiator)
  }

  /**
   * One MMRCM slot of a window-closing block (standard §10.36; design §3.3/§6).
   *
   * **Which device transmits from the slot** — the decision Task 2 left to this task: the responder
   * `action.index` names, read off the list the slots were laid out from. That is `peers.anchors` in
   * a two-way round and the round's own participant list in a many-to-many one, which are the same
   * two lists `uwbMmrcmSlots` counts to decide how many of these slots exist — so the slot index and
   * the device it belongs to cannot disagree. It is **not** routed through `transmitFor`: that takes
   * a `ScheduledAction`, every member of which is a ranging frame with a `tx`/`anchor` shape this
   * action does not have, and an MMRCM carries no ranging counter (`send(…, null)`, exactly as an
   * RMNR frame does) because nothing in it is timed.
   *
   * Everyone the frame answers listens; everyone else has nothing to hear. The wait is **not**
   * silent: this slot belongs to one named responder, so a slot that stays empty is a slot with no
   * answer, which is what `UWB_TIMEOUT` means everywhere else in this engine.
   */
  private onMmrcmSlot(
    slot: number, action: MmrcmSlotAction, r: RoundState, peers: { tag: string; anchors: string[] },
  ): void {
    const responders = r.plan.mode === 'm2m'
      ? (r.m2m?.participants ?? [])
      : peers.anchors
    const txId = responders[action.index]
    // The schedule named a responder this round does not have, which would mean `uwbMmrcmSlots` and
    // the round's own peer list disagree about how many responders there are — not a state the model
    // can be in on purpose (slice ledger, Ruling 9).
    if (txId === undefined) {
      throw new Error(
        `UwbDevice.onMmrcmSlot: slot ${slot} names responder ${action.index}, and the round has ${responders.length}`,
      )
    }
    if (txId !== this.id) {
      if (this.mmrcmAnswers(r, txId).includes(this.id)) this.listenFor(slot, txId, 'uwbMmrcm')
      return
    }
    const entries: UwbMmrcEntry[] = this.mmrcmAnswers(r, this.id)
      .filter((id) => this.mayConfirmTo(id, r))
      .map((id) => ({ initiator: id, received: this.receiptIn(id, r.block, r.plan) }))
    // Nothing this responder is entitled to confirm: the slot stays empty, exactly as a Response
    // slot does for an anchor that never heard the Poll.
    if (entries.length === 0) return
    // **The one invariant the schema's own arithmetic cannot carry over**: the frame has to fit the
    // 127-octet PSDU. Both of this engine's modes clear it by a wide margin today — a two-way round
    // lists one initiator (18 octets at R ≤ 8), and a many-to-many round lists N−1 of them while
    // `uwbMaxParticipants` already caps N at 27 by a *different* frame's arithmetic — but those two
    // caps are not tied to each other anywhere, and `rcmValidityRounds` may be set as high as 64,
    // which widens every entry. So it is checked rather than argued: a sentence in a comment is what
    // this slice has already had to replace once with a throw (`makeMmrcm`'s own width guard).
    const cap = uwbMaxMmrcmInitiators(r.plan.rcmValidityRounds)
    if (entries.length > cap) {
      throw new Error(
        `UwbDevice.onMmrcmSlot: ${entries.length} initiators do not fit one MMRCM over a `
        + `${r.plan.rcmValidityRounds}-round window (at most ${cap} do)`,
      )
    }
    this.send(
      makeMmrcm(
        this.id,
        // A two-way round's one initiator is an address; a many-to-many round has no tag to address
        // anything to and every frame of it is already a broadcast (design §6).
        r.plan.mode === 'm2m' ? UWB_BROADCAST : r.tagId,
        r.block, r.round, slot, r.plan.rcmValidityRounds, entries,
      ),
      null,
    )
  }

  /**
   * Anchor, `replyTime: 'fixed'` (standard §10.29.6.5): **the one transmission in this whole UWB
   * stack that is not aligned to a ranging slot.** Everything else here radiates at a slot start,
   * because the schedule decided the slot before the session began. This one does not, and that
   * is not a bug — it is the entire content of the procedure.
   *
   * Why it has to be this way (design §6). `Treply = T3 − T2` is the responder's own receive-to-
   * transmit interval. If the responder answered at its **slot boundary**, then
   * `Treply = slot start − (Poll's arrival here)`, and the Poll's arrival moves with the flight
   * time — so `Treply` would be a *different number for every anchor*, and different again every
   * time the tag moved. A tag that is not told `Treply` could not possibly reconstruct it. Make
   * the responder answer a fixed interval after **its own** reception instead and the quantity
   * stops depending on the geometry altogether: it is the configured constant, exactly, and both
   * ends already have it. That is how this shape gets away with a Response that carries no reply
   * time at all (14 octets against the embedded shape's 20).
   *
   * What moves instead is the *arrival*: the Response now leaves one flight time later at a
   * distant anchor than at a near one, so the tag sees it drift by `2 × ToF` — which is precisely
   * the round trip it is measuring, and precisely why the slot has to be long enough to hold the
   * drift at both ends (design §6.1's two-sided bound, enforced by the scenario schema).
   *
   * The interval is counted on **this device's own crystal**, so it is converted to true time
   * through `UwbClock.after` — a responder running fast answers early in wall-clock terms. That is
   * what leaves `ssTwrCorrected`'s (1 − coffs) with the same job it always had (design §8), and it
   * is why `fixedReplyRctu` is a count of counter units rather than a span of nanoseconds.
   *
   * `rxTrueNs`/`rxExtraNs` are the two halves of the timestamp this receiver just took of the
   * Poll — the true RMARKER and the delay its own estimator added to it. The responder aims off
   * the instant it *believes*, noise and all, exactly as real hardware schedules a delayed
   * transmission off its own receive timestamp register.
   */
  private armFixedReply(r: RoundState, rxTrueNs: Ns, rxExtraNs: number): void {
    if (this.cfg.role !== 'anchor' || !this.repliesAtFixedDelay(r, 'uwbResp')) return
    // The slot this anchor answers in, which is also the stagger that keeps the responders apart:
    // its own place in the Poll's RDM IE in a time-scheduled round, and the slot it drew in a
    // contention one (`contention` + `fixed` is a legal pairing — design §3.1 calls it the most
    // worth allowing, since a contention round wants the shortest frame it can get). Null means
    // it drew none and is sitting the round out.
    const index = r.anchors.indexOf(this.id)
    const slot = r.plan.schedule === 'contention' ? r.contendSlot : index + 1
    if (slot === null || slot < 1 || index < 0 || r.pollNs === null) return
    const rmarkerNs = this.clock.after(rxTrueNs, rxExtraNs, fixedReplyRctu(r.plan, slot, r.pollNs))
    // The queue is given the instant the *PPDU* starts; the RMARKER is what the arithmetic above
    // aimed at, and `send` puts it one `UWB_RMARKER_NS` after the start (see `transmitFor`).
    const startNs = rmarkerNs - UWB_RMARKER_NS
    this.at(startNs, () => {
      // The queue outlives a round. A fixed reply time past design §6.1's upper bound can push
      // this instant clean out of the round it belongs to, and a Response radiated into the next
      // round would be a transmitter nobody scheduled — so the round is checked, not assumed.
      if (this.round !== r) return
      this.transmitFor(
        { kind: 'uwbResp', tx: 'anchor', anchor: index }, slot, r, { tag: r.tagId, anchors: r.anchors },
      )
    })
  }

  /** The expected frame arrived: drop the expectation without reporting a miss. */
  clearExpectation(): void {
    this.expect = null
  }

  /**
   * Do something at an instant the slot grid does not name.
   *
   * Every other action of a ranging round is a slot's: the schedule calls `onSlot` and the device
   * transmits or listens there and then. Two things of P802.15.4ab are not, and both are MMS
   * packets that start somewhere inside a slot rather than at its edge (see ./device.mms): the
   * **fixed reply time**, where the responder starts its own packet a pre-agreed interval after it
   * finished receiving the initiator's — which depends on the flight time and so is known only at
   * run time (`armFixedReply`) — and the **reversed order**'s 600 RSTU, which the initiator holds
   * its packet back by inside the sub-round the layout gave it (`txPacketFragment`). The queue's
   * MAC phase is the same phase a slot tick runs in, so an action scheduled here and a slot
   * boundary at the same instant keep the order they were queued in; a delivery at that instant is
   * phase 1 and therefore still lands after both.
   *
   * The callback must check that the round it was armed for is still the current one: the queue
   * outlives a round, and a fragment radiated into the next one would be a transmitter nobody
   * scheduled.
   */
  at(ns: Ns, fn: () => void): void {
    this.q.schedule(ns, fn, 0)
  }

  listenFor(slot: number, from: string, kind: UwbFrameKind, until = slot + 1, silent = false): void {
    this.setState('uwbWait')
    this.expect = { slot, from, kind, until, open: false, silent }
  }

  /** Tag, contention round: listen through a response slot for whichever anchor drew it, if any. */
  private listenOpen(slot: number): void {
    this.setState('uwbWait')
    this.expect = { slot, from: null, kind: 'uwbResp', until: slot + 1, open: true, silent: false }
  }

  transmitFor(action: ScheduledAction, slot: number, r: RoundState, peers: { tag: string; anchors: string[] }): void {
    const t = this.now()
    const txCounter = this.clock.counter(t + UWB_RMARKER_NS)
    if (r.plan.mode === 'dl-tdoa') {
      transmitDl(this, action, slot, r, peers, txCounter)
      return
    }
    if (r.plan.mode === 'm2m') {
      transmitM2m(this, action, slot, r, txCounter)
      return
    }
    switch (action.kind) {
      case 'uwbBlink': {
        // UL-TDoA: the whole of a tag's participation. It carries no times — the anchors take
        // them on arrival — so nothing of this round is kept at the tag, and nothing is expected
        // back: there is no round state to update here at all.
        this.send(makeBlink(this.id, r.block, r.round), txCounter)
        break
      }
      case 'uwbPoll': {
        r.txPollCounter = txCounter
        // Which of the two messages this block's slot 0 carries (standard §10.32.9.1, design §2):
        // the control message at the head of each validity window, the initiation message alone in
        // the blocks that window already paid for — no ARC, no RDM, `13 + 3A` octets lighter.
        //
        // It carries **no schedule** (Ruling 3): the responders' slot table came from the still-
        // valid control message and restating it here would delete the saving, which is precisely
        // those two IEs. The block and round numbers every frame already carries are what say which
        // window's round this is. The two ends agree through `openerKind` and nothing else.
        const opener = this.openerKind(r, 'uwbPoll') === 'uwbInit'
          ? makeInit(this.id, r.plan.method, r.block, r.round)
          : makePoll(this.id, peers.anchors, r.plan.method, r.block, r.round, {
            schedule: r.plan.schedule, contentionSlots: r.plan.contentionSlots,
            maxAttempts: this.cfg.maxAttempts,
          })
        // Its airtime, kept for the one thing that reads it: reconstructing a fixed reply time,
        // which is counted from the end of this PPDU at the responder (see `fixedReplyRctu`). It is
        // read off the frame this round actually sent, at both ends, which is what lets the two
        // messages differ in length without either end assuming the other's.
        r.pollNs = opener.txTimeNs
        this.send(opener, txCounter)
        break
      }
      case 'uwbResp': {
        // An anchor that never heard the Poll has nothing to reply to: its slot
        // stays empty, and the tag's own deadline reports the gap.
        //
        // …unless it still holds the control message that gave it this slot (standard §10.34): then
        // the slot carries the ranging message non-receipt frame instead of silence, and what used
        // to be one indistinguishable `UWB_TIMEOUT` at the initiator becomes a named reason —
        // "this responder is still here, still configured by your control message, and did not hear
        // this round's initiation message" (design §3.1). The frame takes no ranging counter: it
        // carries no times, and nothing in the round is measured from it.
        if (r.rxPollCounter === null) {
          if (this.owesRmnr(r, 'uwbResp')) this.send(makeRmnr(this.id, r.tagId, r.block, r.round, slot), null)
          return
        }
        r.txRespCounter = txCounter
        // Which of the three routes this round's reply time takes (design §2), decided here and
        // sized to match by `makeResp`/`uwbRespBytes`:
        //   embedded — it rides this very frame, which the responder can only do because the
        //              schedule told it `txCounter` before it transmitted;
        //   deferred — it cannot ride this frame (this frame's own send time is what it would
        //              have to contain), so the follow-up message below carries it instead;
        //   fixed    — it need not ride any frame: the tag already knows it from the session.
        const embedded = r.plan.method === 'ss' && r.plan.replyTime === 'embedded'
        const replyRctu = embedded ? counterDiff(txCounter, r.rxPollCounter) : undefined
        this.send(
          makeResp(
            this.id, r.tagId, r.plan.method, r.block, r.round, slot, replyRctu, undefined, r.plan.replyTime,
          ),
          txCounter,
        )
        break
      }
      case 'uwbSsDefer': {
        // SS-TWR deferred (standard §10.29.6.3), the whole reason the shape costs a second slot
        // per anchor: the Response went out empty, and only *afterwards* could this anchor read
        // its own transmit timestamp back off the radio. `r.txRespCounter` is that read-back, and
        // this frame is the one place it ever reaches the tag.
        //
        // No Response, no follow-up: an anchor that never heard the Poll transmitted nothing to
        // report the reply time of, and a reply time with no Response to pair with would have the
        // tag subtract it from a round trip that does not exist.
        if (r.rxPollCounter === null || r.txRespCounter === null) return
        const replyRctu = counterDiff(r.txRespCounter, r.rxPollCounter)
        this.send(makeSsDefer(this.id, r.tagId, replyRctu, r.block, r.round, slot), txCounter)
        break
      }
      case 'uwbFinal': {
        r.txFinalCounter = txCounter
        const times: { id: string; tround1: number; treply2: number }[] = []
        for (const id of r.anchors) {
          const p = r.peers.get(id)
          if (!p) continue // this anchor never answered: it is left out of the Final
          p.treply2 = counterDiff(txCounter, p.rxRespCounter)
          times.push({ id, tround1: p.tround1, treply2: p.treply2 })
        }
        // Deferred (standard §10.29.6.6): the same list of anchors, none of their times. The list
        // is what the Final still exists for — `finalListedMe` at each anchor reads it to decide
        // whether it may report at all — and dropping the times is what makes the frame 14 + 2A
        // octets instead of 14 + 12A (design §5). The tag still holds `p.treply2` itself, so its
        // own range is unaffected; the anchor's is gone (design §7), and `onFinal` says so.
        this.send(makeFinal(this.id, times, r.block, r.round, slot, undefined, r.plan.replyTime), txCounter)
        break
      }
      case 'uwbReport': {
        // Only an anchor the Final actually listed reports. If the tag never
        // received this anchor's Response — an asymmetric link, or a capture
        // loss at the tag — there is no half-exchange to complete, so the
        // anchor stays silent rather than putting a useless PPDU on the air.
        if (!r.finalListedMe) return
        if (r.rxPollCounter === null || r.txRespCounter === null || r.rxFinalCounter === null) return
        const treply1 = counterDiff(r.txRespCounter, r.rxPollCounter)
        const tround2 = counterDiff(r.rxFinalCounter, r.txRespCounter)
        this.send(makeReport(this.id, r.tagId, treply1, tround2, r.block, r.round, slot), txCounter)
        break
      }
    }
  }

  /**
   * Radiate one PPDU: half-duplex for its whole airtime, RMARKER stamped before it leaves.
   *
   * `txCounter` null means "no ranging counter was taken from this transmission" — the
   * P802.15.4ab narrowband control messages, which carry times but are not timed themselves,
   * and every fragment of a train but its first, whose RMARKER times the whole train.
   */
  send(desc: FrameDesc, txCounter: number | null): void {
    const t = this.now()
    // The MHR's Sequence Number is a real per-device counter, as in any 802.15.4
    // device, so the decoder has a number to show instead of the schedule tuple.
    const frame: FrameDesc = { ...desc, seqNo: this.seqNo }
    this.seqNo = (this.seqNo + 1) % 256
    this.setState('tx')
    if (txCounter !== null) {
      this.emit({
        t, type: 'UWB_TS', node: this.id, dir: 'tx', peer: frame.dst,
        frameKind: frame.kind as UwbFrameKind, counter: txCounter,
      })
    }
    this.ch.transmit(this.id, frame)
    // The timer belongs to *this* transmission: comparing the id keeps a stale
    // one (a PPDU that somehow outlived its slot) from idling the next.
    const txId = ++this.txSeq
    this.q.schedule(t + frame.txTimeNs, () => {
      if (this.state === 'tx' && this.txSeq === txId) this.setState('idle')
    }, 2)
  }

  // ---- measurements ---------------------------------------------------------

  /**
   * Responder, on the frame that opened the round — whichever of the two messages this block
   * carried in slot 0 (standard §10.32.9.1, design §2): the control message, which is also an
   * initiation, or the initiation message alone once a control message has bought the window.
   *
   * One body for both, because **the initiation half is all of this**: the round trip starts at
   * this RMARKER, a fixed reply time is counted from the end of this PPDU, and a contention
   * responder draws its slot on it. Nothing here reads the control content, which is exactly why
   * dropping that content costs the round nothing — and the one thing the control message does
   * extra (refreshing the validity window) is done by its own case above rather than here, so the
   * window cannot renew itself off a message that carries no ARC IE.
   */
  private onInitiation(
    r: RoundState, frame: FrameDesc, counter: number, trueRmarkerNs: Ns, extraNs: number,
  ): void {
    // An anchor keeps only the counter: DS-TWR cancels the clock offset by
    // construction, so it never needs `coffs`, and its range is scored by
    // the Final's first-path quality (the last frame of the exchange).
    r.rxPollCounter = counter
    // …and the one place both of a two-way round's openers land, which is why the receipt bit for
    // standard §10.36's bitmap is written here rather than in the two `case`s above: the control
    // message and the initiation message are the same opener as far as "did your message reach me"
    // is concerned, and splitting that between two call sites is how one of them later gets missed.
    // Keyed by the initiator this round belongs to, never by this device alone (`openerReceipt`).
    this.noteOpener(r.tagId, r.block, r.plan)
    // The PPDU it just decoded, whose last symbol is where a fixed reply time is counted from. Read
    // off the frame that actually arrived, so the two messages' different airtimes need no second
    // definition at either end.
    r.pollNs = frame.txTimeNs
    // The contention draw comes after this reception's timestamp-noise, carrier-offset and
    // (when `aoa` is on) phase draws above, so it never reorders the stream a time-scheduled
    // round takes from the same generator.
    if (r.plan.schedule === 'contention' && this.cfg.role === 'anchor') this.drawContentionSlot(r)
    // …and the fixed reply time is armed after the draw, because in a contention round the
    // slot it answers in is what the draw just decided. It takes no draw of its own, so an
    // embedded or deferred round's stream is untouched by its presence here.
    this.armFixedReply(r, trueRmarkerNs, extraNs)
  }

  /** Tag, on an anchor's Response. SS-TWR finishes the range here; DS-TWR banks it for the Final. */
  private onResponse(r: RoundState, from: string, frame: FrameDesc, counter: number, coffs: number, fom: number): void {
    if (r.txPollCounter === null) return
    const tround1 = counterDiff(counter, r.txPollCounter)
    r.peers.set(from, { id: from, rxRespCounter: counter, coffs, fom, tround1, treply2: null })
    if (r.plan.method !== 'ss') return
    // Deferred: the reply time is not here and could not have been (design §2). The round trip
    // is banked above; `onSsDefer` finishes the range when the follow-up message lands, a whole
    // slot later. Returning here is what makes that visible in the timeline.
    if (r.plan.replyTime === 'deferred') return
    // Fixed: nothing on the air carries the reply time, so the tag rebuilds it — from the session
    // constant and this responder's place in the round, the same two things the responder itself
    // aimed at (`fixedReplyRctu`, and `armFixedReply` on the other side). In a time-scheduled
    // round that place is the anchor's own index in the Poll's RDM IE; in a contention round the
    // anchor *drew* its slot, so the only thing both ends can agree on is the slot the answer
    // actually landed in — which, inside design §6.1's bound, is the slot it drew.
    const replyRctu = r.plan.replyTime === 'fixed'
      ? (r.pollNs === null
        ? undefined
        : fixedReplyRctu(r.plan, r.plan.schedule === 'contention' ? r.slot : r.anchors.indexOf(from) + 1, r.pollNs))
      : frame.uwb?.replyRctu
    if (replyRctu === undefined) return
    const tofRawRctu = ssTwrRaw(tround1, replyRctu)
    const tofRctu = ssTwrCorrected(tround1, replyRctu, coffs)
    reportRange(this, r, from, 'ss', tofRctu, tofRawRctu, fom)
  }

  /**
   * Tag, on an anchor's deferred reply-time message (standard §10.29.6.3): the second half of a
   * single-sided exchange that was split across two frames.
   *
   * Nothing is timed here. This message's own arrival counter is stamped like any other frame of
   * the round — the receiver does not know which frames the arithmetic will read — but the range
   * below uses none of it: the round trip was measured on the **Response**, a slot ago, and the
   * reply time is the payload this frame carries. That is the teaching point of the shape, and
   * the reason the range appears in this slot rather than the one before it.
   *
   * No banked Response, no range: an anchor whose Response was lost (an asymmetric link, or a
   * collision at the tag) may still be heard here, and its reply time then has no round trip to
   * be subtracted from. Branching on it rather than asserting it away is deliberate — the
   * arithmetic would otherwise produce a NaN range and no error anywhere to say so.
   */
  private onSsDefer(r: RoundState, from: string, frame: FrameDesc): void {
    const p = r.peers.get(from)
    const replyRctu = frame.uwb?.replyRctu
    if (!p || replyRctu === undefined) return
    const tofRawRctu = ssTwrRaw(p.tround1, replyRctu)
    // The clock offset and the first-path quality are the Response's, not this message's: they
    // belong to the reception the round trip was measured on, which is the reading being
    // corrected and scored.
    const tofRctu = ssTwrCorrected(p.tround1, replyRctu, p.coffs)
    reportRange(this, r, from, 'ss', tofRctu, tofRawRctu, p.fom)
  }

  /** Anchor, on the tag's Final: it now holds all four times of the double-sided exchange. */
  private onFinal(r: RoundState, from: string, frame: FrameDesc, counter: number, fom: number): void {
    r.rxFinalCounter = counter
    const entry = frame.uwb?.finalTimes?.find((e) => e.id === this.id)
    // Whether the Final listed this anchor decides both its own range and
    // whether it may report at all (see transmitFor's uwbReport case).
    r.finalListedMe = entry !== undefined
    if (!entry) return // the tag never heard this anchor's Response
    // A deferred Final (replyTime: 'deferred', frames.ts's makeFinal) lists this anchor's address
    // — finalListedMe above is already set from that — but carries neither tround1 nor treply2:
    // the round trip and reply time left the frame entirely (design §5). Design §7 says the
    // anchor gets no range at all in that shape, so this is the *correct* outcome, not a failure
    // to work around — an early return, not a throw. It must come before dsTwr either way:
    // `dsTwr(undefined, …, undefined)` returns NaN without throwing (arithmetic on `undefined` is
    // NaN, not an exception), and reportRange would then bank a corrupted UWB_RANGE record with
    // no error anywhere to say so. No session built through device.ts produces a deferred Final
    // yet — this guard is for Task 4, which wires `replyTime` into a device's own round.
    if (entry.tround1 === undefined || entry.treply2 === undefined) return
    if (r.rxPollCounter === null || r.txRespCounter === null) return
    const treply1 = counterDiff(r.txRespCounter, r.rxPollCounter)
    const tround2 = counterDiff(counter, r.txRespCounter)
    reportRange(this, r, from, 'ds', dsTwr(entry.tround1, treply1, tround2, entry.treply2), undefined, fom)
  }

  /** Tag, on an anchor's Report: the anchor's half of the double-sided exchange. */
  private onReport(r: RoundState, from: string, frame: FrameDesc, fom: number): void {
    const p = r.peers.get(from)
    const times = frame.uwb?.reportTimes
    if (!p || p.treply2 === null || !times) return
    reportRange(this, r, from, 'ds', dsTwr(p.tround1, times.treply1, times.tround2, p.treply2), undefined, fom)
  }

  setState(s: UwbDeviceState): void {
    if (this.state === s) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.id, state: s })
  }
}
