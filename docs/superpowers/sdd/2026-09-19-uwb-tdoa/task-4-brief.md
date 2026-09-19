### Task 4: Lesson "Listen-only positioning" (DL-TDoA)

**Files:** create `src/course/uwb/uwb-dl-tdoa.ts`, `tests/course/uwb-dl-tdoa.test.ts`; modify `src/course/lessons.ts`, `lessonKit.ts` (`firstUwbTdoa`, `firstUwbBlink`); fixture additions only.

Lesson (`id 'uwb-dl-tdoa'`, module 14): lesson-5's corner anchors, three tags at different spots, `mode: 'dl-tdoa'`; variants "Clock correction off" / 关闭时钟修正 and "Ten tags" / 十个标签 (ten listeners — the round is unchanged). Body: source sentence (§10.29.1.2.5 second case: synchronised nodes broadcast, the mobile compares arrivals; FiRa-style message content and the correction are model); the round the anchors run; what the tag hears and computes (the rate ratio r, the per-responder Δ); the centrepiece: uncorrected error in metres vs corrected in decimetres (pin both); the geometry: hyperbolic GDOP vs TWR's (pin GDOP at the three tag spots from both solvers); scale and privacy (no uplink; ten tags cost the anchors nothing — pin airtime identical). 4 observe + 2 tryThis + 3 quiz; ≤ 25 min.

- [ ] Commit `feat(course): UWB lesson "Listen-only positioning"`.

---

