import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbMode, type UwbSessionCfg,
} from '../../src/model/scenario'

/**
 * Task 2 of docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md: the scenario schema
 * for `mmrcr` (standard §10.36's RMMRC IE, requested by the ARC IE's MMRCR bit, §10.32.9.1). A new
 * field, `mmrcr` (default false), which must carry its default so an existing scenario reads back
 * unchanged, plus the mode/switch combinations it is refused or supported under (task-2-brief.md):
 * `rcmValidityRounds: 1` (twr only — the window is one block, the bitmap one bit, and a Response's
 * own presence or absence already says that for free); `dl-tdoa`/`ul-tdoa`/`mms` (no addressable
 * initiator/responder pair the way twr has one); `schedule: 'contention'` (no device owns a slot to
 * answer from); and `m2m`, which is supported rather than refused — see the schema's own comment
 * for why that is the *opposite* of twr's rcmValidityRounds-1 refusal rather than an exception to it.
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

const fourAnchorsOneTag = (): NodeCfg[] => [
  uwbNode('anc-1', 'anchor', 0, 0),
  uwbNode('anc-2', 'anchor', 8, 0),
  uwbNode('anc-3', 'anchor', 0, 8),
  uwbNode('anc-4', 'anchor', 8, 8),
  uwbNode('tag-1', 'tag', 4, 4),
]

const m2mNodes = (n = 3): NodeCfg[] =>
  Array.from({ length: n }, (_, i) => uwbNode(`p-${i}`, 'tag', i * 4, 0))

describe('mmrcr — the scenario schema (design §3.1/§4)', () => {
  it('a scenario that never sets the field parses, and reads back at the default', () => {
    // Same shape as the other UWB slices' own legacy test: a scenario written before this slice
    // existed carries no key for it at all.
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.mmrcr
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.mmrcr).toBe(false)
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('round-trips: the schema can parse its own output (twr)', () => {
    // A valid, non-default combination (mmrcr needs rcmValidityRounds above 1 in twr) — the slice
    // 1 Ruling 4 bug this brief names was exactly a schema whose own output was not valid input.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', rcmValidityRounds: 4, mmrcr: true }
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    // Pinned so this cannot pass vacuously by both sides simply lacking the field.
    expect(once.uwb?.mmrcr).toBe(true)
    expect(once.uwb?.rcmValidityRounds).toBe(4)
    expect(() => ScenarioSchema.parse(once)).not.toThrow()
    const twice = ScenarioSchema.parse(once)
    expect(twice.uwb).toEqual(once.uwb)
  })

  it('round-trips: the schema can parse its own output (m2m)', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', mmrcr: true }
    const once = ScenarioSchema.parse(uwbScenario(m2mNodes(3), cfg))
    expect(once.uwb?.mmrcr).toBe(true)
    expect(() => ScenarioSchema.parse(once)).not.toThrow()
    const twice = ScenarioSchema.parse(once)
    expect(twice.uwb).toEqual(once.uwb)
  })

  it('twr: rcmValidityRounds 1 makes the bitmap one bit — refused, and says why', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', mmrcr: true, rcmValidityRounds: 1 }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/^不支持$/)
      expect(msg).not.toMatch(/^暂不支持$/)
      expect(msg).not.toMatch(/不支持。?$/)
      expect(msg).toMatch(/一位/)
      expect(msg).toMatch(/Response/)
    }
    // rcmValidityRounds above 1 makes the same combination legal.
    const ok: UwbSessionCfg = { ...cfg, rcmValidityRounds: 2 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), ok)).success).toBe(true)
  })

  it('dl-tdoa: refused unconditionally — the tags that cannot tell if they were heard never transmit', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', mmrcr: true }
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/标签/)
    }
    const off: UwbSessionCfg = { ...cfg, mmrcr: false }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), off)).success).toBe(true)
  })

  it('ul-tdoa: refused unconditionally — a blink carries no ARC IE and opens no exchange', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', mmrcr: true }
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    const off: UwbSessionCfg = { ...cfg, mmrcr: false }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), off)).success).toBe(true)
  })

  it('mms: refused unconditionally — the control plane is narrowband, not the ARC IE', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'mms', mmrcr: true }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    const off: UwbSessionCfg = { ...cfg, mmrcr: false }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), off)).success).toBe(true)
  })

  it("contention: refused regardless of mode — a drawn slot cannot back a confirmation", () => {
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', schedule: 'contention', mmrcr: true, rcmValidityRounds: 4,
    }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/抽/)
    }
    const timeScheduled: UwbSessionCfg = { ...cfg, schedule: 'time' }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), timeScheduled)).success).toBe(true)
  })

  it("m2m: supported, not refused — verified rather than taken on the design doc's own word", () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', mmrcr: true }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(true)
    // Not just "it parses" (an unimplemented `mmrcr` would parse too, silently stripped by a
    // non-strict zod object — exactly the vacuous-pass shape task-2-brief.md names) but that the
    // field actually reads back true.
    if (r.success) expect(r.data.uwb?.mmrcr).toBe(true)
    // Still pinned at rcmValidityRounds 1 for m2m (its own pre-existing rule); mmrcr does not
    // relax that, and the window it covers is exactly the round that just ran.
    const raised: UwbSessionCfg = { ...cfg, rcmValidityRounds: 4 }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), raised)).success).toBe(false)
  })

  it('m2m + mmrcr + contention is still refused — by the generic mmrcr rule, not only m2m\'s own', () => {
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', schedule: 'contention', mmrcr: true,
    }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      // m2m+contention is already refused by its own pre-existing rule regardless of mmrcr, so
      // `.success` alone cannot tell the two apart — the generic mmrcr+contention rule's own
      // wording ("抽", not m2m's own "抢") is what proves it fired too, not just the older one.
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/抽/)
    }
  })

  it('block capacity: mmrcr\'s own extra slots can overflow a block that fit without it (twr)', () => {
    // A block sized to fit the round exactly, with nothing spare for mmrcr's one extra slot in
    // the window's closing block. This has to be able to fail before the capacity check exists —
    // without it, mmrcr would silently describe a block that cannot hold its own confirmation.
    // Measured via uwbSlotsPerTag('ss', 2, 'time', 8, 'twr'), not assumed: an SS-TWR round at 2
    // anchors is 3 slots (1 Poll + 2 Response).
    const slots = 3
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', mmrcr: true, rcmValidityRounds: 2,
      blockRstu: slots * DEFAULT_UWB_SESSION.slotRstu, // exactly one round, no room for +1
    }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/mmrcr/)
    }
    // The same block fits fine once mmrcr is off.
    const off: UwbSessionCfg = { ...cfg, mmrcr: false }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), off)).success).toBe(true)
    // ...and fits again once mmrcr is on but the block has room for the extra slots. **Plural, and
    // one per anchor** — the first draft of this test gave room for a single slot, because the
    // feature's first draft budgeted one. An MMRCM is sent by a responder, so a two-way round needs
    // one slot per anchor; derived from the scene rather than written as a literal so it stays right
    // if the scene gains an anchor.
    const anchorsHere = twoAnchorsOneTag().filter((n) => n.uwb?.role === 'anchor').length
    const roomy: UwbSessionCfg = {
      ...cfg, blockRstu: (slots + anchorsHere) * DEFAULT_UWB_SESSION.slotRstu,
    }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), roomy)).success).toBe(true)
  })

  it('block capacity: m2m\'s own extra slots (one per participant) can overflow a block too', () => {
    const n = 3
    const slots = n // SS m2m round: one slot per participant
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', mmrcr: true,
      blockRstu: slots * DEFAULT_UWB_SESSION.slotRstu, // exactly one round, no room for +n
    }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(n), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/mmrcr/)
    }
    const off: UwbSessionCfg = { ...cfg, mmrcr: false }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(n), off)).success).toBe(true)
    const roomy: UwbSessionCfg = { ...cfg, blockRstu: 2 * slots * DEFAULT_UWB_SESSION.slotRstu }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(n), roomy)).success).toBe(true)
  })

  /**
   * The contradiction sweep task-2-brief.md asks for: every (mode, mmrcr, schedule,
   * rcmValidityRounds) combination this slice touches, checked that no issue in one parse
   * prescribes a remedy ("raise rcmValidityRounds") another issue in the *same* parse forbids
   * ("lower rcmValidityRounds" / "turn mmrcr off" vs. "turn it on" — the last of which never
   * happens, since nothing ever asks for mmrcr to be turned on). The rcmValidityRounds-slice
   * found exactly one offender this way (dl-tdoa + rmnr); this one finds none, and the table
   * pins that rather than leaving it to a sentence in a report.
   */
  const nodesFor = (mode: UwbMode): NodeCfg[] => (mode === 'm2m' ? m2mNodes(3) : mode === 'dl-tdoa' || mode === 'ul-tdoa' ? fourAnchorsOneTag() : twoAnchorsOneTag())
  const cfgFor = (mode: UwbMode, mmrcr: boolean, schedule: 'time' | 'contention', rcmValidityRounds: number): UwbSessionCfg => ({
    ...DEFAULT_UWB_SESSION, mode, mmrcr, schedule, rcmValidityRounds,
    ...(mode === 'm2m' || schedule === 'contention' ? { method: 'ss' as const } : {}),
  })

  type Cell = {
    mode: UwbMode
    mmrcr: boolean
    schedule: 'time' | 'contention'
    rcmValidityRounds: number
    expect: 'ok' | { contains: RegExp[]; notContains: RegExp[] }
  }

  const TABLE: Cell[] = [
    // twr, time-scheduled: mmrcr needs rcmValidityRounds above 1.
    { mode: 'twr', mmrcr: false, schedule: 'time', rcmValidityRounds: 1, expect: 'ok' },
    { mode: 'twr', mmrcr: true, schedule: 'time', rcmValidityRounds: 1, expect: { contains: [/调到 2 以上/], notContains: [/改回 1/, /mmrcr.*打开/] } },
    { mode: 'twr', mmrcr: true, schedule: 'time', rcmValidityRounds: 2, expect: 'ok' },
    { mode: 'twr', mmrcr: true, schedule: 'time', rcmValidityRounds: 4, expect: 'ok' },
    // twr, contention: refused by the contention rule whatever rcmValidityRounds is. At 1, the
    // twr-rcmValidityRounds-1 rule *also* fires independently (its own remedy, "raise it", is not
    // this rule's business) — two complaints with non-colliding remedies, not a loop, so both are
    // allowed to appear together. At 4 that second rule does not fire at all.
    { mode: 'twr', mmrcr: true, schedule: 'contention', rcmValidityRounds: 1, expect: { contains: [/抽/, /调到 2 以上/], notContains: [/改回 1/] } },
    { mode: 'twr', mmrcr: true, schedule: 'contention', rcmValidityRounds: 4, expect: { contains: [/抽/], notContains: [/改回 1/, /调到 2 以上/] } },
    { mode: 'twr', mmrcr: false, schedule: 'contention', rcmValidityRounds: 1, expect: 'ok' },
    // dl-tdoa / ul-tdoa / mms: mmrcr refused unconditionally; rcmValidityRounds keeps its own
    // pre-existing rule (capped at 1) independently — the two never point opposite ways, because
    // the mmrcr refusal never mentions rcmValidityRounds at all.
    ...(['dl-tdoa', 'ul-tdoa', 'mms'] as const).flatMap((mode) => [
      { mode, mmrcr: false, schedule: 'time' as const, rcmValidityRounds: 1, expect: 'ok' as const },
      { mode, mmrcr: true, schedule: 'time' as const, rcmValidityRounds: 1, expect: { contains: [/mmrcr 关掉/], notContains: [/调到 2 以上/] } },
      { mode, mmrcr: true, schedule: 'time' as const, rcmValidityRounds: 4, expect: { contains: [/mmrcr 关掉/, /改回 1/], notContains: [/调到 2 以上/] } },
    ]),
    // m2m: mmrcr supported at the only rcmValidityRounds it is ever allowed (1); raising
    // rcmValidityRounds is refused by m2m's own pre-existing rule, independent of mmrcr, and
    // that rule's remedy ("改回 1") never collides with mmrcr's own (which never mentions
    // rcmValidityRounds for m2m at all, since mmrcr is not refused there).
    { mode: 'm2m', mmrcr: false, schedule: 'time', rcmValidityRounds: 1, expect: 'ok' },
    { mode: 'm2m', mmrcr: true, schedule: 'time', rcmValidityRounds: 1, expect: 'ok' },
    { mode: 'm2m', mmrcr: true, schedule: 'time', rcmValidityRounds: 4, expect: { contains: [/改回 1/], notContains: [/调到 2 以上/, /mmrcr 关掉/] } },
    { mode: 'm2m', mmrcr: true, schedule: 'contention', rcmValidityRounds: 1, expect: { contains: [/抽/], notContains: [/调到 2 以上/] } },
  ]

  it.each(TABLE)(
    'no contradictory advice: $mode, mmrcr=$mmrcr, schedule=$schedule, rcmValidityRounds=$rcmValidityRounds',
    ({ mode, mmrcr, schedule, rcmValidityRounds, expect: exp }) => {
      const cfg = cfgFor(mode, mmrcr, schedule, rcmValidityRounds)
      const r = ScenarioSchema.safeParse(uwbScenario(nodesFor(mode), cfg))
      if (exp === 'ok') {
        expect(r.success).toBe(true)
        return
      }
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        for (const re of exp.contains) expect(msg).toMatch(re)
        for (const re of exp.notContains) expect(msg).not.toMatch(re)
      }
    },
  )
})
