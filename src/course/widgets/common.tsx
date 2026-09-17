/** Shared look and param parsing for lesson widgets. */
import type { PhyMode } from '../../engine/phy'

export const MODE_OPTIONS: PhyMode[] = ['nonht', 'vht', 'he', 'eht']

export const box: React.CSSProperties = {
  margin: '6px 0',
  padding: '8px 10px',
  fontSize: 11.5,
  color: '#c3c9d4',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
}
export const ctlRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0', flexWrap: 'wrap' }
export const ctlLabel: React.CSSProperties = { width: 92, color: 'var(--dim)' }

export function num(params: Record<string, number | string> | undefined, key: string, dflt: number): number {
  const v = params?.[key]
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : dflt
}

export function str(params: Record<string, number | string> | undefined, key: string, dflt: string): string {
  const v = params?.[key]
  return v === undefined ? dflt : String(v)
}

export function stat(label: string, value: string, note?: string) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--dim)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>
        <b style={{ color: '#e6eaf2' }}>{value}</b>
        {note && <div style={{ color: 'var(--dim)', fontSize: 10.5 }}>{note}</div>}
      </span>
    </div>
  )
}
