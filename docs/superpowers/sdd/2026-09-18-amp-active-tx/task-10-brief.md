### Task 10: Lesson `amp-intro`: a station that never contends

**Files:**
- Create: `src/course/amp/amp-intro.ts`, `tests/course/amp-intro.test.ts`
- Modify: `src/course/lessons.ts` (import and include in the authored list)

**Scenario:** `oneRoom()`; `ampAp('ap', 'Router', 'ap', 5, 4, {})` (defaults: 100 ms, 4 slots, ACWE 2, 250/250, ctsSelf, inline); tags `tag('tag-1', 'Fridge tag', 3, 4)`, `tag('tag-2', 'Door tag', 8, 6)`; no Wi-Fi stations. Variant: `{ dlKbps: 1000, ulKbps: 1000 }` "1 Mb/s both ways".

**Claims to pin (the test measures them from the base run over 1 s, then the prose quotes the measured numbers exactly; every number in the lesson must appear in the test):**
1. Standard constants: AMP SIFS 10 µs; padding 20 µs; trigger PPDU 618 µs and Ack PPDU 330 µs at 250 kb/s; response 528 µs (inline reading, 15 octets); at 1 Mb/s: 258 / 186 / 132 µs.
2. The CTS-to-self precedes the trigger by one SIFS (10 µs) and its Duration ends within 20 µs of the last Ack's end.
3. Slot 1 starts exactly 10 µs after the trigger ends; slot 2 starts 10 µs after Ack₁ ends.
4. The round's total air at 250 kb/s (CTS + SIFS + trigger + 4 × (10 + 528 + 10 + 330)) in µs and its share of each 100 ms; the same for the 1 Mb/s variant.
5. Over 1 s: number of rounds (10), how many responses each tag got acknowledged, and how many rounds each sat out (measured).
6. Tags never emit CCA, NAV or backoff records.

**Jumps:** first CTS-to-self on the AP's 2.4G lane, first AMP Trigger, first tag response, first Ack addressed to a tag, first sit-out.
**Observe (3):** the 10 µs gaps in the strip at slot scale; the Ack's ID in frame detail naming the tag; a tag's ABOC in the inspector.
**Try this (2):** switch to the 1 Mb/s variant and compare round length; move Door tag behind the far wall until its RSSI is below −72 dBm (link-budget widget) and watch it stop answering.
**Quiz (3):** why a tag cannot run CSMA; what the padding is for; why every Ack PPDU is as long as it is.

- [ ] **Step 1: Write the test first**, modelled on `tests/course/tier1-retries-queues.test.ts`: a `recs()` memo per variant over 1 s, one `it` per claim above with the sentence it guards quoted in a comment. Use `expect(x).toBe(<value you measured>)` with the measured value filled in after the first run (run the test once with `console.log`, then pin).
- [ ] **Step 2: Write the lesson** (`Lesson` object, EN + ZH, blocks: p / list / table / formula as in `retries-queues.ts`), quoting only pinned numbers. Say in the first block that P802.11bp is a draft and cite 11-24/1613r20, 11-26/1519r5, 11-26/1889r4 and which values are model choices (tag sensitivity −72 dBm, OOK SINR thresholds, frame field widths).
- [ ] **Step 3: Register** in `lessons.ts` and run `npx vitest run tests/course` → PASS (study time 15–25 min per the formula; adjust prose length if not).
- [ ] **Step 4: Commit** — `git add src/course/amp/amp-intro.ts tests/course/amp-intro.test.ts src/course/lessons.ts && git commit -m "feat(course): AMP lesson 1, a station that never contends"`

---

