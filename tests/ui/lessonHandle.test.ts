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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
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

/**
 * **The other half of the handle: the repository's own reader-visible text must not quote a
 * number either.**
 *
 * Everything above gives the READER a citation an insertion cannot move. It does nothing about
 * the other direction — a lesson number that this repository writes down itself, on a screen.
 * Those expire by exactly the mechanism the file header describes: the number IS `idx + 1`, a
 * position in `LESSONS`, so every lesson inserted above a quoted one makes the quote off by
 * one, silently, with nothing in the suite that notices.
 *
 * This slice found one, and it had been wrong by 21 lessons. `src/editor/EditorGuide.tsx`, the
 * TXOP protection section, said 「第 10 课对比了三者」 — written in `22db72d` (2026-09-08), whose
 * own subject line says `lesson 10`, and on that day TXOP protection WAS lesson 10. Today lesson
 * 10 is `@small-frames`; TXOP protection is 31 (`@txop-protect`) and 32 (`@protect-policies`). A
 * reader who followed that sentence landed on short frames. `grep -rn "第 10 课" tests/` was
 * empty, so nothing was ever going to find out.
 *
 * **Why this belongs in the suite rather than in review** — the 2026-09-25 ruling deletes any
 * assertion whose failure message is about how a sentence is written. This one's is not. What it
 * reports is that a reference's target is COMPUTED and nothing holds it still, so a literal copy
 * of it is a fact with an expiry date. The remedy is never to reword the sentence: it is to cite
 * the handle, which is the thing this whole file exists to make possible. Same column as
 * `statedFigures` — a number written down beside a number that is measured.
 *
 * **The instrument is a parser, not a grep, and that is load-bearing.** `CoursePanel.tsx` holds
 * two 「第 60 课」/「第 61 课」 of its own and they are CORRECT: they are inside the JSX comment
 * recording the incident that bought the handle, a historical quote that is supposed to stay
 * frozen. A regex over source text cannot tell those from the defect; a regex that strips
 * comments first can be fooled by a `//` inside a string literal and would then hide a real
 * violation instead of reporting it. So this walks the TypeScript AST and reads only nodes that
 * can reach a reader — string literals, template literals and JSX text. Comments are trivia and
 * never nodes, so they are out by construction rather than by a pattern. Lesson prose is string
 * literals under `src/course`, so one walk covers all 90 lessons as well as the UI chrome.
 */
describe('nothing a reader can see writes a lesson number down', () => {
  const HARDCODED = /第\s*\d+\s*课/

  /** Every node whose text can be rendered. Comments are not nodes, which is the point. */
  function readerVisibleStrings(file: string, text: string): { line: number; text: string }[] {
    const sf = ts.createSourceFile(
      file, text, ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const out: { line: number; text: string }[] = []
    const visit = (n: ts.Node) => {
      const s = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
        || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)
        || ts.isJsxText(n)
        ? n.text
        : undefined
      if (s !== undefined && s.length > 0) {
        out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: s })
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    return out
  }

  function sources(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) sources(p, out)
      else if (/\.tsx?$/.test(p)) out.push(p)
    }
    return out
  }

  const SRC = fileURLToPath(new URL('../../src', import.meta.url))

  it('holds across every source file under src/, with no exemption list', () => {
    const files = sources(SRC)
    const offenders: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      if (!text.includes('第')) continue
      for (const s of readerVisibleStrings(f, text)) {
        const m = s.text.match(HARDCODED)
        if (!m) continue
        const at = s.text.indexOf(m[0])
        offenders.push(`${relative(SRC, f).split(sep).join('/')}:${s.line}  ${m[0]}  `
          + `…${s.text.slice(Math.max(0, at - 20), at + 16).replace(/\s+/g, ' ')}…`)
      }
    }
    // A walk that reads nothing passes vacuously, so the breadth is pinned too. 198 files today.
    expect(files.length, 'the walk found source files to read').toBeGreaterThan(150)
    expect(offenders, 'A lesson number is `idx + 1` — a position in `LESSONS`, held still by'
      + ' nothing. Inserting one lesson above the quoted one makes the quote off by one, and'
      + ' that is how `EditorGuide.tsx` came to be off by 21. Do not reword and do not put a'
      + ' fresh number in: cite the lesson by its title or its `@id`, which is the handle this'
      + ' file\'s other tests exist to guarantee. Offending reader-visible strings:')
      .toEqual([])
  })

  /**
   * The ruler, measured. Two halves, because each one failing silently would leave the test
   * above green and empty: it must fire on JSX text and on a string literal, and it must NOT
   * fire on the `CoursePanel` comment shape — which is the exact text the comment there holds.
   */
  it('fires on reader-visible text and not on a comment, measured on both', () => {
    const found = (src: string) => readerVisibleStrings('probe.tsx', src)
      .filter((s) => HARDCODED.test(s.text)).length
    expect(found('const x = <div>第 10 课对比了三者。</div>'), 'JSX text').toBe(1)
    expect(found("const x = { text: '第 10 课对比了三者。' }"), 'string literal').toBe(1)
    expect(found('const x = `第 10 课${y}与第 11 课`'), 'both halves of a template').toBe(2)
    expect(found('/* a reader quoted «UWB 第 60 课», then «第 61 课» */ const x = 1'), 'block comment')
      .toBe(0)
    expect(found('// 第 10 课\nconst x = 1'), 'line comment').toBe(0)
    expect(found("const url = 'https://example.com/x' // 第 10 课"),
      'a `//` inside a string does not blind the walk the way a comment-stripping regex would')
      .toBe(0)
  })
})
