# Tier 1 fix wave — report

One commit on `feat/uwb-ranging`, explicit pathspecs, no amend/reset. Files touched:
`src/course/readability.ts`, `src/course/tier1/{airtime,backoff,bianchi,bianchi-vs-sim,
decode-thresholds,frame-anatomy,frame-anatomy-bytes,hidden,ifs,radio-primer,retries-queues,
tier1-project,tier1-project-review}.ts`, `tests/course/{airtime,decode-thresholds,
frame-anatomy,lesson-claims,radio-primer,readability,tier1-project}.test.ts`.
NOT touched: `src/course/lessons.ts`, `src/course/curriculum.ts`,
`tests/fixtures/lesson-hashes.json` (byte-identical), anything under `src/course/tier2/`.

## Gates

- `npx tsc -b --noEmit` — clean.
- `npx vitest run tests/course tests/engine/lesson-hashes.test.ts` — 1842 passed, 2 failed,
  neither mine:
  - `readability · migration bookkeeping` — the expected in-flight Tier 2 bookkeeping failure
    (`rate` / `txop-protect` are migrated in the working tree but still recorded in MIGRATING).
  - `lessons.test · "Wi-Fi 5 already had DL MU-MIMO…"` — a concurrent implementer's
    uncommitted rewrite of `src/course/tier2/ofdma-dl.ts` dropped the string
    `Wi-Fi 5 (802.11ac)` that this standard-alignment test greps for. Their file, their fix.
- Fixture: untouched, byte-identical.
- Budgets after the wave (all inside their caps; airtime keeps its own `totalMax: 1000`):

```
radio-primer          466/650  204/350  326/400   996  20 min
decode-thresholds     559/650  336/350  376/400  1271  20 min
roles-stack           614/650  292/350  394/400  1300  20 min
frame-anatomy         635/650  295/350  368/400  1298  20 min
frame-anatomy-bytes   630/650  300/350  365/400  1295  20 min
airtime               529/650  176/350  291/400   996  20 min
ifs                   599/650  232/350  285/400  1116  20 min
backoff               538/650  197/350  296/400  1031  20 min
nav                   569/650  177/350  257/400  1003  20 min
hidden                618/650  233/350  332/400  1183  20 min
anomaly               598/650  127/350  306/400  1031  20 min
retries-queues        638/650  296/350  322/400  1256  20 min
bianchi               553/650  294/350  374/400  1221  20 min
bianchi-vs-sim        545/650  342/350  380/400  1267  20 min
tier1-project         615/650  346/350  312/400  1273  20 min
tier1-project-review  565/650  349/350  347/400  1261  20 min
```

`tier1-project` had to be trimmed 12 words (the `why` loses its fourth sentence, which the
watch block and `deeper` both already make) to stay under 1275, the point at which
`lessonMinutes` tips 20 → 25. `airtime` gained the three review clauses and paid for them by
losing two restatements ("The preamble does not move either way", "huge or nearly empty").

## Important — tier1-review.md

1. **ACK named at 44 µs where the sum needs it.** `ifs` EIFS row is now
   `94 µs = 16 + 44 + 34: a SIFS, an ACK at the slowest rate, a DIFS` (EN) with its ZH twin —
   it was an `en === zh` cell, so this also retires one language-neutral English cell.
   `bianchi`'s `T_s` note now reads "…and at this rate the ACK itself is 44 µs, not the 28 µs
   of the earlier rooms". No pin moved; both figures were already in `sources`.
2. **airtime's formula.** `airtime = preamble + symbol time × ⌈payload bits ÷ bits per symbol⌉`
   (EN + ZH), and the note now says the symbol time is the 13.6 µs of the table above it. The
   shape now matches `tier1-project` (b).
3. **English in a ZH main-path cell.** `tier1-project-review` `N('4,990 overlaps → 2,713
   retries')` → bilingual (`4,990 次重叠 → 2,713 次重传`); `tier1-project`
   `N('12,000 bits / 275.1 µs = 43.621 Mb/s')` → bilingual (`12,000 比特 / …`). The
   `retries-queues` and `roles-stack` `N()` cells the review exempted were left alone.
4. **One ZH word for a station.** 终端 → 站点 in every Wi-Fi Tier 1 file (airtime, backoff,
   bianchi, bianchi-vs-sim, retries-queues, frame-anatomy, ifs, tier1-project-review):
   zero occurrences left, including 上传终端 → 上传站点, so the vocabulary lint below can be a
   flat "no 终端" rather than a phrase exception. No test pinned any of these strings.
5. **The project's (b) is now derivable.** `tier1-project`'s "What is switched off" gains
   "All four radios are Wi-Fi 7, so each frame's front is the 48 µs the byte-counting lesson
   measured", and `frame-anatomy-bytes` joins `needs` (it precedes; no closure rule breaks).
   The optional 2340 / 351 bits-per-symbol clause was NOT added — it would have cost another
   ~20 words in a lesson that had to shed 12 to keep its 20 minutes.

## Important — B6-review.md

1. **"The link that moved".** The variants table's column is now "The study laptop's link" /
   "书房笔记本那条链路", which all three rows honestly describe (moved in row 1, unchanged
   MCS 13 in rows 2–3).
2. **Quiz Q1's verb.** "The living-room laptop's SNR is 18.84 dB and MCS 3 needs 16.99 dB"
   (EN + ZH), matching the `(a)` table's `SNR` column and the `deeper` note.

## Minor

| # | Finding | What changed |
|---|---|---|
| 1 | `Mbps` in the two primer lessons | `Mbps` → `Mb/s` (9 uses) in `radio-primer` and `decode-thresholds`, plus their test comments/titles. Now lint-enforced. |
| 2 | octet vs byte on the main path | `decode-thresholds` "1530-octet"/"1530 octets" → bytes (3 uses), `tier1-project` "1528 octets" → "1528 bytes" (and its `quotes()` pin). `bianchi`/`frame-anatomy-bytes`/`roles-stack` keep "octet" in `sources`/`deeper`, as the review allowed. |
| 3 | "exchange" means two things | `tier1-project` (b) column header is now "Exchange, and the DIFS after it" / "交换，以及其后的 DIFS", so the 207.6 µs is named for what it is. |
| 4 | MAC used before it is explained | `decode-thresholds` now reads "the MAC — the part of the radio that decides when to send — acts differently after each"; paid for inside the same paragraph (88/90 words, 128/170 ZH chars). |
| 5 | front / pattern / preamble | `airtime`'s `preamble` term: "the front of every frame: the fixed, already-known signal whose bytes the last lesson counted…", and `frame-anatomy-bytes` joins `airtime`'s `needs`. |
| 6 | the ACK has five names | `hidden` "that receipt"/"the receipts and answers" → answer; `radio-primer` "What the router's reply does"/"A reply goes out" → answer. `frame-anatomy-bytes`' "the reply" is left: there it is the BlockAck of a burst, not an ACK. |
| 7 | frame-anatomy keeps jumps its text never uses | `first RTS`, `first A-MPDU`, `first BlockAck` removed from `frame-anatomy.jumps` (the finders stay exported for `frame-anatomy-bytes`, which keeps all five). Its test now pins three jumps and says why. |
| 8 | retries-queues quiz 3 quotes 117 ms | Figure dropped: the explanation now says "at the defaults the mean wait over the last second is 472 ms", which is the number the table prints. The engine pin on 472/117/88 stays in the test. |
| 9 | tier1-project-review re-defines `capture` and `residual` | **SKIPPED** — the review calls it a habit, not a rule breach; both words carry this lesson's whole argument and their only gloss is three lessons back, and there are no new words to spend the freed slots on. |
| 10 | ZH parity nits | `bianchi` quiz 1 "快上八倍" → "都飞得快得多" (EN says "much faster"); `bianchi` quiz 3 ZH loses its extra clause; `tier1-project-review` rubric "至少点名两个机制" → "点名两个机制". |
| 11 | backoff quiz 1 "half-duplex" | Now "A radio cannot listen while it talks" / "无线电边说边听是做不到的", the picture's own plain words. |
| 12 | block colours | `airtime`'s watch block ends "Blue is the access point's lane, green a station's." |
| 13 | stale "about 95%" test comment | `tests/course/lesson-claims.test.ts:263–264` now quotes `hidden`'s 94 % in both the title and the comment. |
| 14 | whitespace-only line in MIGRATING | Removed. |

Also fixed while in the file: `tier1-project-review`'s quiz option said 终端 (Minor 4's class).

## Rule-gap fixes, and what they now catch

**`src/course/readability.ts`**

- `neutralCellTexts(blocks)` — new export, the mirror of `cellTexts()`: the table cells whose
  two halves are identical. The two rules below read it.
- `firstTermUses()` matches a term as a whole word with an optional plural
  (`\b<term>(e?s)?\b`) instead of a bare prefix. Catches nothing new today; stops `DS`
  matching "dso…" and `ESS` matching "essentially", which is what blocked `roles-stack` from
  owning `ESS`.

**`tests/course/readability.test.ts`**

- *"keeps a language-neutral cell neutral"* (rule-gap 1). Every `en === zh` cell of `picture`
  and `numbers` must not read as English prose. `CELL_PROSE` is the review's
  `/\b[a-z]{2,}\s+[a-z]{2,}\b/` **plus** a second alternative
  `/\b[a-z]{4,}\b[^A-Za-z\n]{1,12}\b[a-z]{4,}\b/` — because the review's own regex does *not*
  match either of its two headline examples ("4,990 overlaps → 2,713 retries",
  "12,000 bits / 275.1 µs"), whose English words are separated by digits and an arrow rather
  than by a space. The second alternative keeps a short gap and four-letter words so that a
  value list ("0, 20 and 40 ms") stays out of it. Exempt: a citation cell, a log line (opens
  with a node id), an all-caps record name, a `LOG_NAMES` entry.
- *"introduces the acronyms of a language-neutral cell as well"* (rule-gap 2). Feeds those
  cells to `acronyms()` with `knownFor(l)`. A token passes if it is known, glossed in the cell
  itself, or glossed anywhere in that section's prose **or bilingual cells** — the review said
  "glossed in the same table's prose", and both of the Tier 1 cases (`BPSK`/`QPSK`/`QAM` in
  decode-thresholds, `RA`/`TA`/`SA`/`DA` in frame-anatomy) are glossed in the paragraph
  directly under the table, while `TID` is glossed in a bilingual cell of the same section.
  Two Tier 1 cells did need a fix and got one: nothing glossed `BlockAck` in
  `frame-anatomy-bytes`' numbers, so its row now reads "the BlockAck (one answer for a whole
  burst): …" (paid for by two small trims in the same section).
- *needs-honesty* now uses the same whole-word-plus-plural match as `firstTermUses`.
- *"one name per thing, across the Wi-Fi track"* (rule-gap 5). A new describe over every
  migrated Wi-Fi lesson's `lessonStrings`: no `Mbps` (write `Mb/s`), and no 终端 in the ZH
  (a station is 站点). Would have caught Minor 1 and Important 4 at batch time.
- `MIGRATING`'s blank line removed.

**`tests/course/kit.ts`** — unchanged. None of rule-gaps 1, 2, 3 or 5 lives there;
`lessonShapeSuite`'s own bilingual walk (`/[a-z]{3,}\s+[a-z]{3,}/` over `lessonStrings`)
already covers what it can, and the new cell rules need the table structure, which the
contract test has.

**Rule-gap 4 (variant-scoped jumps) — NOT done.** It is a feature change in
`src/course/lessonKit.ts`, `lessonShapeSuite` and the `watch` renderer, not a readability
rule, and the review itself files it as a carry. It stays a carry.

## Tier 2 (and UWB) ids that trip the new rules

Both new cell rules and the vocabulary lint carry a clearly-named, TODO-tagged allow-list in
`tests/course/readability.test.ts` (`CELL_RULE_CARRIES`, `VOCAB_CARRIES`). Remove each id as
its wave reaches it.

**For the Tier 2 Wi-Fi fix wave:**

| id | rule | what trips it |
|---|---|---|
| `edca` | acronyms in neutral cells | `VO`, `VI`, `BE`, `BK` in `numbers` cells, glossed nowhere in that section (7 cells) |
| `txop` | acronyms in neutral cells | same four short names (4 cells, one of them `BE / BK`) |
| `edca` | vocabulary | 19 ZH strings say 终端 |
| `ampdu` | vocabulary | 2 |
| `txop` | vocabulary | 8 |
| `width` | vocabulary | 2, plus 5 strings say `Mbps` |
| `streams` | vocabulary | 1 |
| `rate-fallback` | vocabulary | 19 (in-flight; also listed for whoever lands it) |
| `rate`, `txop-protect` | vocabulary | listed pre-emptively; they are in MIGRATING today |

No Tier 2 lesson trips the language-neutral-cell rule or the whole-word term match.

**For a UWB pass (out of scope here, listed so it is not lost):**

| id | rule | what trips it |
|---|---|---|
| `uwb-ul-tdoa` | neutral cell reads as prose | `"1 slot of 2 ms, 1 frame"` |
| `uwb-mms-numbers` | neutral cell reads as prose | `"2.10 cm over 21 ranges"` |
| `uwb-dstwr` | acronym in a neutral cell | `Treply1` |
| `uwb-blocks` | both | `SP1 · DS-TWR · block 0 · round 0 · 4 responders` |

## Carries this wave does not clear

- `lessonMinutes` leaves no room for a third experiment at the word cap (spec question).
- Variant-scoped jumps (rule-gap 4), the wifiScenes ↔ lessonKit import cycle, B1's "Opus"
  trailer — unchanged.
- The step review's own `CELL_PROSE` regex is weaker than its stated intent; the version
  committed here is wider, and the widening is a judgement call worth a second opinion.
