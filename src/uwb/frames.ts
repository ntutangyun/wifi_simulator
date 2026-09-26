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
  UWB_BLINK_BYTES, UWB_REPORT_BYTES, uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes,
  uwbFinalBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from './phy'

export type UwbFrameKind =
  | 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport' | 'uwbBlink'
  // P802.15.4ab: the two multi-millisecond fragment kinds and the three narrowband messages of
  // the control plane. 4ab draft 15-23/0100r2 §2.3.2 / 15-22/0381r5 Table 1.6.3.1
  | 'uwbRsf' | 'uwbRif' | 'nbPoll' | 'nbResp' | 'nbReport'
  // …and the same three messages under Config 1, where there is no narrowband radio to carry
  // them: one SP0 (BASIC_PACKET) frame format on the HRP UWB PHY, with the role in its content.
  // 4ab draft 15-25/0194r0
  | 'uwbSp0'

// Both predicates take the whole `FrameKind` union, not just the UWB half: their callers hold a
// `FrameDesc.kind` (a lane, the timeline, a decoder), and narrowing at the call site would only
// push a cast onto every one of them.

/** True of the three narrowband control messages — the frames that travel on the 4ab
 * narrowband radio rather than on the UWB one. */
export const isNbFrame = (k: FrameKind): boolean => k === 'nbPoll' || k === 'nbResp' || k === 'nbReport'

/** True of the two multi-millisecond fragment kinds: one member of a train, not a frame that
 * stands on its own. */
export const isMmsFragment = (k: FrameKind): boolean => k === 'uwbRsf' || k === 'uwbRif'

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
  /** One-to-many POLL: the responders this round is addressed to, in slot order — the draft's
   * Number of Responders, SlotsPerResponder and Responder Address list (4ab draft
   * 15-22/0381r5 Table 1.6.3.1, 0x10). A responder that does not find itself here is not in
   * this round. */
  responders?: string[]
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
  /** Responder's REPORT: the ReplyTime it measured, in RCTU. */
  replyRctu?: number
  /** Initiator's REPORT: the TurnAroundTime it measured, in RCTU. */
  roundTripRctu?: number
}

/** The ranging fields of a UWB frame; present on the UWB kinds only. */
export interface UwbInfo {
  sp: 1
  method: 'ss' | 'ds'
  block: number
  round: number
  slot: number
  /** Payload IEs carried, in order (e.g. ['ARC', 'RDM', 'RRMC']). */
  ies: string[]
  /** Poll (time schedule): the anchors' ids in slot order (RDM IE). */
  schedule?: string[]
  /** Poll (contention schedule): the response phase any anchor may answer in (RCPS IE) and its
   * retry budget (RCMA IE). */
  contention?: { firstSlot: number; lastSlot: number; maxAttempts: number }
  /** Response (SS): RRTI reply time in RCTU. */
  replyRctu?: number
  /** Final (DS): per anchor { id, tround1, treply2 } (RMI + RRTI IEs). */
  finalTimes?: { id: string; tround1: number; treply2: number }[]
  /** Report (DS): the responder's treply1 and tround2 (RMI IE). */
  reportTimes?: { treply1: number; tround2: number }
  /** DL-TDoA (Poll, Response, Final): the sender's ranging times, for the listening tags. */
  dl?: UwbDlTimes
  /** MMS fragment (`uwbRsf` / `uwbRif`): its place in the train and its own transmit power. */
  mms?: UwbMmsFrag
  /** Narrowband message (`nbPoll` / `nbResp` / `nbReport`): the control-plane fields. */
  nb?: UwbNbMsg
  /** SP0 control frame (`uwbSp0`): the same control plane, on the UWB PHY. */
  sp0?: UwbSp0Msg
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
  /** DL-TDoA: anchor 0's own ranging times. A Poll that carries them is a DL-TDoA Poll, and the
   * three fields above mean nothing to it - a one-way round is time-scheduled by construction. */
  dl?: UwbDlTimes
}

/**
 * The tag's Poll: broadcast, either announcing the round's anchor order (time schedule: ARC + RDM
 * + RRMC) or opening a shared response phase (contention schedule, standard §10.32.2 mode 0: ARC +
 * RCPS + RCMA + RRMC) that any anchor may answer in.
 */
export function makePoll(
  tag: string, anchors: string[], method: 'ss' | 'ds', block: number, round: number,
  { schedule = 'time', contentionSlots = 8, maxAttempts = 3, dl }: PollOpts = {},
): FrameDesc {
  // DL-TDoA: anchor 0 polls, `anchors` are the responders it gives slots to, and the frame adds
  // anchor 0's own TX time so a listening tag can time the round on the anchors' clock.
  if (dl) {
    return uwbFrame('uwbPoll', tag, '*', uwbDlPollBytes(anchors.length, rxCount(dl), dl.coffs !== undefined), {
      sp: 1, method, block, round, slot: 0, ies: ['ARC', 'RDM', 'RRMC', ...dlIes(dl)],
      schedule: [...anchors], dl: copyDl(dl),
    })
  }
  if (schedule === 'contention') {
    return uwbFrame('uwbPoll', tag, '*', uwbPollBytes(anchors.length, 'contention'), {
      sp: 1, method, block, round, slot: 0, ies: ['ARC', 'RCPS', 'RCMA', 'RRMC'],
      contention: { firstSlot: 1, lastSlot: contentionSlots, maxAttempts },
    })
  }
  return uwbFrame('uwbPoll', tag, '*', uwbPollBytes(anchors.length), {
    sp: 1, method, block, round, slot: 0, ies: ['ARC', 'RDM', 'RRMC'], schedule: [...anchors],
  })
}

/** An anchor's Response in its slot; SS-TWR carries the reply time (RRTI), DS-TWR does not. */
export function makeResp(
  anchor: string, tag: string, method: 'ss' | 'ds', block: number, round: number, slot: number, replyRctu?: number,
  dl?: UwbDlTimes,
): FrameDesc {
  // DL-TDoA: the responder answers anchor 0 but every tag in earshot is the real audience, so
  // the caller passes a broadcast destination. It carries no reply time — a listening tag wants
  // the instants themselves — but its own TX time, its RX time of the Poll and its clock offset.
  if (dl) {
    return uwbFrame('uwbResp', anchor, tag, uwbDlRespBytes(rxCount(dl), dl.coffs !== undefined), {
      sp: 1, method, block, round, slot, ies: ['RRMC', ...dlIes(dl)], dl: copyDl(dl),
    })
  }
  return uwbFrame('uwbResp', anchor, tag, uwbRespBytes(method), {
    sp: 1, method, block, round, slot,
    ies: method === 'ss' ? ['RRMC', 'RRTI'] : ['RRMC'],
    // DS-TWR carries no reply time: the key is absent, not undefined, so a
    // DS FrameDesc compares equal to a hand-built one.
    ...(replyRctu !== undefined ? { replyRctu } : {}),
  })
}

/** The tag's Final (DS-TWR only): broadcast, carrying tround1/treply2 per anchor.
 * In DL-TDoA the Final is anchor 0's instead, and `times` is empty: it closes the round with
 * anchor 0's own TX time - which is what a listening tag measures its clock rate over - and its
 * RX time of every Response. The RX times are carried because a FiRa DL-TDoA Final carries them
 * (they would let a receiver check each responder's reported offset against anchor 0's round
 * trip); no tag in this model reads them. */
export function makeFinal(
  tag: string, times: { id: string; tround1: number; treply2: number }[], block: number, round: number, slot: number,
  dl?: UwbDlTimes,
): FrameDesc {
  if (dl) {
    return uwbFrame('uwbFinal', tag, '*', uwbDlFinalBytes(rxCount(dl), dl.coffs !== undefined), {
      sp: 1, method: 'ds', block, round, slot, ies: ['RRMC', ...dlIes(dl)], dl: copyDl(dl),
    })
  }
  return uwbFrame('uwbFinal', tag, '*', uwbFinalBytes(times.length), {
    sp: 1, method: 'ds', block, round, slot, ies: ['RMI', 'RRTI'], finalTimes: times.map((t) => ({ ...t })),
  })
}

/** An anchor's measurement report (DS-TWR only): its own treply1 and tround2. */
export function makeReport(
  anchor: string, tag: string, treply1: number, tround2: number, block: number, round: number, slot: number,
): FrameDesc {
  return uwbFrame('uwbReport', anchor, tag, UWB_REPORT_BYTES, {
    sp: 1, method: 'ds', block, round, slot, ies: ['RMI'], reportTimes: { treply1, tround2 },
  })
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

/** The initiator's one-to-many POLL (message 0x10): one broadcast that opens the round for every
 * responder it names, and tells each of them which slots are its own.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export function makeNbPollOtm(
  tag: string, responders: string[], channel: number, block: number, round: number,
): FrameDesc {
  return nbFrame('nbPoll', tag, UWB_BROADCAST, nbOtmPollBytes(responders.length), block, round, NB_POLL_SLOT, {
    channel, msgId: NB_MSG_ID.pollOtm, responders: [...responders],
  })
}

/** The responder's narrowband RESP: it heard the POLL and will range. In a one-to-many round it
 * answers in its own RESP window, which is why the slot is passed rather than fixed.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 */
export function makeNbResp(
  anchor: string, tag: string, channel: number, block: number, round: number,
  slot: number = NB_RESP_SLOT, otm = false,
): FrameDesc {
  return nbFrame('nbResp', anchor, tag, NB_RESP_BYTES, block, round, slot, {
    channel, msgId: otm ? NB_MSG_ID.respOtm : NB_MSG_ID.resp,
  })
}

/**
 * A narrowband REPORT, in the report slot its sender owns. The responder's carries the
 * ReplyTime it measured and the initiator's the TurnAroundTime, and that is what names the
 * message: the two differ only in their message-ID octet and in which time is present.
 * 4ab draft 15-22/0381r5 Table 1.6.3.1 / 1.6.3.2
 */
export function makeNbReport(
  src: string, dst: string, channel: number, block: number, round: number, slot: number,
  times: { replyRctu?: number; roundTripRctu?: number },
  /** One-to-many round: the same message, under the message ids the draft gives it (0x12 from a
   * responder, 0x13 from the initiator). 4ab draft 15-22/0381r5 Table 1.6.3.1 */
  otm = false,
): FrameDesc {
  // A REPORT exists to carry one of the two times, and which one is there is what names the
  // message. With neither, the message id would be a guess and the receiver would have nothing
  // to range with, so the caller is told at the call site rather than in the ranging arithmetic.
  if (times.replyRctu === undefined && times.roundTripRctu === undefined) {
    throw new Error(`makeNbReport: ${src} built a REPORT with neither a reply nor a round-trip time`)
  }
  return nbFrame('nbReport', src, dst, NB_REPORT_BYTES, block, round, slot, {
    channel,
    msgId: times.replyRctu !== undefined
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

/** The initiator's SP0 POLL, which opens a UWB-driven round.
 *
 * A one-to-many round broadcasts it, and — unlike the narrowband one-to-many POLL — it names no
 * responders: the table gives the SP0 packet one PSDU length, and stretching it by three octets
 * per address would be this engine's invention. A responder acts on the POLL because the round
 * it was given lists it, which is the same check `onMmsSlot` already makes of every slot it
 * touches. 4ab draft 15-25/0194r0
 *
 * **So a one-to-many round under Config 1 is an approximation, and here is exactly where.** The
 * draft's one-to-many POLL works by naming its responders (15-22/0381r5 Table 1.6.3.1, message
 * 0x10, with `Number of Responders`, `SlotsPerResponder` and the address list); a twelve-octet
 * SP0 PSDU has no room for that list, so nothing in this engine's SP0 POLL tells a responder
 * which slots are its own. The round's responder list stands in for the missing addresses, which
 * is a piece of out-of-band knowledge a real device would not have. The combination is not
 * forbidden — the draft prohibits neither one-to-many nor a UWB-driven control plane, and
 * refusing it here would be inventing a prohibition, just as growing the PSDU would be inventing
 * a frame. It is modelled, and named. model */
export function makeSp0Poll(
  tag: string, dst: string, block: number, round: number, slot: number,
): FrameDesc {
  return sp0Frame(tag, dst, block, round, slot, { role: 'poll' })
}

/** The responder's SP0 RESP: it acquired the POLL and will range. 4ab draft 15-25/0194r0 */
export function makeSp0Resp(
  anchor: string, tag: string, block: number, round: number, slot: number,
): FrameDesc {
  return sp0Frame(anchor, tag, block, round, slot, { role: 'resp' })
}

/** An SP0 measurement report, in the report window its sender owns — the responder's ReplyTime
 * or the initiator's TurnAroundTime, exactly as the narrowband REPORT carries them and for the
 * same reason: the ranging phase transmits nothing but fragments, so the times have to travel in
 * a frame of their own. 4ab draft 15-25/0194r0 */
export function makeSp0Report(
  src: string, dst: string, block: number, round: number, slot: number,
  times: { replyRctu?: number; roundTripRctu?: number },
): FrameDesc {
  if (times.replyRctu === undefined && times.roundTripRctu === undefined) {
    throw new Error(`makeSp0Report: ${src} built a REPORT with neither a reply nor a round-trip time`)
  }
  return sp0Frame(src, dst, block, round, slot, {
    role: 'report',
    // Absent, not undefined, so a REPORT compares equal to a hand-built one.
    ...(times.replyRctu !== undefined ? { replyRctu: times.replyRctu } : {}),
    ...(times.roundTripRctu !== undefined ? { roundTripRctu: times.roundTripRctu } : {}),
  })
}
