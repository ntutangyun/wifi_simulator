/**
 * HRP UWB ranging frames: SP1 PPDUs (standard §16.2, Table 16-1 and Figure 16-3)
 * carrying the ranging IEs of §10.29.8 and §10.32.9.
 * They travel through the same FrameDesc the Wi-Fi engine uses, so the
 * timeline, the frame inspector and the 3-D scene need no second frame type.
 */
import type { FrameDesc } from '../model/frames'
import {
  UWB_BLINK_BYTES, UWB_REPORT_BYTES, uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes,
  uwbFinalBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from './phy'

export type UwbFrameKind = 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport' | 'uwbBlink'

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
}

/**
 * BPRF data rate of the PSDU (standard Table 16-4: 6.81 Mb/s). The airtime is
 * not bytes ÷ rate — an SP1 PPDU is dominated by its SHR and STS — so every
 * builder takes txTimeNs from uwbPpduNs(); mbps is carried for display only.
 */
export const UWB_MBPS = 6.81

function uwbFrame(kind: UwbFrameKind, src: string, dst: string, bytes: number, uwb: UwbInfo): FrameDesc {
  return { kind, src, dst, bytes, mbps: UWB_MBPS, durationFieldNs: 0, txTimeNs: uwbPpduNs(bytes), uwb }
}

/**
 * The tag's Poll: broadcast, either announcing the round's anchor order (time schedule: ARC + RDM
 * + RRMC) or opening a shared response phase (contention schedule, standard §10.32.2 mode 0: ARC +
 * RCPS + RCMA + RRMC) that any anchor may answer in. `contentionSlots` / `maxAttempts` are only
 * read for the contention schedule, and default to the session's own model defaults (8 / 3).
 */
export function makePoll(
  tag: string, anchors: string[], method: 'ss' | 'ds', block: number, round: number,
  schedule: 'time' | 'contention' = 'time', contentionSlots = 8, maxAttempts = 3, dl?: UwbDlTimes,
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
