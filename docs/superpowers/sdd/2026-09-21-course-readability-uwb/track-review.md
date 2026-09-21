# Whole-track review — the UWB course after the readability rewrite

Branch `feat/uwb-ranging`, head `ff85eaf`, scope `a6fb16c..HEAD` (course files). Read-only: no
edits, no commits, no subagents. Read all sixteen lessons in EN from `scripts/lesson-dump.ts`,
and uwb-intro, uwb-frame, uwb-blocks, uwb-mms, uwb-mms-numbers, uwb-nba, uwb-nba-coexist in ZH.
A throw-away probe (`scratchpad/track-probe.ts`, not committed) ran the proposed tokenizer, the
`needs` closure and the numbers-section shape over every UWB lesson; its output is quoted where a
finding rests on it.

## Verdict: NEEDS A FIX WAVE (one, small; then merge)

Nothing is wrong with the physics, the pins or the fixtures. The fix wave is about the course as
a course: one word the whole track uses and never glosses, three `needs` that are not honest,
and a tokenizer quirk that made two lessons talk around their own new words. Everything else
below is polish that fits the same wave or is dropped with a reason.

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 3 |
| Low | 8 |
| Nit | 2 |

Spec/test amendments proposed: 7. Batch-review residue: 27 items, 13 worth the wave, 14 dropped.

---

## 1. The track as a course

### Does it climb?

Yes, and better than the batch reviews could see. The sequence intro → frame → sstwr → dstwr →
blocks → position → geometry is one story told in one register: every lesson opens on a
problem the previous one left ("Measuring the other radio's clock works, but it leaves a
residue"; "A distance to an anchor is not a place"; "Nothing about the radio changes when you
move the anchors"). The Tier 2/3 lessons each turn one knob of the mode before them (roll call
→ draw; two-way → listen-only → blink; one frame → a train; wide radio → small radio → the small
radio's band). The `why` paragraphs are uniformly good and carry no digits; every `watch` lands
inside the first three picture blocks and says what the reader will see.

The three split pairs each read as one idea told in two sittings: position/geometry ("three
distances make a point" / "what the layout charges"), mms/mms-numbers ("why a train, and who
talks" / "the arithmetic"), nba/nba-coexist ("what the small radio says" / "where it lives").
uwb-mms-numbers is the weakest of the six halves only because its picture is a second run at
the same mechanism ("An allowance, not a ceiling" restates uwb-mms's "The energy is there; the
moment is not") — acceptable for a numbers half, not a finding.

Numbers agree across lessons everywhere I checked them: σ_r 2.1/2.12 cm (intro, sstwr, position,
aoa sources); DS-TWR noise 1.8–1.9 cm (dstwr, position); the two-way fixes 0.5–3.3 cm (position,
dl-tdoa deeper); GDOP 1.05 → 1.26 on three anchors (geometry, coexist); 3.0 cm per millisecond of
reply (sstwr deeper, contention); 10 rounds a block (blocks, dl-tdoa deeper); 0.505 % of the
block for a listening round (dl-tdoa, ul-tdoa); Poll 27 + 3N octets (dstwr deeper) explaining 30
(frame), 39 (blocks) and 42 (dl-tdoa). The 4056-tick and 26 381 597 885 counters reappear
identically in sstwr and dstwr deeper.

### Where a learner falls in

**M1. The mobile node has three names and one of them is never glossed.** The picture calls it
"the phone" from uwb-intro through uwb-contention and again in uwb-nba-coexist; the log calls it
`tag-1`, `uwb-1` or `badge-1`; Tier 2 switches to "badge" (dl-tdoa, ul-tdoa, aoa) and uwb-mms to
"tag". The word *tag* is in no `terms` table of the track, yet it is in uwb-intro's first numbers
table (`tag-1 TX RMARKER → * poll`, `src/course/uwb/uwb-intro.ts:119`), in uwb-blocks's own
numbers table ("one tag: tag k owns round k") and jump label ("the first tag's fix"), and
uwb-coexist uses "phone" 8 times and "tag" 9 times in one lesson (`uwb-coexist.ts:163,168,181`).
ZH has the same drift (手机 / 标签 / 胸牌). Probe count of the EN main path: intro phone 11 · tag 5;
blocks 22 · 2; coexist 8 · 9; dl-tdoa tag 11 · badge 34; mms tag 14.
*Fix:* one clause in uwb-intro's "One question, one answer" paragraph (`uwb-intro.ts:80–81`):
"The phone sends a poll — the log calls it `tag-1`: a *tag* is whatever is being located —" (ZH:
"日志里叫它 tag-1：被定位的那一端就叫标签"). Then pick one word per lesson: uwb-coexist's numbers
and observe say "the phone" like its picture; uwb-blocks's table cell says "one phone". "Badge" in
the TDoA/AoA lessons is fine once "tag" is a known word, because each of those lessons says
"a badge on a lanyard" on first use.

**M2. Three `needs` are not honest.** The acronym rule admits any earlier lesson of the track,
so the test cannot see this; a reader who follows `needs` can.
- `uwb-dl-tdoa.ts:105` `needs: ['uwb-position']` — but the numbers table prints "GDOP 0.84" and
  "ellipse 19.8 × 10.3 cm" (`:211,213`) and the deeper section compares "the two GDOP columns";
  GDOP, the ellipse and NLOS are uwb-geometry's words. Fix: `needs: ['uwb-geometry']`
  (geometry already needs position).
- `uwb-aoa.ts:105` `needs: ['uwb-dstwr']` — a whole picture section is "An ellipse across the
  line of sight", the table has an "Ellipse" column and "GDOP 1.00" is in the log line. Fix:
  `needs: ['uwb-dstwr', 'uwb-geometry']`. (The batch-5 reviewer noted this and waved it as
  "reasonable to assume"; `needs` is the promise, not COURSE_ORDER.)
- `uwb-mms.ts:101` `needs: ['uwb-blocks', 'uwb-dstwr']` — the picture's last paragraph leans on
  "the quality byte on each range flags [it] as an obstructed path" (FoM, uwb-geometry) and "a
  bias, not noise" (uwb-ul-tdoa's term, but self-explaining here). Fix: add `'uwb-geometry'`, or
  reword to "the byte each range carries marks the path as obstructed" and leave `needs` alone.

**M3. GDOP is printed two lessons before it is glossed.** uwb-blocks (lesson 5) prints "GDOP
1.06 / 1.08 / 1.06" in its fix table (`uwb-blocks.ts:138–140`) and uwb-position (lesson 6) quotes
the log line "…error 0.01 m, GDOP 1.05, 4 anchors" (`uwb-position.ts:136`); uwb-geometry (lesson
7) is where GDOP enters `terms`. The cells are language-neutral, so the acronym rule never looks
at them, but the learner does. Fix: drop ", GDOP x.xx" from the three uwb-blocks cells (the lesson
is about the timetable, not the layout); in uwb-position keep the verbatim log line and add half a
clause to the paragraph under it ("GDOP is the layout's price on that error — the next lesson").

### Repeated or contradictory explanations, and the vocabulary

- **L3. "Report" is glossed twice with two meanings** (probe (3)): uwb-dstwr "an anchor's last
  message, telling the phone the two intervals only that anchor could measure" vs uwb-nba "the
  closing message: it carries the reply time the distance is computed from". uwb-nba also
  re-glosses "Poll" and "Response" fourteen lessons after the words were first used. Fix: uwb-nba
  terms become `NB Poll` / `NB Response` / `NB Report` (the log's own prefix, which the lesson's
  `NB` term already explains), with the Report line saying "not the wideband Report of DS-TWR".
- **L4. "residual" carries two meanings.** uwb-position glosses it as the least-squares misfit;
  uwb-dl-tdoa's numbers use it for the leftover clock error ("each responder's clock-offset
  residual", "3σ of the residual", `uwb-dl-tdoa.ts:185,192`) and uwb-mms-numbers says "the
  train's millimetre of clock residual" (`uwb-mms-numbers.ts:137`). uwb-sstwr's own word for that
  quantity is "leftover", and it should stay the word: fix the three sites to "leftover".
- **L5. The Response shrinks from 20 to 14 octets without a word.** uwb-frame teaches "thirty
  bytes in the poll and twenty in the answer"; uwb-dstwr's table (`uwb-dstwr.ts:138`) has
  "Response | 4 | 14 | 181.22 µs" and only `sources` explains ("one reply-time field 6"). One
  clause under "Ten slots, and what fills them": "the Response is 14 octets, not 20: its reply
  time now travels in the Report".
- Everything else is consistent: "clock offset" (sstwr) and "clock ratio" (mms-numbers) are the
  same quantity under two names, but the second gloss says "as a number of parts per million",
  which is the distinction the lesson wants; "energy detect" (Wi-Fi) and "LBT" (narrowband) are
  correctly two things. No number differs between lessons.

### ZH

Read on its own, the ZH of uwb-intro, uwb-blocks, uwb-mms and uwb-nba is written, not
translated, and quantities-in-words agree with EN ("几厘米" / "a few centimetres", "好几万格" /
"tens of thousands", "十倍以上" / "tenfold and more"). Two track-level wobbles:
- **L7.** The word for *radio*: uwb-intro and uwb-blocks say 射频 (title "一台测量时间的射频",
  `uwb-intro.ts:42,60,77`; 12 uses in uwb-blocks), uwb-mms/nba/nba-coexist say 电台 (35 uses,
  0 of 射频). Both are readable; a learner meets "UWB 射频" in lesson 1 and "宽带电台" in lesson 13
  for the same box. Pick one for the fix wave (电台 reads as the device, 射频 as the discipline;
  the opener is the learner-approved reference, so the cheaper change is mms/nba → 射频 only
  where it names the device).
- **N1.** The same jump label is "打开轮次的那帧窄带 POLL" / "窄带 REPORT" in uwb-mms
  (`uwb-mms.ts:227,230`) and "窄带 Poll" / "窄带 Report" in uwb-nba; EN is "narrowband poll" in
  both. Make them agree.

---

## 2. Rule health after fifteen lessons

### R1. The numbers-prose cap chops paragraphs instead of tabulating them (L1)

The rule "≤ 4 numeric quantities per `numbers` paragraph, else a table or a formula" was met, in
seven of thirteen lessons, by cutting one paragraph into a run of heading-less one-sentence
paragraphs (probe (2): geometry 5 in a row, mms 5, nba 4, nba-coexist 4, aoa 3, coexist 2,
contention 2). The worst is `uwb-geometry.ts:95–107`, five orphans after the "Three scenes"
table:

> A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight.
> The blocked range reads 5.33 m against a true 4.76 m in the first block, and over seven blocks the bias averages 59.4 cm — within a third of a σ_r of the ideal figure above.
> The fix moves 30.9 cm, not 60. Noise-free the shift is 0.316 m, 53 % of the bias …
> It leaves a 21 cm residual where a clean round leaves a micrometre …

and `uwb-aoa.ts:201–209`, where the three "Behind the anchor" facts lost the heading that named
the variant, so the reader meets "Facing the wall, the badge is 180.0° off boresight" with no
sign that the scene has changed. Same shape at `uwb-mms.ts:178–186`, `uwb-nba.ts:179–187`,
`uwb-nba-coexist.ts:117–125`. The rule pushed the text into worse shape than the paragraph it
replaced: a numbered walk-through belongs in a `list` or `steps` block under one heading, or in
a two-column table.

**Amendment A2** (spec "Numbers prose"; kit): "A run of figures is a `table` or a `list`, not a
run of paragraphs: in `numbers`, a `p` block without a heading may only immediately follow a
`table`, `formula` or headed `p`, and no two heading-less `p` blocks are adjacent." Kit test:
`for (const [i, b] of l.numbers.entries()) if (!b.kind || b.kind === 'p') if (!b.heading) expect(l.numbers[i-1]?.kind !== 'p' || l.numbers[i-1]?.heading).toBeTruthy()`.

### R2. The tokenizer quirk (mixed-case tails) — the fix

`ACRONYM = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g` (`src/course/readability.ts:44`) reads
`DL-TDoA` as `DL` (the tail `TDoA` has no word boundary after `TD`) and does not see `TDoA`,
`AoA`, `FoM`, `MHz`, `GHz` at all. Two costs, both visible in the text:

- The glossed word is never usable. `DL-TDoA` and `UL-TDoA` are in `terms`
  (`uwb-dl-tdoa.ts:111`, `uwb-ul-tdoa.ts:104`) and appear nowhere in either lesson's `why`,
  `picture` or `numbers` prose — only in log-line cells. The picture says "its downlink form —
  the one where the anchors do all the transmitting — is what this lesson runs"
  (`uwb-dl-tdoa.ts:130`) and uwb-ul-tdoa never names its own mode ("Turn the round over once
  more", `:119`). The "first use" rule (write "the STS — … — once, then STS") was designed for
  exactly these words and could not be exercised.
- The rule is blind to every mixed-case acronym, so `AoA`, `FoM`, `TDoA` could be used before
  their gloss and pass. (They are not, today — the authors were careful — but the test is not.)

**Amendment A1** (readability.ts + spec "Words"): a token opens on a capital, may carry
lower-case letters, and counts when it holds **two or more capitals or digits**:
`/\b[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\b/g`, keep `m[0]` iff `(m[0].match(/[A-Z0-9]/g) ?? []).length ≥ 2`,
then upper-case as today. `The`, `Poll`, `Final` (one capital) are not tokens; `TDoA`, `AoA`,
`FoM`, `DL-TDoA`, `MHz` are. Add the spec's units to `KNOWN_WORDS` (`MHZ`, `GHZ`, `KHZ`; `NS`,
`MS`, `US` are already lower-case in prose). Blast radius, measured by the probe over all sixteen
lessons with the running known set: the only new tokens are `GHZ`/`MHZ` (units) and
`SS-TWR` in uwb-intro's numbers, which `definedInPlace` already exempts ("Single-sided two-way
ranging (SS-TWR)"). Pin it: `expect(acronyms('DL-TDoA, TDoA and AoA at 6 GHz, then Poll')).toEqual(['DL-TDOA','TDOA','AOA'])`
with `GHZ` known. Then the fix wave writes the words in: "Placing something from those gaps is
TDoA, and its downlink form, DL-TDoA — the anchors do all the transmitting — is what this lesson
runs."

### R3. The acronym rule stops at the cell border

Probe (4) lists acronyms a learner meets in `numbers` cells, `observe`, `tryThis` and `quiz`
that no `terms` on the `needs` path explains: `GDOP` (blocks, position, dl-tdoa, ul-tdoa, aoa),
`TCXOs` (sstwr table row and variant label, `uwb-sstwr.ts:138,191`), `EIRP` (coexist formula
`:150` and the quiz), `RMS` (contention table header `:182` and the quiz), `IFS` (blocks observe
`:214`), and the log's own `NBPOLL`/`UWBRSF`/`UWBBLINK` (record names without an underscore, so
not covered by the underscore exemption). The GDOP cases are M2/M3 above; the rest are **L8**:
gloss in place ("TCXOs — temperature-compensated crystals, ±1 ppm"; "in-band EIRP — the power
that lands inside the other radio's channel"; "RMS range error" → "typical range error") or leave
and accept.

**Amendment A3** (spec "Words", test): the acronym rule also reads `observe`, `tryThis`, `quiz`
and every table cell whose `en ≠ zh`; a language-neutral cell (a log line) is exempt as today,
but a record name is exempt only if it is `UPPER_SNAKE` **or** all-capitals with no vowel-only
reading (`NBPOLL`, `UWBRSF`) — simplest: extend the record-name exemption to "a token the log
prints, listed in `RECORD_NAMES` from `src/uwb/records.ts` / `src/engine/records.ts`", so the
list is the engine's and not a hand-typed one.

### R4. `needs` is not tested against what the picture leans on

The acronym rule's admission set is "any earlier lesson of the track" (by design, so a reminder
suffices for a Tier 1 word); but nothing checks that a term a picture *section is built on* is
reachable through `needs`. M2 is the result, three times, and two batch reviewers waved it.

**Amendment A4** (test): for every term of every lesson in the track, record its owner; for each
lesson, every owned term (acronym or lower-case) that appears in `picture` must be owned by this
lesson or by a lesson in the transitive `needs` closure. Probe (6) shows the everyday words this
would catch today (round/slot before uwb-blocks, poll/response/report before uwb-nba, bias in
aoa/mms): the honest response is to (a) move `round`/`slot` to uwb-frame's terms, where "Two
slots, one round" already explains them, and (b) rename uwb-nba's three terms (L3), after which
the assertion is clean except for M2, which it exists to catch.

### R5. Vocabulary is nobody's file

M1, L3, L4 and L7 are one problem: six implementers and a controller, no shared word list. The
`terms` tables are otherwise a coherent glossary — 66 entries, one collision (Report), no term
glossed twice with different plain lines apart from that one.

**Amendment A5** (spec "Plan template"): the plan of every track ships a one-page vocabulary
sheet the controller owns like COURSE_ORDER — the actors and the log's spelling of each
(phone = `tag-1`/`uwb-1`, badge = `badge-1`, anchor = `anchor-1`/`anc-1`), the ≤ 6 terms each
lesson will own, and the ZH word for each. Test: `terms[].term` unique across a track (fails on
"Report" today), and the track opener's `terms` or picture contains every node-id prefix its
track's scenario builders emit.

### R6. `deeper` is where the density went, and that is fine

I looked for content shoved into `deeper` to make a budget. The pattern is healthy: `deeper`
holds derivations (the 2/√N GDOP floor, the four counters of anchor 1, the hop sequence), corner
cases (clamps, the 300 RSTU floor) and provenance-adjacent arguments (why a slow radio). The one
place it hides a fact a reader needs is uwb-dstwr's fix "(5.01, 3.98) m … GDOP 1.00" — ruled
allowed in batch 1, and it is. No `observe` item lost its purpose; each still names the record
and the slot. Tables that should be sentences: none; sentences that should be tables: R1.

### R7. Two rulings to write down so batch reviewers stop re-raising them

**Amendment A6** (plan template): the per-lesson "15–25 minute" pin of the old contract is
superseded by the spec's 500–1300-word band and ≤ 20 min ceiling; batch 4 and batch 6 both
raised its loss as Minor. **Amendment A7**: "an acronym in `deeper` that a later lesson glosses
is allowed if the sentence reads without it" (the batch-1 GDOP ruling), so it need not be
re-argued for Jacobian (batch 4) or eigenvectors (batch 2).

---

## 3. Batch-review residue (unfixed Minor/Low/Nit, deduplicated)

Batch 1's Medium and Low were fixed in `a85df86`; batch 3's Medium by `needs += uwb-geometry`.

| # | Batch | Where | What | Wave? |
|---|---|---|---|---|
| 1 | 1 | `uwb-dstwr.ts:132` (zh) | "再留意这里并不存在的那种对称" reads as a calque | **fix** (bundle Z) |
| 2 | 1 | `uwb-dstwr.ts:167` | GDOP in deeper before its gloss | drop — ruled (A7) |
| 3 | 2 | `uwb-geometry.ts:79` | "its eigenvectors are the ellipse" unglossed in numbers | drop — numbers register, sentence reads without it |
| 4 | 2 | `uwb-blocks.ts:76` (zh) | "别无他物" register wobble in a term line | drop |
| 5 | 3 | `uwb-coexist.ts:277` | "FoM byte" in a quiz distractor | drop — coexist now needs uwb-geometry, which glosses FoM |
| 6 | 3 | `uwb-contention.ts:143` | heading "The birthday problem, with slots" unglossed | **fix** — "…with slots instead of birthdays" is half a clause |
| 7 | 3 | `uwb-contention.ts:219` | sources "§10.32.9.5 is the RCPS IE…" reads as a field list | drop — it is `sources` |
| 8 | 3 | `uwb-coexist.ts:117,154` (zh) | two translated-sounding sentences | **fix** (bundle Z) |
| 9 | 3 | `uwb-contention.ts:135,139` (zh) | two translated-sounding sentences | **fix** (bundle Z) |
| 10 | 4 | `uwb-dl-tdoa.ts:147` (zh) | "解法是那一段两边都描述过的跨度" | **fix** (bundle Z) |
| 11 | 4 | `uwb-ul-tdoa.ts:132` (zh) | "活下来的只有接收端" | **fix** (bundle Z) |
| 12 | 4, 6 | tests | per-lesson 15-min floor gone | drop — ruled (A6) |
| 13 | 4 | `uwb-dl-tdoa.ts:222` | "Jacobian" in deeper | drop — ruled (A7) |
| 14 | 4 | `uwb-dl-tdoa.ts:193` (zh) | "残下来的" coinage | **fix** (bundle Z; "剩下的") |
| 15 | 4 | `uwb-ul-tdoa.ts:140` (zh) | "那是一张被扭曲的地图" | drop — a metaphor, reads |
| 16 | 4 | `uwb-ul-tdoa.ts:215` (zh) | "长半轴都不小于…也不会超过…" | **fix** (bundle Z; reviewer's rewrite is right) |
| 17 | 5 | `uwb-mms.ts:46` | stale doc comment "middle of the bay / three and a half decibels" | **fix** — one line |
| 18 | 5 | `uwb-aoa.ts:151` (zh) | "而它错得离谱的地方在这里", "反正弦再没有别的线索" | **fix** (bundle Z) |
| 19 | 5 | `uwb-mms-numbers.ts:76` (zh) | "在这里把一串片段…放在一起比" | drop — comprehensible |
| 20 | 6 | `uwb-nba.ts:200` | deeper paragraph carries two arguments | drop — deeper may be dense |
| 21 | 6 | `uwb-nba-coexist.ts:145` | deeper paragraph carries three claims | drop — same |
| 22 | 2 | `uwb-geometry.ts` "Three honest ranges…" | three claims in one picture paragraph | drop — reviewer did not flag it as a fault; the sequence is causal |

Bundle Z is one ZH-only pass over eleven sentences in eight files; it needs no test change and
no EN change. Items 1, 6, 8–11, 14, 16–18 are the wave; the rest are dropped with the reason
given. (22 rows; the 27 raw items collapse because the batch-4/6 floor pin and the ZH pairs were
counted per sentence.)

---

## 4. Pins and truth

### Suites and build

- `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts`:
  37 files, **1068 tests, all passed**, 36.95 s reported (39 s wall including startup).
- `npx tsc -b --noEmit`: clean, 10 s. `npm run build`: built in 3.29 s (15 s wall), the usual
  chunk-size warning only.
- `git diff a6fb16c -- tests/fixtures`: **additions only** — 11 lines in `lesson-hashes.json`
  and 12 in `uwb-record-hashes.json` for uwb-geometry, uwb-mms-numbers and uwb-nba-coexist
  (base and every variant); the single `-` line is the trailing comma on `uwb-nba#2`. Each split
  id's hashes equal its first half's in both files (position/geometry `d331c1b`/`419eeeeb`,
  mms/mms-numbers `f4da3df6`/`570d5920`, nba/nba-coexist `98e2bc88`/`c035d3f0`, variants
  likewise).

### Ten mechanism claims a batch reviewer would plausibly have waved through

| # | Claim (lesson) | Engine | Verdict |
|---|---|---|---|
| 1 | "an anchor whose answer died is never told; the model closes that loop at the round boundary … when tries run out it takes a sit-out" (contention) | `device.ts:532–541` `endRound(heard)`: attempts refilled on heard, decremented otherwise, only for an anchor that drew; `:874–877` a spent budget draws no slot, emits `UWB_CONTEND slot:null`, refills | true |
| 2 | Poll carries anchor 1's transmit counter; a Response its transmit counter, its counter for the Poll and its offset to anchor 1; the Final carries arrival counters "which no badge reads" (dl-tdoa numbers) | `device.ts:966–1010` `transmitDl` and its doc comment, word for word | true |
| 3 | the one-anchor fix is made "always with the later bearing, measured closest in time to the range" (aoa observe) | `device.ts:279–284` `aoaThetaDeg`: measured twice, "the last one stands"; fix emitted after the range at `:1170–1173` | true |
| 4 | "Four slots open the round, twenty carry the fragments, and the responder reports in slot 24"; two trains interleave, "one frame every half millisecond" (mms) | `mms.ts:241–244` `MMS_CONTROL_SLOTS = 4`, `MMS_RP_MIN_SLOTS = 20`; `mmsLayout` `:265–287`: initiator even slots, responder odd, report slot 4 + 20 + 0 for the responder | true |
| 5 | "the FoM byte reports geometry, not the delay: clear the NLOS switch and the range returns to centimetres while the byte reads the same" (geometry) | `channel.ts:252–268`: `nlosNs` gated by `cfg.nlos`, `obstructed()` is walls-crossed geometry only, comment says exactly why | true |
| 6 | "Wi-Fi calls a channel busy by energy detect, and a ranging frame … is nowhere near that threshold" — i.e. the Wi-Fi side does look (coexist) | `engine/channel.ts:753,771,813` sum `foreignMw('wifi', …)` into the Wi-Fi radio's busy/SINR terms; 18.57 dB short is the pinned measurement | true |
| 7 | "Block b takes list[hash("7:b") mod 4] → 100, 210, 200, 150, 100, 210, 200" (nba-coexist deeper) | `nb.ts:142–147` `list[hashStr(\`${seed}:${block}\`) % list.length]`; sequence pinned at `uwb-nba-coexist.test.ts:411` | true |
| 8 | "the responder's copy adds a payload-length octet with no payload behind it, which is why it is thirteen octets" (nba deeper) | `nb.ts:40–46` `NB_POLL_BYTES 12`, `NB_RESP_BYTES 12`, `NB_REPORT_BYTES 13` with that comment; `NB_REPORT_TIME_BYTES 5` | true |
| 9 | "this solver never looks at [the FoM] — all four ranges weigh alike"; "only the floor coordinates are solved for; the height is handed in" (geometry, position) | `position.ts`: no weight anywhere; `:82,198–199,244` Gauss–Newton on (x, y) with the tag's z fixed | true |
| 10 | "One RMARKER per train, taken at its start … the first pulse of the first fragment"; "one transmit stamp per train, not per fragment" (mms) | `mms.ts:119–136` `rmarkerFromFragment` (fragment 0 is the RMARKER; a lost first fragment is still timed from whichever arrived, which the lesson does not need to say); `device.ts:218,1340` one stamp per train per kind | true |

Also re-checked on the way: DS-TWR Final carries `treply2` per anchor (`device.ts:944–947`) and
the Report carries `treply1, tround2` (`:959`), as uwb-dstwr says; the NB message airtime
formula and the −71.02 dBm threshold as batch 6 found. **L6**, the one loose claim: uwb-nba
"Four rounds like that fill a block" / "一个块装得下四轮 … 填满一个块" (`uwb-nba.ts:154–155,183`) —
the block is 200 ms (block 6 opens at 1.200 s, `uwb-nba.test.ts:40`) and four 14 ms rounds are
56 ms of it. "Make up the block's four rounds; the rest of it is empty" is what the run shows.

---

## 5. Findings by severity (index)

**Medium**
- M1 `uwb-intro.ts:80–81` (+ `uwb-coexist.ts:163,168,181`, `uwb-blocks.ts` table cell) — "tag" never glossed; phone/tag/badge drift. Fix in §1.
- M2 `uwb-dl-tdoa.ts:105`, `uwb-aoa.ts:105`, `uwb-mms.ts:101` — `needs` omit the lesson whose terms the picture/numbers stand on. Fix: add `'uwb-geometry'` (mms: or reword).
- M3 `uwb-blocks.ts:138–140`, `uwb-position.ts:136` — GDOP printed before it is glossed. Fix in §1.

**Low**
- L1 heading-less paragraph runs in `numbers`: `uwb-geometry.ts:95–107` (5), `uwb-mms.ts:178–186` (5), `uwb-nba.ts:179–187` (4), `uwb-nba-coexist.ts:117–125` (4), `uwb-aoa.ts:201–209` (3), coexist (2), contention (2). Fix: a `list` or table under one heading; aoa's three regain the heading "Behind the anchor".
- L2 `uwb-dl-tdoa.ts:130`, `uwb-ul-tdoa.ts:119` — glossed `DL-TDoA`/`UL-TDoA` never written in prose; circumlocutions. Fix after A1: write the word once at first use.
- L3 `uwb-nba.ts` terms — "Report" glossed twice across the track; Poll/Response re-glossed. Fix: `NB Poll/Response/Report`.
- L4 `uwb-dl-tdoa.ts:185,192`, `uwb-mms-numbers.ts:137` — "residual" for what sstwr calls "leftover". Fix: "leftover".
- L5 `uwb-dstwr.ts:138` — Response 20 → 14 octets unexplained on the main path. Fix: one clause.
- L6 `uwb-nba.ts:154–155,183` — "fill a block" for 56 ms of 200. Fix: reword.
- L7 ZH 射频 vs 电台 across the track. Fix: one word per meaning, applied track-wide.
- L8 `uwb-sstwr.ts:138,191` TCXOs, `uwb-coexist.ts:150` EIRP, `uwb-contention.ts:182` RMS, `uwb-blocks.ts:214` IFS — acronyms outside the rule's reach, unglossed. Fix: gloss in place or replace.

**Nit**
- N1 `uwb-mms.ts:227,230` vs uwb-nba — ZH jump label "窄带 POLL/REPORT" vs "窄带 Poll/Report".
- N2 `uwb-mms-numbers` picture restates uwb-mms's allowance argument in "An allowance, not a ceiling"; acceptable for a numbers half, noted only.

---

## 6. Spec / test amendments (7)

| # | Where | Amendment | The sentence that shows the need |
|---|---|---|---|
| A1 | `readability.ts:44`, `KNOWN_WORDS`, spec "Acronym rule" | Tokenizer counts mixed-case tails: `/\b[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*\b/`, token iff ≥ 2 capitals/digits; add `MHZ`, `GHZ`, `KHZ`; pin with `acronyms('DL-TDoA, TDoA and AoA at 6 GHz, then Poll') → ['DL-TDOA','TDOA','AOA']`. Probe: no other new violation in sixteen lessons. | "its downlink form — the one where the anchors do all the transmitting — is what this lesson runs" (`uwb-dl-tdoa.ts:130`); `DL-TDoA` in terms, used nowhere |
| A2 | spec "Numbers prose"; kit | No two adjacent heading-less `p` blocks in `numbers`; a run of figures is a `table` or `list` | "A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight." — first of five orphans (`uwb-geometry.ts:95`) |
| A3 | spec "Words"; readability test | Acronym rule also reads `observe`, `tryThis`, `quiz` and `en ≠ zh` cells; record names exempt via the engine's own list, not the underscore heuristic | "uwb-1 · (5.01, 3.99) m at 20 ms, GDOP 1.06" two lessons before GDOP is glossed (`uwb-blocks.ts:138`); "TCXOs, ±1 ppm" (`uwb-sstwr.ts:138`) |
| A4 | readability test | Every glossed term (acronym or not) that a lesson's `picture` uses is owned by this lesson or by the transitive `needs` closure | picture heading "An ellipse across the line of sight" with `needs: ['uwb-dstwr']` (`uwb-aoa.ts:105`) |
| A5 | spec "Plan template" | A controller-owned vocabulary sheet per track (actors + log spelling, term owners, ZH words); tests: `terms[].term` unique per track; opener names every node-id prefix its builders emit | "tag-1 TX RMARKER → * poll" under a picture that says "the phone" (`uwb-intro.ts:119`); "Report" glossed in dstwr and nba |
| A6 | plan template / ledger | Record the ruling: the old 15–25 min per-lesson pin is superseded by the 500–1300-word band | raised as Minor in batch 4 and again in batch 6 |
| A7 | spec "Going deeper" | An acronym in `deeper` that a later lesson glosses is allowed when the sentence reads without it | GDOP (batch 1), Jacobian (batch 4), eigenvectors (batch 2) each re-argued |

---

## 7. What the AMP and Wi-Fi tracks should learn

1. **Fix A1 and the unit words before the next batch starts.** Every Wi-Fi lesson writes "MHz"
   in its picture; with the mixed-case tokenizer and no `MHZ` in `KNOWN_WORDS`, the whole track
   fails on day one — and without the fix, `A-MPDU`-style tokens are fine but `OFDMA`… is fine
   too, while `MCS`/`SINR` are already all-caps; the words the quirk hides are the ones with a
   lower-case tail (`AoA`, `FoM`, `TDoA`, `QoS`), so the Wi-Fi track's `QoS` needs the fix as much
   as UWB's `TDoA` did.
2. **Ship the vocabulary sheet with the plan (A5).** Six implementers writing in parallel produced
   one unglossed actor word, one term glossed twice and a ZH word for "radio" that changes at
   lesson 13. The Wi-Fi track has more actors (AP, STA, the "laptop", the "phone") and eighteen
   Tier 2 lessons in parallel; without a sheet the drift will be worse. The sheet is also where
   the ZH word for each term is fixed once.
3. **Make `needs` honest by test before batch 1 (A4), not by reviewer judgement.** Two batch
   reviewers waved GDOP/ellipse through as "reasonable to assume"; the test would have failed
   the commit. For the Wi-Fi track, where the old lessons cross-reference freely ("as in the
   backoff lesson"), this is the rule most likely to catch real gaps.
4. **Brief implementers that the four-quantity cap is met by tabulating, not chopping (A2).**
   Seven of thirteen lessons chopped. Put the kit assertion in before the batch so the shape is
   forced at authoring time, and show the aoa case in the brief: a chopped run also loses the
   heading that told the reader which variant the numbers belong to.
5. **Give each batch review one cross-lesson line.** The batch reviews were thorough inside a
   lesson and blind across lessons: a number quoted from another lesson (2.1 cm, 20 octets,
   GDOP 1.26, "the lesson before"), a term glossed elsewhere, a word the opener uses for an actor.
   The uwb-position ↔ uwb-intro "2.1 cm" pin is the model: when a lesson quotes another's number,
   pin it against that lesson's own text so a reseed moves both. Carry rulings (A6, A7) in the
   ledger so reviewers stop re-raising them.
