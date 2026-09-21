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
  ampBitsNs, ampId16, type AmpUlKbps,
} from '../engine/amp'
import { AMP_RFID_FCS_BYTES, GEN2_CMD_BYTES, GEN2_CMD_NAME, GEN2_REPLY_BYTES, crc16Epc, epcOf } from '../engine/ampBs'
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, CF_END_BYTES, CTS_BYTES, FCS_BYTES, MAC_HDR_BYTES,
  PHY_MODES, QOS_HDR_BYTES, RTS_BYTES, multiStaBaBytes, triggerBytes,
} from '../engine/phy'
import { uwbFrameFields, uwbPpduLayout } from '../uwb/frameFields'
import type { UwbFrameKind } from '../uwb/frames'
import type { FrameDesc, FrameKind } from './frames'
import type { Ns } from './types'

export type AddrRole = 'RA' | 'TA' | 'DA' | 'SA' | 'BSSID'

export type FcBitKey =
  | 'protocolVersion' | 'type' | 'subtype' | 'toDs' | 'fromDs' | 'moreFrag'
  | 'retry' | 'pwrMgt' | 'moreData' | 'protected' | 'htc'

export type FieldKey =
  | 'fc' | 'duration' | 'addr1' | 'addr2' | 'addr3' | 'seqCtl' | 'qos'
  | 'body' | 'baControl' | 'baInfo' | 'commonInfo' | 'userInfo' | 'fcs'
  | 'ampId' | 'ampTdc' | 'ampStaList'
  // 802.15.4 ranging frames (uwb/frameFields.ts): MHR fields then one key per payload IE.
  | 'seqNo' | 'dstPan' | 'dstAddr16' | 'srcAddr16'
  | 'ieArc' | 'ieRdm' | 'ieRrmc' | 'ieRrti' | 'ieRmi' | 'ieRcps' | 'ieRcma'
  // One-way ranging (model IEs): the DL-TDoA times and the UL-TDoA blink.
  | 'ieTxTime' | 'ieRxTimes' | 'ieCoffs' | 'ieBlink'
  // P802.15.4ab. A multi-millisecond fragment is a raw sequence, not a PSDU: its rows carry no
  // octets at all. A narrowband control message is a compressed PSDU of its own shape, with
  // none of the 802.15.4 MAC header the UWB ranging frames carry.
  | 'mmsFragment' | 'mmsShape' | 'mmsLength' | 'mmsPower'
  | 'nbMsgId' | 'nbChannel' | 'nbFields' | 'nbTime'

export interface FrameField {
  key: FieldKey
  bytes: number
  /** Display value (language-neutral: numbers, protocol names). */
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
  /** A-MPDU delimiter octets (0 for a bare MPDU). */
  delimiterBytes: number
  mpdu: Mpdu
  /** Padding to a 4-octet boundary (0 on the last subframe). */
  padBytes: number
}

/** The PSDU addressed to one receiver (several in a DL MU PPDU). */
export interface UserPsdu {
  dst: string
  aggregated: boolean
  subframes: Subframe[]
  bytes: number
}

export type PpduSegmentKey =
  | 'legacyPreamble' | 'signal' | 'preamble' | 'muSig' | 'data' | 'padding'
  | 'usig' | 'ampSync' | 'ampSig' | 'ampData' | 'signalExt'
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

/** Table 10-1: AC index (0 BK, 1 BE, 2 VI, 3 VO) → TID of its lowest user priority used here. */
export const TID_FOR_AC = [1, 0, 5, 6] as const

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
  typeName: 'Control' | 'Data', subtypeName: string, toDs: boolean, fromDs: boolean, retry: boolean,
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
      { key: 'htc', value: '0' },
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
  inAmpdu: boolean
  seqNo: number | undefined
  payloadBytes: number
  msduId?: number
}

/** One data MPDU, addresses per the To DS / From DS rules (§9.2.4.1.4, Table 9-26). */
function dataMpdu(a: DataArgs, apId: string): Mpdu {
  const toDs = a.dst === apId && a.src !== apId
  const fromDs = a.src === apId
  let addrs: FrameField[]
  if (fromDs) addrs = [addr('addr1', a.dst, ['RA', 'DA']), addr('addr2', apId, ['TA', 'BSSID']), addr('addr3', apId, ['SA'])]
  else if (toDs) addrs = [addr('addr1', apId, ['RA', 'BSSID']), addr('addr2', a.src, ['TA', 'SA']), addr('addr3', apId, ['DA'])]
  else addrs = [addr('addr1', a.dst, ['RA', 'DA']), addr('addr2', a.src, ['TA', 'SA']), addr('addr3', apId, ['BSSID'])]
  const subtype = a.qos ? 'QoS Data' : 'Data'
  const fields: FrameField[] = [
    fcField('Data', subtype, toDs, fromDs, a.retry),
    { key: 'duration', bytes: 2, value: usOf(a.durationNs) },
    ...addrs,
    { key: 'seqCtl', bytes: 2, value: a.seqNo !== undefined ? `SN ${a.seqNo} · FN 0` : 'FN 0' },
  ]
  if (a.qos) {
    fields.push({
      key: 'qos', bytes: QOS_HDR_BYTES - MAC_HDR_BYTES,
      value: `TID ${TID_FOR_AC[a.ac ?? 1]} · ${a.inAmpdu ? 'Implicit BAR' : 'Normal Ack'}`,
    })
  }
  fields.push({ key: 'body', bytes: a.payloadBytes, value: `${a.payloadBytes} B` })
  fields.push({ key: 'fcs', bytes: FCS_BYTES })
  return mpduOf('data', 'Data', subtype, fields, a.msduId)
}

/** A-MPDU subframes with the engine's padding rule (every subframe but the last). */
function aggregate(mpdus: Mpdu[]): Subframe[] {
  return mpdus.map((mpdu, i) => ({
    delimiterBytes: AMPDU_DELIMITER_BYTES,
    mpdu,
    padBytes: i === mpdus.length - 1 ? 0 : Math.ceil(mpdu.bytes / 4) * 4 - mpdu.bytes,
  }))
}

function userPsdu(dst: string, subframes: Subframe[], aggregated: boolean): UserPsdu {
  return { dst, aggregated, subframes, bytes: sum(subframes.map((s) => s.delimiterBytes + s.mpdu.bytes + s.padBytes)) }
}

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
      fields.push({ key: 'baInfo', bytes: BA_BYTES - CTRL_HDR_BYTES - 2 - FCS_BYTES, value: 'SSC + bitmap' })
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
        { key: 'ampTdc', bytes: 2, value: `${a.phase} · UL ${a.ulKbps ?? a.kbps} kb/s · seed 0` },
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
    // Backscatter (slice A2). The downlink carries one EPC Gen2 command in an AMP RFID frame;
    // the id field is the addressed tag's 16-bit identifier, which SFD FM-25 defines as the
    // CRC-16 of its EPC, and the TDC carries the UL Rate field (FM-24).
    case 'ampRfid': {
      const r = f.amp!.rfid!
      const broadcast = f.dst.startsWith('*')
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: `AMP RFID (${GEN2_CMD_NAME[r.cmd]})` }, { key: 'protected', value: '0' }] },
        {
          key: 'ampId', bytes: 2, node: broadcast ? undefined : f.dst,
          value: broadcast ? 'broadcast (inventory)' : crc16Epc(epcOf(f.dst)).toString(16).padStart(4, '0'),
        },
        { key: 'ampTdc', bytes: 2, value: `session ${r.session} · UL ${r.ulKbps} kb/s${r.q !== undefined ? ` · Q ${r.q}` : ''}` },
        {
          key: 'body', bytes: GEN2_CMD_BYTES[r.cmd],
          value: `${GEN2_CMD_NAME[r.cmd]}${r.rn16 !== undefined ? ` · RN16 ${r.rn16.toString(16).padStart(4, '0')}` : ''}`,
        },
        { key: 'fcs', bytes: AMP_RFID_FCS_BYTES, value: 'CRC-16' },
      ]
      checkSize(fields, f.bytes)
      break
    }
    // …and the uplink keeps Gen2's own reply shapes, which have no AMP MAC header at all: a bare
    // RN16, or a payload closed by Gen2's CRC-16.
    case 'ampBsReply': {
      const b = f.amp!.bs!
      const rn16 = b.rn16 !== undefined ? b.rn16.toString(16).padStart(4, '0') : '—'
      fields = b.reply === 'rn16'
        ? [{ key: 'body', bytes: GEN2_REPLY_BYTES.rn16, value: `RN16 ${rn16}` }]
        : b.reply === 'epc'
          ? [
            { key: 'body', bytes: 2, value: 'PC (protocol control)' },
            { key: 'body', bytes: 12, value: `EPC ${b.epc ?? epcOf(f.src)}` },
            { key: 'fcs', bytes: 2, value: 'CRC-16' },
          ]
          : b.reply === 'read'
            ? [
              { key: 'body', bytes: 1, value: 'header (0 = success)' },
              { key: 'body', bytes: AMP_READING_BYTES, value: 'memory words' },
              { key: 'body', bytes: 2, value: `RN16 ${rn16}` },
              { key: 'fcs', bytes: 2, value: 'CRC-16' },
            ]
            : [
              { key: 'body', bytes: 1, value: 'header (0 = success)' },
              { key: 'body', bytes: 2, value: `RN16 ${rn16}` },
              { key: 'fcs', bytes: 2, value: 'CRC-16' },
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
      const mpdus = sizes.map((b, i) => dataMpdu({
        src: f.src, dst: p.dst, durationNs: f.durationFieldNs, retry: !!p.retryFlag, qos: true, ac: p.ac ?? f.ac,
        inAmpdu: true, seqNo: undefined, payloadBytes: b, msduId: p.msduIds[i],
      }, ctx.apId))
      return userPsdu(p.dst, aggregate(mpdus), true)
    })
  }
  const ids = f.ampdu?.msduIds ?? (f.msduId !== undefined ? [f.msduId] : [])
  if (f.ampdu) {
    const sizes = f.msduBytes ?? []
    const mpdus = sizes.map((b, i) => dataMpdu({
      src: f.src, dst: f.dst, durationNs: f.durationFieldNs, retry: !!f.retryFlag, qos: true, ac: f.ac,
      inAmpdu: true, seqNo: i === 0 ? f.seqNo : undefined, payloadBytes: b, msduId: ids[i],
    }, ctx.apId))
    return [userPsdu(f.dst, aggregate(mpdus), true)]
  }
  const qosFrame = f.qos ?? ctx.isEdca
  const hdr = qosFrame ? QOS_HDR_BYTES : MAC_HDR_BYTES
  const payload = f.msduBytes?.[0] ?? f.bytes - hdr - FCS_BYTES
  const mpdu = dataMpdu({
    src: f.src, dst: f.dst, durationNs: f.durationFieldNs, retry: !!f.retryFlag, qos: qosFrame, ac: f.ac,
    inAmpdu: false, seqNo: f.seqNo, payloadBytes: payload, msduId: ids[0],
  }, ctx.apId)
  return [userPsdu(f.dst, [{ delimiterBytes: 0, mpdu, padBytes: 0 }], false)]
}

/**
 * P802.11bp AMP PPDU: legacy preamble + U-SIG then AMP-Sync/SIG/Data (DL), or AMP-Sync/Data only
 * (UL, no legacy preamble).
 *
 * The uplink branch covers a backscattered reply unchanged — 24 sync chips of 2 µs and 48 of
 * 1 µs are the same 48 µs, and the same holds at 1 Mb/s — but the downlink branch is still the
 * Active Tx layout: an `ampRfid` PPDU has a 16 µs mono-static AMP-Sync, no AMP-SIG and no padding
 * field, and carries a WUP- and a BST-Excitation that have no segment key here yet, so its
 * segments currently fall out as one long signal extension. They still sum to `txTimeNs`.
 */
function ampPpduLayout(f: FrameDesc): PpduSegment[] {
  const a = f.amp!
  if (a.dir === 'ul') {
    const sync = AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[a.kbps as AmpUlKbps]
    return [{ key: 'ampSync', durNs: sync }, { key: 'ampData', durNs: f.txTimeNs - sync }]
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
  const segs: PpduSegment[] = []
  let head: Ns
  if (mode === 'nonht') {
    segs.push({ key: 'legacyPreamble', durNs: 16_000 }, { key: 'signal', durNs: m.preambleNs - 16_000 })
    head = m.preambleNs
  } else {
    segs.push({ key: 'preamble', durNs: m.preambleNs })
    head = m.preambleNs
    // A DL MU PPDU carries HE-SIG-B / EHT-SIG; a TB PPDU (orthogonal, uplink) does not.
    if (f.kind === 'data' && f.muParts && m.muExtraPreambleNs > 0) {
      segs.push({ key: 'muSig', durNs: m.muExtraPreambleNs })
      head += m.muExtraPreambleNs
    }
  }
  const rest = Math.max(0, f.txTimeNs - head)
  const symbols = Math.floor(rest / m.symNs)
  segs.push({ key: 'data', durNs: symbols * m.symNs, symbols, symNs: m.symNs })
  const pad = rest - symbols * m.symNs
  if (pad > 0) segs.push({ key: 'padding', durNs: pad })
  return segs
}

export function decodeFrame(f: FrameDesc, ctx: DecodeCtx): DecodedFrame {
  if (f.uwb) return uwbFrameFields(f)
  const users = f.kind === 'data'
    ? decodeData(f, ctx)
    : [userPsdu(f.dst, [{ delimiterBytes: 0, mpdu: controlMpdu(f, ctx.apId), padBytes: 0 }], false)]
  return { users, ppdu: ppduLayout(f), bytes: sum(users.map((u) => u.bytes)) }
}
