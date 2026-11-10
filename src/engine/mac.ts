/**
 * Wi-Fi MAC per IEEE Std 802.11-2024, feature-configurable per node:
 *  - DCF (§10.3): CS + NAV, DIFS/EIFS, binary-exponential backoff,
 *    freeze/resume, post-TX backoff, 802.11-2020 retries (per-MSDU count + QSRC), ACK, RTS/CTS.
 *  - EDCA (§10.23): four EDCAFs with AIFS/CWmin/CWmax per Table 9-194 at a non-AP STA and
 *    per the dot11QAPEDCATable defaults at the AP (§10.2.3.2), internal-collision arbitration
 *    (higher AC wins; the loser's QSRC/CW move as for a failure, §10.23.2.2 d), and the MSDUs
 *    involved count a retry, §10.23.2.12.1).
 *  - TXOP bursting: SIFS-separated exchanges until the AC's TXOP limit.
 *  - A-MPDU + BlockAck: aggregated PPDUs acknowledged by a single BA whose bitmap reports each
 *    MPDU; only the unacknowledged ones are sent again (§10.12, §10.25).
 *  - OFDMA (HE/EHT): AP-scheduled DL MU PPDUs whose MPDUs carry a TRS Control subfield, answered
 *    by each member's BlockAck in an HE/EHT TB PPDU (§10.3.2.13.2), and
 *    Trigger-based UL MU with Multi-STA BlockAck (RU model: 1/n rate scaling,
 *    orthogonal groups on the channel).
 * Legacy nodes run a single pseudo-EDCAF with DIFS parameters (exact v1 DCF).
 */
import type { BaInfo, FrameDesc, MpduHdr, MuPart } from '../model/frames'
import { TID_FOR_AC, psduLengthFor, psduPlan } from '../model/frames'
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
  ACK_BYTES, AMPDU_DELIMITER_BYTES, BA_BYTES, CF_END_BYTES, CTS_BYTES, DCF_PARAMS,
  EDCA_PARAMS, QAP_EDCA_PARAMS, MAX_AMPDU_MPDUS, MAX_PPDU_NS, OFDM_5G, PHY_MODES,
  RTS_BYTES, SHORT_RETRY_LIMIT,
  GI_MODES, TGI_NS,
  aifsNs, ctrlRespRateFor, ctrlRespRateForMode, lowestMode, mcsInMode, mcsRateMbps,
  multiStaBaBytes, preambleNsFor, symNsFor, triggerBytes, toneRatio, txTimeModeNs, txTimeNs,
  type AcParams, type PhyMode, type PhyTiming, type TxTimeOpts,
} from './phy'
import { Rng } from './rng'
import { AcQueues, DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS, DEFAULT_MSDU_LIFETIME_NS } from './queues'
import type { Msdu } from './traffic'

export interface MacHooks {
  /** An MSDU reached this receiver's MAC for the first time (duplicates are not reported); `from` is its transmitter. */
  onMsduDelivered?(msduId: number, at: Ns, from?: string): void
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
  /**
   * MSDU lifetime: dot11EDCATableMSDULifetime under EDCA (default 500 TU, from enqueue), or
   * dot11MaxTransmitMSDULifetime under DCF (default 512 TU, from the first attempt).
   */
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
  /** Members whose BlockAck (in an HE/EHT TB PPDU) arrived, with the sequence numbers it acknowledged. */
  successes: Map<string, BaInfo>
  resolveHandle: number
}

interface MuUlState {
  kind: 'ul'
  gid: string
  ac: number
  users: string[]
  received: Map<string, FrameDesc>
  /** Per user, the sequence numbers of the MPDUs the AP received in that user's TB PPDU. */
  acked: Map<string, number[]>
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
  /**
   * The saved TXOP holder address (§10.23.2.4): Address 2 of the frame that set the NAV, or
   * Address 1 when that frame is a CTS. Cleared when the NAV is reset or counts down to 0. An RTS
   * from this address is answered even though the NAV is set (§10.3.2.9).
   */
  private txopHolder: string | null = null
  private navFromRtsAt: Ns | null = null
  private lastBusyEndNs: Ns = NEVER
  private corruptLast = false
  private awaiting: Awaiting | null = null
  private timeoutHandle = 0
  private respHandle = 0
  private pendingResp: FrameDesc | null = null
  private lastRxStartNs: Ns = NEVER
  private txopEndNs: Ns = 0
  private txopAc = -1
  private readyAcs = new Set<number>()
  private arbitratePending = false
  private muState: MuDlState | MuUlState | null = null
  /**
   * End of the NAV this TXOP holder has announced so far in the current TXOP (absolute time;
   * TEND-NAV of §9.2.5.2 b) measured from now), 0 outside a TXOP. A TXOP that ends before it is
   * truncated with CF-End (§10.23.2.10).
   */
  private announcedEndNs: Ns = 0
  /** Whether the current TXOP uses multiple protection (§9.2.5.2 b)); chosen at its first frame. */
  private multiProt = false
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
  /** The round whose TXOP ran last, which is the one that may ask to be continued. */
  private ampLast: AmpApRound | AmpInventoryRound | null = null
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
    this.edcafs = effectiveParams(cfg.edca ? (cfg.isAp ? QAP_EDCA_PARAMS : EDCA_PARAMS) : [DCF_PARAMS], cfg.tamper).map((params) => ({
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
    const bkLimit = () => this.ampTxopLimitNs()
    this.ampRound = cfg.ampAp && tiers.active ? new AmpApRound(cfg.ampAp, ampDeps, bkLimit) : null
    this.ampInventory = cfg.ampAp?.backscatter && tiers.backscatter
      ? new AmpInventoryRound({ ...cfg.ampAp, backscatter: cfg.ampAp.backscatter }, ampDeps, bkLimit)
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
      if (round !== null && round === this.ampRound) round.newRound()
      this.ampNext = round
      this.ampPending = true
      this.startAccessAc(this.edcafs[this.efIndex(0)])
      this.scheduleAmpPoll(at + cfg.pollIntervalMs * 1_000_000)
    })
  }

  /** This TXOP of a round is over: close it and take a post-transmission backoff (§10.23.2.2). */
  private onAmpDone(): void {
    const e = this.edcafs[this.efIndex(0)]
    this.endTxop()
    // A round or an inventory that reached the TXOP limit before it ran out of work asks for
    // another AC_BK TXOP straight away, with the same session (§10.23.2.9: no TXOP is longer
    // than the limit, so the rest has to wait for the next one).
    const last = this.ampLast
    if (last !== null && last.resumable) {
      this.ampNext = last
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

  /**
   * The TXOP limit an AMP round must fit: the AP's AC_BK limit, dot11QAPEDCATableTXOPLimit
   * (2.528 ms by default, Table 9-194; §10.23.2.9). An AP whose link runs without EDCA has no
   * AC_BK EDCAF of its own, so the round keeps to the same default bound.
   */
  private ampTxopLimitNs(): Ns {
    const own = this.cfg.edca ? this.edcafs[this.efIndex(0)].params.txopLimitNs : 0
    return own > 0 ? own : QAP_EDCA_PARAMS[0].txopLimitNs
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
      // 802.11-2024 §10.23.2.2 d): the losing EDCAF invokes the backoff procedure with QSRC
      // and CW updated as for a failed attempt, and draws a new backoff. §10.23.2.12.1: "For
      // internal collisions, the frame retry counts associated with the MSDUs ... involved in
      // the internal collision shall be incremented" — so the head MSDU counts a retry and is
      // discarded at dot11ShortRetryLimit like any other (checked 2026-11-11 against the
      // corpus: the retry count is the standard's, not an extra of this engine).
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

  /**
   * Discard MSDUs whose transmit timer has expired, before building a transmission from this
   * queue: under EDCA dot11EDCATableMSDULifetime (dot11QAPEDCATableMSDULifetime at the AP) from
   * enqueue (§10.23.2.12.1); under DCF dot11MaxTransmitMSDULifetime from the first attempt (§10.4).
   */
  private purgeExpired(e: Edcaf, ei: number): void {
    const t = this.now()
    const lifetime = this.cfg.msduLifetimeNs ?? (this.cfg.edca ? DEFAULT_MSDU_LIFETIME_NS : DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS)
    for (const m of this.queues.purgeExpired(ei, t, lifetime, this.cfg.edca ? 'enqueue' : 'firstTx')) {
      this.emit({ t, type: 'DROP', node: this.nodeId, msduId: m.id, reason: 'lifetime', ac: this.acTag(e) })
      this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(ei), ac: this.acTag(e) })
      this.hooks.onDequeue?.(m.id, false)
    }
  }

  private transmitFor(e: Edcaf, inTxopBurst: boolean): void {
    const ei = this.edcafs.indexOf(e)
    const t = this.now()
    this.purgeExpired(e, ei)

    // AMP: this AC_BK TXOP carries (part of) a polling round instead of a queued frame. The
    // round keeps every frame inside the AC_BK TXOP limit itself (`ampTxopLimitNs`), and asks
    // for another TXOP when it has more to do — no exemption from §10.23.2.9.
    if (this.cfg.isAp && this.ampNext && this.ampPending && ei === this.efIndex(0) && !inTxopBurst) {
      const round = this.ampNext
      this.ampPending = false
      this.ampNext = null
      this.ampLast = round
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
    const msdus = this.queues.claim(ei, peer, useAmpdu ? MAX_AMPDU_MPDUS : 1, (m, claimed) => {
      const x = this.exchangeNs(peer, [...claimed.map((c) => c.bytes), m.bytes], !inTxopBurst)
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
    const dataTime = this.airModeNs(mode, psdu, mcs, { widthMhz: width, nss })

    if (psdu > this.cfg.rtsThresholdBytes && !inTxopBurst) {
      // RTS/CTS protection first (§10.3.2.9).
      const rtsRate = ctrlRespRateForMode(mode, mcs, mbps)
      const ctsTime = this.airNs(CTS_BYTES, ctrlRespRateFor(rtsRate))
      const rtsTime = this.airNs(RTS_BYTES, rtsRate)
      this.beginTxop(e, t)
      // §9.2.5.2 a)1) single protection: the pending frame, one CTS, one Ack/BlockAck and the
      // IFSs between them. b) multiple protection: the first frame of a TXOP may reserve up to
      // the TXOP limit, TTXOP − TPPDU — this engine takes that upper bound.
      const duration = this.multiProt
        ? this.txopEndNs - (t + rtsTime)
        : 3 * this.T.sifsNs + ctsTime + dataTime + respTime
      const rts: FrameDesc = {
        kind: 'rts', src: this.nodeId, dst: peer, bytes: RTS_BYTES, mbps: rtsRate,
        durationFieldNs: this.inflate(duration),
        txTimeNs: rtsTime, ac: this.acTag(e),
      }
      this.awaiting = { kind: 'cts', ac: ei, peer, msdus, wasRts: true, aggBytes: psdu, aggregate }
      this.noteAnnounced(t + rtsTime + duration)
      this.transmitFrame(rts, true)
      return
    }

    if (!inTxopBurst) this.beginTxop(e, t)
    const frame = this.buildDataFrame(e, peer, msdus, plan, mode, mcs, mbps, respTime, width, nss)
    this.awaiting = { kind: aggregate ? 'ba' : 'ack', ac: ei, peer, msdus, wasRts: false, aggBytes: psdu, aggregate }
    this.transmitFrame(frame, true)
  }

  /**
   * The exchange that will follow one ending at `fromNs` in this TXOP — SIFS, the next PPDU, SIFS
   * and its response — or 0 when the frame now being built is the final frame of the TXOP.
   *
   * It asks the two questions `continueOrRelease` and `transmitFor` will ask after the response:
   * does an exchange of the queue head fit before the TXOP limit, and if it does, how many MSDUs
   * will the next PPDU then claim (the same walk `AcQueues.claim` takes). Single protection needs
   * the answer in the Duration of the frame being sent now (§9.2.5.2 a)8) ii)). It is an
   * estimate, as the standard says, made from what the queue holds when the frame is built: a
   * frame that arrives during the exchange (a saturated source refills on every Ack), a rate that
   * rises with the success, a DL MU PPDU the access point builds instead, or a sibling MLO link
   * claiming the head first, can make the next frame differ — and a frame that went out as the
   * final one can still be followed, inside the TXOP limit, by one that arrived after it.
   */
  private nextExchangeNs(ei: number, fromNs: Ns): Ns {
    if (this.txopEndNs <= 0 || this.txopAc !== ei) return 0
    const queue = this.queues.peek(ei)
    const head = queue.find((m) => this.reach(m.dst))
    if (head === undefined) return 0
    const peer = head.dst
    if (fromNs + this.T.sifsNs + this.exchangeNs(peer, [head.bytes], false).totalNs > this.txopEndNs) return 0
    const max = this.canAggregate(peer) ? MAX_AMPDU_MPDUS : 1
    const bytes: number[] = []
    for (const m of queue) {
      if (bytes.length >= max) break
      if (m.dst !== peer) continue
      if (bytes.length === 0) { bytes.push(m.bytes); continue }
      const x = this.exchangeNs(peer, [...bytes, m.bytes], false)
      if (x.dataNs > MAX_PPDU_NS || fromNs + this.T.sifsNs + x.totalNs > this.txopEndNs) break
      bytes.push(m.bytes)
    }
    return this.T.sifsNs + this.exchangeNs(peer, bytes, false).totalNs
  }

  /** The TXOP holder has announced a NAV reaching `endNs` (§9.2.5.2 b)'s TEND-NAV). */
  private noteAnnounced(endNs: Ns): void {
    if (this.txopEndNs > 0) this.announcedEndNs = Math.max(this.announcedEndNs, endNs)
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
   * PSDU_LENGTH of a VHT/HE/EHT PPDU carrying an A-MPDU of `apepBytes` (§10.12.6): the octets its
   * data symbols hold, which the EOF padding fills. The same N_DBPS `txTimeModeNs` divides by.
   */
  private psduLength(mode: PhyMode, apepBytes: number, mcs: number, opts: TxTimeOpts = {}): number {
    if (mode === 'nonht') return apepBytes
    const ndbps = PHY_MODES[mode].ndbps[mcs] * toneRatio(mode, opts.widthMhz ?? 20) * (opts.nss ?? 1) * (opts.ruFraction ?? 1)
    return psduLengthFor(apepBytes, ndbps)
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
   * applies to a TXOP's first PPDU above the RTS threshold.
   */
  private exchangeNs(peer: string, msduBytes: number[], firstInTxop: boolean): { dataNs: Ns; totalNs: Ns } {
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
    if (firstInTxop && psdu > this.cfg.rtsThresholdBytes) {
      totalNs += this.airNs(RTS_BYTES, respRate) + this.T.sifsNs + this.airNs(CTS_BYTES, ctrlRespRateFor(respRate)) + this.T.sifsNs
    }
    return { dataNs, totalNs }
  }

  /**
   * Each MSDU's MPDU header fields: its sequence number (from the <Address 1, TID> counter for a
   * QoS Data frame, the baseline counter otherwise — Table 10-5), its Retry bit, and the DA / SA
   * Table 9-60 puts in Address 3 when the MSDU's end-to-end address differs from the RA / TA.
   */
  private mpduHdrs(peer: string, ac: number, msdus: Msdu[]): MpduHdr[] {
    const qos = this.qosWith(peer)
    return msdus.map((m) => {
      // A QoS Data frame's TID is the MSDU's own user priority (§10.2.3.2, Table 10-1).
      const tid = qos ? (m.up ?? TID_FOR_AC[Math.max(0, Math.min(3, ac))]) : null
      if (m.seqNo === undefined) m.seqNo = this.queues.nextSeq(peer, tid)
      const da = m.finalDst ?? m.server
      const sa = m.sa ?? (this.cfg.isAp ? m.server : undefined)
      // §9.2.4.1.6: Retry marks a retransmission of this MPDU. A failed RTS counts a retry for
      // the MSDU but never put it on the air, so the bit follows "has been transmitted", not the
      // retry counter — and it is the MPDU's own, not the A-MPDU's.
      const h: MpduHdr = { sn: m.seqNo, retry: m.sent === true }
      if (tid !== null) h.tid = tid
      if (!this.cfg.isAp && da !== undefined && da !== peer) h.da = da
      if (this.cfg.isAp && sa !== undefined && sa !== this.nodeId) h.sa = sa
      return h
    })
  }

  private buildDataFrame(
    e: Edcaf, peer: string, msdus: Msdu[], plan: { psduBytes: number; aggregate: boolean; smpdu: boolean },
    mode: PhyMode, mcs: number, mbps: number, respTime: Ns,
    widthMhz: number, nss: number,
  ): FrameDesc {
    const mpdus = this.mpduHdrs(peer, e.params.ac, msdus)
    const psdu = plan.psduBytes
    const aggregate = plan.aggregate
    const txTime = this.airModeNs(mode, psdu, mcs, { widthMhz, nss })
    const retryFlag = mpdus.some((h) => h.retry)
    for (const m of msdus) { m.sent = true; m.firstTxNs ??= this.now() }
    const now = this.now()
    let duration: Ns
    if (this.multiProt && this.txopEndNs > 0) {
      // §9.2.5.2 b) multiple protection: TEND-NAV − TPPDU ≤ D ≤ TTXOP-REMAINING − TPPDU. This
      // engine takes the upper bound, the end of the TXOP, for every frame of the TXOP.
      duration = Math.max(this.T.sifsNs + respTime, this.txopEndNs - (now + txTime))
    } else {
      // §9.2.5.2 a)8): one Ack/BlockAck and its SIFS, plus — unless this is the final frame of
      // the TXOP — the following frame and its response with their SIFSs.
      const exchangeEnd = now + txTime + this.T.sifsNs + respTime
      duration = this.T.sifsNs + respTime + this.nextExchangeNs(this.edcafs.indexOf(e), exchangeEnd)
    }
    this.noteAnnounced(now + txTime + duration)
    const psduLen = this.psduLength(mode, psdu, mcs, { widthMhz, nss })
    return {
      kind: 'data', src: this.nodeId, dst: peer, bytes: psduLen, mbps,
      durationFieldNs: this.inflate(duration),
      txTimeNs: txTime,
      seqNo: mpdus[0].sn, retryFlag, msduId: msdus[0].id,
      qos: aggregate || this.qosWith(peer),
      mode, mcs, widthMhz, ac: this.acTag(e),
      giNs: this.frameGiNs(mode),
      msduBytes: msdus.map((m) => m.bytes),
      mpdus,
      ...(mode === 'nonht' ? {} : { apepBytes: psdu }),
      ...(plan.smpdu ? { smpdu: true } : {}),
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
      // §9.2.5.2: the class of Duration setting is chosen with the first frame of the TXOP and
      // kept for every frame after it. With no TXOP limit there is nothing longer than a single
      // exchange to protect, and multiple protection's D reduces to single protection's.
      this.multiProt = this.cfg.txopProtection === 'multiple'
      this.emit({ t, type: 'TXOP_START', node: this.nodeId, ac: e.params.ac, untilNs: this.txopEndNs })
    }
  }

  private endTxop(): void {
    this.announcedEndNs = 0
    this.multiProt = false
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
    const durCap = this.muDurCap(e, inTxopBurst, dsts)

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
    if (!inTxopBurst) this.beginTxop(e, t)
    // §10.3.2.13.2: each member answers only because its MPDUs carry a TRS Control subfield, and
    // in the HE/EHT TB PPDU it describes. One response duration for all, so the answers end
    // together; every member gets its own resource unit (also after a MU-MIMO PPDU — the
    // answers are UL OFDMA).
    const tb = this.trsResponse(modeAll, parts.map((p) => p.mcs), width)
    parts.forEach((p, i) => { p.trs = { ulDataSymbols: tb.nsym, mcs: tb.mcs[i], ruFraction: tb.ruFraction, partIdx: i } })
    // §9.2.5.2 a)8): QoS Data with HETP Ack ack policy is protected through its response (the TB
    // PPDU and the SIFS before it) and, unless the PPDU is the final one of the TXOP, the next
    // frame and its response. Multiple protection: to the end of the TXOP.
    const exchangeEnd = t + ppduDur + this.T.sifsNs + tb.durNs
    let duration: Ns
    if (this.multiProt && this.txopEndNs > 0) {
      duration = Math.max(this.T.sifsNs + tb.durNs, this.txopEndNs - (t + ppduDur))
    } else {
      duration = this.T.sifsNs + tb.durNs + this.nextExchangeNs(ei, exchangeEnd)
    }
    this.noteAnnounced(t + ppduDur + duration)
    const frame: FrameDesc = {
      kind: 'data', src: this.nodeId, dst: '*mu', bytes: parts.reduce((s, p) => s + p.bytes, 0),
      mbps: parts[0].mbps, durationFieldNs: this.inflate(duration),
      txTimeNs: ppduDur, mode: modeAll, mcs: parts[0].mcs, widthMhz: width, ac: this.acTag(e),
      giNs: this.frameGiNs(modeAll),
      muParts: parts, orthogonalGroup: gid, muKind: useMumimo ? 'mumimo' : 'ofdma',
    }
    // Only now, with the PPDU going out, have these MSDUs been on the air; a
    // group that fell apart above restored its claims untouched.
    for (const c of claims) for (const m of c.msdus) { m.sent = true; m.firstTxNs ??= this.now() }
    const mu: MuDlState = { kind: 'dl', gid, ac: ei, parts: claims, successes: new Map(), resolveHandle: 0 }
    this.muState = mu
    this.transmitFrame(frame, false)
    // The TB PPDUs start a SIFS after this PPDU; a member whose answer has not begun by then plus
    // the response timeout (§10.3.2.9's aSIFSTime + aSlotTime + aRxPHYStartDelay) is not coming.
    mu.resolveHandle = this.q.schedule(t + ppduDur + this.T.sifsNs + tb.durNs + this.T.ackTimeoutNs, () => this.resolveDlMu())
  }

  /**
   * The HE/EHT TB PPDU a TRS Control subfield solicits for a BlockAck (§9.2.4.7.1, §26.5.2.3.4):
   * one resource unit per member, NUM_STS 1, 1.6 µs GI with 2x HE-LTF, the UL HE-MCS each
   * member's TRS names (0–3), and UL Data Symbols large enough for the largest of them to carry
   * an A-MPDU holding one compressed BlockAck. The standard leaves the access point's choice of
   * HE-MCS open; this engine takes each member's own MCS capped at 3, the field's range.
   */
  private trsResponse(mode: PhyMode, mcsList: number[], widthMhz: number): {
    nsym: number; durNs: Ns; mcs: number[]; ruFraction: number; psduBytes: number[]
  } {
    const ruFraction = 1 / mcsList.length
    const mcs = mcsList.map((m) => Math.min(3, m))
    const apep = AMPDU_DELIMITER_BYTES + BA_BYTES
    const ndbps = (m: number) => PHY_MODES[mode].ndbps[m] * toneRatio(mode, widthMhz) * ruFraction
    const nsym = Math.max(...mcs.map((m) => Math.ceil((16 + 8 * apep + 6) / ndbps(m))))
    const gi = TGI_NS.double
    const durNs = preambleNsFor(mode, gi) + nsym * symNsFor(mode, gi) + this.T.signalExtNs
    const psduBytes = mcs.map((m) => Math.max(apep, Math.floor((nsym * ndbps(m) - 16 - 6) / 8)))
    return { nsym, durNs, mcs, ruFraction, psduBytes }
  }

  /**
   * Longest DL MU PPDU allowed now: aPPDUMaxTime, and inside the TXOP with room for SIFS + the
   * TB PPDU that carries the BlockAcks (sized for the worst case: every candidate member at MCS 0).
   */
  private muDurCap(e: Edcaf, inTxopBurst: boolean, dsts: string[]): Ns {
    const t = this.now()
    const end = inTxopBurst && this.txopEndNs > 0
      ? this.txopEndNs
      : this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0 ? t + e.params.txopLimitNs : Infinity
    const modeAll = lowestMode(dsts.map((d) => this.cfg.modeForPeer(d)))
    const width = Math.min(...dsts.map((d) => this.cfg.widthForPeer(d)))
    const tb = this.trsResponse(modeAll, dsts.map(() => 0), width)
    return Math.min(MAX_PPDU_NS, end - t - this.T.sifsNs - tb.durNs)
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
   *
   * Every MPDU carries an HT Control field with the TRS Control subfield (§9.2.4.7.1), so each
   * member's A-MPDU is priced with the 4-octet field in every header. A member's `bytes` is its
   * PSDU_LENGTH — the A-MPDU padded with EOF padding to the PPDU's symbol count (§10.12.6).
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
    const optsOf = (nss: number) => mumimo ? { mu: true, widthMhz: muWidth, nss } : { mu: true, ruFraction: frac, widthMhz: muWidth, nss }
    for (const peer of dsts) {
      const mcs = mcsInMode(this.cfg.modeForPeer(peer), this.cfg.mcsForPeer(peer), modeAll)
      const nss = this.cfg.nssForPeer(peer)
      const opts = optsOf(nss)
      const airtime = (bytes: number[]) => this.airModeNs(modeAll, psduPlan(bytes, { mu: true, trs: true }).psduBytes, mcs, opts)
      if (airtime([this.queues.headBytes(ei, peer) ?? 0]) > durCap) continue
      const msdus = this.queues.claim(ei, peer, MAX_AMPDU_MPDUS, (m, claimed) =>
        airtime([...claimed.map((x) => x.bytes), m.bytes]) <= durCap)
      if (!msdus.length) continue
      const bytes = psduPlan(msdus.map((m) => m.bytes), { mu: true, trs: true }).psduBytes
      parts.push({
        dst: peer, src: this.nodeId, bytes, mcs, mbps: mcsRateMbps(modeAll, mcs, this.frameGiNs(modeAll) ?? TGI_NS.base),
        msduIds: msdus.map((m) => m.id), msduBytes: msdus.map((m) => m.bytes), mpduCount: msdus.length, ac,
        retryFlag: msdus.some((m) => m.sent),
        mpdus: this.mpduHdrs(peer, ac, msdus),
        ...(mumimo ? { nss } : { ruFraction: frac }),
      })
      claims.push({ peer, msdus })
      ppduDur = Math.max(ppduDur, airtime(msdus.map((m) => m.bytes)))
    }
    // EOF padding fills every member's A-MPDU to the symbols the longest member needs. The
    // PPDU's data field is ppduDur less the preamble; each member's PSDU_LENGTH follows from it.
    const head = preambleNsFor(modeAll, this.cfg.giNs?.() ?? TGI_NS.base) + PHY_MODES[modeAll].muExtraPreambleNs + this.T.signalExtNs
    const nsym = Math.round((ppduDur - head) / symNsFor(modeAll, this.cfg.giNs?.() ?? TGI_NS.base))
    for (const p of parts) {
      const nss = p.nss ?? this.cfg.nssForPeer(p.dst)
      const ndbps = PHY_MODES[modeAll].ndbps[p.mcs] * toneRatio(modeAll, muWidth) * nss * (p.ruFraction ?? 1)
      p.bytes = Math.max(p.bytes, Math.floor((nsym * ndbps - 16 - 6) / 8))
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
      const ba = mu.successes.get(c.peer)
      this.cfg.onTxOutcome?.(c.peer, ba !== undefined)
      for (const m of c.msdus) {
        // The member's BlockAck bitmap says which MPDUs arrived (§10.25); the rest are sent again.
        if (ba !== undefined && m.seqNo !== undefined && ba.acked.includes(m.seqNo)) {
          this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(mu.ac), ac: this.acTag(e) })
          this.hooks.onDequeue?.(m.id, true)
        } else {
          failed.push(m)
        }
      }
    }
    if (mu.successes.size === 0) {
      // §10.23.2.2 f)/j): every MPDU of a PPDU soliciting an HE TB PPDU failed.
      this.failAttemptCore(e, mu.ac, failed)
      return
    }
    // §10.23.2.2: an MPDU of the PPDU was acknowledged, so the attempt did not fail as a whole.
    // The unacknowledged MPDUs count a retry and are sent again; the TXOP may continue.
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
    const mu: MuUlState = { kind: 'ul', gid, ac: this.edcafs.indexOf(e), users: users.map((u) => u.peer), received: new Map(), acked: new Map(), mbaHandle: 0, rxTimeoutHandle: 0 }
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
      // One Per AID TID Info field per STA heard, its bitmap marking the MPDUs received (§9.3.1.8.7).
      muParts: acked.map((peer) => {
        const sns = mu.acked.get(peer) ?? []
        return { dst: peer, src: this.nodeId, bytes: 0, mcs: 0, mbps: 24, msduIds: [], mpduCount: 0, ba: { ssn: sns.length ? Math.min(...sns) : 0, acked: sns } }
      }),
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

  /**
   * One failed attempt.
   *
   * EDCA, §10.23.2.2 backoff for reasons c), d), f), i), j): while QSRC[AC] is less than
   * dot11ShortRetryLimit it is incremented and CW doubles toward CWmax; a failure that finds QSRC
   * already AT the limit sets QSRC to 0 and CW to CWmin. (Until 2026-11-11 the EDCAFs used the DCF
   * rule below and reset on reaching the limit — one failure early.)
   *
   * DCF, §10.3.3: SSRC is incremented and CW takes the next value up to aCWmax; CW is reset to
   * aCWmin "when SSRC reaches dot11ShortRetryLimit", i.e. on the failure that brings it there.
   */
  private bumpQsrc(e: Edcaf): void {
    if (this.cfg.edca) {
      if (e.qsrc < SHORT_RETRY_LIMIT) {
        e.qsrc++
        e.cw = Math.min(2 * e.cw + 1, e.params.cwMax)
      } else {
        e.qsrc = 0
        e.cw = e.params.cwMin
      }
    } else {
      e.qsrc++
      if (e.qsrc >= SHORT_RETRY_LIMIT) {
        e.qsrc = 0
        e.cw = e.params.cwMin
      } else {
        e.cw = Math.min(2 * e.cw + 1, e.params.cwMax)
      }
    }
    this.emit({ t: this.now(), type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, qsrc: e.qsrc, ac: this.acTag(e) })
  }

  private resetQsrc(e: Edcaf): void {
    e.qsrc = 0
    e.cw = e.params.cwMin
    this.emit({ t: this.now(), type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, qsrc: e.qsrc, ac: this.acTag(e) })
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
  private emitRetry(e: Edcaf, msdus: Msdu[], qsrc = this.cfg.edca ? (e.qsrc < SHORT_RETRY_LIMIT ? e.qsrc + 1 : 0) : e.qsrc + 1): void {
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

  /**
   * A valid response arrived: the attempt succeeded and QSRC/CW reset (§10.23.2.2). With a
   * BlockAck, only the MPDUs its bitmap marks leave the queue; each one it does not mark counts a
   * retry and goes back to the head to be sent again (§10.25) — never the whole A-MPDU.
   */
  private succeedAttempt(ba?: BaInfo): void {
    const aw = this.awaiting!
    this.cancel('timeout')
    this.awaiting = null
    const t = this.now()
    const e = this.edcafs[aw.ac]
    this.resetQsrc(e)
    const failed: Msdu[] = []
    for (const m of aw.msdus) {
      if (ba !== undefined && (m.seqNo === undefined || !ba.acked.includes(m.seqNo))) {
        failed.push(m)
        continue
      }
      this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(aw.ac), ac: this.acTag(e) })
      this.hooks.onDequeue?.(m.id, true)
    }
    if (failed.length) {
      this.emitRetry(e, failed, 0)
      this.failMsdus(e, aw.ac, failed)
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
      this.txopHolder = null
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

  onRxOk(t: Ns, frame: FrameDesc, from: string, mpduOk?: boolean[]): void {
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
      this.handleOwnFrame(t, frame, from, myPart, mpduOk)
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

  /**
   * Receive the MPDUs of a data frame addressed to this station: keep each one whose FCS passed
   * (`mpduOk`, absent = all), discard duplicates by <TA, TID, SN> and the Retry bit
   * (§10.3.2.14.3), hand the rest up, and return the sequence numbers received — duplicates
   * included, since a recipient acknowledges a duplicate it discards (§10.3.2.14.3 NOTE).
   */
  private receiveMpdus(t: Ns, from: string, qos: boolean, ac: number | undefined, ids: number[], hdrs: MpduHdr[] | undefined, mpduOk?: boolean[]): number[] {
    const acTid = qos ? TID_FOR_AC[Math.max(0, Math.min(3, ac ?? 1))] : null
    const got: number[] = []
    ids.forEach((id, i) => {
      if (mpduOk !== undefined && mpduOk[i] !== true) return
      const h = hdrs?.[i]
      if (h === undefined) {
        // A frame built without per-MPDU headers (none of the engine's own paths): no SN to judge.
        this.hooks.onMsduDelivered?.(id, t, from)
        return
      }
      got.push(h.sn)
      const tid = acTid === null ? null : (h.tid ?? acTid)
      if (!this.queues.rxDuplicate(from, tid, h.sn, h.retry)) this.hooks.onMsduDelivered?.(id, t, from)
    })
    return got
  }

  /**
   * The Duration of a control response (§9.2.5.6, and §9.2.5.7 for a frame in an HE TB PPDU): the
   * eliciting frame's Duration less the time from the end of its PPDU to the end of this one, and
   * 0 if that comes out negative (§9.2.5.1).
   */
  private respDuration(eliciting: FrameDesc, respTimeNs: Ns): Ns {
    return Math.max(0, eliciting.durationFieldNs - this.T.sifsNs - respTimeNs)
  }

  private handleOwnFrame(t: Ns, frame: FrameDesc, from: string, myPart?: MuPart, mpduOk?: boolean[]): void {
    switch (frame.kind) {
      case 'data': {
        if (myPart) {
          // DL MU part addressed to me: keep what arrived, then answer only if solicited.
          const got = this.receiveMpdus(t, from, true, myPart.ac ?? frame.ac, myPart.msduIds, myPart.mpdus, mpduOk)
          // §10.3.2.13.2: the immediate response follows the scheduling in the TRS Control
          // subfield (or a Basic Trigger frame); without one the STA does not respond.
          const trs = myPart.trs
          if (trs === undefined || got.length === 0) break
          const mode = frame.mode ?? 'he'
          const gi = TGI_NS.double
          const ndbps = PHY_MODES[mode].ndbps[trs.mcs] * toneRatio(mode, frame.widthMhz ?? 20) * trs.ruFraction
          const durNs = preambleNsFor(mode, gi) + trs.ulDataSymbols * symNsFor(mode, gi) + this.T.signalExtNs
          const apep = AMPDU_DELIMITER_BYTES + BA_BYTES
          // NOTE 1 of §26.5.2.3.4: a STA answering a TRS Control subfield treats physical and
          // virtual carrier sense as idle, so the answer goes out whatever the NAV says.
          this.scheduleResponse(t, {
            kind: 'ba', src: this.nodeId, dst: from,
            bytes: Math.max(apep, Math.floor((trs.ulDataSymbols * ndbps - 16 - 6) / 8)), apepBytes: apep,
            mbps: mcsRateMbps(mode, trs.mcs, gi), mode, mcs: trs.mcs, widthMhz: frame.widthMhz, giNs: gi,
            durationFieldNs: this.respDuration(frame, durNs), txTimeNs: durNs,
            orthogonalGroup: frame.orthogonalGroup,
            ru: { fraction: trs.ruFraction, partIdx: trs.partIdx },
            ba: { ssn: Math.min(...(myPart.mpdus ?? []).map((h) => h.sn)), acked: got },
          })
          break
        }
        const ids = frame.ampdu?.msduIds ?? (frame.msduId !== undefined ? [frame.msduId] : [])
        const hdrs = frame.mpdus ?? (frame.seqNo !== undefined ? [{ sn: frame.seqNo, retry: frame.retryFlag === true }] : undefined)
        const qos = frame.qos === true
        // UL MU TB data at the AP: group-acked via M-BA, no immediate response.
        if (frame.orthogonalGroup && this.muState?.kind === 'ul' && frame.orthogonalGroup === this.muState.gid) {
          const got = this.receiveMpdus(t, from, true, frame.ac, ids, hdrs, mpduOk)
          this.muState.received.set(from, frame)
          this.muState.acked.set(from, got)
          break
        }
        const got = this.receiveMpdus(t, from, qos, frame.ac, ids, hdrs, mpduOk)
        const isBa = frame.ampdu !== undefined
        const rate = ctrlRespRateForMode(frame.mode ?? 'nonht', frame.mcs ?? 0, frame.mbps)
        const respBytes = isBa ? BA_BYTES : ACK_BYTES
        const respTime = this.airNs(respBytes, rate)
        this.scheduleResponse(t, {
          kind: isBa ? 'ba' : 'ack', src: this.nodeId, dst: from, bytes: respBytes,
          mbps: rate, durationFieldNs: this.respDuration(frame, respTime), txTimeNs: respTime,
          ...(isBa ? { ba: { ssn: Math.min(...(hdrs ?? []).map((h) => h.sn)), acked: got } } : {}),
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
        const mine = frame.muParts?.find((p) => p.dst === this.nodeId)
        const st = this.staMuAwait
        this.staMuAwait = null
        this.q.cancel(st.timeoutHandle)
        this.closeTbPpdu(st, mine?.ba?.acked ?? (mine ? null : []))
        break
      }
      case 'ba':
      case 'ack': {
        if (this.muState?.kind === 'dl' && frame.orthogonalGroup === this.muState.gid) {
          const mu = this.muState
          mu.successes.set(from, frame.ba ?? { ssn: 0, acked: [] })
          // Every user has answered: the exchange is resolved now, at the end
          // of the TB PPDUs — not a response timeout later.
          if (mu.successes.size === mu.parts.length) {
            this.q.cancel(mu.resolveHandle)
            mu.resolveHandle = 0
            this.resolveDlMu()
          }
          break
        }
        if (this.awaiting && (this.awaiting.kind === 'ack' || this.awaiting.kind === 'ba')) {
          // A valid response arrived, so the attempt succeeded (§10.23.2.2). A BlockAck's bitmap
          // may still leave MPDUs unacknowledged: those are the only ones sent again.
          this.cfg.onTxOutcome?.(this.awaiting.peer, true)
          this.succeedAttempt(frame.kind === 'ba' ? frame.ba : undefined)
        }
        break
      }
      case 'rts': {
        // §10.3.2.9: respond with CTS only if the NAV indicates idle — the NAV count is 0, or the
        // RTS comes from the saved TXOP holder address (§10.23.2.4), whose own reservation the
        // NAV is.
        if (this.now() < this.navUntil && this.txopHolder !== from) break
        const ctsRate = ctrlRespRateFor(frame.mbps)
        const ctsTime = this.airNs(CTS_BYTES, ctsRate)
        this.scheduleResponse(t, {
          kind: 'cts', src: this.nodeId, dst: from, bytes: CTS_BYTES, mbps: ctsRate,
          durationFieldNs: this.respDuration(frame, ctsTime),
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
            const plan = psduPlan(aw.msdus.map((m) => m.bytes), { qos: this.qosWith(aw.peer), ampdu: this.canAggregate(aw.peer), mode })
            const respTime = this.airNs(plan.respBytes, ctrlRespRateForMode(mode, mcs, mbps))
            const frame2 = this.buildDataFrame(e, aw.peer, aw.msdus, plan, mode, mcs, mbps, respTime, width, nss)
            this.awaiting = { ...aw, kind: plan.aggregate ? 'ba' : 'ack', wasRts: false }
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
      const apep = psduPlan(msdus.map((m) => m.bytes), { mu: true }).psduBytes
      const mpdus = this.mpduHdrs(trigger.src, e.params.ac, msdus)
      // §9.2.5.7: a frame in an HE TB PPDU carries the eliciting frame's Duration less SIFS and
      // the TB PPDU's own duration.
      const frame: FrameDesc = {
        kind: 'data', src: this.nodeId, dst: trigger.src,
        // PSDU_LENGTH: the A-MPDU padded with EOF padding to the duration the Trigger set (§10.12.6).
        bytes: Math.max(apep, maxPsduBytesFor(mode, mcs, frac, dur - this.T.signalExtNs, width, nss, this.cfg.giNs?.())),
        apepBytes: apep,
        mbps: mcsRateMbps(mode, mcs, this.frameGiNs(mode) ?? TGI_NS.base),
        durationFieldNs: this.respDuration(trigger, dur), txTimeNs: dur, // padded to the trigger's target duration
        seqNo: mpdus[0].sn, mode, mcs, widthMhz: width, ac: this.acTag(e),
        giNs: this.frameGiNs(mode),
        retryFlag: mpdus.some((h) => h.retry),
        qos: true,
        msduBytes: msdus.map((m) => m.bytes),
        mpdus,
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
      for (const m of msdus) { m.sent = true; m.firstTxNs ??= this.now() }
      const mbaTime = this.airNs(multiStaBaBytes(n), 24)
      this.staMuAwait = {
        ac, msdus,
        timeoutHandle: this.q.schedule(t + this.T.sifsNs + dur + this.T.sifsNs + mbaTime + this.T.ackTimeoutNs, () => {
          const st = this.staMuAwait
          if (!st) return
          this.staMuAwait = null
          this.closeTbPpdu(st, [])
        }),
      }
      this.transmitFrame(frame, false)
    })
  }

  /**
   * After a TB PPDU: the MSDUs the Multi-STA BlockAck acknowledged leave the queue, the others
   * count a retry and are sent again. `acked` lists the acknowledged sequence numbers; null means
   * every MPDU (a Per AID TID Info field without a bitmap). 802.11ax §26.5.2.3 / §10.23.2.2: the
   * EDCAF then resumes its backoff without changing CW or the backoff counter, acknowledged or not.
   */
  private closeTbPpdu(st: StaMuAwait, acked: number[] | null): void {
    const t = this.now()
    const e = this.edcafs[st.ac]
    const failed: Msdu[] = []
    for (const m of st.msdus) {
      if (acked === null || (m.seqNo !== undefined && acked.includes(m.seqNo))) {
        this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(st.ac), ac: this.acTag(e) })
        this.hooks.onDequeue?.(m.id, true)
      } else {
        failed.push(m)
      }
    }
    if (failed.length) {
      this.emitRetry(e, failed, e.qsrc)
      this.failMsdus(e, st.ac, failed)
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
    // §10.23.2.4: the TXOP holder address is Address 2 of the frame, or Address 1 of a CTS.
    this.txopHolder = frame.kind === 'cts' ? frame.dst : from
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
          this.txopHolder = null
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
    this.txopHolder = null
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
