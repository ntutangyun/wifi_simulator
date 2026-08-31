/**
 * Shared-medium model: tracks active transmissions, drives per-node CCA
 * (physical carrier sense, §17.3.10.6) and resolves receptions with an
 * SINR-based capture model. Virtual carrier sense (NAV) lives in the MAC.
 */
import type { FrameDesc } from '../model/frames'
import type { EmitFn } from '../model/records'
import type { Ns } from '../model/types'
import { EventQueue } from './events'
import { CCA_ED_DBM, CCA_PD_DBM, NOISE_DBM, sinrThreshDb } from './phy'

export interface PhyListener {
  onCcaBusy(t: Ns): void
  onCcaIdle(t: Ns): void
  onRxOk(t: Ns, frame: FrameDesc, from: string): void
  /** Energy that looked like a frame ended without being decodable → EIFS at the MAC. */
  onRxCorrupt(t: Ns): void
}

interface ActiveTx {
  txId: string
  frame: FrameDesc
  endNs: Ns
}

interface Lock {
  from: string
  frame: FrameDesc
  rxDbm: number
  /** Worst-case (max) interference+noise in mW seen during the lock. */
  maxInterfMw: number
  /** True if any meaningful foreign signal overlapped the locked frame. */
  overlapped: boolean
}

interface RadioState {
  listener: PhyListener
  ccaBusy: boolean
  lock: Lock | null
  transmitting: boolean
}

const mw = (dbm: number): number => Math.pow(10, dbm / 10)
const dbm = (mwv: number): number => 10 * Math.log10(mwv)
const NOISE_MW = mw(NOISE_DBM)
/** Interferers at/above this level count as "overlap" for collision labeling. */
const OVERLAP_MIN_DBM = -92

export class Channel {
  private radios = new Map<string, RadioState>()
  private active: ActiveTx[] = []
  private emittedCollisions = new Set<string>()

  constructor(
    private q: EventQueue,
    private now: () => Ns,
    private linkTable: Map<string, Map<string, number>>,
    private emit: EmitFn,
  ) {}

  register(nodeId: string, listener: PhyListener): void {
    this.radios.set(nodeId, { listener, ccaBusy: false, lock: null, transmitting: false })
  }

  isCcaBusy(nodeId: string): boolean {
    return this.radios.get(nodeId)!.ccaBusy
  }

  isTransmitting(nodeId: string): boolean {
    return this.radios.get(nodeId)!.transmitting
  }

  private linkDbm(txId: string, rxId: string): number {
    const v = this.linkTable.get(txId)?.get(rxId)
    return v === undefined ? -200 : v
  }

  startTx(nodeId: string, frame: FrameDesc): void {
    const t = this.now()
    const me = this.radios.get(nodeId)!
    if (me.transmitting) throw new Error(`${nodeId} startTx while transmitting`)
    me.transmitting = true

    // Half-duplex: transmitting kills any reception in progress.
    if (me.lock) {
      this.emit({ t, type: 'RX_FAIL', node: nodeId, from: me.lock.from, reason: 'txDuringRx' })
      me.lock = null
    }

    const tx: ActiveTx = { txId: nodeId, frame, endNs: t + frame.txTimeNs }
    this.active.push(tx)
    this.emit({ t, type: 'TX_START', node: nodeId, frame })

    for (const [rid, r] of this.radios) {
      if (rid === nodeId) continue
      const p = this.linkDbm(nodeId, rid)
      if (r.lock) {
        // New signal is interference for the existing lock.
        if (p >= OVERLAP_MIN_DBM) r.lock.overlapped = true
        r.lock.maxInterfMw = Math.max(r.lock.maxInterfMw, this.interferenceMw(rid, r.lock.from))
      } else if (!r.transmitting && p >= CCA_PD_DBM) {
        // Receiver acquires the preamble.
        r.lock = {
          from: nodeId, frame, rxDbm: p,
          maxInterfMw: this.interferenceMw(rid, nodeId),
          overlapped: this.hasOverlap(rid, nodeId),
        }
        this.emit({ t, type: 'RX_START', node: rid, from: nodeId, frame })
      }
    }
    this.q.schedule(tx.endNs, () => this.endTx(tx))
    this.updateAllCca(t)
  }

  private endTx(tx: ActiveTx): void {
    const t = this.now()
    this.active = this.active.filter((a) => a !== tx)
    this.emit({ t, type: 'TX_END', node: tx.txId, frame: tx.frame })
    this.radios.get(tx.txId)!.transmitting = false

    // Resolve receptions locked onto this frame.
    for (const [rid, r] of this.radios) {
      if (!r.lock || r.lock.from !== tx.txId) continue
      const lock = r.lock
      r.lock = null
      const sinrDb = lock.rxDbm - dbm(lock.maxInterfMw)
      if (sinrDb >= sinrThreshDb(lock.frame.mbps)) {
        this.emit({ t, type: 'RX_OK', node: rid, from: tx.txId, frame: lock.frame })
        r.listener.onRxOk(t, lock.frame, tx.txId)
      } else {
        const reason = lock.overlapped ? 'collision' : 'lowSinr'
        this.emit({ t, type: 'RX_FAIL', node: rid, from: tx.txId, reason })
        if (reason === 'collision') this.emitCollision(t, tx.txId, rid)
        r.listener.onRxCorrupt(t)
      }
    }
    this.updateAllCca(t)
  }

  private emitCollision(t: Ns, failedTxId: string, _rxId: string): void {
    const others = this.active
      .filter((a) => a.txId !== failedTxId && this.linkDbm(a.txId, _rxId) >= OVERLAP_MIN_DBM)
      .map((a) => a.txId)
    // Overlapping frames may already have ended; include the failed tx regardless.
    const nodes = [failedTxId, ...others].sort()
    const key = `${nodes.join(',')}@${t}`
    if (this.emittedCollisions.has(key)) return
    this.emittedCollisions.add(key)
    this.emit({ t, type: 'COLLISION', nodes })
  }

  /** Sum in mW of all active foreign signals at rid except excludeTxId, plus noise. */
  private interferenceMw(rid: string, excludeTxId: string): number {
    let sum = NOISE_MW
    for (const a of this.active) {
      if (a.txId === rid || a.txId === excludeTxId) continue
      sum += mw(this.linkDbm(a.txId, rid))
    }
    return sum
  }

  private hasOverlap(rid: string, excludeTxId: string): boolean {
    return this.active.some(
      (a) => a.txId !== rid && a.txId !== excludeTxId && this.linkDbm(a.txId, rid) >= OVERLAP_MIN_DBM,
    )
  }

  private updateAllCca(t: Ns): void {
    for (const [rid, r] of this.radios) {
      let busy: boolean
      let cause: 'energy' | 'preamble' = 'energy'
      if (r.transmitting) {
        busy = true
      } else {
        let sum = 0
        let anyPd = false
        for (const a of this.active) {
          if (a.txId === rid) continue
          const p = this.linkDbm(a.txId, rid)
          sum += mw(p)
          if (p >= CCA_PD_DBM) anyPd = true
        }
        busy = anyPd || sum >= mw(CCA_ED_DBM) || r.lock !== null
        cause = anyPd || r.lock !== null ? 'preamble' : 'energy'
      }
      if (busy !== r.ccaBusy) {
        r.ccaBusy = busy
        if (busy) {
          this.emit({ t, type: 'CCA_BUSY', node: rid, cause })
          r.listener.onCcaBusy(t)
        } else {
          this.emit({ t, type: 'CCA_IDLE', node: rid })
          r.listener.onCcaIdle(t)
        }
      }
    }
  }
}
