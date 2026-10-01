/**
 * Every empirical claim in 「一次发送，同时是问也是答」, measured against the lesson's own
 * scenarios. Each assertion names the sentence it guards.
 *
 * The rule this file exists for: the lesson prints slot counts, range counts, a
 * per-participant split, six frame lengths, a participant cap, two accuracy
 * figures and a walled round's losses. Every one of them is read back out of a
 * **whole round** run here, or recomputed from the engine's own exports
 * (src/uwb/phy.ts, src/uwb/session.ts) — nothing below is a number typed twice.
 *
 * Whole rounds, and not a helper, for the reason the slice ledger records: this
 * slice's headline is a number about a round, and two features on this branch
 * looked finished while doing nothing at all, which only running a round exposed.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BYTES, CAP, CAP_BYTES, ERR, ERR_PER_SLOT_M, FIG, PARTICIPANTS, PLACES, PPM, TABLE_NS, WALLED,
  WALLED_PARTICIPANTS, idOf, m2mSlots, pairsOf, perParticipant, takingTurnsSlots, uwbM2m,
  uwbM2mScenario, uwbM2mTiming,
} from '../../src/course/uwb/uwb-m2m'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES, basisOf } from '../../src/course/curriculum'
import { layoutDiagram } from '../../src/course/diagram'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { UWB_MAX_PSDU_BYTES, uwbM2mBytes, uwbMaxParticipants } from '../../src/uwb/phy'
import { m2mParticipants, roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One block is 200 ms and holds one many-to-many round; 30 ms holds the DS round (24 ms) whole. */
const RUN_NS = 30 * MS

lessonShapeSuite(uwbM2m, { runNs: RUN_NS })

const run = (sc: Scenario): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

/** One unordered pair, as a key: the quantity the lesson's first table counts. */
const pairKey = (a: string, b: string): string => [a, b].sort().join('~')

/** The base scene's own run — the one every claim about "this round" is read from. */
const base = runOf(uwbM2m, undefined, RUN_NS)
const ranges = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE')
const air = (rs: TLRecord[]) => ofType(rs, 'TX_START')
const errsOf = (rs: TLRecord[]): number[] => ranges(rs).map((r) => Math.abs(r.distM - r.trueDistM))
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * The same N devices the way the engine could already range them: each takes a
 * turn as the tag while the rest answer as anchors. The arrangement the lesson's
 * first table prices, and its slots and records are summed over all N rounds
 * because all N of them have to happen.
 */
function takingTurns(n: number): { slots: number; records: number; pairs: Set<string> } {
  const from = uwbM2mScenario('ss', n)
  let slots = 0
  let records = 0
  const pairs = new Set<string>()
  for (let k = 0; k < n; k++) {
    const nodes: NodeCfg[] = from.nodes.map((node, i) => ({
      ...node, uwb: { ...node.uwb!, role: i === k ? 'tag' : 'anchor' },
    }))
    const sc: Scenario = {
      ...from, nodes,
      uwb: { ...from.uwb!, mode: 'twr', method: 'ss', replyTime: 'embedded' },
    }
    const rs = run(sc)
    const rounds = ofType(rs, 'UWB_ROUND')
    expect(rounds, `taking turns N=${n}, ${idOf(k)}'s turn`).toHaveLength(1)
    slots += rounds[0].slots
    for (const r of ranges(rs)) {
      records += 1
      pairs.add(pairKey(r.node, r.peer))
    }
  }
  return { slots, records, pairs }
}

describe('uwb-m2m · where it sits in the course', () => {
  it('is the many-to-many lesson, checked against the published standard alone', () => {
    expect(MODULES[uwbM2m.module].title).toBe('多对多测距')
    // 「这一课完全不依赖任何草案」: the module inherits its tier's published revision and
    // declares nothing of its own (a module that restates its tier is data that can drift).
    expect(basisOf(uwbM2m.module)).toEqual(['ieee-802-15-4-2024'])
    expect(MODULES[uwbM2m.module].basis).toBeUndefined()
    expect(uwbM2m.needs).toEqual(['uwb-sstwr', 'uwb-dstwr'])
    const src = uwbM2m.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('§10.32.6')
    expect(src).toContain('§10.32.7')
    // no draft number and no contribution number anywhere in the provenance
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
  })

  it('reads right after the contention lesson', () => {
    expect(COURSE_ORDER.indexOf('uwb-m2m')).toBe(COURSE_ORDER.indexOf('uwb-contention') + 1)
  })

  it('writes no cap as a literal: every count in the lesson is computed', () => {
    // 「代码里不许出现字面量作为上限」 — the cap, the frame lengths and the slot counts all come
    // from `phy.ts`/`session.ts`, so neither 27 nor 127 may appear as a number in the lesson's
    // CODE. Comments are stripped first: a doc comment naming the 127-octet PSDU is prose about
    // the rule, not a second copy of it, and a rule that forbade it would be the reason the next
    // author stopped explaining where the cap comes from.
    const code = readFileSync(new URL('../../src/course/uwb/uwb-m2m.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '')
    expect(code).not.toMatch(/(?<![\d.])27(?![\d.])/)
    expect(code).not.toMatch(/(?<![\d.])127(?![\d.])/)
  })

  it('declares five limits, each of a named kind and none of them the banned sentence', () => {
    expect(uwbM2m.limits).toHaveLength(5)
    expect(uwbM2m.limits.map((l) => l.kind))
      .toEqual(['model-value', 'unmodelled', 'unmodelled', 'out-of-scope', 'out-of-scope'])
    const text = uwbM2m.limits.map((l) => l.text).join('\n')
    // Each entry names the engine it was checked against, not a feeling about the model.
    expect(text).toContain('m2mParticipants')
    expect(text).toContain('byCodeUnit')
    expect(text).toContain('ARC_IE_BYTES')
    expect(text).toContain('nbChannelForBlock')
    expect(text).toContain('§10.32.8')
    expect(text).toContain('SRRR')
    expect(text).toContain('solvePosition')
    // The SP3 entry says what SP3 cannot do and why that makes it a separate road —
    // it used to claim the clause's mechanism could not be established from the corpus,
    // which was false: the published standard's full text is in the corpus, and only
    // *this repo* holds the clause list. A limits entry asserting its own evidence is
    // missing has to be checked against where the evidence actually is.
    expect(text).toContain('带不了时间')
    expect(text).not.toContain('举证不足')
    expect(text).not.toContain('uwb-clause-list.txt')
    // 「不许写『本仿真器有简化』」, in both spellings.
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
    // and no limit claims the standard is a draft (§10.32.6/§10.32.7 are published)
    expect(text).not.toContain('草案')
  })

  it('names every engine symbol its limits point at', () => {
    const exported = (file: string, symbol: string): boolean =>
      new RegExp(`export (?:const|function|class|interface|type) ${symbol}\\b`)
        .test(readFileSync(new URL(`../../src/uwb/${file}`, import.meta.url), 'utf8'))
    expect(exported('session.ts', 'm2mParticipants')).toBe(true)
    expect(exported('phy.ts', 'ARC_IE_BYTES')).toBe(true)
    expect(exported('phy.ts', 'RDM_IE_FIXED_BYTES')).toBe(true)
    expect(exported('nb.ts', 'nbChannelForBlock')).toBe(true)
    expect(exported('position.ts', 'solvePosition')).toBe(true)
  })
})

describe('uwb-m2m · the scene', () => {
  const sc = uwbM2m.scenario()

  it('is six UWB devices at six places, no two pairwise distances alike', () => {
    expect(sc.nodes).toHaveLength(PARTICIPANTS)
    expect(sc.nodes.map((n) => n.id)).toEqual(PLACES.map((_p, i) => idOf(i)))
    for (const [i, n] of sc.nodes.entries()) {
      expect([n.pos.x, n.pos.y]).toEqual([PLACES[i].x, PLACES[i].y])
      expect(n.uwb!.ppm).toBe(PPM[i])
    }
    const d = (i: number, j: number) => Math.hypot(PLACES[i].x - PLACES[j].x, PLACES[i].y - PLACES[j].y)
    const all: number[] = []
    for (let i = 0; i < PARTICIPANTS; i++) for (let j = i + 1; j < PARTICIPANTS; j++) all.push(Math.round(d(i, j) * 1000))
    expect(new Set(all).size, 'every pairwise distance distinct').toBe(all.length)
    expect(all.length).toBe(pairsOf(PARTICIPANTS))
  })

  it('runs many-to-many SS with only the clock-offset residual left switched on', () => {
    // 「把多径的附加时延与时间戳噪声都关掉，只留下载波频偏估计的 0.2 ppm 残差」
    expect(sc.uwb!.mode).toBe('m2m')
    expect(sc.uwb!.method).toBe('ss')
    expect(sc.uwb!.nlos).toBe(false)
    expect(sc.uwb!.tsNoisePs).toBe(0)
    expect(sc.uwb!.cfoNoisePpm).toBe(DEFAULT_UWB_SESSION.cfoNoisePpm)
    // and the round belongs to the whole group: one round per block, N slots
    const plan = roundPlan(sc.uwb!, PARTICIPANTS)
    expect(plan.participants).toBe(PARTICIPANTS)
    expect(plan.roundsPerBlock).toBe(1)
  })

  it('puts the participants in the slot order the ids give, so participant i is p-i', () => {
    // 「顺序按节点 id 排」 — the lesson's whole asymmetry is stated in terms of this order.
    expect(m2mParticipants(sc.nodes)).toEqual(PLACES.map((_p, i) => idOf(i)))
  })

  it('offers DS and the walled round as its variants, and nothing else', () => {
    expect(uwbM2m.variants!.map((v) => v.scenario().uwb!.method)).toEqual(['ds', 'ss'])
    const walled = uwbM2m.variants![1].scenario()
    expect(walled.nodes).toHaveLength(WALLED_PARTICIPANTS)
    // three brick partitions more than the open scene's shell
    expect(walled.walls.length).toBe(uwbM2m.scenario().walls.length + 3)
    expect(walled.walls.slice(-3).every((w) => w.material === 'brick')).toBe(true)
  })
})

describe('uwb-m2m · N slots where taking turns needs N² (design §1)', () => {
  it('measures every cell of the first table from whole rounds, for N = 3/4/6', () => {
    for (const n of TABLE_NS) {
      const m2m = run(uwbM2mScenario('ss', n))
      const ds = run(uwbM2mScenario('ds', n))
      const turns = takingTurns(n)
      const rounds = ofType(m2m, 'UWB_ROUND')
      expect(rounds.length, `N=${n}: a round ran at all`).toBeGreaterThan(0)
      // the four numbers the table's row prints
      expect(rounds[0].slots, `N=${n}: 多对多 SS 时隙`).toBe(m2mSlots(n, 'ss'))
      expect(ofType(ds, 'UWB_ROUND')[0].slots, `N=${n}: 多对多 DS 时隙`).toBe(m2mSlots(n, 'ds'))
      expect(turns.slots, `N=${n}: 轮流当标签的时隙`).toBe(takingTurnsSlots(n))
      expect(turns.records, `N=${n}: 轮流当标签的距离记录`).toBe(2 * pairsOf(n))
      // …and both arrangements really measure the same pairs
      expect(ranges(m2m), `N=${n}: one range per pair`).toHaveLength(pairsOf(n))
      expect(new Set(ranges(m2m).map((r) => pairKey(r.node, r.peer))).size).toBe(pairsOf(n))
      expect(turns.pairs.size, `N=${n}: taking turns measures the same pairs`).toBe(pairsOf(n))
      // 「轮流当标签的时隙数 ÷ 多对多的时隙数 = N」
      expect(turns.slots / rounds[0].slots, `N=${n}: the ratio`).toBe(n)
    }
  })

  it('gets every distance right, to what the reply interval allows', () => {
    // 「折成距离约 0.06 m 一个时隙」: the error of a pair k slots apart is a gaussian draw of
    // roughly k × ERR_PER_SLOT_M, so 2σ is the bound to hold it to — not k × ERR_PER_SLOT_M
    // itself, which the draw legitimately exceeds (p-2→p-4 measures 1.3σ). The exact worst
    // figure is pinned in the accuracy suite below; this is the shape of the whole set.
    for (const r of ranges(base)) {
      const slotsApart = Number(r.peer.slice(2)) - Number(r.node.slice(2))
      expect(Math.abs(r.distM - r.trueDistM), `${r.node}→${r.peer}`)
        .toBeLessThan(2 * ERR_PER_SLOT_M * slotsApart)
    }
  })
})

describe('uwb-m2m · only the earlier participant of a pair can compute it (design §2)', () => {
  it('gives participant i exactly N−1−i ranges, as the table prints them', () => {
    const got = Array.from({ length: PARTICIPANTS }, (_, i) => ranges(base).filter((r) => r.node === idOf(i)).length)
    expect(got).toEqual(perParticipant(PARTICIPANTS))
    expect(got[0]).toBe(PARTICIPANTS - 1)
    expect(got[PARTICIPANTS - 1], '排在最后的参与者一条也算不出来').toBe(0)
    expect(got.reduce((a, b) => a + b, 0)).toBe(pairsOf(PARTICIPANTS))
    // every range names a participant later in the round than the device holding it
    for (const r of ranges(base)) expect(r.node < r.peer, `${r.node}→${r.peer}`).toBe(true)
    // the N = 3 row of the same table, measured in its own round
    const three = run(uwbM2mScenario('ss', 3))
    expect(Array.from({ length: 3 }, (_, i) => ranges(three).filter((r) => r.node === idOf(i)).length))
      .toEqual(perParticipant(3))
  })

  it('makes the last participant send the longest frame of the round and compute nothing', () => {
    const txs = air(base)
    expect(txs, 'one transmission per participant').toHaveLength(PARTICIPANTS)
    expect(txs.map((r) => r.node)).toEqual(PLACES.map((_p, i) => idOf(i)))
    // 「20 / 26 / 30 / 34 / 38 / 42 字节」, off the air and against `uwbM2mBytes`
    expect(txs.map((r) => r.frame.bytes)).toEqual(BYTES)
    expect(BYTES).toEqual(PLACES.map((_p, i) => uwbM2mBytes(i)))
    expect(Math.max(...BYTES)).toBe(BYTES[PARTICIPANTS - 1])
    expect(ranges(base).filter((r) => r.node === idOf(PARTICIPANTS - 1))).toHaveLength(0)
  })

  it('derives the participant cap instead of quoting it, and the cap is the last frame’s', () => {
    expect(CAP).toBe(uwbMaxParticipants('ss'))
    expect(uwbMaxParticipants('ds'), 'SS and DS share one frame-size law').toBe(CAP)
    expect(CAP_BYTES.fits).toBe(uwbM2mBytes(CAP - 1))
    expect(CAP_BYTES.over).toBe(uwbM2mBytes(CAP))
    expect(CAP_BYTES.fits).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(CAP_BYTES.over).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    // 「编辑器里加到 CAP + 1 人会被拒，理由正是这一句」 — the scene the lesson ships holds six,
    // so the refusal is measured on a scene built here: CAP + 1 devices on a 1 m grid in the
    // same hall, which differs from the lesson's only in how many participants it has.
    const crowd = uwbM2mScenario('ss')
    const over = ScenarioSchema.safeParse({
      ...crowd,
      nodes: Array.from({ length: CAP + 1 }, (_v, i) => ({
        ...crowd.nodes[0], id: `q-${String(i).padStart(2, '0')}`, name: `Q${i}`,
        pos: { x: 1 + (i % 14), y: 1 + Math.floor(i / 14), z: 1 },
      })),
    })
    expect(over.success).toBe(false)
    expect(over.success ? '' : over.error.issues.map((x) => x.message).join('\n')).toContain('最多容纳')
  })
})

describe('uwb-m2m · the figure and the timeline agree (design §4)', () => {
  it('draws each frame where the run actually put it', () => {
    const ends = ofType(base, 'TX_END').map((r) => r.t / 1000)
    expect(ends).toEqual(FIG.endsUs)
    expect(FIG.slotUs).toBe(uwbM2m.scenario().uwb!.slotRstu * 2000 / 2400)
    const spans = uwbM2mTiming().lanes[1].spans
    expect(spans.map((s) => s.toUs)).toEqual(FIG.endsUs)
    expect(spans.map((s) => s.fromUs)).toEqual(BYTES.map((_b, i) => i * FIG.slotUs))
    // and it lays out: the shared diagram suite grades every lesson figure, this pins it here too
    expect(layoutDiagram(uwbM2mTiming()).shapes.length).toBeGreaterThan(BYTES.length)
  })

  it('sees the first range only after the SECOND frame lands', () => {
    // 「第一条测距行出现在 2.194 ms，也就是第二帧落地那一刻，而不是第一帧落地时」
    const first = ranges(base)[0]
    expect((first.t / MS).toFixed(3)).toBe((FIG.endsUs[1] / 1000).toFixed(3))
    expect(first.t / 1000).toBeGreaterThan(FIG.endsUs[0])
    expect([first.node, first.peer]).toEqual([idOf(0), idOf(1)])
  })
})

describe('uwb-m2m · DS costs 2N slots and buys accuracy (design §3)', () => {
  it('measures both columns of the accuracy table from the lesson’s own two scenes', () => {
    const ss = errsOf(base)
    const ds = errsOf(run(uwbM2m.variants![0].scenario()))
    expect(ss).toHaveLength(pairsOf(PARTICIPANTS))
    expect(ds).toHaveLength(pairsOf(PARTICIPANTS))
    expect(Math.max(...ss).toFixed(4)).toBe(ERR.ssMax)
    expect(mean(ss).toFixed(4)).toBe(ERR.ssMean)
    expect(Math.max(...ds).toFixed(6)).toBe(ERR.dsMax)
    expect(mean(ds).toFixed(6)).toBe(ERR.dsMean)
    expect(Math.round(Math.max(...ss) / Math.max(...ds))).toBe(ERR.ratio)
    // the DS round really is the two passes, and it measures the same pairs
    const dsRun = run(uwbM2m.variants![0].scenario())
    expect(ofType(dsRun, 'UWB_ROUND')[0].slots).toBe(2 * PARTICIPANTS)
    expect(air(dsRun).map((r) => r.frame.bytes)).toEqual([...BYTES, ...BYTES])
  })

  it('bounds SS’s worst pair by the reply interval it is made of, and names that pair', () => {
    // 「2 ms 的时隙配上 0.2 ppm 的估计残差，折成距离约 0.06 m 一个时隙；误差最大的那一对恰好
    // 是相隔 4 个时隙的 p-0 与 p-4」 — the derivation and the measurement, one against the other.
    const worst = ranges(base).reduce((a, b) =>
      Math.abs(b.distM - b.trueDistM) > Math.abs(a.distM - a.trueDistM) ? b : a)
    expect([worst.node, worst.peer]).toEqual([...ERR.worstPair])
    const slotsApart = Number(worst.peer.slice(2)) - Number(worst.node.slice(2))
    expect(slotsApart).toBe(ERR.worstSlots)
    expect(ERR_PER_SLOT_M).toBeCloseTo(0.06, 3)
    expect(Math.abs(worst.distM - worst.trueDistM)).toBeLessThanOrEqual(ERR_PER_SLOT_M * slotsApart)
  })
})

describe('uwb-m2m · an arrival nobody heard is a range that does not exist (design §6)', () => {
  it('loses exactly the pairs the walled participant was the earlier half of', () => {
    const open = run(uwbM2mScenario('ss', WALLED_PARTICIPANTS))
    const walled = run(uwbM2m.variants![1].scenario())
    expect(ranges(open), 'the open round of four').toHaveLength(pairsOf(WALLED_PARTICIPANTS))
    expect(ranges(walled), '「剩下只有 3 对」').toHaveLength(WALLED.pairs)
    const per = Array.from({ length: WALLED_PARTICIPANTS },
      (_v, i) => ranges(walled).filter((r) => r.node === idOf(i)).length)
    expect(per, '「每人 2、1、0 条」').toEqual([...WALLED.per])
    // …what is left is the surviving three's own many-to-many round
    expect(per.slice(1)).toEqual(perParticipant(WALLED_PARTICIPANTS - 1))
    for (const r of ranges(walled)) expect([r.node, r.peer]).not.toContain(idOf(0))
    // 「空口上也看得见，后面每一帧都短了一截：20 / 20 / 26 / 30 字节」
    expect(air(walled).map((r) => r.frame.bytes)).toEqual([...WALLED.bytes])
    expect(air(open).map((r) => r.frame.bytes)).toEqual(BYTES.slice(0, WALLED_PARTICIPANTS))
    // and the ranges that survive are still right: the walls removed pairs, they did not corrupt one
    for (const r of ranges(walled)) expect(Math.abs(r.distM - r.trueDistM)).toBeLessThanOrEqual(Number(ERR.ssMax))
  })
})
