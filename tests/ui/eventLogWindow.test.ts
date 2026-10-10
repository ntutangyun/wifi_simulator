/**
 * The event log's row choice, asked the only question the reader cares about:
 * **after I click a jump, is the line I clicked among the lines you drew?**
 *
 * It was not, for three of the course's 293 jumps. The log ended with
 * `.slice(-160)` — of everything in the `[playhead − 3 ms, playhead + 0.5 ms]`
 * window, the newest 160 — and the window reaches ahead of the playhead, so in
 * a dense region the newest 160 are records that have not happened yet. On
 * `edca` 「接入点上的内部碰撞」 the window held 478 records, 178 of them after the
 * target, and the row the reader had clicked to read was cut out from under
 * them: the clock showed `0.362 642 600 s` and the inspector showed the AP's
 * TXOP, and the line itself was not on the screen.
 *
 * ## Why this file can fail, and what it would take
 *
 * It runs the simulator, so the records are the reader's records and not a
 * fixture of them, and it calls `pickLogRows` — the same function `EventLog.tsx`
 * calls, with the same `TimelineStore`. There is no second implementation of the
 * rule here to drift from the first one. Put `.slice(-LOG_ROWS)` back in
 * `pickLogRows` and the first test below names the three lessons.
 *
 * What it CANNOT see is pixels: `vitest` runs `environment: 'node'` here, there
 * is no jsdom, and jsdom performs no layout anyway. "The row is among the rows
 * rendered" is this file's whole claim, and it is weaker than "the reader can
 * see it" — a batch of 160 rows is some 2 000 px tall in a panel ~511 px high.
 * The viewport half is pinned in a real browser by
 * `tests/e2e/narrow-width.spec.ts` — "a jump puts its own row in front of the
 * reader" for a jump, and "the reader can see where the playhead is after
 * moving it" for the playhead's own row — and neither check is sufficient
 * alone. This separation is deliberate and is not an excuse: a file that
 * claimed the viewport from node would be the weak check pretending to be the
 * strong one. The same split applies to the last test below: it holds the
 * arithmetic of the jump search and not the arrival.
 */
import { describe, it, expect } from 'vitest'
import { Simulation, type Batch } from '../../src/engine/simulation'
import { TimelineStore } from '../../src/player/timelineStore'
import { LESSONS } from '../../src/course/lessons'
import { LOG_ROWS, pickLogRows, windowedRecords } from '../../src/ui/eventLogWindow'
import { JUMP_SEARCH_NS, LOOKAHEAD_NS } from '../../src/player/player'
import type { Lesson } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

/**
 * Run lengths tried in turn until every predicate has fired, mirroring what the
 * per-lesson suites use (`capstone` asks for 5 s, `queues` for 3 s, most for 30 ms).
 * The top rung is past every one of them.
 */
const LADDER = [30 * MS, 100 * MS, 400 * MS, 1_000 * MS, 6_000 * MS]

/**
 * A store holding a lesson's recording.
 *
 * It used to shred the batch into 2 000-record pieces here, because
 * `TimelineStore.ingest` was `records.push(...batch)` and one batch of a
 * 6-second AMP run overflowed the call stack. That limit is gone
 * (`tests/player/timelineStore.test.ts` is where it is now pinned), so this is
 * one call again — and this file is the second place a revert of it shows up
 * red, from the direction the limit was found from.
 */
function storeOf(b: Batch): TimelineStore {
  const st = new TimelineStore()
  st.ingest(b)
  return st
}

function runUntilAllFire(scenario: () => ReturnType<Lesson['scenario']>, preds: ((r: TLRecord) => boolean)[]) {
  let b: Batch = new Simulation(scenario()).runUntil(LADDER[0])
  for (const ns of LADDER) {
    b = new Simulation(scenario()).runUntil(ns)
    if (preds.every((p) => b.records.some(p))) break
  }
  return { batch: b, store: storeOf(b) }
}

/** Every jump of every lesson, against the recording it points at. */
interface JumpCase {
  lesson: string
  idx: number
  label: string
  store: TimelineStore
  target: TLRecord
}

/**
 * What one click costs the reader, by where the record is at the moment they
 * click it on a **freshly loaded lesson** — which is the only question the
 * cost of {@link JUMP_SEARCH_NS} is about.
 *
 *  - `immediate` — the record is inside the 2 s `Player.load` already recorded,
 *    so `done` fires synchronously and nothing is simulated.
 *  - `extend` — the record exists on this lesson's own scene but past that 2 s,
 *    so the worker is asked for more and the reader waits for it.
 *  - `miss` — the predicate does not fire on the loaded scene at all. The
 *    search runs the whole `JUMP_SEARCH_NS` horizon and then answers 「没有」.
 *    This is the worst case, and it is the one the test below bounds.
 *
 * `cls` is read off the BASE batch, not off {@link JumpCase}'s: `JumpCase`
 * deliberately falls back to a variant scene so that every jump has a target to
 * check a rendered row against, and a variant is not what a reader has loaded
 * when they press the button under the lesson's own 「载入」.
 */
interface JumpCost {
  lesson: string
  idx: number
  label: string
  cls: 'immediate' | 'extend' | 'miss'
  /** Where it is on the base scene; null for a `miss`. */
  baseT: number | null
}

const COSTS: JumpCost[] = []

const CASES: JumpCase[] = (() => {
  const out: JumpCase[] = []
  for (const l of LESSONS) {
    const base = runUntilAllFire(l.scenario, l.jumps.map((j) => j.find))
    const variants = new Map<number, ReturnType<typeof runUntilAllFire>>()
    l.jumps.forEach((j, idx) => {
      const onBase = base.batch.records.find(j.find)
      COSTS.push({
        lesson: l.id, idx, label: j.label, baseT: onBase?.t ?? null,
        cls: onBase === undefined ? 'miss' : onBase.t > LOOKAHEAD_NS ? 'extend' : 'immediate',
      })
      let hit = base
      if (!hit.batch.records.some(j.find)) {
        // `amp-slots` declares two jumps on purpose that only its variants fire;
        // its own suite checks them against those variants, and so does this.
        const vs = l.variants ?? []
        for (let vi = 0; vi < vs.length; vi++) {
          if (!variants.has(vi)) variants.set(vi, runUntilAllFire(vs[vi].scenario, [j.find]))
          if (variants.get(vi)!.batch.records.some(j.find)) { hit = variants.get(vi)!; break }
        }
      }
      const target = hit.batch.records.find(j.find)
      if (target) out.push({ lesson: l.id, idx, label: j.label, store: hit.store, target })
    })
  }
  return out
})()

describe('the event log renders the row a jump landed on', () => {
  it('found every jump of every lesson, so the census below covers the course', () => {
    // If a jump stops firing this drops, and the claims below would quietly
    // cover less of the course than they say. 301 since slice W13: `@claim-to-contribution`
    // brought four jumps and all four fire in its own base scene; 297 after W12b's
    // `@uhr-rate-ladder`, 293 on 2026-10-09.
    expect(CASES.length).toBe(301)
    expect(new Set(CASES.map((c) => c.lesson)).size).toBeLessThanOrEqual(LESSONS.length)
  })

  it('every one of the 301 clicked rows is among the rows drawn', () => {
    const missing = CASES.filter((c) => {
      const win = windowedRecords(c.store, c.target.t)
      const { rows } = pickLogRows(win, c.target.t, c.target.seq)
      return !rows.some((r) => r.seq === c.target.seq)
    }).map((c) => `${c.lesson}#${c.idx} ${c.label}`)
    expect(missing).toEqual([])
  })

  it('reports the clicked row as the anchor, which is what the screen scrolls to', () => {
    // Without this, `pickLogRows` could satisfy the test above by rendering the
    // row and telling `EventLog` nothing about it — in the DOM, still unfindable.
    const silent = CASES.filter((c) => {
      const win = windowedRecords(c.store, c.target.t)
      return pickLogRows(win, c.target.t, c.target.seq).anchorSeq !== c.target.seq
    }).map((c) => `${c.lesson}#${c.idx}`)
    expect(silent).toEqual([])
  })

  it('names the three jumps the old "newest 160" rule cut, so the defect stays described', () => {
    // The point of the fix, stated as the measurement that found it. If a lesson
    // edit makes one of these windows sparse the list shrinks and this fails —
    // which is the right outcome: the example in the docblocks would be stale.
    const cut = CASES.filter((c) => {
      const win = windowedRecords(c.store, c.target.t)
      return !win.slice(-LOG_ROWS).some((r) => r.seq === c.target.seq)
    }).map((c) => `${c.lesson}#${c.idx}`)
    expect(cut).toEqual(['edca#1', 'mumimo#2', 'mumimo-choose#2'])
  })

  it('keeps the row budget at 160, so the per-frame cost cannot have moved', () => {
    // The fix picks a DIFFERENT 160, never more. This is the whole performance
    // argument, and it is checked rather than asserted in prose.
    for (const c of CASES) {
      const win = windowedRecords(c.store, c.target.t)
      expect(pickLogRows(win, c.target.t, c.target.seq).rows.length, c.lesson)
        .toBeLessThanOrEqual(LOG_ROWS)
      expect(pickLogRows(win, c.target.t, null).rows.length, c.lesson)
        .toBeLessThanOrEqual(LOG_ROWS)
    }
  })

  it('marks the playhead on every one of them: the reader can always see where they are', () => {
    // `markerSeq` was null in exactly the three cut cases — the batch was all
    // future, so no row was at or before the playhead to carry the border.
    const unmarked = CASES.filter((c) => {
      const win = windowedRecords(c.store, c.target.t)
      return pickLogRows(win, c.target.t, c.target.seq).markerSeq === null
    }).map((c) => `${c.lesson}#${c.idx}`)
    expect(unmarked).toEqual([])
  })

  /**
   * The arithmetic premise of `Player.seekFirstAhead`, and the ratchet on the
   * constant it is bounded by.
   *
   * `Player.load` records `LOOKAHEAD_NS` = 2 s ahead of a playhead that starts
   * at 0, so a jump clicked on a freshly loaded lesson can only reach a record
   * inside the first two seconds. Two of these 293 cannot, which is why the
   * player holds a jump and asks the worker for more recording — bounded by
   * `JUMP_SEARCH_NS`, because an unbounded search on `mumimo` would be 165 MiB
   * of records for one click.
   *
   * This is the half a pure function can hold: that the bound is wide enough
   * for every jump the course has, and that the margin is a measured number
   * rather than a hope. It does NOT show that a reader who clicks once arrives
   * — that is `tests/e2e/narrow-width.spec.ts`, "a jump reaches past the
   * recording, without the reader playing it", and neither check is sufficient
   * alone.
   */
  it('keeps every jump target inside the recording a jump may ask for', () => {
    const beyond = CASES.filter((c) => c.target.t > JUMP_SEARCH_NS)
      .map((c) => `${c.lesson}#${c.idx} ${c.label} @ ${c.target.t}`)
    expect(beyond).toEqual([])
    // The two that are past the LOOKAHEAD, named: they are the reason the
    // search exists, and if a lesson edit adds a third the list says so.
    const pastLookahead = CASES.filter((c) => c.target.t > LOOKAHEAD_NS).map((c) => `${c.lesson}#${c.idx}`)
    expect(pastLookahead).toEqual(['queues#2', 'capstone#1'])
    // The debt, measured, and its margin — the same shape `tests/course`'s
    // ratchets use. 2.453 384 778 s is `capstone#1`, the furthest jump in the
    // course; 546 615 222 ns is what is left of the 3 s horizon above it.
    const furthest = Math.max(...CASES.map((c) => c.target.t))
    expect(furthest).toBe(2_453_384_778)
    expect(JUMP_SEARCH_NS - furthest).toBe(546_615_222)
  })

  /**
   * **The other side of the bound: what the worst click actually costs.**
   *
   * On-demand extension was taken with one cost declared and nothing measuring
   * it: 「the worst case is one click buying three seconds of simulation and a
   * hundred-odd megabytes」, triggered by a reader pressing one of `amp-slots`'
   * two variant-only jumps on its base scene — where the old code said 「尚未
   * 出现」 at once and the new one answers after the search. Measured, the first
   * half of that sentence is about SIM time and not the reader's, and the
   * second half is wrong by a factor of twenty:
   *
   * | base scene, 0…3 s | records | resident | sim time |
   * | --- | --- | --- | --- |
   * | `amp-slots` — the scene both misses live on | 30 718 | 6.5 MiB | 125 ms |
   * | `amp-slots`, the 2→3 s part a click adds | +10 221 | +1.7 MiB | +41 ms |
   * | `mumimo` — the densest scene in the course | 967 082 | 122.8 MiB | 2 740 ms |
   *
   * (`node --expose-gc`, heapUsed either side of one run, ~221 B/record.) The
   * two misses are on the course's SPARSEST kind of scene: six AMP tags in one
   * room. 「上百兆」 is `mumimo`'s number, and `mumimo` has no jump that misses.
   *
   * So the two things this pins are the census and the budget, and they fail for
   * different reasons. The census: exactly which jumps are in which class, which
   * is the sentence `Player.seekFirstAhead` and `CoursePanel` both state in
   * prose. The budget: the full-horizon recording of every scene a `miss` can
   * be clicked from stays small — put a never-firing jump on `mumimo` and this
   * goes red at 967 082 against a 50 000 budget, which is exactly the regression
   * the declaration feared and the one place it could actually happen.
   *
   * What it does NOT hold is the reader's wall clock: `setTimeout`-chunked
   * worker pumping and `postMessage` are not in this process, and 3 s of SIM
   * time is not 3 s of the reader's. Browser-measured on 2026-10-10, the click
   * prints its answer 0.37–0.50 s later at 939×511 and 0.17–0.23 s at 470×511,
   * with the clock still at zero — not three seconds. Keeping those numbers out
   * of a node test is the same split the file's head docblock describes.
   */
  it('bounds what the worst click can cost, on the scene the reader clicks it from', () => {
    // A `miss` is read off the base batch, so the ladder's top rung must reach
    // past the horizon or 「never fires」 would mean 「not yet in this batch」.
    expect(LADDER[LADDER.length - 1]).toBeGreaterThanOrEqual(JUMP_SEARCH_NS)
    expect(COSTS.length).toBe(CASES.length)

    const named = (cls: JumpCost['cls']) =>
      COSTS.filter((c) => c.cls === cls).map((c) => `${c.lesson}#${c.idx} ${c.label}`)
    // 297 since slice W13 added four more jumps that all answer from the base batch; 293 after
    // W12b's four, 289 before them.
    // 289, not the 291 the first draft of this said: the two `amp-slots` misses
    // were counted as synchronous AND as the 「没有」 case, in one breath.
    expect(named('immediate').length).toBe(297)
    expect(named('extend')).toEqual([
      'queues#2 AP 第一次因生存期丢帧',
      'capstone#1 第一个触发帧',
    ])
    expect(named('miss')).toEqual([
      'amp-slots#3 第一次空转（ACWE 3 变体）',
      'amp-slots#4 第一帧调度型触发帧（两阶段变体）',
    ])

    // The budget, and the measurement under it. One run per scene a miss can be
    // clicked from, to the horizon the search would reach — what the worker is
    // asked for, counted the way the worker would end up holding it.
    const MISS_RECORD_BUDGET = 50_000
    const scenes = [...new Set(COSTS.filter((c) => c.cls === 'miss').map((c) => c.lesson))]
    expect(scenes).toEqual(['amp-slots'])
    const horizon = scenes.map((id) => {
      const l = LESSONS.find((x) => x.id === id)!
      return new Simulation(l.scenario()).runUntil(JUMP_SEARCH_NS).records.length
    })
    for (const [i, n] of horizon.entries()) expect(n, scenes[i]).toBeLessThan(MISS_RECORD_BUDGET)
    expect(horizon).toEqual([30_718])
  })

  it('lets go of a stale anchor by itself, with nothing to clear', () => {
    // The anchor is honoured only at its own instant. A reader who jumps and
    // then steps on must get the log back, and `jumpSeq` is not cleared by any
    // navigation — this is the property that makes that safe.
    const c = CASES.find((x) => x.lesson === 'edca' && x.idx === 1)!
    const later = c.store.nextRecordTime(c.target.t)!
    const win = windowedRecords(c.store, later)
    const { anchorSeq, markerSeq } = pickLogRows(win, later, c.target.seq)
    expect(anchorSeq).toBeNull()
    expect(markerSeq).not.toBeNull()
  })
})

describe('the event log marks the playhead wherever the reader scrubs to', () => {
  /**
   * The same defect away from any jump. Sampling 40 playhead positions in each
   * lesson, `.slice(-160)` left 55 of 2374 (2.3 %) with no marker at all and
   * every drawn row in the future — the log showed a reader nothing that had
   * happened yet. Anchoring on the marker is one rule for both cases.
   */
  it('over 40 playhead positions in each of the 88 lessons', () => {
    let samples = 0
    const unmarked: string[] = []
    let overBudget = 0
    for (const l of LESSONS) {
      const b = new Simulation(l.scenario()).runUntil(400 * MS)
      if (!b.records.length) continue
      const st = storeOf(b)
      const end = b.records[b.records.length - 1].t
      for (let k = 1; k <= 40; k++) {
        const ph = Math.floor((end * k) / 40)
        const win = windowedRecords(st, ph)
        if (!win.length) continue
        samples++
        const { rows, markerSeq } = pickLogRows(win, ph, null)
        if (rows.length > LOG_ROWS) overBudget++
        // Only where the window actually holds a record at or before the
        // playhead: where it does not there is nothing to mark and null is right.
        if (markerSeq === null && win.some((r) => r.t <= ph)) unmarked.push(`${l.id}@${ph}`)
      }
    }
    expect(samples).toBeGreaterThan(2_000)
    expect(overBudget).toBe(0)
    expect(unmarked).toEqual([])
  })
})
