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
