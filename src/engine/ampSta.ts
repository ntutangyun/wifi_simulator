/**
 * Active Tx non-AP AMP STA (P802.11bp, 2.4 GHz): a tag with no carrier sense
 * and no NAV that transmits only in a time slot an AMP triggering frame
 * allocates (PDT 11-26/1889r4 clause 39.4; 11-26/1519r5 clause 39.3).
 */
import { AMP_SIFS_NS, ampRespFrame, type AmpUlKbps } from './amp'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import { Rng } from './rng'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { Ns } from '../model/types'

export interface AmpStaCfg {
  apId: string
  id16: number
}

interface Round {
  slot: number
  aboc: number | undefined
  ulKbps: AmpUlKbps
  reading: boolean
  acksSeen: number
  sent: boolean
  endHandle: number
  txHandle: number
}

/** Grace after the announced round length before an unclosed round is abandoned. */
const ROUND_GRACE_NS: Ns = 50_000

export class AmpStaMac implements PhyListener {
  private state: MacStateName = 'idle'
  private round: Round | null = null

  constructor(
    private nodeId: string, private q: EventQueue, private now: () => Ns, private ch: Channel,
    private rng: Rng, private emit: EmitFn, private cfg: AmpStaCfg,
  ) {}

  onCcaBusy(): void {}
  onCcaIdle(): void {}

  onRxStart(_t: Ns, _frame: FrameDesc, _from: string): void {
    if (this.state === 'idle') this.setState('rx')
  }

  onRxOk(t: Ns, frame: FrameDesc, from: string): void {
    if (from !== this.cfg.apId || !frame.amp) { this.settle(); return }
    if (frame.kind === 'ampTrigger') this.onTrigger(t, frame)
    else if (frame.kind === 'ampAck') this.onAck(t, frame)
    else this.settle()
  }

  onRxCorrupt(_t: Ns): void {
    // The Ack this tag keys its slot on (or the one that would acknowledge it) did not decode: the round is lost.
    if (this.round) this.giveUp()
    else this.settle()
  }

  private onTrigger(t: Ns, frame: FrameDesc): void {
    const a = frame.amp!
    this.closeRound()
    let slot: number | null
    let aboc: number | undefined
    let acw = 0
    if (a.phase === 'scheduled') {
      const i = (a.staIds ?? []).indexOf(this.nodeId)
      if (i < 0) { this.settle(); return }
      slot = i + 1
    } else {
      acw = 2 ** (a.acwe ?? 0) - 1
      aboc = this.rng.int(acw)
      slot = aboc < (a.slots ?? 1) ? aboc + 1 : null
    }
    this.emit({ t, type: 'AMP_ABOC', node: this.nodeId, aboc: aboc ?? 0, acw, slot })
    if (slot === null) { this.settle(); return }
    const round: Round = { slot, aboc, ulKbps: this.ulRateOf(frame), reading: a.reading ?? false, acksSeen: 0, sent: false, endHandle: 0, txHandle: 0 }
    this.round = round
    round.endHandle = this.q.schedule(t + (a.roundNs ?? 0) + ROUND_GRACE_NS, () => this.giveUp())
    if (slot === 1) round.txHandle = this.q.schedule(t + AMP_SIFS_NS, () => this.transmitResponse())
    else this.setState('ampWait')
  }

  /** The UL rate the trigger dictates (PDT 39.3.2.1 "UL data rate"): carried in AmpInfo.ulKbps. */
  private ulRateOf(frame: FrameDesc): AmpUlKbps {
    return (frame.amp!.ulKbps ?? 250) as AmpUlKbps
  }

  private onAck(t: Ns, frame: FrameDesc): void {
    const r = this.round
    if (!r) { this.settle(); return }
    const ackFor = frame.amp!.ackFor ?? 0
    if (!r.sent) {
      r.acksSeen++
      if (r.acksSeen === r.slot - 1) {
        r.txHandle = this.q.schedule(t + AMP_SIFS_NS, () => this.transmitResponse())
      } else if (ackFor >= r.slot) {
        this.giveUp()
      }
      return
    }
    if (ackFor === r.slot) {
      const acked = frame.dst === this.nodeId
      this.emit({ t, type: 'AMP_RESULT', node: this.nodeId, slot: r.slot, sent: true, acked })
      this.closeRound()
      this.setState('idle')
    }
  }

  private transmitResponse(): void {
    const r = this.round
    if (!r) return
    r.txHandle = 0
    const frame = ampRespFrame(this.nodeId, this.cfg.apId, r.ulKbps, r.slot, r.aboc, r.reading)
    this.setState('tx')
    this.ch.startTx(this.nodeId, frame)
    this.q.schedule(this.now() + frame.txTimeNs, () => { r.sent = true; this.setState('ampWait') }, 2)
  }

  private giveUp(): void {
    const r = this.round
    if (!r) return
    this.emit({ t: this.now(), type: 'AMP_RESULT', node: this.nodeId, slot: r.slot, sent: r.sent, acked: false })
    this.closeRound()
    this.setState('idle')
  }

  private closeRound(): void {
    const r = this.round
    if (!r) return
    if (r.endHandle) this.q.cancel(r.endHandle)
    if (r.txHandle) this.q.cancel(r.txHandle)
    this.round = null
  }

  /** Back to the label a listening tag shows. */
  private settle(): void {
    if (this.state === 'rx') this.setState(this.round ? 'ampWait' : 'idle')
  }

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }
}
