/**
 * Every empirical claim in "Silence, a deadline, and a widened window", the
 * second half of `backoff` (2026-09-25 re-pacing, §2 M4).
 *
 * The scene is `backoff`'s, so `lessonShapeSuite(..., { sameSceneAs: 'backoff' })`
 * proves the two ids replay the same timeline and that their fixture lines agree
 * once the controller has written them.
 *
 * Seven pins arrive here from tests/course/backoff.test.ts, asserted against the
 * same run they always were: the 45 µs deadline, the t = 0 collision, the
 * 293/31/327 retry, the second collision at 8.1 ms, the 864/47 rate, the seed
 * sweep, and the two `deeper` notes (the access point locking onto neither
 * preamble, and no EIFS ever being armed). Nothing was re-derived and nothing was
 * relaxed.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with
 * the same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { collisionsCw, collisionTiming } from '../../src/course/tier1/collisions-cw'
import { backoff } from '../../src/course/tier1/backoff'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, RX_START_DELAY_NS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
} from '../../src/engine/phy'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, zhNumeral } from './coverage'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
/** 300 ms: the window the doubling table and the 864/47 sentence are counted over. */
const RUN_NS = 300 * MS
const BOTH = ['sta-1', 'sta-2']

const recs = (): TLRecord[] => runOf(collisionsCw, undefined, RUN_NS)
const draws = () => ofType(recs(), 'BACKOFF_DRAW')
const data = () => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'data')
const meanOf = (cw: number): number => {
  const v = draws().filter((r) => r.cw === cw).map((r) => r.value)
  return v.reduce((a, b) => a + b, 0) / v.length
}
const lane = (label: string): TimingLane => collisionTiming().lanes.find((l) => l.label === label)!

lessonShapeSuite(collisionsCw, { sameSceneAs: 'backoff', runNs: RUN_NS })

describe('collisions-cw · the lesson’s own scene', () => {
  it('follows its first half, sits in the same module, and owns the deadline', () => {
    expect(collisionsCw.id).toBe('collisions-cw')
    expect(MODULES[collisionsCw.module].title).toBe('等待与退避')
    expect(collisionsCw.module).toBe(backoff.module)
    expect(collisionsCw.needs).toEqual(['backoff'])
    expect(collisionsCw.terms!.map((t) => t.term)).toEqual(['ACK timeout', 'retry', 'CW'])
  })

  it('the scenario passes the schema and is the first half’s, node for node', () => {
    expect(() => ScenarioSchema.parse(collisionsCw.scenario())).not.toThrow()
    expect(collisionsCw.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(collisionsCw.scenario()).toEqual(backoff.scenario())
  })

  it('takes the three jumps the first half gave up, and each occurs in the run', () => {
    expect(collisionsCw.jumps.map((j) => j.label))
      .toEqual(['第一次碰撞', '第一次重传', '第一次 CW 翻倍'])
    for (const j of collisionsCw.jumps) expect(recs().some(j.find), j.label).toBe(true)
    // and the freeze stayed with the first half
    expect(backoff.jumps.map((j) => j.label)).toEqual(['第一次退避冻结'])
  })
})

describe('collisions-cw · the deadline', () => {
  it('is 16 + 9 + 20 = 45 µs', () => {
    // the "why the deadline falls where it does" table, and the procedure's step 1
    expect(SIFS_NS).toBe(16_000)
    expect(SLOT_NS).toBe(9_000)
    expect(RX_START_DELAY_NS).toBe(20_000)
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
  })

  it('the first collision is a t = 0 start with no draw at all, reported at 248 µs', () => {
    // 「两台站点都发现信道空着，都走完了一个长度为零的间隙，于是连抽都没抽就同时开了口」
    const cols = ofType(recs(), 'COLLISION')
    expect(cols[0].t).toBe(248_000)
    expect(cols[0].nodes.slice().sort()).toEqual(BOTH)
    expect(ofType(recs(), 'TX_START').filter((r) => r.t === 0).map((r) => r.node).sort()).toEqual(BOTH)
    expect(draws().some((r) => r.t < 248_000)).toBe(false)
  })

  it('nothing at all happens on the air between the frame end and the deadline', () => {
    // tryThis: "step from the end of the collided frames to 293 µs. Nothing happens on the
    //  air — and that silence is the only failure signal the sender ever gets."
    const between = recs().filter((r) => r.t > 248_000 && r.t < 293_000)
    expect(between.filter((r) => r.type === 'TX_START' || r.type === 'RX_START')).toEqual([])
    for (const n of BOTH) {
      expect(ofType(recs(), 'ACK_TIMEOUT').find((r) => r.node === n)!.t).toBe(293_000)
    }
    expect(293_000 - 248_000).toBe(ACK_TIMEOUT_NS)
  })
})

describe('collisions-cw · the window that doubles', () => {
  it('the deadline expires at 293 µs, both windows double to 31, and the redraw is at 327 µs', () => {
    // the caption: "the deadline expires at 293 µs, both windows double to 31 in the same
    //  instant, and each walks a DIFS to 327 µs before drawing again", plus the observation
    //  "every retry frame carries the Retry flag"
    for (const n of BOTH) {
      expect(ofType(recs(), 'CW_CHANGE').find((r) => r.node === n && r.t === 293_000)!.cw).toBe(31)
      const difs = ofType(recs(), 'IFS_START').find((r) => r.node === n && r.t === 293_000)!
      expect(difs.kind).toBe('DIFS')
      expect(difs.untilNs).toBe(327_000)
      const draw = draws().find((r) => r.node === n && r.t > 248_000)!
      expect(draw.t).toBe(327_000)
      expect(draw.cw).toBe(31)
      expect(ofType(recs(), 'TX_START').find((r) => r.node === n && r.t > 293_000)!.frame.retryFlag).toBe(true)
      expect(ofType(recs(), 'RETRY').find((r) => r.node === n)!.t).toBe(293_000)
    }
  })

  it('STA-1 draws 22 and STA-2 draws 19, so STA-2 opens at 498 µs and STA-1 freezes at the difference', () => {
    // the caption's last sentence, which is also what hands the reader back to `backoff`'s
    // own figure: the 3 it freezes at is 22 − 19.
    const at327 = new Map(draws().filter((r) => r.t === 327_000).map((r) => [r.node, r.value]))
    expect(at327.get('sta-1')).toBe(22)
    expect(at327.get('sta-2')).toBe(19)
    const tx = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t > 327_000)!
    expect(tx.t).toBe(327_000 + 19 * SLOT_NS)
    expect(tx.t).toBe(498_000)
    const freeze = ofType(recs(), 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === 498_000)!
    expect(freeze.value).toBe(22 - 19)
  })

  it('the window ladder is the engine’s: floor 15, twice plus one, ceiling 1023, reset at seven', () => {
    // the procedure's steps 3, 5 and 6, against bumpQsrc and resetQsrc in src/engine/mac.ts.
    // Proved over the whole ladder, not only the 15 → 31 this run reaches.
    expect(CW_MIN).toBe(15)
    expect(CW_MAX).toBe(1023)
    expect(SHORT_RETRY_LIMIT).toBe(7)
    const ladder = [CW_MIN]
    while (ladder[ladder.length - 1] < CW_MAX) ladder.push(Math.min(2 * ladder[ladder.length - 1] + 1, CW_MAX))
    expect(ladder).toEqual([15, 31, 63, 127, 255, 511, 1023])
    for (const n of BOTH) {
      let cw = CW_MIN
      for (const c of ofType(recs(), 'CW_CHANGE').filter((r) => r.node === n)) {
        expect([CW_MIN, Math.min(2 * cw + 1, CW_MAX)], `${n} at ${c.t}`).toContain(c.cw)
        cw = c.cw
      }
    }
  })

  it('the three windows, their counts and their mean draws are the run’s own', () => {
    // the "does the doubling work in this run" table: 15 · 770 · 7.15 / 31 · 89 · 16.07 /
    //  63 · 5 · 23.80, and "not one draw reaches 127"
    const byCw = new Map<number, number>()
    for (const d of draws()) byCw.set(d.cw, (byCw.get(d.cw) ?? 0) + 1)
    expect([...byCw.keys()].sort((a, b) => a - b)).toEqual([15, 31, 63])
    expect(byCw.get(15)).toBe(770)
    expect(byCw.get(31)).toBe(89)
    expect(byCw.get(63)).toBe(5)
    expect(meanOf(15).toFixed(2)).toBe('7.15')
    expect(meanOf(31).toFixed(2)).toBe('16.07')
    expect(meanOf(63).toFixed(2)).toBe('23.80')
    // 「从 31 抽出来的平均等待…比从下限抽的 7.15 个多了一倍有余」
    expect(meanOf(31)).toBeGreaterThan(2 * meanOf(15))
  })

  it('864 frames and 47 collisions across 300 ms — roughly one attempt in twenty', () => {
    expect(data().length).toBe(864)
    expect(ofType(recs(), 'COLLISION').length).toBe(47)
    const rate = 47 / 864
    expect(rate).toBeGreaterThan(0.04)
    expect(rate).toBeLessThan(0.08)
  })

  it('the second collision is at about 8.1 ms, both counters hitting zero in one slot', () => {
    // the observation "jump to the second collision, at about 8.1 ms, and step backwards"
    const second = ofType(recs(), 'COLLISION')[1]
    expect(Math.round(second.t / 100_000) / 10).toBe(8.1)
    const starts = ofType(recs(), 'TX_START').filter((r) =>
      r.frame.kind === 'data' && r.t < second.t && r.t + r.frame.txTimeNs >= second.t)
    expect(starts.map((r) => r.node).sort()).toEqual(BOTH)
    expect(starts[0].t).toBe(starts[1].t)
    for (const n of BOTH) {
      expect(ofType(recs(), 'BACKOFF_DEC').some((r) => r.node === n && r.t === starts[0].t && r.value === 0)).toBe(true)
    }
  })
})

describe('collisions-cw · what the depth says', () => {
  it('the access point locks onto neither preamble, so no EIFS is ever armed', () => {
    // `deeper`: "the access point starts no reception at all", and "not a single EIFS is
    //  ever started across this whole run"
    for (const c of ofType(recs(), 'COLLISION')) {
      const starts = ofType(recs(), 'TX_START').filter((r) =>
        BOTH.includes(r.node) && r.frame.kind === 'data' && r.t < c.t && r.t + r.frame.txTimeNs >= c.t)
      expect(starts.length).toBe(2)
      expect(starts[0].t).toBe(starts[1].t)
      expect(ofType(recs(), 'RX_MISS').filter((r) => r.node === 'ap' && r.t === starts[0].t)
        .map((r) => r.from).sort()).toEqual(BOTH)
    }
    expect(ofType(recs(), 'RX_FAIL').some((r) => r.node === 'ap')).toBe(false)
    expect(ofType(recs(), 'IFS_START').some((r) => r.kind === 'EIFS')).toBe(false)
  })

  it('another seed gives other draws and the same rough rate', () => {
    // tryThis in the parent, kept here with the rate it is about
    for (const seed of [1, 2, 3, 11]) {
      const s: Scenario = { ...collisionsCw.scenario(), seed }
      const rs = [...new Simulation(s).runUntil(RUN_NS).records]
      const d = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data').length
      const c = rs.filter((r) => r.type === 'COLLISION').length
      expect(c / d, `seed ${seed}`).toBeGreaterThan(0.04)
      expect(c / d, `seed ${seed}`).toBeLessThan(0.08)
    }
  })
})

describe('collisions-cw · the timing figure is the run', () => {
  it('two identical lanes, a 45 µs deadline and a 34 µs DIFS, all from records', () => {
    const starts = ofType(recs(), 'TX_START').filter((r) => r.t === 0)
    expect(starts.length).toBe(2)
    for (const [i, n] of BOTH.entries()) {
      const sp = lane(n === 'sta-1' ? 'STA-1' : 'STA-2').spans[0]
      const tx = starts.find((r) => r.node === n)!
      expect(sp.fromUs, n).toBe(tx.t / 1000)
      expect(sp.toUs, n).toBe((tx.t + tx.frame.txTimeNs) / 1000)
      expect(sp.tone).toBe('accent')
      expect(i).toBeLessThan(2)
    }
    // the two lanes really are the same span, which is the caption's whole claim
    expect(lane('STA-1').spans[0]).toEqual(lane('STA-2').spans[0])

    const wait = lane('等回答').spans[0]
    expect(wait.fromUs).toBe(248)
    expect((wait.toUs - wait.fromUs) * 1000).toBe(ACK_TIMEOUT_NS)
    expect(wait.toUs).toBe(ofType(recs(), 'ACK_TIMEOUT')[0].t / 1000)

    const again = lane('重来').spans[0]
    const difs = ofType(recs(), 'IFS_START').find((r) => r.node === 'sta-1' && r.t === 293_000)!
    expect(again.fromUs).toBe(difs.t / 1000)
    expect(again.toUs).toBe(difs.untilNs / 1000)
    expect(again.toUs).toBe(draws().find((r) => r.t > 248_000)!.t / 1000)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(collisionTiming())
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
describe('collisions-cw · every official term carries its English name', () => {
  const zh = [collisionsCw.why!, ...collisionsCw.outcomes!]
    .concat(paragraphTexts(collisionsCw.picture!), cellTexts(collisionsCw.picture!))
    .concat(paragraphTexts(collisionsCw.numbers!), cellTexts(collisionsCw.numbers!))
    .concat(collisionsCw.observe, collisionsCw.tryThis,
      collisionsCw.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(collisionsCw))

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
 * Everything above pins the engine against literals written here — 45 µs, 293, 327, 22/19/3,
 * the 770/89/5 ladder, 864 frames and 47 collisions — and `scripts/figure-planting.ts` sampled
 * this lesson on 2026-10-12: **six of six sampled figures were editable with this file green.**
 * They would be: the deadline is stated four times (a table row, a step, `sources`, the figure's
 * own label), the window ladder three times, and the two censuses twice each.
 *
 * So each site is read here. Three things in this lesson are claims about documents rather than
 * about the engine, and they are read as what they are: the deadline table's 出处 column cites
 * the same clause three times for three figures `sources` derives from one formula, and the
 * capture margin's 「取自 ns-3 的默认值」 is a statement about another simulator — what is
 * checked is that this engine's constant is the figure the limit prints.
 */
describe('collisions-cw · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const d = data()
  const cols = ofType(rs, 'COLLISION')
  const timeouts = ofType(rs, 'ACK_TIMEOUT')

  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = collisionsCw.numbers!.find((x) => x.kind === 'table'
      && ((x as { heading?: string }).heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  const steps = (collisionsCw.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const caption = (collisionsCw.numbers!.find((x) => x.kind === 'diagram') as
    { caption: string }).caption
  const rateProse = (collisionsCw.numbers!.find((x) => (x as { heading?: string }).heading === '出错的频率') as
    { text: string }).text
  const pictureText = (collisionsCw.picture! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const deeperText = (collisionsCw.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const limitText = collisionsCw.limits.map((x) => x.text).join('\n')
  const sourcesText = collisionsCw.sources!.join('\n')

  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] =>
    raw(text, re, what).map((x) => Number(x.replace(/[\s,]/g, '')))
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '')
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
  const lane = (label: string): TimingLane => collisionTiming().lanes.find((l) => l.label === label)!
  /** The first collision's deadline, which most of this lesson's figures are about. */
  const firstTimeout = timeouts[0]

  it('the deadline table: its three parts, their sum, and the one clause they come from', () => {
    // `outcomes` states the deadline too — 「把 45 µs 的期限拆成三段」 — and the three parts it
    // promises are the three rows below, which is the one figure in this lesson's own outcomes
    const out = collisionsCw.outcomes!.join('\n')
    const [promised] = figs(out, /把 (\d+) µs 的期限拆成/, '`outcomes` on the deadline')
    const parts = counted(out, new RegExp(`拆成(${ZH})段`), '`outcomes` on how many parts')
    expect(promised * 1_000).toBe(ACK_TIMEOUT_NS)
    const rows = tableWith('那个期限为什么落在这里').rows
    expect(rows.length - 1, 'the parts the table breaks it into').toBe(parts)
    expect(rows, 'the table states exactly the four rows this reads').toHaveLength(4)
    const [sifs, slot, delay, total] = rows.map((r) => Number(r[1]))
    expect(sifs * 1_000).toBe(SIFS_NS)
    expect(slot * 1_000).toBe(SLOT_NS)
    expect(delay * 1_000).toBe(RX_START_DELAY_NS)
    expect(total * 1_000).toBe(ACK_TIMEOUT_NS)
    expect(sifs + slot + delay, 'the table’s own three parts against its own total').toBe(total)
    // the first three cite one clause and the total another, and `sources` names both
    expect(new Set(rows.slice(0, 3).map((r) => r[3])).size, 'one clause for the three parts').toBe(1)
    for (const r of rows) {
      expect(sourcesText, `the table cites ${r[3]} and \`sources\` never names it`).toContain(r[3])
    }
    // and the deadline really is that long, every time it fires in this run
    expect(timeouts.length).toBeGreaterThan(40)
    for (const t of timeouts) {
      const mine = d.filter((x) => x.node === t.node && x.t + x.frame.txTimeNs <= t.t).pop()!
      expect(t.t - (mine.t + mine.frame.txTimeNs), `the deadline at ${t.t}`).toBe(total * 1_000)
    }
  })

  it('the caption: the deadline, the doubling, the redraw, and the two draws it compares', () => {
    const [deadline, at] = figs(caption, /(\d+) µs 的期限在 (\d+) µs 到期/, 'the caption on the deadline')
    const [cw] = figs(caption, /两边的窗口在同一刻翻倍到 (\d+)/, 'the caption on the new window')
    const [redraw] = figs(caption, /各走一个 DIFS 到 (\d+) µs 才重新抽/, 'the caption on the redraw')
    const [a, b] = figs(caption, /STA-1 抽到 (\d+)、STA-2 抽到 (\d+)/, 'the caption on the two draws')
    const [opens] = figs(caption, /STA-2 在 (\d+) µs 先发送/, 'the caption on who opens')
    const [held] = figs(caption, /正好冻在两者之差 (\d+) 上/, 'the caption on the frozen value')

    expect(deadline * 1_000).toBe(ACK_TIMEOUT_NS)
    expect(firstTimeout.t / 1_000, 'when the deadline fires').toBe(at)
    const doubles = ofType(rs, 'CW_CHANGE').filter((r) => r.t === firstTimeout.t)
    expect(doubles.length, 'both stations double at that instant').toBe(2)
    for (const c of doubles) expect(c.cw, `${c.node}’s new window`).toBe(cw)
    const draw = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.t === redraw * 1_000)
    expect(draw.length, `two draws at ${redraw} µs`).toBe(2)
    expect(draw.find((r) => r.node === 'sta-1')!.value, 'STA-1’s draw').toBe(a)
    expect(draw.find((r) => r.node === 'sta-2')!.value, 'STA-2’s draw').toBe(b)
    const next = ofType(rs, 'TX_START').find((r) => r.t > redraw * 1_000)!
    expect(next.node, 'who opens').toBe('sta-2')
    expect(next.t / 1_000, 'and when').toBe(opens)
    expect(Math.abs(a - b), 'the difference the caption calls the frozen value').toBe(held)
    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === next.t)!
    expect(freeze.value, 'which is what STA-1 really freezes at').toBe(held)
  })

  it('the figure’s four lanes carry the frame, the deadline and the gap', () => {
    const [from, to] = [lane('STA-1').spans[0], lane('STA-2').spans[0]]
      .map((s) => [s.fromUs, s.toUs]) as [number[], number[]]
    expect(from, 'the two lanes are identical, which is the lesson’s point').toEqual(to)
    const zero = d.filter((r) => r.t === 0)
    expect(zero.length, 'the two frames the figure draws').toBe(2)
    for (const f of zero) {
      expect([0, f.frame.txTimeNs / 1_000], `${f.node}’s frame`).toEqual(from)
    }
    const wait = lane('等回答').spans[0]
    same(raw(wait.label ?? '', /^(\d+) µs$/, 'the deadline lane’s label')[0],
      ACK_TIMEOUT_NS / 1_000, 'the deadline the figure draws')
    expect((wait.toUs - wait.fromUs) * 1_000, 'and the span it labels').toBe(ACK_TIMEOUT_NS)
    expect(wait.fromUs, 'which starts where the frames end').toBe(from[1])
    const difs = lane('重来').spans[0]
    expect(difs.label).toBe('DIFS')
    const ifs = ofType(rs, 'IFS_START').find((r) => r.t === firstTimeout.t)!
    expect([difs.fromUs, difs.toUs], 'the gap the figure draws')
      .toEqual([ifs.t / 1_000, ifs.untilNs / 1_000])
  })

  it('the steps: the deadline’s arithmetic, the ladder, and the retry limit', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    const [a, b, c, sum] = figs(steps[0], /期限是 (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/,
      'step 1’s arithmetic')
    expect([a, b, c].map((x) => x * 1_000)).toEqual([SIFS_NS, SLOT_NS, RX_START_DELAY_NS])
    expect((a + b + c) * 1_000, 'step 1’s own sum').toBe(ACK_TIMEOUT_NS)
    expect(sum * 1_000).toBe(ACK_TIMEOUT_NS)
    // step 3: 「CW 的两倍再加一」, the ceiling, and the ladder it prints
    const [ceil] = figs(steps[2], /上限是 (\d+)/, 'step 3’s ceiling')
    const ladder = figs(steps[2], /于是 (\d+)、(\d+)、(\d+)/, 'step 3’s first three rungs')
    expect(ceil).toBe(CW_MAX)
    expect(ladder[0]).toBe(CW_MIN)
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i], `rung ${i}`).toBe(Math.min(2 * ladder[i - 1] + 1, CW_MAX))
    }
    // and the run uses exactly those rungs: it climbs to the widest the lesson prints and
    // comes back to the floor, which is the whole ladder and nothing above it
    expect([...new Set(ofType(rs, 'CW_CHANGE').map((r) => r.cw))].sort((x, y) => x - y))
      .toEqual(ladder)
    // step 5: 「连续失败到第七次」
    const seventh = counted(steps[4], new RegExp(`连续失败到第(${ZH})次`), 'step 5’s retry limit')
    expect(seventh).toBe(SHORT_RETRY_LIMIT)
  })

  it('the doubling table and 「出错的频率」: the same three windows and the same two censuses', () => {
    const rows = tableWith('翻倍在本轮里管用吗').rows
    expect(rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    const [ms] = figs(tableWith('翻倍在本轮里管用吗').head[1], /(\d+) ms/, 'the window it counts over')
    expect(ms * MS).toBe(RUN_NS)
    for (const r of rows) {
      const [cw] = figs(r[0], /CW = (\d+)/, `the window 「${r[0]}」 names`)
      const mine = draws().filter((x) => x.cw === cw)
      expect(mine.length, `draws from CW = ${cw}`).toBe(Number(r[1]))
      same(r[2], meanOf(cw), `the mean draw from CW = ${cw}`)
    }
    // 「300 ms 里这两台站点一共发出 864 帧，碰撞 47 次——大约二十次里错一次」
    const [window2] = figs(rateProse, /(\d+) ms 里/, 'the window the census is over')
    const [frames, hits] = figs(rateProse, /一共发出 (\d+) 帧，碰撞 (\d+) 次/, 'the census')
    const inTwenty = counted(rateProse, new RegExp(`大约(${ZH})次里错一次`), 'the rate it rounds to')
    expect(window2 * MS).toBe(RUN_NS)
    expect(d.length).toBe(frames)
    expect(cols.length).toBe(hits)
    // 「大约」: one significant figure, so the rate rounds to that many attempts per collision
    expect(Math.round(frames / hits / 10) * 10, `${frames} frames, ${hits} collisions`)
      .toBe(inTwenty)
    // 「整轮下来只有五次抽取来自宽达 63 的窗口，一次也没走到 127」
    const five = counted(rateProse, new RegExp(`只有(${ZH})次抽取来自宽达 (\\d+) 的窗口`),
      'the draws from the widest window')
    const [widest] = figs(rateProse, /宽达 (\d+) 的窗口/, 'the widest window used')
    const [never] = figs(rateProse, /一次也没走到 (\d+)/, 'the window never reached')
    expect(draws().filter((r) => r.cw === widest).length).toBe(five)
    expect(draws().filter((r) => r.cw >= never), `draws from CW = ${never} or wider`).toHaveLength(0)
    expect(never, 'which is the next rung above the widest one used').toBe(2 * widest + 1)
    // 「从 31 抽出来的平均等待是 16.07 个时隙，比从下限抽的 7.15 个多了一倍有余」
    const [mid, midMean, floorMean] = figs(rateProse,
      /从 (\d+) 抽出来的平均等待是 ([\d.]+) 个时隙，比从下限抽的 ([\d.]+) 个/, 'the two means')
    same(String(midMean), meanOf(mid), `the mean draw from CW = ${mid}`)
    same(String(floorMean), meanOf(CW_MIN), 'the mean draw from the floor')
    expect(midMean / floorMean, '「多了一倍有余」').toBeGreaterThan(2)
  })

  it('`picture`, `deeper`, `observe` and `tryThis`: the same instants, read where they are printed', () => {
    // 「两个数据帧在 0 µs 同时开始、248 µs 同时结束」
    const [start, end] = figs(pictureText, /在 (\d+) µs 同时开始、(\d+) µs 同时结束/,
      '`picture` on the two frames')
    const zero = d.filter((r) => r.t === start * 1_000)
    expect(zero.length, `frames starting at ${start} µs`).toBe(2)
    for (const f of zero) {
      expect((f.t + f.frame.txTimeNs) / 1_000, `${f.node}’s frame ends`).toBe(end)
    }
    // 「检视器里两台站点的竞争窗口都已经是 31」
    const [cw] = figs(pictureText, /竞争窗口都已经是 (\d+)/, '`picture` on the window at the retry')
    const retry = ofType(rs, 'TX_START').find((r) => r.frame.retryFlag)!
    for (const n of BOTH) {
      const last = ofType(rs, 'CW_CHANGE').filter((r) => r.node === n && r.t <= retry.t).pop()!
      expect(last.cw, `${n}’s window at the first retry`).toBe(cw)
    }
    // `deeper`: 「重传前的 DIFS 是从 293 µs 超时结束那一刻起算的，而不是从 248 µs 碰撞帧结束」
    const [from, notFrom] = figs(deeperText, /从 (\d+) µs 超时结束那一刻起算的，而不是从 (\d+) µs/,
      '`deeper` on where the gap starts')
    expect(firstTimeout.t / 1_000).toBe(from)
    expect(zero[0].t + zero[0].frame.txTimeNs, 'and the frames really end at the other one')
      .toBe(notFrom * 1_000)
    const ifs = ofType(rs, 'IFS_START').find((r) => r.t === from * 1_000)
    expect(ifs, `no gap starts at ${from} µs`).toBeDefined()
    // 「整轮仿真里一个 EIFS 都没有启动过」
    expect(ofType(rs, 'IFS_START').filter((r) => r.kind === 'EIFS'), 'EIFS gaps').toHaveLength(0)
    // `observe`: 「之后两台站点的 CW 都变成 31」 and 「约 8.1 ms 处的第二次碰撞」
    const [obsCw] = figs(collisionsCw.observe.join('\n'), /CW 都变成 (\d+)/, '`observe` on the window')
    expect(obsCw).toBe(cw)
    const [second] = figs(collisionsCw.observe.join('\n'), /约 ([\d.]+) ms 处的第二次碰撞/,
      '`observe` on the second collision')
    same(String(second), cols[1].t / MS, 'when the second collision happens')
    // `tryThis`: 「一步步走到 293 µs。空口上什么也没有发生」
    const [until] = figs(collisionsCw.tryThis.join('\n'), /一步步走到 (\d+) µs/,
      '`tryThis` on where to walk')
    expect(until).toBe(from)
    expect(ofType(rs, 'TX_START').some((r) => r.t > notFrom * 1_000 && r.t < until * 1_000),
      'something is on the air in the silence the reader is asked to walk').toBe(false)
  })

  it('`limits` and `sources`: the capture margin, the ladder, and the retry limit', () => {
    // 「捕获余量是一个固定的 5 dB」 and 「（channel.ts 的 CAPTURE_MARGIN_DB 与 captureWindowNs）」
    const [margin] = figs(limitText, /固定的 (\d+) dB/, '`limits` on the capture margin')
    // `CAPTURE_MARGIN_DB` is not exported, and the limit cites it by file and by name — so the
    // figure is read out of the file the citation points at, which checks both at once.
    const cited = /（([a-z]+\.ts) 的 (CAPTURE_MARGIN_DB) 与 (\w+)）/.exec(limitText)
    expect(cited, '`limits` no longer cites the margin and the window').not.toBeNull()
    const chan = readFileSync(resolve(ROOT, `src/engine/${cited![1]}`), 'utf8')
    expect(chan, `${cited![1]} declares ${cited![3]}`).toContain(cited![3])
    const decl = new RegExp(`${cited![2]} = (\\d+)`).exec(chan)
    expect(decl, `${cited![1]} declares ${cited![2]}`).not.toBeNull()
    expect(Number(decl![1]), 'the margin the engine really uses').toBe(margin)
    const [again] = figs(limitText, /必须比正在接收的那一帧强 (\d+) dB/, '`limits` restating it')
    expect(again).toBe(margin)
    const [deadline] = figs(limitText, /(\d+) µs 的期限精确到纳秒/, '`limits` on the deadline')
    expect(deadline * 1_000).toBe(ACK_TIMEOUT_NS)
    // `sources`: the deadline's three parts again, and the ladder's ends
    const parts = figs(sourcesText, /就是 (\d+) \+ (\d+) \+ (\d+) µs/, '`sources` on the deadline')
    expect(parts.map((x) => x * 1_000)).toEqual([SIFS_NS, SLOT_NS, RX_START_DELAY_NS])
    const [floor, ceil, limit] = figs(sourcesText,
      /aCWmin (\d+)、aCWmax (\d+) 与 dot11ShortRetryLimit (\d+)/, '`sources` on the three constants')
    expect([floor, ceil, limit]).toEqual([CW_MIN, CW_MAX, SHORT_RETRY_LIMIT])
    const rungs = figs(sourcesText, /(\d+) → (\d+) → (\d+) → … → (\d+)/, '`sources` on the ladder')
    expect(rungs[0]).toBe(CW_MIN)
    expect(rungs[rungs.length - 1]).toBe(CW_MAX)
    for (let i = 1; i < rungs.length - 1; i++) {
      expect(rungs[i], `rung ${i}`).toBe(2 * rungs[i - 1] + 1)
    }
    // 「两台饱和站点与 1528 字节的帧」
    const stations = counted(sourcesText, new RegExp(`(${ZH})台饱和站点`), '`sources` on the stations')
    const [bytes] = figs(sourcesText, /([\d,]+) 字节的帧/, '`sources` on the frame')
    expect(collisionsCw.scenario().nodes.filter((n) => n.profiles?.includes('saturated')))
      .toHaveLength(stations)
    expect(new Set(d.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
  })
})
