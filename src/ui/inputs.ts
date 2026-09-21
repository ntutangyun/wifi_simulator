/**
 * Helpers shared by every editor number field, in a leaf module so a technology
 * panel under `src/uwb/ui/` can use them without importing the core editor.
 * Like `fmtTime.ts`, this depends on nothing but the language itself.
 */

/**
 * Clamp a number-input value to the schema's bounds. A `<input type="number">`
 * hands back `''` while it is being retyped and `Number('')` is 0, so without
 * this an emptied AMP field would commit a scenario the schema rejects.
 */
export function clampField(raw: string, lo: number, hi: number, int = false): number {
  const n = int ? Math.round(Number(raw)) : Number(raw)
  if (!Number.isFinite(n) || raw.trim() === '') return lo
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Parse a comma-separated list of whole numbers typed into a text field — `"100, 150, 200"` —
 * or `null` when it is not a list the caller's bounds accept: empty, repeated, out of range, or
 * not written as whole numbers. A field that gets `null` keeps the last list that worked rather
 * than committing one the schema would reject on run.
 *
 * Parsing is deliberately strict where `Number` is not. `Number('')` is 0, `Number('1e2')` is
 * 100 and `Number(' 3 ')` is 3; a value the user never typed must not reach a scenario because
 * the field was lenient, so only digits (around any amount of space) are accepted.
 *
 * `lo`/`hi` are inclusive and `maxEntries` caps the list's length.
 */
export function parseIntList(raw: string, lo: number, hi: number, maxEntries: number): number[] | null {
  const parts = raw.split(',').map((s) => s.trim())
  if (parts.length > maxEntries) return null
  const out: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const n = Number(part)
    if (n < lo || n > hi || out.includes(n)) return null
    out.push(n)
  }
  return out
}

/**
 * A backscatter tag's EPC (`AmpTagCfg.epc`, `AmpTagCfg.ts`'s own regex): blank means "derive one
 * from the node id" — `undefined`, the schema's own reading of an absent field — a valid 24-hex-
 * character string commits lower-cased (matching `epcOf`'s own case), and anything else does not
 * parse at all (`null`), so the caller keeps whatever value already worked. Treated exactly like
 * `parseIntList`: a leaf parser a component can unit-test without rendering anything.
 */
export function parseEpc(raw: string): string | undefined | null {
  const t = raw.trim()
  if (t === '') return undefined
  return /^[0-9a-fA-F]{24}$/.test(t) ? t.toLowerCase() : null
}
