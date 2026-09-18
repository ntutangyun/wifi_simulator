/**
 * Field-level decoder for an HRP UWB ranging frame: the 802.15.4 MAC header,
 * one row per payload IE with its contents spelled out, and the SP1 PPDU
 * broken into SHR / STS / PHR / PSDU.
 *
 * Pure, and derived only from the FrameDesc the engine recorded: the field
 * sizes add up to `frame.bytes` and the segment durations to `frame.txTimeNs`.
 *
 * References: IEEE 802.15.4z-2020 §7.2 (MAC frame format), §7.4.4.x (ranging
 * IEs: ARC, RDM, RRMC, RRTI, RMI), §15.3 (HRP UWB PPDU), §16.2 (SP1 STS).
 */
import type { DecodedFrame, FieldKey, FrameField, PpduSegment } from '../model/frameFields'
import type { FrameDesc } from '../model/frames'
import type { Ns } from '../model/types'
import type { UwbFrameKind, UwbInfo } from './frames'
import {
  ARC_IE_BYTES, chipsToNs, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, rdmIeBytes, RCTU_NS, rmiFinalIeBytes,
  RMI_REPORT_IE_BYTES, RRMC_IE_BYTES, RRTI_IE_BYTES, SFD_SYMBOLS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS,
  UWB_FCS_BYTES, UWB_MHR_BYTES,
} from './phy'

/** Model: the simulator runs a single ranging session, so a single PAN. */
export const UWB_PAN_ID = 0x0001
/** 802.15.4 short broadcast address. */
const BROADCAST_ADDR16 = 0xffff

const SUBTYPE: Record<UwbFrameKind, string> = {
  uwbPoll: 'UWB Poll', uwbResp: 'UWB Response', uwbFinal: 'UWB Final', uwbReport: 'UWB Report',
}

const hex16 = (v: number) => `0x${v.toString(16).padStart(4, '0')}`
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
          value: `SP${u.sp} · ${method} · block ${u.block} · round ${u.round}${u.schedule ? ` · ${u.schedule.length} responders` : ''}`,
        })
        break
      case 'RDM': {
        const sched = u.schedule ?? []
        out.push({
          key: 'ieRdm', bytes: rdmIeBytes(sched.length),
          value: `${sched.length} devices: ${sched.map((id, i) => `${id} slot ${i + 1}`).join(', ')}`,
        })
        break
      }
      case 'RRMC':
        out.push({ key: 'ieRrmc', bytes: RRMC_IE_BYTES, value: `slot ${u.slot} · ${method}` })
        break
      case 'RRTI': {
        // A Response carries one reply time; a Final carries one per anchor.
        const n = u.finalTimes?.length ?? 0
        out.push({
          key: 'ieRrti', bytes: u.replyRctu !== undefined ? RRTI_IE_BYTES : n * RRTI_IE_BYTES,
          value: u.replyRctu !== undefined
            ? `reply time ${rctuText(u.replyRctu)}`
            : `${n} reply times (treply2), one per anchor`,
        })
        break
      }
      case 'RMI':
        out.push(u.finalTimes
          ? {
            key: 'ieRmi', bytes: rmiFinalIeBytes(u.finalTimes.length),
            value: `${u.finalTimes.length} anchors: ${u.finalTimes.map((t) => `${t.id} tround1 ${rctuDur(t.tround1)}, treply2 ${rctuDur(t.treply2)}`).join(' · ')}`,
          }
          : {
            key: 'ieRmi', bytes: RMI_REPORT_IE_BYTES,
            value: `treply1 ${rctuText(u.reportTimes?.treply1 ?? 0)} · tround2 ${rctuText(u.reportTimes?.tround2 ?? 0)}`,
          })
        break
      default:
        throw new Error(`uwbFrameFields: unknown ranging IE ${ie}`)
    }
  }
  return out
}

/** Frame Control 2 + Sequence Number 1 + Destination PAN 2 + two short addresses 2 each. */
const MHR_FIELD_BYTES = [2, 1, 2, 2, 2] as const

/** MHR + payload IEs + FCS of one ranging frame. */
export function uwbFrameFields(f: FrameDesc): DecodedFrame {
  const u = f.uwb!
  const kind = f.kind as UwbFrameKind
  // '*' and the '*mu'-style wildcards the engine uses for a broadcast destination.
  const broadcast = f.dst.startsWith('*')
  const [fcB, seqB, panB, dstB, srcB] = MHR_FIELD_BYTES
  const fields: FrameField[] = [
    {
      key: 'fc', bytes: fcB,
      value: `Data frame · SP${u.sp} ranging · PAN ID compression · short (16-bit) addressing`,
    },
    { key: 'seqNo', bytes: seqB, value: f.seqNo !== undefined ? String(f.seqNo) : `round ${u.round}, slot ${u.slot}` },
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
