# Wi-Fi track fix wave — report

Base: 749743d. Scope: `src/course/tier1/*.ts`, `src/course/tier2/*.ts`,
`tests/course/*.test.ts`. UWB untouched.

Gates: `npx vitest run tests/course` — 2448 passed, 0 failed;
`npx vitest run tests/course/readability.test.ts` — 998 passed;
`npx tsc -b --noEmit` clean. Both dumps read for every lesson changed.

Skipped as instructed: I6 (rule 2's vacuity), the blocklist gap of I7, and the
two earlier vacuous-rule bugs. **Note for the controller:** a9a253c's message
says `glossTextUpTo` now pools the lesson's own terms plus its `needs` closure,
but `tests/course/readability.test.ts:503-506` still slices `ordered` by
COURSE_ORDER, so rule 2 still pools every earlier lesson. Only
`decode-thresholds.ts` changed in that commit. I left the file alone (it is the
controller's) and worked to the pooled rule; every term move below is safe under
either rule, because in each case the owning lesson is also in the `needs`
closure of the lesson that uses the word.

---

## Important

### I1 · `edca`'s worked example lost a slot — fixed

`src/course/tier2/edca.ts`, table "The caller's first voice frame". The two
countdown rows now carry their instants and a new row carries the wait the
lesson's own step 5 states:

```
the end of the AIFS is a slot boundary            23.1156 ms · 2 → 1
one more idle slot, 9 µs                          23.1246 ms · 1 → 0
a counter already at zero waits one more boundary 9 µs
the voice frame goes out at                       23.1336 ms
```

The arithmetic now closes: 23.0816 + 34 µs = 23.1156, two decrements 9 µs apart,
one more boundary, 23.1336. No pinned number changed; the timestamps added to
the two existing cells are the run's own `BACKOFF_DEC` records.

Pinned in `tests/course/edca.test.ts` — the closure, not the endpoints:
`expect(tx.t - decs[1].t).toBe(OFDM_5G.slotNs)` and
`expect((decs[1].t + OFDM_5G.slotNs) / MS).toBe(23.1336)`.

Also M5, in the same procedure: step 4 now ends "one boundary earlier than the
plain countdown of the backoff lesson, which counts the same slots", and step 5
"A counter already at zero transmits on the next boundary, 9 µs later." A reader
carrying `backoff`'s rule into `edca` no longer lands a slot early.

Paid for inside `numbers` (543 → 548 of 550): the AIFSN formula note lost its
epigram, the two closing paragraphs were tightened, and three steps lost a word
each. Nothing that carries a mechanism was cut.

### I2 · The FCS check three lessons narrated — fixed in both languages

The engine decides a reception at `src/engine/channel.ts:698-705` — worst SINR
against `decodeThreshDb` — and computes no CRC anywhere.

- `frame-anatomy`, picture "A check at the end": the CRC stays, marked as the
  standard's mechanism, and the paragraph says on the main path what this
  simulator does instead ("This simulator never computes them: what decides a
  reception here is the ratio the frame arrived at, for the whole frame, against
  what its rung required"). Quiz 2 no longer asks about an event the simulator
  cannot produce — it asks about a frame too weak against the interference
  around it. The third outcome changed with it ("what happens when one does not
  come through", not "when they disagree").
- `ifs`: the EIFS term, the picture paragraph, the numbers row, step 2, the
  ladder item and quiz 2 now all say "started a reception and could not decode
  it" / 开始接收、却没能解出来.
- `nav`: "passed its check" is gone from the picture, the worked paragraph, step
  3 and the quiz explanation; the frame "is decoded whole — its ratio good
  enough, end to end, for the rung it was sent at" / 整帧都被解了出来.

Pins added:
- `tests/course/frame-anatomy.test.ts`, new suite "the FCS is a field, not a
  test this engine runs": no file in `src/engine` mentions `crc` once comments
  are stripped (`ampBs.ts` excepted, with the reason in a comment), `FCS_BYTES`
  is 4, and every `RX_FAIL` of the lesson's run carries one of the four
  ratio-derived reasons.
- `tests/course/nav.test.ts`: at 746 µs the record behind the NAV is `RX_OK`
  from sta-2, and there is no `RX_FAIL` at that instant.
- `tests/course/edca.test.ts`: every EIFS the uploader owes has a `RX_FAIL`
  behind it whose reason is one channel.ts can produce.

Left alone: `edca`'s 坏帧 / "a frame arrive broken" wording in `deeper` and
`sources`. "Broken" describes an undecodable reception in plain words; it does
not claim a checksum was computed, and the review flagged only the
compute-and-compare sentences.

### I3 · `mumimo`'s sounding exchange — said where the reader meets it

The sounding paragraph of the picture now ends: "This simulator runs none, and
charges nothing for it: the aim is assumed perfect." / 而本仿真器一次探测也不发，
也不为它收空口时间：它直接假定瞄得够准。 `sources` keeps the longer statement.

Paid for in the same paragraph (the opening "Aiming is not pointing a dish."
went) and in "Which one wins". I first wrote this as its own picture block; the
lesson shape suite requires the first `watch` inside the first three picture
blocks and holds `mumimo` to a 1050-word prose window, so it had to be a
sentence in the paragraph that raises sounding rather than a paragraph of its
own. Final: picture 530/900, prose 1047/1050.

### I4 · The control-response rate — one rule, three pointers

`airtime` step 5 now states the engine's rule (`phy.ts:137-144`): "its rate is
not a fixed one: it is the highest mandatory rate that does not exceed the data
frame's own reference rate — 24 Mb/s on this link." The mandatory set 6/12/24
sits in the table cell beside it (the numbers-prose rule caps a paragraph at
four quantities, so the list of three rates could not stay in the step). The
false reason — "so that every radio in the room can read it" — is gone.

- `nav` numbers: "14 bytes at the control-response rate of airtime's step 5,
  24 Mb/s here", replacing "at the safe rate".
- `bianchi`: "the ACK — 44 µs here, at 6 Mb/s by airtime's rule, not 28".
- `tier1-project`: "Airtime's step 5 again: an ACK goes out at the highest
  mandatory rate at or below the data frame's own…" — the same rule, now cited
  rather than re-derived.

Pinned in `tests/course/airtime.test.ts`: `MANDATORY_MBPS` is [6, 12, 24];
`ctrlRespRateFor` at 54/24/18/6 gives 24/24/12/6; and every data frame of the
scene reads back as 24 through `ctrlRespRateForMode`.

`frame-anatomy`'s `sources` line ("28 µs its answer takes at 24 Mb/s in this
scenario") is unchanged: it is lesson 4, two before `airtime`, so it cannot
point forward, and it is already hedged as a value of this scenario.

### I5 · One name for the preamble

`preamble` / 前导 everywhere, and the term moved to the lesson that counts its
microseconds:

- `frame-anatomy-bytes` now owns `preamble` (terms: L-STF, L-LTF, L-SIG,
  preamble, U-SIG) and names it in place — "Those three fields are the
  preamble." / 这三段合起来，就是前导。 Every 前脸 in the file (13 of them) and
  every EN "front" that meant the preamble became 前导 / preamble.
- `airtime` gives the term up (M2: a word cannot be new twice) and keeps using
  the word; frame-anatomy-bytes is already in its `needs`. Its 开场 uses became
  前导 where they meant the preamble.
- `width`, `streams`, `ofdma-dl`, `mumimo`: "opening" / 开场 → preamble / 前导
  (19 sites). `ampdu` already said preamble; its 开场 row label became 开场交互,
  which is the opening exchange, not the preamble.
- `frame-anatomy` keeps plain words ("a known pattern in front"), since the term
  is owned two lessons later; its heading 前脸 became a plain-words phrase.

Remaining 开场 in the track all mean "to open" or "the opening exchange"
(`bianchi`, `txop`, `txop-protect`, `ampdu`), and 固定开销 remains where it means
a turn's whole fixed cost, not the preamble.

Tests updated: `airtime.test.ts` and `frame-anatomy-bytes.test.ts` term lists.

---

## Minor

- **M1 · the ZH arm of rule 3 grades nothing but acronyms.** NOT FIXED, and
  deliberately out of scope: the fix is in `src/course/readability.ts`
  (`namedInPlace`), which is shared with the UWB lessons being rewritten in this
  worktree at the same time and is the controller's file. Widening it would turn
  red on lessons I am not allowed to touch. Recommend it as a controller task
  with its own wave: every migrated lesson's ZH picture would have to name each
  non-acronym term in place for the first time.
- **M2 · terms owned twice.** `capture` and `residual` dropped from
  `tier1-project-review` (bianchi-vs-sim owns them, two lessons earlier, and is
  in the closure through `tier1-project`); `margin` and `saturated` dropped from
  `tier1-project` (`rate margin` in decode-thresholds, `saturation` in bianchi,
  both in its `needs` closure). Tests updated with the reason.
  `Duration` stays a term of `nav`: `frame-anatomy` teaches the field but is at
  the six-term cap and does not own the word, so nav's entry is the only one —
  split, not duplicated.
- **M3 · three names for the rate loop.** Settled on `rate control`, which is
  the engine's concept and the title of `rate`. `anomaly` renames its term
  `rate adaptation` → `rate control` and uses it in prose and observe;
  `bianchi-vs-sim` drops its duplicate term and points back ("the rate control
  of the anomaly lesson"); `tier1-project-review`'s four prose uses follow.
  `anomaly` joined `bianchi-vs-sim`'s `needs` — the prerequisite test requires
  it, and `rate` inherits the word through that edge. `ARF` stays a term of
  `rate-fallback`: it is a named algorithm, not a third name for the loop.
- **M4 · `mlo`'s aggregation ceiling.** Step 4 now reads "with aggregation on,
  consecutive frames for one receiver up to the ampdu ceilings — 64 frames,
  5.484 ms of data, or the end of the turn, whichever comes first. Here 20; one
  without." — the three conjuncts of `mac.ts:633-635`, and the number its own
  worked example shows. Paid for inside `numbers` (548 → 550).
- **M5 · the two decrement rules.** Done in `edca` steps 4 and 5; see I1.
- **M6 · `backoff` fuses the two retry counters.** Step 6 now says the sentence
  is true because two counters move together here — the frame's own attempts and
  the queue's run of failures — and that a later lesson shows the run where they
  come apart. `numbers` 458 → 491.
- **M7 · Chinese content the English lacks.** `decode-thresholds`' second
  experiment: the EN gained the ZH's closing clause ("3 dB, and the airtime
  nearly doubles"). `mlo`'s column head: the EN gained "answers included". `mlo`'s
  "When everybody has two doors": the ZH aside about the neighbour is gone, since
  `mlo`'s numbers had no room for an EN equivalent. `edca`'s closing paragraph
  was trimmed in both languages together.
- **M8 · words used before the lesson that names them.** `decode-thresholds`
  now names airtime where it first spends it ("you waste airtime — the
  microseconds a frame holds the channel"); `roles-stack`'s observe says "one
  burst: 50 payloads behind one preamble", which is also the unified name of I5.
- **M9 · the AP/STA bracket as ritual.** NOT FIXED. The rule is in the
  controller's `readability.test.ts` (`STAND_INS`) and exempting a lesson by its
  `needs` closure would change the grade of every migrated lesson, UWB included.
  The `mlo` sentence the review names is still the first 站点 of that picture, so
  no lesson-side rewrite removes the bracket without breaking the rule.
- **M10 · `numbers` written to the ceiling.** Worse, not better, and the review
  predicted it: this wave's additions had to be paid inside the same section, so
  `edca` is now 548/550, `mlo` 550/550, `tier1-project` 545/550, `bianchi` and
  `bianchi-vs-sim` and `tier1-project-review` 549/550. Nothing was compressed out
  of a mechanism — the words came from epigrams, repeated glosses and adjectives
  — but the next content wave on any of these five has nowhere to put a
  sentence. They should be split, or the ceiling revisited, before more is added.
- **M11 · `ofdma-ul`'s round row.** Now "each uploader on half the channel:
  16,894 bytes of frames — eleven of them — plus 531 bytes of padding, 17,425 in
  all", so 16,894 ÷ 11 is no longer an invitation.

---

## Judged better left alone

1. `readability.ts` / `readability.test.ts` (M1, M9, and I6's remainder) — the
   controller's files, shared with a concurrent UWB wave.
2. `edca`'s "broken" / 坏帧 in `deeper` and `sources` (see I2).
3. `Duration` as a term of `nav` (see M2).
4. `ARF` as a term of `rate-fallback` (see M3).
5. `frame-anatomy`'s `sources` note on the 24 Mb/s ACK (see I4).
6. Renaming the lesson `rate` ("Rate control — picking how fast to talk"): the
   title is now the single owned name rather than a third one, so it needed no
   change.
