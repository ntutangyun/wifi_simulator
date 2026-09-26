/**
 * The two shapes one MMS round can take, side by side.
 *
 * `mmsLayout` has always laid the round out *interleaved*: every device sends one fragment per
 * millisecond, and a millisecond is therefore R + 1 slots wide. P802.15.4ab §10.39.7 adds a
 * second shape — *non-interleaved* sub-rounds, in which each device owns a stretch of the round
 * to itself and sends its whole train there, one sub-round per device.
 *
 * What is pinned here: the interleaved arithmetic is untouched by the new branch (every stored
 * plan replays off it, so a drift of one slot would be a fixture diff); the non-interleaved
 * branch costs one sub-round per device without multiplying the ranging phase; reversed order
 * really does put the responder's sub-round first; and `slotFragment` inverts `fragmentSlot` in
 * **both** shapes, because `device.mms.ts` places its own fragments with one and the schedule
 * reads them back with the other.
 */
import { describe, it, expect } from 'vitest'
import { MMS_DRAFT_DEFAULTS, mmsLayout, type MmsPhy } from '../../src/uwb/mms'

/** The session's default train (X = 8, Y = 0), with whichever draft features a case names. */
const phy = (over: Partial<MmsPhy> = {}): MmsPhy => ({
  rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1,
  ...MMS_DRAFT_DEFAULTS, ...over,
})

describe('the interleaved round is the one that always shipped', () => {
  it('is one sub-round, and a millisecond is still R + 1 slots', () => {
    const l = mmsLayout(phy(), 3)
    expect(l.subRounds).toBe(1)
    expect(l.subRoundStart(0)).toBe(0)
    expect(l.fragmentSlot('responder', 'rsf', 0, 1)).toBe(l.controlSlots + 2)
  })

  it('keeps its control phase at the top of the round', () => {
    const l = mmsLayout(phy(), 3)
    expect(l.respSlot(0)).toBe(2)
    expect(l.respSlot(2)).toBe(6)
    expect(l.controlSlots).toBe(8)
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

  it('packs one device’s train into contiguous slots of its own sub-round', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 2)
    for (let m = 0; m < 8; m++) {
      expect(l.fragmentSlot('initiator', 'rsf', m), `rsf ${m}`).toBe(2 + m)
      expect(l.fragmentSlot('responder', 'rsf', m, 0), `rsf ${m}`).toBe(l.subRoundStart(1) + 2 + m)
      expect(l.fragmentSlot('responder', 'rsf', m, 1), `rsf ${m}`).toBe(l.subRoundStart(2) + 2 + m)
    }
  })

  it('puts each responder’s narrowband window inside that responder’s own sub-round', () => {
    const l = mmsLayout(phy({ nonInterleaved: true }), 2)
    expect(l.respSlot(0)).toBe(l.subRoundStart(1))
    expect(l.respSlot(1)).toBe(l.subRoundStart(2))
  })

  it('keeps the RIF train’s Z offset inside the sub-round', () => {
    const l = mmsLayout(phy({ nonInterleaved: true, rifs: 8, gapMs: 2 }), 1)
    // X = 8, Z = 2, so the first RIF is at millisecond 9 of the phase — one slot a millisecond
    expect(l.fragmentSlot('initiator', 'rif', 0)).toBe(2 + 9)
    expect(l.rpSlots).toBe(20) // 17 milliseconds of train still fits under the floor of 20
  })

  it('reversed order puts the responder’s sub-round first', () => {
    const l = mmsLayout(phy({ nonInterleaved: true, reversedOrder: true }), 1)
    expect(l.fragmentSlot('responder', 'rsf', 0))
      .toBeLessThan(l.fragmentSlot('initiator', 'rsf', 0))
    expect(l.respSlot(0)).toBe(0)
  })

  it('reversed order keeps the responders in responder order, initiator last', () => {
    const l = mmsLayout(phy({ nonInterleaved: true, reversedOrder: true }), 3)
    expect(l.respSlot(0)).toBe(l.subRoundStart(0))
    expect(l.respSlot(2)).toBe(l.subRoundStart(2))
    expect(l.fragmentSlot('initiator', 'rsf', 0)).toBe(l.subRoundStart(3) + 2)
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

describe('slotFragment inverts fragmentSlot in both shapes', () => {
  it('round-trips every fragment of every device', () => {
    for (const nonInterleaved of [false, true]) {
      for (const reversedOrder of [false, true]) {
        if (reversedOrder && !nonInterleaved) continue // the schema refuses that pair
        const l = mmsLayout(phy({ nonInterleaved, reversedOrder, rifs: 4 }), 2)
        const tag = `ni=${nonInterleaved} rev=${reversedOrder}`
        for (const kind of ['rsf', 'rif'] as const) {
          const n = kind === 'rsf' ? 8 : 4
          for (let i = 0; i < n; i++) {
            expect(l.slotFragment(l.fragmentSlot('initiator', kind, i)), `${tag} init ${kind} ${i}`)
              .toMatchObject({ side: 'initiator', kind, index: i })
            for (let r = 0; r < 2; r++) {
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
      const l = mmsLayout(phy({ nonInterleaved, rifs: 4 }), 2)
      const owned = new Set<number>()
      for (const kind of ['rsf', 'rif'] as const) {
        const n = kind === 'rsf' ? 8 : 4
        for (let i = 0; i < n; i++) {
          owned.add(l.fragmentSlot('initiator', kind, i))
          for (let r = 0; r < 2; r++) owned.add(l.fragmentSlot('responder', kind, i, r))
        }
      }
      for (let slot = 0; slot < l.slots; slot++) {
        const tag = `ni=${nonInterleaved} slot ${slot}`
        if (owned.has(slot)) expect(l.slotFragment(slot), tag).not.toBeNull()
        else expect(l.slotFragment(slot), tag).toBeNull()
      }
      // 12 initiator + 24 responder fragments, and no slot carries two of them
      expect(owned.size).toBe(36)
    }
  })
})
