# AMP slice A2 — scoped re-review of the fix wave (commit cd73d94)

Base seen by the whole-branch review: `b2829c2`. Fix wave head: `cd73d94` (one commit, on top of
`fe99177`/`d7078c7` course commits, which are out of scope). Read-only; no files changed, no
subagents dispatched.

## Finding Verdicts

**I-1. A poll tick during a running inventory truncates it and stamps the record `complete: true`.**
— **ADDRESSED.** `src/engine/ampReader.ts:123-127` (`newInventory()`): `if (this.running ||
this.resumable) { this.restartPending = true; return }` before touching `remaining`, so a tick
mid-round no longer zeroes `remaining` early. `endTxop()` (`ampReader.ts:309-330`) computes `const
complete = this.remaining === 0` at line 316, *before* the restart is applied at lines 325-328
(`if (this.restartPending && !this.resumable) { this.remaining = 0; this.restartPending = false }`)
— exactly the ordering the finding asked for. Reproduction test
`tests/engine/amp-reader.test.ts:920-941` uses four tags, `pollIntervalMs: 10`, `txopMs: 4`, runs
400 ms, asserts `read.length + collisions + empties === slotsOffered` for every record and that
every `complete: true` session's `slotsOffered` sum to `2^Q = 4`. The fix-wave report quotes the
RED failure before the fix. M-4's resumable-session case is covered by a dedicated bench
(`readerBench` + describe block at `amp-reader.test.ts:1113-1135`): a tick landing between TXOPs
(`b.round.newInventory()` while `resumable === true`) leaves the session intact
(`expect(b.round.resumable, ...).toBe(true)`), the session finishes with all 4 slots and one
session number throughout, and only the *next* TXOP after completion picks up the new session.

**I-2. The Inspector's inventory tally can never be seen.**
— **ADDRESSED.** `src/model/view.ts:169-175,442-450`: `NodeView.ampInventoryLast?: AmpInventoryView`
is set in the `AMP_INVENTORY` case regardless of whether the live `ampRound.inventory` still
matches (unconditionally after the `if (inv && inv.session === r.session)` block), and nothing in
the `MAC_STATE` handler (`view.ts:570-580`) touches `ampInventoryLast` — only `ampRound` is
nulled — so the field survives the same-instant defer. `src/ui/Inspector.tsx:476-480` renders it
with `!nv.ampRound && nv.ampInventoryLast` using `L.inventoryLastHint`/`L.inventoryLast`, and
`src/ui/i18n.ts` carries both keys in the `Strings` interface (`i18n.ts:198-199`) and in both the
`en` (`i18n.ts:647-649`) and `zh` (`i18n.ts:697-699`) string tables — EN and ZH both present.
`tests/model/view.test.ts:1168-1172` now feeds the real engine order (`AMP_INVENTORY` then a
same-instant `MAC_STATE: defer`) and asserts `ampRound` is null while `ampInventoryLast` holds the
tally; a second new test (`view.test.ts:1178-1205`) drives a real `Simulation`, applies every
record up to and including the first `AMP_INVENTORY`, confirms a same-instant `MAC_STATE` for the
AP is among the following records, applies those too, and asserts the tally is still readable and
matches the closed record's `read.length`/`collisions`/`empties`, plus the
`read+collisions+empties === slotsOffered` invariant. The live-vs-replay equivalence test at
`view.test.ts:1207` is unchanged, and the full suite run below confirms it still passes.

**I-3. Wi-Fi radios hear an RFID PPDU at the AP's `txPowerDbm`, not at the PPDU's own power.**
— **ADDRESSED.** `src/engine/channel.ts:440-449` (`rxDbmOf`): the `ampRfid` branch now computes
`const ppduDbm = txDbmAt(frame, 0)!` once; a `bsTag` radio still gets `ppduDbm -
this.bsLossDb(...)` (unchanged Friis-law path), and any other radio (i.e. Wi-Fi) gets
`this.linkDbm(tx.txId, rxId) - (g.txPowerOf(tx.txId) - ppduDbm)` when `bsGeometry` is present,
falling through to the untouched `return this.linkDbm(tx.txId, rxId)` otherwise. Every other frame
kind (`ampBsReply`, and the final fallthrough for all non-AMP kinds) is byte-identical to before —
I read the whole `rxDbmOf` body and confirmed no other branch changed. `BsGeometry.txPowerOf` was
added as an interim field (`channel.ts:196-199`, documented as belonging with `spectrum` in one
options object per carry C-2 — matches the controller's ruling that this is accepted as an interim
home) and wired in `src/engine/simulation.ts:322` and both test benches
(`tests/engine/amp-bs-channel.test.ts:743`, `tests/engine/amp-bs-sta.test.ts:817`). The 10 dB test
(`amp-bs-channel.test.ts:766-789`) pins the preamble-detect boundary of a CTS from a 20 dBm AP at
exactly −82 dBm and a Query at `chargeDbm` 10 at exactly −72 dBm (10 dB apart, at both edges of the
boundary), and a Query charged at 20 dBm lands back at −82 dBm — non-vacuous, boundary-pinned both
ways.

*Probe outcome (geometry, not law):* `amp-reader.test.ts` computes `edReachM` from
`DEFAULT_AMP_BS.chargeDbm`, `CCA_ED_DBM`, `PL0_DB`, `PL_EXP` (not hardcoded), asserts it
`toBeCloseTo(6.97, 2)`, and separately asserts `Math.hypot(5, 4)` (the AP-to-corner distance in the
10×8 m room, `AP_POS = {x:5, y:4}` per `tests/engine/amp-bs-helpers.ts:11`, room `w:10,h:8` at
line 29) is less than `edReachM` — i.e. 6.40 m < 6.97 m, matching the review's numbers. The room
test (`amp-reader.test.ts:993-1014`) runs three station positions including two near-corners and
asserts no Wi-Fi PPDU starts inside any BST window and every reflection is heard
(`heard === sent`, `sent > 0`) — non-vacuous. The counter-example hall test
(`amp-reader.test.ts:1016-1045`) places the same station 12 m away (past `edReachM`) in a 40 m
hall, asserts Wi-Fi frames *do* start inside BST windows (`inBstWindow(...).length > 0`), that some
reflections are spoiled (`spoiled.length > 0`, `replies.length > 20`), and that exactly those and
only those are lost (`heard === replies.length - spoiled.length`) — a real, non-trivial pinned
counter-example. Both the docstring in `amp-reader.test.ts:971-986` and the fix-wave report state
this is a room-size result, not a law.

## Minors

- **M-1** — **CARRIED**, per controller ruling. Not touched by this diff; `channel.ts`'s decode
  path, `ampBsSta.ts`'s `snrDb` record, and `mac.ts`'s `bstEnergy()` remain three separate copies
  of the round-trip/floor computation. Correctly deferred to the channel refactor (C-1/C-2).
- **M-2** — **ADDRESSED.** `src/engine/ampBsSta.ts:39-41` no longer sets `inventoried` in `onAck`;
  `ampBsSta.ts:61-65` sets `if (reply === 'epc') this.inventoried = true` inside `backscatter()`,
  at the point the EPC reply actually goes on the air, matching the view's own `AMP_BS_REPLY`
  handler as the fix-wave report describes.
- **M-3** — **ADDRESSED.** `src/engine/mac.ts:274-277` adds the ticks-not-rounds sentence to
  `pickAmpRound`'s docstring, above the unchanged `this.ampPolls++ % 2 === 0` logic.
- **M-4** — **ADDRESSED**, folded into I-1 above (`resumable` half of `newInventory()`'s guard,
  and the dedicated `readerBench` test).
- **M-5** — **ADDRESSED.** `src/ui/i18n.ts:645` (en) and `:695` (zh) `bsSnrHint` now names both
  bars (3 dB at 250 kb/s, 9 dB at 1 Mb/s); `tests/ui/amp-bs-guide.test.ts:1294-1302` pins both
  numbers against `AMP_BS_REQ_SNR_DB[250]`/`[1000]` in both languages.
- **M-6** — **ADDRESSED.** `i18n.ts:622` (en) and `:672` (zh) `ampBsWriteHint` now says the reply
  comes 2 ms later and the PPDU on the lane is "about 3 ms" (holding the carrier across the wait),
  replacing the "a 2 ms Write" wording the finding flagged.
- **M-7** — **ADDRESSED.** `src/ui/glossary.ts` diff removes `AMP_BS_LOSS_DB`, `wupMs`,
  `AMP_BS_ACTIVATION_DBM`, `AmpTagCfg.epc`, `AMP_BS_READER_DR_DB`, `AMP_BS_ISOLATION_DB`, and
  `monoLeakDbm = excitationDbm − 20` from the prose while keeping the document tags (e.g.
  "TGbp 11-25/0307r0"). New test `tests/ui/amp-bs-guide.test.ts:1255-1270` regex-checks every
  `term`/`alt.en`/`alt.zh`/`def.en`/`def.zh` string in the `'amp'` glossary group (confirmed
  `GLOSSARY.find((g) => g.id === 'amp')` at `amp-bs-guide.test.ts:104`) against both an
  `AMP_[A-Z0-9_]+` pattern and a `...Dbm|Ns|Ms|Kbps|Db|Cfg` / `Amp...` symbol pattern, i.e. it
  checks the whole group, not just the finding's two examples.
- **M-8** — **CARRIED**, per controller ruling. `ampReader.ts:23` still imports `bsDataEndNs` from
  `channel.ts`; untouched by this diff, deferred to C-3 as instructed.
- **M-9** — **ADDRESSED.** `tests/engine/amp-bs-sta.test.ts:843` replaces the vacuous
  `toBeGreaterThanOrEqual(0)` with `expect(drawn).toBe(new Rng(3).fork(1).int(3))`, replaying the
  tag's own stream; `tests/engine/amp-reader.test.ts:898` pins `slotsOffered` to `1` instead of
  `toBeGreaterThanOrEqual(1)`.

## New Breakage in the Fix Diff

None found. I read the full diff (`ampBsSta.ts`, `ampReader.ts`, `channel.ts`, `mac.ts`,
`simulation.ts`, `records.ts`, `view.ts`, `Inspector.tsx`, `glossary.ts`, `i18n.ts`, and all five
touched test files) plus the surrounding source for `ampReader.ts` (whole file) and `channel.ts`'s
`rxDbmOf`/`bsLossDb`/`linkDbm` neighborhood in full, not just diff hunks. Every non-AMP code path
in `channel.ts`'s `rxDbmOf` and every state transition in `ampReader.ts` outside the two touched
methods (`newInventory`, `endTxop`) is untouched. `endTxop`'s restart-application order handles the
three reachable cases correctly: session completed normally (restart is a no-op), session
unfinished and progressed (restart deferred again via `resumable`), session unfinished and
not progressed (restart applied — the round would otherwise repeat forever). `mac.ts`'s
`scheduleAmpPoll` still calls `newInventory()` unconditionally each tick, which is now safe because
the deferral lives inside `newInventory()`/`endTxop()` themselves.

## Verification run in this re-review

- `npx vitest run tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` —
  2 files, 40 tests, all green.
- `git diff fe99177..cd73d94 -- tests/fixtures/lesson-hashes.json` — one file, +2/-0: only the
  concurrent course implementer's `amp-ppdu`/`amp-ppdu#0` keys added (same hash values as the
  existing `amp-intro`/`amp-intro#0`, i.e. a rename artifact from that other commit, not this one).
  No existing hash moved. Byte-identical guarantee holds; this fix-wave commit does not touch the
  fixture.
- `npx vitest run tests/engine tests/model tests/ui tests/editor` — 77 files, **848 passed**, 0
  failed.
- `npx tsc -b --noEmit` — clean, no output.

## Out-of-Scope Observations

None beyond what the branch review already ledgered (C-1…C-10). Nothing new noticed outside the
fix diff.

## Verdict

**READY TO MERGE.** All three Important findings (I-1, I-2, I-3) addressed with non-vacuous,
boundary-pinned tests and diff evidence; M-2, M-3, M-4, M-5, M-6, M-7, M-9 addressed; M-1 and M-8
correctly carried per the controller's ruling; `BsGeometry.txPowerOf` interim home and the
geometry-not-law probe framing both match the controller's acceptance. No new breakage in the fix
diff. Byte-identity gate green; full engine/model/ui/editor suite green (848/848); `tsc -b
--noEmit` clean.
