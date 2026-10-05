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
  lessonCitations, readDoc, statedCounts, symbolCitations, tableRows, unresolved,
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

/** Every four-column data row of the document's tables: [feature, status, coverage, evidence]. */
const rows: string[][] = tableRows(doc).filter((cells) => cells[1] !== '标准状态')

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
