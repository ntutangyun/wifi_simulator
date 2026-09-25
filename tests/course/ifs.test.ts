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
import { ifs, ifsTiming } from '../../src/course/tier1/ifs'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
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
