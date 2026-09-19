### Task 1: Config, schema, round plans, frames, hyperbolic solver

**Files:** modify `src/model/scenario.ts`, `src/uwb/phy.ts`, `src/uwb/session.ts`, `src/uwb/frames.ts`, `src/uwb/frameFields.ts`, `src/uwb/position.ts`; tests `tests/uwb/session.test.ts` (+4), `tests/model/uwb-scenario.test.ts` (+3), `tests/uwb/position.test.ts` (+5), `tests/model/uwb-frameFields.test.ts` (+2).

**Interfaces:**

```ts
// scenario.ts — UwbSessionCfg gains:
mode: 'twr' | 'dl-tdoa' | 'ul-tdoa'   // default 'twr'
tdoaClockCorrection: boolean          // default true (DL only)
syncErrorNs: number                   // default 0; schema 0…10 (UL only, model)
// schema: dl-tdoa / ul-tdoa require ≥ 4 anchors (3 differences) and schedule 'time'; dl-tdoa lifts the tags ≤ roundsPerBlock rule
//   (all tags listen to the one anchor round); ul-tdoa requires tags ≤ floor(blockRstu / slotRstu) and slot ≥ blink fit.
// session.ts — RoundPlan gains `mode`; slots: dl-tdoa → anchors + 1 (poll, N−1 responses, final); ul-tdoa → 1 (the blink);
//   rounds: dl-tdoa → one round per block (round 0) that every tag listens to; ul-tdoa → one round per tag as today.
//   slotAction for dl-tdoa: 0 { kind: 'uwbPoll', tx: 'anchor', anchor: 0 }, 1…N−1 { kind: 'uwbResp', tx: 'anchor', anchor: i },
//   N { kind: 'uwbFinal', tx: 'anchor', anchor: 0 }; ul-tdoa: 0 { kind: 'uwbBlink', tx: 'tag' }.
// frames.ts — UwbFrameKind gains 'uwbBlink' (14 octets: MHR 9 + blink IE 3 + FCS 2, model); DL messages reuse poll/resp/final with
//   UwbInfo gaining `dl?: { txCounter: number; rxCounters: Record<string, number>; coffs?: number }` (4 octets per time in the size:
//   poll +4, response +4 +4 +2 (coffs 16-bit), final +4 + 4·(N−1)); frameFields rows for them and for the blink.
// position.ts
export function solveTdoa(anchors: AnchorPos[], refId: string, deltas: { id: string; dtNs: number }[], zTag: number, sigmaRangeM: number): Fix | null
//   residual_i = (‖p − a_i‖ − ‖p − a_ref‖) − c·dt_i; Gauss–Newton from the centroid; ≥ 3 deltas; gdop and ellipse from the
//   difference Jacobian rows (u_i − u_ref); null on < 3 or singular.
```

- [ ] Tests: schema rules; plans (4 anchors DL → 5 slots, one round per block; UL → 1 slot per tag); `slotAction` tables; frame octets and layouts sum; `solveTdoa` exact recovery on the square from exact differences, GDOP at the centre (compute and pin), null on 2 deltas and on collinear anchors.
- [ ] Commit `feat(uwb): TDoA modes in config and plan, DL message times, blink frame, hyperbolic solver`.

---

