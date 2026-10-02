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
 * gone because nothing is owed. One exception remains, and it announces itself.
 *
 * It used to be the whole paused AMP track, all four lessons declaring
 * `limits: []`. `amp-slots` and `amp-coexist` were migrated to the new shape
 * 2026-10-02 along with the rest of the readability programme's last coverage
 * hole, and each now carries real, engine-checked limits like any other
 * lesson — AMP is still a paused feature, but a paused feature's lesson TEXT is
 * live, and leaving its limits empty was never required by the pause, only by
 * the migration not having reached it yet. `amp-intro` and `amp-ppdu` are what
 * is left, and the expectation below names exactly them, so finishing their
 * migration (or resuming AMP itself) fails this file rather than quietly
 * widening the rule.
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import type { Lesson, LimitKind } from '../../src/course/lessonKit'

const KINDS: LimitKind[] = ['threshold', 'unmodelled', 'model-value', 'out-of-scope']

/** The two AMP lessons not yet migrated to the new shape are not held to this yet. */
const PAUSED_AMP = ['amp-intro', 'amp-ppdu']
const graded = (l: Lesson): boolean => !PAUSED_AMP.includes(l.id)

const done = LESSONS.filter(graded)

describe('the one exception is honest about itself', () => {
  it('excludes exactly these two AMP lessons, and they are the only ones with no limits', () => {
    const excluded = LESSONS.filter((l) => !graded(l)).map((l) => l.id).sort()
    expect(excluded).toEqual([...PAUSED_AMP].sort())
    const empty = LESSONS.filter((l) => l.limits.length === 0).map((l) => l.id).sort()
    expect(empty, 'a lesson declares no limits').toEqual([...PAUSED_AMP].sort())
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
