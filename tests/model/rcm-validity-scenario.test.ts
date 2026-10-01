import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'

/**
 * Task 2 of docs/superpowers/specs/2026-10-01-rcm-validity-design.md: the scenario schema for
 * the ARC IE's RCM Validity Rounds field (standard §10.32.9.1) and §10.34's ranging message
 * non-receipt exchange (RMNR). Two new fields — `rcmValidityRounds` (1…64, default 1) and `rmnr`
 * (default false) — both of which must carry defaults so an existing scenario reads back
 * unchanged, and the one refusal this slice teaches rather than merely enforces (design §4,
 * Ruling 2): `rmnr: true` with `rcmValidityRounds: 1` makes no sense, because a responder that
 * missed the Poll under a one-round control message does not know its own slot and cannot send
 * RMNR — the state RMNR describes does not exist.
 *
 * Also covers the four other modes (`dl-tdoa`, `ul-tdoa`, `mms`, `m2m`): none of them ever sends
 * the ARC-IE control message `rcmValidityRounds`/`rmnr` are about (see `src/uwb/frames.ts` —
 * `makePoll` is twr/dl-tdoa only, `makeBlink`/`makeM2m`/the narrowband nbPoll carry no ARC IE at
 * all), so a non-default value of either field is refused there with its own reason rather than
 * silently ignored.
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

describe('rcmValidityRounds / rmnr — the scenario schema (design §4)', () => {
  it('a scenario that never sets either field parses, and reads back at the defaults', () => {
    // Same shape as the other UWB slices' own legacy test: a scenario written before this slice
    // existed carries no key for either field at all.
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.rcmValidityRounds
    delete legacy.rmnr
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.rcmValidityRounds).toBe(1)
    expect(parsed.uwb?.rmnr).toBe(false)
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('round-trips: the schema can parse its own output', () => {
    // A valid, non-default combination (rmnr needs rcmValidityRounds above 1) — the previous
    // slice's Ruling 4 was exactly a schema whose output was not valid input of itself.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, rcmValidityRounds: 4, rmnr: true }
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    // Pinned so this assertion cannot pass vacuously by both sides simply lacking the fields
    // (the previous slice's Ruling 4 bug: a schema whose output is not valid input of itself).
    expect(once.uwb?.rcmValidityRounds).toBe(4)
    expect(once.uwb?.rmnr).toBe(true)
    expect(() => ScenarioSchema.parse(once)).not.toThrow()
    const twice = ScenarioSchema.parse(once)
    expect(twice.uwb).toEqual(once.uwb)
  })

  it('rcmValidityRounds accepts 1…64 and refuses outside it', () => {
    const at1: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, rcmValidityRounds: 1 }
    const at64: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, rcmValidityRounds: 64 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), at1)).success).toBe(true)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), at64)).success).toBe(true)
    const zero: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, rcmValidityRounds: 0 }
    const over: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, rcmValidityRounds: 65 }
    const frac: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, rcmValidityRounds: 2.5 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), zero)).success).toBe(false)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), over)).success).toBe(false)
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), frac)).success).toBe(false)
  })

  it('Ruling 2: rmnr true with rcmValidityRounds 1 is refused, and says why', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr', rmnr: true, rcmValidityRounds: 1 }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      // The wording is part of the deliverable: not a shrug, the causal reason.
      expect(msg).not.toMatch(/^不支持$/)
      expect(msg).not.toMatch(/^暂不支持$/)
      expect(msg).not.toMatch(/不支持。?$/)
      expect(msg).toMatch(/时隙/)
      expect(msg).toMatch(/控制消息/)
    }
    // rcmValidityRounds above 1 makes the same combination legal.
    const ok: UwbSessionCfg = { ...cfg, rcmValidityRounds: 2 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), ok)).success).toBe(true)
  })

  it('dl-tdoa: one block holds exactly one round, so rcmValidityRounds above 1 is refused', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', rcmValidityRounds: 4 }
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/一轮/)
    }
    // rcmValidityRounds at the default 1 is fine — it is the same Poll DL-TDoA already sends.
    const at1: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', rcmValidityRounds: 1 }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), at1)).success).toBe(true)
    // And DL-TDoA's Poll is a real control message, so Ruling 2 still applies to it: rmnr true
    // at rcmValidityRounds 1 is refused for the same causal reason as twr.
    const rmnrAt1: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'dl-tdoa', rmnr: true, rcmValidityRounds: 1 }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), rmnrAt1)).success).toBe(false)
  })

  it('ul-tdoa: the blink carries no control message at all, so both fields are refused off-default', () => {
    const rounds: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', rcmValidityRounds: 4 }
    const r1 = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), rounds))
    expect(r1.success).toBe(false)
    // rmnr refused even at rcmValidityRounds 1 — not just "1 is incompatible with true", but
    // "there is no control message here for any value of rcmValidityRounds to extend".
    const rmnr: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa', rmnr: true }
    const r2 = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), rmnr))
    expect(r2.success).toBe(false)
    if (!r2.success) {
      const msg = r2.error.issues.map((i) => i.message).join('\n')
      // The reason has to be UL-TDoA's own (no responder, no control message), not the generic
      // Poll-missed wording Ruling 2 uses for twr/dl-tdoa, which would be false here.
      expect(msg).not.toMatch(/Poll/)
    }
    const defaults: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'ul-tdoa' }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), defaults)).success).toBe(true)
  })

  it('mms: the control plane is narrowband, not the ARC IE, so both fields are refused off-default', () => {
    const rounds: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'mms', rcmValidityRounds: 4 }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), rounds)).success).toBe(false)
    const rmnr: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'mms', rmnr: true }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), rmnr)).success).toBe(false)
    const defaults: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'mms' }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), defaults)).success).toBe(true)
  })

  it('m2m: every transmission is its own question and answer, so both fields are refused off-default', () => {
    const rounds: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', rcmValidityRounds: 4 }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(), rounds)).success).toBe(false)
    const rmnr: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', rmnr: true }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(), rmnr)).success).toBe(false)
    const defaults: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss' }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(), defaults)).success).toBe(true)
  })
})
