### Task 2: Clocks, ranging counters and the two-way ranging formulas

**Files:**
- Create: `src/uwb/clock.ts`, `src/uwb/ranging.ts`
- Test: `tests/uwb/clock.test.ts`, `tests/uwb/ranging.test.ts`

**Interfaces:**
- Consumes: Task 1 constants; `Rng` from `src/engine/rng.ts`.
- Produces:

```ts
// src/uwb/clock.ts
import type { Rng } from '../engine/rng'
/** Box–Muller standard normal from two uniform draws (u1 clamped ≥ 1e-12). Two rng.next() calls per value. */
export function gaussian(rng: Rng): number
/** (later − earlier) mod 2^40, always in [0, 2^40). */
export function counterDiff(later: number, earlier: number): number
export class UwbClock {
  constructor(readonly ppm: number, readonly origin: number)
  /** ppm given, or uniform in [−20, 20]; origin uniform integer in [0, 2^40). Draw order: ppm (if undefined) first, then origin. */
  static fromRng(rng: Rng, ppm?: number): UwbClock
  /** Ranging counter (integer RCTU, mod 2^40) for an RMARKER at true time trueNs plus extraNs of measured delay (noise, NLOS). */
  counter(trueNs: number, extraNs?: number): number
  //   = ((origin + Math.round((trueNs + extraNs) * (1 + ppm * 1e-6) / RCTU_NS)) % COUNTER_MOD + COUNTER_MOD) % COUNTER_MOD
}

// src/uwb/ranging.ts
export function ssTwrRaw(troundRctu: number, treplyRctu: number): number          // (tround − treply) / 2
export function ssTwrCorrected(troundRctu: number, treplyRctu: number, coffs: number): number  // (tround − treply·(1 − coffs)) / 2
export function dsTwr(tround1: number, treply1: number, tround2: number, treply2: number): number
//   (tround1·tround2 − treply1·treply2) / (tround1 + tround2 + treply1 + treply2)
export function rctuToMetres(tofRctu: number): number   // tof · RCTU_NS · C_M_PER_NS
export function metresToNs(m: number): number           // m / C_M_PER_NS
export function fomFor(nlos: boolean): number           // nlos ? FOM_NLOS : FOM_LOS
```

- [ ] **Step 1: Write the failing tests.**

`tests/uwb/clock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Rng } from '../../src/engine/rng'
import { UwbClock, counterDiff, gaussian } from '../../src/uwb/clock'
import { COUNTER_MOD, RCTU_NS } from '../../src/uwb/phy'

describe('UwbClock', () => {
  it('counts RCTU from its origin at its own rate', () => {
    const c = new UwbClock(10, 1000)
    expect(c.counter(0)).toBe(1000)
    // 1 ms at +10 ppm = 1 000 010 ns of local time
    expect(c.counter(1_000_000)).toBe(1000 + Math.round(1_000_010 / RCTU_NS))
  })
  it('adds measured delay before scaling and wraps at 2^40', () => {
    const c = new UwbClock(0, COUNTER_MOD - 10)
    expect(c.counter(0, 20 * RCTU_NS)).toBe(10)
    expect(counterDiff(10, COUNTER_MOD - 10)).toBe(20)
  })
  it('draws ppm in [−20, 20] and an origin below 2^40, deterministically', () => {
    const a = UwbClock.fromRng(new Rng(1)); const b = UwbClock.fromRng(new Rng(1))
    expect(a.ppm).toBe(b.ppm); expect(a.origin).toBe(b.origin)
    expect(Math.abs(a.ppm)).toBeLessThanOrEqual(20)
    expect(a.origin).toBeLessThan(COUNTER_MOD); expect(Number.isInteger(a.origin)).toBe(true)
    expect(UwbClock.fromRng(new Rng(2), 3.5).ppm).toBe(3.5)
  })
  it('gaussian has zero mean and unit variance over 20 000 draws', () => {
    const r = new Rng(9); let s = 0, s2 = 0; const n = 20_000
    for (let i = 0; i < n; i++) { const g = gaussian(r); s += g; s2 += g * g }
    expect(s / n).toBeCloseTo(0, 1); expect(s2 / n).toBeCloseTo(1, 1)
  })
})
```

`tests/uwb/ranging.test.ts` (synthetic exchange: build counters from two clocks and check the closed forms):

```ts
import { describe, it, expect } from 'vitest'
import { UwbClock, counterDiff } from '../../src/uwb/clock'
import { dsTwr, metresToNs, rctuToMetres, ssTwrCorrected, ssTwrRaw } from '../../src/uwb/ranging'
import { RCTU_NS } from '../../src/uwb/phy'

/** A (initiator) polls at 0, B replies replyNs after receiving, A finals finalNs after receiving the reply. */
function exchange(dM: number, ppmA: number, ppmB: number, replyNs: number, finalNs: number) {
  const A = new UwbClock(ppmA, 12345), B = new UwbClock(ppmB, 987654321)
  const tp = metresToNs(dM)
  const txPoll = 0, rxPoll = tp, txResp = tp + replyNs, rxResp = txResp + tp, txFinal = rxResp + finalNs, rxFinal = txFinal + tp
  return {
    tround1: counterDiff(A.counter(rxResp), A.counter(txPoll)),
    treply1: counterDiff(B.counter(txResp), B.counter(rxPoll)),
    tround2: counterDiff(B.counter(rxFinal), B.counter(txResp)),
    treply2: counterDiff(A.counter(txFinal), A.counter(rxResp)),
    coffs: (ppmB - ppmA) * 1e-6,
  }
}

describe('SS-TWR', () => {
  it('is exact with perfect clocks', () => {
    const e = exchange(5, 0, 0, 2_000_000, 2_000_000)
    expect(rctuToMetres(ssTwrRaw(e.tround1, e.treply1))).toBeCloseTo(5, 3)
  })
  it('a 2 ms reply and 20 ppm between the crystals reads 6.0 m long', () => {
    const e = exchange(5, 10, -10, 2_000_000, 2_000_000)
    const err = rctuToMetres(ssTwrRaw(e.tround1, e.treply1)) - 5
    // ½·Treply·(eA − eB) = 0.5 · 2 ms · 20e-6 = 20 ns = 5.996 m
    expect(err).toBeCloseTo(0.5 * 2_000_000 * 20e-6 * 0.299792458, 2)
  })
  it('the corrected formula removes the clock term', () => {
    const e = exchange(5, 10, -10, 2_000_000, 2_000_000)
    expect(rctuToMetres(ssTwrCorrected(e.tround1, e.treply1, e.coffs))).toBeCloseTo(5, 2)
  })
})

describe('DS-TWR', () => {
  it('cancels 20 ppm of clock error with asymmetric reply times to within 1 mm', () => {
    const e = exchange(12.5, 20, -20, 2_000_000, 6_000_000)
    expect(rctuToMetres(dsTwr(e.tround1, e.treply1, e.tround2, e.treply2))).toBeCloseTo(12.5, 3)
  })
  it('one RCTU is 4.69 mm', () => {
    expect(rctuToMetres(1)).toBeCloseTo(RCTU_NS * 0.299792458, 9)
    expect(rctuToMetres(1) * 1000).toBeCloseTo(4.69, 2)
  })
})
```

- [ ] **Step 2: Run** both files — expect failure.
- [ ] **Step 3: Implement** `clock.ts` and `ranging.ts` per the interfaces. Rounding in `counter` happens once, after scaling, so a 15.65 ps quantisation is the only quantisation.
- [ ] **Step 4: Run** the tests — PASS; `npx tsc -b`.
- [ ] **Step 5: Commit** `feat(uwb): ranging clocks, 40-bit counters and SS/DS-TWR formulas`.

---

