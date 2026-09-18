/**
 * Time formatting, in a leaf module of its own so that anything which only needs
 * to print a duration — the UWB event-log lines among them — can have it without
 * importing ui/format.ts, which imports the technology formatters back.
 */
import type { Ns } from '../model/types'

/** "12.345 678 901" — seconds.milli micro nano. */
export function fmtNs(ns: Ns): string {
  const neg = ns < 0
  const v = Math.abs(Math.round(ns))
  const s = Math.floor(v / 1e9)
  const frac = String(v % 1e9).padStart(9, '0')
  return `${neg ? '-' : ''}${s}.${frac.slice(0, 3)} ${frac.slice(3, 6)} ${frac.slice(6, 9)}`
}

export function fmtUs(ns: Ns): string {
  return `${(ns / 1000).toFixed(1)} µs`
}
