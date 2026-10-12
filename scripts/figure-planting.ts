/**
 * **Which figures a lesson prints can be edited with the suite still green.**
 *
 * `tests/course/prose-readback.test.ts` pins that every lesson test at least *looks* at the words
 * its lesson prints. That is a necessary condition and not a sufficient one — no syntactic check
 * can tell 「compared」 from 「mentioned」, and the check says so in its own docblock. This script
 * is the sufficient one, and it is not a check but a measurement: plant one edit per printed
 * figure, run the lesson's own test, and record which plantings the suite does not notice.
 *
 * It exists because planting found two assertions in `@rate` that looked like pins and pinned
 * nothing — `mcsForRssi(rssi, cap, 20) === cap` holds for any cap at or below what the signal
 * supports, so the lesson's MCS 11 could be edited to MCS 10 and stay green. Nothing but a
 * planting separates a pin from a pass-through.
 *
 * ```
 * npx tsx scripts/figure-planting.ts --census            # every lesson, figures by exposure
 * npx tsx scripts/figure-planting.ts ifs --list          # what one lesson prints, planting nothing
 * npx tsx scripts/figure-planting.ts ifs                 # sweep one lesson
 * npx tsx scripts/figure-planting.ts mumimo tests/course/quoted-timestamps.test.ts
 * ```
 *
 * **What counts as a printed figure.** The strings come from `lessonTexts`, the course's own walk
 * over what a reader reads, so a node id, a lane key or an enum value is never one. The offset
 * comes from finding that string in the lesson's module file, which also drops every figure that
 * is interpolated from a constant — those cannot drift, and they were the first of the three
 * false-positive classes the 2026-10-12 sweep ran into (the others being trailing zeros and
 * read-and-compare pins, which hold no literal at all).
 *
 * **Citations are counted separately and not planted by default.** A clause number, a document
 * number or a chapter has nothing in this repository to be checked against, so a green planting
 * there says nothing; `--cites` plants them anyway, for the lessons whose tests cross-check them.
 *
 * **The lesson file is restored after every single run**, and the sweep refuses to start unless
 * the tests are green to begin with, so an interrupted sweep leaves a visible planting rather
 * than a silent one. Run one sweep at a time: two sweeps on one file would restore each other's
 * plantings, which is how a wrong figure got committed on 2026-10-11.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LESSONS } from '../src/course/lessons'
import { isMigrated, type Lesson } from '../src/course/lessonKit'
import { lessonTexts } from '../src/course/readability'

const ROOT = resolve(import.meta.dirname, '..')
const COURSE = resolve(ROOT, 'src/course')

/** A figure a reader reads, and where it is written. */
interface Figure {
  id: string
  /** The lesson's module file, relative to the repository root. */
  file: string
  /** Character offset of the figure in that file, as `readFileSync` returns it. */
  at: number
  fig: string
  section: string
  role: string
  /** A citation or a name rather than a measurable figure: not planted by default. */
  cite: boolean
  ctx: string
}

/** A clause, a chapter, a document number: nothing here can check one. */
const CITE = /(§|第|IEEE|Std|Table|802\.11|r\d\b|15-\d|11-\d|ANSI|FiRa|JSAC|INFOCOM)/
/**
 * The same, judged by what FOLLOWS the figure: a working-document number (`11-24/1613r20`,
 * `15-24/0123r4`), a draft version (`D1.0`) and a date (「2026 年」, 「5 月」). All three are
 * claims about documents outside this repository, and a sweep that plants them asks a question
 * nothing here can answer.
 */
const CITE_AFTER = /^(-\d\d\/\d{3,4}r\d|-\d\d(?!\d)|\s?年|\s?月|\.\d\s*(将|于|发布))/

/**
 * **A digit inside a name is not a figure.** 「Wi-Fi 6」, 「4096-QAM」, 「802.11ac」 and
 * 「第 36 章」 cannot be off by one — they can only be the wrong name, which is what
 * `tests/course/wording.test.ts` and the glossary rules are for. Measured on the first two
 * sweeps: `@nav`'s only two 「unpinned」 figures were both the 6 of Wi-Fi 6, and a sweep whose
 * output has to be read past is a sweep nobody reads.
 */
// `#` for a link id written as a suffix (`sta-1#6g`, where the 6 is a band and not a count).
// `D` for a draft version (`D1.0`, `D05`): the figure is part of the document's name.
// `SP` / `sp` for the 4ab draft's packet types: **42 of the 157 figures `@uwb-uwbd` appeared to
// print were the 0 in 「SP0」** — a quarter of that lesson — and a lesson that wrote 「SP1」 where
// it means SP0 would be wrong about a word, not about a quantity. No word boundary on it: the
// same name is inside the identifiers that lesson cites (`MMS_SP0_NS`, `makeSp0Poll`), where a
// `\b` after `_` or after a lower-case letter does not hold.
// `Gen` for `EPC Gen2`, the name of the air interface `@amp-backscatter` inventories with, and
// `RN` for `RN16`, the draft's name for the tag's random number — the lesson prints 「16 位随机数
// RN16」, where the first 16 is a width (a figure, and read as one) and the second is the name.
const NAME_BEFORE = /(Wi-Fi |Wi‑Fi |802\.11|MU-MIMO |-|#|D|dot|TG|[Ss][Pp]|Gen|RN)$/
// `-2024` for a standard's year (「802.11-2024 的 5956 页」) and `× LTF` for a training-field
// multiplier: both measured, like the Wi-Fi 6 case, from a sweep whose output they cluttered.
// `D` for the name of a view (「3D 视图」): the 3 is a dimension count in a product name, and a
// lesson that wrote 「4D 视图」 would be wrong about a word, not about a quantity.
const NAME_AFTER =
  /^(-QAM|QAM|-FSK|-PSK|ac\b|ax\b|be\b|bn\b|bp\b|az\b|z\b|n\b|-20\d\d|\s?×\s?LTF|D\b)/

function allFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = resolve(dir, n)
    if (statSync(p).isDirectory()) allFiles(p, out)
    else if (n.endsWith('.ts')) out.push(p)
  }
  return out
}

const sources = allFiles(COURSE).map((p) => ({ p, src: readFileSync(p, 'utf8') }))
const moduleOf = (id: string) => sources.find((f) => f.src.includes(`id: '${id}'`)) ?? null

function figuresOf(l: Lesson): { figures: Figure[]; skipped: number } {
  const mod = moduleOf(l.id)
  if (!mod) return { figures: [], skipped: 0 }
  const figures: Figure[] = []
  let skipped = 0
  for (const t of lessonTexts(l)) {
    if (!/\d/.test(t.text)) continue
    const at = mod.src.indexOf(t.text)
    // Not in the file as written (interpolated), or written twice (the offset would be a guess).
    if (at === -1 || mod.src.indexOf(t.text, at + 1) !== -1) { skipped++; continue }
    // A space is a thousands separator in this course's prose (「1 536 B」, 「250 250 字节」), so
    // the grouped form is matched first — otherwise 「1 536」 counts as two figures and planting
    // its leading digit asks a question nobody wrote.
    for (const m of t.text.matchAll(/\d{1,3}(?: \d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)*/g)) {
      const before = t.text.slice(Math.max(0, m.index - 16), m.index)
      const after = t.text.slice(m.index + m[0].length, m.index + m[0].length + 12)
      figures.push({
        id: l.id,
        file: mod.p.slice(ROOT.length + 1).replace(/\\/g, '/'),
        at: at + m.index,
        fig: m[0],
        section: t.section,
        role: t.role,
        // `802.11` and `802.15.4` are the standards' own names wherever they appear, including
        // as the whole figure (「真实的 802.11 承载 IP 时」, 「全部来自 P802.15.4ab」), which
        // neither context test can see.
        cite: CITE.test(before) || CITE_AFTER.test(after) || m[0].startsWith('802.')
          || NAME_BEFORE.test(before) || NAME_AFTER.test(after),
        ctx: `${before}⟦${m[0]}⟧${after}`.replace(/\s+/g, ' '),
      })
    }
  }
  return { figures, skipped }
}

const migrated = LESSONS.filter(isMigrated)

/*
 * The two rules added on 2026-10-13, both found by a sweep reporting a citation as unpinned:
 *  - `JSAC` and `INFOCOM` join the journals and standards bodies, because 「IEEE JSAC 18(3):
 *    535–547，2000」 and 「Wu 等人（INFOCOM 2002）」 are references — `@bianchi` prints five
 *    figures of them and this repository has no corpus for any of them.
 *  - a figure immediately followed by `-NN` is a clause or equation number: 「按式 17-29」. The
 *    rule is on what FOLLOWS, not on the 「式」 before it, because 「路径损耗公式 46.7」 is a model
 *    value and reads the same way on the left.
 */

/**
 * **Every numeric literal anywhere under `tests/`, at every scale a unit change could put it.**
 *
 * A sweep plants against ONE lesson's test file, because planting against the whole suite is
 * ninety seconds a figure. So a figure it reports as unpinned might still be pinned next door —
 * `tests/course/quoted-timestamps.test.ts` owns several lessons' quoted instants, and
 * `lesson-claims.test.ts` owns cross-lesson claims. This is the cheap half of the answer: a
 * figure whose value appears as a literal NOWHERE in `tests/`, at any of the scales a unit
 * change could put it (µs printed, ns asserted), is pinned by nothing at all. The converse is
 * not evidence — an equal literal may be a coincidence — so the column is named for what it is.
 *
 * **And the first real defect this script found was in the 「maybe」 column, which is why that
 * column is never the stopping point.** `@airtime`'s `limits` said 「本轮 254 个回答一个不差」;
 * the scene answers 116 times in the window the lesson counts everything else over, and 254 is
 * `@ifs`'s saturated uploader. The sweep marked it 「maybe」 because 254 does appear in `tests/`
 * — as `@rate-fallback`'s ACK timeouts, an unrelated quantity in an unrelated lesson. Read the
 * whole list, not the last column.
 */
function testLiterals(): Set<number> {
  const out = new Set<number>()
  const walk = (dir: string): void => {
    for (const n of readdirSync(dir)) {
      const p = resolve(dir, n)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|tsx|json)$/.test(n)) continue
      for (const m of readFileSync(p, 'utf8').matchAll(/\d[\d_,]*(?:\.\d+)?/g)) {
        const v = Number(m[0].replace(/[_,]/g, ''))
        if (Number.isFinite(v)) out.add(v)
      }
    }
  }
  walk(resolve(ROOT, 'tests'))
  return out
}

const SCALES = [1, 1e-3, 1e-2, 1e-1, 10, 100, 1e3, 1e6, 1e9]
const literalSomewhere = (lits: Set<number>, fig: string): boolean => {
  const v = Number(fig.replace(/,/g, ''))
  if (!Number.isFinite(v)) return false
  return SCALES.some((s) => {
    const x = v * s
    // a scaled value is only a candidate when the scaling is exact in the first place
    return Number.isInteger(x * 1e6) && lits.has(Number(x.toFixed(6)))
  })
}

if (process.argv[2] === '--census') {
  const rows = migrated.map((l) => {
    const { figures, skipped } = figuresOf(l)
    return {
      id: l.id,
      figs: figures.filter((f) => !f.cite).length,
      cites: figures.filter((f) => f.cite).length,
      skipped,
    }
  }).sort((a, b) => b.figs - a.figs)
  console.log('figures  cites  built   lesson')
  for (const r of rows) {
    console.log(String(r.figs).padStart(7), String(r.cites).padStart(6), String(r.skipped).padStart(6),
      '  ', r.id)
  }
  console.log('')
  console.log('totals', rows.reduce((s, r) => s + r.figs, 0), 'figures,',
    rows.reduce((s, r) => s + r.cites, 0), 'citations,',
    rows.reduce((s, r) => s + r.skipped, 0), 'strings built rather than typed,',
    'across', rows.length, 'lessons')
  process.exit(0)
}

const id = process.argv[2]
const lesson = migrated.find((l) => l.id === id)
if (!lesson) throw new Error(`\`${id}\` is not a migrated lesson. Try --census.`)

const plantCites = process.argv.includes('--cites')
const extra = process.argv.slice(3).filter((a) => !a.startsWith('--'))
const own = `tests/course/${id}.test.ts`

/**
 * **The files that could pin this lesson's figures are the ones its own test names.** Every
 * lesson test in this course declares the neighbours that hold its claims — 「`quoted-timestamps`
 * owns the two quoted sends' timestamps」, 「the originals stay where they are」 — so the set is
 * read out of the test file rather than guessed. Grepping for the lesson's name instead is
 * useless: 「airtime」 appears in 77 test files, most of them in English prose.
 *
 * A figure pinned by a file that nothing declares is a finding of its own: a pin nobody knows
 * about is a pin the next author will delete. `--wide` adds files on the command line for
 * checking exactly that.
 */
const declared = (): string[] => {
  const src = readFileSync(resolve(ROOT, own), 'utf8')
  return [...new Set([...src.matchAll(/tests\/[a-z0-9/_-]+\.test\.ts/g)].map((m) => m[0]))]
    .filter((p) => p !== own && existsSync(resolve(ROOT, p)))
}

const tests = [own, ...(process.argv.includes('--own') ? [] : declared()), ...extra]
for (const t of tests) {
  if (!existsSync(resolve(ROOT, t))) throw new Error(`${t} does not exist`)
}

const { figures } = figuresOf(lesson)
let mine = figures.filter((f) => plantCites || !f.cite)
/**
 * `--sample N` plants N evenly spaced figures instead of all of them: the sweep of one lesson
 * costs a run per figure, so ranking 91 lessons by what they leave unread costs a day. A sample
 * of six ranks them in minutes and says what it is — an estimate of the rate, not a clean bill.
 * Evenly spaced rather than random, so two runs of the same lesson plant the same figures and
 * the ledger they write is reproducible.
 */
const sampleArg = process.argv.find((a) => a.startsWith('--sample'))
if (sampleArg) {
  const k = Number(sampleArg.split('=')[1] ?? process.argv[process.argv.indexOf(sampleArg) + 1] ?? 6)
  if (Number.isFinite(k) && k > 0 && k < mine.length) {
    const step = mine.length / k
    mine = Array.from({ length: k }, (_, i) => mine[Math.floor(i * step)])
  }
}
// `--saved` re-plants only what a previous run reported, which is how a cheap first pass
// (`--own`) is followed by an expensive one over its candidates alone.
if (process.argv.includes('--saved')) {
  const p = resolve(ROOT, `probes.local/unpinned-${id}.json`)
  if (!existsSync(p)) throw new Error(`${p} does not exist; run a sweep without --saved first`)
  const saved = new Set((JSON.parse(readFileSync(p, 'utf8')) as Figure[]).map((f) => f.at))
  mine = mine.filter((f) => saved.has(f.at))
}
/**
 * **Two reader-visible strings can be the same literal in the source.** `@radio-primer` prints
 * 67.7 as a cell of its four-place table AND as a label of the figure that is built from that
 * table, and the module file holds the string once — so `lessonTexts` yields two texts whose
 * offsets are the same. A planting is per SOURCE SITE, so the second one is dropped.
 *
 * Found by the whole-set probe below, which plants every figure in one file and threw
 * `offset drifted at 5978: found 67.8` — the first replacement had already moved the digit the
 * second was about to check. It threw before writing, so nothing was left planted; the sweep
 * simply could not run on that lesson until this.
 */
const sites = new Map<number, Figure>()
for (const f of mine) if (!sites.has(f.at)) sites.set(f.at, f)
const shared = mine.length - sites.size
mine = [...sites.values()]

if (mine.length === 0) throw new Error(`no printed figures found for \`${id}\``)

/**
 * `--list` prints the figures and plants nothing — the list a read-back is written against.
 * Writing one lesson's reads takes the whole list in front of you (「this figure is printed four
 * times, that one is a draft range with nothing to check it」), and a sweep is twelve minutes.
 * Before this existed the list was produced by a throwaway script, three times in one session.
 */
if (process.argv.includes('--list')) {
  for (const [i, f] of mine.entries()) {
    console.log(String(i + 1).padStart(4), f.section.padEnd(13), f.role.padEnd(6),
      f.fig.padStart(9), ' ', f.ctx)
  }
  console.log(`${id}: ${mine.length} plantable figures`,
    `(${figures.length - mine.length - shared} citations and names`
    + (shared > 0 ? `, ${shared} printed twice from one literal)` : ')'))
  process.exit(0)
}

const file = resolve(ROOT, mine[0].file)
const orig = readFileSync(file, 'utf8')

/** The source with the last digit of each figure in `subset` moved by one. */
function planted(subset: Figure[]): string {
  let s = orig
  for (const f of [...subset].sort((a, b) => b.at - a.at)) {
    const end = f.at + f.fig.length
    if (s.slice(f.at, end) !== f.fig) {
      throw new Error(`offset drifted at ${f.at}: found \`${s.slice(f.at, end)}\``)
    }
    const d = s[end - 1]
    s = `${s.slice(0, end - 1)}${d === '9' ? '8' : String(Number(d) + 1)}${s.slice(end)}`
  }
  return s
}

let runs = 0
/**
 * Vitest's own entry point rather than `npx vitest`: no shell (which `npx` needs on Windows,
 * and which node deprecates for argument injection), and no npx resolution on each of the
 * hundreds of runs a sweep makes.
 */
const VITEST = resolve(ROOT, 'node_modules/vitest/vitest.mjs')
const green = (): boolean => {
  const r = spawnSync(process.execPath, [VITEST, 'run', ...tests, '--reporter=basic'],
    { cwd: ROOT, stdio: 'ignore' })
  return r.status === 0
}
const notices = (subset: Figure[]): boolean => {
  writeFileSync(file, planted(subset))
  runs++
  const ok = green()
  writeFileSync(file, orig)
  return !ok
}

if (!green()) throw new Error('the tests are already red; nothing to measure')
console.log(`${id}: ${mine.length} printed figures in ${mine[0].file}`
  + (shared > 0 ? ` (${shared} more printed twice from the same literal)` : ''))
console.log(`         against ${tests.join(' ')}`)

// One run for the whole set first: a lesson nothing pins is answered by it alone. Then one run
// per figure, which is cheaper than bisecting whenever most figures ARE pinned — measured on
// `@ifs`, 27 runs this way against 51 for a bisection.
let unpinned: Figure[] = []
if (!notices(mine)) {
  unpinned = [...mine]
  console.log('  the whole set is green: this lesson pins none of its own figures')
} else {
  for (const [i, f] of mine.entries()) {
    if (notices([f])) continue
    unpinned.push(f)
    console.log(`  green at ${f.fig} (${i + 1}/${mine.length}, ${runs} runs)`)
  }
}

if (readFileSync(file, 'utf8') !== orig) throw new Error(`${mine[0].file} was not restored`)
writeFileSync(resolve(ROOT, `probes.local/unpinned-${id}.json`), JSON.stringify(unpinned, null, 1))
const lits = testLiterals()
const nowhere = unpinned.filter((f) => !literalSomewhere(lits, f.fig))
console.log(`${id}: ${unpinned.length} of ${mine.length} figures unpinned by its own test, in `
  + `${runs} runs; ${nowhere.length} of those have no equal literal anywhere under tests/`)
for (const f of unpinned.sort((a, b) => a.at - b.at)) {
  const mark = literalSomewhere(lits, f.fig) ? 'maybe   ' : 'UNPINNED'
  console.log(`  ${mark} ${f.section.padStart(9)} ${f.role.padEnd(6)} ${f.fig.padStart(9)}  ${f.ctx}`)
}
console.log('restored; final check', green() ? 'green' : 'RED')
