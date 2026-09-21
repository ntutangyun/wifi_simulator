# B3 review — airtime, ifs, backoff, nav (commit 0404b1f)

Verdict: PASS. No Important findings. Two Minor notes below.

## Method

- Pass 1 (beginner read): `npx tsx scripts/lesson-dump.ts <id> en|zh` for airtime, ifs, backoff, nav,
  read in COURSE_ORDER, using only what radio-primer, decode-thresholds, roles-stack, frame-anatomy
  and the earlier lessons of this batch establish.
- Pass 2 (pins): diffed against `git show 93a5c05:src/course/tier1/{airtime,ifs,backoff,nav}.ts`,
  checked every claim named in the pre-rewrite lesson still appears (moved, not dropped) and is
  asserted in the new `tests/course/<id>.test.ts`; checked `tests/course/lesson-claims.test.ts` and
  `tests/course/quoted-timestamps.test.ts` still hold their original assertions untouched; checked
  `tests/fixtures/lesson-hashes.json` is untouched (scenario builders unchanged, confirmed by `git diff`
  showing no changes to the `scenario:` fields).
- Ran `npx tsc -b --noEmit` (clean), `npx vitest run tests/course` (41 files, 1282 passed, 0 failed —
  the report's mentioned pre-existing MIGRATING-bookkeeping failure is gone, presumably fixed by a
  later commit removing airtime/ifs/backoff/nav from `MIGRATING`), and
  `READABILITY_INCLUDE=airtime,ifs,backoff,nav npx vitest run tests/course/readability.test.ts`
  (367 passed).

## Pass 1 findings

No stop points found reading airtime → ifs → backoff → nav in order as a beginner:
- Every capitalised token used in why/outcomes/picture/numbers/observe/tryThis/quiz is either a known
  word (AP, STA, MAC, TV, PHY), a term of the lesson itself, or a term of an earlier `needs` lesson
  (ACK from airtime is reused correctly in ifs/backoff/nav prose; SIFS/DIFS/EIFS from ifs reused in
  backoff/nav; CW from backoff reused in nav). MCS/OFDM/PPDU/etc. never leak into the main path — they
  appear only inside `sources`, which is exempt.
- No EN/ZH disagreement found in the numbers spot-checked (nav's EN/ZH numbers tables match value for
  value; ifs's timetable and backoff's draw-count table read the same in both dumps).
- No number appears in prose without a home in the numbers table (spot-checked airtime's 18%, ifs's
  248/16/254, backoff's 864/47, nav's 576/513).
- Quizzes are answerable from the main path in all four lessons; none requires `deeper`.
- No padding sentences found — each picture paragraph advances the argument (checked especially
  backoff's "Two stations, one instant" and nav's "Frozen, and not knowing for how long", which read
  as the densest but not superfluous).
- No claim contradicts the pictures the learner has already been shown (e.g. ifs's "no station in this
  scene ever waits an EIFS" matches nav's later scene, which never claims otherwise; backoff's "no EIFS
  is ever armed here" in `deeper` is consistent).

## Pass 2 findings

- Owner-table words present as exact-spelling `terms`: airtime → ACK; ifs → SIFS, DIFS, EIFS; backoff →
  CW; nav → NAV. Confirmed in each file's `terms:` array.
- All pins named in the report as "moved" are present, unremoved, in `tests/course/lesson-claims.test.ts`
  (lesson 1–4 describe blocks unchanged) and in the new per-lesson test files, re-asserted beside the
  sentences that now carry them. `tests/course/quoted-timestamps.test.ts` values (293\_000/790\_000/824\_000
  etc.) still hold — confirmed by the passing run above.
- `tests/fixtures/lesson-hashes.json` untouched, per the batch's own claim and confirmed no diff hunk
  touches it or the `scenario:` fields of any of the four files.
- Ad-hoc scenarios promised in `tryThis` text are actually built in the tests:
  - airtime's "set the TV to 802.11a and reload" → `tests/course/airtime.test.ts` "a legacy TV
    stretches the same payload to 232 µs" builds a `legacy` scenario with `sta-1`'s generation forced
    to `nonht` and asserts 232 µs / 53 symbols.
  - backoff's "Change the seed in the editor and reload" → `tests/course/backoff.test.ts` "another
    seed gives other draws and the same rough rate" runs seeds 1, 2, 3, 11 and asserts the collision
    rate stays between 4% and 8%, matching the lesson's "roughly one attempt in twenty" claim across
    seeds.
- `.body!` retired: none existed for any of the four ids (confirmed by grep — no `.body!` sites in the
  new test files or elsewhere referencing these ids).

## Minor

- airtime, sources §3 (video profile note): the pre-migration lesson never stated the 1430-byte frame
  and video profile were simulator choices "not figures from the standard" as explicitly as the new
  sources block does — this is new provenance detail (an improvement, not a regression), noted only
  because it's an addition beyond a straight pin-move; no test gap, since the byte count is pinned.
- backoff, `deeper` (first paragraph, "Why the access point sees nothing at all") and nav, `deeper`
  ("A station never holds a schedule"): both paragraphs are close in register to the immediately
  preceding `numbers` prose and could in principle have stayed in the main path per the budget
  headroom (backoff picture 538/650, nav picture 569/650) — not a contract violation, since `deeper`
  is explicitly for material that could not fit the main path budget, and the report explains the
  reasoning (old lesson's two long prose sections). Flagging only as a judgment call worth a second
  look if a later pass wants to tighten module-2 pacing.

No Important findings.
