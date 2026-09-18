# Final-review fix wave — AMP branch feat/amp-active-tx (head 8d6fb95)

Spec: docs/superpowers/specs/2026-09-18-amp-tier-design.md Part B. `tests/engine/lesson-hashes.test.ts` must stay green (no existing hash may change; lesson scenarios are untouched by this wave). Work in D:\wifi_sim\.claude\worktrees\feat-link-2g only.

## Critical
1. **Lesson 2 RSSI numbers are 6.5 dB off.** `tests/course/amp-slots.test.ts` ~118-124 pins the band-neutral `buildLinkTable` value (−37.2 / −57.2 dBm); the engine applies `LINK_EXTRA_LOSS_DB['2g'] = -6.5` (`src/engine/simulation.ts`, `row.set(k, v - extra)`), so the real values on the 2 m ring are downlink −30.7 dBm (41.3 dB over −72) and uplink −50.7 dBm (43.3 dB over −94). Fix the test to subtract the band offset (as `amp-intro.test.ts` and `amp-coexist.test.ts` do) and update `src/course/amp/amp-slots.ts` ~44-45 in EN and ZH (−30.7 / −50.7 / 41.3 / 43.3). The "under a hundredth of a decibel between them" and "no capture" statements stay true (uniform offset). Keep study time ≤ 25 min.
2. **Guard against recurrence:** add one shared helper to the course tests (e.g. `tests/course/rssi.ts` exporting `rssiOn(link: LinkId, table, from, to)` that applies `LINK_EXTRA_LOSS_DB`) and use it in all three lesson tests instead of hand-applied offsets.

## Important
3. **Frame-detail strings call the Active Tx uplink "backscatter"** in `src/ui/i18n.ts`: en `frameDetail.whatIs.ampAck` ("…unlike the harvested-power backscatter reply it closes"), en `whatIs.ampResp` ("A backscatter tag's answer…"), zh `whatIs.ampAck` ("…由标签以反向散射能量作答的那个时隙"). Reword all three to active transmission on harvested power ("…the tag's own transmission on harvested power" / "以收集到的能量主动发射"), consistent with `amp-intro.ts`, the glossary and README. Verify with a code-point check that no curly quotes changed elsewhere.
4. **`setGeneration` leaves `ampAp` on a non-EHT AP** (`src/editor/FloorPlanEditor.tsx` ~214-220), producing a scenario the schema rejects on run and on reload. Add `ampAp: gen === 'eht' ? n.ampAp : undefined` (mirroring the `linkId` handling). Add a test in `tests/editor/planOps.test.ts` (or a small editor-logic test) that round-trips a scenario with `ampAp` + a tag through `scenarioToJson`/`scenarioFromJson` and that a scenario whose AP is switched to `he` no longer carries `ampAp` (test the pure part; if `setGeneration` is inside the component, extract the node-patch computation into `planOps.ts` as `generationPatch(n, gen)` and test that).
5. **Tag boundary case** (`src/engine/ampSta.ts` ~95-103): in `onAck`, when a tag due in slot k silently missed an Ack, `acksSeen === slot − 1` can become true on the Ack that closes slot k itself (`ackFor >= slot`), so the tag transmits after the round's last Ack, on top of the next trigger. Test `ackFor >= r.slot` FIRST (→ `giveUp()`), then the arming condition. Add a test in `tests/engine/amp-sta.test.ts`: tag armed for slot 4 receives Ack₂, Ack₃ (misses Ack₁ by never sending it) then Ack₄ → no `TX_START`, `AMP_RESULT { sent: false, acked: false }`.

## Minor (fix; all small)
6. `src/ui/Inspector.tsx` ~78: the AMP-round row renders raw `'random'`/`'scheduled'` and English "slot"; add `inspector.ampPhase: Record<'random'|'scheduled', string>` to both i18n tables and use `L.slot`.
7. `src/engine/ampAp.ts` `stats`: unread engine state — delete it (the lessons measure from records). Remove any references.
8. `tests/engine/amp-sta.test.ts`: pin the three seed-scan results as literal seeds with an explicit precondition assertion after arming (e.g. `expect(draw.slot).toBe(2)`); remove the discarded link override at ~117; add a direct `onRxCorrupt → giveUp()` test (armed tag, corrupt reception before its cue → `AMP_RESULT { sent: false }`, no TX). Keep the file's total runtime lower than before.
9. `src/model/view.ts` ~509: gate `n.ampRound = null` on `n.ampRound !== undefined` so STA/tag lanes stay `undefined`. Run `tests/engine/simulation.test.ts` and the AMP replay test afterwards.
10. `src/editor/FloorPlanEditor.tsx` ~600-615: clamp the AMP number inputs to the schema bounds on change (pollIntervalMs 10–10000, slots 1–16, acwe 0–4) so an emptied field cannot produce an invalid scenario.
11. `src/model/scenario.ts` ~291-294: reject `ampTag` on a node whose `kind !== 'amp'` in the same `superRefine` (message containing "AMP tag"); add a schema test.
12. `src/engine/mac.ts` ~1192: remove the redundant `this.corruptLast = false`.
13. `src/ui/Guide.tsx` ~118-120 (EN + ZH): say the slot ticks are on the AP's lane and the labelled wait span is on the tag's lane.
14. Add the study-time CAUTION header comment (as in `amp-slots.ts`) to `src/course/amp/amp-intro.ts` and `amp-coexist.ts`.
15. README "Known simplifications": one bullet stating that Wi-Fi radios receive a DL AMP PPDU as a normal legacy-preamble reception (they defer for its L-SIG length and use AIFS, not EIFS, afterwards), which the coexistence numbers rest on.

## Leave (ledgered, no change)
- `onAmpDone` calling `endTxop()` unconditionally (unreachable coupling); `usig` segment key naming; the AP counting a data frame delivered during a round without acknowledging it (a lost-ACK model, taught in lesson 3); `AMP_RESULT { sent: false }` counting as lost (plan wording).

## Verification before commit
`npx vitest run` (whole suite green), `npx tsc -b`, `npm run build`. One or two commits, e.g. `fix(course,ui): lesson-2 RSSI with the 2.4 GHz offset, active-Tx wording, editor and tag boundary fixes` and `chore(test): shared RSSI helper, pinned seeds, schema guards`; each ends with:
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
