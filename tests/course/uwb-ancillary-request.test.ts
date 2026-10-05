/**
 * `uwb-ancillary-request` — the other half of standard §10.35, and the first lesson of this course
 * in which the slot grid is **not** settled before the session starts.
 *
 * Every figure the lesson prints is re-measured here against whole blocks of its own four scenes,
 * never against a second copy of the formula that produced it. The three claims that carry the
 * lesson are each a measurement:
 *
 *  1. **The grant changes the message, not just the window.** Block 0's Frames Remaining counts
 *     `FIRST_FRAMES − 1 … 0` and every block after it counts `REQUEST − 1 … 0`. If a grant only
 *     widened the window the first number would never move, and the whole feature would be a
 *     schedule that got longer while the air stayed the same.
 *  2. **A refusal has no frame.** In the wide-slot hall the same request is refused, no record
 *     carries a granted width, and every block's countdown stays at the session's own figure — so
 *     the asker learns the answer from the width of the window it is given and from nothing else.
 *  3. **The policy invents no constant.** The largest grantable width is walked out of
 *     `ancillaryGrantFits` rather than subtracted, and the two halls answer 94 and 4 for one reason:
 *     one of them divides a 200 ms block by a 2 ms slot and the other by a 20 ms slot.
 *
 * **This file is also the ruler for the `until` promise `uwb-ancillary` now carries.** That
 * lesson's `out-of-scope` limit says the Request = 1 half is a later cut and names this lesson as
 * the one that lifts it (`tests/course/limits.test.ts`'s criterion B, site 17). What makes the
 * promise kept is measured below: the axis is two session fields (`ancillaryRequest`,
 * `ancillaryRequestSlots`) that no scene of `uwb-ancillary` sets, and with them the round length
 * stops being a function of the session alone.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHORS, ASKER_ID, BYTES, CAPS, FIRST_FRAMES, MS, PLACES, REQUEST, SLOTS, TAG, TAG_ID,
  WIDE_SLOT_RSTU, idOf, uwbAncillaryRequest, uwbAncillaryRequestOffScenario,
  uwbAncillaryRequestScenario,
} from '../../src/course/uwb/uwb-ancillary-request'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { ANCILLARY_SENDER_INDEX } from '../../src/uwb/device.ancillary'
import { raictIeBytes, uwbAncillaryBytes, uwbPpduNs } from '../../src/uwb/phy'
import { ancillaryGrantFits, ancillarySlots, blockSlots, roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS_NS

lessonShapeSuite(uwbAncillaryRequest, { runNs: RUN_NS })

const run = (sc: Scenario, ns: number = RUN_NS): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ns).records]
}

/** The plan the lesson's base scene lays out — the same `roundPlan` call `UwbNetwork` makes. */
const PLAN = roundPlan(uwbAncillaryRequestScenario().uwb!, ANCHORS)
const WIDE_PLAN = roundPlan(uwbAncillaryRequestScenario({ slotRstu: WIDE_SLOT_RSTU }).uwb!, ANCHORS)
const CONTEND_PLAN = roundPlan(uwbAncillaryRequestScenario({ schedule: 'contention' }).uwb!, ANCHORS)

/** Every ancillary record of a run, as the controller wrote it. */
const anc = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_ANCILLARY' }>[] =>
  ofType(rs, 'UWB_ANCILLARY')

/** Every record of a run that is a slot request read by the controller. */
const requests = (rs: TLRecord[]) => anc(rs).filter((r) => r.requestedSlots !== undefined)

/** The first Frames Remaining each block's message counted down from — the one number the lesson's
 * central claim is visible in. */
function firstCountdown(rs: TLRecord[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of anc(rs)) {
    if (r.requestedSlots !== undefined || r.framesRemaining === null) continue
    if (!out.has(r.block)) out.set(r.block, r.framesRemaining)
  }
  return out
}

/** Every ancillary frame that went on the air, in order, as `TX_START` saw it. */
const sent = (rs: TLRecord[]) => ofType(rs, 'TX_START')
  .filter((r) => r.frame.kind === 'uwbAncillary')
  .map((r) => ({
    node: r.node,
    block: r.frame.uwb?.block ?? -1,
    slot: r.frame.uwb?.slot ?? -1,
    bytes: r.frame.bytes,
    txNs: r.frame.txTimeNs,
    request: r.frame.uwb?.raict?.request === true,
    number: r.frame.uwb?.raict?.messageNumber,
    remaining: r.frame.uwb?.raict?.framesRemaining,
  }))

/** One source file of the engine, for the claims the limits make about it. */
async function readSrc(rel: string): Promise<string> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  return fs.readFileSync(path.resolve(__dirname, `../../src/${rel}`), 'utf8')
}

describe('uwb-ancillary-request · where it sits in the course', () => {
  it('shares §10.35’s own module with the Request = 0 half, checked against the published standard', () => {
    expect(MODULES[uwbAncillaryRequest.module].title).toBe('测距辅助信息')
    expect(MODULES[uwbAncillaryRequest.module].tier).toBe(5)
    // No `basis` of its own: the module inherits the published revision from its tier, so the two
    // can never drift apart — 「本课完全不依赖任何草案」.
    expect(MODULES[uwbAncillaryRequest.module].basis).toBeUndefined()
    expect(basisOf(uwbAncillaryRequest.module)).toEqual(['ieee-802-15-4-2024'])
    // One prerequisite, and it is the other half of the same clause: everything this lesson needs
    // about the exchange itself — the window, the role inversion, the countdown — is that lesson's,
    // and its own `needs` carry the two windows behind it.
    expect(uwbAncillaryRequest.needs).toEqual(['uwb-ancillary'])
    const src = uwbAncillaryRequest.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    expect(src).toContain('§10.35.1')
    expect(src).toContain('§10.35.2.1')
  })

  it('declares three limits, and each one is about something the clause leaves to the model', () => {
    expect(uwbAncillaryRequest.limits).toHaveLength(3)
    expect(uwbAncillaryRequest.limits.map((l) => l.kind))
      .toEqual(['unmodelled', 'model-value', 'model-value'])
    const text = uwbAncillaryRequest.limits.map((l) => l.text).join('\n')
    // where the requested number comes from: no MAC primitive, the same reason `ancillaryFrames`
    // has
    expect(text).toContain('ancillaryRequestSlots')
    expect(text).toContain('原语')
    // the grant/refusal policy is the model's, because the clause defines none
    expect(text).toContain('ancillaryGrantFits')
    expect(text).toContain('§10.35')
    // and one asker per round, one controller per session
    expect(text).toContain('ANCILLARY_SENDER_INDEX')
    // 「不许写『本仿真器有简化』」, in both spellings, and no limit calls the standard a draft
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
    expect(text).not.toContain('草案')
    // no `until`: nothing after this cut lifts any of the three
    expect(uwbAncillaryRequest.limits.some((l) => l.until !== undefined)).toBe(false)
  })

  it('names every engine symbol its limits point at', async () => {
    const symbols: [string, string][] = [
      ['uwb/session.ts', 'ancillaryGrantFits'],
      ['uwb/device.ancillary.ts', 'ANCILLARY_SENDER_INDEX'],
    ]
    for (const [file, symbol] of symbols) {
      const src = await readSrc(file)
      expect(new RegExp(`export (?:const|function) ${symbol}\\b`).test(src), symbol).toBe(true)
    }
    // `ancillaryRequestSlots` is a field of the scenario's session rather than an export, and the
    // limit says so by naming the file it lives in
    expect(await readSrc('model/scenario.ts')).toContain('ancillaryRequestSlots')
    expect(ANCILLARY_SENDER_INDEX).toBe(0)
  })
})

describe('uwb-ancillary-request · the scenes are the ones the lesson describes', () => {
  const sc = uwbAncillaryRequestScenario()

  it(`is ${ANCHORS} anchors and one tag in the same hall as the Request = 0 lesson`, () => {
    expect(sc.nodes).toHaveLength(ANCHORS + 1)
    expect(sc.nodes.map((n) => n.id)).toEqual([...PLACES.map((_p, i) => idOf(i)), TAG_ID])
    const tag = sc.nodes[ANCHORS]
    expect([tag.pos.x, tag.pos.y]).toEqual([TAG.x, TAG.y])
    // the switches the lesson names, and the ones it leaves at the session default
    expect(sc.uwb!.ancillary).toBe(true)
    expect(sc.uwb!.ancillaryFrames).toBe(FIRST_FRAMES)
    expect(sc.uwb!.ancillaryRequest).toBe(true)
    expect(sc.uwb!.ancillaryRequestSlots).toBe(REQUEST)
    expect(sc.uwb!.method).toBe('ss')
    expect(sc.uwb!.schedule).toBe('time')
    expect(sc.uwb!.rcmValidityRounds).toBe(1)
    // the two figures the prose quotes come off the plan, not off FiRa's usual two numbers
    expect(MS.slot).toBe(PLAN.slotNs / 1e6)
    expect(MS.block).toBe(PLAN.blockNs / 1e6)
  })

  it('every variant differs from the base in session switches alone', () => {
    const strip = (s: Scenario) => ({ ...s, uwb: undefined })
    for (const v of uwbAncillaryRequest.variants!) {
      expect(strip(v.scenario()), v.label).toEqual(strip(sc))
    }
    expect(uwbAncillaryRequest.variants!.map((v) => v.scenario().uwb!.schedule))
      .toEqual(['contention', 'time', 'time'])
    expect(uwbAncillaryRequest.variants![1].scenario().uwb!.slotRstu).toBe(WIDE_SLOT_RSTU)
    expect(uwbAncillaryRequest.variants![2].scenario().uwb!.ancillaryRequest).toBe(false)
  })

  it(`lays out ${SLOTS.block} slots before the grant and ${SLOTS.blockGranted} after it`, () => {
    expect(SLOTS.ranging).toBe(PLAN.slots)
    // the window is the message plus the request's own slot, and the request's slot is what the
    // off variant does not have
    expect(SLOTS.window).toBe(FIRST_FRAMES + 1)
    expect(SLOTS.off).toBe(FIRST_FRAMES)
    expect(SLOTS.windowGranted).toBe(REQUEST + 1)
    expect(SLOTS.block).toBe(blockSlots(PLAN, 0))
    expect(SLOTS.blockGranted).toBe(blockSlots(PLAN, 1, REQUEST))
    expect(SLOTS.block).toBe(SLOTS.ranging + SLOTS.window)
    expect(SLOTS.blockGranted).toBe(SLOTS.ranging + SLOTS.windowGranted)
  })
})

describe('uwb-ancillary-request · the grant changes the message, which is the lesson', () => {
  const rs = runOf(uwbAncillaryRequest, undefined, RUN_NS)

  it(`counts ${FIRST_FRAMES - 1}→0 in block 0 and ${REQUEST - 1}→0 in every block after it`, () => {
    const byBlock = firstCountdown(rs)
    expect(byBlock.get(0)).toBe(FIRST_FRAMES - 1)
    for (const block of [1, 2, 3, 4, 5, 6]) {
      expect(byBlock.get(block), `block ${block}`).toBe(REQUEST - 1)
    }
    // the whole countdown of block 1, in order, read off the air rather than off the records
    const block1 = sent(rs).filter((f) => f.block === 1 && !f.request).map((f) => f.remaining)
    expect(block1).toEqual([...Array(REQUEST).keys()].map((i) => REQUEST - 1 - i))
  })

  it('the request is one frame, in the window’s last slot, and it reports no message number', () => {
    const reqs = sent(rs).filter((f) => f.request)
    expect(reqs.length).toBe(7) // one per block, and the exchange runs in every block (R = 1)
    for (const f of reqs) {
      expect(f.node).toBe(ASKER_ID)
      expect(f.number, 'a request is not part of a message').toBeUndefined()
      expect(f.remaining).toBe(REQUEST)
      // every length computed, not written down — and one octet shorter than a fragment
      expect(f.bytes).toBe(uwbAncillaryBytes(false, true))
      expect(f.bytes).toBe(BYTES.request)
      expect(f.txNs).toBe(uwbPpduNs(uwbAncillaryBytes(false, true)))
      expect(BYTES.requestIe).toBe(raictIeBytes(false, true))
      expect(BYTES.request).toBe(BYTES.fragment - 1)
    }
    // block 0's request sits in the window's last slot, which is the round's last slot
    const first = reqs[0]
    expect(first.block).toBe(0)
    expect(first.slot).toBe(SLOTS.block - 1)
  })

  it('the controller grants, and says both numbers in one record', () => {
    const grants = requests(rs)
    expect(grants.length).toBe(7)
    for (const g of grants) {
      expect(g.node).toBe(TAG_ID)
      expect(g.peer).toBe(ASKER_ID)
      expect(g.requestedSlots).toBe(REQUEST)
      expect(g.grantedSlots).toBe(REQUEST)
      // a request is not a countdown and the record does not pretend it is
      expect(g.framesRemaining).toBeNull()
      expect(g.missing).toEqual([])
      expect(g.complete).toBe(false)
    }
  })

  it('leaves every UWB_RANGE field for field what it was with the request off, seq aside', () => {
    const strip = (x: TLRecord[]) => JSON.stringify(
      ofType(x, 'UWB_RANGE').map(({ seq: _seq, ...rest }) => rest),
    )
    const off = run(uwbAncillaryRequestOffScenario())
    expect(ofType(off, 'UWB_RANGE').length).toBeGreaterThan(20)
    expect(strip(rs)).toBe(strip(off))
    // …and the off variant really is the request off: no request frame at all, and the window is
    // the message's own frames
    expect(sent(off).filter((f) => f.request)).toEqual([])
    expect(ancillarySlots(roundPlan(uwbAncillaryRequestOffScenario().uwb!, ANCHORS))).toBe(FIRST_FRAMES)
    for (const [, first] of firstCountdown(off)) expect(first).toBe(FIRST_FRAMES - 1)
  })
})

describe('uwb-ancillary-request · the refusal, and the arithmetic behind it', () => {
  it('walks the largest grantable width out of the predicate, in both halls', () => {
    // The two numbers the lesson prints, and the one reason they differ: a 200 ms block divided by
    // a 2 ms slot against the same block divided by a 20 ms slot.
    expect(CAPS.perBlock).toBe(Math.floor(PLAN.blockNs / PLAN.slotNs))
    expect(CAPS.widePerBlock).toBe(Math.floor(WIDE_PLAN.blockNs / WIDE_PLAN.slotNs))
    expect(PLAN.blockNs).toBe(WIDE_PLAN.blockNs)
    expect(MS.wideSlot).toBe(MS.slot * 10)
    // and the caps are the predicate's own boundary, not a subtraction
    for (const [p, cap] of [[PLAN, CAPS.grant], [WIDE_PLAN, CAPS.wideGrant]] as const) {
      expect(ancillaryGrantFits(p, cap)).toBe(true)
      expect(ancillaryGrantFits(p, cap + 1)).toBe(false)
    }
    // the base hall grants the lesson's request; the wide one does not, which is the variant
    expect(CAPS.grant).toBeGreaterThan(REQUEST)
    expect(CAPS.wideGrant).toBeLessThan(REQUEST)
  })

  it('refuses the same request in the wide-slot hall, with no frame and no change of width', () => {
    const rs = run(uwbAncillaryRequestScenario({ slotRstu: WIDE_SLOT_RSTU }))
    const grants = requests(rs)
    expect(grants.length).toBeGreaterThan(4)
    for (const g of grants) {
      expect(g.requestedSlots).toBe(REQUEST)
      expect(g.grantedSlots, 'a refusal is a null grant, not a smaller one').toBeNull()
    }
    // every block stays at the session's own figure — the asker reads the answer off its window
    for (const [, first] of firstCountdown(rs)) expect(first).toBe(FIRST_FRAMES - 1)
    // …and no frame travels back: the only ancillary frames on the air are the asker's own
    expect(new Set(sent(rs).map((f) => f.node))).toEqual(new Set([ASKER_ID]))
  })

  it('grants the wide hall’s own cap, so the refusal is about the width and not about the hall', () => {
    const rs = run(uwbAncillaryRequestScenario({
      slotRstu: WIDE_SLOT_RSTU, ancillaryRequestSlots: CAPS.wideGrant,
    }))
    for (const g of requests(rs)) expect(g.grantedSlots).toBe(CAPS.wideGrant)
    expect(firstCountdown(rs).get(1)).toBe(CAPS.wideGrant - 1)
  })
})

describe('uwb-ancillary-request · contention: the window does not move and the message does', () => {
  it('prints the same window width before and after the grant, and it is measured', () => {
    expect(SLOTS.contendRanging).toBe(CONTEND_PLAN.slots)
    expect(SLOTS.contendWindow).toBe(ancillarySlots(CONTEND_PLAN))
    expect(SLOTS.contendWindowGranted).toBe(ancillarySlots(CONTEND_PLAN, REQUEST))
    // the claim the lesson's last table row makes, as an equality rather than as a remark
    expect(SLOTS.contendWindowGranted).toBe(SLOTS.contendWindow)
    // …and the reason: the draw window is wider than the message plus the request
    expect(REQUEST + 1).toBeLessThanOrEqual(CONTEND_PLAN.contentionSlots)
    expect(SLOTS.contendWindow).toBe(CONTEND_PLAN.contentionSlots)
    // while under a time schedule the same grant does move the window
    expect(SLOTS.windowGranted).toBeGreaterThan(SLOTS.window)
  })

  it('still lengthens the message, which is what makes the row not a defect', () => {
    const rs = run(uwbAncillaryRequestScenario({ schedule: 'contention' }))
    const byBlock = firstCountdown(rs)
    expect(byBlock.get(0)).toBe(FIRST_FRAMES - 1)
    expect(byBlock.get(3)).toBe(REQUEST - 1)
    // and the block really is laid out at one width throughout
    expect(blockSlots(CONTEND_PLAN, 0)).toBe(blockSlots(CONTEND_PLAN, 1, REQUEST))
  })
})

describe('uwb-ancillary-request · every number in the prose is the engine’s', () => {
  const text = [
    uwbAncillaryRequest.why,
    ...(uwbAncillaryRequest.outcomes ?? []),
    ...uwbAncillaryRequest.observe,
    ...uwbAncillaryRequest.tryThis,
    ...uwbAncillaryRequest.limits.map((l) => l.text),
    ...(uwbAncillaryRequest.sources ?? []),
  ].join('\n')

  it('quotes the four figures that could have been invented, and each one is computed', () => {
    // the request frame's own length, the two capacities, and the two caps
    for (const n of [BYTES.request, CAPS.perBlock, CAPS.grant, CAPS.widePerBlock, CAPS.wideGrant]) {
      expect(typeof n).toBe('number')
    }
    expect(BYTES.request).toBe(uwbAncillaryBytes(false, true))
    expect(CAPS.grant).toBe(CAPS.perBlock - SLOTS.ranging - 1)
    expect(CAPS.wideGrant).toBe(CAPS.widePerBlock - SLOTS.ranging - 1)
    // the prose names the mechanism rather than the number where the number is the model's
    expect(text).toContain('ancillaryGrantFits')
  })

  it('says which figures are the standard’s and which are this simulator’s', () => {
    expect(text).toContain('model')
    // the one thing §10.35 does not define, named in the lesson's own words
    for (const needle of ['批复', '拒绝', '应答']) expect(text).toContain(needle)
  })
})
