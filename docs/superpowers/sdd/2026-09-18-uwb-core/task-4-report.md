# Task 4 report — model seams for UWB (node kind, session config, records, frames, lanes, view)

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.

## What was built

### New files

| File | Contents |
| --- | --- |
| `src/uwb/records.ts` | The `UwbRecord` union: `UWB_ROUND`, `UWB_SLOT`, `UWB_TS`, `UWB_RANGE`, `UWB_POSITION`, `UWB_TIMEOUT`, with exactly the fields the brief specifies. |
| `src/uwb/frames.ts` | `UwbFrameKind`, `UwbInfo`, `UWB_MBPS = 6.81`, and the four builders `makePoll` / `makeResp` / `makeFinal` / `makeReport`. Every builder returns a `FrameDesc` with `mode` unset, `durationFieldNs: 0`, `mbps: 6.81`, `txTimeNs: uwbPpduNs(bytes)`; poll and final broadcast (`dst: '*'`). Sizes come from `src/uwb/phy.ts` (`uwbPollBytes`, `uwbRespBytes`, `uwbFinalBytes`, `UWB_REPORT_BYTES`). |
| `src/uwb/view.ts` | `UwbRangeView`, `UwbPositionView`, `UwbNodeView`, `initUwbNodeView(cfg)` and `applyUwbRecord(vs, r): boolean` with the folding rules from the brief (`ranges[peer].n` and `position.n` accumulate; `UWB_TS` is event-log only). Every lookup is guarded (`vs.nodes[r.node]?.uwb`) so a record for a lane that does not exist is a no-op, not a throw. |
| `src/model/lanes.ts` | `laneIds(nodes)` = the Wi-Fi link plan's virtual ids, then every `uwb` node's id in scenario order. |

### Existing files touched, and why

| File | Change |
| --- | --- |
| `src/model/types.ts` | `NodeKind` gains `'uwb'`. |
| `src/model/scenario.ts` | `UwbNodeCfg`, `UwbSessionCfg`, `DEFAULT_UWB_SESSION`, helper `uwbSlotsPerTag(method, anchors)`; `NodeCfg.uwb?`, `Scenario.uwb?`; schema `kind` enum gains `'uwb'`; `node.uwb` and `scenario.uwb` zod objects; the AP rule became conditional; the four UWB session rules were added. |
| `src/model/records.ts` | `MacStateName` gains `'uwbWait'`; `TLRecord`'s union gains `\| UwbRecord` (type-only import). |
| `src/model/frames.ts` | `FrameKind` gains the four UWB kinds; `FrameDesc.uwb?: UwbInfo` (type-only import). |
| `src/model/caps.ts` | `nodeLinks` returns `[]` for `'uwb'`; `linkPlanFor` skips `uwb` nodes in both loops, so a UWB-only scenario yields `{ links: [], members: { '2g': [], '5g': [], '6g': [] }, virtualIds: [] }` and never throws on the missing AP. |
| `src/model/view.ts` | `NodeView.uwb?: UwbNodeView`; `initViewState` iterates `laneIds(sc.nodes)` instead of `linkPlanFor(...).virtualIds` and gives a `uwb` lane `acs: null` plus `uwb: initUwbNodeView(cfg.uwb!)`; `applyRecord` routes `UWB_*` to `applyUwbRecord` and returns. |
| `src/model/frameFields.ts` | **Compile hazard + placeholder.** `FieldKey` gains `'mhr'` and `'psdu'`; `SUBTYPE` gains the four kinds; `controlMpdu` gains a four-kind placeholder case; `ppduLayout` returns one `data` segment covering `txTimeNs` for a UWB frame. |
| `src/ui/i18n.ts` | **Compile hazard.** `frameDetail.kindName`, `.whatIs`, `.next` are `Record<FrameKind, string>` in both `en` and `zh`: four real entries added to each of the six tables (Chinese written as Chinese). `fields.name` gains `mhr` / `psdu` in both languages. |
| `src/ui/format.ts` | **Compile hazard.** `fmtRecord` switches exhaustively over `TLRecord`: one event-log line per UWB record kind (English, as every other line in that function is). |
| `src/scene/nodes.ts` | **Compile hazard.** `haloColor` switches exhaustively over `MacStateName`: `uwbWait` added (pink `0xf472b6`). |
| `src/scene/effects.ts` | **Compile hazard.** `frameColor` switches exhaustively over `FrameKind`: the four UWB kinds added (pink `0xf472b6`). |

No engine, channel, device or UI-component work was done — that is Tasks 6 and 7.

## Placeholders Task 7 must replace

1. `src/model/frameFields.ts`, the `uwbPoll`/`uwbResp`/`uwbFinal`/`uwbReport` case in `controlMpdu`: it emits three fields — `mhr` (9 octets), `psdu` (everything between, labelled with `uwb.ies.join(' + ')`) and `fcs` (2 octets) — instead of decoding the ARC/RDM/RRMC/RRTI/RMI IEs field by field. It also reuses `mpduOf(kind, 'Control', …)`, so a UWB frame is reported with `typeName: 'Control'`, which is an 802.11 notion the 802.15.4z frame does not have.
2. `src/model/frameFields.ts`, `ppduLayout`: a UWB frame gets a single `data` segment spanning the whole `txTimeNs`, rather than SHR / STS / PHR / PSDU segments (the constants for which already exist in `src/uwb/phy.ts`). Splitting them needs new `PpduSegmentKey`s plus their `SEG_COLOR` and i18n `segment` entries.
3. `src/ui/TimelineStrip.tsx` still lays its lanes out from `linkPlanFor(...).virtualIds`, so a UWB node has a `ViewState` lane but no drawn row yet; it should move to `laneIds`.
4. `src/editor/FloorPlanEditor.tsx`, `src/editor/planOps.ts` and `src/scene/nodes.ts` have no way to create or draw a `uwb` node; they compile because every kind test there is an `if`/ternary chain with a fallthrough, so a UWB node currently renders with the station's shape and colour.

## Tests

New:
- `tests/model/uwb-scenario.test.ts` (9): UWB-only scenario parses with no AP; the AP rule returns as soon as a `sta` is present; a `uwb` node without `uwb` cfg and a `sta` with one both fail; a missing `scenario.uwb` fails; anchor/tag minimums; `slotRstu: 2401` fails and `2400` passes; DS-TWR with 4 anchors is 10 slots per tag so 10 tags pass and 11 fail; every `LESSONS` scenario still parses.
- `tests/model/lanes.test.ts` (6): lane order for a mixed scenario, a UWB-only scenario, and equality with `linkPlanFor(...).virtualIds` for MLO; `nodeLinks` empty for `uwb`; the empty plan for UWB-only; `linkPlanFor(mixed) === linkPlanFor(wifiOnly)`.
- `tests/uwb/view.test.ts` (4): lane creation (`acs` null, `uwb` initialised, anchors distinguishable by role); the folding of a full record sequence including `MAC_STATE uwbWait`; anchors' lanes untouched by the tag's records; snapshot/replay equivalence (`cloneView` at the midpoint + replay of the rest equals the live view).

Full suite: `npx vitest run` → **82 files, 802 tests, all passing**, including `tests/model/caps.test.ts`, `tests/model/records.test.ts`, the view tests and `tests/engine/lesson-hashes.test.ts` (no `UPDATE_HASHES`; hashes untouched). `npx tsc -b` clean, `npx vite build` clean. No `any`, no `@ts-ignore` added.

## Deviations / judgement calls

- **Where the node-level UWB rules live.** The brief lists "a `uwb` node must carry `uwb`; a non-`uwb` node must not" among the *scenario* `superRefine` rules. I put them in the *node* `superRefine`, next to the identical `ampTag` rule (AMP precedent), which gives a per-node issue path. Behaviour and messages are as specified.
- **`linkPlanFor` with no AP.** The brief says it must "return an empty plan" when there is no AP. I did not add an explicit no-AP early return; ignoring `uwb` nodes already makes a UWB-only scenario produce exactly `{ links: [], members: { '2g': [], '5g': [], '6g': [] }, virtualIds: [] }` (asserted in `tests/model/lanes.test.ts`). An explicit early return would additionally have dropped the lanes of a stations-without-AP scenario, which the schema rejects anyway and which existing behaviour keeps — so the smaller change was preferred.
- **Where the `UWB_` branch sits in `applyRecord`.** The brief says `applyRecord` "starts with" the branch. I placed it immediately *after* `vs.t = r.t` and the WAN prune, so a UWB record still advances the view clock; putting it literally first would freeze `vs.t` during a UWB-only simulation.
- **`fmtRecord` event-log lines.** The brief only demanded compilation, but `fmtRecord`'s switch is exhaustive over `TLRecord`, so a stub was unavoidable; I wrote real lines instead. They are English-only because every other line in that function is — `fmtRecord` is not an i18n table.
- **New `FieldKey`s.** The placeholder decode needed `mhr` and `psdu`, which forced two new entries in the `fields.name` tables of both languages. Task 7 may rename or replace them when it decodes the IEs properly.
