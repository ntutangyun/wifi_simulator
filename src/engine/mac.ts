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
import type { Ns } from '../model/types'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import {
  ACK_BYTES, ACK_TIMEOUT_NS, BA_BYTES, CTS_BYTES, CTS_TIMEOUT_NS, DCF_PARAMS, DIFS_NS,
  EDCA_PARAMS, EIFS_NS, LONG_RETRY_LIMIT, MAX_AMPDU_MPDUS, MAX_PPDU_NS, PHY_MODES,
  QOS_HDR_BYTES, FCS_BYTES, RTS_BYTES, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
  aifsNs, ctrlRespRateFor, mcsRateMbps, multiStaBaBytes, triggerBytes, txTimeModeNs, txTimeNs,
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
  ampduWith(peer: string): boolean
  ofdmaWith(peer: string): boolean
  /** AP only: stand-in for BSR — UL backlog of OFDMA-capable STAs. */
  ulBacklog?(): { peer: string; ac: number; bytes: number }[]
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
}

interface StaMuAwait {
  ac: number
  msdus: Msdu[]
  timeoutHandle: number
}

/** Max PSDU bytes that fit a target duration at mode/mcs/RU fraction. */
export function maxPsduBytesFor(mode: PhyMode, mcs: number, ruFraction: number, durNs: Ns): number {
  const m = PHY_MODES[mode]
  const nsym = Math.floor((durNs - m.preambleNs) / m.symNs)
  const bits = nsym * m.ndbps[mcs] * ruFraction
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
    this.edcafs = (cfg.edca ? EDCA_PARAMS : [DCF_PARAMS]).map((params) => ({
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

  private hasWork(e: Edcaf): boolean {
    const idx = this.edcafs.indexOf(e)
    return this.queues.depth(idx) > 0 || e.needDraw || e.backoff !== null ||
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

  private arbitrate(): void {
    this.arbitratePending = false
    const ready = [...this.readyAcs].sort((a, b) => b - a) // highest AC first
    this.readyAcs.clear()
    if (!ready.length || this.inExchange()) return
    const t = this.now()
    const winner = this.edcafs[ready[0]]
    for (const i of ready.slice(1)) {
      // Internal collision (§10.23.2.2): behave as an external collision,
      // retry counters unchanged.
      const loser = this.edcafs[i]
      this.emit({ t, type: 'INTERNAL_COLLISION', node: this.nodeId, winnerAc: winner.params.ac, loserAc: loser.params.ac })
      loser.cw = Math.min(2 * loser.cw + 1, loser.params.cwMax)
      this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: loser.cw, ac: this.acTag(loser) })
      loser.backoff = this.rng.int(loser.cw)
      this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: loser.backoff, cw: loser.cw, ac: this.acTag(loser) })
      this.scheduleTick(loser)
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
      const muDsts = this.queues.dsts(ei).filter((d) => this.cfg.ofdmaWith(d))
      if (muDsts.length >= 2) {
        this.transmitDlMu(e, muDsts.slice(0, 4), inTxopBurst)
        return
      }
      if (this.queues.depth(ei) === 0 && this.wantTrigger && this.cfg.ulBacklog) {
        const users = this.cfg.ulBacklog().filter((u) => this.cfg.ofdmaWith(u.peer))
        if (users.length >= 2) {
          this.transmitTrigger(e, users.slice(0, 4))
          return
        }
        this.wantTrigger = false
      }
    }

    const head = this.queues.head(ei)
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
      return txTimeModeNs(mode, trial, mcs) <= budgetNs
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

    if (psdu > this.cfg.rtsThresholdBytes && !inTxopBurst) {
      // RTS/CTS protection first (§10.3.2.9).
      const rtsRate = ctrlRespRateFor(mbps)
      const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(rtsRate))
      const dataTime = txTimeModeNs(mode, psdu, mcs)
      const rts: FrameDesc = {
        kind: 'rts', src: this.nodeId, dst: peer, bytes: RTS_BYTES, mbps: rtsRate,
        durationFieldNs: 3 * SIFS_NS + ctsTime + dataTime + respTime,
        txTimeNs: txTimeNs(RTS_BYTES, rtsRate), ac: this.acTag(e),
      }
      this.awaiting = { kind: 'cts', ac: ei, peer, msdus, wasRts: true, aggBytes: psdu }
      this.beginTxop(e, t)
      this.transmitFrame(rts, true)
      return
    }

    const frame = this.buildDataFrame(e, peer, msdus, psdu, mode, mcs, mbps, aggregate, respTime)
    this.awaiting = { kind: aggregate ? 'ba' : 'ack', ac: ei, peer, msdus, wasRts: false, aggBytes: psdu }
    if (!inTxopBurst) this.beginTxop(e, t)
    this.transmitFrame(frame, true)
  }

  private buildDataFrame(
    e: Edcaf, peer: string, msdus: Msdu[], psdu: number,
    mode: PhyMode, mcs: number, mbps: number, aggregate: boolean, respTime: Ns,
  ): FrameDesc {
    const seqNo = e.seqCounter
    e.seqCounter += msdus.length
    return {
      kind: 'data', src: this.nodeId, dst: peer, bytes: psdu, mbps,
      durationFieldNs: SIFS_NS + respTime,
      txTimeNs: txTimeModeNs(mode, psdu, mcs),
      seqNo, retryFlag: e.src + e.lrc > 0, msduId: msdus[0].id,
      mode, mcs, ac: this.acTag(e),
      ampdu: aggregate ? { mpduCount: msdus.length, msduIds: msdus.map((m) => m.id) } : undefined,
    }
  }

  private beginTxop(e: Edcaf, t: Ns): void {
    if (this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0) {
      this.txopEndNs = t + e.params.txopLimitNs
      this.txopAc = this.edcafs.indexOf(e)
      this.emit({ t, type: 'TXOP_START', node: this.nodeId, ac: e.params.ac, untilNs: this.txopEndNs })
    }
  }

  private endTxop(): void {
    if (this.txopEndNs > 0) {
      this.emit({ t: this.now(), type: 'TXOP_END', node: this.nodeId })
      this.txopEndNs = 0
      this.txopAc = -1
    }
  }

  // ---------- OFDMA (AP side) ----------

  private transmitDlMu(e: Edcaf, dsts: string[], inTxopBurst: boolean): void {
    const t = this.now()
    const ei = this.edcafs.indexOf(e)
    const gid = `mu${this.nodeId}:${this.muGidCounter++}`
    const frac = 1 / dsts.length
    const parts: MuPart[] = []
    const claims: { peer: string; msdus: Msdu[] }[] = []
    let ppduDur = 0
    let modeAll: PhyMode = 'eht'
    for (const peer of dsts) {
      const mode = this.cfg.modeForPeer(peer)
      if (mode !== 'eht') modeAll = 'he'
      const mcs = this.cfg.mcsForPeer(peer)
      const budget = maxPsduBytesFor(mode, mcs, frac, MAX_PPDU_NS)
      const msdus = this.queues.claim(ei, peer, MAX_AMPDU_MPDUS, (m, claimed) =>
        ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes]) <= budget)
      if (!msdus.length) continue
      const bytes = ampduPsduBytes(msdus.map((m) => m.bytes))
      parts.push({
        dst: peer, src: this.nodeId, bytes, mcs, mbps: mcsRateMbps(mode, mcs),
        msduIds: msdus.map((m) => m.id), mpduCount: msdus.length, ac: e.params.ac,
      })
      claims.push({ peer, msdus })
      ppduDur = Math.max(ppduDur, txTimeModeNs(mode, bytes, mcs, { mu: true, ruFraction: frac }))
    }
    if (parts.length < 2) {
      for (const c of claims) this.queues.restore(ei, c.msdus)
      this.transmitSuFallback(e, inTxopBurst)
      return
    }
    const baTime = txTimeNs(BA_BYTES, 24)
    const frame: FrameDesc = {
      kind: 'data', src: this.nodeId, dst: '*mu', bytes: parts.reduce((s, p) => s + p.bytes, 0),
      mbps: parts[0].mbps, durationFieldNs: SIFS_NS + baTime,
      txTimeNs: ppduDur, mode: modeAll, mcs: parts[0].mcs, ac: this.acTag(e),
      muParts: parts, orthogonalGroup: gid,
    }
    if (!inTxopBurst) this.beginTxop(e, t)
    const mu: MuDlState = { kind: 'dl', gid, ac: ei, parts: claims, successes: new Set(), resolveHandle: 0 }
    this.muState = mu
    this.transmitFrame(frame, false)
    mu.resolveHandle = this.q.schedule(t + ppduDur + SIFS_NS + baTime + ACK_TIMEOUT_NS, () => this.resolveDlMu())
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
        for (const m of c.msdus) {
          this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(mu.ac), ac: this.acTag(e) })
          this.hooks.onDequeue?.(m.id)
        }
      } else {
        anyFail = true
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
    const parts: MuPart[] = users.map((u) => {
      const mode = this.cfg.modeForPeer(u.peer)
      const mcs = this.cfg.mcsForPeer(u.peer)
      const need = txTimeModeNs(
        mode,
        Math.max(64, Math.min(u.bytes + 64, maxPsduBytesFor(mode, mcs, frac, 2_000_000))),
        mcs,
        { ruFraction: frac },
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
    const mu: MuUlState = { kind: 'ul', gid, ac: this.edcafs.indexOf(e), users: users.map((u) => u.peer), received: new Map(), mbaHandle: 0 }
    this.muState = mu
    this.transmitFrame(trigger, false)
    mu.mbaHandle = this.q.schedule(t + trigger.txTimeNs + SIFS_NS + ulDur + SIFS_NS, () => this.sendMba())
  }

  private sendMba(): void {
    const mu = this.muState
    if (!mu || mu.kind !== 'ul') return
    const acked = [...mu.received.keys()]
    this.muState = null
    if (acked.length === 0) {
      this.setState('idle')
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
      this.setState('idle')
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
    this.setState('idle')
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
    if (this.txopEndNs > 0 && this.txopAc === ei && this.queues.depth(ei) > 0) {
      const head = this.queues.head(ei)!
      const mode = this.cfg.modeForPeer(head.dst)
      const mcs = this.cfg.mcsForPeer(head.dst)
      const oneFrame = txTimeModeNs(mode, dataPsduBytes(head.bytes), mcs)
      const need = SIFS_NS + oneFrame + SIFS_NS + txTimeNs(BA_BYTES, 24)
      if (t + need <= this.txopEndNs) {
        this.setState('sifsResp')
        this.respHandle = this.q.schedule(t + SIFS_NS, () => {
          this.respHandle = 0
          this.transmitFor(e, true)
        })
        return
      }
    }
    this.endTxop()
    e.backoff = null
    e.needDraw = true // post-transmission backoff, §10.3.4.3
    this.setState('idle')
    this.resumeAll()
  }

  private resumeAll(): void {
    for (const e of this.edcafs) this.startAccessAc(e)
  }

  // ---------- PhyListener ----------

  onCcaBusy(_t: Ns): void {
    for (const e of this.edcafs) {
      if (e.tickHandle) {
        this.cancelEf(e, 'tick')
        this.emit({ t: this.now(), type: 'BACKOFF_FREEZE', node: this.nodeId, value: e.backoff!, ac: this.acTag(e) })
      }
      this.cancelEf(e, 'ifs')
    }
    this.readyAcs.clear()
    this.refreshState()
  }

  onCcaIdle(t: Ns): void {
    this.lastBusyEndNs = t
    if (this.now() >= this.navUntil && !this.inExchange()) this.resumeAll()
  }

  onRxStart(t: Ns, _frame: FrameDesc, _from: string): void {
    this.lastRxStartNs = t
    if (this.awaiting !== null) {
      // §10.3.2.9: PHY-RXSTART before AckTimeout → wait for the RXEND outcome.
      this.cancel('timeout')
    }
  }

  onRxOk(t: Ns, frame: FrameDesc, from: string): void {
    this.corruptLast = false
    const myPart = frame.muParts?.find((p) => p.dst === this.nodeId)
    if (frame.dst === this.nodeId || myPart) {
      this.handleOwnFrame(t, frame, from, myPart)
    } else {
      this.updateNav(t, frame, from)
      if (this.awaiting !== null) this.failAttempt()
    }
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
          this.setState('idle')
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
          this.muState.successes.add(from)
          break
        }
        if (this.awaiting && (this.awaiting.kind === 'ack' || this.awaiting.kind === 'ba')) {
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
            const mbps = mcsRateMbps(mode, mcs)
            const aggregate = aw.msdus.length > 1
            const respTime = txTimeNs(aggregate ? BA_BYTES : ACK_BYTES, ctrlRespRateFor(mbps))
            const frame2 = this.buildDataFrame(e, aw.peer, aw.msdus, aw.aggBytes, mode, mcs, mbps, aggregate, respTime)
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
      const budget = maxPsduBytesFor(mode, mcs, frac, dur)
      const msdus = this.queues.claim(ac, null, MAX_AMPDU_MPDUS, (m, claimed) =>
        ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes]) <= budget)
      if (!msdus.length) {
        this.setState('idle')
        this.resumeAll()
        return
      }
      const bytes = ampduPsduBytes(msdus.map((m) => m.bytes))
      const frame: FrameDesc = {
        kind: 'data', src: this.nodeId, dst: trigger.src, bytes, mbps: mcsRateMbps(mode, mcs),
        durationFieldNs: 0, txTimeNs: dur, // padded to the trigger's target duration
        seqNo: e.seqCounter, mode, mcs, ac: this.acTag(e),
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
