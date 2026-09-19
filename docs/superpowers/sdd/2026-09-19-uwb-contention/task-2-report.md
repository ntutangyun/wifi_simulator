# Task 2 — contention-based response slots: behaviour, records, view, log, inspector, editor

Slice 4 of the UWB plan, task 2 of 4. Task 1 (7abebde) had already added the config
(`UwbSessionCfg.schedule | contentionSlots | maxAttempts`), the plan fields, the `anchor: -1`
`slotAction` for a contention response slot, and the contention Poll's IEs. This task makes the
devices actually do it.

## Design

### The draw (anchor)

`UwbDevice` gains one persistent field, `attemptsLeft`, initialised to `cfg.maxAttempts` (a new
`UwbDeviceCfg` field the network fills from the session). It survives across rounds; everything
else about a round still lives in `RoundState`.

On decoding the Poll of a contention round (`onRxOk`, `case 'uwbPoll'`), an anchor calls
`drawContentionSlot`:

- `attemptsLeft === 0` → emit `UWB_CONTEND { slot: null, attempt: 0 }`, set
  `attemptsLeft = maxAttempts`, draw nothing, stay silent for the round.
- otherwise → `slot = 1 + rng.int(contentionSlots - 1)`, record it in `RoundState.contendSlot`,
  emit `UWB_CONTEND { slot, attempt: maxAttempts - attemptsLeft + 1 }`, and answer there with the
  ordinary SS response (RRTI as before).

**Draw order.** The draw is the *last* use of the anchor's RNG stream in that reception: `onRxOk`
already spends one `gaussian` for the receive-timestamp noise and one for the residual CFO before
the `switch`, and the draw sits inside the `switch`. That order is deliberate and is commented in
the code — it keeps a time-scheduled round's consumption of the same stream exactly as it was, so
`schedule: 'time'` runs are unchanged to the byte (the lesson-hash fixture confirms it).

### The feedback loop (model)

SS-TWR gives a responder nothing back: the exchange ends at the tag. The standard says only that
filtering a ranging result is the upper layer's business (§10.32.1 NOTE). The model closes the
loop at the round boundary, in the network:

- `UwbDevice.endRound(heard = false): string[]`. A **tag** solves its fix, emits `UWB_ROUND_END`
  as before, and now returns the ids of the anchors it ranged this round.
- `UwbNetwork` calls the tag's `endRound()` first (it always headed the crowd, so record order is
  unchanged), builds a `Set` from the result, then calls each anchor's `endRound(heard.has(id))`.
- An **anchor** that actually drew a slot this round (`contendSlot !== null`) sets
  `attemptsLeft = maxAttempts` when heard and `attemptsLeft - 1` when not. An anchor that sat the
  round out, or that never heard the Poll, changes nothing — otherwise a sit-out would itself cost
  an attempt and the anchor would come back at attempt 2 instead of 1.

Result: with `maxAttempts` 3 an unheard anchor cycles `attempt 1, 2, 3, sit-out, 1, 2, 3, …`,
verified directly in the tests.

### The response window (tag, network)

The network is untouched in the slot loop: `slotAction` still returns
`{ kind: 'uwbResp', tx: 'anchor', anchor: -1 }` for every slot of the window, and `onSlot` is
still called on the whole crowd at every slot boundary (the invariant the deadlines rest on).
`UwbDevice.onSlot` branches before resolving `peers.anchors[action.anchor]`:

- anchor → transmit iff `r.contendSlot === slot`, otherwise receiver off;
- tag → `listenOpen(slot)`: an `Expectation` with `from: null` and a new `open: true` flag.

`open` does two things. `onRxOk` accepts a frame from *any* sender when `exp.from === null` (the
tag does not know who drew the slot). `closeSlot` emits **no** `UWB_TIMEOUT` for an open slot: an
empty contention slot is the ordinary outcome of the draw, and there is no peer the record could
name. (Anchors still time out on a missed Poll exactly as before.)

### Collisions at the tag

Nothing was needed in `channel.ts`: the existing rule already dooms both receptions within
`UWB_CAPTURE_DB` = 6 dB and captures the stronger beyond it. What the tag adds is one record.
`onRxFail(from, 'collision')` in a contention round emits
`UWB_CONTEND_COLLISION { node: tag, slot }`, **keyed on the slot** (`RoundState.contendCollisionSlot`),
so two mutually-doomed answers are one record, not two.

A captured slot still emits it: the weaker answer *was* lost. That is stated in the record's
doc-comment, in the inspector hint and in both languages of the i18n string, because it is the one
place the count could be misread.

### Records, view, log, inspector, editor

- `UWB_CONTEND { node; slot: number | null; attempt: number }` and
  `UWB_CONTEND_COLLISION { node; slot }` in `src/uwb/records.ts`; both delegated by `fmtRecord`.
- `UwbNodeView.contend: { slot; attempt } | null` (anchors) and `contendCollisions: number`
  (tag). `contend` is the *latest* draw and is never cleared — an anchor sees no `UWB_ROUND_END`.
- Log lines, exactly as specified:
  `anc-2 contends: slot 5 (attempt 2)` / `anc-2 sits out this round` /
  `tag-1 contention collision in slot 5`.
- Inspector: a "contention draw" row on an anchor when `contend !== null`, and a "slots collided"
  row on a tag when `contendCollisions > 0` — so a time-scheduled session's panel is untouched.
  The text comes from `uwbContendText` in `src/uwb/ui/rows.ts` (pure, tested), EN + ZH.
- Editor (`UwbSessionFields`): a schedule select (disabled unless the method is SS-TWR) plus
  "Response slots" (2…32) and "Attempts" (1…10), both disabled unless the schedule is contention.
  Picking DS-TWR in the method select also patches `schedule: 'time'`, so the editor can never
  leave the plan in the pair the schema rejects.

## Measurements

Six anchors on a 5 m circle around one tag at the origin, SS-TWR, contention, `maxAttempts` 3,
400 µs slots, one round per block, seed 7, **exactly 30 rounds**. These are the numbers the
lesson may quote.

| S (response slots) | responses heard | per round | analytic N·(1−1/S)^(N−1) | collision slots | sit-outs | position fixes |
|---|---|---|---|---|---|---|
| 4  | 50  | 1.67 | 1.42 | 45 | 20 | 5  |
| 8  | 90  | 3.00 | 3.08 | 36 | 8  | 19 |
| 16 | 125 | 4.17 | 4.35 | 25 | 4  | 25 |

Round duration per variant: (1 + S) × 400 µs — 2.0 ms at S = 4, 3.6 ms at S = 8, 6.8 ms at S = 16.

Per-round response counts (the first rounds the lesson can pin):

- S = 4: `1,0,3,2,3,2,3,2,2,2,…`
- S = 8: `1,1,4,3,4,1,1,1,2,3,…`
- S = 16: `2,4,4,4,4,4,3,4,6,4,…`

Note the direction of the deviation from the analytic model: the measurement runs **above** the
formula at S = 4 and slightly **below** it at S = 8 and 16. The formula assumes all six anchors
contend in every round; the retry rule means an anchor that has just burned its budget sits the
next round out, which thins the field and helps the survivors — that effect is largest exactly
where collisions are most common (20 sit-outs at S = 4 against 4 at S = 16). The test asserts the
measurement within ±0.5 responses/round of the formula and comments the reason.

**Uniformity.** One anchor (always heard, therefore always at attempt 1), S = 8, 200 rounds:
histogram `[14, 24, 32, 22, 30, 29, 20, 29]` over slots 1…8, χ² = **10.48** on 7 degrees of
freedom (the 99.9 % point is 24.3). The test uses a loose bound of 30. Two runs of the same
scenario produce identical draws.

**Collision / capture.** Two equal-power anchors with S = 2 collide in round 0 (both draw slot 2):
two `RX_FAIL collision` at the tag, one `UWB_CONTEND_COLLISION`, no `UWB_RANGE`, both anchors
advance to attempt 2. Raising one anchor 10 dB (clear of the 6 dB margin) in the same seeded
scenario turns that round into exactly one range, to the loud anchor, with one `RX_FAIL collision`
for the quiet one and one `UWB_CONTEND_COLLISION`.

## Deviations from the brief

- **Collision counting in the view.** The brief offered two options; the dedicated
  `UWB_CONTEND_COLLISION` record (emitted by the tag device) was taken, as the controller ruled,
  so the reducer never has to know which session schedule a lane is in.
- **`UWB_CONTEND_COLLISION` in a captured slot.** Not spelled out in the brief. It is emitted: an
  answer was lost. Documented in three places.
- **Method select side-effect.** `method: 'ds'` also resets `schedule: 'time'`. Not in the brief;
  without it the editor can produce a scenario its own schema rejects, with the fix two fields
  away.
- **No forced-collision seed search was needed.** The default scenario seed (7) already collides
  in round 0 with two anchors and S = 2, so the tests are plain deterministic assertions rather
  than a search.
- **The `open` flag** lives on `Expectation` alongside `from: string | null`, rather than being
  inferred from `from === null`, as the brief asked.

## Verification

- `npx tsc -b` — clean.
- `npx vite build` — clean.
- `npx vitest run` — **103 files, 1225 tests, all green**, `tests/engine/lesson-hashes.test.ts`
  included, so every time-scheduled lesson run is byte-identical to before.

New tests: `tests/uwb/network.test.ts` (+8 across four describes: window shape and Poll IEs,
mutual collision, attempt/sit-out cycle, no timeout for an empty slot, capture, uniformity,
determinism, time-schedule invariance, and the three six-anchor variants),
`tests/uwb/view.test.ts` (+1), `tests/ui/uwb-format.test.ts` (+3 plus the delegation cases),
`tests/uwb/inspector-rows.test.ts` (+2), `tests/editor/uwb-planOps.test.ts` (+2).
