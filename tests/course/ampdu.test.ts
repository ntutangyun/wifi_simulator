/**
 * Every empirical claim in "A-MPDU — pay contention once", measured against the
 * lesson's own scenario and its aggregation-off variant.
 *
 * The lesson had no test file of its own before the readability rewrite: the
 * 14 MPDUs per win, the RTS/CTS that opens the burst and the ~1.5× goodput are
 * pinned in tests/course/lesson-claims.test.ts ("lesson 8 · A-MPDU"), which
 * still holds them and still passes. What this file adds is everything the
 * grown lesson now states — the two tables, the worked airtime per delivered
 * frame, and the three observations. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ampdu, ampduSubframeFields } from '../../src/course/tier2/ampdu'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { AMPDU_DELIMITER_BYTES, BA_BYTES, FCS_BYTES, MAX_AMPDU_MPDUS, MAX_PPDU_NS, OFDM_5G, QOS_HDR_BYTES } from '../../src/engine/phy'
import { ampduPsduBytes, ampduSubframeBytes } from '../../src/model/frames'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 200 * MS

/** The batched run, and the same device with aggregation switched off. */
const agg = (): TLRecord[] => runOf(ampdu, undefined, RUN_NS)
const plain = (): TLRecord[] => runOf(ampdu, 0, RUN_NS)
const txs = (rs: TLRecord[], kind?: string) =>
  ofType(rs, 'TX_START').filter((r) => kind === undefined || r.frame.kind === kind)
const delivered = (rs: TLRecord[]) => ofType(rs, 'DEQUEUE').filter((r) => r.node === 'sta-1').length
const busyAirNs = (rs: TLRecord[]) => txs(rs).reduce((a, r) => a + r.frame.txTimeNs, 0)

lessonShapeSuite(ampdu, { runNs: RUN_NS })

describe('ampdu · the lesson’s own scene', () => {
  it('sits in Tier 2 and leans on the airtime and frame lessons', () => {
    expect(MODULES[ampdu.module].title).toBe('QoS 与效率')
    // §6 of the re-pacing plan moves this row to the halves that own the material: the shared
    // preamble to `small-frames`, the QoS header and the per-frame check to `frame-qos-fcs`.
    expect(ampdu.needs).toEqual(['small-frames', 'frame-qos-fcs', 'retries-queues'])
    expect(ampdu.terms!.map((t) => t.term)).toEqual(['A-MPDU', 'subframe', 'BlockAck'])
  })

  it('the scene is one uploader, and the variant is the same device with aggregation off', () => {
    const base = ampdu.scenario()
    const off = ampdu.variants![0].scenario()
    expect(() => ScenarioSchema.parse(base)).not.toThrow()
    expect(() => ScenarioSchema.parse(off)).not.toThrow()
    // "the same device, the same coding": only the aggregation feature differs
    expect(base.nodes.map((n) => n.id)).toEqual(off.nodes.map((n) => n.id))
    const feat = (sc: ReturnType<typeof ampdu.scenario>) => sc.nodes.find((n) => n.id === 'sta-1')!.caps.features
    expect(feat(base).ampdu).toBe(true)
    expect(feat(off).ampdu).toBeUndefined()
    expect(feat(off).edca).toBe(true)
    expect(feat(off).txop).toBe(true)
  })
})

describe('ampdu · one turn, both ways', () => {
  it('batched: 14 frames, 21 502 bytes, 2 248 µs, opened by RTS + CTS and closed by a BlockAck', () => {
    // the "One turn, both ways" table, batched column, and the first two observations
    const rs = agg()
    const data = txs(rs, 'data')
    expect(data.length).toBeGreaterThan(50)
    for (const d of data) expect(d.frame.ampdu?.mpduCount).toBe(14)
    expect(data[0].frame.bytes).toBe(21_502)
    expect(data[0].frame.txTimeNs).toBe(2_248 * US)
    // "Opened by: RTS + CTS · 28 µs each"
    expect(txs(rs).filter((r) => r.t < data[0].t).map((r) => r.frame.kind)).toEqual(['rts', 'cts'])
    expect(new Set(txs(rs, 'rts').map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    expect(new Set(txs(rs, 'cts').map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    // "One lilac BlockAck of 32 bytes, 32 µs long"
    const ba = txs(rs, 'ba')
    expect(ba.length).toBeGreaterThan(50)
    expect(ba[0].frame.bytes).toBe(BA_BYTES)
    expect(BA_BYTES).toBe(32)
    expect(ba[0].frame.txTimeNs).toBe(32 * US)
    // nothing else is on the air in this scene
    expect(new Set(txs(rs).map((r) => r.frame.kind))).toEqual(new Set(['rts', 'cts', 'data', 'ba']))
  })

  it('one at a time: 1 530-byte frames of 200 µs, each with its own 28 µs answer', () => {
    // the table's right-hand column. (The observe line that restated this column went with
    // the 2026-09-25 re-pacing; the column itself still states it.)
    const rs = plain()
    const data = txs(rs, 'data')
    expect(data.every((r) => r.frame.ampdu === undefined)).toBe(true)
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([1_530]))
    expect(new Set(data.map((r) => r.frame.txTimeNs))).toEqual(new Set([200 * US]))
    const ack = txs(rs, 'ack')
    expect(ack[0].frame.bytes).toBe(14)
    expect(new Set(ack.map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    expect(new Set(txs(rs).map((r) => r.frame.kind))).toEqual(new Set(['data', 'ack']))
  })

  it('the coding is the same on both sides, so none of the gain hides in the rate', () => {
    // "Same coding, same bytes, same room" and the quiz's first explanation
    expect(new Set([...txs(agg(), 'data'), ...txs(plain(), 'data')].map((r) => r.frame.mcs)))
      .toEqual(new Set([8]))
  })

  it('the formula: 166.9 µs a frame batched against 228.0 µs one at a time', () => {
    // "(28 + 28 + 2 248 + 32) µs ÷ 14 frames = 166.9 µs" / "(200 + 28) µs ÷ 1 frame = 228.0 µs"
    expect(((28 + 28 + 2_248 + 32) / 14).toFixed(1)).toBe('166.9')
    expect((200 + 28).toFixed(1)).toBe('228.0')
  })
})

describe('ampdu · the subframe figure', () => {
  it('its five boxes are the engine’s own subframe, byte for byte', () => {
    // the figure and its caption: "the fixed 36 bytes (delimiter, header, check) plus 1 500
    // of payload, padded up to 1 536" — every size is a constant of src/engine/phy.ts, and
    // the sum is `ampduSubframeBytes(1500)`.
    const f = ampduSubframeFields()
    expect(f.unit).toBe('B')
    expect(f.fields.map((x) => [x.label, x.size])).toEqual([
      ['定界符', AMPDU_DELIMITER_BYTES], ['帧头', QOS_HDR_BYTES], ['载荷', 1_500],
      ['校验', FCS_BYTES], ['填充', 2],
    ])
    const sum = f.fields.reduce((n, x) => n + x.size, 0)
    expect(sum).toBe(ampduSubframeBytes(1_500))
    expect(sum).toBe(1_536)
    // "the fixed part of a subframe is 36 bytes against 1 500 of payload"
    expect(sum - 1_500).toBe(36)
    // and the total line is the batch this run really sends — read out of the line itself,
    // both figures, because `scripts/figure-planting.ts` found the first one editable
    const tot = /一个子帧 ([\d ]+) B；十([一二三四五六七八九十]+)个首尾相接是 ([\d ]+) B/.exec(f.total ?? '')
    expect(tot, 'the figure’s total line no longer states the subframe and the batch').not.toBeNull()
    const num = (x: string): number => Number(x.replace(/ /g, ''))
    expect(num(tot![1]), 'the subframe’s own bytes').toBe(sum)
    const count = zhNumeral(`十${tot![2]}`)!
    expect(count, 'the subframes it adds up').toBe(txs(agg(), 'data')[0].frame.ampdu!.mpduCount)
    expect(num(tot![3]), 'and the batch they make').toBe(ampduPsduBytes(Array(count).fill(1_500)))
    expect(txs(agg(), 'data')[0].frame.bytes).toBe(num(tot![3]))
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(ampduSubframeFields())
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

describe('ampdu · how a batch is built and answered', () => {
  it('step 3: the subframe layout is the engine’s own arithmetic, 13 × 1 536 + 1 534', () => {
    // "a 4-byte delimiter carrying the length, then that frame's own QoS header, its payload
    // and its check, padded up to a four-byte boundary. The last subframe is not padded."
    expect(AMPDU_DELIMITER_BYTES).toBe(4)
    expect(QOS_HDR_BYTES).toBe(26)
    expect(FCS_BYTES).toBe(4)
    expect(ampduSubframeBytes(1_500)).toBe(1_536)
    expect(AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + 1_500 + FCS_BYTES).toBe(1_534)
    expect(ampduPsduBytes(Array(14).fill(1_500))).toBe(13 * 1_536 + 1_534)
    expect(ampduPsduBytes(Array(14).fill(1_500))).toBe(21_502)
    expect(txs(agg(), 'data')[0].frame.bytes).toBe(ampduPsduBytes(Array(14).fill(1_500)))
  })

  it('step 2: of the three bounds it is the turn that binds, at 2 384 µs of 2 528 µs', () => {
    const rs = agg()
    const t0 = ofType(rs, 'TXOP_START')[0]
    const data = txs(rs, 'data')[0]
    const ba = txs(rs, 'ba').find((r) => r.t > data.t)!
    expect(MAX_AMPDU_MPDUS).toBe(64)
    expect(MAX_PPDU_NS).toBe(5_484 * US)
    expect(data.frame.ampdu!.mpduCount).toBe(14)
    // neither the 64-frame ceiling nor the longest PPDU is anywhere near
    expect(data.frame.txTimeNs).toBeLessThan(MAX_PPDU_NS)
    // "the whole exchange: question, answer, three pauses, batch, BlockAck" = 2 384 µs
    const endNs = ba.t + ba.frame.txTimeNs
    expect((endNs - t0.t) / US).toBe(2_384)
    expect((t0.untilNs - t0.t) / US).toBe(2_528)
    // "left over, where a fifteenth subframe costs about 160 µs" = 144 µs
    expect((t0.untilNs - endNs) / US).toBe(144)
    expect(data.frame.txTimeNs / 14 / US).toBeGreaterThan(144)
    // and the queue had more than 14 frames in it: the clock bound the batch, not the queue
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.t <= t0.t).length).toBeGreaterThan(14)
  })

  it('steps 5 and 6: one BlockAck one SIFS later, and the batch is settled whole', () => {
    const rs = agg()
    const data = txs(rs, 'data')[0]
    const ba = txs(rs, 'ba').find((r) => r.t > data.t)!
    expect(ba.t - (data.t + data.frame.txTimeNs)).toBe(OFDM_5G.sifsNs)
    expect(ba.frame.bytes).toBe(BA_BYTES)
    // no per-subframe bitmap in this engine: all fourteen leave the queue at one instant
    const deq = ofType(rs, 'DEQUEUE').filter((r) => r.node === 'sta-1' && r.t <= ba.t + ba.frame.txTimeNs)
    expect(deq).toHaveLength(14)
    expect(new Set(deq.map((r) => r.t)).size).toBe(1)
  })

  it('step 6’s closing sentence: nothing fails in this scene, so nothing is retried', () => {
    // 「本场景只有一台上传站点，没人和它抢，所以整轮 200 ms 里一次失败都没有发生」and the
    // note under the run table. THE ENGINE CONTRADICTED THE OLD PROSE HERE: it said the
    // measured 168.9 µs was above the worked 166.9 because "a few turns were lost and had to
    // be redone", and this run loses none. The excess is arithmetic, not loss — the last turn
    // is still open when the 200 ms window ends, so its air counts and its fourteen frames do
    // not. The sentence now says that, and this pin is why.
    const rs = agg()
    expect(ofType(rs, 'RETRY')).toHaveLength(0)
    expect(ofType(rs, 'ACK_TIMEOUT')).toHaveLength(0)
    expect(ofType(rs, 'DROP')).toHaveLength(0)
    // 81 turns started, 80 finished, and 80 × 14 frames were delivered
    expect(ofType(rs, 'TXOP_START')).toHaveLength(81)
    expect(ofType(rs, 'TXOP_END')).toHaveLength(80)
    expect(delivered(rs)).toBe(80 * 14)
    // and the air of those 81 turns over the 1 120 frames the first 80 delivered is the
    // 168.9 µs the table prints, against the 166.86 µs of one complete turn
    expect((busyAirNs(rs) / 81 / US).toFixed(0)).toBe('2336')
    expect(((28 + 28 + 2_248 + 32) / 14).toFixed(2)).toBe('166.86')
    expect((busyAirNs(rs) / delivered(rs) / US).toFixed(1)).toBe('168.9')
  })
})

describe('ampdu · the whole 200 ms run, both ways', () => {
  it('81 turns and 1 120 frames batched; 83 turns and 738 frames one at a time', () => {
    // the "The whole run, both ways" table, and "Almost the same number of turns is won either way"
    expect(ofType(agg(), 'TXOP_START').length).toBe(81)
    expect(ofType(plain(), 'TXOP_START').length).toBe(83)
    expect(delivered(agg())).toBe(1_120)
    expect(delivered(plain())).toBe(738)
  })

  it('air per delivered frame measures 168.9 µs batched against 228.3 µs', () => {
    // the last row of both tables: measured over the run, "a little above the worked ones"
    const perFrame = (rs: TLRecord[]) => (busyAirNs(rs) / delivered(rs) / US).toFixed(1)
    expect(perFrame(agg())).toBe('168.9')
    expect(perFrame(plain())).toBe('228.3')
    expect(busyAirNs(agg()) / delivered(agg())).toBeGreaterThan((28 + 28 + 2_248 + 32) / 14 * US)
  })

  it('about 1.5 times the delivered frames, at the same coding', () => {
    // the second experiment; the same ratio lesson-claims.test.ts pins
    expect(Math.round((delivered(agg()) / delivered(plain())) * 10) / 10).toBe(1.5)
  })

  it('fourteen is the clock’s ceiling, not aggregation’s, which is 64', () => {
    // the first experiment: "Fourteen is what fits in the time one win may last — it is not the
    // aggregation ceiling, which is 64 frames."
    expect(MAX_AMPDU_MPDUS).toBe(64)
    const t0 = ofType(agg(), 'TXOP_START')[0]
    const end = ofType(agg(), 'TXOP_END').find((r) => r.t > t0.t)!
    expect(t0.untilNs - t0.t).toBe(2_528 * US)
    // the whole turn — RTS, CTS, the batch and the BlockAck — fits inside that lease
    expect(end.t - t0.t).toBeLessThanOrEqual(t0.untilNs - t0.t)
    expect(txs(agg(), 'data')[0].frame.ampdu!.mpduCount).toBeLessThan(MAX_AMPDU_MPDUS)
  })

  it('every jump target occurs in the batched run', () => {
    for (const j of ampdu.jumps) expect(agg().some(j.find), j.label).toBe(true)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine and compares it with a literal written in THIS file, with
 * the lesson's row quoted in a comment beside it — and one `it` does the lesson's arithmetic on
 * this side instead of reading it: `expect(((28 + 28 + 2_248 + 32) / 14).toFixed(1)).toBe('166.9')`
 * types all five of the formula's figures here and never once looks at the formula. That assertion
 * cannot fail for any edit to the lesson, including an edit that changes every number in it.
 *
 * `@ampdu` hand-types 35 figures into its graded prose. What follows is the other half of each
 * assertion above, with no figure on this side: three tables (five, five and eight rows), the
 * formula, the subframe caption, the steps, both observe lines, both experiments, and the prose
 * the graded walk never reads — `deeper`, `limits` and their three file-and-function citations.
 *
 * Conventions read off the prose rather than written here, because a figure cannot be
 * re-measured without them: each cell's unit (this lesson's cells carry B, µs and ms, two of them
 * in one cell), each figure's own number of decimals, and 「约 160 µs」 to the precision that
 * figure itself states — the nearest ten.
 */
describe('ampdu · every printed figure is read back out of the lesson', () => {
  const a = agg()
  const p = plain()
  const turns = (rs: TLRecord[]) => ofType(rs, 'TXOP_START').length
  const staTx = (rs: TLRecord[]) => txs(rs).filter((r) => r.node === 'sta-1').length
  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = ampdu.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  const textWith = (fragment: string): string => {
    const b = ampdu.numbers!.find((x) => (x.kind ?? 'p') === 'p' && (x.heading ?? '').includes(fragment))
    expect(b, `no paragraph whose heading contains 「${fragment}」`).toBeDefined()
    return (b as { text: string }).text
  }
  /** 「21 502 B」 → 21502; 「166.9 µs」 → 166.9. */
  const val = (cell: string): number => Number(cell.replace(/[^\d.]/g, ''))
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/\s/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** The same, for a figure stated in a unit: 「2 248 µs」 against nanoseconds. */
  const time = (printed: string, ns: number, what: string): void => {
    const m = /^([\d\s.]+?)\s*(ms|µs)$/.exec(printed.trim())
    expect(m, `${what}: 「${printed}」 is not a time with a unit`).not.toBeNull()
    same(m![1], ns / (m![2] === 'ms' ? MS : US), `${what}, in ${m![2]}`)
  }
  const zhCount = (s: string): number | null => zhNumeral(s.replace(/两/g, '二'))
  /** Every 「file.ts 的 symbol」 in a passage, against the file that is supposed to declare it. */
  const cite = (text: string, what: string): void => {
    for (const m of text.matchAll(/([a-z]+\.ts) 的 (\w+)/g)) {
      const path = ['src/engine', 'src/model', 'src/course']
        .map((d) => resolve(ROOT, `${d}/${m[1]}`)).find(existsSync)
      expect(path, `${what}: ${m[1]} is not a file of this repository`).toBeDefined()
      expect(readFileSync(path!, 'utf8').includes(m[2]), `${what}: ${m[1]} declares ${m[2]}`).toBe(true)
    }
  }

  const t0 = ofType(a, 'TXOP_START')[0]
  const batch = txs(a, 'data')[0]
  const ba = txs(a, 'ba').find((r) => r.t > batch.t)!
  const exchangeEnd = ba.t + ba.frame.txTimeNs

  it('the one-turn table: five rows, both columns, and the dash in the corner', () => {
    const t = tableWith('同一次传输，两种打法')
    const row = (label: string): string[] => {
      const r = t.rows.find((x) => x[0] === label)
      expect(r, `no row labelled 「${label}」`).toBeDefined()
      return r!
    }
    expect(t.rows, 'the table states exactly the rows this reads').toHaveLength(5)
    // 「发出的帧数」: 14 against 1 — the batch's own count, and a plain frame being one frame
    const n = row('发出的帧数')
    expect(val(n[1]), 'the frames one batched transmission carries').toBe(batch.frame.ampdu!.mpduCount)
    expect(val(n[2]), 'and the frames one plain transmission carries')
      .toBe(txs(p, 'data')[0].frame.ampdu?.mpduCount ?? 1)
    // 「21 502 B · 2 248 µs」: one cell, two figures, two units
    for (const [j, rs] of [a, p].entries()) {
      const cell = row('这次传输')[1 + j]
      const m = /^([\d\s]+) B · ([\d\s]+) µs$/.exec(cell)
      expect(m, `「${cell}」 is not 「n B · m µs」`).not.toBeNull()
      const d = txs(rs, 'data')[0]
      same(m![1], d.frame.bytes, 'the bytes that transmission carries')
      time(`${m![2]} µs`, d.frame.txTimeNs, 'and how long it is on the air')
    }
    // 「BlockAck · 32 B · 32 µs」 / 「ACK · 14 B · 28 µs」: the answer, named and measured
    const ANSWER: readonly (readonly ['ba' | 'ack', TLRecord[]])[] = [['ba', a], ['ack', p]]
    ANSWER.forEach(([kind, rs], j) => {
      const cell = row('回答')[1 + j]
      const m = /^(BlockAck|ACK) · (\d+) B · (\d+) µs$/.exec(cell)
      expect(m, `「${cell}」 is not 「name · n B · m µs」`).not.toBeNull()
      const f = txs(rs, kind)[0]
      expect(f, `no ${kind} in that run`).toBeDefined()
      same(m![2], f.frame.bytes, `the ${m![1]}’s bytes`)
      time(`${m![3]} µs`, f.frame.txTimeNs, `the ${m![1]}’s airtime`)
    })
    // 「RTS + CTS · 28 µs each」 against 「—」: the dash is a claim, and this is it
    const open = row('开场交互')
    const m = /^RTS \+ CTS · (\d+) µs each$/.exec(open[1])
    expect(m, `「${open[1]}」 is not 「RTS + CTS · n µs each」`).not.toBeNull()
    for (const kind of ['rts', 'cts'] as const) {
      expect(new Set(txs(a, kind).map((r) => r.frame.txTimeNs)), `every ${kind} is that long`)
        .toEqual(new Set([Number(m![1]) * US]))
    }
    expect(open[2], 'the plain column prints a dash').toBe('—')
    expect([...txs(p, 'rts'), ...txs(p, 'cts')], 'and nothing opens a plain turn').toHaveLength(0)
    // 「每成功一帧的发送时间」: the worked figure, which the formula below derives
    const opening = txs(a, 'rts')[0].frame.txTimeNs + txs(a, 'cts')[0].frame.txTimeNs
    same(row('每成功一帧的发送时间')[1].replace(' µs', ''),
      (opening + batch.frame.txTimeNs + ba.frame.txTimeNs) / US / batch.frame.ampdu!.mpduCount,
      'the air one batched frame costs')
    same(row('每成功一帧的发送时间')[2].replace(' µs', ''),
      (txs(p, 'data')[0].frame.txTimeNs + txs(p, 'ack')[0].frame.txTimeNs) / US,
      'and one plain frame')
  })

  it('the formula: every term is one of the engine’s, and both divisions come out', () => {
    const f = ampdu.numbers!.find((x) => x.kind === 'formula') as { text: string }
    const lines = f.text.split('\n')
    expect(lines, 'the block states both ways of counting').toHaveLength(2)
    const m0 = /^打批：\s*\((\d+) \+ (\d+) \+ ([\d\s]+) \+ (\d+)\) µs ÷ (\d+) 帧 = ([\d.]+) µs$/.exec(lines[0])
    expect(m0, `「${lines[0]}」 is not the batched line this reads`).not.toBeNull()
    // the four terms are the question, the answer, the batch and the BlockAck, each measured
    time(`${m0![1]} µs`, txs(a, 'rts')[0].frame.txTimeNs, 'the question')
    time(`${m0![2]} µs`, txs(a, 'cts')[0].frame.txTimeNs, 'the answer to it')
    time(`${m0![3]} µs`, batch.frame.txTimeNs, 'the batch itself')
    time(`${m0![4]} µs`, ba.frame.txTimeNs, 'and the BlockAck')
    expect(Number(m0![5]), 'the frames it divides by').toBe(batch.frame.ampdu!.mpduCount)
    const sum = [1, 2, 3, 4].reduce((n, i) => n + val(m0![i]), 0)
    same(m0![6], sum / Number(m0![5]), 'the lesson’s own division')
    const m1 = /^一帧一发：\((\d+) \+ (\d+)\) µs ÷ (\d+) 帧\s*= ([\d.]+) µs$/.exec(lines[1])
    expect(m1, `「${lines[1]}」 is not the one-at-a-time line this reads`).not.toBeNull()
    time(`${m1![1]} µs`, txs(p, 'data')[0].frame.txTimeNs, 'a plain frame')
    time(`${m1![2]} µs`, txs(p, 'ack')[0].frame.txTimeNs, 'and its answer')
    expect(Number(m1![3]), 'divided by the one frame it carries').toBe(1)
    same(m1![4], (val(m1![1]) + val(m1![2])) / Number(m1![3]), 'that division too')
    // 「同样的编码，同样的字节，同一个房间」: the note's claim, in the records
    expect(new Set([...txs(a, 'data'), ...txs(p, 'data')].map((r) => r.frame.mcs)).size,
      'one coding on both sides').toBe(1)
  })

  it('the run table: five rows, both columns, and the row that is a count and a gloss', () => {
    const t = tableWith('整轮仿真，两种打法')
    const row = (label: string): string[] => {
      const r = t.rows.find((x) => x[0] === label)
      expect(r, `no row labelled 「${label}」`).toBeDefined()
      return r!
    }
    expect(t.rows, 'the table states exactly the rows this reads').toHaveLength(5)
    // 「200 ms 之内」: the head cell states the window, and it is the window that was run
    const win = /^([\d\s]+) ms 之内$/.exec(t.head[0])
    expect(win, `「${t.head[0]}」 does not state the window`).not.toBeNull()
    time(`${win![1]} ms`, RUN_NS, 'the window both columns are measured over')
    const PAIRS: readonly (readonly [string, (rs: TLRecord[]) => number])[] = [
      ['赢下的轮数（TXOP）', turns],
      ['每轮装进去的帧数', (rs) => delivered(rs) / turns(rs)],
      ['成功送达的帧数', delivered],
      ['每成功一帧的发送时间', (rs) => busyAirNs(rs) / delivered(rs) / US],
    ]
    for (const [label, q] of PAIRS) {
      const r = row(label)
      same(r[1].replace(' µs', ''), q(a), `${label}, batched`)
      same(r[2].replace(' µs', ''), q(p), `${label}, one at a time`)
    }
    // 「2（问答 + 一批）」 against 「8.9」: a figure with a gloss beside it, and a bare figure
    const used = row('每轮用掉的发送次数')
    const g = /^(\d+)（(.+)）$/.exec(used[1])
    expect(g, `「${used[1]}」 is not 「n（gloss）」`).not.toBeNull()
    same(g![1], staTx(a) / turns(a), 'the transmissions a batched turn costs the station')
    // the gloss names two things, and two is the figure beside it
    expect(g![2].split(' + '), 'the gloss lists that many').toHaveLength(Number(g![1]))
    same(used[2], staTx(p) / turns(p), 'and the transmissions a plain turn costs it')
  })

  it('the two notes under the tables, including the division one of them warns about', () => {
    // 「拿 83 轮去除 738 帧会得到 8.9，而不是 1」
    const note = textWith('两种打法都是')
    const m = /拿 (\d+) 轮去除 (\d+) 帧会得到 ([\d.]+)，而不是 (\d+)/.exec(note)
    expect(m, 'the note no longer walks the division it warns about').not.toBeNull()
    expect(Number(m![1]), 'the turns it divides by').toBe(turns(p))
    expect(Number(m![2]), 'the frames it divides').toBe(delivered(p))
    same(m![3], delivered(p) / turns(p), 'and the quotient')
    // 「而不是 1」: the 1 belongs to the other table, which is the whole point of the note
    expect(Number(m![4]), 'the 1 the note says this is not')
      .toBe(txs(p, 'data')[0].frame.ampdu?.mpduCount ?? 1)
    // 「照样连发八九帧」: the Chinese 「八九」 is a range, and both ends bracket the measurement
    const range = /照样连发([一二三四五六七八九十]{2})帧/.exec(note)
    expect(range, 'the note no longer says how many a plain turn carries').not.toBeNull()
    const [lo, hi] = [...range![1]].map((c) => zhCount(c)!)
    const perTurn = delivered(p) / turns(p)
    expect(perTurn, `more than ${lo}`).toBeGreaterThan(lo)
    expect(perTurn, `and fewer than ${hi + 1}`).toBeLessThan(hi + 1)
    // the second note: 「这一轮里没有任何重传——80 轮全部成功」
    const why = textWith('为什么实测和算式不完全一致')
    const n = /(\d+) 轮全部成功/.exec(why)
    expect(n, 'the note no longer counts the turns that finished').not.toBeNull()
    expect(Number(n![1]), 'the turns that finished inside the window')
      .toBe(ofType(a, 'TXOP_END').length)
    expect(ofType(a, 'RETRY'), 'and none of them was retried').toHaveLength(0)
    // 「它的十四帧还没有送达」: the open turn, which is why the measured figure is the higher one
    const left = /它的([一二三四五六七八九十]+)帧还没有送达/.exec(why)
    expect(left, 'the note no longer says what the last turn is still carrying').not.toBeNull()
    expect(zhCount(left![1]), 'the frames the unfinished turn holds')
      .toBe(batch.frame.ampdu!.mpduCount)
    expect(turns(a) - ofType(a, 'TXOP_END').length, 'and there is exactly one such turn').toBe(1)
  })

  it('the subframe caption: the fixed bytes, the payload, the padding and the batch', () => {
    const blk = ampdu.numbers!.find((x) => x.kind === 'diagram') as { spec: unknown; caption?: string }
    expect(blk.spec, 'the figure in `numbers` is `ampduSubframeFields()`').toEqual(ampduSubframeFields())
    const m = /固定的那 (\d+) 字节（定界符、帧头、校验）加上 ([\d\s]+) 字节载荷，再补齐到 ([\d\s]+)。([一二三四五六七八九十]+)个这样的子帧首尾相接就是 ([\d\s]+) 字节——不是 (\d+) × ([\d\s]+)/
      .exec(blk.caption ?? '')
    expect(m, 'the caption no longer walks the subframe and the batch').not.toBeNull()
    same(m![1], AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + FCS_BYTES, 'the fixed bytes of a subframe')
    const payload = val(m![2])
    same(m![3], ampduSubframeBytes(payload), 'a padded subframe')
    const count = zhCount(m![4])!
    expect(count, 'the subframes the batch carries').toBe(batch.frame.ampdu!.mpduCount)
    same(m![5], ampduPsduBytes(Array(count).fill(payload)), 'and the batch they add up to')
    same(m![5], batch.frame.bytes, 'which is the batch this run sends')
    // 「不是 14 × 1 530」: the product it is NOT. **A negative assertion does not pin the
    // figure** — 1 531 would satisfy it too, which is how `scripts/figure-planting.ts` found
    // this site. What 1 530 is, is the frame this payload makes WITHOUT aggregation, which the
    // lesson's own second variant sends, so that is what it is read against.
    expect(Number(m![6]), 'the count in the product it denies').toBe(count)
    expect(val(m![7]), 'the unaggregated frame that product multiplies')
      .toBe(txs(plain(), 'data')[0].frame.bytes)
    expect(val(m![7]) * count, 'which really is not the batch').not.toBe(batch.frame.bytes)
    expect(val(m![7]) * count, 'and the batch is the larger of the two')
      .toBeLessThan(batch.frame.bytes)
  })

  it('the steps: both ceilings, the five segments of a subframe, and the BlockAck', () => {
    const items = (ampdu.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
    expect(items, 'the lesson builds the batch in exactly the steps this reads').toHaveLength(6)
    // step 2: 「最多 64 帧」 and 「比 5.484 ms 还长」
    const caps = /最多 (\d+) 帧[^]*?比 ([\d.]+) ms 还长/.exec(items[1])
    expect(caps, 'step 2 no longer states the two ceilings').not.toBeNull()
    expect(Number(caps![1]), 'the aggregation ceiling').toBe(MAX_AMPDU_MPDUS)
    time(`${caps![2]} ms`, MAX_PPDU_NS, 'the longest transmission')
    // step 3: 「4 字节的定界符」 … 「所以它是 1 534 字节」
    const seg = /(\d+) 字节的定界符/.exec(items[2])
    expect(seg, 'step 3 no longer states the delimiter’s size').not.toBeNull()
    expect(Number(seg![1]), 'the delimiter').toBe(AMPDU_DELIMITER_BYTES)
    const last = /最后一个子帧不补齐，所以它是 ([\d\s]+) 字节/.exec(items[2])
    expect(last, 'step 3 no longer states the last subframe’s size').not.toBeNull()
    same(last![1], AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + 1_500 + FCS_BYTES, 'an unpadded subframe')
    /*
     * 「这一点恰恰是本仿真器没有建模的：在这里，一批里任何位置发生碰撞，整批都会丢……下面第 6
     * 步写的就是它真正做的事」 — `picture` points at a step by number, and the 「第」 rule change
     * of 2026-10-14 uncovered that figure. It is checkable inside the lesson: the step it points
     * at has to be the one that settles the batch as a whole.
     */
    const pic = ampdu.picture!.map((b) => (b as { text?: string }).text ?? '').join(' ')
    const pointer = /下面第 (\d+) 步写的就是它真正做的事/.exec(pic)
    expect(pointer, '`picture` no longer points at the step that does it').not.toBeNull()
    expect(items[Number(pointer![1]) - 1], `step ${pointer![1]} is the one that settles the batch`)
      .toMatch(/当成一个整体判定/)
    expect(Number(pointer![1]), 'and it is the last step').toBe(items.length)
    // step 5: 「只回一个 32 字节的 BlockAck」
    const answer = /只回一个 (\d+) 字节的 BlockAck/.exec(items[4])
    expect(answer, 'step 5 no longer states the BlockAck’s size').not.toBeNull()
    expect(Number(answer![1]), 'the BlockAck').toBe(ba.frame.bytes)
  })

  it('the worked batch: eight rows, including the fifteenth subframe that does not fit', () => {
    const t = tableWith('第一批，逐项加起来')
    const payload = 1_500
    const count = batch.frame.ampdu!.mpduCount
    const ROWS: readonly (readonly [RegExp, (cell: string, l: RegExpExecArray) => void])[] = [
      // 「取走的帧数，允许的是 64」 → 14
      [/^取走的帧数，允许的是 (\d+)$/, (c, l) => {
        expect(Number(l[1]), 'the ceiling the row names').toBe(MAX_AMPDU_MPDUS)
        expect(val(c), 'and the frames actually taken').toBe(count)
      }],
      // 「前十三个每个：4 + 26 + 1 500 + 4，再补齐」 → 1 536 B
      [/^前([一二三四五六七八九十]+)个每个：(\d+) \+ (\d+) \+ ([\d\s]+) \+ (\d+)，再补齐$/, (c, l) => {
        expect(zhCount(l[1]), 'the subframes that are padded').toBe(count - 1)
        expect([Number(l[2]), Number(l[3]), Number(l[5])], 'delimiter, header and check')
          .toEqual([AMPDU_DELIMITER_BYTES, QOS_HDR_BYTES, FCS_BYTES])
        same(l[4], payload, 'the payload')
        same(c.replace(' B', ''), ampduSubframeBytes(payload), 'and a padded subframe')
      }],
      [/^最后一个，不补齐$/, (c) => same(c.replace(' B', ''),
        AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + payload + FCS_BYTES, 'the unpadded last subframe')],
      // 「13 × 1 536 + 1 534」 → 21 502 B: the label is the arithmetic, the cell is the sum
      [/^(\d+) × ([\d\s]+) \+ ([\d\s]+)$/, (c, l) => {
        expect(Number(l[1]), 'the padded subframes').toBe(count - 1)
        same(l[2], ampduSubframeBytes(payload), 'each of them')
        same(l[3], AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + payload + FCS_BYTES, 'and the last')
        expect(Number(l[1]) * val(l[2]) + val(l[3]), 'the lesson’s own product and sum')
          .toBe(val(c))
        same(c.replace(' B', ''), batch.frame.bytes, 'which is the batch')
      }],
      [/^在空中的时长$/, (c) => time(c, batch.frame.txTimeNs, 'the batch’s airtime')],
      [/^整次交互：提问、回答、三段停顿、这一批、BlockAck$/, (c) =>
        time(c, exchangeEnd - t0.t, 'the whole exchange')],
      [/^本轮的上限$/, (c) => time(c, t0.untilNs - t0.t, 'the turn’s ceiling')],
      // 「剩下的，而第十五个子帧要花约 160 µs」 → 144 µs
      [/^剩下的，而第([一二三四五六七八九十]+)个子帧要花约 (\d+) µs$/, (c, l) => {
        time(c, t0.untilNs - exchangeEnd, 'what is left of the turn')
        expect(zhCount(l[1]), 'the subframe that would not fit').toBe(count + 1)
        /*
         * **「约 160」 is read as a ROUNDED figure, which is what 「约」 says.** This read used
         * to infer its own precision from the printed digits — trailing zeros meant the nearest
         * ten — and the planter walked straight through it on 2026-10-14: one subframe really
         * costs 160.57 µs, so a planted 「约 161」 was checked to the nearest ONE and passed.
         * **A tolerance inferred from the figure moves with the figure.** So the two things the
         * sentence claims are read separately: the figure is a round ten (otherwise 「约」 is
         * false), and it is the right ten.
         */
        const per = batch.frame.txTimeNs / count / US
        expect(Number(l[2]) % 10, `「约 ${l[2]}」 is not rounded to a ten`).toBe(0)
        expect(Math.abs(per - Number(l[2])), `one subframe is ${per.toFixed(2)} µs`)
          .toBeLessThan(5)
        expect(per, 'and it really does not fit in what is left')
          .toBeGreaterThan((t0.untilNs - exchangeEnd) / US)
      }],
    ]
    expect(t.rows, 'the table adds up exactly the rows this reads').toHaveLength(ROWS.length)
    for (const [i, [re, check]] of ROWS.entries()) {
      const l = re.exec(t.rows[i][0])
      expect(l, `row ${i}: 「${t.rows[i][0]}」 is not in the shape this reads`).not.toBeNull()
      check(t.rows[i][1], l!)
    }
  })

  it('both observe lines and both experiments', () => {
    const o = ampdu.observe!
    // 「×14 的角标」 … 「十四帧、21 502 字节 … 2 248 µs」
    const badge = /×(\d+) 的角标/.exec(o[0])
    expect(badge, 'observe[0] no longer states the badge').not.toBeNull()
    expect(Number(badge![1]), 'the badge the batch carries').toBe(batch.frame.ampdu!.mpduCount)
    const m = /([一二三四五六七八九十]+)帧、([\d\s]+) 字节在同一个前导码下面发出去，是一次时长 ([\d\s]+) µs 的传输/
      .exec(o[0])
    expect(m, 'observe[0] no longer states the batch it hovers over').not.toBeNull()
    expect(zhCount(m![1]), 'the frames').toBe(batch.frame.ampdu!.mpduCount)
    same(m![2], batch.frame.bytes, 'the bytes')
    time(`${m![3]} µs`, batch.frame.txTimeNs, 'and the airtime')
    // 「32 字节、32 µs」 … 「它顶替的是十四个独立回答」
    const b = /(\d+) 字节、(\d+) µs，就把这一轮收尾了——它顶替的是([一二三四五六七八九十]+)个独立回答/.exec(o[1])
    expect(b, 'observe[1] no longer states the BlockAck it replaces').not.toBeNull()
    same(b![1], ba.frame.bytes, 'the BlockAck’s bytes')
    time(`${b![2]} µs`, ba.frame.txTimeNs, 'its airtime')
    expect(zhCount(b![3]), 'and the answers it stands in for').toBe(batch.frame.ampdu!.mpduCount)
    // tryThis[0]: 「每赢一次信道就清掉 14 帧，而不是 1 帧 … 上限是 64 帧」
    const e0 = /清掉 (\d+) 帧，而不是 (\d+) 帧[^]*?上限是 (\d+) 帧/.exec(ampdu.tryThis![0])
    expect(e0, 'the first experiment is gone, or its shape changed').not.toBeNull()
    const deq = ofType(a, 'DEQUEUE').filter((r) => r.node === 'sta-1' && r.t <= exchangeEnd)
    expect(Number(e0![1]), 'the frames one win clears from the queue').toBe(deq.length)
    expect(new Set(deq.map((r) => r.t)).size, 'all at one instant').toBe(1)
    expect(Number(e0![3]), 'and the ceiling that is not what bound it').toBe(MAX_AMPDU_MPDUS)
    // tryThis[1]: 「成功送达的帧数约为 1.5 倍」
    const e1 = /成功送达的帧数约为 ([\d.]+) 倍/.exec(ampdu.tryThis![1])
    expect(e1, 'the second experiment is gone, or its shape changed').not.toBeNull()
    same(e1![1], delivered(a) / delivered(p), 'the frames aggregation buys')
  })

  it('`deeper` and `limits`: the two ceilings, the fixed bytes, and three citations', () => {
    const d = (ampdu.deeper! as { heading?: string; text?: string }[])
      .map((x) => `${x.heading ?? ''}\n${x.text ?? ''}`).join('\n')
    // 「最多容纳 64 个成员」 … 「所以这一批是 14 帧，而不是 64 帧」
    const m = /最多容纳 (\d+) 个成员[^]*?所以这一批是 (\d+) 帧，而不是 (\d+) 帧/.exec(d)
    expect(m, '`deeper` no longer states which ceiling binds').not.toBeNull()
    expect([Number(m![1]), Number(m![3])], 'the structural ceiling, twice')
      .toEqual([MAX_AMPDU_MPDUS, MAX_AMPDU_MPDUS])
    expect(Number(m![2]), 'and the batch the clock actually allows')
      .toBe(batch.frame.ampdu!.mpduCount)
    const ls = ampdu.limits.map((l) => l.text).join('\n')
    // 「这次尝试里的十四帧一起记重传」
    const fourteen = /这次尝试里的([一二三四五六七八九十]+)帧一起记重传/.exec(ls)
    expect(fourteen, '`limits` no longer counts the frames a failure takes down').not.toBeNull()
    expect(zhCount(fourteen![1]), 'the frames in one batch').toBe(batch.frame.ampdu!.mpduCount)
    // 「4 字节定界符 + 26 字节 QoS 帧头 + 载荷 + 4 字节校验」 and 「自带 36 字节」
    const bytes = /(\d+) 字节定界符 \+ (\d+) 字节 QoS 帧头 \+ 载荷 \+ (\d+) 字节校验/.exec(ls)
    expect(bytes, '`limits` no longer spells out the byte arithmetic').not.toBeNull()
    expect([Number(bytes![1]), Number(bytes![2]), Number(bytes![3])], 'the three fixed parts')
      .toEqual([AMPDU_DELIMITER_BYTES, QOS_HDR_BYTES, FCS_BYTES])
    // and the delimiter again, in the entry that says the engine does nothing with it
    const delim = /每个子帧前面那 (\d+) 字节定界符/.exec(ls)
    expect(delim, '`limits` no longer says what the delimiter is worth here').not.toBeNull()
    expect(Number(delim![1]), 'the delimiter, restated').toBe(AMPDU_DELIMITER_BYTES)
    const fixed = /自带 (\d+) 字节的非载荷字节/.exec(ls)
    expect(fixed, '`limits` no longer totals them').not.toBeNull()
    same(fixed![1], ampduSubframeBytes(1_500) - 1_500, 'the non-payload bytes a subframe carries')
    // 「1120 对 738 帧」: the figure the last limit says would stop holding
    const pair = /(\d+) 对 (\d+) 帧/.exec(ls)
    expect(pair, '`limits` no longer names the gain it says is scene-bound').not.toBeNull()
    expect([Number(pair![1]), Number(pair![2])], 'the two deliveries')
      .toEqual([delivered(a), delivered(p)])
    // and every 「file.ts 的 symbol」 in `limits` is a claim about this repository
    cite(ls, '`limits`')
    expect([...ls.matchAll(/（?([a-z]+\.ts) 的 (\w+)/g)].length, 'it cites three of them').toBe(3)
  })

  /**
   * **The fourteen sites `scripts/figure-planting.ts` found this file still not reading**, on
   * 2026-10-12. Four figures account for all of them, each printed in two or three places: the
   * window every count is taken over, the 64-subframe cap, the 1 500-byte payload, and the 14
   * frames one win clears. The cap is the interesting one — the lesson says it twice and
   * `sources` a third time, and this scene never reaches it, so the only thing that can pin it
   * is the engine's own constant.
   */
  it('the window, the cap, the payload and the batch, wherever the lesson states them', () => {
    const everywhere = [
      ...(ampdu.numbers ?? []).map((b) => JSON.stringify(b)),
      ...ampdu.limits.map((l) => l.text),
      ...(ampdu.sources ?? []),
      ...ampdu.tryThis,
      ...ampdu.observe,
    ].join('\n')
    // 「200 ms」: every mention is the window this lesson's runs are measured over
    // the lookbehind keeps 「5.484 ms」 (MAX_PPDU_NS, which another assertion owns) out of this
    const windows = [...everywhere.matchAll(/(?<![\d.])(\d+) ms/g)].map((m) => Number(m[1]))
    expect(windows.length, 'the lesson states the window more than once').toBeGreaterThan(2)
    for (const w of windows) expect(w * MS, `a window of ${w} ms`).toBe(RUN_NS)
    // 「64 个子帧上限」: the engine's constant, and this scene stays under it
    const caps = [...everywhere.matchAll(/(\d+) 这个上限|远小于 (\d+)|(\d+) 个子帧上限|上限是 (\d+) 帧/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map(Number))
    expect(caps.length, 'the lesson states the cap more than once').toBeGreaterThan(2)
    for (const c of caps) expect(c, `a cap of ${c}`).toBe(MAX_AMPDU_MPDUS)
    expect(batch.frame.ampdu!.mpduCount, 'and this scene never reaches it')
      .toBeLessThan(MAX_AMPDU_MPDUS)
    // 「1500 字节载荷」: the payload every frame of this scene carries
    // this lesson writes the same payload both ways — 「1 500 字节载荷」 and 「1500 字节载荷」 —
    // so the space is stripped rather than treated as a boundary
    const loads = [...everywhere.matchAll(/(\d[\d ]*) 字节载荷|(\d[\d ]*) 字节的帧/g)]
      .flatMap((m) => m.slice(1).filter(Boolean).map((x) => Number(x.replace(/ /g, ''))))
    expect(loads.length, 'the lesson states the payload more than once').toBeGreaterThan(1)
    const msdu = ofType(agg(), 'ARRIVAL')[0]
    for (const l of loads) expect(l, `a payload of ${l} B`).toBe(msdu.bytes)
    // `tryThis`: 「每赢一次信道就清掉 14 帧，而不是 1 帧」
    const t = /清掉 (\d+) 帧，而不是 (\d+) 帧。(\d+) 是/.exec(ampdu.tryThis.join('\n'))
    expect(t, '`tryThis` no longer contrasts the batch with one frame').not.toBeNull()
    expect(Number(t![1]), 'the frames one win clears').toBe(batch.frame.ampdu!.mpduCount)
    expect(Number(t![2]), 'and what it would be without aggregation')
      .toBe(txs(plain(), 'data')[0].frame.ampdu?.mpduCount ?? 1)
    expect(Number(t![3]), 'the same batch restated').toBe(Number(t![1]))
    // 「拿 83 轮去除 738 帧会得到 8.9，而不是 1——那个 1 属于上面那张表」: the 1 it contrasts
    // with is the plain variant's own frames-per-transmission
    const one = /会得到 ([\d.]+)，而不是 (\d+)——那个 (\d+)/.exec(everywhere)
    expect(one, '`numbers` no longer contrasts the two ratios').not.toBeNull()
    expect(Number(one![2]), 'the frames one transmission carries without aggregation')
      .toBe(txs(plain(), 'data')[0].frame.ampdu?.mpduCount ?? 1)
    expect(Number(one![3]), 'the same figure restated').toBe(Number(one![2]))
  })
})
