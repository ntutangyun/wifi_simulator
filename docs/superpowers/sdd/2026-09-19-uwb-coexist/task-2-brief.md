### Task 2: The `Spectrum` mediator

**Files:** create `src/engine/spectrum.ts`; test `tests/engine/spectrum.test.ts`.

**Interfaces:**

```ts
import type { Vec3 } from '../model/types'; import type { Wall } from '../model/scenario'; import type { Ns } from '../model/types'
export type SpectrumSide = 'wifi' | 'uwb'
export interface Emission { txId: string; eirpDbm: number; bandLoMhz: number; bandHiMhz: number; pos: Vec3 }
export class Spectrum {
  constructor(walls: Wall[], q: EventQueue, now: () => Ns)
  /** Register a live emission of one side; schedules a phase-1 change notification for the other side at `now`. */
  emit(side: SpectrumSide, e: Emission): void
  retire(side: SpectrumSide, e: Emission): void
  onChange(target: SpectrumSide, fn: (t: Ns) => void): void
  /** Sum (mW) of the OTHER side's live emissions at rxPos inside [loMhz, hiMhz]. */
  foreignMw(target: SpectrumSide, rxPos: Vec3, loMhz: number, hiMhz: number): number
  foreignDbm(target: SpectrumSide, rxPos: Vec3, loMhz: number, hiMhz: number): number   // −Infinity when none
}
/** Path loss of a foreign emission uses the transmitter's law (documented model choice). */
export function wifiToUwbPathLossDb(dM: number, wallsDb: number): number   // 46.7 + 30·log10(max(d, 0.1)) + wallsDb + 1.2 (LINK_EXTRA_LOSS_DB['6g'])
export function uwbToWifiPathLossDb(dM: number, wallsDb: number, ch: UwbChannelNo): number  // uwbPl0Db(ch) + 20·log10(max(d, 0.1)) + wallsDb
```

Overlap of an emission with a query band: `overlapMhz = max(0, min(hi) − max(lo))`; the emission's power inside the query band is `eirpDbm + 10·log10(overlapMhz / (bandHi − bandLo))` (uniform spectral density within the emission's band, model). Wall loss via `wallLossDb` from `src/engine/propagation.ts`.

- [ ] Tests: a Wi-Fi emission (20 dBm, 6265–6345) at 3 m from a UWB receiver querying 6240–6739.2 → 20 − 62.2 = −42.2 dBm (within 0.1); the same emission queried on channel 9's band → −Infinity; a UWB emission (−14 dBm, 6240–6739.2) queried in 6265–6345 at 4 m → −14 + 10·log10(80/499.2) − (48.69 + 12.04) = −82.7 dBm (within 0.1); two emissions sum in mW; `retire` removes; `onChange` listeners for the other side fire once per emit/retire at phase 1 (use a real `EventQueue` and pop); a wall between adds its loss.
- [ ] Implement, run, commit `feat(engine): Spectrum mediator for cross-technology interference`.

---

