# Task 3 fix round 1 — re-review

**Fix base:** `70f44de` (original review head) · **Head:** `0eaac5e`
**Diff:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-3-fix1-review.md` (6 files, +156/-20)

## Finding Verdicts

**Important 1 — `bstEnergy()` ignores the reader's own floor (`src/engine/mac.ts:243` in the old code).**
ADDRESSED. `bstEnergy` moved out of the deps literal into `WifiMac.bstEnergy()`
(`src/engine/mac.ts:253-265`): `floorDbm = readerFloorDbm(monoLeakDbm(bs.bsDbm))`, and a tag
counts only when `ch.currentTx(id) !== null` **and**
`bsDecodes(ch.bsRxDbm(id, me, ch.bsRxDbm(me, id, bs.bsDbm) - AMP_BS_LOSS_DB), floorDbm, ulKbps)`.
`bsDecodes` (`src/engine/ampBs.ts:105-107`) is exactly `replyDbm - floorDbm >= AMP_BS_REQ_SNR_DB[kbps]`,
the same test the channel/demodulator uses — confirmed by reading `ampBs.ts:86-107`.
New test `tests/engine/amp-reader.test.ts:172-186` ("a tag that boots but cannot be heard leaves an
empty slot, not a collision"): `chargeDbm: 20`, `q: 0`, one tag at 0.5 m — boots
(`AMP_BS_BOOT powered: true`), draws counter 0, backscatters, `AMP_BS_REPLY.snrDb <
AMP_BS_REQ_SNR_DB[250]`, no `RX_OK` of kind `ampBsReply` at the reader, and every `AMP_INVENTORY`
reads `{ slotsOffered: 1, read: [], collisions: 0, empties: 1 }`. The same test's second half (same
20 dBm charge, two tags at 0.15 m) still asserts `collisions: 1` every round — a genuine two-tag
collision still counts. The report's mutation check (`bsDecodes(...) || true`) makes exactly the
first half fail (`collisions 1, expected 0`), which is direct diff evidence that removing the floor
regresses to the original defect; the two-tag test is unaffected by that mutation because its
`lastAnswered` is already set via `onRxFail()` (real decode interference), independent of the floor
check — consistent with the report's claim.

**Important 2 — a slot cut at the TXOP boundary after its RN16 resolves as neither read, collision
nor empty (`src/engine/ampReader.ts` old `step()`).**
ADDRESSED. New `private slotReserveNs()` (`src/engine/ampReader.ts:194-198`) =
`AMP_BS_T2_NS + ampBsDlPpduNs('ack', 0, bstNs('epc', kbps), signalExtNs)`; `step()`'s budget check
(`:211-220`) is now `needNs = frame.txTimeNs + (c.opensSlot ? slotReserveNs() : 0)`, so a
Query/QueryRep is only sent when the whole slot exchange (command, T2, ACK PPDU) still fits. The
four-tag test (`tests/engine/amp-reader.test.ts:139-154`) is restored to default `read: true` (the
`read: false` flip and its comment are removed in the diff). New test
`tests/engine/amp-reader.test.ts:189-216` ("never opens a slot it cannot finish…") runs `txopMs` in
{4,6,8,10} with four tags and Read on and asserts, for every `AMP_INVENTORY` record,
`read.length + collisions + empties === slotsOffered`; for every RN16 the reader decoded, a
matching ACK exists within 2 ms; and every completed session's TXOPs sum to exactly 4
`slotsOffered`. `records.ts:326-336` states the invariant on the `AMP_INVENTORY` type doc comment,
as claimed. Pinned numbers unchanged: the "4 ms TXOP stops before the command that would overrun"
test (`tests/engine/amp-reader.test.ts:69-78`, `txopNs).toBe(3_697_200)`) is untouched by the diff —
confirmed by grepping the diff and the current file — and the report's reasoning (the opening
Query's reservation was already covered; the fourth command, a QueryRep, still overruns under the
new check) is consistent with `slotReserveNs()` only gating `opensSlot` commands. Mutation check
(`slotReserveNs()` → `0`) fails the new test at multiple `txopMs` values, per the report.

**Minor 3 — `onRxFail()` fires on every corrupt reception, not only inside a BST window.**
ADDRESSED. `src/engine/mac.ts:1309-1319`: `onRxCorrupt(t)` now gates
`this.ampInventory?.onRxFail()` behind `this.ch.bstOpenAt(this.nodeId, t)` (public API, confirmed
at `src/engine/channel.ts:373`). The `_t` parameter is now used.

**Minor 4 — counters never checked against an independently derived stream.**
ADDRESSED. `tests/engine/amp-reader.test.ts:140-144`: replaced the range check with
`expect(draws[0].counter, id).toBe(new Rng(sc.seed).fork(hashStr(\`${id}#2g\`)).int(3))`, which
matches `simulation.ts`'s own wiring (`root.fork(hashStr(vid))`, confirmed at
`src/engine/simulation.ts:202/213/230`). The histogram cross-check against the reader's tallies is
kept.

**Minor 5 — no test for "inside activation range, outside reply range".**
ADDRESSED, by the same new test as Important 1 (`chargeDbm: 20`, tag at 0.5 m — activation reach
0.978 m, reply reach 0.328 m).

**Minor 6 — untagged magic numbers `255` and `'*tags'`.**
ADDRESSED. `src/engine/ampReader.ts:65-68`: `SESSION_MODULUS = 255`, commented and tagged `model`,
with the S0–S3 note; `BROADCAST` at `:62-64` now documented as a sentinel, not physics.

**Minor 7 — an unpowered but in-range tag flickers into `rx`.**
ADDRESSED. `src/engine/ampBsSta.ts:31-36`: `onRxStart` now sets `rx` only when
`this.powered || wakes` (`wakes` = the PPDU's `wupNs >= AMP_BS_WUP_MIN_NS`), gated on top of the
existing `idle`/`bsWait` check.

**Minor 8 — `inventory.read/collisions/empties` only move at TXOP end (live inspector row).**
DECLINED-WITH-REASON, and the reason is sound. The implementer's argument: `read`/`collisions`/
`empties` come only from the reader's own energy judgement, which reaches the record stream solely
via `AMP_INVENTORY` at TXOP close; deriving `read` live from ACK commands would move one column
while leaving the other two pinned at zero, which reads as a result rather than "not yet". I
verified the mechanics in `src/model/view.ts`: `MAC_STATE` (`:560-569`) clears `n.ampRound` to
`null` on any state that isn't the AP's own `tx`/`waitAck`, so between TXOPs the round is gone, and
`AMP_RFID` (`:611-629`) re-creates it with `inventory: { read: 0, collisions: 0, empties: 0 }` only
when there is no live round for that session — i.e. each TXOP's row genuinely restarts from zero,
matching the stated per-TXOP contract. `AmpInventoryView`'s doc comment (`view.ts:109-123`) now
states this contract explicitly. Reasonable engineering call, correctly documented rather than
silently left as a gap.

## New Breakage in the Fix Diff

None found. Checked: the reservation only applies to `opensSlot` commands, so an ACK/Read/Write
queued after a decoded RN16 is unaffected and cannot silently overrun (the report's argument that
the reservation already covers the ACK's own airtime holds — `slotReserveNs()` includes the ACK
PPDU's `ampBsDlPpduNs`). The Read/Write-after-EPC path is still deliberately unreserved and, when
cut, is simply dropped without corrupting the read/collision/empty tally (the EPC itself was
already counted as read in `resolve()`'s `'epc'` case before `queueAccess` is called). The
`onRxCorrupt` gate change only narrows when `onRxFail()` fires (BST-window-only), which cannot
introduce a false collision it didn't already report, and can only remove false ones. No i18n,
scenario schema, or fixture files were touched in this round (confirmed absent from the diff and
from `git status`).

## Out-of-Scope Observations

None beyond what the original review already carried forward (spec's `Coexistence` `none` sentence;
"strict alternation" wording is per-poll not per-TXOP) — both explicitly restated as carries in the
fix report and unchanged by this diff, so they remain for the controller/Task 4-5, not this loop.

## Tests

Ran the requested targeted suite directly (read-only, no repo mutation):
`npx vitest run tests/engine/amp-reader.test.ts tests/engine/amp-bs-sta.test.ts
tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts tests/model/view.test.ts`
→ **5 files, 88 tests, 0 failed.** This matches (and is a subset of) the fix report's claimed
targeted run (29 files, 421 tests) and full run (124 files, 1847 tests).

## Verdict

**Fix round: ALL ADDRESSED, no new Critical/Important breakage.** Both Important findings are fixed
with matching new tests and mutation evidence; all six Minors are addressed or soundly declined.
