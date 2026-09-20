/**
 * The leaf of the UWB stack: the units every UWB module measures in, and the handful of radio
 * constants the PHY modules above need before `phy.ts` itself can be evaluated.
 *
 * It exists to break a cycle. `phy.ts` sizes an MMS slot, so it imports `mms.ts` and `nb.ts`;
 * both of those in turn wanted the chip, the ranging counter and the free-space law from
 * `phy.ts`, and a module-level constant of one evaluated inside the other would have been
 * undefined half the time (which is why `mms.ts` used to carry its own copy of the 128 RCTU
 * in a chip). Everything here depends on nothing of this repository at all, so it can be
 * imported from anywhere in the stack without an edge ever running backwards.
 *
 * `phy.ts` re-exports every name below, so no module outside `src/uwb/` has to know this file
 * is here: `import { RCTU_NS } from './phy'` still works and still means the same number.
 */
import type { Ns } from '../model/types'

// --- Chip and ranging counter ---------------------------------------------------

export const UWB_CHIP_HZ = 499.2e6 // standard §16.2.4 peak PRF
export const UWB_CHIP_NS = 1000 / 499.2 // standard §16.2.4: 2.003205 ns
/** Ranging counter units in one chip: the RCTU is 2^-7 of a chip. standard §10.29.1.4 */
export const RCTU_PER_CHIP = 128
export const RCTU_NS = UWB_CHIP_NS / RCTU_PER_CHIP // standard §10.29.1.4: ≈ 15.650 ps
export const RCTU_PS = RCTU_NS * 1000 // standard §10.29.1.4
export const COUNTER_BITS = 40 // model (standard: "at minimum 32-bit")
export const COUNTER_MOD = 2 ** COUNTER_BITS // model

/** Chips at 499.2 Mchip/s to whole nanoseconds — the one rounding every PPDU, fragment and
 * ranging sequence in this engine is measured with. */
export function chipsToNs(chips: number): Ns {
  return Math.round((chips * 1000) / 499.2)
}

// --- Physics and the free-space law ---------------------------------------------

export const C_M_PER_NS = 0.299792458 // physics

/** Free-space path loss at 1 m for a carrier of `mhz`: 20·log10(4π·f/c). physics
 *
 * One definition, because the UWB channels are not the only carrier this engine measures a
 * first metre on: the 4ab narrowband radio (`nb.ts`) sits at 5.7–6.4 GHz and uses the same law. */
export function freeSpacePl0Db(mhz: number): number {
  return 20 * Math.log10((4 * Math.PI * mhz * 1e6) / (C_M_PER_NS * 1e9))
}

export const UWB_PL_EXP = 2.0 // model: indoor LOS

// --- Receiver -------------------------------------------------------------------

export const UWB_RX_SENS_DBM = -93 // model
