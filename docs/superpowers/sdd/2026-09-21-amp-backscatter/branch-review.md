# AMP slice A2 (mono-static backscatter, Tasks 1–4) — whole-branch review

Range: 567b715 → b2829c2, AMP commits only (e08ed28, 4299134, f5d36e8, c782ec2, 70f44de, 0eaac5e, 0573cad, b2829c2).
Reviewer: read-only; no files changed apart from this report. Course, undo/redo and readability commits out of scope.

## Verdict: NEEDS A FIX WAVE (small — three targeted fixes plus their tests; everything else carries)

Counts: Critical 0 · Important 3 · Minor 9 · Carry list 10.

Gates run on the branch head:
- `npx vitest run tests/engine tests/model tests/editor tests/ui` — 77 files, 841 tests, all green.
- `npx tsc -b --noEmit` — clean.
- `npx vitest run tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` — green. The two fixtures differ from 567b715 by additions only (`uwb-frame`, `uwb-frame#0`, from the course slice); no existing hash moved. The byte-identical guarantee holds.

Two of the Important findings were not visible to any task review because they live between tasks. I confirmed both by running the engine headlessly (scratchpad `probe-a2.ts`, records only, no repo change) rather than by reading.

---

## What the slice does well

The model half is exemplary: `ampBs.ts` puts every number under one name with its tag, writes the reach closed forms so that the excitation cancels *in code* rather than in a comment, and the channel bench tests then walk both sides of every boundary (0.327 / 0.328 m, 0.231 / 0.233 m, at bsDbm 0 / 10 / 20) against those same closed forms — so a retune cannot leave the lesson's numbers stale. The channel change is disciplined: every new branch keys on `ampRfid` / `ampBsReply` / `bsTag`, existing kinds fall through to the exact code they had (`rxDbmOf` → `linkDbm`, `listening` → `!transmitting`, `detectThreshDb` → 4 dB, `decodeThreshDb` 'dl' identical for `wifi`/`tag`), `resolveLock` is a pure extraction of the old `endTx` body, and the fixtures prove it. The half-duplex exception is one positive gate (`bstOpenAt`) that also covers the idle reader, and the tag's reception is resolved at AMP-Data end so its own reflection never kills its lock. The reader's TXOP reservation (`slotReserveNs`) makes `read + collisions + empties === slotsOffered` a real invariant, and the reader-floor gate on `bstEnergy()` correctly separates "booted but unheard" from "collided". Docs paraphrase; only names and numbers are quoted; every constant, including the 1.2/1.1 margins, the 255 session modulus, the RN16 stream id and the power hold, carries a tag.

---

## Findings

### Critical
None.

### Important

**I-1. A poll tick during a running inventory truncates it and stamps the record `complete: true`.**
- `src/engine/mac.ts:300-311` (`scheduleAmpPoll`) calls `round.newInventory()` unconditionally on every tick; `src/engine/ampReader.ts:112-114` sets `remaining = 0` even while `running`, so the next `step()` finds `nextCommand() === null` and `endTxop()` emits `AMP_INVENTORY { complete: this.remaining === 0 }` = true after fewer than 2^Q slots.
- Reproduced: four tags at 0.1–0.3 m, `pollIntervalMs: 10`, `txopMs: 4` — 12 of 40 sessions report `complete: true` after 2 or 3 slots. The editor allows exactly these settings (schema min 10 ms). The tests never hit it because every reader test uses poll ≥ 20 ms or one tag.
- Why it matters: `AMP_INVENTORY.complete` is documented (records.ts) as "once 2^Q slots have been offered"; a lesson pin or a learner reading the log gets a false statement, and the tags that drew counters for that session are silently abandoned mid-round.
- Fix: make `newInventory()` deferred — `if (this.running) { this.restartPending = true; return } this.remaining = 0`; in `endTxop()` compute `complete` first, then `if (this.restartPending) { this.remaining = 0; this.restartPending = false }`. Add a reader test with poll 10 ms / TXOP 4 ms / four tags asserting that every `complete: true` session summed to 2^Q slots (the probe's own check).

**I-2. The Inspector's inventory tally (read / collided / empty) can never be seen.**
- `src/model/view.ts:631-637` fills `ampRound.inventory.read/collisions/empties` from `AMP_INVENTORY`; `src/model/view.ts:560-568` nulls `ampRound` on the AP's next `MAC_STATE` unless it is `tx`/`waitAck`. The reader emits `AMP_INVENTORY` and then, at the same instant, `deps.done()` → `onAmpDone` → `resumeAll` → `MAC_STATE: defer`. Reproduced over 4 TXOPs: after applying every record at the `AMP_INVENTORY` instant, `ampRound === null` every time; the row at `src/ui/Inspector.tsx:102-103` therefore reads `0 / 0 / 0` during the TXOP (by design, per the view.ts comment) and disappears the instant the numbers arrive.
- The test at `tests/model/view.test.ts:400` asserts the tally right after the hand-fed `AMP_INVENTORY` and before any `MAC_STATE`, so it passes against a stream the engine never produces. The replay-equality test cannot see it either (live and replay agree on an empty row).
- Why it matters: this is the reader's one live readout the spec asks for ("the AP's `ampRound` gains `inventory`"), and it is what the lesson's observe steps would point a learner at.
- Fix (smallest): keep the last inventory's result alive separately — `NodeView.ampInventoryLast?: AmpInventoryView` set at `AMP_INVENTORY`, and let the Inspector show it (with the session number) when `ampRound` is null. Alternative: in the `MAC_STATE` handler, do not null an `ampRound` that holds an `inventory` until the next `AMP_RFID` of a different session replaces it. Either way, replace the hand-fed assertion with one that applies a real record stream through the TXOP end and asserts the row afterwards.

**I-3. Wi-Fi radios hear an RFID PPDU at the AP's `txPowerDbm`, not at the PPDU's own power — 10 dB louder than the spec's own approximation.**
- `src/engine/channel.ts:417-428` (`rxDbmOf`): for an `ampRfid` at a `wifi` radio it returns `linkDbm`, i.e. the link table built from `txPowerDbm` (`propagation.ts:80`). The spec sanctions "max over the PPDU" = `chargeDbm` (10 dBm default); the test scene and `oneRoom()` give the AP 20 dBm. So preamble detection, L-SIG deferral radius and energy detection of every RFID PPDU are evaluated 10 dB (default) too generously, and during the BST-Excitation (0 dBm) 20 dB too generously.
- This is the "AP txPowerDbm vs chargeDbm" carry from Task 2, but it is load-bearing for ruling (2), "Wi-Fi never lands inside a BST window". The T2 < AIFS half of that argument is sound and independent of power. The other half — "a station loud enough to spoil a reflection hears the reader and defers" (`tests/engine/amp-reader.test.ts:250-258`) — assumes symmetric power, and the reader radiates 0 dBm during the BST while the station transmits 15–20 dBm. Under the indoor law a station ≥ ~5.3 m away that missed the preamble (it was transmitting when the PPDU began) sees the 0 dBm excitation below −62 dBm, may start inside the BST window, and its 20 dBm arrives at the reader ~27 dB above the reader floor. In the 10 × 8 m test room the result still holds under the spec's `chargeDbm` approximation (−52 dBm at 5.5 m), so the pinned test is not wrong for that room — but the excitation being "its own protection" is a room-size result, not a law, and it must not be written into the lesson as one.
- Fix: give the channel the AP's charge power for the Wi-Fi side — `rxDbmOf` for `ampRfid` at a non-`bsTag` radio returns `linkDbm(ap, rid) − (txPowerOf(ap) − txDbmAt(frame, 0))` (or the per-instant value, which `updateAllCca` could take from `txDbmAt(frame, now − start)`); `txPowerOf` belongs in the folded Channel opts object (carry C-2). Then re-run the two coexistence tests and state in the reader test's comment the geometry the "never lands inside a BST" result depends on. If this is deferred, the Task 5 brief must forbid the lesson from stating the result as general.

### Minor

**M-1. Three copies of the round-trip and the floor.** `channel.ts:417-428 + 440-447`, `ampBsSta.ts:206-210` (record `rxDbmAtAp`/`snrDb`), `mac.ts:270-283` (`bstEnergy`). Consistent today by construction (same `bsRxDbm`, same `bsDbm`), but the record's `snrDb` ignores Wi-Fi interference while the channel's decode does not, so a reply lost to Wi-Fi shows a healthy margin in the log. Fix belongs with carry C-1 (`bstEnergyAt` / `onRxMiss` in the channel); until then, name the omission in the `AMP_BS_REPLY` docstring ("against the leakage floor alone").

**M-2. `ampBsSta.ts:162` sets `inventoried = true` on the ACK, before the EPC is on the air.** If the EPC reply were ever lost (cannot happen in this slice: same power and threshold as the RN16, and Wi-Fi cannot enter the BST window), the tag would be silent for the session and never recorded. Move the flag to `backscatter()` after the EPC reply starts, which is also where the view sets it (`view.ts` `AMP_BS_REPLY` kind `epc`) — one source of truth for "inventoried".

**M-3. Alternation is over poll ticks, not rounds run.** `mac.ts:293-297` increments `ampPolls` per tick; a tick whose TXOP is pre-empted by the next tick still consumed its parity, so under heavy Wi-Fi load two inventories can run back to back. The test asserts on rounds run and passes only because access is quick. Either document "even/odd *ticks*" in the WifiMacCfg comment and the Guide, or increment in `transmitFor` when the round actually starts.

**M-4. A resumption can be silently replaced.** `mac.ts:320-323` sets `ampNext = ampInventory` for a resumable session, but a poll tick before the TXOP is won overwrites `ampNext` and calls `newInventory()`, abandoning the tags' held counters. Not incorrect (they redraw under the new session) but it defeats the "Extend" model the README advertises; with I-1's `restartPending` in place, the tick should leave a resumable inventory alone.

**M-5. `bsSnrHint` (i18n.ts:617, 1171) quotes the 250 kb/s threshold only**; at 1 Mb/s the bar is 9 dB. Say "3 dB at 250 kb/s, 9 dB at 1 Mb/s" or pin from `AMP_BS_REQ_SNR_DB`.

**M-6. `ampBsWriteHint` (i18n.ts:500, 1054) "a 2 ms Write"** — the Write PPDU is 2.96 ms because it holds the carrier through the 2 ms wait; "a Write whose reply comes 2 ms later, so its PPDU is ~3 ms" is what the learner sees on the lane.

**M-7. Glossary entries for a learner carry code identifiers.** `glossary.ts:635-651` ("AMP_BS_READER_DR_DB", "monoLeakDbm = excitationDbm − 20") and the Backscatter entry ("AMP_BS_LOSS_DB"). The Guide and README already give provenance; the glossary is the plain-words surface the readability programme is about. Keep the tag ("TGbp 11-25/0307r0"), drop the identifiers.

**M-8. `ampReader.ts:23` imports `bsDataEndNs` from `channel.ts`** — the MAC importing a PPDU-anatomy helper from the medium (carry C-3). Harmless today; move `bsDataEndNs`/`txDbmAt` to `ampBs.ts` when C-2 is done.

**M-9. Two weak assertions.** `tests/engine/amp-bs-sta.test.ts:224` `expect(drawn).toBeGreaterThanOrEqual(0)` is vacuous (the next line carries the test); `tests/engine/amp-reader.test.ts:65` `slotsOffered ≥ 1` could pin `1`. Cosmetic; every quoted number elsewhere is pinned non-vacuously.

---

## Rulings revisited (ledger)

| Ruling | Verdict on reflection |
|---|---|
| `bstEnergy()` in mac.ts via public channel API | Acceptable for A2; it is the third copy of the round trip (M-1) and should be the first thing A3/A4 replace, because a bistatic floor is not `monoLeakDbm(bsDbm)`. |
| Strict poll alternation | Sound and legible; the tick-vs-round wording needs one sentence (M-3). |
| Unpowered at PPDU end unless next within T2 + 8 µs | Right, and the CTS-to-self alternative is rightly rejected (a tag has no NAV). |
| No record for an unreachable tag | Right; the records.ts docstring says why, the Guide/EditorGuide say "no lane, no record". |
| Sub-floor answers tallied as empties | Right — a real Gen2 reader sees nothing either; the test at 20 dBm / 0.5 m pins it and the two-tag control shows the detector is not switched off. |
| Lesson scene charges at 20 dBm | Right for teaching (the reply limit binds); the spec's lesson paragraph still says 10 / 0 dBm and must be amended (C-6). |
| "Wi-Fi never lands inside a BST window" | Half law (T2 < AIFS), half room geometry — see I-3. Faithful under the spec's `chargeDbm` approximation in the test room; not general. |

---

## Carry list (may wait for the next slice, in priority order)

- **C-1** Channel-owned `onRxMiss` / `bstEnergyAt(rid, t)` so the reader's energy detection and the reply record read the same SINR the channel decodes (retires M-1, and is required before A4's bistatic floor).
- **C-2** Fold `spectrum` + `bsGeometry` (+ `txPowerOf`) into one `ChannelOpts` object — I-3's fix wants `txPowerOf` on the 2.4 GHz link, which today only the 6 GHz spectrum hook carries.
- **C-3** Move `bsDataEndNs` / `txDbmAt` into `ampBs.ts` (M-8).
- **C-4** Split `FloorPlanEditor.tsx` (898 → 1061 lines): lift the AP's RFID inventory block (~90 lines of JSX) and `AmpEpcInput` into `src/editor/AmpReaderFields.tsx` the way `UwbSessionFields` was lifted — **before A3**, which adds nine energy fields, an energizer node kind and service-period fields to the same panel.
- **C-5** `channel.ts` 517 → 807 lines. Still one coherent model, but `bsLossDb`/`bsRxDbm`/`bsFloorDbm`/`fillIncidentDbm`/`BsGeometry` are a backscatter law module in waiting; do it with C-1/C-2 rather than now. `mac.ts` +107 lines is fine.
- **C-6** Spec amendments: Coexistence `none` sentence (state the T2 < AIFS result and the geometry caveat from I-3); Lesson scene charge power 20 dBm; "alternation = poll ticks".
- **C-7** `select` never passes through `decodeFrame` in a test (Task 1 carry) — one case in `tests/model/frameFields.test.ts`.
- **C-8** A4 note already in `ampNoiseBwMhz` (channel.ts:259): a bistatic receiver against thermal needs the reply's own 2 µs-chip bandwidth.
- **C-9** `AmpBsStaMac.onRxOk` recomputes the incident power the channel already had for the lock; a `rssi` on `PhyListener.onRxOk` would remove that copy (touches every listener — not for this slice).
- **C-10** Tag boot under a corrupted Query: a tag whose Query is spoiled by Wi-Fi never boots this TXOP although it charged for the whole WUP. Defensible model, unstated; one line in the Tag behaviour section of the spec.

---

## Checklist coverage (the ten lenses)

1. Cross-task seams — one source per number except the three round-trip copies (M-1); `AMP_BS_LOSS_DB`, `readerFloorDbm`, `monoLeakDbm`, `bstNs`, `ampBsDataEndNs` mean the same thing in channel, MACs, records, frameFields, format, Guide, glossary and README; `FRAME_KINDS` drives i18n parity. The view/inspector seam is broken (I-2).
2. Determinism and replay — the only new draws are `rng.int(2^Q − 1)` from the tag's stream and the RN16 from a forked stream; `fork` does not advance the parent (rng.ts:31-35); the four-tag test replays the counter from `new Rng(seed).fork(hashStr(vid)).int(3)`; view reducer is record-only and live = replay is pinned. Record order at each instant is deterministic (AMP_RFID before TX_START, AMP_BS_REPLY before the tag's TX_START, AMP_INVENTORY before MAC_STATE).
3. Byte-identical — verified line by line in the channel and mac diffs (see "does well") and by both fixtures.
4. Physical honesty — per-instant power is a clean step at AMP-Data end (signal extension at `bsDbm`, tagged model); floor = leak − DR reproduces 0307's table; reply gate at the start instant is provably sufficient (BST ≥ 1.2·T1 + 1.1·T4 contains T1 + T4, and the Write case likewise); the "never inside a BST" result is qualified in I-3.
5. Rulings — table above; one (the BST result) is narrower than stated.
6. Carries — I-3 promotes one carry; the rest are ordered above.
7. File health — C-4/C-5.
8. Tests — failure paths covered (collision at channel and reader, cut TXOP across four TXOP lengths, no-WUP and out-of-range tags, sub-floor reply, Wi-Fi across the BST at the bench); gaps are I-1 (poll during run), I-2 (real stream through the view), C-7.
9. Copyright — no lifted SFD/PDT/Gen2 prose found in engine, README, Guide, EditorGuide or glossary (grep for "shall", "Interrogator", "Tag population" etc. clean); command and field names only; every constant tagged.
10. Learner's lens — Guide and EditorGuide read plainly, with numbers pinned to the engine by test; glossary is mostly plain but leaks identifiers (M-7); two hints are rate- or length-imprecise (M-5, M-6); README rows are correctly tagged and the model split is stated where it matters.
