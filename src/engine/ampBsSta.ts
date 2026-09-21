/**
 * A mono-static backscatter tag (P802.11bp, 2.4 GHz): no oscillator, no clock, no carrier sense
 * and no battery. It is powered only while the reader's PPDU is on the air, and it answers by
 * switching its antenna's reflection on and off inside the BST-Excitation the reader left open.
 *
 * `ampSta.ts` next door is the Active Tx tier, whose tags at least make their own carrier and
 * count Acks. This one cannot count anything: with no clock, "later" only exists while the
 * carrier is up. That single fact shapes the whole class — the power-hold timer below, the slot
 * counter that survives a TXOP only because Gen2 says it may, and the replies that are all
 * measured from the end of the command rather than from any schedule.
 *
 * Sources. The slot-counter algorithm and the reply shapes are EPC Gen2 (ISO/IEC 18000-63),
 * which SFD MM-10 / MM-29 / FM-44 adopt by reference; the response times are SFD PM-75 (T1) and
 * TGbp 11-26/0120r0 (T3, contribution). Everything the code chooses is tagged `model`.
 */
import {
  AMP_BS_LOSS_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, AMP_BS_WUP_MIN_NS,
  ampBsReplyFrame, monoLeakDbm, readerFloorDbm, type AmpBsUlKbps, type Gen2Reply,
} from './ampBs'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import { Rng } from './rng'
import type { AmpInfo, FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { Ns } from '../model/types'

export interface AmpBsStaCfg {
  apId: string
  /** The tag's 96-bit EPC as 24 hex characters: what it backscatters and what its id is made of. */
  epc: string
}

/**
 * How long after a downlink PPDU ends a tag is still alive.
 *
 * A tag has no clock, so strictly it is unpowered the instant the carrier stops. What keeps it
 * alive through a round is that the reader's next command comes one T2 later — the gap is the
 * whole mechanism. Modelling it as "unpowered unless the next PPDU arrives within T2 plus a
 * little slack" makes that explicit and costs one timer, where modelling instantaneous death
 * would need the tag to re-boot mid-TXOP off a PPDU with no WUP in front of it, which it cannot
 * do. The slack covers the signal extension trailing each PPDU (6 µs) and leaves 2 µs over.
 *
 * Deliberately *not* the CTS-to-self Duration: that reserves the medium for the reader, and a
 * tag has no idea what a NAV is. model (T2 from TGbp 11-26/0120r0, contribution)
 */
export const AMP_BS_POWER_HOLD_NS: Ns = AMP_BS_T2_NS + 8_000

/** The stream id the RN16 draws from, kept apart from the slot counter's. model */
const RN16_STREAM = 0x524e

export class AmpBsStaMac implements PhyListener {
  private state: MacStateName = 'idle'
  /** Alive: a WUP-Excitation reached this tag and the carrier has not stopped since. */
  private powered = false
  /** Gen2 slot counter: null when this tag is not waiting for a slot of the current inventory. */
  private counter: number | null = null
  /** Gen2's A/B flag (model): set by a successful EPC reply, cleared by a new session number. */
  private inventoried = false
  private session = 0
  /** The handle this tag backscattered in the slot it answered, or null. */
  private rn16: number | null = null
  /** The excitation power the tag last harvested, in dBm — what its boot record reports. */
  private lastIncidentDbm = 0
  private powerHandle = 0
  private txHandle = 0
  /** True once this tag has said it heard a command it had no power to act on. */
  private noted = false
  /** RN16s come from a stream of their own, so a scene's slot counters replay on their own. */
  private rn16Rng: Rng

  constructor(
    private nodeId: string, private q: EventQueue, private now: () => Ns, private ch: Channel,
    private rng: Rng, private emit: EmitFn, private cfg: AmpBsStaCfg,
  ) {
    this.rn16Rng = rng.fork(RN16_STREAM)
  }

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
    // on — one already charging it, or one whose WUP-Excitation is about to. Otherwise the lane
    // would draw a reception for a tag the model says is not thinking at all.
    const wakes = (frame.amp?.rfid?.wupNs ?? 0) >= AMP_BS_WUP_MIN_NS
    if ((this.powered || wakes) && (this.state === 'idle' || this.state === 'bsWait')) this.setState('rx')
  }

  /**
   * The command is complete — the medium resolves a backscatter tag's reception at the end of
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
        // reader and had nothing to think with. Said once, not once per command.
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
      case 'query': this.onQuery(t, r); break
      case 'queryRep': this.onQueryRep(t, r); break
      case 'ack': this.onAck(t, frame, r); break
      case 'read':
      case 'write': this.onAccess(t, frame, r); break
      default: this.settle(); break
    }
  }

  onRxCorrupt(_t: Ns): void {
    this.settle()
  }

  /** A Query opens an inventory: a new session clears the flag, and every eligible tag draws. */
  private onQuery(t: Ns, r: Rfid): void {
    if (r.session !== this.session) {
      this.session = r.session
      this.inventoried = false
    }
    if (this.inventoried) { this.settle(); return }
    const q = r.q ?? 0
    this.counter = this.rng.int(2 ** q - 1)
    this.emit({ t, type: 'AMP_BS_COUNTER', node: this.nodeId, counter: this.counter, q })
    if (this.counter === 0) this.answer(t, r, 'rn16')
    else this.setState('bsWait')
  }

  /**
   * A QueryRep moves the round on one slot. Gen2: every tag still in the round decrements, and
   * whoever reaches zero backscatters its handle.
   */
  private onQueryRep(t: Ns, r: Rfid): void {
    if (this.inventoried || this.counter === null) { this.settle(); return }
    if (this.counter > 0) this.counter--
    if (this.counter === 0) this.answer(t, r, 'rn16')
    else this.setState('bsWait')
  }

  /** The reader read this tag's handle out of the noise: answer with the EPC itself. */
  private onAck(t: Ns, frame: FrameDesc, r: Rfid): void {
    if (this.rn16 === null || r.rn16 !== this.rn16 || frame.dst !== this.nodeId) { this.settle(); return }
    this.inventoried = true
    this.answer(t, r, 'epc')
  }

  /**
   * A Read or a Write addressed to this tag. The command names it by its 16-bit id, which
   * SFD FM-25 defines as the CRC-16 of the EPC — `dst` is the engine's name for the same thing —
   * and carries the handle the tag backscattered, which is what makes it this tag's business.
   */
  private onAccess(t: Ns, frame: FrameDesc, r: Rfid): void {
    if (frame.dst !== this.nodeId || r.rn16 !== this.rn16) { this.settle(); return }
    this.answer(t, r, r.cmd === 'read' ? 'read' : 'write')
  }

  /**
   * Schedule the reflection. An immediate answer comes T1 after the end of AMP-Data — which is
   * `t`, because that is where the tag's reception resolved — and a Write's comes T3 later, both
   * inside the excitation the reader sized for exactly that.
   */
  private answer(t: Ns, r: Rfid, reply: Gen2Reply): void {
    if (reply === 'rn16') {
      this.rn16 = this.rn16Rng.int(0xffff)
      // Answering uses the slot up: a tag that is not acknowledged does not try again in the
      // next one (Gen2 rolls its counter under instead; the effect is the same and this says so).
      this.counter = null
    }
    const delayNs = reply === 'write' ? AMP_BS_WRITE_T3_NS : AMP_BS_T1_NS
    const slot = r.slot
    const kbps = r.ulKbps
    const bsDbm = r.bsDbm
    if (this.txHandle) this.q.cancel(this.txHandle)
    this.txHandle = this.q.schedule(t + delayNs, () => this.backscatter(reply, slot, kbps, bsDbm))
  }

  private backscatter(reply: Gen2Reply, slot: number, kbps: AmpBsUlKbps, bsDbm: number): void {
    this.txHandle = 0
    if (!this.powered) return
    const t = this.now()
    const frame = ampBsReplyFrame({
      src: this.nodeId, dst: this.cfg.apId, reply, kbps, slot,
      rn16: this.rn16 ?? undefined, epc: reply === 'epc' ? this.cfg.epc : undefined,
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
    this.rn16 = null
    if (this.txHandle) { this.q.cancel(this.txHandle); this.txHandle = 0 }
    // The slot counter and the session flag are *not* cleared: Gen2 lets a tag carry them
    // between the reader's TXOPs, which is what lets one inventory span several of them
    // (11-25/0061r0's "Extend", model).
    this.setState('idle')
  }

  /** The label a tag shows between commands: waiting for its slot, or nothing at all. */
  private settle(): void {
    if (this.state === 'tx' && this.ch.isTransmitting(this.nodeId)) return
    this.setState(this.powered && this.counter !== null && this.counter > 0 ? 'bsWait' : 'idle')
  }

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }
}

/** The downlink command fields of an AMP RFID frame, as the tag reads them. */
type Rfid = NonNullable<AmpInfo['rfid']>
