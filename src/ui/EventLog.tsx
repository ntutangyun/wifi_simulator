import { useState } from 'react'
import { player, useUi } from './store'
import { decodeFrame, fmtNs, fmtRecord, type FieldRow } from './format'
import { useStrings, type Strings } from './i18n'
import type { FrameDesc } from '../model/frames'
import type { TLRecord } from '../model/records'

const WINDOW_BEFORE = 3_000_000 // 3 ms back
const WINDOW_AFTER = 500_000 // 0.5 ms ahead

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
  const [expanded, setExpanded] = useState<number | null>(null)
  const L = useStrings()

  const records = player.store
    .recordsIn(Math.max(player.store.windowStartNs, playheadNs - WINDOW_BEFORE), playheadNs + WINDOW_AFTER)
    .filter((r) => r.type !== 'MAC_STATE')
    .slice(-160)
  // Mark the most recent record at or before the playhead — exact equality
  // almost never holds after an analog (wheel) seek.
  const markerSeq = records.reduce<number | null>((m, r) => (r.t <= playheadNs ? r.seq : m), null)

  return (
    <div style={{ overflow: 'auto', fontSize: 11.5, fontFamily: 'Consolas, monospace', padding: '4px 0' }}>
      {records.length === 0 && <div style={{ color: 'var(--dim)', padding: 8 }}>{L.log.empty}</div>}
      {records.map((r) => {
        const past = r.t <= playheadNs
        const f = frameOf(r)
        const key = r.seq
        const rows = f && expanded === key ? fieldRowsOf(f, L.frameDetail.fields) : null
        return (
          <div key={key}>
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
                borderLeft: r.seq === markerSeq ? '2px solid #f8fafc' : '2px solid transparent',
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
