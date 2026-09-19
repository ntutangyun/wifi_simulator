import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
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
    expect([0, 1, 2, 3, 4].every((s) => slotAction(p, s).tx === 'anchor')).toBe(true)
  })

  it('maps the UL-TDoA slot: the tag’s blink, and nothing after it', () => {
    const p = roundPlan(session({ mode: 'ul-tdoa' }), 4)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbBlink', tx: 'tag' })
    expect(() => slotAction(p, 1)).toThrow(/UL-TDoA round has 1 slots/)
  })
})
