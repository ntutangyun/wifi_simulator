import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { uwbMaxParticipants, uwbSlotsPerTag } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

/**
 * Task 2 of docs/superpowers/specs/2026-09-30-many-to-many-design.md: the scenario schema for
 * many-to-many ranging (standard §10.32.6 SS-TWR / §10.32.7 DS-TWR) — the new `mode: 'm2m'`, the
 * rules it changes (no tag/anchor requirement, one round per block for the whole group) and the
 * combinations it refuses (contention, non-embedded replyTime, AoA). No schedule, no device
 * belongs here — see design §3, §5, §7.
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

/** N many-to-many participants, all the same role — role only decides how a node is drawn in
 * this mode (design §5), so it must never change whether or how the round ranges. */
const m2mNodes = (n: number, role: 'anchor' | 'tag' = 'tag'): NodeCfg[] =>
  Array.from({ length: n }, (_, i) => uwbNode(`p-${i}`, role, i * 2, 0))

/** N participants, the first `tagged` of them role 'tag' and the rest role 'anchor' — used to
 * prove the block-fit and cap rules read the participant *count*, not either role's count. */
const m2mMixed = (n: number, tagged: number): NodeCfg[] =>
  Array.from({ length: n }, (_, i) => uwbNode(`p-${i}`, i < tagged ? 'tag' : 'anchor', i * 2, 0))

describe('UwbMode: m2m — the scenario schema for many-to-many ranging (design §5)', () => {
  it('a scenario that never sets mode parses, and reads back as twr', () => {
    // Same shape as the reply-time slice's own legacy test: a scenario written before this value
    // existed carries no key for it at all, not a key that happens to already hold 'twr'.
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.mode
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.mode).toBe('twr')
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('m2m needs no anchor and no tag: an all-tag-role group still ranges', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss' }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(3, 'tag'), cfg)).success).toBe(true)
    // Symmetric: all-anchor-role is just as fine, because role never meant "participant" here.
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(3, 'anchor'), cfg)).success).toBe(true)
  })

  it('m2m does not forbid a tag either: a mixed-role group still ranges', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss' }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mMixed(4, 2), cfg)).success).toBe(true)
  })

  it('the anchor/tag requirement still applies outside m2m: the exemption is mode-scoped', () => {
    // Same all-anchor-role group as above, but 'twr' — no tag at all, which must still be refused
    // for the same reason it always was. If the anchor/tag rule had been relaxed for every mode
    // instead of just m2m, this would wrongly pass.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'twr' }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3, 'anchor'), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/至少要有一个 anchor 和一个 tag/)
    }
  })

  it('schedule: contention + m2m is refused — every slot is already scheduled, nothing to contend for', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', schedule: 'contention' }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/多对多/)
      expect(msg).toMatch(/没有什么可抢/)
    }
    // time is fine.
    const timeCfg: UwbSessionCfg = { ...cfg, schedule: 'time' }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), timeCfg)).success).toBe(true)
  })

  it("replyTime: 'fixed' + m2m is refused — no single reception a fixed delay could be measured from", () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', replyTime: 'fixed' }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/好几个人/)
      expect(msg).toMatch(/没有唯一的一次接收/)
    }
  })

  it("replyTime: 'deferred' + m2m is refused — the standard's many-to-many clauses define no such message", () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', replyTime: 'deferred' }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/没有独立的响应帧/)
    }
  })

  it("replyTime: 'embedded' + m2m (the default) is allowed", () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', replyTime: 'embedded' }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg)).success).toBe(true)
  })

  it('aoa + m2m is refused with its own reason, not the generic TDoA/MMS message', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', aoa: true }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/没有锚点也没有标签/)
      // Not the dl-tdoa/ul-tdoa/mms wording — this is a distinct reason, not a reused one.
      expect(msg).not.toMatch(/TDoA 与 MMS/)
    }
  })

  it('enforces the participant cap from uwbMaxParticipants, not a literal', () => {
    const cap = uwbMaxParticipants('ss')
    expect(cap).toBeGreaterThan(0)
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss' }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(cap, 'tag'), cfg)).success).toBe(true)
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(cap + 1, 'tag'), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(new RegExp(String(cap)))
      expect(msg).toMatch(/127/)
      expect(msg).toMatch(/参与者/)
    }
  })

  it('refuses a slot too short for the last participant’s frame', () => {
    // 16 participants (last carries 15 arrival times, 82 octets) need ≈257.3 µs of airtime plus
    // guard; the shortest legal slot (300 RSTU = 250 µs) does not have it.
    const nodes = m2mNodes(16, 'tag')
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', slotRstu: 300, blockRstu: 9600 }
    const r = ScenarioSchema.safeParse(uwbScenario(nodes, cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/µs/)
    }
  })

  it('the schema parses its own output for an m2m session (round-trip)', () => {
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss' }
    const once = ScenarioSchema.parse(uwbScenario(m2mMixed(5, 2), cfg))
    const twice = ScenarioSchema.parse(once)
    expect(twice).toEqual(once)
    expect(twice.uwb?.mode).toBe('m2m')

    // And the ds shape round-trips too.
    const dsCfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ds' }
    const dsOnce = ScenarioSchema.parse(uwbScenario(m2mMixed(4, 1), dsCfg))
    const dsTwice = ScenarioSchema.parse(dsOnce)
    expect(dsTwice).toEqual(dsOnce)
  })
})

describe('the block-fit rule: one round per block for the whole group (design §5), not one per tag', () => {
  it('is not multiplied by how many nodes are role-tagged "tag"', () => {
    // 4 participants, 2 of them role 'tag'. SS needs 4 slots for the whole group — one round.
    // A block sized for exactly that (4 × 2400 RSTU) must pass; a per-tag rule would have
    // demanded room for 2 rounds (8 slots) and refused it.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', blockRstu: 4 * 2400 }
    expect(ScenarioSchema.safeParse(uwbScenario(m2mMixed(4, 2), cfg)).success).toBe(true)
  })

  it('counts every UWB node, not just the ones role-tagged "anchor"', () => {
    // 5 participants, only 2 of them role 'anchor'. SS needs 5 slots (12 000 RSTU). A block sized
    // for only the anchor count's worth (2 slots, 4 800 RSTU) must be refused: reading `anchors`
    // here instead of the participant count would wrongly accept it.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', blockRstu: 2 * 2400 }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mMixed(5, 3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/5/)
    }
  })

  it('ss needs N slots and ds needs 2N for the very same group (design §3)', () => {
    const nodes = m2mMixed(4, 1)
    const oneSsRound = 4 * 2400 // exactly one ss round (N=4), half of what ds needs (2N=8)
    const ssCfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', blockRstu: oneSsRound }
    const dsCfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ds', blockRstu: oneSsRound }
    expect(ScenarioSchema.safeParse(uwbScenario(nodes, ssCfg)).success).toBe(true)
    const r = ScenarioSchema.safeParse(uwbScenario(nodes, dsCfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/8/)
    }
    // Give ds the room its two passes actually need, and it passes too.
    const dsFits: UwbSessionCfg = { ...dsCfg, blockRstu: 2 * oneSsRound }
    expect(ScenarioSchema.safeParse(uwbScenario(nodes, dsFits)).success).toBe(true)
  })

  it('refuses a block that cannot even hold one round', () => {
    const nodes = m2mNodes(4, 'tag')
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', blockRstu: 4 * 2400 - 300 }
    const r = ScenarioSchema.safeParse(uwbScenario(nodes, cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/暂不支持/)
      expect(msg).toMatch(/装不下一轮多对多测距/)
    }
  })
})

describe('Ruling 7: the schema’s block-fit slot count is uwbSlotsPerTag’s, not a second formula', () => {
  // Task 2 had to write the m2m slot-count arithmetic (N for SS, 2N for DS) inline in this file,
  // because `uwbSlotsPerTag` had no 'm2m' case yet. Task 3 gives it one and this schema now calls
  // it instead of repeating the formula — this test pins the schema's own accept/refuse boundary
  // to `roundPlan`'s slot count (which is `uwbSlotsPerTag` too) so the two cannot drift apart
  // again without a test noticing: if either side ever went back to a second, independent
  // formula, this boundary would move on one side and not the other.
  it('accepts a block sized to exactly roundPlan’s own m2m slot count, and refuses one slot short', () => {
    for (const method of ['ss', 'ds'] as const) {
      const n = 5
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method }
      const slots = roundPlan(cfg, n).slots
      // roundPlan's own number is uwbSlotsPerTag's, read with the same arguments the schema now
      // passes it — not assumed, so a wrong instrument here would show up as a wrong `slots` too.
      expect(slots).toBe(uwbSlotsPerTag(method, n, cfg.schedule, cfg.contentionSlots, 'm2m'))
      expect(slots).toBe(method === 'ss' ? n : 2 * n)

      const nodes = m2mNodes(n)
      const fits: UwbSessionCfg = { ...cfg, blockRstu: slots * cfg.slotRstu }
      const oneShort: UwbSessionCfg = { ...cfg, blockRstu: slots * cfg.slotRstu - cfg.slotRstu }
      expect(ScenarioSchema.safeParse(uwbScenario(nodes, fits)).success, method).toBe(true)
      const r = ScenarioSchema.safeParse(uwbScenario(nodes, oneShort))
      expect(r.success, method).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg, method).toMatch(new RegExp(String(slots)))
      }
    }
  })
})
