/**
 * Per-STA traffic profiles generating MSDUs as deterministic arrival events.
 * DL profiles enqueue at the AP (dst = STA); UL profiles enqueue at the STA.
 */
import type { EmitFn } from '../model/records'
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
  /** EDCA access category of the stream that produced this MSDU. */
  ac: number
  /** Cloud server this MSDU came from / goes to (unset for purely local streams). */
  server?: string
  /**
   * Downlink only: birth time of the uplink request this frame answers. When
   * the frame is delivered, (deliveredNs - rttFromNs) is the application round
   * trip: Wi-Fi up, WAN, server, WAN, Wi-Fi down.
   */
  rttFromNs?: Ns
}

/** The stream's cloud endpoint, as one-way figures: base WAN delay, jitter span, processing time. */
export interface ServerLink {
  id: string
  /** Half the server's RTT. */
  wanNs: Ns
  /** Full RTT jitter span; each direction draws uniformly from half of it. */
  jitterNs: Ns
  processNs: Ns
}

export interface TrafficOpts {
  /** Null/unset: a purely local stream (course lessons): no WAN delay, no server events, no pings. */
  server?: ServerLink | null
  emit?: EmitFn | null
  /** The router's game acceleration: game flows marked AC_VI instead of unmarked AC_BE. */
  gameAccel?: boolean
}

/** 64 B ping to the stream's server every 250 ms (±25 ms): what a game's ping counter measures. */
const PING_BYTES = 64
const PING_PERIOD_NS = 250 * 1_000_000

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
    case 'video':
    case 'gaming': return 2 // AC_VI (where WMM-aware routers and consoles put game traffic)
    case 'browsing':
    case 'saturated': return 1 // AC_BE
    case 'backup':
    case 'iot':
    case 'idle': return 0 // AC_BK
  }
}

const MS = 1_000_000
const US = 1_000
const S = 1_000_000_000

export class TrafficSource {

  constructor(
    private q: EventQueue,
    private now: () => Ns,
    private rng: Rng,
    private staId: string,
    private apId: string,
    readonly profile: ProfileId,
    private enqueue: EnqueueFn,
    opts: TrafficOpts = {},
  ) {
    this.server = opts.server ?? null
    this.emit = opts.emit ?? null
    this.gameAccel = opts.gameAccel ?? false
  }

  private readonly server: ServerLink | null
  private readonly emit: EmitFn | null
  private readonly gameAccel: boolean
  /** Uplink MSDUs of this stream still travelling: id -> birth time and size. */
  private pendingUl = new Map<number, { bornNs: Ns; bytes: number }>()

  /** Access category every MSDU of this stream is queued in. */
  get ac(): number {
    if (this.profile === 'gaming') return this.gameAccel ? 2 : 1 // marked AC_VI by the router, else unmarked AC_BE
    return acForProfile(this.profile)
  }

  start(): void {
    if (this.server && this.profile !== 'saturated' && this.profile !== 'idle') this.schedulePing()
    switch (this.profile) {
      case 'video':
        this.scheduleVideo(0)
        break
      case 'voice':
        this.scheduleVoice()
        break
      case 'gaming':
        this.scheduleGaming()
        if (this.server) this.scheduleGameServer()
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
    const id = nextMsduId++
    const bornNs = this.now()
    if (this.server) this.pendingUl.set(id, { bornNs, bytes })
    this.enqueue(this.staId, { id, bytes, src: this.staId, dst: this.apId, bornNs, ac: this.ac, server: this.server?.id })
  }

  /**
   * Downlink: without a server the frame enters the AP now; with one, the
   * server sends it now (WAN_TX) and it enters the AP one WAN delay later.
   * `rttFromNs` ties a reply to the uplink request it answers.
   */
  private emitDl(bytes: number, rttFromNs?: Ns): void {
    const id = nextMsduId++
    const t = this.now()
    if (!this.server) {
      this.enqueue(this.apId, { id, bytes, src: this.apId, dst: this.staId, bornNs: t, ac: this.ac })
      return
    }
    const { id: server } = this.server
    const arriveNs = t + this.oneWayNs()
    this.emit?.({ t, type: 'WAN_TX', server, msduId: id, bytes, to: this.staId, arriveNs })
    this.q.schedule(arriveNs, () => {
      this.enqueue(this.apId, { id, bytes, src: this.apId, dst: this.staId, bornNs: arriveNs, ac: this.ac, server, rttFromNs })
    })
  }

  /** One WAN crossing: the base delay plus this packet's share of the jitter. */
  private oneWayNs(): Ns {
    const s = this.server!
    return s.wanNs + Math.floor(this.rng.next() * (s.jitterNs / 2))
  }

  /**
   * The station's MAC has delivered one of our uplink MSDUs (its ACK arrived
   * at `t`). It reaches the server one WAN delay later, where the profile's
   * server side reacts: a page for a request, an echo for a voice packet, an
   * acknowledgement in the next game state update.
   */
  onUplinkDelivered(msduId: number, t: Ns): void {
    const p = this.pendingUl.get(msduId)
    if (!p || !this.server) return
    this.pendingUl.delete(msduId)
    const { id: server, processNs } = this.server
    const arriveNs = t + this.oneWayNs()
    this.q.schedule(arriveNs, () => {
      this.emit?.({ t: arriveNs, type: 'WAN_RX', server, msduId, bytes: p.bytes, from: this.staId, sentNs: t })
      // the server answers after its processing time
      this.q.schedule(arriveNs + processNs, () => {
        if (p.bytes === PING_BYTES) {
          this.emitDl(PING_BYTES, p.bornNs) // the echo: the RTT sample
          return
        }
        switch (this.profile) {
          case 'browsing': this.sendPage(); break
          case 'voice': this.emitDl(200); break // the far end's packet
          default: break // game inputs, backups, sensor readings: consumed
        }
      })
    })
  }

  /** Ping the server on the stream's own access category; the echo (onUplinkDelivered) carries the RTT. */
  private schedulePing(): void {
    const at = this.now() + Math.floor(PING_PERIOD_NS * (0.9 + 0.2 * this.rng.next()))
    this.q.schedule(at, () => {
      this.emitUl(PING_BYTES)
      this.schedulePing()
    })
  }

  /** Server side of a page: 20-80 x 1400 B spaced 1 ms (the think time is the server's processMs). */
  private sendPage(): void {
    const n = 20 + Math.floor(this.rng.next() * 61)
    const t0 = this.now()
    for (let i = 0; i < n; i++) {
      this.q.schedule(t0 + i * MS, () => this.emitDl(1400))
    }
  }

  /** ~15 Mbps DL: 1400 B every 747 µs + uniform jitter [0, 200] µs. */
  private scheduleVideo(t: Ns): void {
    const next = t + 747 * US + Math.floor(this.rng.next() * 200 * US)
    this.q.schedule(next, () => {
      this.emitDl(1400)
      this.scheduleVideo(next)
    })
  }

  /**
   * 200 B every 20 ms (VoIP-like). Locally both directions tick together; with
   * a call server the downlink is the far end's echo of each delivered packet.
   */
  private scheduleVoice(): void {
    const at = this.now() + 20 * MS + Math.floor(this.rng.next() * 2 * MS)
    this.q.schedule(at, () => {
      this.emitUl(200)
      if (!this.server) this.emitDl(200)
      this.scheduleVoice()
    })
  }

  /** Online game: 60 Hz client tick, 100 B UL state + 300 B DL world update, ±1.5 ms jitter. */
  private scheduleGaming(): void {
    const at = this.now() + Math.floor((16_667 - 1_500 + this.rng.next() * 3_000) * US)
    this.q.schedule(at, () => {
      this.emitUl(100)
      if (!this.server) this.emitDl(300)
      this.scheduleGaming()
    })
  }

  /** Game server: 60 Hz world-state updates on its own clock. */
  private scheduleGameServer(): void {
    const at = this.now() + Math.floor((16_667 - 1_500 + this.rng.next() * 3_000) * US)
    this.q.schedule(at, () => {
      this.emitDl(300)
      this.scheduleGameServer()
    })
  }

  /** UL burst of 50×1500 B every 60 ms. */
  private backupBurst(): void {
    for (let i = 0; i < 50; i++) this.emitUl(1500)
    this.q.schedule(this.now() + 60 * MS, () => this.backupBurst())
  }

  /** Cycle every 2–8 s: 300 B UL request, 30 ms later a DL burst of 20–80 × 1400 B spaced 1 ms. */
  private scheduleBrowsing(): void {
    const wait = (2 + 6 * this.rng.next()) * S
    const at = this.now() + Math.floor(wait)
    this.q.schedule(at, () => {
      this.emitUl(300)
      if (!this.server) {
        // local: the page follows 30 ms after the request; with a server it
        // follows the request's arrival there (onUplinkDelivered -> sendPage)
        const n = 20 + Math.floor(this.rng.next() * 61)
        for (let i = 0; i < n; i++) {
          this.q.schedule(this.now() + 30 * MS + i * MS, () => this.emitDl(1400))
        }
      }
      this.scheduleBrowsing()
    })
  }

  /** 100 B UL every 1–5 s. */
  private scheduleIot(): void {
    const at = this.now() + Math.floor((1 + 4 * this.rng.next()) * S)
    this.q.schedule(at, () => {
      this.emitUl(100)
      this.scheduleIot()
    })
  }
}
