/**
 * `docs/uwb-feature-coverage.md` maps every known UWB feature onto three things: its clause or
 * document number, where the standard's own process has got to with it, and how much of it this
 * simulator actually does. The third column is the one that rots, because it points at code.
 *
 * These checks are deliberately narrow. They assert that **every engine symbol and every lesson
 * id the document names still exists** — nothing more. A rename or a deletion is the cheapest way
 * a table like this starts lying, and it is the only kind of lie a test can catch without
 * re-deriving the whole document.
 *
 * What they do NOT catch, and what the document says plainly in its own words: a feature being
 * changed out from under a row. `ssTwrCorrected` can stop correcting for a clock offset tomorrow,
 * the symbol still exists, this file still passes, and the cell that says 已建模 is now false.
 * The same goes for every 仍在争论 verdict, which expires the moment a motion carries.
 *
 * The citation syntax the document commits to, and this file parses:
 *   `uwb/ranging.ts#ssTwrCorrected`  — path relative to src/, `#` then a module-level export
 *   `@uwb-sstwr`                     — a lesson id
 */
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import {
  dataRows, lessonCitations, readDoc, statedCounts, statedFigures, symbolCitations, tableHeads,
  tableRows, unresolved,
} from './coverage'

const DOC = 'docs/uwb-feature-coverage.md'
const doc = readDoc(DOC)

/** Every `path.ts#symbol` citation, deduplicated, in the order the document makes them. */
const symbols = symbolCitations(doc)
/** Every `@lesson-id` citation, deduplicated. */
const lessons = lessonCitations(doc)

describe(`${DOC} points at things that exist`, () => {
  it('cites enough of the engine to be worth checking', () => {
    // A guard against the parser silently matching nothing — which would make every
    // assertion below vacuously true and the whole file a decoration.
    expect(symbols.length).toBeGreaterThan(80)
    expect(lessons.length).toBeGreaterThan(15)
  })

  it.each(symbols)('$token names a real export', (citation) => {
    expect(unresolved(citation)).toBeNull()
  })

  it.each(lessons)('@%s is a real lesson id', (id) => {
    expect(LESSONS.map((l) => l.id)).toContain(id)
  })
})

/**
 * The two verdict columns are closed vocabularies. A cell that says "大部分建模" or "草案中"
 * reads like a verdict but belongs to no column, and it makes the document's own counts wrong —
 * which is exactly the kind of drift a reader cannot see.
 */
const STATUS = ['已发布', '已进草案且未见争议', '仍在争论', '仅为提案，未进草案', '无法判定']
const COVERAGE = ['已建模', '部分建模', '未建模']

/** The header every data table of this document carries, and nothing else in it does. */
const HEAD = ['特性', '标准状态', '本仿真器', '位置与证据']

/**
 * Every data row of the document's tables: [feature, status, coverage, evidence].
 *
 * **Selected by the table's header.** Until 2026-10-08 it was `tableRows(doc)` — every
 * four-column line anywhere in the document — with the header rows subtracted by testing
 * `cells[1] !== '标准状态'`. That worked only because this document happens to have no
 * four-column table that is not data; the Wi-Fi document has four of them, and the pair of files
 * shares this parser. A summary table added here would have had its rows walk into the row total
 * and into both vocabulary columns. The header is the structural fact, so the header is what
 * selects, and dropping the header row is no longer a cell-value coincidence.
 *
 * Measured the day it changed: the same 109 rows as the old pair of filters, which is still the
 * total the document states about itself.
 */
const rows: string[][] = dataRows(doc, HEAD)

describe(`${DOC} keeps its two verdict columns closed`, () => {
  it('has the rows it claims to have', () => {
    expect(rows.length).toBeGreaterThan(60)
  })

  it.each(rows)('%s: 标准状态 and 本仿真器 are vocabulary values', (feature, status, coverage) => {
    expect(STATUS, `${feature}: 标准状态 = "${status}"`).toContain(status)
    expect(COVERAGE, `${feature}: 本仿真器 = "${coverage}"`).toContain(coverage)
  })

  // The document's own contract: a partial row must say which part. An evidence cell that is
  // shorter than a sentence cannot be doing that.
  it.each(rows.filter((r) => r[2] === '部分建模'))('%s: 部分建模 says which part', (feature, _s, _c, evidence) => {
    expect(evidence.length, `${feature}: evidence cell is ${evidence.length} chars`)
      .toBeGreaterThan(40)
  })

  // Every non-published verdict about the draft owes a document number, and the contested ones
  // owe a vote when there was one. This checks the cheap half: that a document number is there.
  it.each(rows.filter((r) => r[1] === '已进草案且未见争议' || r[1] === '仍在争论'))(
    '%s: a draft verdict cites a document number',
    (feature, _s, _c, evidence) => {
      expect(/15-2\d\/\d{4}/.test(evidence), `${feature}: no 15-yy/nnnn in the evidence cell`)
        .toBe(true)
    },
  )

  it.each(rows.filter((r) => r[1] === '无法判定'))('%s: 无法判定 says what was looked at', (feature, _s, _c, evidence) => {
    expect(evidence, `${feature}: 无法判定 without a "查了什么" note`).toContain('查了什么')
  })
})

/**
 * The document states its own totals. A table that cannot say how big it is leaves a reader unable
 * to tell a deliberate blank from a missing row, so the totals are part of the content — and a
 * stated total that has drifted from the rows is the same defect as a stated coverage that has
 * drifted from the code.
 */
const stated = statedCounts(doc)

describe(`${DOC} states its own size correctly`, () => {
  it('the row total matches', () => {
    const total = doc.match(/全表 \*\*(\d+) 行\*\*/)
    expect(total, 'the document no longer states a row total').not.toBeNull()
    expect(Number(total![1])).toBe(rows.length)
  })

  it.each([...STATUS, ...COVERAGE])('the count for %s matches', (label) => {
    const column = STATUS.includes(label) ? 1 : 2
    const actual = rows.filter((r) => r[column] === label).length
    expect(stated.get(label), `${label}: no count row in the totals table`).toBe(actual)
  })
})

/**
 * **A check that has only ever been run against a document that passes has not been shown to be
 * able to fail.** The Wi-Fi half of this pair has carried planted-failure tests since it shipped;
 * this half had none for the thing the two files share, which is the parser.
 *
 * One plant, for the hole the header selector closed: this document has no four-column table that
 * is not data, and that is luck rather than design — the Wi-Fi document has four of them, and the
 * old selector («every four-column line, minus the ones whose second cell reads 标准状态») would
 * have handed their rows to the row total and to both vocabulary columns here too.
 */
describe(`${DOC}'s parser can fail`, () => {
  it('a four-column summary table added to this document would not become data', () => {
    const planted = ['## 十六、种的一节汇总',
      '| # | 它是什么 | 标准状态 | 本仿真器 |', '| --- | --- | --- | --- |',
      '| 1 | 种的汇总行 | 已发布 | 已建模 |'].join('\n')
    // the old selector: four cells, second cell is not the word 标准状态 — and in it goes
    expect(tableRows(planted).filter((cells) => cells[1] !== '标准状态')).toHaveLength(2)
    // the header selector: this table is not the data table, so it contributes no data row
    expect(dataRows(planted, HEAD)).toEqual([])
    // and a table that IS headed like the data tables still gives up its row, so this is not a
    // parser that stopped matching
    const real = ['## 一、种的一节', `| ${HEAD.join(' | ')} |`, '| --- | --- | --- | --- |',
      '| 种的特性 | 已发布 | 已建模 | `uwb/ranging.ts#rstuNs`。`@uwb-sstwr` |'].join('\n')
    expect(dataRows(real, HEAD)).toEqual([
      ['种的特性', '已发布', '已建模', '`uwb/ranging.ts#rstuNs`。`@uwb-sstwr`'],
    ])
  })
})

/**
 * **The other half of the shared parser's blind spot, and here it is a pin rather than a fix.**
 *
 * `statedCounts` reads two-column `| label | count |` rows, and that is the shape of both of this
 * document's totals tables, so every figure it states about itself is read out and compared. The
 * Wi-Fi half of this pair was not so lucky: its §17 summary is FOUR columns, nothing read it, and
 * on 2026-10-09 five of that table's six figures were measured stale — three of them stale because
 * of one of our own slices.
 *
 * **Measured the same day: this document has no such table.** 18 tables under 4 distinct headers —
 * 15 data tables, two two-column totals tables and one two-column legend — and not one non-data
 * table that states a figure. **That is luck, not design**, in exactly the way the header selector
 * of 2026-10-08 was: the parser is shared, the discipline was not. So the census is pinned here,
 * and the rule the Wi-Fi document needed is asserted here before this document needs it.
 *
 * The figures that are in prose rather than in a table are deliberately out of scope and said out
 * loud instead: 「145 行」 of `.superpowers/sdd/uwb-clause-list.txt` (re-measured 2026-10-09:
 * exactly 145 lines), 「十一个格子写了「无法判定」」 (the 无法判定 count, which IS pinned by the
 * totals table above), and 「1138 份抽出的文稿」, which names a corpus outside this repository and
 * cannot be measured from inside it.
 */
const UWB_CENSUS: readonly (readonly [readonly string[], string])[] = [
  [['值', '含义'], '§「怎么读这张表」 legend — prose cells, deliberately no figures'],
  [['标准状态', '行数'], 'statedCounts, against the data rows (the 5 STATUS labels)'],
  [['本仿真器', '行数'], 'statedCounts, against the data rows (the 3 COVERAGE labels)'],
  [HEAD, 'the data tables — row total, both verdict vocabularies, the three evidence disciplines'],
]

describe(`${DOC} has no table whose figures nothing reads`, () => {
  it('has exactly the tables this file says who checks', () => {
    const heads = [...new Set(tableHeads(doc).map((h) => h.join(' | ')))]
    expect(heads.sort(), 'a table appeared or disappeared in this document. Every table owes a line'
      + ' in UWB_CENSUS naming what checks its figures — being unlisted is how the Wi-Fi'
      + ' document\'s §17 went five-sixths stale.\n'
      + UWB_CENSUS.map(([h, who]) => `  ${h.join(' | ')}  <-  ${who}`).join('\n'))
      .toEqual(UWB_CENSUS.map(([h]) => h.join(' | ')).sort())
  })

  it('states no figure outside a table that something compares', () => {
    // The rule, rather than the census: in any table that is NOT the data table, a cell that OPENS
    // with a digit is a stated figure, and it is only allowed where this file already compares it
    // — a two-column count row whose label is one of the eight asserted above. A four-column
    // summary like the Wi-Fi document's §17 fails here on its first row, which is the point: the
    // next person to add one is told to go and compare it, not left with a green run.
    const asserted = new Set([...STATUS, ...COVERAGE])
    const loose: string[] = []
    for (const key of new Set(tableHeads(doc).map((h) => h.join('\u0000')))) {
      const head = key.split('\u0000')
      if (head.length === HEAD.length && head.every((c, i) => c === HEAD[i])) continue
      for (const row of dataRows(doc, head)) {
        const label = row[0].replaceAll('*', '').trim()
        row.slice(1).forEach((cell, i) => {
          if (!/^\d/.test(cell.replaceAll('*', '').trim())) return
          if (head.length === 2 && asserted.has(label)) return
          loose.push(`${head.join(' | ')} → 「${label}」 column ${i + 2} states ${cell}`)
        })
      }
    }
    expect(loose, `${loose.length} stated figures sit in a non-data table that nothing in this file`
      + ` compares:\n${loose.join('\n')}`).toEqual([])
  })

  it('that rule can fail: a four-column summary table here would be caught', () => {
    // Planted, because a check that has only run against a document that passes has not been shown
    // to be able to fail. This is the Wi-Fi document's §17 in miniature, dropped into this one.
    const planted = ['## 十八、种的汇总', '| 量 | 实测 | 断言在哪 | 余量 |',
      '| --- | --- | --- | --- |', '| 课数 | 87 | 同文件 | — |'].join('\n')
    const heads = tableHeads(planted)
    expect(heads, 'the planted table is found as a table of its own').toHaveLength(1)
    expect(heads[0], 'and its header is not the data header').not.toEqual([...HEAD])
    const row = dataRows(planted, heads[0])[0]
    expect(/^\d/.test(row[1]), 'its 实测 cell opens with a digit, so the rule above sees a figure')
      .toBe(true)
    expect(statedFigures(planted, heads[0]).get('课数'), 'and statedFigures reads it, so the fix'
      + ' available to whoever adds such a table is the one the Wi-Fi file already uses').toBe(87)
    // and this document's own two-column count rows are NOT caught by the same rule
    expect(statedCounts(doc).get('已发布'), 'the totals table is still read as counts')
      .toBe(dataRows(doc, HEAD).filter((r) => r[1] === '已发布').length)
  })
})
