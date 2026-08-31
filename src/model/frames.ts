import { AMPDU_DELIMITER_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, type PhyMode } from '../engine/phy'
import type { Ns } from './types'

export type FrameKind = 'data' | 'ack' | 'rts' | 'cts' | 'ba' | 'trigger' | 'mba'

/** One user's share of a DL/UL MU (OFDMA) PPDU. */
export interface MuPart {
  dst: string
  src: string
  bytes: number
  mcs: number
  mbps: number
  msduIds: number[]
  mpduCount: number
}

export interface FrameDesc {
  kind: FrameKind
  src: string
  dst: string
  /** Full PSDU octets including MAC header + FCS (aggregate for A-MPDU/MU). */
  bytes: number
  mbps: number
  /** MAC Duration/ID field expressed as time (protects the rest of the exchange). */
  durationFieldNs: Ns
  txTimeNs: Ns
  seqNo?: number
  retryFlag?: boolean
  msduId?: number
  // v2
  mode?: PhyMode // PPDU format (default nonht)
  mcs?: number
  ac?: number // 0..3 EDCA access category of the exchange
  /** A-MPDU aggregation info (single-user). */
  ampdu?: { mpduCount: number; msduIds: number[] }
  /** OFDMA MU PPDU parts (DL MU data, or per-user context of triggers/M-BA). */
  muParts?: MuPart[]
  /** Frames sharing a group are RU-orthogonal: no mutual interference. */
  orthogonalGroup?: string
}

export function dataPsduBytes(msduBytes: number): number {
  return MAC_HDR_BYTES + msduBytes + FCS_BYTES
}

/** A-MPDU subframe: delimiter + QoS data MPDU, padded to 4 octets. */
export function ampduSubframeBytes(msduBytes: number): number {
  const mpdu = QOS_HDR_BYTES + msduBytes + FCS_BYTES
  return AMPDU_DELIMITER_BYTES + Math.ceil(mpdu / 4) * 4
}

export function ampduPsduBytes(msduBytesList: number[]): number {
  return msduBytesList.reduce((s, b) => s + ampduSubframeBytes(b), 0)
}
