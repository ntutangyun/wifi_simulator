# Task 4 report: AmpStaMac — the triggered-only tag

## What

Created `src/engine/ampSta.ts` implementing the brief's `AmpStaMac` class (P802.11bp Active Tx
non-AP AMP STA, PDT 11-26/1889r4 clause 39.4 / 11-26/1519r5 clause 39.3), essentially verbatim
from the brief's reference implementation, with the noted correction already present in the
reference (`ulKbps: this.ulRateOf(frame)` constructed directly in the `Round` literal — there was
no stale line to fix; the brief's "note at the end" and the reference code already agree).

- `onCcaBusy`/`onCcaIdle`: no-ops (tags have no carrier sense).
- `onRxStart`: labels `'rx'` only from `'idle'` — a reception heard while `'tx'` or `'ampWait'`
  never overwrites that label.
- `onRxOk`: routes `ampTrigger` → `onTrigger`, `ampAck` → `onAck`; anything else (wrong source,
  non-AMP frame, unrecognised AMP kind) falls back to `settle()`, which only reverts a transient
  `'rx'` back to `'idle'`/`'ampWait'` and never touches a genuine `'tx'`/`'ampWait'` label.
- `onTrigger`: closes any previously open round first (cancels its `endHandle`/`txHandle`), then
  draws by phase — random: `acw = 2**acwe - 1`, `aboc = rng.int(acw)`, `slot = aboc < slots ? aboc+1 : null`;
  scheduled: `slot = staIds.indexOf(nodeId) + 1` or the tag is left untouched (no `AMP_ABOC`, no
  round) if absent from the list. Always emits `AMP_ABOC` for a participating tag (scheduled emits
  `{aboc:0, acw:0, slot}`). With a slot, opens a `Round`, arms the round's end-of-round timeout
  (`t + roundNs + 50_000`), and either schedules `transmitResponse` at `t + SIFS` (slot 1) or sits
  in `'ampWait'`.
- `onAck`: while not yet sent, counts Acks closing earlier slots (`acksSeen`); reaching
  `slot - 1` schedules this tag's own `transmitResponse` at `t + SIFS`; an Ack for this tag's own
  slot or later while it still hasn't transmitted means the round moved past it → `giveUp()`.
  Once sent, only the Ack addressed to `ackFor === slot` matters: `acked = dst === nodeId`, emits
  `AMP_RESULT`, closes the round, returns to `'idle'`.
- `onRxCorrupt`: an open round's keyed Ack failed to decode → `giveUp()` (`AMP_RESULT` with
  whatever `sent` currently is, `acked: false`).
- `transmitResponse`: builds `ampRespFrame`, `startTx`, labels `'tx'`, and at `now + txTimeNs`
  (phase 2) flips `sent = true` and relabels `'ampWait'`.
- `closeRound` always cancels both the end-of-round timer and any pending `transmitResponse`
  timer before dropping the round reference — no orphaned timer can fire against a stale round.

## TDD evidence

1. Wrote `tests/engine/amp-sta.test.ts` starting from the brief's bench + 7 tests verbatim.
2. Ran it before `ampSta.ts` existed → failed to resolve the module (`Failed to load url
   ../../src/engine/ampSta`) — confirms the suite exercises code that doesn't exist yet.
3. Implemented `src/engine/ampSta.ts` per the brief's reference.
4. Re-ran → 7/8 passed; one failure (`Cannot read properties of undefined (reading 't')`) in "a
   scheduled trigger assigns the slot by list position". Root-caused it as a genuine arithmetic gap
   in the brief's bench, not a code bug: a 2-entry scheduled `staIds` list makes a 17-byte Trigger
   PPDU (`AMP_HDR_BYTES(5) + AMP_TRIGGER_BODY_BYTES(6) + AMP_STA_ID_BYTES(2)*2 + AMP_FCS_BYTES(2)`),
   whose airtime at 250 kb/s is 746,000 ns — past the test's `run(700_000)` window, so neither the
   Trigger's own `TX_END` nor the slot-1 response's `TX_START` (at `trigEnd + SIFS` = 756,000 ns)
   ever fire. Widened that one test's run window to `900_000` with a comment explaining the byte/time
   math (verified independently with a standalone Node script reproducing `ampTriggerBytes`/`ampDlPpduNs`).
   No other test in the file needed widening — their default-phase triggers (no `staIds`) stay at
   13 bytes / 618,000 ns, comfortably inside `700_000` for every assertion actually made (all of
   which are on `TX_START` times, which land before 700,000 even when the full response airtime
   doesn't).
5. Confirmed the seed-scan tests (slot 2 / slot 1 / slot 3 for a single tag `t1`, ACWE 2, 4 slots)
   all hit within the 200-seed scan — no widening to 2000 needed. Verified independently with a
   standalone Node script reimplementing the `Rng`/`fork` stream: seed 3 → slot 2, seed 1 → slot 1,
   seed 10 → slot 3 (all well under 200).
6. Added four assertions/tests beyond the brief's literal text to give every behaviour bullet
   explicit coverage (see Self-review) — all green on first pass against the implementation above
   with no code changes required, i.e. no adjustment was made to fit these tests to accidental
   implementation quirks.
7. Final run: `npx vitest run tests/engine/amp-sta.test.ts tests/engine/amp-phy.test.ts
   tests/engine/lesson-hashes.test.ts` → 18/18 pass. Full repo suite: 71 files / 637 tests pass.
8. `npx tsc -b` → clean, no output.

## Suites run

- `npx vitest run tests/engine/amp-sta.test.ts` — 10/10 pass.
- `npx vitest run tests/engine/amp-sta.test.ts tests/engine/amp-phy.test.ts tests/engine/lesson-hashes.test.ts` — 18/18 pass.
- `npx vitest run` (full repo) — 71 files, 637 tests, all pass (~37 s).
- `npx tsc -b` — clean.

## Files changed

- `D:\wifi_sim\.claude\worktrees\feat-link-2g\src\engine\ampSta.ts` — new, `AmpStaMac` and `AmpStaCfg`.
- `D:\wifi_sim\.claude\worktrees\feat-link-2g\tests\engine\amp-sta.test.ts` — new, brief's bench +
  7 brief tests + 3 additional assertions/tests (see below).

No changes to `src/engine/amp.ts` or `src/model/frames.ts` — both already carried everything this
task needed (`AmpInfo.ulKbps`, `ampRespFrame`, `AMP_SIFS_NS`) from earlier tasks.

Commit: `cff480f` "feat(amp): AmpStaMac, the triggered-only tag with ABOC slotted access" on `feat/amp-active-tx`.

## Self-review

Checked every bullet in the brief's "Behaviour" list against a specific assertion:

- `onRxStart` labels `'rx'` only from idle, `ampWait` stays a wait during a reception — the
  brief's own slot-2 test already showed one `'rx'` entry (for the Trigger itself); I added
  `expect(... .filter(r => r.state === 'rx').length).toBe(1)` to that same test to positively
  confirm that hearing the closing Ack and the tag's own Ack later (both DL PPDUs, both while
  `'ampWait'`) never emit a second `'rx'`.
- Random-phase ABOC draw, ACW, slot mapping, sit-out (`slot === null`) — covered by the brief's
  first three tests unchanged.
- Determinism per seed — covered by the brief's second test unchanged.
- Scheduled-phase slot assignment by list position, unlisted tag silent, and the exact
  `{aboc: 0, acw: 0, slot}` shape — the brief's test checked `slot` only; I added `toMatchObject({
  aboc: 0, acw: 0, slot })` for both the responding and the waiting scheduled tag.
- Round open with a slot, `endHandle` armed, slot 1 responds immediately, slot ≥ 2 waits — covered
  by the brief's first and fourth tests.
- Ack cascade (`acksSeen === slot - 1` triggers the response, an Ack for this tag's own slot or
  later while unsent means it was skipped) — covered by the brief's fourth test (cascade) and
  fifth test (misaddressed Ack after having sent).
- A round that never closes emits `AMP_RESULT{sent, acked:false}` on its own timer — covered by
  the brief's sixth test, though that test's own comment already flagged it exercises the
  **timeout** path, not `onRxCorrupt` directly, despite its title ("cannot decode the Ack"). I
  added a dedicated test that calls `onRxCorrupt` directly on the tag (obtained via `bench()`'s
  returned `tags` array) while a round is open and unsent, and confirmed: exactly one
  `AMP_RESULT{slot, sent:false, acked:false}`, the label ends `'idle'`, and — running the clock
  far past where the cancelled `transmitResponse` timer would have fired — no `TX_START` and no
  second `AMP_RESULT` ever appears, i.e. `closeRound` actually cancelled both timers, not just the
  one that happened to matter in the brief's own scenarios.
- A new Trigger cancels any open round — none of the brief's seven tests actually exercised this
  (each scenario sends exactly one Trigger). I added a test sending a second Trigger 620 µs after
  the first, while `t1`'s first round (slot 2, no Ack ever sent for slot 1) is still alive on its
  far-future end timer (~3.156 ms); the second Trigger's processing time (~1.238 ms) lands well
  before that abandoned timer would fire. Verified: two `AMP_ABOC` records for `t1` (one per
  Trigger), and exactly one `AMP_RESULT` for `t1` in the end (from the second round's own eventual
  timeout) — never two, confirming the first round's timer was actually cancelled and not merely
  shadowed.
- `transmitResponse` frame construction, `'tx'` label, and the phase-2 `sent = true` /
  `'ampWait'` transition at `now + txTimeNs` — covered by the brief's timing assertions
  (`tx.t === trigEnd + AMP_SIFS_NS`, and slot-2/slot-1 tests keying off exact response end times).
- `setState` emits `MAC_STATE` only on change — implemented identically to `WifiMac.setState`
  (`src/engine/mac.ts:1448`); every `MAC_STATE` assertion across the suite (including the new
  "exactly one `'rx'`" check) depends on this de-duplication holding.

Timers: `closeRound` unconditionally cancels `endHandle` and `txHandle` (guarded by truthy handle,
since handle `0` means "none pending") before dropping the round — verified directly by the two
new tests above, each of which runs the clock well past where an uncancelled timer would have
produced an extra, wrong record.

Test output: both the targeted and full-repo runs show clean vitest summaries (all green, no
console warnings) aside from the expected Windows CRLF `git add` notice at commit time.

## Concerns

- The brief's own "a scheduled trigger..." test bench value (`run(700_000)`) doesn't cover the
  frame airtime its own scenario produces (17-byte scheduled Trigger vs. 13-byte default); I
  widened only that one test's window to `900_000` with a comment, rather than changing the shared
  `bench()` helper's default, so every other test's timing stays exactly as specified.
- I added three tests/assertions beyond the brief's literal text (the `'rx'`-count assertion, the
  scheduled `{aboc:0, acw:0}` shape check, the direct `onRxCorrupt` test, and the
  Trigger-cancels-open-round test) to give full coverage to behaviour bullets the brief's own seven
  tests didn't directly exercise. None of them required any change to `ampSta.ts` — they passed
  first try against the brief's reference implementation as written.
