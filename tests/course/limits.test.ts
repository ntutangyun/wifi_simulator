/**
 * Every lesson says, row by row, where its model follows the standard and where it does not.
 *
 * **What this file used to be, and why it changed (2026-11-11).** From 2026-09-26 it guarded the
 * old end-of-lesson `limits` section: every graded lesson had to carry at least one `Limit`, in
 * one of four kinds, and two frozen ledgers pinned the `until` promises (「这一条在《…》里会被解除」)
 * and the `seeAlso` pointers (「《…》在这一条上再深一层」), with criteria A, B and C about where an
 * `until` may sit, who judged it and which way it points. The reason was sound — a simulator that
 * never says what it left out teaches a reader to trust it further than it deserves — and it still
 * holds.
 *
 * The standard-first restructure (2026-11-10 for the 34 UWB lessons, 2026-11-11 for the 57
 * Wi-Fi/AMP lessons) moved that duty into `implementation`: each row names one part of the
 * standard, says what the standard specifies and what this simulator does, and classifies the
 * relation (`faithful` / `value` / `choice` / `differs` / `absent`). On 2026-11-11 the last lesson
 * with a non-empty `limits` went, so every check that read `limits` was reading 91 empty arrays:
 * the per-limit rules iterated an empty list, the `until`/`seeAlso` ledgers had no rows, and the
 * anti-vacuity guard (`done.length > 0`) was the one thing still red. Lowering that guard to zero
 * would have left a file of green checks over nothing.
 *
 * So the old checks are retired, not emptied, and what replaced them is below:
 *  1. every lesson is standard-first (the precondition everything else here relies on);
 *  2. every lesson's `implementation` has rows, each row says something on both sides and uses one
 *     of the five kinds, and at least one row is not `faithful` — the claim "this simulator follows
 *     the standard in every respect" is what the old `limits` rule refused, and it is refused here;
 *  3. the retired sections cannot come back: `limits`, `observe` and `tryThis` are empty on every
 *     lesson, and `picture`, `numbers`, `deeper` and the flat `body` are absent. `CoursePanel.tsx`
 *     no longer renders any of them, so a lesson that filled one would print nothing — exactly the
 *     "permitted but inert" shape this repository refuses.
 *
 * The rulers the `until` sites left in their source lessons' own test files (`width.test.ts`,
 * `streams.test.ts`, `uwb-ancillary.test.ts`, …) are untouched; they measure the engine, not the
 * ledger. `docs/uwb-modellable-backlog.md` still quotes the retired `limitSeeAlso` wording as a
 * historical record of slice 4e; the UI string itself was removed with the section.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { isStandardFirst, type ImplKind } from '../../src/course/lessonKit'

const IMPL_KINDS: readonly ImplKind[] = ['faithful', 'value', 'choice', 'differs', 'absent']

describe('every lesson is in the standard-first shape', () => {
  it('has the whole course to check, so the rules below are not vacuous', () => {
    // 91 lessons on 2026-11-11. A floor rather than the figure: readability-rules.test.ts pins
    // the exact lesson count.
    expect(LESSONS.length).toBeGreaterThan(80)
  })

  it('has no lesson left in an older shape', () => {
    const old = LESSONS.filter((l) => !isStandardFirst(l)).map((l) => l.id)
    expect(old, 'these lessons are not standard-first').toEqual([])
  })

  it.each(LESSONS)('$id has ① standard, ② implementation and ③ labs, none of them empty', (l) => {
    expect(l.standard!.length, `${l.id}: ① standard`).toBeGreaterThan(0)
    expect(l.implementation!.length, `${l.id}: ② implementation`).toBeGreaterThan(0)
    expect(l.labs!.length, `${l.id}: ③ labs`).toBeGreaterThan(0)
  })
})

describe('a lesson says, row by row, where the simulator follows the standard', () => {
  it.each(LESSONS)('$id has implementation rows, and not every one is faithful', (l) => {
    expect(l.implementation!.some((it) => it.kind !== 'faithful'), `${l.id}: every row is faithful`)
      .toBe(true)
  })

  it.each(LESSONS)('$id uses only the five kinds, and says something on both sides of each row', (l) => {
    for (const row of l.implementation!) {
      expect(IMPL_KINDS, `${l.id} / ${row.topic}: ${row.kind}`).toContain(row.kind)
      expect(row.topic.trim(), `${l.id}: a row with no topic`).not.toBe('')
      expect(row.standard.trim(), `${l.id} / ${row.topic}: nothing on the standard side`).not.toBe('')
      expect(row.sim.trim(), `${l.id} / ${row.topic}: nothing on the simulator side`).not.toBe('')
    }
  })

  it.each(LESSONS)('$id names each topic once', (l) => {
    const topics = l.implementation!.map((x) => x.topic)
    expect(new Set(topics).size, `${l.id}: a topic repeats`).toBe(topics.length)
  })
})

describe('the sections the standard-first restructure retired cannot come back (2026-11-11)', () => {
  it.each(LESSONS)('$id has empty `limits`, `observe` and `tryThis`', (l) => {
    expect(l.limits, `${l.id}: limits — say it in an ② implementation row`).toEqual([])
    expect(l.observe, `${l.id}: observe — say it in a ③ lab`).toEqual([])
    expect(l.tryThis, `${l.id}: tryThis — say it in a ③ lab`).toEqual([])
  })

  it.each(LESSONS)('$id has no `picture`, `numbers`, `deeper` or flat `body`', (l) => {
    for (const k of ['picture', 'numbers', 'deeper', 'body'] as const) {
      expect(l[k], `${l.id}: \`${k}\` is no longer rendered; put it in ① standard or a ③ lab`)
        .toBeUndefined()
    }
  })
})
