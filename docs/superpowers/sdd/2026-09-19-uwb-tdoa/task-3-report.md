# Task 3 report — UL-TDoA, the overlay's TDoA fixes, the editor's one-way fields

`npx tsc -b`, `npx vite build` and the full `npx vitest run` (104 files, **1308** tests, up from 1295)
are green. `tests/fixtures/lesson-hashes.json` is untouched and no course file was edited.

## What a UL-TDoA round is

The round-per-tag grid is the two-way one; the round is emptied out to a single slot.

| | slot 0 of tag k's round |
| --- | --- |
| tag k | **TX** blink (14 octets, 181 218 ns), then radio off — it listens to nothing, ever |
| every anchor | listens, timestamps the blink on the **common timebase** |
| anchor 0 | at the round's end: differences the arrivals, emits the records, solves the fix |

`onUlSlot` is the only slot path in the mode, and it has exactly two branches: the round's own tag
transmits, everyone else listens. A tag reaches `listenFor` from nowhere here — "a tag hears nothing in
UL-TDoA" is a property of the code, as "a tag transmits nothing in DL-TDoA" is. `transmitFor` gained the
`uwbBlink` case Task 2 left a TODO for (the TODO is gone), and it keeps no round state at all: a blink
carries no times, so there is nothing at the tag to remember.

### The common timebase (model: "wired sync")

An anchor's reported arrival is

```
arrivalNs_i = trueArrivalNs + nlosNs_i + gaussian(rng_i)·σ_ts + syncOffset_i
            = (txStartNs + UWB_RMARKER_NS + propNs) + …
```

taken from the channel's `UwbRxInfo`, **not** from the anchor's own ranging counter: that counter runs on
the anchor's crystal, and the crystal is precisely what the calibration removes. The anchor still stamps
and logs its local counter (`UWB_TS`), so the event log shows what the hardware saw; the fix is computed
from the calibrated value. The draw order inside `onRxOk` is unchanged — timestamp noise first, then the
carrier-offset draw — so nothing else in the stream moved.

`syncOffset_i ~ N(0, syncErrorNs)` is drawn **once per anchor**, in `network.ts`, from that anchor's own
stream and immediately after its crystal draw, and **only when `mode === 'ul-tdoa'`** — so a two-way or
DL-TDoA session takes exactly the stream it took before (pinned: a TWR run with `syncErrorNs: 4` is
byte-identical to the default one; that assertion already existed from Task 2 and still passes).

**Anchor 0's own error is included** (the brief's first option, taken for symmetry): every anchor is
calibrated to the infrastructure's timebase, none of them *is* the timebase. Nothing in the arithmetic
prefers anchor 0 — it is only the anchor the differences are taken against, exactly as in DL-TDoA — and
fixing it at 0 would have made "the reference anchor is perfect" a silent modelling claim.

Because the offset is a fixed draw and not a per-round one, it is a **bias**: a miscalibrated anchor is
wrong the same way in every round, and no number of blinks averages it away. That is the lesson's point
and it is pinned as a test.

### Who solves what

`network.ts` at the round's end: it reads each anchor's `ulArrivalNs()` while the round is still open,
hands the set to anchor 0's `solveUlFix(arrivals)`, and only then closes every device's round. Anchor 0
emits, per other anchor that heard the blink,

```
UWB_TDOA { node: anc-1, ref: anc-1, peer: anc-i, dtNs = arrival_i − arrival_ref,
           trueDtNs = (d(tag, a_i) − d(tag, a_ref))/c, block, round, of: tag }
```

and then `UWB_POSITION { node: anc-1, method: 'ul-tdoa', of: tag, … }` from
`solveTdoa(anchors, ref, deltas, tagZ, √2·rangeSigmaM(tsNoisePs))`. There is **no clock-rate correction
anywhere** in this mode, and there is nothing to correct: no interval is measured on anybody's crystal,
only two instants on one timebase. `dtNs` is a plain subtraction. If the reference anchor missed the
blink the round produces nothing at all, rather than quietly re-referencing to an anchor the records do
not name (pinned).

`UWB_TDOA` gained the optional `of` field (as ruled). The tag's z is the one thing about the tag the
infrastructure assumes rather than solves — every 2-D TDoA deployment configures an assumed tag height —
and its x/y are used only as the truth the record is scored against, exactly as a tag's own fix is.

## Measured (ten tags, four corner anchors of a 10 × 8 m room, two 200 ms blocks, 20 fixes)

Tags at ±20 ppm alternating, which in this mode changes **nothing**: a blink carries no times.

| `syncErrorNs` | σ per difference | max ‖Δt‖ error | max fix error | mean fix error | GDOP | ellipse |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 4.24 cm | **10.9 cm** | **5.9 cm** | 3.0 cm | 0.87–1.00 | a 2.5 cm, b 1.1 cm |
| 1 | 42.6 cm | **101.6 cm** | **73.0 cm** | 56.5 cm | 0.85–1.05 | unchanged |

σ per difference is `√2·√(σ_ts² + syncErrorNs²)·c` — two independent receive timestamps and two anchors'
calibration offsets in one subtraction. Both maxima sit inside the 4σ envelope the tests pin, and the
pinned values are `0.11` / `0.06` m and `1.02` / `0.73` m. One nanosecond of sync error costs **an order
of magnitude**: 30 cm of range difference lands almost whole in the fix.

**The ellipse is unchanged between the two runs** (2.5 × 1.1 cm), because a calibration offset is not
noise and `sigmaRangeM` knows nothing of it — the inspector's existing `ellipseHintTdoa` already says so
for one-way fixes, and this is the sharpest example of it in the model. Note also that `√2·rangeSigmaM`
is `c·σ_ts`, a factor √2 **below** the true per-difference σ of `√2·c·σ_ts`: the ruling asked for the same
figure DL-TDoA passes, and in UL-TDoA the approximation is optimistic by that √2 on top of the missing
bias. A lesson that shows the ellipse should say so; the test spells the true σ out beside it.

## View, overlay, inspector, log

- **`of` routing** (`view.ts`): one helper, `subject(vs, r)` = `vs.nodes[r.of ?? r.node]?.uwb`, used by
  both `UWB_TDOA` and `UWB_POSITION`. The tag's lane carries its `tdoa` rows, its `position` and their
  counts; the anchor that did the arithmetic keeps a clean lane (pinned both ways).
- **Overlay** (`scene.ts`): rings are drawn only when the lane's fix is two-way (`position === null ||
  method === 'twr'`). A TDoA lane gets the cross and the ellipse and nothing else — which is also all it
  could draw, since those lanes hold no ranges. TWR is untouched, and its twelve existing tests pass
  unchanged.
- **Inspector**: nothing to do. The `of`-routed fix puts `method: 'ul-tdoa'` on the tag's lane, and
  `uwbFixRow` already prints it through `U.method` — "UL-TDoA" / "上行到达时间差 (UL-TDoA)". The time-
  differences table appears for the same reason.
- **Log** (`format.ts`, beyond the brief's file list): a record carrying `of` says whose it is —
  `anc-1 position of tag-1 (…) (UL-TDoA)`, `anc-1 TDoA of tag-1 anc-3 − anc-1: …`. Without it the line
  reads as the anchor's own position. Records without `of` — every line the existing lessons quote
  verbatim — are byte-identical; pinned in `tests/ui/uwb-format.test.ts`.

## Editor

`UwbSessionFields` gained three controls, above the schedule: the **mode** select (TWR / DL-TDoA /
UL-TDoA), the **tag clock correction** checkbox (live in DL-TDoA only) and the **anchor sync error** field
in ns (live in UL-TDoA only, 0–10 to match the schema). Each disabled field's tooltip says which mode owns
it. The schedule select is now disabled under a one-way mode as well as under DS-TWR, and picking a
one-way mode takes the session back to `schedule: 'time'` — the same move the method select makes for
DS-TWR, and for the same reason: the schema rejects the other pair. That patch is the exported pure
function `uwbModePatch(mode)`, which is what the editor test drives; `uwbSessionIssue` still comes from
the schema, and the ≥ 4 anchors rule is deliberately *not* patched away by any field (pinned).

i18n: `uwbMode`/`uwbModeHint`/`uwbModes`, `uwbClockCorrection`(+Hint), `uwbDlOnly`, `uwbSyncError`(+Hint),
`uwbUlOnly`, `uwbTwrOnly` — EN and ZH.

## Tests (+13: 5 network, 1 scene, 1 view, 3 editor, 1 format, 2 delegation cases)

`tests/uwb/network.test.ts` — one blink per tag per block (14 octets, 181 218 ns, broadcast, `['BLINK']`,
`MAC_STATE` tx→idle and no listening), no `UWB_RANGE` and no `UWB_TIMEOUT` anywhere; anchor 0 solves every
tag once per block with `of`, and the view puts it on the tag's lane while the anchor's stays empty; the
4σ envelope and the pinned maxima at 0 ns; the same at 1 ns, with the ellipse unchanged and the error an
order of magnitude larger; determinism, and a deaf reference anchor producing nothing.
`tests/uwb/scene.test.ts` — no rings, one fix and one ellipse per tag, at the solved point.
`tests/uwb/view.test.ts` — `of` routing. `tests/editor/uwb-planOps.test.ts` — the three fields round-trip
through `ScenarioSchema`, the contention→time patch, the anchor rule. `tests/ui/uwb-format.test.ts` — the
two `of` log lines.

## Deviations from the brief

1. **`src/uwb/format.ts` and `tests/ui/uwb-format.test.ts` were touched** (not in the brief's file list):
   without it the log prints a tag's position as the anchor's. Two-way lines are unchanged.
2. **`UwbDeviceCfg.syncOffsetNs`, not `syncErrorNs`.** The device holds this anchor's *realised* offset
   (one number, drawn at construction); the session's 1-σ keeps the name `syncErrorNs`. Calling both the
   same thing would have hidden the fixed-bias-versus-sigma distinction the lesson turns on.
3. **`nlosNs` is included in the arrival** alongside the timestamp-noise draw, where the brief's formula
   names only the noise. It is the same delay every other mode's timestamp carries, and it is zero in
   every test here (`nlos: false`); leaving it out would have made a wall invisible to UL-TDoA alone.
4. **`UwbGeometry.anchorPos` was not renamed** although UL-TDoA asks it for a tag's entry; its doc comment
   now says so. A rename would have churned four call sites in device.ts for no behaviour.

## Follow-up: honest TDoA ellipses (controller ruling, commit 2)

The optimistic ellipse above is gone. `solveTdoa` is now given what a difference actually carries,
in both modes (`src/uwb/device.ts`, two new module functions; `syncErrorNs` — the session's 1-σ, beside
the realised `syncOffsetNs` — now reaches the device from `network.ts`):

```
UL:  σ = √2 · c · √(σ_ts² + syncErrorNs²)                       (one number for the session)
DL:  σ = RMS over the responders heard of
         √( (√2·c·σ_ts)² + (c · replyTime_i · cfoNoisePpm)² )   (replyTime_i from the Response)
```

Both are stated in the code as **first-order** models: `syncErrorNs` is a fixed bias per anchor, not
white noise that averages down, so the ellipse is indicative of how far the fix may be off rather than
a 68 % interval. `ellipseHintTdoa` (EN + ZH) now says exactly that instead of "the residual is not in it".

Measured after the change, same fixtures:

| run | ellipse semi-major | max fix error | before |
| --- | --- | --- | --- |
| DL-TDoA, 3 tags × 3 blocks | **20.1 cm** (σ_RMS 26 cm over replies of 2/4/6 ms) | 40 cm | 2.5 cm |
| UL-TDoA, `syncErrorNs: 0` | **3.6 cm** | 5.9 cm | 2.5 cm |
| UL-TDoA, `syncErrorNs: 1` | **34.8 cm** | 73.0 cm | 2.5 cm |

The ellipse is now between a third of the worst error and the worst error in all three, and it tracks
`syncErrorNs`; those relations are pinned alongside the values. Test count is unchanged (1308) — the two
assertions that pinned the old ellipse were rewritten, not added to.

## For Task 4 (the lesson)

- Quote **position errors** here, not raw GDOP against TWR's (Task 1's caveat still stands).
- The 0 ns → 1 ns pair is the lesson's centrepiece: 6 cm → 73 cm worst case, mean 3 cm → 57 cm, for one
  nanosecond. Say that it is a *bias*, not noise: the ellipse does not move, and more blinks do not help.
- Cost per tag: one 14-octet, 181 218 ns frame per 200 ms block, and the tag learns nothing — the fix
  exists only on the infrastructure side. A block holds 100 such tags at the defaults.
