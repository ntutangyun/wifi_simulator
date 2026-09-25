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
import { buildLinkTable } from '../../src/engine/propagation'
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
