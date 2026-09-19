# Task 1 review — session config, schema, round plan

Reviewed: commit `7abebde` (`feat(uwb): contention schedule config, RCPS/RCMA IEs and the contention
round plan`), against `task-1-brief.md` and Slice 4 of
`docs/superpowers/specs/2026-09-19-uwb-slices-design.md`.

## Verification performed

- `npx vitest run tests/uwb/session.test.ts tests/model tests/engine/lesson-hashes.test.ts` — 14 files,
  133 tests, all pass, including `tests/engine/lesson-hashes.test.ts` (time-scheduled behaviour is
  byte-identical; fixture untouched).
- `npx tsc -b` — clean, no errors (working tree is otherwise clean; Task 2 has not yet touched
  `device.ts`/`network.ts`/etc., so there is nothing of theirs to exclude).
- Read every changed file in full: `src/model/scenario.ts`, `src/uwb/phy.ts`, `src/uwb/session.ts`,
  `src/uwb/frames.ts`, `src/uwb/frameFields.ts`, `src/model/frameFields.ts`, `src/ui/i18n.ts`, and the
  three test files.
- Checked every call site of `uwbSlotsPerTag` and `roundPlan` in `src/` (`scenario.ts`, `session.ts`,
  `network.ts`, `scene.ts`, `uwb/ui/UwbSessionFields.tsx`) and every place a `UwbSessionCfg` literal is
  built (`lessonKit.ts`, `planOps.ts`) to confirm none needed changes.
- Grepped the diff for `any`/`@ts-ignore`/`as unknown as` — none found (only prose "any anchor").

## Findings

1. **Minor.** `src/uwb/phy.ts:206-208` (`uwbSlotFitNs`) — not updated to take `schedule`/`contentionSlots`,
   and its caller `src/model/scenario.ts:462` (`uwbSlotFitNs(anchors)`) still sizes the "longest frame in
   the round" from `uwbFinalBytes(anchors)`, which is never actually sent when `schedule === 'contention'`
   (contention is SS-TWR only, so there is no Final). For `anchors === 1`, `uwbFinalBytes(1) = 26` octets,
   but the actual longest frame in a contention round is the 31-octet contention Poll
   (`uwbPollBytes(1, 'contention') = 31`) — the schema's slot-fit check would size the round from the
   smaller, wrong number.
   **Why it doesn't currently bite:** the schema's `slotRstu` floor is 300 RSTU (`z.number().int().min(300)`
   in `ScenarioSchema`), i.e. 250 000 ns, comfortably above both the wrong requirement (26 B → ~193.7 µs)
   and the correct one (31 B → ~198.9 µs + guard), so no scenario can currently trigger a false pass. For
   `anchors ≥ 2`, `uwbFinalBytes` is already ≥ 38 B > 31 B, so the estimate stays conservative there.
   **What to do:** either make `uwbSlotFitNs` schedule-aware (`Math.max` the Final-based bound against
   `uwbPollBytes(anchors, schedule)`/`uwbRespBytes('ss')` when `schedule === 'contention'`), or add a
   one-line comment at `uwbSlotFitNs` noting the anchors-fixed Final bound doesn't hold in the
   single-anchor contention case and why the 300 RSTU floor currently masks it. Not blocking: no test or
   real scenario exercises `anchors === 1` with `schedule: 'contention'`, and the schema floor makes the
   gap unreachable today, but it is a latent correctness gap the next person touching the RSTU floor (or
   adding a "tight timing" lesson) could reopen silently.

No other issues found. Spec-mandated shapes (`UwbSessionCfg.schedule/contentionSlots/maxAttempts` with the
'time'/8/3 defaults and 2…32 / 1…10 bounds; the SS-only contention rule with the exact message; the shared
`uwbSlotsPerTag(method, anchors, schedule, contentionSlots)` signature; `RoundPlan.schedule/contentionSlots`;
`slotAction`'s `{ kind: 'uwbResp', tx: 'anchor', anchor: -1 }` for every contention slot; the poll's
`['ARC', 'RCPS', 'RCMA', 'RRMC']` IE order at exactly 31 octets with `RCPS_IE_BYTES = 4` /
`RCMA_IE_BYTES = 3`; `UwbInfo.contention`; the new decoder rows) all match the brief exactly and are
exercised by the added tests, which pass. The decoder's exact-width throw (`frameFields.ts:151` /
`uwbFrameFields`'s own sum check) is not tripped by the 31-octet poll — verified both by the new test and
by hand (9 MHR + 10 ARC + 4 RCPS + 3 RCMA + 3 RRMC + 2 FCS = 31).

## Verdict

Spec: APPROVED
Quality: APPROVED
