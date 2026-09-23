# B4 review — bianchi, bianchi-vs-sim, tier1-project, tier1-project-review

Reviewed against `batch-brief.md`, the "Amendment, 2026-09-23" section of
`docs/superpowers/specs/2026-09-21-course-readability-design.md`, and
`B4-report.md`. Verified `src/course/tier1/bianchiModel.ts`,
`tests/course/bianchi.test.ts`, `tests/course/bianchi-vs-sim.test.ts`,
`tests/course/tier1-project.test.ts`, `tests/course/tier1-project-review.test.ts`,
`MECHANISM_INCLUDE=bianchi,bianchi-vs-sim,tier1-project,tier1-project-review
npx vitest run tests/course/readability.test.ts` (946 passed), and both
`npx tsx scripts/lesson-dump.ts <id> en|zh` for all four ids.

## Important

### 1. `bianchi` — the displayed formula and the table captioned "what it predicts" disagree, and the fix does not close the gap

`src/course/tier1/bianchi.ts`, `numbers`, block "The pair of equations":

> EN: "τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m))]        p = 1 − (1−τ)^(n−1)"
> note: "...The steps below solve the finite-retry version this MAC uses."

is Bianchi's infinite-retry closed form (`tauOf` in `bianchiModel.ts` with
`attempts === undefined`). The very next block, "What the equations predict"
(EN) / "方程预测出什么" (ZH), is a table whose n = 20 row reads collision
probability 49.59 %. That number is not what the displayed equations predict:
solving the shown τ/p pair for n = 20 gives 48.09 % (pinned in
`bianchi.test.ts`, "the finite-retry correction at n = 20: p 48.09 % → 49.59 %",
and stated in the lesson's own `deeper` section, "that lifts the predicted
collision probability from 48.09 % to 49.59 %"). Every row in that table, and
every number for the rest of the lesson, comes from `solveBianchi({ n, W: 16,
m: 6, attempts: 7 })` — the finite chain — never from the equations printed
above it.

So a beginner reads: an equation pair → a table titled "what the equations
predict" → and the table's own claim is false by construction, by up to 1.5
points of collision probability at n = 20 (and the gap widens with n, since
the finite correction is monotonic in crowd size — see the `deeper` note).
The added note clause ("The steps below solve the finite-retry version...")
sits under the formula, three lines above a heading that directly contradicts
it, and nothing tells the reader the table is not what the note says the
steps compute — it just contradicts the note silently, one screen down. A
clause fixes a lesson that merely omits a caveat; it cannot fix a caption that
is factually wrong about the equations it labels.

This is exactly the defect class the project treats as most serious: the
reader is shown one piece of mathematics (infinite-retry Bianchi) and given
numbers from a different one (finite-retry, L = 7), with a caption asserting
they are the same. The remedy should not be another clause. Two options that
would actually close it:

- Replace the displayed formula with the finite-retry pair the steps and the
  table both use: τ = Σ_{i<L} p^i / Σ_{i<L} p^i(W_i+1)/2, p = 1−(1−τ)^(n−1) —
  i.e., promote what is currently written only in prose in step 2 of "Working
  the pair out with a calculator" into the formula block itself. This is the
  equation pair every number in the lesson, the table, and both tests actually
  run.
- Or show both, explicitly labelled — "Bianchi's own pair (infinite
  retries)" next to "the pair this MAC solves (L = 7 attempts)" — and retitle
  the table "What the finite-retry pair predicts" so the caption is no longer
  false.

Either way, "What the equations predict" must stop captioning numbers that
the displayed equations do not produce.

## Minor

None found. The rest of the batch — procedure fidelity, naming at the
stand-in, `bianchi-vs-sim`'s stated method, both project lessons' learner
steps, pins, and word budgets — checked out:

- `bianchiModel.ts` is followed step for step: stage windows, the two sums,
  the bisection (pinned as monotonicity + convergence rather than exactly 200
  halvings, which the lesson correctly states as "fifty" per the doubling
  count needed for 4-decimal precision — verified `2^-50 < 1e-4`), P_tr/P_s,
  slot pricing and the worked-example row are each pinned against the
  function or engine constant they name, including L = 7 = `SHORT_RETRY_LIMIT`.
- `bianchi-vs-sim`'s "How the two columns were made" states the scene, seed,
  ten-second window, the record types counted (`TX_START`/`RETRY`/ACK),
  where the model's inputs come from, and what the method cannot control
  (retry ≠ overlap under capture, seed sensitivity, the arc arranging rather
  than testing the assumptions) — matches the comparison table and its pins.
- `tier1-project`'s learner steps (numbers, "The plan you carry out") name
  real, currently-available actions: reading scene caps in the editor, doing
  (a)-(d) by hand in dependency order, then running ten seconds and reading
  rung/block length off the first data frame, losses off retry records,
  successes/airtime off counters — each pinned against `buildLinkTable`,
  `mcsForRssi`, `times()`, and a real run's records.
- `tier1-project-review`'s "How to mark a sheet" ties each check to a named
  record or counter (first data frame, retry records, `buildLinkTable`,
  frame/airtime counters) and states the capture-vs-retry trap explicitly.
- All four dumps (en + zh) read cleanly to the end; no sentence points at an
  unnamed quantity; zh is written idiomatically, no anaphora carried over from
  English, full-width quotes used correctly.
- Budgets: all four sit at or under the 550-word `numbers` ceiling (547, 549,
  543, 549 / 550) as reported; totals well under the 1800-word main-path
  ceiling. No pin appeared to have been dropped — `bianchi`'s prior measured
  sentence, seed-sensitivity claims, and the model-table rows all survive.

## Verdict

NEEDS FIXES — 1 important, 0 minor. Worst finding: `bianchi` shows Bianchi's
infinite-retry equations under the heading "The pair of equations" and then
immediately captions a table "What the equations predict" with finite-retry
(L = 7) numbers that differ from what those displayed equations actually
solve to (48.09 % vs. 49.59 % at n = 20), and the batch's fix — one clause in
the formula's note — does not touch the false caption three lines below it.
