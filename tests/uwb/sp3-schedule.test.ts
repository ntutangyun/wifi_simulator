/**
 * Task 2 of docs/superpowers/specs/2026-10-02-sp3-design.md: `RoundPlan.sp3`/`RoundPlan.srrr`, read
 * straight off the session config the same way `replyTime`/`rcmValidityRounds`/`mmrcr` are.
 *
 * No device and no frame builder lands here (that is a later task) — `sp3` by itself changes no
 * slot count and no `slotAction` answer. `uwbSlotsPerTag`'s existing `2A + 1` for a deferred SS
 * round (`replyTime: 'deferred'`, standard §10.29.6.3) is already exactly the shape SP3 markers
 * plus one measurement-report frame per responder fill: A+1 marker slots (Poll + A Responses) and
 * A report slots, same total as today's deferred follow-up messages. This file pins that the slot
 * table does not move underneath `sp3`, which is what makes "this task touches only the config
 * field" a true statement rather than an assumption.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, DEFAULT_UWB_SRRR, type UwbSessionCfg } from '../../src/model/scenario'
import { roundPlan, slotAction } from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({
  ...DEFAULT_UWB_SESSION, mode: 'twr', schedule: 'time', replyTime: 'deferred', ...over,
})

describe('RoundPlan.sp3', () => {
  it('is read straight off the session config', () => {
    expect(roundPlan(session({ sp3: false }), 3).sp3).toBe(false)
    expect(roundPlan(session({ sp3: true }), 3).sp3).toBe(true)
  })

  it('defaults to false — an existing round plan is unaffected', () => {
    expect(roundPlan(DEFAULT_UWB_SESSION, 3).sp3).toBe(false)
  })
})

describe('RoundPlan.srrr', () => {
  it('is read straight off the session config, copied rather than aliased', () => {
    const cfg = session({ srrr: { raoa: true, rrtt: false } })
    const p = roundPlan(cfg, 3)
    expect(p.srrr).toEqual({ raoa: true, rrtt: false })
    // Copied: mutating the plan's own copy must not reach back into the scenario's config object —
    // the same discipline `mms` below is held to ("a plan outlives the scenario object it was
    // built from, and a device reading the train's shape must not be able to see it edited
    // underneath").
    p.srrr.raoa = false
    expect(cfg.srrr.raoa).toBe(true)
  })

  it('defaults to {raoa: false, rrtt: false} — an existing round plan is unaffected', () => {
    expect(roundPlan(DEFAULT_UWB_SESSION, 3).srrr).toEqual(DEFAULT_UWB_SRRR)
  })
})

describe('sp3 changes no slot count and no slotAction answer (design §2: it reuses the deferred shape exactly)', () => {
  it('SS-TWR: slots and every slotAction answer are identical with sp3 on or off', () => {
    for (const anchors of [1, 2, 4]) {
      const off = roundPlan(session({ method: 'ss', sp3: false }), anchors)
      const on = roundPlan(session({ method: 'ss', sp3: true }), anchors)
      expect(on.slots, `anchors=${anchors}`).toBe(off.slots)
      expect(on.roundNs, `anchors=${anchors}`).toBe(off.roundNs)
      for (let slot = 0; slot < off.slots; slot++) {
        expect(slotAction(on, slot), `anchors=${anchors} slot=${slot}`).toEqual(slotAction(off, slot))
      }
    }
  })

  it('DS-TWR: slots and every slotAction answer are identical with sp3 on or off', () => {
    for (const anchors of [1, 2, 4]) {
      const off = roundPlan(session({ method: 'ds', sp3: false }), anchors)
      const on = roundPlan(session({ method: 'ds', sp3: true }), anchors)
      expect(on.slots, `anchors=${anchors}`).toBe(off.slots)
      for (let slot = 0; slot < off.slots; slot++) {
        expect(slotAction(on, slot), `anchors=${anchors} slot=${slot}`).toEqual(slotAction(off, slot))
      }
    }
  })

  it('an SP3 round is exactly the deferred-reply-time slot shape: 2A + 1 slots for SS, A + 2 + A for DS', () => {
    const anchors = 3
    const ss = roundPlan(session({ method: 'ss', sp3: true }), anchors)
    expect(ss.slots).toBe(2 * anchors + 1)
    const ds = roundPlan(session({ method: 'ds', sp3: true }), anchors)
    expect(ds.slots).toBe(2 * anchors + 2)
  })
})
