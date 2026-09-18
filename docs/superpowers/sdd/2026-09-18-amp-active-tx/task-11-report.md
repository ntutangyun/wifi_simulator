# Task 11 report — Lesson `amp-slots`, "Slotted random access: ABOC, ACW and collisions"

Commit: `4d00f86 feat(course): AMP lesson 2, slotted random access` (branch `feat/amp-active-tx`, worktree
`D:\wifi_sim\.claude\worktrees\feat-link-2g`).

## What was built

- `src/course/amp/amp-slots.ts` — the lesson, plus an exported `ampSlotsScenario({ acwe, readMode, tags })`
  so the test can build the seven-tag "try this" case from the same builder.
  - **Scenario:** `oneRoom()`, `ampAp('ap', 'Router', 5, 4, { pollIntervalMs: 20, slots: 4, acwe: 2,
    readMode: 'inline' })`, six tags evenly spaced on a 2 m ring around the AP (0°, 60° … 300°; the
    seventh, used only by the try-this, sits at 30°). Equal radius ⇒ equal RSSI ⇒ capture is impossible.
  - **Variants:** `ACWE 1 (ACW 1)`, `ACWE 3 (ACW 7)`, `Two-phase: id, then reading` (ACWE 2, `twoPhase`).
  - **Jumps (5):** first collision in a slot · first Ack naming the router itself · first lost response ·
    first sit-out (ACWE 3 variant) · first scheduled trigger (two-phase variant). The last two are
    labelled with the variant they live in, and the test checks them against that variant's run.
  - 3 observe, 2 try this, 3 quiz. **2000 English words → `lessonMinutes` = 25** (in the 15–25 range).
- `tests/course/amp-slots.test.ts` — 29 `it`s, each quoting the sentence it guards.
- `src/course/lessons.ts` — `ampSlots` imported and added to `AUTHORED` (after `ampIntro`).
- `tests/fixtures/lesson-hashes.json` — four new keys, **additions only** (`amp-slots`, `#0`, `#1`, `#2`).

## Measured values (base run = 30 rounds / 600 ms unless stated)

**Geometry.** Downlink −37.2 dBm to every tag (34.8 dB over the −72 dBm tag sensitivity); uplink
−57.2 dBm (36.8 dB over the −94 dBm 250 kb/s floor). Spread across the six tags < 0.01 dB.

**Round.** Unchanged from lesson 1 — 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs — but at a 20 ms
poll interval that is **20.95 %** of the channel. CTS Duration 4140 µs. 30 rounds, 120 slots, 120 Acks,
180 draws, 180 responses; 46 Acks name a tag, 74 name the router.

**First round (ACWE 2).** Draws 1, 0, 2, 3, 2, 2 → slots 2, 1, 3, 4, 3, 3. Tag 2 acked at 1556 µs, Tag 1 at
2434 µs, Tag 4 at 4190 µs; Tags 3, 5 and 6 all start slot 3 at 2444 µs, COLLISION at 2972 µs, Ack to the
router at 2982 µs, three losses at 3312 µs.

**Collision handling.** With equal RSSI nothing is even acquired as a preamble: the AP records
`RX_MISS` with reason `preambleSinr` (3 in the first round, 134 over the run) and **zero `RX_FAIL` of any
reason**, hence zero with reason `capture`, on any node, in every variant.

### Model vs measured (M = 6, N = 4, fractions over *reachable* slots only)

| ACWE | ACW | Reachable | Empty model/meas | Success model/meas | Collision model/meas | max gap |
|---|---|---|---|---|---|---|
| 1 | 1 | 2 of 4 | 1.6 % / 0.0 % | 9.4 % / 11.7 % | 89.1 % / 88.3 % | 0.023 |
| 2 | 3 | 4 of 4 | 17.8 % / 16.7 % | 35.6 % / 38.3 % | 46.6 % / 45.0 % | 0.027 |
| 3 | 7 | 4 of 4 | 44.9 % / 42.5 % | 38.5 % / 43.3 % | 16.7 % / 14.2 % | **0.049** |

Tolerance stated in the prose and asserted: **0.05** (five percentage points). The worst cell is the
success column at ACWE 3, 4.9 points — pinned exactly, so drift fails a test.

Note on the ACWE 1 row: `min(N, ACW+1) = 2`, so slots 3 and 4 are unreachable by construction. The
fractions are therefore taken over the reachable slots; the brief's formula is only meaningful there.
This is called out in the prose and in the formula note.

**Sit-outs.** ACWE 1 and 2: none (p = 1). ACWE 3: 91 of 180 draws = 50.6 % against 1 − p = 50 %.

**Delivery.** 7 / 46 / 52 readings over 30 rounds = **0.23 / 1.53 / 1.73 a round** for ACWE 1 / 2 / 3.
COLLISION records: 53 / 54 / 17. Per-tag acknowledgements at ACWE 1: `[0, 1, 2, 0, 2, 2]` — two tags
starve; at ACWE 2 the thinnest tag gets 4, at ACWE 3 it gets 6. The 1756 µs of unreachable slots at
ACWE 1 is 41.9 % of every round.

**Retry / fresh draw.** All 180 draws transmit at ACWE 2 and each lands in the slot its ABOC armed; every
tag draws all four ABOC values over the 30 rounds; no `AMP_RESULT` has `sent === false`.

**Ack-keyed slots.** Stated as a rule, with no number: the Ack carries no slot index (SFD MM-46,
PDT 39.4), so a tag that misses one transmits a slot late and is ignored. The scenario never produces it
(pinned: zero `sent === false` results), so it is described, not quantified — as the brief allows.

**Two-phase variant.** 30 random phases (272 µs slots), 26 scheduled phases (528 µs slots); 4 rounds hear
nobody. First scheduled trigger at 3176 µs lists `['tag-2','tag-1','tag-4']` — exactly the tags the random
phase acked, in order — 19 octets, 810 µs. Every scheduled trigger's list equals the preceding random
phase's acked tags. First round: 3166 + 3454 = **6620 µs** for the same three readings the inline round
delivered in 4190 µs (+2430 µs); CTS Duration 7512 µs (sized for four tags heard). Over 30 rounds both
modes deliver **46 readings**; PPDU air 154 730 µs inline vs 167 130 µs two-phase = **8.0 % more**.

**Seventh tag (try this).** 31 readings = 1.03 a round (from 1.53); collided share 59.2 % (from 45.0 %),
model 55.5 %; still zero capture.

## Suites run

- `npx vitest run tests/course/amp-slots.test.ts` → **29/29 pass**.
- `UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts` once; `git diff` shows **4 added
  lines, 0 removed**.
- `npx vitest run tests/course tests/engine/lesson-hashes.test.ts` → **307 pass, 1 fail**. The single
  failure is `tests/course/amp-intro.test.ts > the computed study time … 15–25 minute target` (expected
  30 ≤ 25), which belongs to a **concurrent task's uncommitted work** on `src/course/amp/amp-intro.ts` and
  `tests/course/amp-intro.test.ts` (both show as modified in the working tree and are not mine). Nothing
  in this task touches lesson 1's word count.
- `npx tsc -b` → clean (exit 0).

## Files changed (committed)

- `src/course/amp/amp-slots.ts` (new)
- `tests/course/amp-slots.test.ts` (new)
- `src/course/lessons.ts` (import + `AUTHORED` entry)
- `tests/fixtures/lesson-hashes.json` (4 new keys)

Scratch files `tests/course/_probe.test.ts` and `tests/course/_wc.test.ts` were deleted.
`tests/course/zz2-words.test.ts` is untracked and belongs to the concurrent task — left untouched.

## Self-review

- **Every number in both languages has an assertion.** Walked the EN and ZH prose sentence by sentence;
  the EN and ZH carry the same figures. The only two numbers not asserted inside this file are
  document identifiers/dates (D0.5, D1.0, 11-26/1889r4 …), which are citations, and the 5 dB capture
  margin, discussed below.
- **Study time** 25 min (2000 EN words + 3 × 2 + 2 × 4), pinned at both ends.
- **Jumps:** the three base-run jumps are asserted against the base run; the sit-out and scheduled-trigger
  jumps are labelled with their variant and asserted against that variant's run.
- **Quiz** answers follow directly from pinned prose (unreachable slots at ACW 1; no capture at equal
  power; why the AMP model needs no fixed point).
- **Test output pristine:** no console output, no skipped tests, no soft assertions.

## Concerns

1. **The 5 dB capture margin is cross-pinned, not locally pinned.** `CAPTURE_MARGIN_DB` in
   `src/engine/channel.ts` is module-private. I briefly exported it, then reverted that edit on the
   coordinator's instruction to leave `channel.ts` untouched. The lesson test instead asserts the
   behaviour (RSSI spread < 0.01 dB, and zero `RX_FAIL` with reason `capture` in every variant) and the
   test comment points at `tests/engine/amp-collision.test.ts`, which already pins "a 5 dB stronger one is
   captured". If a reviewer prefers a local pin, exporting that constant is a one-word change.
2. **The brief's model formula needed a reachability caveat.** Taken literally over *all* N slots it is
   badly wrong at ACWE 1 (model collision 89.1 % vs 44.2 % measured over four slots), because slots
   3 and 4 can never be drawn. Restricting the fractions to the first `min(N, ACW+1)` slots makes all
   nine cells agree within 0.05, and the structurally dead slots became one of the lesson's best points.
   The prose states the restriction explicitly in the formula note.
3. **The 0.05 tolerance is met with 0.001 to spare** (worst cell 0.049). That is deliberate — the brief
   asked for the tolerance actually met — but it means an engine RNG change will fail that test rather
   than degrade quietly. That is the intended behaviour for a claim test; noting it so it is not a
   surprise.
4. **Word budget is tight:** 2000 words against the 2025-word ceiling for a 25-minute estimate. Adding
   ~25 English words to this lesson will push `lessonMinutes` to 30 and fail its own test.
5. **Pre-existing unrelated failure** in `tests/course/amp-intro.test.ts` from a concurrent task's
   uncommitted edits (see Suites run). It was already failing before this commit and is not mine to fix.

---

# Fix report — review round 1

Commit: `f93c8e9 fix(course): amp-slots — verbatim claim quotes, capture pins in every variant, citations`
(2 files changed, 155 insertions, 85 deletions: `src/course/amp/amp-slots.ts`, `tests/course/amp-slots.test.ts`).
The hash fixture is untouched — the scenarios did not change, only prose and assertions.

## Item by item

**1. Test comments must quote the shipped sentence verbatim.** Rewrote every claim comment in
`tests/course/amp-slots.test.ts` against the shipped English prose, and added a line to the file header
saying that is the rule. The ones the review named:

- `:147` "the scheduled trigger is 19 octets and 810 µs, six octets longer than the 13-octet, 618 µs
  broadcast one" → the real two-phase sentence, plus the real round formula sentence for 618 / 330 / 50 / 10.
- `:139` → "Its random phase asks only for identity: the response is 7 octets instead of 15, the slot
  272 µs instead of 528 µs."
- `:195` "With ACW 3 and four slots no draw is ever wasted…" → "The base scenario uses ACWE 2 with N = 4,
  so every draw reaches a slot." + "Here that never happens: all 180 responses go out in the slot their
  draw armed."
- `:246` "Slot 1 carries Tag 2 alone…" → the four rows of the "The first round, slot by slot" table,
  transcribed cell for cell.
- `:114` → the full "The geometry is deliberate: … with under a hundredth of a decibel between them."
- `:165` → "All six tags decode every trigger: six draws a round, 180 in the thirty measured here."
- `:210` → the observe item "Its ABOC changes with no memory of what just happened, and over thirty rounds
  it draws all four values — no window grows after a collision."
- `:404` → the same two-phase identity sentence as `:139`.
- `:416` → the full scheduled-trigger sentence.

Also brought to verbatim: the model-table comments (`:302`, `:313` now transcribe the printed cells), the
round/`20.95 %` comment, the collision, Ack, sit-out, starvation, seventh-tag, CTS, air-cost, log-line and
trigger-body comments. Where a claim lives in a table or a formula block, the comment names the block and
quotes its cells or its line.

**2. Capture pinned in every run.** New test `no run of this lesson ever captures one signal out of a
collided slot`: `RX_FAIL` with reason `capture` is 0 in the base run **and** ACWE 1, ACWE 3 and two-phase,
and each of the four is also asserted to contain at least one `COLLISION` so the zero is not vacuous. The
seven-tag try-this scenario keeps its own capture pin.

**3. `:180` "a draw of ACW ≥ N".** Gone: the comment now quotes the lesson, which says "If the draw is too
big for the slots on offer it sits the round out (11-26/1889r4 §39.4)", together with the formula line
"slot = ABOC + 1 if ABOC < N, otherwise sit out".

**4. SFD document number.** First (and only) mention now reads "(SFD 11-24/1613r20 MM-46, PDT 39.4)" in
both languages.

**5. Model choices named.** The two-phase sentence ends "…because each listed tag costs a 2-octet ID (that
width and the 6-octet trigger body are model choices, not draft values)", in EN and ZH. Pinned:
`AMP_STA_ID_BYTES === 2`, `AMP_TRIGGER_BODY_BYTES === 6`.

**6. Largest gap consistent with the table.** Prose now reads "the largest gap is 4.87 points — 4.8 between
the rounded cells — on success at ACWE 3" (ZH likewise). The test pins `(worst * 100).toFixed(2) === '4.87'`,
asserts the worst cell is `ACWE 3 success` by name, and separately pins `(43.3 − 38.5).toFixed(1) === '4.8'`
against the two values the table prints.

**7. "46 readings" pinned from delivery.** New helper `readingsDelivered()` counts `RX_OK` at the AP of an
`ampResp` whose `frame.amp.reading` is true — readings the AP actually decoded, not slots allocated. Both
modes measure 46; the first round of each measures 3. The old allocated-slot sum is gone.

**8. ZH-only numbers.** Both facts moved into the English too: "The trigger's 6-octet body: …" in the
"Where to read it" list (pinned, with the decoded field's `bytes` also checked against
`AMP_TRIGGER_BODY_BYTES`), and "six octets longer than the broadcast one" in the two-phase paragraph
(pinned as `ampTriggerBytes(3) − ampTriggerBytes(0) === 6`).

**9. Word-budget warning.** Added to the lesson file's header comment: the English prose sits within ~25
words of the 2025-word ceiling at which `lessonMinutes` rounds up to 30.

**10. Tautology removed.** `expect(ROUNDS - 26).toBe(4)` is replaced by a measurement: the random phases
whose four Acks all name the router are counted (4 of 30), and each of those is asserted to be followed by
no scheduled round.

To pay for items 4–6 and 8 within the word budget, ~40 English words were trimmed from the intro, the
"Choosing ACW" and two-phase paragraphs, one observe item, one try-this item and two quiz explanations;
the two ZH sentences whose English counterparts were cut were cut to match. **1995 English words → 25 min**
(was 2000).

## Commands and output

```
$ npx vitest run tests/course/amp-slots.test.ts
 ✓ tests/course/amp-slots.test.ts (31 tests) 124ms
 Test Files  1 passed (1)      Tests  31 passed (31)

$ npx vitest run tests/course tests/engine/lesson-hashes.test.ts
 Test Files  16 passed (16)    Tests  310 passed (310)

$ git diff --stat tests/fixtures/lesson-hashes.json
(empty — fixture unchanged)

$ npx tsc -b
tests/course/zzprobe.test.ts(26,11): error TS2367: …'"SNAPSHOT"' have no overlap.
tsc exit=1
```

The single `tsc` error is in `tests/course/zzprobe.test.ts`, an **untracked probe file belonging to the
concurrent `amp-coexist` agent** (which also has `src/engine/mac.ts` modified in the working tree). No
error is reported in `src/course/amp/amp-slots.ts` or `tests/course/amp-slots.test.ts`. Staged by path;
nothing of that agent's work was touched.

Test count rose 29 → 31 (the all-runs capture test and an ACWE 3 empty/collided-share test for the observe
item's two percentages, which previously rode on the model-table test).

## Remaining concern

The 5 dB capture margin is still cross-pinned rather than locally pinned (`CAPTURE_MARGIN_DB` in
`src/engine/channel.ts` is module-private; the coordinator asked that the file be left alone). The lesson
test pins the behaviour — equal RSSI within 0.01 dB in both directions, zero capture in all four runs plus
the seven-tag case — and `tests/engine/amp-collision.test.ts` pins the 5 dB itself.
