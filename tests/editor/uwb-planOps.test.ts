import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { canDeleteNode, hasAp, newAnchor, newAp, newUwbTag, removeNode, uwbSessionIssue } from '../../src/editor/planOps'
import { GEN_FEATURES } from '../../src/model/caps'
import {
  DEFAULT_UWB_MMS, DEFAULT_UWB_SESSION, ScenarioSchema, UwbSsbdSchema, defaultScenario,
  type NodeCfg, type Scenario, type UwbMmsCfg, type UwbMode, type UwbSessionCfg,
} from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import { STRINGS } from '../../src/ui/i18n'
import {
  MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_FIXED_REPLY_RSTU_MAX, MMS_FIXED_REPLY_RSTU_MIN, MMS_SETS,
  mmsLayout, mmsSet, mmsSlotsPerMs, type MmsSetId,
} from '../../src/uwb/mms'
import { NB_CHANNELS } from '../../src/uwb/nb'
import { UWB_TX_POWER_DBM, rstuNs, uwbFixedReplyWindowRstu, uwbSlotsPerTag } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import {
  UwbSessionFields, mmsDraftLive, mmsFieldPatch, mmsFixedReplyHintKey, mmsReversedHintKey,
  mmsRsfSfdHintKey, mmsSetIdOf, mmsSetPatch, mmsSsbdHintKey, mmsUwbdControlHintKey, parseFixedReplyRstu,
  parseNbChannels, uwbAncillaryFramesCapFor, uwbAncillaryHintKey, uwbAoaHintKey, uwbAoaPatch,
  uwbMethodPatch, uwbMmrcrHintKey, uwbModePatch,
  uwbRcmValidityHintKey, uwbRcmValidityRoundsPatch, uwbReplyTimePatch, uwbReplyTimeRstuLive,
  uwbRmnrHintKey, uwbSchedulePatch, uwbScheduleHintKey, uwbSessionRepair, uwbSp3HintKey,
  uwbSrrrRaoaHintKey, uwbFixedReplyRstuFor, uwbSp3Patch,
  uwbSrrrRrttHintKey,
} from '../../src/uwb/ui/UwbSessionFields'
import { UwbNodeFields } from '../../src/uwb/ui/UwbNodeFields'

/** A scenario carrying `n` anchors and one tag on top of the default house. */
function withUwb(n: number, session: Partial<UwbSessionCfg> = {}): Scenario {
  let sc = defaultScenario()
  for (let i = 0; i < n; i++) sc = newAnchor(sc, { x: i, y: 0 }).sc
  sc = newUwbTag(sc, { x: 1, y: 1 }).sc
  return { ...sc, uwb: { ...DEFAULT_UWB_SESSION, ...session } }
}

describe('newAnchor / newUwbTag', () => {
  it('drops an anchor with the ranging defaults and opens a session', () => {
    const base = defaultScenario()
    expect(base.uwb).toBeUndefined()
    const { sc, id } = newAnchor(base, { x: 1.24, y: 2.06 })
    expect(id).toBe('anchor-1')
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n).toMatchObject({
      kind: 'uwb', name: 'Anchor 1', txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'], uwb: { role: 'anchor' },
    })
    // snapped to the 0.1 m grid; anchors sit high on the wall
    expect(n.pos.x).toBeCloseTo(1.2, 9)
    expect(n.pos.y).toBeCloseTo(2.1, 9)
    expect(n.pos.z).toBe(2.2)
    expect(n.caps).toEqual({ generation: 'nonht', features: {} })
    expect(sc.uwb).toEqual(DEFAULT_UWB_SESSION)
    expect(base.nodes).toHaveLength(defaultScenario().nodes.length) // pure
  })

  it('numbers anchors and tags per role and keeps ids unique', () => {
    const a1 = newAnchor(defaultScenario(), { x: 0, y: 0 })
    const a2 = newAnchor(a1.sc, { x: 1, y: 0 })
    expect(a2.id).toBe('anchor-2')
    const t1 = newUwbTag(a2.sc, { x: 2, y: 0 })
    expect(t1.id).toBe('uwb-1')
    const t2 = newUwbTag(t1.sc, { x: 3, y: 0 })
    expect(t2.id).toBe('uwb-2')
    expect(new Set(t2.sc.nodes.map((n) => n.id)).size).toBe(t2.sc.nodes.length)
  })

  it('gives a tag the role tag at head height', () => {
    const { sc, id } = newUwbTag(defaultScenario(), { x: 3, y: 3 })
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n.uwb).toEqual({ role: 'tag' })
    expect(n.name).toBe('UWB tag 1')
    expect(n.pos.z).toBe(1.0)
  })

  it('an anchor plus a tag is a scenario the schema accepts', () => {
    const sc = newUwbTag(newAnchor(defaultScenario(), { x: 0, y: 0 }).sc, { x: 2, y: 2 }).sc
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
  })

  it('reuses the session a second UWB node finds already open', () => {
    const one = newAnchor(defaultScenario(), { x: 0, y: 0 }).sc
    const tuned: Scenario = { ...one, uwb: { ...DEFAULT_UWB_SESSION, method: 'ss', channel: 5 } }
    expect(newUwbTag(tuned, { x: 1, y: 1 }).sc.uwb).toEqual(tuned.uwb)
  })
})

describe('uwbSessionIssue', () => {
  it('is null for the defaults and for a plan with no UWB at all', () => {
    expect(uwbSessionIssue(withUwb(4))).toBeNull()
    expect(uwbSessionIssue(defaultScenario())).toBeNull()
  })

  it('reports a ranging slot too short for the round', () => {
    // 300 RSTU is 250 µs; a 6-anchor DS round needs ~268 µs for its Final.
    const msg = uwbSessionIssue(withUwb(6, { slotRstu: 300 }))
    expect(msg).toContain('300 RSTU')
    expect(msg).toContain('slotRstu')
  })

  it('reports more anchors than a round can carry', () => {
    expect(uwbSessionIssue(withUwb(10))).toMatch(/9 .*anchor.*10/)
  })

  it('reports a block that cannot hold every tag', () => {
    let sc = withUwb(4, { blockRstu: 4800, slotRstu: 480 })
    sc = newUwbTag(sc, { x: 5, y: 5 }).sc
    expect(uwbSessionIssue(sc)).toMatch(/tag.*blockRstu/)
  })

  it('accepts what the session fields save for a contention round', () => {
    // The three fields the editor adds, at the bounds its inputs clamp to.
    const sc = withUwb(6, { method: 'ss', schedule: 'contention', contentionSlots: 16, maxAttempts: 5 })
    expect(uwbSessionIssue(sc)).toBeNull()
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
    expect(uwbSessionIssue(withUwb(6, { method: 'ss', schedule: 'contention', contentionSlots: 2, maxAttempts: 1 }))).toBeNull()
    expect(uwbSessionIssue(withUwb(6, { method: 'ss', schedule: 'contention', contentionSlots: 32, maxAttempts: 10 }))).toBeNull()
  })

  it('refuses a contention round on DS-TWR, which the method select is what keeps apart', () => {
    // The field disables the schedule under DS-TWR and drops back to 'time' when the
    // method changes; a file that carries the pair anyway is rejected here.
    const bad = withUwb(6, { method: 'ds', schedule: 'contention' })
    expect(ScenarioSchema.safeParse(bad).success).toBe(false)
    expect(uwbSessionIssue(bad)).toMatch(/SS-TWR|contention/i)
  })

  it('round-trips the one-way mode and its two knobs through a valid session', () => {
    // What the three new fields of the session section produce: the mode select's patch, the
    // DL-only clock-correction checkbox and the UL-only sync error. Each survives the schema
    // unchanged, and a four-anchor time-scheduled session takes all of them without complaint.
    const uplink = withUwb(4, { ...uwbModePatch('ul-tdoa'), syncErrorNs: 1 })
    expect(uwbSessionIssue(uplink)).toBeNull()
    expect(ScenarioSchema.parse(uplink).uwb)
      .toEqual({ ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', schedule: 'time', syncErrorNs: 1 })
    const downlink = withUwb(4, { ...uwbModePatch('dl-tdoa'), tdoaClockCorrection: false })
    expect(uwbSessionIssue(downlink)).toBeNull()
    expect(ScenarioSchema.parse(downlink).uwb)
      .toEqual({ ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', schedule: 'time', tdoaClockCorrection: false })
  })

  it('round-trips the angle-of-arrival checkbox and an anchor’s facing', () => {
    // The two fields slice 6 adds to the editor: a session-wide checkbox, and a yaw on the
    // anchor whose array it turns. Both survive the schema unchanged, and the yaw is optional —
    // an anchor that has never been turned carries no field at all and faces +x.
    const sc = withUwb(1, { aoa: true })
    const turned: Scenario = {
      ...sc,
      nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, uwb: { role: 'anchor' as const, yawDeg: 90 } } : n)),
    }
    expect(uwbSessionIssue(turned)).toBeNull()
    const parsed = ScenarioSchema.parse(turned)
    expect(parsed.uwb).toEqual({ ...DEFAULT_UWB_SESSION, aoa: true })
    expect(parsed.nodes.find((n) => n.id === 'anchor-1')!.uwb).toEqual({ role: 'anchor', yawDeg: 90 })
    expect(parsed.nodes.find((n) => n.id === 'uwb-1')!.uwb).toEqual({ role: 'tag' })
    // A session saved before the checkbox existed reads as off, not as undefined.
    const { aoa: _dropped, ...legacy } = DEFAULT_UWB_SESSION
    expect(ScenarioSchema.parse({ ...sc, uwb: legacy }).uwb!.aoa).toBe(false)
    // …and the field the editor clamps to ±180 is the field the schema accepts.
    for (const yawDeg of [-180, 0, 180]) {
      expect(ScenarioSchema.safeParse({
        ...sc, nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, uwb: { role: 'anchor', yawDeg } } : n)),
      }).success).toBe(true)
    }
    expect(ScenarioSchema.safeParse({
      ...sc, nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, uwb: { role: 'anchor', yawDeg: 181 } } : n)),
    }).success).toBe(false)
  })

  it('takes a contention session back to the time schedule when a one-way mode is picked', () => {
    // Exactly what the method select does for DS-TWR: the schema takes a one-way round in a
    // time-scheduled session only, so the field changes the pair together rather than leaving
    // the user a plan it rejects, with the fix two fields away.
    const contending: Partial<UwbSessionCfg> = { method: 'ss', schedule: 'contention' }
    expect(uwbSessionIssue(withUwb(4, { ...contending, mode: 'ul-tdoa' }))).toBeTruthy()
    expect(uwbModePatch('ul-tdoa')).toEqual({
      mode: 'ul-tdoa', schedule: 'time', aoa: false, rcmValidityRounds: 1, rmnr: false, mmrcr: false, sp3: false,
    })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbModePatch('ul-tdoa') }))).toBeNull()
    // Going back to two-way ranging touches the mode alone: the schedule is the user's again.
    expect(uwbModePatch('twr')).toEqual({ mode: 'twr' })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbModePatch('twr') }))).toBeNull()
  })

  it('refuses angle of arrival outside two-way ranging, and the mode select clears it', () => {
    // A bearing is measured on a frame the tag sends the anchor, and a one-way round has none:
    // in DL-TDoA the tag never transmits, in UL-TDoA its blink is answered by nobody. The engine
    // already ignored the flag there, so the schema now refuses the pair instead of letting a
    // hand-edited plan carry a setting that does nothing.
    for (const mode of ['dl-tdoa', 'ul-tdoa', 'mms'] as const) {
      const bad = withUwb(4, { mode, aoa: true })
      expect(ScenarioSchema.safeParse(bad).success, mode).toBe(false)
      expect(uwbSessionIssue(bad), mode).toContain('AoA')
    }
    // and the field the user actually touches never produces that pair
    expect(uwbModePatch('dl-tdoa')).toEqual({
      mode: 'dl-tdoa', schedule: 'time', aoa: false, rcmValidityRounds: 1, rmnr: false, mmrcr: false, sp3: false,
    })
    expect(uwbSessionIssue(withUwb(4, { aoa: true, ...uwbModePatch('dl-tdoa') }))).toBeNull()
    // two-way ranging keeps the checkbox the user's own
    expect(uwbModePatch('twr').aoa).toBeUndefined()
    expect(uwbSessionIssue(withUwb(4, { aoa: true, ...uwbModePatch('twr') }))).toBeNull()
  })

  it('takes an MMS session to the time schedule and clears the bearing, like the one-way modes', () => {
    // An MMS round is laid out pair by pair before the block starts, and its ranging signal is
    // a train of sequences with no frame to measure a bearing on — the same two settings the
    // one-way modes move. It moves two more of its own: single-sided, because a train already
    // hands the receiver the clock the second half of a double-sided exchange is for, and the
    // draft's own 600 RSTU slot (4ab 15-22/0381r5 Table 1.2.3.2), which is what makes the round
    // the 28-slot, 14 ms one the Guide describes.
    expect(uwbModePatch('mms')).toEqual({
      mode: 'mms', schedule: 'time', aoa: false, method: 'ss', slotRstu: 600,
      rcmValidityRounds: 1, rmnr: false, mmrcr: false, sp3: false,
    })
    const contending: Partial<UwbSessionCfg> = { method: 'ss', schedule: 'contention', aoa: true }
    // Three anchors and one tag: an MMS round is pairwise, and the default block holds three.
    expect(uwbSessionIssue(withUwb(3, { ...contending, mode: 'mms' }))).toMatch(/MMS/)
    expect(uwbSessionIssue(withUwb(3, { ...contending, ...uwbModePatch('mms') }))).toBeNull()
  })

  it('the MMS patch lands the draft’s own 28-slot, 14 ms round', () => {
    const sc = withUwb(3, uwbModePatch('mms'))
    const session = ScenarioSchema.parse(sc).uwb!
    expect(session.slotRstu).toBe(600)
    expect(session.method).toBe('ss')
    // 4 control + 20 ranging + 4 report slots at 0.5 ms each, the draft's example round.
    const plan = roundPlan(session, 3)
    expect(plan.slots).toBe(28)
    expect(plan.roundNs).toBe(14_000_000)
    // …and the session default itself is untouched, which is what keeps every shipped scene
    // byte-identical: this is what *picking the mode* means, not what a session is.
    expect(DEFAULT_UWB_SESSION.slotRstu).toBe(2400)
    expect(DEFAULT_UWB_SESSION.method).toBe('ds')
  })

  it('leaves the slot and the method alone in every other mode', () => {
    for (const mode of ['twr', 'dl-tdoa', 'ul-tdoa'] as const) {
      const patch = uwbModePatch(mode)
      expect(patch.slotRstu, mode).toBeUndefined()
      expect(patch.method, mode).toBeUndefined()
    }
  })

  /**
   * SSBD (task 5, standard §10.45): the mode select is the only place a session-level control ever
   * has to reach into `mms` itself — §10.39.8.3 scopes the algorithm to clause 10.39/10.44, so the
   * schema refuses `ssbd` outright the moment `mode` is anything but `'mms'`. Mirrors the shape
   * `uwbModePatch`'s other resets already use: the empty patch when nothing is owed.
   */
  it('nulls a live ssbd the moment the mode select leaves MMS, and leaves it alone coming back', () => {
    const on: UwbMmsCfg = { ...DEFAULT_UWB_SESSION.mms, ssbd: UwbSsbdSchema.parse({}) }
    for (const mode of ['twr', 'dl-tdoa', 'ul-tdoa', 'm2m'] as const) {
      const patch = uwbModePatch(mode, 1, false, { raoa: false, rrtt: false }, on)
      expect(patch.mms, mode).toEqual({ ...on, ssbd: null })
      expect(uwbSessionIssue(withUwb(4, { mode, mms: { ...on, ssbd: null } }))).toBeNull()
    }
    // Already off, nothing is owed — the same "no field it does not change" discipline every other
    // reset in this function keeps.
    const off: UwbMmsCfg = DEFAULT_UWB_SESSION.mms
    for (const mode of ['twr', 'dl-tdoa', 'ul-tdoa', 'm2m'] as const) {
      expect(uwbModePatch(mode, 1, false, { raoa: false, rrtt: false }, off).mms, mode).toBeUndefined()
    }
    // Re-entering MMS never touches mms.ssbd at all — there is nothing left to null by the time
    // the mode select could move back.
    expect(uwbModePatch('mms', 1, false, { raoa: false, rrtt: false }, on).mms).toBeUndefined()
  })

  it('the method select patches the schedule with it, both ways', () => {
    // The same invariant as the mode select, in the pure helper the field calls: the editor can
    // never leave the plan in the pair the schema rejects.
    const contending: Partial<UwbSessionCfg> = { method: 'ss', schedule: 'contention' }
    expect(uwbMethodPatch('ds', 'embedded')).toEqual({ method: 'ds', schedule: 'time' })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbMethodPatch('ds', 'embedded') }))).toBeNull()
    // going back to SS-TWR leaves the schedule alone: it is the user's field again
    expect(uwbMethodPatch('ss', 'embedded')).toEqual({ method: 'ss' })
    expect(uwbSessionIssue(withUwb(4, { ...contending, ...uwbMethodPatch('ss', 'embedded') }))).toBeNull()
  })

  it('the method select also takes a stranded fixed reply time with it into DS-TWR', () => {
    // Reachable through the UI without the reply-time select ever offering the illegal pair
    // itself: pick 'fixed' while on SS-TWR (legal), then switch the method to DS-TWR. Left alone,
    // the session would land on the one pair the standard does not define (§10.29.6.3–.7).
    expect(uwbMethodPatch('ds', 'fixed')).toEqual({ method: 'ds', schedule: 'time', replyTime: 'embedded' })
    expect(uwbSessionIssue(withUwb(4, { method: 'ss', replyTime: 'fixed', ...uwbMethodPatch('ds', 'fixed') })))
      .toBeNull()
    // 'deferred' is a legal DS-TWR shape and is left alone.
    expect(uwbMethodPatch('ds', 'deferred')).toEqual({ method: 'ds', schedule: 'time' })
  })

  it('the schedule select takes a stranded deferred reply time with it into contention', () => {
    // The mirror case: 'deferred' is legal on SS-TWR/time (its own extra slot per anchor), but a
    // contention round's responder has no fixed slot to defer into (design §3.1).
    expect(uwbSchedulePatch('contention', 'deferred', false)).toEqual({ schedule: 'contention', replyTime: 'embedded' })
    expect(uwbSessionIssue(withUwb(4, {
      method: 'ss', replyTime: 'deferred', ...uwbSchedulePatch('contention', 'deferred', false),
    }))).toBeNull()
    // 'fixed' is the one shape contention is meant to allow, and is left alone.
    expect(uwbSchedulePatch('contention', 'fixed', false)).toEqual({ schedule: 'contention' })
    // Time scheduling never touches the reply time at all.
    expect(uwbSchedulePatch('time', 'deferred', false)).toEqual({ schedule: 'time' })
  })

  it('the schedule select takes a stranded rmnr with it into contention too (design §4, Task 5)', () => {
    // A finding of the same shape as the mode select's: rmnr + a contention schedule is one of
    // the schema's six refusals, and nothing stopped the schedule select from landing on it before
    // this patch — a responder's contention slot is drawn fresh every round, never read off a
    // still-valid control message, so switching into contention takes rmnr with it, the same
    // direction this function already takes a stranded deferred reply time.
    expect(uwbSchedulePatch('contention', 'embedded', true)).toEqual({ schedule: 'contention', rmnr: false })
    expect(uwbSessionIssue(withUwb(4, {
      method: 'ss', rcmValidityRounds: 4, rmnr: true, ...uwbSchedulePatch('contention', 'embedded', true),
    }))).toBeNull()
    // rmnr off is left alone, and so is time scheduling.
    expect(uwbSchedulePatch('contention', 'embedded', false)).toEqual({ schedule: 'contention' })
    expect(uwbSchedulePatch('time', 'embedded', true)).toEqual({ schedule: 'time' })
  })

  describe('uwbReplyTimePatch: an illegal combination is not committed', () => {
    it('refuses fixed beside DS-TWR', () => {
      expect(uwbReplyTimePatch('fixed', 'ds', 'time')).toBeNull()
      // the same shape is legal on SS-TWR
      expect(uwbReplyTimePatch('fixed', 'ss', 'time')).toEqual({ replyTime: 'fixed' })
    })

    it('refuses deferred beside a contention schedule', () => {
      expect(uwbReplyTimePatch('deferred', 'ss', 'contention')).toBeNull()
      // the same shape is legal on a time-scheduled round
      expect(uwbReplyTimePatch('deferred', 'ss', 'time')).toEqual({ replyTime: 'deferred' })
    })

    it('allows every other combination, including contention + fixed — the one contention most needs', () => {
      expect(uwbReplyTimePatch('fixed', 'ss', 'contention')).toEqual({ replyTime: 'fixed' })
      expect(uwbReplyTimePatch('embedded', 'ds', 'time')).toEqual({ replyTime: 'embedded' })
      expect(uwbReplyTimePatch('deferred', 'ds', 'time')).toEqual({ replyTime: 'deferred' })
    })

    it('never returns a patch the schema refuses, for any reachable combination', () => {
      for (const replyTime of ['embedded', 'deferred', 'fixed'] as const) {
        for (const method of ['ss', 'ds'] as const) {
          // ds + contention is refused for an older, unrelated reason (no contention window for
          // DS-TWR's report phase) — not this field's business, so it is excluded here the same
          // way the method select already keeps the pair apart in the UI.
          for (const schedule of method === 'ds' ? (['time'] as const) : (['time', 'contention'] as const)) {
            const patch = uwbReplyTimePatch(replyTime, method, schedule)
            if (!patch) continue
            expect(uwbSessionIssue(withUwb(4, { method, schedule, ...patch })), `${replyTime}/${method}/${schedule}`)
              .toBeNull()
          }
        }
      }
    })
  })

  describe('uwbReplyTimeRstuLive: the fixed reply-time RSTU field is live only under fixed', () => {
    it('is true for fixed and false for the other two shapes', () => {
      expect(uwbReplyTimeRstuLive('fixed')).toBe(true)
      expect(uwbReplyTimeRstuLive('embedded')).toBe(false)
      expect(uwbReplyTimeRstuLive('deferred')).toBe(false)
    })
  })

  it('still needs four anchors for a one-way mode, which no field can patch away', () => {
    expect(uwbSessionIssue(withUwb(3, uwbModePatch('ul-tdoa')))).toMatch(/4 .*anchor/)
  })

  it('reports a UWB node left without a session', () => {
    const sc = withUwb(2)
    expect(uwbSessionIssue({ ...sc, uwb: undefined })).toContain('scenario.uwb')
  })

  it('ignores an issue that has nothing to do with ranging', () => {
    const sc = withUwb(2)
    const noAp: Scenario = { ...sc, nodes: sc.nodes.filter((n) => n.kind !== 'ap') }
    expect(ScenarioSchema.safeParse(noAp).success).toBe(false) // the stations lost their AP
    expect(uwbSessionIssue(noAp)).toBeNull()
  })

  it('claims a bound on a session field, whose message never says UWB', () => {
    const msg = uwbSessionIssue(withUwb(4, { slotRstu: 3 }))
    expect(msg).toContain('300') // path ['uwb', 'slotRstu']
    expect(msg).not.toMatch(/UWB|ranging/i)
  })

  it('claims a field issue on a ranging device', () => {
    const sc = withUwb(2)
    const bad: Scenario = {
      ...sc,
      nodes: sc.nodes.map((n) => (n.kind === 'uwb' ? { ...n, txPowerDbm: 'loud' as unknown as number } : n)),
    }
    expect(uwbSessionIssue(bad)).toBeTruthy()
  })

  it('is what the schema paths say, not what the messages word: every session rule is rooted at uwb', () => {
    // The match is by path, so each rule has to carry one; a coexistence rule that merely
    // mentions UWB on a Wi-Fi path must not be dragged under the session section.
    const cases: Scenario[] = [
      withUwb(10), // more anchors than a round carries
      withUwb(6, { slotRstu: 300 }), // slot too short for the Final
      { ...withUwb(4), nodes: withUwb(4).nodes.filter((n) => n.uwb?.role !== 'tag') }, // no tag
      { ...withUwb(2), uwb: undefined }, // nodes without a session
    ]
    for (const sc of cases) {
      const parsed = ScenarioSchema.safeParse(sc)
      expect(parsed.success).toBe(false)
      if (parsed.success) continue
      expect(parsed.error.issues.length).toBeGreaterThan(0)
      for (const i of parsed.error.issues) expect(i.path[0], i.message).toBe('uwb')
      // …which is how the editor finds it, whatever the sentence says
      expect(uwbSessionIssue(sc)).toBeTruthy()
    }
  })
})

describe('MMS parameter-set select', () => {
  it('names the set the five PHY fields are, and "custom" for anything else', () => {
    // The select stores nothing: it is derived from the fields every time, so editing one field
    // of a set drops the select to "custom" without any extra state to keep in step.
    for (const id of Object.keys(MMS_SETS) as MmsSetId[]) {
      expect(mmsSetIdOf(MMS_SETS[id]), id).toBe(id)
    }
    // The session default is the draft's cycle default (X = 8, N_MSR 40, gap 64), not a
    // mandatory set — so the select opens on "custom".
    expect(mmsSetIdOf(DEFAULT_UWB_SESSION.mms)).toBeNull()
    // …and one field off a set is no longer that set.
    expect(mmsSetIdOf({ ...MMS_SETS['rsf-1'], gap: 34 })).toBeNull()
    expect(mmsSetIdOf({ ...MMS_SETS['mixed-7'], rifs: 4 })).toBeNull()
    // Z is compared too, although every set carries the same Z = 1: a session at Z = 2 is not
    // the set, and the select must not say it is.
    expect(mmsSetIdOf({ ...MMS_SETS['rsf-1'], gapMs: 2 })).toBeNull()
  })

  it('writes the set’s five PHY fields plus Z = 1, and the result is a session the schema takes', () => {
    const patch = mmsSetPatch('rsf-1')
    // The set's train and nothing else: a set fixes the fragment parameters, so picking one
    // must leave the five draft features of the session it is written into alone.
    const set = mmsSet('rsf-1')
    expect(patch).toEqual({
      rsfs: set.rsfs, rifs: set.rifs, nMsr: set.nMsr, gap: set.gap, stsLen: set.stsLen, gapMs: 1,
    })
    expect(patch).toMatchObject({ rsfs: 16, rifs: 0, nMsr: 40, gap: 33, stsLen: 64, gapMs: 1 })
    // What the field actually saves: the patch over the session's own narrowband settings.
    const sc = withUwb(1, {
      ...uwbModePatch('mms'),
      slotRstu: 600,
      blockRstu: 240_000,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...mmsSetPatch('rsf-1') },
    })
    expect(uwbSessionIssue(sc)).toBeNull()
    expect(ScenarioSchema.parse(sc).uwb!.mms).toMatchObject({ rsfs: 16, nMsr: 40, gap: 33, nbChannels: [3] })
    expect(mmsSetIdOf(ScenarioSchema.parse(sc).uwb!.mms)).toBe('rsf-1')
    // Every mandatory set is a set the schema accepts at the draft's slot length.
    for (const id of Object.keys(MMS_SETS) as MmsSetId[]) {
      const one = withUwb(1, {
        ...uwbModePatch('mms'),
        slotRstu: 600,
        blockRstu: 240_000,
        mms: { ...DEFAULT_UWB_SESSION.mms, ...mmsSetPatch(id) },
      })
      expect(uwbSessionIssue(one), id).toBeNull()
    }
  })
})

/**
 * A disabled field's tooltip is the only place the editor explains itself, so a wrong one is
 * worse than none. Adding MMS made the two one-way reasons false in a mode that is neither
 * one-way nor missing a transmitting tag, which is what these pin — by key, and then by what the
 * two languages of that key may and may not say.
 */
describe('why a field is greyed out', () => {
  const MODES: UwbMode[] = ['twr', 'dl-tdoa', 'ul-tdoa', 'mms', 'm2m']

  it('gives the angle-of-arrival checkbox a reason that fits the mode', () => {
    expect(MODES.map(uwbAoaHintKey))
      .toEqual(['uwbAoaHint', 'uwbAoaTwrOnly', 'uwbAoaTwrOnly', 'uwbAoaMms', 'uwbAoaM2m'])
  })

  it('gives the schedule select a reason that fits the mode and the method', () => {
    expect(MODES.map((m) => uwbScheduleHintKey(m, 'ss')))
      .toEqual(['uwbScheduleHint', 'uwbTwrOnly', 'uwbTwrOnly', 'uwbScheduleMms', 'uwbScheduleM2m'])
    // DS-TWR is the older reason and still wins in the modes that allow the method at all;
    // in MMS and in many-to-many the mode's own reason comes first, since both disable the
    // schedule select regardless of method.
    expect(MODES.map((m) => uwbScheduleHintKey(m, 'ds')))
      .toEqual(['uwbSsOnly', 'uwbSsOnly', 'uwbSsOnly', 'uwbScheduleMms', 'uwbScheduleM2m'])
  })

  it('does not tell an MMS user that the tag never transmits or that the range is one-way', () => {
    const E = STRINGS.editor
    for (const key of ['uwbAoaMms', 'uwbScheduleMms'] as const) {
      expect(E[key], key).toBeTruthy()
      // The claims the one-way strings make, which are what made them wrong here.
      expect(E[key], key).not.toMatch(/one-way|单向/)
      expect(E[key], key).not.toMatch(/never transmits|从不发射|根本不发射/)
    }
    // …and each says the thing that is actually true of MMS.
    expect(E.uwbAoaMms).toMatch(/双向/)
    expect(E.uwbScheduleMms).toMatch(/块开始之前/)
  })

  it('does not tell a many-to-many user that the tag never transmits or that the round is one-way', () => {
    const E = STRINGS.editor
    for (const key of ['uwbAoaM2m', 'uwbScheduleM2m'] as const) {
      expect(E[key], key).toBeTruthy()
      expect(E[key], key).not.toMatch(/one-way|单向/)
      expect(E[key], key).not.toMatch(/never transmits|从不发射|根本不发射/)
    }
    // …and each says the thing that is actually true of many-to-many: no anchor, no tag, every
    // slot already spoken for (design §5).
    expect(E.uwbAoaM2m).toMatch(/没有锚点/)
    expect(E.uwbAoaM2m).toMatch(/没有标签/)
    expect(E.uwbScheduleM2m).toMatch(/已经排给了确定的参与者/)
  })
})

/**
 * Task 5: the `m2m` option in the mode select, and what picking it commits (design §5). The
 * schema's own many-to-many rules (`model/scenario.ts`, Tasks 1–4) are not re-tested here — only
 * what this file's own helpers and components do with them.
 */
describe('many-to-many mode in the editor (design §5)', () => {
  it('locks the schedule, the bearing and the reply time together, like the one-way modes plus one', () => {
    expect(uwbModePatch('m2m')).toEqual({
      mode: 'm2m', schedule: 'time', aoa: false, replyTime: 'embedded', rcmValidityRounds: 1, rmnr: false, sp3: false,
    })
  })

  it('takes a contention, deferred-reply session cleanly into many-to-many', () => {
    // Every field the schema refuses beside `mode: 'm2m'`, all stranded on the session at once —
    // exactly what a user switching modes without touching them first would leave behind.
    // (replyTime: 'fixed' rather than 'deferred', so the baseline itself is legal under twr: a
    // contention round has no fixed slot for a deferred follow-up to go to — a rule of its own,
    // independent of many-to-many's.)
    const stranded: Partial<UwbSessionCfg> = { method: 'ss', schedule: 'contention', replyTime: 'fixed', aoa: true }
    expect(uwbSessionIssue(withUwb(4, stranded))).toBeNull() // the stranded fields are legal under twr
    expect(uwbSessionIssue(withUwb(4, { ...stranded, mode: 'm2m' }))).toBeTruthy()
    expect(uwbSessionIssue(withUwb(4, { ...stranded, ...uwbModePatch('m2m') }))).toBeNull()
    expect(ScenarioSchema.safeParse(withUwb(4, { ...stranded, ...uwbModePatch('m2m') })).success).toBe(true)
  })

  it('refuses the bearing outside two-way ranging for its own, many-to-many-specific reason', () => {
    // Not the one-way modes' "AoA" wording (`到达角` here, never that literal string) — the schema
    // says there is no anchor and no tag at all, which is why this is checked apart from the
    // shared `['dl-tdoa', 'ul-tdoa', 'mms']` loop above rather than folded into it.
    const bad = withUwb(4, { mode: 'm2m', aoa: true })
    expect(ScenarioSchema.safeParse(bad).success).toBe(false)
    const msg = uwbSessionIssue(bad)
    expect(msg).toContain('到达角')
    expect(msg).not.toContain('AoA')
    expect(uwbSessionIssue(withUwb(4, { aoa: true, ...uwbModePatch('m2m') }))).toBeNull()
  })

  it('every UWB node is a participant, not just the ones drawn as anchors — the plan line reads all of them', () => {
    // Two anchors and three tags: a two-way round would plan for 2 anchors, but a many-to-many
    // round holds every device (design §5) — 5 participants, 5 SS slots.
    let sc = defaultScenario()
    for (let i = 0; i < 2; i++) sc = newAnchor(sc, { x: i, y: 0 }).sc
    for (let i = 0; i < 3; i++) sc = newUwbTag(sc, { x: i, y: 1 }).sc
    sc = { ...sc, uwb: { ...DEFAULT_UWB_SESSION, ...uwbModePatch('m2m'), method: 'ss' } }
    expect(uwbSessionIssue(sc)).toBeNull()
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 2, tags: 3, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    // roundPlan(session, 5).slots for SS many-to-many is exactly 5 — the plan the round the network
    // would actually run, not `roundPlan(session, 2)`'s 2 (the bug a plan line reading `anchors`
    // alone would have shown here).
    expect(markup).toContain(STRINGS.editor.uwbPlan(5, 1))
    expect(markup).not.toContain(STRINGS.editor.uwbPlan(2, 1))
    expect(markup).toContain(STRINGS.editor.uwbM2mParticipants(5))
  })

  it('locks the reply-time select to embedded, with its own reason, distinct from MMS’s', () => {
    const sc = withUwb(4, uwbModePatch('m2m'))
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(STRINGS.editor.uwbReplyTimeM2mOnly)
    expect(markup).not.toContain(STRINGS.editor.uwbReplyTimeMmsOnly)
  })

  it('tells the reader in UwbNodeFields that the role is drawing-only under many-to-many', () => {
    const node = { ...withUwb(1).nodes.find((n) => n.uwb?.role === 'anchor')! }
    const twr = renderToStaticMarkup(createElement(UwbNodeFields, { node, mode: 'twr', onChange: () => {} }))
    const m2m = renderToStaticMarkup(createElement(UwbNodeFields, { node, mode: 'm2m', onChange: () => {} }))
    expect(twr).not.toContain(STRINGS.editor.uwbRoleM2mNote)
    expect(m2m).toContain(STRINGS.editor.uwbRoleM2mNote)
  })
})

describe('parseNbChannels', () => {
  it('takes a comma-separated allow list the schema would accept', () => {
    expect(parseNbChannels('100,150,200,210')).toEqual([100, 150, 200, 210])
    // whitespace around the numbers is the user's, not the list's
    expect(parseNbChannels(' 3 ')).toEqual([3])
    expect(parseNbChannels('0, 49,50 , 249')).toEqual([0, 49, 50, 249])
  })

  it('rejects anything the schema would reject, so the field can keep the last good list', () => {
    for (const bad of ['3, x', '', '   ', '3,,4', '3.5', '250', '-1', '3,3', ' , ', '1e2']) {
      expect(parseNbChannels(bad), bad).toBeNull()
    }
    expect(parseNbChannels(`${NB_CHANNELS - 1}`)).toEqual([NB_CHANNELS - 1])
    expect(parseNbChannels(`${NB_CHANNELS}`)).toBeNull()
  })

  it('agrees with the schema on every list it accepts and every list it refuses', () => {
    const session = (nbChannels: number[]): Scenario => withUwb(1, {
      ...uwbModePatch('mms'),
      slotRstu: 600,
      blockRstu: 240_000,
      mms: { ...DEFAULT_UWB_SESSION.mms, nbChannels },
    })
    for (const good of ['3', '100,150,200,210', '0,249']) {
      expect(uwbSessionIssue(session(parseNbChannels(good)!)), good).toBeNull()
    }
    // The lists the parser refuses are exactly the ones the schema complains about.
    for (const bad of [[], [3, 3], [250], [-1], [1.5]]) {
      expect(uwbSessionIssue(session(bad)), JSON.stringify(bad)).toMatch(/1…250.*0…249/)
    }
  })
})

/**
 * The seven P802.15.4ab draft-feature controls (task 5 adds `ssbd`, standard §10.45, as the
 * seventh). Every one of them is legal only beside certain values of the others, and the schema is
 * the authority on which — so these tests ask the schema rather than a written-out expectation:
 * what the editor greys out is exactly what the schema refuses, and every state the controls can
 * reach is a state the schema takes. Wording is not tested anywhere here; the strings only have to
 * exist.
 */
describe('the MMS draft-feature controls', () => {
  const cfg = (patch: Partial<UwbMmsCfg> = {}): UwbMmsCfg => ({ ...DEFAULT_UWB_SESSION.mms, ...patch })
  /**
   * An MMS plan at the draft's own 600 RSTU slot with one anchor and one tag, so the only thing
   * the schema can object to is the MMS settings themselves. The block is the default 240 000
   * RSTU, which holds even the non-interleaved round (48 slots against the interleaved 28).
   */
  const plan = (patch: Partial<UwbMmsCfg> = {}): Scenario => withUwb(1, {
    ...uwbModePatch('mms'), slotRstu: 600, blockRstu: 240_000, mms: cfg(patch),
  })

  /** The narrowband pair as Config 1 has to leave them — nothing for them to act on there. */
  const UWBD: Partial<UwbMmsCfg> = { control: 'uwbd', nbChannels: [], nbLbt: 'off' }

  it('greys out exactly what the schema refuses, on every combination of the fields involved', () => {
    /** What switching each gated control on would write. */
    const ON: [keyof ReturnType<typeof mmsDraftLive>, Partial<UwbMmsCfg>][] = [
      ['rsfSfd', { rsfSfd: true }],
      ['fixedReply', { fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT }],
      ['reversedOrder', { reversedOrder: true }],
      ['uwbdControl', { uwbdControl: 'none' }],
      ['ssbd', { ssbd: UwbSsbdSchema.parse({}) }],
    ]
    let checked = 0
    for (const control of ['nba', 'uwbd'] as const) {
      for (const nonInterleaved of [false, true]) {
        for (const reversedOrder of [false, true]) {
          for (const oneToMany of [false, true]) {
            for (const nMsr of [32, 40] as const) {
              const base: Partial<UwbMmsCfg> = {
                control, nonInterleaved, reversedOrder, oneToMany, nMsr,
                ...(control === 'uwbd'
                  ? { nbChannels: [], nbLbt: 'off' as const }
                  : { nbChannels: [3], nbLbt: 'auto' as const }),
              }
              // A base the schema already refuses would make the comparison below meaningless:
              // the issue it returns would be the base's, not the switched-on control's.
              if (uwbSessionIssue(plan(base)) !== null) continue
              const live = mmsDraftLive(cfg(base))
              for (const [name, on] of ON) {
                const taken = uwbSessionIssue(plan({ ...base, ...on })) === null
                expect(live[name], `${name} @ ${JSON.stringify(base)}`).toBe(taken)
                checked++
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('greys out the fixed reply time and the reversed order in an interleaved round', () => {
    // Interleaved, the two ends put a fragment each into the same millisecond: there is no
    // "finished receiving the packet" to time a reply from and no "who goes first" to swap.
    const interleaved = cfg({ nonInterleaved: false })
    expect(mmsDraftLive(interleaved).fixedReply).toBe(false)
    expect(mmsDraftLive(interleaved).reversedOrder).toBe(false)
    const both = cfg({ nonInterleaved: true })
    expect(mmsDraftLive(both).fixedReply).toBe(true)
    expect(mmsDraftLive(both).reversedOrder).toBe(true)
  })

  it('greys out RSF-with-SFD outside the UWB-driven control plane and away from N_MSR 32/64', () => {
    expect(mmsDraftLive(cfg({ nMsr: 32 })).rsfSfd).toBe(false) // Config 2: no packet SYNC+SFD to drop
    for (const nMsr of [32, 64] as const) expect(mmsDraftLive(cfg({ ...UWBD, nMsr })).rsfSfd).toBe(true)
    for (const nMsr of [40, 48, 128, 256] as const) expect(mmsDraftLive(cfg({ ...UWBD, nMsr })).rsfSfd).toBe(false)
  })

  /**
   * SSBD's own two refusals (task 5, standard §10.45): the base matrix above ties `nbLbt` to
   * `control` (Config 1 always carries `nbLbt: 'off'`), so it never exercises the half of the
   * refusal that fires with `control: 'nba'` — the one `UwbMmsSchema`'s own `superRefine` gives a
   * different reason for. This is that half, confirmed both ways: live under Config 2 with
   * listen-before-talk on, dead with it off, and `mmsFieldPatch` nulls a live `ssbd` the instant
   * either edit lands, not just when the panel happens to be looking.
   */
  it('greys out SSBD when listen-before-talk is off, even under Config 2 (the half the base matrix above never turns)', () => {
    expect(mmsDraftLive(cfg({ nbLbt: 'auto' })).ssbd).toBe(true)
    expect(mmsDraftLive(cfg({ nbLbt: 'on' })).ssbd).toBe(true)
    expect(mmsDraftLive(cfg({ nbLbt: 'off' })).ssbd).toBe(false)
    expect(mmsDraftLive(cfg(UWBD)).ssbd).toBe(false)
    const on = cfg({ ssbd: UwbSsbdSchema.parse({}) })
    expect(uwbSessionIssue(plan(on))).toBeNull()
    expect({ ...on, ...mmsFieldPatch(on, { nbLbt: 'off' }) }.ssbd).toBeNull()
    expect({ ...on, ...mmsFieldPatch(on, { control: 'uwbd' }) }.ssbd).toBeNull()
    // Leaving the refused state is not the same as never entering it: once ssbd is already off,
    // the same two edits must not reach for a field that is not there.
    const off = cfg()
    expect(mmsFieldPatch(off, { nbLbt: 'off' })).not.toHaveProperty('ssbd')
    expect(mmsFieldPatch(off, { control: 'uwbd' })).not.toHaveProperty('ssbd')
  })

  it('gives every greyed-out control the reason it is greyed out, and every reason a string', () => {
    const keys = [
      mmsRsfSfdHintKey(cfg({ nMsr: 32 })),
      mmsRsfSfdHintKey(cfg({ ...UWBD, nMsr: 40 })),
      mmsRsfSfdHintKey(cfg({ ...UWBD, nMsr: 32 })),
      mmsFixedReplyHintKey(cfg({ nonInterleaved: false })),
      mmsFixedReplyHintKey(cfg({ nonInterleaved: true, oneToMany: true })),
      mmsFixedReplyHintKey(cfg({ nonInterleaved: true, reversedOrder: true })),
      mmsFixedReplyHintKey(cfg({ nonInterleaved: true })),
      mmsReversedHintKey(cfg({ nonInterleaved: false })),
      mmsReversedHintKey(cfg({ nonInterleaved: true, fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT })),
      mmsReversedHintKey(cfg({ nonInterleaved: true })),
      mmsUwbdControlHintKey(cfg()),
      mmsUwbdControlHintKey(cfg(UWBD)),
      mmsSsbdHintKey(cfg({ nbLbt: 'auto' })),
      mmsSsbdHintKey(cfg(UWBD)),
      mmsSsbdHintKey(cfg({ nbLbt: 'off' })),
    ]
    // Each control distinguishes its reasons: a wrong reason is worse than none, which is what
    // `uwbAoaHintKey` above pins for the modes.
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(STRINGS.editor[k], k).toBeTruthy()
  })

  it('never lets the controls reach a plan the schema rejects', () => {
    /** Every value each control can write. */
    const EDITS: Partial<UwbMmsCfg>[] = [
      { control: 'nba' }, { control: 'uwbd' },
      { uwbdControl: 'sp0' }, { uwbdControl: 'none' },
      { nonInterleaved: true }, { nonInterleaved: false },
      { reversedOrder: true }, { reversedOrder: false },
      { rsfSfd: true }, { rsfSfd: false },
      { fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT }, { fixedReplyRstu: null },
      { oneToMany: true }, { oneToMany: false },
      { nMsr: 32 }, { nMsr: 40 },
      { nbLbt: 'auto' }, { nbLbt: 'off' },
      { nbChannels: [3] }, { nbChannels: [3, 4] },
      { ssbd: UwbSsbdSchema.parse({}) }, { ssbd: null },
    ]
    /** Which greying gate each edit sits behind, or null for a control that is always live. */
    const GATE: Record<string, keyof ReturnType<typeof mmsDraftLive> | null> = {
      uwbdControl: 'uwbdControl', reversedOrder: 'reversedOrder', rsfSfd: 'rsfSfd',
      fixedReplyRstu: 'fixedReply', nbLbt: 'narrowband', nbChannels: 'narrowband',
      control: null, nonInterleaved: null, oneToMany: null, nMsr: null, ssbd: 'ssbd',
    }
    const start = cfg()
    const seen = new Set([JSON.stringify(start)])
    const queue = [start]
    while (queue.length > 0) {
      const state = queue.shift()!
      expect(uwbSessionIssue(plan(state)), JSON.stringify(state)).toBeNull()
      const live = mmsDraftLive(state)
      for (const edit of EDITS) {
        const gate = GATE[Object.keys(edit)[0]]
        if (gate !== null && !live[gate]) continue // the user cannot click a greyed-out control
        const next = { ...state, ...mmsFieldPatch(state, edit) }
        const key = JSON.stringify(next)
        if (seen.has(key)) continue
        seen.add(key)
        queue.push(next)
      }
    }
    // …and the walk is only worth something if it does reach all seven features switched on.
    expect(seen.size).toBeGreaterThan(50)
    const states = [...seen].map((s) => JSON.parse(s) as UwbMmsCfg)
    expect(states.some((s) => s.control === 'uwbd')).toBe(true)
    expect(states.some((s) => s.uwbdControl === 'none')).toBe(true)
    expect(states.some((s) => s.nonInterleaved)).toBe(true)
    expect(states.some((s) => s.reversedOrder)).toBe(true)
    expect(states.some((s) => s.rsfSfd)).toBe(true)
    expect(states.some((s) => s.fixedReplyRstu !== null)).toBe(true)
    expect(states.some((s) => s.ssbd !== null)).toBe(true)
  })

  it('takes the narrowband fields out of a plan whose control plane has no narrowband radio', () => {
    const nba = cfg({ nbChannels: [7, 8], nbLbt: 'auto' })
    expect(mmsDraftLive(nba).narrowband).toBe(true)
    const uwbd = { ...nba, ...mmsFieldPatch(nba, { control: 'uwbd' }) }
    expect(uwbd).toMatchObject({ control: 'uwbd', nbChannels: [], nbLbt: 'off' })
    expect(mmsDraftLive(uwbd).narrowband).toBe(false)
    expect(uwbSessionIssue(plan(uwbd))).toBeNull()
    // …and coming back needs a list again, which only the draft's own default can supply: an
    // empty allow list is a plan Config 2 refuses, and the control keeps no memory of its own.
    const back = { ...uwbd, ...mmsFieldPatch(uwbd, { control: 'nba' }) }
    expect(back).toMatchObject({
      control: 'nba', nbChannels: DEFAULT_UWB_MMS.nbChannels, nbLbt: DEFAULT_UWB_MMS.nbLbt,
    })
    expect(uwbSessionIssue(plan(back))).toBeNull()
  })

  it('drops the UWB-driven-only settings when the control plane goes back to Config 2', () => {
    const uwbd = cfg({ ...UWBD, uwbdControl: 'none', nMsr: 32, rsfSfd: true })
    expect(uwbSessionIssue(plan(uwbd))).toBeNull()
    const nba = { ...uwbd, ...mmsFieldPatch(uwbd, { control: 'nba' }) }
    expect(nba).toMatchObject({ control: 'nba', uwbdControl: 'sp0', rsfSfd: false })
    expect(uwbSessionIssue(plan(nba))).toBeNull()
  })

  it('drops RSF-with-SFD when a fragment length that cannot carry it is written', () => {
    const on = cfg({ ...UWBD, nMsr: 32, rsfSfd: true })
    expect(uwbSessionIssue(plan(on))).toBeNull()
    // the N_MSR select…
    expect({ ...on, ...mmsFieldPatch(on, { nMsr: 40 }) }.rsfSfd).toBe(false)
    // …and the parameter-set select, which writes N_MSR too (rsf-1 is N_MSR 40).
    const set = { ...on, ...mmsFieldPatch(on, mmsSetPatch('rsf-1')) }
    expect(mmsSet('rsf-1').nMsr).toBe(40)
    expect(set.rsfSfd).toBe(false)
    expect(uwbSessionIssue(plan(set))).toBeNull()
  })

  it('clears the fixed reply time when the round shape it needs is taken away', () => {
    const fixed = cfg({ nonInterleaved: true, fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT })
    expect(uwbSessionIssue(plan(fixed))).toBeNull()
    for (const edit of [{ nonInterleaved: false }, { oneToMany: true }] as Partial<UwbMmsCfg>[]) {
      const next = { ...fixed, ...mmsFieldPatch(fixed, edit) }
      expect(next.fixedReplyRstu, JSON.stringify(edit)).toBeNull()
      expect(uwbSessionIssue(plan(next)), JSON.stringify(edit)).toBeNull()
    }
    // Reversed order goes the same way, and takes the fixed reply time with it.
    const reversed = cfg({ nonInterleaved: true, reversedOrder: true })
    expect({ ...reversed, ...mmsFieldPatch(reversed, { nonInterleaved: false }) }.reversedOrder).toBe(false)
  })

  /**
   * The panel itself, not just the pure helpers above: SSBD's five fields actually render, commit
   * through `mmsFieldPatch` (so a control flipping `control`/`nbLbt` still nulls a live `ssbd`),
   * and grey out together under the same `mmsDraftLive(mms).ssbd` flag the checkbox itself reads.
   */
  it('renders the five SSBD inputs, live when the panel says live and disabled when it does not', () => {
    const render = (mms: Partial<UwbMmsCfg>): string => {
      const session: UwbSessionCfg = {
        ...DEFAULT_UWB_SESSION, ...uwbModePatch('mms'), mms: { ...DEFAULT_UWB_MMS, ...mms },
      }
      const html = renderToStaticMarkup(createElement(UwbSessionFields, {
        session, anchors: 1, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
      }))
      // The section's own slice: from its checkbox's own title attribute — which precedes the
      // checkbox element itself in the rendered markup, unlike the label text after it — to the
      // next control after it (the report select), so a disabled attribute elsewhere on the panel
      // (the MMS-wide selects the mode itself greys out) cannot be mistaken for this section's own
      // gate.
      const hint = STRINGS.editor[mmsSsbdHintKey({ ...DEFAULT_UWB_MMS, ...mms })]
      const from = html.indexOf(hint)
      const to = html.indexOf(STRINGS.editor.uwbReport, from)
      expect(from, 'SSBD checkbox not rendered').toBeGreaterThan(-1)
      expect(to, 'report select not rendered after it').toBeGreaterThan(from)
      return html.slice(from, to)
    }
    const live = render({})
    for (const label of [
      STRINGS.editor.uwbSsbdMinBf, STRINGS.editor.uwbSsbdMaxBf, STRINGS.editor.uwbSsbdMaxBackoffs,
      STRINGS.editor.uwbSsbdUnit, STRINGS.editor.uwbSsbdTxOnEnd,
    ]) expect(live, label).toContain(label)
    // The checkbox itself is live under the session default MMS (Config 2, listen-before-talk
    // auto); its own five fields are disabled because the switch is unticked, not because the
    // section itself is dead — `on` reads the checkbox alone.
    const liveOn = render({ ssbd: UwbSsbdSchema.parse({}) })
    expect((liveOn.match(/disabled=""/g) ?? []).length).toBe(0)
    const greyed = render({ control: 'uwbd', nbChannels: [], nbLbt: 'off' })
    // Checkbox + four numeric fields + the end-action checkbox: six disabled controls once the
    // gate goes down, none of them live again just because the switch itself cannot be ticked.
    expect((greyed.match(/disabled=""/g) ?? []).length).toBe(6)
  })

  /**
   * What ticking the checkbox writes: `UwbSsbdSchema.parse({})`, never a second, hand-typed copy
   * of the same five numbers. Checked against the schema itself rather than the literals, so a
   * future change to §4.1's defaults moves this test with it instead of leaving it stale.
   */
  it('turning the checkbox on would write the schema’s own five defaults, not a literal object', () => {
    const on: Partial<UwbMmsCfg> = { ssbd: UwbSsbdSchema.parse({}) }
    expect(on.ssbd).toEqual({ minBf: 1, maxBf: 5, maxBackoffs: 5, unitBackoffUs: 1, txOnEnd: true })
    const session: Scenario = withUwb(1, { ...uwbModePatch('mms'), mms: { ...DEFAULT_UWB_MMS, ...on } })
    expect(uwbSessionIssue(session)).toBeNull()
  })
})

/**
 * The fixed reply time is the one draft feature the user types rather than picks, so it is the one
 * that can be typed wrong. Same contract as `parseNbChannels`: a value the schema would refuse
 * never reaches the session at all.
 */
describe('parseFixedReplyRstu', () => {
  it('takes a whole RSTU count inside the bounds the draft gives macMmsFixedReplyTime', () => {
    expect(parseFixedReplyRstu('600')).toBe(600)
    expect(parseFixedReplyRstu(' 300 ')).toBe(MMS_FIXED_REPLY_RSTU_MIN)
    expect(parseFixedReplyRstu('612000')).toBe(MMS_FIXED_REPLY_RSTU_MAX)
    expect(parseFixedReplyRstu(String(MMS_FIXED_REPLY_RSTU_DEFAULT))).toBe(MMS_FIXED_REPLY_RSTU_DEFAULT)
  })

  it('refuses anything the schema would refuse, so the field can keep the last value that worked', () => {
    for (const bad of ['', '   ', '299', '612001', '600.5', '-600', '6e2', '600,600', 'x', '0']) {
      expect(parseFixedReplyRstu(bad), bad).toBeNull()
    }
  })

  it('agrees with the schema on the bounds, and has a message to leave on screen', () => {
    const at = (fixedReplyRstu: number): Scenario => withUwb(1, {
      ...uwbModePatch('mms'), slotRstu: 600, blockRstu: 240_000,
      mms: { ...DEFAULT_UWB_SESSION.mms, nonInterleaved: true, fixedReplyRstu },
    })
    for (const good of [MMS_FIXED_REPLY_RSTU_MIN, MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_FIXED_REPLY_RSTU_MAX]) {
      expect(uwbSessionIssue(at(good)), String(good)).toBeNull()
    }
    for (const bad of [MMS_FIXED_REPLY_RSTU_MIN - 1, MMS_FIXED_REPLY_RSTU_MAX + 1]) {
      expect(uwbSessionIssue(at(bad)), String(bad)).not.toBeNull()
      expect(parseFixedReplyRstu(String(bad)), String(bad)).toBeNull()
    }
    expect(STRINGS.editor.uwbFixedReplyBad).toBeTruthy()
  })
})

/**
 * What the panel's own read-only line says the round is. A non-interleaved ranging phase costs
 * `slotsPerMs` slots per millisecond of train, so the line has to be measured at the session's
 * slot length — printing the draft's default instead would state a round the run does not have.
 */
describe('the MMS derived line', () => {
  it('measures the round at the session’s own slot length', () => {
    // Config 1, where a 300 RSTU slot is legal (no narrowband message to fit into two of them).
    const mms: UwbMmsCfg = {
      ...DEFAULT_UWB_SESSION.mms, control: 'uwbd', nbChannels: [], nbLbt: 'off', nonInterleaved: true,
    }
    const session: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, ...uwbModePatch('mms'), slotRstu: 300, blockRstu: 240_000, mms,
    }
    const real = mmsLayout(mms, 1, mmsSlotsPerMs(300)).slots
    const nominal = mmsLayout(mms, 1).slots // …at the draft's 600 RSTU slot, which this is not
    expect(real).toBeGreaterThan(nominal)
    const sc = { ...withUwb(1), uwb: session }
    expect(uwbSessionIssue(sc)).toBeNull()
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session, anchors: 1, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    const msOf = (slots: number): string => `${(rstuNs(slots * 300) / 1e6).toFixed(1)} ms`
    expect(markup).toContain(msOf(real))
    expect(markup).not.toContain(msOf(nominal))
  })

  it('leaves the block-fit rule measuring the same round it prints', () => {
    // Three responders, non-interleaved: four sub-rounds of a whole train each, 100 slots at the
    // draft's 600 RSTU slot against the interleaved round's 52 — so the block refuses it sooner,
    // and says so with the number the panel shows.
    const mms: UwbMmsCfg = { ...DEFAULT_UWB_SESSION.mms, oneToMany: true, nonInterleaved: true }
    expect(mmsLayout(mms, 3, mmsSlotsPerMs(600)).slots).toBe(100)
    expect(mmsLayout({ ...mms, nonInterleaved: false }, 3, mmsSlotsPerMs(600)).slots).toBe(52)
    const tight = withUwb(3, { ...uwbModePatch('mms'), slotRstu: 600, blockRstu: 30_000, mms })
    expect(uwbSessionIssue(tight)).toContain(String(mmsLayout(mms, 3, mmsSlotsPerMs(600)).slots))
    // …and one that does hold it is accepted, so the warning is about the block and not the mode.
    expect(uwbSessionIssue(withUwb(3, { ...uwbModePatch('mms'), slotRstu: 600, blockRstu: 240_000, mms }))).toBeNull()
  })
})

describe('newAp / hasAp', () => {
  /** A UWB-only plan: every Wi-Fi node deleted, ranging devices left. */
  function uwbOnly(): Scenario {
    let sc = withUwb(2)
    for (const n of sc.nodes.filter((x) => x.kind === 'sta' || x.kind === 'amp')) sc = removeNode(sc, n.id)
    return removeNode(sc, 'ap')
  }

  it('puts a Wi-Fi 7 AP back into a plan that lost it', () => {
    const before = uwbOnly()
    expect(hasAp(before)).toBe(false)
    const { sc, id } = newAp(before, { x: 2.04, y: 3.96 })
    expect(id).toBe('ap')
    expect(hasAp(sc)).toBe(true)
    const ap = sc.nodes.find((n) => n.id === id)!
    expect(ap).toMatchObject({ kind: 'ap', name: 'AP', txPowerDbm: 20, profiles: ['idle'] })
    expect(ap.pos.z).toBe(2.0)
    expect(ap.pos.x).toBeCloseTo(2.0, 9)
    expect(ap.pos.y).toBeCloseTo(4.0, 9)
    expect(ap.caps.generation).toBe('eht')
    for (const f of GEN_FEATURES.eht) expect(ap.caps.features[f]).toBe(true)
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)
    // the ranging session it was placed next to is untouched
    expect(sc.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('refuses a second AP', () => {
    const sc = defaultScenario()
    expect(hasAp(sc)).toBe(true)
    const { sc: same, id } = newAp(sc, { x: 9, y: 1 })
    expect(same).toBe(sc)
    expect(id).toBe('ap')
  })

  it('an AP the plan gets back can be deleted again', () => {
    const sc = newAp(uwbOnly(), { x: 1, y: 1 }).sc
    expect(canDeleteNode(sc, 'ap')).toBe(true)
    expect(hasAp(removeNode(sc, 'ap'))).toBe(false)
  })
})

describe('removeNode / canDeleteNode', () => {
  it('closes the session with the last UWB node', () => {
    const sc = withUwb(1)
    const anchor = sc.nodes.find((n) => n.uwb?.role === 'anchor')!
    const tag = sc.nodes.find((n) => n.uwb?.role === 'tag')!
    const oneLeft = removeNode(sc, anchor.id)
    expect(oneLeft.uwb).toEqual(DEFAULT_UWB_SESSION)
    const none = removeNode(oneLeft, tag.id)
    expect(none.uwb).toBeUndefined()
    expect(ScenarioSchema.safeParse(none).success).toBe(true)
  })

  it('keeps the AP while any Wi-Fi client is left', () => {
    const sc = defaultScenario()
    expect(sc.nodes.some((n) => n.kind === 'sta')).toBe(true)
    expect(canDeleteNode(sc, 'ap')).toBe(false)
    expect(removeNode(sc, 'ap')).toBe(sc)
  })

  it('lets a UWB-only plan drop the AP', () => {
    let sc = withUwb(3)
    for (const n of sc.nodes.filter((x) => x.kind === 'sta' || x.kind === 'amp')) sc = removeNode(sc, n.id)
    expect(canDeleteNode(sc, 'ap')).toBe(true)
    const uwbOnly = removeNode(sc, 'ap')
    expect(uwbOnly.nodes.every((n) => n.kind === 'uwb')).toBe(true)
    expect(ScenarioSchema.safeParse(uwbOnly).success).toBe(true)
  })
})

/**
 * Task 5 (design §2/§4): the RCM-validity-rounds field and the RMNR toggle. The schema's own six
 * refusals (`model/scenario.ts`, Tasks 1–4) are not re-tested here — only what this file's own
 * helpers and the rendered panel do with them: the field must never be able to reach a combination
 * `uwbSessionIssue` rejects.
 */
describe('RCM validity rounds / RMNR in the editor (design §2/§4)', () => {
  const E = STRINGS.editor

  it('is live only under two-way ranging — the only mode with an ARC IE to extend', () => {
    expect(uwbRcmValidityHintKey('twr')).toBe('uwbRcmValidityHint')
    for (const mode of ['dl-tdoa', 'ul-tdoa', 'mms', 'm2m'] as const) {
      expect(uwbRcmValidityHintKey(mode), mode).toBe('uwbRcmValidityTwrOnly')
    }
  })

  it('picks the RMNR hint in the order a user would need to fix it: mode, then validity, then schedule', () => {
    // Wrong mode outranks everything else, including a session that would otherwise be fine.
    expect(uwbRmnrHintKey('dl-tdoa', 4, 'time')).toBe('uwbRmnrTwrOnly')
    // Two-way ranging, but the state RMNR reports cannot exist yet.
    expect(uwbRmnrHintKey('twr', 1, 'time')).toBe('uwbRmnrNeedsValidity')
    // Two-way ranging, validity above 1, but a contention round has no still-valid control
    // message for RMNR to confirm.
    expect(uwbRmnrHintKey('twr', 4, 'contention')).toBe('uwbRmnrContention')
    // Every reason cleared: live.
    expect(uwbRmnrHintKey('twr', 4, 'time')).toBe('uwbRmnrHint')
  })

  it('uwbRcmValidityRoundsPatch takes a stranded rmnr back to false, the direction uwbModePatch and uwbSchedulePatch already take', () => {
    expect(uwbRcmValidityRoundsPatch(1, true)).toEqual({ rcmValidityRounds: 1, rmnr: false })
    expect(uwbRcmValidityRoundsPatch(1, false)).toEqual({ rcmValidityRounds: 1 })
    expect(uwbRcmValidityRoundsPatch(4, true)).toEqual({ rcmValidityRounds: 4 })
    // …and the field the user actually touches never produces the pair the schema refuses.
    expect(uwbSessionIssue(withUwb(4, {
      rcmValidityRounds: 4, rmnr: true, ...uwbRcmValidityRoundsPatch(1, true),
    }))).toBeNull()
  })

  it('the number field is greyed outside two-way ranging, with the TWR-only reason', () => {
    const sc = withUwb(4, { mode: 'dl-tdoa', tdoaClockCorrection: true })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbRcmValidityTwrOnly)
    expect(markup).not.toContain(E.uwbRcmValidityHint)
  })

  it('the RMNR checkbox is greyed at the default rcmValidityRounds, and the hint names the reason (design §4, the one hint in this panel that teaches a cause)', () => {
    const sc = withUwb(4) // DEFAULT_UWB_SESSION: mode twr, rcmValidityRounds 1
    expect(sc.uwb!.rcmValidityRounds).toBe(1)
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbRmnrNeedsValidity)
    expect(markup).not.toContain(E.uwbRmnrHint)
  })

  it('the RMNR checkbox comes alive once validity is raised above 1, under time scheduling', () => {
    const sc = withUwb(4, { rcmValidityRounds: 4 })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbRmnrHint)
    expect(markup).not.toContain(E.uwbRmnrNeedsValidity)
  })

  it('the RMNR checkbox is greyed under a contention schedule, with its own reason', () => {
    const sc = withUwb(4, { method: 'ss', schedule: 'contention', rcmValidityRounds: 4 })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbRmnrContention)
  })

  it('switching to a one-way or pairwise mode clears a stranded rcmValidityRounds/rmnr (Task 5’s own finding)', () => {
    // Exactly the shape of bug `uwbModePatch` already fixed for aoa/schedule/method: before this
    // task neither field was reset on a mode change, so the mode select alone could hand the
    // schema a combination it refuses.
    // dl-tdoa/ul-tdoa need four anchors to fix a tag at all; mms is pairwise and three anchors is
    // the count the existing MMS-mode tests above already confirm fits the default block.
    for (const [mode, anchors] of [['dl-tdoa', 4], ['ul-tdoa', 4], ['mms', 3], ['m2m', 4]] as const) {
      const patch = uwbModePatch(mode)
      expect(patch.rcmValidityRounds, mode).toBe(1)
      expect(patch.rmnr, mode).toBe(false)
      const stranded: Partial<UwbSessionCfg> = { rcmValidityRounds: 4, rmnr: true, schedule: 'time' }
      expect(uwbSessionIssue(withUwb(anchors, { ...stranded, mode })), mode).toBeTruthy()
      expect(uwbSessionIssue(withUwb(anchors, { ...stranded, ...patch })), mode).toBeNull()
    }
    // Two-way ranging leaves both fields the user's own.
    expect(uwbModePatch('twr').rcmValidityRounds).toBeUndefined()
    expect(uwbModePatch('twr').rmnr).toBeUndefined()
  })
})

describe('receipt confirmation (MMRCR) in the editor (receipt-confirmation-design §4, task 4)', () => {
  const E = STRINGS.editor

  it('picks the hint in the order a user would need to fix it: mode, then validity, then schedule', () => {
    // Each one-way/MMS mode has its own refusal, outranking everything else.
    expect(uwbMmrcrHintKey('dl-tdoa', 4, 'time')).toBe('uwbMmrcrDlTdoa')
    expect(uwbMmrcrHintKey('ul-tdoa', 4, 'time')).toBe('uwbMmrcrUlTdoa')
    expect(uwbMmrcrHintKey('mms', 4, 'time')).toBe('uwbMmrcrMms')
    // Two-way ranging, but the window mmrcr would describe is exactly the round that just ran.
    expect(uwbMmrcrHintKey('twr', 1, 'time')).toBe('uwbMmrcrNeedsValidity')
    // Two-way ranging, validity above 1, but a contention round hands out no slot to confirm from.
    expect(uwbMmrcrHintKey('twr', 4, 'contention')).toBe('uwbMmrcrContention')
    // Every reason cleared: live.
    expect(uwbMmrcrHintKey('twr', 4, 'time')).toBe('uwbMmrcrHint')
    // Unlike rmnr, many-to-many is live too — it is the one mode with no other way to answer
    // "who heard me" (design §4). It always carries rcmValidityRounds 1 and schedule 'time', and
    // neither disqualifies it the way they do for 'twr'.
    expect(uwbMmrcrHintKey('m2m', 1, 'time')).toBe('uwbMmrcrHint')
  })

  it('uwbRcmValidityRoundsPatch takes a stranded mmrcr back to false at validity 1, the same direction it already takes rmnr', () => {
    expect(uwbRcmValidityRoundsPatch(1, false, true)).toEqual({ rcmValidityRounds: 1, mmrcr: false })
    expect(uwbRcmValidityRoundsPatch(1, false, false)).toEqual({ rcmValidityRounds: 1 })
    expect(uwbRcmValidityRoundsPatch(4, false, true)).toEqual({ rcmValidityRounds: 4 })
    // Both fields at once: both come back.
    expect(uwbRcmValidityRoundsPatch(1, true, true)).toEqual({ rcmValidityRounds: 1, rmnr: false, mmrcr: false })
    // …and the field the user actually touches never produces the pair the schema refuses.
    expect(uwbSessionIssue(withUwb(4, {
      rcmValidityRounds: 4, mmrcr: true, ...uwbRcmValidityRoundsPatch(1, false, true),
    }))).toBeNull()
  })

  it('uwbSchedulePatch takes a stranded mmrcr back to false under a contention schedule', () => {
    expect(uwbSchedulePatch('contention', 'embedded', false, true)).toEqual({ schedule: 'contention', mmrcr: false })
    expect(uwbSchedulePatch('contention', 'embedded', false, false)).toEqual({ schedule: 'contention' })
    expect(uwbSchedulePatch('time', 'embedded', false, true)).toEqual({ schedule: 'time' })
    // Both fields at once: both come back, the same way uwbRcmValidityRoundsPatch does.
    expect(uwbSchedulePatch('contention', 'embedded', true, true))
      .toEqual({ schedule: 'contention', rmnr: false, mmrcr: false })
  })

  it('uwbModePatch clears mmrcr for the three modes that refuse it outright, and never touches it for m2m', () => {
    for (const mode of ['dl-tdoa', 'ul-tdoa', 'mms'] as const) {
      const patch = uwbModePatch(mode, 4, true)
      expect(patch.mmrcr, mode).toBe(false)
    }
    // m2m is deliberately left alone: design §4 keeps mmrcr legal there.
    expect(uwbModePatch('m2m', 4, true).mmrcr).toBeUndefined()
  })

  it('switching to twr brings a stranded mmrcr back to legal — the second instance of the rmnr defect this slice already hit once (brief: "found a second instance of the same defect")', () => {
    // m2m is the one mode that leaves mmrcr untouched and forces rcmValidityRounds to 1
    // (uwbModePatch('m2m') above). A session that turned mmrcr on while in m2m and then switched
    // back to twr would otherwise arrive at { mode: 'twr', rcmValidityRounds: 1, mmrcr: true } —
    // exactly the pair the schema refuses for 'twr'.
    expect(uwbModePatch('twr', 1, true)).toEqual({ mode: 'twr', mmrcr: false })
    // At a legal rcmValidityRounds the pair needs no correction.
    expect(uwbModePatch('twr', 4, true)).toEqual({ mode: 'twr' })
    expect(uwbModePatch('twr', 1, false)).toEqual({ mode: 'twr' })
    // The round trip through m2m and back never produces a scenario the schema refuses.
    const strandedFromM2m: Partial<UwbSessionCfg> = { ...uwbModePatch('m2m', 1, false), mmrcr: true }
    expect(strandedFromM2m.rcmValidityRounds).toBe(1)
    const backToTwr = { ...strandedFromM2m, ...uwbModePatch('twr', strandedFromM2m.rcmValidityRounds!, true) }
    expect(uwbSessionIssue(withUwb(4, backToTwr))).toBeNull()
  })

  it('the checkbox is greyed at the default rcmValidityRounds, with the needs-validity reason', () => {
    const sc = withUwb(4) // DEFAULT_UWB_SESSION: mode twr, rcmValidityRounds 1
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbMmrcrNeedsValidity)
    expect(markup).not.toContain(E.uwbMmrcrHint)
  })

  it('the checkbox comes alive once validity is raised above 1, under time scheduling', () => {
    const sc = withUwb(4, { rcmValidityRounds: 4 })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbMmrcrHint)
    expect(markup).not.toContain(E.uwbMmrcrNeedsValidity)
  })

  it('the checkbox is greyed under a contention schedule, with its own reason', () => {
    const sc = withUwb(4, { method: 'ss', schedule: 'contention', rcmValidityRounds: 4 })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbMmrcrContention)
  })

  it('the checkbox is live in many-to-many mode, unlike rmnr which stays greyed there', () => {
    const sc = withUwb(4, uwbModePatch('m2m', 1, false))
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 0, tags: 0, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbMmrcrHint)
    expect(markup).not.toContain(E.uwbMmrcrDlTdoa)
    expect(markup).not.toContain(E.uwbMmrcrUlTdoa)
    expect(markup).not.toContain(E.uwbMmrcrMms)
    // rmnr, by contrast, is still refused outright in m2m.
    expect(markup).toContain(E.uwbRmnrTwrOnly)
  })

  it('each one-way/MMS mode shows its own reason, and only its own', () => {
    for (const [mode, anchors] of [['dl-tdoa', 4], ['ul-tdoa', 4], ['mms', 3]] as const) {
      const sc = withUwb(anchors, uwbModePatch(mode, 1, false))
      const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
        session: sc.uwb!, anchors, tags: mode === 'mms' ? 1 : 0, issue: null, onChange: () => {}, onRemove: () => {},
      }))
      const key = { 'dl-tdoa': E.uwbMmrcrDlTdoa, 'ul-tdoa': E.uwbMmrcrUlTdoa, mms: E.uwbMmrcrMms }[mode]
      expect(markup, mode).toContain(key)
    }
  })
})

describe('SP3 grouped ranging (standard §10.32.8) and its SRRR IE (§10.32.9.9) in the editor (sp3-design, task 4)', () => {
  const E = STRINGS.editor

  it('uwbSp3HintKey picks the refusal a user would meet first: mode, then schedule, then reply time', () => {
    const MODES: UwbMode[] = ['twr', 'dl-tdoa', 'ul-tdoa', 'mms', 'm2m']
    expect(MODES.map((m) => uwbSp3HintKey(m, 'time', 'deferred'))).toEqual([
      'uwbSp3Hint', 'uwbSp3DlTdoa', 'uwbSp3UlTdoa', 'uwbSp3Mms', 'uwbSp3M2m',
    ])
    expect(uwbSp3HintKey('twr', 'contention', 'deferred')).toBe('uwbSp3Contention')
    expect(uwbSp3HintKey('twr', 'time', 'embedded')).toBe('uwbSp3NeedsDeferred')
    expect(uwbSp3HintKey('twr', 'time', 'fixed')).toBe('uwbSp3NeedsDeferred')
    expect(uwbSp3HintKey('twr', 'time', 'deferred')).toBe('uwbSp3Hint')
  })

  it('uwbSrrrRaoaHintKey / uwbSrrrRrttHintKey need sp3 first, then SS-TWR, and RAOA needs AoA on top of that (fix round 1 of task 3: both bits refused outside SS-TWR)', () => {
    expect(uwbSrrrRaoaHintKey(false, 'ss', false)).toBe('uwbSrrrNeedsSp3')
    expect(uwbSrrrRaoaHintKey(true, 'ds', true)).toBe('uwbSrrrNeedsSs')
    expect(uwbSrrrRaoaHintKey(true, 'ss', false)).toBe('uwbSrrrRaoaNeedsAoa')
    expect(uwbSrrrRaoaHintKey(true, 'ss', true)).toBe('uwbSrrrRaoaHint')
    expect(uwbSrrrRrttHintKey(false, 'ss')).toBe('uwbSrrrNeedsSp3')
    expect(uwbSrrrRrttHintKey(true, 'ds')).toBe('uwbSrrrNeedsSs')
    expect(uwbSrrrRrttHintKey(true, 'ss')).toBe('uwbSrrrRrttHint')
  })

  it('uwbModePatch clears sp3 for all three non-twr branches, including m2m, unlike mmrcr which keeps a second legal mode (task 3 concern 2)', () => {
    for (const mode of ['dl-tdoa', 'ul-tdoa', 'mms', 'm2m'] as const) {
      expect(uwbModePatch(mode).sp3, mode).toBe(false)
    }
    expect(uwbModePatch('twr').sp3).toBeUndefined()
  })

  it('uwbSchedulePatch clears a stranded sp3 under a contention schedule (task 3 concern 2)', () => {
    expect(uwbSchedulePatch('contention', 'deferred', false, false, true))
      .toEqual({ schedule: 'contention', replyTime: 'embedded', sp3: false })
    expect(uwbSchedulePatch('contention', 'embedded', false, false, true))
      .toEqual({ schedule: 'contention', sp3: false })
    expect(uwbSchedulePatch('contention', 'embedded', false, false, false)).toEqual({ schedule: 'contention' })
    expect(uwbSchedulePatch('time', 'embedded', false, false, true)).toEqual({ schedule: 'time' })
  })

  it('uwbReplyTimePatch clears a stranded sp3 for the two reply-time shapes it forbids, and leaves it for deferred (task 3 concern 2)', () => {
    expect(uwbReplyTimePatch('embedded', 'ss', 'time', true)).toEqual({ replyTime: 'embedded', sp3: false })
    expect(uwbReplyTimePatch('fixed', 'ss', 'time', true)).toEqual({ replyTime: 'fixed', sp3: false })
    expect(uwbReplyTimePatch('deferred', 'ss', 'time', true)).toEqual({ replyTime: 'deferred' })
    expect(uwbReplyTimePatch('embedded', 'ss', 'time', false)).toEqual({ replyTime: 'embedded' })
    for (const replyTime of ['embedded', 'deferred', 'fixed'] as const) {
      const patch = uwbReplyTimePatch(replyTime, 'ss', 'time', true)
      if (!patch) continue
      expect(uwbSessionIssue(withUwb(4, {
        mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'deferred', sp3: true, ...patch,
      })), replyTime).toBeNull()
    }
  })

  it('uwbMethodPatch clears a stranded srrr request under DS-TWR, and leaves sp3 itself alone — sp3 stays legal under DS, only the request bits do not (fix round 1 of task 3, sp3-design §2.3)', () => {
    expect(uwbMethodPatch('ds', 'embedded', true, { raoa: true, rrtt: false }))
      .toEqual({ method: 'ds', schedule: 'time', srrr: { raoa: false, rrtt: false } })
    expect(uwbMethodPatch('ds', 'embedded', true, { raoa: false, rrtt: true }))
      .toEqual({ method: 'ds', schedule: 'time', srrr: { raoa: false, rrtt: false } })
    // sp3 off, or neither bit on: nothing extra to report.
    expect(uwbMethodPatch('ds', 'embedded', false, { raoa: true, rrtt: true })).toEqual({ method: 'ds', schedule: 'time' })
    expect(uwbMethodPatch('ds', 'embedded', true, { raoa: false, rrtt: false })).toEqual({ method: 'ds', schedule: 'time' })
    // switching back to ss never needs a patch of srrr: it was already off, or it is legal again.
    expect(uwbMethodPatch('ss', 'embedded', true, { raoa: true, rrtt: true })).toEqual({ method: 'ss' })
    // the field the user actually touches never produces the pair the schema refuses
    expect(uwbSessionIssue(withUwb(4, {
      mode: 'twr', schedule: 'time', replyTime: 'deferred', sp3: true, method: 'ss',
      srrr: { raoa: false, rrtt: true },
      ...uwbMethodPatch('ds', 'embedded', true, { raoa: false, rrtt: true }),
    }))).toBeNull()
  })

  it('uwbAoaPatch takes a stranded srrr.raoa back to false when AoA is switched off under sp3, a reset found while wiring this panel', () => {
    expect(uwbAoaPatch(true, true, { raoa: true, rrtt: false })).toEqual({ aoa: true })
    expect(uwbAoaPatch(false, false, { raoa: true, rrtt: false })).toEqual({ aoa: false })
    expect(uwbAoaPatch(false, true, { raoa: false, rrtt: true })).toEqual({ aoa: false })
    expect(uwbAoaPatch(false, true, { raoa: true, rrtt: false }))
      .toEqual({ aoa: false, srrr: { raoa: false, rrtt: false } })
    expect(uwbSessionIssue(withUwb(4, {
      mode: 'twr', schedule: 'time', replyTime: 'deferred', sp3: true, aoa: true, method: 'ss',
      srrr: { raoa: true, rrtt: false },
      ...uwbAoaPatch(false, true, { raoa: true, rrtt: false }),
    }))).toBeNull()
  })

  it('renders the sp3 checkbox and the two SRRR request-bit checkboxes, live when every refusal is cleared', () => {
    const sc = withUwb(4, { mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'deferred', sp3: true, aoa: true })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbSp3)
    expect(markup).toContain(E.uwbSrrrRaoa)
    expect(markup).toContain(E.uwbSrrrRrtt)
    expect(markup).toContain(E.uwbSp3Hint)
    expect(markup).toContain(E.uwbSrrrRaoaHint)
    expect(markup).toContain(E.uwbSrrrRrttHint)
  })

  it('the two SRRR checkboxes are greyed under DS-TWR, with their own reason, even though sp3 itself stays on', () => {
    const sc = withUwb(4, { mode: 'twr', method: 'ds', schedule: 'time', replyTime: 'deferred', sp3: true, aoa: true })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sc.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbSrrrNeedsSs)
    expect(markup).not.toContain(E.uwbSrrrRaoaHint)
    expect(markup).not.toContain(E.uwbSrrrRrttHint)
    // sp3 itself is still live under DS-TWR — only the request bits are not.
    expect(markup).toContain(E.uwbSp3Hint)
  })

  it('sp3 is greyed with its own reason under every mode and schedule/reply-time combination that forbids it', () => {
    const cases: [Partial<UwbSessionCfg>, keyof typeof E, number][] = [
      [{ mode: 'dl-tdoa' }, 'uwbSp3DlTdoa', 4],
      [{ mode: 'ul-tdoa' }, 'uwbSp3UlTdoa', 4],
      [{ mode: 'm2m', replyTime: 'embedded' }, 'uwbSp3M2m', 4],
      [{ schedule: 'contention', method: 'ss' }, 'uwbSp3Contention', 4],
      [{ replyTime: 'embedded' }, 'uwbSp3NeedsDeferred', 4],
    ]
    for (const [session, key, anchors] of cases) {
      const sc = withUwb(anchors, { mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'deferred', ...session })
      const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
        session: sc.uwb!, anchors, tags: session.mode === 'm2m' ? 0 : 1, issue: null, onChange: () => {}, onRemove: () => {},
      }))
      expect(markup, String(key)).toContain(E[key] as string)
    }
  })

  it('the two SRRR checkboxes are greyed out while sp3 is off, and RAOA alone stays greyed when AoA is off', () => {
    const base = withUwb(4, { mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'deferred' })
    const sp3Off = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: base.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(sp3Off).toContain(E.uwbSrrrNeedsSp3)
    expect(sp3Off).not.toContain(E.uwbSrrrRaoaHint)
    expect(sp3Off).not.toContain(E.uwbSrrrRrttHint)

    const sp3OnNoAoa = withUwb(4, {
      mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'deferred', sp3: true, aoa: false,
    })
    const markup = renderToStaticMarkup(createElement(UwbSessionFields, {
      session: sp3OnNoAoa.uwb!, anchors: 4, tags: 1, issue: null, onChange: () => {}, onRemove: () => {},
    }))
    expect(markup).toContain(E.uwbSrrrRaoaNeedsAoa)
    expect(markup).toContain(E.uwbSrrrRrttHint) // RRTT does not need AoA
  })

  // End to end: the switch set through this panel's own patch functions, a whole round, and the
  // way back to a legal value — a feature is not done until a round has run and its output read.
  const sp3Node = (id: string, x: number, role: 'anchor' | 'tag'): NodeCfg => ({
    id, kind: 'uwb', name: id, pos: { x, y: 0, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM,
    profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
  })
  const sp3Scenario = (session: Partial<UwbSessionCfg>): Scenario => ({
    rooms: [{ x: 0, y: 0, w: 20, h: 20, name: 'lab' }], walls: [],
    nodes: [sp3Node('anc-1', 0, 'anchor'), sp3Node('anc-2', 6, 'anchor'), sp3Node('tag-1', 3, 'tag')],
    servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    uwb: {
      ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'deferred',
      nlos: false, ...session,
    },
  })

  it('a session set up entirely through this panel onChange patches runs a real SP3 round, and switching the mode away brings sp3 back to a legal value', () => {
    // Exactly the sequence of onChange calls the rendered panel issues: the method select first
    // (the session starts at the DS-TWR default), then the reply-time select, the AoA checkbox,
    // the sp3 checkbox, then the two SRRR checkboxes.
    let session = { ...DEFAULT_UWB_SESSION, ...uwbMethodPatch('ss', DEFAULT_UWB_SESSION.replyTime) }
    const replyPatch = uwbReplyTimePatch('deferred', session.method, session.schedule, session.sp3, session.srrr)
    expect(replyPatch).not.toBeNull()
    session = { ...session, ...replyPatch }
    session = { ...session, ...uwbAoaPatch(true, session.sp3, session.srrr) }
    session = { ...session, ...uwbSp3Patch(true, session.srrr) }
    session = { ...session, srrr: { ...session.srrr, raoa: true } }
    session = { ...session, srrr: { ...session.srrr, rrtt: true } }
    expect(session).toMatchObject({
      method: 'ss', replyTime: 'deferred', aoa: true, sp3: true, srrr: { raoa: true, rrtt: true },
    })

    const sc = sp3Scenario(session)
    expect(ScenarioSchema.safeParse(sc).success).toBe(true)

    const recs = new Simulation(sc).runUntil(roundPlan(sc.uwb!, 2).blockNs - 1).records
    const markers = recs.filter((r) => r.type === 'UWB_SP3')
    const reports = recs.filter((r) => r.type === 'UWB_SP3_REPORT')
    const ranges = recs.filter((r) => r.type === 'UWB_RANGE')
    expect(markers.length, 'SP3 markers actually went on the air').toBeGreaterThan(0)
    expect(reports.length, 'SP3 reports actually went on the air').toBeGreaterThan(0)
    expect(ranges.length, 'the round still measured a distance').toBeGreaterThan(0)

    // Now switch the method to DS-TWR: the stranded SRRR request has to come back down, through
    // the very patch the method select calls — while sp3 itself stays on.
    const toDs: Partial<UwbSessionCfg> = { ...session, ...uwbMethodPatch('ds', session.replyTime, session.sp3, session.srrr) }
    expect(toDs.sp3).toBe(true)
    expect(toDs.srrr).toEqual({ raoa: false, rrtt: false })
    expect(ScenarioSchema.safeParse(sp3Scenario(toDs)).success).toBe(true)

    // Switch the mode away, through the very patch the mode select calls, and back. The patch
    // takes the SRRR request bits down with `sp3` (branch-review C1): leaving them up would strand
    // a request behind a checkbox that is now greyed out, and re-ticking `sp3` would re-arm it.
    const toMms: Partial<UwbSessionCfg> = {
      ...session, ...uwbModePatch('mms', session.rcmValidityRounds, session.mmrcr, session.srrr),
    }
    expect(toMms.sp3).toBe(false)
    expect(toMms.srrr).toEqual({ raoa: false, rrtt: false })
    expect(ScenarioSchema.safeParse(sp3Scenario(toMms)).success).toBe(true)
    const backToTwr: Partial<UwbSessionCfg> = { ...toMms, ...uwbModePatch('twr') }
    expect(backToTwr.sp3).toBe(false)
    expect(ScenarioSchema.safeParse(sp3Scenario({ ...backToTwr, replyTime: 'deferred' })).success).toBe(true)
  })
})

/**
 * **A per-patch test cannot catch a per-path defect.** Every assertion above drives one patch
 * from a legal session and checks the result is legal — which is the right test for what a patch
 * promises, and blind to what a *sequence* of them can build. `branch-review.md`'s C1 was exactly
 * that: three patches lowered `sp3` while leaving the SRRR IE's two request bits up, the two
 * resets that would have taken them down were gated on `sp3` being already true, and re-ticking
 * `sp3` later re-armed a request the session was no longer legal for. No single-step assertion can
 * see it, and five earlier instances of the same class on this branch were all found by scanning
 * callers by hand.
 *
 * So this closes the class instead of the instance: a breadth-first closure over **every state
 * the panel can be driven into**, by its own exported patch functions, through its own greying
 * rules. Each operation is one control the panel renders, paired with the predicate that decides
 * whether it is live — the same `disabled` expression `UwbSessionFields` uses, so the walk visits
 * states a user can actually reach and no others. Every state it reaches is parsed. The state
 * space is small enough to exhaust (a few hundred states, a few thousand transitions), which
 * makes this a proof over the reachable graph rather than a sample of it.
 *
 * **It is only as complete as `OPS`.** A control added to the panel without a row here is a
 * dimension the walk does not turn, so `OPS` grows whenever the panel does.
 */
describe('UwbSessionFields as a closed system: no reachable sequence of its own patches builds an illegal session', () => {
  /** Four anchors: the one count legal in all five modes — the one-way modes need four for three
   * time differences, and `uwbModePatch` deliberately leaves the headcount to the issue line
   * rather than patching it, so a smaller house would flag a complaint that is not this walk's
   * subject. (model) */
  const WALK_ANCHORS = 4
  const WALK_TAGS = 1
  const walkBase = withUwb(WALK_ANCHORS)
  const scene = (uwb: UwbSessionCfg): Scenario => ({ ...walkBase, uwb })

  /**
   * The ranging slots the walk turns the slot control to, and the block it holds them in. Both are
   * **fixture choices on the same footing as `WALK_ANCHORS`**, and for the same reason: the panel
   * deliberately leaves the budget rules whose remedy is *another field* to the issue line, so a
   * fixture that trips one would make the closure fail about something it is not testing. For the
   * headcount that rule is "four anchors for three time differences"; for the slot it is MMS's own
   * two — the slot must be a multiple of 300 RSTU, and the block must hold every tag–anchor pair's
   * round — whose refusals name `blockRstu` and the headcount, not the slot.
   *
   * Three values, each for a reason: MMS's own slot (computed from `uwbModePatch`, and the
   * smallest multiple of 300 whose two slots still hold the narrowband control messages), the
   * session default, and one large enough to put the shipped fixed reply time *below* its window
   * rather than above it — the half of the fixed-reply defect nobody had reported.
   */
  const WALK_SLOTS = [uwbModePatch('mms').slotRstu!, DEFAULT_UWB_SESSION.slotRstu, 4800]
  /** Big enough for MMS's worst case at the largest walked slot: every tag–anchor pair gets a
   * round of its own, so the block has to hold `pairs × slots-per-round` slots. Computed from
   * `roundPlan`, never written down. */
  const WALK_BLOCK_RSTU = (() => {
    const maxSlot = Math.max(...WALK_SLOTS)
    const mms: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, ...uwbModePatch('mms'), slotRstu: maxSlot }
    return WALK_TAGS * WALK_ANCHORS * roundPlan(mms, WALK_ANCHORS).slots * maxSlot
  })()

  /** One control of the panel: its label for a failure trail, the panel's own live/greyed
   * predicate, and the patch its `onChange` issues. A patch of `null` is a value the control
   * refuses to commit at all (`uwbReplyTimePatch`), i.e. no transition. */
  type Op = {
    label: string
    live: (s: UwbSessionCfg) => boolean
    patch: (s: UwbSessionCfg) => Partial<UwbSessionCfg> | null
  }
  const WALK_MODES: UwbMode[] = ['twr', 'dl-tdoa', 'ul-tdoa', 'mms', 'm2m']
  /** The fixed-reply context of whatever state the walk is standing in — the same five fields the
   * panel derives once into `fixedCtx`, read off the walked session rather than off a fixture, so
   * the two controls that consult it see the slot that is actually set. */
  /**
   * **What the panel's `onChange` does with a patch**, which is what the walk has to step through
   * rather than the bare patch: merge it, then let `uwbSessionRepair` reconcile the cross-field
   * values no single patch owns, with the repair having the last word.
   *
   * This is the model's one concession to the panel's internals, and it earns its place — the
   * fixed-reply window is a function of `slotRstu`, `schedule` and `method`, and *six* controls
   * move one of those. Stepping the patches alone would be modelling a panel that does not exist,
   * and the first version of the fix (the window threaded into two patch functions) is what this
   * walk then caught: three more writers it had not been threaded into.
   */
  const commit = (s: UwbSessionCfg, patch: Partial<UwbSessionCfg>): UwbSessionCfg => {
    const next: UwbSessionCfg = { ...s, ...patch }
    return { ...next, ...uwbSessionRepair(next, WALK_ANCHORS) }
  }
  const OPS: Op[] = [
    // The mode select is never greyed out.
    ...WALK_MODES.map((mode): Op => ({
      label: `mode=${mode}`,
      live: () => true,
      patch: (s) => uwbModePatch(mode, s.rcmValidityRounds, s.mmrcr, s.srrr, s.mms),
    })),
    ...(['ss', 'ds'] as const).map((method): Op => ({
      label: `method=${method}`,
      live: (s) => s.mode !== 'mms', // `disabled={mms !== null}`
      patch: (s) => uwbMethodPatch(method, s.replyTime, s.sp3, s.srrr),
    })),
    ...(['time', 'contention'] as const).map((schedule): Op => ({
      label: `schedule=${schedule}`,
      live: (s) => s.method === 'ss' && s.mode === 'twr', // `disabled={!ssOnly || nonTwr !== null}`
      patch: (s) => uwbSchedulePatch(schedule, s.replyTime, s.rmnr, s.mmrcr, s.sp3, s.srrr),
    })),
    ...(['embedded', 'deferred', 'fixed'] as const).map((replyTime): Op => ({
      label: `replyTime=${replyTime}`,
      live: (s) => s.mode !== 'mms' && s.mode !== 'm2m', // `disabled={mms !== null || m2m}`
      patch: (s) => uwbReplyTimePatch(replyTime, s.method, s.schedule, s.sp3, s.srrr),
    })),
    // The ranging slot — the control this walk did not turn until the fixed-reply defect made it
    // matter, and the one that found that defect's other half: the window is a function of the
    // slot, so moving the slot moves the window out from under a reply time that was legal a
    // moment ago, downwards past its ceiling *or* upwards past its floor. The four values are here
    // for a reason rather than as a sample: the smallest the field accepts, MMS's own (computed,
    // not written, and the one `uwbModePatch` leaves behind), the session default, and one large
    // enough that the default reply time is below the window rather than above it. Every one of
    // the four is legal in all five modes at `WALK_ANCHORS`, so the walk never trips the
    // slot-fit rule, which the panel leaves to the issue line the way it leaves the headcount.
    ...WALK_SLOTS.map((slotRstu): Op => ({
      label: `slotRstu=${slotRstu}`,
      live: () => true, // a plain RstuInput, never greyed
      patch: () => ({ slotRstu }),
    })),
    // 1 is the value the schema pins outside 'twr' and the one `rmnr`/`mmrcr` depend on; 4 stands
    // for every value above it, which the rules only ever read as "more than one". (model)
    ...[1, 4].map((rcmValidityRounds): Op => ({
      label: `rcmValidityRounds=${rcmValidityRounds}`,
      live: (s) => s.mode === 'twr', // `disabled={session.mode !== 'twr'}`
      patch: (s) => uwbRcmValidityRoundsPatch(rcmValidityRounds, s.rmnr, s.mmrcr),
    })),
    ...[true, false].map((aoa): Op => ({
      label: `aoa=${aoa}`,
      live: (s) => s.mode === 'twr', // `disabled={nonTwr !== null}`
      patch: (s) => uwbAoaPatch(aoa, s.sp3, s.srrr),
    })),
    ...[true, false].map((sp3): Op => ({
      label: `sp3=${sp3}`,
      live: (s) => uwbSp3HintKey(s.mode, s.schedule, s.replyTime) === 'uwbSp3Hint',
      patch: (s) => uwbSp3Patch(sp3, s.srrr),
    })),
    ...[true, false].map((raoa): Op => ({
      label: `srrr.raoa=${raoa}`,
      live: (s) => uwbSrrrRaoaHintKey(s.sp3, s.method, s.aoa) === 'uwbSrrrRaoaHint',
      patch: (s) => ({ srrr: { ...s.srrr, raoa } }),
    })),
    ...[true, false].map((rrtt): Op => ({
      label: `srrr.rrtt=${rrtt}`,
      live: (s) => uwbSrrrRrttHintKey(s.sp3, s.method) === 'uwbSrrrRrttHint',
      patch: (s) => ({ srrr: { ...s.srrr, rrtt } }),
    })),
    ...[true, false].map((rmnr): Op => ({
      label: `rmnr=${rmnr}`,
      live: (s) => uwbRmnrHintKey(s.mode, s.rcmValidityRounds, s.schedule) === 'uwbRmnrHint',
      patch: () => ({ rmnr }),
    })),
    ...[true, false].map((mmrcr): Op => ({
      label: `mmrcr=${mmrcr}`,
      live: (s) => uwbMmrcrHintKey(s.mode, s.rcmValidityRounds, s.schedule) === 'uwbMmrcrHint',
      patch: () => ({ mmrcr }),
    })),
    // Ranging ancillary information (task 4, standard §10.35.1): the checkbox alone, exactly the
    // `rmnr`/`mmrcr` shape above — everything cross-field (the mode/sp3 gate, the frame-count cap)
    // is `uwbSessionRepair`'s job, not a patch here.
    ...[true, false].map((ancillary): Op => ({
      label: `ancillary=${ancillary}`,
      live: (s) => uwbAncillaryHintKey(s.mode, s.sp3) === 'uwbAncillaryHint',
      patch: () => ({ ancillary }),
    })),
    // 1 is the floor every schema rule leaves standing; 20 is well past every cap this walk's four
    // anchors can reach (the largest is DS-TWR deferred's `2·4+3 = 11`), so every value in between
    // is exercised by `uwbSessionRepair` retargeting it down as `mode`/`method`/`schedule`/
    // `replyTime` move around it. `disabled={!session.ancillary}` is the panel's own gate.
    ...[1, 20].map((ancillaryFrames): Op => ({
      label: `ancillaryFrames=${ancillaryFrames}`,
      live: (s) => s.ancillary,
      patch: () => ({ ancillaryFrames }),
    })),
    // SSBD (task 5, standard §10.45): the panel's own MMS-local checkbox, exercised here only to
    // drive `uwbModePatch`'s new `mms.ssbd` reset — the three local refusals (`control`, `nbLbt`,
    // the internal `minBf`/`maxBf`/etc. bounds) are `mmsFieldPatch`'s own job and are walked
    // exhaustively by the MMS-local closure above instead; this walk never turns `mms.control` or
    // `mms.nbLbt` away from their defaults, so `mmsSsbdHintKey` is always live whenever `mode`
    // is `'mms'`. Turning it off is always legal, whatever `live` says, the same way unticking a
    // checkbox the model has already greyed out commits nothing new.
    ...[true, false].map((on): Op => ({
      label: `ssbd=${on}`,
      live: (s) => s.mode === 'mms',
      patch: (s) => ({
        mms: { ...s.mms, ...mmsFieldPatch(s.mms, { ssbd: on ? UwbSsbdSchema.parse({}) : null }) },
      }),
    })),
  ]

  /**
   * Every session field a commit above can move. Two states with the same key are the same node of
   * the graph, so a field left out would silently collapse states that differ — and a field listed
   * that nothing moves is a dimension that never turns. Declared as data rather than written into
   * the key function so that the test below can check both of those mechanically.
   *
   * `slotRstu` is here because `uwbModePatch`'s MMS branch and the slot control both write it;
   * `fixedReplyRstu` because `uwbSessionRepair` chooses it. `ancillary`/`ancillaryFrames` (task 4)
   * for the same reason as `fixedReplyRstu`: `uwbSessionRepair` writes both, not any patch.
   * `mms` (task 5) is here because `uwbModePatch` now writes it too — `mms.ssbd` nulled the moment
   * `mode` leaves `'mms'` — and because the `ssbd=…` op above writes it directly; a key tracking
   * only `mms.ssbd` is not an option, since `WALK_KEYS` names whole fields of `UwbSessionCfg`.
   */
  const WALK_KEYS = [
    'mode', 'method', 'schedule', 'replyTime', 'rcmValidityRounds', 'aoa', 'sp3', 'srrr',
    'rmnr', 'mmrcr', 'slotRstu', 'fixedReplyRstu', 'ancillary', 'ancillaryFrames', 'mms',
  ] as const satisfies readonly (keyof UwbSessionCfg)[]
  const walkKey = (s: UwbSessionCfg): string => JSON.stringify(WALK_KEYS.map((k) => s[k]))

  /** The closure, computed once: every reachable state with the shortest trail of control
   * labels that reaches it, so a failure names the sequence to reproduce rather than a state. */
  const reachable = ((): { s: UwbSessionCfg; trail: string[] }[] => {
    const start: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, blockRstu: WALK_BLOCK_RSTU }
    const seen = new Map<string, { s: UwbSessionCfg; trail: string[] }>([[walkKey(start), { s: start, trail: [] }]])
    const queue = [walkKey(start)]
    for (let head = 0; head < queue.length; head++) {
      const { s, trail } = seen.get(queue[head])!
      for (const op of OPS) {
        if (!op.live(s)) continue
        const patch = op.patch(s)
        if (!patch) continue
        const next = commit(s, patch)
        const k = walkKey(next)
        if (seen.has(k)) continue
        seen.set(k, { s: next, trail: [...trail, op.label] })
        queue.push(k)
      }
    }
    return [...seen.values()]
  })()


  /**
   * **The model's own consistency, checked mechanically — and the limit of what can be.**
   *
   * The residual risk in a walk like this is that it is only as complete as `OPS`: a control added
   * to the panel with no row here is a dimension the walk never turns, and nothing in a test file
   * can see a React handler that was never modelled. That half stays a stated limit rather than a
   * fragile check — grepping the panel's JSX for `onChange` would pass for exactly as long as
   * nobody wrote a handler in a way the grep did not expect, which is worse than no check at all.
   *
   * What *is* mechanical is the agreement between the two halves of the model, and it catches the
   * failure that actually corrupts results:
   *
   * - **a field some commit changes that `WALK_KEYS` does not track** collapses states that
   *   differ, so the closure silently explores less than it reports. This is not hypothetical —
   *   `fixedReplyRstu` became exactly such a field the moment `uwbSessionRepair` started writing
   *   it, and the walk would have gone on reporting a clean 227 states while conflating every
   *   reply time it chose.
   * - **a field `WALK_KEYS` tracks that nothing ever changes** is a dimension that never turns,
   *   which is what an `OPS` row whose `live` predicate went permanently false looks like from
   *   here.
   *
   * Both are checked against what the **commit** does, not against what a patch names, because
   * the repair writes a field no patch mentions.
   */
  it('every field the walk tracks is one some commit moves, and no commit moves a field it does not track', () => {
    const moved = new Set<string>()
    const named = new Set<string>()
    for (const { s } of reachable) {
      for (const op of OPS) {
        if (!op.live(s)) continue
        const patch = op.patch(s)
        if (!patch) continue
        const next = commit(s, patch)
        for (const k of WALK_KEYS) {
          if (JSON.stringify(next[k]) !== JSON.stringify(s[k])) moved.add(k)
        }
        // Everything the commit *writes*, whether or not it changed anything: a patch that names a
        // field the key does not track is the leak, even on the steps where the value happens to
        // match what was already there.
        for (const k of Object.keys({ ...patch, ...uwbSessionRepair({ ...s, ...patch }, WALK_ANCHORS) })) {
          named.add(k)
        }
      }
    }
    const tracked = [...WALK_KEYS].sort()
    expect([...moved].sort(), 'a tracked field nothing moves is a dimension that never turns').toEqual(tracked)
    expect([...named].sort(), 'a field a commit writes but the key ignores collapses states').toEqual(tracked)
  })
  it('reaches a state space worth calling exhaustive, from the session default alone', () => {
    // Not a magic number to pin: a floor, so the walk cannot quietly collapse to a handful of
    // states (an `OPS` row whose `live` predicate went permanently false, say) and keep passing.
    expect(reachable.length).toBeGreaterThan(100)
    // The sanity check that the walk reaches the feature it was written for at all.
    expect(reachable.some((r) => r.s.sp3 && r.s.srrr.raoa)).toBe(true)
    expect(reachable.some((r) => r.s.sp3 && r.s.srrr.rrtt)).toBe(true)
    expect(reachable.some((r) => r.s.mode === 'mms')).toBe(true)
    // The walk actually turns the two new dimensions, and retargets rather than drops the frame
    // count: some reachable state carries `ancillary: true` with `ancillaryFrames` clamped down
    // from the 20 the op asked for (every cap at WALK_ANCHORS is well under that).
    expect(reachable.some((r) => r.s.ancillary)).toBe(true)
    expect(reachable.some((r) => r.s.ancillary && r.s.ancillaryFrames > 1 && r.s.ancillaryFrames < 20))
      .toBe(true)
    // SSBD (task 5): the walk does turn the checkbox on while in MMS mode.
    expect(reachable.some((r) => r.s.mms.ssbd !== null)).toBe(true)
  })

  /**
   * SSBD's own invariant (task 5, standard §10.45), stated over the whole reachable graph rather
   * than per patch — the same shape `srrrDownWithSp3`'s own test below uses: `mms.ssbd` can only
   * ever be non-null while `mode` is `'mms'`, because §10.39.8.3 scopes the algorithm to clause
   * 10.39/10.44 and `UwbMmsSchema`'s own `superRefine` refuses the pair everywhere else. This is
   * what makes `uwbModePatch`'s unconditional reset sound: a session the walk can reach is never
   * the pair the schema would refuse, whichever sequence of controls got it there.
   */
  it('never strands ssbd outside MMS mode: every reachable state has it null whenever mode is not mms', () => {
    const stranded = reachable
      .filter((r) => r.s.mode !== 'mms' && r.s.mms.ssbd !== null)
      .map((r) => r.trail.join(' -> '))
    expect(stranded).toEqual([])
  })

  it('never strands an SRRR request bit: every reachable state has both bits down whenever sp3 is', () => {
    // The invariant `srrrDownWithSp3` exists to keep, stated over the whole reachable graph
    // rather than per patch — this is what makes the gate in `uwbMethodPatch`/`uwbAoaPatch`
    // ("clear srrr only when sp3 is already true") sound, and C1 was what happened without it.
    const stranded = reachable
      .filter((r) => !r.s.sp3 && (r.s.srrr.raoa || r.s.srrr.rrtt))
      .map((r) => r.trail.join(' -> '))
    expect(stranded).toEqual([])
  })


  /**
   * **The referee.** `uwbFixedReplyWindowRstu` is a second reading of a rule `scenario.ts` already
   * owns, and two sources with no referee between them is a thing this branch has a commit about.
   * This is the referee, and it is deliberately not a second copy of the arithmetic: it sweeps the
   * slot sizes the field accepts and asks the **schema** what it makes of the window's two edges
   * and the two values just outside them.
   *
   * `lo` and `hi` accepted is the half the fix needs — everything `uwbFixedReplyRstuFor` can
   * return is inside the window, so it can never offer a value the schema refuses. `lo - 1` and
   * `hi + 1` refused is the other half: it says the window is *tight* rather than merely safe, so
   * the chooser does not override a user's value that was legal all along. That outer half holds
   * because the schema tightens both edges by flight time and this scene's flights are well under
   * one RSTU (833 ns); a scene spread over hundreds of metres would move `hi` and this assertion
   * would say so rather than let the editor quietly offer a value that no longer fits.
   */
  it('the window the editor computes is the window the schema enforces, at every slot size', () => {
    // Multiples of 3 RSTU, which the schema requires of a slot, from the field's own floor to
    // twice the session default: the range a user can actually reach with the slot control.
    for (const slotRstu of [300, 600, 900, 1200, 2400, 3600, 4800]) {
      for (const schedule of ['time', 'contention'] as const) {
        const { loRstu, hiRstu } = uwbFixedReplyWindowRstu(slotRstu, WALK_ANCHORS, schedule, 'ss')
        expect(loRstu, `slot ${slotRstu} should leave a non-empty window`).toBeLessThanOrEqual(hiRstu)
        const verdict = (fixedReplyRstu: number): string | null => uwbSessionIssue(scene({
          ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule,
          replyTime: 'fixed', slotRstu, fixedReplyRstu,
        }))
        const where = `slot ${slotRstu} / ${schedule}`
        expect(verdict(loRstu), `${where}: the window floor must be legal`).toBeNull()
        expect(verdict(hiRstu), `${where}: the window ceiling must be legal`).toBeNull()
        expect(verdict(loRstu - 1), `${where}: one below the floor must be refused`).not.toBeNull()
        expect(verdict(hiRstu + 1), `${where}: one above the ceiling must be refused`).not.toBeNull()
      }
    }
  })

  it('the chooser keeps a legal value and replaces an illegal one with the window floor', () => {
    const ctx = (slotRstu: number, fixedReplyRstu: number): UwbSessionCfg =>
      ({ ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'fixed', slotRstu, fixedReplyRstu })
    const def = DEFAULT_UWB_SESSION.slotRstu
    const { loRstu, hiRstu } = uwbFixedReplyWindowRstu(def, WALK_ANCHORS, 'time', 'ss')
    // A value already inside the window is the user's and is left exactly as it is — including
    // the shipped default, which is what keeps the default session's own patch empty.
    expect(uwbFixedReplyRstuFor(ctx(def, DEFAULT_UWB_SESSION.fixedReplyRstu), WALK_ANCHORS))
      .toBe(DEFAULT_UWB_SESSION.fixedReplyRstu)
    expect(uwbFixedReplyRstuFor(ctx(def, loRstu), WALK_ANCHORS)).toBe(loRstu)
    expect(uwbFixedReplyRstuFor(ctx(def, hiRstu), WALK_ANCHORS)).toBe(hiRstu)
    // Outside it, on either side, the floor — the point with the most headroom against the one
    // edge flight time can move.
    expect(uwbFixedReplyRstuFor(ctx(def, hiRstu + 1), WALK_ANCHORS)).toBe(loRstu)
    expect(uwbFixedReplyRstuFor(ctx(def, loRstu - 1), WALK_ANCHORS)).toBe(loRstu)
    // Both halves of the real defect, named: MMS's slot is too small for the shipped reply time,
    // and a large slot makes the same number too small rather than too large. Neither value is
    // written down here — both come out of the window.
    const mmsSlot = uwbModePatch('mms').slotRstu!
    const tooHigh = uwbFixedReplyRstuFor(ctx(mmsSlot, DEFAULT_UWB_SESSION.fixedReplyRstu), WALK_ANCHORS)!
    expect(tooHigh).toBeLessThan(DEFAULT_UWB_SESSION.fixedReplyRstu)
    const tooLow = uwbFixedReplyRstuFor(ctx(4800, DEFAULT_UWB_SESSION.fixedReplyRstu), WALK_ANCHORS)!
    expect(tooLow).toBeGreaterThan(DEFAULT_UWB_SESSION.fixedReplyRstu)
    // …and both of those really are what the schema wants.
    for (const [slotRstu, fixedReplyRstu] of [[mmsSlot, tooHigh], [4800, tooLow]] as const) {
      expect(uwbSessionIssue(scene({
        ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'time',
        replyTime: 'fixed', slotRstu, fixedReplyRstu,
      })), `slot ${slotRstu}`).toBeNull()
    }
  })

  it('the repair speaks only when the merged session is illegal, and only about that field', () => {
    const at = (slotRstu: number, fixedReplyRstu: number, replyTime: UwbSessionCfg['replyTime']): UwbSessionCfg =>
      ({ ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'time', replyTime, slotRstu, fixedReplyRstu })
    const def = DEFAULT_UWB_SESSION.slotRstu
    const defReply = DEFAULT_UWB_SESSION.fixedReplyRstu
    const mmsSlot = uwbModePatch('mms').slotRstu!
    // The shipped session owes nothing: the shipped slot and the shipped reply time are legal
    // together, which is what keeps every scene byte-identical.
    expect(uwbSessionRepair(at(def, defReply, 'fixed'), WALK_ANCHORS)).toEqual({})
    // Both halves of the defect, and nothing but `fixedReplyRstu` in either patch.
    expect(uwbSessionRepair(at(mmsSlot, defReply, 'fixed'), WALK_ANCHORS))
      .toEqual({ fixedReplyRstu: uwbFixedReplyRstuFor(at(mmsSlot, defReply, 'fixed'), WALK_ANCHORS) })
    expect(uwbSessionRepair(at(4800, defReply, 'fixed'), WALK_ANCHORS))
      .toEqual({ fixedReplyRstu: uwbFixedReplyRstuFor(at(4800, defReply, 'fixed'), WALK_ANCHORS) })
    // Under every other reply-time shape the field is read by nothing, so there is nothing to
    // repair and the repair says nothing — the reason it is conditional rather than unconditional.
    for (const replyTime of ['embedded', 'deferred'] as const) {
      expect(uwbSessionRepair(at(mmsSlot, defReply, replyTime), WALK_ANCHORS), replyTime).toEqual({})
    }
  })

  it('every reachable state is one the schema accepts — no waiver', () => {
    // There used to be one exception here, waived by its state shape: `uwbModePatch`'s MMS branch
    // writes the draft's own 600 RSTU slot, nothing wrote it back on the way out, and the
    // session's default fixed reply time no longer fitted two slots of that width. It is fixed
    // rather than waived now — `uwbSessionRepair` reconciles the reply time against the slot that
    // is actually set — so this assertion has no exceptions left and must not grow one.
    const refused = reachable.filter((r) => uwbSessionIssue(scene(r.s)) !== null)
    expect(refused.map((r) => `${r.trail.join(' -> ')}  =>  ${uwbSessionIssue(scene(r.s))}`)).toEqual([])
  })

  /**
   * **The clamp sites task 3's concern 1 named, exercised directly rather than only through the
   * walk.** `OPS` turns `method`/`schedule`/`replyTime` and `ancillaryFrames` itself, but the walk
   * holds `contentionSlots`/`blockRstu`/`slotRstu` at one fixed value throughout (`WALK_BLOCK_RSTU`
   * is sized so the block-fit term never binds there) — exactly the three raw inputs task 3's own
   * report flagged as a *new kind* of clamp site, because they feed `uwbAncillaryFramesCapFor`'s
   * block-fit term without ever going through a patch function. These tests drive them directly.
   */
  describe('uwbAncillaryFramesCapFor / uwbSessionRepair: the seven clamp sites', () => {
    const base: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'time', replyTime: 'embedded',
      ancillary: true, ancillaryFrames: 1,
    }

    it('the cap outside two-way ranging, and beside sp3, is null — the exchange has no end to run between', () => {
      for (const mode of ['dl-tdoa', 'ul-tdoa', 'mms', 'm2m'] as const) {
        expect(uwbAncillaryFramesCapFor({ ...base, mode }, WALK_ANCHORS), mode).toBeNull()
      }
      expect(uwbAncillaryFramesCapFor({ ...base, sp3: true, replyTime: 'deferred' }, WALK_ANCHORS)).not.toBeNull()
      // sp3 itself does not zero the cap — `uwbSessionRepair` turns `ancillary` off instead (below),
      // which is a different field than the one this function answers about.
    })

    it('the cap referees against the schema at its own boundary, across every (method, schedule, replyTime)', () => {
      // Every combination the schema allows at all (ds+contention and ds+fixed are refused for
      // reasons that have nothing to do with ancillary, so they are excluded the way the method
      // select already keeps them apart in the UI).
      const combos: [UwbSessionCfg['method'], UwbSessionCfg['schedule'], UwbSessionCfg['replyTime']][] = [
        ['ss', 'time', 'embedded'], ['ss', 'time', 'deferred'], ['ss', 'time', 'fixed'],
        ['ds', 'time', 'embedded'], ['ds', 'time', 'deferred'],
        ['ss', 'contention', 'embedded'], ['ss', 'contention', 'fixed'],
      ]
      for (const [method, schedule, replyTime] of combos) {
        const session: UwbSessionCfg = {
          ...base, method, schedule, replyTime, blockRstu: WALK_BLOCK_RSTU,
        }
        const cap = uwbAncillaryFramesCapFor(session, WALK_ANCHORS)
        const where = `${method}/${schedule}/${replyTime}`
        expect(cap, where).not.toBeNull()
        expect(uwbSessionIssue(scene({ ...session, ancillaryFrames: cap! })), `${where} at cap`).toBeNull()
        expect(uwbSessionIssue(scene({ ...session, ancillaryFrames: cap! + 1 })), `${where} one past cap`)
          .not.toBeNull()
      }
    })

    it('the block-fit term binds the cap below the round\'s own slot count when the block is tight', () => {
      // 5 ranging slots (SS-TWR, 4 anchors) at the session default slot; a block that holds the
      // round plus exactly two more slots, not five.
      const slots = uwbSlotsPerTag('ss', WALK_ANCHORS, 'time', 8, 'twr')
      expect(slots).toBe(5)
      const tight: UwbSessionCfg = { ...base, blockRstu: (slots + 2) * DEFAULT_UWB_SESSION.slotRstu }
      const cap = uwbAncillaryFramesCapFor(tight, WALK_ANCHORS)
      expect(cap).toBe(2) // the block-fit term, not `slots` (5) — the smaller of the two ceilings
      expect(uwbSessionIssue(scene({ ...tight, ancillaryFrames: 2 }))).toBeNull()
      expect(uwbSessionIssue(scene({ ...tight, ancillaryFrames: 3 }))).not.toBeNull()
    })

    it('a contention window already too wide for the block makes every ancillaryFrames value illegal — the cap says so by being null, not by lying about a value that would still be refused', () => {
      const slots = uwbSlotsPerTag('ss', WALK_ANCHORS, 'contention', 32, 'twr')
      const wide: UwbSessionCfg = {
        ...base, schedule: 'contention', contentionSlots: 32,
        blockRstu: (slots + 1) * DEFAULT_UWB_SESSION.slotRstu, // room for one extra slot, not 32
      }
      expect(uwbAncillaryFramesCapFor(wide, WALK_ANCHORS)).toBeNull()
      // …and the schema agrees: ancillaryFrames = 1 is still refused, because the appended window
      // is `max(ancillaryFrames, contentionSlots)` and contentionSlots alone already overruns it.
      expect(uwbSessionIssue(scene({ ...wide, ancillaryFrames: 1 }))).not.toBeNull()
      // `uwbSessionRepair` does not silently turn `ancillary` off over this: a null cap is left
      // alone, the same "no window, no rewrite" shape `uwbFixedReplyRstuFor` already uses — the red
      // line under the panel is what surfaces it, not a rewrite of a field the user did not touch.
      expect(uwbSessionRepair(wide, WALK_ANCHORS)).toEqual({})
    })

    it('uwbSessionRepair retargets ancillaryFrames, never deletes it, when method/schedule/replyTime shrink the cap it was legal under', () => {
      // Legal at method 'ds' (cap = uwbSlotsPerTag('ds', 4, 'time', …, 'embedded') = 10): committed
      // at the cap, then the method moves to 'ss' (cap drops to 5) with nothing re-checking
      // ancillaryFrames on the way — the exact shape of the five sites task 2's report named.
      const dsCap = uwbAncillaryFramesCapFor({ ...base, method: 'ds' }, WALK_ANCHORS)!
      const afterMode: UwbSessionCfg = { ...base, method: 'ss', ancillaryFrames: dsCap }
      expect(uwbSessionIssue(scene(afterMode))).not.toBeNull() // the merge alone is illegal…
      const repaired = uwbSessionRepair(afterMode, WALK_ANCHORS)
      expect(repaired).toEqual({ ancillaryFrames: uwbAncillaryFramesCapFor(afterMode, WALK_ANCHORS) })
      expect(uwbSessionIssue(scene({ ...afterMode, ...repaired }))).toBeNull() // …the repair fixes it
    })

    it('blockRstu and slotRstu — two of the three raw inputs with no patch function of their own — each retarget ancillaryFrames through the same repair, without zeroing out the feature', () => {
      // `contentionSlots` is the third: its own destructive case is the previous test, where it
      // pushes the cap all the way to null rather than to a smaller finite value (it feeds the
      // appended window's own floor, `max(ancillaryFrames, contentionSlots)`, so a wide enough draw
      // window leaves no legal frame count at all, not merely a smaller one).
      const contentionBase: UwbSessionCfg = { ...base, schedule: 'contention' }
      const atCap: UwbSessionCfg = { ...contentionBase, ancillaryFrames: uwbAncillaryFramesCapFor(contentionBase, WALK_ANCHORS)! }
      expect(atCap.ancillaryFrames).toBe(9) // the round's own slot count at the session defaults
      expect(uwbSessionIssue(scene(atCap))).toBeNull()

      // blockRstu shrunk: the block-fit budget drops with it, and the repair — not the raw input's
      // own onChange — is what pulls the committed frame count back under the new, smaller cap.
      const shrunkBlock: UwbSessionCfg = { ...atCap, blockRstu: 40_800 }
      expect(uwbSessionIssue(scene(shrunkBlock))).not.toBeNull()
      const blockRepair = uwbSessionRepair(shrunkBlock, WALK_ANCHORS)
      expect(blockRepair).toEqual({ ancillaryFrames: uwbAncillaryFramesCapFor(shrunkBlock, WALK_ANCHORS) })
      expect(blockRepair.ancillaryFrames).toBeLessThan(atCap.ancillaryFrames)
      expect(uwbSessionIssue(scene({ ...shrunkBlock, ...blockRepair }))).toBeNull()

      // slotRstu raised: the same block (in RSTU) now holds far fewer of the wider slots — the
      // identical block-fit effect, through a different field.
      const widerSlot: UwbSessionCfg = { ...atCap, slotRstu: 14_001 } // a multiple of 3, like blockRstu
      expect(uwbSessionIssue(scene(widerSlot))).not.toBeNull()
      const slotRepair = uwbSessionRepair(widerSlot, WALK_ANCHORS)
      expect(slotRepair).toEqual({ ancillaryFrames: uwbAncillaryFramesCapFor(widerSlot, WALK_ANCHORS) })
      expect(slotRepair.ancillaryFrames).toBeLessThan(atCap.ancillaryFrames)
      expect(uwbSessionIssue(scene({ ...widerSlot, ...slotRepair }))).toBeNull()
    })

    it('uwbSessionRepair turns ancillary off the moment sp3 goes up beside it, and the moment the mode leaves twr', () => {
      expect(uwbSessionRepair({ ...base, sp3: true, replyTime: 'deferred' }, WALK_ANCHORS))
        .toEqual({ ancillary: false })
      for (const mode of ['dl-tdoa', 'ul-tdoa', 'mms', 'm2m'] as const) {
        expect(uwbSessionRepair({ ...base, mode }, WALK_ANCHORS), mode).toEqual({ ancillary: false })
      }
      // …and says nothing at all once ancillary is already off, or once the session is already
      // legal — the same "nothing owed, empty patch" discipline every other field above keeps.
      expect(uwbSessionRepair({ ...base, ancillary: false, sp3: true, replyTime: 'deferred' }, WALK_ANCHORS))
        .toEqual({})
      expect(uwbSessionRepair(base, WALK_ANCHORS)).toEqual({})
    })
  })

  it('the two sequences branch-review C1 reported, and the two shorter ones this walk found, all land legal', () => {
    // Kept beside the closure because a named defect deserves a named test: the closure proves
    // the class is closed, these four say which paths taught us it was open. Each is a list of
    // control labels replayed through `OPS`, so they drive the panel's real handlers.
    const replay = (labels: string[]): UwbSessionCfg => {
      let s: UwbSessionCfg = { ...DEFAULT_UWB_SESSION }
      for (const labelName of labels) {
        const op = OPS.find((o) => o.label === labelName)
        expect(op, labelName).toBeDefined()
        expect(op!.live(s), `${labelName} must be a live control at this point`).toBe(true)
        const patch = op!.patch(s)
        expect(patch, labelName).not.toBeNull()
        s = commit(s, patch!)
      }
      return s
    }
    const paths: [string, string[]][] = [
      // C1 path A: srrr.raoa survives an aoa that mode=m2m took down.
      ['C1-A', [
        'method=ss', 'replyTime=deferred', 'aoa=true', 'sp3=true', 'srrr.raoa=true',
        'mode=m2m', 'mode=twr', 'replyTime=deferred', 'sp3=true',
      ]],
      // C1 path B: srrr.rrtt survives the method going to DS while sp3 was down. One step shorter
      // than the review's version of it, which listed a `schedule=time` the panel never offers —
      // the schedule select is greyed out under DS-TWR, and `uwbMethodPatch` has already written
      // that value itself. `replay` asserts every control it touches is live, which is what
      // caught the difference.
      ['C1-B', [
        'method=ss', 'replyTime=deferred', 'sp3=true', 'srrr.rrtt=true',
        'schedule=contention', 'method=ds', 'replyTime=deferred', 'sp3=true',
      ]],
      // Shorter, and the one the review did not name: the sp3 checkbox's own untick is a fourth
      // path that lowers sp3, which is why `uwbSp3Patch` exists.
      ['untick-sp3-then-ds', [
        'method=ss', 'replyTime=deferred', 'sp3=true', 'srrr.rrtt=true', 'sp3=false', 'method=ds', 'sp3=true',
      ]],
      ['untick-sp3-then-aoa', [
        'method=ss', 'replyTime=deferred', 'aoa=true', 'sp3=true', 'srrr.raoa=true', 'sp3=false',
        'aoa=false', 'sp3=true',
      ]],
    ]
    for (const [name, labels] of paths) {
      const s = replay(labels)
      expect(s.sp3, name).toBe(true)
      expect(s.srrr, name).toEqual({ raoa: false, rrtt: false })
      expect(uwbSessionIssue(scene(s)), name).toBeNull()
    }
  })
})
