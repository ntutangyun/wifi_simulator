# Whole-branch review — UWB slices 3–6 (coexistence, contention, TDoA, AoA)

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, head `5139da3`, base `f8c1f1a`.
Spec: `docs/superpowers/specs/2026-09-19-uwb-slices-design.md`. Reviewer: Fable, 2026-09-19. Review only; no files edited.

## Verdict

**APPROVED** — nothing blocks the merge; one user-visible unit bug in the DL-TDoA frame decoder (finding 1) and a handful of documentation drifts should ride the fix wave, and the per-task parked items go with them.

Evidence: `npx vitest run` → 108 files, **1431 passed**; `npx tsc -b` clean; `npx vite build` clean (the usual >500 kB chunk warning). `git status`: only `?? docs/superpowers/sdd/2026-09-19-uwb-aoa/` (progress + 3 briefs; the aoa reports/reviews are still under the ignored `.superpowers/`) — the controller's export. `tests/fixtures/lesson-hashes.json` **only gained keys** across the four slices (17 new `uwb-coexist…uwb-aoa#2` lines, no existing value touched).

## Findings

Ranked most severe first. Nothing already parked in the four ledgers is repeated here.

### Important

**1. DL-TDoA frame decoder prints the clock-offset IE in the wrong unit — the inspector shows "clock offset -0.00 ppm" for every Response.**
`src/uwb/frameFields.ts:134-138` renders `clock offset ${(u.dl?.coffs ?? 0).toFixed(2)} ppm to anchor 0`, and `src/uwb/frames.ts:26-28` documents `UwbDlTimes.coffs` as "in ppm". But the producer writes a **fraction**: `src/uwb/device.ts:615` builds `coffs = (txPpm − ppm)·1e-6 + gaussian·cfoNoisePpm·1e-6` and `:903` stores `dl.coffsToRef = -coffs`; the consumer `:468` needs a fraction (`replyTime·(1 − coffs)`). In the shipped lesson (anchor-1 at −19.04 ppm, responders ±20 ppm) every COFF row therefore reads `0.00`/`-0.00 ppm` while the engine is correcting 20–40 ppm. `tests/model/uwb-frameFields.test.ts:120,155` feeds `coffs: 1.5` and asserts `1.50 ppm`, so the unit test passes against a value the engine never produces; `tests/course/uwb-dl-tdoa.test.ts:361` only checks `typeof coffs === 'number'`. Exactly the stated-vs-simulated class the project watches for, in the one place the lesson tells the learner to look ("its measured clock offset to anchor 1").
*Fix:* decoder `((u.dl?.coffs ?? 0) * 1e6).toFixed(2)`; correct the `UwbDlTimes.coffs` docstring to "as a fraction (ppm × 1e-6); the decoder prints ppm"; change the fixture to a fraction (`1.5e-6`) and add a live pin in the dl-tdoa lesson test: decode a real Response and assert the row's number is within 0.5 ppm of `ppm_i − ppm_ref` for that anchor (the crystals are pinned elsewhere in that test already).

### Minor

**2. `src/uwb/device.ts:213` — `dlDiffSigmaM` docstring is off by 2×.** "0.2 ppm of a 2 ms reply is 6 cm, of a 6 ms reply 18 cm" — 0.2e-6 × 2 ms = 0.4 ns × 0.2998 m/ns = **12 cm**, and 36 cm at 6 ms. The code and the lesson ("0.12 m per slot", 3σ envelope 0.36/0.72/1.08 m) are right; only the comment is wrong. Fix the two numbers.

**3. The DL-TDoA Final's RX times are carried, sized and decoded but never read by any tag.** `src/uwb/device.ts:835-840` puts anchor 0's `rxResp` into the Final (4 B per responder, counted by `uwbDlFinalBytes` in the slot-fit rule); the tag's `onDlRx` (`:917-921`) takes only `txCounter` from it — the responders' reply times and offsets come from the Responses' own TXT/RXT/COFF. The lesson's table row for the Final ("its counter for each Response's arrival") lets a learner assume the badge uses them; the formula block shows it does not. Not a bug — say so where the payload is defined (`frames.ts` `makeFinal` DL note, `transmitDl` docstring) and in the lesson row ("carried so a receiver could check each responder's offset against anchor 1's round trip; this badge uses the Response's own offset"), or drop the IE and shave 12 B off the Final. Carry the alternative (FiRa-style tag-side offset check) to the 4ab slice if kept.

**4. `src/uwb/device.ts:252, 382-391, 700-712` — the RCMA retry budget is per anchor, not per (anchor, tag).** In a contention session with several tags, a miss in tag A's round spends an attempt that can sit the anchor out of tag B's next round. Nothing shipped is affected (the lesson has one tag) and the schema allows several tags; document it on `UwbDeviceCfg.maxAttempts` ("one budget per anchor across all tags' rounds — model") or key `attemptsLeft` by `tagId`.

**5. Two different headline numbers for the DL-TDoA crystal problem.** Guide EN/ZH (`src/ui/Guide.tsx:293, 366-367`), glossary "Clock-rate correction", README row "Tag clock-rate correction", EditorGuide "Tag clock correction" and `i18n.uwbClockCorrectionHint` all say "20 ppm over a 20 ms round is 120 m"; the lesson says "up to 6 ms apart … 36 m" and every shipped DL round is 10 ms (5 slots). Both are arithmetic-true (a 9-anchor round is 20 ms), but a learner who reads the lesson then the Guide meets 36 m and 120 m for "the" problem. Suggest one sentence that gives both in at least the glossary and Guide ("20 ppm over this lesson's 6 ms span is 36 m; over a full 20 ms round, 120 m").

**6. `src/ui/Guide.tsx:296-297` (EN) — "each left with a fixed residual of {syncErrorNs} ns by default that the fix's ellipse grows with"** interpolates the default `0`, so the sentence reads "a fixed residual of 0 ns … that the ellipse grows with". True but self-cancelling; phrase as "of `syncErrorNs` (0 ns by default, i.e. perfect sync)". The ZH (`:370-371`) has the same shape.

**7. `src/uwb/ui/UwbSessionFields.tsx:604-606` — `uwbModePatch` resets `schedule` when a one-way mode is picked but leaves `aoa: true` set;** the checkbox greys out, the schema accepts it and the engine ignores it (the "silently inert" info already parked in aoa T1 review #5). Clearing `aoa` in the same patch keeps the plan honest with no schema change. Fold into that parked item.

## Cross-slice integration (checked, no defect)

- **contention + aoa (SS):** AoA measured on the Poll only (`device.ts:620` guard `mode === 'twr' && from === r.tagId`); no fix because `reportRange` never runs on an SS anchor; draw order ts-noise → coffs → AoA → contention draw, so `aoa:false` and `schedule:'time'` baselines are each byte-identical (fixture confirms).
- **dl-tdoa / ul-tdoa + spectrum:** a lost Poll/Final leaves `dl.rxPoll/rxFinal` null → no differences, no fix; a lost Response is simply left out (`:465`); anchor 0 missing a blink → `solveUlFix` returns before any record (`:529`); `lowSinr` is not `collision`, so no spurious `UWB_CONTEND_COLLISION`.
- **ul-tdoa `of` routing + overlay ageing:** `view.ts subject()` routes `UWB_TDOA`/`UWB_POSITION` to the tag lane; the tag's own `UWB_ROUND` keeps `u.block` current, so `fix.block < u.block − 1` ageing works; anchor 0's lane stays empty as the lesson says.
- **aoa with several anchors:** each anchor's `UWB_POSITION{of: tag}` overwrites the tag lane's `position` mid-round (accepted flicker); it cannot corrupt the tag's own fix — `solveFix` reads only `r.ranges`, and the tag's TWR fix is emitted at `endRound`, after every anchor's Final-time AoA fix, so the lane ends each round on the TWR fix (or on the last AoA fix when < 3 anchors). Only the latest anchor's bearing line is drawn (`bearing:<tag>`), by design.
- **state across rounds/modes:** `freshRound` rebuilds `dl`, `ulArrivalNs`, `aoaThetaDeg`, `contendSlot` every round; `attemptsLeft` is the one deliberately persistent field (finding 4). `SlotAction` growth: the `anchor: -1` contention action is handled before `peers.anchors[action.anchor]` is indexed (`:307-315`); `transmitFor`/`transmitDl` switches have no fallthrough (`default` no-op documented). `RoundPlan.contentionSlots`/`method` are read only by the modes that mean them (the DL `makePoll` call passing them is the parked `makePoll` signature item).
- **Spectrum wiring:** `Channel` is keyed by physical ids (`simulation.ts:170,243`), so `posOf`/`txPowerOf` lookups in `byId` are safe under MLO; `onForeignChange` → `updateAllCca` only emits on a busy-state change, so extra wake-ups at UWB frame edges cannot perturb an uncoupled timeline; one Spectrum per simulation (`this.spectrum ??`).

## Spec conformance

All four slices meet the spec; deviations are the ones already ruled in the ledgers (base laptop profile `backup`; `UWB_CONTEND_COLLISION` added; `Emission` without `startNs/endNs`; DL responders ship their own offset rather than the tag deriving it from anchor 0's round trip — finding 3 asks only that this be said). Checked item by item: coupling built only for the 6 GHz link × UWB channel 5 × overlap > 0 (`simulation.ts:140-158`, gate at max(width,160)); transmitter-law path loss both ways; UWB SIR rule −12 dB with `UWB_INTERFERED{node,from,foreignDbm,sirDb}`; Wi-Fi ED sum and preamble SINR both take the foreign term; RCPS/RCMA IEs in the Poll (31 B, anchor-count independent); uniform draw over `[1, S]` (`rng.int` is inclusive); retries then one sit-out; DL message content, rate ratio in anchor 0's own units, Δ with the baseline flight and `(1 − coffs)`; UL wired sync as a once-drawn per-anchor bias; AoA mirror, clamp, horizontal-range fix, ellipse σ_r along / r_h·σ_θ across; records table and view fields (+ `anchors` on the position view); overlay behaviours (rings kept for TWR and AoA, fix+ellipse only for TDoA, bearing line anchor→fix); editor fields (`sixGhzCenterMhz` with channel number and overlap %, `yawDeg`, schedule/contentionSlots/maxAttempts/mode/aoa/clock correction/sync error with mode-consistent enabling); TIERS[5], modules 13/14, COURSE_ORDER order.

## Physics / standards spot-checks (all reproduce)

- Overlap: ch 71 80 MHz → 6265–6345 inside 6240–6739.2 → 1.00; ch 7 → 0; 6225 MHz → 25/80 = 31 %, 5.05 dB. UWB in an 80 MHz channel: −14 + 10·log10(80/499.2) = −21.95 dBm. PL0(ch 5) = 48.69 dB; router at 3.14 m → −42.8 dBm; tag at the router −80.57 dBm vs −87.97 dBm floor = 8.1 dB rise, 18.6 dB under −62 dBm; ED crossing at 0.37 m ("about 40 cm").
- Contention: N·(1−1/S)^(N−1) = 1.42 / 3.08 / 4.35 for S = 4/8/16; round 1+S slots = 10/18/34 ms; SS residual ½·T_reply·0.2 ppm = 3.0 cm/ms; the measured-vs-analytic gap is explained honestly via the mean contender count (5.23/5.63/5.97) and a 4σ binomial envelope, and the lesson says none of the rows is the formula's number.
- TDoA: rate = tag/ref, `txOffset = tof + T_reply·(1 − coffs_i)` with `coffs_i = ppm_i − ppm_ref` as a fraction (sign verified against `ssTwrCorrected`); anchor 0's ppm enters only via the ≤40 ns true difference (fs); hyperbolic Jacobian rows `u_i − u_ref`; √(2/3) GDOP floor at a square's centre stated and the GDOP comparison refused in lesson and glossary; UL σ = √2·c·√(σ_ts² + sync²) = 4.2 / 42.6 cm; 1 ns = 29.98 cm.
- AoA: λ = 3.754 / 4.620 cm, d = 1.88 / 2.31 cm; φ(45°) = 2.221 rad, φ(60°) = 2.721 rad; σ_θ = 2.74° / 3.87° / 5.47°, 15.75° at 80°, clamp 45° at ≈86.5°; cross-range 9.5 / 27.0 / 47.7 cm; slant-vs-plan bias 17.6 cm at the 45° spot; mirror error = 2·r_h.
- Honesty tags: every standard number carries its clause; FiRa values tagged; the SIR floor, spectral-density, transmitter-law, RCPS/RCMA sizing, blink, DL content, wired sync, σ_φ are all tagged **model** in code, lessons, Guide, glossary and README consistently.

## Determinism

No `Date`, `localeCompare`, `Math.random`, `toLocale*` or `performance.now` added in the diff. All new Map/Record iterations (`Spectrum.live`, `UwbChannel.radios`, `dl.rxResp`, `dl.responses`, `Object.entries` in the decoder/rows) are in insertion order = node order or reception order, both already deterministic; `Spectrum.notify` coalesces per instant and runs listeners in registration order. Draw orders are documented at the draw sites (`device.ts:616-619, 651-654`, `network.ts:101-107`) and the fixture is the guard. Two-scene identity claims (coexist base/ch9/wifi7 "same air", ul-tdoa ±20 ppm pinned crystals) are pinned by the lesson tests; note the lesson hash is a hash of the *air*, so reception-side rules (SIR, capture) are guarded only by the lesson tests, not by the fixture (see carry list).

## The five lessons as a learner (EN and ZH)

Tier 2 teaches what the spec asked, in the spec's order, and each lesson opens with the standard/model split. No contradictions found between lessons or with Guide/glossary/README: σ_r is "2.12 cm" in the AoA lesson and "2.1 cm" in the inspector hint (same number); both TDoA lessons, both inspector ellipse hints and the README row carry the same first-order caveat; "channel 9 is the answer" is argued the same way in lesson, Guide and glossary (no 6 GHz channel can reach 7737.6 MHz); GDOP comparison across solvers is refused everywhere. Inspector labels quoted in observe items match `i18n.ts` in both languages ("lost to Wi-Fi"/"被 Wi-Fi 干扰丢失", "slots collided"/"碰撞时隙数", "contention draw · sitting this round out"/"竞争抽取 · 本轮空过", "time differences"/"到达时间差", "solved from"). ZH texts are faithful translations with no extra claims beyond those the per-task reviews already trimmed. Word budgets: all five pin `lessonWords ≤ 1724` and `lessonMinutes ≤ 25` (coexist 1701, contention 1703, dl-tdoa 1718, ul-tdoa 1637, aoa under). The only stated-vs-simulated drift the per-lesson reviews missed is finding 1 (a frame-inspector row, not lesson prose).

## Merge readiness

Green on tests/tsc/build; tree clean apart from the aoa SDD export the controller owns; `.superpowers/`, `.playwright-mcp/`, `tsconfig.tsbuildinfo` are ignored; no scratch files, no stale "no TDoA / no AoA / time-scheduled only" sentences left in README, Guide or EditorGuide (the Known-simplifications list was rewritten). Merge after the fix wave.

## Carry to the 802.15.4ab slice / after the merge

- `Spectrum.Emission` should carry an explicit channel/width instead of `uwbChannelOf`'s nearest-centre heuristic once MMS / narrowband-assisted PPDUs put non-499.2 MHz emissions on the air.
- The lesson-hash fixture hashes the air only; add a UWB records-hash (or per-lesson `UWB_INTERFERED`/`COLLISION` counts already pinned) to the determinism guard so SIR/capture regressions are caught outside lesson tests.
- DL-TDoA Final RX times: either use them (tag-side cross-check of each responder's offset against anchor 0's round trip, the FiRa way) or drop them (finding 3).
- Per-(anchor, tag) RCMA budget if multi-tag contention lessons are written (finding 4); DS-TWR under contention remains out of scope.
- Schema: reject `aoa` outside `twr` and `uwbModePatch` clearing it (parked aoa T1 #5 + finding 7).
- `ppduBand` centring narrow PPDUs on the operating centre rather than the primary 20 MHz (parked coexist T3 #2) will matter once a 6 GHz lesson uses mixed widths against channel 5.
- Hyperbola drawing for the TDoA overlay; elevation/third antenna for AoA; the parked `uwbSlotFitNs`/`makePoll` clean-ups.

## Re-review (fix wave)

Scope: the nine commits `5684d58..c7d2289` (33 files, +475/−132), against the combined review's findings 1–7, the four slice ledgers' parked minors and the skipped list. Read-only; no file edited but this one. A draft of this section was already on disk when I started — every claim in it was re-derived from the diff and the shipped sources before being kept.

**Verdict: APPROVED** — all seven findings are closed as the controller ruled, the parked minors are fixed or skipped for reasons that hold, nothing regressed, and the branch is ready to merge.

Gates, run in this worktree at `c7d2289`: `npx vitest run` → 108 files, **1440 passed** (1431 before, +9 cases); `npx tsc -b` exit 0; `npx vite build` built in 2.76 s with only the usual >500 kB chunk warning; `git status` → `?? docs/superpowers/sdd/2026-09-19-uwb-aoa/` alone. `git diff 5139da3..c7d2289 -- tests/fixtures/lesson-hashes.json` is **empty** — the constraint holds.

### The seven findings

| # | closed | evidence |
|---|---|---|
| 1 DL clock offset printed as a fraction | yes | `src/uwb/frameFields.ts:139` prints `((u.dl?.coffs ?? 0) * 1e6).toFixed(2)`; `UwbDlTimes.coffs` (`src/uwb/frames.ts:26-28`) now reads "as a fraction (ppm × 1e-6) … the frame decoder prints it in ppm"; the fixture feeds `1.5e-6` / `0.25e-6`; the live pin at `tests/course/uwb-dl-tdoa.test.ts:432-443` decodes every shipped Response's `ieCoffs` row and asserts `|printed − (drawnPpm(id) − drawnPpm(REF))| < 0.5`, with `drawnPpm` re-deriving the crystal from `new Rng(7).fork(hashStr(id#uwb))` — the draw itself, independent of the run |
| 2 `dlDiffSigmaM` off by 2× | yes | `src/uwb/device.ts:220` now "12 cm … 36 cm"; the correction-off clause (tdoa T3 #3) rides with it |
| 3 Final RX times unread | yes (kept, as ruled) | said in three code sites — `makeFinal` (`src/uwb/frames.ts:133-138`), the `transmitDl` docstring (`src/uwb/device.ts:822-826`) and the Final case (`src/uwb/device.ts:866-869`) — and in the lesson's Final row EN+ZH (`src/course/uwb/uwb-dl-tdoa.ts:113`, "which no badge here reads") |
| 4 per-anchor RCMA budget | yes | `UwbDeviceCfg.maxAttempts` (`src/uwb/device.ts:45-54`) carries the **Model** paragraph naming the cross-tag leak and the `attemptsLeft`-by-tag-id change a multi-tag lesson would need |
| 5 one DL headline | yes | grepped all nine sites — `README.md:93`, `src/ui/Guide.tsx:232-233` / `:464`, `src/ui/glossary.ts:884` / `:885`, `src/editor/EditorGuide.tsx:245` / `:511-512`, `src/ui/i18n.ts:394` / `:818` — every one states the rule "20 ppm of the gap between the Poll and the response being timed" with 6 ms → 36 m and 20 ms → 120 m, in the ruled wording. See the remaining finding on the second number |
| 6 self-cancelling `syncErrorNs` | yes | `src/ui/Guide.tsx:237` "(0 ns by default, i.e. perfect sync)"; ZH `:467-468` "默认为 0 ns，即完美同步；它不为零时…" |
| 7 `aoa` outside `twr` + the parked aoa item | yes | `src/model/scenario.ts:490-500` raises the ruled message; `uwbModePatch` returns `{ mode, schedule: 'time', aoa: false }` (`src/uwb/ui/UwbSessionFields.tsx:42`); `tests/editor/uwb-planOps.test.ts:160-180` asserts both TDoA modes' rejection, the exact message, the patch clearing the flag, and that `twr` leaves the checkbox alone |

### Parked minors and the skipped list

Every ledger item the report marks done is in the diff and does what it says. Spot-checked in the sources, not only in the report: `bandOf` derives the edges from `UWB_CHANNEL_MHZ` and snaps to 0.1 MHz, keeping 6240.0 / 6739.2 / 7737.6 / 8236.8 bit-identical; `wifiToUwbPathLossDb` now calls `pathLossDb(dM)`, which is literally `PL0_DB + 10·PL_EXP·log10(max(d, 0.1))` (`src/engine/propagation.ts:64-66`) — an exact substitution, which is why no coexistence number moved; `Spectrum.emit` validates a UWB band at the emit; `uwbLongestFrameBytes` / `uwbSlotFitNs` take the schedule and both call sites pass it (`src/model/scenario.ts:543`, `src/uwb/network.ts:66`), with the one-anchor inversion pinned; `makePoll` takes `PollOpts` at both engine sites and all three test sites, and the DL call no longer writes `'time', 8, 3` to reach `dl`; `endRound(heard: boolean)` is required and all four call sites pass it explicitly; `tdoaRef` rides beside the map on the view with the "against anchor 1" caption and `noPositionTdoa` chosen from the lane's own differences; `ringsToDraw` named; the `src/uwb/format.ts` header's "twelve" matches the twelve `case 'UWB_*'` labels at `src/ui/format.ts:71-82`; the contention lesson's "eight and a half … four and a half" is `(S+1)/2` for S = 16 and the base scene's 8, and "three and a half times" is 51.4 / 14.6 = 3.52. The nine skipped items are each either marked *Informational* / *nothing now* in the originating ledger, an either/or with no behaviour at stake, or on the controller's own carry list; none is a correctness drift. The commit-attribution note (finding 3's `frames.ts` half landing in commit 1) is cosmetic.

### Remaining findings

**1 — Minor, non-blocking. The new DL headline's second number does not follow the rule the same sentence states.** Nine sites (`README.md:93`, `src/ui/Guide.tsx:232-233` and `:464`, `src/ui/glossary.ts:884` and `:885`, `src/editor/EditorGuide.tsx:245` and `:511-512`, `src/ui/i18n.ts:394` and `:818`) define the correction-off error as "20 ppm of the gap between the Poll and the response being timed", then offer "120 m over a 20 ms round of nine anchors". A slot is `rstuNs(2400)` = 2.0 ms and a DL-TDoA round is A+1 slots (Poll, A−1 Responses, Final), so the nine-anchor round is 10 slots = 20 ms and its **last Response sits at slot 8, 16 ms after the Poll → 20 ppm × 16 ms = 320 ns = 95.9 m**. 120 m is 20 ppm of the whole round, a span no difference is taken over. The 6 ms → 36 m half is exact by the same arithmetic (4 anchors, 5 slots, last Response at slot 3) and is pinned at `tests/course/uwb-dl-tdoa.test.ts:411-418`; nothing pins the 120. *What to do:* at each of the nine sites either give the rule's own number — "…and 16 ms, 96 m, for the last responder of a nine-anchor round" — or keep 120 m and say it is over the full 20 ms round rather than over a gap. One line per site, whenever convenient; it does not hold the merge.

Nothing else remains. Carry list unchanged.
