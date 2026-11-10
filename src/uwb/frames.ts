/**
 * HRP UWB ranging frames: SP1 PPDUs (standard §16.2, Table 16-1 and Figure 16-3)
 * carrying the ranging IEs of §10.29.8 and §10.32.9.
 * They travel through the same FrameDesc the Wi-Fi engine uses, so the
 * timeline, the frame inspector and the 3-D scene need no second frame type.
 */
import type { FrameDesc, FrameKind } from '../model/frames'
import type { Ns } from '../model/types'
import {
  mmsFragmentDbm, MMS_SP0_MBPS, MMS_SP0_NS, MMS_SP0_PSDU_BYTES, rifNs, rsfNs, type MmsPhy,
} from './mms'
import {
  NB_MSG_ID, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, nbCenterMhz, nbOtmPollBytes, nbPpduNs,
} from './nb'
import {
  UWB_BLINK_BYTES, uwbAncillaryBytes, uwbAncillaryRcmBytes, UWB_REPORT_BYTES, UWB_SS_DEFER_BYTES, uwbDlFinalBytes,
  uwbDlPollBytes, uwbDlRespBytes, uwbDsDeferredReportBytes, uwbFinalBytes, uwbInitBytes, uwbM2mBytes,
  uwbMmrcmBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbRmnrBytes, uwbSp3InitReportBytes, uwbSp3Ns,
  uwbSp3PollBytes, uwbSp3ReportBytes, type UwbReplyTime,
} from './phy'

export type UwbFrameKind =
  | 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport' | 'uwbBlink'
  // SS-TWR's deferred reply-time message (standard §10.29.6.3): its own kind, not a second use of
  // 'uwbResp' — see `makeSsDefer` below and design §4.
  | 'uwbSsDefer'
  // The initiation-only message a later round of a valid RCM carries (standard §10.32.9.1's ARC
  // IE, "RCM Validity Rounds"; design §2 of docs/superpowers/specs/2026-10-01-rcm-validity-
  // design.md). Its own kind rather than a reuse of 'uwbPoll' (fix round 1 of task 1): in the
  // standard the control message and the ranging initiation message are two separate frames —
  // §10.34's own figure draws both — and this engine fuses them only in a ranging round set's first
  // round. A later round's message is not a lighter Poll; it is the one of those two standard
  // messages that remains, and a distinct kind says so where reusing 'uwbPoll' would hide it. See
  // `makeInit` below.
  | 'uwbInit'
  // Many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS): one participant's transmission,
  // which is a question to everyone after it and an answer to everyone before it — see `makeM2m`
  // below and design §2/§4. Its own kind: the frame is neither a Poll nor a Response, and the two
  // roles it plays are what the whole many-to-many slice teaches.
  | 'uwbM2m'
  // The ranging message non-receipt exchange (standard §10.34): a responder that holds a valid
  // RCM but missed this round's initiation message sends this instead of sitting silent in its
  // slot. Its own kind, not a second use of 'uwbResp' — see `makeRmnr` below and design §3 of
  // docs/superpowers/specs/2026-10-01-rcm-validity-design.md.
  | 'uwbRmnr'
  // P802.15.4ab: the two multi-millisecond fragment kinds and the three narrowband messages of
  // the control plane. 4ab draft 15-23/0100r2 §2.3.2 / 15-22/0381r5 Table 1.6.3.1
  | 'uwbRsf' | 'uwbRif' | 'nbPoll' | 'nbResp' | 'nbReport'
  // …and the same three messages under Config 1, where there is no narrowband radio to carry
  // them: one SP0 (BASIC_PACKET) frame format on the HRP UWB PHY, with the role in its content.
  // 4ab draft 15-25/0194r0
  | 'uwbSp0'
  // The answer to a many-to-many receipt-confirmation request (standard §10.36, Figure 10-272
  // "Many-to-Many Messages"): one responder confirming which of an initiator's window-openers it
  // actually received — see `makeMmrcm` below and design §3.2/§3.3 of
  // docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md. Its own kind, not a reuse
  // of 'uwbReport' or 'uwbRmnr': the lesson's whole point is that this frame answers a request
  // (the ARC IE's MMRCR bit), not that it measures anything — a timeline that filed it under
  // either of those existing kinds would say it was part of the ranging itself.
  | 'uwbMmrcm'
  // The SP3 ranging marker (standard §10.32.8.2): SYNC + SFD + STS, no PHR, no PSDU — see
  // `makeSp3` below and design §3.1 of docs/superpowers/specs/2026-10-02-sp3-design.md. Its own
  // kind, not a reuse of 'uwbResp' or 'uwbBlink': the lesson is that this is the physically
  // shortest ranging frame the standard has, which a shared kind would hide.
  | 'uwbSp3'
  // One fragment of a ranging ancillary information message (standard §10.35, Request = 0 half;
  // design §4.1/§4.2 of docs/superpowers/specs/2026-10-02-ancillary-design.md): a RAICT IE whose
  // length is decided by its own two presence bits — this engine's first information unit shaped
  // that way — carrying one slice of a message too large for one frame. Its own kind, not a reuse
  // of 'uwbReport' or 'uwbRmnr': this frame answers no request and times nothing, it only carries
  // a piece of a message the round's actual ranging has nothing to do with. See `makeAncillary`
  // below.
  | 'uwbAncillary'
  // A ranging control message on its own (standard §10.32.2: "A message transmitted by a controller in
  // slot zero, the first slot of a ranging round to configure ranging parameters") — the RCM of the
  // ancillary-information round (ARC Ranging Round Usage = 3, §10.35). A two-way round fuses its RCM
  // with the ranging initiation message (the Poll, `'uwbPoll'`); this round has no ranging initiation
  // to fuse it with, so it carries ARC + RR + RDM (or RCPS) and no RRMC IE.
  | 'uwbRcm'

// Both predicates take the whole `FrameKind` union, not just the UWB half: their callers hold a
// `FrameDesc.kind` (a lane, the timeline, a decoder), and narrowing at the call site would only
// push a cast onto every one of them.

/** True of the three narrowband control messages — the frames that travel on the 4ab
 * narrowband radio rather than on the UWB one. */
export const isNbFrame = (k: FrameKind): boolean => k === 'nbPoll' || k === 'nbResp' || k === 'nbReport'

/** True of the two multi-millisecond fragment kinds: one member of a train, not a frame that
 * stands on its own. */
export const isMmsFragment = (k: FrameKind): boolean => k === 'uwbRsf' || k === 'uwbRif'

/** True of the one bare SP3 marker (standard §10.32.8.2): SYNC + SFD + STS, no PHR, no PSDU —
 * no MAC header and no payload IE to decode, the same way a 4ab fragment has neither. */
export const isSp3Frame = (k: FrameKind): boolean => k === 'uwbSp3'

/**
 * DL-TDoA message content (model, the RMI-style times of §10.29.8.4): what the sender did on its
 * own clock, so that a tag which only listens can put every anchor's transmit instant on anchor
 * 0's timebase. Each time is a 4-octet ranging counter in RCTU.
 */
export interface UwbDlTimes {
  /** The sender's own TX counter for this very frame (stamped at its RMARKER). */
  txCounter: number
  /** RX counters the sender holds, by peer id: the Poll's at a responder, each Response's at
   * anchor 0. Empty on the Poll, which opens the round. */
  rxCounters: Record<string, number>
  /** Response only: the responder's clock offset to anchor 0 as a fraction (ppm x 1e-6) — the
   * carrier frequency offset its receiver measured on the Poll. A fraction is the form the
   * consumer wants (`replyTime * (1 - coffs)`); the frame decoder prints it in ppm. */
  coffs?: number
}

/**
 * Many-to-many ranging content (standard §10.32.6 SS / §10.32.7 DS): what participant i puts on
 * the air in its own slot — its own transmit time, plus its arrival time for every participant
 * that transmitted before it (design §4). This is the same shape as `UwbDlTimes` above — the
 * repo's DL-TDoA Final already carries "my own transmit time plus every arrival I hold" — but not
 * the same type: `UwbDlTimes.coffs` has no counterpart here. A two-way exchange measures the
 * clock offset on receive, exactly as the existing SS-TWR path does (`onResponse`'s `coffs`
 * argument comes from `UwbRxInfo`, never from a frame), so nothing in a many-to-many round ever
 * has a clock offset to put on the air in the first place. A type whose fields are not all
 * shared is not a shared type, hence its own interface rather than a reuse of `UwbDlTimes` with
 * `coffs` left undefined.
 */
export interface UwbM2mTimes {
  /** The sender's own TX counter for this very frame (stamped at its RMARKER). */
  txCounter: number
  /** RX counters the sender holds, by peer id: every participant that transmitted before this
   * one in the round's slot order. Empty for participant 0, which opens the round. */
  rxCounters: Record<string, number>
}

/**
 * One MMRC list element of an RMMRC IE (standard §10.36.2.1, Figure 10-274): the initiator this
 * element answers, and **one bit per slot** of the ranging round set acknowledged
 * (`uwb/session.ts#mmrcmAckSlots`) — set where this responder received a message from that initiator
 * in that slot, clear where it received none or the slot's message was not addressed to it
 * ("The first bit in time sent in the field refers to the first time slot"). Not a packed bitmap:
 * `uwbMmrcmBytes`/`rmmrcEntryBytes` price the packed form (address + MMRC Bitmap Length + bitmap)
 * separately. Until 2026-11-10 this was one bit per round (audit #11).
 */
export interface UwbMmrcEntry {
  /** The initiator's short address. Always 2 octets (`RMMRC_ADDR_BYTES`, model: the standard
   * allows two address sizes and this engine builds the shorter one). */
  initiator: string
  /** True at index i when this responder received a message from the initiator in acknowledged slot i. */
  received: boolean[]
}

/**
 * One SRRR IE (standard §10.32.9.9, Figure 10-255) of an SP3 round's RCM: the request for one
 * requester–provider pair. The requester is the initiator, which is also the controller, so its
 * address is omitted (§10.32.9.9 allows that); `provider` is the responder the request goes to.
 */
export interface UwbSrrrEntry {
  provider: string
  /** RAOA: a report of AOA is required. */
  raoa: boolean
  /** RRT: a report of reply time is required. */
  rrt: boolean
  /** RRTT: a report of round-trip time is required. */
  rrtt: boolean
  /** RTOF: a report of TOF is required. Never set by this engine. */
  rtof: boolean
}

/**
 * One fragment of a multi-millisecond train: which kind it is, where it sits in its train, the
 * PHY parameters it was cut from, and the power it is radiated at. A fragment spends the whole
 * millisecond's energy budget inside its own length, so `txDbm` is the fragment's, not the
 * node's. 4ab draft 15-23/0100r2 §2.3.2
 */
export interface UwbMmsFrag {
  kind: 'rsf' | 'rif'
  /** 0-based index within its own train. */
  index: number
  /** The train's length: X for an RSF, Y for an RIF. */
  of: number
  /** RSF only: MMRS repetitions and the zero gap the symbol was built with. */
  nMsr?: number
  gap?: number
  /** RIF only: the STS segment length, in 512-chip units. */
  stsLen?: number
  /** EIRP of this fragment (dBm), from `mmsFragmentDbm` of its own length. */
  txDbm: number
}

/**
 * A narrowband control message of the 4ab control plane: the channel it went out on, that
 * channel's centre, the compressed PSDU's message-ID octet and whichever time the message
 * carries. 4ab draft 15-22/0381r5 Table 1.6.3.1
 */
export interface UwbNbMsg {
  channel: number
  centerMhz: number
  msgId: number
  /** Responder's REPORT: the ReplyTime it measured, in RCTU. */
  replyRctu?: number
  /** Initiator's REPORT: the TurnAroundTime it measured, in RCTU. */
  roundTripRctu?: number
  /** One-to-many POLL at Message Control 1 (the first sub-round's): the responders this round is
   * addressed to, in sub-round order — the draft's Number of Responders, SlotsPerResponder and
   * Responder Address list (4ab draft 15-22/0381r5 Table 1.6.3.1, 0x10). A responder that does not
   * find itself here is not in this round. Absent on a later sub-round's POLL (Message Control 0). */
  responders?: string[]
  /** RESP at Message Control 2: the responder's Predicted Reply Time, in RCTU (resolution
   * 15-25/0681r1). */
  predictedReplyRctu?: number
}

/**
 * An SP0 (BASIC_PACKET) control message of the UWB-driven control plane: which of the three
 * messages it is, and whichever time it carries. 4ab draft 15-25/0194r0
 *
 * There is no channel field, because there is no second radio: an SP0 frame goes out on the
 * session's own UWB channel, at the UWB transmit power and against the UWB sensitivity. And
 * there is no message-ID octet, because the draft's message ids belong to the narrowband
 * compressed PSDUs (15-22/0381r5 Table 1.6.3.1) and nothing this engine has read gives the SP0
 * content's own layout — the role is carried here as the role it is.
 */
export interface UwbSp0Msg {
  role: 'poll' | 'resp' | 'report'
  /** The power this SP0 packet is radiated at (dBm): the leading fragment's less the proposal's
   * ~4 dB (`mms.ts#mmsSp0TxDbm`, 15-25/0194r0). */
  txDbm: number
  /** Responder's REPORT: the ReplyTime it measured, in RCTU. */
  replyRctu?: number
  /** Initiator's REPORT: the TurnAroundTime it measured, in RCTU. */
  roundTripRctu?: number
  /** RESP at Message Control 2: the Predicted Reply Time, in RCTU (resolution 15-25/0681r1). */
  predictedReplyRctu?: number
}

/**
 * The ARC IE's control bits (standard §10.32.9.1, Figure 10-244): the two octets every ARC IE
 * carries, field by field. Its Content Control octet is not here because in this engine it is
 * always zero — none of the optional duration or Session ID fields is carried (the block structure
 * is the next higher layer's, §10.32.3.3) — and `ARC_IE_BYTES` prices it all the same.
 */
export interface UwbArcFields {
  /** Table 10-163: 0 unicast, 1 one-to-many, 2 many-to-many. */
  multiNode: 0 | 1 | 2
  /** Table 10-164: 0 OWR, 1 SS-TWR, 2 DS-TWR, 3 ranging ancillary information exchange. */
  roundUsage: 0 | 1 | 2 | 3
  /** Table 10-165: 0 no STS, 1/2/3 STS packet structure #1/#2/#3. */
  stsConfig: 0 | 1 | 2 | 3
  /** Table 10-166: 0 contention-based, 1 scheduling-based. */
  scheduleMode: 0 | 1
  /** One when ranging slots are scheduled for deferred data frames after the ranging exchange. */
  deferred: 0 | 1
  /** Table 10-167: 0 interval-based, 1 block-based. */
  timeStructure: 0 | 1
  /** RCM Validity Rounds (6 bits): the rounds this RCM governs, its own included — the length of
   * the ranging round set it opens. */
  validityRounds: number
  /** MMRCR: receipt confirmation requested (§10.36). */
  mmrcr: 0 | 1
}

/** The ranging fields of a UWB frame; present on the UWB kinds only. */
export interface UwbInfo {
  /** Which STS packet configuration this frame uses: 1 for every SP1 frame this engine builds
   * (a full PPDU, SHR + STS + PHR + PSDU), 3 for the bare SP3 marker (`makeSp3`: SHR + STS only,
   * standard §10.32.8.2). */
  sp: 1 | 3
  method: 'ss' | 'ds'
  block: number
  round: number
  slot: number
  /** Payload IEs carried, in order (e.g. ['ARC', 'RR', 'RDM', 'RRMC']). */
  ies: string[]
  /** RCM only (the Poll): the ARC IE's control bits. The RR IE beside it carries `block` and `round`
   * above as its Ranging Block Index and Round Index (§10.32.9.3). */
  arc?: UwbArcFields
  /** Poll (time schedule): the anchors' ids in slot order (RDM IE). */
  schedule?: string[]
  /** Poll (contention schedule): the response phase any anchor may answer in (RCPS IE) and its
   * retry budget (RCMA IE). On the ancillary round's RCM (`uwbRcm`), the initiators' contention phase
   * (RCPS Phase Indicator 0) instead, with `phase: 0` and no RCMA IE (`maxAttempts` absent). */
  contention?: { firstSlot: number; lastSlot: number; maxAttempts?: number; phase?: 0 | 1 | 2 }
  /** The ancillary round's RCM (`uwbRcm`, time schedule): its RDM IE with SIU = 1 (standard
   * §10.32.9.8) — one element per slot the controller assigns, each naming the device, its role
   * (1 = initiator: the sender of ancillary information, §10.35.1) and the slot index. */
  rdm?: { id: string; slot: number; initiator: boolean }[]
  /** Response (SS, embedded): the RRTI IE's reply time in RCTU; the SS deferred reply-time message:
   * the RMI IE's RX-to-TX Reply Time. */
  replyRctu?: number
  /** SP3 grouped ranging, RCM: one SRRR IE per responder (standard §10.32.9.9), present exactly when
   * the frame carries those IEs at all. */
  srrr?: UwbSrrrEntry[]
  /** SP3 grouped ranging, data report phase: the bearing the responder measured, present exactly
   * when the round's SRRR IE asked for it (RAOA, standard §10.32.9.9). Never on an SP3 marker —
   * that frame has no payload at all (`makeSp3`) — only on the report frame that follows it. */
  aoaThetaDeg?: number
  /** Final (DS, embedded): per anchor { id, tround1, treply2 } (RMI + RRTI IEs). The initiator's
   * deferred report of a deferred DS round (`uwbReport` from the tag, standard §10.29.6.6) carries the
   * same two times per anchor in one RMI IE; an SP3 initiator report carries { id, tround1 }. A
   * deferred Final carries none (it has no IE at all). */
  finalTimes?: { id: string; tround1?: number; treply2?: number }[]
  /** Report (DS): the responder's treply1 and tround2 (RMI IE). */
  reportTimes?: { treply1: number; tround2: number }
  /** DL-TDoA (Poll, Response, Final): the sender's ranging times, for the listening tags. */
  dl?: UwbDlTimes
  /** Many-to-many (`uwbM2m`, standard §10.32.6/§10.32.7): this participant's own transmit time
   * and the arrival times it holds for everyone who transmitted before it. Never carries a clock
   * offset — see `UwbM2mTimes`. */
  m2m?: UwbM2mTimes
  /** MMS fragment (`uwbRsf` / `uwbRif`): its place in the train and its own transmit power. */
  mms?: UwbMmsFrag
  /** Narrowband message (`nbPoll` / `nbResp` / `nbReport`): the control-plane fields. */
  nb?: UwbNbMsg
  /** SP0 control frame (`uwbSp0`): the same control plane, on the UWB PHY. */
  sp0?: UwbSp0Msg
  /** Receipt confirmation (`uwbMmrcm`, standard §10.36): one entry per initiator this frame
   * answers, each with the receipt bitmap of that initiator's window-openers. */
  mmrc?: UwbMmrcEntry[]
  /** Ancillary information (`uwbAncillary`, standard §10.35): the RAICT IE's Request bit and its two
   * optional fields, each present exactly when the IE's own presence bit says so — `makeAncillary`
   * is the one place that invariant is kept, the same way `makeMmrcm` keeps its bitmap width.
   * `request` is what says which of §10.35.2.1's **two different uses** this IE is: with it clear,
   * `framesRemaining` is how many frames of this message are still to come; with it set, the same
   * field is how many slots the sender is asking the controller to schedule for the next exchange.
   * One field, two quantities, and nothing but this bit tells them apart.
   *
   * **Present only when the bit is set, never as `request: false`**, and that is measured rather
   * than stylistic: a frame descriptor is embedded in the `TX_START`/`RX_OK` records, so a key
   * added unconditionally here changes `JSON.stringify` over the whole record stream of every
   * session that has an ancillary exchange at all. Instrument A of slice 3d caught exactly that
   * — 112 of 903 records on the shipped `uwb-ancillary` scene — while both hash fixtures stayed
   * green, because one folds only `t:seq:type` and the other filters to `UWB_*`. Readers test
   * `raict?.request === true`. */
  raict?: { request?: boolean; messageNumber?: number; framesRemaining?: number }
}

/**
 * BPRF data rate of the PSDU (standard Table 16-4: 6.81 Mb/s). The airtime is
 * not bytes ÷ rate — an SP1 PPDU is dominated by its SHR and STS — so every
 * builder takes txTimeNs from uwbPpduNs(); mbps is carried for display only.
 */
export const UWB_MBPS = 6.81

/** The destination of a frame addressed to the whole round rather than to one device — the Poll,
 * the Final, a blink, the one-to-many narrowband POLL and a one-to-many initiator's fragment
 * train. It is an addressing convention of this engine, not an address the standard defines:
 * 802.15.4 would carry a broadcast short address in the MHR, and the decoder reads the leading
 * `*` to know there is no one peer to name. model */
export const UWB_BROADCAST = '*'

function uwbFrame(kind: UwbFrameKind, src: string, dst: string, bytes: number, uwb: UwbInfo): FrameDesc {
  return { kind, src, dst, bytes, mbps: UWB_MBPS, durationFieldNs: 0, txTimeNs: uwbPpduNs(bytes), uwb }
}

/** The optional tail of a Poll: what it carries beyond the round it belongs to. Each field is
 * read by exactly one kind of round, so an options object says at the call site which kind is
 * being built - a contention Poll names the window, a DL-TDoA Poll names the times, and neither
 * has to write the other's arguments out as placeholders. */
export interface PollOpts {
  /** Time-scheduled (the default) or a shared response phase. */
  schedule?: 'time' | 'contention'
  /** Contention only: the response window (RCPS IE), and the retry budget (RCMA IE). Both
   * default to the session's own model defaults. */
  contentionSlots?: number
  maxAttempts?: number
  /** The ARC IE's control bits; defaults to what the Poll's own other options imply, with a
   * one-round set and no MMRCR. A two-way round's initiator passes the round's own
   * (`device.ts#arcFieldsFor`). */
  arc?: UwbArcFields
  /** DL-TDoA: anchor 0's own ranging times. A Poll that carries them is a DL-TDoA Poll, and the
   * three fields above mean nothing to it - a one-way round is time-scheduled by construction. */
  dl?: UwbDlTimes
  /**
   * SP3 grouped ranging (standard §10.32.8.1's first phase): this RCM also carries the responders'
   * SRRR IEs — one per responder, §10.32.9.9 — so it is `srrrIeBytes(A)` octets longer than the
   * Poll of an SP1 round. Absent (the default) means an SP1 round, which carries none.
   *
   * The bits are carried as well as counted, so the frame inspector can name what each responder
   * asked for rather than print a row it cannot read. **Every responder's IE carries the same two
   * bits here**, because every device of a session is configured from the one session config — the
   * same reason the Poll's own `maxAttempts` is read off the sender's config rather than per
   * responder. The IE's *length* does not depend on the bits either way.
   */
  srrr?: UwbSrrrEntry[]
}

/**
 * The tag's Poll — the RCM fused with the ranging initiation message (§10.32.2) — broadcast, either
 * announcing the round's anchor order (time schedule: ARC + RR + RDM + RRMC) or opening a shared
 * response phase (contention schedule, standard §10.32.2 mode 0: ARC + RR + RCPS + RCMA + RRMC) that
 * any anchor may answer in. The RR IE carries the block and round indices (§10.32.3.3, §10.32.9.3).
 */
export function makePoll(
  tag: string, anchors: string[], method: 'ss' | 'ds', block: number, round: number,
  { schedule = 'time', contentionSlots = 8, maxAttempts = 3, dl, srrr, arc }: PollOpts = {},
): FrameDesc {
  const arcBits: UwbArcFields = arc ?? {
    multiNode: 1,
    roundUsage: dl ? 0 : method === 'ss' ? 1 : 2,
    stsConfig: srrr ? 3 : 1,
    scheduleMode: schedule === 'contention' && !dl ? 0 : 1,
    deferred: 0,
    timeStructure: 1,
    validityRounds: 1,
    mmrcr: 0,
  }
  // DL-TDoA: anchor 0 polls, `anchors` are the responders it gives slots to, and the frame adds
  // anchor 0's own TX time so a listening tag can time the round on the anchors' clock.
  if (dl) {
    return uwbFrame('uwbPoll', tag, '*', uwbDlPollBytes(anchors.length, rxCount(dl), dl.coffs !== undefined), {
      sp: 1, method, block, round, slot: 0, ies: ['ARC', 'RR', 'RDM', 'RRMC', ...dlIes(dl)],
      arc: { ...arcBits }, schedule: [...anchors], dl: copyDl(dl),
    })
  }
  if (schedule === 'contention') {
    return uwbFrame('uwbPoll', tag, '*', uwbPollBytes(anchors.length, 'contention'), {
      sp: 1, method, block, round, slot: 0, ies: ['ARC', 'RR', 'RCPS', 'RCMA', 'RRMC'],
      arc: { ...arcBits },
      // One CP Table Element (§10.32.9.5): the responders' contention phase, Phase Indicator 1.
      contention: { firstSlot: 1, lastSlot: contentionSlots, maxAttempts },
    })
  }
  return uwbFrame('uwbPoll', tag, '*', srrr ? uwbSp3PollBytes(anchors.length) : uwbPollBytes(anchors.length), {
    sp: 1, method, block, round, slot: 0,
    ies: srrr ? ['ARC', 'RR', 'RDM', 'RRMC', 'SRRR'] : ['ARC', 'RR', 'RDM', 'RRMC'],
    arc: { ...arcBits },
    schedule: [...anchors],
    ...(srrr ? { srrr: srrr.map((e) => ({ ...e })) } : {}),
  })
}

/** The tag's initiation-only message (standard §10.32.3.2, §10.32.9.1's ARC IE, "RCM Validity
 * Rounds"): once a round set's first round has carried the RCM, every later round of the set carries
 * this instead — no ARC, no RR, no RDM.
 *
 * Its own `FrameKind` (`'uwbInit'`), not a reuse of `'uwbPoll'` (fix round 1 of task 1): in the
 * standard the control message and the ranging initiation message are two separate frames —
 * §10.34's own figure draws both — and this engine fuses them only in a ranging round set's first
 * round. A later round's message is therefore not a lighter Poll; it is the one of those two
 * standard messages that remains, once the control message's own validity has made it unnecessary
 * to send again. Reusing `'uwbPoll'` would say the opposite — that this is still the control
 * message, just slimmer — and hide the one fact this slice's validity half has to show: the same
 * reasoning `makeSsDefer` and `makeM2m` were given their own kinds for.
 *
 * It carries no schedule at all (Ruling 3 of task 1): the responder's slot table came from the
 * still-valid RCM and stays valid for the window that RCM bought, so restating it here would be
 * this engine inventing a field the standard does not give this message. What does identify which
 * RCM's round this is are the block and round numbers already on every frame (`UwbInfo`) — enough
 * to ask "is my RCM still valid for this one", which is all a responder needs.
 *
 * Its own constructor rather than a flag on `makePoll`, for the same reason `makeSsDefer` got one
 * instead of a flag on `makeResp` (design §4 of the reply-time slice): the two messages carry
 * different content, and `makePoll`'s signature never has to grow to build either of them.
 */
export function makeInit(tag: string, method: 'ss' | 'ds', block: number, round: number): FrameDesc {
  return uwbFrame('uwbInit', tag, '*', uwbInitBytes(), {
    sp: 1, method, block, round, slot: 0, ies: ['RRMC'],
  })
}

/** An anchor's Response in its slot; SS-TWR carries the reply time (RRTI) only when it is
 * embedded in this very frame — deferred and fixed carry neither, for opposite reasons (design
 * §2): deferred cannot, because the anchor does not yet know this frame's own send time, and
 * fixed has no need to, because the tag can already reconstruct `Treply` from the session config.
 * DS-TWR never carries a reply time here, embedded or not — its two-way times live in the Final. */
export function makeResp(
  anchor: string, tag: string, method: 'ss' | 'ds', block: number, round: number, slot: number, replyRctu?: number,
  dl?: UwbDlTimes, replyTime: UwbReplyTime = 'embedded',
): FrameDesc {
  // DL-TDoA: the responder answers anchor 0 but every tag in earshot is the real audience, so
  // the caller passes a broadcast destination. It carries no reply time — a listening tag wants
  // the instants themselves — but its own TX time, its RX time of the Poll and its clock offset.
  if (dl) {
    return uwbFrame('uwbResp', anchor, tag, uwbDlRespBytes(rxCount(dl), dl.coffs !== undefined), {
      sp: 1, method, block, round, slot, ies: ['RRMC', ...dlIes(dl)], dl: copyDl(dl),
    })
  }
  const carriesRrti = method === 'ss' && replyTime === 'embedded'
  return uwbFrame('uwbResp', anchor, tag, uwbRespBytes(method, replyTime), {
    sp: 1, method, block, round, slot,
    ies: carriesRrti ? ['RRMC', 'RRTI'] : ['RRMC'],
    // A Response that does not carry a reply time has the key absent, not undefined, so its
    // FrameDesc compares equal to a hand-built one.
    ...(carriesRrti && replyRctu !== undefined ? { replyRctu } : {}),
  })
}

/** The deferred reply-time message of SS-TWR (standard §10.29.6.3, Figure 10-203): follows the
 * Response, once the anchor has read its own transmit timestamp back, carrying that one reply time in
 * an RMI IE (Reply Time Present, Deferred Mode = 1, one list element, unicast so no address) —
 * MHR + RMI IE + FCS, 19 octets (`UWB_SS_DEFER_BYTES`). It is the frame `replyTime: 'deferred'`
 * exists to send; without it the tag would never learn `Treply` at all. Until 2026-11-10 it carried
 * an RRTI IE instead (audit #4).
 *
 * Its own `FrameKind` (`'uwbSsDefer'`), not a second use of `'uwbResp'`: the teaching point of the
 * deferred shape is that the reply time arrives in a message of its own, in a slot of its own —
 * a timeline that labelled it "UWB Response" would hide the one thing the shape is there to show.
 * design §4; task-3 Ruling 4. */
export function makeSsDefer(
  anchor: string, tag: string, replyRctu: number, block: number, round: number, slot: number,
  /**
   * SP3 grouped ranging only (standard §10.32.8.1's data report phase): the bearing this responder
   * measured, carried because the round's SRRR IE set the RAOA bit (§10.32.9.9). Absent — the key
   * is not even present — when it did not, which is what makes `uwbSp3ReportBytes(false)` the
   * honest length of the frame rather than a shorter frame with a field nobody filled.
   *
   * The initiator's frame is where §10.32.8.2's Figure 10-242 puts the bearing; in this engine the
   * antenna array is on the **anchors** (`UwbDeviceCfg.aoa`, and `UWB_AOA` is emitted there), so the
   * end that holds a bearing to report is the responder, and its own report frame is where it
   * rides. Which end sends it follows from which end has the array; the clause names the request,
   * not the array.
   */
  aoaThetaDeg?: number,
): FrameDesc {
  const raoa = aoaThetaDeg !== undefined
  return uwbFrame('uwbSsDefer', anchor, tag, raoa ? uwbSp3ReportBytes(true) : UWB_SS_DEFER_BYTES, {
    sp: 1, method: 'ss', block, round, slot, ies: raoa ? ['RMI', 'RAOA'] : ['RMI'], replyRctu,
    ...(raoa ? { aoaThetaDeg } : {}),
  })
}

/**
 * The **initiator's** own measurement report of an SP3 round (standard §10.32.8.2's report phase,
 * design §4.1): one RMI IE (§10.29.8.4) carrying, per responder that asked, that responder's short
 * address and the round-trip time the initiator measured for it.
 *
 * It is the frame that answers the SRRR IE's **RRTT** bit, and it exists only when some responder
 * set it — a round that sends it with nothing requested would be a cost with no effect, which is
 * the same defect as a request with no answer, pointing the other way.
 *
 * `'uwbReport'`, not a kind of its own: this *is* §10.29.8.4's measurement report, the same IE in
 * the same shape, and what is new is only the direction it travels. Broadcast, because in this
 * engine every responder of a session carries the same SRRR request (one session config, the same
 * reason the Poll's `maxAttempts` is the sender's own), so one frame answers all of them and each
 * reads its own entry out of it — exactly what the Final already does with `finalTimes`, which is
 * why that field carries these times too.
 */
export function makeSp3InitReport(
  tag: string, times: { id: string; tround1: number }[], block: number, round: number, slot: number,
): FrameDesc {
  return uwbFrame('uwbReport', tag, UWB_BROADCAST, uwbSp3InitReportBytes(times.length), {
    sp: 1, method: 'ss', block, round, slot, ies: ['RMI'],
    finalTimes: times.map((t) => ({ id: t.id, tround1: t.tround1 })),
  })
}

/** The ranging message non-receipt frame (standard §10.34): a responder that holds a valid RCM but
 * missed this round's initiation message sends this instead of sitting silent in its own slot —
 * the slot that still-valid RCM already gave it (design §3; `uwbRmnrBytes`).
 *
 * `ies` carries `['RMNR']` alone — the IE has no Content field at all (§10.34.2.1) — so nothing
 * about *what* this frame says rides in its payload: that the sender still holds the RCM, and that
 * it did not hear this round's initiation message, are both read from the frame showing up, in
 * this slot, instead of a timed response or silence (design §3).
 *
 * Its own `FrameKind` (`'uwbRmnr'`), not a second use of `'uwbResp'`, for the same reason
 * `makeSsDefer` above got one instead of a second use of `'uwbResp'`: a timeline that labelled this
 * frame "UWB Response" would hide the one thing it is there to show — that this is exactly where a
 * response should have been.
 *
 * `method` is the shape `UwbInfo` requires of every ranging frame, filled the way `makeBlink` fills
 * it: no ranging happens in this slot this round, so there is no TWR method behind this frame to
 * report either.
 */
export function makeRmnr(anchor: string, tag: string, block: number, round: number, slot: number): FrameDesc {
  return uwbFrame('uwbRmnr', anchor, tag, uwbRmnrBytes(), {
    sp: 1, method: 'ss', block, round, slot, ies: ['RMNR'],
  })
}

/** A responder's answer to a receipt-confirmation request (standard §10.36; design §3.2): one
 * RMMRC IE listing, per initiator, which of that initiator's window-openers this responder
 * actually received. `windowRounds` is the current ranging round set's own length — the
 * same number `roundSetOf` gives — and sizes every entry's bitmap alike
 * (`uwbMmrcmBytes`/`rmmrcEntryBytes`), so **every entry's `received` array has to be exactly that
 * long** — a bitmap narrower or wider than the window it describes is a different window the two
 * ends never agreed to.
 *
 * That invariant is **checked**, not trusted. It was a sentence in this comment first, and a
 * sentence is what this branch has repeatedly discovered it cannot afford: the width would
 * otherwise have two sources — this parameter, which prices the frame, and the arrays, which fill
 * it — and nothing would notice them disagreeing. A frame priced for one octet of bitmap while
 * carrying nine bits of content is wrong in the one way no test of the size function can see.
 *
 * `method` is the shape `UwbInfo` requires of every ranging frame, filled the way `makeRmnr` and
 * `makeBlink` fill it: this frame answers a request, it does not range, so there is no TWR method
 * behind it to report.
 *
 * Its own `FrameKind` (`'uwbMmrcm'`), not a second use of `'uwbReport'` or `'uwbRmnr'` — see the
 * `UwbFrameKind` union above: a timeline that filed this frame under either existing kind would
 * say it was part of the ranging itself, when the whole point of §10.36 is that it is an answer
 * to a request (the ARC IE's MMRCR bit), bought with a frame of its own rather than for free.
 */
export function makeMmrcm(
  src: string, dst: string, block: number, round: number, slot: number,
  ackSlots: number, entries: UwbMmrcEntry[],
): FrameDesc {
  for (const e of entries) {
    if (e.received.length !== ackSlots) {
      throw new Error(
        `makeMmrcm: ${e.initiator}'s receipt bitmap is ${e.received.length} long over `
        + `${ackSlots} acknowledged slots — a bitmap must cover exactly the slots it reports on`,
      )
    }
  }
  return uwbFrame('uwbMmrcm', src, dst, uwbMmrcmBytes(entries.length, ackSlots), {
    sp: 1, method: 'ss', block, round, slot, ies: ['RMMRC'],
    mmrc: entries.map((e) => ({ initiator: e.initiator, received: [...e.received] })),
  })
}

/** The optional content of one ancillary-information fragment (standard §10.35.2.1): the message
 * number and the frames-remaining count, each present exactly when its own RAICT IE presence bit
 * is set — `makeAncillary` checks that, it is not merely documented here. */
export interface UwbAncillaryContent {
  messageNumber?: number
  framesRemaining?: number
}

/**
 * One frame of a ranging ancillary information exchange (standard §10.35; design §4.1): a RAICT IE
 * whose two optional octets — the message number and the Frames Remaining count — are present
 * exactly as `numberPresent`/`framesRemainingPresent` say.
 *
 * **`request` is which of §10.35.2.1's two uses this frame is making of the IE**, and it changes no
 * byte count: the Request field is one bit of the control octet `RAICT_IE_MIN_BYTES` already prices,
 * which is why a request frame and a fragment carrying only Frames Remaining are the same 15 octets.
 * What it changes is what the one Frames Remaining field *means* — this message's remaining frames
 * when clear, the slot count being asked for when set — and the clause lists the two as different
 * uses, so no frame sets the bit and reports a message number at the same time. That pairing is not
 * checked here: the clause does not forbid it, and this builder refuses only what it can price
 * wrongly.
 *
 * The two presence bits and the two content values are **checked against each other**, not
 * silently reconciled — the same discipline `makeMmrcm` above applies to its bitmap width against
 * `windowRounds` (standard §10.36.2.1). `uwbAncillaryBytes` prices this frame from the presence
 * bits alone; a caller that hands this builder a value its own bits say there is no room for (or
 * claims room it then leaves empty) has let the frame's declared size and its actual content
 * disagree, and that has to surface here, as an exception with a reason, rather than downstream as
 * a frame whose byte count nobody can explain.
 */
export function makeAncillary(
  src: string, dst: string, block: number, round: number, slot: number,
  numberPresent: boolean, framesRemainingPresent: boolean, content: UwbAncillaryContent = {},
  request: boolean = false,
): FrameDesc {
  if ((content.messageNumber !== undefined) !== numberPresent) {
    throw new Error(
      `makeAncillary: message-number presence bit is ${numberPresent} but a message number is `
      + `${content.messageNumber === undefined ? 'not given' : 'given'} — the two must agree`,
    )
  }
  if ((content.framesRemaining !== undefined) !== framesRemainingPresent) {
    throw new Error(
      `makeAncillary: frames-remaining presence bit is ${framesRemainingPresent} but a frames-`
      + `remaining count is ${content.framesRemaining === undefined ? 'not given' : 'given'} — the two must agree`,
    )
  }
  return uwbFrame('uwbAncillary', src, dst, uwbAncillaryBytes(numberPresent, framesRemainingPresent), {
    sp: 1, method: 'ss', block, round, slot, ies: ['RAICT'],
    // `...(request ? ...)` rather than `request`: see `UwbInfo.raict`. The two optional content
    // fields are written unconditionally because they always have been, and a descriptor's shape
    // is what the record stream carries.
    raict: {
      ...(request ? { request: true } : {}),
      messageNumber: content.messageNumber,
      framesRemaining: content.framesRemaining,
    },
  })
}

/**
 * The RCM of an ancillary-information round (standard §10.35.1; ARC Ranging Round Usage = 3,
 * Table 10-164): sent by the controller (the tag) in slot 0, ARC IE + RR IE, and then how the round's
 * slots are given out:
 *
 * - time schedule: an RDM IE with SIU = 1 (§10.32.9.8) assigning each slot of the sender's message —
 *   and, when it asks, of its request — to the sender, role initiator (§10.35.1: the device that sends
 *   ancillary information is the initiator). This is where a granted request (§10.35.2.1) lands: the
 *   controller writes as many elements as it scheduled, and the sender reads them.
 * - contention schedule: an RCPS IE with one CP Table Element, Phase Indicator 0 (initiators contend),
 *   slots `firstSlot … lastSlot` (§10.32.9.5).
 */
export function makeAncillaryRcm(
  tag: string, block: number, round: number, arc: UwbArcFields,
  assign: { kind: 'time'; sender: string; slots: number[] } | { kind: 'contention'; firstSlot: number; lastSlot: number },
): FrameDesc {
  if (assign.kind === 'time') {
    return uwbFrame('uwbRcm', tag, UWB_BROADCAST, uwbAncillaryRcmBytes('time', assign.slots.length), {
      sp: 1, method: 'ss', block, round, slot: 0, ies: ['ARC', 'RR', 'RDM'], arc: { ...arc },
      rdm: assign.slots.map((slot) => ({ id: assign.sender, slot, initiator: true })),
    })
  }
  return uwbFrame('uwbRcm', tag, UWB_BROADCAST, uwbAncillaryRcmBytes('contention', 0), {
    sp: 1, method: 'ss', block, round, slot: 0, ies: ['ARC', 'RR', 'RCPS'], arc: { ...arc },
    contention: { firstSlot: assign.firstSlot, lastSlot: assign.lastSlot, phase: 0 },
  })
}

/**
 * One SP3 marker, in its own slot (standard §10.32.8.2): SYNC + SFD + STS and nothing else — no
 * PHR, no PSDU, so `bytes: 0` and `mbps: 0` exactly as `mmsFrame` gives a multi-millisecond
 * fragment below, and for the same reason: its airtime is `uwbSp3Ns()`, never bytes ÷ rate.
 *
 * `ies: []` and no other `UwbInfo` field is filled: an SP3 marker carries no information unit at
 * all (design §3.1/§3.2). Identity comes from the slot this frame was sent in — `slotAction`
 * already reads it that way — not from anything inside the frame, which is the one thing this
 * builder must never be "fixed" to add (design §3.2, the same shape as task 3's Ruling 3: a field
 * added here for convenience would delete the lesson's entire premise, not just its saving). The
 * time this marker measures comes back later, in the round's data report phase — the deferred
 * reply-time path `makeSsDefer` already built for SS-TWR (standard §10.29.6.3).
 */
export function makeSp3(
  src: string, dst: string, method: 'ss' | 'ds', block: number, round: number, slot: number,
): FrameDesc {
  return {
    kind: 'uwbSp3', src, dst, bytes: 0, mbps: 0, durationFieldNs: 0, txTimeNs: uwbSp3Ns(),
    uwb: { sp: 3, method, block, round, slot, ies: [] },
  }
}

/** The tag's Final (DS-TWR only): broadcast, carrying tround1/treply2 per anchor when embedded (one
 * RMI IE with the round-trip times, one RRTI IE with the reply times, §10.32.5 Figure 10-236).
 * When deferred it carries no IE at all — `{Ranging}` in §10.32.5 Figure 10-237 — and the two times
 * follow in the initiator's deferred report (`makeDsDeferredReport`, §10.29.6.6). Until 2026-11-10
 * the deferred Final carried an address-only RMI list, which §10.29.8.4 forbids (audit #3).
 * In DL-TDoA the Final is anchor 0's instead, and `times` is empty: it closes the round with
 * anchor 0's own TX time - which is what a listening tag measures its clock rate over - and its
 * RX time of every Response. The RX times are carried because a FiRa DL-TDoA Final carries them
 * (they would let a receiver check each responder's reported offset against anchor 0's round
 * trip); no tag in this model reads them. */
export function makeFinal(
  tag: string, times: { id: string; tround1: number; treply2: number }[], block: number, round: number, slot: number,
  dl?: UwbDlTimes, replyTime: UwbReplyTime = 'embedded',
): FrameDesc {
  if (dl) {
    return uwbFrame('uwbFinal', tag, '*', uwbDlFinalBytes(rxCount(dl), dl.coffs !== undefined), {
      sp: 1, method: 'ds', block, round, slot, ies: ['RRMC', ...dlIes(dl)], dl: copyDl(dl),
    })
  }
  if (replyTime === 'deferred') {
    return uwbFrame('uwbFinal', tag, '*', uwbFinalBytes(times.length, 'deferred'), {
      sp: 1, method: 'ds', block, round, slot, ies: [],
    })
  }
  return uwbFrame('uwbFinal', tag, '*', uwbFinalBytes(times.length), {
    sp: 1, method: 'ds', block, round, slot, ies: ['RMI', 'RRTI'], finalTimes: times.map((t) => ({ ...t })),
  })
}

/**
 * The initiator's deferred Data frame of a deferred DS-TWR round (standard §10.29.6.6, §10.32.5
 * Figure 10-237): broadcast in the measurement report phase, one RMI IE (Reply Time Present, Round-trip
 * Time Present, Deferred Mode = 1) with, per responder whose Response it received, the first round-trip
 * time, the second reply time and the responder's address — 15 + 10N octets. A responder that reads
 * its own element holds all four times and computes the range.
 */
export function makeDsDeferredReport(
  tag: string, times: { id: string; tround1: number; treply2: number }[], block: number, round: number,
  slot: number,
): FrameDesc {
  return uwbFrame('uwbReport', tag, UWB_BROADCAST, uwbDsDeferredReportBytes(times.length), {
    sp: 1, method: 'ds', block, round, slot, ies: ['RMI'], finalTimes: times.map((t) => ({ ...t })),
  })
}

/** An anchor's measurement report (DS-TWR only): its own treply1 and tround2, unicast to the
 * initiator in one RMI IE — requested by the Reply Time Request and Round-trip Time Request bits of
 * the Poll's RRMC IE (§10.29.8.3, §10.32.5 Figure 10-238). */
export function makeReport(
  anchor: string, tag: string, treply1: number, tround2: number, block: number, round: number, slot: number,
): FrameDesc {
  return uwbFrame('uwbReport', anchor, tag, UWB_REPORT_BYTES, {
    sp: 1, method: 'ds', block, round, slot, ies: ['RMI'], reportTimes: { treply1, tround2 },
  })
}

/**
 * Participant i's one transmission in a many-to-many round (standard §10.32.6 SS / §10.32.7 DS):
 * broadcast, carrying its own transmit time and its arrival time for every participant that
 * transmitted before it in the round's slot order. For everyone after it in that order this frame
 * is the question a Poll would otherwise have to send; for everyone before it, this frame is the
 * answer a Response would otherwise have to send — one transmission does both jobs, which is why
 * N participants need only N of these frames where taking turns as the tag would cost N² (design
 * §1/§2). Participant 0, which opens the round, has heard no one yet: its frame carries no
 * RX-times IE at all (`m2mIes`), the same way a DL-TDoA Poll carries none — a real frame does not
 * send an IE header for zero entries, and `uwbM2mBytes` prices it accordingly.
 */
export function makeM2m(
  src: string, method: 'ss' | 'ds', block: number, round: number, slot: number, times: UwbM2mTimes,
): FrameDesc {
  return uwbFrame('uwbM2m', src, UWB_BROADCAST, uwbM2mBytes(m2mRxCount(times)), {
    sp: 1, method, block, round, slot, ies: ['RRMC', ...m2mIes(times)], m2m: copyM2m(times),
  })
}

/** The many-to-many IEs one participant's frame carries, in order: its own TX time, always, and
 * its RX times only when it has heard someone (empty on participant 0, which opens the round) —
 * mirroring `dlIes`'s same rule for DL-TDoA, minus the clock-offset IE many-to-many never sends. */
function m2mIes(times: UwbM2mTimes): string[] {
  return ['TXT', ...(m2mRxCount(times) > 0 ? ['RXT'] : [])]
}

/** How many arrival times this participant's payload actually carries — what `makeM2m` sizes the
 * frame at, so a message that grows an arrival time grows in uwb/phy.ts's arithmetic too. */
function m2mRxCount(m2m: UwbM2mTimes): number {
  return Object.keys(m2m.rxCounters).length
}

/** The times ride in the FrameDesc, which outlives the round that built them: copy, so a later
 * slot cannot rewrite what a frame already said (as `copyDl` does for DL-TDoA). */
function copyM2m(m2m: UwbM2mTimes): UwbM2mTimes {
  return { ...m2m, rxCounters: { ...m2m.rxCounters } }
}

/** The blink of UL-TDoA: one 14-octet frame from the tag in its slot and nothing else, ever.
 * It carries no times — the anchors take them on arrival, and their shared timebase turns the
 * arrivals into differences — so its whole payload is a 3-octet blink IE. */
export function makeBlink(tag: string, block: number, round: number): FrameDesc {
  return uwbFrame('uwbBlink', tag, '*', UWB_BLINK_BYTES, {
    // A blink is one-way: there is no TWR method behind it. `method` is the shape UwbInfo
    // requires of every ranging frame, and the decoder never prints it for a blink.
    sp: 1, method: 'ss', block, round, slot: 0, ies: ['BLINK'],
  })
}

/** The DL-TDoA IEs a message carries, in order: the sender's TX time, the RX times it holds
 * (none on the Poll, which opens the round) and, on a Response, its clock offset. The decoder
 * walks this same list, so the two cannot disagree about what is in the frame. */
function dlIes(dl: UwbDlTimes): string[] {
  return [
    'TXT',
    ...(rxCount(dl) > 0 ? ['RXT'] : []),
    ...(dl.coffs !== undefined ? ['COFF'] : []),
  ]
}

/** How many RX times this payload actually carries — what the frame is sized at, so a message
 * that grows an RX time grows in uwb/phy.ts's arithmetic and in the schema's slot rule too. */
function rxCount(dl: UwbDlTimes): number {
  return Object.keys(dl.rxCounters).length
}

/** The times ride in the FrameDesc, which outlives the round that built them: copy, so a later
 * slot cannot rewrite what a frame already said. */
function copyDl(dl: UwbDlTimes): UwbDlTimes {
  return { ...dl, rxCounters: { ...dl.rxCounters } }
}


// --- P802.15.4ab: the multi-millisecond fragments -------------------------------

/** A fragment is not a PSDU at all — it is a raw sequence, so it carries no octets and has no
 * data rate. Its airtime comes from `mms.ts`, never from bytes ÷ rate. */
const MMS_FRAG_BYTES = 0
const MMS_FRAG_MBPS = 0

function mmsFrame(
  kind: 'uwbRsf' | 'uwbRif', src: string, dst: string, txTimeNs: Ns,
  block: number, round: number, slot: number, frag: Omit<UwbMmsFrag, 'txDbm'>,
): FrameDesc {
  return {
    kind, src, dst, bytes: MMS_FRAG_BYTES, mbps: MMS_FRAG_MBPS, durationFieldNs: 0, txTimeNs,
    uwb: {
      // A fragment belongs to a train, not to a TWR flavour: `sp` and `method` are the shape
      // `UwbInfo` requires of every ranging frame, and the decoder never prints them here.
      sp: 1, method: 'ss', block, round, slot, ies: [],
      mms: { ...frag, txDbm: mmsFragmentDbm(txTimeNs) },
    },
  }
}

/** One ranging sequence fragment: `nMsr` repetitions of the MMRS symbol, carrying the ranging
 * timestamp. 4ab draft 15-23/0100r2 §2.3.2 */
export function makeRsf(
  src: string, dst: string, index: number, phy: MmsPhy, block: number, round: number, slot: number,
): FrameDesc {
  return mmsFrame('uwbRsf', src, dst, rsfNs(phy.nMsr, phy.gap), block, round, slot, {
    kind: 'rsf', index, of: phy.rsfs, nMsr: phy.nMsr, gap: phy.gap,
  })
}

/** One ranging integrity fragment: a single STS segment, which verifies that the range was not
 * spoofed. 4ab draft 15-23/0100r2 §2.3.2 */
export function makeRif(
  src: string, dst: string, index: number, phy: MmsPhy, block: number, round: number, slot: number,
): FrameDesc {
  return mmsFrame('uwbRif', src, dst, rifNs(phy.stsLen), block, round, slot, {
    kind: 'rif', index, of: phy.rifs, stsLen: phy.stsLen,
  })
}

// --- P802.15.4ab: the narrowband control plane ------------------------------------

/** O-QPSK at 250 kb/s, as the inspector and the timeline print a rate. standard Clause 12 */
export const NB_MBPS = 0.25

/** The POLL opens the round in the first control slot and the RESP answers in the third.
 * 4ab draft 15-22/0381r5 §1.1 (RcpPollSlot 2 + RcpResponseSlot 2) */
const NB_POLL_SLOT = 0
const NB_RESP_SLOT = 2

function nbFrame(
  kind: 'nbPoll' | 'nbResp' | 'nbReport', src: string, dst: string, bytes: number,
  block: number, round: number, slot: number, nb: Omit<UwbNbMsg, 'centerMhz'>,
): FrameDesc {
  return {
    kind, src, dst, bytes, mbps: NB_MBPS, durationFieldNs: 0, txTimeNs: nbPpduNs(bytes),
    uwb: {
      // As for a fragment: the ranging flavour lives on the UWB side, and an NB message only
      // carries the shape `UwbInfo` asks of every ranging frame.
      sp: 1, method: 'ss', block, round, slot, ies: [],
      nb: { ...nb, centerMhz: nbCenterMhz(nb.channel) },
    },
  }
}

/** The initiator's narrowband POLL, which opens the ranging round.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export function makeNbPoll(tag: string, anchor: string, channel: number, block: number, round: number): FrameDesc {
  return nbFrame('nbPoll', tag, anchor, NB_POLL_BYTES, block, round, NB_POLL_SLOT, {
    channel, msgId: NB_MSG_ID.poll,
  })
}

/**
 * The initiator's one-to-many POLL (message 0x10), opening one ranging sub-round.
 *
 * The first sub-round's POLL is Message Control 1: Number of Responders, Slots Per Responder and
 * the Responder Address List — 12 + 3N octets (`nbOtmPollBytes`) — which tells every responder it
 * names which sub-round is its own. Every later sub-round's POLL is Message Control 0, whose content
 * is two zero octets: a 12-octet frame naming nobody (`responders` absent). 4ab draft 15-22/0381r5
 * Table 1.6.3.1; 15-25/0213r2 (CID 474: Message Control 1 in slot 0, 0 in a later sub-round).
 */
export function makeNbPollOtm(
  tag: string, responders: string[], channel: number, block: number, round: number,
  slot: number = NB_POLL_SLOT, first = true,
): FrameDesc {
  return first
    ? nbFrame('nbPoll', tag, UWB_BROADCAST, nbOtmPollBytes(responders.length), block, round, slot, {
      channel, msgId: NB_MSG_ID.pollOtm, responders: [...responders],
    })
    : nbFrame('nbPoll', tag, UWB_BROADCAST, NB_POLL_BYTES, block, round, slot, {
      channel, msgId: NB_MSG_ID.pollOtm,
    })
}

/** The responder's narrowband RESP: it heard the POLL and will range. In a one-to-many round it
 * answers in its own RESP window, which is why the slot is passed rather than fixed.
 *
 * `predictedReplyRctu` set is the RESP at Message Control 2: its five content octets carry the
 * Predicted Reply Time instead of zeros, so the frame keeps its 12 octets. Resolution 15-25/0681r1
 * (minutes 15-26/0006r0); 4ab draft 15-22/0381r5 Table 1.6.3.1 for the frame. */
export function makeNbResp(
  anchor: string, tag: string, channel: number, block: number, round: number,
  slot: number = NB_RESP_SLOT, otm = false, predictedReplyRctu?: number,
): FrameDesc {
  return nbFrame('nbResp', anchor, tag, NB_RESP_BYTES, block, round, slot, {
    channel, msgId: otm ? NB_MSG_ID.respOtm : NB_MSG_ID.resp,
    ...(predictedReplyRctu !== undefined ? { predictedReplyRctu } : {}),
  })
}

/**
 * A narrowband REPORT, in the report slot its sender owns: the two differ only in their
 * message-ID octet, which names the end that sent it, and in which of the exchange's two times is
 * present. Ordinarily the responder's carries the ReplyTime it measured and the initiator's the
 * TurnAroundTime.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 / 1.6.3.2
 */
export function makeNbReport(
  src: string, dst: string, channel: number, block: number, round: number, slot: number,
  times: { replyRctu?: number; roundTripRctu?: number },
  /** One-to-many round: the same message, under the message ids the draft gives it (0x12 from a
   * responder, 0x13 from the initiator). 4ab draft 15-22/0381r5 Table 1.6.3.1 */
  otm = false,
  /** Which end sent it, which is what the two message ids name. The initiator always transmits
   * first, so the responder's REPORT carries the reply time and the initiator's the round trip,
   * and the default follows from the time. 4ab draft 15-22/0381r5 Table 1.6.3.1 */
  sender: 'initiator' | 'responder' = times.replyRctu !== undefined ? 'responder' : 'initiator',
): FrameDesc {
  // A REPORT exists to carry one of the two times. With neither, the message would have nothing
  // for the receiver to range with, so the caller is told at the call site rather than in the
  // ranging arithmetic.
  if (times.replyRctu === undefined && times.roundTripRctu === undefined) {
    throw new Error(`makeNbReport: ${src} built a REPORT with neither a reply nor a round-trip time`)
  }
  return nbFrame('nbReport', src, dst, NB_REPORT_BYTES, block, round, slot, {
    channel,
    msgId: sender === 'responder'
      ? (otm ? NB_MSG_ID.reportResponderOtm : NB_MSG_ID.reportResponder)
      : (otm ? NB_MSG_ID.reportInitiatorOtm : NB_MSG_ID.reportInitiator),
    // Absent, not undefined, so a REPORT compares equal to a hand-built one.
    ...(times.replyRctu !== undefined ? { replyRctu: times.replyRctu } : {}),
    ...(times.roundTripRctu !== undefined ? { roundTripRctu: times.roundTripRctu } : {}),
  })
}

// --- P802.15.4ab: the UWB-driven control plane -------------------------------------

/**
 * One SP0 control frame: the POLL, the RESP or the REPORT of a Config 1 round, carried on the
 * HRP UWB PHY because Config 1 has no narrowband radio at all.
 *
 * Its airtime is the packet format's own — `MMS_SP0_NS`, the draft's short-packet total — and
 * never bytes ÷ rate: an SP0 packet's length is its SYNC, SFD, PHR and PSDU fields, which is
 * what `uwbPpduLayout` draws. Its octets are `MMS_SP0_PSDU_BYTES`, the same for all three
 * messages, which is why one duration serves them all.
 *
 * It carries no `nb` block, and that is load-bearing rather than tidy: the channel model reads
 * `uwb.nb` to decide which radio a frame is on, so an SP0 frame priced as a narrowband message
 * would be transmitted at 10 dBm against a −100 dBm receiver and the whole point of Config 1 —
 * that the control plane now lives inside the UWB link budget — would be gone.
 * 4ab draft 15-25/0194r0
 */
function sp0Frame(
  src: string, dst: string, block: number, round: number, slot: number, sp0: UwbSp0Msg,
): FrameDesc {
  return {
    kind: 'uwbSp0', src, dst, bytes: MMS_SP0_PSDU_BYTES, mbps: MMS_SP0_MBPS,
    durationFieldNs: 0, txTimeNs: MMS_SP0_NS,
    uwb: {
      // As for a fragment and a narrowband message: the TWR flavour lives on the ranging side,
      // and this only carries the shape `UwbInfo` asks of every ranging frame.
      sp: 1, method: 'ss', block, round, slot, ies: [], sp0,
    },
  }
}

/** The initiator's SP0 POLL, which opens a UWB-driven round (or, one-to-many interleaved, one
 * responder's sub-round — so it is addressed to that responder).
 *
 * The non-interleaved one-to-many round broadcasts a single POLL, and — unlike the narrowband
 * one-to-many POLL — it names no responders: the table gives the SP0 packet one PSDU length, and
 * stretching it by three octets per address would be this engine's invention. The round's
 * responder list stands in for the missing addresses there, which is out-of-band knowledge a real
 * device would not have: modelled, and named. 4ab draft 15-25/0194r0
 *
 * `txDbm` is `mmsSp0TxDbm` of the session's train. */
export function makeSp0Poll(
  tag: string, dst: string, block: number, round: number, slot: number, txDbm: number,
): FrameDesc {
  return sp0Frame(tag, dst, block, round, slot, { role: 'poll', txDbm })
}

/** The responder's SP0 RESP: it acquired the POLL and will range. With `predictedReplyRctu` it is
 * the Response Compact frame at Message Control 2 (resolution 15-25/0681r1). 4ab draft 15-25/0194r0 */
export function makeSp0Resp(
  anchor: string, tag: string, block: number, round: number, slot: number, txDbm: number,
  predictedReplyRctu?: number,
): FrameDesc {
  return sp0Frame(anchor, tag, block, round, slot, {
    role: 'resp', txDbm,
    ...(predictedReplyRctu !== undefined ? { predictedReplyRctu } : {}),
  })
}

/** An SP0 measurement report, in the report window its sender owns — the responder's ReplyTime
 * or the initiator's TurnAroundTime, exactly as the narrowband REPORT carries them and for the
 * same reason: the ranging phase transmits nothing but fragments, so the times have to travel in
 * a frame of their own. 4ab draft 15-25/0194r0 */
export function makeSp0Report(
  src: string, dst: string, block: number, round: number, slot: number,
  times: { replyRctu?: number; roundTripRctu?: number }, txDbm: number,
): FrameDesc {
  if (times.replyRctu === undefined && times.roundTripRctu === undefined) {
    throw new Error(`makeSp0Report: ${src} built a REPORT with neither a reply nor a round-trip time`)
  }
  return sp0Frame(src, dst, block, round, slot, {
    role: 'report', txDbm,
    // Absent, not undefined, so a REPORT compares equal to a hand-built one.
    ...(times.replyRctu !== undefined ? { replyRctu: times.replyRctu } : {}),
    ...(times.roundTripRctu !== undefined ? { roundTripRctu: times.roundTripRctu } : {}),
  })
}
