import type { FrameDesc } from './frames'
import type { Ns } from './types'

export type MacStateName =
  | 'idle' | 'defer' | 'backoff' | 'tx' | 'waitAck' | 'waitCts' | 'sifsResp' | 'rx'

/** One observable micro-event. The timeline is the append-only sequence of these. */
export type TLRecord = { t: Ns; seq: number } & (
  | { type: 'ARRIVAL'; node: string; msduId: number; bytes: number; dst: string }
  | { type: 'ENQUEUE'; node: string; msduId: number; bytes: number; dst: string; depth: number; ac?: number }
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
  | { type: 'RX_FAIL'; node: string; from: string | null; reason: 'collision' | 'lowSinr' | 'txDuringRx' | 'capture' }
  | { type: 'NAV_SET'; node: string; untilNs: Ns; source: string }
  | { type: 'NAV_CLEAR'; node: string }
  | { type: 'CW_CHANGE'; node: string; cw: number; ac?: number }
  | { type: 'RETRY'; node: string; msduId: number; src: number; lrc: number; ssrc: number; slrc: number; ac?: number }
  | { type: 'DROP'; node: string; msduId: number; reason: 'retryLimit'; ac?: number }
  | { type: 'ACK_TIMEOUT'; node: string }
  | { type: 'CTS_TIMEOUT'; node: string }
  | { type: 'MAC_STATE'; node: string; state: MacStateName }
  | { type: 'COLLISION'; nodes: string[] }
)

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type EmitFn = (r: DistributiveOmit<TLRecord, 'seq'>) => void

/** Emitter stamping monotonic seq numbers; sink receives finished records. */
export function makeEmitter(sink: (r: TLRecord) => void): EmitFn {
  let seq = 0
  return (r) => sink({ ...r, seq: seq++ } as TLRecord)
}
