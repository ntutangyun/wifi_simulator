import { C_M_PER_NS, FOM_LOS, FOM_NLOS, RCTU_NS } from './phy'

/** Single-sided TWR, raw (no clock-offset correction): (tround − treply) / 2. */
export function ssTwrRaw(troundRctu: number, treplyRctu: number): number {
  return (troundRctu - treplyRctu) / 2
}

/** Single-sided TWR, corrected for a known relative clock offset coffs (ppm/1e6): (tround − treply·(1 − coffs)) / 2. */
export function ssTwrCorrected(troundRctu: number, treplyRctu: number, coffs: number): number {
  return (troundRctu - treplyRctu * (1 - coffs)) / 2
}

/** Double-sided (symmetric) TWR: (tround1·tround2 − treply1·treply2) / (tround1 + tround2 + treply1 + treply2). */
export function dsTwr(tround1: number, treply1: number, tround2: number, treply2: number): number {
  return (tround1 * tround2 - treply1 * treply2) / (tround1 + tround2 + treply1 + treply2)
}

/** Convert a time-of-flight in RCTU to metres. */
export function rctuToMetres(tofRctu: number): number {
  return tofRctu * RCTU_NS * C_M_PER_NS
}

/** Convert a distance in metres to a time-of-flight in ns. */
export function metresToNs(m: number): number {
  return m / C_M_PER_NS
}

/** Figure of Merit byte for a LOS or NLOS ranging result. */
export function fomFor(nlos: boolean): number {
  return nlos ? FOM_NLOS : FOM_LOS
}
