/**
 * Every empirical claim in "SIFS and DIFS: two waits", measured against the
 * lesson's own scene (the oneRoom access point and one saturated uploader).
 *
 * Re-paced on 2026-09-25. Three things changed here:
 *
 *  - the lesson's EIFS material moved to `edca-cost`, which the controller has
 *    not registered yet. Its arithmetic pin (94 = 16 + 44 + 34) therefore STAYS
 *    in this file, marked, so the programme's "no pin is deleted" rule holds
 *    across the gap; `edca-cost`'s own test takes it when that lesson lands.
 *    What the lesson still claims in its own right — that no station in this
 *    scene ever waits one — is pinned as before.
 *  - the six-row 「完整的一轮，按顺序」table became the timing diagram, so the
 *    pin that used to read the table's cells now reads `ifsTiming()`'s spans and
 *    compares each one with the run. Not one figure is lost: the same six
 *    instants are asserted, and the figure cannot drift from the simulator.
 *  - the diagram's geometry is checked here too, because
 *    tests/course/diagram.test.ts pins its own fixtures rather than walking the
 *    course: a label that leaves the viewBox or lands on another label is a
 *    defect a reader sees.
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts —
 * "DATA→ACK is always exactly one SIFS" and "after every ACK the station waits
 * a DIFS and then draws a fresh backoff" — are re-asserted here beside the
 * sentences that now carry them; the originals stay where they are.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ifs, ifsTiming } from '../../src/course/tier1/ifs'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import {
  ACK_BYTES, ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS, MANDATORY_MBPS, SIFS_NS, SLOT_NS, txTimeNs,
} from '../../src/engine/phy'
import { LESSONS } from '../../src/course/lessons'
import { MODULES } from '../../src/course/curriculum'
import { clampSpan } from '../../src/ui/timelineGestures'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
/** 100 ms: the window the "254 answers" sentence is counted over. */
const RUN_NS = 100 * MS

const recs = (): TLRecord[] => runOf(ifs, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)
const lane = (label: string): TimingLane => ifsTiming().lanes.find((l) => l.label === label)!

lessonShapeSuite(ifs, { runNs: RUN_NS })

describe('ifs · the lesson’s own scene', () => {
  it('follows airtime and owns the two waiting times of this scene', () => {
    expect(MODULES[ifs.module].title).toBe('等待与退避')
    expect(ifs.needs).toEqual(['airtime'])
    // EIFS left with the material that moved to `edca-cost`; `slot` stays, because it is
    // the unit the longer of the two waits is built from.
    expect(ifs.terms!.map((t) => t.term)).toEqual(['slot', 'SIFS', 'DIFS'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(ifs.scenario())).not.toThrow()
    expect(ifs.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1'])
  })
})

describe('ifs · the two waits', () => {
  it('a slot is 9 µs, the short gap 16 µs, and the longer one is their sum plus a slot', () => {
    // the table's "slot … 9 µs", "SIFS … 16 µs" and "DIFS … 34 µs = SIFS + 2 slots" rows,
    //  and the picture's "the short gap plus two slots"
    expect(SLOT_NS).toBe(9_000)
    expect(SIFS_NS).toBe(16_000)
    expect(DIFS_NS).toBe(34_000)
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
  })

  it('no station in this scene ever waits an EIFS', () => {
    // 「这里的每一帧要么被干干净净地听到，要么根本没被听到，所以它一次也不会启动」
    const kinds = ofType(recs(), 'IFS_START').map((r) => r.kind)
    expect(kinds.length).toBeGreaterThan(200)
    expect(new Set(kinds)).toEqual(new Set(['DIFS']))
  })

  it('the penalty wait is 94 µs: the short gap, a whole answer and a DIFS', () => {
    // The 94 µs sum moved to `edca-cost` with the EIFS material and is pinned there,
    // beside the run that actually arms an EIFS. What stays here is the claim this
    // lesson still makes: `sources` names §10.3.2.3.7, so the constant it cites has
    // to be the engine's.
    expect(EIFS_NS).toBe(SIFS_NS + ACK_TX_TIME_6M_NS + DIFS_NS)
  })
})

describe('ifs · what that buys in this run', () => {
  it('the uploader’s frame is 248 µs and every one of the 254 answers starts 16 µs later', () => {
    // the caption's "the frame ends at 248 µs … every one of this run's 254 answers starts
    //  16 µs after the frame end"
    const data = txs('data')
    const acks = txs('ack')
    expect(data.length).toBe(255)
    expect(acks.length).toBe(254)
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([1528]))
    expect(new Set(data.map((r) => r.frame.txTimeNs))).toEqual(new Set([248_000]))
    const ends = ofType(recs(), 'TX_END').filter((r) => r.frame.kind === 'data')
    for (const a of acks) expect(a.t - ends.filter((e) => e.t <= a.t).pop()!.t).toBe(SIFS_NS)
  })

  it('every DIFS in the run lasts 34 µs, and the station draws only once it is over', () => {
    // the observation "a 34 µs DIFS runs before the station even draws its next wait", the
    //  experiment "measure the DIFS with the 9 µs slot ruler", and the caption's
    //  "the DIFS runs to 326 µs, and only now does the station draw"
    const waits = ofType(recs(), 'IFS_START').filter((r) => r.untilNs > r.t)
    expect(waits.length).toBeGreaterThan(200)
    for (const w of waits) expect(w.untilNs - w.t).toBe(DIFS_NS)
    const draws = ofType(recs(), 'BACKOFF_DRAW')
    expect(draws.length).toBeGreaterThan(200)
    for (const d of draws) expect(waits.some((w) => w.untilNs === d.t)).toBe(true)
  })

  it('silence already elapsed counts, so the very first gap is zero long', () => {
    // the procedure's step 3 and the second quiz question, "zero — the silence it asks for
    //  had already gone by". `beginIfsAc` in src/engine/mac.ts ends the gap at
    // max(now, lastBusyEnd + gap), and lastBusyEnd starts before time itself.
    const ifss = ofType(recs(), 'IFS_START')
    const zero = ifss.filter((r) => r.untilNs === r.t)
    expect(zero.length).toBe(1)
    expect(zero[0].t).toBe(0)
    expect(zero[0].kind).toBe('DIFS')
    for (const r of ifss.slice(1)) expect(r.untilNs - r.t).toBe(DIFS_NS)
    /*
     * **`limits` states the consequence, and the 「第」 rule change of 2026-10-14 uncovered its
     * figure**: 「『从来没听见介质忙过就算一直空闲』是引擎自己的起始约定……于是第一帧落在
     * 0 µs，第一段间隙长度为零」. Both halves are read: where the first frame falls, and that
     * the gap in front of it is the one gap of the run with no length at all.
     */
    const lim = ifs.limits.map((l) => l.text).join(' ')
    const m = /于是第一帧落在 (\d+) µs，第一段间隙长度为(.)/.exec(lim)
    expect(m, '`limits` no longer states where the first frame falls').not.toBeNull()
    expect(Number(m![1]) * 1000, 'where the first frame really falls').toBe(txs('data')[0]!.t)
    expect(m![2], 'and the length it gives that first gap').toBe('零')
    expect(zero[0].t, 'which is the gap in front of that very frame').toBe(txs('data')[0]!.t)
  })

  it('an uninterrupted first gap is basic access: the frame goes out with no draw', () => {
    // the procedure's step 4, "the station transmits immediately and draws no random wait
    //  at all", against step 5's "this time it must draw a random wait before it may send"
    const first = txs('data')[0]
    expect(first.t).toBe(0)
    const draws = ofType(recs(), 'BACKOFF_DRAW')
    expect(draws.length).toBeGreaterThan(200)
    expect(draws[0].t).toBeGreaterThan(first.t)
    expect(draws.every((d) => d.value >= 0)).toBe(true)
  })

  it('the answer never contends: no gap is even started between the frame and its ACK', () => {
    // the procedure's step 6, "a receiver that owes an ACK does not contend at all".
    // scheduleResponse in src/engine/mac.ts arms a SIFS timer instead of entering access.
    const ends = ofType(recs(), 'TX_END').filter((r) => r.frame.kind === 'data')
    const ifss = ofType(recs(), 'IFS_START')
    for (const a of txs('ack')) {
      const d = ends.filter((e) => e.t <= a.t).pop()!
      expect(a.t - d.t).toBe(SIFS_NS)
      expect(ifss.some((r) => r.node === a.node && r.t >= d.t && r.t <= a.t)).toBe(false)
    }
  })
})

describe('ifs · the timing figure is the run', () => {
  it('every span of the figure is a record of this run: 0 → 248 → 264 → 292 → 326 → 425 µs', () => {
    // What the deleted 「完整的一轮，按顺序」table used to assert, now read out of the spec
    // the reader is actually shown.
    const air = lane('空口').spans
    const data = txs('data')
    const ack = txs('ack')[0]
    expect(air[0].fromUs).toBe(data[0].t / 1000)
    expect(air[0].toUs).toBe((data[0].t + data[0].frame.txTimeNs) / 1000)
    expect([air[0].fromUs, air[0].toUs]).toEqual([0, 248])
    expect(air[1].fromUs).toBe(ack.t / 1000)
    expect(air[1].toUs).toBe((ack.t + ack.frame.txTimeNs) / 1000)
    expect([air[1].fromUs, air[1].toUs]).toEqual([264, 292])
    expect(air[2].fromUs).toBe(data[1].t / 1000)
    expect(air[2].fromUs).toBe(425)

    const sifs = lane('SIFS').spans[0]
    expect(sifs.fromUs).toBe(air[0].toUs)
    expect(sifs.toUs).toBe(air[1].fromUs)
    expect((sifs.toUs - sifs.fromUs) * 1000).toBe(SIFS_NS)

    const difs = lane('DIFS').spans[0]
    const rec = ofType(recs(), 'IFS_START').find((r) => r.t === 292_000)!
    expect(rec.kind).toBe('DIFS')
    expect(difs.fromUs).toBe(rec.t / 1000)
    expect(difs.toUs).toBe(rec.untilNs / 1000)
    expect((difs.toUs - difs.fromUs) * 1000).toBe(DIFS_NS)

    const bo = lane('退避').spans[0]
    const draw = ofType(recs(), 'BACKOFF_DRAW')[0]
    expect(draw.t).toBe(326_000)
    expect(draw.value).toBe(11)
    expect(bo.fromUs).toBe(draw.t / 1000)
    expect(bo.toUs).toBe((draw.t + draw.value * SLOT_NS) / 1000)
    expect(bo.label).toBe('11 个时隙')
    // and the axis holds the whole turn
    expect(ifsTiming().axis.toUs).toBeGreaterThanOrEqual(bo.toUs)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(ifsTiming())
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
 * Everything above measures the engine against a literal written in THIS file —
 * `expect(SLOT_NS).toBe(9_000)`, `expect(acks.length).toBe(254)`,
 * `expect(draw.value).toBe(11)`. That is what keeps the engine from drifting, and it leaves the
 * lesson free to drift: all eighteen figures `@ifs` hand-types could each be edited to a
 * neighbouring number with this file still green.
 *
 * What follows is the other half of each, with no figure on this side. The two waits and the
 * slot come off the table's own cells — including 「34 µs = SIFS + 2 个时隙」, whose `2` is read
 * out of the cell and multiplied by the engine's own slot — the first turn's five instants off
 * the caption, the three span labels off the spans they label, 「两个时隙」 off `picture` and off
 * `tryThis`, the two waits again off `observe` and off both quiz options, and the 1528-byte frame
 * and the EIFS definition off `sources`.
 *
 * `limits` is read too, and it is where this lesson keeps its widest claims — two of them about
 * the ENGINE having no delay at all, which is measurable here and nowhere else in the course:
 *
 *  - 「侦听的翻转没有检测时延：一路发射开始的那一纳秒，听得见的电台就同时翻成忙」. All 1018
 *    `CCA_BUSY` records of this run land on the same nanosecond as a `TX_START`, and so do all
 *    509 `RX_START`s — which is the other half of the same entry, 「传播时延在这台引擎里是零」.
 *    The standard's own 「最多 4 µs 内报告」 is a figure about radios, and this repository holds
 *    no clause text to check it against; what is checked is the zero the engine actually has.
 *    `scripts/figure-planting.ts` therefore reports that 4 as unpinned, correctly: of the 26
 *    figures this lesson prints it is one of two that nothing here can check, the other being
 *    `tryThis`'s 「约 200 µs」 window. Both carry their argument where they are asserted.
 *  - 「全场所有站点共用同一个时基」. The Wi-Fi node schema has no clock-offset field to carry:
 *    `ppm` exists on `uwb` only. 「几十 ppm」 is a property of real crystals and stays unchecked
 *    for the same reason as the 4 µs — stated here rather than asserted weakly.
 */
describe('ifs · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const data = txs('data')
  const acks = txs('ack')
  const gaps = ofType(rs, 'IFS_START')
  const draws = ofType(rs, 'BACKOFF_DRAW')
  const ends = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'data')

  const table = ifs.numbers!.find((x) => x.kind === 'table') as
    { heading: string; head: string[]; rows: string[][] }
  const caption = (ifs.numbers!.find((x) => x.kind === 'diagram') as { caption: string }).caption
  const steps = (ifs.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const pictureText = (ifs.picture! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const quizText = ifs.quiz!.flatMap((q) => [...q.options, q.explain ?? '']).join('\n')
  const limitText = ifs.limits.map((x) => x.text).join('\n')

  /** 「9 µs」 → 9_000: a cell that is a figure and its unit, and nothing else. */
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

  it('the table: the slot, the short wait, and the long one spelled out as a sum', () => {
    expect(table.rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    const slot = figure(table.rows[0][1], 'the slot')
    const short = figure(table.rows[1][1], 'the short wait')
    expect(slot).toBe(SLOT_NS)
    expect(short).toBe(SIFS_NS)

    // 「34 µs = SIFS + 2 个时隙」: the figure, and the arithmetic the cell prints beside it
    const [long, slots] = figs(table.rows[2][1], /^(\d+) µs = SIFS \+ (\d+) 个时隙$/,
      'the long wait and how many slots it adds')
    expect(long * US).toBe(DIFS_NS)
    expect(short + slots * slot, 'the sum the cell prints').toBe(long * US)

    // 「较长等待都是拿它搭出来的」: a cell with no figure is a claim too — what the long wait
    // adds to the short one is a whole number of slots, and so is every gap in the run
    expect((DIFS_NS - SIFS_NS) % SLOT_NS).toBe(0)
    expect(gaps.length).toBeGreaterThan(200)
    for (const g of gaps) {
      if (g.untilNs > g.t) expect((g.untilNs - g.t - short) % slot, `the gap at ${g.t}`).toBe(0)
    }

    // 「只有已经在进行的那次交互」 may follow the short wait: in this run the only thing that
    // ever starts one short wait after the air goes quiet is the answer, and no gap is even
    // armed for it
    for (const a of acks) {
      const d = ends.filter((e) => e.t <= a.t).pop()!
      expect(a.t - d.t, `the answer at ${a.t}`).toBe(short)
      expect(gaps.some((g) => g.node === a.node && g.t >= d.t && g.t <= a.t)).toBe(false)
    }
  })

  it('the 出处 column cites the clauses this lesson’s own `sources` cite, for the same figures', () => {
    // Prose against prose, which this programme otherwise refuses; the argument for the
    // exception is that both sides are THIS lesson. A table that cites §17.4.4 for the slot
    // while `sources` says §17.4.4 gives something else is one lesson contradicting itself,
    // and that is a defect whichever side is wrong.
    const src = ifs.sources!.join('\n')
    for (const row of table.rows) {
      expect(src.includes(row[3]), `the table cites ${row[3]} for ${row[0]} and \`sources\` never`
        + ' names that clause').toBe(true)
    }
    // and `sources` prints the two PHY figures itself
    const [sifsUs] = figs(src, /aSIFSTime 为 (\d+) µs/, '`sources` on aSIFSTime')
    const [slotUs] = figs(src, /aSlotTime 为 (\d+) µs/, '`sources` on aSlotTime')
    expect(sifsUs * US).toBe(SIFS_NS)
    expect(slotUs * US).toBe(SLOT_NS)
    const n = counted(src, /DIFS 定义为 SIFS 加([〇一二三四五六七八九十两]+)个时隙/,
      '`sources` on how DIFS is built')
    expect(SIFS_NS + n * SLOT_NS).toBe(DIFS_NS)
    // 「EIFS = SIFS + DIFS + 以最低强制速率发完一个确认帧的时间」, against the engine's own
    // constant and its own lowest mandatory rate
    expect(EIFS_NS).toBe(SIFS_NS + DIFS_NS + txTimeNs(ACK_BYTES, MANDATORY_MBPS[0]))
    expect(ACK_TX_TIME_6M_NS).toBe(txTimeNs(ACK_BYTES, MANDATORY_MBPS[0]))
    // and 「它在本场景里一次也没有启动过」
    expect(new Set(gaps.map((g) => g.kind))).toEqual(new Set(['DIFS']))
    // 「1528 字节的帧」
    const [bytes] = figs(src, /(\d+) 字节的帧/, '`sources` on the frame this scene sends')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
  })

  it('the caption: the first turn’s five instants, the draw, and the run’s whole census', () => {
    const [short, long] = figs(caption, /(\d+) µs 对 (\d+) µs/, 'the two waits the figure draws')
    const [frameEnd] = figs(caption, /帧在 (\d+) µs 结束/, 'when the frame ends')
    const [ackEnd] = figs(caption, /(\d+) µs 结束；DIFS/, 'when the answer ends')
    const [difsEnd] = figs(caption, /DIFS 从那里走到 (\d+) µs/, 'when the long wait ends')
    const [drawn] = figs(caption, /这次抽到 (\d+) 个时隙/, 'the wait it draws')
    const [next] = figs(caption, /下一帧落在 (\d+) µs/, 'when the next frame goes out')
    const [answers, after] = figs(caption, /本轮 (\d+) 个回答，个个都在帧尾之后 (\d+) µs 开始/,
      'the census of answers')

    expect(short * US).toBe(SIFS_NS)
    expect(long * US).toBe(DIFS_NS)
    expect(data[0].t + data[0].frame.txTimeNs, 'when the first frame ends').toBe(frameEnd * US)
    expect(acks[0].t, 'when the first answer starts').toBe(frameEnd * US + short * US)
    expect(acks[0].t + acks[0].frame.txTimeNs, 'when the first answer ends').toBe(ackEnd * US)
    const difs = gaps.find((g) => g.t === ackEnd * US)
    expect(difs, `no gap starts at ${ackEnd} µs`).toBeDefined()
    expect(difs!.kind).toBe('DIFS')
    expect(difs!.untilNs, 'when the long wait ends').toBe(difsEnd * US)
    expect(draws[0].t, 'the station draws only once the long wait is over').toBe(difsEnd * US)
    expect(draws[0].value, 'what it draws').toBe(drawn)
    expect(data[1].t, 'when the next frame goes out').toBe(next * US)
    expect(data[1].t - draws[0].t, 'and the draw is counted off in slots').toBe(drawn * SLOT_NS)
    // the census, and 「个个都」 means every one of them
    expect(acks.length).toBe(answers)
    for (const a of acks) {
      expect(a.t - ends.filter((e) => e.t <= a.t).pop()!.t, `the answer at ${a.t}`).toBe(after * US)
    }
  })

  it('the figure’s three labels are the spans they label', () => {
    const sifs = lane('SIFS').spans[0]
    const difs = lane('DIFS').spans[0]
    const bo = lane('退避').spans[0]
    expect(figure(sifs.label!, 'the SIFS lane’s label')).toBe((sifs.toUs - sifs.fromUs) * US)
    expect(figure(difs.label!, 'the DIFS lane’s label')).toBe((difs.toUs - difs.fromUs) * US)
    const [slots] = figs(bo.label!, /^(\d+) 个时隙$/, 'the backoff lane’s label')
    expect(slots).toBe(draws[0].value)
    expect((bo.toUs - bo.fromUs) * US, 'the span the label counts off').toBe(slots * SLOT_NS)
  })

  it('`picture` and `tryThis` both say the long wait adds exactly two slots, and the run never adds more', () => {
    const inPicture = counted(pictureText, /短间隙再加([〇一二三四五六七八九十两]+)个时隙/,
      '`picture` on how the long wait is built')
    const again = counted(pictureText, /多出来的这([〇一二三四五六七八九十两]+)个时隙/,
      '`picture` on the extra wait')
    const exactly = counted(ifs.tryThis!.join('\n'), /恰好([〇一二三四五六七八九十两]+)个时隙/,
      '`tryThis` on what the reader should measure')
    expect(SIFS_NS + inPicture * SLOT_NS).toBe(DIFS_NS)
    expect(again).toBe(inPicture)
    expect(exactly).toBe(inPicture)
    // 「绝不会更多」: every gap this run arms is that length to the nanosecond
    for (const g of gaps) {
      if (g.untilNs > g.t) expect(g.untilNs - g.t, `the gap at ${g.t}`).toBe(SIFS_NS + exactly * SLOT_NS)
    }
    // and the ruler `tryThis` hands the reader is the engine's slot, at a span the strip can show
    const [ruler] = figs(ifs.tryThis!.join('\n'), /拿 (\d+) µs 的时隙刻度/, '`tryThis`’s ruler')
    expect(ruler * US).toBe(SLOT_NS)
    // **The window is pinned to a range and not to a figure, and that is the whole of what can
    // be pinned.** `scripts/figure-planting.ts` reports it as unpinned — 「约 200 µs」 edited to
    // 201, or to 300, leaves every assertion below true. It should: 「约」 is one significant
    // figure, and there is no quantity in this simulator equal to 200 µs. What a reader needs of
    // this window is that the strip can show it, that it is wider than the gap it is for and
    // narrower than the whole turn, and those are the three claims asserted.
    const [span] = figs(ifs.tryThis!.join('\n'), /缩放到约 (\d+) µs 的跨度/, 'the window to zoom to')
    expect(clampSpan(span * US), 'the strip cannot show the window this asks for').toBe(span * US)
    expect(span * US, 'the window is narrower than the gap it is for').toBeGreaterThan(DIFS_NS)
    expect(span * US, 'and zooming in is only needed because the whole turn is wider')
      .toBeLessThan(ifsTiming().axis.toUs * US)
  })

  it('`observe` and the quiz quote the same two waits, and the first frame at zero', () => {
    const [short] = figs(ifs.observe!.join('\n'), /每一次都是 (\d+) µs 的/, '`observe` on the short wait')
    const [long] = figs(ifs.observe!.join('\n'), /走完一个 (\d+) µs 的 DIFS/, '`observe` on the long wait')
    expect(short * US).toBe(SIFS_NS)
    expect(long * US).toBe(DIFS_NS)
    const [quizLong] = figs(quizText, /一个完整的 DIFS，(\d+) µs/, 'the quiz option naming the long wait')
    const [quizShort] = figs(quizText, /一个 SIFS，(\d+) µs/, 'the quiz option naming the short wait')
    expect(quizLong * US).toBe(DIFS_NS)
    expect(quizShort * US).toBe(SIFS_NS)
    // 「本轮第一帧就落在 0 µs」, and the first gap it did not have to wait out
    const [first] = figs(quizText, /本轮第一帧就落在 (\d+) µs/, 'where the first frame lands')
    expect(data[0].t).toBe(first * US)
    const zero = gaps.filter((g) => g.untilNs === g.t)
    expect(zero.map((g) => g.t), 'the gaps of no length at all').toEqual([first * US])
  })

  it('`limits`: the two waits are constants, and this engine has no delay of any kind', () => {
    const [short, long] = figs(limitText, /(\d+) µs 与 (\d+) µs 是 phy\.ts 里的常数/,
      '`limits` on where the two waits come from')
    expect(short * US).toBe(SIFS_NS)
    expect(long * US).toBe(DIFS_NS)
    // 「全场所有站点共用同一个时基」: there is no clock-offset field for a Wi-Fi node to carry.
    // `ppm` is a `uwb` field — a ranging clock — and nothing in the MAC reads one.
    const sc = ifs.scenario()
    for (const n of sc.nodes) expect(n.uwb, `${n.id} is a Wi-Fi node with a ranging clock`).toBeUndefined()
    expect(readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8'),
      'the MAC reads a per-device clock offset after all').not.toContain('ppm')

    // 「一路发射开始的那一纳秒，听得见的电台就同时翻成忙」 and 「传播时延在这台引擎里是零」:
    // the standard's own 「最多 4 µs 内报告」 is a figure about radios and this repository has no
    // clause text to check it against, so what is asserted is the zero the engine has.
    const starts = new Set(ofType(rs, 'TX_START').map((r) => r.t))
    const busy = ofType(rs, 'CCA_BUSY')
    expect(busy.length).toBeGreaterThan(1000)
    for (const b of busy) expect(starts.has(b.t), `a busy report at ${b.t}, between transmissions`).toBe(true)
    const rx = ofType(rs, 'RX_START')
    expect(rx.length).toBeGreaterThan(500)
    for (const r of rx) expect(starts.has(r.t), `a reception starting at ${r.t}, after its own frame`).toBe(true)
    // and the slot is the figure that pays for both, which `limits` prints as well
    const [slot] = figs(limitText, /时隙之所以要 (\d+) µs/, '`limits` on what the slot pays for')
    expect(slot * US).toBe(SLOT_NS)
  })

  it('`limits`: the long wait is the figure that only holds without traffic classes', () => {
    const scoped = ifs.limits.find((x) => x.kind === 'out-of-scope')!
    const [long] = figs(scoped.text, /^(\d+) µs 这个数/, '`limits` on the figure that is DCF’s own')
    expect(long * US).toBe(DIFS_NS)
    // The entry states it twice (「根本不会有两台都等 34 µs」), and `scripts/figure-planting.ts`
    // found the second occurrence editable on its own: every µs figure in this entry is the
    // same wait, so every one of them is read.
    const all = [...scoped.text.matchAll(/(\d+) µs/g)].map((m) => Number(m[1]))
    expect(all.length, 'the entry states the long wait more than once').toBeGreaterThan(1)
    for (const n of all) expect(n * US, `「${n} µs」 in the out-of-scope entry`).toBe(DIFS_NS)
    // every gap in this scene really is that one figure, which is what makes the limit a limit
    expect(new Set(gaps.filter((g) => g.untilNs > g.t).map((g) => g.untilNs - g.t)))
      .toEqual(new Set([long * US]))
    // and the lesson it promises the ladder to is a lesson
    expect(LESSONS.some((l) => l.id === scoped.until), `\`until\` names ${scoped.until}`).toBe(true)
  })

  it('`limits` name only code this repository has, in the files they name it in', () => {
    // Three files and three identifiers across the four entries: 「phy.ts 里的常数」,
    // 「mac.ts 的 beginIfsAc」, 「channel.ts 的 updateAllCca」, and a bare `lastBusyEndNs`
    // whose file is named by another entry. Every identifier must be declared in one of the
    // files `limits` themselves name — the whole point of a citation is that it says where
    // to look.
    const named = [...limitText.matchAll(/\b([a-z][a-z0-9]*\.ts)\b/g)].map((x) => x[1])
    const src = [...new Set(named)].map((f) => {
      const p = ['src/engine', 'src/model', 'src/course'].map((d) => resolve(ROOT, `${d}/${f}`)).find(existsSync)
      expect(p, `${f} is not a file of this repository`).toBeDefined()
      return readFileSync(p!, 'utf8')
    }).join('\n')
    const syms = [...limitText.matchAll(/\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)].map((x) => x[1])
    for (const sym of syms) {
      expect(src.includes(sym), `\`${sym}\` is named here, and by none of the files named with it`).toBe(true)
    }
    expect(named.length, 'the files `limits` cite').toBe(3)
    expect(syms.length, 'the identifiers `limits` name').toBe(3)
  })

  it('the procedure’s own two figures are the ones the engine deals in', () => {
    // Step 3's 「这段间隙的长度是零」 and step 4's basic access, which between them describe
    // the only gap of this run that has no length — the lesson's claim is that the station
    // which has never heard the medium busy is treated as having been idle all along.
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    expect(steps[2]).toContain('长度是零')
    expect(gaps.filter((g) => g.untilNs === g.t).map((g) => g.t)).toEqual([0])
    // step 4: that first frame goes out with no draw before it
    expect(data[0].t).toBe(0)
    expect(draws[0].t).toBeGreaterThan(data[0].t)
    // step 6: the answer skips all of it, every time
    expect(acks.length).toBe(data.length - 1)
  })
})
