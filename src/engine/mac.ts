/**
 * DCF (CSMA/CA) MAC per IEEE Std 802.11-2024 §10.3:
 *  - physical CS (from Channel) + virtual CS (NAV, §10.3.2.4)
 *  - DIFS/EIFS deferral (§10.3.2.3.5/.7), random backoff with binary-exponential
 *    CW (§10.3.3), per-slot decrement with freeze/resume (§10.3.4.3)
 *  - DATA–SIFS–ACK exchange, AckTimeout/CtsTimeout on missing PHY-RXSTART (§10.3.2.9)
 *  - SRC/LRC + SSRC/SLRC retry counters and limits, CW reset rules (§10.3.3)
 *  - RTS/CTS above dot11RTSThreshold with RTS-NAV early release (§10.3.2.4)
 *  - post-transmission backoff (§10.3.4.3)
 */
import type { FrameDesc } from '../model/frames'
import { dataPsduBytes } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { Ns } from '../model/types'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import {
  ACK_BYTES, ACK_TIMEOUT_NS, CTS_BYTES, CTS_TIMEOUT_NS, CW_MAX, CW_MIN, DIFS_NS, EIFS_NS,
  LONG_RETRY_LIMIT, RTS_BYTES, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
  ctrlRespRateFor, txTimeNs,
} from './phy'
import { Rng } from './rng'
import type { Msdu } from './traffic'

export interface MacHooks {
  onMsduDelivered?(msduId: number, at: Ns): void
  onDequeue?(msduId: number): void
}

export interface MacCfg {
  rtsThresholdBytes: number
  rateForPeer(peerId: string): number
}

const NEVER = -10_000_000

export class DcfMac implements PhyListener {
  private state: MacStateName = 'idle'
  private queue: Msdu[] = []
  private cw = CW_MIN
  private ssrc = 0
  private slrc = 0
  private src = 0 // short retry count of the head MPDU
  private lrc = 0 // long retry count of the head MPDU
  private backoff: number | null = null
  private needDraw = false
  private navUntil: Ns = 0
  private navClearHandle = 0
  private navFromRtsAt: Ns | null = null
  private lastBusyEndNs: Ns = NEVER
  private corruptLast = false
  private seqCounter = 0
  private headSeqNo: number | null = null
  private headMsduIdWithSeq = -1
  private awaiting: 'ack' | 'cts' | null = null
  private timeoutHandle = 0
  private ifsHandle = 0
  private tickHandle = 0
  private respHandle = 0
  private pendingResp: FrameDesc | null = null
  private pendingDataAfterCts = false
  private lastRxStartNs: Ns = NEVER
  private lastSeqFrom = new Map<string, number>()
  private currentTxFrame: FrameDesc | null = null

  constructor(
    private nodeId: string,
    private q: EventQueue,
    private now: () => Ns,
    private ch: Channel,
    private rng: Rng,
    private emit: EmitFn,
    private cfg: MacCfg,
    private hooks: MacHooks = {},
  ) {}

  get queueDepth(): number {
    return this.queue.length
  }

  enqueue(msdu: Msdu): void {
    this.queue.push(msdu)
    this.emit({ t: this.now(), type: 'ENQUEUE', node: this.nodeId, msduId: msdu.id, bytes: msdu.bytes, dst: msdu.dst, depth: this.queue.length })
    if (this.state === 'idle') this.startAccess()
  }

  // ---------- access procedure ----------

  private mediumBusy(): boolean {
    return this.ch.isCcaBusy(this.nodeId) || this.now() < this.navUntil
  }

  /** Enter/continue the channel-access procedure. Only valid from idle/defer. */
  private startAccess(): void {
    if (this.state !== 'idle' && this.state !== 'defer') return
    if (this.queue.length === 0 && this.backoff === null && !this.needDraw) {
      this.setState('idle')
      return
    }
    if (this.mediumBusy()) {
      this.needDraw = true
      this.setState('defer')
      return
    }
    this.beginIfs()
  }

  private beginIfs(): void {
    const t = this.now()
    const kind = this.corruptLast ? 'EIFS' : 'DIFS'
    const dur = this.corruptLast ? EIFS_NS : DIFS_NS
    const end = Math.max(t, this.lastBusyEndNs + dur)
    this.setState('defer')
    this.emit({ t, type: 'IFS_START', node: this.nodeId, kind, untilNs: end })
    this.cancel('ifs')
    this.ifsHandle = this.q.schedule(end, () => this.onIfsEnd())
  }

  private onIfsEnd(): void {
    const t = this.now()
    this.emit({ t, type: 'IFS_END', node: this.nodeId })
    if (this.backoff === null) {
      if (!this.needDraw) {
        // §10.3.4.2 basic access: medium idle ≥ DIFS with no deferral → transmit.
        this.transmitNow()
        return
      }
      this.backoff = this.rng.int(this.cw)
      this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: this.backoff, cw: this.cw })
    } else {
      this.emit({ t, type: 'BACKOFF_RESUME', node: this.nodeId, value: this.backoff })
    }
    if (this.backoff === 0) {
      this.transmitNow()
    } else {
      this.setState('backoff')
      this.scheduleTick()
    }
  }

  private scheduleTick(): void {
    this.cancel('tick')
    this.tickHandle = this.q.schedule(this.now() + SLOT_NS, () => this.onSlotTick())
  }

  private onSlotTick(): void {
    this.backoff = this.backoff! - 1
    this.emit({ t: this.now(), type: 'BACKOFF_DEC', node: this.nodeId, value: this.backoff })
    if (this.backoff === 0) this.transmitNow()
    else this.scheduleTick()
  }

  private transmitNow(): void {
    this.backoff = null
    this.needDraw = false
    const msdu = this.queue[0]
    if (!msdu) {
      // Post-transmission backoff completed with nothing queued.
      this.setState('idle')
      return
    }
    const psdu = dataPsduBytes(msdu.bytes)
    const dataRate = this.cfg.rateForPeer(msdu.dst)
    if (psdu > this.cfg.rtsThresholdBytes && !this.pendingDataAfterCts) {
      const rtsRate = ctrlRespRateFor(dataRate)
      const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(rtsRate))
      const ackTime = txTimeNs(ACK_BYTES, ctrlRespRateFor(dataRate))
      const dataTime = txTimeNs(psdu, dataRate)
      const rts: FrameDesc = {
        kind: 'rts', src: this.nodeId, dst: msdu.dst, bytes: RTS_BYTES, mbps: rtsRate,
        durationFieldNs: 3 * SIFS_NS + ctsTime + dataTime + ackTime,
        txTimeNs: txTimeNs(RTS_BYTES, rtsRate),
      }
      this.transmitFrame(rts, 'cts')
    } else {
      this.transmitFrame(this.buildDataFrame(msdu, psdu, dataRate), 'ack')
      this.pendingDataAfterCts = false
    }
  }

  private buildDataFrame(msdu: Msdu, psdu: number, dataRate: number): FrameDesc {
    if (this.headMsduIdWithSeq !== msdu.id) {
      this.headSeqNo = this.seqCounter++
      this.headMsduIdWithSeq = msdu.id
    }
    return {
      kind: 'data', src: this.nodeId, dst: msdu.dst, bytes: psdu, mbps: dataRate,
      durationFieldNs: SIFS_NS + txTimeNs(ACK_BYTES, ctrlRespRateFor(dataRate)),
      txTimeNs: txTimeNs(psdu, dataRate),
      seqNo: this.headSeqNo!, retryFlag: this.src + this.lrc > 0, msduId: msdu.id,
    }
  }

  private transmitFrame(frame: FrameDesc, awaitWhat: 'ack' | 'cts' | null): void {
    this.cancel('ifs', 'tick')
    this.setState('tx')
    this.currentTxFrame = frame
    this.ch.startTx(this.nodeId, frame)
    const end = this.now() + frame.txTimeNs
    // Phase 2: run after the channel has resolved receptions/CCA at the same instant.
    this.q.schedule(end, () => this.onOwnTxEnd(awaitWhat), 2)
  }

  private onOwnTxEnd(awaitWhat: 'ack' | 'cts' | null): void {
    const t = this.now()
    this.currentTxFrame = null
    if (awaitWhat === 'ack') {
      this.awaiting = 'ack'
      this.setState('waitAck')
      this.lastRxStartNs = NEVER
      this.timeoutHandle = this.q.schedule(t + ACK_TIMEOUT_NS, () => this.onRespTimeout())
    } else if (awaitWhat === 'cts') {
      this.awaiting = 'cts'
      this.setState('waitCts')
      this.lastRxStartNs = NEVER
      this.timeoutHandle = this.q.schedule(t + CTS_TIMEOUT_NS, () => this.onRespTimeout())
    } else {
      // Finished a response frame (ACK/CTS) — resume our own access.
      this.setState('idle')
      this.startAccess()
    }
  }

  // ---------- outcomes ----------

  private onRespTimeout(): void {
    const t = this.now()
    this.emit({ t, type: this.awaiting === 'cts' ? 'CTS_TIMEOUT' : 'ACK_TIMEOUT', node: this.nodeId })
    this.failAttempt()
  }

  private failAttempt(): void {
    const t = this.now()
    this.cancel('timeout')
    const msdu = this.queue[0]
    if (!msdu) return
    const psdu = dataPsduBytes(msdu.bytes)
    const wasRts = this.awaiting === 'cts'
    this.awaiting = null
    this.pendingDataAfterCts = false
    const isShort = wasRts || psdu <= this.cfg.rtsThresholdBytes
    if (isShort) {
      this.src++
      this.ssrc++
    } else {
      this.lrc++
      this.slrc++
    }
    this.emit({ t, type: 'RETRY', node: this.nodeId, msduId: msdu.id, src: this.src, lrc: this.lrc, ssrc: this.ssrc, slrc: this.slrc })
    this.cw = Math.min(2 * this.cw + 1, CW_MAX)
    this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: this.cw })
    if (this.src >= SHORT_RETRY_LIMIT || this.lrc >= LONG_RETRY_LIMIT) {
      this.emit({ t, type: 'DROP', node: this.nodeId, msduId: msdu.id, reason: 'retryLimit' })
      this.dequeueHead()
      this.cw = CW_MIN // §10.3.3: CW reset when SSRC reaches dot11ShortRetryLimit
      this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: this.cw })
    }
    this.backoff = null
    this.needDraw = true
    this.setState('idle')
    this.startAccess()
  }

  private succeedAttempt(): void {
    const t = this.now()
    this.cancel('timeout')
    this.awaiting = null
    const msdu = this.queue[0]
    const psdu = msdu ? dataPsduBytes(msdu.bytes) : 0
    // §10.3.3 reset rules
    if (psdu <= this.cfg.rtsThresholdBytes) this.ssrc = 0
    else this.slrc = 0
    this.src = 0
    this.lrc = 0
    this.cw = CW_MIN
    this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: this.cw })
    if (msdu) {
      this.dequeueHead()
    }
    this.backoff = null
    this.needDraw = true // post-transmission backoff, §10.3.4.3
    this.setState('idle')
    this.startAccess()
  }

  private dequeueHead(): void {
    const msdu = this.queue.shift()!
    this.emit({ t: this.now(), type: 'DEQUEUE', node: this.nodeId, msduId: msdu.id, depth: this.queue.length })
    this.hooks.onDequeue?.(msdu.id)
    this.headSeqNo = null
    this.headMsduIdWithSeq = -1
  }

  // ---------- PhyListener ----------

  onCcaBusy(_t: Ns): void {
    if (this.state === 'backoff') {
      this.cancel('tick')
      this.emit({ t: this.now(), type: 'BACKOFF_FREEZE', node: this.nodeId, value: this.backoff! })
      this.setState('defer')
    } else if (this.state === 'defer') {
      this.cancel('ifs')
    }
  }

  onCcaIdle(t: Ns): void {
    this.lastBusyEndNs = t
    if (this.state === 'defer' && this.now() >= this.navUntil) {
      this.startAccess()
    }
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
    if (frame.dst === this.nodeId) {
      this.handleOwnFrame(t, frame, from)
    } else {
      this.updateNav(t, frame, from)
      if (this.awaiting !== null) {
        // Expected response, got a frame for someone else → failed exchange.
        this.failAttempt()
      }
    }
  }

  onRxCorrupt(_t: Ns): void {
    this.corruptLast = true
    if (this.awaiting !== null) this.failAttempt()
  }

  private handleOwnFrame(t: Ns, frame: FrameDesc, from: string): void {
    switch (frame.kind) {
      case 'data': {
        // Always ACK (§10.3.2.9); deliver unless duplicate retry (§10.3.2.14 dedup).
        const dup = frame.retryFlag === true && this.lastSeqFrom.get(from) === frame.seqNo
        if (!dup && frame.msduId !== undefined) this.hooks.onMsduDelivered?.(frame.msduId, t)
        if (frame.seqNo !== undefined) this.lastSeqFrom.set(from, frame.seqNo)
        this.scheduleResponse(t, {
          kind: 'ack', src: this.nodeId, dst: from, bytes: ACK_BYTES,
          mbps: ctrlRespRateFor(frame.mbps), durationFieldNs: 0,
          txTimeNs: txTimeNs(ACK_BYTES, ctrlRespRateFor(frame.mbps)),
        })
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
      case 'ack': {
        if (this.awaiting === 'ack') this.succeedAttempt()
        break
      }
      case 'cts': {
        if (this.awaiting === 'cts') {
          this.cancel('timeout')
          this.awaiting = null
          this.ssrc = 0 // §10.3.3: SSRC reset on CTS received in response to RTS
          this.src = 0
          this.pendingDataAfterCts = true
          this.setState('sifsResp')
          this.respHandle = this.q.schedule(t + SIFS_NS, () => {
            const msdu = this.queue[0]
            if (!msdu) {
              this.setState('idle')
              this.startAccess()
              return
            }
            const psdu = dataPsduBytes(msdu.bytes)
            this.transmitFrame(this.buildDataFrame(msdu, psdu, this.cfg.rateForPeer(msdu.dst)), 'ack')
            this.pendingDataAfterCts = false
          })
        }
        break
      }
    }
  }

  private scheduleResponse(t: Ns, resp: FrameDesc): void {
    // A SIFS response preempts our own contention (medium was busy anyway).
    this.cancel('ifs', 'tick')
    this.pendingResp = resp
    this.setState('sifsResp')
    this.respHandle = this.q.schedule(t + SIFS_NS, () => {
      const f = this.pendingResp!
      this.pendingResp = null
      this.transmitFrame(f, null)
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
    if (this.state === 'backoff') {
      this.cancel('tick')
      this.emit({ t, type: 'BACKOFF_FREEZE', node: this.nodeId, value: this.backoff! })
      this.setState('defer')
    } else if (this.state === 'defer') {
      this.cancel('ifs')
    }
    if (frame.kind === 'rts') {
      // §10.3.2.4 RTS-NAV early release: reset if no PHY-RXSTART within
      // 2·SIFS + CTSTime + 2·Slot of the RTS end.
      const setAt = t
      this.navFromRtsAt = setAt
      const ctsTime = txTimeNs(CTS_BYTES, ctrlRespRateFor(frame.mbps))
      this.q.schedule(t + 2 * SIFS_NS + ctsTime + 2 * SLOT_NS, () => {
        if (this.navFromRtsAt === setAt && this.lastRxStartNs <= setAt && this.navUntil > this.now()) {
          this.navUntil = 0
          this.emit({ t: this.now(), type: 'NAV_CLEAR', node: this.nodeId })
          this.cancel('nav')
          this.navFromRtsAt = null
          if (this.state === 'defer' && !this.ch.isCcaBusy(this.nodeId)) {
            this.lastBusyEndNs = this.now()
            this.startAccess()
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
    if (this.state === 'defer' && !this.ch.isCcaBusy(this.nodeId)) {
      this.lastBusyEndNs = Math.max(this.lastBusyEndNs, t)
      this.startAccess()
    }
  }

  // ---------- helpers ----------

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }

  private cancel(...which: ('ifs' | 'tick' | 'timeout' | 'nav' | 'resp')[]): void {
    for (const w of which) {
      switch (w) {
        case 'ifs': if (this.ifsHandle) { this.q.cancel(this.ifsHandle); this.ifsHandle = 0 } break
        case 'tick': if (this.tickHandle) { this.q.cancel(this.tickHandle); this.tickHandle = 0 } break
        case 'timeout': if (this.timeoutHandle) { this.q.cancel(this.timeoutHandle); this.timeoutHandle = 0 } break
        case 'nav': if (this.navClearHandle) { this.q.cancel(this.navClearHandle); this.navClearHandle = 0 } break
        case 'resp': if (this.respHandle) { this.q.cancel(this.respHandle); this.respHandle = 0 } break
      }
    }
  }
}
