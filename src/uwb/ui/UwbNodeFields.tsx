/**
 * Editor fields of one UWB ranging device. A ranging radio runs no Wi-Fi at
 * all — no generation, no band, no traffic streams — so the editor hands it
 * this section instead of the station panel, and it carries only what the
 * ranging engine reads: where the device is, how far its clock drifts, and
 * how loudly it transmits.
 */
import { clampField } from '../../editor/planOps'
import type { NodeCfg } from '../../model/scenario'
import { useStrings } from '../../ui/i18n'

const label: React.CSSProperties = { display: 'block', marginBottom: 4 }
const dim: React.CSSProperties = { color: 'var(--dim)', marginBottom: 4 }

export function UwbNodeFields({ node, onChange }: { node: NodeCfg; onChange: (patch: Partial<NodeCfg>) => void }) {
  const E = useStrings().editor
  const role = node.uwb?.role ?? 'tag'
  const ppm = node.uwb?.ppm
  return (
    <div style={{ marginTop: 4 }}>
      <div style={dim}>{E.uwbNode}</div>
      <div style={{ ...label, fontSize: 11.5 }}>
        {E.uwbRole}: <b style={{ color: '#d5dae3' }}>{E.uwbRoles[role]}</b>
      </div>
      <label style={label}>
        {E.height}{' '}
        <input type="number" min={0.1} max={3} step={0.1} value={node.pos.z} style={{ width: 56 }}
          onChange={(e) => onChange({ pos: { ...node.pos, z: clampField(e.target.value, 0.1, 3) } })} /> m
      </label>
      <label style={label} title={E.uwbPpmHint}>
        {E.uwbPpm}{' '}
        <input type="number" min={-100} max={100} step={1} value={ppm ?? ''} style={{ width: 56 }}
          onChange={(e) => onChange({
            // merge, so a field added to UwbNodeCfg later is not dropped by a ppm edit
            uwb: { ...node.uwb, role, ppm: e.target.value.trim() === '' ? undefined : clampField(e.target.value, -100, 100) },
          })} /> ppm
        <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 6 }}>
          {ppm === undefined ? E.uwbPpmDrawn : E.uwbPpmRange}
        </span>
      </label>
      <label style={label}>
        {E.txPower}{' '}
        <input type="number" min={-30} max={0} step={1} value={node.txPowerDbm} style={{ width: 56 }}
          onChange={(e) => onChange({ txPowerDbm: clampField(e.target.value, -30, 0) })} /> dBm
      </label>
    </div>
  )
}
