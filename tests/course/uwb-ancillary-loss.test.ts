/**
 * `@uwb-ancillary-loss`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites; ② row by row against the engine; ③ by reading every figure
 * the labs print back out of the lesson text and comparing it with a run.
 *
 * **The lost-frame runs are not lesson scenarios and cannot be.** UWB reception here is a
 * deterministic power comparison with no per-frame fading, so a static scene loses every frame or
 * none (② says so). The measurement is made the way tests/uwb/ancillary-round.test.ts established:
 * one resumable `Simulation` over this lesson's own base scene, with the sending anchor moved out of
 * reach for the span of exactly one slot of the ancillary round. The ancillary round comes after the
 * ranging round, so the move cannot touch a single ranging frame.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, BYTES, FRAMES, MS, NS, SENDER_ID, SLOTS, TAG_ID, VALIDITY, WINDOW_ROUNDS_PER_BLOCK, ms, uwbAncillary,
  uwbAncillaryScenario,
} from '../../src/course/uwb/uwb-ancillary'
import { ARRIVALS_MS, ROUND_END_MS, uwbAncillaryLoss } from '../../src/course/uwb/uwb-ancillary-loss'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema } from '../../src/model/scenario'
import { uwbPpduNs } from '../../src/uwb/phy'
import { blockSlotStartNs, roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
const RUN_NS = 1300 * MS_NS
const BLOCKS = 7
/** One whole block, closed a millisecond before the next one opens. */
const ONE_BLOCK_NS = 200 * MS_NS - MS_NS

lessonShapeSuite(uwbAncillaryLoss, { runNs: RUN_NS, sameSceneAs: 'uwb-ancillary' })

const PLAN = roundPlan(uwbAncillaryScenario().uwb!, ANCHORS)
const recs = (variant?: number): TLRecord[] => runOf(uwbAncillaryLoss, variant, RUN_NS)
const anc = (rs: TLRecord[]) => ofType(rs, 'UWB_ANCILLARY')
const fmtMs = (ns: number): string => (ns / 1e6).toFixed(2)

const lab = (heading: string): Lab => {
  const l = uwbAncillaryLoss.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === kind && b.heading === heading)
  expect(t, `${kind} 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbAncillaryLoss.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

/** One block of the base scene with the sender moved out of reach for ancillary-round slot `1 + lose`. */
const losing = new Map<number, TLRecord[]>()
function runLosing(lose: number): TLRecord[] {
  const hit = losing.get(lose)
  if (hit) return hit
  const sc = uwbAncillaryScenario()
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  const sender = sc.nodes.find((n) => n.id === SENDER_ID)!
  const home = sender.pos.y
  const sim = new Simulation(sc)
  // Half a slot before the slot opens and half a slot before the next one: a frame radiates at its
  // slot's start, so a position changed between those two instants is the one that frame flies through.
  const at = (slot: number): number =>
    blockSlotStartNs(PLAN, 0, SLOTS.ancRound, SLOTS.firstSlot + slot) - PLAN.slotNs / 2
  const before = sim.runUntil(at(lose)).records
  sender.pos.y = 400
  const during = sim.runUntil(at(lose + 1)).records
  sender.pos.y = home
  const out = [...before, ...during, ...sim.runUntil(ONE_BLOCK_NS).records]
  losing.set(lose, out)
  return out
}
const roundEnd = (rs: TLRecord[]) =>
  ofType(rs, 'UWB_ROUND_END').filter((r) => r.node === TAG_ID && r.round === SLOTS.ancRound)[0].t

describe('uwb-ancillary-loss · the lesson', () => {
  it('is in the standard-first shape, the second half of its module\'s lesson', () => {
    expect(isStandardFirst(uwbAncillaryLoss)).toBe(true)
    expect(uwbAncillaryLoss.module).toBe(uwbAncillary.module)
    expect(MODULES[uwbAncillaryLoss.module].title).toBe('测距辅助信息')
    expect(basisOf(uwbAncillaryLoss.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbAncillaryLoss.needs).toEqual(['uwb-ancillary'])
    expect(uwbAncillaryLoss.limits).toEqual([])
    expect(uwbAncillaryLoss.observe).toEqual([])
    expect(uwbAncillaryLoss.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and puts no simulator behaviour there', () => {
    const std = uwbAncillaryLoss.standard!.map((b) =>
      `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'rows' in b ? b.rows.flat().join(' ') : ''}`).join(' ')
    for (const c of ['§10.35.2.1', '§10.35.1', '图 10-271', '§10.34', '§10.36']) expect(std, c).toContain(c)
    expect(std).not.toContain('本仿真器')
    expect(std).not.toContain('本课')
    expect(std).toContain('既没有这条消息的总帧数，也没有这一帧在消息里的序号')
  })

  it('② is not all faithful, and the detection method and deadline are the simulator\'s', () => {
    expect(implRow('接收端怎样发现缺帧').kind).toBe('choice')
    expect(implRow('截止时刻').kind).toBe('choice')
    expect(implRow('发现缺帧之后').kind).toBe('absent')
  })
})

describe('uwb-ancillary-loss · ② says what the engine does, and the engine does it', () => {
  it('收齐的判据: complete exactly at the zero, once per block; never a gap in the static scene', () => {
    const got = anc(recs())
    expect(got).toHaveLength(BLOCKS * FRAMES)
    for (const r of got) {
      expect([r.node, r.peer]).toEqual([TAG_ID, SENDER_ID])
      expect(r.missing).toEqual([])
    }
    expect(got.filter((r) => r.complete).map((r) => r.framesRemaining)).toEqual(Array(BLOCKS).fill(0))
    for (const r of got.filter((x) => x.framesRemaining !== 0)) expect(r.complete).toBe(false)
    // 「面板上的四个场景一帧也不丢」
    for (const v of [undefined, 0, 1]) {
      expect(anc(recs(v)).every((r) => r.missing.length === 0), String(v)).toBe(true)
    }
  })

  it('发现缺帧之后: nothing is sent again after a gap', () => {
    const rs = runLosing(1)
    const sent = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbAncillary')
    expect(sent.map((r) => r.frame.uwb?.raict?.framesRemaining)).toEqual([3, 2, 1, 0])
    expect(sent.every((r) => r.node === SENDER_ID)).toBe(true)
  })
})

describe('uwb-ancillary-loss · ③ every figure the labs print is the run', () => {
  it('lab 1: the four arrivals of block 0, their slots, the countdown and the completion', () => {
    const l = lab('剩余帧数逐帧递减')
    const rows = blockOf(l, 'table', `块 0：${TAG_ID} 收到的 ${FRAMES} 帧`).rows
    const got = anc(recs()).filter((r) => r.block === 0)
    expect(got.map((r) => fmtMs(r.t))).toEqual([...ARRIVALS_MS])
    expect(rows.map((r) => [r[0], r[1], r[2], r[4]])).toEqual(got.map((r) =>
      [`${fmtMs(r.t)} ms`, String(r.slot), String(r.framesRemaining), r.complete ? '是' : '否']))
    // 「每两帧相隔一个 2 ms 的时隙」
    for (let i = 1; i < got.length; i++) expect(got[i].t - got[i - 1].t).toBe(PLAN.slotNs)
    expect(l.expect).toContain(`${MS.slot} ms 的时隙`)
    expect(ofType(recs(), 'UWB_TIMEOUT')).toEqual([])
    // the jump the lab starts from is the completion record
    expect(uwbAncillaryLoss.jumps[l.jump!].label).toContain('收齐')
  })

  it('lab 2: the middle frame is named at the next reception, NS.lead before the round ends', () => {
    const rs = runLosing(1)
    const got = anc(rs)
    expect(got.map((r) => r.framesRemaining)).toEqual([FRAMES - 1, 1, 0])
    const named = got.filter((r) => r.missing.length > 0)
    expect(named).toHaveLength(1)
    expect(named[0].missing).toEqual([FRAMES - 2])
    expect(named[0].slot).toBe(SLOTS.firstSlot + 2)
    // the same nanosecond as the tag's reception of that frame
    const rx = ofType(rs, 'RX_OK').filter((r) => r.node === TAG_ID && r.frame.kind === 'uwbAncillary')
    expect(named[0].t).toBe(rx[1].t)
    const lead = roundEnd(rs) - named[0].t
    expect(Math.abs(lead - NS.lead)).toBeLessThan(200)
    expect(ms(lead)).toBe(ms(NS.lead))
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])

    const l = lab('丢失一帧：三种结果')
    const rows = blockOf(l, 'table', '丢失哪一帧，何时发现').rows
    expect(rows[0][1]).toBe(got.map((r) => r.framesRemaining).join('、'))
    expect(rows[0][2]).toContain(`第 ${named[0].slot} 个时隙`)
    expect(rows[0][2]).toContain(`缺少 ${named[0].missing[0]}`)
    expect(rows[0][3]).toBe(`${ms(lead)} ms`)
    expect(l.expect).toContain(`早 ${ms(lead)} ms`)
    // the formula: 2 slots less one frame's airtime
    const f = blockOf(l, 'formula', '提前量')
    expect(NS.frame).toBe(uwbPpduNs(BYTES.frame))
    expect(f.text).toBe(`提前量 = 2 × ${PLAN.slotNs / 1e6} ms − ${ms(NS.frame)} ms（一帧的空口时间）= ${ms(NS.lead)} ms`)
    // the instants the steps send the reader to, in the base run
    expect(fmtMs(roundEnd(recs()))).toBe(ROUND_END_MS)
    expect(l.steps.join('')).toContain(`${ROUND_END_MS} ms`)
  })

  it('lab 2: the last frame is known only at the round\'s end', () => {
    const rs = runLosing(FRAMES - 1)
    const got = anc(rs)
    const atSlot = got.filter((r) => r.slot !== null)
    const rows = blockOf(lab('丢失一帧：三种结果'), 'table', '丢失哪一帧，何时发现').rows
    expect(rows[1][1]).toBe(atSlot.map((r) => r.framesRemaining).join('、'))
    expect(atSlot.every((r) => r.missing.length === 0 && !r.complete)).toBe(true)
    const deadline = got.filter((r) => r.slot === null)
    expect(deadline).toHaveLength(1)
    expect(deadline[0].missing).toEqual([0])
    expect(deadline[0].t).toBe(roundEnd(rs))
    expect(rows[1][2]).toContain('缺少 0')
    // the same loss, NS.lead later than the middle case
    expect(ms(deadline[0].t - atSlot[atSlot.length - 1].t)).toBe(ms(NS.lead))
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
  })

  it('lab 2: the first frame is never named, and the message still completes', () => {
    const rs = runLosing(0)
    const got = anc(rs)
    const rows = blockOf(lab('丢失一帧：三种结果'), 'table', '丢失哪一帧，何时发现').rows
    expect(rows[2][1]).toBe(got.map((r) => r.framesRemaining).join('、'))
    for (const r of got) expect(r.missing).toEqual([])
    expect(got.filter((r) => r.complete)).toHaveLength(1)
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
  })

  it(`lab 3: rounds 0–${VALIDITY - 1} have no record at all; round ${VALIDITY} has the message`, () => {
    const got = anc(recs(1))
    expect(WINDOW_ROUNDS_PER_BLOCK).toBe(VALIDITY + 1)
    expect(new Set(got.map((r) => r.round))).toEqual(new Set([VALIDITY]))
    const b0 = got.filter((r) => r.block === 0)
    expect(b0.map((r) => r.framesRemaining)).toEqual([3, 2, 1, 0])
    expect(lab('这一轮没有消息，不等于消息未收齐').expect).toContain(`有 ${FRAMES} 条记录`)
  })

  it('lab 4: the ranges are record for record the same with the exchange off', () => {
    const strip = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').map(({ seq: _s, ...rest }) => rest)
    const on = strip(recs()), off = strip(recs(2))
    expect(on).toEqual(off)
    const l = lab('测距结果不受影响')
    expect(l.expect).toContain(`各有 ${on.length} 条测距记录`)
    expect(roundPlan(uwbAncillaryLoss.variants![2].scenario().uwb!, ANCHORS).slots).toBe(SLOTS.ranging)
  })
})
