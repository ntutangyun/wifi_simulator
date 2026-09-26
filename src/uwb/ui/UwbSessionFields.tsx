/**
 * Editor fields of the scenario's ranging session (standard §10.32.2): the block and slot
 * structure every tag shares, the TWR method, the channel and the two noise
 * knobs. The shape of a session is fixed before it starts, so the numbers here
 * decide the whole schedule — the section prints the resulting round plan, and
 * the schema's own complaint when the numbers do not add up.
 */
import { useState } from 'react'
import { DEFAULT_UWB_MMS } from '../../model/scenario'
import type { NbLbt, NbReportMode, UwbMmsCfg, UwbMode, UwbSessionCfg } from '../../model/scenario'
import { roundPlan } from '../session'
import { mmsResponders, rstuNs } from '../phy'
import {
  MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_FIXED_REPLY_RSTU_MAX, MMS_FIXED_REPLY_RSTU_MIN,
  MMS_RSF_SFD_N_MSR, MMS_SETS, N_MSR_SET, RIF_COUNT_SET, RSF_COUNT_SET, STS_LEN_SET,
  mmsFragmentDbm, mmsLayout, mmsLongestFragmentNs, mmsSet, mmsSlotsPerMs, rsfNs,
  type MmsPhy, type MmsSetId,
} from '../mms'
import { NB_CHANNELS } from '../nb'
import { useStrings } from '../../ui/i18n'
import { clampField, parseIntList } from '../../ui/inputs'

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

/** The five PHY fields a mandatory parameter set fixes, and the Z every one of them is specified
 * against — together, the whole of what the set select compares and writes.
 * 4ab draft 15-23/0502r3 (proposed 16.2.11.4) */
type MmsSetFields = Pick<MmsPhy, 'rsfs' | 'rifs' | 'nMsr' | 'gap' | 'stsLen' | 'gapMs'>

/**
 * Which mandatory set the current fragment parameters are, or null for "custom".
 *
 * The select stores nothing of its own: a stored id and the editable fields would be two
 * versions of the same fact, and editing one field would leave the select claiming a set the
 * session no longer is. Deriving it every render makes that state unrepresentable — which is
 * why Z is compared too, although every set carries the same Z = 1: a session at Z = 2 is not
 * the set, and a select that said it was would be the one thing this shape rules out.
 */
export function mmsSetIdOf(phy: MmsPhy): MmsSetId | null {
  for (const id of Object.keys(MMS_SETS) as MmsSetId[]) {
    const s = MMS_SETS[id]
    if (s.rsfs === phy.rsfs && s.rifs === phy.rifs && s.nMsr === phy.nMsr
      && s.gap === phy.gap && s.stsLen === phy.stsLen && s.gapMs === phy.gapMs) return id
  }
  return null
}

/** What picking a mandatory set writes: its five PHY fields, plus the one idle millisecond the
 * sets are specified against (Z = 1). The narrowband settings are the user's and stay put. */
export function mmsSetPatch(id: MmsSetId): MmsSetFields {
  const { rsfs, rifs, nMsr, gap, stsLen } = mmsSet(id)
  return { rsfs, rifs, nMsr, gap, stsLen, gapMs: 1 }
}

/**
 * The narrowband allow list as the session's text field takes it: the schema's own rule
 * (`mode: 'mms'`, `path: ['uwb']`, 4ab draft 15-22/0381r5 §1.5.2) is 1…250 entries, each a whole
 * channel number 0…249, no repeats — which is `parseIntList` over the plan `nb.ts` defines.
 */
export function parseNbChannels(raw: string): number[] | null {
  return parseIntList(raw, 0, NB_CHANNELS - 1, NB_CHANNELS)
}

/**
 * The fixed reply time as its field takes it: one whole RSTU count inside the bounds the draft
 * gives macMmsFixedReplyTime (300…612 000 RSTU, `UwbMmsSchema`), or null for anything else —
 * exactly `parseNbChannels`'s contract, and the same strictness, since `parseIntList` capped at
 * one entry *is* "a single whole number in range". A value the schema would refuse never reaches
 * the session; the field keeps the last one that worked and says what it wanted instead.
 *
 * null therefore means "refused" here, never "off". Whether the feature is on at all is the
 * checkbox's business (`fixedReplyRstu === null` in the session), and the two never meet: the
 * field is only asked to parse while the checkbox is ticked.
 */
export function parseFixedReplyRstu(raw: string): number | null {
  const one = parseIntList(raw, MMS_FIXED_REPLY_RSTU_MIN, MMS_FIXED_REPLY_RSTU_MAX, 1)
  return one === null ? null : one[0]
}

/**
 * Every MMS edit goes through here, and comes out carrying whatever the schema's cross-field
 * rules make of it.
 *
 * The draft's five features are legal only beside certain values of the fields around them — a
 * fixed reply time needs the non-interleaved shape, an SFD-carrying RSF needs Config 1 and a
 * fragment length of `MMS_RSF_SFD_N_MSR` — so *taking that value away* is what would leave a plan
 * the schema rejects. Greying out the dependent control stops the user reaching the illegal pair
 * from one side; this stops it from the other, where the control being edited is a legal one and
 * the casualty is somewhere else on the panel. Between them there is no sequence of clicks that
 * builds a session `UwbMmsSchema` refuses, which is what `uwbModePatch` does for the mode.
 *
 * It is written as "what the merged session would be, then what has to give", rather than as one
 * branch per control: a rule of the schema is about a *state*, and checking states is what keeps
 * this in step with `UwbMmsSchema` as the draft moves.
 */
export function mmsFieldPatch(mms: UwbMmsCfg, edit: Partial<UwbMmsCfg>): Partial<UwbMmsCfg> {
  const next = { ...mms, ...edit }
  const out: Partial<UwbMmsCfg> = { ...edit }
  if (next.control === 'uwbd') {
    // Config 1 has no second radio at all: its POLL, RESP and REPORT are SP0 packets on the UWB
    // PHY, so an allow list and a listen-before-talk setting have nothing to act on and the
    // schema refuses to carry them. The two fields are greyed out as well — this is what empties
    // them on the way in.
    if (next.nbChannels.length > 0) out.nbChannels = []
    if (next.nbLbt !== 'off') out.nbLbt = 'off'
  } else {
    // …and Config 2 needs an allow list again (1…250 channels), which nothing can supply but the
    // draft's own default: the fields were held at Config 1's only legal values while it was on,
    // and remembering the user's earlier list would mean storing a second copy of a field that is
    // already in the session — the very thing `mmsSetIdOf` above refuses to do.
    if (mms.control === 'uwbd') {
      out.nbChannels = [...DEFAULT_UWB_MMS.nbChannels]
      out.nbLbt = DEFAULT_UWB_MMS.nbLbt
    }
    // Both of Config 1's own settings go with it: a zero-length control phase changes nothing on
    // a narrowband control plane, and there is no packet SYNC+SFD there for an RSF to carry.
    if (next.uwbdControl !== 'sp0') out.uwbdControl = 'sp0'
    if (next.rsfSfd) out.rsfSfd = false
  }
  // The fragment-length select and the parameter-set select both write N_MSR, and only two of its
  // values may carry an SFD.
  if (next.rsfSfd && !MMS_RSF_SFD_N_MSR.includes(next.nMsr)) out.rsfSfd = false
  if (!next.nonInterleaved) {
    // Interleaved, the two ends put a fragment each into the same millisecond: there is no
    // "finished receiving the packet" to time a reply from, and no "who goes first" to swap.
    if (next.fixedReplyRstu !== null) out.fixedReplyRstu = null
    if (next.reversedOrder) out.reversedOrder = false
  }
  // The fixed reply time is one-to-one (the draft puts it in a One-to-one Response Compact frame)
  // and forward-order (its starting point is the packet the reversed responder has not received
  // yet), so either of those two controls takes it away when it is switched on.
  if (next.fixedReplyRstu !== null && (next.oneToMany || next.reversedOrder)) out.fixedReplyRstu = null
  return out
}

/**
 * Why the UWB-driven control phase select shows what it shows. Same shape as `uwbAoaHintKey`: the
 * key names the control's own description when nothing is stopping it, and the schema's reason
 * when something is — and `mmsDraftLive` below derives the greying from these same functions, so
 * a tooltip and a disabled attribute cannot disagree about which rule is in force.
 */
export function mmsUwbdControlHintKey(mms: UwbMmsCfg): 'uwbUwbdControlHint' | 'uwbUwbdNbaOnly' {
  return mms.control === 'uwbd' ? 'uwbUwbdControlHint' : 'uwbUwbdNbaOnly'
}

/** Why the RSF-with-SFD checkbox is live or not: the control plane first, then the fragment
 * length, because a Config 2 session has no packet SYNC+SFD to drop at any length. */
export function mmsRsfSfdHintKey(mms: UwbMmsCfg): 'uwbRsfSfdHint' | 'uwbRsfSfdUwbdOnly' | 'uwbRsfSfdNMsr' {
  if (mms.control !== 'uwbd') return 'uwbRsfSfdUwbdOnly'
  return MMS_RSF_SFD_N_MSR.includes(mms.nMsr) ? 'uwbRsfSfdHint' : 'uwbRsfSfdNMsr'
}

/** Why the fixed reply time is live or not. Three separate refusals, and saying the wrong one
 * would send the user to the wrong field: the round shape, the round's membership, and the one
 * this simulator refuses for its own consistency (reversed order). */
export function mmsFixedReplyHintKey(
  mms: UwbMmsCfg,
): 'uwbFixedReplyHint' | 'uwbFixedReplyInterleaved' | 'uwbFixedReplyOneToMany' | 'uwbFixedReplyReversed' {
  if (!mms.nonInterleaved) return 'uwbFixedReplyInterleaved'
  if (mms.oneToMany) return 'uwbFixedReplyOneToMany'
  if (mms.reversedOrder) return 'uwbFixedReplyReversed'
  return 'uwbFixedReplyHint'
}

/** Why the reversed-order checkbox is live or not — the other side of the pair above. */
export function mmsReversedHintKey(
  mms: UwbMmsCfg,
): 'uwbReversedHint' | 'uwbReversedInterleaved' | 'uwbReversedFixedReply' {
  if (!mms.nonInterleaved) return 'uwbReversedInterleaved'
  return mms.fixedReplyRstu === null ? 'uwbReversedHint' : 'uwbReversedFixedReply'
}

/**
 * Which of the settings-dependent controls the current session leaves live. Each answer is read
 * off the hint key above it — `disabled` and `title` are then two views of one decision, not two
 * copies of one rule — and `narrowband` covers the allow list and the listen-before-talk select
 * together, since Config 1 takes the radio they both configure away.
 */
export function mmsDraftLive(mms: UwbMmsCfg): {
  uwbdControl: boolean; rsfSfd: boolean; fixedReply: boolean; reversedOrder: boolean; narrowband: boolean
} {
  return {
    uwbdControl: mmsUwbdControlHintKey(mms) === 'uwbUwbdControlHint',
    rsfSfd: mmsRsfSfdHintKey(mms) === 'uwbRsfSfdHint',
    fixedReply: mmsFixedReplyHintKey(mms) === 'uwbFixedReplyHint',
    reversedOrder: mmsReversedHintKey(mms) === 'uwbReversedHint',
    narrowband: mms.control === 'nba',
  }
}

/**
 * Which hint the angle-of-arrival checkbox shows, given the mode that disabled it.
 *
 * The reason differs by mode and saying the wrong one is worse than saying nothing: in the
 * one-way modes the anchors never receive a frame *from the tag*, while in MMS the tag transmits
 * and the range is two-way — what is missing there is a frame at all, the ranging signal being a
 * bare sequence with no preamble for a two-antenna array to compare phases on.
 */
export function uwbAoaHintKey(mode: UwbMode): 'uwbAoaHint' | 'uwbAoaMms' | 'uwbAoaTwrOnly' {
  if (mode === 'twr') return 'uwbAoaHint'
  return mode === 'mms' ? 'uwbAoaMms' : 'uwbAoaTwrOnly'
}

/**
 * Which hint the schedule select shows. Same care as `uwbAoaHintKey`: "the one-way modes are
 * time-scheduled only" is not why an MMS session cannot contend — its cycle is laid out pair by
 * pair and millisecond by millisecond before the block starts, so there is no window to open.
 */
export function uwbScheduleHintKey(
  mode: UwbMode, method: UwbSessionCfg['method'],
): 'uwbScheduleHint' | 'uwbScheduleMms' | 'uwbSsOnly' | 'uwbTwrOnly' {
  if (mode === 'mms') return 'uwbScheduleMms'
  if (method !== 'ss') return 'uwbSsOnly'
  return mode === 'twr' ? 'uwbScheduleHint' : 'uwbTwrOnly'
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
  // Which non-two-way mode is on, or null for two-way ranging: the clock correction belongs to
  // the listening tag of DL-TDoA and the sync error to the shared timebase of UL-TDoA, so each
  // field is live in exactly one mode and says why it is not in the others. It is deliberately
  // not called `oneWay` — MMS is in here too, and MMS is a two-way range.
  const nonTwr = session.mode === 'twr' ? null : session.mode
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
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: nonTwr === 'dl-tdoa' ? 'pointer' : 'default' }}
        title={nonTwr === 'dl-tdoa' ? E.uwbClockCorrectionHint : E.uwbDlOnly}>
        <input type="checkbox" checked={session.tdoaClockCorrection} disabled={nonTwr !== 'dl-tdoa'}
          onChange={(e) => onChange({ tdoaClockCorrection: e.target.checked })} />
        {E.uwbClockCorrection}
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: nonTwr === null ? 'pointer' : 'default' }}
        title={E[uwbAoaHintKey(session.mode)]}>
        <input type="checkbox" checked={session.aoa} disabled={nonTwr !== null}
          onChange={(e) => onChange({ aoa: e.target.checked })} />
        {E.uwbAoa}
      </label>
      <label style={label} title={nonTwr === 'ul-tdoa' ? E.uwbSyncErrorHint : E.uwbUlOnly}>
        {E.uwbSyncError}{' '}
        <input type="number" min={0} max={10} step={0.1} value={session.syncErrorNs} style={{ width: 62 }}
          disabled={nonTwr !== 'ul-tdoa'}
          onChange={(e) => onChange({ syncErrorNs: clampField(e.target.value, 0, 10) })} /> ns
      </label>
      <label style={label} title={E[uwbScheduleHintKey(session.mode, session.method)]}>
        {E.uwbSchedule}{' '}
        <select value={session.schedule} disabled={!ssOnly || nonTwr !== null}
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
      {mms && <MmsFields mms={mms} slotRstu={session.slotRstu} anchors={anchors} onChange={patchMms} />}
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
  { mms, slotRstu, anchors, onChange: commit }:
  { mms: UwbMmsCfg; slotRstu: number; anchors: number; onChange: (patch: Partial<UwbMmsCfg>) => void },
) {
  const E = useStrings().editor
  const setId = mmsSetIdOf(mms)
  // Every edit in this section goes through `mmsFieldPatch`, so an edit that would leave one of
  // the draft features stranded takes that feature with it rather than saving a plan the schema
  // refuses. Nothing below calls `commit` directly.
  const onChange = (patch: Partial<UwbMmsCfg>): void => commit(mmsFieldPatch(mms, patch))
  // Which controls the current settings leave live, and the reason each greyed-out one shows.
  const live = mmsDraftLive(mms)
  // The RSF the fragment parameters describe, whether or not this train carries one — it is the
  // arithmetic the N_MSR and gap fields drive, so it is worth showing either way.
  const rsfFragNs = rsfNs(mms.nMsr, mms.gap)
  // The power is a different question: the millisecond's energy is spread over whichever
  // fragment is actually the longest, and with X = 0 that is the RIF, not the RSF. An empty
  // train has no fragment at all (the schema refuses one), so the RSF stands in until it is
  // filled — the alternative is dividing 37 nJ by zero on the way to the screen.
  const longestNs = mmsLongestFragmentNs(mms) || rsfFragNs
  // The round the derived line below measures is the one this scenario would actually run:
  // a one-to-many round grows with the anchors, and with none of them there is only a pair.
  // …and at this session's own slots per millisecond, because a non-interleaved ranging phase is
  // that many slots per millisecond of train: measured at the draft's 600 RSTU default instead,
  // this line would print a round the run does not have (the schema's block-fit rule already
  // reads the session's own slot, and the two have to be the same round).
  const layout = mmsLayout(mms, mmsResponders(mms, anchors), mmsSlotsPerMs(slotRstu))
  return (
    <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--dim)', marginBottom: 4 }} title={E.uwbMmsHint}>{E.uwbMms}</div>
      <label style={label} title={E.uwbMmsControlHint}>
        {E.uwbMmsControl}{' '}
        <select value={mms.control}
          onChange={(e) => onChange({ control: e.target.value as MmsPhy['control'] })}>
          <option value="nba">{E.uwbMmsControls.nba}</option>
          <option value="uwbd">{E.uwbMmsControls.uwbd}</option>
        </select>
      </label>
      <label style={label} title={E[mmsUwbdControlHintKey(mms)]}>
        {E.uwbUwbdControl}{' '}
        <select value={mms.uwbdControl} disabled={!live.uwbdControl}
          onChange={(e) => onChange({ uwbdControl: e.target.value as MmsPhy['uwbdControl'] })}>
          <option value="sp0">{E.uwbUwbdControls.sp0}</option>
          <option value="none">{E.uwbUwbdControls.none}</option>
        </select>
      </label>
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
      <label style={label} title={E[mmsRsfSfdHintKey(mms)]}>
        <input type="checkbox" checked={mms.rsfSfd} disabled={!live.rsfSfd}
          onChange={(e) => onChange({ rsfSfd: e.target.checked })} />
        {' '}{E.uwbRsfSfd}
      </label>
      <NbChannelsInput value={mms.nbChannels} live={live.narrowband}
        onCommit={(nbChannels) => onChange({ nbChannels })} />
      <label style={label} title={live.narrowband ? E.uwbNbLbtHint : E.uwbNbNoRadio}>
        {E.uwbNbLbt}{' '}
        <select value={mms.nbLbt} disabled={!live.narrowband}
          onChange={(e) => onChange({ nbLbt: e.target.value as NbLbt })}>
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
      <label style={label} title={E.uwbOneToManyHint}>
        <input type="checkbox" checked={mms.oneToMany}
          onChange={(e) => onChange({ oneToMany: e.target.checked })} />
        {' '}{E.uwbOneToMany}
      </label>
      <label style={label} title={E.uwbNonInterleavedHint}>
        <input type="checkbox" checked={mms.nonInterleaved}
          onChange={(e) => onChange({ nonInterleaved: e.target.checked })} />
        {' '}{E.uwbNonInterleaved}
      </label>
      <FixedReplyInput value={mms.fixedReplyRstu} live={live.fixedReply} hint={E[mmsFixedReplyHintKey(mms)]}
        onCommit={(fixedReplyRstu) => onChange({ fixedReplyRstu })} />
      <label style={label} title={E[mmsReversedHintKey(mms)]}>
        <input type="checkbox" checked={mms.reversedOrder} disabled={!live.reversedOrder}
          onChange={(e) => onChange({ reversedOrder: e.target.checked })} />
        {' '}{E.uwbReversed}
      </label>
      <div style={note}>
        {E.uwbMmsDerived(
          (rsfFragNs / 1000).toFixed(2),
          (longestNs / 1000).toFixed(2),
          // A Unicode minus, as every dBm figure in the Guide and the glossary is written.
          mmsFragmentDbm(longestNs).toFixed(2).replace('-', '−'),
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
 *
 * `live` is false under the UWB-driven control plane, which has no narrowband radio for a list to
 * name: the field then shows the empty list `mmsFieldPatch` wrote and says why it is empty.
 */
function NbChannelsInput(
  { value, live, onCommit }: { value: number[]; live: boolean; onCommit: (v: number[]) => void },
) {
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
      <label title={live ? E.uwbNbChannelsHint : E.uwbNbNoRadio}>
        {E.uwbNbChannels}{' '}
        <input type="text" style={{ width: 132 }} value={draft ?? value.join(', ')} disabled={!live}
          onChange={(e) => { setDraft(e.target.value); setBad(false) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </label>
      {bad && <div style={issueStyle}>{E.uwbNbChannelsBad}</div>}
    </div>
  )
}

/**
 * The fixed reply time: a checkbox for the draft's own on/off (macMmsFixedReplyTime is disabled by
 * default) and, beside it, the interval in RSTU.
 *
 * The session stores one field for both — `null` is off — so the checkbox writes the draft's 600
 * RSTU ranging slot when it is ticked and `null` when it is not, and the number field is only
 * reachable while it is on. The interval itself is validated exactly as the allow list is: a value
 * outside the draft's bounds is not committed at all, the typed text stays on screen because it is
 * what the user has to fix, and the red line says what the bounds are. Clamping instead would
 * commit 300 the moment the field was cleared and then re-clamp every further digit under the
 * cursor, which is why `RstuInput` below buffers too.
 */
function FixedReplyInput(
  { value, live, hint, onCommit }:
  { value: number | null; live: boolean; hint: string; onCommit: (v: number | null) => void },
) {
  const E = useStrings().editor
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const commit = (): void => {
    if (draft === null) return
    const parsed = parseFixedReplyRstu(draft)
    if (parsed === null) {
      setBad(true) // the draft stays on screen: it is what the user has to fix
      return
    }
    setBad(false)
    setDraft(null)
    onCommit(parsed)
  }
  // What the number field shows while the feature is off: the value ticking the box would write.
  const shown = value ?? MMS_FIXED_REPLY_RSTU_DEFAULT
  return (
    <div style={label}>
      <label title={hint}>
        <input type="checkbox" checked={value !== null} disabled={!live}
          onChange={(e) => {
            setDraft(null) // a refused draft is not the user's problem once the feature is off
            setBad(false)
            onCommit(e.target.checked ? MMS_FIXED_REPLY_RSTU_DEFAULT : null)
          }} />
        {' '}{E.uwbFixedReply}{' '}
        <input type="number" min={MMS_FIXED_REPLY_RSTU_MIN} max={MMS_FIXED_REPLY_RSTU_MAX} step={300}
          style={{ width: 74 }} disabled={!live || value === null} value={draft ?? shown}
          onChange={(e) => { setDraft(e.target.value); setBad(false) }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span style={suffix}>RSTU · {ms(shown)} ms</span>
      </label>
      {bad && <div style={issueStyle}>{E.uwbFixedReplyBad}</div>}
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
