/**
 * Shared RSSI helper for the lesson tests.
 *
 * `buildLinkTable` is band-neutral: it returns free-space + wall loss with no
 * band offset. The engine applies the per-band offset when it builds each
 * link's channel (`LINK_EXTRA_LOSS_DB`, src/engine/simulation.ts —
 * `row.set(k, v - extra)`), so a lesson that quotes a dBm figure is quoting the
 * value *on its link*, not the band-neutral one. Every lesson test goes through
 * `rssiOn` so the offset can never be forgotten again.
 */
import { LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import type { LinkId } from '../../src/model/caps'

export type LinkTable = Map<string, Map<string, number>>

/** RSSI in dBm at `to` of a transmission by `from`, as the `link` channel sees it. */
export function rssiOn(link: LinkId, table: LinkTable, from: string, to: string): number {
  const v = table.get(from)?.get(to)
  if (v === undefined) throw new Error(`no link-table entry ${from} -> ${to}`)
  return v - LINK_EXTRA_LOSS_DB[link]
}
