/**
 * A mono-static backscatter tag (P802.11bp, 2.4 GHz): no oscillator, no clock, no carrier sense
 * and no battery. It is powered only while the reader's PPDU is on the air, and it answers by
 * switching its antenna's reflection on and off inside the BST-Excitation the reader left open.
 *
 * `ampSta.ts` next door is the Active Tx tier, whose tags at least make their own carrier and
 * count Acks. This one cannot count anything: with no clock, "later" only exists while the
 * carrier is up — which is why every trigger it answers allocates a single slot (PDT
 * 11-26/1519r5 §39.3.3) and every answer is measured from the end of the frame that asked for it.
 *
 * What it does (§39.3.3, §39.4 of the PDTs; MM-29, Motion #239):
 *  - on a broadcast AMP Trigger for random access it draws a new ABOC uniformly from [0, ACW],
 *    ACW = 2^ACWE − 1, and reflects an AMP Response carrying its 16-bit identifier when ABOC is
 *    below the Number of Slots, which for mono-static is 1 — so when ABOC is 0;
 *  - on an AMP RFID frame addressed to its identifier carrying the UHF Read command, it reflects
 *    an AMP RFID frame with the Read reply (its EPC).
 *
 * Until 2026-11-11 the tag ran EPC Gen2's slot counter (Query/QueryRep/ACK, a counter kept across
 * TXOPs), after proposal 11-25/0061r0, which TGbp did not adopt.
 *
 * Sources. The response time T1 is SFD PM-75; everything the code chooses is tagged `model`.
 */
import {
  AMP_BS_LOSS_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WUP_MIN_NS,
  ampBsReplyFrame, monoLeakDbm, readerFloorDbm, type AmpBsUlKbps, type BsReply,
} from './ampBs'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import { Rng } from './rng'
import type { AmpInfo, FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { Ns } from '../model/types'

export interface AmpBsStaCfg {
  apId: string
  /** The tag's 96-bit EPC as 24 hex characters: what a Read returns and what its id is made of. */
  epc: string
}

/**
 * How long after a downlink PPDU ends a tag is still alive.
 *
 * A tag has no clock, so strictly it is unpowered the instant the carrier stops. What keeps it
 * alive through a TXOP is that the reader's next frame comes one T2 later — the gap is the whole
 * mechanism. Modelling it as "unpowered unless the next PPDU arrives within T2 plus a little
 * slack" makes that explicit and costs one timer, where modelling instantaneous death would need
 * the tag to re-boot mid-TXOP off a PPDU with no WUP in front of it, which it cannot do. The slack
 * covers the signal extension trailing each PPDU (6 µs) and leaves 2 µs over.
 *
 * Deliberately *not* the CTS-to-self Duration: that reserves the medium for the reader, and a
 * tag has no idea what a NAV is. model (T2 from TGbp 11-26/0120r0, contribution)
 */
export const AMP_BS_POWER_HOLD_NS: Ns = AMP_BS_T2_NS + 8_000

export class AmpBsStaMac implements PhyListener {
  private state: MacStateName = 'idle'
  /** Alive: a WUP-Excitation reached this tag and the carrier has not stopped since. */
  private powered = false
  /** The excitation power the tag last harvested, in dBm — what its boot record reports. */
  private lastIncidentDbm = 0
  private powerHandle = 0
  private txHandle = 0
  /** True once this tag has said it heard a frame it had no power to act on. */
  private noted = false

  constructor(
    private nodeId: string, private q: EventQueue, private now: () => Ns, private ch: Channel,
    private rng: Rng, private emit: EmitFn, private cfg: AmpBsStaCfg,
  ) {}

  onCcaBusy(): void {}
  onCcaIdle(): void {}

  /**
   * A downlink PPDU has started. The tag knows how long it will last, so this is where it arms
   * the moment it will fall over: the end of this PPDU plus the hold, cancelled the instant the
   * next one starts.
   */
  onRxStart(t: Ns, frame: FrameDesc, _from: string): void {
    if (this.powerHandle) this.q.cancel(this.powerHandle)
    this.powerHandle = this.q.schedule(t + frame.txTimeNs + AMP_BS_POWER_HOLD_NS, () => this.unpower())
    // An unpowered tag is not receiving, it is inert: it shows `rx` only for a PPDU it can act
    // on — one already charging it, or one whose WUP-Excitation is about to.
    const wakes = (frame.amp?.rfid?.wupNs ?? 0) >= AMP_BS_WUP_MIN_NS
    if ((this.powered || wakes) && this.state === 'idle') this.setState('rx')
  }

  /**
   * The frame is complete — the medium resolves a backscatter tag's reception at the end of
   * AMP-Data, because everything after it is carrier the tag has to answer *into*.
   */
  onRxOk(t: Ns, frame: FrameDesc, from: string): void {
    const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
    if (from !== this.cfg.apId || r === undefined) { this.settle(); return }
    // The reader charges at `chargeDbm` up to here; the backscatter law says what reaches us.
    this.lastIncidentDbm = this.ch.bsRxDbm(from, this.nodeId, r.chargeDbm)
    if (!this.powered) {
      if (r.wupNs < AMP_BS_WUP_MIN_NS) {
        // Enough power to demodulate, but no wake-up preamble to boot on: the tag heard the
        // reader and had nothing to think with. Said once, not once per frame.
        if (!this.noted) {
          this.noted = true
          this.emit({ t, type: 'AMP_BS_BOOT', node: this.nodeId, powered: false, incidentDbm: this.lastIncidentDbm })
        }
        this.settle()
        return
      }
      this.powered = true
      this.noted = false
      this.emit({ t, type: 'AMP_BS_BOOT', node: this.nodeId, powered: true, incidentDbm: this.lastIncidentDbm })
    }
    switch (r.cmd) {
      case 'trigger': this.onTrigger(t, r); break
      case 'read': this.onRead(t, frame, r); break
      default: this.settle(); break
    }
  }

  onRxCorrupt(_t: Ns): void {
    this.settle()
  }

  /**
   * A broadcast AMP Trigger for random access (§39.4): a new ABOC from [0, ACW], and an answer in
   * slot ABOC + 1 if that slot exists. A mono-static trigger allocates a single slot (§39.3.3), so
   * only ABOC = 0 answers; nothing is kept for the next trigger.
   */
  private onTrigger(t: Ns, r: Rfid): void {
    const acw = 2 ** (r.acwe ?? 0) - 1
    const aboc = this.rng.int(acw)
    const slot = aboc < 1 ? 1 : null
    this.emit({ t, type: 'AMP_ABOC', node: this.nodeId, aboc, acw, slot })
    if (slot === null) { this.settle(); return }
    this.answer(t, r, 'id')
  }

  /**
   * An AMP RFID frame carrying the UHF Read command. It names the tag by its 16-bit ID, which
   * SFD FM-25 defines as the CRC-16 of the EPC — `dst` is the engine's name for the same thing.
   */
  private onRead(t: Ns, frame: FrameDesc, r: Rfid): void {
    if (frame.dst !== this.nodeId) { this.settle(); return }
    this.answer(t, r, 'read')
  }

  /**
   * Schedule the reflection, T1 after the end of AMP-Data — which is `t`, because that is where
   * the tag's reception resolved — inside the excitation the reader sized for exactly that.
   */
  private answer(t: Ns, r: Rfid, reply: BsReply): void {
    const slot = r.slot
    const kbps = r.ulKbps
    const bsDbm = r.bsDbm
    if (this.txHandle) this.q.cancel(this.txHandle)
    this.txHandle = this.q.schedule(t + AMP_BS_T1_NS, () => this.backscatter(reply, slot, kbps, bsDbm))
  }

  private backscatter(reply: BsReply, slot: number, kbps: AmpBsUlKbps, bsDbm: number): void {
    this.txHandle = 0
    if (!this.powered) return
    const t = this.now()
    const frame = ampBsReplyFrame({
      // An AMP Response carries only the 16-bit ID, the CRC-16 of the EPC (SFD FM-25): the EPC
      // rides on the descriptor so the receiver can derive the ID from it. A Read reply carries
      // the EPC itself.
      src: this.nodeId, dst: this.cfg.apId, reply, kbps, slot, epc: this.cfg.epc,
    })
    // What the reader will get: the excitation to here, 6 dB down in the reflection, and back
    // over the same path — against the floor the reader's own leakage leaves it with.
    const incidentDbm = this.ch.bsRxDbm(this.cfg.apId, this.nodeId, bsDbm)
    const rxDbmAtAp = this.ch.bsRxDbm(this.nodeId, this.cfg.apId, incidentDbm - AMP_BS_LOSS_DB)
    this.emit({
      t, type: 'AMP_BS_REPLY', node: this.nodeId, kind: reply, slot, rxDbmAtAp,
      snrDb: rxDbmAtAp - readerFloorDbm(monoLeakDbm(bsDbm)),
    })
    this.setState('tx')
    this.ch.startTx(this.nodeId, frame)
    this.q.schedule(t + frame.txTimeNs, () => this.settle(), 2)
  }

  /** The carrier stopped for long enough: the tag simply ceases to exist until the next WUP. */
  private unpower(): void {
    this.powerHandle = 0
    if (!this.powered) return
    this.powered = false
    this.noted = false
    if (this.txHandle) { this.q.cancel(this.txHandle); this.txHandle = 0 }
    this.setState('idle')
  }

  /** The label a tag shows between frames: nothing at all — it holds no state between them. */
  private settle(): void {
    if (this.state === 'tx' && this.ch.isTransmitting(this.nodeId)) return
    this.setState('idle')
  }

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }
}

/** The downlink fields of a mono-static PPDU, as the tag reads them. */
type Rfid = NonNullable<AmpInfo['rfid']>
