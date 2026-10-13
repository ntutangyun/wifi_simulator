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
import { uwbAncillaryScenario } from '../../src/course/uwb/uwb-ancillary'
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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Every length, slot count and width in this lesson is interpolated from its own module, and the
 * file above measures those against runs. What is typed is the semantics and the arithmetic in
 * words: the Request bit's value, the window split into 「message plus one」, the capacity a block
 * has, and the per-block widths `deeper` measured. The sampling sweep of 2026-10-12 planted six
 * and six went unnoticed.
 *
 * **The reads worth naming:**
 *
 *  - **the window is read as the split the sentence makes of it**: 「窗口是 3 个测距时隙：2 格
 *    消息，1 格要求」 is one claim with three figures in it, so the message's frames plus the
 *    request's own slot have to be the window the engine lays out.
 *  - **the capacity line is read as the arithmetic it shows**: block over slot is how many slots
 *    a block holds, less the ranging round and the request's own slot is the widest grant — and
 *    the wide-slot scene is read the same way, down to the refusal of the very same request.
 *  - **the per-block widths `deeper` quotes are read in Chinese numerals**, on a session whose
 *    control message governs the blocks it names.
 */
describe('uwb-ancillary-request · every figure the prose prints, read back out of it', () => {
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
  const WHY = [uwbAncillaryRequest.why!, ...uwbAncillaryRequest.outcomes!].join('\n')
  const TERMS = blockText(uwbAncillaryRequest.terms)
  const PIC = blockText(uwbAncillaryRequest.picture)
  const NUMS = blockText(uwbAncillaryRequest.numbers)
  const DEEP = blockText(uwbAncillaryRequest.deeper)
  const LIM = blockText(uwbAncillaryRequest.limits)
  const SRC = blockText(uwbAncillaryRequest.sources)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s)
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    uwbAncillaryRequest.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]

  const rs = runOf(uwbAncillaryRequest, undefined, RUN_NS)

  it('reads the Request bit, and the figure the request frame writes', () => {
    // 「把它的第一位置 1」 in `why`, 「置 0 是上一课，置 1 是向控制器要时隙」 in the terms,
    // 「Request 这一位置 1 表示…」 in `sources`
    const [whyBit] = figs(WHY, /把它的第一位置 (\d)/, '`why` on the bit')
    const [prev, mine] = figs(TERMS, /置 (\d) 是上一课，置 (\d) 是向控制器要时隙/, 'the term on the bit')
    const [srcBit] = figs(SRC, /Request 这一位置 (\d) 表示这枚信息单元是在向控制器要时隙/,
      '`sources` on the bit')
    expect([whyBit, srcBit], 'the half this lesson builds, named three times').toEqual([mine, mine])
    expect(prev, 'and the other half is the one before it').not.toBe(mine)
    expect(uwbAncillaryRequestScenario().uwb!.ancillaryRequest,
      'this lesson really runs that half').toBe(Boolean(mine))
    expect(uwbAncillaryRequestOffScenario().uwb!.ancillaryRequest,
      'and the scene with it off runs the other').toBe(Boolean(prev))
    // every request frame on the air carries the bit, and the fragments do not
    const frames = sent(rs)
    const req = frames.filter((f) => f.request)
    expect(req.length, 'one request per block, once the exchange is on').toBeGreaterThan(0)
    for (const f of frames) {
      expect(f.request, `the frame in slot ${f.slot} carries the bit only if it is the request`)
        .toBe(f.remaining === undefined || f.number === undefined)
    }
    // 「字段里写 3」 — the field the request really carries, and what it asked for
    const [asked] = figs(PIC, /Request 置 \d，字段里写 (\d+)/, 'the step on what it writes')
    for (const r of requests(rs)) {
      expect(r.requestedSlots, 'what every request really asks for').toBe(asked)
    }
    expect(asked, 'which is the session’s own figure')
      .toBe(uwbAncillaryRequestScenario().uwb!.ancillaryRequestSlots)
  })

  it('reads the window as the split the sentence makes of it, and the two tables', () => {
    // 「本课的第一条消息是 2 帧，所以窗口是 3 个测距时隙：2 格消息，1 格要求」
    const [frames, window, msgSlots, reqSlots] = figs(PIC,
      /本课的第一条消息是 (\d+) 帧，所以窗口是 (\d+) 个测距时隙（ranging slot）：(\d+) 格消息，(\d+) 格要求/,
      '`picture` on the window')
    expect(frames, 'the frames the first message really has').toBe(FIRST_FRAMES)
    expect(msgSlots, 'one slot per frame').toBe(frames)
    expect(reqSlots, 'and the request’s own slot').toBe(1)
    expect(window, 'which together are the window the engine lays out').toBe(msgSlots! + reqSlots!)
    expect(ancillarySlots(PLAN), 'read off the plan itself').toBe(window)
    // 「第 0 格是控制消息，后面 4 格是每个锚点各作答一次」
    const [ctrl, anchors] = figs(PIC, /第 (\d) 格是控制消息，后面 (\d+) 格是每个锚点/,
      '`picture` on the ranging round')
    expect(ctrl, 'the control message’s own slot').toBe(0)
    expect(anchors, 'and one slot per anchor').toBe(ANCHORS)
    // slot 0 plus one each: 「第 0 格」 is an index, so the round is one more than the last index
    expect(ctrl! + 1 + anchors!, 'which is the round this plan lays out').toBe(PLAN.slots)
    // 「窗口从 3 格变成 4 格，一块从 8 格变成 9 格」
    const [wFrom, wTo, bFrom, bTo] = figs(PIC,
      /窗口从 (\d+) 格变成 (\d+) 格，一块从 (\d+) 格变成 (\d+) 格/, '`picture` on what the grant changes')
    expect([wFrom, wTo], 'the window before and after the grant')
      .toEqual([ancillarySlots(PLAN), ancillarySlots(PLAN, REQUEST)])
    expect([bFrom, bTo], 'and the block before and after')
      .toEqual([blockSlots(PLAN, 0), blockSlots(PLAN, 1, REQUEST)])
    // the per-block table: frames, countdown, window and block width, block by block
    const tb = tables().find((x) => x.head[0] === '哪一块')!
    const counts = firstCountdown(rs)
    for (const row of tb.rows) {
      const [label, msgFrames, countdown, win, block] = row as [string, string, string, string, string]
      const [blockNo] = figs(label, /块 (\d+)/, `${label}: its own block number`)
      const granted = blockNo! > 0
      /*
       * 「块 1 及以后」 — read as the FIRST granted block, not merely a granted one: the block
       * before it still counts down from the session's own frames, and this one already counts
       * down from the grant. Any later block would satisfy the row's figures on its own.
       */
      if (label.includes('及以后')) {
        expect(counts.get(blockNo! - 1), `${label}: the block before it is still the old length`)
          .toBe(FIRST_FRAMES - 1)
        expect(counts.get(blockNo!), `${label}: and this one is already the granted length`)
          .toBe(REQUEST - 1)
      }
      const want = granted ? REQUEST : FIRST_FRAMES
      expect(val(msgFrames), `${label}: the frames that block’s message has`).toBe(want)
      expect(counts.get(blockNo!), `${label}: and the countdown it starts at`).toBe(want - 1)
      const [from, to] = figs(countdown, /(\d+) → (\d+)/, `${label}: its countdown`)
      expect([from, to], `${label}: printed from that figure down to zero`).toEqual([want - 1, 0])
      expect(val(win.replace(' 格', '')), `${label}: its window`)
        .toBe(granted ? ancillarySlots(PLAN, REQUEST) : ancillarySlots(PLAN))
      expect(val(block.replace(' 格', '')), `${label}: and its block`)
        .toBe(granted ? blockSlots(PLAN, blockNo!, REQUEST) : blockSlots(PLAN, blockNo!))
    }
    // the two-frame table: the request is one octet shorter, because it reports no number
    const bt = tables().find((x) => x.head[0] === '哪一帧')!
    const [fragRow, reqRow] = bt.rows
    expect(val(fragRow![4]!.replace(' 字节', '')), 'a fragment’s own length').toBe(BYTES.fragment)
    expect(val(reqRow![4]!.replace(' 字节', '')), 'and the request’s').toBe(BYTES.request)
    expect(BYTES.fragment - BYTES.request, 'the one octet between them').toBe(1)
    expect([fragRow![1], reqRow![1]], 'and which of them reports a message number')
      .toEqual(['报', '不报'])
    for (const f of sent(rs)) {
      expect(f.bytes, `the frame in slot ${f.slot} is as long as its row says`)
        .toBe(f.request ? BYTES.request : BYTES.fragment)
    }
  })

  it('reads the capacity arithmetic, and the refusal the wider slot causes', () => {
    /*
     * 「一块 200 ms、一个时隙 2 ms，所以一块装得下 100 格；测距那一轮占 5 格，要求自己占 1 格，
     * 于是能批的最大宽度是 94」 — every figure of that line, against the plan it describes.
     */
    const [blockMs, slotMs, perBlock, ranging, reqSlot, grant] = figs(NUMS,
      /一块 ([\d.]+) ms、一个时隙 ([\d.]+) ms，所以一块装得下 (\d+) 格；测距那一轮占 (\d+) 格，要求自己占 (\d+) 格，于是能批的最大宽度是 (\d+)/,
      '`numbers` on the capacity')
    expect(blockMs, 'the block this scene runs').toBe(MS.block)
    expect(slotMs, 'and its slot').toBe(MS.slot)
    expect(perBlock, 'so this many slots fit a block').toBe(CAPS.perBlock)
    expect(Math.floor(blockMs! / slotMs!), 'which is the division the sentence shows').toBe(perBlock)
    expect(ranging, 'the ranging round’s own slots').toBe(PLAN.slots)
    expect(reqSlot, 'the request’s own slot').toBe(1)
    expect(grant, 'and the widest grant that leaves').toBe(CAPS.grant)
    expect(perBlock! - ranging! - reqSlot!, 'read as the subtraction it is').toBe(grant)
    expect(ancillaryGrantFits(PLAN, grant!), 'the engine accepts that width').toBe(true)
    expect(ancillaryGrantFits(PLAN, grant! + 1), 'and refuses one more').toBe(false)
    /*
     * 「把时隙加宽十倍（20 ms）而块一动不动，同一块就只装得下 10 格，能批的最大宽度掉到 4——
     * 于是同一个 3 在这个大厅里被拒」
     */
    const [timesCn, wideMsS, widePerS, wideGrantS, sameS] = raw(NUMS,
      /把时隙加宽(.)倍（([\d.]+) ms）而块一动不动，同一块就只装得下 (\d+) 格，能批的最大宽度掉到 (\d+)——于是同一个 (\d+) 在这个大厅里被拒/,
      '`numbers` on the wide slot')
    const [wideMs, widePer, wideGrant, same] = [wideMsS, widePerS, wideGrantS, sameS].map((x) => val(x!))
    expect(wideMs / MS.slot, 'as many times as wide as the character says').toBe(cn(timesCn!))
    expect(widePer, 'the slots that block then holds').toBe(CAPS.widePerBlock)
    expect(wideGrant, 'and the widest grant left').toBe(CAPS.wideGrant)
    expect(same, 'while the request is unchanged').toBe(REQUEST)
    expect(ancillaryGrantFits(WIDE_PLAN, same), 'so the wide scene refuses it').toBe(false)
    expect(ancillaryGrantFits(PLAN, same), 'and this one grants it').toBe(true)
  })

  it('reads `deeper`’s per-block widths, the hall and the sender', () => {
    /*
     * 「一条控制消息管四块时，同一个会话的块 0 与块 4 是九格，块 1、2、3 是五格」 — the widths of
     * the blocks it names, on a session whose control message governs that many.
     */
    const [blocksCn, wideA, wideB, wideCn, narrowA, narrowB, narrowC, narrowCn] = raw(DEEP,
      /一条控制消息管(.)块时，同一个会话的块 (\d) 与块 (\d) 是(.)格，块 (\d)、(\d)、(\d) 是(.)格/,
      '`deeper` on the per-block widths')
    /*
     * 「同一个会话」 is the lesson before this one: `deeper` measured it there, on the four-frame
     * message, which is why the wide blocks are nine slots and not this lesson's eight.
     */
    const validity = cn(blocksCn!)
    const plan = roundPlan(uwbAncillaryScenario({ rcmValidityRounds: validity }).uwb!, ANCHORS)
    for (const b of [wideA, wideB]) {
      expect(blockSlots(plan, val(b!)), `block ${b} is the wider one`).toBe(cn(wideCn!))
    }
    /*
     * The three narrow blocks are the ones BETWEEN the two wide ones, consecutively — which is
     * what makes 「块 1、2、3」 a reading of the window rather than three numbers that happen to
     * be narrow.
     */
    expect([narrowA, narrowB, narrowC].map((b) => val(b!)),
      'the blocks between the two wide ones, in order')
      .toEqual([val(wideA!) + 1, val(wideA!) + 2, val(wideA!) + 3])
    expect(val(wideB!), 'and the second wide block closes that window')
      .toBe(val(narrowC!) + 1)
    for (const b of [narrowA, narrowB, narrowC]) {
      expect(blockSlots(plan, val(b!)), `block ${b} is the narrower one`).toBe(cn(narrowCn!))
    }
    expect(cn(wideCn!), 'and the wide blocks really are the wider').toBeGreaterThan(cn(narrowCn!))
    // 「本课四个场景是同一个 22 × 8 m 大厅」
    const [wide, deep] = figs(SRC, /同一个 (\d+) × (\d+) m 大厅/, '`sources` on the hall')
    for (const sc of [uwbAncillaryRequestScenario(),
      uwbAncillaryRequestScenario({ schedule: 'contention' }),
      uwbAncillaryRequestScenario({ slotRstu: WIDE_SLOT_RSTU }),
      uwbAncillaryRequestOffScenario()]) {
      expect([sc.rooms[0]!.w, sc.rooms[0]!.h], 'every scene runs in the same hall').toEqual([wide, deep])
    }
    // 「发消息的始终是第 0 个响应方」
    const [idx] = figs(LIM, /发消息的始终是第 (\d) 个响应方/, '`limits` on the sender')
    expect(idx, 'the responder index the model chose').toBe(ANCILLARY_SENDER_INDEX)
    expect(new Set(sent(rs).map((f) => f.node)), 'and one node sends every frame of it')
      .toEqual(new Set([ASKER_ID]))
    expect(ASKER_ID, 'which is that index of the anchors').toBe(idOf(ANCILLARY_SENDER_INDEX))
  })
})
