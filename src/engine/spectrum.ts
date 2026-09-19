/**
 * Cross-technology spectrum mediator.
 *
 * The Wi-Fi channel and the UWB channel each register their live emissions
 * here and ask for the *other* technology's power at one of their receivers.
 * Neither channel needs to know anything about the other's PHY: an emission is
 * just an EIRP spread uniformly over a band, radiating from a position.
 *
 * Model choices (stated in the coexistence lesson):
 *  - Spectral density is uniform inside an emission's band, so only the
 *    overlapping slice of it lands in a query band.
 *  - A foreign emission travels under the *transmitter's* path-loss law: a
 *    Wi-Fi 6 GHz PPDU reaching a UWB receiver uses the Wi-Fi table's law, a
 *    UWB frame reaching a Wi-Fi receiver uses UWB's free-space law.
 */
import type { Wall } from '../model/scenario'
import type { Ns, Vec3 } from '../model/types'
import { EventQueue } from './events'
import { wallLossDb } from './propagation'
import { UWB_CHANNEL_MHZ, uwbPl0Db, type UwbChannelNo } from '../uwb/phy'

export type SpectrumSide = 'wifi' | 'uwb'

export interface Emission {
  txId: string
  eirpDbm: number
  bandLoMhz: number
  bandHiMhz: number
  pos: Vec3
}

/** Wi-Fi free-space loss at 1 m (5.2 GHz reference) and the indoor exponent, as `propagation.ts` uses them. */
const WIFI_PL0_DB = 46.7
const WIFI_PL_EXP = 3.0
/** `LINK_EXTRA_LOSS_DB['6g']` in `simulation.ts`; repeated here so the mediator stays free of the simulation's imports. */
const WIFI_6G_EXTRA_LOSS_DB = 1.2

const UWB_PL_EXP = 2.0 // model: indoor LOS, as `src/uwb/phy.ts` states it

/** Wi-Fi 6 GHz PPDU seen by a UWB receiver: the Wi-Fi link's own law, 6 GHz extra loss included. */
export function wifiToUwbPathLossDb(dM: number, wallsDb: number): number {
  return (
    WIFI_PL0_DB + 10 * WIFI_PL_EXP * Math.log10(Math.max(dM, 0.1)) + wallsDb + WIFI_6G_EXTRA_LOSS_DB
  )
}

/** UWB frame seen by a Wi-Fi receiver: UWB's free-space law at the channel's centre frequency. */
export function uwbToWifiPathLossDb(dM: number, wallsDb: number, ch: UwbChannelNo): number {
  return uwbPl0Db(ch) + 10 * UWB_PL_EXP * Math.log10(Math.max(dM, 0.1)) + wallsDb
}

/** Width (MHz) of the overlap of two bands; 0 when they are disjoint. */
export function bandOverlapMhz(
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): number {
  return Math.max(0, Math.min(aHi, bHi) - Math.max(aLo, bLo))
}

/** The UWB channel an emission's band belongs to: the nearest channel centre. */
function uwbChannelOf(e: Emission): UwbChannelNo {
  const centre = (e.bandLoMhz + e.bandHiMhz) / 2
  const channels: UwbChannelNo[] = [5, 9]
  let best = channels[0]
  for (const ch of channels) {
    if (Math.abs(UWB_CHANNEL_MHZ[ch] - centre) < Math.abs(UWB_CHANNEL_MHZ[best] - centre)) best = ch
  }
  return best
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

const OTHER: Record<SpectrumSide, SpectrumSide> = { wifi: 'uwb', uwb: 'wifi' }

export class Spectrum {
  private live: Record<SpectrumSide, Emission[]> = { wifi: [], uwb: [] }
  private listeners: Record<SpectrumSide, ((t: Ns) => void)[]> = { wifi: [], uwb: [] }
  /** Instant of the notification already queued for a side, so a burst of emits at one instant wakes it once. */
  private pendingAt: Record<SpectrumSide, Ns | null> = { wifi: null, uwb: null }

  constructor(
    private readonly walls: Wall[],
    private readonly q: EventQueue,
    private readonly now: () => Ns,
  ) {}

  /** Register a live emission of one side; wakes the other side at phase 1 of the current instant. */
  emit(side: SpectrumSide, e: Emission): void {
    this.live[side].push(e)
    this.notify(OTHER[side])
  }

  /** Drop a live emission (the same object, or failing that the transmitter's oldest one). */
  retire(side: SpectrumSide, e: Emission): void {
    const list = this.live[side]
    let i = list.indexOf(e)
    if (i < 0) i = list.findIndex((x) => x.txId === e.txId)
    if (i < 0) return
    list.splice(i, 1)
    this.notify(OTHER[side])
  }

  /** Listeners of one side are called, in registration order, when the other side's emissions change. */
  onChange(target: SpectrumSide, fn: (t: Ns) => void): void {
    this.listeners[target].push(fn)
  }

  /** Sum (mW) of the OTHER side's live emissions at `rxPos` inside [loMhz, hiMhz]. */
  foreignMw(target: SpectrumSide, rxPos: Vec3, loMhz: number, hiMhz: number): number {
    const source = OTHER[target]
    let mw = 0
    for (const e of this.live[source]) {
      const overlap = bandOverlapMhz(e.bandLoMhz, e.bandHiMhz, loMhz, hiMhz)
      if (overlap <= 0) continue
      const width = e.bandHiMhz - e.bandLoMhz
      if (width <= 0) continue
      const inBandDbm = e.eirpDbm + 10 * Math.log10(overlap / width)
      const d = dist3(e.pos, rxPos)
      const wallsDb = wallLossDb(e.pos, rxPos, this.walls)
      const lossDb =
        source === 'wifi'
          ? wifiToUwbPathLossDb(d, wallsDb)
          : uwbToWifiPathLossDb(d, wallsDb, uwbChannelOf(e))
      mw += 10 ** ((inBandDbm - lossDb) / 10)
    }
    return mw
  }

  /** The same power in dBm; −Infinity when the other side is silent in that band. */
  foreignDbm(target: SpectrumSide, rxPos: Vec3, loMhz: number, hiMhz: number): number {
    const mw = this.foreignMw(target, rxPos, loMhz, hiMhz)
    return mw > 0 ? 10 * Math.log10(mw) : -Infinity
  }

  private notify(target: SpectrumSide): void {
    const t = this.now()
    if (this.pendingAt[target] === t) return
    this.pendingAt[target] = t
    this.q.schedule(
      t,
      () => {
        this.pendingAt[target] = null
        for (const fn of this.listeners[target].slice()) fn(t)
      },
      1,
    )
  }
}
