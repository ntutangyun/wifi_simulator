import type { Ns } from '../model/types'

export type EventFn = () => void

interface HeapItem {
  t: Ns
  seq: number
  handle: number
  fn: EventFn
}

/**
 * Deterministic cancellable event queue: binary min-heap ordered by (t, seq)
 * where seq is insertion order — equal-time events fire in scheduling order.
 */
export class EventQueue {
  private heap: HeapItem[] = []
  private seq = 0
  private nextHandle = 1
  private dead = new Set<number>()

  schedule(t: Ns, fn: EventFn): number {
    const handle = this.nextHandle++
    this.push({ t, seq: this.seq++, handle, fn })
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
    return a.t < b.t || (a.t === b.t && a.seq < b.seq)
  }
}
