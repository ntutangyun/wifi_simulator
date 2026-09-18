### Task 5: Lesson 4 "Blocks, rounds and slots"

**Files:**
- Create: `src/course/uwb/uwb-blocks.ts`; modify `src/course/lessons.ts`; regenerate the hash fixture (additions only)
- Test: `tests/course/uwb-blocks.test.ts`

Lesson (`id 'uwb-blocks'`, `module 12`, title "Blocks, rounds and slots" / 块、轮与时隙):

- Scenario: `oneRoom()`, four anchors on lesson 2's 3.50 m ring around (5, 4) at z 2.2, three tags at z 1.0: `uwb-1` (5, 4), `uwb-2` (3, 2.5), `uwb-3` (7.5, 6); DS-TWR, defaults (block 240 000 RSTU, slot 2 400 RSTU), nlos off, ppm drawn (undefined). Variant: `slotRstu: 600` ("0.5 ms slots" / "0.5 ms 时隙").
- Body: source sentence (§10.32.2 block/round/slot, RSTU §10.29.1.5; FiRa's 2 ms / 200 ms; model numbers); the block picture (`table`: block 200 ms = 240 000 RSTU, round 10 slots = 20 ms, 10 rounds per block, tag k in round k); the ARC IE (block/round/slot durations) and the RDM IE (slot assignment) in the poll; transmission at the slot boundary (transmission offset 0); the radio-on argument (a tag listens and transmits only in its own round: 20 ms of 200 ms = 10 %; the anchors are on for every round that has a tag: 60 ms = 30 %); why the slot is 2 ms when the longest frame is 236.6 µs (receiver processing, the FiRa margin); the 0.5 ms variant (round 5 ms, radio-on 2.5 %, the slot-fit rule that stops you below 237 µs).
- Pinned: `UWB_ROUND` at 0 / 20 / 40 ms and 200 / 220 / 240 ms; `UWB_ROUND_END` at 20 / 40 / 60 ms; a poll's `TX_START.t` equals its slot start exactly; `roundPlan` numbers; the tag's radio-on share computed from its MAC_STATE spans (`uwbWait`/`rx`/`tx` time over the block) = 10.0 %, anchors 30.0 %; the variant's 2.5 %; the schema rejects `slotRstu: 282` (235 µs) with four anchors and accepts 300… no: accepts 285? Compute from `uwbPpduNs(uwbFinalBytes(4)) + 200 = 236 803 ns` → minimum slot 285 RSTU (237 500 ns); pin that boundary; a `UWB_POSITION` for each tag every block.
- 4 observe, 2 tryThis (the variant; delete one anchor in the editor and read the new slot count — an editor-referencing experiment is allowed now), 3 quiz.

- [ ] **Steps:** measure first, test, lesson, register, regenerate hashes (additions only), `npx vitest run`, `npx tsc -b`, `npx vite build`, commit `feat(course): UWB lesson "Blocks, rounds and slots"`.

---

