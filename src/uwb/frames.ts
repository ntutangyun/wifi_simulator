/**
 * HRP UWB ranging frames: SP1 PPDUs (standard §16.2, Table 16-1 and Figure 16-3)
 * carrying the ranging IEs of §10.29.8 and §10.32.9.
 * They travel through the same FrameDesc the Wi-Fi engine uses, so the
 * timeline, the frame inspector and the 3-D scene need no second frame type.
 */
import type { FrameDesc } from '../model/frames'
import { UWB_REPORT_BYTES, uwbFinalBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes } from './phy'

export type UwbFrameKind = 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport'

/** The ranging fields of a UWB frame; present on the four UWB kinds only. */
export interface UwbInfo {
  sp: 1
  method: 'ss' | 'ds'
  block: number
  round: number
  slot: number
  /** Payload IEs carried, in order (e.g. ['ARC', 'RDM', 'RRMC']). */
  ies: string[]
  /** Poll: the anchors' ids in slot order (RDM IE). */
  schedule?: string[]
  /** Response (SS): RRTI reply time in RCTU. */
  replyRctu?: number
  /** Final (DS): per anchor { id, tround1, treply2 } (RMI + RRTI IEs). */
  finalTimes?: { id: string; tround1: number; treply2: number }[]
  /** Report (DS): the responder's treply1 and tround2 (RMI IE). */
  reportTimes?: { treply1: number; tround2: number }
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

/** The tag's Poll: broadcast, announcing the round's anchor order (ARC + RDM + RRMC). */
export function makePoll(tag: string, anchors: string[], method: 'ss' | 'ds', block: number, round: number): FrameDesc {
  return uwbFrame('uwbPoll', tag, '*', uwbPollBytes(anchors.length), {
    sp: 1, method, block, round, slot: 0, ies: ['ARC', 'RDM', 'RRMC'], schedule: [...anchors],
  })
}

/** An anchor's Response in its slot; SS-TWR carries the reply time (RRTI), DS-TWR does not. */
export function makeResp(
  anchor: string, tag: string, method: 'ss' | 'ds', block: number, round: number, slot: number, replyRctu?: number,
): FrameDesc {
  return uwbFrame('uwbResp', anchor, tag, uwbRespBytes(method), {
    sp: 1, method, block, round, slot,
    ies: method === 'ss' ? ['RRMC', 'RRTI'] : ['RRMC'],
    // DS-TWR carries no reply time: the key is absent, not undefined, so a
    // DS FrameDesc compares equal to a hand-built one.
    ...(replyRctu !== undefined ? { replyRctu } : {}),
  })
}

/** The tag's Final (DS-TWR only): broadcast, carrying tround1/treply2 per anchor. */
export function makeFinal(
  tag: string, times: { id: string; tround1: number; treply2: number }[], block: number, round: number, slot: number,
): FrameDesc {
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
