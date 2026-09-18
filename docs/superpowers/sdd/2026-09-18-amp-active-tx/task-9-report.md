# Task 9 Report: Curriculum module and lesson-kit helpers

## Status
**DONE** — All tests pass, TypeScript clean, commit created.

## What Was Done

### 1. Test-Driven Development (TDD) Evidence
- **Step 1 (Updated test first):** Modified `tests/course/lessons.test.ts` line 269 to expect `[0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3]` (added extra `1` for new AMP module)
- **Step 2 (Saw it fail):** Test failed as expected with mismatch at index 8 (received `2`, expected `1`)
- **Step 3 (Implemented):** Made 4 file changes to satisfy the test
- **Step 4 (Tests pass):** All 82 tests pass across lessons, lesson-claims, and lesson-hashes

### 2. Implementation Changes

#### a. `src/course/curriculum.ts`
- **MODULES array**: Inserted new module at index 7: `{ tier: 1, title: { en: 'Ambient power IoT (802.11bp)', zh: '环境能量物联网（802.11bp）' } }`
  - Shifted "Real applications" from index 7 to 8
  - "Signals, modulation and coding" now at index 9
  - "Wi-Fi 8 and research craft" now at index 10
- **COURSE_ORDER array**: Added `'amp-intro', 'amp-slots', 'amp-coexist'` after `'mlo'` (before the capstone which moved to new M9)
  - Updated comment from "M8 real applications" to "M9 real applications"

#### b. `src/course/lessonKit.ts`
- **Imports**: Added `AmpApCfg` type and `DEFAULT_AMP_AP` constant from `'../model/scenario'`
- **New builders**:
  - `tag()`: Creates AMP tag node with `kind: 'amp'`, power 0, nonht generation, idle profile, 2g link
  - `ampAp()`: Creates EHT AP with AMP support, merges user's amp config with defaults, applies edca/txop/ampdu features by default
- **New predicates** (exported from lessonKit only, as required):
  - `firstAmpTrigger`: txOf wrapper for ampTrigger frames
  - `firstAmpResp`: txOf wrapper for ampResp frames
  - `firstAmpAck`: txOf wrapper for ampAck frames
  - `firstAmpAckToTag`: ampAck frames that are not self-messages (dst ≠ src)
  - `firstAmpSatOut`: AMP_ABOC records with no slot (saturation out)
  - `firstAmpLost`: AMP_RESULT records that were sent but not acked
  - `firstScheduledTrigger`: ampTrigger with phase='scheduled'

#### c. `src/course/lessons.ts`
- **Capstone lesson**: Changed `module: 7` to `module: 8` to account for the new AMP module at index 7

#### d. `tests/course/lessons.test.ts`
- **Module tier test**: Updated expected tier array from `[0, 0, 1, 1, 1, 1, 1, 1, 2, 3]` to `[0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3]`
  - This change reflects the insertion of the new AMP module with tier 1

### 3. Test Results

```
✓ tests/course/lessons.test.ts (41 tests) - PASS
  - "adds a fourth module" now passes with [0,0,1,1,1,1,1,1,1,2,3]
  - All 40 other tests still pass

✓ tests/course/lesson-claims.test.ts (40 tests) - PASS

✓ tests/engine/lesson-hashes.test.ts (1 test) - PASS

Total: 82 tests passed
```

### 4. Type Checking
```
npx tsc -b
(no output = clean, no type errors)
```

### 5. Commit
```
cbf9bd4 feat(course): ambient-power module slot and AMP lesson-kit helpers
```

## Files Changed
1. `src/course/curriculum.ts` — MODULES and COURSE_ORDER
2. `src/course/lessonKit.ts` — Imports, tag() builder, ampAp() builder, AMP predicates
3. `src/course/lessons.ts` — Capstone module index
4. `tests/course/lessons.test.ts` — Expected module tier array

## Self-Review

**Correctness:**
- New module inserted at correct index (7), pushing "Real applications" to 8
- MODULES.length now 11, tiers match expected `[0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3]`
- COURSE_ORDER now has amp lesson ids that don't yet have authored lessons (correctly skipped by orderLessons())
- Capstone module shifted from 7 to 8, matching new "Real applications" index

**Code Quality:**
- `tag()` and `ampAp()` follow existing patterns (node, sc builders)
- Predicates use established `txOf()` and `J()` patterns
- Imports use correct paths per brief requirements
- Type annotations match framework (NodeCfg, TLRecord, etc.)

**Adherence to Brief:**
- ✓ New module title correct: "Ambient power IoT (802.11bp)"
- ✓ New module tier: 1 (Tier 2 in UI)
- ✓ Capstone moved to module 8
- ✓ COURSE_ORDER updated with three AMP lesson ids
- ✓ All helper functions match brief signatures exactly
- ✓ Exports from lessonKit only (not lessons.ts)
- ✓ Imports use specified paths (scenario, caps)

## Concerns
None. All tests pass, TypeScript is clean, and the implementation matches the brief exactly.

## Next Steps (for Tasks 10–12)
The AMP lesson ids (amp-intro, amp-slots, amp-coexist) are now in COURSE_ORDER but have no authored lessons yet. When lessons are authored in those ids and added to LESSONS, they will be automatically included in the curriculum at the correct tier and position.
