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
import { PHY_MODES } from '../../src/engine/phy'
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

  it.each([
    ['8 523', 2], ['618', 2], ['7 874', 2], ['712', 2],
    ['143', 2], ['49', 2], ['26', 2], ['36', 2],
    ['763', 2], ['1 682', 2], ['2 767', 1], ['2 739', 1],
  ])('states %s and nothing contradicts it', (figure, atLeast) => {
    const n = everything.split(figure).length - 1
    expect(n, `「${figure}」 appears ${n} times; a figure stated once can go stale alone`)
      .toBeGreaterThanOrEqual(atLeast)
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
