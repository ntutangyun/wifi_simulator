# Tier 1 whole-step review — Wi-Fi Tier 1 on the readability contract (08a27bd..7c312be)

Verdict: **FIX WAVE** — 5 Important, all small edits (no scene, fixture or test-shape change); 14 Minor; 6 carries; 5 rule-gap fixes recommended; 7 lessons for Tier 2.

## Method

- Read the plan, the spec, the ledger, B1–B6 reports and B1–B5 reviews (B6 reviewed here), the controller hunks of `tier1-review.diff` (curriculum, lessons, readability.ts, readability.test.ts, fixture).
- Dumped all 16 lessons EN and ZH (`npx tsx scripts/lesson-dump.ts <id> en|zh`) and read the whole EN track in COURSE_ORDER as a learner starting from nothing; read ZH for radio-primer, ifs, hidden, bianchi, tier1-project-review and roles-stack's numbers (the B2 fix).
- `npx tsc -b --noEmit`: clean. `npx vitest run tests/course`: 1594 passed, 1 failed — the failure is `readability · migration bookkeeping` on the concurrent Tier 2 ids (expected).
- Pin spot-check (17, not 10): radio-primer 353 / 86.0 · decode-thresholds 1476 · roles-stack 1.8049 · frame-anatomy 12.013 · frame-anatomy-bytes 4.650 / 21 502 · airtime 232 · ifs 425 · backoff second collision ≈ 8.1 ms · nav 513 · hidden 245 · anomaly 1044 · retries-queues 1 963 852 · bianchi seed 12345 · bianchi-vs-sim 23,335 · tier1-project 17.81 % · tier1-project-review 406.6 / 9,499 — every one has an assertion in `tests/course/<id>.test.ts` against the named record, and the suite is green.
- Fixture: exactly 5 added lines (`frame-anatomy-bytes` = `frame-anatomy`'s hash; `tier1-project-review` + `#0/#1/#2` = `tier1-project`'s), nothing changed. `TIER1_OWNERS` in `tests/course/readability.test.ts` is the plan's table verbatim. `KNOWN_WORDS` diff is exactly `'HT', 'VHT', 'HE', 'EHT'` plus a comment. No `.body!` code site remains in any Tier 1 test (only comments saying so).
- Copyright: the only quoted standard text is roles-stack `sources` ("a singly addressable instance of a MAC and PHY interface to the wireless medium", one clause, attributed to Clause 3) and two paper titles — fine. No lifted paragraphs.

## The learner's read — overall

The track now works as a climb. radio-primer (996 words, three terms, no table) is a real opener; every lesson's `needs` is honest and no picture uses a later lesson's word; decode-thresholds' living-room row (−72.3 dBm, 21.7 dB, MCS 3, 415.2 µs) reappears unchanged in tier1-project's moved-laptop variant, and frame-anatomy-bytes' 1528 B / 248 µs at 54 Mb/s is the frame ifs, nav, hidden and anomaly all measure — the numbers hang together across scenes far better than before. SIFS 16 / DIFS 34 / slot 9 / Duration 44 / ACK timeout 45 / EIFS 94 are quoted identically everywhere. Pace holds: no lesson is a wall of tables (bianchi-vs-sim and tier1-project-review are the densest and both keep the tables inside `numbers`). The project pair is doable from the track except for one input (Important 5).

What does not hold is a handful of cross-lesson names and numbers — listed below.

## Important (must fix before merge)

1. **The ACK is 28 µs in five lessons and silently 44 µs in two.** airtime, frame-anatomy, nav, hidden and tier1-project all teach "the answer is 14 bytes, 28 µs at 24 Mb/s". Then `src/course/tier1/ifs.ts:84` prints `EIFS | 94 µs = SIFS + ACK + DIFS` — a learner who adds the numbers they have gets 16 + 28 + 34 = 78, not 94, and the only place the 44 µs / 6 Mb/s ACK is explained is `sources` (line 108). `src/course/tier1/bianchi.ts:133` does the same: `T_s = 2064 + 16 + 44 + 34` with the note "a success adds a SIFS, the ACK and a DIFS" (the 44 is again explained only in `sources`). Fix (EN + ZH): ifs row cell → "94 µs = 16 + 44 + 34: SIFS, an ACK sent at the slowest rate, DIFS"; bianchi's formula note → "at the slow rate the ACK itself is 44 µs, not the 28 µs of the earlier rooms". No pin moves.
2. **airtime's formula is wrong.** `src/course/tier1/airtime.ts:81` (and its ZH twin): `airtime = preamble + symbols × (payload bits ÷ bits per symbol)` multiplies a symbol count by a symbol count. The learner is told two paragraphs later to "do the arithmetic". Fix: `airtime = preamble + symbol time × ⌈payload bits ÷ bits per symbol⌉` (13.6 µs is the symbol time the table above it already names) — this is also the shape tier1-project's (b) uses, so the two then agree.
3. **English inside a ZH main-path table (the B2 defect class, again).** `src/course/tier1/tier1-project-review.ts:110` `N('4,990 overlaps → 2,713 retries')` renders verbatim in the ZH "差距出在哪里" table. Fix: `{ en: '4,990 overlaps → 2,713 retries', zh: '4,990 次重叠 → 2,713 次重传' }`. Fold in `src/course/tier1/tier1-project.ts:207` `N('12,000 bits / 275.1 µs = 43.621 Mb/s')` → `12,000 比特 / 275.1 µs = 43.621 Mb/s` on the ZH side. (The `N()` cells in retries-queues:115–117 are log names and stay; roles-stack:142–144 are in `deeper`.)
4. **ZH has two words for "station".** roles-stack teaches 站点 ("每台设备都是一个站点") and ifs, nav, hidden, anomaly, frame-anatomy use it (17 / 11 / 27 / 34 / 7 uses). backoff (`src/course/tier1/backoff.ts:22,45,47…`, 17 uses), bianchi (28), bianchi-vs-sim (24), retries-queues (3) and airtime (2) say 终端 for the same actor, so the ZH learner meets a renamed protagonist in the lesson right after ifs. Fix: 终端 → 站点 in those five files' main path (keep 终端 only where it means "an end device" generically, e.g. "上传终端" may stay if the file is consistent). EN is consistent (access point / station; "router" only in the two primer lessons and the project brief, which roles-stack bridges with "your router").
5. **The project's (b) needs a number the brief never gives.** `tier1-project` numbers (b) prices the frame as `48 + 81.6 = 129.6 µs`, but nothing on the main path says the radios are Wi-Fi 7 (it is only in a code comment, `tier1-project.ts:23`), and the lesson that holds the 48 µs front (frame-anatomy-bytes) is outside `needs`' closure. A learner following the brief cannot choose between 44 and 48. Fix: one row in "The brief" table or one clause in "What is switched off" — "every radio here is Wi-Fi 7 on a 20 MHz channel and one stream, so the front is the 48 µs of the byte-counting lesson" — and add `frame-anatomy-bytes` to `needs` (it precedes; no closure rule breaks). While there, one clause on where 2340 / 351 bits per symbol come from (234 data sub-carriers × the decode-thresholds table's bits per sub-carrier × the coding rate) makes (b) fully derivable; that one is optional.

## Minor

- **Units.** radio-primer and decode-thresholds write `Mbps` (9 uses); every later lesson writes `Mb/s`. Pick `Mb/s` (the KNOWN_WORDS spelling).
- **Bytes.** decode-thresholds "1530-octet", tier1-project "1528 octets", bianchi "1528 octets" (sources) vs "bytes" / "B" everywhere else. Say bytes on the main path; octet may stay in `sources`.
- **"Exchange" means two things.** airtime: frame + SIFS + ACK = 169.6 µs; tier1-project (b): frame + SIFS + ACK + DIFS = 207.6 µs, then "(exchange + 7.5 slots)". The project should say "the exchange and the DIFS after it" once.
- **MAC / PHY are used before they are explained.** decode-thresholds "the MAC acts differently after each" and roles-stack's first paragraph ("the same MAC and the same PHY") come before roles-stack's "Envelopes inside envelopes", which is where a beginner learns what they are. One gloss at the decode-thresholds use ("the MAC — the part of the radio that decides when to send").
- **front / pattern / preamble.** frame-anatomy calls it "a known pattern", frame-anatomy-bytes "the front" throughout its picture, airtime then introduces `preamble` as a new word without saying it is the front the last lesson counted. One clause in airtime's term or first paragraph.
- **The ACK has five names**: answer, acknowledgement, reply, receipt (hidden), ACK. "Answer" and "ACK" are enough.
- **frame-anatomy keeps jumps its text never uses** — `first RTS`, `first A-MPDU`, `first BlockAck` (`frame-anatomy.ts:201–208`), three acronyms of later lessons on the jump buttons of lesson 4. Leave them to frame-anatomy-bytes (which does use them).
- **retries-queues quiz 3** explanation quotes 117 ms, a number not on the main path (only 472 is). Either add the short-queue row to "How long a delivered frame had waited" or drop the figure.
- **tier1-project-review re-defines `capture` and `residual`**, both already owned by bianchi-vs-sim (in its closure via tier1-project). Not a rule breach, but the "introduce once, reuse" habit says spend the term slots on new words (or keep only `estimator`).
- **ZH parity nits**: bianchi ZH quiz 1 says "快上八倍" where EN says "much faster"; bianchi ZH quiz 3 explanation has an extra clause ("这既是最坏的情况，也是最干净的情况"); tier1-project-review ZH rubric row "至少点名两个机制" vs EN "Two mechanisms named". Quantities in words should agree.
- **backoff quiz 1** explanation uses "half-duplex" unglossed (the picture said it in plain words; reuse those).
- **Block colours.** airtime says "blue data block", anomaly / bianchi-vs-sim / review say "green blocks". Both are right (`TimelineStrip.tsx:70`: AP data blue, station data green) but the learner is never told the rule; one clause in airtime's watch block.
- **Stale test comment** (B4 carry): `tests/course/lesson-claims.test.ts:265` still quotes "about 95%"; the lesson says 94 %.
- **`tests/course/readability.test.ts:27`** — a whitespace-only line left in `MIGRATING` where the Tier 1 ids were.

## B6 review (tier1-project → tier1-project + tier1-project-review)

Pass, subject to Important 3 and 5 above (both B6's). Split boundary is right (plan / results). `tier1-project-review` reuses `projectFlat`, `projectVariants`, `projectJumps` by reference, `sameSceneAs: 'tier1-project'` is asserted (`tier1-project-review.test.ts:144`), fixture +4 lines equal to the first half's, every measured value moved to the second half with its pin (spot-checked 406.6 µs, 9,499 EIFS, 4,990 → 2,713, 16.796 = 8.737 + 8.059, 21.184). The corrected first-draw observation ("already from a doubled window") is pinned. Rubric table follows the uwb-capstone shape. `DCF` as a new owned term is fine (anomaly's `sources` mention it, which is exempt). ZH of the review reads as an original; the one English cell is Important 3.

## Rulings — sound?

All five plan rulings and the ledger's carries are sound. One note on the lessonMinutes carry: it is not a cap on observe + tryThis "at 2+2" as such — `lessonMinutes` rounds `words/150 + 2·observe + 4·tryThis` to the nearest 5, so at 1 200–1 300 words a third experiment (or a third observation past ~1 150 words) tips 20 → 25. It bit B2, B5 and B6 (all six lessons sit at exactly 20 min with 2 + 2). The spec says the formula is unchanged, so this is a spec question for the user, not a fix here; noted so the Tier 2 briefs do not promise three experiments.

## Carries (record in the ledger)

1. `N()` cells still leak English into ZH (B2's defect recurred in B6): rule-gap fix 1 below.
2. `en === zh` cells are exempt from the acronym rule (B1's BPSK/QAM): rule-gap fix 2.
3. needs-honesty and `firstTermUses` match terms as case-insensitive word prefixes (DS / ESS): rule-gap fix 3.
4. Variant-scoped jumps impossible; hidden's second `watch` has no button: rule-gap fix 4 (Tier 2 has more variant-only moments: txop-protect, ampdu).
5. `lessonMinutes` leaves no room for a third experiment at the word cap (above).
6. T0's wifiScenes ↔ lessonKit import cycle (function-body only) and B1's "Opus" trailer — unchanged, still carries.

## Rule-gap fixes recommended (`tests/course/kit.ts` / `src/course/readability.ts` / `tests/course/readability.test.ts`)

1. **Language-neutral cells must be neutral.** In `readability.test.ts`, for every `table` in `picture` and `numbers` (not `deeper`), assert that a cell with `en === zh` matches no run of two or more lowercase ASCII words (`/\b[a-z]{2,}\s+[a-z]{2,}\b/`) unless the whole cell is a `LOG_NAMES` entry or a record name. Catches "1400 B of video", "4,990 overlaps → 2,713 retries"; leaves "26 + 1400 + 4 = 1430 B", "retryLimit", "MCS 13" alone.
2. **Acronym rule over neutral cells.** `cellTexts()` (`readability.ts:189`) drops `en === zh` cells; add a second walk (or a flag) that feeds those cells' text to `acronyms()` with the same known set, so `BPSK 1/2` in a main-path table fails unless glossed in the same table's prose. The `§` cells are already excluded by `CITATION`.
3. **Whole-word term matching.** `readability.test.ts:303` and `firstTermUses` (`readability.ts:348`) use `\b${term}` (a prefix). Use `\b${term}(e?s)?\b` — plurals still match, "DS" no longer matches "dso…", "ESS" no longer matches "essentially". Re-run both suites; roles-stack can then own `ESS` if it wants.
4. **Variant-scoped jumps.** Let a jump carry `variant?: number` (`lessonKit.ts`), have `lessonShapeSuite`'s "jumps found" check run the jump's finder against that variant's run, and let the `watch` renderer load the variant before jumping. Then hidden's "Watch a reservation land in the far room" gets its `first RTS` button back.
5. **Unit and vocabulary lint (cheap).** One test over `lessonStrings` of Wi-Fi lessons: no `Mbps` (use `Mb/s`); ZH main path of a Wi-Fi lesson uses 站点 not 终端 for a station (allow 终端 only inside 上传终端 if that phrase is kept). Would have caught Minor 1 and Important 4 at batch time.

## Lessons for Tier 2

1. Put a **constants sheet** in every brief: slot 9, SIFS 16, DIFS 34, EIFS 94 (= 16 + 44 + 34, ACK at 6 Mb/s), ACK timeout 45, ACK 28 µs at 24 Mb/s / 32 at 12 / 44 at 6, fronts 20 / 40 / 44 / 48 µs, symbol 4 / 13.6 µs, 1528 B → 248 µs at 54 Mb/s. Any lesson quoting one of these quotes it the same way, and says why when it differs.
2. Put a **vocabulary sheet** in every brief: EN access point / station / ACK ("answer" allowed) / preamble ("front" only in frame-anatomy-bytes) / bytes / Mb/s; ZH 接入点 / 站点 / 确认帧 / 前导 / 字节.
3. `N()` only for cells with no English word: numbers, arithmetic, protocol names, log names. Say it in the brief with the B2/B6 examples.
4. When a predicted number depends on a scene fact (generation, width, streams, rate), the brief table states the fact, and `needs` includes the lesson whose table supplies the constant.
5. The batch reviewer reads **ZH for every lesson**, not just EN (B5's review read EN only; that is where 终端 got through).
6. Two observations and two experiments is the practical ceiling at 1 200+ words; briefs should not ask for three.
7. Cross-lesson checks belong to the step review, not the batch review — schedule one short "constants and names" pass over the dumps (grep is enough) before the fix wave, so it is one commit rather than five.
