# Mechanism before metaphor — revise every lesson to the 2026-09-23 amendment

> superpowers:subagent-driven-development, lean loop: one implementer per batch, up to three batches in parallel over disjoint files, one read-only reviewer per batch, one fix round; one whole-track review, one fix wave, merge.

**Goal:** every Wi-Fi and UWB lesson teaches its mechanism as a procedure the reader can rerun, names each thing where it pictures it, and defines every quantity it uses. AMP stays untouched (user instruction 2026-09-22).

**Spec:** `docs/superpowers/specs/2026-09-21-course-readability-design.md`, section "Amendment, 2026-09-23 — mechanism before metaphor". Reference lessons (read both before writing): `src/course/tier1/decode-thresholds.ts` (the procedure and its worked example) and `src/course/tier1/roles-stack.ts` (naming a stand-in where it stands in).

**Why:** a reader stopped at decode-thresholds' rate-choice sentence — 留在手里的 3 dB / 不含余量的那个要求 / 这笔账 / 灵敏度, four pointers to things the lesson never said — and asked for 一个具体的描述 of the algorithm, and for the analogies to carry the real names: 几台跟它说话的设备（STA）. Both are now rules, graded by `tests/course/readability.test.ts` for every id in `MECHANISM_DONE`.

## Global constraints

- The rules, all enforced: no pointer phrases (`SHORTHAND`); a quantity used on the main path is glossed in `terms` (`QUANTITIES`); a lesson stating a rule carries a `steps` block of ≥ 3 steps on the main path plus a worked example that runs it on one real link; the plain-words stand-in for the AP and the station carries its name in brackets at first use (`STAND_INS`); a term's first use is parenthesised or introduced with a naming clause.
- Budgets (`BUDGETS`, `src/course/readability.ts`): main path 500–1800, picture ≤ 900, numbers ≤ 550, practice ≤ 450, ≤ 30 min; a track opener ≤ 1000. A lesson that does not fit **splits** — it does not compress.
- Every number stays pinned. New procedure steps and worked examples are pinned against the engine or the run, never quoted from the old prose.
- EN and ZH are two originals making the same claims; citations only in `sources` and numbers table cells; no copyrighted text.
- `tests/fixtures/lesson-hashes.json` and `uwb-record-hashes.json`: additions only, and only for a split (the new id takes the first half's hash). No scene changes.
- **Controller-owned files:** `tests/course/readability.test.ts` (MECHANISM_DONE, the rule lists), `src/course/readability.ts`, `src/course/curriculum.ts`, `src/course/lessons.ts`, both fixtures. Implementers grade with `MECHANISM_INCLUDE=<ids>` and never edit these.

## Batches (each: rewrite the named lessons and their tests, report budgets)

Wi-Fi Tier 1: **B1** radio-primer, frame-anatomy, frame-anatomy-bytes · **B2** airtime, ifs, backoff, nav · **B3** hidden, anomaly, retries-queues · **B4** bianchi, bianchi-vs-sim, tier1-project, tier1-project-review

Wi-Fi Tier 2: **C1** edca, ampdu, txop, txop-protect · **C2** width, streams, rate, rate-fallback · **C3** ofdma-dl, ofdma-ul, mumimo · **C4** mlo, capstone

UWB: **U1** uwb-intro, uwb-frame, uwb-sts · **U2** uwb-sstwr, uwb-dstwr, uwb-blocks · **U3** uwb-position, uwb-geometry, uwb-coexist, uwb-contention · **U4** uwb-dl-tdoa, uwb-ul-tdoa, uwb-aoa · **U5** uwb-mms, uwb-mms-numbers, uwb-nba, uwb-nba-coexist · **U6** uwb-capstone

Waves of three, files disjoint by construction (one file per lesson, one test per lesson). The controller registers each batch's ids in `MECHANISM_DONE` after its review passes, and runs the gates on a quiet tree before merging.

**Review per batch:** one reviewer reads `npx tsx scripts/lesson-dump.ts <id> en|zh` as a beginner who knows only the earlier lessons of that track, checks that the procedure is the one the engine runs (not a plausible story), that every pin survived, and that the ZH reads as Chinese rather than as English word order. One fix round.
