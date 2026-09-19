# Task 2 report — the `Spectrum` mediator

**Status:** done. Commit `cef2f62` on `feat/uwb-ranging` (worktree `feat-link-2g`).

## What was built

`src/engine/spectrum.ts` (new, no edits to any other file):

- `SpectrumSide = 'wifi' | 'uwb'`, `Emission { txId, eirpDbm, bandLoMhz, bandHiMhz, pos }`.
- `class Spectrum(walls: Wall[], q: EventQueue, now: () => Ns)` with `emit`, `retire`,
  `onChange`, `foreignMw`, `foreignDbm` exactly as the brief specifies.
- `wifiToUwbPathLossDb(dM, wallsDb)` = `46.7 + 30·log10(max(d, 0.1)) + wallsDb + 1.2`.
  The `1.2` is a local constant `WIFI_6G_EXTRA_LOSS_DB`, commented as a repeat of
  `LINK_EXTRA_LOSS_DB['6g']` in `src/engine/simulation.ts` — not imported, so that
  `simulation.ts → spectrum.ts` (tasks 3/4) cannot become a cycle.
- `uwbToWifiPathLossDb(dM, wallsDb, ch)` = `uwbPl0Db(ch) + 20·log10(max(d, 0.1)) + wallsDb`.
- `bandOverlapMhz(aLo, aHi, bLo, bHi)` is exported (computed in-module, nothing imported from
  the other agent's in-flight files). Only `uwbPl0Db`, `UWB_CHANNEL_MHZ` and `UwbChannelNo`
  come from `src/uwb/phy.ts`; `wallLossDb` from `src/engine/propagation.ts`; `Wall` from
  `src/model/scenario.ts` (type-only); `EventQueue` from `src/engine/events.ts`.

Arithmetic: in-band power is `eirpDbm + 10·log10(overlapMhz / (bandHi − bandLo))`, zero overlap
contributes nothing, distances are 3-D (`Math.hypot` over x/y/z), the sum is in mW and
`foreignDbm` returns `−Infinity` on a zero sum. The path-loss law is chosen by the *source*
side. A UWB emission's channel is derived from the nearest channel centre in `UWB_CHANNEL_MHZ`,
because `Emission` carries a band rather than a channel number.

Determinism: `emit`/`retire` schedule exactly one phase-1 callback at `now()` for the other
side, coalesced by a per-side `pendingAt: Ns | null` that is cleared when the callback fires, so
a burst of emissions at one instant wakes the other side once. Listeners fire in registration
order (over a copy of the list, so a listener may register another without disturbing the pass).

## Tests

`tests/engine/spectrum.test.ts` (12 tests), all against a real `EventQueue` with a `runUntil`
loop that advances a mutable clock:

- band overlap (80 MHz of channel 71 inside UWB ch 5; 0 against ch 9; a partial overlap);
- the two path-loss laws, including the `max(d, 0.1)` floor;
- Wi-Fi 20 dBm PPDU at 3 m seen by a UWB receiver querying 6240–6739.2 → **−42.2 dBm** (±0.1);
- the same emission queried on channel 9's band → **−Infinity** (and `foreignMw` exactly 0);
- UWB −14 dBm frame queried in 6265–6345 at 4 m → **−82.7 dBm** (±0.1);
- a side never hears its own emissions;
- two emissions sum in mW (exactly 2× and +3.01 dB);
- `retire` removes exactly one, then the band goes silent;
- a drywall on the direct ray costs exactly 5 dB;
- one notification per emit and per retire, ordered between a phase-0 and a phase-2 marker at
  the same instant (so phase 1 is proven), and only the other side hears it;
- three emits at one instant coalesce to one notification;
- listeners fire in registration order.

## Verification

- `npx vitest run tests/engine/spectrum.test.ts` — 12/12 pass.
- `npx tsc -b` — clean (exit 0). No `any`, `@ts-ignore` or `as unknown as`.
- `npx vitest run` (full suite) — 98 files, **1122 tests, all pass**; no failures at all, so
  nothing to attribute to the concurrent agent's in-flight files.

## Notes for tasks 3 and 4

- The brief's constructor takes `walls` once; the spec sketch passed `walls` per `foreignMw`
  call. The brief's shape was followed, so `Simulation` must build the `Spectrum` with the
  scenario's walls.
- `Emission` has no channel field, so a UWB emission's channel is inferred from its band centre.
  If slice 3 ever needs a band that is not centred on a standard channel, add `ch` to `Emission`
  rather than widening the inference.
- `retire` matches by object identity first, then falls back to the transmitter's oldest live
  emission with the same `txId`; passing back the same object is the intended use.
  *(Superseded by fix round 1 below: identity only, no fallback.)*

---

# Fix round 1

Review verdict: Spec APPROVED, Quality CHANGES REQUIRED (1 blocking, 5 minor).
Fix commit `d5334d4`, `fix(engine): Spectrum retires by identity; shared path-loss constants`,
touching `src/engine/spectrum.ts`, `tests/engine/spectrum.test.ts` and `src/engine/propagation.ts`
only. The public API the other agent imports is unchanged.

## Rulings applied

1. **`retire` by identity only (blocking, finding 1).** The `findIndex((x) => x.txId === e.txId)`
   fallback is gone; an emission that is not live is a no-op — nothing removed, no notification.
   The doc comment says so. Two cases added to the tests: a double `retire` of one object leaves a
   second live emission with the *same* `txId` on the air, and a never-registered emission with a
   matching `txId` removes nothing; both assert that no listener is woken by the no-ops.
2. **Shared Wi-Fi path-loss constants (finding 2).** `PL0_DB` and `PL_EXP` are now exported from
   `src/engine/propagation.ts` (with a comment saying why) and imported here; the local
   `WIFI_PL0_DB`/`WIFI_PL_EXP` copies are deleted. No cycle: `propagation.ts` imports nothing from
   the engine. `WIFI_6G_EXTRA_LOSS_DB = 1.2` stays local, documented as `LINK_EXTRA_LOSS_DB['6g']`,
   because `simulation.ts` imports *this* module.
3. **`UWB_PL_EXP` imported (finding 3).** Added to the existing `../uwb/phy` import; the
   re-declaration is deleted.
4. **Phase-1 notification kept (finding 4).** No code change. A comment on `notify` records that a
   phase-2 caller's notification is popped immediately after it, at the same instant and ahead of
   the rest of that phase, and that this is harmless because every consumer takes interference as a
   maximum over a whole reception.
5. **`uwbChannelOf` bounded (finding 5).** Candidates come from `UWB_CHANNELS = [5, 9] as const
   satisfies readonly UwbChannelNo[]` with centres read from `UWB_CHANNEL_MHZ`, and a centre more
   than `UWB_CHANNEL_MATCH_MHZ = 250` MHz from every channel centre throws
   `spectrum: UWB emission from <id> centred at <f> MHz is on no UWB channel`. Two tests: a
   2400–2480 MHz emission throws, and a genuine channel 9 emission resolves to channel 9 (pinned
   against `uwbToWifiPathLossDb(4, 0, 9)`, 1.8 dB above channel 5).
6. **Reference semantics documented (finding 6).** The `emit` doc comment states that the emission
   is held by reference, must not be mutated while live, and must be the same object handed to
   `retire`.

## Verification

- `npx vitest run tests/engine/spectrum.test.ts tests/engine/propagation.test.ts` —
  **27/27 pass** (15 spectrum, 12 propagation; spectrum grew from 12 to 15).
- `npx tsc -b` — clean. No `any`, `@ts-ignore` or `as unknown as` (grep clean). One type annotation
  was needed: `let best: UwbChannelNo = UWB_CHANNELS[0]`, since `as const` types element 0 as `5`.
- `src/engine/channel.ts` and `src/engine/simulation.ts` are modified in the worktree by the other
  agent; they were not read, edited or committed, and the commit was made by explicit pathspec.
