# T1 — device.ts split into core, tdoa, mms and report modules

Pure move, no behaviour change. `src/uwb/device.ts` (1577 lines) split into:

| File | Lines | Contents |
| --- | --- | --- |
| `src/uwb/device.ts` | 732 | `UwbDevice` class (constructor, state machine, radio hooks `onSlot`/`onRxOk`/`onRxFail`/`onRxStart`/`listening`), `beginRound`/`endRound`, SS/DS-TWR logic (`onResponse`, `onFinal`, `onReport`, `solveFix`), slot/send plumbing (`closeSlot`, `listenFor`, `listenOpen`, `transmitFor`, `send`, `drawContentionSlot`, `setState`), and every export other files import (`UwbDeviceCfg`, `UwbGeometry`, `UwbDeviceState`, `UwbDevice`, plus newly-exported `RoundState`/`ScheduledAction` used only by the split-out modules). Thin wrapper methods `ulArrivalNs()`/`solveUlFix()` delegate to `device.tdoa.ts` to keep the class's public API unchanged for `network.ts`. |
| `src/uwb/device.tdoa.ts` | 394 | DL-TDoA and UL-TDoA: `onDlSlot`, `onUlSlot`, `transmitDl`, `onDlRx`, `solveTdoaFix`, `solveUlFix`, `ulArrivalNs`, plus `DlResponse`/`DlRoundState` types and the private `dlDiffSigmaM`/`ulDiffSigmaM` helpers. |
| `src/uwb/device.mms.ts` | 410 | P802.15.4ab MMS cycle: `onMmsSlot`, `onMmsRx`, `solveMmsFix` (exported entry points) plus internal `nbClear`, `txNbPoll`, `txNbResp`, `txFragment`, `txNbReport`, `closeDueTrains`, `evaluateTrain`, `onNbReport`, `timingKind`, and the `MmsRoundState`/`TrainFragment` types + `freshMms`. |
| `src/uwb/device.report.ts` | 108 | Record emission: `reportRange`, `measureAoa`, and the internal `emitAoaFix`. |

## Pattern used

Every function that used to be a `private` method now takes `dev: UwbDevice` as its first
parameter instead of using `this`. Class fields/methods that only the moving code needed
(`cfg`, `rng`, `ch`, `emit`, `now`, `geometry`, `round`, `nbSkipBlock`, `blockRanges`, `send`,
`listenFor`, `transmitFor`, `clearExpectation`, `setState`) lost their `private` modifier so the
new files can call `dev.xxx(...)` with real types (no `any`). Fields/methods used only inside the
core file itself (`expect`, `txSeq`, `seqNo`, `attemptsLeft`, `q`, `listenOpen`, `closeSlot`,
`drawContentionSlot`, `solveFix`) stayed `private`. This was chosen over the prototype-mixin
pattern because most call sites already passed the round/geometry/etc. as explicit parameters, so
"device as first arg" needed fewer structural changes than declaration merging + `Object.assign`.

`ulArrivalNs()` and `solveUlFix()` are called externally from `src/uwb/network.ts`, so they stay
as real methods on `UwbDevice` — thin one-line delegates to the functions of the same name in
`device.tdoa.ts` (imported under an `Impl` alias to avoid a name clash with the method).

## Cross-file calls

- `device.ts` → `device.tdoa.ts`: `onDlSlot`, `onUlSlot`, `onDlRx`, `solveTdoaFix`, `transmitDl`
  (called from `onSlot`, `onRxOk`, `endRound`, `transmitFor`).
- `device.ts` → `device.mms.ts`: `onMmsSlot`, `onMmsRx`, `solveMmsFix`, `freshMms`.
- `device.ts` → `device.report.ts`: `measureAoa`, `reportRange` (from `onRxOk`, `onResponse`,
  `onFinal`, `onReport`).
- `device.mms.ts` → `device.report.ts`: `reportRange` (from `onNbReport`).

## Imports outside `src/uwb`

None. Only `src/uwb/device.ts`, `device.tdoa.ts`, `device.mms.ts`, `device.report.ts` were
touched; `git status --short` shows no other file changed. `network.ts` and `tests/uwb/network.test.ts`
still `import { UwbDevice } from './device'` / `'../../src/uwb/device'` unchanged.

## Gates

1. `npx tsc -b --noEmit` — clean.
2. `npx vitest run` — 132 files / 2252 tests passed.
3. `tests/fixtures/lesson-hashes.json` and `tests/fixtures/uwb-record-hashes.json` — untouched
   (`git status --short` shows no diff for either).
4. `npx eslint src/uwb` — no `eslint.config.*` in the repo (ESLint v10 refuses to run without
   one), so this gate is not applicable; nothing to report.

## Concerns

- Several previously-`private` class members (`cfg`, `rng`, `ch`, `emit`, `now`, `geometry`,
  `round`, `nbSkipBlock`, `blockRanges`, `send`, `listenFor`, `transmitFor`, `clearExpectation`,
  `setState`) are now plain (public) class members so the split files can reach them with real
  types. `UwbDevice` is only constructed and driven by `network.ts` today, and nothing outside
  `src/uwb` touches these members, but the class's encapsulation is looser than before — a
  reviewer who wants tighter encapsulation back would need the prototype-mixin/declaration-merging
  approach instead, at the cost of more boilerplate.
