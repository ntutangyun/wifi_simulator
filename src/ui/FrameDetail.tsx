/**
 * Beginner-oriented breakdown of one frame clicked on the timeline: what it is,
 * who sent it, every field it carries, and what happens next. Replaces the node
 * view in the inspector column while a frame is selected.
 */
import { physicalId } from '../model/caps'
import { fmtNs } from './format'
import { useStrings } from './i18n'
import { useUi, type FrameSelection } from './store'

const dim: React.CSSProperties = { color: 'var(--dim)' }
const hintStyle: React.CSSProperties = { ...dim, fontSize: 11, lineHeight: 1.45, margin: '1px 0 7px' }
const valueRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 }
const para: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.55, margin: '4px 0 8px' }

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div style={valueRow}>
        <span style={dim}>{label}</span>
        <span style={{ textAlign: 'right' }}>{value}</span>
      </div>
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

export function FrameDetail({ sel }: { sel: FrameSelection }) {
  const L = useStrings()
  const F = L.frameDetail
  const { scenario, selectFrame } = useUi()
  const f = sel.frame

  const nameOf = (id: string): string => {
    if (id === '*mu') return F.everyone
    const cfg = scenario.nodes.find((n) => n.id === physicalId(id))
    const name = cfg?.name ?? id
    return id.includes('#6g') ? `${name} · 6G` : name
  }

  const rate = f.mcs !== undefined
    ? `${L.generations[f.mode ?? 'nonht']} · MCS ${f.mcs} · ${f.mbps} Mbps`
    : `${f.mbps} Mbps`

  return (
    <div style={{ padding: 10, overflowY: 'auto', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <strong style={{ fontSize: 12.5 }}>{F.kindName[f.kind]}</strong>
        <button style={{ marginLeft: 'auto', padding: '1px 8px' }} title={F.close} onClick={() => selectFrame(null)}>✕</button>
      </div>
      <p style={para}>{F.whatIs[f.kind]}</p>
      {sel.side === 'rx' && <p style={{ ...para, ...dim }}>{F.clickedRx(nameOf(sel.nodeId))}</p>}

      <Row label={F.from} value={<b>{nameOf(f.src)}</b>} />
      <Row label={F.to} value={<b>{nameOf(f.dst)}</b>} />
      {f.retryFlag && <Row label={F.retry} value="⚠" hint={F.retryHint} />}

      <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
      <Row label={F.when} value={`${fmtNs(sel.startNs)} s`} hint={F.whenHint} />
      <Row label={F.airtime} value={`${(f.txTimeNs / 1000).toFixed(1)} µs`} hint={F.airtimeHint} />
      <Row label={F.size} value={`${f.bytes} B`} hint={F.sizeHint} />
      <Row label={F.rate} value={rate} hint={f.mcs !== undefined ? F.rateHintMcs : F.rateHintLegacy} />
      {f.ac !== undefined && <Row label={F.ac} value={F.acNames[f.ac]} hint={F.acHint} />}
      <Row label={F.duration} value={`${(f.durationFieldNs / 1000).toFixed(1)} µs`} hint={F.durationHint} />
      {f.seqNo !== undefined && <Row label={F.seq} value={`#${f.seqNo}`} hint={F.seqHint} />}

      {f.ampdu && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          <div style={{ fontWeight: 600, fontSize: 11.5 }}>{F.ampduTitle(f.ampdu.mpduCount)}</div>
          <div style={hintStyle}>{F.ampduHint}</div>
        </>
      )}

      {f.muParts && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
          <div style={{ fontWeight: 600, fontSize: 11.5 }}>{F.muTitle(f.muParts.length)}</div>
          <div style={hintStyle}>{F.muHint}</div>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', marginBottom: 6 }}>
            <thead>
              <tr style={dim}><td>{F.muTo}</td><td style={{ textAlign: 'right' }}>{F.muSize}</td><td style={{ textAlign: 'right' }}>{F.muRate}</td></tr>
            </thead>
            <tbody>
              {f.muParts.map((p, i) => (
                <tr key={i}>
                  <td>{nameOf(p.dst)}</td>
                  <td style={{ textAlign: 'right' }}>{p.bytes}</td>
                  <td style={{ textAlign: 'right' }}>MCS {p.mcs} · {p.mbps} M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {f.orthogonalGroup && <div style={hintStyle}>{F.ruNote}</div>}

      <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
      <div style={{ fontWeight: 600, fontSize: 11.5 }}>{F.nextTitle}</div>
      <p style={para}>{F.next[f.kind]}</p>
    </div>
  )
}
