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
 * `@mlo` (27) to 6 and 85
 * — that one found a real one: the subframe caption called the three fixed parts 36 bytes
 * when they are 34, the 36 being the total WITH the padding the same sentence then adds.
 * That is the ratchet this
 * file is: a new lesson whose test never touches its own prose has to be added here
 * deliberately, and a lesson that gains a read-back has to be taken off in the same edit.
 *
 * **The detector itself was wrong about one lesson, and the slice that paid that lesson down
 * is how it was found.** `@mcs-ladder`'s test imports the lesson under an alias, and the
 * detector only ever looked for `camel(id)` — so the list carried a lesson whose test reads
 * `mcsLadderLesson.numbers` and `….limits` on four lines. It now reads the alias out of the
 * import (`bindings`), which moves exactly that one lesson and no other. The list was
 * nonetheless right about the FIGURES: those four reads are the widget's `params` and four
 * `toContain` checks over `limits`, and not one of the 37 the lesson prints.
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
 * **The lessons whose test never touches their prose** — 18 of them when this was first
 * measured, on 2026-10-12, and the slices since have paid eight of those down. Pinned as a
 * SET rather than as a count — the same choice `readability.test.ts` makes for the raw-minutes
 * ceiling, and for the same reason: a count can stay right while the membership rots.
 */
const NO_READBACK: readonly string[] = [
  'ifs', 'nav', 'hidden', 'rate', 'mumimo', 'amp-ppdu',
]

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

const touchesProse = (id: string): boolean => {
  const f = resolve(ROOT, `tests/course/${id}.test.ts`)
  if (!existsSync(f)) return false
  const t = readFileSync(f, 'utf8')
  const names = bindings(t, id)
  return names.some((v) => PROSE_FIELDS.some((fld) => t.includes(`${v}.${fld}`)))
    || names.some((v) => t.includes(`JSON.stringify(${v}`))
    || t.includes('tableOf(')
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
      const names = bindings(body, 'fading')
      return names.some((v) => PROSE_FIELDS.some((fld) => body.includes(`${v}.${fld}`)))
        || names.some((v) => body.includes(`JSON.stringify(${v}`))
        || body.includes('tableOf(')
    }
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
