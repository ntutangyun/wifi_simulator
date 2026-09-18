# Task 5 report — the UWB channel

Files: `src/uwb/channel.ts` (new), `src/engine/propagation.ts` (added `wallsCrossed`),
`tests/uwb/channel.test.ts` (new, 11 tests), `tests/engine/propagation.test.ts` (+3 tests).

## What was built

`UwbChannel` with exactly the brief's surface: `register`, `distanceM` (3-D),
`rssiDbm`, `nlosNs`, `transmit`, plus the `UwbRadio` / `UwbRxInfo` interfaces
and a `UwbChannelCfg { channel, nlos }`. Nothing is imported from
`src/engine/channel.ts`: no CCA, no NAV, no SINR, no noise floor.

`transmit(from, frame)`:
- `TX_START` in the caller's own phase, `TX_END` at `now + txTimeNs` in **phase 2**;
- one delivery per other registered radio at `now + Math.ceil(d / C_M_PER_NS)` in **phase 1**,
  so a device deciding at an instant never sees energy that only starts at that instant.

`UwbRxInfo.propNs` is the *float* `d / C_M_PER_NS` (the event clock is integer ns, but the
measurement is not — the ranging engine needs the unrounded flight time), `nlosNs` is the
excess delay, `nlos = nlosNs > 0`, and `txStartNs` / `txPpm` carry what the receiver needs
for its clock-offset estimate.

## Overlap bookkeeping

Per receiver: `open: Reception[]`, each holding `{ from, frame, rssiDbm, info, endNs, doomed }`.

1. **Batched arrivals.** Arrivals are not delivered from the transmitter's own event. They go
   into `pending: Map<Ns, Arrival[]>` keyed by arrival instant; the *first* arrival at a new
   instant schedules one phase-1 `deliver(at)`. `deliver` sorts the whole instant by
   `rxId`, then **descending RSSI**, then transmitter id, and starts them in that order. Two
   frames landing together therefore resolve by power, never by the order `transmit()` was
   called — the same determinism rule the Wi-Fi channel gets from `pendingStarts`, but keyed
   per arrival instant because UWB arrivals from one PPDU are spread over distance.
2. **Gate.** At `startRx`: not registered → nothing; `!listening()` → nothing (no record, no
   callback); `rssi < UWB_RX_SENS_DBM` → nothing. Half-duplex is the device's business
   (Task 6 drops `listening` while transmitting); the channel only skips the sender itself.
3. **Capture.** The new reception is compared pairwise with every reception already open:
   the weaker is always doomed, and the stronger is doomed too unless it leads by
   `UWB_CAPTURE_DB`. This generalises to >2 overlaps and gives the asymmetric case the brief
   asks for: a late arrival that dominates by ≥ 6 dB takes the receiver and still completes.
4. **End.** A doomed reception is *not* cancelled — it stays in `open` (so it keeps colliding
   with anything that starts later) and ends at its own scheduled time with
   `RX_FAIL { reason: 'collision' }` + `onRxFail`; otherwise `RX_OK` + `onRxOk(from, frame, info)`.
   Records use the bare node id, no `#link` suffix.

## propagation.ts

Extracted `wallsCrossed(a, b, walls): Material[]` from `wallLossDb`, exported next to it.
It returns the materials of the walls the direct 2-D ray actually passes through, in wall
order, with the identical opening exemption (`atM >= o.from && atM <= o.to`). `wallLossDb`
now sums `WALL_LOSS_DB[m]` over that list — same walls, same order, so the float additions
are bit-identical. Verified: the lesson-hash fixture passes unchanged, no regeneration.

## Tests

`tests/uwb/channel.test.ts` (11): 5 m → `RX_START − TX_START === 17` and `propNs ≈ 16.678`;
20 m → 67; `RX_OK` at `RX_START + txTimeNs`; one `TX_START` per transmit and `TX_END` at
`TX_START + txTimeNs`; 40 m on channel 9 at −14 dBm → rssi < −93 and no RX record or callback
at all; brick wall → rssi exactly 12 dB lower, `nlosNs === 2.0`, `nlos === true`, and with
`cfg.nlos = false` → `0` / `false` (plus a clear-path case); a non-listening radio gets
nothing; two transmitters starting together 10 dB apart → stronger `RX_OK`, weaker
`RX_FAIL` collision (and `onRxStart` order is strongest-first); within 3 dB → both
`RX_FAIL`; and one extra case the brief did not list — a 10 dB stronger frame arriving
1 µs *into* an open reception captures the receiver.

`tests/engine/propagation.test.ts` (+3): `wallsCrossed` material order, opening/miss skipping
cross-checked against `wallLossDb`, and the empty case.

Harness is the prescribed one: `EventQueue`, `let now`, `makeEmitter`, `NodeCfg[]` with
`kind: 'uwb'`, a `StubRadio implements UwbRadio` with a settable `listen` flag, `runUntil`.

Full suite: `npx tsc -b` clean, `npx vitest run` 816/816 in 83 files.

## Deviations / notes

- Added `UwbChannelCfg` as a named exported interface (the brief inlined the object type);
  the shape is identical.
- Reception-end events are phase 1 (propagation outcome), matching the Wi-Fi channel; only
  `TX_END` is phase 2 as the brief specifies.
- `nlos` is defined as `nlosNs > 0`, so a wall crossed through a door (no loss, no excess)
  is reported LOS, and `cfg.nlos = false` reports LOS everywhere.
- Deliveries iterate registered radios, not all `NodeCfg`s, so Wi-Fi/AMP nodes sharing a
  scenario are never handed UWB energy.
