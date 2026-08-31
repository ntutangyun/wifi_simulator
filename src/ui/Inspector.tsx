import { useUi } from './store'
import { fmtNs } from './format'
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

function NodeSection({ vid, nv, t }: { vid: string; nv: NodeView; t: number }) {
  const secs = Math.max(1e-9, t / 1e9)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
        <strong>{vid.includes('#6g') ? '6 GHz link' : '5 GHz link'}</strong>
        <StateBadge nv={nv} t={t} />
      </div>

      {nv.acs ? (
        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', marginBottom: 4 }}>
          <thead>
            <tr style={dim}>
              <td title="EDCA access category (BK=background, BE=best effort, VI=video, VO=voice)">AC</td>
              <td title="current backoff slot counter">bo</td>
              <td title="contention window: backoff drawn uniform from [0, CW]">CW</td>
              <td title="frames waiting in this AC's queue">queue</td>
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
          <div style={row}><Lbl hint="random backoff counter — decrements once per idle 9 µs slot">backoff counter</Lbl><span>{nv.backoff ?? '—'}</span></div>
          <div style={row}><Lbl hint="contention window: doubles on failure (15→31→…→1023), resets on success">CW</Lbl><span>{nv.cw}</span></div>
        </>
      )}

      <div style={row}><Lbl hint="station short/long retry counts (§10.3.3)">SSRC / SLRC</Lbl><span>{nv.ssrc} / {nv.slrc}</span></div>
      <div style={row}>
        <Lbl hint="Network Allocation Vector: virtual carrier sense from overheard Duration fields">NAV</Lbl>
        <span>{nv.navUntilNs > t ? `${((nv.navUntilNs - t) / 1000).toFixed(1)} µs left` : 'idle'}</span>
      </div>
      <div style={row}>
        <Lbl hint="interframe space in progress: DIFS/AIFS (contention) or EIFS (after a corrupted frame)">IFS</Lbl>
        <span>{nv.ifs ? `${nv.ifs.kind}${nv.ifs.ac !== undefined ? `/${AC_NAME[nv.ifs.ac]}` : ''}, ${(Math.max(0, nv.ifs.untilNs - t) / 1000).toFixed(1)} µs left` : '—'}</span>
      </div>
      <div style={row}><Lbl hint="physical carrier sense: energy ≥ −62 dBm or decodable preamble ≥ −82 dBm">CCA</Lbl><span>{nv.ccaBusy ? 'busy' : 'idle'}</span></div>
      {nv.txopUntilNs > t && (
        <div style={row}>
          <Lbl hint="transmit opportunity: SIFS-chained exchanges without re-contending, up to the AC's limit">TXOP</Lbl>
          <span>AC_{AC_NAME[nv.txopAc] ?? '?'} · {((nv.txopUntilNs - t) / 1000).toFixed(0)} µs left</span>
        </div>
      )}
      {nv.currentTx && (
        <div style={row}><span style={dim}>transmitting</span>
          <span>
            {nv.currentTx.kind.toUpperCase()}
            {nv.currentTx.ampdu ? `×${nv.currentTx.ampdu.mpduCount}` : ''}
            {nv.currentTx.muParts ? ` MU×${nv.currentTx.muParts.length}` : ''}
            {' → '}{nv.currentTx.dst} @{nv.currentTx.mbps}M
          </span></div>
      )}
      {nv.currentRx && (
        <div style={row}><span style={dim}>receiving</span>
          <span>{nv.currentRx.frame.kind.toUpperCase()} from {nv.currentRx.from}</span></div>
      )}

      <div style={{ ...dim, marginTop: 6 }}>queue ({nv.queue.length})</div>
      <div style={{ maxHeight: 90, overflowY: 'auto', fontSize: 12 }}>
        {nv.queue.slice(0, 10).map((m) => (
          <div key={m.id} style={row}>
            <span>#{m.id} → {m.dst}</span>
            <span>{m.bytes} B · {((t - m.bornNs) / 1e6).toFixed(1)} ms old</span>
          </div>
        ))}
        {nv.queue.length > 10 && <div style={dim}>… {nv.queue.length - 10} more</div>}
      </div>

      <div style={{ ...dim, marginTop: 6 }}>stats</div>
      <div style={row}><span style={dim}>frames delivered</span><span>{nv.stats.txOk}</span></div>
      <div style={row}><span style={dim}>retries / drops</span><span>{nv.stats.retries} / {nv.stats.drops}</span></div>
      <div style={row}><span style={dim}>collisions</span><span>{nv.stats.collisions}</span></div>
      <div style={row}><span style={dim}>airtime share</span><span>{((nv.stats.airtimeNs / Math.max(1, t)) * 100).toFixed(1)}%</span></div>
      <div style={row}><span style={dim}>rx throughput</span><span>{((nv.stats.bytesDelivered * 8) / secs / 1e6).toFixed(2)} Mbps</span></div>
    </div>
  )
}

export function Inspector() {
  const { view, playheadNs, selectedNodeId, scenario } = useUi()
  if (!view) return <div style={{ padding: 10, color: 'var(--dim)' }}>waiting for simulation…</div>

  const t = playheadNs
  const secs = Math.max(1e-9, t / 1e9)

  if (!selectedNodeId || !view.nodes[selectedNodeId]) {
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
      <NodeSection vid={primary} nv={view.nodes[primary]} t={t} />
      {sibling && <div style={{ borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <NodeSection vid={sibling} nv={view.nodes[sibling]} t={t} />
      </div>}
      <div style={{ ...dim, marginTop: 8, fontSize: 11 }}>t = {fmtNs(t)} s</div>
    </div>
  )
}
