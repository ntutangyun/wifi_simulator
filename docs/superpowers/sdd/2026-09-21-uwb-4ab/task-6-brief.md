### Task 6: Lesson "The narrowband radio shares 6 GHz too"

**Files:** create `src/course/uwb/uwb-nba.ts`, `tests/course/uwb-nba.test.ts`; modify `src/course/lessons.ts`; fixture
additions only.

- [ ] Lesson per spec "uwb-nba" (scene, four variants, body, 4 / 2 / 3, ≤ 25 min); every number pinned: NB channel
  centres and which of the four lie inside 6 265–6 345 MHz, the −71.02 dBm threshold and the 8.6 m crossing, blocks
  lost per scene and fixes per scene, the block → channel mapping replayed from `nbChannelForBlock`, the router's
  deferrals / busy time during NB frames (count from the Wi-Fi records), the No-LBT variant's `RX_FAIL lowSinr` NB
  losses, the −62 dBm radius ≈ 15 m.
- [ ] Commit `feat(course): UWB lesson "The narrowband radio shares 6 GHz too"`.

---

