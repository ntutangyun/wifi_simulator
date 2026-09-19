# Task 2 review — DL-TDoA devices and network (88ed935..d398c67)

Reviewed: `task-2-brief.md`, `docs/superpowers/sdd/2026-09-19-uwb-tdoa/task-2-report.md`,
`task-2-review.diff` (two commits: 4b14529 and the follow-up d398c67), and the files at HEAD.
Spec: Slice 5 DL-TDoA in `docs/superpowers/specs/2026-09-19-uwb-slices-design.md`;
`src/uwb/position.ts` (`solveTdoa`), `src/uwb/session.ts`.

The working tree was clean of Task 3's edits at review time, so every file below was read at
d398c67 rather than through the diff alone.

## Verdict

Spec: APPROVED
Quality: APPROVED

## Commands

- `npx vitest run tests/uwb tests/ui/uwb-format.test.ts tests/engine/lesson-hashes.test.ts`
  → 14 files, **184 tests, all passing** (exit 0). `tests/engine/lesson-hashes.test.ts` green,
  i.e. `tests/fixtures/lesson-hashes.json` is untouched and no course run moved.
- `npx tsc -b` → clean, exit 0, no output. No errors in Task 3's files either (they were not
  yet modified in the tree).

## Binding constraints — checked one by one

1. **Anchor 0 runs the round.** `slotAction` (session.ts:79–87) gives slot 0 to anchor 0's Poll,
   slots 1…N−1 to anchor i's Response, slot N to anchor 0's Final. `transmitDl` (device.ts:615)
   puts anchor 0's TX counter in the Poll (`rxCounters: {}`), the responder's TX counter +
   its RX-of-Poll counter + `coffs` in the Response, and anchor 0's TX counter + its RX counter
   per Response in the Final. Pinned by the "carries each sender's own times, and only those"
   test, including the Poll's empty `rxCounters`, the Response's single `anc-1` key, the
   `['RRMC','TXT','RXT','COFF']` IE list and the absence of `replyRctu`/`finalTimes`.
2. **Tags listen only.** `onDlSlot` (device.ts:265) has exactly one branch for a tag —
   `listenFor` — reached before any `txId === this.id` test, so there is no code path from a tag
   to `transmitFor` in this mode; the report's claim that this is a property of the code and not
   of the schedule holds. Pinned by
   `expect(of(rs,'TX_START').some(r => r.node.startsWith('tag-'))).toBe(false)` over three blocks.
3. **Rate ratio in anchor 0's own timebase.** device.ts:365–367:
   `rate = counterDiff(rxFinal, rxPoll) / counterDiff(txFinal, txPoll)`.
   Algebra: a device with fractional rate error `e` accumulates `T·(1+e)` counts over true
   duration `T`. The tag's two arrivals are separated by the same true interval as anchor 0's
   two transmissions (same propagation path, static tag), so the numerator is `T_PF·(1+e_tag)`
   and the denominator `T_PF·(1+e_0)`; `rate = (1+e_tag)/(1+e_0)`. Dividing
   `counterDiff(rx_i, rx_0) = Δt_arr·(1+e_tag)` by it gives `Δt_arr·(1+e_0)` — **e_tag removed
   exactly** (not merely to first order, because both intervals scale by the identical factor),
   and **e_0 cancels** because `txOffset_i` is already in anchor 0's units. Empirically pinned
   twice: anchor 0 alone at +20 ppm reproduces the baseline maxima `0.22 / 0.40 / 0.57` m to the
   centimetre, and all four anchors at +20 ppm do the same.
4. **`txOffset_i = tof(a_0→a_i) + replyTime_i·(1 − coffs_i)`** — device.ts:375–376, with
   `replyTime_i = counterDiff(txResp_i, rxPoll_i)` taken from the Response's own two counters
   (device.ts:746) and `tof` from `geometry.anchorPos`, i.e. the surveyed baseline.
5. **`Δ_i = counterDiff(rx_i, rx_0)/r − txOffset_i`** — device.ts:377, times `RCTU_NS` for `dtNs`.
   Correction off → `rate = 1` (device.ts:365).
6. **Sign convention of `coffs_i` — verified, and it is right.**
   `coffs` at a receiver is `(txPpm − myPpm)·1e-6` (device.ts:455), i.e. `e_tx − e_rx`. Anchor i
   measures the Poll, so its raw estimate is `e_0 − e_i`. Converting `replyTime_i` (anchor i's
   units) into anchor 0's units needs the factor `(1+e_0)/(1+e_i) ≈ 1 + e_0 − e_i`, so the
   consumer's `(1 − coffs_i)` requires `coffs_i = e_i − e_0` on the wire. **device.ts:718 stores
   `dl.coffsToRef = -coffs`**, which is exactly that negation, and the field's doc comment
   ("its ppm minus the reference's") matches. This is the same operation `ssTwrCorrected` does —
   there the receiver's own `coffs = e_anchor − e_tag` and `(1 − coffs) = 1 + e_tag − e_anchor`
   converts the responder's reply into the initiator's timebase — only with anchor 0 in the
   initiator's place, which is why the negation is needed and the brief's literal reading
   (`coffs_i = e_0 − e_i` fed straight into `(1 − coffs_i)`) would have been the
   wrong-direction, factor-of-two error. The measured errors confirm it in **both** directions:
   - responders at +20 / −20 / +13 ppm with a 0 ppm reference stay inside `3σ` (the opposite
     sign would give `2·ppm·replyTime` ≈ 24 / 48 / 72 m);
   - reference at +20 ppm with 0 ppm responders (`coffs_i = −20 ppm`) reproduces the baseline
     maxima exactly.
7. **`UWB_TDOA` per responder** — device.ts:380–383, one record per responder actually heard,
   skipping the reference (`dl.responses` can never hold anchor 0; the loop `continue`s on a
   missing entry, device.ts:373). Nine per tag over three blocks, `ref === 'anc-1'` throughout,
   peers in slot order — pinned.
8. **`solveTdoa(..., √2·rangeSigmaM)` → `UWB_POSITION { method: 'dl-tdoa' }`** — device.ts:385–401,
   with the approximation documented in the code comment, in `i18n.uwb.ellipseHintTdoa` (EN+ZH)
   and in the inspector's `title` on the ellipse row of a non-TWR fix.
9. **`UWB_POSITION.method` required everywhere, existing emitters at 'twr'** — records.ts:32 makes
   it required; `solveFix` sets `'twr'` (device.ts:331); `tests/course/uwb-position.test.ts`,
   `tests/ui/uwb-format.test.ts`, `tests/uwb/view.test.ts` and `tests/uwb/inspector-rows.test.ts`
   literals all updated; `tsc -b` clean, which is what proves no emitter was missed.
10. **`UWB_ROUND.mode` and a mode-aware log line** — records.ts:24, device.ts:215,
    `roundName()` in uwb/format.ts prints `SS-TWR`/`DS-TWR` for two-way and `DL-TDoA`/`UL-TDoA`
    for one-way. Both forms pinned in `tests/ui/uwb-format.test.ts`. This closes the Task-1
    review note that a DL round would otherwise have been logged as "DS-TWR".
11. **View `tdoa` map and `position.method`** — view.ts:62–68, 103–116, 121–130, plus
    `initUwbNodeView`. The reducer keeps the latest per peer with a round count; pinned.
12. **Inspector rows EN/ZH** — `uwbTdoaRows` + `uwbFixRow(p, S)` in ui/rows.ts, the table and the
    "solved from" row in `UwbInspector.tsx`, and `uwb.tdoa` / `uwb.tdoaHint` / `uwb.methodLabel` /
    `uwb.method` (all four methods) / `uwb.ellipseHintTdoa` in both language tables. The ZH
    strings are genuine translations, not English pass-throughs. Pinned in both languages.
13. **Missed Poll/Final → no TDoA that round** — device.ts:357 requires all four of
    `rxPoll`/`rxFinal`/`txPoll`/`txFinal`; a Response missing its `dl` payload or the reference's
    RX counter drops that responder only (device.ts:741–743). See finding 3 for the test gap.
14. **Per-round state cleared** — `freshRound` builds a new `DlRoundState` (fresh `Map`, fresh
    `rxResp`) on every `beginRound`, which the network calls at slot 0 for the whole crowd
    (network.ts:127). Nothing from one round can survive into the next, on the tag, the
    responders or anchor 0.
15. **RX of frames not addressed to the tag** — in DL-TDoA every frame is broadcast: the Poll and
    Final carry `dst: '*'`, and `transmitDl` passes `'*'` as the Response's destination
    (device.ts:643). So the tag never accepts a unicast that is not its own, and no
    mode-conditional relaxation of addressing was needed anywhere. `onRxOk`'s acceptance is
    governed entirely by the slot's `Expectation` (sender + kind), unchanged.
16. **Anchors do not accidentally compute TWR ranges** — `onRxOk` branches to `onDlRx` before the
    two-way switch (device.ts:460–463), so `onResponse`/`onFinal`/`onReport` — the only callers of
    `reportRange` — are unreachable in this mode; `endRound` returns early for a non-tag; and
    `onDlSlot` keeps a responder's receiver off for every frame but the Poll (and anchor 0's off
    for everything but the Responses). Pinned by `expect(of(rs,'UWB_RANGE')).toEqual([])`.
17. **Noise-draw order still documented / determinism** — the diff adds **no** `gaussian(`,
    `rng.` or `Math.random` call anywhere in `src/` (verified by grep over the two commits), so
    the per-node stream order is untouched: two Gaussians per reception (timestamp, then carrier
    offset), the contention draw still last. That is also why `mode: 'twr'` is byte-identical.
    Determinism pinned for both modes (`run(dl()) === run(dl())`).
18. **`mode: 'twr'` byte-identical** — pinned directly (`twr({mode:'twr', tdoaClockCorrection:false,
    syncErrorNs:4})` deep-equals the base run) *and* indirectly by the untouched lesson-hash
    fixture.
19. **No escape hatches** — no `any`, `@ts-ignore`, `@ts-expect-error` or `as unknown as` in the
    diff. The only non-null assertions are in tests, on view-state lookups, as the existing tests
    already do.
20. **Accepted deviations** — all three are the ones ruled on: the TWR position log line is the
    unmarked case and only non-TWR fixes append `(DL-TDoA)` (both pinned); `tdoaClockCorrection`
    sits on `UwbDeviceCfg` fed from `UwbSessionCfg` in network.ts:104, keeping `session.ts` out of
    the commit; correction-off yields no fix, pinned as a test with the differences quoted in
    metres.

The schema's guards for the mode (≥4 anchors for one-way, time schedule only, one round per
block, slot fit via `uwbSlotFitNs(anchors, mode)`) are Task 1's and are mirrored in
`UwbNetwork`'s constructor; `uwbLongestFrameBytes` sizes the DL slot for the *largest* Final, so
a round that loses responders only ever shortens its frames. Nothing here regressed.

## Findings

All five are Low. None blocks the task.

1. **(Low, doc) Stale count in `src/uwb/format.ts`'s header.** Line 5 still reads "fmtRecord
   simply delegates the eight UWB types here" while the sibling comment in `src/ui/format.ts:70`
   was updated in this commit from "ten" to "eleven". The count was already stale before Task 2;
   since its twin was corrected here, correct it too (or drop the number).

2. **(Low, precision/doc) `tofRctu` is in true-time RCTU, not anchor 0's counter units.**
   `device.ts:375` computes `tofRctu = dist / C_M_PER_NS / RCTU_NS`, while the rest of
   `txOffsetRctu` (`replyTime·(1 − coffs)`) and the dividend (`counterDiff(...)/rate`) are in
   anchor 0's units. The exact value would be `tof·(1 + e_0)`, so the residual is `tof·e_0` —
   about 0.2 mm at 20 ppm over a 30 m baseline, orders of magnitude below the 12 cm/slot
   clock-offset residual, and invisible in every test. It is the one place where the comment's
   "the whole computation is in anchor 0's units" is not literally true. A half-line note would
   save the next reader re-deriving it; no code change needed.

3. **(Low, test gap) The brief's "a tag that misses the Poll or the Final produces no TDoA that
   round" is not pinned.** Only the missed-*Response* half is tested (the `far` scenario, where
   `anc-4` never hears the Poll and the tag's slot-3 deadline reports it). The guard at
   device.ts:357 is correct by inspection and the path is reachable in practice (a wall, or
   `UWB_INTERFERED` from the 6 GHz Wi-Fi link), so it deserves a test — e.g. reuse the existing
   coexistence scenario in DL mode, or put a wall between anchor 0 and one tag.

4. **(Low, behaviour/doc) With `tdoaClockCorrection: false`, `txPoll`/`txFinal` are still
   required.** device.ts:357 gates on all four instants even though `rate = 1` needs none of
   anchor 0's. The effect is that correction-off and correction-on drop exactly the same rounds,
   which is arguably the right choice (an incomplete round is incomplete either way, and it keeps
   the lesson's two variants comparable round for round) — but it is an unstated one. One
   sentence above the guard would settle it.

5. **(Low, UX) The inspector's time-differences table never names the reference anchor.**
   `UWB_TDOA.ref` is dropped by the reducer (`UwbTdoaView` is `{ dtNs, trueDtNs, n }`), and the
   table's header is `peer / measured / true / error / rounds`; `uwb.tdoaHint` explains what the
   rows are relative to but cannot name it, so a learner reading "anc-2 · −8.24 ns" has no
   on-screen way to tell it is against `anc-1`. Carrying `ref` on `UwbTdoaView` (it is constant
   per node, so a single field beside the map would do) and showing it in the table's caption
   would close it. The brief only asked for a "per-peer Δ table", so this is a suggestion, not a
   miss.

## Note for the lesson tasks (4 and 5)

The report's two carry-forwards are worth repeating here because they change what a lesson can
claim: the correction-off variant produces **no fix at all** (the differences are geometrically
impossible), so it must quote the differences in metres — 12.20 / 24.28 / 36.50 m — rather than a
position error; and the fix ellipse (~2 cm) is an order of magnitude smaller than the actual error
(~40 cm), because the clock-correction residual is not in σ. Both are now stated in the inspector
hints, and any lesson that shows the ellipse should repeat the second one.
