# Task 2 fix round 1 — re-review

**Fix commit:** `c782ec2` (base `f5d36e8`)
**Files:** `src/engine/ampBs.ts`, `src/engine/channel.ts`, `tests/engine/amp-bs-channel.test.ts`

## Finding verdicts

**Important 1 — DL PPDU prefix duplicated across three places.** ADDRESSED.
`src/engine/ampBs.ts:40-56` now exports `ampBsSyncEndNs(wupNs)` (preamble+WUP+AMP-Sync) and
`ampBsDataEndNs(cmd, wupNs)` (= `ampBsSyncEndNs` + command bits); `ampBsDlPpduNs` (`:63-65`)
composes `ampBsDataEndNs(cmd, wupNs) + bstNs + signalExtNs` instead of restating the four terms.
`src/engine/channel.ts:137-142`'s `bsDataEndNs(frame)` is now `ampBsDataEndNs(r.cmd, r.wupNs)`,
and `captureWindowNs`'s `ampRfid` branch (`:167`) is `ampBsSyncEndNs(frame.amp!.rfid!.wupNs)`.
`AMP_BS_DL_KBPS`, `AMP_BS_DL_SYNC_NS`, `ampRfidBytes`, `ampBitsNs` are no longer imported by
`channel.ts` (diff, import block). One composition, three consumers. Confirmed unchanged pinned
airtimes by running `tests/engine/amp-bs-model.test.ts`: 16/16 passed (this worktree; the report
says 15/15, one more test now present — not a regression, output is green).

**Important 2 — BST gate closed only as a side effect of half-duplex; idle reader decodes a
reply against thermal.** ADDRESSED.
`detectFloorDbm` (`src/engine/channel.ts:457,467-469`) is now the single, positive gate:
`if (frame.kind === 'ampBsReply') return r.ampCapable && this.bstOpenAt(rid, t) ? this.bsFloorDbm(rid, frame) : null`,
evaluated at the arrival instant `t` (new parameter) rather than via `now()`. `listening`
(`:485-487`) no longer duplicates the window test — it is `!r.transmitting || frame.kind === 'ampBsReply'`
unconditionally, pushing all gating into `detectFloorDbm`. Traced the idle-reader path by hand:
`bstOpenAt` (`:373-380`) calls `currentTx(nodeId)`, which reads `this.active.find(a => a.txId === nodeId)`
(`:362`); `endTx` (`:627-629`) is scheduled at `tx.endNs` and does
`this.active = this.active.filter(a => a !== tx)` synchronously when it fires. So at
`f.txTimeNs + 1` (new test case, `tests/engine/amp-bs-channel.test.ts:388`) or with no `ap` tx at
all (0.05 m test, `:408-423`), `currentTx('ap')` is `null`, `bstOpenAt` returns `false`, and
`detectFloorDbm` returns `null` for the reply regardless of `r.ampCapable` — the −200 dBm residual
guard is no longer what's carrying this case. Two new tests exercise exactly this: the extended
window test now includes `f.txTimeNs + 1` with `incidentDbm` pre-set on the frame (closing the
"Task 3 pre-sets it via `bsRxDbm`" gap the original review named), and a from-cold test at 0.05 m
(inside path-loss clamp) asserting `w.heard.ap` and `RX_START` are both empty. Ran the specified
test file: `tests/engine/amp-bs-channel.test.ts` — 17/17 passed.

**Minor 3 — six-positional-parameter constructor, declined and carried.** DECLINED-WITH-REASON,
sound. `git status` in this worktree confirms `src/engine/simulation.ts` is modified and
uncommitted (Task 3's in-flight work), and `git grep -n "new Channel("` shows the sole production
call site is there. Changing the constructor shape under a concurrently-editing implementer would
break their in-progress file for no behavioural gain in this fix round; the carry is recorded
verbatim in the report's "Carried items for the controller" §1. Reason holds.

**Minor 10 — move `bsDataEndNs`/`txDbmAt` out of `channel.ts`, partially declined.**
DECLINED-WITH-REASON (partial), sound. The composition half is ADDRESSED (see Important 1). The
remainder — moving the two functions themselves to `ampBs.ts` — is declined because Task 3 already
imports them from `channel.ts`: confirmed by grep, `src/engine/ampReader.ts:23` has
`import { bsDataEndNs } from './channel'`, used at `ampReader.ts:210`
(`bsDataEndNs(frame)! + (c.delayedT3Ns ?? AMP_BS_T1_NS)`). Moving the export mid-flight would break
that uncommitted file's import for a pure structural relocation with no behavioural change. Sound.

## No-new-defect checks

**Wi-Fi-interference SNR test** (`tests/engine/amp-bs-channel.test.ts:425-449`, "must clear its
SNR against Wi-Fi in the band"). Correct and self-bracketing: it drives a Wi-Fi `data` PPDU across
the BST window at `-70` dBm at the AP and asserts the reply is lost and named in a `COLLISION`
record naming both `sta` and `tag`; the identical geometry at `-100` dBm (30 dB quieter) asserts
the reply is heard. This isolates the code path added at `interferenceMw` (`noiseFloorMw` seeded
from `bsFloorDbm`, other active transmissions summed through `rxDbmOf`) rather than only the reader
floor, and cannot pass vacuously since both directions are asserted from one setup.

**Active-Tx-tag guard for `ampRfid`** (`detectFloorDbm` `src/engine/channel.ts:461-463`:
`if (r.kind === 'tag' && frame.kind === 'ampRfid') return null`, test at
`tests/engine/amp-bs-channel.test.ts:476-485`). Correct: an Active Tx `'tag'` radio previously fell
through to the `frame.amp?.dir === 'dl'` branch (`r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM`),
which does not discriminate by PPDU family, so it would decode a mono-static command it cannot
physically sync to (40-chip Active Tx sync vs. 8-chip mono-static sync, per the fix's own comment).
The new clause is placed before that fall-through and keys only on `r.kind === 'tag'` (not
`'bsTag'`, not `'wifi'`), so an Active Tx tag's legitimate DL reception (`ampTrigger`, still
`frame.amp?.dir === 'dl'` but `frame.kind !== 'ampRfid'`) is untouched — confirmed by the existing
Active-Tx regression test in the same file still passing (part of the 17/17 run). No new defect.

## Diff-wide check

Read the full diff (`ampBs.ts` +35/-9, `channel.ts` +51/-24 net across the shown hunks,
`amp-bs-channel.test.ts` +71/-14). No other behavioural changes beyond the two Important fixes,
the `bsUlKbps` narrowing helper (Minor 8, not asked about here but consistent with the report),
and doc-comment updates. No new `any`/`@ts-ignore`/unchecked casts introduced.

## Tests run

```
npx vitest run tests/engine/amp-bs-channel.test.ts tests/engine/amp-bs-model.test.ts \
  tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts
```
Result: **4 files, 71 passed, 0 failed** — matches the fix report's claimed gate exactly
(`amp-bs-channel` 17, `amp-bs-model` 16, `uwb-record-hashes` 37, `lesson-hashes` 1).

## Task 3 spillover (not counted against this fix, per instructions)

`tests/engine/amp-reader.test.ts`, `src/scene/nodes.ts`, `src/ui/format.ts` are Task 3's
uncommitted, in-progress work (confirmed via `git status`: `mac.ts`/`simulation.ts`/`records.ts`
modified, `ampReader.ts`/`ampBsSta.ts` untracked). Any full-suite or `tsc -b` failures confined to
those files are Task 3's concern, not this fix round's, per the fix report's own account (6
`amp-reader.test.ts` failures, 2 `tsc` "missing return" errors in `nodes.ts`/`format.ts` for an
exhaustive switch over `MacStateName` that Task 3 is extending). Not independently re-verified
since the task instructions scope this re-review to the four named test files, which are clean.

## Verdict

**ALL ADDRESSED.** Both Important findings (1 and 2) are fixed and hold under inspection; both
declined minors (3 and 10) carry sound, concurrency-driven reasons with the carries recorded for
the controller; the two new tests (Wi-Fi-interference SNR, Active-Tx-tag guard) are correct and
non-vacuous. No new breakage found in the fix diff.
