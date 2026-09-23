# B3 — hidden, anomaly, retries-queues

Batch B3 of the "mechanism before metaphor" rollout. Base commit de14765, branch feat/uwb-ranging,
worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.

Grader: `MECHANISM_INCLUDE=hidden,anomaly,retries-queues npx vitest run tests/course/readability.test.ts` — green.
`npx tsc -b --noEmit` — clean. `npx vitest run tests/course` — 58 files, 2091 tests, all passing.

---

## hidden — Hidden nodes & RTS/CTS

**Budget line:** `hidden  picture 645/900 · numbers 536/550 · practice 332/450 · total 1513 (1513 words, 25 min)`
(was 618 / 233 / 332 / 1183.)  `proseMax` in `lessonShapeSuite` 860 → 1190.

**Naming at the stand-in.** `why` now reads "two stations (STA) … the access point (AP)" / 两台站点（STA）……接入点（AP）.

**The procedure** (`numbers`, `{kind:'steps'}`, six steps) — the engine's order, from `Mac.sendData`
(`src/engine/mac.ts` ~640–690) and `Mac.updateNav` (~1568–1606), with `src/engine/phy.ts` constants:

1. PSDU = payload + `MAC_HDR_BYTES` 24 + `FCS_BYTES` 4 = 1528 B, compared with `cfg.rtsThresholdBytes`
   (`psdu > this.cfg.rtsThresholdBytes`), 500 B in the protected variant.
2. RTS = `RTS_BYTES` 20, `dst` the AP, `durationFieldNs = 3·SIFS + ctsTime + dataTime + respTime`,
   counted from the end of the RTS.
3. Coverage set of the question: the far station receives it at −83.4 dBm, under `CCA_PD_DBM` −82,
   so no `RX_START` ever fires there (proved over the whole run).
4. CTS = `CTS_BYTES` 14, one `SIFS_NS` later, `durationFieldNs = rts.durationFieldNs − SIFS − ctsTime`;
   it leaves the AP, which both end rooms hear at −60.6 dBm.
5. `updateNav`: `until = t + frame.durationFieldNs`, taken only when later than the NAV already held;
   every contending EDCAF freezes its backoff.
6. The exchange ends on the microsecond the NAV expires; the far station waits `DIFS_NS` 34 µs and
   resumes at the value it froze at.

**Worked example** (second table): the exchange that starts at 718 µs in the protected variant —
1528 B → RTS 718 µs / 468 µs reserved → −83.4 dBm at Hidden B → CTS 762 µs / 468 − 16 − 28 = 424 µs →
−60.6 dBm → freeze at 13, NAV to 790 + 424 = 1214 µs → ACK ends 1214 µs → resume at 1248 µs with 13.

**Terms added:** none (four already: hidden node, RTS, CTS, RTS threshold; 门限 is glossed by
"RTS threshold", so the quantity rule is satisfied).

**Pins added** (`tests/course/hidden.test.ts`, new describe "the procedure, step by step", 6 its):
step 1 — `MAC_HDR_BYTES + 1500 + FCS_BYTES === 1528`, every data frame above the variant's threshold,
no RTS at all in the base scene; step 2 — every RTS is 20 B to the AP, and for the worked exchange
`3·SIFS + cts + data + ack === rts.durationFieldNs`; step 3 — link table −83.4 dBm and, proved across
the run, no `RX_START` in either room from the other; step 4 — for every one of 300+ CTS frames,
`duration === rtsDuration − SIFS − ctsTime`, plus the −60.6 dBm both-rooms reception; step 5 — for
every one of 200+ `NAV_SET` records at the far station, `untilNs − t === ctsDuration`; step 6 — the
ACK end, the `NAV_CLEAR`, the `DIFS_NS` gap and the resume value.


---

## anomaly — Rate anomaly

**Budget line:** `anomaly  picture 612/900 · numbers 473/550 · practice 306/450 · total 1391 (1391 words, 25 min)`
(was 598 / 127 / 306 / 1031.)

**Naming at the stand-in.** `why` now reads "Every station (STA) … the access point (AP)".

**The procedure** (six steps) — `Mac.beginIfsAc` / `onIfsEndAc` / `onSlotTick` (`src/engine/mac.ts`
~426–500) with `DCF_PARAMS` and the clause-17 timing:

1. DIFS = `SIFS_NS` 16 + 2·`SLOT_NS` 9 = 34 µs; after a reception it could not decode, EIFS instead.
2. `e.backoff = this.rng.int(e.cw)` with `cw` starting at `CW_MIN` 15, one decrement per idle slot —
   the same window for both stations, hence comparable turns.
3. Whoever reaches zero sends one 1528-byte frame at its own link's rate.
4. The turn's length is that frame at that rate: 248 µs near, 795 µs mean far.
5. A 14-byte ACK (`ACK_BYTES`), then the procedure restarts — one clock for everyone.
6. Throughput = acknowledged turns per second × 1528 B × 8 bits.

**Worked example:** 209 / 154 turns → 248 / 795 µs per turn → 51.8 ms 25.9 % / 122.4 ms 61.2 % →
209 / 135 acknowledged → 1045 / 675 per second → 12.8 / 8.3 Mb/s. A short paragraph after it explains
why the acknowledged row is smaller than the turns row for the far station (19 turns lost outright).

**Terms added:** none.

**Pins added** (`tests/course/anomaly.test.ts`, new describe, 4 its): `DIFS_NS === SIFS_NS + 2·SLOT_NS
=== 34 000` and every IFS the two stations wait is DIFS or EIFS; the draw window bottoms out at
`CW_MIN` for both stations and `value ≤ cw` always; the whole worked table as one object comparison
per station, plus the step-6 arithmetic recomputed from `acked`; the 14-byte ACK and the 1528-byte
frames. `proseMax` raised 800 → 1090.

**Where the engine corrected the lesson.** The first draft of step 1 said the wait before a draw is
always a DIFS. The engine (`beginIfsAc`: `this.corruptLast ? EIFS − DIFS + aifs : aifs`) waits EIFS
after a reception it could not decode, and in this scene 166 of 833 waits are EIFS — every one of them
at the far station, the only one whose receptions are ever wrecked. The step now says so and the test
pins it.

---

## retries-queues — Retries, drops and queues

**Budget line:** `retries-queues  picture 681/900 · numbers 543/550 · practice 322/450 · total 1546 (1546 words, 25 min)`
(was 638 / 296 / 322 / 1256.)

**Naming at the stand-in.** The first picture paragraph now reads "A station (STA) … from the access
point (AP)" / 站点（STA）……来自接入点（AP）.

**The procedure** (six steps, opening `numbers`, with the existing seven-attempt table as its worked
example) — `AcQueues.enqueue` / `purgeExpired` (`src/engine/queues.ts`), `Mac.onOwnTxEnd`,
`onRespTimeout`, `bumpQsrc`, `failMsdus` (`src/engine/mac.ts` ~1046–1135):

1. `enqueue` refuses when `q[ac].length >= limit` — `DEFAULT_QUEUE_LIMIT` 500, DROP_NEWEST, no ENQUEUE record.
2. `purgeExpired` runs before every transmission and discards anything older than
   `DEFAULT_MSDU_LIFETIME_NS` 500 ms.
3. `ackTimeoutNs = SIFS_NS + SLOT_NS + RX_START_DELAY_NS = 16 + 9 + 20 = 45 µs` after the frame ends.
4. On timeout: `m.retries++`, `e.qsrc++`, `e.cw = min(2·cw + 1, CW_MAX 1023)`.
5. The MSDU keeps its sequence number (`assignSeq`) and goes back to the queue head with the Retry bit.
6. `m.retries >= SHORT_RETRY_LIMIT` 7 → `DROP retryLimit`; `qsrc >= 7` → `cw = CW_MIN` 15.

**Terms added:** none (retry, retry limit, queue, lifetime were already there).

**Pins added** (`tests/course/retries-queues.test.ts`, new describe, 5 its): no ENQUEUE ever exceeds
500 and the AP's maximum is exactly 500, no refused frame has an ENQUEUE record anywhere, the first
refusal follows an ENQUEUE at depth 500; every lifetime drop waited over 500 ms and 188 of the 194 at
the AP never flew; `ACK_TIMEOUT_NS === SIFS + SLOT + RX_START_DELAY === 45 µs` and, proved over the
whole run, every one of 500+ `ACK_TIMEOUT` records lands exactly 45 µs after that node's own last
transmission ends; every RETRY record raises that MSDU's count by exactly one and every `CW_CHANGE`
equals `min(2·cw + 1, CWmax)` or the reset (300+ checked); no MSDU is ever transmitted more than seven
times and every `retryLimit` drop had exactly seven. `proseMax` raised 950 → 1230.

**Where the engine corrected the lesson.** The picture said the MAC throws an aged frame away "without
ever sending it". `purgeExpired` discards *any* queued MSDU older than the lifetime, including ones
that already had attempts: at the AP, 6 of the 194 had flown, and at the stations 9 of 11 had. The
picture now says "throws it away rather than give it another turn", and step 2 states the real split
(188 of 194 never had a turn), pinned.

---

## Concerns / notes

- Nothing had to be split; all three fit the 1800-word ceiling with room to spare.
- `namedInPlace` in `src/course/readability.ts` (line ~424) builds its regex with `` `\b${...}\b` ``
  inside a template literal, so `\b` is a backspace character, not a word boundary; the check therefore
  never matches and always returns true. Only `namedAtStandIn` (which escapes as `\\b`) actually bites.
  Not mine to fix — flagging it for the controller. I wrote the lessons to the rule regardless.
- `lessonShapeSuite`'s `proseMax` is a per-lesson constant in each lesson's own test; I raised all
  three to just above the new figure, the way `decode-thresholds` (1200) and `roles-stack` (1000) do.
- Other implementers' lessons were red in the shared grader run at various points while I worked
  (`radio-primer`, `nav`, and `edca` at the end: numbers budget 663/550 and two unglossed acronyms,
  `AIFSN` and `CWmin`). All are outside my file set.
