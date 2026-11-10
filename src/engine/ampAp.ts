/**
 * The AP side of an IEEE P802.11bp Active Tx polling round (2.4 GHz): a triggering frame, a
 * number of uplink slots, and one AMP Ack per slot naming whoever was heard in it (PDT
 * 11-26/1519r5 clause 39.3 triggering procedure; 11-26/1889r4 clause 39.4 UL channel access).
 *
 * **Every TXOP fits the AP's AC_BK TXOP limit** (§10.23.2.9; dot11QAPEDCATableTXOPLimit, 2.528 ms
 * by default, Table 9-194). A round asks for `slots` random-access slots (and, in `twoPhase`, a
 * scheduled slot for every tag heard); each TXOP carries one triggering frame whose Number of
 * Slots is as many of the slots still owed as fit — trigger + N × (AMP SIFS + slot + AMP SIFS +
 * Ack), after the CTS-to-self if there is one — and the rest of the round continues in the next
 * AC_BK TXOP the AP wins. The draft lets the AP choose N freely (§39.3.2.1), every trigger draws
 * fresh ABOCs (§39.4), and a scheduled trigger lists only the STAs whose slots it allocates.
 * Until 2026-11-11 a round ran as one exchange exempt from the TXOP limit (4190 µs and 6620 µs at
 * 250 kb/s against 2528 µs).
 *
 * The round owns nothing but its own timers: it puts frames on the air through `deps.transmit`
 * and reports the end of each TXOP through `deps.done`, so the MAC decides how the round fits
 * into EDCA (AC_BK, optionally fronted by a CTS-to-self, §9.2.5.2 / §10.3.2.15, whose Duration
 * covers that TXOP's trigger, slots and Acks).
 */
import {
  AMP_ACK_BYTES, AMP_AP_CHANNEL_2G, AMP_SEED_IDX, AMP_SIFS_NS, AMP_UL_SHIFT_MHZ, ampAckFrame, ampDlPpduNs, ampRespBytes, ampTriggerBytes, ampTriggerFrame, ampUlPpduNs,
  type AmpDlKbps, type AmpUlKbps,
} from './amp'
import { CTS_BYTES, txTimeNs, type PhyTiming } from './phy'
import { EventQueue } from './events'
import type { FrameDesc } from '../model/frames'
import type { EmitFn } from '../model/records'
import type { AmpApCfg } from '../model/scenario'
import type { Ns } from '../model/types'

export interface AmpApDeps {
  nodeId: string
  q: EventQueue
  now: () => Ns
  emit: EmitFn
  timing: PhyTiming
  /** Put a frame on the air through the MAC (no response expected by the MAC itself). */
  transmit(frame: FrameDesc): void
  /** This TXOP is over: the MAC closes it with a post-transmission backoff. */
  done(): void
}

type Phase = 'random' | 'scheduled'

export class AmpApRound {
  private running = false
  private sessionId = 0
  /** The slot the TXOP is in right now (0 outside a slot). */
  private current = 0
  private phase: Phase = 'random'
  private slots = 0
  private slotNs: Ns = 0
  /** Random-access slots of this round not yet allocated. */
  private randomLeft = 0
  /** Tags heard in this round's random phase, in slot order — the scheduled phase's list. */
  private heard: string[] = []
  /** Tags of the scheduled phase not yet allocated a slot. */
  private schedLeft: string[] = []
  /** Whether the scheduled phase has started (its list is fixed from then on). */
  private schedStarted = false
  /** slot → the tag whose response decoded in it. */
  private received = new Map<number, string>()
  /** Did the last TXOP allocate a slot? A TXOP too short for one must not be retried forever. */
  private progressed = false

  constructor(private cfg: AmpApCfg, private deps: AmpApDeps, private txopLimitNs: () => Ns) {}

  get active(): boolean {
    return this.running
  }

  /** A round with slots still owed, after a TXOP that got somewhere. */
  get resumable(): boolean {
    return !this.running && this.progressed && this.owed() !== null
  }

  /** Does a phase's response carry a reading? Scheduled slots always do; random ones only in inline mode. */
  private readingIn(phase: Phase): boolean {
    return phase === 'scheduled' || this.cfg.readMode === 'inline'
  }

  private slotNsFor(reading: boolean): Ns {
    return ampUlPpduNs(this.cfg.ulKbps as AmpUlKbps, ampRespBytes(reading))
  }

  private ackNs(): Ns {
    return ampDlPpduNs(this.cfg.dlKbps as AmpDlKbps, AMP_ACK_BYTES, this.deps.timing.signalExtNs)
  }

  private triggerNs(scheduledIds: number): Ns {
    return ampDlPpduNs(this.cfg.dlKbps as AmpDlKbps, ampTriggerBytes(scheduledIds), this.deps.timing.signalExtNs)
  }

  /** Total air of one phase chunk after its trigger PPDU: N × (AMP SIFS + slot + AMP SIFS + Ack). */
  phaseAirNs(slots: number, reading: boolean): Ns {
    return slots * (this.slotNsFor(reading) + 2 * AMP_SIFS_NS + this.ackNs())
  }

  private ctsNs(): Ns {
    return txTimeNs(CTS_BYTES, 6) + this.deps.timing.signalExtNs
  }

  /** What the next TXOP owes: the random phase's remaining slots, then the scheduled phase's tags. */
  private owed(): { phase: Phase; n: number } | null {
    if (this.randomLeft > 0) return { phase: 'random', n: this.randomLeft }
    if (this.cfg.readMode === 'twoPhase') {
      if (!this.schedStarted && this.heard.length > 0) return { phase: 'scheduled', n: this.heard.length }
      if (this.schedStarted && this.schedLeft.length > 0) return { phase: 'scheduled', n: this.schedLeft.length }
    }
    return null
  }

  /**
   * The largest Number of Slots, at most `want`, whose trigger and slots fit in `budgetNs`. A
   * scheduled trigger grows with the list it carries, so the count is searched downward.
   */
  private fitSlots(phase: Phase, want: number, budgetNs: Ns): number {
    const reading = this.readingIn(phase)
    for (let n = want; n >= 1; n--) {
      const ns = this.triggerNs(phase === 'scheduled' ? n : 0) + this.phaseAirNs(n, reading)
      if (ns <= budgetNs) return n
    }
    return 0
  }

  /** A poll tick that arrived while a round still owed slots: applied once that round is done. */
  private restartPending = false

  /**
   * The poll clock asked for a round: a new session, the random phase owed in full. A round still
   * owed slots — on the air, or waiting for the TXOP that continues it — is let finish first.
   */
  newRound(): void {
    if (this.running || this.resumable) { this.restartPending = true; return }
    this.restartPending = false
    this.sessionId = (this.sessionId % 255) + 1
    this.randomLeft = this.cfg.slots
    this.heard = []
    this.schedLeft = []
    this.schedStarted = false
    this.progressed = true
  }

  /** The AP won an AC_BK TXOP for this round: one triggering frame and its slots, inside the TXOP limit. */
  start(): void {
    if (this.running) return
    const owed = this.owed()
    if (owed === null) { this.progressed = false; this.deps.done(); return }
    const useCts = this.cfg.protection === 'ctsSelf'
    const budget = this.txopLimitNs() - (useCts ? this.ctsNs() + this.deps.timing.sifsNs : 0)
    const n = this.fitSlots(owed.phase, owed.n, budget)
    if (n === 0) {
      // Not even one slot fits the TXOP limit: nothing is sent, and the round is not retried.
      this.progressed = false
      this.deps.done()
      return
    }
    this.running = true
    this.progressed = true
    let ids: string[] = []
    if (owed.phase === 'random') {
      this.randomLeft -= n
    } else {
      if (!this.schedStarted) { this.schedStarted = true; this.schedLeft = [...this.heard] }
      ids = this.schedLeft.slice(0, n)
      this.schedLeft = this.schedLeft.slice(n)
    }
    if (!useCts) {
      this.sendTrigger(owed.phase, n, ids)
      return
    }
    // CTS-to-self (§9.2.5.2, §10.3.2.15): one Duration reserving this TXOP's trigger, slots and
    // Acks for the Wi-Fi stations that cannot hear the tags' uplink as a PPDU at all.
    const t = this.deps.now()
    const reading = this.readingIn(owed.phase)
    const cts: FrameDesc = {
      kind: 'cts', src: this.deps.nodeId, dst: this.deps.nodeId, bytes: CTS_BYTES, mbps: 6,
      durationFieldNs: this.deps.timing.sifsNs + this.triggerNs(ids.length) + this.phaseAirNs(n, reading),
      txTimeNs: this.ctsNs(),
    }
    this.deps.transmit(cts)
    this.deps.q.schedule(t + cts.txTimeNs + this.deps.timing.sifsNs, () => this.sendTrigger(owed.phase, n, ids))
  }

  private sendTrigger(phase: Phase, slots: number, staIds: string[]): void {
    const t = this.deps.now()
    const reading = this.readingIn(phase)
    const slotNs = this.slotNsFor(reading)
    const airNs = this.phaseAirNs(slots, reading)
    const frame = ampTriggerFrame({
      src: this.deps.nodeId, dlKbps: this.cfg.dlKbps as AmpDlKbps, ulKbps: this.cfg.ulKbps as AmpUlKbps,
      phase, slots, slotNs, acwe: this.cfg.acwe, sessionId: this.sessionId, staIds, reading,
      roundNs: airNs, signalExtNs: this.deps.timing.signalExtNs,
      channel: AMP_AP_CHANNEL_2G, ulShiftMhz: AMP_UL_SHIFT_MHZ, seedIdx: AMP_SEED_IDX,
    })
    this.phase = phase
    this.slots = slots
    this.slotNs = slotNs
    this.received = new Map()
    this.deps.emit({
      t, type: 'AMP_ROUND', node: this.deps.nodeId, phase, slots, slotNs, acwe: this.cfg.acwe,
      dlKbps: this.cfg.dlKbps, ulKbps: this.cfg.ulKbps, untilNs: t + frame.txTimeNs + airNs,
    })
    this.deps.transmit(frame)
    this.deps.q.schedule(t + frame.txTimeNs + AMP_SIFS_NS, () => this.slotStart(1))
  }

  private slotStart(k: number): void {
    const t = this.deps.now()
    this.current = k
    this.deps.emit({ t, type: 'AMP_SLOT', node: this.deps.nodeId, slot: k, untilNs: t + this.slotNs })
    this.deps.q.schedule(t + this.slotNs + AMP_SIFS_NS, () => this.sendAck(k))
  }

  /** Every slot is closed by an Ack of the same length, naming the tag heard in it — or the AP itself. */
  private sendAck(k: number): void {
    const dst = this.received.get(k) ?? this.deps.nodeId
    const frame = ampAckFrame(this.deps.nodeId, dst, this.cfg.dlKbps as AmpDlKbps, k, this.deps.timing.signalExtNs)
    this.deps.transmit(frame)
    const end = this.deps.now() + frame.txTimeNs
    this.current = 0
    if (k < this.slots) this.deps.q.schedule(end + AMP_SIFS_NS, () => this.slotStart(k + 1))
    // Phase 2: after the channel has ended the Ack's transmission, so the MAC
    // is free to start its post-TXOP backoff at this same instant.
    else this.deps.q.schedule(end, () => this.txopDone(), 2)
  }

  private txopDone(): void {
    this.running = false
    this.current = 0
    if (this.restartPending && this.owed() === null) this.newRound()
    this.deps.done()
  }

  onRxOk(frame: FrameDesc, from: string): void {
    if (!this.running || frame.kind !== 'ampResp') return
    const a = frame.amp
    if (!a || a.slot !== this.current || this.current === 0 || this.received.has(this.current)) return
    this.received.set(this.current, from)
    if (this.phase === 'random' && !this.heard.includes(from)) this.heard.push(from)
  }
}
