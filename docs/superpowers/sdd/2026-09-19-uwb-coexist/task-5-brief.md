### Task 5: Course tier 2 seam and lesson "Sharing 6 GHz"

**Files:** modify `src/course/curriculum.ts` (TIERS[5], MODULES 13/14, COURSE_ORDER five ids), `src/course/lessonKit.ts` (a `wifi6g(id, name, x, y, profile)` builder: eht, `linkId: '6g'`, `widthMhz: 80`, features incl. edca/ampdu/txop), `src/course/lessons.ts`; create `src/course/uwb/uwb-coexist.ts`; test `tests/course/uwb-coexist.test.ts`; fixture additions only.

Lesson `uwb-coexist` ("Sharing 6 GHz" / 共享 6 GHz, module 13): the lesson-5 corner anchors and tag (DS, **channel 5**, nlos on) plus `node('ap', 'Router', 5, 0.7, 'eht', 'idle', …)` at 6 GHz 80 MHz and a laptop at (7, 5) with the `browsing` profile on 6 GHz (`linkId: '6g'`), `sixGhzCenterMhz: 6305`, UWB nodes listed last. Variants: "UWB on channel 9" / UWB 使用 9 号信道; "Wi-Fi on channel 7 (5 985 MHz)" / Wi-Fi 使用 7 号信道; "Saturated download" / 饱和下载 (laptop `saturated`). Body: source sentence (§16.4.10 max input is standard; SIR −12 dB, the path-loss laws and the spectral-density assumption are model; 6E channel numbering is 802.11ax); the two bands and the overlap fraction; the asymmetry (20 dBm vs −14 dBm, 30 dB of path-loss exponent difference); what the tag sees from the AP at its distance (compute and pin); what the laptop sees from a UWB frame (noise rise in dB, 1 % of the time); CCA never trips; the per-second counts. Pinned per the spec's list; measure first.

- [ ] Steps as in earlier lesson tasks; commit `feat(course): UWB tier 2 and lesson "Sharing 6 GHz"`.

---

