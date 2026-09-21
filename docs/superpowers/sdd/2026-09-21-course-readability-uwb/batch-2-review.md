# Batch 2 review — uwb-blocks, uwb-position, uwb-geometry (commit 37dbc77)

Reviewer: fresh read of `npx tsx scripts/lesson-dump.ts <id> en|zh` output, plus a diff
against the a6fb16c test pins and a spot-check of three mechanism claims per lesson
against `src/uwb/{session,position,phy,channel}.ts`.

## Verdicts

- **uwb-blocks — READY**
- **uwb-position — READY**
- **uwb-geometry — READY**

## Counts by severity

- Blocking: 0
- Major: 0
- Minor: 1
- Nit: 1

No dropped pins, no weakened pins, no mechanism claim that disagrees with the engine,
`sameSceneAs` correctly wired, `.body!` gone, fixtures diff is additions-only, and the
only failing test in the requested run is the expected `uwb-sstwr` bookkeeping failure
from the concurrent batch.

---

## Part 1 — beginner read

### uwb-blocks (en / zh)

- First unfollowable sentence: none. The lesson reads top to bottom without a jump a
  Tier-1-Wi-Fi + uwb-intro/uwb-frame/uwb-sstwr/uwb-dstwr reader can't make. `PPDU` (used
  unglossed in the slot-fit formula, `src/course/uwb/uwb-blocks.ts:~150`) and `RMARKER`
  (deeper section) are both terms this persona already has from Tier 1 and uwb-intro's
  own `terms` list — not a gap for this specific persona, but worth remembering if the
  persona bar is ever lowered.
- Unexplained words: none beyond the above, which are pre-taught.
- Multi-idea paragraphs: none egregious; "Why a slot is so much longer than a frame"
  carries a fit-rule claim plus a margin-provenance claim, but the two are one sentence
  apart and clearly sequenced (claim, then what pays for it) — not a readability fault.
- Contradictions: none found.
- Opening states problem + audience: yes — "A room with several phones in it wants
  several distances at once" states the problem before naming the mechanism.
- WATCH prompt sets expectations: yes, twice — `[WATCH → the block repeats]` and
  `[WATCH → the first tag's fix]` both say in the same sentence what the reader is about
  to see before sending them to the sim.
- Quiz answerable from main path: yes, both questions restate numbers/claims from
  "What the radio actually costs" and "Two slot lengths, one scene", both in the main
  numbers table, not `deeper`.
- ZH sentences reading translated: none clearly machine-translated. One tonal nit:
  "slot: 时间表上的一行——里面只走一帧，**别无他物**" (`src/course/uwb/uwb-blocks.ts` terms
  block) reaches for a literary four-character idiom where the rest of the glossary
  entries are plain vernacular — a register wobble, not a translation artifact. (Nit.)
- Datasheet-register sentences in the narrative path: none — every formula/table lives
  in "now the numbers", and the picture section stays narrative in both languages.

### uwb-position (en / zh)

- First unfollowable sentence: none.
- Unexplained words: none in the main path. `Gauss–Newton` and `convex hull` appear only
  in `deeper`, which is explicitly the optional-extension section.
- Multi-idea paragraphs: none.
- Contradictions: none. The "opening lesson's 2.1 cm" cross-reference to uwb-intro is
  consistent with uwb-intro's own text (verified below).
- Opening states problem + audience: yes — "A distance to an anchor is not a place...
  it has to answer the only question the user asked: where am I standing?"
- WATCH prompt: yes — `[WATCH → the fix this block's ranges make]` tells the reader a
  cross will appear with fading rings before they load the sim.
- Quiz answerable from main path: yes, all three (trilateration vs. crossing circles,
  what a residual means, three-anchor case) are answered by "the picture" section text
  and the "Two unknowns, not three" paragraph.
- ZH sentences reading translated: none stood out; the ZH prose reads as directly
  authored rather than machine-translated (natural idiom throughout, e.g. "解算器不再去
  找交点：它要找的是那个对四个距离都'最不亏欠'的位置").
- Datasheet-register sentences in the narrative path: none; the σ_r formula and the
  Gauss–Newton normal equations both live in "now the numbers", not "the picture".

### uwb-geometry (en / zh)

- First unfollowable sentence: none.
- Unexplained words: `eigenvectors` appears once, in "now the numbers"
  ("its eigenvectors are the ellipse") without a lay gloss — acceptable there given the
  section's own register contract, but it is the single densest sentence in either
  language across all three lessons.
- Multi-idea paragraphs: "Three honest ranges against one that lies" packs three claims
  (least squares splits the difference / fix slides roughly half the error / residual
  jumps from nothing to centimetres) into one paragraph; each is one clause and the
  sequence is causal, so it reads as one idea developed rather than several unrelated
  ones — not flagged as a fault, noted for awareness.
- Contradictions: none.
- Opening states problem + audience: yes — "Nothing about the radio changes when you
  move the anchors, and yet the answer gets better or worse... an electrician who put
  the anchors where the cable was easy" names both the problem and who pays for it.
- WATCH prompt: yes — `[WATCH → the fix this block's ranges make]` names the comparison
  ("compare the fix with the four-anchor run") before the reader loads the variant.
- Quiz answerable from main path: yes, all three questions (why the fix moves 0.316 m
  and not 0.60 m; why GDOP/ellipse don't move; why GDOP ≈ 1) are answered from "Three
  honest ranges against one that lies", "What the ellipse will not tell you" and "What
  the geometry charges" — all main-path sections.
- ZH sentences reading translated: none clearly machine-translated.
- Datasheet-register sentences in the narrative path: none; `GDOP = √trace((JᵀJ)⁻¹)` and
  `Σ = σ_r²(JᵀJ)⁻¹` are confined to "now the numbers".

---

## Part 2 — pins and contract

### Pin inventory vs. a6fb16c

- **uwb-blocks**: every `it` in the a6fb16c file has a corresponding (renamed
  tag→phone, matching the lesson's own vocabulary shift) `it` in the current
  `tests/course/uwb-blocks.test.ts`, with the same or tighter assertions. The old
  file's standalone "every string a learner reads exists in both languages" `it` is
  gone as a per-lesson duplicate but is now enforced globally by
  `tests/course/readability.test.ts:114` ("says everything in both languages"), which
  every non-MIGRATING lesson (including uwb-blocks) is subject to — not a loss of
  coverage.
- **uwb-position**: the a6fb16c file was pre-split (it still carried the GDOP/ellipse
  material later moved to uwb-geometry). Every one of its GDOP/ellipse `it`s reappears,
  practically verbatim, under `uwb-geometry · what the geometry charges` /
  `· a brick wall in one path` / `· three anchors` in the current
  `tests/course/uwb-geometry.test.ts`. The old file's closing
  `'the comparison table is the three runs, cell by cell'` test (one `it` asserting all
  15 cells + both variant labels at once) is not present as a single `it` in the new
  geometry file, but every one of its individual cell values is pinned across several
  smaller `it`s (`cell(0,0,1)`, `cell(0,0,2)`, the base-run row check at
  `uwb-geometry.test.ts:263-274`, `cell(0,1,3/4)`, `cell(0,1,1/2)` equality-to-row-0,
  `cell(0,2,1/2)`, `cell(0,2,3/4)`) — finer-grained, not weaker.
- **uwb-position (remaining, non-geometry part)**: the solver-convergence, refusal, and
  σ_r pins all carry over into `tests/course/uwb-position.test.ts`.

### The dropped `not.toContain('c·σ_ts/√2')` pin

Confirmed via `git log --all -S"c·σ_ts/√2"` and the SDD history
(`docs/superpowers/sdd/2026-09-19-uwb-positioning/*`): under the old (pre-split)
architecture, uwb-position was forbidden from restating the closed form because
uwb-intro already quoted the bare "2.1 cm" figure and the rule was one lesson states
the formula, others just cite the number.

In the rewrite, `tests/course/uwb-position.test.ts:227` replaces the negative pin with
a positive, stronger one: it asserts the formula text itself
(`'σ_r = c · σ_ts / √2 = 2.12 cm'`), the numeric value to 12 decimal places, that
uwb-intro's own prose still carries the bare "2.1 cm" phrase
(`expect(lessonProse(uwbIntro)).toContain(...)`), and that a reseed of either constant
has to move both lessons together. This is an adequate — arguably better — replacement:
it keeps the single-source-of-truth property the old negative pin protected, but now
pins the actual relationship instead of just forbidding one lesson from saying it.

### Other contract checks

- `sameSceneAs: 'uwb-position'` is present in `tests/course/uwb-geometry.test.ts:52`.
- `.body!` does not appear in any of the three test files (only in a header comment
  noting it is gone).
- `git show HEAD -- tests/fixtures` and `git show a77413f -- tests/fixtures` are both
  additions-only (3 lines added to each of `lesson-hashes.json` and
  `uwb-record-hashes.json`).

### Test run

```
npx vitest run tests/course/uwb-blocks.test.ts tests/course/uwb-position.test.ts \
  tests/course/uwb-geometry.test.ts tests/course/readability.test.ts
```
149 passed, 1 failed — `readability · migration bookkeeping > every MIGRATING id is a
real lesson still in the old shape`, failing on `uwb-sstwr` (still in the concurrent
batch's MIGRATING list but already rewritten). This is exactly the expected bookkeeping
failure from the concurrent batch, not a batch-2 regression.

### Mechanism spot-checks (3 per lesson, against src/uwb)

- **uwb-blocks**: the 300 RSTU floor claim matches
  `src/model/scenario.ts:561` (`z.number().int().min(300)`); the slot-fit formula
  `PPDU(Final, N) + 200 ns` matches `uwbSlotFitNs` in `src/uwb/phy.ts:321` and its call
  site `src/uwb/network.ts:78`; the RSTU-to-ns conversion (416 chips, 833.333 ns) matches
  `src/uwb/phy.ts:19` (`RSTU_NS = RSTU_CHIPS * UWB_CHIP_NS`).
- **uwb-position**: "starts at the anchors' centroid... under 1 mm, or after 20
  iterations" matches `src/uwb/position.ts:36,83` (`STEP_TOL_M = 1e-3`, doc comment "20
  iterations or a step under 1 mm"); the σ_r formula and 2.12 cm figure match
  `rangeSigmaM` in `src/uwb/position.ts:30`; the "refuses under three ranges, or anchors
  in a line" claim matches `solvePosition`'s null-return paths exercised in
  `uwb-position.test.ts:214-224`.
- **uwb-geometry**: `GDOP = √trace((JᵀJ)⁻¹)` matches `src/uwb/position.ts:168`
  (`gdop = Math.sqrt(invXX + invYY)`); the wall NLOS delays (brick 2.0 ns, drywall
  0.5 ns, glass 0.2 ns) match `UWB_NLOS_NS` in `src/uwb/phy.ts:70`; the FoM byte's
  "reports geometry, not the delay" claim matches the LOS/NLOS byte constants and the
  channel-level FoM comment in `src/uwb/channel.ts:264`.

No mismatch found between any of the nine claims and the engine.
