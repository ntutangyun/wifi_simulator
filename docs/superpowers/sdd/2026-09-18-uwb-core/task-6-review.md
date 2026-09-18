# Task 6 review — session schedule, devices, network, Simulation host

Reviewed commit `bf05b35` (diff `54d95a1..bf05b35`) in worktree
`.claude/worktrees/feat-link-2g`, branch `feat/uwb-ranging`. Task 7's
uncommitted UI work was ignored.

Verification run by the reviewer:

- `npx vitest run tests/uwb tests/engine/simulation.test.ts tests/engine/lesson-hashes.test.ts`
  → **10 files, 78 tests, all passing** (exit 0), `lesson-hashes` green with no
  regeneration; the lesson-hash fixture is not in the diff.
- `npx tsc -b` → **clean** (exit 0).

## Verdict

Spec: CHANGES REQUIRED
Quality: APPROVED

One blocking spec deviation (finding 1), seven minor notes. Everything else in
the binding constraint list was checked and holds; the details are below the
findings.

---

## Findings

1. **BLOCKING — `src/uwb/device.ts:299-305`: an anchor sends its Report even
   when the Final did not list it.**
   The brief is explicit: *"Report (anchor i): only if it received the Final
   **and found its entry**"*. `transmitFor`'s `uwbReport` case guards only on
   `rxPollCounter`, `txRespCounter` and `rxFinalCounter` being non-null. Nothing
   records the outcome of the `finalTimes.find(e => e.id === this.id)` lookup in
   `onFinal` (`device.ts:342`), so an anchor that heard the Poll, transmitted a
   Response the tag never received, and then heard the Final still transmits a
   Report.
   *Why it matters:* the path is reachable — `UwbChannel.rssiDbm` uses the
   **transmitter's** `txPowerDbm`, so a tag with more transmit power than an
   anchor gives an asymmetric link (poll heard, response lost); a capture loss at
   the tag does the same. The result is a PPDU on the air the standard would not
   send, plus a `UWB_TS { dir:'rx', frameKind:'uwbReport' }` at the tag that
   produces no `UWB_RANGE` (`onReport` bails on `!p`, `device.ts:353`) — a
   timeline that shows a report with no measurement. No wrong range is produced,
   and no current test covers the case.
   *What to do:* store the lookup result on the round state (e.g.
   `r.finalListedMe = !!entry`, set in `onFinal` before the early return) and add
   it to the `uwbReport` guard. Add a case to `tests/uwb/network.test.ts` with an
   anchor at a lower `txPowerDbm` than the tag so the asymmetry is exercised.

2. **Minor — `src/uwb/device.ts:87-88, 95, 225-226`: `pollCoffs` and `pollFom`
   are written and never read.** Both are set in the `uwbPoll` branch of
   `onRxOk` and no code path consumes them; the anchor's DS `UWB_RANGE` takes
   its `fom` from the *Final* (`device.ts:232, 346`), not from the Poll, and the
   anchor never uses a clock-offset estimate at all (DS-TWR cancels it by
   construction). Either delete both fields, or — if the intent was that an
   anchor's DS range should be scored by the Poll's first-path quality — use
   `r.pollFom` in `onFinal` and say so in a comment. Dead state in a
   `RoundState` that doubles as the lesson's mental model is worth removing.

3. **Minor — `src/uwb/device.ts:33-39`: `UwbDeviceCfg.method` is never read.**
   Every method decision comes from `r.plan.method` (`device.ts:275, 283, 330`),
   which is the right source (the plan is the round's contract). The field is in
   the brief's interface, so leaving it is defensible, but it is a second,
   silently unused copy of the same fact. Drop it, or comment that the plan is
   authoritative.

4. **Minor — concern (a), `src/uwb/device.ts:242-267`: the mechanism is correct
   and deterministic, but the queued deadline it guards is unreachable.**
   I traced it in full. `EventQueue` orders by `(t, phase, seq)` with `seq` =
   insertion order. `UwbNetwork` lays a whole block out in the constructor /
   `startBlock`, so every slot-start event and the round's `endRound` event have
   lower `seq` than any deadline armed later inside a slot. At every slot
   boundary the *next* slot's start (or, for the round's last slot, `endRound`)
   therefore always runs first, and `closeSlot()` at the top of `onSlot`
   (`device.ts:134`) and `endRound` (`device.ts:157`) emits the `UWB_TIMEOUT` and
   cancels the queued handle. I checked each case the brief lists:
   - *missed poll (anchor, slot 0)* — closed by the slot-1 `onSlot`, which every
     crowd member receives whether or not it participates in that slot;
   - *missed response (tag, slot 1+i)* — closed by the slot-2+i `onSlot`;
   - *missed final (anchor, slot A+1)* — closed by the slot-A+2 `onSlot`;
   - *last slot of the round (tag waiting on the last Report)* — closed by
     `endRound`, which the network queues after all of that round's slot events
     and before the next tag's slot 0 (`network.ts:82-92`, `forEach` order), so
     an anchor's `RoundState` is never cleared out from under the next tag's
     round;
   - *round k end == round k+1 start* — `endRound(k)` has the lower `seq`, so it
     runs before `beginRound(k+1)`. Correct. Same for the block boundary:
     `startBlock(b+1)` is queued last in `startBlock(b)`.
   No duplicate `UWB_TIMEOUT` is possible (`closeSlot` nulls `this.expect`
   before emitting) and none can be missed (every armed slot ends in an `onSlot`
   or an `endRound`). A successful RX cancels the deadline through
   `cancelDeadline()` (`device.ts:219, 257`), which clears `expect` *without*
   emitting — so no timeout after a successful RX.
   *What I would do:* the queued
   `q.schedule(slotEndNs, () => this.closeSlot(), 0)` at `device.ts:265` never
   fires. Delete it and make `closeSlot()` the single documented path, with a
   one-line comment in `network.ts` recording the invariant it depends on
   ("every slot of a round is followed by another `onSlot` or by `endRound` at
   the same instant"). That also removes `handle` from `Expectation` and both
   `q.cancel` calls — and with them a slow leak: `EventQueue.cancel` only drops a
   dead handle when it reaches the heap top, so cancelling a handle whose event
   has already run would accumulate in `dead` forever. I would *not* move the
   deadline to a later phase or delay the slot starts: phase 1 is the channel's
   (deliveries would then precede a MAC decision at the same instant, inverting
   the queue's documented contract) and phase 2 is own-TX bookkeeping. Not
   blocking — the current mechanism is right, just belt and braces.

5. **Minor — `src/uwb/network.ts:14`: import cycle
   `uwb/network.ts → engine/simulation.ts → uwb/network.ts`.** It works (the
   binding is a hoisted `function` declaration used only at constructor time)
   and the brief asked for `hashStr` to be exported from `simulation.ts`, but
   `hashStr` is a generic FNV-1a helper with no dependency on `Simulation`. A
   future top-level use of the export in either module would break at module
   evaluation. Move it to a neutral module (`engine/rng.ts`, or a small
   `engine/hash.ts`) and re-export from `simulation.ts` if anything depends on
   that path.

6. **Minor — `src/uwb/device.ts:318-320`: the TX-end self-timer only checks
   `state === 'tx'`.** If a frame's airtime ever exceeded `slotNs`, a stale
   timer from the previous transmit slot would drop the *current*
   transmission's state to `idle` mid-air (the guard cannot tell the two apart).
   Unreachable today (a 60-octet Final is 235 µs against a 2 ms slot) and the
   schema keeps slots long, but the guard is one token from being robust:
   capture the frame (or a monotonic tx id) in the closure and compare.

7. **Minor — `src/uwb/session.ts:41` vs `src/model/scenario.ts:416-417`:
   `roundsPerBlock` is computed twice, in two units, and used nowhere.**
   `roundPlan` computes `floor(blockNs / roundNs)` from the rounded nanosecond
   values while the schema validates the tag count with
   `floor(blockRstu / (slots · slotRstu))` in RSTU. The two can disagree by one
   at a boundary because `rstuNs` rounds. The scheduler never consults
   `roundsPerBlock` (`network.ts` walks `tags.forEach`), so nothing is wrong
   today and the schema is the real gate — but either drop the field or have
   `network.ts` assert `tags.length <= plan.roundsPerBlock`, so the two
   definitions cannot silently drift.

8. **Minor (pre-existing, `src/uwb/channel.ts:214`, noted for Task 7):** the
   channel emits `RX_OK` before calling `radio.onRxOk`, and the device may then
   refuse the delivery (half-duplex, or a frame the slot is not for,
   `device.ts:197, 201`). The timeline can therefore carry an `RX_OK` with no
   following `UWB_TS rx`. Enforcing half-duplex in the device is the right call
   (only it knows its own state), but the UI lane in Task 7 must not read
   `RX_OK` as "a counter was stamped".

---

## Constraints checked and holding

**Schedule (`src/uwb/session.ts`).** `rstuNs` = `round(rstu · 416 · 1000 / 499.2)`
via `RSTU_CHIPS`; `roundPlan` slots = `ss ? A+1 : 2A+2`,
`roundsPerBlock = floor(blockNs/roundNs)`; `slotStartNs =
block·blockNs + round·roundNs + slot·slotNs`; the `slotAction` table matches the
brief exactly for SS and DS, and throws (rather than returning a silent no-op)
for a slot outside the plan. `tests/uwb/session.test.ts` pins all of it.

**Device behaviour.** TX counter is `clock.counter(now + UWB_RMARKER_NS)` with a
`UWB_TS { dir:'tx' }` (`device.ts:271, 313`). RX counter is
`clock.counter(info.txStartNs + UWB_RMARKER_NS + info.propNs,
info.nlosNs + gaussian·tsNoisePs/1000)` — built from `info`, **not** from
`RX_START.t − TX_START.t` (which the channel rounds up with `Math.ceil`) — with
`fom = fomFor(info.nlos)` (`device.ts:210-214`). Draw order is timestamp noise
first, then `coffs` (`device.ts:211, 217`), as specified. SS emits `UWB_RANGE` at
the tag on each Response with both `tofRawRctu` and the corrected `tofRctu`
(`device.ts:330-335`). DS emits on the anchor after the Final (`onFinal`) and on
the tag after each Report (`onReport`) from the same four counters — the report's
measured numbers confirm the two lanes agree to the last digit. A silent anchor
when the Poll was missed (`device.ts:281`), and the Final omits anchors that did
not answer (`device.ts:291-292`). `MAC_STATE` transitions cover
idle/uwbWait/rx/tx through the single `setState` (`device.ts:369`); `listening()`
is false while transmitting (`device.ts:180`); RX is ignored unless the device is
in `uwbWait`/`rx` **and** the frame matches the slot's expectation
(`device.ts:197-205`), so no counter is ever taken from an unexpected PPDU and no
device stamps a frame it transmitted through. `endRound` needs ≥ 3 ranges, passes
`solvePosition` all surveyed anchor positions (the solver intersects them with
the range ids itself, `position.ts:95-101`), emits nothing on `null`, and clears
the round state for both roles (`device.ts:156-176`).

**Things specifically hunted, all clean.** No timeout after a successful RX
(`cancelDeadline` is silent). No transmit while a reception is open that could
still be credited (`onRxOk` refuses in `tx`/`idle`). No stale `rxPoll`: every
round's `beginRound` installs a `freshRound` on the tag *and* every anchor, and
`endRound` nulls it, with the event ordering proved in finding 4. No counters
mixing rounds. `trueDistM` is `ch.distanceM(this.id, peer)` — the right pair, 3-D,
from scenario positions. `UWB_SLOT` is emitted by the tag only
(`device.ts:137-139`). `UWB_POSITION.anchors` is `r.ranges.map(x => x.id)` — the
ids that actually contributed, matching the out-of-range test's
`['anc-1','anc-2','anc-3']`. No `any`, no `@ts-ignore`/`@ts-expect-error`
anywhere in `src/uwb/`; the only casts are `frame.kind as UwbFrameKind`, which
narrows a union the channel guarantees.

**Determinism.** One `root.fork(hashStr(id + '#uwb'))` per node, handed to both
`UwbClock.fromRng` and the device (`network.ts:64-72`); `Rng.fork` does not
advance the parent (`engine/rng.ts:31`), so adding UWB nodes cannot perturb the
Wi-Fi streams. No Map-iteration-order dependence anywhere in the record path:
`crowd` is the array `[tag, ...anchors]`, the Final iterates `r.anchors` (array)
rather than the `peers` Map, `ranges` is an append-ordered array, and the
channel's delivery batch is sorted by `(rxId, −rssi, from)`. The two-run `toEqual`
test passes. (Note: `crowd` puts the tag ahead of the anchors rather than in
strict scenario order — deterministic either way, and it puts the tag's
`UWB_SLOT` first, which reads better.)

**Simulation host.** The whole Wi-Fi wiring is inside `if (ap)` with `ap`
non-asserted; `queuesOf` skips `kind === 'uwb'`; `linkPlanFor` already excludes
UWB nodes (`caps.ts:94, 143`), so no phantom link or MAC is built. `hashStr` is
exported. Snapshots and the emitter stay unconditional. The traffic loop's fork
index is still the index in `sc.nodes`, with the comment the brief asked for.
`lesson-hashes.test.ts` is green and its fixture is untouched by the diff. The
combined Wi-Fi + UWB test compares the full non-UWB record subsequence (minus
`seq`) against `defaultScenario()` alone and they are identical.

**Carry-forward rulings.** `applyRecord` uses `if (applyUwbRecord(vs, r)) return`
with a `default: return false` in the reducer (`view.ts:91`). `makeResp` omits
`replyRctu` for DS via a spread rather than writing `undefined`
(`frames.ts:54-56`).

**Controller rulings (not findings).** `UWB_POSITION` at 20 ms, the three-tag
test at 470 ms, and the 0 ppm raw-vs-corrected bound derived from the CFO
estimator σ are all implemented and asserted as ruled
(`network.test.ts:169, 212, 71-72`).

**Tests.** `tests/uwb/network.test.ts` covers every scene the brief listed plus
the two extra assertions the rulings required; the assertions are specific
(exact slot times, exact 17 ns flight, exact 234 551 ns Final airtime, exact
anchor id lists) rather than smoke tests, and the physics bounds are derived,
not fitted. The added `simulation.test.ts` case asserts `macs.size === 0`, which
is the real content of "no AP".

---

# Re-review (fix round 1)

Scoped to commit `17e614d` (`bf05b35..17e614d`, package
`task-6-fix1.diff`). Task 7's dirty/untracked UI files were ignored; the
reviewed files (`src/engine/hash.ts`, `src/engine/simulation.ts`,
`src/uwb/device.ts`, `src/uwb/network.ts`, `tests/uwb/network.test.ts`) are all
committed and clean in the worktree.

Verification run by the reviewer:

- `npx vitest run tests/uwb tests/engine/simulation.test.ts tests/engine/lesson-hashes.test.ts`
  → **10 files, 81 tests, all passing** (exit 0); `network.test.ts` 19 → 22.
  `lesson-hashes` green with no regeneration and its fixture is not in the diff.
- `npx tsc -b`, with Task 7's in-flight files filtered out
  (`src/ui/`, `src/scene/`, `src/model/frameFields`, `src/uwb/format`,
  `src/uwb/frameFields`, `tests/ui/`) → **no diagnostics** anywhere else.

## Verdict

Spec: APPROVED
Quality: APPROVED

Zero remaining findings; one cosmetic nit, non-blocking, recorded below.

## The seven rulings, checked one by one

1. **Report only when listed in the Final — closed, and the test is a real
   guard.** `onFinal` (`device.ts:352-356`) now sets
   `r.finalListedMe = entry !== undefined` *before* its early returns, and
   `transmitFor`'s `uwbReport` case (`device.ts:304-305`) returns on
   `!r.finalListedMe` ahead of the counter checks. The reordering is sound: the
   old `rxPollCounter === null || txRespCounter === null` guard moved *below* the
   `find`, which is what makes the flag observable, and the flag can never be
   true with a null `rxPollCounter` (an anchor only transmits a Response when it
   heard the Poll, so the tag can only list an anchor that heard it).
   The new test `UwbNetwork — an anchor the tag cannot hear back`
   (`network.test.ts:210-227`) builds the asymmetry I asked for by dropping
   anc-4's `txPowerDbm` to −40 while leaving its position at 5 m, so it hears
   both tag frames (no `UWB_TIMEOUT` at anc-4 — asserted) and answers
   (`txOf('anc-4','uwbResp') === true` — asserted) but its Response never reaches
   the tag, and the Final lists only `['anc-1','anc-2','anc-3']`. **Would it fail
   without the guard?** Yes: with all three counters non-null the old code would
   transmit the Report, so `expect(txOf('anc-4','uwbReport')).toBe(false)` flips.
   (The tag's timeout list is the same either way — the −40 dBm Report would not
   be received — so that assertion is not the guard; the `txOf` one is, and it is
   sufficient.) The test also pins the two consequences that matter: no
   `UWB_RANGE` touching anc-4 at either end, and a fix from three anchors.

2. **Dead state removed.** `pollCoffs`/`pollFom` are gone from `RoundState`,
   `freshRound` and the `uwbPoll` branch, replaced by a comment stating why an
   anchor keeps only the counter. The anchor's DS range still takes the Final's
   `fom`, now deliberately rather than by omission.

3. **`UwbDeviceCfg.method` removed**, with a doc comment on the interface naming
   `RoundPlan` as the one truth; `network.ts:76` no longer passes it. All method
   decisions still read `r.plan.method`.

4. **Queued deadline deleted, `closeSlot()` is the sole path.** `listenFor` no
   longer schedules anything and `Expectation` lost `handle`; both `q.cancel`
   calls are gone, and with them the `EventQueue.dead` accumulation. The
   invariant the mechanism rests on is now written out at `startBlock`
   (`network.ts:82-90`) in the place that guarantees it. I re-checked it against
   the code as it now stands: every slot event and the round's `endRound` are
   queued inside `startBlock` before any of them runs, so every armed slot is
   closed by the next slot's `onSlot` (called on the whole crowd regardless of
   who acts in that slot) or by `endRound`, exactly once, at the slot boundary —
   and `cancelDeadline()` on a successful RX still clears the expectation
   silently. All pre-existing timeout assertions stayed green untouched, which
   is the evidence that the removed timer was indeed never the one firing.

5. **`hashStr` moved, cycle gone.** `src/engine/hash.ts` is dependency-free;
   `simulation.ts` imports it (`:23`) and re-exports it (`:33`);
   `uwb/network.ts:14` imports from `../engine/hash`. Verified by grep: nothing
   under `src/uwb/` imports `engine/simulation` any more, and the only remaining
   importers of `simulation.ts` are `course/widgetModel`, `player/timelineStore`,
   `worker/protocol` and `worker/sim.worker` — none of which `simulation.ts`
   imports back. No new cycle introduced.

6. **TX-end timer guarded by a captured id.** `private txSeq` with
   `const txId = ++this.txSeq` in `send`, and the timer fires only on
   `this.state === 'tx' && this.txSeq === txId` (`device.ts:334-338`). A stale
   timer can no longer idle a later transmission.

7. **`tags.length <= plan.roundsPerBlock` asserted**, in the units the scheduler
   uses, with a message carrying both counts and both durations
   (`network.ts:40-49`), and a direct-construction test (`network.test.ts:229-240`)
   that bypasses the schema: 2 anchors DS = a 12 ms round, a 20 ms block, 2 tags
   → throws `/holds 1 rounds/`. Correct, and it is the right layer: the schema
   still gates real scenarios in RSTU, and this catches drift between the two
   unit systems.

8. Accepted as-is by ruling; no change, none expected. The note stands as
   guidance for Task 7's lane rendering.

## Nothing regressed

All 22 `network.test.ts` cases pass, including the ones that would have caught a
behaviour change from the deadline removal (the out-of-range scene's
`UWB_TIMEOUT` slots and peers, the three-tag block boundaries, the determinism
`toEqual`, and the Wi-Fi + UWB record-subsequence comparison). `lesson-hashes`
is unchanged. The `simulation.ts` diff is import-only plus the removal of the
moved function — the Wi-Fi wiring is byte-identical.

## Remaining nit (not a finding, no action needed)

- `src/uwb/device.ts:274-277`: `cancelDeadline()` is now a single
  `this.expect = null` and there is no deadline left to cancel, so the name
  outlives the thing it named. Its doc comment ("the expected frame arrived:
  drop the expectation without reporting a miss") already carries the real
  meaning; renaming it to something like `clearExpectation()` would close the
  last gap between the name and the mechanism. Purely cosmetic.
