/**
 * Wi-Fi MAC per IEEE Std 802.11-2024, feature-configurable per node:
 *  - DCF (§10.3): CS + NAV, DIFS/EIFS, binary-exponential backoff,
 *    freeze/resume, post-TX backoff, SRC/LRC + SSRC/SLRC, ACK, RTS/CTS.
 *  - EDCA (§10.23): four EDCAFs with AIFS/CWmin/CWmax per Table 9-194,
 *    internal-collision arbitration (higher AC wins, losers double CW).
 *  - TXOP bursting: SIFS-separated exchanges until the AC's TXOP limit.
 *  - A-MPDU + BlockAck: aggregated PPDUs acknowledged by a single BA.
 *  - OFDMA (HE/EHT): AP-scheduled DL MU PPDUs with simultaneous BAs and
 *    Trigger-based UL MU with Multi-STA BlockAck (RU model: 1/n rate scaling,
 *    orthogonal groups on the channel).
 * Legacy nodes run a single pseudo-EDCAF with DIFS parameters (exact v1 DCF).
 */
import type { FrameDesc, MuPart } from '../model/frames'
import { ampduPsduBytes, dataPsduBytes } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { TamperCfg } from '../model/scenario'
import type { Ns } from '../model/types'
import type { TxopProtection } from '../model/scenario'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import {
  ACK_BYTES, ACK_TIMEOUT_NS, BA_BYTES, CF_END_BYTES, CTS_BYTES, CTS_TIMEOUT_NS, DCF_PARAMS, DIFS_NS,
  EDCA_PARAMS, EIFS_NS, LONG_RETRY_LIMIT, MAX_AMPDU_MPDUS, MAX_PPDU_NS, PHY_MODES,
  QOS_HDR_BYTES, FCS_BYTES, RTS_BYTES, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
  aifsNs, ctrlRespRateFor, mcsRateMbps, multiStaBaBytes, triggerBytes, toneRatio, txTimeModeNs, txTimeNs,
  type AcParams, type PhyMode,
} from './phy'
import { Rng } from './rng'
import { AcQueues } from './queues'
import type { Msdu } from './traffic'

export interface MacHooks {
  onMsduDelivered?(msduId: number, at: Ns): void
  onDequeue?(msduId: number): void
}

export interface WifiMacCfg {
  rtsThresholdBytes: number
  /** Node runs 4 EDCAFs (QoS) instead of the single DCF function. */
  edca: boolean
  txop: boolean
  isAp: boolean
  modeForPeer(peer: string): PhyMode
  mcsForPeer(peer: string): number
  /** Negotiated operating width with this peer, in MHz. */
  widthForPeer(peer: string): number
  /** Negotiated spatial streams with this peer. */
  nssForPeer(peer: string): number
  ampduWith(peer: string): boolean
  ofdmaWith(peer: string): boolean
  /** Can this peer be a member of a MU-MIMO group? */
  mumimoWith(peer: string): boolean
  /** This AP's own spatial stream count (for fitting MU-MIMO group streams). */
  ownNss(): number
  /** AP only: stand-in for BSR — UL backlog of OFDMA-capable STAs. */
  ulBacklog?(): { peer: string; ac: number; bytes: number }[]
  /**
   * Is this peer on the link this MAC serves? MLO devices share one MLD queue
   * between links, but a frame may only leave on a link its receiver is on.
   * Absent = every peer is reachable (single-link device).
   */
  reachable?(peer: string): boolean
  /** Report an attempt's outcome so rate adaptation can react. */
  onTxOutcome?(peer: string, ok: boolean): void
  /** Burst protection policy when holding a TXOP (see TxopProtection). Default 'single'. */
  txopProtection?: TxopProtection
  /** A tampered driver: deviations from the broadcast EDCA parameters (see TamperCfg). */
  tamper?: TamperCfg
}

/** The parameter set a (possibly tampered) station actually contends with. */
export function effectiveParams(base: AcParams[], t: TamperCfg | undefined): AcParams[] {
  if (!t) return base
  return base.map((p) => {
    const cwMin = t.cwMin ?? p.cwMin
    const cwMax = t.noDoubling ? cwMin : Math.max(cwMin, t.cwMax ?? p.cwMax)
    return {
      ...p,
      aifsn: t.aifsn ?? p.aifsn,
      cwMin, cwMax,
      txopLimitNs: t.txopLimitUs !== undefined ? t.txopLimitUs * 1000 : p.txopLimitNs,
    }
  })
}

const NEVER = -10_000_000

interface Edcaf {
  params: AcParams
  cw: number
  backoff: number | null
  needDraw: boolean
  src: number
  lrc: number
  seqCounter: number
  ifsHandle: number
  tickHandle: number
}

interface Awaiting {
  kind: 'ack' | 'cts' | 'ba'
  ac: number
  peer: string
  msdus: Msdu[]
  wasRts: boolean
  aggBytes: number
}

interface MuDlState {
  kind: 'dl'
  gid: string
  ac: number
  parts: { peer: string; msdus: Msdu[] }[]
  successes: Set<string>
  resolveHandle: number
}

interface MuUlState {
  kind: 'ul'
  gid: string
  ac: number
  users: string[]
  received: Map<string, FrameDesc>
  mbaHandle: number
  /** §10.3.2.9 response timeout: fires if no triggered PPDU has started by trigger end + 45 µs. */
  rxTimeoutHandle: number
}

interface StaMuAwait {
  ac: number
  msdus: Msdu[]
  timeoutHandle: number
}

/** Max PSDU bytes that fit a target duration at mode/mcs/RU fraction. */
export function maxPsduBytesFor(
  mode: PhyMode, mcs: number, ruFraction: number, durNs: Ns, widthMhz = 20, nss = 1,
): number {
  const m = PHY_MODES[mode]
  const nsym = Math.floor((durNs - m.preambleNs) / m.symNs)
  const bits = nsym * m.ndbps[mcs] * toneRatio(mode, widthMhz) * nss * ruFraction
  return Math.max(0, Math.floor((bits - 22) / 8))
}

export class WifiMac implements PhyListener {
  private state: MacStateName = 'idle'
  readonly queues: AcQueues
  private edcafs: Edcaf[]
  private ssrc = 0
  private slrc = 0
  private navUntil: Ns = 0
  private navClearHandle = 0
  private navFromRtsAt: Ns | null = null
  private lastBusyEndNs: Ns = NEVER
  private corruptLast = false
  private awaiting: Awaiting | null = null
  private timeoutHandle = 0
  private respHandle = 0
  private pendingResp: FrameDesc | null = null
  private lastRxStartNs: Ns = NEVER
  private delivered = new Set<number>()
  private deliveredOrder: number[] = []
  private txopEndNs: Ns = 0
  private txopAc = -1
  private readyAcs = new Set<number>()
  private arbitratePending = false
  private muState: MuDlState | MuUlState | null = null
  /**
   * End of the reservation a boundary RTS/CTS announced for the current burst
   * (absolute time), 0 when the burst is not protected this way. A burst that
   * ends before it is truncated with CF-End (§10.23.2.9).
   */
  private announcedEndNs: Ns = 0
  private staMuAwait: StaMuAwait | null = null
  private wantTrigger = false
  private muGidCounter = 0

  constructor(
    private nodeId: string,
    private q: EventQueue,
    private now: () => Ns,
    private ch: Channel,
    private rng: Rng,
    private emit: EmitFn,
    private cfg: WifiMacCfg,
    private hooks: MacHooks = {},
    sharedQueues?: AcQueues,
  ) {
    this.queues = sharedQueues ?? new AcQueues()
    this.edcafs = effectiveParams(cfg.edca ? EDCA_PARAMS : [DCF_PARAMS], cfg.tamper).map((params) => ({
      params, cw: params.cwMin, backoff: null, needDraw: false,
      src: 0, lrc: 0, seqCounter: 0, ifsHandle: 0, tickHandle: 0,
    }))
  }

  get queueDepth(): number {
    return this.queues.depthAll()
  }

  /** AC → EDCAF index (legacy has one EDCAF for everything). */
  private efIndex(ac: number): number {
    return this.cfg.edca ? Math.max(0, Math.min(3, ac)) : 0
  }

  enqueue(msdu: Msdu, ac = 1): void {
    const ei = this.efIndex(ac)
    this.queues.enqueue(ei, msdu)
    this.emit({
      t: this.now(), type: 'ENQUEUE', node: this.nodeId, msduId: msdu.id, bytes: msdu.bytes,
      dst: msdu.dst, depth: this.queues.depth(ei), ac: this.cfg.edca ? ei : undefined,
      server: msdu.server, rttFromNs: msdu.rttFromNs, relayFromNs: msdu.relayFromNs,
    })
    this.startAccessAc(this.edcafs[ei])
  }

  /** MLO: sibling-link wake-up when the shared MLD queue gains work. */
  pokeAccess(): void {
    if (!this.inExchange()) this.resumeAll()
  }

  /** AP: poke access when OFDMA STAs report UL backlog (BSR stand-in). */
  notifyUlBacklog(): void {
    if (!this.cfg.isAp || !this.cfg.ulBacklog) return
    this.wantTrigger = true
    this.startAccessAc(this.edcafs[this.efIndex(1)])
  }

  // ---------- access procedure (per EDCAF) ----------

  private mediumBusy(): boolean {
    return this.ch.isCcaBusy(this.nodeId) || this.now() < this.navUntil
  }

  private inExchange(): boolean {
    return this.awaiting !== null || this.muState !== null || this.staMuAwait !== null ||
      this.pendingResp !== null || this.respHandle !== 0 || this.ch.isTransmitting(this.nodeId)
  }

  /** Destination filter for the shared queue: only peers on this MAC's link. */
  private readonly reach = (dst: string): boolean => this.cfg.reachable?.(dst) ?? true

  private hasWork(e: Edcaf): boolean {
    const idx = this.edcafs.indexOf(e)
    return this.queues.depthFor(idx, this.reach) > 0 || e.needDraw || e.backoff !== null ||
      (this.wantTrigger && idx === this.efIndex(1))
  }

  private startAccessAc(e: Edcaf): void {
    if (this.inExchange()) return
    if (!this.hasWork(e)) return
    if (e.ifsHandle || e.tickHandle) return // already contending
    if (this.mediumBusy()) {
      e.needDraw = true
      this.refreshState()
      return
    }
    this.beginIfsAc(e)
  }

  private acTag(e: Edcaf): number | undefined {
    return this.cfg.edca ? e.params.ac : undefined
  }

  private beginIfsAc(e: Edcaf): void {
    const t = this.now()
    const aifs = this.cfg.edca ? aifsNs(e.params.aifsn) : DIFS_NS
    // §10.23.2.2: after a corrupted frame, EIFS − DIFS + AIFS[AC]
    const dur = this.corruptLast ? EIFS_NS - DIFS_NS + aifs : aifs
    const kind = this.corruptLast ? 'EIFS' : this.cfg.edca ? 'AIFS' : 'DIFS'
    // Idle time already elapsed counts toward the IFS. lastBusyEndNs starts at
    // NEVER, so a node that has never heard the medium busy gets a zero-length
    // first IFS and transmits immediately — intended: "idle since forever"
    // satisfies the idle-≥-IFS condition (this is why lesson traces start at t=0).
    const end = Math.max(t, this.lastBusyEndNs + dur)
    this.emit({ t, type: 'IFS_START', node: this.nodeId, kind, untilNs: end, ac: this.acTag(e) })
    this.cancelEf(e, 'ifs')
    e.ifsHandle = this.q.schedule(end, () => {
      e.ifsHandle = 0
      this.onIfsEndAc(e)
    })
    this.refreshState()
  }

  private onIfsEndAc(e: Edcaf): void {
    const t = this.now()
    this.emit({ t, type: 'IFS_END', node: this.nodeId, ac: this.acTag(e) })
    if (e.backoff === null) {
      if (!e.needDraw) {
        // §10.3.4.2 basic access: medium idle ≥ IFS with no deferral → transmit.
        this.markReady(e)
        return
      }
      e.backoff = this.rng.int(e.cw)
      this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: e.backoff, cw: e.cw, ac: this.acTag(e) })
    } else {
      this.emit({ t, type: 'BACKOFF_RESUME', node: this.nodeId, value: e.backoff, ac: this.acTag(e) })
    }
    if (e.backoff === 0) this.markReady(e)
    else this.scheduleTick(e)
  }

  private scheduleTick(e: Edcaf): void {
    this.cancelEf(e, 'tick')
    e.tickHandle = this.q.schedule(this.now() + SLOT_NS, () => {
      e.tickHandle = 0
      this.onSlotTick(e)
    })
    this.refreshState()
  }

  private onSlotTick(e: Edcaf): void {
    e.backoff = e.backoff! - 1
    this.emit({ t: this.now(), type: 'BACKOFF_DEC', node: this.nodeId, value: e.backoff, ac: this.acTag(e) })
    if (e.backoff === 0) this.markReady(e)
    else this.scheduleTick(e)
  }

  /** EDCAF reached backoff 0 — arbitrate internal collisions at this instant. */
  private markReady(e: Edcaf): void {
    this.readyAcs.add(this.edcafs.indexOf(e))
    if (!this.arbitratePending) {
      this.arbitratePending = true
      this.q.schedule(this.now(), () => this.arbitrate())
    }
  }

  /** Something for this EDCAF to start a TXOP with: a queued MSDU, or (AP) a wanted Trigger. */
  private hasFrame(idx: number): boolean {
    return this.queues.depthFor(idx, this.reach) > 0 || (this.wantTrigger && idx === this.efIndex(1))
  }

  private arbitrate(): void {
    this.arbitratePending = false
    const ready = [...this.readyAcs].sort((a, b) => b - a) // highest AC first
    this.readyAcs.clear()
    if (!ready.length || this.inExchange()) return
    const t = this.now()
    // §10.23.2.4: an EDCAF whose post-backoff ended with nothing to send starts
    // no TXOP — it neither wins nor loses an internal collision.
    const contending = ready.filter((i) => this.hasFrame(i))
    for (const i of ready) {
      if (contending.includes(i)) continue
      this.edcafs[i].backoff = null
      this.edcafs[i].needDraw = false
    }
    if (!contending.length) {
      this.endTxop()
      this.refreshState()
      this.resumeAll()
      return
    }
    const winner = this.edcafs[contending[0]]
    for (const i of contending.slice(1)) {
      // Internal collision (§10.23.2.2): behave as an external collision,
      // retry counters unchanged.
      const loser = this.edcafs[i]
      this.emit({ t, type: 'INTERNAL_COLLISION', node: this.nodeId, winnerAc: winner.params.ac, loserAc: loser.params.ac })
      loser.cw = Math.min(2 * loser.cw + 1, loser.params.cwMax)
      this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: loser.cw, ac: this.acTag(loser) })
      loser.backoff = this.rng.int(loser.cw)
      this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: loser.backoff, cw: loser.cw, ac: this.acTag(loser) })
      // A redraw of 0 is ready at the next slot boundary after the winner's
      // exchange (the resume path marks it ready); ticking it would go negative.
      if (loser.backoff > 0) this.scheduleTick(loser)
    }
    winner.backoff = null
    winner.needDraw = false
    this.transmitFor(winner, false)
  }

  // ---------- transmission paths ----------

  private transmitFor(e: Edcaf, inTxopBurst: boolean): void {
    const ei = this.edcafs.indexOf(e)
    const t = this.now()

    // AP OFDMA: DL MU when ≥2 eligible peers queued; UL Trigger when wanted.
    if (this.cfg.isAp) {
      const muDsts = this.queues.dsts(ei, this.reach).filter((d) => this.cfg.ofdmaWith(d))
      if (muDsts.length >= 2) {
        this.transmitDlMu(e, muDsts.slice(0, 4), inTxopBurst)
        return
      }
      if (this.queues.depthFor(ei, this.reach) === 0 && this.wantTrigger && this.cfg.ulBacklog) {
        const users = this.cfg.ulBacklog().filter((u) => this.cfg.ofdmaWith(u.peer))
        if (users.length >= 2) {
          this.transmitTrigger(e, users.slice(0, 4))
          return
        }
        this.wantTrigger = false
      }
    }

    const head = this.queues.head(ei, this.reach)
    if (!head) {
      // Post-transmission backoff completed with nothing queued.
      this.endTxop()
      this.refreshState()
      this.resumeAll()
      return
    }

    const peer = head.dst
    const mode = this.cfg.modeForPeer(peer)
    const mcs = this.cfg.mcsForPeer(peer)
    const width = this.cfg.widthForPeer(peer)
    const nss = this.cfg.nssForPeer(peer)
    const mbps = mcsRateMbps(mode, mcs)
    const useAmpdu = this.cfg.ampduWith(peer) && mode !== 'nonht'
    // A PPDU (+SIFS+BA) must fit inside the TXOP (§10.23.2.8).
    const txopCap = inTxopBurst && this.txopEndNs > 0
      ? Math.max(200_000, this.txopEndNs - t - SIFS_NS - 60_000)
      : this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0
        ? Math.max(200_000, e.params.txopLimitNs - SIFS_NS - 60_000)
        : MAX_PPDU_NS
    const budgetNs = Math.min(MAX_PPDU_NS, txopCap)
    const msdus = this.queues.claim(ei, peer, useAmpdu ? MAX_AMPDU_MPDUS : 1, (m, claimed) => {
      const trial = ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes])
      return txTimeModeNs(mode, trial, mcs, { widthMhz: width, nss }) <= budgetNs
    })
    if (!msdus.length) {
      this.endTxop()
      this.refreshState()
      return
    }

    const aggregate = useAmpdu && msdus.length > 1
    const psdu = aggregate
      ? ampduPsduBytes(msdus.map((m) => m.bytes))
      : this.cfg.edca
        ? QOS_HDR_BYTES + msdus[0].bytes + FCS_BYTES
        : dataPsduBytes(msdus[0].bytes)
    const respTime = txTimeNs(aggregate ? BA_BYTES : ACK_BYTES, ctrlRespRateFor(mbps))

    const prot = this.cfg.txopProtection ?? 'single'
    const txopCapable = this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0
    // Boundary / multiple protection: when the queue holds a multi-exchange
    // burst, open the TXOP with an RTS/CTS whose Duration reaches the end of
    // the TXOP (§9.2.5.2, "time remaining in the TXOP"); a burst that finishes
    // early gives the rest back with CF-End (§10.23.2.9).
    const dataTime = txTimeModeNs(mode, psdu, mcs, { widthMhz: width, nss })
    const rtsRate = ctrlRespRateFor(mbps)
    const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(rtsRate))
    const rtsTime = txTimeNs(RTS_BYTES, rtsRate)
    let burstRestNs = 0
    if (!inTxopBurst && prot !== 'single' && txopCapable) {
      const txopEnd = t + e.params.txopLimitNs
      const firstEnd = t + rtsTime + 3 * SIFS_NS + ctsTime + dataTime + respTime
      burstRestNs = this.planBurstNs(ei, firstEnd, txopEnd)
    }
    const protectBurst = burstRestNs > 0

    if ((psdu > this.cfg.rtsThresholdBytes || protectBurst) && !inTxopBurst) {
      // RTS/CTS protection first (§10.3.2.9).
      const announcedEnd = protectBurst ? t + e.params.txopLimitNs : 0
      const rts: FrameDesc = {
        kind: 'rts', src: this.nodeId, dst: peer, bytes: RTS_BYTES, mbps: rtsRate,
        durationFieldNs: this.inflate(protectBurst ? announcedEnd - (t + rtsTime) : 3 * SIFS_NS + ctsTime + dataTime + respTime),
        txTimeNs: rtsTime, ac: this.acTag(e),
      }
      this.awaiting = { kind: 'cts', ac: ei, peer, msdus, wasRts: true, aggBytes: psdu }
      this.beginTxop(e, t)
      this.announcedEndNs = announcedEnd
      this.transmitFrame(rts, true)
      return
    }

    const frame = this.buildDataFrame(e, peer, msdus, psdu, mode, mcs, mbps, aggregate, respTime, width, nss)
    this.awaiting = { kind: aggregate ? 'ba' : 'ack', ac: ei, peer, msdus, wasRts: false, aggBytes: psdu }
    if (!inTxopBurst) this.beginTxop(e, t)
    this.transmitFrame(frame, true)
  }

  /**
   * How long the exchanges after the first one will take if this TXOP chains
   * everything now queued for this AC (reachable peers, consecutive frames to
   * one peer aggregated), stopping at the TXOP limit exactly like
   * continueOrRelease will. Returns 0 when nothing more would be chained.
   */
  private planBurstNs(ei: number, fromNs: Ns, txopEndNs: Ns): Ns {
    const e = this.edcafs[ei]
    const queue = this.queues.peek(ei).filter((m) => this.reach(m.dst))
    let t = fromNs
    let i = 0
    while (i < queue.length) {
      const peer = queue[i].dst
      const mode = this.cfg.modeForPeer(peer)
      const mcs = this.cfg.mcsForPeer(peer)
      const width = this.cfg.widthForPeer(peer)
      const nss = this.cfg.nssForPeer(peer)
      // continueOrRelease's fit check: one plain frame + its BA must fit
      const oneFrame = txTimeModeNs(mode, dataPsduBytes(queue[i].bytes), mcs, { widthMhz: width, nss })
      if (t + SIFS_NS + oneFrame + SIFS_NS + txTimeNs(BA_BYTES, 24) > txopEndNs) break
      const useAmpdu = this.cfg.ampduWith(peer) && mode !== 'nonht'
      const budgetNs = Math.min(MAX_PPDU_NS, Math.max(200_000, txopEndNs - (t + SIFS_NS) - SIFS_NS - 60_000))
      const bytes: number[] = []
      let j = i
      while (j < queue.length && queue[j].dst === peer && bytes.length < (useAmpdu ? MAX_AMPDU_MPDUS : 1)) {
        const trial = ampduPsduBytes([...bytes, queue[j].bytes])
        if (bytes.length > 0 && txTimeModeNs(mode, trial, mcs, { widthMhz: width, nss }) > budgetNs) break
        bytes.push(queue[j].bytes)
        j++
      }
      const aggregate = useAmpdu && bytes.length > 1
      const psdu = aggregate ? ampduPsduBytes(bytes) : this.cfg.edca ? QOS_HDR_BYTES + bytes[0] + FCS_BYTES : dataPsduBytes(bytes[0])
      const mbps = mcsRateMbps(mode, mcs)
      const resp = txTimeNs(aggregate ? BA_BYTES : ACK_BYTES, ctrlRespRateFor(mbps))
      t += SIFS_NS + txTimeModeNs(mode, psdu, mcs, { widthMhz: width, nss }) + SIFS_NS + resp
      i = j
      void e
    }
    return Math.max(0, t - fromNs)
  }

  private buildDataFrame(
    e: Edcaf, peer: string, msdus: Msdu[], psdu: number,
    mode: PhyMode, mcs: number, mbps: number, aggregate: boolean, respTime: Ns,
    widthMhz: number, nss: number,
  ): FrameDesc {
    const seqNo = e.seqCounter
    e.seqCounter += msdus.length
    const txTime = txTimeModeNs(mode, psdu, mcs, { widthMhz, nss })
    // §9.2.5.2 multiple protection: the data frame carries the TXOP remainder.
    const remainder = this.announcedEndNs - (this.now() + txTime)
    const duration = this.cfg.txopProtection === 'multiple' && remainder > SIFS_NS + respTime
      ? remainder
      : SIFS_NS + respTime
    return {
      kind: 'data', src: this.nodeId, dst: peer, bytes: psdu, mbps,
      durationFieldNs: this.inflate(duration),
      txTimeNs: txTime,
      seqNo, retryFlag: e.src + e.lrc > 0, msduId: msdus[0].id,
      mode, mcs, widthMhz, ac: this.acTag(e),
      ampdu: aggregate ? { mpduCount: msdus.length, msduIds: msdus.map((m) => m.id) } : undefined,
    }
  }

  /** A NAV-inflating driver pads every Duration it announces. */
  private inflate(durationNs: Ns): Ns {
    return durationNs + (this.cfg.tamper?.navInflateUs ?? 0) * 1000
  }

  private beginTxop(e: Edcaf, t: Ns): void {
    if (this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0) {
      this.txopEndNs = t + e.params.txopLimitNs
      this.txopAc = this.edcafs.indexOf(e)
      this.emit({ t, type: 'TXOP_START', node: this.nodeId, ac: e.params.ac, untilNs: this.txopEndNs })
    }
  }

  private endTxop(): void {
    this.announcedEndNs = 0
    if (this.txopEndNs > 0) {
      this.emit({ t: this.now(), type: 'TXOP_END', node: this.nodeId })
      this.txopEndNs = 0
      this.txopAc = -1
    }
  }

  // ---------- OFDMA (AP side) ----------

  /** Sum of negotiated spatial streams a MU-MIMO group would need vs. this AP's own antenna count. */
  private fitsStreams(dsts: string[]): boolean {
    const streams = dsts.reduce((s, d) => s + this.cfg.nssForPeer(d), 0)
    return streams <= this.cfg.ownNss()
  }

  private transmitDlMu(e: Edcaf, dsts: string[], inTxopBurst: boolean): void {
    const t = this.now()
    const ei = this.edcafs.indexOf(e)
    const gid = `mu${this.nodeId}:${this.muGidCounter++}`

    // Space multiplies the rate, which pays only when there are data symbols to
    // multiply; frequency divides the preamble, which pays when there are not.
    const MUMIMO_MIN_BYTES = 1000
    const canMumimo = dsts.every((d) => this.cfg.mumimoWith(d))
      && dsts.every((d) => (this.queues.headBytes(ei, d) ?? 0) >= MUMIMO_MIN_BYTES)
    let mumimoGroup = dsts
    if (canMumimo) {
      while (mumimoGroup.length >= 2 && !this.fitsStreams(mumimoGroup)) mumimoGroup = mumimoGroup.slice(0, -1)
    }
    const useMumimo = canMumimo && mumimoGroup.length >= 2 && this.fitsStreams(mumimoGroup)

    const built = useMumimo ? this.buildMumimoParts(e, ei, mumimoGroup) : this.buildOfdmaParts(e, ei, dsts)
    const { parts, claims, ppduDur, modeAll, width } = built
    if (parts.length < 2) {
      for (const c of claims) this.queues.restore(ei, c.msdus)
      this.transmitSuFallback(e, inTxopBurst)
      return
    }
    const baTime = txTimeNs(BA_BYTES, 24)
    const frame: FrameDesc = {
      kind: 'data', src: this.nodeId, dst: '*mu', bytes: parts.reduce((s, p) => s + p.bytes, 0),
      mbps: parts[0].mbps, durationFieldNs: SIFS_NS + baTime,
      txTimeNs: ppduDur, mode: modeAll, mcs: parts[0].mcs, widthMhz: width, ac: this.acTag(e),
      muParts: parts, orthogonalGroup: gid, muKind: useMumimo ? 'mumimo' : 'ofdma',
    }
    if (!inTxopBurst) this.beginTxop(e, t)
    const mu: MuDlState = { kind: 'dl', gid, ac: ei, parts: claims, successes: new Set(), resolveHandle: 0 }
    this.muState = mu
    this.transmitFrame(frame, false)
    mu.resolveHandle = this.q.schedule(t + ppduDur + SIFS_NS + baTime + ACK_TIMEOUT_NS, () => this.resolveDlMu())
  }

  /** DL MU (OFDMA): members share the channel — each gets a fraction of it, at 1 stream's worth of Nss headroom each. */
  private buildOfdmaParts(e: Edcaf, ei: number, dsts: string[]): {
    parts: MuPart[]; claims: { peer: string; msdus: Msdu[] }[]; ppduDur: Ns; modeAll: PhyMode; width: number
  } {
    const frac = 1 / dsts.length
    const parts: MuPart[] = []
    const claims: { peer: string; msdus: Msdu[] }[] = []
    let ppduDur = 0
    let modeAll: PhyMode = 'eht'
    // The DL MU PPDU spans the whole operating channel: it runs at the
    // narrowest width any member negotiated. Stream count stays per member —
    // each user's RU carries its own Nss.
    const muWidth = Math.min(...dsts.map((d) => this.cfg.widthForPeer(d)))
    for (const peer of dsts) {
      const mode = this.cfg.modeForPeer(peer)
      if (mode !== 'eht') modeAll = 'he'
      const mcs = this.cfg.mcsForPeer(peer)
      const nss = this.cfg.nssForPeer(peer)
      const budget = maxPsduBytesFor(mode, mcs, frac, MAX_PPDU_NS, muWidth, nss)
      const msdus = this.queues.claim(ei, peer, MAX_AMPDU_MPDUS, (m, claimed) =>
        ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes]) <= budget)
      if (!msdus.length) continue
      const bytes = ampduPsduBytes(msdus.map((m) => m.bytes))
      parts.push({
        dst: peer, src: this.nodeId, bytes, mcs, mbps: mcsRateMbps(mode, mcs),
        msduIds: msdus.map((m) => m.id), mpduCount: msdus.length, ac: e.params.ac, ruFraction: frac,
      })
      claims.push({ peer, msdus })
      ppduDur = Math.max(ppduDur, txTimeModeNs(mode, bytes, mcs, { mu: true, ruFraction: frac, widthMhz: muWidth, nss }))
    }
    return { parts, claims, ppduDur, modeAll, width: muWidth }
  }

  /** DL MU-MIMO: members share nothing but time — each gets the full width at its own stream count. */
  private buildMumimoParts(e: Edcaf, ei: number, dsts: string[]): {
    parts: MuPart[]; claims: { peer: string; msdus: Msdu[] }[]; ppduDur: Ns; modeAll: PhyMode; width: number
  } {
    const parts: MuPart[] = []
    const claims: { peer: string; msdus: Msdu[] }[] = []
    let ppduDur = 0
    let modeAll: PhyMode = 'eht'
    const muWidth = Math.min(...dsts.map((d) => this.cfg.widthForPeer(d)))
    for (const peer of dsts) {
      const mode = this.cfg.modeForPeer(peer)
      if (mode !== 'eht') modeAll = 'he'
      const mcs = this.cfg.mcsForPeer(peer)
      const nssPeer = this.cfg.nssForPeer(peer)
      const budget = maxPsduBytesFor(mode, mcs, 1, MAX_PPDU_NS, muWidth, nssPeer)
      const msdus = this.queues.claim(ei, peer, MAX_AMPDU_MPDUS, (m, claimed) =>
        ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes]) <= budget)
      if (!msdus.length) continue
      const bytes = ampduPsduBytes(msdus.map((m) => m.bytes))
      parts.push({
        dst: peer, src: this.nodeId, bytes, mcs, mbps: mcsRateMbps(mode, mcs),
        msduIds: msdus.map((m) => m.id), mpduCount: msdus.length, ac: e.params.ac, nss: nssPeer,
      })
      claims.push({ peer, msdus })
      ppduDur = Math.max(ppduDur, txTimeModeNs(mode, bytes, mcs, { mu: true, widthMhz: muWidth, nss: nssPeer }))
    }
    return { parts, claims, ppduDur, modeAll, width: muWidth }
  }

  private transmitSuFallback(e: Edcaf, inTxopBurst: boolean): void {
    const savedOfdma = this.cfg.ofdmaWith
    this.cfg.ofdmaWith = () => false
    try {
      this.transmitFor(e, inTxopBurst)
    } finally {
      this.cfg.ofdmaWith = savedOfdma
    }
  }

  private resolveDlMu(): void {
    const mu = this.muState
    if (!mu || mu.kind !== 'dl') return
    this.muState = null
    const e = this.edcafs[mu.ac]
    const t = this.now()
    let anyFail = false
    for (const c of mu.parts) {
      if (mu.successes.has(c.peer)) {
        this.cfg.onTxOutcome?.(c.peer, true)
        for (const m of c.msdus) {
          this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(mu.ac), ac: this.acTag(e) })
          this.hooks.onDequeue?.(m.id)
        }
      } else {
        anyFail = true
        this.cfg.onTxOutcome?.(c.peer, false)
        this.queues.restore(mu.ac, c.msdus)
      }
    }
    if (anyFail) {
      this.failAttemptCore(e, false, mu.parts[0]?.msdus[0]?.id ?? 0, true)
    } else {
      e.src = 0
      e.lrc = 0
      e.cw = e.params.cwMin
      this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
      this.continueOrRelease(e)
    }
  }

  private transmitTrigger(e: Edcaf, users: { peer: string; ac: number; bytes: number }[]): void {
    const t = this.now()
    const gid = `mu${this.nodeId}:${this.muGidCounter++}`
    const frac = 1 / users.length
    let ulDur = 0
    // Same as the DL MU PPDU: the trigger schedules the TB PPDUs at the
    // narrowest width any invited user negotiated; Nss stays per user.
    const ulWidth = Math.min(...users.map((u) => this.cfg.widthForPeer(u.peer)))
    const parts: MuPart[] = users.map((u) => {
      const mode = this.cfg.modeForPeer(u.peer)
      const mcs = this.cfg.mcsForPeer(u.peer)
      const nss = this.cfg.nssForPeer(u.peer)
      const need = txTimeModeNs(
        mode,
        Math.max(64, Math.min(u.bytes + 64, maxPsduBytesFor(mode, mcs, frac, 2_000_000, ulWidth, nss))),
        mcs,
        { ruFraction: frac, widthMhz: ulWidth, nss },
      )
      ulDur = Math.max(ulDur, Math.min(need, 2_000_000))
      return {
        dst: u.peer, src: this.nodeId, bytes: 0, mcs, mbps: mcsRateMbps(mode, mcs),
        msduIds: [], mpduCount: 0, ac: u.ac,
      }
    })
    for (const p of parts) p.durNs = ulDur
    const mbaTime = txTimeNs(multiStaBaBytes(users.length), 24)
    const tb = triggerBytes(users.length)
    const trigger: FrameDesc = {
      kind: 'trigger', src: this.nodeId, dst: '*mu', bytes: tb, mbps: 24,
      durationFieldNs: SIFS_NS + ulDur + SIFS_NS + mbaTime,
      txTimeNs: txTimeNs(tb, 24), muParts: parts, orthogonalGroup: gid, ac: this.acTag(e),
    }
    this.wantTrigger = false
    const mu: MuUlState = { kind: 'ul', gid, ac: this.edcafs.indexOf(e), users: users.map((u) => u.peer), received: new Map(), mbaHandle: 0, rxTimeoutHandle: 0 }
    this.muState = mu
    this.transmitFrame(trigger, false)
    mu.mbaHandle = this.q.schedule(t + trigger.txTimeNs + SIFS_NS + ulDur + SIFS_NS, () => this.sendMba())
    // §10.3.2.9: a Trigger expects a response like any other frame. If no
    // triggered PPDU has started within SIFS + slot + RxPHYStartDelay of the
    // trigger's end, the round failed — do not sit out the whole 2 ms window.
    mu.rxTimeoutHandle = this.q.schedule(t + trigger.txTimeNs + ACK_TIMEOUT_NS, () => this.onTriggerRespTimeout(mu))
  }

  private onTriggerRespTimeout(mu: MuUlState): void {
    mu.rxTimeoutHandle = 0
    if (this.muState !== mu || mu.received.size > 0) return
    const t = this.now()
    this.q.cancel(mu.mbaHandle)
    mu.mbaHandle = 0
    this.muState = null
    this.emit({ t, type: 'ACK_TIMEOUT', node: this.nodeId })
    // Retry accounting for the trigger itself (a short frame). It carries no
    // MSDUs of ours, so there is nothing to drop at the retry limit — only the
    // §10.3.3 reset of the counter and CW.
    const e = this.edcafs[mu.ac]
    e.src++
    this.ssrc++
    if (e.src >= SHORT_RETRY_LIMIT) {
      e.src = 0
      e.cw = e.params.cwMin
    } else {
      e.cw = Math.min(2 * e.cw + 1, e.params.cwMax)
    }
    this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
    this.endTxop()
    e.backoff = null
    e.needDraw = true
    this.resumeAll()
  }

  private sendMba(): void {
    const mu = this.muState
    if (!mu || mu.kind !== 'ul') return
    const acked = [...mu.received.keys()]
    if (mu.rxTimeoutHandle) this.q.cancel(mu.rxTimeoutHandle)
    this.muState = null
    if (acked.length === 0) {
      this.resumeAll()
      return
    }
    const bytes = multiStaBaBytes(acked.length)
    const mba: FrameDesc = {
      kind: 'mba', src: this.nodeId, dst: '*mu', bytes, mbps: 24,
      durationFieldNs: 0, txTimeNs: txTimeNs(bytes, 24),
      muParts: acked.map((peer) => ({ dst: peer, src: this.nodeId, bytes: 0, mcs: 0, mbps: 24, msduIds: [], mpduCount: 0 })),
    }
    this.transmitFrame(mba, false)
  }

  // ---------- exchange mechanics ----------

  private transmitFrame(frame: FrameDesc, expectResponse: boolean): void {
    this.cancelAllContention()
    this.setState('tx')
    this.ch.startTx(this.nodeId, frame)
    const end = this.now() + frame.txTimeNs
    // Phase 2: run after the channel has resolved receptions/CCA at this instant.
    this.q.schedule(end, () => this.onOwnTxEnd(expectResponse), 2)
  }

  private onOwnTxEnd(expectResponse: boolean): void {
    const t = this.now()
    if (this.muState) {
      this.setState('waitAck') // MU exchanges resolve on their own timers
      return
    }
    if (expectResponse && this.awaiting) {
      this.setState(this.awaiting.kind === 'cts' ? 'waitCts' : 'waitAck')
      this.lastRxStartNs = NEVER
      const to = this.awaiting.kind === 'cts' ? CTS_TIMEOUT_NS : ACK_TIMEOUT_NS
      this.timeoutHandle = this.q.schedule(t + to, () => this.onRespTimeout())
    } else if (this.staMuAwait) {
      this.setState('waitAck')
    } else {
      // Finished a response frame (ACK/CTS/BA/M-BA) — resume our own access.
      this.resumeAll()
    }
  }

  private onRespTimeout(): void {
    const t = this.now()
    if (!this.awaiting) return
    this.emit({ t, type: this.awaiting.kind === 'cts' ? 'CTS_TIMEOUT' : 'ACK_TIMEOUT', node: this.nodeId })
    this.failAttempt()
  }

  private failAttempt(): void {
    const aw = this.awaiting
    if (!aw) return
    this.cancel('timeout')
    this.awaiting = null
    const e = this.edcafs[aw.ac]
    this.queues.restore(aw.ac, aw.msdus)
    const isShort = aw.wasRts || aw.aggBytes <= this.cfg.rtsThresholdBytes
    this.cfg.onTxOutcome?.(aw.peer, false)
    this.failAttemptCore(e, isShort, aw.msdus[0]?.id ?? 0, aw.msdus.length > 1)
  }

  private failAttemptCore(e: Edcaf, isShort: boolean, msduId: number, dropWholeSet: boolean): void {
    const t = this.now()
    if (isShort) {
      e.src++
      this.ssrc++
    } else {
      e.lrc++
      this.slrc++
    }
    this.emit({ t, type: 'RETRY', node: this.nodeId, msduId, src: e.src, lrc: e.lrc, ssrc: this.ssrc, slrc: this.slrc, ac: this.acTag(e) })
    e.cw = Math.min(2 * e.cw + 1, e.params.cwMax)
    this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
    if (e.src >= SHORT_RETRY_LIMIT || e.lrc >= LONG_RETRY_LIMIT) {
      const ei = this.edcafs.indexOf(e)
      const victims = this.queues.claim(ei, null, dropWholeSet ? MAX_AMPDU_MPDUS : 1, () => true)
      for (const m of victims) {
        this.emit({ t, type: 'DROP', node: this.nodeId, msduId: m.id, reason: 'retryLimit', ac: this.acTag(e) })
        this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(ei), ac: this.acTag(e) })
        this.hooks.onDequeue?.(m.id)
      }
      e.src = 0
      e.lrc = 0
      e.cw = e.params.cwMin // §10.3.3 CW reset at retry limit
      this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
    }
    this.endTxop()
    e.backoff = null
    e.needDraw = true
    this.resumeAll()
  }

  private succeedAttempt(): void {
    const aw = this.awaiting!
    this.cancel('timeout')
    this.awaiting = null
    const t = this.now()
    const e = this.edcafs[aw.ac]
    if (aw.aggBytes <= this.cfg.rtsThresholdBytes) this.ssrc = 0
    else this.slrc = 0
    e.src = 0
    e.lrc = 0
    e.cw = e.params.cwMin
    this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
    for (const m of aw.msdus) {
      this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(aw.ac), ac: this.acTag(e) })
      this.hooks.onDequeue?.(m.id)
    }
    this.continueOrRelease(e)
  }

  /** TXOP continuation or post-TX backoff. */
  private continueOrRelease(e: Edcaf): void {
    const t = this.now()
    const ei = this.edcafs.indexOf(e)
    if (this.txopEndNs > 0 && this.txopAc === ei && this.queues.depthFor(ei, this.reach) > 0) {
      const head = this.queues.head(ei, this.reach)!
      const mode = this.cfg.modeForPeer(head.dst)
      const mcs = this.cfg.mcsForPeer(head.dst)
      const width = this.cfg.widthForPeer(head.dst)
      const nss = this.cfg.nssForPeer(head.dst)
      const oneFrame = txTimeModeNs(mode, dataPsduBytes(head.bytes), mcs, { widthMhz: width, nss })
      const need = SIFS_NS + oneFrame + SIFS_NS + txTimeNs(BA_BYTES, 24)
      if (t + need <= this.txopEndNs) {
        this.setState('sifsResp')
        this.respHandle = this.q.schedule(t + SIFS_NS, () => {
          this.respHandle = 0
          // Someone started transmitting inside our SIFS gap (single protection
          // only covered the response). Our radio is receiving: a real PHY
          // cannot start a PPDU now, so the burst ends here and we re-contend.
          if (this.ch.isCcaBusy(this.nodeId)) {
            this.releaseTxop(e)
            return
          }
          this.transmitFor(e, true)
        })
        return
      }
    }
    this.releaseTxop(e)
  }

  /**
   * Give the channel back after a burst. If a boundary RTS/CTS announced more
   * time than we used, truncate the reservation with a CF-End (§10.23.2.9) so
   * everyone who decodes it can drop their NAV now.
   */
  private releaseTxop(e: Edcaf): void {
    const t = this.now()
    const announced = this.announcedEndNs
    this.endTxop()
    e.backoff = null
    e.needDraw = true // post-transmission backoff, §10.3.4.3
    const cfTime = txTimeNs(CF_END_BYTES, 24)
    if (announced > t + SIFS_NS + cfTime + SLOT_NS) {
      this.scheduleResponse(t, this.cfEndFrame())
      return
    }
    this.resumeAll()
  }

  private cfEndFrame(): FrameDesc {
    return {
      kind: 'cfend', src: this.nodeId, dst: '*', bytes: CF_END_BYTES, mbps: 24,
      durationFieldNs: 0, txTimeNs: txTimeNs(CF_END_BYTES, 24),
    }
  }

  /** §10.23.2.9: a decoded CF-End resets the NAV; the AP repeats a non-AP holder's CF-End. */
  private onCfEnd(t: Ns, from: string): void {
    if (this.navUntil > t) {
      this.navUntil = 0
      this.navFromRtsAt = null
      this.cancel('nav')
      this.emit({ t, type: 'NAV_CLEAR', node: this.nodeId })
    }
    if (this.cfg.isAp && from !== this.nodeId && !this.inExchange()) {
      this.scheduleResponse(t, this.cfEndFrame())
    }
  }

  private resumeAll(): void {
    for (const e of this.edcafs) this.startAccessAc(e)
    // Callers often setState('idle') first; if an IFS was just armed the
    // aggregate state is 'defer' (the label and the wait track read it).
    this.refreshState()
  }

  // ---------- PhyListener ----------

  onCcaBusy(_t: Ns): void {
    for (const e of this.edcafs) {
      if (e.tickHandle) {
        this.cancelEf(e, 'tick')
        this.emit({ t: this.now(), type: 'BACKOFF_FREEZE', node: this.nodeId, value: e.backoff!, ac: this.acTag(e) })
      }
      // §10.3.4.2: interrupting a running IFS is a deferral — the
      // no-backoff basic-access path is no longer allowed for this attempt.
      if (e.ifsHandle && e.backoff === null) e.needDraw = true
      this.cancelEf(e, 'ifs')
    }
    this.readyAcs.clear()
    this.refreshState()
  }

  onCcaIdle(t: Ns): void {
    this.lastBusyEndNs = t
    if (this.now() >= this.navUntil && !this.inExchange()) this.resumeAll()
  }

  onRxStart(t: Ns, frame: FrameDesc, _from: string): void {
    this.lastRxStartNs = t
    if (this.awaiting !== null) {
      // §10.3.2.9: PHY-RXSTART before AckTimeout → wait for the RXEND outcome.
      this.cancel('timeout')
    }
    const mu = this.muState
    if (mu?.kind === 'ul' && mu.rxTimeoutHandle && frame.orthogonalGroup === mu.gid) {
      // A triggered PPDU has started: the response window is honoured.
      this.q.cancel(mu.rxTimeoutHandle)
      mu.rxTimeoutHandle = 0
    }
  }

  onRxOk(t: Ns, frame: FrameDesc, from: string): void {
    this.corruptLast = false
    const myPart = frame.muParts?.find((p) => p.dst === this.nodeId)
    // §10.3.2.9: onRxStart held the ACK/CTS timeout for this reception. If
    // what arrived is anything but the awaited response — another station's
    // RTS or data to us, a frame for someone else — the attempt has failed,
    // and it must be closed *before* we answer the newcomer, or the pending
    // attempt would block our own access indefinitely.
    if (this.awaiting !== null && !this.isAwaitedResponse(frame)) this.failAttempt()
    if (frame.kind === 'cfend') {
      this.onCfEnd(t, from)
      return
    }
    if (frame.dst === this.nodeId || myPart) {
      this.handleOwnFrame(t, frame, from, myPart)
    } else {
      this.updateNav(t, frame, from)
    }
  }

  private isAwaitedResponse(frame: FrameDesc): boolean {
    if (!this.awaiting || frame.dst !== this.nodeId) return false
    return this.awaiting.kind === 'cts' ? frame.kind === 'cts' : frame.kind === 'ack' || frame.kind === 'ba'
  }

  onRxCorrupt(_t: Ns): void {
    this.corruptLast = true
    if (this.awaiting !== null) this.failAttempt()
  }

  private noteDelivered(id: number): boolean {
    if (this.delivered.has(id)) return false
    this.delivered.add(id)
    this.deliveredOrder.push(id)
    if (this.deliveredOrder.length > 512) this.delivered.delete(this.deliveredOrder.shift()!)
    return true
  }

  private handleOwnFrame(t: Ns, frame: FrameDesc, from: string, myPart?: MuPart): void {
    switch (frame.kind) {
      case 'data': {
        if (myPart) {
          // DL MU part addressed to me: deliver + BA on my RU (simultaneous group).
          for (const id of myPart.msduIds) {
            if (this.noteDelivered(id)) this.hooks.onMsduDelivered?.(id, t)
          }
          this.scheduleResponse(t, {
            kind: 'ba', src: this.nodeId, dst: from, bytes: BA_BYTES, mbps: 24,
            durationFieldNs: 0, txTimeNs: txTimeNs(BA_BYTES, 24), orthogonalGroup: frame.orthogonalGroup,
            muKind: frame.muKind,
          })
          break
        }
        // UL MU TB data at the AP: group-acked via M-BA, no immediate response.
        if (frame.orthogonalGroup && this.muState?.kind === 'ul' && frame.orthogonalGroup === this.muState.gid) {
          const ids = frame.ampdu?.msduIds ?? (frame.msduId !== undefined ? [frame.msduId] : [])
          for (const id of ids) {
            if (this.noteDelivered(id)) this.hooks.onMsduDelivered?.(id, t)
          }
          this.muState.received.set(from, frame)
          break
        }
        const ids = frame.ampdu?.msduIds ?? (frame.msduId !== undefined ? [frame.msduId] : [])
        for (const id of ids) {
          if (this.noteDelivered(id)) this.hooks.onMsduDelivered?.(id, t)
        }
        const isBa = frame.ampdu !== undefined
        const rate = ctrlRespRateFor(frame.mbps)
        const respBytes = isBa ? BA_BYTES : ACK_BYTES
        this.scheduleResponse(t, {
          kind: isBa ? 'ba' : 'ack', src: this.nodeId, dst: from, bytes: respBytes,
          mbps: rate, durationFieldNs: 0, txTimeNs: txTimeNs(respBytes, rate),
        })
        break
      }
      case 'trigger': {
        if (!myPart) break
        // Scheduled by the AP: the trigger's NAV must not block our response.
        this.navUntil = 0
        this.cancel('nav')
        this.respondToTrigger(t, frame, myPart)
        break
      }
      case 'mba': {
        if (!this.staMuAwait) break
        const listed = frame.muParts?.some((p) => p.dst === this.nodeId) === true
        const st = this.staMuAwait
        this.staMuAwait = null
        this.q.cancel(st.timeoutHandle)
        const e = this.edcafs[st.ac]
        if (listed) {
          e.src = 0
          e.lrc = 0
          e.cw = e.params.cwMin
          this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
          for (const m of st.msdus) {
            this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(st.ac), ac: this.acTag(e) })
            this.hooks.onDequeue?.(m.id)
          }
          this.resumeAll()
        } else {
          this.queues.restore(st.ac, st.msdus)
          this.failAttemptCore(e, false, st.msdus[0]?.id ?? 0, false)
        }
        break
      }
      case 'ba':
      case 'ack': {
        if (this.muState?.kind === 'dl' && frame.orthogonalGroup === this.muState.gid) {
          const mu = this.muState
          mu.successes.add(from)
          // Every user has answered: the exchange is resolved now, at the end
          // of the simultaneous BlockAcks — not 45 µs later when the response
          // timeout would have expired. Waiting left the TXOP holder idle for
          // SIFS + AckTimeout after each DL MU PPDU, long enough for any
          // station's AIFS to elapse and intrude on the burst.
          if (mu.successes.size === mu.parts.length) {
            this.q.cancel(mu.resolveHandle)
            mu.resolveHandle = 0
            this.resolveDlMu()
          }
          break
        }
        if (this.awaiting && (this.awaiting.kind === 'ack' || this.awaiting.kind === 'ba')) {
          // Whole-PPDU decode model: reaching here means everything in this
          // exchange was acknowledged (no per-subframe bitmap to partially
          // fail on), so a single-user ack/ba is always a full success.
          this.cfg.onTxOutcome?.(this.awaiting.peer, true)
          this.succeedAttempt()
        }
        break
      }
      case 'rts': {
        // §10.3.2.9: respond with CTS only if NAV indicates idle.
        if (this.now() < this.navUntil) break
        const ctsRate = ctrlRespRateFor(frame.mbps)
        const ctsTime = txTimeNs(CTS_BYTES, ctsRate)
        this.scheduleResponse(t, {
          kind: 'cts', src: this.nodeId, dst: from, bytes: CTS_BYTES, mbps: ctsRate,
          durationFieldNs: Math.max(0, frame.durationFieldNs - SIFS_NS - ctsTime),
          txTimeNs: ctsTime,
        })
        break
      }
      case 'cts': {
        if (this.awaiting?.kind === 'cts') {
          this.cancel('timeout')
          const aw = this.awaiting
          this.ssrc = 0 // §10.3.3: SSRC reset on CTS received in response to RTS
          this.edcafs[aw.ac].src = 0
          this.setState('sifsResp')
          this.respHandle = this.q.schedule(t + SIFS_NS, () => {
            this.respHandle = 0
            const e = this.edcafs[aw.ac]
            const mode = this.cfg.modeForPeer(aw.peer)
            const mcs = this.cfg.mcsForPeer(aw.peer)
            const width = this.cfg.widthForPeer(aw.peer)
            const nss = this.cfg.nssForPeer(aw.peer)
            const mbps = mcsRateMbps(mode, mcs)
            const aggregate = aw.msdus.length > 1
            const respTime = txTimeNs(aggregate ? BA_BYTES : ACK_BYTES, ctrlRespRateFor(mbps))
            const frame2 = this.buildDataFrame(e, aw.peer, aw.msdus, aw.aggBytes, mode, mcs, mbps, aggregate, respTime, width, nss)
            this.awaiting = { ...aw, kind: aggregate ? 'ba' : 'ack', wasRts: false }
            this.transmitFrame(frame2, true)
          })
        }
        break
      }
    }
  }

  private respondToTrigger(t: Ns, trigger: FrameDesc, part: MuPart): void {
    const ac = this.efIndex(part.ac ?? 1)
    const e = this.edcafs[ac]
    const dur = part.durNs ?? 1_000_000
    this.cancelAllContention()
    this.setState('sifsResp')
    this.respHandle = this.q.schedule(t + SIFS_NS, () => {
      this.respHandle = 0
      const n = trigger.muParts!.length
      const frac = 1 / n
      const mode = this.cfg.modeForPeer(trigger.src)
      const mcs = part.mcs
      const width = this.cfg.widthForPeer(trigger.src)
      const nss = this.cfg.nssForPeer(trigger.src)
      const budget = maxPsduBytesFor(mode, mcs, frac, dur, width, nss)
      const msdus = this.queues.claim(ac, null, MAX_AMPDU_MPDUS, (m, claimed) =>
        ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes]) <= budget)
      if (!msdus.length) {
        this.resumeAll()
        return
      }
      const bytes = ampduPsduBytes(msdus.map((m) => m.bytes))
      const frame: FrameDesc = {
        kind: 'data', src: this.nodeId, dst: trigger.src, bytes, mbps: mcsRateMbps(mode, mcs),
        durationFieldNs: 0, txTimeNs: dur, // padded to the trigger's target duration
        seqNo: e.seqCounter, mode, mcs, widthMhz: width, ac: this.acTag(e),
        ampdu: { mpduCount: msdus.length, msduIds: msdus.map((m) => m.id) },
        orthogonalGroup: trigger.orthogonalGroup,
      }
      e.seqCounter += msdus.length
      const mbaTime = txTimeNs(multiStaBaBytes(n), 24)
      this.staMuAwait = {
        ac, msdus,
        timeoutHandle: this.q.schedule(t + SIFS_NS + dur + SIFS_NS + mbaTime + ACK_TIMEOUT_NS, () => {
          const st = this.staMuAwait
          if (!st) return
          this.staMuAwait = null
          this.queues.restore(st.ac, st.msdus)
          this.failAttemptCore(this.edcafs[st.ac], false, st.msdus[0]?.id ?? 0, false)
        }),
      }
      this.transmitFrame(frame, false)
    })
  }

  private scheduleResponse(t: Ns, resp: FrameDesc): void {
    this.cancelAllContention()
    // A frame we must answer arrived while our own SIFS-chained transmission
    // (TXOP continuation) was pending: the radio was receiving, so that
    // continuation is void — the response wins and the TXOP is over. Leaving
    // both timers armed made the second one start a PPDU mid-transmission.
    if (this.respHandle) {
      this.cancel('resp')
      if (this.txopEndNs > 0) {
        const holder = this.edcafs[this.txopAc]
        this.endTxop()
        if (holder) {
          holder.backoff = null
          holder.needDraw = true // post-transmission backoff, §10.3.4.3
        }
      }
    }
    this.pendingResp = resp
    this.setState('sifsResp')
    this.respHandle = this.q.schedule(t + SIFS_NS, () => {
      this.respHandle = 0
      const f = this.pendingResp!
      this.pendingResp = null
      this.transmitFrame(f, false)
    })
  }

  // ---------- NAV ----------

  private updateNav(t: Ns, frame: FrameDesc, from: string): void {
    const until = t + frame.durationFieldNs
    if (until <= this.navUntil || frame.durationFieldNs <= 0) return
    this.navUntil = until
    this.emit({ t, type: 'NAV_SET', node: this.nodeId, untilNs: until, source: `${frame.kind}:${from}` })
    this.cancel('nav')
    this.navClearHandle = this.q.schedule(until, () => this.onNavClear())
    for (const e of this.edcafs) {
      if (e.tickHandle) {
        this.cancelEf(e, 'tick')
        this.emit({ t, type: 'BACKOFF_FREEZE', node: this.nodeId, value: e.backoff!, ac: this.acTag(e) })
      }
      // Same as onCcaBusy: a NAV set mid-IFS is a deferral (§10.3.4.2).
      if (e.ifsHandle && e.backoff === null) e.needDraw = true
      this.cancelEf(e, 'ifs')
    }
    this.refreshState()
    if (frame.kind === 'rts') {
      // §10.3.2.4 RTS-NAV early release.
      const setAt = t
      this.navFromRtsAt = setAt
      const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(frame.mbps))
      this.q.schedule(t + 2 * SIFS_NS + ctsTime + 2 * SLOT_NS, () => {
        if (this.navFromRtsAt === setAt && this.lastRxStartNs <= setAt && this.navUntil > this.now()) {
          this.navUntil = 0
          this.emit({ t: this.now(), type: 'NAV_CLEAR', node: this.nodeId })
          this.cancel('nav')
          this.navFromRtsAt = null
          if (!this.ch.isCcaBusy(this.nodeId)) {
            this.lastBusyEndNs = this.now()
            this.resumeAll()
          }
        }
      })
    } else {
      this.navFromRtsAt = null
    }
  }

  private onNavClear(): void {
    const t = this.now()
    this.navUntil = 0
    this.navFromRtsAt = null
    this.emit({ t, type: 'NAV_CLEAR', node: this.nodeId })
    if (!this.ch.isCcaBusy(this.nodeId) && !this.inExchange()) {
      this.lastBusyEndNs = Math.max(this.lastBusyEndNs, t)
      this.resumeAll()
    }
  }

  // ---------- helpers ----------

  /** Aggregate MAC state for visualization. */
  private refreshState(): void {
    let s: MacStateName
    if (this.ch.isTransmitting(this.nodeId)) s = 'tx'
    else if (this.awaiting?.kind === 'cts') s = 'waitCts'
    else if (this.awaiting || this.staMuAwait || this.muState) s = 'waitAck'
    else if (this.pendingResp || this.respHandle) s = 'sifsResp'
    else if (this.edcafs.some((e) => e.tickHandle)) s = 'backoff'
    else if (this.edcafs.some((e) => e.ifsHandle) || this.edcafs.some((e) => this.hasWork(e))) s = 'defer'
    else s = 'idle'
    this.setState(s)
  }

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }

  private cancelAllContention(): void {
    for (const e of this.edcafs) {
      this.cancelEf(e, 'ifs')
      this.cancelEf(e, 'tick')
    }
    this.readyAcs.clear()
  }

  private cancelEf(e: Edcaf, which: 'ifs' | 'tick'): void {
    if (which === 'ifs' && e.ifsHandle) {
      this.q.cancel(e.ifsHandle)
      e.ifsHandle = 0
    }
    if (which === 'tick' && e.tickHandle) {
      this.q.cancel(e.tickHandle)
      e.tickHandle = 0
    }
  }

  private cancel(...which: ('timeout' | 'nav' | 'resp')[]): void {
    for (const w of which) {
      switch (w) {
        case 'timeout': if (this.timeoutHandle) { this.q.cancel(this.timeoutHandle); this.timeoutHandle = 0 } break
        case 'nav': if (this.navClearHandle) { this.q.cancel(this.navClearHandle); this.navClearHandle = 0 } break
        case 'resp': if (this.respHandle) { this.q.cancel(this.respHandle); this.respHandle = 0 } break
      }
    }
  }
}

/** v1 compatibility name. */
export { WifiMac as DcfMac }
