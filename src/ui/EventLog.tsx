import { useLayoutEffect, useRef, useState } from 'react'
import { player, useUi } from './store'
import { pickLogRows, windowedRecords } from './eventLogWindow'
import { decodeFrame, fmtNs, fmtRecord, type FieldRow } from './format'
import { useStrings, type Strings } from './i18n'
import type { FrameDesc } from '../model/frames'
import type { TLRecord } from '../model/records'

function frameOf(r: TLRecord) {
  return 'frame' in r ? r.frame : null
}

/** The frame's field rows, or null when the decoder cannot account for the frame's size:
 * the log then shows nothing rather than wrong sizes, exactly as FrameDetail does. */
function fieldRowsOf(f: FrameDesc, S: Strings['frameDetail']['fields']): FieldRow[] | null {
  try {
    return decodeFrame(f, S)
  } catch {
    return null
  }
}

export function EventLog() {
  const playheadNs = useUi((s) => s.playheadNs)
  const jumpSeq = useUi((s) => s.jumpSeq)
  const playing = useUi((s) => s.playing)
  const [expanded, setExpanded] = useState<number | null>(null)
  const L = useStrings()

  // Which rows, and which one is the reader's: `./eventLogWindow`, so that the
  // choice is a pure function a node test can call on the same code path the
  // screen uses. `markerSeq` still marks the most recent record at or before the
  // playhead — exact equality almost never holds after an analog (wheel) seek.
  const { rows: records, markerSeq, anchorSeq } = pickLogRows(
    windowedRecords(player.store, playheadNs), playheadNs, jumpSeq,
  )

  /*
   * Putting a row IN the batch is not the same as putting it on the screen, and
   * only one of the two is what the reader asked for. This panel is
   * `overflow: auto` inside a fixed grid cell — ~28 rows of a batch of 160 are
   * in view — and it did not manage its own scroll, so the row could be a
   * thousand pixels below the fold with the scrollbar wherever the last render
   * left it.
   *
   * ## Which row, and when
   *
   * `showSeq`: the jump's row while a jump is live, otherwise the playhead's
   * row, and **nothing at all while playback is running**. That last clause is
   * the whole rule and it is deliberate on both sides:
   *
   *  - Following the playhead frame by frame during playback would fight the
   *    reader's own scrolling, costs a layout read every frame, and nobody has
   *    asked for it. `playing` is checked rather than inferred, so playback
   *    changes `showSeq` to null and the effect below does not even re-run
   *    (null to null is not a change) — the per-frame cost of this block while
   *    playing is zero.
   *  - A reader who **deliberately moves the playhead** is a different event:
   *    one explicit action, discontinuous, and every path that does it pauses
   *    first (`Player.stepNs`, `stepEvent`, `stepExchange`, `seekFirst` all
   *    call `pause`) or was already paused. Pressing ❚❚ is such an action too:
   *    the reader stopped in order to look at where they are.
   *
   * That half was measured before it was written, in this browser, at all three
   * viewports (`.superpowers/sdd/log-followup-report.md`): of 60 measurements
   * of the marker row's position after a deliberate move — the first frame
   * after a lesson loads, 事件 → ×1 and ×21, 帧交换 ⏭ ×10, and a 30-notch wheel
   * seek on the strip, across `edca`, `mumimo`, `radio-primer` and `airtime` —
   * **54 had the marker outside the box**, by up to 2 206 px, with `scrollTop`
   * still 0 in every single one. The row that says "you are here" was on the
   * screen in 1 of them. It is the same defect as the jump's, from the other
   * end: the batch is now centred on the marker, which puts it ~80 rows down a
   * ~160-row batch, and the box was never told.
   *
   * ## How
   *
   * `scrollTop` by hand rather than `scrollIntoView`: that walks every
   * scrollable ancestor, and this app's narrow layouts are measured on the
   * promise that nothing scrolls the page (`tests/e2e/narrow-width.spec.ts`
   * question 1). Setting `scrollTop` on this box moves this box and nothing
   * else. Geometry comes from `getBoundingClientRect` and not `offsetTop`,
   * which is measured from whichever ancestor happens to be positioned.
   *
   * Only when the row is out of view, so a reader who has scrolled the panel by
   * hand keeps their position until the playhead actually moves off the screen.
   * A third of the way down, not the top: the records that LED to this one are
   * most of why the reader came, and a row pinned to the top edge hides them.
   * `useLayoutEffect` so it happens before the browser paints — a visible jerk
   * from the old offset to the new one is its own small defect.
   *
   * The second dependency is the batch's own first row, and it is there because
   * the browser test found the case the first one misses: **the same row can
   * move without changing its seq**. While the worker is still filling the
   * lookahead, `win` keeps growing, so `pickLogRows`'s clamp
   * (`min(win.length − 160, …)`) stops biting and the slice's start index walks
   * forward — the marker's seq is unchanged and its position in the batch is
   * not. Caught as a flake in the e2e case below, at `foldable-open` and
   * `desktop` but not `foldable-shut`, which is what an undeclared dependency
   * looks like. It costs one comparison per frame during playback, before the
   * `showSeq === null` return and before any DOM read.
   */
  const showSeq = anchorSeq ?? (playing ? null : markerSeq)
  const firstSeq = records.length ? records[0].seq : null
  const boxRef = useRef<HTMLDivElement>(null)
  const showRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = boxRef.current
    const row = showRef.current
    if (!box || !row || showSeq === null) return
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, top - box.clientHeight / 3)
    }
  }, [showSeq, firstSeq])

  return (
    <div ref={boxRef} style={{ overflow: 'auto', fontSize: 11.5, fontFamily: 'Consolas, monospace', padding: '4px 0' }}>
      {records.length === 0 && <div style={{ color: 'var(--dim)', padding: 8 }}>{L.log.empty}</div>}
      {records.map((r) => {
        const past = r.t <= playheadNs
        const f = frameOf(r)
        const key = r.seq
        const rows = f && expanded === key ? fieldRowsOf(f, L.frameDetail.fields) : null
        const anchored = r.seq === anchorSeq
        const marked = r.seq === markerSeq
        return (
          <div
            key={key}
            ref={r.seq === showSeq ? showRef : undefined}
            data-log-anchor={anchored || undefined}
            /* The marker's own handle, so a browser can measure where the
             * playhead's row ended up without having to recognise it by the
             * colour of a border. `data-log-anchor` is a separate fact and
             * stays separate: after a jump the two are different rows in 230 of
             * the course's 293 jumps. */
            data-log-marker={marked || undefined}
          >
            <div
              onClick={() => {
                player.pause()
                player.seek(r.t)
                if (f) setExpanded(expanded === key ? null : key)
              }}
              style={{
                display: 'flex', gap: 8, padding: '1px 8px', cursor: 'pointer',
                opacity: past ? 1 : 0.45,
                background: r.type === 'COLLISION' ? 'rgba(239,68,68,0.15)' : undefined,
                /*
                 * The anchored row gets its own colour, and it needs one: the
                 * white border is the PLAYHEAD, and after a jump the playhead's
                 * row is a different row from the clicked one in 230 of the
                 * course's 293 jumps (up to 88 rows away). A reader told "read
                 * that line" has to be able to tell which line. Both are 2 px
                 * borders that were already being drawn, so no layout moves and
                 * the 470 px column is unaffected.
                 */
                borderLeft: anchored ? '2px solid #38bdf8'
                  : marked ? '2px solid #f8fafc' : '2px solid transparent',
              }}
            >
              {/*
                * The timestamp is a column and stays one: `nowrap` so it is never broken, and
                * `flexShrink: 0` so it cannot be squeezed into a two-character strip the way
                * the transport's two readout spans were (`.superpowers/sdd/folded-layout/
                * report.md` §"A real defect found and fixed while measuring" — `index.css`
                * gives `button`/`select` a shrink guard and a bare `span` never had one).
                */}
              <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtNs(r.t)}</span>
              {/*
                * **The record text wraps, and at every size.** It carried `whiteSpace: 'nowrap'`
                * from the log's first commit, with no comment, no test and no report defending
                * it; what it bought was one record per row, and what it cost was measured here:
                * this panel is NEVER wide. Its own client width is 344 px as a desktop column
                * (`mainColumns`'s `minmax(320px, 400px)` at 1440 x 900), 404 px as the drawer on
                * an unfolded foldable and 398 px folded — so the narrowest of the three is the
                * desktop. A `WIFI_SEL` member row is 131 characters, 832 px in Consolas at
                * 11.5 px, and with `nowrap` the last two thirds of it sat behind a horizontal
                * scroll **at all three sizes**: `scrollWidth` 932 against those client widths.
                * This was taken for a folded-screen defect and is not one; it is every reader's,
                * and worst for the one with the biggest screen.
                *
                * So the tail of a long record is now on screen, and the continuation lines
                * indent to the text column because the timestamp beside them does not shrink.
                * The cost, taken knowingly: a long record is two or three rows tall, so the
                * same panel holds fewer records at once. The old shape held all 160 at one row
                * each and showed ~46 characters of each one.
                *
                * `minWidth: 0` is what lets it shrink below its content at all (a flex item's
                * `min-width: auto` is its min-content width), and `overflowWrap: 'break-word'`
                * is the fallback for a token with no space in it — a long node id or a UWB
                * record's coordinate list — which would otherwise push the row wide again.
                */}
              <span style={{ minWidth: 0, overflowWrap: 'break-word' }}>{fmtRecord(r)}{f ? ' ▸' : ''}</span>
            </div>
            {rows && (
              <table style={{ margin: '2px 24px 6px', fontSize: 11, borderCollapse: 'collapse' }}>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field}>
                      <td style={{ color: 'var(--dim)', paddingRight: 10 }}>{row.field}</td>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
