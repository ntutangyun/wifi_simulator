### Task 5: Lesson "One blink per tag" (UL-TDoA)

**Files:** create `src/course/uwb/uwb-ul-tdoa.ts`, `tests/course/uwb-ul-tdoa.test.ts`; modify `src/course/lessons.ts`; fixture additions only.

Lesson (`id 'uwb-ul-tdoa'`, module 14): corner anchors, ten tags, `mode: 'ul-tdoa'`; variant "1 ns of sync error" / 1 ns 的同步误差 (`syncErrorNs: 1`). Body: source sentence (§10.29.1.2.5 first case: blinks to synchronised fixed nodes; wired sync and the 14-octet blink are model); one 181 µs blink per tag per 200 ms (pin the airtime and duty); positions on the infrastructure side (the anchor-0 lane emits, the tag's lane shows); what perfect sync buys: 1 ns of per-anchor sync error is 30 cm of pseudo-range (pin the position error growth); a block holds 100 tags at 2 ms slots (pin from the plan). 4 observe + 2 tryThis + 3 quiz; ≤ 25 min.

- [ ] Commit `feat(course): UWB lesson "One blink per tag"`.

---

