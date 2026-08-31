/**
 * Per-AC transmit queues. For MLO devices one AcQueues instance is shared by
 * the MACs of all links (MLD-level queues): an MSDU claimed by one link is
 * unavailable to the other; failed sets are restored and either link may retry.
 */
import type { Msdu } from './traffic'

export class AcQueues {
  private q: Msdu[][] = [[], [], [], []]

  enqueue(ac: number, msdu: Msdu): void {
    this.q[ac].push(msdu)
  }

  depth(ac: number): number {
    return this.q[ac].length
  }

  depthAll(): number {
    return this.q.reduce((s, x) => s + x.length, 0)
  }

  head(ac: number): Msdu | undefined {
    return this.q[ac][0]
  }

  /** Distinct destinations present in an AC's queue, in order of first appearance. */
  dsts(ac: number): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const m of this.q[ac]) {
      if (!seen.has(m.dst)) {
        seen.add(m.dst)
        out.push(m.dst)
      }
    }
    return out
  }

  /**
   * Remove and return up to maxCount MSDUs for `dst` (or the head's dst when
   * null), stopping when fits() reports the budget is exhausted.
   */
  claim(ac: number, dst: string | null, maxCount: number, fits: (m: Msdu, claimed: Msdu[]) => boolean): Msdu[] {
    const queue = this.q[ac]
    const target = dst ?? queue[0]?.dst
    if (!target) return []
    const out: Msdu[] = []
    for (let i = 0; i < queue.length && out.length < maxCount; ) {
      const m = queue[i]
      if (m.dst === target && fits(m, out)) {
        out.push(m)
        queue.splice(i, 1)
      } else if (m.dst === target && out.length === 0) {
        // head frame must always be claimable alone
        out.push(m)
        queue.splice(i, 1)
        break
      } else if (m.dst === target) {
        break
      } else {
        i++
      }
    }
    return out
  }

  /** Return failed MSDUs to the front (retry position). */
  restore(ac: number, msdus: Msdu[]): void {
    this.q[ac].unshift(...msdus)
  }

  all(): { ac: number; msdu: Msdu }[] {
    const out: { ac: number; msdu: Msdu }[] = []
    this.q.forEach((list, ac) => list.forEach((msdu) => out.push({ ac, msdu })))
    return out
  }
}
