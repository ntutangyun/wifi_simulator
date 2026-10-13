/**
 * Every empirical claim in 「一个零内容的信息单元，不是一条空消息」, measured against runs.
 *
 * The lesson prints two opener lengths, a window total, a per-window saving and the per-block
 * number the first design draft got wrong, a ranging-record count, a 13-octet frame, and two
 * counts of what an initiator holds when a responder does not answer. Every one of them is read
 * back out of a simulation or recomputed from the engine's own exports — nothing here is a number
 * typed twice.
 *
 * Two runs that the lesson's own scenarios cannot provide are built here, and both are named in
 * the lesson's `sources`:
 *
 *  - the four-block comparison, because `uwb-record-hashes` runs seven blocks and the arithmetic
 *    of design §2.2 is per validity window;
 *  - the moved-anchor run of §10.34, because nothing in a scenario moves by itself and UWB
 *    reception here is deterministic, so no static scene can produce a responder that holds a
 *    valid control message and missed *this* block's initiation message. It is the same scene
 *    tests/uwb/rmnr-round.test.ts measures the feature with.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, FIG, INIT_BYTES, MOVED, PLACES, RANGE_ROWS, RCM_BYTES, RMNR_BYTES, SAVED_PER_BLOCK,
  SAVED_PER_WINDOW, SAVED_SPREAD, VALIDITY, WALLED, WALLED_ANCHOR, WINDOW, WINDOW_BYTES,
  openerBytes, uwbRcmValidity, uwbRcmValidityScenario, uwbRcmValidityTiming,
} from '../../src/course/uwb/uwb-rcm-validity'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { diagramTexts } from '../../src/course/diagram'
import {
  ARC_IE_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES, UWB_MHR_BYTES, UWB_TX_POWER_DBM, rdmIeBytes,
  rstuNs, uwbInitBytes, uwbPollBytes, uwbRmnrBytes,
} from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { uwbAncillary } from '../../src/course/uwb/uwb-ancillary'
import { uwbAncillaryRequest } from '../../src/course/uwb/uwb-ancillary-request'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS
/** One block, read off the plan rather than retyped. */
const BLOCK_NS = roundPlan(uwbRcmValidityScenario().uwb!, ANCHORS).blockNs
/** Four blocks: the period the saving is per (design §2.2). */
const WINDOW_NS = VALIDITY * BLOCK_NS - MS

lessonShapeSuite(uwbRcmValidity, { runNs: RUN_NS })

const run = (sc: Scenario, ns: number = RUN_NS): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ns).records]
}

/** The frame the tag opened each block with, as the air carried it. */
const openers = (rs: TLRecord[]): { block: number; kind: string; bytes: number; ies: string[] }[] =>
  ofType(rs, 'TX_START')
    .filter((r) => r.node === 'uwb-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
    .map((r) => ({
      block: r.frame.uwb?.block ?? -1, kind: r.frame.kind, bytes: r.frame.bytes,
      ies: [...(r.frame.uwb?.ies ?? [])],
    }))

describe('uwb-rcm-validity · where it sits in the course', () => {
  it('is the validity-window lesson of its own module, checked against the published standard alone', () => {
    expect(MODULES[uwbRcmValidity.module].title).toBe('控制消息的有效期')
    expect(MODULES[uwbRcmValidity.module].tier).toBe(5)
    // 「本课完全不依赖任何草案」: the module inherits the published revision from its tier and
    // declares nothing of its own, so the two can never drift apart.
    expect(MODULES[uwbRcmValidity.module].basis).toBeUndefined()
    expect(basisOf(uwbRcmValidity.module)).toEqual(['ieee-802-15-4-2024'])
    // `uwb-dstwr` added 2026-10-04: this lesson's main path runs a DS-TWR round — the diagram
    // caption names 「四个应答」「四个报告」 and 「标签自己发的 Final」 — and its numbers quote the
    // FoM byte. `uwb-dstwr` is where Final and Report are taught, and it reaches `uwb-sstwr`,
    // which is where the FoM byte is first named, so the one id closes both gaps. `uwb-geometry`
    // is deliberately NOT asked for: this lesson only lists the byte among the fields that did
    // not change, and never asks the reader to read one.
    expect(uwbRcmValidity.needs).toEqual(['uwb-frame', 'uwb-blocks', 'uwb-dstwr'])
    const src = uwbRcmValidity.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    // the two clauses the lesson rests on, and the sentence it quotes from §10.34.2.1
    expect(src).toContain('§10.32.9.1')
    expect(src).toContain('§10.34.2.1')
  })

  it('declares five limits, each about something the engine does not do', () => {
    expect(uwbRcmValidity.limits).toHaveLength(5)
    expect(uwbRcmValidity.limits.map((l) => l.kind))
      .toEqual(['unmodelled', 'unmodelled', 'unmodelled', 'out-of-scope', 'model-value'])
    const text = uwbRcmValidity.limits.map((l) => l.text).join('\n')
    expect(text).toContain('MCPS') // no primitive: both settings are scenario configuration
    expect(text).toContain('ARC_IE_BYTES') // the other control bits are sized, not laid out
    expect(text).toContain('slotAction') // and the slot table is the session's, not a parsed RDM IE
    // §10.35 is a later slice, and the reason is slice size, not lack of evidence: the
    // mechanism is named, which is what says it was read. §10.36 of the same clause family IS
    // built now (`uwb-receipt`), so this limit says so rather than leaving a false claim
    // standing — the slice that changes a statement updates it.
    expect(text).toContain('§10.35')
    expect(text).toContain('§10.36')
    expect(text).toContain('RAICT')
    expect(text).toContain('RMMRC')
    expect(text).toContain('举证不足')
    expect(text).toContain('排程能不能被请求改变')
    // …and §10.35's Request = 0 half IS built now (`@uwb-ancillary`), so this limit is narrowed to
    // the half that is still out rather than left claiming the whole clause is unbuilt. The reason
    // it is a separate cut survives the narrowing: scope, not lack of evidence.
    expect(text).toContain('Request 置 0 的那一半')
    expect(text).toContain('@uwb-ancillary')
    expect(text).toContain('没建的是 Request 置 1 的那一半')
    expect(text).not.toContain('§10.35 的辅助信息交换还没建')
    expect(text).not.toContain('§10.35 的测距辅助信息还没建')
    // the one phrasing that is now false: this lesson must not claim §10.36 is unbuilt
    expect(text).not.toContain('§10.36 的多消息收妥确认都还没建')
    expect(text).not.toContain('§10.36 的多消息收妥确认还没建')
    // nor may the bit-15 sentence read as "nobody built it" — the next lesson builds it, and
    // the limit's real point survives: it is a session switch, not a parsed control bit.
    expect(text).not.toContain('第 15 位是 §10.36 的那个请求位，本课也没有建它')
    expect(text).toContain('不是从控制字里解出来的一位')
    // the validity window counts blocks in this engine, and the limit says whose dimension that is
    expect(text).toContain('blockCarriesRcm')
    // the banned sentence, in both spellings
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
  })
})

describe('uwb-rcm-validity · one control message for four blocks', () => {
  const shared = run(uwbRcmValidityScenario(VALIDITY), WINDOW_NS)
  const every = run(uwbRcmValidityScenario(1), WINDOW_NS)

  it('opens block 0 with the control message and the rest of the window with the initiation message', () => {
    const o = openers(shared)
    // Empty here would mean the round never reached the point that produces an opener.
    expect(o.map((x) => x.block)).toEqual(WINDOW)
    expect(o.map((x) => x.kind)).toEqual(['uwbPoll', 'uwbInit', 'uwbInit', 'uwbInit'])
    // 「第 0 块 39 字节，第 1 块 14 字节」 — the two numbers the lesson prints, off the air.
    expect(o.map((x) => x.bytes)).toEqual(WINDOW.map((b) => openerBytes(b, VALIDITY)))
    expect(o.map((x) => x.bytes)).toEqual([39, 14, 14, 14])
    expect(RCM_BYTES).toBe(uwbPollBytes(ANCHORS))
    expect(INIT_BYTES).toBe(uwbInitBytes())
  })

  it('every block of an R = 1 session still carries the whole control message', () => {
    const o = openers(every)
    expect(o.map((x) => x.kind)).toEqual(WINDOW.map(() => 'uwbPoll'))
    expect(o.map((x) => x.bytes)).toEqual(WINDOW.map((b) => openerBytes(b, 1)))
    expect(o.map((x) => x.bytes)).toEqual([39, 39, 39, 39])
  })

  it('「ARC 与 RDM 都不在了」: the later blocks carry the RRMC IE and nothing else', () => {
    const o = openers(shared)
    expect(o[0].ies).toEqual(['ARC', 'RDM', 'RRMC'])
    for (const x of o.slice(1)) {
      expect(x.ies, `block ${x.block}`).toEqual(['RRMC'])
    }
    for (const x of openers(every)) expect(x.ies, `R=1 block ${x.block}`).toEqual(['ARC', 'RDM', 'RRMC'])
  })

  it('「合计 156 字节对 81 字节」, and the saving is (R − 1)(13 + 3A) per window', () => {
    const total = (rs: TLRecord[]): number => openers(rs).reduce((s, o) => s + o.bytes, 0)
    expect(total(every)).toBe(WINDOW_BYTES.every)
    expect(total(shared)).toBe(WINDOW_BYTES.shared)
    expect(WINDOW_BYTES.every).toBe(156)
    expect(WINDOW_BYTES.shared).toBe(81)
    expect(total(every) - total(shared)).toBe(SAVED_PER_WINDOW)
    expect(SAVED_PER_WINDOW).toBe((VALIDITY - 1) * (13 + 3 * ANCHORS))
    expect(SAVED_PER_WINDOW).toBe(75)
    // 「ARC 10 字节，RDM 15 字节，合起来 25 字节」 — the two IEs that bought the window.
    expect(SAVED_PER_BLOCK).toBe(ARC_IE_BYTES + rdmIeBytes(ANCHORS))
    expect(SAVED_PER_BLOCK).toBe(13 + 3 * ANCHORS)
    // 「摊到每个块是 18.75 字节，不是 75 字节」 — the per-block figure, which is the one the
    // design's first draft got wrong by a factor of four.
    expect(SAVED_SPREAD).toBe(SAVED_PER_WINDOW / VALIDITY)
    expect(SAVED_SPREAD).toBe(18.75)
  })

  it('「32 条测距结果逐字段相同」, with the default timestamp noise left on', () => {
    // `seq` is a position in the record stream rather than a field of the measurement, and the
    // shorter opener does move the tag's own tx→idle instant; `t` is not dropped.
    const ranges = (rs: TLRecord[]): unknown[] =>
      ofType(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(shared).length).toBe(RANGE_ROWS)
    expect(RANGE_ROWS).toBe(2 * ANCHORS * VALIDITY)
    expect(RANGE_ROWS).toBe(32)
    expect(ranges(shared)).toEqual(ranges(every))
    // …and the noise really is on, which is what makes the identity worth asserting.
    expect(uwbRcmValidityScenario().uwb!.tsNoisePs).toBeGreaterThan(0)
    expect(uwbRcmValidityScenario().uwb!.tsNoisePs).toBe(100)
  })
})

describe('uwb-rcm-validity · the window turns over', () => {
  const rs = runOf(uwbRcmValidity, undefined, RUN_NS)

  it('「第 4 块又回到 39 字节」: seven blocks, and a control message on block 0 and block 4', () => {
    const o = openers(rs)
    expect(o.map((x) => x.block)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(o.map((x) => x.bytes)).toEqual([39, 14, 14, 14, 39, 14, 14])
    expect(o.map((x) => x.bytes)).toEqual(o.map((x) => openerBytes(x.block, VALIDITY)))
    // the jump the second `watch` block sends the reader to resolves to that very frame
    const turn = ofType(rs, 'TX_START').filter(uwbRcmValidity.jumps[2].find)
    expect(turn).toHaveLength(1)
    expect(turn[0].frame.kind).toBe('uwbPoll')
    expect(turn[0].frame.uwb?.block).toBe(VALIDITY)
  })

  it('「测距行照旧每个块四条，位置也照旧每个块解出来」', () => {
    const byBlock = new Map<number, number>()
    for (const r of ofType(rs, 'UWB_RANGE').filter((x) => x.node === 'uwb-1')) {
      byBlock.set(r.block, (byBlock.get(r.block) ?? 0) + 1)
    }
    expect([...byBlock.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const [b, n] of byBlock) expect(n, `block ${b}`).toBe(ANCHORS)
    expect(ofType(rs, 'UWB_POSITION').map((r) => r.anchors.length)).toEqual(Array(7).fill(ANCHORS))
    // and no slot went silent in the base scene, so the walled variant's timeouts are its own
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(0)
  })
})

describe('uwb-rcm-validity · the responder that never held a control message', () => {
  const rs = runOf(uwbRcmValidity, 1, RUN_NS)

  it('builds the scene it claims to: the walled anchor hears no opener, the other three hear all seven', () => {
    const heard = (node: string): number =>
      ofType(rs, 'UWB_TS').filter((r) => r.node === node && r.dir === 'rx'
        && (r.frameKind === 'uwbPoll' || r.frameKind === 'uwbInit')).length
    expect(heard(WALLED_ANCHOR)).toBe(0)
    for (const p of PLACES.filter((x) => x.id !== WALLED_ANCHOR)) expect(heard(p.id), p.id).toBe(7)
  })

  it('「即使这个交互已经打开，它也一帧 RMNR 都不发」', () => {
    // The physical floor of §10.34, not an edge case: the slot table is the RDM IE's, and this
    // anchor never decoded one, so it has no slot of its own to speak in.
    expect(uwbRcmValidityScenario(VALIDITY, true, true).uwb!.rmnr).toBe(true)
    expect(ofType(rs, 'UWB_RMNR')).toHaveLength(WALLED.rmnr)
    expect(ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRmnr')).toHaveLength(0)
    expect(ofType(rs, 'TX_START').filter((r) => r.node === WALLED_ANCHOR)).toHaveLength(0)
  })

  it('「每个块留下 2 次超时，而发起方靠剩下 3 台照旧解出位置」', () => {
    const atTag = ofType(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'uwb-1')
    expect(atTag.map((r) => r.peer)).toEqual(Array(7 * WALLED.timeoutsPerBlock).fill(WALLED_ANCHOR))
    expect(WALLED.timeoutsPerBlock).toBe(2)
    const fixes = ofType(rs, 'UWB_POSITION')
    expect(fixes).toHaveLength(7)
    for (const f of fixes) {
      expect(f.anchors).toHaveLength(WALLED.anchorsInFix)
      expect(f.anchors).not.toContain(WALLED_ANCHOR)
    }
    expect(WALLED.anchorsInFix).toBe(ANCHORS - 1)
  })
})

/**
 * §10.34's own responder: one that received a control message and then lost the initiation
 * message of the blocks that control message still covers.
 *
 * It cannot be a lesson scenario. Nothing in a scenario moves by itself, and this engine's UWB
 * reception is a deterministic power comparison (`UwbChannel`'s sensitivity gate), so in a static
 * scene a responder either hears every opener or none. The scene below is therefore the
 * acceptance scene of tests/uwb/rmnr-round.test.ts, in the lesson's own words: the tag transmits
 * 10 dB below the anchors, `anc-walk` starts 5 m away and is moved to 16 m before block 1, and
 * `anc-far` sits at 16 m from the start and so never holds a control message at all.
 */
describe('uwb-rcm-validity · the measurement the lesson quotes for the non-receipt exchange', () => {
  const TAG_DBM = UWB_TX_POWER_DBM - 10
  const uwbNode = (id: string, x: number, y: number, role: 'anchor' | 'tag', dbm = UWB_TX_POWER_DBM): NodeCfg => ({
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: dbm, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} }, uwb: { role, ppm: 0 },
  })

  function movedRun(rmnr: boolean): TLRecord[] {
    const nodes = [
      uwbNode('anc-1', 0, 0, 'anchor'),
      uwbNode('anc-2', 0, 4, 'anchor'),
      uwbNode('anc-walk', 3, 4, 'anchor'),
      uwbNode('anc-far', 0, 16, 'anchor'),
      uwbNode('tag-1', 0, 0.001, 'tag', TAG_DBM),
    ]
    const session: Partial<UwbSessionCfg> = {
      method: 'ss', replyTime: 'embedded', nlos: false, tsNoisePs: 0, cfoNoisePpm: 0,
      rcmValidityRounds: VALIDITY, rmnr,
    }
    const sc: Scenario = {
      rooms: [{ x: 0, y: 0, w: 40, h: 30, name: 'hall' }], walls: [], nodes, servers: [],
      seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
      uwb: { ...uwbRcmValidityScenario().uwb!, ...session },
    }
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    const sim = new Simulation(sc)
    const before = sim.runUntil(BLOCK_NS / 2).records
    const walker = nodes.find((n) => n.id === 'anc-walk')!
    // In place, because the device holds the same position object its scenario node does — which
    // is what a device that moved means. It lands in the gap between block 0's round and block 1's.
    walker.pos.x = 0
    walker.pos.y = 16
    return [...before, ...sim.runUntil(WINDOW_NS).records]
  }

  const off = movedRun(false)
  const on = movedRun(true)
  const timeouts = (rs: TLRecord[]): string[] =>
    ofType(rs, 'UWB_TIMEOUT').filter((r) => r.node === 'tag-1').map((r) => r.peer)

  it('「7 次无从区分的超时」 with the exchange off', () => {
    expect(ofType(off, 'UWB_RMNR')).toHaveLength(0)
    expect(timeouts(off)).toHaveLength(MOVED.silent)
    expect(MOVED.silent).toBe(7)
    // three of them are the responder that holds a valid control message, four the one that holds
    // none — and the initiator cannot tell the two apart.
    expect(timeouts(off).filter((p) => p === 'anc-walk')).toHaveLength(3)
    expect(timeouts(off).filter((p) => p === 'anc-far')).toHaveLength(4)
  })

  it('「4 次超时加 3 条写明了原因的记录」 with it on, and no range moved', () => {
    const named = ofType(on, 'UWB_RMNR')
    expect(named).toHaveLength(MOVED.named)
    expect(timeouts(on)).toHaveLength(MOVED.timeouts)
    expect(MOVED.named).toBe(3)
    expect(MOVED.timeouts).toBe(4)
    expect(MOVED.silent).toBe(MOVED.timeouts + MOVED.named)
    expect(named.map((r) => [r.peer, r.block])).toEqual([['anc-walk', 1], ['anc-walk', 2], ['anc-walk', 3]])
    // 「从未收到过控制消息的那台始终不发」 — all four of the remaining timeouts are its.
    expect(timeouts(on)).toEqual(Array(4).fill('anc-far'))
    // 「每一条测距结果都一模一样」
    const ranges = (rs: TLRecord[]): unknown[] => ofType(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(on)).toEqual(ranges(off))
  })

  it('「整帧 13 字节」: MHR + a two-octet IE header + FCS, and the RMNR IE is the only one', () => {
    const sent = ofType(on, 'TX_START').filter((r) => r.frame.kind === 'uwbRmnr')
    expect(sent).toHaveLength(MOVED.named)
    for (const r of sent) {
      expect(r.frame.bytes).toBe(RMNR_BYTES)
      expect(r.frame.uwb?.ies).toEqual(['RMNR'])
    }
    expect(RMNR_BYTES).toBe(uwbRmnrBytes())
    expect(RMNR_BYTES).toBe(UWB_MHR_BYTES + UWB_IE_HDR_BYTES + UWB_FCS_BYTES)
    expect(RMNR_BYTES).toBe(13)
    // 「比这一轮里任何一帧都短」 — the shortest frame the session has.
    const shortest = Math.min(...ofType(on, 'TX_START').map((r) => r.frame.bytes))
    expect(shortest).toBe(RMNR_BYTES)
  })
})

describe('uwb-rcm-validity · the figure is the round the engine runs', () => {
  it('reads every boundary off the slot table', () => {
    const plan = roundPlan(uwbRcmValidityScenario().uwb!, ANCHORS)
    expect(FIG.slots).toBe(plan.slots)
    expect(FIG.slotUs).toBe(rstuNs(uwbRcmValidityScenario().uwb!.slotRstu) / 1000)
    // one opener slot, one per anchor, the Final, then one report per anchor
    expect(FIG.responseFrom).toBe(1)
    expect(FIG.finalAt).toBe(1 + ANCHORS)
    expect(FIG.reportFrom).toBe(2 + ANCHORS)
    expect(FIG.slots).toBe(2 + 2 * ANCHORS)
  })

  it('labels the one slot that differs with the two lengths it differs by', () => {
    const labels = diagramTexts(uwbRcmValidityTiming())
    expect(labels).toContain(`控制消息 ${RCM_BYTES} B`)
    expect(labels).toContain(`启动消息 ${INIT_BYTES} B`)
    expect(labels.filter((t) => t === '四个应答')).toHaveLength(2)
  })
})

describe('uwb-rcm-validity · no frame length is written as a literal', () => {
  it('asks the engine for every octet count it prints', async () => {
    // 「代码里不许出现可以算出来的字面量」 — the two opener lengths, the saving and the RMNR frame
    // all come from `phy.ts`/`session.ts`, so 39, 14, 25, 75 and 13 may not appear as numbers in
    // the lesson's CODE. 4 (the anchors, and the window they share a control message over) and 1
    // (the other setting) are the scene's own two integers, declared once each at the top.
    //
    // Two stretches are cut out before the search, and the reason is the same for both: they are
    // prose about where a number comes from rather than a second copy of one.
    //  - the comments, so that a doc comment may name the 14-octet initiation message. A rule
    //    that forbade it is how the next author stops explaining where a number comes from.
    //  - `sources`, which cites the standard's own field layout — RCM Validity Rounds is bits 9
    //    to 14 of the ARC IE's Content Control field, and that 14 is a bit position, not a frame.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const whole = fs
      .readFileSync(path.resolve(__dirname, '../../src/course/uwb/uwb-rcm-validity.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*/g, '')
    const from = whole.indexOf('  sources: [')
    const to = whole.indexOf('  scenario: ', from)
    expect(from, 'sources').toBeGreaterThan(0)
    expect(to, 'scenario after sources').toBeGreaterThan(from)
    const code = whole.slice(0, from) + whole.slice(to)
    for (const n of [39, 14, 25, 75, 13]) {
      expect(code, `${n} is typed where the engine can compute it`)
        .not.toMatch(new RegExp(String.raw`(?<![\d.])${n}(?![\d.])`))
    }
    // and the four engine functions it asks instead, by name
    for (const fn of ['uwbPollBytes', 'uwbInitBytes', 'uwbRmnrBytes', 'blockCarriesRcm']) {
      expect(code, fn).toContain(fn)
    }
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Every byte count, slot count and saving in this lesson is interpolated from its own module and
 * the file above measures those against runs. What is typed is the **standard's own field layout**
 * — six bits, bits 9 to 14, 0 to 63 rounds, bit 15 for the other request — plus the two model
 * values `sources` lists, the hall, and the two halves of the Request bit it borrows from the
 * ancillary lessons.
 *
 * **The reads worth naming:**
 *
 *  - **the field's width is read against the range it allows.** 「字段里的第 9 到 14 位，6 位，
 *    所以标准侧的取值是 0 到 63 轮」 is four figures of one claim: the two bit indices span that
 *    many bits, and that many bits hold exactly that many values.
 *  - **「第 0 块 39 字节，第 1 块 14 字节」 is read as the two openers the run really sends**, by
 *    the block each figure names — and the information elements that go with them.
 *  - **the Request bit's two halves are read on the lessons that have them**, the same way
 *    `@uwb-ancillary` reads them, because this lesson's `limits` only *mentions* them.
 */
describe('uwb-rcm-validity · every figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(uwbRcmValidity.terms)
  const PIC = blockText(uwbRcmValidity.picture)
  const NUMS = blockText(uwbRcmValidity.numbers)
  const LIM = blockText(uwbRcmValidity.limits)
  const SRC = blockText(uwbRcmValidity.sources)
  const OBS = blockText(uwbRcmValidity.observe)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)

  const rs = runOf(uwbRcmValidity, undefined, RUN_NS)

  it('reads the field’s own width against the range of rounds it allows', () => {
    /*
     * 「有效轮次字段是 ARC 信息单元控制字段里的第 9 到 14 位，6 位，所以标准侧的取值是 0 到 63
     * 轮」 — the two bit indices, the width they span and the values that width holds. No corpus
     * ships with this repo, so what is read is the arithmetic between the four figures, which is
     * what makes them a layout rather than four numbers.
     */
    const [from, to, bits] = figs(SRC, /字段里的第 (\d+) 到 (\d+) 位，(\d+) 位/,
      '`sources` on the field’s bits')
    expect(to! - from! + 1, 'the bits those two indices span').toBe(bits)
    const [lo, hi] = figs(SRC, /所以标准侧的取值是 (\d+) 到 (\d+) 轮/, '`sources` on the range')
    expect(hi! - lo! + 1, 'and the values that many bits hold').toBe(2 ** bits!)
    // `limits` prints the width again, and the engine's own field is inside that range
    const [limBits] = figs(LIM, /有效轮次那 (\d+) 位/, '`limits` on the same width')
    expect(limBits, 'the same width, a second time').toBe(bits)
    const [termBits] = figs(TERMS, /ARC 信息单元里的一个 (\d+) 位字段/, 'the term on the same width')
    expect(termBits, 'and a third time, in the term').toBe(bits)
    /*
     * 「ARC_IE_BYTES 一个字节数（头部加 8 字节的控制、块号、轮号、时隙号）」 — the octets that
     * element carries beyond the header every element has, read off the engine's own price.
     */
    const [content] = figs(LIM, /头部加 (\d+) 字节的控制、块号、轮号、时隙号/,
      '`limits` on what the ARC element carries')
    expect(ARC_IE_BYTES - UWB_IE_HDR_BYTES, 'what it carries past the header').toBe(content)
    expect(uwbRcmValidityScenario().uwb!.rcmValidityRounds, 'and this lesson’s own setting')
      .toBeLessThanOrEqual(hi!)
    expect(uwbRcmValidityScenario().uwb!.rcmValidityRounds, 'inside the range the field allows')
      .toBeGreaterThanOrEqual(lo!)
    // 「第 15 位是 §10.36 的…请求位」 — one past the field, printed twice
    const requestBits = [...LIM.matchAll(/第 (\d+) 位/g)].map((m) => val(m[1]!))
    expect(requestBits.length, 'the other request bit, named twice').toBe(2)
    expect(new Set(requestBits).size, 'and it is the same bit both times').toBe(1)
    expect(requestBits[0], 'immediately above the validity field').toBe(to! + 1)
  })

  it('reads the two openers by the block each figure names', () => {
    // 「第 0 块 39 字节，第 1 块 14 字节」
    const [longBlock, longBytes, shortBlock, shortBytes] = figs(PIC,
      /第 (\d) 块 (\d+) 字节，第 (\d) 块 (\d+) 字节/, '`picture` on the two openers')
    const op = openers(rs)
    const of_ = (b: number) => op.find((x) => x.block === b)!
    expect(of_(longBlock!).bytes, `block ${longBlock} really opens with that many octets`)
      .toBe(longBytes)
    expect(of_(shortBlock!).bytes, `and block ${shortBlock} with that many`).toBe(shortBytes)
    expect(of_(longBlock!).kind, 'the long one is the poll').toBe('uwbPoll')
    expect(of_(shortBlock!).kind, 'and the short one is the initiation message').toBe('uwbInit')
    expect(longBytes, 'which is the saving this lesson is about').toBeGreaterThan(shortBytes!)
    // 「点开它看信息单元那一列，只剩 RRMC 一个；第 0 块那一帧里的 ARC 与 RDM 都不在了」
    expect(of_(shortBlock!).ies, 'the short opener carries one element').toEqual(['RRMC'])
    for (const ie of ['ARC', 'RDM']) {
      expect(of_(longBlock!).ies, `and the long one carries ${ie}`).toContain(ie)
    }
    // 「点开第 1 块那帧开场的信息单元列」 — `observe` names the same block
    const [obsBlock] = figs(OBS, /点开第 (\d) 块那帧开场的信息单元列/, '`observe` on the block')
    expect(obsBlock, 'the same block the picture names').toBe(shortBlock)
    // 「RMNR 帧 = 帧头 9 + 信息单元头 2 + 帧校验 2 = 13 字节」
    const [mhr, ieHdr, fcs, total] = figs(NUMS,
      /RMNR 帧 = 帧头 (\d+) \+ 信息单元头 (\d+) \+ 帧校验 (\d+) = (\d+) 字节/,
      '`numbers` on the RMNR frame')
    expect([mhr, ieHdr, fcs], 'the three widths this engine really uses')
      .toEqual([UWB_MHR_BYTES, UWB_IE_HDR_BYTES, UWB_FCS_BYTES])
    expect(mhr! + ieHdr! + fcs!, 'and their sum is the frame').toBe(total)
    expect(total, 'which is what the engine prices it at').toBe(uwbRmnrBytes())
  })

  it('reads the anchors’ own names, which is where the window’s figure lives in the file', () => {
    /*
     * **The site of a figure can be a name.** 「一直播到第 4 块」 is interpolated from `VALIDITY`,
     * so the only standalone 「4」 inside this module's strings is the id `'anchor-4'` — and the
     * sweep of 2026-10-14 plants that one. Renaming an anchor is a real change to the scene and
     * nothing noticed it, so the ids are read here: this lesson's anchors are numbered from one,
     * consecutively, as many as it has, and the walled variant's own anchor is the last of them.
     */
    const sc = uwbRcmValidityScenario()
    const ids = sc.nodes.filter((n) => n.uwb?.role === 'anchor').map((n) => n.id)
    expect(ids.length, 'the anchors this lesson lays out').toBe(ANCHORS)
    expect(ids, 'numbered from one, consecutively')
      .toEqual(Array.from({ length: ANCHORS }, (_v, i) => `anchor-${i + 1}`))
    expect(WALLED_ANCHOR, 'and the walled one is the last of them').toBe(ids.at(-1))
    const walled = uwbRcmValidity.variants!.map((v) => v.scenario())
      .find((s) => s.walls.length > sc.walls.length)!
    expect(walled.nodes.some((n) => n.id === WALLED_ANCHOR),
      'which really is in the walled scene').toBe(true)
  })

  it('reads the block the window turns over on', () => {
    /*
     * 「一直播到第 4 块：开场帧又回到 39 字节。4 个块一个窗口，第 0 个和第 4 个块各有一条控制
     * 消息，中间三个块只有启动消息」 — the whole claim is about which blocks carry which opener,
     * so it is read as that: the two blocks the sentence names open long, the ones between open
     * short, and the window is as wide as the session says.
     */
    const [turnBlock, turnBytes] = figs(PIC, /一直播到第 (\d+) 块：开场帧又回到 (\d+) 字节/,
      '`picture` on the turn of the window')
    const [perWindow, firstBlock, lastBlock] = figs(PIC,
      /(\d+) 个块一个窗口，第 (\d) 个和第 (\d+) 个块各有一条控制消息/, '`picture` on the window')
    const op = openers(rs)
    const of_ = (b: number) => op.find((x) => x.block === b)!
    expect(perWindow, 'the window this session really runs')
      .toBe(uwbRcmValidityScenario().uwb!.rcmValidityRounds)
    expect(lastBlock, 'the block the sentence plays on to').toBe(turnBlock)
    expect(lastBlock! - firstBlock!, 'one window apart').toBe(perWindow)
    for (const b of [firstBlock!, lastBlock!]) {
      expect(of_(b).kind, `block ${b} opens with a control message`).toBe('uwbPoll')
      expect(of_(b).bytes, `and it is that long`).toBe(turnBytes)
    }
    const [betweenCn] = raw(PIC, /中间(.)个块只有启动消息/, '`picture` on the blocks between')
    const between = '零一二三四五六七八九'.indexOf(betweenCn!)
    expect(between, 'the blocks between the two').toBe(perWindow! - 1)
    for (let b = firstBlock! + 1; b < lastBlock!; b++) {
      expect(of_(b).kind, `block ${b} opens with an initiation message`).toBe('uwbInit')
    }
  })

  it('reads the model values `sources` lists, and the hall it keeps', () => {
    // 「2 ms 的测距时隙与 200 ms 的块来自 FiRa 的缺省配置」
    const [slotMs, blockMs] = figs(SRC, /([\d.]+) ms 的测距时隙与 (\d+) ms 的块来自 FiRa/,
      '`sources` on the two FiRa defaults')
    const session = uwbRcmValidityScenario().uwb!
    expect(rstuNs(session.slotRstu), 'the slot this scene runs').toBe(slotMs! * MS)
    expect(rstuNs(session.blockRstu), 'and its block').toBe(blockMs! * MS)
    // 「时间戳噪声按缺省留在 100 ps」
    const [noisePs] = figs(SRC, /时间戳噪声按缺省留在 (\d+) ps/, '`sources` on the noise')
    expect(noisePs, 'the noise this lesson leaves on').toBe(session.tsNoisePs)
    // 「本课的三个场景是同一个 22 × 8 m 大厅的三种设置」
    const [wide, deep] = figs(SRC, /同一个 (\d+) × (\d+) m 大厅/, '`sources` on the hall')
    const scenes = [uwbRcmValidityScenario(), ...uwbRcmValidity.variants!.map((v) => v.scenario())]
    expect(scenes.length, 'the three scenes it counts').toBe(3)
    for (const sc of scenes) {
      expect([sc.rooms[0]!.w, sc.rooms[0]!.h], 'every one of them in the same hall')
        .toEqual([wide, deep])
    }
  })

  it('reads the two halves of the Request bit it borrows from the next module', () => {
    /*
     * 「这个交换只建了 Request 置 0 的那一半…没建的是 Request 置 1 的那一半」 — this lesson only
     * mentions them, so each half is read on the lesson that runs it, the same way
     * `@uwb-ancillary` does.
     */
    const halves = [...LIM.matchAll(/Request 置 (\d)/g)].map((m) => val(m[1]!))
    expect(halves.length, 'both halves are named').toBeGreaterThanOrEqual(2)
    // one bit has two values, and every mention of it prints one of them
    expect(new Set(halves), 'every mention is one of the two values of one bit')
      .toEqual(new Set([0, 1]))
    const built = halves[0]!
    const notBuilt = halves.find((h) => h !== built)!
    expect(uwbAncillary.scenario().uwb!.ancillaryRequest, 'the half that lesson builds')
      .toBe(Boolean(built))
    expect(uwbAncillaryRequest.scenario().uwb!.ancillaryRequest, 'and the half the next one does')
      .toBe(Boolean(notBuilt))
    // 「Frames Remaining 在那一位置 1 时装的是请求的时隙数」 — the half that carries a slot count
    const [asksWhen] = figs(LIM, /Frames Remaining 在那一位置 (\d) 时装的是请求的时隙数/,
      '`limits` on what the field then means')
    expect(asksWhen, 'the half that asks for slots').toBe(notBuilt)
  })
})
