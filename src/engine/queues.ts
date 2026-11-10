/**
 * Per-AC transmit queues. For MLO devices one AcQueues instance is shared by
 * the MACs of all links (MLD-level queues): an MSDU claimed by one link is
 * unavailable to the other; failed sets are restored and either link may retry.
 */
import type { Ns } from '../model/types'
import type { Msdu } from './traffic'

/** ns-3 WifiMacQueue MaxSize default: 500 packets per access category. */
export const DEFAULT_QUEUE_LIMIT = 500
/** One time unit (TU), 1024 µs (§3.1). */
export const TU_NS: Ns = 1_024_000
/**
 * dot11EDCATableMSDULifetime / dot11QAPEDCATableMSDULifetime default: 500 TU = 512 ms (Annex C
 * MIB, DEFVAL { 500 }, UNITS "TUs"). A QoS STA starts the timer when the MSDU is passed to the MAC
 * (§10.23.2.12.1). Until 2026-11-11 this was 500 ms, ns-3's WifiMacQueue MaxDelay.
 */
export const DEFAULT_MSDU_LIFETIME_NS: Ns = 500 * TU_NS
/**
 * dot11MaxTransmitMSDULifetime default: 512 TU = 524.288 ms (Annex C MIB, DEFVAL { 512 }). A STA
 * using DCF starts the timer "on the initial attempt to transmit the MSDU" (§10.4), so an MSDU
 * that has never been on the air never expires; the NOTE in §10.23.2.12.1 points out exactly this
 * difference between DCF and EDCA.
 */
export const DEFAULT_MAX_TRANSMIT_MSDU_LIFETIME_NS: Ns = 512 * TU_NS

/** Where an MSDU's transmit timer starts: EDCA at enqueue (§10.23.2.12.1), DCF at its first attempt (§10.4). */
export type LifetimeFrom = 'enqueue' | 'firstTx'

export class AcQueues {
  private q: Msdu[][] = [[], [], [], []]
  /**
   * Transmitter sequence-number spaces (§10.3.2.14.2, Table 10-5): SNS2, one modulo-4096 counter
   * per <Address 1, TID> for individually addressed QoS Data, and SNS1, the single baseline
   * counter for everything else (here: non-QoS Data). It lives with the queues so an MLO device's
   * links share the counters: two links of the same MLD must never hand the same number to
   * different MSDUs.
   */
  private seq = new Map<string, number>()
  /**
   * Receiver duplicate-detection caches (§10.3.2.14.3, Table 10-6): RC2 indexed by
   * <Address 2, TID, sequence number> for QoS Data and RC1 by <Address 2, sequence number> for
   * the rest. The table asks for at least the most recent entry per <Address 2, TID>; this keeps
   * the last 64 — a block ack window — because a retransmitted A-MPDU repeats several MPDUs whose
   * BlockAck was lost, which the recipient's reordering buffer also filters (§10.25.6). Shared by
   * an MLD's links for the same reason as the counters.
   */
  private rxCache = new Map<string, number[]>()

  constructor(readonly limit = DEFAULT_QUEUE_LIMIT) {}

  /** Append an MSDU; false when the access category's queue is full (the arrival is dropped — DROP_NEWEST). */
  enqueue(ac: number, msdu: Msdu): boolean {
    if (this.q[ac].length >= this.limit) return false
    this.q[ac].push(msdu)
    return true
  }

  /**
   * Next sequence number, modulo 4096: from the <Address 1, TID> counter for a QoS Data frame
   * (`tid` given), from the single baseline counter otherwise (`tid` null) — Table 10-5.
   */
  nextSeq(dst: string, tid: number | null): number {
    const key = tid === null ? 'baseline' : `${dst}|${tid}`
    const n = this.seq.get(key) ?? 0
    this.seq.set(key, (n + 1) % 4096)
    return n
  }

  /**
   * Duplicate detection at the receiver (§10.3.2.14.3): records this MPDU and reports whether it
   * is a duplicate — a frame with Retry = 1 whose <TA, TID, SN> is already in the cache. `tid` is
   * null for a non-QoS Data frame (cache RC1).
   */
  rxDuplicate(ta: string, tid: number | null, sn: number, retry: boolean): boolean {
    const key = `${ta}|${tid ?? '-'}`
    const seen = this.rxCache.get(key) ?? []
    if (retry && seen.includes(sn)) return true
    seen.push(sn)
    if (seen.length > 64) seen.shift()
    this.rxCache.set(key, seen)
    return false
  }

  /**
   * Remove and return every MSDU of an access category whose transmit timer exceeds lifetimeNs.
   * `from` says where the timer started: at enqueue (EDCA), or at the MSDU's first transmission
   * attempt (DCF) — an MSDU never yet on the air then has no running timer.
   */
  purgeExpired(ac: number, nowNs: Ns, lifetimeNs: Ns, from: LifetimeFrom = 'enqueue'): Msdu[] {
    const queue = this.q[ac]
    const age = (m: Msdu): Ns => from === 'firstTx'
      ? (m.firstTxNs === undefined ? 0 : nowNs - m.firstTxNs)
      : nowNs - (m.enqueuedNs ?? m.bornNs)
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
