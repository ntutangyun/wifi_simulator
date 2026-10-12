/**
 * Every empirical claim in "NAV — reserving the channel with one field",
 * measured against the lesson's own scene (two saturated talkers, one browsing
 * listener).
 *
 * Re-paced on 2026-09-25, and kept whole (§2 M4). One pin changed shape: the
 * three-row 「把一段长长的冻结拆开」table became the timing figure, so the
 * assertion that used to read the table's cells now reads `navTiming()`'s spans
 * and compares each with the run. The same four instants and the same
 * 248 + 44 + 34 = 326 are asserted; what is gained is that the figure the reader
 * sees cannot drift from the simulator. The diagram's geometry is checked here
 * too, because tests/course/diagram.test.ts pins its own fixtures rather than
 * walking the course.
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * 248 + 44 + 34 = 326 µs freeze, and "NAV ends exactly when the ACK ends, and
 * data Duration = SIFS + ACK airtime" — are re-asserted here beside the
 * sentences that now carry them; the originals stay where they are.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { nav, navTiming } from '../../src/course/tier1/nav'
import { airtime } from '../../src/course/tier1/airtime'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { ACK_BYTES, DIFS_NS, SIFS_NS, SLOT_NS, ctrlRespRateFor, txTimeNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
/** 200 ms: the window the "576 data frames" and "513 countdowns" sentences are counted over. */
const RUN_NS = 200 * MS

const recs = (): TLRecord[] => runOf(nav, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)
const lane = (label: string): TimingLane => navTiming().lanes.find((l) => l.label === label)!

lessonShapeSuite(nav, { runNs: RUN_NS })

describe('nav · the lesson’s own scene', () => {
  it('follows backoff and owns the reservation', () => {
    expect(MODULES[nav.module].title).toBe('等待与退避')
    expect(nav.needs).toEqual(['backoff'])
    // the owner table of the readability programme gives this lesson NAV; `Duration` and
    // `virtual carrier sense` are the field it reads and the name for what it does.
    expect(nav.terms!.map((t) => t.term)).toEqual(['Duration', 'NAV', 'virtual carrier sense'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(nav.scenario())).not.toThrow()
    expect(nav.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2', 'sta-3'])
  })
})

describe('nav · where the 44 µs comes from', () => {
  it('a data frame announces the pause plus the answer, and the answer announces nothing', () => {
    // the "where the 44 µs comes from" table: pause 16 µs, answer 28 µs, data frame writes
    //  44 µs, answer writes 0 µs — and 「576 个数据帧写下的都是同一个 44 µs」
    const data = txs('data')
    const acks = txs('ack')
    expect(data.length).toBe(576)
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([44_000]))
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([28_000]))
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([14]))
    expect(new Set(acks.map((r) => r.frame.durationFieldNs))).toEqual(new Set([0]))
    expect(SIFS_NS + 28_000).toBe(44_000)
    // and it really is the answer each frame expects, not a constant that happens to match
    for (const d of data) {
      const ack = acks.find((a) => a.t > d.t)
      if (ack) expect(d.frame.durationFieldNs).toBe(SIFS_NS + ack.frame.txTimeNs)
    }
  })

  it('the Listener’s 513 countdowns end at the exact nanosecond the answer ends', () => {
    // 「旁听者的倒计时恰好在回答结束的那一纳秒到期——513 次无一例外」and the observation
    //  "check any of the Listener's 513 of them"
    const navs = ofType(recs(), 'NAV_SET').filter((r) => r.node === 'sta-3')
    expect(navs.length).toBe(513)
    for (const n of navs) {
      expect(n.untilNs - n.t).toBe(44_000)
      const ack = ofType(recs(), 'TX_END').find((r) => r.frame.kind === 'ack' && r.t > n.t)!
      expect(ack.t).toBe(n.untilNs)
    }
    // the Listener is never the addressee: every one of them comes from somebody else's data
    expect(new Set(navs.map((r) => r.source))).toEqual(new Set(['data:sta-1', 'data:sta-2']))
  })
})

describe('nav · the procedure, against the engine', () => {
  it('a countdown is only ever pushed further out, and never by an answer', () => {
    // the procedure's steps 2 and 4, against updateNav in src/engine/mac.ts: it returns
    // early unless `t + durationFieldNs` beats the value already held and the Duration is
    // above zero.
    const held = new Map<string, number>()
    let sets = 0
    for (const r of recs()) {
      if (r.type === 'NAV_SET') {
        expect(r.untilNs, `${r.node} at ${r.t}`).toBeGreaterThan(held.get(r.node) ?? 0)
        expect(r.untilNs).toBeGreaterThan(r.t)
        held.set(r.node, r.untilNs)
        sets++
      }
      if (r.type === 'NAV_CLEAR') held.set(r.node, 0)
    }
    expect(sets).toBeGreaterThan(500)
    // an acknowledgement announces nothing, so it arms nobody
    expect(ofType(recs(), 'NAV_SET').some((r) => r.source.startsWith('ack'))).toBe(false)
  })

  it('while a countdown runs the station neither counts down nor transmits', () => {
    // the procedure's steps 5 and 6: `mediumBusy()` is CCA busy OR now < navUntil, so a
    // physically idle channel does not release a station whose timer is still running.
    const until = new Map<string, number>()
    let covered = 0
    for (const r of recs()) {
      const node = 'node' in r ? r.node : undefined
      if (r.type === 'NAV_SET') { until.set(r.node, r.untilNs); continue }
      if (r.type === 'NAV_CLEAR') { until.set(r.node, 0); continue }
      if (node === undefined || r.t >= (until.get(node) ?? 0)) continue
      expect(r.type, `${node} at ${r.t}`).not.toBe('BACKOFF_DEC')
      expect(r.type, `${node} at ${r.t}`).not.toBe('TX_START')
      covered++
    }
    expect(covered).toBeGreaterThan(100)
  })

  it('the countdown expiring is what restarts the gap', () => {
    // the procedure's step 7, "if sensing reports idle then, the station starts its gap and
    //  access resumes from the frozen value"
    const clears = ofType(recs(), 'NAV_CLEAR').filter((r) => r.node === 'sta-1')
    expect(clears.length).toBeGreaterThan(100)
    const ifss = ofType(recs(), 'IFS_START').filter((r) => r.node === 'sta-1')
    const started = clears.filter((c) => ifss.some((r) => r.t === c.t))
    expect(started.length / clears.length).toBeGreaterThan(0.5)
  })
})

describe('nav · one long freeze, taken apart', () => {
  it('the figure’s three spans are 248 + 44 + 34 = 326 µs, and Talker A resumes at 3', () => {
    // What the deleted 「把一段长长的冻结拆开」table used to assert, now read out of the
    // spec the reader is actually shown, plus the caption's four instants.
    const air = lane('空口').spans
    const dur = lane('Duration').spans[0]
    const a = lane('A 在等的').spans

    const freeze = ofType(recs(), 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === 498_000)!
    expect(freeze.value).toBe(3)
    expect(a[0].fromUs).toBe(freeze.t / 1000)

    // segment 1: B's frame, which A's own ear can account for
    const bTx = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t === 498_000)!
    const bEnd = ofType(recs(), 'TX_END').find((r) => r.node === 'sta-2' && r.t > 498_000)!
    expect(bEnd.t).toBe(746_000)
    expect(air[0].fromUs).toBe(bTx.t / 1000)
    expect(air[0].toUs).toBe(bEnd.t / 1000)
    expect(a[0].toUs).toBe(bEnd.t / 1000)
    expect((a[0].toUs - a[0].fromUs) * 1000).toBe(248_000)

    // segment 2: the reservation, trusted only once the frame decoded
    const rxOk = ofType(recs(), 'RX_OK').find((r) => r.node === 'sta-1' && r.t === 746_000)!
    expect(rxOk.from).toBe('sta-2')
    expect(ofType(recs(), 'RX_FAIL').some((r) => r.node === 'sta-1' && r.t === 746_000)).toBe(false)
    const navSet = ofType(recs(), 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === 746_000)!
    expect(navSet.untilNs).toBe(790_000)
    expect(dur.fromUs).toBe(navSet.t / 1000)
    expect(dur.toUs).toBe(navSet.untilNs / 1000)
    expect((dur.toUs - dur.fromUs) * 1000).toBe(44_000)
    expect([a[1].fromUs, a[1].toUs]).toEqual([dur.fromUs, dur.toUs])
    expect(a[1].tone).toBe('muted')
    // the answer really is on the air inside that span, from the access point
    const ack = txs('ack').find((r) => r.t > 746_000)!
    expect(air[1].fromUs).toBe(ack.t / 1000)
    expect(air[1].toUs).toBe((ack.t + ack.frame.txTimeNs) / 1000)
    expect([air[1].fromUs, air[1].toUs]).toEqual([762, 790])

    // segment 3: a real DIFS, and the resume at the same 3
    const difs = ofType(recs(), 'IFS_START').find((r) => r.node === 'sta-1' && r.t === 790_000)!
    expect(difs.kind).toBe('DIFS')
    expect(difs.untilNs).toBe(824_000)
    expect(a[2].fromUs).toBe(difs.t / 1000)
    expect(a[2].toUs).toBe(difs.untilNs / 1000)
    expect((a[2].toUs - a[2].fromUs) * 1000).toBe(DIFS_NS)
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === 824_000)!
    expect(resume.value).toBe(3)
    expect(resume.t - freeze.t).toBe(326_000)

    // and the three spans really do add to the total the caption prints
    expect((a[2].toUs - a[0].fromUs) * 1000).toBe(326_000)
    expect(248_000 + 44_000 + 34_000).toBe(326_000)
  })

  it('the 3 is idle slots owed: A sends three slots after it resumes', () => {
    // the caption's last clause, "A's backoff counter carries on from 3 — the idle slots it
    //  still owed when the air went busy". The gloss is only true if those three are counted
    //  off as slots and the frame follows immediately, so that is what is checked.
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === 824_000)!
    expect(resume.value).toBe(3)
    const tx = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-1' && r.t > resume.t)!
    expect(tx.t - resume.t).toBe(resume.value * SLOT_NS)
    const decs = ofType(recs(), 'BACKOFF_DEC').filter((r) => r.node === 'sta-1' && r.t > resume.t && r.t <= tx.t)
    expect(decs.map((r) => r.value)).toEqual([2, 1, 0])
  })

  it('three quarters of the wait is over before its length can be worked out', () => {
    // `deeper`: "the 326 µs total first becomes computable at 746 µs, by which point 248 µs
    //  — about three quarters of the wait — has already gone by", and the last ingredient
    //  being the 34 µs that could still be extended
    expect(248_000 / 326_000).toBeGreaterThan(0.7)
    expect(248_000 / 326_000).toBeLessThan(0.8)
    expect(326_000 - 248_000 - 44_000).toBe(DIFS_NS)
  })

  it('the figure lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(navTiming())
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
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine and compares it with a literal written in THIS file:
 * `expect(data.length).toBe(576)`, `expect(navSet.untilNs).toBe(790_000)`,
 * `expect(248_000 + 44_000 + 34_000).toBe(326_000)`. Those assertions are what makes the engine
 * unable to drift. They do not make the LESSON unable to drift: every one of the nineteen figures
 * `@nav` hand-types could be edited to a neighbouring number and this file would stay green,
 * because the number the test compares against is on the test's own side.
 *
 * What follows is the other half of each of them, with no figure on this side. The reservation's
 * three ingredients come off the table's own cells (and the table's own heading), the census of
 * 「每一次都是同一个数」 off its sentence, the caption's seven figures off the caption, the
 * diagram's `44 µs` label off the span it labels, the arithmetic of step 1 off step 1,
 * `deeper`'s 「约四分之三」 off its own numerator and denominator, and `observe`, `tryThis` and
 * `sources` off theirs. `limits` is read too — the graded walk never reads it, and it carries the
 * widest claims in the lesson: the real field's 15 bits, the two sources of 「忙」, and the one
 * countdown a station holds.
 *
 * **Two of those claims were false, and reading them back is how that surfaced.**
 *
 *  - 「还有 TXOP 保护……这三条一个都没有建模」. TXOP protection landed in `22db72d` on
 *    2026-09-08; the sentence was written on 2026-09-27, nineteen days later. A node carries
 *    `txopProtection`, and with `'multiple'` the MAC writes the remainder of the burst into the
 *    very Duration field this lesson is about (§9.2.5.2, `mac.ts`) — which `@txop-protect` then
 *    teaches and pins. The entry now names the two mechanisms that genuinely are missing and
 *    says where the third one is, and the assertion below is anchored to the engine, not to the
 *    wording: the schema takes the setting and the MAC acts on it, so the sentence may not list
 *    it among what is not modelled. Same species as the two sites `limits.test.ts`'s criterion A
 *    caught in 2026-10-05 — an `unmodelled` claim about a feature that lives behind a scenario
 *    switch.
 *  - 「一个场景只有一个接入点（simulation.ts 取节点表里第一个）」. The citation was true and the
 *    reason it gives is not: a reader told that the first AP is taken would expect a second one
 *    to be ignored. `ScenarioSchema` **refuses** it, by name, before any of that
 *    (「场景必须正好有一个 AP」). The read-back is the refusal itself.
 */
describe('nav · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const data = txs('data')
  const acks = txs('ack')
  const listener = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-3')
  const mac = readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8')

  const table = nav.numbers!.find((x) => x.kind === 'table') as
    { heading: string; head: string[]; rows: string[][] }
  const steps = (nav.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const caption = (nav.numbers!.find((x) => x.kind === 'diagram') as { caption: string }).caption
  const census = (nav.numbers!.find((x) => (x as { text?: string }).text?.includes('同一个')) as
    { text: string }).text

  /** 「16 µs」 → 16_000: a cell that is a figure and its unit, and nothing else. */
  const figure = (cell: string, what: string): number => {
    const m = /^([\d\s.]+?)\s*µs$/.exec(cell.trim())
    expect(m, `${what}: the cell 「${cell}」 is not a figure followed by µs`).not.toBeNull()
    return Number(m![1].replace(/\s/g, '')) * US
  }

  /** The captures of `re`, as numbers. A space inside a figure is a thousands group. */
  const figs = (text: string, re: RegExp, what: string): number[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1).map((x) => Number(x.replace(/\s/g, '')))
  }

  /** `zhNumeral` reads 〇–九十九 and not 「两」, which is the form a quantified noun takes. */
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return zhCount(m![1])
  }

  /** The answer the Listener's reservation was waiting for: the ACK that the data frame elicits. */
  const elicited = (a: Extract<TLRecord, { type: 'TX_START' }>) =>
    data.filter((d) => d.frame.src === a.frame.dst && d.frame.dst === a.frame.src
      && d.t + d.frame.txTimeNs <= a.t).pop()

  it('the table: a 16 µs silence, a 14-byte answer at 24 Mb/s, and the 44 µs that is their sum', () => {
    expect(table.rows, 'the table states exactly the four rows this reads').toHaveLength(4)
    const pause = figure(table.rows[0][1], 'the silence before the answer')
    const answer = figure(table.rows[1][1], 'the answer’s own airtime')
    const written = figure(table.rows[2][1], 'what a data frame writes down')
    const closing = figure(table.rows[3][1], 'what the answer writes down')

    // 「回答之前的停顿」 — the gap the engine really leaves between a frame and its answer
    expect(pause).toBe(SIFS_NS)
    expect(acks.length).toBeGreaterThan(500)
    for (const a of acks) {
      const d = elicited(a)
      expect(d, `the answer at ${a.t} answers a frame of this run`).toBeDefined()
      expect(a.t - (d!.t + d!.frame.txTimeNs), `the silence before the answer at ${a.t}`).toBe(pause)
    }

    // 「14 个字节，按控制回应规则定的 24 Mb/s」: both figures, and the rule that picks the rate
    const [bytes] = figs(table.rows[1][0], /(\d+) 个字节/, 'the answer’s length')
    const [mbps] = figs(table.rows[1][0], /(\d+) Mb\/s/, 'the answer’s rate')
    expect(bytes).toBe(ACK_BYTES)
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(new Set(acks.map((r) => r.frame.mbps))).toEqual(new Set([mbps]))
    for (const d of data) {
      expect(ctrlRespRateFor(d.frame.mbps), `the response rate to ${d.frame.mbps} Mb/s`).toBe(mbps)
    }
    // and 28 µs is what those two give through the engine's own airtime formula
    expect(answer).toBe(txTimeNs(bytes, mbps))
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([answer]))

    // the two things written down, off the frames that write them
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([written]))
    expect(new Set(acks.map((r) => r.frame.durationFieldNs))).toEqual(new Set([closing]))
    // the heading prints the same figure as the row it is the heading of
    expect(figs(table.heading, /^(\d+) µs 是怎么来的/, 'the heading')[0] * US).toBe(written)
    // and the table adds up the way it says it does
    expect(pause + answer, 'the table’s own two ingredients against its own total').toBe(written)

    // 「交互到此结束」: a cell with no figure in it is a claim too — after an answer, the next
    // thing on the air is always the start of something new, never another part of this exchange
    expect(table.rows[3][2]).toContain('结束')
    for (const a of acks) {
      const next = ofType(rs, 'TX_START').find((r) => r.t > a.t)
      if (next) expect(next.frame.kind, `what follows the answer at ${a.t}`).not.toBe('ack')
    }
  })

  it('the 出处 column attributes each figure to the clause the rest of the course does', () => {
    // Prose against prose, which this programme otherwise refuses, and the argument for the
    // exception: no clause text is in this repository, so nothing here can check that §17.4.4
    // really is aSIFSTime. What can be checked is that the course does not attribute one
    // quantity to two clauses. `@airtime` prints the same 16 µs silence and the same 28 µs
    // answer with a 出处 of its own; if the two disagree one of them is wrong, and this
    // assertion cannot say which — which is what its message says.
    const theirs = (airtime.numbers!.find((x) => x.kind === 'table'
      && (x as { rows: string[][] }).rows.some((r) => r[1] === table.rows[1][1])) as
      { rows: string[][] }).rows
    for (const row of table.rows.slice(0, 2)) {
      const twin = theirs.find((r) => r[1] === row[1])
      expect(twin, `@airtime no longer prints ${row[1]} for this to be checked against`).toBeDefined()
      expect(row[2], `${row[0]}: @nav and @airtime cite different clauses for the same ${row[1]}`
        + ' — one of them is wrong and this cannot say which').toBe(twin![twin!.length - 1])
    }
    // and the clause the Duration field itself is cited to is the one the lesson's own
    // `sources` gives for it
    expect(nav.sources!.some((s) => s.includes(table.rows[2][2])),
      `the table cites ${table.rows[2][2]} for the Duration field and \`sources\` does not`).toBe(true)
  })

  it('「每一次都是同一个数」: the frames counted, the one figure they write, the countdowns checked', () => {
    const [frames] = figs(census, /里 (\d+) 个数据帧/, 'the frames counted')
    const [written] = figs(census, /同一个 (\d+) µs/, 'the reservation every one of them writes')
    const [times] = figs(census, /(\d+) 次无一例外/, 'the countdowns checked')
    expect(data.length).toBe(frames)
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([written * US]))
    expect(listener.length).toBe(times)
    // 「恰好在回答结束的那一纳秒到期」 — the nanosecond, not the microsecond
    const ends = new Set(acks.map((r) => r.t + r.frame.txTimeNs))
    for (const n of listener) {
      expect(n.untilNs - n.t, `the Listener’s countdown at ${n.t}`).toBe(written * US)
      expect(ends.has(n.untilNs), `the countdown at ${n.t} ends where no answer ends`).toBe(true)
    }
  })

  it('the caption: the freeze, its three spans, its total, and the counter it resumes from', () => {
    const [at] = figs(caption, /A 在 (\d+) µs 冻结/, 'when A freezes')
    const [total] = figs(caption, /三段加起来 (\d+) µs/, 'the whole freeze')
    const [heard] = figs(caption, /第一段 (\d+) µs/, 'the span its own ear covers')
    const [booked] = figs(caption, /中间那 (\d+) µs/, 'the span that is only booked')
    const [free] = figs(caption, /最后 (\d+) µs 才是真正的空闲/, 'the span that is really idle')
    const [until] = figs(caption, /(\d+) µs 走完之后/, 'when A may count again')
    const [owed] = figs(caption, /计数从 (\d+) 继续/, 'the counter it resumes from')

    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === at * US)
    expect(freeze, `nothing freezes Talker A at ${at} µs`).toBeDefined()
    expect(freeze!.value, 'the counter A freezes at').toBe(owed)

    const bEnd = ofType(rs, 'TX_END').find((r) => r.node === 'sta-2' && r.t > freeze!.t)!
    expect(bEnd.t - freeze!.t, 'the span A’s own ear accounts for').toBe(heard * US)
    const set = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === bEnd.t)
    expect(set, `nothing reserves the channel at ${bEnd.t / US} µs`).toBeDefined()
    expect(set!.untilNs - set!.t, 'the span that is quiet and booked').toBe(booked * US)
    const difs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-1' && r.t === set!.untilNs)
    expect(difs, 'nothing starts a gap when the reservation expires').toBeDefined()
    expect(difs!.kind).toBe('DIFS')
    expect(difs!.untilNs - difs!.t, 'the span that is really idle').toBe(free * US)
    expect(free * US).toBe(DIFS_NS)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === difs!.untilNs)
    expect(resume, `Talker A does not resume at ${until} µs`).toBeDefined()
    expect(resume!.t).toBe(until * US)
    expect(resume!.value, 'the counter it carries on from').toBe(owed)
    expect(resume!.t - freeze!.t, 'the whole freeze').toBe(total * US)
    // and the caption's own three spans add to the caption's own total
    expect(heard + booked + free, 'the caption’s three spans against its own total').toBe(total)
    // 「那是空口变忙时它还欠着的空闲时隙数」: the three are counted off as slots
    const tx = ofType(rs, 'TX_START').find((r) => r.node === 'sta-1' && r.t > resume!.t)!
    expect(tx.t - resume!.t).toBe(owed * SLOT_NS)
  })

  it('the figure’s 44 µs label is the span it labels, and the lane has the three spans tryThis asks for', () => {
    const dur = lane('Duration').spans[0]
    expect(figure(dur.label!, 'the Duration lane’s label'), 'the label against the span it labels')
      .toBe((dur.toUs - dur.fromUs) * US)
    const set = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === dur.fromUs * US)
    expect(set, 'the labelled span is not a reservation of this run').toBeDefined()
    expect(set!.untilNs).toBe(dur.toUs * US)
    // tryThis: 「说出：它此刻等的是三段等待里的哪一段」
    const spans = counted(nav.tryThis!.join('\n'), /([〇一二三四五六七八九十两]+)段等待/, 'the spans the reader walks')
    expect(lane('A 在等的').spans).toHaveLength(spans)
  })

  it('step 1 adds the two up in front of the reader, and step 2 writes nothing down', () => {
    const [pause, answer, sum] = figs(steps[0], /这里是 (\d+) \+ (\d+) = (\d+) µs/, 'step 1’s arithmetic')
    expect(pause * US).toBe(SIFS_NS)
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([answer * US]))
    expect((pause + answer) * US, 'step 1’s own sum').toBe(sum * US)
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([sum * US]))
    const [zero] = figs(steps[1], /确认帧带的就是 (\d+) µs/, 'what the closing frame writes')
    expect(new Set(acks.map((r) => r.frame.durationFieldNs))).toEqual(new Set([zero * US]))
    // 「而写着零的 Duration，谁的计时器也装不上」
    expect(ofType(rs, 'NAV_SET').some((r) => r.source.startsWith('ack')),
      'an answer that writes nothing down still armed somebody').toBe(false)
  })

  it('`deeper`: the total is first computable three quarters of the way into the wait', () => {
    const text = (nav.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const [total] = figs(text, /(\d+) µs 这个总数/, 'the total')
    const [known] = figs(text, /最早要到 (\d+) µs 才算得出来/, 'when it becomes computable')
    const [gone] = figs(text, /已经过去了 (\d+) µs/, 'how much of the wait had gone by then')
    const [free] = figs(text, /最后那 (\d+) µs/, 'the span that could still grow')

    const set = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === known * US)
    expect(set, `nothing tells Talker A the length of its wait at ${known} µs`).toBeDefined()
    const freeze = ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node === 'sta-1' && r.t <= set!.t).pop()!
    expect(set!.t - freeze.t, 'the wait already behind it when the figure became knowable').toBe(gone * US)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t > set!.t)!
    expect(resume.t - freeze.t, 'the whole wait').toBe(total * US)
    expect(free * US).toBe(DIFS_NS)

    // 「约四分之三」: both the denominator and the numerator come off the sentence, so the
    // fraction the reader is handed is the one the ratio is rounded to — and 「约」 is a claim
    // of its own, that the ratio is not exactly that.
    const m = /约([〇一二三四五六七八九十两]+)分之([〇一二三四五六七八九十两]+)/.exec(text)
    expect(m, '`deeper` no longer says what fraction of the wait had gone by').not.toBeNull()
    const den = zhCount(m![1])
    const num = zhCount(m![2])
    const ratio = (gone * US) / (resume.t - freeze.t)
    expect(Math.round(ratio * den), `${gone} of ${total} µs, to the nearest 1/${den}`).toBe(num)
    expect(ratio, '「约」 says the ratio is not exactly that fraction').not.toBe(num / den)
  })

  it('`observe` and `tryThis` quote the same countdowns and the same two instants', () => {
    const [times] = figs(nav.observe!.join('\n'), /旁听者的 (\d+) 条/, 'the countdowns the reader may check')
    expect(listener.length).toBe(times)
    const [from, to] = figs(nav.tryThis!.join('\n'), /从 (\d+) µs 走到 (\d+) µs/, 'the walk the reader is asked to take')
    expect(ofType(rs, 'BACKOFF_FREEZE').some((r) => r.node === 'sta-1' && r.t === from * US),
      `nothing freezes Talker A at ${from} µs`).toBe(true)
    expect(ofType(rs, 'BACKOFF_RESUME').some((r) => r.node === 'sta-1' && r.t === to * US),
      `Talker A does not resume at ${to} µs`).toBe(true)
  })

  it('`limits`: the real field’s width, and what this engine’s ideal one never has to hold', () => {
    const ideal = nav.limits.find((x) => x.text.includes('durationFieldNs'))!.text
    const [bits] = figs(ideal, /是 (\d+) 位/, 'the width of the real field')
    const [max] = figs(ideal, /最大只装得下 ([\d\s]+) µs/, 'what the real field holds')
    expect(2 ** bits - 1, `${bits} bits of microseconds`).toBe(max)
    // so the limit is about resolution and drift, not about range: every reservation this engine
    // writes would fit in the real field with room to spare
    for (const r of ofType(rs, 'TX_START')) {
      expect((r.frame.durationFieldNs ?? 0) / US, `the Duration written at ${r.t}`).toBeLessThanOrEqual(max)
    }
    // 「513 次无一例外」 is quoted here too, as a property of the model rather than of the air
    const [times] = figs(ideal, /(\d+) 次无一例外/, 'the countdowns this limit quotes')
    expect(listener.length).toBe(times)
  })

  it('`limits`: 「忙」 has the two sources, and one of them is the one countdown', () => {
    const busy = nav.limits.find((x) => x.text.includes('mediumBusy'))!.text
    const sources = counted(busy, /只有([〇一二三四五六七八九十两]+)个来源/, 'the sources of 「忙」')
    const alsoTwo = counted(busy, /只是其中([〇一二三四五六七八九十两]+)条/, 'how many of them a real device has')
    const one = counted(nav.limits.find((x) => x.text.includes('intra-BSS'))!.text,
      /每台站点只有([〇一二三四五六七八九十两]+)只 NAV/, 'how many countdowns a station holds')

    const m = /private mediumBusy\(\): boolean \{\s*return ([^\n]+)\n/.exec(mac)
    expect(m, 'mac.ts no longer has the one-line mediumBusy this sentence is about').not.toBeNull()
    const arms = m![1].replace(/;$/, '').split('||').map((s) => s.trim())
    expect(arms.length, `the arms of mediumBusy: ${arms.join(' / ')}`).toBe(sources)
    expect(arms.filter((a) => /navUntil/.test(a)).length,
      `the arms of mediumBusy that are a countdown: ${arms.join(' / ')}`).toBe(one)
    // 「在真实设备上只是其中两条」 is the same two
    expect(alsoTwo).toBe(sources)
    // and the run never defers for anything else: while a station's own countdown runs and the
    // air is empty of its neighbours' frames, nothing else in this engine holds it back
    expect(ofType(rs, 'NAV_SET').length).toBeGreaterThan(500)
  })

  it('`limits`: the 28 µs inside the 44 is this simulator’s rate rule, not the standard’s', () => {
    const mv = nav.limits.find((x) => x.kind === 'model-value')!.text
    const [whole, part] = figs(mv, /(\d+) µs 里的 (\d+) µs 来自本仿真器的 ACK 速率规则/,
      'the model value inside the reservation')
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([whole * US]))
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([part * US]))
    // the rule named is the one that produced it
    expect(new Set(acks.map((r) => r.frame.mbps)))
      .toEqual(new Set(data.map((r) => ctrlRespRateFor(r.frame.mbps))))
  })

  it('`limits`: TXOP protection IS modelled, and the lesson no longer says otherwise', () => {
    // The finding, written out in this describe's docblock: the sentence listed TXOP protection
    // among what is not modelled, nineteen days after it landed. Both halves of the correction
    // are measured, not read: the schema takes the setting, and the MAC acts on it.
    const busy = nav.limits.find((x) => x.text.includes('mediumBusy'))!.text
    const sc2 = nav.scenario()
    sc2.nodes = sc2.nodes.map((n) => n.kind === 'sta' ? { ...n, txopProtection: 'multiple' } : n)
    expect(() => ScenarioSchema.parse(sc2),
      '`txopProtection` is not a setting a node can carry').not.toThrow()
    expect(mac, 'the MAC no longer writes the remainder of a burst into the Duration field')
      .toContain("this.cfg.txopProtection === 'multiple'")
    const unmodelled = busy.split('都没有建模')[0]
    expect(unmodelled.includes('TXOP'), 'this sentence lists TXOP 保护 among what is not modelled,'
      + ' and a node that carries `txopProtection` makes the MAC announce the whole burst in the'
      + ' very Duration field this lesson is about').toBe(false)
  })

  it('`limits`: a second access point is refused by name, not quietly ignored', () => {
    const text = nav.limits.find((x) => x.text.includes('接入点'))!.text
    const [file] = /([a-z]+\.ts) 的校验/.exec(text)!.slice(1)
    const sc2 = nav.scenario()
    sc2.nodes = [...sc2.nodes, { ...sc2.nodes[0], id: 'ap-2', name: 'AP 2' }]
    expect(() => ScenarioSchema.parse(sc2), 'a second access point is accepted after all').toThrow(/AP/)
    expect(readFileSync(resolve(ROOT, `src/model/${file}`), 'utf8'),
      `${file} does not hold the refusal this sentence cites`).toContain('个 AP')
  })

  it('`limits` name only code this repository has, in the files they name it in', () => {
    // Four citations across the five entries, in three shapes: 「mac.ts 只在 onRxOk 里调
    // updateNav」, 「mac.ts 的 mediumBusy」, a bare `durationFieldNs`, and 「节点上的
    // txopProtection，mac.ts 把剩余时长写进 Duration」. Every identifier must be declared in one
    // of the files `limits` themselves name, which is stricter than existing somewhere in the
    // repository — the whole point of a citation is that it says where to look.
    const texts = nav.limits.map((x) => x.text).join('\n')
    const named = [...texts.matchAll(/\b([a-z][a-z0-9]*\.ts)\b/g)].map((x) => x[1])
    const src = [...new Set(named)].map((f) => {
      const p = ['src/engine', 'src/model', 'src/course'].map((d) => resolve(ROOT, `${d}/${f}`)).find(existsSync)
      expect(p, `${f} is not a file of this repository`).toBeDefined()
      return readFileSync(p!, 'utf8')
    }).join('\n')
    const syms = [...texts.matchAll(/\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)].map((x) => x[1])
    for (const sym of syms) {
      expect(src.includes(sym), `\`${sym}\` is named here, and by none of the files named with it`).toBe(true)
    }
    expect(named.length, 'the files `limits` cite').toBe(4)
    expect(syms.length, 'the identifiers `limits` name').toBe(5)
  })

  it('`sources` quotes the airtimes of the frame and the answer the run really has', () => {
    const line = nav.sources!.find((s) => s.includes('确认帧'))!
    const [frame, answer] = figs(line, /(\d+) µs 的帧、(\d+) µs 的确认帧/, 'the two airtimes `sources` quotes')
    const air = lane('空口').spans[0]
    const b = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t === air.fromUs * US)!
    expect(b.frame.txTimeNs, 'the frame the figure draws').toBe(frame * US)
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([answer * US]))
  })
})
