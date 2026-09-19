### Task 3: Lesson "When the controller does not know who is there"

**Files:** create `src/course/uwb/uwb-contention.ts`, `tests/course/uwb-contention.test.ts`; modify `src/course/lessons.ts`, `src/course/lessonKit.ts` (`firstUwbContend`, `firstUwbCollision`); fixture additions only.

Lesson (`id 'uwb-contention'`, module 14): six anchors on a ring around a tag at the room centre (radius 3.5 m, every 60°, all z 2.2, tag z 2.2 so ranges are exact), SS-TWR, `schedule: 'contention'`, `contentionSlots` 8 base; variants 4 slots / 16 slots (labels "4 response slots" / 4 个应答时隙, "16 response slots" / 16 个应答时隙), nlos off, ppm drawn. Body: source sentence (§10.32.2 schedule mode 0, RCPS §10.32.9.5, RCMA §10.32.9.6, the §10.32.1 NOTE about the upper layer filtering wrong results; defaults 8 / 3 and the feedback model are model); why a controller may not know its controlees; the draw and the window; the analytic model `P(uncontested) = (1 − 1/S)^(N−1)`, expected successes `N·(1 − 1/S)^(N−1)` (6 anchors: S = 4 → 1.42, 8 → 3.08, 16 → 4.35 — verify with the formula and pin), measured over 30 rounds within a stated tolerance (pin values and a 4σ binomial envelope); capture within 6 dB — with equal distances almost never, so collisions are collisions (pin the capture count); retries and sit-outs (pin a sit-out occurrence or its absence with the reason); the cost: 9 slots = 18 ms round vs 7 slots time-scheduled; when to prefer time scheduling. 4 observe + 2 tryThis + 3 quiz; `lessonMinutes` ≤ 25.

- [ ] Steps as before; commit `feat(course): UWB lesson "When the controller does not know who is there"`.

---

