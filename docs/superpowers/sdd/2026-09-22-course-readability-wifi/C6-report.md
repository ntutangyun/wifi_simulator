# Batch C6 — Wi-Fi Tier 2, last (`mlo`, `capstone`)

Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch feat/uwb-ranging, from 21b9c64.
Files owned and touched: `src/course/tier2/mlo.ts`, `src/course/tier2/capstone.ts`,
`tests/course/mlo.test.ts` (new), `tests/course/capstone.test.ts` (new). Nothing else.
`lessons.ts`, `curriculum.ts`, `readability.test.ts` and `tests/fixtures/lesson-hashes.json`
untouched; no split, so no registration. Scenario builders byte-identical; no variants added.

## `mlo` — "MLO — one queue, two radios"

Budget line: `picture 575/650 · numbers 282/350 · practice 339/400 · total 1196 (20 min)`
(was 233 words in the old flat shape).

- **needs**: `retries-queues`, `txop-protect`, `width` — the shared pile of frames is the
  queue lesson's word, the shared air is txop-protect's, the band is width's.
- **terms** (3): `link`, `MLO`, `MLD`. The dispatch asked for MLO and link; `MLD` earns its
  place because the picture has to name the level the shared pile lives on, and it is
  introduced two paragraphs after the other two so the density cap holds.
- **Picture**: two doors instead of one → go and look → what the two links share (nothing but
  the pile) → what the second door buys → what it does not (it creates no air) → what this
  simulator models.
- **Numbers**, all pinned to the 300 ms run the jumps already needed:
  - where the work went: 67 frames / 53.9 ms / 18.3% of the clock on 5 GHz against
    240 / 249.6 ms / 84.2% on 6 GHz; both links at MCS 13 and 172.1 Mb/s, so the second
    radio is the emptier one, not the faster one;
  - MLO on against MLO off: 307 → 116 laptop frames, 1.29 / 1.54 ms → 3.25 ms of mean wait,
    and — the finding the old lesson missed — the **neighbour loses too**, 185 → 116 frames
    and 2.58 → 4.18 ms;
  - give the neighbour two radios as well: 122/136 against 132/106, the lean vanishes and the
    laptop's own total falls 307 → 258. "A second link is worth what the second band is empty."
- **Pins moved/added**: nothing existed to move — the old lesson had no test file. New pins
  in `tests/course/mlo.test.ts` (16 tests): the module and `needs`/`terms` register, the
  scenario shape and the absence of variants, "nobody at all is using 6 GHz" (only `ap#6g`
  and `sta-1#6g` ever transmit there), both tables, the two rate figures, "four of every
  five" (0.8) and "almost five times the air" (4.6), and both experiments.
  `tests/course/lesson-claims.test.ts` "lesson 13 · MLO" and the two `lessons.test.ts` mlo
  checks (jump targets, the simultaneous RTS on the AP lane) are untouched and green.
- **EMLSR**: `lessons.test.ts` asserts the course as a whole says MLO is not only the
  two-radio form. It moved into `deeper` (exempt from the acronym rule) and is pinned
  locally in `mlo.test.ts` as well, so a future edit of `deeper` cannot silently break the
  global check.
- `.body!` retired: none existed for this id.
- Dropped/moved: the old "if a set fails on one link the other may retry it" bullet became a
  `deeper` paragraph explaining *why* (the frame is still in the shared pile, unowned).

## `capstone` — "Capstone — the busy household"

Budget line: `picture 528/650 · numbers 335/350 · practice 376/400 · total 1239 (20 min)`
(was 419 words). Study time is 20 min with ~36 words of headroom before it rounds to 25;
keep that in mind if anything is added.

- **needs** (10, by id as instructed): `edca`, `txop`, `width`, `rate`, `anomaly`,
  `tier1-project`, `ofdma-dl`, `ofdma-ul`, `mumimo`, `mlo`. The three OFDMA/MU-MIMO ids are
  named for their *ideas* only — no word of theirs is used in the picture, so the rewrite
  landing in parallel cannot break this lesson either way.
- **terms** (2): `bottleneck`, `offered load`. "brief" is deliberately not redefined —
  `tier1-project` owns it and is in the needs closure.
- **Project shape**, as asked:
  - *the brief*: three rooms, brick and two doors, seven devices, one evening;
  - *the decision*: one question answered with a number — which single change most improves
    this household;
  - *the options*: three candidate changes (stop/schedule the backup · take the laptop's
    second radio away · replace the oldest radio), each priced in the four-row table;
  - *the rubric*: "What a good answer contains", five rows, each pinned to run numbers;
  - *the write-up*: a five-step `steps` template, ending on what the scene does not model.
- **Numbers**, all from the same five seconds `lesson-claims.test.ts` measures:
  as it stands 78.0 megabytes / 2.26 / 39.06 / 1.90 ms; backup stopped 0 / 0.21 / 0.50 /
  0.83; second radio off 37.7 / 2.22 / 25.93 / 1.95; tablet radio replaced 78.1 / 2.18 /
  34.31 / 1.82. Plus: the laptop holds 58.7% of 5 GHz and 90.6% of 6 GHz and nothing else
  reaches two per cent; the sensor sends three frames, 384 bytes; the television receives
  about 8.3 megabytes and the tablet exactly 88,200 bytes in **every** scene — nothing here
  is about throughput.
- **New material**: the "tablet radio replaced" column. The old lesson asked the question
  ("does the AP start grouping it with the TV?") and never answered it. It does not: the
  access point's multi-user groups hold only `sta-2` and `sta-6`, before and after, and the
  tablet's wait falls only from 39.06 ms to 34.31 — about one part in eight. That is now the
  second quiz question.
- **Pins moved/added**: the old lesson had no test file. Every claim `lesson-claims.test.ts`
  "lesson 14 · capstone" holds (the sensor's handful of frames, the airtime the backup
  holds, "moving it changes nothing measurable", the three latency collapses, 37.7 → 78.0
  megabytes with the 5 GHz neighbours unchanged) still has a sentence carrying it, and that
  file is untouched and green. `tests/course/capstone.test.ts` (18 tests) adds the flat's
  shape, the four-way table column by column, the "nothing else reaches two per cent" claim,
  the unchanged deliveries, and the multi-user membership set.
- `.body!` retired: none existed for this id.
- Dropped: the third experiment ("design your own house and predict where collisions will
  occur"). Three `tryThis` items push the stated study time to 25 minutes, over the
  dispatch's 20. Its spirit survives as step 2 of the write-up — predict before you run.

## Controller decisions wanted

1. **`capstone` has no `variants`.** The dispatch asked for 2–3 variants as the learner's
   options, but `capstone.scenario` is one inline builder taking no parameters, and the
   fixture is controller-owned, so I did not add any. The three options are therefore edits
   the learner makes in the editor, priced in the table and pinned in the test — the same
   shape `rate`/`width` use for their experiments. If real `variants` are wanted, a
   `capstoneScenario(variant)` builder plus three fixture lines is the change; say so and I
   will make it.
2. The stated 20 minutes for `capstone` sits ~36 words below the rounding boundary.

## Green / not green

- `npx vitest run tests/course/mlo.test.ts tests/course/capstone.test.ts` — 34 passed.
- `npx vitest run tests/course/lesson-claims.test.ts tests/course/quoted-timestamps.test.ts
  tests/course/kit.test.ts tests/course/mlo.test.ts tests/course/capstone.test.ts` —
  90 passed.
- `READABILITY_INCLUDE=mlo,capstone npx vitest run tests/course/readability.test.ts` —
  756 passed, 1 failed, and the failure is not mine: "every MIGRATING id is a real lesson
  still in the old shape" trips on `txop-protect` / `rate` / `ofdma-dl`, which are migrated
  but not yet struck off `MIGRATING` (controller's file, and the parallel batch's ids).
- `npx tsc -b --noEmit` — clean.
- `npx vitest run tests/course` also showed the parallel batch's in-flight failure in
  `lessons.test.ts` ("Wi-Fi 5 already had DL MU-MIMO"): the phrase `Wi-Fi 5 (802.11ac)`
  no longer occurs anywhere in `src/course`, having been dropped by the uncommitted
  `mumimo` rewrite. Not this batch's file; flagged for whoever owns `mumimo`.
