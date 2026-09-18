# Task 4 review — model seams for UWB (node kind, session config, records, frames, lanes, view)

Reviewed: commit `e8fe158` (`f015145..e8fe158`), worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`.
Inputs: `task-4-brief.md`, `task-4-report.md`, `task-4-review.diff` (18 files, +627/−10).
Uncommitted Task 5 work (`src/uwb/channel.ts`, `src/engine/propagation.ts`, `tests/uwb/channel.test.ts`) was ignored.

Verification run in the worktree:

- `npx vitest run tests/model tests/uwb tests/engine/lesson-hashes.test.ts` → **17 files, 133 tests, all passing** (incl. `tests/model/caps.test.ts`, `tests/model/view.test.ts`, `tests/model/frameFields.test.ts`, `tests/engine/lesson-hashes.test.ts`).
- `npx tsc -b` → clean (exit 0).

## Verdict

Spec: APPROVED
Quality: APPROVED

## What was checked against the binding constraints

**Interface block, name by name.** Every type, field and signature in the brief exists with the exact name and shape:

- `NodeKind = 'ap' | 'sta' | 'amp' | 'uwb'` (`src/model/types.ts:10`).
- `UwbNodeCfg` / `UwbSessionCfg` / `DEFAULT_UWB_SESSION` (`src/model/scenario.ts`): all seven session fields, values `ds / 240_000 / 2400 / 9 / 100 / 0.2 / true` — identical to the brief. `NodeCfg.uwb?`, `Scenario.uwb?` present.
- `UwbRecord` (`src/uwb/records.ts`): six variants, every field name and type as specified, including the optional `fom?` on `UWB_TS` and `tofRawRctu?` on `UWB_RANGE`. `MacStateName` gains `'uwbWait'`; `TLRecord` gains `| UwbRecord` via a type-only import.
- `UwbFrameKind`, `UwbInfo` (with `sp: 1`) and the four builders (`src/uwb/frames.ts`): signatures match parameter-for-parameter. `durationFieldNs: 0`, `mbps: 6.81`, `txTimeNs = uwbPpduNs(bytes)` on all four; `makePoll`/`makeFinal` broadcast (`dst: '*'`), `makeResp`/`makeReport` address the tag; bytes come from `uwbPollBytes(anchors.length)` / `uwbRespBytes(method)` / `uwbFinalBytes(times.length)` / `UWB_REPORT_BYTES` (= 24, as the brief's literal). IE lists match, including `['RRMC','RRTI']` (SS) vs `['RRMC']` (DS).
- `laneIds` (`src/model/lanes.ts`): link-plan virtual ids, then UWB ids in scenario order.
- `UwbRangeView` / `UwbPositionView` / `UwbNodeView` / `initUwbNodeView` / `applyUwbRecord` (`src/uwb/view.ts`): init values exactly as specified; `ranges[peer].n = (prev?.n ?? 0) + 1` and `position.n = (u.position?.n ?? 0) + 1` increment as required; `UWB_TS` is a no-op that still returns `true`. `NodeView.uwb?` added.

**Schema rules.** All exact:

- AP rule (`src/model/scenario.ts:401`) is `(wifi.length > 0 || aps.length > 1) && aps.length !== 1`, logically identical to the brief's formulation, with the original message text preserved.
- `uwb` node ⇔ `uwb` cfg (`:357`, node-level — see finding 1).
- ≥ 1 anchor and ≥ 1 tag; `tags ≤ floor(blockRstu / (slots · slotRstu))` with `slots = uwbSlotsPerTag(method, anchors)` = `ss ? anchors + 1 : 2·anchors + 2`.
- `slotRstu: z.number().int().min(300).refine(v => v % 3 === 0, …)`, `blockRstu: z.number().int().positive().refine(v => v % 3 === 0, …)`, `ppm` min −100 / max 100 optional, `kind` enum gains `'uwb'` — verbatim.
- Every pre-existing rule (duplicate ids, duplicate server ids, 2.4 GHz VHT, 6 GHz generation, AMP link, `ampAp`, `ampTag`) is untouched.

**No behaviour change without UWB nodes.**

- `linkPlanFor`: the two added guards are `n.kind === 'uwb'` only; `tests/model/caps.test.ts` and `tests/model/lanes.test.ts` (`linkPlanFor(mixed) === linkPlanFor(wifiOnly)`) both pass.
- `initViewState`: `laneIds(nodes)` = `linkPlanFor(nodes).virtualIds` when no UWB node exists; the `edca` guard only short-circuits for `kind === 'uwb'`.
- `applyRecord`: the new branch is gated on `r.type.startsWith('UWB_')`, which no existing record type matches.
- Schema: as above.
- Lesson-hash fixture `tests/fixtures/lesson-hashes.json` does **not** appear in the diff, and `tests/engine/lesson-hashes.test.ts` passes without `UPDATE_HASHES`.

**Controller ruling items.**

- i18n: the four UWB entries were added to all six `Record<FrameKind, …>` tables. The `zh` `kindName`, `whatIs` and `next` entries are genuine Chinese prose (e.g. "标签用它开启一轮测距：一帧广播的 UWB 帧，列出参与的锚点及其时隙顺序。…"), not English copies. `fields.name` gains `mhr` / `psdu` in both languages, in-language.
- `frameFields.ts` placeholder: `mhr (9) + psdu (f.bytes − 9 − 2) + fcs (2)` sums to `f.bytes` by construction, so `checkSize(fields, f.bytes)` is satisfied for every builder output (the smallest, `uwbRespBytes('ds') = 14`, still leaves a positive PSDU). `ppduLayout` returns a single `data` segment of `durNs: f.txTimeNs`, so the "PPDU segment durations sum to frame.txTimeNs" test would hold for UWB frames. The UWB case bypasses `head()`/`fcField()`, so the missing `SUBTYPE_BITS` entries for the four kinds never produce an `undefined (UWB Poll)` string — matching the existing AMP precedent.

**Quality.**

- No `any`, `as any`, `@ts-ignore` or `@ts-expect-error` added anywhere in the diff.
- No runtime cycle: `src/uwb/view.ts`, `src/uwb/records.ts`, `src/uwb/frames.ts` and `src/uwb/phy.ts` import from `src/model/*` **type-only**, so the value edges `model/view.ts → uwb/view.ts` and `model/frameFields.ts → uwb/phy.ts` are one-way after type erasure. `tsc -b` and the suite confirm.
- Tests assert real values, not shapes: `ranges['anc-1'].n === 2`, `distM ≈ 5.71`, `position` deep-equals the full object with `n: 1`, `timeouts === 1`, `rounds === 1`, `state === 'uwbWait'`, and `laneIds` compared element-wise with `linkPlanFor(...).virtualIds`. The scenario tests assert on message text (`/exactly one AP/`, `/multiple of 3 RSTU/`, `/fits 10 tags/`) and cover the 10-vs-11-tag boundary exactly.
- Snapshot/replay equivalence is present in `tests/uwb/view.test.ts` ("snapshot + replay equals the live view"), using `cloneView` at the midpoint and `toEqual` against the live state — the same pattern as the existing view tests.

## Findings

All findings are **minor**; none block.

1. **`src/model/scenario.ts:357` — node-level placement of the "uwb node ⇔ uwb cfg" rules (minor, accepted).** The brief lists these among the *scenario* `superRefine` rules; they sit in the *node* `superRefine` instead, next to the identical `ampTag` rule. This does not violate the brief's stated behaviour: accept/reject is identical for every input, only the zod issue `path` differs (per-node instead of scenario-level), and the AMP precedent argues for the node level. Tests (c) and (d) of the brief both pass. No change required.

2. **`src/model/caps.ts:143` — no explicit no-AP early return in `linkPlanFor` (minor, accepted).** The brief says "with no AP it returns `{ links: [], members: {…}, virtualIds: [] }`". As written, that holds for any AP-less scenario that has no `sta`/`amp` nodes (i.e. every scenario the new schema actually admits without an AP), but *not* for a hypothetical `[sta, sta]` list, which still yields 5 GHz lanes. That input is schema-rejected, the pre-existing behaviour for it is preserved, and the brief's two operative requirements — empty plan for a UWB-only scenario, and no throw — are both met and directly asserted in `tests/model/lanes.test.ts`. The implementer's reasoning (the smaller change avoids silently dropping lanes) is sound. No change required.

3. **`src/model/view.ts:301` — `UWB_` branch sits after `vs.t = r.t` rather than literally first (minor, accepted).** Documented in the report. Placing it literally first would freeze the view clock during a UWB-only run, which is clearly not what the brief intends; the WAN prune it also passes through is a no-op when `vs.wan` is empty and correct when it is not. No change required.

4. **`src/model/view.ts:301` + `src/uwb/view.ts:93` — the `boolean` return of `applyUwbRecord` is discarded; dispatch is by string prefix (minor).** `applyRecord` decides with `r.type.startsWith('UWB_')` and then ignores the handler's answer, so a future `UWB_*` record that `applyUwbRecord` does not handle would be silently swallowed instead of falling through. Suggested (non-blocking) tightening when Task 6 lands: `if (applyUwbRecord(vs, r)) return` — the prefix test then becomes redundant and the contract the brief gave the return value ("returns true when it handled it") is actually used. Also removes a per-record `startsWith` from the hot replay path.

5. **`src/uwb/frames.ts:55` — `makeResp` always writes the `replyRctu` key, `undefined` for DS (minor).** `uwbFrame(..., { …, replyRctu })` puts `replyRctu: undefined` on the `UwbInfo` of a DS response. Type-legal and harmless today, but it makes `toEqual`/`JSON.stringify` round-trips of a DS `FrameDesc` differ from a hand-built one, which can bite the Task 6 frame tests. Consider `...(replyRctu !== undefined ? { replyRctu } : {})`.

6. **`src/model/frameFields.ts:304` — UWB frames are reported with `typeName: 'Control'` (minor, Task 7).** Flagged by the implementer. Worth recording that the consequence is visible in Chinese: `i18n.ts` `fieldsPanel.mpdu` renders any non-`Data` type as 控制帧, so a UWB Poll shows as "UWB 轮询帧（控制帧）", an 802.11 notion the 802.15.4z frame does not have. Task 7 should introduce a third `typeName` (or a UWB-specific renderer) rather than only splitting the IEs.

7. **`src/scene/effects.ts:63` — AP non-null assertion is now reachable (minor, follow-up for Task 6/7).** `sc.nodes.find((n) => n.kind === 'ap')!.id` runs unconditionally in the `EffectsLayer` constructor. Before this task the schema guaranteed exactly one AP; now a UWB-only scenario validates, so opening one in the app would throw a `TypeError` here. `src/engine/simulation.ts:68` holds the same assertion, but its uses are all inside Wi-Fi node loops, so it is latent rather than immediate. Neither is reachable from a shipped scenario today (no UWB scenario is wired up yet), but this belongs on the Task 6/7 list, which the report's "Placeholders Task 7 must replace" section does not currently mention.

8. **Observation, no action — a `uwb` node must still carry Wi-Fi `caps`, `profiles` and `txPowerDbm`.** `NodeCfgSchema` requires them for every kind, so the tests construct anchors with `caps: { ...nonht }, profiles: ['idle']`. The brief did not relax this and the AMP tags have the same wart, so it is consistent; noting it only so that a later task can decide deliberately whether a UWB device should carry a Wi-Fi capability block at all.
