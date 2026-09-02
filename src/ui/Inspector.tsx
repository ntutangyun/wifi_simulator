import { useUi } from './store'
import { fmtNs } from './format'
import { FrameDetail } from './FrameDetail'
import { useStrings, type Strings } from './i18n'
import type { NodeView } from '../model/view'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const AC_NAME = ['BK', 'BE', 'VI', 'VO']

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

function Lbl({ children, hint }: { children: React.ReactNode; hint: string }) {
  return <span style={{ ...dim, cursor: 'help', borderBottom: '1px dotted #444' }} title={hint}>{children}</span>
}

function NodeSection({ vid, nv, t, L }: { vid: string; nv: NodeView; t: number; L: Strings['inspector'] }) {
  const secs = Math.max(1e-9, t / 1e9)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
        <strong>{vid.includes('#6g') ? L.link6 : L.link5}</strong>
        <StateBadge nv={nv} t={t} />
      </div>

      {nv.acs ? (
        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', marginBottom: 4 }}>
          <thead>
            <tr style={dim}>
              <td title={L.acHint}>{L.acHeader.ac}</td>
              <td title={L.boHint}>{L.acHeader.bo}</td>
              <td title={L.cwHint}>{L.acHeader.cw}</td>
              <td title={L.queueHint}>{L.acHeader.queue}</td>
            </tr>
          </thead>
          <tbody>
            {nv.acs.map((a, i) => (
              <tr key={i} style={{ opacity: a.queueLen || a.backoff !== null ? 1 : 0.45 }}>
                <td>AC_{AC_NAME[i]}</td>
                <td>{a.backoff ?? '—'}</td>
                <td>{a.cw}</td>
                <td>{a.queueLen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div style={row}><Lbl hint={L.boHint}>{L.backoffCounter}</Lbl><span>{nv.backoff ?? '—'}</span></div>
          <div style={row}><Lbl hint={L.cwHint}>{L.cw}</Lbl><span>{nv.cw}</span></div>
        </>
      )}

      <div style={row}><Lbl hint={L.ssrcHint}>{L.ssrcSlrc}</Lbl><span>{nv.ssrc} / {nv.slrc}</span></div>
      <div style={row}>
        <Lbl hint={L.navHint}>{L.nav}</Lbl>
        <span>{nv.navUntilNs > t ? `${((nv.navUntilNs - t) / 1000).toFixed(1)} µs ${L.left}` : L.navIdle}</span>
      </div>
      <div style={row}>
        <Lbl hint={L.ifsHint}>{L.ifs}</Lbl>
        <span>
          {nv.acs
            ? nv.acs
                .flatMap((a, i) => a.ifs ? [`${a.ifs.kind}/${AC_NAME[i]} ${(Math.max(0, a.ifs.untilNs - t) / 1000).toFixed(1)} µs`] : [])
                .join(' · ') || '—'
            : nv.ifs
              ? `${nv.ifs.kind}, ${(Math.max(0, nv.ifs.untilNs - t) / 1000).toFixed(1)} µs ${L.left}`
              : '—'}
        </span>
      </div>
      <div style={row}><Lbl hint={L.ccaHint}>{L.cca}</Lbl><span>{nv.ccaBusy ? L.busy : L.idle}</span></div>
      {nv.txopUntilNs > t && (
        <div style={row}>
          <Lbl hint={L.txopHint}>{L.txop}</Lbl>
          <span>AC_{AC_NAME[nv.txopAc] ?? '?'} · {((nv.txopUntilNs - t) / 1000).toFixed(0)} µs {L.left}</span>
        </div>
      )}
      {nv.currentTx && (
        <div style={row}><span style={dim}>{L.transmitting}</span>
          <span>
            {nv.currentTx.kind.toUpperCase()}
            {nv.currentTx.ampdu ? `×${nv.currentTx.ampdu.mpduCount}` : ''}
            {nv.currentTx.muParts ? ` MU×${nv.currentTx.muParts.length}` : ''}
            {' → '}{nv.currentTx.dst} @{nv.currentTx.mbps}M
          </span></div>
      )}
      {nv.currentRx && (
        <div style={row}><span style={dim}>{L.receiving}</span>
          <span>{nv.currentRx.frame.kind.toUpperCase()} from {nv.currentRx.from}</span></div>
      )}

      <div style={{ ...dim, marginTop: 6 }}>{L.queue} ({nv.queue.length})</div>
      <div style={{ maxHeight: 90, overflowY: 'auto', fontSize: 12 }}>
        {nv.queue.slice(0, 10).map((m) => (
          <div key={m.id} style={row}>
            <span>#{m.id} → {m.dst}</span>
            <span>{m.bytes} B · {((t - m.bornNs) / 1e6).toFixed(1)} ms {L.old}</span>
          </div>
        ))}
        {nv.queue.length > 10 && <div style={dim}>… {nv.queue.length - 10} {L.more}</div>}
      </div>

      <div style={{ ...dim, marginTop: 6 }}>{L.stats}</div>
      <div style={row}><span style={dim}>{L.framesDelivered}</span><span>{nv.stats.txOk}</span></div>
      <div style={row}><span style={dim}>{L.retriesDrops}</span><span>{nv.stats.retries} / {nv.stats.drops}</span></div>
      <div style={row}><span style={dim}>{L.collisionsL}</span><span>{nv.stats.collisions}</span></div>
      <div style={row}><span style={dim}>{L.airtimeShare}</span><span>{((nv.stats.airtimeNs / Math.max(1, t)) * 100).toFixed(1)}%</span></div>
      <div style={row}><span style={dim}>{L.rxThroughput}</span><span>{((nv.stats.bytesDelivered * 8) / secs / 1e6).toFixed(2)} Mbps</span></div>
    </div>
  )
}

export function Inspector() {
  const { view, playheadNs, selectedNodeId, selectedFrame, scenario } = useUi()
  const L = useStrings().inspector
  if (selectedFrame) return <FrameDetail sel={selectedFrame} />
  if (!view) return <div style={{ padding: 10, color: 'var(--dim)' }}>{L.waiting}</div>

  const t = playheadNs
  const secs = Math.max(1e-9, t / 1e9)

  if (!selectedNodeId || !view.nodes[selectedNodeId]) {
    const nodes = Object.entries(view.nodes)
    const delivered = nodes.reduce((s, [, n]) => s + n.stats.bytesDelivered, 0)
    const collisions = nodes.reduce((s, [, n]) => s + n.stats.collisions, 0)
    const retries = nodes.reduce((s, [, n]) => s + n.stats.retries, 0)
    return (
      <div style={{ padding: 10, overflowY: 'auto' }}>
        <div style={{ ...dim, marginBottom: 6 }}>{L.bssTotals}</div>
        <div style={row}><span style={dim}>{L.throughput}</span><span>{((delivered * 8) / secs / 1e6).toFixed(2)} Mbps</span></div>
        <div style={row}><span style={dim}>{L.delivered}</span><span>{(delivered / 1024).toFixed(1)} KiB</span></div>
        <div style={row}><span style={dim}>{L.collisions}</span><span>{collisions}</span></div>
        <div style={row}><span style={dim}>{L.retries}</span><span>{retries}</span></div>
        <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={dim}><td>{L.node}</td><td>{L.ok}</td><td>{L.rty}</td><td>{L.airtime}</td></tr></thead>
          <tbody>
            {nodes.map(([id, n]) => (
              <tr key={id}>
                <td>{(scenario.nodes.find((x) => x.id === id.replace('#6g', ''))?.name ?? id) + (id.includes('#6g') ? ' ·6G' : '')}</td>
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

  const phys = selectedNodeId.replace('#6g', '')
  const cfg = scenario.nodes.find((n) => n.id === phys)
  const primary = view.nodes[phys] ? phys : selectedNodeId
  const sibling = view.nodes[`${phys}#6g`] && primary === phys ? `${phys}#6g` : null
  return (
    <div style={{ padding: 10, overflowY: 'auto' }}>
      <strong>{cfg?.name ?? phys}</strong>
      <NodeSection vid={primary} nv={view.nodes[primary]} t={t} L={L} />
      {sibling && <div style={{ borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <NodeSection vid={sibling} nv={view.nodes[sibling]} t={t} L={L} />
      </div>}
      <div style={{ ...dim, marginTop: 8, fontSize: 11 }}>t = {fmtNs(t)} s</div>
    </div>
  )
}
