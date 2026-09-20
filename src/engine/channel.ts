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
import type { Ns, Vec3 } from '../model/types'
import { EventQueue } from './events'
import { byCodeUnit } from './hash'
import { CCA_ED_DBM, CCA_PD_DBM, PHY_MODES, noiseDbm, reqSinrDb, sinrThreshDb } from './phy'
import { wifiToUwbPathLossDb, type Emission, type Spectrum } from './spectrum'
import {
  AMP_DL_REQ_SINR_DB,
  AMP_DL_SYNC_NS,
  AMP_LEGACY_PREAMBLE_NS,
  AMP_TAG_DL_SENS_DBM,
  AMP_UL_BW_MHZ,
  AMP_UL_CHIP_NS,
  AMP_UL_REQ_SINR_DB,
  AMP_UL_SYNC_CHIPS,
  ampUlSensDbm,
  type AmpUlKbps,
} from './amp'

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
  /** The emission registered with the Spectrum, kept so `endTx` retires the same object. */
  emission?: Emission
}

/**
 * Cross-technology coupling, passed only for a link that shares its band with
 * another technology (today: the 6 GHz link under a UWB channel-5 session).
 * Without it the channel behaves exactly as before — no foreign term is ever
 * added to a power sum, so every existing timeline replays bit-for-bit.
 */
export interface ChannelSpectrum {
  s: Spectrum
  /** Where a node of this link stands, for the foreign emission's path loss. */
  posOf: (id: string) => Vec3
  /** A node's transmit power (dBm EIRP), carried on every PPDU it puts on the air. */
  txPowerOf: (id: string) => number
  /** Centre frequency of the link's operating channel, in MHz. */
  centerMhz: number
  /** The link's widest operating width, in MHz: the bandwidth energy detection listens over. */
  widthMhz: number
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
  /**
   * Transmissions whose preamble arrived while this radio was listening. A
   * signal that started while the radio was transmitting was never seen as a
   * PPDU, so it can only hold CCA busy through energy detection (§17.3.10.6).
   */
  observed: Set<string>
  /** Preambles this radio could not detect because of interference, resolved as collisions when they end. */
  misses: { from: string; startNs: Ns; contributors: Set<string> }[]
  /** 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' decodes only DL AMP PPDUs. */
  kind: 'wifi' | 'tag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU. */
  floorDbm: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca: boolean
}

export interface RadioOpts {
  /** 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' decodes only DL AMP PPDUs. */
  kind?: 'wifi' | 'tag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable?: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (default AMP_TAG_DL_SENS_DBM). */
  floorDbm?: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca?: boolean
}

/** Minimum SINR at which a preamble is detected (ns-3 ThresholdPreambleDetectionModel default). */
export const PREAMBLE_DETECT_SINR_DB = 4

const mw = (dbm: number): number => Math.pow(10, dbm / 10)
const dbm = (mwv: number): number => 10 * Math.log10(mwv)
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
const captureWindowNs = (frame: FrameDesc): Ns => {
  if (frame.amp?.dir === 'dl') return AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS
  if (frame.amp?.dir === 'ul') return AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[frame.amp.kbps as AmpUlKbps]
  return PHY_MODES[frame.mode ?? 'nonht'].preambleNs
}

const sameGroup = (a: FrameDesc, b: FrameDesc): boolean =>
  a.orthogonalGroup !== undefined && a.orthogonalGroup === b.orthogonalGroup

/** Noise bandwidth for a PPDU: an AMP UL PPDU uses its OOK-rate-dependent width; everything else the PPDU's width. */
function ampNoiseBwMhz(frame: FrameDesc): number {
  return frame.amp?.dir === 'ul' ? AMP_UL_BW_MHZ[frame.amp.kbps as AmpUlKbps] : frame.widthMhz ?? 20
}

/** Lowest RSSI at which this radio can acquire this PPDU, or null when it cannot see it as a PPDU at all. */
function detectFloorDbm(r: RadioState, frame: FrameDesc): number | null {
  if (frame.amp?.dir === 'ul') return r.ampCapable ? ampUlSensDbm(frame.amp.kbps as AmpUlKbps) : null
  if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM
  return r.kind === 'tag' ? null : CCA_PD_DBM
}

/** Decode SINR threshold for a frame as seen by receiver rid. */
function decodeThreshDb(frame: FrameDesc, rid: string, r: RadioState): number {
  if (frame.amp?.dir === 'ul') return AMP_UL_REQ_SINR_DB[frame.amp.kbps as AmpUlKbps]
  if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? AMP_DL_REQ_SINR_DB : sinrThreshDb(6)
  // Only a multi-user data PPDU is decoded per user; a Trigger or M-BA carries
  // per-user scheduling information but is itself one non-HT frame.
  if (frame.muParts && frame.kind === 'data') {
    const part = frame.muParts.find((p) => p.dst === rid)
    const mode = frame.mode ?? 'he'
    // addressed: own part's MCS; overhearers only need the (robust) preamble/header
    return reqSinrDb(mode, part ? part.mcs : 0)
  }
  if (frame.mode && frame.mode !== 'nonht' && frame.mcs !== undefined) {
    return reqSinrDb(frame.mode, frame.mcs)
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
    private spectrum?: ChannelSpectrum,
  ) {
    // The other technology's power can change between our own events, so every
    // open lock re-takes its max-over-time and carrier sense is re-evaluated.
    spectrum?.s.onChange('wifi', (t) => this.onForeignChange(t))
  }

  /**
   * The band a PPDU occupies on this link: the operating centre, the PPDU's own width.
   *
   * `ampNoiseBwMhz` is a *receiver's* noise bandwidth, and it is exactly right for the two
   * receive-side queries, which integrate the foreign term over the same band as the thermal term
   * beside it. Used for the emission it is a deliberate simplification: a frame with no
   * `widthMhz` - an ACK, a BlockAck, RTS/CTS, a Trigger - goes on the air as 20 MHz at the
   * channel centre rather than as a non-HT duplicate across the operating channel. Total EIRP is
   * preserved and nothing shipped straddles a UWB band edge, but at 320 MHz on 6305 MHz a data
   * PPDU would put 70 % of its power into UWB channel 5 while the 20 MHz ACK answering it puts
   * 100 %. Centring the emission on `sp.widthMhz` for such frames is the fix, when it matters.
   */
  private ppduBand(frame: FrameDesc, sp: ChannelSpectrum): [number, number] {
    const w = ampNoiseBwMhz(frame)
    return [sp.centerMhz - w / 2, sp.centerMhz + w / 2]
  }

  private onForeignChange(t: Ns): void {
    for (const [rid, r] of this.radios) {
      for (const lock of r.locks) {
        lock.maxInterfMw = Math.max(lock.maxInterfMw, this.interferenceMw(rid, lock))
      }
    }
    this.updateAllCca(t)
  }

  register(nodeId: string, listener: PhyListener, opts: RadioOpts = {}): void {
    this.radios.set(nodeId, {
      listener, ccaBusy: false, locks: [], transmitting: false, observed: new Set(), misses: [],
      kind: opts.kind ?? 'wifi', ampCapable: opts.ampCapable ?? false,
      floorDbm: opts.floorDbm ?? AMP_TAG_DL_SENS_DBM, cca: opts.cca ?? true,
    })
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
    const sp = this.spectrum
    if (sp) {
      // The other technology sees this PPDU as an EIRP spread over its band.
      const [lo, hi] = this.ppduBand(frame, sp)
      // The emission carries the Wi-Fi link's own path-loss law, so the mediator applies it
      // without having to work out which technology built the band.
      tx.emission = {
        txId: nodeId, eirpDbm: sp.txPowerOf(nodeId), bandLoMhz: lo, bandHiMhz: hi, pos: sp.posOf(nodeId),
        lossDb: wifiToUwbPathLossDb,
      }
      sp.s.emit('wifi', tx.emission)
    }
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
        .sort((x, y) => y.p - x.p || byCodeUnit(x.tx.txId, y.tx.txId))
      for (const { tx, p } of arrivals) {
        if (!r.transmitting) r.observed.add(tx.txId)
        this.applyOneTx(t, rid, r, tx, p)
      }
    }
    this.updateAllCca(t)
  }

  private applyOneTx(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const floor = detectFloorDbm(r, tx.frame)
    const canCoexist = r.locks.every((l) => sameGroup(l.frame, tx.frame))
    if (r.locks.length > 0 && !canCoexist) {
      if (!r.transmitting && floor !== null && p >= floor && this.canCapture(t, r, p)) {
        // Capture: abandon the weak reception and re-sync to this preamble.
        // The dropped frame never reaches PHY-RXEND, so no error is indicated
        // and no EIFS is armed — the new lock's outcome decides the deferral.
        for (const lost of r.locks) {
          this.emit({ t, type: 'RX_FAIL', node: rid, from: lost.from, reason: 'capture' })
        }
        r.locks = []
        // The captured-to preamble still has to be detected: ns-3 restarts the
        // detection period after a capture (phy-entity.cc CaptureNewFrame).
        this.detectOrMiss(t, rid, r, tx, p)
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
    } else if (!r.transmitting && floor !== null && p >= floor) {
      // Preamble detection needs SINR ≥ 4 dB against everything else on the
      // air; a preamble buried in interference is never detected — no
      // PHY-RXSTART, no reception to fail, no EIFS.
      this.detectOrMiss(t, rid, r, tx, p)
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
    if (this.spectrum && tx.emission) this.spectrum.s.retire('wifi', tx.emission)
    this.emit({ t, type: 'TX_END', node: tx.txId, frame: tx.frame })
    this.radios.get(tx.txId)!.transmitting = false

    // Resolve receptions locked onto this frame.
    for (const [rid, r] of this.radios) {
      r.observed.delete(tx.txId)
      const missIdx = r.misses.findIndex((m) => m.from === tx.txId)
      if (missIdx >= 0) {
        // An undetected preamble leaves no reception, but when it was buried
        // by another transmission that is still a collision to draw.
        const miss = r.misses.splice(missIdx, 1)[0]
        // Frames that buried each other's preambles at one instant are one
        // collision, keyed on that instant rather than on each frame's end.
        if (miss.contributors.size > 0) this.emitCollision(t, tx.txId, miss.contributors, -miss.startNs - 1)
      }
      const lockIdx = r.locks.findIndex((l) => l.from === tx.txId)
      if (lockIdx < 0) continue
      const lock = r.locks[lockIdx]
      r.locks.splice(lockIdx, 1)
      const sinrDb = lock.rxDbm - dbm(lock.maxInterfMw)
      if (sinrDb >= decodeThreshDb(lock.frame, rid, r)) {
        this.emit({ t, type: 'RX_OK', node: rid, from: tx.txId, frame: lock.frame })
        r.listener.onRxOk(t, lock.frame, tx.txId)
      } else {
        const reason = lock.overlapped ? 'collision' : 'lowSinr'
        this.emit({ t, type: 'RX_FAIL', node: rid, from: tx.txId, reason })
        if (reason === 'collision') this.emitCollision(t, tx.txId, lock.contributors)
        r.listener.onRxCorrupt(t)
      }
    }
    this.updateAllCca(t)
  }

  private emitCollision(t: Ns, failedTxId: string, contributors: Set<string>, keyNs: Ns = t): void {
    // The lock accumulated its overlappers as they appeared — an interferer
    // that already ended still belongs in the record.
    const nodes = [failedTxId, ...contributors].sort()
    const key = `${nodes.join(',')}@${keyNs}`
    if (this.emittedCollisions.has(key)) return
    this.emittedCollisions.add(key)
    this.emit({ t, type: 'COLLISION', nodes })
  }

  /**
   * Preamble detection: a PPDU at or above −82 dBm is acquired only if its
   * SINR against everything else on the air is at least 4 dB; otherwise it is
   * recorded as missed — no reception, so no EIFS.
   */
  private detectOrMiss(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const others = this.othersMw(rid, tx)
    const sinr = p - dbm(mw(noiseDbm(ampNoiseBwMhz(tx.frame))) + others.mw)
    if (sinr >= PREAMBLE_DETECT_SINR_DB) {
      // Receiver acquires the preamble (possibly alongside RU-orthogonal peers).
      this.acquireLock(t, rid, r, tx, p)
      return
    }
    this.emit({ t, type: 'RX_MISS', node: rid, from: tx.txId, reason: 'preambleSinr', frame: tx.frame })
    r.misses.push({ from: tx.txId, startNs: t, contributors: others.overlappers })
  }

  /** Sum of every other active signal at rid (excluding tx and its RU-orthogonal peers), and who overlaps meaningfully. */
  private othersMw(rid: string, tx: ActiveTx): { mw: number; overlappers: Set<string> } {
    let sum = 0
    const overlappers = new Set<string>()
    for (const a of this.active) {
      if (a.txId === rid || a === tx || sameGroup(a.frame, tx.frame)) continue
      const p = this.linkDbm(a.txId, rid)
      sum += mw(p)
      if (p >= OVERLAP_MIN_DBM) overlappers.add(a.txId)
    }
    const sp = this.spectrum
    if (sp) {
      // Foreign power raises the noise a preamble has to stand out from; it has
      // no transmitter on this link, so it never names a collision.
      const [lo, hi] = this.ppduBand(tx.frame, sp)
      sum += sp.s.foreignMw('wifi', sp.posOf(rid), lo, hi)
    }
    return { mw: sum, overlappers }
  }

  /** Interference+noise in mW at rid for a given lock (excludes its own tx and RU-orthogonal peers). */
  private interferenceMw(rid: string, lock: Lock): number {
    // thermal noise in the width of the PPDU being received
    let sum = mw(noiseDbm(ampNoiseBwMhz(lock.frame)))
    for (const a of this.active) {
      if (a.txId === rid || a.txId === lock.from) continue
      if (sameGroup(a.frame, lock.frame)) continue
      sum += mw(this.linkDbm(a.txId, rid))
    }
    const sp = this.spectrum
    if (sp) {
      const [lo, hi] = this.ppduBand(lock.frame, sp)
      sum += sp.s.foreignMw('wifi', sp.posOf(rid), lo, hi)
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
      if (!r.cca) continue
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
          // −82 dBm applies to a PPDU whose preamble this radio could see;
          // one that began during our own transmission counts only as energy.
          // An AMP UL PPDU is below Wi-Fi's preamble-detect floor, so it can
          // only ever hold CCA busy through raw energy, never as 'preamble'.
          if (p >= CCA_PD_DBM && r.observed.has(a.txId) && a.frame.amp?.dir !== 'ul') anyPd = true
        }
        const sp = this.spectrum
        if (sp) {
          // Energy detection listens over the whole operating channel, whatever
          // width the PPDU on it happens to use. A foreign signal is never a
          // detectable preamble, so it can only ever hold CCA busy as energy.
          sum += sp.s.foreignMw(
            'wifi', sp.posOf(rid), sp.centerMhz - sp.widthMhz / 2, sp.centerMhz + sp.widthMhz / 2,
          )
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
