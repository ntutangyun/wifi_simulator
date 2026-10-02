/**
 * Task 2 of docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md: where the MMRCM
 * frame (standard §10.36, task 1's pure frame layer) sits in the slot table. No device lands here
 * (that is a later task) — this pins `RoundPlan.mmrcr` and the three functions that describe the
 * extra slot(s) (`blockCarriesMmrcm`, `mmrcmInitiators`, `blockSlots`), plus `blockSlotAction`,
 * which is the one function that actually varies with `block` and so is the one the "blocks
 * 0…R−2 are identical to `mmrcr: false`" requirement (task-2-brief.md) genuinely exercises —
 * `slotAction` itself never reads `mmrcr` and cannot fail this on its own.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import {
  blockCarriesMmrcm, blockSlotAction, blockSlots, mmrcmInitiators, roundPlan, slotAction,
} from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })

describe('RoundPlan.mmrcr', () => {
  it('is read straight off the session config', () => {
    expect(roundPlan(session({ mmrcr: false }), 4).mmrcr).toBe(false)
    expect(roundPlan(session({ mmrcr: true }), 4).mmrcr).toBe(true)
  })

  it('defaults to false — an existing round plan is unaffected', () => {
    expect(roundPlan(DEFAULT_UWB_SESSION, 4).mmrcr).toBe(false)
  })
})

describe('blockCarriesMmrcm', () => {
  it('is false on every block when mmrcr is off, whatever rcmValidityRounds is', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(session({ mmrcr: false, rcmValidityRounds: r }), 4)
      for (let block = 0; block < 3 * r; block++) {
        expect(blockCarriesMmrcm(p, block), `r=${r} block=${block}`).toBe(false)
      }
    }
  })

  it('is true only on the block that closes each window — one less than blockCarriesRcm\'s own opening block', () => {
    for (const r of [1, 2, 4]) {
      const p = roundPlan(session({ mmrcr: true, rcmValidityRounds: r }), 4)
      for (let block = 0; block < 3 * r; block++) {
        expect(blockCarriesMmrcm(p, block), `r=${r} block=${block}`).toBe(block % r === r - 1)
      }
    }
  })

  it('at rcmValidityRounds 1, every block is a window of one closing on itself', () => {
    const p = roundPlan(session({ mmrcr: true, rcmValidityRounds: 1 }), 4)
    for (let block = 0; block < 5; block++) expect(blockCarriesMmrcm(p, block)).toBe(true)
  })
})

describe('mmrcmInitiators', () => {
  it('is 0 whenever mmrcr is off, in every mode', () => {
    expect(mmrcmInitiators(roundPlan(session({ mmrcr: false, mode: 'twr' }), 4))).toBe(0)
    expect(mmrcmInitiators(roundPlan(session({ mmrcr: false, mode: 'm2m' }), 3))).toBe(0)
  })

  it('is 1 for a two-way round — the single tag it belongs to', () => {
    for (const anchors of [1, 2, 4]) {
      expect(mmrcmInitiators(roundPlan(session({ mmrcr: true, mode: 'twr' }), anchors))).toBe(1)
    }
  })

  it("is every participant for m2m — design §2's hint, checked rather than assumed", () => {
    for (const n of [2, 3, 6]) {
      const p = roundPlan(session({ mmrcr: true, mode: 'm2m' }), n)
      expect(p.participants).toBe(n)
      expect(mmrcmInitiators(p)).toBe(n)
    }
  })
})

describe('blockSlots', () => {
  it('equals plan.slots on every block when mmrcr is off', () => {
    const p = roundPlan(session({ mmrcr: false, rcmValidityRounds: 4 }), 4)
    for (let block = 0; block < 8; block++) expect(blockSlots(p, block)).toBe(p.slots)
  })

  it('grows by mmrcmInitiators only on the window-closing block, twr', () => {
    const p = roundPlan(session({ mmrcr: true, mode: 'twr', rcmValidityRounds: 4 }), 2)
    for (let block = 0; block < 8; block++) {
      const expected = block % 4 === 3 ? p.slots + 1 : p.slots
      expect(blockSlots(p, block), `block=${block}`).toBe(expected)
    }
  })

  it('grows by participants every block for m2m (rcmValidityRounds pinned at 1)', () => {
    const p = roundPlan(session({ mmrcr: true, mode: 'm2m', rcmValidityRounds: 1 }), 3)
    for (let block = 0; block < 4; block++) expect(blockSlots(p, block)).toBe(p.slots + 3)
  })
})

describe("blocks 0…R−2 of a window are identical to mmrcr: false, slot for slot (task-2-brief.md)", () => {
  it('twr: same slot count and same slotAction answers below plan.slots', () => {
    for (const r of [2, 4, 8]) {
      const off = roundPlan(session({ mmrcr: false, rcmValidityRounds: r }), 3)
      const on = roundPlan(session({ mmrcr: true, rcmValidityRounds: r }), 3)
      for (let block = 0; block < r - 1; block++) {
        // The slot count itself must not have grown yet.
        expect(blockSlots(on, block), `r=${r} block=${block}`).toBe(blockSlots(off, block))
        expect(blockSlots(on, block), `r=${r} block=${block}`).toBe(on.slots)
        for (let slot = 0; slot < on.slots; slot++) {
          expect(blockSlotAction(on, block, slot), `r=${r} block=${block} slot=${slot}`)
            .toEqual(blockSlotAction(off, block, slot))
          expect(blockSlotAction(on, block, slot), `r=${r} block=${block} slot=${slot}`)
            .toEqual(slotAction(on, slot))
        }
      }
    }
  })

  it('the window-closing block (R−1) is where the two plans finally differ', () => {
    for (const r of [2, 4]) {
      const off = roundPlan(session({ mmrcr: false, rcmValidityRounds: r }), 3)
      const on = roundPlan(session({ mmrcr: true, rcmValidityRounds: r }), 3)
      const closing = r - 1
      expect(blockSlots(on, closing), `r=${r}`).toBe(blockSlots(off, closing) + 1)
      // Every slot below plan.slots still agrees...
      for (let slot = 0; slot < on.slots; slot++) {
        expect(blockSlotAction(on, closing, slot)).toEqual(blockSlotAction(off, closing, slot))
      }
      // ...and the one new slot is the MMRCM answer, not present at all in the off plan.
      expect(blockSlotAction(on, closing, on.slots)).toEqual({ kind: 'uwbMmrcm', index: 0 })
      expect(() => blockSlotAction(off, closing, off.slots)).toThrow()
    }
  })
})

describe('blockSlotAction', () => {
  it('passes every slot below plan.slots straight through to slotAction, in every block', () => {
    const p = roundPlan(session({ mmrcr: true, rcmValidityRounds: 4 }), 2)
    for (let block = 0; block < 8; block++) {
      for (let slot = 0; slot < p.slots; slot++) {
        expect(blockSlotAction(p, block, slot)).toEqual(slotAction(p, slot))
      }
    }
  })

  it('one MMRCM slot per initiator, indexed in order, only on the window-closing block', () => {
    const p = roundPlan(session({ mmrcr: true, mode: 'm2m', rcmValidityRounds: 1 }), 3)
    for (let i = 0; i < 3; i++) {
      expect(blockSlotAction(p, 0, p.slots + i)).toEqual({ kind: 'uwbMmrcm', index: i })
    }
    // One past the last initiator: no more MMRCM slots to hand out.
    expect(() => blockSlotAction(p, 0, p.slots + 3)).toThrow()
  })

  it('throws asking for an MMRCM-range slot on a block that does not close a window', () => {
    const p = roundPlan(session({ mmrcr: true, mode: 'twr', rcmValidityRounds: 4 }), 2)
    expect(() => blockSlotAction(p, 0, p.slots)).toThrow()
    expect(() => blockSlotAction(p, 1, p.slots)).toThrow()
    expect(() => blockSlotAction(p, 2, p.slots)).toThrow()
    // Block 3 (= R − 1) is the one that does.
    expect(blockSlotAction(p, 3, p.slots)).toEqual({ kind: 'uwbMmrcm', index: 0 })
  })

  it('throws asking for any slot at all when mmrcr is off and slot >= plan.slots', () => {
    const p = roundPlan(session({ mmrcr: false, rcmValidityRounds: 4 }), 2)
    expect(() => blockSlotAction(p, 3, p.slots)).toThrow()
  })
})
