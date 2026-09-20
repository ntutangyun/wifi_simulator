# Task 3 report — the pairwise MMS cycle

**Status:** DONE. One commit, `aef127a`. `npx tsc -b`, `npx vite build`, `npx vitest run`
(112 files, 1 586 tests) all green; `tests/fixtures/lesson-hashes.json` untouched.

---

## What was built

### `src/uwb/session.ts`

- `RoundPlan.mms?: MmsRoundPlan` — `{ phy, layout, report, nbChannels, nbLbt }`, set exactly when
  `mode === 'mms'`, with `phy` and `nbChannels` **copied** so a plan cannot be edited from under a
  device.
- `SlotAction` gains `nbPoll`, `nbResp`, `uwbRsf`/`uwbRif` (with `index`), `nbReport` and `idle`.
  `anchor` is always 0 — a pair round holds one responder, and the network maps round → anchor.
- `mmsSlotAction(p, slot)` reads the table off `mmsLayout` rather than restating it: control slots
  0/2 (1 and 3 idle), the ranging phase by `ms = floor((slot − 4) / 2)` and
  `side = (slot − 4) % 2`, the report windows at `layout.reportSlot(side)` with the window the
  session's report mode does not use turned to `idle`. Out-of-range slots throw.

### `src/uwb/network.ts`

- New trailing constructor argument `seed: number = 0` (existing callers and tests compile
  unchanged); `Simulation` passes `sc.seed`.
- Guards now agree with the schema: for `mms` the block rule compares `tags × anchors` and the
  message says **pairs**; `UWB_MAX_ANCHORS` is skipped; and the schema's second MMS slot rule (a
  608 µs narrowband message must fit two slots) is mirrored here too — the comment that promises
  the two definitions cannot drift now covers all of it.
- `startBlock` runs `tags.forEach((tagId, t) => anchors.forEach((anchorId, k) =>
  runRound(block, t·A + k, tagId, [tagId, anchorId], [anchorId])))`; `peers.anchors` is the pair's
  one anchor, while `beginRound` still gets the full anchor list (a tag needs `A` to know when its
  block is over).
- The block's narrowband channel is drawn once per round from `nbChannelForBlock(…, seed, block)`
  and handed to `beginRound` in a new options object.

### `src/uwb/device.ts` (the bulk)

- `Expectation` gains `until` (the slot the wait expires at — one slot on for every 4z frame, two
  for a narrowband message) and `silent` (a lost fragment is counted, not reported). `closeSlot`
  takes the slot it is closing at, or `null` at the round's end.
- `send(desc, txCounter: number | null)` — null means "no ranging counter was taken", which is
  every narrowband message and every fragment but the first of each kind.
- `MmsRoundState`: `nbChannel`, `primed`, `polled`, `frags`, `done`, `txRmarker`, `rxRmarker`,
  `rxNlos`, `ratio`, `rifDetected`. Device-level: `nbSkipBlock` and `blockRanges`.
- `onMmsSlot` → `closeDueTrains` then the slot's own action. `nbClear` is the listen-before-talk
  gate (busy ⇒ `UWB_NB_LBT`, `nbSkipBlock = block`, nothing more on narrowband that block; clear ⇒
  nothing emitted, nothing drawn).
- `txFragment` stamps only index 0 of each kind, at `clock.counter(this.now())` — **no**
  `UWB_RMARKER_NS`.
- `onMmsRx` returns before every draw in `onRxOk`: an MMS device takes nothing from the generator
  per reception.
- `evaluateTrain` — detection, `UWB_MMS_TRAIN`, the two stamps (first-heard, then last-heard when
  ≥ 2), the ratio, `UWB_TS { dir: 'rx' }`, and the timing train's RMARKER/ratio kept.
- `onNbReport` — `ssTwrCorrected` with the train ratio or the carrier fallback; `UWB_RANGE` with
  `integrity` when Y > 0.
- `solveMmsFix` — at `round % A === A − 1`, `solvePosition` from `blockRanges`, `UWB_POSITION
  { method: 'twr' }`, then the store is cleared (before the `< 3` early return, so a partial block
  cannot leak into the next). `UWB_ROUND_END` follows, as today.

### Records, view, log, inspector, decoder, lanes

- `UWB_NB_LBT`, `UWB_MMS_TRAIN`, `UWB_RANGE.integrity?`, `NOTHING_HEARD_DBM = −999` (documented as
  the "nothing heard" sentinel: records must survive a JSON round trip for the view and fixtures).
- `UwbNodeView.mms = { trains, nbChannel, lbtBusy, skippedBlocks }`; ranges keep `integrity`.
  `applyUwbRecord` now also *observes* `TX_START` / `RX_OK` for the narrowband channel and hands
  them straight back to the Wi-Fi reducer (returns `false`) — a clear LBT check emits no `UWB_*`
  record, so the channel can only come from the frames themselves.
- Log: one line each, in the brief's wording; the "twelve UWB types" header comments in
  `src/ui/format.ts` and `src/uwb/format.ts` now say fourteen.
- Inspector: train table (peer / train / heard / margin / combined / ratio), narrowband channel +
  centre, listen-before-talk count, and the integrity phrase on the range row's title. EN + ZH.
- `frameFields.ts`: fragments and narrowband messages no longer go through the 4z MHR + IE
  decoder. A fragment decodes to four zero-octet rows (it carries no octets at all) and one PPDU
  segment with `rmarkerNs: 0`; a narrowband message decodes to message id / channel / time /
  remaining fields / CRC-16 and an SHR + PHR + PSDU layout. `uwbPpduLayout` itself dispatches, so
  `ppduLayout` routes every 4ab frame correctly too.
- `laneLayout.ts`: five new labels (EN + ZH); a fragment's "rate" column is its own EIRP, because
  a sequence has no data rate. `frameColor`: both trains teal `0x2dd4bf`, all three narrowband
  messages indigo `0x818cf8` — distinct from the 4z ranging ambers.
- `nb.ts`: `nbCenterMhz` throws outside 0…249; `// derived` on `nbPpduNs`, `// model` on
  `NB_LBT_THRESHOLD_DBM`.

---

## Tests

RED/GREEN evidence, in order of the work:

1. **First end-to-end probe** (temporary `tests/uwb/_probe.test.ts`, deleted): the pair round and
   the ranges came out but `ratioPpm` and `distM` were **NaN**. Cause: `MS_RCTU` was defined as
   `MS_NS / RCTU_NS` at module scope, and `mms.ts` ↔ `phy.ts` is a documented import cycle — the
   binding was `undefined` when `mms.ts` evaluated first. Fixed by deriving it from `MS_CHIPS`
   (which lives in `mms.ts`) × a local `RCTU_PER_CHIP = 128`; pinned by a new test asserting
   `MS_RCTU === 63 897 600` **and** `MS_RCTU × RCTU_NS ≈ MS_NS`, which would have caught it.
2. **`tests/uwb/session.test.ts` (+10)** — RED on the first run (`p.mms` undefined, `slotAction`
   threw); GREEN after `roundPlan`/`mmsSlotAction`. Covers the 28-slot default round, the plan's
   copied payload, the interleaved trains, agreement with `mmsLayout` slot for slot, the report
   windows per report mode, a mixed train's RIF placement and Z = 2's idle millisecond.
3. **`tests/uwb/network.test.ts` (+18)**, end to end on real scenes. Five failed on the first run
   and each failure was a real finding, not a flaky threshold:
   - the run window included one more pair round than expected → window fixed;
   - the two-wall margin was 5.4 dB, not 1.77 — because the lesson's third anchor (4.5, 4) is
     8.58 m from the tag and the other two 13.03 m, 3.6 dB apart. The test now reads the two far
     anchors and the near one separately (see Concerns);
   - the `integrity: false` range was long by 0.57 m — the brick wall's own 2 ns of excess delay,
     which **both** RMARKERs carry so the round trip keeps rather than cancels it. The test now
     asserts exactly that bias (`UWB_NLOS_NS.brick × c`), which is a better statement than the one
     it replaced;
   - `UWB_MAX_ANCHORS + 2` anchors gave 12 rounds in a 200 ms window because `runUntil(200 ms)`
     includes the next block's first round → window cut to 199 ms.
   The block covers: round shape and slot placement; the TX stamp with no SHR offset; one train
   record per side; no fragment timeout and no per-fragment stamp; ranges at the timestamp floor;
   `ratioPpm` within 4σ (σ = 0.0202 ppm) of the true crystal difference on every pair; the RMS
   range error over 20 rounds inside [0.5, 1.6] × 2.12 cm; the block fix after the last pair round
   with `method: 'twr'` and before `UWB_ROUND_END`; X = 8 / 4 / 16 behind two brick walls;
   the X = 1 fallback and X = 2 ratio (below); the integrity flag both ways; the three report
   modes; channel hopping; a busy LBT; the pair guard; determinism; and a two-way session
   unchanged by every MMS knob.
4. **The X = 1 fallback**, asserted by replaying the tag's own `Rng` stream exactly as the brief
   asks. `coffs` is recovered from the record (`tofRctu − tofRawRctu = reply · coffs / 2`), and at
   X = 1 it equals `(anchorPpm − tagPpm)·1e-6 + g₂·cfoNoisePpm·1e-6` to 15 decimal places, where
   `g₂` is the **second** Box–Muller draw of a freshly forked `Rng(7).fork(hashStr('tag-1#uwb'))`
   after the counter origin — i.e. the RMARKER stamp came first and the carrier residual second,
   in the spec's order. At X = 2 the same `coffs` equals `1/ratio − 1` from the train record to 15
   decimals, so no carrier draw happened at all.
5. **`tests/uwb/mms.test.ts` (+5)** — `MS_NS`/`MS_RCTU` and `rmarkerFromFragment` (the pure
   RMARKER arithmetic the brief allows in place of a production test hook): a train whose first
   fragments were lost recovers the same RMARKER from any fragment, exactly.
6. **`tests/uwb/nb.test.ts` (+2)** — the `nbCenterMhz` guard, both edges still answering.
7. **`tests/uwb/view.test.ts` (+3)** — the train map, the sentinel carried through, the range's
   integrity flag absent on a 4z range, the LBT counters, and the narrowband channel learned from
   `TX_START`/`RX_OK` at both ends while the Wi-Fi reducer still owns those records.
8. **`tests/uwb/inspector-rows.test.ts` (+10)**, **`tests/ui/uwb-format.test.ts` (+5)**,
   **`tests/model/uwb-frameFields.test.ts` (+8)**, **`tests/ui/uwb-lanes.test.ts` (+4)** — one
   group each. The format test pins that the −999 sentinel never reaches the reader; the
   frameFields test pins that none of the five kinds decodes an `fc`, a `dstPan`, an address or a
   ranging IE; the lanes test pins five distinct labels, none of them the old `cts` fallthrough.

Existing suites unchanged: `tests/engine/lesson-hashes.test.ts` green and the fixture file is not
in the diff.

---

## Files changed

`src/uwb/{session,network,device,records,view,format,frameFields,mms,nb}.ts`,
`src/uwb/ui/{rows.ts,UwbInspector.tsx}`, `src/engine/simulation.ts`, `src/model/frameFields.ts`,
`src/scene/effects.ts`, `src/ui/{format.ts,i18n.ts,laneLayout.ts,FrameDetail.tsx}`;
tests: `tests/uwb/{session,network,mms,nb,view,inspector-rows}.test.ts`,
`tests/ui/{uwb-format,uwb-lanes}.test.ts`, `tests/model/uwb-frameFields.test.ts`,
`tests/course/uwb-position.test.ts` (one fixture widened).

---

## Self-review findings (fixed before committing)

- `uwbPpduLayout` is what `ppduLayout` routes every UWB frame to, so the 4ab dispatch had to live
  **inside** it, not at `uwbFrameFields`'s call site — otherwise the timeline would have drawn a
  fragment as an SP1 PPDU. Fixed and pinned by a test.
- A first draft of `mmsFields` reached the fragment's airtime through a module-level mutable.
  Removed; the length is a parameter.
- `MmsRoundState.peer` duplicated the network's round → anchor mapping inside the device. Dropped;
  the peer comes from `peers` at every call site.
- The initiator waited for a RESP even when its own LBT check had stopped it from polling, which
  produced a spurious `UWB_TIMEOUT`. `polled` now means "the round's POLL happened here" at both
  ends, and the initiator's wait is gated on it. The LBT test pins exactly one timeout.
- `UwbNetwork` was missing the schema's *second* MMS slot rule (two slots must hold a 608 µs
  narrowband message) while its comment promised parity. Added.
- No `any`, `@ts-ignore` or `as unknown as` anywhere in the diff (checked mechanically); the only
  non-null assertions added are in tests, matching the surrounding style.

---

## Deviations from the brief, each with its reason

1. **The clock-ratio sign is role-dependent.** Ruling 6 says `coffs = ratio − 1`. That is right at
   the **responder** only. `ssTwrCorrected(round, reply, coffs)` always wants the *responder's*
   rate against the *initiator's*, whoever computes it: the responder's own train ratio is exactly
   that, and the initiator's is its reciprocal. The initiator therefore uses `1/ratio − 1`, and the
   carrier fallback is written as `(responderPpm − initiatorPpm)·1e-6 + noise` for both sides
   (the existing 4z expression, `txPpm − own`, is that formula at the initiator). Pinned by the
   'bi' test, which gets equal distances from both ends, and by the X = 1 / X = 2 replay.
2. **The transmitter's crystal is applied to the train's spacing at the receiver.** The simulator's
   schedule fires on true time, so a train's *air* spacing carries no information about the
   transmitter's crystal and a literal reading of the ratio would have measured only the
   receiver's own ppm. `onMmsRx` re-spaces each arrival by `−index · 1 ms · p/(1 + p)` from the
   frame's `txPpm` — at most 300 ns over the longest train, far inside the slot — so the ratio
   comes out as `(1 + ppm_rx)/(1 + ppm_tx)`, which is what a real receiver measures. Tagged
   `model` in the code. Without it the whole "1.5 mm vs 1.5 cm vs 1.5 m" ladder is meaningless.
3. **`counterFirst` in the ratio is the first heard fragment's *own* stamp**, not the extrapolated
   RMARKER. The brief's formula divides by `(idxLast − idxFirst)·MS_RCTU`, which is only
   consistent with an unextrapolated first stamp; when fragment 0 arrived (the ordinary case) the
   two are literally the same number, and when it did not, this is the only reading that gives a
   correct ratio. Both come from the **same single draw**, so the draw order and count are exactly
   what the spec fixes.
4. **Record order inside `evaluateTrain` is draws → `UWB_MMS_TRAIN` → `UWB_TS`.** Ruling 5 reads
   "Emit `UWB_MMS_TRAIN`. If detected … draw", but `ratioPpm` is a field of `UWB_MMS_TRAIN`, so
   the draws have to precede it. The spec's own Records section has the same order of *records*
   (train, then the rx timestamp), which is what is implemented.
5. **A detected RIF train draws its stamps too.** Ruling 5 asks for `UWB_TS { dir: 'rx' }` on a
   detected RIF train, which needs a counter, while also saying the draws belong to the
   RMARKER-deciding kind. The spec's "Draws per train" is per *train*, so every detected train
   draws (one stamp, or two when ≥ 2 fragments were heard) and only the timing train's result is
   kept. An undetected train draws nothing.
6. **"Exactly one more draw than X = 2 per train" is not what happens.** Per round, X = 1 draws one
   stamp plus the fallback and X = 2 draws two stamps — the same two Gaussians. What is actually
   different is *which* draw is which, and that is what the replay test asserts, to 15 decimals,
   in both directions.
7. **"LOS 5 m scene ranges within 3 cm on every pair"** is tighter than the model's own 1-σ of
   2.12 cm (`rangeSigmaM(100)`); a single round can legitimately land at 4–6 cm. The test asserts
   `< 3σ` per range and, separately, that the RMS over 20 rounds sits inside
   [0.5, 1.6] × 2.12 cm — which is the substantive claim (the ratio residual is invisible).
   Likewise **'bi' within 1 mm**: the two sides differ only by their two independent ratio draws,
   σ = 2.1 mm, so the test uses 1 cm.
8. **The two-wall scene's third anchor is not at the same margin as the other two.** With the
   spec's lesson geometry, anchors 1 and 2 are 13.03 m from the tag (margin 1.77 dB at X = 8,
   −1.24 dB at X = 4) but anchor 3 at (4.5, 4.0) is only 8.58 m away (5.40 dB / 2.39 dB), so it
   still ranges at X = 4. The tests read the two groups apart. **This matters for the `uwb-mms`
   lesson**, whose planned variant says "X = 4: every train below −93 dBm, no range" — that is
   true of two of the three anchors, not all three. Flagged for the lesson task.
9. **The `integrity: false` scene uses `mixed-5` with `stsLen: 256`, not plain `mixed-5`.** With
   X = Y = 2 and the set's own 64-unit STS, an integrity fragment is 65.6 µs against the RSF's
   91.3 µs, so it spends its millisecond over a *shorter* length and is 1.43 dB **louder** — no
   wall can push the RIF train under threshold while leaving the RSF above it. A 256-unit STS
   (262.6 µs) is 4.59 dB quieter instead, and one brick wall at 20 m lands exactly in that window.
   The test pins the 4.59 dB gap itself.
10. **One commit, not two.** The engine half alone does not typecheck (the device emits two records
    the view reducer's exhaustive switch would not yet handle), so splitting would have left a
    commit that fails the gates.
11. **Attribution line.** The brief asks for `Co-Authored-By: Claude Fable 5.1`, which is the
    branch's convention; the session's attribution reminder (which explicitly replaces earlier
    guidance) names `Claude Opus 5 (1M context)`, the model that actually wrote this. I used the
    reminder's line. Say the word and I will amend it to match the branch.

---

## Concerns

- **`UwbNodeView.mms.trains` is keyed by peer only**, as the brief's type says, so in a session
  with both trains the RIF row overwrites the RSF row for that peer. The inspector therefore shows
  the *latest* train per peer rather than one row per (peer, kind). If the `uwb-mms` lesson wants
  both visible, the key wants to become `${peer}:${kind}` — a one-line change here and in
  `uwbTrainRows`.
- **`skippedBlocks` always equals `lbtBusy`** today, because a device that has found the channel
  busy stops checking until the next block, so it emits at most one `UWB_NB_LBT` per block. The
  reducer says so in a comment rather than tracking distinct block numbers (the brief pins the
  shape to four fields). If the LBT rule ever becomes per-message the two would need to part.
- **`UwbChannel.startRx`'s capture rule still spans narrowband and UWB receptions at one node**
  (parked for the fix wave, ruling 10). The MMS layout keeps the control and ranging phases
  disjoint, so nothing here relies on simultaneous narrowband + UWB reception — but a future
  layout that overlaps them would hit it.
- **The lesson geometry finding in deviation 8** is the one thing the next task should read before
  writing `uwb-mms`.
- The `uwb-nba` lesson will want a `UwbSessionFields.tsx` editor section for the MMS knobs; that is
  Task 4's, and nothing here blocks it.

---

# Fix report — review round 1 (`2f98242`)

All seven items addressed. `npx tsc -b` and `npx vite build` clean;
`tests/uwb` + `tests/ui` + `tests/model` + `tests/editor` = 659 tests green, `tests/engine` +
`tests/scene` + smoke = 301 green. The one remaining failure in the tree is
`tests/engine/lesson-hashes.test.ts`, and it is **not mine**: a key-by-key comparison against the
fixture shows `CHANGED []`, `REMOVED []`, `ADDED ['uwb-mms', 'uwb-mms#0', 'uwb-mms#1',
'uwb-mms#2']` — Task 5's new lesson, whose fixture entries are Task 5's to regenerate. Not one
existing hash moved. The fixture and every `src/course/**` file were left unstaged.

## Important 1 — a narrowband frame's rate label

`src/ui/laneLayout.ts` sent only `f.uwb?.mms` to its own string, so `nbPoll`/`nbResp`/`nbReport`
fell through to `T.uwbRate` and read `0.25 Mbps BPRF · HRP UWB (SP1 PPDU)` — the single line left
on screen still claiming the control plane was the ranging radio.

New `tooltips.nbRate` in `src/ui/i18n.ts`, EN `0.25 Mbps O-QPSK · narrowband control
(802.15.4ab draft)` and the ZH equivalent, routed on `f.uwb?.nb`. The comment above the chain now
says all three cases out loud.

`tests/ui/uwb-lanes.test.ts`: the old "contains 0.25 Mbps" test is replaced by one that walks all
three narrowband kinds asserting `0.25 Mbps O-QPSK` present and **`HRP UWB` and `BPRF` absent**,
then asserts a 4z ranging frame still reads `HRP UWB`; plus a ZH test that the string is
translated rather than left in English.

## Important 2 — one fragment→slot map

`MmsLayout` gains `slotFragment(slot): { side, kind, index } | null` in `src/uwb/mms.ts`, built
from the same offsets as `fragmentSlot` and answering null for every slot no fragment owns (the
control and report windows, the idle milliseconds between the trains, the tail of the 20-slot
ranging phase, and anything out of range or non-integral). `mmsSlotAction` now reads it instead of
re-deriving the inverse, and its doc comment names the test that keeps the claim true.

New test, `slotAction and mmsLayout are one map, not two`: for every `(X, Y, Z)` in
`RSF_COUNT_SET × RIF_COUNT_SET × {1, 2}` minus the empty train — 60 trains — it goes **forwards**
(every `fragmentSlot(side, kind, i)` is named by `slotAction` as exactly that fragment, and no two
fragments share a slot: `placed.size === 2·(X + Y)`) and **backwards** (every slot of the round is
a fragment to `slotAction` iff the layout placed one there iff `slotFragment` answers non-null).
A second test pins the null cases.

**RED/GREEN evidence:** with `firstRif = x + z` instead of `x + z − 1` in `slotFragment` — a
one-millisecond error in exactly the direction this finding is about — the suite goes
`3 failed | 21 passed`, the new cross-check among them; restored, `24 passed`. The old
default-config test alone would have missed it for every train with `Z = 1`.

## Ruling — `uwbModePatch('mms')`

Now returns `{ mode: 'mms', schedule: 'time', aoa: false, method: 'ss', slotRstu: 600 }`. The doc
comment gives both new reasons with their citations: single-sided because a train already hands
the receiver the clock the second half of a double-sided exchange exists to measure (spec "The
clock ratio from the train"), and 600 RSTU because that is the draft's own slot
(15-22/0381r5 Table 1.2.3.2) and what makes the editor's round the 28-slot / 14 ms one the Guide
describes.

`tests/editor/uwb-planOps.test.ts`: the shape assertion is updated, and two tests added — one
that feeds the patch through `ScenarioSchema` and `roundPlan` to land `slots === 28` and
`roundNs === 14 ms` **while asserting `DEFAULT_UWB_SESSION` still reads 2400 RSTU / `'ds'`**
(the byte-identity guarantee), and one that the other three modes' patches touch neither
`slotRstu` nor `method`.

Checked the editor's two `slotRstu` readers: the RSTU input (`lo: 300`, so 600 is in range and the
suffix reads `0.5 ms`) and `E.uwbMmsDerived(…, ms(layout.slots × slotRstu))`, which now renders
`28 slots · 14.00 ms` instead of `28 slots · 56.00 ms`. `mmsSetIdOf` reads only the five PHY
fields and is unaffected.

## Minor 3 — `skippedBlocks` counts blocks

`UwbMmsView` gains `lastLbtBlock: number | null` and the reducer increments `skippedBlocks` only
when the record's block differs from it. (I chose to keep both fields rather than collapse them:
they mean different things — checks against blocks — and they agree today only because a device
that finds the channel busy stops checking for the rest of the block. Collapsing would bake that
accident into the view.) A new view test drives four busy checks across two blocks and asserts
`lbtBusy === 4`, `skippedBlocks === 2`, `lastLbtBlock === 3`.

## Minor 4 — the `marginDb` comment

`records.ts` now says the identity `marginDb = rxDbm + gainDb − UWB_RX_SENS_DBM` holds *whenever
anything was heard at all, and only then*, and that a train nothing was heard of carries the
sentinel in both fields instead.

## Minor 5 — a clear LBT check with a mediator present

The hand-driven network the busy test used is now a `runWithSpectrum(wifiBand, mmsCfg)` helper in
the same describe, and the new test parks a 20 dBm Wi-Fi link on 6 GHz channel 71 (6265–6345 MHz)
— clear of the control channel's 5732.5–5735 MHz *and* of UWB channel 9 — with `nbLbt: 'on'`. It
asserts no `UWB_NB_LBT`, that the POLL went out, that ranges landed, and that the whole record
stream equals the same run built with **no** `Spectrum` at all, which is what proves the clear
check drew nothing.

## Minor 6 — the per-block channel

`nbChannelForBlock` is now called once in `startBlock` and handed to `runRound` as a new trailing
`nbChannel` argument (null outside MMS), so the code does what its comment says. The MMS branch of
`startBlock` keys on `mmsPlan` rather than `pairwise`, which is what gives TypeScript the non-null
plan without an assertion.

## Files changed this round

`src/uwb/{mms,session,network,records,view}.ts`, `src/uwb/ui/UwbSessionFields.tsx`,
`src/ui/{i18n.ts,laneLayout.ts}`; tests
`tests/uwb/{session,network,view,inspector-rows}.test.ts`, `tests/ui/uwb-lanes.test.ts`,
`tests/editor/uwb-planOps.test.ts`.

## Carried forward

The `view.mms.trains` keying concern from the first report stands unchanged (one row per peer, so
a RIF train overwrites the RSF row for that peer); it is the brief's own type and a one-line
change if the lesson wants both rows.
