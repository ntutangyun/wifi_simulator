/**
 * Task 3 of docs/superpowers/specs/2026-10-01-rcm-validity-design.md: which rounds carry the
 * control content (standard §10.32.9.1's ARC IE, "RCM Validity Rounds", design §2). No device
 * lands here (Task 4) — this pins `RoundPlan.rcmValidityRounds` and the one predicate,
 * `roundCarriesRcm`, that both ends of a round read to agree on it, and proves the slot table
 * itself does not move underneath that decision.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import { roundCarriesRcm, roundPlan, slotAction, type RoundPlan } from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })

describe('RoundPlan.rcmValidityRounds', () => {
  it('is read straight off the session config', () => {
    expect(roundPlan(session({ rcmValidityRounds: 1 }), 4).rcmValidityRounds).toBe(1)
    expect(roundPlan(session({ rcmValidityRounds: 4 }), 4).rcmValidityRounds).toBe(4)
    expect(roundPlan(session({ rcmValidityRounds: 64 }), 4).rcmValidityRounds).toBe(64)
  })
})

describe('roundCarriesRcm', () => {
  it('carries the control content on the first round of every R, and only there', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(session({ rcmValidityRounds: r }), 4)
      for (let round = 0; round < 3 * r; round++) {
        expect(roundCarriesRcm(p, round), `R=${r} round=${round}`).toBe(round % r === 0)
      }
    }
  })

  it('is byte-identical to today when R is 1: every round carries the control content', () => {
    const p = roundPlan(session({ rcmValidityRounds: 1 }), 4)
    for (let round = 0; round < 8; round++) {
      expect(roundCarriesRcm(p, round)).toBe(true)
    }
  })
})

describe('the slot table itself does not change with rcmValidityRounds', () => {
  it("slotAction's result is identical to the R=1 case, slot for slot, for every R", () => {
    for (const method of ['ss', 'ds'] as const) {
      const base = roundPlan(session({ method, rcmValidityRounds: 1 }), 4)
      for (const r of [1, 2, 4, 64]) {
        const p: RoundPlan = roundPlan(session({ method, rcmValidityRounds: r }), 4)
        expect(p.slots, `method=${method} R=${r}`).toBe(base.slots)
        for (let slot = 0; slot < p.slots; slot++) {
          expect(slotAction(p, slot), `method=${method} R=${r} slot=${slot}`).toEqual(slotAction(base, slot))
        }
      }
    }
  })

  it('also holds for a contention round and for DL-TDoA (R forced to 1 by schema, checked anyway)', () => {
    const contentionBase = roundPlan(session({ method: 'ss', schedule: 'contention', contentionSlots: 8 }), 4)
    for (const r of [1, 2]) {
      const p = roundPlan(session({ method: 'ss', schedule: 'contention', contentionSlots: 8, rcmValidityRounds: r }), 4)
      for (let slot = 0; slot < p.slots; slot++) {
        expect(slotAction(p, slot)).toEqual(slotAction(contentionBase, slot))
      }
    }
    const dlBase = roundPlan(session({ mode: 'dl-tdoa' }), 4)
    for (const r of [1, 2]) {
      const p = roundPlan(session({ mode: 'dl-tdoa', rcmValidityRounds: r }), 4)
      for (let slot = 0; slot < p.slots; slot++) {
        expect(slotAction(p, slot)).toEqual(slotAction(dlBase, slot))
      }
    }
  })
})
