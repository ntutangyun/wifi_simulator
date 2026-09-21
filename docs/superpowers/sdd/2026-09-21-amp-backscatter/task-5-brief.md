### Task 5: Lesson "A tag with no radio"

**Files:** create `src/course/amp/amp-backscatter.ts`, `tests/course/amp-backscatter.test.ts`; modify
`src/course/lessons.ts`, `src/course/curriculum.ts` (`COURSE_ORDER` after `amp-coexist`), `src/course/lessonKit.ts`
(`bsTag()` builder, `firstAmpRfid`, `firstBsReply`, `firstInventory`); fixture additions only; neighbour tests that pin
the tail of module 7 or `COURSE_ORDER`.

- [ ] Lesson per spec "Lesson amp-backscatter" (scene, four variants, body, 4 / 2 / 3, ≤ 25 min): pin the reach
  independence of `bsDbm`, the activation limits, every airtime, the counters and collisions of the first rounds, the
  TXOP budget, the L-SIG deferral, the `none` variant's losses; inspector/log strings copied from i18n/format and pinned
  EN + ZH.
- [ ] Commit `feat(course): AMP lesson "A tag with no radio"`.

