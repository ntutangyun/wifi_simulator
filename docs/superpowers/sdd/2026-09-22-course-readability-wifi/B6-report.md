# B6 — `tier1-project` → `tier1-project` + `tier1-project-review`

Commit `56fde56` · branch `feat/uwb-ranging`.

## `tier1-project` — "Project — the brief and the plan"

`picture 609/650 · numbers 341/350 · practice 312/400 · total 1262 (20 min)` ·
prose (why+outcomes+terms+picture+numbers) 950, `proseMax: 1000`.

- **terms** (5): `brief`, `link budget`, `margin`, `DCF`, `saturated`. `DCF` is
  new to the owner table — nothing else in Tier 1 glossed it, and the lesson
  needs the word to say what is switched off.
- **needs**: `airtime, ifs, backoff, nav, hidden, anomaly, retries-queues,
  bianchi, bianchi-vs-sim`. The transitive closure covers every migrated Tier 1
  lesson except `frame-anatomy-bytes`, whose four preamble words the picture
  does not use.
- **Shape**: the scene and the four questions in `picture` (brief table
  included, watch call-out at block 3); every predicted value in `numbers`
  tables — (a) the two link budgets, (b) symbols and the two exchanges,
  (c) the fixed point, (d) the share, plus a fourth table with all three
  variants predicted. `deeper` holds the "markable prediction" discipline, why
  the mean of two exchanges is the right price, and the wide-channel case.
- **Pins kept here** (all recomputed, never measured): 55.73 / −40.73 / 53.26 /
  MCS 13 / 172.1 · 11.180 m / 78.15 / −75.15 / 18.84 / MCS 2 / 25.8 ·
  13.99 + 3 = 16.99 ✓, 16.99 + 3 = 19.99 ✗ · −93.99 · 1528 octets, 12246,
  ⌈…/2340⌉ = 6, ⌈…/351⌉ = 35, 129.6 / 524.0, 28 / 32 µs at 24 / 12 Mb/s,
  207.6 / 606.0, 208.6 / 603.0 · τ = 0.1046, p = 10.46 %, 406.8, 25.585,
  12.793 · 19.8 / 80.2, 275.1, 43.621 · variants: 9.000 m, −72.33, 21.66,
  MCS 3, 415.2 / 493.2, 19.350 → 9.675, 17.81 %, 29.574.
- **Pins added**: the four device positions and powers against the scene
  (`(3, 4), 20 dBm` …); the 9.03 dB the noise floor rises on a 160 MHz channel
  and `reqSinrDb('eht', 0) = 8.99` (moved out of the old quiz into `deeper`);
  the first `BACKOFF_DRAW` (cw 31, both openers starting at t = 0).
- **Pins moved out** to `tier1-project-review`: every measured value — 22.610,
  9,719 / 9,123, 11.6 %, 23.15 / 12.59 %, 4,990 / 2,713 / 46 %, 21.2 / 78.8,
  42.470, 0.28 %, 2,399 / 1,342, 9,499 EIFS, 45 / 94 / 34 µs, 148.1 / 600.9,
  406.6 µs, −72.64 / 21.35 / 44.99 / −82 / −62 / 34 dB, 16.796 (8.737 + 8.059),
  11.10 %, 21.184 (7.734 + 5.852 + 7.597), 17.13 %, 28 %, MCS 0.
- `.body!` retired in `tests/course/tier1-project.test.ts`; the prose walk is
  now `lessonStrings`.
- **Changed observation**: the old lesson never said which window the first
  backoff draw comes from; the run's first draw is from a *doubled* window
  (the two opening frames collide at t = 0), and the observation now says so
  and is pinned to it.

## `tier1-project-review` — "Project — reading the results" (new)

`picture 565/650 · numbers 349/350 · practice 347/400 · total 1261 (20 min)` ·
prose 914, `proseMax: 1000`, `sameSceneAs: 'tier1-project'`.

- **terms** (3): `estimator`, `capture`, `residual`.
- **needs**: `tier1-project, hidden, anomaly`.
- **Shape**: `picture` — four runs on one sheet, watch at the first collision,
  "when agreement is not agreement" (estimator + capture), the assumption that
  fails one way round, three clocks for one event, the residual and the
  write-up. `numbers` — predicted-against-measured, the three variants run,
  "where the gap comes from" (four mechanisms with size), the mutual level, the
  three waits, and the rubric table in the `uwb-capstone` shape. `deeper` —
  why the two errors nearly cancel, and why the moved variant agrees so well.
- Reuses `projectFlat`, `projectVariants` and `projectJumps` by reference (both
  exported from `tier1-project`), so the scene and variants are object-identical
  and no new builder exists.

## Registration (split-only, as the brief allows)

- `src/course/lessons.ts`: one import, one entry right after `tier1Project`.
- `src/course/curriculum.ts`: `'tier1-project-review'` right after
  `'tier1-project'` in `COURSE_ORDER`, same module (1).
- `tests/fixtures/lesson-hashes.json`: **four** added lines, not one —
  `tier1-project-review` plus `#0/#1/#2`, each equal to `tier1-project`'s.
  Four are required because `lessonShapeSuite`'s `sameSceneAs` check compares
  the two lessons' variant arrays, so the second half must carry the same three
  variants, and `tests/engine/lesson-hashes.test.ts` compares the whole map
  with `toEqual`. Additions only; no recorded value changed.

## Verification

- `npx tsc -b --noEmit` clean.
- `npx vitest run tests/course tests/engine/lesson-hashes.test.ts` →
  1 551 passed, 2 failed, both outside this batch: `width · lesson shape`
  (another implementer's uncommitted Tier 2 work in the shared worktree) and
  `readability · migration bookkeeping`.
- `READABILITY_INCLUDE=tier1-project npx vitest run tests/course/readability.test.ts`
  → 506 passed, 1 failed (`edca: expected true to be false`, again the other
  implementer's in-flight lesson). Both halves of this batch pass every
  readability rule.

## Left for the controller

`MIGRATING` in `tests/course/readability.test.ts` still lists `tier1-project`;
it is now migrated, so the bookkeeping test fails until that id is removed
(as was done for `hidden`/`anomaly`). `tier1-project-review` is new and is
already graded by the contract test.

## Nothing dropped

Every pin of the old lesson survives in one of the two halves. Two sentences
moved rather than dying: the 160 MHz quiz became a `deeper` note in the first
half (its −84.96 / 9.81 / 8.99 dB pins kept), and the "two errors of opposite
sign" explanation became a `deeper` note in the second half, its numbers still
pinned in the estimator test.
