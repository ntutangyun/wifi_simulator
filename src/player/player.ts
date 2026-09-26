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
/** How long playback may sit against an unmoving frontier before it says so. */
const STALL_MS = 2_500

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
  /**
   * Real time at which playback last saw the frontier move, and the frontier it
   * saw. The playhead is clamped to the frontier, so a worker that never runs
   * leaves the clock at zero with nothing on screen to say why — the scene is
   * drawn from the scenario, not from the worker, so it looks healthy. The
   * watchdog turns that silence into a sentence.
   *
   * Seen in the wild on 2026-09-26: this site deploys to GitHub Pages on every
   * push, and the worker chunk is content-hashed, so a page a reader left open
   * across a deploy names a file that no longer exists. It 404s, the worker
   * never starts, and the only symptom is a clock at zero reading 仿真中. See `play`.
   */
  private lastProgressMs = 0
  private lastFrontierNs: Ns = -1
  private stallReported = false

  constructor(private onUpdate: (t: Ns, vs: ViewState | null, buffering: boolean) => void) {}

  load(sc: Scenario): void {
    this.dispose()
    this.store = new TimelineStore()
    this.playheadNs = 0
    this.playing = false
    this.stallReported = false
    this.lastFrontierNs = -1
    try {
      this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' })
    } catch (err) {
      // A browser without module workers throws here rather than failing later.
      this.worker = null
      this.onError?.(`仿真进程启动失败：${String(err)}。本仿真器需要支持 module worker 的浏览器。`)
      return
    }
    // Without these two a worker that fails to load, or throws on its first line,
    // is completely silent: the scene still draws and the clock simply never
    // moves. They are the difference between a bug report of "it does not run"
    // and one that names the cause.
    this.worker.onerror = (e: ErrorEvent) => {
      // The common case by far, on a deployed build: the page in the browser is
      // from an older deploy and names a worker chunk whose content hash has
      // since changed, so the file 404s. A reload fixes it, and nothing else
      // will, so the message leads with that rather than with the error text.
      this.onError?.(
        `仿真进程加载失败：${e.message || '文件没取到'}${e.filename ? `（${e.filename}）` : ''}。`
        + '多半是浏览器里停留的旧页面指向了已被新部署替换的文件，刷新页面即可。',
      )
    }
    this.worker.onmessageerror = () => {
      this.onError?.('仿真进程发回的消息无法解析（结构化克隆失败）。')
    }
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
    this.lastProgressMs = this.lastFrameMs
    this.lastFrontierNs = this.store.frontierNs
    const tick = (nowMs: number) => {
      if (!this.playing) return
      const dtMs = nowMs - this.lastFrameMs
      this.lastFrameMs = nowMs
      const deltaNs = this.speedUsPerSec * 1000 * (dtMs / 1000)
      // The frontier is how far the worker has simulated, and the playhead may
      // not pass it. If it has not moved in STALL_MS of playing, the worker is
      // not running — say so once, rather than showing a clock stuck at zero.
      if (this.store.frontierNs > this.lastFrontierNs) {
        this.lastFrontierNs = this.store.frontierNs
        this.lastProgressMs = nowMs
      } else if (!this.stallReported && nowMs - this.lastProgressMs > STALL_MS) {
        this.stallReported = true
        this.onError?.(
          this.store.frontierNs <= 0
            ? '仿真进程没有启动，时间无法推进。请刷新页面重试——'
              + '本站部署后文件名会变，浏览器里停留的旧页面会指向一个已经不存在的仿真进程文件。'
              + '若刷新后依旧如此，可能是浏览器不支持 module worker。'
            : '仿真进程停在了同一时刻：它可能已经出错退出。请刷新页面重试。',
        )
      }
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

  /** Pause and seek to the first buffered record matching pred. False if none yet. */
  seekFirst(pred: Parameters<TimelineStore['findFirstTime']>[0]): boolean {
    const t = this.store.findFirstTime(pred)
    if (t === null) return false
    this.pause()
    this.seek(t)
    return true
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
