/**
 * Every empirical claim in "Protecting the burst — one question, one answer, the
 * whole turn announced", measured against the lesson's own scenario and its two
 * variants.
 *
 * The lesson had no test file of its own before the readability rewrite. Its
 * pins lived — and still live — in tests/course/lesson-claims.test.ts
 * ("lesson 10 · protecting the burst"): the four rows of the 300 ms table, the
 * reach of each policy's reservation, the 24-of-29 census of the single run, the
 * bare-threshold experiment (21 → 80 collisions, 614 → 344 deliveries) and every
 * timing of the observe list. That file is untouched and still passes.
 *
 * Re-paced on 2026-09-25 (§2 M8 of the re-pacing plan). What went to
 * tests/course/protect-policies.test.ts with the prose: the third column of both
 * tables (the multiple-protection run, which comes out identical to boundary),
 * the Durations a data frame carries under multiple protection, the CF-End census
 * and the arithmetic of the 288 µs it hands back. What stays here is the
 * announcement itself and what it buys, plus the new sequence figure, whose every
 * message is a record of this run.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { txopProtect, protectSequence } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = boundary protection; variant 0 = single; variant 1 = multiple. */
const boundary = (): TLRecord[] => runOf(txopProtect, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(txopProtect, 0, RUN_NS)
// variant 1, multiple protection, is `protect-policies`'s business now: this half's tables
// have two columns. The variant itself stays here, because the two halves must carry the
// same list (tests/course/kit.ts checks it scenario for scenario).

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
/** Air spent on the frames that do not carry data: the question, the answer and the closing frame. */
const announcingNs = (rs: TLRecord[]): number =>
  txs(rs, (r) => ['rts', 'cts', 'cfend'].includes(r.frame.kind)).reduce((a, r) => a + r.frame.txTimeNs, 0)
const allAirNs = (rs: TLRecord[]): number => txs(rs).reduce((a, r) => a + r.frame.txTimeNs, 0)
/** How long a reservation the hidden station loads lasts, averaged over the run. */
const meanNavNs = (rs: TLRecord[]): number => {
  const set = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2')
  expect(set.length).toBeGreaterThan(20)
  return set.reduce((a, r) => a + (r.untilNs - r.t), 0) / set.length
}

lessonShapeSuite(txopProtect, { runNs: RUN_NS })

describe('txop-protect · the lesson’s own scene', () => {
  it('sits in the QoS module and names the lessons its words come from', () => {
    expect(MODULES[txopProtect.module].title).toBe('QoS 与效率')
    // `nav` owns NAV, `rts-cts` owns the question and the answer (§6 moves the edge there
    // from `hidden`, and that half is now registered), `txop` owns the burst it protects.
    expect(txopProtect.needs).toEqual(['nav', 'rts-cts', 'txop'])
    // `protection` is this half's own word; CF-End and CTS-to-self went to `protect-policies`.
    expect(txopProtect.terms!.map((t) => t.term)).toEqual(['protection'])
  })

  it('loads the hidden-node hallway with bursts, an RTS threshold of 500 B and boundary protection', () => {
    // the picture's "This is the hallway house of the hidden-node lesson" and `deeper`'s
    // "this scene sets the threshold at 500 bytes"
    const s = txopProtect.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(s.rtsThresholdBytes).toBe(500)
    for (const id of ['sta-1', 'sta-2']) {
      const n = s.nodes.find((x) => x.id === id)!
      expect(n.txopProtection).toBe('boundary')
      expect(n.caps.features.txop).toBe(true)
    }
    // the two variants differ from the base in the protection policy and nothing else
    const vs = txopProtect.variants!.map((v) => v.scenario())
    for (const v of vs) expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(vs.map((v) => v.nodes.find((n) => n.id === 'sta-1')!.txopProtection)).toEqual([undefined, 'multiple'])
    for (const v of vs) {
      expect(v.rtsThresholdBytes).toBe(500)
      expect(v.nodes.map((n) => ({ ...n, txopProtection: undefined })))
        .toEqual(s.nodes.map((n) => ({ ...n, txopProtection: undefined })))
    }
  })
})

describe('txop-protect · the figure of the burst at 0.736 ms', () => {
  const rs = boundary()
  const ms = (ns: number) => Number((ns / MS).toFixed(3))
  const msg = (i: number) => protectSequence().messages[i]

  it('every message is a record of this run, at the instant it prints', () => {
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && ms(r.t) === 0.736)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > rts.t)[0]
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= rts.t)!
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > rts.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > rts.t && r.t < end.t)
    // 1: the question, from the holder to the access point, carrying the whole turn
    expect([msg(0).from, msg(0).to, msg(0).at]).toEqual(['sta-1', 'ap', '0.736 ms'])
    expect(msg(0).label).toContain('2 500')
    expect(rts.node).toBe('sta-1')
    expect(rts.frame.durationFieldNs / US).toBe(2_500)
    // 2: the answer, addressed to the holder, carrying what is left
    expect([msg(1).from, msg(1).to, msg(1).at]).toEqual(['ap', 'sta-1', '0.780 ms'])
    expect(msg(1).label).toContain('2 456')
    expect([cts.node, cts.frame.dst]).toEqual(['ap', 'sta-1'])
    expect(ms(cts.t)).toBe(0.780)
    expect(cts.frame.durationFieldNs / US).toBe(2_456)
    // 3: the hidden station's own record — it loads the reservation from that answer
    expect([msg(2).from, msg(2).to, msg(2).at]).toEqual(['sta-2', 'sta-2', '0.808 ms'])
    expect(msg(2).label).toContain('3.264')
    expect(ms(nav.t)).toBe(0.808)
    expect(ms(nav.untilNs)).toBe(3.264)
    expect(nav.source).toBe('cts:ap')
    // 4 and 5: five exchanges of 416 µs, the last answer ending the turn at 2.888 ms
    expect([msg(3).from, msg(3).to, msg(3).at]).toEqual(['sta-1', 'ap', '0.824 ms'])
    expect(msg(3).label).toContain('416')
    expect(data).toHaveLength(5)
    expect(ms(data[0].t)).toBe(0.824)
    expect(data[1].t - data[0].t).toBe(416 * US)
    expect(msg(4).at).toBe('2.888 ms')
    expect(ms(end.t)).toBe(2.888)
    // the figure's three columns are the scene's three nodes
    expect(protectSequence().columns.map((c) => c.id)).toEqual(['sta-2', 'ap', 'sta-1'])
    expect(new Set(txopProtect.scenario().nodes.map((n) => n.id)))
      .toEqual(new Set(protectSequence().columns.map((c) => c.id)))
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(protectSequence())
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

describe('txop-protect · the same three hundred milliseconds, two ways', () => {
  it('the four counted rows are 46/21 collisions, 212/614 delivered, 112/47 retries, 6/1 dropped', () => {
    // the first table. (The same four rows are pinned in tests/course/lesson-claims.test.ts,
    // "the 300 ms table: single vs boundary"; here they guard this lesson's own two columns.)
    const row = (rs: TLRecord[]) => [
      ofType(rs, 'COLLISION').length, delivered(rs), ofType(rs, 'RETRY').length, ofType(rs, 'DROP').length,
    ]
    expect(row(single())).toEqual([46, 212, 112, 6])
    expect(row(boundary())).toEqual([21, 614, 47, 1])
  })

  it('the non-data frames cost 14.9 ms under single and 14.3 ms under boundary', () => {
    // table row "Air spent on questions, answers and the closing frame": 14.9 ms / 14.3 ms,
    // and the paragraph "both policies spend about a twentieth of the air on the frames that
    // carry no data — boundary spends slightly less"
    expect((announcingNs(single()) / MS).toFixed(1)).toBe('14.9')
    expect((announcingNs(boundary()) / MS).toFixed(1)).toBe('14.3')
    expect(announcingNs(boundary())).toBeLessThan(announcingNs(single()))
    for (const rs of [single(), boundary()]) {
      const share = announcingNs(rs) / RUN_NS
      expect(share).toBeGreaterThan(1 / 25)
      expect(share).toBeLessThan(1 / 17)
    }
  })

  it('a frame delivered costs 1281 µs of air under single and 422 µs under boundary', () => {
    // table row "Air spent per frame delivered", and the paragraph's "nearly three times the
    // frames for a third of the air each"
    expect((allAirNs(single()) / delivered(single()) / US).toFixed(0)).toBe('1281')
    expect((allAirNs(boundary()) / delivered(boundary()) / US).toFixed(0)).toBe('422')
    const ratio = (allAirNs(single()) / delivered(single())) / (allAirNs(boundary()) / delivered(boundary()))
    expect(ratio).toBeGreaterThan(2.9)
    expect(ratio).toBeLessThan(3.1)
    // "the room delivers nearly three times the frames"
    expect(delivered(boundary()) / delivered(single())).toBeGreaterThan(2.8)
  })

  it('the reservation a hidden station loads lasts 2.45 ms instead of 1.05 ms', () => {
    // table row "Average reservation a hidden station loads", and the paragraph "the
    // reservation a hidden station loads now lasts 2.45 ms instead of 1.05 ms, so it sits
    // the burst out". The far station is genuinely deaf to the holder, so every one of those
    // reservations was loaded from a frame of the access point's.
    expect((meanNavNs(single()) / MS).toFixed(2)).toBe('1.05')
    expect((meanNavNs(boundary()) / MS).toFixed(2)).toBe('2.45')
    const from = ofType(boundary(), 'NAV_SET').filter((r) => r.node === 'sta-2')
    expect(from.length).toBeGreaterThan(20)
    for (const n of from) {
      const src = txs(boundary(), (r) => r.t <= n.t && r.t + r.frame.txTimeNs >= n.t - 1).pop()!
      expect(src.node).toBe('ap')
    }
  })
})

describe('txop-protect · the burst that starts at 0.736 ms, step by step', () => {
  const rs = boundary()
  const ms = (ns: number) => Number((ns / MS).toFixed(3))
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms(r.t) === 0.736)!

  it('steps 1 to 3: the question announces the whole turn, and the answer carries the rest', () => {
    const rts = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t === t0.t)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
    // step 1: the turn is the access category's limit, 2 528 µs
    expect((t0.untilNs - t0.t) / US).toBe(2_528)
    // step 2: "the whole turn less the question's own 28 µs: 2 500 µs"
    expect(rts.frame.bytes).toBe(20)
    expect(rts.frame.txTimeNs / US).toBe(28)
    expect(rts.frame.durationFieldNs / US).toBe(2_500)
    expect(rts.frame.durationFieldNs).toBe(t0.untilNs - t0.t - rts.frame.txTimeNs)
    // step 3: the answer carries what is left after the pause and itself
    expect(cts.node).toBe('ap')
    expect(cts.frame.durationFieldNs / US).toBe(2_456)
    expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - 16 * US - cts.frame.txTimeNs)
    // "the only frame the far room can hear": the hidden station's reservation comes from it
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    expect(nav.source).toBe('cts:ap')
    expect(ms(nav.t)).toBe(0.808)
    expect(ms(nav.untilNs)).toBe(3.264)
  })

  it('step 4 and the worked table: five exchanges of 416 µs, each carrying only 44 µs', () => {
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)
    // "five exchanges of 416 µs; the last answer lands at 2.888 ms"
    expect(data).toHaveLength(5)
    for (const d of data) expect(d.frame.durationFieldNs / US).toBe(44)
    expect(data[1].t - data[0].t).toBe(416 * US)
    expect(ms(end.t)).toBe(2.888)
    // "60 µs at most in this run" — the widest Duration a data frame carries under boundary
    expect(Math.max(...txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)) / US).toBe(60)
    // the last two rows of the worked table: 2 152 µs of burst, and 376 µs left announced
    expect((end.t - t0.t) / US).toBe(2_152)
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
    expect((nav.untilNs - end.t) / US).toBe(376)
  })
})

describe('txop-protect · what is left over', () => {
  it('turning bursting off leaves one exchange per turn and nothing to protect', () => {
    // the experiment "turn bursting off on both stations … no station holds the air for two
    // frames in a row, and there is no burst left to protect"
    const s = txopProtect.scenario()
    for (const n of s.nodes) n.caps.features = { ...n.caps.features, txop: false }
    const rs = [...new Simulation(s).runUntil(RUN_NS).records]
    expect(ofType(rs, 'TXOP_START')).toHaveLength(0)
    expect(txs(rs, (r) => r.frame.kind === 'cfend')).toHaveLength(0)
    expect(txs(rs, (r) => r.frame.kind === 'data').length).toBeGreaterThan(50)
  })

  it('of the 21 collisions left, 18 are question against question and 3 catch a data frame', () => {
    // numbers: "Of the 21 collisions that survive, 18 are one question meeting another …
    // losing 20 bytes each instead of a burst. Only 3 catch a data frame already under way."
    // The frame the collision is recorded against is the one that ends at the collision's
    // instant; the others are whatever was still in the air when it started. (The same census
    // is held next door in lesson-claims, which is where this sentence's numbers began.)
    const rs = boundary()
    const cols = ofType(rs, 'COLLISION')
    expect(cols).toHaveLength(21)
    const locked = cols.map((c) => txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
      .filter((r) => r.t + r.frame.txTimeNs === c.t)[0])
    expect(locked.filter((r) => r.frame.kind === 'rts')).toHaveLength(18)
    expect(locked.filter((r) => r.frame.kind === 'data')).toHaveLength(3)
    // "two hidden stations starting within one short question of each other"
    for (const l of locked.filter((r) => r.frame.kind === 'rts')) {
      const other = txs(rs, (r) => r.node !== l.node && r.frame.kind === 'rts'
        && Math.abs(r.t - l.t) < l.frame.txTimeNs)
      expect(other.length).toBeGreaterThan(0)
    }
    // "losing 20 bytes each": a question is 20 bytes of air
    expect(new Set(txs(boundary(), (r) => r.frame.kind === 'rts').map((r) => r.frame.bytes))).toEqual(new Set([20]))
  })

  it('the quiz’s "2 ms instead of 0.4 ms": what a hidden station is exposed to, either way', () => {
    // the second quiz question. A single-protection reservation covers one exchange (about
    // 0.4 ms on average here); an unprotected burst runs for about 2 ms, which is what the far
    // station would be free to blunder into.
    const holds = ofType(boundary(), 'TXOP_START').filter((r) => r.node === 'sta-1')
    const ends = ofType(boundary(), 'TXOP_END').filter((r) => r.node === 'sta-1')
    const lens = holds.map((h) => (ends.find((e) => e.t > h.t)?.t ?? h.t) - h.t).filter((n) => n > 0)
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length
    expect(mean / MS).toBeGreaterThan(1.5)
    expect(mean / MS).toBeLessThan(2.5)
    // and one exchange, the most a single-protection answer ever announces here, is far shorter
    expect(meanNavNs(single()) / MS).toBeLessThan(1.5)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine and compares it with a literal written in THIS file, with
 * the lesson's own row quoted in a comment beside it. That arrangement catches an engine change
 * and misses a prose change — 「// table row "Air spent …": 14.9 ms / 14.3 ms」 is a comment, not a
 * comparison with the table. `@txop-protect` hand-types 40 figures into its graded prose, the most
 * of any lesson still listed in `tests/course/prose-readback.test.ts`, and nothing had ever read
 * one of them. (The sequence figure is the one exception: it is read message by message above —
 * but out of `protectSequence()`, not out of `numbers`. The first `it` below closes that gap, so
 * the block the reader sees is the block those assertions pin.)
 *
 * The figures were all exact. What follows is the other half of each assertion above, with no
 * figure on this side — plus the five places where a figure lives ONLY in prose and no assertion
 * above goes near it: the two fractions and the two multiples of the 「同样的开销」 paragraph, the
 * quiz's exposure pair, `limits`' own 「46 对 21」, `deeper`'s bare-threshold experiment, and the
 * one file-and-function citation (`mac.ts` 的 `updateNav`).
 *
 * Two conventions are read off the cells rather than written here, because a figure without them
 * cannot be re-measured: each cell's UNIT (this lesson's tables mix ms and µs row by row) and each
 * cell's own number of decimals.
 */
describe('txop-protect · every printed figure is read back out of the lesson', () => {
  const b = boundary()
  const s = single()
  const ms3 = (ns: number) => Number((ns / MS).toFixed(3))

  const tableWith = (fragment: string): { head: string[]; rows: string[][] } => {
    const blk = txopProtect.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(blk, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return blk as { head: string[]; rows: string[][] }
  }
  const textWith = (fragment: string): string => {
    const blk = txopProtect.numbers!.find((x) => (x.kind ?? 'p') === 'p' && (x.heading ?? '').includes(fragment))
    expect(blk, `no paragraph whose heading contains 「${fragment}」`).toBeDefined()
    return (blk as { text: string }).text
  }
  const stepsWith = (fragment: string): string[] => {
    const blk = txopProtect.numbers!.find((x) => x.kind === 'steps' && (x.heading ?? '').includes(fragment))
    expect(blk, `no steps block whose heading contains 「${fragment}」`).toBeDefined()
    return (blk as { items: string[] }).items
  }
  /** 「46」 → 46; 「2 152 µs」 → 2152; a full-width minus would keep its sign. */
  const val = (cell: string): number => Number(cell.replace(/−/g, '-').replace(/[^\d.-]/g, ''))
  /**
   * A cell like 「14.9 ms」 or 「1281 µs」 against a measurement in nanoseconds — converted with
   * the unit the CELL names and rounded to the number of decimals the CELL carries.
   */
  const figure = (cell: string, ns: number, what: string): void => {
    const m = /^([\d\s.]+?)\s*(ms|µs)$/.exec(cell.trim())
    expect(m, `${what}: the cell 「${cell}」 is not a figure followed by ms or µs`).not.toBeNull()
    const printed = m![1].replace(/\s/g, '')
    const unit = m![2] === 'ms' ? MS : US
    const dp = (printed.split('.')[1] ?? '').length
    expect(Number(printed), `${what} (in ${m![2]}, to ${dp} decimals, both read off the cell)`)
      .toBe(Number((ns / unit).toFixed(dp)))
  }
  /** Was this data frame the first exchange of the TXOP it sits in? */
  const firstOfTxop = (rs: TLRecord[], tx: Tx): boolean => {
    const start = ofType(rs, 'TXOP_START').filter((r) => r.node === tx.node && r.t <= tx.t).pop()
    if (!start) return false
    return !txs(rs, (r) => r.node === tx.node && r.frame.kind === 'data'
      && r.t >= start.t && r.t < tx.t).length
  }
  /** The frame each collision is recorded against: the one that ends at its instant. */
  const lockedAt = (rs: TLRecord[]) => ofType(rs, 'COLLISION')
    .map((c) => txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
      .filter((r) => r.t + r.frame.txTimeNs === c.t)[0])
    .filter((r): r is Tx => !!r)

  // the worked burst, which half the lesson's figures are about
  const t0 = ofType(b, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms3(r.t) === 0.736)!
  const rts = txs(b, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t === t0.t)[0]
  const cts = txs(b, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
  const nav = ofType(b, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
  const end = ofType(b, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
  const data = txs(b, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)

  it('the figure the reader sees is the figure those assertions pin', () => {
    // Above, `protectSequence()` is read message by message. The reader sees the block inside
    // `numbers`, and nothing said the two were the same object.
    const blk = txopProtect.numbers!.find((x) => x.kind === 'diagram')
    expect(blk, 'the sequence figure is gone from `numbers`').toBeDefined()
    expect((blk as { spec: unknown }).spec, 'the figure in `numbers` is `protectSequence()`')
      .toEqual(protectSequence())
    // its caption states two of the run's instants and counts the exchanges in Chinese numerals
    const cap = (blk as { caption?: string }).caption ?? ''
    const m = /一直管到 ([\d.]+) ms[^]*?A 的([一二三四五六七八九十]+)次交互到 ([\d.]+) ms 才结束/.exec(cap)
    expect(m, 'the caption no longer states where the reservation reaches and when the burst ends')
      .not.toBeNull()
    expect(Number(m![1]), 'the caption’s reach of the far station’s reservation').toBe(ms3(nav.untilNs))
    expect(zhNumeral(m![2]), 'the exchanges it counts').toBe(data.length)
    expect(Number(m![3]), 'and when the last of them is answered').toBe(ms3(end.t))
  })

  it('the 300 ms table: four counted rows, both columns, and no fifth row unchecked', () => {
    const t = tableWith('同样的三百毫秒')
    const CHECK: readonly (readonly [string, (rs: TLRecord[]) => number])[] = [
      ['碰撞次数', (rs) => ofType(rs, 'COLLISION').length],
      ['成功送达的数据帧', delivered],
      ['重传（retry）', (rs) => ofType(rs, 'RETRY').length],
      ['丢弃帧数', (rs) => ofType(rs, 'DROP').length],
    ]
    // the set, not only the figures: a row the lesson adds here would otherwise go unread
    expect(t.rows, 'the table counts exactly the rows this reads').toHaveLength(CHECK.length)
    for (const [label, count] of CHECK) {
      const row = t.rows.find((r) => r[0] === label)
      expect(row, `no row labelled 「${label}」`).toBeDefined()
      expect(val(row![1]), `${label}, single protection`).toBe(count(s))
      expect(val(row![2]), `${label}, boundary protection`).toBe(count(b))
    }
    // and the direction the whole lesson rests on: every row moves the right way
    expect(ofType(b, 'COLLISION').length, 'boundary collides less').toBeLessThan(ofType(s, 'COLLISION').length)
    expect(delivered(b), 'and delivers more').toBeGreaterThan(delivered(s))
  })

  it('the cost table: three rows in two different units, each to its own decimals', () => {
    const t = tableWith('用来预告的那些帧')
    const CHECK: readonly (readonly [string, (rs: TLRecord[]) => number])[] = [
      ['花在提问、回答与收尾小帧上的空口时间', announcingNs],
      ['每送达一帧所花的空口时间', (rs) => allAirNs(rs) / delivered(rs)],
      ['隐藏站点装上的预约，平均有多长', meanNavNs],
    ]
    expect(t.rows, 'the table holds exactly the rows this reads').toHaveLength(CHECK.length)
    for (const [label, q] of CHECK) {
      const row = t.rows.find((r) => r[0] === label)
      expect(row, `no row labelled 「${label}」`).toBeDefined()
      figure(row![1], q(s), `${label}, single protection`)
      figure(row![2], q(b), `${label}, boundary protection`)
    }
  })

  it('the paragraph’s two fractions and two multiples, which live nowhere else', () => {
    const p = textWith('同样的开销')
    // 「都在二十分之一上下」: the share of the air spent on frames that carry no data. The hedge
    // 「上下」 is doing work — today the reciprocals are 20.10 and 21.03, so single is 0.5 % off
    // the stated fraction and boundary 5.1 %. The tolerance is this test's, the figure is the
    // lesson's; what the lesson may not do is name a fraction the run is nowhere near.
    const frac = /都在([一二三四五六七八九十]+)分之一上下/.exec(p)
    expect(frac, 'the paragraph no longer names the share as a fraction').not.toBeNull()
    const stated = zhNumeral(frac![1])!
    for (const [name, rs] of [['single', s], ['boundary', b]] as const) {
      const recip = RUN_NS / announcingNs(rs)
      expect(Math.abs(recip / stated - 1), `${name}: 1/${stated} against the measured 1/${recip.toFixed(2)}`)
        .toBeLessThan(0.06)
    }
    // 「平均是 2.45 ms，而不是 1.05 ms」: the same two figures as the table, typed a second time
    const avg = /平均是 ([\d.]+) ms，而不是 ([\d.]+) ms/.exec(p)
    expect(avg, 'the paragraph no longer restates the two reservations').not.toBeNull()
    figure(`${avg![1]} ms`, meanNavNs(b), 'the boundary reservation, as the paragraph restates it')
    figure(`${avg![2]} ms`, meanNavNs(s), 'and the single one')
    // 「接近三倍」: the word says it has not got there, and it has not — 2.90
    const times = /接近([一二三四五六七八九十]+)倍/.exec(p)
    expect(times, 'the paragraph no longer states the multiple of frames delivered').not.toBeNull()
    const n = zhNumeral(times![1])!
    const ratio = delivered(b) / delivered(s)
    expect(ratio, `「接近${times![1]}倍」 has not reached ${n}`).toBeLessThan(n)
    expect(Math.abs(ratio / n - 1), 'but is within a tenth of it').toBeLessThan(0.1)
    // 「只有原来的三分之一」: the air each delivered frame costs
    const third = /只有原来的([一二三四五六七八九十]+)分之一/.exec(p)
    expect(third, 'the paragraph no longer states the share of air per frame').not.toBeNull()
    const d = zhNumeral(third![1])!
    const share = (allAirNs(b) / delivered(b)) / (allAirNs(s) / delivered(s))
    expect(Math.abs(share * d - 1), `1/${d} against the measured ${share.toFixed(4)}`).toBeLessThan(0.05)
  })

  it('the four steps: the turn’s limit, the question’s own length, and both Durations', () => {
    const items = stepsWith('一句提问怎么管住整串')
    expect(items, 'the lesson walks the burst in exactly the steps this reads').toHaveLength(4)
    // step 1: 「这里的上限是 2 528 µs」
    const cap = /上限是 ([\d\s]+) µs/.exec(items[0])
    expect(cap, 'step 1 no longer states the TXOP limit').not.toBeNull()
    figure(`${cap![1]} µs`, t0.untilNs - t0.t, 'the TXOP limit step 1 names')
    // step 2: 「一帧 20 字节的 RTS」, 「提问自身的 28 µs：2 500 µs」
    const q = /一帧 (\d+) 字节的 RTS/.exec(items[1])
    expect(q, 'step 2 no longer states the question’s size').not.toBeNull()
    expect(Number(q![1]), 'the bytes a question costs').toBe(rts.frame.bytes)
    const dur = /整轮减去提问自身的 (\d+) µs：([\d\s]+) µs/.exec(items[1])
    expect(dur, 'step 2 no longer states the subtraction it describes').not.toBeNull()
    figure(`${dur![1]} µs`, rts.frame.txTimeNs, 'the question’s own airtime')
    figure(`${dur![2]} µs`, rts.frame.durationFieldNs, 'and the Duration it therefore carries')
    // the subtraction itself, in the lesson's own two figures
    expect(val(dur![2]) + val(dur![1]), 'the two figures really do add up to the turn')
      .toBe((t0.untilNs - t0.t) / US)
    // step 3: 「剩下的 2 456 µs」
    const left = /剩下的 ([\d\s]+) µs/.exec(items[2])
    expect(left, 'step 3 no longer states what the answer carries').not.toBeNull()
    figure(`${left![1]} µs`, cts.frame.durationFieldNs, 'the Duration of the answer')
    // step 4: 「这一帧是 44 µs，本轮最多也就 60 µs」
    const dd = /这一帧是 (\d+) µs，本轮最多也就 (\d+) µs/.exec(items[3])
    expect(dd, 'step 4 no longer states the Durations a data frame carries').not.toBeNull()
    figure(`${dd![1]} µs`, data[0].frame.durationFieldNs, 'what the first data frame announces')
    figure(`${dd![2]} µs`,
      Math.max(...txs(b, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)),
      'and the widest one in the run')
  })

  it('the step-by-step table: six rows, and 0.808 ms is when the answer FINISHES arriving', () => {
    const t = tableWith('从 0.736 ms 开始的那一串')
    const ROWS: readonly (readonly [RegExp, (cell: string, label: RegExpExecArray) => void])[] = [
      // 「提问发出，Duration 2 500 µs」 → 0.736 ms
      [/^提问发出，Duration ([\d\s]+) µs$/, (cell, l) => {
        figure(`${l[1]} µs`, rts.frame.durationFieldNs, 'the Duration the question carries')
        figure(cell, t0.t, 'when the question goes out')
      }],
      // 「回答到手，Duration 2 456 µs」 → 0.808 ms. The answer STARTS at 0.780 (the figure above
      // prints that instant); 0.808 is when its last bit lands, which is also the instant the far
      // station loads its reservation. Both readings of 「到手」 are asserted, and they coincide.
      [/^回答到手，Duration ([\d\s]+) µs$/, (cell, l) => {
        figure(`${l[1]} µs`, cts.frame.durationFieldNs, 'the Duration the answer carries')
        figure(cell, cts.t + cts.frame.txTimeNs, 'when the answer finishes arriving')
        expect(nav.t, 'which is the instant the far station loads its reservation')
          .toBe(cts.t + cts.frame.txTimeNs)
      }],
      // 「于是远端站点的预约一直管到」 → 3.264 ms
      [/^于是远端站点的预约一直管到$/, (cell) => figure(cell, nav.untilNs, 'where the reservation reaches')],
      // 「五次交互，每次 416 µs；最后一个回答落在」 → 2.888 ms
      [/^([一二三四五六七八九十]+)次交互，每次 (\d+) µs；最后一个回答落在$/, (cell, l) => {
        expect(zhNumeral(l[1]), 'the exchanges the burst holds').toBe(data.length)
        figure(`${l[2]} µs`, data[1].t - data[0].t, 'one exchange')
        figure(cell, end.t, 'and when the last answer lands')
      }],
      // 「这一串从提问到最后一个回答，一共」 → 2 152 µs
      [/^这一串从提问到最后一个回答，一共$/, (cell) => figure(cell, end.t - t0.t, 'the span of the burst')],
      // 「于是预告出去的时间还多出」 → 376 µs
      [/^于是预告出去的时间还多出$/, (cell) => figure(cell, nav.untilNs - end.t, 'the time announced and unused')],
    ]
    expect(t.rows, 'the table walks exactly the steps this reads').toHaveLength(ROWS.length)
    for (const [i, [re, check]] of ROWS.entries()) {
      const l = re.exec(t.rows[i][0])
      expect(l, `row ${i}: 「${t.rows[i][0]}」 is not in the shape this reads`).not.toBeNull()
      check(t.rows[i][1], l!)
    }
  })

  it('the census of the collisions that survive, read out of the paragraph', () => {
    const p = textWith('剩下的那些碰撞')
    const m = /剩下的 (\d+) 次碰撞里，有 (\d+) 次是两句提问撞在一起[^]*?各损失 (\d+) 字节[^]*?只有 (\d+) 次撞上了正在进行中的数据帧/
      .exec(p)
    expect(m, 'the collision census is gone, or its shape changed').not.toBeNull()
    const locked = lockedAt(b)
    expect(Number(m![1]), 'the collisions that survive boundary protection').toBe(ofType(b, 'COLLISION').length)
    expect(Number(m![2]), 'those recorded against a question').toBe(locked.filter((r) => r.frame.kind === 'rts').length)
    expect(Number(m![4]), 'and those that caught a data frame already under way')
      .toBe(locked.filter((r) => r.frame.kind === 'data').length)
    // the two kinds account for every collision, which is what 「只有 3 次」 claims
    expect(Number(m![2]) + Number(m![4]), 'and between them that is all of them').toBe(Number(m![1]))
    expect(new Set(txs(b, (r) => r.frame.kind === 'rts').map((r) => r.frame.bytes)),
      'a question really does cost the bytes the paragraph says are lost').toEqual(new Set([Number(m![3])]))
    // the forward pointer carries a figure too: 「末尾那多出来的 376 µs」
    const over = /末尾那多出来的 (\d+) µs/.exec(p)
    expect(over, 'the paragraph no longer states the time CF-End gives back').not.toBeNull()
    figure(`${over![1]} µs`, nav.untilNs - end.t, 'the unused time the next lesson hands back')
  })

  it('both observe lines: the third attempt, the two Durations, and the 24-of-29 census', () => {
    const o = txopProtect.observe!
    // 「两台站点都在 t = 0 发出提问，撞在一起」
    const zero = /都在 t = (\d+) 发出提问/.exec(o[0])
    expect(zero, 'observe[0] no longer says when the two questions go out').not.toBeNull()
    const openers = txs(b, (r) => r.frame.kind === 'rts' && r.t === Number(zero![1]))
    expect(new Set(openers.map((r) => r.node)), 'both stations ask at that instant')
      .toEqual(new Set(['sta-1', 'sta-2']))
    // 「A 在 0.736 ms 的第三次尝试成功了，预约 2500 µs」
    const win = /A 在 ([\d.]+) ms 的第([一二三四五六七八九十]+)次尝试成功了，预约 (\d+) µs/.exec(o[0])
    expect(win, 'observe[0] no longer states which attempt succeeded').not.toBeNull()
    figure(`${win![1]} ms`, t0.t, 'when A finally holds the air')
    expect(zhNumeral(win![2]), 'and that it was its nth question')
      .toBe(txs(b, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t <= t0.t).length)
    figure(`${win![3]} µs`, rts.frame.durationFieldNs, 'the Duration it announces')
    // 「接入点在 0.780 ms 的回答携带 2456 µs」, and 「一直紫到 3.264 ms」
    const ans = /接入点在 ([\d.]+) ms 的回答携带 (\d+) µs/.exec(o[0])
    expect(ans, 'observe[0] no longer states the answer').not.toBeNull()
    figure(`${ans![1]} ms`, cts.t, 'when the answer goes out')
    figure(`${ans![2]} µs`, cts.frame.durationFieldNs, 'and what it carries')
    const purple = /一直紫到 ([\d.]+) ms/.exec(o[0])
    expect(purple, 'observe[0] no longer says how far the far station’s lane is held').not.toBeNull()
    figure(`${purple![1]} ms`, nav.untilNs, 'the reservation the lane draws')
    // 「“第一次碰撞”落在 t = 28 µs」: the instant the two simultaneous questions end
    const first = /落在 t = (\d+) µs/.exec(o[1])
    expect(first, 'observe[1] no longer states when the first collision falls').not.toBeNull()
    figure(`${first![1]} µs`, ofType(b, 'COLLISION')[0].t, 'the first collision')
    expect(Number(first![1]) * US, 'which is one question’s length after both of them started')
      .toBe(openers[0].t + openers[0].frame.txTimeNs)
    // 「它那 29 次数据帧碰撞里，有 24 次都不是某一轮的第一次交互」
    const census = /它那 (\d+) 次数据帧碰撞里，有 (\d+) 次都不是某一轮的第一次交互/.exec(o[1])
    expect(census, 'observe[1] no longer states the single-protection census').not.toBeNull()
    const dataCols = lockedAt(s).filter((r) => r.frame.kind === 'data')
    expect(Number(census![1]), 'single protection’s data-frame collisions').toBe(dataCols.length)
    expect(Number(census![2]), 'and how many of them were not a round’s first exchange')
      .toBe(dataCols.filter((r) => !firstOfTxop(s, r)).length)
  })

  it('the quiz’s exposure pair is this lesson’s own burst, rounded', () => {
    // 「这里是 2 ms，而不是 0.4 ms」. 「这里」 is the worked burst: it runs 2 152 µs from question
    // to last answer, and one exchange of it is 416 µs — the two figures the lesson prints two
    // blocks earlier, each rounded to one figure. (The `it` above reads the same sentence against
    // the run's MEAN burst, which is 1.54 ms; that band is loose for exactly this reason.)
    const m = /这里是 ([\d.]+) ms，而不是 ([\d.]+) ms/.exec(txopProtect.quiz![1].options[1])
    expect(m, 'the quiz no longer states the two exposures').not.toBeNull()
    const burst = (end.t - t0.t) / MS
    const exchange = (data[1].t - data[0].t) / MS
    expect(Math.abs(burst / Number(m![1]) - 1), `「${m![1]} ms」 against the burst’s ${burst} ms`)
      .toBeLessThan(0.1)
    expect(Math.abs(exchange / Number(m![2]) - 1), `「${m![2]} ms」 against one exchange’s ${exchange} ms`)
      .toBeLessThan(0.1)
    // and the point of printing both: the ratio the reader is meant to take away
    expect(Math.abs((burst / exchange) / (Number(m![1]) / Number(m![2])) - 1),
      'the multiple between the two figures').toBeLessThan(0.1)
  })

  it('the prose the graded walk never reads: `limits`, `deeper`, and one citation', () => {
    // `limits[].text` is excluded from the graded walk by design, so nothing had read these.
    const ls = txopProtect.limits!.map((l) => l.text)
    // 「那两列计数（46 对 21 次碰撞）」
    const pair = /（(\d+) 对 (\d+) 次碰撞）/.exec(ls.join('\n'))
    expect(pair, '`limits` no longer states the two collision counts').not.toBeNull()
    expect([Number(pair![1]), Number(pair![2])], 'the two counts the threshold limit contrasts')
      .toEqual([ofType(s, 'COLLISION').length, ofType(b, 'COLLISION').length])
    // 「本场景把 RTS 门限设成 500 字节、把两台站点的保护策略写成「边界」」
    const conf = /把 RTS 门限设成 (\d+) 字节、把两台站点的保护策略写成「(..)」/.exec(ls.join('\n'))
    expect(conf, '`limits` no longer states the two configured values').not.toBeNull()
    const sc0 = txopProtect.scenario()
    expect(Number(conf![1]), 'the threshold the scene sets').toBe(sc0.rtsThresholdBytes)
    for (const id of ['sta-1', 'sta-2']) {
      expect(sc0.nodes.find((n) => n.id === id)!.txopProtection,
        `and the policy ${id} is given, which 「${conf![2]}」 names`).toBe('boundary')
    }
    // 「（mac.ts 的 updateNav）」: a citation is a claim about this repository
    const cite = /（([\w.]+) 的 (\w+)）/.exec(ls.join('\n'))
    expect(cite, '`limits` no longer cites the function that keeps NAV').not.toBeNull()
    const src = readFileSync(resolve(ROOT, `src/engine/${cite![1]}`), 'utf8')
    expect(src.includes(`${cite![2]}(`), `${cite![1]} declares ${cite![2]}`).toBe(true)
    // `deeper`'s bare-threshold experiment, which only lesson-claims has ever held
    const d = (txopProtect.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const exp = /把它调到 (\d+)[^]*?碰撞从 (\d+) 次升到 (\d+) 次，送达从 (\d+) 帧降到 (\d+) 帧[^]*?其中一帧占了 ([\d.]+) ms 的空口/
      .exec(d)
    expect(exp, '`deeper` no longer states the bare-threshold experiment').not.toBeNull()
    const bare = [...new Simulation({ ...sc0, rtsThresholdBytes: Number(exp![1]) }).runUntil(RUN_NS).records]
    expect([Number(exp![2]), Number(exp![4])], 'the figures it says it starts from')
      .toEqual([ofType(b, 'COLLISION').length, delivered(b)])
    expect([Number(exp![3]), Number(exp![5])], 'and where raising the threshold lands')
      .toEqual([ofType(bare, 'COLLISION').length, delivered(bare)])
    figure(`${exp![6]} ms`, Math.max(...txs(bare, (r) => r.frame.kind === 'data').map((r) => r.frame.txTimeNs)),
      'the slowest frame left unprotected')
  })
})
