/**
 * The ranging-ancillary **request** (standard §10.35.1's last sentence, §10.35.2.1's Request field),
 * every configuration the schema allows it in proved either refused, effective, or inert-and-pinned
 * — `docs/inert-config-contract.md`'s six steps, and §6.7 of
 * `docs/superpowers/specs/2026-10-05-ancillary-request-design.md`, which is the verdict this file is
 * the enforcement of: **two refusals and five pins.**
 *
 * **What the ruler is, and why it is not the hash fixtures.** `stream()` is `JSON.stringify` over
 * the whole record array, nothing dropped — the shape `tamper-inert.test.ts` set, and the only one
 * that can see this slice at all. The two fixtures each have a blind spot that this slice falls
 * straight into, and they are different blind spots:
 *
 *  - `tests/fixtures/lesson-hashes.json` folds `t:seq:type` only, and runs for 150 ms while a UWB
 *    block is 200 ms — so for every UWB lesson it sees block 0 and nothing else. A feature whose
 *    whole subject is 「block b's request changes block b + 1」 is invisible to it. Measured:
 *    `uwb-ancillary` (R = 1) and `uwb-ancillary#1` (R = 4) hash identically (`69eba038`) although
 *    their blocks 1–3 differ.
 *  - `tests/fixtures/uwb-record-hashes.json` *is* field-by-field and runs the full 1300 ms, but it
 *    filters to `UWB_*` — so `TX_START`, `TX_END`, `RX_START` and `RX_OK` are outside it, which is
 *    610 of the 903 records of the shipped scene and the only ones carrying a frame's length.
 *
 * The slice's own build is the proof of that, not an argument for it: the first cut added
 * `request: false` to every ancillary frame's RAICT descriptor, which moved 112 of those 903
 * records — and **both fixtures stayed green**. The field is written only when the bit is set now
 * (`uwb/frames.ts#UwbInfo.raict`), and the whole-stream comparison below is what says so.
 *
 * **Every assertion states the thing as it IS.** 「identical」 or 「differs only in these records」,
 * never 「has an effect」. The two live controls are here for the same reason the inert ones are: an
 * inert assertion that passed because the mechanism was switched off everywhere would be worse than
 * no assertion.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, ancillaryRequestRefusals, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { uwbAncillaryScenario, FRAMES } from '../../src/course/uwb/uwb-ancillary'
import { ancillaryGrantFits, ancillarySlots, blockSlots, roundPlan } from '../../src/uwb/session'
import { uwbAncillaryBytes, uwbPpduNs, raictIeBytes } from '../../src/uwb/phy'

const MS = 1_000_000
/** Seven 200 ms blocks, the window every UWB lesson is measured over — long enough that a grant
 * made in block b has six later blocks to be visible in. */
const RUN_NS = 1300 * MS

const run = (sc: Scenario, ns: number = RUN_NS): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
const stream = (rs: TLRecord[]): string => JSON.stringify(rs)

/** Which records, record types and fields differ, for two streams of equal length. */
function diff(a: TLRecord[], b: TLRecord[]): { n: number; types: string[]; fields: string[] } {
  expect(b.length, 'diff() is only meaningful for streams of equal length').toBe(a.length)
  const types = new Set<string>()
  const fields = new Set<string>()
  let n = 0
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue
    n++
    types.add(a[i].type)
    const ra = a[i] as unknown as Record<string, unknown>
    const rb = b[i] as unknown as Record<string, unknown>
    for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) fields.add(k)
    }
  }
  return { n, types: [...types].sort(), fields: [...fields].sort() }
}

/** The lesson hall, with whatever session switches an assertion names. Parsed, every time: a
 * scenario this file hands `Simulation` has to be one the schema accepts, and the refusals below
 * are the cases where it does not. */
const scene = (over: Partial<UwbSessionCfg>): Scenario => {
  const raw = uwbAncillaryScenario(over)
  return ScenarioSchema.parse(raw) as Scenario
}

/** Every `UWB_ANCILLARY` record of a run, in order. */
const ancRecords = (rs: TLRecord[]): Extract<TLRecord, { type: 'UWB_ANCILLARY' }>[] =>
  rs.filter((r): r is Extract<TLRecord, { type: 'UWB_ANCILLARY' }> => r.type === 'UWB_ANCILLARY')

/** The first Frames Remaining each block's message counted down from — the one number the whole
 * slice is visible in (design §3.4). */
function firstCountdownByBlock(rs: TLRecord[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of ancRecords(rs)) {
    if (r.requestedSlots !== undefined || r.framesRemaining === null) continue
    if (!out.has(r.block)) out.set(r.block, r.framesRemaining)
  }
  return out
}

// ---------------------------------------------------------------------------
// Instrument B: the default is byte-for-byte what it was
// ---------------------------------------------------------------------------

describe('ancillary request · off by default, and off means the stream is unchanged', () => {
  /**
   * **The permanent guard the one-off refactor gate cannot be.** Instrument A of the slice compared
   * all 108 UWB lesson scenes before and after the build, which proves the build did not move them;
   * this proves the *default* cannot move them, for as long as it stands.
   *
   * The two scenarios differ by the absence of the keys rather than by their values: `delete` is
   * what a scenario written before this slice looks like on disk, and the schema's defaults are what
   * fill them in. So this is the identity 「a plan that never heard of the request parses and runs as
   * one that declines it」, which is the claim every `.default(false)` in the schema is making.
   */
  it('a scenario with neither field runs byte for byte identically to one that declines the request', () => {
    const withFields = scene({ ancillaryRequest: false, ancillaryRequestSlots: 1 })
    const bare = uwbAncillaryScenario() as unknown as { uwb: Record<string, unknown> }
    delete bare.uwb.ancillaryRequest
    delete bare.uwb.ancillaryRequestSlots
    const parsedBare = ScenarioSchema.parse(bare) as Scenario
    expect(parsedBare.uwb!.ancillaryRequest, 'the schema fills the default in').toBe(false)
    expect(parsedBare.uwb!.ancillaryRequestSlots).toBe(1)
    expect(stream(run(parsedBare))).toBe(stream(run(withFields)))
  })

  /**
   * …and the same identity over the plan rather than over the run, because that is where a future
   * refactor would break it: every one of the four schedule functions took a new optional parameter
   * in this slice, and the whole of the structural identity is that not passing it restores the
   * expression that was there.
   */
  it('the four schedule functions answer the same without the new argument as with the session figure', () => {
    const plan = roundPlan(scene({}).uwb!, 4)
    expect(ancillarySlots(plan)).toBe(ancillarySlots(plan, plan.ancillaryFrames))
    for (const block of [0, 1, 4, 7]) {
      expect(blockSlots(plan, block)).toBe(blockSlots(plan, block, plan.ancillaryFrames))
    }
    // and the appended window of a request-less session is the message, exactly
    expect(ancillarySlots(plan)).toBe(FRAMES)
    expect(blockSlots(plan, 0)).toBe(plan.slots + FRAMES)
  })

  /**
   * **The RAICT descriptor carries no `request` key at all when the bit is clear**, which instrument
   * B above cannot see and this does.
   *
   * Worth the extra test because the gap was measured: breaking `makeAncillary` back to writing
   * `request` unconditionally leaves the identity above **green** — both of its scenarios decline
   * the request, so both get the same extra key — and leaves **both hash fixtures green** as well.
   * Only a before-and-after comparison of the whole build caught it (112 of 903 records on this
   * scene). A field this engine adds to a descriptor every frame carries is therefore pinned here
   * directly, rather than left to a gate that runs once.
   */
  it('an ancillary frame sent with the request off carries no request key in its RAICT descriptor', () => {
    const frames = run(scene({})).filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbAncillary')
      .map((r) => (r as Extract<TLRecord, { type: 'TX_START' }>).frame)
    expect(frames.length).toBeGreaterThan(20)
    for (const f of frames) {
      expect(Object.keys(f.uwb!.raict!), 'the Request bit is a key only when it is set')
        .toEqual(['messageNumber', 'framesRemaining'])
    }
  })

  /**
   * The two record fields are **absent**, not `undefined`, on every record that is not a request —
   * the one discipline the hash fixture would silently fold in if it were broken
   * (`uwb-record-hashes.test.ts#serialiseRecord` takes fields with `Object.keys`, and serialises an
   * explicit `undefined` as the text `undefined`).
   */
  it('no fragment record carries the request keys at all, in either direction', () => {
    for (const over of [{}, { ancillaryRequest: true, ancillaryRequestSlots: 6 }]) {
      const rs = ancRecords(run(scene(over)))
      expect(rs.length, JSON.stringify(over)).toBeGreaterThan(0)
      for (const r of rs) {
        const keys = Object.keys(r)
        const isRequest = r.requestedSlots !== undefined
        expect(keys.includes('requestedSlots'), `${r.block}/${r.slot}`).toBe(isRequest)
        expect(keys.includes('grantedSlots'), `${r.block}/${r.slot}`).toBe(isRequest)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Refusal 1 and 2 (§6.7), each paired with a live control on the same hall
// ---------------------------------------------------------------------------

describe('ancillary request · the two refusals, and the control that says each one discriminates', () => {
  it('refuses a request with the exchange off — the field would not be read once', () => {
    const r = ScenarioSchema.safeParse(uwbAncillaryScenario({ ancillary: false, ancillaryRequest: true }))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      // the three things `docs/inert-config-contract.md`'s fifth step asks of a refusal: the field,
      // why it is dead here, and what to change
      expect(msg).toContain('ancillaryRequest')
      expect(msg).toContain('blockCarriesAncillary')
      expect(msg).toContain('ancillary 打开')
    }
    // the control: the identical request on the identical hall, with the exchange on, runs
    const live = run(scene({ ancillaryRequest: true, ancillaryRequestSlots: 6 }))
    expect(ancRecords(live).filter((x) => x.requestedSlots !== undefined).length).toBeGreaterThan(0)
  })

  it('refuses a request in a session with a second tag — only the first controller could be laid out', () => {
    const two = uwbAncillaryScenario({ ancillaryRequest: true })
    const tag = two.nodes.find((n) => n.uwb?.role === 'tag')!
    const sc = { ...two, nodes: [...two.nodes, { ...tag, id: 'tag-2', name: 'Tag 2', pos: { ...tag.pos, x: tag.pos.x + 1 } }] }
    const r = ScenarioSchema.safeParse(sc)
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toContain('blockSlotStartNs')
      expect(msg).toContain('ancillaryRequest 关掉')
    }
    // the control: the same two-tag hall without the request is legal, so the rule is about the
    // request and not about the headcount
    expect(ScenarioSchema.safeParse({ ...sc, uwb: { ...sc.uwb!, ancillaryRequest: false } }).success).toBe(true)
  })

  it('the schema and the editor read one wording', () => {
    const off: Pick<UwbSessionCfg, 'ancillary' | 'ancillaryRequest'> = { ancillary: false, ancillaryRequest: true }
    const fromFn = ancillaryRequestRefusals(off, 1)
    expect(fromFn).toHaveLength(1)
    const fromSchema = ScenarioSchema.safeParse(uwbAncillaryScenario(off))
    expect(fromSchema.success).toBe(false)
    if (!fromSchema.success) {
      expect(fromSchema.error.issues.map((i) => i.message)).toContain(fromFn[0])
    }
    // nothing at all once the request is off, whatever else is set
    expect(ancillaryRequestRefusals({ ancillary: false, ancillaryRequest: false }, 9)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The live half: what a grant actually buys (design §3.4, acceptance 1–3)
// ---------------------------------------------------------------------------

describe('ancillary request · what the request buys is the next exchange’s message length', () => {
  it('puts one frame on the air, priced by raictIeBytes, with the message number absent', () => {
    const rs = run(scene({ ancillaryRequest: true, ancillaryRequestSlots: 6 }))
    const tx = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbAncillary')
      .map((r) => (r as Extract<TLRecord, { type: 'TX_START' }>).frame)
    const requests = tx.filter((f) => f.uwb?.raict?.request === true)
    const fragments = tx.filter((f) => f.uwb?.raict?.request !== true)
    // one request per exchange, and the exchange runs once per block (rcmValidityRounds 1)
    expect(requests.length).toBeGreaterThan(5)
    expect(fragments.length).toBeGreaterThan(requests.length)
    for (const f of requests) {
      // the third of the four presence-bit combinations: no message number (a request is not part
      // of a message), the slot count in Frames Remaining (§10.35.2.1)
      expect(f.uwb!.raict!.messageNumber).toBeUndefined()
      expect(f.uwb!.raict!.framesRemaining).toBe(6)
      expect(f.bytes).toBe(uwbAncillaryBytes(false, true))
      expect(f.txTimeNs).toBe(uwbPpduNs(uwbAncillaryBytes(false, true)))
    }
    // computed, not written down — and one octet shorter than a fragment, which carries both
    expect(raictIeBytes(false, true)).toBeLessThan(raictIeBytes(true, true))
  })

  /**
   * **The acceptance of the whole slice** (design §10.2): block 0's message is the session's own
   * `ancillaryFrames`, and from the block after the grant every message is the granted width — read
   * off the first number of each block's countdown, which is what a reader sees on the timeline.
   */
  it('changes the first number of the next block’s countdown, and block 0’s not at all', () => {
    const granted = 8
    const byBlock = firstCountdownByBlock(run(scene({ ancillaryRequest: true, ancillaryRequestSlots: granted })))
    expect(byBlock.get(0), 'block 0 asked before it could be answered').toBe(FRAMES - 1)
    for (const block of [1, 2, 3, 4, 5, 6]) {
      expect(byBlock.get(block), `block ${block}`).toBe(granted - 1)
    }
    // …and the window the schedule laid out grew with it, by the message plus the request's slot
    const plan = roundPlan(scene({ ancillaryRequest: true, ancillaryRequestSlots: granted }).uwb!, 4)
    expect(blockSlots(plan, 1, granted)).toBe(plan.slots + granted + 1)
    expect(blockSlots(plan, 0, null)).toBe(plan.slots + FRAMES + 1)
  })

  it('leaves every UWB_RANGE field for field what it was with the request off, seq aside', () => {
    const off = run(scene({}))
    const on = run(scene({ ancillaryRequest: true, ancillaryRequestSlots: 6 }))
    /**
     * **`seq` is dropped, and nothing else is.** It is the stream's own running index, so an extra
     * frame per block renumbers every record after it — measured, the fifth range goes from 172 to
     * 183, which is the eleven ancillary records of block 0 and nothing about the range. This is the
     * renumbering `selectivity-inert.test.ts` works around for the same reason, and the reason the
     * whole-stream comparisons in this file are over a prefix rather than over the whole run.
     */
    const ranges = (rs: TLRecord[]) => rs.filter((r) => r.type === 'UWB_RANGE')
      .map(({ seq: _seq, ...rest }) => rest)
    // The ranging phase is slots 0…plan.slots−1 and the appended window comes after it, so the
    // request cannot move a ranging frame — the same reason task 3's own §5.5 gives.
    expect(ranges(on).length).toBe(ranges(off).length)
    expect(ranges(on).length).toBeGreaterThan(20)
    expect(JSON.stringify(ranges(on))).toBe(JSON.stringify(ranges(off)))
  })
})

// ---------------------------------------------------------------------------
// The pins (§6.7): configurations the schema allows and does NOT refuse
// ---------------------------------------------------------------------------

describe('ancillary request · pinned, not refused — four configurations stated as they are', () => {
  /**
   * Pin 1 · **the request value equal to the current frame count.** The field is read — it goes and
   * sizes the next exchange — and the number it computes happens to equal the last one. By the
   * contract's third step that is arithmetic, not wiring, so it is pinned: every exchange is the
   * same length, and the one difference from the request-off run is the request's own frame.
   */
  it('asking for exactly the current frame count: every message the same length, one extra frame on the air', () => {
    const on = run(scene({ ancillaryRequest: true, ancillaryRequestSlots: FRAMES }))
    const byBlock = firstCountdownByBlock(on)
    for (const [, first] of byBlock) expect(first).toBe(FRAMES - 1)
    // …and what it did buy is one frame per block, in one slot per block
    const off = run(scene({}))
    const ancTx = (rs: TLRecord[]) => rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'uwbAncillary').length
    const blocks = byBlock.size
    expect(ancTx(on) - ancTx(off)).toBe(blocks)
    // the streams are NOT identical, which is what makes 「it is read」 a measurement
    expect(stream(on)).not.toBe(stream(off))
  })

  /**
   * Pin 2 · **a contention window wider than the message.** `uwbAncillarySlots` prices the appended
   * window at `max(frames + request, contentionSlots)`, so for every granted width from 1 up to
   * `contentionSlots − 1` the window does not move by a slot. That is a legal interval with a
   * provably constant window width — and it is NOT inert, because the message inside the window
   * really does get longer. The pin states both halves, because a reader who measured only the
   * window would file the first half as a bug.
   */
  it('contention: the window width does not move while the message length does', () => {
    const cs = scene({ schedule: 'contention' }).uwb!.contentionSlots
    expect(cs).toBe(8)
    const plan = (slots: number) => roundPlan(
      scene({ schedule: 'contention', ancillaryRequest: true, ancillaryRequestSlots: slots }).uwb!, 4,
    )
    // every width below the draw window buys the same window…
    for (const w of [1, 2, 4, cs - 1]) {
      expect(ancillarySlots(plan(w), w), `granted ${w}`).toBe(cs)
    }
    // …and one at or above it moves the window by the width plus the request's own slot
    expect(ancillarySlots(plan(cs), cs)).toBe(cs + 1)
    // the message, meanwhile, really is longer: countdowns differ between two widths that share a
    // window width
    const first = (w: number) => firstCountdownByBlock(
      run(scene({ schedule: 'contention', ancillaryRequest: true, ancillaryRequestSlots: w })),
    ).get(3)
    expect(first(2)).toBe(1)
    expect(first(6)).toBe(5)
  })

  /**
   * Pin 3 · **a request the block cannot hold**, which the controller refuses — and this is teaching
   * content rather than a defect, so the schema must not refuse it instead (design §6.3's last row).
   *
   * The boundary is arithmetic the engine and the schema each already do:
   * `plan.slots + mmrcr + window(frames)` against `blockNs / slotNs`. In this hall that is
   * 5 + 0 + (frames + 1) ≤ 100, so 94 is granted and 95 is not — a number nothing in this file or
   * in any lesson writes down.
   */
  it('a request past the block’s own capacity is refused by the controller, not by the schema', () => {
    const plan = roundPlan(scene({ ancillaryRequest: true, ancillaryRequestSlots: 1 }).uwb!, 4)
    // the boundary, from the engine's own predicate
    const edge = Math.floor(plan.blockNs / plan.slotNs) - plan.slots - 1
    expect(edge).toBe(94)
    expect(ancillaryGrantFits(plan, edge)).toBe(true)
    expect(ancillaryGrantFits(plan, edge + 1)).toBe(false)
    // the schema accepts both, because the refusal is the controller's to make
    for (const slots of [edge, edge + 1]) {
      expect(ScenarioSchema.safeParse(uwbAncillaryScenario({
        ancillaryRequest: true, ancillaryRequestSlots: slots,
      })).success, `${slots}`).toBe(true)
    }
    // granted at the edge: the next block's message is that long
    const okByBlock = firstCountdownByBlock(run(scene({ ancillaryRequest: true, ancillaryRequestSlots: edge })))
    expect(okByBlock.get(1)).toBe(edge - 1)
    // refused one past it: there is no refusal frame (the clause defines none) — the record says so,
    // and the next exchange is the session's own width, which is how the asker learns the answer
    const refused = run(scene({ ancillaryRequest: true, ancillaryRequestSlots: edge + 1 }))
    const reqs = ancRecords(refused).filter((r) => r.requestedSlots !== undefined)
    // The refusal first, then the count: a controller that granted this would overrun the block and
    // the run would fall apart, so a count assertion alone would fail with a number nobody can read.
    expect(reqs[0]?.grantedSlots, 'the controller granted a width the block cannot hold').toBeNull()
    expect(reqs.length).toBeGreaterThan(5)
    for (const r of reqs) {
      expect(r.requestedSlots).toBe(edge + 1)
      expect(r.grantedSlots).toBeNull()
    }
    const refusedByBlock = firstCountdownByBlock(refused)
    for (const [, first] of refusedByBlock) expect(first).toBe(FRAMES - 1)
  })

  /**
   * Pin 4 · **the request on a block the exchange does not run in.** With `rcmValidityRounds` 4 the
   * exchange runs in the window's opening block and in none of the three after it
   * (`blockCarriesAncillary`), so neither the message nor the request is on the air there — and the
   * grant made in block 0 is still in force when block 4 comes round. Pinned because 「three blocks
   * with no request in them」 reads like a lost request if nobody says otherwise.
   */
  it('with a four-block validity window, the request rides the opening block only and the grant survives the gap', () => {
    const granted = 7
    const rs = run(scene({ rcmValidityRounds: 4, ancillaryRequest: true, ancillaryRequestSlots: granted }))
    const blocks = [...firstCountdownByBlock(rs).keys()].sort((a, b) => a - b)
    expect(blocks).toEqual([0, 4])
    expect(firstCountdownByBlock(rs).get(0)).toBe(FRAMES - 1)
    expect(firstCountdownByBlock(rs).get(4)).toBe(granted - 1)
    const reqBlocks = ancRecords(rs).filter((r) => r.requestedSlots !== undefined).map((r) => r.block)
    expect(reqBlocks).toEqual([0, 4])
  })

  /**
   * Pin 5 · **which records the request moves, and which it does not.** Stated as a diff rather than
   * as a count, because 「the stream changed」 is not something anybody can act on. The streams are
   * the same length here — the request adds frames but the two runs have the same number of records
   * only by coincidence, so this is asserted rather than assumed and the test says so if it fails.
   */
  it('names the record types a request-equal-to-the-default moves, and the ones it leaves alone', () => {
    const off = run(scene({}), 220 * MS)
    const on = run(scene({ ancillaryRequest: true, ancillaryRequestSlots: FRAMES }), 220 * MS)
    // The extra frame means extra records, so the comparison is over the shared prefix: the ranging
    // phase of block 0, which the appended window sits entirely after.
    expect(on.length).toBeGreaterThan(off.length)
    const prefix = off.findIndex((r) => r.type === 'UWB_ANCILLARY')
    expect(prefix).toBeGreaterThan(0)
    const d = diff(off.slice(0, prefix), on.slice(0, prefix))
    expect(d, 'nothing before the first ancillary record of block 0 moves').toEqual({ n: 0, types: [], fields: [] })
  })
})
