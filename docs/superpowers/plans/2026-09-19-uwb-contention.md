# UWB Slice 4 — Contention-Based Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add schedule mode 0 (contention-based ranging, §10.32.2, RCPS / RCMA IEs) to SS-TWR sessions: responders pick a response slot at random, collide, retry and sit out; plus the lesson "When the controller does not know who is there".

**Architecture:** The session config gains `schedule`, `contentionSlots`, `maxAttempts`; `roundPlan` sizes a contention round as `1 + contentionSlots` slots; the anchor draws its slot from its own RNG stream when it decodes the poll and answers there; the channel's existing 6 dB capture rule decides collisions at the tag; a `UWB_CONTEND` record and view/log/inspector/editor additions follow the seams.

**Tech Stack:** existing.

**Spec:** `docs/superpowers/specs/2026-09-19-uwb-slices-design.md` (Slice 4).

## Global Constraints

- Existing scenarios unchanged: hash fixture passes without regeneration until the lesson task (additions only then).
- `schedule: 'time'` is the default; every existing code path is byte-identical when it is set.
- Determinism: the slot draw uses the anchor's existing per-node `Rng` (one draw per poll decoded, after the timestamp-noise and CFO draws of that reception — document the order); retries and sit-outs are per-anchor state, not shared.
- Tags: `standard §10.32.2 / §10.32.9.5 (RCPS IE) / §10.32.9.6 (RCMA IE) / §10.32.1 NOTE` for the mechanism; `contentionSlots` 8 and `maxAttempts` 3 defaults are **model**.
- EN + ZH everywhere; lesson contract; `npx tsc -b`, `npx vite build`, `npx vitest run` green; no `any` / `@ts-ignore` / `as unknown as`; commit per task by pathspec with the two trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`.
- Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`, plain single git commands.

---

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

### Task 2: Device behaviour, record, view, log, inspector, editor

**Files:** modify `src/uwb/device.ts`, `src/uwb/network.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, `src/uwb/ui/UwbInspector.tsx`, `src/uwb/ui/UwbSessionFields.tsx`, `src/ui/i18n.ts`; tests `tests/uwb/network.test.ts` (+5), `tests/uwb/view.test.ts` (+1), `tests/ui/uwb-format.test.ts` (+1), `tests/editor/*` (+1).

Behaviour (anchor, contention round):
- On decoding the poll: if `attemptsLeft === 0` (sitting out) → set `attemptsLeft = maxAttempts`, emit `UWB_CONTEND { node, slot: null, attempt: 0 }` and stay silent this round; else draw `slot = 1 + rng.int(contentionSlots − 1)` (uniform over the response window), emit `UWB_CONTEND { node, slot, attempt }` (attempt counts from 1), and answer in that slot (SS response with RRTI as today).
- Learning the outcome: SS-TWR gives the anchor no feedback; **model**: the network tells the anchor at round end whether the tag emitted a `UWB_RANGE` for it (the tag's `endRound` returns the set of anchors heard; the network passes `heard: boolean` to each anchor's `endRound`). Heard → `attemptsLeft = maxAttempts`; not heard → `attemptsLeft −= 1` (0 = sit out next round). The lesson states this model choice and quotes §10.32.1 NOTE.
- Tag: listens through slots 1…contentionSlots (state `uwbWait` per slot as today); the channel's overlap rule (weaker doomed; both doomed within 6 dB) produces `RX_FAIL collision` at the tag; a captured response counts as a normal range.
- Records: `UWB_CONTEND { type; node; slot: number | null; attempt: number }`; `UwbNodeView.contend: { slot: number | null; attempt: number } | null` + `contendCollisions` (count of RX_FAIL collision at the tag for uwbResp — the tag's lane); log line `${node} contends: slot ${slot} (attempt ${attempt})` / `${node} sits out this round`; inspector rows; session fields: schedule select, contention slots, max attempts (EN/ZH), disabled unless method SS.
- `UWB_ROUND.slots` = the plan's slots (1 + contentionSlots).

- [ ] Tests: two anchors forced to the same slot (seed search or a deterministic RNG stub) → RX_FAIL collision at the tag, no range for either, both `attemptsLeft` decrement; an anchor 6 dB stronger in the same slot is captured → one range; after `maxAttempts` unheard rounds the anchor sits out exactly one round (a `UWB_CONTEND` with slot null) then draws again; the draw is uniform over 1…contentionSlots across 200 rounds (χ² loose bound) and identical across two runs; `schedule: 'time'` runs are byte-identical to before (hash fixture untouched); the editor fields save a valid session.
- [ ] Commit `feat(uwb): contention-based response slots with collisions, retries and sit-outs`.

---

### Task 3: Lesson "When the controller does not know who is there"

**Files:** create `src/course/uwb/uwb-contention.ts`, `tests/course/uwb-contention.test.ts`; modify `src/course/lessons.ts`, `src/course/lessonKit.ts` (`firstUwbContend`, `firstUwbCollision`); fixture additions only.

Lesson (`id 'uwb-contention'`, module 14): six anchors on a ring around a tag at the room centre (radius 3.5 m, every 60°, all z 2.2, tag z 2.2 so ranges are exact), SS-TWR, `schedule: 'contention'`, `contentionSlots` 8 base; variants 4 slots / 16 slots (labels "4 response slots" / 4 个应答时隙, "16 response slots" / 16 个应答时隙), nlos off, ppm drawn. Body: source sentence (§10.32.2 schedule mode 0, RCPS §10.32.9.5, RCMA §10.32.9.6, the §10.32.1 NOTE about the upper layer filtering wrong results; defaults 8 / 3 and the feedback model are model); why a controller may not know its controlees; the draw and the window; the analytic model `P(uncontested) = (1 − 1/S)^(N−1)`, expected successes `N·(1 − 1/S)^(N−1)` (6 anchors: S = 4 → 1.42, 8 → 3.08, 16 → 4.35 — verify with the formula and pin), measured over 30 rounds within a stated tolerance (pin values and a 4σ binomial envelope); capture within 6 dB — with equal distances almost never, so collisions are collisions (pin the capture count); retries and sit-outs (pin a sit-out occurrence or its absence with the reason); the cost: 9 slots = 18 ms round vs 7 slots time-scheduled; when to prefer time scheduling. 4 observe + 2 tryThis + 3 quiz; `lessonMinutes` ≤ 25.

- [ ] Steps as before; commit `feat(course): UWB lesson "When the controller does not know who is there"`.

---

### Task 4: Docs

**Files:** `src/ui/Guide.tsx` (two sentences in section 11), `src/ui/glossary.ts` (terms: contention-based ranging, RCPS IE, RCMA IE), `README.md` (rows), `src/editor/EditorGuide.tsx` (session fields), `tests/ui/uwb-guide.test.ts` (+2).

- [ ] Commit `docs(uwb): contention-based rounds in the guide, glossary and README`.

## Self-review

Slice 4 spec → Tasks 1–2 (engine/model/UI), 3 (lesson), 4 (docs). Names consistent: `schedule`, `contentionSlots`, `maxAttempts`, `UWB_CONTEND`, `RoundPlan.schedule`, `slotAction … anchor: -1`.
