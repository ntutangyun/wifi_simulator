/**
 * Editor fields of the scenario's ranging session (standard §10.32.2): the block and slot
 * structure every tag shares, the TWR method, the channel and the two noise
 * knobs. The shape of a session is fixed before it starts, so the numbers here
 * decide the whole schedule — the section prints the resulting round plan, and
 * the schema's own complaint when the numbers do not add up.
 */
import { useState } from 'react'
import type { NbLbt, NbReportMode, UwbMmsCfg, UwbMode, UwbSessionCfg } from '../../model/scenario'
import { roundPlan } from '../session'
import { rstuNs } from '../phy'
import {
  MMS_SETS, N_MSR_SET, RIF_COUNT_SET, RSF_COUNT_SET, STS_LEN_SET,
  mmsFragmentDbm, mmsLayout, mmsSet, rsfNs, type MmsPhy, type MmsSetId,
} from '../mms'
// The allow-list parser lives beside the editor's other scenario-field parsers (the 6 GHz centre
// channel is its sibling) because its rules are the schema's, not the panel's; it is pure and
// pulls in no React, so reaching for it from here costs this panel nothing.
import { parseNbChannels } from '../../editor/planOps'
import { useStrings } from '../../ui/i18n'
import { clampField } from '../../ui/inputs'

const label: React.CSSProperties = { display: 'block', marginBottom: 4 }
const suffix: React.CSSProperties = { color: 'var(--dim)', fontSize: 11, marginLeft: 4 }
const note: React.CSSProperties = { color: 'var(--dim)', fontSize: 11 }
/** How this section shows a rule the plan breaks — the schema's own complaint, in red. */
const issueStyle: React.CSSProperties = { color: '#f87171', fontSize: 11, marginTop: 3, lineHeight: 1.45 }

/** Z, the idle milliseconds between the last RSF and the first RIF. 4ab draft 15-23/0100r2 §2.3.2 */
const GAP_MS_SET = [1, 2] as const

const ms = (rstu: number): string => (rstuNs(rstu) / 1e6).toFixed(rstu < 3000 ? 3 : 1)

/**
 * What picking a ranging mode changes. A one-way round is laid out in advance for every anchor,
 * so the schema takes it in a time-scheduled session only: switching to one takes the schedule
 * with it, exactly as picking DS-TWR does. Angle of arrival goes the same way — it is measured
 * on a frame the tag sends, which a one-way round does not have, and the schema rejects the pair.
 * Leaving either inconsistent would hand the user a plan the schema rejects, with the fix two
 * fields away. MMS takes the same two: its rounds are laid out pair by pair in advance, and its
 * ranging signal is a train of sequences with no frame to measure a bearing on.
 *
 * MMS takes two more, and for the same reason — a mode whose defaults are not its own is a mode
 * that reads wrong the moment it is picked. It ranges **single-sided**: a train hands the
 * receiver a millisecond-long ruler to measure the transmitter's clock with, which is exactly
 * what the second half of a double-sided exchange is for, so there is nothing for DS-TWR to add
 * (spec "The clock ratio from the train"). And its slot is the draft's own **600 RSTU** (0.5 ms,
 * 4ab draft 15-22/0381r5 Table 1.2.3.2 — the schema also requires a multiple of 300 RSTU there),
 * which is what makes the editor's MMS round the 28-slot, 14 ms round the Guide describes rather
 * than a 56 ms one. `DEFAULT_UWB_SESSION` keeps its own 2400 RSTU: this is what *picking the
 * mode* means, not what a session is.
 *
 * What it deliberately does *not* touch is the anchor count — four are needed for three time
 * differences, and that is a fact about the plan the session cannot fix on its own, so it stays
 * with `uwbSessionIssue` where the user can read why.
 */
export function uwbModePatch(mode: UwbMode): Partial<UwbSessionCfg> {
  if (mode === 'twr') return { mode }
  if (mode === 'mms') return { mode, schedule: 'time', aoa: false, method: 'ss', slotRstu: 600 }
  return { mode, schedule: 'time', aoa: false }
}

/**
 * What picking a TWR method changes. Only SS-TWR has a contention schedule — DS-TWR's report
 * phase would need a second contention window this simulator does not model — so picking DS-TWR
 * takes the session back to the time schedule with it, for the same reason `uwbModePatch` does.
 */
export function uwbMethodPatch(method: UwbSessionCfg['method']): Partial<UwbSessionCfg> {
  return method === 'ds' ? { method, schedule: 'time' } : { method }
}

/** The five PHY fields a mandatory parameter set fixes — what the set select compares and writes.
 * Z is deliberately not one of them: the sets are PHY shapes, and the draft's cycle carries its
 * own idle millisecond. 4ab draft 15-23/0502r3 (proposed 16.2.11.4) */
type MmsSetFields = Pick<MmsPhy, 'rsfs' | 'rifs' | 'nMsr' | 'gap' | 'stsLen'>

/**
 * Which mandatory set the current fragment parameters are, or null for "custom".
 *
 * The select stores nothing of its own: a stored id and five editable fields would be two
 * versions of the same fact, and editing one field would leave the select claiming a set the
 * session no longer is. Deriving it every render makes that state unrepresentable.
 */
export function mmsSetIdOf(phy: MmsPhy): MmsSetId | null {
  for (const id of Object.keys(MMS_SETS) as MmsSetId[]) {
    const s = MMS_SETS[id]
    if (s.rsfs === phy.rsfs && s.rifs === phy.rifs && s.nMsr === phy.nMsr
      && s.gap === phy.gap && s.stsLen === phy.stsLen) return id
  }
  return null
}

/** What picking a mandatory set writes: its five PHY fields, plus the one idle millisecond the
 * sets are specified against (Z = 1). The narrowband settings are the user's and stay put. */
export function mmsSetPatch(id: MmsSetId): MmsSetFields & Pick<MmsPhy, 'gapMs'> {
  const { rsfs, rifs, nMsr, gap, stsLen } = mmsSet(id)
  return { rsfs, rifs, nMsr, gap, stsLen, gapMs: 1 }
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
  // The MMS half of the session, or null outside MMS mode: every field below it reads only
  // `session.mms`, and a two-way or one-way session carries those settings untouched.
  const mms = session.mode === 'mms' ? session.mms : null
  const patchMms = (patch: Partial<UwbMmsCfg>): void => onChange({ mms: { ...session.mms, ...patch } })
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {E.uwbSession}
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{E.uwbCounts(anchors, tags)}</span>
      </div>
      <label style={label} title={mms ? E.uwbMmsSsOnly : E.uwbMethodHint}>
        {E.uwbMethod}{' '}
        <select value={session.method} disabled={mms !== null}
          onChange={(e) => onChange(uwbMethodPatch(e.target.value as UwbSessionCfg['method']))}>
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
          <option value="mms">{E.uwbModes.mms}</option>
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
      <label style={label} title={contending ? E.uwbContentionSlotsHint : ssOnly ? E.uwbContentionOnly : E.uwbSsOnly}>
        {E.uwbContentionSlots}{' '}
        <input type="number" min={2} max={32} step={1} value={session.contentionSlots} style={{ width: 62 }}
          disabled={!contending}
          onChange={(e) => onChange({ contentionSlots: clampField(e.target.value, 2, 32, true) })} />
      </label>
      <label style={label} title={contending ? E.uwbMaxAttemptsHint : ssOnly ? E.uwbContentionOnly : E.uwbSsOnly}>
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
      {mms && <MmsFields mms={mms} slotRstu={session.slotRstu} onChange={patchMms} />}
      {plan && <div style={note}>{E.uwbPlan(plan.slots, plan.roundsPerBlock)}</div>}
      {orphan && <div style={note}>{E.uwbNoNodes}</div>}
      {issue && <div style={issueStyle}>{issue}</div>}
      <button style={{ marginTop: 5 }} disabled={!orphan} title={orphan ? E.uwbRemoveSessionHint : E.uwbSessionInUse}
        onClick={onRemove}>{E.uwbRemoveSession}</button>
    </div>
  )
}

/**
 * The `mode: 'mms'` section: the shape of one device's fragment train and the narrowband radio
 * its control plane runs on (IEEE P802.15.4ab draft).
 *
 * Everything but the MMRS gap is a select over the set of legal values `src/uwb/mms.ts` exports,
 * so a value the schema's literal unions reject cannot be typed in the first place; the gap is a
 * plain 0…64 integer and is clamped. The read-only line at the bottom is the consequence of the
 * fields above it — what the fragment actually is, how loud it may be, and how long the pair
 * round it builds runs — because none of that is visible in the parameters themselves.
 */
function MmsFields(
  { mms, slotRstu, onChange }:
  { mms: UwbMmsCfg; slotRstu: number; onChange: (patch: Partial<UwbMmsCfg>) => void },
) {
  const E = useStrings().editor
  const setId = mmsSetIdOf(mms)
  // The RSF the fragment parameters describe, whether or not this train carries one: its length
  // is what the millisecond's energy is spread over, and so what sets the fragment's power.
  const fragNs = rsfNs(mms.nMsr, mms.gap)
  const layout = mmsLayout(mms)
  return (
    <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--dim)', marginBottom: 4 }} title={E.uwbMmsHint}>{E.uwbMms}</div>
      <label style={label} title={E.uwbMmsSetHint}>
        {E.uwbMmsSet}{' '}
        <select value={setId ?? 'custom'}
          onChange={(e) => {
            // "custom" is derived, never chosen: picking it would have no fields to write.
            if (e.target.value !== 'custom') onChange(mmsSetPatch(e.target.value as MmsSetId))
          }}>
          <option value="custom">{E.uwbMmsCustom}</option>
          {(Object.keys(MMS_SETS) as MmsSetId[]).map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <label style={label} title={E.uwbRsfsHint}>
        {E.uwbRsfs}{' '}
        <NumSelect value={mms.rsfs} options={RSF_COUNT_SET} onPick={(rsfs) => onChange({ rsfs })} />
      </label>
      <label style={label} title={E.uwbRifsHint}>
        {E.uwbRifs}{' '}
        <NumSelect value={mms.rifs} options={RIF_COUNT_SET} onPick={(rifs) => onChange({ rifs })} />
      </label>
      <label style={label} title={E.uwbNMsrHint}>
        {E.uwbNMsr}{' '}
        <NumSelect value={mms.nMsr} options={N_MSR_SET} onPick={(nMsr) => onChange({ nMsr })} />
      </label>
      <label style={label} title={E.uwbGapHint}>
        {E.uwbGap}{' '}
        <input type="number" min={0} max={64} step={1} value={mms.gap} style={{ width: 62 }}
          onChange={(e) => onChange({ gap: clampField(e.target.value, 0, 64, true) })} />
      </label>
      <label style={label} title={E.uwbStsLenHint}>
        {E.uwbStsLen}{' '}
        <NumSelect value={mms.stsLen} options={STS_LEN_SET} onPick={(stsLen) => onChange({ stsLen })} />
        <span style={suffix}>× 512 chips</span>
      </label>
      <label style={label} title={E.uwbGapMsHint}>
        {E.uwbGapMs}{' '}
        <NumSelect value={mms.gapMs} options={GAP_MS_SET} onPick={(gapMs) => onChange({ gapMs })} />
      </label>
      <NbChannelsInput value={mms.nbChannels} onCommit={(nbChannels) => onChange({ nbChannels })} />
      <label style={label} title={E.uwbNbLbtHint}>
        {E.uwbNbLbt}{' '}
        <select value={mms.nbLbt} onChange={(e) => onChange({ nbLbt: e.target.value as NbLbt })}>
          <option value="auto">{E.uwbNbLbts.auto}</option>
          <option value="on">{E.uwbNbLbts.on}</option>
          <option value="off">{E.uwbNbLbts.off}</option>
        </select>
      </label>
      <label style={label} title={E.uwbReportHint}>
        {E.uwbReport}{' '}
        <select value={mms.report} onChange={(e) => onChange({ report: e.target.value as NbReportMode })}>
          <option value="responder">{E.uwbReports.responder}</option>
          <option value="initiator">{E.uwbReports.initiator}</option>
          <option value="bi">{E.uwbReports.bi}</option>
        </select>
      </label>
      <div style={note}>
        {E.uwbMmsDerived(
          (fragNs / 1000).toFixed(2),
          mmsFragmentDbm(fragNs).toFixed(2),
          layout.slots,
          ms(layout.slots * slotRstu),
        )}
      </div>
    </div>
  )
}

/** A select over one of `mms.ts`'s sets of legal values: the option list *is* the type, so the
 * editor cannot produce a number the schema's literal union rejects. */
function NumSelect<T extends number>(
  { value, options, onPick }: { value: T; options: readonly T[]; onPick: (v: T) => void },
) {
  return (
    <select value={value} onChange={(e) => onPick(Number(e.target.value) as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

/**
 * The narrowband allow list, typed as comma-separated channel numbers and committed on blur or
 * Enter. A list the schema would refuse is not committed at all: the session keeps the last one
 * that worked and the field says, in the schema's own words, what a list has to be. Committing
 * the bad list instead would hand the user a plan that fails on run, with the fix one field away.
 */
function NbChannelsInput({ value, onCommit }: { value: number[]; onCommit: (v: number[]) => void }) {
  const E = useStrings().editor
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const commit = (): void => {
    if (draft === null) return
    const parsed = parseNbChannels(draft)
    if (parsed === null) {
      setBad(true) // the draft stays on screen: it is what the user has to fix
      return
    }
    setBad(false)
    setDraft(null)
    onCommit(parsed)
  }
  return (
    <div style={label}>
      <label title={E.uwbNbChannelsHint}>
        {E.uwbNbChannels}{' '}
        <input type="text" style={{ width: 132 }} value={draft ?? value.join(', ')}
          onChange={(e) => { setDraft(e.target.value); setBad(false) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </label>
      {bad && <div style={issueStyle}>{E.uwbNbChannelsBad}</div>}
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
