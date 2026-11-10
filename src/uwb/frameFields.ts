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
 * §10.29.8.4 RMI, §10.32.9.1 ARC, §10.32.9.3 RR, §10.32.9.8 RDM, §10.32.9.5 RCPS, §10.32.9.6 RCMA;
 * §16.2 is the HRP UWB PPDU and its SP1 STS configuration. One-way ranging (§10.29.1.2.5) carries no
 * IE of its own: the OWR round's RCM is ARC + RR + RDM, the anchors' messages are bare, and the blink
 * is a 12-octet multipurpose frame (§7.3.5) — 2026-11-11 (W4).
 */
import type { DecodedFrame, FieldKey, FrameField, PpduSegment } from '../model/frameFields'
import { STRINGS } from '../ui/i18n'
import type { FrameDesc } from '../model/frames'
import type { Ns } from '../model/types'
import { isSp3Frame, type UwbFrameKind, type UwbInfo, type UwbMmsFrag, type UwbNbMsg, type UwbSp0Msg } from './frames'
import { MMS_SP0_SEGMENT_NS } from './mms'
import {
  NB_ADDR_BYTES, NB_CRC_BYTES, NB_MSG_ID, NB_MSG_ID_BYTES, NB_OTM_POLL_BYTES, NB_PHR_SYMBOLS,
  NB_REPORT_TIME_BYTES, NB_SHR_SYMBOLS,
  NB_SYMBOL_US,
} from './nb'
import {
  ARC_IE_BYTES, RR_IE_BYTES, chipsToNs, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS,
  raictIeBytes, rdmIeBytes, RCMA_IE_BYTES, RCPS_IE_BYTES, RCTU_NS, rmiFinalIeBytes, rmiIeBytes, rrtiIeBytes,
  RMI_AOA_AZIMUTH_BYTES, RMI_REPORT_IE_BYTES, rmmrcIeBytes, RMNR_IE_BYTES, RRMC_IE_BYTES, RRTI_IE_BYTES,
  SFD_SYMBOLS, SRRR_IE_BYTES, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS,
  UWB_EXT_ADDR_BYTES, UWB_FCS_BYTES, UWB_MHR_BYTES, UWB_MP_SHORT_FC_BYTES, UWB_SEQ_BYTES,
} from './phy'

/** Model: the simulator runs a single ranging session, so a single PAN. */
export const UWB_PAN_ID = 0x0001
/** 802.15.4 short broadcast address. */
const BROADCAST_ADDR16 = 0xffff

const SUBTYPE: Record<UwbFrameKind, string> = {
  uwbPoll: 'UWB Poll', uwbResp: 'UWB Response', uwbFinal: 'UWB Final', uwbReport: 'UWB Report',
  uwbSsDefer: 'UWB Deferred Reply Time',
  uwbInit: 'UWB Ranging Initiation',
  uwbRmnr: 'UWB Ranging Message Non-Receipt',
  uwbBlink: 'UWB Blink',
  uwbRsf: 'MMS Ranging Fragment', uwbRif: 'MMS Integrity Fragment',
  nbPoll: 'Narrowband POLL', nbResp: 'Narrowband RESP', nbReport: 'Narrowband REPORT',
  uwbSp0: 'SP0 Control Frame',
  uwbMmrcm: 'UWB Multiple Message Receipt Confirmation (MMRCM)',
  uwbSp3: 'UWB SP3 Ranging Marker',
  uwbAncillary: 'UWB Ranging Ancillary Information',
  uwbRcm: 'UWB Ranging Control Message (RCM)',
}

/** The prose half of every row below: standard tokens stay, the words around them are Chinese. */
const V = STRINGS.frameDetail.fields.uwbValue

/** The SP0 content's leading octet: which of the control plane's three messages this is. The
 * narrowband messages spend one octet on a message ID (`NB_MSG_ID_BYTES`) and the SP0 content has
 * the same job to do, so it is charged the same one octet. model */
const SP0_ROLE_BYTES = NB_MSG_ID_BYTES

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
      case 'ARC': {
        // Every Poll is built by `makePoll`, which always fills the control bits in; a frame that
        // lists the IE without them is one this decoder should never have been handed.
        if (!u.arc) throw new Error('uwbFrameFields: ARC IE on a frame that carries no ARC control bits')
        out.push({ key: 'ieArc', bytes: ARC_IE_BYTES, value: V.arc(u.arc) })
        break
      }
      case 'RR':
        // §10.32.9.3: the block and round indices of the round this RCM configures. This engine
        // never hops and never offsets a round, so those two fields are 0.
        out.push({ key: 'ieRr', bytes: RR_IE_BYTES, value: V.rr(u.block, u.round) })
        break
      case 'RDM': {
        // The ancillary round's RCM assigns slots explicitly (SIU = 1, standard §10.32.9.8); a
        // ranging Poll's RDM lists the responders in slot order.
        if (u.rdm) {
          out.push({
            key: 'ieRdm', bytes: rdmIeBytes(u.rdm.length),
            value: V.rdm(u.rdm.length, u.rdm.map((e) => (
              u.arc?.multiNode === 2 ? V.rdmSlot(e.id, e.slot, e.initiator) : V.rdmSlot(e.id, e.slot)
            )).join('、')),
          })
          break
        }
        const sched = u.schedule ?? []
        out.push({
          key: 'ieRdm', bytes: rdmIeBytes(sched.length),
          value: V.rdm(sched.length, sched.map((id, i) => V.rdmSlot(id, i + 1)).join('、')),
        })
        break
      }
      case 'RRMC':
        out.push({ key: 'ieRrmc', bytes: RRMC_IE_BYTES, value: V.rrmc(u.slot, method, u.tofRequest === true) })
        break
      case 'RCPS':
        out.push({
          key: 'ieRcps', bytes: RCPS_IE_BYTES,
          value: V.rcps(u.contention?.firstSlot ?? 1, u.contention?.lastSlot ?? 8, u.contention?.phase ?? 1),
        })
        break
      case 'RCMA':
        out.push({ key: 'ieRcma', bytes: RCMA_IE_BYTES, value: V.rcma(u.contention?.maxAttempts ?? 3) })
        break
      case 'RRTI': {
        // One RRTI IE holds the whole list (standard §10.29.8.1, Figures 10-208/10-209): a 1-octet
        // content header, then one element per reply time. A unicast Response's element has no
        // address; a broadcast Final's elements each carry the responder's.
        if (u.replyRctu !== undefined) {
          out.push({ key: 'ieRrti', bytes: RRTI_IE_BYTES, value: V.replyTime(rctuText(u.replyRctu)) })
          break
        }
        // A many-to-many SS response (standard §10.32.6): one addressed reply time per initiator.
        if (u.rrti) {
          out.push({
            key: 'ieRrti', bytes: rrtiIeBytes(u.rrti.length, true),
            value: V.rrtiM2m(u.rrti.length, u.rrti.map((t) => V.rrtiM2mEntry(t.id, rctuDur(t.replyRctu))).join(' · ')),
          })
          break
        }
        const list = u.finalTimes ?? []
        out.push({
          key: 'ieRrti', bytes: rrtiIeBytes(list.length, true),
          value: V.rmiFinal(list.length, list.map((t) => V.finalReply(t.id, rctuDur(t.treply2!))).join(' · ')),
        })
        break
      }
      case 'RMI': {
        // §10.29.8.4: a 2-octet content header, then one list element per device, each carrying the
        // times its present bits say, and an address when the frame is broadcast.
        if (!u.finalTimes) {
          if (u.tofList) {
            // The SS-TWR initiator's broadcast report of the TOFs its responders requested (§10.32.4,
            // Figure 10-235): one element per responder, TOF and address. 2026-11-11 (W4).
            out.push({
              key: 'ieRmi', bytes: rmiIeBytes(u.tofList.length, 1, true),
              value: V.rmiTof(u.tofList.length, u.tofList.map((t) => `${t.id} ${rctuText(t.tof)}`).join(' · ')),
            })
          } else if (u.reportTimes) {
            // A responder's report to the initiator: unicast, one measurement — Tround2 (embedded,
            // Figure 10-238) or the TOF it computed (deferred, Figure 10-206). 2026-11-11 (W2b).
            const tof = u.reportTimes.tof
            out.push({
              key: 'ieRmi', bytes: RMI_REPORT_IE_BYTES,
              value: tof !== undefined
                ? V.rmiReport('tof', rctuText(tof))
                : V.rmiReport('tround2', rctuText(u.reportTimes.tround2 ?? 0)),
            })
          } else if (u.aoaThetaDeg !== undefined) {
            // An SP3 responder's report when the SRRR IE's RAOA bit asked for a bearing (§10.32.9.9): the
            // same element with AOA Azimuth Present = 1 — reply time 4 + azimuth 2 (§10.29.8.4, Figure
            // 10-213). 2026-11-11 (W4): until then the bearing rode an IE of its own the standard lacks.
            out.push({
              key: 'ieRmi', bytes: rmiIeBytes(1, 1, false) + RMI_AOA_AZIMUTH_BYTES,
              value: V.rmiReplyAoa(rctuText(u.replyRctu ?? 0), `${u.aoaThetaDeg.toFixed(1)}°`),
            })
          } else {
            // SS-TWR's deferred reply-time message (§10.29.6.3): unicast, one reply time.
            out.push({
              key: 'ieRmi', bytes: rmiIeBytes(1, 1, false),
              value: V.replyTime(rctuText(u.replyRctu ?? 0)),
            })
          }
          break
        }
        // A deferred DS round's initiator report carries both times in the RMI IE (§10.29.6.6); an
        // embedded Final splits them, the reply times riding the RRTI IE beside it.
        const both = !u.ies.includes('RRTI') && u.finalTimes.length > 0 && u.finalTimes[0].treply2 !== undefined
        out.push(both
          ? {
            key: 'ieRmi', bytes: rmiIeBytes(u.finalTimes.length, 2, true),
            value: V.rmiFinal(
              u.finalTimes.length,
              u.finalTimes.map((t) => `${V.rmiFinalEntry(t.id, rctuDur(t.tround1!))}，treply2 ${rctuDur(t.treply2!)}`)
                .join(' · '),
            ),
          }
          : {
            key: 'ieRmi', bytes: rmiFinalIeBytes(u.finalTimes.length),
            value: V.rmiFinal(
              u.finalTimes.length,
              u.finalTimes.map((t) => V.rmiFinalEntry(t.id, rctuDur(t.tround1!))).join(' · '),
            ),
          })
        break
      }
      case 'RMNR':
        // standard §10.34.2.1: "formatted without any Content field" — the row has no payload to
        // decode, only the two things this IE conveys by being sent at all (design §3): the sender
        // still holds the RCM, and it did not hear this round's initiation message.
        out.push({ key: 'ieRmnr', bytes: RMNR_IE_BYTES, value: V.rmnr() })
        break
      case 'RMMRC': {
        // standard §10.36.2.1: one entry per initiator this frame answers, each an address plus
        // the receipt bitmap of that initiator's window-openers (design §3.2/§3.3). The window
        // length (R) is read off the first entry's own bitmap width, which every entry shares —
        // `makeMmrcm` is the one place that invariant is kept.
        const entries = u.mmrc ?? []
        const ackSlots = entries[0]?.received.length ?? 0
        out.push({
          key: 'ieRmmrc', bytes: rmmrcIeBytes(entries.length, ackSlots),
          value: V.rmmrc(entries.length, entries.map((e) => V.rmmrcEntry(
            e.initiator, e.received.map((r) => (r ? '1' : '0')).join(''),
          )).join(' · ')),
        })
        break
      }
      // §10.32.9.9's SRRR IE, in an SP3 round's RCM: **one IE per responder**, each 3 octets — A rows
      // of 3, not one row of 3A, the same way `RRTI` above gives a Final N rows of 6 rather than one
      // of 6N. That is what "a request is not free" actually looks like in the payload, and it is why
      // this IE's cost grows with the responder count while §10.36's MMRCR bit's does not.
      case 'SRRR': {
        for (const e of u.srrr ?? []) {
          out.push({ key: 'ieSrrr', bytes: SRRR_IE_BYTES, value: V.srrr(e.provider, e.raoa, e.rrt, e.rrtt, e.rtof) })
        }
        break
      }
      // §10.35.2.1's RAICT IE (design §4.1): the one engine-wide IE whose byte count is decided by
      // presence bits rather than a count, so the width read back here comes from which of the two
      // optional fields `u.raict` actually carries — not from any slot or schedule parameter, the
      // way every other row above reads its width.
      //
      // The Request bit is read too, and it is not decoration: the Frames Remaining field means two
      // different quantities depending on it, so a row that printed the number without the bit
      // would print the same text for a fragment and for a slot request. The bit costs no octet —
      // it is one bit of the control octet `RAICT_IE_MIN_BYTES` already prices.
      case 'RAICT': {
        const r = u.raict
        out.push({
          key: 'ieRaict',
          bytes: raictIeBytes(r?.messageNumber !== undefined, r?.framesRemaining !== undefined),
          value: V.raict(r?.request === true, r?.messageNumber, r?.framesRemaining),
        })
        break
      }
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

/**
 * One SP0 control frame (P802.15.4ab Config 1). It is the same control plane as the narrowband
 * trio — the role, and on a REPORT the one time the range is computed from — carried in a
 * BASIC_PACKET on the UWB PHY. There is no channel row, because there is no second radio to
 * name; the rest of the PSDU is modelled as the octets it costs, as the narrowband messages'
 * table fields are. 4ab draft 15-25/0194r0
 */
function sp0Fields(sp0: UwbSp0Msg, bytes: number): FrameField[] {
  const time = sp0.replyRctu ?? sp0.roundTripRctu
  const timeBytes = time === undefined ? 0 : NB_REPORT_TIME_BYTES
  const rest = bytes - SP0_ROLE_BYTES - timeBytes - NB_CRC_BYTES
  return [
    { key: 'sp0Role', bytes: SP0_ROLE_BYTES, value: V.sp0Role[sp0.role] },
    ...(time !== undefined
      ? [{
        key: 'nbTime' as const, bytes: timeBytes,
        value: sp0.replyRctu !== undefined ? V.replyTime(rctuText(time)) : V.nbTurnAround(rctuText(time)),
      }]
      : []),
    { key: 'sp0Fields', bytes: rest, value: V.sp0Rest(rest) },
    { key: 'fcs', bytes: NB_CRC_BYTES, value: 'CRC-16' },
  ]
}

/** MHR + payload IEs + FCS of one ranging frame. */
export function uwbFrameFields(f: FrameDesc): DecodedFrame {
  const u = f.uwb!
  const kind = f.kind as UwbFrameKind
  // P802.15.4ab: neither of the two new PHYs carries a 4z MAC header, so neither goes through
  // the MHR + IE decoder below. An SP3 marker carries even less than either of those: no MAC
  // header, no IE, not even the compressed-PSDU shape a narrowband message has — SYNC + SFD + STS
  // and nothing else (standard §10.32.8.2) — so its row list is empty rather than absent.
  if (u.mms || u.nb || u.sp0 || isSp3Frame(kind)) {
    const nb = u.nb
    const fields = u.mms ? mmsFields(u.mms, f.txTimeNs)
      : nb ? nbFields(nb, f.bytes)
      : u.sp0 ? sp0Fields(u.sp0, f.bytes)
      : []
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
  // The blink (standard §10.29.1.2.5): a multipurpose frame with a Short Frame Control, a Sequence
  // Number, no destination address, the tag's extended source address and an FCS — 12 octets, no IE.
  // 2026-11-11 (W4).
  if (kind === 'uwbBlink') {
    const fields: FrameField[] = [
      { key: 'fc', bytes: UWB_MP_SHORT_FC_BYTES, value: V.fcMp() },
      { key: 'seqNo', bytes: UWB_SEQ_BYTES, value: f.seqNo !== undefined ? String(f.seqNo) : V.seq(u.round, u.slot) },
      { key: 'srcAddr64', bytes: UWB_EXT_ADDR_BYTES, node: f.src, roles: ['SA'] },
      { key: 'fcs', bytes: UWB_FCS_BYTES, value: 'CRC-16' },
    ]
    const bytes = fields.reduce((s, x) => s + x.bytes, 0)
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
  if (f.uwb?.sp0) return sp0PpduLayout()
  if (isSp3Frame(f.kind)) return sp3PpduLayout()
  // STS packet configuration 0 (standard Table 16-1): no STS field, so the PHR follows the SFD and
  // the RMARKER (the first chip after the SFD, §10.29.1.1) is the PHR's first chip. 2026-11-11 (W2b).
  if (f.uwb?.sp === 0) {
    return [
      { key: 'sync', durNs: SYNC_NS },
      { key: 'sfd', durNs: SFD_NS },
      { key: 'phr', durNs: PHR_NS, rmarkerNs: UWB_RMARKER_OFFSET_NS },
      { key: 'psdu', durNs: f.txTimeNs - (SYNC_NS + SFD_NS + PHR_NS) },
    ]
  }
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

/**
 * The SP3 marker's own PPDU (standard §10.32.8.2): SYNC, SFD, then the STS, and nothing after it —
 * no PHR segment, no PSDU segment, because there is no PHR and no PSDU to lay out. Exactly the
 * first five segments of `uwbPpduLayout`'s SP1 layout with the PHR and PSDU segments removed: an
 * SP3 marker is a strict prefix of an SP1 PPDU, cut off before the part that would have let it
 * carry anything (design §3.1, `docs/superpowers/specs/2026-10-02-sp3-design.md`).
 */
export function sp3PpduLayout(): PpduSegment[] {
  return [
    { key: 'sync', durNs: SYNC_NS },
    { key: 'sfd', durNs: SFD_NS },
    { key: 'stsGap', durNs: STS_GAP_NS, rmarkerNs: UWB_RMARKER_OFFSET_NS },
    { key: 'sts', durNs: STS_NS },
    { key: 'stsGap', durNs: STS_GAP_NS },
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

/**
 * The SP0 (BASIC_PACKET) PPDU of Config 1, drawn from the four cells of the draft's own
 * acquisition table: SYNC 46.7 µs, SFD 5.8 µs, PHR 12.8 µs, PSDU 52.3 µs. It takes no
 * `FrameDesc`, because every SP0 control frame is the same length — which is the point being
 * shown here, next to a SYNC+SFD fragment four times shorter and 6.3 dB louder.
 *
 * The RMARKER sits where it does in any packet with a preamble: at the first chip after the SFD.
 * 4ab draft 15-25/0194r0
 */
export function sp0PpduLayout(): PpduSegment[] {
  const s = MMS_SP0_SEGMENT_NS
  return [
    { key: 'sync', durNs: s.sync },
    { key: 'sfd', durNs: s.sfd },
    { key: 'phr', durNs: s.phr, rmarkerNs: s.sync + s.sfd },
    { key: 'psdu', durNs: s.psdu },
  ]
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
