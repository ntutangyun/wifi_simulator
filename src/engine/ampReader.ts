/**
 * The reader side of a mono-static backscatter inventory (P802.11bp, 2.4 GHz), run in AC_BK
 * TXOPs of the AP, each bounded by the AP's AC_BK TXOP limit (§10.23.2.9; dot11QAPEDCATable,
 * 2.528 ms by default, Table 9-194).
 *
 * `ampAp.ts` next door is the Active Tx tier, where the AP opens uplink slots and the tags make
 * their own carrier. Here nothing the tags send exists without the reader: every downlink PPDU
 * ends in a BST-Excitation, and the answer is that same carrier reflected back. So the inventory
 * is a strict question-and-answer, one frame at a time, each waiting `AMP_BS_T2_NS` after the last
 * PPDU (excitation included) ended.
 *
 * What it sends, and only that (PDT 11-26/1519r5 §39.3.3; PDT 11-26/1520r3; PDT 11-26/1798r1):
 *  - a broadcast **AMP Trigger** for random access — ID 0xFFFF, Session ID, ACWE, UL data rate,
 *    slot duration — allocating a single slot. A tag whose new ABOC is 0 reflects an AMP Response
 *    with its 16-bit identifier;
 *  - for every identifier heard (when `read` is set), an individually addressed **AMP RFID**
 *    frame carrying the UHF Read command, whose reply carries the tag's EPC. The response is
 *    exchanged in the same TXOP as the command (PDT 1798r1), inside the same PPDU's excitation.
 *
 * Not sent: Select (optional, Motion #241 — the reader addresses tags by the identifier it heard),
 * Write (its ≥ 2 ms response time stretches the excitation past the AC_BK TXOP limit) and
 * Authenticate. An inventory that does not fit one TXOP continues in the next AC_BK TXOP the AP
 * wins: every trigger is independent (a new ABOC each time, §39.4), and a heard identifier stays
 * addressable, so nothing is lost at the boundary.
 *
 * The round owns nothing but its own timers: frames go out through `deps.transmit`, the end of a
 * TXOP is reported through `deps.done`, and the MAC decides how that fits into EDCA.
 *
 * Until 2026-11-11 this file ran EPC Gen2's Query/QueryRep/ACK slot-counter inventory after
 * proposal 11-25/0061r0, which TGbp did not adopt, in a 4 ms TXOP of its own.
 */
import {
  AMP_BS_T1_NS, AMP_BS_T2_NS, ampRfidFrame, bsReplyNs, bstNs, crc16Epc, epcOf,
  type AmpBsUlKbps, type BsCmd, type BsReply,
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
 * at the same 3 dB the acquisition needs), so decoding cannot tell the two cases apart. `model`
 */
export interface AmpReaderDeps extends AmpApDeps {
  bstEnergy(): boolean
}

/** One frame the reader has decided to send, and what it expects back. */
interface Command {
  cmd: BsCmd
  reply: BsReply
  /** Read only: the tag addressed (node id) and its EPC, which its 16-bit ID is the CRC-16 of. */
  dst: string
  epc?: string
}

/** The destination a broadcast trigger carries: ID 0xFFFF in the frame (§39.3.3). */
const BROADCAST = '*tags'
/** Session IDs roll 1…255; 0 would mean non-session random access (§39.3.3). model */
const SESSION_MODULUS = 255

export class AmpInventoryRound {
  private running = false
  private session = 0
  /** Triggers of this inventory not yet sent. */
  private triggersLeft = 0
  /** Triggers sent so far in this inventory: the `slot` number of the next is this + 1. */
  private triggerNo = 0
  /** Identifiers heard and not yet read, in the order heard: node id and EPC. */
  private pending: { id: string; epc: string }[] = []
  /** Tags read in this inventory (node ids), so a tag heard again is not read twice. */
  private readSet = new Set<string>()
  /** The first PPDU of a TXOP carries the WUP-Excitation; the rest of the TXOP does not. */
  private wupPending = false
  private txopStartNs: Ns = 0
  private txopSlots = 0
  private txopIds: string[] = []
  private txopRead: string[] = []
  private txopCollisions = 0
  private txopEmpties = 0
  /** Did the last TXOP get anywhere? A TXOP too short for one frame must not be retried forever. */
  private progressed = false
  /** A poll tick asked for a new inventory while this one still had work: it starts once this
   * one is let finish, so that no record of it reports a truncated inventory as complete. */
  private restartPending = false
  /** The first reply decoded inside the frame on the air. */
  private lastReply: { frame: FrameDesc; from: string } | null = null
  /** Something answered, whether or not the reader could read it. */
  private lastAnswered = false

  constructor(private cfg: AmpReaderCfg, private deps: AmpReaderDeps, private txopLimitNs: () => Ns) {}

  get active(): boolean {
    return this.running
  }

  /** All triggers sent and every identifier heard has been read (or had its attempt). */
  private get done(): boolean {
    return this.triggersLeft === 0 && this.pending.length === 0
  }

  /**
   * Is there an inventory worth asking for another TXOP for? One with work left, after a TXOP
   * that got somewhere: a TXOP that could not fit a single frame would only repeat itself.
   */
  get resumable(): boolean {
    return !this.running && !this.done && this.progressed
  }

  /**
   * The poll clock ticked: the next TXOP starts a fresh inventory under a new Session ID. A tick
   * that arrives while one still has work does not take it away; the restart is remembered and
   * applied where that inventory really ends.
   */
  newInventory(): void {
    if (this.running || this.resumable) { this.restartPending = true; return }
    this.triggersLeft = 0
    this.pending = []
    this.restartPending = false
  }

  private get bs(): AmpBackscatterCfg {
    return this.cfg.backscatter
  }

  private get kbps(): AmpBsUlKbps {
    return this.bs.ulKbps as AmpBsUlKbps
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.txopStartNs = this.deps.now()
    this.txopSlots = 0
    this.txopIds = []
    this.txopRead = []
    this.txopCollisions = 0
    this.txopEmpties = 0
    this.wupPending = true
    if (this.done) {
      this.session = (this.session % SESSION_MODULUS) + 1
      this.triggersLeft = this.bs.slots
      this.triggerNo = 0
      this.pending = []
      this.readSet = new Set()
    }
    if (this.cfg.protection !== 'ctsSelf') {
      this.step()
      return
    }
    // CTS-to-self (§9.2.5.2, §10.3.2.15) reserving the rest of the TXOP: the Wi-Fi stations in the
    // room cannot hear a tag at all, and a reflection landing under their data is simply lost.
    const t = this.deps.now()
    const ctsNs = txTimeNs(CTS_BYTES, 6) + this.deps.timing.signalExtNs
    const cts: FrameDesc = {
      kind: 'cts', src: this.deps.nodeId, dst: this.deps.nodeId, bytes: CTS_BYTES, mbps: 6,
      durationFieldNs: Math.max(0, this.txopLimitNs() - ctsNs),
      txTimeNs: ctsNs,
    }
    this.deps.transmit(cts)
    this.deps.q.schedule(t + cts.txTimeNs + this.deps.timing.sifsNs, () => this.step())
  }

  /** The next frame of the inventory: a Read for an identifier heard, else the next trigger. */
  private nextCommand(): Command | null {
    if (this.bs.read && this.pending.length > 0) {
      const p = this.pending[0]
      return { cmd: 'read', reply: 'read', dst: p.id, epc: p.epc }
    }
    if (this.triggersLeft > 0) return { cmd: 'trigger', reply: 'id', dst: BROADCAST }
    return null
  }

  private build(c: Command, wupNs: Ns, slot: number): FrameDesc {
    return ampRfidFrame({
      src: this.deps.nodeId, dst: c.dst, cmd: c.cmd, session: this.session,
      acwe: c.cmd === 'trigger' ? this.bs.acwe : undefined,
      slot, ulKbps: this.kbps, wupNs,
      bstNs: bstNs(c.reply, this.kbps),
      chargeDbm: this.bs.chargeDbm, bsDbm: this.bs.bsDbm,
      signalExtNs: this.deps.timing.signalExtNs, epc: c.epc,
    })
  }

  /** Send the next frame, or close the TXOP because the inventory is done or the TXOP limit reached. */
  private step(): void {
    const c = this.nextCommand()
    if (c === null) {
      this.endTxop()
      return
    }
    const wupNs = this.wupPending ? Math.round(this.bs.wupMs * 1_000_000) : 0
    const slot = c.cmd === 'trigger' ? this.triggerNo + 1 : this.triggerNo
    const frame = this.build(c, wupNs, slot)
    const t = this.deps.now()
    // The whole PPDU, reply included (it lies inside the BST-Excitation), must end inside the
    // TXOP (§10.23.2.9). What does not fit waits for the next TXOP, untouched.
    if (t + frame.txTimeNs > this.txopStartNs + this.txopLimitNs()) {
      this.endTxop()
      return
    }
    this.wupPending = false
    if (c.cmd === 'trigger') {
      this.triggerNo = slot
      this.triggersLeft--
      this.txopSlots++
    }
    this.lastReply = null
    this.lastAnswered = false
    this.deps.emit({
      t, type: 'AMP_RFID', node: this.deps.nodeId, cmd: c.cmd, session: this.session,
      acwe: c.cmd === 'trigger' ? this.bs.acwe : undefined,
      slot, bstNs: frame.amp!.rfid!.bstNs, untilNs: t + frame.txTimeNs,
    })
    this.deps.transmit(frame)
    // Listen for energy in the middle of where the answer is due. Decoding alone cannot tell a
    // collided slot from an empty one, because two reflections that arrive together are not
    // acquired at all.
    const replyStart = bsDataEndNs(frame)! + AMP_BS_T1_NS
    const probe = t + replyStart + Math.round(bsReplyNs(c.reply, this.kbps) / 2)
    this.deps.q.schedule(probe, () => { this.lastAnswered ||= this.deps.bstEnergy() })
    // The tag answers inside this PPDU's own excitation, so by the time the next frame is due —
    // one T2 after the PPDU ends — the exchange has already resolved.
    this.deps.q.schedule(t + frame.txTimeNs + AMP_BS_T2_NS, () => this.resolve(c))
  }

  /** What came back inside the frame's excitation decides what the reader sends next. */
  private resolve(c: Command): void {
    const bs = this.lastReply?.frame.amp?.bs
    const from = this.lastReply?.from
    if (c.cmd === 'trigger') {
      if (bs?.reply === 'id' && from !== undefined) {
        const epc = bs.epc ?? epcOf(from)
        this.txopIds.push(crc16Epc(epc).toString(16).padStart(4, '0'))
        if (this.bs.read && !this.readSet.has(from) && !this.pending.some((p) => p.id === from)) {
          this.pending.push({ id: from, epc })
        }
      } else if (this.lastAnswered) {
        this.txopCollisions++
      } else {
        this.txopEmpties++
      }
    } else {
      // One Read per identifier heard: a reply spoiled by Wi-Fi leaves the tag to be heard again
      // by a later trigger, which queues it once more.
      this.pending.shift()
      if (bs?.reply === 'read' && from !== undefined) {
        this.readSet.add(from)
        this.txopRead.push(bs.epc ?? epcOf(from))
      }
    }
    this.step()
  }

  private endTxop(): void {
    const t = this.deps.now()
    this.running = false
    this.progressed = this.txopSlots > 0 || this.txopRead.length > 0
    const complete = this.done
    this.deps.emit({
      t, type: 'AMP_INVENTORY', node: this.deps.nodeId, session: this.session,
      slotsOffered: this.txopSlots, ids: this.txopIds, read: this.txopRead, collisions: this.txopCollisions,
      empties: this.txopEmpties, txopNs: t - this.txopStartNs, complete,
    })
    if (this.restartPending && !this.resumable) {
      this.triggersLeft = 0
      this.pending = []
      this.restartPending = false
    }
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
   * preamble. Something answered and could not be read, which is what `collisions` counts.
   */
  onRxFail(): void {
    if (this.running) this.lastAnswered = true
  }
}
