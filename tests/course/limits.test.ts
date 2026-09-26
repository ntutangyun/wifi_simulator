/**
 * Every lesson says where its model is not the radio.
 *
 * A survey on 2026-09-26 found 5 of 68 lesson files declaring anything at all,
 * under seven different ad-hoc headings. A simulator that never says what it
 * left out teaches a reader to trust it further than it deserves — and this
 * course's whole discipline is that a stated number matches the simulated one,
 * which is worth nothing if the reader cannot tell which numbers are modelled.
 *
 * `limits` is optional in the type only because it is being rolled out in waves.
 * `NOT_YET` below is the remaining work, and it asserts its own membership: when
 * a lesson on that list gains its `limits`, this file fails and tells you to
 * strike it off. When the list is empty the field becomes required and this
 * shrinking exception goes away.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { trackOf } from '../../src/course/curriculum'
import type { Lesson, LimitKind } from '../../src/course/lessonKit'

const KINDS: LimitKind[] = ['threshold', 'unmodelled', 'model-value', 'out-of-scope']

/** The AMP track is paused, so its lessons are not held to this yet. */
const graded = (l: Lesson): boolean => trackOf(l) !== 'amp'

/**
 * Lessons that have not been through the rollout yet. Strike a lesson off the
 * moment it gains `limits` — the expectation below will tell you when.
 */
const NOT_YET: readonly string[] = []

const done = LESSONS.filter((l) => graded(l) && !NOT_YET.includes(l.id))

describe('the rollout list is honest about itself', () => {
  it('lists only lessons that exist', () => {
    const ids = new Set(LESSONS.map((l) => l.id))
    const ghosts = NOT_YET.filter((id) => !ids.has(id))
    expect(ghosts, `NOT_YET names lessons that do not exist: ${ghosts.join(', ')}`).toEqual([])
  })

  it('names exactly the graded lessons that still have no limits', () => {
    // Not an allowance, a ledger of work owed. When a lesson gains `limits`,
    // this fails and says which line to delete.
    const actual = LESSONS.filter((l) => graded(l) && !l.limits?.length).map((l) => l.id).sort()
    expect(actual).toEqual([...NOT_YET].sort())
  })

  it('has something already done, so the rules below are not vacuous', () => {
    expect(done.length).toBeGreaterThan(0)
  })
})

describe('a lesson that declares its limits declares them properly', () => {
  it.each(done)('$id names at least one', (l) => {
    expect(l.limits?.length ?? 0).toBeGreaterThan(0)
  })

  it.each(done)('$id uses only the four kinds', (l) => {
    for (const lim of l.limits ?? []) {
      expect(KINDS, `${l.id}: ${lim.kind}`).toContain(lim.kind)
    }
  })

  it.each(done)('$id says something in each one', (l) => {
    for (const lim of l.limits ?? []) {
      // Long enough to have named what was given up rather than that something was.
      expect(lim.text.length, `${l.id} / ${lim.kind}: "${lim.text}"`).toBeGreaterThan(16)
    }
  })

  it.each(done)('$id does not repeat a kind with the same words', (l) => {
    const seen = (l.limits ?? []).map((x) => `${x.kind}:${x.text}`)
    expect(new Set(seen).size, l.id).toBe(seen.length)
  })
})

describe('a limit that promises the truth later names a lesson that delivers it', () => {
  const ids = new Set(LESSONS.map((l) => l.id))

  it('every `until` points at a real lesson', () => {
    const bad: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits ?? []) {
        if (lim.until && !ids.has(lim.until)) bad.push(`${l.id} → ${lim.until}`)
      }
    }
    expect(bad, `dangling until: ${bad.join(', ')}`).toEqual([])
  })

  it('never points at itself', () => {
    const bad = LESSONS.filter((l) => (l.limits ?? []).some((x) => x.until === l.id)).map((l) => l.id)
    expect(bad).toEqual([])
  })
})
