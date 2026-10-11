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
