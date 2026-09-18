/**
 * The inspector panel of a UWB device. A ranging node has no queue, no backoff
 * and no contention window, so none of the Wi-Fi rows apply: what it has is a
 * role, the block and round it is in, the ranges it has measured against each
 * peer, and — for a tag — the fix those ranges solve to.
 */
import type { NodeView } from '../../model/view'
import { useStrings } from '../../ui/i18n'
import { fomText } from '../phy'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const num: React.CSSProperties = { textAlign: 'right' }

const m = (v: number) => `${v.toFixed(2)} m`
const cm = (v: number) => `${(v * 100).toFixed(1)} cm`

export function UwbInspector({ nv, nameOf }: { nv: NodeView; nameOf: (id: string) => string }) {
  const S = useStrings()
  const U = S.uwb
  const u = nv.uwb
  if (!u) return null
  const peers = Object.entries(u.ranges)
  const p = u.position

  return (
    <div>
      <div style={row}><span style={dim}>{U.role}</span><span>{u.role === 'anchor' ? U.anchor : U.tag}</span></div>
      <div style={row}><span style={dim}>{U.blockRound}</span><span>{u.block} / {u.round} <span style={dim}>({u.rounds})</span></span></div>
      <div style={row}><span style={dim}>{U.slot}</span><span>{u.slot ?? '—'}</span></div>
      <div style={row}><span style={dim}>{U.timeouts}</span><span>{u.timeouts}</span></div>

      <div style={{ ...dim, marginTop: 6 }}>{U.ranges} ({peers.length})</div>
      {peers.length > 0 && (
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
            {peers.map(([id, r]) => (
              <tr key={id} title={`${U.fom}: ${fomText(r.fom)} · ${r.method.toUpperCase()}-TWR`}>
                <td>{nameOf(id)}</td>
                <td style={num}>{m(r.distM)}</td>
                <td style={num}>{m(r.trueDistM)}</td>
                <td style={num}>{cm(r.distM - r.trueDistM)}</td>
                <td style={num}>{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {peers.length > 0 && (
        <div style={{ ...dim, fontSize: 11, marginTop: 2 }}>
          {U.fom}: {fomText(peers[0][1].fom)}
        </div>
      )}

      {u.role === 'tag' && (
        <>
          <div style={{ ...dim, marginTop: 6 }}>{U.position}</div>
          {p ? (
            <>
              <div style={row}><span style={dim}>{U.estimate}</span><span>({p.x.toFixed(2)}, {p.y.toFixed(2)}) m</span></div>
              <div style={row}><span style={dim}>{U.trueDist}</span><span>({p.trueX.toFixed(2)}, {p.trueY.toFixed(2)}) m</span></div>
              <div style={row}><span style={dim}>{U.error}</span><span>{cm(Math.hypot(p.x - p.trueX, p.y - p.trueY))}</span></div>
              <div style={row}><span style={dim}>{U.gdop}</span><span>{p.gdop.toFixed(2)}</span></div>
              <div style={row}><span style={dim}>{U.ellipse}</span><span>{(p.ellipse.a * 100).toFixed(1)} × {(p.ellipse.b * 100).toFixed(1)} cm</span></div>
            </>
          ) : (
            <div style={{ ...dim, fontSize: 11 }}>{U.noPosition}</div>
          )}
        </>
      )}
    </div>
  )
}
