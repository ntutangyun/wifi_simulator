# Task 4 report — lesson "Listen-only positioning" (DL-TDoA, module 14)

Commit **c419b0d** on `feat/uwb-ranging` (base 1277472).
`npx tsc -b`, `npx vite build` and the full `npx vitest run` are green:
**105 files, 1344 tests**, up 34 (all in the new lesson test).
`tests/fixtures/lesson-hashes.json` gained exactly three keys — `uwb-dl-tdoa`,
`uwb-dl-tdoa#0`, `uwb-dl-tdoa#1` — and nothing else moved.

## The scene

Lesson 5's four corner anchors at (0.5, 0.5), (9.5, 0.5), (0.5, 7.5), (9.5, 7.5), z 2.2 —
`anchor-1` is the reference, the other three answer in slots 1, 2, 3 — and listeners at z 1.0 on
`mode: 'dl-tdoa'`, NLOS on, everything else default, every crystal drawn. Variants: **"Clock
correction off" / 关闭时钟修正** (`tdoaClockCorrection: false`) and **"Ten tags" / 十个标签**
(seven more listeners, nothing else). Measurement window 1.300 s = 7 blocks, matching lesson 5.

**Deviation, and the only one that changes the brief's scene: the tags are `badge-1…badge-10`,
not `uwb-1…`.** A node's crystal is drawn from a stream forked by `hashStr('<id>#uwb')`, so the
ids decide the ppm. With `uwb-1/2/3` the draw hands `uwb-3` −19.0372 ppm against `anchor-1`'s
−19.0404 — a 0.003 ppm coincidence (different hashes, near-identical first outputs, verified).
That tag alone keeps its fix with the correction off, which would have falsified the ruling's
"no fix at all" and taught a 1-in-thousands fluke as a property of the mode. With `badge-*` the
three listeners draw 1.96, 17.65 and 4.08 ppm against the reference's −19.04, i.e. gaps of
21.00 / 36.69 / 23.12 ppm — ordinary values for two crystals inside §16.4.9's ±20 ppm each
(the mean |gap| of two such draws is 13.3 ppm). "ppm drawn" is preserved; only the names changed.

## What the run gives (all pinned)

| | base (3 badges) | correction off | ten badges |
|---|---|---|---|
| differences | 63 | 63 | 210 |
| worst difference | 0.51 m | **66.29 m** | 0.51 m |
| fixes | 21 | **0** | 70 |
| fix error | 0.11–0.36 m | — | 0.02–0.37 m |
| GDOP | 0.84 / 1.00 / 0.89 | — | 0.84–1.21 |
| ellipse semi-major | 18.6–23.0 cm | — | 18.6–26.6 cm |

- **Corrected difference maxima per responder slot: 0.19 / 0.44 / 0.51 m**, against a per-slot
  σ of 0.12 m (0.2 ppm of the reply time) and its 3σ of 0.36 / 0.72 / 1.08 m — every one of the
  63 inside. The residual grows with the slot the responder answered in, as it must.
- **Correction off: badge 2's three differences average 22.02 / 44.04 / 65.81 m too long**, which
  the test checks against a prediction built from the *draw* (36.69 ppm × 2/4/6 ms), not from the
  run — the two agree to inside one slot-σ. **No `UWB_POSITION` is emitted anywhere**: 65.81 m
  between anchors 11.40 m apart is on no hyperbola. The table's "worst difference" column quotes
  the run's maximum, 66.29 m, while the prose quotes the 65.81 m mean; both are pinned.
- **Both crystals cancel, pinned.** `anchor-1` pinned at +20 ppm (a 39 ppm swing off its draw)
  reproduces 0.19 / 0.44 / 0.51 m to the centimetre and all 21 fixes; pinning the badges at
  +20 / −20 / 0 ppm on top of that gives 0.24 / 0.46 / 0.54 m — still inside 3σ, still 21 fixes.
- **Scale and privacy:** `TX_START` is 35 frames and 7 074 935 ns of air in *both* the 3-badge and
  the 10-badge scenes, frame for frame and instant for instant (pinned as an array equality);
  0.505 % duty; **zero tag transmissions** in either. Two-way ranging at the same defaults plans
  ten 20 ms rounds per 200 ms block — ten tags is its ceiling, at 100 frames a block against this
  round's five (pinned from `roundPlan`).

## The comparison with TWR (controller ruling honoured)

The lesson compares **position error and the ellipse**, never raw GDOP across solvers, and says
so in as many words: a hyperbolic Jacobian row is a difference of two unit vectors, so its floor
at the centre of a square of anchors is √(2/3) = 0.82 where trilateration's is 1.00 — asserted
directly against `solveTdoa` on a synthetic square. Lesson 5's base run is re-run in the test:
**0.5–3.3 cm and a 1.7 cm ellipse**, against this lesson's 11–36 cm and 18.6–23.0 cm — better
than an order of magnitude, same room, same anchors. The ellipse is quoted as the **first-order**
model it is (reply times of 2, 4 and 6 ms do not share one σ), with the measured relation pinned:
every fix lands inside 1.6 ellipse semi-axes, and the timestamp term is only 4 cm of it.
The pre-1277472 figures in `task-3-report.md`'s body (2.5 × 1.1 cm) are not quoted anywhere.

Geometry is shown by moving badge 1 in the editor, each place pinned from its own run:
(5, 0.5) on the anchor-1–anchor-2 baseline → GDOP 1.06, worst 34 cm; (9.8, 0.2) past the end of
that baseline → GDOP 1.49, ellipse 35.7 cm, **worst fix 2.64 m**; (3.0, 4.8), the room's best
spot → GDOP 0.83, 16–24 cm.

## Shape

`id 'uwb-dl-tdoa'`, module 14, **1700 English words → 25 minutes** (ceiling 1724; the header
comment states the remaining 24-word budget as the sibling lessons do). 12 body blocks (two
tables, one formula), **6 jumps, 4 observe, 2 tryThis, 3 quiz**. The source sentence names
§10.29.1.2.5's second case and owns the FiRa-style message content and both corrections as the
model's. Observe items quote `fmtRecord` output and the inspector rows verbatim, replayed through
`initViewState`/`applyRecord` and `uwbTdoaRows`/`uwbFixRow`.

`lessonKit.ts` gained `firstUwbTdoa`, `firstUwbBlink` (unused here; it is for Task 5's uplink
lesson) and `firstUwbDlRound`.

## Deviations

1. **Tag ids `badge-*`** — reasoned above; the brief's scene is otherwise exact.
2. **`tests/course/uwb-coexist.test.ts` was touched** (not in the brief's file list). It asserted
   `ids[ids.length - 2] === 'uwb-coexist'` and that every id after `uwb-contention` in
   `COURSE_ORDER` was unauthored; both break the moment a lesson is appended. Rewritten to name
   the seam (`ids[ids.indexOf('uwb-coexist') - 1] === 'uwb-position'`, and `after.slice(3)`), the
   same shape as the `uwb-contention` fix the brief did authorise. No other assertion changed.
3. **Two claims were weakened to match the run rather than the ruling's fixture numbers.** The
   ruling quoted 12.20 / 24.28 / 36.50 m for the correction-off differences; those came from
   Task 2's engine fixture with pinned ±20 ppm tags. This scene's drawn crystals give
   22.02 / 44.04 / 65.81 m for badge 2, and the lesson quotes what it measures. Likewise the
   correction-off table cell quotes the run's maximum (66.29 m) rather than the mean.
4. **"to the centimetre" was dropped** from the uncorrected-bias sentence after the test showed the
   agreement is 2.2 cm on the closest responder (the mean of seven rounds of the clock-offset
   residual is what separates the two). The test now pins the agreement at better than one slot-σ.

## Notes for Task 5 / the reviewer

- `firstUwbBlink` is already exported and unused; the uplink lesson can take it as-is.
- The lesson ends with one forward sentence ("The next lesson inverts that") — Task 5 may want to
  close the loop from the other side.
- Two sibling course tests now assert the lesson-list seam by `indexOf` rather than by tail index,
  so appending `uwb-ul-tdoa` will not break them.

---

## Fix round 1 — commit `28251be`

Review: `.superpowers/sdd/2026-09-19-uwb-tdoa/task-4-review.md` — Spec approved, Quality changes
required (1 medium, 6 low). Only `src/course/uwb/uwb-dl-tdoa.ts` and
`tests/course/uwb-dl-tdoa.test.ts` were touched; the fixture was not regenerated and the UL
agent's concurrent files were left alone.

`npx vitest run tests/course/uwb-dl-tdoa.test.ts` → **34 tests, all passing**.
`npx tsc -b` → clean, exit 0. Lesson is now **1718 words → 25 minutes** (header updated).

### Finding 1 (Medium) — the fix-error sentence now measures what it pins

The sentence quoted the scene's 21-fix envelope (11–36 cm) for *one* badge's seven, and in doing so
reversed the paragraph's own argument: the middle of the room came out at 36 cm against the
baseline's 34 cm. Measured per badge over the base run's seven blocks — badge 1 (4, 3.5) 10.9–25.7,
badge 2 (7, 6) 12.1–35.6, badge 3 (2, 6.5) 12.9–29.8 cm — the middle badge is badge 1.

EN now reads "In the middle of the room **badge 1's** seven fixes land **11 to 26 cm** out"; ZH
"在房间中部，**badge-1** 的七次定位偏离真值 **11 到 26 cm**". The progression the paragraph argues is
now monotone: 26 cm in the middle → 34 cm on the anchor-1–anchor-2 baseline → 2.64 m past its end.
The test pins `fixErrM(rs, 'badge-1')` for that sentence, asserts badge 1 is the listener nearest
the anchors' centroid (so "in the middle of the room" is itself checked, not asserted by name), and
asserts `max(badge 1) < 0.34`. The scene-wide 11–36 cm is untouched where it was already correct:
the table row (derived from the run) and "these between 11 and 36 cm" in the two-way comparison.

### The six lows

2. **Observe 1's ordering.** It now reads "— then each badge's slot-0 line, and anchor-1's Poll",
   pinned as the exact non-`MAC_STATE` record types before the first `TX_START`:
   `[UWB_ROUND ×3, UWB_SLOT ×3, UWB_TS]`. Correction to the review: there are **three** slot lines,
   not seven — only the listening tags open a slot in DL-TDoA; no anchor emits `UWB_SLOT` in the
   whole run, which the test now also pins.
3. **Three unpinned claims, now pinned.** `solvePosition` on the same synthetic square returns GDOP
   exactly 1.00 (`toBeCloseTo(1, 9)`), closing "where trilateration's is 1.00". `(3.0, 4.8)` is
   asserted to be within 0.001 of the hyperbolic GDOP floor over a 0.1 m grid of the whole room
   (7 821 noise-free `solveTdoa` calls; grid minimum 0.8271 at (2.9, 4.8), the quoted spot 0.8273),
   which is what "the best spot" claims. Quiz 2's mechanism is pinned at the solver rather than at
   the absent record: `solveTdoa` handed badge 2's own uncorrected first block returns `null`, and
   the corrected block of the same scene returns a fix — so it is the fit that fails, not the
   emitter.
4. **"No rings".** Left as it was, with a comment naming the real owner: the overlay rule is
   `src/uwb/scene.ts`'s and Task 3's to pin; this test pins the data reason (`u.ranges === {}`).
5. **ZH/EN drift, all three closed.** The formula note's Chinese sentence — the clearer of the two,
   as the review says — is lifted into the English ("anchor 1 reports when it sent the Poll and the
   Final, the badge holds its own two arrivals, and the flight from anchor 1 sits in both and
   cancels"). The inspector's four column names and "根本没有距离可画" are dropped from the ZH, which
   now says exactly what the EN says. To pay for the lift inside the 1724-word ceiling, observe 3's
   closing "The line names its method." was dropped — the quoted log line already ends "(DL-TDoA)".
6. **Table row.** Row 3 is now "Ten tags" / 十个标签, the name of the variant a learner loads, and
   both variant rows are pinned against `uwbDlTdoa.variants[i].label.en`.
7. **Bookkeeping.** The 3σ envelope is left as it is — it is the tightening the review describes
   (measured maxima are 1.58σ / 1.83σ / 1.42σ) and it is pinned per responder. The report's "12
   body blocks" was wrong: there are **11** (`p, p, table, formula, p, p, p, table, p, p, p`).
