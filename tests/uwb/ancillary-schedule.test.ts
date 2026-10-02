/**
 * Task 2 of docs/superpowers/specs/2026-10-02-ancillary-design.md: `RoundPlan.ancillary` /
 * `RoundPlan.ancillaryFrames`, the session-config mirror of the fields
 * `tests/model/ancillary-scenario.test.ts` pins on the scenario schema. No device or network
 * wiring lands here (a later task's job, same as `sp3`'s own doc comment on `RoundPlan` says of
 * itself) — this pins that `roundPlan` reads the two fields straight off the session, and that the
 * slot table itself does not move underneath them, the identical shape
 * `rcm-validity-schedule.test.ts` pins for `rcmValidityRounds`.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import { roundPlan, slotAction, type RoundPlan } from '../../src/uwb/session'
import { RAICT_IE_MIN_BYTES, raictIeBytes, uwbSlotsPerTag } from '../../src/uwb/phy'
import { makeAncillary } from '../../src/uwb/frames'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })

describe('RoundPlan.ancillary / RoundPlan.ancillaryFrames', () => {
  it('are read straight off the session config', () => {
    expect(roundPlan(session({ ancillary: false, ancillaryFrames: 1 }), 2).ancillary).toBe(false)
    expect(roundPlan(session({ ancillary: false, ancillaryFrames: 1 }), 2).ancillaryFrames).toBe(1)
    expect(roundPlan(session({ ancillary: true, ancillaryFrames: 3 }), 2).ancillary).toBe(true)
    expect(roundPlan(session({ ancillary: true, ancillaryFrames: 3 }), 2).ancillaryFrames).toBe(3)
  })

  it('a plan copied from the config cannot see the config edited underneath it (same convention sp3/srrr use)', () => {
    const cfg = session({ ancillary: true, ancillaryFrames: 3 })
    const plan: RoundPlan = roundPlan(cfg, 2)
    cfg.ancillary = false
    cfg.ancillaryFrames = 1
    expect(plan.ancillary).toBe(true)
    expect(plan.ancillaryFrames).toBe(3)
  })
})

describe('the slot table itself does not change with ancillary/ancillaryFrames (Task 2 is schema-only)', () => {
  // This task deliberately does not wire any device or network behaviour to these two fields (see
  // this file's own header, and `UwbSessionCfg.ancillary`'s own doc comment) — no slot is added,
  // moved or removed because of them. Pinned here, the same discipline
  // `rcm-validity-schedule.test.ts` applies to `rcmValidityRounds`, so a later task that *does*
  // wire slot behaviour changes this expectation deliberately rather than by accident.
  it("slotAction's result is identical whatever ancillary/ancillaryFrames are set to", () => {
    const base = roundPlan(session({ ancillary: false, ancillaryFrames: 1 }), 2)
    for (const over of [
      { ancillary: true, ancillaryFrames: 1 },
      { ancillary: true, ancillaryFrames: 3 },
      { ancillary: true, ancillaryFrames: 6 },
    ]) {
      const p = roundPlan(session(over), 2)
      expect(p.slots, JSON.stringify(over)).toBe(base.slots)
      for (let slot = 0; slot < p.slots; slot++) {
        expect(slotAction(p, slot), `${JSON.stringify(over)} slot=${slot}`).toEqual(slotAction(base, slot))
      }
    }
  })
})

describe("Ruling: ancillary true + ancillaryFrames 1 is not a permitted-yet-inert configuration", () => {
  /**
   * The ruling task-2-brief.md asks for (also recorded in
   * tests/model/ancillary-scenario.test.ts and the task report): a one-frame message has nothing
   * to segment, so the Frames Remaining countdown is trivially a single value, 0. That is not the
   * same failure as the three this branch has already found and fixed —
   *
   *   - `contention` + `rmnr`: no RMNR frame could ever be built, under any input, full stop.
   *   - `srrr.rrtt` outside SS-TWR: no frame on the air ever reads the request bit back.
   *   - `sp3` + `method: 'ds'` + `srrr.raoa`: same shape, no frame answers the request.
   *
   * In all three, turning the switch on produced byte-for-byte the same round as turning it off.
   * `ancillary: true` + `ancillaryFrames: 1` does not: `makeAncillary` (Task 1) still builds one
   * real frame with a real RAICT IE, and when the Frames Remaining octet is present it carries a
   * real, meaningful value — "zero more fragments are coming" — which a receiver uses to know the
   * message is complete without waiting for anything else (design §4.3's own distinguishing point
   * for this IE, against RMNR's and MMRCM's coarser granularities). This describe block proves that
   * octet is a real, present byte, not a no-op some reconciliation step quietly drops.
   */
  it('the complete one-frame case (Frames Remaining present, value 0) costs a real byte over the bare minimum', () => {
    const bare = raictIeBytes(false, false)
    const oneFrame = raictIeBytes(false, true)
    expect(bare).toBe(RAICT_IE_MIN_BYTES)
    // The Frames Remaining octet is genuinely there — this is not the same width as the bare
    // control octet alone, so "frames remaining = 0" is a real byte on the air, not an absent one.
    expect(oneFrame).toBe(RAICT_IE_MIN_BYTES + 1)
    expect(oneFrame).toBeGreaterThan(bare)
  })

  it('that one-frame message is a real, buildable frame (Task 1\'s makeAncillary), carrying a real "0 remaining"', () => {
    // ancillaryFrames: 1's own fragment: Frames Remaining present and 0 (nothing left to send),
    // exactly the value a real device would put on the air to tell the receiver the message is
    // already complete. Built with the identical function — and identical frame kind,
    // `'uwbAncillary'` — a segmented (N > 1) message's own fragments use; there is no separate
    // "degenerate, one-frame" code path that silently does nothing.
    const frame = makeAncillary('anc-1', 'tag-1', 0, 0, 1, false, true, { framesRemaining: 0 })
    expect(frame.kind).toBe('uwbAncillary')
    expect(frame.uwb?.raict?.framesRemaining).toBe(0)
    expect(frame.uwb?.raict?.messageNumber).toBeUndefined()
    expect(frame.bytes).toBeGreaterThan(0)
  })
})

describe('the ancillaryFrames cap reads a different, real number under each schedule', () => {
  // task-2-brief.md: both schedules must run the exchange (standard §10.35.1), and if contention
  // turned out unable to do anything differently from time-scheduling, that would be a finding to
  // report rather than a reason to refuse it. This is the one piece of that question Task 2's own
  // scope can answer: the round shape contention actually produces (`uwbSlotsPerTag`, which
  // `roundPlan` and the scenario schema both read) is a genuinely different slot count from the
  // time-scheduled round, at the same anchor count — not the same number arrived at two ways. Full
  // proof that the two schedules place the ancillary frames differently on the air is a later
  // task's own (no device wiring exists yet to place them with at all — see this file's header).
  it('contention (1 + contentionSlots) differs from time-scheduled (anchors + 1) at the same anchor count', () => {
    const anchors = 2
    const timeSlots = uwbSlotsPerTag('ss', anchors, 'time', 8, 'twr', undefined, undefined, 'embedded')
    const contentionSlots = uwbSlotsPerTag('ss', anchors, 'contention', 8, 'twr', undefined, undefined, 'embedded')
    expect(timeSlots).toBe(anchors + 1)
    expect(contentionSlots).toBe(1 + 8)
    expect(contentionSlots).not.toBe(timeSlots)
  })
})
