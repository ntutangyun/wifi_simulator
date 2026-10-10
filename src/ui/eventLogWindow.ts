/**
 * Which records the event log renders, as a pure function of the recording, the
 * playhead and the row a jump asked for.
 *
 * It is a module of its own, and not four lines inside `EventLog.tsx`, for one
 * reason: `vitest` runs `environment: 'node'` here, there is no jsdom and no
 * testing-library in the repository, so nothing can render `EventLog` and ask
 * what came out. Importing the component is not an option either — `./store`
 * constructs a `Player` at module scope. A leaf that imports only the store
 * type can be called by the UI and by a test through the SAME code path, which
 * is the only way a check on this can prove what its name says. (`corpus` and
 * `coverageNumbers` in `tests/course` were split out for the same reason.)
 *
 * ## What was wrong with "the last 160"
 *
 * The log used to end with `.slice(-160)`: of everything in the window, keep the
 * newest 160. That value arrived in the log's first commit (`34b24d6`, "node
 * inspector, event log, frame decoder") with no comment, no test and no report
 * defending it — the same provenance as the `whiteSpace: 'nowrap'` on the record
 * text, which `54ada93` removed once somebody measured it.
 *
 * The window is `[playhead − 3 ms, playhead + 0.5 ms]`, so it reaches ahead of
 * the playhead, and the records ahead of it are the newest ones in it. In a
 * dense region there are more than 160 of them, and then "the newest 160" is
 * **entirely records that have not happened yet** — every one drawn at
 * `opacity: 0.45`, and `markerSeq` with nowhere to land, because not one row in
 * the batch is at or before the playhead.
 *
 * Measured, not supposed (probes in this slice's report,
 * `.superpowers/sdd/eventlog-window-report.md`):
 *
 *  - Over all **293 jumps of all 88 lessons**, three sent the reader to a record
 *    the old rule then cut out of the batch: `edca` #1 「接入点上的内部碰撞」
 *    (478 records in the window, 178 after the target), and `mumimo` #2 and
 *    `mumimo-choose` #2 「第一个 BlockAck」 (315 in the window, 205 after). In
 *    all three the clock and the inspector showed the moment and the log did not
 *    show the row — which is the one thing the course asks the reader to do.
 *  - Sampling 40 playhead positions in each of the 88 lessons, **2.3 % of them
 *    (55 of 2374)** had no marker at all, and in every one of those the whole
 *    batch was in the future.
 *
 * ## The rule now
 *
 * One anchor, centred: keep 160 rows around the row that matters, instead of the
 * 160 newest. The anchor is the record a jump asked for while the playhead is
 * still on it, and otherwise the marker — the last record at or before the
 * playhead. Clamped at both ends, so a window with 160 records or fewer renders
 * all of them exactly as before, and an anchor near the end of the window gives
 * back the old tail.
 *
 * Why the jump's own record and not just the playhead: the playhead is not
 * enough to find it. `seekFirst` seeks to the record's time, and a single
 * nanosecond can carry a crowd — the first data frame of `radio-primer` shares
 * its instant with 45 other records and is the 43rd of them. Measured over the
 * 293 jumps, the marker sits **up to 88 rows past** the record the reader
 * clicked (median 3), and the target is not the first record at its own instant
 * in 230 of them. So a playhead-only rule can hold the row in the batch but
 * cannot say which row to put on the screen; the seq can.
 *
 * The row budget is unchanged at 160, deliberately: this picks a different 160,
 * never more, so the per-frame cost of the log cannot move. See the report for
 * the before/after render measurement.
 */
import type { TimelineStore } from '../player/timelineStore'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'

/** How far back the log looks from the playhead. */
export const WINDOW_BEFORE = 3_000_000 // 3 ms back
/** How far ahead of the playhead the log looks. These rows are the dimmed ones. */
export const WINDOW_AFTER = 500_000 // 0.5 ms ahead
/** Rows rendered at once. Unchanged from the log's first commit; see the docblock. */
export const LOG_ROWS = 160

/** The records the log considers, before the row budget: the window, minus the type it never shows. */
export function windowedRecords(store: TimelineStore, playheadNs: Ns): TLRecord[] {
  return store
    .recordsIn(Math.max(store.windowStartNs, playheadNs - WINDOW_BEFORE), playheadNs + WINDOW_AFTER)
    .filter((r) => r.type !== 'MAC_STATE')
}

export interface LogRows {
  /** The rows to render, at most {@link LOG_ROWS} of them. */
  rows: TLRecord[]
  /**
   * The row to draw the "you are here" border on: the last row at or before the
   * playhead. Null only when the window holds nothing at or before it at all.
   */
  markerSeq: number | null
  /**
   * The row a jump asked for, if that request is still live — the record is in
   * the window and the playhead is still on its instant. This is the row the log
   * scrolls to; null means the reader has moved on and nothing should scroll.
   */
  anchorSeq: number | null
}

/**
 * Pick the rows to render.
 *
 * `jumpSeq` is the record a course jump landed on (`src/ui/store.ts`). It is
 * honoured only while `playheadNs` is still that record's own instant, so any
 * step, seek, click or second of playback releases the log without a store write
 * to undo — one less piece of state that can be left stale.
 */
export function pickLogRows(win: TLRecord[], playheadNs: Ns, jumpSeq: number | null): LogRows {
  // The marker index is found over the whole window, not over the rows, so that
  // it can be used to choose them. `recordsIn` returns records in time order.
  let markerIdx = -1
  for (let i = 0; i < win.length; i++) {
    if (win[i].t <= playheadNs) markerIdx = i
    else break
  }
  // A live jump anchor is by definition a record at the playhead's own instant,
  // and `win` is in time order, so the search is the run of records ending at
  // `markerIdx` that share that instant — tens of rows at worst, rather than the
  // up-to-927 of the window. It matters because a stale `jumpSeq` (the reader
  // jumped, then played on) would otherwise scan the whole window on every frame
  // to find nothing.
  let jumpIdx = -1
  if (jumpSeq !== null) {
    for (let i = markerIdx; i >= 0 && win[i].t === playheadNs; i--) {
      if (win[i].seq === jumpSeq) { jumpIdx = i; break }
    }
  }

  // Two rows want to be on screen, and they are not always the same row: the one
  // the reader clicked, and the marker. `seekFirst` lands on the clicked record,
  // so the marker — the LAST record at or before the playhead — can be a crowd of
  // same-instant records further down (measured: up to 88 rows past it). So the
  // budget is centred on the span between them, with the clicked row given
  // priority if a span that wide could ever not fit.
  const must = jumpIdx >= 0 ? jumpIdx : markerIdx // the row that must be rendered
  const also = markerIdx >= 0 ? markerIdx : must // the row that should be, if it fits
  const last = Math.max(0, win.length - LOG_ROWS)
  let start = 0
  if (must >= 0) {
    const far = Math.min(also, must + LOG_ROWS - 1)
    const centre = Math.floor((must + far) / 2)
    start = Math.min(last, Math.max(0, centre - Math.floor(LOG_ROWS / 2)))
    // After clamping, `must` itself comes first: the reader asked for that row.
    start = Math.min(start, must)
  }
  const rows = win.slice(start, start + LOG_ROWS)

  return {
    rows,
    markerSeq: markerIdx >= start && markerIdx < start + LOG_ROWS ? win[markerIdx].seq : null,
    anchorSeq: jumpIdx >= 0 ? jumpSeq : null,
  }
}
