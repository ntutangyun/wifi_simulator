# Task 2 review — the `Spectrum` mediator

Scope: commit `cef2f62`, files `src/engine/spectrum.ts` and `tests/engine/spectrum.test.ts` only.
Uncommitted work in `src/uwb/phy.ts`, `src/model/scenario.ts`, the editor and i18n was ignored.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

## Verification run

- `npx vitest run tests/engine/spectrum.test.ts` — **12/12 pass** (450 ms).
- `npx tsc -b` — **exit 0, no diagnostics** (nothing to attribute to the other agent's files).
- No `any`, `@ts-ignore` or `as unknown as` anywhere in either file (grep clean).
- Arithmetic re-derived independently, not just re-read:
  - Wi-Fi 20 dBm at 3 m, full 80 MHz inside the UWB band: loss `46.7 + 30·log10 3 + 1.2 = 62.2136`,
    rx **−42.2136 dBm** — matches the brief's −42.2 ± 0.1.
  - `uwbPl0Db(5) = 48.6921`, `uwbPl0Db(9) = 50.4957` — matches the spec's "48.7 / 50.5".
  - UWB −14 dBm at 4 m into an 80 MHz Wi-Fi channel: in-band `−21.9518`, loss `60.7333`,
    rx **−82.6852 dBm** — matches the brief's −82.7 ± 0.1.

## Binding constraints — checked one by one

| Constraint | Result |
|---|---|
| `Spectrum(walls, q, now)`, `emit/retire(side, e)`, `onChange(target, fn)`, `foreignMw/foreignDbm(target, rxPos, lo, hi)` | signatures match the brief exactly (`:77-137`) |
| power in band = `eirp + 10·log10(overlap / width)` | `:121`, with an `overlap <= 0` and a `width <= 0` guard |
| Wi-Fi→UWB `46.7 + 30·log10(max(d,0.1)) + walls + 1.2` | `:41-45` |
| UWB→Wi-Fi `uwbPl0Db(ch) + 20·log10(max(d,0.1)) + walls` | `:48-50`; channel inferred from the band (accepted) |
| the **other** side's emissions only | `:114` `OTHER[target]`; covered by the "is silent when the other side has no live emission" test |
| one coalesced phase-1 notification per instant per side | `:139-151`; covered by the phase test and the burst test |
| listeners in registration order | `:147`, over a copy so a listener may register another; covered |
| determinism, no Map-order dependence | `live` and `listeners` are plain arrays inside a fixed-key `Record`; `foreignMw` sums in insertion order (`:116`). No `Map`, no `Object.keys`, no sort. Clean. |
| coalescing flag reset | reset inside the handler (`:146`) and nothing ever cancels the handle, so the flag cannot be stranded by a dropped event. Correct as written — see finding 4 for the one residual case. |
| wall loss argument order/units | `wallLossDb(e.pos, rxPos, this.walls)` (`:123`) — emitter then receiver, both `Vec3`; `wallLossDb` projects to 2-D internally, and distance is 3-D (`:73-75`), exactly as `rxPowerDbm` and `UwbChannel.rssiDbm` do it. Correct. |
| `1.2` documented as `LINK_EXTRA_LOSS_DB['6g']` | `:35-36`, with the no-cycle rationale. Sign checked against `simulation.ts:107-111` (`row.set(k, v - extra)` = 1.2 dB *more* loss). Correct. |

Both laws were checked against the engines they imitate: `wifiToUwbPathLossDb` reproduces
`propagation.ts:62` `pathLossDb` + walls + the 6 GHz extra loss, and `uwbToWifiPathLossDb`
reproduces `src/uwb/channel.ts:120-124` term for term. The model is faithful; findings 2 and 3
are about how it is *spelled*, not about the numbers.

Spec deltas versus `docs/superpowers/specs/2026-09-19-uwb-slices-design.md` Slice 3, both
resolved in the brief's favour and correctly flagged in the report: `Emission` drops
`startNs`/`endNs` (liveness is `emit`/`retire` instead), and `walls` moves from the `foreignMw`
call to the constructor.

## Findings

### 1. `retire`'s `txId` fallback can remove a different, still-live emission — **blocking** (quality)

`src/engine/spectrum.ts:97-105`

```ts
let i = list.indexOf(e)
if (i < 0) i = list.findIndex((x) => x.txId === e.txId)
```

**What.** When the exact object is not registered, `retire` deletes the transmitter's oldest live
emission instead. Nothing in the brief asks for this, and the report itself says "passing back the
same object is the intended use" — so the fallback only ever runs on a caller mistake, and when it
does it silently does damage rather than nothing.

**Why it matters.** The failure is ordinary, not exotic: a double retire of one PPDU (abort path
plus TX-end path, easy to write in task 3/4) is a no-op on the first fallback only while that
transmitter is idle. `emit(a, 'ap')` → `retire(a)` → `emit(b, 'ap')` → a stray second `retire(a)`
deletes **b**, a frame still on the air. The UWB side then stops seeing interference that is
physically still there, silently, with no record and no assertion — precisely the stated-versus-
simulated drift this project keeps hunting. The same reference-matching looseness also means
`emit(side, e)` twice with one object double-counts and un-retires only half.

**What to do.** Delete the `findIndex` fallback; make `retire` of an unregistered emission a
no-op (it already returns without notifying, which is the right behaviour) and say so in the
doc comment. If a by-id retire is genuinely wanted later, give it its own named method. Add the
two missing tests: retiring an unregistered emission changes no power and fires no notification,
and a double retire of the same object leaves a second live emission of the same `txId` alone.

### 2. Wi-Fi path-loss constants are copied from `propagation.ts` rather than reused — minor

`src/engine/spectrum.ts:32-34, 41-45`

**What.** `WIFI_PL0_DB = 46.7` and `WIFI_PL_EXP = 3.0` restate the module-private `PL0_DB` and
`PL_EXP` of `src/engine/propagation.ts:15-16`, and `wifiToUwbPathLossDb` re-implements
`pathLossDb(dM)` (same `Math.max(dM, 0.1)` floor).

**Why.** Two copies of the Wi-Fi propagation law can diverge silently: retune `propagation.ts`
and every Wi-Fi link moves except the foreign power a UWB receiver sees, which would then contradict
the link table inside one run. The file already imports `wallLossDb` from that module, so reuse
costs no new dependency and no cycle.

**What to do.** `return pathLossDb(dM) + wallsDb + WIFI_6G_EXTRA_LOSS_DB`, and drop the two
constants. The comment on `:32` can become a one-liner pointing at `pathLossDb`.

### 3. `UWB_PL_EXP` is re-declared although the same module is already imported — minor

`src/engine/spectrum.ts:38`

**What.** `const UWB_PL_EXP = 2.0 // ... as src/uwb/phy.ts states it` shadows the exported
`UWB_PL_EXP` in `src/uwb/phy.ts`, which line 20 of this very file already imports from
(`UWB_CHANNEL_MHZ`, `uwbPl0Db`, `UwbChannelNo`). `src/uwb/channel.ts:26` imports the real one.

**Why.** Same divergence risk as finding 2, with none of the cycle justification that excuses the
`1.2` duplication — the import edge exists already. The comment admits the duplication instead of
removing it.

**What to do.** Add `UWB_PL_EXP` to the existing import on line 20 and delete line 38.

### 4. `notify` schedules phase 1 at the current instant, so a phase-2 caller is served out of phase — minor

`src/engine/spectrum.ts:139-151`

**What.** `notify` always schedules at `(now(), phase 1)`. Transmission ends in this codebase run
at phase 2: `src/uwb/channel.ts:157` (`TX_END`) and `src/engine/mac.ts:942` (`onOwnTxEnd`). A
`retire` called from one of those handlers pushes a `(t, 1)` item while the queue is executing
`(t, 2)`; the heap's `less()` then pops it ahead of any other pending phase-2 work at the same
instant.

**Why.** Nothing is lost and nothing is non-deterministic — the listener still runs at `t`, and heap
order is fully determined by `(t, phase, seq)`. But the spec's "spectrum changes are applied in the
same event phase as the channels' own propagation effects (phase 1)" stops being literally true, and
the notification's position relative to other phase-2 bookkeeping becomes a function of which phase-2
handler happened to retire first. Task 3/4 will hit this on the very first TX end.

**What to do.** No change needed inside `Spectrum` if the wiring cooperates: document on `emit`/
`retire` that they are to be called at phase 0 (or from a phase-1 handler) and have tasks 3/4
retire from a phase-0 event scheduled at the PPDU end rather than from the phase-2 `TX_END`
handler. If that proves awkward, the alternative is for `notify` to run the listeners synchronously
when the instant's phase 1 has already passed. Also worth one line in the class doc: the residual
stranded-flag case is a `Spectrum` outliving its `EventQueue` and seeing the clock restart at an
instant it still has pending — impossible today (`Simulation` owns one queue for its lifetime),
but cheap to state.

### 5. `uwbChannelOf` picks a nearest centre with no sanity bound, over a hardcoded channel list — minor

`src/engine/spectrum.ts:62-71`

**What.** The channel list is the literal `[5, 9]` rather than the keys of `UWB_CHANNEL_MHZ`, and
any band centre whatsoever maps to one of them — a 2.4 GHz band would come back as channel 5.

**Why.** Low impact today (the two laws differ by only 1.8 dB, and the brief accepts inference),
but it is a silent answer to an unanswerable question, and adding a channel to `phy.ts` would not
reach this list. The report already promises that a non-standard band should add `ch` to `Emission`
instead — the code does not enforce that promise.

**What to do.** Either derive the candidates from `UWB_CHANNEL_MHZ` (a `[5, 9] as const satisfies
readonly UwbChannelNo[]` keeps it type-safe without a cast), or reject a centre further than half a
channel width (249.6 MHz) from every centre with a thrown error, so the "add `ch` to `Emission`"
path is forced rather than suggested. A one-line test on a nonsense band would pin whichever is chosen.

### 6. Emissions are stored by reference, undocumented — minor

`src/engine/spectrum.ts:87` (`this.live[side].push(e)`)

**What.** `Spectrum` keeps the caller's object, so a caller that mutates `pos` or `eirpDbm` after
`emit` retroactively changes past and present `foreignMw` answers.

**Why.** Harmless if callers treat an `Emission` as immutable, which is the obvious use, but
tasks 3/4 will be written by someone reading only the doc comment, and a mobile node's `pos` object
is exactly the kind of thing that gets reused.

**What to do.** One clause in the `emit` doc comment: the emission is held by reference and must not
be mutated while live. No code change.

## Tests — assessment

Good tests, not box-ticking ones. Every item in the brief's checklist is present and each asserts a
number rather than a shape: both reference powers within 0.1 dB, `−Infinity` **and** an exact
`foreignMw === 0` off-band, the 2× / +3.01 dB sum check that would catch a dB-domain sum, a
`retire`-to-silence sequence, a real `EventQueue` driven by a `runUntil` loop with a mutable clock,
and the drywall test asserting exactly 5 dB (`WALL_LOSS_DB.drywall`) by differencing two `Spectrum`
instances. The phase test is the strongest one: markers scheduled at phase 0 and phase 2 of the same
instant bracket the notification, so `['phase0', 'uwb@100', 'phase2', 'uwb@200']` really does prove
phase 1 and not merely "some time at t". Same-side exclusion, burst coalescing and registration
order are all covered. The `max(d, 0.1)` floor is pinned to 9 decimals.

Gaps, all folded into the findings above: retire of an unregistered emission (finding 1), double
retire (finding 1), a band centre matching no channel (finding 5). A zero-width emission hits the
`width <= 0` guard on `:120` untested, which is acceptable for a defensive branch.

## Summary

The physics, the phase discipline, the determinism story and the numbers are all right, and each
law was checked against the engine it imitates rather than only against the brief. Spec compliance
is complete. The one blocking item is finding 1: a lenient `retire` that turns a caller's duplicate
call into the silent removal of a live emission, in a class that is about to become the single
source of truth for cross-technology interference in tasks 3 and 4. Findings 2, 3 and 5 are
small edits that stop three copied constants and one hardcoded list from drifting away from the
modules they were copied out of.

## Re-review (fix round 1)

Scope: commit `d5334d4`, files `src/engine/spectrum.ts`, `tests/engine/spectrum.test.ts` and
`src/engine/propagation.ts` only. `6b4d748` (Task 3's band-edge work) is the range's base, not part
of this commit, and was not reviewed.

### Verdict

Spec: APPROVED
Quality: APPROVED

### Verification run

- `npx vitest run tests/engine/spectrum.test.ts tests/engine/propagation.test.ts tests/engine/lesson-hashes.test.ts`
  — **28/28 pass** (spectrum 15, propagation 12, lesson hashes 1).
- `npx tsc -b` — **exit 0** (the `as const satisfies readonly UwbChannelNo[]` form compiles).
- No `any`, `@ts-ignore` or `as unknown as` introduced.
- **The `propagation.ts` export changed no behaviour.** `git diff cef2f62 d5334d4 -- src/engine/propagation.ts`
  is the two `const` → `export const` lines and a comment, nothing else: the values stay 46.7 and 3.0
  and `pathLossDb`/`rxPowerDbm`/`buildLinkTable` are untouched. No other module defines or re-exports
  `PL0_DB`/`PL_EXP`, and no module star-imports `propagation`, so the widened surface collides with
  nothing. `tests/engine/propagation.test.ts` and `tests/engine/lesson-hashes.test.ts` both pass —
  the lesson hashes are the decisive evidence that no simulated link budget moved.

### Rulings, one by one

| # | Ruling | Result |
|---|---|---|
| 1 | retire by identity only, unknown object a no-op, tested | **Done.** `spectrum.ts:106-112` is `indexOf` and nothing else; the doc comment now states the contract and why. The new test (`retires by identity…`) is the right one: it puts two live emissions under one `txId`, retires the first, then fires a stray second `retire` of that same object *and* a never-registered look-alike, asserting both that `b` stays on the air and that `woken` stays `[0]` — the no-notification half of the blocking finding, which is the half that is easy to forget. Resolved. |
| 2 | path-loss constants imported from propagation | **Done**, see the behaviour check above. Residual R1 below. |
| 3 | `UWB_PL_EXP` imported | **Done.** `spectrum.ts:20` imports it alongside `uwbPl0Db`; the local copy is gone, so the mediator and `src/uwb/channel.ts:123` now read the exponent from one place. |
| 4 | phase-1 notification kept, comment only | **Accepted as ruled.** The comment at `spectrum.ts:138-141` states the behaviour accurately (the `(t,1)` item is popped immediately after the phase-2 caller, same instant, ahead of the rest of that phase) and rests the "harmless" on a real property: every consumer takes foreign power as a maximum over a whole reception. That is a promise about tasks 3 and 4, not about this file — worth re-checking at their review that the Wi-Fi `maxInterfMw` and the UWB per-reception maximum are both genuinely max-over-time, because the comment is the only thing standing between phase order and a wrong number. |
| 5 | `uwbChannelOf` bounded, throws beyond 250 MHz, tested | **Done.** `UWB_CHANNELS` is `[5, 9] as const satisfies readonly UwbChannelNo[]` (no cast, type-safe) and a centre farther than `UWB_CHANNEL_MATCH_MHZ = 250` from every centre throws with the transmitter id and the centre in the message. 250 versus the exact half-width 249.6 is deliberate and labelled "near enough". The 2.4 GHz test pins the throw; the new channel-9 test is better than it looks — asserting the 1.8036 dB gap against channel 5 is exactly what fails if the nearest-centre search picks the wrong one. Residual R2 below. |
| 6 | by-reference storage documented | **Done.** `emit`'s doc comment states the emission is held by reference, must not be mutated while live, and must be the object handed back to `retire` — which also carries ruling 1's contract to the call site that needs it. |

All six rulings are applied as stated, the two reference powers and the wall-loss test still hold
(unchanged, re-run green), and the blocking finding is closed.

### Remaining findings — 3 minor, 0 blocking

1. **R1 — the Wi-Fi law's *shape* is still duplicated, only its constants are now shared.** minor.
   `src/engine/spectrum.ts:39` computes `PL0_DB + 10 * PL_EXP * Math.log10(Math.max(dM, 0.1))`,
   which is the body of `pathLossDb` at `src/engine/propagation.ts:64-66` written out a second time,
   including the 0.1 m floor. Calling `pathLossDb(dM) + wallsDb + WIFI_6G_EXTRA_LOSS_DB` would have
   shared the whole law and needed no new exports at all, where the chosen fix makes two constants
   public to share half of it. The drift that remains is narrower than before — a retune of the
   *numbers* now propagates, only a change of *form* (a breakpoint model, a different floor) would
   not — so this is a note, not a request; the ruling was followed.
2. **R2 — the channel-inference throw fires at query time, not at `emit`.** minor.
   `uwbChannelOf` is called from `foreignMw` (`spectrum.ts:127`), so a malformed emission surfaces
   as an exception inside the *Wi-Fi channel's* interference computation, some instants later and
   with the offending `emit` caller nowhere on the stack. The blast radius is correctly contained
   (the `overlap <= 0` guard runs first, so only queries that actually touch the bad band throw),
   and the test documents the behaviour, so this is a diagnosability point rather than a defect.
   Validating in `emit` instead would fail fast at the caller that got it wrong.
3. **R3 — one comment is in the present tense about something that is not true yet.** minor.
   `src/engine/spectrum.ts:33-34`: "`simulation.ts` imports this module, so the edge cannot run the
   other way". At `d5334d4`, `src/engine/simulation.ts` has no reference to `spectrum` — the import
   arrives with task 3/4. The reasoning is right and the duplicated `1.2` is still correctly
   justified; only the tense is ahead of the code. "will import" would fix it, or leave it and let
   task 3 make it true.

None of the three blocks the task. Task 2 is complete.
