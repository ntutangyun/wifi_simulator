import { useUi } from './store'
import { fmtNs } from './format'
import type { NodeView } from '../model/view'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }

function StateBadge({ nv, t }: { nv: NodeView; t: number }) {
  const nav = nv.navUntilNs > t
  const label = nav && nv.state !== 'tx' ? `${nv.state} +NAV` : nv.state
  const colors: Record<string, string> = {
    idle: '#555', defer: '#eab308', backoff: '#f59e0b', tx: '#3b82f6',
    rx: '#8b5cf6', waitAck: '#06b6d4', waitCts: '#06b6d4', sifsResp: '#06b6d4',
  }
  return (
    <span style={{
      background: nav && nv.state !== 'tx' ? '#9333ea' : colors[nv.state] ?? '#555',
      color: '#fff', borderRadius: 3, padding: '1px 8px', fontSize: 12,
    }}>{label}</span>
  )
}

export function Inspector() {
  const { view, playheadNs, selectedNodeId, scenario } = useUi()
  if (!view) return <div style={{ padding: 10, color: 'var(--dim)' }}>waiting for simulation…</div>

  const t = playheadNs
  const secs = Math.max(1e-9, t / 1e9)

  if (!selectedNodeId || !view.nodes[selectedNodeId]) {
    // BSS totals
    const nodes = Object.entries(view.nodes)
    const delivered = nodes.reduce((s, [, n]) => s + n.stats.bytesDelivered, 0)
    const collisions = nodes.reduce((s, [, n]) => s + n.stats.collisions, 0)
    const retries = nodes.reduce((s, [, n]) => s + n.stats.retries, 0)
    return (
      <div style={{ padding: 10, overflowY: 'auto' }}>
        <div style={{ ...dim, marginBottom: 6 }}>BSS totals — click a node or lane for detail</div>
        <div style={row}><span style={dim}>throughput</span><span>{((delivered * 8) / secs / 1e6).toFixed(2)} Mbps</span></div>
        <div style={row}><span style={dim}>delivered</span><span>{(delivered / 1024).toFixed(1)} KiB</span></div>
        <div style={row}><span style={dim}>collision events</span><span>{collisions}</span></div>
        <div style={row}><span style={dim}>retries</span><span>{retries}</span></div>
        <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={dim}><td>node</td><td>ok</td><td>rty</td><td>airtime</td></tr></thead>
          <tbody>
            {nodes.map(([id, n]) => (
              <tr key={id}>
                <td>{scenario.nodes.find((x) => x.id === id)?.name ?? id}</td>
                <td>{n.stats.txOk}</td>
                <td>{n.stats.retries}</td>
                <td>{((n.stats.airtimeNs / Math.max(1, t)) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const nv = view.nodes[selectedNodeId]
  const cfg = scenario.nodes.find((n) => n.id === selectedNodeId)
  return (
    <div style={{ padding: 10, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <strong>{cfg?.name ?? selectedNodeId}</strong>
        <StateBadge nv={nv} t={t} />
      </div>

      <div style={row}><span style={dim}>backoff counter</span><span>{nv.backoff ?? '—'}</span></div>
      <div style={row}><span style={dim}>CW</span><span>{nv.cw}</span></div>
      <div style={row}><span style={dim}>SSRC / SLRC</span><span>{nv.ssrc} / {nv.slrc}</span></div>
      <div style={row}>
        <span style={dim}>NAV</span>
        <span>{nv.navUntilNs > t ? `${((nv.navUntilNs - t) / 1000).toFixed(1)} µs left` : 'idle'}</span>
      </div>
      <div style={row}>
        <span style={dim}>IFS</span>
        <span>{nv.ifs ? `${nv.ifs.kind}, ${(Math.max(0, nv.ifs.untilNs - t) / 1000).toFixed(1)} µs left` : '—'}</span>
      </div>
      <div style={row}><span style={dim}>CCA</span><span>{nv.ccaBusy ? 'busy' : 'idle'}</span></div>
      {nv.currentTx && (
        <div style={row}><span style={dim}>transmitting</span>
          <span>{nv.currentTx.kind.toUpperCase()} → {nv.currentTx.dst} @{nv.currentTx.mbps}M</span></div>
      )}
      {nv.currentRx && (
        <div style={row}><span style={dim}>receiving</span>
          <span>{nv.currentRx.frame.kind.toUpperCase()} from {nv.currentRx.from}</span></div>
      )}

      <div style={{ ...dim, marginTop: 8 }}>queue ({nv.queue.length})</div>
      <div style={{ maxHeight: 110, overflowY: 'auto', fontSize: 12 }}>
        {nv.queue.slice(0, 12).map((m) => (
          <div key={m.id} style={row}>
            <span>#{m.id} → {m.dst}</span>
            <span>{m.bytes} B · {((t - m.bornNs) / 1e6).toFixed(1)} ms old</span>
          </div>
        ))}
        {nv.queue.length > 12 && <div style={dim}>… {nv.queue.length - 12} more</div>}
      </div>

      <div style={{ ...dim, marginTop: 8 }}>stats</div>
      <div style={row}><span style={dim}>frames delivered</span><span>{nv.stats.txOk}</span></div>
      <div style={row}><span style={dim}>retries / drops</span><span>{nv.stats.retries} / {nv.stats.drops}</span></div>
      <div style={row}><span style={dim}>collisions</span><span>{nv.stats.collisions}</span></div>
      <div style={row}><span style={dim}>airtime share</span><span>{((nv.stats.airtimeNs / Math.max(1, t)) * 100).toFixed(1)}%</span></div>
      <div style={row}><span style={dim}>rx throughput</span><span>{((nv.stats.bytesDelivered * 8) / secs / 1e6).toFixed(2)} Mbps</span></div>

      <div style={{ ...dim, marginTop: 8, fontSize: 11 }}>t = {fmtNs(t)} s</div>
    </div>
  )
}
