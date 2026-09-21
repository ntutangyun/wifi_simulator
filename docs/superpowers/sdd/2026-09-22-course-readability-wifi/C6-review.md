# C6 review — `mlo`, `capstone`

Verdict: **pass with one Important fix required** (content error, not a shape/pin/test failure).

Counts: Important 1 · Minor 2

## Important

1. **`capstone` — picture "Three changes you could make" + `deeper` "Why the tablet is so much worse off than the television"**: both call the tablet "the oldest radio in the house/flat" (picture: "Replace the oldest radio in the house with a newer one"; deeper: "on the oldest radio in the flat"), but the scene's own generations put the tablet at `vht` (Wi-Fi 5, `GEN_RANK` 1) while the IoT sensor is `nonht` (`GEN_RANK` 0) — strictly older. `src/model/caps.ts`: `GEN_RANK: { nonht: 0, vht: 1, he: 2, eht: 3 }`. The lesson's own "trap in the middle" paragraph even sets the sensor up as the obviously-slowest (i.e. oldest-feeling) device before ruling it out as the bottleneck; two paragraphs later "oldest radio" is reassigned to the tablet without qualification. Nothing in `capstone.test.ts` pins the word "oldest," so this false statement about the model slipped past the pin pass. Fix: either scope the claim ("the oldest radio anyone still browses on" / "the oldest radio that isn't the sensor") or drop "oldest" and let "on the far corner's slowest active radio" carry the point — the option-3 candidate change is legitimately "upgrade the tablet," it just isn't the literal oldest radio in the house.

## Minor

1. `C6-report.md`'s `capstone` budget line says `numbers 335/350 · … · total 1239`; `npx tsx scripts/lesson-dump.ts capstone en` actually prints `numbers 333/350 · … · total 1237`. Both are within budget either way, but the report is off by 2 words — worth a correction if the report is used to track the course-wide budget ledger.
2. `capstone` tryThis item 2 / rubric row "The second radio" say the video wait is "exactly as long as before" / "leaves the video wait where it was," quoting 2.22 ms against 2.26 ms (radio-off vs. base) — a real but small (≈2%) difference, not literally exact. Harmless given both numbers are stated and pinned, but "exactly" slightly overclaims precision.

## What was checked and held up

- Beginner read (EN + ZH) of both lessons via `lesson-dump.ts`: no undefined words (acronym rule respected — `IOT` is in `KNOWN_WORDS`; `OFDMA`/`MU-MIMO`/`TXOP` only ever appear in `needs`/jump labels, never introduced-but-unused in prose), no EN/ZH numeric disagreement, no heading-less adjacent paragraphs, quizzes answerable from the main path (picture/numbers) without needing `deeper`.
- Pin pass: `npx vitest run tests/course/mlo.test.ts tests/course/capstone.test.ts` — 34/34 green. `READABILITY_INCLUDE=mlo,capstone npx vitest run tests/course/readability.test.ts` — 808/808 green (the batch report's one prior failure, an unrelated MIGRATING-list check on `txop-protect`/`rate`/`ofdma-dl`, no longer reproduces in this worktree state). `tests/course/lesson-claims.test.ts`, `tests/course/lessons.test.ts`, `tests/course/kit.test.ts` — 87/87 green, confirming every claim the old lesson-claims tests pinned ("moving [the sensor] changes nothing measurable," the 37.7→78.0 MB MLO figures, the three latency collapses, both jump-target sets) still has a carrying sentence in the new prose.
- Capstone's four-row options table: each of the three edited scenes in `capstone.test.ts` (`backupStopped`, `radioOff`, `tabletNew`) applies the exact editor edit the picture's three candidate changes describe (idle the backup / turn off `sta-1` MLO / upgrade `sta-4` to `he`+OFDMA) to `capstone.scenario()` and reruns the sim; both instructed pins are present and correct — `tabletNew.upMb` = 78.1 and `s.got('sta-2')` rounds to 8.3 MB in all four scenes including `tabletNew`.
- `tests/fixtures/lesson-hashes.json`, `src/course/lessons.ts`, `src/course/curriculum.ts` are byte-identical to `21b9c64` (confirmed via `git diff`) — no split, no registration, scenario builders unchanged apart from the new `N` import.
- `npx tsc -b --noEmit` shows no errors touching `mlo.ts`/`capstone.ts`.
- Needs-closure ids (`retries-queues`, `txop-protect`, `width`, `edca`, `txop`, `rate`, `anomaly`, `tier1-project`, `ofdma-dl`, `ofdma-ul`, `mumimo`) all exist as real lesson ids.
