/**
 * `docs/wifi-feature-coverage.md` answers one question — does the Wi-Fi course teach what this
 * engine actually does — by naming engine symbols in one column and lesson ids in another. Both
 * columns point at code, and both rot the same way: a rename, a split lesson, a deleted export.
 *
 * **Why this file exists at all, in the document's own words.** It shipped on 2026-10-05 saying
 * of itself: 「与 UWB 那张表不同的一件要紧事：这张表没有测试钉住它 … 一次改名就能让这里的符号
 * 变成假的，一次拆课就能让这里的课号变成假的，而没有任何东西会变红。」 It came with a
 * verification script, run that day with zero failures — and **a script is not a test**. A script
 * is checked when somebody remembers to run it; that is the same guarantee a comment has. This
 * file is that script, moved to where `npx vitest run` will find it.
 *
 * The citation grammar and the export resolver are shared with `tests/course/uwb-coverage.test.ts`
 * through `tests/course/coverage.ts` — the Wi-Fi document chose the UWB document's syntax
 * deliberately, saying so in its own 「怎么读这张表」 section, 「便于以后做同一个测试」.
 *
 * **What this file checks that the UWB one does not,** because the Wi-Fi table has a fourth-column
 * discipline the UWB table never had:
 *
 *  - an 未建模 row owes a verdict — 范围决定 or 未偿的债 — and
 *  - an 已建模 / 部分建模 row owes either a lesson id or the exact words 「引擎建了，无课」.
 *
 * That second clause is the whole reason the Wi-Fi table exists: the UWB table's fourth column has
 * no word for 「the engine models this and no lesson teaches it」, so such a cell could only be
 * written there as a plain 已建模 with a symbol in it. The discipline was a sentence in the UWB
 * document (its line 36) and **that document broke it once**, at §10.47, and nobody noticed for
 * weeks, because a sentence has no failure mode. Here it is a function with a planted-violation
 * test behind it.
 *
 * **Every number this file compares is read out of the document, not written here.** The document
 * states its own totals — 120 rows, 106 citations over 93 symbols, 54 lesson ids, and twelve
 * per-verdict counts — so the assertion is stated-against-measured, and adding a row means
 * updating the figure the document already shows a reader. That is the opposite of the defect this
 * slice was opened for: a hand-written number in a comment that goes stale before the thing it
 * describes. No figure in this file can go stale, because there is no figure in this file.
 *
 * **What it still cannot catch,** the same blind spot the UWB file writes down: a feature being
 * changed out from under a row. `ERP_2G` can stop carrying a 10 µs SIFS tomorrow, the export still
 * exists, this file still passes, and the cell that says 已建模 is now false.
 */
import { describe, expect, it } from 'vitest'
import { COURSE_ORDER } from '../../src/course/curriculum'
import {
  lessonCitations, readDoc, statedCounts, symbolCitationOccurrences, symbolCitations, tableRows,
  unresolved, type SymbolCitation,
} from './coverage'

const DOC = 'docs/wifi-feature-coverage.md'
const doc = readDoc(DOC)

const symbols = symbolCitations(doc)
const lessons = lessonCitations(doc)
const stated = statedCounts(doc)

/**
 * The two verdict columns are closed vocabularies, and the second column's values are merged by
 * prefix: three rows are genuinely mixed (「分格单位出自标准，每格的起伏标准不规定」) and the
 * document says in its totals section that it files them under the prefix with both halves spelled
 * out in the cell.
 */
const STANDARD = ['已发布 · 802.11-2024', '已发布 · be-2024', '已发布 · 其他修正案',
  '标准不规定', '标准里查不到']
const COVERAGE = ['已建模', '部分建模', '未建模']

/** `已发布 · 802.11-2024（§10.2 的 DS）` → `已发布 · 802.11-2024`; `已建模（而且是一处简化）` → `已建模`. */
const prefixOf = (cell: string): string => cell.split('（')[0].split(' +')[0].trim()

/**
 * The document's four-column data rows: [特性, 标准依据, 本仿真器, 位置与证据].
 *
 * Selected by the third column's vocabulary, which is what separates them from the four-column
 * tables of §14–§17 — those are summaries, and the document says so where it states its row total.
 * A row whose 本仿真器 cell says 「大部分建模」 therefore drops out of this list rather than
 * failing the vocabulary check directly; what catches it is the row total, which is exact.
 */
const rows = tableRows(doc).filter((cells) => COVERAGE.includes(prefixOf(cells[2])))

/**
 * The fourth column's two disciplines, as a function over rows rather than as a read-through.
 *
 * A function, because the point of this slice is that it can be aimed at a row that SHOULD fail.
 * A read-through is how the UWB document's §10.47 row got through with neither verdict on it.
 */
const disciplineViolations = (candidates: string[][]): string[] =>
  candidates.flatMap(([feature, , coverage, evidence]) => {
    if (prefixOf(coverage) === '未建模') {
      return evidence.includes('范围决定') || evidence.includes('未偿的债') ? []
        : [`${feature}: 未建模 but the evidence cell says neither 范围决定 nor 未偿的债`]
    }
    return evidence.includes('`@') || evidence.includes('引擎建了，无课') ? []
      : [`${feature}: ${prefixOf(coverage)} but the evidence cell names no @课号 and does not say`
        + ' 「引擎建了，无课」']
  })

describe(`${DOC} states its own size, and the size is right`, () => {
  it('still states the three figures this file checks against', () => {
    // The guard against a parser that silently matches nothing. If the document stops stating its
    // own size, every assertion below has nothing to compare to, and this file becomes decoration.
    expect(doc.match(/全表 \*\*(\d+) 行\*\*/), 'no stated row total').not.toBeNull()
    expect(doc.match(/全表 (\d+) 处 `#` 形引用（去重 (\d+) 个符号）与 (\d+) 个课号/),
      'no stated citation totals').not.toBeNull()
    expect(rows.length, 'the vocabulary filter matched almost nothing').toBeGreaterThan(80)
    expect(symbols.length, 'the citation parser matched almost nothing').toBeGreaterThan(50)
  })

  it('has the number of data rows it says it has', () => {
    const total = Number(doc.match(/全表 \*\*(\d+) 行\*\*/)![1])
    expect(rows.length, `the document says 全表 ${total} 行 and ${rows.length} rows parse;`
      + ' a row whose 本仿真器 cell left the vocabulary does not parse at all')
      .toBe(total)
  })

  it('makes the number of citations it says it makes', () => {
    const [, occ, distinct, ids] =
      doc.match(/全表 (\d+) 处 `#` 形引用（去重 (\d+) 个符号）与 (\d+) 个课号/)!
    expect(symbolCitationOccurrences(doc), '# citations, counting repeats').toBe(Number(occ))
    expect(symbols.length, 'distinct `path.ts#symbol` citations').toBe(Number(distinct))
    expect(lessons.length, 'distinct `@lesson-id` citations').toBe(Number(ids))
  })

  it.each([...STANDARD, ...COVERAGE])('the stated count for %s matches the rows', (label) => {
    const column = STANDARD.includes(label) ? 1 : 2
    const actual = rows.filter((r) => prefixOf(r[column]) === label).length
    expect(stated.get(label), `${label}: no count row in the totals table`).toBe(actual)
  })

  /**
   * The fourth column's own totals table. Two of these four deliberately over-count the rows and
   * the document explains both: a 未建模 row may still carry a lesson id (a lesson that teaches
   * this thing does NOT exist — `@frame-anatomy` on fragmentation), and the beacon row carries two
   * verdicts at once rather than being flattened to one.
   */
  it.each([['带 `@课号`', '`@'], ['整行写着「引擎建了，无课」', '引擎建了，无课'],
    ['范围决定', '范围决定'], ['未偿的债', '未偿的债']] as const)(
    'the stated count for %s matches the rows', (label, needle) => {
      const actual = rows.filter((r) => r[3].includes(needle)).length
      expect(stated.get(label), `${label}: no count row in the totals table`).toBe(actual)
    })
})

describe(`${DOC} points at things that exist`, () => {
  it.each(symbols)('$token names a real export', (citation) => {
    expect(unresolved(citation)).toBeNull()
  })

  it.each(lessons)('@%s is a lesson id in COURSE_ORDER', (id) => {
    expect(COURSE_ORDER).toContain(id)
  })
})

describe(`${DOC} keeps its fourth-column disciplines`, () => {
  it.each(rows)('%s: has a verdict, or a lesson, or says 「引擎建了，无课」', (...cells) => {
    expect(disciplineViolations([cells as string[]])).toEqual([])
  })

  it('has no violation anywhere in the document', () => {
    // The same thing again over the whole table, so the failure lists every offending row at once
    // rather than one per `it.each` case. This is the assertion the document's own script printed
    // as `!!` lines, and it is the one the UWB document had only as a sentence.
    expect(disciplineViolations(rows)).toEqual([])
  })
})

/**
 * **A check that has only ever been run against a document that passes has not been shown to be
 * able to fail.** Same shape as the planted-scenario census at the end of
 * `tests/model/driver-scenario.test.ts`: take the real inputs, break one thing, and assert the
 * thing that is supposed to notice notices.
 *
 * Three plants, one per lie this file is here to catch: a renamed export, a row that owes a verdict
 * and does not give one, and a row that owes a lesson id and does not give one.
 */
describe(`${DOC}'s checks can fail`, () => {
  it('a renamed export is caught, and says which of the two lies it is', () => {
    const renamed: SymbolCitation = { file: 'engine/phy.ts', symbol: 'ERP_2G_RENAMED',
      token: '`engine/phy.ts#ERP_2G_RENAMED`' }
    expect(unresolved(renamed)).toContain('not exported from src/engine/phy.ts')
    // and the real one it was built from still resolves, so this plant is a rename and not a typo
    expect(unresolved({ ...renamed, symbol: 'ERP_2G', token: '`engine/phy.ts#ERP_2G`' })).toBeNull()

    const moved: SymbolCitation = { file: 'engine/phy-moved.ts', symbol: 'ERP_2G',
      token: '`engine/phy-moved.ts#ERP_2G`' }
    expect(unresolved(moved)).toContain('does not exist')
  })

  it('an 未建模 row with no verdict is caught', () => {
    const planted = ['分片与重组', '已发布 · 802.11-2024', '未建模',
      '一个 MSDU 永远是一个 MPDU。']
    expect(disciplineViolations([planted])).toEqual([
      '分片与重组: 未建模 but the evidence cell says neither 范围决定 nor 未偿的债',
    ])
    // and the real row, which does carry one, does not trip it
    expect(disciplineViolations([[...planted.slice(0, 3), '**范围决定。** 一个 MSDU 永远是一个 MPDU。']]))
      .toEqual([])
  })

  it('an 已建模 row with neither a lesson nor 「引擎建了，无课」 is caught', () => {
    const planted = ['3 条空间流', '已发布 · 802.11-2024', '已建模', '`model/caps.ts#Nss`']
    expect(disciplineViolations([planted])).toHaveLength(1)
    expect(disciplineViolations([planted])[0]).toContain('names no @课号')
    for (const fixed of ['`model/caps.ts#Nss`。`@streams`', '`model/caps.ts#Nss`，引擎建了，无课'])
      expect(disciplineViolations([[...planted.slice(0, 3), fixed]])).toEqual([])
  })

  it('a row whose 本仿真器 cell leaves the vocabulary stops being a row at all', () => {
    // which is why the row total above is an equality: this is the drift it exists to catch, and
    // the vocabulary check alone cannot see it.
    const planted = tableRows('| 分片与重组 | 已发布 · 802.11-2024 | 大部分建模 | **范围决定。** |')
    expect(planted).toHaveLength(1)
    expect(planted.filter((cells) => COVERAGE.includes(prefixOf(cells[2])))).toEqual([])
  })
})
