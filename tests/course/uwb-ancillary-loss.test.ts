/**
 * Every empirical claim in 「缺的那一帧是被下一帧发现的」, measured against runs.
 *
 * This file and `uwb-ancillary.test.ts` were one file until 2026-10-11, when the lesson was split
 * in two along the seam its own `outcomes` already drew 2 + 2
 * (`docs/superpowers/specs/2026-10-11-no-room-design.md` §2.1). The first half keeps the carriage
 * claims — the frame's length under its two presence bits, the slot layout, the role inversion —
 * and this file keeps the ones about an instant.
 *
 * The lesson's own claim is about an **instant**, not about a number being absent: a lost frame is
 * named when the next frame arrives, not inferred from a timeout. So the acceptance block below
 * does not merely check that `missing` is non-empty — it checks that the record naming the gap
 * carries the same `t` as the receiver's own `RX_OK` for the frame that produced it, that nothing
 * whatsoever mentioned the loss earlier, and that the message's own deadline is `NS.lead`
 * nanoseconds later. Then it checks the two contrasts the lesson rests on: the LAST frame, which
 * the mechanism cannot beat the deadline on, and the FIRST frame, which it cannot name at all.
 *
 * **The lost-frame scenes are not lesson scenarios and cannot be.** UWB reception here is a
 * deterministic power comparison with no per-frame fading, so a static scene loses every frame or
 * none. The measurement is made the way tests/uwb/ancillary-round.test.ts established: one
 * resumable `Simulation` over this lesson's own base scene, with the sending anchor moved out of
 * reach for the span of exactly one appended slot. The appended window is the round's tail, after
 * every ranging slot, so the move cannot touch a single ranging frame. The lesson says this in a
 * `limits` entry of its own rather than leaving it to `sources`, which is the one thing the split
 * added that neither half had before.
 *
 * The lesson prints a lead time in milliseconds from a geometry-free closed form (two slots less
 * one frame's airtime). This file requires the real run to agree with it to within the flight time
 * between the two devices, and to the same two decimals the prose rounds to — the number the lesson
 * prints is checked against a run, not against itself.
 *
 * **It also holds the ruler for the split itself**: the scene is the other half's value for value
 * (`sameSceneAs`), and the two halves together carry all three of the original `observe` entries
 * and both of its `tryThis` entries, which is why the course's minute sum did not move.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, BYTES, FRAMES, MS, NS, SENDER_ID, SLOTS, TAG_ID, VALIDITY, WINDOW_BLOCKS,
  idOf, ms, uwbAncillary, uwbAncillaryOffScenario, uwbAncillaryScenario,
} from '../../src/course/uwb/uwb-ancillary'
import { uwbAncillaryLoss } from '../../src/course/uwb/uwb-ancillary-loss'
import { MODULES, basisOf, lessonMinutes } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { ANCILLARY_MESSAGE_KIND, ANCILLARY_SENDER_INDEX } from '../../src/uwb/device.ancillary'
import { C_M_PER_NS, uwbPpduNs } from '../../src/uwb/phy'
import { blockCarriesAncillary, blockSlots, roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS_NS
/** One whole block, closed a millisecond before the next one opens. */
const ONE_BLOCK_NS = 200 * MS_NS - MS_NS

// `sameSceneAs` is the split rule: this half loads the first half's scene and its three variants,
// so the recorded timeline hashes of this id are a copy of that one's rather than a new run.
lessonShapeSuite(uwbAncillaryLoss, { runNs: RUN_NS, sameSceneAs: 'uwb-ancillary' })

const run = (sc: Scenario, ns: number): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ns).records]
}

/** The plan the lesson's base scene lays out — the same `roundPlan` call `UwbNetwork` makes. */
const PLAN = roundPlan(uwbAncillaryScenario().uwb!, ANCHORS)

/** Every ancillary frame that went on the air, in order, as `TX_START` saw it. */
const sent = (rs: TLRecord[]): { node: string; block: number; slot: number; remaining: number | undefined }[] =>
  ofType(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'uwbAncillary')
    .map((r) => ({
      node: r.node,
      block: r.frame.uwb?.block ?? -1,
      slot: r.frame.uwb?.slot ?? -1,
      remaining: r.frame.uwb?.raict?.framesRemaining,
    }))

/** Every ancillary record of a run, as the receiver wrote it. */
const anc = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_ANCILLARY' }>[] =>
  ofType(rs, 'UWB_ANCILLARY')

describe('uwb-ancillary-loss · where it sits in the course', () => {
  it('is the second half of its module\'s ancillary lesson, on the published standard', () => {
    expect(uwbAncillaryLoss.module).toBe(uwbAncillary.module)
    expect(MODULES[uwbAncillaryLoss.module].title).toBe('测距辅助信息')
    expect(MODULES[uwbAncillaryLoss.module].tier).toBe(5)
    // 「本课完全不依赖任何草案」: the module inherits the published revision from its tier.
    expect(MODULES[uwbAncillaryLoss.module].basis).toBeUndefined()
    expect(basisOf(uwbAncillaryLoss.module)).toEqual(['ieee-802-15-4-2024'])
    // the half it was cut from is its one prerequisite, and nothing else
    expect(uwbAncillaryLoss.needs).toEqual(['uwb-ancillary'])
    const src = uwbAncillaryLoss.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    // the field this half is about, the figure that defines it, the window its table's middle row
    // reads, and the two other granularities that table compares against
    expect(src).toContain('§10.35.2.1')
    expect(src).toContain('Figure 10-271')
    expect(src).toContain('§10.32.9.1')
    expect(src).toContain('§10.34')
    expect(src).toContain('§10.36')
  })

  /**
   * **The ruler for the split itself.** The claim the slice was approved on is that cutting this
   * lesson in two costs the course no simulator time and invents none: the three `observe` entries
   * and the two `tryThis` entries of the original are distributed, not duplicated and not dropped,
   * so the two stated minute figures add up to the one they replaced. That is what kept
   * `readability.test.ts`' minute-sum equality at 1 925 through the split, and a ruler is cheaper
   * than the next author rediscovering why.
   */
  it('costs the course no simulator time: 3 observe and 2 tryThis across the two halves', () => {
    expect(uwbAncillary.observe.length + uwbAncillaryLoss.observe.length).toBe(3)
    expect(uwbAncillary.tryThis.length + uwbAncillaryLoss.tryThis.length).toBe(2)
    expect(uwbAncillary.observe.length).toBeGreaterThan(0)
    expect(uwbAncillaryLoss.observe.length).toBeGreaterThan(0)
    expect(lessonMinutes(uwbAncillary) + lessonMinutes(uwbAncillaryLoss)).toBe(30)
    // and the two outcomes here are the two the first half no longer claims
    expect(uwbAncillaryLoss.outcomes).toHaveLength(2)
    expect(uwbAncillary.outcomes).toHaveLength(2)
    for (const o of uwbAncillaryLoss.outcomes!) expect(uwbAncillary.outcomes).not.toContain(o)
  })

  it('declares two limits, each about something this engine does not do', () => {
    expect(uwbAncillaryLoss.limits).toHaveLength(2)
    expect(uwbAncillaryLoss.limits.map((l) => l.kind)).toEqual(['unmodelled', 'unmodelled'])
    const text = uwbAncillaryLoss.limits.map((l) => l.text).join('\n')
    // the one the split added: the losing scenes are not scenarios and the limit says where they
    // are instead, by naming this very file
    expect(text).toContain('tests/course/uwb-ancillary-loss.test.ts')
    // and the one about what happens next, which is nothing
    expect(text).toContain('uwb/device.ancillary.ts')
    // no `until` here: the promise ledger of `limits.test.ts` (criterion B) is frozen, and the one
    // `until` of the original stayed with the half that owns the Request bit
    expect(uwbAncillaryLoss.limits.every((l) => l.until === undefined)).toBe(true)
    expect(uwbAncillaryLoss.limits.every((l) => l.seeAlso === undefined)).toBe(true)
    // 「不许写『本仿真器有简化』」, in both spellings, and no limit calls the standard a draft
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
    expect(text).not.toContain('草案')
  })
})

describe('uwb-ancillary-loss · the ruler the lesson measures against', () => {
  it('「先把那把对照的尺子摆出来」: every figure in it comes off the plan', () => {
    expect(MS.slot).toBe(PLAN.slotNs / 1e6)
    expect(MS.block).toBe(PLAN.blockNs / 1e6)
    expect(SLOTS.ranging).toBe(PLAN.slots)
    expect(SLOTS.window).toBe(FRAMES)
    expect(SLOTS.block).toBe(blockSlots(PLAN, 0))
    expect(SLOTS.block).toBe(SLOTS.ranging + SLOTS.window)
    // the closed form the lesson prints, and the two decimals it rounds to
    expect(NS.frame).toBe(uwbPpduNs(BYTES.frame))
    expect(NS.lead).toBe(2 * PLAN.slotNs - uwbPpduNs(BYTES.frame))
    expect(NS.lead).toBeGreaterThan(0)
  })

  it('「收齐的判据是读到 0」: the receiver is the tag, and it completes once a block', () => {
    const got = anc(runOf(uwbAncillaryLoss, undefined, RUN_NS))
    expect(got).toHaveLength(7 * FRAMES)
    for (const r of got) {
      expect([r.node, r.peer]).toEqual([TAG_ID, SENDER_ID])
      expect(r.missing, `slot ${r.slot}`).toEqual([])
      expect(r.messageKind).toBe(ANCILLARY_MESSAGE_KIND)
    }
    expect(SENDER_ID).toBe(idOf(ANCILLARY_SENDER_INDEX))
    // complete exactly at the frame that said zero, once per block, and never before it
    expect(got.filter((r) => r.complete).map((r) => r.framesRemaining)).toEqual(Array(7).fill(0))
    for (const r of got.filter((r) => r.framesRemaining !== 0)) expect(r.complete).toBe(false)
    // one message number per block: without it a receiver could not tell a new message's first
    // frame from a stale reading of the last
    expect(new Set(got.map((r) => r.messageNumber)).size).toBe(7)
    // 「整块里一次超时也没有」
    expect(ofType(runOf(uwbAncillaryLoss, undefined, RUN_NS), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('every jump the lesson offers lands on the thing it names', () => {
    const rs = runOf(uwbAncillaryLoss, undefined, RUN_NS)
    const at = (i: number) => rs.filter(uwbAncillaryLoss.jumps[i].find)
    expect(uwbAncillaryLoss.jumps).toHaveLength(3)
    // 0: the first frame of the message, which the watch block sends the reader to
    const first = ofType(at(0), 'TX_START')[0]
    expect(first.frame.uwb?.raict?.framesRemaining).toBe(FRAMES - 1)
    expect(first.frame.uwb?.slot).toBe(SLOTS.ranging)
    // 1: the frame that says zero, in the same block
    const last = ofType(at(1), 'TX_START')[0]
    expect(last.frame.uwb?.raict?.framesRemaining).toBe(0)
    expect(last.frame.uwb?.slot).toBe(SLOTS.ranging + FRAMES - 1)
    expect(last.frame.uwb?.block).toBe(first.frame.uwb?.block)
    // 2: the record that says the message is complete — written at the receiver
    const done = ofType(at(2), 'UWB_ANCILLARY')[0]
    expect(done.complete).toBe(true)
    expect(done.node).toBe(TAG_ID)
    expect(done.framesRemaining).toBe(0)
    // and the watch block really points at jump 0
    const watch = uwbAncillaryLoss.picture!.find((b) => b.kind === 'watch') as { jump?: number }
    expect(watch.jump).toBe(0)
  })
})

/**
 * One block of the lesson's own base scene, with the anchor that sends the message moved out of
 * reach for exactly the span of one appended slot.
 *
 * `UwbChannel` resolves a position through the very node object the scenario handed it, at the
 * instant it needs it, and `Simulation.runUntil` is resumable — the trick
 * tests/uwb/ancillary-round.test.ts established and tests/uwb/rmnr-round.test.ts before it. The
 * appended window is the round's **tail**, after every ranging slot, so a move inside it cannot
 * touch a ranging frame, which is what makes 「只有这一帧丢了」 a fact rather than a hope.
 *
 * `lose` is the index inside the appended window to drop, 0…FRAMES−1.
 */
const losing = new Map<number, TLRecord[]>()
function runLosing(lose: number): TLRecord[] {
  const hit = losing.get(lose)
  if (hit) return hit
  const out = runLosingOnce(lose)
  losing.set(lose, out)
  return out
}

function runLosingOnce(lose: number): TLRecord[] {
  const sc = uwbAncillaryScenario()
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  const sender = sc.nodes.find((n) => n.id === SENDER_ID)
  if (!sender) throw new Error(`runLosing: ${SENDER_ID} is not in the scene`)
  const home = sender.pos.y
  const sim = new Simulation(sc)
  // Half a slot before the slot in question opens, and half a slot before the next one does. A
  // frame radiates at its slot's start, so a position changed between those two instants is the
  // position that one frame flies through and no other.
  const at = (slot: number): number => (PLAN.slots + slot) * PLAN.slotNs - PLAN.slotNs / 2
  const before = sim.runUntil(at(lose)).records
  sender.pos.y = 400
  const during = sim.runUntil(at(lose + 1)).records
  sender.pos.y = home
  return [...before, ...during, ...sim.runUntil(ONE_BLOCK_NS).records]
}

describe('uwb-ancillary-loss · the acceptance: WHEN the missing frame is named', () => {
  it(`names it at the next frame's own reception, ${ms(NS.lead)} ms before the deadline`, () => {
    // The frame whose Frames Remaining would have said FRAMES−2 never reaches the tag.
    const rs = runLosing(1)

    // The premise, asserted rather than assumed: all four frames went out, three arrived.
    expect(sent(rs).map((f) => f.remaining), 'the sender sent all four')
      .toEqual(Array.from({ length: FRAMES }, (_v, i) => FRAMES - 1 - i))
    const got = anc(rs)
    expect(got.map((r) => r.framesRemaining), 'the receiver saw three of them')
      .toEqual([FRAMES - 1, 1, 0])

    // The record that names the loss is the one the NEXT frame produced, and it names the missing
    // frame by the only identifier the IE gives it: the count that frame would have carried.
    const named = got.filter((r) => r.missing.length > 0)
    expect(named).toHaveLength(1)
    expect(named[0].framesRemaining, 'discovered on the frame that said 1').toBe(1)
    expect(named[0].missing).toEqual([FRAMES - 2])
    expect(named[0].slot).toBe(SLOTS.ranging + 2)

    // …and the instant. Simultaneous with that reception, to the nanosecond, because it IS that
    // reception — no timer, no deadline, no comparison against the slot table.
    const rx = ofType(rs, 'RX_OK')
      .filter((r) => r.node === TAG_ID && r.frame.kind === 'uwbAncillary')
    expect(rx).toHaveLength(FRAMES - 1)
    expect(named[0].t).toBe(rx[1].t)

    // The only other instrument this receiver has is the message's own deadline: the round's end.
    const end = ofType(rs, 'UWB_ROUND_END').filter((r) => r.node === TAG_ID)
    expect(end).toHaveLength(1)
    const lead = end[0].t - named[0].t
    expect(lead).toBeGreaterThan(0)
    // The lesson's figure is the geometry-free closed form; the run differs from it by the flight
    // time between the two devices alone, and rounds to the same two decimals in milliseconds.
    expect(Math.abs(lead - NS.lead), `${lead} vs ${NS.lead}`).toBeLessThan(200)
    expect(ms(lead)).toBe(ms(NS.lead))

    // Nothing reported the loss earlier: the lost slot leaves no record of its own, so the record
    // above is the first and only mention of it in the whole run — and no timeout anywhere.
    const earlier = rs.filter((r) => r.t < named[0].t
      && (r.type === 'UWB_ANCILLARY' ? r.missing.length > 0 : r.type === 'UWB_TIMEOUT'))
    expect(earlier, 'no timeout and no earlier gap record').toEqual([])
    expect(ofType(rs, 'UWB_TIMEOUT').filter((r) => r.expected === 'uwbAncillary')).toEqual([])
  })

  it('cannot beat the deadline on the LAST frame, which is the contrast the claim needs', () => {
    // Lose the frame that would have said zero and there is no next frame to notice the gap: the
    // countdown stops at 1. So this is the one case the receiver learns at the deadline rather
    // than at a reception — the same loss, NS.lead nanoseconds later.
    const rs = runLosing(FRAMES - 1)
    expect(sent(rs).map((f) => f.remaining))
      .toEqual(Array.from({ length: FRAMES }, (_v, i) => FRAMES - 1 - i))
    const got = anc(rs)
    const atSlot = got.filter((r) => r.slot !== null)
    expect(atSlot.map((r) => r.framesRemaining)).toEqual([FRAMES - 1, FRAMES - 2, 1])
    for (const r of atSlot) expect(r.missing).toEqual([])
    expect(atSlot.some((r) => r.complete)).toBe(false)
    // one record at the deadline, and it carries no slot because it is not a reception
    const deadline = got.filter((r) => r.slot === null)
    expect(deadline).toHaveLength(1)
    expect(deadline[0].framesRemaining).toBeNull()
    expect(deadline[0].missing).toEqual([0])
    expect(deadline[0].complete).toBe(false)
    const end = ofType(rs, 'UWB_ROUND_END').filter((r) => r.node === TAG_ID)
    expect(deadline[0].t, 'at the round end, not before it').toBe(end[0].t)
    // …and it really is NS.lead later than where the middle-frame case was discovered: the last
    // reception of this run is the frame that said 1, in the same slot as there.
    const lastRx = atSlot[atSlot.length - 1]
    expect(lastRx.slot).toBe(SLOTS.ranging + FRAMES - 2)
    expect(ms(deadline[0].t - lastRx.t)).toBe(ms(NS.lead))
  })

  it('cannot name a LEADING frame that never arrived, and says so by not claiming one', () => {
    // Lose frame 0 and the first reading is FRAMES−2, with nothing to compare against. The RAICT
    // IE carries no total and no frame index (§10.35.2.1), so the mechanism names gaps BETWEEN
    // readings and nothing before the first one — and it still completes, because the test for
    // completeness is reading a zero.
    const rs = runLosing(0)
    expect(sent(rs).map((f) => f.remaining))
      .toEqual(Array.from({ length: FRAMES }, (_v, i) => FRAMES - 1 - i))
    const got = anc(rs)
    expect(got.map((r) => r.framesRemaining)).toEqual([FRAMES - 2, 1, 0])
    for (const r of got) expect(r.missing, `remaining ${r.framesRemaining}`).toEqual([])
    expect(got.filter((r) => r.complete)).toHaveLength(1)
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
  })
})

describe('uwb-ancillary-loss · what the exchange does not change, and what it does not report', () => {
  it('「测距结果一个数也没动」: UWB_RANGE is field for field what it was with the exchange off', () => {
    const off = run(uwbAncillaryOffScenario(), RUN_NS)
    const on = runOf(uwbAncillaryLoss, undefined, RUN_NS)
    const ranges = (rs: TLRecord[]): unknown[] =>
      ofType(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    // SS embedded, one range per anchor per block, over the same seven blocks
    expect(ranges(off)).toHaveLength(7 * ANCHORS)
    expect(ranges(on)).toEqual(ranges(off))
    // …and no ranging timestamp moved either: an ancillary frame is not timed at all, so the
    // receiver spends no timestamp-noise draw on one
    expect(ofType(on, 'UWB_TS').filter((r) => r.frameKind === 'uwbAncillary')).toEqual([])
    // the third variant is the exchange off, and it sends nothing whatsoever
    const offVariant = run(uwbAncillaryLoss.variants![2].scenario(), ONE_BLOCK_NS)
    expect(sent(offVariant)).toEqual([])
    expect(anc(offVariant)).toEqual([])
  })

  it(`「这一块没有消息」 is not 「这一块的消息没收齐」: blocks ${WINDOW_BLOCKS.join(' and ')} only`, () => {
    // The lesson's one experiment. A block outside the control message's validity window carries
    // no ancillary frame at all, and the point a reader is sent to check is that it also carries
    // no record — an absent message is not an incomplete one, and only the latter is this
    // lesson's subject.
    const plan = roundPlan(uwbAncillaryLoss.variants![1].scenario().uwb!, ANCHORS)
    expect(plan.rcmValidityRounds).toBe(VALIDITY)
    expect(WINDOW_BLOCKS).toEqual([0, 1, 2, 3, 4, 5].filter((b) => blockCarriesAncillary(plan, b)))
    expect(WINDOW_BLOCKS).toEqual([0, VALIDITY])

    const rs = run(uwbAncillaryLoss.variants![1].scenario(), 6 * 200 * MS_NS - MS_NS)
    expect(sent(rs).map((f) => f.block))
      .toEqual(WINDOW_BLOCKS.flatMap((b) => Array(FRAMES).fill(b)))
    // the frames the window does carry count all the way down in each of those blocks
    for (const b of WINDOW_BLOCKS) {
      expect(sent(rs).filter((f) => f.block === b).map((f) => f.remaining), `block ${b}`)
        .toEqual(Array.from({ length: FRAMES }, (_v, i) => FRAMES - 1 - i))
    }
    // and the blocks in between hold no record at all — not an incomplete one, none
    const quiet = anc(rs).filter((r) => !WINDOW_BLOCKS.includes(r.block))
    expect(quiet, 'a block with no message has no ancillary record either').toEqual([])
    // …and the run really did reach block 5, so the two above are not simply all the blocks there
    // were
    expect(ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG_ID && r.peer === SENDER_ID)
      .map((r) => r.block)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('names all three granularities with the clause each one comes from', () => {
    const table = uwbAncillaryLoss.picture!.find((b) => b.kind === 'table') as
      { head: string[]; rows: string[][] }
    expect(table.rows).toHaveLength(3)
    const flat = table.rows.map((r) => r.join('|'))
    // §10.34: per round, sent by the responder on its own initiative
    expect(flat[0]).toContain('§10.34')
    expect(flat[0]).toContain('逐轮')
    // §10.36: per validity window, requested by the controller
    expect(flat[1]).toContain('§10.36')
    expect(flat[1]).toContain('整个有效期窗口')
    // §10.35: not a report at all — carried in every frame
    expect(flat[2]).toContain('§10.35')
    expect(flat[2]).toContain('每一帧')
    expect(flat[2]).toContain('一条消息之内')
    // contract §8: 确认帧 is ACK's registered Chinese name, so this lesson must not borrow it for
    // §10.36's own frame
    const whole = [uwbAncillaryLoss.why!, ...uwbAncillaryLoss.outcomes!,
      ...uwbAncillaryLoss.picture!.flatMap((b) => JSON.stringify(b)),
      ...uwbAncillaryLoss.numbers!.flatMap((b) => JSON.stringify(b))].join('\n')
    expect(whole).not.toContain('确认帧')
  })

  it('asks the other half for every figure it prints, and types none of them', async () => {
    // This half computes nothing of its own: every number it prints is one of the first half's
    // exports, each of which is a call into `uwb/phy.ts` or `uwb/session.ts`. So the guard is the
    // same one the first half carries — no literal where an import would answer — plus the import
    // itself, because a lesson that stopped importing them would pass a search for literals by
    // having no numbers at all.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const whole = fs
      .readFileSync(path.resolve(__dirname, '../../src/course/uwb/uwb-ancillary-loss.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*/g, '')
    const from = whole.indexOf('  sources: [')
    const to = whole.indexOf('  scenario: ', from)
    expect(from, 'sources').toBeGreaterThan(0)
    expect(to, 'scenario after sources').toBeGreaterThan(from)
    const code = whole.slice(0, from) + whole.slice(to)
    for (const n of [MS.block, SLOTS.contendWindow, NS.frame, NS.lead]) {
      expect(code, `${n} is typed where the engine can compute it`)
        .not.toMatch(new RegExp(String.raw`(?<![\d.])${n}(?![\d.])`))
    }
    expect(code, `${ms(NS.lead)} is typed where the engine can compute it`)
      .not.toMatch(new RegExp(String.raw`(?<![\d.])${ms(NS.lead)}(?![\d.])`))
    for (const sym of ['MS', 'NS', 'SLOTS', 'FRAMES', 'WINDOW_BLOCKS', 'ms']) {
      expect(code, sym).toMatch(new RegExp(String.raw`\b${sym}\b`))
    }
    expect(code, 'the figures come from the other half').toContain("from './uwb-ancillary'")
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The acceptance above measures the three losses and compares each with a figure typed on **this**
 * side — `expect(named[0].missing).toEqual([FRAMES - 2])` — with the lesson's sentence in a
 * comment. So the engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted
 * six of this lesson's figures and six went unnoticed, and the sweep of 2026-10-14 could see two
 * more (「第 N 个时隙」 used to count as a name).
 *
 * **The reads worth naming:**
 *
 *  - **the opening example is read as the run it describes.** 「读到的数从 3 跳到 1，它当场就知道
 *    本该写 2 的那一帧没有来」 is three figures of one measurement: the two readings the receiver
 *    really gets and the name the record really gives the gap.
 *  - **「差是 1，中间没有丢；差超过 1」 is read on both runs**: every step of the clean block is
 *    that difference with no gap named, and the losing block's step is bigger by exactly the
 *    frames whose names the record lists.
 *  - **「收齐的判据是读到 0」 is read four times over**, because the lesson states it in the term,
 *    in a step, in a jump label and twice in the quiz — and every one of them is the same
 *    criterion the engine applies.
 */
describe('uwb-ancillary-loss · every figure the prose prints, read back out of it', () => {
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
  const WHY = [uwbAncillaryLoss.why!, ...uwbAncillaryLoss.outcomes!].join('\n')
  const TERMS = blockText(uwbAncillaryLoss.terms)
  const PIC = blockText(uwbAncillaryLoss.picture)
  const DEEP = blockText(uwbAncillaryLoss.deeper)
  const SRC = blockText(uwbAncillaryLoss.sources)
  const QUIZ = blockText(uwbAncillaryLoss.quiz)
  const JUMPS = uwbAncillaryLoss.jumps.map((j) => j.label).join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)

  it('reads the opening example as the run it describes', () => {
    // 「接收端读到的数从 3 跳到 1，它当场就知道本该写 2 的那一帧没有来，不必等任何超时」
    const [from, to, missing] = figs(WHY,
      /接收端读到的数从 (\d+) 跳到 (\d+)，它当场就知道本该写 (\d+) 的那一帧没有来/,
      '`why` on the jump')
    const rs = runLosing(1)
    const got = anc(rs)
    expect(got.map((r) => r.framesRemaining).slice(0, 2), 'the two readings the receiver really gets')
      .toEqual([from, to])
    const named = got.filter((r) => r.missing.length > 0)
    expect(named, 'one record names the gap').toHaveLength(1)
    expect(named[0]!.missing, 'and it names the frame the sentence names').toEqual([missing])
    expect(from! - to!, 'the step the gap opens').toBeGreaterThan(1)
    expect(missing, 'and the missing name lies between the two readings').toBeLessThan(from!)
    expect(missing, 'between them').toBeGreaterThan(to!)
    // 「不必等任何超时」
    expect(ofType(rs, 'UWB_TIMEOUT').filter((r) => r.expected === 'uwbAncillary'),
      'no timeout anywhere in that block').toEqual([])
  })

  it('reads the difference that tells a gap from no gap, on both runs', () => {
    // 「差是 1，中间没有丢；差超过 1，中间那几个数就是没来的那几帧的名字」
    const [step, over] = figs(PIC, /差是 (\d+)，中间没有丢；差超过 (\d+)，中间那几个数就是没来的/,
      '`picture` on the subtraction')
    expect(over, 'one difference, named twice in one step').toBe(step)
    const clean = anc(runOf(uwbAncillaryLoss, undefined, RUN_NS))
    const byBlock = new Map<number, number[]>()
    for (const r of clean) {
      if (r.framesRemaining === null) continue
      byBlock.set(r.block, [...(byBlock.get(r.block) ?? []), r.framesRemaining])
    }
    expect(byBlock.size, 'the clean run has blocks to read').toBeGreaterThan(0)
    for (const [block, reads] of byBlock) {
      for (let i = 1; i < reads.length; i++) {
        expect(reads[i - 1]! - reads[i]!, `block ${block}: every step of a clean message`).toBe(step)
      }
    }
    for (const r of clean) expect(r.missing, 'and no gap is named in it').toEqual([])
    // the losing run: the step is bigger, and what it skipped is what the record lists
    const got = anc(runLosing(1))
    const named = got.filter((r) => r.missing.length > 0)[0]!
    const before = got[got.indexOf(named) - 1]!
    expect(before.framesRemaining! - named.framesRemaining!, 'the step across the gap')
      .toBeGreaterThan(step!)
    const skipped: number[] = []
    for (let n = before.framesRemaining! - step!; n > named.framesRemaining!; n -= step!) skipped.push(n)
    expect(named.missing, 'and the names are the readings that never came').toEqual(skipped)
  })

  it('reads 「收齐的判据是读到 0」 everywhere the lesson states it', () => {
    const zeros: number[] = [
      figs(TERMS, /最后一帧写 (\d)/, 'the term on the last frame')[0]!,
      figs(PIC, /读到 (\d) 就是收齐/, 'the step on completion')[0]!,
      figs(JUMPS, /写 (\d) 的那一帧：这条消息的最后一帧/, 'the jump label')[0]!,
      figs(QUIZ, /丢掉的是写 (\d) 的那一帧，接收端什么时候知道/, 'the quiz’s question')[0]!,
      figs(QUIZ, /因为写 (\d) 的那一帧才是收齐的判据/, 'the quiz’s wrong option')[0]!,
      figs(QUIZ, /因为收齐的判据是读到 (\d)/, 'the quiz’s explanation')[0]!,
    ]
    expect(new Set(zeros).size, 'one criterion, stated six times').toBe(1)
    const zero = zeros[0]!
    // the engine's own criterion: the record that completes a message is the one that read it
    const clean = anc(runOf(uwbAncillaryLoss, undefined, RUN_NS))
    const complete = clean.filter((r) => r.complete)
    expect(complete.length, 'every clean block completes its message').toBeGreaterThan(0)
    for (const r of complete) {
      expect(r.framesRemaining, 'and it is the frame that read that figure').toBe(zero)
    }
    for (const r of clean) {
      if (r.framesRemaining === zero) expect(r.complete, 'reading it is completing').toBe(true)
    }
    // 「而倒数停在 1、后面又没有下一帧时，这一步永远不会发生」
    const [stopsAt] = figs(PIC, /而倒数停在 (\d)、后面又没有下一帧时/, '`picture` on the last loss')
    const last = anc(runLosing(FRAMES - 1)).filter((r) => r.slot !== null)
    expect(last.at(-1)!.framesRemaining, 'the countdown really stops there').toBe(stopsAt)
    expect(last.some((r) => r.complete), 'and no reception completes that message').toBe(false)
    expect(stopsAt, 'one short of the criterion').toBe(zero + 1)
    // 「倒数停在 1 之后就没有下一次读数了」 — the quiz says it again
    const [quizStop] = figs(QUIZ, /倒数停在 (\d) 之后就没有下一次读数了/, 'the quiz on the same stop')
    expect(quizStop, 'the same stop, a second time').toBe(stopsAt)
    /*
     * 「丢掉的是第一帧…接收端第一次读到的是 2，而它手里没有可以相减的上一次读数」 — the third
     * loss, and the figure is the reading that opens the message when the first frame is gone.
     */
    const first = anc(runLosing(0)).filter((r) => r.slot !== null)
    expect(first[0]!.framesRemaining, 'the first reading of that run').toBe(FRAMES - 2)
    expect(first.some((r) => r.missing.length > 0), 'and nothing names the gap').toBe(false)
    expect(first.some((r) => r.complete), 'while the message still completes').toBe(true)
  })

  it('reads the quiz option that says the presence bit is clear, which it is not', () => {
    /*
     * 「因为第一帧里的剩余帧数字段不在，那一位是置 0 的」 — a wrong option, and what makes it
     * wrong is a bit this engine always sets: every frame of every scene carries a Frames
     * Remaining, so the figure the option prints is the complement of the real one. Read that
     * way round, the option's own digit is pinned by the engine rather than by its own wording.
     */
    const [printed] = figs(QUIZ, /因为第一帧里的剩余帧数字段不在，那一位是置 (\d) 的/,
      'the quiz’s wrong option on the presence bit')
    const frames = sent(runOf(uwbAncillaryLoss, undefined, RUN_NS))
    expect(frames.length, 'the run really sends fragments').toBeGreaterThan(0)
    for (const f of frames) {
      expect(f.remaining, `the frame in slot ${f.slot} carries a Frames Remaining`).not.toBeUndefined()
    }
    const present = frames.every((f) => f.remaining !== undefined)
    expect(printed, 'so the option prints the value that bit does NOT have')
      .toBe(1 - Number(present))
    // and the right answer's reason is the field's own content, which the record shows
    const first = anc(runLosing(0)).filter((r) => r.slot !== null)[0]!
    expect(first.framesRemaining, 'the first reading of the first-frame loss')
      .toBe(FRAMES - 2)
    expect(first.missing, 'and nothing to subtract from, so no name').toEqual([])
  })

  it('reads the flight time `deeper` quotes, and the hall `sources` keeps identical', () => {
    // 「与那次运行只差一次飞行时间（本课大厅里是 22 ns）」
    const [flightNs] = figs(DEEP, /只差一次飞行时间（本课大厅里是 (\d+) ns）/,
      '`deeper` on the flight time')
    const sc = uwbAncillaryScenario()
    const sender = sc.nodes.find((n) => n.id === SENDER_ID)!.pos
    const tag = sc.nodes.find((n) => n.id === TAG_ID)!.pos
    const flight = Math.hypot(sender.x - tag.x, sender.y - tag.y, (sender.z ?? 0) - (tag.z ?? 0))
      / C_M_PER_NS
    // rounded up, because that is what the medium does with a delivery instant (`channel.ts`)
    expect(Math.ceil(flight), 'the flight between the two devices, to the nanosecond')
      .toBe(flightNs)
    // and that is the difference between the closed form and the measured lead
    const rs = runLosing(1)
    const named = anc(rs).filter((r) => r.missing.length > 0)[0]!
    const end = ofType(rs, 'UWB_ROUND_END').filter((r) => r.node === TAG_ID)[0]!
    expect(Math.abs((end.t - named.t) - NS.lead), 'which is all the two differ by')
      .toBeLessThanOrEqual(flightNs! + 1)
    // 「同一个 22 × 8 m 大厅」
    const [wide, deep] = figs(SRC, /同一个 (\d+) × (\d+) m 大厅/, '`sources` on the hall')
    expect([sc.rooms[0]!.w, sc.rooms[0]!.h], 'the hall both lessons run in').toEqual([wide, deep])
  })
})
