# Whole-branch review — UWB slice 7, P802.15.4ab narrowband-assisted MMS ranging

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, base `a4a14f3`, head `4f2b3de` (12 commits, 63 files, +7831/−224). Read-only review; the only file written is this one. Every number below was re-derived (script in the reviewer's scratchpad, `phys.mjs`) or read from the shipped source at head, not taken from a task report. The TG4ab contributions cited by the spec were opened in the local mentor corpus (`…/references/uwb_tg4ab/text/15-22-0381-05.json`) to check the table numbers the code and prose cite.

## Verdict: **CHANGES REQUIRED** (one fix wave; nothing blocks the physics a learner sees today)

Two Important findings, both cheap: (1) the "lost first fragment" RMARKER recovery walks back un-drifted milliseconds although the same device deliberately re-spaced the train by the transmitter's ppm — 3.0 m of range per lost leading fragment at 20 ppm, invisible in every shipped scene but advertised in README/Guide/glossary and untested end to end; (2) the MMS lesson's opening paragraph still attributes the narrowband radio wholesale to the draft, which the branch's own last commit corrected in the companion lesson. Seven Minors. Everything else — gates, byte-identity, determinism, the cross-task seams, every reproduced number and every draft-table tag — holds.

## Gates (run in this worktree at 4f2b3de)

| Gate | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| `npx vite build` | exit 0, "✓ built in 2.93s", only the usual >500 kB chunk warning |
| `npx vitest run` | **116 files, 1729 passed (1729)**, 54.99 s |
| `git status --short` | empty; `--ignored` shows only `.superpowers/`, `.playwright-mcp/`, `dist/`, `node_modules/`, `tsconfig.tsbuildinfo` |
| `git diff a4a14f3..4f2b3de -- tests/fixtures/lesson-hashes.json` | **additions only**: exactly the eight keys `uwb-mms`, `uwb-mms#0..2`, `uwb-nba`, `uwb-nba#0..2`; every pre-existing hash untouched |
| `git diff a4a14f3..4f2b3de -- docs` | empty — spec and plan were committed before the base |
| `docs/superpowers/sdd/2026-09-21-uwb-4ab/` | does not exist yet (ledger export is the controller's step) |

## Findings, most severe first

### 1 — Important. Lost-leading-fragment RMARKER recovery ignores the transmitter drift the same code applied to the train.

`src/uwb/device.ts` (`onMmsRx`, diff lines 553-557) stores each fragment's arrival re-spaced by the transmitter's ppm — `arrivalNs = txStart + prop − (index · MS_NS · drift)/(1 + drift)` — precisely so the train can measure the clock ratio. `evaluateTrain` (diff lines 621-624) then recovers the RMARKER with `rmarkerFromFragment(first.arrivalNs, first.index)`, which is `arrivalNs − index · MS_NS` (`src/uwb/mms.ts:130-132`): an **un-drifted** millisecond in true time. When fragment 0 arrived (`index === 0`) nothing is lost. When the leading fragment(s) were lost the recovered RMARKER is early by `index · 1 ms · txPpm` — **20 ns per lost leading fragment at 20 ppm** (reproduced: `1e6 · 20e-6/(1+20e-6) = 20.0 ns`), i.e. 10 ns of time of flight, **3.0 m of range**, up to 45 m for fifteen lost fragments. The train's own measured ratio is sitting in the same function and would make the walk-back exact (`counter(first) − first.index · MS_RCTU · ratio`, or in true time `arrivalNs − index · MS_NS / (1 + drift)`).

Why it is not Blocking: no shipped scene ever loses a leading fragment — every fragment of a train shares one received power in a static scene, the channel delivers all or none (`sensFor`, `src/uwb/channel.ts` diff lines 289-293), and no lesson puts Wi-Fi on the UWB channel (both use channel 9; `uwb-nba.ts:87`). No pinned number is wrong. Why it is Important: `README.md:17` ("a train whose first fragment was lost is still timed from a later one minus its index × 1 ms (model)"), `src/ui/Guide.tsx:332-334` and `:482-483` (ZH) and the glossary all promise this recovery; the spec's Testing list requires "a lost first fragment still yields the same RMARKER (± noise)" end to end and **no such test exists** — only `tests/uwb/mms.test.ts:228-245`, which feeds `rmarker + i · MS_NS` (no drift) and so cannot see it. The spec's own sentence ("minus its index × 1 ms on the receiver's counter") is a first-order statement with the same class of error; the engine should do the exact thing and the docs say "using the ratio the train measured". Fix wave: use the ratio when ≥ 2 fragments were heard (a one-fragment train has index 0 or nothing to extrapolate from anyway), add the end-to-end test with a dropped fragment 0 and ±20 ppm crystals, and adjust the three doc sentences.

### 2 — Important. The MMS lesson's first paragraph hands the narrowband radio to the draft; the branch's last commit says otherwise one lesson later.

`src/course/uwb/uwb-mms.ts:92` (EN) / `:93` (ZH): "the multi-millisecond packet **and the narrowband control radio** come from P802.15.4ab" — and the paragraph closes "the rest is model". The companion lesson, fixed in `4f2b3de` for exactly this, opens "The radio itself is the standard's: the 250 kb/s O-QPSK PHY of IEEE Std 802.15.4-2024 Clause 12" (`uwb-nba.ts:103`), as do the README row (`README.md:23`, "standard Clause 12"), Guide §12 (`Guide.tsx:350-351`) and the glossary (`glossary.ts:639`). The MMS lesson's own "What the narrowband radio carries" paragraph (`:119`) describes the 250 kb/s O-QPSK radio and its 576 µs without crediting Clause 12 either. A learner who reads the tier in order is told the radio is draft, then that it is standard. The pin (`tests/course/uwb-mms.test.ts:181-199`) checks only that "IEEE Std 802.15.4-2024" appears. One clause fixes it: "…but the multi-millisecond packet, and everything that turns a Clause 12 O-QPSK radio into a control radio for UWB, come from P802.15.4ab". Rated as the T6 reviewer rated the same defect in the other lesson (Important, not Blocking): the *role* is draft and the PHY tag is right everywhere else.

### 3 — Minor. "Anchors 1 and 2 have one too, in block 3" reads as one *range* in English.

`uwb-nba.ts:172`: the sentence follows "One range in 1.3 seconds and no position … against 29 timeouts", so "one" parses as a range; it means a busy LBT check — the ZH says 判忙 (`:173`) and the test pins it as skipped blocks `[3]` for anchors 1 and 2 (`tests/course/uwb-nba.test.ts:501-517`). Say "a busy check too".

### 4 — Minor. Guide §12's "Known simplifications (on top of section 11's)" points at a paragraph §11 does not have.

`src/ui/Guide.tsx:445` and ZH `:803`. Guide §11 (`:187-304`) has no Known-simplifications paragraph; the list lives in `README.md` ("Known simplifications", `:133-143`). Point at the README or drop the parenthesis.

### 5 — Minor. "half the reply time, one slot: 0.5 ms" reads as if half the reply were 0.5 ms.

`uwb-mms.ts:130` (and ZH `:131`, same shape). The arithmetic that follows is right (½ × 0.5 ms × 40 ppm × c = 3.00 m, reproduced); the phrase wants "half the reply time — the reply is one slot, 0.5 ms".

### 6 — Minor. Two test titles say the opposite of their bodies.

`tests/ui/uwb-guide.test.ts:501` "…and never claims D5.0" then asserts every text *contains* "D5.0" (`:505`; intended: never claims to have read D5.0). `tests/course/uwb-mms.test.ts:649` "1.22 m east" — the lesson quotes "error 122.4 cm" and never says "east" (the parked stale title).

### 7 — Minor. "several times over" is true of every mandatory set, not of every legal train.

`src/ui/Guide.tsx:367` and `src/uwb/nb.ts:7`: a custom N_MSR 256 / gap 64 RSF is 525 µs, so a 576 µs POLL is not "several times" longer. Qualify with "for every mandatory set" (the parked item).

### 8 — Minor. The editor's 6 GHz overlap note still keys on UWB channel 5 only.

`src/editor/planOps.ts:328-329` (`sixGhzOverlapPct` returns null unless `channel === 5`) while `simulation.ts` now couples an MMS session whose allow list reaches into the 6 GHz channel (`nbCoupled`, diff lines 84-88). The EditorGuide's NB-channels hint says it in words (`EditorGuide.tsx:125-126`); the note does not. Defer or a one-line follow-up.

### 9 — Minor. Fragment colour is the AMP trigger/ack colour.

`src/scene/effects.ts:40` (AMP) and `:52` (RSF/RIF) are both `0x2dd4bf`. AMP and UWB never share a scene, and the frame-detail STS teal at `FrameDetail.tsx:67` is deliberate; still, one hex constant apart would be cleaner. Parked item; include if convenient.

## Cross-task integration — checked, with evidence

- **Schema ↔ network for `mms`**: pairs vs rounds — schema `tags · anchors > fits` (`src/model/scenario.ts` diff lines 239-244), network `rounds = tags · anchors` (`src/uwb/network.ts` diff lines 331-343) with the same `roundsPerBlock`; no anchor cap — schema `mode !== 'mms' && anchors > UWB_MAX_ANCHORS` (diff 281), network `!pairwise && …` (diff 369); fragment fit — schema `uwbSlotFitNs(0, 'mms', …, mms)` (diff 190), network `uwbSlotFitNs(anchors, mode, schedule, cfg.mms)` (diff 348), both `mmsLongestFragmentNs + 200 ns` (`phy.ts` diff); NB two-slot fit — schema `2·slotNs < uwbNbSlotFitNs()` (diff 200), network identical (diff 358-365). `uwbSlotsPerTag('mms')` throws without `mms` (`phy.ts`), so no call site can plan a one-slot round silently; all three call sites pass it (`scenario.ts` diff 230, `session.ts` diff 486, network via `roundPlan`).
- **`mmsLayout` ↔ `slotAction` ↔ `closeDueTrains` ↔ Guide table ↔ lesson slot numbers**: one map read both ways — `fragmentSlot` = `4 + 2·ms (+1 responder)`, `slotFragment` its inverse (`mms.ts:257-276`); `mmsSlotAction` reads only `slotFragment`/`reportSlot` (`session.ts` diff 566-583); `closeDueTrains` closes at `fragmentSlot(peerSide, kind, n−1) + 1` (`device.ts` diff 586), which for X = 8 is slot 19 at the anchor (9.500 ms) and 20 at the tag (10.000 ms) — the lesson's observe 3 (`uwb-mms.ts:160`); REPORT at `4 + rp` = 24 (12.000 ms) and `+2` = 26 (13.000 ms) — both lessons (`uwb-mms.ts:162`, `uwb-nba.ts:122,168`); Guide table rows 0–1 / 2–3 / 4+2m / 5+2m / 4+rp / 4+rp+2 (`Guide.tsx:380-386`) match. `tests/uwb/session.test.ts:238-291` walks every legal (X, Y, Z) and every slot against the inverse. X = 16 closes the responder's train at slot 36 = the responder's report slot, and `closeDueTrains` runs before the slot's action (`device.ts` diff 430-431), so the anchor holds `rxRmarker` before it reports.
- **`Emission.lossDb` bit-exact**: Wi-Fi emissions carry `wifiToUwbPathLossDb` (`engine/channel.ts` diff 22), UWB emissions `uwbToWifiPathLossDb(d, walls, cfg.channel)` (`uwb/channel.ts` diff 318-319) — the same two functions with the same arguments the deleted `uwbChannelOf` dispatch chose (`spectrum.ts` diff 183-188); the coexistence lesson's four timeline hashes and the new records hashes did not move; `tests/engine/spectrum.test.ts:215` covers the NB case the heuristic could not.
- **Per-frame channel dispatch and `onChange` per-reception band**: `txDbmFor/pl0For/sensFor/sirMinFor/bandFor/lossDbFor` key on `frame.uwb.nb`/`.mms`, never on the kind string, so a 4z frame answers as before (`uwb/channel.ts` diff 268-320); `onChange` re-takes each open reception's max over `bandFor(rx.frame)` (diff 249-256); `tests/uwb/channel-coexist.test.ts:245-420` covers the NB band, power, SIR floor, LBT and the mid-reception PPDU that misses the NB channel.
- **`lbtBusy` ↔ `nbClear` ↔ `UWB_NB_LBT` ↔ view ↔ inspector ↔ lesson**: `lbtBusy` = one `foreignDbm` reading over `nbBand(channel)` ≥ `NB_LBT_THRESHOLD_DBM` (`uwb/channel.ts` diff 351-357); `nbClear` short-circuits on `nbSkipBlock === block` *before* sampling, so one record per device per block (`device.ts` diff 469-480) — which is why the view's `lbtBusy` and `skippedBlocks` agree (`view.ts` diff 927-939) and the inspector reads "7 busy · 7 blocks skipped" (`rows.ts` diff 812-814, pinned `tests/course/uwb-nba.test.ts:577-590`). `lbt('base')` has 9 records = 7 tag + anchors 1 and 2 in block 3 (`:502-508`) — consistent with the lesson's "seven … seven … seven" and observe 4.
- **Report modes ↔ lanes ↔ rings**: `mmsSlotAction` idles the unused report slot (`session.ts` diff 577-582); the device ranges only on the report it receives (`onNbReport`); `tests/uwb/network.test.ts:1432-1436` pins `responder → ['tag-1']`, `initiator → ['anc-1']`, `bi → both`; the overlay draws rings from tag lanes only when the fix is `twr`/`aoa` or absent (`src/uwb/scene.ts:155-156`), and the MMS fix is `method: 'twr'` (`device.ts` diff 724), so `report: 'responder'` (uwb-mms) and `'bi'` (uwb-nba) both draw; `'initiator'` draws nothing on the tag, which is the honest picture.
- **Block fix ↔ `UWB_ROUND_END`**: `solveMmsFix` runs inside `endRound` before the `UWB_ROUND_END` emit (`src/uwb/device.ts:540-545`); the network ends the tag before the anchor (`network.ts` diff 412-420); pinned `tests/uwb/network.test.ts:1269-1280` (`fix.seq < end.seq`). `blockRanges` is cleared at the block's last pair round whether or not three ranges exist (diff 710-712), so no range leaks across blocks.
- **`uwbModePatch('mms')` ↔ schema ↔ Guide's 0.5 ms**: the patch sets `schedule 'time', aoa false, method 'ss', slotRstu 600` (`UwbSessionFields.tsx` diff 466-471); 600 is a multiple of the schema's 300 (`scenario.ts` diff 178); the Guide, README, i18n `uwbScheduleMms` and EditorGuide all say 600 RSTU / 0.5 ms and all say `slotRstu` is what sets it; `DEFAULT_UWB_SESSION.slotRstu` stays 2400, so byte-identity holds (fixture).
- **Records-hash fixture**: generated in `bd65183`; the one commit after it (`4f2b3de`) touched only `uwb-nba.ts` prose and its test; all 37 keys pass at head inside the 1729.
- **Frame-kind enumerations**: every file that enumerates `uwbBlink` also enumerates the five new kinds (`lessonKit, model/frames, scene/effects, ui/i18n, ui/laneLayout, uwb/device, uwb/format, uwb/frameFields, uwb/frames, uwb/session`).
- **Editor issue text**: `uwbSessionIssue` parses the schema (`planOps.ts:299-308`), so the MMS rules reach the editor's red text without a second copy.

## Physics / standards spot-checks (reproduced)

| Claim | Reproduced |
|---|---|
| `rsfChips = nMsr·4·(128+2·gap)`: 40/64 → 40 960 chips = **82.051 µs**; 40/33 → 31 040 = **62.179**; 32/64 → 32 768 = **65.641**; 64/25 → 45 568 = **91.282**; RIF 64 = 65.641; RIF 256 = 262.6 µs | all exact |
| Fragment power 37 nJ / length: −3.459 / −2.254 / −2.490 / −3.922 dBm; rsf-1 − default = **1.204 dB** ("1.20") | exact |
| `MMS_COMBINE_MAX_DB` = 12.041; floor −105.041 dBm | exact |
| PL0 ch 9 = 50.496 dB; reach 4z **26.62 m**; train X = 1/2/4/8/16 → **89.59 / 126.70 / 179.19 / 253.41 / 358.37 m**; two brick walls (24 dB) 4z 1.68 m, X = 4 → 11.31, X = 8 → **15.99**, rsf-1 → 25.98 m | matches spec table |
| Two-wall lesson: anchor distances 13.036 / 13.036 / 12.757 m; per-fragment **−100.260 / −100.071 dBm**; margins X = 4 **−1.24 / −1.05 ≤ −1 dB**, X = 8 **+1.77 / +1.96 ≥ +1 dB** at all three anchors (anchor 3 at (0.3, 4.0)); rsf-1 +5.99 / +6.18 | exact |
| Burst decomposition: Poll −14 dBm × 203.782 µs = **8.113 nJ**; 10·log10(37/8.113) = **6.590 dB**; 10·log10(203.782/82.051) = **3.951 dB**; 9.031 + 3.951 + 6.590 = **19.57 dB** = (−91.23) − (−110.80) | exact |
| σ_ratio = √2·100 ps / 7 ms = **0.0202 ppm** (X = 16: 0.0094); ½·0.5 ms·σ·c = **1.51 mm** / 1.50 cm / 1.50 m; 40 ppm → 3.00 m | exact; initiator inverts (`coffs = 1/ratio − 1`, `device.ts` diff 685) which is `ssTwrCorrected`'s `(1 − coffs)` ≈ responder/initiator rate to second order (0.8 ps at 0.5 ms) — correct; pinned `network.test.ts:1382-1391` |
| Train re-spacing by tx ppm: `arrival − i·MS·d/(1+d)` is the true arrival of a fragment cut on a clock 1+d fast; ratio recovered = (1+rx)/(1+tx) | correct; pinned within 4σ `network.test.ts:1246-1255` |
| NB PPDU (12+2·octets)·16 µs: **576 / 608 µs** | exact |
| Centres: ch 0 **5726.25**, 49 = 5848.75, 50 **5926.25**, 249 = 6423.75, 3 = 5733.75, 100 = 6051.25, 150 = 6176.25, 200 = 6301.25, 210 = 6326.25; channels wholly inside 6265–6345: **32, numbers 186–217** | exact |
| LBT −75 + 10·log10 2.5 = **−71.021 dBm**; 20 dBm/80 MHz → 4.949 dBm in 2.5 MHz; crossing under 46.7 + 30·log10 d + 1.2 → **8.623 m**; at 1.50 m −48.23 (22.8 dB over), 20 MHz control −42.21, laptop 15 dBm at 3.354 m → **−63.72** | exact (`propagation.ts:17-18,64-66`, `spectrum.ts:41-48`) |
| −62 dBm radius of 10 dBm in 2.5 MHz at 6301.25 MHz (PL0 48.436): **15.07 m** | exact |
| Hop `nbChannelForBlock([100,150,200,210], 7, b)` with `hashStr(\`${seed}:${block}\`)`: **100, 210, 200, 150, 100, 210, 200** | exact (the lesson's sequence) |
| uwb-nba margins: tag–anchor-1 4.763 m → **+34.52 dB**; anchor-2 → **+31.98** ("+32.0") | exact |

**Tags against the spec and the corpus** (`15-22-0381-05.json`): Table 1.2.3.1 = general parameters (init channel 2, allow list 3, UWB channel 9, NB PHY #1) ✓ `nb.ts:85-88`; Table 1.2.3.2 = block 1 209 600 RSTU (1008 ms), round 16 800 (14 ms), **slot N·300 default 600 (0.5 ms)** ✓ — so `uwbScheduleMms` (`i18n.ts` diff 115) and the `UwbSessionFields` comment citing Table 1.2.3.2 for 600 RSTU are right, and so is the Guide's "example round duration (Table 1.2.3.2)"; Table 1.2.3.3 = RcpPollSlot 2, RcpResponseSlot 2, X default 8, Y 0, RpDuration 20, report mode bi-directional, MrpFirst/Second 2 ✓ (`mms.ts:233-236`, `DEFAULT_UWB_MMS`); §1.1.1 "integer multiple of 300 RSTUs" ✓; §1.4.2 CCA ≥ 9 µs, EDT −75 dBm/MHz, transmit within 16 µs, "skip NB transmission for the current ranging block" ✓ (`nb.ts:104-111`, the block-skip model); §1.4.1 UNII-3/UNII-5, "occupied bandwidth … less than 2.5 MHz", 50 + 200 channels ✓; §1.5.3 `AES-128-ECB … in counter mode`, key `NbaUwbPrngSeed`, data `RangingBlockIndex` ✓ ("AES-128-CTR" everywhere); Table 1.1.4.1 report modes ✓; "regular intervals of 1200 RSTUs" ✓ `MS_RSTU`. Standard tags: Clause 12 for the O-QPSK PHY, §16.2.9 for the STS unit, §16.2.4 chips, §10.29.1.4 RCTU, §16.4.9 for ±20 ppm (used the same way in `uwb-intro.ts:107`, `uwb-dstwr.ts:49`). No wrongly attributed tag found. One documented divergence worth carrying: Table 1.2.3.3's `RpRifOffset` default is 4 slots (2 ms) while the model starts RIFs at `X + Z − 1` ms from 0100r2's figures — the spec chose 0100r2 and says so; note it when D5.0 text is available.

## Determinism

- Grep of every added line in `src` and `tests`: no `Date`, `Math.random`, `localeCompare`, `toLocale*`, `performance.now` (the only hits are the two comments saying "no Math.random"). `Object.keys(MMS_SETS)` (string-literal keys, insertion order), `Object.entries(u.mms.trains)` and `[...this.blockRanges]` (insertion order = first record per peer, rounds run in anchor order) are order-stable; the records-hash test's `.sort()` is default UTF-16 order.
- Draw order per train as the spec fixes it: first heard fragment's stamp, then the last heard fragment's only when ≥ 2, then the carrier residual only on the fallback path, nothing per fragment or per reception (`device.ts` diff 278-285, 620-637, 684-690); pinned by stream replay at `network.test.ts:1366-1391`.
- `mode: 'twr'` / TDoA scenes: all 29 pre-existing timeline hashes unchanged; `network.test.ts:1588` "changes not one record of a two-way session, whatever the MMS knobs say"; the new records-hash fixture covers all 37 UWB scenes and passes at head.
- The `.superpowers/` directory is git-ignored, so `git status --short` is empty rather than "only `.superpowers/` untracked".

## The two lessons as a learner (EN and ZH)

**uwb-mms** — every quoted number reproduces (table above) and is pinned (`tests/course/uwb-mms.test.ts`, 60 tests); the observe timestamps (0 / 1.000 / 2.000 / 9.500 / 10.000 / 12.000 / 12.608 ms) follow from the 28-slot layout; the burst-power honesty paragraph is arithmetically exact; the ZH is faithful sentence for sentence (the ZH of "Where the gain actually comes from" is if anything crisper). Two defects: finding 2 (first-paragraph split) and finding 5 (wording). The lesson correctly says the 1.5 mm is invisible under the 2.1 cm stamp floor and measures 2.05 cm RMS over 21 ranges; the 4 ns / 1.199 m wall bias and "reach is not accuracy" are right.

**uwb-nba** — first paragraph's split is exactly right after `4f2b3de` (PHY = Clause 12; channels, cycle, LBT, block skip = draft; −75 dBm/MHz = ETSI EN 303 687 via the draft; centre formula, hash-for-AES, one-reading-for-9 µs = model); the 32-channel count, the three-line threshold derivation, the −48.23 / −42.21 / −63.72 dBm readings, the 15.07 m radius, the hop sequence and the four-scene table all reproduce or are pinned; the CCA-transition proxy for "the router deferred" is named as a proxy with its zero control and the "not 108 twice over" caveat, which is the honest way to say it. One defect: finding 3.

**Guide §12, glossary, README, EditorGuide** agree with each other and with the lessons on every number I checked (82.05 / 62.18 / 65.64 / 91.28 µs, −3.46 / −2.25 dBm, 12.04 dB, 0.0202 ppm, 1.5 mm / cm / m, 576 / 608 µs, 5726.25 / 5926.25, −71.02 dBm, 8.6 m, 15 m, 28 slots, 0.5 ms, 17 sets), on the tags, on the report-mode semantics, and on the two caveats ("hash stands in for AES-128-CTR" at `README.md:29`, `Guide.tsx:417-420`, `glossary.ts:647`; "reconstructed centre formula" at `README.md:24`, `Guide.tsx:357-359`, `glossary.ts:647`, `i18n.ts` NB-channels hint). Guide figures are computed from `mms.ts`/`nb.ts` constants (`Guide.tsx` §12 block), and `tests/ui/uwb-guide.test.ts:417-591` pins them. Defects: findings 4, 6, 7.

## Rulings on parked items

| Item | Ruling | Reason |
|---|---|---|
| `view.mms.trains` keyed by peer (RIF overwrites RSF) — `src/uwb/view.ts` diff 836-838, 943 | **Include** | For any Y > 0 session the inspector shows only the RIF row, hiding the RSF margin the range was made on; key by `${peer}:${kind}` (or add `kind` to the key), adjust `uwbTrainRows` and `view.test.ts:4978`'s key list. No shipped lesson has Y > 0, so no pin moves. |
| Cross-radio capture in `UwbChannel.startRx` | **Defer** | In the pairwise cycle no node ever holds an NB and a UWB reception at once (control/report windows and the ranging phase are disjoint by layout); it matters only for one-to-many, which is out of scope. Keep the comment. |
| phy↔mms↔nb import cycle + `RCTU_PER_CHIP` duplicate (`mms.ts:114-117`) | **Include** | A leaf `units.ts` (chip rate, RCTU/RSTU, `chipsToNs`) removes both the cycle and the duplicated 128; mechanical, byte-identical, guarded by both fixtures. |
| Three copies of the free-space law (`phy.ts freeSpacePl0Db/uwbPl0Db`, `spectrum.ts:51-53`, `uwb/channel.ts` diff 312-320 and `rssiDbm`) | **Include** | One `uwbPathLossDb(pl0, d, wallsDb)` = `pl0 + 10·UWB_PL_EXP·log10(max(d, 0.1)) + wallsDb`; same expression, so bit-identical; fixtures guard. |
| Unreadable `UwbChannelCfg.mms` (`uwb/channel.ts` diff 236-239; set at `network.ts` diff 379) | **Include** | Nothing reads it; delete the field and the pass-through. |
| Fragment colour = AMP colour (`effects.ts:40` vs `:52`) | **Include** (one constant) | Finding 9. |
| `device.ts` ≈ 1570 lines → `device.mms.ts` | **Defer** to the first commit of the next slice | Finding 1 edits the same functions; a mechanical split in the same wave is merge noise for no behaviour. |
| Block-rule duplicate branch in the schema (`scenario.ts` diff 239-248) | **Defer** | Two messages are two branches; cosmetic. |
| `beginRound` silent dead round (`device.ts` diff 207-212) | **Include** | Throw when `plan.mms` is set and `opts.nbChannel` is null — the same ruling T1 applied to `uwbSlotsPerTag`; one line, one test. |
| "several times over" prose (`Guide.tsx:367`, `nb.ts:7`) | **Include** | Finding 7. |
| Stale test title "1.22 m east" (`uwb-mms.test.ts:649`) | **Include** | Finding 6 (with the "never claims D5.0" title). |
| −0 note / FNV constants duplicated in `uwb-record-hashes.test.ts` | **Defer** | `String(Number((-0).toFixed(6)))` is `"0"`, so −0 and 0 already hash alike; the FNV fold here is per line with a separator, not `hashStr`'s whole-string fold, so importing it would change the semantics for no gain. |

## Merge readiness

- Tree clean; `.superpowers/` ignored; no scratch files in the diff (the 63 changed files are all `src/`, `tests/`, `README.md`).
- No stale "not modelled" sentence left: the only NB/MMS/4ab mentions in `README.md` outside the new section are the four new Known-simplifications bullets (`:140-143`); Guide §11 says nothing MMS contradicts (its "four anchors" is about hyperbolae, `Guide.tsx:280`); the "Both need four anchors" hint is gone from i18n, EditorGuide, Guide and README (grep empty).
- Ledger export to `docs/superpowers/sdd/2026-09-21-uwb-4ab/` not yet done (controller's step).
- After the fix wave (findings 1–7 and the "Include" rulings) the branch is ready to merge; findings 8–9 may ride along or wait.

## Carry list for the next slice

- One-to-many MMS cycle, which is when per-radio capture in `UwbChannel.startRx` becomes necessary.
- SNR-dependent timestamp precision (the draft's accuracy claim), still unmodelled and still said so.
- `RpRifOffset` default 4 slots (Table 1.2.3.3) vs the model's `X + Z − 1` ms RIF start — reconcile against D5.0 text when available.
- Editor: `sixGhzOverlapPct` for a UNII-5 allow list (finding 8); the plan note prints "rounds per block" where MMS wants "pairs".
- `device.ts` split into `device.mms.ts` (deferred above).
- Unchanged from the previous slice's list: `ppduBand` centring for mixed widths; hyperbola drawing; elevation/third antenna for AoA; AES-CTR channel switching only if a lesson ever needs the draft's exact sequence.
