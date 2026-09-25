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
import { txop } from '../../src/course/tier2/txop'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, aifsNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

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
    // the first observation, and the jump "first TXOP start". The same burst is pinned in
    // lesson-claims.test.ts; here it guards the sentence as this lesson now writes it.
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

  it('step 6: the holder contends again from scratch, silence and countdown', () => {
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
