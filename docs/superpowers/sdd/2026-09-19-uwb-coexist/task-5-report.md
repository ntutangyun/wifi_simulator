# Task 5 report — UWB tier 2 and lesson "Sharing 6 GHz"

## What was built

**`src/course/curriculum.ts`** — `TIERS[5] = { track: 'uwb', en: 'UWB Tier 2 · Sessions in the real
world', zh: 'UWB 第二阶段 · 真实环境中的会话' }`; `MODULES[13]` Coexistence / 共存 and `MODULES[14]`
Other ranging modes / 其他测距模式, both `tier: 5`; `COURSE_ORDER` gains
`'uwb-coexist', 'uwb-contention', 'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa'` after `'uwb-position'`.
`orderLessons` skips the four ids with no lesson — verified in the new test (`LESSONS` ends
`… uwb-position, uwb-coexist` and contains none of the other four).

**`src/course/lessonKit.ts`** — `LESSON_6G_WIDTH_MHZ: ChannelWidth = 80` and
`wifi6g(id, name, x, y, profile)`: an `eht` station at z 1.0 with `linkId: '6g'`,
`caps.widthMhz = 80` and the AMP-AP feature set `{ edca, txop, ampdu }`.

**`src/course/uwb/uwb-coexist.ts`** (new) — `uwbCoexistScenario(variant)` over
`'base' | 'ch9' | 'wifi7' | 'saturated' | 'noUwb'`, and the lesson `uwbCoexist` (module 13,
4 observe / 2 tryThis / 3 quiz / 5 jumps, **1599 words, 25 minutes**).

**`tests/course/uwb-coexist.test.ts`** (new) — 28 tests, every number below pinned, constants
imported from `src/uwb/phy.ts`, `src/engine/spectrum.ts`, `src/engine/phy.ts`, `src/model/scenario.ts`.

## The scene

10 × 8 m lab (lesson 5's `oneRoom`), nodes listed **`ap`, `laptop`, four anchors, `uwb-1`** — UWB
last. Router `node('ap', 'Router', 'ap', 5, 0.7, 'eht', 'idle', { edca, txop, ampdu }, 2.0)` with
`caps.widthMhz = 80` and no `linkId`; laptop `wifi6g('laptop', 'Laptop', 7, 5, 'backup')`. Lesson 5's
corner anchors at z 2.2 and the tag at (4, 3.5, 1.0); DS-TWR, NLOS on, **channel 5**;
`sixGhzCenterMhz: 6305`. Variants: **UWB on channel 9** / UWB 使用 9 号信道, **Wi-Fi on channel 7
(5 985 MHz)** / Wi-Fi 使用 7 号信道（5 985 MHz）, **Saturated upload** / 饱和上传, **No UWB** / 没有 UWB.

## Measured numbers (5 s = 25 blocks, all pinned)

**Bands.** UWB ch 5 = 6240.0–6739.2 MHz. Wi-Fi 6305 MHz / 80 MHz = 802.11ax channel 71,
6265–6345 MHz, **overlap 80 of 80 MHz, fraction 1.00**. 5985 MHz (channel 7, 5945–6025) → 0 MHz.
UWB in-band EIRP inside 80 MHz = −14 + 10·log10(80/499.2) = **−21.95 dBm** (7.95 dB lost); Wi-Fi
loses 0 dB. Laws: Wi-Fi 46.7 + 30·log10 d + 1.2; UWB 48.69 + 20·log10 d.
Channel 9 (7737.6–8236.8 MHz) overlaps nothing: the schema's top centre 7115 MHz at 320 MHz reaches
7275 MHz, **462.6 MHz** short.

**At the tag** (anchors −76.25 … −79.48 dBm at 4.76–6.91 m): router 3.14 m → **−42.79 dBm**,
laptop 3.35 m → **−48.67 dBm**. Weakest anchor vs laptop: **SIR −30.81 dB** against the −12 dB floor
— 18.8 dB short.

**At the Wi-Fi radios.** Loudest UWB signal anywhere is the tag at the router, **−80.57 dBm**
(58.62 dB of loss): **+8.12 dB** over the 80 MHz floor of −87.97 dBm, and **18.57 dB below** the
−62 dBm energy-detect threshold → CCA never trips (pinned two ways: the base run's CCA_BUSY/CCA_IDLE
records are field-identical to the No-UWB run's, and no CCA_BUSY begins inside a UWB TX span without
a Wi-Fi PPDU also live).

| Run | Wi-Fi air | `UWB_INTERFERED` | UWB `RX_OK` | tag ranges | fixes | timeouts | laptop |
|---|---|---|---|---|---|---|---|
| base (backup) | 3.07 % | **8** (1.6/s) | 392 | 92 / 100 | 25 (17×4 anchors, 8×3) | 8 | 9.960 Mb/s |
| UWB channel 9 | 3.07 % | 0 | 400 | 100 | 25 | 0 | 9.960 Mb/s |
| Wi-Fi channel 7 | 3.07 % | 0 | 400 | 100 | 25 | 0 | 9.960 Mb/s |
| Saturated upload | 91.28 % | **200** (40/s) | 0 | 0 | 0 | 400 | 274.128 Mb/s |
| No UWB | 3.07 % | — | — | — | — | — | 9.960 Mb/s |

UWB air 0.97 % of the run. `Simulation.spectrum` is non-null only for base and saturated.

**The base run's eight.** All eight are `uwb-1` losing **anchor-4**, foreign −48.67 dBm, SIR
−30.81 dB, 600 ms apart (the backup's burst period), in blocks 2, 5, 8 … 23; each is a `lowSinr`
`RX_FAIL` followed **1.808 502 ms** later by `UWB_TIMEOUT`. Fix error 0.1–4.2 cm (0.3–3.5 cm on
channel 9); GDOP 1.05 → 1.26 on the eight three-anchor blocks. Inspector: tag `interfered` 8,
every anchor 0.

**The Wi-Fi side does not notice (base).** Exactly 8 UWB×Wi-Fi overlapping PPDU pairs in the run,
all anchor-4 against a laptop data PPDU — anchor-4 is 8.16 m from the router, arriving at
−88.87 dBm, a 2.58 dB noise rise, leaving **31.92 dB** of SINR where the laptop's **MCS 7** needs
**26.99**. Zero Wi-Fi `RX_FAIL`, and `wifiSide(base)` equals `wifiSide(noUwb)` field for field
(>10 000 records), 9.960 Mb/s either way.

**Saturated.** The Wi-Fi link does pay: **274.128 Mb/s** against **276.816** with the UWB nodes
removed (−0.97 %) and 50 failed Wi-Fi PPDUs — against a session that makes no range at all.

**Experiments.** Farthest laptop spot in the room 7.50 m → foreign −59.15 dBm, best SIR −17.10 dB;
the SIR needs 11.09 m (nearest anchor) or 14.21 m (farthest) — neither fits. Centre 6225 MHz
(channel 55): 25 of 80 MHz = 31 %, −5.05 dB, SIR −25.76 dB, still 8 losses / 92 ranges. Centre
6185 MHz (channel 47): overlap 0, 0 losses, 100 ranges.

## Fixture and verification

`tests/fixtures/lesson-hashes.json`: **five added keys only**, no changes —
`uwb-coexist fe8d9828`, `#0 fe8d9828`, `#1 fe8d9828`, `#2 5f21a6a`, `#3 13d09f78`. (The first three
share a hash because the 150 ms hash window ends long before the first loss at 418 ms.)

`npx tsc -b`, `npx vite build` and `npx vitest run` (**103 files, 1196 tests**) all green. No `any`,
`@ts-ignore` or `as unknown as`.

## Deviations

1. **The laptop's base profile is `backup`, not `browsing`.** The controller's ruling assumed
   browsing was "moderate duty, so counts are informative". Measured, `browsing` waits 2–8 s for its
   first page and then puts **0.05 %** of air on the channel: over a 10 s run it produced **0**
   `UWB_INTERFERED`, which would have made the base run indistinguishable from both no-overlap
   variants and left the lesson with nothing to count. Of the profiles measured (`browsing` 0.00 %,
   `iot` 0.002 %, `gaming` 0.40 %, `voice` 1.57 %, `backup` 3.07 %, `video` 12.24 %), `backup` is the
   one that satisfies the ruling's stated reason: a partial, informative loss (8 of 100 ranges) with
   every fix still made. `video` and above destroy the session outright; the rest are silent.
2. **The variant is "Saturated upload" / 饱和上传, not "Saturated download" / 饱和下载.** The engine's
   `saturated` profile is an uplink flood (`emitUl(1500)` plus `refill`), and the measured 274 Mb/s
   is the laptop's own delivered traffic. Calling it a download would have contradicted the log.
3. **A fourth variant, "No UWB" / 没有 UWB**, was added as the controller allowed, so the
   throughput claim ("identical with and without the session") is read against a shipped scene
   rather than one built inside the test. It uses `sc()` rather than `uwbSc()`, so the scenario
   carries no orphan session.
4. **`wifi6g` has no `opts` parameter.** The controller listed `opts?`, but nothing in the lesson
   needs one: the profile is the only thing that varies between base and the saturated variant, and
   the AP is built by `node(...)` as ruled (plus `caps.widthMhz = LESSON_6G_WIDTH_MHZ`, which the
   negotiated width needs — `widthOf` defaults to 20 MHz). An unused option would have been untested
   surface.
5. **`tests/course/lessons.test.ts` changed in two places**, as the brief permits for structural
   expectations: `TIERS` is now 6 long with tracks `… 'uwb', 'uwb'`, `MODULES.map(tier)` gains
   `5, 5`, `trackHeadings(TIERS)` is `[true, false, false, false, true, false]` and
   `trackHeadings(TIERS.slice(4))` is `[true, false]`. No assertion was weakened.
6. **The lesson is 1599 words**, not the ~1350 the controller budgeted — still 125 words under the
   1724-word ceiling for 25 minutes, and the header states the figure and the headroom. Cutting
   further would have cost pinned numbers rather than prose.

---

## Fix round 1

Review `task-5-review.md` (Spec APPROVED, Quality CHANGES REQUIRED: 1 blocking + 8 minor). All nine
addressed; only `src/course/uwb/uwb-coexist.ts` and `tests/course/uwb-coexist.test.ts` touched, and
the fixture was **not** regenerated (no scenario changed).

1. **BLOCKING — the CCA claim is now distance-qualified and matches the Guide.** The body
   ("What the router hears") ends: "…so **at these distances** CCA never reports busy because of a
   UWB frame. The threshold is not unreachable: a Wi-Fi radio brought **within about 40 cm** of a
   UWB transmitter would trip it. Nowhere in this room is one that close…", with the matching ZH.
   Quiz 2's question became "Why does **no UWB frame in this room** ever make CCA call the channel
   busy?" and its explain replaces "at the loudest point in the room" with "at **the nearest Wi-Fi
   radio in this room, the router 3.14 m from the tag**", plus the 40 cm caveat. A new test derives
   the crossover from the engine's constants exactly as `tests/ui/uwb-guide.test.ts` does —
   `10 ** ((uwbInBandDbm(UWB_TX_POWER_DBM, 80) − uwbPl0Db(5) − CCA_ED_DBM) / (10·UWB_PL_EXP))` —
   pins it at **0.37 m**, checks the level at that distance equals `CCA_ED_DBM` and is above it 1 cm
   nearer, asserts both languages carry "40 cm", asserts the prose no longer contains "at the
   loudest point in the room", and pins that the nearest Wi-Fi radio in the scene is 3.14 m away.
2. **"identical, field for field" softened, and widened where it is literal.** Base vs No-UWB now
   reads "identical … **in every field but the shared sequence number**" (EN + ZH), and the test
   additionally asserts the `seq` arrays really do differ. For channel 9 vs Wi-Fi channel 7 the pin
   was **widened instead**: the UWB-side records are compared *including* `seq` and match, so
   observe 4's "to the last field" is now literal.
3. **The two unpinned quiz numbers are pinned**: `expect(20 - UWB_TX_POWER_DBM).toBe(34)` with both
   "34 dB" sentences quoted, and `(rssiUl − (noiseDbm(80) + noiseRiseDb(loudest))).toFixed(0) === '26'`
   with the quiz-2 sentence quoted.
4. **`cell(0, 0, 2)`** is now asserted against `interfered().length`.
5. **The three ZH-only clauses are mirrored in EN**: observe 1 gains "— eight times in five
   seconds"; the "Three cures" paragraph gains "and the same 92 ranges"; the closing paragraph gains
   "Channel 5 is worth reaching for when its place in the spectrum buys you something;".
6. **The drifted quote is re-copied**: the `it` title and comment now say −42.79, matching the
   shipped string and the assertion.
7. **The reference run is named**: "…overlaps by 0 MHz; there no mediator is built, and **the
   session produces exactly the records it produces on channel 9, where the bands cannot meet
   either**" (EN + ZH), and that sentence is asserted against the CH9/WIFI7 record comparison.
8. **The 276.816 Mb/s reference scene is legal and schema-checked**: the `uwb` block is destructured
   away as well as the UWB nodes, `alone.uwb` is asserted `undefined`, `ScenarioSchema.parse(alone)`
   must not throw, and its node ids are checked against the shipped `noUwb` variant's.
9. **0.97 % now denotes one quantity.** Quiz 2's distractor quotes the session's air time as
   "**48.6 ms of the five seconds**" instead of 0.97 %; the test pins 48.6 ms from `TX_START` air and
   asserts the prose contains "0.97 %" exactly once — the saturated run's throughput cost.

Word count 1599 → **1701**, `lessonMinutes` still **25** (ceiling 1724); the header comment states
the new figure and its 23-word headroom. `npx vitest run tests/course/uwb-coexist.test.ts` →
**29 tests, all passing** (was 28); with `tests/course/lessons.test.ts` and
`tests/engine/lesson-hashes.test.ts`, **72 tests, 3 files, all passing**. `npx tsc -b` clean.
`tests/fixtures/lesson-hashes.json` untouched.
