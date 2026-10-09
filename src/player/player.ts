/**
 * Playback controller: owns the worker, the TimelineStore and the playhead.
 * The playhead scrubs recorded history; the worker keeps simulating ahead.
 */
import type { TLRecord } from '../model/records'
import type { Scenario } from '../model/scenario'
import type { Ns } from '../model/types'
import type { ViewState } from '../model/view'
import type { FromWorker, ToWorker } from '../worker/protocol'
import { TimelineStore } from './timelineStore'
import { SLOT_NS } from '../engine/phy'

export const LOOKAHEAD_NS = 2_000_000_000 // keep 2 s of sim time simulated ahead
const KEEP_BEHIND_NS = 5_000_000_000 // keep 5 s of history
/**
 * How far past the playhead a **jump** may ask the worker to simulate when the
 * record it is looking for has not been recorded yet.
 *
 * Playback's lookahead is 2 s, and a lesson's playhead starts at 0, so for the
 * first minutes of a lesson the recording ends at 2 s. Two of the course's 293
 * jumps point past that: `queues` ã€ŒAP ç¬¬ä¸€æ¬¡å› ç”Ÿå­˜æœŸä¸¢å¸§ã€ at 2.182 806 360 s
 * and `capstone` ã€Œç¬¬ä¸€ä¸ªè§¦å‘å¸§ã€ at 2.453 384 778 s. Clicking either on a
 * freshly loaded lesson used to print ã€Œå°šæœªå‡ºçŽ°ã€ and do nothing, and the only
 * ways out were the ones nobody is told about: wait 3 minutes (`queues`) or
 * 7Â½ (`capstone`) at the default 1 000Ã— slowdown for the playhead to crawl far
 * enough that the lookahead covers the moment, or zoom the timeline strip out
 * to its 1 s maximum and drag a full width to make one `seek` extend it.
 *
 * 3 s, and the number is the measurement: 2.453 384 778 s is the furthest jump
 * target in the whole course, leaving 546.6 ms of headroom, and
 * `tests/ui/eventLogWindow.test.ts` fails if a lesson edit eats it.
 *
 * It is also the cost bound, which is why it is a jump's limit and not
 * playback's. Raising `LOOKAHEAD_NS` to 3 s would buy the same two jumps and
 * charge every one of the 88 lessons for it at every load: measured, `mumimo`
 * goes from 644 648 records and 80.0 MiB resident to 967 082 and 122.8 MiB,
 * and from 1 644 ms of simulation to 2 469 ms. This way the same worst case
 * (0â€¦3 s of one scene) is only ever paid by a reader who actually clicked a
 * jump the recording had not reached, and for the two real jumps the extra work
 * is 0.18 s and 0.45 s of sim time, not a full second.
 */
export const JUMP_SEARCH_NS = 3_000_000_000
/** How long playback may sit against an unmoving frontier before it says so. */
const STALL_MS = 2_500

/** What a jump looks for: `TimelineStore.findFirst`'s own predicate type. */
type Pred = Parameters<TimelineStore['findFirst']>[0]

interface PendingJump {
  pred: Pred
  /** The frontier past which the search gives up. */
  untilNs: Ns
  done: (r: TLRecord | null) => void
}

export class Player {
  store = new TimelineStore()
  playheadNs: Ns = 0
  playing = false
  /** Sim microseconds advanced per real second (1000 = 1 ms/s = 1000Ã— slowdown). */
  speedUsPerSec = 1000
  onError: ((msg: string) => void) | null = null

  private worker: Worker | null = null
  private raf = 0
  private lastFrameMs = 0
  /**
   * Real time at which playback last saw the frontier move, and the frontier it
   * saw. The playhead is clamped to the frontier, so a worker that never runs
   * leaves the clock at zero with nothing on screen to say why â€” the scene is
   * drawn from the scenario, not from the worker, so it looks healthy. The
   * watchdog turns that silence into a sentence.
   *
   * Seen in the wild on 2026-09-26: this site deploys to GitHub Pages on every
   * push, and the worker chunk is content-hashed, so a page a reader left open
   * across a deploy names a file that no longer exists. It 404s, the worker
   * never starts, and the only symptom is a clock at zero reading ä»¿çœŸä¸­. See `play`.
   */
  private lastProgressMs = 0
  private lastFrontierNs: Ns = -1
  private stallReported = false
  /**
   * A jump whose record the recording had not reached, held until the worker
   * has simulated far enough to answer it. See {@link seekFirstAhead}.
   */
  private pendingJump: PendingJump | null = null

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
      this.onError?.(`ä»¿çœŸè¿›ç¨‹å¯åŠ¨å¤±è´¥ï¼š${String(err)}ã€‚æœ¬ä»¿çœŸå™¨éœ€è¦æ”¯æŒ module worker çš„æµè§ˆå™¨ã€‚`)
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
        `ä»¿çœŸè¿›ç¨‹åŠ è½½å¤±è´¥ï¼š${e.message || 'æ–‡ä»¶æ²¡å–åˆ°'}${e.filename ? `ï¼ˆ${e.filename}ï¼‰` : ''}ã€‚`
        + 'å¤šåŠæ˜¯æµè§ˆå™¨é‡Œåœç•™çš„æ—§é¡µé¢æŒ‡å‘äº†å·²è¢«æ–°éƒ¨ç½²æ›¿æ¢çš„æ–‡ä»¶ï¼Œåˆ·æ–°é¡µé¢å³å¯ã€‚',
      )
    }
    this.worker.onmessageerror = () => {
      this.onError?.('ä»¿çœŸè¿›ç¨‹å‘å›žçš„æ¶ˆæ¯æ— æ³•è§£æžï¼ˆç»“æž„åŒ–å…‹éš†å¤±è´¥ï¼‰ã€‚')
    }
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data
      if (m.type === 'batch') {
        this.store.ingest(m.batch)
        // Before `publish`, so a jump that this batch answers has already moved
        // the playhead and the update the UI gets is the one it asked for.
        this.settlePendingJump()
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
      // not running â€” say so once, rather than showing a clock stuck at zero.
      if (this.store.frontierNs > this.lastFrontierNs) {
        this.lastFrontierNs = this.store.frontierNs
        this.lastProgressMs = nowMs
      } else if (!this.stallReported && nowMs - this.lastProgressMs > STALL_MS) {
        this.stallReported = true
        this.onError?.(
          this.store.frontierNs <= 0
            ? 'ä»¿çœŸè¿›ç¨‹æ²¡æœ‰å¯åŠ¨ï¼Œæ—¶é—´æ— æ³•æŽ¨è¿›ã€‚è¯·åˆ·æ–°é¡µé¢é‡è¯•â€”â€”'
              + 'æœ¬ç«™éƒ¨ç½²åŽæ–‡ä»¶åä¼šå˜ï¼Œæµè§ˆå™¨é‡Œåœç•™çš„æ—§é¡µé¢ä¼šæŒ‡å‘ä¸€ä¸ªå·²ç»ä¸å­˜åœ¨çš„ä»¿çœŸè¿›ç¨‹æ–‡ä»¶ã€‚'
              + 'è‹¥åˆ·æ–°åŽä¾æ—§å¦‚æ­¤ï¼Œå¯èƒ½æ˜¯æµè§ˆå™¨ä¸æ”¯æŒ module workerã€‚'
            : 'ä»¿çœŸè¿›ç¨‹åœåœ¨äº†åŒä¸€æ—¶åˆ»ï¼šå®ƒå¯èƒ½å·²ç»å‡ºé”™é€€å‡ºã€‚è¯·åˆ·æ–°é¡µé¢é‡è¯•ã€‚',
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

  /**
   * Pause and seek to the first **already recorded** record matching pred, and
   * hand that record back. Null when the recording has not reached it yet.
   *
   * The record, not a boolean: the caller's next move is to tell the event log
   * which row to show, and `seq` is the only thing that names it (the playhead
   * alone cannot â€” see `src/ui/eventLogWindow.ts`). Callers test it against
   * `null` and never for truthiness: `seq` starts at 0.
   *
   * Private, and it was not: as the only way in it was a trap, because "the
   * recording has not reached it yet" is a fact about when the reader clicked
   * and not about what they asked for, and the UI's only honest answer to it
   * was a sentence. {@link seekFirstAhead} is the way in now.
   */
  private seekFirst(pred: Pred): TLRecord | null {
    const r = this.store.findFirst(pred)
    if (r === null) return null
    this.pause()
    this.seek(r.t)
    return r
  }

  /**
   * Pause and seek to the first record matching pred, **simulating further if
   * the recording has not reached it yet**, and hand that record to `done`.
   *
   * `done` is called synchronously when the record is already recorded, which
   * is 291 of the course's 293 jumps; for the other two it is called when the
   * worker has caught up, a few hundred milliseconds later. `null` means the
   * record did not occur in the first {@link JUMP_SEARCH_NS} past the playhead,
   * which is the only case left where a jump can fail â€” and it is a real one:
   * `amp-slots` declares two jumps on purpose that fire only in its variants,
   * so a reader clicking those on the base scene gets this answer.
   *
   * The extension reuses the mechanism playback already uses and adds none of
   * its own: the worker's `run` raises `targetNs` and restarts its pump
   * (`src/worker/sim.worker.ts`), so asking for a later frontier is one
   * message, and the batches it sends back are the ones the store was going to
   * get anyway. The request is renewed on each batch rather than sent once, so
   * nothing has to assume the worker is still working toward the old target.
   *
   * At most one jump is pending: a second click replaces the first, because
   * what the reader wants is the button they pressed last. A new run drops it
   * (see `dispose`) â€” a `seq` from a recording that no longer exists is the
   * hazard `src/ui/store.ts` describes for `jumpSeq`, and a pending predicate
   * is the same hazard a step earlier.
   */
  seekFirstAhead(pred: Pred, done: (r: TLRecord | null) => void): void {
    const r = this.seekFirst(pred)
    if (r !== null) { done(r); return }
    if (this.worker === null) { done(null); return }
    this.pendingJump = { pred, untilNs: this.playheadNs + JUMP_SEARCH_NS, done }
    this.send({ type: 'run', untilNs: this.pendingJump.untilNs })
  }

  /** Answer a pending jump if this batch can, or ask for more recording. */
  private settlePendingJump(): void {
    const p = this.pendingJump
    if (p === null) return
    const r = this.store.findFirst(p.pred)
    if (r !== null) {
      this.pendingJump = null
      this.pause()
      this.seek(r.t)
      p.done(r)
      return
    }
    if (this.store.frontierNs >= p.untilNs) {
      this.pendingJump = null
      p.done(null)
      return
    }
    this.send({ type: 'run', untilNs: p.untilNs })
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

  /**
   * Stops the worker and the playback loop, **and drops the recording**: a
   * disposed player holds nothing, so nothing on screen can still be showing
   * the run that just ended.
   *
   * It did not always clear `store`, and the gap had one reader. Everything
   * drawn from `ViewState` goes blank because the store's callers null `view`
   * as they dispose, and `TimelineStrip` is unmounted whenever nothing is
   * loaded â€” but `EventLog` reads `player.store` directly and is in the side
   * panel at every mode but the editor. Every path that disposes also parks
   * the playhead at 0 and the log's window is
   * `[playhead âˆ’ 3 ms, playhead + 0.5 ms]`, so what it showed was whatever the
   * previous run had recorded in its first 500 Âµs.
   *
   * That was invisible for exactly one reason, and it was arithmetic, not
   * design: the editor's default document has no non-`MAC_STATE` record until
   * the `WAN_TX` at 894 045 ns, **394 Âµs past the end of that window**, so
   * running it and then entering course mode happened to show an empty log
   * instead of that run's 630 336 records. **77 of the 83 lesson scenes have
   * records at t = 0**, so once walking between lessons started clearing the
   * screen, the log was the one surface still holding the lesson the reader
   * had left, beside a panel offering `â–¶ è½½å…¥å¹¶è§‚å¯Ÿ`.
   *
   * `load` assigns a fresh store of its own as well. That line is redundant
   * now and kept on purpose: a load starting from an empty recording is its
   * own requirement, not one borrowed from whatever this method happens to do.
   */
  dispose(): void {
    this.pause()
    // A pending jump belongs to the recording that is ending: its predicate
    // would be matched against the next run's records, and the `seq` it handed
    // back would name a real but different record there. It is told it failed
    // rather than dropped silently, so no caller is left waiting on it.
    const p = this.pendingJump
    this.pendingJump = null
    p?.done(null)
    if (this.worker) {
      this.send({ type: 'dispose' })
      this.worker.terminate()
      this.worker = null
    }
    // After `pause`, so the last `publish` still describes the run that is
    // ending rather than an empty store â€” the callers replace what it publishes
    // in the same breath, and this way disposing changes nothing they see.
    this.store = new TimelineStore()
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
