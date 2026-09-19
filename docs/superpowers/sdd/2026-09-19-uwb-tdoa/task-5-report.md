# Task 5 report — lesson "One blink per tag" (UL-TDoA, module 14)

Commit `b4ac444`, six files. `npx tsc -b`, `npx vite build` and the full `npx vitest run`
(**106 files, 1374 tests**, up from 1344) are green. The hash fixture gained exactly two keys,
both `uwb-ul-tdoa*`; nothing else in it moved.

## The scene

Lesson 6's, node for node, so the only difference between the two one-way lessons is which end
transmits: four corner anchors (0.5, 0.5), (9.5, 0.5), (0.5, 7.5), (9.5, 7.5) at 2.20 m with
`anchor-1` first, ten `badge-*` at lesson 6's ten spots at 1.00 m, `mode: 'ul-tdoa'`, `nlos: true`,
everything else default, every crystal drawn. The test pins `TAG_SPOTS` equal to the DL lesson's
and the anchors equal to lesson 5's. Variant: **"1 ns of sync error" / 1 ns 的同步误差**
(`syncErrorNs: 1`, and a JSON strip-compare pins that it changes nothing else).

Measured over seven blocks (1.3 s), 70 blinks, 70 fixes, 210 differences:

| `syncErrorNs` | σ per difference | worst difference | fix error | ellipse semi-major |
| --- | --- | --- | --- | --- |
| 0 | 4.2 cm | 0.10 m | 0.2–7.7 cm, **mean 3.2** | 3.0–4.1 cm |
| 1 | 42.6 cm | 0.41 m | 10.4–27.9 cm, **mean 16.7** | 30.5–41.5 cm |

These are this scene's numbers, not task 3's (that run had `nlos: false`, other tag ids and
therefore other draws). Both maxima sit inside the 4σ envelope of `√2·c·√(σ_ts² + sync²)`, which
the lesson states and the test computes rather than transcribes. The editor walk 0/1/2/4 ns gives
mean 3.2 / 16.7 / 33.4 / 70.4 cm and worst 7.7 / 27.9 / 54.4 / 135.3 — linear once σ clears the
timestamp noise, pinned as a ratio between 1.9 and 2.2.

## What the lesson pins that is new

- **The bias, shown twice.** The four realised offsets (+0.14, −0.97, −0.34, −0.31 ns) are
  replayed from each anchor's own stream in the test (`UwbClock.fromRng` then `gaussian(rng)·σ`,
  the order `network.ts` draws them in) *and* measured through the run: badge 1's seven readings
  against anchor 2 are −1.18, −1.28, −1.16, −1.11, −1.12, −1.18, −0.99 ns, mean −1.15, which is
  the two draws' difference to within one subtraction's noise, and never once the other sign. The
  synchronised run's same seven change sign and average under 0.1 ns. On the floor: at 1 ns all
  ten badges' mean fix is pushed **east by 12–22 cm** (a distorted map, not a scatter); at 0 ns
  the means are under 3 cm and mixed in sign.
- **Cost and ceiling.** One blink = `UWB_BLINK_BYTES` 14 B / `uwbPpduNs` 181 218 ns; ten badges
  spend 1.812 180 ms a block = 0.906 %; the ceiling is `floor(blockRstu / slotRstu)` = 100 badges
  = 9.06 %, taken from the plan and the defaults, never re-typed. A fresh run of lesson 6's "ten
  badges" scene supplies the 0.505 % the comparison uses.
- **Both lanes.** Anchor 1 emits every `UWB_TDOA`/`UWB_POSITION` with `of`; the view puts them on
  the badge (ranges empty, three difference rows, fix 2.1 cm / GDOP 0.85 / ellipse 3.2 × 1.7 cm /
  UL-TDoA) and anchor 1's own lane stays null/empty. Pinned both ways, EN and ZH method names.
- **No crystal reaches the answer.** Pinning every badge at ±20 ppm reproduces the base run's fix
  errors exactly — the engine-level statement of the formula block's claim, and the contrast with
  the DL lesson's centrepiece.
- Errors are compared with lesson 5/6, never raw GDOP across solvers; GDOP appears only within
  this lesson's own solver (0.85 in the middle, 3.43 at (9.8, 0.2)).

## Shape

5 jumps (round → blink → first anchor stamp → first difference → fix), 4 observe, 2 tryThis,
3 quiz; `lessonWords` **1637**, `lessonMinutes` **25** (ceiling 1724, so 87 words of slack). That
is above the brief's ~1 350-word suggestion: the bias evidence (seven readings, four draws, the
east-shift) and the UL-versus-DL trade-off would not survive a further 300-word cut, and the
study-time ceiling the test pins is met with room to spare.

## Changes outside the new files

- `src/course/lessons.ts` — import and register, after `uwbDlTdoa`.
- `src/course/lessonKit.ts` — **one new predicate**, `firstUwbUlRound` (`UWB_ROUND` with
  `mode === 'ul-tdoa'`), mirroring `firstUwbDlRound`; `firstUwbBlink` already existed.
- `tests/course/uwb-coexist.test.ts` — the one-line tail assertion `after.slice(3)` → `after.slice(4)`
  (only `uwb-aoa` is unauthored now), with its comment. `uwb-contention.test.ts` and
  `uwb-dl-tdoa.test.ts` pin only their own predecessor, so neither needed touching.
- `tests/fixtures/lesson-hashes.json` — `+"uwb-ul-tdoa"` and `+"uwb-ul-tdoa#0"`, both `1cfd27f7`.
  The two scenes hash the same because the hash is of the air, and a calibration error changes
  nothing a radio does — which is the lesson's own claim, pinned separately as equal airtime.

## Notes for whoever takes task 6

- The lesson's last paragraph promises nothing about AoA; it closes on the UL/DL trade-off
  (privacy, scale, where the intelligence sits), so the AoA lesson is free to open where it likes.
- The `of`-routed fix, the `badge-*` naming and the "lesson 6's room again" opening are now a
  three-lesson convention; keeping them makes the module read as one arc.

---

## Fix round 1 — review `task-5-review.md` (Spec approved, Quality CHANGES REQUIRED)

Commit `5176a49`, two files only (`src/course/uwb/uwb-ul-tdoa.ts`,
`tests/course/uwb-ul-tdoa.test.ts`). `npx vitest run tests/course/uwb-ul-tdoa.test.ts` → 30 passed;
`npx tsc -b` clean; `tests/engine/lesson-hashes.test.ts` + `tests/course/lessons.test.ts` → 43
passed (the fixture was **not** regenerated and did not need to be: nothing in either scenario
moved). Word count 1687 / 25 minutes, still inside the pinned 1724 ceiling.

### Finding 1 (Medium) — the invariance sentence

The review is right: pinning the badges' crystals changes 70 records — each badge's own
`UWB_TS { dir: 'tx' }` counter, which moves both because the rate scaling changes and because
`UwbClock.fromRng` with an explicit `ppm` takes one rng draw instead of two. "Changes not one
record here" is gone. The sentence now says what is true and what the test checks:

> Pin all ten badges at either end of the ±20 ppm §16.4.9 allows … and the run comes back the
> same: every record at the same instant and of the same type, and the same seventy fix errors.
> The only thing that moves is the counter a badge writes into its own transmit stamp, which
> nothing here reads.

"Every record at the same instant and of the same type" is exactly what `Simulation.timelineHash`
hashes (`t:seq:type`, `simulation.ts:347`), so the pin is the hash itself plus the record-by-record
detail: the two runs share one `timelineHash`, their `[t, type]` arrays are equal, the 70 fix
errors are equal, and the records that differ are **exactly 70**, every one a badge's own tx
`UWB_TS`. The prose deliberately does not use the words "timeline hash" — a learner cannot see one
in the app — but the test's comment names it, and the ZH moved with the EN.

### The seven Lows

2. Quiz 1's explanation now reads "two of its own arrivals, up to 6 ms apart", matching lesson 6.
3. Observe 4 now reads "0.12, 0.11 and 0.09 ns — all three positive", since `uwbTdoaRows` prints no
   leading plus; the test additionally pins that none of the three rows starts with "+".
4. "so the log names the badge and the inspector and the overlay place it there" — the log line
   observe 3 pins begins `anchor-1 position of badge-1 …`, so it names rather than places.
5. The editor sentence is now pinned as far as a headless course test reaches: the field's label in
   both languages, its `uwbUlOnly` tooltip, and `ScenarioSchema` accepting the whole 0/1/2/4 ns walk
   while rejecting 11. The `disabled={oneWay !== 'ul-tdoa'}` binding itself stays the editor tests'
   business — flagging for the controller that the claim→pin rule now touches UI affordances only
   through strings and schema range.
6. The three stale quotations in the test (the ellipse test's title, observe 4's comment, the scene
   test's comment) are re-synced to the shipped text.
7. Bookkeeping, corrected here: the lesson makes **no numeric error comparison** with lessons 5 or
   6 — the only cross-lesson number it ships is lesson 6's 0.505 % airtime, and the UL/DL paragraph
   argues cost and privacy, not accuracy (the "compare errors, never GDOP" constraint is met by
   there being no cross-solver comparison at all); and the `uwb-coexist.test.ts` edit was **2 lines**
   (the assertion and the comment above it), not one.
8. Informational, no change: §10.29.1.2.5 does name wired distribution of the clock signal. The
   lesson follows the brief, plan and README in calling wired sync model, which claims less standard
   backing than it has; tightening that attribution should be done in all four places at once.
