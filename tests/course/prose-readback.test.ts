/**
 * **Does a lesson's own test ever look at what the lesson SAYS?**
 *
 * Every lesson test pins empirical claims: it runs the scene and compares the engine against
 * literals in the test file. That catches an engine change and **misses a prose change** — the
 * point `tests/course/link-2g.test.ts` makes in its own words: 「somebody editing 217.2 to 217.3 in
 * the lesson would ship it」. The answer the programme settled on is a read-back: parse the figure
 * out of the lesson and compare it to the measurement, so there is no figure on the test side to
 * drift and no figure on the lesson side that nothing reads.
 *
 * Nobody had measured how far that had got. On 2026-10-12: **73 of 91 lessons**, with 18 holding
 * none — and the slice that measured it gave `@edca-tamper` one in the same breath, so the list
 * below is 17 and the count is 74. That is the ratchet this file is: a new lesson whose test never touches its own
 * prose has to be added here deliberately, and a lesson that gains a read-back has to be taken
 * off in the same edit.
 *
 * **What this detects, said plainly, because it is weaker than its title suggests.** It is a
 * SYNTACTIC check: does the test file mention the lesson object's prose fields at all
 * (`<lesson>.numbers`, `.observe`, `.tryThis`, …), stringify the lesson, or call the `tableOf`
 * helper the read-back describes use. That is a **necessary** condition for a read-back and not a
 * sufficient one — a test could touch `.observe` and compare nothing. No syntactic check can tell
 * 「compared」 from 「mentioned」, and a check that claimed to would be the defect this programme
 * keeps deleting. So the claim here is exactly: these 18 tests never so much as look at the words
 * their lesson prints, and the other 73 at least do.
 *
 * The companion measurement, from the same sweep and kept in `probes.local/w27-figs4.ts`: of the
 * figures a lesson hand-types into its graded prose (as opposed to interpolating from a computed
 * constant, which cannot drift), the ones with no numerically-equal literal anywhere in tests/.
 * Four lessons appear on BOTH lists — `@edca-tamper`, `@wan-rtt`, `@uwb-uwbd`, `@uwb-subrounds` —
 * and those are where the next read-back is worth the most.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMigrated } from '../../src/course/lessonKit'
import { LESSONS } from '../../src/course/lessons'
import { ROOT } from './coverage'

/** `uwb-sstwr` → `uwbSstwr`: the name a lesson module exports, by this repository's convention. */
const camel = (id: string): string => id.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())

/** The prose fields a read-back could read. `limits` is here too: it is prose a reader sees. */
const PROSE_FIELDS = [
  'numbers', 'observe', 'tryThis', 'picture', 'quiz', 'why', 'outcomes', 'limits',
] as const

/**
 * **`terms` is deliberately NOT one of them, and the measurement is why.** Nearly every lesson
 * test asserts its glossary rows — that is the lesson contract's shape, not a figure read out of
 * prose — so counting `.terms` moves this from 73 lessons to 84 and the rule stops separating the
 * two answers. An exclusion with a measured consequence, rather than a taste.
 */

/**
 * **The 18 lessons whose test never touches their prose**, measured 2026-10-12 and pinned as a
 * SET rather than as a count — the same choice `readability.test.ts` makes for the raw-minutes
 * ceiling, and for the same reason: a count can stay right while the membership rots.
 */
const NO_READBACK: readonly string[] = [
  'mcs-ladder', 'ifs', 'nav', 'hidden', 'ampdu', 'txop', 'txop-protect', 'rate',
  'mumimo', 'mlo', 'amp-ppdu', 'amp-slots', 'amp-coexist', 'amp-backscatter', 'wan-rtt',
  'uwb-uwbd', 'uwb-subrounds',
]

const touchesProse = (id: string): boolean => {
  const f = resolve(ROOT, `tests/course/${id}.test.ts`)
  if (!existsSync(f)) return false
  const t = readFileSync(f, 'utf8')
  const v = camel(id)
  return PROSE_FIELDS.some((fld) => t.includes(`${v}.${fld}`) || t.includes(`lesson.${fld}`))
    || t.includes(`JSON.stringify(${v}`) || t.includes('tableOf(')
}

describe('every lesson test either reads its lesson’s prose, or is listed as not doing so', () => {
  const migrated = LESSONS.filter(isMigrated)

  it('the set of lessons with no prose read-back is exactly the one written down', () => {
    const measured = migrated.filter((l) => !touchesProse(l.id)).map((l) => l.id)
    expect(measured.sort(), 'a lesson gained or lost a prose read-back. Gaining one is the point of'
      + ' this file: take it off NO_READBACK in the same edit. Landing a NEW lesson whose test'
      + ' never reads its own prose means adding it here, deliberately, and that is the moment to'
      + ' ask for a read-back instead — the lesson’s figures would otherwise be editable with'
      + ' the suite green.').toEqual([...NO_READBACK].sort())
  })

  it('every id on the list is a migrated lesson, so the list cannot hide behind a typo', () => {
    const ids = new Set(migrated.map((l) => l.id))
    for (const id of NO_READBACK) {
      expect(ids.has(id), `NO_READBACK names \`${id}\`, which is not a migrated lesson`).toBe(true)
    }
    expect(new Set(NO_READBACK).size, 'NO_READBACK lists an id twice').toBe(NO_READBACK.length)
  })

  it('the detector grades the whole course and finds the majority doing it', () => {
    // The coverage floor: three rules in this programme have reported success while grading
    // nothing. If `camel` or the field list stopped matching, every lesson would look bare and the
    // set assertion above would fail loudly — but a future edit that made the detector match
    // EVERYTHING would pass it silently, with NO_READBACK emptied. So the count is asserted from
    // both ends.
    const with_ = migrated.filter((l) => touchesProse(l.id)).length
    expect(with_, 'lessons whose test touches their prose').toBe(migrated.length - NO_READBACK.length)
    expect(with_).toBeGreaterThan(migrated.length / 2)
    expect(NO_READBACK.length, 'and the list is not empty, which would mean the detector matches'
      + ' everything rather than that the course is finished').toBeGreaterThan(0)
  })

  it('the detector can fail: a test body that never names its lesson is caught', () => {
    // Planted, because a detector only ever run against the real tree has not been shown able to
    // separate the two answers.
    const probe = (body: string): boolean => {
      const v = camel('fading')
      return PROSE_FIELDS.some((fld) => body.includes(`${v}.${fld}`) || body.includes(`lesson.${fld}`))
        || body.includes(`JSON.stringify(${v}`) || body.includes('tableOf(')
    }
    expect(probe('expect(runOf(fading).length).toBeGreaterThan(0)'), 'a run-only test').toBe(false)
    expect(probe('const m = /x/.exec(fading.observe[0])'), 'a read-back').toBe(true)
    expect(probe('const t = tableOf(「x」)'), 'the table helper counts too').toBe(true)
  })
})
