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
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, CF_END_BYTES, CTS_BYTES, FCS_BYTES, MAC_HDR_BYTES,
  PHY_MODES, QOS_HDR_BYTES, RTS_BYTES, multiStaBaBytes, triggerBytes,
} from '../engine/phy'
import { UWB_FCS_BYTES, UWB_MHR_BYTES } from '../uwb/phy'
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
  | 'mhr' | 'psdu'

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
  /** Table 9-1 type and subtype names. */
  typeName: 'Control' | 'Data'
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

export interface PpduSegment {
  key: PpduSegmentKey
  durNs: Ns
  /** Data segment: OFDM symbols and the duration of one. */
  symbols?: number
  symNs?: Ns
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

const SUBTYPE: Record<Exclude<FrameKind, 'data'>, string> = {
  ack: 'Ack', cts: 'CTS', rts: 'RTS', ba: 'Block Ack', mba: 'Block Ack (Multi-STA)',
  trigger: 'Trigger', cfend: 'CF-End',
  ampTrigger: 'AMP Trigger', ampAck: 'AMP Ack', ampResp: 'AMP Response',
  uwbPoll: 'UWB Poll', uwbResp: 'UWB Response', uwbFinal: 'UWB Final', uwbReport: 'UWB Report',
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

function mpduOf(kind: FrameKind, typeName: 'Control' | 'Data', subtypeName: string, fields: FrameField[], msduId?: number): Mpdu {
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
  const kind = f.kind as Exclude<FrameKind, 'data'>
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
    case 'uwbPoll':
    case 'uwbResp':
    case 'uwbFinal':
    case 'uwbReport':
      // Placeholder decode until the UWB frame view (task 7) breaks the IEs out
      // field by field: MHR, the payload IEs as one block, FCS.
      fields = [
        { key: 'mhr', bytes: UWB_MHR_BYTES, value: `${f.src} → ${dst === '*' ? 'broadcast' : dst}` },
        { key: 'psdu', bytes: f.bytes - UWB_MHR_BYTES - UWB_FCS_BYTES, value: f.uwb?.ies.join(' + ') ?? 'ranging IEs' },
        { key: 'fcs', bytes: UWB_FCS_BYTES, value: 'CRC-16' },
      ]
      checkSize(fields, f.bytes)
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

/** P802.11bp AMP PPDU: legacy preamble + U-SIG then AMP-Sync/SIG/Data (DL), or AMP-Sync/Data only (UL, no legacy preamble). */
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
  // Placeholder until task 7 splits the SP1 PPDU into SHR / STS / PHR / PSDU.
  if (f.uwb) return [{ key: 'data', durNs: f.txTimeNs }]
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
  const users = f.kind === 'data'
    ? decodeData(f, ctx)
    : [userPsdu(f.dst, [{ delimiterBytes: 0, mpdu: controlMpdu(f, ctx.apId), padBytes: 0 }], false)]
  return { users, ppdu: ppduLayout(f), bytes: sum(users.map((u) => u.bytes)) }
}
