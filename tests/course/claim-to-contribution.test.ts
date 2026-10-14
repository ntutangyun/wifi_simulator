/**
 * `@claim-to-contribution` — every figure the lesson prints, measured against the scenes it ships.
 *
 * **The lesson's subject is another lesson's number, so this file's subject is the instrument.**
 * Three things are checked that no other lesson test has had to check:
 *
 *  1. **The four seed batches, as four different answers.** The 「same cell」 table prints twelve
 *     means and twelve agreeing-seed counts. They are read back out of the lesson's own cells and
 *     compared against runs, which is the only way a figure cannot be corrected in one place
 *     only. The four batches overlap heavily, so every (arm, spot, fade, seed) run is memoised
 *     once and reused across batches — 162 distinct seeds per row rather than 260.
 *  2. **The inert pair, from both sides.** `#5` and `#6` differ only in `coherenceMs` (5 ms
 *     against 500 ms) at sigma 0, and the assertion is not 「they are close」 but that their whole
 *     record streams are equal and that `tests/fixtures/lesson-hashes.json` carries ONE hash for
 *     the two of them. **And the anti-vacuity half, which is the lesson's own second step:** at
 *     sigma 4 the same field moves the answer from 13.960 to 28.000 Mb/s, so what is pinned is
 *    「unreachable HERE」 and not 「useless」.
 *  3. **That the three classes really are three.** Class 1 (the fixed-position ratio) is asserted
 *     exactly and over five seeds and two run lengths; class 2 (the 3 dB window) is asserted to
 *     keep its sign in all four batches; class 3 (the 1 dB window) is asserted to CHANGE sign
 *     between n = 20 and n = 60, because that is the fact the lesson is for. A test that only
 *     bounded the magnitudes would pass while the lesson's spine quietly stopped being true.
 *
 * Run cost: about a thousand 300 ms simulations, which is why the memo is keyed and shared.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { claimToContribution as L } from '../../src/course/tier4/claim-to-contribution'
import { uhrRateLadder } from '../../src/course/tier4/uhr-rate-ladder'
import { CONTRIBUTIONS, MODULES, TIERS, basisOf, citedDocs, lessonMinutes, teachesDraft, trackOf } from '../../src/course/curriculum'
import { LESSONS, lessonIndex } from '../../src/course/lessons'
import { uhrLadderScenario } from '../../src/course/wifiScenes'
import { Simulation } from '../../src/engine/simulation'
import { NOISE_DBM, PHY_MODES, RATE_MARGIN_DB, noiseDbm } from '../../src/engine/phy'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'

const MS = 1_000_000
/** 300 ms for everything the faded tables print; 600 ms only where the prose names it. */
const RUN_NS = 300 * MS
const LONG_NS = 600 * MS

type Gen = 'eht' | 'uhr'
type Spot = 'near' | 'mid' | 'far'

const runs = new Map<string, TLRecord[]>()
function run(sc: Scenario, ns: number, key: string): TLRecord[] {
  const k = `${key}|${ns}`
  if (!runs.has(k)) runs.set(k, [...new Simulation(sc).runUntil(ns).records])
  return runs.get(k)!
}
const arm = (gen: Gen, spot: Spot, fade: 'off' | 'shadow' | 'both', seed: number, ns = RUN_NS): TLRecord[] =>
  run(uhrLadderScenario(gen, spot, fade, { seed }), ns, `${gen}/${spot}/${fade}/${seed}`)

/** Goodput in Mb/s: each MSDU counted once, on the first PPDU that carried it successfully. */
function goodputMbps(rs: TLRecord[], ns: number): number {
  const seen = new Set<number>()
  let bytes = 0
  for (const r of rs) {
    if (r.type !== 'RX_OK' || r.frame.kind !== 'data') continue
    const ids = r.frame.ampdu?.msduIds ?? (r.frame.msduId === undefined ? [] : [r.frame.msduId])
    const sizes = r.frame.msduBytes ?? []
    ids.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); bytes += sizes[i] ?? 0 } })
  }
  return (bytes * 8) / (ns / 1e9) / 1e6
}
const failures = (rs: TLRecord[]): number => rs.filter((r) => r.type === 'RX_FAIL').length
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length

/** 1 followed by the first n − 1 primes: the seed tables the lesson names. */
function primeSeeds(n: number): number[] {
  const out = [1]
  for (let c = 2; out.length < n; c++) {
    let p = true
    for (let d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break }
    if (p) out.push(c)
  }
  return out
}
const BATCHES: readonly (readonly [string, number[]])[] = [
  ['二十个', primeSeeds(20)],
  ['六十个质数', primeSeeds(60)],
  ['一到六十', Array.from({ length: 60 }, (_, i) => i + 1)],
  ['一百二十个', primeSeeds(120)],
]
/** [mean ratio − 1 in per cent, how many seeds of the batch favour uhr, eht fails, uhr fails]. */
function batch(spot: Spot, fade: 'shadow' | 'both', seeds: number[]): [number, number, number, number] {
  const e: number[] = []; const u: number[] = []
  let fe = 0; let fu = 0
  for (const s of seeds) {
    const re = arm('eht', spot, fade, s); const ru = arm('uhr', spot, fade, s)
    e.push(goodputMbps(re, RUN_NS)); u.push(goodputMbps(ru, RUN_NS))
    fe += failures(re); fu += failures(ru)
  }
  const win = e.filter((x, i) => (u[i]! - x) / x > 0.0005).length
  return [(mean(u) / mean(e) - 1) * 100, win, fe, fu]
}

const tableOf = (heading: string): { head: string[]; rows: string[][] } => {
  const b = L.numbers!.find((x) => x.kind === 'table' && x.heading?.includes(heading))
  if (b === undefined || b.kind !== 'table') throw new Error(`no table heading contains 「${heading}」`)
  return b
}
/** `−0.04 %（8/20）` → [-0.04, 8, 20]; `17.120000 Mb/s` → [17.12]. */
const nums = (cell: string): number[] =>
  (cell.replace(/[−–]/g, '-').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

const FIXTURE = resolve(__dirname, '../fixtures/lesson-hashes.json')

lessonShapeSuite(L, { runNs: RUN_NS })

describe('claim-to-contribution · where it sits in the course', () => {
  it('is the SECOND lesson of the existing M13, which is what makes its index cost zero', () => {
    expect(L.module).toBe(13)
    expect(MODULES[13].title).toBe('草案里的 Wi-Fi 8')
    expect(MODULES[13].tier).toBe(3)
    // One module for the whole tier is the decision §6.0 of the tier-4 design made, and THIS is
    // what it bought: a second lesson joining an existing module moves no `module` index at all,
    // against the 58 edits across 38 files W12b paid to insert M13 above the UWB track.
    expect(MODULES.filter((m) => m.tier === 3)).toHaveLength(1)
    expect(LESSONS.filter((l) => l.module === 13).map((l) => l.id))
      .toEqual(['uhr-rate-ladder', 'claim-to-contribution'])
    expect(trackOf(L)).toBe('wifi')
    expect(TIERS[3].label).toBe('第四阶段 · 研究')
    expect(basisOf(13)).toEqual(['ieee-802-11', 'p802-11bn'])
    expect(teachesDraft(13)).toBe(true)
    expect(lessonMinutes(L)).toBe(25)
  })

  it('cannot be read before the lesson whose number it grades', () => {
    expect(L.needs).toEqual(['uhr-rate-ladder', 'fading', 'rate-fallback', 'bianchi-vs-sim'])
    const mine = lessonIndex('claim-to-contribution')
    for (const id of L.needs!) expect(lessonIndex(id), `@${id} must come first`).toBeLessThan(mine)
    // the structural constraint the spec put on this lesson, as an assertion
    expect(lessonIndex('uhr-rate-ladder')).toBe(mine - 1)
  })

  it('cites seven registered contributions, and every one of them is a TGbn document', () => {
    expect(citedDocs(L)).toEqual([
      '11-24/0209r19', '11-24/0469r0', '11-24/0753r1', '11-24/1186r1',
      '11-25/0721r3', '11-25/1772r16', '11-26/1613r0',
    ])
    for (const d of citedDocs(L)) expect(CONTRIBUTIONS[d], `${d} unregistered`).toBeTruthy()
    // The six this slice registered are cited HERE and nowhere else, which is the half of the
    // registry rule that an unused entry would fail: registration and citation in one commit.
    const elsewhere = LESSONS.filter((l) => l.id !== L.id).flatMap(citedDocs)
    for (const d of citedDocs(L).filter((x) => x !== '11-24/0209r19')) {
      expect(elsewhere, `${d} is cited by another lesson too`).not.toContain(d)
    }
  })
})

describe('claim-to-contribution · the scene it rides', () => {
  it('is uhrLadderScenario at the far spot with both layers, not a scene of its own', () => {
    // **The structural novelty of this lesson, as an assertion.** Every lesson has its own
    // `scenario()`; this one calls the constructor `@uhr-rate-ladder` calls, at another argument
    // value, which is the shape `@uwb-nba-coexist` set. The point is that the number being graded
    // and the number being measured come out of the SAME builder.
    expect(L.scenario()).toEqual(uhrLadderScenario('uhr', 'far', 'both', { seed: 2 }))
    expect(L.variants![0].scenario()).toEqual(uhrLadderScenario('eht', 'far', 'both', { seed: 2 }))
    // and two of its variants are byte-for-byte scenes the lesson before it already ships, so the
    // fixed-position arm the reader is sent to is literally the other lesson's
    expect(L.variants![7].scenario()).toEqual(uhrRateLadder.variants![5].scenario())
    expect(L.variants![8].scenario()).toEqual(uhrRateLadder.variants![6].scenario())
    const all = [L.scenario(), ...L.variants!.map((v) => v.scenario())]
    expect(all).toHaveLength(10)
    for (const s of all) expect(() => ScenarioSchema.parse(s)).not.toThrow()
  })

  it('every jump points at a record that really is in the base run, at the instant measured', () => {
    // **The spec asked for this to be run before it was written**, because a lesson riding
    // another lesson's scene has no scene of its own to guarantee its jumps fire. All four are
    // off the base batch and inside 300 ms, so all four are 「immediate」 in
    // tests/ui/eventLogWindow.test.ts's census.
    const rs = arm('uhr', 'far', 'both', 2)
    const at = (i: number): number => rs.find(L.jumps[i].find)!.t
    expect(L.jumps.map((j) => j.label)).toEqual([
      '第一帧跑在那个新档上', '第一次接收失败', '第一次掉出那个新档', '第一次抽到一个深阴影',
    ])
    expect(at(0)).toBe(88_000)
    expect(at(1)).toBe(16_905_600)
    expect(at(2)).toBe(94_239_400)
    expect(at(3)).toBe(202_099_400)
    // and the deep fade really is one the engine drew rather than a constant: the shadow value at
    // that record is below −4 dB, and the run holds several distinct shadow draws
    const shadows = rs.flatMap((r) => (r.type === 'RX_START' && r.shadowDb !== undefined ? [r.shadowDb] : []))
    expect(new Set(shadows.map((x) => x.toFixed(3))).size).toBeGreaterThan(3)
    expect(Math.min(...shadows)).toBeLessThan(-4)
  })
})

describe('claim-to-contribution · gate one, the four seed batches', () => {
  const t = tableOf('同一格，四批种子')
  const ROWS: readonly (readonly [string, Spot, 'shadow' | 'both'])[] = [
    ['墙后一步 · 只阴影', 'near', 'shadow'],
    ['客厅中段 · 只阴影', 'mid', 'shadow'],
    ['客厅深处 · 两层', 'far', 'both'],
  ]

  it('prints one row per batch and one column per position, in four columns', () => {
    expect(t.head[0]).toBe('这一批种子')
    expect(t.head.slice(1)).toEqual(ROWS.map(([label]) => label))
    expect(t.rows.map((r) => r[0])).toEqual(BATCHES.map(([name]) => name))
    // **Four columns, and the orientation is a measurement rather than a preference.** The first
    // draft had the positions down the side and the four batches across, which is five columns —
    // 525 CSS px against 445 at 470 px AND against 523 at 939 px, so it fell into its own
    // horizontal scroll box on BOTH of the two sizes this app is read at. `@uhr-rate-ladder`
    // found the same wall one slice earlier at six columns (.superpowers/sdd/w12b-report.md §7);
    // this is the first table in the course that did it at five. Transposing it also reads better
    // for this lesson: one ROW is one batch, so 「change the batch, get a different row」 is what
    // the eye does.
    expect(t.head).toHaveLength(4)
    for (const r of t.rows) expect(r).toHaveLength(4)
  })

  it.each(ROWS)('%s: all four printed means and seed counts are those runs', (label, spot, fade) => {
    const col = t.head.indexOf(label)
    expect(col, `${label} is not a column of the table`).toBeGreaterThan(0)
    BATCHES.forEach(([name, seeds], i) => {
      const [gain, win] = batch(spot, fade, seeds)
      const [statedGain, statedWin, statedN] = nums(t.rows[i]![col]!)
      expect(t.rows[i]![0], `row ${i} is the ${name} batch`).toBe(name)
      expect(statedN, `${label} / ${name}: the batch size printed in the cell`).toBe(seeds.length)
      expect(statedWin, `${label} / ${name}: seeds where uhr is faster`).toBe(win)
      expect(statedGain, `${label} / ${name}: mean ratio in per cent`)
        .toBeCloseTo(Number(gain.toFixed(2)), 2)
    })
  })

  it('and the three rows really are the three CLASSES the lesson sorts them into', () => {
    // **This is the assertion that would survive a rewrite of every figure above, and the one
    // that fails if the lesson's spine stops being true.** Not bounds on magnitudes — the shape.
    const signs = (spot: Spot, fade: 'shadow' | 'both'): number[] =>
      BATCHES.map(([, seeds]) => Math.sign(batch(spot, fade, seeds)[0]))
    // class 3, 「連正负都不在」: the 1 dB window changes sign between the batches
    expect(new Set(signs('near', 'shadow')).size, 'the narrow window must not agree with itself')
      .toBe(2)
    // class 2, 「只剩量级」: the 3 dB window keeps its sign in all four, and stays inside a
    // 2-point band — stable enough to report as a magnitude, not as a figure
    expect(signs('mid', 'shadow')).toEqual([1, 1, 1, 1])
    const mids = BATCHES.map(([, seeds]) => batch('mid', 'shadow', seeds)[0])
    expect(Math.max(...mids) - Math.min(...mids)).toBeLessThan(2)
    // and the deepest cell: sign stable, magnitude not — the printed 11.78 is the largest of four
    const fars = BATCHES.map(([, seeds]) => batch('far', 'both', seeds)[0])
    expect(fars.every((x) => x > 0)).toBe(true)
    expect(Math.max(...fars)).toBe(fars[0])
    expect(Math.max(...fars) - Math.min(...fars)).toBeGreaterThan(5)
  })

  it('the mechanism under all three is the one thing stable across the twelve cells', () => {
    // The sentence 「下面那张表三行乘四批种子共十二格，细阶梯的接收失败数每一格都比粗阶梯高」.
    const worse: string[] = []
    for (const [label, spot, fade] of ROWS) {
      for (const [name, seeds] of BATCHES) {
        const [, , fe, fu] = batch(spot, fade, seeds)
        if (fu <= fe) worse.push(`${label} / ${name}: eht ${fe}, uhr ${fu}`)
      }
    }
    expect(worse, 'cells where the finer ladder did NOT fail more often').toEqual([])
    // non-vacuous: twelve cells really were compared, and the counts are not all zero
    expect(batch('near', 'shadow', primeSeeds(20))[2]).toBe(32)
    expect(batch('near', 'shadow', primeSeeds(20))[3]).toBe(135)
  })

  it('a single run of the deepest cell says anything between losing 6 % and winning 57 %', () => {
    const one = (seed: number): [number, number, number] => {
      const e = goodputMbps(arm('eht', 'far', 'both', seed), RUN_NS)
      const u = goodputMbps(arm('uhr', 'far', 'both', seed), RUN_NS)
      return [e, u, (u / e - 1) * 100]
    }
    // the three the prose names, and the scene the reader loads is the first of them
    expect(one(2).map((x) => Number(x.toFixed(3)))).toEqual([16.64, 20.24, 21.635])
    expect(one(13).map((x) => Number(x.toFixed(3)))).toEqual([9.76, 9.16, -6.148])
    expect(one(47).map((x) => Number(x.toFixed(3)))).toEqual([11.64, 18.28, 57.045])
    // and seed 2 is genuinely the extreme case the lesson says it is: the loaded scene reports
    // nearly twice the twenty-seed mean
    const [mean20] = batch('far', 'both', primeSeeds(20))
    expect(one(2)[2]).toBeGreaterThan(mean20 * 1.8)
  })
})

describe('claim-to-contribution · gate two, the instrument that reads nothing', () => {
  const t = tableOf('相干时间那个旋钮')
  const flat = (coh: number): TLRecord[] =>
    run(uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: coh }),
      RUN_NS, `uhr/far/flat/${coh}`)
  const sigma4 = (coh: number): TLRecord[] =>
    run(uhrLadderScenario('uhr', 'far', 'both', { seed: 2, coherenceMs: coh }),
      RUN_NS, `uhr/far/s4/${coh}`)

  it('prints four coherence times and both columns, and every cell is that run', () => {
    expect(t.head).toEqual(['相干时间', '阴影标准差 0', '阴影标准差 4 分贝'])
    expect(t.rows.map((r) => nums(r[0]!)[0])).toEqual([5, 20, 100, 500])
    for (const row of t.rows) {
      const coh = nums(row[0]!)[0]!
      expect(nums(row[1]!)[0], `sigma 0, ${coh} ms`)
        .toBeCloseTo(Number(goodputMbps(flat(coh), RUN_NS).toFixed(6)), 5)
      expect(nums(row[2]!)[0], `sigma 4, ${coh} ms`)
        .toBeCloseTo(Number(goodputMbps(sigma4(coh), RUN_NS).toFixed(3)), 3)
    }
  })

  it('at sigma 0 the whole record stream is equal, not merely the goodput', () => {
    // 「左边四行到小数第六位完全相同，不是近似相同：两边的记录都是 9 472 条，接收失败都是 11 次」
    const base = flat(5)
    expect(base).toHaveLength(9_472)
    expect(failures(base)).toBe(11)
    for (const coh of [20, 100, 500, 7, 1]) {
      const other = flat(coh)
      expect(other.map((r) => `${r.t}:${r.seq}:${r.type}`),
        `coherenceMs ${coh} moved a record at sigma 0`).toEqual(base.map((r) => `${r.t}:${r.seq}:${r.type}`))
      expect(goodputMbps(other, RUN_NS)).toBe(goodputMbps(base, RUN_NS))
    }
    // the eht arm too, so this is a property of the field and not of one ladder
    const e5 = run(uhrLadderScenario('eht', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: 5 }), RUN_NS, 'eht/far/flat/5')
    const e500 = run(uhrLadderScenario('eht', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: 500 }), RUN_NS, 'eht/far/flat/500')
    expect(goodputMbps(e5, RUN_NS)).toBe(goodputMbps(e500, RUN_NS))
  })

  it('the two shipped variants are that pair, and the fixture carries ONE hash for them', () => {
    expect(L.variants![5].label).toBe('Wi-Fi 8 · 阴影关着 · 相干 5 毫秒')
    expect(L.variants![6].label).toBe('Wi-Fi 8 · 阴影关着 · 相干 500 毫秒')
    const a = L.variants![5].scenario(); const b = L.variants![6].scenario()
    // they differ, and in exactly one field — otherwise the identical hash below proves nothing
    expect(a).not.toEqual(b)
    expect({ ...a, fading: undefined }).toEqual({ ...b, fading: undefined })
    expect(a.fading!.coherenceMs).toBe(5)
    expect(b.fading!.coherenceMs).toBe(500)
    expect(a.fading!.shadowSigmaDb).toBe(0)
    // both of them, because the fixture below is a RECORDED value: a scene edited without
    // regenerating it would leave the equality below true about a run nobody ships.
    expect(b.fading!.shadowSigmaDb).toBe(0)
    // **The pin `docs/inert-config-contract.md` §1 step 2 asks for, read off the fixture file
    // itself rather than recomputed**: two scenarios, one recorded timeline hash.
    const rec = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>
    expect(rec['claim-to-contribution#5'], 'the 5 ms variant is in the fixture').toBeTruthy()
    expect(rec['claim-to-contribution#6']).toBe(rec['claim-to-contribution#5'])
  })

  it('and the same field is NOT inert at sigma 4, which is the half that makes the claim mean something', () => {
    // 「再把阴影的标准差从 0 改回 4，同一个字段立刻给出不同的答案（5 毫秒 13.960、100 毫秒 20.240、
    // 500 毫秒 28.000 Mb/s）」 — and the lesson's own `tryThis` says doing only the first half
    // proves 「this field is useless」, which is false.
    expect(goodputMbps(sigma4(5), RUN_NS)).toBeCloseTo(13.96, 3)
    expect(goodputMbps(sigma4(100), RUN_NS)).toBeCloseTo(20.24, 3)
    expect(goodputMbps(sigma4(500), RUN_NS)).toBeCloseTo(28.0, 3)
    expect(new Set([5, 20, 50, 100, 200, 500].map((c) => goodputMbps(sigma4(c), RUN_NS))).size).toBe(6)
  })
})

describe('claim-to-contribution · gate three, what survives', () => {
  it('the fixed-position difference IS the ratio of the two rungs, over five seeds and two lengths', () => {
    const ratio = PHY_MODES.uhr.ndbps[5]! / PHY_MODES.eht.ndbps[3]!
    expect([PHY_MODES.uhr.ndbps[5], PHY_MODES.eht.ndbps[3]]).toEqual([624, 468])
    expect(ratio).toBeCloseTo(1.3333, 4)
    for (const ns of [RUN_NS, LONG_NS]) {
      for (const seed of [1, 2, 7, 17, 99]) {
        const e = goodputMbps(run(uhrLadderScenario('eht', 'far'), ns, 'eht/far/off/-'), ns)
        const u = goodputMbps(run(uhrLadderScenario('uhr', 'far'), ns, 'uhr/far/off/-'), ns)
        expect(u / e, `${ns / MS} ms`).toBeCloseTo(ratio, 4)
        // the seed really is irrelevant here, which is the claim 「这一臂里没有随机性可言」
        expect(goodputMbps(arm('eht', 'far', 'off', seed, ns), ns)).toBe(e)
        expect(goodputMbps(arm('uhr', 'far', 'off', seed, ns), ns)).toBe(u)
      }
    }
    // and the figures the formula block prints
    const f = L.numbers!.find((b) => b.kind === 'formula')!
    expect(f.kind === 'formula' && f.text).toContain('624 / 468 = 1.3333')
    expect(f.kind === 'formula' && f.text).toContain('39.040 / 29.280 = 1.3333')
    expect(goodputMbps(run(uhrLadderScenario('uhr', 'far'), RUN_NS, 'uhr/far/off/-'), RUN_NS)).toBeCloseTo(39.04, 3)
    expect(goodputMbps(run(uhrLadderScenario('eht', 'far'), RUN_NS, 'eht/far/off/-'), RUN_NS)).toBeCloseTo(29.28, 3)
  })

  it('even that arm carries a condition, which is the `deeper` block the lesson adds for it', () => {
    // 「墙后一步那一格的算术是 1 248 / 1 170 = 1.0667，而 300 毫秒实测 +7.17 %、600 毫秒实测 +6.71 %」
    const arith = PHY_MODES.uhr.ndbps[11]! / PHY_MODES.eht.ndbps[7]!
    expect([PHY_MODES.uhr.ndbps[11], PHY_MODES.eht.ndbps[7]]).toEqual([1248, 1170])
    expect(arith).toBeCloseTo(1.0667, 4)
    const at = (ns: number): number => {
      const e = goodputMbps(run(uhrLadderScenario('eht', 'near'), ns, 'eht/near/off/-'), ns)
      const u = goodputMbps(run(uhrLadderScenario('uhr', 'near'), ns, 'uhr/near/off/-'), ns)
      return (u / e - 1) * 100
    }
    expect(at(RUN_NS)).toBeCloseTo(7.17, 2)
    expect(at(LONG_NS)).toBeCloseTo(6.71, 2)
    // and the two spots the prose says hide this really do give the arithmetic at both lengths
    for (const ns of [RUN_NS, LONG_NS]) {
      const mid = (g: Gen) => goodputMbps(run(uhrLadderScenario(g, 'mid'), ns, `${g}/mid/off/-`), ns)
      const far = (g: Gen) => goodputMbps(run(uhrLadderScenario(g, 'far'), ns, `${g}/far/off/-`), ns)
      expect((mid('uhr') / mid('eht') - 1) * 100).toBeCloseTo(11.11, 2)
      expect((far('uhr') / far('eht') - 1) * 100).toBeCloseTo(33.33, 2)
    }
  })

  it('what the reader reads first: mode, rung and goodput in the base scene and its twin', () => {
    const rungs = (rs: TLRecord[]): number[] => [...new Set(rs.flatMap(
      (r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined ? [r.frame.mcs] : [])))]
    const u = arm('uhr', 'far', 'both', 2); const e = arm('eht', 'far', 'both', 2)
    const firstData = (rs: TLRecord[]) => rs.find((r) => r.type === 'TX_START' && r.frame.kind === 'data')!
    expect((firstData(u) as Extract<TLRecord, { type: 'TX_START' }>).frame.mode).toBe('uhr')
    expect((firstData(u) as Extract<TLRecord, { type: 'TX_START' }>).frame.mcs).toBe(5)
    expect((firstData(e) as Extract<TLRecord, { type: 'TX_START' }>).frame.mode).toBe('eht')
    expect((firstData(e) as Extract<TLRecord, { type: 'TX_START' }>).frame.mcs).toBe(3)
    expect(goodputMbps(u, RUN_NS)).toBeCloseTo(20.24, 3)
    expect(goodputMbps(e, RUN_NS)).toBeCloseTo(16.64, 3)
    // the finer ladder walks more rungs than the coarse one in the same wander, which is the
    // mechanism sentence that holds while the percentage does not
    expect(rungs(u).length).toBeGreaterThan(rungs(e).length)
  })
})

describe('claim-to-contribution · the public record it cites, stated once each', () => {
  /**
   * The corpus itself is read-only and outside this repository, so what a test CAN hold is that
   * each figure is stated consistently wherever the lesson states it. Every one of these appears
   * in at least two of `terms`, `picture`, `numbers`, `deeper` and `sources`, and the recurring
   * defect in this repository is the second site going stale. The counts themselves were
   * re-measured off `tables/d1_clauses_from_lb291.md`, `tables/d2_clauses_from_lb296.md`,
   * `catalog.json` and `tables/sfd_full.md`; `.superpowers/sdd/w13-report.md` §1 has the method.
   */
  const everything = [
    L.why!, ...L.outcomes!, ...L.terms!.map((t) => `${t.term} ${t.plain}`),
    ...L.picture!.flatMap((b) => JSON.stringify(b)), ...L.numbers!.flatMap((b) => JSON.stringify(b)),
    ...L.deeper!.flatMap((b) => JSON.stringify(b)), ...L.sources!, ...L.limits.map((x) => x.text),
    ...L.observe, ...L.tryThis, ...L.quiz.flatMap((q) => [q.q, ...q.options, q.explain]),
  ].join('\n')

  /*
   * **「at least twice」 is not a pin, and the planter proved it.** This list used to ask for a
   * floor (`toBeGreaterThanOrEqual`), with the argument that a figure stated once can go stale
   * alone. True, and insufficient in both directions: a figure printed FOUR times keeps three
   * copies when one of them is edited, so every one of its sites stayed green under planting;
   * and the two figures printed once (`2 767`, `2 739`) were allowed a floor of 1, which any
   * single surviving copy satisfies. The sweep of 2026-10-14 planted all twelve and not one of
   * them reddened this file.
   *
   * So the count IS the pin: each is stated EXACTLY this many times, and an edit to any one site
   * makes the count wrong. That also makes the rule say something a reader can check on the page
   * — 「this figure is in the glossary, in the table and in `sources`」 — rather than 「somewhere,
   * at least twice」.
   *
   * Each key carries its counter word, because the bare digits collide: 「26」 is also inside
   * `11-26/1613r0`, and 「36」 is also the wins cell 「36/60」 of a seed batch, which is a measured
   * quantity of this very lesson and must NOT be counted as a corpus figure.
   *
   * The document numbers, the motions and the two ballot numbers are in the same list for the
   * same reason: there is no corpus here to check them against, so what IS checkable is that
   * each occurs exactly as often as the lesson means it to. `LB291` and `LB296` occur once each
   * and the planter DOES plant them (they are not in its citation patterns, while `11-25/…` is),
   * so before this they were a figure nothing watched at all.
   */
  it.each([
    ['8 523 条', 3], ['618 个条款', 3], ['7 874 条', 3], ['712 个条款', 3],
    ['143 处', 4], ['49 个三级小节', 3], ['里的 26 个', 3], ['36 处', 2],
    ['763 份', 2], ['1 682 份', 2], ['2 767 份', 1], ['2 739 行', 1],
    ['框架 r19', 2], ['LB291', 1], ['LB296', 1],
    ['Motion #42', 2], ['Motion #216', 3], ['Motion #417', 2],
    ['11-24/0469r0', 2], ['11-24/0753r1', 2], ['11-24/1186r1', 2], ['11-25/0721r3', 2],
    ['11-25/1772r16', 2], ['11-26/1613r0', 2], ['11-24/0209r19', 2],
  ])('states 「%s」 exactly %i times, so editing any one of them is visible', (phrase, times) => {
    const n = everything.split(phrase).length - 1
    expect(n, `「${phrase}」 appears ${n} times, not ${times}. Either a site was edited on its own`
      + ' (which is the defect this rule exists for) or the lesson gained one and this count owes'
      + ' an update').toBe(times)
  })

  it('names the two LB comment sheets as the sources of the two comment counts', () => {
    const s = L.sources!.join('\n')
    expect(s).toContain('11-25/1772r16')
    expect(s).toContain('11-26/1613r0')
    // and the clause/comment pairs are not crossed: D1.0 is the bigger comment count on the
    // smaller clause count, which is the one thing a transposition would break
    expect(/11-25\/1772r16[^；]*8 523 条意见落在 618 个条款上/.test(s)).toBe(true)
    expect(/11-26\/1613r0[^；]*7 874 条落在 712 个条款上/.test(s)).toBe(true)
  })

  it('declares the draft in prose, which is what puts the amber line on the page', () => {
    // `citedBases` reads the string 「802.11bn」 out of `sources`; a lesson that cited only the
    // document numbers would declare nothing and print no warning.
    expect(L.sources!.some((s) => s.includes('802.11bn'))).toBe(true)
    expect(L.sources!.some((s) => s.includes('未批准的草案'))).toBe(true)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The two big tables above are already read out of the lesson — `nums(t.rows[i][col])` against
 * `batch()` and against the two coherence columns — and the twelve corpus counts are held by the
 * stated-twice rule. What the sampling sweep of 2026-10-12 found unread was the **prose**: five
 * of the six figures it planted went unnoticed, and every one of them was in a sentence. Here
 * each printed figure is parsed out of the shipped string and compared with the same measurement
 * the cells are compared with. Every run below is keyed exactly as the suites above key theirs,
 * so this describe adds reads and not simulations.
 *
 * **The reads worth naming:**
 *
 *  - **a figure is read at every site that prints it.** 11.78 % is printed at ELEVEN sites and
 *    20.240 Mb/s at four; each one is located by its own sentence, because a planted digit moves
 *    one site only. The sweep of 2026-10-14 is what made that count exact: reading five of the
 *    eleven left the quiz's two unwatched, and 「at least twice」 (the rule the corpus counts used
 *    to carry) is satisfied by any one surviving copy.
 *  - **a quoted variant label is a figure too.** 「切到「Wi-Fi 8 · 种子 13」」 is an instruction,
 *    and a planted digit leaves it grammatical and dead; every citation is resolved against the
 *    shipped variant list, which is then resolved against the seed its scene really runs.
 *  - **「到小数第六位完全相同」 is read at six decimals**, which is the one place in this course
 *    where the precision of a claim is itself the claim.
 *  - **the four seed tables are read as their own definitions**: 「六十个（1 加前五十九个质数）」
 *    is read as 1 followed by that many primes, numeral and all.
 *  - **two false figures came out of this read** and are fixed in the lesson: the formula note
 *    said 「六个组合」 of five seeds and two run lengths (there are ten), and `deeper` said
 *   「六格里有五格不同」 where no cell of the six matches its partner.
 */
describe('claim-to-contribution · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const WHY = [L.why!, ...L.outcomes!].join('\n')
  const PIC = blockText(L.picture)
  const NUMS = blockText(L.numbers)
  const DEEP = blockText(L.deeper)
  const SRC = L.sources!.join('\n')
  const OBS = L.observe.join('\n')
  const TRY = L.tryThis.join('\n')
  const QUIZ = blockText(L.quiz)
  const TERMS = L.terms!.map((x) => `${x.term} ${x.plain}`).join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  /** The printed figure, read at exactly the decimals it is printed to. */
  const same = (printed: string | number, measured: number, what: string): void => {
    const fig = String(printed).replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** 一…十 as digits, and 十九 / 五十九 / 一百一十九 as the numbers they name. */
  const cn = (s: string): number => {
    const d = (c: string): number => '零一二三四五六七八九'.indexOf(c)
    let out = 0
    let rest = s === '两' ? '二' : s
    const hi = rest.indexOf('百')
    if (hi >= 0) { out += (hi === 0 ? 1 : d(rest.slice(0, hi))) * 100; rest = rest.slice(hi + 1) }
    const ti = rest.indexOf('十')
    if (ti >= 0) { out += (ti === 0 ? 1 : d(rest.slice(0, ti))) * 10; rest = rest.slice(ti + 1) }
    return out + (rest === '' ? 0 : d(rest))
  }
  /** The mean ratio of a batch, in per cent — the quantity every percentage below is. */
  const gainOf = (spot: Spot, fade: 'shadow' | 'both', seeds: number[]): number =>
    batch(spot, fade, seeds)[0]
  const FAR = BATCHES.map(([, s]) => gainOf('far', 'both', s))
  const MID = BATCHES.map(([, s]) => gainOf('mid', 'shadow', s))
  const NEAR = BATCHES.map(([, s]) => gainOf('near', 'shadow', s))
  /** One seed, one cell: the two arms' goodputs and what the finer ladder gains on it. */
  const single = (seed: number): [number, number, number] => {
    const u = goodputMbps(arm('uhr', 'far', 'both', seed), RUN_NS)
    const e = goodputMbps(arm('eht', 'far', 'both', seed), RUN_NS)
    return [u, e, (u / e - 1) * 100]
  }
  /** Keyed as the suites above key it, so the sigma-0 and sigma-4 sweeps are already in cache. */
  const coh = (ms: number, sigmaDb: 0 | 4): number => {
    const sc = sigmaDb === 0
      ? uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: ms })
      : uhrLadderScenario('uhr', 'far', 'both', { seed: 2, coherenceMs: ms })
    const key = sigmaDb === 0 ? `uhr/far/flat/${ms}` : `uhr/far/s4/${ms}`
    return goodputMbps(run(sc, RUN_NS, key), RUN_NS)
  }
  const off = (gen: Gen, spot: Spot, ns = RUN_NS): number =>
    goodputMbps(run(uhrLadderScenario(gen, spot), ns, `${gen}/${spot}/off/-`), ns)
  const offGain = (spot: Spot, ns: number): number => (off('uhr', spot, ns) / off('eht', spot, ns) - 1) * 100

  it('reads the four batch figures at every site that prints them', () => {
    // 「同一格换一批六十个种子算出 7.40 %，换另外六十个是 8.65 %，一百二十个是 6.60 %」
    const [b60a, b60b, b120] = raw(WHY,
      /换一批六十个种子算出 ([\d.]+) %，换另外六十个是 ([\d.]+) %，一百二十个是 ([\d.]+) %/,
      '`why` on the three other batches')
    same(b60a!, FAR[1]!, '`why`: the prime-sixty batch')
    same(b60b!, FAR[2]!, '`why`: the one-to-sixty batch')
    same(b120!, FAR[3]!, '`why`: and the hundred-and-twenty')
    // the printed batch, at each of the five places the lesson prints it
    const sites: [string, RegExp, string][] = [
      [WHY, /细阶梯比粗阶梯快 ([\d.]+) %/, '`why` on the printed batch'],
      [PIC, /那个 ([\d.]+) % 是什么的函数/, 'the `picture` heading'],
      [PIC, /最后一行印着 \+([\d.]+) %/, '`picture` on the row it came from'],
      [PIC, /这一格快 ([\d.]+) %/, '`picture` on what it is not'],
      [PIC, /而上一课那张表在同一格印的是 \+([\d.]+) %/, 'the watch block on the same row'],
      [QUIZ, /上一课在客厅深处那一格印了 \+([\d.]+) %/, 'the quiz question'],
      [QUIZ, /就写 \+([\d.]+) %，因为那是课文印的那一批/, 'the quiz option that reports it bare'],
    ]
    for (const [text, re, what] of sites) same(raw(text, re, what)[0]!, FAR[0]!, what)
    // 「表头也写明了它是二十个种子的均值」
    const [twentyCn] = raw(PIC, /它是(..)个种子的均值/, '`picture` on what the mean is over')
    expect(cn(twentyCn!), 'the seeds that batch really has').toBe(BATCHES[0]![1].length)
    // 「同一格、同一对阶梯，只换随机种子表：四批给出 +11.78、+7.40、+8.65、+6.60 %」
    const four = raw(PIC, /四批给出 \+([\d.]+)、\+([\d.]+)、\+([\d.]+)、\+([\d.]+) %/,
      'gate one on the four batches')
    for (const [i, printed] of four.entries()) same(printed!, FAR[i]!, `gate one: batch ${i}`)
    // the quiz prints all four again, their average, and the band they fall in
    const quizFour = raw(QUIZ, /四批种子给出 \+([\d.]+) \/ \+([\d.]+) \/ \+([\d.]+) \/ \+([\d.]+) %/,
      'the quiz on the four batches')
    expect(quizFour, 'the same four figures as the gate').toEqual(four)
    const [avg] = raw(QUIZ, /取四批的平均 \+([\d.]+) %/, 'the quiz on their average')
    same(avg!, FAR.reduce((a, b) => a + b, 0) / FAR.length, 'the average of the four batches')
    /*
     * 「剩下的量级在 6 % 到 12 % 之间」 — read as the TIGHTEST whole-per-cent band that holds all
     * four batches, not as the inequality it is written as. Reading it as 「every batch is above
     * the bottom and under the top」 pins the bottom only: 6.60 % fails a 7, but 11.78 % passes a
     * 13 as happily as a 12, so half the claim would sit unwatched. (The bottom is what this
     * read found false: the lesson said 7 until today — see the ledger's table of false figures.)
     */
    const [lo, hi] = figs(QUIZ, /剩下的量级在 (\d+) % 到 (\d+) % 之间/, 'the quiz on the band')
    expect(lo, 'the bottom of the band, at the whole per cent below the lowest batch')
      .toBe(Math.floor(Math.min(...FAR)))
    expect(hi, 'and the top, at the whole per cent above the highest')
      .toBe(Math.ceil(Math.max(...FAR)))
    // 「纸面上的 +33.3 % 还掉大半」 — the no-fading arm of this very cell
    const [paper] = raw(QUIZ, /纸面上的 \+([\d.]+) % 还掉大半/, 'the quiz on the fading-free figure')
    same(paper!, offGain('far', RUN_NS), 'the same cell with no fading at all')
    expect(FAR[0]! * 2, 'and the faded one really is less than half of it').toBeLessThan(val(paper!))
  })

  it('reads the three classes, and the mechanism under all of them', () => {
    // 「第二类是客厅中段只开阴影那一格，四批种子给出 +8.18 / +9.19 / +8.19 / +9.43 %」
    const four = raw(PIC, /四批种子给出 \+([\d.]+) \/ \+([\d.]+) \/ \+([\d.]+) \/ \+([\d.]+) %/,
      '`picture` on the second class')
    for (const [i, printed] of four.entries()) same(printed!, MID[i]!, `the mid cell, batch ${i}`)
    expect(Math.min(...MID), 'all four of them positive, which is what 「正负稳」 means')
      .toBeGreaterThan(0)
    // 「稳稳地快不到一成」 — the band the class is allowed to be written as
    expect(Math.max(...MID), 'and under the one tenth the sentence allows itself').toBeLessThan(10)
    // 「第三类是墙后一步那一格，二十个种子给 −0.04 %、六十个给 +2.10 %，连正负都不在了」
    const [twenty, sixty] = raw(PIC, /二十个种子给 (−[\d.]+) %、六十个给 \+([\d.]+) %/,
      '`picture` on the third class')
    same(twenty!, NEAR[0]!, 'the twenty-seed batch behind the wall')
    same(sixty!, NEAR[1]!, 'and the sixty-seed one')
    expect(Math.sign(val(twenty!)), 'the two really do disagree about the sign')
      .not.toBe(Math.sign(val(sixty!)))
    // 「下面那张表四行乘三个位置共十二格，细阶梯的接收失败数每一格都比粗阶梯高」
    const [rowsCn, spotsCn, cellsCn] = raw(PIC,
      /下面那张表(.)行乘(.)个位置共(..)格，细阶梯的接收失败数每一格都比粗阶梯高/,
      '`picture` on the twelve cells')
    expect(cn(rowsCn!), 'the batches the table has').toBe(BATCHES.length)
    expect(cn(spotsCn!), 'the positions it compares').toBe(3)
    expect(cn(cellsCn!), 'and the cells they make').toBe(BATCHES.length * 3)
    const cells: [Spot, 'shadow' | 'both'][] = [['near', 'shadow'], ['mid', 'shadow'], ['far', 'both']]
    for (const [spot, fade] of cells) {
      for (const [name, seeds] of BATCHES) {
        const [, , fe, fu] = batch(spot, fade, seeds)
        expect(fu, `${spot}/${name}: the finer ladder really fails more often`).toBeGreaterThan(fe)
      }
    }
  })

  it('reads what one run says, on the three seeds the lesson names', () => {
    // 「最差的那个种子说细阶梯慢 6.15 %，最好的那个说它快 57.04 %」
    const [worst, best] = raw(WHY, /最差的那个种子说细阶梯慢 ([\d.]+) %，最好的那个说它快 ([\d.]+) %/,
      '`why` on the two extremes')
    // 「二十个种子里最差的是种子 13——Wi-Fi 8 跑 9.160、Wi-Fi 7 跑 9.760 Mb/s，细阶梯慢 6.15 %」
    const w = raw(NUMS,
      /最差的是种子 (\d+)——Wi-Fi 8 跑 ([\d.]+)、Wi-Fi 7 跑 ([\d.]+) Mb\/s，细阶梯慢 ([\d.]+) %/,
      '`numbers` on the worst seed')
    const [u13, e13, loss13] = single(val(w[0]!))
    same(w[1]!, u13, `seed ${w[0]}: the finer ladder’s goodput`)
    same(w[2]!, e13, `seed ${w[0]}: and the coarser one’s`)
    same(w[3]!, -loss13, `seed ${w[0]}: what the finer ladder loses`)
    expect(w[3], 'which is the worst of the twenty, as `why` says').toBe(worst)
    // 「最好的是种子 47——18.280 对 11.640，快 57.04 %」
    const b = raw(NUMS, /最好的是种子 (\d+)——([\d.]+) 对 ([\d.]+)，快 ([\d.]+) %/,
      '`numbers` on the best seed')
    const [u47, e47, gain47] = single(val(b[0]!))
    same(b[1]!, u47, `seed ${b[0]}: the finer ladder’s goodput`)
    same(b[2]!, e47, `seed ${b[0]}: and the coarser one’s`)
    same(b[3]!, gain47, `seed ${b[0]}: what it gains`)
    expect(b[3], 'which is the best of the twenty').toBe(best)
    // the two extremes really are the extremes of that batch, which is what makes them extremes
    const spread = BATCHES[0]![1].map((s) => single(s)[2])
    same(w[3]!, -Math.min(...spread), 'the worst single run of the twenty')
    same(b[3]!, Math.max(...spread), 'and the best')
    // 「而这一课载入的那一跑用的是种子 2，给出 +21.63 %」
    const own = raw(NUMS, /这一课载入的那一跑用的是种子 (\d+)，给出 \+([\d.]+) %/,
      '`numbers` on the lesson’s own run')
    const [u2, e2, gain2] = single(val(own[0]!))
    same(own[1]!, gain2, 'what the lesson’s own seed gives')
    expect(val(own[0]!), 'and that really is the seed the scene loads').toBe(L.scenario().seed)
    // the watch block: both rungs, both goodputs, the gain and the window
    const watch = raw(PIC, /两边跑完 (\d+) 毫秒，吞吐是 ([\d.]+) 对 ([\d.]+) Mb\/s，也就是 \+([\d.]+) %/,
      '`picture` on the two arms')
    expect(val(watch[0]!) * MS, 'the window both arms run').toBe(RUN_NS)
    same(watch[1]!, u2, 'the finer ladder’s goodput in the lesson’s own run')
    same(watch[2]!, e2, 'and the coarser one’s')
    same(watch[3]!, gain2, 'and the gain between them')
    // 「阴影与瑞利两层都开着，种子 2——跳到第一帧跑在新档上的那一刻」 — the watch block's own seed
    const [watchSeed] = figs(PIC, /两层都开着，种子 (\d+)——跳到第一帧/,
      '`picture` on the seed it tells the reader to load')
    expect(watchSeed, 'the seed the scene really loads').toBe(L.scenario().seed)
    const [uhrMcs] = figs(PIC, /调制与编码方式（modulation and coding scheme, MCS）是 (\d+)/,
      '`picture` on the finer ladder’s rung')
    const [ehtMcs] = figs(PIC, /再切到「Wi-Fi 7 · 同一格」：eht，MCS (\d+)/,
      '`picture` on the coarser ladder’s rung')
    const firstRung = (gen: Gen): number => {
      const r = arm(gen, 'far', 'both', 2).find((x) => x.type === 'TX_START' && x.frame.kind === 'data')
      return (r as Extract<TLRecord, { type: 'TX_START' }>).frame.mcs!
    }
    expect(firstRung('uhr'), 'the rung the finer ladder opens on').toBe(uhrMcs)
    expect(firstRung('eht'), 'and the coarser one').toBe(ehtMcs)
    // `observe` prints the same figures again, and the seed-13 pair
    const o = raw(OBS, /模式是 uhr、档位 (\d+)；切到「Wi-Fi 7 · 同一格」是 eht、档位 (\d+)；两边 (\d+) 毫秒的吞吐是 ([\d.]+) 对 ([\d.]+) Mb\/s/,
      '`observe` on the two arms')
    expect([val(o[0]!), val(o[1]!)], 'the same two rungs').toEqual([uhrMcs, ehtMcs])
    expect(val(o[2]!) * MS, 'the same window').toBe(RUN_NS)
    expect([o[3], o[4]], 'and the same two goodputs').toEqual([watch[1], watch[2]])
    const o13 = raw(OBS, /同样只读吞吐：([\d.]+) 对 ([\d.]+) Mb\/s/, '`observe` on the seed-13 pair')
    expect(o13, 'the same pair as `numbers`').toEqual([w[1], w[2]])
    // `tryThis` prints the seed-47 pair and all four answers of that cell
    const t47 = raw(TRY, /各跑一次：([\d.]+) 对 ([\d.]+) Mb\/s，细阶梯快 ([\d.]+) %/,
      '`tryThis` on the seed-47 pair')
    expect(t47, 'the same three figures as `numbers`').toEqual([b[1], b[2], b[3]])
    const answers = raw(TRY,
      /种子 (\d+) 的 \+([\d.]+) %、种子 (\d+) 的 −([\d.]+) %、种子 (\d+) 的 \+([\d.]+) %，和二十个种子的均值 \+([\d.]+) %/,
      '`tryThis` on the four answers')
    expect([answers[0], answers[2], answers[4]], 'the three seeds it lists')
      .toEqual([own[0], w[0], b[0]])
    expect([answers[1], answers[3], answers[5]], 'and their three answers')
      .toEqual([own[1], w[3], b[3]])
    same(answers[6]!, FAR[0]!, 'and the twenty-seed mean beside them')
  })

  it('reads the coherence sweep at the precision the claim is made to', () => {
    const t = tableOf('相干时间那个旋钮')
    // 「（客厅深处、瑞利开着、300 毫秒、种子 2，Wi-Fi 8 的吞吐）」 — the heading's own two figures
    const heading = (L.numbers!.find((b) => b.kind === 'table'
      && b.heading?.includes('相干时间那个旋钮')) as unknown as { heading: string }).heading
    const head = raw(heading, /(\d+) 毫秒、种子 (\d+)，Wi-Fi 8 的吞吐/, 'the table’s own heading')
    expect(val(head[0]!) * MS, 'the window every cell of it runs').toBe(RUN_NS)
    expect(val(head[1]!), 'and the seed').toBe(L.scenario().seed)
    // 「把阴影的标准差改成 0，再把相干时间从 5 毫秒扫到 500 毫秒：四行输出到小数第六位完全相同」
    const g2 = raw(PIC,
      /把阴影的标准差改成 (\d)，再把相干时间从 (\d+) 毫秒扫到 (\d+) 毫秒：(.)行输出到小数第(.)位完全相同/,
      'gate two on the sweep')
    const sweep = t.rows.map((r) => nums(r[0]!)[0]!)
    expect([sweep[0], sweep.at(-1)], 'the two ends the gate sweeps between')
      .toEqual([val(g2[1]!), val(g2[2]!)])
    expect(cn(g2[3]!), 'the rows it reads').toBe(t.rows.length)
    const dp = cn(g2[4]!)
    const flat = t.rows.map((r) => r[1]!.replace(' Mb/s', ''))
    for (const printed of flat) {
      expect((printed.split('.')[1] ?? '').length, 'every cell printed to that many places').toBe(dp)
    }
    expect(new Set(flat).size, 'and the four of them are one figure').toBe(1)
    for (const [i, ms] of sweep.entries()) {
      expect(coh(ms, val(g2[0]!) as 0).toFixed(dp), `${ms} ms at sigma ${g2[0]}`).toBe(flat[i])
    }
    // 「左边四行到小数第六位完全相同…两边的记录都是 9 472 条，接收失败都是 11 次」
    const [againCn, againDp] = raw(NUMS, /左边(.)行到小数第(.)位完全相同/, '`numbers` on the same four rows')
    expect([cn(againCn!), cn(againDp!)], 'the same rows and the same precision')
      .toEqual([t.rows.length, dp])
    const [records, fails] = figs(NUMS, /两边的记录都是 ([\d ]+) 条，接收失败都是 (\d+) 次/,
      '`numbers` on the two identical runs')
    for (const ms of [sweep[0]!, sweep.at(-1)!]) {
      const rs = run(uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: 0, coherenceMs: ms }),
        RUN_NS, `uhr/far/flat/${ms}`)
      expect(rs.length, `${ms} ms: the records that run leaves`).toBe(records)
      expect(failures(rs), `${ms} ms: and its failed receptions`).toBe(fails)
    }
    // 「右边那一列是同一个字段在标准差 4 分贝下的样子，从 13.960 走到 28.000 Mb/s」
    const [sigmaDb] = figs(NUMS, /同一个字段在标准差 (\d) 分贝下的样子/, '`numbers` on the other column')
    expect(uhrLadderScenario('uhr', 'far', 'both', { seed: 2 }).fading!.shadowSigmaDb,
      'the sigma this scene really runs at').toBe(sigmaDb)
    const [from, to] = raw(NUMS, /从 ([\d.]+) 走到 ([\d.]+) Mb\/s/, '`numbers` on the range')
    const live = t.rows.map((r) => nums(r[2]!)[0]!)
    expect([live[0], live.at(-1)], 'the first and last cell of that column')
      .toEqual([val(from!), val(to!)])
    for (const [i, ms] of sweep.entries()) {
      same(t.rows[i]![2]!.replace(' Mb/s', ''), coh(ms, 4), `${ms} ms at sigma ${sigmaDb}`)
    }
    // `observe` prints both counts and the one goodput; `tryThis` prints three of the live column
    const o = raw(OBS, /两边都是 ([\d ]+) 条记录、(\d+) 次接收失败、([\d.]+) Mb\/s/,
      '`observe` on the two runs')
    expect([val(o[0]!), val(o[1]!)], 'the same two counts').toEqual([records, fails])
    same(o[2]!, coh(sweep[0]!, 0), 'and the goodput both of them give')
    /*
     * 「（5 毫秒 13.960、100 毫秒 20.240、500 毫秒 28.000 Mb/s）」 — three of the four rows of the
     * table above, quoted in a sentence. Each pair is read against **the row it quotes**, not by
     * rerunning the coherence time it prints: the planter moved 100 to 101 and this read stayed
     * green, because a one-millisecond shift of a shadow that is redrawn three times in 300 ms
     * gives the same goodput to three decimals. So the measurement cannot tell those two knob
     * values apart, and the thing that CAN is that 101 is not a row this lesson ships.
     */
    const tt = raw(TRY, /（(\d+) 毫秒 ([\d.]+)、(\d+) 毫秒 ([\d.]+)、(\d+) 毫秒 ([\d.]+) Mb\/s）/,
      '`tryThis` on the live column')
    for (const i of [0, 2, 4]) {
      const j = sweep.indexOf(val(tt[i]!))
      expect(j, `${tt[i]} ms: a coherence time this lesson’s own table has a row for`)
        .toBeGreaterThanOrEqual(0)
      expect(tt[i + 1]! + ' Mb/s', `${tt[i]} ms: the cell of that row, which is read above`)
        .toBe(t.rows[j]![2])
      same(tt[i + 1]!, coh(val(tt[i]!), 4), `${tt[i]} ms at sigma ${sigmaDb}`)
    }
    expect(new Set([0, 2, 4].map((i) => val(tt[i]!))).size, 'three different rows of the four')
      .toBe(3)
    const [back] = figs(TRY, /再把阴影的标准差从 0 改回 (\d)/, '`tryThis` on the sigma it restores')
    expect(back, 'the sigma it puts back').toBe(sigmaDb)
    /*
     * The quiz asks the same sweep again, and then answers it with the two ends of the live
     * column — 「标准差改回 4 分贝，同一个字段就把答案从 13.960 带到 28.000 Mb/s」. Both ends are
     * read, because this is the anti-vacuity half of gate two: the figure that makes 「读不到」
     * different from 「没用」 is the one the SAME field gives when the shadow is switched on.
     */
    const q2 = raw(QUIZ,
      /把阴影的标准差设成 (\d)，再把相干时间从 (\d+) 毫秒扫到 (\d+) 毫秒/, 'the quiz on the sweep')
    expect(q2[0], 'the same sigma the gate sweeps at').toBe(g2[0])
    expect([val(q2[1]!), val(q2[2]!)], 'and the same two ends, which are the table’s own')
      .toEqual([sweep[0], sweep.at(-1)])
    const [onAgain] = figs(QUIZ, /标准差改回 (\d) 分贝/, 'the quiz on the sigma it puts back')
    expect(onAgain, 'the sigma the scene itself runs at').toBe(sigmaDb)
    const qq = raw(QUIZ, /就把答案从 ([\d.]+) 带到 ([\d.]+) Mb\/s/, 'the quiz on the two answers')
    same(qq[0]!, coh(sweep[0]!, 4), `${sweep[0]} ms at sigma ${sigmaDb}`)
    same(qq[1]!, coh(sweep.at(-1)!, 4), `${sweep.at(-1)} ms at sigma ${sigmaDb}`)
  })

  it('reads the mechanism sentence at every site, and the half that makes it mean something', () => {
    /*
     * 「因为算阴影的那一步在标准差为 0 时直接返回 0，还没走到相干时间那一行」 — the sentence gate
     * two turns on, printed three times, and BOTH of its zeros are figures: the sigma the claim
     * is about, and the value the step returns. Read off the records' own `shadowDb`, and read
     * with its other half — at the scene's own sigma that same field returns many values —
     * because 「it returns 0」 is only worth saying if it could have returned something else.
     */
    const shadows = (sc: Scenario, key: string): number[] => run(sc, RUN_NS, key)
      .flatMap((r) => (r.type === 'RX_START' && r.shadowDb !== undefined ? [r.shadowDb] : []))
    const sites: [string, RegExp, string][] = [
      [PIC, /算阴影的那一步在标准差为 (\d) 时直接返回 (\d)/, 'gate two’s own sentence'],
      [NUMS, /标准差为 (\d) 时它直接返回 (\d)/, '`numbers` on the same step'],
    ]
    /*
     * **The key has to carry the figure, or the read answers with a run of another scene.** The
     * first version of this read keyed the planted sigma's scene as `uhr/far/flat/5` — the name
     * the sigma-0 suites above use — and the memo had already filled that key, so a planted
     * 「标准差为 1」 built a sigma-1 scenario, never ran it, and read the cached sigma-0 records
     * back: all zero, green. The sweep caught it; reading the code could not, because the
     * scenario on the line above is correct and only the string beside it is wrong.
     */
    for (const [text, re, what] of sites) {
      const [sigma, returns] = figs(text, re, what)
      const flat = shadows(
        uhrLadderScenario('uhr', 'far', 'both', { seed: 2, sigmaDb: sigma, coherenceMs: 5 }),
        sigma === 0 ? `uhr/far/flat/5` : `uhr/far/sigma${sigma}/5`)
      expect(flat.length, `${what}: the receptions that drew a shadow at all`).toBeGreaterThan(100)
      expect([...new Set(flat)], `${what}: every value that step returns at that sigma`)
        .toEqual([returns])
    }
    // the quiz states the same mechanism with the sigma alone, and then the other half of it
    const [quizSigma] = figs(QUIZ, /算阴影那一步在标准差为 (\d) 时先返回了/,
      'the quiz on the same step')
    expect(quizSigma, 'the same sigma all three sites name').toBe(figs(...sites[0]!)[0])
    const lively = shadows(uhrLadderScenario('uhr', 'far', 'both', { seed: 2, coherenceMs: 5 }),
      `uhr/far/s4/5`)
    expect(new Set(lively).size, 'while at the sigma the scene itself runs it returns many values')
      .toBeGreaterThan(1)
  })

  it('reads every variant the prose tells the reader to switch to, as a variant that exists', () => {
    /*
     * **The figures inside a quoted variant label are pinned by the variant list, and nothing
     * else can pin them.** 「切到「Wi-Fi 8 · 种子 13」」 is an instruction; a planted digit leaves
     * the sentence grammatical and the instruction dead, which is exactly the defect a reader
     * hits and no measurement sees. So every quoted fragment that looks like one of this
     * lesson's labels has to BE one — and the test at the end of this file then ties each label
     * to the seed and the coherence time its scene really runs, so the chain is prose → label →
     * scene → run.
     */
    const prose = [PIC, NUMS, DEEP, OBS, TRY, QUIZ].join('\n')
    const cited = [...new Set([...prose.matchAll(/「([^」]*)」/g)].map((m) => m[1]!))]
      .filter((s) => /·|相干 \d+ 毫秒|种子 \d+/.test(s))
    const labels = L.variants!.map((v) => v.label)
    for (const c of cited) {
      expect(labels.filter((l) => l === c || l.endsWith(`· ${c}`)),
        `「${c}」: the prose sends the reader to this variant, so exactly one must carry that name`)
        .toHaveLength(1)
    }
    expect(cited, 'every citation this lesson makes, so a new one cannot arrive unread')
      .toHaveLength(9)
  })

  it('reads the three figures `sources` calls the simulator’s own, and the one the engine answers', () => {
    /*
     * 「阴影的标准差 4 分贝与 100 毫秒相干时间…以及挑档时在所需信噪比之上留的 3 分贝余量，都是
     * 本仿真器自己的取值」 — a declaration about provenance, and all three figures are in this
     * repository, so all three are readable. This is the paragraph that keeps the lesson honest
     * about which numbers the draft gives and which it does not, and a stale figure here would
     * be a false statement about the repository itself.
     */
    const base = uhrLadderScenario('uhr', 'far', 'both', { seed: 2 }).fading!
    const [sigma, coherence] = figs(SRC, /阴影的标准差 (\d) 分贝与 (\d+) 毫秒相干时间/,
      '`sources` on the slow layer’s two figures')
    expect([sigma, coherence], 'the two figures this scene really runs the slow layer at')
      .toEqual([base.shadowSigmaDb, base.coherenceMs])
    const [margin] = figs(SRC, /在所需信噪比之上留的 (\d) 分贝余量/, '`sources` on the rate margin')
    expect(margin, 'the margin `mcsForRssi` really keeps').toBe(RATE_MARGIN_DB)
    /*
     * 「同一条动议写明 256-QAM 2/3 对只支持 20 兆赫的设备是可选的」 — draft content, and no test
     * here can check a motion's wording. What the ENGINE can answer is the rung it names: every
     * N_DBPS in this table is data tones × bits per tone × code rate, so those four figures
     * multiply out to a rung that really is in the ladder, and 20 兆赫 is the width the whole
     * table is for (index 0 is BPSK 1/2, so the tone count falls out of it).
     */
    const [qam, num, den, mhz] = figs(SRC,
      /写明 (\d+)-QAM (\d+)\/(\d+) 对只支持 (\d+) 兆赫的设备是可选的/,
      '`sources` on the exception that motion carries')
    expect(NOISE_DBM, 'the width every rung of this table is for').toBe(noiseDbm(mhz!))
    const tones = PHY_MODES.uhr.ndbps[0]! * 2
    /*
     * **「a rung this table has」 is not narrow enough, and 2/4 is why.** This read first asked
     * only that the product be SOMEWHERE in `PHY_MODES.uhr.ndbps`, and the planter moved the
     * code rate to 2/4: 234 × 8 × 2/4 = 936, which is a rung — the 16-QAM one. So the product is
     * read against the ONE rung this lesson does arithmetic with, 「墙后一步那一格的算术是
     * 1 248 / 1 170」 in `deeper`, whose own two figures are read against the two arms' goodputs
     * in the test above. Both sites are planted separately, so neither can cover for the other.
     */
    const [bits] = figs(DEEP, /墙后一步那一格的算术是 ([\d ]+) \//,
      '`deeper` on the rung behind the wall')
    expect((tones * Math.log2(qam!) * num!) / den!,
      'the rung those four figures multiply out to, which is the rung the lesson measures')
      .toBe(bits)
    expect(PHY_MODES.uhr.ndbps, 'and the ladder really has it').toContain(bits)
  })

  it('reads both fixed-point arms, and the condition `deeper` puts on one of them', () => {
    // 「把两层起伏都关掉，同一格的差是 39.040 对 29.280 Mb/s，正好等于…624 / 468」
    const g3 = raw(PIC,
      /同一格的差是 ([\d.]+) 对 ([\d.]+) Mb\/s，正好等于两档每符号（symbol）数据比特数之比 (\d+) \/ (\d+)/,
      'gate three on the fixed-point arm')
    same(g3[0]!, off('uhr', 'far'), 'the finer ladder with no fading at all')
    same(g3[1]!, off('eht', 'far'), 'and the coarser one')
    const [seedsCn, lengthsCn] = raw(PIC, /而(.)个种子、(.)种跑长给出同一个比值/,
      'gate three on what it holds over')
    // 「624 / 468 = 1.3333；实测 39.040 / 29.280 = 1.3333」
    const f = L.numbers!.find((b) => b.kind === 'formula')! as unknown as { text: string; note: string }
    const line = raw(f.text, /(\d+) \/ (\d+) = ([\d.]+)；实测 ([\d.]+) \/ ([\d.]+) = ([\d.]+)/,
      'the formula line')
    expect([line[0], line[1]], 'the same two rungs as the gate').toEqual([g3[2], g3[3]])
    expect([line[3], line[4]], 'and the same two goodputs').toEqual([g3[0], g3[1]])
    expect(line[5], 'one ratio, printed twice').toBe(line[2])
    same(line[2]!, val(line[0]!) / val(line[1]!), 'the ladder’s own arithmetic')
    same(line[5]!, off('uhr', 'far') / off('eht', 'far'), 'and the ratio the two runs really give')
    // 「种子 1、2、7、17、99 五个种子，300 毫秒与 600 毫秒两种跑长，十个组合给出同一个比值」
    const note = raw(f.note,
      /种子 (\d+)、(\d+)、(\d+)、(\d+)、(\d+) (.)个种子，(\d+) 毫秒与 (\d+) 毫秒(.)种跑长，(.)个组合给出同一个比值/,
      'the note on the seeds and the lengths')
    const seeds = note.slice(0, 5).map(val)
    expect(cn(note[5]!), 'the seeds it names').toBe(seeds.length)
    expect([cn(note[5]!), cn(note[8]!)], 'the same two counts the gate gives')
      .toEqual([cn(seedsCn!), cn(lengthsCn!)])
    const lengths = [val(note[6]!) * MS, val(note[7]!) * MS]
    expect(lengths, 'the two windows, this lesson’s own and the long one').toEqual([RUN_NS, LONG_NS])
    expect(cn(note[9]!), 'and the combinations they make').toBe(seeds.length * lengths.length)
    for (const s of seeds) {
      for (const ns of lengths) {
        const u = goodputMbps(arm('uhr', 'far', 'off', s, ns), ns)
        const e = goodputMbps(arm('eht', 'far', 'off', s, ns), ns)
        same(line[2]!, u / e, `seed ${s} at ${ns / MS} ms`)
      }
    }
    /*
     * **Exempt, and the sentence it stands in is the reason.** The five seeds 「1、2、7、17、99」
     * are the one family of figures in this lesson that no test can pin, because the claim they
     * appear in is that they do not matter: 「这一臂里没有随机性可言」. The loop above reads them
     * out of the prose and runs them, so a planted digit runs the planted seed and the ratio is
     * the same — which is not a hole in the read, it is the measurement agreeing with the
     * sentence. A test that reddened on 99 → 98 would be asserting the opposite of what the
     * lesson says.
     *
     * What IS checkable is that the roster is a roster (five distinct seeds, one of them the
     * scene the reader loads) and that the claim is not an accident of the five chosen — so
     * three seeds this FILE picks, named nowhere in the lesson, are run against the same ratio.
     */
    expect(new Set(seeds).size, 'five distinct seeds, not one seed written five times').toBe(5)
    expect(seeds, 'and one of them is the run the reader already has open')
      .toContain(L.scenario().seed)
    for (const s of [3, 23, 4242]) {
      const u = goodputMbps(arm('uhr', 'far', 'off', s), RUN_NS)
      const e = goodputMbps(arm('eht', 'far', 'off', s), RUN_NS)
      same(line[2]!, u / e, `seed ${s}, which the lesson does not name`)
    }
    /*
     * 「墙后一步那一格的算术是 1 248 / 1 170 = 1.0667，而 300 毫秒实测 +7.17 %、600 毫秒实测
     * +6.71 %」 — the arm that carries a condition, and the condition is the run length.
     */
    const d = raw(DEEP,
      /墙后一步那一格的算术是 ([\d ]+) \/ ([\d ]+) = ([\d.]+)，而 (\d+) 毫秒实测 \+([\d.]+) %、(\d+) 毫秒实测 \+([\d.]+) %/,
      '`deeper` on the near arm')
    same(d[2]!, val(d[0]!) / val(d[1]!), 'that pair’s own ratio')
    expect([val(d[3]!) * MS, val(d[5]!) * MS], 'the two windows it measures over')
      .toEqual([RUN_NS, LONG_NS])
    same(d[4]!, offGain('near', RUN_NS), 'the near arm over the short run')
    same(d[6]!, offGain('near', LONG_NS), 'and over the long one')
    // 「差的那半个百分点不是阶梯，是跑长：300 毫秒结束时最后一组聚合被切断」
    const [cut] = figs(DEEP, /是跑长：(\d+) 毫秒结束时最后一组聚合被切断/,
      '`deeper` on which of the two runs gets cut')
    expect(cut! * MS, 'the shorter window, which is this lesson’s own').toBe(RUN_NS)
    expect(cut! * MS, 'and it really is the shorter of the two it just measured').toBe(
      Math.min(val(d[3]!) * MS, val(d[5]!) * MS))
    expect(val(d[4]!), 'the shorter run is the one that overshoots').toBeGreaterThan(val(d[6]!))
    expect(val(d[4]!), 'and the arithmetic is below both').toBeGreaterThan((val(d[2]!) - 1) * 100)
    // 「客厅中段与客厅深处那两格在两种跑长下都给 +11.11 % 与 +33.33 %」
    const two = raw(DEEP, /那两格在(.)种跑长下都给 \+([\d.]+) % 与 \+([\d.]+) %/,
      '`deeper` on the other two cells')
    expect(cn(two[0]!), 'over the same two windows').toBe(2)
    for (const ns of [RUN_NS, LONG_NS]) {
      same(two[1]!, offGain('mid', ns), `the mid cell at ${ns / MS} ms`)
      same(two[2]!, offGain('far', ns), `and the deep one at ${ns / MS} ms`)
    }
  })

  it('reads the four seed tables as their own definitions, and the six cells `deeper` counts', () => {
    /*
     * 「本课那四批分别是二十个（1 加前十九个质数）、六十个（1 加前五十九个质数）、一到六十、
     * 一百二十个（1 加前一百一十九个质数）」 — four definitions, seven numerals, and the only
     * instrument that can check them is the seed table itself.
     */
    const def = raw(DEEP,
      /本课那(.)批分别是(..)个（1 加前(..)个质数）、(..)个（1 加前(...)个质数）、一到(..)、(....)个（1 加前(.....)个质数）/,
      '`deeper` on the four seed tables')
    expect(cn(def[0]!), 'the batches this lesson runs').toBe(BATCHES.length)
    // 「所以「n = 60」说的是样本的大小，不是样本本身」 — and 60 is a size two of these batches have,
    // which is the whole point of the sentence: the size does not name the table.
    const [n60] = figs(DEEP, /所以「n = (\d+)」说的是样本的大小/, '`deeper` on what n names')
    const sizesOf = BATCHES.map(([, s]) => s.length)
    expect(sizesOf.filter((s) => s === n60).length,
      'the batches that have exactly that many seeds, which is why the size is not the table')
      .toBe(2)
    const sizes = [cn(def[1]!), cn(def[3]!), cn(def[5]!), cn(def[6]!)]
    expect(sizes, 'the size of each of them').toEqual(BATCHES.map(([, s]) => s.length))
    const isPrime = (n: number): boolean => {
      if (n < 2) return false
      for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
      return true
    }
    for (const [i, primesCn] of [[0, def[2]!], [1, def[4]!], [3, def[7]!]] as [number, string][]) {
      const seeds = BATCHES[i]![1]
      expect(seeds[0], `batch ${i} opens on 1`).toBe(1)
      expect(seeds.slice(1).every(isPrime), `batch ${i}: and everything after it is prime`).toBe(true)
      expect(seeds.length - 1, `batch ${i}: and there are that many primes`).toBe(cn(primesCn))
    }
    // 「一到六十」 is the one batch that is not primes at all
    expect(BATCHES[2]![1], 'the run of consecutive seeds')
      .toEqual(Array.from({ length: cn(def[5]!) }, (_, i) => i + 1))
    /*
     * 「客厅深处两层那一格是 +7.40 % 对 +8.65 %，墙后一步只阴影那一格是 +2.10 % 对 +1.77 %，
     * 六格两两对下来没有一对相同」 — the two batches both called 「六十个」, over three cells.
     * (The lesson said 「六格里有五格不同」 until this read; no cell of the six matches its own
     * partner, so the count was the one thing in the sentence that was not true.)
     */
    const p = raw(DEEP,
      /客厅深处两层那一格是 \+([\d.]+) % 对 \+([\d.]+) %，墙后一步只阴影那一格是 \+([\d.]+) % 对 \+([\d.]+) %，(.)格两两对下来没有一对相同/,
      '`deeper` on the two sixty-seed batches')
    same(p[0]!, FAR[1]!, '`deeper`: the prime-sixty batch, deep in the living room')
    same(p[1]!, FAR[2]!, '`deeper`: and the one-to-sixty')
    same(p[2]!, NEAR[1]!, '`deeper`: the prime-sixty batch, a step behind the wall')
    same(p[3]!, NEAR[2]!, '`deeper`: and the one-to-sixty')
    const pairs: [number, number][] = [[FAR[1]!, FAR[2]!], [MID[1]!, MID[2]!], [NEAR[1]!, NEAR[2]!]]
    expect(pairs.length * 2, 'the cells the sentence counts').toBe(cn(p[4]!))
    expect(pairs.filter(([a, b]) => a.toFixed(2) === b.toFixed(2)),
      'and the pairs of them that agree, at the precision the table prints').toEqual([])
  })

  it('reads the corpus counts for the arithmetic between them, and the variant labels', () => {
    /*
     * **Exempt, class (a): the twelve corpus counts.** The TGbn corpus is read-only and outside
     * this repository, so no test here can count its comments, clauses, TBDs or contributions —
     * which is why the file above holds them with the stated-twice rule (a planted digit leaves
     * the other site behind, and that test fails). What IS readable is the arithmetic the lesson
     * states between them, and that is read here.
     */
    const tbd = raw(SRC,
      /全文 ([\d ]+) 行里 TBD 共 (\d+) 处，落在它 (\d+) 个三级小节里的 (\d+) 个，最多的一节是无缝漫游（(\d+) 处）/,
      '`sources` on the TBD count')
    const [lines, count, sections, withTbd, worst] = tbd.map(val)
    expect(withTbd, 'the sections that carry one are some of the sections').toBeLessThanOrEqual(sections!)
    expect(worst, 'the worst section carries fewer than all of them').toBeLessThan(count!)
    expect(worst! * withTbd!, 'and the worst one alone could not account for them all')
      .toBeGreaterThanOrEqual(count!)
    expect(count, 'and a document cannot hold more TBDs than it has lines').toBeLessThan(lines!)
    const cat = raw(SRC,
      /「([\d ]+) 份提案、([\d ]+) 份意见决议文稿」出自同一份语料的目录统计，这两类加上其余(..)类文稿正好是它记的 ([\d ]+) 份/,
      '`sources` on the catalogue')
    const [proposals, resolutions, total] = [val(cat[0]!), val(cat[1]!), val(cat[3]!)]
    expect(proposals + resolutions, 'the two classes are part of the whole').toBeLessThan(total)
    expect(cn(cat[2]!), 'and the classes beside them are counted').toBeGreaterThan(0)
    // the same two counts again in the terms, the other way round
    const term = raw(TERMS, /以此为题的文稿有 ([\d ]+) 份，而提案有 ([\d ]+) 份/,
      'the term on the two classes')
    expect([val(term[0]!), val(term[1]!)], 'stated the same way in both places')
      .toEqual([resolutions, proposals])
    const lb = raw(TERMS,
      /收到 ([\d ]+) 条意见，落在 ([\d ]+) 个条款上；D2\.0 那一轮（LB296）是 ([\d ]+) 条、([\d ]+) 个条款/,
      'the term on the two ballots')
    const [d1, d1Clauses, d2, d2Clauses] = lb.map(val)
    expect(d1, 'the first ballot drew more comments').toBeGreaterThan(d2!)
    expect(d1Clauses, 'on fewer clauses').toBeLessThan(d2Clauses!)
    // 「相干 5 毫秒」/「相干 500 毫秒」 and 「种子 13」/「种子 47」 — the labels, against their scenes
    let labelled = 0
    for (const v of L.variants!) {
      const c = /相干 (\d+) 毫秒/.exec(v.label)
      if (c) {
        expect(v.scenario().fading!.coherenceMs, `${v.label}: the coherence it really runs`)
          .toBe(Number(c[1]))
        expect(v.scenario().fading!.shadowSigmaDb, `${v.label}: with the shadow switched off`).toBe(0)
        labelled++
      }
      const s = /种子 (\d+)/.exec(v.label)
      if (s) {
        expect(v.scenario().seed, `${v.label}: the seed it really runs`).toBe(Number(s[1]))
        labelled++
      }
    }
    expect(labelled, 'the labels that carry a figure at all').toBe(6)
  })
})
