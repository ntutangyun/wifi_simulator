/**
 * The two shapes one MMS round can take, side by side.
 *
 * Interleaved, a round is one pairwise sub-round per responder: the initiator's fragment opens
 * each millisecond and the responder's follows 500 µs later (15-24/0633r1; one sub-round per
 * responder, 15-25/0213r2 CID 474). 2026-11-11 (audit #22): a one-to-many interleaved round used to
 * share one millisecond of (R + 1) slots among everybody. P802.15.4ab §10.39.7 adds a second shape —
 * *non-interleaved* sub-rounds, in which each device owns a stretch of the round to itself and
 * sends its whole train there, one sub-round per device.
 *
 * What is pinned here: the pairwise interleaved arithmetic is the one that always shipped (every
 * stored pair plan replays off it); the non-interleaved branch costs one sub-round per device
 * without multiplying the ranging phase; a fragment still goes out once a millisecond
 * in a sub-round where only one device transmits, which is the regulatory premise the whole
 * mechanism rests on; and `slotFragment` inverts `fragmentSlot` in **both** shapes, because
 * `device.mms.ts` places its own fragments with one and the schedule reads them back with the
 * other.
 */
import { describe, it, expect } from 'vitest'
import { MMS_DRAFT_DEFAULTS, mmsLayout, type MmsPhy } from '../../src/uwb/mms'

/** The session's default train (X = 8, Y = 0), with whichever draft features a case names. */
const phy = (over: Partial<MmsPhy> = {}): MmsPhy => ({
  rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1,
  ...MMS_DRAFT_DEFAULTS, ...over,
})

describe('the interleaved round: one pairwise sub-round per responder', () => {
  it('is the pair round that always shipped when there is one responder', () => {
    const l = mmsLayout(phy(), 1)
    expect([l.subRounds, l.slots, l.controlSlots, l.rpSlots, l.reportSlots]).toEqual([1, 28, 4, 20, 4])
    expect([l.pollSlot(0), l.respSlot(0)]).toEqual([0, 2])
    expect(l.fragmentSlot('initiator', 'rsf', 3)).toBe(4 + 2 * 3)
    expect(l.fragmentSlot('responder', 'rsf', 3)).toBe(4 + 2 * 3 + 1)
    expect([l.reportSlot('responder'), l.reportSlot('initiator')]).toEqual([24, 26])
  })

  // 2026-11-11 (audit #22): 15-25/0213r2 (CID 474) gives each responder a sub-round with its own
  // One-to-many Poll, so the one-to-many round is R copies of the pair round.
  it('repeats the pair round once per responder, each with its own POLL', () => {
    const one = mmsLayout(phy(), 1)
    const l = mmsLayout(phy(), 3)
    expect(l.subRounds).toBe(3)
    expect(l.polls).toBe(3)
    expect(l.slots).toBe(3 * one.slots)
    for (let r = 0; r < 3; r++) {
      const at = r * one.slots
      expect(l.subRoundStart(r)).toBe(at)
      expect(l.pollSlot(r)).toBe(at)
      expect(l.pollFor(r)).toBe(r)
      expect(l.respSlot(r)).toBe(at + 2)
      expect(l.fragmentSlot('initiator', 'rsf', 0, r)).toBe(at + 4)
      expect(l.fragmentSlot('responder', 'rsf', 0, r)).toBe(at + 5)
      expect(l.reportSlot('initiator', r)).toBe(at + 26)
    }
    expect(l.controlSlots).toBe(12)
  })
})

describe('the non-interleaved round of §10.39.7', () => {
  it('gives each side its own sub-round', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 1)
    expect(l.subRounds).toBe(2)
    // a sub-round is one narrowband window (2 slots) plus the ranging phase
    expect(l.subRoundStart(0)).toBe(0)
    expect(l.subRoundStart(1)).toBe(2 + l.rpSlots)
  })

  it('is one sub-round per device in a one-to-many round', () => {
    expect(mmsLayout(phy({ nonInterleaved: true }), 3).subRounds).toBe(4)
  })

  it('does not multiply the ranging phase by the device count', () => {
    const one = mmsLayout(phy({ nonInterleaved: true }), 1)
    const three = mmsLayout(phy({ nonInterleaved: true }), 3)
    expect(three.rpSlots).toBe(one.rpSlots)
  })

  it('costs more slots in total than the interleaved round', () => {
    // the price the draft's own commenters named: a longer ranging duration
    const inter = mmsLayout(phy(), 3)
    const non = mmsLayout(phy({ nonInterleaved: true }), 3)
    expect(non.slots).toBeGreaterThan(inter.slots)
  })

  it('walks one device’s train down its own sub-round a millisecond at a time', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 2)
    for (let m = 0; m < 8; m++) {
      const at = 2 + m * l.slotsPerMs
      expect(l.fragmentSlot('initiator', 'rsf', m), `rsf ${m}`).toBe(at)
      expect(l.fragmentSlot('responder', 'rsf', m, 0), `rsf ${m}`).toBe(l.subRoundStart(1) + at)
      expect(l.fragmentSlot('responder', 'rsf', m, 1), `rsf ${m}`).toBe(l.subRoundStart(2) + at)
    }
  })

  it('puts each responder’s narrowband window inside that responder’s own sub-round', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 2)
    expect(l.respSlot(0)).toBe(l.subRoundStart(1))
    expect(l.respSlot(1)).toBe(l.subRoundStart(2))
  })

  it('keeps the RIF train’s Z offset inside the sub-round', () => {
    const l = mmsLayout(phy({ nonInterleaved: true, rifs: 8, gapMs: 2 }), 1)
    // X = 8, Z = 2, so the first RIF is at millisecond 9 of the phase, and a millisecond of a
    // sub-round is `slotsPerMs` slots however few devices transmit in it
    expect(l.fragmentSlot('initiator', 'rif', 0)).toBe(2 + 9 * l.slotsPerMs)
    // 17 milliseconds of train, so the phase outgrows the floor of 20 the way interleaved does
    expect(l.rpSlots).toBe(17 * l.slotsPerMs)
  })

  it('has one POLL, at the head of the initiator’s own sub-round, for every responder', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 3)
    expect([l.polls, l.pollSlot(0)]).toEqual([1, 0])
    for (let r = 0; r < 3; r++) expect(l.pollFor(r)).toBe(0)
    expect(() => l.pollSlot(1)).toThrow(/one POLL/)
  })

  it('leaves every fragment and every report inside the round', () => {
    for (const rsfs of [0, 1, 2, 4, 8, 16] as const) {
      for (const rifs of [0, 1, 2, 4, 8] as const) {
        if (rsfs + rifs === 0) continue
        for (const gapMs of [1, 2] as const) {
          const l = mmsLayout(phy({ nonInterleaved: true, rsfs, rifs, gapMs }), 3)
          const tag = `${rsfs}/${rifs}/${gapMs}`
          for (let r = 0; r < 3; r++) {
            const last = Math.max(
              rsfs > 0 ? l.fragmentSlot('responder', 'rsf', rsfs - 1, r) : -1,
              rifs > 0 ? l.fragmentSlot('responder', 'rif', rifs - 1, r) : -1,
            )
            expect(last, tag).toBeLessThan(l.subRounds * (2 + l.rpSlots))
          }
          expect(l.reportSlot('initiator') + 1, tag).toBeLessThan(l.slots)
        }
      }
    }
  })

  it('refuses a sub-round the round does not have', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 2)
    expect(() => l.subRoundStart(3)).toThrow(/sub-round/)
    expect(() => l.subRoundStart(-1)).toThrow(/sub-round/)
  })
})

describe('a millisecond is a millisecond whoever is transmitting', () => {
  it('non-interleaved keeps fragments one millisecond apart, not one slot', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 1)
    const a = l.fragmentSlot('initiator', 'rsf', 0)
    const b = l.fragmentSlot('initiator', 'rsf', 1)
    expect(b - a).toBe(l.slotsPerMs)
  })

  it('non-interleaved holds the gap steady however many responders there are', () => {
    // the advantage interleaved does not have: one-to-many interleaved stretches
    // the gap to (R + 1) slots, and this does not
    for (const r of [1, 2, 3]) {
      const l = mmsLayout(phy({ nonInterleaved: true }), r)
      const g = l.fragmentSlot('initiator', 'rsf', 1) - l.fragmentSlot('initiator', 'rsf', 0)
      expect(g, `${r} responders`).toBe(l.slotsPerMs)
    }
  })

  it('a shorter slot needs more slots to make the same millisecond', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 1, 4)
    expect(l.fragmentSlot('initiator', 'rsf', 1) - l.fragmentSlot('initiator', 'rsf', 0)).toBe(4)
  })

  // 2026-11-11 (audit #22): a millisecond, with the responder 500 µs behind (15-24/0633r1), however
  // many responders — it used to be (R + 1) slots, 2 ms at three responders.
  it('interleaved keeps a millisecond whatever the device count, the responder half a millisecond behind', () => {
    for (const r of [1, 3, 6]) {
      const l = mmsLayout(phy(), r)
      expect(l.fragmentSlot('initiator', 'rsf', 1, r - 1) - l.fragmentSlot('initiator', 'rsf', 0, r - 1)).toBe(2)
      expect(l.fragmentSlot('responder', 'rsf', 0, r - 1) - l.fragmentSlot('initiator', 'rsf', 0, r - 1)).toBe(1)
      expect(l.respOffsetSlots).toBe(1)
    }
    // At 300 RSTU a millisecond is four slots and the responder two behind: 500 µs again.
    const short = mmsLayout(phy(), 2, 4)
    expect([short.fragGapSlots, short.respOffsetSlots]).toEqual([4, 2])
  })

  it('reports the spacing it used, and nobody else has to work it out', () => {
    // `fragGapSlots` is the one place the spacing is decided: the round plan multiplies it by the
    // slot length, and the receiver walks its RMARKER back over that. A second opinion anywhere
    // is a receiver reading the wrong clock ratio.
    expect(mmsLayout(phy(), 1).fragGapSlots).toBe(2)
    expect(mmsLayout(phy(), 3).fragGapSlots).toBe(2)
    expect(mmsLayout(phy({ nonInterleaved: true }), 3).fragGapSlots).toBe(2)
    expect(mmsLayout(phy({ nonInterleaved: true }), 3, 4).fragGapSlots).toBe(4)
  })

  it('refuses a millisecond of no slots at all', () => {
    expect(() => mmsLayout(phy(), 1, 0)).toThrow(/slotsPerMs/)
    expect(() => mmsLayout(phy(), 1, 1.5)).toThrow(/slotsPerMs/)
  })
})

describe('slotFragment inverts fragmentSlot in both shapes', () => {
  it('round-trips every fragment of every device', () => {
    for (const nonInterleaved of [false, true]) {
      // and at two slot lengths, because the millisecond is read off the slot
      for (const spm of [2, 3]) {
        const l = mmsLayout(phy({ nonInterleaved, rifs: 4 }), 2, spm)
        const tag = `ni=${nonInterleaved} spm=${spm}`
        for (const kind of ['rsf', 'rif'] as const) {
          const n = kind === 'rsf' ? 8 : 4
          for (let i = 0; i < n; i++) {
            for (let r = 0; r < 2; r++) {
              expect(l.slotFragment(l.fragmentSlot('initiator', kind, i, r)), `${tag} init r${r} ${kind} ${i}`)
                .toMatchObject({ side: 'initiator', kind, index: i, ...(nonInterleaved ? {} : { responder: r }) })
              expect(l.slotFragment(l.fragmentSlot('responder', kind, i, r)), `${tag} r${r} ${kind} ${i}`)
                .toMatchObject({ side: 'responder', kind, index: i, responder: r })
            }
          }
        }
      }
    }
  })

  it('answers null for every slot no fragment owns, and nothing else', () => {
    for (const nonInterleaved of [false, true]) {
      for (const spm of [2, 3]) {
        const l = mmsLayout(phy({ nonInterleaved, rifs: 4 }), 2, spm)
        const owned = new Set<number>()
        for (const kind of ['rsf', 'rif'] as const) {
          const n = kind === 'rsf' ? 8 : 4
          for (let i = 0; i < n; i++) {
            for (let r = 0; r < 2; r++) {
              owned.add(l.fragmentSlot('initiator', kind, i, r))
              owned.add(l.fragmentSlot('responder', kind, i, r))
            }
          }
        }
        for (let slot = 0; slot < l.slots; slot++) {
          const tag = `ni=${nonInterleaved} spm=${spm} slot ${slot}`
          if (owned.has(slot)) expect(l.slotFragment(slot), tag).not.toBeNull()
          else expect(l.slotFragment(slot), tag).toBeNull()
        }
        // Non-interleaved the initiator's 12 fragments are one train for both responders; interleaved
        // it sends them once per sub-round. 24 responder fragments either way, no slot carrying two.
        expect(owned.size).toBe(nonInterleaved ? 36 : 48)
      }
    }
  })
})
