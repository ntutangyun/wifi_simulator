import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { uwbAncillarySlots, uwbMmrcmSlots, uwbSlotsPerTag } from '../../src/uwb/phy'

/**
 * Task 2 of docs/superpowers/specs/2026-10-02-ancillary-design.md: the scenario schema for the
 * ranging ancillary information exchange, Request = 0 half (standard §10.35.1; RAICT IE
 * §10.35.2.1). Two new fields — `ancillary` (default false) and `ancillaryFrames` (1…whatever the
 * block holds, default 1) — both of which must carry defaults so an existing scenario reads
 * back unchanged.
 *
 * **Slice 3d moved the `ancillaryFrames` ceiling, and three tests here moved with it.** There used
 * to be a second rule capping it at the round's own slot count, whose message said the message
 * 「连续占住本轮的 N 个时隙」. It does not: `uwb/session.ts#blockSlots` **appends** the window after
 * the ranging phase. So the only ceiling is the block's, which was always the other half of the
 * pair, and the sign of the `method` dependence flips with it — a longer round leaves fewer
 * appended slots, where before it allowed more.
 *
 * The window this exchange is bounded to is `rcmValidityRounds` (reused, not a field of its own —
 * see `UwbSessionCfg.ancillary`'s own doc comment), so this file does not re-test that field's own
 * rules (`rcm-validity-scenario.test.ts` already does). It covers: the four modes `ancillary` is
 * refused in (`dl-tdoa`, `ul-tdoa`, `mms`, `m2m` — none of them ever sends the ARC IE this
 * exchange's window is read off), `sp3` (refused together, for an unrelated reason — see the
 * schema's own comment), the `ancillaryFrames` cap (computed from the block's own budget, never a
 * literal), and that both schedules — time and contention — still run it.
 */

function uwbNode(id: string, role: 'anchor' | 'tag', x: number, y: number, z = 1): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z }, txPowerDbm: -14,
    profiles: ['idle'], caps: { ...nonht }, uwb: { role },
  }
}

function uwbScenario(nodes: NodeCfg[], uwb: UwbSessionCfg = DEFAULT_UWB_SESSION): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 300, h: 300, name: 'Hall' }],
    walls: [],
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb,
  }
}

const twoAnchorsOneTag = (): NodeCfg[] => [
  uwbNode('anc-1', 'anchor', 0, 0),
  uwbNode('anc-2', 'anchor', 8, 0),
  uwbNode('tag-1', 'tag', 4, 4),
]

/** DL-TDoA / UL-TDoA need four anchors (hyperbolic fix wants three differences). */
const fourAnchorsOneTag = (): NodeCfg[] => [
  uwbNode('anc-1', 'anchor', 0, 0),
  uwbNode('anc-2', 'anchor', 8, 0),
  uwbNode('anc-3', 'anchor', 0, 8),
  uwbNode('anc-4', 'anchor', 8, 8),
  uwbNode('tag-1', 'tag', 4, 4),
]

const m2mNodes = (): NodeCfg[] => [
  uwbNode('p-0', 'tag', 0, 0),
  uwbNode('p-1', 'tag', 4, 0),
  uwbNode('p-2', 'tag', 8, 0),
]

describe('ancillary / ancillaryFrames — the scenario schema (design §4)', () => {
  it('a scenario that never sets either field parses, and reads back at the defaults', () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.ancillary
    delete legacy.ancillaryFrames
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.ancillary).toBe(false)
    expect(parsed.uwb?.ancillaryFrames).toBe(1)
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('round-trips: the schema can parse its own output', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, ancillary: true, ancillaryFrames: 3 }
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    // Pinned so this assertion cannot pass vacuously by both sides simply lacking the fields.
    expect(once.uwb?.ancillary).toBe(true)
    expect(once.uwb?.ancillaryFrames).toBe(3)
    expect(() => ScenarioSchema.parse(once)).not.toThrow()
    const twice = ScenarioSchema.parse(once)
    expect(twice.uwb).toEqual(once.uwb)
  })

  it('ancillaryFrames refuses anything below 1', () => {
    const zero: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, ancillaryFrames: 0 }
    const neg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, ancillaryFrames: -1 }
    const frac: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, ancillaryFrames: 1.5 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), zero)).success).toBe(false)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), neg)).success).toBe(false)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), frac)).success).toBe(false)
    // The default, 1, is always legal on its own (not segmented — see the ruling below).
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, ancillaryFrames: 1 })).success).toBe(true)
  })

  it('dl-tdoa: no anchor-to-tag slot for the message to travel in, so ancillary is refused', () => {
    const on: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', ancillary: true }
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), on))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/ancillary 关掉/)
      expect(msg).toMatch(/标签/)
    }
    const off: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', ancillary: false }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), off)).success).toBe(true)
  })

  it('ul-tdoa: the blink carries no ARC IE, so there is no window for ancillary to reuse', () => {
    const on: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', ancillary: true }
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), on))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/ancillary 关掉/)
      expect(msg).toMatch(/ARC IE/)
    }
    const off: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', ancillary: false }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), off)).success).toBe(true)
  })

  it('mms: the control plane is narrowband, not the ARC IE, so ancillary is refused', () => {
    const on: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'mms', ancillary: true }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), on)).success).toBe(false)
    const off: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'mms', ancillary: false }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), off)).success).toBe(true)
  })

  it('m2m: no independent control message, so there is no ARC-IE window to reuse', () => {
    const on: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', ancillary: true }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(), on))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/ancillary 关掉/)
    }
    const off: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', ancillary: false }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(), off)).success).toBe(true)
  })

  it('sp3: refused together — the round already appends its own batch of frames after the ranging phase', () => {
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'twr', sp3: true, replyTime: 'deferred', ancillary: true,
    }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/sp3 关掉/)
      expect(msg).toMatch(/ancillary 关掉/)
    }
    // Either one off resolves it.
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...cfg, sp3: false })).success).toBe(true)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...cfg, ancillary: false })).success).toBe(true)
  })

  /**
   * The one ceiling `ancillaryFrames` has, computed the way the schema computes it rather than
   * written down: the block's slots, less the ranging round, less the receipt confirmation's own
   * appended batch, divided by the rounds the block has to hold. One tag here, so the divisor is 1.
   */
  const blockCapFor = (cfg: UwbSessionCfg, anchors: number, tags = 1): number => {
    const slots = uwbSlotsPerTag(
      cfg.method, anchors, cfg.schedule, cfg.contentionSlots, cfg.mode, cfg.mms, undefined, cfg.replyTime,
    )
    const mmrcr = uwbMmrcmSlots(cfg.mode, anchors, cfg.mmrcr)
    return Math.floor(cfg.blockRstu / (tags * cfg.slotRstu)) - slots - mmrcr
  }

  it("ancillaryFrames' upper bound is the block's own budget, computed, never a literal", () => {
    const base: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', ancillary: true }
    const cap = blockCapFor(base, 2)
    // The round's own slot count is NOT the bound any more, and this is the assertion that says
    // so: the cap is many times it, because the window is appended rather than carved out.
    const roundSlots = uwbSlotsPerTag(
      base.method, 2, base.schedule, base.contentionSlots, base.mode, base.mms, undefined, base.replyTime,
    )
    expect(cap).toBeGreaterThan(roundSlots)
    const atCap: UwbSessionCfg = { ...base, ancillaryFrames: cap }
    const overCap: UwbSessionCfg = { ...base, ancillaryFrames: cap + 1 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), atCap)).success).toBe(true)
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), overCap))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/时隙/)
      // the refusal names the appended batch, and the count it names is the one asked for
      expect(msg).toContain('ancillary')
      expect(msg).toContain(String(cap + 1))
    }
  })

  it('the cap moves with the round shape (method), and a LONGER round leaves FEWER appended slots', () => {
    const ss: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', ancillary: true }
    const ds: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ds', ancillary: true }
    const ssCap = blockCapFor(ss, 2)
    const dsCap = blockCapFor(ds, 2)
    // The direction, as an assertion: before slice 3d this was `ssCap < dsCap`, because the cap
    // WAS the round's own slot count. Now the round is what the window has to fit beside.
    expect(ssCap).toBeGreaterThan(dsCap)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...ss, ancillaryFrames: ssCap })).success).toBe(true)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...ss, ancillaryFrames: ssCap + 1 })).success).toBe(false)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...ds, ancillaryFrames: dsCap })).success).toBe(true)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...ds, ancillaryFrames: dsCap + 1 })).success).toBe(false)
  })

  describe('both schedules must run it (standard §10.35.1: scheduling-based or contention-based)', () => {
    it('time-scheduled: ancillary runs', () => {
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', schedule: 'time', ancillary: true }
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })

    it('contention: ancillary runs, and the slot count it is capped against is contention\'s own', () => {
      const cfg: UwbSessionCfg = {
        ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'contention', contentionSlots: 8,
        ancillary: true,
      }
      const roundSlots = uwbSlotsPerTag(cfg.method, 2, cfg.schedule, cfg.contentionSlots, cfg.mode, cfg.mms, undefined, cfg.replyTime)
      // 1 + contentionSlots, not the time-scheduled anchors + 1 — a different, real number, and
      // it is what the appended window has to fit BESIDE rather than what bounds it.
      expect(roundSlots).toBe(1 + cfg.contentionSlots)
      const cap = blockCapFor(cfg, 2)
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...cfg, ancillaryFrames: cap })).success).toBe(true)
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...cfg, ancillaryFrames: cap + 1 })).success).toBe(false)
      // …and below `contentionSlots` every frame count buys the same window (`uwbAncillarySlots`
      // takes the larger of the two), which is the interval slice 3d pins rather than refuses
      for (const frames of [1, 4, cfg.contentionSlots]) {
        expect(uwbAncillarySlots(cfg.mode, cfg.schedule, cfg.contentionSlots, true, frames))
          .toBe(cfg.contentionSlots)
      }
    })
  })

  describe('Ruling: ancillary true + ancillaryFrames 1 is a real, minimal case — not refused', () => {
    // §4.2 of the design doc: a one-frame message has nothing to segment, so the countdown
    // Frames Remaining would otherwise do is trivial. That is not the same as the combination
    // doing nothing, the way `contention` + `rmnr` once did (no RMNR frame could ever be built at
    // all) or `srrr.rrtt` outside SS-TWR does (no frame ever reads the bit): `ancillary` and
    // `ancillaryFrames` are orthogonal settings — `ancillary` decides whether the exchange runs at
    // all, `ancillaryFrames` decides how many frames it costs once it does — and at 1 the exchange
    // still runs, with a real frame reporting a real Frames Remaining value of 0 (see
    // `tests/uwb/ancillary-schedule.test.ts` for the byte-level proof). This is the smallest
    // working instance of the feature, the same standing `rcmValidityRounds: 1` already has as
    // "today's behaviour" rather than a refused degenerate case.
    it('is not refused, for every mode ancillary is otherwise legal in', () => {
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', ancillary: true, ancillaryFrames: 1 }
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })
  })

  describe('no refusal loop: every remedy this file adds is compatible with every other rule', () => {
    // Every message above resolves with "把 ancillary 关掉" (or, for sp3, alternatively "把 sp3
    // 关掉"). Neither remedy is forbidden by any other rule in the schema — turning a boolean off
    // is never itself refused — so there is no pair of messages that could send a reader in a
    // circle the way rcmValidityRounds/rmnr once did. Walked here against the switches ancillary
    // does *not* conflict with, to confirm they stay independent.
    it('coexists with rmnr, mmrcr and aoa when the mode allows all of them', () => {
      const cfg: UwbSessionCfg = {
        ...DEFAULT_UWB_SESSION, mode: 'twr', rcmValidityRounds: 4, rmnr: true, mmrcr: true, aoa: true,
        ancillary: true, ancillaryFrames: 1,
      }
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })

    it('coexists with both replyTime shapes sp3 does not already forbid', () => {
      const embedded: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', replyTime: 'embedded', ancillary: true }
      // DS-TWR has no 'fixed' procedure at all (reply-time-scenario.test.ts), so 'ss' here —
      // unrelated to ancillary, just what makes 'fixed' legal in the first place.
      const fixed: UwbSessionCfg = {
        ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', replyTime: 'fixed', ancillary: true,
      }
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), embedded)).success).toBe(true)
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), fixed)).success).toBe(true)
    })
  })
})
