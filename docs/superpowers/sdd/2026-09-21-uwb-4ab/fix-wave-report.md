# Fix wave — whole-branch review of UWB slice 7 (P802.15.4ab)

Branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.
Base (review head) `4f2b3de` → new head `8c25077`, ten commits, one per item, each by pathspec.

**Gates at the head**: `npx tsc -b` exit 0 · `npx vite build` exit 0 ("✓ built in 2.89s", only the usual
>500 kB chunk warning) · `npx vitest run` **116 files, 1744 passed (1744)**, 50.8 s (1729 before this wave,
+15 new tests) · `git diff 4f2b3de..HEAD -- tests/fixtures/` **empty**: both `lesson-hashes.json` and
`uwb-record-hashes.json` are byte-identical to the review's head, for every item including item 1.

| # | Item | Commit |
|---|---|---|
| 1 | Finding 1 — lost-leading-fragment RMARKER | `293966e` |
| 2 | Finding 2 — MMS lesson credits Clause 12 | `6427672` |
| 3 | Findings 3–7 — prose and test titles | `a57b418` |
| 4 | Finding 8 — editor's 6 GHz note | `c9fe5ab` |
| 5 | Finding 9 + Include — fragment colour | `f3e8d97` |
| 6 | Include — `view.mms.trains` keyed `peer:kind` | `6fc6b89` |
| 7 | Include — `units.ts` leaf | `d0ec22d` |
| 8 | Include — one free-space law | `b92092d` |
| 9 | Include — drop `UwbChannelCfg.mms` | `933fa58` |
| 10 + 11 | Include — `beginRound` throws; `WIFI_6G_CENTER_MHZ` JSDoc | `8c25077` |

---

## 1 — Finding 1 (Important). The walk-back uses the train's own ratio. `293966e`

**What changed.** `rmarkerFromFragment` (`src/uwb/mms.ts`) now works on the receiver's *counter*, not on
true time: `rmarkerFromFragment(firstCounter, index, ratio)` returns `firstCounter` unchanged when
`index === 0`, and otherwise `firstCounter − round(index · MS_RCTU · ratio)` reduced mod `COUNTER_MOD`.
`evaluateTrain` (`src/uwb/device.ts`) stamps the first heard fragment once (`firstCounter`), measures the
span against that same number (one call fewer than before, same value), and only then walks back — so the
ratio the two stamps just measured is what scales the walk-back. With `heard < 2` there is no ratio and the
receiver's own nominal millisecond is used; the jsdoc says what residual that leaves and that there is
nothing better to use.

Draw order is untouched (first stamp, then last stamp, then the carrier residual only on the fallback path),
and `index === 0` returns the identical number the old code produced — which is why no shipped scene moves.

**Why the arithmetic is right.** The fragments are `1 ms` apart on the *transmitter's* clock, i.e.
`MS_NS / (1 + d)` of true time; the receiver's counter runs at `(1 + r)`. The exact walk-back is therefore
`index · MS_RCTU · (1 + r)/(1 + d)`, and `(1 + r)/(1 + d)` is precisely the ratio the train measures. The
shipped code walked back `index · MS_NS` of *true* time, leaving `index · 1 ms · txPpm` — 20 ns, 3.0 m of
range, per lost leading fragment at 20 ppm.

**Files.** `src/uwb/mms.ts`, `src/uwb/device.ts`, `src/uwb/records.ts` (the `UWB_MMS_TRAIN` note now says the
ratio is also the walk-back's), `docs/superpowers/specs/2026-09-21-uwb-4ab-design.md` (its "lost first
fragment" paragraph had the same first-order statement), `README.md:108`, `src/ui/Guide.tsx` (EN §12 and the
ZH counterpart), `src/ui/glossary.ts` ("Train-derived clock ratio", EN + ZH), `tests/uwb/mms.test.ts`,
`tests/uwb/network.test.ts`.

**The end-to-end test the spec asked for** — `tests/uwb/network.test.ts`, describe *"MMS, a train whose
leading fragment was lost"*, three its. One pair on **UWB channel 5**, crystals pinned at tag −20 ppm and
anchor +20 ppm, driven by hand round a `Spectrum`. A single Wi-Fi emission (20 dBm over `UWB_BAND_MHZ[5]`, a
metre from the anchor) is scheduled live at `2 ms − 1 ns` and retired at `2.4 ms`, so it covers the
initiator's fragment 0 (slot 4, 2.000 ms) and nothing else — not its fragment 1 (slot 6, 3.000 ms), not the
responder's train (slot 5 on). The channel's own SIR rule does the dropping; there is no production test hook.

It asserts: exactly one `UWB_INTERFERED` (`anc-1 ← tag-1`) at `2 ms + 15 ns + rsfNs(40, 64)`, with
`sirDb < UWB_SIR_MIN_DB`; `UWB_MMS_TRAIN` = `['anc-1','tag-1',7,8,true]` and `['tag-1','anc-1',8,8,true]`
(**heard === X − 1**, **detected**); the ratio still measured over the six remaining milliseconds, within
4 σ; and both `UWB_RANGE` records within `4·SIGMA_R` (8.48 cm) of truth *and* within a twentieth of the
would-be error, which the test computes from the crystals: `½ · 1 ms · 20 ppm · c = 2.998 m`, pinned
`toBeCloseTo(3.0, 1)`.

**The test bites** (verified): with `evaluateTrain` temporarily reverted to
`this.clock.counter(first.arrivalNs − first.index · MS_NS, firstExtraNs)` the third `it` fails with
`tag-1: expected 3.043475282602797 to be less than 0.08479411200015328` — 3.04 m, the predicted 3.0.

`tests/uwb/mms.test.ts`'s three `rmarkerFromFragment` cases were rewritten for the new signature and a
fourth added (no ratio ⇒ the crystals' whole offset is left behind: 3 ms × 40 ppm = 120 ns) and a fifth
(the walk-back wraps the 40-bit counter rather than going negative).

**Covering tests**: `tests/uwb/mms.test.ts` 25 passed; `tests/uwb/network.test.ts` 94 passed;
`tests/uwb/` + `tests/engine/uwb-record-hashes.test.ts` 335 passed; `tests/course/` 763 passed.
**Fixtures**: unchanged (no shipped scene loses a leading fragment, and `index === 0` is bit-identical).

## 2 — Finding 2 (Important). The MMS lesson credits Clause 12. `6427672`

First paragraph of `src/course/uwb/uwb-mms.ts` (EN + ZH) now reads "…**but the multi-millisecond packet, and
everything that turns a Clause 12 O-QPSK radio into a control radio for UWB, come from P802.15.4ab**…" — the
review's own wording, matching `uwb-nba.ts:103`. "What the narrowband radio carries" now says
"Everything else rides **Clause 12's** 250 kb/s O-QPSK radio…" (ZH: 标准第 12 章那部…).

The pin in `tests/course/uwb-mms.test.ts` derives it the way `uwb-nba.test.ts` does: the new clause is
required verbatim, and the radio's own numbers are re-derived — `NB_SYMBOL_CHIPS · NB_CHIP_US === NB_SYMBOL_US`,
`4 / (NB_SYMBOL_US/1000) === 250`, `nbPpduNs(NB_POLL_BYTES)/1000 === 576` — plus the second paragraph's
Clause 12 credit in both languages.

**Word budget.** The clause costs 10 words and the second credit 1. To stay under the pinned
`lessonWords ≤ 1724` the opening's two em-dash pairs became a colon/full stop and commas, `(the cycle)` /
`(the budget)` lost their articles, "That draft is members-only, so this…" became "The draft is
members-only; this…", and "what the run measures is the floor under them" became "the run measures the
floor under them". **uwb-mms is 1723 words** (was 1717). No pinned string was touched.

**Covering tests**: `tests/course/uwb-mms.test.ts` 42 passed, `tests/course/uwb-nba.test.ts` 33 passed.
**Fixtures**: unchanged (the lesson fixture hashes are scene timelines, not prose).

## 3 — Findings 3–7. `a57b418`

- **3** `uwb-nba.ts` — "Anchors 1 and 2 have **a busy check** too, in block 3" (the ZH already said 判忙);
  the prose pin in `tests/course/uwb-nba.test.ts:517` follows.
- **4** `Guide.tsx` §12 — "Known simplifications (on top of **the ones the README lists**)" / 在 README
  所列各项之外, EN and ZH. §11 has no such paragraph; the README does.
- **5** `uwb-mms.ts` — "half the reply time **— the reply is one slot, 0.5 ms**" (ZH likewise).
- **6** two test titles: `tests/ui/uwb-guide.test.ts:501` "…never claims **to have read** D5.0";
  `tests/course/uwb-mms.test.ts` the stale "1.22 m east" → `"(14.22, 4.05) m against a true (13.00, 4.00)",
  error 122.4 cm, GDOP 2.93, ellipse 6.1 × 1.3 cm`.
- **7** "several times over" → **"for every mandatory set"** in `Guide.tsx:370` (EN) and its ZH twin, and in
  `src/uwb/nb.ts`'s module docstring ("longer than any one fragment it sets up, for every mandatory
  parameter set").

Finding 5's rewording costs 4 words and finding 3's 2, so one word was trimmed from each lesson's opening
("so this paraphrases" → "; this paraphrases"; "recirculation in September 2026" → "recirculation, September
2026"). **Both lessons are 1723 words**, one under the cap.

**Covering tests**: `tests/course/uwb-mms.test.ts`, `tests/course/uwb-nba.test.ts`, `tests/ui/*` (12 files,
215 passed), `tests/uwb/nb.test.ts`. **Fixtures**: unchanged.

## 4 — Finding 8. The editor's 6 GHz note. `c9fe5ab`

`nbListOverlapsSixGhz(nbChannels, centerMhz, widthMhz)` is new in `src/uwb/nb.ts`: does any channel of an
MMS allow list have a band overlapping `[centre ± width/2]`. `src/engine/simulation.ts`'s mediator gate now
calls it in place of its inline `some`/`bandOverlapMhz` loop (so `nbBand` and `bandOverlapMhz` are no longer
imported there), and `src/editor/planOps.ts`'s new `sixGhzNbOverlaps(sc, centerMhz)` calls the same
predicate — so the gate and the note cannot disagree.

The gate's 160 MHz width floor moved to `SIX_GHZ_GATE_MIN_WIDTH_MHZ` in `src/model/scenario.ts`, the one leaf
both callers already import; the note asks at exactly that width, which is the *narrowest* the gate ever
uses, so a note that appears always means a run that really couples. `FloorPlanEditor.tsx` renders a second
dim span; `i18n.ts` gains `sixGhzNbOverlap` EN + ZH.

The band arithmetic is written out inside `nbListOverlapsSixGhz` rather than importing `bandOverlapMhz`:
`spectrum.ts` reaches `nb.ts` through `phy.ts`, and that edge must not run backwards. The result is a
boolean from `> 0`, so nothing numeric can drift.

**Tests** (`tests/editor/coexist-note.test.ts`, +9): the predicate itself (channel 200 inside channel 71,
100 outside, a mixed list, the UNII-3 default never inside, and channel 180 outside the 80 MHz channel but
inside the gate's 160); and `sixGhzNbOverlaps` (no session, a TWR session, no UWB node, a UNII-5 list on UWB
**channel 9** where the old note is still null, the UNII-3 default). 16 passed. `tests/engine/` +
`tests/editor/` + `tests/ui/i18n.test.ts`: 50 files, 419 passed. **Fixtures**: unchanged.

## 5 — Finding 9 / Include. Fragment colour. `f3e8d97`

`src/scene/effects.ts`: `uwbRsf`/`uwbRif` are **`0xa3e635`** (lime), no longer the AMP trigger/ack
`0x2dd4bf`; the ambers and the narrowband indigo are untouched. `tests/scene/mapping.test.ts` gains a case
that walks all 21 frame kinds and asserts the fragment colour is shared by RSF and RIF and worn by nothing
else, from either source direction. `tests/scene/` + `tests/ui/uwb-lanes.test.ts` 29 passed.
**Fixtures**: unchanged (colour is not in any hash).

## 6 — Include. `view.mms.trains` keyed `${peer}:${kind}`. `6fc6b89`

`src/uwb/view.ts`: new exported `uwbTrainKey(peer, kind)`, `UwbTrainView` gains `peer`, and the reducer
writes `u.mms.trains[uwbTrainKey(r.peer, r.kind)]`. `src/uwb/ui/rows.ts`'s `uwbTrainRows` reads
`Object.values(...)` and takes the peer off the row, so a mixed session shows the RSF row the range was made
on *above* the RIF row that vouched for it, in close order.

`tests/uwb/inspector-rows.test.ts`'s fixture became a genuinely mixed session (anc-1 RSF + anc-1 RIF, anc-3
RSF) and asserts two rows for one peer; `tests/uwb/view.test.ts` feeds an RSF and an RIF of the same peer and
pins `Object.keys` = `['anc-1:rsf','anc-1:rif','anc-2:rif']` with the RSF row intact. The two course
inspector pins were checked: `uwb-mms.test.ts`'s read rows, not keys, and hold unchanged; `uwb-nba.test.ts`
indexed the record, so its key list is now `[uwbTrainKey('anchor-1','rsf'), uwbTrainKey('anchor-2','rsf')]`
(Y = 0 there, so one row per peer as before). `tests/uwb/` + `tests/course/uwb-*` + `tests/model/`: 30 files,
524 passed. **Fixtures**: unchanged.

## 7 — Include. `src/uwb/units.ts`. `d0ec22d`

New leaf holding `UWB_CHIP_HZ`, `UWB_CHIP_NS`, **`RCTU_PER_CHIP`**, `RCTU_NS`, `RCTU_PS`, `COUNTER_BITS`,
`COUNTER_MOD`, `chipsToNs`, `C_M_PER_NS`, `freeSpacePl0Db`, `UWB_PL_EXP` and `UWB_RX_SENS_DBM` — everything
`mms.ts` and `nb.ts` needed from `phy.ts`. It imports only `../model/types`. `phy.ts` re-exports every one of
them, so **no import anywhere else in the repository changed**; `RSTU_CHIPS`/`RSTU_NS` and the rest of the
PHY stayed. `mms.ts`'s private `RCTU_PER_CHIP = 128` is gone in favour of the shared constant (`RCTU_NS` is
now `UWB_CHIP_NS / RCTU_PER_CHIP`, `MS_RCTU` is `MS_CHIPS · RCTU_PER_CHIP` — both the same numbers).

Grep confirming the cycle is gone: `grep -n "from './phy'" src/uwb/mms.ts src/uwb/nb.ts` → **no matches**.

`tests/uwb/mms.test.ts` now pins `MS_RCTU === MS_CHIPS · RCTU_PER_CHIP` and
`RCTU_NS === UWB_CHIP_NS / RCTU_PER_CHIP` (the old comment claiming a deliberate second copy is gone).
`tests/uwb/` + `tests/engine/`: 61 files, 626 passed. **Both fixtures pass untouched.**

## 8 — Include. One free-space law. `b92092d`

`uwbPathLossDb(pl0Db, dM, wallsDb) = pl0Db + 10·UWB_PL_EXP·log10(max(dM, 0.1)) + wallsDb` lives in
`units.ts` (re-exported from `phy.ts`). Its three former copies now call it: `uwbToWifiPathLossDb`
(`src/engine/spectrum.ts`), `UwbChannel.lossDbFor`'s narrowband branch and `UwbChannel.rssiDbm`
(`src/uwb/channel.ts`, which also stopped importing `UWB_PL_EXP`). A stale comment in `spectrum.ts` naming
`UWB_PL_EXP` as the imported piece now names `uwbPathLossDb`.

One caution worth recording: `rssiDbm` used to subtract three terms in a chain (`tx − pl0 − spread − walls`)
and now subtracts their sum, which is not *a priori* bit-identical in binary floating point. It was checked
empirically rather than assumed: the full 1744-test suite, including both hash fixtures and all 29
pre-existing timeline hashes, passes unchanged. **Fixtures**: unchanged.

## 9 — Include. `UwbChannelCfg.mms` deleted. `933fa58`

The field and `network.ts`'s `mms: this.plan.mode === 'mms' ? cfg.mms : undefined` pass-through are gone;
`channel.ts` no longer imports `MmsPhy`. The interface's doc now says there must not be such a field, and
why: everything about a fragment rides on the frame, which is what makes the per-frame dispatch possible.
`tests/uwb/` + both fixtures: 336 passed. **Fixtures**: unchanged.

## 10 — Include. `beginRound` throws. `8c25077`

`src/uwb/device.ts` `beginRound`: when `plan.mms` is set and no `nbChannel` was given it throws
`"UwbDevice.beginRound: mode 'mms' needs the block's narrowband channel"` — the style of T1's
`uwbSlotsPerTag` guard. Without it the round ran twenty-eight silent slots and emitted nothing to say why.

**Test** (`tests/uwb/network.test.ts`, describe *"UwbDevice.beginRound — an MMS round without a narrowband
channel"*, 2 its): a bare `UwbDevice` wired to a `UwbChannel` and nothing else; an MMS `roundPlan` throws
both with `{}` and with `{ nbChannel: null }`, does not throw with `{ nbChannel: 3 }`, and a TWR plan
(`plan.mms` undefined) needs none.

## 11 — The parked comment. `8c25077`

`src/course/uwb/uwb-nba.ts` `WIFI_6G_CENTER_MHZ`: "802.11ax 6 GHz channel 71" → "Channel 71 of the 6 GHz
plan — the coexistence lesson's Wi-Fi 7 router, 80 MHz over 6265–6345 MHz. The channelization is the 6 GHz
one the lesson names, not a generation."

---

## Deferred rows, left alone as ruled

Cross-radio capture in `UwbChannel.startRx`; the `device.ts` → `device.mms.ts` split; the schema's duplicate
block-rule branch; the −0 note and the duplicated FNV constants in `uwb-record-hashes.test.ts`.

## Nothing could not be done

Every item 1–11 landed. Two things worth a reviewer's eye:

1. **`rssiDbm`'s re-association** (item 8) is float-order-sensitive in principle; it is verified only by the
   suite and the two fixtures, which is the guard the ruling nominated.
2. **Both lessons sit at 1723 of 1724 words.** Item 2 and finding 5 together cost 15; the room was found in
   unpinned punctuation and articles of the same paragraphs, not by cutting content. Any future sentence
   added to either lesson has to buy its words from somewhere.
