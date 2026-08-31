/**
 * Shared-medium model: tracks active transmissions, drives per-node CCA
 * (physical carrier sense, §17.3.10.6) and resolves receptions with an
 * SINR-based capture model. Virtual carrier sense (NAV) lives in the MAC.
 *
 * v2: frames may declare an `orthogonalGroup` (OFDMA RU allocation): frames in
 * the same group do not interfere with each other, and a receiver may hold
 * multiple simultaneous locks on same-group frames (e.g. an AP receiving a
 * triggered UL MU transmission, or the simultaneous BAs after a DL MU PPDU).
 */
import type { FrameDesc } from '../model/frames'
import type { EmitFn } from '../model/records'
import type { Ns } from '../model/types'
import { EventQueue } from './events'
import { CCA_ED_DBM, CCA_PD_DBM, NOISE_DBM, sinrThreshDb, sinrThreshModeDb } from './phy'

export interface PhyListener {
  onCcaBusy(t: Ns): void
  onCcaIdle(t: Ns): void
  /** PHY-RXSTART.indication: receiver locked a preamble (§10.3.2.9 timeout semantics). */
  onRxStart(t: Ns, frame: FrameDesc, from: string): void
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
  /** Receptions in progress. >1 only for RU-orthogonal (same orthogonalGroup) frames. */
  locks: Lock[]
  transmitting: boolean
}

const mw = (dbm: number): number => Math.pow(10, dbm / 10)
const dbm = (mwv: number): number => 10 * Math.log10(mwv)
const NOISE_MW = mw(NOISE_DBM)
/** Interferers at/above this level count as "overlap" for collision labeling. */
const OVERLAP_MIN_DBM = -92

const sameGroup = (a: FrameDesc, b: FrameDesc): boolean =>
  a.orthogonalGroup !== undefined && a.orthogonalGroup === b.orthogonalGroup

/** Decode SINR threshold for a frame as seen by receiver rid. */
function decodeThreshDb(frame: FrameDesc, rid: string): number {
  if (frame.muParts) {
    const part = frame.muParts.find((p) => p.dst === rid)
    const mode = frame.mode ?? 'he'
    // addressed: own part's MCS; overhearers only need the (robust) preamble/header
    return sinrThreshModeDb(mode, part ? part.mcs : 0)
  }
  if (frame.mode && frame.mode !== 'nonht' && frame.mcs !== undefined) {
    return sinrThreshModeDb(frame.mode, frame.mcs)
  }
  return sinrThreshDb(frame.mbps)
}

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
    this.radios.set(nodeId, { listener, ccaBusy: false, locks: [], transmitting: false })
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
    for (const lock of me.locks) {
      this.emit({ t, type: 'RX_FAIL', node: nodeId, from: lock.from, reason: 'txDuringRx' })
    }
    me.locks = []

    const tx: ActiveTx = { txId: nodeId, frame, endNs: t + frame.txTimeNs }
    this.active.push(tx)
    this.emit({ t, type: 'TX_START', node: nodeId, frame })

    // Propagation effects land in phase 1: a MAC deciding at this same instant
    // cannot yet sense this transmission (CCA detect time, §17.3.10.6).
    this.q.schedule(t, () => this.applyTxEffects(t, tx), 1)
    this.q.schedule(tx.endNs, () => this.endTx(tx), 1)
  }

  private applyTxEffects(t: Ns, tx: ActiveTx): void {
    for (const [rid, r] of this.radios) {
      if (rid === tx.txId) continue
      const p = this.linkDbm(tx.txId, rid)
      const canCoexist = r.locks.every((l) => sameGroup(l.frame, tx.frame))
      if (r.locks.length > 0 && !canCoexist) {
        // New signal is interference for the existing lock(s).
        for (const lock of r.locks) {
          if (p >= OVERLAP_MIN_DBM) lock.overlapped = true
          lock.maxInterfMw = Math.max(lock.maxInterfMw, this.interferenceMw(rid, lock))
        }
      } else if (!r.transmitting && p >= CCA_PD_DBM) {
        // Receiver acquires the preamble (possibly alongside RU-orthogonal peers).
        const lock: Lock = {
          from: tx.txId, frame: tx.frame, rxDbm: p,
          maxInterfMw: 0, overlapped: false,
        }
        r.locks.push(lock)
        lock.maxInterfMw = this.interferenceMw(rid, lock)
        lock.overlapped = this.hasOverlap(rid, lock)
        this.emit({ t, type: 'RX_START', node: rid, from: tx.txId, frame: tx.frame })
        r.listener.onRxStart(t, tx.frame, tx.txId)
      } else if (r.locks.length > 0 && canCoexist && p >= OVERLAP_MIN_DBM && !sameGroup(r.locks[0].frame, tx.frame)) {
        for (const lock of r.locks) {
          lock.overlapped = true
          lock.maxInterfMw = Math.max(lock.maxInterfMw, this.interferenceMw(rid, lock))
        }
      }
    }
    this.updateAllCca(t)
  }

  private endTx(tx: ActiveTx): void {
    const t = this.now()
    this.active = this.active.filter((a) => a !== tx)
    this.emit({ t, type: 'TX_END', node: tx.txId, frame: tx.frame })
    this.radios.get(tx.txId)!.transmitting = false

    // Resolve receptions locked onto this frame.
    for (const [rid, r] of this.radios) {
      const lockIdx = r.locks.findIndex((l) => l.from === tx.txId)
      if (lockIdx < 0) continue
      const lock = r.locks[lockIdx]
      r.locks.splice(lockIdx, 1)
      const sinrDb = lock.rxDbm - dbm(lock.maxInterfMw)
      if (sinrDb >= decodeThreshDb(lock.frame, rid)) {
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

  private emitCollision(t: Ns, failedTxId: string, rxId: string): void {
    const failedFrame = this.activeOrEndedFrame(failedTxId)
    const others = this.active
      .filter((a) => a.txId !== failedTxId && this.linkDbm(a.txId, rxId) >= OVERLAP_MIN_DBM)
      .filter((a) => !(failedFrame && sameGroup(a.frame, failedFrame)))
      .map((a) => a.txId)
    const nodes = [failedTxId, ...others].sort()
    const key = `${nodes.join(',')}@${t}`
    if (this.emittedCollisions.has(key)) return
    this.emittedCollisions.add(key)
    this.emit({ t, type: 'COLLISION', nodes })
  }

  private activeOrEndedFrame(txId: string): FrameDesc | null {
    const a = this.active.find((x) => x.txId === txId)
    return a ? a.frame : null
  }

  /** Interference+noise in mW at rid for a given lock (excludes its own tx and RU-orthogonal peers). */
  private interferenceMw(rid: string, lock: Lock): number {
    let sum = NOISE_MW
    for (const a of this.active) {
      if (a.txId === rid || a.txId === lock.from) continue
      if (sameGroup(a.frame, lock.frame)) continue
      sum += mw(this.linkDbm(a.txId, rid))
    }
    return sum
  }

  private hasOverlap(rid: string, lock: Lock): boolean {
    return this.active.some(
      (a) =>
        a.txId !== rid && a.txId !== lock.from &&
        !sameGroup(a.frame, lock.frame) &&
        this.linkDbm(a.txId, rid) >= OVERLAP_MIN_DBM,
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
        busy = anyPd || sum >= mw(CCA_ED_DBM) || r.locks.length > 0
        cause = anyPd || r.locks.length > 0 ? 'preamble' : 'energy'
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
