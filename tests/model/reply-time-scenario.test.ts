import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'

/**
 * Task 2 of the reply-time slice: the session config fields (`replyTime`, `fixedReplyRstu`) and
 * the three combinations design §3.1 must refuse or allow. No device, schedule or round-shape
 * change belongs here — see `docs/superpowers/specs/2026-09-29-reply-time-design.md` §3, §3.1, §6.
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

describe('UwbSessionCfg.replyTime / fixedReplyRstu — the schema fields and their defaults', () => {
  it('a scenario that never sets replyTime parses, and reads back as embedded', () => {
    // Same shape as `mms`'s own legacy test: a scenario written before this field existed carries
    // no key for it at all, not a key that happens to hold today's value.
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.replyTime
    delete legacy.fixedReplyRstu
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.replyTime).toBe('embedded')
    // One whole slot (design §6.1's corrected default — half a slot, this field's first default,
    // sits below the lower bound the two-sided rule below checks).
    expect(parsed.uwb?.fixedReplyRstu).toBe(2400)
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('ds + fixed is refused: DS-TWR has no fixed reply-time procedure (standard §10.29.6.3–.7)', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ds', replyTime: 'fixed' }
    const result = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/DS-TWR/)
      expect(msg).toMatch(/固定回复时间/)
    }
    // deferred (today's only DS-TWR shape besides embedded) is still fine.
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...DEFAULT_UWB_SESSION, method: 'ds', replyTime: 'deferred' })).success)
      .toBe(true)
  })

  it('contention + deferred is refused: a contention responder draws its slot, it has none to defer into', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'deferred' }
    const result = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/竞争/)
      expect(msg).toMatch(/时隙/)
    }
  })

  it('contention + fixed is allowed, and the parsed session actually carries it', () => {
    // A vacuous pass here (schema silently stripping an unknown `replyTime` key before the field
    // existed) would look identical to a real pass, so this asserts the value survived, not just
    // that parsing did not throw.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'fixed' }
    const parsed = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(parsed.uwb?.replyTime).toBe('fixed')
    expect(parsed.uwb?.method).toBe('ss')
    expect(parsed.uwb?.schedule).toBe('contention')
  })

  it('the schema parses its own output for a non-default reply-time session (round-trip)', () => {
    // 2200 RSTU: a non-default value that still clears both sides of the §6.1 budget for this
    // scenario's own geometry (two anchors ~5.66 m from the tag, contention Poll 31 octets) —
    // verified against `lowerNeededNs`/`upperAllowedNs` the same way the schema computes them.
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'fixed', fixedReplyRstu: 2200,
    }
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    const twice = ScenarioSchema.parse(once)
    expect(twice).toEqual(once)
    expect(twice.uwb?.replyTime).toBe('fixed')
    expect(twice.uwb?.fixedReplyRstu).toBe(2200)

    // And the deferred/embedded shapes round-trip too, on a plain time-scheduled DS-TWR session.
    for (const replyTime of ['embedded', 'deferred'] as const) {
      const dsCfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ds', replyTime }
      const dsOnce = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), dsCfg))
      const dsTwice = ScenarioSchema.parse(dsOnce)
      expect(dsTwice, replyTime).toEqual(dsOnce)
    }
  })

  it('the anchor cap is threaded through the session’s own replyTime, not hardcoded to embedded', () => {
    // DS-TWR deferred's Final does not grow the way the embedded one does (design §5), so its cap
    // is the higher, Poll-bound one — the whole reason `uwbMaxAnchors` takes `replyTime` at all.
    const anchors = (n: number) => Array.from({ length: n }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0))
    const tag = uwbNode('tag-1', 'tag', 4, 4)
    // Nine anchors is the embedded cap: a deferred session with ten must still pass.
    const deferredTen = { ...DEFAULT_UWB_SESSION, replyTime: 'deferred' as const }
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors(10), tag], deferredTen))).not.toThrow()
    // …while the same ten anchors, embedded, is still refused (today's behaviour, unmoved).
    expect(() => ScenarioSchema.parse(uwbScenario([...anchors(10), tag]))).toThrow(/9 .*anchor.*10/)
  })
})

describe('UwbSessionCfg.replyTime: fixed — the §6.1 two-sided slot budget', () => {
  // Fix round 1: §6's first cut of this rule was one-sided (only an upper bound, and it doubled
  // the flight term instead of keeping the two legs — Poll-to-anchor, anchor-to-tag — separate).
  // It refused a Response arriving too late, but let one through that arrives so early it lands in
  // a slot that has not started yet, belonging to a responder that has not answered. §6.1 derives
  // the two-sided bound this describe block checks:
  //
  //   S − Ap − ToF_min   ≤   F   ≤   2S − Ap − Ar − guard − ToF_max
  //
  // (S = slotNs, Ap = Poll airtime, Ar = Response airtime, guard = UWB_SLOT_GUARD_NS, ToF the
  // flight time to the nearest/furthest anchor). A near anchor (5 m) and a far one (250 m) give
  // the lower and upper bound their own, different, anchor — proving the rule picks the right one
  // for each side rather than using the same distance for both.
  const nearFarNodes = (): NodeCfg[] => [
    uwbNode('anc-near', 'anchor', 5, 0, 0),
    uwbNode('anc-far', 'anchor', 250, 0, 0),
    uwbNode('tag-1', 'tag', 0, 0, 0),
  ]
  // Method 'ss', schedule 'time' (2 anchors ⇒ a 33-octet time-scheduled Poll, not the fixed
  // 31-octet contention one) — computed once via `uwbPpduNs`/`uwbPollBytes`/`uwbRespBytes` in
  // isolation (not re-derived from the design doc's own worked example, which used one anchor):
  // pollNs ≈ 200.7 µs, respNs ≈ 181.2 µs, slotNs = 2000.0 µs, ToF_min ≈ 16.7 ns, ToF_max ≈ 833.9 ns,
  // giving lowerNeededNs ≈ 1799.3 µs and upperAllowedNs ≈ 3617.0 µs.
  const nearFarCfg = (fixedReplyRstu: number): UwbSessionCfg =>
    ({ ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'time', replyTime: 'fixed', fixedReplyRstu })

  it('too early: below the lower bound, the Response lands in a slot that has not opened yet', () => {
    // 1200 RSTU = 1 000 000 ns, well under the ≈1 799 278 ns lower bound.
    const result = ScenarioSchema.safeParse(uwbScenario(nearFarNodes(), nearFarCfg(1200)))
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      // Names its own terms: the fixed delay, the lower bound, the slot, the Poll airtime, and
      // the *nearest* anchor's flight time — not the furthest, which is the other side's term.
      expect(msg).toMatch(/固定时延 1000\.0 µs/)
      expect(msg).toMatch(/低于下限 1799\.3 µs/)
      expect(msg).toMatch(/一个时隙 2000\.0 µs/)
      expect(msg).toMatch(/Poll 空口时间 200\.7 µs/)
      expect(msg).toMatch(/最近飞行时间 0\.0 µs/)
      expect(msg).toMatch(/还没轮到它/)
      // Not the "too late" message: a reader must be able to tell which mistake they made.
      expect(msg).not.toMatch(/超过了上限/)
      expect(msg).not.toMatch(/切掉/)
    }
  })

  it('too late: above the upper bound, the Response is cut off by its own slot boundary', () => {
    // 4600 RSTU = 3 833 333 ns, past the ≈3 617 043 ns upper bound.
    const result = ScenarioSchema.safeParse(uwbScenario(nearFarNodes(), nearFarCfg(4600)))
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/固定时延 3833\.3 µs/)
      expect(msg).toMatch(/超过了上限 3617\.0 µs/)
      expect(msg).toMatch(/两个时隙 4000\.0 µs/)
      expect(msg).toMatch(/Poll 空口时间 200\.7 µs/)
      expect(msg).toMatch(/响应帧空口时间 181\.2 µs/)
      expect(msg).toMatch(/时隙守卫 0\.2 µs/)
      // The *furthest* anchor's flight time, not the nearest.
      expect(msg).toMatch(/最远飞行时间 0\.8 µs/)
      expect(msg).toMatch(/切掉/)
      // Not the "too early" message.
      expect(msg).not.toMatch(/低于下限/)
      expect(msg).not.toMatch(/还没轮到它/)
    }
  })

  it('the default (one whole slot) clears both sides of the budget', () => {
    expect(DEFAULT_UWB_SESSION.fixedReplyRstu).toBe(2400)
    expect(() => ScenarioSchema.parse(uwbScenario(nearFarNodes(), nearFarCfg(2400)))).not.toThrow()
    // …and so does the contention + fixed combination design calls out as the one most worth
    // allowing, at the far single-anchor geometry the earlier (one-sided) version of this test used.
    const farNode = (): NodeCfg[] => [uwbNode('anc-1', 'anchor', 0, 0, 0), uwbNode('tag-1', 'tag', 200, 0, 0)]
    const contentionCfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'fixed',
    }
    expect(() => ScenarioSchema.parse(uwbScenario(farNode(), contentionCfg))).not.toThrow()
  })

  it('half a slot — this field’s original default — is now refused as too early', () => {
    // The bug fix round 1 exists to catch: 1200 RSTU was this field's first default, and it sits
    // below the lower bound at the default slot length.
    expect(() => ScenarioSchema.parse(uwbScenario(nearFarNodes(), nearFarCfg(1200)))).toThrow(/低于下限/)
  })

  it('embedded and deferred are unaffected by node distance or fixedReplyRstu: no such budget applies to them', () => {
    for (const replyTime of ['embedded', 'deferred'] as const) {
      // 50 RSTU: unambiguously below any lower bound and nowhere near any upper bound — if this
      // budget ever misfired for a non-fixed shape, this value would catch it.
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ds', replyTime, fixedReplyRstu: 50 }
      expect(() => ScenarioSchema.parse(uwbScenario(nearFarNodes(), cfg)), replyTime).not.toThrow()
    }
  })
})

describe('the block-fit rule counts the round the session will actually run', () => {
  /**
   * The rule at `ScenarioSchema`'s `superRefine` asks `uwbSlotsPerTag` how long a round is and
   * refuses a block too short to hold one. Task 3 gave that function a `replyTime` argument and
   * could not thread it through here — this file was being edited by another task at the time —
   * so the call defaulted to `'embedded'` and an SS-deferred round was measured A slots shorter
   * than it runs. A block sized for the embedded shape would have been accepted for the deferred
   * one, and the round would then have run into the next block's slots with nothing noticing:
   * the scheduler starts each block on the clock whatever the last one was still doing.
   *
   * Two anchors: embedded is 3 slots, deferred is 5. A 9600 RSTU block at the default 2400 RSTU
   * slot holds exactly 4 — above one shape and below the other, which is the only block length
   * that can tell the two apart.
   */
  const fourSlotBlock = (replyTime: UwbSessionCfg['replyTime']): Scenario => uwbScenario(
    twoAnchorsOneTag(),
    { ...DEFAULT_UWB_SESSION, method: 'ss', replyTime, blockRstu: 9600 },
  )

  it('accepts the block for the embedded round it does fit', () => {
    expect(ScenarioSchema.safeParse(fourSlotBlock('embedded')).success).toBe(true)
  })

  it('refuses the same block for the deferred round, and says how many slots it needs', () => {
    const r = ScenarioSchema.safeParse(fourSlotBlock('deferred'))
    expect(r.success).toBe(false)
    if (r.success) return
    const message = r.error.issues.map((i) => i.message).join(' | ')
    // 2A+1 at two anchors. The number has to be in the message: "the block is too short" without
    // it leaves the author guessing which way to move which knob.
    expect(message).toContain('5')
  })
})
