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
import { PL0_DB, PL_EXP, wallLossDb } from './propagation'
import { UWB_CHANNEL_MHZ, UWB_PL_EXP, uwbPl0Db, type UwbChannelNo } from '../uwb/phy'

export type SpectrumSide = 'wifi' | 'uwb'

export interface Emission {
  txId: string
  eirpDbm: number
  bandLoMhz: number
  bandHiMhz: number
  pos: Vec3
}

/** `LINK_EXTRA_LOSS_DB['6g']` in `simulation.ts`; repeated here so the mediator stays free of the
 * simulation's imports (`simulation.ts` imports this module, so the edge cannot run the other way).
 * `PL0_DB`/`PL_EXP` and `UWB_PL_EXP` are imported rather than copied: those edges already exist. */
const WIFI_6G_EXTRA_LOSS_DB = 1.2

/** Wi-Fi 6 GHz PPDU seen by a UWB receiver: the Wi-Fi link's own law, 6 GHz extra loss included. */
export function wifiToUwbPathLossDb(dM: number, wallsDb: number): number {
  return PL0_DB + 10 * PL_EXP * Math.log10(Math.max(dM, 0.1)) + wallsDb + WIFI_6G_EXTRA_LOSS_DB
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

const UWB_CHANNELS = [5, 9] as const satisfies readonly UwbChannelNo[]
/** Half a UWB channel's width, near enough: a centre farther than this from every channel centre
 * is not a UWB band at all, and the caller must say which channel it meant. */
const UWB_CHANNEL_MATCH_MHZ = 250

/** The UWB channel an emission's band belongs to: the nearest channel centre in `UWB_CHANNEL_MHZ`.
 * Throws on a band that is no UWB channel — `Emission` would then need an explicit channel. */
function uwbChannelOf(e: Emission): UwbChannelNo {
  const centre = (e.bandLoMhz + e.bandHiMhz) / 2
  let best: UwbChannelNo = UWB_CHANNELS[0]
  for (const ch of UWB_CHANNELS) {
    if (Math.abs(UWB_CHANNEL_MHZ[ch] - centre) < Math.abs(UWB_CHANNEL_MHZ[best] - centre)) best = ch
  }
  if (Math.abs(UWB_CHANNEL_MHZ[best] - centre) > UWB_CHANNEL_MATCH_MHZ) {
    throw new Error(`spectrum: UWB emission from ${e.txId} centred at ${centre} MHz is on no UWB channel`)
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

  /** Register a live emission of one side; wakes the other side at phase 1 of the current instant.
   * The emission is held **by reference**: it must not be mutated while live (a moving node emits
   * a fresh `Emission` per frame), and the same object must be handed back to `retire`. */
  emit(side: SpectrumSide, e: Emission): void {
    this.live[side].push(e)
    this.notify(OTHER[side])
  }

  /** Drop a live emission, matched by object identity — the caller passes back the object it
   * emitted. An emission that is not live is a no-op: nothing is removed and no one is woken, so a
   * double retire cannot take a namesake's frame off the air. */
  retire(side: SpectrumSide, e: Emission): void {
    const list = this.live[side]
    const i = list.indexOf(e)
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

  /** One phase-1 wake-up per side per instant. A caller already in phase 2 of that instant (a
   * TX-end handler) gets its notification popped immediately after, still at the same instant and
   * still ahead of the rest of that phase — harmless, because every consumer takes interference as
   * a maximum over a whole reception rather than as a reading at one point in the phase order. */
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
