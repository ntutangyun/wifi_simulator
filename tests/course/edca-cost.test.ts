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
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { wanRtt } from '../../src/course/tier2/wan-rtt'
import { edcaCost } from '../../src/course/tier2/edca-cost'
import { edca } from '../../src/course/tier2/edca'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import {
  ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS, EDCA_PARAMS, ERP_2G, OFDM_5G, SIFS_NS, aifsNs,
} from '../../src/engine/phy'
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
    /*
     * **The first watch call-out, read out of the lesson.** 「跳到备份站点的第一帧：它落在整轮
     * 的第 55 ms。上传站点从 0.088 ms 起就一直在发，通话站点第一次发送是在 23 ms」 — three
     * instants, uncovered by the 「第」 rule change of 2026-10-14, and until now asserted with
     * the three figures typed on this side. Each is read against the first data frame of the
     * station the sentence names, at the precision it is printed to, and their ORDER is read
     * too: the whole point of the call-out is that the backup is last.
     */
    const pic = edcaCost.picture!.map((b) => (b as { text?: string }).text ?? '').join(' ')
    const w = /跳到备份站点的第一帧：它落在整轮的第 (\d+) ms。上传站点从 ([\d.]+) ms 起就一直在发，通话站点第一次发送是在 (\d+) ms/
      .exec(pic)
    expect(w, 'the watch call-out on the three first frames is gone').not.toBeNull()
    const firsts = { backup: firstData(rs, 'sta-3').t, upload: firstData(rs, 'sta-2').t,
      call: firstData(rs, 'sta-1').t }
    /** The printed figure, at exactly the decimals it is printed to. */
    const printed = (fig: string, ns: number, what: string): void => {
      const dp = (fig.split('.')[1] ?? '').length
      expect(Number(fig), what).toBe(Number((ns / MS).toFixed(dp)))
    }
    printed(w![1]!, firsts.backup, 'when the backup station first gets on the air')
    printed(w![2]!, firsts.upload, 'when the uploader does')
    printed(w![3]!, firsts.call, 'and when the caller does')
    expect(firsts.upload, 'the uploader is on the air before the caller').toBeLessThan(firsts.call)
    expect(firsts.call, 'and the caller before the backup').toBeLessThan(firsts.backup)
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

/**
 * **The ruler for this lesson's `until: 'wan-rtt'` (criterion B, tests/course/limits.test.ts).**
 *
 * The limit used to claim 「引擎之上什么都没有」, an absolute statement about the ENGINE, and it
 * was false from the day the cloud-server layer landed. It was narrowed to a statement about
 * THIS lesson's scenes, which is what makes `out-of-scope` the honest kind, and the promise
 * then needs an axis: the top-level `servers` section.
 *
 * So this measures both ends of that axis rather than asserting that somebody thought about it.
 * Here: every scene this lesson ships has an empty `servers`, so no WAN record can exist.
 * There: `wan-rtt`'s own scene carries exactly one server and emits both WAN record types
 * inside 200 ms. The promise is 「那一课把这一层打开」, and these are the two numbers that say
 * it is kept.
 */
describe('edca-cost · the axis behind its `until: wan-rtt`', () => {
  const scenesOf = (l: { scenario: () => Scenario; variants?: { scenario: () => Scenario }[] }): Scenario[] =>
    [l.scenario(), ...(l.variants ?? []).map((v) => v.scenario())]

  it('promises a lift it does not itself make: every scene here has no server at all', () => {
    const mine = scenesOf(edcaCost)
    expect(mine.length).toBeGreaterThan(0)
    for (const s of mine) expect(s.servers, 'a scene of this lesson carries a server').toEqual([])
    const lim = edcaCost.limits.find((x) => x.until === 'wan-rtt')
    expect(lim, 'the limit that carries the promise').toBeDefined()
    expect(lim!.kind, 'criterion A: only an out-of-scope limit may be lifted').toBe('out-of-scope')
  })

  it('and the lesson it points at really opens that section, measured on both sides', () => {
    expect(wanRtt.scenario().servers.length, 'wan-rtt ships exactly one cloud endpoint').toBe(1)
    const kinds = (s: Scenario): Set<string> => new Set([...new Simulation(s).runUntil(200 * 1_000_000).records]
      .filter((r) => r.type === 'WAN_TX' || r.type === 'WAN_RX').map((r) => r.type))
    expect([...kinds(wanRtt.scenario())].sort(), 'both WAN record types inside 200 ms')
      .toEqual(['WAN_RX', 'WAN_TX'])
    for (const s of scenesOf(edcaCost)) expect(kinds(s).size, 'a WAN record in a scene with no server').toBe(0)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect([ms('sta-1'), …]).toEqual(['1.49', '2.23', '10.23'])` — with the lesson's column
 * quoted in a comment. So the engine is pinned and the prose is not: the sampling sweep of
 * 2026-10-12 planted six of this lesson's figures and **all six went unnoticed**. Here every
 * figure is parsed out of the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the three-station table is read row by row, by the class each row names.** The silence is
 *    `aifsNs` of that class's own AIFSN, the draws and the mean drawn are that station's own
 *    records, and the queue wait is the same mean this file computes for the column.
 *  - **the punishment wait is read as the subtraction the step prints.** 「94 − 34 + 43 = 103
 *    µs」 is EIFS, DIFS and this class's AIFS, each from the engine, and the sum has to be the
 *    length of the waits the run really arms — all seven of them.
 *  - **EIFS is read as its own three terms**: 「16 + 34 + 44 = 94 µs」 against `SIFS_NS`,
 *    `DIFS_NS` and `ACK_TX_TIME_6M_NS`, with the mandatory rate that last one is timed at.
 *  - **the bill's two inputs are read as the difference and the ratio they are**: 「45 µs，五个
 *    时隙」 is the gap between the two silences in slots, and 「平均抽到 2.2 个时隙，而不是 8.2
 *    个」 is the two mean draws — the two halves of why one queue waits seven times longer.
 */
describe('edca-cost · every figure the prose prints, read back out of it', () => {
  const rs = recs()
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const OUT = (edcaCost.outcomes ?? []).join('\n')
  const PIC = blockText(edcaCost.picture)
  const NUMS = blockText(edcaCost.numbers)
  const LIM = blockText(edcaCost.limits)
  const OBS = blockText(edcaCost.observe)
  const QUIZ = blockText(edcaCost.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
  const table = (): { heading?: string; rows: string[][] } =>
    edcaCost.numbers!.find((b) => b.kind === 'table') as unknown as
      { heading?: string; rows: string[][] }
  /** Which station a row of the table is about, by the words the row itself uses. */
  const nodeOf = (label: string): string => {
    const hit = ([['通话', 'sta-1'], ['上传', 'sta-2'], ['备份', 'sta-3']] as const)
      .find(([word]) => label.includes(word))
    expect(hit, `no station named by 「${label}」`).toBeDefined()
    return hit![1]
  }
  const meanDrawn = (node: string): number => {
    const d = draws(rs, node)
    return d.reduce((a, r) => a + r.value, 0) / d.length
  }

  it('reads the three-station table row by row, by the class each row names', () => {
    const t = table()
    expect(t.rows, 'one row per station of the scene').toHaveLength(3)
    for (const row of t.rows) {
      const node = nodeOf(row[0]!)
      const ac = row[1]!
      const p = by(ac)
      expect(p, `${row[0]} really runs ${ac}`).toBeDefined()
      expect(new Set(draws(rs, node).map((d) => d.ac)), `${node} keeps one class`)
        .toEqual(new Set([EDCA_PARAMS.indexOf(p)]))
      const [silence] = figs(row[2]!, /^(\d+) µs$/, `${node}’s silence`)
      expect(silence! * US, `which is ${ac}’s own AIFS`).toBe(aifsNs(p.aifsn, OFDM_5G))
      expect([...new Set(ifsLens(rs, node, 'AIFS'))].filter((x) => x > 0),
        `and the silence ${node} really waits`).toEqual([silence! * US])
      const [count] = figs(row[3]!, /^(\d+)$/, `${node}’s draws`)
      expect(count, `the draws ${node} makes`).toBe(draws(rs, node).length)
      same(raw(row[4]!, /^([\d.]+)$/, `${node}’s mean draw`)[0]!, meanDrawn(node),
        `what ${node} draws on average`)
      same(raw(row[5]!, /^([\d.]+) ms$/, `${node}’s queue wait`)[0]!,
        meanQueueWait(rs, node) / 1000, `how long ${node}’s frames wait`)
    }
  })

  it('reads the bill’s two inputs, and the ratio they come to', () => {
    // 「更短的那段静默（45 µs，五个时隙）加上更窄的抽取范围（平均抽到 2.2 个时隙，而不是 8.2 个）」
    const [gapUs, slotsCn] = raw(NUMS, /更短的那段静默（(\d+) µs，(.)个时隙）/, '`numbers` on the gap')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    expect(val(gapUs!) * US, 'the gap between the two silences')
      .toBe(aifsNs(by('BK').aifsn, OFDM_5G) - aifsNs(by('VO').aifsn, OFDM_5G))
    expect(cn(slotsCn!), 'which is that many slots').toBe(val(gapUs!) / (OFDM_5G.slotNs / US))
    const [narrow, wide] = figs(NUMS, /平均抽到 ([\d.]+) 个时隙，而不是 ([\d.]+) 个/,
      '`numbers` on the two mean draws')
    same(String(narrow), meanDrawn('sta-1'), 'what the call draws on average')
    same(String(wide), meanDrawn('sta-3'), 'against what the backup draws')
    // 「通话的帧平均等 1.49 ms，备份的帧平均等 10.23 ms，约七倍」
    const [callMs, backMs, timesCn] = raw(NUMS,
      /通话的帧平均等 ([\d.]+) ms，备份的帧平均等 ([\d.]+) ms，约(.)倍/, '`numbers` on the two waits')
    same(callMs!, meanQueueWait(rs, 'sta-1') / 1000, 'the call’s own wait')
    same(backMs!, meanQueueWait(rs, 'sta-3') / 1000, 'and the backup’s')
    expect(Math.round(meanQueueWait(rs, 'sta-3') / meanQueueWait(rs, 'sta-1')),
      'the ratio, to the nearest whole number').toBe(cn(timesCn!))
    // 「而备份站点在 300 ms 里只抽了 14 次倒数」
    const [windowMs, backDraws] = figs(NUMS, /而备份站点在 (\d+) ms 里只抽了 (\d+) 次倒数/,
      '`numbers` on the backup’s draws')
    expect(windowMs! * MS, 'the window every figure of this lesson is measured over').toBe(RUN_NS)
    expect(backDraws, 'and the draws it makes in it').toBe(draws(rs, 'sta-3').length)
  })

  it('reads the punishment wait as the subtraction the step prints', () => {
    // 「上传站点属于 BE 类，于是 94 − 34 + 43 = 103 µs」
    const [eifs, difs, aifs, total] = figs(NUMS,
      /于是 (\d+) − (\d+) \+ (\d+) = (\d+) µs/, 'the step on the longer wait')
    expect(eifs! * US, 'the extended space the engine applies').toBe(EIFS_NS)
    expect(difs! * US, 'the one it replaces').toBe(DIFS_NS)
    expect(aifs! * US, 'and this class’s own space').toBe(aifsNs(by('BE').aifsn, OFDM_5G))
    expect(eifs! - difs! + aifs!, 'the sum the step prints').toBe(total)
    expect(total! * US, 'which is what the engine really arms')
      .toBe(OFDM_5G.eifsNs - OFDM_5G.difsNs + aifsNs(by('BE').aifsn, OFDM_5G))
    // 「EIFS 本身 = SIFS + DIFS + …发完一个确认帧的时间 = 16 + 34 + 44 = 94 µs」
    const [sifs, difs2, ack, eifs2] = figs(NUMS, /= (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/,
      'the step on EIFS itself')
    expect([sifs! * US, difs2! * US, ack! * US], 'its three terms')
      .toEqual([SIFS_NS, DIFS_NS, ACK_TX_TIME_6M_NS])
    expect(sifs! + difs2! + ack!, 'the sum it comes to').toBe(eifs2)
    expect(eifs2, 'which is the same EIFS the step above uses').toBe(eifs)
    // 「用最低强制速率——这里是 6 Mb/s——发完一个确认帧」
    const [mbps] = figs(NUMS, /这里是 (\d+) Mb\/s/, 'the step on the mandatory rate')
    const [limMbps] = figs(LIM, /的确认帧一律按 (\d+) Mb\/s 算/, '`limits` on the same rate')
    expect(limMbps, 'the same rate `limits` names').toBe(mbps)
    const [limAck] = figs(LIM, /EIFS 里那个 (\d+) µs 的确认帧/, '`limits` on the answer’s own length')
    expect(limAck! * US, 'the answer the engine times at that rate').toBe(ACK_TX_TIME_6M_NS)
    // 「300 ms 里只有上传站点碰上过解不出来的帧，一共七次，每次都要多等一段 103 µs」
    const [msWindow, timesCn2, waitUs] = raw(NUMS,
      /(\d+) ms 里只有上传站点碰上过解不出来的帧，一共(.)次，每次都要多等一段 (\d+) µs/,
      '`numbers` on who ever owes one')
    expect(val(msWindow!) * MS, 'the same window').toBe(RUN_NS)
    /*
     * **The longer wait is its own kind of record**: the engine arms it as an `EIFS`, not as a
     * longer `AIFS`, which is why counting `AIFS` records of that length finds none.
     */
    const longer = ifsLens(rs, 'sta-2', 'EIFS')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    expect(longer.length, 'the longer waits the uploader really serves').toBe(cn(timesCn2!))
    expect(new Set(longer), 'each of them that long').toEqual(new Set([val(waitUs!) * US]))
    expect(val(waitUs!), 'which is the sum the step printed').toBe(total)
    for (const node of ['sta-1', 'sta-3']) {
      expect(ifsLens(rs, node, 'EIFS'), `${node} never owes one`).toEqual([])
    }
    // the outcome line and `picture` print the same figure, and the quiz contrasts it
    const [outUs] = figs(OUT, /那 (\d+) µs 是怎么算的/, 'the outcome line’s own figure')
    expect(outUs, 'the same wait').toBe(total)
    const [picMs, picUs, picPlain] = figs(PIC,
      /：([\d.]+) ms 处它开始了一段 (\d+) µs 的等待，比它那一类平时的 (\d+) µs 长得多/,
      '`picture` on the first one')
    const armed = ofType(rs, 'IFS_START')
      .filter((r) => r.node === 'sta-2' && r.kind === 'EIFS')
    expect(armed.length, 'the run really arms one').toBeGreaterThan(0)
    same(String(picMs), armed[0]!.t / MS, 'when the first longer wait starts')
    expect(picUs, 'how long it is').toBe(total)
    expect(picPlain! * US, 'against what that class waits the rest of the time')
      .toBe(aifsNs(by('BE').aifsn, OFDM_5G))
    const [qLong, qPlain] = figs(QUIZ, /这里是 (\d+) µs，而不是 (\d+) µs/, 'the quiz on the two waits')
    expect([qLong, qPlain], 'the same two figures').toEqual([total, picPlain])
  })

  it('reads the rest of `limits`: the constants it names and the clock it quotes', () => {
    /*
     * **Seven of this lesson's figures live in `limits` alone** (sweep of 2026-10-14), and most
     * of them are a second printing of something the steps already state. The two that are not
     * are read here against the engine file the entry names and the traffic generator it
     * describes.
     */
    const PHY_SRC = readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8')
    const TRAFFIC_SRC = readFileSync(new URL('../../src/engine/traffic.ts', import.meta.url), 'utf8')
    // 「那 103 µs 是引擎三个常数拼出来的」 — a fourth printing of the longer wait
    const [again] = figs(LIM, /那 (\d+) µs 是引擎三个常数拼/, '`limits` on the longer wait')
    expect(again! * US, 'the same wait the steps add up')
      .toBe(OFDM_5G.eifsNs - OFDM_5G.difsNs + aifsNs(by('BE').aifsn, OFDM_5G))
    // 「phy.ts 的 ACK_TX_TIME_6M_NS」 — the 6 inside the identifier, which the file really exports
    const [nameRate] = figs(LIM, /ACK_TX_TIME_(\d)M_NS/, '`limits` on the constant it names')
    expect(PHY_SRC, 'the identifier `phy.ts` really exports')
      .toContain(`export const ACK_TX_TIME_${nameRate}M_NS`)
    expect(nameRate, 'and the rate in its name is the mandatory one the step quotes')
      .toBe(figs(NUMS, /这里是 (\d+) Mb\/s/, 'the step on the mandatory rate')[0])
    // 「连 2.4 GHz 的那套帧间间隔也用同一个数」 — and the engine's 2.4 GHz set really does
    const [bandA, bandB] = figs(LIM,
      /连 ([\d.]+) GHz 的那套帧间间隔也用同一个数。真实的 ([\d.]+) GHz 网络/,
      '`limits` on the other band')
    expect(bandA, 'the same band, named twice in one sentence').toBe(bandB)
    expect(ERP_2G.eifsNs - ERP_2G.sifsNs - ERP_2G.difsNs - ERP_2G.signalExtNs!,
      'the answer that band’s own EIFS is built from').toBe(ACK_TX_TIME_6M_NS)
    expect(bandA, 'and it is the band the engine takes loss off for').toBe(2.4)
    /*
     * **Exempt, class (a): the 1 Mb/s.** 「真实的 2.4 GHz 网络最低强制速率可能是 1 Mb/s」 is a
     * fact about deployed networks, and this engine has no 1 Mb/s rate at all — its slowest is
     * the 6 the constant above is timed at. What is read is the claim: the figure is below
     * everything this engine can send, which is why the sentence is a warning and not a setting.
     */
    const [realMbps] = figs(LIM, /最低强制速率可能是 (\d+) Mb\/s/, '`limits` on the real floor')
    expect(realMbps, 'slower than anything this engine sends').toBeLessThan(
      figs(NUMS, /这里是 (\d+) Mb\/s/, 'the engine’s own floor')[0]!)
    // 「语音来回两个方向都按每 20 ms 一帧 200 字节的本机时钟走」 — the generator's own two numbers
    const [everyMs, bytes] = figs(LIM, /都按每 (\d+) ms 一帧 (\d+) 字节的本机时钟走/,
      '`limits` on the voice clock')
    const [srcMs, srcJitter] = figs(TRAFFIC_SRC,
      /const at = this\.now\(\) \+ (\d+) \* MS \+ Math\.floor\(this\.rng\.next\(\) \* (\d+) \* MS\)/,
      'the generator’s own period')
    expect(everyMs, 'the period `scheduleVoice` keeps').toBe(srcMs)
    expect(srcJitter, 'with a jitter of its own on top').toBeGreaterThan(0)
    const [srcBytes] = figs(TRAFFIC_SRC, /(\d+) B every 20 ms \(VoIP-like\)/, 'the generator’s own payload')
    expect(bytes, 'and the payload it emits').toBe(srcBytes)
    const voice = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'sta-1')
    expect(voice.length, 'as many frames as that clock gives in this window')
      .toBeGreaterThan(RUN_NS / MS / (everyMs! + srcJitter!) - 2)
  })

  it('reads `observe` and `limits` on the figures they print again', () => {
    // 「块上那段静默是 79 µs。300 ms 里它只抽了 14 次倒数，通话站点抽了 33 次，上传站点抽了 107 次」
    const [silence, windowMs, back, call, up] = figs(OBS,
      /块上那段静默是 (\d+) µs。(\d+) ms 里它只抽了 (\d+) 次倒数，通话站点抽了 (\d+) 次，上传站点抽了 (\d+) 次/,
      '`observe` on the three draw counts')
    expect(silence! * US, 'the backup’s own silence').toBe(aifsNs(by('BK').aifsn, OFDM_5G))
    expect(windowMs! * MS, 'the window').toBe(RUN_NS)
    expect([back, call, up], 'the draws each station makes')
      .toEqual([draws(rs, 'sta-3').length, draws(rs, 'sta-1').length, draws(rs, 'sta-2').length])
    // 「把三台站点的排队时延并排读：1.49 ms、2.23 ms、10.23 ms」
    const three = raw(OBS, /并排读：([\d.]+) ms、([\d.]+) ms、([\d.]+) ms/,
      '`observe` on the three waits')
    expect(three, 'the three waits, in the order the table lists the stations')
      .toEqual(['sta-1', 'sta-2', 'sta-3'].map((n) => (meanQueueWait(rs, n) / 1000).toFixed(2)))
    // `limits`: 「每 20 ms 一帧 200 字节」 and 「1.49 ms 与 10.23 ms 只是 MAC 层…」
    const [everyMs, bytes] = figs(LIM, /都按每 (\d+) ms 一帧 (\d+) 字节的本机时钟走/,
      '`limits` on the voice clock')
    const voice = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'sta-1')
    expect(voice.length, 'the call really enqueues on that clock')
      .toBeGreaterThan(RUN_NS / MS / everyMs! - 2)
    expect(bytes, 'at that payload').toBeGreaterThan(0)
    const [limCall, limBack] = figs(LIM, /所以 ([\d.]+) ms 与 ([\d.]+) ms 只是 MAC 层/,
      '`limits` on the two waits it qualifies')
    expect([limCall, limBack], 'the same two the table prints')
      .toEqual([Number((meanQueueWait(rs, 'sta-1') / 1000).toFixed(2)),
        Number((meanQueueWait(rs, 'sta-3') / 1000).toFixed(2))])
  })
})
