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
 * `src/player/player.ts` did, in the two commits before this one: something
 * read it as cp1252 and wrote it back as UTF-8, so every non-ASCII character
 * already in the file turned into the Latin-1 reading of its own bytes — 17
 * runs of them, and **four of those runs were the reader's own error banners**.
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
 */
describe('source encoding', () => {
  it('has no double-encoded UTF-8 anywhere under src/ or tests/', () => {
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
