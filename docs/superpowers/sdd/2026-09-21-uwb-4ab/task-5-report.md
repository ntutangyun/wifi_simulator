# Task 5 report — lesson "Sixteen milliseconds of energy" (uwb-mms) and UWB Tier 3

Commit `365ddfa`. Files: `src/course/uwb/uwb-mms.ts` (new), `tests/course/uwb-mms.test.ts` (new),
`src/course/curriculum.ts`, `src/course/lessons.ts`, `src/course/lessonKit.ts`,
`tests/fixtures/lesson-hashes.json` (4 additions), plus three pre-existing course tests whose
assertions the new tier invalidated (see Deviations).

## The geometry decision

The ruling was: move the third anchor so that ALL three fail at X = 4 and ALL three succeed at
X = 8, with at least 1 dB of margin each way, keeping them non-collinear.

Computed with the engine's own constants (`mmsFragmentDbm(rsfNs(40, 64))` = −3.4588 dBm,
`uwbPl0Db(9)` = 50.4957 dB, `UWB_PL_EXP` = 2, `WALL_LOSS_DB.brick` = 12, two walls, 3-D distance):

```
rx(d)       = −3.4588 − (50.4957 + 20·log10(d) + 24) = −77.9545 − 20·log10(d)
margin(X=4) = rx + 6.0206 + 93 ≤ −1   ⇒  d ≥ 12.673 m
margin(X=8) = rx + 9.0309 + 93 ≥ +1   ⇒  d ≤ 14.244 m
```

With the tag at the spec's (13.0, 4.0, 1.0) and anchors at 2.2 m, the feasible band is a strip of
x ≲ 1.0 m against the west wall (at y = 4 it is x ≤ 0.384; at y = 0.5, x ≤ 0.879). Both candidates
the brief suggested fall outside it — rejected by computation and confirmed by a run:

| third anchor | 3-D distance | margin X = 4 | margin X = 8 | verdict |
|---|---|---|---|---|
| (4.5, 4.0) — the spec's | 8.584 m | **+2.39 dB** (ranges) | +5.40 dB | fails the ruling |
| (1.5, 4.0) — candidate | 11.562 m | **−0.20 dB** | +2.81 dB | fails (< 1 dB) |
| (2.0, 2.0) — candidate | 11.245 m | **+0.05 dB** (ranges) | +3.06 dB | fails |
| **(0.3, 4.0) — chosen** | 12.757 m | −1.05 dB | +1.96 dB | satisfies both |

**Chosen: anchors (0.5, 0.5), (0.5, 7.5), (0.3, 4.0) at 2.20 m; tag (13.00, 4.00) at 1.00 m** (the
tag stays where the spec put it). The three are non-collinear — the third is 0.2 m off the line
through the other two — and the run confirms a solvable block fix in every block: GDOP 2.93,
error ellipse 6.1 × 1.3 cm, which is identical to two decimal places to what the spec's own anchor
set produces, because from 13 m away all three anchors sit inside a ±15° arc either way. The
flatter triangle therefore costs nothing measurable here, and it buys the lesson's whole subject:
a clean threshold at 3 dB.

The algebra also shows the ruling's constraint is nearly saturated: at exactly ±1 dB the third
anchor can be at most 1.14 m off the line of the other two, and only with zero slack on both
bounds. (0.3, 4.0) keeps 1.05 / 1.96 dB of slack instead.

Crystals are set, not drawn: tag +20 ppm, anchors −20 / 0 / +10, so the train-derived ratios at
the tag have a known truth of 40 / 20 / 10 ppm.

## Every number the lesson quotes, and where it is pinned

All in `tests/course/uwb-mms.test.ts` (36 tests). Run window 1300 ms = 7 blocks x 3 pair rounds =
21 ranges, 7 fixes.

**Energy and the fragment** — `UWB_MS_BUDGET_NJ` 37 nJ; −41.3 dBm/MHz over 499.2 MHz = −14.3 dBm
(computed); the 4z Poll 36 octets / 203.782 µs / −14 dBm = 8.11 nJ, "the other 29 away"; the RSF
40 × 4 × (128 + 2 × 64) = 40 960 chips = 82.051 µs at −3.46 dBm; set rsf-1 31 040 chips =
62.179 µs at −2.25 dBm, +1.20 dB on the default; combining 6.02 / 9.03 / 12.04 dB;
`UWB_RX_SENS_DBM` −93.

**Link budget behind two walls** — per fragment −100.26 / −100.26 / −100.07 dBm, pinned twice:
against `UWB_MMS_TRAIN.rxDbm` from the run and against the closed form. Margins:
X = 4 → −1.24 / −1.24 / −1.05 dB (all `detected: false`, `ratioPpm: null`);
X = 8 → +1.77 / +1.77 / +1.96 dB (all detected); X = 16 on rsf-1's fragment (rx −99.05 / −98.86)
→ +5.99 / +5.99 / +6.18 dB. The X = 4 → X = 8 step is pinned as exactly 10·log10(2).

**Consequences** — X = 4: 0 ranges, 0 fixes, 21 `UWB_TIMEOUT`, each
`tag-1 UWB slot 24: no nb-report from anchor-1` (through `fmtRecord`). X = 8: 21 ranges, 7 fixes,
0 timeouts. rsf-1: 21 ranges, 7 fixes, round grows 28 → 40 slots, 14 → 20 ms, 42 → 60 ms a block.
4z variant: 42 timeouts (21 `uwbPoll` at the anchors, 21 `uwbResp` at the tag), 0 ranges.

**Round and block** — `roundPlan`: 28 slots × 500 µs = 14 ms, block 200 ms, `roundsPerBlock` 14,
three pair rounds used; `mmsLayout` 4 + 20 + 4 with the responder's report in slot 24.

**Narrowband** — POLL / RESP 12 octets = 576 µs, REPORT 13 octets = 608 µs (from `nb.ts`);
channel 3 = 5733.75 MHz (`nbCenterMhz`, the frame's own `nb.centerMhz`, and the inspector row
`3 · 5733.75 MHz` in EN and ZH); air per round 3.073 ms, of which 1.760 ms is narrowband and
1.313 ms is all sixteen fragments; no LBT on UNII-3 (`UWB_NB_LBT` never emitted, `lbtBusy` 0).

**The ratio ladder** — σ_ratio = `ratioSigma(100, 7)` = 0.0202 ppm; round 0 measures
39.970 / 19.992 / 9.967 ppm against a true 40 / 20 / 10, every train of the run inside 4σ; the
anchor end of the same pair reads −39.995 ppm (the initiator's inversion, pinned by the opposite
signs); reply time 0.500 ms from `nb.replyRctu`. Closed forms, labelled as arithmetic in the
prose: 1.5 m (`UWB_PPM_MAX` 20 ppm), 1.5 cm (`cfoNoisePpm` 0.2), 1.5 mm (the train's σ_ratio),
3.00 m (the pair's actual 40 ppm) — the last cross-checked against the run's own
`rctuToMetres(tofRawRctu) − distM` (mean 2.998 m). Measured: `rangeSigmaM(100)` = 2.1 cm and an
RMS of 2.05 cm about the room's NLOS bias over the 21 ranges. The lesson says plainly that the
1.5 mm is arithmetic and invisible under the 2.1 cm floor, and the test pins that adding it in
quadrature does not move the first decimal.

**Burst-power split** — the 4z Poll reaches the tag at −110.80 dBm, the eight-fragment train at an
effective −91.23 dBm, 19.57 dB apart, decomposed and pinned as 9.03 (the train) + 3.95 (a fragment
is shorter than a Poll) + 6.59 (the unspent millisecond), summing to the measured gap to six
decimals; a burst-mode 4z could hold −7.41 dBm.

**NLOS and the fix** — `UWB_NLOS_NS.brick` 2 ns × two walls = 1.199 m on every range (each within
4σ of it), `fomText` `75 % within 12 ns`, `integrity` undefined (Y = 0). Fix (14.22, 4.05) against
(13.00, 4.00), error 122.4 cm, GDOP 2.93, ellipse 6.1 × 1.3 cm, method "two-way ranging" /
"双向测距 (TWR)" — all read through `uwbFixRow`; the train table through `uwbTrainRows`
(`8 × RSF`, `8 / 8`, `+1.8 dB`, `detected` / `检出`).

**Log lines quoted** — three `UWB_MMS_TRAIN` lines, the `UWB_TIMEOUT` line, and
`tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)`, each pinned through
`fmtRecord`. The UWB log is language-neutral, so the ZH observe items carry the same strings and
the test pins that too.

## Word count and shape

`lessonWords` **1711** (ceiling 1724, pinned together with the 1725 → 30-minute tipping point);
`lessonMinutes` 25. Eleven body blocks (nine paragraphs, one formula, one table), 5 jumps,
4 observe, 2 tryThis, 3 quiz, EN + ZH throughout. `TIERS[6]`, `MODULES[15]` and the `COURSE_ORDER`
tail are exactly as the brief specifies, with room left for `uwb-nba`.

## Deviations from the spec, and why

1. **Third anchor (4.5, 4.0) → (0.3, 4.0)** — above. The spec's "X = 4: every train below −93 dBm,
   no range" is false at its own anchor set.
2. **Burst-power split 6.9 dB → 6.59 dB, plus a third term.** The spec assumed a ~190 µs Poll
   spending ~7.5 nJ; the engine's Poll to three anchors is 203.782 µs and spends 8.11 nJ, so the
   unspent-budget term is 6.59 dB. The spec's "6.9 dB of burst power plus 10·log10(X)" also does
   not add up to what the room shows (19.57 dB): the missing 3.95 dB is that a fragment is shorter
   than a Poll, so the same energy is louder while it lasts. The lesson states all three terms.
3. **The second table was dropped.** The spec asked for a link-budget table (kept, with the
   X = 4 / 8 / 16 margins); a further table of fragment/round arithmetic did not fit under the word
   ceiling, and its numbers live in the prose, the observe items and the experiments instead.
4. **Three course tests updated** (`tests/course/lessons.test.ts`, `uwb-aoa.test.ts`,
   `uwb-coexist.test.ts`): they pinned "six tiers", the tier-track list, the MODULES tier list,
   `trackHeadings(TIERS)`, "uwb-aoa is last in COURSE_ORDER" and the tail slice after
   `uwb-position`. Each was rewritten to the new shape (seven tiers, module 15, uwb-mms after
   uwb-aoa, the tier-2 slice bounded at `uwb-mms`); no assertion was weakened or deleted. Task 6
   will have to adjust the same tail again when `uwb-nba` lands.
5. `firstNbLbt` was added to lessonKit as the brief asks, but this lesson never triggers it
   (UNII-3, no Wi-Fi in the room); it is there for `uwb-nba`.

## Gates

`npx tsc -b` clean; `npx vite build` exit 0; `npx vitest run` **113 files / 1645 tests, all
green**; `tests/fixtures/lesson-hashes.json` gained exactly four keys (`uwb-mms`, `uwb-mms#0`,
`uwb-mms#1`, `uwb-mms#2`) and changed nothing else (verified by diff).

## Self-review notes

Read end to end in both languages. EN and ZH now say the same things sentence for sentence: three
ZH-only leftovers from earlier drafts (a trailing "every figure below", "the block holds fourteen"
in observe 1, and the FoM suffix in observe 3) were removed for parity. The prose follows the
engine rather than the spec everywhere they differ, and says so where a reader would otherwise be
misled — the burst-power paragraph, the "arithmetic, not a measurement" sentence about the 1.5 mm,
and the closing paragraph that the ellipse knows only the noise while the 1.199 m of wall delay is
a bias.

---

# Fix round 1 — review findings addressed

Commit `32a7984`, two files only (`src/course/uwb/uwb-mms.ts`, `tests/course/uwb-mms.test.ts`).
Prose only: the air is untouched, and the four `uwb-mms` hashes in `tests/fixtures/lesson-hashes.json`
are unchanged (the fixture file was not staged or edited).

## The four stated-vs-simulated drifts

1. **Who polls in the 4z scene.** `session.ts` gives slot 0 to the tag, so the tag polls and the
   anchors are the ones left waiting — the 21 `uwbPoll` timeouts are theirs. "A 4z Poll from
   anchor 1 reaches the tag at −110.80 dBm" was backwards; it now reads "The tag's 4z Poll reaches
   anchor 1 at −110.80 dBm; its eight-fragment train arrives at an effective −91.23". Both numbers
   are unchanged, and a new assertion pins why: the room is symmetric, so anchor 1's train record
   carries the same −100.26 dBm the tag's does (`atAnchor.rxDbm === firstTrains('base')[0].rxDbm`,
   and `rxDbm + gainDb` = −91.23). The 37 nJ paragraph now says "the tag's Poll to three anchors".
   New test `the tag is the one that polls…`: every `uwbPoll` TX_START is the tag's and broadcast,
   every `uwbPoll` timeout's `node` is an anchor, every `uwbResp` timeout's is the tag.
2. **Which anchor timed out.** Of the 21 nbReport timeouts only seven name anchor-1. The sentence
   is now "21 timeouts, one per pair round — “tag-1 UWB slot 24: no nb-report from anchor-1”, then
   anchor-2, then anchor-3", the set check includes `o.peer` (three distinct entries, seven each),
   and the first three lines are pinned through `fmtRecord`.
3. **When the inspector reads what.** The first fix is solved at 42 ms; the state observe 4 quotes
   is the seventh block's. EN now says "After seven blocks the tag's inspector reads", ZH "七个块
   之后" (it said "a few"), pinned against `fixes[0].t === 42 ms` and the seventh fix's own
   coordinates through `uwbFixRow`.
4. **Six unpinned UI strings.** A new describe (`the lines the observe items quote`) routes each
   through `fmtRecord`: the `UWB_ROUND` line, the NBPOLL, the TX RMARKER (counter 336330610684),
   the UWBRSF, the RX RMARKER (counter 26504711136) and the NBREPORT — and asserts each appears in
   both the EN and the ZH observe item. The receive stamp is quoted **with** its figure of merit,
   `(75 % within 12 ns)`, which is what the formatter actually prints; the earlier quote had
   dropped it. Also newly pinned: the tag's own verdict at 10.000 ms (and the anchor's at 9.500),
   `Object.keys(MMS_SETS).length === 17` for "one of the seventeen mandatory sets", the table's
   first column (`4 × 82.051 µs`…), its Verdict column (EN and ZH) and its head row, and the ZH
   inspector strings observe 4 quotes (kind, heard, margin, verdict and narrowband channel, read
   back out of `uwbTrainRows` / `uwbNbChannelText` with `STRINGS.zh`).

## Minors

5. "Each side loses all three of the other's trains" → "Each anchor loses the tag's train, and the
   tag all three of theirs", pinned (`BLOCKS` trains at each anchor, `BLOCKS × 3` at the tag).
6. "in the 5–6 GHz bands" → "in 5725–5850 and 5925–6425 MHz" (EN + ZH).
7. "Twenty slots later the responder's REPORT" → "After the twenty-slot ranging phase, in slot 24,
   the responder's REPORT…", which is the `mmsLayout` the test already pins (`reportSlot`).
8. The ladder now says in words that it is arithmetic: "All three are arithmetic from the
   constants, not measurements; what the run measures is the floor under them" (EN + ZH).
9. The duplicate `../../src/uwb/phy` import is folded into one.

## Word budget

The fixes cost words, so prose was trimmed elsewhere (the disclaimer's parentheticals, the
detection sentence, the walls paragraph's "1.22 m east" — the fix error is still pinned as
122.4 cm through `uwbFixRow` — quiz 1's explanation and two question stems). `lessonWords` is
back under the ceiling and `lessonMinutes` is 25 again, both pinned as before.

## Gates

`npx tsc -b` clean. `npx vitest run tests/course/uwb-mms.test.ts`: **41 of 42 pass**. The one
failure is `expect(ids[ids.length - 1]).toBe('uwb-mms')` — the "last lesson" assertion the
coordinator told me to keep away from, which `uwb-nba` (Task 6, still uncommitted in the shared
worktree) has just invalidated; Task 6 owns that line. `npx vitest run
tests/engine/lesson-hashes.test.ts` fails only on the four **`uwb-nba`** keys missing from the
fixture (Task 6 has not regenerated it yet); every `uwb-mms` hash matches, which is the proof that
this round changed no air.
