/**
 * **The reader's stable handle on a lesson, and the half of it a unit test can see.**
 *
 * Why there is a handle at all. `CoursePanel` numbers lessons by position — the catalogue
 * row prints `lessonIndex(l.id) + 1` and the lesson header prints `idx + 1` — so inserting
 * one lesson renumbers every lesson after it. That is not a defect in the numbering: the
 * number IS the reading order, and freezing it would make it a lie. It is a defect in the
 * numbering being the reader's ONLY handle. Twice in two days a reader quoted a number
 * (「UWB 第 60 课」, then 「第 61 课」), was right both times, and was stale by one by the
 * time the question was answered, because a lesson had landed in front of theirs in
 * between. Those two lessons are `uwb-sstwr` and `uwb-dstwr`; they are 61 and 62 today,
 * which is one further along than when they were quoted.
 *
 * So the panel also prints the lesson's id, which an insertion cannot move. `@uwb-dstwr`
 * is already how this repository's own documents cite a lesson — hundreds of occurrences
 * under `docs/` — and until this slice it was the one thing about a lesson that could be
 * read in a document and not on the screen.
 *
 * **This file is the weaker half, and says so.** `vitest` runs `environment: 'node'`:
 * there is no layout here, so nothing in this file knows whether the handle is on the
 * screen, or how wide it is, or whether it is inside the course column at 470 CSS px.
 * The repository has walked into that mistake before — `tests/ui/appGrid.test.ts` opens by
 * saying a geometry defect cannot be caught by reading source, and jsdom reports every
 * `clientWidth` as 0. What this file CAN do is two things a browser is a clumsy instrument
 * for: pin the data property that makes the handle cheap and bounded, and pin that the
 * panel prints the id in the one place the siting argument assumed.
 *
 * The viewport half is `tests/e2e/narrow-width.spec.ts` ›
 * `course mode, the stable lesson handle, at its longest`, which measures the worst-case
 * id in a real browser at 470 and 939 CSS px.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LESSONS } from '../../src/course/lessons'
import { STRINGS } from '../../src/ui/i18n'

const src = readFileSync(new URL('../../src/course/CoursePanel.tsx', import.meta.url), 'utf8')

describe('the lesson handle is a cheap, bounded, ASCII string', () => {
  /**
   * The reason the handle costs the Chinese-character budgets nothing. Every ruler over
   * this course measures Han characters or reader-visible strings
   * (`all.length < 11500`, the per-lesson main-path band, the per-section means), and an
   * id made only of `a-z`, `0-9` and `-` moves none of them. It also cannot be the subject
   * of `tests/smoke.test.ts` › `source encoding`, which is about non-ASCII.
   */
  it('is ASCII throughout, so printing it costs the Han-character budgets nothing', () => {
    for (const l of LESSONS) {
      expect(l.id, `${l.id} is not a plain kebab-case ASCII id`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  /**
   * The width bound the browser half then measures. 22 characters today
   * (`uwb-sensing-resolution`), so `@` plus the id is 23 — and this is the number the
   * e2e test's worst case is chosen from. It is a ceiling and not an equality: a shorter
   * id is free. If a new lesson needs a longer one, this goes red with the length in the
   * message, and the right response is to look at the 470 px measurement again rather
   * than to raise the number on the way past.
   */
  it('is at most 22 characters, which is the width the browser half was measured at', () => {
    const longest = LESSONS.reduce((a, b) => (b.id.length > a.id.length ? b : a))
    expect(longest.id.length, `${longest.id} is the longest id`).toBeLessThanOrEqual(22)
  })

  /** A handle nobody can tell apart from another lesson's is not a handle. */
  it('is unique across the course, which is what makes it citable', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
  })
})

describe('the panel prints it beside the title and nowhere else', () => {
  /**
   * Source text, with the limit of source text stated: this sees that the expression is
   * written, never that it rendered. The two occurrences it counts are precise, though —
   * `lesson` is the single open lesson and `l` is the catalogue's loop variable, so the
   * difference between them is exactly the difference between the two sites.
   */
  it('renders the open lesson id once, with the @ the documents cite it by', () => {
    expect(src.split('@{lesson.id}').length - 1, 'one handle in the lesson header').toBe(1)
  })

  /**
   * The catalogue was considered and refused, so this pins the refusal rather than
   * leaving it in a comment. The row is the narrowest content in the panel and already
   * carries a completion mark, a number, a title and a minute count; an id there would
   * cost all 90 rows the width of the longest one to be useful on a single one, and the
   * reader quotes a lesson from inside it rather than from the list.
   */
  it('leaves the catalogue row alone, which is what the width argument assumed', () => {
    expect(src).not.toContain('@{l.id}')
  })

  /**
   * And the third site that was considered, refused on a property of the data rather than
   * on taste: 「再深一层」 is a `<details>` shut by default AND optional. If that count
   * ever reaches zero the refusal's first half has evaporated and this test is where to
   * find that out; the second half — that a shut `<details>` hides the handle on the other
   * 75 — does not depend on the count.
   */
  it('does not hang the handle off an optional section: 15 lessons have no `deeper`', () => {
    const without = LESSONS.filter((l) => (l.deeper ?? []).length === 0)
    expect(without.length, `lessons with no deeper section: ${without.map((l) => l.id).join(' ')}`)
      .toBeGreaterThan(0)
    for (const id of ['edca-tamper', 'amp-slots']) {
      expect(without.map((l) => l.id), `${id} is one of the heavily cited ones with no deeper`)
        .toContain(id)
    }
  })

  /**
   * The label has one job: tell the reader that THIS is the number to quote and the other
   * one is not. A label that does not name the id leaves two numbers on screen and no way
   * to tell which is which, which is the state this slice found.
   */
  it('introduces it with a label that names the id and says it does not move', () => {
    expect(STRINGS.course.lessonRef).toContain('id')
    expect(STRINGS.course.lessonRef).toContain('不随插课变动')
    expect(src).toContain('{L.lessonRef}')
  })
})
