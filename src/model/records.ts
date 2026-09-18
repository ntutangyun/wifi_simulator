import type { FrameDesc } from './frames'
import type { Ns } from './types'

export type MacStateName =
  | 'idle' | 'defer' | 'backoff' | 'tx' | 'waitAck' | 'waitCts' | 'sifsResp' | 'rx' | 'ampWait'

/** One observable micro-event. The timeline is the append-only sequence of these. */
/** 'undetected' marks a preamble missed under interference (RX_MISS); it never appears on RX_FAIL. */
export type RxFailReason = 'collision' | 'lowSinr' | 'txDuringRx' | 'capture' | 'undetected'

export type TLRecord = { t: Ns; seq: number } & (
  | { type: 'ARRIVAL'; node: string; msduId: number; bytes: number; dst: string }
  | { type: 'ENQUEUE'; node: string; msduId: number; bytes: number; dst: string; depth: number; ac?: number; server?: string; rttFromNs?: Ns; relayFromNs?: Ns }
  /** A cloud server sent a frame; it enters the AP's queue at arriveNs. */
  | { type: 'WAN_TX'; server: string; msduId: number; bytes: number; to: string; arriveNs: Ns }
  /** A station's uplink frame, acknowledged at sentNs, has reached its cloud server. */
  | { type: 'WAN_RX'; server: string; msduId: number; bytes: number; from: string; sentNs: Ns }
  | { type: 'DEQUEUE'; node: string; msduId: number; depth: number; ac?: number }
  | { type: 'CCA_BUSY'; node: string; cause: 'energy' | 'preamble' }
  | { type: 'CCA_IDLE'; node: string }
  | { type: 'IFS_START'; node: string; kind: 'DIFS' | 'EIFS' | 'SIFS' | 'AIFS'; untilNs: Ns; ac?: number }
  | { type: 'IFS_END'; node: string; ac?: number }
  | { type: 'BACKOFF_DRAW'; node: string; value: number; cw: number; ac?: number }
  | { type: 'BACKOFF_DEC'; node: string; value: number; ac?: number }
  | { type: 'BACKOFF_FREEZE'; node: string; value: number; ac?: number }
  | { type: 'BACKOFF_RESUME'; node: string; value: number; ac?: number }
  | { type: 'INTERNAL_COLLISION'; node: string; winnerAc: number; loserAc: number }
  | { type: 'TXOP_START'; node: string; ac: number; untilNs: Ns }
  | { type: 'TXOP_END'; node: string }
  | { type: 'TX_START'; node: string; frame: FrameDesc }
  | { type: 'TX_END'; node: string; frame: FrameDesc }
  | { type: 'RX_START'; node: string; from: string; frame: FrameDesc }
  | { type: 'RX_OK'; node: string; from: string; frame: FrameDesc }
  | { type: 'RX_FAIL'; node: string; from: string | null; reason: RxFailReason }
  /** A preamble at or above −82 dBm that could not be detected (SINR below 4 dB): no reception, no EIFS. */
  | { type: 'RX_MISS'; node: string; from: string; reason: 'preambleSinr'; frame: FrameDesc }
  | { type: 'NAV_SET'; node: string; untilNs: Ns; source: string }
  | { type: 'NAV_CLEAR'; node: string }
  | { type: 'CW_CHANGE'; node: string; cw: number; ac?: number; qsrc?: number }
  | { type: 'RETRY'; node: string; msduId: number; retries: number; qsrc: number; ac?: number }
  | { type: 'DROP'; node: string; msduId: number; reason: 'retryLimit' | 'queueFull' | 'lifetime'; ac?: number }
  | { type: 'ACK_TIMEOUT'; node: string }
  | { type: 'CTS_TIMEOUT'; node: string }
  | { type: 'MAC_STATE'; node: string; state: MacStateName }
  | { type: 'COLLISION'; nodes: string[] }
  /** An AMP round announced by the AP's AMP Trigger: the poll's shape and the deadline of its access phase. */
  | { type: 'AMP_ROUND'; node: string; phase: 'random' | 'scheduled'; slots: number; slotNs: Ns; acwe: number; dlKbps: number; ulKbps: number; untilNs: Ns }
  /** The AP's round has moved to this slot. */
  | { type: 'AMP_SLOT'; node: string; slot: number; untilNs: Ns }
  /** A tag drew (or was scheduled) an Access Backoff Occurrence Counter for the round. */
  | { type: 'AMP_ABOC'; node: string; aboc: number; acw: number; slot: number | null }
  /** A tag's attempt in its chosen slot resolved. */
  | { type: 'AMP_RESULT'; node: string; slot: number; sent: boolean; acked: boolean }
)

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type EmitFn = (r: DistributiveOmit<TLRecord, 'seq'>) => void

/** Emitter stamping monotonic seq numbers; sink receives finished records. */
export function makeEmitter(sink: (r: TLRecord) => void): EmitFn {
  let seq = 0
  return (r) => sink({ ...r, seq: seq++ } as TLRecord)
}
