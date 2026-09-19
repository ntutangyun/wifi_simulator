# Task 3 report — Wi-Fi side of the coupling

**Status:** done. `src/engine/channel.ts`, `src/engine/simulation.ts`, `tests/engine/channel-spectrum.test.ts`.

## What changed

### `Channel` (`src/engine/channel.ts`)

- New exported `ChannelSpectrum` = `{ s: Spectrum; posOf(id): Vec3; txPowerOf(id): number; centerMhz: number;
  widthMhz: number }`, taken as an optional 5th constructor argument. `widthMhz` is the link's operating
  channel width (energy detect listens over the whole channel); a PPDU's own band comes from its `widthMhz`.
- `ActiveTx.emission?: Emission` holds the object handed to `Spectrum.emit`, so `endTx` retires *that* object
  (the mediator now matches on identity only).
- `startTx` emits `{ txId, eirpDbm: txPowerOf(node), band = centerMhz ± ppduWidth/2, pos: posOf(node) }` on the
  `'wifi'` side; `endTx` retires it.
- One private helper `ppduBand(frame, sp)` returns the band of a PPDU, using `ampNoiseBwMhz(frame)` so the
  foreign term is taken over exactly the bandwidth the noise term already uses.
- Foreign power is added in three places, each guarded by `if (sp)`:
  - `interferenceMw(rid, lock)` — the lock's PPDU band (so `maxInterfMw` picks it up at lock time, on each
    new arrival in `applyOneTx`, and on every spectrum change);
  - `othersMw(rid, tx)` — preamble detection's noise term, in the arriving PPDU's band;
  - `updateAllCca` — the energy-detect sum, over `centerMhz ± widthMhz/2`. A foreign signal is never a
    detectable preamble, so it can only ever produce `cause: 'energy'`.
- The constructor registers `s.onChange('wifi', …)`: re-take `max` on every open lock of every radio, then
  `updateAllCca(t)`.
- **Without a spectrum nothing is added at all** — not a `+ 0`, not a call. `lesson-hashes` passes unregenerated.

### `Simulation` (`src/engine/simulation.ts`)

- `readonly spectrum: Spectrum | null = null` (public, for Task 4 to hand to `UwbNetwork`).
- `uwbNodes` moved above the `if (ap)` block (same filter, used in both places now).
- Inside the per-link loop, for `link === '6g'` with `sc.uwb?.channel === 5` and UWB nodes present: `widthMhz`
  = widest `negotiatedWidth(peer, ap, '6g')` among the link's non-AP members (`widthOf(ap, link)` when the AP
  is alone); if `uwbBandOverlap(centerMhz, max(widthMhz, 160), 5) > 0`, one `Spectrum(sc.walls, this.q, () =>
  this.nowNs)` is created, stored on `this.spectrum` and passed to that link's `Channel`. `centerMhz` is
  `sc.sixGhzCenterMhz ?? DEFAULT_SIX_GHZ_CENTER_MHZ`.

**Deviation from the brief, deliberate:** the brief specified the gate as `uwbBandOverlap(center, 160, 5) > 0`,
calling 160 MHz "the widest possible 6 GHz width". It is not — `MAX_WIDTH.eht` is 320 and `widthOf` caps a
6 GHz link at 320 MHz, so a 320 MHz channel that reaches into 6240 MHz would have been left uncoupled. The
gate uses `Math.max(widthMhz, 160)` instead: a strict superset of the brief's condition (never fewer
couplings, and never a false negative for the width the link actually runs). Every configuration named in the
brief still gives the expected `null`/instance.

## Tests — `tests/engine/channel-spectrum.test.ts` (8)

Levels are derived from the engine's own functions (`uwbInBandDbm`, `uwbToWifiPathLossDb`, `noiseDbm`,
`sinrThreshDb`, `CCA_ED_DBM`), not written out, so a change to the model moves the test with it.

1. **maxInterfMw includes the foreign term.** A −14 dBm UWB emission (6240–6739.2 MHz) 4 m from the receiver
   puts −82.69 dBm into the 80 MHz Wi-Fi channel at 6305 MHz. The rx level at which the reception flips from
   `RX_OK` to `RX_FAIL lowSinr` is asserted at ±0.05 dB around `sinrThreshDb(54) + (noise@80MHz ⊕ foreign)`,
   and the *same* level decodes cleanly against thermal noise alone — the 6.41 dB noise rise is the foreign
   term and nothing else.
2. **RX_OK → RX_FAIL lowSinr** when the emission is raised to +10 dBm (−58.69 dBm in band, 8.7 dB of SINR
   where 30 dB is needed); the reason is `lowSinr`, not `collision`, since no Wi-Fi transmitter overlapped.
3. **Preamble detection** (beyond the brief's list): at −56 dBm against that same +10 dBm emission there is
   2.7 dB, under the 4 dB detect floor → one `RX_MISS preambleSinr` and no lock; with an empty spectrum the
   same PPDU produces `RX_START`.
4. **CCA_BUSY 'energy'**: a +20 dBm emission (−48.7 dBm in band, above −62 dBm) on an idle radio gives exactly
   `[CCA_BUSY b energy, CCA_IDLE b]` once retired; the two nodes 100 m away never trip.
5. **No spectrum ⇒ no change**: a three-node run with a collision and CCA transitions produces record-for-record
   identical output with no spectrum argument and with a spectrum that has nothing on the air.
6–8. **`Simulation.spectrum`**: `null` for UWB-only (no AP), Wi-Fi-only, mixed at 5985, mixed with no
   `sixGhzCenterMhz` (default 5985) and mixed on UWB channel 9; a `Spectrum` instance for mixed at 6305 with
   UWB channel 5.

## Verification

- `npx tsc -b` — clean.
- `npx vitest run` — 101 files, **1152 tests, all passing**, including `lesson-hashes` (not regenerated).
- `npx vite build` — succeeds.
- No `any`, `@ts-ignore` or `as unknown as` added.

## Concerns for the reviewer

- `src/engine/spectrum.ts`, `src/engine/propagation.ts` and `tests/engine/spectrum.test.ts` were being edited
  in this worktree by another agent while this task ran (Task 2 follow-ups: `PL0_DB`/`PL_EXP` exported,
  `retire` matched by identity only, `uwbChannelOf` throwing off-band). Nothing here depends on the parts that
  changed, and the commit was made by explicit pathspec, so those edits are untouched and uncommitted. The
  identity-only `retire` is exactly what `ActiveTx.emission` provides.
- The Wi-Fi emission is registered before the `TX_START` record and retired before `TX_END`, both inside the
  same event, so the UWB side's phase-1 wake-up for a start is queued ahead of `applyPendingStarts`. This is
  invisible to the Wi-Fi side; Task 4 should confirm it is the ordering the UWB channel wants.
- `posOf`/`txPowerOf` look nodes up by physical id in the scenario map; they are only ever called for radios
  registered on the link, which are always scenario members.
