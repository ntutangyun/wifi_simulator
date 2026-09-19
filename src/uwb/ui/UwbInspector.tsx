/**
 * The inspector panel of a UWB device. A ranging node has no queue, no backoff
 * and no EDCA contention window, so none of the Wi-Fi rows apply: what it has is
 * a role, the block and round it is in, the ranges it has measured against each
 * peer, and — for a tag — the fix those ranges solve to. A one-way (TDoA) session
 * measures no ranges at all, so the table under it is one of time differences
 * against the round's reference anchor instead. A contention session
 * (standard §10.32.2 schedule mode 0) adds two rows of its own: the slot an
 * anchor drew, and the response slots a tag lost to overlapping answers.
 *
 * Every number comes from ./rows.ts, which is where it is tested.
 */
import type { NodeView } from '../../model/view'
import { useStrings } from '../../ui/i18n'
import { uwbAoaRows, uwbContendText, uwbFixRow, uwbRangeRows, uwbTdoaRows } from './rows'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const num: React.CSSProperties = { textAlign: 'right' }

export function UwbInspector({ nv, nameOf }: { nv: NodeView; nameOf: (id: string) => string }) {
  const U = useStrings().uwb
  const u = nv.uwb
  if (!u) return null
  const ranges = uwbRangeRows(u, U)
  // One-way ranging: a listening tag measures no distance at all, only differences of them.
  const tdoa = uwbTdoaRows(u)
  // Angle of arrival: the anchor's own bearings, one row per tag it has seen.
  const aoa = uwbAoaRows(u)
  const fix = u.position ? uwbFixRow(u.position, U) : null
  // Both rows exist only in a contention session: an anchor that never drew a slot and a tag
  // that never lost one have nothing to say, and a time-scheduled session never shows either.
  const contend = uwbContendText(u, U)

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
      {contend !== null && (
        <div style={row} title={U.contendHint}><span style={dim}>{U.contend}</span><span>{contend}</span></div>
      )}
      {u.contendCollisions > 0 && (
        <div style={row} title={U.contendCollisionsHint}>
          <span style={dim}>{U.contendCollisions}</span><span>{u.contendCollisions}</span>
        </div>
      )}

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

      {tdoa.length > 0 && (
        <>
          <div style={{ ...dim, marginTop: 6 }} title={U.tdoaHint}>{U.tdoa} ({tdoa.length})</div>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={dim}>
                <td>{U.peer}</td>
                <td style={num}>{U.measured}</td>
                <td style={num}>{U.trueDist}</td>
                <td style={num}>{U.error}</td>
                <td style={num}>{U.rounds}</td>
              </tr>
            </thead>
            <tbody>
              {tdoa.map((d) => (
                <tr key={d.peer}>
                  <td>{nameOf(d.peer)}</td>
                  <td style={num}>{d.measured}</td>
                  <td style={num}>{d.trueDt}</td>
                  <td style={num}>{d.error}</td>
                  <td style={num}>{d.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {aoa.length > 0 && (
        <>
          <div style={{ ...dim, marginTop: 6 }} title={U.aoaHint}>{U.aoa} ({aoa.length})</div>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={dim}>
                <td>{U.peer}</td>
                <td style={num}>{U.measured}</td>
                <td style={num}>{U.trueDist}</td>
                <td style={num}>{U.error}</td>
                <td style={num}>{U.aoaSigma}</td>
                <td style={num}>{U.rounds}</td>
              </tr>
            </thead>
            <tbody>
              {aoa.map((a) => (
                <tr key={a.peer} title={U.aoaRowHint}>
                  <td>{nameOf(a.peer)}</td>
                  <td style={num}>{a.measured}</td>
                  <td style={num}>{a.trueTheta}</td>
                  <td style={num}>{a.error}</td>
                  <td style={num}>{a.sigma}</td>
                  <td style={num}>{a.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {u.role === 'tag' && (
        <>
          <div style={{ ...dim, marginTop: 6 }}>{U.position}</div>
          {fix ? (
            <>
              <div style={row}><span style={dim}>{U.methodLabel}</span><span>{fix.method}</span></div>
              <div style={row}><span style={dim}>{U.estimate}</span><span>{fix.estimate}</span></div>
              <div style={row}><span style={dim}>{U.trueDist}</span><span>{fix.truth}</span></div>
              <div style={row}><span style={dim}>{U.error}</span><span>{fix.error}</span></div>
              <div style={row}><span style={dim}>{U.gdop}</span><span>{fix.gdop}</span></div>
              <div
                style={row}
                title={u.position === null || u.position.method === 'twr' ? undefined
                  : u.position.method === 'aoa' ? U.ellipseHintAoa : U.ellipseHintTdoa}
              >
                <span style={dim}>{U.ellipse}</span><span>{fix.ellipse}</span>
              </div>
            </>
          ) : (
            <div style={{ ...dim, fontSize: 11 }}>{U.noPosition}</div>
          )}
        </>
      )}
    </div>
  )
}
