### Task 9: Lesson 2 "The clock inside the reply time"

**Files:**
- Create: `src/course/uwb/uwb-sstwr.ts`; modify `src/course/lessons.ts`; regenerate `tests/fixtures/lesson-hashes.json` (additions only)
- Test: `tests/course/uwb-sstwr.test.ts`

Lesson (`export const uwbSstwr: Lesson`, `id: 'uwb-sstwr'`, `module: 11`):

- Scenario `uwbSstwrScenario(ppm: { tag: number; anchors: number })`: `oneRoom()` (a 10 × 8 m lab with brick walls on its boundary); tag `uwbTag('tag-1', 'Phone', 5, 4, 2.2, ppm.tag)` at the centre; four anchors on a 3.50 m ring, all at z 2.2 so every true distance is exactly 3.50 m: `anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2, ppm.anchors)`, `anchor-2` at (5, 7.5), `anchor-3` at (1.5, 4), `anchor-4` at (5, 0.5). Base: `{ tag: 10, anchors: -10 }`; variants: `{ tag: 0, anchors: 0 }` ("Perfect crystals" / "理想晶振") and `{ tag: 1, anchors: -1 }` ("TCXOs, ±1 ppm" / "±1 ppm 的温补晶振"). Session `{ method: 'ss', nlos: false }`.
- Body: (1) sources sentence; (2) "Treply is measured by the other clock": the raw formula's error `Tprop·eA + ½·Treply·(eA − eB)` derived in a `formula` block; (3) why anchor 4's error is four times anchor 1's: Treply_i = i × 2 ms − Tprop; a `table` of expected raw errors 6.0 / 12.0 / 18.0 / 24.0 m; (4) the standard's answer: the receiver estimates the transmitter's clock rate from the preamble/STS (ranging tracking offset and interval, §10.29.1.6) and the corrected formula `(Tround − Treply·(1 − Coffs)) / 2`; (5) what remains: `½·Treply·σ_cfo` = 0.2 ns per ms of reply at 0.2 ppm; (6) the FoM byte (97 % within 0.5 ns) and what it is for.
- `jumps`: poll, first response, the first `UWB_RANGE`, the fourth `UWB_RANGE` (a predicate counting ranges is fine: write it inline with a closure counter reset per `find` array? No: `find` must be pure. Use `(r) => r.type === 'UWB_RANGE' && r.peer === 'anchor-4'`).
- `observe` (4), `tryThis` (2: the 0 ppm variant; the TCXO variant), `quiz` (3).

- [ ] **Step 1: Write the failing test** `tests/course/uwb-sstwr.test.ts`: shape rules as Task 8; per anchor i (1–4) in the base run: `rctuToMetres(tofRawRctu) − trueDistM` within ±0.15 m of `0.5 × (i × 2_000_000 − metresToNs(3.5)) × 20e-6 × C_M_PER_NS`; corrected error `|distM − trueDistM| < 0.15` (3σ_r plus the ½·Treply·σ_cfo term is under 0.15 m for every slot); the 0 ppm variant: raw error < 0.15 m for every anchor; the TCXO variant: raw errors ≈ i × 0.60 m ± 0.15; the prose's table numbers equal `(i × 6.0).toFixed(1)` rounded from the formula (assert the four quoted strings appear in the table block).
- [ ] **Step 2–4:** as before (hash fixture additions only). **Step 5: Commit** `feat(course): UWB lesson "The clock inside the reply time"`.

---

