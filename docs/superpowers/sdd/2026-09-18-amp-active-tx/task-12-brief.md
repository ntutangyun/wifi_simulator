### Task 12: Lesson `amp-coexist`: AMP and Wi-Fi share 2.4 GHz

**Files:** `src/course/amp/amp-coexist.ts`, `tests/course/amp-coexist.test.ts`, `src/course/lessons.ts`

**Scenario:** `longApartment()`; `ampAp` at (3, 4) with defaults (100 ms); tags at (2, 2) and (4, 6); a camera `node('cam', 'Camera', 'sta', 6, 4, 'he', 'backup')` with `linkId: '2g'` (saturated-ish upload at AC_BE); a phone `node('phone', 'Phone', 'sta', 12, 4, 'eht', 'video')` on 5 GHz (to show the 5 GHz lane is untouched). Variants: `protection: 'none'`; `pollIntervalMs: 20` (heavier polling).

**Claims to pin (over 2 s):**
1. With `ctsSelf`: the camera sets NAV from the CTS at every round (NAV_SET source `cts:ap` count = rounds); no camera data frame starts inside any slot; every tag response in a slot is acknowledged unless two tags collided.
2. The AP's BK EDCAF waits AIFS = 10 + 7·9 = 73 µs versus the camera's BE 10 + 3·9 = 37 µs; the measured mean delay from a round becoming due to its CTS start (µs) and its max.
3. Airtime: the round's air per second (µs) and the camera's throughput with and without polling (compare against a run with `ampAp` removed: throughput drop in %).
4. With `none`: camera frames start inside slots (count), tag responses that fail in those slots (count), and the tags' acknowledged share drops from X% to Y%.
5. The 5 GHz phone's throughput is identical in all variants (the bands are independent).
6. With `pollIntervalMs: 20` the round's airtime share and the camera's throughput drop (measured).

**Jumps:** first CTS-to-self, first camera NAV from it, first camera frame inside a slot (none variant), first failed tag response (none variant), first 5 GHz data.
**Observe (3), try this (2: set protection none in the editor; move the camera next to a tag), quiz (3).**

- [ ] Steps as in Task 10. Commit: `feat(course): AMP lesson 3, sharing 2.4 GHz with Wi-Fi`.

---

