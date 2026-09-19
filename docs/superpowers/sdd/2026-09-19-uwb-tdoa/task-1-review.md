# Task 1 review — config, schema, round plans, frames, hyperbolic solver

Reviewed commit `df37e84` against `task-1-brief.md`, `task-1-report.md`, Slice 5 of
`docs/superpowers/specs/2026-09-19-uwb-slices-design.md` and the controller's rulings on the IE
headers and on GDOP. Task 2's working-tree changes were ignored throughout (the review reads the
committed tree via `git show df37e84:…` where the working copy could be in flux).

## Verdict

- Spec: CHANGES REQUIRED
- Quality: APPROVED

One Medium finding (#1) is the only thing standing between this and a clean spec pass; it is a
one-line restoration of a schema floor. Everything the brief and the controller named as binding
is implemented, and the maths the controller asked to be checked is right.

## Verification run

| check | result |
| --- | --- |
| `npx vitest run tests/uwb/session.test.ts tests/uwb/position.test.ts tests/model tests/engine/lesson-hashes.test.ts` | 15 files, **154 tests, all passing** |
| `npx tsc -b` | exit 0, no diagnostics (Task 2's files included) |
| `grep` for `any` / `@ts-ignore` / `@ts-expect-error` / `as unknown as` in the commit's added lines | none |

## Binding constraints — checked

- **Config.** `mode: UwbMode` default `'twr'`, `tdoaClockCorrection` default `true`,
  `syncErrorNs` default `0` with `z.number().min(0).max(10)`. All three carry `.default(…)`, so an
  older saved scenario still parses. ✔
- **Schema.** `mode !== 'twr'` requires ≥ 4 anchors (message names the count) and rejects a
  contention schedule; `dl-tdoa` skips the tags ≤ block-fit rule; `ul-tdoa` falls through it with
  `uwbSlotsPerTag(… , 'ul-tdoa') = 1`, so 100 tags pass and 101 fail at the defaults, and the
  slot-fit rule asks `uwbSlotFitNs(anchors, 'ul-tdoa')` = the blink. ✔ (but see #1, #2)
- **`RoundPlan.mode`.** Added and carried out of `roundPlan`; `roundsPerBlock` is forced to 1 for
  `dl-tdoa`. ✔
- **Slot layouts / `slotAction`.** DL: `A + 1` slots, slot 0 Poll anchor 0, slots 1…A−1 Resp anchor
  *i*, slot A Final anchor 0, throw beyond. UL: one blink slot, throw beyond. Exactly the brief's
  tables, and pinned by tests. ✔
- **`uwbBlink` 14 octets.** `UWB_MHR_BYTES 9 + BLINK_IE_BYTES 3 + UWB_FCS_BYTES 2`, pinned both as
  the literal 14 and as the constant, with the decoder's row list and PPDU sum checked. ✔
- **DL message extras (controller ruling).** Recomputed from the constants:
  `uwbDlPollBytes(R) = uwbPollBytes(R) + 6 = 33 + 3R` (42 at R = 3), `uwbDlRespBytes() = 14 + 6 + 6 + 4 = 30`,
  `uwbDlFinalBytes(R) = 9 + 3 + 2 + 6 + (2 + 4R) = 22 + 4R` (34 at R = 3). Matches the ruling
  exactly. Every new IE constant is a named export tagged "(model)" (`BLINK_IE_BYTES`,
  `DL_TX_TIME_IE_BYTES`, `dlRxTimesIeBytes`, `DL_COFFS_IE_BYTES`, `dlExtraBytes`) and the decoder
  has one exact row per IE (`ieTxTime`, `ieRxTimes`, `ieCoffs`, `ieBlink`) taken from those same
  constants. ✔
- **Decoder's exact-width throw.** `uwbFrameFields` still throws on both the MHR mismatch and
  `bytes !== f.bytes`, and the new rows are inside that sum — a builder/decoder drift on any DL IE
  would throw rather than display wrong widths. The new tests exercise it through `fieldSum`. ✔
- **`solveTdoa` per the brief.** Residual `r_i = ‖p − a_i‖ − ‖p − a_ref‖ − c·Δt_i` (Δt ns ×
  `C_M_PER_NS`), J rows `u_i − u_ref` from the horizontal parts of the 3-D unit vectors,
  Gauss–Newton from the centroid of the reference plus the anchors used, same `MAX_ITERATIONS` /
  `STEP_TOL_M` / `MIN_DET`. `null` on unknown `refId`, on fewer than 3 usable deltas (the
  reference's own delta and deltas naming unknown anchors are excluded before the count), and on a
  singular JtJ at any iteration or at the covariance step. ✔
- **GDOP (controller ruling).** Recomputed by hand for the 10 × 10 square, tag at the centre,
  reference `a1`: rows `(−√2, 0)`, `(0, −√2)`, `(−√2, −√2)`; `JtJ = [[4, 2], [2, 4]]`, det 12;
  `(JtJ)⁻¹ = [[1/3, −1/6], [−1/6, 1/3]]`; GDOP `= √(2/3) = 0.8164965809277261`. The report's figure
  and the pinned test are **correct**. The ellipse follows: eigenvalues σ²/2 and σ²/6, so
  `a = σ/√2`, `b = σ/√6`, ratio √3, `θ = −π/4`. ✔
- **No silent rescaling.** `fixFrom` uses `sigmaRangeM` exactly as passed (`sigma2 = s*s`); there is
  no √2 anywhere in `solveTdoa` or `accumulateTdoaNormal`. The √2·σ_r convention is left to the
  callers, and the report's caveat says so in the same words as the ruling. ✔
- **`mode: 'twr'` byte-identical.** No fixture, course or lesson file is in the diff;
  `tests/engine/lesson-hashes.test.ts` passes; `solvePosition` is unchanged apart from the tail
  being moved verbatim into `fixFrom`, and its pinned tests still pass. ✔
- **`uwbSlotFitNs` per mode.** `uwbLongestFrameBytes` returns the TWR Final / `max(DL Poll, DL Resp,
  DL Final)` / the blink. The DL max is genuinely the Poll: `33 + 3R > 22 + 4R` for all `R < 11`,
  and the cap is `R ≤ 8`, so the Poll wins in every legal DL configuration. ✔
- **`SlotAction` union extension.** `device.ts`'s `switch (action.kind)` carries no exhaustiveness
  assertion, and `action.tx === 'tag' ? peers.tag : peers.anchors[action.anchor]` still narrows
  correctly now that every `tx: 'anchor'` member has an `anchor: number`. `tsc -b` confirms nothing
  else broke; `src/scene/effects.ts` (which *is* exhaustive over `FrameKind`) and
  `Record<UwbFrameKind, …>` in `format.ts` were both updated. ✔

## Findings

### 1. (Medium · spec) DL-TDoA lifts more than the brief asked: the "does one round fit the block at all" floor is gone

`src/model/scenario.ts:492` — `if (mode !== 'dl-tdoa' && tags > fits)`.

The brief says `dl-tdoa` lifts the *tags ≤ roundsPerBlock* rule. Skipping the whole `if` also
removes its `fits ≥ 1` side effect. For `twr` and `ul-tdoa`, a block shorter than one round gives
`fits = 0`, and since `tags ≥ 1` is already guaranteed, the rule fires. For `dl-tdoa` nothing does:
`blockRstu: 3000, slotRstu: 2400` with 4 anchors (5 slots = 12 000 RSTU) validates cleanly.

`roundPlan` then returns `roundsPerBlock: 1` unconditionally for `dl-tdoa` with
`roundNs > blockNs`, and `UwbNetwork.startBlock` schedules the next block at
`(block + 1) * blockNs` regardless — so the round's slots run past the start of the next block and
the two overlap silently. That is the same class of failure the neighbouring slot-fit rule exists
to catch ("So it is caught here"), and the only mode where it is now unguarded.

Not reachable from the editor (`blockRstu` / `slotRstu` are not exposed there), so the blast radius
is scenario/preset authors — which is exactly Tasks 4–5.

Suggested fix: keep the floor for every mode, e.g. replace the condition with
`if (fits < 1 || (mode !== 'dl-tdoa' && tags > fits))` and word the `fits < 1` case as "the block is
too short for one round of N slots", or add a dedicated `dl-tdoa` check. Worth one test.

### 2. (Minor · spec) The "needs schedule: time" rule can never fire on its own, so one mistake draws two issues

`src/model/scenario.ts:468-473`. `schedule` is `z.enum(['time', 'contention'])`, so
`schedule !== 'time'` is exactly `schedule === 'contention'` — the second `addIssue` is a strict
duplicate of the first. A DS + contention + `dl-tdoa` session produces three issues for what is
really one decision, all on `path: ['uwb']`, and the editor shows them together.

Either drop the second check (the first already says it) or keep only the second and make the first
the special case; the report presents both deliberately, but as written the pair is redundant rather
than complementary.

### 3. (Minor · quality) Each DL frame's size is spelled twice — once in the builder, once in `phy.ts` — and only the `phy.ts` copy feeds the slot-fit rule

`src/uwb/frames.ts:73,98,120` build the sizes inline (`uwbPollBytes(n) + dlExtra(dl)`,
`uwbRespBytes('ds') + dlExtra(dl)`, `UWB_MHR_BYTES + RRMC_IE_BYTES + UWB_FCS_BYTES + dlExtra(dl)`),
while `uwbDlPollBytes` / `uwbDlRespBytes` / `uwbDlFinalBytes` in `src/uwb/phy.ts` restate the same
three sums and are used only by `uwbLongestFrameBytes` and the tests. They agree today (both are
pinned), but they are two definitions of one fact: `uwbDlRespBytes()` hardcodes `dlExtraBytes(1, true)`
and `uwbDlPollBytes` hardcodes `dlExtraBytes(0, false)`, so if a DL Poll ever carried RX times the
builder would grow and the schema's slot rule would not notice.

This is the one place where the report's own claim — "the sizes come from the same function, so a
frame cannot be decoded at a width it was not built at" — holds for the decoder but not for the
slot-fit rule. Suggest the builders call the `uwbDl*Bytes` functions (parameterised by the actual
`rxCounters` count / `coffs` presence) so there is one definition per frame, as `uwbFinalBytes` and
`uwbPollBytes` already manage for TWR.

### 4. (Minor · quality) `UWB_MAX_ANCHORS` and its schema message still assert a TWR-only fact

`src/uwb/phy.ts:229-232` — "The Final is the round's longest frame and grows by 12 octets per
anchor" — and `src/model/scenario.ts:518` — "the Final grows by 12 octets per anchor and must stay
inside the 127-octet PSDU limit". Both are now true only of `twr`; in DL-TDoA the longest frame is
the Poll and the Final grows by 4. The constant's *value* is right in every mode (the report's table
shows 54 vs 122 octets at 9 anchors, so the TWR bound is the conservative one), and that is the
controller's accepted position — but it is documented only in the report, one directory away, while
the comment sitting directly above the new one-way sizing functions still reads as a claim about
every mode. One sentence at the constant would close it.

### 5. (Minor · quality) `solveTdoa` re-derives what `solvePosition` already had

`fixFrom` is a genuine and well-judged extraction — the brief's "reuse the helpers" is largely met.
Two pieces were not reused, though:

- `unitTo` (`src/uwb/position.ts:190`) is called only by `accumulateTdoaNormal`, while
  `accumulateNormal` still inlines the identical `dx/dy/dz → hypot → ux/uy` block. Routing the
  spherical accumulator through `unitTo` is the same arithmetic in the same order, so it stays
  bit-identical and the pinned `solvePosition` tests would still hold.
- The Gauss–Newton iteration body (det guard, `deltaX`/`deltaY`, step tolerance) is copied verbatim
  between the two solvers. A shared `gaussNewton(seed, accumulate)` taking the accumulator as a
  callback would remove ~15 duplicated lines; acceptable as-is, but it is now duplicated code that a
  future third solver would copy a third time.

### 6. (Minor · quality) `makePoll` is now nine positional parameters, and the DL branch silently ignores three of them

`makePoll(tag, anchors, method, block, round, schedule, contentionSlots, maxAttempts, dl)` forces a
DL caller to write the placeholder tail `'time', 8, 3` before reaching `dl` — as the new test does
(`tests/model/uwb-frameFields.test.ts:1318`) and as Task 2 will have to. When `dl` is present the
`schedule` / `contentionSlots` / `maxAttempts` arguments are dropped without comment. Likewise
`makeResp`'s DL branch sizes with `uwbRespBytes('ds')` whatever `method` says, while still storing
that `method` in `UwbInfo` — a DL Response built with `'ss'` would report SS in the inspector at a
DS width (harmless today, since the schema forbids SS + one-way, and the IE list keeps the decoder's
sum correct).

An options object for the optional tail, or a separate `makeDlPoll` / `makeDlResp` pair, would make
the DL call sites read as what they are. Worth deciding before Task 2 writes the call sites rather
than after.

### 7. (Informational · handoff to Task 2) Two mode-blind spots the report's "Not built here" list does not mention

Neither is a Task 1 defect — both live in Task 2's files — but they are not in the handoff notes:

- `src/uwb/format.ts` still formats `UWB_ROUND` as
  `` `… (${r.method.toUpperCase()}-TWR): …` ``, so a DL-TDoA or UL-TDoA round will print "DS-TWR" in
  the log.
- `UwbDevice.transmitFor`'s `switch (action.kind)` has no `uwbBlink` case, so a UL-TDoA blink slot
  currently transmits nothing. (Correct for this commit — nothing schedules one yet — but it is the
  first thing Task 2's UL path needs.)

## Summary

7 findings: 1 Medium, 5 Minor, 1 Informational. The commit is well-tested (12 new tests across four
files, all the brief's pinned values present), the arithmetic the controller flagged for checking is
correct, and the TWR path is provably untouched. Fixing #1 clears the spec verdict.

---

## Re-review (fix round 1)

Scoped to commit `88ed935` (`task-1-fix1.diff`, `df37e84..88ed935`) against the seven findings of
the first review and the controller's rulings on each.

### Verdict

- Spec: APPROVED
- Quality: APPROVED

### Verification run

| check | result |
| --- | --- |
| `npx vitest run tests/uwb/session.test.ts tests/uwb/position.test.ts tests/model tests/engine/lesson-hashes.test.ts` | 15 files, **155 tests, all passing** (one new: the block-fit floor) |
| `grep` for `any` / `@ts-ignore` / `@ts-expect-error` / `as unknown as` in the commit's added lines | none |
| `npx tsc -b` (informational) | exit 0; the only diagnostics are in Task 2's in-flight files (`tests/course/uwb-position.test.ts`, `tests/ui/uwb-format.test.ts`, `tests/uwb/inspector-rows.test.ts`, `tests/uwb/view.test.ts` — all reacting to `UWB_ROUND.mode` / `UWB_POSITION.method` being added to `records.ts`). Nothing in a Task 1 file. |

### Ruling-by-ruling

**(1) Block-fit floor restored for every mode — CLOSED.** `src/model/scenario.ts` now reads
`if (fits < 1) { … } else if (mode !== 'dl-tdoa' && tags > fits) { … }`, so the floor is a
precondition of the tags rule rather than a side effect of it, and the two messages cannot both
fire. The new message names the block, the slot count and the slot length, which is what an author
needs to fix it. `tests/model/uwb-scenario.test.ts` pins all three modes at
`blockRstu 3000 / slotRstu 2400` with 4 anchors: `dl-tdoa` (5 slots) and `twr` (10 slots) throw
`/block of 3000 RSTU is too short for one round/`, `ul-tdoa` (1 slot, fits exactly) does not — and
the test also asserts the tags-per-block message is *absent*, which is the "replaces, not doubles"
half of the rule. Re-derived by hand: 5 × 2400 = 12 000 > 3 000 → `fits = 0`; 1 × 2400 ≤ 3 000 →
`fits = 1`. The existing `/fits 10 tags/` and `/fits 11 tags/` expectations are unaffected because
both have `fits ≥ 1`.

**(2) One schedule issue per mistake — CLOSED.** The two `addIssue` calls are merged into one
`mode !== 'twr' && schedule !== 'time'` rule carrying both halves of the sentence
("contention-based rounds are two-way ranging only; one-way ranging needs a time-scheduled
session"). The existing `/contention-based rounds are two-way ranging only/` expectation still
matches, and a new `safeParse` assertion pins `issues` at length 1 for both TDoA modes. The
neighbouring `contention && method !== 'ss'` rule is untouched and remains a genuinely different
mistake, correctly isolated in the test by using `method: 'ss'`.

**(3) One source for each DL frame's size — CLOSED as ruled.** The three builders now call
`uwbDlPollBytes(responders, rxCount(dl), dl.coffs !== undefined)`,
`uwbDlRespBytes(rxCount(dl), …)` and `uwbDlFinalBytes(rxCount(dl), …)`; `dlExtra` in `frames.ts` is
gone, replaced by the content-counting `rxCount` helper that also feeds `dlIes`, so the IE list and
the octet count are driven by one expression. The `phy.ts` functions took content parameters
defaulting to the canonical round (Poll 0 RX / no coffs, Response 1 RX / coffs, Final R RX / no
coffs), which keeps `uwbLongestFrameBytes` returning the same 33 + 3R / 30 / 22 + 4R as before —
verified: the byte-table tests (42 / 30 / 34) and the slot-fit tests are unchanged and still pass.
Equality is pinned directly (`dlPoll.bytes === uwbDlPollBytes(3, 0, false)` and the two siblings)
and, better, in the growth direction: `pollWithRx` and `respNoCoffs` build non-canonical content and
are checked against the same functions *and* against the decoder's `fieldSum`. That is the
regression that would have caught the original drift.

**(4) `UWB_MAX_ANCHORS` reworded — CLOSED.** Both places: the schema message now says "the **TWR**
Final grows by 12 octets per anchor … (the one-way modes' frames are shorter, so the same cap is
conservative for them)", and the constant's doc comment states the one-way bound explicitly. Its
arithmetic checks out — the DL Poll at nine anchors is 33 + 3 × 8 = 57 octets, well under 127.

**(5) Shared solver helpers, `solvePosition` bit-identical — CLOSED.** `accumulateNormal` now calls
`unitTo`, and the Gauss–Newton iteration is extracted into
`gaussNewton(x0, y0, accumulate)` with the accumulator passed as a closure; both solvers seed a
`cx`/`cy` centroid and finish with `fixFrom(p.x, p.y, accumulate(p.x, p.y), usable.length, sigma)`.
Read operation for operation, the refactor is arithmetically identical to the old code: `unitTo`
computes the same `dx/dy/dz → hypot → dist3 > 0 ? d/dist3 : 0`, the loop keeps the same det guard,
the same step formulas, the same order of `x += deltaX` before the tolerance test, and the same
`null`-on-singular exit (now surfaced through `gaussNewton` returning null). The pinned
`solvePosition` tests — including the exact-recovery and GDOP-at-the-centre values — still pass
unchanged, which is the evidence that matters. Net: ~30 lines of duplication removed and the third
solver, if one ever comes, has a seam to use.

**(6) `makePoll` signature — parked by ruling.** Unchanged, as ruled; noted as closed here, not
carried forward.

**(7) Task 2 hand-off items — forwarded.** `format.ts`'s `-TWR` label and the missing `uwbBlink`
case in `device.transmitFor` are Task 2's; the in-flight `records.ts` diagnostics above show that
work is under way.

### Remaining

No open findings. One note for the record, needing no change now:

- **(Informational)** `uwbLongestFrameBytes` still measures the *canonical* round's content, since
  it calls `uwbDlPollBytes(anchors − 1)` / `uwbDlRespBytes()` / `uwbDlFinalBytes(anchors − 1)` on
  their defaults. That is correct and deliberate — the schema cannot know what a future round will
  carry, and the new comment in `phy.ts` says so. But the fix's own `pollWithRx` test builds a
  52-octet Poll where the slot rule measures 42, so if Task 2's DL round ever puts content on a
  frame beyond the canonical shape, `uwbLongestFrameBytes` has to be told about it or the slot-fit
  rule will under-size the slot. Worth a line in the Task 2 brief rather than a change here.
