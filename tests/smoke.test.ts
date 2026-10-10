import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('toolchain', () => {
  it('runs', () => expect(1 + 1).toBe(2))
})

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Windows-1252 as the mangler reads it: the standard table for 0x80–0x9F, plus
 * identity for the five byte values the codepage leaves undefined
 * (0x81 0x8D 0x8F 0x90 0x9D), which is what the platform does with them rather
 * than refusing them. Written as code points so that this file cannot itself
 * become the thing it is looking for.
 */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]

/** The cp1252 byte this character came from, or null if it is not one. */
function cp1252Byte(ch: string): number | null {
  const c = ch.codePointAt(0)!
  if (c < 0x80) return c
  if (c >= 0xa0 && c <= 0xff) return c
  const i = CP1252_HIGH.indexOf(c)
  return i < 0 ? null : 0x80 + i
}

/**
 * Does this run of non-ASCII characters *itself* decode as UTF-8 into other
 * non-ASCII text? If it does, it is text that was read as cp1252 and written
 * back as UTF-8: the characters on disk are the bytes of the real ones.
 */
function doubleEncoded(run: string): string | null {
  if (run.length < 2) return null
  const bytes: number[] = []
  for (const ch of run) {
    const b = cp1252Byte(ch)
    if (b === null) return null
    bytes.push(b)
  }
  let out: string
  try {
    out = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return null
  }
  return [...out].some((c) => c.codePointAt(0)! >= 0x80) ? out : null
}

/**
 * The mangled segments of one run of non-ASCII characters.
 *
 * Split first, then test: a whole-run test only fires when the damage happens
 * to be fenced by ASCII on both sides, which is true of a file that was
 * re-encoded entire and false of one sentence inside a healthy string — and the
 * second is the case a planted probe plants. So the run is cut into maximal
 * stretches of characters cp1252 can hold (a real 「停」 cannot be one, and ends
 * the stretch), and each stretch is asked the question separately.
 */
function mangledIn(run: string): string[] {
  const out: string[] = []
  let seg = ''
  for (const ch of [...run, '\0']) {
    if (cp1252Byte(ch) !== null && ch !== '\0') { seg += ch; continue }
    const fixed = doubleEncoded(seg)
    if (fixed !== null) out.push(`${JSON.stringify(seg)} -> ${JSON.stringify(fixed)}`)
    seg = ''
  }
  return out
}

const EXT = ['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.css', '.svg']
const SKIP = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.git'])

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (EXT.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

/**
 * **No shipped source file carries double-encoded UTF-8.**
 *
 * `src/player/player.ts` did: `0732f01` left it read as cp1252 and written back
 * as UTF-8, so every non-ASCII character already in the file turned into the
 * Latin-1 reading of its own bytes — 17 runs of them, and **four of those runs
 * were the reader's own error banners**. `055e734` decoded them back and added
 * this check. (The commits are named rather than counted: this said "the two
 * commits before this one" until 2026-10-10, by which point it was fifteen.)
 * The one for 「仿真进程没有启动，时间无法推进。请刷新页面重试」 shipped as eleven
 * lines of Latin-1 rubble. Nothing noticed: nothing tests the text of a banner
 * that only appears when the worker fails to start, and the rest of the damage
 * was in comments, where every other check in this repository is blind to it.
 *
 * It is cheap to detect and it needs no list of expected strings, because
 * mojibake has a definition: a run of non-ASCII characters whose own cp1252
 * bytes are valid UTF-8 for *different* non-ASCII characters. A legitimate
 * `µs`, `−3 dB`, `▶` or `「载入」` is not one (a lone high byte, or a character
 * cp1252 cannot hold at all), so the rule has no exception list to go stale.
 * Re-encode any file under `src/` or `tests/` and this names the file, the line
 * and what it should have said.
 *
 * `src/` and `tests/` and not the whole tree on purpose: those are the files
 * that ship and the files that pin, and `docs/` is written by hand in parallel
 * with the code.
 *
 * **This is a net, not a hand check, and `docs/course-wording-contract.md` §9
 * says why both are owed.** That section holds the rule this check cannot carry
 * — after writing a file that contains Chinese, read it back out of git once the
 * commit exists — together with the three things this check does not see: it
 * fires only on a run that reaches this file, it walks neither `docs/` nor
 * `.superpowers/` (almost entirely Chinese), and double encoding is the only
 * damage it knows. The incident above is written up there as the worked example.
 */
const ENCODING_TEST = 'has no double-encoded UTF-8 anywhere under src/ or tests/'

describe('source encoding', () => {
  /**
   * The two pointers of §9 name each other, and neither may be dropped alone.
   *
   * A rule that lives in one place only is a rule that will be lost: this one lived in the
   * controller's per-slice brief until 2026-10-10, where a new session simply would not have
   * found it. It now lives in the contract, and the contract and this check indict each other —
   * the section names this test by its exact title, the docblock above names the section. Delete
   * either half and this goes red, which is the point: a check with no written-down rule beside
   * it reads as arbitrary, and a written-down rule with no check beside it goes stale.
   *
   * It asserts the pointers, not the prose. §9's advice is for a person to read, and asserting
   * sentences of it here would be the second-copy defect this repository keeps paying for.
   */
  it('and §9 of the wording contract and this file point at each other', () => {
    const doc = readFileSync(join(ROOT, 'docs/course-wording-contract.md'), 'utf8')
    const self = readFileSync(join(ROOT, 'tests/smoke.test.ts'), 'utf8')
    expect(doc, 'docs/course-wording-contract.md has lost its §9 heading')
      .toContain('## 9. 写完含中文的文件，提交后要从 git 里读回来')
    expect(doc, `§9 must name this test by title, and the title is now "${ENCODING_TEST}"`)
      .toContain(ENCODING_TEST)
    expect(self, 'this file must name the section that holds the rule it cannot enforce')
      .toContain('docs/course-wording-contract.md` §9')
  })

  it(ENCODING_TEST, () => {
    const files = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'tests'))]
    // The census the claim rests on: if the walk stopped finding files it would
    // pass by looking at nothing.
    expect(files.length).toBeGreaterThan(200)
    const found: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/[^\x00-\x7f]+/g)) {
        const hits = mangledIn(m[0])
        if (hits.length === 0) continue
        const line = text.slice(0, m.index).split('\n').length
        for (const h of hits) found.push(`${f.slice(ROOT.length)}:${line} ${h}`)
      }
    }
    expect(found).toEqual([])
  })
})

/**
 * **A measurement written in one file about the cost of two others, kept from going stale.**
 *
 * `tests/simCost.ts` bounds the suite's SIMULATED work (`EVENT_CEILING`). On 2026-10-10 the
 * other half — the 98 files that execute no engine events at all — was measured rather than
 * argued about, by truncating the lesson corpus to 90, 45 and 23 lessons and timing the same
 * files three times. Most of that half tracks the corpus and is therefore already bounded by
 * the corpus clamps; the section "THE OTHER HALF" in that file's header has the table.
 *
 * Two files are the exception, and they are the reason this check exists. Their cost is flat
 * across a four-fold change in corpus because it is a loop count somebody typed: `TRIALS` in
 * `tests/engine/selectivity.test.ts` and `N` in `tests/engine/fading-stats.test.ts`. Nothing
 * in the repository bounds either, deliberately — a wall-clock assertion is the wrong
 * instrument (the argument is at the top of `tests/simCost.ts`) and there is no deterministic
 * count of non-engine work to put a ceiling on.
 *
 * **So this is a citation check and NOT a second budget, and the difference matters.** It
 * does not say the numbers are right or that they may not grow. It says the written
 * measurement must still describe the files it is about. Raising one of those constants is
 * allowed; raising it while `simCost.ts` still quotes the old figure is not, because the next
 * person to read that section would be reading a measurement of a suite that no longer
 * exists. Both figures are read out of the files themselves, so nothing here is hard-coded —
 * the same shape as the `statedCounts` and `statedFigures` rulers over the course.
 */
describe("the cost ceiling's written measurement", () => {
  const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')
  const constant = (file: string, name: string): string => {
    const m = new RegExp(`const ${name} = ([0-9_]+)`).exec(read(file))
    expect(m, `${file} no longer declares \`const ${name} = <number>\``).not.toBeNull()
    return m![1]
  }

  it('still quotes the two unbounded loop counts as those two files declare them', () => {
    const cost = read('tests/simCost.ts')
    for (const [file, name] of [
      ['tests/engine/selectivity.test.ts', 'TRIALS'],
      ['tests/engine/fading-stats.test.ts', 'N'],
    ] as const) {
      const value = constant(file, name)
      expect(cost, `tests/simCost.ts quotes ${name} for ${file}, but that file now says`
        + ` ${name} = ${value}. Raising a loop count is allowed and nothing here bounds it —`
        + ' what is not allowed is leaving the measurement in `simCost.ts` describing a suite'
        + ' that no longer exists. Update the figure, and the seconds beside it, in the'
        + ' section "THE OTHER HALF".')
        .toContain(`${name} = ${value}`)
    }
  })

  it('and the two files it names are still there to be measured', () => {
    const cost = read('tests/simCost.ts')
    for (const file of ['tests/engine/selectivity.test.ts', 'tests/engine/fading-stats.test.ts']) {
      expect(cost, 'the measurement must name the file it measured').toContain(file)
      expect(() => read(file), `${file} is cited by tests/simCost.ts and is gone`).not.toThrow()
    }
  })
})
