/**
 * Editor fields of the scenario's ranging session (standard §10.32.2): the block and slot
 * structure every tag shares, the TWR method, the channel and the two noise
 * knobs. The shape of a session is fixed before it starts, so the numbers here
 * decide the whole schedule — the section prints the resulting round plan, and
 * the schema's own complaint when the numbers do not add up.
 */
import { clampField } from '../../editor/planOps'
import type { UwbSessionCfg } from '../../model/scenario'
import { roundPlan } from '../session'
import { rstuNs } from '../phy'
import { useStrings } from '../../ui/i18n'

const label: React.CSSProperties = { display: 'block', marginBottom: 4 }

const ms = (rstu: number): string => (rstuNs(rstu) / 1e6).toFixed(rstu < 3000 ? 3 : 1)

/** `issue` is what `uwbSessionIssue` says about the scenario this session belongs to. */
export function UwbSessionFields(
  { session, anchors, tags, issue, onChange }:
  { session: UwbSessionCfg; anchors: number; tags: number; issue: string | null; onChange: (patch: Partial<UwbSessionCfg>) => void },
) {
  const E = useStrings().editor
  const plan = roundPlan(session, Math.max(1, anchors))
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {E.uwbSession}
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{E.uwbCounts(anchors, tags)}</span>
      </div>
      <label style={label} title={E.uwbMethodHint}>
        {E.uwbMethod}{' '}
        <select value={session.method} onChange={(e) => onChange({ method: e.target.value as UwbSessionCfg['method'] })}>
          <option value="ss">{E.uwbMethods.ss}</option>
          <option value="ds">{E.uwbMethods.ds}</option>
        </select>
      </label>
      <label style={label} title={E.uwbBlockHint}>
        {E.uwbBlock}{' '}
        <input type="number" min={3} step={3} value={session.blockRstu} style={{ width: 74 }}
          onChange={(e) => onChange({ blockRstu: to3(clampField(e.target.value, 3, 6_000_000, true)) })} />
        <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 4 }}>RSTU · {ms(session.blockRstu)} ms</span>
      </label>
      <label style={label} title={E.uwbSlotHint}>
        {E.uwbSlot}{' '}
        <input type="number" min={300} step={3} value={session.slotRstu} style={{ width: 74 }}
          onChange={(e) => onChange({ slotRstu: to3(clampField(e.target.value, 300, 60_000, true)) })} />
        <span style={{ color: 'var(--dim)', fontSize: 11, marginLeft: 4 }}>RSTU · {ms(session.slotRstu)} ms</span>
      </label>
      <label style={label} title={E.uwbChannelHint}>
        {E.uwbChannel}{' '}
        <select value={session.channel} onChange={(e) => onChange({ channel: Number(e.target.value) as UwbSessionCfg['channel'] })}>
          <option value={5}>5 · 6489.6 MHz</option>
          <option value={9}>9 · 7987.2 MHz</option>
        </select>
      </label>
      <label style={label} title={E.uwbTsNoiseHint}>
        {E.uwbTsNoise}{' '}
        <input type="number" min={0} max={10_000} step={10} value={session.tsNoisePs} style={{ width: 62 }}
          onChange={(e) => onChange({ tsNoisePs: clampField(e.target.value, 0, 10_000) })} /> ps
      </label>
      <label style={label} title={E.uwbCfoNoiseHint}>
        {E.uwbCfoNoise}{' '}
        <input type="number" min={0} max={20} step={0.1} value={session.cfoNoisePpm} style={{ width: 62 }}
          onChange={(e) => onChange({ cfoNoisePpm: clampField(e.target.value, 0, 20) })} /> ppm
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: 'pointer' }} title={E.uwbNlosHint}>
        <input type="checkbox" checked={session.nlos} onChange={(e) => onChange({ nlos: e.target.checked })} />
        {E.uwbNlos}
      </label>
      <div style={{ color: 'var(--dim)', fontSize: 11 }}>{E.uwbPlan(plan.slots, plan.roundsPerBlock)}</div>
      {issue && <div style={{ color: '#f87171', fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{issue}</div>}
    </div>
  )
}

/** A block and a slot are both counted in whole 3-RSTU units (standard §10.32.2). */
function to3(rstu: number): number {
  return Math.max(3, Math.round(rstu / 3) * 3)
}
