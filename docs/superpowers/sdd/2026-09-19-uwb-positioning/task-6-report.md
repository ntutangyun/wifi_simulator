# Task 6 report — UWB lesson 5 "From four ranges to a point"

Status: **DONE**
Commit: `e68526a` on `feat/uwb-ranging` (worktree `.claude/worktrees/feat-link-2g`, parent `3f73852`)

## Files

| File | Change |
| --- | --- |
| `src/course/uwb/uwb-position.ts` | new — the lesson and `uwbPositionScenario()` |
| `tests/course/uwb-position.test.ts` | new — 28 cases, every quoted number pinned |
| `src/course/lessons.ts` | import + `AUTHORED` entry after `uwbBlocks` |
| `tests/fixtures/lesson-hashes.json` | +3 keys, additions only |

## Lesson shape

`id 'uwb-position'`, `module 12`, "From four ranges to a point" / 从四个距离到一个点.
5 jumps, 4 observe, 2 tryThis, 3 quiz. **1715 English words → `lessonMinutes` 25**
(ceiling 1724; nine words of headroom, recorded in the file header as the house
style requires). Two variants: "A brick wall in one path" / 一堵砖墙挡住一条路径
and "Three anchors" / 三个锚点.

Scene: `oneRoom()`, anchors at (0.5, 0.5), (9.5, 0.5), (0.5, 7.5), (9.5, 7.5)
at z 2.2, tag `uwb-1` at (4, 3.5, 1.0), DS, `nlos: true`, ppm drawn, seed 7 via
`uwbSc`/`sc`. The tag is deliberately off centre so the four bearings are not
four right angles — which is half the GDOP story.

## Measurements (all measured, none assumed; all pinned)

σ_r = `rangeSigmaM(100)` = 0.021199 m = **2.12 cm**.

### Base scene, 1.3 s = 7 blocks
- GDOP on exact ranges at the tag: **1.048799** → prints 1.05. Every simulated
  fix prints 1.05 too (they differ from the exact value by < 0.002 because the
  solved point wanders a centimetre, so JᵀJ is evaluated a hair away).
- 1-σ ellipse: **a = 1.737 cm, b = 1.388 cm, θ = −86.80°**, axis ratio 1.2514.
  Inspector string `1.7 × 1.4 cm`; scene draws it at `ELLIPSE_DRAW_SCALE` = 10
  (17 cm semi-axis).
- Fix error per block (cm): **0.7, 3.3, 0.5, 2.3, 2.8, 0.5, 1.8** — pinned
  value by value; envelope 4σ_r·GDOP = **8.9 cm**, every block inside it.
- Block-0 log line pinned verbatim:
  `uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors`
- Every range carries `FOM_LOS` 0x16 = "97 % within 0.5 ns". No timeouts.
- GDOP swept over the whole room on a 0.2 m grid: **min 1.029 at (2.2, 4.0),
  max 1.251 at (0.2, 0.2)** — the lesson's "stays inside 1.03 to 1.26".
  (1, 1) → 1.18, (0.6, 0.6) → 1.23, both pinned for the try-this.
- Why ≈ 1: 2/√N = 1.00 exactly for four evenly spread full unit vectors. This
  scene misses it twice over, both pinned: the Jacobian rows are only
  **0.968 / 0.982 / 0.975 / 0.985** long (anchors 1.2 m above the tag), and the
  bearing gaps are **64.6°, 89.4°, 95.2°, 110.8°**.

### Variant A — the brick stub
`brick(2, 1.5, 2, 3)` added to `oneRoom()`'s four shell walls. `wallsCrossed`
over all four tag → anchor rays: **anchor-1 crosses (["brick"]), the other three
cross nothing** — asserted as `['anchor-1:1', 'anchor-2:0', 'anchor-3:0',
'anchor-4:0']`, so the brief's segment needed no adjustment.
*Caveat, deliberately not hidden:* the stub also sits on the anchor-1 ↔ anchor-4
line, but anchors never range each other and never listen in each other's slots,
so nothing is affected (0 timeouts, the other three ranges stay within 1.4 cm).

- Ideal bias = `UWB_NLOS_NS.brick · C_M_PER_NS` = **0.599585 m** (0.5996 m).
- Block 0's blocked range: **5.3345 m vs true 4.7634 m, +57.1 cm**; mean over
  the seven blocks **+59.4 cm**, which is within σ_r/3 of 0.5996 m. Every
  block's blocked range is within 4σ_r of the ideal bias.
- FoM: **0x7b on that one range** (`fomText` → "75 % within 12 ns"), **0x16 on
  the other three**. Inspector row pinned:
  `['5.33 m', '4.76 m', '57.1 cm', '75 % within 12 ns']`.
- Fix shift, simulated block 0: **(4.18, 3.75), error 0.31 m**, i.e. **+0.18 m
  in x and +0.25 m in y** — positive in both, so away from anchor-1 at
  (0.5, 0.5); every one of the seven blocks has both components positive and a
  shift smaller than the 0.5996 m bias.
- Fix shift, noise-free (exact ranges + bias on anchor-1 only): **0.3159 m =
  53 % of the bias, bearing 54.4°**, residual **0.2134 m** (21 cm) against
  7e-15 m for a clean round. All pinned.
- GDOP and the ellipse are **unchanged** — 1.05 and 1.7 × 1.4 cm, block after
  block. 31 cm is 3.5× the 8.9 cm envelope. This is the lesson's punchline and
  is pinned both ways (equality with the exact-geometry values, and the ratio).
- Bonus, pinned as a try-this: with the session's `nlos` cleared the walled
  scene reproduces the base run *fix line for fix line*, while anchor-1's FoM
  stays 0x7b — the byte is geometry, the switch only idealises the delay.

### Variant B — three anchors
- GDOP **1.2624** (prints 1.26), up 20 %; ellipse **2.2 × 1.5 cm**, axis ratio
  **1.4355** (vs 1.2514), long axis **+61.53°** (vs −86.80°), tilted towards the
  deleted corner, which sits at 36.0° from the tag.
- Seven fixes all within **3.1 cm**; envelope 4σ_r·GDOP = 10.7 cm; no timeouts.
- Block-0 line pinned: `… error 0.03 m, GDOP 1.26, 3 anchors`; inspector
  `['1.26', '2.2 × 1.5 cm', '2.7 cm']`.
- Room sweep: three-anchor GDOP **max 2.376 at (9.8, 0.4)**; on anchor-2 itself
  (9.5, 0.5) it is **2.320**, which is the drag the try-this describes and what
  "passes 2.3" is pinned against (four anchors there stay below 1.26).

## Divergences from the brief (all deliberate, all measured)

1. The brief said the ellipse is drawn 3×; the engine's `ELLIPSE_DRAW_SCALE` is
   **10**, so the lesson says ten times and pins the constant.
2. The brief's "the error ellipse (1-σ)" wording and the three-anchor error cell
   are the engine's own formatted strings: variant B's block-0 error prints
   **2.7 cm**, not 2.8 (2.749…), so the table says 2.7 cm.
3. `wallsCrossed` is 2-D, so the anchor-1 ↔ anchor-4 crossing noted above is
   real but inert; the lesson claims only what it can defend ("of the four
   tag-to-anchor rays it obstructs only that one").
4. Word budget forced real cuts: at first draft the lesson was 2251 words
   (30 minutes). The final 1715 keeps every pinned number and every concept the
   brief asked for; what went was redundancy, not content.

## Hash fixture

`$env:UPDATE_HASHES='1'; npx vitest run tests/engine/lesson-hashes.test.ts`.
`git diff` showed **three added lines and nothing else**:

```
+  "uwb-position": "d331c1b",
+  "uwb-position#0": "d331c1b",
+  "uwb-position#1": "a811d71c",
```

`uwb-position` and `uwb-position#0` share a hash. That is correct, not a bug:
`Simulation.updateHash` digests `${r.t}:${r.seq}:${r.type}` only, and the brick
stub changes the *values* inside `UWB_RANGE`/`UWB_POSITION` records, not the
schedule, the record order or the record types. Variant B does change the
schedule (8 slots instead of 10) and gets its own hash.

## Gates

| Gate | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npx vite build` | built in 2.7 s (only the pre-existing chunk-size warning) |
| `npx vitest run` | **97 files, 1100 tests, all passing** |
| `tests/course/uwb-position.test.ts` | 28 passing |
| no `any` / `@ts-ignore` / `as unknown as` | confirmed by grep |

## Self-review notes

- Both languages read end to end; the Chinese is a translation, not a gloss, and
  every EN/ZH pair was re-checked after the trimming pass (three drifts found
  and fixed: a dropped closing line, an "ellipse" that survived in ZH but not
  EN in observe 3, and a missing "too long" in quiz 1).
- The lesson is explicit that the FoM is reported but never read by the solver,
  matching `src/ui/glossary.ts` ("Reported, not used by the solver").
- One thing I chose *not* to claim: the solver's residual is not shown anywhere
  in the UI, so it appears only in body prose as what the solver computes, and
  is pinned through `solvePosition` rather than through a log line.

## Concurrency note

`tests/course/uwb-blocks.test.ts` changed on disk during this task (another
session). I did not touch it, it is outside my pathspec, and the full suite is
green with that change in place.

---

# Fix round 1

Status: **DONE**
Commit: `d0735ed` — `fix(course): uwb-position geometry claims match the solver; pins match the sentences`
Files: `src/course/uwb/uwb-position.ts`, `tests/course/uwb-position.test.ts` only. The fixture
was **not** regenerated (no scenario changed); `tests/engine/lesson-hashes.test.ts` still passes.

All eleven findings addressed. 1718 words → `lessonMinutes` 25 (ceiling 1724, six words spare;
the header records the new count). 29 tests in the lesson's file, full suite 97 files / 1101 tests.

## Blocking 1 — (9.5, 0.5): the mechanism was wrong

The old clause said "two of the three bearings nearly coincide and JᵀJ flattens". Measured, that
is false. The tag stands **under** anchor-2, so its Jacobian row is the horizontal shadow of a
vertical unit vector — exactly `(0, 0)`:

| anchor | row length | bearing from the tag |
| --- | --- | --- |
| anchor-1 (0.5, 0.5) | 0.9912 | 180.0° |
| anchor-2 (9.5, 0.5) | **0.0000** | undefined |
| anchor-3 (0.5, 7.5) | 0.9945 | 142.1° |

The row contributes nothing, so GDOP is identical with and without it: **2.3201** either way,
and 2.3201 is what `solvePosition` reports on the variant's own geometry. The surviving pair is
**37.9°** apart — nothing coincides.

New prose (EN and ZH): "…the three-anchor GDOP reaches 2.32: standing under an anchor makes its
range blind to horizontal motion, so its Jacobian row is exactly zero and drops out of JᵀJ,
leaving two anchors 37.9° apart to carry the fix." This reuses the row-length idea the lesson
already taught four paragraphs earlier.

Pinned in a rewritten case, `standing on the anchor at (9.5, 0.5) zeroes its Jacobian row…`: the
three row lengths, `rows[1]` deep-equal to `[0, 0]`, `gdopOfRows(all) === gdopOfRows(without a2)`
(strict equality, not an epsilon), both at 2.3201, the solver's 2.3201/2.32, the 37.9° separation,
a negative assertion that "nearly coincide" is gone from the prose, and the four-anchor GDOP at
the same spot (1.24, under the room's 1.26).

## Blocking 2 — "off centre" had the sign backwards

Measured: the tag's spot is **better** than the room's centre, not worse.

| point | GDOP | bearing gaps |
| --- | --- | --- |
| tag (4, 3.5) | **1.0488** | 64.6 / 89.4 / 95.2 / 110.8 |
| room centre (5, 4) | **1.0544** | 104.3 / 75.7 / 104.3 / 75.7 |

And the anchors span **9 × 7 m**, a rectangle: no point in the room sees four right angles, so the
centre was never the ideal the old sentence implied. Re-attributed in three places — the body
paragraph, quiz 3's explain, and the scenario doc comment — all in EN and ZH.

New pin, `the anchors span 9 × 7 m, so no point sees four right angles — the room’s centre least
of all`: the 9 and the 7 read off the anchor coordinates, both GDOPs to four decimals, the
direction of the inequality (`centre.gdop > tag.gdop`), the centre's own 104.3/75.7 gaps, and a
0.1 m sweep over the full room proving no point gets all four gaps within 1° of 90°.

## Minors 3–11

| # | Fix |
| --- | --- |
| 3 | "nearly four times" (really 3.48) → "three and a half times", in the body and quiz 2; pinned as `toFixed(1) === '3.5'` plus a negative assertion on the old phrase. The envelope's own 8.9 cm is pinned in the same case. |
| 4 | One number per thing: the simulated shift is **30.9 cm** in the table, the body and observe 3; the noise-free one is **0.316 m** in the body and now in quiz 1's stem, labelled "noise-free". "0.32 m" is gone, and the test asserts `prose()` does not contain it. |
| 5 | The ellipse paragraph now says σ_r is "the SS-TWR figure, the model’s conservative stand-in for DS, which lesson 3 measured at 1.8–1.9 cm" (EN and ZH). Pinned against `rangeSigmaM`'s documented split: 1/√2 = 0.707 > 0.65, and 2.12 cm > 1.9 cm. Lesson 3's figure was read from `uwb-dstwr.ts`, not assumed. |
| 6 | "stays between" → "**prints** between 1.03 and 1.26" in the body and tryThis 1 (EN and ZH). The sweep now runs 0 → 10 and 0 → 8 at 0.05 m, i.e. to the room bounds where the extremes actually live, and pins the true values **1.0286** and **1.2574** as well as their printed 1.03 / 1.26. |
| 7 | The body's ZH FoM phrases are now `75 % 的误差落在 12 ns 内` / `97 % 的误差落在 0.5 ns 内`, matching `STRINGS.zh.uwb.fomWithin`. ZH "位移恰为 0.316 m" → "位移是 0.316 m". |
| 8 | Ten comment blocks re-copied verbatim from the shipped strings (the residual/line case, the 0.5–3.3 cm sentence, the inspector sentence, the rings, the brick paragraph, the FoM pair, the NLOS switch, the shift, the ellipse swing, the spare measurement). A searcher can find the guarded sentence again. |
| 9 | `expect(3 - 2).toBe(1)` replaced with the solver's own rule: three ranges solve, the same geometry cut to two returns `null`, and `fixes(1)[0].anchors` has three. |
| 10 | `inspectorAt` → `inspectorAfter`, which builds `initViewState(scenario)` and feeds it every record through `applyRecord`. The pinned inspector rows are now the panel's output by construction; `UwbPositionView`/`UwbRangeView` imports dropped. |
| 11 | "towards the corner that sat at 36° from the tag" → "into the quadrant the anchor left empty", and the over-strong "the direction nobody measures…" identity was cut. The test pins the quadrant (`Math.floor(θ/90)` equal for both), the removed corner's 36.0°, the honest **25.5°** gap between axis and bearing, and a negative assertion on the old phrase. |

## Gates

| Gate | Result |
| --- | --- |
| `npx vitest run tests/course/uwb-position.test.ts` | 29 passed |
| `npx vitest run tests/engine/lesson-hashes.test.ts` | 1 passed, fixture untouched |
| `npx tsc -b` | clean |
| `npx vite build` | built in 2.7 s |
| `npx vitest run` | 97 files, 1101 tests, all passing |
| `git status` | clean; only the two permitted files changed |

One deliberate non-change: the body's EN says "everywhere in this room" while the ZH keeps
"这间 10 × 8 m 房间里任何位置". The ZH is correct and costs no English words, so the dimension
was left in on that side rather than spent from the nine-word budget.
