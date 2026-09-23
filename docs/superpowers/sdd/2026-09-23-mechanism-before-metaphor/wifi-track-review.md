# Wi-Fi track review — "mechanism before metaphor", whole-track pass

Range `c395e14..HEAD`, Wi-Fi files only. All 29 lessons read as dumps in
`COURSE_ORDER` order (EN for all 29, ZH for 12), every `steps` block checked
against the engine function it claims to describe, and the three amendment
rules in `tests/course/readability.test.ts` checked for whether they can fail.
UWB files ignored throughout, as instructed.

Verdict: **NEEDS FIXES** — 7 Important, 11 Minor.

---

## Important

### I1 · `edca`'s worked example loses one slot, and its own procedure says so

`src/course/tier2/edca.ts:106-116`, table "The caller's first voice frame, run
through the steps":

> the end of the AIFS is a slot boundary | 2 → 1
> one more idle slot, 9 µs | 1 → 0
> the voice frame goes out at | **23.1336 ms**

A reader who adds the rows gets 23.1156 + 9 µs = **23.1246 ms**. The run's own
records (`tests/course/edca.test.ts:171-174`) are `BACKOFF_DEC` at 23.1156 → 1,
`BACKOFF_DEC` at 23.1246 → 0, `TX_START` at 23.1336. The missing row is the one
the lesson's step 5 already states — "A counter at zero on a slot boundary is
the one that transmits" (`src/engine/mac.ts:486-491`: a boundary with the
counter already at 0 is the one to transmit on, a further 9 µs later).

The whole point of the amendment is that the reader can redo the computation.
This table cannot be redone. Add the row: `the next boundary, counter already at
zero | 23.1246 → transmits` / `再一个时隙边界，计数器已经在零 | 23.1246 → 发送`.

### I2 · Three lessons narrate an FCS check the simulator never runs

`RX_FAIL` in this engine is decided at `src/engine/channel.ts:698-705`: the
reception's worst SINR against `decodeThreshDb`. The reasons are `lowSinr`,
`collision`, `capture`, `txDuringRx`. There is no CRC over an MPDU anywhere in
`src/engine/` — the only CRC in the repo is `crc16Epc` in `ampBs.ts`, for AMP
tag ids. `FCS_BYTES` (`phy.ts:66`) is a byte count and nothing else; the frame
decoder prints an `FCS` row label (`src/ui/i18n.ts:800`) with no value behind it.

Yet these sentences tell the reader that a check is computed and compared:

- `frame-anatomy`, picture "A check at the end": *"The sender runs everything in
  front of them through a fixed piece of arithmetic that is the CRC, and writes
  the result down; the receiver does the same and compares. If the two disagree
  it says nothing at all."*
- `frame-anatomy`, quiz 2: *"A frame arrives and the receiver's arithmetic does
  not match the four bytes at the end. What does it do?"* — an event the
  simulator cannot produce.
- `ifs`, picture "The penalty gap": *"owed by a station that began receiving a
  frame and found it damaged"*; numbers row: *"a station whose reception started
  and then failed its check"*; step 2: *"If the last reception it started ended
  in a failed check"*.
- `nav`, picture: *"only when the frame has arrived whole and passed its check
  may it trust the announcement"*; step 3: *"A station that receives the frame
  whole, passes its check…"*.

Two other lessons get it right, which is how you can tell this is drift and not
a house style: `edca` step 3 says *"a frame it could not decode"*, and
`bianchi-vs-sim` says *"locked onto one of the overlapping frames and failed to
read it"*. `decode-thresholds` has already taught the real third question
("was the ratio good enough, for the whole frame, for the rung it was sent at?").

Fix: everywhere the main path says "its check failed" / "passes its check",
write what the engine does — "the ratio held for the whole frame" / "the ratio
fell short of what its rung needed" (ZH: 整帧的比值够不够它那一级). Keep the CRC
in `frame-anatomy`'s picture only if it is marked as the standard's mechanism
that this simulator stands in for with the ratio test, and say so on the main
path, not in `sources`.

### I3 · `mumimo` walks the reader to the timeline to see a sounding exchange that is not there

`mumimo` picture, "Which means knowing where everyone is":

> To choose those delays the router first has to measure the room: it sends a
> known pattern and every phone reports back what it heard, which is sounding.

`sounding` is one of the lesson's three `terms`, and the `watch` block two
paragraphs later says "Load the simulation and jump to the first send that
carries more than one phone." The simulator runs no sounding exchange at all —
the lesson's own `sources` admit it ("This simulator runs no sounding exchange
and charges nothing for one: it assumes the aim is already perfect"), but
`sources` is the collapsed section at the very bottom. `mac.ts` has no NDP
Announcement, no NDP, no beamforming report; `transmitDlMu` (`mac.ts:815-830`)
goes straight from the queue to the parts.

This is the exact defect class the brief names: standard behaviour narrated as
though the reader is watching it. `ampdu` shows how to do it — it says
*"This is the part this simulator does not model"* in the picture paragraph
itself. Move the same sentence into `mumimo`'s picture, beside the sounding
paragraph.

### I4 · The control-response rate is told three different ways, and the first telling is wrong

Engine: `ctrlRespRateForMode` / `ctrlRespRateFor` (`src/engine/phy.ts:137-144`,
`283-286`) — the highest mandatory rate (6, 12, 24) at or below the eliciting
PPDU's non-HT reference rate.

- `airtime`, step 5 of "How the duration is worked out, step by step":
  *"the ACK is 14 bytes and goes out at 24 Mb/s, **so that every radio in the
  room can read it**"*. Stated as the rule, inside a `steps` block that claims to
  be what the code does. 24 Mb/s is a scene value, not a floor, and the reason
  given is false — the rate every radio can read is 6 Mb/s.
- `nav` numbers: *"The answer itself: 14 bytes at the safe rate | 28 µs"*;
  `frame-anatomy`: *"28 µs its answer takes at 24 Mb/s in this scenario"* —
  hedged, but still no rule.
- `bianchi` numbers: *"the ACK — 44 µs here, not the 28 µs of earlier rooms"*.
  Reconciles the contradiction without giving the rule (6 Mb/s, because the
  arc's data rate is 6 Mb/s).
- `tier1-project`, "The answer has its own rate": *"An ACK travels not at the
  data frame's rate but at the fastest mandatory rate at or below it: 24 Mb/s
  behind the fast frame, 12 Mb/s behind the slow one."* — the correct rule,
  arriving at lesson 15 of 29.

Fix: put the rule in `airtime` step 5 ("the highest of 6, 12 and 24 Mb/s that
does not exceed the data frame's own reference rate — 24 Mb/s on this link"),
and let `nav`, `bianchi` and `tier1-project` point back to it instead of each
inventing a phrase.

### I5 · The preamble has three names across the track and only one of them is a `term`

`airtime` owns `preamble` in its `terms`. Nothing owns the other two:

| Lesson | What it calls the fixed head of a frame |
|---|---|
| `frame-anatomy` | "a known pattern in front" / **the front** |
| `frame-anatomy-bytes` | **the front** (×4), 前导 / **开场** in ZH |
| `airtime` | **the preamble** (term), 前导 |
| `ampdu` | "the fixed part", **the preamble**, **the front**, 固定开销 / 开场 |
| `width` | **the preamble**, "the fixed opening", "the 48 µs opening", 开场 (×6) |
| `streams` | "the 48 µs opening", 开场 |
| `ofdma-dl` | "opening" throughout, ZH 开场 (×11) against 前导 (×2) |
| `mumimo` | "the fixed opening", "the opening" |
| `mlo` | **the front** |

Three English names and three Chinese names (前导 / 开场 / 固定开销) for one
quantity that the reader is asked to subtract by hand in `width`, `streams`,
`ampdu`, `ofdma-dl` and `mumimo`. `frame-anatomy-bytes`, which teaches it, is
the lesson that never uses the owned word. Pick `preamble` / 前导 for the thing
and keep "opening" only as an adjective in a formula caption, or add a `term` to
`frame-anatomy-bytes` that names the front the preamble and retires 开场.

### I6 · Amendment rule 2 cannot fail for 27 of the 29 lessons

`tests/course/readability.test.ts:535-543` asserts that a lesson using
`margin`/余量, `sensitivity`/灵敏度, `threshold`/门限 or `noise floor`/噪声地板
on the main path has it glossed in the `terms` of that lesson or an earlier one.
The gloss text is `glossTextUpTo(l)` (`:503-506`) — the accumulated `terms` of
**every** migrated lesson up to and including `l`, in both languages.

`decode-thresholds` (lesson 2 of 29) alone puts all four into that accumulator:

- `rate margin` — the term string matches `/\bmargins?\b/`, and its ZH plain is 速率余量
- `sensitivity` — term string; ZH plain 灵敏度
- `CCA` plain EN — "the two power thresholds"; ZH 两条门限
- `sensitivity` plain EN — "read against the noise floor"; ZH 噪声地板

From lesson 3 onward the assertion is `expect(true).toBe(true)`. The rule can
only ever fire on `radio-primer` and `decode-thresholds`. This is the third rule
in this suite to grade vacuously (after the `\b`-in-a-template-literal bug and
the ten literal backspace bytes), and it is the rule the amendment was written
around.

Fix: scope the gloss to the lesson's own `terms` plus the transitive closure of
its `needs` — which is what "an earlier one" was meant to mean and what the
prerequisite-closure rule already does elsewhere.

### I7 · The reader's own sentence is back in the pilot lesson, one character outside the blocklist

`decode-thresholds`, third `observe` item:

> EN: "A lone link at its ceiling still **keeps 3 dB in hand** — against a hard
> threshold, enough never to lose a frame."
> ZH: "一条链路独占空口、又停在自己的上限上时，**手里仍留着 3 dB**；面对一道硬门限，这 3 dB 足以一帧不丢。"

`SHORTHAND` (`readability.test.ts:465-470`) bans `/kept in hand|keeps? in hand/`
and `/留在手里|手里留/`. "keeps 3 dB in hand" puts "3 dB" between `keeps` and
`in hand`; "手里仍留着" puts 仍 between 手里 and 留. Neither matches. The margin
is defined in this lesson, so the sentence is not unreadable — but it is the
reader's own phrase, in the lesson they stopped at, surviving a rule written to
delete it. Rule 1 is a blocklist and the prose has drifted around it by one
character. Rewrite the item ("still has 3 dB of rate margin above what its rung
requires" / "在它那一级的要求之上还有 3 dB 速率余量") and widen both regexes to
allow an intervening quantity.

---

## Minor

### M1 · The ZH half of rule 3 grades nothing but acronyms

`namedInPlace` (`src/course/readability.ts:423-436`) returns `true` when the
term is absent from the text. It is called once with the EN picture and once
with the ZH picture, using the same Latin token. For a non-acronym term —
`preamble`, `payload`, `queue`, `antenna`, `symbol`, `sub-carrier`, `attempt`,
`ceiling`, `excursion`, `bottleneck`, `offered load`, `estimator`, `residual`,
`brief`, `link budget`, `protection` — the Latin string never occurs in Chinese
prose, so the `(zh)` check passes unconditionally. The test's own header comment
claims "The word rules are applied to BOTH languages". For most `terms` entries
the Chinese arm is decorative.

### M2 · Five terms are owned twice, or split

- `capture` and `residual` are `terms` of **both** `bianchi-vs-sim` and
  `tier1-project-review` (two lessons apart).
- `Duration` is a `term` of `nav`, although `frame-anatomy` already taught the
  field and its 44 µs five lessons earlier.
- `margin` (`tier1-project`) restates `rate margin` (`decode-thresholds`), with
  a different definition ("the extra decibels a station insists on before
  trusting a faster rung" vs "the 3 dB a sender holds back").
- `saturation` (`bianchi`) and `saturated` (`tier1-project`) are two entries for
  one idea.

`terms` is labelled "New words" in the panel; a word cannot be new twice.

### M3 · Three names for the rate loop

`rate adaptation` (a `term` of `anomaly`), `rate control` (a `term` of
`bianchi-vs-sim`, and the title of `rate`), `ARF` (a `term` of `rate-fallback`),
plus `tier1-project-review`'s prose "rate adaptation". They are one mechanism —
`src/engine/rate.ts`. Name it once, in `anomaly`, and have the later three say
"the rate loop of `anomaly`".

### M4 · `mlo` gives the aggregation ceiling without the bounds that decide it

`mlo` step 4: *"takes frames off the shared queue and sends (TX_START): up to 64
consecutive frames for one receiver with aggregation on, one without."* The
engine's predicate (`mac.ts:633-635`) is `MAX_AMPDU_MPDUS` **and**
`x.dataNs <= MAX_PPDU_NS` **and** `t + x.totalNs <= txopEnd` — which is the
whole point of `ampdu` step 2 ("stops before the first frame that would make the
transmission longer than 5.484 ms or push the whole exchange past the end of the
turn"), and the reason `ampdu`'s batch is 14 and not 64. `mlo`'s own worked
example then shows 20 frames, which "up to 64" does not explain.

### M5 · `backoff` and `edca` tell the countdown with two different decrement rules and neither says so

- `backoff` step 3: *"For every whole slot of 9 µs the medium stays idle, the
  counter drops by one. The slot that brings it to zero is the slot the station
  sends in."*
- `edca` steps 4-5: the counter decrements at the end of the AIFS, and a counter
  *already* at zero on a later boundary is the one that transmits.

Both are correct for their branch (`mac.ts:464-497`: `if (this.cfg.edca)
this.decrement(e)` at the IFS end, and the two different `onSlotTick` paths), and
the elapsed time comes out the same either way. But a reader carrying `backoff`'s
rule into `edca` lands one slot early — which is exactly the arithmetic that goes
wrong in I1. One sentence in `edca` ("the count of slots is the same; where the
decrement falls is not") would close it.

### M6 · `backoff` fuses the two retry counters

`backoff` step 6: *"On the seventh straight failure the frame is given up: the
station stops retrying it, and the window drops back to its floor."* The engine
keeps two counters: `m.retries` per MSDU, which discards at
`SHORT_RETRY_LIMIT` (`mac.ts:1119-1131`), and `e.qsrc` per EDCAF, which resets CW
(`mac.ts:1089-1098`). `retries-queues`' "Two counters, not one" then takes the
same claim apart and gives the instant they come apart (504 465 µs). `backoff`'s
sentence is true only of its own scene; say so, or say "two counters that happen
to move together here".

### M7 · The Chinese has content the English does not

`lessonWords` counts the EN strings only, so ZH additions are unbudgeted and
nothing reviews them:

- `decode-thresholds`, second experiment: ZH ends "3 dB，几乎让空口时间翻倍。"
  The EN item stops at "…from 768.8 to 1476.0 µs."
- `mlo`, first numbers table: the ZH column head is
  "占该频段时钟的比例（含回答）" where the EN is "Share of that band's clock".
  The qualification (the share includes the acknowledgements) is a fact only the
  ZH reader gets.
- `mlo`, "When everybody has two doors": ZH adds
  "——这句话说的是邻居，不是这台设备。"

Otherwise the Chinese is genuinely written, not translated: `edca`'s
四间候车室 / 抢跑 / 抽签只不过是被做了手脚, `backoff`'s 先掷骰子，再倒着数,
`mlo`'s 从一扇门变成两扇门 all read as Chinese and carry the mechanism. No
English word order found in the twelve ZH dumps read.

### M8 · Two words are used well before the lesson that names them

- **airtime**: a column head ("空口时间") and an `observe` item in
  `decode-thresholds` (lesson 2); `airtime` is lesson 6 and is titled "Frames
  cost airtime".
- **burst**: `roles-stack` (lesson 3) `observe` — "one burst carrying 50
  payloads" — and its third quiz answer, "50 frames and one burst". Aggregation
  is `ampdu`, lesson 18. `frame-anatomy-bytes` (lesson 5) shows the arithmetic,
  so the gap is two lessons rather than fifteen, but at lesson 3 the word is bare.

### M9 · The 接入点（AP）/ 站点（STA） bracket becomes ritual in Tier 2

The rule (`STAND_INS`, `readability.test.ts:490-493`) requires the name beside
the first stand-in in every graded lesson, and 54 such brackets now appear across
the ZH dumps. In Tier 1 they land where they should. By `mlo` (lesson 28) the
first 站点 in the picture is in a comparison sentence —
"最后两台站点（STA）各自发出的帧数一样多" — where the bracket is noise, not a
joining of the analogy to the log. Consider exempting a lesson whose whole
`needs` closure has already named the actor, or letting the rule accept the name
anywhere in the first picture paragraph.

### M10 · `numbers` is written to the ceiling

Ten of the 29 sit within 10 words of the 550 cap: `txop-protect` 550,
`bianchi` 549, `bianchi-vs-sim` 549, `capstone` 549, `tier1-project-review` 549,
`mlo` 548, `retries-queues` 543, `edca` 543, `tier1-project` 543, `frame-anatomy`
539. The amendment says a lesson that does not fit **splits**; ten lessons
tuned to the last word is the pattern the amendment was written to stop, one
ceiling higher. Nothing is wrong in any one of them — it is worth a look before
the next content wave pushes them over.

### M11 · `ofdma-ul`'s round row reads as if the padding is inside the payload

> Two TB PPDU answers, side by side | 1988.8 µs | 16,894 bytes from each uploader
> on half the channel each: eleven whole frames and 531 bytes of padding

16,894 B **is** the eleven frames (10 × 1536 + 1534, the A-MPDU arithmetic of
`ampdu`); the 531 B is padding on top, to the 17,425 B the length allows — a
number that appears only in the next table. As written, a reader divides 16,894
by 11 and gets 1,535.8. Split the row, or say "16,894 bytes of frames plus 531
bytes of padding, 17,425 in all".

---

## Rule check (task 5)

Three lessons, one broken rule each, traced by hand:

- **`edca`** — put 留在手里的 3 dB into a picture paragraph. `lessonStrings`
  (`readability.ts:241-256`) walks `picture`, so `SHORTHAND[0]` matches and the
  "points at no quantity it has not named" case fails. **Fires.**
- **`mlo`** — drop the `（AP）` from 接入点（AP） in the picture.
  `namedAtStandIn` finds 接入点 and its 34-character window holds no
  `(…AP…)`, so `AP at 接入点 (zh)` lands in `unnamed`. **Fires.**
- **`width`** — delete the "What a width actually changes, step by step" block.
  It is the lesson's only `steps` block in `picture` + `numbers`, so
  `steps.length` is 0. **Fires.**

Rules that cannot fail: **rule 2 for every lesson after `decode-thresholds`**
(I6), and **the ZH arm of rule 3 for every non-acronym term** (M1). The two
previously-reported vacuity bugs are genuinely gone — `grep -n $'\x08'` over
`src/course/` and `tests/course/` returns nothing, and `namedInPlace` now builds
its regex with `\\b`.

---

## Verdict

The track teaches its mechanisms. That is a real change and it is visible
everywhere: `rate` and `rate-fallback` reproduce `src/engine/rate.ts`
step for step; `mumimo` steps 1-4 are `transmitDlMu` in order, threshold and
trim and all; `ampdu`, `txop`, `txop-protect`, `hidden`, `width`, `streams` and
`ofdma-dl` all carry worked examples whose arithmetic closes against the engine
constants; `bianchi-vs-sim` and `tier1-project-review` teach a reader how to
report a residual instead of fitting one. The Chinese is written rather than
translated, and the cross-lesson constants — 1528 / 1530 / 1534 bytes, 44 / 48 /
52 µs, 2.528 / 4.096 ms, the 3 dB margin, the 45 µs deadline, the seven attempts
— agree wherever two lessons name the same one.

What it still does is gesture in three places where no per-batch reviewer could
have seen it: at a mechanism that only exists in the standard (the FCS check, I2;
sounding, I3), at a rule that only one of four lessons states (the control
response rate, I4), and at a quantity that has three names (the preamble, I5).
Add one arithmetic hole in a worked example (I1) and one rule that has been
grading nothing for the whole rollout (I6), and the track is a fix wave short of
merging, not a rewrite short.
