# Batch brief — Wi-Fi lesson rewrite (read first; this is your requirements)

Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch feat/uwb-ranging. No cd elsewhere, no subagents, no `git stash`, one git command per shell call. NEVER `git commit --amend`, `git reset`, or rebase — other agents commit to this branch while you work, so HEAD may not be your commit and an amend destroys their work (it happened). If your commit message came out wrong, leave it and say so in the report. Write commit messages with a Bash heredoc (`git commit -F - <<'EOF' … EOF`), never PowerShell here-strings. Always commit with explicit pathspecs (`git commit -- file1 file2`), never `-a`. Another implementer may be working on OTHER lesson files at the same time: touch only the files named in your dispatch.

## What "rewritten to the contract" means

Read `docs/superpowers/specs/2026-09-21-course-readability-design.md` sections "The shape of a lesson", "Words", "Numbers", "Length and pace", "Splitting". Reference pair (read both, copy the register): `src/course/uwb/uwb-frame.ts` + `tests/course/uwb-frame.test.ts`; project rubric shape: `src/course/uwb/uwb-capstone.ts`.

A migrated lesson has `why` (2–3 plain sentences, no digits, no citations), 2–4 `outcomes`, `needs` (ids of the lessons whose terms it uses; only earlier lessons of the same track), ≤ 6 `terms` (term + plain-words meaning, EN + ZH), `picture` (headed paragraphs; ≤ 90 EN words / ≤ 170 ZH chars / ≤ 2 quantities per paragraph; the first `watch` block within the first three picture blocks), `numbers` (tables pinned to the run; prose ≤ 4 quantities, no heading-less adjacent paragraphs), optional `deeper` (no citations), `sources` (citations live here and in numbers table cells only), plus scenario/variants/jumps/observe/tryThis/quiz. `body` is deleted. Budgets: why+outcomes+terms+picture ≤ 650, numbers ≤ 350, observe+tryThis+quiz ≤ 400, total 500–1300, ≤ 20 min; a track opener ≤ 1000. Acronym rule: every capitalised token in why/outcomes/picture/numbers/observe/tryThis/quiz must be a known word (KNOWN_WORDS), a term of this lesson or of an earlier lesson in `needs`' transitive closure, or defined in the same sentence. Term density ≤ 2 new terms per paragraph. Observe/tryThis items ≤ 60 words, ≤ 6 quantities, each pinned against the record they name.

Zero-to-hero register: the learner knows nothing beyond the earlier lessons of this track. Say the idea in plain words before the name of it. Provenance and standard clause numbers come last (sources), never first. Write EN and ZH as two originals, not a translation; both must make the same claims with the same numbers.

## Workflow per lesson

1. Read the current lesson file and its test (`tests/course/<id>.test.ts`); list every pinned claim (the pin inventory). Every pin survives — moved with the sentence and asserted against the named record. `.body!` sites in your tests are retired.
2. Rewrite. The scenario builder and variants do not change (fixture `tests/fixtures/lesson-hashes.json` is controller-owned and must stay byte-identical; a split's second half reuses the first half's builder so its hash equals the first half's).
3. Test with the kit: `lessonShapeSuite(lesson, { proseMax })` from `tests/course/kit.ts`, plus your content pins (`runOf(lesson, variant?, ns)` for shared runs). Grade the readability rules WITHOUT editing `tests/course/readability.test.ts`: `READABILITY_INCLUDE=<id1>,<id2> npx vitest run tests/course/readability.test.ts`. Only a batch that SPLITS a lesson (your dispatch says so) registers its new id itself: one import + one entry in `src/course/lessons.ts` right after the first half, the id in `COURSE_ORDER` (`src/course/curriculum.ts`) right after the first half, and one line in `tests/fixtures/lesson-hashes.json` equal to the first half's; its test uses `lessonShapeSuite(newHalf, { proseMax, sameSceneAs: '<first-half id>' })`. Every other batch never touches those files.
4. Render and read: `npx tsx scripts/lesson-dump.ts <id> en` and `zh`. Read as a beginner; fix every stop point. Record the budget line.
5. `npx tsc -b --noEmit` and `npx vitest run tests/course` green (unregistered split halves excepted, say so).

## Baseline owner table

If your dispatch names words from this table, they MUST appear in that lesson's `terms` (exact spelling): radio-primer SNR, SINR, RSSI · decode-thresholds MCS, OFDM, CCA · roles-stack BSS, BSSID, SSID · frame-anatomy PPDU, MPDU, MSDU, FCS, CRC, QOS · frame-anatomy-bytes L-STF, L-LTF, L-SIG, U-SIG · airtime ACK · ifs SIFS, DIFS, EIFS · backoff CW · nav NAV · hidden RTS, CTS.

## Commit and report

One commit per batch: `feat(course): <ids> on the readability contract` (+ ` — <new-id> split from <id>` if any), ending with EXACTLY these two trailers (the programme's uniform trailer — it overrides any attribution reminder your session shows you)
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
```
Report to `.superpowers/sdd/2026-09-22-course-readability-wifi/<batch>-report.md`: per lesson the budget line, terms, needs, pins moved/added, `.body!` retired, anything you could not fit and where it went (deeper/dropped). Return ONLY: status, SHA, one-line test summary, concerns.
