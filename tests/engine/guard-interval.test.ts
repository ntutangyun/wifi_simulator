/**
 * The guard interval's pure-function layer (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §1.1, §1.4, §3.1, §3.2, §3.6, §8).
 *
 * The three things these tests exist to hold down:
 *
 *  1. **`PHY_MODES[*].symNs` becomes an alias rather than an independent fact.**
 *     `symNsFor(mode, TGI_NS.base)` has to equal it for all four modes, so that every line of
 *     today's code that reads `symNs` keeps reading the same number and the new paths that need
 *     a guard interval go through `symNsFor` instead.
 *  2. **The figures are computed, not typed.** 13.6 µs is T_DFT,EHT + T_GI1,Data, and the
 *     assertions below show the addition rather than the sum (§8 item 1).
 *  3. **The demodulation threshold is blind to the guard interval, and that is a fact about
 *     `reqSinrDb`'s signature, not about today's values** (§2.1). Every "long GI improved
 *     reliability" observation in this engine is resampling noise, and the last `describe` here
 *     is where that is pinned on the pure-function side.
 */
import { describe, it, expect } from 'vitest'
import {
  GI_MODES, PHY_MODES, TDFT_EHT_NS, TGI_NS, TLTF_2X_NS, TLTF_4X_NS,
  ltfExtraNs, mcsRateMbps, preambleNsFor, reqSinrDb, symNsFor, txTimeModeNs, type PhyMode,
} from '../../src/engine/phy'

const ALL_MODES: PhyMode[] = ['nonht', 'vht', 'he', 'eht']
const GI_KEYS = ['base', 'double', 'quad'] as const

describe('guard interval · symbol durations', () => {
  // (a) The weld. standard §27.3.9 Table 27-13 / standard be §36.3.10 Table 36-18.
  it('symNsFor at the base GI is exactly PHY_MODES[*].symNs, for all four modes', () => {
    for (const m of ALL_MODES) {
      expect(symNsFor(m, TGI_NS.base)).toBe(PHY_MODES[m].symNs)
      // The default argument is the base GI, so the one-argument call is the same alias.
      expect(symNsFor(m)).toBe(PHY_MODES[m].symNs)
    }
  })

  it('the pre-HE generations return 4 µs unconditionally, whatever GI is asked for', () => {
    // GI_TYPE in clause 19 / 21 is the LONG_GI / SHORT_GI enumeration, a different set of
    // values altogether (§5 item 2b), so these two modes do not answer this question.
    expect(symNsFor('nonht', TGI_NS.quad)).toBe(4_000)
    expect(symNsFor('vht', TGI_NS.quad)).toBe(4_000)
    expect(symNsFor('nonht', TGI_NS.double)).toBe(4_000)
    expect(symNsFor('vht', TGI_NS.double)).toBe(4_000)
  })

  // (b) T_SYM1 / T_SYM2 / T_SYM4.
  it('HE and EHT carry the table\'s three symbol durations', () => {
    for (const m of GI_MODES) {
      expect(symNsFor(m, TGI_NS.base)).toBe(13_600)
      expect(symNsFor(m, TGI_NS.double)).toBe(14_400)
      expect(symNsFor(m, TGI_NS.quad)).toBe(16_000)
    }
    expect([...GI_MODES]).toEqual(['he', 'eht'])
  })

  // (c) The figures are computed, not written down (§8 item 1, after 4a §9 item 1).
  it('each symbol duration is the DFT period plus the chosen GI, as an addition', () => {
    const sym = (dft: number, gi: number): number => dft + gi
    for (const k of GI_KEYS) {
      // The sum is visible here: 12.8 + 0.8 = 13.6 is an addition in the test, not a literal.
      expect(symNsFor('he', TGI_NS[k]) - TGI_NS[k]).toBe(TDFT_EHT_NS)
      expect(symNsFor('eht', TGI_NS[k]) - TGI_NS[k]).toBe(TDFT_EHT_NS)
      expect(symNsFor('he', TGI_NS[k])).toBe(sym(TDFT_EHT_NS, TGI_NS[k]))
    }
    // Swap the DFT period for T_DFT,Pre (the pre-HE / pre-EHT field's 3.2 µs) and the same
    // addition gives 4.0 / 4.8 / 6.4 µs — so the implementation depends on TDFT_EHT_NS and on
    // nothing else.
    expect(GI_KEYS.map((k) => sym(3_200, TGI_NS[k]))).toEqual([4_000, 4_800, 6_400])
  })
})

describe('guard interval · the 8.8 µs the 4x LTF costs', () => {
  // (d) §1.4: the (LTF, GI) pairing. 4x LTF goes with 3.2 µs and with nothing else, so the
  // preamble's single training symbol grows from 6.4 + 0.8 to 12.8 + 3.2 µs.
  it('is computed from the two LTF durations, not measured', () => {
    expect(ltfExtraNs(TGI_NS.quad)).toBe(8_800)
    expect(ltfExtraNs(TGI_NS.quad)).toBe((TLTF_4X_NS + TGI_NS.quad) - (TLTF_2X_NS + TGI_NS.base))
    expect(TLTF_2X_NS).toBe(6_400)
    expect(TLTF_4X_NS).toBe(12_800)
  })

  it('is zero at the two GIs that keep the 2x LTF', () => {
    expect(ltfExtraNs(TGI_NS.base)).toBe(0)
    expect(ltfExtraNs(TGI_NS.double)).toBe(0)
    expect(ltfExtraNs()).toBe(0)
  })

  it('lands on the preamble of HE and EHT, and never on the older two generations', () => {
    expect(preambleNsFor('he', TGI_NS.quad)).toBe(52_800)
    expect(preambleNsFor('eht', TGI_NS.quad)).toBe(56_800)
    expect(preambleNsFor('vht', TGI_NS.quad)).toBe(40_000)
    expect(preambleNsFor('nonht', TGI_NS.quad)).toBe(20_000)
    for (const m of ALL_MODES) {
      expect(preambleNsFor(m, TGI_NS.base)).toBe(PHY_MODES[m].preambleNs)
      expect(preambleNsFor(m, TGI_NS.double)).toBe(PHY_MODES[m].preambleNs)
      expect(preambleNsFor(m)).toBe(PHY_MODES[m].preambleNs)
    }
  })
})

describe('guard interval · the standard publishes three rate columns', () => {
  // (e) §0.4, §8 item 2. Table 27-86 / Table 36-76's rate column is three columns, and
  // `PHY_MODES[*].mbps` is the first of them — which nothing in the repo said until now.
  it('every rate is N_DBPS over the symbol duration, for four modes x three GIs', () => {
    const bad: string[] = []
    for (const m of ALL_MODES) {
      PHY_MODES[m].ndbps.forEach((ndbps, mcs) => {
        for (const k of GI_KEYS) {
          const want = Math.round((ndbps / (symNsFor(m, TGI_NS[k]) / 1000)) * 10) / 10
          const got = mcsRateMbps(m, mcs, TGI_NS[k])
          if (got !== want) bad.push(`${m}[${mcs}]@${k}: ${got} != ${want}`)
        }
      })
    }
    expect(bad).toEqual([])
  })

  it('the base column is the literal table already shipped, item for item', () => {
    // Measured: all four modes agree item for item, including nonht's literal rate table and
    // vht's `n / 4`. That is what lets `mcsRateMbps` keep serving the lookup at the base GI
    // (so a published lesson's rate column cannot move by one float) while the other two
    // columns are computed.
    const bad: string[] = []
    for (const m of ALL_MODES) {
      PHY_MODES[m].mbps.forEach((lit, mcs) => {
        const got = mcsRateMbps(m, mcs, TGI_NS.base)
        if (got !== lit) bad.push(`${m}[${mcs}]: ${got} != ${lit}`)
        if (mcsRateMbps(m, mcs) !== lit) bad.push(`${m}[${mcs}] default arg: ${mcsRateMbps(m, mcs)} != ${lit}`)
      })
    }
    expect(bad).toEqual([])
  })

  /**
   * **The base column is served by the LOOKUP, and that is a behavioural fact rather than a
   * comment.** `mcsRateMbps`'s own doc comment says not to simplify the base branch into the
   * one-line expression, because the lookup *guarantees* a published lesson's rate column
   * cannot move while the expression only happens to agree. But the two agree item for item on
   * all four modes — so swapping one for the other changes no value, passes every other
   * assertion in this file, and leaves the comment as the only thing standing in the way.
   * **A protection that provably changes nothing is the shape §5 of the design hunts, and this
   * one guards the implementation rather than a configuration.**
   *
   * The discriminator cannot be a value, so it is the dependency: move the stored array and the
   * lookup follows it, while the formula cannot see it. The other two columns must NOT follow,
   * because those genuinely are computed.
   *
   * **It mutates a module-level array and restores it in `finally`** — the same technique, and the
   * same risk surface, as the `reqSinrDb` test at the foot of this file, which moves
   * `PHY_MODES[*].symNs`. Both are safe only because vitest gives each test FILE its own worker,
   * so nothing else is reading `PHY_MODES` while the sentinel is in place. If this suite is ever
   * run with tests inside a file sharing a worker concurrently, these two are what break — and
   * they would break as flakes elsewhere, not as failures here.
   */
  it('reads the stored array for the base GI, so replacing the lookup with the formula fails here', () => {
    const saved = PHY_MODES.he.mbps.slice()
    try {
      // A sentinel no formula could produce from N_DBPS 1950 over any of the three symbols.
      PHY_MODES.he.mbps[11] = -1
      expect(mcsRateMbps('he', 11), 'the base GI no longer goes through PHY_MODES[*].mbps').toBe(-1)
      expect(mcsRateMbps('he', 11, TGI_NS.base)).toBe(-1)
      // …and the computed columns are untouched by it.
      expect(mcsRateMbps('he', 11, TGI_NS.double)).toBe(135.4)
      expect(mcsRateMbps('he', 11, TGI_NS.quad)).toBe(121.9)
    } finally {
      PHY_MODES.he.mbps.splice(0, PHY_MODES.he.mbps.length, ...saved)
    }
    expect(mcsRateMbps('he', 11)).toBe(143.4)
  })

  it('pins the six rates this slice prints', () => {
    expect(GI_KEYS.map((k) => mcsRateMbps('he', 11, TGI_NS[k]))).toEqual([143.4, 135.4, 121.9])
    expect(GI_KEYS.map((k) => mcsRateMbps('eht', 13, TGI_NS[k]))).toEqual([172.1, 162.5, 146.3])
  })
})

describe('guard interval · airtime', () => {
  // (f) §0.3 and §7.2's table. The symbol COUNT does not move; only each symbol's length does.
  it('reprices the lesson\'s 1430-byte frame at each of the three GIs', () => {
    const t = GI_KEYS.map((k) => txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs: TGI_NS[k] }))
    expect(t).toEqual([125_600, 130_400, 148_800])
    // Six symbols in all three tiers — the collapse the lesson's own prose turns on.
    GI_KEYS.forEach((k, i) => {
      expect((t[i] - preambleNsFor('he', TGI_NS[k])) / symNsFor('he', TGI_NS[k])).toBe(6)
    })
    // The default argument reproduces today's number exactly.
    expect(txTimeModeNs('he', 1430, 11, { widthMhz: 20 })).toBe(125_600)
  })

  it('reprices the 230-byte frame frame-anatomy-bytes prints', () => {
    expect(GI_KEYS.map((k) => txTimeModeNs('he', 230, 11, { widthMhz: 20, giNs: TGI_NS[k] })))
      .toEqual([57_600, 58_400, 68_800])
    // The fourth row of the design's §2.2 table — 3.2 µs GI without the 4x LTF — is computed
    // here rather than run, because the engine never emits that combination: §1.4 pairs the
    // 3.2 µs GI with the 4x LTF, so `giNs: quad` always carries the 8.8 µs too.
    expect(PHY_MODES.he.preambleNs + symNsFor('he', TGI_NS.quad) * 1).toBe(60_000)
  })

  it('leaves the MU preamble extra alone: HE-SIG-B / EHT-SIG keep their own 0.8 µs GI', () => {
    // §1.1's last paragraph: T_GI,Pre-HE / T_GI,Pre-EHT is fixed at 0.8 µs and has nothing to
    // do with the data field's GI. So the MU extra is neither scaled nor re-paid.
    const su = txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs: TGI_NS.quad })
    const mu = txTimeModeNs('he', 1430, 11, { widthMhz: 20, giNs: TGI_NS.quad, mu: true })
    expect(mu - su).toBe(PHY_MODES.he.muExtraPreambleNs)
  })
})

describe('guard interval · the decode threshold cannot see it', () => {
  // (g) §2.1, §5 item 6 (i). This is NOT "the two agree today": `reqSinrDb(mode, mcs)` has no
  // time parameter in its signature at all, and the four exits of `decodeThreshDb`
  // (src/engine/channel.ts) each read either a constant, `reqSinrDb`, or `sinrThreshDb(mbps)`.
  // So no observation of the form "the long guard interval changed the frame loss" can come
  // from the threshold — every such difference is resampling (§2.2's third group).
  it('gives the same 26 thresholds with symNs at 13 600 and at 16 000', () => {
    const read = (): number[] => [
      ...PHY_MODES.he.ndbps.map((_, i) => reqSinrDb('he', i)),
      ...PHY_MODES.eht.ndbps.map((_, i) => reqSinrDb('eht', i)),
    ]
    const before = read()
    expect(before).toHaveLength(26)
    const saved = { he: PHY_MODES.he.symNs, eht: PHY_MODES.eht.symNs }
    try {
      PHY_MODES.he.symNs = 16_000
      PHY_MODES.eht.symNs = 16_000
      expect(read()).toEqual(before)
    } finally {
      PHY_MODES.he.symNs = saved.he
      PHY_MODES.eht.symNs = saved.eht
    }
    expect(PHY_MODES.he.symNs).toBe(13_600)
    expect(PHY_MODES.eht.symNs).toBe(13_600)
  })
})
