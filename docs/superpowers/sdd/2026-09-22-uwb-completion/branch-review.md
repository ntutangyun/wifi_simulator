# Whole-branch review — feat/uwb-ranging, bbc5233..909706c

Reviewer: fable, read-only. Inputs: the plan, the ledger, task-2/3/4 reports and reviews, the
8 224-line branch diff, the lesson contract, rendered dumps of `uwb-sts` / `uwb-capstone` (EN +
ZH) and of the four re-based 4ab lessons, and a headless probe of the claims no test pins.

Gates re-run here: `npx tsc -b --noEmit` clean; `npx vitest run` 136 files / 2350 tests green.

## Verdict: FIX WAVE

The engine work is sound and I would merge it as it stands: the T1 split moved nothing (all
fixtures byte-identical), the σ_ts(SNR) shape is one function used by every draw with the
draws in their old stream positions, the one-to-many layout reduces to the pairwise one at
R = 1 (28 slots, 4/5, 24/26) and the `fragGapNs` fix is applied in all three places it must be,
capture is per receiver and per fragment without touching `Spectrum.foreignMw`, every
constant I found is tagged, no standard text is pasted (the one quotation was paraphrased in
f481f90), EN/ZH strings are matched pairs, and the tests pin named records rather than "the
first of that type". The rulings in the ledger are sound; none needs re-opening.

What blocks the merge is the course: six findings of the stated-vs-simulated class (the
memory's recurring bug), all prose or one variant, all cheap. One fix wave covers them together
with the T4 review's carried items.

## Important — fix before merge

**I1. `uwb-capstone` decision three claims the opposite of what the run does.**
`src/course/uwb/uwb-capstone.ts:148` (picture, EN + ZH): "It is fewer transmissions for the
same three ranges — and a longer round, in which a lost fragment costs every anchor at once";
`:189` (rubric row "One round or three"): "far fewer transmissions … puts the price where a
fragment is lost, since all three then suffer together". Probe over the lesson's 1 300 ms:
base (DS-TWR + AoA) 44 UWB transmissions, 8.5 ms of air, 6 lost to Wi-Fi; "One round for all
three" 294 transmissions (7 NBPOLL + 21 NBRESP + 42 NBREPORT + 224 RSF), 62.5 ms of air, 14
lost — the table's own "Lost to Wi-Fi 14 against 6" already says so. And a lost fragment is a
per-receiver event (T3 built exactly that: capture and loss are decided at each receiver); what
costs all three anchors at once is the tag's broadcast Poll, or the tag's own busy check
(what `uwb-nba` shows). The variant also switches the session from 4z DS-TWR with bearings to
MMS SS-TWR without them, which the lesson never says (that is why its "Fixes 7, three-range 7").
Fix: rewrite the paragraph and the rubric cell around what is true — one exchange instead of
three, and a train every anchor shares, bought with seven times the airtime (a train is 8
fragments from each of 4 devices plus 7 narrowband messages) and more losses to the router; the
loss that hits all three is the Poll or the tag's busy check; say the variant is the
multi-millisecond mode and drops the bearings. Pin in `tests/course/uwb-capstone.test.ts`:
UWB-node `TX_START` count and summed `txTimeNs` for base vs `V_OTM` (44 / 294, 8.5 / 62.5 ms).

**I2. The capstone's brief is never closed.** `uwb-capstone.ts:110` (why) and `:132`: "the phone
must be placed to within half a metre". Every three-range fix in every scene is 0.53–0.57 m
(pinned 0.55 mean / 0.57 worst), so no scene meets the brief and the lesson never says which
does, or that none does as they stand. A learner marking themselves against the table has no
answer to the one requirement they were given. Fix: one sentence after the "What the bias does
to the fix" formula (`:178-183`): as they stand none of the four scenes meets the brief — the
bias alone is 0.60 m — and the second experiment (subtracting anchor-3's mean error) is what
meets it; add a "Brief" row to the rubric or fold it into "Honesty". Pin: max three-range
error > 0.5 m in all four scenes, and the bias-corrected re-solve (anchor-3 ranges − 0.60 m
through `solvePosition`) under 0.5 m.

**I3. `uwb-nba` / `uwb-nba-coexist` still say "one distance" after the re-base.** The base now
yields four distances in blocks 0 and 4 (probe: anchor-1 4.74 m and anchor-3 5.46 m, twice), and
`uwb-nba-coexist`'s own table and prose already say "4" / "Four distances between them". Stale:
`src/course/uwb/uwb-nba-coexist.ts:194` quiz Q1 "Why does the base scene produce one distance in
1.3 seconds?" (EN + ZH), `:204` quiz Q2 "21 distances instead of one" (EN + ZH), `:10-11` header
comment; `src/course/uwb/uwb-nba.ts:169` "In this scene that happens exactly once" (EN + ZH),
`:237` jump label "the one distance of the whole run" / "整段运行里唯一的一个距离". Fix: "four
distances in two blocks, and no position"; "21 distances instead of four"; "twice in seven
blocks"; jump label "the first distance the run gets out" as `uwb-nba-coexist.ts:178` already
has it. Pin the quiz question strings in `tests/course/uwb-nba-coexist.test.ts` and the picture
sentence in `tests/course/uwb-nba.test.ts`.

**I4. `uwb-sts` numbers prose contradicts the quiz (T4 review I1).** `src/course/uwb/uwb-sts.ts:122`
"the two halves of the formula pull the same way" vs quiz 2 "One reading falls and the other
rises". The quiz is right: both RX counters fall by 3 195 RCTU, which shortens Tround and
lengthens Treply, so the difference falls by twice the advance and the ÷2 leaves one. Fix the
prose (EN + ZH): "Both receive counters come back low by the same amount. That makes the round
trip shorter and the reply time longer, so their difference falls by twice the advance, and the
halving leaves exactly one."

**I5. `uwb-sts` deeper quotes a wrong ratio.** `uwb-sts.ts:152`: the 32 768 STS chips are "two
thirds as long again as the pattern that opens the frame". SYNC is 64 × 508 = 32 512 chips, the
whole SHR 36 576: the segment is 1.008 × the SYNC and 0.90 × the SHR. Fix (EN + ZH): "about as
long as the SYNC that opens the frame — 32 512 chips — for a segment that carries no information
whatsoever"; pin `STS_ACTIVE_CHIPS` against `SYNC_SYMBOLS × PSYM_CHIPS` in
`tests/course/uwb-sts.test.ts`. (Depth may be dense; it may not be wrong.)

**I6. `uwb-sts` sends the learner to a scene it cannot load.** `uwb-sts.ts:126` (the counter table's
"Honest, at 20 m" column) and `:183` (experiment 1: "out of the honest 20 m run") refer to
`uwbIntroScenario(20)`, which is `uwb-intro`'s variant "20 m apart" and is not in this lesson's
variant list. Fix, preferred: add a third variant "Honest, at 20 m" (`uwbIntroScenario(20)`) —
fixture additions only, `uwb-sts#2` equal to `uwb-intro#0` in both files (byte-identical scene),
and the experiment reads "the third variant". Cheaper: name `uwb-intro`'s variant in the column
heading and the experiment. EN + ZH; pin whichever.

## Minor

**M1.** T4 review's two minors, unchanged: `src/course/curriculum.ts:98` comment "M15" → M16;
`uwb-capstone.ts:187-188` the hedges are on the wrong rows ("doubles the timeouts" is 18 → 40,
"roughly double" is exactly 18 → 36 and 6 → 12) — swap them, EN + ZH.

**M2.** `src/course/uwb/uwb-mms.ts:209`: "(14.22, 4.05) m" is the inspector's *last* fix (block 6)
while the log table three blocks up prints block 0's "(14.24, 4.08) … error 1.24 m". Both are
pinned; a beginner sees two fixes and no reason. Say "the last block's fix" or quote block 0's.

**M3.** `README.md:137` and `src/uwb/channel.ts:126-127`: "a fragment is at most 82 µs and the
shortest legal (MMS) slot is 250 µs" contradicts the row above it and the T3 I1 correction
(600 RSTU = 500 µs is the shortest legal MMS slot; 300 RSTU is refused), and a 256-unit RIF is
262.8 µs. Say: the longest fragment (262.8 µs) is shorter than the 500 µs slot.

**M4.** `src/uwb/device.mms.ts:452`: a train's SINR uses `first.foreignDbm` only, while
`TrainFragment.foreignDbm`'s doc says "the train's combined SNR is measured against it" (per
fragment). Doc fix now ("the first heard fragment's"); taking the max over heard fragments is a
behaviour change that would move the `uwb-nba*` hashes, so engine half → carry C2.

**M5.** `src/model/scenario.ts:302` attacker JSDoc "relays every ranging frame of this session":
MMS fragments are exempt (the check sits after the MMS early return in `onRxOk`). Say TWR and
TDoA frames, or note MMS is out of the model's reach.

**M6.** Stale hints in `src/ui/i18n.ts` after one-to-many: `uwbScheduleMms` (:531 "every
tag–anchor pair owns a round"), `uwbMmsHint` (:546) and `trainsHint` (:656) "a millisecond
apart" — one clause each, EN + ZH ("a pair per round, or every anchor with the switch on";
"a millisecond apart in a pair round").

**M7.** `tests/uwb/ts-noise.test.ts:157`: the comment calls `variants[1]` "the pairwise round whose
eight fragments combine…" — `variants[1]` is rsf-1 (X = 16) and since T4 the pairwise scene is
`variants[3]` (`uwb-mms#3`), whose hash *did* move in T2 (19.84–20.02 dB). The assertion is fine
for rsf-1; fix the comment, or point the test at `variants[3]` and assert scale ≤ 1.02.

**M8.** `tests/uwb/mms-one-to-many.test.ts:141` duplicates `hashOf` from
`tests/engine/uwb-record-hashes.test.ts:73` ("keep the two in step"). Move the fold to a shared
tests helper so a change to the fixture hash cannot silently pass one and fail the other.

**M9.** ZH prose carries the new English `term` tokens mid-sentence: "这就是 relay attack 的全部",
"一把 key", "变的只有 duty cycle" (`uwb-sts.ts`, `uwb-capstone.ts`). The contract's "the word as
the standard writes it" was meant for STS/SFD, not for everyday English. If the kit's term
matching allows it, write 中继攻击 / 密钥 / 占空比 / 任务书 in the ZH prose and keep the English in
the term table; otherwise carry (C6).

**M10.** `uwb-mms.ts:194` comparison-table label "Responders one slot allows": it is two slots, and
the pair column's "1" is by definition, not a limit. "Responders the Poll window holds".

## Carries (defer, with reason)

- **C1.** Reported sigmas (`rangeSigmaM`, `dlDiffSigmaM`, `ulDiffSigmaM`, the fix ellipses) still use
  the quoted `tsNoisePs`; a link-aware report moves every `UWB_POSITION` in the course (T2).
- **C2.** Foreign power over a train: max over heard fragments instead of the first (M4 engine
  half) — moves the `uwb-nba*` hashes; do it with the next re-pin.
- **C3.** The relay attacker does not touch MMS trains; the lesson only uses TWR (M5 documents it).
- **C4.** Schema messages are EN-only (`planOps.ts` surfaces `issue.message`) — pre-existing, noted
  by the T3 review.
- **C5.** `uwb-nba` "each of them answers a slot later": RESP windows are two slots; pre-existing
  wording, one word.
- **C6.** ZH term tokens (M9) if the readability kit's term matching forbids the translation.

## Lessons for the AMP / Tier-1 course revision

1. Re-basing a shared scene means grepping every "one / only / exactly once / the one X" in
   *both* lessons that load the builder, plus quiz questions, jump labels and header comments;
   pin quiz question text, not only the answers.
2. A variant may change one thing. When it must change several (mode + method + AoA), the prose
   says so and the comparison table names what was dropped.
3. A brief with a pass/fail number gets a sentence that says which scene passes it, pinned.
4. Every number in `deeper` gets a pin too — depth may be dense, not wrong (the STS/SYNC ratio).
5. An experiment must be performable from the lesson's own load list.
6. When `numbers` prose and a quiz explanation describe the same mechanism, one test compares
   the sign words in both.
7. Claims about "who pays when X is lost" are engine claims: check them against the loss path
   (per receiver vs shared control message) before writing them into a rubric.
8. Decide once how a non-standard English `term` reads inside ZH prose, and make the kit enforce it.
