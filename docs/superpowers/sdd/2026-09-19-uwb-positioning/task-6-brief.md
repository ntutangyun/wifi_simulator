### Task 6: Lesson 5 "From four ranges to a point"

**Files:**
- Create: `src/course/uwb/uwb-position.ts`; modify `src/course/lessons.ts`; regenerate the hash fixture (additions only)
- Test: `tests/course/uwb-position.test.ts`

Lesson (`id 'uwb-position'`, `module 12`, title "From four ranges to a point" / 从四个距离到一个点):

- Scenario: `oneRoom()`, anchors in the four corners at (0.5, 0.5), (9.5, 0.5), (0.5, 7.5), (9.5, 7.5), z 2.2; tag `uwb-1` at (4, 3.5, 1.0); DS-TWR, nlos on, ppm drawn. Variants: "A brick wall in one path" / 一堵砖墙挡住一条路径 — a brick segment `brick(2, 1.5, 2, 3)` between the tag and anchor (0.5, 0.5) only (verify with `wallsCrossed` that exactly that pair crosses it); "Three anchors" / 三个锚点 — drop the (9.5, 7.5) anchor.
- Body: source sentence (§10.29.1.7 FoM; the solver, GDOP and ellipse are model); trilateration as least squares (the residual, the Jacobian rows as unit vectors); the rings in the scene; GDOP at the tag's spot (quote the engine's value); the error ellipse (1-σ; drawn 3×); what a wall does: a 2.0 ns excess delay = 0.60 m on that one range (`UWB_NLOS_NS.brick × C`), the FoM byte flips to 75 % within 12 ns, and the fix shifts by less than 0.60 m in the direction away from that anchor (quote the measured shift); three anchors: GDOP rises (quote), the ellipse stretches.
- Pinned: the LOS fix error within 4σ_r·GDOP over the first N blocks (pin the measured values too); GDOP from `solvePosition` on exact ranges; the ellipse axes; the NLOS range's bias = `UWB_NLOS_NS.brick · C_M_PER_NS` = 0.5996 m ± 4σ and its FoM 0x7b, the other three 0x16; the fix shift magnitude and direction sign; the three-anchor GDOP and axis ratio; positions every block.
- 4 observe, 2 tryThis, 3 quiz.

- [ ] **Steps:** as Task 5; commit `feat(course): UWB lesson "From four ranges to a point"`.

---

