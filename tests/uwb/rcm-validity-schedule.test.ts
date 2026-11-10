/**
 * Task 3 of docs/superpowers/specs/2026-10-01-rcm-validity-design.md: which rounds carry the
 * control content (standard §10.32.9.1's ARC IE, "RCM Validity Rounds", design §2). No device
 * lands here (Task 4) — this pins `RoundPlan.rcmValidityRounds` and the one predicate,
 * `roundCarriesRcm`, that both ends of a round read to agree on it, and proves the slot table
 * itself does not move underneath that decision.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import { roundCarriesRcm, roundPlan, roundSetOf, slotAction, type RoundPlan } from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })

describe('RoundPlan.rcmValidityRounds', () => {
  it('is read straight off the session config', () => {
    expect(roundPlan(session({ rcmValidityRounds: 1 }), 4).rcmValidityRounds).toBe(1)
    expect(roundPlan(session({ rcmValidityRounds: 4, initiatorRounds: 4 }), 4).rcmValidityRounds).toBe(4)
    expect(roundPlan(session({ rcmValidityRounds: 63, initiatorRounds: 63 }), 4).rcmValidityRounds).toBe(63)
  })
})

// Replaces the block-keyed `blockCarriesRcm` pins (2026-11-10, audit #23): those asserted that the
// control content recurs every R *blocks*, which is non-standard — an RCM's validity counts rounds
// and never exceeds the rounds remaining in the current block (standard §10.32.9.1). What is pinned
// now is the standard's: a ranging round set is R consecutive rounds of one initiator inside one
// block (§10.32.3.2), the RCM rides its first round, and the set is cut short rather than crossing
// into the next block or another tag's rounds.
describe('roundCarriesRcm — ranging round sets inside a block', () => {
  it('carries the control content on the first round of every set of R, and only there', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(session({ rcmValidityRounds: r, initiatorRounds: 3 * r }), 4)
      for (let round = 0; round < 3 * r; round++) {
        expect(roundCarriesRcm(p, round), `R=${r} round=${round}`).toBe(round % r === 0)
      }
    }
  })

  it('is byte-identical to the one-round-per-block session when R is 1: every round carries it', () => {
    const p = roundPlan(session({ rcmValidityRounds: 1, initiatorRounds: 8 }), 4)
    for (let round = 0; round < 8; round++) {
      expect(roundCarriesRcm(p, round)).toBe(true)
    }
  })

  it('never lets a set outlive its block or reach another tag: the last set is cut to the rounds left', () => {
    // Five rounds a tag, R = 2: sets {0,1}, {2,3}, {4} — the last RCM governs one round (§10.32.9.1).
    const p = roundPlan(session({ rcmValidityRounds: 2, initiatorRounds: 5 }), 4)
    expect([0, 1, 2, 3, 4].map((r) => roundSetOf(p, r))).toEqual([
      { first: 0, length: 2, index: 0 }, { first: 0, length: 2, index: 1 },
      { first: 2, length: 2, index: 0 }, { first: 2, length: 2, index: 1 },
      { first: 4, length: 1, index: 0 },
    ])
    // The second tag's rounds 5…9 start a run of their own: its first round opens a set.
    expect(roundSetOf(p, 5)).toEqual({ first: 5, length: 2, index: 0 })
    expect(roundSetOf(p, 9)).toEqual({ first: 9, length: 1, index: 0 })
  })

  it('makes every round of every non-two-way mode a one-round set', () => {
    for (const mode of ['dl-tdoa', 'ul-tdoa', 'm2m'] as const) {
      const p = roundPlan(session({ mode, rcmValidityRounds: 1 }), 4)
      expect(p.initiatorRounds, mode).toBe(1)
      for (let round = 0; round < 3; round++) expect(roundSetOf(p, round), mode).toEqual({ first: round, length: 1, index: 0 })
    }
  })
})

describe('the slot table itself does not change with rcmValidityRounds', () => {
  it("slotAction's result is identical to the R=1 case, slot for slot, for every R", () => {
    for (const method of ['ss', 'ds'] as const) {
      const base = roundPlan(session({ method, rcmValidityRounds: 1 }), 4)
      for (const r of [1, 2, 4, 63]) {
        const p: RoundPlan = roundPlan(session({ method, rcmValidityRounds: r, initiatorRounds: r }), 4)
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
