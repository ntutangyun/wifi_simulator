# Task 3 report — `amp-intro` rewritten, `amp-ppdu` split out

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, base `fe99177`.
Commit: **`d7078c7`** — feat(course): amp-intro rewritten zero-to-hero — a tag with no battery; the PPDU split into amp-ppdu (8 files, +754/−302).

## What I built

`amp-intro` is now the AMP track's true first lesson, written to the zero-to-hero contract: a
battery-free tag cannot listen, so the router does the asking, and one round of that asking is
told in plain words before a single microsecond appears. The frame anatomy — the legacy Wi-Fi
opening in front of on–off keying, AMP-Sync, AMP-SIG, the padding, the three frames' airtimes
and the rate scaling — became `amp-ppdu`, "A frame a tag can hear", which loads the same scene.

### Measurements

| lesson | `lessonWords` | headroom to 1300 | `lessonMinutes` | picture blocks | numbers blocks | observe / tryThis / quiz |
|---|---|---|---|---|---|---|
| `amp-intro` | **1285** | 15 | **15** (cap 20) | 8 (first `watch` at index 2, no table) | 7 | 2 / 1 / 3 |
| `amp-ppdu` | **1284** | 16 | **15** (cap 20) | 7 (first `watch` at index 2) | 5 | 2 / 1 / 3 |

Both within the spec's binding 500–1300 / ≤ 20 min. The word count, not the study time, is the
ceiling that bites; both files carry a CAUTION header stating the exact headroom (the Task 2
reviewer's Minor 3 on `uwb-intro`).

`terms`: `amp-intro` has exactly four (AMP, tag, slot, ABOC) as the first lesson of the track, and
no table in `picture`. `amp-ppdu` has six (OOK, Manchester, preamble, AMP-Sync, AMP-SIG, padding).
Every one is spelled out in plain words at its first use inside `picture` as well as in the table.

### Wi-Fi reminders for a reader arriving straight from Tier 1

- **carrier sense** — glossed in `amp-intro` picture 0: "a receiver kept running to hear if anyone
  else is talking".
- **NAV** — same paragraph: "the countdown a station keeps from the lengths it hears".
- **CTS** — `amp-intro` picture 1: "a CTS addressed to itself, a very short frame whose whole
  content is a length of time".
- **SIFS** — never named as SIFS on the main path; it is "one gap", stated as 10 µs in `numbers`.
  The identity with the band's own SIFS is in `sources`, where the citation belongs.
- **legacy preamble** — `amp-ppdu` picture 1, and `preamble` is a `terms` entry marked "met in
  Tier 1, reminded here".
- **TXOP** is not used by either lesson.

## Test inventory: moved / kept / added

Old `tests/course/amp-intro.test.ts` at `fe99177`: 5 describes, 22 `it`s. Now 25 + 17 = 42.

### Moved to `tests/course/amp-ppdu.test.ts` (with their sentences)

| old test | where now |
|---|---|
| `padding is 20 µs unprotected and 36 µs protected…` | `amp-ppdu.test.ts` "what a downlink frame is made of" (strengthened: also pins `AMP_SIFS_NS`, the gap the padding buys time inside) |
| `the downlink PPDU is 32 µs of legacy preamble, 80 µs of AMP-Sync, then OOK` | same describe, **strengthened**: now also asserts the engine's real segment order `legacyPreamble, signal, usig, ampSync, ampSig, ampData, padding, signalExt` and that the first three sum to the 32 µs the lesson calls "the legacy opening" |
| `the uplink PPDU has no legacy preamble…` | same describe (kept whole) |
| `the three frames are 13, 4 and 15 octets` | same describe |
| `at 250 kb/s the airtimes are 618, 330 and 528 µs; at 1 Mb/s, 258, 186 and 132 µs` | same describe |
| `at 250 kb/s the trigger is longest… only the response scales by four` | same describe |
| `the CTS-to-self is 44 µs at 6 Mb/s plus the 6 µs signal extension` | same describe, rewritten as `an ordinary Wi-Fi CTS of fourteen octets takes 50 µs, a sixth of the four-octet Ack` — it now guards the new contrast sentence and additionally pins `CTS_BYTES === 14`, the run's own CTS frame and `330 µs > 6 × 50 µs` |
| `at 1 Mb/s the same round is 1670 µs, 1.67 %…` | `amp-ppdu.test.ts` "the 1 Mb/s experiment" (the `tryThis` moved) |
| `the Ack’s ID field names the tag…` | `amp-ppdu.test.ts` "what the frame detail shows" |
| `the Ack PPDU spends 128 µs of its 330 µs…` | same describe |
| `the trigger’s six-octet body…` | same describe |

### Kept in `tests/course/amp-intro.test.ts`

`AMP SIFS is 10 µs` (re-quoted against the new prose and `sources`); the model values −72/8/10/−94;
the whole "shape of one round" describe (CTS one SIFS before the trigger, the 4140 → 4190 µs
reservation, slot 1/slot 2 timing, the full timeline table, the 4190 µs / 4.19 % formula, the
3044 / 90 / 1056 split); the whole "second of polling" describe (ten rounds / forty slots / forty
Acks / sixteen naming a tag, 8-and-2 per tag, the inspector's 10 / 8 / 2, the ACW/ABOC arithmetic
and the sit-out condition, the two collisions with all four timestamps, the no-CCA_BUSY/
BACKOFF_DRAW/IFS_START claim, the absent NAV_SET, the link budget); the deafened-Door-tag
experiment; the log-line formats.

### Added

- `amp-intro.test.ts`: a new **lesson shape** describe (contract shape, four terms, no picture
  table, first `watch` < 3, `needs`, scenario equals `ampIntroScenario({250,250})`, 500–1300
  words / ≤ 20 min plus a prose sub-window, jump targets, a bilingual walk over every `L10n`
  including `deeper` and `sources`), and a new pin `a protected AMP frame pads 36 µs where an
  unprotected one pads 20 µs` guarding the `deeper` protection paragraph (the padding *mechanism*
  is pinned next door; the comment says so).
- `amp-ppdu.test.ts`: the mirror shape describe, including `expect(ampPpdu.scenario()).toEqual(
  ampIntroScenario({250,250}))` and the same for the variant — the split's promise, pinned, so the
  identical fixture pair is a proof rather than a coincidence; plus a new pin
  `the trigger’s segment strip adds up to the formula, legacy half first`
  (`[16, 4, 12, 80, 64, 416, 20, 6] µs`, summing to 618 µs) guarding the new `observe` item.

Nothing was dropped and nothing weakened. Every test comment was re-quoted against the final
prose (the Task 2 reviewer's Minor 4).

## Every number that stays in prose, and its pin

### `amp-intro`

| number, where | pin |
|---|---|
| timeline table: 0/50, 60/678, 688/1216, 1226/1556, 1566/2094, 2104/2434, 2444/2972, 2982/3312, 3322/3850, 3860/4190 µs; "4 slots × 528 µs"; "Duration 4140 µs" | `the first round runs to the timeline table…`, `the round opens with a CTS-to-self…`, `the CTS Duration of 4140 µs…` |
| "50 µs" (CTS), "one gap later", "Every gap here is 10 µs" | `the round opens with a CTS-to-self one SIFS before the trigger`, `AMP SIFS is 10 µs…` |
| 678 + 10 = 688 µs; 1556 + 10 = 1566 µs | `slot 1 starts one AMP SIFS after the trigger ends…` |
| `50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 4.19 % of 100 ms` | `the round costs 4190 µs of channel, 4.19 % of each 100 ms` |
| 3044 / 90 / 1056 µs | `of those 4190 µs, 3044 µs are PPDU, 90 µs are SIFS gaps and 1056 µs are two silent slots` |
| 100 ms, ten rounds, forty slots, forty Acks, twenty answers, sixteen / twenty-four, 8 and 2 | `one second holds ten rounds…`, `each tag answers all ten rounds…` |
| ACWE 2, ACW = 2² − 1 = 3, ABOC ∈ {0,1,2,3}, slot ABOC + 1 | `a draw of 3 lands in slot 4, so with ACW + 1 = N neither tag ever sits a round out` |
| 201 216, 502 972, 201 556, 503 312 µs | `the two losses are the two rounds in which both tags drew the same slot` |
| −37.4, 34.6, −72, −57.4, 36.6, −94 dBm | `the link budget leaves both tags far above the thresholds that matter` |
| observe: 678 → 688, 1556 → 1566 µs, 10 µs | `slot 1 starts one AMP SIFS…` |
| observe: log strings, 10 / 8 / 2 | `the log prints the ABOC draw…`, `the inspector counters…` |
| tryThis: −37.4 dBm, forty slots / forty Acks | `a Door tag deafened past its received −37.4 dBm…` |
| quiz 2: 128 µs — *removed*; quiz now carries no unpinned figure | — |
| `deeper`: 4140/50/4190/528 µs, 36 vs 20 µs, ACW + 1 > N, 0 dBm / 20 dBm / 36.6 dB, −94 vs −82 ≈ 12 dB, NAV_SET | `the CTS Duration of 4140 µs…`, `a protected AMP frame pads 36 µs…`, `a draw of 3 lands in slot 4…`, `the link budget…`, `no lane in this scene ever sets a NAV` |

### `amp-ppdu`

| number, where | pin |
|---|---|
| `32 + 80 + 64 + 416 + 20 + 6 = 618 µs` and every term of the note (incl. 16 µs at 1 Mb/s) | `the downlink PPDU is a legacy preamble, then AMP-Sync, AMP-SIG, the data and the padding` |
| three-frames table: 13/4/15 octets, 618/330/528 and 258/186/132 µs | `the three frames are 13, 4 and 15 octets`, `at 250 kb/s the airtimes are…` |
| 7 octets (identity-only answer); 528 → 132 µs; 138 µs; 618 → 258 µs | `the three frames are 13, 4 and 15 octets`, `at 250 kb/s the trigger is longest…` |
| padding table: 20 µs / 36 µs (cited cells) | `padding is 20 µs unprotected and 36 µs protected…` |
| 128 µs of 330 µs, 202 µs; CTS fourteen octets / 50 µs / 44 µs / 6 Mb/s / 6 µs; "under a sixth" | `the Ack spends 128 µs of its 330 µs…`, `an ordinary Wi-Fi CTS of fourteen octets takes 50 µs…` |
| observe: 1226 µs, 2982 µs, 330 µs, four octets, two octets; 16/4/12/80/64/416/20/6 µs, 6-octet body | `the Ack’s ID field names the tag…`, `the trigger’s segment strip adds up to the formula…`, `the trigger’s six-octet body…` |
| tryThis: 318, 328, 1670, 4190 µs, 1.67 %, 4.19 %, 1620 µs | `at 1 Mb/s the same round is 1670 µs, 1.67 % of each 100 ms` |
| quiz: 20 µs, 10 µs, 330 µs, 250 kb/s, 128/202 µs | `padding is 20 µs…`, `the Ack spends 128 µs of its 330 µs…` |

`picture` in both lessons carries **zero** numeric quantities in either language, well inside the
contract's two-per-paragraph, and no citation token.

## TDD evidence

**RED** — after splitting the tests and before writing either lesson
(`npx vitest run tests/course/amp-intro.test.ts tests/course/amp-ppdu.test.ts`):

```
 ❯ tests/course/amp-ppdu.test.ts  — Error: Failed to load url ../../src/course/amp/amp-ppdu
 × amp-intro · lesson shape > is written to the zero-to-hero contract
     → expected undefined to be true              (isMigrated)
 × amp-intro · lesson shape > fits one sitting: 500–1300 words…
     → expected 2014 to be less than or equal to 1300
 × amp-intro · lesson shape > every jump target occurs in the base run
     → TypeError: ampIntro.picture is not iterable
 × amp-intro · lesson shape > every string a learner reads exists in both languages
     → expected 28 to be greater than 40
      Tests  4 failed | 21 passed (25)
```

Expected: `amp-ppdu` did not exist, and `amp-intro` was still the 2014-word old shape.

**GREEN** — after writing both lessons, registering and shrinking `MIGRATING`:

```
npx vitest run tests/course/amp-ppdu.test.ts tests/course/amp-intro.test.ts \
               tests/course/readability.test.ts tests/engine/lesson-hashes.test.ts
 ✓ tests/course/readability.test.ts (31 tests)
 ✓ tests/course/amp-ppdu.test.ts (17 tests)
 ✓ tests/course/amp-intro.test.ts (25 tests)
 ✓ tests/engine/lesson-hashes.test.ts (1 test)
      Tests  74 passed (74)
```

`readability.test.ts` went from 17 to 31 tests — 3 bookkeeping + 7 rules × 4 migrated lessons —
so the contract really grades both new lessons.

## Gates

| command | result |
|---|---|
| `npx vitest run tests/course` | **31 files, 775 tests passed**, output pristine |
| `npx vitest run` (full) | **127 files, 1939 tests passed** |
| `npx tsc -b --noEmit` | clean, exit 0, no output |
| `npm run build` | `✓ built in 3.38s` (only the pre-existing chunk-size advisory) |
| `git diff --numstat tests/fixtures/lesson-hashes.json` | `2 0` — exactly two added lines, `"amp-ppdu": "f1e44e52"` and `"amp-ppdu#0": "94328b86"`, byte-equal to `amp-intro` / `amp-intro#0` |
| `tests/fixtures/uwb-record-hashes.json` | untouched (absent from `git status`) |

## Deviations from the content contract, and why

1. **Word budget forced depth into `deeper`.** The brief's `numbers` list for `amp-intro` (timeline
   table + round formula + second-of-polling + ACW/ABOC arithmetic + link margin) plus its `picture`
   list came to ~1720 words against the spec's binding 1300. Per the controller's ruling that the
   spec binds, three pieces moved to `deeper`, which the spec explicitly designates for depth that
   will not fit: **(a)** the sit-out condition `ACW + 1 > N` and why neither tag ever sits out,
   **(b)** the "−94 dBm is about 12 dB below −82 dBm" comparison and the rate-for-sensitivity
   trade, **(c)** the `NAV_SET` explanation. The `numbers` link-margin paragraph survives in short
   form (−37.4/34.6/−72 down, −57.4/36.6/−94 up), as the brief asked. No quiz answer depends on
   `deeper`.
2. **"Where to read it" list dropped from `amp-intro`'s `numbers`.** Its two surviving items (the
   log-line formats, the inspector counters) were folded into `observe` item 2, which is where the
   reader is at the simulator anyway. Its third item (frame detail, trigger body, Ack ID field)
   went to `amp-ppdu` as the brief directed. The `fmtRecord` pin moved with the sentence.
3. **The CTS-to-self length pin went to `amp-ppdu` with a new sentence.** The brief's Step 1 sends
   it there, but the brief's `amp-ppdu` content contract does not mention the CTS. Rather than
   leave a pin without prose, I gave `amp-ppdu`'s "Where an Ack's 330 µs goes" a CTS comparison
   (fourteen octets in 50 µs against four octets in 330 µs), which is the lesson's own thesis made
   concrete. `amp-intro` keeps the 50 µs in its timeline table, pinned by its own test.
4. **`amp-ppdu` has no `deeper`.** Nothing needed it; the brief did not ask for one.
5. **The picture's `AMP SIFS` is called "one gap", never "SIFS".** `SIFS` is in `TIER1_BASELINE`,
   so the rule would have allowed it, but a reader arriving from Tier 1 reads "gap" more easily and
   the exact 10 µs is one line down in `numbers`. The citation (SFD PM-96) and the identity with
   the band's SIFS are in `sources`.
6. **`amp-intro`'s jumps are five, not six.** `first Ack for an empty slot` moved to `amp-ppdu`,
   whose `observe` opens that very frame; the brief lists it among `amp-ppdu`'s jumps.
7. **Titles/labels in the timeline table were shortened** (`AMP Ack₁ → Door tag` → `Ack₁ → Door
   tag`) purely to buy words; the ZH side spells them out (`第 1 帧 Ack → Door tag`).

## Self-review findings, fixed before committing

- The `ppduLayout` assertion I first wrote assumed a single `legacyPreamble` segment; the engine
  emits `legacyPreamble | signal | usig` (16 + 4 + 12 µs). Fixed, and the test now pins that those
  three sum to the 32 µs the lesson calls "the legacy opening" — which also made the new `observe`
  item truthful (`16, 4 and 12 µs of legacy opening`) rather than hand-waving "32 µs".
- The CTS assertion double-counted the signal extension: `frame.txTimeNs` already includes it
  (56 000 vs 50 000). Fixed with a comment saying so.
- **EN/ZH parity sweep.** Six places where a trim had left the ZH carrying a clause the EN no
  longer had (or vice versa) were reconciled: the 10 µs-gap sentence, the CTS paragraph, the
  lost-answer `watch`, the "not out of manners" clause, and three quiz strings (the ZH had kept
  "标签三样都没有", "哪一个都解不出来" and "超过三十分贝"). Also `uniformly` → "at random" on both
  sides, so the pinned uniform draw is stated in both languages.
- A comma splice in `deeper` ("…to be received at all, at a quarter of a megabit a second, a
  receiver can…") became two sentences.
- `amp-ppdu`'s ZH used straight `"…"` quotes in five places where the rest of the course uses
  `“…”`; normalised.
- Table cells `AMP Ack₁ → Door tag` had `en === zh`, which the new bilingual walk rejects (and
  which is a genuine translation gap); the ZH cells now read `第 1 帧 Ack → Door tag`.

## Concerns

1. **Word-budget headroom is 15 words (`amp-intro`) and 16 (`amp-ppdu`).** Both CAUTION headers say
   so, but any reviewer fix that adds a sentence must delete one. This is the same squeeze Task 2
   reported (`uwb-intro` shipped with 9).
2. **`amp-coexist.ts:58` now says "前两课里标签独占一条信道" ("in the previous two lessons").** With
   `amp-ppdu` inserted it is preceded by three AMP lessons. That file is outside my ownership and
   is still in `MIGRATING`; the slip should be fixed when `amp-coexist` is rewritten. `amp-slots.ts`
   says "第一课里…", which stays true.
3. **Another writer is active in this worktree.** `git status` showed uncommitted changes to
   `src/engine/{ampReader,channel,mac,simulation}.ts`, `src/model/view.ts`, `src/ui/{Inspector.tsx,
   i18n.ts,glossary.ts}` and four engine/model/ui test files that are **not mine** — the same
   condition Task 1 reported. I staged my eight paths explicitly; the commit contains none of the
   others. Two consequences: the green full-suite run was taken with those foreign edits in the
   tree (my first attempt failed on a mid-edit syntax error in `src/ui/glossary.ts`, which that
   writer fixed seconds later and which is unrelated to this task), so it is not a measurement of
   the committed tree alone; and if the controller expected exclusive access here, it did not hold.
4. **Rendering is unverified.** vitest runs in node, so `CoursePanel`'s `<details>`, the `needs`
   links and the two `watch` call-outs are covered only by `tsc` and `npm run build`. `amp-intro`
   is the first lesson to render a four-block `deeper`.
5. **ZH prose quality has had no second pair of eyes.** The Chinese was written fresh (not
   translated) and I checked it for parity, paragraph length and citation tokens, but the novice
   reader's seat is the one that decides whether it reads as Chinese.
6. **`quiz` answers are derivable from the main path** by my reading — Q1 and Q3 of `amp-intro`
   from `picture`, Q2 from `picture` plus the link-margin line; all three of `amp-ppdu` from
   `picture` and `numbers`. Nothing depends on `deeper` or `sources`. Worth confirming in the
   novice read.

---

# Fix round 1

Commit: **`070f21a`** — fix(course): amp-intro and amp-ppdu review — AMP-Sync/AMP-SIG and U-SIG in plain words, one bilingual walk for every lesson test, ZH-side readability checks (8 files, +232/−171).

Sources: `task-3-review-report.md` (Critical 0 · Important 2 · Minor 6) and `task-3-novice-read.md`
(`amp-intro` READY with polish, `amp-ppdu` NEEDS A PASS), plus three items deferred from Task 1.

## Measurements after the round

| lesson | `lessonWords` | headroom to 1300 | `lessonMinutes` |
|---|---|---|---|
| `amp-intro` | 1288 | 12 | 15 |
| `amp-ppdu` | 1285 | 15 | 15 |
| `uwb-intro` | 1291 | 9 | 20 |
| `uwb-frame` | 1270 | 30 | 15 |

## Important 1 — AMP-Sync and AMP-SIG spelled out in `picture`

The watch block now reads "…the legacy opening a Wi-Fi radio reads; then AMP-Sync, a run of
flashes that lets the tag find the beat; then AMP-SIG, two octets saying what frame follows and
how long it is; then the data octets, and the padding at the end." Both terms are now glossed at
first use inside `picture`, as the spec's First-use rule requires. Paid for by trims elsewhere in
the same lesson (see the word table above).

## Important 2 — one bilingual walk, exported once

`src/course/readability.ts` gained `lessonStrings(l: Partial<Lesson>): L10n[]`, beside
`paragraphTexts`. It walks `why`, `outcomes`, `terms` (each `plain` line — a `term` is the
standard's own spelling and carries no translation), `picture`, `numbers`, `deeper`, `sources`,
`observe`, `tryThis` and `quiz`, skipping `scenario` and `find`. It takes a `Partial<Lesson>` so
one field can be asked for at a time, which is how the citation rule is applied field by field.

The ~20-line `isL10n` + `walk` + `seen` block is now deleted from all four lesson tests
(`amp-intro`, `amp-ppdu`, `uwb-intro`, `uwb-frame`) and from `readability.test.ts`, whose
`textsOf` is now `lessonStrings({ [f]: l[f] })`. `title`, `variants[].label` and `jumps[].label`
are outside the helper (they are chrome, not lesson) and each lesson test appends them in one
line, so no coverage was lost.

**Minor 6 folded in:** `expect(seen.length).toBeGreaterThan(40)` is gone. Each lesson test now
computes a structural floor — one string per outcome, term, block, source, observation,
experiment and (question + options + explanation) of a quiz, plus `why`, the title, each variant
label and each jump label — and `readability.test.ts` applies the same floor to every migrated
lesson. A deleted section now fails instead of passing under a smoke bound.

## Beginner read

### `amp-ppdu` (was NEEDS A PASS)

1. **`closing extension` defined at first use** — the "Small frame, long airtime" paragraph now
   glosses it inline: "the closing extension — a scrap of quiet the band adds after any frame with
   a Wi-Fi opening". The `numbers` note calls it "the 6 µs closing extension", the same name.
   That paragraph had grown to 94 EN words with the gloss, over the contract's 90, so the
   "at these rates they dwarf a handful of octets" clause was dropped — the very next section
   makes that point with numbers.
2. **U-SIG and the legacy signal field explained where they appear** (the formula note, their only
   appearance — neither is named in `picture`): "the preamble, the legacy signal field that states
   the length, and the U-SIG, the newer header a Wi-Fi 7 radio reads to learn what kind of frame
   this is."
3. **The citation left the main-path table.** "How much padding" is now two columns; its "Where"
   column is gone and the `sources` bullet carries the clause: "The padding of the table above —
   20 µs unprotected, 36 µs protected — is 11-26/1519r5 §39.3.2.2." A table-cell citation is
   allowed by the letter of the spec, but the reader flagged it as datasheet register.

### `amp-intro` (was READY)

1. **The three record names glossed at first appearance**: "…three kinds of record are missing:
   CCA_BUSY, the channel sounding busy; BACKOFF_DRAW, a countdown drawn before speaking;
   IFS_START, the wait after someone else stops."
2. **The plain idea before the algebra**: "Not weak signal. Each tag picks one of four numbers at
   random and counts that many slots along. In the trigger's own terms: its window exponent ACWE
   is 2, so ACW = 2² − 1 = 3, and the ABOC drawn from 0, 1, 2, 3 picks slot ABOC + 1."

### ZH renderings — kept, and declined

Kept (both lessons): "帧与帧之间，它也没法准确计时。" for the "no dependable sense of time" calque;
"这四个边界，标签自己掐不准，得靠确认帧一个个替它点明。"; "正因如此，站在标签旁边的 Wi-Fi 终端只能察觉
“空中有动静”…" for the "这也正是为什么：" calque; "填充把这段思考时间安排在只耗费空口时间、别无其他代价的
地方；…"; and "两半合起来看就会发现：…" for the "put the halves together" calque.

Declined: the reader's fuller rewrite of the third `amp-ppdu` sentence ("大半时间都花在了它本身要说的
内容之外") — it shifts the claim from "most of the frame is not the message" to "most of the time is
spent outside the message", which is a different and less exact statement; I kept the lighter
reordering. Also **declined**: splitting "A second of polling" into two beats (`amp-intro` polish
item 3). A second block costs a heading and a lead-in, and with 12 words of headroom something
pinned would have had to go; the paragraph is 52 words and inside every contract limit. It is the
cheapest thing to do if the lesson is ever given room.

## The six minors

1. **Stale quote** (`amp-intro.test.ts`) — the `// "a clock good enough to count 9 µs slots"`
   comment guarded a sentence that no longer exists, so the two assertions under it
   (`SLOT_NS === 9 µs`, `ERP_2G.slotNs === SLOT_NS`) were **dropped**, with a comment saying why
   and that the picture now says only "cannot keep time between frames". `SLOT_NS` left the
   imports. (The alternative the reviewer offered — restoring a clock clause — costs words the
   lesson does not have.) The report's claim that every comment was re-quoted is corrected here;
   every comment whose prose changed this round has been re-quoted again.
2. **4190 µs / 4.19 % pinned in `amp-ppdu`'s own test** — the 1 Mb/s test now also measures the
   base run's 4190 µs and formats 4.19 %, with a comment saying why it is measured rather than
   trusted from next door.
3. **The 10 µs gap** — "the end of each acknowledgement opens the next" became "the next slot
   opens just after each acknowledgement ends", which is true of `ampAp.ts`'s
   `Ack end + AMP_SIFS_NS` where the old wording put the slot flush against the Ack.
4. **Module label** — resolved the other way round from the reviewer's suggestion. `MODULES` is
   0-based and the `COURSE_ORDER` comments are 1-based (module 0 is labelled "M1", so module 7 is
   "M8"): `amp-slots.ts`, `amp-coexist.ts` and `curriculum.ts` were all already right and my two
   new headers were the strays. Both now say "Tier 2 · M8 · Ambient power IoT (802.11bp)".
   Renaming AMP to "M7" in `curriculum.ts` would have collided with the existing
   "M7 scheduled Wi-Fi 6/7" label two lines above.
5. **The report's baseline count** — the old `tests/course/amp-intro.test.ts` had **6 describes
   and 33 `it`s**, not "5 describes, 22". The moved/kept/added tables above are complete and
   account for all 33; the header sentence was wrong and is corrected here.
6. **Smoke bound** — folded into Important 2 above.

## Deferred from Task 1 (`readability.test.ts`, now this task's)

- **#6 — both languages.** The acronym rule now runs over `s.zh` as well as `s.en` (a Chinese
  paragraph borrows the same Latin tokens: `NAV`, `AMP-SIG`, `RMARKER`), and the picture's
  two-quantities cap now measures `p.zh` as well as `p.en`. The file header says so.
  **No lesson needed a prose change to pass**: every ZH acronym in the four migrated lessons was
  already introduced (`NAV`, `CTS`, `ABOC`, `AMP`, `AMP-SIG`, `OOK`, `UWB`, `RMARKER`, `SYNC`,
  `SFD`, `STS`, `PHR`, `PSDU`) and no ZH picture paragraph carries a digit.
- **#7b — bilingual well-formedness** for every migrated lesson: a new
  `says everything in both languages` test walks `lessonStrings(l)` — `sources`, `outcomes` and
  each `terms[].plain` included — requires a non-empty `en` and `zh`, requires `zh !== en` for
  anything holding two consecutive English words, and applies the structural floor.
- **#9 — `firstOfTrack`** now carries a comment stating that it means "the first *migrated*
  lesson of the track", that mid-migration this need not be the track's first lesson in
  `COURSE_ORDER`, and that this is deliberate because the rule protects whichever lesson a reader
  actually meets first.

`readability.test.ts` went from 31 to 35 tests: 3 bookkeeping + 8 rules × 4 migrated lessons.

## RED proof for the new ZH checks

The two new ZH assertions were proved to bite by temporarily corrupting one ZH picture paragraph
of `amp-intro` (`标签的 XYZQ 接收机在 1 2 3 时刻…`) and re-running:

```
 × readability · amp-intro > introduces every acronym before using it
   → amp-intro ZH: "XYZQ" in "标签的 XYZQ 接收机在 1 2 3 时刻是一个包络检波器…": expected false to be true
 × readability · amp-intro > keeps the picture light: short paragraphs, at most two quantities each, no citations
   → 标签的 XYZQ 接收机在 1 2 3 时刻…: expected 3 to be less than or equal to 2
```

The file was restored from a backup immediately afterwards (`grep -c XYZQ` → 0, word count back
to 1288).

## Gates

| command | result |
|---|---|
| `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | **33 files, 819 tests passed**, output pristine |
| `npx vitest run` (full) | **127 files, 1944 tests passed** |
| `npx tsc -b --noEmit` | clean, exit 0, no output |
| `npm run build` | `✓ built in 3.02s` (only the pre-existing chunk-size advisory) |
| `git status --short tests/fixtures/` | empty — both hash fixtures unchanged from `d7078c7` |

## Files changed this round

`src/course/readability.ts` (the new `lessonStrings`), `src/course/amp/amp-intro.ts`,
`src/course/amp/amp-ppdu.ts`, `tests/course/amp-intro.test.ts`, `tests/course/amp-ppdu.test.ts`,
`tests/course/readability.test.ts`, `tests/course/uwb-intro.test.ts`,
`tests/course/uwb-frame.test.ts`. No fixture, no engine, model, ui or editor file.

## Concerns after this round

1. **`uwb-intro` is at 20 minutes and 9 words of headroom.** It passes, but it is the lesson with
   no room left at all; anything added to it must be traded, and one more `observe` item would
   push `lessonMinutes` to 25 and fail.
2. **The reviewer's secondary note on Important 2 is not addressed**: `recs` / `ofType` / `txs` /
   `ends` are still duplicated between `amp-intro.test.ts` and `amp-ppdu.test.ts`, and the two
   files still run the same 1-second simulation twice. That is a shared-fixture decision across
   ~40 lessons, not this task's to take; `lessonStrings` was the piece the ruling named.
3. **`amp-coexist.ts:58` still says "前两课"** with three AMP lessons now before it — outside this
   round's scope, to be fixed when `amp-coexist` migrates.
