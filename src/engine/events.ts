import type { Ns } from '../model/types'

export type EventFn = () => void

interface HeapItem {
  t: Ns
  phase: number
  seq: number
  handle: number
  fn: EventFn
}

/**
 * Deterministic cancellable event queue: binary min-heap ordered by
 * (t, phase, seq); seq is insertion order.
 *
 * Phases model carrier-sense detection delay at equal timestamps:
 *   0 = MAC decisions (slot ticks, IFS expiry, timeouts, SIFS responses)
 *   1 = channel propagation effects (CCA updates, preamble locks, rx outcomes)
 *   2 = post-propagation MAC bookkeeping (own-TX-end handling)
 * A MAC deciding at instant t cannot see a transmission that also starts at t
 * (§17.3.10.6 CCA detect time) — phase ordering makes same-instant transmit
 * decisions genuinely collide.
 */
export class EventQueue {
  private heap: HeapItem[] = []
  private seq = 0
  private nextHandle = 1
  private dead = new Set<number>()

  schedule(t: Ns, fn: EventFn, phase = 0): number {
    const handle = this.nextHandle++
    this.push({ t, phase, seq: this.seq++, handle, fn })
    return handle
  }

  cancel(handle: number): void {
    this.dead.add(handle)
  }

  peekTime(): Ns | null {
    this.discardDead()
    return this.heap.length ? this.heap[0].t : null
  }

  pop(): { t: Ns; fn: EventFn } | null {
    this.discardDead()
    const top = this.popTop()
    if (!top) return null
    return { t: top.t, fn: top.fn }
  }

  get size(): number {
    this.discardDead()
    return this.heap.length
  }

  private discardDead(): void {
    while (this.heap.length && this.dead.has(this.heap[0].handle)) {
      this.dead.delete(this.heap[0].handle)
      this.popTop()
    }
  }

  private push(item: HeapItem): void {
    const h = this.heap
    h.push(item)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.less(h[i], h[p])) {
        ;[h[i], h[p]] = [h[p], h[i]]
        i = p
      } else break
    }
  }

  private popTop(): HeapItem | null {
    const h = this.heap
    if (!h.length) return null
    const top = h[0]
    const last = h.pop()!
    if (h.length) {
      h[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && this.less(h[l], h[m])) m = l
        if (r < h.length && this.less(h[r], h[m])) m = r
        if (m === i) break
        ;[h[i], h[m]] = [h[m], h[i]]
        i = m
      }
    }
    return top
  }

  private less(a: HeapItem, b: HeapItem): boolean {
    if (a.t !== b.t) return a.t < b.t
    if (a.phase !== b.phase) return a.phase < b.phase
    return a.seq < b.seq
  }
}
