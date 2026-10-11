/**
 * **The ledger of §10, kept from going stale. Not the rule §10 refuses to build.**
 *
 * `ZH_TERMS_EXCLUDED` (src/course/readability.ts) holds 25 words the course writes in Chinese
 * that are not IEEE terms, and its effect is to switch the term rule — every official term
 * carries its English name at its first Chinese use — off for them. That table is right, and the
 * argument is its own file header's: demanding `余量（margin）` produces noise, and noise trains
 * authors to ignore the rule. What nothing took over is the other half: whether a word so
 * exempted was ever EXPLAINED where the reader meets it. The rule that was going to take it over
 * (`QUANTITIES`, `c395e14`, 2026-09-23) was deleted two days later with the whole body of prose
 * rules (`41ef7e0`, 2026-09-25) — correctly, because its failure message was about how to write a
 * sentence. The debt it left is written down in `docs/course-wording-contract.md` §10, and this
 * file is what keeps that section's figures equal to the corpus.
 *
 * **Why this is in the Keep column of the 2026-09-25 ruling** ("delete any assertion whose
 * failure message is about how a sentence is written rather than about what the simulator does"):
 *
 *  - every failure here says a NUMBER or a LIST in a document no longer matches the measurement,
 *    and the remedy is always to re-measure and edit §10 — never to edit a lesson. It takes no
 *    side on which direction the debt moves: more debt and less debt are both legal, as long as
 *    the ledger follows.
 *  - the shape already exists in this repository, added after that ruling: `tests/smoke.test.ts`
 *    › `the cost ceiling's written measurement`, and `tests/course/limits.test.ts` reading
 *    `docs/uwb-modellable-backlog.md`. It is the `statedFigures` / `statedCounts` ruler.
 *  - a stated figure with no check is the very accident §10 is about. A section whose whole
 *    subject is "a rule was deleted and nobody took the requirement over" cannot be allowed to
 *    carry a 53 that nobody reads back.
 *
 * **Anti-vacuity, and it is the document that provides it.** If the criterion below stopped
 * matching — a regex that lost its word, a loop body that never ran — it would return the empty
 * set, and §10.4's 53 non-empty rows turn this red instead of green. The two halves indict each
 * other exactly as `docs/course-wording-contract.md` §9 and `tests/smoke.test.ts` do.
 *
 * **The criterion is §10.5's, verbatim in effect**, and three of its details are measured
 * decisions rather than taste (the section says so, with what each one cost):
 *  - ACROSS lessons a definition must be FORM-EXACT: a closure lesson that defines only the
 *    longer compound 速率余量 has not defined the bare 余量 — it has defined another quantity
 *    with another number (3 dB against 3.62 dB), which is the drift the reader hit;
 *  - WITHIN a lesson a bare use after the lesson's own longer compound is anaphora, and exempt;
 *  - `terms` is a lookup table, so a gloss there counts wherever the bare use is.
 *
 * It walks the main path only (`deeper`, `sources` and `limits` are not the reader's way through
 * a lesson), and it is the ledger's whole scope: a word in NEITHER table — bare 门限 — is
 * invisible to it, which is why §10.5 ends by measuring that case too.
 */
import { describe, it, expect } from 'vitest'
import { needsClosure } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { ZH_TERMS, ZH_TERMS_EXCLUDED, lessonTexts, type LessonText } from '../../src/course/readability'
import type { Lesson } from '../../src/course/lessonKit'
import { orderedLessons } from './corpus'
import { dataRows, readDoc, statedFigures } from './coverage'

const DOC = 'docs/course-wording-contract.md'
const SECTION = '## 10. 25 个豁免词关掉的那条要求，没有谁接手'
const byId = new Map(LESSONS.map((l) => [l.id, l]))
const ordered = orderedLessons()
const words = ZH_TERMS_EXCLUDED.map((x) => x.zh)

/** The sections a reader walks on the way through a lesson. */
const MAIN = new Set(['why', 'outcomes', 'terms', 'body', 'picture', 'numbers', 'observe', 'tryThis', 'quiz'])
const main = (l: Lesson): readonly LessonText[] => lessonTexts(l).filter((t) => MAIN.has(t.section))

/** Every excluded word strictly containing this one: 余量 inside 速率余量, 捕获 inside 捕获效应. */
const longer = (w: string): string[] => words.filter((v) => v !== w && v.includes(w))
/** The same text with those compounds blanked, so a bare use is a use of THIS word. */
const mask = (s: string, w: string): string => {
  let out = s
  for (const v of longer(w)) out = out.split(v).join('·')
  return out
}

/** The naming frames a Chinese sentence explains a word with. */
const frames = (w: string): RegExp[] => [
  new RegExp(`(这|那)?就是(它的)?${w}`), new RegExp(`叫(作|做)?${w}`),
  new RegExp(`（${w}）`), new RegExp(`${w}）`), new RegExp(`${w}（[A-Za-z]`),
  new RegExp(`${w}[：:]`), new RegExp(`——${w}——`), new RegExp(`所谓${w}`),
  new RegExp(`${w}(指的|说的)是`),
]

/** Where the lesson first explains `w` in its own reading order, or -1. `terms` counts as 0. */
function definedAt(l: Lesson, w: string): number {
  const fs = frames(w)
  const ts = main(l)
  for (let i = 0; i < ts.length; i++) {
    if (fs.some((r) => r.test(mask(ts[i].text, w)))) return ts[i].section === 'terms' ? 0 : i
    if (longer(w).some((v) => ts[i].text.includes(v))) return i
  }
  return -1
}

/** Where the lesson first uses `w` bare, or -1. */
function usedAt(l: Lesson, w: string): number {
  const ts = main(l)
  for (let i = 0; i < ts.length; i++) if (mask(ts[i].text, w).includes(w)) return i
  return -1
}

type Pair = { id: string; word: string; section: string; path: string; later: string; front: boolean }

/** The ledger, measured. One entry per (lesson, word) the criterion of §10.5 finds. */
function debt(): Pair[] {
  const out: Pair[] = []
  for (const l of ordered) {
    const closure = needsClosure(l.id, ordered)
    const ts = main(l)
    for (const word of words) {
      const u = usedAt(l, word)
      if (u < 0) continue
      const d = definedAt(l, word)
      if (d >= 0 && d <= u) continue
      const explains = (c: Lesson): boolean => main(c).some((t) => frames(word).some((r) => r.test(mask(t.text, word))))
      if ([...closure].some((id) => { const c = byId.get(id); return c !== undefined && explains(c) })) continue
      const path = ts[u].path
      const section = ts[u].section
      out.push({
        id: l.id, word, section, path,
        later: d < 0 ? '从未' : ts[d].section,
        front: section === 'why' || section === 'outcomes' || /^picture\[[01]\]/.test(path),
      })
    }
  }
  return out
}

/** The glossary rows that write this very word, one entry per lesson, in the reader's order. */
const glossRows = (w: string): { id: string; term: string }[] => {
  const out: { id: string; term: string }[] = []
  for (const l of ordered) {
    const hit = (l.terms ?? []).find((t) => mask(t.term, w).includes(w) || mask(t.plain, w).includes(w))
    if (hit) out.push({ id: l.id, term: hit.term })
  }
  return out
}

/** The five classes of the exclusion table, in the words §10.2 writes them in. */
const CLASS: [string, string][] = [
  ['model choice', '模型取值'], ['literature', '文献'], ['statistics', '统计'],
  ['engineering', '工程'], ['regulatory', '法规'],
]
const classOf = (why: string): string => {
  const hit = CLASS.find(([en]) => why.includes(en))
  expect(hit, `a row of ZH_TERMS_EXCLUDED has left the five classes: ${why}`).toBeDefined()
  return hit![1]
}

const WORD_HEAD = ['词', '类', '为什么不是术语', '主路径债', '前段', '写这个词的 `terms` 行'] as const
const LEDGER_HEAD = ['课', '词', '首次裸用', '本课稍后'] as const
const FIGURE_HEAD = ['量', '实测', '怎么量'] as const
const bare = (cell: string): string => cell.replaceAll('`', '').replace(/^@/, '').trim()

describe('the glossing debt §10 of the wording contract writes down', () => {
  const doc = readDoc(DOC)
  const pairs = debt()

  it('§10 of the wording contract and this file point at each other', () => {
    expect(doc, `${DOC} has lost its §10 heading`).toContain(SECTION)
    expect(doc, '§10 must name the file that keeps its figures honest')
      .toContain('tests/course/glossing-debt.test.ts')
    const self = readDoc('tests/course/glossing-debt.test.ts')
    expect(self, 'this file must name the section that holds the ledger it checks')
      .toContain('docs/course-wording-contract.md` §10')
    // the corpus this run measured, so none of the comparisons below is over an empty course
    expect(ordered.length, 'the lesson corpus').toBeGreaterThan(80)
  })

  it("§10.2 lists exactly the 25 words ZH_TERMS_EXCLUDED holds, with each word's own debt", () => {
    const rows = dataRows(doc, WORD_HEAD)
    expect(rows.length, `§10.2's table must hold one row per word of ZH_TERMS_EXCLUDED`)
      .toBe(ZH_TERMS_EXCLUDED.length)
    // the order too: the table is read beside the source, and a reordered table is a table whose
    // reasons have silently swapped rows.
    expect(rows.map((r) => r[0]), '§10.2 against ZH_TERMS_EXCLUDED, in order')
      .toEqual(words)
    for (const [i, row] of rows.entries()) {
      const w = words[i]
      expect(row[1], `§10.2: the class of ${w}`).toBe(classOf(ZH_TERMS_EXCLUDED[i].why))
      expect(Number(row[3]), `§10.2: the main-path debt of ${w}; re-run and update the table`)
        .toBe(pairs.filter((p) => p.word === w).length)
      expect(Number(row[4]), `§10.2: the front-section debt of ${w}; re-run and update the table`)
        .toBe(pairs.filter((p) => p.word === w && p.front).length)
      // The glossary citations, both ways: every lesson that writes the word is cited, and every
      // citation resolves to a `terms` row of that lesson which really does write it.
      const cited = [...row[5].matchAll(/`@([a-z0-9-]+)` · `([^`]+)`/g)].map((m) => ({ id: m[1], term: m[2] }))
      const measured = glossRows(w)
      if (measured.length === 0) {
        expect(row[5], `§10.2: no lesson writes ${w} in its \`terms\`, so the cell is 「—」`).toBe('—')
      } else {
        expect(cited.map((c) => c.id), `§10.2: the lessons whose \`terms\` write ${w}`)
          .toEqual(measured.map((m) => m.id))
        for (const c of cited) {
          const rows2 = byId.get(c.id)?.terms ?? []
          const hit = rows2.find((t) => t.term === c.term)
          expect(hit, `§10.2: ${c.id} has no \`terms\` row called \`${c.term}\``).toBeDefined()
          expect(
            mask(hit!.term, w).includes(w) || mask(hit!.plain, w).includes(w),
            `§10.2: ${c.id}'s \`${c.term}\` row does not write ${w}`,
          ).toBe(true)
        }
      }
    }
  })

  it('§10.4 lists exactly the (lesson, word) pairs the criterion finds today', () => {
    const rows = dataRows(doc, LEDGER_HEAD)
    const written = rows.map((r) => `${bare(r[0])}\t${r[1]}\t${bare(r[2])}\t${r[3]}`)
    const measured = pairs.map((p) => `${p.id}\t${p.word}\t${p.path}\t${p.later}`)
    // Not a count: a swap of one pair for another leaves the count alone, and the pair is what a
    // reader looking for the 54th defect reads. The fix for a failure here is §10.4, never a lesson.
    expect(written, `§10.4's ledger against the criterion of §10.5 — re-measure and update §10.4`)
      .toEqual(measured)
    expect(measured.length, 'the ledger measured nothing, so nothing above was compared')
      .toBeGreaterThan(0)
  })

  it('§10.7 states the figures the criterion measures', () => {
    const figures = statedFigures(doc, FIGURE_HEAD)
    const front = pairs.filter((p) => p.front)
    const noisy = pairs.filter((p) => p.word === '尝试' || p.word === '上限')
    // Bare 门限: the word the 2026-09-23 amendment named that is in NEITHER table, so the ledger
    // above cannot see it. Measured here because §10.5 states the figure.
    const compounds = ZH_TERMS.map((t) => t.zh).filter((z): z is string => Boolean(z)).filter((z) => z !== '门限' && z.includes('门限'))
    const menxian = ordered.filter((l) => main(l).some((t) => {
      let s = t.text
      for (const v of compounds) s = s.split(v).join('·')
      return s.includes('门限')
    }))
    const expected: [string, number][] = [
      ['豁免词', ZH_TERMS_EXCLUDED.length],
      ['主路径存量债（课，词）', pairs.length],
      ['其中落在前段', front.length],
      ['债涉及的课', new Set(pairs.map((p) => p.id)).size],
      ['债涉及的词', new Set(pairs.map((p) => p.word)).size],
      ['落在 `尝试` 与 `上限` 两个词上的债', noisy.length],
      ['这两个词的债里落在前段的', noisy.filter((p) => p.front).length],
      ['主路径裸用 `门限` 的课（两张表都不在）', menxian.length],
    ]
    for (const [label, value] of expected) {
      expect(figures.get(label), `§10.7 states no figure for 「${label}」`).toBeDefined()
      expect(figures.get(label), `§10.7: 「${label}」 — re-measure and update the figure`).toBe(value)
    }
    expect(figures.size, '§10.7 states a figure this test does not read').toBe(expected.length)
    expect(compounds, 'the ZH_TERMS rows that contain 门限').toEqual(['RTS 门限', '能量检测门限'])
  })
})
