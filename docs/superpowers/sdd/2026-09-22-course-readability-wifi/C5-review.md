# Review — Batch C5 (`ofdma-dl`, `ofdma-ul`, `mumimo`)

Verdict: **Pass**, no Important findings, three Minor.

## Method

- Read `batch-brief.md`, `C5-report.md`, `C5-review.diff`.
- Read the pre-rewrite lessons: `git show b516404:src/course/tier2/{ofdma-dl,ofdma-ul,mumimo}.ts`.
- Beginner pass: `npx tsx scripts/lesson-dump.ts <id> en|zh` for all three ids, in the order
  `ofdma-dl` → `ofdma-ul` → `mumimo`.
- Confirmed `git show 4d2bb86 --stat` (6 files: the three lesson `.ts` + three new
  `.test.ts`; nothing else) and `git diff b516404 4d2bb86 -- tests/fixtures/lesson-hashes.json`
  (empty) — fixture untouched, no lessons.ts/curriculum.ts touched, consistent with a
  non-split batch.
- `npx tsc -b --noEmit` clean.
- `npx vitest run tests/course/ofdma-dl.test.ts tests/course/ofdma-ul.test.ts tests/course/mumimo.test.ts`
  — 46/46 passed.
- `READABILITY_INCLUDE=ofdma-dl,ofdma-ul,mumimo npx vitest run tests/course/readability.test.ts`
  — 808/808 passed.
- `npx vitest run tests/course` (full suite, current HEAD) — 2023/2023 passed.
- Wrote and ran a standalone script instantiating both `mumimo` variants to verify the
  "162 of 169" / "190 of 196" ack-round split the report cites.
- Grepped `tests/course/lessons.test.ts` for the `Wi-Fi 5 (802.11ac)` shared pin.

## Findings

### Minor

1. **Review artifact, not the commit** — `C5-review.diff` includes a hunk to
   `tests/course/readability.test.ts` (removing `'mlo'`, `'capstone'` from `MIGRATING`)
   that is not part of commit `4d2bb86`. `git show 4d2bb86 --stat` lists exactly 6 files
   (the three lesson sources + three new test files); the readability-file edit belongs to
   the earlier commit `19c37d1` ("chore: mlo and capstone off MIGRATING"). The diff appears
   to have been generated against the wrong base (`b516404` instead of `19c37d1`). Does not
   affect the lesson content; flagging so the diff artifact isn't mistaken for what shipped.

2. **`mumimo` — ack-round exception is true but not pinned to its exact numbers.**
   The report says "It does for 162 of 169 sends in the OFDMA variant." I verified this by
   instantiating both variants directly: OFDMA variant settles 162/169 (7 collide),
   MU-MIMO variant settles 190/196 (6 collide) — both true. But the lesson prose only says
   "unless the laptop talked over the send, which happens to a few of them" (no numbers),
   and `mumimo.test.ts`'s "one round of acknowledgement settles the whole group" test only
   asserts `settled > sends.length * 0.9` — a loose bound, not the specific split. A future
   regression to, say, 150/169 (89%) would be caught, but 155/169 (91.7%) would not, even
   though it's a different number from what was measured when the claim was written. Not a
   contract violation (nothing in prose needs a number here), but weaker than "the corrected
   claim is pinned" suggests.

3. **`ofdma-ul` — dropped the old lesson's explicit "NAV" mention.** The pre-rewrite lesson
   said a station "checks the medium and its NAV before it answers." The new picture/deeper
   sections only say a device "still checks the air before it answers" — carrier sense is
   preserved but the NAV check specifically is no longer named (the CS Required field is
   cited in `sources` instead). Minor loss of precision, not an error.

## Pass 1 (beginner read) — no stop points found

- No undefined words: every capitalised token resolves through `terms`, `needs`' closure,
  or KNOWN_WORDS (confirmed indirectly — the acronym-rule tests in `readability.test.ts`
  passed with these three ids included).
- No picture claim contradicted by the numbers/quiz: checked in particular —
  - `ofdma-dl`'s "the win is air, not throughput" reasoning (quiz 2: "the same film was
    delivered in less transmission time... A higher rate for each television" is the wrong
    answer) is both stated and true for this scene: the whole-run table shows identical
    per-television delivery (352/355/354 frames, same Mb/s) with and without OFDMA — the
    scenario is fixed-rate video, not saturated traffic, so there is nothing for OFDMA to
    speed up.
  - `mumimo`'s ack-round claim: correctly softened from an absolute claim to an
    "unless...a few of them" qualifier (see Minor 2 above for the numeric-precision note).
- No number appears in prose without a supporting table/formula; all numbers I spot-checked
  (44 µs / 48 µs preambles, 40 µs saved / 8 µs handed back / 1.44 ms total, the
  52 µs + 13.6 µs×symbols formula, 1.41×, 12,918/8,612 B) reconcile exactly with the pinned
  tests.
- EN/ZH agree in structure, numbers and claims for all three lessons (read both).
- Every quiz is answerable from the picture/numbers main path (checked each of the 6
  questions against the section it draws on).
- No padding: budgets are well inside the ≤650/≤350/≤400/≤1300 caps
  (1099, 1156, 1052 words respectively; report's budget lines match `lesson-dump.ts`
  output exactly).

## Pass 2 (pins)

- Every surviving old claim (per `git show b516404:...`) is accounted for: the Wi-Fi 5
  MU-MIMO/Wi-Fi 6 OFDMA provenance sentence, "each station decodes only its own RU",
  simultaneous-ACK/orthogonality, the Trigger-dictates-everything list (now a `steps`
  block), the antenna-arithmetic "group is never three", and the "nobody's rate falls is
  an idealisation" caveat — all present, and moved to `sources`/`deeper` where the contract
  puts provenance and idealisations. Dropped items were rhetorical flourishes or cross-lesson
  comparisons ("MAC starts to look like a scheduler", "lesson 11 showed...", "compare with
  lesson 9"), not testable claims.
- Corrected claims: 1.44 ms of air is pinned exactly
  (`ofdma-dl.test.ts`: `(busyOff - busyOn) / MS === 1.44`, and independently
  `airNs(off) - airNs(on) === 1.44 * MS`). The 162/169 ack-round split is true (verified
  independently) but only loosely pinned — see Minor 2.
- `tests/fixtures/lesson-hashes.json` byte-identical (empty diff, confirmed above).
- `Wi-Fi 5 (802.11ac)` shared pin (`tests/course/lessons.test.ts:373`) still matches; its
  new home in `mumimo`'s `sources` ("downlink MU-MIMO arrived with Wi-Fi 5 (802.11ac)...")
  is a sensible place for it — better than the old `ofdma-dl` opening paragraph, since
  MU-MIMO is the lesson that's actually about that generation's feature.
