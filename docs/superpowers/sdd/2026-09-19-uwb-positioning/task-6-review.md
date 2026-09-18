# Task 6 review — lesson 5 "From four ranges to a point" (`uwb-position`)

Reviewed: commit `e68526a` (review package `task-6-review.diff`, `69ebb08..e68526a`), against
`task-6-brief.md`, `task-6-report.md`, the controller's ellipse ruling (`ELLIPSE_DRAW_SCALE` = 10 →
"ten"), the house style of `src/course/uwb/uwb-blocks.ts` / `tests/course/uwb-blocks.test.ts` and the
bar set by `task-5-review.md`. Ground truth read directly: `src/uwb/position.ts`, `src/uwb/phy.ts`,
`src/uwb/channel.ts`, `src/uwb/ranging.ts`, `src/uwb/scene.ts`, `src/uwb/view.ts`,
`src/uwb/ui/rows.ts`, `src/engine/propagation.ts`, `src/ui/i18n.ts`.
Read only; no file in the worktree was edited, nothing was committed, no subagent was dispatched.

## Commands run

- `npx vitest run tests/course/uwb-position.test.ts tests/engine/lesson-hashes.test.ts`
  → **2 files / 29 tests passed** (uwb-position 28, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, exit 0, no diagnostics.
- `git show --stat e68526a` → 4 files, 777 insertions, 0 deletions; `tests/fixtures/lesson-hashes.json`
  gains exactly the three `uwb-position*` lines and changes nothing.
- Independent measurement (esbuild bundle of `lessonWords`/`lessonMinutes`, run outside the repo):
  **1715 words → 25 minutes**, exactly what the file header and the report claim, nine words under
  the pinned 1724 ceiling.
- Independent re-derivation of the geometry, in plain JS from `position.ts`'s own formulas (JᵀJ from
  horizontal unit rows, GDOP = √trace(JᵀJ)⁻¹, Σ = σ_r²(JᵀJ)⁻¹), on a 0.05 m grid over the **whole**
  10 × 8 m room including the walls, plus a row-length/bearing decomposition at the tag, at the room
  centre and at (9.5, 0.5). Numbers quoted in the findings come from that sweep.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

Every line of the brief is met — scene, variants, shape, body list, pin list, fixture rule, id and
module — and the lesson is, number for number, the most densely pinned of the five. The two blocking
findings are not numbers: they are two *causal* sentences about the geometry that the engine's own
maths contradicts, both unpinned, and both of which a learner following the lesson's own try-this
would disprove in the editor. That is the project's recurring bug class (stated-vs-simulated drift),
so it lands on the quality axis, the same split Task 5 used.

## What was verified as correct

**Scene — the brief, coordinate for coordinate.** `uwbPositionScenario(variant)`
(`src/course/uwb/uwb-position.ts:43-57`) is `uwbSc(oneRoom(), …, { method: 'ds', nlos: true })` with
`anchor-1…4` at (0.5, 0.5), (9.5, 0.5), (0.5, 7.5), (9.5, 7.5) all at z 2.2 and `uwb-1` "Phone" at
(4, 3.5, 1.0). The test pins the room, the node ids and roles in order, every coordinate, `ppm`
undefined on every node (drawn, not set), the session as `{ ...DEFAULT_UWB_SESSION, method: 'ds',
nlos: true }` with `tsNoisePs` 100, no Wi-Fi profiles, no servers, four shell walls, and equality with
`uwbPositionScenario('base')` (`test:200-218`).

**Variant A.** `brick(2, 1.5, 2, 3)` appended to the four shell walls; the test pins the wall object,
its 1.5 m length, and — the brief's explicit instruction — `wallsCrossed` over all four tag → anchor
rays: `['anchor-1:1', 'anchor-2:0', 'anchor-3:0', 'anchor-4:0']` with anchor-1's materials `['brick']`
(`test:220-235`), plus a `JSON.stringify` proof that nothing but the wall list differs. I re-derived
the four crossings by hand and confirm them; I also confirm the report's disclosed caveat — the stub
does sit on the anchor-1 ↔ anchor-4 line (at x = 2 that chord is at y = 1.667, inside [1.5, 3]) —
and that it is inert: anchors never range each other, the run has zero `UWB_TIMEOUT` and the other
three ranges stay inside 1.4 cm. The lesson's wording is scoped correctly ("of the four
tag-to-anchor rays it obstructs only that one"), so the claim is defensible as written.

**Variant B.** Deletes only the (9.5, 7.5) anchor; pinned by node list and by a `JSON.stringify`
reconstruction (`test:238-247`).

**Shape and registration.** `id 'uwb-position'`, `module 12`, already in `COURSE_ORDER`
(`src/course/curriculum.ts:84`); 5 jumps / 4 observe / 2 tryThis / 3 quiz (`test:129-135`);
`lessonMinutes` pinned to the formula, to [15, 25] and to the 1724-word ceiling with the 1725 → 30
tipping point spelled out (`test:114-127`). `src/course/lessons.ts` gains exactly two lines.
`src/course/lessonKit.ts` is untouched. The one local jump predicate, `secondBlockFix`
(`uwb-position.ts:27`), is a one-line pure `TLRecord` predicate with no closure over run state; the
other four are the shared `firstUwb*` predicates. All five are found in order, with the 0 ms Poll,
the shared fix/round-end instant and the 200 ms gap pinned (`test:137-151`).

**The maths is right.** I checked every statement against `src/uwb/position.ts`:
residual `r_i = ‖p − a_i‖ − d_i` (`position.ts:73`), Jacobian rows as the horizontal components of
the 3-D unit vector (`:71-72`), normal equations `(JᵀJ)δ = −Jᵀr` (`:122-123`), centroid start
(`:106-113`), 1 mm step tolerance and 20 iterations (`:35-36`), `< 3` ranges → null (`:104`),
near-singular JᵀJ → null (`:39, :120, :137`), `gdop = √(invXX + invYY)` = √trace((JᵀJ)⁻¹) (`:144`),
`Σ = σ_r²(JᵀJ)⁻¹` with the eigen-decomposition giving the 1-σ semi-axes and `thetaRad` from +x
(`:146-159`), `residualM` = RMS of the residuals (`:134`). The (N/2)·I ⇒ trace 4/N ⇒ GDOP = 2/√N
derivation in the formula note (`:83`) is correct for evenly spread bearings with full unit rows, and
the z-offset caveat the controller asked for is present and pinned (rows 0.968–0.985, `test:297-303`).
`rangeSigmaM` = c·σ_ts/√2 (`position.ts:30-33`) matches the printed formula and the 2.12 cm.

**The FoM claims.** `fomFor` (`src/uwb/ranging.ts:28-30`) and `UwbChannel.obstructed`
(`src/uwb/channel.ts:139-147`) confirm the lesson's two-part claim exactly: the byte is geometry
(`wallsCrossed(...).length > 0`, independent of the session switch) while `nlosNs` returns 0 when
`cfg.nlos` is false (`channel.ts:132-137`). The engine's own comment makes the same point the lesson
makes. §10.29.1.7 and Tables 10-146/147/148 are the clauses `phy.ts:170-172, 182` itself cites.

**The scene description.** Rings are drawn at `r.distM` in amber `0xfbbf24`, the fix is a cross, the
ellipse is scaled by `ELLIPSE_DRAW_SCALE` = 10, and all three fade to nothing one block after their
round (`src/uwb/scene.ts:5-14, 38, 141-170`). Observe 2 is accurate to that file.

**Inspector strings.** `uwbFixRow`/`uwbRangeRows` (`src/uwb/ui/rows.ts`) produce exactly the pinned
cells, and `STRINGS.en.uwb.ellipse` is pinned as the label (`test:394`). The hand-built views in
`inspectorAt` map field-for-field onto what `applyUwbRecord` (`src/uwb/view.ts:73-97`) stores, and the
only field that differs (`n`) is not rendered in any pinned row — see minor 10.

**Types and hygiene.** No `any`, no `as unknown as`, no `@ts-` directive in either file; the only
casts are `x as Record<string, unknown>` inside the two `unknown`-typed walkers and `is`-predicate
filters for `Block` narrowing, the same shape lessons 3 and 4 use.

**Fixture.** Three added keys, nothing changed, nothing removed. The equal hash for `uwb-position`
and `uwb-position#0` is correct for the reason the report gives: `updateHash` digests
`${t}:${seq}:${type}`, and the brick stub changes values, not the schedule.

## Claim → pin table

Line numbers are `src/course/uwb/uwb-position.ts` (EN string; the ZH twin is the next line) and
`tests/course/uwb-position.test.ts`.

| # | Claim | Where | Pin |
| --- | --- | --- | --- |
| 1 | §10.29.1.7 + Tables 10-146/147/148 define the FoM byte; the solver, GDOP and ellipse are model | :65 | test:184-191; `phy.ts:170-172,182` |
| 2 | Excess delay 2.0 / 0.5 / 0.2 ns for brick / drywall / glass | :65 | test:190-191 vs `UWB_NLOS_NS` |
| 3 | Centroid start, 1 mm or 20 iterations, micrometre convergence, no fix under three ranges or in a line | :76 | test:256-270 |
| 4 | GDOP = √trace((JᵀJ)⁻¹) = 1.05 | :80 | test:275-288 (exact 1.0488; every block `toFixed(2)` = 1.05, \|Δ\| < 0.002) |
| 5 | Σ = σ_r²(JᵀJ)⁻¹; σ_r = c·σ_ts/√2 = 2.12 cm | :80 | test:281-282, 341-347 (2σ_r ⇒ 2a, GDOP unchanged) |
| 6 | 2/√N = 1.00 at four evenly spread full unit rows | :83 | test:294 |
| 7 | Jacobian rows only 0.968–0.985 long | :87 | test:297-303 |
| 8 | Bearing gaps 64.6°, 89.4°, 95.2°, 110.8° | :87 | test:305-309 |
| 9 | GDOP inside 1.03–1.26 everywhere in the room; (1, 1) → 1.18; (0.6, 0.6) → 1.23 | :87, :150 | test:312-329 — **see minor 6** |
| 10 | Ellipse 1.7 × 1.4 cm, long axis −86.8°, drawn ×10 = 17 cm semi-axis | :91, :142 | test:332-339, 195 |
| 11 | Seven LOS fixes 0.5–3.3 cm, each value pinned, all inside 4σ_r·GDOP = 8.9 cm | :91, :140 | test:374-383 |
| 12 | Block-0 log line verbatim | :140 | test:366-371 (`fmtRecord` + `prose()`) |
| 13 | Inspector prints GDOP 1.05 and "error ellipse (1-σ) 1.7 × 1.4 cm" | :142 | test:386-394 |
| 14 | Four amber rings at the measured ranges, cross, ellipse, fading over one block | :69, :142 | test:400 + `scene.ts:5-14,141-170` (read, not pinned) |
| 15 | The stub obstructs only the tag → anchor-1 ray | :103 | test:220-235 (`wallsCrossed`) |
| 16 | 2.0 ns = 0.5996 m; block 0 5.33 vs 4.76 m; mean bias 59.4 cm within σ_r/3; every block within 4σ_r | :103 | test:408-424 |
| 17 | The other three rows within 1.4 cm | :144 | test:426-428 |
| 18 | 0x7b on that range, 0x16 on the other three, both texts, inspector row | :107, :144 | test:431-443 (all blocks) |
| 19 | FoM is geometry: NLOS cleared ⇒ base run fix-for-fix, byte still 0x7b | :107, :152 | test:446-457 |
| 20 | Fix (4.18, 3.75), 31 cm, +0.18 x / +0.25 y, away from anchor-1 every block, always < 0.5996 m | :111, :144 | test:460-486 |
| 21 | Noise-free shift 0.316 m = 53 % of the bias, bearing 54°, residual 21 cm vs a micrometre | :111, :164 | test:481-489 |
| 22 | GDOP and ellipse unmoved in the walled scene; 31 cm "nearly four times" the 8.9 cm envelope | :115, :174 | test:492-506 — **see minor 3** |
| 23 | Three anchors: GDOP 1.26 (+ a fifth), ellipse 2.2 × 1.5 cm, ratio 1.25 → 1.44, axis −86.8° → +61.5°, corner at 36° | :119 | test:511-526 — **see minor 11** |
| 24 | Seven three-anchor fixes within 3.1 cm, no timeouts, envelope 10.7 cm | :119 | test:529-541 |
| 25 | Three-anchor block-0 line verbatim, inspector `1.26 / 2.2 × 1.5 cm / 2.7 cm` | :146 | test:544-551 |
| 26 | On the anchor at (9.5, 0.5) the three-anchor GDOP passes 2.3; four anchors stay below 1.26 | :123, :150 | test:554-564 — mechanism **unpinned, see blocking 1** |
| 27 | The comparison table, cell by cell, against `uwbFixRow` | :98-100 | test:567-583 |
| 28 | 1715 words → 25 minutes, ≤ 1724 | header :16 | test:114-127; re-measured independently |
| 29 | Fixture adds only the three `uwb-position*` keys | — | `git show e68526a -- tests/fixtures/lesson-hashes.json` |

Two pieces of prose are deliberately not pinned and are correct as written: "one amber ring per
anchor" (chrome, checked against `scene.ts` by reading) and the solver's residual as a concept
(the UI never shows it; the lesson pins it through `solvePosition` instead, as the report says).

## Findings

### Blocking

**1. `src/course/uwb/uwb-position.ts:123` (EN) and `:124` (ZH) — "because two of the three bearings
nearly coincide" is not what happens at (9.5, 0.5); the anchor overhead simply stops contributing.**

The last body paragraph says: "drag the tag onto the anchor at (9.5, 0.5) and the three-anchor GDOP
passes 2.3, because two of the three bearings nearly coincide and JᵀJ flattens" (ZH: "因为那里三个方位
角有两个几乎重合"). Re-deriving the engine's own JᵀJ at that point, with anchors 1, 2 and 3:

| anchor | row length | bearing |
| --- | --- | --- |
| anchor-1 (0.5, 0.5) | 0.9912 | 0.0° |
| anchor-2 (9.5, 0.5) | **0.0000** | undefined (dx = dy = 0) |
| anchor-3 (0.5, 7.5) | 0.9945 | −37.9° |

The tag is standing *under* anchor-2, so its Jacobian row is the horizontal shadow of a vertical unit
vector — exactly zero (`position.ts:71-72` gives `ux = uy = 0`). Deleting anchor-2 from the solve
entirely leaves GDOP unchanged at **2.3201**; forcing all three rows to full length changes it only to
2.3035. No two bearings coincide: the two rows that survive are 37.9° apart, and at nearby points
(9.0, 1.0) the three bearings are 3.4° / 135.0° / −37.4°, further apart still. The stated cause is
false, and the real cause — a Jacobian row collapsing to nothing — is the very mechanism the lesson
taught four paragraphs earlier (`:87`, "the horizontal shadow of a slanted unit vector"), so the
correct explanation is already in the learner's hands. This is an empirical sentence about a run the
lesson tells the learner to perform (tryThis 1, `:150`), and the brief requires every such sentence to
have a pin; test:554-564 pins only the value 2.3, never the mechanism.

*What to do:* replace the clause with what the geometry does — standing under an anchor makes its
range insensitive to horizontal motion, so its row vanishes and two anchors 38° apart are left to
carry the fix — and pin it: assert the row length at (9.5, 0.5) is 0 for anchor-2 and that dropping
anchor-2 leaves the GDOP identical.

**2. `src/course/uwb/uwb-position.ts:87` (EN), `:88` (ZH), `:184` (quiz 3 explain) and the scenario
doc at `:33-36` — "the tag is at (4, 3.5), not the room's centre, so its bearings are … not four
right angles" reverses the sign of the effect; the room's centre is *worse*.**

The paragraph names two things that "lift this scene to 1.05": the z-offset (correct and pinned) and
the tag being off centre. Measured on the engine's own formulas:

| point | GDOP (real, z-offset) | GDOP (rows forced full length) | bearing gaps |
| --- | --- | --- | --- |
| tag (4, 3.5) | 1.0488 | 1.0249 | 110.8 / 64.6 / 95.2 / 89.4 |
| room centre (5, 4) | **1.0544** | **1.0317** | 104.3 / 75.7 / 104.3 / 75.7 |
| room minimum | 1.0286 at (2.2, 4) and (7.8, 4) | 1.0000 at (0.75, 0.20) | — |

Being off centre does not lift the GDOP: the tag's spot is *better* than the room centre on both the
real and the flattened model. And the room centre does not see four right angles either, because the
anchors form a 9 × 7 rectangle, not a square — no point in this room sees four right angles. The
second "thing", as stated, is not a cause of 1.05; the cause is the rectangle's shape (the bearings
can never be evenly spread) plus the z-offset. A learner doing tryThis 1 ("drag the tag around …
reading GDOP after each block") will find the centre reads 1.05, higher than the tag's 1.05 at more
decimals and higher than 1.03 at (2.2, 4) — the opposite of what the sentence implies. The same wrong
attribution is repeated in quiz 3's explain (`:184`, "and the tag is off centre, so the bearings are
64.6° to 110.8° apart") and in the scenario's doc comment (`:34-36`, "off centre on purpose, so the
four bearings are not four right angles"), which also drove the report's framing. It is unpinned:
test:305-309 pins the four gaps, never the claim that the centre would be better.

*What to do:* re-attribute the bearing cost to the 9 × 7 anchor rectangle (and, if the "off centre"
framing is kept, say that moving to the room's centre makes it slightly worse, 1.0544). Then pin it:
`exactFix(5, 4).gdop > exactFix(4, 3.5).gdop`, and the centre's gaps as 104.3 / 75.7 / 104.3 / 75.7.
The preceding note's "The middle of a square of anchors is the best case" (`:83`) is fine as a
statement about the ideal model, but it is what makes the next sentence read as a claim about this
room, so the two should be reconciled in the same edit.

### Minor

**3. `:115` (EN), `:116` (ZH) and `:174` (quiz 2 explain) — "nearly four times the 8.9 cm envelope"
is 3.48×.** The measured ratio is 30.9 cm / 8.89 cm = 3.48, and the test pins only the bracket
3.4 < r < 4 (test:505-506); the report itself says "3.5×". "Nearly four times" rounds a 3.5 up in the
direction that flatters the argument, which is exactly what this lesson is otherwise scrupulous about.
Say "three and a half times" (and pin `toFixed(1)` = '3.5').

**4. `:157` (quiz 1 stem) — "the fix moves 0.32 m" is a third number for the same shift.** The table
says 30.9 cm, observe 3 and the body say 31 cm / 0.31 m, the body says 0.316 m noise-free, and the
quiz stem says 0.32 m without saying which it is. 0.32 is the correct 2-dp rounding of the noise-free
0.3159, so nothing is wrong, but the stem should carry the same label the explain does ("noise-free").

**5. `:80` / `:91` — the ellipse's σ_r is the SS-TWR figure applied to a DS run, and the lesson does
not say so.** `position.ts:25-29` documents that c·σ_ts/√2 is exact for SS-TWR and that DS-TWR is
smaller (0.62–0.65·c·σ_ts ≈ 1.9 cm), the SS value being "the documented conservative model"; lesson 3
measured 1.8–1.9 cm of 1-σ for this very method (`uwb-dstwr.ts:112`). The scene runs DS, so the
ellipse and the 8.9 cm envelope are ~12 % conservative. The lesson does call σ_r "assumed" at `:115`,
which is why this is minor and not blocking, but a learner who did lesson 3 meets 2.12 cm here with no
reconciliation. One clause, and a pin against `rangeSigmaM`'s doc, would close it.

**6. `:87` and `:150` — the "1.03 to 1.26 everywhere" band is a display-rounded claim, and its sweep
stops 0.2 m short of the walls.** My 0.05 m sweep over the full room, walls included, gives
min **1.0286** at (2.2, 4) / (7.8, 4) and max **1.2574** at the corners. Both are inside the band once
printed to the two decimals the UI shows (1.03 and 1.26), so the sentence is true as read on screen —
but 1.0286 is strictly below 1.03, and the test's grid (`test:317-318`, x, y from 0.2) never visits
the corner strip where the maximum actually lives. Either widen the sweep to the room bounds and note
that the band is the printed value, or say "prints between 1.03 and 1.26".

**7. `:108` (ZH) — the FoM phrase is quoted in a form the ZH UI never prints.** The body says
"75 % 落在 12 ns 内" / "97 % 落在 0.5 ns 内", while `STRINGS.zh.uwb.fomWithin` (`src/ui/i18n.ts:772`)
renders "75 % 的误差落在 12 ns 内". Observe 3 (`:145`) and tryThis 2 (`:153`) both quote the full form,
so this one line is the outlier. Related nit at `:112`: the ZH "位移恰为 0.316 m" ("is exactly 0.316")
asserts exactness for a value that is 0.3159; the EN says only "is 0.316 m".

**8. `tests/course/uwb-position.test.ts:2-4` and ten comment blocks — the quoted sentences are from
the pre-trim draft, not the shipped strings.** The header states "Each assertion quotes the sentence
it guards, copied from the shipped string", but e.g. test:221-222 has "obstructs exactly that one"
(shipped: "obstructs only that one"), test:264 "With fewer than three ranges … the round produces no
fix at all" (shipped: "Under three ranges, or with anchors in a line, there is no fix"), test:313-314
"Into the corner at (1, 1) it rises only to 1.18" (shipped: "In the corner at (1, 1) it only reaches
1.18"), test:333-334, 409-411, 448-449, 461-463, 523 and 530-531 likewise. The report explains why
(the 2251 → 1715 word trim), and no pin is wrong because of it, but the comments are the traceability
mechanism this house style relies on — a reader can no longer find the guarded sentence by searching
for the quote. Re-copy them from the shipped strings.

**9. `tests/course/uwb-position.test.ts:537` — `expect(3 - 2).toBe(1)` is a tautology.** It guards
"three ranges and two unknowns still leave one spare measurement" with arithmetic that cannot fail and
has no connection to the run. Either drop it or make it an oracle (`fixes(1)[0].anchors.length - 2`
against the solver's `usable.length < 3` rule).

**10. `tests/course/uwb-position.test.ts:89-103` — `inspectorAt` hand-builds the view instead of
replaying records through `applyUwbRecord`.** Today the fields map one-for-one onto
`src/uwb/view.ts:73-97` and the only divergence (`n`) is not rendered by `uwbFixRow`/`uwbRangeRows`, so
every pinned inspector string is currently what the learner sees. But the pin would survive a change
in the reducer that the panel would not. Replaying the record stream through `applyUwbRecord` would
make these claims true by construction.

**11. `:119` — "its long axis swings … to +61.5°, towards the corner that sat at 36° from the tag"
is 25.5° of slack, and the pin only brackets it.** The measured axis is 61.53° and the removed
corner's bearing is 36.03°; test:521-526 pins the axis exactly but checks the "towards" claim only as
36 < θ < 90. The following sentence, "The direction nobody measures is the direction the fix is least
sure of" (`:123`), states an identity that is 25° off here, because the three remaining anchors still
shape the covariance. Softening it to "swings into that quadrant" (or naming the 25° gap) would keep
the lesson's own standard of not claiming more than the numbers support.

## Note on concurrency

Nothing else changed in the worktree during the review; `git status` was clean at the start and no
file was written except this review.

---

## Re-review (fix round 1)

Scope: commit `d0735ed` (package `task-6-fix1.diff`, `e68526a..d0735ed`), two files —
`src/course/uwb/uwb-position.ts` and `tests/course/uwb-position.test.ts`. Nothing else in the tree
changed; `tests/fixtures/lesson-hashes.json` is untouched, which is right because the scenarios are
untouched. Read only; no file was edited and nothing was committed.

### Commands run

- `npx vitest run tests/course/uwb-position.test.ts tests/engine/lesson-hashes.test.ts`
  → **2 files / 30 tests passed** (uwb-position 29, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, exit 0.
- Re-measured independently (esbuild bundle of `lessonWords`/`lessonMinutes`, run outside the repo):
  **1718 words → 25 minutes**, matching the new header (six words of headroom), inside the [15, 25]
  band and under the 1724-word ceiling.
- Re-derived every new pinned number from the engine's own formulas in plain JS, independently of the
  test: 2.3201 with and without anchor-2's row, row lengths 0.9912 / 0.0000 / 0.9945, 37.9°,
  centre 1.0544 against tag 1.0488, centre gaps 104.3 / 75.7 / 104.3 / 75.7, full-room extremes
  1.0286 and 1.2574, four-anchor GDOP 1.2383 → 1.24 at (9.5, 0.5), axis 61.53° against corner 36.03°
  = 25.5°, and 30.9 cm / 8.89 cm = 3.48 → 3.5. **Every one matches the pin.**

### Verdict

Spec: APPROVED
Quality: APPROVED

### Ruling by ruling

**Blocking 1 — settled.** `uwb-position.ts:123-124` now reads "Drag the tag onto the anchor at
(9.5, 0.5) and the three-anchor GDOP reaches 2.32: standing under an anchor makes its range blind to
horizontal motion, so its Jacobian row is exactly zero and drops out of JᵀJ, leaving two anchors
37.9° apart to carry the fix", and the ZH twin says the same. That is exactly what the engine does.
The rewritten case pins the three row lengths, `rows[1]` deep-equal to `[0, 0]`, `rowLen(...) === 0`,
`gdopOfRows(all) === gdopOfRows(without a2)` by **strict** equality (sound: the zero row adds exact
zeros to JᵀJ), both at 2.3201, the solver's own 2.3201 / 2.32 on the variant's geometry, the 37.9°
separation, the four-anchor 1.24 at the same spot, and a negative assertion that "nearly coincide"
has left the prose. The helper `gdopOfRows` computes √((xx + yy)/det), which is √trace((JᵀJ)⁻¹) for a
2 × 2 — correct, and it is what lets the case drop a row past the solver's three-range floor.

**Blocking 2 — settled.** The cause is re-attributed to the 9 × 7 anchor rectangle in all three
places, EN and ZH: the body (`:87-88`, "the anchors span 9 × 7 m, not a square, so no point sees four
right angles … and the room's centre is no better — 1.0544 against 1.0488"), quiz 3's explain
(`:184`) and the scenario doc (`:33-38`). The new case pins the 9 and the 7 read off the anchor
coordinates, both GDOPs to four decimals, the **direction** of the inequality
(`centre.gdop > tag.gdop`) — which is the sentence's actual claim — the centre's own gaps, and a
0.1 m sweep of the whole room showing no point comes within 1° of four right angles. The ideal-model
line "The middle of a square of anchors is the best case" (`:83`) is now correctly scoped by the
paragraph after it, which states this scene is not a square.

**Minors 3–11 — all settled**, each with a pin and, where it helps, a negative assertion:
3, "three and a half times" with `toFixed(1) === '3.5'` and `not.toContain('nearly four times')`;
4, one number per thing — `prose()` must contain "30.9 cm out", "30.9 cm moved" and "the shift is
0.316 m" and must **not** contain "0.32 m", with quiz 1's stem now labelling its figure "noise-free";
5, σ_r named as the SS-TWR figure kept as the conservative stand-in for DS with lesson 3's
1.8–1.9 cm quoted, pinned against `rangeSigmaM`'s documented split (1/√2 = 0.707 > 0.65 and
2.12 cm > 1.9 cm) — and I confirmed lesson 3 does state 1.8–1.9 cm (`uwb-dstwr.ts:112`);
6, "prints between 1.03 and 1.26", with the sweep run to the room bounds at 0.05 m and the true
extremes 1.0286 / 1.2574 pinned beside the printed ones; 7, the ZH FoM phrases now match
`STRINGS.zh.uwb.fomWithin` character for character and "位移恰为" is now "位移是"; 8, the ten comment
blocks re-copied — I spot-checked eight against the shipped strings and they match; 9, the tautology
replaced by the solver's own floor (three ranges solve, the same geometry cut to two returns `null`,
`fixes(1)[0].anchors` has three); 10, `inspectorAfter` replays `initViewState` + `applyRecord` from
`src/model/view`, so every pinned inspector row is the panel's output by construction; 11, "into the
quadrant the anchor left empty", with the quadrant, the corner's 36.0° and the honest 25.5° gap
pinned and the old phrase negatively asserted.

**EN/ZH parity.** Every changed string has a matching ZH twin, and I read each pair end to end: the
9 × 7 rectangle and the 1.0544/1.0488 comparison, the σ_r provenance sentence, "三倍半",
"位移是 0.316 m", "印出来都在 1.03 与 1.26 之间", "摆进被删掉的锚点空出来的那个象限", the
zero-Jacobian-row paragraph, quiz 1's stem and quiz 3's explain. Nothing is glossed and nothing is
one-sided. The single asymmetry is deliberate and disclosed in the report (the ZH keeps "10 × 8 m"
where the EN says "this room").

**Study time.** `lessonMinutes` 25, 1718 words, ceiling 1724 — pinned by the unchanged shape case and
re-measured independently.

### Remaining findings

None blocking. Three cosmetic nits, all optional; none justifies another round.

**N1. `src/course/uwb/uwb-position.ts:29`** — the `UwbPositionVariant` doc still calls the base scene
"the clean square", the word the rest of this commit went to some trouble to retire ("a rectangle, not
a square", eight lines below). One word.

**N2. `src/course/uwb/uwb-position.ts:91`** — the EN ellipse sentence now reads "the scene draws it
ten times over — 17 cm —", dropping the "semi-axis" qualifier that the ZH twin keeps ("长半轴 17 cm")
and that observe 2 still spells out ("17 cm for a 1.7 cm semi-axis"). 17 cm is the drawn semi-major
axis, not the drawn ellipse, so the EN body alone is now ambiguous; the information survives in
observe 2, which is why this is only a nit.

**N3. `src/course/uwb/uwb-position.ts:169` and `:173`** — quiz 2's stem and its third distractor still
say "31 cm" where the body, the table, observe 3 and quiz 2's own explain now say 30.9 cm. It is
defensible (the log line does print "error 0.31 m"), so minor 4's "one number per thing" is met in
substance; matching the explain would close it completely.
