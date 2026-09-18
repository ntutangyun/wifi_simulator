# Task 5 report — `AmpApRound`, the `WifiMac` hooks and the simulation wiring

Commit: `2e3f178` on `feat/amp-active-tx` (parent `cff480f`).

## What was built

**`src/engine/ampAp.ts` (new).** `AmpApRound` owns the round timeline and nothing
else — it touches the MAC only through `deps.transmit`, `deps.emit`,
`deps.q.schedule` and `deps.done`:

- `start()` — bumps the Session ID (1..255), and with `protection: 'ctsSelf'`
  transmits a CTS-to-self (`src = dst = ap`, 6 Mb/s, `durationFieldNs =
  roundNs() + timing.sifsNs`, `txTimeNs = txTimeNs(CTS_BYTES, 6) +
  signalExtNs`) then schedules the trigger at its end + `timing.sifsNs`;
  with `'none'` it triggers immediately.
- `sendTrigger(phase, staIds)` — `reading = phase === 'scheduled' ||
  readMode === 'inline'`, `slots = phase === 'scheduled' ? staIds.length :
  cfg.slots`, `slotNs = ampUlPpduNs(ulKbps, ampRespBytes(reading))`, emits
  `AMP_ROUND { untilNs: now + trigger air + phaseAirNs }`, counts a round
  (random phase only), clears `heard`/`received`, transmits and schedules
  slot 1 at trigger end + `AMP_SIFS_NS`.
- `slotStart(k)` — emits `AMP_SLOT { slot, untilNs: now + slotNs }` and
  schedules the Ack at slot end + `AMP_SIFS_NS`.
- `sendAck(k)` — `ampAckFrame(ap, received.get(k) ?? ap, dlKbps, k,
  signalExtNs)`; next slot at Ack end + `AMP_SIFS_NS`, or `phaseDone()` at
  Ack end (queue phase 2, so the channel has already ended the PPDU and the
  MAC can start its post-round backoff at that same instant).
- `phaseDone()` — twoPhase + random + something heard → scheduled trigger at
  now + `AMP_SIFS_NS`; otherwise `active = false` and `deps.done()`.
- `phaseAirNs(slots, reading)` = `slots × (slot + 2·AMP_SIFS + Ack)`;
  `roundNs()` = random trigger air + first phase + (twoPhase: `AMP_SIFS` +
  a worst-case scheduled trigger listing `cfg.slots` ids + a full reading
  phase), so the CTS Duration is an upper bound in both read modes.
- `onRxOk` / `onRxFail` keep `stats { rounds, responses, failedSlots,
  readings, discovered }`.

**`src/engine/mac.ts`.** Exactly the hooks the brief specifies: `WifiMacCfg.ampAp`,
`readonly ampRound`, `private ampPending`, the constructor building the round
and arming `scheduleAmpPoll(0)`, `inExchange`, `hasWork`, `hasFrame`, the
`transmitFor` branch right after `purgeExpired` (no `beginTxop`, so the round is
exempt from the BK TXOP limit), `onOwnTxEnd`, the `onRxOk` AMP branches,
`onRxCorrupt`, `onAmpDone`, `refreshState`. One hook beyond the brief — see
Deviations.

**`src/engine/simulation.ts`.** Tags become `AmpStaMac`s registered as `kind:
'tag', cca: false` radios and land in a new `readonly tags: Map<string,
AmpStaMac>` (never in `macs`); the AP's 2.4 GHz MAC gets `ampAp` when the link
carries tags and `ampCapable` on its radio; `reachable`, `ulBacklog` and the
shared MLD queues exclude tags.

## TDD evidence

1. `tests/engine/amp-ap.test.ts` written first (the brief's file, with the two
   adjustments below). First run: **6 failed / 1 passed** — every AMP assertion
   failed (`cts` undefined, no `AMP_ROUND`, `rounds.length 0 >= 7`, no scheduled
   trigger, no slots for the camera to land in). The snapshot/replay test passed
   vacuously at that point because no AMP records existed yet.
2. Implemented `ampAp.ts` + hooks + wiring → **6 passed / 1 failed**: the
   ctsSelf+camera run threw `ap startTx while transmitting` from
   `AmpApRound.sendAck`. Root cause (diagnosed, not guessed): when the AP's
   CTS-to-self collides with a same-instant camera transmission the camera never
   takes the NAV, transmits inside the round, and the AP's `scheduleResponse`
   armed a SIFS ACK that fired on top of the round's next AMP Ack. Fixed by
   refusing SIFS responses while a round is active.
3. Final: `npx vitest run tests/engine/amp-ap.test.ts` → **7/7**.

## Suites run

- `npx vitest run tests/engine` → **42 files / 257 tests, all green**
  (including `lesson-hashes.test.ts` and `mac-state-ifs.test.ts`).
- `npx vitest run` (whole repo) → **72 files / 644 tests, all green**.
- `npx tsc -b` → clean, exit 0.
- Test output is pristine (no stray logs, no unhandled errors).

## Files changed

- `src/engine/ampAp.ts` (new, 180 lines)
- `src/engine/mac.ts` (+70/−6)
- `src/engine/simulation.ts` (+24/−4)
- `tests/engine/amp-ap.test.ts` (new)

## Self-review

Checked with a throwaway invariant test (four variants — inline, twoPhase,
`protection: 'none'` + camera, ctsSelf + camera; `pollIntervalMs: 20`, 300 ms
each; deleted afterwards, not committed):

- **Round timeline.** Asserted in the committed test: slot 1 = trigger end +
  10 µs; Ack = slot start + `slotNs` + 10 µs; slot 2 = Ack end + 330 µs + 10 µs;
  slots `[1,2,3,4]`, Acks `ackFor [1,2,3,4]`, all Acks one distinct `txTimeNs`
  (they are all `ampAckFrame(..., cfg.dlKbps, ...)`, i.e. the trigger's rate).
  The invariant run additionally confirmed, for **every** round of all four
  variants, that the number of Ack `TX_END`s equals the announced `slots` and
  that the last Ack's `TX_END` lands exactly on `AMP_ROUND.untilNs`.
- **Ack ids.** Committed test: every Ack's `dst` is the tag whose `ampResp`
  decoded in that slot, else `'ap'`, and at least one Ack names a tag.
- **CTS Duration covers the round.** `ctsEnd + durationFieldNs` ≥ the last Ack's
  end and within 20 µs of it (it is exact for inline: 0 ns of slack). For
  twoPhase it is an upper bound by construction (worst-case scheduled phase).
- **Rounds repeat at `pollIntervalMs`.** ≥ 7 random-phase rounds in 400 ms at
  50 ms spacing, each ≥ 50 ms after the previous; both tags get acknowledged.
- **No AP `ampWait`.** Zero `MAC_STATE ampWait` records on `ap#2g` in all four
  variants, and — scanning the record stream in emission order — zero AP
  `MAC_STATE` other than `tx`/`waitAck` strictly inside any round window, so the
  view reducer never clears `ampRound` mid-round. Tags do reach `ampWait`.
- **Replay equals live.** The committed snapshot/replay test rebuilds the view
  at 120 ms from the ≤120 ms snapshot plus records and matches a fresh live run.
- **No behaviour change without `ampAp`.** `lesson-hashes` and the full suite
  are unchanged; the only unconditional edits for non-AMP scenarios are
  `ch.register(..., { ampCapable: false })` (the previous default) and the
  `ulBacklog` `kind === 'sta'` filter (tags are the only non-`sta` non-`ap`).

## Deviations from the brief (and why)

1. **`slotNs` in the second test: 272 000 → 528 000 ns.** The brief's timeline
   says `reading = phase === 'scheduled' || cfg.readMode === 'inline'`, and the
   default scenario is `readMode: 'inline'`, so the random phase's responses
   carry a reading: 15 octets → `ampUlPpduNs(250, 15) = 528 µs`. 272 µs is the
   id-only (7-octet) response. Task 10's brief ("response 528 µs (inline
   reading, 15 octets)") and Task 11's ("the scheduled trigger's slots use
   528 µs (reading) while the random phase's use 272 µs (id only)") confirm the
   timeline, so the two 272 000 literals in that one test were stale fixtures.
   Changed in the test only (two places); the Ack's 330 000 ns is unaffected.
2. **The last test is `async`-free with static `cloneView`/`applyRecord`
   imports**, as instructed.
3. **The twoPhase test asserts fully** instead of the brief's early return: with
   seed 7 the first round always hears at least one tag, so `sched` is found; I
   kept an explicit `expect(sched).toBeDefined()` so a future regression fails
   loudly instead of silently skipping. The camera geometry, seed and run
   lengths of the 'protection none' test are the brief's, unchanged — the
   camera does start inside a slot (empty slots, where no tag drew that ABOC,
   leave the medium genuinely idle).
4. **One MAC hook beyond the brief:** `scheduleResponse` returns immediately
   while `ampRound.active`. Without it the AP answers a Wi-Fi frame that talked
   over a slot with a SIFS ACK, which (a) throws `startTx while transmitting`
   when that ACK lands on the round's next AMP Ack and (b) would emit a
   `sifsResp` `MAC_STATE`, clearing the view's round mid-flight. The AP owns the
   medium for the round and its radio is committed to the round's own Ack
   schedule, so the intruding frame goes unacknowledged and is retried by its
   sender — which is what the 'protection none' test is about.
5. **`AmpApRound.sendAck` resets `current = 0`** after a slot closes (the brief
   only sets it in `slotStart`). It makes `stats.failedSlots` count corrupted
   receptions *inside* a slot rather than anything that fails in the Ack gap
   too. The response always resolves at the slot's end (its PPDU is exactly
   `slotNs` long), before the Ack fires 10 µs later, so no response is missed.

## Concerns / notes for later tasks

- `stats` is populated but nothing reads it yet (Tasks 10–12 will).
- With `pollIntervalMs` shorter than a round, polls that fire inside a round
  stay pending and the next round starts right after `onAmpDone`, so rounds can
  be back-to-back rather than exactly `pollIntervalMs` apart. The committed test
  only asserts the spacing is ≥ `pollIntervalMs`, which holds.
- The AP still takes a NAV from a Wi-Fi frame overheard during a round; it only
  delays the post-round backoff, never the round itself (the round's timers are
  unconditional), so it seemed more faithful than suppressing it.
- `AMP_ROUND.untilNs` for a twoPhase round covers that phase only; the CTS
  Duration (not the record) covers both phases.

---

# Fix round 1 — review findings

Commit: `5ff11e6` "fix(amp): reset AC_BK contention after a round; align
ampCapable and the view's received list" (5 files; the concurrently modified
`src/model/frameFields.ts`, `src/ui/FrameDetail.tsx`, `src/ui/i18n.ts`,
`tests/model/frameFields.test.ts` belong to another task and were left
unstaged — everything was staged by path).

## 1. AC_BK's CW was never reset after a successful round (important)

`onAmpDone` in `src/engine/mac.ts` now calls `this.resetQsrc(e)` between
`e.backoff = null` and `e.needDraw = true`. A completed round is a successful
exchange sequence, so CW → CWmin and QSRC → 0 per §10.23.2.2, exactly as an
acknowledged frame does. This is a defect in the brief's own `onAmpDone` text
(controller ruling: fix it).

Reproduced before fixing. Probe over 1 s of an AP polling two tags while one
2.4 GHz station ran downlink video (AC_VI at the AP) plus a saturated uplink:
3 `INTERNAL_COLLISION`s with `loserAc: 0`, AC_BK's CW walking 31 → 63 → 127 and
staying at 127 for the rest of the run — the reviewer's finding, one CW step
further along. A station with video alone produced no internal collision at all
(the AP's AC_VI queue drains before AC_BK is ever ready at the same instant);
the saturated stream is what freezes both EDCAFs together so they resume and
reach zero on the same slot boundary. That is why the covering test uses
`profiles: ['video', 'saturated']` on one station rather than video alone.

New test — `tests/engine/amp-ap.test.ts` › "a finished round resets AC_BK's
contention window, even against higher-AC traffic": 1 s, `pollIntervalMs: 20`,
two tags plus that station. It asserts the premise (>20 rounds and at least one
`INTERNAL_COLLISION` with `loserAc === 0`, so the scenario really does bump
AC_BK) and then, for every round, that the first `CW_CHANGE` on `ap#2g` with
`ac: 0` at or after that round's last Ack `TX_END` reports `{ cw: 15, qsrc: 0 }`.
Rounds still running when the batch ended are skipped.

TDD: written first, failed with `expected { Object (t, type, ...) } to match
object { cw: 15, qsrc: +0 }`; passes after the one-line fix.

## 2. `ampCapable` unified with the MAC's `ampAp` condition (minor)

`src/engine/simulation.ts` computes one boolean next to `edca`:

```ts
const polls = n.kind === 'ap' && link === '2g' && !!n.ampAp && members.some((m) => m.kind === 'amp')
```

used for both `ampAp: polls ? n.ampAp : undefined` and
`ch.register(n.id, mac, { ampCapable: polls })`. Previously the radio was
`ampCapable` even on a link with no tag to poll.

## 3. The view's `received` list now matches the round's tally (minor)

`src/model/view.ts`, `RX_OK` case: an `ampResp` is listed only when
`r.frame.amp?.slot === n.ampRound.slot` and the sender is not already listed —
the same rule as `AmpApRound.onRxOk` (which ignores a response carrying another
slot's number and a second response in the slot it is in).

The existing view test needed no change (it never emitted an `ampResp` `RX_OK`,
so its `AMP_SLOT` sequencing was not relying on the old behaviour). New test —
`tests/model/view.test.ts` › "the AP lane lists only the responses its round
counts: the current slot, once per tag": a response in slot 1 is listed; a
duplicate from the same tag and a response stamped slot 3 while the round is in
slot 1 are both ignored; after `AMP_SLOT 2` the slot-2 responder is appended.

## Commands and output

- `npx vitest run tests/engine/amp-ap.test.ts tests/model/view.test.ts tests/engine/lesson-hashes.test.ts tests/engine/simulation.test.ts`
  → **4 files / 35 tests passed** (amp-ap 8, view 20, lesson-hashes 1,
  simulation 6).
- `npx vitest run tests/engine tests/model` (wider check, avoiding the
  concurrently edited UI suites) → **51 files / 340 tests passed**.
- `npx tsc -b` → clean, exit 0.
- Output pristine; the two throwaway probe/invariant test files were deleted.

Nothing else was touched; the other review minors stay parked.
