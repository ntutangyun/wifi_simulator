# U4 — uwb-dl-tdoa, uwb-ul-tdoa, uwb-aoa

Base: de1521f. One commit, explicit pathspecs.

## uwb-dl-tdoa

Budget: `picture 572/900 · numbers 542/550 · practice 367/450 · total 1481 (25 min)`.

Procedure (`numbers`, seven steps, from `src/uwb/device.tdoa.ts` — `onDlSlot`,
`transmitDl`, `onDlRx`, `solveTdoaFix` — in that order):

1. slot 0, anchor-1's Poll carries its own transmit counter; every badge stamps
   the arrival (`UWB_TS`).
2. slots 1–3, each Response carries the responder's transmit counter, its
   counter for the Poll's arrival and its clock offset to anchor-1 read off the
   Poll's carrier (`onDlRx`, `dl.coffsToRef = -coffs`).
3. slot 4, the Final closes the rate interval; the badge now holds the same span
   on its own clock and on anchor-1's.
4. the ratio of the two spans — the clock correction. The flight from anchor-1
   sits in both arrivals and cancels, so anchor-1's crystal leaves the ratio too.
   This is the "how the anchors' own clocks are handled" half: the reference
   anchor's crystal drops out of the ratio, each responder's is removed by its
   own reported offset in step 5.
5. per responder, arrival gap ÷ rate, minus `tofRctu + replyTime·(1 − coffs)`.
6. what is left is a difference of distances over c → `UWB_TDOA`, 1-σ from
   `dlDiffSigmaM`.
7. three hyperbolae, `solveTdoa` at the badge's configured height → the position
   line; no crossing, no line.

Worked example: badge-1, block 0, against anchor-2 — the two spans
(511 181 823 / 511 171 067), the ratio 1.000 021 04, the arrival gap
127 795 798 → 127 793 109, the reply time 127 791 127 → 127 790 829 at
+2.330 ppm, +1918 RCTU of 9.00 m baseline, leftover 361.5 counts = 5.66 ns =
1.70 m against a true 5.39 ns / 1.62 m.

Terms added: none (four already). Prose trimmed to make room: the formula's note
(the steps now carry it) and two tails whose claims the steps restate. Every
pinned substring survives unchanged.

Pins added (`uwb-dl-tdoa · the procedure, step by step`, 4 tests): steps block is
in `numbers` and not in `deeper`, ≥ 3 items, and its items carry the engine's
order token by token; every worked-example row is recomputed from the run's own
records (`UWB_TS`, the two `TX_START` frames carrying `uwb.dl`, anchor-2's
Response) and the hand-run arithmetic is asserted `toBeCloseTo` the `UWB_TDOA`
record to 9 digits. `proseMax` raised 900 → 1120.

## uwb-ul-tdoa

Budget: `picture 598/900 · numbers 550/550 · practice 399/450 · total 1547 (25 min)`.

Procedure (seven steps, from `device.ts onRx` → `network.ts endRound` →
`device.tdoa.ts solveUlFix`): one slot, one blink, radio off; each anchor stamps
a counter on its own crystal *for the log* while the fix is built from
`trueRmarkerNs + extraNs + syncOffsetNs` on the shared timebase; `syncOffsetNs`
drawn once at network build (`gaussian(rng) * syncErrorNs`) — which is what makes
it a bias; the network collects the arrivals for anchor-1; anchor-1 subtracts,
with **no** rate correction because no interval is measured on anybody's crystal
and the unknown transmit instant cancels; `solveTdoa` with
`ulDiffSigmaM(tsNoisePs, syncErrorNs)`.

The clock contrast asked for is written explicitly: downlink needs the badge's
rate and discards anchor-1's crystal; uplink needs nothing of the badge's and
rests entirely on the anchors' shared timebase.

Worked example: badge-1, block 0, against anchor-2 — true flights 4.7634 m /
15.889 ns and 6.3789 m / 21.278 ns, true difference 5.3886 ns / 1.6155 m, each
anchor's residual 0 ns, measured 5.3267 ns, leftover −0.0619 ns / −1.86 cm,
σ 4.2 cm, fix (4.02, 3.46) m error 0.05 m.

**Cell-rule carry: can be dropped.** The only offender was
`N('1 slot of 2 ms, 1 frame')`; it now has a real Chinese half
(`1 个 2 ms 时隙，1 帧`). Both carried rules were replayed against the real
`neutralCellTexts` / `acronyms` / `knownFor` logic with the carry removed and
both come back clean for `uwb-ul-tdoa`. A regression test in the lesson's own
file now asserts the rule directly, so the entry in `CELL_RULE_CARRIES` is dead
weight. (`uwb-mms-numbers` is not mine and still needs its entry.)

Naming fixes the rule reported: `UL-TDoA` (en + zh) now carries a naming clause
("is called" / 就是) where the picture introduces it; `bias` is glossed in
brackets at its first English appearance, which is in `outcomes`, not the
picture.

Pins added (5 tests): steps structure and order; the two flights recomputed from
the scene's coordinates and the record's own `trueDtNs`; the drawn residual
asserted zero for all four anchors at the default; the leftover and the σ
recomputed; the fix row checked against the `UWB_POSITION` record emitted by the
reference anchor; and a neutral-cell regression test. `proseMax` 900 → 1155.

## uwb-aoa

Budget: `picture 659/900 · numbers 529/550 · practice 378/450 · total 1566 (20 min)`.

Procedure (six steps, from `device.ts onRx` → `device.report.ts measureAoa` →
`reportRange` → `emitAoaFix`): stamp, timestamp noise, carrier-offset residual,
*then* the angle; true azimuth from position and Facing; the phase a λ/2 pair
would see, π·sin θ, plus one draw of `AOA_SIGMA_PHI_RAD = 0.15 rad`; invert with
`asin(φ/π)` clamped to ±90°, emitting `UWB_AOA` per frame from the badge; at the
end of the round the range is paired with the later bearing and the height comes
out, √(r² − Δz²); the leg is walked along Facing + θ̂ and the ellipse is the
range's 2.1 cm along the ray against leg · σ_φ/(π·cos θ̂) across it — so the
reported error is set by distance and angle, not by the range.

Worked example: base scene, round 0 — true azimuth 0.000°, phase 0.000 rad,
+ one draw 0.0984 rad, θ̂ 1.796°, range 2.3048 m (true 2.3324), horizontal leg
1.9678 m, fix (4.938, 2.467) m against a true (5.000, 2.500), ellipse across
9.4 cm / along 2.1 cm.

The simplification is now named in the picture, in a paragraph of its own
("What the model actually does" / 模型实际做的事), where the reader first meets
the two antennas: real hardware has two receive chains and compares them, the
simulator has neither — it computes the phase a λ/2 pair would see at the true
angle, adds one draw, and inverts that single number; spacing, wavelength and the
array live in that one line and nowhere else. It had to be a separate paragraph:
appending it to the first one pushed that paragraph to 100 EN words, over the
picture rule's 90.

Pins added (5 tests): steps structure and order; the bearing recovered as
π·sin θ̂ and re-inverted through `azimuthFromPdoaDeg`; the height correction
asserted to reproduce the record's own `x`/`y` to 9 digits; the ellipse asserted
equal to `max/min(horiz·aoaSigmaDeg(θ̂), rangeSigmaM(100))` and `gdop === 1`; and
a test that the simplification is stated in the picture, in both languages.
`proseMax` 950 → 1195.

Moved to `deeper`: the two "Behind the anchor" paragraphs of `numbers`. They are
a corner case, the mechanism itself is in the picture's "The half it cannot see",
and `numbers` had no room for the procedure otherwise. Both pinned sentences are
unchanged and still assert through `prose()`, which walks `deeper`.

## Notes

- The dispatch mentions a `UWB_FIX` record. There is none: the record is
  `UWB_POSITION` (src/uwb/records.ts:48) and the log prints it as
  `… position of badge-1 (…)`. The lessons say "the position line".
- No 600 RSTU claim anywhere in these three; `uwb-ul-tdoa`'s slot arithmetic is
  240 000 ÷ 2 400 RSTU, which is the 2 ms slot and untouched.
- The engine contradicted nothing in the old prose. Everything the steps say was
  already true; it was simply not written as a procedure.
- `npx vitest run tests/course` and the graded readability run show failures in
  `uwb-mms` / `uwb-mms-numbers` only — another implementer's files, in flight.
