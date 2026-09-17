/**
 * Beginner-oriented breakdown of one frame clicked on the timeline: what it is,
 * who sent it, every field it carries, and what happens next. Replaces the node
 * view in the inspector column while a frame is selected.
 */
import { useState } from 'react'
import { hasFeature } from '../model/caps'
import { decodeFrame, type DecodedFrame, type FrameField, type PpduSegmentKey } from '../model/frameFields'
import { nodeDisplayName } from './names'
import { fmtNs } from './format'
import { useStrings, type Strings } from './i18n'
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

  const nameOf = (id: string): string => nodeDisplayName(scenario.nodes, id, F.everyone)

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
          <div style={hintStyle}>{F.muHint(f.muKind)}</div>
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

      {f.orthogonalGroup && <div style={hintStyle}>{F.ruNote(f.muKind)}</div>}

      <FieldsSection sel={sel} nameOf={nameOf} />

      <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
      <div style={{ fontWeight: 600, fontSize: 11.5 }}>{F.nextTitle}</div>
      <p style={para}>{F.next[f.kind]}</p>
    </div>
  )
}

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11 }
const cell: React.CSSProperties = { padding: '2px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' }
const SEG_COLOR: Record<PpduSegmentKey, string> = {
  legacyPreamble: '#a78bfa', signal: '#f472b6', preamble: '#a78bfa', muSig: '#f472b6', data: '#38bdf8', padding: '#64748b',
}

/** Collapsible field-by-field decode of the selected frame: MAC header of the first MPDU, subframes, PPDU layout. */
function FieldsSection({ sel, nameOf }: { sel: FrameSelection; nameOf: (id: string) => string }) {
  const S = useStrings().frameDetail.fields
  const { scenario } = useUi()
  const [open, setOpen] = useState(false)
  const f = sel.frame
  const ap = scenario.nodes.find((n) => n.kind === 'ap')
  let decoded: DecodedFrame | null = null
  if (open && ap) {
    const src = scenario.nodes.find((n) => n.id === f.src) ?? ap
    try {
      decoded = decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') })
    } catch {
      decoded = null // a frame the decoder cannot account for: show nothing rather than wrong sizes
    }
  }
  return (
    <>
      <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
      <div style={{ fontWeight: 600, fontSize: 11.5, cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {S.title}
      </div>
      {!open && <div style={hintStyle}>{S.hint}</div>}
      {decoded && <DecodedView d={decoded} S={S} nameOf={nameOf} />}
    </>
  )
}

function DecodedView({ d, S, nameOf }: {
  d: DecodedFrame
  S: Strings['frameDetail']['fields']
  nameOf: (id: string) => string
}) {
  const first = d.users[0]?.subframes[0]?.mpdu
  const total = d.ppdu.reduce((s, p) => s + p.durNs, 0) || 1
  const several = d.users.length > 1 || (d.users[0]?.subframes.length ?? 0) > 1
  const fieldValue = (x: FrameField): React.ReactNode => {
    if (x.node === undefined) return x.value ?? ''
    const who = x.node === '*' ? S.broadcast : nameOf(x.node)
    return <>{who} <span style={dim}>({(x.roles ?? []).map((r) => S.role[r]).join(' = ')})</span></>
  }
  return (
    <div style={{ margin: '4px 0 6px' }}>
      {first && (
        <>
          <div style={{ fontSize: 11.5, margin: '2px 0' }}>{S.mpdu(first.typeName, first.subtypeName, first.bytes)}</div>
          {d.users.map((u, ui) => (u.aggregated || d.users.length > 1) && (
            <div key={ui} style={{ margin: '2px 0 4px', fontSize: 11 }}>
              {d.users.length > 1 && <div>{S.forUser(nameOf(u.dst))} · {u.bytes} B</div>}
              {u.aggregated && (
                <details>
                  <summary style={{ cursor: 'pointer', ...dim }}>{S.subframes(u.subframes.length)}</summary>
                  <div style={{ ...mono, ...dim, maxHeight: 120, overflowY: 'auto' }}>
                    {u.subframes.map((sf, i) => (
                      <div key={i}>{S.subframeRow(i, sf.delimiterBytes, sf.mpdu.bytes, sf.padBytes)}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
          {several && <div style={{ ...dim, fontSize: 11 }}>{S.firstShown}</div>}
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 6 }}>
            <tbody>
              {first.fields.map((x, i) => (
                <tr key={i}>
                  <td style={{ ...cell, ...dim, whiteSpace: 'nowrap' }}>{S.name[x.key]}</td>
                  <td style={{ ...cell, ...mono, textAlign: 'right', whiteSpace: 'nowrap' }}>{x.bytes} B</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {x.bits
                      ? x.bits.map((b) => (
                        <div key={b.key}><span style={dim}>{S.bit[b.key]}</span> <span style={mono}>{b.value}</span></div>
                      ))
                      : fieldValue(x)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div style={{ fontWeight: 600, fontSize: 11.5 }}>{S.ppdu}</div>
      <div style={hintStyle}>{S.ppduHint}</div>
      <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', margin: '2px 0 4px', background: 'var(--panel2)' }}>
        {d.ppdu.map((p, i) => (
          <div
            key={i}
            title={`${S.segment[p.key]} · ${(p.durNs / 1000).toFixed(1)} µs`}
            style={{ width: `${(100 * p.durNs) / total}%`, minWidth: p.durNs > 0 ? 2 : 0, background: SEG_COLOR[p.key], opacity: 0.85 }}
          />
        ))}
      </div>
      {d.ppdu.map((p, i) => (
        <div key={i} style={{ ...valueRow, fontSize: 11 }}>
          <span><span style={{ color: SEG_COLOR[p.key] }}>■</span> {S.segment[p.key]}</span>
          <span style={dim}>
            {p.symbols !== undefined && p.symNs !== undefined ? `${S.symbols(p.symbols, p.symNs / 1000)} = ` : ''}
            {(p.durNs / 1000).toFixed(1)} µs
          </span>
        </div>
      ))}
    </div>
  )
}
