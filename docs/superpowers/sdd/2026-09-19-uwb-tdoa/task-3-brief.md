### Task 3: UL-TDoA, overlay method handling, editor fields

**Files:** modify `src/uwb/device.ts`, `src/uwb/network.ts`, `src/uwb/view.ts` (`of` routing), `src/uwb/scene.ts` (no rings for TDoA fixes; fix + ellipse only), `src/uwb/ui/UwbSessionFields.tsx`, `src/ui/i18n.ts`; tests `tests/uwb/network.test.ts` (+4), `tests/uwb/scene.test.ts` (+1), `tests/editor/*` (+1).

Behaviour: tag k sends its blink at slot 0 of round k; every anchor timestamps it; the network converts each anchor's arrival to the common timebase as `trueArrivalNs + gaussian·tsNoisePs/1000 + syncErr_i` (model wired sync; `syncErr_i ~ N(0, syncErrorNs)` drawn once per anchor); anchor 0 emits `UWB_TDOA { node: anchor0, ref: anchor0, peer: anchor_i, …, of: tag }` and `UWB_POSITION { node: anchor0, method: 'ul-tdoa', of: tag }`; the view applies an `of` position to the `of` node's lane (and counts it there); the overlay draws fix + ellipse at the tag for `dl-tdoa`/`ul-tdoa` (no rings). Editor: mode select (TWR / DL-TDoA / UL-TDoA), clock-correction checkbox (DL), sync error ns (UL) — EN/ZH; `uwbSessionIssue` continues to come from the schema.

- [ ] Tests: ten tags in ten slots, four anchors: a position per tag per block on the tag's lane; error within 4σ (pin values); with `syncErrorNs: 1` the error grows (pin); blink is 14 octets and 181 218 ns; tags transmit exactly once per block; overlay: no rings, one fix + ellipse per tag; editor fields round-trip.
- [ ] Commit `feat(uwb): UL-TDoA blinks with synchronised anchors; TDoA fixes in the overlay and editor`.

---

