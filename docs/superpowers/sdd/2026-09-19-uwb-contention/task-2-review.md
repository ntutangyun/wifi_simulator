# Task 2 review — contention-based response slots: behaviour, record, view, log, inspector, editor

Commit under review: `a25364d` (15 files, +516 / −29). The other agents' uncommitted
`docs/superpowers/sdd/2026-09-19-uwb-coexist/` files that ride along in the review package were
ignored, as instructed.

## Verdict

- Spec: APPROVED
- Quality: APPROVED

Every binding constraint in the brief is met, the whole suite is green, and nothing found is
worth blocking on. Seven minor findings follow; none changes a number the lesson will quote.

## What was checked

- Read in full: `src/uwb/device.ts`, `src/uwb/network.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`,
  `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, and the diff of `src/ui/format.ts`, `src/ui/i18n.ts`,
  `src/uwb/ui/UwbInspector.tsx`, `src/uwb/ui/UwbSessionFields.tsx` plus all five test files.
- Cross-read for the invariants: `src/uwb/channel.ts` (capture/doom, `endRx` ordering),
  `src/uwb/session.ts` + `src/uwb/phy.ts` (`uwbSlotsPerTag` → `1 + contentionSlots`),
  `src/engine/rng.ts` (`int(maxInclusive)` is inclusive), `src/model/scenario.ts` (field bounds).
- `npx vitest run tests/uwb tests/ui/uwb-format.test.ts tests/engine/lesson-hashes.test.ts tests/editor`
  → 17 files, 199 tests, all green.
- `npx vitest run` (whole suite) → 104 files, **1228 tests, all green**, the other agents' in-flight
  files included.
- `npx tsc -b` → clean, exit 0.

### The binding constraints, one by one

| Constraint | Where | Verdict |
|---|---|---|
| `attemptsLeft === 0` → `UWB_CONTEND { slot: null, attempt: 0 }`, reset, silent | `device.ts:365-369` | met |
| Sit-out resets to `maxAttempts`, **not** `maxAttempts − 1` | `device.ts:366` sets the full budget and leaves `contendSlot` null, so `endRound` (`device.ts:222-224`) cannot decrement it. The next draw reports `attempt 1` — pinned by the `[[2,1],[1,2],[1,3],[null,0],[1,1],…]` assertion in `network.test.ts` | met |
| One uniform draw over 1…S | `1 + rng.int(plan.contentionSlots - 1)` with `Rng.int` inclusive (`rng.ts:25-28`) → exactly [1, S]; χ² 10.48 < 30 on 7 df | met |
| Draw taken **after** the timestamp and CFO draws | both `gaussian` calls are unconditional and precede the `switch` (`device.ts:290-296`); the draw sits in `case 'uwbPoll'` (`device.ts:312`), and is guarded by `schedule === 'contention'`, so a time round consumes exactly what it always did. `lesson-hashes.test.ts` green and the fixture untouched; `network.test.ts` additionally asserts a 4-anchor time run is `toEqual` across `contentionSlots: 31, maxAttempts: 9` | met |
| `attempt = maxAttempts − attemptsLeft + 1` | `device.ts:373` | met |
| Feedback at round end via the tag's ranged set | `network.ts:127-131`: tag's `endRound()` first, `new Set(...)` of `r.ranges.map(x => x.id)`, then each anchor with `heard.has(id)` | met |
| `heard` from **this round's** `UWB_RANGE`s only | `r.ranges` lives in `RoundState`, rebuilt by `freshRound` (`device.ts:113-121`) and pushed only in `reportRange` for a tag | met |
| Anchor that missed the Poll neither draws nor decrements | `drawContentionSlot` is reachable only from a decoded Poll, so `contendSlot` stays null and `endRound`'s `contendSlot !== null` guard skips it | met (untested — finding 3) |
| Tag listens 1…S, no `UWB_TIMEOUT` for an empty slot | `listenOpen` (`device.ts:389-392`), `closeSlot`'s `!exp.open && exp.from !== null` (`device.ts:344`); `expect(of(rs,'UWB_TIMEOUT')).toEqual([])` over six rounds | met |
| Channel dooms/captures; nothing added there | `channel.ts` untouched by this commit; `UWB_CAPTURE_DB` rule at `channel.ts:259-265` | met |
| `UWB_CONTEND_COLLISION` once per slot, capture included | keyed on `r.contendCollisionSlot` (`device.ts:264-271`); documented in `records.ts:26-28`, `i18n.ts` `contendCollisionsHint` EN **and** ZH | met |
| View `contend` / `contendCollisions` | `view.ts:43-48, 117-127` | met |
| Log lines | `format.ts:35-41`, asserted verbatim in `uwb-format.test.ts` | met |
| Inspector rows EN/ZH | `UwbInspector.tsx` rows + `uwbContendText` in `rows.ts`, both languages asserted in `inspector-rows.test.ts` | met |
| Editor fields disabled unless SS / contention | `UwbSessionFields.tsx:60-78` | met |
| `UWB_ROUND.slots` = 1 + S | `uwbSlotsPerTag` returns `1 + contentionSlots`; `expect(round.slots).toBe(3)` for S = 2 | met |
| Collision counter not double-counting doomed pairs | one record for the two `RX_FAIL collision` of round 0, asserted | met |
| χ² not flaky | single scenario, single seed, fully deterministic (the determinism test runs the same scenario twice) — a fixed 10.48 against a bound of 30 | met |
| No `any` / `@ts-ignore` / `as unknown as` | grep over all ten changed source files and five test files: nothing new. The one `as unknown as number` at `tests/editor/uwb-planOps.test.ts:127` is pre-existing and outside this commit's hunks | met |

Also checked and sound: `r.slot` is still the response slot when `onRxFail` fires, because
`endRx` is queued at `rx.endNs` and `UWB_SLOT_GUARD_NS` (200 ns) keeps every PPDU strictly inside
its slot, so the priority-0 slot boundary never precedes the priority-1 reception end; and
`contendCollisionSlot` can be a single number rather than a set because a round visits each slot
once, in increasing order.

## Findings

All minor. Numbered by descending usefulness, not severity.

1. **minor — `src/uwb/format.ts:5`: the header still says "the eight UWB types".**
   There are now ten (`UWB_CONTEND`, `UWB_CONTEND_COLLISION` were added). `src/ui/format.ts:71`
   got the same sentence updated to "ten" in this very commit; its sibling was missed.
   *Why it matters:* the two comments now contradict each other, and the count is the only thing
   telling a reader the `switch` is exhaustive.
   *Do:* change "eight" to "ten" in `src/uwb/format.ts:5`.

2. **minor — `src/uwb/device.ts:44` and `:360`: the doc-comments credit IEs the code never reads.**
   `UwbDeviceCfg.maxAttempts` is described as "the retry budget the Poll's RCMA IE advertises" and
   `drawContentionSlot` draws "over the window the RCPS IE advertised", but the anchor uses
   `this.cfg.maxAttempts` and `r.plan.contentionSlots` — both taken from the session, never from the
   received frame, although `frame.uwb.contention = { firstSlot, lastSlot, maxAttempts }` is right
   there (the test asserts it).
   *Why it matters:* no behavioural difference today (one session, one plan, all devices configured
   from it), but the comment claims a data path that does not exist, which is exactly the
   stated-vs-simulated drift this project keeps tripping over — and a lesson could quote it.
   *Do:* either read the two numbers off `frame.uwb.contention` in the `uwbPoll` case (preferred —
   it also makes the IEs load-bearing rather than decorative), or reword both comments to say the
   anchor is configured with the same value the Poll advertises.

3. **minor — no test pins "an anchor that never heard the Poll neither draws nor decrements".**
   This is the one semantics carve-out the report calls out explicitly (`task-2-report.md:42-44`)
   and the only branch of `endRound`'s `contendSlot !== null` guard that nothing exercises: every
   contention test has all anchors decode the Poll.
   *Why it matters:* deleting the guard leaves all 1228 tests green while silently making a missed
   Poll cost an attempt — the exact regression the guard exists to prevent.
   *Do:* add one case to `tests/uwb/network.test.ts` — an anchor far enough out to fall below
   `UWB_RX_SENS_DBM` (or behind a wall) beside a near one — and assert it emits no `UWB_CONTEND`
   at all and that the near anchor's attempt sequence is unaffected.

4. **minor — `src/uwb/ui/UwbSessionFields.tsx:68` and `:74`: the disabled-field tooltip gives the
   wrong reason in the common case.**
   Both fields fall back to `E.uwbSsOnly` ("a contention round has only the response to place;
   DS-TWR would need a second window…") whenever `contending` is false — including the default
   session, which is SS-TWR with `schedule: 'time'`. There the fields are greyed out because the
   schedule is not contention, and the tooltip talks about DS-TWR instead.
   *Why it matters:* the tooltip is the only affordance telling a learner how to enable the field,
   and it points at the wrong select.
   *Do:* add one string (e.g. `uwbContentionOnly`, EN + ZH) and use it when `ssOnly && !contending`,
   keeping `uwbSsOnly` for the DS-TWR case. The schedule select at `:60` is already correct.

5. **minor — `src/uwb/ui/UwbSessionFields.tsx:49-57`: the method→schedule patch is the one new
   invariant with no test behind it.**
   "The editor can never leave the plan in the pair the schema rejects" is a deviation from the
   brief and a real correctness claim, but it lives inline in a `.tsx` `onChange`, and this repo has
   no component-rendering tests — `tests/editor/uwb-planOps.test.ts:88-99` only asserts that the
   schema *rejects* the bad pair, with a comment pointing at code nothing executes.
   *Why it matters:* the project's own convention is that anything a learner can see is computed by
   a pure, tested module (`rows.ts` is the model); this one escaped it.
   *Do:* extract the patch to a pure helper beside `roundPlan`/`uwbSessionIssue` (e.g.
   `uwbMethodPatch(method): Partial<UwbSessionCfg>`), call it from the select, and assert both
   directions in `tests/editor/uwb-planOps.test.ts`.

6. **minor — `src/uwb/device.ts:216`: `endRound(heard = false)` defaults the anchor to "not heard".**
   The single call site in `network.ts:131` always passes the flag, so this is latent only; but the
   default silently means "spend an attempt", which is the failure-shaped value.
   *Why it matters:* a future call site that forgets the argument (a lesson harness, a new mode)
   burns the retry budget with no diagnostic.
   *Do:* make the parameter required (`endRound(heard: boolean): string[]`) and pass `false`
   explicitly from the tag's call in `network.ts:129`, or split the tag and anchor paths.

7. **minor, carried over from task 1 (out of this commit's scope) — `src/uwb/session.ts:1-16`.**
   The file header still reads "every slot belongs to exactly one device" and "that is the whole
   point of a scheduled (as opposed to contention-based) ranging session: no device ever contends
   for the medium", and its round-layout list has no contention line — yet `roundPlan` and
   `slotAction` in the same file now implement schedule mode 0, and task 2's whole point is that two
   anchors *can* land in one slot. Task 1's review did not flag it.
   *Why it matters:* it is the first thing a reader of the scheduler sees, and it now denies the
   feature the file implements.
   *Do:* fold it into slice 4's remaining tasks — add the contention layout
   (`slot 0 Poll (tag) | slots 1..S Response (whichever anchor drew the slot)`) and qualify the
   "no device ever contends" sentence with "in a time-scheduled session".

## Notes on the report's deviations

All five deviations in `task-2-report.md:131-145` were checked and are accepted:
the dedicated `UWB_CONTEND_COLLISION` record (controller ruling), its emission in a captured slot
(documented in `records.ts`, the inspector hint and both languages — verified), the method-select
side effect (finding 5 is about its test, not its correctness), the absence of a seed search, and
the explicit `open` flag on `Expectation` (which reads better than inferring it from `from === null`
and is what makes `closeSlot`'s two conditions separable).

The measurement table (`task-2-report.md:99-103`) is reproduced exactly by the `it.each` in
`tests/uwb/network.test.ts`, and the ±0.5 responses/round band around N·(1−1/S)^(N−1) holds at all
three variants with the sit-out explanation commented in place — so the numbers task 3's lesson may
quote are pinned by a test, not by prose.
