# Task 5 review — the UWB channel (commit 54d95a1)

Reviewed: `src/uwb/channel.ts` (new, 218 lines), `src/engine/propagation.ts` (+`wallsCrossed`),
`tests/uwb/channel.test.ts` (new, 11 tests), `tests/engine/propagation.test.ts` (+3 tests).
Working tree was at 54d95a1 and clean when the review started; Task 6's `tests/uwb/session.test.ts`
appeared part-way through and was ignored.

## Verification run

- `npx vitest run tests/engine/lesson-hashes.test.ts tests/engine/propagation.test.ts tests/uwb/channel.test.ts`
  → 3 files, 24 tests, all pass. The lesson-hash fixture is untouched in the diff and still matches,
  so the `wallsCrossed` extraction is bit-identical for Wi-Fi.
- `npx vitest run tests/engine tests/course` → 57 files, 601 tests, all pass (the only other consumer
  of `wallLossDb` is `src/course/widgetModel.ts`).
- `npx tsc -b` → exit 0.
- `grep` for `any` / `as any` / `@ts-ignore` / `@ts-expect-error` in the three source files → none.
- `grep` for `engine/channel` under `src/uwb/` and `tests/uwb/` → none. No CCA, NAV, SINR or noise
  floor is reachable from the UWB channel.

Beyond running the shipped tests I built a throwaway probe (since deleted; the tree is clean again)
to attack the determinism questions directly — results are folded into findings 1–3.

## Interface conformance

| Brief | Code | |
|---|---|---|
| `UwbRxInfo { rssiDbm, propNs, nlosNs, nlos, txStartNs, txPpm }` | channel.ts:27–38 | exact |
| `UwbRadio { listening, onRxStart, onRxOk, onRxFail }` | channel.ts:40–45 | exact |
| `UwbChannel(q, now, nodes, walls, cfg, ppmOf, emit)` | channel.ts:82–92 | exact; `cfg` typed as the named `UwbChannelCfg` (explicitly allowed) |
| `register` / `distanceM` (3-D) / `rssiDbm` / `nlosNs` / `transmit` | channel.ts:94, 106, 113, 128, 139 | all present, no extra public surface |
| `rssiDbm = txPowerDbm − uwbPl0Db(ch) − 10·UWB_PL_EXP·log10(max(d,0.1)) − wallLossDb` | channel.ts:117–120 | term for term |
| `nlosNs` = Σ `UWB_NLOS_NS[material]` over crossed walls, openings exempt, 0 when `cfg.nlos` false | channel.ts:128–133 | exact; opening exemption comes from the shared `wallsCrossed` |
| TX_START now, TX_END at `+txTimeNs` phase 2, deliveries at `now + ceil(d/c)` phase 1 | channel.ts:141, 143, 150, 160 | exact |

Reception rules (channel.ts:178–216) match the brief clause by clause: not registered → nothing;
not listening → nothing; `rssi < UWB_RX_SENS_DBM` → nothing; otherwise `RX_START` + `onRxStart` and a
reception ending at `arrival + txTimeNs`; doomed → `RX_FAIL {reason:'collision'}` + `onRxFail`,
otherwise `RX_OK` + `onRxOk(from, frame, info)`. The `'collision'` literal is typed as `RxFailReason`,
which is a member of the union in `src/model/records.ts:10`.

Test coverage matches the brief's list item for item: 17 ns / 67 ns arrival deltas, `propNs ≈ 16.678`,
`RX_OK` at `RX_START + txTimeNs`, one `TX_START` and `TX_END` at `+txTimeNs`, the 40 m / channel 9 /
−14 dBm sensitivity cut-off with no record at all, brick wall costing exactly 12 dB with
`nlosNs === 2.0` / `nlos === true` and `0` / `false` under `cfg.nlos = false`, the non-listening
radio, 10 dB → capture and 3 dB → mutual collision. Two cases beyond the brief (clear-path LOS,
late dominant arrival capturing an open reception) are welcome.

## Verdict

Spec: APPROVED
Quality: APPROVED

No blocking findings. Six minor / informational items below, none of which need to hold up Task 6.

## Findings

1. **(minor, informational — the arrival-buffer design is sound)**
   `src/uwb/channel.ts:156–161`, `170–176`. I attacked the three failure modes the design invites and
   none of them fire:
   - *Two flush events for one instant.* `pending.get(at)` is falsy only before the first arrival at
     `at` **or after `deliver(at)` has already run and deleted the key**. The second case is reachable
     only when a transmit is issued at instant `t` with `ceil(d/c) === 0`, i.e. exactly co-located
     nodes, from inside a phase-1 callback at `t`. Even then it is benign: the new event is pushed at
     `(t, 1, higher seq)` and pops next, and a stale duplicate finds `?? []` and no-ops because
     `deliver` deletes the key before iterating. Probed the co-located path (`d = 0`,
     `propNs = 0`, arrival in the transmit instant): single `RX_START` at t=0, `RX_OK` at
     `t = txTimeNs`, no duplicate delivery.
   - *Buffer cleared correctly.* `deliver` reads then deletes (line 171–172) before any `startRx`
     re-entry, so an arrival scheduled from inside a callback cannot be silently swallowed into a
     batch that is already being drained.
   - *Flush racing a phase-1 event a receiver depends on.* The only competing phase-1 event at a given
     instant is `endRx` (line 199). A flush for instant `E` is scheduled at the transmitter's `now`;
     the `endRx` for a reception ending at `E` is scheduled at that reception's arrival instant
     `S = E − txTimeNs`. The flush can therefore precede the `endRx` only if the transmit was issued
     at or before `S`, which requires `ceil(d/c) ≥ txTimeNs` — ≈48 km at the shortest possible HRP
     PPDU (the SHR alone is ~73 µs; the poll used in the tests is 197 628 ns → 59 km). Unreachable in
     any real scenario, so a frame arriving exactly as another ends deterministically does **not**
     collide. Probe confirms: with the queue drained in time order the boundary gives
     `start:p, ok:p, start:q, ok:q`. **No action needed** — but see finding 2 for the caveat.

2. **(minor)** `src/uwb/channel.ts:139–163` — `transmit()` is only correct when the caller's `now()`
   is the queue's current time and the queue has been drained in time order up to it. If a caller
   jumps `now` forward and transmits before the intervening events have run, the flush for the later
   instant gets a *lower* seq than the `endRx` those pending events would have scheduled, and a frame
   arriving exactly at another's end collides instead of succeeding (probe: same scene gives
   `fail:p:collision, fail:q:collision` undrained vs. two `RX_OK`s drained). That is the engine's
   normal contract so it is not a defect, but `tests/uwb/channel.test.ts:203–205` (`setNow(1000)` then
   `transmit` without running the queue) sets a precedent that invites it. *What to do:* optional —
   add a sentence to the `transmit` doc comment stating the precondition ("call at the queue's current
   instant"), so Task 6 and later mobility work do not build on the loose pattern.

3. **(informational — outcome determinism verified)** `src/uwb/channel.ts:189–194`. The capture loop
   evaluates each unordered pair of overlapping receptions exactly once and the doom decision for a
   pair depends only on that pair's two powers, so the doomed *set* is independent of the order
   arrivals are started in; the exact-tie path (`>=` picks `rx` as strong, margin 0 < 6 dB) dooms both,
   as it must. Probed a 3-way pileup (−14 / −20 / −24 dBm at one listener) across three different
   `transmit()` call orders and across reversed registration order: identical outcomes
   (`ok:p`, `fail:q:collision`, `fail:r:collision`) every time. The `Map` iteration at line 145 only
   affects the seq of flush events at *distinct* instants, which the queue then orders by time.

4. **(minor)** `src/uwb/channel.ts:173–174` vs the brief's "same-instant arrivals processed strongest
   first, then by transmitter id": the sort keys are `rxId`, then descending RSSI, then `from`. Within
   any one receiver the brief's order holds exactly; the leading `rxId` key only groups the record
   stream per receiver instead of interleaving receivers. Deterministic and arguably nicer to read on a
   timeline. *What to do:* nothing — noted so a future reader does not mistake it for a deviation.
   (`localeCompare` without a locale argument is the same idiom `src/engine/channel.ts:226` already
   uses, and here it can only reorder records, never change an outcome, because equal-RSSI arrivals
   doom each other regardless of order.)

5. **(minor)** `tests/uwb/channel.test.ts:35` — the harness always passes `ppmOf = () => 0`, so
   `info.txPpm` is never asserted and a plumbing slip (`ppmOf(rxId)` instead of `ppmOf(from)`, or a
   hard-coded 0) would pass every test. The code at `src/uwb/channel.ts:154` is correct today.
   *What to do:* one assertion with `ppmOf = (id) => (id === 't' ? 12 : -7)` and
   `expect(info.txPpm).toBe(12)`. Cheap insurance for Task 6, which builds its clock-offset estimate
   on exactly this field.

6. **(minor)** `tests/uwb/channel.test.ts:11–12, 87` — the `node()` helper hard-codes `z: 0`, so
   `distanceM`'s documented 3-D behaviour (the whole point of the "anchors on a ceiling, tag at hip
   height" comment at `src/uwb/channel.ts:105`) is never exercised through the channel; only
   `rxPowerDbm`'s 3-D distance is covered, in `tests/engine/propagation.test.ts`. *What to do:* add a
   `z` parameter and one 3-4-5 case (`distanceM` ≈ 5 for a node at `(3, 4, 0)` vs `(0, 0, 0)` with a
   z offset), and confirm the RSSI drops accordingly.

## Notes for Task 6 (not findings)

- Arrival instants are `ceil(d/c)`, so the event clock and `info.propNs` (the unrounded float) differ
  by up to 1 ns. The ranging engine must take the flight time from `info.propNs`, never from
  `RX_START.t − TX_START.t`, and must add `info.nlosNs` itself — the channel deliberately does not
  delay delivery by the excess, per the brief.
- The channel never fails an open reception when a radio stops listening mid-frame (half-duplex,
  `src/uwb/channel.ts:181` gates only at arrival). A node that starts transmitting during a reception
  will still get `RX_OK` from the channel; suppressing that is the device's job, as the report states.
- `register()` does not validate that the id exists in `nodes`; the failure surfaces later as the
  `posOf` throw at `src/uwb/channel.ts:101` during the next `transmit`. Acceptable, just louder if it
  ever bites.
- The `nlos = nlosNs > 0` choice (`src/uwb/channel.ts:154`) is consistent with the brief: `nlosNs` is
  specified as "0 when nlos is off or no wall", and reporting LOS when the ray passes through a door
  (no loss, no excess delay) or when `cfg.nlos` is off is the only reading that keeps the two fields
  from contradicting each other. Assessed and accepted.
