# B1 — Wi-Fi Tier 1, wave 1: `radio-primer`, `decode-thresholds`

Batch B1 of the course-readability programme (step 5). Two lessons rewritten in
place on the zero-to-hero contract; no split, no new ids, no fixture change —
both lessons keep `primerScenario` and `primerVariants` byte for byte, so
`tests/fixtures/lesson-hashes.json` is untouched.

Files: `src/course/tier1/radio-primer.ts`, `src/course/tier1/decode-thresholds.ts`,
`tests/course/radio-primer.test.ts` (was `tier1-radio-primer.test.ts`),
`tests/course/decode-thresholds.test.ts` (was `tier1-decode-thresholds.test.ts`).
`src/course/tier1/radioLink.ts` was read and left unchanged: the shared scene is
correct as it stands.

---

## `radio-primer` — "How loud a radio arrives"

The Wi-Fi track's opener, so it is held to the stricter opening rules: at most
four new words, no table in the picture, and the whole main path under 1000.

**Budget line** — `picture 466/650 · numbers 206/350 · practice 326/400 · total 998 (20 min)`

**Terms** (3): `RSSI`, `SNR`, `SINR` — exactly the owner table's three, each
glossed in plain words (how loud it arrives; how loud above the noise; how loud
above noise plus everyone else talking).

**Needs**: `[]` — the one lesson the contract lets have an empty `needs`.

**Picture**: a voice in a room → the two numbers a receiver keeps (RSSI, SNR) →
`watch` (block 3, jump 0: the first data frame, then step the four variants) →
what distance and walls take → the neighbour, and SINR. No table, no numeric
quantity in any paragraph.

**Numbers**: the RSSI formula with the per-wall prices; the four-distance table
(`Desk 1 m / Study 5 m / Living room 9 m + brick / Far wall 14 m + brick`, with
RSSI, SNR and the rate of its frames); the noise-floor formula; the `linkBudget`
widget preset to the living room; the neighbour's 9.5 dB.

**Pins moved / added.** Every pin of the old test survives, each now quoting the
sentence it guards:

| Claim | Where it lives now |
|---|---|
| `pathLossDb(1) = 46.7`, 9.0 dB a doubling, 30 dB a decade, `WALL_LOSS_DB`, brick ≈ 2.5× | numbers, the RSSI formula and its note |
| four-distance RSSI / SNR / Mbps against `linkBudget`, `buildLinkTable` and the first data frame; the 46 dB spread; 1530 octets | numbers, the four-place table + observe 1 |
| widget params → 75.3 dB path loss, 12 dB brick, −72.3 dBm, −94.0 dBm, 21.7 dB | numbers, the `linkBudget` caption |
| `NOISE_FIGURE_DB = 7`, −100.99, −93.99, the five widths, 3.01 and 9.03 dB | numbers, the noise formula + `deeper` table + quiz 2 |
| the mW sum: 3.99e-10, 3.16e-9, 3.56e-9, −84.48, 0.52, 21.66 → 12.16, 9.5 dB | numbers paragraph (the headline) + `deeper` steps (the arithmetic) |
| two equal interferers = −81.99 dBm, never −170 | `deeper` steps 4 + the old quiz 1's point |
| 353 / 107 acknowledgements in 100 ms, under a third | observe 2 |
| ACK 24/24/24/12 Mbps and 28/28/28/32 µs | `deeper`, "What the router's reply does" (new pin: data frames stretch 5–6×) |
| 4.5 / 9 / 18 m → −63.3 / −72.3 / −81.4 dBm, 9.0 dB steps | tryThis 1 |
| glass for brick → −63.3 dBm and 86.0 Mbps | tryThis 2 |
| 100 mW = 20 dBm, 31.6 mW = 15 dBm, 1 mW = 0 dBm, 5.85e-8 mW; node Tx powers | `deeper`, "Decibels" |
| `BAND_EXTRA_LOSS_DB['6g'] = 1.2` | `deeper`, the model paragraph |
| new: `COURSE_ORDER[0] === 'radio-primer'`, `needs = []`, `terms` are the owner table's three | the lesson-shape describe |

**`.body!` retired**: `tests/course/radio-primer.test.ts:125` (the `linkBudget`
widget lookup) now reads `radioPrimer.numbers!`.

**Moved to `deeper`, not dropped**: the decibel arithmetic (ratios vs dBm, the
+3/−3/+10 rules, "never add two dBm"), the step-by-step interference sum, the
noise floor of all five widths, the 3D/2D distance-and-wall rule, the 6 GHz
1.2 dB, and the router's-reply observation. Nothing was dropped.

---

## `decode-thresholds` — "Fast talk, and when a frame gets through"

**Budget line** — `picture 558/650 · numbers 316/350 · practice 363/400 · total 1237 (20 min)`

**Terms** (3): `MCS`, `OFDM`, `CCA` — the owner table's three. `MCS` is "how
fast the sender dares talk — one rung of a ladder of rates"; `OFDM` is "hundreds
of narrow sub-carriers side by side, each carrying a little of the frame at
once"; `CCA` is "the test a radio runs to decide whether it may start talking".

**Needs**: `['radio-primer']`.

**Picture**: talking fast needs a better line (the ladder, MCS) → many narrow
voices at once (OFDM, and why a higher rung needs a cleaner signal) → `watch`
(block 3, jump 0) → three questions, not one → clear channel and the twenty-
decibel gap in it.

**Numbers**: the three-questions table; the −82/−62 paragraph; the six printed
rungs; the `mcsLadder` widget at 21.5 dB; the ladder-as-contract paragraph; the
position table (RSSI, SNR, MCS, needs + 3 dB, airtime).

**Pins moved / added.** Every pin of the old test survives:

| Claim | Where it lives now |
|---|---|
| `CCA_PD_DBM`, `CCA_ED_DBM`, the 20 dB gap, `PREAMBLE_DETECT_SINR_DB`, `RATE_MARGIN_DB` | numbers, the three-questions table + the gap paragraph |
| the −70 dBm channel simulation (missed preamble → CCA idle; heard → busy) | quiz 2, unchanged |
| required SINR = sensitivity + 90.99 dB; MCS 0 needs 8.99 dB; 36 dB across the ladder; `mcsForRssi` over both modes | `deeper` formula + note (the derivation), with the 36 dB kept on the main path |
| the six printed rungs: MCS, bits per sub-carrier, Mbps, sensitivity, required SINR | numbers, "Six of the fourteen rungs" |
| widget at 21.5 dB = ⌊living-room SNR⌋, usable rungs 0–3, 19.99 / 23.99 dB | numbers, the `mcsLadder` caption |
| position table: RSSI, SNR, MCS, required + 3 dB, airtime; every data frame carries them; 12 rungs ≈ 5.93× the air | numbers, the position table + observe 1 and 2 |
| no retry, timeout, RX_FAIL or RX_MISS in any variant | observe 3 |
| 80 MHz far wall: −87.97 dBm, 9.89 dB, under the margin but over 8.99, still acknowledged | `deeper`, "Audible and useless" |
| 160 MHz far wall: −78.08, −84.96, 6.87 dB, preamble detected, every `RX_FAIL` `lowSinr`, timeouts | `deeper`, "Audible and useless" (was quiz 1) |
| 12 dBm far wall: −81.1 dBm, one rung down, 1476.0 µs | tryThis 1 |
| top rung 1 at 15.9 dB, 13 at 62.3 dB, 46.4 dB apart, HE ladder is 12 rungs | tryThis 2 |
| new: the scene is `radio-primer`'s own, variant for variant; `mcsForRssi` reproduces the position table's own MCS column | the lesson-shape and position-table tests |

**`.body!` retired**: `tests/course/decode-thresholds.test.ts:138` (the
`mcsLadder` widget lookup) now reads `decodeThresholds.numbers!`.

**Moved to `deeper`, not dropped**: the sensitivity-table derivation (the 10 dB
noise figure and 5 dB implementation margin the standard assumes, and why the
7 dB / 3 dB pair makes the 20 MHz shortcut exact), the whole wide-channel corner
case, and the three named simplifications. Nothing was dropped.

The old quiz 1 (the 160 MHz question) was replaced, because its answer now lives
in `deeper` and the contract asks the quiz to be answerable from the main path;
the new quiz 1 asks why the same 1530-octet frame costs 129.6 µs at the desk and
768.8 µs at the far wall, which the position table and the OFDM paragraph answer.

---

## Verification

- `npx tsc -b --noEmit` — clean.
- `npx vitest run tests/course/radio-primer.test.ts tests/course/decode-thresholds.test.ts` — 37 passed.
- `READABILITY_INCLUDE=radio-primer,decode-thresholds npx vitest run tests/course/readability.test.ts`
  — every rule green for both lessons.
- `npx vitest run tests/course` — 1145 passed, `lesson-hashes.json` included.

## For the controller

- `MIGRATING` in `tests/course/readability.test.ts` still lists `radio-primer`
  and `decode-thresholds`; the file is controller-owned, so this batch did not
  edit it. Until those two ids are removed, the suite's "every MIGRATING id is a
  real lesson still in the old shape" test fails on them — the only failure in
  `tests/course`. (It also failed on `airtime` while B2 was in flight.)
- `TIER1_BASELINE` cannot go yet: `frame-anatomy` is still unmigrated. When it
  does go, note that these two lessons deliberately own only the six words of
  the owner table. `EHT`, `HE`, `HT` and `VHT` are in `TIER1_BASELINE` but are
  assigned to no lesson in the table; `decode-thresholds` avoids them in prose
  (it writes "Wi-Fi 7" and glosses the widget button as "HE (Wi-Fi 6)"), so they
  still need an owner from some other batch before the baseline is deleted.

---

# Fix round 1 (review of 8f71af8)

All three Important findings and both Minors fixed. `radioLink.ts` and the
scenarios are still untouched, so `lesson-hashes.json` is still unchanged.

**Important 1 — unglossed BPSK / QPSK / QAM in the rung table.** The column
stays (a reader wants the names), and a short paragraph under the table now
glosses all three in plain words: "Each modulation name says how many symbols
the sender chooses between: two (BPSK), four (QPSK), then the 16, 64, 1024 and
4096 of the QAM (a grid of signal levels) family. The fraction after it is the
coding rate." The parenthetical form is what the contract's `definedInPlace`
rule recognises, so the three names are now introduced where the reader meets
them rather than relying on the `N()` blind spot the review identified. No new
`terms` entry was needed, and none was spent: the lesson still owns exactly the
owner table's MCS, OFDM and CCA. `deeper` gains "What the coding rate buys" for
the fraction itself (message versus repair, and why MCS 3 and MCS 7 name the
same families at different rates).

New pin: `decode-thresholds.test.ts`, "the modulation names count symbols, and a
name plus its fraction gives the bits" — for each printed row, the number in
front of `-QAM` is the symbol count, BPSK is two and QPSK is four, and
`log2(symbols) × rate` equals that row's own bits-per-sub-carrier from
`PHY_MODES.eht.ndbps`. A modulation name that stopped matching the ladder now
fails a test instead of misleading a reader.

**Important 2 — quiz 2 EN/ZH parity.** The sentence that existed only in ZH is
now in both: "Had you been listening when it began, −70 dBm would have held you
off." It is the claim `ccaAfter(false) === true` already pinned; the test's
comment now says so.

**Important 3 — "the widest channel here".** The numbers note names its width
instead of claiming a superlative `deeper` contradicts: "each doubling of the
channel adds 3 dB: at 160 MHz the floor has risen to −84.96 dBm." `deeper`'s
five-width table is unchanged and now contradicts nothing. The test's name and
comment follow the new wording, and `noiseDbm(160)` is pinned directly.

**Minor 1** — with the width named in the note, the ambiguity is gone; the
`deeper` table already carries every width, so no row was added to `numbers`
(it would have cost the budget for no new information).

**Minor 2** — `deeper`'s "Where the required ratio comes from" formula note now
opens "kTB is the thermal-noise formula the numbers section already used, so
this is the sensitivity with the noise the tables assumed taken back out".

**Budget lines after the fix**

- `radio-primer picture 466/650 · numbers 204/350 · practice 326/400 · total 996 (20 min)`
- `decode-thresholds picture 557/650 · numbers 336/350 · practice 376/400 · total 1269 (20 min)`

The new gloss paragraph and the quiz sentence were paid for inside
`decode-thresholds` by compressing the "two figures are not interchangeable"
paragraph, the `mcsLadder` caption, the ladder-as-contract paragraph and one
table cell; nothing was dropped and no pin moved.

**Gates**: `npx tsc -b --noEmit` clean; `npx vitest run
tests/course/readability.test.ts tests/course/radio-primer.test.ts
tests/course/decode-thresholds.test.ts` — 404 passed, 1 failed, and the one
failure is the shared bookkeeping assertion on `roles-stack`, another batch's
id that is migrated but still listed in `MIGRATING`. Both B1 ids are registered
and green.
