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
import { CCA_ED_DBM, CCA_PD_DBM, NOISE_DBM, PHY_MODES, sinrThreshDb, sinrThreshModeDb } from './phy'

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
  /** When the preamble was acquired — bounds the capture window. */
  startNs: Ns
  /** Worst-case (max) interference+noise in mW seen during the lock. */
  maxInterfMw: number
  /** True if any meaningful foreign signal overlapped the locked frame. */
  overlapped: boolean
  /**
   * Every transmitter that meaningfully overlapped this lock, accumulated as
   * they appear — the COLLISION record must name interferers even when they
   * ended before the locked frame did.
   */
  contributors: Set<string>
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
/**
 * Frame capture (message-in-message). How much stronger a second preamble must
 * be before the receiver abandons the reception in progress and re-syncs to it.
 * ns-3's SimpleFrameCaptureModel default; typical of real chipsets' restart mode.
 */
const CAPTURE_MARGIN_DB = 5

/**
 * How long a reception stays re-syncable: its preamble, during which the radio
 * is still doing AGC and timing acquisition. Once into the payload it is
 * committed, and a stronger signal can only corrupt it.
 */
const captureWindowNs = (frame: FrameDesc): Ns => PHY_MODES[frame.mode ?? 'nonht'].preambleNs

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
  /** Same-instant TX starts, applied as one batch so power decides, not order. */
  private pendingStarts: ActiveTx[] = []

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
    // cannot yet sense this transmission (CCA detect time, §17.3.10.6). Starts
    // sharing the instant are buffered and applied as ONE batch, strongest
    // signal first per receiver — otherwise which doomed frame held a lock in a
    // 3-way pileup would depend on the order transmitters were evaluated in.
    if (this.pendingStarts.length === 0) {
      this.q.schedule(t, () => this.applyPendingStarts(t), 1)
    }
    this.pendingStarts.push(tx)
    this.q.schedule(tx.endNs, () => this.endTx(tx), 1)
  }

  private applyPendingStarts(t: Ns): void {
    const starts = this.pendingStarts
    this.pendingStarts = []
    for (const [rid, r] of this.radios) {
      const arrivals = starts
        .filter((tx) => tx.txId !== rid)
        .map((tx) => ({ tx, p: this.linkDbm(tx.txId, rid) }))
        .sort((x, y) => y.p - x.p || x.tx.txId.localeCompare(y.tx.txId))
      for (const { tx, p } of arrivals) this.applyOneTx(t, rid, r, tx, p)
    }
    this.updateAllCca(t)
  }

  private applyOneTx(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const canCoexist = r.locks.every((l) => sameGroup(l.frame, tx.frame))
    if (r.locks.length > 0 && !canCoexist) {
      if (!r.transmitting && p >= CCA_PD_DBM && this.canCapture(t, r, p)) {
        // Capture: abandon the weak reception and re-sync to this preamble.
        // The dropped frame never reaches PHY-RXEND, so no error is indicated
        // and no EIFS is armed — the new lock's outcome decides the deferral.
        for (const lost of r.locks) {
          this.emit({ t, type: 'RX_FAIL', node: rid, from: lost.from, reason: 'capture' })
        }
        r.locks = []
        this.acquireLock(t, rid, r, tx, p)
      } else {
        // New signal is interference for the existing lock(s).
        for (const lock of r.locks) {
          if (p >= OVERLAP_MIN_DBM) {
            lock.overlapped = true
            lock.contributors.add(tx.txId)
          }
          lock.maxInterfMw = Math.max(lock.maxInterfMw, this.interferenceMw(rid, lock))
        }
      }
    } else if (!r.transmitting && p >= CCA_PD_DBM) {
      // Receiver acquires the preamble (possibly alongside RU-orthogonal peers).
      this.acquireLock(t, rid, r, tx, p)
    }
  }

  /**
   * Message-in-message capture. 802.11 leaves receiver behaviour on a second
   * preamble undefined (§17.3.10.6 specifies only detection), but real radios
   * abandon a weak reception and re-sync to a markedly stronger preamble that
   * arrives while they are still acquiring. Modelling it keeps the outcome of a
   * simultaneous start a function of signal strength rather than of the order
   * the transmitters happen to be evaluated in.
   */
  private canCapture(t: Ns, r: RadioState, p: number): boolean {
    return r.locks.every(
      (l) => p >= l.rxDbm + CAPTURE_MARGIN_DB && t - l.startNs < captureWindowNs(l.frame),
    )
  }

  private acquireLock(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const lock: Lock = {
      from: tx.txId, frame: tx.frame, rxDbm: p, startNs: t,
      maxInterfMw: 0, overlapped: false, contributors: new Set(),
    }
    r.locks.push(lock)
    lock.maxInterfMw = this.interferenceMw(rid, lock)
    for (const id of this.overlappersOf(rid, lock)) lock.contributors.add(id)
    lock.overlapped = lock.contributors.size > 0
    this.emit({ t, type: 'RX_START', node: rid, from: tx.txId, frame: tx.frame })
    r.listener.onRxStart(t, tx.frame, tx.txId)
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
        if (reason === 'collision') this.emitCollision(t, tx.txId, lock)
        r.listener.onRxCorrupt(t)
      }
    }
    this.updateAllCca(t)
  }

  private emitCollision(t: Ns, failedTxId: string, lock: Lock): void {
    // The lock accumulated its overlappers as they appeared — an interferer
    // that already ended still belongs in the record.
    const nodes = [failedTxId, ...lock.contributors].sort()
    const key = `${nodes.join(',')}@${t}`
    if (this.emittedCollisions.has(key)) return
    this.emittedCollisions.add(key)
    this.emit({ t, type: 'COLLISION', nodes })
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

  /** Transmitters currently overlapping a lock meaningfully (≥ OVERLAP_MIN). */
  private overlappersOf(rid: string, lock: Lock): string[] {
    return this.active
      .filter(
        (a) =>
          a.txId !== rid && a.txId !== lock.from &&
          !sameGroup(a.frame, lock.frame) &&
          this.linkDbm(a.txId, rid) >= OVERLAP_MIN_DBM,
      )
      .map((a) => a.txId)
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
