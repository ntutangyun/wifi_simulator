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
   * Putting the anchored row IN the batch is not the same as putting it on the
   * screen, and only one of the two is what the reader asked for. This panel is
   * `overflow: auto` inside a fixed grid cell — ~30 rows of a batch of 160 are
   * in view — and it has never managed its own scroll, so after a jump the row
   * could be a thousand pixels below the fold with the scrollbar wherever the
   * last render left it.
   *
   * `scrollTop` by hand rather than `scrollIntoView`: that walks every
   * scrollable ancestor, and this app's narrow layouts are measured on the
   * promise that nothing scrolls the page (`tests/e2e/narrow-width.spec.ts`
   * question 1). Setting `scrollTop` on this box moves this box and nothing
   * else. Geometry comes from `getBoundingClientRect` and not `offsetTop`,
   * which is measured from whichever ancestor happens to be positioned.
   *
   * A third of the way down, not the top: the records that LED to this one are
   * most of why the reader came, and a row pinned to the top edge hides them.
   * `useLayoutEffect` so it happens before the browser paints — a visible jerk
   * from the old offset to the new one is its own small defect. Keyed on
   * `anchorSeq` alone, so it fires once per jump and never during playback:
   * following the playhead every frame is a different feature with a cost of its
   * own, and nobody has asked for it.
   */
  const boxRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = boxRef.current
    const row = anchorRef.current
    if (!box || !row || anchorSeq === null) return
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, top - box.clientHeight / 3)
    }
  }, [anchorSeq])

  return (
    <div ref={boxRef} style={{ overflow: 'auto', fontSize: 11.5, fontFamily: 'Consolas, monospace', padding: '4px 0' }}>
      {records.length === 0 && <div style={{ color: 'var(--dim)', padding: 8 }}>{L.log.empty}</div>}
      {records.map((r) => {
        const past = r.t <= playheadNs
        const f = frameOf(r)
        const key = r.seq
        const rows = f && expanded === key ? fieldRowsOf(f, L.frameDetail.fields) : null
        const anchored = r.seq === anchorSeq
        return (
          <div key={key} ref={anchored ? anchorRef : undefined} data-log-anchor={anchored || undefined}>
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
                  : r.seq === markerSeq ? '2px solid #f8fafc' : '2px solid transparent',
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
