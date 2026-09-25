/**
 * Every empirical claim in "Draw a number, count it down only through idle
 * slots", measured against the lesson's own scene (two saturated legacy stations
 * and one access point).
 *
 * Re-paced on 2026-09-25. This lesson's second rule — the deadline, the doubling
 * window and what the two cost over 300 ms — became `collisions-cw`, and seven
 * of the sixteen pins went with it: the 45 µs deadline, the t = 0 collision, the
 * 293/31/327 retry, the second collision at 8.1 ms, the 864/47 rate, the seed
 * sweep and the "no EIFS is ever armed" note. They are now in
 * tests/course/collisions-cw.test.ts, asserted against the same run, so nothing
 * is unpinned by the split.
 *
 * What stayed is the draw and the countdown: the window's floor, the draw's
 * range, one fresh draw per transmission, the mean wait, the idle-slot count and
 * the 770 freeze/resume pairs — plus the new timing figure, which is pinned span
 * by span against the run it is drawn from.
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * idle-slot count and the freeze-and-resume pairs — are re-asserted here beside
 * the sentences that carry them; the originals stay where they are.
 */
import { describe, it, expect } from 'vitest'
import { backoff, backoffTiming } from '../../src/course/tier1/backoff'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { CW_MIN, DIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
/** 300 ms: the window every count in "the numbers this run drew" is taken over. */
const RUN_NS = 300 * MS
const BOTH = ['sta-1', 'sta-2']

const recs = (): TLRecord[] => runOf(backoff, undefined, RUN_NS)
const draws = () => ofType(recs(), 'BACKOFF_DRAW')
const meanOf = (cw: number): number => {
  const v = draws().filter((r) => r.cw === cw).map((r) => r.value)
  return v.reduce((a, b) => a + b, 0) / v.length
}
const lane = (label: string): TimingLane => backoffTiming().lanes.find((l) => l.label === label)!

lessonShapeSuite(backoff, { runNs: RUN_NS })

describe('backoff · the lesson’s own scene', () => {
  it('follows ifs and owns the draw and the countdown', () => {
    expect(MODULES[backoff.module].title).toBe('等待与退避')
    expect(backoff.needs).toEqual(['ifs'])
    // `ACK timeout` left with the deadline, which is `collisions-cw`'s topic; `CW` stays,
    // because it is the range the draw comes from.
    expect(backoff.terms!.map((t) => t.term)).toEqual(['backoff', 'CW'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(backoff.scenario())).not.toThrow()
    expect(backoff.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
  })

  it('keeps one jump, the freeze the lesson is about', () => {
    // §2: "`backoff` keeps jump 2 (freeze) and the slot-counting experiment"; the collision,
    // the retry and the CW doubling are `collisions-cw`'s.
    expect(backoff.jumps.map((j) => j.label)).toEqual(['第一次退避冻结'])
    const first = ofType(recs(), 'BACKOFF_FREEZE')[0]
    expect(backoff.jumps[0].find(first)).toBe(true)
    expect([first.node, first.t, first.value]).toEqual(['sta-1', 498_000, 3])
  })
})

describe('backoff · the draw', () => {
  it('the window starts at its floor of 15, and this run draws 770 times from it', () => {
    // 「300 ms 里，这两台站点从下限窗口 CW = 15 抽了 770 次，平均抽到 7.15 个时隙」
    expect(CW_MIN).toBe(15)
    expect(draws().filter((r) => r.cw === CW_MIN).length).toBe(770)
    expect(meanOf(15).toFixed(2)).toBe('7.15')
    for (const d of draws()) {
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThanOrEqual(d.cw)
    }
  })

  it('the draw spans the whole window, both ends included', () => {
    // the procedure's step 2, "between 0 and CW, both ends included — sixteen possible
    //  values at CW 15, and zero is one of them"
    const v = draws().filter((r) => r.cw === CW_MIN).map((r) => r.value)
    expect(Math.min(...v)).toBe(0)
    expect(Math.max(...v)).toBe(CW_MIN)
    expect(new Set(v).size).toBe(CW_MIN + 1)
  })

  it('a slot is 9 µs, so the mean wait from the floor is about 64 µs — past a DIFS', () => {
    // 「每个时隙是 9 µs，于是平均等待约 64 µs——比一个 DIFS 还长一点」
    expect(SLOT_NS).toBe(9_000)
    expect(Math.round(meanOf(15) * SLOT_NS / 1_000)).toBe(64)
    expect(meanOf(15) * SLOT_NS).toBeGreaterThan(DIFS_NS)
  })

  it('every transmission owes a fresh draw: no station sends twice without one', () => {
    // the procedure's step 6 — releaseTxop and failAttemptCore in src/engine/mac.ts both
    // clear the counter and mark a draw owed.
    for (const n of BOTH) {
      let owed = true // the first frame of the run goes out on an idle channel with no draw
      let frames = 0
      for (const r of recs()) {
        if (!('node' in r) || r.node !== n) continue
        if (r.type === 'BACKOFF_DRAW') { owed = true; continue }
        if (r.type !== 'TX_START' || r.frame.kind !== 'data') continue
        if (r.frame.retryFlag) continue // a retry of the same MSDU, not a second attempt won afresh
        expect(owed, `${n} sent at ${r.t} without drawing`).toBe(true)
        owed = false
        frames++
      }
      expect(frames).toBeGreaterThan(300)
    }
  })
})

describe('backoff · the countdown, and the freeze', () => {
  it('the counted idle slots between a draw and the frame equal the number drawn', () => {
    // tryThis: "Count the idle slots between the end of a DIFS and the frame that follows
    //  it. It always equals the number that station drew."
    const last = new Map<string, { t: number; v: number; frozen: boolean }>()
    let checked = 0
    for (const r of recs()) {
      if (r.type === 'BACKOFF_DRAW') last.set(r.node, { t: r.t, v: r.value, frozen: false })
      if (r.type === 'BACKOFF_FREEZE' && last.has(r.node)) last.get(r.node)!.frozen = true
      if (r.type === 'TX_START' && r.frame.kind === 'data' && last.has(r.node)) {
        const d = last.get(r.node)!
        if (!d.frozen) { expect(r.t - d.t).toBe(d.v * SLOT_NS); checked++ }
        last.delete(r.node)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('a frozen counter resumes at exactly the value it stopped at, 770 times over', () => {
    // the observation "770 pairs here, not one losing a slot", and the quiz answer
    // "7 — exactly where it stopped"
    let pairs = 0
    for (const n of BOTH) {
      const ev = recs().filter((r): r is Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }> =>
        (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === n)
      for (let i = 0; i + 1 < ev.length; i++) {
        if (ev[i].type === 'BACKOFF_FREEZE' && ev[i + 1].type === 'BACKOFF_RESUME') {
          expect(ev[i + 1].value).toBe(ev[i].value)
          pairs++
        }
      }
    }
    expect(pairs).toBe(770)
  })

  it('a decrement only ever happens one slot after the last one, never through a frame', () => {
    // 「介质每空闲满一个 9 µs 的时隙，这个计数就减一」and 「空口一忙计数就该停」: two
    // consecutive decrements by one station are always exactly one slot apart. Anything that
    // interrupts the counting shows up between them — a freeze when the air went busy, a
    // fresh draw after the station transmitted — so those two record types are the
    // separators, and every pair the loop actually compares is a pair of counted slots.
    type Step = Extract<TLRecord, { type: 'BACKOFF_DEC' | 'BACKOFF_FREEZE' | 'BACKOFF_DRAW' }>
    for (const n of BOTH) {
      const ev = recs().filter((r): r is Step =>
        (r.type === 'BACKOFF_DEC' || r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_DRAW') && r.node === n)
      let checked = 0
      for (let i = 0; i + 1 < ev.length; i++) {
        if (ev[i].type !== 'BACKOFF_DEC' || ev[i + 1].type !== 'BACKOFF_DEC') continue
        expect(ev[i + 1].t - ev[i].t, `${n} at ${ev[i].t}`).toBe(SLOT_NS)
        expect(ev[i + 1].value).toBe(ev[i].value - 1)
        checked++
      }
      expect(checked).toBeGreaterThan(500)
    }
  })
})

describe('backoff · the timing figure is the run', () => {
  it('every span of the figure is a record: 480 → 498 frozen at 3 → 790 → 824 → 851 µs', () => {
    const air = lane('空口').spans
    const cnt = lane('STA-1 计数').spans
    const gap = lane('STA-1 间隙').spans[0]

    // the neighbour's frame, and the access point's answer
    const nbr = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t === 498_000)!
    expect(air[0].fromUs).toBe(nbr.t / 1000)
    expect(air[0].toUs).toBe((nbr.t + nbr.frame.txTimeNs) / 1000)
    expect([air[0].fromUs, air[0].toUs]).toEqual([498, 746])
    const ack = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'ack' && r.t > 746_000)!
    expect(air[1].fromUs).toBe(ack.t / 1000)
    expect(air[1].toUs).toBe((ack.t + ack.frame.txTimeNs) / 1000)
    expect([air[1].fromUs, air[1].toUs]).toEqual([762, 790])
    // STA-1's own frame, the one the whole freeze was delaying
    const mine = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-1' && r.t > 824_000)!
    expect(air[2].fromUs).toBe(mine.t / 1000)
    expect(air[2].fromUs).toBe(851)

    // the three decrements the first span covers, and the freeze that ends it
    const decs = ofType(recs(), 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-1' && r.t >= cnt[0].fromUs * 1000 && r.t <= cnt[0].toUs * 1000)
    expect(decs.map((r) => r.value)).toEqual([5, 4, 3])
    expect(cnt[0].label).toBe('5 4 3')
    const freeze = ofType(recs(), 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === 498_000)!
    expect(freeze.value).toBe(3)
    expect(cnt[1].fromUs).toBe(freeze.t / 1000)
    expect(cnt[1].label).toBe('冻住在 3')
    expect(cnt[1].tone).toBe('muted')

    // the frozen span runs to the instant the DIFS starts, and the DIFS is a whole DIFS
    const difs = ofType(recs(), 'IFS_START').find((r) => r.node === 'sta-1' && r.t === 790_000)!
    expect(difs.kind).toBe('DIFS')
    expect(cnt[1].toUs).toBe(difs.t / 1000)
    expect(gap.fromUs).toBe(difs.t / 1000)
    expect(gap.toUs).toBe(difs.untilNs / 1000)
    expect((gap.toUs - gap.fromUs) * 1000).toBe(DIFS_NS)

    // and it resumes at the same 3, counts it off in slots, and sends
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === 824_000)!
    expect(resume.value).toBe(freeze.value)
    expect(cnt[2].fromUs).toBe(resume.t / 1000)
    expect(cnt[2].toUs).toBe((resume.t + resume.value * SLOT_NS) / 1000)
    expect(cnt[2].toUs).toBe(mine.t / 1000)
    expect(ofType(recs(), 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-1' && r.t > resume.t && r.t <= mine.t).map((r) => r.value))
      .toEqual([2, 1, 0])
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(backoffTiming())
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
