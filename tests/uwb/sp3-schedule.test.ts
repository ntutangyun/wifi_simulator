/**
 * Task 2 of docs/superpowers/specs/2026-10-02-sp3-design.md: `RoundPlan.sp3`/`RoundPlan.srrr`, read
 * straight off the session config the same way `replyTime`/`rcmValidityRounds`/`mmrcr` are.
 *
 * **Fix round 1 of task 3 (design §4.1) overturned this file's own premise**, and the sweep below is
 * what it was replaced with. Task 2 read the deferred SS round's existing `2A + 1` as already being
 * SP3's shape — A+1 markers (the Poll plus A Responses) and A reports — and pinned that `sp3`
 * changes no slot count at all. It does. §10.32.8.2's Figure 10-242 draws **two frames of the
 * initiator's own** that the Poll cannot stand in for:
 *
 *  - its own SP3 marker, the ranging initiation. The Poll cannot be one: an SP3 packet has no PSDU
 *    and the RCM carries ARC + RDM + RRMC + the responders' SRRR IEs.
 *  - its own measurement report, carrying the round-trip time to the responders that asked for it
 *    (the SRRR IE's RRTT bit). Without it that bit went on the air and nothing in the round ever
 *    answered it — a permitted configuration that provably did nothing.
 *
 * So the shape is `2A + 2` for a deferred SS round, `2A + 3` when some responder asked for the
 * round trip, and one slot more again for DS, whose report phase opens with the initiator's Final.
 * What this file now pins is that the new shape is **only** reached with `sp3` on: every other
 * session's slot table is the one it was, which is what keeps every existing scenario byte-identical.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, DEFAULT_UWB_SRRR, type UwbSessionCfg } from '../../src/model/scenario'
import { roundPlan, slotAction } from '../../src/uwb/session'

const session = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({
  ...DEFAULT_UWB_SESSION, mode: 'twr', schedule: 'time', replyTime: 'deferred', ...over,
})

describe('RoundPlan.sp3', () => {
  it('is read straight off the session config', () => {
    expect(roundPlan(session({ sp3: false }), 3).sp3).toBe(false)
    expect(roundPlan(session({ sp3: true }), 3).sp3).toBe(true)
  })

  it('defaults to false — an existing round plan is unaffected', () => {
    expect(roundPlan(DEFAULT_UWB_SESSION, 3).sp3).toBe(false)
  })
})

describe('RoundPlan.srrr', () => {
  it('is read straight off the session config, copied rather than aliased', () => {
    const cfg = session({ srrr: { raoa: true, rrtt: false } })
    const p = roundPlan(cfg, 3)
    expect(p.srrr).toEqual({ raoa: true, rrtt: false })
    // Copied: mutating the plan's own copy must not reach back into the scenario's config object —
    // the same discipline `mms` below is held to ("a plan outlives the scenario object it was
    // built from, and a device reading the train's shape must not be able to see it edited
    // underneath").
    p.srrr.raoa = false
    expect(cfg.srrr.raoa).toBe(true)
  })

  it('defaults to {raoa: false, rrtt: false} — an existing round plan is unaffected', () => {
    expect(roundPlan(DEFAULT_UWB_SESSION, 3).srrr).toEqual(DEFAULT_UWB_SRRR)
  })
})

describe('the slot shape sp3 changes, and the shapes it does not (design §4.1)', () => {
  it('SS-TWR: two slots more than the deferred SP1 round, both of them the initiator\'s own', () => {
    for (const anchors of [1, 2, 4]) {
      const off = roundPlan(session({ method: 'ss', sp3: false }), anchors)
      const on = roundPlan(session({ method: 'ss', sp3: true }), anchors)
      // One extra slot for the initiator's marker; its report needs one only when asked for.
      expect(on.slots, `anchors=${anchors}`).toBe(off.slots + 1)
      expect(on.roundNs, `anchors=${anchors}`).toBe(on.slots * on.slotNs)
      const asked = roundPlan(session({ method: 'ss', sp3: true, srrr: { raoa: false, rrtt: true } }), anchors)
      expect(asked.slots, `anchors=${anchors}`).toBe(on.slots + 1)
    }
  })

  it('SS-TWR: the RCM, the initiator\'s marker, one marker per responder, then the reports', () => {
    const anchors = 3
    const p = roundPlan(session({ method: 'ss', sp3: true }), anchors)
    expect(p.slots).toBe(2 * anchors + 2)
    expect(slotAction(p, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    expect(slotAction(p, 1)).toEqual({ kind: 'uwbSp3', tx: 'tag' })
    for (let k = 0; k < anchors; k++) {
      expect(slotAction(p, 2 + k), `marker ${k}`).toEqual({ kind: 'uwbSp3', tx: 'anchor', anchor: k })
    }
    for (let k = 0; k < anchors; k++) {
      expect(slotAction(p, anchors + 2 + k), `report ${k}`)
        .toEqual({ kind: 'uwbSsDefer', tx: 'anchor', anchor: k })
    }
    expect(() => slotAction(p, p.slots)).toThrow(/asked for/)
  })

  it('SS-TWR with RRTT asked: the initiator\'s own report opens the report phase', () => {
    const anchors = 3
    const p = roundPlan(session({ method: 'ss', sp3: true, srrr: { raoa: false, rrtt: true } }), anchors)
    expect(p.slots).toBe(2 * anchors + 3)
    expect(slotAction(p, anchors + 2)).toEqual({ kind: 'uwbReport', tx: 'tag' })
    for (let k = 0; k < anchors; k++) {
      expect(slotAction(p, anchors + 3 + k), `report ${k}`)
        .toEqual({ kind: 'uwbSsDefer', tx: 'anchor', anchor: k })
    }
    expect(() => slotAction(p, p.slots)).toThrow(/asked for/)
  })

  it('DS-TWR: one slot more again, because its report phase opens with the Final', () => {
    const anchors = 3
    const p = roundPlan(session({ method: 'ds', sp3: true }), anchors)
    expect(p.slots).toBe(2 * anchors + 3)
    expect(slotAction(p, 1)).toEqual({ kind: 'uwbSp3', tx: 'tag' })
    expect(slotAction(p, anchors + 2)).toEqual({ kind: 'uwbFinal', tx: 'tag' })
    for (let k = 0; k < anchors; k++) {
      expect(slotAction(p, anchors + 3 + k), `report ${k}`)
        .toEqual({ kind: 'uwbReport', tx: 'anchor', anchor: k })
    }
    expect(() => slotAction(p, p.slots)).toThrow(/asked for/)
  })

  it('leaves every slotAction answer alone with sp3 off, in both methods', () => {
    for (const method of ['ss', 'ds'] as const) {
      for (const anchors of [1, 2, 4]) {
        const off = roundPlan(session({ method, sp3: false }), anchors)
        // The same session read twice, so a stray `sp3` term anywhere in `uwbSlotsPerTag` or
        // `slotAction` would show up as a difference here rather than only in an SP3 round.
        const again = roundPlan(session({ method, sp3: false, srrr: { raoa: true, rrtt: true } }), anchors)
        expect(again.slots, `${method} anchors=${anchors}`).toBe(off.slots)
        for (let slot = 0; slot < off.slots; slot++) {
          expect(slotAction(again, slot), `${method} anchors=${anchors} slot=${slot}`)
            .toEqual(slotAction(off, slot))
        }
      }
    }
  })
})
