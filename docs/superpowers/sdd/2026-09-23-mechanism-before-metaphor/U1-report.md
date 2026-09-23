# U1 — uwb-intro, uwb-frame, uwb-sts

Batch U1, the first UWB batch. Base HEAD at start: 877ec45.

Grade: `MECHANISM_INCLUDE=uwb-intro,uwb-frame,uwb-sts READABILITY_INCLUDE=uwb-intro,uwb-frame,uwb-sts npx vitest run tests/course/readability.test.ts` — 934 passed, 0 failed.
`npx tsc -b --noEmit` clean. `npx vitest run tests/course` — only `uwb-dstwr · lesson shape` fails, another implementer's in-flight file (`src/course/uwb/uwb-sstwr.ts`, `uwb-dstwr` are modified in the shared worktree and are not mine).

---

## uwb-intro — "A radio that measures time"

Budget line (after): `uwb-intro  picture 430/900 · numbers 313/550 · practice 256/450 · total 999 (999 words, 15 min)`
Before: `picture 472 · numbers 269 · practice 256 · total 997`. The opener's ceiling is 1000, so the
procedure was paid for by cutting metaphor, not mechanism — see "what was cut" below.

### The procedure (`numbers`, steps block "From four counters to metres", 6 steps)

Taken from `src/uwb/device.ts` in its own order, not from the old prose:

1. `UwbDevice.transmitFor` reads `clock.counter(t + UWB_RMARKER_NS)` **before** it sends, and
   `send()` emits that as `UWB_TS dir:'tx'`.
2. the receive branch of `onRx` stamps the arriving RMARKER
   (`trueRmarkerNs = txStartNs + UWB_RMARKER_NS + propNs`, plus the estimator's noise).
3. one slot on (2 ms, `slotStartNs` in `src/uwb/session.ts`, 2400 RSTU) the anchor's `uwbResp`
   case computes `counterDiff(txCounter, r.rxPollCounter)` and puts it in the frame as
   `replyRctu` (`makeResp`, `src/uwb/frames.ts`).
4. `onResponse` computes `tround1 = counterDiff(counter, r.txPollCounter)`.
5. `ssTwrRaw(tround, treply) = (tround − treply) / 2` (`src/uwb/ranging.ts`).
6. `rctuToMetres` = ticks × `RCTU_NS` × `C_M_PER_NS`; `reportRange` writes `UWB_RANGE`.

The worked example is the lesson's existing four-counter table and the Tround/Treply/T̂prop
formula, which now reads as the run of those steps on this scene, value by value, ending at
5.02 m.

### Naming at the stand-in

- `UWB`: 超宽带（UWB）/ "An ultra-wideband (UWB) radio" at its first use.
- `anchor`: named in `why` — "one anchor (a radio fixed to the wall)" — and joined to the log in
  the watch block: "the radio fixed to the wall (the anchor, `anchor-1`)" / 固定在墙上的那台射频
  （也就是锚点，日志里的 anchor-1）. `tag-1` was already joined there.

### Terms added

None — the opener is capped at four and keeps `UWB`, `anchor`, `RMARKER`, `RCTU`.

### What was cut to fit 1000 words

Nothing that states a mechanism. Removed/shortened: the `numbers` paragraph "The anchor answers
in the next ranging slot…" (its content is now step 3, and its pin survives, requoted); the tail
of "Two clocks that do not agree" and of the RMARKER paragraph (both said what the steps now say);
the SS-TWR formula note, shortened to "Tround is the phone's own subtraction, Treply the
anchor's"; "detection threshold" reworded to "the instant a pulse is judged to have arrived",
which is what `tsSigmaNs` models.

### Pins added (`tests/course/uwb-intro.test.ts`, describe "the procedure, step by step")

- the steps block exists, has six items, and is on the main path (not in `picture`);
- steps 1–2: `UWB_TS` order and `t`, the tx stamp shares its TX_START instant, 17 ns of air;
- step 3: the anchor's tx stamp is at 2 000 000 ns and the Response's `frame.uwb.replyRctu`
  **equals** `counterDiff(anchorTx, anchorRx)` = 127 794 132 (new — the reply time really is
  carried in the frame, not recomputed);
- steps 4–6: `ssTwrRaw` is the halved difference, `UWB_RANGE.tofRawRctu` is that number, and
  `rctuToMetres(flight)` equals `flight × 15.650 ps × 0.299792458 m/ns` to 12 places;
- the round holds exactly four stamps, one range, no rejection and no timeout.

Also updated the file header comment, which still quoted the pre-amendment sub-budgets
(650/350/400); it now names `BUDGETS.openerMax` and 900/550/450.

---

## uwb-frame — "What a ranging frame is made of"

Budget line: `uwb-frame  picture 655/900 · numbers 410/550 · practice 316/450 · total 1381 (1381 words, 15 min)`
(before: 632 · 208 · 316 · 1156). Register untouched; the prose is the reference pair's.

### The procedure (`numbers`, steps block "How a stamp is taken off this frame", 6 steps)

From `src/uwb/frameFields.ts` (`uwbPpduLayout`, `UWB_RMARKER_OFFSET_NS`), `src/uwb/device.ts`
(`transmitFor` / `send` / `onRx`) and `src/uwb/phy.ts` (`UWB_TS_ACCUM_GAIN_DB`):

1. the sender lays out the five fixed segments and the PSDU, whose length alone follows the
   message (`uwbPpduLayout` gives the PSDU the remainder);
2. it counts 73.269 µs (`SYNC + SFD`) from the first chip and reads its ranging counter there —
   the TX RMARKER line;
3. the receiver accumulates the whole SYNC field, 64 repetitions of one preamble symbol, worth
   `10·log10(64)` = 18.1 dB (this is the "preamble accumulation" the dispatch asked for, and it
   is the reference floor the timestamp's σ is quoted against);
4. it finds the SFD and takes the first chip after it as the RMARKER;
5. it reads its counter there — true arrival plus the leading-edge error, 100 ps 1-σ on this
   link — rounded to whole 15.650 ps ticks (`UwbClock.counter`);
6. nothing later in the frame moves the stamp.

The worked example is the existing "What 197.628 µs is made of" table plus the RMARKER formula.

### Naming at the stand-in

`SFD` → 帧起始定界符（SFD）/ "the start-of-frame delimiter (SFD)"; `STS` → 加扰时间戳序列（STS）;
`PHR` → 物理头（PHR）/ "The physical header (PHR)"; `PSDU` → 消息本身（PSDU）/ "the message itself
— the PSDU —"; `chip` → introduced in the watch block ("Its ruler is the chip: one pulse period…"
/ 这条带子的刻度是码片（chip）). The chip gloss sits in the watch block rather than in "Locking on
before listening" because that paragraph already introduces SYNC and SFD and the density rule
allows two new terms to a paragraph.

### Terms added

None — six already, which is the cap.

### Pins added (`tests/course/uwb-frame.test.ts`, describe "how a stamp is taken off this frame")

- six steps on the main path;
- step 1: poll and response have identical segment keys and identical durations **except** the
  PSDU;
- step 2: `new UwbClock(0,0).counter(UWB_RMARKER_NS) − counter(0)` = `UWB_RMARKER_CHIPS × 128`
  = 4 681 728 ticks, i.e. the stamp is not at the frame's start; the tx `UWB_TS` shares the
  TX_START instant;
- step 3: `UWB_TS_ACCUM_GAIN_DB === 10·log10(SYNC_SYMBOLS)` and prints 18.1;
- steps 4–5: RMARKER offset 73 269, `tsNoisePs` 100, `RCTU_PS` 15.650, every counter an integer;
- step 6: the segments after the stamp are stsGap/sts/stsGap/phr/psdu, and both frames' RMARKER
  offsets are equal though their airtimes differ.
- `proseMax` in `lessonShapeSuite` raised 1000 → 1100, with the reason in a comment. It is a
  local window, well inside the contract's 900 + 550.

---

## uwb-sts — "A timestamp nobody can fake"

Budget line: `uwb-sts  picture 623/900 · numbers 371/550 · practice 386/450 · total 1380 (1380 words, 25 min)`
(before: 618 · 186 · 386 · 1190).

### The procedure (`numbers`, steps block "What the receiver does with the sequence", 6 steps)

The receive path of `src/uwb/device.ts`, in its order:

1. both ends generate the sequence from the shared key and the sender places it after the SFD
   between two 512-chip gaps (`uwbPpduLayout`: sync, sfd, **stsGap, sts, stsGap**, phr, psdu);
2. the relay makes every reception of the session land `advanceNs` = 50 ns early
   (`cfg.attacker`, `scenario.uwb.attacker`);
3. with the sequence on, the attacker branch fires **first**: `UWB_STS_REJECT` and `return` —
   no counter is taken at all;
4. so the answer's slot stays empty and the slot deadline reports the miss: two `UWB_TIMEOUT`,
   no `UWB_RANGE`;
5. with `stsOff`, `advanceNs` is subtracted from the measured instant (`extraNs = … − advanceNs`)
   and both receive counters come back 3195 ticks low;
6. Tround falls by 3195 and Treply rises by 3195, so the halved difference falls by exactly one
   advance: 14.99 m.

The attacker is tagged as a model choice where the reader meets its number: a new row in the
counter table, "The advance itself | — | 50 ns | scenario.uwb.attacker, a model choice" /
scenario.uwb.attacker，模型取值 (a table cell, which is where the contract allows provenance;
`sources` already said it twice). It had to be a bilingual cell, not a neutral one — the
"says everything in both languages" rule rejects an English phrase repeated as its own Chinese.

### Naming at the stand-in

`relay attack` → "Guess, and send the guess early: that is a relay attack" / 这就是中继攻击
（relay attack）; `STS` → the scrambled timestamp sequence (STS) / 加扰时间戳序列（STS）.

### Terms added

None — three already (`relay attack`, `key`, `STS`).

### Pins added (`tests/course/uwb-sts.test.ts`, describe "what the receiver does with the sequence")

- six steps on the main path;
- step 1: the PPDU key order, `STS_GAP_CHIPS === 512`, and the STS sits **after** the stamped
  segment boundary;
- step 2: both receive counters move by 50.0 ns and the **transmit** counters do not move at all
  (new — the relay touches receptions only);
- steps 3–4: one reject, zero rx stamps, two timeouts, no range, and the reject precedes both
  timeouts;
- steps 5–6: from the four counters of the honest 20 m run and of the relayed one,
  `Tround` falls by 3195, `Treply` rises by 3195, the difference moves by 2 × 3195, and
  `ssTwrRaw` differs by exactly 3195 = 14.99 m (new — the old tests pinned the two rx counters
  and the raw flights, not the sign of each half).
- `proseMax` in `lessonShapeSuite` raised 820 → 1050, with the reason in a comment.
- The "not two thirds as long again" pin (32 768 vs 32 512 chips) is untouched and still green.

---

## Anything the engine contradicted

Nothing. Two points worth recording:

- `uwb-intro`'s old line "Treply is 2 ms − Tprop and Tround 2 ms + Tprop" is right, and is now
  step 3 plus the surviving assertion. The 2 ms is FiRa's slot (2400 RSTU), not the standard's,
  and `sources` still says so.
- The simulator does **not** generate an STS: it is a switch (`stsOff`) plus a fixed-advance
  attacker. The steps say what the receiver checks and what the relay does; how the sequence is
  generated from an AES key stays in `sources`, where it always was, as standard text rather
  than as something this engine computes.

## Anything that did not fit

Nothing had to be dropped. `uwb-intro` finished at 999 of its 1000-word ceiling, so it did not
need a split — but it now has no headroom at all: the next claim added to that lesson forces the
split conversation.

---

# Fix round 1 — uwb-sts, the rejection was narrated as a correlation

**Finding (Important):** the picture ("the receiver takes its stamp only if the pulses it
expected really were there") and step 3 ("looks for the pulses it generated itself… finds noise
there") described a live correlation. `onRxOk` in `src/uwb/device.ts` does no such thing: it is
`if (atk !== undefined && atk.advanceNs > 0 && !this.cfg.stsOff) { emit UWB_STS_REJECT; return }`
— a gate on the scenario. No sequence is generated, nothing is compared, and with no attacker
configured no check runs at all. The correction existed only in `deeper`; the claim it corrected
was in the picture.

**Fix — the two voices separated on the main path, both languages:**

- picture, "A stretch of pulses only two people can write": the correlation is now plainly the
  real radio's — "A real receiver holds its own copy, compares it against what arrived, and keeps
  the stamp only if the two match" / 真实的接收端手里有自己的那一份……
- picture, NEW paragraph "What you are actually watching" / 你实际看到的是什么: "That comparison
  is what real hardware does, and what the standard asks for. This simulator does not do it: it
  holds no key, generates no pulses, and compares nothing. What it models is the outcome of the
  comparison — a reception is refused whenever the scene has a relay in it and the sequence is
  on, and accepted whenever the sequence is off. It is also why the relay's advance is a fixed
  50 ns here: nothing in this room has to detect it."
- picture, "The other outcome": "The reception is refused before any stamp is taken" replaces the
  sentence that claimed the expected pulses were looked for and found missing.
- step 1: the real radio generates the sequence; the simulator's frame carries the segment where
  it would sit (after the SFD, between two 512-chip gaps) "but no pulses are generated into it" —
  which is exactly what `uwbPpduLayout` gives it.
- step 3: "A real receiver would now compare what arrived against its own copy. This one reads
  the scene instead: a relay is configured and the sequence is on, so it writes one
  UWB_STS_REJECT and takes no reading at all."
- step 5: "With the sequence switched off that same gate accepts" (was "there is nothing to
  check", which still implied a check existed to skip).
- quiz 3's explanation: "the reception is refused outright" replaces "the receiver only knows the
  pulses it expected were absent".
- file header records the two voices and why, for the next editor.

**Pins re-aimed at what `onRxOk` really does** (`tests/course/uwb-sts.test.ts`):

- "the lesson says the check is a gate on the scene, because that is what onRxOk is": the new
  paragraph and step 3 say it in both languages, and no main-path string (why + outcomes +
  picture + numbers, via `paragraphTexts`) still carries the old correlation sentences — the
  regexes name them, so the fiction cannot come back unnoticed.
- "no attacker, no check: the honest scene is never verified against anything": both the 5 m base
  scene and the honest 20 m variant carry the sequence ON with no attacker, and both produce zero
  `UWB_STS_REJECT` and exactly one `UWB_RANGE` — the other half of the gate, and the reason the
  prose may not say "the check passed".

**Nothing else moved.** No number, scenario, variant, jump or fixture changed; every earlier pin
survives, including 32 768 vs 32 512 chips ("not two thirds as long again") and the 3195-tick
figures. Budget after: `uwb-sts  picture 700/900 · numbers 398/550 · practice 388/450 ·
total 1486 (1486 words, 25 min)` — paid out of headroom, as asked. `proseMax` in the lesson's
`lessonShapeSuite` raised 1050 → 1200, with the reason in a comment.

Gates: `MECHANISM_INCLUDE=uwb-intro,uwb-frame,uwb-sts npx vitest run
tests/course/readability.test.ts` → 942 passed, 0 failed; the three lesson suites → 81 passed;
`npx tsc -b --noEmit` clean; `npx vitest run tests/course` → 2299 passed, 2 failed, both in
`uwb-coexist` (another batch mid-edit). The ZH dump was read end to end as a beginner.
