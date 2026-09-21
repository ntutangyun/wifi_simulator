# Batch 1 review — uwb-sstwr, uwb-dstwr (commit 84261ae)

Reviewed read-only in `D:\wifi_sim\.claude\worktrees\feat-link-2g`. No edits made.

## Verdicts

- **uwb-sstwr: READY**
- **uwb-dstwr: READY, one fix strongly recommended before merge** (the truncated
  quiz distractor and the ZH-only added clause below are cheap to fix and are
  the kind of thing that erodes trust in the ZH edition if left).

## Counts by severity

- High: 0
- Medium: 2 (both in uwb-dstwr)
- Low: 2 (one per lesson)

---

## Part 1 — beginner read

Persona: Tier-1 Wi-Fi + skimmed `terms` of `uwb-intro` and `uwb-frame` (so
RMARKER, RCTU, UWB, anchor are known going in; GDOP is not — it is first
defined in `uwb-geometry`, module 12, which comes *after* this module-11 pair).

### uwb-sstwr — en

- First unfollowable sentence: none.
- Unexplained words: none in the main path. `RMARKER` and `RCTU` (used in
  "deeper") are pre-taught by `uwb-intro`, consistent with the persona.
- Paragraphs with >1 idea: none found — each `picture` paragraph carries one
  claim.
- Contradictions: none.
- Opens with problem + for whom: yes — "The lessons so far let both radios
  keep perfect time... Here that goes wrong by metres" states the problem;
  "for whom" (a ranging phone/anchor pair) is established by the immediately
  following outcomes and the `you need` line.
- Sent to simulator early with a preview prompt: yes — second `picture`
  section, `[WATCH → the first range: raw is 6 m long]`, tells the reader
  exactly what they will see ("read what it believes instead").
- Quiz answerable from main path: yes, all three questions turn on ideas
  stated in `picture`/`numbers` (reply-scaled error, Coffs as a measured
  receiver by-product, and the residual growing with wait time).
- Datasheet-register sentences: none — the "now the numbers" section reads as
  worked arithmetic, not as spec paraphrase.

### uwb-sstwr — zh

- First unfollowable sentence: none.
- Unexplained words: none beyond the en edition's.
- Paragraphs with >1 idea: none.
- Contradictions: none, and none against the en edition.
- Opens with problem + for whom: yes, mirrors en.
- Sent to simulator early with preview: yes, mirrors en.
- Quiz answerable from main path: yes.
- ZH sentences that read translated: none stood out — the ZH edition is
  idiomatically written (e.g. "谁也不知道", "剩下的是应答时长的一半乘以两端速率之差"
  read as native technical prose, not calque).
- Datasheet-register sentences: none.

### uwb-dstwr — en

- First unfollowable sentence: none.
- Unexplained words: **`GDOP`** appears unexplained in "deeper" → "The same
  number, computed twice": *"...GDOP 1.00 for this symmetric ring."* GDOP is
  not defined until `uwb-geometry` (module 12), which this pair (module 11)
  does not require and is read before. Low severity — it's in the optional
  `deeper` tier, the sentence is still parseable without knowing the term
  (it reads as "a dilution-of-precision number, here 1.00"), but a first-time
  reader following the "deeper" tier top-to-bottom will hit an undefined
  acronym. **Fix**: either drop "GDOP 1.00 for this symmetric ring" (the
  sentence's point — "2 cm out" — survives without it) or gloss it inline
  ("GDOP, the layout's own error multiplier, is 1.00 here").
  File: `src/course/uwb/uwb-dstwr.ts:167` (en), `:168` (zh, same issue).
- Paragraphs with >1 idea: none.
- Contradictions: none within the en edition.
- Opens with problem + for whom: yes — "Measuring the other radio's clock
  works, but it leaves a residue... There is a way to be rid of the waiting."
- Sent to simulator early with preview: yes — `[WATCH → the Final: one frame
  for four anchors]`, second `picture` section, with "Everything after it is
  bookkeeping" telling the reader what to expect.
- Quiz answerable from main path: yes.
- Datasheet-register sentences: none.
- **Quality bug (low severity)**: the first quiz option for "What does the
  extra message cost, and what does it not buy?" is a truncated sentence:
  *"Nothing measurable: 9.67 % of the round radiates against 9.56 %, and the
  noise goes"* — missing a predicate ("...and the noise goes [away? untouched?
  down?]"). It is the wrong-answer distractor (test pins `answer: 1`, so this
  never scores wrong), so it does not break the contract, but it reads as an
  editing artifact.
  File: `src/course/uwb/uwb-dstwr.ts:234` (en only; the zh at the same line
  reads as a complete sentence — "噪声也一并没了" — so the truncation is en-only).
  **Fix**: complete the sentence, e.g. "...and the noise goes untouched."

### uwb-dstwr — zh

- First unfollowable sentence: none.
- Unexplained words: same GDOP issue as en, same location.
- Paragraphs with >1 idea: none.
- **Contradiction / ZH-only added claim (medium severity)**: in "Two halves
  and the answer", the en sentence is *"Note the symmetry that is absent: the
  anchor answering last waits four times as long as the first, yet every
  result lands inside 6 cm."* The zh sentence adds a clause with no en
  counterpart: *"...而手机在发 Final 前等的只有四分之一——每个结果却都落在 6 cm 以内"*
  ("...while the phone, before sending the Final, waits only a quarter as
  long — yet every result lands inside 6 cm"). This is new content, not a
  translation of the en sentence, and it is not obviously true or explained
  anywhere in the lesson (there's no stated "phone's wait" quantity to be "a
  quarter" of anything in context — the phone's wait for the Final is fixed by
  when the last response arrives, not by a ratio to the anchors' reply times).
  This reads like an editing slip (a leftover draft clause) rather than a
  reviewed claim, and it makes the two locales diverge in what they assert.
  File: `src/course/uwb/uwb-dstwr.ts:132` (zh) vs `:131` (en).
  **Fix**: either remove the added clause to match en, or — if the claim is
  intended and correct — add the equivalent clause to the en string and add a
  test pin for it.
- Opens with problem + for whom: yes, mirrors en.
- Sent to simulator early with preview: yes, mirrors en.
- Quiz answerable from main path: yes.
- ZH sentences that read translated: one candidate — "再留意这里并不存在的那种对称"
  (line 132, the same sentence flagged above) reads as a calque of the English
  "note the symmetry that is absent" (an awkward nominalization, "这里并不存在的
  那种对称", that a native technical-writing pass would more likely render as
  "留意一点：这里并不对称" or similar). No other candidates found in the two
  lessons' zh editions.
- Datasheet-register sentences: none.

---

## Part 2 — pins and contract

### Test inventory diff, a6fb16c → 84261ae

Compared `it()` titles of `tests/course/uwb-sstwr.test.ts` and
`tests/course/uwb-dstwr.test.ts` at `a6fb16c` against the current files.

- Every pin present at `a6fb16c` is still checked at `84261ae`, either
  unchanged, reworded to match the rewritten prose, or absorbed into the
  shared `lessonShapeSuite`/`kit.ts` contract (scenario-schema pass, study-time
  formula, both-languages-present walk, jump-target existence). Confirmed by
  reading `tests/course/kit.ts:118-190`, which implements these generically
  for every migrated lesson.
- No pin was weakened. Several were strengthened: e.g. the jump-order/last-
  jump-index pin (`uwb-sstwr.test.ts:99-110`) still asserts the exact jump
  label list *and* that the fourth jump's predicate uniquely matches the
  fourth range record — same rigor as before, same location relative to the
  rewritten sentence.
- New pins were added for content that didn't exist before the rewrite (e.g.
  `uwb-sstwr.test.ts:504` "every cell of the crystals table...", `uwb-dstwr.test.ts:665`
  "every cell of the noise table...", `uwb-dstwr.test.ts:694` "the per-slot
  sigma is what a hundred seeds actually measure").
- Test counts: uwb-sstwr 27 `it`s at both commits; uwb-dstwr grew from 35 to
  36 `it`s (net: some folded into `kit.ts`, more added for new tables/claims).

### Numbers pinned

Every load-bearing number quoted in prose in both lessons (the four raw
ranges 9.51/15.47/21.49/27.42 m, the four corrected ranges, the residual
sigmas, the RCTU counter values, the DS-TWR halves table, the frame airtime
table, the FoM byte 0x16/97%/0.5 ns, the fix (5.01, 3.98) m / 2 cm / GDOP 1.00)
is pinned against either the engine's own exports (`ssTwrRaw`, `ssTwrCorrected`,
`dsTwr`, `rangeSigmaM`, `fomDecode`) or the recorded simulation run (`runOf`),
not re-typed as a literal — confirmed by reading the assertion bodies, not
just the titles, for the numbers tables in both files.

### `.body!` gone

`grep -n "\.body!"` across both test files and both lesson source files:
no matches. Confirmed gone.

### Kit used

Both test files open with `lessonShapeSuite(uwbSstwr, {...})` /
`lessonShapeSuite(uwbDstwr, {...})` from `tests/course/kit.ts`, and both use
`runOf`/`ofType` from the same kit for their own simulation-derived pins,
consistent with the doc comment at the top of each test file. Confirmed by
reading `tests/course/uwb-sstwr.test.ts:1-30` and
`tests/course/uwb-dstwr.test.ts` imports.

### Mechanism spot-checks (3 per lesson) against `src/uwb`

**uwb-sstwr**
1. Raw/corrected formulas — `src/uwb/ranging.ts:4-11`:
   `ssTwrRaw = (tround - treply) / 2`,
   `ssTwrCorrected = (tround - treply*(1 - coffs)) / 2`. Matches the lesson's
   printed formulas exactly, operand for operand.
2. Coffs as a measured, not assumed, quantity — `src/uwb/device.ts:1533`:
   `coffs = (responderPpm - initiatorPpm) * 1e-6 + gaussian(rng) * cfoNoisePpm * 1e-6`,
   i.e. the true rate difference plus a noise term standing in for
   measurement error — consistent with the lesson's "measured rather than
   assumed" framing and with the quiz's correct answer (receiver's own lock,
   not a datasheet).
3. Figure of Merit byte — `src/uwb/phy.ts:341` `FOM_LOS = 0x16 // model: 97 %
   within 1 ns × 0.5`, decoded by `fomDecode`/`fomText`. Matches the lesson's
   "0x16 here: ... 97 % ... ±0.25 ns" exactly.

**uwb-dstwr**
1. DS-TWR formula — `src/uwb/ranging.ts:14-16`:
   `dsTwr = (tround1*tround2 - treply1*treply2) / (tround1+tround2+treply1+treply2)`.
   Matches the lesson's printed formula exactly, and is the same function
   called from both lanes (`src/uwb/device.ts:1140,1148`), consistent with the
   "same four counters through the same function" claim.
2. "The wall the formula cannot see" — an NLOS excess delay is added to first-
   path arrival before timestamping (`src/uwb/device.ts:192,223,772`
   comments: "the excess delay of an obstructed first path, as for any other
   reception"), so it delays all three/four receive stamps identically and
   is not cancelled by the DS-TWR division — consistent with the lesson's
   claim that it's added straight to the range, not halved.
3. GDOP = 1.00 for the symmetric ring — consistent with `uwb-geometry.ts:123`'s
   general result "2/√N — 1.00 at four anchors" for evenly-spread bearings,
   which is exactly this scene's ring geometry.

### Test run

```
npx vitest run tests/course/uwb-sstwr.test.ts tests/course/uwb-dstwr.test.ts tests/course/readability.test.ts
```
Result: 3 files, 173 tests, all passed.

---

## Findings by severity

**Medium**
1. `src/course/uwb/uwb-dstwr.ts:132` (zh) — added clause not present in the
   en sentence at `:131`, asserting an unverified/unexplained "phone waits a
   quarter as long" claim. Locales diverge in content. Fix: remove the clause
   from zh (match en) or substantiate + mirror it in en with a test pin.

**Low**
2. `src/course/uwb/uwb-dstwr.ts:234` (en) — quiz distractor option is a
   truncated sentence ("...and the noise goes"). Never scored (it's the wrong
   answer), but reads as an editing artifact. Fix: complete the sentence.
3. `src/course/uwb/uwb-dstwr.ts:167-168` — `GDOP` used unexplained in
   "deeper" before its definition in `uwb-geometry` (module 12). Fix: drop
   the GDOP mention or gloss it inline.
4. (Tracking, not a defect) The same "reads translated" sentence as finding 1
   (`uwb-dstwr.ts:132`, zh) is also the one ZH sentence in either lesson that
   reads like a calque rather than native technical prose.

No high-severity findings. No pin was weakened or lost. `.body!` is gone.
Both lessons are otherwise clean: one idea per paragraph, an early
watch-prompt that tells the reader what they'll see, quizzes answerable from
the main path, and no datasheet-register prose in either language.
