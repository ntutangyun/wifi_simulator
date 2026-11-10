/**
 * `@selectivity`, in the standard-first shape (2026-11-11).
 *
 * ① is what the standard says that bears on a frequency-selective channel — the 26-tone RU and
 * where it sits, the CQI report's arithmetic mean in dB over each 26-tone RU (9 per 20 MHz), the
 * Delta SNR, the LDPC tone mapper — and that it specifies no channel and no decoding rule. ② is the
 * engine's bins, per-bin draws and capacity combining; the CQI report is absent. ③ is four runs of
 * the five-width scene, 150 ms each. Every figure the labs, `why` and the quiz print is read back
 * out of the lesson text and compared with `engine/selectivity.ts` or with those runs.
 *
 * The pooled 45-run drop rates and the 40 000-draw deepest-bin means the old lesson printed are no
 * longer printed: they are not this lesson's runs. They are still pinned where they were measured
 * (tests/engine/selectivity.test.ts, tests/engine/selectivity-inert.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { selectivity as lesson } from '../../src/course/tier2/selectivity'
import { selectivityScenario } from '../../src/course/wifiScenes'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ZH_TERMS, gradedProseTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import { DF_EHT_KHZ, RU26_PER_20MHZ, RU26_TONES, selBinWidthMhz, selBins, selEffSinrDb } from '../../src/engine/selectivity'
import { reqSinrDb } from '../../src/engine/phy'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 150 * MS
const WIDTHS = [20, 40, 80, 160, 320] as const

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length / 2))]
}
const neg = (v: number, d: number): string => v.toFixed(d).replace('-', '−')
const dataUp = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1')

interface Row { w: number; bins: number; marginDb: number; medWorstDb: number; medLossDb: number; fails: number; ppdus: number; topMcs: number; minMcs: number }
const rows: Row[] = []
const sweep = (): Row[] => {
  if (rows.length === 0) {
    WIDTHS.forEach((w, i) => {
      const rs = runOf(lesson, i, RUN_NS)
      const up = ofType(rs, 'WIFI_SEL').filter((s) => s.from === 'sta-1')
      const data = dataUp(rs)
      const hist = new Map<number, number>()
      for (const d of data) hist.set(d.frame.mcs!, (hist.get(d.frame.mcs!) ?? 0) + 1)
      const topMcs = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]
      rows.push({
        w, bins: up[0].bins,
        marginDb: median(up.map((s) => s.meanSinrDb - s.threshDb)),
        medWorstDb: median(up.map((s) => s.worstBinDb)),
        medLossDb: median(up.map((s) => s.lossDb)),
        fails: ofType(rs, 'RX_FAIL').filter((r) => r.reason === 'lowSinr').length,
        ppdus: data.length, topMcs, minMcs: Math.min(...hist.keys()),
      })
    })
  }
  return rows
}
const flatMin = new Map<number, number>()
const flatMinMcs = (i: number): number => {
  if (!flatMin.has(i)) {
    const { selectivity: _off, ...flat } = lesson.variants![i].scenario() as Scenario
    const rs = [...new Simulation(flat as Scenario).runUntil(RUN_NS).records]
    flatMin.set(i, Math.min(...dataUp(rs).map((r) => r.frame.mcs!)))
  }
  return flatMin.get(i)!
}

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
const stdText = (): string => lesson.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
const pct = (a: number, b: number): string => `${(a / b * 100).toFixed(2)} %`

lessonShapeSuite(lesson, { runNs: RUN_NS })

describe('selectivity · the lesson', () => {
  it('is standard-first and sits right after `width`', () => {
    expect(isStandardFirst(lesson)).toBe(true)
    expect(MODULES[lesson.module].title).toBe('容量参数与速率控制')
    expect(COURSE_ORDER.indexOf('selectivity')).toBe(COURSE_ORDER.indexOf('width') + 1)
    expect(lesson.needs).toEqual(['width', 'noise-floor', 'decode-thresholds'])
    expect(lesson.limits).toEqual([])
    expect(lesson.observe).toEqual([])
    expect(lesson.tryThis).toEqual([])
  })

  it('keeps the five-width scene, which the schema accepts only with both sections', () => {
    expect(lesson.scenario()).toEqual(selectivityScenario(20))
    expect(lesson.variants!.map((v) => v.scenario())).toEqual(WIDTHS.map(selectivityScenario))
    for (const v of lesson.variants!) {
      const sc = v.scenario()
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
      expect(sc.fading?.smallScale).toBe('rayleigh')
      expect(sc.fading?.shadowSigmaDb).toBe(0)
    }
  })

  it('cites each clause it teaches in ①, and keeps the simulator out of it', () => {
    const std = stdText()
    for (const c of ['§36.3.2.1', '表 36-5', '表 36-18', '§9.4.1.75', '§9.4.1.65', '表 9-129', '§9.4.1.49', '式 9-4', '§36.3.13.8', '表 36-52', '§36.3.21.2', '§9.4.1.73']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['容量', '格', '本仿真器']) expect(std, sim).not.toContain(sim)
  })

  it('marks what the engine does not do', () => {
    expect(implRow('CQI 报告').kind).toBe('absent')
    expect(implRow('每个子载波的偏差').kind).toBe('absent')
    expect(implRow('合成与判决').kind).toBe('choice')
    expect(lesson.implementation!.filter((r) => r.kind !== 'faithful').length).toBeGreaterThan(4)
  })

  it('brackets every official term at its first Chinese use', () => {
    const zh = gradedProseTexts(lesson).join(' ')
    const failures: string[] = []
    for (const t of ZH_TERMS.filter((x) => !x.track || x.track === 'wifi')) {
      const why = zhTermFailure(zh, t)
      if (why) failures.push(why)
      failures.push(...zhAkaViolations(zh, t))
    }
    expect(failures).toEqual([])
  })
})

describe('selectivity · ① and ② are the engine’s own arithmetic', () => {
  it('a bin is 26 tones at 78.125 kHz, nine of them per 20 MHz', () => {
    expect(RU26_TONES).toBe(26)
    expect(DF_EHT_KHZ).toBe(78.125)
    expect(RU26_PER_20MHZ).toBe(9)
    expect(selBinWidthMhz()).toBe(2.03125)
    expect(implRow('格宽').sim).toContain(`26 × 78.125 kHz = ${selBinWidthMhz()} MHz`)
    expect(implRow('格数').sim).toContain(WIDTHS.map((w) => `${w} MHz ${selBins(w)} 格`).join('，'))
    // 80 MHz: 37 positions, the 19th undefined in EHT — so 36, which is nine per 20 MHz
    expect(stdText()).toContain('37 个位置里正中的第 19 个在 EHT 中没有定义')
    expect(selBins(80)).toBe(37 - 1)
    expect(stdText()).toContain('报告的块数是 9 乘以所请求的 20 MHz 子信道数')
    expect(lesson.why).toContain(`每格 ${selBinWidthMhz()} MHz，20 MHz ${selBins(20)} 格，320 MHz ${selBins(320)} 格`)
    expect(lesson.why).toContain(`每 20 MHz ${RU26_PER_20MHZ} 块`)
  })

  it('the capacity combining the row describes is `selEffSinrDb`', () => {
    const devs = [-10, 0, 3]
    const mean = 20
    const lin = devs.map((d) => Math.log2(1 + 10 ** ((mean + d) / 10)))
    const eff = 10 * Math.log10(2 ** (lin.reduce((a, b) => a + b, 0) / lin.length) - 1)
    expect(selEffSinrDb(mean, devs)).toBeCloseTo(eff, 9)
    expect(implRow('合成与判决').sim).toContain('log2(1 + 信噪比)')
  })

  it('only HE and EHT PPDUs are binned: the ACKs on the way back carry no record', () => {
    for (const i of [0, 4]) {
      const rs = runOf(lesson, i, RUN_NS)
      expect(ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ack').length).toBeGreaterThan(100)
      expect(ofType(rs, 'WIFI_SEL').filter((s) => s.from !== 'sta-1')).toEqual([])
    }
  })
})

describe('selectivity · ③ every figure the labs print is the run', () => {
  it('lab 1: the first data frame at five widths', () => {
    const l = lab('同一个第一帧，五种带宽')
    const t = tableOf(l, '笔记本的第一个数据帧（MCS 3，门限 16.99 dB）')
    const firsts = WIDTHS.map((_w, i) => {
      const rs = runOf(lesson, i, RUN_NS)
      const d = dataUp(rs)[0]
      const sel = ofType(rs, 'WIFI_SEL').find((s) => s.from === 'sta-1')!
      expect(sel.t).toBe(d.t + d.frame.txTimeNs)
      expect(d.frame.mcs).toBe(3)
      const failed = ofType(rs, 'RX_FAIL').some((r) => r.reason === 'lowSinr' && r.t === sel.t)
      expect(failed).toBe(sel.effSinrDb < sel.threshDb)
      return { sel, failed }
    })
    expect(firsts[0].sel.threshDb).toBeCloseTo(reqSinrDb('eht', 3), 9)
    expect(t.heading).toContain(`门限 ${firsts[0].sel.threshDb.toFixed(2)} dB`)
    WIDTHS.forEach((w, i) => {
      const s = firsts[i].sel
      expect(t.rows[i]).toEqual([`${w} MHz`, String(s.bins), `${s.meanSinrDb.toFixed(1)} dB`, `${neg(s.worstBinDb, 1)} dB`,
        `${s.effSinrDb.toFixed(1)} dB`, `${s.lossDb.toFixed(1)} dB`, firsts[i].failed ? '没有解出' : '解出'])
    })
    // the same frame's same bins draw the same deviations at every width
    expect(new Set(firsts.slice(0, 4).map((f) => f.sel.worstBinDb)).size).toBe(1)
    expect(firsts[4].sel.worstBinDb).toBeLessThan(firsts[0].sel.worstBinDb)
    expect(l.expect).toContain(`五档的平均都是 ${firsts[0].sel.meanSinrDb.toFixed(1)} dB`)
    expect(l.expect).toContain(`前四档的最深一格都是 ${neg(firsts[0].sel.worstBinDb, 1)} dB`)
    expect(l.expect).toContain(`是 ${neg(firsts[4].sel.worstBinDb, 1)} dB`)
    expect(l.expect).toContain(`损失却从 ${firsts[0].sel.lossDb.toFixed(1)} dB 降到 ${firsts[4].sel.lossDb.toFixed(1)} dB`)
    expect(l.expect).toContain(`门限 ${firsts[0].sel.threshDb.toFixed(2)} dB`)
    const failedW = WIDTHS.filter((_w, i) => firsts[i].failed)
    const okW = WIDTHS.filter((_w, i) => !firsts[i].failed)
    expect(lesson.why).toContain(`同一个第一帧，${failedW.join('、')} MHz 解不出，${okW.join('、')} MHz 能解出`)
  })

  it('lab 2: five rounds — the deepest bin deepens about 3 dB a doubling, the loss barely moves', () => {
    const l = lab('五轮：最深一格与损失')
    const t = tableOf(l, '每帧合成记录的中位数，各运行 150 ms')
    const rs = sweep()
    rs.forEach((r, i) => expect(t.rows[i]).toEqual([`${r.w} MHz`, String(r.bins), `${neg(r.medWorstDb, 2)} dB`, `${r.medLossDb.toFixed(2)} dB`]))
    for (let i = 1; i < rs.length; i++) {
      const d = rs[i - 1].medWorstDb - rs[i].medWorstDb
      expect(d).toBeGreaterThan(2)
      expect(d).toBeLessThan(4.5)
    }
    const [a, z] = [rs[0], rs[4]]
    // 2026-11-11 (re-measured after W6): the loss's median stays in a band, its top at 160 MHz
    const lo = Math.min(...rs.map((r) => r.medLossDb)), hi = Math.max(...rs.map((r) => r.medLossDb))
    expect(l.expect).toContain(`从 ${neg(a.medWorstDb, 2)} dB 到 ${neg(z.medWorstDb, 2)} dB；损失一直在 ${lo.toFixed(2)} dB 到 ${hi.toFixed(2)} dB 之间`)
    expect(lesson.why).toContain(`从 20 MHz 的 ${Math.abs(a.medWorstDb).toFixed(2)} dB 加深到 320 MHz 的 ${Math.abs(z.medWorstDb).toFixed(2)} dB，有效信噪比的损失却一直在 ${lo.toFixed(2)} dB 到 ${hi.toFixed(2)} dB 之间`)
    expect(lo).toBe(a.medLossDb)
    expect(hi - lo).toBeLessThan(1)
    expect(lesson.quiz[0].q).toContain(`有 ${z.bins} 格，本课那一轮最深一格的中位数比平均低 ${Math.abs(z.medWorstDb).toFixed(2)} dB`)
    expect(lesson.quiz[0].options[1]).toContain(`损失的中位数是 ${z.medLossDb.toFixed(2)} dB`)
  })

  it('lab 3: at an equal margin the wider channel drops less', () => {
    // 2026-11-11 (re-measured after W6): 80/160/320 MHz share the 3.62 dB margin; 20 and 40 MHz
    // settle a whole MCS lower at 6.62 dB.
    const l = lab('余量相同的三档，越宽掉帧越少')
    const t = tableOf(l, '五轮的掉帧率，各运行 150 ms')
    const rs = sweep()
    rs.forEach((r, i) => expect(t.rows[i]).toEqual([`${r.w} MHz`, `MCS ${r.topMcs}`, `${r.marginDb.toFixed(2)} dB`, `${r.fails} / ${r.ppdus}`, pct(r.fails, r.ppdus)]))
    const matched = rs.slice(2)
    expect(new Set(matched.map((r) => r.marginDb.toFixed(2))).size).toBe(1)
    expect(new Set(matched.map((r) => r.topMcs)).size).toBe(1)
    for (let i = 1; i < matched.length; i++) expect(matched[i].fails / matched[i].ppdus).toBeLessThan(matched[i - 1].fails / matched[i - 1].ppdus)
    const [r20, r40] = rs
    for (const r of [r20, r40]) expect(r.marginDb).toBeGreaterThan(matched[0].marginDb)
    expect(r20.marginDb.toFixed(2)).toBe(r40.marginDb.toFixed(2))
    expect(r20.topMcs).toBe(r40.topMcs)
    const m = matched[0]
    const last = matched[matched.length - 1]
    expect(l.expect).toContain(`三档最常用 MCS ${m.topMcs}，余量都是 ${m.marginDb.toFixed(2)} dB，掉帧率从 ${pct(m.fails, m.ppdus)} 依次降到 ${pct(last.fails, last.ppdus)}`)
    expect(l.expect).toContain(`20 与 40 MHz 多数帧停在 MCS ${r20.topMcs}，余量 ${r20.marginDb.toFixed(2)} dB，掉帧率 ${pct(r20.fails, r20.ppdus)} 与 ${pct(r40.fails, r40.ppdus)}`)
    expect(lesson.why).toContain(`从 80 MHz 的 ${pct(m.fails, m.ppdus)} 降到 320 MHz 的 ${pct(last.fails, last.ppdus)}`)
    const q = lesson.quiz[2]
    expect(q.q).toContain(`40 MHz 的掉帧率 ${pct(r40.fails, r40.ppdus)}，低于 80 MHz 的 ${pct(m.fails, m.ppdus)}`)
    expect(r40.fails / r40.ppdus).toBeLessThan(m.fails / m.ppdus)
    expect(q.options[1]).toContain(`MCS ${r40.topMcs}，余量 ${r40.marginDb.toFixed(2)} dB，比 80 到 320 MHz 的 ${m.marginDb.toFixed(2)} dB 大`)
    expect(q.explain).toContain(`从 ${pct(m.fails, m.ppdus)} 降到 ${pct(last.fails, last.ppdus)}`)
  })

  it('lab 4: with the section off every width visits MCS 0; with it on fewer do', () => {
    // 2026-11-11 (re-measured after W6): with the section on, 20 and 320 MHz stay above MCS 0
    // while 40, 80 and 160 MHz still reach it.
    const l = lab('关掉分格')
    const t = tableOf(l, '笔记本用到的最低级别，各运行 150 ms')
    const rs = sweep()
    rs.forEach((r, i) => {
      expect(t.rows[i]).toEqual([`${r.w} MHz`, `MCS ${r.minMcs}`, `MCS ${flatMinMcs(i)}`])
      expect(flatMinMcs(i)).toBe(0)
    })
    const above = rs.filter((r) => r.minMcs > 0).map((r) => r.w)
    const at0 = rs.filter((r) => r.minMcs === 0).map((r) => r.w)
    expect(l.expect).toContain(`打开分格时，${above.join(' 与 ')} MHz 没有降到过 MCS 0，${at0.join('、')} MHz 仍有降到 MCS 0 的帧`)
  })
})
