### Task 5: Lesson "Sixteen milliseconds of energy" and the third UWB tier

**Files:** create `src/course/uwb/uwb-mms.ts`, `tests/course/uwb-mms.test.ts`; modify `src/course/curriculum.ts`
(TIERS[6], module 15, COURSE_ORDER), `src/course/lessons.ts`, `src/course/lessonKit.ts` (`firstUwbRsf`, `firstNbPoll`,
`firstUwbTrain`, `firstNbLbt` predicates; a `twoWallLab()` scene builder = `rangingLab()` + brick partitions at x = 5
and x = 10); fixture additions only.

- [ ] Lesson per spec "uwb-mms" (scene, variants, body, 4 observe / 2 tryThis / 3 quiz, ≤ 25 min); every number pinned
  (fragment length and power, the per-fragment received power behind two walls, margins at X = 4 / 8 / 16, the NB
  message octets and microseconds, the 1.5 mm / 1.5 cm / 1.5 m ladder against the run's own errors, the 4z variant's
  timeouts, the burst-power split 6.9 dB + 10·log10(X)); `lessonMinutes ≤ 25`.
- [ ] Commit `feat(course): UWB lesson "Sixteen milliseconds of energy" and UWB Tier 3`.

---

