# B1 review — radio-primer, decode-thresholds (commit 8f71af8)

Verdict: **NEEDS FIXES**

## Important (must fix)

1. **decode-thresholds, numbers, "Six of the fourteen rungs" table — undefined acronyms in the Modulation column.**
   The table's Modulation cells (`src/course/tier1/decode-thresholds.ts:90-95`) read `BPSK 1/2`, `QPSK 1/2`,
   `16-QAM 1/2`, `64-QAM 5/6`, `1024-QAM 3/4`, `4096-QAM 5/6`. None of BPSK, QPSK or QAM is a term of this
   lesson, a term of an earlier lesson (`radio-primer` owns only RSSI/SNR/SINR), or in `KNOWN_WORDS`/
   `TIER1_BASELINE`. A beginner meets four unglossed acronyms in the lesson's own numbers table. The automated
   acronym check misses this only because the cells are written with `N()` (`en === zh`), which
   `cellTexts()` in `src/course/readability.ts` treats as a language-neutral symbol/log-line and skips — a
   loophole, not a pass. This is exactly the class of undefined word the contract's "introduces every acronym
   the tables and the practice use, too" rule exists to catch. Fix by glossing "modulation" in one clause of
   prose (the picture already explains bits-per-sub-carrier; one sentence naming BPSK/QAM as "the name of how
   many levels" would do it) or by moving the Modulation column's acronyms out of the main-path table into
   `deeper`.

2. **decode-thresholds, quiz 2 — EN and ZH assert different things.**
   `src/course/tier1/decode-thresholds.ts:179`. EN explain: "−82 dBm applies only to a frame whose preamble
   the radio detected. One that started during your own transmission counts as energy, and energy has to
   reach −62 dBm." ZH explain has an extra, unmatched sentence: "如果它开始时你正在侦听，−70 dBm 就足以把你按住"
   ("had it started while you were listening, −70 dBm would have been enough to hold you back"). This is a
   real, test-pinned claim (`tests/course/decode-thresholds.test.ts:110-115`, `ccaAfter(false)` returns
   `true`) but it only appears in ZH. The contract requires EN and ZH to "make the same claims with the same
   numbers." Either add the sentence to EN or drop it from ZH.

3. **radio-primer, numbers, "The floor of the room" — an unnamed, later-contradicted "widest channel."**
   The note (`src/course/tier1/radio-primer.ts:88`) says "on the widest channel here the floor has risen to
   −84.96 dBm" without ever naming which width that is (160 MHz — the reader only learns this two sections
   later, in quiz 2). Worse, `deeper`'s own "noise floor of every width" table lists 320 MHz at −81.95 dBm,
   which is wider and has a higher floor — so "the widest channel here" is false by the time a reader who
   opens `deeper` finishes the lesson. The new test's own comment concedes the ambiguity
   (`tests/course/radio-primer.test.ts:148-149`: "the lessons' own scene runs at 20 MHz, and 160 MHz is the
   width the quiz moves it to") but the lesson text never says so. Fix by naming the width in the numbers
   note ("...to −84.96 dBm at 160 MHz, the widest this course uses on the main path") or by dropping "widest"
   and just citing 160 MHz, since 320 MHz already appears (correctly, unclaimed as "widest") in `deeper`.

## Minor

- radio-primer, numbers, `linkBudget` widget caption and the "floor of the room" note sit in the same
  `numbers` block without a quantity to anchor "widest channel" — see Important #3; a table row naming the
  width would remove the ambiguity outright instead of just a wording fix.
- decode-thresholds, `deeper`, "Where the required ratio comes from" — `kTB(20 MHz)` is used with no gloss.
  Acceptable under the contract (acronym rule and word budgets don't reach `deeper`), but a beginner who opens
  `deeper` right after the main path (many will, since it's one click away and the lesson invites it via "Go
  and look") hits an unexplained symbol. Consider one clause ("kTB, the thermal-noise formula the numbers
  section already used").
- Both lessons: EN/ZH otherwise read as faithful pairs — dumped both languages for both lessons and found no
  other divergence in claims or numbers.

## Verified clean (no findings)

- Fixture untouched: `git diff 08a27bd 8f71af8 --stat` shows no `tests/fixtures/lesson-hashes.json` entry.
- Every pin in the pre-rewrite tests (`tier1-radio-primer.test.ts`, `tier1-decode-thresholds.test.ts`)
  survives in the new files, checked value-by-value: path-loss constants, wall losses, four-place table,
  noise-figure/noise-floor-per-width, the −85 dBm neighbour sum and its steps, the ACK rates/airtimes, the
  353/107 ACK count, both tryThis pins, the sensitivity-ladder derivation, the six printed rungs, the
  mcsLadder widget snr, the position table, the 80/160 MHz corner cases, and the 12 dBm tryThis. No pin was
  dropped or turned into a tautology.
- `.body!` lookups retired in both test files (`radioPrimer.numbers!`, `decodeThresholds.numbers!`).
- Owner-table words present in `terms`, exact spelling: radio-primer → RSSI, SNR, SINR; decode-thresholds →
  MCS, OFDM, CCA.
- radio-primer total 998 words ≤ 1000 (track-opener budget); decode-thresholds 1237, within 500–1300.
- `npx vitest run tests/course/radio-primer.test.ts tests/course/decode-thresholds.test.ts` — 37/37 passed.
- `READABILITY_INCLUDE=radio-primer,decode-thresholds npx vitest run tests/course/readability.test.ts` —
  367/367 passed (though see Important #1 — this suite has a blind spot for language-neutral table cells).
- Quizzes for both lessons are answerable from the main path (verified by beginner read).
