### Task 1: Session config, schema, round plan

**Files:** modify `src/model/scenario.ts`, `src/uwb/phy.ts` (`uwbSlotsPerTag`), `src/uwb/session.ts`, `src/uwb/frames.ts` (poll IEs), `src/model/frameFields.ts` / `src/uwb/frameFields.ts` (RCPS / RCMA rows); tests `tests/uwb/session.test.ts` (+3), `tests/model/uwb-scenario.test.ts` (+3), `tests/model/uwb-frameFields.test.ts` (+1).

**Interfaces:**

```ts
// scenario.ts — UwbSessionCfg gains:
schedule: 'time' | 'contention'   // default 'time'
contentionSlots: number           // default 8; schema int 2…32 (model default)
maxAttempts: number               // default 3; schema int 1…10 (model default)
// schema rule: schedule 'contention' requires method 'ss' (message: "contention-based rounds are SS-TWR only in this simulator")
// DEFAULT_UWB_SESSION gains the three defaults.
// phy.ts
export function uwbSlotsPerTag(method, anchors, schedule = 'time', contentionSlots = 8): number
//   time: as today; contention: 1 + contentionSlots
// session.ts — RoundPlan gains `schedule` and `contentionSlots`; slotAction(p, slot) for contention returns
//   { kind: 'uwbResp', tx: 'anchor', anchor: -1 } for slots 1…contentionSlots (any anchor may answer).
// frames.ts — makePoll(...) for a contention session lists IEs ['ARC', 'RCPS', 'RCMA', 'RRMC'] instead of RDM;
//   bytes: RCPS IE 4 (2 hdr + first slot 1 + last slot 1), RCMA IE 3 (2 hdr + max attempts 1) → poll = 27 − (3 + 3N) + 4 + 3 = 31 octets (model sizing);
//   UwbInfo gains `contention?: { firstSlot: number; lastSlot: number; maxAttempts: number }`.
// frameFields: rows for RCPS ("response phase slots 1…8") and RCMA ("max attempts 3").
```

- [ ] Tests: schema rejects `{ schedule: 'contention', method: 'ds' }`, accepts with `ss`; `contentionSlots` bounds; `roundPlan` for contention/4 anchors → 9 slots; `slotAction` for slot 3 → anchor −1; a contention poll is 31 octets with the two IEs decoded and summing.
- [ ] Commit `feat(uwb): contention schedule config, RCPS/RCMA IEs and the contention round plan`.

---

