/**
 * Every lesson says where its model is not the radio.
 *
 * A survey on 2026-09-26 found 5 of 68 lesson files declaring anything at all,
 * under seven different ad-hoc headings. A simulator that never says what it
 * left out teaches a reader to trust it further than it deserves — and this
 * course's whole discipline is that a stated number matches the simulated one,
 * which is worth nothing if the reader cannot tell which numbers are modelled.
 *
 * The rollout is over: `limits` is required in the type, every graded lesson
 * carries at least one, and the `NOT_YET` ledger that tracked the work owed is
 * gone because nothing is owed. One exception remains, and it announces itself:
 * the paused AMP track's four lessons declare `limits: []`, and the expectation
 * below names them, so resuming AMP and writing their limits fails this file
 * rather than quietly widening the rule.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { trackOf } from '../../src/course/curriculum'
import type { Lesson, LimitKind } from '../../src/course/lessonKit'

const KINDS: LimitKind[] = ['threshold', 'unmodelled', 'model-value', 'out-of-scope']

/** The AMP track is paused, so its lessons are not held to this yet. */
const graded = (l: Lesson): boolean => trackOf(l) !== 'amp'

const done = LESSONS.filter(graded)

describe('the one exception is honest about itself', () => {
  /**
   * Not an allowance, a standing note of work owed — the same shape the retired
   * `NOT_YET` ledger had. These four are excluded because the track is paused,
   * not because a paused track may skip the rule.
   */
  const PAUSED_AMP = ['amp-coexist', 'amp-intro', 'amp-ppdu', 'amp-slots']

  it('excludes exactly the AMP lessons, and they are the only ones with no limits', () => {
    const excluded = LESSONS.filter((l) => !graded(l)).map((l) => l.id).sort()
    expect(excluded).toEqual([...PAUSED_AMP].sort())
    const empty = LESSONS.filter((l) => l.limits.length === 0).map((l) => l.id).sort()
    expect(empty, 'a lesson outside the AMP track declares no limits').toEqual([...PAUSED_AMP].sort())
  })

  it('has something to check, so the rules below are not vacuous', () => {
    expect(done.length).toBeGreaterThan(0)
  })
})

describe('every graded lesson declares its limits properly', () => {
  it.each(done)('$id names at least one', (l) => {
    expect(l.limits.length).toBeGreaterThan(0)
  })

  it.each(done)('$id uses only the four kinds', (l) => {
    for (const lim of l.limits) {
      expect(KINDS, `${l.id}: ${lim.kind}`).toContain(lim.kind)
    }
  })

  it.each(done)('$id says something in each one', (l) => {
    for (const lim of l.limits) {
      // Long enough to have named what was given up rather than that something was.
      expect(lim.text.length, `${l.id} / ${lim.kind}: "${lim.text}"`).toBeGreaterThan(16)
    }
  })

  it.each(done)('$id does not repeat a kind with the same words', (l) => {
    const seen = l.limits.map((x) => `${x.kind}:${x.text}`)
    expect(new Set(seen).size, l.id).toBe(seen.length)
  })
})

describe('a limit that promises the truth later names a lesson that delivers it', () => {
  const ids = new Set(LESSONS.map((l) => l.id))

  it('every `until` points at a real lesson', () => {
    const bad: string[] = []
    for (const l of LESSONS) {
      for (const lim of l.limits) {
        if (lim.until && !ids.has(lim.until)) bad.push(`${l.id} → ${lim.until}`)
      }
    }
    expect(bad, `dangling until: ${bad.join(', ')}`).toEqual([])
  })

  it('never points at itself', () => {
    const bad = LESSONS.filter((l) => l.limits.some((x) => x.until === l.id)).map((l) => l.id)
    expect(bad).toEqual([])
  })
})
