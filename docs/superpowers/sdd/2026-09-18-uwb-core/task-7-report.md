# Task 7 report — minimal UWB UI: event log, lanes, inspector, frame detail, node meshes, no-AP audit

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.
Baseline at start: `bf05b35`; another session landed `17e614d` on the same branch mid-task (see *Concurrency* below).

## Files created

| File | Why |
| --- | --- |
| `src/uwb/format.ts` | `fmtUwbRecord` + the exported `UwbTLRecord` alias. The event-log line for each of the six `UWB_*` records, in the formats the brief fixed. Kept beside the engine so the ranging vocabulary (RCTU counters, TWR method, FoM) lives with the code that produces it. |
| `src/uwb/frameFields.ts` | `uwbFrameFields` (802.15.4 MHR + one row per payload IE + FCS) and `uwbPpduLayout` (SP1 PPDU: SYNC / SFD / STS gap / STS / STS gap / PHR / PSDU), plus `UWB_RMARKER_OFFSET_NS` and the model `UWB_PAN_ID`. |
| `src/uwb/ui/UwbInspector.tsx` | The inspector block for a ranging device: role, block / round / slot, silent-slot count, the per-peer range table (peer, measured, true, error cm, rounds, FoM in the row title + a summary line), and for a tag the fix (estimate, true, error cm, GDOP, ellipse a × b cm) or the "no fix yet" line. |
| `tests/ui/uwb-format.test.ts` | One assertion per record format, plus `fmtRecord(r) === fmtUwbRecord(r)` for all eight fixtures. |
| `tests/model/uwb-frameFields.test.ts` | Byte sums = `frame.bytes`, `typeName === 'Ranging'`, MHR field order, IE order and IE value text; segment sums = `txTimeNs`, the five fixed segments against `chipsToNs`, the 60-octet Final's PSDU, the RMARKER marker, and that `decodeFrame` / `ppduLayout` delegate. |
| `tests/ui/uwb-lanes.test.ts` | `laneIds` order (mixed and UWB-only), UWB lane label with no band suffix, the `uwbWait → idle` pair yielding one `slot` span carrying `state: 'uwbWait'`, EN/ZH tooltips distinct from the AMP ones, UWB frame tooltips in both languages, the two amber frame colours, `haloColor('uwbWait')` and `statusText` showing `slot n`. |

## Files modified

- **`src/ui/format.ts`** — the six provisional UWB cases in `fmtRecord` replaced by an explicit six-case fall-through to `fmtUwbRecord(r)`; the switch stays exhaustive over `TLRecord`.
- **`src/model/frameFields.ts`** —
  - `FieldKey`: dropped the placeholder `mhr` / `psdu`, added `seqNo`, `dstPan`, `dstAddr16`, `srcAddr16` and `ieArc | ieRdm | ieRrmc | ieRrti | ieRmi`.
  - `Mpdu.typeName` widened to `'Control' | 'Data' | 'Ranging'` (per the Task 4 review ruling — a UWB frame is not an 802.11 control frame / 控制帧).
  - `PpduSegmentKey` gained `sync | sfd | stsGap | sts | phr | psdu`; `PpduSegment` gained the optional `rmarkerNs`.
  - `decodeFrame` and `ppduLayout` delegate every `f.uwb` frame to `uwb/frameFields.ts`; the UWB arm of `controlMpdu` is now unreachable and returns the delegated MPDU instead of the placeholder triple.
- **`src/ui/laneLayout.ts`** — `STATE_SPAN.uwbWait = 'slot'`; `LaneSpan`/`OpenSpan` gained the optional `state: MacStateName` (set from the opening `MAC_STATE` and from the seed snapshot) so a `slot` span can say whether it is an AMP wait or a ranging slot; `spanTooltip` branches on it and gained the four UWB frame cases plus a UWB rate line (`T.uwbRate`).
- **`src/ui/TimelineStrip.tsx`** — lanes now come from `laneIds(scenario.nodes)`; `uwbIds` suppresses the band tag and the lane-label band suffix for UWB rows; `txColor` paints tag frames `#f59e0b` and anchor frames `#fbbf24`; a ranging slot span is drawn in `#78350f` rather than the AMP teal; slot-boundary ticks now also fire on `UWB_SLOT` (amber) beside `AMP_SLOT` (teal).
- **`src/ui/Inspector.tsx`** — `NodeSection` returns the role heading + `StateBadge` + `<UwbInspector/>` when `nv.uwb` is present, skipping every Wi-Fi row; `StateBadge` learnt `uwbWait: '#d97706'`.
- **`src/ui/FrameDetail.tsx`** — segment colours for the six UWB keys; each PPDU row wrapped so a segment carrying `rmarkerNs` prints the RMARKER note under it; the AP lookup no longer gates decoding (see the audit).
- **`src/ui/names.ts`** — `nodeDisplayName` returns the plain name for `cfg.kind === 'uwb'` before the link logic.
- **`src/ui/i18n.ts`** — new `uwb` section (18 keys) in EN and ZH; `tooltips` gained `uwbPoll/uwbResp/uwbFinal/uwbReport/uwbRate/uwbWait/uwbWaitNote`; `frameDetail.fields.name` gained the nine new field keys and lost `mhr`/`psdu`; `fields.segment` gained the six UWB segments; `fields.rmarker` added; `fields.mpdu`'s type widened and the ZH renderer maps `Ranging → 测距帧`; two legend entries (UWB tag / UWB anchor) in both languages. All ZH text is real Chinese, no English pasted in.
- **`src/scene/nodes.ts`** — `buildNodeGroup` builds a 0.25 m `#f59e0b` box for an anchor and a 0.16 × 0.08 × 0.02 `#fbbf24` slab for a tag (label/halo/status as for every other node); `haloColor('uwbWait')` refined from the Task 4 pink to `0xd97706`; `statusText` shows `slot n` for a UWB node with a slot and `''` between rounds.
- **`src/scene/effects.ts`** — UWB frame colours refined from the Task 4 pink to the two ambers; the AP is now optional (see the audit).

## No-AP audit

Grepped `src/ui`, `src/scene`, `src/player` (and re-checked `src/uwb`) for `kind === 'ap'` and `apId`. Every site found:

| Site | Before | After |
| --- | --- | --- |
| `src/scene/effects.ts:65` (constructor) | `sc.nodes.find(kind === 'ap')!.id` — **threw** on a UWB-only scenario | `?.id ?? ''`; the field is documented as empty when there is no BSS. |
| `src/scene/effects.ts:71–84` (association lines) | `positions.get(apId)!`, lines to every non-AP node | `positions.get(apId)` (may be undefined); the loop skips when there is no AP, and skips `kind === 'uwb'` in any case — ranging devices associate with nothing. |
| `src/scene/effects.ts:87` (cloud strip) | `if (sc.servers.length)` then `ap.x` | `if (sc.servers.length && ap)`. |
| `src/scene/effects.ts:123` (`updateWan`) | `positions.get(apId)!` | early `return` when there is no AP — no cloud strip means no WAN dots. |
| `src/scene/effects.ts:165` (`frameColor`) | takes `apId` | unchanged; `''` never matches a frame's source, so nothing is mis-coloured as downlink. |
| `src/ui/FrameDetail.tsx:124–134` | `if (open && ap)` — the field decode silently did nothing without an AP; `src ?? ap` | decodes whenever open, with `apId: ap?.id ?? ''` and `isEdca` false unless both ends exist. |
| `src/ui/TimelineStrip.tsx:167` | `?.id ?? 'ap'` (already null-safe but invented an id) | `?.id ?? ''`, per the brief. |
| `src/scene/nodes.ts:100`, `src/model/view.ts:195`, `src/model/caps.ts:132/143/154`, `src/editor/FloorPlanEditor.tsx` (6 sites), `src/engine/simulation.ts` | plain conditionals, no assertion | unchanged — `linkPlanFor` already returns an empty plan for a UWB-only scenario (Task 4) and `tests/uwb/network.test.ts` runs a `Simulation` with no AP. |

`src/player/*` contains no AP lookup at all.

## Left for the editor plan

- `src/editor/FloorPlanEditor.tsx` was not touched: a `uwb` node draws with the generic station circle/colour, there is no UWB tool, no role/session property panel, and the AP-only guards there are untouched. That is the later editor plan; nothing in it fails to compile.
- The inspector's "BSS totals" table (no node selected) still lists every lane including UWB ones, with all-zero Wi-Fi statistics. Giving a UWB-only scenario its own summary belongs with the lessons (Task 8) once such a scenario can be loaded.

## Tests

- New: `tests/ui/uwb-format.test.ts` (16), `tests/model/uwb-frameFields.test.ts` (11), `tests/ui/uwb-lanes.test.ts` (12) — written first, all failing, then made to pass.
- Full suite: `npx vitest run` → **88 files, 884 tests, all passing** (was 85 files / 845 before). `tests/model/frameFields.test.ts`, `tests/ui/*`, `tests/scene/mapping.test.ts` and `tests/engine/lesson-hashes.test.ts` unchanged and green — no hash regeneration.
- `npx tsc -b` clean, `npx vite build` clean, no `any` and no `@ts-ignore` added.
- Ran the app at `http://localhost:5176` with Playwright: editor and simulate views load with **zero console errors**, the legend shows the two new UWB entries, and a clicked Wi-Fi frame still decodes exactly as before (no RMARKER row, since `rmarkerNs` is UWB-only). Dev server stopped, screenshots deleted.

## Deviations from the brief

1. **`UWB_TS` / `UWB_RANGE` record shapes.** The brief's format strings name `fom`, `kindShort`, `tofRawRctu`; the engine's records call the frame kind `frameKind` and the timeout's `expected`. Mapped accordingly; the rendered strings match the brief verbatim.
2. **RRTI example unit.** The brief writes `reply time 127 803 RCTU = 2.000 ms`. 127 803 RCTU × 15.65 ps = 2 000.1 ns, i.e. **2.000 µs**, which is what the code and the test assert. Treated as a typo in the brief.
3. **Final PSDU duration off by 1 ns from the brief's arithmetic.** The brief gives `234 551 − 73 269 − 67 692 − 19 487`. Rounding each segment on its own (as "compute the first five from `chipsToNs` of the chip constants" requires) makes the STS block 1 026 + 65 641 + 1 026 = **67 693**, not 67 692 — `chipsToNs(33 792)` rounds down once where three separate roundings round up. The test asserts the 67 693 form and, more importantly, that the segments sum to `txTimeNs` exactly for all four kinds.
4. **Final IE sizing.** `uwbFinalBytes(n) = 12 + 12n` leaves a payload of `1 + 12n` octets, which does not split cleanly into `rmiFinalIeBytes(n)` + `RRTI_IE_BYTES`. The decoder therefore sizes every IE from the phy helpers and gives the **last** IE of each frame the payload remainder — exact and identical to the constants for Poll, Response (SS and DS) and Report, and only the Final's RRTI absorbs the difference (22 B for four anchors). Documented in the code.
5. **`typeName: 'Ranging'`** added as a third value rather than reusing `'Control'`, per the Task 4 review ruling; ZH renders it as 测距帧.
6. **Extras not asked for but cheap:** two legend entries for the UWB frame colours, UWB slot-boundary ticks on the ranging lane (mirroring the AMP ticks), and a distinct dark-amber fill for a ranging slot span so it does not read as an AMP wait.
7. **Node `seqNo` field value.** The engine does not model an 802.15.4 sequence number, so the row shows `round n, slot m` rather than a fabricated counter.

## Concurrency note

The worktree was **not** exclusive: `src/uwb/device.ts` was being edited by another session while this task ran, and for a while `src/uwb/network.ts` did not typecheck against it. That session committed `17e614d` ("fix(uwb): report only when listed in the Final; …") on top of `bf05b35`, after which everything was green again. None of my files overlap with it, and the commit below lists its paths explicitly.

---

## Fix round 1 — the Final is 14 + 12N octets

Controller ruling on deviation 4 above: the mismatch was a defect in the plan's arithmetic, not in the
decode. The Final's stated composition — MHR 9 + RMI IE (3 + 6N) + N × RRTI IE 6 + FCS 2 — sums to
**14 + 12N**, while `uwbFinalBytes` returned 12 + 12N. Fixed at the source.

| File | Change |
| --- | --- |
| `src/uwb/phy.ts` | `uwbFinalBytes(n) = 14 + 12n`, with the composition in a doc comment. Four anchors → 62 octets = 496 bits = 2 RS blocks → `uwbPpduNs(62) === 236_603`. |
| `src/uwb/frameFields.ts` | The remainder-absorbing special case is gone: the RRTI of a Final is now `N × RRTI_IE_BYTES` (a Response still carries one, at `RRTI_IE_BYTES`), so every IE of every frame decodes at its stated width. An unknown IE name now throws instead of being silently sized 0. The MHR widths moved into `MHR_FIELD_BYTES` and are checked against `UWB_MHR_BYTES`; the total is still checked against `frame.bytes`, and both throw — `FrameDetail` already catches and shows nothing rather than wrong sizes. |
| `tests/uwb/phy.test.ts` | `uwbFinalBytes(4)` → 62; airtime row `[60, 234_551]` → `[62, 236_603]`; title "final 14 + 12N"; the stale note about the brief's `[60, 228_397]` row rewritten to say both numbers were wrong. |
| `tests/uwb/network.test.ts` | The Final assertion → 62 octets / 236 603 ns (title too). |
| `tests/model/uwb-frameFields.test.ts` | Final → 62 B / 236 603 ns and its PSDU segment; **new**: every IE's width asserted against the phy helper (`ARC_IE_BYTES`, `rdmIeBytes(4)`, `RRMC_IE_BYTES`, `RRTI_IE_BYTES`, `4 × RRTI_IE_BYTES`, `rmiFinalIeBytes(4)`, `RMI_REPORT_IE_BYTES`) so nothing can be absorbed as a remainder again; **new**: a frame whose engine size the fields cannot account for throws. |

Grepped `234_551` / `234551` / `12 + 12` / `60-octet` across `src` and `tests`: no stale references left.

Verification: `npx tsc -b` clean, `npx vite build` clean, `npx vitest run` → **88 files, 886 tests, all passing**
(+2 from the new width and drift tests). Deviation 4 in the list above is now resolved rather than worked around;
deviations 1–3 and 5–7 stand.

---

## Fix round 2 — task review

Review: `task-7-review.md` (Spec CHANGES REQUIRED — one blocking; Quality APPROVED — eight minors).
All nine findings addressed or recorded below.

### 1 — blocking: per-row FoM in the inspector

The table carried the figure of merit only in each row's `title`, and printed `peers[0]`'s FoM under the heading
`U.fom` as though it described the whole table. With a wall behind one anchor (`FOM_LOS` 0x16 vs `FOM_NLOS` 0x7b —
exactly the scene lesson 5 sets up) the panel asserted one peer's confidence over another's range: stated-vs-simulated
drift shipped into the UI.

- **New `src/uwb/ui/rows.ts`** — `uwbRangeRows(u)` and `uwbFixRow(p)`, pure and React-free, produce every string the
  panel shows (measured / true / signed error in cm / `fomText(r.fom)` **per row** / rounds / the `SS|DS-TWR` title).
- **`src/uwb/ui/UwbInspector.tsx`** — six columns now, with `U.fom` as the sixth header; the `peers[0]` summary line
  is gone; the row `title` keeps only the TWR method; the position rows come from `uwbFixRow`.
- **New `tests/uwb/inspector-rows.test.ts`** (7 tests) — a two-peer tag, one LOS and one NLOS, asserting the two rows
  carry *different* FoM text, plus the signed error, the empty-table case and the fix row. The component itself has no
  test (it needs the store and a DOM); the helper is where the numbers are, so that is where they are asserted.

### 2 — the rounds count is labelled

`uwb.rounds` was the opaque EN `'n'` against the clearer ZH `次数`. Now `'rounds'` / `'轮次'`, and the block/round row
reads `3 / 0 · 7 rounds` (the label also heads the table's last column, which counts the same thing per peer).

### 3 — the event log speaks 802.15.4

`src/ui/EventLog.tsx` expanded a clicked frame through the *other*, flat `decodeFrame` in `src/ui/format.ts`, which
printed "RA / Address 1", "TA / Address 2" and "Retry flag" for a Poll — three things an 802.15.4 frame does not have —
and no IEs. That decoder now delegates any `f.uwb` frame to the same `uwbFrameFields` the inspector uses, labelling
each row with the existing `frameDetail.fields.name` strings, so **both languages come for free** and there is one
UWB decode rather than two. The new second parameter defaults to the EN table, so the call sites that only pass Wi-Fi
frames (including `tests/course/tier1-retries-queues.test.ts`, which is Task 8's file) are untouched.
Covered by two new cases in `tests/ui/uwb-format.test.ts`: EN and ZH label the MHR fields and the IEs and contain
none of the four Wi-Fi-only labels, and a Wi-Fi frame still gets the 802.11 rows.

### 4, 5, 6 — dead decode arms

- `SUBTYPE` in `src/model/frameFields.ts` is now `Record<Exclude<FrameKind, 'data' | UwbFrameKind>, string>`: the four
  duplicate UWB strings are gone, leaving `uwb/frameFields.ts` as the only table that names them.
- `controlMpdu` guards with `if (f.uwb) throw new Error('unreachable: UWB frames are decoded by uwb/frameFields.ts')`
  instead of building a whole `DecodedFrame` (PPDU layout included) to keep one MPDU out of it; the four `case` arms
  are deleted.
- `f.dst === '*' || f.dst.startsWith('*')` → `f.dst.startsWith('*')`, with a comment naming the `*mu` wildcards.

### 7 — a FoM byte of 0

`fmtUwbRecord` tested truthiness, so a recorded `fom: 0` vanished. Now `r.fom !== undefined`, and `fomText(0)` returns
**"no FoM"** (standard §10.29.1.6: an all-zero byte is "not available", not 0 % confidence) instead of
"0 % within 0.05 ns". EN only, like the rest of the log line. Asserted in `tests/uwb/inspector-rows.test.ts`.

### 8 — the lane fixture is a real `NodeView`

`tests/ui/uwb-lanes.test.ts` built one by hand and double-asserted through `unknown`. It now runs `initViewState` over
a two-node UWB scenario and takes `nodes['tag-1']`, so the fixture cannot drift from what the reducer produces.

### 9 — BSS totals (accepted)

Left as is, per the ruling, and carried forward: **the positioning plan should either filter UWB lanes out of the
no-selection totals table or give a UWB-only scenario its own summary.**

### Verification

`npx tsc -b` clean, `npx vite build` clean.
Everything outside Task 8's scope: `npx vitest run tests/ui tests/model tests/uwb tests/engine tests/scene tests/player
tests/editor tests/smoke.test.ts --exclude tests/engine/lesson-hashes.test.ts` → **73 files, 558 tests, all passing**.

The whole-repo run shows 3 failures, all in Task 8's uncommitted in-flight work and none in a file this task touches:
`tests/course/uwb-intro.test.ts` (2, a lesson being written) and `tests/engine/lesson-hashes.test.ts` (1). The hash
diff is **two added keys only** — `uwb-intro` and `uwb-intro#0` — with no existing hash changed, which confirms this
round altered no engine behaviour; regenerating that fixture is Task 8's to do.
