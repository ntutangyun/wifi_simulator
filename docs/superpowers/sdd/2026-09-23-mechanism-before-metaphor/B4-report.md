# B4 — bianchi, bianchi-vs-sim, tier1-project, tier1-project-review

Base: 6b7e4e1. Grading command clean for all four ids:
`MECHANISM_INCLUDE=bianchi,bianchi-vs-sim,tier1-project,tier1-project-review npx vitest run tests/course/readability.test.ts`
→ 946 passed. `npx tsc -b --noEmit` clean; `npx vitest run tests/course` 58 files / 2262 tests green.

## bianchi

Budget: `bianchi          picture  576/900 · numbers  547/550 · practice  374/450 · total 1497 (1497 words, 25 min)`

**Procedure** (`numbers`, `steps` "Working the pair out with a calculator", 7 items) — taken from
`src/course/tier1/bianchiModel.ts` line for line, not from the old prose:

1. the four inputs — `n`, `W = 16` (`CW_MIN + 1`), `m = 6` (`2^m·W = CW_MAX + 1`), `L = 7`
   (`SHORT_RETRY_LIMIT`);
2. `tauOf`'s finite-retry sums: stage window `W_i = 2^min(i,m)·W`, top line `Σ p^i`, bottom line
   `Σ p^i(W_i + 1)/2`;
3. the decoupling step `p′ = 1 − (1 − τ)^(n−1)`;
4. `solveBianchi`'s bisection — the 200-halving loop, stated as fifty halvings, with the
   monotonicity that makes the root unique;
5–6. `saturationThroughput`: `P_tr`, `P_s`, `σ = SLOT_NS = 9 µs`, and the mean-slot weighting;
7. the divide, with `E[P] = 12,000 bits`.

**Worked example** (new `table`, "Five stations, run through the steps"): p 0.2722 → the two sums
1.3738 / 17.9942 → τ 0.0763 → back through `1 − (1 − τ)^4` to 0.2722 → `P_tr` 0.3277, `P_s` 0.8478,
mean slot 712.5 µs, throughput 4.679 Mb/s. Every row recomputed in the test, none transcribed.

**Engine vs old lesson.** The displayed formula is Bianchi's *infinite*-retry closed form while every
number in the lesson (and in the code) uses the finite-retry chain. Rather than drop the paper's
equation I added one clause to its note — "The steps below solve the finite-retry version this MAC
uses" — so the reader is not left to reconcile them from `deeper`.

**Naming (rule 4):** `why` now carries `stations (STA)` / `站点（STA）`; saturation is named with a
naming clause ("— that is saturation" / "——这就是饱和"); the transmit and collision probabilities are
named with "is called … , written τ / p". Outcome 3 was reworded so `collision probability` is not
first met in an outcome, ahead of the sentence that names it.

**Terms added:** none (3, unchanged). **Pins added:** `describe('the procedure the steps block asks
the reader to carry out')` — step 1 against `CW_MIN`/`CW_MAX`/`SHORT_RETRY_LIMIT`, step 2 against
`tauOf` at four values of p, steps 3–4 against the fixed point and the monotonicity of `tauOf`,
steps 5–7 against `saturationThroughput`'s own `ptr`/`ps`/`slotMeanNs`, and every worked-example row.
`proseMax` 850 → 1130; the shape assertion now expects 2 tables and 1 steps block.

## bianchi-vs-sim

Budget: `bianchi-vs-sim   picture  576/900 · numbers  549/550 · practice  380/450 · total 1505 (1505 words, 25 min)`

**Procedure** (`numbers`, `steps` "How the two columns were made", 6 items), the method, ahead of the
comparison table: one scene at one crowd size, its own seed, a ten-second window; an attempt is a
`TX_START` carrying a data frame and a meeting is a retry record (`RETRY`), quotient = measured
collision rate; a delivery is an acknowledgement, × 12,000 bits ÷ ten seconds = measured throughput;
the model's inputs come from the scene and the engine (`n`, `W = 16`, `m = 6`, `L = 7`, both exchange
costs priced at 6 Mb/s); subtract row by row and change nothing; then **what the method cannot
control** — a retry is a lost frame and not an overlap, a seed moves the figure by tenths of a point,
and the arc arranges the paper's assumptions to be true rather than testing them.

**Naming:** `站点（STA）到接入点（AP）` in the opening picture paragraph (EN `station (STA)` /
`access point (the AP)`); rate control, capture and the residual each named at the stand-in
("— that is rate control / capture", outcome 3 reworded to "— the residual —"). The heading
"Near and far: capture" became "Near and far: the stronger frame survives" so the word is not met
before the sentence that names it. One ZH observation that said a bare `AP` now says 接入点.

**Terms added:** none (3, unchanged). **Pins added:** `describe('0 · the method the steps block sets
out')` — the window and seed, the record types counted against the harness's own counts, the
throughput arithmetic, the model inputs, and a second seed (8 → 25.53 %) for the "tenths of a point"
claim. `proseMax` 900 → 1130.

## tier1-project

Budget: `tier1-project    picture  634/900 · numbers  543/550 · practice  312/450 · total 1489 (1489 words, 25 min)`

This lesson already had a `steps` block in `picture` (the four things to predict), so the steps rule
was already green; what it lacked was the plan itself. Added `steps` "The plan you carry out" at the
end of `numbers`, learner steps rather than engine steps: nothing to set up (the scene ships as the
brief describes it — 20 MHz, one stream, no EDCA/aggregation/TXOP); (a) from the floor plan alone;
(b) from each rung; (c) and (d) from the two exchange times; **only now** run ten seconds and read
the rung and block length off each laptop's first data frame, the losses off the retry records, the
successes and airtime off each node's own counters; then write four lines and predict the three
variants before running any.

**Naming:** outcome 1 now reads "the signal arriving at each station (STA)" / `每台站点（STA）`;
outcome 3 no longer meets `saturated` before the picture names it ("Both laptops are saturated");
the margin is named where it is used ("those few decibels are the margin"); the ZH DCF sentence now
carries a 就是 naming clause.

**Terms added:** none (5, unchanged). **Pins added:** `describe('tier1-project · the plan, step by
step')` — step 1 against the scene's caps (20 MHz, nss 1, no edca/ampdu/txop), steps 2–4 against the
dependency order (`mcsForRssi` → `times(mcs)` → the mean exchange), step 5 against a real run (first
data frame's `mcs` and `txTimeNs`, `RETRY` records present, `txOk`/`airtimeNs` counters non-zero),
step 6 against the two steps blocks. `proseMax` 1000 → 1200.

## tier1-project-review

Budget: `tier1-project-review picture  578/900 · numbers  549/550 · practice  347/450 · total 1474 (1474 words, 25 min)`

**Procedure** (`numbers`, `steps` "How to mark a sheet", 6 items), placed ahead of the existing
rubric table: each step says what the result should look like, which record proves it, and what a
wrong answer usually looks like — (a) both levels within a decibel of −40.73 / −75.15 dBm with the
rung justified by requirement plus margin, the rung read off the first data frame; (b) 129.6 and
524.0 µs, the wrong answer dropping the header and check bytes or rounding the symbol count down;
(c) which estimator was used, the trap being to call the retry rate agreement; (d) durations not
turns, 21.2 % / 78.8 %, the wrong answer splitting the air evenly; then the two mechanisms, each
pointing at a record; then the residual, stated not fitted.

**Naming:** capture and estimator each named at the stand-in in the same paragraph ("— that is
capture —", "— that is the estimator —"); `station (STA)` / `站点（STA）` added at the first
stand-in, which is the watch block, not the paragraph three screens later.

**Terms added:** none (3, unchanged). **Pins added:** `describe('tier1-project-review · how to mark a
sheet')` — the two link levels from `buildLinkTable`, the two block lengths from `times()`, that the
retry rate is closer to the prediction than the overlap rate is (the trap the step names), the
near-equal frame counts against the unequal airtime split, and both mechanisms' record counts
(4,990 overlaps / 2,713 retries; 1,342 of 2,399 pair collisions with a late start). The rubric quote
in the lesson-contract test was updated to the new estimator sentence. `proseMax` 1000 → 1200.

## Anything that did not fit

Nothing had to be cut for meaning, but all four lessons now sit within three words of the 550-word
`numbers` ceiling, so several existing paragraphs were tightened (never at the cost of a pinned
string) to pay for the procedures. If any of these four gains further material it will have to
split. No scenario builder, variant or jump was touched, so the recorded timeline hashes are
unchanged.

---

# B4 fix round — bianchi, the displayed equations

**Finding (Important, coordinator).** The `numbers` formula block showed Bianchi's infinite-retry
closed form while the table directly under it, captioned "What the equations predict" /
方程预测出什么, listed finite-retry figures — 49.59 % at n = 20 where the shown equations give
48.09 %. Both figures were right for their own model; the caption was false by construction, and the
clause added in the first round could not repair it.

**Ruling applied: display the equations the numbers actually come from.**

- The shown pair is now the finite-retry pair `solveBianchi` solves:
  `τ = Σ_{i<L} p^i / Σ_{i<L} p^i (W_i + 1)/2` with `p = 1 − (1−τ)^(n−1)`. Its note names every new
  symbol in plain words where it appears: `L = 7` the attempts one frame gets, `W_i = 2^min(i,m)·W`
  the window at attempt i, with `W = 16` and `m = 6`. The forward-pointing clause about "the finite
  version" is gone — there is nothing left to point at.
- Heading: "The pair of equations" → "The equations this lesson solves" / 本课要解的那一对方程.
  Table caption: "What the equations predict" → "What these two equations predict" /
  这两个方程预测出什么, in both languages.
- The classic infinite-retry form moved to `deeper`, as its own `formula` block under the new
  heading "The classic form, and the chain that never stops" / 教科书上的那个式子，以及那条不会停的链:
  the closed form, the `Σ_{k<m}(2p)^k` evaluation that keeps `p = ½` an ordinary point, the Wu et al.
  finite-retry variant, and 48.09 % against 49.59 % at twenty stations stated as the size of the
  difference between the textbook and this simulator.
- The `deeper` derivation "Where the first equation comes from" now describes the sums actually on
  the page: `p^i(W_i + 1)/2` is named as the bottom line of the displayed quotient and `p^i` as the
  top, so the depth agrees with the new arrangement rather than the old one.

**No pinned number changed.** Every figure in the lesson is exactly what it was; only the formula on
the page moved. All existing pins kept.

**Pin added**, so the two cannot drift apart again: `the displayed equations are the model the table
comes from, and the classic form is in the depth` — asserts the shown formula contains `Σ_{i<L} p^i`
and *not* `2(1−2p)` in both languages, that the depth's formula blocks do contain `2(1−2p)` with both
48.09 % and 49.59 %, that all four table rows equal `solveBianchi` with `attempts: 7`, and that the
classic pair gives 48.09 % at n = 20 — which the table is not.

**Budget after the round:**
`bianchi          picture  576/900 · numbers  549/550 · practice  374/450 · total 1499 (1499 words, 25 min)`
The longer formula note was paid for out of `numbers` as instructed (formula heading shortened, one
clause dropped from the note, four words from the last step); `deeper` is uncapped, so the classic
form costs the main path nothing.

**Gates:** `MECHANISM_INCLUDE=…` readability 946 passed; the four lesson tests 105 passed;
`npx tsc -b --noEmit` clean for every file in this batch; ZH dump read end to end. Remaining red in
`tests/course` is `uwb-sts` (budget) and a tsc error in `tests/course/uwb-geometry.test.ts`, both
other batches' files, mid-edit.
