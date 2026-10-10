/**
 * `'uhr'` — the fifth generation, P802.11bn / Wi-Fi 8, and its eighteen-rung ladder.
 *
 * ## What this file is for
 *
 * Four numbers in this repository now come from a DRAFT: the receiver minimum input sensitivity
 * of SFD MCS 17 / 19 / 20 / 23 (TGbn SFD r19, document `11-24/0209r19`, Motion #417). Everything
 * else about `'uhr'` is either derived by an identity this file re-verifies against the fourteen
 * rungs that predate it, or is EHT's own published value reused and welded here so it cannot
 * drift into looking like a Wi-Fi 8 measurement.
 *
 * **The welds are the point.** A draft mode is the easiest place in a simulator to acquire an
 * invented constant, because nobody can check it against a published table. So every figure
 * `PHY_MODES.uhr` carries is pinned here to its source: the identity, the draft column, or
 * `PHY_MODES.eht`.
 *
 * ## And the zero-recalibration claim
 *
 * `'uhr'` is a fifth member and not four rungs appended to `'eht'` precisely so that no existing
 * link changes rate and none of the 271 recorded timeline hashes moves. Two helpers were
 * generalised to make the new mode work (`lowestMode` and `mcsInMode`, both replacing literals
 * in src/engine/mac.ts), and this file proves each one returns exactly what the literal it
 * replaced returned, for every input the literal could ever see. That proof is what makes
 * `tests/fixtures/lesson-hashes.json` a zero-diff file rather than a regenerated one.
 */
import { describe, it, expect } from 'vitest'
import {
  GI_MODES, MANDATORY_MBPS, NONHT_REF_MBPS, PHY_MODES, PHY_MODE_ORDER, RATE_MARGIN_DB, TGI_NS,
  UHR_SFD_MCS, ctrlRespRateFor, ctrlRespRateForMode, lowestMode, mcsForRssi, mcsInMode,
  mcsRateMbps, noiseDbm, preambleNsFor, reqSinrDb, symNsFor, toneRatio, type PhyMode,
} from '../../src/engine/phy'
import { GENERATIONS, GEN_FEATURES, MAX_WIDTH } from '../../src/model/caps'
import { selBinnableGen } from '../../src/engine/selectivity'
import { MODE_OPTIONS } from '../../src/course/widgets/common'
import { LESSONS } from '../../src/course/lessons'
import { teachesDraft } from '../../src/course/curriculum'
import { HOUSEHOLDS } from '../../src/model/households'
import { STATION_PRESETS } from '../../src/model/presets'
import { defaultScenario, guardIntervalRefusals, selectivityRefusals } from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'

/** 234 data tones at 20 MHz, one spatial stream — `TONES_HE[20]`, via `toneRatio`'s own table. */
const TONES = 234

/**
 * (name, bits per tone, code-rate numerator, denominator) per HE/EHT MCS index.
 * standard §27.5 Table 27-86 / standard be §36.5.6 Table 36-76
 */
const EHT_COMB: readonly [string, number, number, number][] = [
  ['BPSK 1/2', 1, 1, 2], ['QPSK 1/2', 2, 1, 2], ['QPSK 3/4', 2, 3, 4],
  ['16QAM 1/2', 4, 1, 2], ['16QAM 3/4', 4, 3, 4],
  ['64QAM 2/3', 6, 2, 3], ['64QAM 3/4', 6, 3, 4], ['64QAM 5/6', 6, 5, 6],
  ['256QAM 3/4', 8, 3, 4], ['256QAM 5/6', 8, 5, 6],
  ['1024QAM 3/4', 10, 3, 4], ['1024QAM 5/6', 10, 5, 6],
  ['4096QAM 3/4', 12, 3, 4], ['4096QAM 5/6', 12, 5, 6],
]

/** The same column for `uhr`'s eighteen interleaved indices, four of them from the draft. */
const UHR_COMB: readonly [string, number, number, number][] = [
  ['BPSK 1/2', 1, 1, 2], ['QPSK 1/2', 2, 1, 2],
  ['QPSK 2/3', 2, 2, 3], // SFD MCS17
  ['QPSK 3/4', 2, 3, 4], ['16QAM 1/2', 4, 1, 2],
  ['16QAM 2/3', 4, 2, 3], // SFD MCS19
  ['16QAM 3/4', 4, 3, 4],
  ['16QAM 5/6', 4, 5, 6], // SFD MCS20
  ['64QAM 2/3', 6, 2, 3], ['64QAM 3/4', 6, 3, 4], ['64QAM 5/6', 6, 5, 6],
  ['256QAM 2/3', 8, 2, 3], // SFD MCS23
  ['256QAM 3/4', 8, 3, 4], ['256QAM 5/6', 8, 5, 6],
  ['1024QAM 3/4', 10, 3, 4], ['1024QAM 5/6', 10, 5, 6],
  ['4096QAM 3/4', 12, 3, 4], ['4096QAM 5/6', 12, 5, 6],
]

/**
 * TGbn SFD r19 · Motion #417's 20 MHz column, **transcribed by MCS number and value only**.
 * The seven rows for MCSs that already existed are the whole reason the four new ones can be
 * trusted: they are the same ruler, and they agree with the engine's own table row for row.
 */
const SFD_417_20MHZ: Readonly<Record<number, number>> = {
  1: -79, 17: -78, 2: -77, 3: -74, 19: -71, 4: -70, 20: -69, 5: -66, 7: -64, 23: -60, 8: -59,
}
/** Which of those rows are MCSs the engine already carried before 11bn. */
const SFD_417_EXISTING = [1, 2, 3, 4, 5, 7, 8]
/** And which are the four Motion #216 makes mandatory to support. */
const SFD_417_NEW = [17, 19, 20, 23]

describe('the N_DBPS identity, re-verified on the fourteen rungs that predate the draft', () => {
  /**
   * This is the claim the four new rungs' N_DBPS rests on, so it is checked where it CAN be
   * checked — against rungs whose N_DBPS came out of a published table — before being used
   * where it cannot.
   */
  it('N_DBPS is 234 tones x bits per tone x code rate, for all fourteen eht rungs', () => {
    const bad: string[] = []
    PHY_MODES.eht.ndbps.forEach((stored, i) => {
      const [name, bits, num, den] = EHT_COMB[i]!
      const calc = (TONES * bits * num) / den
      if (calc !== stored) bad.push(`eht MCS${i} ${name}: stored ${stored}, identity ${calc}`)
    })
    expect(bad).toEqual([])
    expect(PHY_MODES.eht.ndbps).toHaveLength(14)
    expect(EHT_COMB).toHaveLength(14)
  })

  it('the identity is a real catcher: one wrong code rate and it fails', () => {
    // Anti-vacuity. 64-QAM 5/6 (MCS7) read as 3/4 would give 1053, which IS the stored value of
    // MCS6 — so a plausible transcription slip lands on a number that exists in the table.
    expect((TONES * 6 * 3) / 4).toBe(1053)
    expect(PHY_MODES.eht.ndbps[7]).toBe(1170)
    expect((TONES * 6 * 3) / 4).not.toBe(PHY_MODES.eht.ndbps[7])
  })

  it('the tone count is the engine’s own, not a number this file brought with it', () => {
    // `toneRatio` divides by `TONES_HE[20]`, so a 20 MHz ratio of exactly 1 pins the denominator
    // the identity above uses, without `TONES_HE` having to be exported.
    expect(toneRatio('uhr', 20)).toBe(1)
    expect(toneRatio('uhr', 40)).toBe(468 / TONES)
  })

  it('and it holds for all eighteen uhr rungs, so none of the four new ones is rounded', () => {
    const bad: string[] = []
    PHY_MODES.uhr.ndbps.forEach((stored, i) => {
      const [name, bits, num, den] = UHR_COMB[i]!
      const calc = (TONES * bits * num) / den
      if (calc !== stored) bad.push(`uhr idx ${i} ${name}: stored ${stored}, identity ${calc}`)
      if (!Number.isInteger(calc)) bad.push(`uhr idx ${i} ${name}: identity is not an integer`)
    })
    expect(bad).toEqual([])
    expect(PHY_MODES.uhr.ndbps).toHaveLength(18)
  })

  it('the four new rungs are 312 / 624 / 780 / 1248 exactly', () => {
    const by = new Map(UHR_SFD_MCS.map((sfd, i) => [sfd, PHY_MODES.uhr.ndbps[i]!]))
    expect(by.get(17)).toBe(312)
    expect(by.get(19)).toBe(624)
    expect(by.get(20)).toBe(780)
    expect(by.get(23)).toBe(1248)
  })
})

describe('the draft column, and that it is the same ruler the engine already used', () => {
  it('Motion #417’s seven existing rows agree with HE_SENS and EHT_SENS, row for row', () => {
    const bad: string[] = []
    for (const mcs of SFD_417_EXISTING) {
      const sfd = SFD_417_20MHZ[mcs]!
      if (PHY_MODES.he.sensDbm[mcs] !== sfd) bad.push(`he MCS${mcs}: ${PHY_MODES.he.sensDbm[mcs]} vs SFD ${sfd}`)
      if (PHY_MODES.eht.sensDbm[mcs] !== sfd) bad.push(`eht MCS${mcs}: ${PHY_MODES.eht.sensDbm[mcs]} vs SFD ${sfd}`)
    }
    expect(bad).toEqual([])
    expect(SFD_417_EXISTING).toHaveLength(7)
  })

  it('every row of Motion #417, old and new, is the uhr ladder’s own value at that SFD number', () => {
    const bad: string[] = []
    for (const [k, v] of Object.entries(SFD_417_20MHZ)) {
      const idx = UHR_SFD_MCS.indexOf(Number(k))
      if (idx < 0) { bad.push(`SFD MCS${k} is not in the uhr ladder at all`); continue }
      if (PHY_MODES.uhr.sensDbm[idx] !== v) bad.push(`uhr idx ${idx} (SFD MCS${k}): ${PHY_MODES.uhr.sensDbm[idx]} vs SFD ${v}`)
    }
    expect(bad).toEqual([])
    expect(Object.keys(SFD_417_20MHZ)).toHaveLength(11)
  })

  it('the uhr ladder is exactly the eht ladder plus the four mandatory rungs, nothing else', () => {
    // Stated as a set difference so a fifth rung sneaking in is a failure rather than a surprise.
    const added = PHY_MODES.uhr.ndbps.filter((n) => !PHY_MODES.eht.ndbps.includes(n))
    expect(added).toEqual([312, 624, 780, 1248])
    const kept = PHY_MODES.uhr.ndbps.filter((n) => PHY_MODES.eht.ndbps.includes(n))
    expect(kept).toEqual(PHY_MODES.eht.ndbps)
    expect(SFD_417_NEW.map((m) => UHR_SFD_MCS.indexOf(m))).toEqual([2, 5, 7, 11])
  })

  /**
   * **Why the ladder is interleaved rather than appended, as an assertion and not a comment.**
   *
   * `mcsForRssi` returns the HIGHEST INDEX whose required SINR fits, so an array that does not
   * rise with its index makes that loop pick a slower rung at a higher SNR. Both orderings
   * holding at once is what makes the interleave safe — and it is not a given: a ladder can be
   * monotone in sensitivity and not in rate.
   */
  it('rises strictly in sensitivity AND strictly in N_DBPS, every step of all eighteen', () => {
    const s = PHY_MODES.uhr.sensDbm, n = PHY_MODES.uhr.ndbps
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!, `sensitivity at idx ${i}`).toBeGreaterThan(s[i - 1]!)
      expect(n[i]!, `N_DBPS at idx ${i}`).toBeGreaterThan(n[i - 1]!)
    }
  })

  it('so mcsForRssi lands on each rung in turn, and one hundredth of a dB below drops one', () => {
    PHY_MODES.uhr.sensDbm.forEach((sens, mcs) => {
      // `mcsForRssi` measures SNR against the 7 dB noise figure and `reqSinrDb` against the
      // standard's 10 dB, and the 3 dB difference IS `RATE_MARGIN_DB` — so the rung's own
      // sensitivity is the RSSI at which it is selected. Same weld as decode-thresholds.
      expect(mcsForRssi('uhr', sens + 0.01)).toBe(mcs)
      if (mcs > 0) expect(mcsForRssi('uhr', sens - 0.01)).toBe(mcs - 1)
    })
    expect(10 - 7).toBe(RATE_MARGIN_DB)
    expect(reqSinrDb('uhr', 0)).toBeCloseTo(PHY_MODES.uhr.sensDbm[0]! + 90.99, 2)
    expect(noiseDbm(20, 10)).toBeCloseTo(-90.99, 2)
  })

  it('each new rung’s window, and what runs there without it', () => {
    // The whole claim of the slice, in four rows: the SNR band each new rung owns, and the rung
    // the same band runs today. Widths 1 / 1 / 3 / 1 dB and ratios 1.333 / 1.333 / 1.111 / 1.067.
    const rows = SFD_417_NEW.map((sfd) => {
      const i = UHR_SFD_MCS.indexOf(sfd)
      const lo = reqSinrDb('uhr', i)
      const hi = reqSinrDb('uhr', i + 1)
      // what eht runs at the bottom of that window
      let e = 0
      PHY_MODES.eht.sensDbm.forEach((_s, j) => { if (lo >= reqSinrDb('eht', j)) e = j })
      return {
        sfd, width: Math.round((hi - lo) * 100) / 100,
        ratio: Math.round((PHY_MODES.uhr.ndbps[i]! / PHY_MODES.eht.ndbps[e]!) * 1000) / 1000,
        displaced: e,
      }
    })
    expect(rows).toEqual([
      { sfd: 17, width: 1, ratio: 1.333, displaced: 1 },
      { sfd: 19, width: 1, ratio: 1.333, displaced: 3 },
      { sfd: 20, width: 3, ratio: 1.111, displaced: 4 },
      { sfd: 23, width: 1, ratio: 1.067, displaced: 7 },
    ])
  })
})

describe('what uhr does NOT claim from the draft', () => {
  /**
   * SFD r19 publishes no UHR preamble field lengths, no UHR T_DFT and no UHR guard-interval
   * enumeration. So these three figures are EHT's, reused — and welded, so that nobody can later
   * nudge them to a "Wi-Fi 8" value without this failing and asking for a table number.
   */
  it('its preamble, MU extra and symbol duration are eht’s own values, by weld', () => {
    expect(PHY_MODES.uhr.preambleNs).toBe(PHY_MODES.eht.preambleNs)
    expect(PHY_MODES.uhr.muExtraPreambleNs).toBe(PHY_MODES.eht.muExtraPreambleNs)
    expect(PHY_MODES.uhr.symNs).toBe(PHY_MODES.eht.symNs)
  })

  it('which is exactly what makes an eht/uhr A/B a measurement of the ladder and nothing else', () => {
    // Same airtime per symbol and same preamble at every GI tier, for every rung both ladders
    // share — so a throughput difference between the two modes can only come from N_DBPS.
    for (const gi of [TGI_NS.base, TGI_NS.double, TGI_NS.quad]) {
      expect(preambleNsFor('uhr', gi)).toBe(PHY_MODES.eht.preambleNs)
      expect(symNsFor('uhr', gi)).toBe(PHY_MODES.eht.symNs)
    }
  })

  it('is deliberately not a GI_MODES member, and the refusal says that reason and not another', () => {
    expect(GI_MODES).toEqual(['he', 'eht'])
    expect(GI_MODES).not.toContain('uhr')
    const base = defaultScenario()
    const uhrOnly = {
      nodes: base.nodes.slice(0, 2).map((n) => ({ ...n, linkId: undefined, caps: { generation: 'uhr' as const, features: {} } })),
    }
    const why = guardIntervalRefusals(uhrOnly)
    expect(why).toHaveLength(1)
    expect(why[0], 'a refusal whose reason is "you are too old" would be a lie about Wi-Fi 8').toContain('uhr')
    expect(why[0]).toContain('SFD r19')
    expect(why[0]).toContain('发明')
  })

  it('and it IS a selBinnableGen member, so the two lists genuinely differ now', () => {
    // `GI_MODES`'s comment in phy.ts has said since the guard-interval slice that either
    // question could move without the other. This is the slice where it did.
    expect(selBinnableGen('uhr')).toBe(true)
    expect(GI_MODES.includes('uhr' as PhyMode)).toBe(false)
    const uhrLink = defaultScenario().nodes.slice(0, 2)
      .map((n) => ({ ...n, linkId: undefined, caps: { generation: 'uhr' as const, features: {} } }))
    expect(selectivityRefusals({ fading: { smallScale: 'rayleigh' }, nodes: uhrLink } as never)).toEqual([])
    expect(guardIntervalRefusals({ nodes: uhrLink })).toHaveLength(1)
  })

  it('the non-HT reference rate it was given cannot be read, whichever end of its bracket it takes', () => {
    /**
     * The one derived column. SFD r19 gives no non-HT reference rate for the four new MCSs, so
     * `UHR_NONHT_REF_MBPS` applies the rule `NONHT_REF_MBPS`'s own doc states. The reason that
     * is allowed to be a derivation is that the choice is UNOBSERVABLE: the only consumer floors
     * it onto `MANDATORY_MBPS`, and every candidate inside each rung's constellation bracket
     * floors to the same answer. Checked here by walking the whole bracket, not by asserting the
     * one value that was picked.
     */
    expect(MANDATORY_MBPS).toEqual([6, 12, 24])
    const BRACKETS: { sfd: number; candidates: number[] }[] = [
      // clause-17 rates bounding each new rung's constellation and code rate
      { sfd: 17, candidates: [12, 18] }, // QPSK: 1/2 -> 12, 3/4 -> 18
      { sfd: 19, candidates: [24, 36] }, // 16-QAM: 1/2 -> 24, 3/4 -> 36
      { sfd: 20, candidates: [36, 48] }, // 16-QAM 3/4 -> 36, next constellation up -> 48
      { sfd: 23, candidates: [54] }, // denser than clause 17 goes; the existing table says 54
    ]
    for (const b of BRACKETS) {
      const idx = UHR_SFD_MCS.indexOf(b.sfd)
      const answers = new Set(b.candidates.map((c) => ctrlRespRateFor(c)))
      expect(answers.size, `SFD MCS${b.sfd}: the bracket does not collapse to one answer`).toBe(1)
      expect(ctrlRespRateForMode('uhr', idx, mcsRateMbps('uhr', idx))).toBe([...answers][0])
    }
    // Anti-vacuity: the function can give different answers, so the collapse above is a fact
    // about these brackets and not about the function being constant.
    expect(new Set([6, 12, 24, 54].map(ctrlRespRateFor)).size).toBe(3)
  })

  it('and the fourteen-entry shared column is untouched, so no other mode moved', () => {
    expect(NONHT_REF_MBPS).toHaveLength(14)
    expect(NONHT_REF_MBPS).toEqual([6, 12, 18, 24, 36, 48, 54, 54, 54, 54, 54, 54, 54, 54])
    for (const m of ['vht', 'he', 'eht'] as const) expect(PHY_MODES[m].nonhtRefMbps).toBe(NONHT_REF_MBPS)
  })
})

describe('zero recalibration: the two generalised helpers return what the literals returned', () => {
  /**
   * `buildMuParts` and the Trigger path in src/engine/mac.ts used to read
   * `every(m => m === 'eht') ? 'eht' : 'he'` and `Math.min(11, mcs)`. Both are now stated on the
   * thing that actually constrains them. Every recorded lesson hash depends on these two being
   * the same function over the inputs that existed — so that is asserted, exhaustively, rather
   * than inferred from the hash fixture staying green.
   */
  it('lowestMode equals the old eht/he expression for every member set of those two modes', () => {
    const sets: PhyMode[][] = []
    for (const a of ['he', 'eht'] as PhyMode[]) {
      sets.push([a])
      for (const b of ['he', 'eht'] as PhyMode[]) {
        sets.push([a, b])
        for (const c of ['he', 'eht'] as PhyMode[]) sets.push([a, b, c])
      }
    }
    expect(sets.length).toBe(14)
    for (const s of sets) {
      const old: PhyMode = s.every((m) => m === 'eht') ? 'eht' : 'he'
      expect(lowestMode(s), s.join('+')).toBe(old)
    }
  })

  it('mcsInMode(eht -> he) equals Math.min(11, mcs) for every eht rung there is', () => {
    PHY_MODES.eht.ndbps.forEach((_n, mcs) => {
      expect(mcsInMode('eht', mcs, 'he'), `eht MCS${mcs}`).toBe(Math.min(11, mcs))
    })
    // and the identity case, which is the other branch the old code took
    PHY_MODES.eht.ndbps.forEach((_n, mcs) => expect(mcsInMode('eht', mcs, 'eht')).toBe(mcs))
    PHY_MODES.he.ndbps.forEach((_n, mcs) => expect(mcsInMode('he', mcs, 'he')).toBe(mcs))
  })

  it('a clamp would have been wrong for uhr, which is why it is a translation', () => {
    // uhr index 11 is 256-QAM 2/3, needing −60 dBm. eht index 11 is 1024-QAM 5/6, needing −52.
    // `Math.min(11, 11)` would have handed that member eight dB more than its link supports.
    expect(PHY_MODES.uhr.sensDbm[11]).toBe(-60)
    expect(PHY_MODES.eht.sensDbm[11]).toBe(-52)
    expect(mcsInMode('uhr', 11, 'eht')).toBe(7)
    expect(PHY_MODES.eht.sensDbm[7]).toBe(-64)
    expect(Math.min(11, 11)).not.toBe(mcsInMode('uhr', 11, 'eht'))
    // the translation never asks more of the link than the member's own rung did
    for (const to of PHY_MODE_ORDER) {
      PHY_MODES.uhr.sensDbm.forEach((_s, mcs) => {
        const i = mcsInMode('uhr', mcs, to)
        if (i > 0) expect(PHY_MODES[to].sensDbm[i]!, `uhr ${mcs} -> ${to} ${i}`).toBeLessThanOrEqual(PHY_MODES.uhr.sensDbm[mcs]!)
      })
    }
  })

  it('the 4096-QAM ceiling is an index per mode, and eht’s is still the literal 11 minus nothing', () => {
    expect(PHY_MODES.eht.qam4kFromMcs).toBe(12)
    expect(PHY_MODES.uhr.qam4kFromMcs).toBe(16)
    for (const m of ['nonht', 'vht', 'he'] as const) expect(PHY_MODES[m].qam4kFromMcs).toBeUndefined()
    // the old literal, recovered from the new field
    expect(PHY_MODES.eht.qam4kFromMcs! - 1).toBe(11)
    // and it really is where 4096-QAM starts in each ladder
    expect(UHR_COMB[PHY_MODES.uhr.qam4kFromMcs!]![1]).toBe(12)
    expect(UHR_COMB[PHY_MODES.uhr.qam4kFromMcs! - 1]![1]).toBe(10)
    expect(EHT_COMB[PHY_MODES.eht.qam4kFromMcs!]![1]).toBe(12)
    expect(EHT_COMB[PHY_MODES.eht.qam4kFromMcs! - 1]![1]).toBe(10)
  })
})

describe('uhr exists in the engine, and reaches a reader only through M13', () => {
  /**
   * **This `it` used to read 「no shipped scenario, variant, household or preset declares
   * `'uhr'`」, and that was the other half of W12a's zero-diff guarantee.** Slice W12b retired the
   * first clause on purpose: `@uhr-rate-ladder` is the lesson the engine half was built for, and
   * `uhr` would be a legal-and-inert generation forever if nothing shipped declared it.
   *
   * What the scan asserts now is the narrower and more useful fact — `'uhr'` reaches a reader
   * through ONE lesson and through nothing else. The household list, `defaultScenario()` and the
   * station presets are each still clean, which is what keeps the editor's own starting points
   * from quietly handing somebody a draft radio; and no other lesson declares it, which is what
   * keeps the amber draft line and 「草案，内容可能变动」 in front of every reader who meets it.
   * `docs/inert-config-contract.md` step 1 asks for this scan either way.
   *
   * **Slice W13 widened the first clause from one lesson to two, and narrowed it at the same
   * time.** `@claim-to-contribution` rides `uhrLadderScenario` to grade the other lesson's
   * number, so it necessarily puts a uhr radio on the air; a list of two ids would rot on the
   * next lesson added under M13 the way 「the last Wi-Fi lesson is `@uhr-rate-ladder`」 rotted in
   * `tests/course/link-2g.test.ts` one slice after it was written. So what is asserted is the
   * PROPERTY the id list was standing in for: every lesson that declares `'uhr'` sits under the
   * module that declares the draft. A lesson anywhere else still fails, which is the whole point,
   * and the module itself is still pinned to M13 by name.
   */
  it('only lessons under the draft module declare it, and no household, default scene or device preset does', () => {
    const byLesson: string[] = []
    for (const l of LESSONS) {
      const gens = [
        ...l.scenario().nodes.map((n) => n.caps.generation),
        ...(l.variants ?? []).flatMap((v) => v.scenario().nodes.map((n) => n.caps.generation)),
      ]
      if (gens.includes('uhr')) byLesson.push(l.id)
    }
    expect(byLesson, 'lessons whose scene or variants put a uhr radio on the air')
      .toEqual(['uhr-rate-ladder', 'claim-to-contribution'])
    // and the property that list stands for, which does not rot when M13 gains a third lesson:
    // every one of them is under a module checked against the draft, so the amber basis line and
    // 「草案，内容可能变动」 are in front of every reader who meets a uhr radio.
    const modules = byLesson.map((id) => LESSONS.find((l) => l.id === id)!.module)
    expect([...new Set(modules)], 'the modules that declare uhr').toEqual([13])
    for (const mi of modules) expect(teachesDraft(mi), `module ${mi}`).toBe(true)

    const elsewhere: Generation[] = []
    for (const h of HOUSEHOLDS) elsewhere.push(...h.scenario().nodes.map((n) => n.caps.generation))
    elsewhere.push(...defaultScenario().nodes.map((n) => n.caps.generation))
    elsewhere.push(...STATION_PRESETS.map((p) => p.generation))
    expect(elsewhere.filter((g) => g === 'uhr'),
      'a household, the default scene or a device preset would hand a reader a draft radio with'
      + ' no lesson and no amber line around it').toEqual([])
    // non-vacuous: the scan really did look at dozens of nodes and really does see generations
    // (58 on 2026-10-10 — the households, the default scene's two nodes and the station presets)
    expect(elsewhere.length).toBeGreaterThan(40)
    expect(new Set(elsewhere).size).toBeGreaterThan(1)
    // non-vacuous the other way: the draft check above is only worth anything if a module that
    // does NOT teach a draft exists to fail it, so name one.
    expect(teachesDraft(LESSONS.find((l) => l.id === 'link-2g')!.module)).toBe(false)
  })

  it('MODE_OPTIONS still does not offer it, and W12b decided that rather than deferring it', () => {
    // W12a deferred this to W12b 「together with the lesson」. **W12b looked and declined.** The two
    // widgets that read `MODE_OPTIONS` (`McsLadder`, `LinkBudget`) are embedded in `@mcs-ladder`
    // and `@link-2g`, which are tier-1 and tier-2 lessons checked against the published revision:
    // a UHR button there puts a draft ladder in front of a reader with no amber basis line and no
    // 「草案，内容可能变动」 anywhere on the page. `@uhr-rate-ladder` does not need the button either
    // — what it has to show is the two ladders SIDE BY SIDE, which this widget cannot do at all
    // (it renders one mode), so it embeds the widget on `'eht'` and prints the comparison as its
    // own table. `mcsLadder('uhr')` answers correctly regardless — tests/course/widgetModel.test.ts
    // walks `PHY_MODE_ORDER`, not this list — so nothing here is unreachable code.
    expect(MODE_OPTIONS).toEqual(['nonht', 'vht', 'he', 'eht'])
    expect(MODE_OPTIONS).not.toContain('uhr')
    expect(PHY_MODE_ORDER.filter((m) => !MODE_OPTIONS.includes(m))).toEqual(['uhr'])
    // and the lesson really does ask the widget for the OLD ladder, which is what makes the
    // paragraph above a description of this course rather than an intention about it
    const w = LESSONS.find((l) => l.id === 'uhr-rate-ladder')!.numbers!
      .filter((b) => b.kind === 'widget')
    expect(w.length).toBe(1)
    expect(w[0]!.kind === 'widget' && w[0].params?.mode).toBe('eht')
  })

  it('it is a full member everywhere the compiler could not have asked', () => {
    expect(GENERATIONS).toContain('uhr')
    expect(PHY_MODE_ORDER).toContain('uhr')
    expect(MAX_WIDTH.uhr).toBe(320)
    expect(GEN_FEATURES.uhr).toEqual(GEN_FEATURES.eht)
  })
})
