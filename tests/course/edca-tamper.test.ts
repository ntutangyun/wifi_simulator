/**
 * Every empirical claim in 「篡改驱动」, measured against the lesson's own ten scenes.
 *
 * **The ladder is asserted across five seeds and the lesson's own scene is not.** That split is
 * the whole point of this file. A lesson scenario has to be deterministic — `lessonMinutes` and
 * `tests/fixtures/lesson-hashes.json` both require it — so the lesson ships seed 7 like every
 * other lesson in the course. A test is under no such constraint, and 「这七种排成一道阶梯」 is a
 * claim about the mechanism rather than about one draw, so it is checked on seeds 7, 11, 23, 37
 * and 42 through `tamperScenario(cheat, { seed })`.
 *
 * It had to be. The design document's first cut of that table was seed 7 alone and read as a
 * strict seven-way ordering; across five seeds the last three cheats land within 98.6–100.0 %
 * of the channel and their order flips between seeds. What survives is four rungs and a ceiling
 * group, and the assertion below refuses to order the ceiling group — pinning
 * `navInflate < cw < greedy` would be pinning a coincidence.
 *
 * The second half of the file is the other direction: the three places a cheat is byte-identical
 * to not cheating. The per-record proof lives in `tests/engine/tamper-inert.test.ts`; what is
 * here is the one the lesson ships as a variant, 「开黑的房间 + 霸占信道」, where every consequence
 * is equal and only the announced deadline differs.
 */
import { describe, it, expect } from 'vitest'
import { edcaTamper } from '../../src/course/tier2/edca-tamper'
import { cloudGameScenario, tamperScenario } from '../../src/course/wifiScenes'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, TAMPER_KINDS, TAMPER_PRESETS, type Scenario, type TamperKind } from '../../src/model/scenario'
import { applyRecord, initViewState } from '../../src/model/view'
import { CW_MAX, CW_MIN, EDCA_PARAMS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { readFileSync } from 'node:fs'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 2000 * MS
const SEEDS = [7, 11, 23, 37, 42] as const

/** The variant indices, named. The first seven are `TAMPER_KINDS`' own order. */
const V = {
  escalate: 0, aifs: 1, cw: 2, noDouble: 3, txopHog: 4, navInflate: 5, greedy: 6,
  hiddenClean: 7, hiddenNav: 8, gameHog: 9,
} as const

lessonShapeSuite(edcaTamper)

const run = (s: Scenario, ns: number = RUN_NS): TLRecord[] => [...new Simulation(s).runUntil(ns).records]

interface Round { tx: number[]; share: number; coll: number }

/**
 * Memoised on (cheat, seed), because two describes in this file now ask for the same forty rounds:
 * the five-seed ladder and the read-back of the bands the lesson prints from it. Measured when the
 * read-back landed — eighty two-second rounds against forty, 30 s of wall clock — and the scenario
 * builder is deterministic, so a shared answer is the same answer.
 */
const rounds = new Map<string, Round>()

/** The three stations' delivered frames, and the first one's share of the total. */
function round(cheat: TamperKind | undefined, seed?: number): Round {
  const key = `${cheat ?? 'base'}|${seed ?? 'own'}`
  const hit = rounds.get(key)
  if (hit) return hit
  const sc = tamperScenario(cheat, seed === undefined ? {} : { seed })
  const recs = run(sc)
  const vs = initViewState(sc)
  for (const r of recs) applyRecord(vs, r)
  const tx = ['sta-1', 'sta-2', 'sta-3'].map((id) => vs.nodes[id].stats.txOk)
  const out: Round = { tx, share: tx[0] / tx.reduce((a, b) => a + b, 0), coll: ofType(recs, 'COLLISION').length }
  rounds.set(key, out)
  return out
}

describe('edca-tamper · the lesson as data', () => {
  it('sits at the end of the QoS module, after everything it leans on', () => {
    expect(edcaTamper.module).toBe(7)
    expect(MODULES[edcaTamper.module].title).toBe('QoS 与效率')
    expect(edcaTamper.needs).toEqual(['edca', 'edca-cost', 'collisions-cw', 'txop'])
  })

  it('declares one variant per preset and three more, all of them schema-legal', () => {
    const scenes = [edcaTamper.scenario(), ...edcaTamper.variants!.map((v) => v.scenario())]
    expect(scenes.length).toBe(11)
    for (const s of scenes) expect(() => ScenarioSchema.parse(s)).not.toThrow()
    // the first seven variants are the seven presets, in TAMPER_KINDS' order
    const presets = edcaTamper.variants!.slice(0, 7).map((v) => v.scenario().nodes[1].tamper)
    expect(presets).toEqual(TAMPER_KINDS.map((k) => TAMPER_PRESETS[k]))
    // the base scene has no cheat and no server: see the builder for why the server list is empty
    expect(edcaTamper.scenario().nodes[1].tamper).toBeUndefined()
    for (const s of scenes) expect(s.servers.length, 'a saturated scene reaches no server').toBeLessThanOrEqual(1)
    expect(edcaTamper.scenario().servers).toEqual([])
  })

  /** The cheat lives on a station, never on the access point: `simulation.ts` drops the latter. */
  it('hangs every preset on a station, never on the access point', () => {
    for (const v of edcaTamper.variants!) {
      const s = v.scenario()
      expect(s.nodes[0].kind).toBe('ap')
      expect(s.nodes[0].tamper, 'an AP-side tamper is silently dropped by the engine').toBeUndefined()
    }
  })
})

describe('edca-tamper · the room is fair before anybody cheats', () => {
  /**
   * The control the ladder rests on. Without it a rising share could be the geometry — the
   * three stations sit at x = 3, 5 and 7, which are not the same distance from an access point
   * at (5, 1) — and the lesson's claim would be about the room rather than the cheat.
   */
  it('spreads the channel within ten points across the three stations', () => {
    const base = round(undefined)
    const total = base.tx.reduce((a, b) => a + b, 0)
    const shares = base.tx.map((n) => (100 * n) / total)
    expect(Math.max(...shares) - Math.min(...shares), `shares ${shares.map((x) => x.toFixed(1))}`)
      .toBeLessThan(10)
    expect(base.tx).toEqual([6099, 7343, 5967])
    expect(base.coll).toBe(126)
  })
})

describe('edca-tamper · four rungs and a ceiling group, across five seeds', () => {
  /** The four strict inequalities the lesson's whole conclusion rests on. */
  const RUNGS: readonly (TamperKind | undefined)[] = [undefined, 'noDouble', 'aifs', 'txopHog', 'escalate']
  const CEILING: readonly TamperKind[] = ['navInflate', 'cw', 'greedy']

  const table = new Map<string, number[]>()
  for (const k of [...RUNGS, ...CEILING]) {
    table.set(k ?? 'base', SEEDS.map((sd) => 100 * round(k, sd === 7 ? undefined : sd).share))
  }

  it.each(SEEDS)('seed %i puts the first five in order, strictly', (seed) => {
    const i = SEEDS.indexOf(seed)
    const row = RUNGS.map((k) => table.get(k ?? 'base')![i])
    for (let j = 1; j < row.length; j++) {
      expect(row[j], `${RUNGS[j]} (${row[j].toFixed(1)} %) over ${RUNGS[j - 1]} (${row[j - 1].toFixed(1)} %)`)
        .toBeGreaterThan(row[j - 1])
    }
  })

  /**
   * How much room the four inequalities have. The design document claimed every consecutive
   * pair is at least 8 points apart on every seed; measured, the tightest pair is 5.42 points
   * (seed 42, baseline 29.4 % against `noDouble` 35.3 %), so the claim is written at the
   * measurement and not at the document.
   */
  it('keeps the tightest consecutive pair above five points', () => {
    let min = Infinity
    for (let j = 1; j < RUNGS.length; j++) {
      for (let i = 0; i < SEEDS.length; i++) {
        min = Math.min(min, table.get(RUNGS[j] ?? 'base')![i] - table.get(RUNGS[j - 1] ?? 'base')![i])
      }
    }
    expect(min, `tightest consecutive gap ${min.toFixed(2)} points`).toBeGreaterThan(5)
    expect(min).toBeLessThan(8)
  })

  it('puts the ceiling group above the fifth rung and never orders it', () => {
    for (let i = 0; i < SEEDS.length; i++) {
      const fifth = table.get('escalate')![i]
      for (const k of CEILING) {
        expect(table.get(k)![i], `${k} on seed ${SEEDS[i]}`).toBeGreaterThan(fifth)
        expect(table.get(k)![i], `${k} on seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(98)
      }
    }
    // and the order inside it really does flip, which is why it is a group: on seed 7
    // navInflate is the lightest of the three, on seed 23 `cw` is.
    expect(table.get('navInflate')![0]).toBeLessThan(table.get('cw')![0])
    expect(table.get('cw')![2]).toBeLessThan(table.get('navInflate')![2])
  })

  it('prints the eight figures the lesson prints, on its own seed', () => {
    const pct = (k: TamperKind | undefined): string => (100 * round(k).share).toFixed(1)
    expect([pct(undefined), pct('noDouble'), pct('aifs'), pct('txopHog'),
      pct('escalate'), pct('navInflate'), pct('cw'), pct('greedy')])
      .toEqual(['31.4', '41.9', '51.7', '63.6', '95.6', '99.4', '99.9', '100.0'])
  })

  /** 「一台把邻居全部压住的设备不需要碰撞」: not a small share, zero frames. */
  it('leaves both compliant stations at exactly zero under the combined preset', () => {
    const g = round('greedy')
    expect(g.tx[1]).toBe(0)
    expect(g.tx[2]).toBe(0)
    expect(g.coll, 'a station nobody can interrupt does not collide').toBe(1)
  })

  /** The lightest cheat costs the room the most collisions, which is the lesson's second point. */
  it('makes the lightest cheat the one that raises collisions', () => {
    expect(round('noDouble').coll).toBeGreaterThan(round(undefined).coll)
    expect(round('noDouble').coll).toBe(151)
    expect(round('navInflate').coll).toBe(1)
  })
})

describe('edca-tamper · the inflated Duration travels through the access point', () => {
  /**
   * The claim that pins both the `model` constant and its path. `navInflateUs` is 3 000, and in
   * the hidden-node geometry the compliant station never hears the cheater at all — what holds
   * it down is the access point's own CTS, which copies the Duration out of the RTS it answers.
   * So the difference between the two rounds has to be exactly 3 000 µs, and it is, to the
   * nanosecond.
   */
  const longestCtsNav = (variant: number): { n: number; max: number } => {
    const navs = ofType(runOf(edcaTamper, variant, 300 * MS), 'NAV_SET')
      .filter((r) => r.node === 'sta-2' && r.source === 'cts:ap')
    return { n: navs.length, max: Math.max(...navs.map((r) => r.untilNs - r.t)) }
  }

  it('adds exactly 3 000 000 ns to the longest NAV the compliant station takes', () => {
    const clean = longestCtsNav(V.hiddenClean)
    const cheat = longestCtsNav(V.hiddenNav)
    expect(cheat.max - clean.max).toBe(3_000_000)
    expect(TAMPER_PRESETS.navInflate.navInflateUs! * 1000).toBe(3_000_000)
    expect(clean.max).toBe(2_383_200)
    expect(cheat.max).toBe(5_383_200)
    expect(clean.n).toBe(58)
    expect(cheat.n).toBe(116)
  })

  it('and not one NAV in either round comes from the cheater’s own frames', () => {
    for (const v of [V.hiddenClean, V.hiddenNav]) {
      const sources = new Set(ofType(runOf(edcaTamper, v, 300 * MS), 'NAV_SET').map((r) => r.source))
      expect([...sources], 'the cheater is inaudible; the AP is not').toEqual(['cts:ap'])
    }
  })
})

describe('edca-tamper · the variant where a cheat does nothing', () => {
  /**
   * 「开黑的房间 + 霸占信道」. The sharpest shape of "legal and provably inert" this slice found:
   * the record COUNT is equal, every consequence is equal, and the only thing that differs is
   * the number the cheater announces. 「差异条数 > 0」 is asserted too — without it this test
   * would also pass if nothing at all had changed, which is a different and wrong claim.
   */
  it('changes 87 announced deadlines and not one consequence', () => {
    const clean = run(cloudGameScenario())
    const hog = run(edcaTamper.variants![V.gameHog].scenario())
    expect(hog.length).toBe(clean.length)
    const diff = clean.map((r, i) => [r, hog[i]] as const)
      .filter(([a, b]) => JSON.stringify(a) !== JSON.stringify(b))
    expect(diff.length, 'an inert-cheat test that finds no difference is testing nothing')
      .toBeGreaterThan(0)
    expect(diff.length).toBe(87)
    expect([...new Set(diff.map(([a]) => a.type))]).toEqual(['TXOP_START'])
    const fields = new Set<string>()
    for (const [a, b] of diff) {
      const ra = a as unknown as Record<string, unknown>
      const rb = b as unknown as Record<string, unknown>
      for (const k of Object.keys(ra)) if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) fields.add(k)
    }
    expect([...fields]).toEqual(['untilNs'])
    // the announced deadline itself: the category's own 2.528 ms against the cheat's 8 ms
    const until = (rs: TLRecord[]): number[] =>
      [...new Set(ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').map((r) => r.untilNs - r.t))]
    expect(until(clean)).toEqual([2_528_000])
    expect(until(hog)).toEqual([8_000_000])
  })

  it('and the consequences the lesson names are equal value for value', () => {
    const cleanSc = cloudGameScenario()
    const hogSc = edcaTamper.variants![V.gameHog].scenario()
    const stats = (sc: Scenario): [number, number, number] => {
      const recs = run(sc)
      const vs = initViewState(sc)
      for (const r of recs) applyRecord(vs, r)
      return [ofType(recs, 'COLLISION').length, vs.nodes['sta-1'].stats.txOk, vs.nodes['sta-1'].stats.appRtt.sumNs]
    }
    expect(stats(hogSc)).toEqual(stats(cleanSc))
  })
})

/**
 * **The lesson's own tables and sentences, read back out of the lesson.**
 *
 * This file measured the engine thoroughly and compared it to literals written HERE — including an
 * `it` titled 「prints the eight figures the lesson prints」 whose eight figures were this file's
 * own copies of them. That catches an engine change and misses a prose change: editing 63.6 to
 * 63.7 in the lesson shipped green. On 2026-10-12 a sweep found this lesson among the eighteen
 * whose test never touched its prose at all (`tests/course/prose-readback.test.ts`), and among the
 * twelve carrying hand-typed figures with no numerically-equal literal anywhere in tests/ — the
 * four maxima of the five-seed bands below.
 *
 * Both are read out of the lesson now, so the eight figures and the ten band ends have no copy on
 * this side to drift from. The figures were all exact; this is wiring, not a correction.
 */
describe('edca-tamper · the figures the lesson prints are read back out of it', () => {
  /** The label each row of the lesson's table carries, against the cheat it names. */
  const BY_LABEL: Record<string, TamperKind | undefined> = {
    不作弊: undefined, 窗口不翻倍: 'noDouble', 缩短静默: 'aifs', 霸占信道: 'txopHog',
    提升优先级: 'escalate', 虚报时长: 'navInflate', 窗口坍缩: 'cw', 四种合在一起: 'greedy',
  }

  const tableOf = (fragment: string): string[][] => {
    const b = edcaTamper.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  /** 「7 343」 → 7343; 「31.4 %」 → 31.4. */
  const cell = (s: string): number => Number(s.replace(/[\s%]/g, ''))

  it('the per-configuration table: share, both compliant counts and the collisions, cell by cell', () => {
    const rows = tableOf('七种改法各跑两秒')
    expect(rows, 'the lesson prints one row per configuration plus the honest one').toHaveLength(8)
    for (const row of rows) {
      const kind = BY_LABEL[row[0]]
      expect(row[0] in BY_LABEL, `the table names 「${row[0]}」, which this test cannot map to a cheat`)
        .toBe(true)
      const r = round(kind)
      expect(cell(row[1]), `${row[0]}: the cheater’s share`).toBe(Number((100 * r.share).toFixed(1)))
      expect(cell(row[2]), `${row[0]}: compliant A`).toBe(r.tx[1])
      expect(cell(row[3]), `${row[0]}: compliant B`).toBe(r.tx[2])
      expect(cell(row[4]), `${row[0]}: collisions in the round`).toBe(r.coll)
    }
    // the table's order is the ladder the lesson's argument climbs, so it is the order too
    expect(rows.map((r) => cell(r[1])), 'the printed shares, in the printed order, ascending')
      .toEqual([...rows.map((r) => cell(r[1]))].sort((a, b) => a - b))
  })

  it('the five-seed bands: every one of the ten ends is the measured min or max', () => {
    const text = JSON.stringify(edcaTamper.numbers)
    const m = /五个种子（([\d、]+)）一起看[^]*?不作弊 ([\d.]+) 到 ([\d.]+) %、窗口不翻倍 ([\d.]+) 到 ([\d.]+) %、缩短静默 ([\d.]+) 到 ([\d.]+) %、霸占信道 ([\d.]+) 到 ([\d.]+) %、提升优先级 ([\d.]+) 到 ([\d.]+) %。而最后三种全部落在 ([\d.]+) 到 ([\d.]+) % 之间/
      .exec(text)
    expect(m, 'the five-seed sentence is gone from `numbers`, or its shape changed').not.toBeNull()
    expect(m![1].split('、').map(Number), 'the seeds the sentence names, against SEEDS here')
      .toEqual([...SEEDS])
    const band = (kind: TamperKind | undefined): [number, number] => {
      const xs = SEEDS.map((sd) => 100 * round(kind, sd === 7 ? undefined : sd).share)
      return [Number(Math.min(...xs).toFixed(1)), Number(Math.max(...xs).toFixed(1))]
    }
    const rungs: (TamperKind | undefined)[] = [undefined, 'noDouble', 'aifs', 'txopHog', 'escalate']
    rungs.forEach((kind, i) => {
      const [lo, hi] = band(kind)
      expect([Number(m![2 + 2 * i]), Number(m![3 + 2 * i])], `the band the lesson prints for`
        + ` ${String(kind)} — measured ${lo} to ${hi}`).toEqual([lo, hi])
    })
    // the ceiling group is printed as ONE band over three cheats and five seeds
    const ceiling = (['navInflate', 'cw', 'greedy'] as const)
      .flatMap((k) => SEEDS.map((sd) => 100 * round(k, sd === 7 ? undefined : sd).share))
    expect([Number(m![12]), Number(m![13])], 'the band the lesson gives the last three together')
      .toEqual([Number(Math.min(...ceiling).toFixed(1)), Number(Math.max(...ceiling).toFixed(1))])
    // and the claim the sentence is built on: the five bands do not overlap
    const bands = rungs.map(band)
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i][0], `${String(rungs[i])}’s floor over ${String(rungs[i - 1])}’s ceiling`)
        .toBeGreaterThan(bands[i - 1][1])
    }
  })
})

/**
 * **The rest of the lesson's figures, read back out of it** — the ninety the describe above
 * leaves: everything outside the per-configuration table and the five-seed bands.
 *
 * The describe above converted the two tables a reader spends the longest on. What it left is
 * where this lesson keeps most of its numbers: the standard's own parameter values (`sources`
 * prints twenty-three of them), the NAV chain, the two inert scenes, and the three `observe`
 * lines. Those were pinned the way the rest of this file was — a measurement next to a literal
 * typed here — or not pinned at all.
 *
 * **Three instruments, and all three are the engine's own:**
 *
 *  - **`EDCA_PARAMS` answers every figure `sources` prints about the four categories.** The
 *    AIFSNs 7/3/2/2, the windows 15/1023, 15/1023, 7/15, 3/7 and the TXOP limits
 *    2.528/2.528/4.096/2.080 ms are one table in `engine/phy.ts`, read row by row — and the
 *    floor the cheat violates (「不得小于 2」) is the smallest AIFSN in it.
 *  - **the doubling formula is checked against the window ladder the engine actually walks.**
 *    「CW 应取 CWmax 与 2^QSRC × (CWmin+1) − 1 中较小的那个」 has its base, its `+1` and its `−1`
 *    parsed out of the cell, and the formula built from those three figures has to reproduce
 *    `CW_MIN`, `CW_MAX` and every value in between.
 *  - **`TAMPER_PRESETS` answers the values the cheat fills in**, so 「AIFSN = 1」, 「CWmin =
 *    CWmax = 0」, 「8 000 µs」 and 「3 000 µs」 are read off the preset the variant loads rather
 *    than off a copy of it.
 *
 * **One correction came out of writing this**, and it is in the commit beside this one: the
 * watch call-out's 「彼此差不到 7 个百分点」 is false on its own three counts — 6 099 / 7 343 /
 * 5 967 of 19 409 is 31.42 / 37.83 / 30.74 %, and the widest pair is 7.09 points apart. The
 * assertion that was watching it read `toBeLessThan(10)`, which is true of 7 and of 8 alike, so
 * no planting of that digit could ever have reddened it. It is now read back as the tightest
 * whole bound that holds.
 */
describe('edca-tamper · the ninety figures outside those two tables, read back too', () => {
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
  const PIC = blockText(edcaTamper.picture)
  const NUMS = blockText(edcaTamper.numbers)
  const SRC = blockText(edcaTamper.sources)
  const LIM = blockText(edcaTamper.limits)
  const OBS = blockText(edcaTamper.observe)
  const QUIZ = blockText(edcaTamper.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const every = (s: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...s.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((m) => m.slice(1))
  }
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** The cell at (row, col) of the lesson's nth table of `numbers`. */
  const cellAt = (n: number, row: number, col: number): string => edcaTamper.numbers!
    .filter((b): b is Extract<typeof b, { kind: 'table' }> => b.kind === 'table')[n]!.rows[row]![col]!

  it('the fair room: three counts, and the widest pair between them', () => {
    const base = round(undefined)
    const total = base.tx.reduce((a, b) => a + b, 0)
    const shares = base.tx.map((n) => (100 * n) / total)
    const spread = Math.max(...shares) - Math.min(...shares)
    // The three counts, printed twice — the watch call-out and the first observe line.
    for (const [a, b, c] of every([PIC, OBS].join('\n'), /(\d [\d]{3})、(\d [\d]{3})、(\d [\d]{3})/g,
      'the three stations’ frame counts', 2)) {
      expect([val(a!), val(b!), val(c!)], 'the three stations’ delivered frames').toEqual(base.tx)
    }
    /*
     * **The bound, read back as the tightest whole bound that holds.** 「彼此差不到 N 个百分点」
     * used to print 7, which its own three counts contradict (7.09 points between the widest
     * pair). Reading it strictly from both sides is what makes the figure a figure: the measured
     * spread has to be under the printed bound, and over the bound one below it, so the only
     * number that passes is the one the measurement gives.
     */
    const [points] = figs(PIC, /彼此差不到 (\d+) 个百分点/, 'the watch call-out on the spread')
    expect(spread, `the widest pair is ${spread.toFixed(2)} points apart`).toBeLessThan(points!)
    expect(spread, 'and the printed bound is the tightest whole one that holds').toBeGreaterThan(points! - 1)
  })

  it('the standard-rules table: what the cheat fills in, against the preset it loads', () => {
    // 「缩短静默 · AIFSN = 1」 and the floor the rule beside it states.
    const [aifsn] = figs(cellAt(0, 1, 1), /AIFSN = (\d+)/, 'the AIFSN the cheat fills in')
    expect(aifsn, 'the preset’s own AIFSN').toBe(TAMPER_PRESETS.aifs.aifsn)
    const [floor, apOnly] = figs(cellAt(0, 1, 2), /不得小于 (\d+)；(\d+) 是留给接入点的/,
      'the rule the AIFSN cheat breaks')
    expect(floor, 'the floor is the smallest AIFSN the four categories use')
      .toBe(Math.min(...EDCA_PARAMS.map((p) => p.aifsn)))
    expect(apOnly, 'and the value reserved for the access point is the one the cheat takes')
      .toBe(TAMPER_PRESETS.aifs.aifsn)
    expect(apOnly, 'which is one below the floor').toBe(floor! - 1)
    // 「窗口坍缩 · CWmin = CWmax = 0」 and the uniform draw the rule beside it states.
    const [collapsed] = figs(cellAt(0, 2, 1), /CWmin = CWmax = (\d+)/, 'the window the cheat collapses to')
    expect([TAMPER_PRESETS.cw.cwMin, TAMPER_PRESETS.cw.cwMax], 'the preset’s own pair, which is one figure printed once')
      .toEqual([collapsed, collapsed])
    const [drawFloor] = figs(cellAt(0, 2, 2), /倒数值应在 (\d+) 与当前窗口之间均匀抽取/,
      'the rule the window collapse breaks')
    const drawn = ofType(run(tamperScenario()), 'BACKOFF_DRAW')
    expect(Math.min(...drawn.map((r) => r.value)), 'the smallest value this engine ever draws')
      .toBe(drawFloor)
    // 「与当前窗口之间」: each draw against the window of ITS OWN record, not against the first one.
    for (const r of drawn) {
      expect(r.value, `a draw of ${r.value} with the window at ${r.cw}`).toBeGreaterThanOrEqual(drawFloor!)
      expect(r.value, `a draw of ${r.value} with the window at ${r.cw}`).toBeLessThanOrEqual(r.cw)
    }
    expect(Math.max(...drawn.map((r) => r.cw)), 'and the window really does move, or the bound is one value')
      .toBeGreaterThan(CW_MIN)
    /*
     * **The doubling formula, built out of the three figures printed in the cell** and checked
     * against the window ladder the engine walks: `min(CWmax, 2^QSRC x (CWmin+1) - 1)` has to
     * give `CW_MIN` at QSRC = 0 and reach `CW_MAX` and stay there.
     */
    const [base, plus, minus] = figs(cellAt(0, 3, 2), /(\d+)\^QSRC × \(CWmin\+(\d+)\) − (\d+)/,
      'the doubling formula the no-double cheat breaks')
    const cw = (q: number): number => Math.min(CW_MAX, base! ** q * (CW_MIN + plus!) - minus!)
    expect(cw(0), 'the formula at QSRC = 0 is the minimum window').toBe(CW_MIN)
    expect([1, 2, 3, 4, 5, 6].map(cw), 'and it doubles up to the maximum and stops')
      .toEqual([31, 63, 127, 255, 511, CW_MAX])
    expect(cw(7), 'the min() is what holds it there').toBe(CW_MAX)
    // 「霸占信道 · TXOP 上限 = 8 000 µs」 and 「虚报时长 · Duration 多加 3 000 µs」.
    same(raw(cellAt(0, 4, 1), /TXOP 上限 = ([\d ]+) µs/, 'the TXOP limit the cheat fills in')[0]!,
      TAMPER_PRESETS.txopHog.txopLimitUs!, 'the TXOP limit the cheat fills in')
    same(raw(cellAt(0, 5, 1), /Duration 多加 ([\d ]+) µs/, 'the inflation the cheat adds')[0]!,
      TAMPER_PRESETS.navInflate.navInflateUs!, 'the inflation the cheat adds')
  })

  it('the two out-of-bounds values, and the category limit one of them is twice', () => {
    // Printed four times between `numbers`, `sources` and `limits`, and every printing is read.
    for (const [hog, nav] of every([NUMS, SRC, LIM].join('\n'), /([\d ]{5,}) µs 与 ([\d ]{5,}) µs/g,
      'the two out-of-bounds values', 3)) {
      same(hog!, TAMPER_PRESETS.txopHog.txopLimitUs!, 'the TXOP limit the cheat fills in')
      same(nav!, TAMPER_PRESETS.navInflate.navInflateUs!, 'the inflation the cheat adds')
    }
    // The video category's own limit, in milliseconds, and the ratio the sentence draws from it.
    const vi = EDCA_PARAMS.find((p) => p.name === 'VI')!
    same(raw(NUMS, /视频那一类是 ([\d.]+) 毫秒/, 'the video category’s TXOP limit')[0]!,
      vi.txopLimitNs / MS, 'the video category’s TXOP limit')
    /*
     * **A ratio cannot pin the figure it is a ratio of** — the ledger's own rule, and the sweep
     * of 2026-10-13 caught this site on it: 8 001 µs over the video limit still rounds to two.
     * So the figure is read against the preset that sets it, and the ratio is read on top.
     */
    const [hog] = figs(NUMS, /([\d ]{5,}) µs 恰好是视频那一类上限的约两倍/, 'the sentence on the ratio')
    expect(hog, 'the value the cheat fills in').toBe(TAMPER_PRESETS.txopHog.txopLimitUs)
    expect(Math.round((hog! * 1000) / vi.txopLimitNs), 'the ratio the sentence rounds to 「约两倍」').toBe(2)
    expect(NUMS, 'and it says 「约」, because it is 1.95').toContain('约两倍')
  })

  it('the seed, read off the scene the lesson loads', () => {
    same(raw(NUMS, /七种改法各跑两秒（种子 (\d+)）/, 'the gate table’s heading')[0]!,
      tamperScenario().seed!, 'the seed the shipped scene runs on')
    // The round length the same heading names, in words, against the one every figure uses.
    expect(NUMS, 'and the length, which the heading gives in characters').toContain('各跑两秒')
    expect(RUN_NS / MS, 'two seconds').toBe(2000)
  })

  it('the ceiling group’s per-seed orderings, by seed', () => {
    const CEILING = ['navInflate', 'cw', 'greedy'] as const
    const shareOn = (k: TamperKind, seed: number): number =>
      100 * round(k, seed === 7 ? undefined : seed).share
    /** The lightest of the three on one seed, by name. */
    const lightest = (seed: number): string => CEILING
      .map((k) => [k, shareOn(k, seed)] as const)
      .sort((a, b) => a[1] - b[1])[0]![0]
    const [s1, kind1] = raw(NUMS, /种子 (\d+) 是(虚报时长|窗口坍缩|四种合在一起)最轻/, 'the first seed named')
    const [s2, kind2] = raw(NUMS, /种子 (\d+) 则是(虚报时长|窗口坍缩|四种合在一起)最轻/, 'the second')
    const BY_NAME: Record<string, string> = { 虚报时长: 'navInflate', 窗口坍缩: 'cw', 四种合在一起: 'greedy' }
    /*
     * **A seed has to be one of the five this lesson runs** — the sweep of 2026-10-13 walked
     * through two of these, because `round(k, 8)` happily simulates a seed the lesson never
     * names and the ordering it reports is just as true of it. The five are pinned against
     * `SEEDS` by the describe above, so membership is what makes a named seed checkable.
     */
    for (const sd of [s1, s2]) {
      expect([...SEEDS] as number[], `seed ${sd} is one of the five the lesson names`)
        .toContain(val(sd!))
    }
    expect(lightest(val(s1!)), `the lightest of the three on seed ${s1}`).toBe(BY_NAME[kind1!])
    expect(lightest(val(s2!)), `the lightest of the three on seed ${s2}`).toBe(BY_NAME[kind2!])
    // 「种子 37 和 42 上有两种并列在 100.0 %」: two of the three, at the printed figure, on each.
    const [s3, s4, tied] = raw(NUMS, /种子 (\d+) 和 (\d+) 上有两种并列在 ([\d.]+) %/,
      'the two seeds with a tie')
    for (const sd of [s3, s4]) {
      expect([...SEEDS] as number[], `seed ${sd} is one of the five the lesson names`)
        .toContain(val(sd!))
    }
    for (const seed of [val(s3!), val(s4!)]) {
      const at = CEILING.filter((k) => shareOn(k, seed).toFixed(1) === Number(tied).toFixed(1))
      expect(at.length, `the cheats tied at ${tied} % on seed ${seed}: ${at.join(', ')}`).toBe(2)
    }
  })

  it('the two collision claims, both of them read off the rounds', () => {
    const [from, to] = figs(NUMS, /把碰撞从 (\d+) 推到 (\d+)/, 'the collisions the lightest cheat adds')
    expect(from, 'the honest round’s collisions').toBe(round(undefined).coll)
    expect(to, 'and the no-double round’s').toBe(round('noDouble').coll)
    expect(to, 'which really is the higher of the two').toBeGreaterThan(from!)
    // The two figures the same sentence computes from the table: the points gained and the price.
    const [points] = figs(NUMS, /它多拿到的那 (\d+) 个百分点/, 'the points the lightest cheat gains')
    expect(points, 'the share it gains over the honest round, as the prose rounds it')
      .toBe(Math.round(100 * (round('noDouble').share - round(undefined).share)))
    same(raw(NUMS, /全场多出的 (\d+) 次碰撞/, 'the collisions it costs the room')[0]!, to! - from!,
      'the collisions it costs the room')
    // 「虚报时长与四种合体把碰撞打到 1 次」: both of them, at that figure.
    const [one] = figs(NUMS, /把碰撞打到 (\d+) 次/, 'the collisions the two heaviest leave')
    expect([round('navInflate').coll, round('greedy').coll], 'both of the two heaviest cheats')
      .toEqual([one, one])
  })

  it('the NAV chain: the inflation, the two durations and the two counts', () => {
    const navs = (variant: number): { n: number; max: number } => {
      const rs = ofType(runOf(edcaTamper, variant, 300 * MS), 'NAV_SET')
        .filter((r) => r.node === 'sta-2' && r.source === 'cts:ap')
      return { n: rs.length, max: Math.max(...rs.map((r) => r.untilNs - r.t)) }
    }
    const clean = navs(V.hiddenClean)
    const cheat = navs(V.hiddenNav)
    // The µs the cheater writes into the RTS, and the same figure again at the end of the step.
    const [inRts] = figs(NUMS, /持续时间字段里多写了 ([\d ]+) µs/, 'the steps on what the cheater writes')
    expect(inRts, 'the preset’s own inflation').toBe(TAMPER_PRESETS.navInflate.navInflateUs)
    const [was, now] = raw(NUMS, /本来最长 ([\d .]+) µs，现在是 ([\d .]+) µs/, 'the two NAVs the steps print')
    same(was!, clean.max / 1000, 'the longest NAV without the cheat')
    same(now!, cheat.max / 1000, 'and with it')
    same(raw(NUMS, /一微秒不差地多了 ([\d ]+)/, 'the difference the step claims')[0]!,
      (cheat.max - clean.max) / 1000, 'the difference between the two, in µs')
    const [lo, hi] = figs(NUMS, /次数从 (\d+) 次涨到 (\d+) 次/, 'the two NAV counts')
    expect([lo, hi], 'the times the compliant station is held down, either way').toEqual([clean.n, cheat.n])
    // The third observe line prints the same pair the other way round.
    const [obsNow, obsWas] = raw(OBS, /最长的一条是 ([\d .]+) µs，而不作弊那一轮同一处是 ([\d .]+) µs/,
      'the third observe line on the two NAVs')
    same(obsNow!, cheat.max / 1000, 'the longest NAV with the cheat, in `observe`')
    same(obsWas!, clean.max / 1000, 'and without it')
  })

  it('the solo round where not doubling does nothing, at all three lengths', () => {
    const [two, ten, thirty] = figs(NUMS, /这一条在 (\d+) 秒、(\d+) 秒、(\d+) 秒三种时长/,
      'the three run lengths the inert claim is checked at')
    /*
     * **Two of the three lengths are the engine test's own, and the third is argued.** The claim
     * is structural, so it holds at any length — which is why the sweep of 2026-10-13 walked
     * through all three. What is checkable: `tests/engine/tamper-inert.test.ts` runs this
     * comparison at two lengths, and the lesson's set has to contain both of them, in order.
     * **The middle one is exempt, class (c)**: it is this lesson's own addition, the length that
     * file does not run, and any value between the other two would support the sentence equally.
     */
    const INERT = readFileSync(new URL('../engine/tamper-inert.test.ts', import.meta.url), 'utf8')
    const engineLengths = [...INERT.matchAll(/\['(?:gaming|voice)', (\d+)(?:_(\d+))?\]/g)]
      .map(([, a, b]) => Number(`${a}${b ?? ''}`) / 1000)
    expect([...new Set(engineLengths)].sort((a, b) => a - b),
      'the lengths the engine test runs this at').toEqual([two, thirty])
    expect([two, ten, thirty], 'and the lesson names them in order, with its own in between')
      .toEqual([...[two, ten, thirty]].sort((a, b) => a! - b!))
    expect(ten, 'the exempt one really does sit between them').toBeGreaterThan(two!)
    expect(ten, 'from both sides').toBeLessThan(thirty!)
    const [zero] = figs(NUMS, /加起来是 (\d+) 次/, 'the reason it is inert')
    /*
     * **The zero is the reason, measured at every length the prose names.** A station that
     * neither collides nor loses an acknowledgement never doubles a window, so refusing to
     * double it cannot change anything — and that is a structural fact rather than a short
     * round's luck, which is the claim the three lengths are printed to support. The
     * byte-identity itself is `tests/engine/tamper-inert.test.ts`'s item 4, at 2 s and 30 s;
     * what is added here is the middle length, which that test does not run, and the window
     * ladder never moving at any of the three.
     */
    for (const sec of [two!, ten!, thirty!]) {
      for (const seed of [7, 23]) {
        const scene = (cheat?: TamperKind): Scenario =>
          ({ ...cloudGameScenario(cheat === undefined ? {} : { cheat }), seed })
        const rs = run(scene(), sec * 1000 * MS)
        const retried = rs.filter((r) => r.type === 'COLLISION' || r.type === 'ACK_TIMEOUT' || r.type === 'RETRY')
        expect(retried.length, `${sec} s, seed ${seed}: nothing ever asked the window to double`)
          .toBe(zero)
        expect(ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-1' && r.cw > CW_MIN).length,
          `${sec} s, seed ${seed}: and the window never left its minimum`).toBe(zero)
        // One length is compared record for record, which is the conclusion the zero implies.
        if (sec === two) {
          expect(JSON.stringify(run(scene('noDouble'), sec * 1000 * MS)),
            `${sec} s, seed ${seed}: the cheat is the same run`).toBe(JSON.stringify(rs))
        }
      }
    }
  }, 300_000)

  it('the game room: the record counts, the one field, and the traffic behind it', () => {
    const clean = run(cloudGameScenario())
    const hog = run(edcaTamper.variants![V.gameHog]!.scenario())
    const diff = clean.map((r, i) => [r, hog[i]] as const).filter(([a, b]) => JSON.stringify(a) !== JSON.stringify(b))
    const [total, differing] = figs(NUMS, /两边的记录条数都是 ([\d ]+)，差异记录恰好 (\d+) 条/,
      'the game room’s two counts')
    expect([clean.length, hog.length], 'both rounds, at the count the prose prints').toEqual([total, total])
    expect(diff.length, 'the records that differ').toBe(differing)
    const [was, now] = figs(NUMS, /截止时刻从 ([\d ]+) 纳秒变成 ([\d ]+)/, 'the one field that differs')
    const until = (rs: TLRecord[]): number[] =>
      [...new Set(ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').map((r) => r.untilNs - r.t))]
    expect(until(clean), 'the deadline the category’s own limit gives').toEqual([was])
    expect(until(hog), 'and the one the cheat announces').toEqual([now])
    /*
     * **Which category's limit that is, read off the queue rather than named.** The phone's
     * game traffic is marked AC_VI only when the router's game mode is on (`traffic.ts`'s own
     * `ac`), and this scene does not turn it on — so the deadline a reader sees is AC_BE's
     * limit. Naming VI here would have been a second figure typed on this side, and a wrong one.
     */
    const phoneAcs = new Set(ofType(clean, 'ENQUEUE')
      .filter((r) => r.node === 'sta-1' && r.ac !== undefined).map((r) => r.ac!))
    expect(phoneAcs.size, 'the phone’s frames are all one category').toBe(1)
    expect(was, 'which is that category’s own limit, out of the engine’s table')
      .toBe(EDCA_PARAMS[[...phoneAcs][0]!]!.txopLimitNs)
    expect(now, 'and the cheat’s own value, in nanoseconds')
      .toBe(TAMPER_PRESETS.txopHog.txopLimitUs! * 1000)
    same(raw(NUMS, /其余 ([\d ]+) 条记录逐字节相同/, 'the records that do not differ')[0]!,
      clean.length - diff.length, 'the records that are identical')
    /*
     * **Why it is inert: the packet sizes and how often one arrives — measured on the same scene
     * with no cloud endpoint.** The shipped room has one, and the engine gives any station with a
     * server a 64-byte application probe every quarter second; that probe is not part of the game
     * traffic the sentence is about, and it has no field distinguishing it from one. Taking the
     * endpoint away (`noServers`, the builder's own option) leaves the game stream alone, and
     * then the uplink sizes are exactly the four of the measured size mix.
     */
    const GAP_NS = 30_000 * MS
    const solo = ofType(run(cloudGameScenario({ noServers: true }), GAP_NS), 'ENQUEUE')
      .filter((r) => r.node === 'sta-1')
    const bytes = solo.map((r) => r.bytes)
    const [lo, hi] = figs(NUMS, /包 (\d+) 到 (\d+) 字节/, 'the game’s uplink packet sizes')
    expect([Math.min(...bytes), Math.max(...bytes)], 'the sizes the game stream actually sends')
      .toEqual([lo, hi])
    /*
     * **The gap is read to the nearest ten milliseconds, which is the precision it is printed
     * at.** The gap distribution is the measured histogram `traffic.ts` draws from, and it has a
     * long tail (one draw in a hundred lands between 200 and 320 ms), so its own mean is 29.85 ms
     * and a thirty-second sample of it gives 31.1. The lesson prints 30, and what is checkable
     * about that is the ten it rounds to — plus that the sample is nowhere near either neighbour.
     */
    const gapMs = GAP_NS / MS / solo.length
    const [printedGap] = figs(NUMS, /平均每 (\d+) 毫秒一个/, 'how often one arrives')
    expect(printedGap, 'the mean gap, to the nearest ten milliseconds').toBe(Math.round(gapMs / 10) * 10)
    expect(gapMs, `the measured mean gap is ${gapMs.toFixed(1)} ms`).toBeGreaterThan(printedGap! - 5)
    expect(gapMs, 'and inside the ten it is printed at').toBeLessThan(printedGap! + 5)
    // The quiz prints two of these three again, and the announcement in milliseconds.
    same(raw(QUIZ, /只有 (\d+) 条传输机会记录/, 'the quiz on the differing records')[0]!, diff.length,
      'the differing records, in the quiz')
    expect(figs(QUIZ, /平均每 (\d+) 毫秒才来一个/, 'the quiz on the packet gap')[0],
      'the mean gap in the quiz, to the same nearest ten').toBe(Math.round(gapMs / 10) * 10)
    // The announcement in milliseconds, printed once in each of three sections.
    for (const [text, re] of [
      [NUMS, /于是一个 (\d+) 毫秒的传输机会宣告/],
      [QUIZ, /于是 (\d+) 毫秒的宣告/],
      [OBS, /它们在这 (\d+) 毫秒里/],
    ] as const) {
      expect(figs(text, re, 'the announcement, in milliseconds')[0]! * MS,
        'the cheat’s announcement, in milliseconds').toBe(TAMPER_PRESETS.txopHog.txopLimitUs! * 1000)
    }
  })

  it('`sources`: the four categories’ own row, out of the engine’s table', () => {
    const [bk, be, vi, vo] = figs(SRC, /默认 AIFSN（(\d+)\/(\d+)\/(\d+)\/(\d+)）/, '`sources` on the four AIFSNs')
    expect([bk, be, vi, vo], 'the four AIFSNs, in the table’s own order')
      .toEqual(EDCA_PARAMS.map((p) => p.aifsn))
    const windows = figs(SRC, /CWmax（(\d+)\/(\d+)、(\d+)\/(\d+)、(\d+)\/(\d+)、(\d+)\/(\d+)）/,
      '`sources` on the four windows')
    expect(windows, 'the four (CWmin, CWmax) pairs')
      .toEqual(EDCA_PARAMS.flatMap((p) => [p.cwMin, p.cwMax]))
    expect([windows[0], windows[1]], 'and the first pair is this engine’s own two constants')
      .toEqual([CW_MIN, CW_MAX])
    const limits = raw(SRC, /传输机会上限（([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) 毫秒）/,
      '`sources` on the four TXOP limits')
    limits.forEach((printed, i) => {
      same(printed, EDCA_PARAMS[i]!.txopLimitNs / MS, `the TXOP limit of AC ${EDCA_PARAMS[i]!.name}`)
    })
    // The two PHY timings the same sentence cites: the two terms of its own AIFS formula.
    const [sifs, slot] = figs(SRC, /(\d+) µs 与 (\d+) µs 取自/, '`sources` on the two timings')
    expect(sifs! * 1000, 'the short interframe space').toBe(SIFS_NS)
    expect(slot! * 1000, 'and the slot').toBe(SLOT_NS)
    // The AIFSN floor and the doubling formula, cited a second time in `sources`.
    expect(figs(SRC, /AIFSN 下限 (\d+) 见/, '`sources` on the AIFSN floor')[0],
      'the floor, out of the engine’s table').toBe(Math.min(...EDCA_PARAMS.map((p) => p.aifsn)))
    /*
     * **The base needs a QSRC where the `min()` does not saturate.** At QSRC = 0 any base gives
     * `CW_MIN`, and at QSRC = 6 any base ≥ 2 gives `CW_MAX` — so those two checks, which is what
     * stood here, are true of a planted 3. The sweep of 2026-10-13 caught it. The ladder in
     * between is what the base decides.
     */
    const [base, plus, minus] = figs(SRC, /min\(CWmax, (\d+)\^QSRC × \(CWmin\+(\d+)\) − (\d+)\)/,
      '`sources` on the doubling formula')
    const ladder = (q: number): number => Math.min(CW_MAX, base! ** q * (CW_MIN + plus!) - minus!)
    expect(ladder(0), 'the formula at QSRC = 0').toBe(CW_MIN)
    expect([1, 2, 3, 4, 5, 6].map(ladder), 'and the ladder it climbs between the two bounds')
      .toEqual([31, 63, 127, 255, 511, CW_MAX])
  })

  it('the window collapse, as the second observe line shows it', () => {
    const [drawn, frames, others] = figs(OBS, /色块都写着 (\d+)，两秒里它发了 ([\d ]+) 帧，另外两台一共 (\d+) 帧/,
      'the second observe line on the window collapse')
    const rs = run(tamperScenario('cw'))
    const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === 'sta-1').map((r) => r.value)
    expect(new Set(draws), 'every value the cheater draws').toEqual(new Set([drawn]))
    const r = round('cw')
    expect(frames, 'the frames the cheater gets out in two seconds').toBe(r.tx[0])
    expect(others, 'and the two compliant stations together').toBe(r.tx[1]! + r.tx[2]!)
  })

  it('the hogged TXOP, as the third observe line shows it, against the category’s limit', () => {
    const [announced, allowed] = figs(OBS, /截止时刻写的是 ([\d ]+) µs，而标准给这一类的上限是 ([\d ]+) µs/,
      'the observe line on the two deadlines')
    expect(announced, 'the deadline the cheat announces').toBe(TAMPER_PRESETS.txopHog.txopLimitUs)
    // Which category: the one the saturated stations' frames are queued into, not a named guess.
    const rs = run(tamperScenario('txopHog'))
    const acs = new Set(ofType(rs, 'ENQUEUE')
      .filter((r) => r.node === 'sta-1' && r.ac !== undefined).map((r) => r.ac!))
    expect(acs.size, 'the cheater’s frames are all one category').toBe(1)
    const ac = EDCA_PARAMS[[...acs][0]!]!
    expect(allowed! * 1000, `the limit of AC ${ac.name}, which is where its frames sit`)
      .toBe(ac.txopLimitNs)
  })

  it('`limits` and the quiz: the share that moves with the chosen excess, and the ceiling', () => {
    same(raw(LIM, /的份额就不是 ([\d.]+) %/, '`limits` on the share the excess decides')[0]!,
      100 * round('txopHog').share, 'the TXOP-hog share, which moves with the chosen excess')
    // The quiz's own floor for the ceiling group, over all three cheats and all five seeds.
    const [floor] = figs(QUIZ, /最后三种都在 ([\d.]+) % 以上/, 'the quiz on the ceiling group’s floor')
    const ceiling = (['navInflate', 'cw', 'greedy'] as const)
      .flatMap((k) => SEEDS.map((sd) => 100 * round(k, sd === 7 ? undefined : sd).share))
    /*
     * **A floor is an inequality, so it is read strictly from both sides** — and that is what
     * caught it. The quiz used to print 98.6 %, which is the rounded value of the lowest of the
     * fifteen shares (98.5836) and therefore NOT a floor they are all above: the lowest one is
     * 0.016 points under it. The assertion watching that sentence read `toBeGreaterThanOrEqual(98)`
     * in the ladder test above, which is true of 98.5 and 98.6 alike. Printing the tightest tenth
     * that really is a floor makes the figure checkable: the measured minimum has to be over the
     * printed bound and under the next tenth, so only one number passes.
     */
    expect(Math.min(...ceiling), 'the printed bound really is a floor the group is above')
      .toBeGreaterThan(floor!)
    expect(Math.min(...ceiling), 'and it is the tightest tenth that is')
      .toBeLessThan(floor! + 0.1)
    // The two figures the third quiz repeats from 「两处要单独说的」.
    same(raw(QUIZ, /多拿到了约 (\d+) 个百分点/, 'the quiz on the points gained')[0]!,
      100 * (round('noDouble').share - round(undefined).share), 'the points gained, as the quiz rounds them')
    same(raw(QUIZ, /全场多出 (\d+) 次碰撞/, 'the quiz on the collisions')[0]!,
      round('noDouble').coll - round(undefined).coll, 'the collisions it costs the room')
  })
})
