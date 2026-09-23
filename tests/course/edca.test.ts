/**
 * Every empirical claim in "EDCA — four queues, four personalities", measured
 * against the lesson's own scenario.
 *
 * The lesson had no test file of its own before the readability rewrite: its
 * pins lived in tests/course/lesson-claims.test.ts ("lesson 7 · EDCA" and the
 * two-voice-queues experiment), which still holds them and still passes. What
 * this file adds is the rest of the rewritten text — the two tables, the 45 µs
 * head start, the queue waits and the three observations — each asserted
 * against the record it names. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { edca } from '../../src/course/tier2/edca'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, aifsNs } from '../../src/engine/phy'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(edca, undefined, RUN_NS)
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

const runSc = (sc: ReturnType<typeof edca.scenario>): TLRecord[] => [...new Simulation(sc).runUntil(RUN_NS).records]

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The run is 300 ms: the backup's first frame, which jump 1 finds, is 55 ms in.
lessonShapeSuite(edca, { proseMax: 1250, runNs: RUN_NS })

describe('edca · the lesson’s own scene', () => {
  it('is the first lesson of Tier 2, and leans on the two channel-access lessons', () => {
    expect(edca.module).toBe(2)
    expect(edca.needs).toEqual(['ifs', 'backoff', 'retries-queues'])
    expect(edca.terms!.map((t) => t.term)).toEqual(['EDCA', 'access category', 'AIFS'])
  })

  it('the scenario is one room, one access point and three single-class stations', () => {
    const sc = edca.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => [n.id, n.profiles[0]])).toEqual([
      ['ap', 'idle'], ['sta-1', 'voice'], ['sta-2', 'saturated'], ['sta-3', 'backup'],
    ])
    // "every station here runs a single class" (deeper), which is why no internal collision occurs
    for (const n of sc.nodes) expect(n.profiles).toHaveLength(1)
    expect(ofType(recs(), 'INTERNAL_COLLISION')).toHaveLength(0)
  })
})

describe('edca · what each class is given', () => {
  it('the table’s four silences and four first draws are the engine’s own parameters', () => {
    // "Silence first": VO 34, VI 34, BE 43, BK 79 µs — and "First draw from": 0–3, 0–7, 0–15, 0–15
    const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
    expect(EDCA_PARAMS.map((p) => p.name)).toEqual(['BK', 'BE', 'VI', 'VO'])
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => aifsNs(p.aifsn, OFDM_5G) / US))
      .toEqual([34, 34, 43, 79])
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => p.cwMin)).toEqual([3, 7, 15, 15])
    // the two columns the mechanism rewrite added: "AIFSN (slots of silence)" and
    // "Doubling up to CWmax (the largest)"
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => p.aifsn)).toEqual([2, 2, 3, 7])
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => p.cwMax)).toEqual([7, 15, 1023, 1023])
  })

  it('the six steps are the order the MAC takes them in, with its own constants', () => {
    // step 2: AIFS = SIFS + AIFSN x slot, and the old fixed wait is the same sum at AIFSN 2
    expect(aifsNs(2, OFDM_5G)).toBe(OFDM_5G.sifsNs + 2 * OFDM_5G.slotNs)
    expect(OFDM_5G.difsNs).toBe(aifsNs(2, OFDM_5G))
    // step 3: the longer wait after a frame that could not be decoded
    expect((OFDM_5G.eifsNs - OFDM_5G.difsNs + aifsNs(3, OFDM_5G)) / US).toBe(103)
    // step 4: the draw starts from CWmin, and step 6 doubles towards CWmax
    for (const p of EDCA_PARAMS) expect(p.cwMax).toBeGreaterThanOrEqual(p.cwMin)
  })

  it('the formula is SIFS + n slots, with n = 2, 3 and 7 the only values in play', () => {
    // "silence = SIFS + n × slot = 16 + n × 9 µs,  n = 2, 3 or 7"
    expect(OFDM_5G.sifsNs / US).toBe(16)
    expect(OFDM_5G.slotNs / US).toBe(9)
    expect([...new Set(EDCA_PARAMS.map((p) => p.aifsn))].sort()).toEqual([2, 3, 7])
    expect(aifsNs(2, OFDM_5G)).toBe(34 * US)
    // "the old one-size-fits-all wait was this same sum with n fixed at two"
    expect(OFDM_5G.difsNs).toBe(aifsNs(2, OFDM_5G))
  })
})

describe('edca · what the three stations actually did', () => {
  const rs = recs()

  it('each station keeps one class, one silence and that class’s two windows', () => {
    // the run table's "Class", "Silence" columns, and the first observation
    expect(new Set(draws(rs, 'sta-1').map((d) => d.ac))).toEqual(new Set([3]))
    expect(new Set(draws(rs, 'sta-2').map((d) => d.ac))).toEqual(new Set([1]))
    expect(new Set(draws(rs, 'sta-3').map((d) => d.ac))).toEqual(new Set([0]))
    // "never wider than 7" / "never narrower than 15, above a silence of 79 µs"
    for (const d of draws(rs, 'sta-1')) expect([3, 7]).toContain(d.cw)
    for (const d of draws(rs, 'sta-3')) expect(d.cw).toBeGreaterThanOrEqual(15)
    expect(new Set(ifsLens(rs, 'sta-1', 'AIFS'))).toEqual(new Set([34 * US]))
    expect(new Set(ifsLens(rs, 'sta-3', 'AIFS'))).toEqual(new Set([79 * US]))
    // the uploader's own AIFS is 43 µs; the zero-length one is the in-burst case, not a wait
    expect(new Set(ifsLens(rs, 'sta-2', 'AIFS'))).toEqual(new Set([0, 43 * US]))
  })

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
    // "about seven times longer" (third observation)
    const ratio = meanQueueWait(rs, 'sta-3') / meanQueueWait(rs, 'sta-1')
    expect(ratio).toBeGreaterThan(6)
    expect(ratio).toBeLessThan(7.5)
  })

  it('the head start is 45 µs, five slots the backup may not count in', () => {
    // "The head start, measured": "45 µs of silence — five slots"
    expect(79 * US - 34 * US).toBe(45 * US)
    expect((79 - 34) / (OFDM_5G.slotNs / US)).toBe(5)
  })

  it('only the uploader ever owes the 103 µs punishment wait', () => {
    // "its punishment wait is 103 µs: the old penalty, minus the old fixed wait, plus its own
    // class wait" — and "The backup never collects one"
    expect(new Set(ifsLens(rs, 'sta-2', 'EIFS'))).toEqual(new Set([103 * US]))
    expect(ifsLens(rs, 'sta-1', 'EIFS')).toEqual([])
    expect(ifsLens(rs, 'sta-3', 'EIFS')).toEqual([])
    expect((OFDM_5G.eifsNs - OFDM_5G.difsNs + aifsNs(3, OFDM_5G)) / US).toBe(103)
    // Whole-track review I2: what earns that longer wait is a reception the ratio did not
    // carry — RX_FAIL, with one of the reasons channel.ts can produce — never a failed
    // checksum. `ifs` and `nav` now say so in the same words this step does.
    const eifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-2' && r.kind === 'EIFS')
    expect(eifs.length).toBeGreaterThan(0)
    for (const e of eifs) {
      const fail = ofType(rs, 'RX_FAIL').filter((r) => r.node === 'sta-2' && r.t <= e.t).at(-1)!
      expect(fail, 'an EIFS with no failed reception behind it').toBeDefined()
      expect(['collision', 'lowSinr', 'txDuringRx', 'capture']).toContain(fail.reason)
    }
  })
})

describe('edca · the caller’s first voice frame, run through the steps', () => {
  const rs = recs()

  it('every row of the worked example is that access, record by record', () => {
    const tx = firstData(rs, 'sta-1')
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-1' && r.kind === 'AIFS' && r.t < tx.t).at(-1)!
    // "the air goes idle again" / "AIFS for this class = 16 + 2 x 9" / "so the counter may start at"
    expect(ifs.t / MS).toBe(23.0816)
    expect((ifs.untilNs - ifs.t) / US).toBe(34)
    expect(ifs.untilNs / MS).toBe(23.1156)
    // "draw between 0 and the smallest window, 3" -> 2
    const draw = draws(rs, 'sta-1').filter((d) => d.t <= tx.t).at(-1)!
    expect([draw.t, draw.value, draw.cw]).toEqual([ifs.untilNs, 2, 3])
    // "the end of the AIFS is a slot boundary" (2 -> 1) and "one more idle slot, 9 µs" (1 -> 0)
    const decs = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-1' && r.t >= draw.t && r.t <= tx.t)
    expect(decs.map((d) => [d.t / MS, d.value])).toEqual([[23.1156, 1], [23.1246, 0]])
    expect(decs[1].t - decs[0].t).toBe(OFDM_5G.slotNs)
    // "a counter already at zero waits one more boundary, 9 µs" — the row the whole-track
    // review found missing: without it the table went 23.1156 + 9 µs = 23.1246 and the
    // reader's arithmetic could not reach the answer. The closure, not just the endpoints:
    expect(tx.t - decs[1].t).toBe(OFDM_5G.slotNs)
    expect((decs[1].t + OFDM_5G.slotNs) / MS).toBe(23.1336)
    // "the voice frame goes out at"
    expect(tx.t / MS).toBe(23.1336)
    // "a background queue starting at the same instant would still owe 27 µs"
    expect((aifsNs(7, OFDM_5G) - (tx.t - ifs.t)) / US).toBe(27)
  })
})

describe('edca · the observations and the experiments', () => {
  const rs = recs()

  it('the backup speaks first at 55 ms, the uploader at 0.088 ms, the caller at 23 ms', () => {
    // second observation, and the jump "first background frame"
    expect(Math.round(firstData(rs, 'sta-3').t / MS)).toBe(55)
    expect(firstData(rs, 'sta-2').t / MS).toBe(0.088)
    expect(Math.round(firstData(rs, 'sta-1').t / MS)).toBe(23)
    for (const j of edca.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
  })

  it('turning EDCA off on the caller drops it to one queue and about 2.5× the wait', () => {
    // "It falls back to one queue with the old fixed wait and the old wide window, and its
    // frames wait about two and a half times longer."
    const sc = edca.scenario()
    const caller = sc.nodes.find((n) => n.id === 'sta-1')!
    caller.caps.features = { ...caller.caps.features, edca: false }
    const off = runSc(sc)
    expect(new Set(ifsLens(off, 'sta-1', 'DIFS').filter((x) => x > 0))).toEqual(new Set([34 * US]))
    expect(ifsLens(off, 'sta-1', 'AIFS')).toEqual([])
    for (const d of draws(off, 'sta-1')) expect(d.cw).toBeGreaterThanOrEqual(15)
    const ratio = meanQueueWait(off, 'sta-1') / meanQueueWait(rs, 'sta-1')
    expect(ratio).toBeGreaterThan(2.3)
    expect(ratio).toBeLessThan(2.6)
  })

  it('making the uploader a second voice station raises the caller’s collision rate', () => {
    // "two voice queues now draw from the same tiny range, and they collide with each other far
    // more often than before" — the same claim lesson-claims.test.ts pins over 1 000 ms.
    const sc = edca.scenario()
    sc.nodes.find((n) => n.id === 'sta-2')!.profiles = ['voice']
    const rate = (x: TLRecord[]) => ofType(x, 'COLLISION').filter((c) => c.nodes.includes('sta-1')).length
      / ofType(x, 'TX_START').filter((r) => r.node === 'sta-1' && r.frame.kind === 'data').length
    expect(rate(runSc(sc))).toBeGreaterThan(1.3 * rate(rs))
  })
})
