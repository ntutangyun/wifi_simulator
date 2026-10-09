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
 * states its own totals — a row total, a citation total over a distinct-symbol total, a lesson-id
 * total, and twelve per-verdict counts — so every assertion is stated-against-measured, and adding
 * a row means updating the figure the document already shows a reader. That is the opposite of the
 * defect this slice was opened for: a hand-written number in a comment that goes stale before the
 * thing it describes. No figure in this file can go stale, because there is no figure in this file.
 *
 * It said that about itself on 2026-10-05 **while naming four of those totals right here, in this
 * paragraph** — and by 2026-10-08 all four were wrong. They are gone now rather than corrected,
 * because a corrected one would only be waiting to rot again.
 *
 * **What it still cannot catch,** the same blind spot the UWB file writes down: a feature being
 * changed out from under a row. `ERP_2G` can stop carrying a 10 µs SIFS tomorrow, the export still
 * exists, this file still passes, and the cell that says 已建模 is now false.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COURSE_ORDER, MODULES, lessonMinutes } from '../../src/course/curriculum'
import { LESSONS } from '../../src/course/lessons'
import { mainPathChars } from '../../src/course/readability'
import { HOUSEHOLDS } from '../../src/model/households'
import {
  ROOT, dataRows, lessonCitations, readDoc, statedCounts, statedFigures,
  symbolCitationOccurrences, symbolCitations, tableHeads, tableRows, unresolved, zhNumeral,
  type SymbolCitation,
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

/** The header every data table of this document carries, and nothing else in it does. */
const HEAD = ['特性', '标准依据', '本仿真器', '位置与证据']

/**
 * The document's data rows: [特性, 标准依据, 本仿真器, 位置与证据].
 *
 * **Selected by the table's header**, which is a structural fact about the document, and which is
 * the rule the document states about itself where it gives its row total (「第一到第十二节的四列
 * 数据行；第十四到十七节的表是汇总，不计入」). Until 2026-10-08 the selection was 「four cells」
 * plus 「the third cell is in the 本仿真器 vocabulary」 — two coincidences in series, wrong in both
 * directions, and `dataRows`' docblock in `coverage.ts` records what each of them let through.
 *
 * The vocabulary is therefore no longer a filter. It is asserted over every row below, so a
 * mistyped verdict is now a named failure instead of a row that quietly stops existing.
 */
const rows = dataRows(doc, HEAD)

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
    expect(rows.length, 'the header selector matched almost nothing').toBeGreaterThan(80)
    expect(symbols.length, 'the citation parser matched almost nothing').toBeGreaterThan(50)
  })

  it('has the number of data rows it says it has', () => {
    const total = Number(doc.match(/全表 \*\*(\d+) 行\*\*/)![1])
    expect(rows.length, `the document says 全表 ${total} 行 and ${rows.length} rows parse;`
      + ' a row is a row because its table carries the data header, so a count that moved means a'
      + ' row was added or removed — not that a verdict was mistyped, which is its own failure now')
      .toBe(total)
  })

  it('gives every data row four cells and both verdicts from the closed vocabularies', () => {
    // This is what the header selector buys. While the vocabulary WAS the selector this check
    // could not exist: a row with a mistyped 本仿真器 cell was not a row, so there was nothing to
    // assert about it, and the only trace it left was the row total being one short.
    const bad = rows.flatMap((cells) => {
      if (cells.length !== HEAD.length) return [`${cells[0]}: ${cells.length} cells, not 4`]
      const out: string[] = []
      if (!STANDARD.includes(prefixOf(cells[1]))) out.push(`${cells[0]}: 标准依据 = 「${cells[1]}」`)
      if (!COVERAGE.includes(prefixOf(cells[2]))) out.push(`${cells[0]}: 本仿真器 = 「${cells[2]}」`)
      return out
    })
    expect(bad, `${bad.length} data rows carry a cell that belongs to no column:\n${bad.join('\n')}`)
      .toEqual([])
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

  /**
   * **This test said the opposite until 2026-10-08, and the opposite was the defect.** It read
   * 「a row whose 本仿真器 cell leaves the vocabulary stops being a row at all」 and asserted that
   * such a row vanished, leaving only the stated row total to notice — a total the same edit would
   * naturally update. A row that is not checked printed exactly like a row that passed.
   *
   * Now the table's header decides what a row is, so a mistyped verdict stays a row and the
   * vocabulary assertion names it. Both halves are planted here, in a document rather than as a
   * bare line, because 「it is in a data table」 is the thing being tested.
   */
  it('a row whose 本仿真器 cell leaves the vocabulary is still a row, and is named', () => {
    const table = (sim: string): string => ['## 一、种的一节',
      `| ${HEAD.join(' | ')} |`, '| --- | --- | --- | --- |',
      `| 分片与重组 | 已发布 · 802.11-2024 | ${sim} | **范围决定。** |`].join('\n')

    const planted = dataRows(table('大部分建模'), HEAD)
    expect(planted, 'the row is a row, which is what changed').toHaveLength(1)
    expect(COVERAGE, '…and its verdict is not in the vocabulary').not.toContain(prefixOf(planted[0][2]))
    // and the real row, whose verdict IS in the vocabulary, is not named by the same walk
    expect(dataRows(table('未建模'), HEAD)
      .filter((cells) => !COVERAGE.includes(prefixOf(cells[2])))).toEqual([])
  })

  /**
   * The other half of the header selector, and the one the old pair of filters could not do: a
   * four-column SUMMARY table is kept out by structure rather than by luck.
   *
   * Measured, not argued: this document has 23 four-column rows that are not data — §14's
   * 「引擎建了，无课」 summary and §17's three tables about the character budget — and every one of
   * them was outside the data rows only because none of their third cells happened to spell a
   * verdict. The row planted here is one that does spell one. Under the old selector it would have
   * walked into the row total, the twelve per-verdict counts and both fourth-column disciplines.
   */
  it('a four-column summary table does not become data by saying 已建模', () => {
    const doc2 = ['## 十四、汇总',
      '| # | 它是什么 | 引擎 | 这张表的哪一节 |', '| --- | --- | --- | --- |',
      '| 1 | 种的汇总行 | 已建模 | 七 |'].join('\n')
    // the old selector: four cells, third cell in the vocabulary — and in it goes
    expect(tableRows(doc2).filter((cells) => COVERAGE.includes(prefixOf(cells[2]))))
      .toHaveLength(1)
    // the header selector: this table is not the data table, so it has no data rows
    expect(dataRows(doc2, HEAD)).toEqual([])
    // and the real document's own summary tables are out for that reason, not by vocabulary
    expect(rows.filter((r) => r[0] === '#' || /^\d+$/.test(r[0]))).toEqual([])
  })

  /**
   * The hole the splitter itself was. An evidence cell may hold a `grep` command, a `grep`
   * alternation is a pipe, and inside a Markdown cell that pipe is written `\|`. Splitting on bare
   * pipes gave such a row five cells, the four-column filter then dropped it, and **a row that was
   * never checked printed exactly like a row that passed** — out of the row total and out of both
   * disciplines above. Three rows of this document sat in that hole until 2026-10-08.
   *
   * So the row planted here is one that SHOULD fail: 未建模 with no verdict, and an escaped pipe in
   * the cell. If the splitter ever regresses, this test does not go red on a count — it goes red on
   * the catcher being gone, which is the failure worth naming.
   */
  it('a row with an escaped pipe in its evidence cell is a row, and goes through the disciplines',
    () => {
      const line = '| 种的假行（§99） | 已发布 · 802.11-2024 | 未建模 | '
        + `证据格里一个裁定也没有；\`grep -ri 'planted\\|probe' src\` 零命中。 |`
      const [cells, ...rest] = tableRows(line)
      expect(rest, 'one line is one row').toEqual([])
      expect(cells, 'four cells, and the escape resolved to the pipe a reader sees').toEqual([
        '种的假行（§99）', '已发布 · 802.11-2024', '未建模',
        `证据格里一个裁定也没有；\`grep -ri 'planted|probe' src\` 零命中。`,
      ])
      // it reaches the discipline rather than vanishing before it
      expect(COVERAGE).toContain(prefixOf(cells[2]))
      expect(disciplineViolations([cells])).toEqual([
        '种的假行（§99）: 未建模 but the evidence cell says neither 范围决定 nor 未偿的债',
      ])
    })

  /**
   * **The half of the escaped-pipe fix that shipped inert.** `splitCells` is shared by `tableRows`
   * and `statedCounts`, and the fix of 2026-10-08 taught both of them the escape — but every
   * planted test that day aimed at the four-column path, and the slice's own report wrote the gap
   * down: 「there is no two-column count row with an escaped pipe, so I planted no row for it;
   * this is the hole I am leaving.」 By `docs/inert-config-contract.md` that is a fix with two
   * permitted endings, pinned or refused out loud. This is the pin.
   *
   * It matters because of what a dropped count row does. `statedCounts` keys the totals table by
   * its label, and the twelve per-verdict assertions above read it by `stated.get(label)`. A row
   * the splitter mis-cut is not in the map, the lookup yields `undefined`, and the failure reads
   * 「expected undefined to be 37」 — which sends the reader after a deleted table row rather than
   * after the parser. So the escape is checked here rather than discovered there.
   *
   * Both of `statedCounts`' own rules are planted together, because the bolded rows are exactly
   * the ones a `grep` label would plausibly land in: the label keeps the pipe a reader sees, and
   * the emphasis around the figure does not stop it being a figure.
   */
  it('a two-column count row survives an escaped pipe in its label', () => {
    const totals = ['## 总数（种的）', '| 本仿真器 | 行数 |', '| --- | --- |',
      `| \`grep -ri 'ldpc\\|stbc' src/engine\` 零命中的 | 3 |`,
      `| **\`grep -rn 'own TX\\|ownTx'\` 零命中的** | **7** |`].join('\n')
    const counts = statedCounts(totals)
    expect([...counts.entries()],
      'a count row whose label holds an escaped pipe, with and without emphasis').toEqual([
      [`\`grep -ri 'ldpc|stbc' src/engine\` 零命中的`, 3],
      [`\`grep -rn 'own TX|ownTx'\` 零命中的`, 7],
    ])
    // and the net is not widened by it: a four-column row is not a count row, and a label whose
    // figure is not a bare integer is not a count at all — which is what keeps the legend table
    // out of the map even though it shares its labels with the totals table
    expect(statedCounts(`| 分片与重组 | 已发布 | 未建模 | **范围决定。** |`).size).toBe(0)
    expect(statedCounts('| 已发布 · 802.11-2024 | 在 2024 版正文里。 |').size).toBe(0)
  })

  it('escaping a pipe does not let a separator or a three-column row in', () => {
    // The other half: letting the escaped pipe through must not widen the net. A separator row is
    // still a separator, and the §16 A–G table is still three columns — that one USED to be
    // mis-split into four, and on the day this test was written the only thing keeping it out of
    // the data rows was the vocabulary filter. Since 2026-10-08 it is out for a third, structural
    // reason as well: its table's header is not the data header. Both latches are checked.
    expect(tableRows('| --- | --- | --- | --- |')).toEqual([])
    expect(tableRows(`| **B** PHY 保真 | 没有 | \`grep -rn 'own TX\\|ownTx'\` 零命中 |`))
      .toEqual([])
    // and the real document's A–G table is out of the data rows for BOTH reasons now
    expect(rows.filter((r) => r[0].includes('PHY 保真'))).toEqual([])
    expect(dataRows(doc, ['A–G', '零到一百的阶段/刀', '谁实际交的']).length,
      'the A–G table is still found as a table of its own, so the line above is not vacuous')
      .toBeGreaterThan(0)
  })
})

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Layer 5: the figures in the tables that are NOT data rows.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** The header of §17's summary table — the one that carries six figures about the course. */
const FIG_HEAD = ['量', '实测', '断言在哪', '余量']

/** The header of §14's 「引擎建了，无课」 summary table. */
const BUILT_HEAD = ['#', '它是什么', '引擎', '这张表的哪一节']

const byId = new Map(LESSONS.map((l) => [l.id, l]))
const ordered = COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])

/**
 * The `limits` ratchet is the one figure in §17 that is a CEILING rather than a measurement, so
 * 「read it out and compare」 means comparing the document to the assertion instead of to the
 * course. Both say 292; neither of them says it twice.
 */
const ratchetCeiling = (): number => {
  const src = readFileSync(resolve(ROOT, 'tests/course/readability.test.ts'), 'utf8')
  const m = /owes no more than (\d+) \(lesson, term\) pairs/.exec(src)
  expect(m, 'readability.test.ts no longer names the `limits` ratchet in its own `it` title, so'
    + ' §17 has nothing to be compared against — fix this reader, do not drop the comparison')
    .not.toBeNull()
  return Number(m![1])
}

/**
 * Every figure of §17's summary table, next to the thing that measures it. A `Map` rather than six
 * assertions so that the set of labels can be compared against the table as a whole: a seventh row
 * added to that table has to be answered here, and a row that stops opening with its figure makes
 * the two sizes disagree. **There is no literal figure in this file** — the same rule as the rest
 * of it.
 */
const FIGURES: ReadonlyMap<string, () => number> = new Map([
  ['全课程主路径汉字', () => ordered.reduce((n, l) => n + mainPathChars(l), 0)],
  ['分钟数合计', () => ordered.reduce((n, l) => n + lessonMinutes(l), 0)],
  ['`limits` 债务棘轮', ratchetCeiling],
  ['课数', () => ordered.length],
  ['模块数', () => MODULES.length],
  ['场景数（含 variants）',
    () => LESSONS.length + LESSONS.reduce((n, l) => n + (l.variants?.length ?? 0), 0)],
])

const figures = statedFigures(doc, FIG_HEAD)

/**
 * **This is the hole the whole slice was opened for, and the irony is the reason.**
 *
 * `statedCounts` reads two-column `| label | count |` rows, which is the shape of §「总数」's
 * three totals tables. §17's summary is FOUR columns, so nothing read it — and on 2026-10-09
 * five of its six figures were stale: 课数 87 (真 88), 模块数 30 (真 31), 分钟数合计 1 850
 * (真 1 875), 全课程主路径汉字 191 386 (真 193 882), 场景数 256 (真 264). The three the brief
 * named are **exactly the three that slice W3 moved in one commit**, and the other two drifted
 * the same way. The most prominent table of a document whose own §「总数」 says every figure in it
 * is read out and compared held five hand-written ones, stale because of us.
 *
 * So they are read out and compared now, which is this repository's standing answer to a
 * hand-written number — the answer slice W0 gave the 188 317 it deleted rather than updated.
 * Correcting 87 to 88 would only have been a number waiting to rot again.
 */
describe(`${DOC}'s §17 summary table states figures, and every one is measured`, () => {
  it('still has the table, and every row of it opens with its figure', () => {
    // The guard against a reader that silently matches nothing: if the header is re-dated or a row
    // stops leading with its number, this is the failure, not a vacuous green below.
    const rowCount = dataRows(doc, FIG_HEAD).length
    expect(rowCount, 'the §17 summary table is gone, or its header changed — statedFigures selects'
      + ` on the exact header ${FIG_HEAD.join(' | ')}`).toBeGreaterThan(0)
    expect(figures.size, `${rowCount} rows in the §17 summary table but ${figures.size} figures`
      + ' parsed; a 实测 cell that does not OPEN with its figure yields nothing, and a figure that'
      + ' yields nothing is a figure nobody checks — which is the defect this layer exists for')
      .toBe(rowCount)
  })

  it('states exactly the six figures this file measures, and no seventh', () => {
    expect([...figures.keys()], 'a row added to or removed from §17 owes a line in FIGURES saying'
      + ' what measures it; an unanswered row is an unchecked number')
      .toEqual([...FIGURES.keys()])
  })

  it.each([...FIGURES.keys()])('%s is the measured value', (label) => {
    expect(figures.get(label), `§17 states ${label} = ${figures.get(label)}`)
      .toBe(FIGURES.get(label)!())
  })

  it('breaks 课数 down into the three lesson families it actually has', () => {
    // The breakdown inside the 课数 cell is a second stated figure, and on 2026-10-09 it was stale
    // in the same edit and for the same reason: 87（Wi-Fi 49、AMP 5、UWB 33）while W3's `@link-2g`
    // had already made it 88（Wi-Fi 50…）. The leading-integer rule cannot see a figure inside a
    // parenthesis, so this one is read by name.
    const m = /\| 课数 \| (\d+)（Wi-Fi (\d+)、AMP (\d+)、UWB (\d+)）/.exec(doc)
    expect(m, 'the 课数 row no longer spells its family breakdown in the shape this reads')
      .not.toBeNull()
    const [total, wifi, amp, uwb] = m!.slice(1).map(Number)
    const uwbActual = ordered.filter((l) => l.id.startsWith('uwb-')).length
    const ampActual = ordered.filter((l) => l.id.startsWith('amp-')).length
    expect([wifi, amp, uwb], 'the three families, by lesson-id prefix')
      .toEqual([ordered.length - uwbActual - ampActual, ampActual, uwbActual])
    expect(wifi + amp + uwb, 'the breakdown has to add up to the total beside it').toBe(total)
  })

  it('states the fixture total the scenario count sits inside', () => {
    // `| 场景数（含 variants） | **264** | …共 **271** 条 = 264 + 7 个编辑器家庭 |` — three figures
    // in one row, of which the leading-integer rule sees one. The other two were stale too (263 =
    // 256 + 7), so the equation is read and both sides are compared against the fixture itself.
    const m = /共 \*\*(\d+)\*\* 条 = (\d+) \+ (\d+) 个编辑器家庭/.exec(doc)
    expect(m, 'the 场景数 row no longer spells the fixture equation').not.toBeNull()
    const [total, scenes, households] = m!.slice(1).map(Number)
    const fixture = JSON.parse(
      readFileSync(resolve(ROOT, 'tests/fixtures/lesson-hashes.json'), 'utf8'),
    ) as Record<string, string>
    expect(total, 'keys in tests/fixtures/lesson-hashes.json').toBe(Object.keys(fixture).length)
    expect(households, 'HOUSEHOLDS, which the fixture records as `household:<id>`')
      .toBe(HOUSEHOLDS.length)
    expect(scenes + households, 'the equation has to add up to the total beside it').toBe(total)
    expect(scenes, 'and the left-hand side is the figure in the 实测 column')
      .toBe(figures.get('场景数（含 variants）'))
  })

  it('states how many figures that table holds, in the prose above it', () => {
    const m = /是下面那张表里的\*\*(.+?)\*\*个数/.exec(doc)
    expect(m, '§17 no longer says how many figures its table holds').not.toBeNull()
    expect(zhNumeral(m![1]), `§17 says 「${m![1]}个数」`).toBe(figures.size)
  })

  it('states the mean lesson as an equation, and both sides of it are measured', () => {
    // 「全课程 87 门的均值 2 200 = 191 386 / 87」 — prose, and three of its four figures were the
    // stale ones from the table above. Read by name for the same reason the breakdown is.
    const m = /全课程 (\d+) 门的均值 (\d[\d ]*) = (\d[\d ]*) \/ (\d+)/.exec(doc)
    expect(m, '§17 no longer spells the mean-lesson equation in the shape this reads')
      .not.toBeNull()
    const [count, mean, chars, divisor] = m!.slice(1).map((s) => Number(s.replaceAll(' ', '')))
    const actual = ordered.reduce((n, l) => n + mainPathChars(l), 0)
    expect([count, divisor], 'both appearances of the lesson count')
      .toEqual([ordered.length, ordered.length])
    expect(chars, 'the corpus total, again').toBe(actual)
    expect(mean, 'and the quotient the sentence states').toBe(Math.round(actual / ordered.length))
  })

  it('states the minute sum again inside the bucket table, and that copy is measured too', () => {
    // The second table of §17 names the sum in prose inside a cell — 「分钟数合计那条等式（今天是
    // 1 850）变红」 — and that copy was stale while the table above it was stale. Two statements of
    // one number are two things to check, not one.
    const m = /分钟数合计那条等式（今天是 (\d[\d ]*)）变红/.exec(doc)
    expect(m, 'the `@rate` row no longer names the minute sum').not.toBeNull()
    expect(Number(m![1].replaceAll(' ', '')), 'the sum named in the 后果 cell')
      .toBe(ordered.reduce((n, l) => n + lessonMinutes(l), 0))
  })
})

/**
 * §14's summary table counts itself twice — once in the section heading (「的五条」) and once in its
 * own `#` column — and neither copy was checked. That heading has read 十三条, 九条 and 五条 within
 * four days of slices, which is the rate at which a hand-written count goes wrong here.
 */
describe(`${DOC}'s §14 summary table counts itself correctly`, () => {
  const built = dataRows(doc, BUILT_HEAD)

  it('has the table, numbered 1..n with nothing skipped', () => {
    expect(built.length, 'the §14 summary table is gone, or its header changed').toBeGreaterThan(0)
    expect(built.map((r) => r[0]), 'the `#` column — a renumbering that skips one is a row that'
      + ' vanished from the count while still being on the page')
      .toEqual(built.map((_, i) => String(i + 1)))
  })

  it('states its own length in its heading', () => {
    const m = /^## 十四、「引擎建了，无课」的(.+?)条，汇总$/m.exec(doc)
    expect(m, '§14 no longer heads itself with a count').not.toBeNull()
    expect(zhNumeral(m![1]), `§14 heads itself 「的${m![1]}条」`).toBe(built.length)
  })
})

/**
 * **Who checks each table's numbers, as an assertion.** Every table of this document is listed here
 * with the answer; a table that is not listed is a table whose figures nobody reads, and that is
 * the shape of every defect this pair of files has found. So the census is pinned: a new summary
 * table cannot appear without somebody writing down which it is.
 *
 * Measured 2026-10-09 — and the count relayed from the previous slice (「20 张表：12 数据 + 4 四列
 * 汇总 + 3 二列 + 2 三列」) was wrong on both totals: there are **24** tables under **13** distinct
 * headers, 12 data + 4 four-column non-data + 5 two-column + 3 three-column.
 */
const CENSUS: readonly (readonly [readonly string[], string])[] = [
  [['值', '含义'], '§「怎么读这张表」 legend — prose cells, deliberately no figures'],
  [['标准依据（按前缀归并）', '行数'], 'statedCounts, against the data rows (5 labels)'],
  [['本仿真器', '行数'], 'statedCounts, against the data rows (3 labels)'],
  [['第四列的裁定', '行数'], 'statedCounts, against the data rows (4 labels)'],
  [HEAD, 'the data tables — row total, both vocabularies, both fourth-column disciplines'],
  [BUILT_HEAD, '§14 — the `#` column, against the count in its own heading'],
  [['Tier 3 原定的条目', '今天在哪', '还剩什么'], '§15 — prose cells, no figures'],
  [['Tier 4 原定的条目', '状态'], '§15 — prose cells, no figures'],
  [['子项目', '规格', '实际状态'], '§16 — prose cells, no figures'],
  [['A–G', '零到一百的阶段/刀', '谁实际交的'], '§16 — prose cells, no figures'],
  [FIG_HEAD, '§17 — statedFigures, all six against the course'],
  [['课', 'raw 分钟', '到下一档还剩', '后果'],
    '§17 bucket margins — NOT pinned row by row (re-measured 2026-10-09: all six exact); its one'
    + ' prose figure, the minute sum, IS pinned above'],
  [['课', 'raw', '取整', '到 35 还剩'],
    '§17 raw > 30 — NOT pinned row by row (re-measured 2026-10-09: 31.12/30 and 30.32/30 exact;'
    + ' the 到 35 margins 303 and 479 are a floor of the 303.6 and 479.6 the formula gives, so'
    + ' pinning them would pin a rounding convention rather than a fact)'],
]

describe(`${DOC}'s table census is pinned, so a new summary table cannot go unchecked`, () => {
  it('has exactly the tables this file says who checks', () => {
    const heads = [...new Set(tableHeads(doc).map((h) => h.join(' | ')))]
    expect(heads.sort(), 'a table appeared or disappeared. Every table of this document owes a line'
      + ' in CENSUS naming what checks its figures — an unlisted table is the hole that let the six'
      + ' figures of §17 go five-sixths stale.\n'
      + CENSUS.map(([h, who]) => `  ${h.join(' | ')}  <-  ${who}`).join('\n'))
      .toEqual(CENSUS.map(([h]) => h.join(' | ')).sort())
  })

  it('lists one answer per distinct header and no answer twice', () => {
    // So the set equality above cannot pass by CENSUS repeating a header, and so the counts in
    // its docblock are the only place a figure about this document is written down by hand —
    // deliberately prose, because **there is no literal figure anywhere in this file**. The
    // 「twelve data tables」 claim is checked where it belongs: against the row total the
    // document states about itself, by the first describe of this file.
    expect(CENSUS.length, 'two lines of CENSUS carry the same header')
      .toBe(new Set(CENSUS.map(([h]) => h.join(' | '))).size)
    expect(tableHeads(doc).length, 'tables in the whole document, which is more than the number of'
      + ' distinct headers because the twelve data tables share one')
      .toBeGreaterThan(CENSUS.length)
  })
})

/**
 * **The reverse check: the new reader must not widen the net.** A figure parser that also swallowed
 * headers, separator rows or the numbers inside a sentence would redden on ordinary editing, which
 * is worse than not existing — it teaches people to stop reading the red.
 */
describe(`${DOC}'s figure reader ignores what it should ignore`, () => {
  it('reads the figure a row opens with, and nothing else in the cell', () => {
    const table = [`| ${FIG_HEAD.join(' | ')} |`, '| --- | --- | --- | --- |',
      '| 种的量 | **191 386**（2026-10-07 重量；上一次记的是 191 285，少了 101 字） | 同文件 | — |',
      '| 分钟数合计 | **1 875** | 同文件，**等式** | 0 |',
      '| 课数 | 88（Wi-Fi 50、AMP 5、UWB 33） | `toBe(88)` | — |'].join('\n')
    expect([...statedFigures(table, FIG_HEAD).entries()],
      'the leading figure of each cell — not the dates, not the asides, not the parenthesis')
      .toEqual([['种的量', 191_386], ['分钟数合计', 1_875], ['课数', 88]])
  })

  it('does not read the header row, a separator row, or another table', () => {
    // A header whose second cell is a figure would be a figure if the header were a row; it is not.
    expect(statedFigures([`| ${FIG_HEAD.join(' | ')} |`, '| --- | --- | --- | --- |'].join('\n'),
      FIG_HEAD).size, 'a table with no data rows states no figures').toBe(0)
    expect(statedFigures(['| 量 | 2 | 断言在哪 | 余量 |', '| --- | --- | --- | --- |',
      '| 种的量 | 7 | 同文件 | — |'].join('\n'), FIG_HEAD).size,
    'and the header is the header even when it could be read as a row').toBe(0)
    // the data tables are four columns too, and their 标准依据 cells are not figures
    expect(statedFigures(doc, HEAD).size, 'no data row opens its second cell with an integer')
      .toBe(0)
  })

  it('does not read a figure out of prose, or out of a cell that does not open with one', () => {
    const table = [`| ${FIG_HEAD.join(' | ')} |`, '| --- | --- | --- | --- |',
      '| 种的量 | 大约 1 875 | 同文件 | — |',
      '| 另一个 | — | 同文件 | — |'].join('\n')
    expect(statedFigures(table, FIG_HEAD).size,
      'a cell that opens with a word states no figure — which is why the test above asserts that'
      + ' every row of the real table yields one').toBe(0)
    expect(statedFigures('全课程 88 门的均值 2 203 = 193 882 / 88。', FIG_HEAD).size,
      'a sentence is not a table').toBe(0)
  })

  it('reads a Chinese numeral only where there is one', () => {
    expect([zhNumeral('五'), zhNumeral('六'), zhNumeral('十'), zhNumeral('十四'),
      zhNumeral('二十四')], 'the counts these two documents actually spell')
      .toEqual([5, 6, 10, 14, 24])
    expect([zhNumeral('5'), zhNumeral('五条'), zhNumeral(''), zhNumeral('十四五'), zhNumeral('百')],
      'and nothing else — a reader that guessed here would compare against a wrong number')
      .toEqual([null, null, null, null, null])
  })
})
