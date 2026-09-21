# B5 review — retries-queues, bianchi, bianchi-vs-sim (commit 8d02854)

Verdict: **PASS**. 0 Important, 3 Minor.

## Method

- Read batch-brief.md, B5-report.md, full B5-review.diff (all three lesson files
  and all three renamed test files), `bianchiModel.ts` (confirmed untouched),
  and the pre-rewrite lessons/tests via the diff's `-` side.
- `npx tsx scripts/lesson-dump.ts <id> en` for all three, read as a beginner
  who knows only radio-primer … anomaly plus this track's earlier Tier 1
  lessons (airtime, backoff, retries-queues → bianchi → bianchi-vs-sim).
- `npx vitest run tests/course/retries-queues.test.ts tests/course/bianchi.test.ts tests/course/bianchi-vs-sim.test.ts`
  → 3 files, 79 tests, all green.
- `READABILITY_INCLUDE=retries-queues,bianchi,bianchi-vs-sim npx vitest run tests/course/readability.test.ts`
  → 479 tests, all green (structure, acronym-introduction-via-needs-closure,
  term density, prose/table budgets, needs-honesty).
- Confirmed `src/course/lessons.ts`, `curriculum.ts`, `tests/fixtures/lesson-hashes.json`,
  `tests/course/readability.test.ts` have zero diff between ca9a420 and 8d02854.
- Confirmed test-count did not shrink for any of the three files (old→new:
  bianchi 29→29 `it`s incl. the moved table's rows folded differently but same
  assertion count via `quotes`/`expect`; bianchi-vs-sim 15→16; retries-queues
  24→27), and spot-checked several individual pins (e.g. `276_000`/`704_000`
  txTimeNs, the CW=0/one-cheat numbers, the three-settings drop table) against
  both the old prose and the new.

## Pass 1 — beginner read

- `bianchi`'s "two unknowns that depend on each other" is stated in plain
  words *before* any equation: picture has "Two unknowns, each defined by the
  other" and "One pair of values fits both" ahead of the `numbers` section
  where τ/p first appear as symbols. Good.
- `bianchi-vs-sim` states plainly where the model is wrong and why: "Rate
  control did [break]... it cannot tell a collision from a weak signal," with
  the size of each cause given in the model's own units (slot clock, restart
  times, pile-up cost) and an explicit residual paragraph at the end. Good.
- Acronyms EIFS/DIFS/SIFS/CW used in `bianchi`/`bianchi-vs-sim` prose are all
  owned by `ifs`/`backoff`, which are transitively in `needs` (bianchi →
  backoff → ifs); each first use is also glossed in plain words in the
  sentence itself ("the long penalty wait, EIFS"). No undefined-word stops.
- Quiz items in all three lessons are answerable from the main path (why/
  outcomes/terms/picture/numbers), not from `deeper`.
- No claim I checked against the model/engine contradicts the picture or the
  numbers table (rate-ladder direction in retries-queues' table, the 9×
  rate-ratio and "fifth of the throughput" framing in bianchi-vs-sim, the
  τ/p ignoring frame size claim in bianchi).
- EN/ZH numbers agree everywhere I sampled (percentages, Mb/s figures, attempt
  counts) — both read as independent originals making the same claims.

## Pass 2 — pins

- Every empirical assertion from the three old test files survives, moved
  with its sentence: retries-queues' drop-table numbers, the seven-attempt
  table, the head-of-line/QSRC-vs-retries example (now in `deeper`); bianchi's
  model table, T_s/T_c derivation, seed-invariance, saturation-is-real check;
  bianchi-vs-sim's rate-mix/capture/EIFS/CW=0-corner pins.
- The four-row model-against-run table moved bianchi → bianchi-vs-sim intact,
  pins included (`the model-against-run table (moved here from the Bianchi
  lesson)` describe block), plus the added sign-flip assertion.
- Assertions read off `measure()` (actual simulated records) or off
  `solveBianchi`/`saturationThroughput`/`dcfTimes` (the named model function),
  never a value copied from the prose being asserted — not tautological.
- `tests/fixtures/lesson-hashes.json` byte-identical (confirmed above);
  `bianchiModel.ts` has zero diff.
- `.body!` sites retired in all three test files (`lessonStrings()` walk
  replaces the old `Block[]` walk), as claimed.

## Minor

1. `bianchi`, "What a success and a pile-up cost": the formula
   `T_s = 2064 + 16 + 44 + 34 = 2158 µs` / `T_c = 2064 + 45 + 34 = 2143 µs`
   dropped the inline component labels the old version had (`SIFS 16 + ACK 44
   + DIFS 34`). The note sentence right below does map each number to its
   name, so it's recoverable, but a reader has to hold four bare numbers
   before the mapping arrives.
2. `bianchi`'s "What the equations predict" table and `bianchi-vs-sim`'s arc
   table both print the 54 Mb/s throughput column unitless (`31.28`) next to
   a united 6 Mb/s column (`5.169 Mb/s`) — the implementer already flagged
   this (Concern 3) as inherited and pin-locked; still present, still worth a
   controller-level normalization pass someday.
3. Implementer's disclosed amend history (two amends to the same commit, one
   of which briefly picked up another session's unrelated files before being
   reset) is process noise, not a content defect — final commit 8d02854 is
   confirmed to contain exactly the six files in the diff. Flagging only so
   it's on record; no action needed.

No Important findings.
