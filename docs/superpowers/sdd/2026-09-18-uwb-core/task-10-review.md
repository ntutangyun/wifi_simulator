# Task 10 review — lesson 3 "Two round trips cancel the clock" (`uwb-dstwr`)

Reviewed: commit `87ec262` (review package `task-10-review.diff`, `8defe87..87ec262`), against
`task-10-brief.md`, `task-10-report.md`, the controller's rulings, and the house style of
`src/course/uwb/uwb-sstwr.ts` / `tests/course/uwb-sstwr.test.ts` as committed at `8defe87`, plus
`task-8-review.md` and `task-9-review.md`. Read only; no file was edited.

## Commands run

- `npx vitest run tests/course/uwb-dstwr.test.ts tests/engine/lesson-hashes.test.ts`
  → **2 files / 33 tests passed** (uwb-dstwr 32, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, no diagnostics, exit 0.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

(The same split Task 9 used: the brief's scene, shape, body list, jumps, test list and fixture rule
are all met; the two blocking findings are prose that contradicts the engine, which is the quality
axis.)

## What was verified as correct

**Scene — exactly the brief and the ruling.** `uwbDstwrScenario(ppm)` is `uwbSc(oneRoom(), …,
{ method: 'ds', nlos: false })` with `anchor-1` (8.5, 4), `anchor-2` (5, 7.5), `anchor-3` (1.5, 4),
`anchor-4` (5, 0.5), `tag-1` "Phone" (5, 4), every device at z 2.2 — character for character the
coordinate list of `uwb-sstwr.ts:37–43`. The test pins the room, the node order, the roles, z, the
tag position, the 3-D hypotenuse to 3.5 m at 12 digits, the idle profiles, empty `servers`, and
`{ method: 'ds', nlos: false, slotRstu: 2400, tsNoisePs: 100 }` (`test:198–210`). Base ppm
`[-10,-10,-10,-10,10]` (`test:215–217`); variant `{ tag: 20, anchors: -20 }` with the brief's labels
verbatim in both languages, `|20| === UWB_PPM_MAX`, each offset exactly twice the base, and a
`strip()` JSON comparison proving nothing but the ppm differs (`test:221–230`). The local rebuild is
justified — `uwbSstwrScenario` hard-codes `method: 'ss'` and takes no method argument — and the
controller allowed it.

**Shape and ids.** `id: 'uwb-dstwr'`, `module: 11`, already in `COURSE_ORDER`
(`src/course/curriculum.ts:73`); 5 jumps / 4 observe / 2 tryThis / 3 quiz all pinned
(`test:132–136`); `lessonMinutes` pinned to the formula and to the [15, 25] band (`test:120–128`).
I recomputed `lessonWords` independently from the source (all `en:` literals plus the `N()` table
cells, excluding title, variant label and jump labels): **1710 words → 25 minutes**, matching the
report. `lessons.ts` gains exactly the import and the `AUTHORED` entry (2 lines).

**Jumps.** Chronological per the ruling — poll (0), Final (10 ms), anchor-lane range (10.237 ms),
first report (12 ms), position (20 ms) — and the test asserts all five are found in the base run,
that their record indices are non-decreasing, that jump 3 is a `UWB_RANGE` on an `anchor` lane and
that it precedes the first report (`test:139–154`). `firstAnchorRange` is a pure record predicate
(`uwb-dstwr.ts:24`); the other four come from `lessonKit`.

**Engine facts the prose must match — the ones that are pinned.** 10 slots = 2N + 2 against SS's
N + 1, `slotNs` 2 ms, `roundNs`/`untilNs` 20 000 000, the `UWB_ROUND` log line verbatim, ten
`UWB_SLOT` at 0…18 ms, no `UWB_TIMEOUT` (`test:239–250`); the whole TX order as
`node/kind@ms` strings (`test:255–260`); poll 39 / 206 859, response 14 / 181 218, Final 62 /
236 603, report 24 / 191 474 taken from `uwbPollBytes`, `uwbRespBytes`, `uwbFinalBytes`,
`UWB_REPORT_BYTES` and `uwbPpduNs`, each formatted string matched against a table cell
(`test:266–277`); round octets 253 and round airtime **summed from the run's own `TX_START`
`frame.txTimeNs`** = 1 934 230 ns, equal to the four-term expression and to the `1 934.23 µs` cell
(`test:280–287`); 9.67 % against the SS round's 9.56 % (`test:290–298`); Final = 14 + 12N for
n ∈ {3,4,5}, MHR 9 + RMI 27 + 4×RRTI 6 + FCS 2 = 62, 496 bits, `ceil(496 / RS_BLOCK_BITS) = 2`,
report 9 + 13 + 2 = 24, +12 octets and +2 slots / +4 ms for a fifth anchor (`test:305–318`).

**The four times and both lanes.** Anchor 1's `UWB_TS` order (`rx/uwbPoll`, `tx/uwbResp`,
`rx/uwbFinal`, `tx/uwbReport`), its three counters, and all four intervals are pinned exactly
(`test:327–334`); the two differences +4 056 / −8 734 RCTU → +63 / −137 ns against 2 × 11.675 ns
(`test:341–347`); per anchor, the phone's two intervals tile 10 ms and the anchor's tile 10 ms to
within 200 ns, and the four sum to 1 277 952 000 RCTU (`test:353–361`). For every anchor both
`UWB_RANGE` records carry **the engine's `dsTwr` of those same four counters, `===`**
(`test:366–371`) — the strongest possible form of the "same four counters, same function" claim —
plus `distM` within 1e-9, `tofRawRctu` undefined, `method` 'ds', and the four `fmtRecord` lines
verbatim (`test:489–506`). Anchor-lane times all 10 236 615 ns, tag-lane 12/14/16/18 ms + 191 486 ns,
gap in (1.9 ms, 2 ms) (`test:480–483`).

**Clock cancellation, checked numerically rather than argued.** `test:430–447` scales the four true
intervals by the clock that actually measures each one and asserts the numerator ratio is
(1 + eA)(1 + eB) to 10 places and the denominator ratio 1 + (eA + eB)/2 to 6, for four (eA, eB)
pairs × four slots. `test:450–469` pins the survivor: 0.23 ps / 0.07 mm at both crystals +20 ppm,
equal to `metresToNs(3.5)·e`, and < 1e-8 m with the crystals opposed. Both the "0.23 ps" and the
"0.07 mm" of the prose come out of `dsTwr`, not out of the author's algebra.

**Noise.** `dsSigmaM` derives the three sensitivities (r2/S, ½, r1/S with S = 2(r1 + r2)) from the
session's own `tsNoisePs` and `PLAN.slotNs`; I re-derived ∂Tprop/∂rxPoll = +r2/D, ∂/∂rxResp =
(T1 + r1)/D ≈ ½, ∂/∂rxFinal = r1/D independently and agree. It yields 1.94 / 1.85 / 1.85 / 1.94 cm,
pinned as `['1.9','1.8','1.8','1.9']`, with slot 4 equal to slot 1 to 15 places, max/min < 1.06, and
below `rangeSigmaM(100)`; then validated against a 100-seed RMS per slot within ±25 %
(`test:543–569`). Every range is bounded by 3·σ(that slot) rather than a flat guess, in both scenes
(`test:525–532`), and the four errors are pinned as strings (`test:539`).

**Variant.** Halves 15.51 / −44.47 m, the four `fmtRecord` lines, each range within 0.003 m of the
base (measured max 2.815 mm, so "within 3 mm" is the correct rounding — the ruling), fix 0.02 m,
GDOP 1.00 (`test:574–597`).

**Bilingual fidelity.** A mechanical pass over all 53 `en`/`zh` literal pairs plus the `N()` cells
found **no numeric divergence** (the four flags my tokenizer raised are all comma-run artefacts:
EN "3.51, 3.49, 3.54" merged into one token against ZH's "3.51、3.49、3.54"), **no untranslated
English sentence**, balanced `“ ”` in both languages everywhere, and CJK present in every ZH string
except the two `formula` lines, which are language-neutral by the same exemption Tasks 8 and 9 took.
The source-status sentence is present in both languages and pinned for all five clause references
and the four model-number phrases (`test:184–189`).

**Fixture.** `tests/fixtures/lesson-hashes.json` gains exactly `"uwb-dstwr"` and `"uwb-dstwr#0"`;
the hunk is pure `+` and no existing key or value is touched. The two hashes being equal is correct
for the same reason lesson 2's three are (the ppm changes counter values, not event timing), and
`test:221–230` distinguishes the scenes, so no coverage is lost.

**Quality baseline.** No `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error` in either new
file. Constants and functions are imported, not retyped: `C_M_PER_NS`, `RCTU_NS`, `RS_BLOCK_BITS`,
`UWB_FCS_BYTES`, `UWB_MHR_BYTES`, `UWB_PPM_MAX`, `UWB_REPORT_BYTES`, `RMI_REPORT_IE_BYTES`,
`RRTI_IE_BYTES`, `rmiFinalIeBytes`, `uwbFinalBytes`, `uwbPollBytes`, `uwbRespBytes`, `uwbPpduNs`,
`roundPlan`, `counterDiff`, `dsTwr`, `ssTwrRaw`, `metresToNs`, `rctuToMetres`, `rangeSigmaM`,
`fmtRecord`, `OBSERVE_MINUTES`, `TRY_MINUTES`. The session's `tsNoisePs` and `slotNs` are read back
off the scenario rather than re-typed — an improvement on lesson 2 (its finding 8).

---

## Findings

### Blocking

**1. `src/course/uwb/uwb-dstwr.ts:103` (EN) and `:104` (ZH) — "the only one that grows with the
anchor count" is false: the Poll grows too.** The prose says "The Final is the largest frame and the
only one that grows with the anchor count: 14 + 12N octets" (ZH: "Final 是全轮最大的帧，也是唯一随
锚点数增长的帧"). The engine's Poll is `uwbPollBytes(anchors) = 27 + 3 * anchors`
(`src/uwb/phy.ts:94–96`), because it carries the RDM IE at `3 + 3 * anchors`
(`src/uwb/phy.ts:86–88`), and the Poll's IE list is `['ARC', 'RDM', 'RRMC']`
(`src/uwb/frames.ts:44`). A fifth anchor takes the Poll from 39 to 42 octets, which the lesson's own
frame table and the tryThis sentence about "a fifth anchor" both invite the learner to check. The
test never guards the word "only" — it calls `uwbPollBytes(ANCHORS)` at `test:267` and so had the
counter-example in hand. **Do:** drop the exclusivity — e.g. "the largest frame, and the one that
grows fastest with the anchor count: 14 + 12N octets against the Poll's 27 + 3N" — in both
languages, and pin it: `expect(uwbPollBytes(5) - uwbPollBytes(4)).toBe(3)` alongside the existing
`uwbFinalBytes(5) - uwbFinalBytes(4)` assertion at `test:315`, plus one assertion that 62 is the
maximum of the four frame sizes to cover "the largest frame".

**2. `src/course/uwb/uwb-dstwr.ts:139` (EN) and `:140` (ZH) — tryThis 2 tells the learner the frame
inspector shows "four RRTI IEs of 6"; it shows one RRTI IE of 24 B.** The Final's IE list is
`ies: ['RMI', 'RRTI']` (`src/uwb/frames.ts:66`) and the renderer emits a single `ieRrti` row sized
`n * RRTI_IE_BYTES` with the value "4 reply times (treply2), one per anchor"
(`src/uwb/frameFields.ts:80–86`). So the experiment — "Open the Final in the frame inspector:
62 octets, one RMI IE of 27 …, four RRTI IEs of 6 holding the four Treply2 values" (ZH: "四个 6 字节
的 RRTI IE") — sends the learner to look for four rows that are not there. The arithmetic is pinned
(`test:309` sums `ANCHORS * RRTI_IE_BYTES`), which is exactly why the drift survived: the test pins
the sum, never the rendering. The same wording is echoed in the body's step 3 ("Treply2 … in an RRTI
IE", `:60`/`:61`), which reads as one IE per anchor. Note the report row of the same tryThis is
correct and does match the inspector (one 13-octet `ieRmi`, `src/uwb/frameFields.ts:95–97`).
**Do:** say "one RRTI IE of 24 holding the four Treply2 values (6 octets each)" in both languages,
and pin it against the renderer rather than the arithmetic — build the Final through
`makeFinal(...)`/`uwbFrameFields(...)` (or read the `TX_START` record's frame) and assert the IE
rows are `[{ieRmi, 27}, {ieRrti, 24}]` with the quoted sentence above.

### Minor

**3. `src/course/uwb/uwb-dstwr.ts:66–67` — the formula block is the lesson's central claim and
nothing asserts it, or ties it to `dsTwr`.** The printed expression does match
`src/uwb/ranging.ts:14–16` exactly, and the scaling test at `test:437–438` re-types the same
numerator and denominator by hand — but no assertion says "the lesson prints this string" or
"`dsTwr(a,b,c,d) === (a·c − b·d)/(a+b+c+d)`". Editing the formula block to a wrong expression
breaks no test. Lesson 2 closed exactly this gap for `ssTwrCorrected`
(`tests/course/uwb-sstwr.test.ts:269–278`, cited approvingly in `task-9-review.md`). **Do:** find the
`formula` block by kind, assert its `text.en` equals the expression, and assert `dsTwr` reproduces
it on the block's own operand order for a couple of arbitrary quadruples.

**4. `src/course/uwb/uwb-dstwr.ts:48` — two of the four "model numbers" in the source-status sentence
are pinned only as substrings of the sentence itself.** `test:187–189` checks the sentence *contains*
`'3 + 6N octets'` and `'40-bit ranging counter'`, which is a pin on the prose, not on the engine.
`COUNTER_BITS = 40` is exported with the matching comment (`src/uwb/phy.ts:14`, "model (standard:
'at minimum 32-bit')") and is never imported by the test; `rmiFinalIeBytes` is pinned only at N = 4
(`test:307`), so the "3 + 6N" shape itself is unguarded while the sibling claim "14 + 12N" is checked
at three values of N (`test:305`). **Do:** import `COUNTER_BITS` and assert `=== 40`, and loop
`rmiFinalIeBytes(n) === 3 + 6 * n` over n ∈ {3,4,5} as the Final's line already does.

**5. `tests/course/uwb-dstwr.test.ts` — nine guard comments quote sentences the lesson does not
contain.** The house rule is that an assertion quotes the sentence it guards, precisely so that
rewording the prose is visible in review; these were written against an earlier draft and never
resynced. Verified by literal search against `uwb-dstwr.ts`:
`:51–52` "weighted by the reply times they come to about 1.9 cm of 1-σ";
`:237` "the last one ends at 20 000 000 ns";
`:291` "is 9.67 % **of it**";
`:302` "62 **octets** here";
`:314` "two **more** slots";
`:324` "Anchor 1 stamps **three counters:**";
`:351` "it is the **entire** exchange";
`:475` "An anchor **can** finish **the moment**";
`:487` "**The log carries** the same distance **on both lanes**".
Worst of them, `:592` quotes "**Doubling the crystal error did not cost a centimetre.**" — a whole
sentence that appears nowhere in the lesson. **Do:** re-copy each quote from the shipped strings.

**6. `tests/course/uwb-dstwr.test.ts:94–97, 274–287, 378–389` — both tables are checked as an
unordered bag of strings.** `tableCells(n)` flattens every row, and every check is `toContain`, so a
value in the wrong column or the wrong row still passes: swapping the Poll's and the Report's octet
cells, or moving anchor-3's "21.49 m" into anchor-2's row, breaks nothing. The same gap was Task 9's
finding 4. **Do:** index rows (`tables[n].rows[i][j].en`) and assert cell by cell; the measured
values are already in hand at both sites.

**7. `tests/course/uwb-dstwr.test.ts:194–217` — the scene is pinned to literals, not to lesson 2's
scene, although the report claims "the two scenes cannot drift apart silently."** The src-level rule
(no lesson imports another lesson) does not bind the test, and `uwbSstwrScenario` is exported
(`src/course/uwb/uwb-sstwr.ts:36`). Today the two coordinate lists are identical; if lesson 2's ring
moves, this lesson's "the scene is unchanged" (`:52`), "exactly lesson 2's raw SS-TWR estimate"
(`:73`) and the 9.51 / 15.47 / 21.49 / 27.42 column silently become false. **Do:** one assertion —
`strip(uwbDstwrScenario(p))` equals `strip(uwbSstwrScenario(p))` with `uwb.method` removed — reusing
the `strip()` helper already at `test:228`.

**8. `src/course/uwb/uwb-dstwr.ts:111` — "an obstructed first path delays both round trips alike, so
that bias passes through intact" is never exercised.** The scene is `nlos: false` and no test in the
file ever runs with `nlos: true`, so the one claim the lesson makes about what DS-TWR *cannot* fix —
the claim that hands the learner to the positioning lesson — rests on nothing. `UWB_NLOS_NS`
(`src/uwb/phy.ts:72`) makes this a three-line check. **Do:** run `{ ...scenarioOf(), uwb: { ...SESSION,
nlos: true } }` once and assert every range is biased long by roughly the same amount the SS lesson
would see, with the sentence quoted.

**9. `tests/course/uwb-dstwr.test.ts:46–59 (with `src/course/uwb/uwb-dstwr.ts:111`) — "Three noisy
receive stamps enter each result — the anchor's of the Poll, the phone's of the Response, the
anchor's of the Final" is the test's own model, validated only through a ±25 % band.** `dsSigmaM`
encodes that sensitivity vector, and the 100-seed RMS check (`test:553–569`) would still pass if the
engine also noised the *transmit* stamps, or noised a fourth stamp, at this magnitude — the measured
slot-3 RMS is already 10 % off the prediction inside a 25 % window. The derivation is correct (I
checked it), but the "which three stamps" claim is the load-bearing part and it is not pinned.
**Do:** assert directly that the tx counters are noise-free — e.g. that `txPoll`, `txResp`,
`txFinal` land on the exact `clock.counter(trueNs)` of their slot boundary across seeds, while the
rx counters scatter — which pins the sentence rather than its consequence.

**10. `src/course/uwb/uwb-dstwr.ts:60` — the Final's payload claim is pinned by size only.** "carrying
per anchor its Tround1 in the RMI IE and Treply2 = txFinal − rxResp in an RRTI IE" is a statement
about `frame.uwb.finalTimes` and `frame.uwb.ies` (`src/uwb/frames.ts:66`), and nothing reads either.
Note the engine's RMI *value* string prints both `tround1` and `treply2` per anchor
(`src/uwb/frameFields.ts:92–94`), so the split the lesson draws is tidier than what the inspector
renders. **Do:** read the Final off `TX_START` and assert `uwb.ies`, `uwb.finalTimes.length === 4`
and that each entry's `tround1`/`treply2` equal the `fourTimes()` values the lesson already pins.

**11. `src/course/uwb/uwb-dstwr.ts:8, 13` — two header claims are slightly wrong.** (a) "Every number
quoted below is pinned in tests/course/uwb-dstwr.test.ts" over-claims while findings 3, 4, 8, 9 and
10 stand — it becomes true once they are closed. (b) "The prose below totals 1710 words, so there is
room for fifteen more and no more": 1710 is right (independently recomputed), but the ceiling is
1724, not 1725 — at 1725 `raw` is exactly 27.5, `Math.round(5.5)` rounds up, and `lessonMinutes`
becomes 30. So the headroom is **fourteen** words.

**12. `tests/course/uwb-dstwr.test.ts:84, 360` — two small test nits.** `:84` destructures anchor
`UWB_TS` records positionally (`a[0], a[1], a[2]`) for every anchor, but the rx/tx ordering is pinned
for `anchor-1` only (`test:328–329`); `fourTimes('anchor-3')` would silently read the wrong stamps if
the order ever changed on one lane. `:360` writes the 20 ms total as `2 * PLAN.roundNs / 2`, which
evaluates to `PLAN.roundNs`; the intent ("10 ms twice") is lost in a no-op. **Do:** filter by
`dir`/`frameKind` in `fourTimes`, and write `2 * (PLAN.roundNs / 2)` or just `PLAN.roundNs`.

---

## Claim → pin table

Every number and empirical sentence in the EN body / observe / tryThis / quiz that is **unpinned or
weakly pinned**. Claims not listed here were verified as pinned (see "What was verified as correct").

| # | Claim (file:line) | Pin today | Verdict |
|---|---|---|---|
| 1 | "the only one that grows with the anchor count" (`:103`) | none | **false** — `uwbPollBytes = 27 + 3N` (`phy.ts:94`). Blocking 1 |
| 2 | "The Final is the largest frame" (`:103`) | implied by the four table literals | weak — no max assertion. Fold into Blocking 1 |
| 3 | "four RRTI IEs of 6 holding the four Treply2 values" (`:139`) | `4 * RRTI_IE_BYTES` in a byte sum (`test:309`) | **contradicted by the renderer** — one 24 B `ieRrti` (`frameFields.ts:82`). Blocking 2 |
| 4 | "one RMI IE of 27 holding four Tround1 values" (`:139`) | `rmiFinalIeBytes(4) === 27` (`test:307`) | weak — the IE also carries treply2 (`frameFields.ts:92`) |
| 5 | `Tprop = (T1·T2 − r1·r2)/(T1+T2+r1+r2)` formula block (`:66`) | none on the block; `test:437` re-types it | weak — Minor 3 |
| 6 | "the 40-bit ranging counter, where the standard asks for at least 32" (`:48`) | substring of its own sentence (`test:188`) | unpinned — `COUNTER_BITS` not imported. Minor 4 |
| 7 | "the Final's RMI IE is 3 + 6N octets" (`:48`) | `rmiFinalIeBytes(4) === 27` only | weak at one N. Minor 4 |
| 8 | "Tround1 in the RMI IE and Treply2 … in an RRTI IE" (`:60`) | byte sizes only | weak — `uwb.ies`/`finalTimes` unread. Minor 10 |
| 9 | "an obstructed first path delays both round trips alike … that bias passes through intact" (`:111`) | none | unpinned — no `nlos: true` run. Minor 8 |
| 10 | "Three noisy receive stamps enter each result — the anchor's of the Poll, the phone's of the Response, the anchor's of the Final" (`:111`) | the test's own `dsSigmaM` + ±25 % RMS band | weak — Minor 9 |
| 11 | "(Tround1 − Treply1)/2 is exactly lesson 2's raw SS-TWR estimate" / "The scene is unchanged" (`:52`, `:73`) | this lesson's own literals `9.51/15.47/21.49/27.42` (`test:379`) | weak — no cross-pin to `uwbSstwrScenario`. Minor 7 |
| 12 | "wrong by the same ramp of 6 m per slot of waiting" (`:73`) | recomputed from ppm + slot and pinned to `(6·i).toFixed(1)`, measured within 0.15 m (`test:396–404`) | pinned |
| 13 | "twice the wake-ups" / "latency and energy … both roughly double" (`:103`, `:171`) | slots 10 vs 5, round 20 ms vs 10 ms (`test:239–243`, `:298`) | pinned by proxy; acceptable |
| 14 | "almost two milliseconds later" (`:107`) | gap in (1.9 ms, 2 ms) (`test:482–483`) | pinned |
| 15 | table cell *positions* in both tables (`:80–83`, `:96–100`) | bag membership via `toContain` | weak — Minor 6 |
| 16 | "1710 words … room for fifteen more" (header `:13`) | `lessonMinutes` band (`test:124–125`) | off by one — ceiling is 1724. Minor 11 |

Counts: **2 blocking, 10 minor.**

---

## Re-review (fix round 1)

Reviewed: commit `e559d8e` (review package `task-10-fix1.diff`), scoped to the twelve findings above
plus regression. Two files changed, `src/course/uwb/uwb-dstwr.ts` (prose and header only) and
`tests/course/uwb-dstwr.test.ts`; `git status` clean; the hash fixture was correctly left alone.

### Commands run

- `npx vitest run tests/course/uwb-dstwr.test.ts tests/engine/lesson-hashes.test.ts`
  → **2 files / 39 tests passed** (uwb-dstwr 38, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, exit 0.

### Verdict

Spec: APPROVED
Quality: APPROVED

### Ruling by ruling

**Blocking 1 — closed, and pinned.** The prose is now "The Final is the largest frame, and the one
that grows fastest with the anchor count: 14 + 12N octets against the Poll's 27 + 3N" (`:104`), ZH
"…也是随锚点数增长最快的帧：14 + 12N 字节，而 Poll 是 27 + 3N" (`:105`) — both true against
`src/uwb/phy.ts:94–105`, and the exclusivity claim is gone from both languages. The new test pins
`Math.max(...sizes) === uwbFinalBytes(4)`, `uwbFinalBytes(n) === 14 + 12n` **and**
`uwbPollBytes(n) === 27 + 3n` for n ∈ {3,4,5}, the two deltas (3 against 12), and that the Response
and the report do not grow at all. Both halves of the surviving sentence — "largest" and "fastest" —
are now guarded.

**Blocking 2 — closed, and pinned against the renderer, not the arithmetic.** tryThis 2 now reads
"62 octets in two IE rows — an RMI IE of 27 listing four anchors and one RRTI IE of 24 holding the
four Treply2 values, 6 each" (`:140`), ZH "分两行 IE：一个 27 字节的 RMI IE 列出四个锚点，一个 24 字节
的 RRTI IE 装着四个 Treply2，每个 6 字节" (`:141`); body step 3 is reworded to one RMI IE and one RRTI
IE in both languages (`:61–62`). The new test decodes the **run's own** Final through
`uwbFrameFields` and asserts the IE rows are exactly `[{ieRmi, 27}, {ieRrti, 24}]`, ties each to
`rmiFinalIeBytes(4)` / `4 × RRTI_IE_BYTES`, and pins the RRTI `value` string "4 reply times
(treply2), one per anchor" — i.e. exactly what the learner will see. The report frame gets the same
treatment (`[{ieRmi, 13}]`). This is the strongest form the finding asked for; the vaguer "listing
four anchors" also sidesteps the fact that the engine's RMI value string prints treply2 as well.

**Minors 3–12 — all closed.** 3: exactly one `formula` block, its `text.en` asserted character for
character, `zh === en`, and `dsTwr` shown to reproduce the printed expression on three quadruples.
4: `COUNTER_BITS` imported and pinned to 40 and ≥ 32; `rmiFinalIeBytes(n) === 3 + 6n` over
n ∈ {3,4,5}; the two IE-width constants and the session's `tsNoisePs` / `slotNs` back the rest of the
sentence, with the sentence itself quoted verbatim. 5: I re-ran my own check — every `“…”` fragment
in every guard comment of the test file now appears verbatim in a shipped lesson string
(**0 mismatches**, against 9 before); the stale "Doubling the crystal error did not cost a
centimetre." is gone, and comments that describe rather than quote no longer use quotation marks.
6: both tables are checked by `cell(table, row, col)`; table 0's head row and row count are pinned
too, so a value in the wrong column now fails. 7: `is lesson 2's scene to the letter` compares
`JSON.stringify` of `uwbDstwrScenario(p)` and `uwbSstwrScenario(p)` with `uwb.method` normalised, for
both ppm pairs, and pins the two methods — a test-level import only; lesson 2 is untouched.
8: see below. 9: `only the receive stamps carry noise` pins that the tag's txPoll→txFinal span is
identical on eight seeds while all four intervals that cross a receive stamp scatter by more than
zero and less than 8 σ, and that anchor 1's rx stamps are exactly `['uwbPoll','uwbFinal']` plus the
phone's one `uwbResp` — the sentence's "three receive stamps", asserted. 10: the Final's `uwb.ies`,
`finalTimes` and each entry's `tround1`/`treply2` are matched to `fourTimes()`, and the report's
`ies`/`reportTimes` likewise. 11: the header now states the 1724 ceiling and the 1725 tipping point,
and the study-time test pins `lessonWords ≤ 1724` and demonstrates the 1725 case. I recomputed
`lessonWords` independently: **1707**, so "room for seventeen more" is exactly right
(1707 + 17 = 1724) and `lessonMinutes` = **25**, inside the [15, 25] band. 12: `fourTimes` now
resolves every counter through `stamp(rs, node, dir, frameKind, peer?)` — no positional indices — and
takes the record stream as an argument; the `2 * PLAN.roundNs / 2` no-op is now an explicit
`halfNs`, pinned to 10 ms.

**The NLOS derivation is correct.** The old sentence is replaced by "an obstructed first path delays
all three stamps, and the formula adds that delay straight to the range" (ZH: "会把这三个时间戳一起
推迟，而公式会把这段延迟直接加到距离上"). I re-derived it independently: with every receive stamp late
by δ, tround1 and tround2 each gain δ while treply1 and treply2 each lose δ, so the denominator
T1 + T2 + r1 + r2 is unchanged and the numerator becomes
(T1+δ)(T2+δ) − (r1−δ)(r2−δ) = (T1·T2 − r1·r2) + δ·(T1+T2+r1+r2) — the δ² terms cancel exactly — hence
the estimate is **Tprop + δ**, not Tprop + δ/2 and not Tprop. The new test reproduces that through
`dsTwr` for all three `UWB_NLOS_NS` materials × four slots, in RCTU and in metres, and pins one brick
wall at 0.60 m (2.0 ns × c = 0.5996). The premise also holds in the engine: `nlosNs(from, to)` sums
`UWB_NLOS_NS[material]` over `wallsCrossed` (`src/uwb/channel.ts:128–131`), which is symmetric in the
two directions, and `extraNs = info.nlosNs + noise` goes into the ranging counter
(`src/uwb/device.ts:212`) — so the Poll, the Response and the Final really do pick up the same δ.

**Regression.** No `any`, no `as unknown as`, no suppression comments in either file; `tsc -b` clean.
The bilingual re-audit over all 53 `en`/`zh` pairs again shows no numeric divergence (the same four
comma-run tokenizer artefacts and nothing new), no untranslated English sentence, balanced `“ ”`, and
CJK in every ZH string outside the two formula lines. The fixture is untouched and
`lesson-hashes.test.ts` passes on it, which is right: the changes are prose and tests only. Nothing
from the first-round "verified as correct" list was weakened — every earlier assertion survives or
was strengthened (38 tests, up from 32).

### Remaining findings

Both are nits; neither blocks, and neither needs another round unless convenient.

**13. `tests/course/uwb-dstwr.test.ts` (frame-table test, `Round total` row) — the Count cell is
pinned to `PLAN.slots` rather than to the sum of the column it totals.** The column header is
"Count" / "数量" and its four data cells are frame counts (1, 4, 1, 4); the total cell is asserted as
`String(PLAN.slots)` and the comment calls it "10 slots". The two are equal by construction in a DS
round (2N + 2 frames in 2N + 2 slots), so nothing is wrong today, but the assertion tests a different
quantity from the one the cell prints. **Do:** pin it to `rows.reduce((s, [, , n]) => s + n, 0)`, and
while there, assert table 1's head row the way table 0's now is.

**14. `src/course/uwb/uwb-dstwr.ts:112` — the NLOS premise is verified by reading the engine, not by
running it.** The arithmetic half of the claim is pinned exactly (above), and `UWB_NLOS_NS` is
imported rather than retyped; the remaining link — that the engine puts the *same* δ on all three
receive stamps — rests on `channel.ts:128–131` and `device.ts:212`, which I checked by hand. Note
that a real `nlos: true` run cannot pin it in *this* scene: `oneRoom()`'s walls are the perimeter, so
no wall separates the tag from any anchor and δ would be 0. The synthetic pin was therefore the right
choice; this is recorded for the trail, not as a change request. If lesson 5 builds an obstructed
scene, that is the place to close it.

Counts: **0 blocking, 2 minor (both optional).**
