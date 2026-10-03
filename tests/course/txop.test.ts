/**
 * Every empirical claim in "TXOP — own the channel, briefly", measured against
 * the lesson's own scenario.
 *
 * The lesson had no test file of its own before the readability rewrite: the
 * first burst at 0.88 ms and its two receivers are pinned in
 * tests/course/lesson-claims.test.ts ("lesson 9 · TXOP"), which still holds
 * them and still passes. What this file adds is everything the grown lesson
 * now states — the per-class ceilings, the burst census, the 480 µs and 232 µs
 * arithmetic and the two experiments. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { txop, txopBurstTiming } from '../../src/course/tier2/txop'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, aifsNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(txop, undefined, RUN_NS)
const txs = (rs: TLRecord[], kind?: string) =>
  ofType(rs, 'TX_START').filter((r) => kind === undefined || r.frame.kind === kind)
const runSc = (sc: ReturnType<typeof txop.scenario>): TLRecord[] => [...new Simulation(sc).runUntil(RUN_NS).records]

/** One entry per burst: how long the access point held the floor and how many data frames it sent. */
function bursts(rs: TLRecord[], node = 'ap'): { lenNs: number; frames: number }[] {
  const ends = ofType(rs, 'TXOP_END').filter((r) => r.node === node)
  const out: { lenNs: number; frames: number }[] = []
  for (const s of ofType(rs, 'TXOP_START').filter((r) => r.node === node)) {
    const e = ends.find((r) => r.t > s.t)
    if (!e) continue
    out.push({
      lenNs: e.t - s.t,
      frames: txs(rs, 'data').filter((r) => r.node === node && r.t >= s.t && r.t < e.t).length,
    })
  }
  return out
}

lessonShapeSuite(txop, { runNs: RUN_NS })

describe('txop · the lesson’s own scene', () => {
  it('closes the pair it builds on: EDCA won the turn, aggregation filled it', () => {
    expect(MODULES[txop.module].title).toBe('QoS 与效率')
    expect(txop.needs).toEqual(['edca', 'ampdu'])
    expect(txop.terms!.map((t) => t.term)).toEqual(['TXOP', 'TXOP limit'])
  })

  it('the scene is an access point and two video receivers', () => {
    const sc = txop.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => [n.id, n.profiles[0]])).toEqual([
      ['ap', 'idle'], ['sta-1', 'video'], ['sta-2', 'video'],
    ])
  })
})

describe('txop · the ceiling, by class', () => {
  it('2.080, 4.096 and 2.528 ms are the engine’s own per-category limits', () => {
    const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
    expect(by('VO').txopLimitNs / MS).toBe(2.080)
    expect(by('VI').txopLimitNs / MS).toBe(4.096)
    expect(by('BE').txopLimitNs / MS).toBe(2.528)
    expect(by('BK').txopLimitNs / MS).toBe(2.528)
    // "the largest: video frames are big and arrive in groups"
    expect(Math.max(...EDCA_PARAMS.map((p) => p.txopLimitNs))).toBe(by('VI').txopLimitNs)
    // "short: a call must not be made to wait"
    expect(by('VO').txopLimitNs).toBeLessThan(by('BE').txopLimitNs)
  })

  it('the lease this run hands out is the video one, 4 096 µs', () => {
    // the run table's "Ceiling it was given", and the observation naming AC_VI
    const starts = ofType(recs(), 'TXOP_START')
    expect(new Set(starts.map((r) => r.node))).toEqual(new Set(['ap']))
    expect(new Set(starts.map((r) => r.ac))).toEqual(new Set([2]))
    expect(EDCA_PARAMS[2].name).toBe('VI')
    expect(new Set(starts.map((r) => r.untilNs - r.t))).toEqual(new Set([4_096 * US]))
  })
})

describe('txop · what the access point actually did', () => {
  const rs = recs()
  const bs = bursts(rs)

  it('463 bursts: 219 carrying one frame and 243 carrying two', () => {
    // the run table and the third observation
    expect(ofType(rs, 'TXOP_START').length).toBe(463)
    expect(bs.filter((b) => b.frames === 1).length).toBe(219)
    expect(bs.filter((b) => b.frames === 2).length).toBe(243)
    // "no burst here carries more than two": the queue, not the ceiling, decides
    expect(Math.max(...bs.map((b) => b.frames))).toBe(2)
  })

  it('the shortest burst is 232 µs, the longest 480 µs and the mean 362.4 µs', () => {
    const us = bs.map((b) => b.lenNs / US)
    expect(Math.min(...us)).toBe(232)
    expect(Math.max(...us)).toBe(480)
    expect((us.reduce((a, b) => a + b, 0) / us.length).toFixed(1)).toBe('362.4')
    // "the longest hold is 480 µs of the 4 096 µs it was allowed"
    expect(Math.max(...us)).toBeLessThan(4_096 / 8)
  })

  it('480 µs is two exchanges of 188 + 16 + 28 µs, and 232 µs is one', () => {
    // the formula block: a frame, the short pause and an answer, twice over or once
    const data = txs(rs, 'data')
    expect(new Set(data.map((r) => r.frame.txTimeNs))).toEqual(new Set([188 * US]))
    expect(new Set(txs(rs, 'ack').map((r) => r.frame.txTimeNs))).toEqual(new Set([28 * US]))
    expect(OFDM_5G.sifsNs / US).toBe(16)
    expect(188 + 16 + 28).toBe(232)
    expect(188 + 16 + 28 + 16 + 188 + 16 + 28).toBe(480)
  })

  it('the first burst, at 0.88 ms, serves one television then the other one pause later', () => {
    // the figure and its caption, and the jump "first TXOP start". (This was the first observe
    // line until the 2026-09-25 re-pacing; the figure says it to scale now.) The same burst is
    // pinned in lesson-claims.test.ts; here it guards the sentence as this lesson now writes it.
    const t0 = ofType(rs, 'TXOP_START')[0]
    expect(Math.round(t0.t / 10_000) / 100).toBe(0.88)
    const end = ofType(rs, 'TXOP_END').find((r) => r.t > t0.t)!
    const inside = txs(rs).filter((r) => r.t >= t0.t && r.t < end.t)
    expect(inside.map((r) => `${r.frame.kind}:${r.frame.dst}`))
      .toEqual(['data:sta-2', 'ack:ap', 'data:sta-1', 'ack:ap'])
    // "No required silence and no countdown appear inside it."
    expect(inside[2].t).toBe(inside[1].t + inside[1].frame.txTimeNs + OFDM_5G.sifsNs)
    expect(rs.some((r) => (r.type === 'BACKOFF_DRAW' || r.type === 'IFS_START')
      && r.node === 'ap' && r.t > t0.t && r.t < end.t)).toBe(false)
    for (const j of txop.jumps) expect(rs.some(j.find), j.label).toBe(true)
  })
})

describe('txop · the burst against its clock, as the figure draws it', () => {
  const rs = recs()
  const lane = (label: string): TimingLane => txopBurstTiming().lanes.find((l) => l.label === label)!

  it('every span is that burst’s own record, taken from the TXOP start', () => {
    const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'ap')[0]
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'ap' && r.t > t0.t)!
    const rel = (t: number) => (t - t0.t) / US
    const data = txs(rs, 'data').filter((r) => r.node === 'ap' && r.t >= t0.t && r.t < end.t)
    const acks = txs(rs, 'ack').filter((r) => r.t > t0.t && r.t <= end.t)
    // the access point's lane: two frames of 188 µs at 0 and 248
    expect(lane('接入点').spans.map((s) => [s.fromUs, s.toUs]))
      .toEqual(data.map((d) => [rel(d.t), rel(d.t + d.frame.txTimeNs)]))
    // the televisions' lane: two answers of 28 µs at 204 and 452
    expect(lane('两台电视').spans.map((s) => [s.fromUs, s.toUs]))
      .toEqual(acks.map((a) => [rel(a.t), rel(a.t + a.frame.txTimeNs)]))
    // the clock: 4 096 µs from the same zero, which is the lease the record carries
    const clock = lane('上限').spans[0]
    expect([clock.fromUs, clock.toUs]).toEqual([0, (t0.untilNs - t0.t) / US])
    expect(clock.toUs).toBe(4_096)
    expect(clock.label).toBe('4 096 µs')
    // and the caption's "480 µs, of the 4 096 it was allowed"
    expect(rel(end.t)).toBe(480)
    expect(acks[1].t + acks[1].frame.txTimeNs).toBe(end.t)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(txopBurstTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(6)
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

describe('txop · the first burst, run through the steps', () => {
  const rs = recs()
  const ms = (ns: number) => Number((ns / MS).toFixed(3))

  it('every row of the worked example is that burst, record by record', () => {
    const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'ap')[0]
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'ap' && r.t > t0.t)!
    const data = txs(rs, 'data').filter((r) => r.node === 'ap' && r.t >= t0.t && r.t < end.t)
    const acks = ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > t0.t && r.t <= end.t)
    // step 1: "the first frame goes out at" / "so the clock ends at, 4 096 µs later"
    expect(ms(t0.t)).toBe(0.883)
    expect(t0.t).toBe(data[0].t)
    expect((t0.untilNs - t0.t) / US).toBe(4_096)
    expect(ms(t0.untilNs)).toBe(4.979)
    // step 2: "frame to TV 2, 188 µs, then 16 + 28 µs: answer in at"
    expect(data[0].frame.dst).toBe('sta-2')
    expect(data[0].frame.txTimeNs / US).toBe(188)
    expect(ms(acks[0].t)).toBe(1.115)
    expect(acks[0].t - (data[0].t + data[0].frame.txTimeNs)).toBe(OFDM_5G.sifsNs + 28 * US)
    // steps 3 and 4: the next exchange needs 248 µs and would end well inside the clock
    expect(16 + 188 + 16 + 28).toBe(248)
    expect(acks[0].t + 248 * US).toBeLessThan(t0.untilNs)
    expect(ms(acks[0].t + 248 * US)).toBe(1.363)
    // "so, one pause later, the frame to TV 1 goes out at"
    expect(data[1].t - acks[0].t).toBe(OFDM_5G.sifsNs)
    expect(ms(data[1].t)).toBe(1.131)
    expect(data[1].frame.dst).toBe('sta-1')
    // step 5: the answer arrives, the queue is empty, and the turn ends there
    expect(ms(end.t)).toBe(1.363)
    expect(end.t).toBe(acks[1].t)
    expect((end.t - t0.t) / US).toBe(480)
    // step 4's claim about the gap: one pause is shorter than any contender's silence
    expect(OFDM_5G.sifsNs / US).toBe(16)
    expect(Math.min(...EDCA_PARAMS.map((p) => aifsNs(p.aifsn, OFDM_5G))) / US).toBe(34)
  })

  it('step 6: the burst ending is itself what invokes the next backoff', () => {
    const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'ap')[0]
    const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'ap' && r.t > t0.t)!
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'ap' && r.t >= end.t)!
    expect(ifs.t).toBe(end.t)
    expect(ifs.untilNs - ifs.t).toBe(aifsNs(2, OFDM_5G))
    const draw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'ap' && r.t >= ifs.untilNs)!
    expect(draw.t).toBe(ifs.untilNs)
  })
})

describe('txop · the experiments', () => {
  it('switching it off keeps the frames and multiplies the countdowns: 462 draws become 706', () => {
    // "It sends the same number of frames, but now draws a countdown 706 times instead of 462"
    const rs = recs()
    const sc = txop.scenario()
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    ap.caps.features = { ...ap.caps.features, txop: false }
    const off = runSc(sc)
    const draws = (x: TLRecord[]) => ofType(x, 'BACKOFF_DRAW').filter((r) => r.node === 'ap').length
    expect(draws(rs)).toBe(462)
    expect(draws(off)).toBe(706)
    expect(ofType(off, 'TXOP_START')).toHaveLength(0)
    expect(txs(off, 'data').length).toBe(txs(rs, 'data').length)
    // "switched off, what it owes is one per frame": 706 against 707 frames, and the odd one
    // out is the same window edge as the base run's — a millisecond more and the two agree.
    expect(txs(off, 'data').length).toBe(707)
    const longer = [...new Simulation(sc).runUntil(301 * MS).records] as TLRecord[]
    expect(draws(longer)).toBe(txs(longer, 'data').length)
    expect(draws(longer)).toBe(709)
  })

  it('a saturated television grows the bursts to 1.9 ms and three frames', () => {
    // "That station now has frames waiting whenever the access point wins, and bursts grow to
    // 1.9 ms and three frames."
    const sc = txop.scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['saturated']
    const bs = bursts(runSc(sc))
    expect(Math.max(...bs.map((b) => b.frames))).toBe(3)
    expect((Math.max(...bs.map((b) => b.lenNs)) / MS).toFixed(1)).toBe('1.9')
  })
})

/**
 * The post-TXOP backoff: the mechanism a reader asked about after watching the
 * access point count down six slots with an empty queue.
 *
 * The lesson used to frame a backoff as the price paid in order to transmit,
 * and under that frame this countdown reads as a bug. It is item b) of
 * §10.23.2.2: the holder's EDCAF invokes a backoff when the TXOP's last PPDU
 * has been transmitted, with no condition on anything being left to send. What
 * these tests pin is both halves of what the lesson now says — that every one
 * of this run's 462 draws follows a burst rather than preceding one, and the
 * payoff, which is the next burst going out in the nanosecond the frame
 * arrived because the countdown was already spent.
 */
describe('txop · the backoff that follows the burst', () => {
  const rs = recs()
  const ms = (ns: number) => Number((ns / MS).toFixed(3))

  it('one draw per burst that ENDED: 462 here, 464 when the window is 1 ms longer', () => {
    // the first experiment's arithmetic. The lesson used to explain 462 against 463 bursts
    // with "the first burst of the run needs no countdown" — the pre-backoff reading, and
    // wrong: the draws pair with the TXOP_ENDs, and this window holds 462 of those because
    // the 463rd burst starts at 299.526 ms and has not finished at 300. One millisecond more
    // and starts, ends and draws agree at 464. The first burst IS spared a draw (the
    // assertion below), but being spared it never moved the count.
    const ends = ofType(rs, 'TXOP_END').filter((r) => r.node === 'ap')
    const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === 'ap')
    expect([ends.length, draws.length]).toEqual([462, 462])
    const longer = runOf(txop, undefined, 301 * MS)
    const n = (t: string) => ofType(longer, t as 'TXOP_START').filter((r) => r.node === 'ap').length
    expect([n('TXOP_START'), n('TXOP_END'), n('BACKOFF_DRAW')]).toEqual([464, 464, 464])
  })

  it('every countdown the access point draws follows a burst, and none precedes one', () => {
    // the second observation ("462 draws, every one right after a burst, never before one")
    // and the first experiment ("those 462 are the one after each burst")
    const starts = ofType(rs, 'TXOP_START').filter((r) => r.node === 'ap')
    const ends = ofType(rs, 'TXOP_END').filter((r) => r.node === 'ap')
    const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === 'ap')
    expect(starts.length).toBe(463)
    expect(draws.length).toBe(462)
    for (const d of draws) {
      const end = ends.filter((e) => e.t <= d.t).slice(-1)[0]
      expect(end, `the draw at ${d.t} follows no burst`).toBeDefined()
      // and the holder has not transmitted again in between: the draw belongs to that burst
      expect(starts.some((s) => s.t > end.t && s.t <= d.t), `draw at ${d.t}`).toBe(false)
    }
    // 463 − 462 is the first burst of the run, which follows no burst and so owes no draw
    expect(draws.some((d) => d.t <= starts[0].t)).toBe(false)
  })

  it('the first one is drawn with the queue already empty: 34 µs, then six slots', () => {
    // the watch call-out: "the turn ends at 1.363 ms with an empty queue, and 34 µs later it
    // still draws 6 slots and counts them down"
    const end = ofType(rs, 'TXOP_END').filter((r) => r.node === 'ap')[0]
    expect(ms(end.t)).toBe(1.363)
    expect(ofType(rs, 'DEQUEUE').filter((r) => r.node === 'ap' && r.t === end.t).map((r) => r.depth))
      .toEqual([0])
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'ap' && r.t >= end.t)!
    expect(ifs.t).toBe(end.t)
    expect((ifs.untilNs - ifs.t) / US).toBe(34)
    expect(aifsNs(2, OFDM_5G) / US).toBe(34)
    const draw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'ap')!
    expect(draw.t).toBe(ifs.untilNs)
    expect(draw.value).toBe(6)
    // all six counted down, and not one frame sent while it counted
    const decs = ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'ap' && r.t >= draw.t && r.t <= draw.t + 6 * 9 * US)
    expect(decs.map((r) => r.value)).toEqual([5, 4, 3, 2, 1, 0])
    expect(txs(rs).some((r) => r.node === 'ap' && r.t > end.t && r.t <= decs[5].t)).toBe(false)
  })

  it('so the next burst goes out in the arrival’s own nanosecond, with no countdown', () => {
    // the watch call-out's payoff: "the next frame arrives at 1.652 ms and goes out there and
    // then — no silence, no countdown", and "412 of the 463 bursts go out in the nanosecond
    // the frame arrived". The call-out states that 412 as a fact and not as a consequence:
    // 411 of them are a spent post-backoff; the 412th is the run's first burst at 0.883 ms,
    // which is just as instant for the other reason — it had never contended, so it owed
    // no draw at all.
    const starts = ofType(rs, 'TXOP_START').filter((r) => r.node === 'ap')
    const end = ofType(rs, 'TXOP_END').filter((r) => r.node === 'ap')[0]
    const second = starts[1]
    expect(ms(second.t)).toBe(1.652)
    const arrival = ofType(rs, 'ARRIVAL').find((r) => r.node === 'ap' && r.t > end.t)!
    expect(arrival.t).toBe(second.t)
    const first = txs(rs, 'data').find((r) => r.node === 'ap' && r.t >= second.t)!
    expect(first.t).toBe(second.t)
    // the AIFS it serves is zero long, and nothing was drawn or counted since the post-backoff
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'ap' && r.t === second.t)!
    expect(ifs.untilNs).toBe(ifs.t)
    const lastDec = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'ap' && r.t < second.t).slice(-1)[0]
    expect(lastDec.value).toBe(0)
    expect(rs.some((r) => (r.type === 'BACKOFF_DRAW' || r.type === 'BACKOFF_DEC')
      && r.node === 'ap' && r.t > lastDec.t && r.t <= second.t)).toBe(false)
    const arrivals = new Set(ofType(rs, 'ARRIVAL').filter((r) => r.node === 'ap').map((r) => r.t))
    expect(starts.filter((s) => arrivals.has(s.t)).length).toBe(412)
  })

  it('the two jumps land on that draw and on the burst that pays nothing', () => {
    const starts = ofType(rs, 'TXOP_START').filter((r) => r.node === 'ap')
    const draw = rs.find(txop.jumps[1].find)!
    expect(draw.type).toBe('BACKOFF_DRAW')
    expect(ms(draw.t)).toBe(1.397)
    const burst = rs.find(txop.jumps[2].find)!
    expect(burst.t).toBe(starts[1].t)
    // the 1.5 ms in the predicate sits between the two burst starts, so the jump can neither
    // drift onto the first burst nor past the second
    expect(starts[0].t).toBeLessThan(1_500_000)
    expect(starts[1].t).toBeGreaterThan(1_500_000)
  })
})
