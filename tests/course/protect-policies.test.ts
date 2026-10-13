/**
 * Every empirical claim in "Three ways of announcing, and handing the time back"
 * — the second half of `txop-protect`, split on 2026-09-25.
 *
 * It borrows the parent's scene AND both of its variants rather than declaring
 * any of its own, so `lessonShapeSuite(..., { sameSceneAs: 'txop-protect' })`
 * proves the two ids replay the same three timelines and its three recorded
 * hashes are copies rather than new runs.
 *
 * What moved here with the prose (§6 of the re-pacing plan, "~5 →
 * protect-policies (the three-policy tables)"): the third column of the 300 ms
 * table, the Durations a data frame carries under each policy, the CF-End census
 * and the arithmetic of the 288 µs the two copies hand back.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with
 * the same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { protectPolicies, policyReachTiming } from '../../src/course/tier2/protect-policies'
import { txopProtect } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { CF_END_BYTES, OFDM_5G } from '../../src/engine/phy'
import { LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = boundary protection; variant 0 = single; variant 1 = multiple — the parent's own three. */
const boundary = (): TLRecord[] => runOf(protectPolicies, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(protectPolicies, 0, RUN_NS)
const multiple = (): TLRecord[] => runOf(protectPolicies, 1, RUN_NS)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
const dataDurs = (rs: TLRecord[]): number[] => txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)
const lane = (label: string): TimingLane => policyReachTiming().lanes.find((l) => l.label === label)!

const ms = (ns: number) => Number((ns / MS).toFixed(3))

lessonShapeSuite(protectPolicies, { sameSceneAs: 'txop-protect', runNs: RUN_NS })

describe('protect-policies · the lesson’s own scene', () => {
  it('follows its parent in the QoS module and takes the two words it names', () => {
    expect(MODULES[protectPolicies.module].title).toBe('QoS 与效率')
    expect(MODULES[protectPolicies.module].title).toBe(MODULES[txopProtect.module].title)
    expect(protectPolicies.needs).toEqual(['txop-protect'])
    expect(protectPolicies.terms!.map((t) => t.term)).toEqual(['CF-End', 'CTS-to-self'])
  })

  it('is the parent’s scene and the parent’s two variants, undivided', () => {
    const sc = protectPolicies.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc).toEqual(txopProtect.scenario())
    expect(protectPolicies.variants!.map((v) => v.scenario()))
      .toEqual(txopProtect.variants!.map((v) => v.scenario()))
    expect(protectPolicies.variants!.map((v) => v.label)).toEqual(txopProtect.variants!.map((v) => v.label))
  })
})

describe('protect-policies · the three policies, counted', () => {
  it('multiple comes out identical to boundary, collision for collision', () => {
    // the table's three columns and "it comes out exactly like boundary protection, one
    // collision for one collision, one delivery for one delivery"
    const row = (rs: TLRecord[]) => [ofType(rs, 'COLLISION').length, delivered(rs)]
    expect(row(single())).toEqual([46, 212])
    expect(row(boundary())).toEqual([21, 614])
    expect(row(multiple())).toEqual(row(boundary()))
  })

  it('a data frame carries 60 µs at most under boundary and up to 2.164 ms under multiple', () => {
    // the table's third row, and step 3: "only while the remainder is longer than a pause plus
    // an answer does a data frame carry it; otherwise it carries just that pause and answer"
    expect(Math.max(...dataDurs(boundary())) / US).toBe(60)
    expect(Math.max(...dataDurs(single())) / US).toBe(60)
    expect(Math.max(...dataDurs(multiple())) / US).toBe(2_164)
    // and a long one really does reach the end of the turn it sits in
    const tops = ofType(multiple(), 'TXOP_START')
    const long = txs(multiple(), (r) => r.frame.kind === 'data' && r.frame.durationFieldNs > 60 * US)
    expect(long.length).toBeGreaterThan(50)
    for (const d of long.slice(0, 20)) {
      const top = tops.filter((s) => s.node === d.node && s.t <= d.t).pop()!
      expect(d.t + d.frame.txTimeNs + d.frame.durationFieldNs).toBe(top.untilNs)
    }
    // the floor every other frame falls back to is one pause plus one answer, and the answer's
    // own airtime depends on the rate it is sent at: 44, 48 or 60 µs in this run
    expect(new Set(dataDurs(boundary()).map((n) => n / US))).toEqual(new Set([44, 48, 60]))
    const ackTimes = new Set(txs(boundary(), (r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs))
    for (const d of new Set(dataDurs(boundary()))) expect(ackTimes).toContain(d - OFDM_5G.sifsNs)
    expect(Math.min(...dataDurs(multiple())) / US).toBeLessThanOrEqual(60)
  })

  it('198 CF-End frames under boundary and multiple, none under single, half of them the AP’s', () => {
    // the table's last row and the first observation: "198 in all, exactly half of them the
    // access point's" — step 4's repeat
    expect(txs(single(), (r) => r.frame.kind === 'cfend')).toHaveLength(0)
    for (const rs of [boundary(), multiple()]) {
      const cf = txs(rs, (r) => r.frame.kind === 'cfend')
      expect(cf).toHaveLength(198)
      expect(cf.filter((r) => r.node === 'ap')).toHaveLength(99)
      expect(new Set(cf.map((r) => r.frame.bytes))).toEqual(new Set([CF_END_BYTES]))
    }
  })
})

describe('protect-policies · the burst at 0.736 ms hands 288 µs back', () => {
  const rs = boundary()
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!

  it('every row of the worked table is that ending, record by record', () => {
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    // "the announced reservation runs to 3.264 ms" / "the last answer lands at 2.888 ms"
    expect(ms(nav.untilNs)).toBe(3.264)
    expect(ms(end.t)).toBe(2.888)
    // "376 µs left on it" / "one more exchange would need 416 µs"
    expect((nav.untilNs - end.t) / US).toBe(376)
    expect(376).toBeLessThan(416)
    // step 4: the holder's CF-End, then the access point's, one pause apart
    expect(ms(cf[0].t)).toBe(2.904)
    expect(cf[0].node).toBe('sta-1')
    expect(ms(cf[1].t)).toBe(2.948)
    expect(cf[1].node).toBe('ap')
    expect(cf[1].t - (cf[0].t + cf[0].frame.txTimeNs)).toBe(OFDM_5G.sifsNs)
    // step 5: the hidden station drops its reservation at 2.976 ms, not 3.264
    expect(ms(clear.t)).toBe(2.976)
    expect(clear.t).toBeLessThan(nav.untilNs)
    // "288 µs handed back"
    expect((nav.untilNs - clear.t) / US).toBe(288)
  })

  it('step 4’s condition holds: the announcement outran the burst by more than the test asks', () => {
    // "if the announced end is further off than now + a pause + a CF-End + one slot"
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)[0]
    const need = OFDM_5G.sifsNs + cf.frame.txTimeNs + OFDM_5G.slotNs
    expect(nav.untilNs - end.t).toBeGreaterThan(need)
    expect(need / US).toBe(16 + 28 + 9)
  })
})

describe('protect-policies · the figure of the three reaches', () => {
  const rs = boundary()
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!
  const rel = (t: number) => (t - t0.t) / US

  it('every span is a record of this run, or the engine’s own arithmetic over one', () => {
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && r.t === t0.t)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)

    // lane 1: the question, the answer, and the five exchanges
    const burst = lane('这一串').spans
    expect([burst[0].fromUs, burst[0].toUs]).toEqual([rel(rts.t), rel(rts.t + rts.frame.txTimeNs)])
    expect([burst[1].fromUs, burst[1].toUs]).toEqual([rel(cts.t), rel(cts.t + cts.frame.txTimeNs)])
    expect([burst[2].fromUs, burst[2].toUs]).toEqual([rel(data[0].t), rel(end.t)])
    // lane 2: what one exchange's answer announces — 2 × SIFS + the frame + its answer
    const one = lane('单次罩住').spans[0]
    expect(one.fromUs).toBe(rel(nav.t))
    expect(one.toUs - one.fromUs).toBe(416)
    expect((2 * OFDM_5G.sifsNs + data[0].frame.txTimeNs + 28 * US) / US).toBe(416)
    // and the single-protection run really does print 416 µs in that field for such a frame
    const s416 = txs(single(), (r) => r.frame.kind === 'cts' && r.frame.durationFieldNs === 416 * US)
    expect(s416.length).toBeGreaterThan(0)
    // lane 3: the 2 456 µs this run's answer carries, from the moment it ends
    const bnd = lane('边界罩住').spans[0]
    expect([bnd.fromUs, bnd.toUs]).toEqual([rel(nav.t), rel(nav.untilNs)])
    expect(bnd.toUs - bnd.fromUs).toBe(cts.frame.durationFieldNs / US)
    expect(bnd.label).toBe('2 456 µs')
    // lane 4: the two CF-End copies, and the reservation ending with the second
    const back = lane('还回去').spans[0]
    expect(back.fromUs).toBe(rel(cf[0].t))
    expect(back.toUs).toBe(rel(clear.t))
    expect(bnd.toUs - back.toUs).toBe(288)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(policyReachTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
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

describe('protect-policies · the experiment and the jumps', () => {
  it('single wakes the far station mid-burst; multiple leaves the counts untouched', () => {
    // the experiment: "single wakes up in the middle of every burst, multiple stays purple to
    // the end like boundary — and the counts are identical, because nobody here misses the answer"
    const navLen = (rs: TLRecord[]) => {
      const set = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2')
      expect(set.length).toBeGreaterThan(20)
      return set.reduce((a, r) => a + (r.untilNs - r.t), 0) / set.length
    }
    expect((navLen(single()) / MS).toFixed(2)).toBe('1.05')
    expect((navLen(multiple()) / MS).toFixed(2)).toBe('2.45')
    expect(navLen(multiple())).toBe(navLen(boundary()))
    expect([ofType(multiple(), 'COLLISION').length, delivered(multiple())]).toEqual([21, 614])
  })

  it('both jump targets occur in the base run', () => {
    for (const j of protectPolicies.jumps) expect(boundary().some(j.find), j.label).toBe(true)
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('protect-policies · every official term carries its English name', () => {
  const zh = [protectPolicies.why!, ...protectPolicies.outcomes!]
    .concat(paragraphTexts(protectPolicies.picture!), cellTexts(protectPolicies.picture!))
    .concat(paragraphTexts(protectPolicies.numbers!), cellTexts(protectPolicies.numbers!))
    .concat(protectPolicies.observe, protectPolicies.tryThis,
      protectPolicies.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(protectPolicies))

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
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(ms(nav.untilNs)).toBe(3.264)` — with the lesson's row quoted in a comment. So the
 * engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted six of this
 * lesson's figures and **all six went unnoticed**. Here every figure is parsed out of the shipped
 * string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the three-policy table is read as the three runs it is**, by the policy each column names:
 *    the collisions, the frames delivered, the longest Duration a data frame carries and the
 *    CF-Ends sent — each against the run that column is about, so 「多重跑出来和边界完全一样」
 *    is read as the equality of two columns rather than as a sentence.
 *  - **the worked ending is read as one burst's own records**: the announced end, the last answer,
 *    what was left on the reservation, what one more exchange would have needed, both CF-Ends,
 *    the instant the hidden station drops its reservation, and the microseconds handed back —
 *    every row from the same `TXOP_END`/`NAV_SET`/`NAV_CLEAR` trio.
 *  - **the two Duration figures are read as the two rules that write them**: 「整轮末尾减去提问
 *    自身，这里是 2 500 µs」 and 「回答则再扣掉一段停顿和它自己，写 2 456 µs」 are the engine's
 *    own subtraction, and the 「44 到 60 µs」 the other policy writes is read as the range the
 *    run's own data frames really carry.
 */
describe('protect-policies · every figure the prose prints, read back out of it', () => {
  const rs = boundary()
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const PIC = blockText(protectPolicies.picture)
  const NUMS = blockText(protectPolicies.numbers)
  const LIM = blockText(protectPolicies.limits)
  const OBS = blockText(protectPolicies.observe)
  const TRY = blockText(protectPolicies.tryThis)
  const QUIZ = blockText(protectPolicies.quiz)
  const SRC = blockText(protectPolicies.sources)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    protectPolicies.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  const caption = (): string =>
    (protectPolicies.numbers!.find((b) => b.kind === 'diagram') as unknown as { caption: string }).caption
  /** The run a column of the three-policy table is about, by its own heading. */
  const runOfPolicy = (head: string): TLRecord[] => {
    if (head.includes('单次')) return single()
    if (head.includes('边界')) return boundary()
    if (head.includes('多重')) return multiple()
    throw new Error(`no run for the column 「${head}」`)
  }
  const collisions = (x: TLRecord[]): number => ofType(x, 'COLLISION').length
  const cfEnds = (x: TLRecord[]): number => txs(x, (r) => r.frame.kind === 'cfend').length
  /** The burst the worked table and the figure are both about. */
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!

  it('reads the three-policy table as the three runs it is', () => {
    const t = tables().find((x) => x.head.some((h) => h.includes('单次')))!
    const [windowMs] = figs(t.head[0]!, /^(\d+) ms 内的统计$/, 'the table’s own window')
    expect(windowMs! * MS, 'the window every column is counted over').toBe(RUN_NS)
    const runs = t.head.slice(1).map(runOfPolicy)
    for (const row of t.rows) {
      const label = row[0]!
      row.slice(1).forEach((cell, i) => {
        const x = runs[i]!
        if (label.includes('碰撞次数')) {
          expect(val(cell), `${label} in column ${i}`).toBe(collisions(x))
        } else if (label.includes('成功送达')) {
          expect(val(cell), `${label} in column ${i}`).toBe(delivered(x))
        } else if (label.includes('CF-End')) {
          expect(val(cell), `${label} in column ${i}`).toBe(cfEnds(x))
        } else if (label.includes('Duration')) {
          const printed = raw(cell, /^([\d.]+) (µs|ms)$/, `${label} in column ${i}`)
          const scale = printed[1] === 'ms' ? MS : US
          expect(val(printed[0]!) * scale, `the longest Duration in column ${i}`)
            .toBe(Math.max(...dataDurs(x)))
        }
      })
    }
    // 「它跑出来和边界保护完全一样，一次碰撞对一次碰撞，一帧送达对一帧送达」
    expect([collisions(multiple()), delivered(multiple())], 'the two columns really are one')
      .toEqual([collisions(boundary()), delivered(boundary())])
    // 「本轮最长可达 2.164 ms」 — the figure that column prints, in the paragraph too
    const [longestMs] = figs(NUMS, /写进每一个数据帧，本轮最长可达 ([\d.]+) ms/,
      '`numbers` on the longest Duration')
    same(String(longestMs), Math.max(...dataDurs(multiple())) / MS, 'the longest it really writes')
  })

  it('reads the two Duration rules, and the range the other policy writes', () => {
    // 「把开场那句提问的 Duration 写成整轮末尾减去提问自身，这里是 2 500 µs，回答则…写 2 456 µs」
    const [askUs, answerUs] = figs(NUMS, /这里是 ([\d ]+) µs，回答则再扣掉一段停顿和它自己，写 ([\d ]+) µs/,
      'the step on the two announcements')
    const ask = txs(rs, (r) => r.frame.kind === 'rts' && r.t >= t0.t)[0]!
    const answer = txs(rs, (r) => r.frame.kind === 'cts' && r.t > ask.t)[0]!
    expect(askUs! * US, 'what the question announces').toBe(ask.frame.durationFieldNs)
    expect(answerUs! * US, 'and what the answer announces').toBe(answer.frame.durationFieldNs)
    expect(askUs! - answerUs!, 'the pause and the answer the second one takes off')
      .toBe((OFDM_5G.sifsNs + answer.frame.txTimeNs) / US)
    // 「也就是边界保护始终写的那个 44 到 60 µs」
    const [lo, hi] = figs(NUMS, /也就是边界保护始终写的那个 (\d+) 到 (\d+) µs/,
      'the step on the range a data frame carries')
    const durs = dataDurs(rs)
    expect(Math.min(...durs) / US, 'the shortest Duration a data frame of this run carries').toBe(lo)
    expect(Math.max(...durs) / US, 'and the longest').toBe(hi)
    // `observe` prints the same range against the other policy's own figure
    const [obsLongMs, obsLo, obsHi] = figs(OBS,
      /最长 ([\d.]+) ms，而边界保护下只有 (\d+) 到 (\d+) µs/, '`observe` on the two policies')
    same(String(obsLongMs), Math.max(...dataDurs(multiple())) / MS, 'what multiple writes at most')
    expect([obsLo, obsHi], 'against the range boundary writes').toEqual([lo, hi])
  })

  it('reads the worked ending as one burst’s own records', () => {
    const t = tables().find((x) => x.rows.some((r) => r[0]!.includes('还回去的时间')))!
    const row = (needle: string): string => t.rows.find((r) => r[0]!.includes(needle))![1]!
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    same(raw(row('预告出去的预约管到'), /^([\d.]+) ms$/, 'the announced end')[0]!,
      nav.untilNs / MS, 'where the reservation was announced to')
    same(raw(row('最后一个回答落在'), /^([\d.]+) ms$/, 'the last answer')[0]!,
      end.t / MS, 'when the burst really ends')
    const [leftUs] = figs(row('已预告的预约还剩'), /^(\d+) µs$/, 'what was left on it')
    expect(leftUs! * US, 'the time left on the announcement').toBe(nav.untilNs - end.t)
    const [needUs] = figs(row('再做一次交互需要'), /^(\d+) µs ✗$/, 'what one more exchange needs')
    expect(needUs, 'more than was left — which is why the burst stops').toBeGreaterThan(leftUs!)
    same(raw(row('持有者的 CF-End 发于'), /^([\d.]+) ms$/, 'the holder’s CF-End')[0]!,
      cf[0]!.t / MS, 'when the holder hands the time back')
    expect(cf[0]!.node, 'and who sends it').toBe('sta-1')
    same(raw(row('接入点重复的那一份发于'), /^([\d.]+) ms$/, 'the repeat')[0]!,
      cf[1]!.t / MS, 'when the access point repeats it')
    expect(cf[1]!.node, 'and who repeats it').toBe('ap')
    same(raw(row('于是远端站点的预约结束于'), /^([\d.]+) ms$/, 'the clear')[0]!,
      clear.t / MS, 'when the hidden station drops its reservation')
    const [backUs] = figs(row('还回去的时间'), /^(\d+) µs$/, 'the time handed back')
    expect(backUs! * US, 'which is what the announcement had left').toBe(nav.untilNs - clear.t)
    // `picture` and `observe` print three of those figures again
    for (const text of [PIC, OBS]) {
      const [left] = figs(text, /预约还剩 (\d+) µs/, 'the same remainder')
      expect(left, 'the same remainder').toBe(leftUs)
    }
    const [closeMs, insteadMs] = figs(PIC, /那条紫条在 ([\d.]+) ms 收尾，而不是等到预告的 ([\d.]+) ms/,
      '`picture` on the two ends')
    same(String(closeMs), clear.t / MS, 'when the bar really closes')
    same(String(insteadMs), nav.untilNs / MS, 'against where it was announced to')
    const [obsClose, obsInstead] = figs(OBS, /B 的预约在 ([\d.]+) ms 结束，而不是 ([\d.]+) ms/,
      '`observe` on the same two')
    expect([obsClose, obsInstead], 'the same two again').toEqual([closeMs, insteadMs])
  })

  it('reads the figure’s own axis note, the band it contrasts, and the wrong option', () => {
    /*
     * **The six the sweep of 2026-10-14 still got past this file**, each a different shape:
     * the figure's axis note, a cell whose read was an inequality, a band name printed twice,
     * the band this lesson's own room is on, and a quiz option's fabricated figure.
     */
    // 「µs（0 是那句提问）」 — the axis unit, which says where the drawing's zero is
    const spec = policyReachTiming()
    const [zero] = figs(spec.axis!.unit!, /（(\d+) 是那句提问）/, 'the figure’s axis note')
    expect(zero, 'where the axis really starts').toBe(spec.axis!.fromUs)
    const burst = spec.lanes.find((l) => l.label === '这一串')!
    const rts = burst.spans.find((s) => s.label === 'RTS')!
    expect(rts.fromUs, 'and the question really is drawn at it').toBe(zero)
    /*
     * **The 416 µs cell was read as an inequality** — 「再做一次交互需要 416 µs ✗」 only had to
     * be more than the 376 µs left, so 417 passed too. It is the same quantity the figure's
     * single lane carries: what a CTS announces for one exchange, which the single-protection
     * run really writes into that field.
     */
    const single1 = single()
    const sTxop = ofType(single1, 'TXOP_START').filter((r) => r.node === 'sta-1')
      .find((r) => ms(r.t) === 0.736)!
    const sAnswer = txs(single1, (r) => r.frame.kind === 'cts' && r.t > sTxop.t)[0]!
    const ending = tables().find((x) => x.rows.some((r) => r[0]!.includes('还回去的时间')))!
    const [needUs] = figs(ending.rows.find((r) => r[0]!.includes('再做一次交互需要'))![1]!,
      /^(\d+) µs ✗$/, 'what one more exchange needs')
    expect(needUs! * US, 'what one more exchange really needs')
      .toBe(sAnswer.frame.durationFieldNs)
    /*
     * **S1G is a band this engine does not have**, and that is the whole point of both sentences:
     * the standard writes the repeat for sub-1 GHz access points and this engine lets every
     * access point do it. So the figure inside the name is read against the three links this
     * engine really has — `S2G` would name one of them, and then the sentence would be false.
     */
    const [limG] = figs(LIM, /标准是针对 S(\d)G 接入点写明的/, '`limits` on whose rule it is')
    const [srcG] = figs(SRC, /标准是针对 S(\d)G 接入点写明那次重复的/, '`sources` on the same')
    expect(srcG, 'the same band, named in both places').toBe(limG)
    expect(Object.keys(LINK_EXTRA_LOSS_DB), 'a band this engine has no link for')
      .not.toContain(`${limG}g`)
    // 「一台普通的 5 GHz 接入点并不会这样帮忙」 — the band this lesson's own room is on
    const [bandG] = figs(LIM, /一台普通的 (\d) GHz 接入点并不会这样帮忙/, '`limits` on the ordinary one')
    const scene = ScenarioSchema.parse(protectPolicies.scenario())
    const ap = scene.nodes.find((n) => n.kind === 'ap')!
    expect(ap.linkId ?? '5g', 'the link this lesson’s own access point is on').toBe(`${bandG}g`)
    expect(LINK_EXTRA_LOSS_DB[`${bandG}g` as keyof typeof LINK_EXTRA_LOSS_DB],
      'and it is the band the engine takes nothing off for').toBe(0)
    /*
     * 「更少的碰撞：21 次降到 12 次」 — the wrong option, and the 21 is the table's own: both
     * boundary and multiple collide that many times, which is exactly why the option is wrong.
     *
     * **Exempt, class (e): the 12.** The option has to claim an improvement that did not happen,
     * so any figure below the 21 would do the same work — 13 reads as the same wrong answer.
     * What is read is the claim: the figure it drops to is lower than the one it drops from,
     * and the run it is about never goes below it.
     */
    const [from, to] = figs(QUIZ, /更少的碰撞：(\d+) 次降到 (\d+) 次/, 'the quiz’s wrong option')
    expect(from, 'the collisions boundary protection really has').toBe(collisions(rs))
    expect(collisions(multiple()), 'and multiple protection has exactly as many').toBe(from)
    expect(to, 'while the option claims it drops below that').toBeLessThan(from!)
  })

  it('reads the caption, the CF-End count and the experiment', () => {
    // 「零点取本轮 0.736 ms 那句提问…只预约到第一次交互做完为止（416 µs）；…（2 456 µs），
    //   可这一串 2 152 µs 就完了，于是两份 CF-End 把最后那 288 µs 还了回去」
    const cap = caption()
    const [zeroMs] = figs(cap, /零点取本轮 ([\d.]+) ms 那句提问/, 'the caption’s own zero point')
    same(String(zeroMs), t0.t / MS, 'the burst the figure is drawn from')
    const [singleUs] = figs(cap, /只预约到第一次交互做完为止（(\d+) µs）/, 'the caption on single')
    const [boundaryUs] = figs(cap, /边界保护预约到本轮末尾（([\d ]+) µs）/, 'the caption on boundary')
    const [burstUs, backUs] = figs(cap, /可这一串 ([\d ]+) µs 就完了，于是两份 CF-End 把最后那 (\d+) µs 还了回去/,
      'the caption on what was handed back')
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
    expect(burstUs! * US, 'how long the burst really runs').toBe(end.t - t0.t)
    /*
     * **The two reaches are the two policies' own announcements**: each is what the answer of
     * that run writes into its Duration, so the caption's two figures come from two runs of the
     * same burst rather than from one and an arithmetic guess.
     */
    const answerOf = (x: TLRecord[]): Tx => {
      const start = ofType(x, 'TXOP_START').filter((r) => r.node === 'sta-1')
        .find((r) => ms(r.t) === zeroMs)!
      return txs(x, (r) => r.frame.kind === 'cts' && r.t > start.t)[0]!
    }
    expect(boundaryUs! * US, 'what the answer announces under boundary')
      .toBe(answerOf(boundary()).frame.durationFieldNs)
    expect(singleUs! * US, 'and under single')
      .toBe(answerOf(single()).frame.durationFieldNs)
    expect(backUs! * US, 'the time the two CF-Ends hand back').toBe(nav.untilNs - clear.t)
    expect(singleUs, 'while single announces only the first exchange').toBeLessThan(burstUs!)
    // 「整轮 300 ms 里这样的 CF-End 一共 198 帧，正好一半出自接入点」
    const [obsWindowMs, obsCf] = figs(OBS, /整轮 (\d+) ms 里这样的 CF-End 一共 (\d+) 帧/,
      '`observe` on the CF-End count')
    expect(obsWindowMs! * MS, 'the window').toBe(RUN_NS)
    expect(obsCf, 'the CF-Ends this run sends').toBe(cfEnds(rs))
    expect(txs(rs, (r) => r.frame.kind === 'cfend' && r.node === 'ap').length * 2,
      'half of them the access point’s').toBe(obsCf)
    const [limCf, limBackUs] = figs(LIM, /于是那 (\d+) 帧 CF-End 里正[^]*?才能提前 (\d+) µs 清除自己的预约/,
      '`limits` on the same count')
    expect(limCf, 'the same count in `limits`').toBe(obsCf)
    expect(limBackUs, 'and the same time handed back').toBe(backUs)
    // 「计数也完全一样——21 次碰撞、送达 614 帧」 and the quiz’s 「21 次降到 12 次」
    const [tryColl, tryOk] = figs(TRY, /计数也完全一样——(\d+) 次碰撞、送达 (\d+) 帧/,
      '`tryThis` on the multiple run')
    expect([tryColl, tryOk], 'the multiple column, a second time')
      .toEqual([collisions(multiple()), delivered(multiple())])
    const [qFrom, qTo] = figs(QUIZ, /更少的碰撞：(\d+) 次降到 (\d+) 次/, 'the quiz on the two counts')
    expect(qFrom, 'the collisions under boundary').toBe(collisions(boundary()))
    expect(qTo, 'and the number the question offers as a wrong answer')
      .not.toBe(collisions(single()))
  })
})
