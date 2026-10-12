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
 * **「Resolves on this machine」 was the wrong question, and CI said so for seven hours.** The
 * first version of this file asked the filesystem, noted in this very docblock that three
 * citations 「resolve here while living in `.superpowers/sdd/`」 — and asserted that they resolve.
 * They do not resolve in a checkout: that directory holds a `.gitignore` whose only line is `*`,
 * so `npm test` went red in CI on the push that added this file (`c9c5a37`, 2026-10-11 17:17Z)
 * and stayed red through three more pushes, taking the Pages deploy down with it, while every
 * local run was green. The reasoning about those three paths was right and the assertion did not
 * follow it.
 *
 * So resolution is now against `git ls-files` ({@link trackedFiles}), and the three paths are on
 * the allow-list with that argument. `docs/` is the one part of this repository written for
 * somebody who cloned it; an instrument that answers differently on two machines cannot grade it.
 *
 * **What this still does not assert**: that the file says what the citation claims it says, and
 * that a path tracked today is tracked when the reader arrives. The `#symbol` half is unaffected
 * — {@link unresolved} resolves under `src/`, where nothing is ignored.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT, citedPathAt, filePathCitations, readDoc, trackedFiles } from './coverage'

/**
 * The documents that argue by citation. `docs/course-figure-pinning.md` joined them on
 * 2026-10-12: it is the ledger of which printed figures the suite would notice an edit to, and
 * it argues by naming the instrument and the ratchet, so its paths are graded like any other's.
 */
const DOCS = [
  'docs/wifi-feature-coverage.md',
  'docs/uwb-feature-coverage.md',
  'docs/course-wording-contract.md',
  'docs/inert-config-contract.md',
  'docs/course-figure-pinning.md',
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
  // The three working notes under `.superpowers/sdd/`. That directory holds a `.gitignore` whose
  // only line is `*` — the subagent-driven-development skill writes it, so everything a plan's
  // run leaves behind is ignored by construction and no clone has any of it. Each was read on
  // 2026-10-12 and none is load-bearing: the wording contract cites the human-read audit and
  // then states the re-computable proxies that DO have assertions (31/53 and 9/14), the inert
  // contract cites `LESSONS.md` to say that file holds a pointer back and deliberately no second
  // copy of the body, and the UWB document cites the clause list as the provenance of clause
  // numbers, which is the one thing the standards rule lets this repository carry anyway.
  '.superpowers/sdd/learner-audit-report.md': 'a run’s working note under a directory that'
    + ' ignores itself (`*`), so it is in no clone; the contract states its measurable proxies',
  '.superpowers/sdd/LESSONS.md': 'the same, and cited precisely to say the body is NOT copied there',
  '.superpowers/sdd/uwb-clause-list.txt': 'the same; it is the provenance of clause numbers, which'
    + ' is all the standards rule lets this repository carry',
}

/**
 * The floor. 144 occurrences / 92 distinct paths across the four documents on 2026-10-12, and the
 * allow-list holds five — so a rule that graded nothing would have to lose two orders of magnitude
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
    expect(all.length, 'bare file-path citations found across these documents. If this has'
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

  it('resolution is the repository, not this machine: a file on disk only is still dead', () => {
    // The instrument itself. A floor first, because a `git ls-files` that came back empty would
    // make all 92 citations dead at once — loud, but the message would be about the documents
    // rather than about the ruler, and that misdirection is what cost seven hours of red CI.
    const tracked = trackedFiles()
    expect(tracked.size, 'files `git ls-files` reports for this repository').toBeGreaterThan(200)
    expect(tracked.has('tests/course/doc-citations.test.ts'), 'this very file is one of them')
      .toBe(true)
    // And the discriminating case, which no conditional guards: a path that is certainly on disk
    // whenever this suite runs and is in no checkout of this repository. Under the old instrument
    // it resolved; under this one it must not, which is the whole of the fix.
    const onDiskNeverCloned = 'node_modules/vitest/package.json'
    expect(existsSync(resolve(ROOT, onDiskNeverCloned)), 'the probe path is on disk here').toBe(true)
    expect(citedPathAt(onDiskNeverCloned), 'and a citation of it would still be reported dead,'
      + ' because `.gitignore` keeps it out of every clone').toBeNull()
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
