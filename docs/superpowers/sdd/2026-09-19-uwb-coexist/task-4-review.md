# Task 4 review — UWB side, record, view, log, inspector, Simulation wiring

Reviewed: commit `d987c3e` (`7995c4f..d987c3e`), 14 files, +412/−21.
Read: `task-4-brief.md`, `task-4-report.md`, `task-4-review.diff`, plus `src/engine/spectrum.ts`,
`src/engine/channel.ts`, `src/engine/events.ts`, `src/engine/simulation.ts`, `src/uwb/phy.ts`,
`src/uwb/device.ts`, `src/model/view.ts` and spec Slice 3.
Working tree also holds another agent's in-flight `src/course/lessonKit.ts`, `src/ui/Guide.tsx`,
`src/course/uwb/uwb-coexist.ts` and `tests/scratch/` — ignored.

## Verdict

- Spec: APPROVED
- Quality: APPROVED

## Verification run

- `npx vitest run tests/uwb tests/engine/channel-spectrum.test.ts tests/engine/lesson-hashes.test.ts tests/ui/uwb-format.test.ts`
  → **15 files, 138 tests, all passing**, `lesson-hashes.test.ts` green and
  `tests/fixtures/lesson-hashes.json` absent from the commit's file list.
- `npx tsc -b` → **exit 0, no diagnostics** (nothing from the in-flight files either).

## Binding constraints — checked one by one

| Constraint | Where | Result |
|---|---|---|
| Emission registered/retired **by identity**, channel's band, node's tx power | `src/uwb/channel.ts:189-204` | One fresh `Emission` per PPDU, captured in the TX-end closure and handed back to `retire`; `eirpDbm` from `nodeOf(from).txPowerDbm` (no `?? 0`), band from `UWB_BAND_MHZ[cfg.channel]`. On the air just before `TX_START`, off just before `TX_END` — mirrors `Channel.startTx`/`endTx` (`src/engine/channel.ts:254,349`). ✓ |
| `maxForeignMw` initialised at arrival, raised on every `onChange('uwb')` | `src/uwb/channel.ts:252-257`, `108-119` | ✓ (see "Risks probed" 2) |
| `sirDb = rssi − dbm(maxForeign)` **after** the collision decision | `src/uwb/channel.ts:287-304` | Collision returns early; the SIR test is only reached by an otherwise-successful frame. ✓ |
| `< UWB_SIR_MIN_DB` → `RX_FAIL lowSinr` + `UWB_INTERFERED { node, from, foreignDbm, sirDb }` + `onRxFail` | `src/uwb/channel.ts:296-302` | Exactly that order; pinned by `tests/uwb/channel-coexist.test.ts:140-144` (same `t`, `seq + 1`, radio told). ✓ |
| `UwbRxInfo.foreignDbm` | `src/uwb/channel.ts:44-46`, set at `293` | Required field, `−Infinity` with nothing foreign; carried on `RX_OK` too (`channel-coexist.test.ts:153`). ✓ |
| `UwbNodeView.interfered` | `src/uwb/view.ts:42-43,50,106-110` | Counted on the **receiver's** lane, switch stays exhaustive, `structuredClone` snapshots carry it. ✓ |
| Log line format | `src/uwb/format.ts:39-40` | Byte-identical to the brief's template; pinned in `tests/ui/uwb-format.test.ts:64-67` and added to the `fmtRecord` delegation table. ✓ |
| Inspector row EN/ZH | `src/uwb/ui/UwbInspector.tsx:33`, `src/ui/i18n.ts:132,402,780` | Row sits directly under "silent slots"; "lost to Wi-Fi" / "被 Wi-Fi 干扰丢失". ✓ |
| `Simulation` passes the spectrum into `UwbNetwork` | `src/engine/simulation.ts:308` | The 6 GHz link block (`:143-158`) decides `this.spectrum` earlier in the constructor, so both engines end up on the same object. ✓ |
| **No behaviour change without a spectrum** | `src/uwb/channel.ts:106,203,252,290` | Falls out of the arithmetic: `maxForeignMw` stays 0 → `foreignDbm = −Infinity` → `sirDb = +Infinity`, never `< −12`; no listener is registered and nothing is emitted. Pinned twice: `channel-coexist.test.ts:171-179` (no spectrum vs empty spectrum, `records` compared with `toEqual`) and `network.test.ts:373-382` (Simulation level). `lesson-hashes.json` untouched. ✓ |
| Tests as listed | `channel-coexist.test.ts` (6, new), `network.test.ts` (+2), `view.test.ts` (+1), `uwb-format.test.ts` (+1), `inspector-rows.test.ts` (field only) | Every bullet of the brief's test list has a counterpart. ✓ |

Accepted rulings honoured as stated: no `rows.ts` formatter (`interfered` renders straight from the
view like `timeouts`); −34.46 dB derived from `uwbPl0Db`/`wifiToUwbPathLossDb` rather than hard-coded;
the with/without check expressed as UWB-only vs a non-overlapping BSS. The channel-9 gate the brief
originally named is already pinned by Task 3 (`tests/engine/channel-spectrum.test.ts:246`), so nothing
is lost by the substitution.

Spec Slice 3's UWB bullet (`docs/superpowers/specs/2026-09-19-uwb-slices-design.md:73-80`) is
satisfied verbatim, phase-1 determinism included.

## Risks probed (the ones the brief flagged) — all clear

1. **A collision-doomed reception also emitting `UWB_INTERFERED`.** It cannot:
   `src/uwb/channel.ts:294-299` emits `RX_FAIL collision` and `return`s before `sirDb` is ever
   computed. The `foreignDbm` assignment at `:293` happens first but only writes `rx.info`, which the
   collision path never hands anywhere. Order is right; see finding 1 for the missing pin.
2. **A Wi-Fi emission starting in the same instant as the UWB arrival.** Covered in every ordering,
   because `Spectrum.emit` mutates `live[side]` *synchronously* (`src/engine/spectrum.ts:97-100`)
   and only the *notification* is deferred to phase 1:
   - Wi-Fi TX starts in phase 0 of `t`, arrival is phase 1 of `t` → the emission is already in `live`
     when `startRx` takes its reading at `:252-256`.
   - The notification runs first (it was scheduled with a lower `seq`) → it finds no open reception and
     no-ops, and the arrival's own initial reading covers the emission anyway.
   - The emit happens in phase 2 of `t`, after the arrival already read 0 → `notify` pushes a
     `(t, phase 1)` item, which by the heap's `(t, phase, seq)` order (`src/engine/events.ts:13-24`)
     becomes the top and is popped immediately, raising the open reception's max at the same instant.
   Coverage is also complete in time: power is piecewise-constant between changes, the reading at
   arrival covers `[arrival, c₁)` and each notification covers `[cᵢ, cᵢ₊₁)`, so the max over
   notification instants *is* the max over the reception.
3. **A UWB frame's own emission counted as foreign.** No: `foreignMw('uwb', …)` sums
   `live[OTHER['uwb']] = live.wifi` only (`src/engine/spectrum.ts:119-122`), and the separation is
   already pinned by `tests/engine/spectrum.test.ts:115-121`.
4. **`onChange` registered per reception.** No: exactly one listener, in the constructor
   (`src/uwb/channel.ts:108-119`), which walks the radios and takes **one** `foreignMw` reading per
   receiver. Symmetric with the Wi-Fi side (`src/engine/channel.ts:194`).
5. **`toFixed` on `−Infinity` in the log line.** Unreachable: `foreignDbm === −Infinity` implies
   `sirDb === +Infinity`, which is never `< −12`, so `UWB_INTERFERED` is never emitted with an
   infinite `foreignDbm`. (A tiny positive `maxForeignMw` gives a large finite negative dBm and an
   even larger positive `sirDb` — same conclusion.)
6. **`any` / `@ts-ignore` / `as unknown as`.** None. The single `as never` in
   `tests/uwb/channel-coexist.test.ts:119` is the repo's established record-filter idiom
   (`tests/engine/helpers.ts:87`, `tests/uwb/network.test.ts:47`, both pre-existing).

Also checked and clean: no other site enumerates UWB record types (only `src/ui/format.ts`,
`src/uwb/format.ts`, `src/uwb/view.ts`, all updated); `src/uwb/device.ts:200-203` treats `lowSinr`
exactly like `collision`, so the slot deadline still reports the miss; the `nodeOf` refactor throws the
same message `rssiDbm` threw before; `cloneView` is `structuredClone`, so `interfered` survives
snapshot/replay; the measured geometry in the report checks out (tag→AP 3.162 m, tag→laptop 1.000 m
from `lessonKit.node`'s z defaults).

## Findings

1. **minor — `tests/uwb/channel-coexist.test.ts` (whole file): the collision-before-interference
   ordering is correct but unpinned.** No test puts a *doomed* reception under strong foreign power,
   so nothing would catch a future refactor that moved the SIR test above the `if (rx.doomed)` branch
   at `src/uwb/channel.ts:294` and started double-reporting a collided frame as
   `UWB_INTERFERED`. *Why it matters:* the lesson counts `UWB_INTERFERED` per second, so a leak from
   the collision path would silently inflate the headline number. *What to do:* add one case to
   `channel-coexist.test.ts` — two UWB transmitters within `UWB_CAPTURE_DB` of each other plus the
   +20 dBm Wi-Fi emission — asserting `RX_FAIL.reason === 'collision'` and no `UWB_INTERFERED` record.
   Cheap (the harness already has two nodes and `wifiEmission`); not blocking, since the shipped
   behaviour is right.

2. **minor — `tests/uwb/network.test.ts:9`: the engine test now imports from the course layer.**
   `import { node as wifiNode } from '../../src/course/lessonKit'` makes this the only test outside
   `tests/course/` that depends on `lessonKit`; the file already carries its own local `uwbNode`
   helper. *Why it matters:* `lessonKit.node`'s positional signature (`id, name, kind, x, y, gen,
   profile, features?, z?`) is a course-authoring convenience, and it is being edited by another agent
   on this very branch — a change there would break a coexistence test that has nothing to do with the
   curriculum. *What to do:* either add a local `wifiNode` beside `uwbNode` in the test file, or leave
   it and accept the coupling deliberately; no behaviour is at stake.

3. **minor — `src/uwb/channel.ts:196,199,205`: redundant double guard `if (sp && emission)`.**
   `emission` is non-null exactly when `sp` is, so the conjunction restates the invariant twice, in
   two places. *Why it matters:* cosmetic only — it reads as though the two could diverge. *What to
   do (optional):* build `sp && { … }` into a single `const em` and guard on `sp` alone, or keep as
   is; TypeScript needs `sp` in the condition either way for narrowing, so the current form is
   defensible.

No blocking findings.
