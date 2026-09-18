/**
 * The AP side of an IEEE P802.11bp Active Tx polling round (2.4 GHz): a
 * triggering frame, a fixed number of uplink slots, and one AMP Ack per slot
 * naming whoever was heard in it (PDT 11-26/1519r5 clause 39.3 triggering
 * procedure; 11-26/1889r4 clause 39.4 UL channel access).
 *
 * The round owns nothing but its own timers: it puts frames on the air through
 * `deps.transmit` and reports the end through `deps.done`, so the MAC decides
 * how the round fits into EDCA (it runs as one AC_BK exchange, optionally
 * fronted by a CTS-to-self whose Duration covers everything that follows).
 */
import {
  AMP_ACK_BYTES, AMP_SIFS_NS, ampAckFrame, ampDlPpduNs, ampRespBytes, ampTriggerBytes, ampTriggerFrame, ampUlPpduNs,
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
  /** The round is over: the MAC closes the exchange with a post-transmission backoff. */
  done(): void
}

type Phase = 'random' | 'scheduled'

export class AmpApRound {
  private running = false
  private sessionId = 0
  /** The slot the round is in right now (0 outside a slot). */
  private current = 0
  private phase: Phase = 'random'
  private slots = 0
  private slotNs: Ns = 0
  /** Tags heard in this round's random phase, in slot order — the scheduled phase's list. */
  private heard: string[] = []
  /** slot → the tag whose response decoded in it. */
  private received = new Map<number, string>()

  constructor(private cfg: AmpApCfg, private deps: AmpApDeps) {}

  get active(): boolean {
    return this.running
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

  /** Total air of one phase after its trigger PPDU: N × (slot + 2·AMP SIFS + Ack). */
  phaseAirNs(slots: number, reading: boolean): Ns {
    return slots * (this.slotNsFor(reading) + 2 * AMP_SIFS_NS + this.ackNs())
  }

  /** Everything the CTS-to-self must cover: trigger + phase (+ a worst-case scheduled phase in twoPhase). */
  roundNs(): Ns {
    const first = this.readingIn('random')
    let ns = this.triggerNs(0) + this.phaseAirNs(this.cfg.slots, first)
    if (this.cfg.readMode === 'twoPhase') {
      // Worst case: every slot of the random phase was heard, so the scheduled
      // phase lists cfg.slots tags and reads them all.
      ns += AMP_SIFS_NS + this.triggerNs(this.cfg.slots) + this.phaseAirNs(this.cfg.slots, true)
    }
    return ns
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.sessionId = (this.sessionId % 255) + 1
    if (this.cfg.protection !== 'ctsSelf') {
      this.sendTrigger('random')
      return
    }
    // CTS-to-self (§10.23.2.8): one Duration reserving the whole round for the
    // Wi-Fi stations that cannot hear the tags' uplink as a PPDU at all.
    const t = this.deps.now()
    const cts: FrameDesc = {
      kind: 'cts', src: this.deps.nodeId, dst: this.deps.nodeId, bytes: CTS_BYTES, mbps: 6,
      durationFieldNs: this.roundNs() + this.deps.timing.sifsNs,
      txTimeNs: txTimeNs(CTS_BYTES, 6) + this.deps.timing.signalExtNs,
    }
    this.deps.transmit(cts)
    this.deps.q.schedule(t + cts.txTimeNs + this.deps.timing.sifsNs, () => this.sendTrigger('random'))
  }

  private sendTrigger(phase: Phase, staIds: string[] = []): void {
    const t = this.deps.now()
    const reading = this.readingIn(phase)
    const slots = phase === 'scheduled' ? staIds.length : this.cfg.slots
    const slotNs = this.slotNsFor(reading)
    const airNs = this.phaseAirNs(slots, reading)
    const frame = ampTriggerFrame({
      src: this.deps.nodeId, dlKbps: this.cfg.dlKbps as AmpDlKbps, ulKbps: this.cfg.ulKbps as AmpUlKbps,
      phase, slots, slotNs, acwe: this.cfg.acwe, sessionId: this.sessionId, staIds, reading,
      roundNs: airNs, signalExtNs: this.deps.timing.signalExtNs,
    })
    this.phase = phase
    this.slots = slots
    this.slotNs = slotNs
    this.heard = []
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
    // is free to start its post-round backoff at this same instant.
    else this.deps.q.schedule(end, () => this.phaseDone(), 2)
  }

  private phaseDone(): void {
    if (this.phase === 'random' && this.cfg.readMode === 'twoPhase' && this.heard.length > 0) {
      const ids = [...this.heard]
      this.deps.q.schedule(this.deps.now() + AMP_SIFS_NS, () => this.sendTrigger('scheduled', ids))
      return
    }
    this.running = false
    this.current = 0
    this.deps.done()
  }

  onRxOk(frame: FrameDesc, from: string): void {
    if (!this.running || frame.kind !== 'ampResp') return
    const a = frame.amp
    if (!a || a.slot !== this.current || this.current === 0 || this.received.has(this.current)) return
    this.received.set(this.current, from)
    if (this.phase === 'random') this.heard.push(from)
  }
}
