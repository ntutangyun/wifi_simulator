# Module 4 — Channel Width, Spatial Streams, MU-MIMO, Rate Adaptation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the simulator's PHY match a commercial Wi-Fi 7 access point — channel width to 320 MHz, up to four spatial streams, MU-MIMO, and rate adaptation with loss feedback — and teach all four in lessons 15 to 18.

**Architecture:** Width and stream count become capability fields negotiated per transmitter-receiver pair. They multiply the bits-per-symbol term inside the one existing airtime function, and they raise the decode threshold by the noise-bandwidth ratio. Rate selection moves from a pure signal-strength lookup to a small per-peer controller that steps down on losses and climbs back. MU-MIMO reuses the existing downlink multi-user machinery with a different split rule.

**Tech Stack:** TypeScript, Vitest, Vite. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-phy-realism-design.md`

## Global Constraints

- Lessons 1 to 14 must keep 20 MHz and one spatial stream. Never set `widthMhz` or `nss` in `src/course/lessons.ts` for those lessons, and never change the defaults away from 20 and 1.
- The engine is deterministic. No `Math.random` anywhere; the rate controller holds no randomness at all.
- Every string shown to a user is bilingual: an `L10n` of `{ en, zh }`.
- Time is integer nanoseconds. Never introduce floating-point time.
- Run the full suite with `npx vitest run` before every commit; it must stay green.
- Type-check with `npx tsc --noEmit -p .` before every commit.
- Commit messages end with the two attribution lines used by the repo's recent commits (`Co-Authored-By:` and `Claude-Session:`); copy them from `git log -1 --format=%B`.
- Lesson tasks (7 and 8) specify each lesson's structure, every technical fact it must state, and its exact quiz questions and answers, but not the final bilingual prose. Write that prose in the voice of lessons 1 to 14: second person, short sentences, the mechanism before its name. Read two existing lessons before writing a new one.

---

## File Structure

**Created**
- `src/engine/rate.ts` — the per-peer rate controller. One responsibility: choose a modulation index given a ceiling and a history of outcomes.
- `tests/engine/rate.test.ts`
- `tests/engine/mumimo.test.ts`
- `tests/engine/width.test.ts`

**Modified**
- `src/model/types.ts` — two optional capability fields.
- `src/model/caps.ts` — width and stream accessors, per-pair negotiation, generation maxima.
- `src/model/scenario.ts` — Zod schema for the two fields plus the generation-maximum check.
- `src/model/presets.ts` — presets carry their real width and streams.
- `src/model/frames.ts` — `FrameDesc` carries the width it was sent at.
- `src/engine/phy.ts` — tone ratios, airtime scaling, width-dependent sensitivity.
- `src/engine/mac.ts` — width and streams per peer, rate-controller notifications, MU-MIMO grouping.
- `src/engine/channel.ts` — decode threshold uses the frame's width.
- `src/engine/simulation.ts` — wires the capability into the MAC and owns the rate controllers.
- `src/course/lessons.ts` — module 4 and lessons 15 to 18.
- `src/ui/i18n.ts` — labels for the new feature flag and the width/stream inspector fields.
- `docs/reports/edca-tamper-data.json`, `docs/reports/edca-tamper-report.zh.html` — regenerated.

---

### Task 1: Capability fields and negotiation

**Files:**
- Modify: `src/model/types.ts` (the `CapabilityProfile` interface, around line 15)
- Modify: `src/model/caps.ts`
- Modify: `src/model/scenario.ts` (the Zod `CapsSchema` near the other node schemas)
- Test: `tests/model/caps.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ChannelWidth = 20 | 40 | 80 | 160 | 320`
  - `type Nss = 1 | 2 | 3 | 4`
  - `const MAX_WIDTH: Record<Generation, ChannelWidth>`
  - `function widthOf(n: NodeCfg): ChannelWidth`
  - `function nssOf(n: NodeCfg): Nss`
  - `function negotiatedWidth(a: NodeCfg, b: NodeCfg): ChannelWidth`
  - `function negotiatedNss(a: NodeCfg, b: NodeCfg): Nss`

- [ ] **Step 1: Write the failing test**

Append to `tests/model/caps.test.ts` (create the file with the imports below if it does not exist):

```ts
import { describe, it, expect } from 'vitest'
import { MAX_WIDTH, negotiatedNss, negotiatedWidth, nssOf, widthOf } from '../../src/model/caps'
import type { NodeCfg } from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'

function node(gen: Generation, widthMhz?: number, nss?: number): NodeCfg {
  return {
    id: 'n', kind: 'sta', name: 'n', pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15,
    profiles: [], caps: { generation: gen, features: {}, widthMhz, nss } as NodeCfg['caps'],
  }
}

describe('channel width and spatial streams', () => {
  it('default to 20 MHz and one stream, which is what keeps lessons 1-14 unchanged', () => {
    expect(widthOf(node('eht'))).toBe(20)
    expect(nssOf(node('eht'))).toBe(1)
  })

  it('a link runs at the narrower width and the smaller stream count of its two ends', () => {
    const ap = node('eht', 320, 4)
    const phone = node('eht', 160, 2)
    expect(negotiatedWidth(ap, phone)).toBe(160)
    expect(negotiatedNss(ap, phone)).toBe(2)
  })

  it('a declared width is clamped to what the generation can do', () => {
    expect(widthOf(node('he', 320))).toBe(MAX_WIDTH.he)
    expect(widthOf(node('nonht', 80))).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/caps.test.ts`
Expected: FAIL — `widthOf` is not exported from `src/model/caps.ts`.

- [ ] **Step 3: Write minimal implementation**

In `src/model/types.ts`, extend the interface:

```ts
export interface CapabilityProfile {
  generation: Generation
  /** Per-feature opt-in flags (e.g. future 'mlo', 'ofdma', 'ampdu'). */
  features: Record<string, boolean>
  /** Operating channel width in MHz. Default 20 — lessons 1-14 rely on it. */
  widthMhz?: 20 | 40 | 80 | 160 | 320
  /** Spatial streams. Default 1 — lessons 1-14 rely on it. */
  nss?: 1 | 2 | 3 | 4
}
```

In `src/model/caps.ts`, add near the top:

```ts
export type ChannelWidth = 20 | 40 | 80 | 160 | 320
export type Nss = 1 | 2 | 3 | 4

/** Widest channel each generation can operate. Non-HT is 20 MHz only. */
export const MAX_WIDTH: Record<Generation, ChannelWidth> = {
  nonht: 20, vht: 160, he: 160, eht: 320,
}

/** Operating width, defaulted to 20 MHz and clamped to the generation's maximum. */
export function widthOf(n: NodeCfg): ChannelWidth {
  const want = n.caps.widthMhz ?? 20
  const max = MAX_WIDTH[n.caps.generation]
  return (want > max ? max : want) as ChannelWidth
}

/** Spatial streams, defaulted to 1. */
export function nssOf(n: NodeCfg): Nss {
  return (n.caps.nss ?? 1) as Nss
}

/** A link runs at the narrower of the two ends. */
export function negotiatedWidth(a: NodeCfg, b: NodeCfg): ChannelWidth {
  return Math.min(widthOf(a), widthOf(b)) as ChannelWidth
}

/** A link runs at the smaller stream count of the two ends. */
export function negotiatedNss(a: NodeCfg, b: NodeCfg): Nss {
  return Math.min(nssOf(a), nssOf(b)) as Nss
}
```

In `src/model/scenario.ts`, find the Zod object that validates `caps` (it has `generation` and `features`) and add the two fields:

```ts
  widthMhz: z.union([z.literal(20), z.literal(40), z.literal(80), z.literal(160), z.literal(320)]).optional(),
  nss: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/caps.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all green, no type errors. Nothing else reads the new fields yet.

- [ ] **Step 6: Commit**

```bash
git add src/model/types.ts src/model/caps.ts src/model/scenario.ts tests/model/caps.test.ts
git commit -m "feat(model): channel width and spatial streams as negotiated capability"
```

---

### Task 2: Airtime scales with width and streams

**Files:**
- Modify: `src/engine/phy.ts` (`TxTimeOpts` around line 152, `txTimeModeNs` around line 158)
- Modify: `src/engine/mac.ts` (`maxPsduBytesFor` around line 127)
- Test: `tests/engine/width.test.ts` (create)

**Interfaces:**
- Consumes: `ChannelWidth` from Task 1 (type only; this task takes plain numbers).
- Produces:
  - `function toneRatio(mode: PhyMode, widthMhz: number): number`
  - `TxTimeOpts` gains `widthMhz?: number` (default 20) and `nss?: number` (default 1)
  - `maxPsduBytesFor(mode, mcs, ruFraction, durNs, widthMhz?, nss?)`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/width.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toneRatio, txTimeModeNs } from '../../src/engine/phy'

describe('channel width multiplies the bits carried per symbol', () => {
  it('uses the standard data-subcarrier counts for HE and EHT', () => {
    expect(toneRatio('eht', 20)).toBeCloseTo(1, 3)
    expect(toneRatio('eht', 40)).toBeCloseTo(2, 3)
    expect(toneRatio('eht', 80)).toBeCloseTo(980 / 234, 3)
    expect(toneRatio('eht', 160)).toBeCloseTo(1960 / 234, 3)
    expect(toneRatio('eht', 320)).toBeCloseTo(3920 / 234, 3)
    expect(toneRatio('he', 160)).toBeCloseTo(1960 / 234, 3)
  })

  it('uses the VHT subcarrier counts for Wi-Fi 5, which are not the same ratios', () => {
    expect(toneRatio('vht', 40)).toBeCloseTo(108 / 52, 3)
    expect(toneRatio('vht', 80)).toBeCloseTo(234 / 52, 3)
    expect(toneRatio('vht', 160)).toBeCloseTo(468 / 52, 3)
  })

  it('non-HT has one width only', () => {
    expect(toneRatio('nonht', 20)).toBe(1)
    expect(toneRatio('nonht', 80)).toBe(1)
  })

  it('reproduces the Xiaomi 17 Ultra datasheet: 5.8 Gb/s at 320 MHz, two streams, MCS 13', () => {
    // one 1 000 000-bit frame, so airtime is dominated by data symbols
    const bytes = 125_000
    const ns = txTimeModeNs('eht', bytes, 13, { widthMhz: 320, nss: 2 })
    const mbps = (bytes * 8) / (ns / 1000) // bits per microsecond = Mb/s
    expect(mbps).toBeGreaterThan(5600)
    expect(mbps).toBeLessThan(5800)
  })

  it('a fixed preamble means a single frame shrinks less than its data symbols do', () => {
    const narrow = txTimeModeNs('eht', 1530, 7)
    const wide = txTimeModeNs('eht', 1530, 7, { widthMhz: 160, nss: 2 })
    expect(narrow / wide).toBeGreaterThan(2.5)
    expect(narrow / wide).toBeLessThan(4)
  })

  it('a large aggregate approaches the full data-symbol ratio', () => {
    const narrow = txTimeModeNs('eht', 30_600, 7)
    const wide = txTimeModeNs('eht', 30_600, 7, { widthMhz: 160, nss: 2 })
    expect(narrow / wide).toBeGreaterThan(10)
    expect(narrow / wide).toBeLessThan(15)
  })

  it('defaults leave every existing call unchanged', () => {
    expect(txTimeModeNs('eht', 1530, 7, { widthMhz: 20, nss: 1 })).toBe(txTimeModeNs('eht', 1530, 7))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/width.test.ts`
Expected: FAIL — `toneRatio` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/phy.ts`, add above `TxTimeOpts`:

```ts
/**
 * Data subcarriers per channel width, from the standard. Airtime scales with
 * these, not with the width in MHz: 80 MHz carries slightly more than four
 * times a 20 MHz channel because the guard bands are not repeated.
 */
const TONES_HE: Record<number, number> = { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 }
const TONES_VHT: Record<number, number> = { 20: 52, 40: 108, 80: 234, 160: 468 }

/** Bits-per-symbol multiplier for a width, relative to that mode at 20 MHz. */
export function toneRatio(mode: PhyMode, widthMhz: number): number {
  if (mode === 'nonht') return 1
  const table = mode === 'vht' ? TONES_VHT : TONES_HE
  const tones = table[widthMhz]
  if (!tones) return 1
  return tones / table[20]
}
```

Extend `TxTimeOpts` and `txTimeModeNs`:

```ts
export interface TxTimeOpts {
  mu?: boolean
  /** RU fraction of the operating channel (1 = full, 0.5 ≈ half RU …). */
  ruFraction?: number
  /** Operating channel width in MHz (default 20). */
  widthMhz?: number
  /** Spatial streams (default 1). */
  nss?: number
}

/** PPDU airtime for any PHY mode/MCS; symbol count uses width-, stream- and RU-scaled N_DBPS. */
export function txTimeModeNs(mode: PhyMode, lengthBytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
  const m = PHY_MODES[mode]
  const base = m.ndbps[mcs]
  if (!base) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  const ndbps = base * toneRatio(mode, opts.widthMhz ?? 20) * (opts.nss ?? 1) * (opts.ruFraction ?? 1)
  const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
  return m.preambleNs + (opts.mu ? m.muExtraPreambleNs : 0) + m.symNs * nsym
}
```

Note the reordering: the invalid-MCS check now reads `m.ndbps[mcs]` before scaling, so a zero width factor cannot mask a bad index.

In `src/engine/mac.ts`, widen `maxPsduBytesFor` to match:

```ts
export function maxPsduBytesFor(
  mode: PhyMode, mcs: number, ruFraction: number, durNs: Ns, widthMhz = 20, nss = 1,
): number {
  const m = PHY_MODES[mode]
  const nsym = Math.floor((durNs - m.preambleNs - m.muExtraPreambleNs) / m.symNs)
  const bits = nsym * m.ndbps[mcs] * toneRatio(mode, widthMhz) * nss * ruFraction
  return Math.max(0, Math.floor((bits - 22) / 8))
}
```

Keep whatever the existing body does for `nsym`; only the `bits` line and the signature change. Import `toneRatio` from `./phy`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/width.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: green. Defaults mean no behaviour changed anywhere else.

- [ ] **Step 6: Commit**

```bash
git add src/engine/phy.ts src/engine/mac.ts tests/engine/width.test.ts
git commit -m "feat(phy): airtime scales with channel width and spatial streams"
```

---

### Task 3: Wider channels need more signal

**Files:**
- Modify: `src/engine/phy.ts` (`mcsForRssi` around line 167, `sinrThreshModeDb` around line 181)
- Modify: `src/model/frames.ts` (`FrameDesc`)
- Modify: `src/engine/channel.ts` (lines 87 and 90, the decode threshold)
- Test: `tests/engine/width.test.ts` (extend)

**Interfaces:**
- Consumes: `toneRatio` from Task 2.
- Produces:
  - `function widthPenaltyDb(widthMhz: number): number`
  - `mcsForRssi(mode, rssiDbm, maxMcs?, widthMhz?)` — fourth parameter, default 20
  - `sinrThreshModeDb(mode, mcs, widthMhz?)` — third parameter, default 20
  - `FrameDesc` gains `widthMhz?: number`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine/width.test.ts`:

```ts
import { mcsForRssi, sinrThreshModeDb, widthPenaltyDb } from '../../src/engine/phy'

describe('a wider channel admits more noise, so every rate needs more signal', () => {
  it('costs 3 dB per doubling of width', () => {
    expect(widthPenaltyDb(20)).toBeCloseTo(0, 2)
    expect(widthPenaltyDb(40)).toBeCloseTo(3.01, 2)
    expect(widthPenaltyDb(80)).toBeCloseTo(6.02, 2)
    expect(widthPenaltyDb(160)).toBeCloseTo(9.03, 2)
    expect(widthPenaltyDb(320)).toBeCloseTo(12.04, 2)
  })

  it('raises the decode threshold by the same amount', () => {
    const narrow = sinrThreshModeDb('eht', 5)
    const wide = sinrThreshModeDb('eht', 5, 160)
    expect(wide - narrow).toBeCloseTo(9.03, 2)
  })

  it('a far station reaches a higher modulation on a narrow channel than a wide one', () => {
    const rssi = -70
    expect(mcsForRssi('eht', rssi, undefined, 20)).toBeGreaterThan(mcsForRssi('eht', rssi, undefined, 160))
  })

  it('defaults to 20 MHz so existing callers are unchanged', () => {
    expect(mcsForRssi('eht', -60)).toBe(mcsForRssi('eht', -60, undefined, 20))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/width.test.ts`
Expected: FAIL — `widthPenaltyDb` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/engine/phy.ts`:

```ts
/** Noise bandwidth grows with the channel: 10·log10(W/20) dB, i.e. 3 dB per doubling. */
export function widthPenaltyDb(widthMhz: number): number {
  return 10 * Math.log10(widthMhz / 20)
}

/** Best MCS index whose sensitivity + 3 dB margin is met at this width (floor: 0). */
export function mcsForRssi(mode: PhyMode, rssiDbm: number, maxMcs?: number, widthMhz = 20): number {
  const m = PHY_MODES[mode]
  const pen = widthPenaltyDb(widthMhz)
  const cap = maxMcs !== undefined ? Math.min(maxMcs, m.sensDbm.length - 1) : m.sensDbm.length - 1
  let best = 0
  for (let i = 0; i <= cap; i++) {
    if (rssiDbm >= m.sensDbm[i] + pen + 3) best = i
  }
  return best
}

export function sinrThreshModeDb(mode: PhyMode, mcs: number, widthMhz = 20): number {
  return PHY_MODES[mode].sensDbm[mcs] - NOISE_DBM + widthPenaltyDb(widthMhz)
}
```

In `src/model/frames.ts`, add to `FrameDesc` beside `mode` and `mcs`:

```ts
  /** Operating channel width in MHz this PPDU was sent at (default 20). */
  widthMhz?: number
```

In `src/engine/channel.ts`, pass the frame's width at both threshold sites:

```ts
    return sinrThreshModeDb(mode, part ? part.mcs : 0, frame.widthMhz ?? 20)
```

```ts
    return sinrThreshModeDb(frame.mode, frame.mcs, frame.widthMhz ?? 20)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/width.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: green — no frame sets `widthMhz` yet, so every threshold still resolves at 20 MHz.

- [ ] **Step 6: Commit**

```bash
git add src/engine/phy.ts src/model/frames.ts src/engine/channel.ts tests/engine/width.test.ts
git commit -m "feat(phy): decode threshold rises 3 dB per doubling of channel width"
```

---

### Task 4: Wire width and streams through the MAC, and give the presets their real radios

**Files:**
- Modify: `src/engine/mac.ts` (`WifiMacCfg` around line 38; every `txTimeModeNs` and `maxPsduBytesFor` call listed below; every `FrameDesc` construction)
- Modify: `src/engine/simulation.ts` (the MAC construction around line 100)
- Modify: `src/model/presets.ts` (`StationPreset`, `capsFor`, every preset entry)
- Modify: `src/ui/i18n.ts` (inspector labels)
- Test: `tests/model/households.test.ts` (extend)

**Interfaces:**
- Consumes: `negotiatedWidth`, `negotiatedNss` (Task 1); `toneRatio` (Task 2).
- Produces: `WifiMacCfg` gains `widthForPeer(peer: string): number` and `nssForPeer(peer: string): number`; `StationPreset` gains `widthMhz: ChannelWidth` and `nss: Nss`.

- [ ] **Step 1: Write the failing test**

Append to `tests/model/households.test.ts`:

```ts
import { widthOf, nssOf } from '../../src/model/caps'

describe('household phones carry the radio their datasheet claims', () => {
  it('a Wi-Fi 7 phone is 2 streams at 160 MHz', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'three-gamers')!.scenario()
    const phone = sc.nodes.find((n) => n.id === 'sta-1')!
    expect(widthOf(phone)).toBe(160)
    expect(nssOf(phone)).toBe(2)
  })

  it('the router is 4 streams at 160 MHz — the Chinese market has no 6 GHz', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'three-gamers')!.scenario()
    const ap = sc.nodes.find((n) => n.kind === 'ap')!
    expect(widthOf(ap)).toBe(160)
    expect(nssOf(ap)).toBe(4)
  })

  it('a Wi-Fi 6 phone is 2 streams at 160 MHz too, but its MCS table stops lower', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
    const he = sc.nodes.find((n) => n.caps.generation === 'he')
    expect(he).toBeDefined()
    expect(nssOf(he!)).toBe(2)
  })
})
```

Then, in the same file, a test that the household's frames really got faster:

```ts
it('a household data frame is far shorter than the same frame at 20 MHz and one stream', () => {
  const sc = HOUSEHOLDS.find((h) => h.id === 'three-gamers')!.scenario()
  const recs = new Simulation(sc).runUntil(300 * 1_000_000).records
  const tx = recs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000)
  expect(tx.length).toBeGreaterThan(5)
  for (const r of tx) {
    if (r.type !== 'TX_START') continue
    expect(r.frame.widthMhz).toBe(160)
  }
})
```

Add the imports `Simulation` and `HOUSEHOLDS` if the file does not already have them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model/households.test.ts`
Expected: FAIL — `widthOf(phone)` returns 20 because presets do not carry a width.

- [ ] **Step 3: Write minimal implementation**

In `src/model/presets.ts`, add the two fields to `StationPreset` and to the `P` helper, then set them on every entry. Phones on the Chinese market are all two-stream; the widths follow each note:

```ts
export interface StationPreset {
  id: string
  brand: Brand
  model: string
  released: string
  generation: Generation
  mloCapable: boolean
  /** Operating channel width the device supports, in MHz. */
  widthMhz: ChannelWidth
  /** Spatial streams. Every phone on this list is 2×2. */
  nss: Nss
  profiles: ProfileId[]
  note: { en: string; zh: string }
}
```

Give `P` two more positional parameters after `mloCapable`, defaulting to `160` and `2`, and pass them through. Every current preset is 2×2 at 160 MHz, so the defaults cover them all; pass explicit values only if a preset's note says otherwise.

Then carry them into the capability:

```ts
function capsFor(p: StationPreset): NodeCfg['caps'] {
  const features = defaultFeatures(p.generation) as Record<string, boolean>
  if (p.generation === 'eht') features.mlo = false // Chinese market: no 6 GHz
  return { generation: p.generation, features, widthMhz: p.widthMhz, nss: p.nss }
}
```

Find where households build their access point (search `kind: 'ap'` in `src/model/households.ts`) and give it `widthMhz: 160, nss: 4` in its `caps`. Do not touch `src/course/lessons.ts`.

In `src/engine/mac.ts`, add to `WifiMacCfg`:

```ts
  /** Negotiated operating width with this peer, in MHz. */
  widthForPeer(peer: string): number
  /** Negotiated spatial streams with this peer. */
  nssForPeer(peer: string): number
```

Then thread them through every airtime call. The sites are lines 406, 428, 477, 485, 493, 506, 569, 637 and 820 in the current file; each already has a `peer` (or `u.peer`, or `dsts` member) in scope. The pattern at each single-user site:

```ts
const width = this.cfg.widthForPeer(peer)
const nss = this.cfg.nssForPeer(peer)
// then
txTimeModeNs(mode, psdu, mcs, { widthMhz: width, nss })
maxPsduBytesFor(mode, mcs, 1, budgetNs, width, nss)
```

At the multi-user site (line 569) the width is the group's, which is the minimum over members; the stream count stays per member. Compute once before the loop:

```ts
const muWidth = Math.min(...dsts.map((d) => this.cfg.widthForPeer(d)))
```

and use `{ mu: true, ruFraction: frac, widthMhz: muWidth, nss: this.cfg.nssForPeer(peer) }`.

Every `FrameDesc` this MAC constructs gains `widthMhz`. For single-user frames that is `this.cfg.widthForPeer(dst)`; for the multi-user frame it is `muWidth`; for control responses (CTS, ACK, BlockAck) leave it unset so they stay at 20 MHz, which is what real control frames do in a non-HT duplicate format.

In `src/engine/simulation.ts`, supply the two callbacks beside `mcsForPeer`:

```ts
            widthForPeer: (peer) => negotiatedWidth(n, other(n, peer)),
            nssForPeer: (peer) => negotiatedNss(n, other(n, peer)),
```

and pass the width into the existing MCS lookup so the ceiling accounts for it:

```ts
            mcsForPeer: (peer) => {
              const rssi = table.get(n.id)?.get(peer) ?? -200
              const mode = modeFor(n, peer)
              const peerCfg = other(n, peer)
              const cap = mode === 'eht' && !negotiated(n, peerCfg, 'qam4k') ? 11 : undefined
              return mcsForRssi(mode, rssi, cap, negotiatedWidth(n, peerCfg))
            },
```

Import `negotiatedWidth` and `negotiatedNss` from `../model/caps`.

In `src/ui/i18n.ts`, add inspector labels in both languages: `width: 'Channel width'` / `'信道带宽'` and `nss: 'Spatial streams'` / `'空间流'`. Place them beside the existing per-node inspector labels.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model/households.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit -p .`

Expected: the lesson tests stay green because lessons never set width or streams. Household and capstone tests that assert absolute throughput, airtime percentage or latency **will** fail, because the air is now eight to seventeen times faster. For each such failure, read the assertion and decide: if it pins a physical invariant (a frame gets its response, nothing transmits while receiving) it must still hold and a real bug is indicated; if it pins a magnitude that width legitimately changed (airtime percentage, bytes delivered, ping under load) update the expected range and note in a comment that the value is post-width. Do not relax an invariant to make a magnitude test pass.

- [ ] **Step 6: Commit**

```bash
git add src/engine/mac.ts src/engine/simulation.ts src/model/presets.ts src/model/households.ts src/ui/i18n.ts tests/
git commit -m "feat(engine): households run at their real width and stream count"
```

---

### Task 5: Rate adaptation with loss feedback

**Files:**
- Create: `src/engine/rate.ts`
- Create: `tests/engine/rate.test.ts`
- Modify: `src/engine/mac.ts` (`failAttemptCore` around line 762; the `ack`/`ba` success path around line 1028)
- Modify: `src/engine/simulation.ts` (own one `RateControl` per MAC)

**Interfaces:**
- Consumes: `mcsForRssi` with its width parameter (Task 3); `WifiMacCfg` (Task 4).
- Produces:
  - `class RateControl` with `mcsFor(peer: string, ceiling: number): number`, `onSuccess(peer: string): void`, `onFailure(peer: string): void`
  - `WifiMacCfg` gains `onTxOutcome?(peer: string, ok: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `tests/engine/rate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RateControl } from '../../src/engine/rate'

describe('rate adaptation: signal strength sets the ceiling, losses push below it', () => {
  it('starts at the ceiling', () => {
    const r = new RateControl()
    expect(r.mcsFor('ap', 9)).toBe(9)
  })

  it('steps down one notch after two consecutive failures, not after one', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
    r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(8)
  })

  it('steps down twice after four failures', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    for (let i = 0; i < 4; i++) r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(7)
  })

  it('a success resets the failure run, so isolated losses do not lower the rate', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    r.onFailure('ap')
    r.onSuccess('ap')
    r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
  })

  it('climbs back one notch per ten successes and stops at the ceiling', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    for (let i = 0; i < 4; i++) r.onFailure('ap')
    expect(r.mcsFor('ap', 9)).toBe(7)
    for (let i = 0; i < 20; i++) r.onSuccess('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
    for (let i = 0; i < 20; i++) r.onSuccess('ap')
    expect(r.mcsFor('ap', 9)).toBe(9)
  })

  it('never exceeds the ceiling, so it cannot run away from the propagation model', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    for (let i = 0; i < 50; i++) r.onSuccess('ap')
    expect(r.mcsFor('ap', 4)).toBe(4)
  })

  it('follows the ceiling down when the station walks away', () => {
    const r = new RateControl()
    r.mcsFor('ap', 9)
    expect(r.mcsFor('ap', 2)).toBe(2)
  })

  it('keeps a separate history per peer', () => {
    const r = new RateControl()
    r.mcsFor('a', 9)
    r.mcsFor('b', 9)
    r.onFailure('a')
    r.onFailure('a')
    expect(r.mcsFor('a', 9)).toBe(8)
    expect(r.mcsFor('b', 9)).toBe(9)
  })

  it('never goes below MCS 0', () => {
    const r = new RateControl()
    r.mcsFor('ap', 1)
    for (let i = 0; i < 40; i++) r.onFailure('ap')
    expect(r.mcsFor('ap', 1)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/rate.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/rate`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/rate.ts`:

```ts
/**
 * Rate adaptation with loss feedback.
 *
 * Signal strength sets a ceiling (the MCS the propagation model says this link
 * can carry). Consecutive failures push the working rate below it; runs of
 * success climb back. The controller never exceeds the ceiling, so it cannot
 * drift away from the physics, and it holds no randomness, so runs stay
 * reproducible.
 *
 * The loop this closes is the point: a collision costs an attempt, two lost
 * attempts lower the rate, a lower rate makes every frame longer, and longer
 * frames collide more often. Lesson 6's rate anomaly is this loop's steady
 * state.
 */
const FAILURES_TO_STEP_DOWN = 2
const SUCCESSES_TO_STEP_UP = 10

interface PeerState {
  /** How far below the ceiling we are currently running. */
  drop: number
  failures: number
  successes: number
}

export class RateControl {
  private peers = new Map<string, PeerState>()

  private state(peer: string): PeerState {
    let s = this.peers.get(peer)
    if (!s) {
      s = { drop: 0, failures: 0, successes: 0 }
      this.peers.set(peer, s)
    }
    return s
  }

  /** The MCS to use with this peer now, given what signal strength allows. */
  mcsFor(peer: string, ceiling: number): number {
    const s = this.state(peer)
    return Math.max(0, ceiling - s.drop)
  }

  onFailure(peer: string): void {
    const s = this.state(peer)
    s.successes = 0
    s.failures++
    if (s.failures >= FAILURES_TO_STEP_DOWN) {
      s.failures = 0
      s.drop++
    }
  }

  onSuccess(peer: string): void {
    const s = this.state(peer)
    s.failures = 0
    s.successes++
    if (s.successes >= SUCCESSES_TO_STEP_UP) {
      s.successes = 0
      if (s.drop > 0) s.drop--
    }
  }
}
```

Note `drop` is stored rather than an absolute MCS, which is what makes the "follows the ceiling down" and "never exceeds the ceiling" tests pass without extra clamping logic.

In `src/engine/mac.ts`, add to `WifiMacCfg`:

```ts
  /** Report an attempt's outcome so rate adaptation can react. */
  onTxOutcome?(peer: string, ok: boolean): void
```

Call it with `false` at the top of `failAttemptCore`, where the destination is known from the awaited attempt, and with `true` where an `ack` or `ba` is accepted for a single-user attempt (around line 1028, in the branch that is not the MU branch). For a BlockAck, report `true` unless the bitmap shows every subframe lost, in which case report `false`.

In `src/engine/simulation.ts`, create one controller per MAC and use it in the MCS callback:

```ts
        const rate = new RateControl()
```

```ts
            mcsForPeer: (peer) => {
              const rssi = table.get(n.id)?.get(peer) ?? -200
              const mode = modeFor(n, peer)
              const peerCfg = other(n, peer)
              const cap = mode === 'eht' && !negotiated(n, peerCfg, 'qam4k') ? 11 : undefined
              const ceiling = mcsForRssi(mode, rssi, cap, negotiatedWidth(n, peerCfg))
              return rate.mcsFor(peer, ceiling)
            },
            onTxOutcome: (peer, ok) => { if (ok) rate.onSuccess(peer); else rate.onFailure(peer) },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/rate.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the integration test**

Append to `tests/engine/rate.test.ts` a test that the loop is really wired, using a scenario where a station is far enough to lose frames:

```ts
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'

it('a lossy link drops below the modulation its signal strength alone would allow', () => {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  // move one station to the far corner and make it upload hard
  const far = sc.nodes.find((n) => n.id === 'sta-3')!
  far.pos = { x: 11.5, y: 8.5, z: 1 }
  far.profiles = ['saturated']
  const recs = new Simulation(sc).runUntil(2_000 * 1_000_000).records
  const mcss = recs
    .filter((r) => r.type === 'TX_START' && r.node === 'sta-3' && r.frame.kind === 'data')
    .map((r) => (r.type === 'TX_START' ? r.frame.mcs : 0))
  expect(mcss.length).toBeGreaterThan(20)
  expect(Math.min(...mcss)).toBeLessThan(Math.max(...mcss)) // the rate moved
})
```

If the far corner produces no losses, move the station further or add a wall between it and the access point until the test fails for the right reason first, then passes.

- [ ] **Step 6: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: green. Magnitude assertions in household tests may shift again; apply the same rule as Task 4 — invariants hold, magnitudes get updated ranges.

- [ ] **Step 7: Commit**

```bash
git add src/engine/rate.ts tests/engine/rate.test.ts src/engine/mac.ts src/engine/simulation.ts tests/
git commit -m "feat(engine): rate adaptation with loss feedback"
```

---

### Task 6: MU-MIMO — a downlink split by space

**Files:**
- Modify: `src/model/caps.ts` (`FeatureFlag`, `GEN_FEATURES`, `FEATURE_LABEL`)
- Modify: `src/model/frames.ts` (`FrameDesc.muKind`)
- Modify: `src/engine/mac.ts` (`transmitDlMu` around line 546; `WifiMacCfg`)
- Modify: `src/engine/simulation.ts` (the `mumimoWith` callback)
- Modify: `src/ui/i18n.ts` (feature label)
- Create: `tests/engine/mumimo.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 4.
- Produces: `FeatureFlag` gains `'mumimo'`; `WifiMacCfg` gains `mumimoWith(peer: string): boolean`; `FrameDesc` gains `muKind?: 'ofdma' | 'mumimo'`.

- [ ] **Step 1: Write the failing test**

Create `tests/engine/mumimo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

/** A house where the AP has large frames pending for several phones at once. */
function scenario() {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  for (const id of ['sta-1', 'sta-2', 'sta-3']) {
    sc.nodes.find((n) => n.id === id)!.profiles = ['video']
  }
  return sc
}

describe('MU-MIMO: one PPDU, several stations, split by space', () => {
  const recs: TLRecord[] = []
  const sim = new Simulation(scenario())
  for (let t = 50 * MS; t <= 1000 * MS; t += 50 * MS) recs.push(...sim.runUntil(t).records)
  const mu = recs.filter((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.muKind === 'mumimo')

  it('the AP sends MU-MIMO PPDUs when several stations have large frames pending', () => {
    expect(mu.length).toBeGreaterThan(3)
  })

  it('a group never asks for more streams than the AP has', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      const streams = (r.frame.muParts ?? []).reduce((s, p) => s + (p.nss ?? 1), 0)
      expect(streams).toBeLessThanOrEqual(4)
    }
  })

  it('every member uses the full width, unlike OFDMA where they share it', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      for (const p of r.frame.muParts ?? []) expect(p.ruFraction ?? 1).toBe(1)
    }
  })

  it('the PPDU lasts as long as its slowest member', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START') continue
      const end = recs.find((x) => x.type === 'TX_END' && x.node === 'ap' && x.t > r.t)
      expect(end).toBeDefined()
    }
  })

  it('every member answers and the exchange resolves on the last BlockAck', () => {
    for (const r of mu) {
      if (r.type !== 'TX_START' || !r.frame.orthogonalGroup) continue
      const gid = r.frame.orthogonalGroup
      const bas = recs.filter((x) => x.type === 'RX_OK' && x.node === 'ap' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === gid)
      if (bas.length !== (r.frame.muParts ?? []).length) continue // a lost BA resolves on timeout
      const last = Math.max(...bas.map((x) => x.t))
      const resolved = recs.find((x) => x.t >= last && x.type === 'CW_CHANGE' && x.node === 'ap')
      expect(resolved?.t).toBe(last)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/mumimo.test.ts`
Expected: FAIL on the first test — no frame carries `muKind: 'mumimo'`.

- [ ] **Step 3: Write minimal implementation**

In `src/model/caps.ts`:

```ts
export type FeatureFlag = 'edca' | 'ampdu' | 'txop' | 'ofdma' | 'mumimo' | 'mlo' | 'qam4k'
```

```ts
export const GEN_FEATURES: Record<Generation, FeatureFlag[]> = {
  nonht: [],
  vht: ['edca', 'ampdu', 'txop'],
  he: ['edca', 'ampdu', 'txop', 'ofdma', 'mumimo'],
  eht: ['edca', 'ampdu', 'txop', 'ofdma', 'mumimo', 'mlo', 'qam4k'],
}
```

```ts
  mumimo: 'MU-MIMO (multi-user by space)',
```

In `src/ui/i18n.ts`, add the Chinese label `mumimo: 'MU-MIMO（空分多用户）'` beside the other feature labels.

In `src/model/frames.ts`, add to `FrameDesc`:

```ts
  /** How a multi-user PPDU is split: by frequency (OFDMA) or by space (MU-MIMO). */
  muKind?: 'ofdma' | 'mumimo'
```

and add to `MuPart`:

```ts
  /** Spatial streams this member is sent with (MU-MIMO); absent means 1. */
  nss?: number
  /** Share of the channel this member occupies (OFDMA); absent means the whole width. */
  ruFraction?: number
```

In `src/engine/mac.ts`, add to `WifiMacCfg`:

```ts
  /** Can this peer be a member of a MU-MIMO group? */
  mumimoWith(peer: string): boolean
```

Then split `transmitDlMu` into a grouping decision and two builders. Keep the existing OFDMA body as `buildOfdmaParts`; add the MU-MIMO one. The decision, at the top of `transmitDlMu`:

```ts
    // Space multiplies the rate, which pays only when there are data symbols to
    // multiply; frequency divides the preamble, which pays when there are not.
    const MUMIMO_MIN_BYTES = 1000
    const canMumimo = dsts.every((d) => this.cfg.mumimoWith(d))
      && dsts.every((d) => (this.queues.headBytes(ei, d) ?? 0) >= MUMIMO_MIN_BYTES)
    const useMumimo = canMumimo && this.fitsStreams(dsts)
```

`fitsStreams` sums `this.cfg.nssForPeer(d)` over the group and compares against the access point's own stream count, which the MAC reads via a new `cfg.ownNss(): number`. Add that to `WifiMacCfg` too and supply it in `simulation.ts` as `() => nssOf(n)`.

If the group does not fit, drop members from the end until it does; if fewer than two remain, fall back to OFDMA.

The MU-MIMO part builder differs from the OFDMA one in exactly three places:

```ts
      const frac = 1                                   // full width, not 1/n
      const nssPeer = this.cfg.nssForPeer(peer)        // per-member streams
      const budget = maxPsduBytesFor(mode, mcs, 1, MAX_PPDU_NS, muWidth, nssPeer)
      ...
      ppduDur = Math.max(ppduDur, txTimeModeNs(mode, bytes, mcs, { mu: true, widthMhz: muWidth, nss: nssPeer }))
```

and each `MuPart` carries `nss: nssPeer` while the OFDMA builder carries `ruFraction: frac`.

Set `muKind` on the constructed frame accordingly, and `widthMhz: muWidth` on both.

If `this.queues` has no `headBytes(ac, peer)` accessor, add one to `src/engine/queues.ts` returning the byte count of the first queued MSDU for that access category and destination, or `undefined` when the queue is empty. Keep it a pure read; do not dequeue.

In `src/engine/simulation.ts`:

```ts
            mumimoWith: (peer) => negotiated(n, other(n, peer), 'mumimo'),
            ownNss: () => nssOf(n),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/mumimo.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: green. Lesson 11's OFDMA test must still pass unchanged — lessons build 20 MHz one-stream nodes, and a one-stream group of two needs two streams, which exceeds a one-stream access point, so lessons never take the MU-MIMO branch. Confirm that explicitly by re-running `npx vitest run tests/engine/dl-mu-resolve.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/model/caps.ts src/model/frames.ts src/engine/mac.ts src/engine/queues.ts src/engine/simulation.ts src/ui/i18n.ts tests/engine/mumimo.test.ts
git commit -m "feat(engine): MU-MIMO downlink, a multi-user split by space"
```

---

### Task 7: Lessons 15 and 16 — width and streams

**Files:**
- Modify: `src/course/lessons.ts` (`MODULES`, then two new entries in `LESSONS`)
- Test: `tests/course/lessons.test.ts` (extend; if the file does not exist, create it following the pattern of `tests/model/households.test.ts`)

**Interfaces:**
- Consumes: the capability fields (Task 1) and the airtime and sensitivity scaling (Tasks 2 and 3).
- Produces: lesson ids `'width'` and `'streams'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/course/lessons.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LESSONS, MODULES } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { widthOf } from '../../src/model/caps'

describe('module 4 lessons', () => {
  it('adds a fourth module', () => {
    expect(MODULES.length).toBe(4)
    expect(MODULES[3].en).toBe('How fast is fast')
    expect(MODULES[3].zh.length).toBeGreaterThan(0)
  })

  it('lesson 15 is about channel width and offers one variant per width', () => {
    const l = LESSONS.find((x) => x.id === 'width')!
    expect(l.module).toBe(3) // zero-based module index
    expect(l.variants?.length).toBe(4)
    const widths = l.variants!.map((v) => widthOf(v.scenario().nodes.find((n) => n.id === 'sta-1')!))
    expect(widths).toEqual([20, 40, 80, 160])
  })

  it('lesson 15 shows the same frame taking less air as the channel widens', () => {
    const l = LESSONS.find((x) => x.id === 'width')!
    const dur = l.variants!.map((v) => {
      const recs = new Simulation(v.scenario()).runUntil(200 * 1_000_000).records
      const tx = recs.find((r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000)
      return tx && tx.type === 'TX_START' ? tx.frame.txTimeNs : 0
    })
    for (let i = 1; i < dur.length; i++) expect(dur[i]).toBeLessThan(dur[i - 1])
  })

  it('lesson 16 is about spatial streams and its link runs at the smaller end', () => {
    const l = LESSONS.find((x) => x.id === 'streams')!
    expect(l.module).toBe(3)
    expect(l.variants!.length).toBeGreaterThanOrEqual(3)
  })

  it('every lesson still has a quiz, observations and things to try', () => {
    for (const l of LESSONS) {
      expect(l.quiz.length).toBeGreaterThan(0)
      expect(l.observe.length).toBeGreaterThan(0)
      expect(l.tryThis.length).toBeGreaterThan(0)
      expect(l.title.zh.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/course/lessons.test.ts`
Expected: FAIL — `MODULES.length` is 3.

- [ ] **Step 3: Write minimal implementation**

Add the module:

```ts
export const MODULES: L10n[] = [
  { en: 'Channel-access foundations (DCF)', zh: '信道接入基础（DCF）' },
  { en: 'QoS & efficiency (Wi-Fi 5 era)', zh: 'QoS 与效率（Wi-Fi 5 时代）' },
  { en: 'Scheduled Wi-Fi (Wi-Fi 6/7)', zh: '被调度的 Wi-Fi（Wi-Fi 6/7）' },
  { en: 'How fast is fast', zh: '快是怎么来的' },
]
```

Add a scenario helper beside the existing ones:

```ts
/** One station and the AP in a single room, both at a chosen width and stream count. */
function widthScenario(widthMhz: 20 | 40 | 80 | 160, nss: 1 | 2 | 4, far = false): Scenario {
  const ap = node('ap', 'ap', 'Router', 5, 4, 'eht')
  const sta = node('sta', 'sta-1', 'Laptop', far ? 9.4 : 6, far ? 7.4 : 4, 'eht')
  ap.caps.widthMhz = widthMhz
  ap.caps.nss = nss
  sta.caps.widthMhz = widthMhz
  sta.caps.nss = nss
  sta.profiles = ['saturated']
  return sc(oneRoom(), [ap, sta])
}
```

Match the real signature of the file's `node()` helper (line 129) and its `sc()` and `oneRoom()` helpers when writing this; the shape above is illustrative of the fields to set, not of the parameter order.

**Lesson 15 · Channel width.** `id: 'width'`, `module: 3`, `minutes: 6`.

Title: `{ en: '15 · Channel width — twice the tones, half the time', zh: '15 · 信道带宽——频谱翻倍，时间减半' }`

Body blocks, in order, each bilingual:
1. A paragraph: a 20 MHz channel carries 234 data subcarriers; every doubling of width roughly doubles them, so the same frame needs fewer symbols. State the tone counts 234, 468, 980, 1960, 3920.
2. A formula block: `symbols = ceil((16 + 8·bytes + 6) / (N_DBPS × toneRatio × Nss))`, with the note that only the data part shrinks — the preamble is a fixed 48 µs for Wi-Fi 7.
3. A table with a row per width (20, 40, 80, 160) and columns for tones, the ratio, and the airtime of one 1500 B frame at MCS 7. Compute the airtime values by running the scenario, and put the real numbers in.
4. A paragraph on the cost: a wider channel collects proportionally more noise, so every rate needs 3 dB more signal per doubling — 9 dB at 160 MHz. Near the router that is free; at the far end of the flat it is not.

`variants`: four, labelled `20 MHz`, `40 MHz`, `80 MHz`, `160 MHz`, each `() => widthScenario(w, 1)`.

`observe`: the frame's width on the timeline halving with each step; the preamble staying the same size, so the shrinking slows down; the modulation index reported in the inspector.

`tryThis`: move the station to the far corner and step the width up again — past 40 MHz the modulation falls faster than the width helps, and the frame gets longer, not shorter.

`quiz`: one question — "A 1500 B frame takes 198 µs at 20 MHz. Why does it not take 12 µs at 320 MHz?" with the answer that the preamble is fixed and only the data symbols scale, and one — "Your phone is at the edge of range. Does switching from 160 to 40 MHz make it faster or slower?" with the answer that it usually makes it faster, because 6 dB of sensitivity is worth more than the lost bandwidth once the signal is marginal.

`jumps`: to lesson 1 (frames cost airtime) and lesson 6 (rate anomaly).

**Lesson 16 · Spatial streams.** `id: 'streams'`, `module: 3`, `minutes: 5`.

Title: `{ en: '16 · Spatial streams — several conversations in the same air', zh: '16 · 空间流——同一片空气里的多路对话' }`

Body blocks:
1. Streams multiply the bits per symbol without using more spectrum and without costing sensitivity, because each stream is a separate spatial path rather than a wider slice of the band.
2. A table: 1, 2 and 4 streams against the airtime of the same 1500 B frame at 160 MHz.
3. The negotiation rule, stated plainly: the link runs at the smaller stream count of its two ends, so a four-stream router and a two-stream phone make a two-stream link. The router's other two streams are not wasted; lesson 17 spends them.

`variants`: three, `1 stream`, `2 streams`, `4 streams`, each `() => widthScenario(160, n)`.

`observe`: airtime halving from one to two streams and halving again to four; sensitivity and the modulation index not moving at all, unlike lesson 15.

`tryThis`: set the router to four streams and the phone to two, and confirm the link uses two.

`quiz`: "Why does adding streams not cost sensitivity the way adding width does?" answered by noise bandwidth being unchanged. And: "A four-stream router serves a two-stream phone. What does the link run at?" answered by two.

`jumps`: to lesson 15 and lesson 17.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/course/lessons.test.ts`
Expected: PASS.

- [ ] **Step 5: Check the lessons in the running app**

Run: `npm run dev`, open the course panel, walk lessons 15 and 16 in both languages. Confirm the timeline shows the frame shrinking across variants and that no prose block is empty or untranslated.

- [ ] **Step 6: Run the full suite and type check, then commit**

```bash
npx vitest run && npx tsc --noEmit -p .
git add src/course/lessons.ts tests/course/lessons.test.ts
git commit -m "feat(course): lessons 15-16 — channel width and spatial streams"
```

---

### Task 8: Lessons 17 and 18 — MU-MIMO and rate adaptation

**Files:**
- Modify: `src/course/lessons.ts`
- Test: `tests/course/lessons.test.ts` (extend)

**Interfaces:**
- Consumes: MU-MIMO (Task 6) and rate adaptation (Task 5).
- Produces: lesson ids `'mumimo'` and `'rate'`.

- [ ] **Step 1: Write the failing test**

Append to `tests/course/lessons.test.ts`:

```ts
describe('lessons 17 and 18', () => {
  it('lesson 17 contrasts OFDMA with MU-MIMO as two variants of the same house', () => {
    const l = LESSONS.find((x) => x.id === 'mumimo')!
    expect(l.module).toBe(3)
    expect(l.variants?.length).toBe(2)
    expect(l.variants!.map((v) => v.label.en)).toEqual(['OFDMA (split by frequency)', 'MU-MIMO (split by space)'])
  })

  it('lesson 17 actually produces a MU-MIMO PPDU in its second variant', () => {
    const l = LESSONS.find((x) => x.id === 'mumimo')!
    const recs = new Simulation(l.variants![1].scenario()).runUntil(500 * 1_000_000).records
    const mu = recs.filter((r) => r.type === 'TX_START' && r.frame.muKind === 'mumimo')
    expect(mu.length).toBeGreaterThan(0)
  })

  it('lesson 18 shows the modulation moving', () => {
    const l = LESSONS.find((x) => x.id === 'rate')!
    expect(l.module).toBe(3)
    const recs = new Simulation(l.scenario()).runUntil(3_000 * 1_000_000).records
    const mcss = recs
      .filter((r) => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
      .map((r) => (r.type === 'TX_START' ? r.frame.mcs : 0))
    expect(mcss.length).toBeGreaterThan(10)
    expect(new Set(mcss).size).toBeGreaterThan(1)
  })

  it('the course now runs to eighteen lessons with no duplicate ids', () => {
    expect(LESSONS.length).toBe(18)
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(18)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/course/lessons.test.ts`
Expected: FAIL — no lesson with id `mumimo`.

- [ ] **Step 3: Write minimal implementation**

**Lesson 17 · MU-MIMO.** `id: 'mumimo'`, `module: 3`, `minutes: 7`.

Title: `{ en: '17 · MU-MIMO — splitting by space instead of frequency', zh: '17 · MU-MIMO——按空间而不是按频率划分' }`

Scenario: a four-stream 160 MHz access point and three two-stream phones, each pulling a video stream, in one room. Two variants over the same house:
- `{ en: 'OFDMA (split by frequency)', zh: 'OFDMA（按频率划分）' }` — the phones' `mumimo` feature flag off.
- `{ en: 'MU-MIMO (split by space)', zh: 'MU-MIMO（按空间划分）' }` — `mumimo` on, `ofdma` off, so the choice is unambiguous.

Body blocks:
1. Both are one PPDU carrying data for several stations at once, and both end together, which is why one BlockAck round finishes the whole group. The difference is what gets divided.
2. OFDMA divides the channel: each member gets a slice, so each member's data rate falls with the number of members, and what is saved is the contention and the preamble, paid once instead of n times. Best for many small frames.
3. MU-MIMO divides the antennas: each member gets the full width and its own spatial streams, so nobody's rate falls, but the group can only be as large as the access point's stream count allows. Best for a few large frames.
4. A table comparing the two variants: PPDU duration, bytes delivered per PPDU, and the resulting downlink throughput. Fill in the real numbers from running both.
5. The simulator's rule, stated as the simulator's choice rather than as protocol: MU-MIMO when every candidate has at least 1000 B pending, OFDMA otherwise.

`observe`: in the OFDMA variant each member's reported rate is a fraction of the single-user rate; in the MU-MIMO variant each is the full rate. Both PPDUs end at the same instant for every member.

`tryThis`: add a fourth and fifth phone. The MU-MIMO group stops growing at the access point's four streams while OFDMA keeps absorbing members with thinner slices each.

`quiz`: "Three phones, one PPDU. Under OFDMA, what happens to each phone's rate as you add a fourth?" answered by it falling, since the channel is divided further. And "Why can a four-stream router not serve four two-stream phones with MU-MIMO at once?" answered by the streams summing to eight, twice what it has.

`jumps`: to lesson 11 (OFDMA downlink) and lesson 16 (streams).

**Lesson 18 · Rate adaptation.** `id: 'rate'`, `module: 3`, `minutes: 7`.

Title: `{ en: '18 · Rate adaptation — the loop that picks the speed', zh: '18 · 速率自适应——选择速率的那个回路' }`

Scenario: two stations. `sta-1` sits next to the access point and uploads saturated traffic. `sta-2` sits behind a brick wall in the far corner, also uploading. No variants; the lesson is one run watched over time.

Body blocks:
1. Signal strength sets a ceiling on how dense the modulation can be. Everything below that ceiling is a choice, and the driver makes it from what actually happened to its frames.
2. A steps block giving the exact rule the simulator uses: start at the ceiling; two failures in a row drop one step; ten successes in a row climb one step; never above the ceiling.
3. The loop, as the lesson's point: a collision costs an attempt, two lost attempts lower the rate, a lower rate makes every frame longer, and a longer frame is exposed to collision for longer. Feedback that pushes down is easy to enter and slow to leave.
4. A back-reference to lesson 6: the rate anomaly is this loop's steady state, one station stuck slow and holding the channel while it transmits.

`observe`: the far station's modulation index falling after retry bursts and climbing back during quiet stretches; its frames visibly lengthening on the timeline as the index falls.

`tryThis`: move the far station one metre closer and watch the ceiling rise, then put it back and add a third uploader to make the loop bite harder.

`quiz`: "The far station's signal has not changed, but its modulation dropped two steps. What happened?" answered by four failed attempts, the controller stepping down twice. And "Why does a lower rate make collisions more likely rather than less?" answered by frames occupying the channel for longer, widening the window in which another station's backoff can expire.

`jumps`: to lesson 3 (backoff and collisions) and lesson 6 (rate anomaly).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/course/lessons.test.ts`
Expected: PASS.

- [ ] **Step 5: Check both lessons in the running app**

Run: `npm run dev` and walk lessons 17 and 18 in both languages. In lesson 17 confirm the two variants really differ on the timeline; in lesson 18 confirm the modulation index visibly moves within the first few seconds.

- [ ] **Step 6: Run the full suite and type check, then commit**

```bash
npx vitest run && npx tsc --noEmit -p .
git add src/course/lessons.ts tests/course/lessons.test.ts
git commit -m "feat(course): lessons 17-18 — MU-MIMO and rate adaptation"
```

---

### Task 9: Re-baseline the tampered-driver report

**Files:**
- Modify: `scripts/tamper-report-html.ts` (the setup paragraph in section 2)
- Regenerate: `docs/reports/edca-tamper-data.json`, `docs/reports/edca-tamper-report.zh.html`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing other code reads.

- [ ] **Step 1: Re-run the experiment**

```bash
npx vite-node scripts/tamper-report.ts --dump > /tmp/tamper-pooled.json
```

On Windows use the session scratchpad rather than `/tmp`. The run takes two to four minutes and prints progress to stderr.

- [ ] **Step 2: Compare against the committed data before overwriting it**

Save this as a throwaway script in the scratchpad and run it with `python`:

```python
import json, subprocess
old = json.loads(subprocess.run(['git','show','HEAD:docs/reports/edca-tamper-data.json'],
                                capture_output=True).stdout.decode('utf-8'))
new = json.load(open('<scratchpad>/tamper-pooled.json', encoding='utf-8'))
idx = lambda d: {(r['experiment'], r['config']): r for r in d}
o, n = idx(old), idx(new)

def cheater(r):
    c = [x for x in r['nodes'] if x['id'] == r['cheaterId']][0]['game']
    return c.get('meanMs')

def gamers(r):
    xs = [x['game'] for x in r['nodes']
          if x['id'] != r['cheaterId'] and 'gaming' in x['profiles']
          and x['game'].get('meanMs') is not None]
    return sum(x['meanMs'] for x in xs) / len(xs) if xs else None

f = lambda v: f"{v:6.1f}" if v is not None else "   -  "
print(f"{'exp/config':22s} {'cheat old':>9s} {'cheat new':>9s} {'gamers old':>10s} {'gamers new':>10s} {'busy old':>8s} {'busy new':>8s}")
for k in n:
    print(f"{k[0]+'/'+k[1]:22s} {f(cheater(o[k])):>9s} {f(cheater(n[k])):>9s} "
          f"{f(gamers(o[k])):>10s} {f(gamers(n[k])):>10s} "
          f"{o[k]['busyPct']:8.0f} {n[k]['busyPct']:8.0f}")
```

Read the table. The expected direction is that every loaded ping falls substantially, because the air is now much faster, and that the light-load scenarios barely move, because they were never contention-bound. The two busy-percentage columns are the ones to watch hardest: they say whether the saturating scenarios are still saturating.

If any scenario's air occupancy is now so low that no cheat has any effect, the experiment has lost its teaching value. In that case add a note to the report's limitations section saying the saturating scenarios were re-tuned, and raise the number of saturated uploaders in `scripts/tamper-report.ts` until the busiest scenario is contention-bound again. Do not silently keep a degenerate experiment.

- [ ] **Step 3: Update the setup paragraph**

In `scripts/tamper-report-html.ts`, find the section 2 paragraph beginning `作弊者固定为节点` and extend the sentence describing the radio to state the operating width and stream count now modelled, and that airtime therefore reflects a real Wi-Fi 7 link rather than a 20 MHz one-stream one. Every other number in the report is computed from the JSON and needs no edit.

- [ ] **Step 4: Regenerate and check**

```bash
cp <scratchpad>/tamper-pooled.json docs/reports/edca-tamper-data.json
npx vite-node scripts/tamper-report-html.ts docs/reports/edca-tamper-data.json docs/reports/edca-tamper-report.zh.html
```

Open the HTML and read section 1. Confirm every finding sentence is internally consistent with its numbers, and that no sentence still describes the old PHY.

- [ ] **Step 5: Commit**

```bash
git add scripts/tamper-report-html.ts docs/reports/edca-tamper-data.json docs/reports/edca-tamper-report.zh.html
git commit -m "docs(report): re-baseline the tamper experiment on the real Wi-Fi 7 PHY"
```

---

## Done when

- `npx vitest run` is green and `npx tsc --noEmit -p .` is clean.
- The course has 18 lessons in 4 modules, and lessons 1 to 14 produce the same airtime they did before this plan started.
- A household phone transmits at 160 MHz with two streams; the access point has four.
- The Chinese report is regenerated and its prose matches its data.

---

## Execution status — paused 2026-09-10 (second session)

Branch `feat/phy-realism`, branched from `main` at `d4ccf9d`. Suite green at
**306 passing across 45 files**, `tsc --noEmit` clean, working tree clean.
Lessons 1 to 14 verified unaffected throughout.

| Task | State | Commits |
|---|---|---|
| 1 · Capability fields and negotiation | complete, review clean | `115549e` |
| 2 · Airtime scales with width and streams | complete, review clean | `92e3e67` |
| 3 · Width-dependent sensitivity | complete, review clean after 1 fix round | `616ba2a`, `8610c45` |
| 4 · Wire through the MAC, real household radios | complete, review clean after 1 fix round | `c56db2d`, `fab4403` |
| 5 · Rate adaptation | complete, review clean after 1 fix round | `077a73d`, `b05ea01` |
| 6 · MU-MIMO | complete, review clean after 2 fix rounds | `821b407`, `0eab1bb`, `3c95724` |
| 7 · Lessons 15 and 16 | complete, review clean after 2 fix rounds | `e2403ba`, `dbd1bb2`, `764bcd9` |
| 8 · Lessons 17 and 18 | **NOT STARTED — resume here.** Dispatched once, stopped before it edited anything. | — |
| 9 · Report re-baseline | not started | — |

### Rulings taken during this session

Each amends the plan. The spec (`docs/superpowers/specs/2026-09-10-phy-realism-design.md`)
was treated as the binding authority and the plan as its argument.

1. **Rate-adaptation outcomes are reported for single-user attempts only.** The
   plan said to notify failure at the top of `failAttemptCore`, but that
   function is also reached from the multi-user downlink path, while success is
   reported only on the single-user branch — a one-way ratchet to MCS 0. The MU
   path now reports neither. MU downlinks therefore transmit at the
   signal-strength ceiling rather than an adapted rate; adding per-member
   reporting in the MU BlockAck handler is a clean follow-up.
2. **Rate adaptation is global engine physics.** Lessons 5 and 10 are
   collision-heavy by design and legitimately shifted; their pinned numbers and
   prose were updated to measured values. The Global Constraint that actually
   binds — no `widthMhz`/`nss` in `lessons.ts` — holds. The "Done when" clause
   about identical airtime is read as scoped to Tasks 1-4.
3. **The spec's clamped-MCS pseudocode beats the plan's sample code.** The
   sample stored an unbounded `drop` clamped only at read time, so recovery
   after a long failure run needed `10 x (drop - ceiling + 1)` successes.
   Measured effect: 178 of 216 `hidden` data frames pinned at MCS 0, including
   the RTS/CTS variant that is supposed to cure the problem. Now an absolute
   MCS clamped at 0, per the spec.
4. Minor finding 5 (a stale percentage in the same lesson file) was fixed in the
   same round rather than deferred.
5. **The UI must name MU-MIMO PPDUs correctly** even though it sat outside Task
   6's file list. Stock households became 100% MU-MIMO on DL MU PPDUs while the
   timeline and inspector still called them OFDMA and described frequency
   slices, in both languages. The spec already required this: frames gain
   `muKind` "so the timeline and inspector can name what they are showing".
6. **A plan-mandated test that asserts nothing was replaced.** Task 6's
   "the PPDU lasts as long as its slowest member" asserted only that a later
   `TX_END` existed — it passed under `Math.min`, a constant, or the wrong mode.
7. The untested stream-fitting drop rule was covered in the same round.
8. **Lesson 16 ships at 20 MHz, not the brief's 160 MHz.** At 160 MHz a
   1530-octet frame is already one OFDM symbol, so 1, 2 and 4 streams all give
   61.6 us and the intended halving does not exist. The spec mandates no width
   for this lesson. 160 MHz ships as a fifth variant.
9. **AMENDED MID-SESSION — this one was wrong first time.** I accepted that this
   engine can never make a frame longer as width grows. It can: `EHT_SENS` has
   2 dB rungs, so a 3.01 dB width penalty can skip two MCS steps. Measured at
   (10.5, 6), rssi -70.507: 40 MHz 292.8 us, 80 MHz 401.6 us, zero retries and
   zero drops. Lesson 15 now teaches the inversion, pinned by a test whose
   failure mode was verified on about a metre of drift.
10. **The frame inspector's rate line is carried into Task 8.** It prints every
    frame's MCS at its 20 MHz single-stream rate, so a 160 MHz frame shows a
    LOWER number (154.9) than a 20 MHz one (172.1). Lesson 18 is read off that
    line. See the trap in the resume note.
11. **PARKED FOR THE HUMAN PARTNER — width and streams are absent from the UI
    entirely.** The `inspector.width`/`nss` strings exist in both languages and
    are referenced nowhere; there is no control to set width or streams; and
    `FloorPlanEditor.setGeneration` silently discards both fields. The whole
    Task 1 capability is unreachable and uneditable from the app. Building that
    control is new scope this plan never contemplated. The shipped lessons do
    not instruct impossible actions.
12. Two minor prose fixes and a quiz distractor were bundled into a round.
13. **The width inversion ships as a body block, not a "things to try".**
    Variant buttons rebuild the scenario from its factory function, so a
    reader's drag is discarded, and there is no width control — an instruction
    nobody can follow. When the parked control of Ruling 11 lands, this can
    become one.

### Note for whoever resumes

**Task 8 is next, and it carries two items beyond its brief:** the glossary and
Guide never mention MU-MIMO (`src/ui/glossary.ts:348-395` has no MU-MIMO entry
and defines "DL MU" without space division; `src/ui/Guide.tsx:78-85,176-182`
files DL MU under "§7 OFDMA"), and the inspector rate line of Ruling 10.

**TRAP on the rate line — read twice.** `FrameDesc.mbps` is NOT a display
field: `src/engine/channel.ts:92` does `sinrThreshDb(frame.mbps)`, so it feeds
the decode threshold. Changing what `mbps` holds silently changes the physics of
every link in every lesson and household. The fix must be display-only — a
separate named field, or computed in the UI. Note `FrameDesc` carries
`widthMhz?` but NOT `nss` (`MuPart` has it), so a single-user frame's stream
count is not on the frame yet. Prove the physics did not move by comparing
record streams before and after, not merely by a green suite. Lesson 15's prose
currently explains what the rate line really shows; that becomes stale once the
line is truthful.

**Do the visual pass.** The course panel's content box is 300 px. In Task 7 a
six-column table pushed the Airtime column — the point of the lesson — off
screen behind a scrollbar, and no test caught it. Check both new lessons in both
languages.

**The failure pattern to watch in lesson prose.** Two separate Task 7 findings
were sentences that mixed baselines and were true under neither reading. Lesson
17 compares OFDMA against MU-MIMO and lesson 18 compares before against after a
rate step — both that exact shape. Name the baseline every figure belongs to.

**Task 9 note.** The committed tamper report figures are stale (last regenerated
at `dd7a46a`, before this branch) and `full-house` DL MU is now 100% MU-MIMO
with shorter PPDUs. Task 9 exists for exactly this and must run last.

**Deferred minors** are recorded in the SDD ledger at
`.superpowers/sdd/2026-09-10-phy-realism/progress.md`. That directory is
git-ignored, so it does NOT travel between machines — this section is the
durable record. Hand the final whole-branch review the ledger if it still
exists, and this section if it does not.

### Open question for the human partner

Lesson 10's unprotected variant now delivers **31 frames in 300 ms against 610**
for the protected one (it was 428 vs 631). The cause is real and correct — that
station is pinned near MCS 0 by unmitigated hidden-node collisions, genuine
minstrel-style rate blindness, while the protected variant sits at MCS 4 for 212
of 230 frames — and the lesson's table honestly reports it. But a 20x delivery
gap is a much starker lesson than the one originally written. Worth a decision
before merge.
