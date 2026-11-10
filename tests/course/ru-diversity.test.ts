/**
 * `@ru-diversity`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 §27.3.2.2 with Tables 27-7 to 27-9, §27.1.1, §27.5.1 and
 * IEEE Std 802.11be-2024 §36.3.2.2 and §9.4.1.75; ② says what `selMemberBins` / `selCombine`
 * (src/engine/selectivity.ts, channel.ts) and `buildMuParts` (mac.ts) do, and the rows that name
 * a number are pinned against those functions; ③'s figures are read back out of the lesson text
 * and compared with runs of the lesson's two variants (150 ms for the log lab, 1000 ms for the
 * gate) and, for the window lab, of the same scene with both televisions moved one metre.
 *
 * **The grouping rule is fixed before any rate is read**: downlink data receptions a television
 * was addressed in, grouped by raw measured margin, largest group, naming nothing — so the
 * comparison cannot be steered by choosing the group. The engine-side gate for the same pair is
 * tests/engine/selectivity-round.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { DF_EHT_KHZ, RU26_PER_20MHZ, RU26_TONES, selBinWidthMhz, selBins, selMemberBins } from '../../src/engine/selectivity'
import { WALL_LOSS_DB, buildLinkTable } from '../../src/engine/propagation'
import type { FadingCfg } from '../../src/engine/fading'
import { Simulation } from '../../src/engine/simulation'
import { fmtRecord } from '../../src/ui/format'
import { ruDiversityScenario } from '../../src/course/wifiScenes'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { selRowDecoded, selRows } from '../engine/selectivity-pairing'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The lesson's own reading length, and the one the hash fixture records. */
const RUN_NS = 150 * MS
/** The length the gate is measured over, stated in the lesson beside it. */
const GATE_NS = 1000 * MS
/**
 * The window lab's run length. 2026-11-11 (W7a): re-measured after the DL MU acknowledgement
 * moved to HE TB PPDUs (§10.3.2.13.2). The reversal now sits two metres out (margin 1.310 dB) and
 * the 1000 ms whole-channel leg there holds fewer than the hundred receptions this lab demands,
 * so every row of the window is run for 2000 ms.
 */
const WINDOW_NS = 2000 * MS

const lesson = LESSONS.find((l) => l.id === 'ru-diversity')!
const SPLIT = undefined
const WHOLE = 1
const RAYLEIGH: FadingCfg = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' }

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const pct = (x: number): string => `${(x * 100).toFixed(2)} %`
const db3 = (x: number): string => `${x.toFixed(3)} dB`

const runs = new Map<string, TLRecord[]>()
const runScene = (key: string, sc: Scenario, ns = GATE_NS): TLRecord[] => {
  const hit = runs.get(key)
  if (hit) return hit
  const rs = [...new Simulation(sc).runUntil(ns).records]
  runs.set(key, rs)
  return rs
}

interface Row { margin: number; meanSinrDb: number; threshDb: number; lossDb: number; worstBinDb: number; bins: number; ruFraction: number | undefined; failed: boolean }
const dlRows = (rs: TLRecord[]): Row[] => selRows(rs)
  .filter((x) => x.frame.kind === 'data' && x.sel.from === 'ap' && (x.part !== undefined || x.frame.dst === x.sel.node))
  .map((x) => ({
    margin: x.sel.meanSinrDb - x.sel.threshDb,
    meanSinrDb: x.sel.meanSinrDb,
    threshDb: x.sel.threshDb,
    lossDb: x.sel.lossDb,
    worstBinDb: x.sel.worstBinDb,
    bins: x.sel.bins,
    ruFraction: x.sel.ruFraction,
    failed: !selRowDecoded(rs, x),
  }))
const largestMarginGroup = (rows: Row[]): Row[] => {
  const groups = new Map<number, Row[]>()
  for (const r of rows) groups.set(r.margin, [...(groups.get(r.margin) ?? []), r])
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
}
const dropRate = (xs: Row[]): number => xs.filter((x) => x.failed).length / xs.length

interface Legs { on: Row[]; offAll: Row[]; group: Row[]; key: number; half: Row[]; whole: Row[] }
const legsOf = (on: Row[], offAll: Row[]): Legs => {
  const group = largestMarginGroup(on)
  const key = group[0]!.margin
  return { on, offAll, group, key, half: group.filter((r) => r.ruFraction !== undefined), whole: offAll.filter((r) => r.margin === key) }
}
let legsMemo: Legs | undefined
const legs = (): Legs => (legsMemo ??= legsOf(dlRows(runOf(lesson, SPLIT, GATE_NS)), dlRows(runOf(lesson, WHOLE, GATE_NS))))

const lab = (heading: string): Lab => {
  const l = lesson.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = lesson.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => lesson.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(lesson, { runNs: RUN_NS })

describe('ru-diversity · the lesson', () => {
  it('is standard-first, follows `ofdma-dl`, and precedes `ofdma-ul`', () => {
    expect(isStandardFirst(lesson)).toBe(true)
    expect(MODULES[lesson.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(lesson.needs).toEqual(['ofdma-dl', 'selectivity'])
    const i = COURSE_ORDER.indexOf('ru-diversity')
    expect(COURSE_ORDER[i - 1]).toBe('ofdma-dl')
    expect(COURSE_ORDER[i + 1]).toBe('ofdma-ul')
    expect(lesson.limits).toEqual([])
    expect(lesson.observe).toEqual([])
    expect(lesson.tryThis).toEqual([])
  })

  it('ships the two legs as its own variants', () => {
    expect(lesson.scenario()).toEqual(ruDiversityScenario())
    expect(lesson.variants!.map((v) => v.scenario())).toEqual([ruDiversityScenario(true), ruDiversityScenario(false)])
  })

  it('① states the tone tables as the standard prints them, and nothing of the simulator', () => {
    const std = stdText()
    for (const c of ['§27.3.2.2', '表 27-7', '表 27-8', '表 27-9', '§27.1.1', '§27.5.1', '§36.3.2.2', '§9.4.1.75', '§27.3.11.8.1']) expect(std, c).toContain(c)
    for (const sim of ['本仿真器', '引擎', '格']) expect(std).not.toContain(sim)
    // Table 27-8: the two 106-tone RUs and the middle 26-tone RU 5, which neither covers
    const ru106 = [[-122, -17], [17, 122]]
    const ru5 = [[-16, -4], [4, 16]]
    for (const [a, b] of ru5) for (const [lo, hi] of ru106) expect(b < lo || a > hi).toBe(true)
    expect(std).toContain('两个 106 音调资源单元占子载波 −122 至 −17 与 17 至 122，中间的 RU 5（−16 至 −4、4 至 16）不在其中')
    // Table 27-9: four 106-tone RUs cover 26-tone RUs 1–4, 6–9, 10–13, 15–18 — not 5 and 14
    const ru26at40 = [[-243, -218], [-217, -192], [-189, -164], [-163, -138], [-136, -111], [-109, -84], [-83, -58], [-55, -30], [-29, -4],
      [4, 29], [30, 55], [58, 83], [84, 109], [111, 136], [138, 163], [164, 189], [192, 217], [218, 243]]
    const ru106at40 = [[-243, -138], [-109, -4], [4, 109], [138, 243]]
    const out = ru26at40.map((r, i) => [i + 1, r] as const)
      .filter(([, [a, b]]) => !ru106at40.some(([lo, hi]) => a >= lo && b <= hi)).map(([i]) => i)
    expect(out).toEqual([5, 14])
    expect(std).toContain('26 音调的 RU 5 与 RU 14 不在其中')
    expect(std).toContain(`十八个 26 音调资源单元；四个 106 音调资源单元覆盖其中十六个`)
    // the HE subcarrier spacing and one 26-tone RU's width
    expect(DF_EHT_KHZ).toBe(312.5 / 4)
    expect(RU26_TONES * DF_EHT_KHZ / 1000).toBe(selBinWidthMhz())
    expect(std).toContain(`即 ${DF_EHT_KHZ} kHz；一个 26 音调资源单元宽 26 × ${DF_EHT_KHZ} kHz = ${selBinWidthMhz()} MHz`)
    expect(std).toContain('20 MHz 共九块')
    expect(RU26_PER_20MHZ).toBe(9)
  })

  it('② is not all faithful, and the rows that carry a number carry the engine’s', () => {
    const kinds = new Set(lesson.implementation!.map((r) => r.kind))
    expect(kinds.has('faithful')).toBe(false)
    for (const k of ['choice', 'differs', 'absent'] as const) expect(kinds.has(k), k).toBe(true)
    expect(implRow('格').sim).toContain(`20 MHz ${selBins(20)} 格，40 MHz ${selBins(40)} 格`)
    expect(implRow('成员的格数').sim).toContain(`20 MHz 两个成员各 ${selMemberBins(20, 1 / 2)} 格，40 MHz 四个成员各 ${selMemberBins(40, 1 / 4)} 格`)
    expect(selMemberBins(20, 1 / 2)).toBe(4) // one 106-tone RU covers four 26-tone positions
    expect(selMemberBins(40, 1 / 4)).toBe(4)
    expect(implRow('剩下的格').sim).toContain(`20 MHz 两个成员时剩下 ${selBins(20) - 2 * selMemberBins(20, 1 / 2)} 格，40 MHz 四个成员时剩下 ${selBins(40) - 4 * selMemberBins(40, 1 / 4)} 格`)
  })
})

describe('ru-diversity · ③ every figure the labs print is the run', () => {
  it('lab 1: the log line of a member reception, and the window of 150 ms', () => {
    const rs = runOf(lesson, SPLIT, RUN_NS)
    const sels = ofType(rs, 'WIFI_SEL')
    const spans = new Set(sels.filter((r) => r.ruFraction !== undefined).map((r) => /\(loss [^)]*over (.*)\)$/.exec(fmtRecord(r))![1]!))
    const half = selMemberBins(20, 1 / 2), full = selBins(20)
    expect(spans).toEqual(new Set([`bins 0–${half - 1} of ${full}, its 1/2 of the channel`, `bins ${half}–${2 * half - 1} of ${full}, its 1/2 of the channel`]))
    const l = lab('一条带份额的合成记录')
    expect(l.expect).toContain(`over bins 0–${half - 1} of ${full}, its 1/2 of the channel，另一台是 bins ${half}–${2 * half - 1} of ${full}`)
    expect(l.expect).toContain(`第 ${full - 1} 格（格号从 0 开始）两台都没有分到`)
    const whole = sels.filter((r) => r.ruFraction === undefined)
    // 2026-11-11 (W7a): the members' BlockAcks now come back in HE TB PPDUs (§26.5.2.3.4) and every
    // reception of one is a selectivity record of its own; the split is read off the run.
    const rows = selRows(rs)
    const memberRows = rows.filter((x) => x.sel.ruFraction !== undefined)
    const suRows = rows.filter((x) => x.sel.ruFraction === undefined && x.frame.kind === 'data')
    const baRows = rows.filter((x) => x.sel.ruFraction === undefined && x.frame.kind === 'ba')
    expect(memberRows.every((x) => x.frame.kind === 'data' && x.frame.muParts !== undefined && x.sel.from === 'ap')).toBe(true)
    expect(suRows.every((x) => x.frame.muParts === undefined && x.sel.from === 'ap')).toBe(true)
    expect(memberRows.length + suRows.length + baRows.length).toBe(sels.length)
    expect(l.expect).toContain(`${RUN_NS / MS} ms 内的合成记录共 ${sels.length} 条：两台电视接收多用户（multi-user, MU）发送的 ${memberRows.length} 条都带份额；整条信道的（over ${full} bins）有 ${whole.length} 条，其中 ${suRows.length} 条是接入点发给一台电视的单用户帧，${baRows.length} 条是块确认的接收`)
    // ② 「块确认的接收」: a BlockAck in an HE TB PPDU sits on half the channel, and is combined over all nine bins
    expect(implRow('块确认的接收').kind).toBe('differs')
    for (const x of baRows) {
      expect(x.frame.ru?.fraction).toBe(1 / 2)
      expect(x.sel.bins).toBe(full)
    }
    expect(implRow('块确认的接收').sim).toContain(`按整条信道的${'九'}格计算，没有只读它们自己的${'四'}格`)
    expect(fmtRecord(whole[0])).toContain(`over ${full} bins`)
    const member = sels.find((r) => r.ruFraction !== undefined)!
    for (const w of ['mean', 'worst bin', 'effective']) expect(fmtRecord(member)).toContain(w)
    expect(fmtRecord(member).indexOf('selectivity')).toBe(`${member.node} ⇠ ap `.length)
    expect(rs.find(lesson.jumps[1].find)).toBe(member)
  })

  it('lab 2: one measured margin, two legs, the drop rates and their denominators', () => {
    const { on, offAll, group, key, half, whole } = legs()
    const l = lab('同一个余量，两种配置')
    const rows = tableOf(l, '同一个余量组里的两种配置（1000 ms）').rows
    expect(rows).toEqual([
      ['两台电视编在同一次下行发送里', String(selMemberBins(20, 1 / 2)), `${half.length} 条中 ${half.filter((x) => x.failed).length} 条`, pct(dropRate(half))],
      ['同一台电视，关闭 OFDMA', String(selBins(20)), `${whole.length} 条中 ${whole.filter((x) => x.failed).length} 条`, pct(dropRate(whole))],
    ])
    expect(new Set(half.map((r) => r.bins))).toEqual(new Set([selMemberBins(20, 1 / 2)]))
    expect(new Set(whole.map((r) => r.bins))).toEqual(new Set([selBins(20)]))
    expect(dropRate(whole)).toBeGreaterThan(0)
    expect(dropRate(half)).toBeGreaterThan(dropRate(whole))
    expect(l.expect).toContain(`这一组的余量是 ${db3(key)}，包含开 OFDMA 时 ${on.length} 条下行（downlink, DL）接收中的 ${group.length} 条、关 OFDMA 时 ${offAll.length} 条中的 ${whole.length} 条`)
    expect(l.expect).toContain(`读四格时丢帧率 ${pct(dropRate(half))}，读九格时 ${pct(dropRate(whole))}`)
    expect(lesson.why).toContain(`余量只有 ${db3(key)} 的链路`)
    expect(lesson.why).toContain(`丢帧率是 ${pct(dropRate(half))}`)
    expect(lesson.why).toContain(`读整条九格时是 ${pct(dropRate(whole))}`)
    // the excluded receptions are float noise, not a second working point
    for (const m of new Set(on.map((r) => r.margin))) expect(Math.abs(m - key)).toBeLessThan(1e-13)

    // the scene: equal links at about −81 dBm behind two 12 dB brick walls, every frame at MCS 0
    const sc = lesson.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    expect(links.get('ap')!.get('sta-1')).toBe(links.get('ap')!.get('sta-2'))
    expect(Math.round(links.get('ap')!.get('sta-1')!)).toBe(-81)
    expect(l.expect).toContain('到达电平约 −81 dBm')
    expect(WALL_LOSS_DB.brick).toBe(12)
    expect(sc.walls.filter((w) => w.x1 === w.x2 && (w.x1 === 6 || w.x1 === 11)).length).toBe(2)
    const dl = ofType(runOf(lesson, SPLIT, GATE_NS), 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.src === 'ap')
    expect(new Set(dl.map((r) => r.frame.mcs))).toEqual(new Set([0]))
  })

  it('lab 3: the tail moves and the average does not', () => {
    const { half, whole } = legs()
    const h = half.map((r) => r.lossDb), w = whole.map((r) => r.lossDb)
    const better = (xs: number[]) => xs.filter((x) => x <= 0).length
    const share = (n: number, of: number) => `${(n / of * 100).toFixed(1)} %`
    const rows = tableOf(lab('变的是尾部，不是平均值'), '同一组接收的损失').rows
    expect(rows).toEqual([
      ['平均', db3(mean(w)), db3(mean(h))],
      ['中位数', db3(q(w, 0.5)), db3(q(h, 0.5))],
      ['第九十百分位', db3(q(w, 0.9)), db3(q(h, 0.9))],
      ['最深的一条', db3(Math.max(...w)), db3(Math.max(...h))],
      ['合成后比均值还好的接收', `${whole.length} 条中 ${better(w)} 条（${share(better(w), whole.length)}）`, `${half.length} 条中 ${better(h)} 条（${share(better(h), half.length)}）`],
      ['最深一格比均值低（中位数）', db3(-q(whole.map((r) => r.worstBinDb), 0.5)), db3(-q(half.map((r) => r.worstBinDb), 0.5))],
    ])
    // what the expect line says about them. 2026-11-11 (W7a): the means now differ by 0.086 dB; the
    // claim is restated as that figure against the p90 gap, both printed and both read back here.
    // 2026-11-11 (W7b, the AP on dot11QAPEDCATable): 0.233 dB against a 1.428 dB p90 gap — about a
    // sixth, no longer under a tenth, so the sentence says 「约为……的六分之一」 and this checks it.
    // 2026-11-11 (W6 merge: standard TXTIME, TRS TB PPDUs with PE): 0.098 dB against a 1.128 dB p90
    // gap — under a tenth again, so the sentence says 「不到……的十分之一」 and this checks it.
    const e = /平均损失只差 ([\d.]+) dB，不到第九十百分位差距（([\d.]+) dB）的十分之一/.exec(lab('变的是尾部，不是平均值').expect)!
    expect(e[1]).toBe(Math.abs(mean(h) - mean(w)).toFixed(3))
    expect(e[2]).toBe((q(h, 0.9) - q(w, 0.9)).toFixed(3))
    expect(Math.abs(mean(h) - mean(w))).toBeLessThan((q(h, 0.9) - q(w, 0.9)) / 10)
    expect(q(h, 0.5)).toBeLessThan(q(w, 0.5))
    expect(q(h, 0.9)).toBeGreaterThan(q(w, 0.9))
    expect(Math.max(...h)).toBeGreaterThan(Math.max(...w))
    expect(q(half.map((r) => r.worstBinDb), 0.5)).toBeGreaterThan(q(whole.map((r) => r.worstBinDb), 0.5))
  })

  it('lab 4: one metre in, one and two metres out, and the direction reverses at two', () => {
    const ex0 = () => lab('这个差别只在一段余量里存在').expect
    const at = (x: number, on: boolean): Scenario => {
      const sc = ruDiversityScenario(on)
      return { ...sc, nodes: sc.nodes.map((n) => (n.id.startsWith('sta') ? { ...n, pos: { ...n.pos, x } } : n)) }
    }
    expect(lesson.scenario().nodes.find((n) => n.id === 'sta-1')!.pos.x).toBe(13.5)
    const rows = tableOf(lab('这个差别只在一段余量里存在'), `移动电视之后（各 ${WINDOW_NS / MS} ms）`).rows
    const sweep = [12.5, 13.5, 14.5, 15.5].map((x) => {
      const l = legsOf(dlRows(runScene(`x${x}|on`, at(x, true), WINDOW_NS)), dlRows(runScene(`x${x}|off`, at(x, false), WINDOW_NS)))
      expect(l.half.length, `x=${x}`).toBeGreaterThan(100)
      expect(l.whole.length, `x=${x}`).toBeGreaterThan(100)
      return { x, key: l.key, half: dropRate(l.half), whole: dropRate(l.whole) }
    })
    expect(rows).toEqual(sweep.map((s) => [s.x === 13.5 ? `x = ${s.x}（本课）` : `x = ${s.x}`, db3(s.key), pct(s.half), pct(s.whole)]))
    expect(sweep[1]!.key).toBe(legs().key)
    expect(sweep[0]!.half).toBeGreaterThan(sweep[0]!.whole)
    expect(sweep[1]!.half).toBeGreaterThan(sweep[1]!.whole)
    // 2026-11-11 (W7b): one metre out the two legs now differ by 0.04 percentage points (41.90 % against
    // 41.94 %), so the lesson says they are practically the same there rather than that four bins
    // still lose more; what is pinned is that the gap all but closes, then reverses at two metres.
    // 2026-11-11 (W6 merge): 41.78 % against 42.27 %, 0.49 points, four bins now marginally lower.
    expect(Math.abs(sweep[2]!.half - sweep[2]!.whole)).toBeLessThan(0.01)
    expect(sweep[2]!.half).toBeLessThan(sweep[2]!.whole)
    expect(ex0()).toContain('四格已略少')
    expect(ex0()).toContain(`四格少丢 ${((sweep[3]!.whole - sweep[3]!.half) * 100).toFixed(2)} 个百分点`)
    expect(sweep[3]!.half).toBeLessThan(sweep[3]!.whole)
    const ex = lab('这个差别只在一段余量里存在').expect
    expect(ex).toContain(`向外一米，余量降到 ${db3(sweep[2]!.key)}，两种配置几乎相同，只差 ${(Math.abs(sweep[2]!.half - sweep[2]!.whole) * 100).toFixed(2)} 个百分点`)
    expect(ex).toContain(`向外两米，余量降到 ${db3(sweep[3]!.key)}，方向反过来`)
    expect(lesson.why).toContain(`余量降到 ${db3(sweep[3]!.key)} 时方向已经相反`)
  }, 300_000)

  it('quiz: `ofdma-dl`’s own scene, with fading and bins added, sits at a 15.4 dB median margin', () => {
    const base = LESSONS.find((l) => l.id === 'ofdma-dl')!.scenario()
    const rs = runScene('ofdma-dl|sel', { ...base, fading: RAYLEIGH, selectivity: {} }, 150 * MS)
    const margins = ofType(rs, 'WIFI_SEL').map((s) => s.meanSinrDb - s.threshDb)
    expect(q(margins, 0.5).toFixed(1)).toBe('15.4')
    expect(lesson.quiz[1].q).toContain(`余量中位数是 ${q(margins, 0.5).toFixed(1)} dB`)
    expect(Math.min(...margins)).toBeGreaterThan(legs().key * 4)
  })
})
