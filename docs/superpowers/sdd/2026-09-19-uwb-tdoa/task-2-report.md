# Task 2 report — DL-TDoA: anchor-run rounds, listening tags, hyperbolic fixes

`npx tsc -b`, `npx vite build` and the full `npx vitest run` (104 files, **1295** tests, up from 1271)
are green. `tests/fixtures/lesson-hashes.json` is untouched, and no course file was edited.

## What the round looks like now

`UwbNetwork` grew one seam: `runRound(block, round, tagId, crowdIds)`. Two-way ranging calls it once
per tag with the crowd it always had (`[tag, ...anchors]`), byte for byte as before; DL-TDoA calls it
**once per block** with `[...tags, ...anchors]`, round 0, and an empty `tagId` — no tag owns the round
and nothing in it is addressed to one. The tags head the crowd so a listener's `UWB_SLOT` precedes the
frame that lands in it, exactly as the single tag of a two-way round does. Two guards moved with it:
the `tags ≤ roundsPerBlock` rule is skipped in this mode (every tag listens to the same round, as the
schema already decided), and the slot-fit guard now asks `uwbSlotFitNs(anchors, mode)`.

Inside the device, three small branches keyed on `plan.mode` and one new per-round record:

| | slot 0 | slots 1…N−1 | slot N |
| --- | --- | --- | --- |
| anchor 0 | **TX** Poll (its TX counter) | listens to every Response | **TX** Final (its TX counter + RX counter per Response) |
| anchor i | listens | **TX** Response in slot i (its TX counter, its RX counter of the Poll, `coffs_i`) | — (radio off) |
| every tag | listens | listens | listens |

`onDlSlot` is the only slot path a tag reaches in this mode and its single branch is `listenFor` —
"a tag never transmits in DL-TDoA" is a property of the code, not of the schedule: there is no path
from a tag to `transmitFor` here. Anchors range nobody (no `UWB_RANGE` is emitted anywhere in the mode),
and an anchor sleeps through every slot its own part of the round does not need.

`DlRoundState` (fresh every round, null outside this mode) holds the tag's `rxPoll` / `rxFinal` /
per-responder map, the responder's `coffsToRef`, and anchor 0's arrival counter per Response. A tag
that misses the Poll or the Final produces nothing that round; a missed Response drops that anchor only.

## The tag's arithmetic

```
r          = counterDiff(rx_F, rx_0) / counterDiff(txFinal_0, txPoll_0)   (1 when correction is off)
replyTime_i= counterDiff(txResp_i, rxPoll_i)                          (both from the Response)
txOffset_i = tof_RCTU(a_0 → a_i) + replyTime_i · (1 − coffs_i)
Δ_i        = counterDiff(rx_i, rx_0) / r − txOffset_i   →   dtNs = Δ_i · RCTU_NS
trueDtNs   = (d(tag, a_i) − d(tag, a_0)) / c
```

then `solveTdoa(anchorPositions, a_0, deltas, tag.z, √2·rangeSigmaM(tsNoisePs))` →
`UWB_POSITION { method: 'dl-tdoa', anchors: [ref, …responders heard] }`.

**Sign of `coffs_i`, stated once because it is the one place the model could be off by a factor:**
the responder's receiver measures "how much faster the sender runs than me" (`ppm_0 − ppm_i`), and the
Response carries the **negation** of it — anchor i's own rate *against anchor 0* (`ppm_i − ppm_0`),
which is what the field's name ("clock offset **to** anchor 0") says and what makes the consumer's
`(1 − coffs)` the same operation SS-TWR performs, only into anchor 0's timebase instead of the
listener's. The test *"DL-TDoA with the anchors off frequency"* pins it: with responders at ±20 and
+13 ppm the differences stay inside the same decimetre envelope, where the opposite sign would put
them at 2·ppm·replyTime, i.e. metres.

## Measured errors (four corner anchors of a 10 × 8 m room, three tags at +20 / −20 / +7 ppm, 3 blocks)

`|dtNs − trueDtNs| · c`, over all three tags and all three rounds:

| responder (slot) | reply time | σ_Δ = reply × 0.2 ppm | mean error | **max error** | 3σ envelope |
| --- | --- | --- | --- | --- | --- |
| anc-2 (1) | 2 ms | 12.0 cm | 14.0 cm | **21.6 cm** | 36 cm |
| anc-3 (2) | 4 ms | 24.0 cm | 22.4 cm | **40.0 cm** | 72 cm |
| anc-4 (3) | 6 ms | 36.0 cm | 22.7 cm | **57.3 cm** | 108 cm |

Position: 9 fixes, error **max 40 cm**, mean 22 cm, GDOP 0.86–0.92, ellipse semi-major ≈ 2.3 cm.
The residual is entirely the responders' clock-offset estimates (σ = `cfoNoisePpm` = 0.2 ppm × the
reply time); the two timestamps of the difference contribute ~5 cm, and the rate ratio's own noise
(√2·σ_ts over an 8 ms interval) about 1 cm.

With `tdoaClockCorrection: false`, the same run:

| responder (slot) | tag-1's ppm term (20 ppm × slot × 2 ms × c) | max error, all tags |
| --- | --- | --- |
| anc-2 (1) | 11.99 m | **12.20 m** |
| anc-3 (2) | 23.98 m | **24.28 m** |
| anc-4 (3) | 35.97 m | **36.50 m** |

and **no fix at all is produced** (0 of 9): 36 m of range difference between anchors 11 m apart is not
a hyperbola anyone stands on, so Gauss–Newton walks out to where the difference rows go parallel and
`solveTdoa` returns null rather than inventing a position. This is pinned as a test. **Lesson 5 (task 4)
should quote the differences in metres, not a position error, for the correction-off variant** — there
is no fix to quote. If the lesson wants a bad-but-existing fix instead, give the variant's tag a few ppm
rather than twenty.

## Records, view, log, panel

- `UWB_TDOA { node, ref, peer, dtNs, trueDtNs, block, round }`, one per responder heard.
- `UWB_POSITION` gains required `method: 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'aoa'` (`UwbFixMethod`, exported
  from `uwb/records.ts`) and optional `of?: string` (unused here; it exists for Task 3). Every existing
  emitter and test literal now says `'twr'`.
- `UWB_ROUND` gains required `mode: UwbMode` — the reviewer's note: the log line used to print
  `(${method}-TWR)` unconditionally and would have called a DL round "DS-TWR". It now prints
  `DL-TDoA` / `UL-TDoA` for one-way rounds and `SS-TWR` / `DS-TWR` for two-way ones, pinned both ways.
- View: `UwbNodeView.tdoa: Record<peer, { dtNs; trueDtNs; n }>`, `position.method`.
- Log: `tag-1 TDoA anc-3 − anc-1: -8.24 ns (true -8.02 ns)`.
- Inspector: a time-differences table (peer / measured / true / signed error in ns / rounds) beside the
  ranges table, a "solved from" row naming the method, and a hint on the ellipse of a one-way fix saying
  in so many words that its √2·σ is an approximation which leaves the clock residual out. i18n:
  `uwb.method` (the four methods), `uwb.methodLabel`, `uwb.tdoa`, `uwb.tdoaHint`, `uwb.ellipseHintTdoa`,
  all EN + ZH.

## Deviations from the brief, and why

1. **The two-way position log line is unchanged.** The brief says "the position line gains the method".
   `src/course/uwb/uwb-position.ts` quotes that line **verbatim** in its prose, and
   `tests/course/uwb-position.test.ts` asserts `fmtRecord(fix) === prose`. Appending `(TWR)` to every
   fix would have forced a course-file edit outside this task. So two-way ranging is the line's unmarked
   case — the only fix the log could print before one-way ranging existed — and any other method names
   itself: `…, 4 anchors (DL-TDoA)`. Both forms are pinned.
2. **`UwbDeviceCfg.tdoaClockCorrection`, not `RoundPlan`.** The knob had to reach the device; adding it
   to the device config (beside `tsNoisePs`, `cfoNoisePpm`, `maxAttempts`, which are session values too)
   kept `session.ts` — Task 1's file, being touched concurrently — out of this commit entirely.
3. **`transmitFor` still has no `uwbBlink` case** (reviewer's second note). Its switch is deliberately
   non-exhaustive and nothing throws on an unwired kind; a `TODO (Task 3, UL-TDoA)` now says so at the
   top of it. Adding the case would have written Task 3's behaviour.

## The rate ratio lives in anchor 0's timebase (controller ruling, applied)

The first cut divided the tag's arrival interval by the **true** Poll-to-Final span (`N · slotNs`),
which left `replyTime_i · ppm_0` of error whenever anchor 0's own crystal was off — the simulator
schedules transmissions at true instants, so `N · slotNs` is true time, while `txOffset_i` is in
anchor 0's counter units. The ruling removed the mixed timebase: anchor 0 already reports its own TX
counter in **both** the Poll and the Final, so the tag now takes

```
r = counterDiff(rx_F, rx_0)_tag / counterDiff(txFinal_0, txPoll_0)
```

— one interval over the other, i.e. the tag's clock against anchor 0's and never against true time.
`e_0` cancels exactly, the whole computation is in anchor 0's units where `txOffset_i` already was,
and it is what a real tag does with the times the frames report. A round missing either instant
produces nothing, as before.

Pinned: with anchor 1 at **+20 ppm** (and again with *all four* anchors at +20 ppm) the differences
are the same 0.22 / 0.40 / 0.57 m and the nine fixes stay under half a metre — identical to the
0 ppm run. There is no longer any constraint on the reference anchor's crystal, and the earlier
"leave anchor 0 at 0 ppm" limitation is withdrawn.

**Accepted, for lesson 4:** with `tdoaClockCorrection: false` the solver yields **no fix at all**
(the differences are geometrically impossible), so the correction-off variant quotes the differences
in metres — 12.20 / 24.28 / 36.50 m — and not a position error.

Related: the fix ellipse (√2·σ_r per difference, controller's ruling) is ~2 cm beside a 40 cm error,
because the clock-correction residual is not in σ. The inspector now says so; a lesson that shows the
ellipse should repeat it.
