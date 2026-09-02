import { useState } from 'react'
import { player, useUi } from './store'
import { decodeFrame, fmtNs, fmtRecord } from './format'
import { useStrings } from './i18n'
import type { TLRecord } from '../model/records'

const WINDOW_BEFORE = 3_000_000 // 3 ms back
const WINDOW_AFTER = 500_000 // 0.5 ms ahead

function frameOf(r: TLRecord) {
  return 'frame' in r ? r.frame : null
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
              <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>{fmtNs(r.t)}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{fmtRecord(r)}{f ? ' ▸' : ''}</span>
            </div>
            {f && expanded === key && (
              <table style={{ margin: '2px 24px 6px', fontSize: 11, borderCollapse: 'collapse' }}>
                <tbody>
                  {decodeFrame(f).map((row) => (
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
