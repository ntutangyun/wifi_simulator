# Task 3 — lesson "When the controller does not know who is there"

Slice 4 of the UWB plan, task 3 of 4. The behaviour landed in a25364d; this task turns it into
lesson `uwb-contention`, module 14, the first lesson of "Other ranging modes".

## The scene

Six anchors every 60° on a 3.5 m ring around one tag at the centre of `oneRoom()` (5, 4), every
node at z = 2.2. Ring coordinates are rounded to the micrometre (`r6`), so every *3-D* true range
is 3.500000 m and every answer arrives at the tag at the same level — which is what puts the
medium's 6 dB capture rule out of reach and makes every shared slot a real collision.

SS-TWR, `schedule: 'contention'`, `contentionSlots` 8 base with variants 4 and 16, `maxAttempts`
at the session default 3, NLOS off, crystals drawn. The variants differ from the base scenario in
`contentionSlots` and nothing else (a test strips that one field and compares the JSON).

Measurement window: `runUntil(5900 ms)` — exactly 30 rounds, since one tag means one round per
200 ms block, block 29 starts at 5.800 s and its 34 ms round is over by 5.900 s, and block 30
would not start until 6.000 s.

## Measurements (30 rounds, seed 7, 2 ms slots)

| S | round | formula N·(1−1/S)^(N−1) | measured/round | responses | collided slots | sit-outs | fixes |
|---|---|---|---|---|---|---|---|
| 4  | 10 ms | 1.42 | 1.57 | 47  | 46 | 23 | 7 / 30  |
| 8  | 18 ms | 3.08 | 2.63 | 79  | 43 | 11 | 15 / 30 |
| 16 | 34 ms | 4.35 | 4.13 | 124 | 26 | 1  | 27 / 30 |

Time-scheduled reference (same scene, `schedule: 'time'`): 7 slots, 14 ms, 180 / 180 responses,
30 / 30 fixes.

**The formula vs the run.** The controller's ruling was that the measurement sits *above* the
formula at small S because sit-outs thin the field. Measured afresh, that is the direction at
S = 4 only; at 8 and 16 the runs land below. The lesson says so and pins both sides:

- contenders per round: 5.23 / 5.63 / 5.97 (the rest sat out);
- the same formula evaluated round by round on the real contender count: 1.54 / 3.02 / 4.33;
- thinning *helps* at S = 4 — n·(1 − 1/4)^(n−1) rises from 1.42 at n = 6 to 1.69 at n = 4 — and
  hurts at every wider window, which is exactly the sign of each row's deviation;
- residuals: 47 vs 46.1 (0.2σ), 124 vs 129.9 (1.0σ), 79 vs 90.7 (1.8σ, ordinary 30-round scatter);
- all three totals inside a 4σ binomial envelope of the all-six formula, and none equal to it.

**Captures.** Zero. Across the 90 rounds of the three scenes, not one range was decoded in a slot
that also emitted `UWB_CONTEND_COLLISION`; the test also pins that the ring's range spread is
under 0.001 dB against `UWB_CAPTURE_DB` = 6.

**Timeouts.** Zero, in all three scenes: an open contention slot names no peer.

**Sit-out.** `anchor-2` first: attempts 1, 2, 3 in rounds 0, 1, 2, then a `slot: null` draw in
round 3, at 600.198666 ms.

**Round 0's draws** (the pinned table): anchor-1 → 4, anchor-2 → 7, anchor-3 → 1, anchor-4 → 4,
anchor-5 → 8, anchor-6 → 7, all attempt 1, all at 198.666 µs. Two collided pairs, two ranges.

## The finding the brief did not ask for

In a contention round the slot an anchor draws **is** its SS-TWR reply time, so lesson 2's
surviving error term — ½·Treply·σ_cfo, 3.0 cm of 1-σ per millisecond, 6.0 cm per 2 ms slot —
scales with the draw. The base run's per-slot RMS range error climbs 7.3, 14.9, 16.2, 23.5, 28.2,
32.0, 22.8, 47.1 cm across its eight slots, and the whole-run RMS is 14.6 / 26.8 / 51.4 cm at
S = 4 / 8 / 16 against 20.4 cm time-scheduled. A wider window buys fewer collisions and worse
ranges; the 4-slot window is *more accurate* than the roll-call, because a roll-call of six
anchors has to reach slot 6. This is a body section, a try-this and quiz 3.

## Deviations from the brief

- **Variants.** Two (4 and 16 slots), as the controller ruled; the time-scheduled reference the
  lesson prices against is built inside the test by patching `schedule`, not shipped as a third
  variant, so it costs no hash key.
- **The tolerance.** The brief asked for "a stated tolerance"; the ruling asked for the measured
  value pinned alongside the formula. Both are done, and the 4σ binomial envelope is asserted as
  the loose bound instead of a ±x responses/round band.
- **One file outside the assigned set.** `tests/course/uwb-coexist.test.ts` asserted that
  `uwb-coexist` was the last lesson in `LESSONS` and that `uwb-contention` was absent; adding the
  lesson breaks it by construction. The seam test now expects uwb-coexist second from last. Three
  lines, no other change to that file.

## Kit and registration

`lessonKit.ts`: `firstUwbContend` (`slot !== null`), `firstUwbContendCollision`, `firstUwbSitOut`
(`slot === null`). `lessons.ts`: import and list entry after `uwbCoexist`. `curriculum.ts` needed
nothing — `COURSE_ORDER` and `MODULES[14]` were already in place from 16e4711.

1703 English words, `lessonMinutes` 25 (the ceiling is 1724), 4 observe + 2 tryThis + 3 quiz.

## Verification

- `npx tsc -b` — clean.
- `npx vite build` — clean.
- `npx vitest run` — **104 files, 1257 tests, all green.**
- `tests/fixtures/lesson-hashes.json`: exactly three keys ADDED (`uwb-contention`,
  `uwb-contention#0`, `uwb-contention#1`), nothing changed.

New: `tests/course/uwb-contention.test.ts`, 29 tests in four describes — lesson shape (schema,
study time, jump order and instants, EN/ZH parity, the standard sentence, the course seam), the
scene (ring geometry to 1e-6, session config, variant isolation, round lengths against
`rstuNs(slotRstu)`, 30 rounds), the analytic model (the formula recomputed from its own
expression, the table's seven columns, contenders per round, the thinned expectation, the
residuals and the 4σ envelope), the draw/collisions/sit-outs (round 0's table, `fmtRecord` lines,
zero captures, the inspector rows through `initViewState`/`applyRecord`, zero timeouts, anchor-2's
attempt cycle) and what it costs (the 6.0 cm/slot ramp derived from `cfoNoisePpm` and c, the four
RMS figures, the fixes and the roll-call reference).
