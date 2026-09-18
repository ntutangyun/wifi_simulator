### Task 10: Lesson 3 "Two round trips cancel the clock"

**Files:**
- Create: `src/course/uwb/uwb-dstwr.ts`; modify `src/course/lessons.ts`; regenerate `tests/fixtures/lesson-hashes.json` (additions only)
- Test: `tests/course/uwb-dstwr.test.ts`

Lesson (`export const uwbDstwr: Lesson`, `id: 'uwb-dstwr'`, `module: 11`):

- Scenario: the lesson-2 scene with `{ tag: 10, anchors: -10 }` and `{ method: 'ds', nlos: false }`. Variant: `{ tag: 20, anchors: -20 }` ("Worst-case crystals, ±20 ppm" / "最差晶振，±20 ppm").
- Body: (1) sources; (2) the three-message DS-TWR exchange (Figure 10-199) as a `steps` block: poll, response, final, report — who measures which of the four times; (3) `formula` block with the DS formula and the sentence that reply times need not be symmetric; (4) the price: 2N + 2 = 10 slots = 20 ms against SS-TWR's 5 slots, a `table` of the round's frames with octets and airtime (poll 39 / 206.86 µs, response 14 / 181.22 µs, final 62 / 236.60 µs, report 24 / 191.47 µs) and the round's total airtime (39 + 4×14 + 62 + 4×24 octets … sum the four airtimes: 206.86 + 4×181.22 + 236.60 + 4×191.47 = 1 934.23 µs of 20 000 µs); (5) who computes: the anchor after the Final, the phone after the report, the same number twice in the log; (6) what DS-TWR does not fix: timestamp noise (100 ps) and NLOS bias, pointing to lesson 5.
- `jumps`: poll, final (`firstUwbFinal`), first report, first `UWB_RANGE` on an anchor lane, first `UWB_POSITION`.
- `observe` (4), `tryThis` (2), `quiz` (3).

- [ ] **Step 1: Write the failing test** `tests/course/uwb-dstwr.test.ts`: shape; the round has 10 slots and `UWB_ROUND.untilNs === 20_000_000`; the frame table numbers from `phy.ts` (`uwbPollBytes(4) === 39`, `uwbPpduNs(39) === 206_859`, …); the round's total airtime equals the sum of `TX_START.frame.txTimeNs` in the first round = 1 934 230 ns (206 859 + 4·181 218 + 236 603 + 4·191 474); every tag-lane `UWB_RANGE` error `< 0.15 m` in both the base and the ±20 ppm variant; each anchor-lane range equals the tag-lane range for the same pair to within 1e-9 m (same four counters); a `UWB_POSITION` within 0.2 m of the truth.
- [ ] **Step 2–4:** as before. **Step 5: Commit** `feat(course): UWB lesson "Two round trips cancel the clock"`.

---

