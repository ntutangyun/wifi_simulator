/**
 * The HRP UWB medium: real propagation delay, log-distance path loss, receiver
 * sensitivity, a power-based capture rule and the excess delay a wall adds to
 * an obstructed path.
 *
 * It deliberately does NOT reuse the Wi-Fi channel. UWB ranging has no carrier
 * sense, no NAV and no SINR ladder: a frame either arrives above sensitivity
 * and alone enough to be decoded, or it does not. What it must model instead —
 * and what the Wi-Fi channel throws away — is the flight time itself, because
 * that time IS the measurement: a receiver's RMARKER is stamped at
 * txStart + d/c (+ NLOS excess), so the delivery delay has to be the physical
 * one, not a rounded slot.
 *
 * Event phases (src/engine/events.ts): a transmission's TX_START is emitted in
 * the caller's own phase, deliveries land in phase 1 (propagation effects) and
 * TX_END in phase 2 (post-propagation bookkeeping), so a device deciding at an
 * instant never sees energy that only starts at that instant.
 */
import { EventQueue } from '../engine/events'
import { byCodeUnit } from '../engine/hash'
import { wallLossDb, wallsCrossed } from '../engine/propagation'
import type { Emission, Spectrum } from '../engine/spectrum'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, RxFailReason } from '../model/records'
import type { NodeCfg, Wall } from '../model/scenario'
import type { Ns, Vec3 } from '../model/types'
import {
  UWB_BAND_MHZ, UWB_CAPTURE_DB, UWB_NLOS_NS, UWB_PL_EXP, UWB_RX_SENS_DBM, UWB_SIR_MIN_DB,
  C_M_PER_NS, uwbPl0Db, type UwbChannelNo,
} from './phy'

export interface UwbRxInfo {
  rssiDbm: number
  /** True propagation delay d / c (float ns). */
  propNs: number
  /** Excess delay the receiver measures on this path (0 when nlos is off or no wall). */
  nlosNs: number
  /** The direct path crosses at least one wall — geometry only, and what the FoM reports.
   * Independent of the session's `nlos` switch, which only idealises the excess delay. */
  nlos: boolean
  /** When the PPDU started at the transmitter (event-clock ns). */
  txStartNs: Ns
  /** The transmitter's crystal offset, for the receiver's clock-offset estimate. */
  txPpm: number
  /** Worst in-band foreign (Wi-Fi) power seen over the whole reception, in dBm;
   * −Infinity when nothing foreign was on the air — with no Spectrum, always. */
  foreignDbm: number
}

export interface UwbRadio {
  listening(): boolean
  onRxStart(from: string, frame: FrameDesc): void
  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void
  onRxFail(from: string, reason: RxFailReason): void
}

/** Internal to this module: the two session knobs the medium itself reads. */
interface UwbChannelCfg {
  channel: UwbChannelNo
  nlos: boolean
}

/** A reception in progress at one receiver. */
interface Reception {
  from: string
  frame: FrameDesc
  rssiDbm: number
  info: UwbRxInfo
  endNs: Ns
  /** Another reception overlapped it and neither captured it: it will fail at its end. */
  doomed: boolean
  /** Max over the reception of the foreign in-band power at this receiver, in mW.
   * Taken at arrival and raised on every change the Spectrum reports; 0 without one. */
  maxForeignMw: number
}

interface RadioState {
  radio: UwbRadio
  open: Reception[]
}

/** One PPDU arriving at one receiver, buffered until its whole instant is known. */
interface Arrival {
  rxId: string
  from: string
  frame: FrameDesc
  rssiDbm: number
  info: UwbRxInfo
}

export class UwbChannel {
  private radios = new Map<string, RadioState>()
  private byId = new Map<string, NodeCfg>()
  /** Arrivals sharing an instant, resolved as one batch so power decides, not call order. */
  private pending = new Map<Ns, Arrival[]>()

  constructor(
    private q: EventQueue,
    private now: () => Ns,
    nodes: NodeCfg[],
    private walls: Wall[],
    private cfg: UwbChannelCfg,
    private ppmOf: (id: string) => number,
    private emit: EmitFn,
    /** The cross-technology mediator, when a Wi-Fi link shares this channel's band.
     * Absent (or null) leaves every record exactly as it was: nothing is emitted onto
     * the spectrum, no reception ever carries foreign power, and no SIR test can bite. */
    private spectrum: Spectrum | null = null,
  ) {
    for (const n of nodes) this.byId.set(n.id, n)
    const sp = spectrum
    // The other technology's power changes between our own events, so every open
    // reception re-takes its max whenever the mediator says something changed.
    if (sp) {
      sp.onChange('uwb', () => {
        for (const [rxId, r] of this.radios) {
          if (r.open.length === 0) continue
          const mw = sp.foreignMw('uwb', this.posOf(rxId), this.band.lo, this.band.hi)
          for (const rx of r.open) rx.maxForeignMw = Math.max(rx.maxForeignMw, mw)
        }
      })
    }
  }

  /** The band this session occupies: what a foreign emission has to overlap to matter. */
  private get band(): { lo: number; hi: number } {
    return UWB_BAND_MHZ[this.cfg.channel]
  }

  register(id: string, radio: UwbRadio): void {
    this.radios.set(id, { radio, open: [] })
  }

  private nodeOf(id: string): NodeCfg {
    const n = this.byId.get(id)
    if (!n) throw new Error(`UwbChannel: unknown node ${id}`)
    return n
  }

  private posOf(id: string): Vec3 {
    return this.nodeOf(id).pos
  }

  /** 3-D separation: anchors on a ceiling and a tag at hip height are not co-planar. */
  distanceM(from: string, to: string): number {
    const a = this.posOf(from)
    const b = this.posOf(to)
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }

  /** Free-space loss at the band's centre frequency, plus the walls in the way. */
  rssiDbm(from: string, to: string): number {
    const tx = this.nodeOf(from)
    const d = this.distanceM(from, to)
    return tx.txPowerDbm
      - uwbPl0Db(this.cfg.channel)
      - 10 * UWB_PL_EXP * Math.log10(Math.max(d, 0.1))
      - wallLossDb(tx.pos, this.posOf(to), this.walls)
  }

  /**
   * Excess delay of the obstructed path: the direct ray slows through each
   * wall it crosses, so the first arriving edge is late and the range reads
   * long. Openings are exempt, exactly as for loss.
   */
  nlosNs(from: string, to: string): number {
    if (!this.cfg.nlos) return 0
    let ns = 0
    for (const m of wallsCrossed(this.posOf(from), this.posOf(to), this.walls)) ns += UWB_NLOS_NS[m]
    return ns
  }

  /**
   * Whether the direct path crosses anything, which is what the receiver's Figure of
   * Merit reports. It is geometry, not a setting: the `nlos` switch idealises the excess
   * delay (an ideal-timestamp lab), and idealising the FoM with it would have a path
   * through a brick wall claim the line-of-sight byte "97 % within 0.5 ns".
   */
  obstructed(from: string, to: string): boolean {
    return wallsCrossed(this.posOf(from), this.posOf(to), this.walls).length > 0
  }

  /**
   * Radiate a PPDU: TX_START now, TX_END one PPDU later (phase 2), and one
   * delivery per other radio at now + ceil(d / c) (phase 1).
   */
  transmit(from: string, frame: FrameDesc): void {
    const t = this.now()
    // The PPDU joins the shared spectrum at its true instants — on the air just
    // before TX_START, off it just before TX_END — so a Wi-Fi receiver's
    // max-over-lock sees the whole frame and nothing more.
    const sp = this.spectrum
    const emission: Emission | null = sp
      ? {
        txId: from, eirpDbm: this.nodeOf(from).txPowerDbm,
        bandLoMhz: this.band.lo, bandHiMhz: this.band.hi, pos: this.posOf(from),
      }
      : null
    if (sp && emission) sp.emit('uwb', emission)
    this.emit({ t, type: 'TX_START', node: from, frame })
    const endNs = t + frame.txTimeNs
    this.q.schedule(endNs, () => {
      if (sp && emission) sp.retire('uwb', emission)
      this.emit({ t: endNs, type: 'TX_END', node: from, frame })
    }, 2)

    for (const rxId of this.radios.keys()) {
      if (rxId === from) continue
      const d = this.distanceM(from, rxId)
      const propNs = d / C_M_PER_NS
      const nlosNs = this.nlosNs(from, rxId)
      const at = t + Math.ceil(propNs)
      const rssiDbm = this.rssiDbm(from, rxId)
      const arrival: Arrival = {
        rxId, from, frame, rssiDbm,
        info: {
          rssiDbm, propNs, nlosNs, nlos: this.obstructed(from, rxId),
          txStartNs: t, txPpm: this.ppmOf(from), foreignDbm: -Infinity,
        },
      }
      const batch = this.pending.get(at)
      if (batch) batch.push(arrival)
      else {
        this.pending.set(at, [arrival])
        this.q.schedule(at, () => this.deliver(at), 1)
      }
    }
  }

  /**
   * Every arrival at one instant, strongest first per receiver: which of two
   * simultaneous frames holds the receiver must follow from power, never from
   * the order the transmitters happened to call transmit().
   */
  private deliver(at: Ns): void {
    const batch = this.pending.get(at) ?? []
    this.pending.delete(at)
    const ordered = [...batch].sort((x, y) =>
      byCodeUnit(x.rxId, y.rxId) || y.rssiDbm - x.rssiDbm || byCodeUnit(x.from, y.from))
    for (const a of ordered) this.startRx(at, a)
  }

  private startRx(t: Ns, a: Arrival): void {
    const r = this.radios.get(a.rxId)
    if (!r) return
    if (!r.radio.listening()) return
    if (a.rssiDbm < UWB_RX_SENS_DBM) return

    const rx: Reception = {
      from: a.from, frame: a.frame, rssiDbm: a.rssiDbm, info: a.info,
      endNs: t + a.frame.txTimeNs, doomed: false,
      maxForeignMw: this.spectrum
        ? this.spectrum.foreignMw('uwb', this.posOf(a.rxId), this.band.lo, this.band.hi)
        : 0,
    }

    // Capture: against each reception already open, the stronger survives only
    // if it leads by the capture margin; otherwise both are lost. A late but
    // dominant arrival therefore takes the receiver from an open reception.
    for (const other of r.open) {
      const strong = rx.rssiDbm >= other.rssiDbm ? rx : other
      const weak = strong === rx ? other : rx
      weak.doomed = true
      if (strong.rssiDbm - weak.rssiDbm < UWB_CAPTURE_DB) strong.doomed = true
    }

    r.open.push(rx)
    this.emit({ t, type: 'RX_START', node: a.rxId, from: a.from, frame: a.frame })
    r.radio.onRxStart(a.from, a.frame)
    this.q.schedule(rx.endNs, () => this.endRx(a.rxId, rx), 1)
  }

  private endRx(rxId: string, rx: Reception): void {
    const r = this.radios.get(rxId)
    if (!r) return
    const i = r.open.indexOf(rx)
    if (i < 0) return
    r.open.splice(i, 1)
    const t = rx.endNs
    const foreignDbm = rx.maxForeignMw > 0 ? 10 * Math.log10(rx.maxForeignMw) : -Infinity
    rx.info.foreignDbm = foreignDbm
    if (rx.doomed) {
      const reason: RxFailReason = 'collision'
      this.emit({ t, type: 'RX_FAIL', node: rxId, from: rx.from, reason })
      r.radio.onRxFail(rx.from, reason)
      return
    }
    // A UWB receiver has no SINR ladder, only its correlation gain: the frame
    // survives interference up to UWB_SIR_MIN_DB above it and is lost beyond that.
    // With nothing foreign on the air the ratio is +Infinity, so this cannot bite.
    const sirDb = rx.rssiDbm - foreignDbm
    if (sirDb < UWB_SIR_MIN_DB) {
      const reason: RxFailReason = 'lowSinr'
      this.emit({ t, type: 'RX_FAIL', node: rxId, from: rx.from, reason })
      this.emit({ t, type: 'UWB_INTERFERED', node: rxId, from: rx.from, foreignDbm, sirDb })
      r.radio.onRxFail(rx.from, reason)
      return
    }
    this.emit({ t, type: 'RX_OK', node: rxId, from: rx.from, frame: rx.frame })
    r.radio.onRxOk(rx.from, rx.frame, rx.info)
  }
}
