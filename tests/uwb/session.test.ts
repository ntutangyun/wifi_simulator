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
})
