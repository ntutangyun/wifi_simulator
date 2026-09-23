/**
 * Every empirical claim of "MU-MIMO — splitting by space instead of
 * frequency", measured against the lesson's own two variants.
 *
 * What is pinned here is what this lesson's own sentences say: the two rows of
 * the comparison table (members, payload each, data symbols, send length and
 * per-member rate), the formula behind those lengths and the 1.41 it comes to,
 * the combined 12,918 against 8,612 bytes, the antenna arithmetic behind "the
 * group is never three", and the acknowledgement round that settles a whole
 * group at once.
 *
 * `tests/course/quoted-timestamps.test.ts` owns the deeper section's 196 / 122
 * / 65 / 9 split and the added-phones experiment, and
 * `tests/course/lesson-claims.test.ts` owns the backup-off experiment; this
 * file does not duplicate them. The lesson never had a `.body!` site in any
 * test.
 */
import { describe, it, expect } from 'vitest'
import { mumimo } from '../../src/course/tier2/mumimo'
import { mumimoScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES, toneRatio } from '../../src/engine/phy'
import { lessonShapeSuite, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 500 * MS
const SIFS_NS = 16 * US
const PHONES = ['sta-1', 'sta-2', 'sta-3']
/** The fixed opening of a multi-user send: the EHT preamble plus the per-user map. */
const OPENING_NS = PHY_MODES.eht.preambleNs + PHY_MODES.eht.muExtraPreambleNs

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muSends = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
/** The first send of a variant in which every member carries the same 4,306 B: the table's row. */
const cleanSend = (rs: TLRecord[], members: number): Tx => {
  const hit = muSends(rs).find((r) => r.frame.muParts!.length === members
    && new Set(r.frame.muParts!.map((p) => p.bytes)).size === 1
    && r.frame.muParts![0].bytes === 4_306)
  expect(hit, `a clean ${members}-member send`).toBeDefined()
  return hit!
}

lessonShapeSuite(mumimo, { proseMax: 1050, runNs: RUN_NS })

describe('mumimo · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the two halves of the idea it compares', () => {
    expect(mumimo.module).toBe(6)
    expect(mumimo.needs).toEqual(['streams', 'ofdma-dl'])
    expect(mumimo.terms!.map((t) => t.term)).toEqual(['MU-MIMO', 'beamforming', 'sounding'])
  })

  it('keeps the same house and the same two variants, differing in one feature flag', () => {
    expect(mumimo.scenario()).toEqual(mumimoScenario(false))
    expect(mumimo.variants!.map((v) => v.scenario())).toEqual([mumimoScenario(false), mumimoScenario(true)])
    expect(mumimo.variants!.map((v) => v.label.en)).toEqual(['OFDMA (split by frequency)', 'MU-MIMO (split by space)'])
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

describe('mumimo · one send of each kind', () => {
  const ofdma = cleanSend(runOf(mumimo, 0, RUN_NS), 3)
  const mimo = cleanSend(runOf(mumimo, 1, RUN_NS), 2)

  it('the table’s two rows: 3 and 2 members, 4,306 B each, 92.8 µs and 65.6 µs', () => {
    expect(ofdma.frame.muParts!.length).toBe(3)
    expect(mimo.frame.muParts!.length).toBe(2)
    expect(ofdma.frame.txTimeNs).toBe(92.8 * US)
    expect(mimo.frame.txTimeNs).toBe(65.6 * US)
    expect(ofdma.frame.muKind).toBe('ofdma')
    expect(mimo.frame.muKind).toBe('mumimo')
    // each OFDMA member is on a third of the channel; each MU-MIMO member on all of it
    expect(new Set(ofdma.frame.muParts!.map((p) => p.ruFraction))).toEqual(new Set([1 / 3]))
    expect(new Set(mimo.frame.muParts!.map((p) => p.nss))).toEqual(new Set([2]))
  })

  it('"Rate per member": 371.2 and 525.1 Mb/s, payload over the length of the send', () => {
    const rate = (r: Tx): number => Math.round(((r.frame.muParts![0].bytes * 8) / (r.frame.txTimeNs / 1000)) * 10) / 10
    expect(rate(ofdma)).toBe(371.2)
    expect(rate(mimo)).toBe(525.1)
    expect(rate(mimo)).toBeGreaterThan(rate(ofdma))
  })

  it('the formula: a fixed 52 µs opening plus three data symbols against one', () => {
    expect(OPENING_NS).toBe(52 * US)
    expect(PHY_MODES.eht.symNs).toBe(13.6 * US)
    expect((ofdma.frame.txTimeNs - OPENING_NS) / PHY_MODES.eht.symNs).toBe(3)
    expect((mimo.frame.txTimeNs - OPENING_NS) / PHY_MODES.eht.symNs).toBe(1)
    // "a clean threefold gain" on the data, "only 1.41 times" end to end
    expect((ofdma.frame.txTimeNs - OPENING_NS) / (mimo.frame.txTimeNs - OPENING_NS)).toBe(3)
    expect(Math.round((ofdma.frame.txTimeNs / mimo.frame.txTimeNs) * 100) / 100).toBe(1.41)
  })

  it('"Three members deliver 12,918 bytes against two members’ 8,612"', () => {
    expect(ofdma.frame.bytes).toBe(12_918)
    expect(mimo.frame.bytes).toBe(8_612)
    expect(3 * 4_306).toBe(12_918)
    expect(2 * 4_306).toBe(8_612)
  })
})

describe('mumimo · the procedure, run against every multi-user send of both variants', () => {
  const nssOf = (id: string): number => mumimo.scenario().nodes.find((n) => n.id === id)!.caps.nss ?? 1

  it.each([[0, 'split by frequency'], [1, 'split by space']] as const)('variant %i (%s)', (v, _name) => {
    const sends = muSends(runOf(mumimo, v, RUN_NS))
    expect(sends.length).toBeGreaterThan(50)
    for (const r of sends) {
      const parts = r.frame.muParts!
      // step 1: never fewer than two members, never more than the engine's four
      expect(parts.length).toBeGreaterThanOrEqual(2)
      expect(parts.length).toBeLessThanOrEqual(4)
      if (r.frame.muKind === 'mumimo') {
        // step 2: beams only above the 1,000-byte floor; step 3: streams within the router's four
        for (const p of parts) expect(p.bytes).toBeGreaterThanOrEqual(1_000)
        expect(parts.reduce((s, p) => s + (p.nss ?? 1), 0)).toBeLessThanOrEqual(4)
        for (const p of parts) expect(p.ruFraction).toBeUndefined()
      } else {
        for (const p of parts) expect(p.ruFraction).toBe(1 / parts.length)
      }
      // step 5: the opening once, then 13.6 µs for as many symbols as the longest member needs.
      // A slicing member keeps its own stream count as well: only `ruFraction` is recorded on
      // the part, so the stream count is read back off the scenario.
      const mode = r.frame.mode!
      const symbolsOf = (p: typeof parts[number]): number => {
        const bps = PHY_MODES[mode].ndbps[p.mcs] * toneRatio(mode, r.frame.widthMhz ?? 20)
          * (p.nss ?? nssOf(p.dst)) * (p.ruFraction ?? 1)
        return Math.ceil((16 + 8 * p.bytes + 6) / bps)
      }
      expect(r.frame.txTimeNs).toBe(OPENING_NS + PHY_MODES[mode].symNs * Math.max(...parts.map(symbolsOf)))
    }
  })

  it('the worked example’s own two columns: a third of the tones against all of them', () => {
    // 4,306 B at EHT MCS 13 on 160 MHz: three symbols on a third of the tones, one on all
    const bps = (frac: number, nss: number): number =>
      PHY_MODES.eht.ndbps[13] * toneRatio('eht', 160) * nss * frac
    expect(Math.ceil((16 + 8 * 4_306 + 6) / bps(1 / 3, 2))).toBe(3)
    expect(Math.ceil((16 + 8 * 4_306 + 6) / bps(1, 2))).toBe(1)
    expect(OPENING_NS + 3 * PHY_MODES.eht.symNs).toBe(92.8 * US)
    expect(OPENING_NS + 1 * PHY_MODES.eht.symNs).toBe(65.6 * US)
  })
})

describe('mumimo · one round of acknowledgement settles the whole group', () => {
  // the counts the observation was written from, pinned rather than bounded (tier-2 review,
  // Minor 20): the OFDMA variant settles 162 of 169 sends, the MU-MIMO one 190 of 196, and the
  // rest are the sends the laptop talked over — "which happens to a few of them".
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
