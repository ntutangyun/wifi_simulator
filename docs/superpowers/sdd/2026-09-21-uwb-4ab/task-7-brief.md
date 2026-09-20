### Task 7: UWB records-hash determinism guard

**Files:** create `tests/fixtures/uwb-record-hashes.json`, `tests/engine/uwb-record-hashes.test.ts`; modify
`src/engine/hash.ts` only if a stable record-hash helper is missing.

- [ ] For every UWB lesson (`LESSONS` whose id starts with `uwb-`), base + each variant, run the lesson's standard
  window (1.3 s) and hash every `UWB_*` record: `type`, `node`, and each own enumerable field with numbers to 6
  decimals, strings verbatim, nested objects walked in key order; store `{ [lessonId:variantIndex]: hash }`;
  regenerate with `UPDATE_HASHES=1`; the test fails with the lesson/variant name and the first differing record
  index on mismatch (compute both lists in the failure path only).
- [ ] Commit `test(uwb): records-hash fixture for every UWB lesson scene`.

