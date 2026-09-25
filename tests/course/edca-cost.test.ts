/**
 * Every empirical claim in "What the head start costs, and who pays it" — the
 * second half of `edca`, split on 2026-09-25.
 *
 * It borrows the parent's scene rather than declaring one of its own, so
 * `lessonShapeSuite(..., { sameSceneAs: 'edca' })` proves the two ids replay the
 * same timeline and its recorded hash is a copy rather than a new run.
 *
 * What moved here with the prose (§6 of the re-pacing plan, "~5 → edca-cost,
 * plus the EIFS pin arriving from `ifs`"): the three-station table (the draws,
 * the means, the queue waits), the 103 µs punishment wait and the census of who
 * ever owes one, the backup's first frame at 55 ms, and the EDCA-off experiment.
 * The EIFS constants themselves are still pinned in tests/course/ifs.test.ts
 * ("MOVED CLAIM, PIN HELD") because this lesson was not registered when that
 * batch landed; they are re-pinned here beside the run that shows them, and the
 * controller can retire that block when it registers this id.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. The terminology rule is therefore re-run here over this one lesson, with
 * the same helpers tests/course/readability.test.ts uses.
 */
import { describe, it, expect } from 'vitest'
import { edcaCost } from '../../src/course/tier2/edca-cost'
import { edca } from '../../src/course/tier2/edca'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS, EDCA_PARAMS, OFDM_5G, SIFS_NS, aifsNs } from '../../src/engine/phy'
import { MODULES, trackOf } from '../../src/course/curriculum'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window the draws, the queue waits and the seven EIFS are counted over. */
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(edcaCost, undefined, RUN_NS)
const draws = (rs: TLRecord[], node: string) => ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === node)
const ifsLens = (rs: TLRecord[], node: string, kind: string) =>
  ofType(rs, 'IFS_START').filter((r) => r.node === node && r.kind === kind).map((r) => r.untilNs - r.t)
const firstData = (rs: TLRecord[], node: string) =>
  ofType(rs, 'TX_START').find((r) => r.node === node && r.frame.kind === 'data')!

/** Mean time from a frame being queued to leaving the queue, in µs — the "mean queue wait" column. */
const meanQueueWait = (rs: TLRecord[], node: string): number => {
  const enq = new Map<number, number>()
  const ds: number[] = []
  for (const r of rs) {
    if (r.type === 'ENQUEUE' && r.node === node) enq.set(r.msduId, r.t)
    if (r.type === 'DEQUEUE' && r.node === node && enq.has(r.msduId)) ds.push(r.t - enq.get(r.msduId)!)
  }
  expect(ds.length, node).toBeGreaterThan(5)
  return ds.reduce((a, b) => a + b, 0) / ds.length / US
}

const runSc = (sc: ReturnType<typeof edcaCost.scenario>): TLRecord[] => [...new Simulation(sc).runUntil(RUN_NS).records]

lessonShapeSuite(edcaCost, { sameSceneAs: 'edca', runNs: RUN_NS })

describe('edca-cost · the lesson’s own scene', () => {
  it('follows its parent in the QoS module and takes the EIFS word from `ifs`', () => {
    expect(MODULES[edcaCost.module].title).toBe('QoS 与效率')
    expect(MODULES[edcaCost.module].title).toBe(MODULES[edca.module].title)
    expect(edcaCost.needs).toEqual(['edca'])
    expect(edcaCost.terms!.map((t) => t.term)).toEqual(['EIFS'])
  })

  it('is the parent’s scene, undivided, and neither half declares a variant', () => {
    const sc = edcaCost.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc).toEqual(edca.scenario())
    expect(edcaCost.variants).toBeUndefined()
    expect(edca.variants).toBeUndefined()
  })
})

describe('edca-cost · what the three stations actually did', () => {
  const rs = recs()

  it('the "Draws" and "Mean drawn" columns are 33 / 107 / 14 and 2.2 / 7.9 / 8.2', () => {
    const mean = (node: string) => {
      const d = draws(rs, node)
      return (d.reduce((a, r) => a + r.value, 0) / d.length).toFixed(1)
    }
    expect([draws(rs, 'sta-1').length, draws(rs, 'sta-2').length, draws(rs, 'sta-3').length])
      .toEqual([33, 107, 14])
    expect([mean('sta-1'), mean('sta-2'), mean('sta-3')]).toEqual(['2.2', '7.9', '8.2'])
  })

  it('the "Mean queue wait" column is 1.49, 2.23 and 10.23 ms', () => {
    const ms = (node: string) => (meanQueueWait(rs, node) / 1000).toFixed(2)
    expect([ms('sta-1'), ms('sta-2'), ms('sta-3')]).toEqual(['1.49', '2.23', '10.23'])
    // "its frames sit in their queue many times longer than the call's do" (picture) and
    // "about seven times longer" (the paragraph under the table)
    const ratio = meanQueueWait(rs, 'sta-3') / meanQueueWait(rs, 'sta-1')
    expect(ratio).toBeGreaterThan(6)
    expect(ratio).toBeLessThan(7.5)
  })

  it('the table’s silences and the 45 µs the bill starts from are the engine’s parameters', () => {
    // the table's "Silence" column, and "the shorter silence (45 µs, five slots) plus the
    // narrower range (2.2 slots on average instead of 8.2)"
    expect(new Set(ifsLens(rs, 'sta-1', 'AIFS'))).toEqual(new Set([34 * US]))
    expect(new Set(ifsLens(rs, 'sta-3', 'AIFS'))).toEqual(new Set([79 * US]))
    expect(new Set(ifsLens(rs, 'sta-2', 'AIFS'))).toEqual(new Set([0, 43 * US]))
    expect(79 * US - 34 * US).toBe(45 * US)
    expect((79 - 34) / (OFDM_5G.slotNs / US)).toBe(5)
    // the first observation: AC_BK never draws from a window narrower than 15
    for (const d of draws(rs, 'sta-3')) expect(d.cw).toBeGreaterThanOrEqual(15)
    expect(new Set(draws(rs, 'sta-3').map((d) => d.ac))).toEqual(new Set([0]))
  })

  it('the backup speaks first at 55 ms, the uploader at 0.088 ms, the caller at 23 ms', () => {
    // the first watch call-out, and jump 0
    expect(Math.round(firstData(rs, 'sta-3').t / MS)).toBe(55)
    expect(firstData(rs, 'sta-2').t / MS).toBe(0.088)
    expect(Math.round(firstData(rs, 'sta-1').t / MS)).toBe(23)
    for (const j of edcaCost.jumps) expect(rs.some(j.find), j.label).toBe(true)
  })
})

describe('edca-cost · the longer wait, and who ever owes one', () => {
  const rs = recs()

  it('step 3: EIFS is 94 µs — the short gap, a whole answer at 6 Mb/s, and a DIFS', () => {
    // MOVED CLAIM. `ifs` printed these three numbers and nothing in its scene ever armed one;
    // this is the lesson with the record, and the sum is the engine's own EIFS_NS.
    expect(ACK_TX_TIME_6M_NS).toBe(44_000)
    expect(EIFS_NS).toBe(94_000)
    expect(EIFS_NS).toBe(SIFS_NS + ACK_TX_TIME_6M_NS + DIFS_NS)
    expect([SIFS_NS, DIFS_NS, ACK_TX_TIME_6M_NS].map((n) => n / US)).toEqual([16, 34, 44])
  })

  it('step 2: the uploader’s punishment wait is 94 − 34 + 43 = 103 µs, every time', () => {
    expect((OFDM_5G.eifsNs - OFDM_5G.difsNs + aifsNs(3, OFDM_5G)) / US).toBe(103)
    expect(new Set(ifsLens(rs, 'sta-2', 'EIFS'))).toEqual(new Set([103 * US]))
    // the uploader is the BE station, which is where the 43 comes from
    expect(EDCA_PARAMS.find((p) => p.name === 'BE')!.aifsn).toBe(3)
    expect(new Set(draws(rs, 'sta-2').map((d) => d.ac))).toEqual(new Set([1]))
  })

  it('seven of them, all the uploader’s, each behind a reception that failed', () => {
    // "300 ms in, only the uploader ever met a frame it could not decode — seven times; the
    // caller and the backup, zero each", and step 1's list of reasons channel.ts can give.
    const eifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-2' && r.kind === 'EIFS')
    expect(eifs).toHaveLength(7)
    expect(ifsLens(rs, 'sta-1', 'EIFS')).toEqual([])
    expect(ifsLens(rs, 'sta-3', 'EIFS')).toEqual([])
    for (const e of eifs) {
      const fail = ofType(rs, 'RX_FAIL').filter((r) => r.node === 'sta-2' && r.t <= e.t).at(-1)!
      expect(fail, 'an EIFS with no failed reception behind it').toBeDefined()
      expect(['collision', 'lowSinr', 'txDuringRx', 'capture']).toContain(fail.reason)
    }
    // the second watch call-out: the first one is at 23.1912 ms, and the reception that
    // earned it failed at that same instant
    expect(eifs[0].t / MS).toBe(23.1912)
    expect((eifs[0].untilNs - eifs[0].t) / US).toBe(103)
    const first = ofType(rs, 'RX_FAIL').find((r) => r.node === 'sta-2')!
    expect(first.t).toBe(eifs[0].t)
    expect(first.reason).toBe('collision')
  })
})

describe('edca-cost · the experiment', () => {
  it('turning EDCA off on the caller drops it to one queue and about 2.5× the wait', () => {
    // "It falls back to one queue with the old fixed wait and the old wide window, and its
    // frames wait about two and a half times longer."
    const sc = edcaCost.scenario()
    const caller = sc.nodes.find((n) => n.id === 'sta-1')!
    caller.caps.features = { ...caller.caps.features, edca: false }
    const off = runSc(sc)
    expect(new Set(ifsLens(off, 'sta-1', 'DIFS').filter((x) => x > 0))).toEqual(new Set([34 * US]))
    expect(ifsLens(off, 'sta-1', 'AIFS')).toEqual([])
    for (const d of draws(off, 'sta-1')) expect(d.cw).toBeGreaterThanOrEqual(15)
    const ratio = meanQueueWait(off, 'sta-1') / meanQueueWait(recs(), 'sta-1')
    expect(ratio).toBeGreaterThan(2.3)
    expect(ratio).toBeLessThan(2.6)
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('edca-cost · every official term carries its English name', () => {
  const zh = [edcaCost.why!, ...edcaCost.outcomes!]
    .concat(paragraphTexts(edcaCost.picture!), cellTexts(edcaCost.picture!))
    .concat(paragraphTexts(edcaCost.numbers!), cellTexts(edcaCost.numbers!))
    .concat(edcaCost.observe, edcaCost.tryThis, edcaCost.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(edcaCost))

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
