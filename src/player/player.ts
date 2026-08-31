/**
 * Playback controller: owns the worker, the TimelineStore and the playhead.
 * The playhead scrubs recorded history; the worker keeps simulating ahead.
 */
import type { Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'
import type { FromWorker, ToWorker } from '../worker/protocol'
import { TimelineStore } from './timelineStore'
import { SLOT_NS } from '../engine/phy'

const LOOKAHEAD_NS = 2_000_000_000 // keep 2 s of sim time simulated ahead
const KEEP_BEHIND_NS = 5_000_000_000 // keep 5 s of history

export class Player {
  store = new TimelineStore()
  playheadNs: Ns = 0
  playing = false
  /** Sim microseconds advanced per real second (1000 = 1 ms/s = 1000× slowdown). */
  speedUsPerSec = 1000
  onError: ((msg: string) => void) | null = null

  private worker: Worker | null = null
  private raf = 0
  private lastFrameMs = 0

  constructor(private onUpdate: (t: Ns, vs: ViewState | null, buffering: boolean) => void) {}

  load(sc: Scenario): void {
    this.dispose()
    this.store = new TimelineStore()
    this.playheadNs = 0
    this.playing = false
    this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data
      if (m.type === 'batch') {
        this.store.ingest(m.batch)
        this.publish()
      } else {
        this.onError?.(m.message)
      }
    }
    this.send({ type: 'init', scenario: sc })
    this.ensureAhead()
    this.publish()
  }

  private send(m: ToWorker): void {
    this.worker?.postMessage(m)
  }

  private ensureAhead(): void {
    this.send({ type: 'run', untilNs: this.playheadNs + LOOKAHEAD_NS })
  }

  play(): void {
    if (this.playing) return
    this.playing = true
    this.lastFrameMs = performance.now()
    const tick = (nowMs: number) => {
      if (!this.playing) return
      const dtMs = nowMs - this.lastFrameMs
      this.lastFrameMs = nowMs
      const deltaNs = this.speedUsPerSec * 1000 * (dtMs / 1000)
      this.playheadNs = Math.min(this.playheadNs + deltaNs, this.store.frontierNs)
      this.ensureAhead()
      this.trim()
      this.publish()
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  pause(): void {
    this.playing = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.publish()
  }

  seek(t: Ns): void {
    this.playheadNs = clamp(t, this.store.windowStartNs, this.store.frontierNs)
    this.ensureAhead()
    this.publish()
  }

  stepNs(delta: Ns): void {
    this.pause()
    this.seek(this.playheadNs + delta)
  }

  stepMicro(dir: 1 | -1): void {
    this.stepNs(dir * 1_000)
  }

  stepSlot(dir: 1 | -1): void {
    this.stepNs(dir * SLOT_NS)
  }

  stepEvent(dir: 1 | -1): void {
    this.pause()
    const t = dir > 0 ? this.store.nextRecordTime(this.playheadNs) : this.store.prevRecordTime(this.playheadNs)
    if (t !== null) this.seek(t)
  }

  stepExchange(dir: 1 | -1): void {
    this.pause()
    const t = dir > 0 ? this.store.nextExchangeTime(this.playheadNs) : this.store.prevExchangeTime(this.playheadNs)
    if (t !== null) this.seek(t)
  }

  private trim(): void {
    this.store.trimBefore(this.playheadNs - KEEP_BEHIND_NS)
  }

  private publish(): void {
    const buffering = this.playing && this.playheadNs >= this.store.frontierNs
    this.onUpdate(this.playheadNs, this.store.viewAt(this.playheadNs), buffering)
  }

  dispose(): void {
    this.pause()
    if (this.worker) {
      this.send({ type: 'dispose' })
      this.worker.terminate()
      this.worker = null
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
