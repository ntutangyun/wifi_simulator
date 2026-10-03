/**
 * Editor fields of the scenario's ranging session (standard §10.32.2): the block and slot
 * structure every tag shares, the TWR method, the channel and the two noise
 * knobs. The shape of a session is fixed before it starts, so the numbers here
 * decide the whole schedule — the section prints the resulting round plan, and
 * the schema's own complaint when the numbers do not add up.
 */
import { useState } from 'react'
import { DEFAULT_UWB_MMS } from '../../model/scenario'
import type { NbLbt, NbReportMode, UwbMmsCfg, UwbMode, UwbSessionCfg, UwbSrrrCfg } from '../../model/scenario'
import { roundPlan } from '../session'
import {
  mmsResponders, rstuNs, uwbFixedReplyWindowRstu, uwbMmrcmSlots, uwbSlotsPerTag,
} from '../phy'
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

/**
 * **The invariant this panel keeps about the SRRR IE: its two request bits may never outlive
 * `sp3`.** standard §10.32.9.9 — the IE exists only in an SP3 round's RCM, so a bit set while
 * `sp3` is off describes a frame the session does not have.
 *
 * It is stated here rather than left implicit because two of this file's resets —
 * `uwbMethodPatch`'s and `uwbAoaPatch`'s — are *gated on `sp3` being already true*, and a gate
 * like that is sound only if a stranded bit cannot exist in the first place. It could: every
 * path that lowered `sp3` left `srrr` alone, so the bits survived, the two gated resets stopped
 * firing, and re-ticking `sp3` re-armed a request the session was no longer legal for — the
 * schema then refused the result (`scenario.ts`'s `method !== 'ss'` and `srrr.raoa && !aoa`
 * rules). Every lowering site therefore calls this, which is what makes the illegal state
 * unrepresentable rather than merely unreachable through one particular control.
 *
 * Returns the empty patch when both bits are already down, so a patch carries no field it does
 * not actually change — the same discipline the `if (rmnr) patch.rmnr = false` lines below use.
 */
function srrrDownWithSp3(srrr: UwbSrrrCfg): Partial<UwbSessionCfg> {
  return srrr.raoa || srrr.rrtt ? { srrr: { raoa: false, rrtt: false } } : {}
}

/**
 * The fixed reply time this session should carry: the one it already has when that is legal for
 * the slot actually set, and otherwise the **floor** of the window
 * (`uwbFixedReplyWindowRstu`). `null` means the window is empty — no fixed reply time is legal at
 * this slot at all, which the slot-fit rule refuses first and for its own reasons.
 *
 * **The invariant: a fixed reply time cannot outlive the slot it was legal for.** C1's shape one
 * level along — not a flag left high past the thing that justified it, but a *number* left behind
 * by a slot that moved underneath it. `fixedReplyRstu` is read by nothing except under
 * `replyTime: 'fixed'` (`uwbReplyTimeRstuLive`), and the session default (2400 RSTU) is legal for
 * the session default slot and for nothing far from it: beside MMS's own 600 RSTU — which
 * `uwbModePatch` writes and deliberately never writes back — it cannot fit two slots of that
 * width, and once the slot is raised past roughly 2 600 RSTU the same number is too *low*
 * instead, which is the same defect from the side nobody reported.
 *
 * The floor rather than the middle, for a reason worth stating: `scenario.ts` checks this window
 * tightened by flight time, which only ever loosens the lower bound and only ever tightens the
 * upper, so the floor is the point with the most headroom against the one edge a geometry can
 * move. It is also the shape a fixed reply time is for — the responder transmits the instant its
 * own slot opens.
 */
export function uwbFixedReplyRstuFor(session: UwbSessionCfg, anchors: number): number | null {
  const { loRstu, hiRstu } = uwbFixedReplyWindowRstu(session.slotRstu, anchors, session.schedule, session.method)
  if (loRstu > hiRstu) return null
  if (session.fixedReplyRstu >= loRstu && session.fixedReplyRstu <= hiRstu) return session.fixedReplyRstu
  return loRstu
}

/**
 * The largest `ancillaryFrames` a session can legally carry right now, scoped to `'twr'` the way
 * the schema's own rule is (standard §10.35.1; design §4.2 of
 * `docs/superpowers/specs/2026-10-02-ancillary-design.md`) — `null` outside two-way ranging, where
 * the exchange has no end to run between at all, so the question does not apply.
 *
 * Two independent ceilings, read off the exact calls `scenario.ts`'s own `superRefine` makes
 * (never retyped): the message cannot ask for more frames than the round has slots
 * (`uwbSlotsPerTag`), and the appended window cannot push the block past what it holds
 * (`uwbMmrcmSlots`'s own appended slots counted first, since a window-closing block spends both
 * batches at once). A contention schedule's own window (`contentionSlots`) is a **floor** on the
 * second ceiling rather than a third term: `uwb/phy.ts#uwbAncillarySlots` prices the appended
 * window at `max(ancillaryFrames, contentionSlots)` there, so no `ancillaryFrames` value at all is
 * legal once `contentionSlots` alone already overruns the block — the floor check below catches
 * that case before the cap is computed, rather than returning a cap no value can actually reach.
 */
export function uwbAncillaryFramesCapFor(session: UwbSessionCfg, anchors: number): number | null {
  if (session.mode !== 'twr') return null
  const slots = uwbSlotsPerTag(
    session.method, anchors, session.schedule, session.contentionSlots, session.mode,
    undefined, mmsSlotsPerMs(session.slotRstu), session.replyTime,
    session.sp3 ? { rrtt: session.srrr.rrtt } : undefined,
  )
  const mmrcrSlots = uwbMmrcmSlots(session.mode, anchors, session.mmrcr)
  const blockBudget = Math.floor(session.blockRstu / session.slotRstu) - slots - mmrcrSlots
  const floor = session.schedule === 'contention' ? session.contentionSlots : 0
  if (blockBudget < floor) return null
  const cap = Math.min(slots, blockBudget)
  return cap >= 1 ? cap : null
}

/**
 * What a session still owes after a patch has been merged into it — the panel's one
 * reconciliation step, applied to **every** commit rather than written into each patch.
 *
 * This shape was arrived at the hard way, and the reason is worth keeping. The fixed-reply window
 * is a function of `slotRstu`, `schedule`, `method` and the anchor count, and the controls that
 * move one of those are not one or two but *six*: the reply-time select, the slot field, the
 * reply-time field itself, **and** `uwbModePatch` (which writes `schedule: 'time'` in three
 * branches and MMS's `slotRstu` in one), `uwbSchedulePatch` and `uwbMethodPatch` (which both write
 * `schedule`). The first version of this fix threaded the window's inputs into the two patches the
 * review's walk had named; the walk then found three more — which is C1's own lesson arriving a
 * second time, a precedent applied without scanning the interface's other callers.
 *
 * So the invariant is not kept per patch at all. It is kept **once, after the merge**, where a
 * patch that has never heard of `fixedReplyRstu` cannot break it. That is strictly stronger than
 * six correct patches, and it is the only version of this fix that does not need a seventh writer
 * to remember anything. The cost is that a patch function in isolation no longer promises a legal
 * session — `uwbReplyTimePatch('fixed', …)` alone can leave a stale reply time — so the closure in
 * `tests/editor/uwb-planOps.test.ts` drives the panel's **commit**, not its patches, which is what
 * the panel actually does.
 *
 * **`ancillary`/`ancillaryFrames` (task 4) ride the same mechanism, for the same reason it was
 * built.** The first attempt at this task threaded the legality check into every patch that could
 * move it — `uwbModePatch`'s three non-`'twr'` branches, `uwbMethodPatch`, `uwbSchedulePatch`,
 * `uwbReplyTimePatch`, the `sp3` checkbox's own handler — and it still failed, because three more
 * sites move the same terms without going through any patch function at all: the raw
 * `contentionSlots` number input and the `blockRstu`/`slotRstu` `RstuInput`s, which all feed
 * `uwbAncillaryFramesCapFor`'s block-fit term directly. A patch that has never heard of
 * `ancillary` cannot break it here either, so the two fields are reconciled only here:
 * `ancillary` comes back down the moment the session leaves the one mode it is legal in or turns
 * `sp3` on beside it (the schema's own `ancillary && sp3 && mode === 'twr'` refusal — task 2's own
 * judgment call, since the standard does not order the two independently-sized appended batches),
 * and `ancillaryFrames` is retargeted to the current cap rather than deleted, the same "move the
 * value, do not drop the feature" shape `fixedReplyRstu` already uses.
 *
 * It returns the empty patch when nothing is owed, so a commit carries no field it does not
 * change — the same discipline every patch above keeps.
 */
export function uwbSessionRepair(session: UwbSessionCfg, anchors: number): Partial<UwbSessionCfg> {
  const patch: Partial<UwbSessionCfg> = {}
  if (session.replyTime === 'fixed') {
    const fixedReplyRstu = uwbFixedReplyRstuFor(session, anchors)
    if (fixedReplyRstu !== null && fixedReplyRstu !== session.fixedReplyRstu) patch.fixedReplyRstu = fixedReplyRstu
  }
  if (session.ancillary) {
    if (session.mode !== 'twr' || session.sp3) {
      patch.ancillary = false
    } else {
      const cap = uwbAncillaryFramesCapFor(session, anchors)
      if (cap !== null && session.ancillaryFrames > cap) patch.ancillaryFrames = cap
    }
  }
  return patch
}

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
 *
 * Many-to-many takes the same two as the one-way modes, for a related but distinct reason
 * (design §5): it has no tag-initiated exchange for a contention window to arbitrate, and no
 * single frame from "the tag" for an anchor's array to point at — there is no tag. It takes one
 * more of its own: `replyTime` back to `'embedded'`, because a many-to-many participant's one
 * transmission already carries its own transmit time and every arrival time it holds, which *is*
 * embedding — the standard's many-to-many clauses define no deferred or fixed shape at all
 * (`UwbSessionSchema`'s own refusal, mirrored here rather than left for the issue line to catch).
 *
 * Every non-`'twr'` branch also takes `rcmValidityRounds` back to 1 and `rmnr` back to false
 * (design §4) — a finding from this task rather than an earlier one: none of the three one-way
 * modes or many-to-many ever carries an ARC IE, so the schema refuses a non-default value of
 * either field there, the same way it refuses `aoa` outside two-way ranging. The mode select was
 * the one place in this file still able to hand the schema a combination it rejects — every other
 * field this function patches already had its reset; these two had none until now.
 *
 * `mmrcr` (standard §10.36's MMRCR bit, receipt-confirmation-design task 4) does **not** follow
 * `rmnr`'s pattern here: it is legal in two modes, not one — two-way ranging and `'m2m'` both carry
 * it (design §4 of that doc; `'m2m'` is the one mode the schema never refuses it in). So `mms`, the
 * one-way modes and the catch-all branch below take it back to false along with `rmnr`, but the
 * `'m2m'` branch leaves it alone. The `'twr'` branch is where the second instance of the `rmnr`
 * defect this task's brief names would have landed: `'m2m'` always pins `rcmValidityRounds` at 1,
 * so a session that turned `mmrcr` on while in `'m2m'` and then switched back to `'twr'` would
 * arrive carrying `mmrcr: true` at `rcmValidityRounds: 1` — the exact pair the schema refuses for
 * `'twr'` (it never refuses it for `'m2m'`, since a two-way responder's silence-or-Response already
 * answers "was I heard" for free, but a many-to-many participant has nothing else that ever does).
 * `rcmValidityRounds` and `mmrcr` are therefore read in, not just written out, the one asymmetry
 * between this function's `'twr'` branch and its other three.
 *
 * **`sp3` (standard §10.32.8) takes the same trip as `rmnr`, in all three non-`'twr'` branches,
 * including `'m2m'`.** Unlike `mmrcr`, SP3 grouped ranging has no second mode it stays legal in —
 * the schema refuses it outright for every mode but `'twr'` (sp3-design §3.2: identity comes from
 * the slot the controller's own schedule assigns, which none of the other four modes hands out the
 * same way), so this is the first field in this function where the `'m2m'` branch does not get to
 * copy `'twr'`'s leniency. This is task 4's own fix to the defect task 3 named: the mode select was
 * the one path in this file that could still hand the schema an `sp3: true` the three non-`'twr'`
 * modes all refuse.
 *
 * **And `srrr` goes down with `sp3` in all three of those branches** (`srrrDownWithSp3`): lowering
 * `sp3` without lowering the IE's own request bits left them stranded, and this was one of the
 * four paths that did it.
 */
export function uwbModePatch(
  mode: UwbMode, rcmValidityRounds = 1, mmrcr = false, srrr: UwbSrrrCfg = { raoa: false, rrtt: false },
): Partial<UwbSessionCfg> {
  if (mode === 'twr') return rcmValidityRounds === 1 && mmrcr ? { mode, mmrcr: false } : { mode }
  if (mode === 'mms') {
    return {
      mode, schedule: 'time', aoa: false, method: 'ss', slotRstu: 600,
      rcmValidityRounds: 1, rmnr: false, mmrcr: false, sp3: false, ...srrrDownWithSp3(srrr),
    }
  }
  if (mode === 'm2m') {
    // mmrcr deliberately untouched: design §4 keeps it legal here, the one non-two-way mode that
    // ever answers "who heard me" at all. sp3 has no such exception — see this function's own
    // comment above.
    return {
      mode, schedule: 'time', aoa: false, replyTime: 'embedded', rcmValidityRounds: 1, rmnr: false,
      sp3: false, ...srrrDownWithSp3(srrr),
    }
  }
  return {
    mode, schedule: 'time', aoa: false, rcmValidityRounds: 1, rmnr: false, mmrcr: false,
    sp3: false, ...srrrDownWithSp3(srrr),
  }
}

/**
 * What picking a TWR method changes. Only SS-TWR has a contention schedule — DS-TWR's report
 * phase would need a second contention window this simulator does not model — so picking DS-TWR
 * takes the session back to the time schedule with it, for the same reason `uwbModePatch` does.
 *
 * DS-TWR also has no `'fixed'` reply-time procedure at all (standard §10.29.6.3–.7 defines only
 * its embedded and deferred shapes, design §3.1) — a pairing the reply-time select on its own can
 * refuse to *create*, but not one already sitting in the session when this field is the one that
 * moves. Picking `'ds'` while `replyTime` is already `'fixed'` takes it back to the default the
 * same way switching to MMS takes the method back to `'ss'`.
 *
 * `srrr` takes a fifth, later trip of its own (fix round 1 of task 3, sp3-design §2.3): both of
 * SRRR's request bits are refused outside SS-TWR — the frames that would answer them are the
 * deferred shape's own (the responder's follow-up message for RAOA, the initiator's own report for
 * RRTT), and a DS round's report phase already carries an unconditional round trip and nothing a
 * bearing would lengthen, so either bit there is a request this engine accepts and never answers.
 * `sp3` itself stays legal under DS-TWR (its ranging phase still shortens), so only the two request
 * bits — never `sp3` — come back down when the method select is what moves them into that pair.
 */
export function uwbMethodPatch(
  method: UwbSessionCfg['method'], replyTime: UwbSessionCfg['replyTime'],
  sp3 = false, srrr: UwbSrrrCfg = { raoa: false, rrtt: false },
): Partial<UwbSessionCfg> {
  const patch: Partial<UwbSessionCfg> = method !== 'ds'
    ? { method }
    : (replyTime === 'fixed' ? { method, schedule: 'time', replyTime: 'embedded' } : { method, schedule: 'time' })
  // The `sp3 &&` gate is sound only because `srrrDownWithSp3` holds the invariant that a request
  // bit cannot be up while sp3 is down: with it, "sp3 off" really does mean "no bit to strand".
  if (method === 'ds' && sp3 && (srrr.raoa || srrr.rrtt)) patch.srrr = { raoa: false, rrtt: false }
  return patch
}

/**
 * What picking a schedule changes. A contention round's responder draws its slot at random
 * (schedule mode 0), so a `'deferred'` follow-up message — which needs a slot of its own fixed in
 * advance — has nowhere to go (design §3.1). The mirror of what `uwbMethodPatch` does for
 * `'fixed'`: picking `'contention'` while `replyTime` is already `'deferred'` takes it back to the
 * default rather than landing on the pair the schema refuses.
 *
 * It takes `rmnr` the same way, for its own, unrelated reason (design §4): a contention
 * responder's slot is drawn fresh each round, never read off a still-valid control message, so
 * there is nothing for an RMNR frame to confirm there. Turning the checkbox on is the rmnr
 * toggle's own job (it is simply greyed out under a contention schedule); taking it away when the
 * schedule is the field moving is this function's, the same division `uwbModePatch` keeps.
 *
 * `mmrcr` takes the same trip, for the same reason the schema refuses it under a contention
 * schedule (receipt-confirmation-design §4, task 4): the confirmation has to land in a slot a
 * given responder can count on, and a contention response phase hands out no such slot. This
 * schedule select only ever moves while `session.mode === 'twr'` (the panel greys it out
 * otherwise), so `mmrcr`'s own `'m2m'` legality never has to be considered here.
 *
 * `sp3` takes the same trip for its own reason (sp3-design §3, schema's own `sp3 && schedule ===
 * 'contention'` refusal): a contention responder's slot is drawn fresh each round, so there is no
 * fixed slot for the RCM's per-responder SRRR IE to name in advance. This is the second of the
 * three resets task 3's concern 2 named — `sp3` was the field `rmnr`/`mmrcr`'s own precedent here
 * never had to cover, because it did not exist when this function was written.
 *
 * And `srrr` goes down with it (`srrrDownWithSp3`), the second of the four paths that lowered
 * `sp3` while leaving the IE's own request bits up.
 */
export function uwbSchedulePatch(
  schedule: UwbSessionCfg['schedule'], replyTime: UwbSessionCfg['replyTime'], rmnr: boolean, mmrcr = false,
  sp3 = false, srrr: UwbSrrrCfg = { raoa: false, rrtt: false },
): Partial<UwbSessionCfg> {
  if (schedule !== 'contention') return { schedule }
  const patch: Partial<UwbSessionCfg> = { schedule }
  if (replyTime === 'deferred') patch.replyTime = 'embedded'
  if (rmnr) patch.rmnr = false
  if (mmrcr) patch.mmrcr = false
  if (sp3) Object.assign(patch, { sp3: false }, srrrDownWithSp3(srrr))
  return patch
}

/**
 * What changing RCM validity rounds commits. At 1, a control message no longer outlives the round
 * it was sent in — it and that round's initiation message are the same frame (design §1) — which
 * is exactly the state `rmnr`'s schema refusal names: a responder that missed the Poll missed both
 * at once and never learned which slot was its own, so there is nothing for it to send RMNR about.
 * Dropping to 1 therefore takes `rmnr` back to false with it, the direction `uwbModePatch` and
 * `uwbSchedulePatch` already take for their own dependents — the field being edited gives away the
 * one that would otherwise be left sitting on the illegal side of the schema's rule.
 *
 * `mmrcr` takes the same trip for its own reason (receipt-confirmation-design §4, task 4): at
 * `rcmValidityRounds: 1` the window mmrcr would describe is exactly the round that just ran, and a
 * two-way responder's own silence-or-Response already answers that for free — the schema refuses
 * the pair the same way it refuses `rmnr` there. This field is greyed out outside `'twr'`
 * (`uwbRcmValidityHintKey`), so `mmrcr`'s `'m2m'` legality is never at stake here.
 */
export function uwbRcmValidityRoundsPatch(
  rcmValidityRounds: number, rmnr: boolean, mmrcr = false,
): Partial<UwbSessionCfg> {
  const patch: Partial<UwbSessionCfg> = { rcmValidityRounds }
  if (rcmValidityRounds === 1 && rmnr) patch.rmnr = false
  if (rcmValidityRounds === 1 && mmrcr) patch.mmrcr = false
  return patch
}

/**
 * Why the RCM-validity-rounds field is live or not. The standard's ARC IE — the frame this field
 * extends the reach of — is a two-way-ranging fixture (§10.32.9.1): none of the one-way modes or
 * many-to-many ever carries one, so the schema refuses a non-default value there (`uwbModePatch`
 * resets it the moment the mode select moves, the same way it resets `aoa`).
 */
export function uwbRcmValidityHintKey(mode: UwbMode): 'uwbRcmValidityHint' | 'uwbRcmValidityTwrOnly' {
  return mode === 'twr' ? 'uwbRcmValidityHint' : 'uwbRcmValidityTwrOnly'
}

/**
 * Why the RMNR toggle is live or not. Three separate reasons, in the order a user would need to
 * fix them: outside two-way ranging there is no control message to still be holding at all (the
 * same reason `uwbRcmValidityHintKey` greys the field above it); at `rcmValidityRounds: 1` the
 * control message and the round's own initiation message are one frame (design §1), so a
 * responder that missed the Poll never learned its own slot and has nowhere to send RMNR from —
 * this is the one hint `UwbSessionFields`'s own greying usually never has to carry, a causal
 * reason rather than "wrong mode"; and under a contention schedule a responder's slot is drawn
 * fresh each round, not read off a still-valid control message, so there is nothing an RMNR frame
 * would be confirming.
 */
export function uwbRmnrHintKey(
  mode: UwbMode, rcmValidityRounds: number, schedule: UwbSessionCfg['schedule'],
): 'uwbRmnrHint' | 'uwbRmnrTwrOnly' | 'uwbRmnrNeedsValidity' | 'uwbRmnrContention' {
  if (mode !== 'twr') return 'uwbRmnrTwrOnly'
  if (rcmValidityRounds === 1) return 'uwbRmnrNeedsValidity'
  if (schedule === 'contention') return 'uwbRmnrContention'
  return 'uwbRmnrHint'
}

/**
 * Why the receipt-confirmation-request toggle is live or not (standard §10.36's MMRCR, design §4 of
 * 2026-10-02-receipt-confirmation-design.md). Unlike `uwbRmnrHintKey`, the legal modes are two, not
 * one — two-way ranging and `'m2m'` — because a many-to-many participant has no other frame that
 * ever tells it who heard it (`UwbM2mTimes.rxCounters` only ever echoes receipt *forward*, to a
 * later participant, never back to the sender), while the schema refuses `mmrcr` outright for the
 * other three: DL-TDoA's non-controller anchors already say whether they heard the Poll by sending
 * or not sending a Response, UL-TDoA's blink opens no exchange an ARC IE could ride on, and MMS's
 * control plane is a different radio entirely. `'twr'` carries one further refusal `'m2m'` does
 * not: at `rcmValidityRounds: 1` the window mmrcr would describe is exactly the round that just
 * ran, and a two-way responder's own silence-or-Response already answers "was I heard" for free —
 * the same gap `'m2m'` has no other way to close.
 */
export function uwbMmrcrHintKey(
  mode: UwbMode, rcmValidityRounds: number, schedule: UwbSessionCfg['schedule'],
): 'uwbMmrcrHint' | 'uwbMmrcrDlTdoa' | 'uwbMmrcrUlTdoa' | 'uwbMmrcrMms' | 'uwbMmrcrNeedsValidity' | 'uwbMmrcrContention' {
  if (mode === 'dl-tdoa') return 'uwbMmrcrDlTdoa'
  if (mode === 'ul-tdoa') return 'uwbMmrcrUlTdoa'
  if (mode === 'mms') return 'uwbMmrcrMms'
  if (mode === 'twr' && rcmValidityRounds === 1) return 'uwbMmrcrNeedsValidity'
  if (schedule === 'contention') return 'uwbMmrcrContention'
  return 'uwbMmrcrHint'
}

/**
 * What picking a reply-time shape itself commits, or `null` for a combination the schema refuses
 * outright (design §3.1): `'fixed'` beside DS-TWR — the standard's five procedures pair DS-TWR
 * with only its embedded and deferred time-information shapes — and `'deferred'` beside a
 * contention schedule — its responder has no fixed slot to defer into. Returning `null` rather
 * than a patch is what keeps the illegal pair from ever being committed: the field that calls this
 * simply does not call `onChange` when it comes back empty, the same shape `parseFixedReplyRstu`
 * above uses for a value the schema would refuse.
 *
 * The reverse pairings are `uwbMethodPatch` and `uwbSchedulePatch`'s job: this function only ever
 * has `replyTime` to give away, never `method` or `schedule`, so a session already sitting on the
 * illegal side of either rule (from a hand-edited or imported file) is left alone here — the red
 * hint under the panel is what surfaces that case, not a silent rewrite of a field the user did
 * not touch.
 *
 * `sp3` is the third of task 3's named resets, and it does not fit the `null`-for-illegal shape
 * the two rules above use, because "picking `'embedded'` while `sp3` is on" is not a pairing this
 * field should ever refuse to *create* — `'embedded'`/`'fixed'` are both legal reply-time shapes on
 * their own, only not beside a grouped-ranging round that has no payload-bearing frame left to
 * carry one (sp3-design §2/§3.2.1: SP3's marker is SYNC+SFD+STS only, so the measured time has to
 * come back on the measurement-report phase `replyTime: 'deferred'` already builds). So the patch
 * commits `replyTime` either way and only takes `sp3` down with it when the new value cannot carry
 * it — the same "the field being edited gives away the dependent" shape `uwbRcmValidityRoundsPatch`
 * uses for `rmnr`, not the "refuse to create" shape this function uses for `method`/`schedule`.
 *
 * And `srrr` goes down with it (`srrrDownWithSp3`), the third of the four paths that lowered `sp3`
 * while leaving the IE's own request bits up.
 *
 * `fixedReplyRstu` — the field `'fixed'` is the one shape that reads at all — is deliberately
 * **not** this function's business, even though picking `'fixed'` beside MMS's 600 RSTU slot was
 * the reachable path the walk first found. It is reconciled once, after the merge, by
 * `uwbSessionRepair`: six controls can move that window and this is only one of them, and the
 * comment on `uwbSessionRepair` says what happened when the fix was attempted per patch instead.
 */
export function uwbReplyTimePatch(
  replyTime: UwbSessionCfg['replyTime'], method: UwbSessionCfg['method'], schedule: UwbSessionCfg['schedule'],
  sp3 = false, srrr: UwbSrrrCfg = { raoa: false, rrtt: false },
): Partial<UwbSessionCfg> | null {
  if (replyTime === 'fixed' && method === 'ds') return null
  if (replyTime === 'deferred' && schedule === 'contention') return null
  const patch: Partial<UwbSessionCfg> = { replyTime }
  if (sp3 && replyTime !== 'deferred') Object.assign(patch, { sp3: false }, srrrDownWithSp3(srrr))
  return patch
}

/**
 * Whether the fixed reply-time RSTU field means anything: only under `replyTime: 'fixed'`
 * (design §6/§6.1) — embedded writes the reply time into the Response itself and deferred reports
 * it after the fact, so neither one ever reads this field. A plain predicate, not a hint key, is
 * all this one needs: there is exactly one reason it is ever grey.
 */
export function uwbReplyTimeRstuLive(replyTime: UwbSessionCfg['replyTime']): boolean {
  return replyTime === 'fixed'
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
 * bare sequence with no preamble for a two-antenna array to compare phases on. Many-to-many is a
 * third, different reason again (design §5): it has no anchor with a fixed array and no tag to
 * point it at — every participant's one transmission answers several people at once, so there is
 * no single frame's arrival to measure a bearing against either.
 */
export function uwbAoaHintKey(mode: UwbMode): 'uwbAoaHint' | 'uwbAoaMms' | 'uwbAoaM2m' | 'uwbAoaTwrOnly' {
  if (mode === 'twr') return 'uwbAoaHint'
  if (mode === 'mms') return 'uwbAoaMms'
  if (mode === 'm2m') return 'uwbAoaM2m'
  return 'uwbAoaTwrOnly'
}

/**
 * Which hint the schedule select shows. Same care as `uwbAoaHintKey`: "the one-way modes are
 * time-scheduled only" is not why an MMS session cannot contend — its cycle is laid out pair by
 * pair and millisecond by millisecond before the block starts, so there is no window to open.
 * Many-to-many's own reason is different again (design §5): every slot already belongs to a named
 * participant before the round starts, so there is nothing left for a contention phase to draw
 * for — not "no tag-initiated exchange" (there is no tag), but "no slot left unassigned at all".
 */
export function uwbScheduleHintKey(
  mode: UwbMode, method: UwbSessionCfg['method'],
): 'uwbScheduleHint' | 'uwbScheduleMms' | 'uwbScheduleM2m' | 'uwbSsOnly' | 'uwbTwrOnly' {
  if (mode === 'mms') return 'uwbScheduleMms'
  if (mode === 'm2m') return 'uwbScheduleM2m'
  if (method !== 'ss') return 'uwbSsOnly'
  return mode === 'twr' ? 'uwbScheduleHint' : 'uwbTwrOnly'
}

/**
 * Why the SP3 grouped-ranging checkbox is live or not (standard §10.32.8). Four refusals, checked
 * in the order a user would meet them fixing one at a time: the schema refuses the mode outright
 * for every one-way mode and `'m2m'` (sp3-design §3.2 — identity comes from the slot the
 * controller's own schedule assigns, which only `'twr'`'s schedule does the way SP3 needs);
 * refuses a contention schedule, whose responder slot is drawn fresh each round with nothing fixed
 * for the RCM's SRRR IE to name in advance; and refuses every reply-time shape but `'deferred'`,
 * because an SP3 marker is SYNC+SFD+STS with no payload at all, so the time it measures has to come
 * back on the measurement-report phase only the deferred shape already builds (design §2.2: this
 * is the slice's whole point — the shortest ranging frame only wins on the road that has already
 * paid for that report phase).
 */
export function uwbSp3HintKey(
  mode: UwbMode, schedule: UwbSessionCfg['schedule'], replyTime: UwbSessionCfg['replyTime'],
): 'uwbSp3Hint' | 'uwbSp3DlTdoa' | 'uwbSp3UlTdoa' | 'uwbSp3Mms' | 'uwbSp3M2m' | 'uwbSp3Contention' | 'uwbSp3NeedsDeferred' {
  if (mode === 'dl-tdoa') return 'uwbSp3DlTdoa'
  if (mode === 'ul-tdoa') return 'uwbSp3UlTdoa'
  if (mode === 'mms') return 'uwbSp3Mms'
  if (mode === 'm2m') return 'uwbSp3M2m'
  if (schedule === 'contention') return 'uwbSp3Contention'
  if (replyTime !== 'deferred') return 'uwbSp3NeedsDeferred'
  return 'uwbSp3Hint'
}

/**
 * Why the SRRR IE's two request-bit checkboxes (standard §10.32.9.9) are live or not. Both need
 * `sp3` on — the SRRR IE only exists in an SP3 round's RCM — and both are refused outside SS-TWR
 * (fix round 1 of task 3, sp3-design §2.3): the frames that would answer them are the deferred
 * shape's own, and a DS round's report phase already carries an unconditional round trip and
 * nothing a bearing would lengthen, so either bit there is a request this engine accepts and never
 * answers — `uwbMethodPatch` is what takes a stranded one back down when the method select moves.
 * RAOA carries one further refusal on top of that, the schema's own `superRefine`: it asks the
 * report phase for a bearing no anchor without `aoa` on ever computes.
 */
export function uwbSrrrRaoaHintKey(
  sp3: boolean, method: UwbSessionCfg['method'], aoa: boolean,
): 'uwbSrrrRaoaHint' | 'uwbSrrrNeedsSp3' | 'uwbSrrrNeedsSs' | 'uwbSrrrRaoaNeedsAoa' {
  if (!sp3) return 'uwbSrrrNeedsSp3'
  if (method !== 'ss') return 'uwbSrrrNeedsSs'
  return aoa ? 'uwbSrrrRaoaHint' : 'uwbSrrrRaoaNeedsAoa'
}
export function uwbSrrrRrttHintKey(
  sp3: boolean, method: UwbSessionCfg['method'],
): 'uwbSrrrRrttHint' | 'uwbSrrrNeedsSp3' | 'uwbSrrrNeedsSs' {
  if (!sp3) return 'uwbSrrrNeedsSp3'
  return method === 'ss' ? 'uwbSrrrRrttHint' : 'uwbSrrrNeedsSs'
}

/**
 * Why the ranging ancillary information checkbox is live or not (standard §10.35.1). Two
 * refusals, the same order a user would meet them: two-way ranging only, the same `'twr'` gate
 * `uwbRmnrHintKey` uses a single generic reason for rather than one key per mode — the four other
 * modes' own refusal messages (schema's own `superRefine`) already say why in the issue line, and
 * this checkbox does not repeat them; and not beside `sp3`, task 2's own judgment call (two
 * independently-sized appended batches with no defined order between them — sp3-design and
 * ancillary-design §4.2 both leave the ordering unresolved, so this task does not lift the
 * refusal, only names it here beside the mode gate).
 */
export function uwbAncillaryHintKey(
  mode: UwbMode, sp3: boolean,
): 'uwbAncillaryHint' | 'uwbAncillaryTwrOnly' | 'uwbAncillarySp3' {
  if (mode !== 'twr') return 'uwbAncillaryTwrOnly'
  return sp3 ? 'uwbAncillarySp3' : 'uwbAncillaryHint'
}

/**
 * What turning angle-of-arrival off commits, beyond the field itself.
 *
 * This is a fourth reset in the same family task 3's concern 2 named for `uwbModePatch` /
 * `uwbSchedulePatch` / `uwbReplyTimePatch`, found while wiring SRRR into this panel rather than
 * named in the brief: `aoa` itself gained a dependent the day `srrr.raoa` could exist, because the
 * schema refuses `sp3 && srrr.raoa && !aoa` (the RAOA request asking for a bearing no anchor
 * computes). `uwbAoaHintKey` only greys the checkbox when `aoa` is already off for some other
 * mode-level reason — it was never asked to look at `sp3`/`srrr` — so without this, unticking AoA
 * while a grouped-ranging bearing request was still on deck left the session on the illegal side of
 * that rule with no control in this panel to surface it. Mirrors `uwbReplyTimePatch`'s shape: the
 * field being edited commits either way, and only takes its dependent down when the new value
 * cannot carry it.
 */
export function uwbAoaPatch(aoa: boolean, sp3: boolean, srrr: UwbSrrrCfg): Partial<UwbSessionCfg> {
  // As in `uwbMethodPatch`, the `!sp3` early return is sound only under `srrrDownWithSp3`'s
  // invariant: sp3 off means both request bits are already off, so there is nothing to strand.
  if (aoa || !sp3 || !srrr.raoa) return { aoa }
  return { aoa, srrr: { ...srrr, raoa: false } }
}

/**
 * What the SP3 checkbox commits (standard §10.32.8). Turning it **on** is the field alone — the
 * three combinations the schema refuses are the three `uwbSp3HintKey` greys the box out for, so
 * there is nothing left for a patch to fix. Turning it **off** owes `srrr` the reset
 * `srrrDownWithSp3` describes, and this is the fourth and last path that lowers `sp3`: the other
 * three are `uwbModePatch`, `uwbSchedulePatch` and `uwbReplyTimePatch`, which lower it as a
 * consequence of some other field moving, while this one is the user saying so directly.
 *
 * It is the shortest way to the defect and the one the greying cannot help with: both SRRR
 * checkboxes are greyed the instant `sp3` goes down, so a bit left up there is a state the panel
 * shows the user no control for — only re-ticking `sp3` brings it back into view, by which point
 * the session is already one the schema refuses.
 */
export function uwbSp3Patch(sp3: boolean, srrr: UwbSrrrCfg): Partial<UwbSessionCfg> {
  return sp3 ? { sp3 } : { sp3, ...srrrDownWithSp3(srrr) }
}

/**
 * `issue` is what `uwbSessionIssue` says about the scenario this session belongs
 * to, and `onRemove` drops the session — offered because an imported file may
 * carry one no device takes part in, and only then is removing it legal.
 */
export function UwbSessionFields(
  { session, anchors, tags, issue, onChange: emit, onRemove }:
  {
    session: UwbSessionCfg; anchors: number; tags: number; issue: string | null
    onChange: (patch: Partial<UwbSessionCfg>) => void; onRemove: () => void
  },
) {
  const E = useStrings().editor
  /**
   * Every control on this panel commits through here, and the raw `onChange` is renamed out of
   * reach so that reaching for the obvious name gets the reconciled path. A control that calls
   * `emit` directly would be the one hole left in this, and there is no reason for one to.
   *
   * What it adds is `uwbSessionRepair`: the cross-field values that no single patch owns, computed
   * against the session the patch would actually produce rather than the one it was computed from.
   * The repair has the last word, and that costs nothing it should not: it only ever returns a
   * field when the merged session is one the schema would refuse, so a legal edit of the user's
   * own is never overwritten — `uwbFixedReplyRstuFor` hands back the value it was given whenever
   * that value is inside the window.
   */
  const onChange = (patch: Partial<UwbSessionCfg>): void => {
    const next: UwbSessionCfg = { ...session, ...patch }
    emit({ ...patch, ...uwbSessionRepair(next, anchors) })
  }
  // Many-to-many counts every UWB node as a participant (design §5) — the anchor/tag split is a
  // drawing choice in this mode, not a headcount for its own round, so the plan line below must
  // not read `anchors` alone the way every other mode's round does.
  const m2m = session.mode === 'm2m'
  const participants = m2m ? anchors + tags : anchors
  // With no anchor (or, in m2m, no participant at all) there is no round to plan; printing one
  // built from a made-up anchor would contradict the issue line right beside it.
  const plan = participants > 0 ? roundPlan(session, participants) : null
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
  // Which reason (if any) keeps the RMNR toggle off — derived once so the `disabled` attribute and
  // the title it shows cannot disagree about which rule is in force, the same discipline
  // `mmsDraftLive` uses for the MMS fields below.
  const rmnrHintKey = uwbRmnrHintKey(session.mode, session.rcmValidityRounds, session.schedule)
  const rmnrLive = rmnrHintKey === 'uwbRmnrHint'
  // Same discipline for the receipt-confirmation-request checkbox (design §4 of
  // 2026-10-02-receipt-confirmation-design.md).
  const mmrcrHintKey = uwbMmrcrHintKey(session.mode, session.rcmValidityRounds, session.schedule)
  const mmrcrLive = mmrcrHintKey === 'uwbMmrcrHint'
  // Same discipline for SP3 grouped ranging (standard §10.32.8) and its SRRR IE's two request
  // bits (§10.32.9.9) — derived once so the checkbox and its title never disagree.
  const sp3HintKey = uwbSp3HintKey(session.mode, session.schedule, session.replyTime)
  const sp3Live = sp3HintKey === 'uwbSp3Hint'
  const srrrRaoaHintKey = uwbSrrrRaoaHintKey(session.sp3, session.method, session.aoa)
  const srrrRaoaLive = srrrRaoaHintKey === 'uwbSrrrRaoaHint'
  const srrrRrttHintKey = uwbSrrrRrttHintKey(session.sp3, session.method)
  const srrrRrttLive = srrrRrttHintKey === 'uwbSrrrRrttHint'
  // The window the fixed reply time has to land in, derived once: the number field's own bounds
  // and `onChange`'s reconciliation read the same one, so the control cannot offer a value the
  // commit would then quietly correct.
  const fixedReplyWindow = uwbFixedReplyWindowRstu(session.slotRstu, anchors, session.schedule, session.method)
  // Ranging ancillary information (standard §10.35.1) — same discipline again: the checkbox's
  // title and the frame-count field's own bound are read off the same two calls `onChange`'s
  // reconciliation uses, so neither control can offer what the commit would then correct.
  const ancillaryHintKey = uwbAncillaryHintKey(session.mode, session.sp3)
  const ancillaryLive = ancillaryHintKey === 'uwbAncillaryHint'
  const ancillaryFramesCap = uwbAncillaryFramesCapFor(session, anchors)
  return (
    <div>
      <div style={{ color: 'var(--dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {E.uwbSession}
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>{E.uwbCounts(anchors, tags)}</span>
      </div>
      <label style={label} title={mms ? E.uwbMmsSsOnly : E.uwbMethodHint}>
        {E.uwbMethod}{' '}
        <select value={session.method} disabled={mms !== null}
          onChange={(e) => onChange(
            uwbMethodPatch(e.target.value as UwbSessionCfg['method'], session.replyTime, session.sp3, session.srrr),
          )}>
          <option value="ss">{E.uwbMethods.ss}</option>
          <option value="ds">{E.uwbMethods.ds}</option>
        </select>
      </label>
      <label style={label} title={mms ? E.uwbReplyTimeMmsOnly : m2m ? E.uwbReplyTimeM2mOnly : E.uwbReplyTimeHint}>
        {E.uwbReplyTime}{' '}
        <select value={session.replyTime} disabled={mms !== null || m2m}
          onChange={(e) => {
            const patch = uwbReplyTimePatch(
              e.target.value as UwbSessionCfg['replyTime'], session.method, session.schedule, session.sp3,
              session.srrr,
            )
            if (patch) onChange(patch) // an illegal pair is never committed — see uwbReplyTimePatch
          }}>
          <option value="embedded">{E.uwbReplyTimes.embedded}</option>
          <option value="deferred">{E.uwbReplyTimes.deferred}</option>
          <option value="fixed">{E.uwbReplyTimes.fixed}</option>
        </select>
      </label>
      <label style={label} title={uwbReplyTimeRstuLive(session.replyTime) ? E.uwbReplyTimeRstuHint : E.uwbReplyTimeRstuOnly}>
        {E.uwbReplyTimeRstu}{' '}
        {/* Clamped to the window the slot actually leaves (`uwbFixedReplyWindowRstu`), not to the
            0…60 000 RSTU the field can hold: every value outside it is one the schema refuses, and
            a number field whose own bounds are wider than the rule is a control that invites the
            refusal. The bounds are computed from the slot and the two airtimes, so they move with
            the slot rather than being written down here. */}
        <input type="number" min={fixedReplyWindow.loRstu} max={fixedReplyWindow.hiRstu} step={1}
          value={session.fixedReplyRstu} style={{ width: 74 }}
          disabled={!uwbReplyTimeRstuLive(session.replyTime)}
          onChange={(e) => onChange({
            fixedReplyRstu: clampField(e.target.value, fixedReplyWindow.loRstu, fixedReplyWindow.hiRstu, true),
          })} />
        <span style={suffix}>RSTU · {ms(session.fixedReplyRstu)} ms</span>
      </label>
      <label style={label} title={E.uwbModeHint}>
        {E.uwbMode}{' '}
        <select value={session.mode} onChange={(e) => onChange(
          uwbModePatch(e.target.value as UwbMode, session.rcmValidityRounds, session.mmrcr, session.srrr),
        )}>
          <option value="twr">{E.uwbModes.twr}</option>
          <option value="dl-tdoa">{E.uwbModes['dl-tdoa']}</option>
          <option value="ul-tdoa">{E.uwbModes['ul-tdoa']}</option>
          <option value="mms">{E.uwbModes.mms}</option>
          <option value="m2m">{E.uwbModes.m2m}</option>
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
          onChange={(e) => onChange(uwbAoaPatch(e.target.checked, session.sp3, session.srrr))} />
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
          onChange={(e) => onChange(
            uwbSchedulePatch(
              e.target.value as UwbSessionCfg['schedule'], session.replyTime, session.rmnr, session.mmrcr, session.sp3,
              session.srrr,
            ),
          )}>
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
      <label style={label} title={E[uwbRcmValidityHintKey(session.mode)]}>
        {E.uwbRcmValidityRounds}{' '}
        <input type="number" min={1} max={64} step={1} value={session.rcmValidityRounds} style={{ width: 62 }}
          disabled={session.mode !== 'twr'}
          onChange={(e) => onChange(
            uwbRcmValidityRoundsPatch(clampField(e.target.value, 1, 64, true), session.rmnr, session.mmrcr),
          )} />
      </label>
      {/* Greying this out is one of the few places in this panel where the disabled state itself
          teaches something: at rcmValidityRounds 1 the control message and this round's own
          initiation message are one frame, so a responder that missed the Poll never learned
          which slot was its own — the state this checkbox would turn on cannot exist yet, and
          `uwbRmnrHintKey`'s `uwbRmnrNeedsValidity` hint says exactly that, not just "pick a
          different mode". */}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: rmnrLive ? 'pointer' : 'default' }}
        title={E[rmnrHintKey]}>
        <input type="checkbox" checked={session.rmnr} disabled={!rmnrLive}
          onChange={(e) => onChange({ rmnr: e.target.checked })} />
        {E.uwbRmnr}
      </label>
      {/* Legal in two-way ranging and many-to-many, unlike every other checkbox on this panel
          (`uwbMmrcrHintKey`) — a many-to-many participant has no other frame that ever answers
          "who heard me", so this one is not greyed out there the way `rmnr` is. */}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: mmrcrLive ? 'pointer' : 'default' }}
        title={E[mmrcrHintKey]}>
        <input type="checkbox" checked={session.mmrcr} disabled={!mmrcrLive}
          onChange={(e) => onChange({ mmrcr: e.target.checked })} />
        {E.uwbMmrcr}
      </label>
      {/* SP3 grouped ranging (standard §10.32.8): legal in two-way ranging only, and only beside
          the time schedule and the deferred reply-time shape — the three refusals `uwbSp3HintKey`
          names in the order a user would meet them. Turning it on is the field alone, because
          those three are the only combinations it conflicts with and the box is greyed out in
          every one of them. Turning it off goes through `uwbSp3Patch`, which owes `srrr` its
          reset: the greying cannot carry that one, since both SRRR boxes grey out together with
          this one and a bit left up behind them has no control left to turn it down. */}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: sp3Live ? 'pointer' : 'default' }}
        title={E[sp3HintKey]}>
        <input type="checkbox" checked={session.sp3} disabled={!sp3Live}
          onChange={(e) => onChange(uwbSp3Patch(e.target.checked, session.srrr))} />
        {E.uwbSp3}
      </label>
      {/* The SRRR IE's own two request bits (standard §10.32.9.9), live only once sp3 is on. RAOA
          carries a second refusal of its own — it asks the report phase for a bearing no anchor
          without `aoa` on ever computes — which is why unticking AoA while this box is ticked has
          to take it with it (`uwbAoaPatch`, the fourth reset this task added). */}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: srrrRaoaLive ? 'pointer' : 'default' }}
        title={E[srrrRaoaHintKey]}>
        <input type="checkbox" checked={session.srrr.raoa} disabled={!srrrRaoaLive}
          onChange={(e) => onChange({ srrr: { ...session.srrr, raoa: e.target.checked } })} />
        {E.uwbSrrrRaoa}
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: srrrRrttLive ? 'pointer' : 'default' }}
        title={E[srrrRrttHintKey]}>
        <input type="checkbox" checked={session.srrr.rrtt} disabled={!srrrRrttLive}
          onChange={(e) => onChange({ srrr: { ...session.srrr, rrtt: e.target.checked } })} />
        {E.uwbSrrrRrtt}
      </label>
      {/* Ranging ancillary information (standard §10.35.1): legal in two-way ranging only, and not
          beside SP3 (task 2's own judgment call — see `uwbAncillaryHintKey`). Turning it on or off
          is the field alone; everything cross-field is `uwbSessionRepair`'s job, not a patch here. */}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, cursor: ancillaryLive ? 'pointer' : 'default' }}
        title={E[ancillaryHintKey]}>
        <input type="checkbox" checked={session.ancillary} disabled={!ancillaryLive}
          onChange={(e) => onChange({ ancillary: e.target.checked })} />
        {E.uwbAncillary}
      </label>
      <label style={label} title={session.ancillary ? E.uwbAncillaryFramesHint : E.uwbAncillaryFramesOff}>
        {E.uwbAncillaryFrames}{' '}
        {/* Clamped to the cap the round and the block actually leave (`uwbAncillaryFramesCapFor`),
            the same discipline the fixed reply-time field uses for its own window: a number field
            whose bounds are wider than the rule is a control that invites the refusal. The cap is
            computed even while the checkbox is off, so a value set first and switched on second is
            already inside it. */}
        <input type="number" min={1} max={ancillaryFramesCap ?? 1} step={1} value={session.ancillaryFrames}
          style={{ width: 62 }} disabled={!session.ancillary}
          onChange={(e) => onChange({
            ancillaryFrames: clampField(e.target.value, 1, ancillaryFramesCap ?? 1, true),
          })} />
      </label>
      <label style={label} title={E.uwbBlockHint}>
        {E.uwbBlock}{' '}
        <RstuInput value={session.blockRstu} lo={3} hi={6_000_000} onCommit={(blockRstu) => onChange({ blockRstu })} />
        <span style={suffix}>RSTU · {ms(session.blockRstu)} ms</span>
      </label>
      <label style={label} title={E.uwbSlotHint}>
        {E.uwbSlot}{' '}
        {/* Plain, like every other control: the slot is one of the fixed-reply window's own terms,
            and `onChange`'s reconciliation is what carries a stranded reply time with it rather
            than a patch of this field's own. */}
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
      {m2m && <div style={note}>{E.uwbM2mParticipants(participants)}</div>}
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
