/**
 * Pins the first half of the Tier 1 project, "The brief and the plan": every
 * number it quotes is a PREDICTION, and every one of them is recomputed here
 * from the engine's own functions and the Bianchi solver, so the worked
 * example cannot drift from the model it claims to apply.
 *
 * What the simulator actually does with this flat — and the two mechanisms
 * that explain the difference — is pinned next door, in
 * tests/course/tier1-project-review.test.ts, against a 10 s run. The only
 * measurements asserted here are the three the lesson's own `observe` items
 * send the reader to read off the first millisecond of the timeline.
 *
 * The `.body!` walk of the old flat shape, and the prose-quotation walk that
 * replaced it, are both retired: this file pins the engine, not the sentences.
 */
import { describe, it, expect } from 'vitest'
import { projectFlat, tier1Project } from '../../src/course/tier1/tier1-project'
import { airtime } from '../../src/course/tier1/airtime'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { ScenarioSchema } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import {
  ACK_BYTES, CW_MAX, CW_MIN, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, RATE_MARGIN_DB,
  SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS, ACK_TIMEOUT_NS,
  ctrlRespRateForMode, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, toneRatio, txTimeModeNs,
  txTimeNs,
} from '../../src/engine/phy'
import { PL0_DB, PL_EXP, WALL_LOSS_DB, buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import { lessonTexts } from '../../src/course/readability'
import { lessonShapeSuite, ofType, runOf } from './kit'
import type { Block } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 30 * MS
const PAYLOAD_BITS = 12_000
const MSDU = 1500
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

// ---------------------------------------------------------------------------
// the prediction side: one place that assembles the exchange times, checked
// against bianchiModel's own assembly so the two cannot drift apart
// ---------------------------------------------------------------------------

function times(mcs: number): { dataNs: number; ackNs: number; respRate: number; tsNs: number; tcNs: number } {
  const dataNs = txTimeModeNs('eht', MSDU + MAC_HDR_BYTES + FCS_BYTES, mcs, { widthMhz: 20 })
  const respRate = ctrlRespRateForMode('eht', mcs, mcsRateMbps('eht', mcs))
  const ackNs = txTimeNs(ACK_BYTES, respRate)
  return { dataNs, ackNs, respRate, tsNs: dataNs + SIFS_NS + ackNs + DIFS_NS, tcNs: dataNs + ACK_TIMEOUT_NS + DIFS_NS }
}

const mix = (ts: number[]): number => ts.reduce((a, b) => a + b, 0) / ts.length

function modelS(n: number, tsNs: number, tcNs: number): number {
  const { tau } = solveBianchi({ n, ...PARAMS })
  return saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps
}

// ---------------------------------------------------------------------------
// What used to sit here — a `quotes(...)` helper that searched the lesson's own
// strings for each figure it prints — is gone (2026-09-25). Every claim it
// guarded is recomputed below from the engine and the Bianchi solver, which is
// what the pin is for; the quotation only ever asserted how a sentence reads.
// ---------------------------------------------------------------------------

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(tier1Project, { runNs: RUN_NS })

describe('tier1-project · the lesson itself', () => {
  it('is the tier’s project, module 1, with the second half right behind it', () => {
    expect(MODULES[tier1Project.module].title).toBe('第一阶段项目')
    expect(COURSE_ORDER.indexOf('bianchi-vs-sim')).toBeLessThan(COURSE_ORDER.indexOf('tier1-project'))
    expect(COURSE_ORDER.indexOf('tier1-project-review')).toBe(COURSE_ORDER.indexOf('tier1-project') + 1)
    // Whole-track review M2 dropped `margin` and `saturated` as restatements of
    // decode-thresholds' `rate margin` and bianchi's `saturation`, on the grounds that both
    // owners were reachable through `needs`. `margin` is back (2026-09-23): the repaired
    // rule-2 pool is a lesson's own terms plus its DIRECT prerequisites, and
    // decode-thresholds is eight lessons back, not the one the reader has just read. The
    // brief asks the reader to add 3 dB by hand four times over, so this lesson owes the
    // word itself. `saturated` stays dropped — bianchi IS a direct need.
    expect(tier1Project.terms!.map((t) => t.term)).toEqual(['brief', 'link budget', 'margin', 'DCF'])
    // it is a brief, not exposition: the four questions and the discipline that goes with them
  })

  it('the scenario is small, deterministic and plain take-turns access', () => {
    const scen = projectFlat()
    expect(scen.seed).toBe(7)
    expect(scen.nodes.length).toBe(4)
    expect(scen.rtsThresholdBytes).toBeGreaterThan(MSDU)
    for (const n of scen.nodes) {
      expect(n.caps.widthMhz).toBe(20)
      expect(n.caps.features.edca ?? false).toBe(false)
      expect(n.caps.features.ampdu ?? false).toBe(false)
      expect(n.caps.features.txop ?? false).toBe(false)
    }
    expect(projectFlat({ third: true }).nodes.length).toBe(5)
    expect(projectFlat({ noFar: true }).nodes.length).toBe(3)
    expect(() => ScenarioSchema.parse(scen)).not.toThrow()
    for (const v of tier1Project.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the brief table places the four devices where the scene does', () => {
    const at = (id: string) => projectFlat().nodes.find((n) => n.id === id)!
    expect([at('ap').pos.x, at('ap').pos.y, at('ap').txPowerDbm]).toEqual([3, 4, 20])
    expect([at('sta-1').pos.x, at('sta-1').pos.y, at('sta-1').txPowerDbm]).toEqual([5, 4, 15])
    expect([at('sta-2').pos.x, at('sta-2').pos.y]).toEqual([14, 6])
    expect([at('sta-3').pos.x, at('sta-3').pos.y]).toEqual([4, 6])
  })
})

describe('tier1-project · (a) the link budget the learner predicts', () => {
  it('the two uploaders land where the table says, and the ladder picks their rungs', () => {
    const scen = projectFlat()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const noise = noiseDbm(20)
    expect(noise.toFixed(2)).toBe('-93.99')

    // study laptop: 2 m, no wall
    expect(pathLossDb(2).toFixed(2)).toBe('55.73')
    const near = table.get('sta-1')!.get('ap')!
    expect(near.toFixed(2)).toBe('-40.73')
    expect((near - noise).toFixed(2)).toBe('53.26')
    expect(mcsForRssi('eht', near, undefined, 20)).toBe(13)
    expect(mcsRateMbps('eht', 13)).toBe(172.1)

    // living-room laptop: 11.180 m plus one brick wall
    expect(Math.hypot(11, 2).toFixed(3)).toBe('11.180')
    expect(pathLossDb(Math.hypot(11, 2)).toFixed(2)).toBe('78.15')
    const far = table.get('sta-2')!.get('ap')!
    expect(far).toBeCloseTo(15 - 78.15 - 12, 1)
    expect(far.toFixed(2)).toBe('-75.15')
    expect((far - noise).toFixed(2)).toBe('18.84')
    expect(mcsForRssi('eht', far, undefined, 20)).toBe(2)
    expect(mcsRateMbps('eht', 2)).toBe(25.8)

    // the rungs the table names, and the 3 dB margin that excludes the next one up
    expect(reqSinrDb('eht', 2).toFixed(2)).toBe('13.99')
    expect(reqSinrDb('eht', 3).toFixed(2)).toBe('16.99')
    expect(far - noise).toBeGreaterThan(reqSinrDb('eht', 2) + 3)
    expect(far - noise).toBeLessThan(reqSinrDb('eht', 3) + 3)

  })

  /*
   * The wider-channel depth this lesson used to carry, and the pin that guarded
   * it, are both gone (re-pacing 2026-09-25 §5.5 and §7: it taught a scenario no
   * variant can load, so a reader could not watch a word of it). Deleted rather
   * than moved — the plan deletes exactly one passage, and this is it. The three
   * engine facts it rested on are still pinned elsewhere: `noiseDbm` against width
   * in tests/course/noise-floor.test.ts and tests/course/width.test.ts, and
   * `reqSinrDb('eht', 0)` in tests/course/decode-thresholds.test.ts.
   */
})

describe('tier1-project · the rule it borrows from another lesson', () => {
  /**
   * **A cross-lesson step reference is a figure, and this one was stale on the page.**
   * 「还是『空口时间（airtime）』那一课第 5 步的规则：确认帧用的是不超过数据帧自身参考速率的
   * 那个最高强制速率」 — the 「第」 rule change of 2026-10-14 offered that 5 to the planter, and
   * reading it showed the reference pointed at nothing: `@airtime` once taught six steps, the
   * split of 2026-09-25 moved the byte counting to `@frame-anatomy-bytes`, and the rule has been
   * **step 2 of 3** ever since. A reader following the pointer landed on 「同一套算术用在 14 个
   * 字节上」. Fixed in the lesson, and read here so it cannot go stale again: the step this
   * sentence names has to be the step that states the rule.
   */
  it('points at the step of `@airtime` that really states the control-response rate rule', () => {
    const steps = (airtime.numbers ?? []).concat(airtime.picture ?? [])
      .find((b) => b.kind === 'steps') as { items: string[] } | undefined
    expect(steps, '`@airtime` no longer builds the exchange in steps at all').toBeDefined()
    const nth = /那一课第 (\d+) 步的规则/.exec(
      tier1Project.numbers!.map((b) => (b as { text?: string }).text ?? '').join(' '))
    expect(nth, 'the borrowed rule is no longer named by step number').not.toBeNull()
    const i = Number(nth![1])
    expect(i, `\`@airtime\` has only ${steps!.items.length} steps`)
      .toBeLessThanOrEqual(steps!.items.length)
    expect(steps!.items[i - 1], `step ${i} of \`@airtime\` is not the rule this quotes`)
      .toContain('最高强制速率')
    // and it is the only step of that lesson which states it, so the pointer is unambiguous
    expect(steps!.items.filter((x) => x.includes('最高强制速率')),
      'exactly one step states the rule').toHaveLength(1)
  })
})

describe('tier1-project · (b) the airtime the learner predicts', () => {
  it('the symbol arithmetic and the two exchange times', () => {
    expect(MSDU + MAC_HDR_BYTES + FCS_BYTES).toBe(1528)
    expect(16 + 8 * 1528 + 6).toBe(12_246)
    expect(Math.ceil(12_246 / 351)).toBe(35)
    expect(Math.ceil(12_246 / 2340)).toBe(6)

    const fast = times(13)
    const slow = times(2)
    expect(fast.dataNs).toBe(129_600)
    expect(slow.dataNs).toBe(524_000)
    expect(fast.respRate).toBe(24)
    expect(slow.respRate).toBe(12)
    expect(fast.ackNs).toBe(28_000)
    expect(slow.ackNs).toBe(32_000)
    expect(fast.tsNs).toBe(207_600)
    expect(slow.tsNs).toBe(606_000)
    expect(fast.tcNs).toBe(208_600)
    expect(slow.tcNs).toBe(603_000)

  })

  it('the exchange is assembled exactly as bianchiModel assembles it', () => {
    // same four terms, checked against dcfTimes on a legacy link where both apply
    const legacy = dcfTimes(MSDU, 6)
    expect(legacy.dataNs + SIFS_NS + legacy.ackNs + DIFS_NS).toBe(legacy.tsNs)
    expect(legacy.dataNs + ACK_TIMEOUT_NS + DIFS_NS).toBe(legacy.tcNs)
  })
})

describe('tier1-project · (c) the fixed point the learner predicts', () => {
  it('n = 2 gives τ = 0.1046 and p = 10.46 %, and the generic exchange gives 25.585 Mb/s', () => {
    const { tau, p } = solveBianchi({ n: 2, ...PARAMS })
    expect(tau.toFixed(4)).toBe('0.1046')
    expect((100 * p).toFixed(2)).toBe('10.46')
    const ts = mix([times(13).tsNs, times(2).tsNs])
    const tc = mix([times(13).tcNs, times(2).tcNs])
    expect((ts / 1000).toFixed(1)).toBe('406.8')
    const S = modelS(2, ts, tc)
    expect(S.toFixed(3)).toBe('25.585')
    expect((S / 2).toFixed(3)).toBe('12.793')
  })
})

describe('tier1-project · (d) the share the learner predicts', () => {
  it('19.8 / 80.2 from the two frame durations, and 43.621 Mb/s with the flat to itself', () => {
    const fast = times(13).dataNs
    const slow = times(2).dataNs
    expect((100 * fast / (fast + slow)).toFixed(1)).toBe('19.8')
    expect((100 * slow / (fast + slow)).toFixed(1)).toBe('80.2')

    const perExchangeNs = times(13).tsNs + 7.5 * SLOT_NS
    expect((perExchangeNs / 1000).toFixed(1)).toBe('275.1')
    expect((PAYLOAD_BITS / (perExchangeNs * 1e-9) / 1e6).toFixed(3)).toBe('43.621')
  })
})

describe('tier1-project · the three variants, predicted', () => {
  it('moved to the living room: 9.000 m, MCS 3, and S = 19.350 Mb/s', () => {
    const scen = tier1Project.variants![0].scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const rssi = table.get('sta-1')!.get('ap')!
    expect(pathLossDb(9).toFixed(2)).toBe('75.33')
    expect(rssi.toFixed(2)).toBe('-72.33')
    expect((rssi - noiseDbm(20)).toFixed(2)).toBe('21.66')
    expect(mcsForRssi('eht', rssi, undefined, 20)).toBe(3)
    expect(times(3).dataNs).toBe(415_200)
    expect(times(3).tsNs).toBe(493_200)
    const S = modelS(2, mix([times(3).tsNs, times(2).tsNs]), mix([times(3).tcNs, times(2).tcNs]))
    expect(S.toFixed(3)).toBe('19.350')
    expect((S / 2).toFixed(3)).toBe('9.675')
  })

  it('a third contender: p = 17.81 % and S = 29.574 Mb/s; alone, 43.621 Mb/s', () => {
    const { p } = solveBianchi({ n: 3, ...PARAMS })
    expect((100 * p).toFixed(2)).toBe('17.81')
    const ts = mix([times(13).tsNs, times(13).tsNs, times(2).tsNs])
    const tc = mix([times(13).tcNs, times(13).tcNs, times(2).tcNs])
    expect(modelS(3, ts, tc).toFixed(3)).toBe('29.574')
  })
})

/**
 * Amendment of 2026-09-23: the brief now carries the plan itself as steps —
 * what is already set up, what to work out in which order, when to run, which
 * records to read each figure off, and what to write down. Every reading the
 * plan sends the learner to has to exist in the run they are told to make.
 */
describe('tier1-project · the plan, step by step', () => {
  const records = runOf(tier1Project, undefined, RUN_NS)

  it('step 1: the scene already is the brief — nothing for the learner to set up', () => {
    const scen = projectFlat()
    for (const n of scen.nodes) {
      expect(n.caps.widthMhz).toBe(20)
      expect(n.caps.nss ?? 1).toBe(1)
      expect(n.caps.features.edca ?? false).toBe(false)
      expect(n.caps.features.ampdu ?? false).toBe(false)
      expect(n.caps.features.txop ?? false).toBe(false)
    }
  })

  it('steps 2 to 4: the order is the order the predictions depend on each other in', () => {
    // (a) fixes the rung; (b) prices the exchange from that rung; (c) and (d) take
    // the two exchange times as their only input — so no step can be taken early.
    const scen = projectFlat()
    const rssi = buildLinkTable(scen.nodes, scen.walls).get('sta-1')!.get('ap')!
    const mcs = mcsForRssi('eht', rssi, undefined, 20)
    expect(times(mcs).dataNs).toBe(129_600)
    expect(mix([times(13).tsNs, times(2).tsNs]) / 1000).toBeCloseTo(406.8, 1)
    expect(MSDU + MAC_HDR_BYTES + FCS_BYTES).toBe(1528)
  })

  it('step 5: every reading the plan names is in the run — rung, block length, retries, counters', () => {
    const firstData = ofType(records, 'TX_START').find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
    expect(firstData.frame.mcs).toBe(13)
    expect(firstData.frame.txTimeNs).toBe(129_600)
    expect(ofType(records, 'RETRY').length).toBeGreaterThan(0)
    const sim = new Simulation(projectFlat())
    sim.runUntil(RUN_NS)
    for (const id of ['sta-1', 'sta-2']) {
      expect(sim.view.nodes[id].stats.txOk).toBeGreaterThan(0)
      expect(sim.view.nodes[id].stats.airtimeNs).toBeGreaterThan(0)
    }
  })

  it('step 6: the four lines are the four questions, and they are written before the run', () => {
    // Re-pacing 2026-09-25: ONE procedure in the lesson, and it is the plan. The four
    // questions used to be a second `steps` block, which is §1's tell for two topics;
    // they are four deliverables rather than an order, so they are a `list` now.
    const blocks = [...tier1Project.picture!, ...tier1Project.numbers!]
    expect(blocks.filter((b) => b.kind === 'steps').length).toBe(1)
    expect(tier1Project.numbers!.filter((b) => b.kind === 'steps').length).toBe(1)
    const four = tier1Project.picture!.find((b) => b.kind === 'list') as Extract<Block, { kind: 'list' }>
    expect(four.items.length).toBe(4)
    expect(four.items.map((s) => s.slice(0, 3))).toEqual(['（a）', '（b）', '（c）', '（d）'])
    // and no diagram: a to-scale plan of this flat overlaps two node boxes (see the
    // lesson file's header comment and the batch E report)
    expect(blocks.filter((b) => b.kind === 'diagram').length).toBe(0)
  })
})

describe('tier1-project · what the three observations send the reader to read', () => {
  const records = runOf(tier1Project, undefined, RUN_NS)

  it('both stations pick their rung on the very first frame they send', () => {
    const first = (id: string): number => {
      const r = ofType(records, 'TX_START').find((x) => x.node === id && x.frame.kind === 'data')!
      expect(r, id).toBeDefined()
      return r.frame.mcs!
    }
    expect(first('sta-1')).toBe(13)
    expect(first('sta-2')).toBe(2)
    expect(ofType(records, 'TX_START').find((x) => x.node === 'sta-1' && x.frame.kind === 'data')!.frame.txTimeNs)
      .toBe(129_600)
    expect(ofType(records, 'TX_START').find((x) => x.node === 'sta-2' && x.frame.kind === 'data')!.frame.txTimeNs)
      .toBe(524_000)
  })

  it('a 16 µs gap, a 28 µs answer and a 34 µs wait, as the second observation says', () => {
    const ends = ofType(records, 'TX_END').filter((r) => r.frame.kind === 'data' && r.node === 'sta-1')
    const ack = ofType(records, 'TX_START').find((r) => r.frame.kind === 'ack' && ends.some((e) => r.t - e.t === SIFS_NS))
    expect(ack, 'an ACK one SIFS after a study-laptop frame').toBeDefined()
    expect(SIFS_NS).toBe(16_000)
    expect(ack!.frame.txTimeNs).toBe(28_000)
    expect(DIFS_NS).toBe(34_000)
  })

  it('the first backoff draw is a whole number of slots, already from a doubled window', () => {
    // the two opening frames collide at t = 0, so the first draw in this scene is taken
    // from 32 values, not from the first window of 16 — which is what the observation says
    const draw = ofType(records, 'BACKOFF_DRAW')[0]
    expect(draw, 'a backoff draw').toBeDefined()
    expect(['sta-1', 'sta-2']).toContain(draw.node)
    expect(draw.cw).toBe(31)
    expect(Number.isInteger(draw.value)).toBe(true)
    expect(draw.value).toBeLessThanOrEqual(draw.cw)
    const opens = ofType(records, 'TX_START').filter((r) => r.frame.kind === 'data' && r.t === 0)
    expect(opens.map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    expect(ofType(records, 'COLLISION')[0].nodes.slice().sort()).toEqual(['sta-1', 'sta-2'])
  })
})

// --- every figure the brief prints -------------------------------------------------------------

/**
 * **The docblock above says this file pins the engine and not the sentences, and that was a
 * decision: a `quotes(...)` helper that searched the lesson's strings for each figure was deleted
 * on 2026-09-25 because it only ever asserted how a sentence reads.** It was the right call about
 * that helper — it searched the whole lesson for a substring, so an occurrence anywhere satisfied
 * it — and the wrong conclusion about the lesson. `scripts/figure-planting.ts` measured what was
 * left on 2026-10-12: six figures planted in these tables, six plantings unnoticed, and 143
 * plantable figures in the lesson, the third-highest count in the course.
 *
 * Every figure the brief prints is a prediction, and the point of a prediction is that it can be
 * marked. So each one is read out of the cell it is printed in and compared with the same engine
 * function the assertions above call — the figure stays in the lesson, and nothing is retyped
 * here. A planting in any cell of the five tables now reddens this file.
 */
describe('tier1-project · every figure the brief prints, read back out of its own cells', () => {
  const EVERYWHERE = lessonTexts(tier1Project).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/−/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the brief no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the brief)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  type Tbl = { kind: 'table'; heading?: string; head: string[]; rows: string[][] }
  const isTbl = (b: Block): b is Tbl => b.kind === 'table'
  /** The brief's one unheaded table is found by a column of its own head. */
  const tableOf = (where: 'picture' | 'numbers', by: string): Tbl => {
    const blocks = (where === 'picture' ? tier1Project.picture : tier1Project.numbers) ?? []
    const t = blocks.filter(isTbl)
      .find((b) => (b.heading ?? '').startsWith(by) || b.head.some((h) => h.startsWith(by)))
    expect(t, `the table 「${by}」 is gone from \`${where}\``).toBeDefined()
    return t!
  }
  const rowOf = (where: 'picture' | 'numbers', by: string, starts: string): string[] => {
    const r = tableOf(where, by).rows.find((x) => x[0].startsWith(starts))
    expect(r, `the row 「${starts}」 is gone from 「${by}」`).toBeDefined()
    return r!
  }
  const SCEN = projectFlat()
  const NOISE = noiseDbm(20)
  const TOP_MCS = PHY_MODES.eht.sensDbm.length - 1
  const node = (id: string) => SCEN.nodes.find((n) => n.id === id)!
  const linkTo = (id: string): number => buildLinkTable(SCEN.nodes, SCEN.walls).get(id)!.get('ap')!
  const apart = (id: string): number =>
    Math.hypot(node(id).pos.x - node('ap').pos.x, node(id).pos.y - node('ap').pos.y)
  const rungOf = (id: string): number => mcsForRssi('eht', linkTo(id), undefined, 20)
  /** Bits a symbol carries at this rung and this width — what `txTimeModeNs` divides by. */
  const ndbpsOf = (mcs: number): number => PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', 20)
  /** The first data frame a station sends, which is where `observe` sends the reader. */
  const firstDataOf = (id: string) => {
    const hit = runOf(tier1Project, undefined, RUN_NS)
      .find((r) => r.type === 'TX_START' && r.node === id && r.frame.kind === 'data')
    expect(hit, `no data frame from ${id}`).toBeDefined()
    return hit as Extract<TLRecord, { type: 'TX_START' }>
  }

  it('the brief table puts every device where the scene does, with its power and its traffic', () => {
    for (const [label, id] of [['路由器', 'ap'], ['书房笔记本', 'sta-1'],
      ['客厅笔记本', 'sta-2'], ['手机', 'sta-3']] as const) {
      const r = rowOf('picture', '题面', label)
      const [x, y] = figs(r[1], /\((\d+), (\d+)\)/, `${label}: where it stands`)
      expect([x, y], `${label}: the position the scene gives it`)
        .toEqual([node(id).pos.x, node(id).pos.y])
      const dbm = /, (\d+) dBm/.exec(r[1])
      if (dbm) expect(val(dbm[1]), `${label}: the power it transmits at`).toBe(node(id).txPowerDbm)
    }
    // 「饱和上传，1500 字节载荷」, for both uploaders
    const msdu = firstDataOf('sta-1').frame.bytes - MAC_HDR_BYTES - FCS_BYTES
    for (const v of everyFig(/饱和上传，(\d+) 字节载荷/g, 'the payload the uploaders send', 2)) {
      expect(val(v), 'the MSDU this scene really puts on the air').toBe(msdu)
    }
    // 「通话：每 20 ms 上行与下行各 200 字节」 — the generator's own period and packet
    const [periodMs, bytes] = figs(rowOf('picture', '题面', '手机')[2],
      /每 (\d+) ms 上行（uplink, UL）与下行（downlink, DL）各 (\d+) 字节/, 'the call')
    // The run the rest of this file reads is 30 ms — one call packet, so the period needs a
    // longer one of its own. Ten of them is enough to see the floor of the gaps.
    const longer = [...new Simulation(projectFlat()).runUntil(10 * periodMs * MS).records]
    const call = longer
      .filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> => r.type === 'ARRIVAL')
      .filter((r) => r.node === 'sta-3' || r.dst === 'sta-3')
    expect(call.length, 'the phone does put packets on the air').toBeGreaterThan(2)
    expect(new Set(call.map((r) => r.bytes)), 'every one of them is that many bytes')
      .toEqual(new Set([bytes]))
    // The generator adds up to 2 ms of jitter to every gap, so the figure the brief prints is the
    // floor of them — never the gap itself.
    const ul = call.filter((r) => r.node === 'sta-3')
    const gaps = ul.slice(1).map((r, i) => r.t - ul[i].t)
    expect(Math.min(...gaps), 'no gap is shorter than the period').toBeGreaterThanOrEqual(periodMs * MS)
    expect(Math.floor(Math.min(...gaps) / MS), 'and the shortest one is that period')
      .toBe(periodMs)
  })

  it('（a）: the two link budgets, cell for cell, and the rung the margin excludes', () => {
    // 「一条 20 MHz 信道上的噪声是 −93.99 dBm」, and every 「3 dB 余量」 the lesson states
    const [width, floorDbm] = raw(EVERYWHERE,
      /一条 (\d+) MHz 信道上的噪声是 −([\d.]+) dBm/, 'the floor the SNR column is read against')
    expect(val(width), 'the width this scene runs at').toBe(node('ap').caps.widthMhz)
    same(`-${floorDbm}`, NOISE, 'the noise floor at that width')
    for (const v of everyFig(/(?:再加|再留|留) (\d+) dB 余量|这里是 (\d+) dB，好让/g,
      'the margin a rung is taken with', 3)) {
      expect(val(v), 'the margin this engine keeps above the required SINR').toBe(RATE_MARGIN_DB)
    }
    for (const [label, id] of [['书房笔记本', 'sta-1'], ['客厅笔记本', 'sta-2']] as const) {
      const r = rowOf('numbers', '（a）预测', label)
      const rx = linkTo(id)
      const snr = rx - NOISE
      same(raw(r[1], /^([\d.]+) m/, `${label}: the distance`)[0], apart(id), `${label}: the distance`)
      same(r[2].replace(' dB', ''), pathLossDb(apart(id)), `${label}: the path loss`)
      same(r[3].replace(' dBm', ''), rx, `${label}: the level that arrives`)
      same(r[4].replace(' dB', ''), snr, `${label}: the SNR`)
      const [mcs, mbps] = raw(r[5], /MCS (\d+), ([\d.]+) Mb\/s/, `${label}: the rung`)
      expect(val(mcs), `${label}: the rung the ladder picks`).toBe(rungOf(id))
      same(mbps, mcsRateMbps('eht', val(mcs)), `${label}: the rate of that rung`)
      // 「无墙」/「一堵砖墙」: the path-loss figure above is the distance alone, so a wall is the rest
      const wallDb = node(id).txPowerDbm - pathLossDb(apart(id)) - rx
      expect(wallDb > 0, `${label}: 「砖墙」 exactly when a wall is on the ray`)
        .toBe(/砖墙/.test(r[1]))
      expect(Math.round(wallDb / WALL_LOSS_DB.brick) * WALL_LOSS_DB.brick,
        `${label}: and a wall costs what this engine charges for brick`).toBeCloseTo(wallDb, 9)
      // 「已是顶端」, or 「13.99 + 3 = 16.99 dB ✓ · 16.99 + 3 = 19.99 dB ✗」
      if (r[6].includes('✓')) {
        const [took, m1, tookPlus, next, m2, nextPlus] = raw(r[6],
          /([\d.]+) \+ (\d+) = ([\d.]+) dB ✓ · ([\d.]+) \+ (\d+) = ([\d.]+) dB ✗/,
          `${label}: the rung it took and the one it could not`)
        same(took, reqSinrDb('eht', val(mcs)), `${label}: what its own rung requires`)
        same(next, reqSinrDb('eht', val(mcs) + 1), `${label}: what the next rung requires`)
        expect([val(m1), val(m2)], `${label}: the margin, twice`)
          .toEqual([RATE_MARGIN_DB, RATE_MARGIN_DB])
        same(tookPlus, reqSinrDb('eht', val(mcs)) + RATE_MARGIN_DB,
          `${label}: its requirement plus the margin`)
        same(nextPlus, reqSinrDb('eht', val(mcs) + 1) + RATE_MARGIN_DB, `${label}: and the next one’s`)
        expect(val(tookPlus), `${label}: 「✓」 — it fits`).toBeLessThanOrEqual(Number(snr.toFixed(2)))
        expect(val(nextPlus), `${label}: 「✗」 — it does not`).toBeGreaterThan(Number(snr.toFixed(2)))
      } else {
        expect(val(mcs), '「已是顶端」: there is no rung above this one').toBe(TOP_MCS)
      }
    }
  })

  it('（b）: the symbol formula, its note, and both exchanges cell for cell', () => {
    const f = (tier1Project.numbers ?? []).find(
      (b): b is { kind: 'formula'; heading?: string; text: string; note?: string } =>
        b.kind === 'formula')
    expect(f, 'the formula is gone from `numbers`').toBeDefined()
    const [service, perByte, tail] = figs(f!.text,
      /⌈\((\d+) \+ (\d+)·L \+ (\d+)\) \/ 每符号比特数⌉/, 'the three terms of the numerator')
    expect([service, perByte, tail], 'the SERVICE field, the bits in a byte, and the tail')
      .toEqual([16, 8, 6])
    same(raw(f!.text, /符号数 × ([\d.]+) µs/, 'the symbol it multiplies by')[0],
      PHY_MODES.eht.symNs / 1000, 'the symbol of this generation')
    const [msdu, hdr, fcs, total] = figs(f!.note!,
      /：(\d+) 字节载荷、(\d+) 字节媒体访问控制（MAC）头、(\d+) 字节帧校验序列（FCS）——合计 (\d+) 字节/,
      'what L is made of')
    expect([hdr, fcs], 'the header and the check this engine really adds')
      .toEqual([MAC_HDR_BYTES, FCS_BYTES])
    expect(msdu + hdr + fcs, 'the lesson’s own sum').toBe(total)
    expect(total, 'and the frame the scene puts on the air').toBe(firstDataOf('sta-1').frame.bytes)
    for (const v of everyFig(/(\d+) 字节要几个符号/g, 'the frame the plan asks about', 1)) {
      expect(val(v), 'the same frame').toBe(total)
    }
    for (const [label, id] of [['书房笔记本', 'sta-1'], ['客厅笔记本', 'sta-2']] as const) {
      const r = rowOf('numbers', '每符号比特', label)
      const mcs = rungOf(id)
      const t = times(mcs)
      expect(val(r[1]), `${label}: the bits a symbol carries`).toBe(ndbpsOf(mcs))
      const [bits, perSym, nsym] = figs(r[2], /⌈(\d+) \/ (\d+)⌉ = (\d+)/, `${label}: the ceiling`)
      expect(bits, `${label}: the bits the frame becomes`).toBe(service + perByte * total + tail)
      expect(perSym, `${label}: divided by the symbol’s own bits`).toBe(ndbpsOf(mcs))
      expect(Math.ceil(bits / perSym), `${label}: the lesson’s own ceiling`).toBe(nsym)
      const [pre, body, data] = raw(r[3], /([\d.]+) \+ ([\d.]+) = ([\d.]+) µs/, `${label}: the frame`)
      same(pre, PHY_MODES.eht.preambleNs / 1000, `${label}: the preamble`)
      same(body, (nsym * PHY_MODES.eht.symNs) / 1000, `${label}: the symbols`)
      same(data, t.dataNs / 1000, `${label}: the frame on the air`)
      const [ackRate, ackUs] = raw(r[4], /(\d+) Mb\/s, ([\d.]+) µs/, `${label}: the answer`)
      expect(val(ackRate), `${label}: the rate the ACK goes out at`).toBe(t.respRate)
      same(ackUs, t.ackNs / 1000, `${label}: and how long it takes`)
      const [d2, sifs, ack2, difs, ts] = raw(r[5],
        /([\d.]+) \+ (\d+) \+ ([\d.]+) \+ (\d+) = ([\d.]+) µs/, `${label}: the exchange`)
      same(d2, t.dataNs / 1000, `${label}: the frame, again`)
      expect([val(sifs) * 1000, val(difs) * 1000], `${label}: the two waits`)
        .toEqual([SIFS_NS, DIFS_NS])
      same(ack2, t.ackNs / 1000, `${label}: the answer, again`)
      same(ts, t.tsNs / 1000, `${label}: and what the four come to`)
      same(r[6].replace(' µs', ''), t.tcNs / 1000, `${label}: and a collision instead`)
    }
    // 「快帧之后是 24 Mb/s，慢帧之后是 12 Mb/s」
    const [fastAck, slowAck] = figs(EVERYWHERE,
      /快帧之后是 (\d+) Mb\/s，慢帧之后是 (\d+) Mb\/s/, 'the two answer rates')
    expect([fastAck, slowAck], 'the control response rate of the two rungs')
      .toEqual([times(rungOf('sta-1')).respRate, times(rungOf('sta-2')).respRate])
  })

  it('（c）and（d）: the fixed point, the generic exchange, the share and the flat to itself', () => {
    const fast = times(rungOf('sta-1'))
    const slow = times(rungOf('sta-2'))
    const [w, m, attempts] = figs(rowOf('numbers', '（c）预测', '窗口')[1],
      /(\d+), (\d+), (\d+)/, 'the three the fixed point is solved with')
    expect(w, 'the first window, in slots').toBe(CW_MIN + 1)
    expect(m, 'how many times it may double').toBe(Math.log2((CW_MAX + 1) / (CW_MIN + 1)))
    expect(attempts, 'and how many attempts a frame gets').toBe(SHORT_RETRY_LIMIT)
    const { tau, p } = solveBianchi({ n: 2, W: w, m, attempts })
    same(raw(rowOf('numbers', '（c）预测', '某个时隙')[1], /τ = ([\d.]+)/, 'τ')[0], tau, 'τ')
    same(raw(rowOf('numbers', '（c）预测', '撞上别人')[1], /p = ([\d.]+) %/, 'p')[0], 100 * p, 'p')
    const [a, b, two, mean] = raw(rowOf('numbers', '（c）预测', '一次通用的交换')[1],
      /\(([\d.]+) \+ ([\d.]+)\) \/ (\d+) = ([\d.]+) µs/, 'the generic exchange')
    same(a, fast.tsNs / 1000, 'the fast exchange')
    same(b, slow.tsNs / 1000, 'the slow one')
    expect(val(two), 'two contenders, so the plain mean').toBe(2)
    same(mean, mix([fast.tsNs, slow.tsNs]) / 1000, 'and the mean of the two')
    const S = modelS(2, mix([fast.tsNs, slow.tsNs]), mix([fast.tcNs, slow.tcNs]))
    same(rowOf('numbers', '（c）预测', '两台合计')[1].replace(' Mb/s', ''), S, 'what the pair delivers')
    same(rowOf('numbers', '（c）预测', '……各自')[1].replace(' Mb/s', ''), S / 2, 'and each of them')
    // （d）: the share is the two frame durations; the solo figure is one exchange plus the mean draw
    const [near, far] = raw(rowOf('numbers', '（d）预测', '空口占比')[1],
      /([\d.]+) % \/ ([\d.]+) %/, 'the share of the air')
    same(near, (100 * fast.dataNs) / (fast.dataNs + slow.dataNs), 'the study laptop’s share')
    same(far, (100 * slow.dataNs) / (fast.dataNs + slow.dataNs), 'and the living room’s')
    const soloRow = rowOf('numbers', '（d）预测', '书房笔记本独占')
    const [slots] = figs(soloRow[0], /交换 \+ ([\d.]+) 个时隙/, 'the backoff it still pays')
    expect(slots, 'the mean draw from the first window').toBe(CW_MIN / 2)
    const [bits, us, mbps] = raw(soloRow[1], /([\d,]+) 比特 \/ ([\d.]+) µs = ([\d.]+) Mb\/s/,
      'the flat to itself')
    expect(val(bits), 'the payload of one frame, in bits').toBe(PAYLOAD_BITS)
    same(us, (fast.tsNs + slots * SLOT_NS) / 1000, 'the exchange and its backoff')
    same(mbps, (1000 * val(bits)) / (fast.tsNs + slots * SLOT_NS), 'and what that delivers')
  })

  it('the three variants, predicted cell for cell', () => {
    const alone = times(rungOf('sta-1'))
    const soloMbps = (1000 * PAYLOAD_BITS) / (alone.tsNs + (CW_MIN / 2) * SLOT_NS)
    for (const [starts, scen, n] of [
      ['书房笔记本搬到客厅', projectFlat({ nearX: 12 }), 2],
      ['多一台平板', projectFlat({ third: true }), 3],
      ['客厅笔记本离线', projectFlat({ noFar: true }), 1],
    ] as const) {
      const r = rowOf('numbers', '三个变体', starts)
      const links = buildLinkTable(scen.nodes, scen.walls)
      const rungAt = (id: string): number =>
        mcsForRssi('eht', links.get(id)!.get('ap')!, undefined, 20)
      const rx = links.get('sta-1')!.get('ap')!
      const mcs = rungAt('sta-1')
      // the link column: the whole budget again when it moved, the rung alone when it did not
      if (r[1].includes('→')) {
        const [dist, level, snr, rung] = raw(r[1],
          /([\d.]+) m → −([\d.]+) dBm, ([\d.]+) dB, MCS (\d+)/, `${starts}: the moved link`)
        const near = scen.nodes.find((x) => x.id === 'sta-1')!.pos
        const ap = scen.nodes.find((x) => x.id === 'ap')!.pos
        same(dist, Math.hypot(near.x - ap.x, near.y - ap.y), `${starts}: the new distance`)
        same(`-${level}`, rx, `${starts}: what arrives now`)
        same(snr, rx - NOISE, `${starts}: the SNR`)
        expect(val(rung), `${starts}: the rung`).toBe(mcs)
      } else {
        expect(figs(r[1], /MCS (\d+)/, `${starts}: the rung`)[0], `${starts}: unchanged`).toBe(mcs)
      }
      const t = times(mcs)
      const [frame, exch] = raw(r[2], /([\d.]+) \/ ([\d.]+) µs/, `${starts}: frame and exchange`)
      same(frame, t.dataNs / 1000, `${starts}: the frame`)
      same(exch, t.tsNs / 1000, `${starts}: the exchange`)
      const contenders = scen.nodes.filter((x) => x.profiles.includes('saturated'))
      expect(contenders, `${starts}: the contenders this variant has`).toHaveLength(n)
      if (/%/.test(r[3])) {
        const { p } = solveBianchi({ n, W: CW_MIN + 1, m: 6, attempts: SHORT_RETRY_LIMIT })
        same(r[3].replace(' %', ''), 100 * p, `${starts}: the collision probability`)
      } else {
        expect(n, '「没有人可撞」: one contender, so there is nobody').toBe(1)
      }
      const theirs = contenders.map((x) => times(rungAt(x.id)))
      if (r[4].includes('→')) {
        const [sum, one, other] = raw(r[4], /([\d.]+) → ([\d.]+) \+ ([\d.]+) Mb\/s/,
          `${starts}: what the pair delivers`)
        const S = modelS(n, mix(theirs.map((x) => x.tsNs)), mix(theirs.map((x) => x.tcNs)))
        same(sum, S, `${starts}: together`)
        for (const half of [one, other]) same(half, S / n, `${starts}: and each of them`)
      } else if (n === 1) {
        same(r[4].replace(' Mb/s', ''), soloMbps, `${starts}: the flat to itself`)
      } else {
        same(r[4].replace(' Mb/s', ''),
          modelS(n, mix(theirs.map((x) => x.tsNs)), mix(theirs.map((x) => x.tcNs))),
          `${starts}: what the three deliver`)
      }
    }
  })

  it('`limits`, `sources`, `observe` and the quiz: the same figures, wherever they are restated', () => {
    const lim = tier1Project.limits.map((x) => x.text).join('\n')
    const src = (tier1Project.sources ?? []).join('\n')
    // the path-loss law, the brick wall, the margin and the floor — in `limits` AND in `sources`
    for (const where of [lim, src]) {
      const [pl0, exp, base, wall, margin, width, floorDbm] = figs(where,
        /路径损耗公式 ([\d.]+) \+ (\d+)·log(\d+)\(d\)、砖墙 (\d+) dB、每一级所需 ?(?:信干噪比|SINR) ?之上再留 (\d+) dB 余量，以及 (\d+) MHz (?:下|信道) −([\d.]+) dBm 的噪声底/,
        'the four engine values the brief rests on')
      expect(pl0, 'the loss at one metre').toBe(PL0_DB)
      expect(exp, 'ten times the path-loss exponent').toBe(10 * PL_EXP)
      expect(base, 'and the logarithm is base ten').toBe(10)
      // which is the law itself: at ten metres the second term is exactly that multiplier
      expect(pathLossDb(base), 'and `pathLossDb` really is that law').toBeCloseTo(pl0 + exp, 9)
      expect(wall, 'the brick wall this engine charges').toBe(WALL_LOSS_DB.brick)
      expect(margin, 'the margin a rung is taken with').toBe(RATE_MARGIN_DB)
      expect(width, 'the width').toBe(20)
      expect(-floorDbm, 'and the floor at that width').toBe(Number(NOISE.toFixed(2)))
    }
    // 「真实的 2.0 m 与 11.2 m 链路」: the two links of this flat, to one decimal
    const [d1, d2] = raw(lim, /真实的 ([\d.]+) m 与 ([\d.]+) m 链路/, 'the two links it is about')
    same(d1, apart('sta-1'), 'the near link')
    same(d2, apart('sta-2'), 'and the far one')
    const fast = times(rungOf('sta-1'))
    // `observe`: both rungs, both frame lengths, and the three parts of the exchange
    const obs = tier1Project.observe.join('\n')
    const [nearMcs, nearUs, farMcs, farUs] = raw(obs,
      /（MCS）(\d+)、长 ([\d.]+) µs，客厅笔记本的是 MCS (\d+)、长 ([\d.]+) µs/,
      '`observe` on the two first frames')
    for (const [id, mcs, us] of [['sta-1', nearMcs, nearUs], ['sta-2', farMcs, farUs]] as const) {
      const first = firstDataOf(id)
      expect(val(mcs), `${id}: the rung it picks on its first frame`).toBe(first.frame.mcs)
      same(us, first.frame.txTimeNs / 1000, `${id}: and the block the reader sees`)
    }
    const [sifs, ack, difs] = raw(obs,
      /间隙是 (\d+) µs[^]*?回答本身是 (\d+) µs。其后还跟着 (\d+) µs 的等待/,
      '`observe` on the gap, the answer and the wait')
    expect([val(sifs) * 1000, val(difs) * 1000], 'the two waits').toEqual([SIFS_NS, DIFS_NS])
    same(ack, fast.ackNs / 1000, 'and the answer itself')
    // the quiz restates (a)'s margin arithmetic and the third contender's collision probability
    const quiz = tier1Project.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    const farSnr = linkTo('sta-2') - NOISE
    const [quizSnr, quizNext, quizNextReq] = raw(quiz,
      /SNR 是 ([\d.]+) dB，而 MCS (\d+) 需要 ([\d.]+) dB/, 'the quiz’s own premise')
    same(quizSnr, farSnr, 'the SNR the quiz reasons about')
    expect(val(quizNext), 'the rung it could not take').toBe(rungOf('sta-2') + 1)
    same(quizNextReq, reqSinrDb('eht', val(quizNext)), 'what that rung requires')
    const [over, snrA, fits, snrB, overAgain] = raw(quiz,
      /而 ([\d.]+) \+ \d+ 超过了 ([\d.]+)[^]*?走：([\d.]+) \+ \d+ 装得进 ([\d.]+)，([\d.]+) \+ \d+ 装不进/,
      'the quiz’s own arithmetic, both ways round')
    same(over, reqSinrDb('eht', val(quizNext)), 'the requirement that does not fit')
    same(overAgain, reqSinrDb('eht', val(quizNext)), 'and the same one, restated')
    same(fits, reqSinrDb('eht', rungOf('sta-2')), 'the requirement that does')
    for (const v of [snrA, snrB]) same(v, farSnr, 'the SNR both are measured against')
    for (const v of everyFig(/留 (\d+) dB 余量，而/g, 'the margin the quiz adds', 1)) {
      expect(val(v), 'the same margin').toBe(RATE_MARGIN_DB)
    }
    const { p } = solveBianchi({ n: 3, W: CW_MIN + 1, m: 6, attempts: SHORT_RETRY_LIMIT })
    same(raw(quiz, /碰撞概率反而升到 ([\d.]+) %/, 'the collision probability with three')[0],
      100 * p, 'three contenders')
  })

  /**
   * **The first pass left eight sites unread, and every one of them was a restatement.** The
   * sweep's own list: the preamble where `picture` names it, the width where the plan restates
   * it, the two rungs and the three margins of the quiz's arithmetic, and the precision `limits`
   * claims. The reads above take each figure where it is derived; this takes the rest.
   */
  it('the figures the brief prints more than once, at every one of their sites', () => {
    // 「20 MHz」: the noise sentence, the (a) table, step 1 of the plan, `limits` and `sources`
    for (const v of everyFig(/(\d+) MHz/g, 'the width', 4)) {
      expect(val(v), 'the width every device in this flat runs at').toBe(node('ap').caps.widthMhz)
    }
    // 「48 µs」: `picture` quotes the preamble the previous lesson measured
    for (const v of everyFig(/量到的 (\d+) µs/g, 'the preamble `picture` quotes', 1)) {
      expect(val(v) * 1000, 'the preamble of this generation').toBe(PHY_MODES.eht.preambleNs)
    }
    // the quiz argues about two rungs: the one the far laptop takes and the one above it
    const quiz = tier1Project.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    const rungs = new Set([...quiz.matchAll(/MCS (\d+)/g)].map((m) => val(m[1])))
    expect([...rungs].sort((a, b) => a - b), 'the rung it takes and the rung it cannot')
      .toEqual([rungOf('sta-2'), rungOf('sta-2') + 1])
    // and every 「+ 3」 in its arithmetic is the margin
    for (const v of everyFig(/\+ (\d+) 超过了|\+ (\d+) 装得进|\+ (\d+) 装不进/g,
      'the margin the quiz adds', 3)) {
      expect(val(v), 'the margin a rung is taken with').toBe(RATE_MARGIN_DB)
    }
    // 「能把一次交互算到 0.1 µs」 is a claim about precision, and the precision it claims is the
    // decimal the (b) table prints its exchanges to — the exchange is a sum of exact constants.
    const exch = raw(rowOf('numbers', '每符号比特', '书房笔记本')[5], /= ([\d.]+) µs/,
      'the exchange the table prints')[0]
    const dp = (exch.split('.')[1] ?? '').length
    const [tenth] = figs(tier1Project.limits.map((x) => x.text).join('\n'), /算到 ([\d.]+) µs/,
      'the precision the model claims')
    expect(tenth, 'the precision is the decimal the table prints its exchanges to')
      .toBe(10 ** -dp)
    expect(times(rungOf('sta-1')).tsNs % (tenth * 1000), 'and the exchange really is exact to it')
      .toBe(0)
  })
})
