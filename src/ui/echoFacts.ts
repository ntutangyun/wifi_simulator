/**
 * The echo figures the two guide panels quote, derived from the engine rather than typed into
 * prose — the same discipline `src/ui/Guide.tsx` already applies to the AMP backscatter reach and
 * the MMS layout, and the reason it exists here is that **both** guides need these numbers:
 * 📖 学习指南 explains the mechanism and ✏ 编辑模式's own panel explains the tool that places the
 * object. Two copies of this arithmetic could drift from each other; one cannot.
 *
 * Everything below is computed the way `UwbChannel` computes it for a real arrival: the band's
 * centre gives the wavelength and the 1 m free-space loss, `uwbPathLossDb` is the law charged
 * once per leg, and `echoLossDb` takes the double-charged receive aperture back out. So a figure
 * here is what a run would report, not an estimate of it — the two levels in `ECHO_2M` are the
 * same −65.8 / −71.5 dBm the acceptance run logged.
 *
 * Walls are left out (`wallsDb` 0): these are the clearest possible case, and adding a wall only
 * makes the point below stronger.
 */
import { echoExcessM, echoLossDb, echoPathM } from '../engine/scatter'
import { NEW_SCATTERER_EXTRA_LOSS_DB } from '../editor/planOps'
import { DEFAULT_UWB_SESSION } from '../model/scenario'
import type { Vec3 } from '../model/types'
import {
  C_M_PER_NS, UWB_BAND_MHZ, UWB_CHIP_NS, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM,
  freeSpacePl0Db, uwbPathLossDb,
} from '../uwb/phy'

/** The session default's channel, so the prose quotes the band a fresh plan actually ranges on. */
const CH = DEFAULT_UWB_SESSION.channel
const CENTRE_MHZ = (UWB_BAND_MHZ[CH].lo + UWB_BAND_MHZ[CH].hi) / 2
/** Carrier wavelength, metres: c / f, exactly as `UwbChannel.lambdaMFor` computes it. physics */
const LAMBDA_M = (C_M_PER_NS * 1e9) / (CENTRE_MHZ * 1e6)
/** The path-loss law, bound once and charged per leg — `UwbChannel`'s own closure. */
const law = (dM: number): number => uwbPathLossDb(freeSpacePl0Db(CENTRE_MHZ), dM, 0)

/** What a receiver on this channel hears from one object, dBm. */
function echoDbm(tx: Vec3, s: Vec3, rx: Vec3, extraLossDb: number): number {
  return UWB_TX_POWER_DBM - echoLossDb(tx, s, rx, law, LAMBDA_M, extraLossDb)
}

/**
 * The extra path a 499.2 Mchip/s receiver needs before it can call an echo a second arrival:
 * c × 1/B, and 1/B for the HRP UWB PHY is the chip itself (design §4). 0.60 m.
 * standard §16.2.4 (the chip) · physics (c × t)
 */
export const ECHO_RESOLUTION_M = (C_M_PER_NS * UWB_CHIP_NS).toFixed(2)

// --- the measured 2 m pair (task 4's acceptance run) ----------------------------------------
// An anchor and a tag two metres apart at 1 m, with a wardrobe-sized object — the reflectivity
// the 🪞 tool writes — at two distances from the line between them. This is the pair of figures
// the resolution lesson turns on, and the surprise is in the levels.

const A: Vec3 = { x: 0, y: 0, z: 1 }
const B: Vec3 = { x: 2, y: 0, z: 1 }
const off = (dM: number): Vec3 => ({ x: 1, y: dM, z: 1 })

/** One object, as both guides quote it: how far its echo travelled, how much further than the
 * direct ray that is, whether this receiver can separate the two, and how loud it arrived. */
function echoAt(offsetM: number) {
  const s = off(offsetM)
  const excessM = echoExcessM(A, s, B)
  return {
    offM: offsetM.toFixed(1),
    pathM: echoPathM(A, s, B).toFixed(2),
    excessM: excessM.toFixed(2),
    resolvable: excessM > Number(ECHO_RESOLUTION_M),
    dbm: echoDbm(A, s, B, NEW_SCATTERER_EXTRA_LOSS_DB).toFixed(1).replace('-', '−'),
  }
}

/** 0.2 m off the line: 0.04 m of excess against the 0.60 m needed — **not** separable — and yet
 * the louder of the two, because both its legs are shorter. */
export const ECHO_NEAR_LINE = echoAt(0.2)
/** 1 m off the line: 0.83 m of excess, separable, and 5.7 dB quieter for it. */
export const ECHO_OFF_LINE = echoAt(1)

// --- how far this reaches at all ------------------------------------------------------------
// A perfect one square metre (0 dB) standing at the midpoint of the line, at two baselines.
// `deliverEcho` gates an echo on the direct path's own sensitivity, so a margin below
// UWB_RX_SENS_DBM means the echo is never handed over and nothing is recorded at all.

const idealMidpointDbm = (baselineM: number): number =>
  echoDbm({ x: 0, y: 0, z: 1 }, { x: baselineM / 2, y: 0, z: 1 }, { x: baselineM, y: 0, z: 1 }, 0)

/** How far **under** the receiver's floor a square metre halfway along a 10 m line lands, dB. */
export const ECHO_IDEAL_10M_UNDER_FLOOR_DB = (UWB_RX_SENS_DBM - idealMidpointDbm(10)).toFixed(1)
/** …and how far **over** it the same object lands on a 2 m line, dB. Same object, same law. */
export const ECHO_IDEAL_2M_OVER_FLOOR_DB = (idealMidpointDbm(2) - UWB_RX_SENS_DBM).toFixed(1)
/** The reflectivity the 🪞 tool writes, formatted for prose. */
export const SCATTERER_DEFAULT_DB = String(NEW_SCATTERER_EXTRA_LOSS_DB).replace('-', '−')
