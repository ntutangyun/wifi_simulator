/**
 * `@edca-tamper`, in the standard-first shape (2026-11-11).
 *
 * The lesson is a deliberate demonstration of non-standard EDCA behaviour. ① gives the rules a
 * compliant station follows; ② marks each of the seven presets as `differs` — the describe on ②
 * below checks that each row describes the preset the engine really loads, and that the faithful
 * rows the cheats are measured against (the default table, the window ladder, the CTS relaying the
 * RTS Duration) are what the engine does.
 *
 * **The ladder is asserted across five seeds and the lesson's own scene is not.** A lesson scenario
 * has to be deterministic, so the lesson ships seed 7; 「这七种排成四级与一组」 is a claim about the
 * mechanism, so it is checked on seeds 7, 11, 23, 37 and 42 through `tamperScenario(cheat, { seed })`.
 * The ceiling group is never ordered — pinning `navInflate < cw < greedy` would pin a coincidence.
 *
 * Every figure the labs print is read back out of the lesson text and compared with a run. The
 * per-record proofs of the three inert cheats live in tests/engine/tamper-inert.test.ts.
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
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
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
const rounds = new Map<string, Round>()
/** The three stations' delivered frames, and the first one's share of the total. Memoised. */
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
const shareOn = (k: TamperKind | undefined, seed: number): number => 100 * round(k, seed === 7 ? undefined : seed).share

const lab = (heading: string): Lab => {
  const l = edcaTamper.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, fragment: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && (b.heading ?? '').includes(fragment))
  expect(t, `table 「${fragment}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = edcaTamper.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const grab = (s: string, re: RegExp, what: string): string[] => {
  const m = re.exec(s)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
/** 「7 343」 → 7343; 「31.4 %」 → 31.4. */
const num = (s: string): number => Number(s.replace(/[\s%,]/g, ''))
const same = (printed: string, measured: number, what: string): void => {
  const fig = printed.replace(/[\s,]/g, '')
  const dp = (fig.split('.')[1] ?? '').length
  expect(Number(fig), what).toBe(Number(measured.toFixed(dp)))
}
const STD = edcaTamper.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('edca-tamper · the lesson', () => {
  it('is in the standard-first shape, at the end of the QoS module', () => {
    expect(isStandardFirst(edcaTamper)).toBe(true)
    expect(MODULES[edcaTamper.module].title).toBe('QoS 与效率')
    expect(edcaTamper.needs).toEqual(['edca', 'edca-cost', 'collisions-cw', 'txop'])
    expect(edcaTamper.limits).toEqual([])
    expect(edcaTamper.observe).toEqual([])
    expect(edcaTamper.tryThis).toEqual([])
  })

  it('declares one variant per preset and three more, all schema-legal, every cheat on a station', () => {
    const scenes = [edcaTamper.scenario(), ...edcaTamper.variants!.map((v) => v.scenario())]
    expect(scenes.length).toBe(11)
    for (const s of scenes) expect(() => ScenarioSchema.parse(s)).not.toThrow()
    const presets = edcaTamper.variants!.slice(0, 7).map((v) => v.scenario().nodes[1].tamper)
    expect(presets).toEqual(TAMPER_KINDS.map((k) => TAMPER_PRESETS[k]))
    expect(edcaTamper.scenario().nodes[1].tamper).toBeUndefined()
    expect(edcaTamper.scenario().servers).toEqual([])
    for (const v of edcaTamper.variants!) expect(v.scenario().nodes[0].tamper).toBeUndefined()
  })

  it('① cites every clause and table it teaches, and its defaults are the engine’s table', () => {
    for (const c of ['§9.4.2.27', '§10.2.3.2', '表 9-194', '表 17-21', '表 10-1', '§10.23.2.4', '§10.23.2.2', '§10.23.2.9', '§9.2.5.2', '§9.2.5.6']) {
      expect(STD, c).toContain(c)
    }
    const aifsn = grab(STD, /AC_BK (\d+)、AC_BE (\d+)、AC_VI (\d+)、AC_VO (\d+)/, '① on the AIFSNs').map(Number)
    expect(aifsn).toEqual(EDCA_PARAMS.map((p) => p.aifsn))
    const [cmin, cmax] = grab(STD, /aCWmin = (\d+)、aCWmax = (\d+)/, '① on aCWmin').map(Number)
    expect([cmin, cmax]).toEqual([CW_MIN, CW_MAX])
    const win = grab(STD, /窗口为 (\d+)\/(\d+)、(\d+)\/(\d+)、(\d+)\/(\d+)、(\d+)\/(\d+)/, '① on the windows').map(Number)
    expect(win).toEqual(EDCA_PARAMS.flatMap((p) => [p.cwMin, p.cwMax]))
    const lim = grab(STD, /TXOP 上限为 ([\d.]+)、([\d.]+)、([\d.]+)、([\d.]+) ms/, '① on the TXOP limits')
    lim.forEach((x, i) => same(x, EDCA_PARAMS[i].txopLimitNs / MS, `TXOP limit ${EDCA_PARAMS[i].name}`))
    expect(Number(grab(STD, /AIFSN\[AC\] 不得小于 (\d+)，接入点不得小于 (\d+)/, '① on the floor')[0]))
      .toBe(Math.min(...EDCA_PARAMS.map((p) => p.aifsn)))
  })

  it('② marks every one of the seven presets as differs, and as the lesson’s deliberate demonstration', () => {
    for (const topic of ['提升优先级', '缩短静默', '窗口坍缩', '窗口不翻倍', '霸占信道', '虚报时长', '四种合在一起']) {
      const r = implRow(topic)
      expect(r.kind, topic).toBe('differs')
      expect(r.sim, topic).toContain('这是本课故意演示的篡改')
    }
    expect(implRow('参数从哪里来').kind).toBe('absent')
  })
})

describe('edca-tamper · ② says what the engine does, and the engine does it', () => {
  it('the defaults row is the engine’s table and the two PHY timings', () => {
    const r = implRow('默认参数').sim
    expect(grab(r, /AIFSN (\d+)\/(\d+)\/(\d+)\/(\d+)/, 'AIFSN').map(Number)).toEqual(EDCA_PARAMS.map((p) => p.aifsn))
    expect(grab(r, /窗口 (\d+)\/(\d+)、(\d+)\/(\d+)、(\d+)\/(\d+)、(\d+)\/(\d+)/, 'windows').map(Number))
      .toEqual(EDCA_PARAMS.flatMap((p) => [p.cwMin, p.cwMax]))
    grab(r, /TXOP 上限 ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/, 'limits')
      .forEach((x, i) => same(x, EDCA_PARAMS[i].txopLimitNs / MS, `limit ${i}`))
    const [sifs, slot] = grab(r, /SIFS (\d+) µs、时隙（slot time）(\d+) µs/, 'timings').map(Number)
    expect([sifs * 1000, slot * 1000]).toEqual([SIFS_NS, SLOT_NS])
  })

  it('a compliant station draws uniformly inside its current window', () => {
    const drawn = ofType(run(tamperScenario()), 'BACKOFF_DRAW')
    expect(drawn.length).toBeGreaterThan(500)
    for (const r of drawn) {
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThanOrEqual(r.cw)
    }
    expect(Math.min(...drawn.map((r) => r.value))).toBe(0)
    expect(Math.max(...drawn.map((r) => r.cw))).toBeGreaterThan(CW_MIN)
  })

  it('the window ladder the row prints is the formula, and the engine walks it', () => {
    const ladder = grab(implRow('失败后放宽窗口').sim, /依次为 ([\d、]+)/, 'the ladder')[0].split('、').map(Number)
    const be = EDCA_PARAMS.find((p) => p.name === 'BE')!
    expect(ladder).toEqual([0, 1, 2, 3, 4, 5, 6].map((q) => Math.min(be.cwMax, 2 ** q * (be.cwMin + 1) - 1)))
    const seen = new Set(ofType(run(tamperScenario()), 'CW_CHANGE').map((r) => r.cw))
    for (const cw of seen) expect(ladder).toContain(cw)
    expect(seen.size).toBeGreaterThan(2)
  })

  it('each preset row names the value the preset loads', () => {
    expect(Number(grab(implRow('缩短静默').sim, /AIFSN = (\d+)/, 'aifs')[0])).toBe(TAMPER_PRESETS.aifs.aifsn)
    const [c] = grab(implRow('窗口坍缩').sim, /CWmin = CWmax = (\d+)/, 'cw')
    expect([TAMPER_PRESETS.cw.cwMin, TAMPER_PRESETS.cw.cwMax]).toEqual([Number(c), Number(c)])
    expect(TAMPER_PRESETS.noDouble.noDoubling).toBe(true)
    same(grab(implRow('霸占信道').sim, /一律为 ([\d ]+) µs/, 'hog')[0], TAMPER_PRESETS.txopHog.txopLimitUs!, 'hog')
    same(grab(implRow('虚报时长').sim, /多加 ([\d ]+) µs/, 'nav')[0], TAMPER_PRESETS.navInflate.navInflateUs!, 'nav')
    expect(TAMPER_PRESETS.escalate.allAsAc).toBe(EDCA_PARAMS.find((p) => p.name === 'VO')!.ac)
    expect(TAMPER_PRESETS.greedy).toEqual({ ...TAMPER_PRESETS.escalate, ...TAMPER_PRESETS.aifs, ...TAMPER_PRESETS.cw, ...TAMPER_PRESETS.txopHog })
  })

  it('the excess row: the two values, and 「约为 AC_VI 上限的两倍」', () => {
    const r = implRow('越界的幅度').sim
    const [hog, nav] = grab(r, /([\d ]{5,}) µs 与 ([\d ]{5,}) µs/, 'the two values')
    same(hog, TAMPER_PRESETS.txopHog.txopLimitUs!, 'hog')
    same(nav, TAMPER_PRESETS.navInflate.navInflateUs!, 'nav')
    const vi = EDCA_PARAMS.find((p) => p.name === 'VI')!
    same(grab(r, /AC_VI 上限 ([\d.]+) ms/, 'VI')[0], vi.txopLimitNs / MS, 'VI limit')
    expect(Math.round(TAMPER_PRESETS.txopHog.txopLimitUs! * 1000 / vi.txopLimitNs)).toBe(2)
    expect(r).toContain('约为')
  })

  it('the inflated Duration rides on the cheater’s RTS and data frames, and the CTS copies it', () => {
    const rs = runOf(edcaTamper, V.hiddenNav, 300 * MS)
    const clean = runOf(edcaTamper, V.hiddenClean, 300 * MS)
    const ctsFor = (r: TLRecord[]) => r.filter((x): x is Extract<TLRecord, { type: 'TX_START' }> => x.type === 'TX_START' && x.frame.kind === 'cts')
    for (const cts of ctsFor(rs)) {
      const rts = rs.filter((x): x is Extract<TLRecord, { type: 'TX_START' }> => x.type === 'TX_START' && x.frame.kind === 'rts' && x.node === cts.frame.dst && x.t < cts.t).pop()!
      expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs)
    }
    // the cheater's RTS carry 3 000 µs more than the honest station's do in the clean room
    const rtsDur = (r: TLRecord[], node: string) => new Set(r.filter((x): x is Extract<TLRecord, { type: 'TX_START' }> => x.type === 'TX_START' && x.frame.kind === 'rts' && x.node === node).map((x) => x.frame.durationFieldNs))
    const cheat = [...rtsDur(rs, 'sta-1')]
    const honest = rtsDur(clean, 'sta-1')
    const pad = TAMPER_PRESETS.navInflate.navInflateUs! * 1000
    expect(cheat.length).toBeGreaterThan(0)
    for (const d of cheat) expect(d).toBeGreaterThan(pad)
    expect(Math.max(...cheat) - Math.max(...honest)).toBe(pad)
  })

  it('the placement row: a tamper on the access point is refused, and so are three presets on a DCF link', () => {
    const s = tamperScenario()
    const onAp: Scenario = { ...s, nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, tamper: TAMPER_PRESETS.cw } : n)) }
    expect(ScenarioSchema.safeParse(onAp).success).toBe(false)
    // the DCF refusals are tests/model/driver-scenario.test.ts's; the row names the same three
    const row = implRow('篡改放在哪里').sim
    for (const name of ['提升优先级', '缩短静默', '霸占信道']) expect(row).toContain(name)
  })
})

describe('edca-tamper · ③ every figure the labs print is the run', () => {
  it('lab 1: the fair room — three counts, the spread, and the collisions', () => {
    const l = lab('没有站点作弊的房间')
    const base = round(undefined)
    const [a, b, c, pts, coll] = grab(l.expect, /分别发出 ([\d ]+)、([\d ]+)、([\d ]+) 帧，各自的份额彼此相差不到 (\d+) 个百分点；两秒内共碰撞 (\d+) 次/, 'lab 1')
    expect([num(a), num(b), num(c)]).toEqual(base.tx)
    const total = base.tx.reduce((x, y) => x + y, 0)
    const shares = base.tx.map((n) => (100 * n) / total)
    const spread = Math.max(...shares) - Math.min(...shares)
    expect(spread).toBeLessThan(Number(pts))
    expect(spread, 'the tightest whole bound that holds').toBeGreaterThan(Number(pts) - 1)
    expect(Number(coll)).toBe(base.coll)
    expect(l.steps[0]).toContain('2 秒')
  })

  const BY_LABEL: Record<string, TamperKind | undefined> = {
    不作弊: undefined, 窗口不翻倍: 'noDouble', 缩短静默: 'aifs', 霸占信道: 'txopHog',
    提升优先级: 'escalate', 虚报时长: 'navInflate', 窗口坍缩: 'cw', 四种合在一起: 'greedy',
  }
  const RUNGS: readonly (TamperKind | undefined)[] = [undefined, 'noDouble', 'aifs', 'txopHog', 'escalate']
  const CEILING: readonly TamperKind[] = ['navInflate', 'cw', 'greedy']

  it('lab 2: the seed-7 table, cell by cell, in ascending order', () => {
    const t = tableOf(lab('七种篡改：四级与一组'), '七种篡改各运行两秒')
    expect(Number(grab(t.heading!, /种子 (\d+)/, 'seed')[0])).toBe(tamperScenario().seed)
    expect(t.rows).toHaveLength(8)
    for (const row of t.rows) {
      expect(row[0] in BY_LABEL, row[0]).toBe(true)
      const r = round(BY_LABEL[row[0]])
      expect(num(row[1]), `${row[0]}: share`).toBe(Number((100 * r.share).toFixed(1)))
      expect(num(row[2]), `${row[0]}: A`).toBe(r.tx[1])
      expect(num(row[3]), `${row[0]}: B`).toBe(r.tx[2])
      expect(num(row[4]), `${row[0]}: collisions`).toBe(r.coll)
    }
    const shares = t.rows.map((r) => num(r[1]))
    expect(shares).toEqual([...shares].sort((x, y) => x - y))
  })

  it('lab 2: the five-seed bands — every end is the measured min or max, and the five do not overlap', () => {
    const t = tableOf(lab('七种篡改：四级与一组'), '五个种子')
    expect(grab(t.heading!, /（([\d、]+)）/, 'seeds')[0].split('、').map(Number)).toEqual([...SEEDS])
    const band = (ks: readonly (TamperKind | undefined)[]): [number, number] => {
      const xs = ks.flatMap((k) => SEEDS.map((sd) => shareOn(k, sd)))
      return [Number(Math.min(...xs).toFixed(1)), Number(Math.max(...xs).toFixed(1))]
    }
    expect(t.rows).toHaveLength(6)
    RUNGS.forEach((k, i) => {
      const label = Object.entries(BY_LABEL).find(([, v]) => v === k)![0]
      expect(t.rows[i][0]).toBe(label)
      expect(grab(t.rows[i][1], /([\d.]+) 到 ([\d.]+) %/, label).map(Number)).toEqual(band([k]))
    })
    expect(t.rows[5][0]).toBe('虚报时长、窗口坍缩、四种合在一起')
    expect(grab(t.rows[5][1], /([\d.]+) 到 ([\d.]+) %/, 'ceiling').map(Number)).toEqual(band(CEILING))
    const bands = RUNGS.map((k) => band([k]))
    for (let i = 1; i < bands.length; i++) expect(bands[i][0]).toBeGreaterThan(bands[i - 1][1])
    // The first `it` to ask for the five-seed rounds runs all 40 of them (8 kinds × 5 seeds):
    // ~20 s alone, 52 s measured under the full suite's parallel load on 2026-11-11, which the
    // default 30 s timeout cut. The same budget as the file's other whole-sweep `it` below.
  }, 300_000)

  it.each(SEEDS)('lab 2: seed %i puts the first five in order, strictly, and the ceiling above them', (seed) => {
    const row = RUNGS.map((k) => shareOn(k, seed))
    for (let j = 1; j < row.length; j++) expect(row[j]).toBeGreaterThan(row[j - 1])
    for (const k of CEILING) expect(shareOn(k, seed)).toBeGreaterThan(row[row.length - 1])
  })

  it('lab 2: the expect line — the floor, the two lightest-by-seed, the collisions and the window collapse', () => {
    const l = lab('七种篡改：四级与一组')
    const e = l.expect
    const ceiling = CEILING.flatMap((k) => SEEDS.map((sd) => shareOn(k, sd)))
    const [floor] = grab(e, /最后三种都在 ([\d.]+) % 以上/, 'the floor')
    expect(Math.min(...ceiling)).toBeGreaterThan(Number(floor))
    expect(Math.min(...ceiling)).toBeLessThan(Number(floor) + 0.1)
    const BY_NAME: Record<string, TamperKind> = { 虚报时长: 'navInflate', 窗口坍缩: 'cw', 四种合在一起: 'greedy' }
    const lightest = (seed: number): TamperKind => [...CEILING].sort((x, y) => shareOn(x, seed) - shareOn(y, seed))[0]
    for (const [, sd, name] of e.matchAll(/种子 (\d+) 上(虚报时长|窗口坍缩|四种合在一起)最轻/g)) {
      expect([...SEEDS] as number[]).toContain(Number(sd))
      expect(lightest(Number(sd)), `seed ${sd}`).toBe(BY_NAME[name])
    }
    expect([...e.matchAll(/种子 (\d+) 上/g)].length).toBe(2)
    const [from, to] = grab(e, /窗口不翻倍使碰撞从 (\d+) 次增加到 (\d+) 次/, 'noDouble collisions')
    expect([Number(from), Number(to)]).toEqual([round(undefined).coll, round('noDouble').coll])
    const [one] = grab(e, /只剩 (\d+) 次碰撞/, 'the heaviest')
    expect([round('navInflate').coll, round('greedy').coll]).toEqual([Number(one), Number(one)])
    const [drawn, frames, others] = grab(e, /每一次都抽到 (\d+)，两秒里发出 ([\d ]+) 帧，另外两台一共 (\d+) 帧/, 'the collapse')
    const draws = ofType(run(tamperScenario('cw')), 'BACKOFF_DRAW').filter((r) => r.node === 'sta-1').map((r) => r.value)
    expect(new Set(draws)).toEqual(new Set([Number(drawn)]))
    expect(num(frames)).toBe(round('cw').tx[0])
    expect(Number(others)).toBe(round('cw').tx[1] + round('cw').tx[2])
    // the meaning's two figures
    const [pts, extra] = grab(l.meaning, /多拿到约 (\d+) 个百分点，代价是全场多出 (\d+) 次碰撞/, 'lab 2 meaning')
    expect(Number(pts)).toBe(Math.round(100 * (round('noDouble').share - round(undefined).share)))
    expect(Number(extra)).toBe(round('noDouble').coll - round(undefined).coll)
    // the jump this lab uses is the first backoff draw, and the variant it loads first is the first preset
    expect(l.jump).toBe(edcaTamper.jumps.findIndex((j) => j.label === '第一次退避抽取'))
    expect(l.more).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('lab 3: the inflated Duration, through the access point', () => {
    const l = lab('虚报时长经由接入点的 CTS 生效')
    expect(Number(grab(l.steps[0], /运行 (\d+) ms/, 'run length')[0])).toBe(300)
    const navs = (variant: number) => {
      const rs = ofType(runOf(edcaTamper, variant, 300 * MS), 'NAV_SET').filter((r) => r.node === 'sta-2')
      return { n: rs.length, max: Math.max(...rs.map((r) => r.untilNs - r.t)), sources: new Set(rs.map((r) => r.source)) }
    }
    const clean = navs(V.hiddenClean)
    const cheat = navs(V.hiddenNav)
    expect(cheat.sources).toEqual(new Set(['cts:ap']))
    expect(clean.sources).toEqual(new Set(['cts:ap']))
    const [was, now, diff] = grab(l.expect, /从不作弊时的 ([\d .]+) µs 变成 ([\d .]+) µs，恰好多出 ([\d ]+) µs/, 'lab 3')
    same(was, clean.max / 1000, 'clean max')
    same(now, cheat.max / 1000, 'cheat max')
    same(diff, (cheat.max - clean.max) / 1000, 'difference')
    expect(num(diff) * 1000).toBe(TAMPER_PRESETS.navInflate.navInflateUs! * 1000)
    const [lo, hi] = grab(l.expect, /次数从 (\d+) 次增加到 (\d+) 次/, 'lab 3 counts')
    expect([Number(lo), Number(hi)]).toEqual([clean.n, cheat.n])
  })

  it('lab 4: the game room — record counts, the one field, and the traffic behind it', () => {
    const l = lab('允许但不起作用：霸占信道遇上只打游戏的手机')
    const clean = run(cloudGameScenario())
    const hog = run(edcaTamper.variants![V.gameHog].scenario())
    const diff = clean.map((r, i) => [r, hog[i]] as const).filter(([a, b]) => JSON.stringify(a) !== JSON.stringify(b))
    const e = l.expect
    const [total, differing] = grab(e, /两边的记录条数都是 ([\d ]+)，差异记录恰好 (\d+) 条/, 'counts')
    expect([clean.length, hog.length]).toEqual([num(total), num(total)])
    expect(diff.length).toBe(Number(differing))
    expect(diff.length).toBeGreaterThan(0)
    expect([...new Set(diff.map(([a]) => a.type))]).toEqual(['TXOP_START'])
    const fields = new Set<string>()
    for (const [a, b] of diff) {
      const ra = a as unknown as Record<string, unknown>
      const rb = b as unknown as Record<string, unknown>
      for (const k of Object.keys(ra)) if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) fields.add(k)
    }
    expect([...fields]).toEqual(['untilNs'])
    const [was, now] = grab(e, /从 ([\d ]+) 纳秒变成 ([\d ]+) 纳秒/, 'the field')
    const until = (rs: TLRecord[]): number[] =>
      [...new Set(ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').map((r) => r.untilNs - r.t))]
    expect(until(clean)).toEqual([num(was)])
    expect(until(hog)).toEqual([num(now)])
    expect(num(now)).toBe(TAMPER_PRESETS.txopHog.txopLimitUs! * 1000)
    same(grab(e, /其余 ([\d ]+) 条记录逐字节相同/, 'rest')[0], clean.length - diff.length, 'identical records')
    // the traffic: packet sizes and the mean gap, measured on the room with no cloud endpoint
    const GAP_NS = 30_000 * MS
    const solo = ofType(run(cloudGameScenario({ noServers: true }), GAP_NS), 'ENQUEUE').filter((r) => r.node === 'sta-1')
    const bytes = solo.map((r) => r.bytes)
    const [lo, hi] = grab(e, /上行（uplink, UL）包 (\d+) 到 (\d+) 字节/, 'sizes')
    expect([Math.min(...bytes), Math.max(...bytes)]).toEqual([Number(lo), Number(hi)])
    const gapMs = GAP_NS / MS / solo.length
    const [gap] = grab(e, /平均每 (\d+) 毫秒一个/, 'gap')
    expect(Number(gap)).toBe(Math.round(gapMs / 10) * 10)
    expect(Number(grab(e, /(\d+) 毫秒的 TXOP 宣告出去/, 'announcement')[0]) * MS).toBe(TAMPER_PRESETS.txopHog.txopLimitUs! * 1000)
    // the quiz repeats two of these
    const q = edcaTamper.quiz![1]
    expect(Number(grab(q.options[1], /只有 (\d+) 条 TXOP 开始记录/, 'quiz')[0])).toBe(diff.length)
    expect(Number(grab(q.explain, /平均每 (\d+) 毫秒才来一个/, 'quiz gap')[0])).toBe(Math.round(gapMs / 10) * 10)
    expect(Number(grab(q.explain, /于是 (\d+) 毫秒的宣告/, 'quiz ms')[0]) * MS).toBe(TAMPER_PRESETS.txopHog.txopLimitUs! * 1000)
    // and the consequences are equal value for value
    const stats = (sc: Scenario): [number, number, number] => {
      const recs = run(sc)
      const vs = initViewState(sc)
      for (const r of recs) applyRecord(vs, r)
      return [ofType(recs, 'COLLISION').length, vs.nodes['sta-1'].stats.txOk, vs.nodes['sta-1'].stats.appRtt.sumNs]
    }
    expect(stats(edcaTamper.variants![V.gameHog].scenario())).toEqual(stats(cloudGameScenario()))
  })

  it('lab 4: not doubling the window does nothing on the same phone, at every length the lesson names', () => {
    const l = lab('允许但不起作用：霸占信道遇上只打游戏的手机')
    const [two, ten, thirty] = grab(l.expect, /在 (\d+) 秒、(\d+) 秒、(\d+) 秒三种时长上都成立/, 'the lengths').map(Number)
    // the outer two are tests/engine/tamper-inert.test.ts's own lengths
    const INERT = readFileSync(new URL('../engine/tamper-inert.test.ts', import.meta.url), 'utf8')
    const engineLengths = [...INERT.matchAll(/\['(?:gaming|voice)', (\d+)(?:_(\d+))?\]/g)].map(([, a, b]) => Number(`${a}${b ?? ''}`) / 1000)
    expect([...new Set(engineLengths)].sort((a, b) => a - b)).toEqual([two, thirty])
    expect(ten).toBeGreaterThan(two)
    expect(ten).toBeLessThan(thirty)
    const row = tableOf(l, '三种篡改不起作用的场合').rows.find((r) => r[0] === '窗口不翻倍')!
    const [zero] = grab(row[2], /合计 (\d+) 次/, 'the zero')
    for (const sec of [two, ten, thirty]) {
      const rs = run(cloudGameScenario(), sec * 1000 * MS)
      expect(rs.filter((r) => r.type === 'COLLISION' || r.type === 'ACK_TIMEOUT' || r.type === 'RETRY').length, `${sec} s`).toBe(Number(zero))
      expect(ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'sta-1' && r.cw > CW_MIN).length, `${sec} s`).toBe(Number(zero))
      if (sec === two) expect(JSON.stringify(run(cloudGameScenario({ cheat: 'noDouble' }), sec * 1000 * MS))).toBe(JSON.stringify(rs))
    }
  }, 300_000)

  it('the why’s ladder names the four rungs in the order the runs give', () => {
    const w = edcaTamper.why!
    const [r1, r2, r3, r4] = grab(w, /四级——(\S+?)、(\S+?)、(\S+?)、(\S+?)一级比一级高/, 'why ladder')
    const kinds = [r1, r2, r3, r4].map((x) => BY_LABEL[x])
    expect(kinds).toEqual(RUNGS.slice(1))
  })
})
