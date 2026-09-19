# Task 4 review — lesson "Listen-only positioning" (DL-TDoA, module 14)

Reviewed: `daa0b1e..c419b0d` (one commit, `c419b0d`), against `task-4-brief.md`,
`task-4-report.md`, the controller's binding constraints and rulings, Slice 5 (DL-TDoA) of
`docs/superpowers/specs/2026-09-19-uwb-slices-design.md`, the Follow-up rulings recorded in
`progress.md` for Tasks 2 and 3, and the house style of `src/course/uwb/uwb-contention.ts` +
`tests/course/uwb-contention.test.ts`.

Every reviewed file matches HEAD: `git diff HEAD -- src/course/uwb/uwb-dl-tdoa.ts
tests/course/uwb-dl-tdoa.test.ts tests/fixtures/lesson-hashes.json tests/course/uwb-coexist.test.ts
tests/course/uwb-contention.test.ts` is empty. The only working-tree changes are the concurrent
UL agent's (`src/course/uwb/uwb-ul-tdoa.ts`, `tests/course/tmp-ul-probe.test.ts`, and two added
lines each in `lessonKit.ts`/`lessons.ts`); they were not reviewed and no finding below concerns
them.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

One Medium (finding 1: a body sentence attributes the whole scene's 11–36 cm fix-error envelope to
one badge's seven fixes, which also inverts the paragraph's own middle-of-room vs baseline
contrast — 36 cm quoted for the middle against 34 cm for the baseline). Everything else is Low.

## Commands

- `npx vitest run tests/course/uwb-dl-tdoa.test.ts tests/course/lessons.test.ts
  tests/engine/lesson-hashes.test.ts` → **3 files, 77 tests, all passing**, exit 0
  (34 in the new lesson test, 42 in `lessons.test.ts`, 1 hash test).
- `npx tsc -b` → clean, exit 0, no output (the UL lesson's untracked files included; nothing to
  ignore).
- Independent probes (scratchpad, `vite-node`, nothing written into the repo): the uncorrected
  `solveTdoa` call, the Gauss–Newton det trajectory, `solvePosition`'s GDOP at the square centre,
  a 0.1 m GDOP grid over the room, the per-badge fix-error spans, `lessonWords`, the first eight
  records of the base run, and one TWR round's frame list. Results are quoted in the findings and
  the table.

## Binding constraints — checked one by one

1. **Scene.** `DL_ANCHORS` = lesson 5's four corners (0.5, 0.5), (9.5, 0.5), (0.5, 7.5),
   (9.5, 7.5) at z 2.2 in `oneRoom()`'s 10 × 8 m lab; three listeners at z 1.0.
   Pinned against `uwbPositionScenario('base')` itself, not against transcribed coordinates.
2. **`badge-*` ids.** Accepted by the controller; verified that the draw makes the ruling true —
   `drawnPpm` replays `new Rng(sc.seed).fork(hashStr('<id>#uwb')).next()`, which is exactly
   `simulation.ts:85` + `network.ts:99` + `UwbClock.fromRng`, and the same three offsets are
   re-measured through the physics in the correction-off run (test "correction off: 22.02, 44.04
   and 65.81 m…", second block). Zero `UWB_POSITION` in the raw scene is pinned.
3. **`mode: 'dl-tdoa'`, defaults, NLOS on, no pinned ppm.** Pinned field by field against
   `DEFAULT_UWB_SESSION` for all three scenes, including `n.uwb?.ppm === undefined` for every node.
4. **Variants** "Clock correction off" / 关闭时钟修正 and "Ten tags" / 十个标签, in that order,
   pinned by `toEqual` on the labels; each pinned to change exactly one thing (a JSON strip-compare
   for `raw`, a node-slice compare for `ten`).
5. **`id 'uwb-dl-tdoa'`, module 14, 4 observe + 2 tryThis + 3 quiz, ≤ 25 min.** All pinned;
   measured `lessonWords` = 1700, `lessonMinutes` = 25, header's "24 words left" is exact.
6. **Fixture additions only.** Exactly three keys added (`uwb-dl-tdoa`, `#0`, `#1`); no other line
   in `lesson-hashes.json` moved.
7. **Correction-off quoted in metres, no fix.** Body, table row 2 ("no fix at all") and try-this 1
   ("63 differences, 0 fixes") all pinned; `of(raw, 'UWB_POSITION')` is `[]`.
8. **Errors/ellipses compared with TWR, never raw GDOP across solvers.** The comparison paragraph
   opens with "Do not read the two GDOP columns against each other", and the three-scene table has
   no GDOP column. Lesson 5's numbers come from a fresh run of `uwbPositionScenario('base')` in the
   test, never transcribed. I confirmed the collision the ruling was protecting against is real:
   the same room gives TWR GDOP 1.05 and DL-TDoA 0.84–1.00.
9. **Ellipse called first-order.** "It is first-order, though: reply times of 2, 4 and 6 ms do not
   share one sigma, so read it as how far the fix may be off rather than as a 68 % interval" —
   matches `dlDiffSigmaM` + the RMS in `device.ts:solveTdoaFix` and the wording of
   `i18n.ts:ellipseHintTdoa`.
10. **Rate ratio and Δ as implemented.** The formula block is line-for-line `device.ts:436–451`:
    `r = (rx_F − rx_P)_badge ÷ (tx_F − tx_P)_anchor-1` uses anchor 1's **own** TX counters (the
    Task-2 follow-up ruling), and `Δ_i = (rx_i − rx_P)/r − (tof + T_reply,i·(1 − coff_i))`.
    That both crystals cancel is pinned empirically twice: anchor 1 pinned at +20 ppm (a 39 ppm
    swing) reproduces 0.19/0.44/0.51 m and all 21 fixes; badges pinned on top give 0.24/0.46/0.54 m.
11. **§10.29.1.2.5 second case cited; FiRa content / corrections / numbers marked as the model's.**
    Source block pinned phrase by phrase, in the house shape (`uwb-dstwr.ts:49`, `uwb-contention`).
    §16.4.9 for ±20 ppm is the house citation used by three sibling lessons.
12. **ZH parity.** Every learner-visible string has both languages, none identical; pinned by the
    walker. Three places where the ZH says more than the EN — see finding 5 (Low).
13. **Pure predicates, no `any`, no `as unknown as`.** `firstUwbTdoa`, `firstUwbBlink`,
    `firstUwbDlRound` are one-line pure predicates in the existing style. `grep` finds no `any`,
    no `as unknown as`, no `@ts-`; the only casts are `as Record<string, unknown>` inside the two
    walkers, an `Extract<Block, …>` narrowing and three `as UwbDlTdoaVariant[]` literal lists.
14. **Seam edits limited to the seam.** `uwb-contention.test.ts`: one assertion pair collapsed into
    `ids[ids.indexOf('uwb-contention') - 1] === 'uwb-coexist'`. `uwb-coexist.test.ts`: the two
    tail-index assertions collapsed into `ids[ids.indexOf('uwb-coexist') - 1] === 'uwb-position'`
    and `after.slice(2)` → `after.slice(3)`. Slightly more than "one line" in the coexist file, but
    nothing outside the seam changed, and the dropped `ids[ids.length - 2] === 'uwb-coexist'` is
    now covered by the contention file's new assertion. In scope.

## Findings

### 1 · Medium — "a badge's seven fixes land 11 to 36 cm out" is the scene's envelope, not a badge's

`src/course/uwb/uwb-dl-tdoa.ts:143` (body, "Hyperbolae, and where they go soft"):

> In the middle of the room a badge's seven fixes land 11 to 36 cm out; on the
> anchor-1–anchor-2 baseline at (5, 0.5) the worst is 34 cm, …

Measured, per badge, over the base run's seven blocks:

| badge | position | min | max |
|---|---|---|---|
| badge-1 | (4, 3.5) — the mid-room one | 10.9 cm | **25.7 cm** |
| badge-2 | (7, 6) | 12.1 cm | 35.6 cm |
| badge-3 | (2, 6.5) | 12.9 cm | 29.8 cm |

No badge's seven fixes span 11 to 36 cm: 11 is badge 1's minimum and 36 is badge 2's maximum, and
badge 2 at (7, 6) is not "in the middle of the room". The test pins the right thing for the table
(`0.11–0.36 m` over all 21 fixes, correctly derived from the run) and then re-uses that same
21-fix envelope to guard a sentence that speaks about one badge's seven
(`tests/course/uwb-dl-tdoa.test.ts`, "In the middle of the room a badge's seven fixes land 11 to
36 cm out"). The claim and its pin measure different populations.

It is not only imprecise, it reverses the paragraph's own argument: the point being made is that a
badge on the anchor-1–anchor-2 baseline is measured *worse* than one in the middle, yet the middle
is quoted at up to 36 cm against the baseline's 34 cm. Badge 1's real 11–26 cm makes the
progression read 26 cm → 34 cm → 2.64 m, which is the lesson's actual claim.

Fix (one clause + one assertion): quote badge 1, e.g. "In the middle of the room badge 1's seven
fixes land 11 to 26 cm out", and pin `fixErrM(rs, 'badge-1')` rather than `fixErrM(rs)` for that
sentence. The scene-wide 11–36 cm stays correct where it already is: the table row and the later
"these between 11 and 36 cm" in the TWR comparison, both of which speak about all 21 fixes.

### 2 · Low — "then anchor-1's Poll" skips the UWB_SLOT lines the log really prints

Observe 1 (`:169`) reads "the log opens with three UWB_ROUND lines, one per badge … then anchor-1's
Poll". Verified from the run: the first three records are indeed the three `UWB_ROUND` lines at
t = 0, one per badge in id order, and the Poll is the next `TX_START` — but seven `UWB_SLOT`
records (three badges, four anchors) sit between them in the event log. `EventLog.tsx:32` filters
`MAC_STATE` only, so a learner following the instruction sees those lines. The jump test pins only
that the Poll's index is after the round's. Either say "then, after each node opens slot 0,
anchor 1's Poll" or leave it — the sibling lessons quote the log this loosely too
(`uwb-contention.ts:141`), so this is style, not error.

### 3 · Low — three true claims carry no pin (all three verified by hand here)

- "trilateration's is 1.00" (`:147`). The test pins `solveTdoa`'s √(2/3) on the synthetic square
  but nothing runs `solvePosition` on the same square. I did:
  `solvePosition(square, true ranges, 1, 0.02).gdop === 1` exactly. True, unpinned.
- "The best spot, (3.0, 4.8)" (try-this 2, `:181`). A 0.1 m grid of `solveTdoa` over the room
  (7469 points, true deltas) gives a minimum GDOP of 0.827 at (2.9, 4.8); (3.0, 4.8) is 0.827 too,
  i.e. the quoted spot is on the optimum plateau. True, unpinned as an optimum.
- Quiz 2's mechanism, "Gauss–Newton walks out to where the rows go parallel" (`:203`). The test
  pins the outcome (no `UWB_POSITION`) but not why. I re-ran the iteration with badge 2's
  uncorrected first-block deltas: the point walks (5.0, 4.0) → (−7.5, −30.5) → (105.2, 607.3) and
  det(JtJ) collapses 1.0e+1 → 6.1e−6 → 1.1e−13, below `MIN_DET`, so `gaussNewton` returns null and
  `solveTdoa` returns null. Exactly as the explanation says, and it is not the `fixFrom` branch.

A one-line assertion for each would close the last unpinned claims in the lesson; none is wrong.

### 4 · Low — "draws no rings, only the cross and the ellipse" is pinned only through the inspector

Body `:143`. The test pins `vs.nodes['badge-1'].uwb.ranges` is `{}`, which is the *data* reason
there is nothing to draw; the overlay rule itself lives in `src/uwb/scene.ts:137`
(`const rings = u.position === null || u.position.method === 'twr'`) and is not touched here.
Correct as written; Task 3's scene tests are presumably where it belongs, so no action is needed
beyond noting the claim's real owner.

### 5 · Low — three places where the ZH says more than the EN

Both languages are complete and neither is wrong, but the ZH carries content the EN does not:
the formula note (`:119/120`) — ZH adds "anchor-1 在帧里报出自己何时发出轮询帧、何时发出 Final，
胸牌手里则有这两帧的到达时刻", which is exactly the sentence the EN compresses into "the one span
both describe"; observe 4 (`:175/176`) — ZH adds the inspector's four column names
(实测、真值、误差与轮数), which do match `uwbTdoaRows` but appear in no EN sentence; and the
hyperbolae paragraph (`:143/144`) — ZH adds "根本没有距离可画". The parity test only checks that both
strings exist and differ. If anything, the EN formula note is the one to lift: the ZH version is the
clearer of the two.

### 6 · Low — the table row is "Ten badges" while the variant it names is "Ten tags"

Table 2 row 3 (`:140`) is "Ten badges" / 十个胸牌; the variant a learner has to load is
"Ten tags" / 十个标签 (the label is a binding constraint, so the variant name cannot move). Row 2
does match its variant exactly ("Clock correction off"). Renaming the row "Ten tags" would make the
table a lookup for the variant picker at no cost. The body and try-this 2 both say
'Load "Ten tags"', so the learner is never actually stranded.

### 7 · Low — the 3σ envelope is tighter than the ruling's 4σ, and the report says 12 body blocks

Two bookkeeping notes for the controller:

- The constraint list says "the corrected difference errors and 4σ envelope from the 0.2 ppm CFO
  model"; the lesson quotes **3σ** (0.36 / 0.72 / 1.08 m) and pins that all 63 differences fall
  inside it. That is a tightening, not a weakening — the measured maxima are 1.58σ, 1.83σ and
  1.42σ — and it is pinned per responder, so it holds. Flagging only because the number differs
  from the letter of the ruling.
- `task-4-report.md` says "12 body blocks (two tables, one formula)". There are **11**
  (`p, p, table, formula, p, p, p, table, p, p, p`). Everything else in the report reproduced
  exactly, including 1700 words / 25 minutes / 1724 ceiling, the per-scene table, the GDOP triple
  0.84 / 1.00 / 0.89 and the 0.02–0.37 m ten-badge span.

## Claim → pin table

Every number and every empirical sentence a learner reads. "Pin" names the test in
`tests/course/uwb-dl-tdoa.test.ts` unless stated; "derived" means the test computes the string from
the run and compares it to the shipped cell rather than to a literal.

| # | Claim (where) | Pin | OK |
|---|---|---|---|
| 1 | §10.29.1.2.5, second case; FiRa content, both corrections and every number are the model's (`:98`) | "names the clause it leans on…" — seven `toContain`s on the shipped string | ✓ |
| 2 | Four corner anchors, lesson 5's, at 2.20 m (`:102`) | "is lesson 5's four corner anchors…" — compared against `uwbPositionScenario('base')` | ✓ |
| 3 | Three badges at (4, 3.5), (7, 6), (2, 6.5) at 1.00 m, never transmit (`:102`) | same test + "gives every slot to an anchor and a badge none" (`TX_START` from `badge-*` is `[]`, base and ten) | ✓ |
| 4 | Anchor 1 at (0.5, 0.5) opens and closes the round; every difference is against its Poll (`:102`) | `DL_ANCHORS[0]`; slot order `[REF poll 0, resp 1..3, REF final 4]`; `UWB_TDOA.ref`/`device.ts:429` | ✓ |
| 5 | One round per 200 ms block; 5 slots × 2 ms; seven blocks in the window (`:102`, `:105`) | "Five slots of 2 ms, once a block" — `roundPlan`: slots 5, slotNs 2 ms, roundNs 10 ms, roundsPerBlock 1; `UWB_ROUND` count = 7 × tags in all three scenes | ✓ |
| 6 | Poll 42 B / 216.1 µs, Response 30 B / 197.6 µs, Final 34 B / 201.7 µs (`:105`) | "the table's frames are the sizes…" — from `uwbDlPollBytes/RespBytes/FinalBytes` + `uwbPpduNs`, and from the run's `frame.bytes` | ✓ |
| 7 | What each frame carries (`:105` rows) | "each frame carries what the table says…" — poll `rxCounters {}` + `schedule`, response `rxCounters [anchor-1]` + numeric `coffs`, final `rxCounters` = the three responders; `dst '*'` | ✓ |
| 8 | `r = (rx_F − rx_P)_badge ÷ (tx_F − tx_P)_anchor-1`; `Δ_i = (rx_i − rx_P)/r − (tof + T_reply,i(1 − coff_i))` (`:116`) | not asserted as text; read against `device.ts:436` and `:449–451` — identical, including that `tx_*` are anchor 1's own counters. Behaviour pinned by rows 14–15 | ✓ (by inspection) |
| 9 | 20 ppm of 6 ms is 120 ns, 36 m; §16.4.9's ±20 ppm (`:123`) | "20 ppm of 6 ms is 120 ns…" — `RESPONDERS.length × rstuNs(slotRstu) === 6 ms`, `UWB_PPM_MAX === 20`, product → "36" | ✓ |
| 10 | Anchor 1 −19.04 ppm; badges 1.96 / 17.65 / 4.08; gaps 21.00 / 36.69 / 23.12 (`:123`) | "Anchor 1 comes out at −19.04 ppm…" — replay of the engine's own draw (`seed 7` asserted), cross-checked through the physics in the raw run | ✓ |
| 11 | Correction off: badge 2 is 22.02 / 44.04 / 65.81 m too long, = 36.69 ppm × 2/4/6 ms (`:127`, try-this 1) | "correction off: 22.02, 44.04 and 65.81 m too long…" — measured means, plus a prediction from the *draw* agreeing to inside one slot-σ, plus the same check for all three badges | ✓ |
| 12 | Correction on: at most 0.19 / 0.44 / 0.51 m over 21 rounds (`:127`) | "correction on: at most 0.19, 0.44 and 0.51 m…" — maxima per responder + monotone in the slot | ✓ |
| 13 | Residual = 0.2 ppm of the reply time, 0.12 m per slot; all 63 inside 3σ = 0.36 / 0.72 / 1.08 m (`:127`) | same test — `slotSigmaM` built from `DEFAULT_UWB_SESSION.cfoNoisePpm` and `slotRstu`, every difference asserted < 3σ_k | ✓ (see finding 7) |
| 14 | Pin anchor 1 at +20 ppm — a 39 ppm swing — and 0.19 / 0.44 / 0.51 m return, 21 fixes (`:131`) | "Pin anchor 1 at +20 ppm…" — a second run with the reference pinned | ✓ |
| 15 | Badges pinned too → 0.24 / 0.46 / 0.54 m, still 21 fixes (`:131`) | "Pin the badges at +20, −20 and 0 ppm too…" | ✓ |
| 16 | Three-scene table: 63 / 0.51 m / 21 / 0.11–0.36 m · 63 / 66.29 m / 0 / no fix · 210 / 0.51 m / 70 / 0.02–0.37 m (`:134`) | "the three-scene table is what seven blocks produce" — every cell **derived** from the run and compared to the shipped string | ✓ |
| 17 | No rings, only the cross and the ellipse (`:143`) | `u.ranges === {}` in the view replay; overlay rule in `scene.ts:137` | ✓ (finding 4) |
| 18 | Mid-room badge: seven fixes 11–36 cm (`:143`) | `fixErrM(rs)` over **21** fixes, not one badge's seven | ✗ **finding 1** |
| 19 | (5, 0.5) worst 34 cm at GDOP 1.06; (9.8, 0.2) GDOP 1.49, ellipse 35.7 cm, worst 2.64 m; (3.0, 4.8) GDOP 0.83, 16–24 cm (`:143`, try-this 2) | "try-this 2's three places for badge 1" — three fresh runs with badge 1 moved, all per-badge | ✓ ("best spot" as optimum: finding 3) |
| 20 | Hyperbolic Jacobian row = difference of two unit vectors; floor √(2/3) = 0.82 at a square's centre (`:147`) | `solveTdoa` on a synthetic square → `toBeCloseTo(√(2/3), 6)`; row form at `position.ts:225` | ✓ |
| 21 | Trilateration's floor is 1.00 (`:147`) | none | ✓ by hand (finding 3) |
| 22 | Lesson 5: 0.5–3.3 cm, ellipse 1.7 cm; this lesson 11–36 cm, better than 10× (`:147`) | "lesson 5's two-way fixes in this room…" — a fresh `uwbPositionScenario('base')` run, `method === 'twr'` | ✓ |
| 23 | Ellipse 18.6–23.0 cm, built from √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²), only 4 cm of it timestamp noise, every fix inside 1.6 semi-axes (`:147`) | "18.6 to 23.0 cm of semi-major axis…" — measured span, ratio < 1.6, ts term → "4", RMS bracketed against the span; matches `device.ts:dlDiffSigmaM` + the RMS at `:474` | ✓ |
| 24 | Ten tags: 70 fixes instead of 21; anchors send 35 frames, 7.074 935 ms, 0.505 % (`:151`) | "the anchors transmit exactly what they did before" — frame-for-frame array equality between the 3- and 10-badge runs, air summed from `frame.txTimeNs`, duty from `rstuNs(blockRstu)`; "Seven blocks now produce 70 fixes" — 7 per badge, and the three base badges get identical fixes | ✓ |
| 25 | TWR needs a round per tag: ten 20 ms rounds in a 200 ms block, 100 frames vs five (`:151`, quiz 3) | "a 200 ms block holds ten 20 ms rounds…" — `roundPlan` with `mode: 'twr'`: 10 slots, 20 ms, 10 rounds/block. Independently checked that a TWR round really emits 10 frames (poll + 4 resp + final + 4 reports) | ✓ |
| 26 | Observe 1: three `UWB_ROUND` lines at t = 0, the quoted `fmtRecord` line, 35 TX_START in 1.3 s, none from a badge | "observe 1 and 3 quote the lines fmtRecord prints" | ✓ (ordering caveat: finding 2) |
| 27 | Observe 2: five RX RMARKERs at 216.106 µs / 2.197 650 / 4.197 647 / 6.197 652 / 8.201 747 ms, and nothing else | "five RX RMARKER lines…" — exact `t` array, `dir`, `peer`, plus one full `fmtRecord` line | ✓ |
| 28 | Observe 3: the three differences at 10 ms (5.66/5.39, 1.12/2.29, 6.85/7.15) and the position line | "observe 1 and 3 quote the lines fmtRecord prints" — `fmtRecord` compared verbatim | ✓ |
| 29 | Observe 4: inspector says "time differences", errors −0.51 / +0.47 / −1.53 ns, error 19.6 cm, GDOP 0.85, ellipse 19.8 × 10.3 cm, DL-TDoA | "the inspector shows time differences, not distances" — `initViewState`/`applyRecord` replay through `uwbTdoaRows`/`uwbFixRow`, both languages' method string | ✓ (ZH extra: finding 5) |
| 30 | Try-this 1: badge 2 block 0 reads 65.60 / 139.29 / 201.83 ns against −8.14 / −6.07 / −18.17; 63 differences, 0 fixes; 65.81 m between anchors 11.40 m apart | "correction off: 63 differences, 0 fixes" — per-block values, `UWB_POSITION` empty, `anchorGapM` 11.40 / 9.00 / 7.00 | ✓ |
| 31 | Quiz 2: a difference of ranges cannot exceed the baseline, so the fit never converges | outcome pinned; mechanism verified by hand (finding 3) | ✓ |
| 32 | Quiz 3 / privacy: every frame is broadcast and none names a tag | `dst === '*'` on poll and response, `schedule` lists anchors only, zero badge `TX_START` | ✓ |
| 33 | Shape: 1700 words, 25 minutes, ceiling 1724, 6 jumps in record order, module 14, second in module 14 after `uwb-contention` | "the computed study time follows the formula…", "it offers six jumps…", "every jump target occurs in the base run, in the order the list gives them" (instants 0 / 0 / 216 106 ns / 8 ms / 10 ms / 10 ms), "it is the second lesson of module 14" | ✓ |
| 34 | Determinism | "replays bit-for-bit, in every scene" — full record equality on a second run of all three scenes | ✓ |

## What is good

The test is the strongest of the four in this slice. Three things in particular: the three-scene
table is *derived* from the run and compared to the shipped cell, so it cannot rot silently; the
crystal draw is checked twice, once by replaying the engine's own RNG path and once through the
physics of the uncorrected run, so both would have to fail together to let a wrong ppm through;
and both cancellations — the badge's crystal and the reference anchor's — are pinned by re-running
the scene with the crystals pinned rather than argued from the formula. The decision to rename the
tags `badge-*` after discovering that `uwb-3` drew within 0.003 ppm of the reference, and to say so
in the report, is the right call: it kept the ruling's "no fix at all" true instead of teaching a
coincidence as a property of the mode.

---

## Re-review (fix round 1)

Scope: `c419b0d..28251be` (one commit, lesson + test only — `src/course/uwb/uwb-dl-tdoa.ts` 20
lines, `tests/course/uwb-dl-tdoa.test.ts` 67). Both files match HEAD (`git diff HEAD --` on them is
empty); the modified `lessonKit.ts`, `lessons.ts`, `uwb-coexist.test.ts` and `lesson-hashes.json`
in the working tree are the UL agent's and were not reviewed.

### Verdict

Spec: APPROVED
Quality: APPROVED

No open findings. Two items are parked by design and named below.

### Commands

- `npx vitest run tests/course/uwb-dl-tdoa.test.ts` → **34 tests, all passing**, exit 0.
- Re-measured directly: `lessonWords` = **1718**, `lessonMinutes` = **25** (ceiling 1724, so 6
  words of headroom — exactly what the header comment now claims). 11 body blocks, unchanged.

### Item by item

1. **Medium — fixed, and fixed the right way.** EN: "In the middle of the room badge 1's seven
   fixes land 11 to 26 cm out"; ZH: "在房间中部，badge-1 的七次定位偏离真值 11 到 26 cm". Measured
   badge 1 over seven blocks: 10.9–25.7 cm → "11 to 26" ✓. The pin is now
   `fixErrM(rs, 'badge-1')`, i.e. the population the sentence names. Two assertions I did not ask
   for and that make it better: badge 1 is *shown* to be the middle one (nearest the anchors'
   centroid, computed from `TAG_SPOTS`, not asserted by name), and `max(badge 1) < 0.34`, which
   pins the paragraph's argument itself — 26 cm in the middle < 34 cm on the baseline < 2.64 m past
   its end. The scene-wide 11–36 cm survives untouched in the table row (still derived from the
   run) and in "these between 11 and 36 cm" in the two-way comparison, where it is correct.
2. **Low — observe 1's ordering: fixed, and my count was wrong.** The implementer is right and the
   review's "seven `UWB_SLOT` records (three badges, four anchors)" was wrong: **three**.
   Verified at the engine — `network.ts:180` puts `[...tags, ...anchors]` in the DL crowd so an
   anchor does get `onSlot`, but `device.ts:275–276` emits `UWB_SLOT` only when
   `this.cfg.role === 'tag'`, so no anchor emits one in any mode. Confirmed over the whole run: the
   only `UWB_SLOT` emitters are `badge-1/2/3`. What the event log really shows before the Poll,
   with `MAC_STATE` filtered as `EventLog.tsx:32` filters it:
   three `UWB_ROUND`, three `UWB_SLOT`, `anchor-1 TX RMARKER → * poll`, then the Poll's `TX_START`.
   The new text ("— then each badge's slot-0 line, and anchor-1's Poll") is accurate: the one line
   it folds into "anchor-1's Poll" is that Poll's own transmit timestamp. Pinned as an exact type
   array plus "no anchor emits `UWB_SLOT`".
3. **Low — three unpinned claims: all three now pinned.** `solvePosition` on the same synthetic
   square → GDOP `toBeCloseTo(1, 9)`, closing "where trilateration's is 1.00" (matches my own
   probe, exactly 1). "The best spot" is now a *measurement*: a 0.1 m grid of noise-free
   `trueGdopAt` over the room, and (3.0, 4.8) asserted within 0.001 of its floor — the same grid I
   ran independently (floor 0.827 at (2.9, 4.8), quoted spot 0.827). Quiz 2's mechanism is pinned
   at the solver: `solveTdoa` handed badge 2's own uncorrected first block returns `null` while the
   corrected block of the same scene returns a fix, so "the fit never converges" is now evidence
   rather than inference. That matches the det trajectory I traced (1.0e+1 → 6.1e−6 → 1.1e−13).
4. **Low — "no rings": parked, correctly.** The claim keeps the data-reason pin (`u.ranges === {}`)
   and gains a comment naming `src/uwb/scene.ts` as the rule's owner and Task 3 as its pin. That is
   the right call: duplicating a scene assertion in a course test would pin it in the wrong file.
5. **Low — ZH/EN drift: all three closed.** The EN formula note now carries the Chinese sentence's
   content ("anchor 1 reports when it sent the Poll and the Final, the badge holds its own two
   arrivals, and the flight from anchor 1 sits in both and cancels") — the lift I recommended,
   rather than a trim. The ZH inspector column list and "根本没有距离可画" are gone, so observe 4 and
   the hyperbolae paragraph now say the same thing in both languages. The cost was observe 3's
   closing "The line names its method.", dropped in **both** languages (parity kept) and harmless:
   the quoted log line it referred to already ends "(DL-TDoA)". Every changed string still has both
   languages and the parity walker still passes.
6. **Low — table row: fixed.** Row 3 is "Ten tags" / 十个标签, and both variant rows are now pinned
   against `uwbDlTdoa.variants![i].label.en`, so the table cannot drift from the variant picker
   again.
7. **Low — bookkeeping.** The report's "12 body blocks" is corrected to 11 in the report's own fix
   section. The 3σ-vs-4σ item is deliberately left as it is; it remains the controller's to rule
   on, and it is a tightening that is pinned per responder (measured maxima 1.58σ / 1.83σ / 1.42σ).

### Claim → pin table — deltas only

| # | Claim | Change |
|---|---|---|
| 18 | "In the middle of the room badge 1's seven fixes land 11 to 26 cm out" (`:143`) | ✗ → **✓** — pinned on `fixErrM(rs, 'badge-1')` (10.9–25.7 cm), plus "badge 1 is the centroid-nearest listener" and `max < 0.34` |
| 19 | "The best spot, (3.0, 4.8)" | ✓ (by hand) → **✓ pinned** — within 0.001 of the GDOP floor on a 0.1 m grid of the room |
| 21 | "trilateration's is 1.00" | ✓ (by hand) → **✓ pinned** — `solvePosition` on the same square, `toBeCloseTo(1, 9)` |
| 26 | Observe 1's opening lines | ✓ with caveat → **✓** — exact non-`MAC_STATE` type array before the first `TX_START`, and no anchor emits `UWB_SLOT` |
| 31 | Quiz 2's mechanism | ✓ (by hand) → **✓ pinned** — same deltas through `solveTdoa` return `null`; the corrected block does not |
| 16 | Three-scene table | ✓ → ✓, row 3 renamed "Ten tags" and both variant rows pinned to their labels |
| 33 | Shape | ✓ → ✓ at 1718 words / 25 minutes (ceiling 1724) |

Rows 1–15, 17, 20, 22–25, 27–30, 32 and 34 are untouched by this commit and remain as reviewed.
