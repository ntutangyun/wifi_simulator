# Task 9 review — lesson 2 "The clock inside the reply time" (`uwb-sstwr`)

Reviewed: commit `c68d3a1` (review package `task-9-review.diff`, `ac21aac..c68d3a1`), against
`task-9-brief.md`, `task-9-report.md`, the controller's rulings, and the house style of
`src/course/uwb/uwb-intro.ts` / `tests/course/uwb-intro.test.ts` as committed at `ac21aac`.
Only the committed state was read: the concurrent lesson-1 fix round (`uwb-intro.ts`, its test,
`lessonKit.ts`) and lesson 3 (`uwb-dstwr.ts`, `lessons.ts`, its test, the fixture) were ignored.

## Commands run

- `npx vitest run tests/course/uwb-sstwr.test.ts tests/engine/lesson-hashes.test.ts`
  → **2 files / 24 tests passed** (uwb-sstwr 23, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, no diagnostics, exit 0 (nothing from the other agents' in-flight files either).

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

## What was verified as correct

**Scenario — exactly the brief.** `uwbSstwrScenario(ppm)` is `uwbSc(oneRoom(), …, { method: 'ss',
nlos: false })` with `anchor-1` (8.5, 4), `anchor-2` (5, 7.5), `anchor-3` (1.5, 4), `anchor-4`
(5, 0.5) and `tag-1` "Phone" (5, 4), every device at z 2.2. The test computes the 3-D hypotenuse
per anchor and pins it to 3.5 m at 12 digits (`test:130–131`), so the "every true distance is
exactly 3.50 m" claim is pinned from geometry, not asserted by hand. `oneRoom()` gives the 10 × 8 m
brick-walled Lab (`test:123–124`). Base `{ tag: 10, anchors: -10 }` → node ppm
`[-10,-10,-10,-10,10]` (`test:141`); variants `{0,0}` / `{1,-1}` with labels `Perfect crystals` /
`理想晶振` and `TCXOs, ±1 ppm` / `±1 ppm 的温补晶振` verbatim (`test:148–154`). The
"changes nothing else" claim is pinned properly: `strip()` JSON-compares each variant against the
base with only `uwb.role` retained (`test:155–157`) — a stronger pin than lesson 1 had.

**Shape and ids.** `id: 'uwb-sstwr'`, `module: 11`, 4 jumps / 4 observe / 2 tryThis / 3 quiz, all
pinned (`test:63–72`); `lessonMinutes` = 25, formula and the [15, 25] band both pinned
(`test:56–61`). `uwb-sstwr` was already in `COURSE_ORDER` from Task 8 (`curriculum.ts:73`), and
`lessons.ts` changes are exactly the import plus the `AUTHORED` entry after `uwbIntro` (2 lines).
Every jump is found in the base run, `fourthUwbRange` is a pure record predicate
(`r.type === 'UWB_RANGE' && r.peer === 'anchor-4'`), and the test additionally pins that it matches
exactly one record and that that record is index 3 of the ranges (`test:75–82`) — the brief's
"no closure counter" requirement, honoured and guarded.

**Controller rulings, both honoured.** (a) The residual is `½·Treply·σ_cfo`: the lesson states
3.0 cm per ms of reply and 6.0 → 24.0 cm of 1-σ over slots 1–4, and the test pins all three
(`test:298–301`) and bounds each corrected error by `3 × Math.hypot(residualSigmaM(i+1), SIGMA_R)`
per slot (`test:302–305`, and again across all three crystal settings at `test:358–367`). This is
the right pin: it grows with the slot, so a regression in the correction at anchor 1 cannot hide
behind anchor 4's width. (b) `replyRctu` lives on the anchor's clock: `test:204–211` asserts
`treplyNs ≈ trueNs × (1 − 10e-6)` per slot and the corollary that half the shortfall is 3 m per
slot, with the comment explaining that the tag's own +10 ppm on Tround supplies the other half.
Both prose and test say it.

**The raw-error formula against the measurement.** `test:237–240` recomputes
`Tprop·eA + ½·Treply·(eA − eB)` per anchor from `metresToNs(RING_M)` and asserts each measured raw
error is within 0.15 m (≈ 3.5 σ_r) of it; `test:215–226` recomputes the same expression and asserts
its `.toFixed(1)` equals `(i × 6).toFixed(1)` *and* that the four strings `"6.0 m"` … `"24.0 m"`
appear among the table cells, plus the four `"i ms − Tprop"` Treply cells. The algebra in the
`formula` block is correct (substituting `Tround = Treply + 2·Tprop` into
`(Tround(1+eA) − Treply(1+eB))/2` gives exactly `Tprop + Tprop·eA + ½·Treply·(eA − eB)`).

**The corrected formula and its sign convention.** The prose's `(Tround − Treply·(1 − Coffs)) / 2`
is asserted to appear in a `formula` block and matched against `ssTwrCorrected`
(`src/uwb/ranging.ts:9–11`) at `test:269–278`, including `ssTwrCorrected(t, r, 0) === ssTwrRaw(t, r)`
and a worked case at `coffs = −20e-6` that recovers 3.5 m. The convention the lesson states
("the responder's clock rate relative to the initiator's … positive when the responder runs fast")
matches the engine: `coffs = (info.txPpm − this.clock.ppm) · 1e-6 + noise`
(`src/uwb/device.ts:218`), i.e. `eB − eA` = −20 ppm here. A first-order expansion confirms the
lesson's claim that only `Tprop·eA` (35 µm) survives the correction.

**The 0 ppm variant and the TCXO variant.** `test:336–340` pins the perfect-crystal raw errors
(1.9 / −1.9 / 0.7 / −6.1 cm), bounds each by 0.15 m and by 2 σ_r, and pins σ_r = 4.2 cm from
`rangeSigmaM`. `test:348–352` pins the TCXO raw errors and checks each against the same formula at
2 ppm, whose `.toFixed(2)` equals `((i+1) × 0.5996).toFixed(2)` — the "≈ i × 0.60 m" the lens asks
for.

**Log lines and counters.** `fmtRecord` is quoted verbatim for all four ranges (`test:284–289`), the
cm-level corrected errors are pinned as strings (`test:290`), the consecutive raw steps 5.96 / 6.02 /
5.93 (`test:246`), anchor-1's two counters and their `counterDiff` = `replyRctu` = 127 793 174 RCTU
(`test:256–260`), and the tag's raw ToF is recomputed through `ssTwrRaw` of the two counter
differences (`test:262`). The FoM byte is decoded field by field against `fomDecode`/`fomText` and
all eight rx `UWB_TS` lines are checked to carry the string (`test:312–327`); `FOM_LEVEL_PCT[6] = 97`,
`FOM_INTERVAL_NS[2] = 1`, `FOM_SCALE[0] = 0.5` in `src/uwb/phy.ts:114–116` agree with the prose.

**Timeline.** Poll at 0 ns, four `RX_START` at 12 ns, `Math.ceil(11.675) = 12`, responses at
2/4/6/8 ms, one `UWB_ROUND` of 5 slots × 2 ms, `UWB_SLOT` at 0/2/4/6/8 ms — all pinned
(`test:160–181`).

**Bilingual fidelity.** A mechanical pass over all 46 `en`/`zh` pairs found **no numeric
divergence**: the seven raw flags are all tokenizer artefacts (EN list commas "2, 4, 6 and 8" merged
into one token vs ZH's "2、4、6、8"; EN spelling "three bits"/"two bits" as words where ZH uses
digits; trailing full stops). Curly quotes balance in every string, both languages. Every ZH string
contains CJK except the two `formula` blocks, which are language-neutral by design (the same
exemption Task 8 took). The only Latin run inside ZH is the deliberate terminology gloss
`（ranging tracking offset）` / `（ranging tracking interval）` in the sources sentence. The
source-status sentence is present in both languages (`uwb-sstwr.ts:50–51`) and names
`IEEE Std 802.15.4-2024`, §10.29.1.2.2, §10.29.1.6 and §16.4.9, plus the three model numbers
(100 ps, 0.2 ppm, the 2 ms FiRa slot) — all six pinned at `test:105–115`.

**Word budget.** `lessonWords` = **1707**, independently recomputed here; the header's stated 1707
and "seventeen more words" of headroom before the 1725 ceiling are both accurate.

**Fixture.** `tests/fixtures/lesson-hashes.json` gains exactly `"uwb-sstwr"`, `"uwb-sstwr#0"` and
`"uwb-sstwr#1"`; the hunk is pure `+` and no existing key or value is touched. The three hashes
being equal is correct and explained (the variants change counter values, not event timing) — it
does mean the hash fixture cannot tell the three scenarios apart, but `test:150–157` does, so the
coverage is not actually lost.

**Quality baseline.** No `any`, no `@ts-ignore`/`@ts-expect-error` in either new file. Constants are
imported, not retyped: `C_M_PER_NS`, `RCTU_NS`, `UWB_PPM_MAX`, `FOM_LOS`, `fomDecode`, `fomText`,
`metresToNs`, `rctuToMetres`, `ssTwrRaw`, `ssTwrCorrected`, `counterDiff`, `rangeSigmaM`,
`OBSERVE_MINUTES`, `TRY_MINUTES`. `cfoNoisePpm` and `tsNoisePs` are pinned through the scenario's
session (`test:136`), which is the engine's `DEFAULT_UWB_SESSION` — equivalent to importing them.
Nearly every assertion carries the sentence it guards in a comment above it.

---

## Findings

### Blocking

**1. `src/course/uwb/uwb-sstwr.ts:128` (EN and ZH) — "a twentieth of the base offset" is a
factor-of-two wrong, and the same sentence pair contradicts itself.** The TCXO experiment opens
"Now load “TCXOs, ±1 ppm”, **a twentieth** of the base offset" (ZH: "偏差只有基准场景的**二十分之一**"),
then states the measured consequence "still about 0.60 m per slot", then closes "Better crystals buy
**an order of magnitude**" (ZH: "一个数量级"). The base scene is ±10 ppm per device, `eA − eB` =
20 ppm; the TCXO scene is ±1 ppm per device, `eA − eB` = 2 ppm. That is **a tenth**, on either
reading, and the ramp the lesson itself pins confirms it: 0.5996 m per slot against 5.996 m per slot
(`test:350–351` vs `test:194–196`). A learner who divides 6.0 by 0.60 gets 10 and is told 20 two
sentences earlier. `tests/course/uwb-sstwr.test.ts:354` repeats the error in a comment ("a twentieth
of the base offset gives a twentieth of the ramp") while the assertion under it
(`Math.abs(rawErr(rs[3])) > RING_M / 2`) checks no ratio at all, so nothing can fail on it.
**Do:** change "a twentieth" → "a tenth" and "二十分之一" → "十分之一", fix the test comment, and add a
ratio assertion, e.g. `expect(rawErr(ranges(1)[i]) * 10).toBeCloseTo(rawErr(ranges()[i]), 1)` or a
pin that `0.5996 × 10` reproduces the base slot cost.

**2. `src/course/uwb/uwb-sstwr.ts:122` (EN and ZH) — observe 2's "Each reports about 3.4 m
corrected" is false for anchor 4, which the lesson pins at 3.51 m.** The four corrected readings are
3.45, 3.42, 3.41 and **3.51** m, asserted verbatim through `fmtRecord` at `test:284–289`; ZH carries
the same claim ("每一条修正后都报出 3.4 m 上下"). The drift is not cosmetic: quiz 3
(`uwb-sstwr.ts:152–159`) turns entirely on anchor 4 being the *most* accurate of the four at +0.5 cm,
i.e. 3.51 m against a true 3.50 m, so the observe line quietly denies the fact the quiz is built on.
Nothing guards the phrase. **Do:** say "between 3.41 and 3.51 m" (or "about 3.4–3.5 m") in both
languages, and pin it — `expect(ranges().every(r => Math.abs(r.distM - RING_M) < 0.10)).toBe(true)`
with the sentence quoted, or assert the min/max of the corrected column.

### Minor

**3. `src/course/uwb/uwb-sstwr.ts:86` — "Here Coffs sits near −20 ppm" is not pinned against the
engine's own Coffs.** The sign convention *is* right (`src/uwb/device.ts:218` computes
`(info.txPpm − this.clock.ppm)·1e-6`, so the responder-fast-is-positive wording holds) and a flipped
sign would break the verbatim `fmtRecord` lines, so the claim is caught indirectly. But the only
direct assertion is synthetic — `ssTwrCorrected(tround·(1+10e-6), treply·(1−10e-6), -20e-6)` on
hand-built arguments (`test:277`) — and `coffs` appears on no record
(`src/uwb/records.ts:16`), so the number the learner is told to expect is never read back from the
run. **Do:** recover it from the run and assert it, e.g.
`coffsEst = 1 − (tround − 2·tofRctu) / replyRctu` per range, expected within a few σ of −20e-6, with
the sentence quoted; this also pins "the simulator carries it on every received frame".

**4. `src/course/uwb/uwb-sstwr.ts:76–79` — the table's "Raw range" and "Raw error" cells are not
string-asserted, while the "Predicted error" and "Treply" cells of the same table are.**
`test:219–225` checks `cells` contains `"6.0 m"` … `"24.0 m"` and `"2 ms − Tprop"` … ; the measured
values are pinned separately as `['9.51','15.47','21.49','27.42']` / `['6.01','11.97','17.99','23.92']`
(`test:234–235`), but nothing ties those to the ten table cells that print them. Editing a cell to
`9.61 m` breaks nothing. The same gap covers the prose "believes it is 9.51 m from one and 27.42 m
from another" (`uwb-sstwr.ts:82`) and observe 2's `9.51 → 15.47 → 21.49 → 27.42` (`:122`).
**Do:** extend the existing `cells` check to the eight raw cells, built from the measured values
(`expect(cells).toContain(\`${rctuToMetres(r.tofRawRctu!).toFixed(2)} m\`)`), which pins prose and
measurement to each other rather than to two independent literals.

**5. `tests/course/uwb-sstwr.test.ts:78` — the assertion comment quotes a jump label that no longer
exists.** It reads `// "the fourth range, 24 m long"`; the shipped label is
`the fourth range: raw is 24 m long` (`uwb-sstwr.ts:118`), reworded per report deviation 3. The house
rule is that an assertion quotes the sentence it guards, so a stale quote is exactly the drift the
rule exists to prevent. **Do:** update the comment (and consider pinning the four jump labels, since
two of them now assert an empirical fact — "raw is 6 m long" / "raw is 24 m long" — that nothing
checks against `rawErr`).

**6. `tests/course/uwb-sstwr.test.ts:193` — the assertion's rounding disagrees with the phrase it
guards.** The prose says the 2 ms reply is "a hundred and seventy thousand times the flight"
(ZH "十七万倍"); the test asserts `Math.round((2·MS)/tpropNs/1000)·1000 === 171_000`. The true ratio
is 171 306, so both are defensible roundings — but the assertion cannot fail in the way the sentence
would be wrong, and it prints a number the lesson never uses. **Do:** assert the rounding the prose
actually performs, e.g. `Math.round(ratio / 10_000) * 10_000 === 170_000`.

**7. `src/course/uwb/uwb-sstwr.ts:105` — the FoM byte's two intermediate table lookups are pinned
only through their product.** The prose names "(2 → 1 ns)" and "(0 → ×0.5)"; `test:317–320` pins the
three bit-fields (6, 2, 0) and `fomDecode(0x16) → { levelPct: 97, intervalNs: 0.5 }`, which is the
*product* of the interval and the scale. A compensating change to `FOM_INTERVAL_NS` /`FOM_SCALE`
(`src/uwb/phy.ts:115–116`) keeps 0.5 ns and falsifies the two parenthetical mappings. Two one-line
`expect`s on the exported tables close it — the same shape as Task 8's finding 4.

**8. `tests/course/uwb-sstwr.test.ts:220, 238, 275, 277, 350` — the crystal offsets are re-typed as
`10e-6` / `20e-6` / `1e-6` / `2e-6` rather than derived from the scenario the test already reads.**
`test:141` asserts the node ppm array, so the two facts are consistent today, but the prediction
formula would keep predicting the old offsets if the scene changed (the `toFixed` pins would fail,
so this is a readability nit, not a hole). `SIGMA_R = rangeSigmaM(100)` at `test:26` re-types the
session's `tsNoisePs` in the same way (pinned at `test:136`). **Do:** take the ppm from
`uwbSstwr.scenario().nodes` and `tsNoisePs` from `.uwb` once, at the top of the file.

**9. `src/course/uwb/uwb-sstwr.ts:9–10` — the header's "Every number quoted below is pinned in
tests/course/uwb-sstwr.test.ts" over-claims while findings 3, 4 and 7 stand.** It becomes true once
they are closed; otherwise it should be softened. (Same class as Task 8's finding 1.)

**10. `tests/course/uwb-sstwr.test.ts:93 — one `as unknown as L10n` cast in the bilingual walker.**
Inherited verbatim from `uwb-intro.test.ts` and guarded by the `typeof` check immediately above it,
so it is safe; a typed predicate `(o): o is L10n => …` removes it. Worth fixing in both files at once
when lesson 1's fix round lands, not separately here.

---

## Claim → pin (unpinned or weakly pinned only)

Every other number and empirical sentence in the EN body / observe / tryThis / quiz has an assertion
that quotes it — including the scene geometry, the 12 ns arrival, the five 2 ms slots, the raw and
corrected ranges and their errors, the consecutive raw steps, anchor-1's counters and `replyRctu`,
σ_r, the residual sigmas, the FoM string on all eight rx timestamps, both variants' raw errors, and
the four predicted table strings. The table lists only the gaps.

| Claim (file:line) | Pin | Gap |
|---|---|---|
| "a twentieth of the base offset" / "二十分之一" (uwb-sstwr.ts:128) | none | **false** — the ratio is a tenth (0.5996 vs 5.996 m/slot); contradicts "an order of magnitude" in the same item; test:354's comment repeats it (finding 1) |
| "Each reports about 3.4 m corrected" / "3.4 m 上下" (uwb-sstwr.ts:122) | corrected column pinned at test:284–290 | **false for anchor 4** (3.51 m), which quiz 3 depends on; phrase itself unasserted (finding 2) |
| "Here Coffs sits near −20 ppm" (uwb-sstwr.ts:86) | synthetic `ssTwrCorrected(…, -20e-6)` (test:277) | the engine's own coffs is never read; not on any record (finding 3) |
| "The simulator carries it on every received frame as Coffs … positive when the responder runs fast" (uwb-sstwr.ts:86) | device.ts:218 is correct; caught indirectly by the verbatim log lines | no direct assertion (finding 3) |
| table cells "9.51 m", "15.47 m", "21.49 m", "27.42 m" (uwb-sstwr.ts:76–79) | measured values pinned at test:234 | the cell **strings** unasserted, unlike the "6.0 m" column in the same table (finding 4) |
| table cells "6.01 m", "11.97 m", "17.99 m", "23.92 m" (uwb-sstwr.ts:76–79) | measured values pinned at test:235 | same (finding 4) |
| "believes it is 9.51 m from one and 27.42 m from another" (uwb-sstwr.ts:82) | values pinned at test:234 | sentence not string-matched (finding 4) |
| jump labels "raw is 6 m long" / "raw is 24 m long" (uwb-sstwr.ts:117–118) | rawErr pinned at test:235 | labels themselves unasserted; test:78 still quotes the pre-rework label (finding 5) |
| "a hundred and seventy thousand times the flight" (uwb-sstwr.ts:65) | `…=== 171_000` (test:193) | the assertion rounds to 171 k, the prose says 170 k (finding 6) |
| "(2 → 1 ns) and (0 → ×0.5)" (uwb-sstwr.ts:105) | `fomDecode(0x16).intervalNs === 0.5` (test:320) | only the product; `FOM_INTERVAL_NS[2]`/`FOM_SCALE[0]` unasserted (finding 7) |
| "a 12 ns gap between TX_START and RX_START" (uwb-sstwr.ts:54) | `Math.ceil(11.675) === 12` (test:166) and `r.t === 12` (test:174) | pinned; noted only because Task 8 finding 3 (ceil vs round) is still open in `src/uwb/channel.ts` and this lesson inherits the same rounding claim implicitly — no action here |

Counts: **2 blocking, 8 minor.**

---

## Re-review (fix round 1)

Reviewed: commit `8defe87` (`task-9-fix1.diff`), touching only `src/course/uwb/uwb-sstwr.ts`
(16 lines) and `tests/course/uwb-sstwr.test.ts` (191 lines). `lessons.ts` and
`tests/fixtures/lesson-hashes.json` are untouched by this commit, as the report says; lesson 3's
uncommitted work was ignored.

- `npx vitest run tests/course/uwb-sstwr.test.ts` → **27 tests passed** (was 23), exit 0.

### Verdict

Spec: APPROVED
Quality: APPROVED

### Each ruling, checked

**Blocking 1 — gone in both languages and pinned.** `uwb-sstwr.ts:130` now reads "a tenth of the
base offset — eA − eB falls from 20 ppm to 2 ppm" / "偏差只有基准场景的十分之一——eA − eB 从
20 ppm 降到 2 ppm". The ratio is derived from the two scenes, not asserted by hand: `ppmOf()` reads
`{ tag, anchors, delta }` off each scenario's nodes and the new test pins
`BASE_PPM.delta / TCXO_PPM.delta === 10`, both languages' wording (`'a tenth of the base offset'`,
`'十分之一'`, and the interpolated `from ${BASE_PPM.delta} ppm to ${TCXO_PPM.delta} ppm`), the
formula's per-slot ratio ≈ 10 for all four slots, and 0.60 vs 6.00 m per slot. A second pin was
added on the measured column: `|rawErr(tcxo)·10 − rawErr(base)| < 1.5 m` per anchor, which does
discriminate the wrong factor (a true ratio of 20 would put that difference at ~3 m). The stale
"a twentieth … gives a twentieth" comment is gone.

**Blocking 2 — gone in both languages and pinned.** Observe 2 now reads "The corrected figures stay
between 3.41 and 3.51 m" / "修正后的读数都落在 3.41 与 3.51 m 之间". The new test derives the min
and max of the corrected column from the run, asserts `['3.41', '3.51']`, and asserts both language
strings contain them — so the sentence cannot drift from the run in either direction. It also pins
quiz 3's premise directly (`err.indexOf(Math.min(...err)) === 3`), which is what the old prose
denied.

**Minors 3–10, all implemented.** (3) Coffs is recovered from the run by inverting `ssTwrCorrected`
— `Coffs = (2·tof − Tround + Treply) / Treply`, algebraically correct — and pinned per anchor within
5 σ of `eB − eA` and to −20 ppm at whole-ppm rounding; the synthetic worked case now builds `eA`/`eB`
from `BASE_PPM`. (4) All five cells of all four table rows are asserted against the run
(`row[0] === r.peer`, the Treply string, predicted = the formula to one decimal, raw range and raw
error from `tofRawRctu`), and the prose "believes it is 9.51 m from one … 27.42 m from another" plus
observe 2's `9.51 → 15.47 → 21.49 → 27.42` chain are now built from the same measured values and
`toContain`-ed — the brief's "four quoted strings appear in the table" requirement is still met, now
by exact cell equality. (5) The stale jump-label comment is corrected and all four labels are pinned,
with `Math.round(rawErr)` = 6 and 24 for the two that quote a number. (6) The ratio assertion now
rounds to 170 000, the figure the prose speaks, with 171 306 named in the comment. (7) The FoM
interval and scale lookups are separated as far as the module's public surface allows. (8)
`ppmOf(variant)` and `SESSION = uwbSstwr.scenario().uwb!` replace all five hand-typed
`10e-6`/`20e-6`/`1e-6`/`2e-6` and `rangeSigmaM(100)`; `predictedRawErrM(slot, ppm)` is now the one
place the raw-error formula lives, and the literal values are still pinned once at the scene test.
(9) The header now names what "every number is pinned" covers. (10) `as unknown as L10n` is replaced
by the typed `isL10n` predicate.

### Nothing regressed

`lessonWords` recomputed independently: **1716**, so `lessonMinutes` = 25 (pinned ≤ 25 by the
passing study-time test) and the header's "room for eight more" is accurate. A fresh mechanical pass
over all 46 EN/ZH pairs again finds **no numeric divergence** (the seven raw flags are the same
tokenizer artefacts as in the first review: EN list commas, "three bits"/"two bits" spelled as words
against ZH digits, trailing full stops), curly quotes balance in every string, and the only Latin run
inside ZH is still the deliberate `（ranging tracking offset）` gloss. The two prose tightenings made
to pay for the longer sentences ("measures not distance but how long…", "the next lesson's
double-sided exchange") change no claim and are mirrored in ZH. The scenario is byte-identical, so
`uwb-sstwr`, `uwb-sstwr#0` and `uwb-sstwr#1` cannot have moved off `774c9dd5`.

### Remaining findings

None blocking. Two nits, neither worth another round:

**N1. `tests/course/uwb-sstwr.test.ts` — observe 2's span takes its min and max by lexicographic
comparison of the formatted strings** (`shown.reduce((a, b) => (a < b ? a : b))` over
`distM.toFixed(2)`). Correct for these four values, which all share the `3.4x` / `3.5x` shape, but it
would silently pick the wrong extreme if a corrected reading ever left [1, 10). Comparing the numbers
and formatting afterwards is the same number of lines.

**N2. The FoM pin still rests on one unasserted assumption.** `fomDecode((FOM_LOS & 0x1f) | (1 << 5))
=== 1 ns` pins *interval index 2 × scale index 1*, i.e. it assumes scale index 1 is the identity.
`FOM_INTERVAL_NS` and `FOM_SCALE` are module-private in `src/uwb/phy.ts:115–116`, so this is the
finest grain the exported surface allows; fully closing it means exporting the two tables. Acceptable
as shipped.

Counts: **0 blocking, 2 nits.**
