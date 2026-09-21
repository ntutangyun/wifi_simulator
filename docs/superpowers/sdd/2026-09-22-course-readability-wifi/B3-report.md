# B3 — Wi-Fi Tier 1 wave 1: airtime, ifs, backoff, nav

Files owned and changed: `src/course/tier1/{airtime,ifs,backoff,nav}.ts`,
new `tests/course/{airtime,ifs,backoff,nav}.test.ts`. No split, no new
scenario, no variant added or removed: all four scenario builders are
byte-identical to HEAD, so `tests/fixtures/lesson-hashes.json` is untouched.
`src/course/wifiScenes.ts`, `src/course/lessons.ts`, `src/course/curriculum.ts`
and `tests/course/readability.test.ts` were not touched.

## Budget lines (`npx tsx scripts/lesson-dump.ts <id> en`)

```
airtime          picture  530/650 · numbers  171/350 · practice  291/400 · total  992 (992 words, 20 min)
ifs              picture  599/650 · numbers  215/350 · practice  285/400 · total 1099 (1099 words, 20 min)
backoff          picture  538/650 · numbers  197/350 · practice  297/400 · total 1032 (1032 words, 20 min)
nav              picture  569/650 · numbers  177/350 · practice  257/400 · total 1003 (1003 words, 20 min)
```

Was 279 / 307 / 857 / 664. `airtime` is deliberately kept under 1000 and to
three terms with no table in its `picture`: mid-migration it can be graded as
the first migrated Wi-Fi lesson (it is not, now that `radio-primer` has landed,
but it must survive either merge order).

## Per lesson

### airtime — "Frames cost airtime"

- needs `radio-primer, decode-thresholds, frame-anatomy`; terms `ACK`,
  `preamble`, `payload` (owner table: ACK).
- why → one channel, time is the currency. picture → one speaker; why a frame
  cannot start cold; **watch** on the first data frame; only the middle part
  grows; the air is paid for twice; what an exchange costs.
- numbers → the run's one exchange, part by part (44.0 preamble + 81.6 six
  symbols = 125.6 µs frame, 16 µs pause, 28 µs ACK, 169.6 µs exchange of which
  88.0 µs fixed), the airtime formula, the tax in one number, the 18 % busy
  share of the first 100 ms.
- Pins moved from `tests/course/lesson-claims.test.ts` "lesson 1 · airtime"
  (ACK exactly one SIFS after every data block; the medium idle most of the
  time) — re-asserted in `tests/course/airtime.test.ts` beside their new
  sentences; the originals were left in place, so nothing was removed.
- Pins added: 1430 B / MCS 11 / 125.6 µs on all 117 frames, 44.0 µs HE
  preamble and 13.6 µs symbol from `PHY_MODES`, six symbols, 14 B / 28 µs ACK
  on all 116, the 169.6 and 88.0 µs sums, `Math.round(share*100) === 18`,
  the legacy-TV experiment (232 µs, 53 symbols) and the half-payload quiz
  answer (84.8 µs frame, 40.8 µs saved, 128.8 µs exchange).
- `.body!` retired: none existed for this id.
- Could not fit: nothing dropped. The legacy-TV experiment is built as an
  ad-hoc scenario **inside the test** rather than as a lesson variant, so the
  recorded hash stays a single entry. Its wording says "same payload" rather
  than "the same 1430 bytes" because a legacy header is two octets shorter
  (1428 B on the air) — the test states this.

### ifs — "SIFS, DIFS and the ACK dance"

- needs `airtime`; terms `slot`, `SIFS`, `DIFS`, `EIFS` (owner table: SIFS,
  DIFS, EIFS; `slot` is the unit the other two are built from).
- picture → why waiting is the whole rule; the short gap; **watch** on the
  first ACK (the SIFS gap); the longer gap; **watch** on the first backoff
  draw (the DIFS gap); the penalty gap; a three-rung ladder.
- numbers → the three waits with a "where" column, the run's 248/16/254
  sentence, the first turn as a timetable (0 → 248 → 264 → 292 → 326 → 425 µs),
  and the EIFS that never fires here.
- Pins moved from `lesson-claims.test.ts` "lesson 2" (DATA→ACK always one
  SIFS; DIFS after every ACK then a fresh draw) — re-asserted in
  `tests/course/ifs.test.ts`; originals left in place.
- Pins added: `SLOT_NS`/`SIFS_NS`/`DIFS_NS`/`EIFS_NS` and their identities,
  255 data + 254 ACK frames at 1528 B / 248 µs, every IFS in the run is a
  34 µs DIFS and no EIFS exists, the six timestamps of the first turn and
  `326 000 + 11 × 9 000 = 425 000`.
- `.body!` retired: none existed for this id.
- Could not fit: nothing. EIFS keeps its table row and a picture paragraph but
  the lesson now says plainly that this scene never produces one.

### backoff — "Random backoff & collisions"

- needs `ifs`; terms `backoff`, `CW`, `ACK timeout` (owner table: CW).
- picture → two stations in one instant; roll then count down; **watch** on the
  first collision; when both dice agree; silence needs a deadline; doubling.
- numbers → **the slot-count table from the run** (CW 15 · 770 draws · 7.15
  mean; CW 31 · 89 · 16.07; CW 63 · 5 · 23.80), what a slot is worth
  (64 → 145 µs), the deadline's three pieces (16 + 9 + 20 = 45 µs), the first
  collision timed, and the 864/47 rate.
- `deeper` → why the access point locks onto neither preamble, and why no EIFS
  is armed (including the retry's DIFS counted from 293 µs, not 248 µs). This
  is where the old lesson's two long prose sections went.
- Pins moved from `lesson-claims.test.ts` "lesson 3" (retry DIFS from the
  timeout; the t = 0 first collision and the same-slot second; idle slots equal
  the draw; frozen counters resume; the wider retry window; the access point
  detecting neither preamble) — re-asserted in `tests/course/backoff.test.ts`;
  originals left in place.
- Pins added: the exact draw counts and means per window, `mean × 9 µs`
  rounding to 64 and 145, `ACK_TIMEOUT_NS` and its three terms, exactly 770
  freeze/resume pairs, 864 frames and 47 collisions, and the collision rate
  staying between 4 % and 8 % across four other seeds (the "change the seed"
  experiment, built inside the test, not as a lesson variant).
- `.body!` retired: none existed for this id.
- Could not fit in the main path: the EIFS discussion and the capture-margin
  explanation → `deeper`. The old cross-reference "a real, visible EIFS appears
  in lesson 6" was dropped as a lesson number; `ifs` now carries the forward
  pointer in words.

### nav — "NAV — reserving with a promise"

- needs `backoff`; terms `Duration`, `NAV`, `virtual carrier sense` (owner
  table: NAV).
- picture → what your ears cannot tell you; a promise in every header;
  **watch** on the first NAV being set; busy because you were told so; only the
  remainder; frozen and not knowing for how long.
- numbers → where the 44 µs comes from (16 + 28, and 0 µs on the answer), the
  same number on all 576 frames with the Listener's 513 countdowns, the long
  freeze taken apart (248 + 44 + 34 = 326 µs), and when A can first compute it.
- `deeper` → "a station never holds a schedule" and why the lane's label names
  only the last ingredient of the block.
- Pins moved from `lesson-claims.test.ts` "lesson 4" (the 326 µs freeze and the
  resume at 3; NAV ends when the ACK ends; data Duration = SIFS + ACK airtime)
  — re-asserted in `tests/course/nav.test.ts`; originals left in place, as are
  the `quoted-timestamps.test.ts` values 498 000 / 790 000 / 824 000.
- Pins added: 576 data frames all announcing 44 µs, the answer announcing 0,
  exactly 513 Listener countdowns all 44 µs long and all from another station's
  data, and the 248/326 ratio behind the "three quarters" sentence.
- `.body!` retired: none existed for this id.
- Dropped: the RTS/CTS row of the old "what each frame's Duration announces"
  table. `RTS` and `CTS` belong to `hidden`, which comes **after** `nav`, so
  once `TIER1_BASELINE` is deleted those tokens would have no legal owner here.
  The idea (a reservation can cover a whole planned exchange) is `hidden`'s.

## Verification

- `npx tsc -b --noEmit` — clean.
- `READABILITY_INCLUDE=airtime,ifs,backoff,nav npx vitest run tests/course/readability.test.ts`
  — all four graded, every rule green.
- `npx vitest run tests/course` — 1197 passed, 1 failed.

The single failure is **pre-existing and not this batch's**: `readability ·
migration bookkeeping > every MIGRATING id is a real lesson still in the old
shape` fails on `radio-primer`, which commit 8f71af8 (the concurrent
radio-primer / decode-thresholds batch) migrated without the controller having
removed its ids from `MIGRATING`. `tests/course/readability.test.ts` is
controller-owned, so this batch did not edit it; the same line will need
`airtime`, `ifs`, `backoff` and `nav` removed when this batch is registered.
