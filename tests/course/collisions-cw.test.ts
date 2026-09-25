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
