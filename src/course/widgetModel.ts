/**
 * Pure computations behind the lesson widgets. Everything is derived from the
 * same engine functions the simulation uses (propagation, noise per width,
 * required SINR, rate ceiling), so a widget and a simulated link never disagree.
 */
import { MAX_WIDTH, type ChannelWidth } from '../model/caps'
import type { Material } from '../model/scenario'
import {
  PHY_MODES, RATE_MARGIN_DB, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, toneRatio, type PhyMode,
} from '../engine/phy'
import { WALL_LOSS_DB, pathLossDb } from '../engine/propagation'

/**
 * Extra path loss on the 6 GHz link. Mirrors the private LINK_EXTRA_LOSS_DB in
 * src/engine/simulation.ts; tests/course/widgetModel.test.ts pins it against a
 * simulated multi-link scenario.
 */
export const BAND_EXTRA_LOSS_DB: Record<'5g' | '6g', number> = { '5g': 0, '6g': 1.2 }

export interface LinkBudgetInput {
  txDbm: number
  /** Straight-line (3D) distance between the antennas. */
  distanceM: number
  /** Every wall the direct ray crosses (openings excluded). */
  walls: Material[]
  widthMhz: number
  mode: PhyMode
  band?: '5g' | '6g'
}

export interface LinkBudget {
  pathLossDb: number
  wallLossDb: number
  /** 6 GHz extra loss (0 on 5 GHz). */
  bandLossDb: number
  rssiDbm: number
  noiseDbm: number
  snrDb: number
  /** Highest MCS the engine's rate ceiling allows (0 is the floor even when SNR is too low). */
  mcs: number
  /** Required SINR of that MCS. */
  reqSinrDb: number
  /** Whether even MCS 0 meets its requirement plus the rate margin. */
  usable: boolean
  /** PHY rate of that MCS at this width, one spatial stream. */
  mbps: number
}

export function linkBudget(inp: LinkBudgetInput): LinkBudget {
  const pl = pathLossDb(inp.distanceM)
  const wl = inp.walls.reduce((s, w) => s + WALL_LOSS_DB[w], 0)
  const band = BAND_EXTRA_LOSS_DB[inp.band ?? '5g']
  const rssi = inp.txDbm - pl - wl - band
  const noise = noiseDbm(inp.widthMhz)
  const snr = rssi - noise
  const mcs = mcsForRssi(inp.mode, rssi, undefined, inp.widthMhz)
  return {
    pathLossDb: pl,
    wallLossDb: wl,
    bandLossDb: band,
    rssiDbm: rssi,
    noiseDbm: noise,
    snrDb: snr,
    mcs,
    reqSinrDb: reqSinrDb(inp.mode, mcs),
    usable: snr >= reqSinrDb(inp.mode, 0) + RATE_MARGIN_DB,
    mbps: mcsRateMbps(inp.mode, mcs) * toneRatio(inp.mode, inp.widthMhz),
  }
}

export interface McsRow {
  mcs: number
  /** 20 MHz, one spatial stream. */
  mbps: number
  reqSinrDb: number
  /** Minimum input sensitivity (20 MHz) from the standard's table. */
  sensDbm: number
}

export function mcsLadder(mode: PhyMode): McsRow[] {
  const m = PHY_MODES[mode]
  return m.mbps.map((mbps, mcs) => ({ mcs, mbps, reqSinrDb: reqSinrDb(mode, mcs), sensDbm: m.sensDbm[mcs] }))
}

/** Channel widths a PHY mode can use (the generation's maximum from caps). */
export function widthsFor(mode: PhyMode): ChannelWidth[] {
  return ([20, 40, 80, 160, 320] as ChannelWidth[]).filter((w) => w <= MAX_WIDTH[mode])
}
