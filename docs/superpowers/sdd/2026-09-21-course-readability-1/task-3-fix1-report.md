# Task 3 fix round 1 — re-review

Diff under review: `a850db8..070f21a` (8 files, +232/−171), read in full from
`task-3-fix1-review.md`. Gates re-run (not trusted from the report): both green.

## task-3-review-report.md findings

**Important 1 — AMP-Sync/AMP-SIG not glossed in `picture`.** ADDRESSED.
`src/course/amp/amp-ppdu.ts:74` (watch block, `jump: 0`) now reads "...then
AMP-Sync, a run of flashes that lets the tag find the beat; then AMP-SIG, two
octets saying what frame follows and how long it is; then the data octets...".
Both terms are glossed at their first (and only) use inside `picture`.

**Important 2 — bilingual walk duplicated four times.** ADDRESSED.
`src/course/readability.ts:145-167` adds `lessonStrings(l: Partial<Lesson>)`,
walking `why, outcomes, terms, picture, numbers, deeper, sources, observe,
tryThis, quiz` (terms via `plain` only, not `term` — documented, same choice
`lessonWords` already made). Verified by grep: no `isL10n`/`const walk = (x:
unknown)` block remains in any of `tests/course/{amp-intro,amp-ppdu,uwb-intro,
uwb-frame,readability}.test.ts` — all five now call `lessonStrings` (or
`readability.test.ts`'s one-line `textsOf` wrapper around it). The smoke bound
`toBeGreaterThan(40/50)` is gone from all four lesson tests, replaced by a
structural floor (one string per outcome/term/block/source/observe/tryThis/
quiz-part) — closes Minor 6 too.
Secondary note (the `recs`/`ofType`/`txs`/`ends` duplication and the repeated
1-second simulation between `amp-intro.test.ts` and `amp-ppdu.test.ts`) —
DECLINED-BY-RULING, per the controller's ruling that shared simulation
fixtures across lesson tests are carried to a later step. Matches the original
review's own framing ("a controller decision, not this task's").

**Minor 1 — stale `SLOT_NS`/9 µs quote.** ADDRESSED per ruling. Both
assertions dropped (`tests/course/amp-intro.test.ts`), `SLOT_NS` import
removed, comment explains why. Grepped: no `SLOT_NS` reference remains in
either amp test file or lesson file.

**Minor 2 — 4190 µs/4.19 % only pinned next door.** ADDRESSED.
`tests/course/amp-ppdu.test.ts:290-296` now measures the base run's 4190 µs
and formats 4.19 % itself, with a comment explaining why it's measured rather
than trusted from `amp-intro.test.ts`.

**Minor 3 — "opens the next" drops the SIFS gap.** ADDRESSED.
`src/course/amp/amp-intro.ts:101` (EN) / same line (ZH) now read "the next
slot opens just after each acknowledgement ends" / "下一个时隙就紧跟在每一帧确认
结束之后开启" — both now state the gap the engine actually inserts.

**Minor 4 — module label M7 vs M8.** ADDRESSED, resolved the other way from
the review's suggestion (a legitimate call, and the right one): `amp-intro.ts`
and `amp-ppdu.ts` headers now say "Tier 2 · M8", matching `amp-slots.ts`,
`amp-coexist.ts` and `curriculum.ts:82`'s "M8 ambient power IoT" comment. `M7`
is `curriculum.ts:80`'s "M7 scheduled Wi-Fi 6/7", a different module — verified
no collision.

**Minor 5 — report's wrong baseline count (5/22 vs 6/33).** ADDRESSED (in
`task-3-report.md`'s "Fix round 1" section, which restates 6 describes/33
`it`s and corrects the sentence).

**Minor 6 — smoke bound, not a count.** ADDRESSED (folded into Important 2 —
see above).

## task-3-novice-read.md findings

**amp-ppdu 1 — "closing extension" undefined at first use.** ADDRESSED.
`src/course/amp/amp-ppdu.ts:90` ("Small frame, long airtime") now glosses it
inline: "the closing extension — a scrap of quiet the band adds after any
frame with a Wi-Fi opening". `numbers` (`:99`) reuses the same name.

**amp-ppdu 2 — U-SIG / legacy signal field unexplained.** ADDRESSED, with a
location nuance worth recording: neither term ever appears inside `picture`
(not before the fix, not after) — both are named only in the `numbers` formula
note (`:99`) and `sources` (`:131`), which is where the fix explains them:
"the legacy signal field that states the length, and the U-SIG, the newer
header a Wi-Fi 7 radio reads to learn what kind of frame this is." This closes
the novice reader's actual complaint (no plain-language line existed anywhere)
even though the explanation lives in `numbers` rather than `picture` — the
original Important 1 finding never asked for U-SIG in `picture`, only
AMP-Sync/AMP-SIG.

**amp-ppdu 3 — citation inside the main-path padding table.** ADDRESSED.
`amp-ppdu.ts:113-118` — the "Where" column is gone (table is now two columns);
`sources:127` carries the clause "The padding of the table above — 20 µs
unprotected, 36 µs protected — is 11-26/1519r5 §39.3.2.2."

**amp-intro 1 — CCA_BUSY/BACKOFF_DRAW/IFS_START unglossed.** ADDRESSED.
`amp-intro.ts:104-106` — "CCA_BUSY, the channel sounding busy; BACKOFF_DRAW, a
countdown drawn before speaking; IFS_START, the wait after someone else
stops."

**amp-intro 2 — algebra before the plain idea.** ADDRESSED.
`amp-intro.ts:144` — "Not weak signal. Each tag picks one of four numbers at
random and counts that many slots along. In the trigger's own terms: ..."
now leads with the plain idea.

**amp-intro 3 (declined) — split "A second of polling".** DECLINED-BY-RULING,
as instructed ("no split of 'A second of polling'"); the fix report records
the reasoning (12 words of headroom, a second block costs a heading).

**ZH naturalness, 5 items.** Four were rewritten to (or very close to) the
reader's suggested phrasing and verified in the diff: "帧与帧之间，它也没法准确计时。"
(`amp-intro.ts:78`); "正因如此，站在标签旁边的 Wi-Fi 终端只能察觉"空中有动静"..."
(`amp-ppdu.ts:87`); "填充把这段思考时间安排在只耗费空口时间、别无其他代价的地方；填充还在发送..."
(`amp-ppdu.ts:83`); and the "四个边界" sentence at `amp-intro.ts:130` (see New
Defect below — the rewrite itself introduced a typo). The fifth — the fuller
rewrite of "put the halves together" — was DECLINED-BY-RULING for the lighter
reordering instead, exactly as ruled: `amp-ppdu.ts:91` reads "两半合起来看就会发现"
rather than the reader's "大半时间都花在了它本身要说的内容之外" (which the fix report
correctly notes would shift the claim from "most of the frame is not the
message" to "most of the time is spent outside the message" — a different,
less exact statement).

## Deferred Task 1 items (task-1-review-report.md)

**#6 — ZH-side acronym and quantity checks.** ADDRESSED.
`tests/course/readability.test.ts:114-118` (acronym rule) and `:127`
(quantities) now run over `s.zh`/`p.zh` as well as `s.en`/`p.en`.

**#7b — bilingual walk over `sources`/`outcomes`/`terms.plain`.** ADDRESSED.
`readability.test.ts:83-97` — new "says everything in both languages" test per
migrated lesson, walking `lessonStrings(l)` (which includes `sources`,
`outcomes` and each `terms[].plain`), with the same structural floor and the
`en !== zh` guard on multi-word English.

**#9 — `firstOfTrack` comment.** ADDRESSED.
`readability.test.ts:1013-1020` — a doc comment states it means "the first
*migrated* lesson of the track", that this need not be `COURSE_ORDER`'s first
lesson mid-migration, and why that's deliberate.

## RED proof plausibility

The implementer's proof (corrupting `amp-intro`'s ZH picture with "标签的 XYZQ
接收机在 1 2 3 时刻…") is plausible against the new assertions:
"XYZQ" is a 4-letter upper-case token the new ZH acronym loop
(`readability.test.ts:116`) would extract and fail to find in `known`; "1 2 3"
are three separate single-digit numbers, each too short for the quantity
regex's 3-digit lookahead to merge with its neighbour, so `numericQuantities`
counts 3, failing the new `≤ 2` ZH check (`:127`). Both failures the report
quotes match the mechanism of the assertions actually added.

## Gates (re-run, not trusted from the report)

| command | result |
|---|---|
| `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | **33 files, 819 tests passed** — matches the report exactly |
| `npx tsc -b --noEmit` | clean, exit 0, no output |
| `git diff --stat` on `tests/fixtures/` between `cd73d94..070f21a` | empty — hash fixtures untouched |
| Word/minute bounds for all four migrated lessons | covered by `readability.test.ts`'s "fits the main path" test, part of the 35 passing tests in that file; not independently re-measured |

`readability.test.ts` runs 35 tests as claimed (3 bookkeeping + 8 rules × 4
migrated lessons).

## New Breakage in the Fix Diff

**Minor — a typo introduces a nonsensical word into shipped ZH prose.**
`src/course/amp/amp-intro.ts:130` — the rewritten sentence reads "这四个边界，
标签自己**掀不准**，得靠确认帧一个个替它点明。" `掀` (xiān, "to lift/flip open" — 掀开,
掀起) does not collocate with "不准" in this sense; the reviewer's suggested
word, and the only one that makes sense here, is `掐` (qiā, "to reckon/count
precisely," as in 掐算/掐指一算 — "标签自己掐不准"). This sentence did not exist in
this form before this round (the pre-fix ZH was a different, grammatical if
calque-y construction: "标签的时钟自己找不齐四个边界"), so the typo is new to this
diff. It is invisible to every test in this suite (no test asserts ZH prose
content beyond non-emptiness and en≠zh), so nothing caught it. Not a fact
error and not scope for reopening the task, but it undercuts the "written
fresh, not translated" ZH-quality claim this round makes for exactly this
sentence, and should be fixed by a one-character edit (掀→掐) whenever this
file is next touched.

## Out-of-Scope Observations

- `amp-coexist.ts:58` still says "前两课" with three AMP lessons now before it
  (task-3-report's own Concern 3, explicitly deferred to `amp-coexist`'s
  migration). Unchanged by this fix round; not reopened here.
- `terms[].term` strings (e.g. `AMP`, `ABOC`) are still outside `lessonStrings`
  / `lessonWords`'s walk — a pre-existing, brief-mandated choice (Task 1
  review Minor 5), not touched or worsened by this round.

## Verdict

**ALL ADDRESSED.** Every Important, Minor, novice-read and deferred-Task-1
finding is closed by the diff, all three controller rulings are honoured
exactly as ruled, and both gates are green and match the fix report's claimed
counts. One new, narrow-scope Minor defect was found in the fix diff itself: a
typo (掀→掐) in one rewritten ZH sentence at `src/course/amp/amp-intro.ts:130`,
invisible to the test suite. It does not reopen this fix round.

Report path: `D:\wifi_sim\.claude\worktrees\feat-link-2g\.superpowers\sdd\2026-09-21-course-readability-1\task-3-fix1-report.md`
