### Task 2: DL-TDoA devices and network

**Files:** modify `src/uwb/device.ts`, `src/uwb/network.ts`, `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/uwb/ui/rows.ts`, `src/uwb/ui/UwbInspector.tsx`, `src/ui/i18n.ts`; tests `tests/uwb/network.test.ts` (+6), `tests/uwb/view.test.ts` (+2), `tests/ui/uwb-format.test.ts` (+2).

Behaviour:
- Anchor 0 (the first anchor in scenario order) sends the poll at slot 0 with its TX counter; anchor i (1…N−1) at slot i sends a response carrying its TX counter, its RX counter of the poll and its clock-offset estimate `coffs_i` to anchor 0; anchor 0 sends the Final at slot N with its TX counter and RX counters of the responses.
- Every tag listens to slots 0…N (never transmits). It records `rx_0` (poll), `rx_i`, `rx_F` (final) on its own clock. Rate correction: `r = (rx_F − rx_0)_tag / (N · slotNs / RCTU_NS)` (the true poll-to-final interval in anchor 0's timebase is exactly N slots; the flight time is common to both and cancels). For each responder: `txOffset_i = tof(a_0 → a_i) + replyTime_i · (1 − coffs_i)` where `replyTime_i = (txResp_i − rxPoll_i)` on anchor i's clock (both from the response) and `tof` from the known anchor positions; `Δ_i = ((rx_i − rx_0)_tag / r) − txOffset_i` in RCTU; with `tdoaClockCorrection: false` use `r = 1`. Emit `UWB_TDOA { node: tag, ref: anchor0, peer: anchor_i, dtNs, trueDtNs, block, round }` for each responder heard, then `solveTdoa` → `UWB_POSITION { …, method: 'dl-tdoa' }` (σ_r for the ellipse: `rangeSigmaM(tsNoisePs)`; state in the inspector that TDoA ellipses use the same σ as a documented approximation).
- Records: `UWB_TDOA`; `UWB_POSITION` gains `method: 'twr' | 'dl-tdoa' | 'ul-tdoa' | 'aoa'` (existing emitters set 'twr') and optional `of`; view: `UwbNodeView.tdoa: Record<peer, { dtNs; trueDtNs; n }>`, `position.method`; log lines; inspector rows (method label EN/ZH, per-peer Δ table).
- Missed frames: a tag that misses the poll or the final produces no TDoA that round; a missed response drops that anchor.

- [ ] Tests: four anchors, three listening tags, DL mode, run 3 blocks: each tag gets `UWB_TDOA` for 3 responders and a `UWB_POSITION` per block; errors (measure, pin values and a generous envelope: expect decimetres, growing with the responder's slot index); with correction off the error is metres (pin ≈ 20 ppm × slot offset × c); the tags never transmit (no TX_START from tags); determinism; `mode: 'twr'` runs byte-identical (fixture untouched).
- [ ] Commit `feat(uwb): DL-TDoA — anchor-run rounds, listening tags with clock-rate correction, hyperbolic fixes`.

---

