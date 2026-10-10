/**
 * Wi-Fi MAC per IEEE Std 802.11-2024, feature-configurable per node:
 *  - DCF (§10.3): CS + NAV, DIFS/EIFS, binary-exponential backoff,
 *    freeze/resume, post-TX backoff, 802.11-2020 retries (per-MSDU count + QSRC), ACK, RTS/CTS.
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
import { psduPlan } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { AmpApCfg, TamperCfg } from '../model/scenario'
import type { Ns } from '../model/types'
import type { TxopProtection } from '../model/scenario'
import { AmpApRound } from './ampAp'
import { AMP_BS_LOSS_DB, bsDecodes, monoLeakDbm, readerFloorDbm, type AmpBsUlKbps } from './ampBs'
import { AmpInventoryRound } from './ampReader'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import {
  ACK_BYTES, BA_BYTES, CF_END_BYTES, CTS_BYTES, DCF_PARAMS,
  EDCA_PARAMS, MAX_AMPDU_MPDUS, MAX_PPDU_NS, OFDM_5G, PHY_MODES,
  RTS_BYTES, SHORT_RETRY_LIMIT,
  GI_MODES, TGI_NS,
  aifsNs, ctrlRespRateFor, ctrlRespRateForMode, lowestMode, mcsInMode, mcsRateMbps,
  multiStaBaBytes, preambleNsFor, symNsFor, triggerBytes, toneRatio, txTimeModeNs, txTimeNs,
  type AcParams, type PhyMode, type PhyTiming, type TxTimeOpts,
} from './phy'
import { Rng } from './rng'
import { AcQueues, DEFAULT_MSDU_LIFETIME_NS } from './queues'
import type { Msdu } from './traffic'

export interface MacHooks {
  onMsduDelivered?(msduId: number, at: Ns): void
  /** An MSDU left the transmit queue: acknowledged (acked) or discarded (retry limit, lifetime). */
  onDequeue?(msduId: number, acked: boolean): void
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
  /** Is this peer a QoS station? Only then does a data frame to it carry a QoS Control field. Default: this MAC's own EDCA setting. */
  qosWith?(peer: string): boolean
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
  /** MSDUs per access-category queue (default 500), for a MAC that builds its own queues.
   * Simulation always passes shared MLD queues, so this is a test-only knob; scenarios set `queue.limit`. */
  queueLimit?: number
  /** MSDU lifetime in the transmit queue (default 500 ms). */
  msduLifetimeNs?: Ns
  /**
   * The data field's guard interval this scenario selects, ns; absent (or a method returning
   * `undefined`) means the base 0.8 µs, which is what `PHY_MODES[*].symNs` already is.
   *
   * **It is a SCENARIO constant, not a quantity derived per link or per peer** — hence no `peer`
   * parameter, unlike every other method here. The standard says which three intervals exist,
   * how long a symbol is at each, and that TXVECTOR's GI_TYPE names the one in use; it does not
   * say how a transmitter should choose, and the quantity a choosing rule would read (the delay
   * spread) has no value anywhere in either document. So the plan's author picks and the engine
   * never picks for them, which is why the lessons record this as a `model-value` (design
   * 2026-10-05-guard-interval §6.1).
   */
  giNs?(): Ns | undefined
  /** Interframe timing of the link this MAC serves (default: 5 GHz OFDM). */
  timing?: PhyTiming
  /** AP only: ambient-power (AMP) polling of P802.11bp tags on this link. */
  ampAp?: AmpApCfg
  /**
   * AP only: which AMP tiers actually have tags on this link. Absent means Active Tx alone,
   * which is what every scenario that predates the backscatter tier is.
   */
  ampTiers?: AmpTiers
  /**
   * AP only: the backscatter tags on this link, for the reader's energy detection inside its own
   * BST-Excitation. It is not addressing — the inventory exists precisely because the reader does
   * not know who is out there — only "is anything reflecting at this instant", which is how a real
   * EPC Gen2 reader tells a collided slot from an empty one.
   */
  ampBsTagIds?: string[]
}

/** The two kinds of AMP tag a reader may find on its link, and whether either is present. */
export interface AmpTiers {
  /** Tags that answer on a carrier of their own, in slots an AMP Trigger opens. */
  active: boolean
  /** Tags with no transmitter, inventoried by reflecting the reader's own excitation. */
  backscatter: boolean
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
  /** QSRC[AC]: consecutive failed attempts of this EDCAF; drives CW (802.11-2020 §10.23.2.2). */
  qsrc: number
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
  /**
   * Whether the PPDU this is waiting on is an A-MPDU, decided once by `psduPlan` and carried
   * rather than re-derived. The CTS path used to re-derive it as `aw.msdus.length > 1` — a
   * fourth spelling of the predicate, correct only because `claim` is capped at one MSDU when
   * the link cannot aggregate. Carrying it costs nothing and removes the invariant.
   */
  aggregate: boolean
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

/**
 * Max PSDU bytes that fit a target duration at mode/mcs/RU fraction.
 *
 * **`giNs` is correctness here, not decoration** — it is the one place in the guard-interval
 * slice where leaving the code alone would be wrong. This turns a DURATION budget into bytes, so
 * at a longer guard interval against the old divisor the symbol count comes out too high and the
 * trigger-based PPDU that is then built runs past the duration it was allowed (design
 * 2026-10-05-guard-interval §3.5).
 *
 * **Both halves of the fraction move.** The 4x LTF that the quadruple GI is paired with adds
 * 8.8 µs to the preamble, which is in the numerator — 8 800 / 16 000 is 0.55 of a symbol, so
 * swapping only the divisor still overruns for some budgets.
 */
export function maxPsduBytesFor(
  mode: PhyMode, mcs: number, ruFraction: number, durNs: Ns, widthMhz = 20, nss = 1,
  giNs: Ns = TGI_NS.base,
): number {
  const m = PHY_MODES[mode]
  const nsym = Math.floor((durNs - preambleNsFor(mode, giNs)) / symNsFor(mode, giNs))
  const bits = nsym * m.ndbps[mcs] * toneRatio(mode, widthMhz) * nss * ruFraction
  return Math.max(0, Math.floor((bits - 22) / 8))
}

export class WifiMac implements PhyListener {
  private state: MacStateName = 'idle'
  readonly queues: AcQueues
  private edcafs: Edcaf[]
  private navUntil: Ns = 0
  private navClearHandle = 0
  /** Who set the current NAV (a Trigger from that same AP may be answered through it). */
  private navSetBy: string | null = null
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
  /** AP with Active Tx AMP tags: the polling round. */
  readonly ampRound: AmpApRound | null
  /** AP with backscatter tags: the EPC Gen2 inventory the reader runs instead. */
  readonly ampInventory: AmpInventoryRound | null
  /** Whether the next AC_BK TXOP is a poll, and which of the two rounds it runs. */
  private ampPending = false
  private ampNext: AmpApRound | AmpInventoryRound | null = null
  /** Polls taken so far, which is what two tiers sharing one reader alternate on. */
  private ampPolls = 0
  private readonly T: PhyTiming

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
    this.T = cfg.timing ?? OFDM_5G
    this.queues = sharedQueues ?? new AcQueues(cfg.queueLimit)
    this.edcafs = effectiveParams(cfg.edca ? EDCA_PARAMS : [DCF_PARAMS], cfg.tamper).map((params) => ({
      params, cw: params.cwMin, backoff: null, needDraw: false,
      qsrc: 0, ifsHandle: 0, tickHandle: 0,
    }))
    const ampDeps = {
      nodeId, q, now, emit, timing: this.T,
      transmit: (f: FrameDesc) => this.transmitFrame(f, false),
      done: () => this.onAmpDone(),
      bstEnergy: () => this.bstEnergy(),
    }
    // Which tiers exist decides which rounds this MAC owns. An unstated `ampTiers` is Active Tx
    // alone: that is every AMP scenario written before the backscatter tier.
    const tiers = cfg.ampTiers ?? { active: true, backscatter: false }
    this.ampRound = cfg.ampAp && tiers.active ? new AmpApRound(cfg.ampAp, ampDeps) : null
    this.ampInventory = cfg.ampAp?.backscatter && tiers.backscatter
      ? new AmpInventoryRound({ ...cfg.ampAp, backscatter: cfg.ampAp.backscatter }, ampDeps)
      : null
    if (this.ampRound || this.ampInventory) this.scheduleAmpPoll(0)
  }

  /**
   * Energy detection inside the reader's own BST-Excitation: is anything reflecting that this
   * receiver could actually measure?
   *
   * A reader's energy detector sits on the same self-leakage floor as its demodulator, so a
   * reflection below that floor is not energy — it is indistinguishable from the reader's own
   * transmission leaking into its receiver. That distinction is the whole point of the query: a
   * slot two tags answered in is a collision, while a slot whose tag booted and was never heard
   * (the charge power reaches far further than a reflection does) is a slot with no answer in it.
   *
   * It is not addressing. The inventory exists precisely because the reader does not know who is
   * out there; this asks the medium "is any reflection above my floor right now", which is what a
   * real EPC Gen2 reader measures per slot.
   */
  private bstEnergy(): boolean {
    const bs = this.cfg.ampAp?.backscatter
    if (bs === undefined) return false
    const floorDbm = readerFloorDbm(monoLeakDbm(bs.bsDbm))
    return (this.cfg.ampBsTagIds ?? []).some((id) => {
      if (this.ch.currentTx(id) === null) return false
      // The same round trip the channel walks: out at the excitation power, reflected
      // AMP_BS_LOSS_DB down, back over the same path.
      const incidentDbm = this.ch.bsRxDbm(this.nodeId, id, bs.bsDbm)
      const atMeDbm = this.ch.bsRxDbm(id, this.nodeId, incidentDbm - AMP_BS_LOSS_DB)
      return bsDecodes(atMeDbm, floorDbm, bs.ulKbps as AmpBsUlKbps)
    })
  }

  /**
   * Which round the next poll TXOP runs.
   *
   * With one tier of tag on the link there is no choice. With both — Active Tx tags and
   * backscatter tags under one reader — the poll **alternates strictly**: even polls run the
   * Active Tx round, odd polls the RFID inventory. The draft says nothing about sharing a reader
   * between the two tiers, and alternation is the one rule that is fair, deterministic and
   * legible straight off a timeline. `model`
   *
   * The parity counts poll *ticks*, not rounds run: a tick whose TXOP is still queued when the
   * next tick arrives has spent its turn all the same, so under a busy medium two inventories
   * can follow one another.
   */
  private pickAmpRound(): AmpApRound | AmpInventoryRound | null {
    if (this.ampInventory === null) return this.ampRound
    if (this.ampRound === null) return this.ampInventory
    return this.ampPolls++ % 2 === 0 ? this.ampRound : this.ampInventory
  }

  /** The AMP poll clock: every pollIntervalMs the AP wants one AC_BK TXOP for a round. */
  private scheduleAmpPoll(at: Ns): void {
    const cfg = this.cfg.ampAp!
    this.q.schedule(at, () => {
      const round = this.pickAmpRound()
      // A poll of the backscatter tier asks for a *new* inventory, whatever the last one left
      // behind: a new session number is what clears the tags' inventoried flags. A session still
      // owed slots — on the air, or waiting for the TXOP that resumes it — is let finish first;
      // the round itself holds the request until then.
      if (round !== null && round === this.ampInventory) round.newInventory()
      this.ampNext = round
      this.ampPending = true
      this.startAccessAc(this.edcafs[this.efIndex(0)])
      this.scheduleAmpPoll(at + cfg.pollIntervalMs * 1_000_000)
    })
  }

  /** The round is over: close the TXOP and take a post-transmission backoff (§10.23.2.2). */
  private onAmpDone(): void {
    const e = this.edcafs[this.efIndex(0)]
    this.endTxop()
    // An inventory that ran out of TXOP before it ran out of slots asks for another one straight
    // away, with the same session: the tags are holding their counters for it.
    if (this.ampInventory?.resumable) {
      this.ampNext = this.ampInventory
      this.ampPending = true
    }
    e.backoff = null
    // A completed round is a successful exchange sequence: CW and QSRC go back
    // to their minimum, exactly as an acknowledged frame does (§10.23.2.2).
    // Without this, internal collisions with the AP's higher ACs ratchet
    // AC_BK's CW up and nothing ever brings it down.
    this.resetQsrc(e)
    e.needDraw = true
    this.resumeAll()
  }

  get queueDepth(): number {
    return this.queues.depthAll()
  }

  /** A QoS Control field needs a QoS station at both ends (§9.2.4.5). */
  private qosWith(peer: string): boolean {
    return this.cfg.qosWith?.(peer) ?? this.cfg.edca
  }

  /**
   * Whether this link can carry an A-MPDU at all: the peer's negotiated capability and a PHY
   * format that has one.
   *
   * Three sites spelled this out, and the three spellings had drifted — `transmitFor` tested a
   * `mode` local, `planBurstNs` re-read `modeForPeer`, `exchangeNs` folded the MSDU count into
   * the same expression (design 2026-10-07-amsdu §2.2). The count is not part of "can"; it
   * belongs to `psduPlan`, which is why it is not here.
   */
  private canAggregate(peer: string): boolean {
    return this.cfg.ampduWith(peer) && this.cfg.modeForPeer(peer) !== 'nonht'
  }

  /** AC → EDCAF index (legacy has one EDCAF for everything). */
  private efIndex(ac: number): number {
    return this.cfg.edca ? Math.max(0, Math.min(3, ac)) : 0
  }

  enqueue(msdu: Msdu, ac = 1): void {
    const ei = this.efIndex(ac)
    msdu.enqueuedNs = this.now()
    if (!this.queues.enqueue(ei, msdu)) {
      // queue full: the arrival is dropped, never queued (ns-3 DROP_NEWEST)
      // Never queued, so no DEQUEUE and no onDequeue: a saturated source refilling
      // on every drop into a full queue would never stop.
      this.emit({ t: this.now(), type: 'DROP', node: this.nodeId, msduId: msdu.id, reason: 'queueFull', ac: this.cfg.edca ? ei : undefined })
      return
    }
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

  /** Is either AMP round on the air? Both hold the medium on their own timers. */
  private get ampActive(): boolean {
    return (this.ampRound?.active ?? false) || (this.ampInventory?.active ?? false)
  }

  private inExchange(): boolean {
    return this.awaiting !== null || this.muState !== null || this.staMuAwait !== null ||
      this.pendingResp !== null || this.respHandle !== 0 || this.ch.isTransmitting(this.nodeId) ||
      this.ampActive
  }

  /** Destination filter for the shared queue: only peers on this MAC's link. */
  private readonly reach = (dst: string): boolean => this.cfg.reachable?.(dst) ?? true

  private hasWork(e: Edcaf): boolean {
    const idx = this.edcafs.indexOf(e)
    return this.queues.depthFor(idx, this.reach) > 0 || e.needDraw || e.backoff !== null ||
      (this.wantTrigger && idx === this.efIndex(1)) || (this.ampPending && idx === this.efIndex(0))
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
    const aifs = this.cfg.edca ? aifsNs(e.params.aifsn, this.T) : this.T.difsNs
    // §10.23.2.2: after a corrupted frame, EIFS − DIFS + AIFS[AC]
    const dur = this.corruptLast ? this.T.eifsNs - this.T.difsNs + aifs : aifs
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
    if (e.backoff === 0) {
      this.markReady(e)
      return
    }
    // §10.23.2.4: for EDCA the end of AIFS is itself a slot boundary at which
    // the counter decrements (reaching 0 there still waits for the next
    // boundary to transmit). DCF decrements only at the end of each idle slot.
    if (this.cfg.edca) this.decrement(e)
    this.scheduleTick(e)
  }

  private decrement(e: Edcaf): void {
    e.backoff = e.backoff! - 1
    this.emit({ t: this.now(), type: 'BACKOFF_DEC', node: this.nodeId, value: e.backoff, ac: this.acTag(e) })
  }

  private scheduleTick(e: Edcaf): void {
    this.cancelEf(e, 'tick')
    e.tickHandle = this.q.schedule(this.now() + this.T.slotNs, () => {
      e.tickHandle = 0
      this.onSlotTick(e)
    })
    this.refreshState()
  }

  private onSlotTick(e: Edcaf): void {
    if (this.cfg.edca) {
      // a boundary with the counter already at 0 is the one to transmit on
      if (e.backoff === 0) {
        this.markReady(e)
        return
      }
      this.decrement(e)
      this.scheduleTick(e)
      return
    }
    this.decrement(e)
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
    return this.queues.depthFor(idx, this.reach) > 0 || (this.wantTrigger && idx === this.efIndex(1)) ||
      (this.ampPending && idx === this.efIndex(0))
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
    winner.backoff = null
    winner.needDraw = false
    this.transmitFor(winner, false)
    // Losers are penalised only if the winner really started an exchange.
    const winnerSent = this.inExchange()
    for (const i of contending.slice(1)) {
      const loser = this.edcafs[i]
      if (!winnerSent) {
        this.startAccessAc(loser)
        continue
      }
      this.emit({ t, type: 'INTERNAL_COLLISION', node: this.nodeId, winnerAc: winner.params.ac, loserAc: loser.params.ac })
      // 802.11-2020 §10.23.2.12.1: an internal collision is a failed attempt
      // for the lower AC — its frame counts a retry, QSRC and CW move as for
      // an external collision, and a new backoff is drawn.
      const head = this.queues.head(i, this.reach)
      const lost = head ? this.queues.claim(i, head.dst, 1, () => true) : []
      if (lost.length) {
        this.emitRetry(loser, lost)
        this.failMsdus(loser, i, lost)
      }
      this.bumpQsrc(loser)
      loser.backoff = this.rng.int(loser.cw)
      this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: loser.backoff, cw: loser.cw, ac: this.acTag(loser) })
      // no tick: the winner's exchange holds the medium; the loser resumes after it
    }
  }

  // ---------- transmission paths ----------

  /** Discard MSDUs that outlived dot11EDCATableMSDULifetime before building a transmission from this queue. */
  private purgeExpired(e: Edcaf, ei: number): void {
    const t = this.now()
    for (const m of this.queues.purgeExpired(ei, t, this.cfg.msduLifetimeNs ?? DEFAULT_MSDU_LIFETIME_NS)) {
      this.emit({ t, type: 'DROP', node: this.nodeId, msduId: m.id, reason: 'lifetime', ac: this.acTag(e) })
      this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(ei), ac: this.acTag(e) })
      this.hooks.onDequeue?.(m.id, false)
    }
  }

  private transmitFor(e: Edcaf, inTxopBurst: boolean): void {
    const ei = this.edcafs.indexOf(e)
    const t = this.now()
    this.purgeExpired(e, ei)

    // AMP: this AC_BK TXOP is a polling round, not a queued frame. It is one
    // exchange the round itself times out, exempt from the AC's TXOP limit.
    if (this.cfg.isAp && this.ampNext && this.ampPending && ei === this.efIndex(0) && !inTxopBurst) {
      const round = this.ampNext
      this.ampPending = false
      this.ampNext = null
      round.start()
      return
    }

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
    // The rate column this PPDU's guard interval selects (design 2026-10-05-guard-interval
    // §3.6). It travels on to `buildDataFrame` as `FrameDesc.mbps`, so a record cannot say
    // 143.4 Mb/s while its own timeline says 148.8 µs for 1430 octets. `ctrlRespRateForMode`
    // ignores it for every mode but `nonht`, and `nonht` never has a guard interval, so the
    // control-response path below stays on §10.6's non-HT reference rate either way.
    const mbps = mcsRateMbps(mode, mcs, this.frameGiNs(mode) ?? TGI_NS.base)
    const useAmpdu = this.canAggregate(peer)
    // The whole exchange — RTS/CTS if the first PPDU needs it, the PPDU, SIFS
    // and its ACK/BlockAck — must end inside the TXOP (§10.23.2.9). The head
    // MSDU alone may always start a TXOP (AcQueues.claim).
    const txopEnd = inTxopBurst && this.txopEndNs > 0
      ? this.txopEndNs
      : this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0 ? t + e.params.txopLimitNs : Infinity
    const burstProtection = !inTxopBurst && (this.cfg.txopProtection ?? 'single') !== 'single' &&
      this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0
    const msdus = this.queues.claim(ei, peer, useAmpdu ? MAX_AMPDU_MPDUS : 1, (m, claimed) => {
      const x = this.exchangeNs(peer, [...claimed.map((c) => c.bytes), m.bytes], !inTxopBurst, burstProtection)
      return x.dataNs <= MAX_PPDU_NS && t + x.totalNs <= txopEnd
    })
    if (!msdus.length) {
      this.endTxop()
      this.refreshState()
      return
    }

    const plan = psduPlan(msdus.map((m) => m.bytes), { qos: this.qosWith(peer), ampdu: useAmpdu, mode })
    const aggregate = plan.aggregate
    const psdu = plan.psduBytes
    const respTime = this.airNs(plan.respBytes, ctrlRespRateForMode(mode, mcs, mbps))

    const prot = this.cfg.txopProtection ?? 'single'
    const txopCapable = this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0
    // Boundary / multiple protection: when the queue holds a multi-exchange
    // burst, open the TXOP with an RTS/CTS whose Duration reaches the end of
    // the TXOP (§9.2.5.2, "time remaining in the TXOP"); a burst that finishes
    // early gives the rest back with CF-End (§10.23.2.9).
    const dataTime = this.airModeNs(mode, psdu, mcs, { widthMhz: width, nss })
    const rtsRate = ctrlRespRateForMode(mode, mcs, mbps)
    const ctsTime = this.airNs(CTS_BYTES, ctrlRespRateFor(rtsRate))
    const rtsTime = this.airNs(RTS_BYTES, rtsRate)
    let burstRestNs = 0
    if (!inTxopBurst && prot !== 'single' && txopCapable) {
      const txopEnd = t + e.params.txopLimitNs
      const firstEnd = t + rtsTime + 3 * this.T.sifsNs + ctsTime + dataTime + respTime
      burstRestNs = this.planBurstNs(ei, firstEnd, txopEnd)
    }
    const protectBurst = burstRestNs > 0

    if ((psdu > this.cfg.rtsThresholdBytes || protectBurst) && !inTxopBurst) {
      // RTS/CTS protection first (§10.3.2.9).
      const announcedEnd = protectBurst ? t + e.params.txopLimitNs : 0
      const rts: FrameDesc = {
        kind: 'rts', src: this.nodeId, dst: peer, bytes: RTS_BYTES, mbps: rtsRate,
        durationFieldNs: this.inflate(protectBurst ? announcedEnd - (t + rtsTime) : 3 * this.T.sifsNs + ctsTime + dataTime + respTime),
        txTimeNs: rtsTime, ac: this.acTag(e),
      }
      this.awaiting = { kind: 'cts', ac: ei, peer, msdus, wasRts: true, aggBytes: psdu, aggregate }
      this.beginTxop(e, t)
      this.announcedEndNs = announcedEnd
      this.transmitFrame(rts, true)
      return
    }

    const frame = this.buildDataFrame(e, peer, msdus, psdu, mode, mcs, mbps, aggregate, respTime, width, nss)
    this.awaiting = { kind: aggregate ? 'ba' : 'ack', ac: ei, peer, msdus, wasRts: false, aggBytes: psdu, aggregate }
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
    const queue = this.queues.peek(ei).filter((m) => this.reach(m.dst))
    let t = fromNs
    let i = 0
    while (i < queue.length) {
      const peer = queue[i].dst
      // continueOrRelease's fit check: the next exchange must end inside the TXOP
      if (t + this.T.sifsNs + this.exchangeNs(peer, [queue[i].bytes], false).totalNs > txopEndNs) break
      const useAmpdu = this.canAggregate(peer)
      const bytes: number[] = [queue[i].bytes]
      let j = i + 1
      while (useAmpdu && j < queue.length && queue[j].dst === peer && bytes.length < MAX_AMPDU_MPDUS) {
        const x = this.exchangeNs(peer, [...bytes, queue[j].bytes], false)
        if (x.dataNs > MAX_PPDU_NS || t + this.T.sifsNs + x.totalNs > txopEndNs) break
        bytes.push(queue[j].bytes)
        j++
      }
      t += this.T.sifsNs + this.exchangeNs(peer, bytes, false).totalNs
      i = j
    }
    return Math.max(0, t - fromNs)
  }

  /** TXTIME of a non-HT PPDU on this link, including the signal extension (§10.3.8). */
  private airNs(bytes: number, mbps: number): Ns {
    return txTimeNs(bytes, mbps) + this.T.signalExtNs
  }

  /**
   * TXTIME of a VHT/HE/EHT (or non-HT) PPDU on this link, including the signal extension.
   *
   * **This is the ONE place the scenario's guard interval enters the airtime arithmetic**, and
   * that is the whole design rather than a convenience. There are five call sites of this method
   * and every one of them feeds either a PPDU's own `txTimeNs` or a Duration field that has to
   * cover it; miss any single one and the Duration comes out shorter than the stretch of medium
   * it is reserving. "Scan an interface's callers, not the task's file list" has a better form
   * here than diligence — give the callers no chance to be missed.
   *
   * `opts` spreads LAST, so a caller that passes an explicit `giNs` still wins.
   */
  private airModeNs(mode: PhyMode, bytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
    return txTimeModeNs(mode, bytes, mcs, { giNs: this.cfg.giNs?.(), ...opts }) + this.T.signalExtNs
  }

  /**
   * The guard interval this PPDU records — absent at the base GI and on every pre-HE format.
   *
   * Absent rather than 800 for the reason `FrameDesc.giNs` gives: the absence has to be readable
   * as "take the old path", and it keeps every published lesson's records character-for-character
   * unchanged. Pre-HE formats never carry it because clause 19's and clause 21's GI_TYPE is a
   * different enumeration altogether (LONG_GI / SHORT_GI), not a narrower version of these three.
   */
  private frameGiNs(mode: PhyMode): Ns | undefined {
    const gi = this.cfg.giNs?.()
    if (gi === undefined || gi === TGI_NS.base || !GI_MODES.includes(mode)) return undefined
    return gi
  }

  /**
   * Airtime of one exchange with a peer carrying these MSDUs: [RTS + SIFS +
   * CTS + SIFS when protected] + PPDU + SIFS + ACK or BlockAck. Protection
   * applies to a TXOP's first PPDU above the RTS threshold, or always when the
   * burst is protected at its boundary.
   */
  private exchangeNs(peer: string, msduBytes: number[], firstInTxop: boolean, burstProtection = false): { dataNs: Ns; totalNs: Ns } {
    const mode = this.cfg.modeForPeer(peer)
    const mcs = this.cfg.mcsForPeer(peer)
    // Deliberately the base column, and deliberately NOT `frameGiNs`: this local never reaches a
    // record. Its only use is `ctrlRespRateForMode` three lines down, which for he/eht reads
    // `NONHT_REF_MBPS` and ignores this argument, and for `nonht` there is no guard interval to
    // read. Passing a repriced rate here would be a change that provably does nothing.
    const mbps = mcsRateMbps(mode, mcs)
    const plan = psduPlan(msduBytes, { qos: this.qosWith(peer), ampdu: this.canAggregate(peer), mode })
    const psdu = plan.psduBytes
    const dataNs = this.airModeNs(mode, psdu, mcs, { widthMhz: this.cfg.widthForPeer(peer), nss: this.cfg.nssForPeer(peer) })
    const respRate = ctrlRespRateForMode(mode, mcs, mbps)
    let totalNs = dataNs + this.T.sifsNs + this.airNs(plan.respBytes, respRate)
    if (firstInTxop && (burstProtection || psdu > this.cfg.rtsThresholdBytes)) {
      totalNs += this.airNs(RTS_BYTES, respRate) + this.T.sifsNs + this.airNs(CTS_BYTES, ctrlRespRateFor(respRate)) + this.T.sifsNs
    }
    return { dataNs, totalNs }
  }

  private buildDataFrame(
    e: Edcaf, peer: string, msdus: Msdu[], psdu: number,
    mode: PhyMode, mcs: number, mbps: number, aggregate: boolean, respTime: Ns,
    widthMhz: number, nss: number,
  ): FrameDesc {
    this.assignSeq(peer, this.edcafs.indexOf(e), msdus)
    const seqNo = msdus[0].seqNo!
    const txTime = this.airModeNs(mode, psdu, mcs, { widthMhz, nss })
    // §9.2.4.1.6: Retry marks a retransmission of this MPDU. A failed RTS
    // counts a retry for the MSDU but never put it on the air, so the flag
    // follows "has been transmitted", not the retry counter.
    const retryFlag = msdus.some((m) => m.sent)
    for (const m of msdus) m.sent = true
    // §9.2.5.2 multiple protection: the data frame carries the TXOP remainder.
    const remainder = this.announcedEndNs - (this.now() + txTime)
    const duration = this.cfg.txopProtection === 'multiple' && remainder > this.T.sifsNs + respTime
      ? remainder
      : this.T.sifsNs + respTime
    return {
      kind: 'data', src: this.nodeId, dst: peer, bytes: psdu, mbps,
      durationFieldNs: this.inflate(duration),
      txTimeNs: txTime,
      seqNo, retryFlag, msduId: msdus[0].id,
      qos: aggregate || this.qosWith(peer),
      mode, mcs, widthMhz, ac: this.acTag(e),
      giNs: this.frameGiNs(mode),
      msduBytes: msdus.map((m) => m.bytes),
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
    const durCap = this.muDurCap(e, inTxopBurst)

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

    const built = this.buildMuParts(ei, useMumimo ? mumimoGroup : dsts, useMumimo, durCap, e.params.ac)
    const { parts, claims, ppduDur, modeAll, width } = built
    if (parts.length < 2) {
      for (const c of claims) this.queues.restore(ei, c.msdus)
      this.transmitSuFallback(e, inTxopBurst)
      return
    }
    const baTime = this.airNs(BA_BYTES, 24)
    const frame: FrameDesc = {
      kind: 'data', src: this.nodeId, dst: '*mu', bytes: parts.reduce((s, p) => s + p.bytes, 0),
      mbps: parts[0].mbps, durationFieldNs: this.T.sifsNs + baTime,
      txTimeNs: ppduDur, mode: modeAll, mcs: parts[0].mcs, widthMhz: width, ac: this.acTag(e),
      giNs: this.frameGiNs(modeAll),
      muParts: parts, orthogonalGroup: gid, muKind: useMumimo ? 'mumimo' : 'ofdma',
    }
    if (!inTxopBurst) this.beginTxop(e, t)
    // Only now, with the PPDU going out, have these MSDUs been on the air; a
    // group that fell apart above restored its claims untouched.
    for (const c of claims) for (const m of c.msdus) m.sent = true
    const mu: MuDlState = { kind: 'dl', gid, ac: ei, parts: claims, successes: new Set(), resolveHandle: 0 }
    this.muState = mu
    this.transmitFrame(frame, false)
    mu.resolveHandle = this.q.schedule(t + ppduDur + this.T.sifsNs + baTime + this.T.ackTimeoutNs, () => this.resolveDlMu())
  }

  /** Longest DL MU PPDU allowed now: aPPDUMaxTime, and inside the TXOP with room for SIFS + the BlockAcks. */
  private muDurCap(e: Edcaf, inTxopBurst: boolean): Ns {
    const t = this.now()
    const end = inTxopBurst && this.txopEndNs > 0
      ? this.txopEndNs
      : this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0 ? t + e.params.txopLimitNs : Infinity
    return Math.min(MAX_PPDU_NS, end - t - this.T.sifsNs - this.airNs(BA_BYTES, 24))
  }

  /**
   * Build the members of a DL MU PPDU. OFDMA: each member gets 1/n of the
   * channel. MU-MIMO: each gets the full width at its own stream count.
   * 802.11be: the PPDU runs the OLDEST format any member's link runs (`lowestMode`), and a
   * member whose own link is denser is re-expressed in that format by required SINR
   * (`mcsInMode`) rather than clamped to a literal index. For an all-HE-or-EHT round that is
   * the old rule word for word — EHT only if every member is EHT, otherwise HE with EHT members
   * at HE-MCS ≤ 11, because 4096-QAM does not exist in HE. Members are filled up to the
   * duration cap.
   */
  private buildMuParts(ei: number, dsts: string[], mumimo: boolean, durCap: Ns, ac: number): {
    parts: MuPart[]; claims: { peer: string; msdus: Msdu[] }[]; ppduDur: Ns; modeAll: PhyMode; width: number
  } {
    const parts: MuPart[] = []
    const claims: { peer: string; msdus: Msdu[] }[] = []
    const frac = mumimo ? 1 : 1 / dsts.length
    const modeAll: PhyMode = lowestMode(dsts.map((d) => this.cfg.modeForPeer(d)))
    // The DL MU PPDU spans the whole operating channel: it runs at the
    // narrowest width any member negotiated. Stream count stays per member.
    const muWidth = Math.min(...dsts.map((d) => this.cfg.widthForPeer(d)))
    let ppduDur = 0
    for (const peer of dsts) {
      const mcs = mcsInMode(this.cfg.modeForPeer(peer), this.cfg.mcsForPeer(peer), modeAll)
      const nss = this.cfg.nssForPeer(peer)
      const opts = mumimo ? { mu: true, widthMhz: muWidth, nss } : { mu: true, ruFraction: frac, widthMhz: muWidth, nss }
      const airtime = (bytes: number[]) => this.airModeNs(modeAll, psduPlan(bytes, { mu: true }).psduBytes, mcs, opts)
      if (airtime([this.queues.headBytes(ei, peer) ?? 0]) > durCap) continue
      const msdus = this.queues.claim(ei, peer, MAX_AMPDU_MPDUS, (m, claimed) =>
        airtime([...claimed.map((x) => x.bytes), m.bytes]) <= durCap)
      if (!msdus.length) continue
      const bytes = psduPlan(msdus.map((m) => m.bytes), { mu: true }).psduBytes
      parts.push({
        dst: peer, src: this.nodeId, bytes, mcs, mbps: mcsRateMbps(modeAll, mcs, this.frameGiNs(modeAll) ?? TGI_NS.base),
        msduIds: msdus.map((m) => m.id), msduBytes: msdus.map((m) => m.bytes), mpduCount: msdus.length, ac,
        retryFlag: msdus.some((m) => m.sent),
        ...(mumimo ? { nss } : { ruFraction: frac }),
      })
      claims.push({ peer, msdus })
      ppduDur = Math.max(ppduDur, airtime(msdus.map((m) => m.bytes)))
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
    const failed: Msdu[] = []
    for (const c of mu.parts) {
      const ok = mu.successes.has(c.peer)
      this.cfg.onTxOutcome?.(c.peer, ok)
      if (!ok) {
        failed.push(...c.msdus)
        continue
      }
      for (const m of c.msdus) {
        this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(mu.ac), ac: this.acTag(e) })
        this.hooks.onDequeue?.(m.id, true)
      }
    }
    if (mu.successes.size === 0) {
      this.failAttemptCore(e, mu.ac, failed)
      return
    }
    // 802.11ax: the DL MU exchange succeeded if any user acknowledged. The
    // others' MPDUs count a retry and are sent again; the EDCAF is not
    // penalised and the TXOP may continue.
    if (failed.length) {
      this.emitRetry(e, failed, 0)
      this.failMsdus(e, mu.ac, failed)
    }
    this.resetQsrc(e)
    this.continueOrRelease(e)
  }

  private transmitTrigger(e: Edcaf, users: { peer: string; ac: number; bytes: number }[]): void {
    const t = this.now()
    const gid = `mu${this.nodeId}:${this.muGidCounter++}`
    const frac = 1 / users.length
    let ulDur = 0
    // Same as the DL MU PPDU: the trigger schedules the TB PPDUs at the
    // narrowest width any invited user negotiated; Nss stays per user.
    const ulWidth = Math.min(...users.map((u) => this.cfg.widthForPeer(u.peer)))
    // One PPDU format for the whole triggered round, exactly as for a DL MU
    // PPDU: the oldest format any invited user's link runs, with each user's
    // rung re-expressed in it by required SINR. For an all-HE-or-EHT round that
    // is the old rule unchanged — EHT only if every user is EHT, otherwise HE
    // with each user's MCS at 11 or below (HE has no 4096-QAM).
    const mode: PhyMode = lowestMode(users.map((u) => this.cfg.modeForPeer(u.peer)))
    const parts: MuPart[] = users.map((u) => {
      const mcs = mcsInMode(this.cfg.modeForPeer(u.peer), this.cfg.mcsForPeer(u.peer), mode)
      const nss = this.cfg.nssForPeer(u.peer)
      const need = this.airModeNs(
        mode,
        Math.max(64, Math.min(u.bytes + 64, maxPsduBytesFor(mode, mcs, frac, 2_000_000 - this.T.signalExtNs, ulWidth, nss, this.cfg.giNs?.()))),
        mcs,
        { ruFraction: frac, widthMhz: ulWidth, nss },
      )
      ulDur = Math.max(ulDur, Math.min(need, 2_000_000))
      return {
        dst: u.peer, src: this.nodeId, bytes: 0, mcs, mbps: mcsRateMbps(mode, mcs, this.frameGiNs(mode) ?? TGI_NS.base),
        msduIds: [], mpduCount: 0, ac: u.ac,
      }
    })
    for (const p of parts) p.durNs = ulDur
    const mbaTime = this.airNs(multiStaBaBytes(users.length), 24)
    const tb = triggerBytes(users.length)
    const trigger: FrameDesc = {
      kind: 'trigger', src: this.nodeId, dst: '*mu', bytes: tb, mbps: 24,
      durationFieldNs: this.T.sifsNs + ulDur + this.T.sifsNs + mbaTime,
      txTimeNs: this.airNs(tb, 24), muParts: parts, orthogonalGroup: gid, ac: this.acTag(e),
      // The Trigger goes out as a non-HT frame; these are the format and the
      // bandwidth it dictates for the TB PPDUs it solicits (§9.3.1.22.1).
      ulMode: mode, ulWidthMhz: ulWidth,
    }
    this.wantTrigger = false
    const mu: MuUlState = { kind: 'ul', gid, ac: this.edcafs.indexOf(e), users: users.map((u) => u.peer), received: new Map(), mbaHandle: 0, rxTimeoutHandle: 0 }
    this.muState = mu
    this.transmitFrame(trigger, false)
    mu.mbaHandle = this.q.schedule(t + trigger.txTimeNs + this.T.sifsNs + ulDur + this.T.sifsNs, () => this.sendMba())
    // §10.3.2.9: a Trigger expects a response like any other frame. If no
    // triggered PPDU has started within SIFS + slot + RxPHYStartDelay of the
    // trigger's end, the round failed — do not sit out the whole 2 ms window.
    mu.rxTimeoutHandle = this.q.schedule(t + trigger.txTimeNs + this.T.ackTimeoutNs, () => this.onTriggerRespTimeout(mu))
  }

  private onTriggerRespTimeout(mu: MuUlState): void {
    mu.rxTimeoutHandle = 0
    if (this.muState !== mu || mu.received.size > 0) return
    const t = this.now()
    this.q.cancel(mu.mbaHandle)
    mu.mbaHandle = 0
    this.muState = null
    this.emit({ t, type: 'ACK_TIMEOUT', node: this.nodeId })
    this.lastBusyEndNs = Math.max(this.lastBusyEndNs, t)
    // Retry accounting for the trigger itself. It carries no MSDUs of ours, so
    // only QSRC and CW move.
    const e = this.edcafs[mu.ac]
    this.bumpQsrc(e)
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
      durationFieldNs: 0, txTimeNs: this.airNs(bytes, 24),
      muParts: acked.map((peer) => ({ dst: peer, src: this.nodeId, bytes: 0, mcs: 0, mbps: 24, msduIds: [], mpduCount: 0 })),
    }
    this.transmitFrame(mba, false)
  }

  // ---------- exchange mechanics ----------

  private transmitFrame(frame: FrameDesc, expectResponse: boolean): void {
    this.corruptLast = false // EIFS ends when the station itself transmits
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
    if (this.ampActive) {
      // An AMP round runs on its own timers too; the AP holds the medium
      // between its trigger, the tags' slots and each slot's Ack — or, for an
      // inventory, between each command and the answer inside its excitation.
      this.setState('waitAck')
      return
    }
    if (expectResponse && this.awaiting) {
      this.setState(this.awaiting.kind === 'cts' ? 'waitCts' : 'waitAck')
      this.lastRxStartNs = NEVER
      const to = this.T.ackTimeoutNs
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
    this.lastBusyEndNs = Math.max(this.lastBusyEndNs, t) // the retry's IFS counts from the timeout's end
    this.failAttempt()
  }

  private failAttempt(): void {
    const aw = this.awaiting
    if (!aw) return
    this.cancel('timeout')
    this.awaiting = null
    this.cfg.onTxOutcome?.(aw.peer, false)
    this.failAttemptCore(this.edcafs[aw.ac], aw.ac, aw.msdus)
  }

  /** §10.23.2.2: one failed attempt — QSRC++ and CW doubles; at the retry limit CW resets. */
  private bumpQsrc(e: Edcaf): void {
    e.qsrc++
    if (e.qsrc >= SHORT_RETRY_LIMIT) {
      e.qsrc = 0
      e.cw = e.params.cwMin
    } else {
      e.cw = Math.min(2 * e.cw + 1, e.params.cwMax)
    }
    this.emit({ t: this.now(), type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, qsrc: e.qsrc, ac: this.acTag(e) })
  }

  private resetQsrc(e: Edcaf): void {
    e.qsrc = 0
    e.cw = e.params.cwMin
    this.emit({ t: this.now(), type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, qsrc: e.qsrc, ac: this.acTag(e) })
  }

  /** §10.3.2.14: an MSDU gets its sequence number on its first transmission and keeps it on every retry. */
  private assignSeq(peer: string, ei: number, msdus: Msdu[]): void {
    for (const m of msdus) {
      if (m.seqNo === undefined) m.seqNo = this.queues.nextSeq(peer, ei)
    }
  }

  /**
   * 802.11-2020: every MSDU of a failed attempt counts one retry; those that
   * reach dot11ShortRetryLimit are discarded, the rest go back to the queue head.
   * Only these MSDUs are touched — never frames that were not in the attempt.
   */
  private failMsdus(e: Edcaf, ei: number, msdus: Msdu[]): void {
    const t = this.now()
    const keep: Msdu[] = []
    for (const m of msdus) {
      m.retries = (m.retries ?? 0) + 1
      if (m.retries >= SHORT_RETRY_LIMIT) {
        this.emit({ t, type: 'DROP', node: this.nodeId, msduId: m.id, reason: 'retryLimit', ac: this.acTag(e) })
        this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(ei), ac: this.acTag(e) })
        this.hooks.onDequeue?.(m.id, false)
      } else {
        keep.push(m)
      }
    }
    if (keep.length) this.queues.restore(ei, keep)
  }

  /** RETRY record for a failed attempt; qsrc defaults to the value the attempt's failure brings QSRC to. */
  private emitRetry(e: Edcaf, msdus: Msdu[], qsrc = e.qsrc + 1): void {
    this.emit({
      t: this.now(), type: 'RETRY', node: this.nodeId, msduId: msdus[0]?.id ?? 0,
      retries: msdus.reduce((mx, m) => Math.max(mx, (m.retries ?? 0) + 1), 0),
      qsrc, ac: this.acTag(e),
    })
  }

  /** Close a failed attempt: RETRY record, per-MSDU accounting, QSRC/CW, end TXOP, new backoff. */
  private failAttemptCore(e: Edcaf, ei: number, msdus: Msdu[]): void {
    this.emitRetry(e, msdus)
    this.failMsdus(e, ei, msdus)
    this.bumpQsrc(e)
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
    this.resetQsrc(e)
    for (const m of aw.msdus) {
      this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(aw.ac), ac: this.acTag(e) })
      this.hooks.onDequeue?.(m.id, true)
    }
    this.continueOrRelease(e)
  }

  /** TXOP continuation or post-TX backoff. */
  private continueOrRelease(e: Edcaf): void {
    const t = this.now()
    const ei = this.edcafs.indexOf(e)
    if (this.txopEndNs > 0 && this.txopAc === ei && this.queues.depthFor(ei, this.reach) > 0) {
      const head = this.queues.head(ei, this.reach)!
      const need = this.T.sifsNs + this.exchangeNs(head.dst, [head.bytes], false).totalNs
      if (t + need <= this.txopEndNs) {
        this.setState('sifsResp')
        this.respHandle = this.q.schedule(t + this.T.sifsNs, () => {
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
    const cfTime = this.airNs(CF_END_BYTES, 24)
    if (announced > t + this.T.sifsNs + cfTime + this.T.slotNs) {
      this.scheduleResponse(t, this.cfEndFrame())
      return
    }
    this.resumeAll()
  }

  private cfEndFrame(): FrameDesc {
    return {
      kind: 'cfend', src: this.nodeId, dst: '*', bytes: CF_END_BYTES, mbps: 24,
      durationFieldNs: 0, txTimeNs: this.airNs(CF_END_BYTES, 24),
    }
  }

  /** §10.23.2.9: a decoded CF-End resets the NAV; the AP repeats a non-AP holder's CF-End. */
  private onCfEnd(t: Ns, from: string): void {
    if (this.navUntil > t) {
      this.navUntil = 0
      this.navSetBy = null
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
    this.corruptLast = false // a new reception decides afresh whether EIFS applies
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
    // onRxStart held our ACK/CTS timeout for this reception (§10.3.2.9). An AMP
    // frame is never the response we awaited, so the attempt must be failed
    // here — before the AMP-only branches return — or the MAC would sit in
    // waitCts/waitAck forever with no timer left to wake it.
    if (frame.kind === 'ampResp' || frame.kind === 'ampTrigger' || frame.kind === 'ampAck'
      || frame.kind === 'ampRfid' || frame.kind === 'ampBsReply') {
      if (this.awaiting !== null) this.failAttempt()
      if (frame.kind === 'ampResp') {
        // A tag's slotted response: only the round cares, and it never answers
        // one frame at a time (the slot's Ack closes it).
        this.ampRound?.onRxOk(frame, from)
      }
      if (frame.kind === 'ampBsReply') {
        // A backscattered reflection, heard inside the reader's own excitation. Like an AMP
        // response it is never answered frame by frame: the next command is the acknowledgement.
        this.ampInventory?.onRxOk(frame, from)
      }
      // A Wi-Fi station overhearing an AMP DL PPDU has nothing to answer and no
      // Duration to take a NAV from; `corruptLast` was already cleared above.
      return
    }
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

  onRxCorrupt(t: Ns): void {
    // An empty or collided AMP slot is not a reason to arm EIFS: the AP owns
    // the medium until the round's last Ack and answers on AMP SIFS.
    if (!this.ampActive) this.corruptLast = true
    // A reflection that did not decode is the inventory's business — but only a reflection.
    // Anything corrupted in one of the 16 µs turnaround gaps between commands is a Wi-Fi frame
    // talking over the reader, not a tag answering, and must not turn an empty slot into a
    // collision. The BST window is the test: it is the only place a reply can exist at all.
    if (this.ch.bstOpenAt(this.nodeId, t)) this.ampInventory?.onRxFail()
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
            durationFieldNs: 0, txTimeNs: this.airNs(BA_BYTES, 24), orthogonalGroup: frame.orthogonalGroup,
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
        const rate = ctrlRespRateForMode(frame.mode ?? 'nonht', frame.mcs ?? 0, frame.mbps)
        const respBytes = isBa ? BA_BYTES : ACK_BYTES
        this.scheduleResponse(t, {
          kind: isBa ? 'ba' : 'ack', src: this.nodeId, dst: from, bytes: respBytes,
          mbps: rate, durationFieldNs: 0, txTimeNs: this.airNs(respBytes, rate),
        })
        break
      }
      case 'trigger': {
        if (!myPart) break
        // CS Required: answer only if the NAV is idle — a NAV set by the
        // triggering AP itself does not count. A third party's NAV stays.
        if (this.now() < this.navUntil && this.navSetBy !== from) break
        this.respondToTrigger(t, frame, myPart)
        break
      }
      case 'mba': {
        if (!this.staMuAwait) break
        const listed = frame.muParts?.some((p) => p.dst === this.nodeId) === true
        const st = this.staMuAwait
        this.staMuAwait = null
        this.q.cancel(st.timeoutHandle)
        this.closeTbPpdu(st, listed)
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
        const ctsTime = this.airNs(CTS_BYTES, ctsRate)
        this.scheduleResponse(t, {
          kind: 'cts', src: this.nodeId, dst: from, bytes: CTS_BYTES, mbps: ctsRate,
          durationFieldNs: Math.max(0, frame.durationFieldNs - this.T.sifsNs - ctsTime),
          txTimeNs: ctsTime,
        })
        break
      }
      case 'cts': {
        if (this.awaiting?.kind === 'cts') {
          this.cancel('timeout')
          const aw = this.awaiting
          // CTS received: QSRC resets (the MSDUs keep their retry counts). CW is
          // unchanged, but the record carries the counter the inspector shows.
          this.edcafs[aw.ac].qsrc = 0
          this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: this.edcafs[aw.ac].cw, qsrc: 0, ac: this.acTag(this.edcafs[aw.ac]) })
          this.setState('sifsResp')
          this.respHandle = this.q.schedule(t + this.T.sifsNs, () => {
            this.respHandle = 0
            const e = this.edcafs[aw.ac]
            const mode = this.cfg.modeForPeer(aw.peer)
            const mcs = this.cfg.mcsForPeer(aw.peer)
            const width = this.cfg.widthForPeer(aw.peer)
            const nss = this.cfg.nssForPeer(aw.peer)
            // Same reasoning as in `transmitFor`: this one reaches `FrameDesc.mbps`.
            const mbps = mcsRateMbps(mode, mcs, this.frameGiNs(mode) ?? TGI_NS.base)
            const aggregate = aw.aggregate
            const respTime = this.airNs(aggregate ? BA_BYTES : ACK_BYTES, ctrlRespRateForMode(mode, mcs, mbps))
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
    this.respHandle = this.q.schedule(t + this.T.sifsNs, () => {
      this.respHandle = 0
      this.purgeExpired(e, ac)
      const n = trigger.muParts!.length
      const frac = 1 / n
      // Which of the solicited resource units this station answers in. The Trigger assigns it
      // per user (§9.3.1.22.1's RU Allocation subfield of the User Info field, sized and placed
      // against that clause's Common Info UL BW subfield).
      //
      // Found by address rather than by `indexOf(part)`: `part` is the entry the dispatcher
      // picked out of this very array, so reference equality holds today, but it holds only as
      // long as nothing ever copies a `FrameDesc` on its way in. A copy would make `indexOf`
      // return −1, and the −1 would not surface here — it would surface inside the fading path,
      // as a `RangeError` from building a run of −1 bins, and only in scenarios that have
      // `selectivity` on. Matching on `dst` is what the tests already do, and it costs nothing.
      const partIdx = trigger.muParts!.findIndex((p) => p.dst === this.nodeId)
      // The Trigger dictates the TB PPDU's format, not the station's own capability.
      const mode = trigger.ulMode ?? this.cfg.modeForPeer(trigger.src)
      const mcs = part.mcs
      // UL BW comes from the Trigger's Common Info, not from this station's own link.
      const width = trigger.ulWidthMhz ?? this.cfg.widthForPeer(trigger.src)
      const nss = this.cfg.nssForPeer(trigger.src)
      const budget = maxPsduBytesFor(mode, mcs, frac, dur - this.T.signalExtNs, width, nss, this.cfg.giNs?.())
      const msdus = this.queues.claim(ac, null, MAX_AMPDU_MPDUS, (m, claimed) =>
        psduPlan([...claimed.map((x) => x.bytes), m.bytes], { mu: true }).psduBytes <= budget)
      if (!msdus.length) {
        this.resumeAll()
        return
      }
      const bytes = psduPlan(msdus.map((m) => m.bytes), { mu: true }).psduBytes
      const frame: FrameDesc = {
        kind: 'data', src: this.nodeId, dst: trigger.src, bytes, mbps: mcsRateMbps(mode, mcs, this.frameGiNs(mode) ?? TGI_NS.base),
        durationFieldNs: 0, txTimeNs: dur, // padded to the trigger's target duration
        seqNo: (this.assignSeq(trigger.src, ac, msdus), msdus[0].seqNo), mode, mcs, widthMhz: width, ac: this.acTag(e),
        giNs: this.frameGiNs(mode),
        retryFlag: msdus.some((m) => m.sent),
        msduBytes: msdus.map((m) => m.bytes),
        ampdu: { mpduCount: msdus.length, msduIds: msdus.map((m) => m.id) },
        orthogonalGroup: trigger.orthogonalGroup,
        // The resource unit this answer occupies, carried on the answer itself: `widthMhz`
        // above is the *solicited* width (Common Info UL BW), which is wider than the slice
        // this station actually transmits in whenever the round has more than one user. Until
        // this slice, `frac` was spent on the byte budget just above and then dropped, so a
        // triggered reception was credited with the frequency diversity of the whole channel
        // (design 2026-10-04 §4). `frac` is deliberately the same local the budget used, and
        // the two travel as one object so that a share can never arrive without its position.
        ru: { fraction: frac, partIdx },
      }
      for (const m of msdus) m.sent = true
      const mbaTime = this.airNs(multiStaBaBytes(n), 24)
      this.staMuAwait = {
        ac, msdus,
        timeoutHandle: this.q.schedule(t + this.T.sifsNs + dur + this.T.sifsNs + mbaTime + this.T.ackTimeoutNs, () => {
          const st = this.staMuAwait
          if (!st) return
          this.staMuAwait = null
          this.closeTbPpdu(st, false)
        }),
      }
      this.transmitFrame(frame, false)
    })
  }

  /**
   * After a TB PPDU: acknowledged MSDUs leave the queue, the others count a
   * retry. 802.11ax §26.5.2.3: the EDCAF then resumes its backoff without
   * changing CW or the backoff counter, acknowledged or not.
   */
  private closeTbPpdu(st: StaMuAwait, acked: boolean): void {
    const t = this.now()
    const e = this.edcafs[st.ac]
    if (acked) {
      for (const m of st.msdus) {
        this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(st.ac), ac: this.acTag(e) })
        this.hooks.onDequeue?.(m.id, true)
      }
    } else {
      this.emitRetry(e, st.msdus, e.qsrc)
      this.failMsdus(e, st.ac, st.msdus)
    }
    this.resumeAll()
  }

  private scheduleResponse(t: Ns, resp: FrameDesc): void {
    // Inside an AMP round the AP owns the medium and its radio is committed to
    // the round's own SIFS schedule (the next slot's Ack): a Wi-Fi frame that
    // talked over a slot gets no response and is retried by its sender.
    if (this.ampActive) return
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
    this.respHandle = this.q.schedule(t + this.T.sifsNs, () => {
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
    this.navSetBy = from
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
      const ctsTime = this.airNs(CTS_BYTES, ctrlRespRateFor(frame.mbps))
      this.q.schedule(t + 2 * this.T.sifsNs + ctsTime + this.T.rxStartDelayNs + 2 * this.T.slotNs, () => {
        if (this.navFromRtsAt === setAt && this.lastRxStartNs <= setAt && this.navUntil > this.now()) {
          this.navUntil = 0
          this.navSetBy = null
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
    this.navSetBy = null
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
    else if (this.awaiting || this.staMuAwait || this.muState || this.ampActive) s = 'waitAck'
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
