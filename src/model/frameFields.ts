/**
 * Field-level decoder for a recorded frame: the 802.11 MAC header fields of
 * every MPDU it carries and the layout of the PPDU it was sent in.
 *
 * Pure and derived only from the FrameDesc the engine recorded, with byte
 * sizes that follow the engine's own accounting (so the fields add up to
 * `frame.bytes` and the PPDU segments to `frame.txTimeNs`).
 *
 * References: IEEE 802.11-2024 §9.2.4 (MAC header), Table 9-1 (type/subtype),
 * §9.3.1 (control frames), §10.12 / Table 10-1 (UP → TID per AC),
 * §9.7 (A-MPDU subframe format).
 */
import {
  AMP_ACK_BYTES, AMP_DL_SIG_BYTES, AMP_DL_SYNC_NS, AMP_FCS_BYTES, AMP_LEGACY_PREAMBLE_NS, AMP_PADDING_NS,
  AMP_READING_BYTES, AMP_STA_ID_BYTES, AMP_TRIGGER_BODY_BYTES, AMP_UL_CHIP_NS, AMP_UL_SYNC_CHIPS,
  AMP_SCRAMBLER_INIT, ampBitsNs, ampId16, type AmpUlKbps,
} from '../engine/amp'
import {
  AMP_BS_DL_KBPS, AMP_BS_DL_SYNC_NS, AMP_BS_UL_CHIP_NS, AMP_BS_UL_SYNC_CHIPS, AMP_RFID_FCS_BYTES,
  BS_CMD_BODY_BYTES, BS_CMD_NAME, BS_REPLY_BODY_BYTES, crc16Epc, epcOf, type AmpBsUlKbps,
} from '../engine/ampBs'
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, CF_END_BYTES, CTS_BYTES, FCS_BYTES, MAC_HDR_BYTES,
  PHY_MODES, QOS_HDR_BYTES, RTS_BYTES, TGI_NS, multiStaBaBytes, preambleNsFor, symNsFor, triggerBytes,
} from '../engine/phy'
import { uwbFrameFields, uwbPpduLayout } from '../uwb/frameFields'
import type { UwbFrameKind } from '../uwb/frames'
import { HT_CONTROL_BYTES, TID_FOR_AC, eofPadding, type FrameDesc, type FrameKind, type MpduHdr } from './frames'
import type { Ns } from './types'

export type AddrRole = 'RA' | 'TA' | 'DA' | 'SA' | 'BSSID'

export type FcBitKey =
  | 'protocolVersion' | 'type' | 'subtype' | 'toDs' | 'fromDs' | 'moreFrag'
  | 'retry' | 'pwrMgt' | 'moreData' | 'protected' | 'htc'

export type FieldKey =
  | 'fc' | 'duration' | 'addr1' | 'addr2' | 'addr3' | 'seqCtl' | 'qos' | 'htc'
  | 'body' | 'baControl' | 'baInfo' | 'commonInfo' | 'userInfo' | 'fcs'
  | 'ampId' | 'ampTdc' | 'ampStaList'
  // 802.15.4 ranging frames (uwb/frameFields.ts): MHR fields then one key per payload IE.
  | 'seqNo' | 'dstPan' | 'dstAddr16' | 'srcAddr16'
  // The blink's multipurpose frame (standard §7.3.5, §10.29.1.2.5) names its sender by its extended address.
  | 'srcAddr64'
  | 'ieArc' | 'ieRr' | 'ieRdm' | 'ieRrmc' | 'ieRrti' | 'ieRmi' | 'ieRcps' | 'ieRcma'
  // §10.34's ranging message non-receipt exchange: a header-only IE, no Content field at all.
  | 'ieRmnr'
  // §10.36's receipt-confirmation answer: one entry per initiator, each an address plus a bitmap.
  | 'ieRmmrc'
  // §10.32.9.9's SP3 ranging-request-reports IE, one per responder of an SP3 round. (The bearing its
  // RAOA bit asks for is the AOA Azimuth field of the report's RMI IE, §10.29.8.4 — `ieRmi`.)
  | 'ieSrrr'
  // §10.35.2.1's RAICT IE (Request = 0 half, design §4.1): one row, whose byte count depends on
  // which of the two optional fields the content's own presence bits claim.
  | 'ieRaict'
  // P802.15.4ab. A multi-millisecond fragment is a raw sequence, not a PSDU: its rows carry no
  // octets at all. A narrowband control message is a compressed PSDU of its own shape, with
  // none of the 802.15.4 MAC header the UWB ranging frames carry.
  | 'mmsFragment' | 'mmsShape' | 'mmsLength' | 'mmsPower'
  | 'nbMsgId' | 'nbChannel' | 'nbFields' | 'nbTime' | 'nbResponders'
  // …and the SP0 control frame of Config 1, which is the same control plane on the UWB PHY: one
  // packet format, the role in its content, and no channel field because there is no second
  // radio to name one.
  | 'sp0Role' | 'sp0Fields'

export interface FrameField {
  key: FieldKey
  bytes: number
  /**
   * What the field holds, as the inspector shows it. The Wi-Fi and AMP decoders below still
   * write theirs in English; `uwb/frameFields.ts` renders its rows through the string table,
   * which is where a value with prose in it belongs.
   */
  value?: string
  /** Address fields: every role this address plays (e.g. RA and DA). */
  roles?: AddrRole[]
  /** Address fields: the node id, or '*' for the broadcast address. */
  node?: string
  /** Frame Control sub-fields. */
  bits?: { key: FcBitKey; value: string }[]
}

/** One MAC frame (MPDU). */
export interface Mpdu {
  kind: FrameKind
  /** Table 9-1 type and subtype names; 'Ranging' for the 802.15.4 frames, which are neither. */
  typeName: 'Control' | 'Data' | 'Ranging'
  subtypeName: string
  fields: FrameField[]
  /** Sum of the field sizes. */
  bytes: number
  msduId?: number
}

/** An MPDU as carried in the PSDU: bare, or inside an A-MPDU subframe. */
export interface Subframe {
  /**
   * A-MPDU delimiter octets (0 for a bare MPDU): EOF/Tag (1 bit), Reserved (1), MPDU Length (14),
   * CRC (8) and Delimiter Signature 0x4E (8) — Figure 9-1329 / Table 9-659. The CRC value itself is
   * not computed here; its 8 bits are counted.
   */
  delimiterBytes: number
  /** The delimiter's EOF/Tag bit: 1 in an S-MPDU's delimiter (§10.12.7). */
  eof?: boolean
  mpdu: Mpdu
  /** Padding to a 4-octet boundary (0 on the last subframe: its Padding subfield belongs to the EOF padding). */
  padBytes: number
}

/**
 * The EOF padding that fills a VHT/HE/EHT A-MPDU to PSDU_LENGTH (§10.12.6): the final subframe's
 * Padding subfield, EOF padding subframes (a 4-octet delimiter each, MPDU Length 0, EOF 1) and
 * EOF padding octets.
 */
export interface EofPad {
  finalPad: number
  eofSubframes: number
  eofOctets: number
}

/** The PSDU addressed to one receiver (several in a DL MU PPDU). */
export interface UserPsdu {
  dst: string
  aggregated: boolean
  subframes: Subframe[]
  /** VHT/HE/EHT PSDUs: the EOF padding after the last subframe. */
  eofPad?: EofPad
  bytes: number
}

export type PpduSegmentKey =
  | 'legacyPreamble' | 'signal' | 'preamble' | 'muSig' | 'data' | 'padding'
  | 'usig' | 'ampSync' | 'ampSig' | 'ampData' | 'signalExt'
  // P802.11bp backscatter: the two excitation fields, which are carrier rather than data — the
  // wake-up that powers the tags, and the one the reply is reflected out of.
  | 'ampWup' | 'ampBst'
  | 'sync' | 'sfd' | 'stsGap' | 'sts' | 'phr' | 'psdu'
  // P802.15.4ab: the whole of a fragment, and the narrowband PPDU's own preamble.
  | 'mmsFrag' | 'nbShr'

export interface PpduSegment {
  key: PpduSegmentKey
  durNs: Ns
  /** Data segment: OFDM symbols and the duration of one. */
  symbols?: number
  symNs?: Ns
  /** UWB: this segment begins at the RMARKER — its offset from the start of the PPDU. */
  rmarkerNs?: Ns
}

export interface DecodedFrame {
  users: UserPsdu[]
  ppdu: PpduSegment[]
  /** Sum over users (equals frame.bytes). */
  bytes: number
}

export interface DecodeCtx {
  apId: string
  /** QoS data frames (EDCA negotiated between sender and AP). */
  isEdca: boolean
}

export { TID_FOR_AC }

/** 802.11 subtype names. The UWB kinds are absent on purpose: they never reach
 * this decoder, and uwb/frameFields.ts owns the one table that names them. */
const SUBTYPE: Record<Exclude<FrameKind, 'data' | UwbFrameKind>, string> = {
  ack: 'Ack', cts: 'CTS', rts: 'RTS', ba: 'Block Ack', mba: 'Block Ack (Multi-STA)',
  trigger: 'Trigger', cfend: 'CF-End',
  ampTrigger: 'AMP Trigger', ampAck: 'AMP Ack', ampResp: 'AMP Response',
  ampRfid: 'AMP RFID', ampBsReply: 'AMP Backscatter Reply',
}
const SUBTYPE_BITS: Record<string, string> = {
  Ack: '1101', CTS: '1100', RTS: '1011', 'Block Ack': '1001', 'Block Ack (Multi-STA)': '1001',
  Trigger: '0010', 'CF-End': '1110', Data: '0000', 'QoS Data': '1000',
}

/** Frame Control + Duration + RA + TA. */
const CTRL_HDR_BYTES = 16
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const bit = (b: boolean | undefined) => (b ? '1' : '0')
const usOf = (ns: Ns) => `${Math.round(ns / 100) / 10} µs`

function fcField(
  typeName: 'Control' | 'Data', subtypeName: string, toDs: boolean, fromDs: boolean, retry: boolean, htc = false,
): FrameField {
  return {
    key: 'fc', bytes: 2,
    bits: [
      { key: 'protocolVersion', value: '0' },
      { key: 'type', value: `${typeName === 'Data' ? '10' : '01'} (${typeName})` },
      { key: 'subtype', value: `${SUBTYPE_BITS[subtypeName]} (${subtypeName})` },
      { key: 'toDs', value: bit(toDs) },
      { key: 'fromDs', value: bit(fromDs) },
      { key: 'moreFrag', value: '0' },
      { key: 'retry', value: bit(retry) },
      { key: 'pwrMgt', value: '0' },
      { key: 'moreData', value: '0' },
      { key: 'protected', value: '0' },
      { key: 'htc', value: bit(htc) },
    ],
  }
}

function addr(key: 'addr1' | 'addr2' | 'addr3', node: string, roles: AddrRole[]): FrameField {
  return { key, bytes: 6, node, roles }
}

function mpduOf(kind: FrameKind, typeName: Mpdu['typeName'], subtypeName: string, fields: FrameField[], msduId?: number): Mpdu {
  return { kind, typeName, subtypeName, fields, bytes: sum(fields.map((f) => f.bytes)), msduId }
}

interface DataArgs {
  src: string
  dst: string
  durationNs: Ns
  retry: boolean
  qos: boolean
  ac: number | undefined
  /** The ack policy the QoS Control field carries (Table 9-13). */
  ackPolicy: 'Normal Ack' | 'Implicit BAR' | 'HETP Ack'
  seqNo: number | undefined
  payloadBytes: number
  msduId?: number
  /** The end-to-end DA / SA when it is neither the RA nor the TA (Table 9-60). */
  da?: string
  sa?: string
  /** An HT Control field carrying a TRS Control subfield (§9.2.4.7.1). */
  trs?: { ulDataSymbols: number; mcs: number }
}

/**
 * One data MPDU, addresses per the To DS / From DS rules of Table 9-60: with To DS 1 Address 3 is
 * the DA, with From DS 1 it is the SA, and with both 0 it is the BSSID.
 */
function dataMpdu(a: DataArgs, apId: string): Mpdu {
  const toDs = a.dst === apId && a.src !== apId
  const fromDs = a.src === apId
  let addrs: FrameField[]
  if (fromDs) addrs = [addr('addr1', a.dst, ['RA', 'DA']), addr('addr2', apId, ['TA', 'BSSID']), addr('addr3', a.sa ?? apId, ['SA'])]
  else if (toDs) addrs = [addr('addr1', apId, ['RA', 'BSSID']), addr('addr2', a.src, ['TA', 'SA']), addr('addr3', a.da ?? apId, ['DA'])]
  else addrs = [addr('addr1', a.dst, ['RA', 'DA']), addr('addr2', a.src, ['TA', 'SA']), addr('addr3', apId, ['BSSID'])]
  const subtype = a.qos ? 'QoS Data' : 'Data'
  const fields: FrameField[] = [
    fcField('Data', subtype, toDs, fromDs, a.retry, a.trs !== undefined),
    { key: 'duration', bytes: 2, value: usOf(a.durationNs) },
    ...addrs,
    { key: 'seqCtl', bytes: 2, value: a.seqNo !== undefined ? `SN ${a.seqNo} · FN 0` : 'FN 0' },
  ]
  if (a.qos) {
    fields.push({
      key: 'qos', bytes: QOS_HDR_BYTES - MAC_HDR_BYTES,
      value: `TID ${TID_FOR_AC[a.ac ?? 1]} · ${a.ackPolicy}`,
    })
  }
  if (a.trs !== undefined) {
    fields.push({
      key: 'htc', bytes: HT_CONTROL_BYTES,
      value: `HE · TRS: UL Data Symbols ${a.trs.ulDataSymbols - 1} · UL HE-MCS ${a.trs.mcs}`,
    })
  }
  fields.push({ key: 'body', bytes: a.payloadBytes, value: `${a.payloadBytes} B` })
  fields.push({ key: 'fcs', bytes: FCS_BYTES })
  return mpduOf('data', 'Data', subtype, fields, a.msduId)
}

/**
 * A-MPDU subframes (§9.7.1): every subframe but the last padded to a 4-octet boundary. A lone
 * subframe of a VHT/HE/EHT PSDU is an S-MPDU, its delimiter's EOF bit 1 (§10.12.7).
 */
function aggregate(mpdus: Mpdu[], smpdu = false): Subframe[] {
  return mpdus.map((mpdu, i) => ({
    delimiterBytes: AMPDU_DELIMITER_BYTES,
    eof: smpdu && mpdus.length === 1,
    mpdu,
    padBytes: i === mpdus.length - 1 ? 0 : Math.ceil(mpdu.bytes / 4) * 4 - mpdu.bytes,
  }))
}

function userPsdu(dst: string, subframes: Subframe[], aggregated: boolean, psduLength?: number): UserPsdu {
  const apep = sum(subframes.map((s) => s.delimiterBytes + s.mpdu.bytes + s.padBytes))
  if (psduLength === undefined || psduLength <= apep) return { dst, aggregated, subframes, bytes: apep }
  return { dst, aggregated, subframes, eofPad: eofPadding(apep, psduLength), bytes: psduLength }
}

/** The MPDU header of the i-th MPDU, when the frame recorded one. */
const hdrOf = (hdrs: MpduHdr[] | undefined, i: number): MpduHdr | undefined => hdrs?.[i]

function controlMpdu(f: FrameDesc, apId: string): Mpdu {
  if (f.uwb) throw new Error('unreachable: UWB frames are decoded by uwb/frameFields.ts')
  const kind = f.kind as Exclude<FrameKind, 'data' | UwbFrameKind>
  const sub = SUBTYPE[kind]
  const head = (fields: FrameField[]) => [fcField('Control', sub, false, false, false), { key: 'duration' as const, bytes: 2, value: usOf(f.durationFieldNs) }, ...fields]
  const dst = f.dst.startsWith('*') ? '*' : f.dst
  let fields: FrameField[]
  switch (kind) {
    case 'ack':
    case 'cts':
      fields = head([addr('addr1', dst, ['RA'])])
      fields.push({ key: 'fcs', bytes: FCS_BYTES })
      checkSize(fields, kind === 'ack' ? ACK_BYTES : CTS_BYTES)
      break
    case 'rts':
      fields = head([addr('addr1', dst, ['RA']), addr('addr2', f.src, ['TA'])])
      fields.push({ key: 'fcs', bytes: FCS_BYTES })
      checkSize(fields, RTS_BYTES)
      break
    case 'cfend':
      fields = head([addr('addr1', '*', ['RA']), addr('addr2', apId, ['BSSID'])])
      fields.push({ key: 'fcs', bytes: FCS_BYTES })
      checkSize(fields, CF_END_BYTES)
      break
    case 'ba':
      fields = head([addr('addr1', dst, ['RA']), addr('addr2', f.src, ['TA'])])
      fields.push({ key: 'baControl', bytes: 2, value: 'Compressed' })
      fields.push({
        key: 'baInfo', bytes: BA_BYTES - CTRL_HDR_BYTES - 2 - FCS_BYTES,
        value: f.ba ? `SSN ${f.ba.ssn} · bitmap: ${f.ba.acked.length} received` : 'SSC + bitmap',
      })
      fields.push({ key: 'fcs', bytes: FCS_BYTES })
      checkSize(fields, BA_BYTES)
      break
    case 'mba': {
      const n = f.muParts?.length ?? 1
      const total = multiStaBaBytes(n)
      fields = head([addr('addr1', '*', ['RA']), addr('addr2', f.src, ['TA'])])
      fields.push({ key: 'baControl', bytes: 2, value: 'Multi-STA' })
      fields.push({ key: 'baInfo', bytes: total - CTRL_HDR_BYTES - 2 - FCS_BYTES, value: `${n} × AID TID Info` })
      fields.push({ key: 'fcs', bytes: FCS_BYTES })
      checkSize(fields, total)
      break
    }
    case 'trigger': {
      const n = f.muParts?.length ?? 0
      const total = triggerBytes(n)
      fields = head([addr('addr1', '*', ['RA']), addr('addr2', f.src, ['TA'])])
      fields.push({ key: 'commonInfo', bytes: total - CTRL_HDR_BYTES - 6 * n - FCS_BYTES, value: 'Basic' })
      fields.push({ key: 'userInfo', bytes: 6 * n, value: `${n} × User Info` })
      fields.push({ key: 'fcs', bytes: FCS_BYTES })
      checkSize(fields, total)
      break
    }
    case 'ampTrigger': {
      const a = f.amp!
      const ids = a.phase === 'scheduled' ? a.staIds ?? [] : []
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Trigger' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, value: `AP ${ampId16(f.src).toString(16).padStart(4, '0')} (broadcast trigger)` },
        { key: 'ampTdc', bytes: 2, value: `${a.phase} · UL ${a.ulKbps ?? a.kbps} kb/s · channel ${a.channel ?? '—'} · UL shift ${a.ulShiftMhz ?? 0} MHz · seed index ${a.seedIdx ?? 0} (0x${(AMP_SCRAMBLER_INIT[a.seedIdx ?? 0] ?? 0).toString(16)})` },
        { key: 'body', bytes: AMP_TRIGGER_BODY_BYTES, value: `Session ${a.sessionId} · ACWE ${a.acwe} (ACW ${2 ** (a.acwe ?? 0) - 1}) · ${a.slots} slots × ${usOf(a.slotNs ?? 0)} · ${a.reading ? 'reading' : 'id only'}` },
      ]
      if (ids.length) fields.push({ key: 'ampStaList', bytes: AMP_STA_ID_BYTES * ids.length, value: ids.map((id) => ampId16(id).toString(16).padStart(4, '0')).join(' ') })
      fields.push({ key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' })
      checkSize(fields, f.bytes)
      break
    }
    case 'ampAck':
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Ack' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, node: f.dst, value: f.dst === f.src ? 'AP id (nothing received)' : ampId16(f.dst).toString(16).padStart(4, '0') },
        { key: 'fcs', bytes: 1, value: 'CRC-8' },
      ]
      checkSize(fields, AMP_ACK_BYTES)
      break
    case 'ampResp': {
      const a = f.amp!
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Response' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, node: f.src, value: ampId16(f.src).toString(16).padStart(4, '0') },
        { key: 'ampTdc', bytes: 2, value: `slot ${a.slot}${a.aboc !== undefined ? ` · ABOC ${a.aboc}` : ''}` },
      ]
      if (a.reading) fields.push({ key: 'body', bytes: AMP_READING_BYTES, value: 'reading' })
      fields.push({ key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' })
      checkSize(fields, f.bytes)
      break
    }
    // Mono-static backscatter (PDT 11-26/1519r5 §39.3.3, 11-26/1520r3). The downlink is either a
    // broadcast AMP Trigger (ID 0xFFFF; its layout as the Active Tx trigger's) or an AMP RFID frame
    // carrying the UHF Read command, whose 16-bit ID is the addressed tag's — the CRC-16 of its EPC
    // (SFD FM-25) — with a 32-bit MAC header and a 16-bit FCS.
    case 'ampRfid': {
      const r = f.amp!.rfid!
      if (r.cmd === 'trigger') {
        fields = [
          { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Trigger' }, { key: 'protected', value: '0' }] },
          { key: 'ampId', bytes: 2, value: 'ffff (broadcast)' },
          { key: 'ampTdc', bytes: 2, value: `random access · UL ${r.ulKbps} kb/s` },
          { key: 'body', bytes: BS_CMD_BODY_BYTES.trigger, value: `Session ${r.session} · ACWE ${r.acwe ?? 0} (ACW ${2 ** (r.acwe ?? 0) - 1}) · 1 slot` },
          { key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' },
        ]
      } else {
        fields = [
          { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP RFID' }, { key: 'protected', value: '0' }] },
          {
            // FM-25's 16-bit id is the CRC-16 of the tag's EPC, so it has to be the EPC the tag
            // actually carries: the one the scenario configured when there is one, and only then
            // the one derived from the node id.
            key: 'ampId', bytes: 2, node: f.dst,
            value: crc16Epc(r.epc ?? epcOf(f.dst)).toString(16).padStart(4, '0'),
          },
          { key: 'ampTdc', bytes: 1, value: `body ${BS_CMD_BODY_BYTES.read} octets · UL ${r.ulKbps} kb/s` },
          { key: 'body', bytes: BS_CMD_BODY_BYTES.read, value: `UHF ${BS_CMD_NAME[r.cmd]} (EPC bank)` },
          { key: 'fcs', bytes: AMP_RFID_FCS_BYTES, value: 'CRC-16' },
        ]
      }
      checkSize(fields, f.bytes)
      break
    }
    // …and the uplink: an AMP Response carrying the tag's ID, or an AMP RFID frame with the Read
    // reply (the EPC) in its body.
    case 'ampBsReply': {
      const b = f.amp!.bs!
      const id = crc16Epc(b.epc ?? epcOf(f.src)).toString(16).padStart(4, '0')
      fields = b.reply === 'id'
        ? [
          { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Response' }, { key: 'protected', value: '0' }] },
          { key: 'ampId', bytes: 2, node: f.src, value: id },
          { key: 'ampTdc', bytes: 2, value: `slot ${b.slot}` },
          { key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' },
        ]
        : [
          { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP RFID' }, { key: 'protected', value: '0' }] },
          { key: 'ampId', bytes: 2, node: f.src, value: id },
          { key: 'ampTdc', bytes: 1, value: `body ${BS_REPLY_BODY_BYTES.read} octets` },
          { key: 'body', bytes: BS_REPLY_BODY_BYTES.read, value: `Read reply · EPC ${b.epc ?? epcOf(f.src)}` },
          { key: 'fcs', bytes: AMP_RFID_FCS_BYTES, value: 'CRC-16' },
        ]
      checkSize(fields, f.bytes)
      break
    }
  }
  return mpduOf(kind, 'Control', sub, fields)
}

function checkSize(fields: FrameField[], expected: number): void {
  const got = sum(fields.map((x) => x.bytes))
  if (got !== expected) throw new Error(`frameFields: ${got} B decoded, engine size ${expected} B`)
}

function decodeData(f: FrameDesc, ctx: DecodeCtx): UserPsdu[] {
  if (f.muParts) {
    return f.muParts.map((p) => {
      const sizes = p.msduBytes ?? []
      const mpdus = sizes.map((b, i) => {
        const h = hdrOf(p.mpdus, i)
        return dataMpdu({
          src: f.src, dst: p.dst, durationNs: f.durationFieldNs, retry: h?.retry ?? !!p.retryFlag, qos: true, ac: p.ac ?? f.ac,
          ackPolicy: p.trs ? 'HETP Ack' : 'Implicit BAR', seqNo: h?.sn, payloadBytes: b, msduId: p.msduIds[i],
          da: h?.da, sa: h?.sa, trs: p.trs,
        }, ctx.apId)
      })
      return userPsdu(p.dst, aggregate(mpdus), true, p.bytes)
    })
  }
  const ids = f.ampdu?.msduIds ?? (f.msduId !== undefined ? [f.msduId] : [])
  if (f.ampdu) {
    const sizes = f.msduBytes ?? []
    const mpdus = sizes.map((b, i) => {
      const h = hdrOf(f.mpdus, i)
      return dataMpdu({
        src: f.src, dst: f.dst, durationNs: f.durationFieldNs, retry: h?.retry ?? !!f.retryFlag, qos: f.qos !== false, ac: f.ac,
        ackPolicy: 'Implicit BAR', seqNo: h?.sn ?? (i === 0 ? f.seqNo : undefined), payloadBytes: b, msduId: ids[i],
        da: h?.da, sa: h?.sa,
      }, ctx.apId)
    })
    // The PSDU is PSDU_LENGTH when the frame recorded its pre-EOF-padding length separately.
    return [userPsdu(f.dst, aggregate(mpdus), true, f.apepBytes !== undefined ? f.bytes : undefined)]
  }
  const qosFrame = f.qos ?? ctx.isEdca
  const hdr = qosFrame ? QOS_HDR_BYTES : MAC_HDR_BYTES
  const h = hdrOf(f.mpdus, 0)
  const payload = f.msduBytes?.[0] ?? f.bytes - hdr - FCS_BYTES - (f.smpdu ? AMPDU_DELIMITER_BYTES : 0)
  const mpdu = dataMpdu({
    src: f.src, dst: f.dst, durationNs: f.durationFieldNs, retry: h?.retry ?? !!f.retryFlag, qos: qosFrame, ac: f.ac,
    ackPolicy: 'Normal Ack', seqNo: h?.sn ?? f.seqNo, payloadBytes: payload, msduId: ids[0], da: h?.da, sa: h?.sa,
  }, ctx.apId)
  if (f.smpdu) return [userPsdu(f.dst, aggregate([mpdu], true), true, f.bytes)]
  return [userPsdu(f.dst, [{ delimiterBytes: 0, mpdu, padBytes: 0 }], false)]
}

/**
 * P802.11bp AMP PPDU. Three shapes, and every one of them sums to `f.txTimeNs` exactly:
 *
 * - **Active Tx downlink** — legacy preamble + U-SIG, then AMP-Sync / AMP-SIG / AMP-Data, a
 *   padding field and the signal extension.
 * - **Backscatter downlink** (`amp.rfid`) — the same preamble, then the WUP-Excitation that boots
 *   the tags (absent after the first PPDU of a TXOP), a 16 µs mono-static AMP-Sync, the command
 *   at 250 kb/s, and the BST-Excitation the reply is reflected out of. No AMP-SIG (SFD PM-65
 *   note) and no padding field, which is why this cannot reuse the Active Tx arithmetic: its
 *   fixed prefix alone is longer than a whole QueryRep PPDU at 1 Mb/s.
 * - **Uplink**, Active Tx or backscattered — sync chips then data, no legacy preamble. The two
 *   tiers count sync differently (48 chips against 24) at different chip rates, so each reads its
 *   own constants rather than leaning on the fact that the products happen to coincide.
 */
function ampPpduLayout(f: FrameDesc): PpduSegment[] {
  const a = f.amp!
  if (a.dir === 'ul') {
    const sync = a.bs
      ? AMP_BS_UL_SYNC_CHIPS * AMP_BS_UL_CHIP_NS[a.kbps as AmpBsUlKbps]
      : AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[a.kbps as AmpUlKbps]
    return [{ key: 'ampSync', durNs: sync }, { key: 'ampData', durNs: f.txTimeNs - sync }]
  }
  if (a.rfid) {
    const r = a.rfid
    const data = ampBitsNs(f.bytes * 8, AMP_BS_DL_KBPS)
    const ext = f.txTimeNs - (AMP_LEGACY_PREAMBLE_NS + r.wupNs + AMP_BS_DL_SYNC_NS + data + r.bstNs)
    const segs: PpduSegment[] = [
      { key: 'legacyPreamble', durNs: 16_000 }, { key: 'signal', durNs: 4_000 }, { key: 'usig', durNs: 12_000 },
    ]
    if (r.wupNs > 0) segs.push({ key: 'ampWup', durNs: r.wupNs })
    segs.push({ key: 'ampSync', durNs: AMP_BS_DL_SYNC_NS }, { key: 'ampData', durNs: data }, { key: 'ampBst', durNs: r.bstNs })
    if (ext > 0) segs.push({ key: 'signalExt', durNs: ext })
    return segs
  }
  const sig = ampBitsNs(AMP_DL_SIG_BYTES * 8, a.kbps)
  const data = ampBitsNs(f.bytes * 8, a.kbps)
  const pad = a.padNs ?? AMP_PADDING_NS
  const ext = f.txTimeNs - (AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + sig + data + pad)
  const segs: PpduSegment[] = [
    { key: 'legacyPreamble', durNs: 16_000 }, { key: 'signal', durNs: 4_000 }, { key: 'usig', durNs: 12_000 },
    { key: 'ampSync', durNs: AMP_DL_SYNC_NS }, { key: 'ampSig', durNs: sig }, { key: 'ampData', durNs: data }, { key: 'padding', durNs: pad },
  ]
  if (ext > 0) segs.push({ key: 'signalExt', durNs: ext })
  return segs
}

/** Preamble, PHY header and data symbols of the PPDU; durations sum to frame.txTimeNs. */
export function ppduLayout(f: FrameDesc): PpduSegment[] {
  if (f.amp) return ampPpduLayout(f)
  if (f.uwb) return uwbPpduLayout(f)
  const mode = f.mode ?? 'nonht'
  const m = PHY_MODES[mode]
  const giNs = f.giNs ?? TGI_NS.base
  const segs: PpduSegment[] = []
  let head: Ns
  if (mode === 'nonht') {
    // Not one character of this branch moves. GI_TYPE in clause 19 is the LONG_GI / SHORT_GI
    // enumeration — a different set of values from HE/EHT's three, not a narrower one (design
    // §5 item 2b) — so a `giNs` on a non-HT PPDU would be meaningless rather than smaller.
    segs.push({ key: 'legacyPreamble', durNs: 16_000 }, { key: 'signal', durNs: m.preambleNs - 16_000 })
    head = m.preambleNs
  } else {
    // Both halves of the guard interval's cost land here: the 4x LTF's 8.8 µs on the preamble
    // and the longer symbol on the data field. Changing only the data field would leave an
    // 8.8 µs `padding` segment behind, and the segments would still sum to `txTimeNs`.
    const head0 = preambleNsFor(mode, giNs)
    segs.push({ key: 'preamble', durNs: head0 })
    head = head0
    // A DL MU PPDU carries HE-SIG-B / EHT-SIG; a TB PPDU (orthogonal, uplink) does not. Its
    // duration does not follow `giNs`: the pre-HE/pre-EHT fields' GI is fixed at 0.8 µs.
    if (f.kind === 'data' && f.muParts && m.muExtraPreambleNs > 0) {
      segs.push({ key: 'muSig', durNs: m.muExtraPreambleNs })
      head += m.muExtraPreambleNs
    }
  }
  const rest = Math.max(0, f.txTimeNs - head)
  const symNs = symNsFor(mode, giNs)
  const symbols = Math.floor(rest / symNs)
  segs.push({ key: 'data', durNs: symbols * symNs, symbols, symNs })
  const pad = rest - symbols * symNs
  if (pad > 0) segs.push({ key: 'padding', durNs: pad })
  return segs
}

export function decodeFrame(f: FrameDesc, ctx: DecodeCtx): DecodedFrame {
  if (f.uwb) return uwbFrameFields(f)
  // A control frame in an HE/EHT TB PPDU (the BlockAck that answers a TRS Control subfield) is
  // carried in an A-MPDU like every HE PSDU (§9.7.3); one in a non-HT PPDU is a bare MPDU.
  const users = f.kind === 'data'
    ? decodeData(f, ctx)
    : f.apepBytes !== undefined
      ? [userPsdu(f.dst, aggregate([controlMpdu(f, ctx.apId)], true), true, f.bytes)]
      : [userPsdu(f.dst, [{ delimiterBytes: 0, mpdu: controlMpdu(f, ctx.apId), padBytes: 0 }], false)]
  return { users, ppdu: ppduLayout(f), bytes: sum(users.map((u) => u.bytes)) }
}
