# Batch C1 — edca, ampdu, txop on the readability contract

Wi-Fi Tier 2, wave 1. All three share the `oneRoom` scene; builders, variants and
`ampdu`'s aggregation-off variant are byte-identical to HEAD 58494a5, so
`tests/fixtures/lesson-hashes.json` is untouched and every recorded hash holds.

## edca

- Budget: `picture 635/650 · numbers 215/350 · practice 360/400 · total 1210 (20 min)`.
  Prose (`proseMax`) 850, asserted against 1000.
- `needs`: `ifs`, `backoff`, **`retries-queues`**. The third is not in the dispatch: the
  "needs is honest" test owns `queue` to `retries-queues`, and a lesson whose whole
  picture is four queues cannot dodge the word. Same reason in `ampdu` below.
- `terms` (3): `EDCA`, `access category`, `AIFS`. `TXOP limit` was *not* taken here —
  `txop` owns `TXOP`, and taking a compound of it in the earlier lesson would have left
  the acronym `TXOP` with no owner for the lesson that actually teaches it.
- Picture: four waiting rooms → two knobs (silence, draw width) → watch → the head start
  is deterministic, the narrow draw only statistical → priority never interrupts →
  somebody has to be last.
- Numbers: the four-class table (34 / 34 / 43 / 79 µs, first draw 0–3 / 0–7 / 0–15 / 0–15,
  each cell sourced to Table 9-194), the `SIFS + n × slot` formula, and the run table
  (33 / 107 / 14 draws, means 2.2 / 7.9 / 8.2, queue waits 1.49 / 2.23 / 10.23 ms),
  plus the 45 µs head start and the uploader's 103 µs penalty wait.
- Pins moved/added (all in the new `tests/course/edca.test.ts`): AIFS sets per node,
  per-node access category and window sets, the two run tables, the 45 µs = five slots,
  `EIFS − DIFS + AIFS` = 103 µs and that only the uploader ever owes it, the first data
  frame of each station (0.088 / 23 / 55 ms), the ~7× queue-wait ratio, the
  EDCA-off experiment (2.4× the caller's wait, falls back to DIFS and CW ≥ 15) and the
  two-voice-queues experiment. The pins in `lesson-claims.test.ts` ("lesson 7 · EDCA",
  and lesson 7's experiment) are untouched and still green.
- Jumps: jump 0 stays `firstVo` (`lessons.test.ts` asserts it by index). The old
  `first internal collision` jump was **removed**: the scene has zero
  `INTERNAL_COLLISION` records in 300 ms — every station here runs a single class — so
  it could never have been found, and the shape suite would have failed on it. Replaced
  by `first background frame` and `first EIFS on the uploader`, both pinned.
- Moved to `deeper`: internal collisions (with the honest note that this scene has none),
  the whole xIFS ladder, and the 2ⁿ − 1 series with VO's two rungs against BK's seven.
  Clause numbers moved to `sources`. Nothing was dropped.

## ampdu

- Grown from 240 to a full lesson. Budget:
  `picture 605/650 · numbers 146/350 · practice 261/400 · total 1012 (20 min)`.
- `needs`: `airtime`, `frame-anatomy`, **`retries-queues`** (the picture queues frames).
  One sentence was reworded to drop "slots" rather than take `ifs` into the closure.
- `terms` (3): `A-MPDU`, `subframe`, `BlockAck`. The dispatch's "block acknowledgement"
  is the *gloss*; the term is spelled `BlockAck` because that is what the timeline prints
  and because the acronym rule admits the token, not the gloss.
- Picture: the fixed price of a turn → several frames under one preamble, each still its
  own subframe → watch → one answer for all of them → what happens when one is bad
  (standard: one clear bit; this simulator: the whole batch) → what it does not change.
- Numbers: one turn both ways (14 frames / 21 502 B / 2 248 µs / BlockAck 32 B 32 µs /
  RTS + CTS 28 µs against 1 frame / 1 530 B / 200 µs / ACK 28 µs), the worked airtime per
  delivered frame (166.9 µs against 228.0 µs), and the 200 ms run (81 / 83 turns,
  1 120 / 738 frames, measured 168.9 µs against 228.3 µs).
- `TXOP` is never written: it comes later in `COURSE_ORDER`, so the 14-frame ceiling is
  described as "the time one win may last" and the 64-frame ceiling is named as the one
  that does *not* bind. Both are pinned.
- Pins in the new `tests/course/ampdu.test.ts`: every cell of both tables, the shared MCS
  on both sides, `BA_BYTES`, `MAX_AMPDU_MPDUS`, the lease the first turn is given, the
  1.5× delivered-frame ratio, and the jump targets. `lesson-claims.test.ts`
  ("lesson 8 · A-MPDU") untouched and green.
- Moved to `deeper`: which ceiling binds and why, the delimiter and the four-byte padding
  (which is what makes the batch 21 502 B rather than 14 × 1 530), and the block-ack
  agreement this simulator assumes is already in place.

## txop

- Grown from 193 to a full lesson. Budget:
  `picture 525/650 · numbers 162/350 · practice 334/400 · total 1021 (20 min)`.
- `needs`: `edca`, `ampdu` — exactly the dispatch. `terms` (2): `TXOP`, `TXOP limit`.
- Picture: winning once and keeping the floor → watch → the ceiling → usually it is the
  queue, not the ceiling, that stops you → why a bounded lease is fair enough (and that
  the bound is really a cap on everyone else's worst wait).
- Numbers: the per-class ceilings (2.080 / 4.096 / 2.528 ms, sourced), the burst census
  of the run (463 wins, 219 of one frame, 243 of two, 232 / 480 / 362.4 µs, against the
  4 096 µs it was allowed), and the arithmetic of the longest and shortest burst.
- Pins in the new `tests/course/txop.test.ts`: `EDCA_PARAMS` limits, the AC_VI lease, the
  burst census, 188 + 16 + 28 twice over, the 0.88 ms two-receiver burst with no IFS or
  draw inside it, the TXOP-off experiment (same 707 data frames, 462 → 706 draws) and the
  saturated-television experiment (3 frames, 1.9 ms). `lesson-claims.test.ts`
  ("lesson 9 · TXOP") untouched and green.
- Second jump added (`first backoff draw by the AP`); jump 0 unchanged.
- Moved to `deeper`: the Duration field that keeps the room away for the whole burst,
  reverse-direction and larger-than-an-ACK replies, and why long bursts want protection
  (pointing at `txop-protect`, the next lesson).

## `.body!` retirement

None of the three ids had a test file before this batch, and `grep` finds no `.body!`
site for them anywhere in `tests/course`. Nothing to retire; their pins lived in
`lesson-claims.test.ts` against scenarios, not against prose, and are untouched.

## Not done / left to the controller

- `MIGRATING` in `tests/course/readability.test.ts` still lists `edca`, `ampdu`, `txop`;
  the controller removes them. Until then the bookkeeping test "every MIGRATING id is a
  real lesson still in the old shape" fails on them by design. Graded clean with
  `READABILITY_INCLUDE=edca,ampdu,txop`.
- `tier1-project` also fails that same bookkeeping test in this worktree — a concurrent
  implementer's migration, not this batch.
