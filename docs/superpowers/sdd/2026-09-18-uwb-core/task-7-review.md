# Task 7 review — minimal UWB UI: event log, lanes, inspector, frame detail, node meshes, no-AP audit

Reviewed: `17e614d..2c2973f` (three commits — the task `00350f5`, the docs-only `36dc1d5`, the fix round `2c2973f`),
worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`.
Review only: no files edited, nothing committed, no subagents dispatched. Task 8's in-flight edits to
`src/course/*` / `tests/course/*` were out of scope and are not considered below.

## Verdict

Spec: CHANGES REQUIRED
Quality: APPROVED

One blocking finding (the inspector's FoM column), eight minor.

## Verification run

| Command | Result |
| --- | --- |
| `npx vitest run tests/ui tests/model tests/uwb tests/engine/lesson-hashes.test.ts` | **28 files, 253 tests, all passing** (exit 0) |
| `npx tsc -b` | clean (exit 0) |
| `npx vite build` | clean, `✓ built in 2.65s` (only the pre-existing 500 kB chunk-size warning) |

## Constraint-by-constraint audit (what I checked myself, not what the report claims)

- **`fmtUwbRecord` formats.** All six strings match the brief character for character (`src/uwb/format.ts:1644–1661`);
  `fmtRecord` handles the six types as six explicit fall-through cases with **no `default:`**, so the switch stays
  exhaustive over `TLRecord` — better than the `default: return fmtUwbRecord(r as never)` the brief offered, and it
  keeps the `never` check that catches a seventh record type. `tests/ui/uwb-format.test.ts` asserts the real strings
  plus `fmtRecord(r) === fmtUwbRecord(r)` for all eight fixtures.
- **Byte sums, exact IE widths.** Recomputed by hand: Poll 9 + 10 + (3 + 3·4) + 3 + 2 = 39 = `uwbPollBytes(4)`;
  Resp SS 9 + 3 + 6 + 2 = 20; Resp DS 9 + 3 + 2 = 14; Final 9 + (3 + 6·4) + 4·6 + 2 = **62** = `uwbFinalBytes(4)`;
  Report 9 + 13 + 2 = 24. Every IE is sized from its own `phy.ts` helper, nothing is absorbed as a remainder, and
  both the MHR sum and the total throw on drift (`src/uwb/frameFields.ts:1801–1804`). The controller's 14 + 12N
  ruling is applied at the source (`src/uwb/phy.ts:uwbFinalBytes`), not worked around in the decoder.
- **`uwbPpduLayout`.** Keys are exactly `sync | sfd | stsGap | sts | stsGap | phr | psdu`; the five fixed segments come
  from the chip constants and the PSDU takes the remainder, so the sum is `txTimeNs` by construction for any frame.
  Checked the arithmetic independently: `uwbPpduChips(62) = 80 096 + 64·594 = 118 112` → 236 603 ns; head =
  65 128 + 8 141 + 2·1 026 + 65 641 + 19 487 = 160 449; PSDU = 76 154. RMARKER is carried as `rmarkerNs` on the first
  STS gap (= SYNC + SFD = 73 269 ns), which is the correct "first chip after the SFD", and `FrameDetail` prints the
  note under that row. Segment colours are in `SEG_COLOR` and names in both `segment` tables.
- **`typeName: 'Ranging'`.** Third value added rather than reusing `'Control'`, per the Task 4 ruling; the ZH renderer
  maps it to 测距帧 (`src/ui/i18n.ts:1323`). `Mpdu['typeName']` and the `mpdu` formatter signature are both widened.
- **i18n completeness and Chinese-ness.** The `uwb` section (18 keys), seven new `tooltips` keys, nine new
  `frameDetail.fields.name` keys, six new `segment` keys, `fields.rmarker` and two legend entries all exist in **both**
  tables — `Strings` is a typed interface and `name`/`segment` are `Record<FieldKey|PpduSegmentKey, string>`, so `tsc`
  would have failed on any omission, and it passes. I read the ZH block: every new string is genuine Chinese
  (锚点 / 标签 / 测距时隙 / 误差椭圆（1-σ）/ 加扰时间戳序列 / RRTI 信息元·测距回复时间 …), no English pasted in.
  `frameDetail.kindName` / `whatIs` / `next` already carried the four UWB kinds from Task 4 (i18n.ts:387, 401, 418 and
  the ZH mirrors at 741, 755, 772), so nothing was missing there.
- **Lanes.** `TimelineStrip` uses `laneIds(scenario.nodes)` (`src/model/lanes.ts` puts the Wi-Fi virtual ids first,
  then one plain-id row per UWB node); `bandTag` and `laneLabel` both suppress the band for a UWB id; `nodeDisplayName`
  returns the plain name for `cfg.kind === 'uwb'`; `STATE_SPAN.uwbWait = 'slot'`. UWB frame colours are present in
  **both** places lane/scene colours are keyed by `FrameKind` — `src/scene/effects.ts:frameColor` and
  `src/ui/TimelineStrip.tsx:txColor` — with `#f59e0b` for Poll/Final and `#fbbf24` for Resp/Report as specified. I
  grepped for every other `FrameKind`-keyed table (via `ampResp`) and found no third one that needed the kinds.
- **No-AP audit.** `grep "kind === 'ap')!"` over `src/` → **no hits anywhere in the repo**. `grep "kind === 'ap')?\."`
  → exactly the two intended sites, `src/scene/effects.ts:65` and `src/ui/TimelineStrip.tsx:167`, both `?? ''`.
  `src/player/` contains no AP lookup at all. `effects.ts` now builds without an AP (association lines skipped, cloud
  strip guarded, `updateWan` returns early). `FrameDetail` decodes whenever open with `apId: ap?.id ?? ''` and
  `isEdca` false unless both ends exist; `tests/model/uwb-frameFields.test.ts` exercises `decodeFrame(f, { apId: '' })`.
  **`src/ui/App.tsx` is untouched** — it is not in the three commits' file list.
- **Inspector.** `NodeSection` returns the role heading + `StateBadge` + `<UwbInspector/>` and skips every Wi-Fi row
  when `nv.uwb` exists; `StateBadge` learnt `uwbWait: '#d97706'`. `UwbInspector` renders role, block/round/slot,
  silent slots, the per-peer table and the position rows or the "no fix yet" line, all from `S.uwb`. See finding 1
  for the one column that is missing.
- **Scene.** `buildNodeGroup` builds a 0.25 m `#f59e0b` box for an anchor and a 0.16 × 0.08 × 0.02 `#fbbf24` slab for a
  tag, and falls through to the shared halo / label / status sprites exactly as the other kinds do (`appLine` already
  returns `''` for a non-STA, so the sub-label is correctly blank). `haloColor('uwbWait') = 0xd97706`;
  `statusText` returns `slot n` / `''` ahead of every Wi-Fi branch.
- **Tests.** The three new files assert real values, not shapes: the eight log strings, the per-IE widths against the
  phy helpers, a drift test that the decoder *throws* on a size it cannot account for, the 62-octet Final's PSDU
  segment, the RMARKER offset, the delegation of `decodeFrame`/`ppduLayout`, `laneIds` order, the plain UWB lane
  label, the `uwbWait → idle` pair yielding one `slot` span carrying `state: 'uwbWait'`, EN/ZH tooltips distinct from
  the AMP ones, the two amber frame colours, `haloColor` and `statusText`. `tests/model/frameFields.test.ts`,
  `tests/ui/*` and `tests/engine/lesson-hashes.test.ts` are untouched by the diff and green;
  **`tests/fixtures/lesson-hashes.json` does not appear in the diff at all** — no hash regeneration.
- **Downstream of the 14 + 12N ruling.** Grepped `234_551` / `234551` / `234.55` / `228_397` / `12 + 12` / `60-octet` /
  `1 932 178` across `src/`, `tests/` and `docs/`: the only hit is the deliberate historical note in
  `tests/uwb/phy.test.ts:28`. The plan's DS-round airtime was updated to 1 934 230 ns, which I recomputed:
  206.859 + 4·181.218 + 236.603 + 4·191.474 = 1 934.230 µs. ✓
- **Quality gates.** No `any`, no `as any`, no `@ts-ignore` in any new file. The Task 4 placeholders are gone:
  `'mhr'` no longer exists anywhere in `src/`, and `'psdu'` survives only as a deliberate *`PpduSegmentKey`*, not as a
  `FieldKey`. `UwbInspector` is 82 lines with typed props. The `model/frameFields.ts` ↔ `uwb/frameFields.ts` edge is
  a **type-only** import in the upward direction, so there is no runtime import cycle.
- **Deviations 1–3 and 5–7 in the report.** Checked and all correct calls. In particular deviation 2: 127 803 RCTU ×
  15.65 ps = 2 000.1 ns, so `2.000 µs` is right and the brief's `2.000 ms` was a typo. Deviation 4 is genuinely
  resolved at source by the fix round, not papered over.

## Findings

### 1. The per-peer range table has no FoM column, and the FoM summary line is wrong for mixed peers — **blocking (spec)**

`src/uwb/ui/UwbInspector.tsx:1918–1945` (diff), i.e. the `<table>` and the line under it.

**What.** The binding constraint (and the brief) require the table to carry *peer, measured m, true m, error cm, FoM
text, rounds*. The implementation has five columns — peer, measured, true, error, `n` — and puts the FoM only in the
row's `title` attribute (hover-only), then adds a single summary line that prints `fomText(peers[0][1].fom)` under the
heading `U.fom`.

**Why it matters.** Two problems, and the second is a correctness one. FoM text is not visible without hovering, so
the column the spec asks for simply is not on screen. Worse, the summary line labels *one* peer's figure of merit as
though it described the whole table. The moment peers differ — which is exactly the scene lesson 5 sets up, a brick
wall between the tag and one anchor, `FOM_LOS = 0x16` vs `FOM_NLOS = 0x7b` — the panel asserts "confidence: 97 %
within 0.5 ns" while one of the listed ranges is the 75 %-within-12 ns one. That is a stated-vs-simulated drift of
precisely the kind this project keeps getting bitten by, shipped into the UI a lesson will later point at.

**What to do.** Add a sixth column using `U.fom` as its header and `fomText(r.fom)` per row (it is short: "97 % within
0.5 ns"; if width is tight, keep the `<tr title>` for the `${method}-TWR` note and let the column carry the FoM), and
delete the `peers[0]` summary line.

### 2. The rounds-completed count in the block/round row is unlabelled, and `rounds: 'n'` is opaque in EN — minor

`src/uwb/ui/UwbInspector.tsx:1912` and `src/ui/i18n.ts` (`uwb.rounds`).

**What.** The row renders `{u.block} / {u.round} <span style={dim}>({u.rounds})</span>` — a bare parenthesised integer
with no label, where `u.rounds` is the number of rounds this device has run. Separately, the table's last column
header is the EN string `'n'` (ZH is the clearer `次数`).

**Why.** A learner reading "1 / 0 (7)" has no way to know the 7 is a completed-round tally and not a third index of
the block/round address. The ZH panel is more legible than the EN one, which is backwards for this codebase.

**What to do.** Either drop the parenthetical (the same count is already implied by the per-peer `n`) or give it its
own labelled row; give `uwb.rounds` an EN string with a word in it (e.g. `'ranges'` / `'count'`) to match `次数`.

### 3. The event log's expanded frame rows still describe a UWB frame in 802.11 vocabulary — minor

`src/ui/EventLog.tsx:55` calling the legacy `decodeFrame` in `src/ui/format.ts:86–113`.

**What.** Clicking a frame in the event log expands a small table built by the *other* `decodeFrame` (the flat
`{field, value}[]` one in `ui/format.ts`), which was never taught about UWB. For a Poll it prints "RA / Address 1",
"TA / Address 2" and "Retry flag: 0" — three concepts that do not exist in an 802.15.4 ranging frame — and stops at
"PSDU length / Data rate", with no IEs.

**Why.** This is a surface of the "event log" the task is named for, and it now contradicts the new `FrameDetail`
decode two panels away. It is minor rather than blocking only because `EventLog.tsx` is not in the brief's file list
and the `ui/format.ts` rows have an `f.amp` branch precedent rather than a general one.

**What to do.** Either add an `if (f.uwb)` branch that reuses `uwbFrameFields` (source/destination short address,
octets, the IE list), or — cheaper and arguably better — have the expander delegate to the same `FieldsSection`
`FrameDetail` uses so there is one decode instead of two. Fold into the editor/positioning plan if not done here.

### 4. The four `uwb*` entries in `model/frameFields.ts`'s `SUBTYPE` are dead and duplicate `uwb/frameFields.ts`'s — minor

`src/model/frameFields.ts:113–117` against `src/uwb/frameFields.ts:1694–1696` (diff).

**What.** `SUBTYPE` in the model file still maps `uwbPoll: 'UWB Poll'` … `uwbReport: 'UWB Report'`, but the UWB arm of
`controlMpdu` now returns before any of them is read; the strings that actually reach the screen come from the
identical `SUBTYPE` table in `uwb/frameFields.ts`.

**Why.** Two sources of truth for the same four user-visible strings, one of them unreachable. They agree today;
nothing keeps them agreeing. (`Record<Exclude<FrameKind, 'data'>, string>` is what forces the dead entries to exist.)

**What to do.** Export the UWB table from `uwb/frameFields.ts` and reference it from the model's `SUBTYPE`, or narrow
the model's `SUBTYPE` key type to exclude the UWB kinds now that they never index it.

### 5. The unreachable `controlMpdu` UWB arm builds a whole `DecodedFrame` to throw most of it away — minor

`src/model/frameFields.ts` (diff lines 403–405): `return uwbFrameFields(f).users[0].subframes[0].mpdu`.

**What.** The comment correctly says "never reached" — `decodeFrame` intercepts `f.uwb` on its first line. The body
nevertheless calls `uwbFrameFields`, which re-runs the whole decode *including* `uwbPpduLayout`, and discards
everything but the MPDU.

**Why.** It reads as a live fallback path when it is not one, and it is the only place in the file where a "control"
decode can recurse into the UWB decoder. Cost is irrelevant; clarity is not.

**What to do.** Keep the case for exhaustiveness but make it say what it is — `throw new Error('unreachable: UWB
frames are decoded by uwb/frameFields.ts')`, or an exhaustiveness `never` assertion.

### 6. `f.dst === '*' || f.dst.startsWith('*')` — the first test is subsumed by the second — minor

`src/uwb/frameFields.ts:1781` (diff).

**What/why/what to do.** `'*'.startsWith('*')` is `true`, so the disjunction is redundant; drop the first clause (or,
if the intent is "exactly `*` or an `*mu`-style wildcard", say so in a comment, because as written it also matches any
future id that merely begins with `*`).

### 7. `fmtUwbRecord` treats a FoM byte of `0` as an absent FoM — minor

`src/uwb/format.ts:1651` (diff): `${r.fom ? ` (${fomText(r.fom)})` : ''}`.

**What.** The brief's condition is on the field's presence; the code tests its truthiness, so a recorded `fom: 0` is
silently dropped.

**Why.** Benign today (`0` decodes to "0 % within …", which is the standard's "not available" and is better hidden
than shown, and the engine only ever emits `FOM_LOS`/`FOM_NLOS`). Flagged because it is a behaviour that differs from
the written contract for no stated reason.

**What to do.** Use `r.fom !== undefined`, or add a one-line comment that `0` means "no FoM" and is deliberately
suppressed.

### 8. `as unknown as NodeView` in the lane test fixture — minor

`tests/ui/uwb-lanes.test.ts:2289` (diff).

**What.** The `nv()` helper builds a near-complete `NodeView` and then double-asserts through `unknown`.

**Why.** No `any` and no `@ts-ignore`, so it passes the letter of the quality bar, but a double assertion is the same
escape hatch: if `NodeView` gains a required field the fixture goes on compiling while diverging from what the
reducer actually produces — and `statusText` is exercised against it.

**What to do.** Fill the two or three missing fields and drop the cast, or build the fixture through
`initUwbNodeView` + a typed partial helper shared with the other view tests.

### 9. The no-selection "BSS totals" table still lists UWB lanes with all-zero Wi-Fi statistics — minor (accepted)

`src/ui/Inspector.tsx` (the un-selected branch, ~lines 180–210).

**What.** With nothing selected, the totals table iterates every lane from the view, so a ranging device gets a row
with txOk 0 / retries 0 / airtime 0.0 % / — / —.

**Why.** It does not crash and it is honest (a UWB device really does send no Wi-Fi frames), but it reads as "this
device is idle" rather than "this table is not about this device".

**What to do.** The report explicitly defers this to the lesson work once a UWB-only scenario can be loaded; recorded
here so it is not lost. Either filter UWB lanes out of the table or give a UWB-only scenario its own summary.

## Notes that are not findings

- `LaneSpan.state` / `OpenSpan.state` were added beyond the brief. Justified: a `slot` span means two different things
  (AMP tag counting Acks vs UWB device holding a slot) and the tooltip has to tell them apart. It is optional, spread
  only when set (matching the existing `rxFail` pattern), seeded from the snapshot as well as from `MAC_STATE`, and
  covered by a test. Good call.
- `TimelineStrip.laneLabel` re-derives the "no band suffix for a UWB id" rule instead of reusing `nodeDisplayName`
  (it needs the `[name, suffix]` tuple for `fitLaneLabel`, so it cannot reuse it directly). The rule now lives in two
  places; only `nodeDisplayName` is unit-tested. Worth remembering if the rule ever changes.
- The Final's `N × RRTI` IEs are shown as one field row of `N × RRTI_IE_BYTES` whose value says "4 reply times
  (treply2), one per anchor". The width is exact, which is what the ruling required, and one row per IE *name* is the
  readable choice here.
- The six extras in the report (two legend entries, UWB slot ticks, the dark-amber ranging-slot fill) are consistent
  with the AMP precedents and cost nothing.

---

# Re-review (fix round 2)

Scope: commit `8adab88` only (`2c2973f..8adab88`, package `task-7-fix2.diff`, 12 files, +236/−58), against the nine
findings of the review above and their controller rulings. Review only; no files edited. Task 8's uncommitted course
work (`src/course/*`, `tests/course/uwb-intro.test.ts`, `tests/fixtures/lesson-hashes.json` — confirmed the only dirty
paths in the worktree, none of them Task 7's) was ignored.

## Verdict

Spec: APPROVED
Quality: APPROVED

Three minor findings remain, none blocking; one of them is finding 9 carried forward by ruling.

## Verification run

| Command | Result |
| --- | --- |
| `npx vitest run tests/ui tests/model tests/uwb` | **28 files, 262 tests, all passing** (exit 0) — +10 over round 1's comparable 252, matching the 7 new `inspector-rows` tests and the 3 new event-log cases |
| `npx tsc -b` | clean (exit 0) |
| `npx vite build` (extra, not requested) | clean. `sim.worker-k6gk_CAV.js` is **byte-identical to round 1** (141.07 kB, same content hash), so nothing new leaked into the worker; the main chunk's +21 kB is Task 8's dirty lesson content, not this commit |

## Ruling-by-ruling

1. **Blocking finding closed, with a test.** The table has six columns, `U.fom` heading the new one
   (`UwbInspector.tsx`, diff:426/444); the `peers[0]` summary line is deleted (diff:451–455 removed); the row `title`
   now carries only the TWR method. The numbers moved into the React-free `src/uwb/ui/rows.ts` (`uwbRangeRows`,
   `uwbFixRow`), and `tests/uwb/inspector-rows.test.ts` builds the exact scene the finding named — one LOS peer
   (`FOM_LOS`) and one through a wall (`FOM_NLOS`) — then asserts `rows[0].fom === fomText(FOM_LOS)`,
   `rows[1].fom === fomText(FOM_NLOS)` **and** `rows[0].fom !== rows[1].fom`. That last assertion is the one that
   would have caught the original defect, which is what closing a blocking finding with a test should mean. The
   signed error, the empty-table case and the whole fix row are pinned too (`'-12.0 cm'`, `'6.2 × 4.1 cm'`). Extracting
   the formatting rather than reaching for a DOM test was the right call: the numbers are now assertable without a
   store or a renderer.
2. **Rounds labelled.** `uwb.rounds` is `'rounds'` / `'轮次'` — real Chinese, both tables. The block/round row reads
   `3 / 0 · 7 rounds` instead of the bare `(7)`, and the same label heads the per-peer column. Using one word for the
   device's completed rounds and for each peer's landed-range count is defensible (a peer's `n` is just that count
   restricted to one peer) and no longer opaque in either language.
3. **Event log speaks 802.15.4.** `src/ui/format.ts:decodeFrame` gained an `f.uwb` branch delegating to
   `uwbFrameFields`, labelling rows from the existing `frameDetail.fields.name` table — so both languages come from
   strings already reviewed as genuine Chinese, with no new ZH text to check. `EventLog.tsx` passes
   `L.frameDetail.fields`; the second parameter defaults to the EN table so Wi-Fi-only call sites (including Task 8's
   `tests/course/tier1-retries-queues.test.ts`) are untouched. Reusing the one decode instead of writing a second is
   better than what the finding asked for. Tested in both languages, including the negative half: the four Wi-Fi-only
   labels (`RA / Address 1`, `TA / Address 2`, `Retry flag`, `Duration/ID`) must **not** appear, and a Wi-Fi frame
   still gets its 802.11 rows.

4–6. **Dead arms gone.** `SUBTYPE` is now `Record<Exclude<FrameKind, 'data' | UwbFrameKind>, string>` with the four
   duplicate strings removed, leaving `uwb/frameFields.ts` as the single table that names them; `controlMpdu` opens
   with `if (f.uwb) throw new Error('unreachable: …')` and the four `case` arms are deleted;
   `f.dst === '*' || f.dst.startsWith('*')` is now just `startsWith('*')` with a comment naming the `*mu` wildcards.
   All three as ruled.

7. **FoM byte 0.** `fmtUwbRecord` tests `r.fom !== undefined`, and `fomText(0)` returns `'no FoM'` with the §10.29.1.6
   citation in a comment. Asserted alongside `fomText(FOM_LOS)` so the normal path is pinned against the new early
   return. Checked that nothing depended on the old output: `tests/uwb/phy.test.ts` only exercises `FOM_LOS`/`FOM_NLOS`.

8. **Lane fixture.** `tests/ui/uwb-lanes.test.ts` now runs `initViewState` over a real two-node UWB `Scenario` and
   takes `nodes['tag-1']`; the `as unknown as NodeView` double assertion is gone and the fixture is typed `NodeView`
   with no cast. `statusText` is therefore exercised against what the reducer actually produces.

9. **BSS totals.** Untouched, per the ruling; carried forward below so the positioning plan inherits it.

**No regressions found.** `fmtUwbRecord`'s six formats, the byte and PPDU sums, the `laneIds`/label/`STATE_SPAN`
hooks, the scene meshes and the no-AP audit are all unchanged by this commit (none of those files appear in the diff
except `uwb/frameFields.ts`, whose only change is the `broadcast` simplification, and `uwb/format.ts`, whose only
change is the `!== undefined` test). `tests/model/frameFields.test.ts` (13 tests, including the two sweeps that sum
field bytes and PPDU durations over recorded frames) is green, which is the check that the `controlMpdu` throw did
not become reachable for any real frame.

## Remaining findings

### 10. `fomText` is English prose in a now-visible column of the Chinese inspector — minor

`src/uwb/ui/rows.ts:519` (`fom: fomText(r.fom)`) feeding the new `U.fom` column.

**What.** The column header is translated (`置信度`), but its values are not: `fomText` returns `'97 % within 0.5 ns'`
and now `'no FoM'`, both English, in both languages.

**Why.** Pre-existing — round 1 put the same string in the row `title` — but the ruling promoted it from a hover to a
visible column, so the ZH panel now shows an English word (`within`, and `no FoM`) on every row, and the constraint
for this panel was "strings from i18n". It states nothing false, which is why this is minor and not a re-open.

**What to do.** Either add a `uwb.fomText: (pct: number, ns: number) => string` pair plus a `uwb.noFom` string and
have `rows.ts` take the formatter as an argument (keeping `fomText` for the EN-only event log), or record a deliberate
decision that FoM text is protocol notation left untranslated, as `GDOP` and `RCTU` already are.

### 11. The event log has no guard around a decode that can throw, where `FrameDetail` deliberately has one — minor

`src/ui/format.ts:205` (`if (f.uwb) return uwbFieldRows(f, S)`) reached from `src/ui/EventLog.tsx:145`.

**What.** `uwbFrameFields` throws by design when the decoded widths do not match `frame.bytes` — that drift guard is
one of this task's better ideas, and `FrameDetail` wraps its call in `try { … } catch { decoded = null }` with the
comment "show nothing rather than wrong sizes". The event-log path added in this round calls the same function with
no guard, inside `render`. Before this change the log's `decodeFrame` could not throw at all.

**Why.** A drift that `FrameDetail` degrades gracefully would now throw during the event log's render and take the
panel (or the app, absent an error boundary) down with it. The tests pin the widths, so this cannot fire today; it is
the asymmetry between two call sites of the same throwing function that is the defect.

**What to do.** Wrap `uwbFieldRows`' body in the same try/catch and fall back to the generic rows (or to an empty
list), so both readers of `uwbFrameFields` degrade the same way.

### 12. Carried forward from finding 9: the no-selection "BSS totals" table still lists UWB lanes — minor (accepted)

`src/ui/Inspector.tsx`, un-selected branch. Accepted by ruling and recorded here so the positioning plan picks it up:
either filter UWB lanes out of that table or give a UWB-only scenario its own summary.

## Note that is not a finding

`src/ui/format.ts` now imports `./i18n`, which imports `./store`, which imports `zustand` and `Player` — a formatting
module that was a near-leaf has gained a transitive dependency on the React store purely to supply a *default
parameter*. I checked the consequence rather than assuming one: `store.ts` does not import `./format`, so there is no
cycle, and the sim worker does not import `ui/format.ts` at all — its bundle is byte-identical to round 1. So this
costs nothing shipped. If it ever wants tidying, making `S` a required parameter (two call sites) removes the edge.
