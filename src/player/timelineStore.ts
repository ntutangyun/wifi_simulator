/**
 * Buffer of timeline records + snapshots with a sliding window.
 * All lookups are pure; the Player drives trimming and ingestion.
 */
import type { Batch } from '../engine/simulation'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'
import { applyRecord, cloneView, type Snapshot, type ViewState } from '../model/view'

export class TimelineStore {
  private records: TLRecord[] = []
  private snapshots: Snapshot[] = []
  frontierNs: Ns = 0

  get windowStartNs(): Ns {
    return this.snapshots.length ? this.snapshots[0].t : 0
  }

  get recordCount(): number {
    return this.records.length
  }

  ingest(b: Batch): void {
    this.records.push(...b.records)
    this.snapshots.push(...b.snapshots)
    this.frontierNs = Math.max(this.frontierNs, b.frontierNs)
  }

  /** Drop history before t, keeping the newest snapshot ≤ t as the window base. */
  trimBefore(t: Ns): void {
    const si = this.lastSnapshotIndexAtOrBefore(t)
    if (si <= 0) return
    const base = this.snapshots[si]
    this.snapshots = this.snapshots.slice(si)
    const ri = lowerBoundByTime(this.records, base.t)
    // keep records strictly after the base snapshot time (those ≤ base.t are baked in)
    let k = ri
    while (k < this.records.length && this.records[k].t <= base.t) k++
    this.records = this.records.slice(k)
  }

  /** Reconstruct the complete ViewState at time t (nearest snapshot + replay). */
  viewAt(t: Ns): ViewState | null {
    const si = this.lastSnapshotIndexAtOrBefore(t)
    if (si < 0) return null
    const snap = this.snapshots[si]
    const vs = cloneView(snap.view)
    const start = lowerBoundByTime(this.records, snap.t)
    for (let i = start; i < this.records.length; i++) {
      const r = this.records[i]
      if (r.t > t) break
      if (r.t <= snap.t) continue
      applyRecord(vs, r)
    }
    vs.t = t
    return vs
  }

  recordsIn(a: Ns, b: Ns): TLRecord[] {
    const start = lowerBoundByTime(this.records, a)
    const out: TLRecord[] = []
    for (let i = start; i < this.records.length; i++) {
      const r = this.records[i]
      if (r.t > b) break
      out.push(r)
    }
    return out
  }

  /** Time of the first buffered record matching pred (course jump-to targets). */
  findFirstTime(pred: (r: TLRecord) => boolean): Ns | null {
    for (const r of this.records) {
      if (pred(r)) return r.t
    }
    return null
  }

  nextRecordTime(t: Ns): Ns | null {
    let lo = lowerBoundByTime(this.records, t)
    while (lo < this.records.length && this.records[lo].t <= t) lo++
    return lo < this.records.length ? this.records[lo].t : null
  }

  prevRecordTime(t: Ns): Ns | null {
    let i = lowerBoundByTime(this.records, t) - 1
    // lowerBound gives first ≥ t; walk back to last < t
    while (i + 1 < this.records.length && this.records[i + 1].t < t) i++
    return i >= 0 ? this.records[i].t : null
  }

  /** Next start of a frame exchange (data or rts TX_START) strictly after t. */
  nextExchangeTime(t: Ns): Ns | null {
    for (const r of this.records) {
      if (r.t > t && r.type === 'TX_START' && (r.frame.kind === 'data' || r.frame.kind === 'rts')) return r.t
    }
    return null
  }

  prevExchangeTime(t: Ns): Ns | null {
    let best: Ns | null = null
    for (const r of this.records) {
      if (r.t >= t) break
      if (r.type === 'TX_START' && (r.frame.kind === 'data' || r.frame.kind === 'rts')) best = r.t
    }
    return best
  }

  private lastSnapshotIndexAtOrBefore(t: Ns): number {
    let best = -1
    for (let i = 0; i < this.snapshots.length; i++) {
      if (this.snapshots[i].t <= t) best = i
      else break
    }
    return best
  }
}

/** First index whose record time is ≥ t (records are time-ordered). */
function lowerBoundByTime(records: TLRecord[], t: Ns): number {
  let lo = 0
  let hi = records.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (records[mid].t < t) lo = mid + 1
    else hi = mid
  }
  return lo
}
