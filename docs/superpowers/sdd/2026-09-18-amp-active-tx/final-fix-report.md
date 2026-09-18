# Final-review fix wave — report

Worktree: `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch `feat/amp-active-tx`.
Base: `8d6fb95`. Result: **`9c58e1e`** (one commit; see "Commits" below for why one and not two).

---

## Per finding

### 1 — Lesson 2 RSSI numbers were 6.5 dB off · DONE
- `tests/course/amp-slots.test.ts:118-125` — the two link-table reads now go through
  `rssiOn('2g', links, …)`, so the engine's `LINK_EXTRA_LOSS_DB['2g'] = -6.5` is applied.
  Pins are now `-30.7` / `-50.7` dBm and `41.3` / `43.3` dB; the quoted sentence in the
  comment was updated to match the prose.
- `src/course/amp/amp-slots.ts:45` (en) and `:46` (zh) — the same four numbers.
  The "under a hundredth of a decibel between them" and the no-capture argument are
  untouched: the offset is uniform across the ring, so the spread and the 5 dB capture
  margin are unchanged.
- Word count unchanged (digit-for-digit substitution), so study time stays 25 min.
- **Covering test:** `tests/course/amp-slots.test.ts` › "the scene is one router and six
  tags on a 2 m ring, all at the same signal level", and the lesson's own study-time test.

### 2 — Shared RSSI helper · DONE
- **New** `tests/course/rssi.ts` — exports `rssiOn(link, table, from, to)` and `LinkTable`;
  throws on a missing entry rather than silently producing `NaN`. The header comment states
  why the band-neutral table is not what a lesson quotes.
- Adopted in all three lesson tests:
  - `tests/course/amp-slots.test.ts:19` (import), `:120-121`
  - `tests/course/amp-intro.test.ts:20` (import), `:417-419`
  - `tests/course/amp-coexist.test.ts:16` (import), `:193`, `:200`
  `LINK_EXTRA_LOSS_DB` is still asserted directly in intro and coexist (`toBe(-6.5)` /
  `toBe(0)`), which is a claim about the engine constant, not a hand-applied offset.

### 3 — Frame-detail strings called the Active Tx uplink "backscatter" · DONE
- `src/ui/i18n.ts:373` (en `frameDetail.whatIs.ampAck`) — "…unlike the tag’s own
  transmission on harvested power that it closes."
- `src/ui/i18n.ts:374` (en `whatIs.ampResp`) — "An Active Tx tag’s answer …, sent on a
  carrier the tag makes itself, on power harvested from the AP’s signal rather than from a
  battery."
- `src/ui/i18n.ts:691` (zh `whatIs.ampAck`) — "…由标签以收集到的能量主动发射作答的那个时隙。"
- The zh `ampResp` (`:692`) already said "用从 AP 载波上收集到的能量发送" with no
  backscatter claim and was left alone (not in the findings list).
- **Code-point census** (U+201C / U+201D / U+2018 / U+2019):
  - `src/ui/i18n.ts` before `5 / 5 / 0 / 20` → after `5 / 5 / 0 / 21`. The single added
    U+2019 is the deliberate "tag’s" in `ampAck`; `ampResp` swapped "A backscatter tag’s"
    for "An Active Tx tag’s" and "AP’s own carrier" for "AP’s signal", both quote-neutral.
  - `src/ui/Guide.tsx` before `6 / 6 / 0 / 0` → after `6 / 6 / 0 / 0` (unchanged).
  - `git diff` on both files shows only the intended hunks.
- **Covering test:** `tests/ui/i18n.test.ts` (structural parity of the two tables) — the
  wording itself is prose with no numeric pin.

### 4 — `setGeneration` left `ampAp` on a non-EHT AP · DONE
- **New** `src/editor/planOps.ts:208-225` — `generationPatch(n, gen)`, the pure node-patch
  computation lifted out of the component, now also returning
  `ampAp: gen === 'eht' ? n.ampAp : undefined` (mirroring the `linkId` handling).
- `src/editor/FloorPlanEditor.tsx:214-216` — `setGeneration` is now
  `updateNode(n.id, generationPatch(n, gen))`; the unused `FeatureFlag` import was dropped
  (`:3`) and `generationPatch` imported (`:13`).
- **Covering tests** in `tests/editor/planOps.test.ts` › `generationPatch`:
  - "an AMP lab round-trips through JSON unchanged" — an EHT AP with `ampAp` plus a tag
    parses and survives `scenarioToJson`/`scenarioFromJson`.
  - "switching the polling AP off Wi-Fi 7 drops ampAp, so the scenario stays loadable" —
    the patched AP has no `ampAp`, the whole scenario still parses, and the JSON round-trip
    confirms it; also checks the config does not come back by itself on the way to `eht`.
  - "drops a link the new generation cannot use, and keeps the flags it can" — the
    pre-existing `linkId` behaviour is now pinned too.

### 5 — Tag boundary case in `onAck` · DONE
- `src/engine/ampSta.ts:95-105` — `ackFor >= r.slot` is tested **first** (→ `giveUp()`),
  the `acksSeen === r.slot - 1` arming second, with a comment explaining why.
- **Covering test:** `tests/engine/amp-sta.test.ts` › "a tag that missed its own cue stays
  silent when the Ack that closes its slot arrives" — t1 is due in slot 4, never hears
  Ack 1, then receives Ack 2/3/4; asserts no `TX_START`, exactly one
  `AMP_RESULT { slot: 4, sent: false, acked: false }`, and that its timestamp is the end of
  Ack 4 (so the Ack, not the round's end timer at `trigEnd + 2_538_000`, closed it).
- **Verified the test reproduces the bug**: with the two branches swapped back, that test
  fails (`expected 1 to be +0` on the `TX_START` count); restored and green.
- **Knock-on, worth reading:** this changed one measured number in lesson 3's second
  "try this". The stray late response used to perturb the no-protection / camera-moved run.
  With it gone the run yields 33 `AMP_RESULT` records instead of 35, i.e. **seven** rounds in
  which a tag never answers, not five.
  - `src/course/amp/amp-coexist.ts:169` — "five rounds" → "seven rounds" (en) and
    "五个轮" → "七个轮" (zh). Word count unchanged.
  - `tests/course/amp-coexist.test.ts:524-526` — `toBe(33)` and `2 * ROUNDS - 33 === 7`.
  - The other pins in that test (0 collisions, 26 acked, 7 acked in the base NONE variant)
    were unaffected, and `tests/engine/lesson-hashes.test.ts` is untouched: this is a
    try-this variant scenario, not a lesson scenario.

### 6 — Inspector rendered raw `'random'`/`'scheduled'` and English "slot" · DONE
- `src/ui/i18n.ts:109` — `ampPhase: Record<'random' | 'scheduled', string>` added to the
  `inspector` interface.
- `src/ui/i18n.ts:338` (en) `{ random: 'random access', scheduled: 'scheduled' }`;
  `:657` (zh) `{ random: '随机接入', scheduled: '调度' }`.
- `src/ui/Inspector.tsx:78` — `{L.ampPhase[nv.ampRound.phase]} · {L.slot} …`.
- **Covering test:** `tests/ui/i18n.test.ts` (the two tables must have the same shape) plus
  `npx tsc -b` (the new required field).

### 7 — `AmpApRound.stats` was unread engine state · DONE
- `src/engine/ampAp.ts` — the `stats` field and its four increments removed. That left
  `onRxFail()` an empty method, so it and its only call site
  (`src/engine/mac.ts:1220`, `this.ampRound?.onRxFail()`) were removed as well. `running`
  and `current` are still read elsewhere and stay.
- **Covering test:** `tests/engine/amp-ap.test.ts` (9 tests) and
  `tests/engine/amp-collision.test.ts` still pass; `npx tsc -b` catches any missed reference.

### 8 — `tests/engine/amp-sta.test.ts` hygiene · DONE
- Seeds pinned as literals with a documented provenance comment (file top, after `bench`):
  `SEED_SLOT1 = 1`, `SEED_SLOT2 = 3`, `SEED_SLOT3 = 10`, `SEED_SLOT4 = 2`, plus
  `SLOT_PERIOD_NS`. Found by a throwaway probe, since deleted.
- The three `for (seed …)` scans (old lines ~68-71, ~92-93, ~117-119) replaced by a single
  `bench(['t1'], SEED_*)` plus an explicit precondition
  `expect(b.recs('AMP_ABOC')[0].slot).toBe(k)`.
- The discarded link override `{ 'ap>t1': -50 }` at old line 117 removed (it was overwritten
  by the very next line). `bench`'s `links` parameter is kept — it is part of the harness.
- The two comments that named a bare seed number now name the constant.
- **New test** "a corrupted reception while a tag waits for a later slot gives the round up
  on the spot": the armed-and-waiting path (slot 3, no pending `txHandle`, state `ampWait`)
  → `AMP_RESULT { sent: false }`, no `TX_START`, and no second result from the end timer.
  The pre-existing corrupt test covers the other path (slot 1, transmission already scheduled).
- **Runtime:** 12 tests in **20 ms** (was 8 tests with three 200-iteration seed scans).

### 9 — `view.ts` gave STA/tag lanes a `null` `ampRound` · DONE
- `src/model/view.ts:509-515` — the clear is gated on `n.ampRound !== undefined`.
- **Covering tests:** `tests/model/view.test.ts` (20 tests) and
  `tests/engine/simulation.test.ts` › "snapshot + record replay reconstructs the live view
  exactly" — a structural divergence between live and replayed state would fail there.

### 10 — AMP number inputs could produce an invalid scenario · DONE
- **New** `src/editor/planOps.ts:196-205` — `clampField(raw, lo, hi, int = false)`; an empty
  or non-numeric field returns `lo` rather than `Number('') === 0`.
- `src/editor/FloorPlanEditor.tsx:694`, `:699`, `:704` — `pollIntervalMs` clamped to
  10–10 000, `slots` to 1–16 (integer), `acwe` to 0–4 (integer).
- **Covering tests** in `tests/editor/planOps.test.ts` › `clampField`: the bound/empty/NaN
  table, and "a clamped AMP config still parses" — an `ampAp` built entirely from emptied
  fields passes `ScenarioSchema`.

### 11 — schema accepted `ampTag` on a non-AMP node · DONE
- `src/model/scenario.ts:307-309` — `if (n.ampTag && n.kind !== 'amp')` issues
  "only an AMP tag node carries AMP tag settings" (contains "AMP tag").
- **Covering test:** `tests/model/scenario.test.ts` › "AMP tag settings belong to an AMP tag
  node, not to a station or an AP" — rejects it on a STA and on an AP, both `/AMP tag/`.

### 12 — redundant `corruptLast = false` in `mac.ts` · DONE
- `src/engine/mac.ts:1186-1191` — the `else` branch removed; the comment it carried was kept
  and now points at the assignment at the top of `onRxOk` that already covers it.
- **Covering tests:** `tests/engine/mac-state-ifs.test.ts`, `tests/engine/mac-nav.test.ts`,
  `tests/engine/amp-ap.test.ts`, `tests/engine/link-2g.test.ts` (EIFS/AIFS behaviour).

### 13 — Guide's timeline paragraph attributed both marks to the AP's lane · DONE
- Verified first: `AMP_SLOT` is emitted with `node: this.deps.nodeId` (the AP) and
  `TimelineStrip.tsx:240-254` draws the tick on that node's lane, while the labelled span
  comes from the tag's own `ampWait` `MAC_STATE` via `laneLayout.ts:353`.
- `src/ui/Guide.tsx:121-122` (en) — "The AP's lane carries a thin tick at every slot
  boundary; each tag's own lane carries the labelled span it spends armed and waiting for
  its turn."
- `src/ui/Guide.tsx:245-247` (zh) — the same split; the zh text also no longer claims the
  span is labelled with a slot number (the label is "等待自己的时隙 · <duration>").
- Curly-quote census on `Guide.tsx` unchanged (`6 / 6 / 0 / 0`).

### 14 — study-time CAUTION headers · DONE
- `src/course/amp/amp-intro.ts:8-13` and `src/course/amp/amp-coexist.ts:11-16`, in the same
  wording as `amp-slots.ts`, with each lesson's real headroom measured (throwaway probe,
  since deleted): intro **2014** words, 11 from the 2025-word ceiling → "~10 words";
  coexist **1981** words, 44 from it → "~45 words". (slots: 1995, 30 → its existing
  "~25 words" is still right.)
- **Covering test:** each lesson's own "the computed study time follows the formula and stays
  inside the 15–25 minute target".

### 15 — README "Known simplifications" · DONE
- `README.md:66` — a Wi-Fi radio receives a DL AMP PPDU as an ordinary legacy-preamble
  reception, defers for the L-SIG length and then uses AIFS, not EIFS; the lesson-3
  coexistence numbers rest on it.

### Leave list
`onAmpDone` → `endTxop()`, the `usig` segment key name, the AP counting a data frame
delivered during a round without acknowledging it, and `AMP_RESULT { sent: false }` counting
as lost were all left exactly as they were.

---

## Commands run

| command | result |
| --- | --- |
| `npx vitest run` (first full pass) | 1 failed / 752 passed — `amp-coexist` try-this expected 35 results, got 33; this is the knock-on of finding 5, fixed in prose + pin (see above) |
| `npx vitest run tests/engine/amp-sta.test.ts` | 12 passed (20 ms) |
| `npx vitest run tests/editor/planOps.test.ts tests/model/scenario.test.ts` | 28 passed |
| `npx vitest run tests/course/amp-coexist.test.ts tests/engine/lesson-hashes.test.ts tests/course/lessons.test.ts` | 71 passed |
| `npx vitest run` (final) | **75 files, 753 tests, all passed**, 39.4 s |
| `npx tsc -b` | clean, no output |
| `npm run build` | `tsc -b && vite build` — 105 modules, built in 2.49 s (only the pre-existing >500 kB chunk-size advisory) |

`tests/engine/lesson-hashes.test.ts` passed unmodified throughout — no lesson scenario
changed in this wave.

## Probe files

Two throwaway vitest files were created and **deleted** before the commit:
`tests/course/__probe.test.ts` (lesson word budgets) and `tests/engine/__probe.test.ts`
(seed → slot scan). `git status` is clean of them.

## Commits

`9c58e1e` — `fix(course,ui): lesson-2 RSSI with the 2.4 GHz offset, active-Tx wording, editor and tag boundary fixes`

**One commit, not two.** The suggested second commit (`chore(test): shared RSSI helper,
pinned seeds, schema guards`) cannot be split off and still leave both commits green in
either order: `tests/course/rssi.ts` is what `amp-slots.test.ts` uses to assert the corrected
numbers, `tests/editor/planOps.test.ts` needs `generationPatch`/`clampField`,
`tests/model/scenario.test.ts` needs the new `superRefine` branch, and
`tests/engine/amp-sta.test.ts` carries both the seed pinning and the regression test for the
`onAck` fix in one file. The single commit's body enumerates all 15 items.

## Deviations / things to know

1. **Attribution line.** The findings file asks for
   `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The session's own attribution
   reminder — which supersedes earlier attribution guidance and names the model that actually
   did the work — gives `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
   I used the latter. The `Claude-Session:` line is identical either way. Say the word and I
   will amend it to the findings-file spelling.
2. **One number changed beyond the findings list**: lesson 3's "five rounds" → "seven
   rounds" (EN + ZH) with its test pin, forced by the finding-5 engine fix. Detailed above.
3. **`onRxFail` removed entirely** rather than left as an empty method after `stats` went,
   together with its single call in `mac.ts`. Finding 7 said "remove any references"; this is
   the reading that leaves no dead code, but it is one line of `mac.ts` beyond the literal text.
4. **`clampField` and `generationPatch` live in `planOps.ts`**, not in the component, so both
   are unit-testable — as finding 4 explicitly suggested for the generation patch. `clampField`
   followed it there for the same reason.
