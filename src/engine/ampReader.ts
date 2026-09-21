/**
 * The reader side of a mono-static backscatter inventory (P802.11bp, 2.4 GHz): an EPC Gen2
 * slot-counter round tunnelled inside AMP RFID frames, run under one AC_BK TXOP.
 *
 * `ampAp.ts` next door is the Active Tx tier, where the AP opens uplink slots and the tags make
 * their own carrier. Here nothing the tags send exists without the reader: every command PPDU
 * ends in a BST-Excitation, and the answer is that same carrier reflected back. So the round is
 * not a schedule of slots the tags fill in — it is a strict question-and-answer, one command at
 * a time, each one waiting `AMP_BS_T2_NS` after the last PPDU (excitation included) ended.
 *
 * The round owns nothing but its own timers: frames go out through `deps.transmit`, the end of a
 * TXOP is reported through `deps.done`, and the MAC decides how that fits into EDCA.
 *
 * Sources. SFD MM-10 / MM-29 adopt EPC Gen2 (ISO/IEC 18000-63) by reference; the slot algorithm,
 * the persistence of counters across TXOPs and the TXOP budget are `model`, following
 * TGbp 11-25/0061r0 (contribution). Nothing of the draft's text is reproduced.
 */
import {
  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, ampRfidFrame, bsReplyNs, bstNs, epcOf,
  type AmpBsUlKbps, type Gen2Cmd, type Gen2Reply,
} from './ampBs'
import type { AmpApDeps } from './ampAp'
import { bsDataEndNs } from './channel'
import { CTS_BYTES, txTimeNs } from './phy'
import type { FrameDesc } from '../model/frames'
import type { AmpApCfg, AmpBackscatterCfg } from '../model/scenario'
import type { Ns } from '../model/types'

/** An AP configured as a mono-static reader: `backscatter` is what makes it one. */
export type AmpReaderCfg = AmpApCfg & { backscatter: NonNullable<AmpApCfg['backscatter']> }

/**
 * The round's dependencies: the Active Tx round's, plus one query only a reader needs.
 *
 * `bstEnergy()` is energy detection inside the reader's own excitation — "is anything reflecting
 * right now?" — and it is what separates a slot two tags answered in from a slot nobody answered
 * in. A reader cannot decode two reflections that arrive together (they sit on top of each other
 * at the same 3 dB the acquisition needs), so decoding cannot tell the two cases apart; real
 * EPC Gen2 readers measure the slot's energy instead, and so does this one. `model`
 */
export interface AmpReaderDeps extends AmpApDeps {
  bstEnergy(): boolean
}

/** One command the reader has decided to send, and what it expects to hear back. */
interface Command {
  cmd: Gen2Cmd
  /** The Gen2 reply the BST-Excitation is sized for, or null when nothing is expected. */
  reply: Gen2Reply | null
  /** Set on a Write: the reply comes T3 later, so the excitation is stretched over it. */
  delayedT3Ns?: Ns
  /** Query only: the slot count it announces, as 2^Q. */
  q?: number
  /** ACK / Read / Write: the handle the addressed tag backscattered. */
  rn16?: number
  dst: string
  epc?: string
  /** True when sending this command opens a new slot of the inventory. */
  opensSlot: boolean
}

const BROADCAST = '*tags'

export class AmpInventoryRound {
  private running = false
  private session = 0
  /** Slots of this inventory not yet offered. 2^Q at the start of a session, 0 when it is done. */
  private remaining = 0
  /** The slot the reader is in, 1-based within the session. */
  private slot = 0
  /** Commands still owed inside the current slot: ACK → Read → Write. */
  private queued: Command[] = []
  /** The first PPDU of a TXOP carries the WUP-Excitation; the rest of the TXOP does not. */
  private wupPending = false
  private txopStartNs: Ns = 0
  private txopSlots = 0
  private txopRead: string[] = []
  private txopCollisions = 0
  private txopEmpties = 0
  /** Did the last TXOP get anywhere? A TXOP too short for one command must not be retried forever. */
  private progressed = false
  /** The first reply decoded inside the command on the air, and whether one failed to decode. */
  private lastReply: { frame: FrameDesc; from: string } | null = null
  /** Something answered in this slot, whether or not the reader could read it. */
  private lastAnswered = false

  constructor(private cfg: AmpReaderCfg, private deps: AmpReaderDeps) {}

  get active(): boolean {
    return this.running
  }

  /**
   * Is there an inventory worth asking for another TXOP for? A session whose slots are all
   * offered is finished; a TXOP that could not fit a single command would only repeat itself.
   */
  get resumable(): boolean {
    return !this.running && this.remaining > 0 && this.progressed
  }

  /**
   * The poll clock ticked: whatever the last inventory left behind, the next TXOP starts a fresh
   * one under a new session number — which is what clears every tag's inventoried flag (Gen2's
   * A/B flag, model).
   */
  newInventory(): void {
    this.remaining = 0
  }

  private get bs(): AmpBackscatterCfg {
    return this.cfg.backscatter
  }

  private get txopNs(): Ns {
    return this.bs.txopMs * 1_000_000
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.txopStartNs = this.deps.now()
    this.txopSlots = 0
    this.txopRead = []
    this.txopCollisions = 0
    this.txopEmpties = 0
    this.wupPending = true
    // A TXOP that resumes an unfinished session keeps its number, and the tags keep the counters
    // they drew under it (11-25/0061r0's "Extend", model); only an exhausted one starts over.
    if (this.remaining === 0) {
      this.session = (this.session % 255) + 1
      this.remaining = 2 ** this.bs.q
      this.slot = 0
    }
    if (this.cfg.protection !== 'ctsSelf') {
      this.step()
      return
    }
    // CTS-to-self (§10.23.2.8) reserving the whole TXOP: the Wi-Fi stations in the room cannot
    // hear a tag at all, and a reflection landing under their data is simply lost.
    const t = this.deps.now()
    const cts: FrameDesc = {
      kind: 'cts', src: this.deps.nodeId, dst: this.deps.nodeId, bytes: CTS_BYTES, mbps: 6,
      durationFieldNs: this.txopNs,
      txTimeNs: txTimeNs(CTS_BYTES, 6) + this.deps.timing.signalExtNs,
    }
    this.deps.transmit(cts)
    this.deps.q.schedule(t + cts.txTimeNs + this.deps.timing.sifsNs, () => this.step())
  }

  /** The next command of the round, or null when the session has offered all its slots. */
  private nextCommand(): Command | null {
    const owed = this.queued.shift()
    if (owed !== undefined) return owed
    if (this.remaining === 0) return null
    // A session's first slot is opened by the Query that announces Q; every later one, in this
    // TXOP or a later one, by a QueryRep that simply says "next slot".
    const first = this.slot === 0
    return {
      cmd: first ? 'query' : 'queryRep', reply: 'rn16', q: first ? this.bs.q : undefined,
      dst: BROADCAST, opensSlot: true,
    }
  }

  private build(c: Command, wupNs: Ns, slot: number): FrameDesc {
    return ampRfidFrame({
      src: this.deps.nodeId, dst: c.dst, cmd: c.cmd, session: this.session, q: c.q, rn16: c.rn16,
      slot, ulKbps: this.bs.ulKbps as AmpBsUlKbps, wupNs,
      bstNs: bstNs(c.reply, this.bs.ulKbps as AmpBsUlKbps, c.delayedT3Ns),
      chargeDbm: this.bs.chargeDbm, bsDbm: this.bs.bsDbm,
      signalExtNs: this.deps.timing.signalExtNs, epc: c.epc,
    })
  }

  /** Send the next command, or close the TXOP because the session is done or the budget is spent. */
  private step(): void {
    const c = this.nextCommand()
    if (c === null) {
      this.endTxop()
      return
    }
    const wupNs = this.wupPending ? Math.round(this.bs.wupMs * 1_000_000) : 0
    const slot = c.opensSlot ? this.slot + 1 : this.slot
    const frame = this.build(c, wupNs, slot)
    const t = this.deps.now()
    if (t + frame.txTimeNs > this.txopStartNs + this.txopNs) {
      // Not enough air left for this PPDU. A command that would have opened a slot has not
      // opened it, so the next TXOP offers it; one owed inside a slot is dropped, because the
      // tag's handle only lives as long as the carrier that lit it.
      if (!c.opensSlot) this.queued = []
      this.endTxop()
      return
    }
    this.wupPending = false
    if (c.opensSlot) {
      this.slot = slot
      this.remaining--
      this.txopSlots++
    }
    this.lastReply = null
    this.lastAnswered = false
    this.deps.emit({
      t, type: 'AMP_RFID', node: this.deps.nodeId, cmd: c.cmd, session: this.session, q: c.q,
      slot, bstNs: frame.amp!.rfid!.bstNs, untilNs: t + frame.txTimeNs,
    })
    this.deps.transmit(frame)
    // Listen for energy in the middle of where the answer is due. Decoding alone cannot tell a
    // collided slot from an empty one, because two reflections that arrive together are not
    // acquired at all.
    if (c.reply !== null) {
      const replyStart = bsDataEndNs(frame)! + (c.delayedT3Ns ?? AMP_BS_T1_NS)
      const probe = t + replyStart + Math.round(bsReplyNs(c.reply, this.bs.ulKbps as AmpBsUlKbps) / 2)
      this.deps.q.schedule(probe, () => { this.lastAnswered ||= this.deps.bstEnergy() })
    }
    // The tag answers inside this PPDU's own excitation, so by the time the next command is due
    // — one T2 after the PPDU ends — the slot has already resolved.
    this.deps.q.schedule(t + frame.txTimeNs + AMP_BS_T2_NS, () => this.resolve(c))
  }

  /** What came back inside the command's excitation decides what the reader says next. */
  private resolve(c: Command): void {
    const bs = this.lastReply?.frame.amp?.bs
    const from = this.lastReply?.from
    switch (c.reply) {
      case 'rn16':
        if (bs?.reply === 'rn16' && bs.rn16 !== undefined && from !== undefined) {
          // Exactly one RN16 decoded: acknowledge it and the tag answers with its EPC.
          this.queued.push({ cmd: 'ack', reply: 'epc', rn16: bs.rn16, dst: from, opensSlot: false })
        } else if (this.lastAnswered) {
          this.txopCollisions++
        } else {
          this.txopEmpties++
        }
        break
      case 'epc':
        if (bs?.reply === 'epc' && from !== undefined) {
          this.txopRead.push(bs.epc ?? epcOf(from))
          this.queueAccess(c, from, bs.epc)
        }
        break
      case 'read':
        if (bs?.reply === 'read' && from !== undefined && this.bs.write) {
          this.queued.push(this.writeCommand(c, from, bs.epc))
        }
        break
      default:
        break
    }
    this.step()
  }

  /** After an EPC: a Read if the scenario asks for one, then a Write, then the next slot. */
  private queueAccess(c: Command, dst: string, epc: string | undefined): void {
    if (this.bs.read) {
      this.queued.push({ cmd: 'read', reply: 'read', rn16: c.rn16, dst, epc, opensSlot: false })
    } else if (this.bs.write) {
      this.queued.push(this.writeCommand(c, dst, epc))
    }
  }

  /** A Write answers after T3 = 2 ms, so its excitation is the delayed kind. */
  private writeCommand(c: Command, dst: string, epc: string | undefined): Command {
    return {
      cmd: 'write', reply: 'write', delayedT3Ns: AMP_BS_WRITE_T3_NS,
      rn16: c.rn16, dst, epc, opensSlot: false,
    }
  }

  private endTxop(): void {
    const t = this.deps.now()
    this.queued = []
    this.running = false
    this.progressed = this.txopSlots > 0
    this.deps.emit({
      t, type: 'AMP_INVENTORY', node: this.deps.nodeId, session: this.session,
      slotsOffered: this.txopSlots, read: this.txopRead, collisions: this.txopCollisions,
      empties: this.txopEmpties, txopNs: t - this.txopStartNs, complete: this.remaining === 0,
    })
    this.deps.done()
  }

  onRxOk(frame: FrameDesc, from: string): void {
    if (!this.running || frame.kind !== 'ampBsReply') return
    // Only one reflection can be decoded out of one excitation; a second is interference, which
    // the medium has already turned into an RX_FAIL.
    if (this.lastReply === null) this.lastReply = { frame, from }
  }

  /**
   * A reflection that was acquired and then did not decode — a Wi-Fi frame landing on top of it,
   * or a second tag that started late enough to be heard as interference rather than as a rival
   * preamble. The PHY listener interface carries no failure reason and the reader needs none:
   * something answered and could not be read, which is exactly what `collisions` counts.
   */
  onRxFail(): void {
    if (this.running) this.lastAnswered = true
  }
}
