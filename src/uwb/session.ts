/**
 * The ranging session schedule (standard §10.32.2): a session is a train of ranging blocks, each
 * block is split into ranging rounds, and each round into ranging slots.
 *
 * The block and slot lengths are fixed before the session starts, in every mode. **The round's
 * length is not, and since slice 3d it is not even fixed by the session's own configuration.** Two
 * features append slots to particular rounds — §10.36's receipt confirmation on the
 * round that closes a ranging round set, §10.35's ancillary message on the round that opens one — so
 * `roundSlots` is the length that is actually run, and it moves with the round's place in its round set. And with
 * §10.35.2.1's Request field a *device* can ask for more of them: the sender of an ancillary
 * message asks the controller to schedule a number of slots for the next exchange, the controller
 * answers by what a block holds (`ancillaryGrantFits`), and the width that comes back is handed to
 * `ancillarySlots`/`roundSlots`/`blockSlotStartNs`/`roundSlotAction` as their optional last
 * argument. That argument defaults to the session's own figure, so every session without a request
 * is laid out exactly as it was; where one exists, the round's length is settled a block at a time.
 *
 * What the schedule decides is who owns a slot. In a **time-scheduled** session (§10.32.3) every slot
 * belongs to exactly one device: no device ever contends for the medium, so a ranging exchange
 * has no backoff, no NAV and no retry, and its reply times are known to the nanosecond in
 * advance. In a **contention** round (§10.32.2 schedule mode 0) the response phase belongs to
 * nobody in particular - each anchor draws a slot in it - so two anchors can and do land in one
 * slot. One tag owns `initiatorRounds` consecutive rounds per block either way (one, unless the
 * session asks for more), so N tags need N × `initiatorRounds` rounds inside the block.
 *
 * A round is laid out as
 *   SS-TWR:            slot 0 Poll (tag) | slots 1..A Response (anchor 0..A-1)
 *   SS-TWR deferred:   … | slots A+1..2A deferred reply-time message (anchor 0..A-1)
 *   DS-TWR:      … | slot A+1 Final (tag) | slots A+2..2A+1 Report (anchor 0..A-1)
 *   contention:  slot 0 Poll (tag) | slots 1..S Response (whichever anchors drew the slot)
 *   DL-TDoA: slot 0 Poll (anchor 0) | slots 1..A-1 Response (anchor 1..A-1) | slot A Final (anchor 0)
 *   UL-TDoA: slot 0 Blink (tag)
 *   m2m SS:  slots 0..N-1, participant i in slot i — its one transmission asks everyone after it
 *            and answers everyone before it (standard §10.32.6)
 *   m2m DS:  the same N slots twice over, because tround2/treply2 need the earlier participant of
 *            a pair to transmit again (standard §10.32.7, design §3)
 *
 * SS-TWR's slot count depends on `replyTime` (design §4): embedded and fixed both carry the reply
 * time on the Response itself (or never put it on the air at all) and stay at `A + 1`; deferred
 * cannot — the anchor does not yet know the Response's own send time while sending it — so it
 * answers empty and follows up, once it has read that timestamp back, with a message of its own in
 * a slot of its own: `2A + 1` slots in total. DS-TWR's slot count never moves with `replyTime`: a
 * deferred Final just carries less (design §4), on the same A+2+A slots.
 */
import { byCodeUnit } from '../engine/hash'
import type {
  NbLbt, NbReportMode, NodeCfg, UwbMode, UwbSessionCfg, UwbSrrrCfg, UwbSsbdCfg,
} from '../model/scenario'
import type { Ns } from '../model/types'
import { mmsLayout, mmsSlotsPerMs, type MmsLayout, type MmsPhy } from './mms'
import {
  mmsResponders, rstuNs, uwbAncillarySlots, uwbMmrcmSlots, uwbSlotsPerTag, type UwbReplyTime,
} from './phy'

export { rstuNs }

export interface RoundPlan {
  method: 'ss' | 'ds'
  anchors: number
  /**
   * `mode: 'm2m'` only (design §5): the round's participant count, and **the field every
   * many-to-many path reads**. It is the very same number `anchors` holds — one caller-supplied
   * "how many others" argument, read under whichever name means something for the mode actually
   * running — so the two alias each other in every mode, and `tests/uwb/m2m-round.test.ts` pins
   * that (Ruling 8 of the slice ledger) rather than leaving it incidental.
   *
   * The aliasing is worth a name of its own because **`anchors` means two different things by
   * mode.** In a two-way round it counts the devices *other than* the tag, so three anchors is
   * four devices; in many-to-many it counts *everyone*, so three participants is three devices.
   * Same number, different quantity — and anything that reads `plan.anchors` in `'m2m'` while
   * meaning "the devices besides the initiator" is wrong by one. Renaming `anchors` to something
   * mode-neutral is the real fix and is deliberately **not** done here: it is read across `src/`
   * and `tests/`, and a rename landing beside a behavioural change is what this branch has twice
   * paid for. It joins `uwbSlotsPerTag`'s own deferred rename (`phy.ts`, Ruling 4) in one later
   * sweep commit, when nothing else is moving.
   *
   * Meaningless outside `'m2m'`; no other reader touches it.
   */
  participants: number
  slots: number
  slotNs: Ns
  roundNs: Ns
  blockNs: Ns
  roundsPerBlock: number
  /** Schedule this round was planned under (standard §10.32.2 / §10.32.3). */
  schedule: 'time' | 'contention'
  /** The session's response-phase window; meaningful only when `schedule` is 'contention'. */
  contentionSlots: number
  /** What the round measures: two-way ranges, or one-way time differences (§10.32.3). */
  mode: UwbMode
  /** Where the two-way reply time travels (design §2/§4): embedded in the Response, carried by a
   * deferred follow-up message of its own, or never sent at all. Read off the session's own `cfg`
   * here, in the one place both ends of a round already have to agree — `uwbSlotsPerTag` needs it
   * to size a deferred SS round, and `slotAction` needs it to know whether slots A+1…2A exist. */
  replyTime: UwbReplyTime
  /**
   * `replyTime: 'fixed'` only: the first responder's fixed reply delay, in nanoseconds, converted
   * from the session's `fixedReplyRstu` exactly once, here — the same reason `slotNs` and `roundNs`
   * are converted here rather than left as RSTU for a device to redo: a round has exactly one
   * nanosecond value for this delay, and a device converting its own copy is a second chance for
   * the two ends of a round to disagree on it.
   */
  fixedReplyNs: Ns
  /**
   * How many rounds this round's own control message (today's Poll) governs before a fresh one
   * is needed — standard §10.32.9.1's ARC IE, "RCM Validity Rounds". Read off the session's own
   * `cfg` here, for the same reason `replyTime` and `mms` are: `roundCarriesRcm` below is the one
   * place both ends of a round decide whether *this* round carries the control content, and a
   * device re-deriving that from a copy of this number would be a second chance to disagree.
   */
  rcmValidityRounds: number
  /**
   * How many consecutive ranging rounds each initiator (tag) runs per block — `UwbSessionCfg.
   * initiatorRounds`, 1 unless the session asks for more, and always 1 outside `mode: 'twr'` (the
   * schema refuses anything else there). Tag k owns rounds `k·n … k·n + n − 1` of every block.
   *
   * It is what makes a ranging round set (standard §10.32.3.2) something a block can hold at all:
   * an RCM's validity counts **rounds** and can never exceed the rounds remaining in the current
   * block (§10.32.9.1), so a set of `rcmValidityRounds` rounds needs that many rounds of one
   * initiator inside one block. `roundSetOf` below is where both numbers are read together.
   */
  initiatorRounds: number
  /**
   * Whether this session confirms, with a dedicated frame of its own, which of an initiator's
   * current-window openers a responder actually received (standard §10.36; design doc
   * 2026-10-02-receipt-confirmation-design.md). Read off the session's own `cfg` here, for the
   * same reason `replyTime`/`rcmValidityRounds`/`mms` are: `roundCarriesMmrcm`/`mmrcmResponders`/
   * `roundSlots` below are the one place both ends of a round decide whether a round carries the
   * extra slot(s), and a device re-deriving that from its own copy of `cfg.mmrcr` would be another
   * chance for the two ends to disagree.
   */
  mmrcr: boolean
  /**
   * SP3 grouped ranging (standard §10.32.8; design `docs/superpowers/specs/2026-10-02-sp3-design.md`
   * §2/§3): run the round's SP1 frames as the physically shortest SP3 marker instead. Read off the
   * session's own `cfg` here, for the same reason `replyTime`/`rcmValidityRounds`/`mmrcr` are — the
   * schema already refuses `sp3` unless `replyTime` is `'deferred'`, so a device deciding what to
   * put on the air reads one settled value rather than re-deriving the same conclusion.
   *
   * Carried straight through by `roundPlan` — this field by itself changes no slot count and no
   * `slotAction` answer (`uwbSlotsPerTag`'s own `2A + 1` for a deferred SS round already is exactly
   * the shape SP3 markers plus one report frame per responder fill; design §2). Which device reads
   * it to choose an SP3 marker over a full frame is a later task's own decision.
   */
  sp3: boolean
  /** The SRRR IE's own RAOA/RRTT request bits (standard §10.32.9.9); see `UwbSrrrCfg` in
   * `model/scenario.ts`. Meaningful only when `sp3` is true; copied rather than referenced, the
   * same reason `mms` below is — a plan outlives the scenario object it was built from. */
  srrr: UwbSrrrCfg
  /**
   * Ranging ancillary information exchange, Request = 0 half (standard §10.35.1; RAICT IE
   * §10.35.2.1; design doc `docs/superpowers/specs/2026-10-02-ancillary-design.md`). Read off the
   * session's own `cfg` here, for the same reason `replyTime`/`rcmValidityRounds`/`mmrcr`/`sp3`
   * are: whichever device later decides what to put in a round's slots reads one settled value
   * rather than re-deriving the same conclusion from its own copy of `cfg.ancillary`.
   *
   * The window this exchange is bounded to is `rcmValidityRounds` above, not a field of its own —
   * see that field's own doc comment, and `UwbSessionCfg.ancillary`'s.
   *
   * Carried straight through by `roundPlan`, which by itself changes nothing here: no device or
   * network wiring reads this field yet (that is a later task's own decision, same as `sp3`'s own
   * doc comment says of itself above).
   */
  ancillary: boolean
  /** How many consecutive slots one ancillary message is segmented across; see
   * `UwbSessionCfg.ancillaryFrames`'s own doc comment for the bound the scenario schema already
   * checks this against (whether the **block** holds the round the appended window makes — slice 3d
   * removed the tighter `≤ plan.slots` one, which stated the wrong mechanism). Meaningful only when
   * `ancillary` is true. */
  ancillaryFrames: number
  /**
   * Ranging ancillary information, **Request = 1** (standard §10.35.1's last sentence and
   * §10.35.2.1's Request field; design doc
   * `docs/superpowers/specs/2026-10-05-ancillary-request-design.md`): whether the exchange's own
   * sender asks the controller to schedule the next exchange's slots.
   *
   * **This is the one field of this plan that something downstream is allowed to override.** The
   * plan itself is still settled once, in `UwbNetwork`'s constructor, for the whole session — what
   * varies by block is the *granted* width, which `UwbNetwork` holds beside the plan and passes
   * into `ancillarySlots`/`roundSlots`/`blockSlotStartNs`/`roundSlotAction` as their optional last
   * argument. So the plan stays immutable and the block-varying quantity has one owner, rather than
   * the plan becoming mutable and every reader having to know when it last changed.
   */
  ancillaryRequest: boolean
  /** How many slots the request asks for (standard §10.35.2.1: Frames Remaining's second meaning).
   * Meaningful only when `ancillaryRequest` is true. Unbounded by the scenario schema on purpose —
   * `ancillaryGrantFits` below is what answers whether a block holds it, at run time, because that
   * answer is the controller's to give. */
  ancillaryRequestSlots: number
  /** Set exactly when `mode` is 'mms': everything an MMS pair round is laid out from, resolved
   * once here so that no device re-derives it — the two ends of a round must agree on the slot
   * every fragment sits in, and a second copy of `mmsLayout` at the device would be a second
   * chance to disagree. */
  mms?: MmsRoundPlan
}

/** The MMS half of a round plan (P802.15.4ab): the train both devices cut their fragments from,
 * the slot table those fragments and the narrowband messages sit in, and the three control-plane
 * settings a device needs in the round itself. */
export interface MmsRoundPlan {
  phy: MmsPhy
  layout: MmsLayout
  /** The round is one initiator and every anchor of the session (P802.15.4ab one-to-many
   * ranging), rather than one tag–anchor pair. `layout.responders` is the count it implies. */
  oneToMany: boolean
  /**
   * How far apart this round actually spaces one train's fragments, in nanoseconds:
   * `layout.fragGapSlots` slots of `slotNs`. The layout is the only thing that decides that
   * count — this field is a unit conversion of it and nothing more, because the round's two
   * readings of the spacing (the slots the fragments are placed in, and the ruler the receiver
   * measures with) have to be the same reading.
   *
   * An interleaved round spaces them (R + 1) slots, the width of one "millisecond" of its shared
   * ranging phase. A true millisecond (`MS_NS`) is the **pairwise round at the draft's 600 RSTU
   * slot** — which every shipped scene runs — and nothing else: an MMS slot must be a multiple of
   * 300 RSTU and two of them must hold the 608.2 µs REPORT, so 600 RSTU is the shortest legal slot
   * and no legal slot makes (R + 1) of them a millisecond for R > 1. A one-to-many interleaved
   * round's fragments are therefore always further apart than the draft's millisecond, and the
   * answer is to say so rather than to look for a slot that fixes it.
   *
   * A non-interleaved round has one transmitter per sub-round, so the device count drops out and
   * the gap is a millisecond's worth of slots whatever R is — the one thing that shape is better
   * at. It is never *less* than a millisecond either, which matters: the gap is what earns a
   * fragment its millisecond of regulatory energy budget, and half the gap would be twice the
   * permitted mean power.
   *
   * The receiver measures its clock ratio and walks its RMARKER back over *this* span rather
   * than over the nominal millisecond, because this is the span the schedule really produced —
   * a receiver that assumed 1 ms in a round that spaces them at 2 ms would read a clock ratio of
   * 2 and a range of tens of kilometres.
   */
  fragGapNs: Ns
  report: NbReportMode
  /** The session's narrowband allow list; the block's own channel is drawn from it per block.
   * **Empty under Config 1**, which has no narrowband radio at all — so no channel is drawn and
   * `nbLbt` has nothing to sense. 4ab draft 15-25/0194r0 */
  nbChannels: number[]
  nbLbt: NbLbt
  /**
   * Spectrum sensing based deferral (standard §10.45 — a P802.15.4ab **draft** clause; see
   * `UwbSsbdCfg`'s own doc comment in `model/scenario.ts`). `null` when the session's own `ssbd`
   * is off, which the schema's `superRefine` already guarantees cannot coexist with
   * `control: 'uwbd'` or `nbLbt: 'off'` — so a device reading a non-null value here always has a
   * narrowband radio and listen-before-talk to run it against.
   *
   * Copied, not referenced — the same reason `srrr` above is: a plan outlives the scenario object
   * it was built from. No device reads this field yet; `nbClear`'s per-block discontinuation
   * (`src/uwb/device.mms.ts`) is still the only narrowband listen-before-talk path, and replacing
   * it with SSBD's own per-slot algorithm is a later task's own work.
   */
  ssbd: UwbSsbdCfg | null
}

/**
 * The fixed shape of one round, and how many of them fit in a block.
 *
 * Two-way ranging and UL-TDoA give each tag a round of its own, and as many of them fit in the
 * block as the arithmetic allows. A DL-TDoA block holds exactly one round — the anchors' own,
 * run whether or not anyone is listening — because every tag in the scenario positions itself
 * from that same round; a second copy would only cost air.
 */
export function roundPlan(cfg: UwbSessionCfg, anchors: number): RoundPlan {
  // How many slots a millisecond of the MMS cycle costs at this session's slot length: the layout
  // needs it, and so does the slot count below, which is the same layout measured.
  const slotsPerMs = mmsSlotsPerMs(cfg.slotRstu)
  const slots = uwbSlotsPerTag(
    cfg.method, anchors, cfg.schedule, cfg.contentionSlots, cfg.mode, cfg.mms, slotsPerMs, cfg.replyTime,
    // SP3's round carries two slots an SP1 round does not — the initiator's own marker always, and
    // its own measurement report when some responder asked for the round trip (design §4.1). Handed
    // over only when the feature is on, so every other session's slot count is the one it was.
    cfg.sp3 && cfg.mode === 'twr' ? { rrtt: cfg.srrr.rrtt } : undefined,
  )
  const slotNs = rstuNs(cfg.slotRstu)
  const layout = cfg.mode === 'mms' ? mmsLayout(cfg.mms, mmsResponders(cfg.mms, anchors), slotsPerMs) : null
  const roundNs = slots * slotNs
  const blockNs = rstuNs(cfg.blockRstu)
  return {
    method: cfg.method, anchors, participants: anchors, slots, slotNs, roundNs, blockNs,
    // One round per block in the two modes whose round belongs to the whole group rather than to
    // one tag: DL-TDoA's anchor round, which every tag positions itself from, and a many-to-many
    // round, which holds every participant at once (design §5). In both, a second copy of the
    // round inside the block would only cost air — and the number is read by the editor's own
    // plan note, so answering "how many would fit" there would be a lie about what runs.
    roundsPerBlock: cfg.mode === 'dl-tdoa' || cfg.mode === 'm2m' ? 1 : Math.floor(blockNs / roundNs),
    schedule: cfg.schedule, contentionSlots: cfg.contentionSlots, mode: cfg.mode,
    replyTime: cfg.replyTime, fixedReplyNs: rstuNs(cfg.fixedReplyRstu),
    rcmValidityRounds: cfg.rcmValidityRounds, mmrcr: cfg.mmrcr,
    initiatorRounds: cfg.mode === 'twr' ? cfg.initiatorRounds : 1,
    sp3: cfg.sp3, srrr: { ...cfg.srrr },
    ancillary: cfg.ancillary, ancillaryFrames: cfg.ancillaryFrames,
    ancillaryRequest: cfg.ancillaryRequest, ancillaryRequestSlots: cfg.ancillaryRequestSlots,
    // Copied, not referenced: a plan outlives the scenario object it was built from, and a
    // device reading the train's shape must not be able to see it edited underneath.
    ...(layout
      ? {
        mms: {
          phy: { ...cfg.mms },
          layout,
          oneToMany: cfg.mms.oneToMany,
          // Read off the layout, never worked out again here: the layout is what placed the
          // fragments, so it is the only thing that knows how far apart it placed them.
          fragGapNs: layout.fragGapSlots * slotNs,
          report: cfg.mms.report,
          nbChannels: [...cfg.mms.nbChannels],
          nbLbt: cfg.mms.nbLbt,
          ssbd: cfg.mms.ssbd ? { ...cfg.mms.ssbd } : null,
        },
      }
      : {}),
  }
}

/** Absolute start of one slot of one round of one block, for a round plan whose rounds all have
 * the same length (`plan.slots`) — every round of every session with neither `mmrcr` nor
 * `ancillary` on. `blockSlotStartNs` is the general form. */
export function slotStartNs(p: RoundPlan, block: number, round: number, slot: number): Ns {
  return block * p.blockNs + round * p.roundNs + slot * p.slotNs
}

/**
 * Many-to-many's participant order (design §5): every UWB node of the scenario, sorted by node
 * id — not by the order the scenario's own node list happens to hold them in.
 *
 * `model`: the standard leaves slot ownership to a scheduling table the devices negotiate
 * (§10.32.2), and this simulator has no such table to negotiate — it has to make the same
 * decision some other deterministic way. Node id is that way, chosen over scenario order
 * specifically because scenario order is not stable: the editor's own add/delete/reorder
 * operations change it, so two floor plans that describe the same geometry — the same nodes, the
 * same positions, added in a different order — would otherwise get a different slot assignment
 * and a different timeline hash for no physical reason at all. Sorted with `byCodeUnit`
 * (engine/hash.ts), the same tie-break the timeline hash's own same-instant ordering already
 * uses, so this list and that hash cannot disagree about what "deterministic order" means.
 *
 * Only `kind: 'uwb'` nodes are participants: `uwb.role` decides how a node is drawn, never
 * whether it takes part (design §5).
 */
export function m2mParticipants(nodes: NodeCfg[]): string[] {
  return nodes.filter((n) => n.kind === 'uwb').map((n) => n.id).sort(byCodeUnit)
}

/** Who transmits in a slot, and what. In two-way ranging the tag opens and closes the round; in
 * DL-TDoA the anchors own every slot (anchor 0 polls and finals, anchors 1…N−1 respond) and the
 * tags only listen; in UL-TDoA the tag's single slot holds its blink. */
export type SlotAction =
  | { kind: 'uwbPoll'; tx: 'tag' }
  | { kind: 'uwbPoll'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbResp'; tx: 'anchor'; anchor: number }
  // SS-TWR deferred only (design §4): the follow-up message that carries the reply time the
  // Response could not, in the round's own slots A+1…2A — a kind of its own, not `'uwbResp'`
  // again, because a round can now put two different messages on the air per anchor.
  | { kind: 'uwbSsDefer'; tx: 'anchor'; anchor: number }
  // SP3 grouped ranging (standard §10.32.8.2, design §3.1/§4.1): one bare SP3 marker. Its own kind,
  // not `'uwbResp'`/`'uwbSsDefer'` again, for the reason those two are separate from each other —
  // the frame in this slot is a different frame, and `transmitFor` has to be able to tell it apart.
  // **Both ends have one**: Figure 10-242 draws the initiator's own marker (the ranging initiation)
  // as a transmission of its own, separate from the RCM, which cannot be a marker because it
  // carries payload. The initiator's variant names no anchor, like `uwbPoll`'s.
  | { kind: 'uwbSp3'; tx: 'tag' }
  | { kind: 'uwbSp3'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbFinal'; tx: 'tag' }
  | { kind: 'uwbFinal'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbReport'; tx: 'anchor'; anchor: number }
  // …and the measurement report going the other way, which only an SP3 round has (§10.32.8.2's own
  // report phase, design §4.1): the initiator conveying the round-trip time to the responders that
  // asked for it (the SRRR IE's RRTT bit). It is the same kind of frame — §10.29.8.4's RMI IE — and
  // so the same `FrameKind`; what is new is the direction, which `tx` carries.
  | { kind: 'uwbReport'; tx: 'tag' }
  | { kind: 'uwbBlink'; tx: 'tag' }
  // Many-to-many (standard §10.32.6 SS / §10.32.7 DS, design §5): participant `index`'s one
  // transmission of pass `pass`. It is a kind of its own, not `'uwbPoll'` or `'uwbResp'` again,
  // because one transmission is both at once — the question for every later participant and the
  // answer for every earlier one — and `transmitFor` has to be able to tell that apart from a
  // two-way round's Poll or Response. `tx: 'peer'` for the same reason: every participant plays
  // both roles, so neither 'tag' nor 'anchor' names it honestly. SS has one pass (`pass: 0`); DS
  // has two (design §3) — `pass: 1` is the second pass a DS round needs so `tround2`/`treply2`
  // have a transmission of the earlier participant's to attach to.
  | { kind: 'uwbM2m'; tx: 'peer'; index: number; pass: 0 | 1 }
  // P802.15.4ab, the pairwise MMS cycle. The pair's anchor is always `anchor: 0` — a pair round
  // holds exactly one responder, and the network is what maps round t·A + k to anchor k.
  | { kind: 'nbPoll'; tx: 'tag' }
  | { kind: 'nbResp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbRsf' | 'uwbRif'; tx: 'tag' | 'anchor'; anchor: number; index: number }
  | { kind: 'nbReport'; tx: 'tag' | 'anchor'; anchor: number }
  // …and the same three messages under Config 1, which has no narrowband radio: one SP0 packet
  // format on the UWB PHY, with the role that names it. The slot is the same slot — it is the
  // radio underneath that changed. 4ab draft 15-25/0194r0
  | { kind: 'uwbSp0'; role: 'poll'; tx: 'tag' }
  | { kind: 'uwbSp0'; role: 'resp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbSp0'; role: 'report'; tx: 'tag' | 'anchor'; anchor: number }
  /** Nobody transmits: the second slot of each two-slot narrowband window, a ranging slot the
   * train does not reach, and a report slot the session's report mode does not use. */
  | { kind: 'idle' }

// --- Ranging round sets (standard §10.32.3.2, §10.32.9.1) ---------------------------------------

/**
 * Where within-block round `round` sits in its **ranging round set**: the set's first round (a
 * within-block round index), how many rounds the set holds, and this round's place in it.
 *
 * A ranging round set is the run of consecutive rounds one RCM governs (standard §10.32.3.2); the
 * number is the ARC IE's RCM Validity Rounds, which counts this round too and **cannot exceed the
 * rounds remaining in the current block** (§10.32.9.1). So a set never leaves its block, and what a
 * validity window counts is rounds, never blocks.
 *
 * In two-way ranging, tag k owns rounds `k·n … k·n + n − 1` of the block (`plan.initiatorRounds`
 * = n), and its sets tile that run every `plan.rcmValidityRounds` (R) rounds. Where the run is not
 * a whole number of sets, the last one is cut to the rounds that remain — that RCM's validity field
 * says so — rather than reaching into another tag's round or the next block. The schema refuses
 * R > n outright, so with the defaults (n = R = 1) every round is a one-round set of its own: the
 * behaviour every scene had before round sets existed, round for round.
 *
 * Every other mode pins R at 1 in the schema (none of them sends an RCM with a validity of its
 * own to extend), so each of their rounds is its own one-round set too.
 *
 * **The one place this is decided.** Both ends of a round read it — the initiator to choose between
 * the RCM and the bare initiation message, the responders to know which message to expect and how
 * long a control message they decoded stays valid — and a device working it out again from its own
 * copy of the two numbers is a second chance to disagree.
 */
export interface RoundSetPos {
  /** The set's first round, as a within-block round index. */
  first: number
  /** How many rounds the set holds: the RCM Validity Rounds its RCM carries. */
  length: number
  /** This round's place in the set, 0 for the round that carries the RCM. */
  index: number
}

export function roundSetOf(plan: RoundPlan, round: number): RoundSetPos {
  if (plan.mode !== 'twr') return { first: round, length: 1, index: 0 }
  const n = Math.max(1, plan.initiatorRounds)
  const r = Math.max(1, Math.min(plan.rcmValidityRounds, n))
  const runStart = round - (round % n)
  const j = round - runStart
  const first = runStart + j - (j % r)
  const length = Math.min(r, runStart + n - first)
  return { first, length, index: round - first }
}

/**
 * Whether round `round` carries the control content (ARC + RR + RDM + RRMC, today's Poll) rather
 * than the initiation message alone: true exactly on the first round of every ranging round set
 * (standard §10.32.3.2: each set is defined by its RCM at the beginning of the set's first round).
 *
 * It does not change the slot table: slot 0 is always the round's control-or-initiation message,
 * whichever this round turns out to carry, and every other slot's owner is unaffected — only what
 * goes into slot 0 depends on this (`tests/uwb/rcm-validity-schedule.test.ts` pins `slotAction`
 * identical across every `rcmValidityRounds` setting).
 *
 * **It takes a within-block round index**, and that is the correction this function exists for.
 * Until 2026-11-10 it was `blockCarriesRcm(plan, block)` — `block % R === 0` — because each tag had
 * one round per block and the window had to be counted in blocks; one RCM then governed R whole
 * blocks, which §10.32.9.1 forbids (audit #23).
 */
export function roundCarriesRcm(plan: RoundPlan, round: number): boolean {
  return roundSetOf(plan, round).index === 0
}

// --- Multiple-message receipt confirmation (standard §10.36; design doc
// 2026-10-02-receipt-confirmation-design.md, task 2) -----------------------------------------

/**
 * True on the round that *closes* its ranging round set (design §3.3): the bitmap that round's
 * extra slot(s) carry covers the whole set, so it cannot go out before the set's last round has
 * run. False everywhere else, including every round when `plan.mmrcr` is off — there is nothing to
 * place, so this never changes what `roundSlots` answers for an existing scenario.
 *
 * `roundCarriesRcm` is true on a set's *first* round; this on its last. Both read `roundSetOf`, so
 * the two can never disagree about where a set's edges are.
 */
export function roundCarriesMmrcm(plan: RoundPlan, round: number): boolean {
  if (!plan.mmrcr) return false
  const set = roundSetOf(plan, round)
  return set.index === set.length - 1
}

/**
 * How many MMRCM slots the set-closing round adds: **one per responder**, because a responder is
 * what sends one.
 *
 * **Corrected (2026-10-02).** Design §3.3 and this plan both said "one slot per initiator", and
 * Task 2 implemented that faithfully — one slot in a two-way round, since such a round has one tag.
 * It is wrong, and Task 2 flagged the symptom without being able to name the cause: *N* anchors
 * would all have had to answer from that single slot. The confusion is that §10.36 has two counts
 * and they belong to different things —
 *
 *   - the **IE** carries one list entry per **initiator**, because one responder may have heard
 *     several (`uwb/phy.ts#uwbMmrcmBytes` takes that count), and
 *   - the **slots** are one per **responder**, because each responder sends its own frame.
 *
 * In a two-way round that is N anchors answering the one tag, each with a single-entry IE. In
 * `'m2m'` every participant is both, so the two counts coincide — which is exactly why the error
 * was invisible there and why `'m2m'` was the mode this clause was reasoned about.
 *
 * `0` when `plan.mmrcr` is off, a documented, inert answer rather than a thrown error.
 */
export function mmrcmResponders(plan: RoundPlan): number {
  // One definition, in `phy.ts`, because the scenario schema's block-fit rule needs the same number
  // and cannot import this file (see `uwbMmrcmSlots`' own comment).
  return uwbMmrcmSlots(plan.mode, plan.mode === 'm2m' ? plan.participants : plan.anchors, plan.mmrcr)
}

// --- Ranging ancillary information, Request = 0 (standard §10.35; design doc
// 2026-10-02-ancillary-design.md, task 3) ----------------------------------------------------

/**
 * True on the rounds the ancillary exchange runs in: **the first round of each ranging round set**
 * (standard §10.35.1, design §3).
 *
 * §10.35.1 bounds the exchange to the current ranging round plus the rounds this RCM still governs,
 * and the field that says how many those are is the ARC IE's RCM Validity Rounds (§10.32.9.1) — the
 * round set. So the boundary is read off `roundCarriesRcm` rather than given a second expression of
 * its own: this is that set's third reuse, after §10.34's RMNR (`holdsValidRcm`) and §10.36's
 * receipt bitmap (`roundCarriesMmrcm`).
 *
 * One message per set, at the set's first round. With `rcmValidityRounds: 1` — the default — every
 * round opens its own set and the exchange runs in every one of them; with R = 4 and four rounds a
 * block the message goes out in the block's first round and in none of the three after it.
 *
 * False whenever `plan.ancillary` is off (the default), and false in every mode but `'twr'` — the
 * schema refuses the exchange in each of the others because none of them sends an ARC IE at all.
 */
export function roundCarriesAncillary(plan: RoundPlan, round: number): boolean {
  return plan.ancillary && plan.mode === 'twr' && roundCarriesRcm(plan, round)
}

/**
 * How many slots this round appends for the ancillary message, from the one definition in
 * `phy.ts#uwbAncillarySlots` — one per fragment under a time schedule, the round's own contention
 * window under a contention one, and 0 whenever the exchange is off. See that function for why the
 * two schedules differ and why the count cannot live in this file.
 *
 * It does **not** ask which round: the count is a property of the session's shape, and whether a
 * given round spends it is `roundCarriesAncillary`'s question.
 */
export function ancillarySlots(plan: RoundPlan, frames: number | null = null): number {
  return uwbAncillarySlots(
    plan.mode, plan.schedule, plan.contentionSlots, plan.ancillary, frames ?? plan.ancillaryFrames,
    plan.ancillaryRequest,
  )
}

/**
 * How many slots a block holds in total: its own length divided by a slot's. The one expression for
 * it in this file, read by `ancillaryGrantFits` below and nowhere else — the scenario schema
 * computes the identical thing in RSTU, before `rstuNs` rounds.
 */
function slotsPerBlock(plan: RoundPlan): number {
  return Math.floor(plan.blockNs / plan.slotNs)
}

/**
 * **Whether the controller can grant a request of `frames` message frames** (standard §10.35.2.1's
 * Request field; design §3.5) — and the whole of why no new constant was invented for it.
 *
 * §10.35 defines the request and nothing else: no grant, no refusal, no response. So *whether* to
 * grant is this engine's decision (model), and the only honest place to anchor it is the arithmetic
 * the engine and the schema already each do once — does the block hold the initiator's rounds,
 * each with whatever receipt-confirmation and ancillary slots its place in its round set appends, at
 * the granted width. Every term is already on the plan; nothing here is a threshold somebody chose.
 *
 * One initiator per block, because `ancillaryRequestRefusals` refuses the request outright for a
 * session with more than one tag — one tag, one controller, one grant.
 *
 * So in the shipped lesson hall (a 200 ms block of 2 ms slots, a 5-slot SS round, one round a block,
 * no `mmrcr`) a request is granted up to 94 and refused at 95 and above: 100 − 5 − 1 for the next
 * request's own slot. That number is `blockNs`, `slotNs` and `plan.slots` talking, not a figure in a
 * lesson.
 */
export function ancillaryGrantFits(plan: RoundPlan, frames: number): boolean {
  let total = 0
  for (let r = 0; r < plan.initiatorRounds; r++) total += roundSlots(plan, r, frames)
  return total <= slotsPerBlock(plan)
}

/**
 * How many slots round `round` actually runs: `plan.slots`, plus the set-closing MMRCM slots `mmrcr`
 * adds (design §3.3 of the receipt-confirmation doc), plus the ancillary message's own slots on a
 * set-opening round (standard §10.35.1, ancillary design §4.2).
 *
 * Rounds that carry neither are `plan.slots` exactly, which is every round of every session with
 * both features off (both default off).
 *
 * **The two batches are ordered, here, once.** `mmrcr`'s slots come first and the ancillary
 * message's after them. The two are independently sized and appended for unrelated reasons, so
 * *something* has to decide; what must not happen is each caller deciding. (The schema refuses
 * `sp3` + `ancillary` for exactly this reason — SP3's report phase is a third such batch, and that
 * slice did not define where it sits relative to this one.) With a set of more than one round the
 * two never even meet: `mmrcr` spends its slots on the set's **last** round and `ancillary` on its
 * **first** one.
 *
 * Until 2026-11-10 this was `blockSlots(plan, block, …)`, keyed by the block index, for the reason
 * `roundCarriesRcm`'s own note gives.
 */
export function roundSlots(plan: RoundPlan, round: number, frames: number | null = null): number {
  return plan.slots
    + (roundCarriesMmrcm(plan, round) ? mmrcmResponders(plan) : 0)
    + (roundCarriesAncillary(plan, round) ? ancillarySlots(plan, frames) : 0)
}

/**
 * Absolute start of one slot of one round of one block, `mmrcr` and `ancillary` included — the form
 * the scheduler lays a block out with.
 *
 * A round starts where the rounds before it in the block end, so the start is the block's own start
 * plus the **actual** lengths of every earlier round (`roundSlots`), not `round × plan.roundNs`: on a
 * session whose rounds carry appended slots the rounds are not all one length any more, and a fixed
 * stride would put one round's extra slots on top of the next round's slots 0…A−1 — two transmitters
 * in one slot, and nothing downstream able to notice.
 *
 * **Identical to `slotStartNs` wherever every round is `plan.slots` long**, which is every round of
 * every session with `mmrcr` and `ancillary` off (the defaults) and every round of the modes the
 * schema refuses both for — `'mms'` among them, which is why `device.mms.ts` reading its round's
 * start through `slotStartNs` stays exact.
 */
export function blockSlotStartNs(
  p: RoundPlan, block: number, round: number, slot: number, frames: number | null = null,
): Ns {
  let before = 0
  for (let r = 0; r < round; r++) before += roundSlots(p, r, frames)
  return block * p.blockNs + (before + slot) * p.slotNs
}

/** One MMRCM slot (design §3.2/§3.3): `index` is **which responder** this slot belongs to, in
 * ascending order — 0…A−1 for the anchors of a two-way round, 0…N−1 for the participants of an
 * `'m2m'` one. Kept apart from `SlotAction` rather than added as one more of its members, so that
 * which device actually transmits from the slot stays the device task's decision rather than being
 * handed to the schedule by the shape of the union `device.ts` already switches on. */
export interface MmrcmSlotAction {
  kind: 'uwbMmrcm'
  index: number
}

/**
 * One slot of the ancillary message's appended window (standard §10.35.1, design §4.2): `index` is
 * the slot's place **inside that window**, 0…`ancillarySlots(plan) − 1`, not its place in the round.
 *
 * It names a position and **not a device**, which is the one thing that separates it from
 * `MmrcmSlotAction` above. An MMRCM slot belongs to the responder its index names, every time. An
 * ancillary slot belongs to whichever window index the sender's run happens to cover — under a time
 * schedule the run starts at index 0, under a contention one wherever the sender drew (§10.32.2
 * schedule mode 0) — so the schedule cannot name the transmitter here even in principle, and this
 * action deliberately does not pretend to. Which device sends, and which window indices its run
 * covers, is `device.ancillary.ts`'s decision.
 *
 * Kept apart from `SlotAction` rather than added as one more member of it, for the reason
 * `MmrcmSlotAction` is: every member of that union is a ranging frame with a `tx`/`anchor` shape,
 * and this is not one.
 */
export interface AncillarySlotAction {
  kind: 'uwbAncillary'
  index: number
  /**
   * **The slot the Request = 1 frame was appended for** (standard §10.35.2.1; slice 3d), and it is
   * named here only where the schedule is entitled to name it.
   *
   * Under a **time** schedule the window is exactly the message plus the request, so the request's
   * index is the last one and the slot table knows it. Under a **contention** schedule it is not:
   * the run starts wherever the sender drew, so the request sits after *that* run and the schedule
   * cannot say where any more than it can say who transmits (see this interface's own note above).
   * `false` everywhere in that case, and `device.ancillary.ts` places the frame from its own draw.
   *
   * `false` for every slot of every session with the request off — the default — so a session
   * written before this slice reads back action for action as it was.
   */
  request: boolean
}

/**
 * One slot of round `round`, `slotAction`'s own answer unchanged for every slot below `plan.slots`,
 * then one `MmrcmSlotAction` per set-closing slot and one `AncillarySlotAction` per set-opening slot
 * above it (design §3.3). This is the function that actually moves with the round's place in its
 * round set, unlike `slotAction` itself (pinned unmoved by `rcmValidityRounds`/`rmnr`).
 */
export function roundSlotAction(
  plan: RoundPlan, round: number, slot: number, frames: number | null = null,
): SlotAction | MmrcmSlotAction | AncillarySlotAction {
  if (slot < plan.slots) return slotAction(plan, slot)
  // The appended slots, in the one order `roundSlots` above budgets them in: the receipt
  // confirmation's first, the ancillary message's after. Walked by subtracting each batch's width
  // rather than compared against a running sum, so the two cannot disagree about where the second
  // batch begins.
  let index = slot - plan.slots
  const mmrcm = roundCarriesMmrcm(plan, round) ? mmrcmResponders(plan) : 0
  if (index < mmrcm) return { kind: 'uwbMmrcm', index }
  index -= mmrcm
  const ancillary = roundCarriesAncillary(plan, round) ? ancillarySlots(plan, frames) : 0
  if (index < ancillary) {
    // The request's own slot, named only where a time-scheduled table is entitled to name it —
    // see `AncillarySlotAction.request`. `frames ?? plan.ancillaryFrames` is the message's length
    // in this block, so the index after it is the request's.
    const request = plan.ancillaryRequest && plan.schedule === 'time'
      && index === (frames ?? plan.ancillaryFrames)
    return { kind: 'uwbAncillary', index, request }
  }
  throw new Error(`roundSlotAction: round ${round} has ${roundSlots(plan, round, frames)} slots, asked for ${slot}`)
}

/**
 * One slot of an SP3 round's data report phase, `index` counted from the first responder's.
 *
 * Which frame a responder reports in is the round's own `method`, untouched by SP3: a deferred SS
 * round sends §10.29.6.3's follow-up message, and a DS round sends its Final (the initiator's) and
 * then one measurement report per responder. SP3 changes the *ranging* frames and adds the
 * initiator's two; it does not redesign the double-sided exchange.
 */
function sp3ReportAction(p: RoundPlan, index: number, slot: number): SlotAction {
  if (p.method === 'ss') {
    if (index < p.anchors) return { kind: 'uwbSsDefer', tx: 'anchor', anchor: index }
    throw new Error(`slotAction: SP3 SS round has ${p.slots} slots, asked for ${slot}`)
  }
  if (index === 0) return { kind: 'uwbFinal', tx: 'tag' }
  if (index <= p.anchors) return { kind: 'uwbReport', tx: 'anchor', anchor: index - 1 }
  throw new Error(`slotAction: SP3 DS round has ${p.slots} slots, asked for ${slot}`)
}

export function slotAction(p: RoundPlan, slot: number): SlotAction {
  if (p.mode === 'dl-tdoa') {
    // N + 1 slots: anchor 0's Poll, one Response per other anchor in its own slot, anchor 0's
    // Final. The responder in slot i is anchor i, which is what lets the Final list its RX times
    // in slot order without naming anyone.
    if (slot === 0) return { kind: 'uwbPoll', tx: 'anchor', anchor: 0 }
    if (slot < p.anchors) return { kind: 'uwbResp', tx: 'anchor', anchor: slot }
    if (slot === p.anchors) return { kind: 'uwbFinal', tx: 'anchor', anchor: 0 }
    throw new Error(`slotAction: DL-TDoA round has ${p.slots} slots, asked for ${slot}`)
  }
  if (p.mode === 'ul-tdoa') {
    if (slot === 0) return { kind: 'uwbBlink', tx: 'tag' }
    throw new Error(`slotAction: UL-TDoA round has ${p.slots} slots, asked for ${slot}`)
  }
  if (p.mode === 'mms') return mmsSlotAction(p, slot)
  if (p.mode === 'm2m') {
    // SS: one pass of N slots, participant i in slot i. DS: two passes of N (design §3), pass 0
    // in slots 0..N-1 and pass 1 immediately after in slots N..2N-1 — `uwbSlotsPerTag`'s own N and
    // 2N, walked back into a (pass, index) pair rather than assumed from a second formula.
    const n = p.participants
    if (slot < n) return { kind: 'uwbM2m', tx: 'peer', index: slot, pass: 0 }
    if (p.method === 'ds' && slot < 2 * n) return { kind: 'uwbM2m', tx: 'peer', index: slot - n, pass: 1 }
    throw new Error(`slotAction: m2m round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot === 0) return { kind: 'uwbPoll', tx: 'tag' }
  // SP3 grouped ranging: Figure 10-242's three phases, laid out slot for slot (design §4.1 and
  // `uwbSlotsPerTag`, which counts the very same shape — one function decides how many slots there
  // are and this one decides what is in each, and the two are written against one comment).
  //
  // Slot 0 above is the RCM. Then the initiator's own marker, then one marker per responder, then
  // the report phase: the initiator's own measurement report when some responder set the SRRR IE's
  // RRTT bit, and one report per responder.
  //
  // The report frames themselves are the shape the round's `method` already decides: a deferred SS
  // round's follow-up message (§10.29.6.3), or a DS round's Final and per-responder reports. So this
  // branch only replaces the **ranging** phase and prepends the initiator's two frames; everything
  // after it falls through to the method's own layout below, shifted by the one marker slot.
  if (p.sp3 && p.mode === 'twr') {
    if (slot === 1) return { kind: 'uwbSp3', tx: 'tag' }
    if (slot <= p.anchors + 1) return { kind: 'uwbSp3', tx: 'anchor', anchor: slot - 2 }
    const after = slot - (p.anchors + 2)
    if (p.srrr.rrtt) {
      if (after === 0) return { kind: 'uwbReport', tx: 'tag' }
      return sp3ReportAction(p, after - 1, slot)
    }
    return sp3ReportAction(p, after, slot)
  }
  if (p.schedule === 'contention') {
    if (slot <= p.contentionSlots) return { kind: 'uwbResp', tx: 'anchor', anchor: -1 }
    throw new Error(`slotAction: contention round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot <= p.anchors) return { kind: 'uwbResp', tx: 'anchor', anchor: slot - 1 }
  if (p.method === 'ss') {
    // Deferred only: slots A+1…2A are the follow-up messages, one per anchor, in the same
    // anchor order as the Responses that preceded them (design §4).
    if (p.replyTime === 'deferred' && slot <= 2 * p.anchors) {
      return { kind: 'uwbSsDefer', tx: 'anchor', anchor: slot - p.anchors - 1 }
    }
    throw new Error(`slotAction: SS round has ${p.slots} slots, asked for ${slot}`)
  }
  if (slot === p.anchors + 1) return { kind: 'uwbFinal', tx: 'tag' }
  if (slot <= 2 * p.anchors + 1) return { kind: 'uwbReport', tx: 'anchor', anchor: slot - p.anchors - 2 }
  throw new Error(`slotAction: DS round has ${p.slots} slots, asked for ${slot}`)
}

/**
 * One slot of an MMS round (the table of the spec's "The ranging cycle"). In the interleaved
 * pairwise round slots 0–1 are the initiator's narrowband POLL window and 2–3 the responder's
 * RESP; the ranging phase alternates initiator/responder inside each millisecond; the last four
 * slots are the two report windows. 4ab draft 15-22/0381r5 §1.1
 *
 * Nothing below assumes that shape, because §10.39.7's sub-rounds do not have it: there each
 * device's narrowband window is the head of its own sub-round, so `controlSlots` is a total
 * scattered through the round rather than a prefix at the top of it, and slot 0 belongs to the
 * initiator only when `reversedOrder` did not send the responders first. So every window is
 * *asked for* — `pollSlot`, `respSlot`, `reportSlot` — and every other slot of the round is
 * offered to `slotFragment`, which answers null for the ones no fragment owns.
 *
 * Every fragment slot here comes from `mmsLayout.slotFragment`, the inverse of the
 * `fragmentSlot` the devices place their own fragments with — one map, read both ways, so that
 * the schedule and the device cannot disagree about where a fragment sits. (`tests/uwb/
 * session.test.ts` walks every legal train and every slot to keep that true, and
 * `tests/uwb/mms-schedule.test.ts` pins the interleaved answers slot for slot.)
 */
function mmsSlotAction(p: RoundPlan, slot: number): SlotAction {
  const m = p.mms
  if (!m) throw new Error('slotAction: an MMS round plan carries no MMS parameters')
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.slots) {
    throw new Error(`slotAction: MMS round has ${p.slots} slots, asked for ${slot}`)
  }
  const { layout, report } = m
  // Which radio the round's three control messages ride. Config 2's are narrowband frames;
  // Config 1 has no narrowband radio, so the same three are SP0 packets on the UWB PHY. The slot
  // table below does not change with it — only what is put in the slot. 4ab draft 15-25/0194r0
  const sp0 = m.phy.control === 'uwbd'
  // --- control ---
  // The initiator's POLL opens the round, and every responder then answers in a RESP window of
  // its own — one window in a pair round, N in a one-to-many one, in responder order (4ab draft
  // 15-22/0381r5 Table 1.6.3.1, POLL 0x10 carries the responder list its slots follow). Where
  // those windows are is the layout's business: gathered at the top of an interleaved round, one
  // at the head of each sub-round otherwise.
  //
  // …and whether there are any is the control plane's: a zero-length control phase has no POLL
  // and no RESP window at all, so the layout is not asked where they are. The ranging packet's
  // own leading SYNC+SFD fragment is doing their work, and it is a fragment slot like any other.
  if (layout.controlSlots > 0) {
    if (slot === layout.pollSlot()) {
      return sp0 ? { kind: 'uwbSp0', role: 'poll', tx: 'tag' } : { kind: 'nbPoll', tx: 'tag' }
    }
    for (let k = 0; k < layout.responders; k++) {
      if (slot === layout.respSlot(k)) {
        return sp0
          ? { kind: 'uwbSp0', role: 'resp', tx: 'anchor', anchor: k }
          : { kind: 'nbResp', tx: 'anchor', anchor: k }
      }
    }
  }
  // --- ranging ---
  // The one map, read backwards: `mmsLayout.slotFragment` is built from the same arithmetic as
  // `fragmentSlot`, which is what the devices place their own fragments with. The second slot of
  // every narrowband window, the slots between two fragments a millisecond apart, the idle
  // milliseconds between the two trains, the tail of a ranging phase the draft sizes at 20 slots
  // whatever the train is, and the whole report phase are the slots it answers null for — nobody
  // owns them, so there is no phase bound to test here beyond its own.
  const frag = layout.slotFragment(slot)
  if (frag) {
    return {
      kind: frag.kind === 'rsf' ? 'uwbRsf' : 'uwbRif',
      tx: frag.side === 'initiator' ? 'tag' : 'anchor',
      anchor: frag.responder,
      index: frag.index,
    }
  }
  // --- report ---
  // Present in every round, whatever became of the control phase: the draft sizes the two from
  // separate pairs of parameters, and its own non-interleaved figure draws a Report over a
  // zero-length control phase. So a round whose poll and response are the packet itself still
  // carries its measured times back in a frame — which is what lets it range at all.
  // 4ab draft 15-25/0194r0
  if (layout.reportSlots > 0) {
    for (let k = 0; k < layout.responders; k++) {
      if (slot === layout.reportSlot('responder', k)) {
        if (report === 'initiator') return { kind: 'idle' }
        return sp0
          ? { kind: 'uwbSp0', role: 'report', tx: 'anchor', anchor: k }
          : { kind: 'nbReport', tx: 'anchor', anchor: k }
      }
      if (slot === layout.reportSlot('initiator', k)) {
        if (report === 'responder') return { kind: 'idle' }
        return sp0
          ? { kind: 'uwbSp0', role: 'report', tx: 'tag', anchor: k }
          : { kind: 'nbReport', tx: 'tag', anchor: k }
      }
    }
  }
  return { kind: 'idle' }
}
