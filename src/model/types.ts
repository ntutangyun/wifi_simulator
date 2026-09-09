/** Simulation time in integer nanoseconds. */
export type Ns = number

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type NodeKind = 'ap' | 'sta'

/** Extensibility seam: PHY/MAC generation of a device (v1 implements 'nonht' only). */
export type Generation = 'nonht' | 'vht' | 'he' | 'eht'

export interface CapabilityProfile {
  generation: Generation
  /** Per-feature opt-in flags (e.g. future 'mlo', 'ofdma', 'ampdu'). */
  features: Record<string, boolean>
  /** Operating channel width in MHz. Default 20 — lessons 1-14 rely on it. */
  widthMhz?: 20 | 40 | 80 | 160 | 320
  /** Spatial streams. Default 1 — lessons 1-14 rely on it. */
  nss?: 1 | 2 | 3 | 4
}
