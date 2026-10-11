/**
 * **Every file path the contract documents cite is a path that resolves — the other half of a
 * check that has existed since the coverage pair was written.**
 *
 * The four documents below are this repository's standing arguments: two coverage tables and two
 * contracts. All four work by citation — 「the rule is here, the assertion is there, the evidence is
 * in this file」 — and a citation nobody follows is the cheapest thing in the repository to get
 * wrong, because it reads as rigour either way.
 *
 * Half of it was already checked. `symbolCitations` + `unresolved` validate every
 * `` `path.ts#symbol` `` token in `docs/wifi-feature-coverage.md` and
 * `docs/uwb-feature-coverage.md`, reporting both 「does not exist」 and 「not exported」. The **bare**
 * path citations — `` `tests/course/kit.ts` ``, `` `src/course/readability.ts` `` — were checked by
 * nothing at all, in any of the four.
 *
 * **And that half has gone dead for real.** `src/course/curriculum.ts`'s docblock named
 * `tests/course/curriculum.test.ts` as the test that parses its grouping comments. No such file
 * ever existed; the real check was in `tests/course/lessons.test.ts`. It was found by a person
 * reading, recorded as defect 5 of §13 of the Wi-Fi document, and fixed on 2026-10-05 — and the
 * comment that pointed at the missing file had itself been written five days earlier *in order to*
 * make a grouping comment checkable. Nothing has watched for the next one since.
 *
 * **What this file does NOT assert, and why it is worth saying.** 「The path resolves on this
 * machine」 is not 「a reader can follow it」: three citations resolve here while living in
 * `.superpowers/sdd/`, a directory that is git-ignored in its entirety and that `git clean -fdx`
 * destroys. Each of the three was read on 2026-10-12 and none is load-bearing — the wording
 * contract cites a human-read audit and immediately states the re-computable proxies that DO have
 * assertions (31/53 and 9/14), the inert contract cites `LESSONS.md` to say that file holds only a
 * pointer back and deliberately no second copy of the body, and the UWB document cites the clause
 * list as the provenance of clause numbers, which is the one thing the standards rule lets this
 * repository carry anyway. Writing it down is the point: the next person who wants to make one of
 * them measurable must not do it by committing the file, and the next person who wants to lean an
 * argument on one must notice that a reader cannot open it.
 */
import { describe, it, expect } from 'vitest'
import { citedPathAt, filePathCitations, readDoc } from './coverage'

/** The four documents that argue by citation. */
const DOCS = [
  'docs/wifi-feature-coverage.md',
  'docs/uwb-feature-coverage.md',
  'docs/course-wording-contract.md',
  'docs/inert-config-contract.md',
] as const

/**
 * The citations that are allowed not to resolve, each with the reason — and the reason is an
 * ARGUMENT, never a date. A dated re-measurement is what let §17's bucket table rot for four days
 * (`tests/course/wifi-coverage.test.ts`, the bucket-margin describe); an entry here has to say why
 * the path will still be unresolvable next month.
 */
const ALLOWED: Record<string, string> = {
  // The IEEE corpus lives outside this repository (see the archive note in §1 of the Wi-Fi
  // document); only clause numbers, field names and figures come in. A path into it can never
  // resolve from a clone, and committing it is refused by the standards rule, not by taste.
  'toc/80211-2024.json': 'the corpus table of contents, outside the repository by design',
  // Quoted ON PURPOSE, as the historical error it is: §13 defect 5 reproduces the old docblock in
  // a blockquote and the prose two lines above it says 「`ls tests/course/ | grep curric` 零命中」
  // and names where the check really lives. Resolving this one would mean the defect record had
  // been quietly rewritten.
  'tests/course/curriculum.test.ts': 'quoted inside the §13 record of its own deadness',
}

/**
 * The floor. 144 occurrences / 92 distinct paths across the four documents on 2026-10-12, and the
 * allow-list holds two — so a rule that graded nothing would have to lose two orders of magnitude
 * to still look green. Three rules in this programme have reported success while grading nothing
 * (`readability.test.ts`'s structural floor among them), which is why this is here rather than
 * assumed.
 */
const MIN_CITATIONS = 60

describe('the contract documents cite file paths that resolve', () => {
  it.each(DOCS)('%s', (rel) => {
    const cited = filePathCitations(readDoc(rel))
    const dead = cited.filter((p) => citedPathAt(p) === null && ALLOWED[p] === undefined)
    expect(dead, `${rel} cites ${dead.length} path(s) that resolve nowhere — not at the repo root,`
      + ' not under src/, not under tests/. Either the file moved and the citation owes an update,'
      + ` or it never existed: ${dead.join(', ')}`).toEqual([])
  })

  it('grades enough citations that passing means something', () => {
    const all = DOCS.flatMap((rel) => filePathCitations(readDoc(rel)))
    expect(all.length, 'bare file-path citations found across the four documents. If this has'
      + ' collapsed, the reader stopped matching and every assertion above is grading air')
      .toBeGreaterThan(MIN_CITATIONS)
  })

  it('every allow-list entry is still needed, and still unresolvable', () => {
    // An allow-list that outlives its reason is a waiver with no successor — the worst shape this
    // programme has found. So each entry must STILL be cited and STILL fail to resolve: a path
    // that starts resolving, or stops being cited, has to leave this list in the same edit.
    const all = new Set(DOCS.flatMap((rel) => filePathCitations(readDoc(rel))))
    for (const [p, why] of Object.entries(ALLOWED)) {
      expect(all.has(p), `${p} is on the allow-list (「${why}」) but no document cites it any more`)
        .toBe(true)
      expect(citedPathAt(p), `${p} is on the allow-list (「${why}」) but now resolves — take it off,`
        + ' and if it resolves because somebody committed it, read that reason again first')
        .toBeNull()
    }
  })

  it('can fail: a path that resolves nowhere is reported', () => {
    // Planted, because a rule only ever run against documents that pass has not been shown able to
    // fail — and this one is new, so it has never seen a red day.
    const planted = '见 `src/course/no-such-file.ts` 与 `tests/course/kit.ts`。'
    const cited = filePathCitations(planted)
    expect(cited, 'both tokens are read as citations').toEqual([
      'src/course/no-such-file.ts', 'tests/course/kit.ts',
    ])
    expect(cited.filter((p) => citedPathAt(p) === null), 'and exactly the dead one is reported')
      .toEqual(['src/course/no-such-file.ts'])
    // the src/-relative convention resolves, so an honest citation is not a false positive
    expect(citedPathAt('course/readability.ts'), '`course/readability.ts` means src/course/...')
      .toBe('src/course/readability.ts')
  })
})
