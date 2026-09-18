### Task 11: Lesson `amp-slots`: ABOC, ACW and collisions

**Files:** `src/course/amp/amp-slots.ts`, `tests/course/amp-slots.test.ts`, `src/course/lessons.ts`

**Scenario:** `oneRoom()`, `ampAp` with `{ pollIntervalMs: 20, slots: 4, acwe: 2, readMode: 'inline' }`, six tags in a ring 2 m from the AP (all at the same RSSI so nothing is captured). Variants: ACWE 1 (ACW 1), ACWE 3 (ACW 7), and `readMode: 'twoPhase'` with ACWE 2.

**Claims to pin:**
1. ABOC ∈ [0, ACW] for every draw; slot = ABOC + 1 or sit-out; counts of draws per round equal the tags that decoded the trigger.
2. The analytic slot model: with M tags and ACW, a tag transmits with p = min(N, ACW+1)/(ACW+1); a slot is empty with (1 − 1/(ACW+1))^M, successful with M·(1/(ACW+1))·(1 − 1/(ACW+1))^(M−1), otherwise a collision. Over 30 rounds, the measured fractions of empty / success / collision slots are each within 0.12 of the formula (state the tolerance in the prose).
3. In a collision slot the AP's Ack names the AP (nothing received) unless capture; with equal RSSI there is no capture in this scenario (assert no `RX_FAIL reason capture` at the AP).
4. ACWE 1: more collisions, fewer sit-outs; ACWE 3: fewer collisions, more sit-outs; the measured acknowledged-per-round mean for the three ACWE values.
5. twoPhase: the scheduled trigger lists the tags heard; its slots use 528 µs (reading) while the random phase's use 272 µs (id only); total air of a two-phase round vs an inline round for the same number of tags heard (measured for the first round with ≥1 heard).
6. A lost response is retried next round with a fresh draw (the tag's next AMP_ABOC differs in at least one round; and every tag is eventually acknowledged within 30 rounds).

**Jumps:** first collision in a slot, first sit-out, first Ack to the AP itself, first scheduled trigger (twoPhase variant), first lost response.
**Observe (3), try this (2: change ACWE in the editor; add a seventh tag), quiz (3).**

- [ ] Steps as in Task 10. Commit: `feat(course): AMP lesson 2, slotted random access`.

---

