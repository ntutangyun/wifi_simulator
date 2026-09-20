# Fix wave — UWB slices 3–6 (combined branch review + every parked minor)

Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/uwb-ranging`, base `5139da3`.
Implementer: Fable, 2026-09-19. Nine commits, `5684d58..c7d2289`.

## Verification

| check | result |
| --- | --- |
| `npx tsc -b` | exit 0, no diagnostics |
| `npx vite build` | built in 2.77 s (the usual >500 kB chunk warning only) |
| `npx vitest run` | **108 files, 1440 passed** (1431 before; 9 new cases) |
| `git status` | clean apart from the controller's untracked `docs/superpowers/sdd/2026-09-19-uwb-aoa/` |
| `tests/fixtures/lesson-hashes.json` | **untouched** — absent from every commit's file list; `tests/engine/lesson-hashes.test.ts` green |

## Commits

| # | hash | what |
| --- | --- | --- |
| 1 | `5684d58` | `fix(uwb): the DL-TDoA decoder prints the clock offset in ppm` |
| 2 | `ac46be5` | `docs(uwb): say what the model does where the reviews found it unsaid` |
| 3 | `fb290bb` | `docs(uwb): one headline for the DL-TDoA crystal problem, in both languages` |
| 4 | `911c8f8` | `feat(uwb): the schema refuses angle of arrival outside two-way ranging` |
| 5 | `9c84ba2` | `refactor(uwb): makePoll takes an options object; the slot fits the round's own frames` |
| 6 | `c2c069a` | `refactor(engine): the coexistence minors the slice-3 reviews parked` |
| 7 | `271f36b` | `test(uwb): pin the guards the slice reviews found unpinned, and correct three comments` |
| 8 | `8fbd7bd` | `feat(uwb): the inspector's time-difference table names its reference anchor` |
| 9 | `c7d2289` | `fix(course): the contention lesson's three loose numbers, and four new pins` |

## A — the combined review's findings

| finding | done in | how |
| --- | --- | --- |
| **1** DL coffs printed as a fraction | `5684d58` | decoder scales by 1e6 (`frameFields.ts:139`); `UwbDlTimes.coffs` docstring says "a fraction (ppm × 1e-6); the decoder prints ppm"; fixture feeds `1.5e-6` (and `0.25e-6`); new live pin in `tests/course/uwb-dl-tdoa.test.ts` decodes every shipped Response and asserts the printed number within 0.5 ppm of `ppm_i − ppm_ref` from the scenario's own draws |
| **2** `dlDiffSigmaM` docstring off by 2× | `ac46be5` | 12 cm at 2 ms, 36 cm at 6 ms; plus the correction-off clause (tdoa T3 #3) |
| **3** the Final's RX times are carried but unread | `5684d58` (`frames.ts` note) + `ac46be5` (device) | said at `makeFinal`, at `transmitDl`, at the Final's own case in `transmitDl`, and in the lesson's Final row ("…which no badge here reads"; ZH fuller). Kept, as ruled — FiRa carries them |
| **4** RCMA budget is per anchor, not per (anchor, tag) | `ac46be5` | documented on `UwbDeviceCfg.maxAttempts`, with what a multi-tag lesson would have to change |
| **5** two headline numbers for the DL crystal problem | `fb290bb` | Guide EN+ZH, glossary EN+ZH, README row, EditorGuide EN+ZH and `uwbClockCorrectionHint` EN+ZH all state the rule ("20 ppm of the gap between the Poll and the response being timed") with both worked numbers (6 ms → 36 m, a 20 ms nine-anchor round → 120 m) |
| **6** self-cancelling `syncErrorNs` sentence | `fb290bb` | "a fixed residual of `syncErrorNs` (0 ns by default, i.e. perfect sync)", EN and ZH |
| **7** `aoa` legal outside `twr`; `uwbModePatch` leaves it set | `911c8f8` | schema issue with the ruled message; `uwbModePatch` clears `aoa`; both directions tested, plus the two TDoA modes' rejection |

## B — parked minors, ledger by ledger

### coexist (slice 3)

| item | done in | note |
| --- | --- | --- |
| T1 #2 `UWB_BAND_MHZ` derived from the centres | `c2c069a` | `bandOf(ch)` from `UWB_CHANNEL_MHZ` ± half the 499.2 MHz width, snapped to 0.1 MHz so all four edges stay bit-identical (a raw halving gives 6739.200000000001) |
| T2 R1 Wi-Fi law duplicated | `c2c069a` | `wifiToUwbPathLossDb` now calls `pathLossDb`; the two exported constants are no longer needed by it |
| T2 R2 channel throw at query time | `c2c069a` | validated in `emit` for the UWB side; the test asserts the throw at the emit and that nothing was registered |
| T2 R3 comment tense | `c2c069a` | reworded (the `simulation.ts` import now exists, and the sentence no longer names the exports it dropped) |
| T3 #1 the 160 MHz floor | `c2c069a` | documented on `Simulation.spectrum`: non-null means "the bands may meet", never "coupled" |
| T3 #2 `ppduBand` conflates TX occupancy with RX noise bandwidth | `c2c069a` | documented with the straddling case that would bite and the fix |
| T3 #3 the isolation comment overstates | `c2c069a` | qualified with "unless the bands meet", pointing at `this.spectrum` |
| T4 #1 collision-before-interference unpinned | `c2c069a` | new case: two equal transmitters under +20 dBm of Wi-Fi ⇒ both `RX_FAIL collision`, no `UWB_INTERFERED` anywhere |

### contention (slice 4)

| item | done in | note |
| --- | --- | --- |
| T1 #1 `uwbSlotFitNs` sizes a Final a contention round never sends | `9c84ba2` | `uwbLongestFrameBytes`/`uwbSlotFitNs` take the schedule; contention sizes `max(Poll 31, SS Response)`; both call sites pass it; new test pins the one-anchor case where the old bound was the smaller number |
| T2 #1 "the eight UWB types" | `271f36b` | header no longer counts them wrong (points at the switch in `src/ui/format.ts`) |
| T2 #2 comments credit IEs the code does not read | `ac46be5` | both reworded (the anchor is configured with the same value the Poll advertises) — the "read them off the frame" alternative not taken |
| T2 #3 an anchor that never heard the Poll | `271f36b` | new case: a 200 m anchor draws nothing, transmits nothing, and the near anchor stays at attempt 1 for all six rounds |
| T2 #4 wrong disabled-field tooltip | `911c8f8` | new `uwbContentionOnly` string EN+ZH, used when `ssOnly && !contending` |
| T2 #5 the method patch had no test | `911c8f8` | extracted as `uwbMethodPatch`, called by the select, both directions asserted |
| T2 #6 `endRound(heard = false)` | `271f36b` | flag required; the three call sites pass it explicitly |
| T2 #7 `session.ts` header denies contention | `271f36b` | rewritten with the contention layout line and the "in a time-scheduled session" qualifier |
| T3 #1 `−14 dBm` unpinned | `c7d2289` | `UWB_TX_POWER_DBM` pinned, and every UWB node's power checked against it |
| T3 #2 "eight slots instead of four" | `c7d2289` | now "eight and a half … four and a half", EN+ZH, pinned from `(S+1)/2` and from the runs' draws |
| T3 #3 "nearly four times worse" | `c7d2289` | "three and a half times", EN+ZH, ratio pinned (3.52) |
| T3 #4 ZH parity drift in `tryThis[1]` | `c7d2289` | the extra clause removed |
| T3 #5 grey-out labels unpinned | `c7d2289` | both editor labels pinned through `STRINGS` and matched into the shipped sentence |
| T3 #6 "within a sigma" pinned as a string | `c7d2289` | the inequality asserted for the 16-slot run |

### tdoa (slice 5)

| item | done in | note |
| --- | --- | --- |
| T1 #6 `makePoll`'s nine positional parameters | `9c84ba2` | `PollOpts` object; both engine call sites and the three test call sites updated; the DL call no longer writes `'time', 8, 3` to reach `dl` |
| T2 #1 stale count in `format.ts` | `271f36b` | same fix as contention T2 #1 |
| T2 #2 `tofRctu` is true-time RCTU | `ac46be5` | noted with the size of the residual (0.2 mm at 20 ppm over 30 m) |
| T2 #3 missed Poll/Final untested | `271f36b` | new case: two brick walls between anchor 1 and one tag ⇒ that tag hears the three Responses, emits no `UWB_TDOA` and no fix, while the other two tags are untouched |
| T2 #4 correction-off still needs all four instants | `ac46be5` | stated above the guard, with why (the two variants must drop the same rounds) |
| T2 #5 the Δ table never names the reference | `8fbd7bd` | `UwbNodeView.tdoaRef` carried beside the map; caption reads "time differences (3) · against anchor 1"; EN+ZH string; pinned in the view test |
| T3 #1 stale `ulSigmaM` comment | `271f36b` | the false parenthesis deleted |
| T3 #2 ring gate untested | `271f36b` | a hyperbolic lane carrying a range draws no ring; flipping its method to `twr` brings the ring back |
| T3 #3 `dlDiffSigmaM` and an uncorrected crystal | `ac46be5` | clause added (and the variant produces no fix at ±20 ppm anyway) |
| T3 #4 `noPosition` wrong for a one-way lane | `8fbd7bd` | new `noPositionTdoa` EN+ZH, chosen from the lane's own differences |
| T3 #5 ternary in the iterable | `271f36b` | named `ringsToDraw` |
| T3 #6 ASCII quotes in ZH strings | `8fbd7bd` | three ZH strings use full-width quotes, the EN `uwbSyncErrorHint` uses curly ones |
| T6 #1 README DL ellipse row | `fb290bb` | "…RMS'd across the responders heard into the one sigma the solver takes" |

### aoa (slice 6)

| item | done in | note |
| --- | --- | --- |
| T1 #1 contradicting draw-order comments | `ac46be5` | both reworded: the phase draw is the reception's last, the contention draw comes after it |
| T1 #2 the mirror is implied, not asserted | `271f36b` | the reflected coordinates pinned, plus "error = 2 × distance from the baseline" |
| T1 #3 "reflection in the boresight" is the wrong line | `271f36b` | the test comment now says the reflection across the array baseline, and why 135° → +45° |
| T1 #5 `aoa` silently inert outside `twr` | `911c8f8` | closed by finding 7 |

## Skipped, with the reason

| item | why |
| --- | --- |
| coexist T1 #1 — "at 80 MHz" in the overlap note | the review says "No action required unless the plan owner wants the shorter string"; the longer string is the accurate one |
| coexist T3 #4 — energy detect uses the link's widest width | the review's own "What to do: nothing now"; it becomes a change only if a lesson mixes widths on 6 GHz |
| coexist T3 #5 — the editor's 80 MHz overlap readout | marked *informational, not this task's file*; changing it is a modelling decision about what the editor's percentage means, not a drift fix |
| coexist T4 #2 — `network.test.ts` imports `lessonKit.node` | an either/or with no behaviour at stake; duplicating `lessonKit.node`'s positional signature locally would create the second definition the reviewer elsewhere warns about |
| coexist T4 #3 — redundant `if (sp && emission)` | explicitly *optional* and "defensible as written"; TypeScript needs `sp` in the condition either way |
| contention T3 #7/#8/#9 — "the sit-out column is why", kit predicate naming, "three lines" | all marked **Informational**; #8 and #9 are corrections to a report body, not to shipped code |
| tdoa T1 #6's second half — `makeResp`'s DL branch sizing with `uwbRespBytes('ds')` whatever `method` says | a design decision the review records as harmless (the schema forbids SS + one-way, and the IE list keeps the decoder's sum right); the controller's item named `makePoll` |
| aoa T1 #4 — `uwbAoaRows` can print `-0.0°` | "a note rather than a change request"; the range table's formatter has the same property |
| aoa T1 #6 — `fix.anchors[0]` indexed unchecked | **Info**, a latent assumption that cannot happen today (the only emitter writes `[this.id]`) |
| the review's *Carry to 802.15.4ab* list | out of scope by the controller's brief (explicit channel on `Emission`, a UWB records-hash, tag-side use of the Final's RX times, per-(anchor, tag) budgets, `ppduBand` centring, hyperbola drawing, elevation) |

Nothing was blocked, and no fix needed a fixture change.

## Notes for the reviewer

- The `makeFinal` DL docstring (finding 3's `frames.ts` half) landed in commit 1 rather than commit 2:
  commit 1 was amended to fix a `string | undefined` in the new test and swept that file's edit in.
  Content is complete; only the message attribution is off by one commit.
- `emit` now validates a UWB emission's band. This is a behaviour change on a malformed emission
  only (it used to throw at the first query that touched the band); the existing test was rewritten
  to assert the new site.
- `UwbNodeView` gained `tdoaRef`, so three view fixtures in the tests carry one more field.
