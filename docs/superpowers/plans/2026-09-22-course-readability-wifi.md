# Course readability — Wi-Fi Tier 1 and Tier 2 (steps 5 and 6 of the spec)

> superpowers:subagent-driven-development, lean loop: one implementer per batch, two batches in parallel when they share no file, one combined reviewer (beginner read of the dump + pins) per batch, one fix round; one whole-step review per tier, one fix wave, merge.

**Goal:** every Wi-Fi lesson is on the readability contract; Tier 1 (modules 0–1, 14 lessons → 16) then Tier 2 (modules 2–8 minus AMP, 12 lessons, 13 if `rate` splits). AMP lessons stay untouched (user instruction 2026-09-22: no AMP work until asked).

**Spec:** `docs/superpowers/specs/2026-09-21-course-readability-design.md` — binding sections: "The shape of a lesson", "Words", "Numbers", "Length and pace", "Splitting", "Plan template for steps 2–7". Reference pairs: `src/course/uwb/uwb-frame.ts` (+ test), `src/course/uwb/uwb-capstone.ts` (project rubric). Kit: `tests/course/kit.ts` (`lessonShapeSuite`, `runOf`, `READABILITY_INCLUDE`), `scripts/lesson-dump.ts`.

## Global constraints

- Spec rules, enforced by `tests/course/readability.test.ts`; prose windows are `lessonWords` without observe/tryThis/quiz; total 500–1300, ≤ 20 min; `radio-primer` is the track opener (≤ 1000).
- `tests/fixtures/lesson-hashes.json` additions only (a split's new id gets the first half's hash; the first half keeps the id). No scene changes.
- Every pinned claim keeps its test; `.body!` sites in the batch's tests are retired.
- EN + ZH written, not translated; citations only in `sources` and numbers table cells; no copyrighted text.
- **Controller-owned files:** `src/course/curriculum.ts` (COURSE_ORDER, MODULES), `src/course/lessons.ts`, `tests/course/readability.test.ts` (MIGRATING, TIER1_BASELINE, KNOWN_WORDS changes), `src/course/readability.ts` KNOWN_WORDS, the fixture. Implementers grade with `READABILITY_INCLUDE=<ids>` and own only their lesson files and tests.
- Trailers: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`.

## Rulings made in planning

1. Tier 0 lessons still inside `lessons.ts` (`airtime`, `ifs`, `backoff`, `nav`, `hidden`, `anomaly`) move to `src/course/tier1/<id>.ts`; the twelve tier-1 ones to `src/course/tier2/<id>.ts`. Shared scene builders (`sc`, `oneRoom`, `hallwayHouse`, `longApartment`, `widthScenario`, `mumimoScenario`, `rateScenario`) move to `src/course/wifiScenes.ts`. Done once, mechanically, before any rewrite (T0), so every batch is file-local.
2. `rate` (2 009 words) may split into `rate` + `rate-fallback` (first half keeps the id and scene); the implementer decides and records it. No other new split.
3. Generation names `HT`, `VHT`, `HE`, `EHT` join `KNOWN_WORDS` (product-generation labels, like protocol names). Every other `TIER1_BASELINE` word gets an owner in Tier 1 `terms` (table below) and the baseline list is deleted after Tier 1.
4. Lessons under 500 words (`airtime`, `ifs`, `ampdu`, `txop`, `ofdma-dl`, `ofdma-ul`, `mlo`, `capstone`) grow to the contract's floor by explaining, not by padding: a why, a picture with a watch, a numbers table pinned to the run.
5. After step 6, `MIGRATING` holds only `amp-slots` and `amp-coexist`; `body` stays optional until AMP is revised. Step 7's other items (docs, TIER1_BASELINE gone) are done here.

## Baseline owner table (step-5 deletion test asserts each word is in that lesson's `terms`)

| Lesson | Owns |
|---|---|
| radio-primer | SNR, SINR, RSSI |
| decode-thresholds | MCS, OFDM, CCA |
| roles-stack | BSS, BSSID, SSID |
| frame-anatomy | PPDU, MPDU, MSDU, FCS, CRC, QOS |
| frame-anatomy-bytes | L-STF, L-LTF, L-SIG, U-SIG |
| airtime | ACK |
| ifs | SIFS, DIFS, EIFS |
| backoff | CW |
| nav | NAV |
| hidden | RTS, CTS |

## Tasks

- **T0 (sonnet) pure move:** ruling 1 + `scripts/lesson-dump.ts --all-wifi`. Gate: full suite, fixture byte-identical, `lessons.ts` keeps only assembly. Commit `refactor(course): Wi-Fi lessons and scene builders into tier1/, tier2/ and wifiScenes.ts`.

Tier 1 batches (each: rewrite in place to the contract; ≤ 6 terms; the owner table's words in `terms`; retire `.body!`; return budgets from lesson-dump):
- **B1** `radio-primer` (opener ≤ 1000; a radio is a voice in a room: distance, walls, noise; watch on the RSSI/SNR line), `decode-thresholds` (same primerScenario: why a frame decodes or not; CCA, MCS as "how fast you dare talk").
- **B2** `roles-stack` (who is who: AP, station, BSS; the stack as envelopes), `frame-anatomy` → `frame-anatomy` (header, addresses, what each field is for) + `frame-anatomy-bytes` (the byte budget, the decoder, aggregation hooks; L-STF/L-LTF/L-SIG/U-SIG). Same scene; new id's hash = first half's.
- **B3** `airtime`, `ifs`, `backoff`, `nav` (oneRoom scene; each grows to ≥ 500 with one numbers table pinned to the run).
- **B4** `hidden` (hallwayHouse; RTS/CTS), `anomaly` (longApartment; the slow station taxes everyone).
- **B5** `retries-queues`, `bianchi`, `bianchi-vs-sim` (bianchiScenario shared by the last two; keep the model widget; the maths goes to numbers/deeper).
- **B6** `tier1-project` → `tier1-project` (the brief and the plan) + `tier1-project-review` (reading the results, the write-up; rubric like uwb-capstone). Same projectFlat scene.
Waves: B1 ∥ B3 → B2 ∥ B4 → B5 ∥ B6. Controller after each wave: register split ids, COURSE_ORDER, MIGRATING, fixture additions, `chore(course): register …`. After wave 3: delete TIER1_BASELINE with the owner-table test, KNOWN_WORDS += generation names. Tier 1 whole-step review (fable) → one fix wave → merge to main.

Tier 2 batches (same rules; needs may name any Tier 1 lesson):
- **C1** `edca`, `ampdu`, `txop` (oneRoom). **C2** `txop-protect` (hallwayHouse). **C3** `width`, `streams` (widthScenario). **C4** `rate` (+ `rate-fallback` per ruling 2). **C5** `ofdma-dl`, `ofdma-ul`, `mumimo`. **C6** `mlo`, `capstone` (the Wi-Fi capstone gets the project rubric shape).
Waves: C1 ∥ C3 → C2 ∥ C4 → C5 ∥ C6. Controller registers after each wave; Tier 2 whole-step review (fable) → one fix wave → MIGRATING reduced to the two AMP ids, docs (README course section, Guide) → merge to main.

**Review per batch:** one sonnet reviewer reads `npx tsx scripts/lesson-dump.ts <id> en|zh` for each lesson as a beginner who knows only the preceding lessons of the track, then checks the pin inventory against the pre-rewrite test file and the fixture rule. One fix round.
