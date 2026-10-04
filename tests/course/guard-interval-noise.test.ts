/**
 * The noise gate for the guard-interval slice (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §5 item 6, §8 items 4 and 9, §9
 * item 1).
 *
 * ---------------------------------------------------------------------------------------------
 * **WHY THERE IS NO FOURTH ASSERTION HERE, AND WHY THAT IS THE POINT**
 *
 * In this engine the frame-loss difference between two guard-interval tiers is **identically
 * resampling noise**. The chain is short enough to state: a longer symbol moves every instant on
 * the timeline, which moves `txSeq` and the instants, which moves the fading draw's hash key, so
 * the very same link draws a different set of numbers. Nothing in the decode path can respond to
 * the guard interval at all — `reqSinrDb(mode, mcs)` has no time parameter in its signature, and
 * the four exits of `decodeThreshDb` (src/engine/channel.ts) each read a constant, `reqSinrDb`,
 * or `sinrThreshDb(mbps)`. Assertion (i) below is that fact, measured.
 *
 * And the noise appears in BOTH directions, which is what makes it dangerous rather than merely
 * absent. Measured with the design's instrument B, four tiers each (0.8 → 1.6 → 3.2 → 3.2 with
 * the 4x LTF):
 *
 *   - `capstone`:      frame loss 5.44 → 4.91 → 4.68 → 4.57 %   (reads as bought reliability)
 *   - `ru-diversity`:  frame loss 14.29 → 15.15 → 17.86 → 17.86 % (reads as lost reliability)
 *   - `rate` / `rate-cost`: delivered bytes 0 → −10.62 → −27.05 → −13.23 % (NOT monotone — the
 *     fourth tier comes out better than the third)
 *
 * Three rows, two directions, one non-monotone sequence, and the demodulation threshold did not
 * move by a single decibel. **So this slice's worst failure mode is not an idle knob — it is one
 * noise assertion written in the voice of physics.** A sentence like "the long guard interval
 * lifted the delivery rate" would read as a result, survive review, and be false.
 *
 * Those figures are quoted HERE, in a comment, and nowhere in `src/`. Guard (iii) sweeps `src/`
 * and `tests/` is deliberately outside its scope, which is what makes this paragraph safe. The
 * moment anyone moves one of them into an `expect(...).toContain('…')` the guard stops meaning
 * anything, so: they stay prose.
 * ---------------------------------------------------------------------------------------------
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Simulation } from '../../src/engine/simulation'
import { PHY_MODES, reqSinrDb } from '../../src/engine/phy'
import { airtime } from '../../src/course/tier1/airtime'
import type { GuardIntervalCfg, Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 150 * MS

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], t: K): Extract<TLRecord, { type: K }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === t)

/**
 * A boundary-anchored matcher for a decimal figure.
 *
 * **A naive substring test would be red on the day it landed, and the fix is not an exception
 * list — it is anchoring the number.** Measured: plain `includes` already finds two hits in
 * today's `src/`, and neither has anything to do with the guard interval —
 * `src/course/uwb/uwb-position.ts`'s `5.4439 m` (a UWB distance) contains `5.44`, and
 * `src/ui/Guide.tsx`'s `// 4.578` (an SP3 multiple) contains `4.57`. The lookahead rejects both,
 * because in each case a digit follows.
 */
const anchored = (n: string): RegExp =>
  new RegExp(`(?<![0-9.])${n.replace('.', '\\.')}(?![0-9])`)

/** Every `.ts` / `.tsx` under a directory, recursively. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

const SRC = path.resolve(__dirname, '../../src')

describe('guard-interval noise gate · (i) the decode threshold has no time in its signature', () => {
  /**
   * A second copy of the assertion that already sits in tests/engine/guard-interval.test.ts, and
   * the duplication is deliberate rather than an oversight. **This file is the testimony for why
   * no fourth assertion may be written, and testimony carries its own premise.** Two readers
   * each get to see it once, in the place they are already looking.
   */
  it('gives the same 26 thresholds whether a symbol is 13 600 or 16 000 ns', () => {
    const read = (): number[] => [
      ...PHY_MODES.he.ndbps.map((_v, i) => reqSinrDb('he', i)),
      ...PHY_MODES.eht.ndbps.map((_v, i) => reqSinrDb('eht', i)),
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
  })
})

describe('guard-interval noise gate · (ii) the lesson scene loses nothing at any tier', () => {
  // The other half of the design's §5 item 4, on the same instrument as
  // tests/engine/guard-interval-round.test.ts: `airtime`'s own scenario, `runUntil(150 ms)`,
  // default seed. If this scene ever started dropping frames, a figure quoted in the lesson
  // would become a sample of something rather than a property of it.
  it('reports zero RX_FAIL and zero DROP at all three tiers', () => {
    const tiers: (GuardIntervalCfg | undefined)[] = [undefined, { gi: 'double' }, { gi: 'quad' }]
    const counted = tiers.map((gi) => {
      const s: Scenario = gi ? { ...airtime.scenario(), guardInterval: gi } as Scenario : airtime.scenario()
      const rs = [...new Simulation(s).runUntil(RUN_NS).records]
      return { rxFail: ofType(rs, 'RX_FAIL').length, drop: ofType(rs, 'DROP').length }
    })
    expect(counted.map((c) => c.rxFail)).toEqual([0, 0, 0])
    expect(counted.map((c) => c.drop)).toEqual([0, 0, 0])
  })
})

describe('guard-interval noise gate · (iii) no frame-loss figure reaches src/', () => {
  /**
   * **The hard condition of the whole slice** (§8 item 4). Read as source TEXT across every
   * `.ts`/`.tsx` under `src/`, comments included, the way tests/course/selectivity.test.ts reads
   * two lesson files — except that the scope here is all of `src/` rather than two files, because
   * the figure that must never ship could be quoted from a header comment, a `Guide.tsx`
   * paragraph or an editor hint just as easily as from a lesson's prose.
   *
   * These five are the per-tier frame-loss and delivered-byte differences of §2.2's third group.
   * Each is one sample of a resampled run. Printing one would turn a draw into a property, and
   * this slice's entire conclusion would flip with it.
   */
  const FRAME_LOSS_FIGURES = ['5.44', '4.57', '14.29', '17.86', '27.05'] as const

  it('finds zero hits for any of the five, across every source file', () => {
    const files = sourceFiles(SRC)
    expect(files.length, 'the sweep found no files, which would pass over nothing').toBeGreaterThan(100)
    const hits: string[] = []
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8')
      const lines = text.split('\n')
      for (const n of FRAME_LOSS_FIGURES) {
        const re = anchored(n)
        lines.forEach((l, i) => {
          if (re.test(l)) hits.push(`${path.relative(SRC, f).replace(/\\/g, '/')}:${i + 1} quotes ${n}`)
        })
      }
    }
    expect(hits, `a resampled frame-loss figure reached src/: ${hits.join('; ')}`).toEqual([])
  })

  it('the anchoring is what makes that zero true, and it is not a stricter test than needed', () => {
    // Both halves, so a future reader cannot mistake the anchoring for pedantry. The naive
    // version is red today; the anchored version lets exactly those two through.
    const naive = sourceFiles(SRC).filter((f) => {
      const t = fs.readFileSync(f, 'utf8')
      return t.includes('5.44') || t.includes('4.57')
    })
    expect(naive.length, 'the two known coincidences are gone; this test needs rewriting').toBe(2)
    expect(anchored('5.44').test('4.7368, 6.3831, 5.4439, 6.8922 m')).toBe(false)
    expect(anchored('4.57').test('(SP3_REPORT_NS / SP3_SAVING_SHORTEST_NS).toFixed(3) // 4.578')).toBe(false)
    // And it still catches the thing it is for, in every shape a lesson would write it.
    expect(anchored('5.44').test('掉帧率从 5.44 % 降到 4.57 %')).toBe(true)
    expect(anchored('4.57').test('掉帧率从 5.44 % 降到 4.57 %')).toBe(true)
    expect(anchored('17.86').test('17.86%')).toBe(true)
    expect(anchored('27.05').test('−27.05 %')).toBe(true)
  })
})

describe('guard-interval noise gate · (iv) no pooled figure reaches these two lessons', () => {
  /**
   * The design's §2.2 first group: pooled over **36 scenes and 9463 PPDUs**, plus the per-PPDU
   * min/median/max of that same pool. They are this design document's figures. Each of the two
   * lessons below has **one** scene, so quoting a pooled figure there would attribute a property
   * of a corpus to a single run.
   *
   * **The scope is these two files and it cannot be all of `src/` — by FILE and never by
   * NUMBER — and there are four reasons, each of them fatal on its own.** Three were known when
   * this guard was specified; the fourth turned up when it was measured.
   *
   *  1. **`5.14` is a figure `width.ts` is supposed to print.** §7.3 has `width` gain a `limit`
   *     saying delivered bytes fall **−5.14 %** once the 4x LTF is counted — instrument B on
   *     `width`'s own scene. The pooled **+5.14 %** is instrument A over 36 lessons. Different
   *     instrument, different sign, different meaning, same digits. Both are legitimate, so no
   *     guard keyed on the number could tell them apart; what tells them apart is that
   *     `width`'s limit states its own instrument beside the figure.
   *  2. **`4.70` already lives in `src/course/tier2/ru-diversity.ts`** — the selectivity slice's
   *     p90 of **4.70 dB**, a level, beside the double tier's median cost of **4.70 %**, a
   *     duration ratio. Coincidence.
   *  3. **`1.22` already lives in `src/course/uwb/uwb-slot-budget.ts`, three times**, and has
   *     nothing to do with Wi-Fi at all.
   *  4. **`17.07` already lives in `src/course/tier2/fading.ts`, twice — as `17.07 Mb/s`**, a
   *     throughput in that lesson's Rician table, beside the quadruple tier's per-PPDU minimum
   *     of **+17.07 %**. This one is not in the design's list of reasons; it was found by
   *     running the sweep over all of `src/` before narrowing it.
   *
   * So: widen this scope and it goes red on four innocent sites, and the tempting repair — an
   * exception list — is how the guard would die.
   *
   * **`19.44` is deliberately NOT on this list.** It is §0.3's own frame: 230 octets at HE
   * MCS 11, `txTimeModeNs` and nothing else. Single-frame arithmetic is not a pooled statistic,
   * so `frame-anatomy-bytes` quoting it (computed from `txTimeModeNs`, per §4's `echoFacts`
   * rule) is correct rather than a violation.
   */
  const POOLED_FIGURES = [
    '5.14', '15.41', '17.78', // the three pooled totals
    '1.22', '5.82', '3.66', '17.47', '4.70', '14.09', '17.07', // the per-PPDU spread
  ] as const

  const SCOPE = ['tier1/airtime.ts', 'tier1/frame-anatomy-bytes.ts']

  it('finds zero hits for any of the ten, in airtime or frame-anatomy-bytes', () => {
    const hits: string[] = []
    for (const rel of SCOPE) {
      const f = path.join(SRC, 'course', rel)
      expect(fs.existsSync(f), `${rel} moved; this guard is now sweeping nothing`).toBe(true)
      const lines = fs.readFileSync(f, 'utf8').split('\n')
      for (const n of POOLED_FIGURES) {
        const re = anchored(n)
        lines.forEach((l, i) => {
          if (re.test(l)) hits.push(`${rel}:${i + 1} quotes ${n}`)
        })
      }
    }
    expect(hits, `a pooled 36-lesson figure reached a one-scene lesson: ${hits.join('; ')}`).toEqual([])
  })

  it('and the four innocent sites are still there, so widening the scope would be a mistake', () => {
    // Pinned so that the reasoning above cannot quietly stop being true. If one of these moves,
    // the comment needs editing — not the scope.
    const at = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8')
    expect(anchored('4.70').test(at('course/tier2/ru-diversity.ts'))).toBe(true)
    expect(anchored('1.22').test(at('course/uwb/uwb-slot-budget.ts'))).toBe(true)
    expect(anchored('17.07').test(at('course/tier2/fading.ts'))).toBe(true)
    // `5.14` is reason 1: `width.ts` is entitled to it once Task 8 lands, and it must never be
    // judged by the number. The assertion is about the SCOPE, not about whether it is there yet.
    expect(SCOPE.some((r) => r.includes('width'))).toBe(false)
  })
})
