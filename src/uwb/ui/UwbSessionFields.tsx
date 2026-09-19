/**
 * Editor fields of the scenario's ranging session (standard §10.32.2): the block and slot
 * structure every tag shares, the TWR method, the channel and the two noise
 * knobs. The shape of a session is fixed before it starts, so the numbers here
 * decide the whole schedule — the section prints the resulting round plan, and
 * the schema's own complaint when the numbers do not add up.
 */
import { useState } from 'react'
import type { UwbMode, UwbSessionCfg } from '../../model/scenario'
import { roundPlan } from '../session'
import { rstuNs } from '../phy'
import { useStrings } from '../../ui/i18n'
import { clampField } from '../../ui/inputs'

const label: React.CSSProperties = { display: 'block', marginBottom: 4 }
const suffix: React.CSSProperties = { color: 'var(--dim)', fontSize: 11, marginLeft: 4 }

const ms = (rstu: number): string => (rstuNs(rstu) / 1e6).toFixed(rstu < 3000 ? 3 : 1)

/**
 * What picking a ranging mode changes. A one-way round is laid out in advance for every anchor,
 * so the schema takes it in a time-scheduled session only: switching to one takes the schedule
 * with it, exactly as picking DS-TWR does. Leaving the pair inconsistent would hand the user a
 * plan the schema rejects, with the fix two fields away.
 *
 * What it deliberately does *not* touch is the anchor count — four are needed for three time
 * differences, and that is a fact about the plan the session cannot fix on its own, so it stays
 * with `uwbSessionIssue` where the user can read why.
 */
export function uwbModePatch(mode: UwbMode): Partial<UwbSessionCfg> {
  return mode === 'twr' ? { mode } : { mode, schedule: 'time' }
}

/**
 * `issue` is what `uwbSessionIssue` says about the scenario this session belongs
 * to, and `onRemove` drops the session — offered because an imported file may
 * carry one no device takes part in, and only then is removing it legal.
 */
export function UwbSessionFields(
  { session, anchors, tags, issue, onChange, onRemove }:
  {
    session: UwbSessionCfg; anchors: number; tags: number; issue: string | null
    onChange: (patch: Partial<UwbSessionCfg>) => void; onRemove: () => void
  },
) {
  const E = useStrings().editor
  // With no anchor there is no round to plan; printing one built from a made-up
  // anchor would contradict the issue line right beside it.
  const plan = anchors > 0 ? roundPlan(session, anchors) : null
  const orphan = anchors === 0 && tags === 0
  // A contention round has only the response to place, so the schema allows it with SS-TWR
  // alone; the window and the retry budget mean nothing until it is actually chosen.
  const ssOnly = session.method === 'ss'
  const contending = ssOnly && session.schedule === 'contention'
  // Which one-way mode is on, or null for two-way ranging: the clock correction belongs to the
  // listening tag of DL-TDoA and the sync error to the shared timebase of UL-TDoA, so each field
  // is live in exactly one mode and says why it is not in the others.
  const oneWay = session.mode === 'twr' ? null : session.mode
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {E.uwbSession}
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{E.uwbCounts(anchors, tags)}</span>
      </div>
      <label style={label} title={E.uwbMethodHint}>
        {E.uwbMethod}{' '}
        <select value={session.method} onChange={(e) => {
          const method = e.target.value as UwbSessionCfg['method']
          // Only SS-TWR has a contention schedule, so picking DS-TWR takes the session back to
          // the time schedule with it. Leaving the pair inconsistent would hand the user a plan
          // the schema rejects, with the fix two fields away.
          onChange(method === 'ds' ? { method, schedule: 'time' } : { method })
        }}>
          <option value="ss">{E.uwbMethods.ss}</option>
          <option value="ds">{E.uwbMethods.ds}</option>
        </select>
      </label>
      <label style={label} title={E.uwbModeHint}>
        {E.uwbMode}{' '}
        <select value={session.mode} onChange={(e) => onChange(uwbModePatch(e.target.value as UwbMode))}>
          <option value="twr">{E.uwbModes.twr}</option>
          <option value="dl-tdoa">{E.uwbModes['dl-tdoa']}</option>
          <option value="ul-tdoa">{E.uwbModes['ul-tdoa']}</option>
        </select>
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: oneWay === 'dl-tdoa' ? 'pointer' : 'default' }}
        title={oneWay === 'dl-tdoa' ? E.uwbClockCorrectionHint : E.uwbDlOnly}>
        <input type="checkbox" checked={session.tdoaClockCorrection} disabled={oneWay !== 'dl-tdoa'}
          onChange={(e) => onChange({ tdoaClockCorrection: e.target.checked })} />
        {E.uwbClockCorrection}
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: oneWay === null ? 'pointer' : 'default' }}
        title={oneWay === null ? E.uwbAoaHint : E.uwbAoaTwrOnly}>
        <input type="checkbox" checked={session.aoa} disabled={oneWay !== null}
          onChange={(e) => onChange({ aoa: e.target.checked })} />
        {E.uwbAoa}
      </label>
      <label style={label} title={oneWay === 'ul-tdoa' ? E.uwbSyncErrorHint : E.uwbUlOnly}>
        {E.uwbSyncError}{' '}
        <input type="number" min={0} max={10} step={0.1} value={session.syncErrorNs} style={{ width: 62 }}
          disabled={oneWay !== 'ul-tdoa'}
          onChange={(e) => onChange({ syncErrorNs: clampField(e.target.value, 0, 10) })} /> ns
      </label>
      <label style={label} title={!ssOnly ? E.uwbSsOnly : oneWay !== null ? E.uwbTwrOnly : E.uwbScheduleHint}>
        {E.uwbSchedule}{' '}
        <select value={session.schedule} disabled={!ssOnly || oneWay !== null}
          onChange={(e) => onChange({ schedule: e.target.value as UwbSessionCfg['schedule'] })}>
          <option value="time">{E.uwbSchedules.time}</option>
          <option value="contention">{E.uwbSchedules.contention}</option>
        </select>
      </label>
      <label style={label} title={contending ? E.uwbContentionSlotsHint : E.uwbSsOnly}>
        {E.uwbContentionSlots}{' '}
        <input type="number" min={2} max={32} step={1} value={session.contentionSlots} style={{ width: 62 }}
          disabled={!contending}
          onChange={(e) => onChange({ contentionSlots: clampField(e.target.value, 2, 32, true) })} />
      </label>
      <label style={label} title={contending ? E.uwbMaxAttemptsHint : E.uwbSsOnly}>
        {E.uwbMaxAttempts}{' '}
        <input type="number" min={1} max={10} step={1} value={session.maxAttempts} style={{ width: 62 }}
          disabled={!contending}
          onChange={(e) => onChange({ maxAttempts: clampField(e.target.value, 1, 10, true) })} />
      </label>
      <label style={label} title={E.uwbBlockHint}>
        {E.uwbBlock}{' '}
        <RstuInput value={session.blockRstu} lo={3} hi={6_000_000} onCommit={(blockRstu) => onChange({ blockRstu })} />
        <span style={suffix}>RSTU · {ms(session.blockRstu)} ms</span>
      </label>
      <label style={label} title={E.uwbSlotHint}>
        {E.uwbSlot}{' '}
        <RstuInput value={session.slotRstu} lo={300} hi={60_000} onCommit={(slotRstu) => onChange({ slotRstu })} />
        <span style={suffix}>RSTU · {ms(session.slotRstu)} ms</span>
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
      {plan && <div style={{ color: 'var(--dim)', fontSize: 11 }}>{E.uwbPlan(plan.slots, plan.roundsPerBlock)}</div>}
      {orphan && <div style={{ color: 'var(--dim)', fontSize: 11 }}>{E.uwbNoNodes}</div>}
      {issue && <div style={{ color: '#f87171', fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{issue}</div>}
      <button style={{ marginTop: 5 }} disabled={!orphan} title={orphan ? E.uwbRemoveSessionHint : E.uwbSessionInUse}
        onClick={onRemove}>{E.uwbRemoveSession}</button>
    </div>
  )
}

/**
 * A ranging-time field in RSTU. It holds the typed text while the field has
 * focus and only clamps on blur or Enter: clamping per keystroke turns clearing
 * a six-digit block into an immediate commit of the lower bound, and every
 * further digit is then re-rounded to a multiple of 3 under the cursor.
 */
function RstuInput({ value, lo, hi, onCommit }: { value: number; lo: number; hi: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input type="number" min={lo} max={hi} step={3} style={{ width: 74 }}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(to3(clampField(draft, lo, hi, true)))
        setDraft(null)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
  )
}

/** A block and a slot are both counted in whole 3-RSTU units (standard §10.32.2). */
function to3(rstu: number): number {
  return Math.max(3, Math.round(rstu / 3) * 3)
}
