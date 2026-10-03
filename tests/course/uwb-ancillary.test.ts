/**
 * Every empirical claim in 「一条消息装不进一帧」, measured against runs.
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
 * resumable `Simulation` over the lesson's own base scene, with the sending anchor moved out of
 * reach for the span of exactly one appended slot. The appended window is the round's tail, after
 * every ranging slot, so the move cannot touch a single ranging frame.
 *
 * The lesson prints a lead time in milliseconds from a geometry-free closed form (two slots less
 * one frame's airtime). This file requires the real run to agree with it to within the flight time
 * between the two devices, and to the same two decimals the prose rounds to — the number the lesson
 * prints is checked against a run, not against itself.
 *
 * Nothing here is defended by a string match on a figure: every value comes from `src/uwb/phy.ts`,
 * `src/uwb/session.ts` or a record stream, and the last test requires the lesson's own source to
 * hold no literal where one of those functions would answer.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, BYTES, FRAMES, IE, MS, NS, PLACES, SENDER_ID, SLOTS, TAG, TAG_ID, VALIDITY,
  WINDOW_BLOCKS, idOf, ms, uwbAncillary, uwbAncillaryFields, uwbAncillaryOffScenario,
  uwbAncillaryScenario,
} from '../../src/course/uwb/uwb-ancillary'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { diagramTexts } from '../../src/course/diagram'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { ANCILLARY_MESSAGE_KIND, ANCILLARY_SENDER_INDEX } from '../../src/uwb/device.ancillary'
import {
  RAICT_IE_MIN_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES, UWB_MHR_BYTES,
  raictIeBytes, uwbAncillaryBytes, uwbAncillarySlots, uwbPpduNs, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import {
  ancillarySlots, blockCarriesAncillary, blockSlotAction, blockSlots, roundPlan,
} from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS_NS
/** One whole block, closed a millisecond before the next one opens. */
const ONE_BLOCK_NS = 200 * MS_NS - MS_NS

lessonShapeSuite(uwbAncillary, { runNs: RUN_NS })

const run = (sc: Scenario, ns: number): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ns).records]
}

/** The plan the lesson's base scene lays out — the same `roundPlan` call `UwbNetwork` makes. */
const PLAN = roundPlan(uwbAncillaryScenario().uwb!, ANCHORS)

/** Every ancillary frame that went on the air, in order, as `TX_START` saw it. */
const sent = (rs: TLRecord[]): { node: string; block: number; slot: number; bytes: number; remaining: number | undefined; ies: string[] }[] =>
  ofType(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'uwbAncillary')
    .map((r) => ({
      node: r.node,
      block: r.frame.uwb?.block ?? -1,
      slot: r.frame.uwb?.slot ?? -1,
      bytes: r.frame.bytes,
      remaining: r.frame.uwb?.raict?.framesRemaining,
      ies: [...(r.frame.uwb?.ies ?? [])],
    }))

/** Every ancillary record of a run, as the receiver wrote it. */
const anc = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_ANCILLARY' }>[] =>
  ofType(rs, 'UWB_ANCILLARY')

/** One source file of the engine, for the claims the limits make about it. */
async function readSrc(rel: string): Promise<string> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  return fs.readFileSync(path.resolve(__dirname, `../../src/${rel}`), 'utf8')
}

describe('uwb-ancillary · where it sits in the course', () => {
  it('is the ancillary-information lesson of its own module, checked against the published standard', () => {
    expect(MODULES[uwbAncillary.module].title).toBe('测距辅助信息')
    expect(MODULES[uwbAncillary.module].tier).toBe(5)
    // 「本课完全不依赖任何草案」: the module inherits the published revision from its tier and
    // declares nothing of its own, so the two can never drift apart.
    expect(MODULES[uwbAncillary.module].basis).toBeUndefined()
    expect(basisOf(uwbAncillary.module)).toEqual(['ieee-802-15-4-2024'])
    // the two lessons the three-granularity table is built out of
    expect(uwbAncillary.needs).toEqual(['uwb-rcm-validity', 'uwb-receipt'])
    const src = uwbAncillary.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    // the clause and the figure this lesson rests on, the window it reuses, and the two other
    // granularities its own table compares against
    expect(src).toContain('§10.35.1')
    expect(src).toContain('§10.35.2.1')
    expect(src).toContain('Figure 10-271')
    expect(src).toContain('§10.32.9.1')
    expect(src).toContain('§10.34')
    expect(src).toContain('§10.36')
  })

  it('declares four limits, each about something this engine does not do', () => {
    expect(uwbAncillary.limits).toHaveLength(4)
    expect(uwbAncillary.limits.map((l) => l.kind))
      .toEqual(['unmodelled', 'model-value', 'model-value', 'out-of-scope'])
    const text = uwbAncillary.limits.map((l) => l.text).join('\n')
    // the frame count is scenario configuration: no MAC primitive, the same reason
    // `rcmValidityRounds`'s own limit gives
    expect(text).toContain('MCPS')
    expect(text).toContain('ancillaryFrames')
    expect(text).toContain('uwbSlotsPerTag')
    // the message type is a constant rather than a value table
    expect(text).toContain('ANCILLARY_MESSAGE_KIND')
    // and who sends is a model decision
    expect(text).toContain('ANCILLARY_SENDER_INDEX')
    // Request = 1 is a later cut, for scope and NOT for lack of evidence — the mechanism is
    // named, which is what says it was read through
    expect(text).toContain('Request')
    expect(text).toContain('举证不足')
    expect(text).toContain('排程能不能被请求改变')
    expect(text).toContain('roundPlan')
    // 「不许写『本仿真器有简化』」, in both spellings, and no limit calls the standard a draft
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
    expect(text).not.toContain('草案')
  })

  it('names every engine symbol its limits point at', async () => {
    // A claim is checkable only if the thing it names exists; a renamed export turns a limit into
    // a sentence about nothing.
    const symbols: [string, string][] = [
      ['uwb/phy.ts', 'uwbSlotsPerTag'],
      ['uwb/device.ancillary.ts', 'ANCILLARY_MESSAGE_KIND'],
      ['uwb/device.ancillary.ts', 'ANCILLARY_SENDER_INDEX'],
      ['uwb/session.ts', 'roundPlan'],
    ]
    for (const [file, symbol] of symbols) {
      const src = await readSrc(file)
      expect(new RegExp(`export (?:const|function|class|interface|type) ${symbol}\\b`).test(src), symbol)
        .toBe(true)
    }
    // `ancillaryFrames` is a field of the scenario's session rather than an export, and the limit
    // says so by naming the file it lives in
    expect(await readSrc('model/scenario.ts')).toContain('ancillaryFrames')
    // the two model values the limits pin, by value
    expect(ANCILLARY_SENDER_INDEX).toBe(0)
    expect(ANCILLARY_MESSAGE_KIND).toBeTypeOf('number')
  })
})

describe('uwb-ancillary · the scene is the one the lesson describes', () => {
  const sc = uwbAncillaryScenario()

  it(`is ${ANCHORS} anchors and one tag in the 22 × 8 m hall, no two distances alike`, () => {
    expect(sc.nodes).toHaveLength(ANCHORS + 1)
    expect(sc.nodes.map((n) => n.id))
      .toEqual([...PLACES.map((_p, i) => idOf(i)), TAG_ID])
    for (const [i, p] of PLACES.entries()) {
      expect([sc.nodes[i].pos.x, sc.nodes[i].pos.y]).toEqual([p.x, p.y])
    }
    const tag = sc.nodes[ANCHORS]
    expect([tag.pos.x, tag.pos.y]).toEqual([TAG.x, TAG.y])
    const ds = PLACES.map((p, i) => Math.hypot(p.x - TAG.x, p.y - TAG.y, sc.nodes[i].pos.z - tag.pos.z).toFixed(3))
    expect(new Set(ds).size, ds.join(' ')).toBe(PLACES.length)
    // the session switches the lesson names, and the one knob it turns off
    expect(sc.uwb!.ancillary).toBe(true)
    expect(sc.uwb!.ancillaryFrames).toBe(FRAMES)
    expect(sc.uwb!.method).toBe('ss')
    expect(sc.uwb!.replyTime).toBe('embedded')
    expect(sc.uwb!.schedule).toBe('time')
    expect(sc.uwb!.nlos).toBe(false)
    // 「时间戳噪声照旧留着」 — sources says so, so it must be true
    expect(sc.uwb!.tsNoisePs).toBeGreaterThan(0)
    // the two figures sources quotes come off the plan, not off FiRa's usual two numbers
    expect(MS.slot).toBe(PLAN.slotNs / 1e6)
    expect(MS.block).toBe(PLAN.blockNs / 1e6)
  })

  it(`lays out ${SLOTS.block} slots: ${SLOTS.ranging} of ranging, then ${SLOTS.window} appended`, () => {
    expect(SLOTS.ranging).toBe(PLAN.slots)
    expect(SLOTS.ranging).toBe(uwbSlotsPerTag('ss', ANCHORS))
    expect(SLOTS.window).toBe(ancillarySlots(PLAN))
    expect(SLOTS.window).toBe(FRAMES)
    expect(SLOTS.block).toBe(blockSlots(PLAN, 0))
    expect(SLOTS.block).toBe(SLOTS.ranging + SLOTS.window)
    // slot for slot, off the engine's own answer rather than off the lesson's description: the
    // control message, one Response per anchor, then one appended slot per frame
    expect(blockSlotAction(PLAN, 0, 0)).toEqual({ kind: 'uwbPoll', tx: 'tag' })
    for (let i = 0; i < ANCHORS; i++) {
      expect(blockSlotAction(PLAN, 0, 1 + i)).toEqual({ kind: 'uwbResp', tx: 'anchor', anchor: i })
    }
    for (let i = 0; i < FRAMES; i++) {
      expect(blockSlotAction(PLAN, 0, SLOTS.ranging + i)).toEqual({ kind: 'uwbAncillary', index: i })
    }
    // and the exchange off appends nothing at all, at any frame count
    expect(SLOTS.off).toBe(0)
    expect(uwbAncillarySlots('twr', 'time', 8, false, FRAMES)).toBe(0)
    expect(blockSlots(roundPlan(uwbAncillaryOffScenario().uwb!, ANCHORS), 0)).toBe(SLOTS.ranging)
  })
})

describe('uwb-ancillary · the frame, and the two presence bits', () => {
  it('「长度由两个存在位决定」: every row of the table, against phy.ts', () => {
    expect(BYTES.ieMin).toBe(RAICT_IE_MIN_BYTES)
    expect(BYTES.ieMin).toBe(UWB_IE_HDR_BYTES + 1)
    expect(BYTES.mhr).toBe(UWB_MHR_BYTES)
    expect(BYTES.ieHdr).toBe(UWB_IE_HDR_BYTES)
    expect(BYTES.fcs).toBe(UWB_FCS_BYTES)
    for (const [n, f] of IE.bits) {
      expect(IE.ie(n, f), `${n}/${f}`).toBe(raictIeBytes(n, f))
      expect(IE.frame(n, f), `${n}/${f}`).toBe(uwbAncillaryBytes(n, f))
      expect(IE.frame(n, f), `${n}/${f}`).toBe(BYTES.mhr + raictIeBytes(n, f) + BYTES.fcs)
    }
    // the four combinations are three lengths: the two middle ones are distinct inputs that cost
    // the same octet, which is the half a 「just add 2」 reading would get wrong
    expect(IE.ie(true, false)).toBe(IE.ie(false, true))
    expect(IE.ie(false, false)).toBe(BYTES.ieMin)
    expect(IE.ie(true, true)).toBe(BYTES.ieMin + 2)
    expect(BYTES.frame).toBe(uwbAncillaryBytes(true, true))
    expect(BYTES.shortest).toBe(uwbAncillaryBytes(false, false))
    expect(BYTES.frame - BYTES.shortest).toBe(2)
    expect(NS.frame).toBe(uwbPpduNs(BYTES.frame))
    // the table the lesson prints is exactly these four rows, in these four combinations
    const table = uwbAncillary.numbers!.find((b) => b.kind === 'table')!
    expect((table as { rows: string[][] }).rows).toHaveLength(IE.bits.length)
  })

  it('「一帧 N 字节」: the figure sums to the frame the engine builds', () => {
    const fig = uwbAncillaryFields()
    expect(fig.unit).toBe('B')
    expect(fig.fields.reduce((n, f) => n + f.size, 0)).toBe(BYTES.frame)
    for (const s of diagramTexts(fig)) expect(s.trim().length, s).toBeGreaterThan(0)
  })
})

describe('uwb-ancillary · the base run the fixture replays', () => {
  const rs = runOf(uwbAncillary, undefined, RUN_NS)

  it(`sends one ${FRAMES}-frame message in every block, counting down to zero`, () => {
    const blocks = [...new Set(ofType(rs, 'UWB_ROUND').map((r) => r.block))].sort((a, b) => a - b)
    expect(blocks).toEqual([0, 1, 2, 3, 4, 5, 6])
    const tx = sent(rs)
    expect(tx).toHaveLength(blocks.length * FRAMES)
    // §10.35.1's ancillary *initiator* is a ranging RESPONDER: an anchor sends, the tag receives.
    // This is the inversion the lesson is partly about, and the thing a reader mistakes for a bug.
    expect(new Set(tx.map((f) => f.node))).toEqual(new Set([SENDER_ID]))
    expect(SENDER_ID).toBe(idOf(ANCILLARY_SENDER_INDEX))
    // Frames Remaining counts N−1 → 0, in every frame, which is the whole mechanism
    for (const b of blocks) {
      const mine = tx.filter((f) => f.block === b)
      expect(mine.map((f) => f.remaining), `block ${b}`)
        .toEqual(Array.from({ length: FRAMES }, (_v, i) => FRAMES - 1 - i))
      expect(mine.map((f) => f.slot - SLOTS.ranging), `block ${b}`)
        .toEqual(Array.from({ length: FRAMES }, (_v, i) => i))
    }
    // every frame is the longest of the four shapes, with one RAICT IE and nothing else
    for (const f of tx) {
      expect(f.bytes, `slot ${f.slot}`).toBe(BYTES.frame)
      expect(f.ies, `slot ${f.slot}`).toEqual(['RAICT'])
    }
    // and 「整块一次超时也没有」
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('「收齐的判据是读到 0」: the receiver is the tag, and it completes once a block', () => {
    const got = anc(rs)
    expect(got).toHaveLength(7 * FRAMES)
    for (const r of got) {
      expect([r.node, r.peer]).toEqual([TAG_ID, SENDER_ID])
      expect(r.missing, `slot ${r.slot}`).toEqual([])
      expect(r.messageKind).toBe(ANCILLARY_MESSAGE_KIND)
    }
    // complete exactly at the frame that said zero, once per block, and never before it
    expect(got.filter((r) => r.complete).map((r) => r.framesRemaining)).toEqual(Array(7).fill(0))
    for (const r of got.filter((r) => r.framesRemaining !== 0)) expect(r.complete).toBe(false)
    // one message number per block: without it a receiver could not tell a new message's first
    // frame from a stale reading of the last
    expect(new Set(got.map((r) => r.messageNumber)).size).toBe(7)
  })

  it('every jump the lesson offers lands on the thing it names', () => {
    const at = (i: number) => rs.filter(uwbAncillary.jumps[i].find)
    // 0: the first frame of the message — the first appended slot, Frames Remaining N−1
    const first = ofType(at(0), 'TX_START')[0]
    expect(first.frame.kind).toBe('uwbAncillary')
    expect(first.node).toBe(SENDER_ID)
    expect(first.frame.uwb?.slot).toBe(SLOTS.ranging)
    expect(first.frame.bytes).toBe(BYTES.frame)
    expect(first.frame.uwb?.raict?.framesRemaining).toBe(FRAMES - 1)
    // 1: the frame that says zero, three slots later in the same block
    const last = ofType(at(1), 'TX_START')[0]
    expect(last.frame.uwb?.raict?.framesRemaining).toBe(0)
    expect(last.frame.uwb?.slot).toBe(SLOTS.ranging + FRAMES - 1)
    expect(last.frame.uwb?.block).toBe(first.frame.uwb?.block)
    // 2: the record that says the message is complete — written at the receiver
    const done = ofType(at(2), 'UWB_ANCILLARY')[0]
    expect(done.complete).toBe(true)
    expect(done.node).toBe(TAG_ID)
    expect(done.framesRemaining).toBe(0)
    // 3: the first ranging row, which is a record rather than a transmission
    expect(ofType(rs, 'UWB_RANGE').some(uwbAncillary.jumps[3].find)).toBe(true)
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
function runLosing(lose: number): TLRecord[] {
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

describe('uwb-ancillary · the acceptance: WHEN the missing frame is named', () => {
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
    expect(NS.lead).toBe(2 * PLAN.slotNs - uwbPpduNs(BYTES.frame))

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

describe('uwb-ancillary · what the variants change, and what they must not', () => {
  it('「测距结果一个数也没动」: UWB_RANGE is field for field what it was with the exchange off', () => {
    const off = run(uwbAncillaryOffScenario(), RUN_NS)
    const on = runOf(uwbAncillary, undefined, RUN_NS)
    const ranges = (rs: TLRecord[]): unknown[] =>
      ofType(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    // SS embedded, one range per anchor per block, over the same seven blocks
    expect(ranges(off)).toHaveLength(7 * ANCHORS)
    expect(ranges(on)).toEqual(ranges(off))
    // …and no ranging timestamp moved either: an ancillary frame is not timed at all, so the
    // receiver spends no timestamp-noise draw on one
    expect(ofType(on, 'UWB_TS').filter((r) => r.frameKind === 'uwbAncillary')).toEqual([])
    // the third variant is the exchange off, and it sends nothing whatsoever
    const offVariant = run(uwbAncillary.variants![2].scenario(), ONE_BLOCK_NS)
    expect(sent(offVariant)).toEqual([])
    expect(anc(offVariant)).toEqual([])
  })

  it('「起点抽出来」: a contention run draws a different window, and a different start per block', () => {
    const plan = roundPlan(uwbAncillary.variants![0].scenario().uwb!, ANCHORS)
    // The window is a genuinely different width, read off `uwbAncillarySlots` and never a literal
    expect(SLOTS.contendRanging).toBe(plan.slots)
    expect(SLOTS.contendWindow).toBe(ancillarySlots(plan))
    expect(SLOTS.contendBlock).toBe(blockSlots(plan, 0))
    expect(SLOTS.contendWindow).not.toBe(SLOTS.window)
    expect(SLOTS.contendWindow).toBeGreaterThan(FRAMES)

    const rs = run(uwbAncillary.variants![0].scenario(), 4 * 200 * MS_NS - MS_NS)
    const blocks = [0, 1, 2, 3]
    const startOf = (b: number): number => {
      const mine = sent(rs).filter((f) => f.block === b).map((f) => f.slot - plan.slots)
      // four consecutive slots each time — the message is still one message
      expect(mine, `block ${b}`).toEqual([0, 1, 2, 3].map((k) => mine[0] + k))
      expect(mine[0], `block ${b}`).toBeGreaterThanOrEqual(0)
      expect(mine[0] + FRAMES, `block ${b}`).toBeLessThanOrEqual(SLOTS.contendWindow)
      return mine[0]
    }
    const starts = blocks.map(startOf)
    // 「几个块不是同一个答案」: the placement came out of the sender's own random stream, which a
    // constant that happened not to be zero would also pass if this only checked one block
    expect(new Set(starts).size, `starts ${starts.join(',')}`).toBeGreaterThan(1)
    // …against the time-scheduled run, where frame k is in appended slot k in every block
    const timed = run(uwbAncillaryScenario(), 4 * 200 * MS_NS - MS_NS)
    for (const b of blocks) {
      expect(sent(timed).filter((f) => f.block === b).map((f) => f.slot - PLAN.slots), `block ${b}`)
        .toEqual([0, 1, 2, 3])
    }
    // and the message the receiver read is the same one either way
    expect(anc(rs).map((r) => r.framesRemaining)).toEqual(anc(timed).map((r) => r.framesRemaining))
  })

  it(`「只有窗口的头一块发」: with one control message for ${VALIDITY} blocks, blocks ${WINDOW_BLOCKS.join(' and ')}`, () => {
    const plan = roundPlan(uwbAncillary.variants![1].scenario().uwb!, ANCHORS)
    expect(plan.rcmValidityRounds).toBe(VALIDITY)
    expect(WINDOW_BLOCKS).toEqual([0, 1, 2, 3, 4, 5].filter((b) => blockCarriesAncillary(plan, b)))
    expect(WINDOW_BLOCKS).toEqual([0, VALIDITY])
    expect([0, 1, 2, 3, 4].map((b) => blockSlots(plan, b)))
      .toEqual([plan.slots + FRAMES, plan.slots, plan.slots, plan.slots, plan.slots + FRAMES])

    const rs = run(uwbAncillary.variants![1].scenario(), 6 * 200 * MS_NS - MS_NS)
    expect(sent(rs).map((f) => f.block))
      .toEqual(WINDOW_BLOCKS.flatMap((b) => Array(FRAMES).fill(b)))
    // …and the run really did reach block 5, so the two above are not simply all the blocks there
    // were
    expect(ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG_ID && r.peer === SENDER_ID)
      .map((r) => r.block)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('uwb-ancillary · the three granularities, and no number typed twice', () => {
  it('names all three mechanisms with the clause each one comes from', () => {
    const table = uwbAncillary.picture!.find((b) => b.kind === 'table') as
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
    const whole = [uwbAncillary.why!, ...uwbAncillary.outcomes!,
      ...uwbAncillary.picture!.flatMap((b) => JSON.stringify(b)),
      ...uwbAncillary.numbers!.flatMap((b) => JSON.stringify(b))].join('\n')
    expect(whole).not.toContain('确认帧')
  })

  it('asks the engine for every figure it prints, and types none of them', async () => {
    // The lesson's own integers are its scene: the anchor count, the frame count, the validity
    // rounds and the coordinates. Everything else is a call.
    //
    // Two stretches are cut before the search, for the same reason in both: they are prose about
    // where a number comes from rather than a second copy of one — the comments, and `sources`,
    // which cites the hall's own dimensions and the clause's own field names.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const whole = fs
      .readFileSync(path.resolve(__dirname, '../../src/course/uwb/uwb-ancillary.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*/g, '')
    const from = whole.indexOf('  sources: [')
    const to = whole.indexOf('  scenario: ', from)
    expect(from, 'sources').toBeGreaterThan(0)
    expect(to, 'scenario after sources').toBeGreaterThan(from)
    const code = whole.slice(0, from) + whole.slice(to)
    for (const n of [BYTES.frame, BYTES.shortest, SLOTS.block, SLOTS.contendWindow, NS.frame, NS.lead]) {
      expect(code, `${n} is typed where the engine can compute it`)
        .not.toMatch(new RegExp(String.raw`(?<![\d.])${n}(?![\d.])`))
    }
    expect(code, `${ms(NS.lead)} is typed where the engine can compute it`)
      .not.toMatch(new RegExp(String.raw`(?<![\d.])${ms(NS.lead)}(?![\d.])`))
    // and the engine functions it asks instead, by name
    for (const fn of ['raictIeBytes', 'uwbAncillaryBytes', 'uwbPpduNs', 'roundPlan',
      'ancillarySlots', 'blockSlots', 'blockCarriesAncillary']) {
      expect(code, fn).toContain(fn)
    }
  })
})
