# U3 — uwb-position, uwb-geometry, uwb-coexist, uwb-contention

Base: 4946d47. All four lessons now carry a `steps` procedure block in `numbers`
plus a worked-example table that runs it on one real round, and every term is
named where the picture introduces it, in both languages.

Grading (clean):

```
MECHANISM_INCLUDE=uwb-position,uwb-geometry,uwb-coexist,uwb-contention \
  npx vitest run tests/course/readability.test.ts      → 986 passed
npx vitest run tests/course/uwb-{position,geometry,coexist,contention}.test.ts → 131 passed
npx tsc -b --noEmit                                     → clean
```

`npx vitest run tests/course` also shows two failures in `uwb-dl-tdoa`
(numbers 610/550, a six-quantity paragraph) — another implementer's lesson,
untouched here.

---

## uwb-position — "From four ranges to a point"

Budget: `picture 505/900 · numbers 532/550 · practice 346/450 · total 1383
(1383 words, 20 min)`

**Procedure written** (8 steps), straight off `solvePosition` /
`accumulateNormal` / `gaussNewton` / `fixFrom` in `src/uwb/position.ts`, and
`UwbDevice.solveFix` in `src/uwb/device.ts`:

1. gather the round's ranges, match each to an anchor the tag holds coordinates
   for; fewer than three matched and the round emits nothing (`usable.length < 3`
   and `r.ranges.length < 3`);
2. seed the trial point at the mean of those anchors' x and y — (5.00, 4.00) m
   here;
3. residual `r_i = ‖p − a_i‖ − d_i`, the tag's z held at its configured 1.00 m;
4. the J row is the horizontal part of the 3-D unit vector anchor → point;
5. solve `(JᵀJ) δ = −Jᵀ r`, step; `|det| < 1e-9` → no fix (`MIN_DET`);
6. repeat until `|δ| < 1 mm` or 20 iterations (`STEP_TOL_M`, `MAX_ITERATIONS`);
7. rebuild r at the converged point: `√(Σ r_i²/n)` — **and the record does not
   carry it**;
8. the printed error is the formatter's, not the solver's: `fmtRecord` takes
   `hypot(x − trueX, y − trueY)` from the two fields the record carries.

**Worked example**: block 0 of the base run — the four measured ranges
(4.7368, 6.3831, 5.4439, 6.8922 m), the centroid seed, the converged point
(3.9933, 3.4981) m, the 1.44 cm RMS residual, the truth, and `error 0.01 m`.

**Terms added**: none (`trilateration`, `residual` were already there).

**Pins added** (`describe 'uwb-position · the procedure, against the solver'`,
8 tests): the three-range floor and an unmatched anchor id; the centroid as
arithmetic over `CORNERS` and inside the convex hull; the held z (a wrong z
moves the fix, and monotonically); an overhead anchor's zero J row makes three
of them unsolvable; the collinear refusal; every worked-example cell rebuilt
from `solvePosition` and compared to the emitted record; `√(Σ r_i²/n)` written
out longhand against `fix.residualM`; and `fmtRecord`'s error against `hypot`.

## uwb-geometry — "Where the anchors stand"

Budget: `picture 508/900 · numbers 532/550 · practice 399/450 · total 1439
(1439 words, 25 min)`

**Procedure written** (7 steps), off `fixFrom` in `src/uwb/position.ts`:
take the converged point → horizontal unit-vector rows (directions only, the
measured distance divides out) → accumulate `JᵀJ`, take `det` (`< 1e-9` → no
answer) → invert → `GDOP = √(inv_xx + inv_yy)` → `Σ = σ_r²(JᵀJ)⁻¹`, semi-axes
from the eigenvalues and `½·atan2(2Σ_xy, Σ_xx − Σ_yy)` → and the closing step,
that nothing after step 1 read a measured range, which is exactly why a lying
range moves the point and leaves GDOP and the ellipse where they were.

**Worked example**: the four corners at the tag's true place, noise-free —
the four rows, `JᵀJ = 2.3302, 0.0470, 1.4922 · det 3.4750`, its inverse,
`√(0.4294 + 0.6706) = √1.1000 = 1.0488`, and `1.74 × 1.39 cm, −86.8°`.

**Terms added**: none. **Naming fixed**: GDOP and FoM were each used before
they were named, in both languages; both now carry a naming clause at first use.

**Pins added** (`describe 'uwb-geometry · the procedure, against the solver'`,
5 tests): row length ≤ 1 and rows independent of range magnitude; every table
cell rebuilt from the rows and compared to `solvePosition`'s `gdop`; the
eigen-decomposition and angle rebuilt and compared to `fix.ellipse`, plus
`σ_r → 2σ_r` doubling the axes while GDOP is unchanged; and one range made
0.5996 m long (`C_M_PER_NS * UWB_NLOS_NS.brick`) moving the point > 0.3 m while
GDOP and both axes print the same and the residual goes from < 1 µm to 21 cm.

## uwb-coexist — "Sharing 6 GHz"

Budget: `picture 658/900 · numbers 536/550 · practice 326/450 · total 1520
(1520 words, 20 min)`

**Procedure written** (8 steps), off `src/engine/spectrum.ts` (`Spectrum.emit`,
`onChange`, `foreignMw`, `bandOverlapMhz`, `wifiToUwbPathLossDb`) and
`UwbChannel.endRx` in `src/uwb/channel.ts`:

1. every live emission of either radio registers with one mediator as an EIRP
   spread evenly over its own band, with its transmitter's position and its
   transmitter's own path-loss law — nothing else crosses;
2. an open UWB reception re-takes its foreign power over `UWB_BAND_MHZ[5]`
   (6240.0–6739.2 MHz) at every `onChange`, keeping the max over the reception;
3. one emission's share: `eirp + 10·log10(overlap/own width)` less `lossDb`,
   summed in mW;
4. `SIR = rssi − foreignDbm`, against `UWB_SIR_MIN_DB = −12`; below it,
   `RX_FAIL(lowSinr)` + `UWB_INTERFERED`;
5. no retry inside the block — the slot times out (`UWB_TIMEOUT`) and the fix is
   solved on what arrived: three anchors, `GDOP 1.26`;
6.–8. the reverse direction through the same mediator stops at the noise:
   `CCA_ED_DBM = −62`, the loudest ranging frame 18.57 dB under it, so no
   Wi-Fi radio ever defers. **The boundary is stated explicitly**: neither
   radio's carrier sense can see the other, neither decodes a word of the
   other, only power crosses, in both directions, through this one mediator.

**Worked example**: the first loss at 418.191 ms — anchor-4's Report at
−79.48 dBm, the laptop's in-band −48.67 dBm, −30.81 dB, under the −12 dB floor
→ `RX_FAIL · UWB_INTERFERED · UWB_TIMEOUT`, and the block still fixes on three.

**Terms added**: none. **Naming fixed**: `overlap` and `energy detect` were
each used in the English picture before being named.

**Pins added** (`describe 'uwb-coexist · the procedure, against the mediator'`,
7 tests): the band edges and the whole-width overlap; the record's `foreignDbm`
rebuilt from the laptop's EIRP through `wifiToUwbPathLossDb` (and shown not to
be the router's); the SIR identity and `UWB_SIR_MIN_DB`, with every loss in the
run under the floor; the RX_FAIL → UWB_INTERFERED → UWB_TIMEOUT order, one
timeout per loss, and no retry in that block; the three-anchor fix; the 18.57 dB
margin against `CCA_ED_DBM` with the Wi-Fi record stream equal to the no-UWB
run's; and no UWB-side CCA records at all.

**Moved to `deeper`** to fit the 550-word `numbers` ceiling without compressing
the mechanism: the "When the spare runs out" paragraph (the saturated variant —
a corner case, and its totals are already a row of the main table). Nothing was
deleted; every pin still holds.

## uwb-contention — "When the controller does not know who is there"

Budget: `picture 654/900 · numbers 547/550 · practice 359/450 · total 1560
(1560 words, 20 min)`

**Procedure written** (8 steps), off `UwbDevice.drawContentionSlot`,
`onSlot`, `listenOpen`, `endRound` in `src/uwb/device.ts` and the overlap rule
in `src/uwb/channel.ts`:

1. the poll advertises the session's two figures — 8 response slots
   (`contentionSlots`) and 3 tries (`maxAttempts`), both from one config so poll
   and responder cannot disagree;
2. no tries left → draw nothing, print the sit-out, refill the budget to three;
3. otherwise `slot = 1 + rng.int(S − 1)`, i.e. **uniform over 1…S inclusive**
   (`Rng.int` is max-inclusive);
4. slot 0, the poll's own, is never drawn; the anchor prints the slot and
   `maxAttempts − attemptsLeft + 1`;
5. the tag listens through every slot with `expect.open` and no peer named, so
   an empty slot emits no timeout at all;
6. two answers in one slot: `UWB_CAPTURE_DB = 6` decides, and at 3.50 m and
   equal power neither leads, so both are lost — one `UWB_CONTEND_COLLISION`
   per slot, not per answer;
7. at the round boundary `endRound` tells each anchor that drew whether it was
   ranged — heard → budget back to `maxAttempts`, not heard → one try gone —
   with nothing sent over the air;
8. the drawn slot is the reply time: slot k = k × 2 ms of waiting = 6.0 cm of
   1-σ per slot.

**Worked example**: anchor-2's first four rounds — slot 7/attempt 1, slot
5/attempt 2, slot 3/attempt 3, then no slot/attempt 0 and the budget refilled.

**Terms added**: none. **Naming fixed**: `response window`, `RCPS`, `RCMA` and
`sit-out` were all used before being named (RCPS and RCMA in both languages).

**Pins added** (`describe 'uwb-contention · the procedure, against the device'`,
7 tests): the two advertised figures against `DEFAULT_UWB_SESSION` and no
attempt number above the budget; the draw's bounds — min 1, max S, all S values
seen, 0 never — across all three windows; empty slots with zero timeouts in
every scene; `UWB_CAPTURE_DB`, equal power and equal 3.50 m radius, and one
collision record per shared slot with nothing decoded in it; anchor-2's four
rounds cell by cell plus an anchor that *was* heard starting at attempt 1 again,
and the only frame kinds on the air being `uwbPoll` and `uwbResp`; the 2 ms slot
from `rstuNs(DEFAULT_UWB_SESSION.slotRstu)` and the measured error ramp.

**Moved to `deeper`**: the "Latency" paragraph (its 1.218 s is already in
`deeper`'s thirty-round paragraph). Nothing deleted.

---

## Where the engine contradicted the lessons

**The residual is computed and never shown.** `solvePosition` returns
`Fix.residualM`, but `UWB_POSITION` (src/uwb/records.ts) has no such field,
`fmtRecord` does not print it, and `applyRecord` / `uwbFixRow` do not carry it
into the inspector. Two sentences implied otherwise and were corrected:

- uwb-position: "A clean round leaves a residual too small to print. A range
  that lies leaves centimetres, **and you can see it** without knowing which
  range lied" → "…leaves a residual under a micrometre… and **the solver knows
  that** without being told which range lied", and step 7 says the record does
  not carry the figure.
- uwb-geometry: "It leaves a 21 cm residual… **and nothing else on screen
  moves**" → "**Inside the solver** it leaves a 21 cm residual… and **no record
  carries that figure** — on screen, nothing moves."

Both lessons' residual figures remain correct and pinned (through
`solvePosition` directly, which is the only way to reach them).

**The 600 RSTU standing correction.** Checked, not changed, and my reading
differs in scope rather than in value: `ScenarioSchema` (src/model/scenario.ts
:595) puts the general floor at `min(300)` with a multiple-of-3 refinement, and
the 600 RSTU floor is **MMS's** — the extra refinement at :692 requires a
multiple of 300 RSTU, and two slots must hold the 608.2 µs REPORT, so at
833.33 ns per RSTU 300 RSTU (2 × 250 µs) is too short and 600 RSTU is the
shortest legal MMS slot (`MmsRoundPlan.fragGapNs`'s doc comment says exactly
this). None of my four lessons quotes a slot floor, so nothing was changed;
reported rather than acted on.

## Anything that did not fit

Nothing was cut for space. Two supporting paragraphs moved from `numbers` to
`deeper` (named above) so that the procedures fit the 550-word `numbers`
ceiling; no lesson needed splitting. All four now sit within 20 words of that
ceiling, so the next edit to any of them will have to find room first.
