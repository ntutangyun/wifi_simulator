/**
 * Every empirical claim in "SIFS, DIFS and the ACK dance", measured against the
 * lesson's own scene (the oneRoom access point and one saturated uploader).
 *
 * The claims this lesson used to share with tests/course/lesson-claims.test.ts
 * — "DATA→ACK is always exactly one SIFS" and "after every ACK the station
 * waits a DIFS and then draws a fresh backoff" — are re-asserted here beside
 * the sentences that now carry them; the originals stay where they are, so no
 * pin is lost. The lesson never had a `.body!` site in any test.
 */
import { describe, it, expect } from 'vitest'
import { ifs } from '../../src/course/tier1/ifs'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'

const MS = 1_000_000
/** 100 ms: the window the "254 answers" sentence is counted over. */
const RUN_NS = 100 * MS

const recs = (): TLRecord[] => runOf(ifs, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)

lessonShapeSuite(ifs, { proseMax: 850, runNs: RUN_NS })

describe('ifs · the lesson’s own scene', () => {
  it('follows airtime and owns the three waiting times', () => {
    expect(ifs.module).toBe(1)
    expect(ifs.needs).toEqual(['airtime'])
    // the owner table of the readability programme gives this lesson SIFS, DIFS and EIFS;
    // `slot` comes with them, because it is the unit the other two are built from.
    expect(ifs.terms!.map((t) => t.term)).toEqual(['slot', 'SIFS', 'DIFS', 'EIFS'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(ifs.scenario())).not.toThrow()
    expect(ifs.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1'])
  })
})

describe('ifs · the three waits', () => {
  it('a slot is 9 µs, the short gap 16 µs, and the longer one is their sum plus a slot', () => {
    // the table's "slot … 9 µs", "SIFS … 16 µs" and "DIFS … 34 µs = SIFS + 2 slots" rows,
    //  and the picture's "a DIFS, which is the short gap plus two slots"
    expect(SLOT_NS).toBe(9_000)
    expect(SIFS_NS).toBe(16_000)
    expect(DIFS_NS).toBe(34_000)
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
  })

  it('the penalty wait is 94 µs: the short gap, a whole answer and a DIFS', () => {
    // the table's "EIFS … 94 µs = SIFS + ACK + DIFS" row and the picture's "the short gap,
    //  a whole acknowledgement’s worth of air, and a DIFS on top"
    expect(ACK_TX_TIME_6M_NS).toBe(44_000)
    expect(EIFS_NS).toBe(94_000)
    expect(EIFS_NS).toBe(SIFS_NS + ACK_TX_TIME_6M_NS + DIFS_NS)
  })

  it('no station in this scene ever waits an EIFS', () => {
    // "No station in this scene ever waits an EIFS: every frame is either heard cleanly or
    //  not heard at all" and the picture's "Nothing in this scene ever earns one."
    const kinds = ofType(recs(), 'IFS_START').map((r) => r.kind)
    expect(kinds.length).toBeGreaterThan(200)
    expect(new Set(kinds)).toEqual(new Set(['DIFS']))
  })
})

describe('ifs · what that buys in this run', () => {
  it('the uploader’s frame is 248 µs and every one of the 254 answers starts 16 µs later', () => {
    // "The uploader’s frame holds the channel for 248 µs, and its answer starts exactly
    //  16 µs after the frame ends — every one of the 254 answers in this run"
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
    //  experiment "Check that every DIFS in the run lasts 34 µs", and the table row
    //  "326 µs — the DIFS is over, and only now does the station draw its wait"
    const waits = ofType(recs(), 'IFS_START').filter((r) => r.untilNs > r.t)
    expect(waits.length).toBeGreaterThan(200)
    for (const w of waits) expect(w.untilNs - w.t).toBe(DIFS_NS)
    const draws = ofType(recs(), 'BACKOFF_DRAW')
    expect(draws.length).toBeGreaterThan(200)
    for (const d of draws) expect(waits.some((w) => w.untilNs === d.t)).toBe(true)
  })

  it('the first turn runs 0 → 248 → 264 → 292 → 326 → 425 µs', () => {
    // the "One full turn, in order" table, and the observation "The first exchange ends at
    //  292 µs, the DIFS runs to 326 µs, and the next frame does not start until 425 µs —
    //  the station drew eleven slots."
    const data = txs('data')
    const ack = txs('ack')[0]
    expect(data[0].t).toBe(0)
    expect(data[0].t + data[0].frame.txTimeNs).toBe(248_000)
    expect(ack.t).toBe(264_000)
    expect(ack.t + ack.frame.txTimeNs).toBe(292_000)
    const difs = ofType(recs(), 'IFS_START').find((r) => r.t === 292_000)!
    expect(difs.kind).toBe('DIFS')
    expect(difs.untilNs).toBe(326_000)
    const draw = ofType(recs(), 'BACKOFF_DRAW')[0]
    expect(draw.t).toBe(326_000)
    expect(draw.value).toBe(11)
    expect(data[1].t).toBe(425_000)
    expect(326_000 + 11 * SLOT_NS).toBe(425_000)
  })
})
