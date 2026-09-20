### Task 2: Lesson "One anchor is enough"

**Files:** create `src/course/uwb/uwb-aoa.ts`, `tests/course/uwb-aoa.test.ts`; modify `src/course/lessons.ts`, `lessonKit.ts` (`firstUwbAoa`); fixture additions only.

Lesson (`id 'uwb-aoa'`, module 14): one anchor at (5, 0.5, 2.2) with `yawDeg: 90` (facing +y into the room), a tag; variants place the tag at boresight 2 m (5, 2.5), 45° at 4 m (7.83, 3.33), 70° at 6 m (10.64, 2.55 — outside the 10 m room: use 60° at 6 m = (10.2, 3.5)… choose points inside `oneRoom()`; compute exact coordinates so the true angle is what the prose says), DS-TWR, `aoa: true`, channel 9; a fourth variant "Behind the anchor" / 锚点背后 (tag at (5, −0.2)? outside; instead yaw 270 facing the wall with the tag in the room → mirrored). Body: source (AoA in §10.29.1.1's ranging results is standard; PDoA, λ/2, σ_φ are model / FiRa-style); the two antennas and the phase difference formula; the angle error σ_θ growing with |θ|; range + angle = one-anchor fix, with the cross-range error r·σ_θ vs the 2 cm range error (pin at the three points); the ellipse's orientation; the mirror ambiguity and yaw. 4 observe + 2 tryThis + 3 quiz; ≤ 25 min.

- [ ] Commit `feat(course): UWB lesson "One anchor is enough"`.

---

