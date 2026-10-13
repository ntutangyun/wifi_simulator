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
  idOf, uwbAncillary, uwbAncillaryFields, uwbAncillaryOffScenario, uwbAncillaryScenario,
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
  ancillarySlots, blockSlotAction, blockSlots, roundPlan,
} from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { uwbAncillaryRequest } from '../../src/course/uwb/uwb-ancillary-request'

const MS_NS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS_NS
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
      // `request: false` on every one of them: this lesson's four scenes never ask the controller
      // for slots (that is `uwb-ancillary-request`'s subject), so the Request = 1 slot slice 3d
      // added to this action is absent from every window of this lesson.
      expect(blockSlotAction(PLAN, 0, SLOTS.ranging + i))
        .toEqual({ kind: 'uwbAncillary', index: i, request: false })
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
    // 2: the first ranging row, which is a record rather than a transmission. The completion
    // record this list used to end on went to `uwb-ancillary-loss` with the countdown it belongs
    // to; what stays here is the first frame, the last frame, and the ranging the window follows.
    expect(uwbAncillary.jumps).toHaveLength(3)
    expect(ofType(rs, 'UWB_RANGE').some(uwbAncillary.jumps[2].find)).toBe(true)
  })
})

describe('uwb-ancillary · what its own experiment changes, and what it must not', () => {
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
})

describe('uwb-ancillary · no number typed twice', () => {
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
    for (const n of [BYTES.frame, BYTES.shortest, SLOTS.block, SLOTS.contendWindow, NS.frame]) {
      expect(code, `${n} is typed where the engine can compute it`)
        .not.toMatch(new RegExp(String.raw`(?<![\d.])${n}(?![\d.])`))
    }
    // and the engine functions it asks instead, by name
    for (const fn of ['raictIeBytes', 'uwbAncillaryBytes', 'uwbPpduNs', 'roundPlan',
      'ancillarySlots', 'blockSlots', 'blockCarriesAncillary']) {
      expect(code, fn).toContain(fn)
    }
  })
})

/**
 * **The ruler for the one `until` this lesson carries** (criterion B site 17,
 * `tests/course/limits.test.ts`): its `out-of-scope` limit says the Request = 1 half is another
 * lesson's, and names `uwb-ancillary-request` as the lesson that lifts it. This is what measures
 * that the promise is kept rather than merely made.
 *
 * Three things, in the order that makes the promise coherent:
 *
 *  1. **This lesson's four scenes do not set the two fields the promise is about**, so the limit is
 *     true of the scenes it is printed beside — which is what `out-of-scope` means and what
 *     criterion A demands of an `until`.
 *  2. **The target's own scene sets both**, so the axis is a scenario difference rather than a
 *     promise about the engine (every lesson runs the same engine, which is why `until` on an
 *     engine-level kind can never be kept).
 *  3. **The axis moves the quantity the limit names.** The limit's subject is 「排程能不能被请求改
 *     变」, so what has to differ is the round's length under a device's own request: here it is the
 *     session's figure in every block, there it is the granted width from block 1 on.
 *
 * And the sentence this limit used to carry was **false**, which is the other half of why it was
 * rewritten rather than only pointed at: it said the round layout would have to become a per-block
 * computation, and `blockSlots` had already been one since the receipt-confirmation slice.
 */
describe('uwb-ancillary · the `until` it carries is measured, not merely written', () => {
  const sites = [uwbAncillary.scenario(), ...(uwbAncillary.variants ?? []).map((v) => v.scenario())]

  it('points at uwb-ancillary-request from its out-of-scope limit, and from nowhere else', () => {
    const withUntil = uwbAncillary.limits.filter((l) => l.until !== undefined)
    expect(withUntil).toHaveLength(1)
    expect(withUntil[0].until).toBe('uwb-ancillary-request')
    expect(withUntil[0].kind).toBe('out-of-scope')
    expect(withUntil[0].seeAlso).toBeUndefined()
    expect(withUntil[0].text).toContain('排程能不能被请求改变')
  })

  it('sets neither request field in any of its four scenes, while the target sets both', () => {
    for (const sc of sites) {
      expect(sc.uwb!.ancillaryRequest, 'this lesson never asks for slots').toBe(false)
      expect(sc.uwb!.ancillaryRequestSlots, 'and leaves the count at its default').toBe(1)
    }
    const target = uwbAncillaryRequest.scenario()
    expect(target.uwb!.ancillaryRequest).toBe(true)
    expect(target.uwb!.ancillaryRequestSlots).toBeGreaterThan(1)
  })

  it('has one round length per block where the target has two, which is the axis', () => {
    // Here: every block's appended window is the session's own frame count, block after block.
    for (const block of [0, 1, 2, 3]) {
      expect(blockSlots(PLAN, block), `block ${block}`).toBe(PLAN.slots + FRAMES)
    }
    // There: block 0 runs at the session's figure and every block after it at the granted width,
    // read off the countdown's first number rather than off the plan.
    const rs = runOf(uwbAncillaryRequest, undefined, RUN_NS)
    const firsts = new Map<number, number>()
    for (const r of anc(rs)) {
      if (r.requestedSlots !== undefined || r.framesRemaining === null) continue
      if (!firsts.has(r.block)) firsts.set(r.block, r.framesRemaining)
    }
    expect(firsts.get(0)).not.toBe(firsts.get(1))
    expect(new Set([...firsts.values()]).size, 'two widths, not one').toBe(2)
  })

  it('no longer claims the round layout would have to become a per-block computation', () => {
    // The false sentence, gone. `blockSlots` takes a block index and has since §10.36's slice, so
    // 「就得把轮的排布变成每块重算一次」 described work that was already done.
    const text = uwbAncillary.limits.map((l) => l.text).join('\n')
    expect(text).not.toContain('就得把轮的排布变成每块重算一次')
    expect(text).toContain('blockSlots')
    // …and the half of that sentence that IS true is still said: one `roundPlan` call per session.
    expect(text).toContain('roundPlan')
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This lesson prints almost no figure it typed — the frame length, the slot counts, the window
 * and the airtime are all interpolated from its own module, and the file above measures those
 * against runs. What is typed is the **semantics**: the two values of the Request bit, the
 * countdown that ends at zero, the hall this course measures in, and the responder index the
 * model chose. The sampling sweep of 2026-10-12 planted six of them and six went unnoticed.
 *
 * **The reads worth naming:**
 *
 *  - **the countdown is read as the sequence the run writes.** 「剩余帧数从帧数减一数到 0」 and
 *    「最后一帧写 0」 are one claim about one block's frames, so the whole descending run is read
 *    at once — and the jump label that says 「写 0 的那一帧」 has to name the last of them.
 *  - **both halves of the Request bit are read, each on the lesson that has it.** 「置 0 是本课
 *    这一半，置 1 是向控制器请求时隙」 is checked against this lesson's own run (no request frame
 *    anywhere) and against the next lesson's (one request frame per message), which is the only
 *    way a sentence about the other half can be read at all.
 *  - **「22 × 8 m 大厅」 is read off the scene**, because the hall is what the two lessons after
 *    this one keep identical, and `sources` says so.
 */
describe('uwb-ancillary · every figure the prose prints, read back out of it', () => {
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
  const TERMS = blockText(uwbAncillary.terms)
  const PIC = blockText(uwbAncillary.picture)
  const DEEP = blockText(uwbAncillary.deeper)
  const LIM = blockText(uwbAncillary.limits)
  const SRC = blockText(uwbAncillary.sources)
  const JUMPS = uwbAncillary.jumps.map((j) => j.label).join('\n')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)

  const rs = runOf(uwbAncillary, undefined, RUN_NS)
  const frames = sent(rs)
  const firstBlock = frames.filter((f) => f.block === frames[0]!.block)

  it('reads the countdown, and the jump label that names its last frame', () => {
    // 「剩余帧数从帧数减一数到 0」
    const [downTo] = figs(PIC, /剩余帧数从帧数减一数到 (\d)/, '`picture` on the countdown')
    expect(firstBlock.map((f) => f.remaining), 'the countdown this block really writes')
      .toEqual(Array.from({ length: FRAMES }, (_, i) => FRAMES - 1 - i))
    expect(firstBlock.at(-1)!.remaining, 'and it ends at the figure the step prints').toBe(downTo)
    // 「最后一帧写 0。接收端据此判定这条消息收齐了」
    const [lastWrites] = figs(PIC, /最后一帧写 (\d)。接收端据此判定/, '`picture` on the last frame')
    expect(lastWrites, 'the same figure, a second time').toBe(downTo)
    const done = anc(rs).filter((r) => r.framesRemaining === lastWrites)
    expect(done.length, 'and a receiver really sees one such frame per message')
      .toBe(new Set(frames.map((f) => f.block)).size)
    // 「写 0 的那一帧：这条消息的最后一帧」 — the jump label
    const [jumpZero] = figs(JUMPS, /写 (\d) 的那一帧：这条消息的最后一帧/, 'the jump label')
    expect(jumpZero, 'the jump names the same frame').toBe(downTo)
    // 「跳到第一帧辅助信息，它在第 5 个时隙，后面还跟着 3 帧。每帧 16 字节。」
    const [slot, behind, bytes] = figs(PIC,
      /它在第 (\d+) 个时隙，后面还跟着 (\d+) 帧。每帧 (\d+) 字节/, '`picture` on the first frame')
    expect(firstBlock[0]!.slot, 'the slot the first fragment really takes').toBe(slot)
    expect(firstBlock[0]!.remaining, 'how many follow it').toBe(behind)
    for (const f of frames) expect(f.bytes, 'and every frame is that long').toBe(bytes)
  })

  it('reads both halves of the Request bit, each on the lesson that has it', () => {
    // 「置 0 是本课这一半，置 1 是向控制器请求时隙」
    const [mine, other] = figs(TERMS, /置 (\d) 是本课这一半，置 (\d) 是向控制器请求时隙/,
      'the term on the Request bit')
    expect(mine, 'the two values of one bit').not.toBe(other)
    expect(uwbAncillaryScenario().uwb!.ancillaryRequest,
      'this lesson runs the half the term says it does').toBe(Boolean(mine))
    expect(uwbAncillaryRequest.scenario().uwb!.ancillaryRequest,
      'and the next lesson runs the other half').toBe(Boolean(other))
    // 「Request 置 0 时这个信息单元还报这条消息的类型」
    const [limMine] = figs(LIM, /Request 置 (\d) 时这个信息单元还报这条消息的类型/,
      '`limits` on the type field')
    expect(limMine, 'the same half as the term names').toBe(mine)
    for (const r of anc(rs)) {
      expect(r.messageKind, 'and the type is the one constant this engine has')
        .toBe(ANCILLARY_MESSAGE_KIND)
    }
    // 「Request 置 1 的那一半不在本课里」, and 「剩余帧数那个字段在置 1 时装的是请求的时隙数」
    const [limOther, fieldWhen] = figs(LIM,
      /Request 置 (\d) 的那一半不在本课里[\s\S]*?剩余帧数那个字段在置 (\d) 时装的是请求的时隙数/,
      '`limits` on the other half')
    expect([limOther, fieldWhen], 'both name the half this lesson does not build')
      .toEqual([other, other])
    // 「发出这条消息的始终是第 0 个响应方，一轮也只有一条消息」
    const [senderIdx] = figs(LIM, /发出这条消息的始终是第 (\d) 个响应方/, '`limits` on the sender')
    expect(senderIdx, 'the responder index the model chose').toBe(ANCILLARY_SENDER_INDEX)
    expect(new Set(frames.map((f) => f.node)), 'and one node sends every frame')
      .toEqual(new Set([SENDER_ID]))
    expect(SENDER_ID, 'which is that index of the scene’s anchors').toBe(idOf(ANCILLARY_SENDER_INDEX))
  })

  it('reads the information element’s own length range, and `sources` on the half it builds', () => {
    /*
     * **Two figures got past the reads above** (sweep of 2026-10-14), and one of them taught the
     * site-versus-sentence lesson again: 「后面还跟着 3 帧」 is interpolated, so the only standalone
     * 「3」 in this module's strings is the one in the formula note — 「这个信息单元的内容是 1 到 3
     * 字节」. It is read here as the range the engine's own pricing really has, over the four
     * combinations of the two presence bits.
     */
    const note = (uwbAncillary.numbers!.find((b) => b.kind === 'formula') as unknown as
      { note: string }).note
    const [lo, hi] = figs(note, /这个信息单元的内容是 (\d) 到 (\d) 字节/,
      'the formula note on the element’s content')
    const contents = IE.bits.map(([n, f]) => raictIeBytes(n, f) - UWB_IE_HDR_BYTES)
    expect(Math.min(...contents), 'the shortest content this element can have').toBe(lo)
    expect(Math.max(...contents), 'and the longest').toBe(hi)
    expect(hi! - lo!, 'the two optional fields are one octet each').toBe(2)
    expect(RAICT_IE_MIN_BYTES - UWB_IE_HDR_BYTES, 'and the shortest is the control byte alone')
      .toBe(lo)
    // 「本课建的是 Request 置 0 的那一半」 — the third place this lesson names its own half
    const [srcHalf] = figs(SRC, /本课建的是 Request 置 (\d) 的那一半/, '`sources` on the half')
    expect(Boolean(srcHalf), 'the half this lesson really runs')
      .toBe(uwbAncillaryScenario().uwb!.ancillaryRequest)
    expect(srcHalf, 'and it is the same half the term names')
      .toBe(figs(TERMS, /置 (\d) 是本课这一半/, 'the term on the same half')[0])
  })

  it('reads the hall, and the contention window `deeper` quotes', () => {
    // 「本课四个场景是同一个 22 × 8 m 大厅」
    const [wide, deep] = figs(SRC, /同一个 (\d+) × (\d+) m 大厅/, '`sources` on the hall')
    const sc = uwbAncillaryScenario()
    const room = sc.rooms[0]!
    expect([room.w, room.h], 'the hall this lesson really runs in').toEqual([wide, deep])
    const others = [
      uwbAncillaryScenario({ schedule: 'contention' }),
      uwbAncillaryScenario({ rcmValidityRounds: VALIDITY }),
      uwbAncillaryOffScenario(),
    ]
    expect(others.length + 1, 'the four scenes `sources` counts')
      .toBe(1 + uwbAncillary.variants!.length)
    for (const other of others) {
      expect([other.rooms[0]!.w, other.rooms[0]!.h], 'and so do the other three scenes')
        .toEqual([wide, deep])
    }
    // 「竞争式排的是这一轮自己那一段竞争时隙，本课的设置下是 8 个」
    const [contend] = figs(DEEP, /本课的设置下是 (\d+) 个/, '`deeper` on the contention window')
    const contendPlan = roundPlan(uwbAncillaryScenario({ schedule: 'contention' }).uwb!, ANCHORS)
    expect(ancillarySlots(contendPlan), 'the window that schedule really gives').toBe(contend)
    expect(contend, 'which is wider than the scheduled one').toBeGreaterThan(SLOTS.window)
  })
})
