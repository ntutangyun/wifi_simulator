import { useUi } from './store'
import { fmtLatency, fmtNs } from './format'
import { FrameDetail } from './FrameDetail'
import { useStrings, type Strings } from './i18n'
import type { NodeView } from '../model/view'
import { nodeDisplayName } from './names'
import { linkOfVirtual, physicalId } from '../model/caps'
import { UwbInspector } from '../uwb/ui/UwbInspector'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const AC_NAME = ['BK', 'BE', 'VI', 'VO']

function StateBadge({ nv, t }: { nv: NodeView; t: number }) {
  const nav = nv.navUntilNs > t
  const label = nav && nv.state !== 'tx' ? `${nv.state} +NAV` : nv.state
  const colors: Record<string, string> = {
    idle: '#555', defer: '#eab308', backoff: '#f59e0b', tx: '#3b82f6',
    rx: '#8b5cf6', waitAck: '#06b6d4', waitCts: '#06b6d4', sifsResp: '#06b6d4',
    ampWait: '#0d9488', bsWait: '#5eead4', uwbWait: '#d97706',
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

function NodeSection({ vid, nv, t, L, U, nameOf, serverName }: { vid: string; nv: NodeView; t: number; L: Strings['inspector']; U: Strings['uwb']; nameOf: (id: string) => string; serverName: (id: string | undefined) => string }) {
  const secs = Math.max(1e-9, t / 1e9)
  // A ranging device runs no Wi-Fi link, so it gets none of the rows below —
  // no band heading, no contention state, no queue, no throughput.
  if (nv.uwb) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
          <strong>{nv.uwb.role === 'anchor' ? U.anchor : U.tag}</strong>
          <StateBadge nv={nv} t={t} />
        </div>
        <UwbInspector nv={nv} nameOf={nameOf} />
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
        <strong>{L.linkName[linkOfVirtual(vid)]}</strong>
        <StateBadge nv={nv} t={t} />
      </div>

      {nv.amp ? (
        <>
          {!nv.amp.bs && <>
          <div style={row}><Lbl hint={L.abocHint}>{L.aboc}</Lbl><span>{nv.amp.aboc ?? '—'} / [0, {nv.amp.acw}]</span></div>
          <div style={row}><Lbl hint={L.slotHint}>{L.slot}</Lbl><span>{nv.amp.slot ?? '—'}</span></div>
          <div style={row}><Lbl hint={L.ampCountsHint}>{L.ampCounts}</Lbl><span>{nv.amp.sent} / {nv.amp.acked} / {nv.amp.lost}</span></div>
          </>}
          {nv.amp.bs ? (
            <>
              <div style={row}><Lbl hint={L.bsCounterHint}>{L.bsCounter}</Lbl><span>{nv.amp.bs.counter ?? '—'}</span></div>
              <div style={row}><Lbl hint={L.bsInventoriedHint}>{L.bsInventoried}</Lbl><span>{nv.amp.bs.inventoried ? L.bsYes : L.bsNo}</span></div>
              <div style={row}><Lbl hint={L.bsRepliesHint}>{L.bsReplies}</Lbl><span>{nv.amp.bs.replies} / {nv.amp.bs.collisions}</span></div>
              <div style={row}><Lbl hint={L.bsSnrHint}>{L.bsSnr}</Lbl><span>{nv.amp.bs.lastSnrDb === null ? '—' : `${nv.amp.bs.lastSnrDb.toFixed(1)} dB`}</span></div>
            </>
          ) : (
            <div style={row}><span style={dim}>{L.satOut}</span><span>{nv.amp.roundsSatOut} / {nv.amp.roundsHeard}</span></div>
          )}
        </>
      ) : nv.acs ? (
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

      {nv.ampRound && (nv.ampRound.inventory
        ? <div style={row}><Lbl hint={L.inventoryHint}>{L.inventory}</Lbl><span>{L.session} {nv.ampRound.inventory.session} · {L.slot} {nv.ampRound.inventory.slot}{nv.ampRound.slots ? `/${nv.ampRound.slots}` : ''} · {nv.ampRound.inventory.read} / {nv.ampRound.inventory.collisions} / {nv.ampRound.inventory.empties}</span></div>
        : <div style={row}><Lbl hint={L.ampRoundHint}>{L.ampRound}</Lbl><span>{L.ampPhase[nv.ampRound.phase]} · {L.slot} {nv.ampRound.slot}/{nv.ampRound.slots} · {nv.ampRound.received.map(nameOf).join(', ') || '—'}</span></div>
      )}
      {/* Between TXOPs there is no round — and that is exactly when the reader's own tally is
          worth reading, because it is reported in the instant the round is cleared. */}
      {!nv.ampRound && nv.ampInventoryLast && (
        <div style={row}><Lbl hint={L.inventoryLastHint}>{L.inventoryLast}</Lbl><span>{L.session} {nv.ampInventoryLast.session} · {L.slot} {nv.ampInventoryLast.slot} · {nv.ampInventoryLast.read} / {nv.ampInventoryLast.collisions} / {nv.ampInventoryLast.empties}</span></div>
      )}

      {!nv.amp && <>
      <div style={row}><Lbl hint={L.ssrcHint}>{L.ssrcSlrc}</Lbl><span>{nv.qsrc}</span></div>
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
      </>}
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
            {' → '}{nameOf(nv.currentTx.dst)} @{nv.currentTx.mbps}M
          </span></div>
      )}
      {nv.currentRx && (
        <div style={row}><span style={dim}>{L.receiving}</span>
          <span>{L.receivingFrom(nv.currentRx.frame.kind.toUpperCase(), nameOf(nv.currentRx.from))}</span></div>
      )}

      {!nv.amp && <>
      <div style={{ ...dim, marginTop: 6 }}>{L.queue} ({nv.queue.length})</div>
      <div style={{ maxHeight: 90, overflowY: 'auto', fontSize: 12 }}>
        {nv.queue.slice(0, 10).map((m) => (
          <div key={m.id} style={row}>
            <span>#{m.id} → {nameOf(m.dst)}{m.inFlight && <span style={{ color: '#22d3ee', marginLeft: 6 }}>· {L.inFlight}</span>}</span>
            <span>{m.bytes} B · {((t - m.bornNs) / 1e6).toFixed(1)} ms {L.old}</span>
          </div>
        ))}
        {nv.queue.length > 10 && <div style={dim}>… {nv.queue.length - 10} {L.more}</div>}
      </div>
      </>}

      <div style={{ ...dim, marginTop: 6 }}>{L.stats}</div>
      <div style={row}><span style={dim}>{L.framesDelivered}</span><span>{nv.stats.txOk}</span></div>
      <div style={row}><span style={dim}>{L.retriesDrops}</span><span>{nv.stats.retries} / {nv.stats.drops}</span></div>
      <div style={row}><span style={dim}>{L.collisionsL}</span><span>{nv.stats.collisions}</span></div>
      <div style={row}><span style={dim}>{L.airtimeShare}</span><span>{((nv.stats.airtimeNs / Math.max(1, t)) * 100).toFixed(1)}%</span></div>
      <div style={row}><span style={dim}>{L.rxThroughput}</span><span>{((nv.stats.bytesDelivered * 8) / secs / 1e6).toFixed(2)} Mbps</span></div>
      <div style={row}><Lbl hint={L.txLatencyHint}>{L.txLatency}</Lbl><span>{fmtLatency(nv.stats.txLatency)}</span></div>
      <div style={row}><Lbl hint={L.rxLatencyHint}>{L.rxLatency}</Lbl><span>{fmtLatency(nv.stats.rxLatency)}</span></div>
      {nv.stats.relayLatency.n > 0 && (
        <div style={row}><Lbl hint={L.relayLatencyHint}>{L.relayLatency}</Lbl><span>{fmtLatency(nv.stats.relayLatency)}</span></div>
      )}
      {nv.stats.appRtt.n > 0 && (
        <div style={row}><Lbl hint={L.appRttHint}>{L.appRtt}</Lbl><span>{fmtLatency(nv.stats.appRtt)} <span style={dim}>· {serverName(nv.stats.appRttServer)}</span></span></div>
      )}
    </div>
  )
}

export function Inspector() {
  const { view, playheadNs, selectedNodeId, selectedFrame, scenario } = useUi()
  const S = useStrings()
  const L = S.inspector
  const nameOf = (id: string): string => nodeDisplayName(scenario.nodes, id, S.frameDetail.everyone)
  const serverName = (id: string | undefined): string => scenario.servers.find((s) => s.id === id)?.name ?? id ?? ''
  if (selectedFrame) return <FrameDetail sel={selectedFrame} />
  if (!view) return <div style={{ padding: 10, color: 'var(--dim)' }}>{L.waiting}</div>

  const t = playheadNs
  const secs = Math.max(1e-9, t / 1e9)

  if (!selectedNodeId || !view.nodes[selectedNodeId]) {
    // BSS totals are about the Wi-Fi cell; a ranging lane carries no BSS traffic
    // and would only pad the table with zeroes. Click a UWB node for its ranges.
    const nodes = Object.entries(view.nodes).filter(([, n]) => !n.uwb)
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
          <thead><tr style={dim}><td>{L.node}</td><td>{L.ok}</td><td>{L.rty}</td><td>{L.airtime}</td><td title={L.latHint} style={{ cursor: 'help' }}>{L.lat}</td><td title={L.appRttHint} style={{ cursor: 'help' }}>{L.appRtt}</td></tr></thead>
          <tbody>
            {nodes.map(([id, n]) => (
              <tr key={id}>
                <td>
                  {nameOf(id)}
                  {n.txopUntilNs > t && (
                    <span style={{ color: '#22d3ee', marginLeft: 6 }} title={L.txopHint}>
                      {L.txop} AC_{AC_NAME[n.txopAc] ?? '?'} · {((n.txopUntilNs - t) / 1000).toFixed(0)} µs
                    </span>
                  )}
                </td>
                <td>{n.stats.txOk}</td>
                <td>{n.stats.retries}</td>
                <td>{((n.stats.airtimeNs / Math.max(1, t)) * 100).toFixed(1)}%</td>
                <td>{n.stats.txLatency.n ? `${(n.stats.txLatency.sumNs / n.stats.txLatency.n / 1e6).toFixed(1)} ms` : '—'}</td>
                <td>{n.stats.appRtt.n ? `${(n.stats.appRtt.sumNs / n.stats.appRtt.n / 1e6).toFixed(1)} ms` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {scenario.servers.length > 0 && (
          <>
            <div style={{ ...dim, marginTop: 10 }}>{L.servers}</div>
            <table style={{ width: '100%', marginTop: 4, fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={dim}><td>{L.serverCols.server}</td><td>{L.serverCols.kind}</td><td>{L.serverCols.rtt}</td><td>{L.serverCols.up}</td><td>{L.serverCols.down}</td></tr></thead>
              <tbody>
                {scenario.servers.map((s) => {
                  const v = view.servers[s.id]
                  return (
                    <tr key={s.id}>
                      <td>☁ {s.name}</td>
                      <td>{S.serverKinds[s.kind]}</td>
                      <td>{s.rttMs}{s.jitterMs ? `+${s.jitterMs}` : ''}{s.processMs ? ` +${s.processMs}` : ''} ms</td>
                      <td>{v ? `${(v.bytesUp / 1024).toFixed(1)} KiB` : '—'}</td>
                      <td>{v ? `${(v.bytesDown / 1024).toFixed(1)} KiB` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    )
  }

  const phys = physicalId(selectedNodeId)
  const cfg = scenario.nodes.find((n) => n.id === phys)
  const lanes = Object.keys(view.nodes).filter((vid) => physicalId(vid) === phys)
  return (
    <div style={{ padding: 10, overflowY: 'auto' }}>
      <strong>{cfg?.name ?? phys}</strong>
      {lanes.map((vid, i) => (
        <div key={vid} style={i > 0 ? { borderTop: '1px solid var(--border)', marginTop: 8 } : undefined}>
          <NodeSection vid={vid} nv={view.nodes[vid]} t={t} L={L} U={S.uwb} nameOf={nameOf} serverName={serverName} />
        </div>
      ))}
      <div style={{ ...dim, marginTop: 8, fontSize: 11 }}>t = {fmtNs(t)} s</div>
    </div>
  )
}
