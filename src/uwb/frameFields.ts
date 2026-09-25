/**
 * Field-level decoder for an HRP UWB ranging frame: the 802.15.4 MAC header,
 * one row per payload IE with its contents spelled out, and the SP1 PPDU
 * broken into SHR / STS / PHR / PSDU.
 *
 * Pure, and derived only from the FrameDesc the engine recorded: the field
 * sizes add up to `frame.bytes` and the segment durations to `frame.txTimeNs`.
 *
 * References: IEEE Std 802.15.4-2024 §7.2 (MAC frame format), §7.4.4 (the generic
 * Nested IE format) and the ranging IEs themselves: §10.29.8.1 RRTI, §10.29.8.3 RRMC,
 * §10.29.8.4 RMI, §10.32.9.1 ARC, §10.32.9.8 RDM, §10.32.9.5 RCPS, §10.32.9.6 RCMA;
 * §16.2 is the HRP UWB PPDU and its SP1 STS configuration. The one-way ranging rows — the
 * DL-TDoA TX time, RX times and clock offset, and the UL-TDoA blink — are model IEs in the
 * shape of §10.29.8.4's measurement content, sized in uwb/phy.ts.
 */
import type { DecodedFrame, FieldKey, FrameField, PpduSegment } from '../model/frameFields'
import { STRINGS } from '../ui/i18n'
import type { FrameDesc } from '../model/frames'
import type { Ns } from '../model/types'
import type { UwbFrameKind, UwbInfo, UwbMmsFrag, UwbNbMsg } from './frames'
import {
  NB_ADDR_BYTES, NB_CRC_BYTES, NB_MSG_ID, NB_MSG_ID_BYTES, NB_OTM_POLL_BYTES, NB_PHR_SYMBOLS,
  NB_REPORT_TIME_BYTES, NB_SHR_SYMBOLS,
  NB_SYMBOL_US,
} from './nb'
import {
  ARC_IE_BYTES, BLINK_IE_BYTES, chipsToNs, DL_COFFS_IE_BYTES, DL_TX_TIME_IE_BYTES, dlRxTimesIeBytes,
  PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, rdmIeBytes, RCMA_IE_BYTES, RCPS_IE_BYTES,
  RCTU_NS, rmiFinalIeBytes, RMI_REPORT_IE_BYTES, RRMC_IE_BYTES, RRTI_IE_BYTES, SFD_SYMBOLS, STS_ACTIVE_CHIPS,
  STS_GAP_CHIPS, SYNC_SYMBOLS, UWB_FCS_BYTES, UWB_MHR_BYTES,
} from './phy'

/** Model: the simulator runs a single ranging session, so a single PAN. */
export const UWB_PAN_ID = 0x0001
/** 802.15.4 short broadcast address. */
const BROADCAST_ADDR16 = 0xffff

const SUBTYPE: Record<UwbFrameKind, string> = {
  uwbPoll: 'UWB Poll', uwbResp: 'UWB Response', uwbFinal: 'UWB Final', uwbReport: 'UWB Report',
  uwbBlink: 'UWB Blink',
  uwbRsf: 'MMS Ranging Fragment', uwbRif: 'MMS Integrity Fragment',
  nbPoll: 'Narrowband POLL', nbResp: 'Narrowband RESP', nbReport: 'Narrowband REPORT',
}

/** The prose half of every row below: standard tokens stay, the words around them are Chinese. */
const V = STRINGS.frameDetail.fields.uwbValue

const hex16 = (v: number) => `0x${v.toString(16).padStart(4, '0')}`
const hex8 = (v: number) => `0x${v.toString(16).padStart(2, '0')}`
/** "127 803" — RCTU counters run to ten digits, and a wall of them reads as noise. */
const grouped = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** A ranging time in RCTU, as the duration a learner can compare with a slot. */
function rctuText(rctu: number): string {
  const ns = rctu * RCTU_NS
  const dur = ns >= 1e6 ? `${(ns / 1e6).toFixed(3)} ms` : ns >= 1000 ? `${(ns / 1000).toFixed(3)} µs` : `${ns.toFixed(1)} ns`
  return `${grouped(rctu)} RCTU = ${dur}`
}

/** Just the duration, for the per-anchor lists where the counters would drown the row. */
function rctuDur(rctu: number): string {
  const ns = rctu * RCTU_NS
  return ns >= 1e6 ? `${(ns / 1e6).toFixed(3)} ms` : `${(ns / 1000).toFixed(3)} µs`
}

interface Ie {
  key: FieldKey
  /** Width from the engine's own IE sizing (uwb/phy.ts); they tile the payload exactly. */
  bytes: number
  value: string
}

/** The payload IEs of one frame, in the order `uwb.ies` lists them. */
function ies(u: UwbInfo): Ie[] {
  const method = `${u.method.toUpperCase()}-TWR`
  const out: Ie[] = []
  for (const ie of u.ies) {
    switch (ie) {
      case 'ARC':
        out.push({
          key: 'ieArc', bytes: ARC_IE_BYTES,
          value: V.arc(u.sp, method, u.block, u.round, u.schedule?.length),
        })
        break
      case 'RDM': {
        const sched = u.schedule ?? []
        out.push({
          key: 'ieRdm', bytes: rdmIeBytes(sched.length),
          value: V.rdm(sched.length, sched.map((id, i) => V.rdmSlot(id, i + 1)).join('、')),
        })
        break
      }
      case 'RRMC':
        out.push({ key: 'ieRrmc', bytes: RRMC_IE_BYTES, value: V.rrmc(u.slot, method) })
        break
      case 'RCPS':
        out.push({
          key: 'ieRcps', bytes: RCPS_IE_BYTES,
          value: V.rcps(u.contention?.firstSlot ?? 1, u.contention?.lastSlot ?? 8),
        })
        break
      case 'RCMA':
        out.push({ key: 'ieRcma', bytes: RCMA_IE_BYTES, value: V.rcma(u.contention?.maxAttempts ?? 3) })
        break
      case 'RRTI': {
        // One RRTI IE holds one reply time (standard §10.29.8.1), so a Response carries one
        // and a Final carries N — N rows of 6 octets, not one row of 6N.
        if (u.replyRctu !== undefined) {
          out.push({ key: 'ieRrti', bytes: RRTI_IE_BYTES, value: V.replyTime(rctuText(u.replyRctu)) })
          break
        }
        for (const t of u.finalTimes ?? []) {
          out.push({ key: 'ieRrti', bytes: RRTI_IE_BYTES, value: V.finalReply(t.id, rctuDur(t.treply2)) })
        }
        break
      }
      case 'RMI':
        out.push(u.finalTimes
          ? {
            key: 'ieRmi', bytes: rmiFinalIeBytes(u.finalTimes.length),
            // The RMI IE's entry is address + round-trip time; each treply2 rides in its own RRTI IE.
            value: V.rmiFinal(
              u.finalTimes.length,
              u.finalTimes.map((t) => V.rmiFinalEntry(t.id, rctuDur(t.tround1))).join(' · '),
            ),
          }
          : {
            key: 'ieRmi', bytes: RMI_REPORT_IE_BYTES,
            value: V.rmiReport(rctuText(u.reportTimes?.treply1 ?? 0), rctuText(u.reportTimes?.tround2 ?? 0)),
          })
        break
      // --- one-way ranging ---
      case 'TXT':
        // DL-TDoA: the sender's own transmit instant on its own clock (model IE).
        out.push({
          key: 'ieTxTime', bytes: DL_TX_TIME_IE_BYTES,
          value: V.txTime(rctuText(u.dl?.txCounter ?? 0)),
        })
        break
      case 'RXT': {
        // The RX counters the sender holds, in the round's slot order: 4 octets each.
        const rx = Object.entries(u.dl?.rxCounters ?? {})
        out.push({
          key: 'ieRxTimes', bytes: dlRxTimesIeBytes(rx.length),
          value: V.rxTimes(rx.length, rx.map(([id, c]) => `${id} ${grouped(c)}`).join(' · ')),
        })
        break
      }
      case 'COFF':
        out.push({
          key: 'ieCoffs', bytes: DL_COFFS_IE_BYTES,
          // Stored as a fraction (ppm x 1e-6), the form every consumer of a reply time wants;
          // the octets on the air are an offset in ppm, so that is what the row prints.
          value: V.coffs(((u.dl?.coffs ?? 0) * 1e6).toFixed(2)),
        })
        break
      case 'BLINK':
        // UL-TDoA: the whole payload of a blink. It says who blinked and when in the schedule,
        // and nothing else — the times are the anchors' to take.
        out.push({ key: 'ieBlink', bytes: BLINK_IE_BYTES, value: V.blink(u.block, u.round) })
        break
      default:
        throw new Error(`uwbFrameFields: unknown ranging IE ${ie}`)
    }
  }
  return out
}

/** Frame Control 2 + Sequence Number 1 + Destination PAN 2 + two short addresses 2 each. */
const MHR_FIELD_BYTES = [2, 1, 2, 2, 2] as const

/**
 * One multi-millisecond fragment (P802.15.4ab). It is not a PSDU at all — no MAC header, no
 * payload IEs, no CRC — so every row below carries zero octets and the frame's whole content is
 * its place in its train, the parameters it was cut from, its length and the power it spent.
 * 4ab draft 15-23/0100r2 §2.3.2
 */
function mmsFields(frag: UwbMmsFrag, txTimeNs: Ns): FrameField[] {
  return [
    {
      key: 'mmsFragment', bytes: 0,
      value: V.fragment(frag.kind.toUpperCase(), frag.index + 1, frag.of, frag.index),
    },
    {
      key: 'mmsShape', bytes: 0,
      value: frag.kind === 'rsf'
        ? V.fragmentRsf(frag.nMsr ?? 0, frag.gap ?? 0)
        : V.fragmentRif(frag.stsLen ?? 0),
    },
    { key: 'mmsLength', bytes: 0, value: `${(txTimeNs / 1000).toFixed(2)} µs` },
    // The fragment spends the whole millisecond's energy budget inside its own length, so this
    // is the fragment's EIRP and not the node's (see mmsFragmentDbm).
    { key: 'mmsPower', bytes: 0, value: `${frag.txDbm.toFixed(2)} dBm EIRP` },
  ]
}

/**
 * The message-ID octet's name: the draft's own message name, and the prose that tells the
 * variants apart out of the string table. 4ab draft 15-22/0381r5 Table 1.6.3.1
 */
const NB_MSG_NAME: Record<number, string> = Object.fromEntries(
  (Object.keys(NB_MSG_ID) as (keyof typeof NB_MSG_ID)[]).map((k) => [NB_MSG_ID[k], V.nbMsgName[k]]),
)

/**
 * One narrowband control message (P802.15.4ab). It is a *compressed* PSDU: a one-octet message
 * ID, the fields the draft's table lists for that message, and a CRC-16 — none of the 802.15.4
 * MAC header a UWB ranging frame carries. The one field this model actually uses is the
 * REPORT's time; the rest of the table (session id, schedule, capability bits) is modelled as
 * the octets it costs and not field by field. 4ab draft 15-22/0381r5 Table 1.6.3.1 / 1.6.3.2
 */
function nbFields(nb: UwbNbMsg, bytes: number): FrameField[] {
  const time = nb.replyRctu ?? nb.roundTripRctu
  const timeBytes = time === undefined ? 0 : NB_REPORT_TIME_BYTES
  // The responder list of a one-to-many POLL: two content octets (Number of Responders,
  // SlotsPerResponder) plus one address each. The draft's fields, sized in `nb.ts`.
  const respBytes = nb.responders ? NB_OTM_POLL_BYTES + NB_ADDR_BYTES * nb.responders.length : 0
  const rest = bytes - NB_MSG_ID_BYTES - timeBytes - respBytes - NB_CRC_BYTES
  return [
    {
      key: 'nbMsgId', bytes: NB_MSG_ID_BYTES,
      value: V.nbMsgId(NB_MSG_NAME[nb.msgId] ?? V.nbMsgName.unknown, hex8(nb.msgId)),
    },
    { key: 'nbChannel', bytes: 0, value: V.nbChannel(nb.channel, nb.centerMhz.toFixed(2)) },
    ...(nb.responders
      ? [{
        key: 'nbResponders' as const, bytes: respBytes,
        value: V.nbResponders(nb.responders.length, nb.responders.join('、')),
      }]
      : []),
    ...(time !== undefined
      ? [{
        key: 'nbTime' as const, bytes: timeBytes,
        value: nb.replyRctu !== undefined ? V.replyTime(rctuText(time)) : V.nbTurnAround(rctuText(time)),
      }]
      : []),
    { key: 'nbFields', bytes: rest, value: V.nbRest(rest) },
    { key: 'fcs', bytes: NB_CRC_BYTES, value: 'CRC-16' },
  ]
}

/** MHR + payload IEs + FCS of one ranging frame. */
export function uwbFrameFields(f: FrameDesc): DecodedFrame {
  const u = f.uwb!
  const kind = f.kind as UwbFrameKind
  // P802.15.4ab: neither of the two new PHYs carries a 4z MAC header, so neither goes through
  // the MHR + IE decoder below.
  if (u.mms || u.nb) {
    const nb = u.nb
    const fields = u.mms ? mmsFields(u.mms, f.txTimeNs) : nb ? nbFields(nb, f.bytes) : []
    const bytes = fields.reduce((sum, x) => sum + x.bytes, 0)
    if (bytes !== f.bytes) throw new Error(`uwbFrameFields: ${bytes} B decoded, engine size ${f.bytes} B`)
    return {
      users: [{
        dst: f.dst, aggregated: false,
        subframes: [{
          delimiterBytes: 0, padBytes: 0,
          mpdu: { kind, typeName: 'Ranging', subtypeName: SUBTYPE[kind], fields, bytes },
        }],
        bytes,
      }],
      ppdu: uwbPpduLayout(f),
      bytes,
    }
  }
  // '*' and the '*mu'-style wildcards the engine uses for a broadcast destination.
  const broadcast = f.dst.startsWith('*')
  const [fcB, seqB, panB, dstB, srcB] = MHR_FIELD_BYTES
  const fields: FrameField[] = [
    {
      key: 'fc', bytes: fcB,
      value: V.fc(u.sp),
    },
    { key: 'seqNo', bytes: seqB, value: f.seqNo !== undefined ? String(f.seqNo) : V.seq(u.round, u.slot) },
    { key: 'dstPan', bytes: panB, value: hex16(UWB_PAN_ID) },
    {
      key: 'dstAddr16', bytes: dstB, node: broadcast ? '*' : f.dst, roles: ['DA'],
      ...(broadcast ? { value: hex16(BROADCAST_ADDR16) } : {}),
    },
    { key: 'srcAddr16', bytes: srcB, node: f.src, roles: ['SA'] },
    ...ies(u).map((x): FrameField => ({ key: x.key, bytes: x.bytes, value: x.value })),
    { key: 'fcs', bytes: UWB_FCS_BYTES, value: 'CRC-16' },
  ]
  // The header and IE widths are the engine's own (uwb/phy.ts) and tile the
  // frame with nothing left over; a mismatch means the two have drifted apart,
  // and showing wrong sizes would be worse than showing none.
  const mhr = MHR_FIELD_BYTES.reduce((s, x) => s + x, 0)
  if (mhr !== UWB_MHR_BYTES) throw new Error(`uwbFrameFields: MHR ${mhr} B, engine header ${UWB_MHR_BYTES} B`)
  const bytes = fields.reduce((s, x) => s + x.bytes, 0)
  if (bytes !== f.bytes) throw new Error(`uwbFrameFields: ${bytes} B decoded, engine size ${f.bytes} B`)
  return {
    users: [{
      dst: f.dst,
      aggregated: false,
      subframes: [{
        delimiterBytes: 0,
        padBytes: 0,
        mpdu: { kind, typeName: 'Ranging', subtypeName: SUBTYPE[kind], fields, bytes },
      }],
      bytes,
    }],
    ppdu: uwbPpduLayout(f),
    bytes,
  }
}

// --- SP1 PPDU layout ---------------------------------------------------------

const SYNC_NS = chipsToNs(SYNC_SYMBOLS * PSYM_CHIPS) // 65 128 ns
const SFD_NS = chipsToNs(SFD_SYMBOLS * PSYM_CHIPS) // 8 141 ns
const STS_GAP_NS = chipsToNs(STS_GAP_CHIPS) // 1 026 ns
const STS_NS = chipsToNs(STS_ACTIVE_CHIPS) // 65 641 ns
const PHR_NS = chipsToNs(PHR_SYMBOLS * PHR_SYMBOL_CHIPS) // 19 487 ns

/** Standard §10.29.1.1: the RMARKER is the first chip after the SFD — every timestamp is taken there. */
export const UWB_RMARKER_OFFSET_NS: Ns = SYNC_NS + SFD_NS // 73 269 ns

/**
 * SYNC, SFD, then the SP1 STS (gap, active, gap), the PHR, and the PSDU.
 * The five fixed segments come from the chip constants; the PSDU takes the
 * remainder so the layout sums to frame.txTimeNs exactly.
 */
export function uwbPpduLayout(f: FrameDesc): PpduSegment[] {
  // P802.15.4ab brings two more PHYs to the same medium, and neither is an SP1 PPDU: a
  // fragment has no preamble at all and a narrowband message has its own. `ppduLayout` routes
  // every UWB frame here, so the dispatch belongs here and not at each caller.
  if (f.uwb?.mms) return mmsPpduLayout(f)
  if (f.uwb?.nb) return nbPpduLayout(f)
  const head = SYNC_NS + SFD_NS + 2 * STS_GAP_NS + STS_NS + PHR_NS
  return [
    { key: 'sync', durNs: SYNC_NS },
    { key: 'sfd', durNs: SFD_NS },
    { key: 'stsGap', durNs: STS_GAP_NS, rmarkerNs: UWB_RMARKER_OFFSET_NS },
    { key: 'sts', durNs: STS_NS },
    { key: 'stsGap', durNs: STS_GAP_NS },
    { key: 'phr', durNs: PHR_NS },
    { key: 'psdu', durNs: f.txTimeNs - head },
  ]
}

// --- P802.15.4ab PPDU layouts --------------------------------------------------

/**
 * A fragment has no preamble, no PHY header and no payload: it is one sequence, and its RMARKER
 * is its first pulse rather than a marker 73 µs into a SYNC field it does not have. That is the
 * whole of why the mode can spend a millisecond's energy in 82 µs. 4ab draft 15-23/0100r2 §2.3.2
 */
export function mmsPpduLayout(f: FrameDesc): PpduSegment[] {
  return [{ key: 'mmsFrag', durNs: f.txTimeNs, rmarkerNs: 0 }]
}

/** The narrowband PPDU: 10 SHR symbols, 2 PHR symbols, then two symbols an octet, all at
 * 16 µs a symbol. standard Clause 12 / 4ab draft 15-23/0100r2 §2.3.1 */
export function nbPpduLayout(f: FrameDesc): PpduSegment[] {
  const symNs = NB_SYMBOL_US * 1000
  return [
    { key: 'nbShr', durNs: NB_SHR_SYMBOLS * symNs, symbols: NB_SHR_SYMBOLS, symNs },
    { key: 'phr', durNs: NB_PHR_SYMBOLS * symNs, symbols: NB_PHR_SYMBOLS, symNs },
    { key: 'psdu', durNs: f.txTimeNs - (NB_SHR_SYMBOLS + NB_PHR_SYMBOLS) * symNs, symbols: 2 * f.bytes, symNs },
  ]
}
