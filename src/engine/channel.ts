/**
 * Shared-medium model: tracks active transmissions, drives per-node CCA
 * (physical carrier sense, §17.3.10.6) and resolves receptions with an
 * SINR-based capture model. Virtual carrier sense (NAV) lives in the MAC.
 *
 * v2: frames may declare an `orthogonalGroup` (OFDMA RU allocation): frames in
 * the same group do not interfere with each other, and a receiver may hold
 * multiple simultaneous locks on same-group frames (e.g. an AP receiving a
 * triggered UL MU transmission, or the simultaneous BAs after a DL MU PPDU).
 *
 * v3 (AMP backscatter): a PPDU may radiate two powers over its own length, some links are
 * measured under the free-space law instead of the link table, and a reader may hear — inside
 * the PPDU it is itself transmitting, and only there — a tag reflecting that PPDU back at it.
 */
import type { FrameDesc } from '../model/frames'
import type { EmitFn } from '../model/records'
import type { Wall } from '../model/scenario'
import type { Ns, Vec3 } from '../model/types'
import { EventQueue } from './events'
import { byCodeUnit } from './hash'
import { CCA_ED_DBM, CCA_PD_DBM, PHY_MODES, noiseDbm, reqSinrDb, sinrThreshDb } from './phy'
import { wallLossDb } from './propagation'
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
  ampBitsNs,
  ampUlSensDbm,
  type AmpUlKbps,
} from './amp'
import {
  AMP_BS_ACTIVATION_DBM,
  AMP_BS_DL_KBPS,
  AMP_BS_DL_SYNC_NS,
  AMP_BS_LOSS_DB,
  AMP_BS_REQ_SNR_DB,
  AMP_BS_UL_CHIP_NS,
  AMP_BS_UL_SYNC_CHIPS,
  FREQ_24G_MHZ,
  ampRfidBytes,
  bsPathLossDb,
  monoLeakDbm,
  readerFloorDbm,
  type AmpBsUlKbps,
} from './ampBs'

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

/**
 * Where the nodes of this link stand, for the links that do not obey the Wi-Fi law.
 *
 * A backscatter round is a tens-of-centimetres affair, and below a metre the engine's indoor
 * log-distance law extrapolates to *less* than free-space loss. So every power a tag or a
 * reflection is measured at goes through `bsPathLossDb` — Friis at the carrier plus the same
 * wall table — computed from the geometry rather than read out of the link table. Absent when
 * the link has no backscatter radios on it, which is every link that existed before this slice.
 */
export interface BsGeometry {
  posOf: (id: string) => Vec3
  walls: Wall[]
}

/** A PPDU a node has on the air right now, and where in it we are. */
export interface InFlightTx {
  frame: FrameDesc
  startNs: Ns
  endNs: Ns
}

/**
 * Where AMP-Data ends inside a downlink RFID PPDU — the instant the command is complete, the
 * BST-Excitation starts and a tag's answer becomes due (T1 later). Measured forward from the
 * start of the PPDU so it needs no knowledge of the link's signal extension. null for every
 * frame that is not an `ampRfid`. SFD PM-38, PM-63, PM-72…PM-75
 */
export function bsDataEndNs(frame: FrameDesc): Ns | null {
  const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
  if (r === undefined) return null
  return AMP_LEGACY_PREAMBLE_NS + r.wupNs + AMP_BS_DL_SYNC_NS
    + ampBitsNs(ampRfidBytes(r.cmd) * 8, AMP_BS_DL_KBPS)
}

/**
 * The EIRP a PPDU radiates `offsetNs` into its own transmission.
 *
 * Only a downlink RFID PPDU has one: it charges the tags at `chargeDbm` through its preamble,
 * its WUP-Excitation and the command, then drops to `bsDbm` for the BST-Excitation it expects
 * to hear a reflection inside — and stays there through the signal extension that trails it
 * (model). Every other PPDU radiates its node's one EIRP throughout and does not carry it, so
 * this returns null and the caller uses what it already knows.
 */
export function txDbmAt(frame: FrameDesc, offsetNs: Ns): number | null {
  const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
  if (r === undefined) return null
  return offsetNs < bsDataEndNs(frame)! ? r.chargeDbm : r.bsDbm
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
  /**
   * 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' (Active Tx)
   * decodes only DL AMP PPDUs; 'bsTag' (backscatter) decodes only DL RFID PPDUs, under the
   * backscatter law, and has no transmitter of its own at all.
   */
  kind: 'wifi' | 'tag' | 'bsTag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (a backscatter tag: to be powered at all). */
  floorDbm: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca: boolean
}

export interface RadioOpts {
  /** 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' decodes only
   * DL AMP PPDUs; 'bsTag' only DL RFID PPDUs, under the backscatter law. */
  kind?: 'wifi' | 'tag' | 'bsTag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable?: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (default AMP_TAG_DL_SENS_DBM, or, for a
   * backscatter tag, the AMP_BS_ACTIVATION_DBM it needs to be powered at all). */
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
  // A backscatter DL PPDU syncs on 8 chips after its WUP-Excitation, not on the Active Tx tier's
  // 40; a reply on [S, S, S] rather than 48 chips. Same arithmetic, different fields.
  if (frame.kind === 'ampRfid') {
    return AMP_LEGACY_PREAMBLE_NS + frame.amp!.rfid!.wupNs + AMP_BS_DL_SYNC_NS
  }
  if (frame.kind === 'ampBsReply') {
    return AMP_BS_UL_SYNC_CHIPS * AMP_BS_UL_CHIP_NS[frame.amp!.kbps as AmpBsUlKbps]
  }
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

/**
 * How far above the noise a preamble has to stand to be acquired at all.
 *
 * A Wi-Fi receiver is hunting for a preamble it had no warning of, hence ns-3's 4 dB. A
 * mono-static reader is not hunting: it opened the excitation itself and knows to the
 * microsecond when the reflection is due, so acquiring one is not gated any harder than
 * decoding it — which is what keeps the channel's reach exactly the `monoReachM` the lesson
 * quotes (3 dB at 250 kb/s), instead of quietly pulling it in to the 4 dB of a blind search.
 */
const detectThreshDb = (frame: FrameDesc): number =>
  frame.kind === 'ampBsReply'
    ? AMP_BS_REQ_SNR_DB[frame.amp!.kbps as AmpBsUlKbps]
    : PREAMBLE_DETECT_SINR_DB

/** Decode SINR threshold for a frame as seen by receiver rid. */
function decodeThreshDb(frame: FrameDesc, rid: string, r: RadioState): number {
  if (frame.kind === 'ampBsReply') return AMP_BS_REQ_SNR_DB[frame.amp!.kbps as AmpBsUlKbps]
  if (frame.amp?.dir === 'ul') return AMP_UL_REQ_SINR_DB[frame.amp.kbps as AmpUlKbps]
  if (frame.amp?.dir === 'dl') return r.kind !== 'wifi' ? AMP_DL_REQ_SINR_DB : sinrThreshDb(6)
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
  /** Memoised free-space losses between node pairs; nodes do not move during a run. */
  private bsLoss = new Map<string, number>()

  constructor(
    private q: EventQueue,
    private now: () => Ns,
    private linkTable: Map<string, Map<string, number>>,
    private emit: EmitFn,
    private spectrum?: ChannelSpectrum,
    private bsGeometry?: BsGeometry,
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
    const kind = opts.kind ?? 'wifi'
    this.radios.set(nodeId, {
      listener, ccaBusy: false, locks: [], transmitting: false, observed: new Set(), misses: [],
      kind, ampCapable: opts.ampCapable ?? false,
      floorDbm: opts.floorDbm ?? (kind === 'bsTag' ? AMP_BS_ACTIVATION_DBM : AMP_TAG_DL_SENS_DBM),
      cca: opts.cca ?? true,
    })
  }

  isCcaBusy(nodeId: string): boolean {
    return this.radios.get(nodeId)!.ccaBusy
  }

  isTransmitting(nodeId: string): boolean {
    return this.radios.get(nodeId)!.transmitting
  }

  /** The PPDU `nodeId` has on the air at this instant, with the instant it started, or null. */
  currentTx(nodeId: string): InFlightTx | null {
    const tx = this.active.find((a) => a.txId === nodeId)
    return tx === undefined
      ? null
      : { frame: tx.frame, startNs: tx.endNs - tx.frame.txTimeNs, endNs: tx.endNs }
  }

  /**
   * Is `nodeId` holding a BST-Excitation on the air at `t`? — the window in which a mono-static
   * reader can hear a reflection at all, which is also the window a tag may answer in. The MAC
   * asks the medium rather than telling it: only the medium knows what is actually radiating.
   */
  bstOpenAt(nodeId: string, t: Ns): boolean {
    const tx = this.currentTx(nodeId)
    if (tx === null) return false
    const dataEnd = bsDataEndNs(tx.frame)
    if (dataEnd === null) return false
    const offsetNs = t - tx.startNs
    return offsetNs >= dataEnd && offsetNs < dataEnd + tx.frame.amp!.rfid!.bstNs
  }

  /** What a transmission of `txDbm` at `txId` delivers at `rxId` under the backscatter law:
   * what a tag is powered by, and what a reflection of it arrives at. */
  bsRxDbm(txId: string, rxId: string, txDbm: number): number {
    return txDbm - this.bsLossDb(txId, rxId)
  }

  private linkDbm(txId: string, rxId: string): number {
    const v = this.linkTable.get(txId)?.get(rxId)
    return v === undefined ? -200 : v
  }

  /** Free space at 2.44 GHz between two nodes of this link, plus the walls in the way. */
  private bsLossDb(txId: string, rxId: string): number {
    const key = `${txId}>${rxId}`
    const hit = this.bsLoss.get(key)
    if (hit !== undefined) return hit
    const g = this.bsGeometry
    if (g === undefined) throw new Error(`channel: ${key} needs backscatter geometry`)
    const a = g.posOf(txId)
    const b = g.posOf(rxId)
    const dM = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const lossDb = bsPathLossDb(FREQ_24G_MHZ, dM, wallLossDb(a, b, g.walls))
    this.bsLoss.set(key, lossDb)
    return lossDb
  }

  /**
   * What a PPDU on the air delivers at `rxId`.
   *
   * The link table answers for everything that obeys the Wi-Fi law, which is everything that
   * existed before this slice. Two things do not: what a downlink RFID PPDU delivers at a
   * backscatter tag (Friis, at the charge power the PPDU itself carries), and a backscattered
   * reply, which has no transmitter — it is the excitation that reached the tag, `AMP_BS_LOSS_DB`
   * down for the modulation, travelling the same path back.
   */
  private rxDbmOf(tx: ActiveTx, rxId: string): number {
    const frame = tx.frame
    if (frame.kind === 'ampBsReply') {
      const incidentDbm = frame.amp?.bs?.incidentDbm
      // Nothing radiating on it, nothing reflected off it.
      if (incidentDbm === undefined) return -200
      return incidentDbm - AMP_BS_LOSS_DB - this.bsLossDb(tx.txId, rxId)
    }
    if (frame.kind === 'ampRfid' && this.radios.get(rxId)?.kind === 'bsTag') {
      return txDbmAt(frame, 0)! - this.bsLossDb(tx.txId, rxId)
    }
    return this.linkDbm(tx.txId, rxId)
  }

  /**
   * What a mono-static reader hears a reflection against: the excitation it is radiating at this
   * instant, leaking `AMP_BS_ISOLATION_DB` into its own receiver and sitting
   * `AMP_BS_READER_DR_DB` below that after digital leakage removal.
   *
   * This is the lesson in one expression — the floor rises with the excitation, so turning the
   * reader up buys no reach. With no excitation of its own on the air the reader is back to
   * thermal noise (nothing in this slice does that; a bistatic reader will).
   */
  private bsFloorDbm(rid: string, frame: FrameDesc): number {
    const tx = this.currentTx(rid)
    const excitationDbm = tx === null ? null : txDbmAt(tx.frame, this.now() - tx.startNs)
    return excitationDbm === null
      ? noiseDbm(ampNoiseBwMhz(frame))
      : readerFloorDbm(monoLeakDbm(excitationDbm))
  }

  /** The noise a reception stands against: thermal in the PPDU's bandwidth, except at a reader
   * listening for a reflection, where its own leakage is tens of dB above thermal and is the floor. */
  private noiseFloorMw(rid: string, frame: FrameDesc): number {
    return frame.kind === 'ampBsReply'
      ? mw(this.bsFloorDbm(rid, frame))
      : mw(noiseDbm(ampNoiseBwMhz(frame)))
  }

  /** Lowest RSSI at which this radio can acquire this PPDU, or null when it cannot see it as a PPDU at all. */
  private detectFloorDbm(rid: string, r: RadioState, frame: FrameDesc): number | null {
    // A backscatter tag has an envelope detector and no oscillator: the reader's commands are
    // the only thing it can see, and it must be powered by them to see them at all.
    if (r.kind === 'bsTag') return frame.kind === 'ampRfid' ? r.floorDbm : null
    if (frame.kind === 'ampBsReply') return r.ampCapable ? this.bsFloorDbm(rid, frame) : null
    if (frame.amp?.dir === 'ul') return r.ampCapable ? ampUlSensDbm(frame.amp.kbps as AmpUlKbps) : null
    if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM
    return r.kind === 'tag' ? null : CCA_PD_DBM
  }

  /**
   * Can this radio hear anything at all right now? Half-duplex says no while it transmits — with
   * one exception, the mono-static reader. A backscattered reply *is* the reader's own excitation
   * coming back off a tag, so it arrives inside the PPDU the reader is still transmitting, and
   * only inside that PPDU's BST-Excitation.
   */
  private listening(t: Ns, rid: string, r: RadioState, frame: FrameDesc): boolean {
    if (!r.transmitting) return true
    return frame.kind === 'ampBsReply' && r.ampCapable && this.bstOpenAt(rid, t)
  }

  startTx(nodeId: string, frame: FrameDesc): void {
    const t = this.now()
    const me = this.radios.get(nodeId)!
    if (me.transmitting) throw new Error(`${nodeId} startTx while transmitting`)
    me.transmitting = true
    this.fillIncidentDbm(t, nodeId, frame)

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
    const dataEndNs = bsDataEndNs(frame)
    if (dataEndNs !== null) this.q.schedule(t + dataEndNs, () => this.endAmpData(tx), 1)
    this.q.schedule(tx.endNs, () => this.endTx(tx), 1)
  }

  /**
   * A backscattered reply carries no power of its own: what it puts on the air is the reader's
   * excitation as it reaches the tag, reflected. The tag cannot know that better than the medium
   * does, so unless the reply already states its incident power the channel reads it off the
   * reader's PPDU in flight and writes it onto the frame — where the reader, the records and the
   * frame detail all read it back out.
   */
  private fillIncidentDbm(t: Ns, nodeId: string, frame: FrameDesc): void {
    const bs = frame.kind === 'ampBsReply' ? frame.amp?.bs : undefined
    if (bs === undefined || bs.incidentDbm !== undefined) return
    const reader = this.currentTx(frame.dst)
    const excitationDbm = reader === null ? null : txDbmAt(reader.frame, t - reader.startNs)
    if (excitationDbm !== null) bs.incidentDbm = this.bsRxDbm(frame.dst, nodeId, excitationDbm)
  }

  private applyPendingStarts(t: Ns): void {
    const starts = this.pendingStarts
    this.pendingStarts = []
    for (const [rid, r] of this.radios) {
      const arrivals = starts
        .filter((tx) => tx.txId !== rid)
        .map((tx) => ({ tx, p: this.rxDbmOf(tx, rid) }))
        .sort((x, y) => y.p - x.p || byCodeUnit(x.tx.txId, y.tx.txId))
      for (const { tx, p } of arrivals) {
        if (!r.transmitting) r.observed.add(tx.txId)
        this.applyOneTx(t, rid, r, tx, p)
      }
    }
    this.updateAllCca(t)
  }

  private applyOneTx(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const floor = this.detectFloorDbm(rid, r, tx.frame)
    const listening = this.listening(t, rid, r, tx.frame)
    const canCoexist = r.locks.every((l) => sameGroup(l.frame, tx.frame))
    if (r.locks.length > 0 && !canCoexist) {
      if (listening && floor !== null && p >= floor && this.canCapture(t, r, p)) {
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
    } else if (listening && floor !== null && p >= floor) {
      // Preamble detection needs `detectThreshDb` against everything else on
      // the air; a preamble buried in interference is never detected — no
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
      this.resolveLock(t, rid, r, tx.txId)
    }
    this.updateAllCca(t)
  }

  /**
   * The end of AMP-Data in a downlink RFID PPDU, where a backscatter tag's reception ends: what
   * follows is carrier, not information, and the tag has to reflect its answer T1 into that same
   * carrier. Resolving the tag's lock here is what lets one PPDU be both the question and the
   * power to answer it — and it is why the tag's own transmission never cuts a reception short.
   * Wi-Fi radios decode the L-SIG and defer for the whole length, so theirs resolve at the end.
   */
  private endAmpData(tx: ActiveTx): void {
    if (!this.active.includes(tx)) return
    const t = this.now()
    // Nothing started or ended on the air, so no radio's carrier sense can have changed.
    for (const [rid, r] of this.radios) {
      if (r.kind === 'bsTag') this.resolveLock(t, rid, r, tx.txId)
    }
  }

  /** Decode a reception against the worst SINR it saw, or fail it. */
  private resolveLock(t: Ns, rid: string, r: RadioState, from: string): void {
    const lockIdx = r.locks.findIndex((l) => l.from === from)
    if (lockIdx < 0) return
    const lock = r.locks[lockIdx]
    r.locks.splice(lockIdx, 1)
    const sinrDb = lock.rxDbm - dbm(lock.maxInterfMw)
    if (sinrDb >= decodeThreshDb(lock.frame, rid, r)) {
      this.emit({ t, type: 'RX_OK', node: rid, from, frame: lock.frame })
      r.listener.onRxOk(t, lock.frame, from)
    } else {
      const reason = lock.overlapped ? 'collision' : 'lowSinr'
      this.emit({ t, type: 'RX_FAIL', node: rid, from, reason })
      if (reason === 'collision') this.emitCollision(t, from, lock.contributors)
      r.listener.onRxCorrupt(t)
    }
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
   * Preamble detection: a PPDU at or above its receiver's floor is acquired
   * only if its SINR against everything else on the air clears
   * `detectThreshDb` — 4 dB for a blind Wi-Fi search; otherwise it is recorded
   * as missed — no reception, so no EIFS.
   */
  private detectOrMiss(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
    const others = this.othersMw(rid, tx)
    const sinr = p - dbm(this.noiseFloorMw(rid, tx.frame) + others.mw)
    if (sinr >= detectThreshDb(tx.frame)) {
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
      const p = this.rxDbmOf(a, rid)
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
    // thermal noise in the width of the PPDU being received — or, for a reflection, the
    // reader's own leakage, which sits far above it
    let sum = this.noiseFloorMw(rid, lock.frame)
    for (const a of this.active) {
      if (a.txId === rid || a.txId === lock.from) continue
      if (sameGroup(a.frame, lock.frame)) continue
      sum += mw(this.rxDbmOf(a, rid))
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
          this.rxDbmOf(a, rid) >= OVERLAP_MIN_DBM,
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
          const p = this.rxDbmOf(a, rid)
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
