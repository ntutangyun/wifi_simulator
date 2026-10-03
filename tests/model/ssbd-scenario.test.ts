import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_MMS, DEFAULT_UWB_SESSION, ScenarioSchema, UwbMmsSchema, UwbSsbdSchema, nonht,
  type NodeCfg, type Scenario, type UwbMmsCfg, type UwbSessionCfg,
} from '../../src/model/scenario'
import { SSBD_BF_UNIT_MAX, SSBD_MAX_BACKOFFS_MAX } from '../../src/uwb/phy'

/**
 * Task 2 of docs/superpowers/specs/2026-10-03-ssbd-design.md: the scenario schema for spectrum
 * sensing based deferral (standard §10.45 — a P802.15.4ab **draft** clause, not in the published
 * IEEE Std 802.15.4-2024; see the design doc §0.1 and `UwbSsbdCfg`'s own doc comment).
 *
 * `UwbMmsCfg.ssbd`: `null` (default, today's behaviour byte for byte) or an object of **five**
 * fields (`minBf`, `maxBf`, `maxBackoffs`, `unitBackoffUs`, `txOnEnd`) — not the draft's six; see
 * `UwbSsbdCfg`'s own doc comment for why persistence is deliberately not built.
 *
 * Covers the four refusals of design doc §5's upper table (`control: 'uwbd'`, `nbLbt: 'off'`,
 * `mode !== 'mms'`, out-of-range values / `minBf > maxBf`), and walks the new field against every
 * other `UwbMmsCfg`/`UwbSessionCfg` switch it shares an object with to confirm no refusal's own
 * remedy is forbidden by another rule (the `rmnr` loop this file's own comments warn about).
 *
 * What this file does **not** test (design doc §5's lower table, explicitly Task 4's): the five
 * combinations the schema must allow and a later task proves non-empty by running a round and
 * reading its records (no 6 GHz Wi-Fi link, `maxBackoffs: 0` + `txOnEnd: true`, `txOnEnd: false`
 * against a busy channel, `oneToMany` with enough responders to clamp the draw to zero, and
 * `ssbd` alongside `schedule: 'contention'`). None of those are schema-level questions.
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

/** An MMS session (`mode: 'mms'`) with `mms.ssbd` patched in. Config 2 (the narrowband-assisted
 * control plane) by default, which is the one SSBD runs on.
 *
 * Takes `Record<string, unknown>`, not `Partial<UwbMmsCfg>`: `ssbd: {}` (the draft's own defaults,
 * turned on through the zod schema's own `.default()`s) is not assignable to the strict
 * `UwbSsbdCfg` the TS type promises its *parsed* output, so a test building the schema's *input*
 * needs the looser shape `UwbMmsSchema.parse` itself accepts (the same reason
 * `uwb-scenario.test.ts`'s own `mms`/`uwbd` helpers are typed this way). */
function mmsSession(mms: Record<string, unknown> = {}): UwbSessionCfg {
  return { ...DEFAULT_UWB_SESSION, mode: 'mms', mms: { ...DEFAULT_UWB_MMS, ...mms } } as UwbSessionCfg
}

describe('ssbd — the scenario schema (design doc §4.1, §5)', () => {
  it('a scenario that never sets the field parses, and reads back at the default (null)', () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_MMS }
    delete legacy.ssbd
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag(), mmsSession()), uwb: { ...mmsSession(), mms: legacy } }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.mms.ssbd).toBe(null)
    expect(parsed.uwb?.mms).toEqual(DEFAULT_UWB_MMS)
  })

  it('omitting the field inside the mms object itself parses to null, via UwbMmsSchema directly', () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_MMS }
    delete legacy.ssbd
    const parsed = UwbMmsSchema.parse(legacy)
    expect(parsed.ssbd).toBe(null)
  })

  it('`ssbd: {}` turns the feature on at the draft\'s own defaults (design doc §4.1\'s table)', () => {
    const parsed = UwbMmsSchema.parse({ ...DEFAULT_UWB_MMS, ssbd: {} })
    expect(parsed.ssbd).toEqual({ minBf: 1, maxBf: 5, maxBackoffs: 5, unitBackoffUs: 1, txOnEnd: true })
  })

  it('round-trips: the schema can parse its own output', () => {
    const cfg = mmsSession({ ssbd: { minBf: 2, maxBf: 10, maxBackoffs: 3, unitBackoffUs: 4, txOnEnd: false } })
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    // Pinned so this assertion cannot pass vacuously by both sides simply lacking the field.
    expect(once.uwb?.mms.ssbd).toEqual({ minBf: 2, maxBf: 10, maxBackoffs: 3, unitBackoffUs: 4, txOnEnd: false })
    expect(() => ScenarioSchema.parse(once)).not.toThrow()
    const twice = ScenarioSchema.parse(once)
    expect(twice.uwb).toEqual(once.uwb)
  })

  it('five fields, not the draft\'s six — no persistence key survives a parse', () => {
    const parsed = UwbMmsSchema.parse({ ...DEFAULT_UWB_MMS, ssbd: { persistence: true, persist: true } })
    expect(Object.keys(parsed.ssbd ?? {}).sort())
      .toEqual(['maxBackoffs', 'maxBf', 'minBf', 'txOnEnd', 'unitBackoffUs'])
  })

  describe('refusal 1: control: \'uwbd\' has no narrowband radio to sense', () => {
    it('is refused, with a reason', () => {
      const cfg = mmsSession({ control: 'uwbd', nbChannels: [], nbLbt: 'off', ssbd: {} })
      const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg).toMatch(/没有窄带电台/)
        expect(msg).toMatch(/ssbd 关掉/)
      }
    })

    it('control: \'nba\' (the default) with ssbd on is not refused by this rule', () => {
      const cfg = mmsSession({ ssbd: {} })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })
  })

  describe('refusal 2: nbLbt: \'off\' leaves no CCA for SSBD to run', () => {
    it('is refused, with a reason', () => {
      const cfg = mmsSession({ nbLbt: 'off', ssbd: {} })
      const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg).toMatch(/没有 CCA/)
        expect(msg).toMatch(/ssbd 关掉/)
      }
    })

    it('nbLbt: \'auto\' and \'on\' both leave ssbd legal', () => {
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), mmsSession({ nbLbt: 'auto', ssbd: {} }))).success).toBe(true)
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), mmsSession({ nbLbt: 'on', ssbd: {} }))).success).toBe(true)
    })

    it('does not also fire under control: \'uwbd\' (refusal 1 already gives that config\'s own reason)', () => {
      const cfg = mmsSession({ control: 'uwbd', nbChannels: [], nbLbt: 'off', ssbd: {} })
      const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg).not.toMatch(/没有 CCA/)
      }
    })
  })

  describe('refusal 3: mode !== \'mms\' — §10.39.8.3 scopes SSBD to clause 10.39/10.44', () => {
    const modes: Array<[UwbSessionCfg['mode'], () => NodeCfg[]]> = [
      ['twr', twoAnchorsOneTag],
      ['dl-tdoa', fourAnchorsOneTag],
      ['ul-tdoa', fourAnchorsOneTag],
      ['m2m', m2mNodes],
    ]
    for (const [mode, nodes] of modes) {
      it(`${mode}: refused`, () => {
        const cfg: UwbSessionCfg = {
          ...DEFAULT_UWB_SESSION, mode, method: 'ss',
          mms: { ...DEFAULT_UWB_MMS, ssbd: {} as UwbMmsCfg['ssbd'] },
        }
        const r = ScenarioSchema.safeParse(uwbScenario(nodes(), cfg))
        expect(r.success).toBe(false)
        if (!r.success) {
          const msg = r.error.issues.map((i) => i.message).join('\n')
          expect(msg).toMatch(/10\.39/)
          expect(msg).toMatch(/ssbd 关掉/)
        }
      })
    }

    it('mode: \'mms\' is where ssbd is legal', () => {
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), mmsSession({ ssbd: {} }))).success).toBe(true)
    })
  })

  describe('refusal 4: out-of-range values and minBf > maxBf', () => {
    it('minBf below 1 is refused; 1 (the lower edge) is legal', () => {
      expect(UwbSsbdSchema.safeParse({ minBf: 0 }).success).toBe(false)
      expect(UwbSsbdSchema.safeParse({ minBf: 1 }).success).toBe(true)
    })

    it(`maxBf above ${SSBD_BF_UNIT_MAX} is refused; ${SSBD_BF_UNIT_MAX} (the upper edge) is legal`, () => {
      expect(UwbSsbdSchema.safeParse({ maxBf: SSBD_BF_UNIT_MAX + 1 }).success).toBe(false)
      expect(UwbSsbdSchema.safeParse({ minBf: SSBD_BF_UNIT_MAX, maxBf: SSBD_BF_UNIT_MAX }).success).toBe(true)
    })

    it(`unitBackoffUs outside 1…${SSBD_BF_UNIT_MAX} is refused`, () => {
      expect(UwbSsbdSchema.safeParse({ unitBackoffUs: 0 }).success).toBe(false)
      expect(UwbSsbdSchema.safeParse({ unitBackoffUs: SSBD_BF_UNIT_MAX + 1 }).success).toBe(false)
      expect(UwbSsbdSchema.safeParse({ unitBackoffUs: SSBD_BF_UNIT_MAX }).success).toBe(true)
    })

    it(`maxBackoffs outside 0…${SSBD_MAX_BACKOFFS_MAX} is refused; both edges are legal`, () => {
      expect(UwbSsbdSchema.safeParse({ maxBackoffs: -1 }).success).toBe(false)
      expect(UwbSsbdSchema.safeParse({ maxBackoffs: SSBD_MAX_BACKOFFS_MAX + 1 }).success).toBe(false)
      expect(UwbSsbdSchema.safeParse({ maxBackoffs: 0 }).success).toBe(true)
      expect(UwbSsbdSchema.safeParse({ maxBackoffs: SSBD_MAX_BACKOFFS_MAX }).success).toBe(true)
    })

    it('minBf > maxBf is refused, with a reason; minBf === maxBf and minBf < maxBf are legal', () => {
      const r = UwbSsbdSchema.safeParse({ minBf: 6, maxBf: 5 })
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg).toMatch(/不能大于/)
      }
      expect(UwbSsbdSchema.safeParse({ minBf: 5, maxBf: 5 }).success).toBe(true)
      expect(UwbSsbdSchema.safeParse({ minBf: 1, maxBf: 5 }).success).toBe(true)
    })

    it('an out-of-range maxBf does not also trigger the minBf > maxBf message (one issue, one cause)', () => {
      const r = UwbSsbdSchema.safeParse({ minBf: 1, maxBf: SSBD_BF_UNIT_MAX + 1 })
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg).not.toMatch(/不能大于/)
      }
    })

    it('propagates through the full scenario schema too, not just UwbSsbdSchema directly', () => {
      const cfg = mmsSession({ ssbd: { minBf: 6, maxBf: 5, maxBackoffs: 5, unitBackoffUs: 1, txOnEnd: true } })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(false)
    })
  })

  describe('no refusal loop: every remedy this file adds is compatible with every other rule', () => {
    // Every message above resolves with "把 ssbd 关掉" (refusal 2 alternatively offers "把 nbLbt
    // 改成 auto 或 on"). Neither remedy is forbidden by any other rule: turning ssbd off is never
    // itself refused, and nbLbt is free to be 'auto'/'on' whenever control is not 'uwbd'. Walked
    // here against the switches ssbd does *not* conflict with, to confirm they stay independent —
    // the same shape `ancillary-scenario.test.ts`'s own "no refusal loop" block checks.
    it('coexists with oneToMany', () => {
      const cfg = mmsSession({ ssbd: {}, oneToMany: true })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })

    it('coexists with nonInterleaved, reversedOrder and fixedReplyRstu (the other local mms rules)', () => {
      const cfg = mmsSession({
        ssbd: {}, nonInterleaved: true, reversedOrder: true, fixedReplyRstu: null,
      })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })

    it('coexists with rsfSfd under control: \'nba\' left alone (rsfSfd itself stays uwbd-only)', () => {
      const cfg = mmsSession({ ssbd: {}, nMsr: 32, rsfSfd: false })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })

    it('coexists with every report mode', () => {
      for (const report of ['responder', 'initiator', 'bi'] as const) {
        const cfg = mmsSession({ ssbd: {}, report })
        expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
      }
    })

    it('txOnEnd: false (FailOnEnd) is itself not refused — §5\'s own non-refused combination 3 needs it legal', () => {
      const cfg = mmsSession({ ssbd: { minBf: 1, maxBf: 5, maxBackoffs: 5, unitBackoffUs: 1, txOnEnd: false } })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })

    it('maxBackoffs: 0 + txOnEnd: true is itself not refused — the draft\'s own CRG-rejected gap (§5\'s combination 2)', () => {
      const cfg = mmsSession({ ssbd: { minBf: 1, maxBf: 5, maxBackoffs: 0, unitBackoffUs: 1, txOnEnd: true } })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
    })
  })
})
