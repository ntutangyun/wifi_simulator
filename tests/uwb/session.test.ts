import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import { RIF_COUNT_SET, RSF_COUNT_SET } from '../../src/uwb/mms'
import { roundPlan, rstuNs, slotAction, slotStartNs } from '../../src/uwb/session'

const MS = 1_000_000

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })

describe('rstuNs', () => {
  it('converts ranging slot time units to nanoseconds (416 chips at 499.2 Mchip/s)', () => {
    expect(rstuNs(2400)).toBe(2_000_000)
    expect(rstuNs(240_000)).toBe(200_000_000)
    expect(rstuNs(600)).toBe(500_000)
  })
})

describe('roundPlan', () => {
  it('lays out a DS-TWR round: poll + one response each + final + one report each', () => {
    const p = roundPlan(DEFAULT_UWB_SESSION, 4)
    expect(p.method).toBe('ds')
    expect(p.anchors).toBe(4)
    expect(p.slots).toBe(10)
    expect(p.slotNs).toBe(2 * MS)
    expect(p.roundNs).toBe(20 * MS)
    expect(p.blockNs).toBe(200 * MS)
    expect(p.roundsPerBlock).toBe(10)
  })

  it('lays out an SS-TWR round: poll + one response each', () => {
    const p = roundPlan(session({ method: 'ss' }), 4)
    expect(p.slots).toBe(5)
    expect(p.roundNs).toBe(10 * MS)
    expect(p.roundsPerBlock).toBe(20)
  })
})

describe('slotStartNs', () => {
  it('is block + round + slot offsets', () => {
    const p = roundPlan(DEFAULT_UWB_SESSION, 4)
    expect(slotStartNs(p, 1, 2, 3)).toBe(200 * MS + 40 * MS + 6 * MS)
    expect(slotStartNs(p, 0, 0, 0)).toBe(0)
  })
})

describe('slotAction', () => {
  it('maps the DS-TWR slots of a 4-anchor round', () => {
    const p = roundPlan(DEFAULT_UWB_SESSION, 4)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
    expect(slotAction(p, 5)).toEqual({ kind: 'uwbFinal', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 6 + i)).toEqual({ kind: 'uwbReport', tx: 'anchor', anchor: i })
    }
  })

  it('maps the SS-TWR slots of a 4-anchor round', () => {
    const p = roundPlan(session({ method: 'ss' }), 4)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
  })

  it('maps a contention round: poll then any-anchor response slots', () => {
    const p = roundPlan(session({ method: 'ss', schedule: 'contention', contentionSlots: 8 }), 4)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    expect(slotAction(p, 3)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: -1 })
    for (let i = 1; i <= 8; i++) {
      expect(slotAction(p, i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: -1 })
    }
    expect(() => slotAction(p, 9)).toThrow(/contention round has 9 slots/)
  })
})

describe('roundPlan (contention)', () => {
  it('a contention round is 1 + contentionSlots, whatever the anchor count', () => {
    const p = roundPlan(session({ method: 'ss', schedule: 'contention', contentionSlots: 8 }), 4)
    expect(p.slots).toBe(9)
    expect(p.schedule).toBe('contention')
    expect(p.contentionSlots).toBe(8)
  })
})

describe('roundPlan (one-way ranging)', () => {
  it('a DL-TDoA round is the anchors’ own: N + 1 slots, one round per block', () => {
    const p = roundPlan(session({ mode: 'dl-tdoa' }), 4)
    expect(p.mode).toBe('dl-tdoa')
    expect(p.slots).toBe(5) // poll + 3 responses + final
    expect(p.roundNs).toBe(10 * MS)
    // Every tag listens to the same round, so a block holds exactly one — not the 20 that fit.
    expect(p.roundsPerBlock).toBe(1)
    expect(Math.floor(p.blockNs / p.roundNs)).toBe(20)
  })

  it('a UL-TDoA round is one blink slot, and the block holds one per tag', () => {
    const p = roundPlan(session({ mode: 'ul-tdoa' }), 4)
    expect(p.mode).toBe('ul-tdoa')
    expect(p.slots).toBe(1)
    expect(p.roundNs).toBe(2 * MS)
    expect(p.roundsPerBlock).toBe(100) // 240 000 / 2 400 RSTU
  })

  it('maps the DL-TDoA slots: anchor 0 polls, anchors 1…N−1 answer, anchor 0 finals', () => {
    const p = roundPlan(session({ mode: 'dl-tdoa' }), 4)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'anchor', anchor: 0 })
    for (let i = 1; i <= 3; i++) {
      expect(slotAction(p, i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
    expect(slotAction(p, 4)).toEqual({ kind: 'uwbFinal', tx: 'anchor', anchor: 0 })
    expect(() => slotAction(p, 5)).toThrow(/DL-TDoA round has 5 slots/)
    // No tag transmits in a DL-TDoA round at all.
    expect([0, 1, 2, 3, 4].every((s) => {
      const a = slotAction(p, s)
      return a.kind !== 'idle' && a.tx === 'anchor'
    })).toBe(true)
  })

  it('maps the UL-TDoA slot: the tag’s blink, and nothing after it', () => {
    const p = roundPlan(session({ mode: 'ul-tdoa' }), 4)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbBlink', tx: 'tag' })
    expect(() => slotAction(p, 1)).toThrow(/UL-TDoA round has 1 slots/)
  })
})

// --- P802.15.4ab: the pairwise MMS round ---------------------------------------

/** The draft's own ranging-cycle defaults, on a 600 RSTU (0.5 ms) slot. */
const mms = (over: Partial<UwbSessionCfg['mms']> = {}): UwbSessionCfg =>
  session({ mode: 'mms', method: 'ss', slotRstu: 600, mms: { ...DEFAULT_UWB_SESSION.mms, ...over } })

describe('roundPlan — MMS', () => {
  it('lays out the draft’s default round: 4 control + 20 ranging + 4 report slots, 14 ms', () => {
    const p = roundPlan(mms(), 3)
    expect(p.slots).toBe(28)
    expect(p.slotNs).toBe(500_000)
    expect(p.roundNs).toBe(14 * MS)
    // A 200 ms block holds 14 of them, which is what the pair count is measured against.
    expect(p.roundsPerBlock).toBe(14)
    expect(p.mode).toBe('mms')
  })

  it('carries the train, the layout and the control plane, so no device derives them twice', () => {
    const p = roundPlan(mms({ report: 'responder', nbChannels: [7, 9], nbLbt: 'on' }), 3)
    const m = p.mms
    expect(m).toBeDefined()
    expect(m?.phy.rsfs).toBe(8)
    expect(m?.layout.slots).toBe(28)
    expect(m?.report).toBe('responder')
    expect(m?.nbChannels).toEqual([7, 9])
    expect(m?.nbLbt).toBe('on')
    // Copied, not referenced: the plan outlives the config object it was built from.
    expect(m?.nbChannels).not.toBe(DEFAULT_UWB_SESSION.mms.nbChannels)
  })

  it('carries nothing of the kind in any other mode', () => {
    for (const mode of ['twr', 'dl-tdoa', 'ul-tdoa'] as const) {
      expect(roundPlan(session({ mode }), 4).mms, mode).toBeUndefined()
    }
  })
})

describe('slotAction — MMS', () => {
  const p = roundPlan(mms(), 3)
  const at = (slot: number) => slotAction(p, slot)

  it('gives the control phase to the narrowband radio, two slots a message', () => {
    expect(at(0)).toEqual({ kind: 'nbPoll', tx: 'tag' })
    expect(at(1)).toEqual({ kind: 'idle' })
    expect(at(2)).toEqual({ kind: 'nbResp', tx: 'anchor', anchor: 0 })
    expect(at(3)).toEqual({ kind: 'idle' })
  })

  it('interleaves the two trains a slot apart inside each millisecond', () => {
    for (let i = 0; i < 8; i++) {
      expect(at(4 + 2 * i), `initiator RSF ${i}`).toEqual({ kind: 'uwbRsf', tx: 'tag', anchor: 0, index: i })
      expect(at(5 + 2 * i), `responder RSF ${i}`).toEqual({ kind: 'uwbRsf', tx: 'anchor', anchor: 0, index: i })
    }
    // The draft sizes the ranging phase at 20 slots whatever the train is; X = 8 fills 16 of
    // them, and nobody owns the other four.
    for (const s of [20, 21, 22, 23]) expect(at(s), `tail ${s}`).toEqual({ kind: 'idle' })
  })

  it('follows mmsLayout exactly, slot for slot', () => {
    const L = p.mms?.layout
    expect(L).toBeDefined()
    for (let i = 0; i < 8; i++) {
      expect(L?.fragmentSlot('initiator', 'rsf', i)).toBe(4 + 2 * i)
      expect(L?.fragmentSlot('responder', 'rsf', i)).toBe(5 + 2 * i)
    }
    expect(L?.reportSlot('responder')).toBe(24)
    expect(L?.reportSlot('initiator')).toBe(26)
  })

  it('gives the responder the first report window and the initiator the second', () => {
    expect(at(24)).toEqual({ kind: 'nbReport', tx: 'anchor', anchor: 0 })
    expect(at(25)).toEqual({ kind: 'idle' })
    expect(at(26)).toEqual({ kind: 'nbReport', tx: 'tag', anchor: 0 })
    expect(at(27)).toEqual({ kind: 'idle' })
    expect(() => at(28)).toThrow(/MMS round has 28 slots/)
  })

  it('empties the report window the session’s report mode does not use', () => {
    const only = (report: 'responder' | 'initiator' | 'bi') => {
      const q = roundPlan(mms({ report }), 3)
      return [slotAction(q, 24).kind, slotAction(q, 26).kind]
    }
    expect(only('bi')).toEqual(['nbReport', 'nbReport'])
    expect(only('responder')).toEqual(['nbReport', 'idle'])
    expect(only('initiator')).toEqual(['idle', 'nbReport'])
  })

  it('places an integrity train after the idle millisecond, and grows the phase to fit', () => {
    // mixed-7: X = 8, Y = 8, Z = 1 — sixteen milliseconds of train, so 32 ranging slots.
    const q = roundPlan(mms({ rsfs: 8, rifs: 8, nMsr: 64, gap: 25, stsLen: 64 }), 1)
    expect(q.slots).toBe(4 + 32 + 4)
    expect(slotAction(q, 4 + 2 * 8)).toEqual({ kind: 'uwbRif', tx: 'tag', anchor: 0, index: 0 })
    expect(slotAction(q, 4 + 2 * 15 + 1)).toEqual({ kind: 'uwbRif', tx: 'anchor', anchor: 0, index: 7 })
  })

  it('leaves the idle milliseconds between the trains to nobody (Z = 2)', () => {
    const q = roundPlan(mms({ rsfs: 2, rifs: 2, gapMs: 2 }), 1)
    // X = 2 RSFs (ms 0, 1), one idle millisecond (ms 2), then Y = 2 RIFs (ms 3, 4).
    expect(slotAction(q, 4 + 2 * 2)).toEqual({ kind: 'idle' })
    expect(slotAction(q, 4 + 2 * 3)).toEqual({ kind: 'uwbRif', tx: 'tag', anchor: 0, index: 0 })
  })
})

describe('slotAction and mmsLayout are one map, not two', () => {
  /**
   * The schedule places a fragment and the device places its own from the same layout, so a
   * disagreement between them would put two ends of a round in different slots with nothing to
   * catch it. Walk every train the draft's parameter sets allow, and every slot of the round it
   * makes, in both directions.
   */
  it('agrees slot for slot, on every legal (X, Y, Z)', () => {
    for (const rsfs of RSF_COUNT_SET) {
      for (const rifs of RIF_COUNT_SET) {
        if (rsfs + rifs === 0) continue // the schema refuses an empty train
        for (const gapMs of [1, 2] as const) {
          const label = `X=${rsfs} Y=${rifs} Z=${gapMs}`
          const p = roundPlan(mms({ rsfs, rifs, gapMs }), 1)
          const L = p.mms?.layout
          expect(L, label).toBeDefined()
          if (!L) continue

          // Forwards: every fragment the layout places is the fragment the schedule names there.
          const placed = new Map<number, string>()
          for (const side of ['initiator', 'responder'] as const) {
            for (const [kind, n] of [['rsf', rsfs], ['rif', rifs]] as const) {
              for (let i = 0; i < n; i++) {
                const slot = L.fragmentSlot(side, kind, i)
                placed.set(slot, `${side} ${kind} ${i}`)
                expect(slotAction(p, slot), `${label} ${side} ${kind} ${i}`).toEqual({
                  kind: kind === 'rsf' ? 'uwbRsf' : 'uwbRif',
                  tx: side === 'initiator' ? 'tag' : 'anchor',
                  anchor: 0,
                  index: i,
                })
              }
            }
          }
          // …and no two fragments were given the same slot.
          expect(placed.size, label).toBe(2 * (rsfs + rifs))

          // Backwards: every slot the schedule calls a fragment is one the layout placed, and
          // every slot it calls idle is one the layout placed nothing in.
          for (let slot = 0; slot < p.slots; slot++) {
            const a = slotAction(p, slot)
            const mine = a.kind === 'uwbRsf' || a.kind === 'uwbRif'
            expect(mine, `${label} slot ${slot}`).toBe(placed.has(slot))
            expect(L.slotFragment(slot) !== null, `${label} slot ${slot} inverse`).toBe(mine)
          }
        }
      }
    }
  })

  it('places nothing outside the ranging phase, whatever the train', () => {
    const L = roundPlan(mms({ rsfs: 16, rifs: 8, gapMs: 2 }), 1).mms?.layout
    expect(L).toBeDefined()
    if (!L) return
    // The control window, the gap between the two report windows, and one slot past the round.
    for (const slot of [0, 1, 2, 3, L.controlSlots + L.rpSlots, L.slots - 1, L.slots]) {
      expect(L.slotFragment(slot), `slot ${slot}`).toBeNull()
    }
    // …and a slot that is not a slot at all.
    expect(L.slotFragment(-1)).toBeNull()
    expect(L.slotFragment(4.5)).toBeNull()
  })
})
