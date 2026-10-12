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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CW_MIN, DIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { ROOT, zhNumeral } from './coverage'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { lessonStrings } from '../../src/course/readability'
import { hasFeature } from '../../src/model/caps'
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

/**
 * **The ruler for this lesson's one `until` (slice 4e, 2026-10-05).**
 *
 * `until` promises the named lesson REMOVES the simplification, and until this commit
 * nothing checked that: `tests/course/limits.test.ts` asked only that `txop` exists and is
 * not `backoff`, and this file never mentioned `txop` once. Half the course's eight
 * promises had no evidence of any kind behind them, and this was one of them.
 *
 * This one is kept, and it was already on the right kind. The claim is that 「一次成功只换
 * 来一帧」 is a property of THIS scene rather than of the engine — true, and the axis is the
 * station generation: both stations here are `nonht`, whose `GEN_FEATURES` entry is the
 * empty set, so `txop` never negotiates; in `txop` both are `vht` and all three of
 * `edca`/`ampdu`/`txop` come up. The engine has had TXOP and aggregation all along, which
 * is also why `anomaly`'s near-identical limit was mislabelled `unmodelled` until this
 * commit while this one was already `out-of-scope`.
 */
describe('backoff · the one-frame-per-win limit, and the lesson that lifts it', () => {
  const lim = backoff.limits.find((l) => l.until === 'txop')

  it('promises a lift, on the only kind a lift is coherent about', () => {
    expect(lim, 'the one-frame limit no longer points at `txop`').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.seeAlso, 'a lift and a deeper read are different promises').toBeUndefined()
    expect(lim!.text).toContain('一次成功只换来一帧')
    // the figure the limit qualifies stays with it, so the reader knows what the lift costs
    expect(lim!.text).toContain('平均等待约 64 µs')
  })

  it('and the axis is the station generation, measured on both scenes', () => {
    const stations = (id: string) => LESSONS.find((l) => l.id === id)!.scenario()
      .nodes.filter((n) => n.id !== 'ap')
    for (const n of stations('backoff')) {
      expect(n.caps.generation, `${n.id} in backoff`).toBe('nonht')
      expect(hasFeature(n, 'txop'), `${n.id} negotiates txop`).toBe(false)
    }
    const there = stations('txop')
    expect(there.length).toBeGreaterThan(1)
    for (const n of there) {
      expect(n.caps.generation, `${n.id} in txop`).toBe('vht')
      expect(hasFeature(n, 'txop'), `${n.id} is missing txop`).toBe(true)
    }
  })

  it('and `txop` really is about the thing this limit says is absent', () => {
    const t = LESSONS.find((l) => l.id === 'txop')!
    const text = lessonStrings(t).join(' / ')
    // this limit's sentence is 「一次成功只换来一帧 …… 可以连发一串」; that lesson's own title
    // and `why` are the other half of it
    expect(t.title).toContain('一次竞争成功，换来一段信道占用时间')
    expect(text).toContain('一次竞争成功不再只换来一次交互')
    expect(text).toContain('一串')
    expect(COURSE_ORDER.indexOf('txop')).toBeGreaterThan(COURSE_ORDER.indexOf('backoff'))
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * `scripts/figure-planting.ts` measured this lesson on 2026-10-12: **42 of its 47 printed
 * figures were editable with this file green.** Everything above pins the engine against
 * literals written here — `CW_MIN`, the 770 draws, the mean 7.15, the freeze at 498 with value
 * 3 — and the figure's own spans are already read out of `backoffTiming()`, which is why five
 * were pinned. What was not read is the prose that restates them: the caption walks seven
 * instants and three counter values in one sentence, `picture` names two of them again, the
 * draw paragraph prints 770 / 7.15 / 9 / 64 a second time, `limits` prints 770 and 7.15 a
 * third, `sources` a fourth, and the quiz's frozen 7 is a hypothesis nothing checked.
 *
 * So each site is read here, including the two the figure labels carry (「5 4 3」 and
 * 「3 2 1 0」, which are the decrements either side of the freeze) and 「冻住在 3」. The one
 * figure that is a claim about another lesson — 「CW 为 15 时共十六个可能值」 — is checked
 * against the engine's own draw range rather than against the sentence next to it.
 */
describe('backoff · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const decs = ofType(rs, 'BACKOFF_DEC')
  const freezes = ofType(rs, 'BACKOFF_FREEZE')
  const resumes = ofType(rs, 'BACKOFF_RESUME')
  const txs = ofType(rs, 'TX_START')

  const caption = (backoff.numbers!.find((x) => x.kind === 'diagram') as { caption: string }).caption
  const drawProse = (backoff.numbers!.find((x) => (x as { heading?: string }).heading === '本轮抽出来的数') as
    { text: string }).text
  const steps = (backoff.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const pictureText = (backoff.picture! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const limitText = backoff.limits.map((x) => x.text).join('\n')
  const sourcesText = backoff.sources!.join('\n')
  const quizText = backoff.quiz!.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')

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
  const lane = (label: string): TimingLane => backoffTiming().lanes.find((l) => l.label === label)!

  it('`picture`: the draw’s range, and the two instants the watch call-out names', () => {
    const [from] = figs(pictureText, /抽的范围是 (\d+) 到竞争窗口/, '`picture` on the draw’s floor')
    expect(from).toBe(0)
    expect(Math.min(...draws().map((r) => r.value)), 'the smallest number this run ever drew')
      .toBe(from)
    // 「两端都算」: the top of the range is the window itself, and this run reaches it. From
    // the FLOOR window — the run's largest draw is 57, out of a window that doubled after a
    // collision, which is `collisions-cw`'s subject and not this lesson's.
    expect(Math.max(...draws().filter((r) => r.cw === CW_MIN).map((r) => r.value))).toBe(CW_MIN)

    // 「邻居的数据帧在 498 µs 开始发送，STA-1 的计数器正好数到 3，就停在那里不动……824 µs 才继续」
    const [at] = figs(pictureText, /在 (\d+) µs 开始发送/, '`picture` on when the neighbour starts')
    const [value] = figs(pictureText, /计数器正好数到 (\d+)/, '`picture` on the frozen value')
    const [until] = figs(pictureText, /(\d+) µs 才继续/, '`picture` on when it carries on')
    const freeze = freezes.find((r) => r.node === 'sta-1' && r.t === at * 1_000)
    expect(freeze, `nothing freezes STA-1 at ${at} µs`).toBeDefined()
    expect(freeze!.value, 'the value it freezes at').toBe(value)
    expect(txs.some((r) => r.node === 'sta-2' && r.t === at * 1_000),
      `the neighbour does not start at ${at} µs`).toBe(true)
    const resume = resumes.find((r) => r.node === 'sta-1' && r.t > freeze!.t)!
    expect(resume.t / 1_000, 'when it carries on').toBe(until)
    expect(resume.value, 'and the value it carries on from').toBe(value)
  })

  it('the caption: three decrements, the freeze, the answer, the gap, and the frame at 851', () => {
    const [a, five, b, four, c, three] = figs(caption,
      /在 (\d+) µs 数到 (\d+)、(\d+) µs 数到 (\d+)、(\d+) µs 数到 (\d+)/,
      'the caption’s three decrements')
    const mine = decs.filter((r) => r.node === 'sta-1')
    for (const [t, v] of [[a, five], [b, four], [c, three]] as const) {
      const d = mine.find((r) => r.t === t * 1_000)
      expect(d, `STA-1 does not count down at ${t} µs`).toBeDefined()
      expect(d!.value, `the value STA-1 counts to at ${t} µs`).toBe(v)
    }
    // 「邻居恰在 498 µs 开始发送，于是它停在 3」
    const [at, held] = figs(caption, /邻居恰在 (\d+) µs 开始发送，于是它停在 (\d+)/,
      'the caption on the freeze')
    expect(at).toBe(c)
    expect(held).toBe(three)
    const freeze = freezes.find((r) => r.node === 'sta-1' && r.t === at * 1_000)!
    expect(freeze.value).toBe(held)
    // 「邻居的帧到 746 µs 结束，确认帧到 790 µs 结束，一个 DIFS 走到 824 µs」
    const [frameEnd] = figs(caption, /邻居的帧到 (\d+) µs 结束/, 'the caption on the frame’s end')
    const [ackEnd] = figs(caption, /确认帧到 (\d+) µs 结束/, 'the caption on the answer’s end')
    const [difsEnd] = figs(caption, /一个 DIFS 走到 (\d+) µs/, 'the caption on the gap’s end')
    expect(ofType(rs, 'TX_END').some((r) => r.node === 'sta-2' && r.t === frameEnd * 1_000)).toBe(true)
    const ack = txs.find((r) => r.frame.kind === 'ack' && r.t > frameEnd * 1_000)!
    expect((ack.t + ack.frame.txTimeNs) / 1_000, 'when the answer ends').toBe(ackEnd)
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-1' && r.t === ackEnd * 1_000)!
    expect(ifs.kind).toBe('DIFS')
    expect(ifs.untilNs / 1_000, 'when the gap ends').toBe(difsEnd)
    expect(ifs.untilNs - ifs.t).toBe(DIFS_NS)
    // 「它才从同一个 3 继续，并在 851 µs 发出自己的帧」
    const [again] = figs(caption, /从同一个 (\d+) 继续/, 'the caption on the value it resumes from')
    const [sends] = figs(caption, /在 (\d+) µs 发出自己的帧/, 'the caption on when it sends')
    const resume = resumes.find((r) => r.node === 'sta-1' && r.t === difsEnd * 1_000)!
    expect(resume.value).toBe(again)
    expect(again).toBe(held)
    const tx = txs.find((r) => r.node === 'sta-1' && r.t > resume.t)!
    expect(tx.t / 1_000, 'when STA-1 sends').toBe(sends)
    expect(tx.t - resume.t, 'and the counted slots in between').toBe(again * SLOT_NS)
  })

  it('the figure’s counter labels are the decrements either side of the freeze', () => {
    const spans = lane('STA-1 计数').spans
    expect(spans, 'the counter lane states exactly the three spans this reads').toHaveLength(3)
    const mine = decs.filter((r) => r.node === 'sta-1')
    // 「5 4 3」 and 「3 2 1 0」: every number is a value the counter SHOWS inside that span —
    // which for the second one includes the value it resumes at, not only its decrements.
    const shown = (fromUs: number, toUs: number): number[] => rs
      .filter((r) => (r.type === 'BACKOFF_DEC' || r.type === 'BACKOFF_RESUME')
        && r.node === 'sta-1' && r.t >= fromUs * 1_000 && r.t <= toUs * 1_000)
      .map((r) => (r as { value: number }).value)
    for (const s of [spans[0], spans[2]]) {
      expect(shown(s.fromUs, s.toUs), `the counter inside ${s.fromUs}–${s.toUs} µs`)
        .toEqual(s.label!.split(' ').map(Number))
    }
    // 「冻住在 3」
    const [held] = figs(spans[1].label!, /冻住在 (\d+)/, 'the frozen label')
    const freeze = freezes.find((r) => r.node === 'sta-1' && r.t === spans[1].fromUs * 1_000)!
    expect(freeze.value).toBe(held)
    expect(mine.some((r) => r.t > spans[1].fromUs * 1_000 && r.t < spans[1].toUs * 1_000),
      'the counter moved inside the span the figure calls frozen').toBe(false)
  })

  it('「本轮抽出来的数」: the window, the draws, the mean, the slot and the wait', () => {
    const [ms] = figs(drawProse, /(\d+) ms 里/, 'the window it counts over')
    const [cw] = figs(drawProse, /下限窗口 CW = (\d+)/, 'the window it draws from')
    const [count] = figs(drawProse, /抽了 (\d+) 次/, 'the draws it counts')
    const [mean] = figs(drawProse, /平均抽到 ([\d.]+) 个时隙/, 'the mean it reports')
    const [slot] = figs(drawProse, /每个时隙是 (\d+) µs/, 'the slot')
    const [wait] = figs(drawProse, /平均等待约 (\d+) µs/, 'the mean wait')
    expect(ms * MS).toBe(RUN_NS)
    expect(cw).toBe(CW_MIN)
    expect(draws().filter((r) => r.cw === cw)).toHaveLength(count)
    same(raw(drawProse, /平均抽到 ([\d.]+) 个时隙/, 'the mean')[0], meanOf(cw), 'the mean draw')
    expect(slot * 1_000).toBe(SLOT_NS)
    // 「于是平均等待约 64 µs」: 「约」 is one significant figure, so it rounds to the ten
    expect(Math.round((mean * slot) / 10) * 10).toBe(Math.round(wait / 10) * 10)
    // 「比一个 DIFS 还长一点」
    expect(wait * 1_000).toBeGreaterThan(DIFS_NS)
    expect(wait * 1_000, 'and 「一点」 is not 「twice」').toBeLessThan(2 * DIFS_NS)
  })

  it('the procedure: the floor, the sixteen values it allows, and the slot it counts in', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    const [floor] = figs(steps[0], /从下限 (\d+) 起步/, 'step 1’s floor')
    const [low] = figs(steps[1], /站点在 (\d+) 与 CW 之间/, 'step 2’s lower end')
    const [cw] = figs(steps[1], /CW 为 (\d+) 时共/, 'step 2’s window')
    expect(Math.min(...draws().map((r) => r.value)), 'the smallest number this run drew').toBe(low)
    const values = counted(steps[1], new RegExp(`时共(${ZH})个可能值`), 'step 2’s value count')
    const [slot] = figs(steps[2], /每空闲满一个 (\d+) µs 的时隙/, 'step 3’s slot')
    expect(floor).toBe(CW_MIN)
    expect(cw).toBe(CW_MIN)
    // 「0 与 CW 之间均匀地抽一个整数，两端都算在内」 — so the window allows CW + 1 values,
    // and this run really does draw every one of them
    expect(cw + 1).toBe(values)
    expect(new Set(draws().filter((r) => r.cw === cw).map((r) => r.value)).size).toBe(values)
    expect(slot * 1_000).toBe(SLOT_NS)
  })

  it('`limits`: the draws and the mean are the same two figures, and the wait is DCF’s own', () => {
    const [count, mean] = figs(limitText, /(\d+) 次抽取、平均 ([\d.]+) 个时隙/,
      '`limits` on the draws it calls reproducible')
    expect(draws().filter((r) => r.cw === CW_MIN)).toHaveLength(count)
    same(raw(limitText, /平均 ([\d.]+) 个时隙/, 'the mean')[0], meanOf(CW_MIN), 'the mean draw')
    const [wait] = figs(limitText, /「平均等待约 (\d+) µs」/, '`limits` on the wait it scopes')
    expect(Math.round((mean * (SLOT_NS / 1_000)) / 10) * 10).toBe(Math.round(wait / 10) * 10)
    // 「每个节点一条 splitmix32 子流」: the generator the figures come from, by name
    const [bits] = figs(limitText, /splitmix(\d+) 子流/, '`limits` on the generator')
    expect(readFileSync(resolve(ROOT, 'src/engine/rng.ts'), 'utf8'),
      `src/engine/rng.ts does not mention splitmix${bits}`).toMatch(new RegExp(`splitmix${bits}`, 'i'))
    // and 「这个场景里一次成功只换来一帧」, which is what makes that wait DCF's own
    for (const n of ['sta-1', 'sta-2']) {
      const mineTx = txs.filter((r) => r.node === n && r.frame.kind === 'data')
      const myDraws = draws().filter((r) => r.node === n)
      expect(myDraws.length, `${n}: a draw for every frame`).toBeGreaterThanOrEqual(mineTx.length - 1)
    }
  })

  it('`sources` and `observe`: the same floor, slot, draws and frame', () => {
    const [cwMin, slot] = figs(sourcesText, /aCWmin (\d+) 与 aSlotTime (\d+) µs/,
      '`sources` on the two constants')
    expect(cwMin).toBe(CW_MIN)
    expect(slot * 1_000).toBe(SLOT_NS)
    const [groups] = figs(sourcesText, /(\d+) 这个组数/, '`sources` on the pairs')
    const [bytes] = figs(sourcesText, /([\d,]+) 字节的帧/, '`sources` on the frame')
    const stations = counted(sourcesText, new RegExp(`(${ZH})台饱和站点`), '`sources` on the stations')
    const data = txs.filter((r) => r.frame.kind === 'data')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(backoff.scenario().nodes.filter((n) => n.profiles?.includes('saturated')))
      .toHaveLength(stations)

    // 「本轮共 770 组冻结与恢复，没有一组丢掉过一个时隙」
    const [pairs] = figs(backoff.observe[0], /本轮共 (\d+) 组冻结与恢复/, '`observe` on the pairs')
    expect(pairs).toBe(groups)
    const held = new Map<string, number>()
    let matched = 0
    for (const r of rs) {
      if (r.type === 'BACKOFF_FREEZE') { held.set(r.node, r.value); continue }
      if (r.type !== 'BACKOFF_RESUME') continue
      const was = held.get(r.node)
      if (was === undefined) continue
      expect(r.value, `${r.node} resumed at ${r.t}`).toBe(was)
      held.delete(r.node)
      matched++
    }
    expect(matched, 'freeze-and-resume pairs that kept their value').toBe(pairs)
  })

  it('the quiz: a counter frozen at seven resumes at seven', () => {
    const [frozen] = figs(quizText, /冻结在 (\d+)/, 'the quiz’s frozen value')
    const [answer] = figs(quizText, /^(\d+)——正是它停下的那个数/m, 'the option that keeps it')
    expect(answer).toBe(frozen)
    // the hypothesis is one this run really produces, and every one of them resumes there
    const seven = freezes.filter((r) => r.value === frozen)
    expect(seven.length, `no counter in this run ever freezes at ${frozen}`).toBeGreaterThan(0)
    for (const f of seven) {
      const back = resumes.find((r) => r.node === f.node && r.t > f.t)
      if (back) expect(back.value, `${f.node} frozen at ${f.t}`).toBe(frozen)
    }
    // and the option 「0，因为等待已经结束了」 is wrong because a resume at zero would mean a
    // station that never counted the rest of its wait
    const [zero] = figs(quizText, /(\d+)，因为等待已经结束了/, 'the option that zeroes it')
    expect(resumes.filter((r) => r.value === zero), 'a counter resumed at zero').toHaveLength(0)
  })
})
