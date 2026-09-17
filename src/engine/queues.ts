/**
 * Per-AC transmit queues. For MLO devices one AcQueues instance is shared by
 * the MACs of all links (MLD-level queues): an MSDU claimed by one link is
 * unavailable to the other; failed sets are restored and either link may retry.
 */
import type { Ns } from '../model/types'
import type { Msdu } from './traffic'

/** ns-3 WifiMacQueue MaxSize default: 500 packets per access category. */
export const DEFAULT_QUEUE_LIMIT = 500
/** ns-3 WifiMacQueue MaxDelay default (dot11EDCATableMSDULifetime role): 500 ms. */
export const DEFAULT_MSDU_LIFETIME_NS: Ns = 500_000_000

export class AcQueues {
  private q: Msdu[][] = [[], [], [], []]
  /**
   * Sequence-number space per (receiver, access category), §10.3.2.14. It lives
   * with the queues so an MLO device's links share one counter per peer: two
   * links of the same MLD must never hand the same number to different MSDUs.
   */
  private seq = new Map<string, number>()

  constructor(readonly limit = DEFAULT_QUEUE_LIMIT) {}

  /** Append an MSDU; false when the access category's queue is full (the arrival is dropped — DROP_NEWEST). */
  enqueue(ac: number, msdu: Msdu): boolean {
    if (this.q[ac].length >= this.limit) return false
    this.q[ac].push(msdu)
    return true
  }

  /** Next sequence number for this receiver and access category, modulo 4096. */
  nextSeq(dst: string, ac: number): number {
    const key = `${dst}|${ac}`
    const n = this.seq.get(key) ?? 0
    this.seq.set(key, (n + 1) % 4096)
    return n
  }

  /** Remove and return every MSDU of an access category queued longer than lifetimeNs. */
  purgeExpired(ac: number, nowNs: Ns, lifetimeNs: Ns): Msdu[] {
    const queue = this.q[ac]
    const age = (m: Msdu): Ns => nowNs - (m.enqueuedNs ?? m.bornNs)
    const expired = queue.filter((m) => age(m) > lifetimeNs)
    if (expired.length) this.q[ac] = queue.filter((m) => age(m) <= lifetimeNs)
    return expired
  }

  depth(ac: number): number {
    return this.q[ac].length
  }

  /** Number of queued MSDUs in an AC whose destination satisfies pred. */
  depthFor(ac: number, pred: (dst: string) => boolean): number {
    let n = 0
    for (const m of this.q[ac]) if (pred(m.dst)) n++
    return n
  }

  depthAll(): number {
    return this.q.reduce((s, x) => s + x.length, 0)
  }

  /** Read-only view of an AC's queue in order (for burst planning). */
  peek(ac: number): readonly Msdu[] {
    return this.q[ac]
  }

  /** First queued MSDU of an AC — the first whose destination satisfies pred, when given. */
  head(ac: number, pred?: (dst: string) => boolean): Msdu | undefined {
    if (!pred) return this.q[ac][0]
    return this.q[ac].find((m) => pred(m.dst))
  }

  /** Byte count of the first queued MSDU for `dst` in an AC, or undefined when none is queued. */
  headBytes(ac: number, dst: string): number | undefined {
    return this.q[ac].find((m) => m.dst === dst)?.bytes
  }

  /** Distinct destinations present in an AC's queue, in order of first appearance. */
  dsts(ac: number, pred?: (dst: string) => boolean): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const m of this.q[ac]) {
      if (pred && !pred(m.dst)) continue
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
