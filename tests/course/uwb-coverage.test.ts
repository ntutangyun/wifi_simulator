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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LESSONS } from '../../src/course/lessons'

const ROOT = resolve(__dirname, '../..')
const DOC = 'docs/uwb-feature-coverage.md'
const doc = readFileSync(resolve(ROOT, DOC), 'utf8')

/** Every `path.ts#symbol` citation, deduplicated, in the order the document makes them. */
const symbolCitations: { file: string; symbol: string; token: string }[] = (() => {
  const seen = new Set<string>()
  const out: { file: string; symbol: string; token: string }[] = []
  for (const m of doc.matchAll(/`([A-Za-z0-9._/-]+\.tsx?)#([A-Za-z_$][A-Za-z0-9_$]*)`/g)) {
    const token = m[0]
    if (seen.has(token)) continue
    seen.add(token)
    out.push({ file: m[1], symbol: m[2], token })
  }
  return out
})()

/** Every `@lesson-id` citation, deduplicated. */
const lessonCitations: string[] = [
  ...new Set([...doc.matchAll(/`@([a-z0-9-]+)`/g)].map((m) => m[1])),
]

/**
 * The module-level export names of one source file.
 *
 * Both forms the codebase uses: a declaration (`export const` / `function` / `class` /
 * `interface` / `type`) and a re-export list (`export { rstuNs }`, `export { a as b }` — the
 * exported name is the alias when there is one). Nothing here resolves `export *`; no UWB file
 * uses it, and a citation that fell through would fail loudly rather than pass silently.
 */
function exportsOf(file: string): Set<string> {
  const src = readFileSync(resolve(ROOT, 'src', file), 'utf8')
  const names = new Set<string>()
  for (const m of src.matchAll(
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  )) names.add(m[1])
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/)
      const name = (bits[1] ?? bits[0]).trim()
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name)
    }
  }
  return names
}

const exportCache = new Map<string, Set<string>>()
const exportsCached = (file: string): Set<string> => {
  const hit = exportCache.get(file)
  if (hit) return hit
  const fresh = exportsOf(file)
  exportCache.set(file, fresh)
  return fresh
}

describe(`${DOC} points at things that exist`, () => {
  it('cites enough of the engine to be worth checking', () => {
    // A guard against the parser silently matching nothing — which would make every
    // assertion below vacuously true and the whole file a decoration.
    expect(symbolCitations.length).toBeGreaterThan(80)
    expect(lessonCitations.length).toBeGreaterThan(15)
  })

  it.each(symbolCitations)('$token names a real export', ({ file, symbol, token }) => {
    expect([...exportsCached(file)].includes(symbol), `${token}: not exported from src/${file}`)
      .toBe(true)
  })

  it.each(lessonCitations)('@%s is a real lesson id', (id) => {
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
const rows: string[][] = doc
  .split('\n')
  .filter((l) => l.trimStart().startsWith('|'))
  .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
  .filter((cells) => cells.length === 4)
  .filter((cells) => cells[1] !== '标准状态' && !/^-{3,}$/.test(cells[0]))

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
const statedCount = (label: string): number | null => {
  const m = doc.match(new RegExp(`^\\|\\s*${label}\\s*\\|\\s*(\\d+)\\s*\\|`, 'm'))
  return m ? Number(m[1]) : null
}

describe(`${DOC} states its own size correctly`, () => {
  it('the row total matches', () => {
    const stated = doc.match(/全表 \*\*(\d+) 行\*\*/)
    expect(stated, 'the document no longer states a row total').not.toBeNull()
    expect(Number(stated![1])).toBe(rows.length)
  })

  it.each([...STATUS, ...COVERAGE])('the count for %s matches', (label) => {
    const column = STATUS.includes(label) ? 1 : 2
    const actual = rows.filter((r) => r[column] === label).length
    expect(statedCount(label), `${label}: no count row in the totals table`).toBe(actual)
  })
})
