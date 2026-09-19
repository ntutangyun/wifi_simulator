# Task 5 review — UWB tier 2 seam and the lesson "Sharing 6 GHz"

Reviewed: `task-5-brief.md`, `task-5-report.md`, `task-5-review.diff` (commit `16e4711` only; the
`f893c70` plan docs are out of scope). Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`,
branch `feat/uwb-ranging`, head `16e4711`, tree clean. Review only — nothing was edited.

## Verdict

- **Spec: APPROVED**
- **Quality: CHANGES REQUIRED**

## Gates

| Command | Result |
|---|---|
| `npx vitest run tests/course/uwb-coexist.test.ts tests/course/lessons.test.ts tests/engine/lesson-hashes.test.ts` | 3 files, **71 tests, all passing** (exit 0) |
| `npx tsc -b` | clean (exit 0) |
| `grep` for `: any` / `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error` across the four changed source+test files | no hits |

## Spec conformance (all satisfied)

- Course placement: `TIERS[5] = { track: 'uwb', … }`, `MODULES[13]` Coexistence / 共存,
  `MODULES[14]` Other ranging modes / 其他测距模式, both `tier: 5`; `COURSE_ORDER` gains the five
  ids after `uwb-position`; the four unauthored ids are skipped by `orderLessons` and the test
  proves `LESSONS` ends `… uwb-position, uwb-coexist` and contains none of the other four
  (`tests/course/uwb-coexist.test.ts:234-249`).
- `wifi6g(id, name, x, y, profile)` kit builder at `src/course/lessonKit.ts:157-170` with
  `LESSON_6G_WIDTH_MHZ = 80`, `linkId: '6g'`, `eht`, `{ edca, txop, ampdu }`. No `opts` parameter
  (report deviation 4) — correct call: untested surface avoided.
- Scenario matches the brief with the accepted rulings: base laptop `backup`, variants
  "UWB on channel 9" / "Wi-Fi on channel 7 (5 985 MHz)" / "Saturated upload" / "No UWB", all four
  labels bilingual and pinned (`tests/course/uwb-coexist.test.ts:268-296`); AP built by `node(...)`
  at 20 dBm with `caps.widthMhz = 80` and no `linkId`; UWB nodes listed last; geometry identical to
  lesson 5's, `sixGhzCenterMhz: 6305`, DS-TWR + NLOS + channel 5.
- `id: 'uwb-coexist'`, `module: 13`, 4 observe / 2 tryThis / 3 quiz / 5 jumps, `lessonMinutes` 25
  with the 1724-word ceiling pinned, all four variants pass `ScenarioSchema`.
- Fixture: **additions only**, exactly five `uwb-coexist*` keys, no existing hash touched
  (diff `tests/fixtures/lesson-hashes.json`, 5 `+` lines, 0 `-`).
- Predicates are pure and total: `firstInterfered` and `firstThreeAnchorFix`
  (`src/course/uwb/uwb-coexist.ts:34,36`) are single-record type/field tests; the other three come
  from `lessonKit`. No closure state, no side effects.
- ZH parity: every learner-visible `L10n` has non-empty `zh`, and all numbers match EN (see minor 5
  for three EN/ZH content asymmetries).
- `tests/course/lessons.test.ts` changes (diff lines 609-651) only update structural counts
  (`TIERS` 6 long, `MODULES.map(tier)` gains `5, 5`, two `trackHeadings` expectations). No
  assertion weakened; the "alternating tracks" and "wifi-only" cases are untouched.
- Ground truth re-checked against the engine, not the report: `UWB_SIR_MIN_DB = -12`,
  `UWB_MAX_INPUT_DBM_PER_MHZ = -45`, `UWB_BAND_MHZ[5] = {6240, 6739.2}`, `uwbBandOverlap` is the
  overlap divided by the **Wi-Fi** width (so 1.00 here), `wifiToUwbPathLossDb` = `PL0_DB` +
  `30·log10 d` + 1.2 dB, `uwbToWifiPathLossDb` = `uwbPl0Db(ch)` + `20·log10 d`
  (`src/engine/spectrum.ts:36-45`). The quiz-2 claim that foreign energy *is* in the energy-detect
  sum but never a detectable preamble is exactly `src/engine/channel.ts:479-488`.

## Findings

### 1 — BLOCKING · the CCA claim is not distance-qualified, and one form of it is false
`src/course/uwb/uwb-coexist.ts:98-99` (body, EN+ZH) and `:180` (quiz 2 `explain`, EN+ZH).

**What.** The body ends "…18.57 dB below the −62 dBm energy-detect threshold, so CCA never reports
busy because of a UWB frame. Carrier sense misses the session entirely." The quiz explanation goes
further: "it is simply far too small, **by 18.57 dB at the loudest point in the room**" / "在房间里
最响的那一点也还差 18.57 dB".

**Why.** −80.57 dBm is the loudest level at *a Wi-Fi radio in this scene* (the router, 3.14 m from
the tag) — which is what the test actually pins (`tests/course/uwb-coexist.test.ts:391-396`,
"every UWB node against both Wi-Fi radios"). It is not the loudest point in the room. Solving
`−21.95 − (48.69 + 20·log10 d) = −62` gives **d = 0.37 m**: any point inside ~37 cm of a UWB node
is above the ED threshold, and the room contains such points. This is the exact overreach commit
`caef9db` was made to remove from the Guide, which now reads "past about 40 cm a UWB frame's
in-band power falls below the −62 dBm energy-detect floor, so **at any realistic spacing**…"
(`src/ui/Guide.tsx:201-202`, ZH `:385`). The lesson is the Guide's own reference for this
paragraph and currently contradicts it.

**What to do.** (a) Qualify the body sentence the way the Guide does — e.g. "…so at these
distances CCA never reports busy because of a UWB frame; a Wi-Fi radio would have to come within
about 40 cm of one to trip it" — with the matching ZH. (b) Replace "at the loudest point in the
room" / "在房间里最响的那一点" with "at the nearest Wi-Fi radio in this room, 3.14 m from the tag"
/ ZH equivalent. (c) Pin the cutoff, so the two texts cannot drift again: assert that the distance
at which `uwbInBandDbm(…) − uwbToWifiPathLossDb(d, 0, 5)` crosses `CCA_ED_DBM` is 0.37 m and that
the lesson (and the Guide) quote it as "about 40 cm".

### 2 — minor · "identical, field for field" / "to the last field" overstates what is pinned
`src/course/uwb/uwb-coexist.ts:102-103` and `:152-153`; pin at
`tests/course/uwb-coexist.test.ts:86-92`.

**What.** The prose says the Wi-Fi record stream "is identical, field for field, to the run with no
UWB nodes", and observe 4 says the ranging records "become those of the channel-9 run to the last
field". The comparison helpers `wifiSide`/`uwbSide` delete `seq` before comparing, precisely because
the shared emitter's counter differs between runs.

**Why.** "Field for field" and "to the last field" are literally false for `seq`. The test's own
comment documents the exception; the prose does not. This is the stated-vs-simulated drift class the
task flags.

**What to do.** Either qualify the prose ("identical in every field but the shared sequence
number") or, where the record counts really do match (CH9 vs WIFI7 look like a candidate), assert
`seq` equality too and keep the sentence.

### 3 — minor · two quiz numbers are not pinned
`src/course/uwb/uwb-coexist.ts:166` and `:170` ("34 dB of EIRP"), `:180` ("still leaves 26 dB of
SINR" / "仍剩约 26 dB").

**What.** Every other figure in the lesson is asserted; these two are not (`grep` for `34` / `26 dB`
in the test returns nothing but the unrelated `0.97 %` check at `:472`).

**Why.** Both are derived, not re-typed constants: 34 dB is `20 − (−14)`, and 26 dB is
`−53.46 − (−87.97 + 8.12) = 26.39` — a three-term combination of separately pinned quantities. The
binding constraint is that every number is pinned.

**What to do.** Add two expectations next to the existing ones: `expect(20 - UWB_TX_POWER_DBM).toBe(34)`
and `expect((rssiUl - (noiseDbm(WIDTH_MHZ) + noiseRiseDb(loudest))).toFixed(0)).toBe('26')`, each
quoting the quiz sentence.

### 4 — minor · the table's base "Lost to Wi-Fi" cell is the one cell never checked
`src/course/uwb/uwb-coexist.ts:109` (`N('8')`); test at `tests/course/uwb-coexist.test.ts:461-500`.

**What.** `cell(0, 0, 1)`, `cell(0, 0, 3)`, `cell(0, 0, 4)`, `cell(0, v+1, 2)`, `cell(0, v+1, 3)`
and the three saturated cells are all asserted against measurements; `cell(0, 0, 2)` — the base
run's `8` — is not.

**Why.** It is the table's headline number and the only one that can silently drift.

**What to do.** `expect(cell(0, 0, 2)).toBe(String(interfered().length))` in the
"eight frames are lost" test.

### 5 — minor · three places where ZH carries content EN does not
`src/course/uwb/uwb-coexist.ts:147` (observe 1 ZH adds "五秒里共八次"), `:124` (ZH adds "那 92 次
测距", absent from the EN at `:123`), `:128` (ZH opens with a whole extra clause,
"5 号信道值得一用，前提是它在频谱里的位置真能换来什么", with no EN counterpart).

**Why.** All three additions are true and pinned elsewhere, so this is not a correctness problem;
but the two languages should teach the same lesson, and the parity test only checks non-empty and
`zh !== en`, so it cannot catch this.

**What to do.** Add the clauses to the EN, or drop them from the ZH.

### 6 — minor · the test's quoted sentence drifted from the shipped string
`tests/course/uwb-coexist.test.ts:364-366`: the `it` title and the quoted comment both say
"−42.80 dBm", while the shipped prose (`src/course/uwb/uwb-coexist.ts:94`) and the assertion at
`:369` say **−42.79**.

**Why.** The house pinning standard is that each assertion quotes the shipped sentence verbatim; a
wrong quote is how a future editor "fixes" the prose to match the comment.

**What to do.** Correct both to −42.79.

### 7 — minor · "not one ranging record changes" has no stated reference run
`src/course/uwb/uwb-coexist.ts:83` (EN+ZH). The pin is `uwbSide(recs(CH9)) === uwbSide(recs(WIFI7))`
(`tests/course/uwb-coexist.test.ts:544`), i.e. "the same as the no-overlap run". Read literally
against the base run the sentence is false (the base run loses eight). Observe 4 states the
reference correctly; the body should too.

### 8 — minor · the 276.816 Mb/s reference scene is built inside the test and never schema-checked
`tests/course/uwb-coexist.test.ts:594`: `const alone = { ...sat, nodes: sat.nodes.filter(n => n.kind !== 'uwb') }`
keeps `scenario.uwb` with no UWB nodes left — an orphan session, the very thing the shipped
`noUwb` variant was added to avoid (report deviation 3). Suggest `uwb: undefined` and a
`ScenarioSchema.parse` on it, so the reference the lesson's 0.97 % is measured against is a legal
scenario.

### 9 — minor (editorial) · 0.97 % denotes two unrelated quantities
UWB airtime in the base run (quiz 2 distractor, `:177`) and the saturated run's throughput cost
(`:119`). Both are correct and pinned; a learner can easily read them as the same number. Consider
rewording one.

## Claim → pin table

| # | Claim (lesson) | Pin |
|---|---|---|
| 1 | UWB ch 5 = 6240.0–6739.2 MHz, 499.2 MHz wide, centre 6489.6 | `test:302-305` (`UWB_BAND_MHZ[5]`, width, prose contains) |
| 2 | Wi-Fi 6305 MHz / 80 MHz = 802.11ax ch 71, 6265–6345 | `test:290-291` (`sixGhzChannelNo`), `test:307` (edges) |
| 3 | **overlap fraction 1.00** (80 of 80 MHz) | `test:308-309` (`uwbBandOverlapMhz`, `uwbBandOverlap(...).toFixed(2)`) |
| 4 | 5985 MHz = ch 7, 5945–6025, overlap 0 MHz | `test:311-312`, `test:286-289` |
| 5 | in-band EIRP: Wi-Fi 20 dBm, **UWB −21.95 dBm**, 7.95 dB lost | `test:316-335` (formula string byte-identical, `uwbInBandDbm`, `-14`, `7.95`, 0 dB for Wi-Fi) |
| 6 | Wi-Fi law 46.7 + 30·log10 d + 1.2; UWB 48.69 + 20·log10 d | `test:338-347` (`wifiToUwbPathLossDb`, `uwbPl0Db(5)`, decade slopes, prose contains) |
| 7 | Router at the tag **−42.79 dBm** at 3.14 m / 20 dBm | `test:367-369` (see minor 6 for the stale comment) |
| 8 | Laptop at the tag **−48.67 dBm** at 3.35 m / 15 dBm | `test:368,370`; also the measured `foreignDbm` of all 8 losses, `test:483` |
| 9 | Anchors 4.76–6.91 m → **−76.25 … −79.48 dBm** at the tag | `test:372-375` |
| 10 | **SIR −30.81 dB** vs the −12 dB floor, 18.8 dB short | `test:377-383` (`UWB_SIR_MIN_DB`), measured `sirDb` `test:482` |
| 11 | Loudest UWB at a Wi-Fi radio **−80.57 dBm** (58.62 dB loss) and it is the maximum | `test:388-396` |
| 12 | 80 MHz noise floor −87.97, **noise rise 8.12 dB** | `test:398-399` (`noiseDbm`) |
| 13 | **18.57 dB below CCA-ED −62 dBm** | `test:401-402` (`CCA_ED_DBM`) — but see **finding 1** for the missing distance qualifier |
| 14 | CCA never busy from UWB | `test:404-420`: base CCA_BUSY/CCA_IDLE stream equals the No-UWB run's (>100 records), and no CCA_BUSY starts inside a UWB TX span without a live Wi-Fi PPDU |
| 15 | Exactly 8 UWB×Wi-Fi PPDU overlaps, all anchor-4 vs the laptop | `test:423-435` |
| 16 | anchor-4 8.16 m from the router, **−88.87 dBm**, 2.58 dB rise | `test:436-440` |
| 17 | Laptop uplink −53.46 dBm, **31.92 dB SINR**, MCS 7 needs **26.99** | `test:443-447` (`reqSinrDb('eht',7)`), MCS 7 on every data PPDU `test:449-452` |
| 18 | "All eight decode" — zero Wi-Fi RX_FAIL | `test:454` |
| 19 | **Wi-Fi record identity with the No-UWB run, 9.960 Mb/s** | `test:460-466` (>10 000 records, both `mbps` values) — modulo `seq`, see **finding 2** |
| 20 | Base: Wi-Fi air **3.07 %**, UWB air **0.97 %**, 25 blocks | `test:471-475` (+ table cell, + quiz distractor) |
| 21 | **8 UWB_INTERFERED**, all `uwb-1`←`anchor-4`, 600 ms apart | `test:481-491` |
| 22 | Blocks 2, 5, 8 … 23 | `test:493-494` |
| 23 | 8 lowSinr RX_FAIL, each + **1.808502 ms** → UWB_TIMEOUT | `test:496-500`, jump spacing `test:213` |
| 24 | **92 / 100 ranges**, 100 on ch 9 | `test:506-508` |
| 25 | **25 fixes**, 17 on four anchors, **8 on three** | `test:510-513` |
| 26 | **GDOP 1.05 → 1.26**, three-anchor fixes exclude anchor-4 | `test:514-518` |
| 27 | Error **0.1–4.2 cm** base, **0.3–3.5 cm** on ch 9 | `test:519-524` |
| 28 | Log line + 418.191 ms + the two `UWB_POSITION` lines, word for word | `test:527-540` (`fmtRecord`, prose contains) |
| 29 | Inspector: tag `interfered` 8 = `timeouts` 8, every anchor 0 | `test:541-545` (replayed through `initViewState`/`applyRecord`), label from `STRINGS.en.uwb.interfered` |
| 30 | Mediator exists only where the bands meet | `test:549-553` (`Simulation.spectrum` non-null for base + saturated, null for ch9 / wifi7 / noUwb) |
| 31 | ch 9 and Wi-Fi ch 7: 0 losses, 100 ranges, 25 fixes, 0 timeouts, same records | `test:557-570` |
| 32 | Saturated: **91.28 % air, 200 losses (40/s), 400 timeouts, 0 ranges, 0 fixes**, 50 per anchor | `test:574-589` |
| 33 | Saturated cost: **274.128 vs 276.816 Mb/s = 0.97 %**, 50 Wi-Fi RX_FAIL | `test:592-604` (reference scene built in-test — see **finding 8**) |
| 34 | Farthest spot 7.50 m → −59.15 dBm, best SIR −17.10 dB; 11.09 m / 14.21 m needed | `test:609-641` (room swept at 5 cm, bisection on the engine's own law) |
| 35 | 6225 MHz (ch 55): 25/80 MHz = 31 %, 5.05 dB, SIR −25.76, still 8 losses / 92 ranges | `test:644-659` (a full re-simulation) |
| 36 | 6185 MHz (ch 47): overlap 0, losses stop, 100 ranges | `test:660-666` |
| 37 | ch 9 = 7737.6–8236.8 MHz; top centre 7115 + 320/2 = 7275 → **462.6 MHz clear**; no width overlaps | `test:350-359` (incl. schema accepting 7115 and rejecting 7120) |
| 38 | Source status: §16.4.10 / −45 dBm/MHz **standard**; −12 dB SIR, path-loss laws, flat density **model**; 6 GHz numbering **802.11ax** | `test:219-232` (first block is a `p`, contains all five phrases, constants read from `phy.ts`) |
| 39 | Course placement: TIERS[5], MODULES[13]/[14], COURSE_ORDER, skipped ids | `test:234-249` |
| 40 | 4 observe / 2 tryThis / 3 quiz / 5 jumps, `lessonMinutes` 25 ≤ 25, ≤ 1724 words | `test:186-205` |
| 41 | Every learner-visible string bilingual (>50 pairs) | `test:215-217` |
| 42 | Fixture additions only | diff: five `+` lines in `tests/fixtures/lesson-hashes.json`, none removed |
| — | "34 dB of EIRP" (quiz 1), "26 dB of SINR" (quiz 2) | **unpinned — finding 3** |
| — | Table cell `8` (base, Lost to Wi-Fi) | **unpinned — finding 4** |
| — | "CCA never busy" as a general statement (no ~40 cm cutoff) | **unpinned and inconsistent with the Guide — finding 1** |

## Summary

The lesson is measured, not asserted: 42 of the 45 claims resolve to an expectation that reads the
engine's own exports or re-simulates the scene, the variants each change exactly one field, the
fixture grows by five keys and nothing else, and both gates are green. One blocking finding (the
CCA sentence, which contradicts the Guide as amended in `caef9db`) and eight minor ones.

---

## Re-review (fix round 1)

Scope: commit `f87ec6a` ("fix(course): uwb-coexist CCA claim qualified by distance; pins and ZH
parity"), package `task-5-fix1.diff`. The unrelated plan-doc commit `b7f8f4f`
(`docs/superpowers/plans/2026-09-19-uwb-aoa.md`) was not reviewed. `f87ec6a` touches exactly two
files — `src/course/uwb/uwb-coexist.ts` (+26/−26 lines of prose) and
`tests/course/uwb-coexist.test.ts` (+84/−26) — and no scenario field changes, so
`tests/fixtures/lesson-hashes.json` is correctly untouched.

### Verdict

- **Spec: APPROVED**
- **Quality: APPROVED**

### Gates

| Command | Result |
|---|---|
| `npx vitest run tests/course/uwb-coexist.test.ts tests/engine/lesson-hashes.test.ts` | 2 files, **30 tests (29 + 1), all passing** (exit 0); the lesson test grew from 28 to 29 |
| `npx tsc -b` | clean (exit 0) — checked because the new `const { uwb: _session, ...sat }` destructure could have tripped unused-local rules; it does not |
| `lessonMinutes` | 25 (header now states 1701 words; 1701/150 + 2·4 + 4·2 = 27.34 → 25), ceiling of 1724 still pinned at `test:195` |
| EN/ZH parity | every changed string carries both languages; the three EN-side gaps from finding 5 are closed |

### Ruling-by-ruling

| # (round 0) | Ruling | Verdict |
|---|---|---|
| **1 blocking** — CCA distance qualification | Body now reads "…so **at these distances** CCA never reports busy… The threshold is not unreachable: a Wi-Fi radio brought within **about 40 cm** of a UWB transmitter would trip it. Nowhere in this room is one that close…" (ZH matching). Quiz 2's question is rescoped ("no UWB frame **in this room**") and its explain replaces "at the loudest point in the room" with "at the **nearest Wi-Fi radio in this room, the router 3.14 m from the tag**", plus the 40 cm escape clause. Pinned by a new test (`test:376-404`): the crossover is derived from `uwbInBandDbm`/`uwbPl0Db(5)`/`UWB_PL_EXP`/`CCA_ED_DBM` and asserted at **0.37 m**, the level at that distance is asserted equal to −62 dBm to 4 dp and above it 1 cm inside, the nearest UWB↔Wi-Fi distance in the room is asserted as 3.14 m and greater than the crossover, both languages are asserted to carry "40 cm", and `prose()` is asserted **not** to contain the old sentence. Matches `src/ui/Guide.tsx:201-202` (40 cm) and `caef9db` (0.37 m). | **Resolved** |
| 2 — "field for field" | Body now says "identical … **in every field but the shared sequence number**" (ZH matching) and the test proves the exception is real (`seqs(base) !== seqs(noUwb)`, `test:490-493`). Observe 4's "to the last field" is *kept* and made literal: the CH9/WIFI7 comparison no longer strips `seq` (`uwbSide` deleted; `uwbRaw` compares whole records, >1000 of them, `test:606-611`). Both sentences are now `prose()`-pinned. | **Resolved — the stronger of the two options** |
| 3 — unpinned quiz numbers | `expect(20 - UWB_TX_POWER_DBM).toBe(34)` plus both quoted phrases (`test:372-375`), and the 26 dB SINR recomputed from `rssiUl`, `noiseDbm(80)` and `noiseRiseDb(loudest)` with the sentence quoted (`test:369-371`). | **Resolved** |
| 4 — table cell | `expect(cell(0, 0, 2)).toBe(String(hit.length))` inside the eight-losses test (`test:521`). | **Resolved** |
| 5 — ZH-only content | All three moved into the EN: observe 1 "— eight times in five seconds", the channel-slide sentence "and the same 92 ranges", and "Channel 5 is worth reaching for when its place in the spectrum buys you something; beside a 6 GHz access point it costs more than it buys." | **Resolved** |
| 6 — stale −42.80 quote | `it` title and comment now read −42.79, matching the shipped prose and the assertion. | **Resolved** |
| 7 — "not one ranging record changes" | Body now names the reference: "the session produces exactly the records it produces **on channel 9, where the bands cannot meet either**" (ZH matching), pinned by the `uwbRaw` identity above plus a `prose()` check. | **Resolved** |
| 8 — in-test reference scene | `const { uwb: _session, ...sat }` drops the orphan session; the scene is asserted to have `uwb === undefined`, to pass `ScenarioSchema.parse`, and to carry the same node ids as the shipped "No UWB" variant (`test:645-652`). | **Resolved** |
| 9 — 0.97 % used twice | Quiz 2's distractor now quotes air time as "48.6 ms of the five seconds", pinned against `airNs(...)` (`test:508-511`), and the test asserts `prose().match(/0\.97 %/g)` has length **1**, so the only 0.97 % a learner meets is the saturated run's throughput cost. | **Resolved** |

### Remaining findings (nits, non-blocking)

1. **nit** — `tests/course/uwb-coexist.test.ts:398-399`: the ZH side of the CCA cutoff is guarded
   only by `expect(zh).toContain('40 cm')`, while the EN gets the full phrase and a negative guard.
   A ZH phrase check (e.g. `'40 cm 以内'`) would make the two sides equally hard to break.
2. **nit** — `src/course/uwb/uwb-coexist.ts:16`: the header's "1701 words, leaving room for 23"
   is arithmetic-consistent with the 1724 ceiling and matches the size of this round's additions,
   but the exact figure is unpinned (house style, same as `uwb-position.ts`). The margin is now
   23 words, so the next prose change should recount rather than estimate.

Nothing in this round changed a scenario, a pinned measurement or a fixture; every number the
lesson gained is measured or derived from an engine export. No further changes required.
