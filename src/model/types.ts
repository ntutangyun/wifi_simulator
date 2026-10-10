/** Simulation time in integer nanoseconds. */
export type Ns = number

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type NodeKind = 'ap' | 'sta' | 'amp' | 'uwb'

/**
 * Extensibility seam: PHY/MAC generation of a device (v1 implements 'nonht' only).
 *
 * `'uhr'` is 802.11bn (Wi-Fi 8) and is a DRAFT generation — see `PHY_MODES.uhr`
 * (src/engine/phy.ts) for exactly which of its numbers come from TGbn SFD r19 (`11-24/0209r19`)
 * and which are EHT's published values reused and declared as such. It is a FIFTH member rather
 * than four extra rungs appended to `'eht'` on purpose: appending would move `mcsForRssi` for
 * every existing link and recalibrate all 271 recorded lesson hashes, while a new member is
 * seen only by a scenario that asks for it by name.
 */
export type Generation = 'nonht' | 'vht' | 'he' | 'eht' | 'uhr'

export interface CapabilityProfile {
  generation: Generation
  /** Per-feature opt-in flags (e.g. future 'mlo', 'ofdma', 'ampdu'). */
  features: Record<string, boolean>
  /** Operating channel width in MHz. Default 20 — lessons 1-14 rely on it. */
  widthMhz?: 20 | 40 | 80 | 160 | 320
  /** Spatial streams. Default 1 — lessons 1-14 rely on it. */
  nss?: 1 | 2 | 3 | 4
}
