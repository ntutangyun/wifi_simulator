import type { Gen2Cmd, Gen2Reply } from '../engine/ampBs'
import type { UwbRecord } from '../uwb/records'
import type { FrameDesc } from './frames'
import type { Ns } from './types'

export type MacStateName =
  | 'idle' | 'defer' | 'backoff' | 'tx' | 'waitAck' | 'waitCts' | 'sifsResp' | 'rx' | 'ampWait'
  /** A backscatter tag holding a non-zero slot counter: powered, listening, not yet its turn. */
  | 'bsWait'
  | 'uwbWait'

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
  /**
   * One EPC Gen2 command the reader put on the air inside a downlink RFID PPDU: which command,
   * which inventory session and slot it belongs to, how long the BST-Excitation behind it holds
   * the carrier open for an answer, and when the whole PPDU ends. `q` is present on a Query only
   * — it is the Query that announces how many slots the round has.
   */
  | { type: 'AMP_RFID'; node: string; cmd: Gen2Cmd; session: number; q?: number; slot: number; bstNs: Ns; untilNs: Ns }
  /** A backscatter tag's Gen2 slot counter, drawn uniformly in [0, 2^Q − 1] on a Query. */
  | { type: 'AMP_BS_COUNTER'; node: string; counter: number; q: number }
  /**
   * A tag backscattered an answer. It carries no power of its own, so what the reader gets is
   * `rxDbmAtAp` — the excitation twice through the path loss and 6 dB down — and `snrDb` is that
   * against the reader's own self-leakage floor, which is the whole story of mono-static reach.
   */
  | { type: 'AMP_BS_REPLY'; node: string; kind: Gen2Reply; slot: number; rxDbmAtAp: number; snrDb: number }
  /**
   * The reader's tally at the end of one inventory TXOP. `session` and `complete` describe the
   * inventory as a whole (complete once 2^Q slots have been offered); `slotsOffered`, `read`,
   * `collisions`, `empties` and `txopNs` describe this TXOP alone, so a session spread over
   * several TXOPs is the sum of its records.
   *
   * Every slot offered lands in exactly one of the three columns, so
   * `read.length + collisions + empties === slotsOffered` holds for every record: the reader
   * never opens a slot it has not reserved the air to finish.
   *
   * `collisions` is a slot the reader *heard* something in and could not read — two reflections
   * on top of each other, or one spoiled by Wi-Fi. `empties` is a slot with no answer the reader
   * could hear, which covers both silence and a tag that booted and answered from beyond the
   * reply reach: the charge power carries much further than a reflection does, so those are not
   * the same distance, and neither is a collision.
   */
  | { type: 'AMP_INVENTORY'; node: string; session: number; slotsOffered: number; read: string[]; collisions: number; empties: number; txopNs: Ns; complete: boolean }
  /**
   * A backscatter tag woke up (or could not). `powered: true` is a tag that harvested
   * `incidentDbm` through a WUP-Excitation; `powered: false` is one that heard a command with no
   * wake-up preamble in front of it and had nothing to think with.
   *
   * A tag too far away to be powered at all emits **no record**: the medium never delivers the
   * PPDU to it (a backscatter radio's floor *is* `AMP_BS_ACTIVATION_DBM`), so the tag has no way
   * to know it was addressed. A lane with no boot record is a tag out of range — the absence is
   * the observation, and inventing a `powered: false` for it would claim knowledge the tag
   * cannot have.
   */
  | { type: 'AMP_BS_BOOT'; node: string; powered: boolean; incidentDbm: number }
  /** UWB ranging (src/uwb/records.ts): rounds, slots, timestamps, ranges, fixes, timeouts. */
  | UwbRecord
)

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type EmitFn = (r: DistributiveOmit<TLRecord, 'seq'>) => void

/** Emitter stamping monotonic seq numbers; sink receives finished records. */
export function makeEmitter(sink: (r: TLRecord) => void): EmitFn {
  let seq = 0
  return (r) => sink({ ...r, seq: seq++ } as TLRecord)
}
