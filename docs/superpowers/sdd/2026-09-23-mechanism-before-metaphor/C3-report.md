# C3 — ofdma-dl, ofdma-ul, mumimo

Base 0d65220, branch feat/uwb-ranging, worktree `.claude/worktrees/feat-link-2g`.

Grading: `MECHANISM_INCLUDE=ofdma-dl,ofdma-ul,mumimo npx vitest run tests/course/readability.test.ts` — green.
`npx tsc -b --noEmit` — clean. `npx vitest run tests/course` — only `mlo` and `rate` fail, both other
implementers' files (plus a stray `tests/course/tmpc2.test.ts` somebody else left in the tree).

---

## ofdma-dl

Budget line: `picture 554/900 · numbers 507/550 · practice 351/450 · total 1412 (1412 words, 25 min)`
(was 541 / 218 / 351 / 1110).

### Procedure written (`numbers`, six steps, closing the lesson)

Read out of `WifiMac.transmitFor` → `transmitDlMu` → `buildMuParts` (`src/engine/mac.ts:594`, `812`,
`869`) and `txTimeModeNs` (`src/engine/phy.ts:235`):

1. the AP lists `queues.dsts(ei, reach)` filtered by `cfg.ofdmaWith`; fewer than two → single-user send;
2. `muDsts.slice(0, 4)`, tones cut into `frac = 1 / dsts.length`;
3. bits per symbol = `ndbps[mcs] × toneRatio(mode, width) × nss × ruFraction` — 1950 × 0.5 = 975 here;
4. `queues.claim` fills each member under the duration cap, symbols = `⌈(16 + 8·bytes + 6) ÷ bits⌉`;
   a member whose head frame alone exceeds the cap is dropped (`continue` in `buildMuParts`);
5. `ppduDur = max` over members; length = 44 µs preamble + 4 µs `muExtraPreambleNs` + 13.6 µs × symbols;
6. SIFS (16 µs) later one 32 µs BlockAck per member, simultaneously; `resolveDlMu` counts the exchange a
   success if **any** member acknowledged and re-queues the rest.

Worked-example table: the first MU PPDU of the run — 2 devices, 0.5 share, 1950 × 0.5 = 975,
1434 B, ⌈11494 ÷ 975⌉ = 12, 44 + 4 + 13.6 × 12 = 211.2 µs, 2 × 32 µs.

### Naming (rule 4)

`why` now carries 接入点（AP） / "the access point (AP)". `RU` is introduced as
"an equally sized resource unit (RU)" / 「同样大的资源单元（RU）」; `MU` as "What goes out **is called** an
MU PPDU".

### Terms added: none (four already, all used).

### Pins added (`tests/course/ofdma-dl.test.ts`, new describe "the procedure, run against every
multi-user send there is", 3 tests)

Proved rather than asserted, over every MU PPDU of the run: group size in [2, 4]; every part's
`ruFraction === 1 / n`; the length re-derived from `ndbps × toneRatio × nss × ruFraction` and the
symbol formula; every member answers exactly one SIFS later with a 32 µs BlockAck. Plus the worked
row's own arithmetic. `proseMax` 760 → 1080.

### Notes

No throughput claim introduced — the "same frames, 1.44 ms of air over 300 ms" framing is untouched.

---

## ofdma-ul

Budget line: `picture 588/900 · numbers 536/550 · practice 338/450 · total 1462 (1462 words, 25 min)`
(was 561 / 257 / 338 / 1156).

### Procedure written (`numbers`, seven steps)

From `notifyUlBacklog` (`mac.ts:377`), the trigger branch of `transmitFor` (`mac.ts:599`),
`transmitTrigger` (`mac.ts:939`), the `'trigger'` case of the receive path (`mac.ts:1382`) and
`respondToTrigger` (`mac.ts:1466`):

1. a station reports its uplink backlog, the AP sets `wantTrigger` and starts contending;
2. on winning with `depthFor(ei) === 0`, it takes `cfg.ulBacklog()` filtered by `ofdmaWith`;
   fewer than two → no trigger;
3. `users.slice(0, 4)`, `frac = 1/n`, one format for the round (`ulMode`, `ulWidthMhz` = the narrowest
   width any invited user negotiated; MCS capped at 11 in HE);
4. per user `maxPsduBytesFor(mode, mcs, frac, 2 ms − signalExt, width, nss)`, the longest becomes
   `ulDur` and **every** user is given it;
5. the trigger goes out at 24 Mb/s, `triggerBytes(n) = 28 + 6n`, with `durationFieldNs =
   SIFS + ulDur + SIFS + mbaTime`;
6. SIFS later each named station answers unless a NAV set by somebody other than the AP is running
   (CS Required), filling to its byte budget and padding to `ulDur`;
7. SIFS after the answers end, `multiStaBaBytes(n) = 32 + 8(n−1)`; `ACK_TIMEOUT_NS` = 45 µs after the
   trigger ends with no answer started → the round failed.

Worked-example table: 2 devices, 0.5, 17,425 B, 143 symbols, 44 + 13.6 × 143 = 1988.8 µs,
28 + 6 × 2 = 40 B / 36 µs, 32 + 8 = 40 B / 36 µs, whole round 2092.8 µs.

### Naming (rule 4)

`why` now names all three at their stand-ins: "the uplink, **the direction from the devices back
towards the box they all talk to**", "the access point (AP)", "the frame it conducts with **is called**
a trigger frame". ZH 叫 → 叫作 for `TB PPDU`.

### Terms added: none.

### Pins added (`tests/course/ofdma-ul.test.ts`, new describe "the procedure, against the engine that
runs it", 3 tests)

Users per round in [2, 4]; one `ulMode`/`ulWidthMhz`/MCS for the whole round; `maxPsduBytesFor` =
17,425 B → 143 symbols → 1988.8 µs, and that one length on every user of every round; the TB PPDU
opening is 44 µs (no per-user map, unlike a DL MU PPDU); `triggerBytes(2)`, `multiStaBaBytes(2)`,
`ACK_TIMEOUT_NS === 45 µs`; the Duration field as an exact equality (it was a lower bound before).
`proseMax` 830 → 1140.

### What the engine contradicted

**The trigger frame's power correction is not modelled.** The picture's "How loudly: each device is
told to correct its power" is standard-accurate (§9.3.1.22 Target RSSI, cited in `sources`) but nothing
in `transmitTrigger` carries or applies it — the answers go out at each station's usual power. The
`numbers` procedure therefore lists only what the engine dictates (slice, length, rung, width, instant),
and `deeper` now says plainly: "This simulator dictates the slice, the length, the rung and the width
but not that correction … so the round you watch is the easy case."

Also: "a device still checks the air before it answers" is a **NAV** check, not a CCA one
(`mac.ts:1386`); step 6 now says NAV.

### What did not fit

`numbers` hit 618/550 with the procedure added. Rather than compress the mechanism, I deleted the
paragraph "Padded to the length the trigger frame named" — every claim in it (one length for all, the
padding, why they must end together) is now in steps 4 and 6 and in the second quiz explanation, so
nothing was lost. Final 536/550; no split needed.

---

## mumimo

Budget line: `picture 527/900 · numbers 517/550 · practice 362/450 · total 1406 (1406 words, 25 min)`
(was 524 / 176 / 362 / 1062).

### Procedure written (`numbers`, six steps)

From `transmitDlMu` (`mac.ts:812`), `fitsStreams` (`mac.ts:808`) and `buildMuParts`:

1. candidates = queued peers with `ofdmaWith`; < 2 → single-user; else `slice(0, 4)`;
2. `canMumimo` = every candidate `mumimoWith` **and** `queues.headBytes(ei, d) >= MUMIMO_MIN_BYTES`
   (1000);
3. trim from the end one member at a time while `!fitsStreams` (sum of `nssForPeer` vs `ownNss` = 4):
   2 + 2 = 4 fits, 2 + 2 + 2 = 6 does not;
4. `< 2` survivors → fall back to slices; else `frac = 1`, each member at its own `nss`;
5. length = 48 + 4 µs + 13.6 µs × symbols of the longest member; every member keeps its own two streams
   either way, so 4,306 B is three symbols on a third of the tones and one on all of them;
6. the parts end together, one SIFS later a single round of acknowledgement settles the group — **162 of
   the 169 group sends of the slicing variant**, the other seven being the ones the laptop talked over.

Worked-example table: the two variants side by side through the steps — 3 queued, MU-MIMO+1000 B no/yes,
6 > 4, 3 / 2 members, a third / all of the channel, 4,306 B, 3 / 1 symbols, 92.8 / 65.6 µs.

The three-item `steps` block that sat in `deeper` ("The rule this simulator picks by") is **removed** —
the `numbers` procedure is a strict superset of it, and rule 3 forbids the procedure living in `deeper`.

### Naming (rule 4)

`why` now ends "…asks for antennas instead; **it is called** MU-MIMO" / 「这个办法就叫作 MU-MIMO」.
`beamforming` and `sounding` were already named at their stand-ins (em-dash and 就是/which is).

### Terms added: none.

### Pins added (`tests/course/mumimo.test.ts`, new describe "the procedure, run against every
multi-user send of both variants", 3 tests)

Over both variants and every group send: size in [2, 4]; MU-MIMO sends carry ≥ 1,000 B per member,
their streams sum to ≤ 4 and carry no `ruFraction`; slicing sends carry `ruFraction === 1/n`; the send
length re-derived from the symbol formula. Plus the worked example's own two columns. `proseMax`
700 → 1050. The 162/169 figure was already pinned and is untouched.

### Note on the engine

A **slicing** member keeps its own stream count too — `buildMuParts` passes `nss` in both branches but
records only `ruFraction` on the part. My first derivation test (assuming `nss = 1` for slicing members)
failed at 92.8 vs 133.6 µs, which is how it surfaced. Step 5 and the test now say so explicitly; the old
formula note ("On its third of the sub-carriers an OFDMA member needs three data symbols") was correct
but silent about it.

---

## Concerns

- `ofdma-ul` sits at 536/550 in `numbers` and `mumimo` at 517/550 — little headroom for later edits
  to those two sections.
- The power-correction gap above is the one place the lesson's picture describes the standard rather
  than the engine. I left the picture's list intact (it is cited) and flagged it in `deeper`; if the
  controller would rather the picture list only what the simulator does, that is a one-line change.
- `tests/course/tmpc2.test.ts` is in the working tree and is not mine; I did not stage it.

---

# Fix round 1 (coordinator review, two Minor findings — both `ofdma-ul`)

Budget line after: `picture 608/900 · numbers 538/550 · practice 338/450 · total 1484 (1484 words, 25 min)`
(was 588 / 536 / 338 / 1462).

## 1 — the power correction is qualified where the reader meets it

`picture`, step 4 of "What the trigger frame settles", now carries the qualification in the same
breath, both languages:

> How loudly: each device is told to correct its power, so a near one and a far one reach the access
> point at similar strength — **an instruction this simulator writes into the frame but does not act
> on, so its uploaders answer at their usual power.**

> 答多响：……强弱相近——**这条指令本仿真器只写进帧里，并不执行，它的上传设备仍按自己一贯的功率作答。**

The next paragraph ("An answer that decides nothing") listed the power among the things the access
point chose; **"the power" / 「发多响」 is removed from that list**, since after the qualification it
would be the same drift one paragraph later. The fuller note stays in `deeper` unchanged.

Cost: +20 words in `picture` (608/900, ample). Nothing taken from `numbers`.

## 2 — the 16,894 B figure now states its own status, and it is pinned

The figure appears in the "One triggered round, end to end" table. That cell now reads:

> 16,894 bytes from each uploader on half the channel each: **eleven whole frames and 531 bytes of
> padding** / ……各占半条信道：**十一个完整的帧，外加 531 字节填充**

Measured, not guessed: a TB PPDU here is `mpduCount = 11` of 1500 B MSDUs, and the length the trigger
named holds 17,425 B — a twelfth frame would need more than that, so 17,425 − 16,894 = 531 B of the
answer is padding. The deleted paragraph's "fill their 1988.8 µs to the byte and nothing is wasted"
was the loose claim; this replaces it with the true one.

Room found inside `numbers` as instructed, by trimming "An invitation, not an order" (…"colliding six
times", "Twice a trigger frame brought nothing back"); no step was compressed. 536 → 538/550.

New pin, `tests/course/ofdma-ul.test.ts`, "step 6: the 16,894 B answer is eleven whole frames, and the
other 531 B is padding": over every TB PPDU of the run — `mpduCount === 11`, every MSDU 1500 B,
`bytes === 16_894`, `ampduPsduBytes(11 × 1500) === 16_894`, `ampduPsduBytes(12 × 1500) > 17_425`, and
17,425 − 16,894 = 531. `proseMax` 1140 → 1160.

## Gate

- `MECHANISM_INCLUDE=ofdma-dl,ofdma-ul,mumimo npx vitest run tests/course/readability.test.ts` plus the
  three lesson tests: **946 passed, 0 failed**.
- `npx tsc -b --noEmit`: clean for my files; the only errors are in `tests/course/mlo.test.ts`
  (another batch, mid-edit, as flagged).
- `npx tsx scripts/lesson-dump.ts ofdma-ul zh` read end to end: full-width quotes throughout, no
  English word order, no pointer phrases, procedure and worked table read cleanly after the payoff.

No number, scenario, variant, jump or fixture changed; every earlier pin kept.

Temp files: my own `.tmp-c3-probe.ts` and `.tmp-c3b-probe.ts` are deleted. `.tmp-b4calc.mts` and
`.tmp-c4-probe.ts` are in the tree and are not mine — left alone. There is no `.tmp-c2-*` file.
