# B3 review — hidden, anomaly, retries-queues

Reviewed against commit 880f9c7, batch-brief.md, the amendment section of
2026-09-21-course-readability-design.md, and B3-report.md. Read-only; no files
edited.

## 1. Procedure vs engine

**hidden** (`src/course/tier1/hidden.ts` `numbers` steps block, six steps):
checked against `src/engine/mac.ts` `sendData` (PSDU/threshold comparison
~line 670, RTS duration ~675), `updateNav` (~1568–1595), and
`src/engine/phy.ts` constants (`MAC_HDR_BYTES` 24, `FCS_BYTES` 4, `RTS_BYTES`
20, `CTS_BYTES` 14, `CCA_PD_DBM` −82). Step order and constants match the
code. The worked-example table (718 µs exchange) reproduces exactly against a
live run (see §2 methodology; all values pinned and independently
re-verified).

**anomaly** (six steps): checked against `Mac.beginIfsAc` (~426–441,
`corruptLast ? EIFS − DIFS + aifs : aifs`), the CW draw, and
`DCF_PARAMS`/`SLOT_NS`/`SIFS_NS`/`DIFS_NS`. Order and constants match.

**retries-queues** (six steps): checked against `AcQueues.enqueue` /
`purgeExpired` (`src/engine/queues.ts` 26–47), and `Mac.onOwnTxEnd` /
`onRespTimeout` / `failAttempt` / `bumpQsrc` / `failMsdus`
(`src/engine/mac.ts` ~1036–1130). Step 4's ordering ("attempt count up, queue
failure count up, CW widens") matches `failMsdus` then `bumpQsrc`'s call
order in the code path, and `bumpQsrc`'s `Math.min(2*cw+1, cwMax)` /
reset-to-`cwMin`-at-`SHORT_RETRY_LIMIT` matches step 6 verbatim, constants and
all.

No mechanism-vs-code disagreement found in any of the three lessons. This is
the highest-severity check in the brief and it is clean.

## 2. The two corrections, checked against a live run (not against the lesson text)

Wrote and ran throwaway scripts against the engine directly (not against the
test suite, to avoid circularity), then deleted them.

- **anomaly / EIFS vs DIFS.** Ran `anomaly.scenario()` for 200 ms. Of 833
  `IFS_START` records at the two stations, exactly 166 are `EIFS`, and
  `eifs.every(r => r.node === 'sta-2')` is true. Matches the lesson's step 1
  and the batch's claim exactly.
- **retries-queues / purgeExpired discards already-attempted frames.** Ran
  `retriesQueues.scenario()` for 3 s. AP lifetime drops: 194 total, 6 had a
  `TX_START` record (had flown), 188 had not — matches "188 of the 194...had
  never had a turn" in the lesson and the batch's "6 of the AP's 194." Station
  lifetime drops: 11 total, 9 had flown — matches the batch's "9 of the
  stations' 11" exactly. (The lesson prose only states the AP figure; the
  station figure is the batch report's claim, not printed in the lesson body,
  and it too checks out against the engine.)

Both corrections are correct, precisely quantified, and consistent with the
code that produces them (`age = nowNs - (enqueuedNs ?? bornNs)`, never reset
on retry/restore, so `purgeExpired` cannot distinguish an aged frame that has
been attempted from one that has not).

## 3. Beginner read, both languages

Read full `en` and `zh` dumps (`scripts/lesson-dump.ts <id> en|zh`) for all
three lessons end to end, as a reader who has done Tier 1 through `nav` and
`backoff`/`airtime`. No sentence stopped me; each new term is introduced
before or at its first load-bearing use (RTS/CTS before the exchange, retry
limit before the seven-attempt table, airtime share before the two-column
table). The naming-at-the-stand-in rewrites read naturally in both languages
— "两台站点（STA）……接入点（AP）" and "A station (STA) ... the access point
(AP)" both sit in ordinary sentence position, not bolted on.

Chinese reads as Chinese: no inverted relative clauses, no "把...的...给..."
pileups, quotes are full-width “ ”. No sentence points at an unnamed
quantity — every number the procedures use is either given inline (34 µs,
45 µs, 500 ms, 1528 B, seven) or in the table beside it. No trace of the
banned pointer phrases (这笔账/留在手里/不含余量/之类/kept in hand/head
arithmetic/bare requirement) in any of the six dumps.

Minor style note, not a rule violation: hidden's picture ends two consecutive
paragraphs with a short appositive naming clause ("...that is the RTS
threshold." / "...that is the CTS.") in quick succession; it reads fine but a
reader moving fast could momentarily expect a definition-list rhythm rather
than prose. Not worth a finding — it satisfies rule 4 and does not repeat
elsewhere in the batch.

## 4. Pins

`git show 880f9c7 -- tests/course/hidden.test.ts tests/course/anomaly.test.ts tests/course/retries-queues.test.ts`
reviewed. All three test files are net-additive over the prior versions (per
each file's own header comment: "the originals stay where they are, so no pin
is lost" / "survived the rewrite sentence for sentence"). Cross-checked
several pre-existing high-value pins by name against the diff and found them
intact: hidden's 106→66 backoff count-through, the 2325–2353 µs ACK freeze at
64, the 126/32/45/329 off-vs-on table, the door experiment; anomaly's
510-frames-alone and 234-far-alone figures, the capture-effect decibel table;
retries-queues' 27 689 µs retry-limit drop, the 504 465 µs three-at-once
lifetime drop, the 987-frame short-lifetime cost. None were weakened or
removed.

New steps and worked examples are pinned against engine constants/records or
the run, never asserted from the prose alone — e.g. hidden's step 3 pin
proves `RX_START` never fires between the hidden stations across the *whole*
run, not just for the worked exchange; anomaly's step 1 pin checks every
`IFS_START` record, not one; retries-queues' step 2 pin recomputes 188 from
`TX_START` membership rather than repeating the lesson's number.

## 5. Rules (graders)

```
MECHANISM_INCLUDE=hidden,anomaly,retries-queues npx vitest run \
  tests/course/readability.test.ts tests/course/hidden.test.ts \
  tests/course/anomaly.test.ts tests/course/retries-queues.test.ts
```
4 files, 930 tests, all green (readability.test.ts 850 tests, hidden 26,
anomaly 18, retries-queues 36).

## Findings

None. No Important findings, no Minor findings (the style note in §3 is
explicitly not raised as one).

## Verdict

PASS. 0 important, 0 minor. Worst finding: none — the batch's steps track the
engine's own order and constants in all three lessons, and both of its
claimed corrections (EIFS at 166/833, purgeExpired at 188/194 and 9/11) check
out exactly against a live run of the engine, not just against the batch's
own prose.
