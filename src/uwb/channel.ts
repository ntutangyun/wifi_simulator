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
 * P802.15.4ab adds two more PHYs to the same medium, so every quantity the channel needs is
 * asked of the *frame* rather than of the session: an MMS fragment is louder than a 4z frame
 * and is delivered far below 4z sensitivity (its train combines), and a narrowband control
 * message is a different power, a different band, a different sensitivity and a different
 * path loss altogether. `txDbmFor` / `pl0For` / `sensFor` / `sirMinFor` / `bandFor` /
 * `lossDbFor` are that dispatch; a frame with no 4ab fields answers exactly as before.
 *
 * Event phases (src/engine/events.ts): a transmission's TX_START is emitted in
 * the caller's own phase, deliveries land in phase 1 (propagation effects) and
 * TX_END in phase 2 (post-propagation bookkeeping), so a device deciding at an
 * instant never sees energy that only starts at that instant.
 */
import { EventQueue } from '../engine/events'
import { byCodeUnit } from '../engine/hash'
import { wallLossDb, wallsCrossed } from '../engine/propagation'
import { uwbToWifiPathLossDb, type Emission, type Spectrum } from '../engine/spectrum'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, RxFailReason } from '../model/records'
import type { NodeCfg, Wall } from '../model/scenario'
import type { Ns, Vec3 } from '../model/types'
import { MMS_COMBINE_MAX_DB } from './mms'
import {
  NB_LBT_THRESHOLD_DBM, NB_RX_SENS_DBM, NB_SIR_MIN_DB, NB_TX_DBM, nbBand, nbPl0Db,
} from './nb'
import {
  UWB_BAND_MHZ, UWB_CAPTURE_DB, UWB_NLOS_NS, UWB_RX_SENS_DBM, UWB_SIR_MIN_DB,
  C_M_PER_NS, uwbPathLossDb, uwbPl0Db, type UwbChannelNo,
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

/** Internal to this module: the session knobs the medium itself reads. There is no MMS entry
 * here, and there must not be one: a fragment's power, its length and its place in its train
 * all ride on the frame, which is what makes the per-frame dispatch above possible at all. */
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
  /** Another reception overlapped it and it lost: it will fail at its end. */
  doomed: boolean
  /** Why it will fail: 'capture' when a fragment train that led it by the capture margin took
   * the radio, 'collision' when the two spoiled each other. */
  failReason: 'collision' | 'capture'
  /** The reception that captured this one, when `failReason` is 'capture'. A third arrival can
   * still spoil *that* one inside the margin, and then nothing was decoded in this millisecond
   * after all — so the reason is settled at the end of the reception, not when it was taken. */
  capturedBy: Reception | null
  /** The only receiver this reception competes for a radio at, or null when it is on the air
   * for everyone — `Emission.rxId`, carried through the medium. */
  rxScope: string | null
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
  /** See `Reception.rxScope`. */
  rxScope: string | null
}

/**
 * The one receiver a transmission competes for, or null when it competes everywhere.
 *
 * Only an MMS **fragment** is ever scoped, and only when it is addressed to a single device. In
 * P802.15.4ab's one-to-many round the N responder trains are all unicast to the initiator, so at
 * the initiator they would compete under the capture rule, while at responder j — which is
 * accumulating the initiator's own broadcast train — responder k's fragment is not something its
 * radio was ever trying to decode and must not doom what it is building.
 *
 * Be clear about what that guards. In this engine's interleave every device owns a slot of its
 * own inside each millisecond (`mmsLayout`), a fragment is at most 82 µs and the shortest legal
 * MMS slot is 250 µs — so two scheduled fragments never overlap in time at all, and neither this
 * scope nor the per-fragment capture below is reached from any round the scheduler lays out.
 * They are cheap defence against a layout that packs a millisecond tighter, and what
 * `tests/uwb/mms-one-to-many.test.ts` exercises by driving the medium directly. Every 4z frame,
 * every narrowband message and every broadcast train is unscoped and behaves exactly as before.
 */
function rxScopeOf(frame: FrameDesc): string | null {
  if (!frame.uwb?.mms) return null
  return frame.dst.startsWith('*') ? null : frame.dst
}

/** Whether two overlapping receptions contend for the radio at `rxId`: both have to be on the
 * air for this receiver, i.e. unscoped or scoped to it. */
function competes(a: Reception, b: Reception, rxId: string): boolean {
  return (a.rxScope === null || a.rxScope === rxId) && (b.rxScope === null || b.rxScope === rxId)
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
          const pos = this.posOf(rxId)
          // One node may hold a UWB reception and a narrowband one at the same instant, and the
          // two do not see the same foreign power: each re-takes its max over its own band.
          for (const rx of r.open) {
            const band = this.bandFor(rx.frame)
            rx.maxForeignMw = Math.max(rx.maxForeignMw, sp.foreignMw('uwb', pos, band.lo, band.hi))
          }
        }
      })
    }
  }

  /** The band this session's UWB radio occupies: what a foreign emission has to overlap to
   * matter to a 4z frame or a fragment. */
  private get band(): { lo: number; hi: number } {
    return UWB_BAND_MHZ[this.cfg.channel]
  }

  // --- Per-frame PHY ------------------------------------------------------------
  // Each of these is keyed on the 4ab fields the frame carries, never on its kind string, so a
  // frame built without them (every 4z frame) takes the session's own answer, unchanged.

  /** EIRP of one frame: a narrowband message runs at the NB module's power, an MMS fragment at
   * the power its own length lets it spend, and everything else at the node's. */
  private txDbmFor(from: string, frame?: FrameDesc): number {
    if (frame?.uwb?.nb) return NB_TX_DBM
    if (frame?.uwb?.mms) return frame.uwb.mms.txDbm
    return this.nodeOf(from).txPowerDbm
  }

  /** Free-space loss at 1 m of the band the frame actually went out on. */
  private pl0For(frame?: FrameDesc): number {
    const nb = frame?.uwb?.nb
    return nb ? nbPl0Db(nb.channel) : uwbPl0Db(this.cfg.channel)
  }

  /** The floor this frame has to clear to reach its device at all. A fragment is handed over
   * `MMS_COMBINE_MAX_DB` below 4z sensitivity, because the largest train this model allows adds
   * exactly that much back; quieter than that, no train can rescue it. */
  private sensFor(frame: FrameDesc): number {
    if (frame.uwb?.nb) return NB_RX_SENS_DBM
    if (frame.uwb?.mms) return UWB_RX_SENS_DBM - MMS_COMBINE_MAX_DB
    return UWB_RX_SENS_DBM
  }

  /** How far above the foreign power this frame must sit to survive it. An HRP receiver has its
   * correlation gain to spend; a 250 kb/s O-QPSK one has none. */
  private sirMinFor(frame: FrameDesc): number {
    return frame.uwb?.nb ? NB_SIR_MIN_DB : UWB_SIR_MIN_DB
  }

  /** The band a frame occupies — the band it is radiated over, and the band its receiver asks
   * the mediator for foreign power in. */
  private bandFor(frame: FrameDesc): { lo: number; hi: number } {
    const nb = frame.uwb?.nb
    return nb ? nbBand(nb.channel) : this.band
  }

  /** The path-loss law this frame travels under, as the mediator will apply it to a Wi-Fi
   * receiver: UWB's free-space law at the session channel's centre, or the narrowband one at
   * the message's own 2.5 MHz centre. The NB law is the UWB engine's own — exponent
   * `UWB_PL_EXP` plus walls — taken at `nbPl0Db` (model). */
  private lossDbFor(frame: FrameDesc): (dM: number, wallsDb: number) => number {
    const nb = frame.uwb?.nb
    if (nb) {
      const pl0 = nbPl0Db(nb.channel)
      return (dM, wallsDb) => uwbPathLossDb(pl0, dM, wallsDb)
    }
    const ch = this.cfg.channel
    return (dM, wallsDb) => uwbToWifiPathLossDb(dM, wallsDb, ch)
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

  /** Free-space loss at the band's centre frequency, plus the walls in the way. With no frame
   * it answers for the session's own UWB radio at the node's own power, which is what every 4z
   * caller means. */
  rssiDbm(from: string, to: string, frame?: FrameDesc): number {
    const tx = this.nodeOf(from)
    const d = this.distanceM(from, to)
    const wallsDb = wallLossDb(tx.pos, this.posOf(to), this.walls)
    return this.txDbmFor(from, frame) - uwbPathLossDb(this.pl0For(frame), d, wallsDb)
  }

  /**
   * Listen before talk on narrowband channel `channel` (4ab draft 15-22/0381r5 §1.4.2): one
   * instantaneous reading of the mediator's foreign power over the channel's 2.5 MHz stands for
   * the draft's 9 µs energy-detection window (model). Without a mediator — no Wi-Fi link shares
   * the band — the channel is always clear and nothing is drawn or scheduled.
   */
  lbtBusy(id: string, channel: number): { busy: boolean; foreignDbm: number } {
    const sp = this.spectrum
    if (!sp) return { busy: false, foreignDbm: -Infinity }
    const band = nbBand(channel)
    const foreignDbm = sp.foreignDbm('uwb', this.posOf(id), band.lo, band.hi)
    return { busy: foreignDbm >= NB_LBT_THRESHOLD_DBM, foreignDbm }
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
    const band = this.bandFor(frame)
    const rxScope = rxScopeOf(frame)
    const emission: Emission | null = sp
      ? {
        txId: from, eirpDbm: this.txDbmFor(from, frame),
        bandLoMhz: band.lo, bandHiMhz: band.hi, pos: this.posOf(from),
        lossDb: this.lossDbFor(frame),
        ...(rxScope !== null ? { rxId: rxScope } : {}),
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
      const rssiDbm = this.rssiDbm(from, rxId, frame)
      const arrival: Arrival = {
        rxId, from, frame, rssiDbm, rxScope,
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
    if (a.rssiDbm < this.sensFor(a.frame)) return

    const band = this.bandFor(a.frame)
    const rx: Reception = {
      from: a.from, frame: a.frame, rssiDbm: a.rssiDbm, info: a.info,
      endNs: t + a.frame.txTimeNs, doomed: false, failReason: 'collision', capturedBy: null,
      rxScope: a.rxScope,
      maxForeignMw: this.spectrum
        ? this.spectrum.foreignMw('uwb', this.posOf(a.rxId), band.lo, band.hi)
        : 0,
    }

    // Capture: against each reception already open **that competes for this radio**, the
    // stronger survives only if it leads by the capture margin; otherwise both are lost. A late
    // but dominant arrival therefore takes the receiver from an open reception.
    //
    // The rule is per reception, and an MMS fragment is one reception — so in a train it is
    // applied per *fragment*, millisecond by millisecond, and a receiver keeps whichever train
    // is strongest in each of them rather than deciding once for the whole train. A fragment
    // that lost to a train leading it by the margin is reported as a capture and not as a
    // collision: something was decoded in that millisecond, and the log should say which.
    // (See `rxScopeOf`: the slot grid already keeps scheduled fragments apart in time, so this
    // is defence against a tighter layout, not the path any scene takes.)
    for (const other of r.open) {
      if (!competes(rx, other, a.rxId)) continue
      const strong = rx.rssiDbm >= other.rssiDbm ? rx : other
      const weak = strong === rx ? other : rx
      weak.doomed = true
      if (strong.rssiDbm - weak.rssiDbm < UWB_CAPTURE_DB) {
        strong.doomed = true
        strong.failReason = 'collision'
        strong.capturedBy = null
        weak.failReason = 'collision'
        weak.capturedBy = null
      } else if (weak.frame.uwb?.mms) {
        weak.failReason = 'capture'
        weak.capturedBy = strong
      } else {
        weak.failReason = 'collision'
        weak.capturedBy = null
      }
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
      // A capture whose captor was itself spoiled afterwards decoded nothing at all, so the log
      // says collision — which is what that millisecond came to.
      const captured = rx.failReason === 'capture' && rx.capturedBy !== null && !rx.capturedBy.doomed
      const reason: RxFailReason = captured ? 'capture' : 'collision'
      this.emit({ t, type: 'RX_FAIL', node: rxId, from: rx.from, reason })
      r.radio.onRxFail(rx.from, reason)
      return
    }
    // A UWB receiver has no SINR ladder, only its correlation gain: the frame
    // survives interference up to UWB_SIR_MIN_DB above it and is lost beyond that.
    // A narrowband message has no such gain and goes at NB_SIR_MIN_DB instead.
    // With nothing foreign on the air the ratio is +Infinity, so this cannot bite.
    const sirDb = rx.rssiDbm - foreignDbm
    if (sirDb < this.sirMinFor(rx.frame)) {
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
