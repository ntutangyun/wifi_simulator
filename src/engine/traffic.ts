/**
 * Per-STA traffic profiles generating MSDUs as deterministic arrival events.
 * DL profiles enqueue at the AP (dst = STA); UL profiles enqueue at the STA.
 */
import type { ProfileId } from '../model/scenario'
import type { Ns } from '../model/types'
import { EventQueue } from './events'
import { Rng } from './rng'

export interface Msdu {
  id: number
  bytes: number
  src: string
  dst: string
  bornNs: Ns
}

export type EnqueueFn = (atNode: string, msdu: Msdu) => void

let nextMsduId = 1
/** Reset between simulations for determinism. */
export function resetMsduIds(): void {
  nextMsduId = 1
}

/** EDCA access category for a traffic profile (§10.2.4.2 UP→AC mapping spirit). */
export function acForProfile(profile: ProfileId): number {
  switch (profile) {
    case 'voice': return 3 // AC_VO
    case 'video': return 2 // AC_VI
    case 'browsing':
    case 'saturated': return 1 // AC_BE
    case 'backup':
    case 'iot':
    case 'idle': return 0 // AC_BK
  }
}

const MS = 1_000_000
const US = 1_000

export class TrafficSource {

  constructor(
    private q: EventQueue,
    private now: () => Ns,
    private rng: Rng,
    private staId: string,
    private apId: string,
    private profile: ProfileId,
    private enqueue: EnqueueFn,
  ) {}

  start(): void {
    switch (this.profile) {
      case 'video':
        this.scheduleVideo(0)
        break
      case 'voice':
        this.scheduleVoice()
        break
      case 'backup':
        this.q.schedule(Math.floor(this.rng.next() * 60 * MS), () => this.backupBurst())
        break
      case 'browsing':
        this.scheduleBrowsing()
        break
      case 'iot':
        this.scheduleIot()
        break
      case 'saturated':
        this.q.schedule(0, () => {
          for (let i = 0; i < 20; i++) this.emitUl(1500)
        })
        break
      case 'idle':
        break
    }
  }

  /** Saturated profile: Simulation calls this on every DEQUEUE at the STA to keep the queue full. */
  refill(): void {
    if (this.profile !== 'saturated') return
    this.emitUl(1500)
  }

  private emitUl(bytes: number): void {
    this.enqueue(this.staId, { id: nextMsduId++, bytes, src: this.staId, dst: this.apId, bornNs: this.now() })
  }

  private emitDl(bytes: number): void {
    this.enqueue(this.apId, { id: nextMsduId++, bytes, src: this.apId, dst: this.staId, bornNs: this.now() })
  }

  /** ~15 Mbps DL: 1400 B every 747 µs + uniform jitter [0, 200] µs. */
  private scheduleVideo(t: Ns): void {
    const next = t + 747 * US + Math.floor(this.rng.next() * 200 * US)
    this.q.schedule(next, () => {
      this.emitDl(1400)
      this.scheduleVideo(next)
    })
  }

  /** Bidirectional 200 B every 20 ms (VoIP-like). */
  private scheduleVoice(): void {
    const at = this.now() + 20 * MS + Math.floor(this.rng.next() * 2 * MS)
    this.q.schedule(at, () => {
      this.emitUl(200)
      this.emitDl(200)
      this.scheduleVoice()
    })
  }

  /** UL burst of 50×1500 B every 60 ms. */
  private backupBurst(): void {
    for (let i = 0; i < 50; i++) this.emitUl(1500)
    this.q.schedule(this.now() + 60 * MS, () => this.backupBurst())
  }

  /** Cycle every 2–8 s: 300 B UL request, 30 ms later a DL burst of 20–80 × 1400 B spaced 1 ms. */
  private scheduleBrowsing(): void {
    const wait = (2 + 6 * this.rng.next()) * 1000 * MS / 1000
    const at = this.now() + Math.floor(wait)
    this.q.schedule(at, () => {
      this.emitUl(300)
      const n = 20 + Math.floor(this.rng.next() * 61)
      for (let i = 0; i < n; i++) {
        this.q.schedule(this.now() + 30 * MS + i * MS, () => this.emitDl(1400))
      }
      this.scheduleBrowsing()
    })
  }

  /** 100 B UL every 1–5 s. */
  private scheduleIot(): void {
    const at = this.now() + Math.floor((1 + 4 * this.rng.next()) * 1000 * MS / 1000)
    this.q.schedule(at, () => {
      this.emitUl(100)
      this.scheduleIot()
    })
  }
}
