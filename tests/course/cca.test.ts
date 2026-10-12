/**
 * Every empirical claim in "Clear channel assessment: two lines, twenty decibels
 * apart" — the one lesson of the 2026-09-25 re-pacing written from scratch.
 *
 * It borrows `backoff`'s scene rather than declaring one of its own, so
 * `lessonShapeSuite(..., { sameSceneAs: 'backoff' })` proves the two ids replay
 * the same timeline, and its recorded hash is a copy rather than a new run.
 *
 * Two claims the course made in three lessons and showed in none are pinned here
 * for the first time against a run rather than against a constant: that in this
 * scene every busy a neighbour causes is a preamble detection, and that every
 * "energy" busy is a radio hearing its own transmission. The −82/−62 constants
 * themselves stay pinned where they already were (`decode-thresholds`,
 * `hidden`, `tier1-project-review`) and are re-asserted here beside the table
 * that now prints them with a figure.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with
 * the same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { cca, ccaTiming, CCA_NEIGHBOUR_DBM } from '../../src/course/tier1/cca'
import { backoff } from '../../src/course/tier1/backoff'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { hidden } from '../../src/course/tier1/hidden'
import { buildLinkTable, wallsCrossed } from '../../src/engine/propagation'
import { ROOT, zhNumeral } from './coverage'
import { CCA_ED_DBM, CCA_PD_DBM } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { rssiOn } from './rssi'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
/** 300 ms: the window the 1164/423 counts are taken over — `backoff`'s own window. */
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(cca, undefined, RUN_NS)
const busy = () => ofType(recs(), 'CCA_BUSY')
const lane = (label: string): TimingLane => ccaTiming().lanes.find((l) => l.label === label)!

/**
 * Every node's own transmissions as half-open intervals, built once. The naive
 * form of this — scanning all TX_STARTs per query — is quadratic over 4,761
 * CCA records and cost this file five seconds on its own.
 */
const airtimeOf = (() => {
  let by: Map<string, [number, number][]> | null = null
  return (): Map<string, [number, number][]> => {
    if (by) return by
    by = new Map()
    for (const r of ofType(recs(), 'TX_START')) {
      const list = by.get(r.node) ?? []
      list.push([r.t, r.t + r.frame.txTimeNs])
      by.set(r.node, list)
    }
    return by
  }
})()

/** Whether `node` had a transmission of its own on the air at `t`. */
const transmittingAt = (node: string, t: number): boolean =>
  (airtimeOf().get(node) ?? []).some(([a, b]) => t >= a && t < b)

lessonShapeSuite(cca, { sameSceneAs: 'backoff', runNs: RUN_NS })

describe('cca · the lesson’s own scene', () => {
  it('follows ifs, sits in the waiting module, and owns the two thresholds', () => {
    expect(cca.id).toBe('cca')
    expect(MODULES[cca.module].title).toBe('等待与退避')
    // It answers the question `ifs`'s step 1 asks and does not answer, so that is its one
    // prerequisite; §3 puts it between `ifs` and `backoff`, whose scene it borrows.
    expect(cca.needs).toEqual(['ifs'])
    expect(cca.terms!.map((t) => t.term)).toEqual(['CCA', 'preamble detection', 'energy detection'])
  })

  it('borrows backoff’s scene rather than declaring one, and has no variants to divide', () => {
    expect(() => ScenarioSchema.parse(cca.scenario())).not.toThrow()
    expect(cca.scenario()).toEqual(backoff.scenario())
    expect(cca.variants).toBeUndefined()
    expect(backoff.variants).toBeUndefined()
  })

  it('its three jumps are its own predicates over that same run', () => {
    expect(cca.jumps.map((j) => j.label)).toEqual([
      '第一次前导检测判忙', '第一次能量判忙（本机正在发送）', '碰撞期间接入点的判忙',
    ])
    for (const j of cca.jumps) expect(recs().some(j.find), j.label).toBe(true)
    // jump 0 lands on the station that freezes: STA-1 at 498 µs, the same instant
    // `backoff`'s own figure opens its frozen span at
    const first = busy().find(cca.jumps[0].find as (r: TLRecord) => boolean)!
    expect([first.node, first.t, first.cause]).toEqual(['sta-1', 498_000, 'preamble'])
    expect(ofType(recs(), 'BACKOFF_FREEZE').some((r) => r.node === 'sta-1' && r.t === first.t)).toBe(true)
    // jump 1 lands at t = 0, on a station reporting busy because it is itself transmitting
    const energy = busy().find(cca.jumps[1].find as (r: TLRecord) => boolean)!
    expect([energy.t, energy.cause]).toEqual([0, 'energy'])
    expect(transmittingAt(energy.node, energy.t)).toBe(true)
    // jump 2 lands on the access point during the collision, busy on preambles it never locked
    const ap = busy().find(cca.jumps[2].find as (r: TLRecord) => boolean)!
    expect([ap.node, ap.t, ap.cause]).toEqual(['ap', 0, 'preamble'])
  })
})

describe('cca · the two lines', () => {
  it('are the engine’s own constants, and twenty decibels apart', () => {
    // the table's "−82 dBm" and "−62 dBm" rows, the difference row's "20 dB / a hundred
    //  times the power", and the procedure's steps 3 and 4
    expect(CCA_PD_DBM).toBe(-82)
    expect(CCA_ED_DBM).toBe(-62)
    expect(CCA_ED_DBM - CCA_PD_DBM).toBe(20)
    expect(Math.pow(10, (CCA_ED_DBM - CCA_PD_DBM) / 10)).toBeCloseTo(100, 9)
  })

  it('the neighbour arrives at −46.01 dBm, clearing both by 36 dB and 16 dB', () => {
    // the caption: "the neighbour arrives at STA-1 at −46.01 dBm: 36 dB above −82 dBm,
    //  16 dB above −62 dBm, so the two lines come out the same length"
    const sc = cca.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    const level = rssiOn('5g', lt, 'sta-2', 'sta-1')
    expect(level.toFixed(2)).toBe('-46.01')
    // the exported figure is the one the prose prints, to two decimals
    expect(Number(level.toFixed(2))).toBe(CCA_NEIGHBOUR_DBM)
    expect(Math.round(level - CCA_PD_DBM)).toBe(36)
    expect(Math.round(level - CCA_ED_DBM)).toBe(16)
    // and it is symmetric, which is why the two stations behave the same way
    expect(rssiOn('5g', lt, 'sta-1', 'sta-2')).toBe(level)
  })

  it('this room cannot be made quiet enough to fall below the lower line', () => {
    // tryThis: "drag STA-2 into a corner … in this ten-metre room you cannot get it below
    //  −82 dBm — which is why the hidden-station lesson needs a different house"
    const sc = cca.scenario()
    const far = { ...sc, nodes: sc.nodes.map((n) => (n.id === 'sta-2' ? { ...n, pos: { ...n.pos, x: 9.5, y: 7.5 } } : n)) }
    const level = rssiOn('5g', buildLinkTable(far.nodes, far.walls), 'sta-2', 'sta-1')
    expect(level).toBeGreaterThan(CCA_PD_DBM)
    expect(level).toBeGreaterThan(CCA_ED_DBM)
  })
})

describe('cca · what this run actually reports', () => {
  it('STA-1 turns busy 1587 times: 1164 by preamble detection, 423 by energy', () => {
    // 「300 ms 里 STA-1 翻成“忙”共 1587 次：1164 次前导检测，423 次能量检测」
    const mine = busy().filter((r) => r.node === 'sta-1')
    expect(mine.length).toBe(1587)
    expect(mine.filter((r) => r.cause === 'preamble').length).toBe(1164)
    expect(mine.filter((r) => r.cause === 'energy').length).toBe(423)
    // every busy is matched by an idle, so the counts are transitions rather than samples
    expect(ofType(recs(), 'CCA_IDLE').length).toBe(busy().length)
  })

  it('not one "energy" busy in the whole run comes from a neighbour: every one is the radio itself', () => {
    // 「而那 423 次没有一次是邻居造成的，每一次都是它自己正在发送」, and the depth note
    //  「半双工那一支根本没有走门限判断」. This is the claim the lesson rests on and the one
    //  no scene in the course had ever checked.
    const energy = busy().filter((r) => r.cause === 'energy')
    expect(energy.length).toBeGreaterThan(1000)
    for (const e of energy) expect(transmittingAt(e.node, e.t), `${e.node} at ${e.t}`).toBe(true)
    // and the converse: a busy raised by somebody else is always a preamble detection
    const others = busy().filter((r) => !transmittingAt(r.node, r.t))
    expect(others.length).toBeGreaterThan(1000)
    for (const o of others) expect(o.cause, `${o.node} at ${o.t}`).toBe('preamble')
  })

  it('preamble detection is not decoding: the access point is busy on two frames it never locked', () => {
    // `deeper`: "the access point locked neither frame — the records are two RX_MISS — yet
    //  its sensing reported busy at 0 µs, and the reason it wrote was the preamble"
    const misses = ofType(recs(), 'RX_MISS').filter((r) => r.node === 'ap' && r.t === 0)
    expect(misses.map((r) => r.from).sort()).toEqual(['sta-1', 'sta-2'])
    expect(ofType(recs(), 'RX_OK').some((r) => r.node === 'ap' && r.t < 248_000)).toBe(false)
    const ap = busy().find((r) => r.node === 'ap')!
    expect([ap.t, ap.cause]).toEqual([0, 'preamble'])
  })

  it('the channel reads idle in the 16 µs between the frame and its answer', () => {
    // the observation "pause at 746 µs: both lines are back to idle, and nobody speaks for
    //  those 16 µs — idle is not the same as your turn"
    const idleAt = ofType(recs(), 'CCA_IDLE').filter((r) => r.t === 746_000).map((r) => r.node).sort()
    expect(idleAt).toEqual(['ap', 'sta-1', 'sta-2'])
    const back = busy().filter((r) => r.t === 762_000)
    expect(back.length).toBeGreaterThan(0)
    expect(762_000 - 746_000).toBe(16_000)
    // nothing was on the air in between
    expect(ofType(recs(), 'TX_START').some((r) => r.t > 746_000 && r.t < 762_000)).toBe(false)
  })
})

describe('cca · the timing figure is the run', () => {
  it('both threshold lanes cover exactly the spans the air is occupied for', () => {
    const air = lane('空口').spans
    const nbr = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t === 498_000)!
    expect(air[0].fromUs).toBe(nbr.t / 1000)
    expect(air[0].toUs).toBe((nbr.t + nbr.frame.txTimeNs) / 1000)
    const ack = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'ack' && r.t > 746_000)!
    expect(air[1].fromUs).toBe(ack.t / 1000)
    expect(air[1].toUs).toBe((ack.t + ack.frame.txTimeNs) / 1000)

    // each threshold lane holds busy for exactly those two spans — the CCA_BUSY / CCA_IDLE
    // pairs STA-1 emits over the window
    for (const label of ['前导检测', '能量检测']) {
      const sp = lane(label).spans
      expect(sp.map((s) => [s.fromUs, s.toUs]), label).toEqual(air.map((s) => [s.fromUs, s.toUs]))
    }
    for (const [from, to] of air.map((s) => [s.fromUs * 1000, s.toUs * 1000])) {
      expect(busy().some((r) => r.node === 'sta-1' && r.t === from), `busy at ${from}`).toBe(true)
      expect(ofType(recs(), 'CCA_IDLE').some((r) => r.node === 'sta-1' && r.t === to), `idle at ${to}`).toBe(true)
    }
    // the margins the labels print are the margins the link table gives
    const level = rssiOn('5g', buildLinkTable(cca.scenario().nodes, cca.scenario().walls), 'sta-2', 'sta-1')
    expect(lane('前导检测').spans[0].label).toBe(`忙 · 高出 ${Math.round(level - CCA_PD_DBM)} dB`)
    expect(lane('能量检测').spans[0].label).toBe(`忙 · 高出 ${Math.round(level - CCA_ED_DBM)} dB`)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(ccaTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(5)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('cca · every official term carries its English name', () => {
  const zh = [cca.why!, ...cca.outcomes!]
    .concat(paragraphTexts(cca.picture!), cellTexts(cca.picture!))
    .concat(paragraphTexts(cca.numbers!), cellTexts(cca.numbers!))
    .concat(cca.observe, cca.tryThis, cca.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(cca))

  it('brackets every official term at its first Chinese use', () => {
    const out: string[] = []
    for (const t of rows) {
      const why = zhTermFailure(zh, t)
      if (why) out.push(why)
      out.push(...zhAkaViolations(zh, t))
    }
    expect(out).toEqual([])
  })

  it('had its terminology actually graded', () => {
    expect(rows.filter((t) => bracketedAtFirstZhUse(zh, t) !== null).length).toBeGreaterThanOrEqual(2)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * `scripts/figure-planting.ts` measured this lesson on 2026-10-12: **53 of its 55 printed
 * figures were editable with this file green.** Everything above is a strong engine test — the
 * two constants, the −46.01 dBm neighbour, the 1587/1164/423 census, the two RX_MISS at zero —
 * and every one of those numbers is a literal on the test's own side, so the lesson could print
 * any neighbouring value and nothing would notice. This lesson is where that matters most: it
 * prints −82 eight times and −62 seven, in `why`, `picture`, the table, two steps, `limits`,
 * `sources` and both quiz questions, and a reader who finds one of them edited has no way to
 * tell which is right.
 *
 * So each site is read here. Three of them are claims about scenes that are not this one, and
 * they are checked against those scenes rather than waved at:
 *
 *  - 「等到两台站点隔着两堵砖墙、到达电平掉到 −82 dBm 以下」 is `@hidden`'s house, so the wall
 *    count and the level come from `@hidden`'s own scenario.
 *  - 「一帧到达你这里是 −70 dBm」 is the first quiz's hypothesis: the figure's whole job is to
 *    sit between the two lines, and that is what is asserted.
 *  - 「一台超宽带设备的信号落进了 Wi-Fi 的工作信道」 has no figure, and the engine does have the
 *    cross-technology path the answer depends on (`channel.ts`'s spectrum branch, which
 *    `limits` cites).
 *
 * **Two figures stay unread, with their reason.** 「最多 4 µs 内报告」 is the standard's bound on
 * a radio, and 「真实设备在 80 MHz 上会因为某个副信道忙而退回 20 MHz」 is about devices this
 * engine does not model — the first is unverifiable here for the same reason as `@ifs`'s copy of
 * it, and the second is the limit's whole point. What IS checked beside them is the zero this
 * engine has, and that every frame in this scene is 20 MHz wide.
 */
describe('cca · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const sc = cca.scenario()
  const links = buildLinkTable(sc.nodes, sc.walls)
  const neighbour = rssiOn('5g', links, 'sta-2', 'sta-1')
  const mine = busy().filter((r) => r.node === 'sta-1')

  const table = cca.numbers!.find((x) => x.kind === 'table') as
    { heading: string; head: string[]; rows: string[][] }
  const steps = (cca.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const caption = (cca.numbers!.find((x) => x.kind === 'diagram') as { caption: string }).caption
  const prose = (fragment: string): string => {
    const b = cca.numbers!.find((x) => (x as { heading?: string }).heading?.includes(fragment)) as
      { text?: string } | undefined
    expect(b?.text, `no block of \`numbers\` headed 「${fragment}」`).toBeDefined()
    return b!.text!
  }
  const pictureText = (cca.picture! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const deeperText = (cca.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const limitText = cca.limits.map((x) => x.text).join('\n')
  const sourcesText = cca.sources!.join('\n')
  const quizText = cca.quiz!.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')

  /** The captures of `re`, as printed. A full-width minus is part of the figure. */
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] =>
    raw(text, re, what).map((x) => Number(x.replace(/[\s,]/g, '').replace(/−/g, '-')))
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number => zhCount(raw(text, re, what)[0])
  const ZH = '[〇一二三四五六七八九十两]+'
  /**
   * `zhNumeral` reads 〇–九十九, and this lesson's 「一百倍的功率」 is the one figure in it past
   * that. Handled here rather than by widening the shared reader, which the course-wide rules
   * depend on.
   */
  const ZH_BIG = '[〇一二三四五六七八九十百两]+'
  const countedBig = (text: string, re: RegExp, what: string): number => {
    const s = raw(text, re, what)[0]
    return s === '一百' ? 100 : zhCount(s)
  }
  /** Every site in the lesson that prints a dBm figure, so none of them can be missed. */
  const everyDbm = (text: string): number[] =>
    [...text.matchAll(/−([\d.]+) dBm/g)].map((m) => -Number(m[1]))

  it('`why`: the two lines, their gap in decibels, and what that is in power', () => {
    const why = cca.why!
    const [pd, ed] = figs(why, /一条 (−[\d.]+) dBm，一条 (−[\d.]+) dBm/, '`why` on the two lines')
    const gap = counted(why, new RegExp(`中间差(${ZH})分贝`), '`why` on the gap')
    const times = countedBig(why, new RegExp(`也就是(${ZH_BIG})倍的功率`), '`why` on that in power')
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    expect(ed - pd).toBe(gap)
    expect(Math.pow(10, gap / 10)).toBeCloseTo(times, 9)
  })

  it('`picture`: the lower line, the higher one, the gap again, and the two instants it points at', () => {
    const [pd] = figs(pictureText, /不低于 (−[\d.]+) dBm，那就是忙/, '`picture` on preamble detection')
    const [ed] = figs(pictureText, /跟 (−[\d.]+) dBm 比/, '`picture` on energy detection')
    const gap = counted(pictureText, new RegExp(`比前一条线高出整整(${ZH})分贝`), '`picture` on the gap')
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    expect(ed - pd).toBe(gap)
    // every dBm figure in `picture` is one of the two lines, and nothing else
    for (const v of everyDbm(pictureText)) expect([CCA_PD_DBM, CCA_ED_DBM]).toContain(v)

    // 「邻居的数据帧在 498 µs 开始发送，STA-1 的侦听同刻翻成「忙」，理由写的是前导码」
    const [at] = figs(pictureText, /在 (\d+) µs 开始发送/, '`picture` on when the neighbour starts')
    const tx = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t === at * 1_000)
    expect(tx, `nothing starts on the air at ${at} µs`).toBeDefined()
    const b = mine.find((r) => r.t === at * 1_000)
    expect(b, `STA-1 does not turn busy at ${at} µs`).toBeDefined()
    expect(b!.cause, 'and the reason it writes').toBe('preamble')

    // 「跳到 0 µs：两台站点同时开始发送，它们各自的侦听也在那一刻报忙，可理由写的是能量」
    const [zero] = figs(pictureText, /跳到 (\d+) µs/, '`picture` on the second jump')
    const together = counted(pictureText, new RegExp(`(${ZH})台站点同时开始发送`), 'the stations it counts')
    const starts = ofType(rs, 'TX_START').filter((r) => r.t === zero * 1_000)
    expect(starts.map((r) => r.node).sort()).toHaveLength(together)
    for (const s of starts) {
      const own = busy().find((r) => r.node === s.node && r.t === zero * 1_000)
      expect(own, `${s.node} does not turn busy at ${zero} µs`).toBeDefined()
      expect(own!.cause, `${s.node}’s reason at ${zero} µs`).toBe('energy')
    }
  })

  it('the table: two lines, their difference, and the one clause both of them come from', () => {
    const rows = table.rows
    expect(rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    same(raw(rows[0][1], /^(−[\d.]+) dBm$/, 'the preamble-detection line')[0], CCA_PD_DBM,
      'the preamble-detection threshold')
    same(raw(rows[1][1], /^(−[\d.]+) dBm$/, 'the energy-detection line')[0], CCA_ED_DBM,
      'the energy-detection threshold')
    const [gap] = figs(rows[2][1], /^(\d+) dB$/, 'the difference row')
    expect(CCA_ED_DBM - CCA_PD_DBM).toBe(gap)
    // 「一百倍的功率」 in the third column, and 「—」 where a clause would go
    const times = countedBig(rows[2][2], new RegExp(`(${ZH_BIG})倍的功率`), 'the difference in power')
    expect(Math.pow(10, gap / 10)).toBeCloseTo(times, 9)
    expect(rows[2][3]).toBe('—')
    // both thresholds are cited to the same clause, and `sources` names it too
    expect(rows[0][3]).toBe(rows[1][3])
    expect(sourcesText, `\`sources\` does not name ${rows[0][3]}`).toContain(rows[0][3])
  })

  it('the caption: the neighbour’s level, and how far it clears each line', () => {
    const [level] = figs(caption, /是 (−[\d.]+) dBm/, 'the caption on the neighbour’s level')
    const [pd, above] = figs(caption, /比 (−[\d.]+) dBm 高 (\d+) dB/, 'the caption on the lower line')
    const [ed, over] = figs(caption, /dB，比 (−[\d.]+) dBm 高 (\d+) dB/, 'the caption on the higher one')
    same(raw(caption, /是 (−[\d.]+) dBm/, 'the neighbour’s level')[0], neighbour,
      'the neighbour’s level in dBm')
    expect(level).toBe(CCA_NEIGHBOUR_DBM)
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    expect(Math.round(neighbour - CCA_PD_DBM)).toBe(above)
    expect(Math.round(neighbour - CCA_ED_DBM)).toBe(over)
    // 「746 到 762 µs 那 16 µs 里空口真的空着，两条线也一起回到空闲」
    const [from, to, span] = figs(caption, /(\d+) 到 (\d+) µs 那 (\d+) µs/, 'the caption on the quiet gap')
    expect(to - from).toBe(span)
    expect(ofType(rs, 'CCA_IDLE').filter((r) => r.t === from * 1_000).map((r) => r.node).sort())
      .toEqual(sc.nodes.map((n) => n.id).sort())
    expect(ofType(rs, 'TX_START').some((r) => r.t > from * 1_000 && r.t < to * 1_000)).toBe(false)
    expect(busy().some((r) => r.t === to * 1_000)).toBe(true)
  })

  it('the figure’s two lane labels carry the two margins, and they are the caption’s', () => {
    const [above] = figs(lane('前导检测').spans[0].label!, /高出 (\d+) dB/, 'the preamble lane’s label')
    const [over] = figs(lane('能量检测').spans[0].label!, /高出 (\d+) dB/, 'the energy lane’s label')
    expect(Math.round(neighbour - CCA_PD_DBM)).toBe(above)
    expect(Math.round(neighbour - CCA_ED_DBM)).toBe(over)
    expect(above - over, 'the two margins differ by the gap between the lines')
      .toBe(CCA_ED_DBM - CCA_PD_DBM)
  })

  it('the procedure: steps 3 and 4 state the two lines the engine compares against', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    const [pd] = figs(steps[2], /不低于 (−[\d.]+) dBm/, 'step 3’s threshold')
    const [ed] = figs(steps[3], /不低于 (−[\d.]+) dBm/, 'step 4’s threshold')
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    // and every dBm figure in the whole procedure is one of those two
    for (const v of everyDbm(steps.join('\n'))) expect([CCA_PD_DBM, CCA_ED_DBM]).toContain(v)
  })

  it('「本轮仿真里，每一次判忙是哪一种」: the window, the total, and the two reasons', () => {
    const text = prose('每一次判忙是哪一种')
    const [ms] = figs(text, /(\d+) ms 里/, 'the window it counts over')
    const [total] = figs(text, /共 (\d+) 次/, 'the busies it counts')
    const [pd, ed] = figs(text, /(\d+) 次前导检测，(\d+) 次能量检测/, 'the two reasons')
    const [again] = figs(text, /而那 (\d+) 次没有一次是邻居造成的/, 'the energy busies restated')
    expect(ms * MS).toBe(RUN_NS)
    expect(mine.length).toBe(total)
    expect(mine.filter((r) => r.cause === 'preamble').length).toBe(pd)
    expect(mine.filter((r) => r.cause === 'energy').length).toBe(ed)
    expect(pd + ed, 'the two reasons against the total').toBe(total)
    expect(again).toBe(ed)
    // 「每一次都是它自己正在发送」, and 「凡是别人造成的忙，都是抓到开头判出来的」
    for (const e of mine.filter((r) => r.cause === 'energy')) {
      expect(transmittingAt(e.node, e.t), `STA-1 at ${e.t}`).toBe(true)
    }
    for (const p of mine.filter((r) => !transmittingAt(r.node, r.t))) {
      expect(p.cause, `a busy STA-1 did not cause itself, at ${p.t}`).toBe('preamble')
    }
  })

  it('「为什么这里看不出两条线的差别」: this room, and the house where it does show', () => {
    const text = prose('为什么这里看不出两条线的差别')
    const [level] = figs(text, /邻居到达 (−[\d.]+) dBm/, 'the neighbour’s level restated')
    same(raw(text, /邻居到达 (−[\d.]+) dBm/, 'the level')[0], neighbour, 'the neighbour’s level')
    expect(level).toBe(CCA_NEIGHBOUR_DBM)
    // 「等到两台站点隔着两堵砖墙、到达电平掉到 −82 dBm 以下」: that is `@hidden`'s house, so
    // the wall count and the level are read off `@hidden`'s own scene
    const walls = counted(text, new RegExp(`隔着(${ZH})堵砖墙`), 'the walls it points at')
    const [floor] = figs(text, /到达电平掉到 (−[\d.]+) dBm 以下/, 'the level it points at')
    expect(floor).toBe(CCA_PD_DBM)
    const h = hidden.scenario()
    const pos = (id: string) => h.nodes.find((n) => n.id === id)!.pos
    const crossed = wallsCrossed(pos('sta-1'), pos('sta-2'), h.walls)
    expect(crossed, 'the walls between `@hidden`’s two stations').toHaveLength(walls)
    expect(new Set(crossed)).toEqual(new Set(['brick']))
    expect(rssiOn('5g', buildLinkTable(h.nodes, h.walls), 'sta-1', 'sta-2')).toBeLessThan(floor)
  })

  it('`deeper`: two frames at zero, two misses, and the default reason', () => {
    const frames = counted(deeperText, new RegExp(`本轮开头(${ZH})帧同时开始`), '`deeper` on the two frames')
    const misses = counted(deeperText, new RegExp(`记录里是(${ZH})条 RX_MISS`), '`deeper` on the misses')
    const [zero] = figs(deeperText, /侦听在 (\d+) µs 就报了忙/, '`deeper` on when it reported busy')
    const [own] = figs(deeperText, /本机自己发送时的那 (\d+) 次/, '`deeper` on the energy busies')
    expect(ofType(rs, 'TX_START').filter((r) => r.t === zero * 1_000)).toHaveLength(frames)
    const apMisses = ofType(rs, 'RX_MISS').filter((r) => r.node === 'ap' && r.t === zero * 1_000)
    expect(apMisses).toHaveLength(misses)
    const ap = busy().find((r) => r.node === 'ap')!
    expect([ap.t / 1_000, ap.cause]).toEqual([zero, 'preamble'])
    expect(mine.filter((r) => r.cause === 'energy').length).toBe(own)
  })

  it('`limits`: no detection delay, one width, and the 423 that are not a measurement', () => {
    // 「判忙没有检测时延：一路发射开始的那一纳秒，所有听得见它的电台就同时翻成忙」 — the
    // standard's 「最多 4 µs 内报告」 is a bound on a radio and this repository holds no clause
    // text for it, so what is asserted is the zero this engine has.
    const starts = new Set(ofType(rs, 'TX_START').map((r) => r.t))
    expect(busy().length).toBeGreaterThan(1000)
    for (const b of busy()) expect(starts.has(b.t), `a busy at ${b.t}, between transmissions`).toBe(true)
    // 「宽信道要求的「每 20 MHz 各判一次」也不存在」: every frame of this scene is that wide,
    // which is why the lesson can speak of one verdict per radio
    const [per] = figs(limitText, /每 (\d+) MHz 各判一次/, '`limits` on the per-subchannel rule')
    const dataFrames = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data')
    expect(new Set(dataFrames.map((r) => r.frame.widthMhz))).toEqual(new Set([per]))
    const [ed] = figs(limitText, /而 (−[\d.]+) dBm 这条线/, '`limits` on the higher line')
    expect(ed).toBe(CCA_ED_DBM)
    // 「那 423 次不是一次测量」, twice in the same entry and once in the next
    for (const n of figs(limitText, /那 (\d+) 次不是一次测量[\s\S]*?这里的 (\d+) 条记录/,
      '`limits` on the energy busies')) {
      expect(mine.filter((r) => r.cause === 'energy').length).toBe(n)
    }
    const [level] = figs(limitText, /邻居到达 (−[\d.]+) dBm 是几何位置/, '`limits` on the level')
    expect(level).toBe(CCA_NEIGHBOUR_DBM)
    // 「默认没有衰落」: this scene really does not switch it on, which is what makes the level a
    // constant in the first place
    expect(sc.fading).toBeUndefined()
  })

  it('`sources`: both thresholds, both counts, the frame, and the code they live in', () => {
    const [pd, ed] = figs(sourcesText, /按 (−[\d.]+) dBm，其余任何能量按 (−[\d.]+) dBm/,
      '`sources` on the two thresholds')
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    const [level] = figs(sourcesText, /(−[\d.]+) dBm 这个电平/, '`sources` on the neighbour’s level')
    expect(level).toBe(CCA_NEIGHBOUR_DBM)
    const [pdCount, edCount] = figs(sourcesText, /以及 (\d+)\/(\d+) 这两个计数/, '`sources` on the counts')
    expect(mine.filter((r) => r.cause === 'preamble').length).toBe(pdCount)
    expect(mine.filter((r) => r.cause === 'energy').length).toBe(edCount)
    const [bytes] = figs(sourcesText, /([\d,]+) 字节的帧/, '`sources` on the frame')
    const data = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    const stations = counted(sourcesText, new RegExp(`(${ZH})台饱和站点`), '`sources` on the stations')
    expect(sc.nodes.filter((n) => n.profiles?.includes('saturated'))).toHaveLength(stations)

    // every identifier `sources` names is declared in a file `sources` names
    const named = [...sourcesText.matchAll(/\b((?:src\/[a-z/]+\/)?[a-z][a-z0-9]*\.ts)\b/g)]
      .map((m) => m[1].replace(/^src\//, ''))
    const src = [...new Set(named)].map((f) => {
      const p = ['', 'src/engine', 'src/model', 'src/course']
        .map((d) => resolve(ROOT, d === '' ? `src/${f}` : `${d}/${f.split('/').pop()}`))
        .find(existsSync)
      expect(p, `${f} is not a file of this repository`).toBeDefined()
      return readFileSync(p!, 'utf8')
    }).join('\n')
    const syms = [...sourcesText.matchAll(/\b([A-Za-z][A-Za-z0-9]*(?:_[A-Z0-9]+)+|[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)]
      .map((m) => m[1])
    expect(syms.length, 'the identifiers `sources` names').toBeGreaterThan(2)
    for (const s of syms) {
      expect(src.includes(s), `\`${s}\` is named here, and by none of the files named with it`)
        .toBe(true)
    }
  })

  it('`observe`: the busy at 498, the freeze that lasts to 824, and the quiet 16 µs', () => {
    const [at] = figs(cca.observe[0], /在 (\d+) µs 报忙/, '`observe` on the busy')
    const [until] = figs(cca.observe[0], /一直停到 (\d+) µs/, '`observe` on how long the count stops')
    const b = mine.find((r) => r.t === at * 1_000)
    expect(b, `STA-1 does not turn busy at ${at} µs`).toBeDefined()
    expect(b!.cause).toBe('preamble')
    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === at * 1_000)
    expect(freeze, `nothing freezes STA-1’s count at ${at} µs`).toBeDefined()
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t > freeze!.t)!
    expect(resume.t / 1_000, 'when the count moves again').toBe(until)
    expect(resume.value, 'and it carries on from where it stopped').toBe(freeze!.value)

    const [pause] = figs(cca.observe[1], /在 (\d+) µs 处暂停/, '`observe` on where to pause')
    const [span] = figs(cca.observe[1], /可这 (\d+) µs 里没有任何人发送/, '`observe` on the quiet span')
    expect(ofType(rs, 'CCA_IDLE').some((r) => r.node === 'sta-1' && r.t === pause * 1_000)).toBe(true)
    const next = ofType(rs, 'TX_START').find((r) => r.t > pause * 1_000)!
    expect(next.t / 1_000 - pause, 'the quiet span before the next transmission').toBe(span)
  })

  it('the quiz: a level between the two lines, and the technology that can only be energy', () => {
    const [level] = figs(quizText, /到达你这里是 (−[\d.]+) dBm/, 'the quiz’s hypothetical level')
    // the whole point of that figure: above the lower line, below the higher one
    expect(level).toBeGreaterThan(CCA_PD_DBM)
    expect(level).toBeLessThan(CCA_ED_DBM)
    // and the options say exactly that, each naming the line it compares with
    const [high] = figs(quizText, /高于 (−[\d.]+) dBm 的前导检测门限/, 'the option that reads it as busy')
    const [low] = figs(quizText, /低于 (−[\d.]+) dBm/, 'the option that reads it as idle')
    expect(high).toBe(CCA_PD_DBM)
    expect(low).toBe(CCA_ED_DBM)
    // every dBm figure in the quiz is one of those three
    for (const v of everyDbm(quizText)) expect([CCA_PD_DBM, CCA_ED_DBM, level]).toContain(v)
    // the second question's answer depends on a path the engine has: another technology's
    // energy counts, and it can never be a preamble detection
    expect(readFileSync(resolve(ROOT, 'src/engine/channel.ts'), 'utf8')).toContain('spectrum')
    expect(quizText).toContain('超宽带')
  })
})
