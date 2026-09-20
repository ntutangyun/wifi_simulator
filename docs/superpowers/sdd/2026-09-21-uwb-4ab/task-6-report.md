# Task 6 report — lesson `uwb-nba`, "The narrowband radio shares 6 GHz too" / 窄带电台也共享 6 GHz

Head at start: `365ddfa`. Work done in `D:\wifi_sim\.claude\worktrees\feat-link-2g`.

## Files

| File | Change |
|---|---|
| `src/course/uwb/uwb-nba.ts` | new — the lesson and `uwbNbaScenario(variant)` |
| `tests/course/uwb-nba.test.ts` | new — 33 tests, every quoted number pinned |
| `src/course/curriculum.ts` | `'uwb-nba'` appended to `COURSE_ORDER` after `'uwb-mms'` |
| `src/course/lessons.ts` | import + `AUTHORED` entry |
| `tests/fixtures/lesson-hashes.json` | 4 additions only (`uwb-nba`, `#0`, `#1`, `#2`) — verified by diff |
| `tests/course/uwb-mms.test.ts` | the neighbour pin "uwb-mms is last" now reads "…then uwb-nba, which is last" |

`src/course/lessonKit.ts` was **not** touched: `firstNbPoll`, `firstNbLbt`, `firstUwbTrain`, `firstNbReport`,
`firstUwbRange`, `oneRoom`, `wifi6g`, `node`, `anchor`, `uwbTag`, `LESSON_6G_WIDTH_MHZ` all existed already.
No engine change was needed.

## Lesson contract

- `id 'uwb-nba'`, `module 15`, tier 6; 10 body blocks (1 formula, 1 table), **4 observe / 2 tryThis / 3 quiz**,
  5 jumps. EN + ZH on every string.
- **`lessonWords` = 1722** (ceiling 1724), `lessonMinutes` = **25**.
- First paragraph states the split: standard (nothing — "Nothing about this narrowband radio is in IEEE Std
  802.15.4-2024"), draft (P802.15.4ab **D5.0**, Sponsor-ballot recirculation, "The balloted draft may differ",
  naming **15-22/0381r5** for the channel plan / LBT / block-wise hop and **15-23/0100r2** for the NB PHY and
  channel counts), regulation (the −75 dBm/MHz threshold from ETSI EN 303 687), model — and says once, there,
  that the channel-centre formula is *reconstructed from the published counts and band edges* and that the
  block-wise hop uses *the simulator's own string hash where the draft specifies AES-128-CTR keyed by the
  session seed*, plus that one instantaneous power reading stands in for the 9 µs assessment.

## Scene and variants (as the spec binds them)

`oneRoom()` (10 × 8 m), Wi-Fi 7 router at (5, 4, 2.0) 80 MHz on `sixGhzCenterMhz: 6305`, saturated 6 GHz laptop
at (7, 5, 1.0) (coexist-lesson builders), four corner anchors at 2.2 m, tag at (4, 3.5, 1.0);
`mode: 'mms'`, default PHY (X = 8), `method: 'ss'`, `slotRstu: 600`, block 200 ms (`DEFAULT_UWB_SESSION.blockRstu`),
UWB `channel: 9`, `report: 'bi'`, `nbLbt: 'auto'`. Base `nbChannels: [200]`; variants `[100]` ("Outside the
router's channel"), `[100, 150, 200, 210]` ("Hop over four channels"), `[200]` + `nbLbt: 'off'` ("No LBT").
Node list is byte-identical across all four variants (pinned).

**Window: 1.3 s = seven whole blocks (0…6).** With four anchors a block holds four 14 ms pair rounds, so
block 6 (1.200 s) is finished at 1.256 s and block 7 would not start until 1.400 s. Pinned as an inequality
against `roundPlan`, not transcribed.

## Every pinned number

**Channel plan** — `NB_CHANNELS` 250, `NB_CHANNEL_MHZ` 2.5, `nbCenterMhz(0/49/50/249)` = 5726.25 / 5848.75 /
5926.25 / 6423.75; 20 / 2.5 = 8 NB channels per 20 MHz Wi-Fi channel; **32** NB channels (186…217) lie wholly
inside 6265–6345 MHz (computed by sweeping `nbBand`). Centres of the four the lesson uses: **100 → 6051.25,
150 → 6176.25, 200 → 6301.25, 210 → 6326.25 MHz**; in/out of the router's 80 MHz via `bandOverlapMhz`:
**false, false, true, true** (two outside, two inside). Gap between channel 100's upper edge and the router's
lower edge: **212.5 MHz**. Draft default list `[3]` = 5733.75 MHz, UNII-3.

**LBT threshold** — `NB_LBT_EDT_DBM_PER_MHZ` −75, `NB_LBT_CCA_US` 9, `NB_LBT_THRESHOLD_DBM` = −75 +
10·log10(2.5) = **−71.02 dBm** (also checked against every `UWB_NB_LBT.thresholdDbm` in the run).

**The arithmetic, labelled as arithmetic** — 20 + 10·log10(2.5/80) = **4.95 dBm**; crossing of −71.02 under
`wifiToUwbPathLossDb` (46.7 + 30·log10 d + 1.2, the engine's own function) by bisection: **8.62 m**.
Router–tag distance √(1² + 0.5² + 1²) = **1.50 m**, well inside it, so the check can only report whether
anyone is transmitting at that instant — which the lesson says. At 1.50 m: **−48.23 dBm** (80 MHz PPDU,
22.8 dB over), **−42.21 dBm** (20 MHz control frame); the laptop at **3.35 m**: **−63.72 dBm**, 7.3 dB over —
and that −63.72 is exactly what every one of the tag's busy records read (pinned both ways).

**Per scene over the window** (`UWB_NB_LBT` records / distinct blocks the tag skipped / `UWB_RANGE` on the tag
lane / per anchor lane / `UWB_POSITION`):

| Scene | LBT records | Tag's skipped blocks | Tag ranges | Anchor-lane ranges | Fixes |
|---|---|---|---|---|---|
| Base `[200]` | **9** (tag 7, anchor-1 and anchor-2 once each in block 3) | **7 of 7** (0…6) | **1** | 0 | **0** |
| Outside `[100]` | **0** | 0 | **28** | 7 each | **7** (4 anchors, GDOP 1.05) |
| Hop | **4** (all the tag) | **4 of 7** (1, 2, 5, 6) | **13** (4/4/4/1 in blocks 0/3/4/5) | 3 each | **3** (blocks 0, 3, 4) |
| No LBT | **0** | 0 | **21** | 7/7/7/5 | **5** (blocks 1…5) |

Base also: **29** `UWB_TIMEOUT`, **6** NB frames on the air in 1.3 s, the one range
`uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)` at 12.608 ms (pinned as
`12 ms + nbPpduNs(13) + 16 ns`). Outside: 0 timeouts.

**Hop map** — replayed from `nbChannelForBlock([100,150,200,210], 7, b)` for b = 0…6:
**100, 210, 200, 150, 100, 210, 200**, and the same map is read back out of the run (each block's POLL
`frame.uwb.nb.channel`, plus each busy record's `channel` for the blocks that never polled). Scenario seed
pinned as 7.

**No-LBT losses** — **7** narrowband frames lost at the tag, **five REPORTs and two RESPs** (frame kind
recovered by matching each `RX_FAIL` to the `TX_START` whose air time covers it), every one `lowSinr`, with
7 matching `UWB_INTERFERED` whose `foreignDbm` is **−42.21 dBm** = the closed form for the router's 20 MHz
control frame at 1.50 m. First line: `uwb-1 UWB frame from anchor-3 lost to Wi-Fi: SIR -10.9 dB (foreign
-42.2 dBm)`. Ranges still happen: 21 of them, 5 fixes.

**The Wi-Fi side** — ED radius of the NB radio: 10 − `nbPl0Db(200)` (48.44) − 20·log10 d = −62 (`CCA_ED_DBM`)
→ **15.07 m**, longer than the room; against the coexistence lesson's UWB frame, recomputed here from the same
two laws, **≈ 0.40 m**. Measured effects:
- **A record is attributable**: `CCA_BUSY { cause: 'energy' }` at a Wi-Fi radio that is *not* itself starting a
  transmission *and* while a narrowband frame is on the air. Counts: base **7**, outside **0**, hop **1**,
  no-LBT **44** (ap#6g 23, laptop#6g 21). The "outside" run — no mediator at all — is the control at zero, and
  it is zero even though 303 CCA-busy events there coincide with an NB frame, which is why both filters are in
  the helper. (`CCA_BUSY` carries only a cause and `'energy'` also covers the radio's own transmission; that
  caveat is documented in the test.)
- **Throughput and PPDUs**: laptop goodput **362.631 Mb/s** (no LBT) against **407.215** (outside) = **10.95 %**;
  Wi-Fi `RX_FAIL` **87** against **0**. With LBT on: 6 NB frames, **5** failed Wi-Fi PPDUs, each of the five
  inside an NB frame's air time (pinned).
- **The "outside" run is byte-identical on the Wi-Fi side** to the same scenario with the session and its nodes
  removed — whole-record identity modulo the shared sequence number, plus 407.215 Mb/s both ways and 0 RX_FAIL.

**Strings quoted, pinned against `fmtRecord` / `STRINGS`** — `uwb-1 NB LBT busy on ch 200: -63.7 dBm ≥ -71.0 —
skipping the block`; `uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)`; `anchor-1 → uwb-1 NBREPORT 13 B
@0.25 Mbps (608.0 µs)`; `anchor-1 UWB slot 26: no nb-report from uwb-1`; `anchor-2 UWB slot 0: no nb-poll from
uwb-1`; `uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors`. Inspector rows
in both languages: `uwbNbChannelText` → `200 · 6301.25 MHz` (EN and ZH), `uwbLbtText` → `7 busy · 7 blocks
skipped` / `7 次忙 · 跳过 7 个块`, and `STRINGS.*.uwb.lbtBusy` → `listen before talk` / `先听后发`.
(The event-log line itself is untranslated in `format.ts`, so the ZH observe item quotes the same English
string — the same convention `uwb-mms` uses.)

## Where the engine differs from the spec's intention (engine wins)

1. **The base scene is far more destructive than "the block-skip consequence" suggests.** With a *saturated*
   6 GHz laptop the tag's LBT is busy in every one of the seven blocks: one range, no fix at all. The lesson is
   written around that rather than around a partial loss. Nothing was forced: the laptop profile and geometry
   are exactly the spec's.
2. **"No LBT" is the configuration that works.** 21 ranges and 5 fixes against 1 and 0. The lesson says so, and
   says that the regulator, not the engine, is the reason you may not ship it.
3. **LBT protects Wi-Fi only by making narrowband frames rarer, not gentler** — 5 failed PPDUs behind 6 frames
   with it on, 87 behind 108 with it off. This follows from the model's own simplification (one reading at the
   slot start says nothing about the 576 µs that follow) and the lesson names that simplification.
4. **The "Outside the router's channel" variant never runs an LBT check at all.** `nbLbtRequired(100, 'auto')`
   is still true (channel ≥ 50), but with no mediator `lbtBusy` always reports clear, so no record is emitted.
   The lesson says "the coupling disappears: not one busy check", which is what the engine does.
5. **No per-deferral record names the foreign emitter.** `CCA_BUSY` carries only `cause`, and `'energy'` also
   fires when the radio itself starts transmitting. The lesson's 44 is therefore the filtered count described
   above, with the uncoupled variant as the zero control; the alternative the brief allowed (throughput / PPDU
   difference) is pinned as well.
6. The tag's inspector shows **two** train rows in the base scene (anchor-1 at +34.5 dB, anchor-2 at +32.0 dB),
   not one — the observe item quotes both.

## Gates

- `npx tsc -b` clean; `npx vite build` clean (only the pre-existing chunk-size warning).
- `npx vitest run`: **115 files, 1692 tests, all green**. `tests/course/uwb-nba.test.ts` is 33 tests.
- `tests/fixtures/lesson-hashes.json`: regenerated with `$env:UPDATE_HASHES='1'`; `git diff` shows **4 added
  lines and 0 removed**.
- Committed by pathspec, only the six files above.

## Self-review as a learner

EN and ZH read the same argument in the same order: the plan → the rule and its arithmetic → why the rule is
trivially tripped at 1.50 m → what one busy check costs (block 0, told as a story) → the four-scene table →
hopping as an average → the price Wi-Fi pays → the uncomfortable trade → where a control channel belongs.
Both languages carry every number; the ZH observe item for the inspector adds one clause ("one busy check in
each of the run's seven blocks") that the EN dropped for the word budget — it is true and pinned.

---

# Fix round 1 — `4f2b3de` "fix(course): the narrowband lesson credits Clause 12 for the radio and names its proxies"

Two files only: `src/course/uwb/uwb-nba.ts`, `tests/course/uwb-nba.test.ts`. Prose and pins only — no scene,
no session, no air change; `tests/fixtures/lesson-hashes.json` untouched (git status showed only the two
files), and `tests/engine/uwb-record-hashes.test.ts` and its fixture (Task 7's) were never opened.

## 1 (important) — the opening paragraph was false about the radio

**Was:** "Nothing about this narrowband radio is in IEEE Std 802.15.4-2024." The PHY *is* the standard's:
`src/uwb/nb.ts` tags `NB_CHIP_US`, `NB_SYMBOL_CHIPS`, `NB_SYMBOL_US` "standard Clause 12", and 576 / 608 µs
fall straight out of them.

**Now (EN, and the ZH mirrors it):** "The radio itself is the standard's: the 250 kb/s O-QPSK PHY of IEEE Std
802.15.4-2024 Clause 12, and the 576 µs a 12-octet message takes comes straight from it. Everything that makes
it an NBA-UWB control radio — the 250 channels, the poll/response/report cycle, the listen-before-talk rule,
the block skip — is P802.15.4ab, at D5.0 …". The rest of the split (draft, "The balloted draft may differ",
15-22/0381r5 + 15-23/0100r2, regulation = the −75 dBm/MHz of ETSI EN 303 687, model = the reconstructed
channel-centre formula, the hash for AES-128-CTR, one reading for 9 µs) is unchanged.

The pin now derives the claim instead of quoting it: `NB_SYMBOL_CHIPS × NB_CHIP_US === NB_SYMBOL_US`,
`4 / (NB_SYMBOL_US / 1000) === 250` (kb/s), `nbPpduNs(NB_POLL_BYTES)/1000 === 576`, plus `toContain` on the
Clause 12 sentence and on the list of what the draft adds. The file header docstring says the same in one line.

## 2–4 (minor) — the Wi-Fi deferral sentence

**Now:** "Every narrowband frame is audible here. No record names the emitter, so count the clear-channel
transitions that go busy on energy alone inside a narrowband frame: 44 in 1.3 seconds with the rule off —
a 576 µs POLL or RESP, a 608 µs REPORT — against none in the uncoupled scene. Not 108 twice over: a radio
already busy or transmitting makes no new transition." EN + ZH.

That is (2) the proxy named and its zero control, (3) the RESP added — and its 576 µs pinned through
`nbPpduNs(NB_RESP_BYTES)` alongside POLL and REPORT — and (4) the reason the count is not ~216.

## 5 (minor) — block 0 does not stop the rounds

"…block 0 is over **for the tag**: rounds 1 to 3 run, but it says nothing in them", which is what observe 2's
`anchor-2 UWB slot 0: no nb-poll from uwb-1` at 15.000 ms shows. Newly pinned: the tag emits `UWB_ROUND` for
rounds 0–3 of block 0, and no narrowband frame of block 0 comes from a round above 0.

## 6 (minor) — quiz 1 argues from the emitter the run actually read

Option b is now "the laptop alone reads −63.72 dBm at the tag, the router 22.8 dB over when it sends, and one
busy check costs the whole block"; the explanation says "Every one of the tag's seven busy checks reads
−63.72 dBm — the laptop, 3.35 m away, uploading — and the router when it sends is 22.8 dB over." Both pinned,
and the −63.72 was already checked against every `UWB_NB_LBT.foreignDbm` of the run.

## 7, 8, 10 (minor) — new pins

- `nbLbtRequired(200, 'auto') === true`, `nbLbtRequired(3, 'auto') === false`, `nbLbtRequired(200, 'off') === false`
  — the two "optional / not optional" sentences.
- `sixGhzChannelNo(6305) === 71` (from `src/model/scenario.ts`) and `ap.caps.generation === 'eht'`. The prose
  now reads "this **Wi-Fi 7** router's 80 MHz (channel 71 of the 6 GHz plan, 6265 to 6345 MHz)" — the old
  "802.11ax channel 71" sat oddly next to a Wi-Fi 7 node — and the header, the scenario docstring, the prose
  and the test title all say Wi-Fi 7 on 6 GHz channel 71.
- Per-lane `UWB_RANGE` for the two scenes that had only tag-lane pins: hop **3 on every anchor lane**
  (13 + 4 × 3 = 25 in all), no-LBT **7 / 7 / 7 / 5** (21 + 26 = 47 in all).

## Budget and gates

`lessonWords` = **1722** (was 1722; the new material is +55 words, paid for by trims spread over nine blocks —
none of them a pinned figure). `lessonMinutes` = 25.
`npx vitest run tests/course/uwb-nba.test.ts tests/engine/lesson-hashes.test.ts` → **34 passed**;
`npx vitest run tests/course tests/engine/lesson-hashes.test.ts` → **28 files, 719 passed**; `npx tsc -b` clean.
The lesson's own test file is now 33 tests with ~30 more assertions than before.
