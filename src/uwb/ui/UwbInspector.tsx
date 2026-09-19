/**
 * The inspector panel of a UWB device. A ranging node has no queue, no backoff
 * and no contention window, so none of the Wi-Fi rows apply: what it has is a
 * role, the block and round it is in, the ranges it has measured against each
 * peer, and — for a tag — the fix those ranges solve to.
 *
 * Every number comes from ./rows.ts, which is where it is tested.
 */
import type { NodeView } from '../../model/view'
import { useStrings } from '../../ui/i18n'
import { uwbFixRow, uwbRangeRows } from './rows'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const num: React.CSSProperties = { textAlign: 'right' }

export function UwbInspector({ nv, nameOf }: { nv: NodeView; nameOf: (id: string) => string }) {
  const U = useStrings().uwb
  const u = nv.uwb
  if (!u) return null
  const ranges = uwbRangeRows(u, U)
  const fix = u.position ? uwbFixRow(u.position) : null

  return (
    <div>
      <div style={row}><span style={dim}>{U.role}</span><span>{u.role === 'anchor' ? U.anchor : U.tag}</span></div>
      <div style={row}>
        <span style={dim}>{U.blockRound}</span>
        <span>{u.block} / {u.round} <span style={dim}>· {u.rounds} {U.rounds}</span></span>
      </div>
      <div style={row}><span style={dim}>{U.slot}</span><span>{u.slot ?? '—'}</span></div>
      <div style={row}><span style={dim}>{U.timeouts}</span><span>{u.timeouts}</span></div>
      <div style={row}><span style={dim}>{U.interfered}</span><span>{u.interfered}</span></div>

      <div style={{ ...dim, marginTop: 6 }}>{U.ranges} ({ranges.length})</div>
      {ranges.length > 0 && (
        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={dim}>
              <td>{U.peer}</td>
              <td style={num}>{U.measured}</td>
              <td style={num}>{U.trueDist}</td>
              <td style={num}>{U.error}</td>
              <td style={num}>{U.fom}</td>
              <td style={num}>{U.rounds}</td>
            </tr>
          </thead>
          <tbody>
            {ranges.map((r) => (
              <tr key={r.peer} title={r.method}>
                <td>{nameOf(r.peer)}</td>
                <td style={num}>{r.measured}</td>
                <td style={num}>{r.trueDist}</td>
                <td style={num}>{r.error}</td>
                <td style={num}>{r.fom}</td>
                <td style={num}>{r.rounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {u.role === 'tag' && (
        <>
          <div style={{ ...dim, marginTop: 6 }}>{U.position}</div>
          {fix ? (
            <>
              <div style={row}><span style={dim}>{U.estimate}</span><span>{fix.estimate}</span></div>
              <div style={row}><span style={dim}>{U.trueDist}</span><span>{fix.truth}</span></div>
              <div style={row}><span style={dim}>{U.error}</span><span>{fix.error}</span></div>
              <div style={row}><span style={dim}>{U.gdop}</span><span>{fix.gdop}</span></div>
              <div style={row}><span style={dim}>{U.ellipse}</span><span>{fix.ellipse}</span></div>
            </>
          ) : (
            <div style={{ ...dim, fontSize: 11 }}>{U.noPosition}</div>
          )}
        </>
      )}
    </div>
  )
}
