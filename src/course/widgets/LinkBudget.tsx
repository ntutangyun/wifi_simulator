/**
 * Link budget widget: TX power minus path loss and walls gives the RSSI; the
 * noise floor of the chosen width sets the SNR, and the engine's own rate
 * ceiling picks the highest usable MCS.
 */
import { useState } from 'react'
import { RATE_MARGIN_DB, type PhyMode } from '../../engine/phy'
import type { Material } from '../../model/scenario'
import { useStrings } from '../../ui/i18n'
import { linkBudget, widthsFor } from '../widgetModel'
import { box, ctlLabel, ctlRow, num, str, stat, MODE_OPTIONS } from './common'

const MATERIALS: Material[] = ['drywall', 'brick', 'glass']

export function LinkBudget({ params }: { params?: Record<string, number | string> }) {
  const W = useStrings().widgets
  const [txDbm, setTx] = useState(num(params, 'txDbm', 20))
  const [distanceM, setDist] = useState(num(params, 'distanceM', 8))
  const [walls, setWalls] = useState<Record<Material, number>>({
    drywall: num(params, 'drywall', 1), brick: num(params, 'brick', 0), glass: num(params, 'glass', 0),
  })
  const [mode, setMode] = useState<PhyMode>(str(params, 'mode', 'he') as PhyMode)
  const [widthMhz, setWidth] = useState(num(params, 'widthMhz', 20))
  const band = str(params, 'band', '5g') === '6g' ? '6g' : '5g'

  const widths = widthsFor(mode)
  const width = widths.includes(widthMhz as never) ? widthMhz : widths[widths.length - 1]
  const wallList = MATERIALS.flatMap((m) => Array<Material>(walls[m]).fill(m))
  const lb = linkBudget({ txDbm, distanceM, walls: wallList, widthMhz: width, mode, band })

  // Waterfall geometry (dBm → y).
  const top = Math.ceil((Math.max(txDbm, 0) + 5) / 10) * 10
  const bottom = Math.floor((Math.min(lb.rssiDbm, lb.noiseDbm) - 8) / 10) * 10
  const H = 150
  const X0 = 34
  const y = (dbm: number) => ((top - dbm) / (top - bottom)) * H + 6
  const steps: { label: string; from: number; to: number; color: string }[] = [
    { label: 'TX', from: bottom, to: txDbm, color: '#60a5fa' },
    { label: W.pathLoss, from: txDbm, to: txDbm - lb.pathLossDb, color: '#f87171' },
  ]
  let level = txDbm - lb.pathLossDb
  if (lb.wallLossDb > 0) {
    steps.push({ label: W.wallLoss, from: level, to: level - lb.wallLossDb, color: '#fb923c' })
    level -= lb.wallLossDb
  }
  if (lb.bandLossDb > 0) {
    steps.push({ label: '6 GHz', from: level, to: level - lb.bandLossDb, color: '#fbbf24' })
  }
  steps.push({ label: 'RSSI', from: bottom, to: lb.rssiDbm, color: '#22c55e' })
  const colW = (300 - X0 - 30) / steps.length
  const ticks: number[] = []
  for (let v = top; v >= bottom; v -= 20) ticks.push(v)

  return (
    <div style={box}>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.txPower}</span>
        <input type="range" min={0} max={30} step={1} value={txDbm} onChange={(e) => setTx(+e.target.value)} style={{ flex: 1 }} />
        <span style={{ width: 52, textAlign: 'right' }}>{txDbm} dBm</span>
      </div>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.distance}</span>
        <input type="range" min={1} max={40} step={0.5} value={distanceM} onChange={(e) => setDist(+e.target.value)} style={{ flex: 1 }} />
        <span style={{ width: 52, textAlign: 'right' }}>{distanceM} m</span>
      </div>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.walls}</span>
        {MATERIALS.map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {W.wallName[m]}
            <select value={walls[m]} onChange={(e) => setWalls({ ...walls, [m]: +e.target.value })}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.mode}</span>
        {MODE_OPTIONS.map((m) => (
          <button key={m} className={m === mode ? 'active' : ''} style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => setMode(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={ctlRow}>
        <span style={ctlLabel}>{W.width}</span>
        {[20, 40, 80, 160, 320].map((w) => (
          <button
            key={w}
            disabled={!widths.includes(w as never)}
            className={w === width ? 'active' : ''}
            style={{ padding: '1px 6px', fontSize: 11 }}
            onClick={() => setWidth(w)}
          >
            {w}
          </button>
        ))}
        <span style={{ color: 'var(--dim)' }}>MHz</span>
      </div>

      <svg viewBox={`0 0 300 ${H + 26}`} style={{ width: '100%', display: 'block', margin: '6px 0 2px' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={X0} x2={300} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" />
            <text x={X0 - 4} y={y(v) + 3} fontSize={8} fill="#8a93a3" textAnchor="end">{v}</text>
          </g>
        ))}
        {steps.map((s, i) => {
          const x = X0 + 4 + i * colW
          const y1 = y(Math.max(s.from, s.to))
          const y2 = y(Math.min(s.from, s.to))
          const text = i === 0 || i === steps.length - 1 ? `${s.to.toFixed(1)}` : `−${(s.from - s.to).toFixed(1)}`
          return (
            <g key={i}>
              <rect x={x} y={y1} width={colW - 8} height={Math.max(1, y2 - y1)} fill={s.color} opacity={0.8} rx={1.5} />
              <text x={x + (colW - 8) / 2} y={y1 - 2} fontSize={8} fill="#e6eaf2" textAnchor="middle">{text}</text>
              <text x={x + (colW - 8) / 2} y={H + 20} fontSize={8} fill="#8a93a3" textAnchor="middle">{s.label}</text>
            </g>
          )
        })}
        <line x1={X0} x2={300} y1={y(lb.noiseDbm)} y2={y(lb.noiseDbm)} stroke="#e879f9" strokeDasharray="4 3" />
        <text x={X0 + 2} y={y(lb.noiseDbm) + 9} fontSize={8} fill="#e879f9">{W.noise} {lb.noiseDbm.toFixed(1)}</text>
        {lb.rssiDbm > lb.noiseDbm && (
          <g>
            <line x1={292} x2={292} y1={y(lb.rssiDbm)} y2={y(lb.noiseDbm)} stroke="#e6eaf2" />
            <text x={289} y={(y(lb.rssiDbm) + y(lb.noiseDbm)) / 2 + 3} fontSize={8} fill="#e6eaf2" textAnchor="end">
              SNR {lb.snrDb.toFixed(1)}
            </text>
          </g>
        )}
      </svg>

      {stat(W.rssi, `${lb.rssiDbm.toFixed(1)} dBm`)}
      {stat(W.noise, `${lb.noiseDbm.toFixed(1)} dBm`)}
      {stat(W.snr, `${lb.snrDb.toFixed(1)} dB`)}
      {stat(
        W.bestMcs,
        lb.usable ? `MCS ${lb.mcs} · ${lb.mbps.toFixed(1)} Mbps` : '—',
        lb.usable ? `${W.required} ${(lb.reqSinrDb + RATE_MARGIN_DB).toFixed(1)} dB (${W.margin(RATE_MARGIN_DB)})` : undefined,
      )}
    </div>
  )
}
