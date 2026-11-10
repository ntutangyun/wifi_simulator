/**
 * Task 2 of docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md: where the MMRCM
 * frame (standard §10.36, task 1's pure frame layer) sits in the slot table. No device lands here
 * (that is a later task) — this pins `RoundPlan.mmrcr` and the three functions that describe the
 * extra slot(s) (`roundCarriesMmrcm`, `mmrcmResponders`, `roundSlots`), plus `roundSlotAction`,
 * which is the one function that actually varies with the round's place in its ranging round set
 * and so is the one the "rounds 0…R−2 of a set are identical to `mmrcr: false`" requirement
 * genuinely exercises — `slotAction` itself never reads `mmrcr` and cannot fail this on its own.
 *
 * Rewritten 2026-11-10 (audit #23). Every assertion here used to be keyed by the BLOCK index — the
 * confirmation went out on block R − 1, the block that closed an R-block window — because each tag
 * had one round a block and the validity window was counted in blocks. That pinned non-standard
 * behaviour: an RCM's validity counts rounds and never exceeds the rounds remaining in the current
 * block (§10.32.9.1). The same assertions now pin the standard's: the set is R consecutive rounds of
 * one tag inside one block (§10.32.3.2), and the confirmation rides the set's last round.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import {
  blockSlotStartNs, mmrcmResponders, roundCarriesMmrcm, roundPlan, roundSlotAction, roundSlots,
  slotAction, slotStartNs,
} from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })
/** A session whose tag runs `n` rounds a block, so a set of up to `n` rounds fits in one block. */
const sets = (r: number, n: number, over: Partial<UwbSessionCfg> = {}): UwbSessionCfg =>
  session({ rcmValidityRounds: r, initiatorRounds: n, ...over })

describe('RoundPlan.mmrcr', () => {
  it('is read straight off the session config', () => {
    expect(roundPlan(session({ mmrcr: false }), 4).mmrcr).toBe(false)
    expect(roundPlan(session({ mmrcr: true }), 4).mmrcr).toBe(true)
  })

  it('defaults to false — an existing round plan is unaffected', () => {
    expect(roundPlan(DEFAULT_UWB_SESSION, 4).mmrcr).toBe(false)
  })
})

describe('roundCarriesMmrcm', () => {
  it('is false on every round when mmrcr is off, whatever rcmValidityRounds is', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(sets(r, 3 * r, { mmrcr: false }), 4)
      for (let round = 0; round < 3 * r; round++) {
        expect(roundCarriesMmrcm(p, round), `r=${r} round=${round}`).toBe(false)
      }
    }
  })

  it('is true only on the round that closes each ranging round set — the one before the next set opens', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(sets(r, 3 * r, { mmrcr: true }), 4)
      for (let round = 0; round < 3 * r; round++) {
        expect(roundCarriesMmrcm(p, round), `r=${r} round=${round}`).toBe(round % r === r - 1)
      }
    }
  })

  it('at rcmValidityRounds 1, every round is a set of one closing on itself', () => {
    const p = roundPlan(sets(1, 5, { mmrcr: true }), 4)
    for (let round = 0; round < 5; round++) expect(roundCarriesMmrcm(p, round)).toBe(true)
  })

  it('closes a cut-short last set on the block’s last round of the tag, never in the next block', () => {
    // Five rounds a tag, R = 2: sets {0,1}, {2,3}, {4}; the last one closes on round 4 itself.
    const p = roundPlan(sets(2, 5, { mmrcr: true }), 4)
    expect([0, 1, 2, 3, 4].map((round) => roundCarriesMmrcm(p, round))).toEqual([false, true, false, true, true])
  })
})

describe('mmrcmResponders', () => {
  it('is 0 whenever mmrcr is off, in every mode', () => {
    expect(mmrcmResponders(roundPlan(session({ mmrcr: false, mode: 'twr' }), 4))).toBe(0)
    expect(mmrcmResponders(roundPlan(session({ mmrcr: false, mode: 'm2m' }), 3))).toBe(0)
  })

  it('is one per anchor in a two-way round, because an anchor is what sends one', () => {
    // This test asserted 1 at first — "the single tag the round belongs to" — and that was the bug
    // rather than the rule. §10.36 has two counts: the IE carries one entry per *initiator*, since
    // one responder may have heard several, while the slots are one per *responder*, since each
    // responder sends its own frame. A two-way round has one tag and A anchors, so A frames need A
    // slots; budgeting one left every anchor answering from the same slot.
    for (const anchors of [1, 2, 4]) {
      expect(mmrcmResponders(roundPlan(session({ mmrcr: true, mode: 'twr' }), anchors))).toBe(anchors)
    }
  })

  it("is every participant for m2m — design §2's hint, checked rather than assumed", () => {
    for (const n of [2, 3, 6]) {
      const p = roundPlan(session({ mmrcr: true, mode: 'm2m' }), n)
      expect(p.participants).toBe(n)
      expect(mmrcmResponders(p)).toBe(n)
    }
  })
})

describe('roundSlots', () => {
  it('equals plan.slots on every round when mmrcr is off', () => {
    const p = roundPlan(sets(4, 8, { mmrcr: false }), 4)
    for (let round = 0; round < 8; round++) expect(roundSlots(p, round)).toBe(p.slots)
  })

  it('grows by mmrcmResponders only on the set-closing round, twr', () => {
    const p = roundPlan(sets(4, 8, { mmrcr: true, mode: 'twr' }), 2)
    for (let round = 0; round < 8; round++) {
      // +2, one per anchor — not +1. See `mmrcmResponders`' own test above.
      const expected = round % 4 === 3 ? p.slots + 2 : p.slots
      expect(roundSlots(p, round), `round=${round}`).toBe(expected)
    }
  })

  it('grows by participants every round for m2m (rcmValidityRounds pinned at 1)', () => {
    const p = roundPlan(session({ mmrcr: true, mode: 'm2m', rcmValidityRounds: 1 }), 3)
    expect(roundSlots(p, 0)).toBe(p.slots + 3)
  })
})

describe('rounds 0…R−2 of a set are identical to mmrcr: false, slot for slot (task-2-brief.md)', () => {
  it('twr: same slot count and same slotAction answers below plan.slots', () => {
    for (const r of [2, 4, 8]) {
      const off = roundPlan(sets(r, r, { mmrcr: false }), 3)
      const on = roundPlan(sets(r, r, { mmrcr: true }), 3)
      for (let round = 0; round < r - 1; round++) {
        // The slot count itself must not have grown yet.
        expect(roundSlots(on, round), `r=${r} round=${round}`).toBe(roundSlots(off, round))
        expect(roundSlots(on, round), `r=${r} round=${round}`).toBe(on.slots)
        for (let slot = 0; slot < on.slots; slot++) {
          expect(roundSlotAction(on, round, slot), `r=${r} round=${round} slot=${slot}`)
            .toEqual(roundSlotAction(off, round, slot))
          expect(roundSlotAction(on, round, slot), `r=${r} round=${round} slot=${slot}`)
            .toEqual(slotAction(on, slot))
        }
      }
    }
  })

  it('the set-closing round (R−1) is where the two plans finally differ', () => {
    for (const r of [2, 4]) {
      const off = roundPlan(sets(r, r, { mmrcr: false }), 3)
      const on = roundPlan(sets(r, r, { mmrcr: true }), 3)
      const closing = r - 1
      // Three anchors, so three new slots — one per responder.
      expect(roundSlots(on, closing), `r=${r}`).toBe(roundSlots(off, closing) + 3)
      // Every slot below plan.slots still agrees...
      for (let slot = 0; slot < on.slots; slot++) {
        expect(roundSlotAction(on, closing, slot)).toEqual(roundSlotAction(off, closing, slot))
      }
      // ...and each new slot answers for one responder, in order, none of them present in the
      // off plan at all.
      for (let i = 0; i < 3; i++) {
        expect(roundSlotAction(on, closing, on.slots + i)).toEqual({ kind: 'uwbMmrcm', index: i })
      }
      expect(() => roundSlotAction(off, closing, off.slots)).toThrow()
    }
  })
})

describe('roundSlotAction', () => {
  it('passes every slot below plan.slots straight through to slotAction, in every round', () => {
    const p = roundPlan(sets(4, 8, { mmrcr: true }), 2)
    for (let round = 0; round < 8; round++) {
      for (let slot = 0; slot < p.slots; slot++) {
        expect(roundSlotAction(p, round, slot)).toEqual(slotAction(p, slot))
      }
    }
  })

  it('one MMRCM slot per responder, indexed in order, on the m2m round', () => {
    const p = roundPlan(session({ mmrcr: true, mode: 'm2m', rcmValidityRounds: 1 }), 3)
    for (let i = 0; i < 3; i++) {
      expect(roundSlotAction(p, 0, p.slots + i)).toEqual({ kind: 'uwbMmrcm', index: i })
    }
    // One past the last responder: no more MMRCM slots to hand out.
    expect(() => roundSlotAction(p, 0, p.slots + 3)).toThrow()
  })

  it('throws asking for an MMRCM-range slot on a round that does not close a set', () => {
    const p = roundPlan(sets(4, 4, { mmrcr: true, mode: 'twr' }), 2)
    expect(() => roundSlotAction(p, 0, p.slots)).toThrow()
    expect(() => roundSlotAction(p, 1, p.slots)).toThrow()
    expect(() => roundSlotAction(p, 2, p.slots)).toThrow()
    // Round 3 (= R − 1) is the one that does.
    expect(roundSlotAction(p, 3, p.slots)).toEqual({ kind: 'uwbMmrcm', index: 0 })
  })

  it('throws asking for any slot at all when mmrcr is off and slot >= plan.slots', () => {
    const p = roundPlan(sets(4, 4, { mmrcr: false }), 2)
    expect(() => roundSlotAction(p, 3, p.slots)).toThrow()
  })
})

describe('blockSlotStartNs: rounds start where the rounds before them end', () => {
  it('is slotStartNs exactly, slot for slot, whenever mmrcr is off', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(sets(r, r, { mmrcr: false }), 3)
      for (let block = 0; block < 2; block++) {
        for (let round = 0; round < r; round++) {
          for (let slot = 0; slot < p.slots; slot++) {
            expect(blockSlotStartNs(p, block, round, slot), `r=${r} b=${block} round=${round} s=${slot}`)
              .toBe(slotStartNs(p, block, round, slot))
          }
        }
      }
    }
  })

  it('keeps the round after a set-closing round clear of its extra slots, which plan.roundNs could not', () => {
    // The collision this function exists to prevent: with the extra slots appended to a round and the
    // stride left at `plan.roundNs`, the set-closing round's MMRCM slots land exactly on the next
    // round's slots 0…A−1 — two transmitters in one slot, and nothing downstream able to notice.
    // Two sets of two rounds a block: round 1 closes the first set, round 2 opens the second.
    const p = roundPlan(sets(2, 4, { mmrcr: true }), 3)
    const closing = 1
    const slots = roundSlots(p, closing)
    expect(slots, 'three anchors, so three extra slots').toBe(p.slots + 3)
    const endOfClosing = blockSlotStartNs(p, 0, closing, slots - 1) + p.slotNs
    expect(blockSlotStartNs(p, 0, closing + 1, 0)).toBe(endOfClosing)
    // …and the stride a `plan.roundNs` layout would have used is *inside* the closing round, which is
    // precisely the overlap.
    expect(slotStartNs(p, 0, closing + 1, 0)).toBeLessThan(endOfClosing)
    // Rounds before the first set closes are untouched: the same instants as `slotStartNs`.
    expect(blockSlotStartNs(p, 0, 1, 0)).toBe(slotStartNs(p, 0, 1, 0))
    // And the next block starts on the block boundary, whatever the rounds of this one appended.
    expect(blockSlotStartNs(p, 1, 0, 0)).toBe(p.blockNs)
  })
})
