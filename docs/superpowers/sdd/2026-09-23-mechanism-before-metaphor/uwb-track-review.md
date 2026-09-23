# UWB whole-track review — "mechanism before metaphor"

Date: 2026-09-23. Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.
Range reviewed: `c395e14..HEAD`, `src/course/uwb/*.ts` and `tests/course/uwb-*.test.ts`.
Read in `COURSE_ORDER` order, EN and ZH, against `src/uwb/` and against
`tests/course/readability.test.ts`.

Verdict: **NEEDS FIXES** — 8 Important, 13 Minor.

Already known and not re-argued here: the rule-2 quantity glosses (`margin` in
`uwb-blocks` / `uwb-mms-numbers`, `threshold` in `uwb-coexist` / `uwb-nba`,
`sensitivity` in `uwb-mms`) and the translated-English bullet in `uwb-coexist`
(还是那些帧在还是那些块里丢掉). Finding **I7** below is about those five: the rule
as it stands cannot report them, and two more instances are hiding behind it.

---

## Important

### I1 — The MMS fragment train is spaced `(R+1) × slot`, not one millisecond. Three lessons say a millisecond.

`src/uwb/session.ts:105` — `fragGapNs: (mmsResponders(cfg.mms, anchors) + 1) * slotNs`.
In the base scene of `uwb-mms` / `uwb-mms-numbers` (three responders, a 600 RSTU
slot = 500 µs) that is **4 slots = 2 ms** between a device's own fragments, and the
eight-fragment train spans **14 ms**, not 7. `src/uwb/mms.ts:131-133` says so out
loud: "`MS_RCTU`, a true millisecond, **in the pairwise round** at the draft's
600 RSTU slot, and longer in every other round the schema allows".

Instances:

- `uwb-mms`, numbers step 3: *"One millisecond of it is one slot for the tag and
  one for each anchor, so the trains interleave, one fragment a device a
  millisecond."* — Four slots is two milliseconds here. Should read: *one slot
  for the tag and one for each anchor, so a device's own fragments are four slots
  — two milliseconds — apart.*
- `uwb-mms`, worked table: *"The ranging phase | slots 8–39 · 4/ms · 8 fragments"*
  — 4 devices per 2 ms. Should be `4 per 2 ms` (or `4 devices per gap`).
- `uwb-mms-numbers`, picture heading and paragraph: *"A ruler a millisecond long
  … Its fragments leave exactly a millisecond apart on the sender's clock"* /
  ZH *"它的各个片段在发送方的时钟上正好每隔一毫秒发出"*. Should name the round's own
  gap, which is the quantity the ratio is divided by.
- `uwb-mms-numbers`, formula: *"ratio = span_measured / ((j − i) × 1 ms)"* — the
  engine divides by `(last.index − first.index) * fragGapRctu(mp)`
  (`src/uwb/device.mms.ts:463`, `:145`), i.e. by the round's actual gap.
- `uwb-mms-numbers`, numbers: *"Over the 7 ms from a train's first fragment to its
  eighth, 100 ps stamps give σ_ratio = 0.0202 ppm"* — 14 ms, 0.0101 ppm. The row
  *"The train's 0.0202 ppm | 1.5 mm"* moves with it.
- `uwb-capstone`, picture: *"a train is a fragment from every device in every
  millisecond it lasts"* — every gap, which in that variant is not a millisecond.

The lesson's own evidence already contradicts the sentence: `uwb-mms`'s title
("Sixteen milliseconds of energy"), its `observe` (*"one frame every half
millisecond"*) and its slot range (8–39 = 32 slots = 16 ms for 8 fragments) all
assume the 2 ms gap. The pin does not catch it because it never touches the scene:
`tests/course/uwb-mms-numbers.test.ts:337` hard-codes `ratioSigma(tsNoisePs, 7)`,
so `expect(sigmaPpm().toFixed(4)).toBe('0.0202')` is arithmetic about the literal
`7`. The fix wave must re-derive the span from `mmsLayout`/`fragGapNs`.

Also inside this finding: `uwb-mms` step 4 says *"Only the first fragment of a
train is stamped"*. `src/uwb/device.mms.ts:446-468` draws **two** stamps — the
first heard fragment and the last heard one — and the second is what the ratio
`uwb-mms-numbers` is built on exists at all. Say two.

### I2 — `uwb-capstone` denies the redundancy `uwb-position` teaches.

`uwb-capstone`, deeper: *"A least-squares fix over three ranges has no redundancy
at all: three unknowns would be two coordinates and nothing else, so with three
ranges the residual has one degree of freedom left."*

The sentence contradicts itself within one clause, and "three unknowns" is wrong:
the solver has exactly two (`src/uwb/position.ts:87-116`, x and y with z held).
`uwb-position`'s quiz is right — *"Yes, with one measurement to spare, so a
residual is still computed"* — and so is `uwb-coexist`'s three-anchor fix. Should
read: *a three-range fix has one measurement to spare over its two unknowns, so a
single biased range moves the answer almost as much as it is biased and the one
degree of freedom left is not enough for the fit to notice.*

### I3 — "residual" names two different mechanisms in one track.

`uwb-position` puts `residual` in its `terms`: *"what the best answer still cannot
explain — how far the measurements miss it"* — the least-squares fit residual
(`src/uwb/position.ts:158`). Four later lessons reuse the word for the
clock-offset leftover, which `uwb-sstwr` calls *"the leftover"* and `uwb-dstwr`'s
`why` calls *"a residue"*:

- `uwb-contention`, numbers: *"A single-sided measurement keeps a residual of
  3.0 cm for every millisecond the answer waits"*; deeper: *"The base run shows
  the residual directly. Its per-slot RMS range error climbs 7.3, 14.9 …"*
- `uwb-dl-tdoa`, sources: *"0.2 ppm of residual on a measured clock offset"*
- `uwb-ul-tdoa`, step 3: *"plus this anchor's residual calibration error"*

A reader who learned `residual` from `uwb-position` reads `uwb-contention`'s
sentence as a statement about the position fit, which it is not. Pick one name for
the clock term — `uwb-sstwr`'s *leftover* is already established and glossed in
place — and leave `residual` to the fit. `uwb-dstwr`'s *residue* goes with it.

### I4 — `uwb-sstwr` says the fix is weighted by a 1-σ. Nothing weights it.

`uwb-sstwr`, numbers step 7: *"The range line carries that figure, the raw one
beside it and a Figure of Merit byte — never an error bar. **The 1-σ the fix is
weighted by** is computed apart, from the timestamp noise alone: 100 ps ÷ √2 × c,
or 2.1 cm."*

`rangeSigmaM` (`src/uwb/position.ts:30-33`) enters **only** the covariance
`Σ = σ_r²(JᵀJ)⁻¹` (`position.ts:170-173`); the Gauss–Newton normal equations
(`position.ts:124-149`) are unweighted, and no caller reads a per-range sigma.
`uwb-geometry` states it correctly twice — *"this solver never looks at it — all
four ranges weigh alike"* and step 7's *"no step after the first read a measured
range"* — so the two lessons disagree and `uwb-sstwr` is the wrong one. Should
read: *the 1-σ the error ellipse is drawn from is computed apart …*; the fix
itself weights every range alike.

### I5 — `uwb-position` still promises the reader a residual they cannot see.

The fix wave corrected step 7 (*"The record goes out as UWB_POSITION, which does
not carry that figure"*) and `uwb-capstone`'s rubric, but two places still send the
reader to use it:

- `outcomes`: *"use what the fit cannot explain — the residual — to tell a good
  round from a spoiled one"* — a capability the lesson's own scene cannot give.
- `picture`, "The fourth ring is the check": *"A clean round leaves a residual
  under a micrometre. A range that lies leaves centimetres — and the solver knows
  that without being told which range lied."* The reader meets the claim here;
  the disclaimer is three sections away.

Engine: `Fix.residualM` is computed at `src/uwb/position.ts:158` and read by
nobody; `UWB_POSITION` (`src/uwb/records.ts:48`) has no such field.
`uwb-geometry` handles it the way the amendment asks — *"no record carries that
figure — on screen, nothing moves"* — at the point of use. Reword the outcome to
what the reader can actually do (*say what the fit cannot explain, and why the
log does not print it*) and carry `uwb-geometry`'s half-sentence into the picture.

### I6 — `uwb-mms` states the integrity fragment's security property as fact; the simulator's RIF is an energy verdict.

`uwb-mms`, deeper: *"integrity fragments, whose sequence is not known in advance
and which therefore cannot be forged by replaying a recording."*

In the engine the `integrity` flag on `UWB_RANGE` is `p.rifDetected`
(`src/uwb/device.mms.ts:487`, `:531`) — nothing but whether the RIF train cleared
sensitivity. No sequence is generated, nothing is compared, and MMS receptions
never reach the attacker/STS branch at all (`src/uwb/device.ts:465-472`;
`src/model/scenario.ts:302-303`: "MMS fragment trains are outside the model's
reach"). This is the class `uwb-sts` was fixed for — that lesson now says plainly
*"This simulator does not do it … What it models is the outcome of the
comparison"* — and `uwb-mms` reopens it without the same sentence. Add one clause:
*in this simulator an integrity verdict is a detection outcome, not a comparison*;
and say that a relay cannot be run against an MMS round at all.

### I7 — Rule 2 cannot fail for any UWB lesson.

`glossTextUpTo` (`tests/course/readability.test.ts`) was narrowed from "every
earlier lesson" to the transitive closure of `needs`, on the grounds that
`decode-thresholds` alone put margin, sensitivity, threshold and noise floor into
the pool. For UWB the closure reaches it anyway:

```
uwb-intro.needs = ['radio-primer', 'frame-anatomy']
frame-anatomy.needs = ['roles-stack'] ; roles-stack.needs = ['radio-primer', 'decode-thresholds']
```

so every UWB lesson's closure is
`radio-primer > decode-thresholds > roles-stack > frame-anatomy > uwb-intro > …`,
and `decode-thresholds`'s `terms` define all four quantities in both languages
(sensitivity/灵敏度, CCA's two 门限, rate margin/速率余量, noise floor/噪声地板 under
SNR). Measured over the track, six lessons use a quantity on the main path and
**none** is reported:

| lesson | quantities used on the main path | rule 2 |
|---|---|---|
| `uwb-blocks` | margin | green |
| `uwb-coexist` | threshold, **noise floor** | green |
| `uwb-mms` | sensitivity, **threshold** | green |
| `uwb-mms-numbers` | margin, **sensitivity**, **threshold** | green |
| `uwb-nba` | threshold | green |
| `uwb-nba-coexist` | threshold | green |

The bold entries are instances the hand audit had not recorded. The fix is to stop
the closure at the track boundary for this rule (a UWB lesson may lean on
`radio-primer` and `frame-anatomy`, not on everything those two happen to need),
or to exclude `decode-thresholds` from the pool for lessons outside the Wi-Fi
track. Until then rule 2 is the fourth vacuous rule in this suite.

### I8 — The Chinese arm of the naming rule grades only Latin tokens.

`namedInPlace` (`src/course/readability.ts:423-436`) opens with
`const m = re.exec(text); if (!m) return true`. A term that never appears in the
Chinese text is therefore **passed, not failed** — so the ZH arm grades a term
only when the Chinese spells the Latin token. Verified directly:
`namedInPlace('锚点是固定在墙上的那台射频。', 'anchor')` → `true`;
`namedInPlace('整张日程就是一个块…', 'block')` → `true`.

Fourteen of the eighteen UWB lessons have at least one term that is never graded
in Chinese; four have all or nearly all of theirs ungraded:

| lesson | terms ungraded in ZH |
|---|---|
| `uwb-blocks` | block, round, slot, RSTU (all four) |
| `uwb-nba` | narrowband, NB Poll, NB Response, NB Report (all four) |
| `uwb-aoa` | phase difference, boresight, field of view |
| `uwb-mms-numbers` | combining gain, clock ratio, parameter set |
| `uwb-mms` | MMS, fragment, RIF |
| `uwb-contention` | response window, sit-out |
| `uwb-sstwr` | crystal, clock offset |
| (also) | `uwb-intro` RCTU · `uwb-sts` key · `uwb-dstwr` RMI · `uwb-position` residual · `uwb-coexist` overlap · `uwb-nba-coexist` allow list, hop · `uwb-capstone` duty cycle |

The rule needs a Chinese side for each term — the `plain.zh` head-word, or an
explicit `zh` name on the `Term` — and the "not present" branch has to fail for it,
not pass. As it stands the amendment's central rule has never graded the Chinese
half of the track.

---

## Minor

### M1 — ASCII quotes in Chinese, in the first two batches only.

16 straight `"` inside ZH strings: `uwb-sstwr` (7), `uwb-dstwr` (4), `uwb-frame`
(2), `uwb-sts` (2), `uwb-intro` (1). Every lesson from `uwb-blocks` onward uses
full-width “ ”. Examples: `载入"最差晶振，±20 ppm"` (`uwb-dstwr`),
`那次"几乎抵消"就成了真的抵消` (`uwb-sstwr`), `宣告"节拍到此为止"` (`uwb-frame`).
Quoted log lines (`"10 slots × 2000.0 µs"`, `"(97 % within 0.5 ns)"`) may keep
ASCII; the rest should be “ ”.

### M2 — The thing being located changes name four times.

`phone` (intro → geometry, coexist, nba-coexist, capstone) · `tag`
(`uwb-geometry`'s jump list, `uwb-contention`'s steps, `uwb-mms`) · `badge`
(dl-tdoa, ul-tdoa, aoa) · **`asker`** (`uwb-nba`, used nowhere else).
`uwb-contention` mixes two inside one lesson: the picture says *"the phone"*, the
steps say *"The tag's poll opens the round"*, *"at the tag"*, *"whether the tag
ranged it"*. `uwb-position` and `uwb-geometry` share a scene and one calls the
same jump "the phone's Poll" and the other "the tag's Poll". And *"a tag —
anything being located"* is glossed three times (intro, dl-tdoa, ul-tdoa), which
is the symptom. The same churn on the other side: `anchor` / `responder` /
*"the named device"* / *"the answering device"* inside `uwb-nba` and `uwb-mms`,
with `responder` never introduced anywhere on a main path.

### M3 — "noise floor" names two things.

`uwb-coexist`, picture: *"it lifts the noise floor a few decibels"* (an RF level,
dBm). `uwb-mms-numbers`, numbers table: *"The noise floor under all of them, over
21 ranges | 2.10 cm"* (a precision floor, cm). Rename the second — *the floor two
receive stamps already put under any range*.

### M4 — `uwb-mms`'s slot check is not the check the schema makes.

Step 7: *"it divides the millisecond"*; the worked cell prints *"600 % 300 = 0"*.
`src/model/scenario.ts:692` requires an MMS slot to be a **multiple of 300 RSTU**.
900 RSTU is a legal multiple and does **not** divide a millisecond (1200 RSTU), so
the words and the arithmetic describe different rules. Say *it is a whole number of
300 RSTU*.

### M5 — `uwb-nba`'s sources contradict its own numbers.

Sources: *"The 28-slot round and the 200 ms block are the session's settings"*;
numbers: *"a round is 52 slots of 500 µs, so 26 ms"*. 28 is the **pairwise**
round (`src/uwb/mms.ts:309-368`: control 4 + rp 20 + report 4); the base scene is
one-to-many with three responders, 8 + 32 + 12 = 52.

### M6 — `uwb-blocks` presents the round as a configured length.

*"Three nested clocks | Ranging round | 24 000 RSTU | 20.0 ms"* and step 1
*"Those three lengths are fixed before a frame flies and never renegotiated"*.
Only two are configured: `src/uwb/session.ts:91` `roundNs = slots · slotNs`. The
lesson's own 0.5 ms variant proves it — the round falls to 5 ms with nothing else
touched. Say *two lengths are set and the round falls out of them*.

### M7 — `uwb-coexist`'s "only one works" is answered by its own table.

Picture heading *"Three cures, and only one works"*, against deeper's *"Three
cures, measured"*, which lists four and marks two as `yes`, and against the
`Wi-Fi on channel 7` variant the `observe` section sends the reader to load, where
the losses stop. The bullet is carefully scoped to *partial* overlap; the heading
is not. Rename the heading (*Three cures — and what "partial" buys*).

### M8 — `uwb-coexist`'s procedure has only the hard branch.

Step 4 stops at *"At or above −12 dB it decodes; below, it is lost"*. The engine
also carries the same foreign level into the timestamp draw
(`src/uwb/device.ts:502` → `uwbSinrDb`/`tsSigmaNs`, `src/uwb/phy.ts:145-165`), so
an interferer costs precision on the frames that survive as well as the frames it
kills. Related and track-wide: every lesson quotes *"100 ps of 1-σ noise on every
received timestamp"* as a flat constant. It is a **floor**: `tsNoiseScale`
multiplies it by up to ten as SNR falls below 20 dB. In these scenes the multiplier
never leaves ~1.0, which is why nothing is wrong numerically — but the sentence is
stated as the model and is not.

### M9 — the nine-anchor cap is not a free model choice.

`uwb-blocks`, sources: *"…and the nine anchors one Final can list"* listed among
"the simulator's own model choices". `src/uwb/phy.ts:308` derives it: a 14 + 12N
Final at ten anchors is 134 octets, past the 127-octet PSDU cap.

### M10 — GDOP arrives three lessons before it is named.

`uwb-dstwr`'s deeper: *"GDOP 1.00 for this symmetric ring"*. `deeper` is exempt
from the acronym rule, so the suite is right to stay green, but that is where a
reader meets the token; `uwb-geometry` names it four lessons later.
`uwb-position` handles it correctly (*"a GDOP (the price the anchors' own layout
puts on that error)"*). Give `uwb-dstwr` the same parenthesis.

### M11 — stale rule bookkeeping in the suite.

`CELL_RULE_CARRIES` is `{}` and the comment above it still reads
"TODO(uwb-fix-wave): `uwb-ul-tdoa` and `uwb-mms-numbers` print English phrases into
language-neutral cells … `uwb-dstwr` and `uwb-blocks` print `Treply1` and `SP1`
unglossed." The suite is green because those cells' ZH now differs from their EN,
which exempts them from the neutral-cell rule rather than fixing them —
`uwb-ul-tdoa` still prints *"1 slot of 2 ms, 1 frame"*. Either delete the comment
or re-point the rule.

### M12 — the base MMS train is not one of the parameter sets the lesson defines.

`uwb-mms-numbers` glosses `parameter set` as *"a named, ready-made choice of
fragment length and train length that both ends can name in one word"* and its
deeper calls `rsf-1` *"one of the seventeen mandatory sets"*. The scene's own
train — `rsfs 8, nMsr 40, gap 64` (`src/model/scenario.ts:327-330`) — is **not**
one of the seventeen (`src/uwb/mms.ts:200-218`), which is deliberate in the engine
and unsaid in the lesson.

### M13 — rule 1 is a four-phrase blocklist harvested from the Wi-Fi track.

Verified failable — `"the 3 dB it keeps in hand"`, `"head arithmetic"` and
`手里还留 3 dB` are all caught — but nothing in the UWB track trips any of the four
regexes, and the shapes the amendment was written against pass: *"What the
correction leaves behind"*, *"the leftover grows with the waiting"*,
*"剩下的那一项依旧是应答时长的一半"*, *"Everything here is in that line."* The rule
grows by hand, so this is a note rather than a defect: the UWB track's own pointer
phrases should be harvested into `SHORTHAND` before the next track.

---

## What the track gets right

Worth recording, because most of it is new in this range and it is what the
remaining findings sit on top of:

- The four-timestamp chain is told once and consistently: `uwb-intro`'s
  `(Tround − Treply)/2` is `ranging.ts:4-6`, `uwb-sstwr`'s
  `(Tround − Treply·(1 − Coffs))/2` is `ranging.ts:9-11` including the sign of
  `Coffs` (`device.ts:507-509`), and `uwb-dstwr`'s four-interval quotient is
  `ranging.ts:14-16` to the letter — with the right observation that the two waits
  need not be symmetric, which the engine's own docstring gets wrong.
- Frame sizes and slot counts agree across all six batches and with the engine:
  Poll `27 + 3N`, Response 20 (SS) / 14 (DS), Final `14 + 12N`, Report 24;
  SS `N + 1` slots, DS `2N + 2`, DL-TDoA `N + 1`, UL-TDoA 1, MMS pairwise 28 /
  one-to-many 52.
- `uwb-sts`, `uwb-aoa`, `uwb-ul-tdoa` and `uwb-nba-coexist` each say what the
  simulator does *not* do at the sentence where the reader meets the claim — the
  boolean gate, the single phase draw, the wired-sync bias drawn once, the one
  instantaneous reading standing for a 9 µs window. That is the amendment working.
- Contention, blocks and the narrowband LBT are procedurally exact: the uniform
  draw over `[1, S]`, the attempt budget as the only backoff, the absence of a
  timeout for an unclaimed contention slot, the whole-block discontinuation.

## Does the track teach its mechanisms?

Mostly yes, and for the first time. Fifteen of the eighteen lessons now carry a
procedure a reader can execute against the log, and the procedures agree with each
other and with `src/uwb/` on the two things the track is actually about — what the
four counters are and what cancels between them, and what a schedule fixes before
anyone transmits.

Three places it does not yet. The MMS cluster teaches a ruler that is the wrong
length (**I1**), so the one lesson whose subject *is* the arithmetic gets the
arithmetic wrong, and its test pins a literal instead of the scene. The
position cluster tells the reader twice that a residual is a tool they have
(**I5**) and then, in the capstone, denies that the tool exists at all (**I2**);
meanwhile a second, unrelated quantity has taken the same name (**I3**). And the
suite that is supposed to hold all this in place has two arms that cannot fail —
rule 2 for the whole track (**I7**) and the Chinese half of the naming rule
(**I8**) — which is why five known quantity failures and fourteen lessons' worth of
ungraded Chinese terms are green today.

Fix I1–I5 and the track teaches its mechanisms. Fix I7 and I8 and it will keep
doing so.
