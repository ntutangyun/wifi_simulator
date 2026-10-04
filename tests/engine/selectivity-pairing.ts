import { expect } from 'vitest'
import type { FrameDesc, MuPart } from '../../src/model/frames'
import type { TLRecord } from '../../src/model/records'

/**
 * One measure of "which PPDU was this `WIFI_SEL` the decision on", shared by every selectivity
 * test that needs it.
 *
 * It lives in its own file for a reason that cost a real assertion. `selectivity-round.test.ts`
 * and `selectivity-inert.test.ts` each grew their own pairing, and they were not the same
 * measure: the round file looks *backwards* to the `RX_START` that opened the lock, while the
 * inert file looked *forwards* to the `RX_OK` that followed and skipped anything that was not
 * one — so **every member reception that failed was dropped from the population.** Slice 4b is
 * precisely the change that makes a member more likely to fail, so the test auditing the
 * member's bin count was auditing only the survivors. Measured on that file's own scene
 * (`mumimoScenario(false)` + Rayleigh + `selectivity`, 80 ms): 95 members by the forward
 * measure, 98 by this one — the three missing were the failures.
 *
 * The measure itself: `acquireLock` emits `RX_START` with the frame, `resolveLock` finds the
 * lock back by `from`, and a receiver holds at most one lock per sender at a time, so the last
 * `RX_START` for a (node, from) pair is the frame this row judged. It covers failed receptions
 * and successful ones alike, which is the whole point.
 */
export interface SelRow {
  sel: Extract<TLRecord, { type: 'WIFI_SEL' }>
  frame: FrameDesc
  /** This receiver's member entry, absent when it is not addressed in the PPDU. */
  part: MuPart | undefined
}

export function selRows(rs: TLRecord[]): SelRow[] {
  const open = new Map<string, FrameDesc>()
  const out: SelRow[] = []
  for (const r of rs) {
    if (r.type === 'RX_START') open.set(`${r.node}|${r.from}`, r.frame)
    if (r.type !== 'WIFI_SEL') continue
    const frame = open.get(`${r.node}|${r.from}`)
    expect(frame, `WIFI_SEL with no RX_START before it: ${r.node} <- ${r.from}`).toBeDefined()
    out.push({ sel: r, frame: frame!, part: frame!.muParts?.find((p) => p.dst === r.node) })
  }
  return out
}

/**
 * Whether each row's reception was decoded, by the outcome that follows it.
 *
 * Kept separate from `selRows` on purpose: the pairing must not depend on the outcome (that is
 * the bug above), but a test that wants to say "and n of these failed" needs the outcome too.
 */
export function selRowDecoded(rs: TLRecord[], row: SelRow): boolean {
  const i = rs.indexOf(row.sel)
  const outcome = rs.slice(i + 1, i + 4).find((r) => (
    (r.type === 'RX_OK' || r.type === 'RX_FAIL')
    && r.node === row.sel.node && r.from === row.sel.from
  ))
  expect(outcome, `WIFI_SEL with no outcome after it: ${row.sel.node} <- ${row.sel.from}`)
    .toBeDefined()
  return outcome!.type === 'RX_OK'
}
