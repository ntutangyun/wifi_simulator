/**
 * Task 3: the round shape. IEEE Std 802.15.4-2024 §10.29.6 lists five two-way ranging reply-time
 * shapes; design §4's table is what this file pins — how many slots each one needs, and what
 * `slotAction` says transmits in each one. See
 * `docs/superpowers/specs/2026-09-29-reply-time-design.md` §4 and task-3-brief.md.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import type { UwbReplyTime } from '../../src/uwb/phy'
import { uwbSlotsPerTag } from '../../src/uwb/phy'
import { roundPlan, slotAction, type SlotAction } from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({ ...DEFAULT_UWB_SESSION, ...over })

/** The five reply-time shapes design §4 tabulates, and the slot count each one owes a tag for a
 * given anchor count `a`. */
const SHAPES: { method: 'ss' | 'ds'; replyTime: UwbReplyTime; slots: (a: number) => number }[] = [
  { method: 'ss', replyTime: 'embedded', slots: (a) => a + 1 },
  { method: 'ss', replyTime: 'fixed', slots: (a) => a + 1 },
  { method: 'ss', replyTime: 'deferred', slots: (a) => 2 * a + 1 },
  { method: 'ds', replyTime: 'embedded', slots: (a) => 2 * a + 2 },
  { method: 'ds', replyTime: 'deferred', slots: (a) => 2 * a + 2 },
]

describe('uwbSlotsPerTag lays out the five shapes with the slot counts design §4 tabulates', () => {
  it.each([1, 3, 9])('anchors = %i', (a) => {
    for (const s of SHAPES) {
      const got = uwbSlotsPerTag(s.method, a, 'time', 8, 'twr', undefined, undefined, s.replyTime)
      expect(got).toBe(s.slots(a))
    }
  })

  it('is the same number roundPlan reports, and RoundPlan carries the replyTime it was built from', () => {
    for (const s of SHAPES) {
      const p = roundPlan(session({ method: s.method, replyTime: s.replyTime }), 3)
      expect(p.slots).toBe(s.slots(3))
      expect(p.replyTime).toBe(s.replyTime)
    }
  })
})

describe('slotAction walks every slot of every shape without throwing and without a gap', () => {
  it.each([1, 3])('anchors = %i', (a) => {
    for (const s of SHAPES) {
      const p = roundPlan(session({ method: s.method, replyTime: s.replyTime }), a)
      const seen = new Set<string>()
      for (let slot = 0; slot < p.slots; slot++) {
        expect(() => slotAction(p, slot)).not.toThrow()
        const action: SlotAction = slotAction(p, slot)
        const key = 'anchor' in action ? `${action.kind}:${action.anchor}` : action.kind
        expect(seen.has(key)).toBe(false) // no two slots claim the same (kind, anchor)
        seen.add(key)
      }
      // One slot past the end always throws: the round has no gap that silently no-ops instead.
      expect(() => slotAction(p, p.slots)).toThrow()
    }
  })

  it('an SS deferred round at 3 anchors is a Poll, 3 Responses, then 3 deferred messages', () => {
    const p = roundPlan(session({ method: 'ss', replyTime: 'deferred' }), 3)
    expect(p.slots).toBe(7)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    for (let i = 0; i < 3; i++) {
      expect(slotAction(p, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
    for (let i = 0; i < 3; i++) {
      expect(slotAction(p, 4 + i)).toEqual({ kind: 'uwbSsDefer', tx: 'anchor', anchor: i })
    }
    expect(() => slotAction(p, 7)).toThrow(/SS round has 7 slots, asked for 7/)
  })
})

describe('the embedded and fixed shapes are slot-for-slot identical to today', () => {
  it('SS embedded, 4 anchors: unchanged from the pre-Task-3 layout', () => {
    const p = roundPlan(session({ method: 'ss' }), 4)
    expect(p.slots).toBe(5)
    expect(p.replyTime).toBe('embedded')
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
    expect(() => slotAction(p, 5)).toThrow(/SS round has 5 slots, asked for 5/)
  })

  it('SS fixed, 4 anchors: same A+1 slots and the same Response layout as embedded', () => {
    const p = roundPlan(session({ method: 'ss', replyTime: 'fixed' }), 4)
    expect(p.slots).toBe(5)
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
  })

  it('DS embedded, 4 anchors: unchanged from the pre-Task-3 layout', () => {
    const p = roundPlan(DEFAULT_UWB_SESSION, 4)
    expect(p.slots).toBe(10)
    expect(p.replyTime).toBe('embedded')
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
    expect(slotAction(p, 5)).toEqual({ kind: 'uwbFinal', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 6 + i)).toEqual({ kind: 'uwbReport', tx: 'anchor', anchor: i })
    }
  })

  it('DS deferred, 4 anchors: same 2A+2 slots and the same layout as embedded — only the Final’s payload moves', () => {
    const p = roundPlan(session({ replyTime: 'deferred' }), 4)
    expect(p.slots).toBe(10)
    expect(slotAction(p, 5)).toEqual({ kind: 'uwbFinal', tx: 'tag' })
    for (let i = 0; i < 4; i++) {
      expect(slotAction(p, 6 + i)).toEqual({ kind: 'uwbReport', tx: 'anchor', anchor: i })
    }
  })
})

describe('RoundPlan.fixedReplyNs', () => {
  it('is rstuNs(fixedReplyRstu), converted exactly once', () => {
    const p = roundPlan(session({ method: 'ss', replyTime: 'fixed', fixedReplyRstu: 1200 }), 3)
    expect(p.fixedReplyNs).toBe(1_000_000) // 1200 RSTU × 833.33 ns, rounded — see rstuNs
  })
})
