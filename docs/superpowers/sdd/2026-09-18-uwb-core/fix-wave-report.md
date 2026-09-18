# Fix wave after the whole-branch review — `feat/uwb-ranging`

Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`.
Base: `7fcd6ef` (the amended spec) — note that `98eab75` (the positioning plan doc) landed on the
branch from another session one minute before the first commit here, so the wave sits on top of it.
Six commits, `44d2ec2..99888ec`.

Final verification: `npx tsc -b` clean, `npx vite build` built in 2.6 s, `npx vitest run`
**92 files, 999 tests passed**, `git status` clean.

## Item by item

| Item | Commit | What closed it |
|---|---|---|
| A — blocking, σ_r | `44d2ec2` | `rangeSigmaM = C_M_PER_NS·(tsNoisePs/1000)/√2`; lessons 1 and 2 (EN + ZH) say 2.1 cm; every pin moved; envelopes re-checked (below) |
| B — round-end record | `1bbe167` | `UWB_ROUND_END`, emitted by the tag in `endRound` after any `UWB_POSITION`; reducer clears `slot`; anchors take block/round from their own `UWB_RANGE`; `fmtUwbRecord` line; view test extended; hashes regenerated |
| C — clause citations | `026c661` | §10.29.1.7 (FoM), §10.29.1.2.4 (three-message DS-TWR), §10.32.2/§10.32.3 (block/round/slot), §16.2 + §10.29.8/§10.32.9 (SP1 and the IEs), the 2024 IE numbering in `frameFields.ts`; both lesson sentences in EN and ZH with their pins |
| D — slot-fit guard (+ minor 11) | `bb57ac0` | schema `superRefine` gains the slot-fit rule and `anchors ≤ 9`; `UwbNetwork` mirrors both in ns; `rstuNs`, `uwbSlotsPerTag`, `uwbSlotFitNs`, `UWB_MAX_ANCHORS` live in the leaf `src/uwb/phy.ts` — one definition of "slots per round", no import cycle |
| E — minors 5–10, 12 | `5b95351` | see the commit message; minor 13 needed no code (the spec was amended) |
| F — parked T1, T6, T7, T8, T9 | `99888ec` | constant comments + constant-built frame sizes; `clearExpectation`; localised FoM column + event-log try/catch; `trackHeadings(tiers)` with a test; numeric span min/max and a decoded FoM scale index |

## Measured σ figures after item A

`rangeSigmaM(100) = 0.0211985 m` → **2.12 cm** (was 4.24 cm). The clock-correction residual a
*corrected* SS reading also carries is `½·Treply·σ_cfo = 6.00 cm` at a 2 ms reply; combined
`hypot(2.12, 6.00) = 6.36 cm`.

| Scene | Raw error | Corrected error | Envelope now |
|---|---|---|---|
| uwb-intro, 5 m | +2.02 cm = 0.95 σ_r | −5.22 cm = 0.82 × combined σ | raw 3 σ_r; corrected 3 × combined σ |
| uwb-intro, 20 m variant | +1.98 cm = 0.93 σ_r | −5.26 cm | same |
| uwb-sstwr base (±10 ppm) | +6.01 / +11.97 / +17.99 / +23.92 m (the ramp) | −5.32 / −7.78 / −9.50 / +0.50 cm | 3 × hypot(residual σ_i, σ_r) = 19.1 / 36.8 / 54.5 / 72.3 cm |
| uwb-sstwr "perfect crystals" | +1.88 / −1.87 / +0.71 / **−6.09 cm** | — | values pinned exactly; the "within noise" claim now uses **4 σ_r = 8.48 cm** (−6.09 cm is 2.87 σ, so a 3 σ bound was one draw from flapping) |
| uwb-dstwr per slot (predicted) | — | σ = 1.9 / 1.8 / 1.8 / 1.9 cm | `max(σ_ds) < rangeSigmaM(100)` is now a real assertion (1.9 < 2.12); it was vacuous at 4.24 |

Two envelopes were changed rather than left at 3 σ_r, because a corrected SS reading does not
carry σ_r alone: `tests/course/uwb-intro.test.ts` (base and 20 m) and `tests/uwb/network.test.ts`
(one-anchor SS) bound the corrected value by the timestamp noise combined with the CFO residual,
which is the quantity those readings actually have. No assertion in the UWB tests now sits above
2.9 σ of its own bound's scale.

## Fixture diff

`tests/fixtures/lesson-hashes.json`: exactly seven lines changed, all `uwb-*` —
`uwb-intro`, `uwb-intro#0`, `uwb-sstwr`, `uwb-sstwr#0`, `uwb-sstwr#1`, `uwb-dstwr`, `uwb-dstwr#0`.
No Wi-Fi or AMP key moved, no key added or removed. Regenerated once, for item B
(`UWB_ROUND_END` joins each UWB lesson's record stream). Items C–F changed no hash at all: the
`localeCompare` → code-unit swap in **both** channels (minor 6) left the fixture untouched, so the
Wi-Fi change did not need reverting, and the sequence-number stamp and the RRTI rendering do not
enter the hash (it covers `t:seq:type`).

## Deviations, each with its reason

1. **D, the pinned boundary.** The brief's example ("schema rejects a 300-RSTU slot with 4 anchors,
   Final 236.6 µs + 0.2 µs > 250 µs") does not hold: 236.6 + 0.2 = 236.8 µs < 250.0 µs, so four
   anchors *do* fit a 300-RSTU slot. Measured with the engine's own functions: the Final is
   236.603 / 248.910 / 267.372 µs at 4 / 5 / 6 anchors, so at the schema's 300-RSTU floor the first
   count that does not fit is **six**. The test pins five as accepted and six as rejected (plus ten
   anchors for the `UWB_MAX_ANCHORS` rule, and the defaults as accepted).
2. **D, where the helpers live.** The ruling offered "roundPlan calls uwbSlotsPerTag" or "move it
   into session.ts". Both would have made `src/uwb/session.ts` import `src/model/scenario.ts` at run
   time — which pulls zod into the ranging engine — or closed a scenario ↔ session cycle. Both
   helpers, plus the new `uwbSlotFitNs` and `UWB_MAX_ANCHORS`, are in `src/uwb/phy.ts`, the leaf the
   controller named as the fallback. `model/scenario.ts` imports that leaf; nothing else moved.
3. **A, one comment in `device.ts` landed in commit B.** The file header said "a range's error is
   √2·σ_ts"; it is the *round trip* that carries √2·σ_ts and the range that carries σ_ts/√2. The
   correction belongs to item A but was made while editing the same file for item B, so it is in
   `1bbe167` with a note in that commit message.
4. **E5, two extra touches.** The Final's RMI IE row no longer repeats `treply2` (its entries carry
   the address and the round-trip time; the reply times are the RRTI IEs' own rows), and lesson 3's
   *observe* sentence — "all four Treply2 … in one RRTI IE", EN and ZH — became "each Treply2 … in
   an RRTI IE of its own", because it would otherwise contradict the inspector exactly as the
   sentence the ruling named did. Same word count.
5. **E12, what was kept.** `metresToNs` stays: the lesson tests import it, which the ruling allows.
   `Fix.iterations` is gone, `Fix.residualM` stays, the named constants stay, and `UwbChannelCfg`
   lost its `export` (it is used only inside `uwb/channel.ts`).
6. **B, the tag's block/round.** Anchors take block and round from their own `UWB_RANGE`, as ruled;
   a tag does not, because it already has them from `UWB_ROUND` / `UWB_ROUND_END` and a peer's range
   record would otherwise overwrite the round the tag is in. The view test covers both.
7. **F/T7, scope.** `uwbRangeRows(u, S)` now takes the two FoM phrases (structurally
   `Strings['uwb']`), so the signature changed for its one caller and its test. The event-log line
   keeps `fomText`'s English, as ruled.

## Not in scope, carried forward

The review's "carry to the positioning plan" list is unchanged except that items 1 (σ_r), 2 (a
round-end signal), 5 (the slot-fit guards) and 6 (envelope style) are now done in the engine. The
inspector's BSS totals still list UWB lanes, and the editor still draws UWB nodes as green STA
circles — both were accepted for the positioning plan, not for this wave.
