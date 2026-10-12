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
 * below is 17 and the count is 74. The slice after it did the same for
 * `@wan-rtt`, and the one after that for `@amp-coexist` — the lesson with the most hand-typed
 * figures in the course, 111 of them with none interpolated. The list is 15 and the count is
 * 76 — and `@amp-backscatter`, second on the same ranking with 86, took it to 14 and 77: the
 * ratchet turning, which is its job. `@amp-slots` (84, third on the ranking) followed: 13 and 78,
 * then `@uwb-uwbd` (54, four tables) and `@uwb-subrounds` (43): 11 and 80, and `@txop-protect`
 * — 40 figures, the most of the eleven still owing — 10 and 81. `@txop` (38, the next on that
 * ranking) took it to 9 and 82, `@mcs-ladder` (37) to 8 and 83, `@ampdu` (35) to 7 and 84 and
 * `@mlo` (27) to 6 and 85, `@amp-ppdu` (26) to 5 and 86, and `@hidden` (23) to 4 and 87
 * — that one found a real one: the subframe caption called the three fixed parts 36 bytes
 * when they are 34, the 36 being the total WITH the padding the same sentence then adds.
 * `@nav` (19) took it to 3 and 88, and found two: an `unmodelled` limit listing TXOP
 * protection among what this engine does not do, nineteen days after it landed, and a
 * one-AP limit whose citation said a second access point is ignored where the schema
 * refuses it by name. `@ifs` (18) took it to 2 and 89, and its `limits` turned out to hold
 * the two claims in the course that are about the engine having NO delay — zero CCA
 * detection, zero propagation — which 1018 `CCA_BUSY` and 509 `RX_START` records, every one
 * of them on the same nanosecond as a `TX_START`, now say out loud. `@rate` (18) and
 * `@mumimo` (12) closed it: **`NO_READBACK` is empty and the count is 91 of 91.**
 *
 * **An empty list changes what this file guards, and the count test says how.** The rule
 * stays exactly as strict — a new lesson whose test never touches its own prose has to be
 * added to the list deliberately, which is the moment to ask for a read-back instead, and a
 * lesson that gains one has to be taken off in the same edit. What had to move is the
 * non-vacuity argument: 「the list is not empty」 was evidence that the detector was not
 * matching everything, and it cannot be made by a finished course. The planted probe at the
 * bottom makes it instead, which is why the probe now runs the production rule.
 *
 * **The detector itself was wrong about one lesson, and the slice that paid that lesson down
 * is how it was found.** `@mcs-ladder`'s test imports the lesson under an alias, and the
 * detector only ever looked for `camel(id)` — so the list carried a lesson whose test reads
 * `mcsLadderLesson.numbers` and `….limits` on four lines. It now reads the alias out of the
 * import (`bindings`), which moves exactly that one lesson and no other. The list was
 * nonetheless right about the FIGURES: those four reads are the widget's `params` and four
 * `toContain` checks over `limits`, and not one of the 37 the lesson prints.
 *
 * **The sufficient condition is a measurement, not a check, and it now has a tool and a ledger.**
 * `scripts/figure-planting.ts` plants one edit per printed figure in a lesson and records which
 * plantings the tests do not notice; `docs/course-figure-pinning.md` is the account of what it
 * has measured. First results, 2026-10-12: `@nav` 0 of 31 unpinned, `@backoff` 0 of 47,
 * `@airtime` 0 of 82 after a slice that found **74 of 86** unpinned, `@ifs` 2 of 26 and `@cca`
 * 3 of 55 (every one of those five documented in its own test as having nothing here to check it
 * against). A six-figure sample of the rest of the course says **most lessons notice none of
 * their six** — so this file's green says what it says and no more: 91 of 91 tests look at their
 * lesson's words. The whole course is 8 512 plantable figures across 91 lessons (plus 1 712
 * citations and names, which nothing in this repository can check).
 *
 * **What this detects, said plainly, because it is weaker than its title suggests.** It is a
 * SYNTACTIC check: does the test file mention the lesson object's prose fields at all
 * (`<lesson>.numbers`, `.observe`, `.tryThis`, …), stringify the lesson, or call the `tableOf`
 * helper the read-back describes use. That is a **necessary** condition for a read-back and not a
 * sufficient one — a test could touch `.observe` and compare nothing. No syntactic check can tell
 * 「compared」 from 「mentioned」, and a check that claimed to would be the defect this programme
 * keeps deleting. So the claim here is exactly: the tests on the list never so much as look at
 * the words their lesson prints, and the rest at least do. The list is empty today, which makes
 * that claim 「all 91 do」 — and no stronger than it was: it still says they look, not that they
 * compare. What they compare is each lesson test's own business, and each of the twelve slices
 * that emptied this list verified its own by planting one edit per printed figure and requiring
 * a red for each.
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
 * **The lessons whose test never touches their prose** — 18 of them when this was first
 * measured, on 2026-10-12, and the slices since have paid eight of those down. Pinned as a
 * SET rather than as a count — the same choice `readability.test.ts` makes for the raw-minutes
 * ceiling, and for the same reason: a count can stay right while the membership rots.
 */
const NO_READBACK: readonly string[] = []

/**
 * **The names a test file can be holding its lesson under.** `camel(id)` is the convention, and
 * two files break it on purpose: `mcs-ladder`'s test imports `mcsLadder as mcsLadderLesson`,
 * because `mcsLadder` is already the widget model's function, and `claim-to-contribution`'s
 * renames to `L`. Reading the alias out of the import is the difference between measuring what
 * this file says it measures and measuring a naming convention — the detector called
 * `@mcs-ladder` bare for four slices while its test was reading `mcsLadderLesson.numbers` and
 * `….limits` on four lines. (`@claim-to-contribution` was never on the list, but only because
 * it also calls `tableOf(`: the right answer for the wrong reason.)
 */
const bindings = (text: string, id: string): string[] => {
  const v = camel(id)
  const out = new Set([v, 'lesson'])
  for (const m of text.matchAll(new RegExp(String.raw`\b${v}\s+as\s+(\w+)`, 'g'))) out.add(m[1])
  return [...out]
}

/**
 * The whole rule, over a test file's text — so that the planted probe at the bottom of this
 * file exercises the production path rather than a copy of it. That matters more than it did:
 * with `NO_READBACK` empty, this probe IS the non-vacuity guard (see the count test).
 */
const touchesProseIn = (t: string, id: string): boolean => {
  const names = bindings(t, id)
  return names.some((v) => PROSE_FIELDS.some((fld) => t.includes(`${v}.${fld}`)))
    || names.some((v) => t.includes(`JSON.stringify(${v}`))
    || t.includes('tableOf(')
}

const touchesProse = (id: string): boolean => {
  const f = resolve(ROOT, `tests/course/${id}.test.ts`)
  if (!existsSync(f)) return false
  return touchesProseIn(readFileSync(f, 'utf8'), id)
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
    // **Until 2026-10-12 the other end was `NO_READBACK.length > 0`**, on the argument that an
    // empty list would more likely mean a detector matching everything than a finished course.
    // The course is now finished, so that assertion could only be satisfied by owing a
    // read-back — and the argument it was making still has to be made. It is made by the
    // planted probe below, which runs the production rule (`touchesProseIn`) against a body
    // that reads no prose: if the detector matched everything, that is where it goes red, and
    // the count above would be meaningless without it. Asserted here too, so this test is not
    // the one that passes vacuously.
    expect(touchesProseIn('expect(runOf(fading).length).toBeGreaterThan(0)', 'fading'),
      'the detector matches a test that never names its lesson, so the count above means nothing')
      .toBe(false)
  })

  it('the detector can fail: a test body that never names its lesson is caught', () => {
    // Planted, because a detector only ever run against the real tree has not been shown able to
    // separate the two answers.
    const probe = (body: string): boolean => touchesProseIn(body, 'fading')
    expect(probe('expect(runOf(fading).length).toBeGreaterThan(0)'), 'a run-only test').toBe(false)
    expect(probe('const m = /x/.exec(fading.observe[0])'), 'a read-back').toBe(true)
    expect(probe('const t = tableOf(「x」)'), 'the table helper counts too').toBe(true)
    // and the alias, which is the hole this detector had until 2026-10-12: both answers through
    // a renamed import, so the fix is shown able to separate them rather than only to match more
    const aliased = "import { fading as fadingLesson } from '../../src/course/tier2/fading'; "
    expect(probe(`${aliased}const m = /x/.exec(fadingLesson.observe[0])`),
      'a read-back through an alias').toBe(true)
    expect(probe(`${aliased}expect(runOf(fadingLesson).length).toBe(1)`),
      'and an alias whose test still reads no prose').toBe(false)
  })
})
