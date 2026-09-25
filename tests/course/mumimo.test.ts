/**
 * Every empirical claim of "MU-MIMO — splitting by space instead of frequency",
 * measured against the lesson's own two variants.
 *
 * Re-paced 2026-09-26: this half keeps what dividing space means, the antenna
 * arithmetic that caps the group, the trim procedure and the acknowledgement
 * round. What each way costs — the comparison table, the length formula, the
 * combined bytes and the 1,000-byte threshold the engine picks by — moved to
 * tests/course/mumimo-choose.test.ts with the prose, and is not duplicated here.
 *
 * Two corrections this file exists to hold:
 *  - "one round of acknowledgement settles the group" is 162 of 169 sends in the
 *    slicing variant, and the test pins the count rather than a bound;
 *  - the figure is the run's own first MU-MIMO send, so the phone drawn outside
 *    the group is the phone the engine trimmed — not a phone the simulator
 *    cannot reach, and not a sounding exchange, which it never runs at all.
 *
 * `tests/course/quoted-timestamps.test.ts` owns the two quoted sends'
 * timestamps, the 196 / 122 / 65 / 9 split and the added-phones experiment, and
 * `tests/course/lesson-claims.test.ts` owns the backup-off experiment; this file
 * does not duplicate them.
 */
import { describe, it, expect } from 'vitest'
import { mumimo, mumimoTopology } from '../../src/course/tier2/mumimo'
import { mumimoScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 500 * MS
const SIFS_NS = 16 * US
const PHONES = ['sta-1', 'sta-2', 'sta-3']

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muSends = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)

lessonShapeSuite(mumimo, { runNs: RUN_NS })

describe('mumimo · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the two halves of the idea it builds on', () => {
    expect(MODULES[mumimo.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mumimo.needs).toEqual(['streams', 'ofdma-dl'])
    expect(mumimo.terms!.map((t) => t.term)).toEqual(['MU-MIMO', 'beamforming', 'sounding'])
  })

  it('keeps the same house and the same two variants, differing in one feature flag', () => {
    expect(mumimo.scenario()).toEqual(mumimoScenario(false))
    expect(mumimo.variants!.map((v) => v.scenario())).toEqual([mumimoScenario(false), mumimoScenario(true)])
    expect(mumimo.variants!.length).toBe(2)
    for (const v of mumimo.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    // "Exactly one feature flag: MU-MIMO, on the phones and the router."
    const [a, b] = mumimo.variants!.map((v) => v.scenario())
    for (const [i, n] of a.nodes.entries()) {
      const m = b.nodes[i]
      expect(n.id).toBe(m.id)
      expect({ ...n.caps.features, mumimo: null }).toEqual({ ...m.caps.features, mumimo: null })
      expect(n.caps.features!.mumimo).toBe(false)
      expect(m.caps.features!.mumimo).toBe(true)
      expect(n.caps.features!.ofdma).toBe(true)
      expect(m.caps.features!.ofdma).toBe(true)
    }
  })

  it('the antenna arithmetic behind "the group is never three": four against two and two', () => {
    const sc = mumimo.variants![1].scenario()
    expect(sc.nodes.find((n) => n.id === 'ap')!.caps.nss).toBe(4)
    for (const id of PHONES) expect(sc.nodes.find((n) => n.id === id)!.caps.nss).toBe(2)
    expect(2 + 2).toBeLessThanOrEqual(4)
    expect(2 + 2 + 2).toBeGreaterThan(4)
    // and the run keeps to it: never more than two members when space is what is divided
    expect(new Set(muSends(runOf(mumimo, 1, RUN_NS)).map((r) => r.frame.muParts!.length))).toEqual(new Set([2]))
    expect(new Set(muSends(runOf(mumimo, 0, RUN_NS)).map((r) => r.frame.muParts!.length)).has(3)).toBe(true)
  })
})

describe('mumimo · the figure is the run’s own first send by space', () => {
  const spec = mumimoTopology()

  it('draws the scene node for node, at the scene’s own positions', () => {
    const sc = mumimoScenario(true)
    expect(spec.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    for (const n of spec.nodes) {
      const src = sc.nodes.find((x) => x.id === n.id)!
      expect([n.x, n.y], n.id).toEqual([src.pos.x, src.pos.y])
      expect(n.role, n.id).toBe(src.kind === 'ap' ? 'ap' : 'sta')
      expect(n.label.trim(), n.id).not.toBe('')
    }
    // every link starts at the router: this is one send, not a topology of peers
    for (const l of spec.links) expect(l.from).toBe('ap')
  })

  it('the two phones inside the ring, and the dashed one outside it, are that send’s members', () => {
    const first = muSends(runOf(mumimo, 1, RUN_NS))[0]
    const members = new Set(first.frame.muParts!.map((p) => p.dst))
    // the ring holds the router and exactly the members
    expect(new Set(spec.ring!.nodes)).toEqual(new Set(['ap', ...members]))
    expect(members).toEqual(new Set(['sta-2', 'sta-3']))
    // the accented links are the members', the dashed one is the phone that was trimmed
    const accent = spec.links.filter((l) => l.tone === 'accent').map((l) => l.to)
    expect(new Set(accent)).toEqual(members)
    const muted = spec.links.filter((l) => l.tone === 'muted').map((l) => l.to)
    expect(muted).toEqual(['sta-1'])
    expect(PHONES.filter((p) => !members.has(p))).toEqual(['sta-1'])
    // and it really is a full-width member each, not a slice each
    for (const p of first.frame.muParts!) {
      expect(p.ruFraction).toBeUndefined()
      expect(p.nss).toBe(2)
    }
  })

  it('"which phone is trimmed is not fixed": all three pairings occur over the run', () => {
    const pairs = new Set(muSends(runOf(mumimo, 1, RUN_NS))
      .map((r) => r.frame.muParts!.map((p) => p.dst).sort().join('+')))
    expect(pairs).toEqual(new Set(['sta-1+sta-2', 'sta-1+sta-3', 'sta-2+sta-3']))
  })
})

describe('mumimo · the trim procedure, run against every send by space', () => {
  it('steps 1, 3 and 4: two to four members, streams within the router’s four, full width each', () => {
    const sends = muSends(runOf(mumimo, 1, RUN_NS))
    expect(sends.length).toBeGreaterThan(50)
    for (const r of sends) {
      const parts = r.frame.muParts!
      expect(r.frame.muKind).toBe('mumimo')
      expect(parts.length).toBeGreaterThanOrEqual(2)
      expect(parts.length).toBeLessThanOrEqual(4)
      // step 3: the group is trimmed until the members' streams fit the antennas
      expect(parts.reduce((s, p) => s + (p.nss ?? 1), 0)).toBeLessThanOrEqual(4)
      // step 4: each survivor gets the whole width at its own stream count
      for (const p of parts) expect(p.ruFraction).toBeUndefined()
    }
  })

  it('step 4’s other branch: fewer than two survivors falls back, so no send by space is ever one member', () => {
    for (const r of muSends(runOf(mumimo, 1, RUN_NS))) expect(r.frame.muParts!.length).not.toBe(1)
  })
})

describe('mumimo · one round of acknowledgement settles the whole group', () => {
  // the counts the observation was written from, pinned rather than bounded (tier-2 review,
  // Minor 20): the OFDMA variant settles 162 of 169 sends, the MU-MIMO one 190 of 196, and the
  // rest are the sends the laptop talked over. Step 6 of this lesson quotes 162 of 169.
  it.each([[0, 'OFDMA', 169, 162], [1, 'MU-MIMO', 196, 190]] as const)('variant %i (%s)', (v, _name, total, ok) => {
    const rs = runOf(mumimo, v, RUN_NS)
    const sends = muSends(rs)
    expect(sends.length).toBeGreaterThan(50)
    let settled = 0, collided = 0
    for (const s of sends) {
      // every member's part is one PPDU, so they end together by construction; what the
      // observation claims is that one gap later the group is acknowledged in one round —
      // "unless the send collided with the laptop", which is the other branch here
      const bas = txs(rs, (r) => (r.frame.kind === 'ba' || r.frame.kind === 'mba')
        && r.t === s.t + s.frame.txTimeNs + SIFS_NS)
      if (bas.length > 0) {
        expect(new Set(bas.map((r) => r.t)).size).toBe(1)
        settled++
        continue
      }
      const hit = rs.some((r) => r.type === 'COLLISION' && r.t >= s.t && r.t <= s.t + s.frame.txTimeNs)
      expect(hit, `the send at ${s.t} was neither acknowledged nor collided with`).toBe(true)
      collided++
    }
    expect(sends.length).toBe(total)
    expect(settled + collided).toBe(sends.length)
    expect(settled).toBe(ok)
    expect(collided).toBe(total - ok)
  })
})
