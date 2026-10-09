/**
 * The shared parser behind the two coverage-table tests.
 *
 * `docs/uwb-feature-coverage.md` and `docs/wifi-feature-coverage.md` are a pair, and they commit
 * to the same citation syntax on purpose — the Wi-Fi one says so in its own "怎么读这张表" section,
 * naming the UWB table and the test that was going to be written for it. This file is that shared
 * half: the citation grammar, the export resolver, the table-row splitter and the stated-total
 * reader. The two test files hold what is actually different, which is each table's vocabulary and
 * each table's own disciplines.
 *
 * It is a plain `.ts` module under `tests/course/` rather than a `.test.ts` one, which is the
 * existing shape for shared test machinery here (`tests/course/kit.ts`, `tests/course/rssi.ts`).
 *
 * **The grammar both documents commit to:**
 *   `uwb/ranging.ts#ssTwrCorrected`  — path relative to src/, `#` then a module-level export
 *   `@uwb-sstwr`                     — a lesson id
 *
 * Note what the `#` form deliberately cannot express: a private method. `engine/mac.ts`'s
 * `buildMuParts` is one, and the Wi-Fi table says in its own words why it is NOT written as
 * `engine/mac.ts#buildMuParts` — a citation this resolver cannot check would look checked and
 * would not be. That is not a gap in this file; it is the reason the rule exists.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** The repository root, from `tests/course/`. */
export const ROOT = resolve(__dirname, '../..')

export const readDoc = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')

export type SymbolCitation = { file: string; symbol: string; token: string }

/**
 * Every `` `path.ts#symbol` `` citation of one document, deduplicated by token, in the order the
 * document makes them. `occurrences` counts them before deduplication, because both documents
 * state that figure about themselves and a stated figure is only worth as much as its check.
 */
export function symbolCitations(doc: string): SymbolCitation[] {
  const seen = new Set<string>()
  const out: SymbolCitation[] = []
  for (const m of doc.matchAll(/`([A-Za-z0-9._/-]+\.tsx?)#([A-Za-z_$][A-Za-z0-9_$]*)`/g)) {
    const token = m[0]
    if (seen.has(token)) continue
    seen.add(token)
    out.push({ file: m[1], symbol: m[2], token })
  }
  return out
}

/** How many `#` citations the document makes in total, counting repeats of the same symbol. */
export const symbolCitationOccurrences = (doc: string): number =>
  [...doc.matchAll(/`([A-Za-z0-9._/-]+\.tsx?)#([A-Za-z_$][A-Za-z0-9_$]*)`/g)].length

/**
 * Every `` `@lesson-id` `` citation, deduplicated. The character class is ASCII on purpose: it is
 * what a lesson id is, and it is what keeps a label like `` `@课号` `` in a legend out of the list.
 */
export const lessonCitations = (doc: string): string[] => [
  ...new Set([...doc.matchAll(/`@([a-z0-9-]+)`/g)].map((m) => m[1])),
]

/**
 * The module-level export names of one source file.
 *
 * Both forms the codebase uses: a declaration (`export const` / `function` / `class` /
 * `interface` / `type`) and a re-export list (`export { rstuNs }`, `export { a as b }` — the
 * exported name is the alias when there is one). Nothing here resolves `export *`; no cited file
 * uses it, and a citation that fell through would fail loudly rather than pass silently.
 */
export function exportsOf(file: string): Set<string> {
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

export const exportsCached = (file: string): Set<string> => {
  const hit = exportCache.get(file)
  if (hit) return hit
  const fresh = exportsOf(file)
  exportCache.set(file, fresh)
  return fresh
}

/**
 * Why one citation does not resolve, or `null` when it does. A string rather than a boolean so the
 * failure says which of the two lies it is: the file moved, or the symbol was renamed.
 *
 * This is a function over a citation rather than an assertion so that it can be aimed at a PLANTED
 * citation too. A resolver that has only ever been run against a document that passes has not been
 * shown to be able to fail.
 */
export function unresolved({ file, symbol, token }: SymbolCitation): string | null {
  if (!existsSync(resolve(ROOT, 'src', file))) return `${token}: src/${file} does not exist`
  if (!exportsCached(file).has(symbol)) return `${token}: not exported from src/${file}`
  return null
}

/**
 * One Markdown table line's cells, untrimmed, outer pipes removed.
 *
 * The cell boundary is a pipe that is NOT escaped as `\|`, and that distinction is not pedantry
 * here: both documents put `grep` commands inside evidence cells, a `grep` alternation is a pipe
 * (`` `grep -ri 'ldpc\|stbc' src/engine` ``), and a splitter that cut on every bare pipe gave such
 * a row one cell too many. The four-column filter below then dropped the row — **out of the row
 * total AND out of every fourth-column discipline**, which is the failure mode this whole pair of
 * files exists to prevent: a row that is not checked looks exactly like a row that passes. Three
 * rows were in that hole, and the Wi-Fi document had written the defect down as a known one.
 *
 * `\|` comes back as a plain `|`, so a cell reads the way the document renders it, and the escape
 * cannot leak into a count or into an error message.
 *
 * Dropping an empty first and last element is how the outer pipes come off. Doing it this way
 * rather than by stripping `^\|` and `\|$` off the line matters for the trailing one: a line whose
 * last cell genuinely ended in an escaped pipe would have had its own content eaten by `\|$`.
 */
const splitCells = (line: string): string[] => {
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '\\' && line[i + 1] === '|') { cur += '|'; i += 1; continue }
    if (line[i] === '|') { cells.push(cur); cur = ''; continue }
    cur += line[i]
  }
  cells.push(cur)
  if (cells.length > 1 && cells[0] === '') cells.shift()
  if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/**
 * Every four-column table row of a document, separator rows dropped, cells trimmed. Header rows
 * are NOT dropped — the two documents head their tables differently and each test knows its own
 * header — and neither are the four-column tables that are summaries rather than data, for the
 * same reason.
 */
export const tableRows = (doc: string): string[][] => doc
  .split('\n')
  .filter((l) => l.trimStart().startsWith('|'))
  .map((l) => splitCells(l.trim()).map((c) => c.trim()))
  .filter((cells) => cells.length === 4)
  .filter((cells) => !/^-{3,}$/.test(cells[0]))

/**
 * Every Markdown table of a document, as its header row plus its data rows.
 *
 * A table is a run of consecutive lines that start with a pipe; the run's first row is the header,
 * an all-dashes row is dropped, and everything else is a data row. Nothing here looks at how many
 * cells a row has, which is the whole point — see {@link dataRows}.
 */
const tables = (doc: string): { head: string[]; rows: string[][] }[] => {
  const out: { head: string[]; rows: string[][] }[] = []
  let open: { head: string[]; rows: string[][] } | null = null
  for (const line of doc.split('\n')) {
    const l = line.trim()
    if (!l.startsWith('|')) { open = null; continue }
    const cells = splitCells(l).map((c) => c.trim())
    if (!open) { open = { head: cells, rows: [] }; out.push(open); continue }
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue
    open.rows.push(cells)
  }
  return out
}

/**
 * The data rows of every table of `doc` whose header row is exactly `head`.
 *
 * **Why this and not {@link tableRows}.** 「Is this line a data row of the coverage table?」 used
 * to be answered by two coincidences in series: four cells, and a third cell inside the 本仿真器
 * vocabulary. Both were measured to be wrong, in both directions, on 2026-10-08:
 *
 *  - **It let the wrong rows in.** `tableRows` reads the WHOLE document, and the Wi-Fi document
 *    has 23 four-column rows that are not data at all — §14's 「引擎建了，无课」 summary and §17's
 *    three tables about the character budget. They stayed out only because none of their third
 *    cells happened to spell a verdict. One summary cell reading 已建模 would have walked straight
 *    into the row total, the twelve per-verdict counts and both fourth-column disciplines. Worse,
 *    the §16 A–G table is THREE columns, and before the escaped-pipe fix of the same day its
 *    `**B** PHY 保真` row mis-split into four and really was in `tableRows`; the vocabulary filter
 *    is the only reason the counts were not already wrong.
 *  - **It dropped the right rows.** A data row whose 本仿真器 cell is mistyped (「大部分建模」)
 *    left the vocabulary and therefore stopped being a row — out of the total and out of both
 *    disciplines, which is the failure mode this pair of files exists to prevent. It was caught
 *    only indirectly, by the stated row total, and only for as long as nobody updated that total
 *    in the same edit — which is exactly what the old failure message invited.
 *
 * The header is the structural fact that separates a data table from a summary table, and it is
 * the rule the Wi-Fi document already states in its own words where it gives its row total
 * (「第一到第十二节的四列数据行；第十四到十七节的表是汇总，不计入」). So the header is what this
 * selects on, the vocabulary stops being a filter, and each test asserts the vocabulary over every
 * row it is given — which turns a mistyped verdict from a vanished row into a named failure.
 *
 * Measured: the identical row SET to the old pair of filters on both documents the day it landed —
 * 123 for Wi-Fi and 109 for UWB, each still equal to the total the document states about itself,
 * with zero rows on either side of the difference.
 */
export const dataRows = (doc: string, head: readonly string[]): string[][] =>
  tables(doc)
    .filter((t) => t.head.length === head.length && t.head.every((c, i) => c === head[i]))
    .flatMap((t) => t.rows)

/**
 * The two-column `| label | count |` rows of a document, as a map. First occurrence wins, and a
 * row whose second cell is not a bare integer is not a count row at all — which is what keeps a
 * legend table (`| 已发布 · 802.11-2024 | 在 2024 版正文里。 |`) out of the map even though it
 * shares its labels with the totals table.
 *
 * `**` is stripped from both cells: the Wi-Fi table bolds the one row it wants a reader to stop on
 * (「引擎建了，无课」), and a total should not stop being checked because somebody emphasised it.
 */
export function statedCounts(doc: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const line of doc.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue
    const cells = splitCells(line.trim()).map((c) => c.replaceAll('*', '').trim())
    if (cells.length !== 2 || !/^\d+$/.test(cells[1])) continue
    if (!out.has(cells[0])) out.set(cells[0], Number(cells[1]))
  }
  return out
}

/**
 * The header row of every Markdown table of a document, in document order.
 *
 * Exported so each test can assert its document's table CENSUS rather than only its tables'
 * contents. 「Who checks this number?」 has an answer per table, and a table nobody listed is a
 * table whose numbers nobody checks — the shape of defect this pair of files keeps finding. With
 * the census pinned, a new summary table cannot appear without somebody saying which it is.
 */
export const tableHeads = (doc: string): string[][] => tables(doc).map((t) => t.head)

/**
 * `| 量 | 实测 | … |` rows of every table of `doc` whose header row is exactly `head`, as a map
 * from the first cell to the **leading** integer of the second.
 *
 * **Why this exists, and why it is not {@link statedCounts}.** `statedCounts` reads exactly two
 * columns, which is the shape of the three totals tables of the Wi-Fi document and the two of the
 * UWB one. The Wi-Fi document's §17 summary is FOUR columns — 量 / 实测 / 断言在哪 / 余量 — so
 * every figure in it fell outside the only reader there was, and on 2026-10-09 five of its six
 * rows were measured stale: 课数 87 (真 88), 模块数 30 (真 31), 分钟数合计 1 850 (真 1 875),
 * 全课程主路径汉字 191 386 (真 193 882), 场景数 256 (真 264). **All five went stale because of
 * our own slices** — W3 moved the lesson count, the module count and the minute sum in one commit
 * — in the most prominent table of a document that says of itself that none of its figures can
 * rot. A stated figure is worth exactly as much as its check, and this one had none.
 *
 * **The leading integer, deliberately, and not every integer in the cell.** The 实测 cells carry
 * dates and asides (「**191 386**（2026-10-07 重量…）」), and a reader of 「all the integers」
 * would have had 2026 and 10 and 07 handed to it as figures. Leading-integer-only is the rule that
 * makes the figure the thing a reader's eye lands on first, and it is why the document now opens
 * each 实测 cell with its figure. A cell that does NOT open with one yields nothing — which is a
 * hole, so the test that uses this asserts that every row of the matched table yields a figure.
 *
 * Thousands are grouped with an ASCII space throughout both documents (`191 386`), so a group of
 * exactly three digits after a space continues the number; anything else ends it.
 *
 * `**` is stripped the same way {@link statedCounts} strips it, and for the same reason: the table
 * bolds the figures it wants a reader to stop on, and emphasis must not stop a figure being one.
 */
export function statedFigures(doc: string, head: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of tables(doc)) {
    if (t.head.length !== head.length || !t.head.every((c, i) => c === head[i])) continue
    for (const row of t.rows) {
      if (row.length < 2) continue
      const label = row[0].replaceAll('*', '').trim()
      const m = /^\d+(?: \d{3})*/.exec(row[1].replaceAll('*', '').trim())
      if (!m) continue
      if (!out.has(label)) out.set(label, Number(m[0].replaceAll(' ', '')))
    }
  }
  return out
}

/**
 * A Chinese numeral from 〇 to 九十九 as a number, or `null`.
 *
 * Both documents count things about themselves in prose with Chinese numerals — 「十四、『引擎建
 * 了，无课』的**五**条」 heads a table with five rows, and §17 says how many figures its summary
 * table holds. Those are stated numbers like any other, and they rot the same way: that heading
 * read 「九条」 and then 「十三条」 within four days of slices. Reading them is what lets a test
 * compare them instead of a reader.
 */
export function zhNumeral(s: string): number | null {
  const digits = '〇一二三四五六七八九'
  const unit = s.indexOf('十')
  if (unit < 0) {
    const i = digits.indexOf(s)
    return s.length === 1 && i >= 0 ? i : null
  }
  const tens = unit === 0 ? 1 : digits.indexOf(s.slice(0, unit))
  const ones = unit === s.length - 1 ? 0 : digits.indexOf(s.slice(unit + 1))
  if (tens < 1 || ones < 0 || s.slice(unit + 1).length > 1) return null
  return tens * 10 + ones
}
