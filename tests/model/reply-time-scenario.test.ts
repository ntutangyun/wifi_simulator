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
    expect(parsed.uwb?.fixedReplyRstu).toBe(1200)
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
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'fixed', fixedReplyRstu: 900,
    }
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    const twice = ScenarioSchema.parse(once)
    expect(twice).toEqual(once)
    expect(twice.uwb?.replyTime).toBe('fixed')
    expect(twice.uwb?.fixedReplyRstu).toBe(900)

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

describe('UwbSessionCfg.replyTime: fixed — the §6 slot budget', () => {
  // A single anchor 200 m from the tag: flight = 200 / 0.299792458 m/ns ≈ 667.13 ns one way, so
  // 2× flight ≈ 1334.3 ns ≈ 1.3 µs — large enough to show up at one decimal place, small enough
  // that the airtime term (≈181.2 µs, a 14-octet SS fixed Response) still dominates.
  const farNodes = (): NodeCfg[] => [
    uwbNode('anc-1', 'anchor', 0, 0, 0),
    uwbNode('tag-1', 'tag', 200, 0, 0),
  ]

  it('a fixed reply delay close to the slot leaves no room for the airtime + flight + guard budget', () => {
    // fixedReplyRstu 2400 RSTU = 2 000 000 ns, exactly the default 2400 RSTU slot: the base delay
    // alone already exhausts it, before the Response has even been sent.
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'fixed', fixedReplyRstu: 2400,
    }
    const result = ScenarioSchema.safeParse(uwbScenario(farNodes(), cfg))
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('\n')
      // All four terms of the §6 inequality, named with their own numbers, not just asserted.
      expect(msg).toMatch(/固定时延.*2000\.0 µs/)
      expect(msg).toMatch(/空口时间.*181\.2 µs/)
      expect(msg).toMatch(/飞行时间.*1\.3 µs/)
      expect(msg).toMatch(/守卫.*0\.2 µs/)
      expect(msg).toMatch(/合计 2182\.8 µs/)
      expect(msg).toMatch(/2400 RSTU.*2000\.0 µs/)
      expect(msg).not.toMatch(/暂不支持/)
    }
  })

  it('the default fixedReplyRstu (half the slot) clears the same budget with room to spare', () => {
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'fixed',
    }
    expect(cfg.fixedReplyRstu).toBe(1200)
    expect(() => ScenarioSchema.parse(uwbScenario(farNodes(), cfg))).not.toThrow()
  })

  it('embedded and deferred are unaffected by node distance: no such budget applies to them', () => {
    for (const replyTime of ['embedded', 'deferred'] as const) {
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ds', replyTime, fixedReplyRstu: 2400 }
      expect(() => ScenarioSchema.parse(uwbScenario(farNodes(), cfg)), replyTime).not.toThrow()
    }
  })
})
