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
