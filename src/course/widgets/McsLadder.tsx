/**
 * MCS ladder widget: the required SINR of every MCS of one PHY mode, with an
 * SNR slider that highlights the rows a link at that SNR can use (requirement
 * plus the engine's rate margin).
 */
import { useState } from 'react'
import { RATE_MARGIN_DB, type PhyMode } from '../../engine/phy'
import { useStrings } from '../../ui/i18n'
import { mcsLadder } from '../widgetModel'
import { box, ctlLabel, ctlRow, MODE_OPTIONS, num, str } from './common'

const cell: React.CSSProperties = { padding: '2px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'right' }

export function McsLadder({ params }: { params?: Record<string, number | string> }) {
  const W = useStrings().widgets
  const [mode, setMode] = useState<PhyMode>(str(params, 'mode', 'he') as PhyMode)
  const [snr, setSnr] = useState(num(params, 'snrDb', 25))
  const rows = mcsLadder(mode)
  const usable = rows.filter((r) => snr >= r.reqSinrDb + RATE_MARGIN_DB)
  const best = usable.length ? usable[usable.length - 1].mcs : -1

  return (
    <div style={box}>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.mode}</span>
        {MODE_OPTIONS.map((m) => (
          <button key={m} className={m === mode ? 'active' : ''} style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => setMode(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.ladderSnr}</span>
        <input type="range" min={-5} max={50} step={0.5} value={snr} onChange={(e) => setSnr(+e.target.value)} style={{ flex: 1 }} />
        <span style={{ width: 48, textAlign: 'right' }}>{snr} dB</span>
      </div>
      <div style={{ color: 'var(--dim)', margin: '2px 0 4px' }}>{W.usable(usable.length)} · {W.margin(RATE_MARGIN_DB)}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr style={{ color: 'var(--dim)' }}>
            <td style={{ ...cell, textAlign: 'left' }}>{W.mcs}</td>
            <td style={cell}>{W.rate}</td>
            <td style={cell}>{W.reqSinr}</td>
            <td style={cell}>{W.sens}</td>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ok = snr >= r.reqSinrDb + RATE_MARGIN_DB
            return (
              <tr
                key={r.mcs}
                style={{
                  color: ok ? '#e6eaf2' : '#6b7280',
                  background: r.mcs === best ? 'rgba(34,197,94,0.18)' : ok ? 'rgba(34,197,94,0.06)' : undefined,
                }}
              >
                <td style={{ ...cell, textAlign: 'left' }}>{r.mcs}</td>
                <td style={cell}>{r.mbps}</td>
                <td style={cell}>{r.reqSinrDb.toFixed(1)} dB</td>
                <td style={cell}>{r.sensDbm} dBm</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
