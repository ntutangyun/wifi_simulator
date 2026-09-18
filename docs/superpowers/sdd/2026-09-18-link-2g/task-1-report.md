# Task 1: Baseline timeline-hash fixture — Report

## Summary

Successfully implemented the baseline timeline-hash fixture to record hashes of every lesson scenario, lesson variant, and household preset before engine changes. This fixture serves as a comparison baseline for all later tasks to prove they left existing scenarios bit-identical.

## Implementation

### Step 1: Test File Creation
Created `tests/engine/lesson-hashes.test.ts` with the exact code from the task brief. The test:
- Collects all LESSONS from `src/course/lessons.ts` with their variants
- Collects all HOUSEHOLDS from `src/model/households.ts`
- Runs each scenario for 150ms (150,000,000 ns) via `Simulation.runUntil(RUN_NS)`
- Captures timeline hash via `Simulation.timelineHash()`
- Writes hashes to fixture when `UPDATE_HASHES=1` env var is set
- Compares against the recorded fixture in the test assertion

### Step 2: Fixture Generation
Ran: `UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts`

**Result:**
- ✓ Test passed
- File: `tests/fixtures/lesson-hashes.json` created with 66 entries
- Collection took ~3.7 seconds total (including Vite transform)

### Step 3: Fixture Verification
Generated fixture contains:
- **59 lesson scenarios**: 26 lessons + 33 variants across lessons with multiple variants
  - Examples: `radio-primer`, `radio-primer#0`, `radio-primer#1`, etc.
  - Full set includes all lessons from Tier 0 (basics) through Tier 1 project to capstone
- **7 household presets**:
  - `household:three-gamers`
  - `household:two-gamers`
  - `household:movie-night`
  - `household:work-from-home`
  - `household:smart-home`
  - `household:video-share`
  - `household:full-house`

Each entry is a 32-bit hex hash string (e.g., `ba2dfb4c`).

### Step 4: Comparison Test
Ran: `npx vitest run tests/engine/lesson-hashes.test.ts` (without `UPDATE_HASHES`)

**Result:**
- ✓ Test passed — fixture comparison works correctly

### Step 5: Commit
Committed with message:
```
test(engine): record the timeline hash of every shipped scenario

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
```

Commit SHA: `700804f`

## Test Results

### Generation Run
```
✓ tests/engine/lesson-hashes.test.ts (1 test)
Test Files: 1 passed (1)
Tests: 1 passed (1)
Duration: 3.69s
```

### Verification Run (without UPDATE_HASHES)
```
✓ tests/engine/lesson-hashes.test.ts (1 test)
Test Files: 1 passed (1)
Tests: 1 passed (1)
Duration: 3.74s
```

### Final Confirmation Run
```
✓ tests/engine/lesson-hashes.test.ts (1 test)
Test Files: 1 passed (1)
Tests: 1 passed (1)
Duration: 3.64s
```

## Files Changed

### Created
1. `tests/engine/lesson-hashes.test.ts` (46 lines)
   - Test harness for lesson scenario hash comparison
   - Imports LESSONS, HOUSEHOLDS, Simulation
   - Computes hashes for all scenarios and household presets

2. `tests/fixtures/lesson-hashes.json` (68 lines, 1944 bytes)
   - Baseline fixture with 66 scenario hashes
   - JSON format with scenario IDs as keys, 32-bit hex hashes as values

## Self-Review Checklist

- [x] Test file matches brief specification exactly
- [x] All imports resolve (LESSONS, HOUSEHOLDS, Simulation, Scenario)
- [x] Fixture generation successful with UPDATE_HASHES env var
- [x] Fixture contains exactly 66 entries (59 lessons/variants + 7 households)
- [x] All lesson variants are included (identified by `#N` notation)
- [x] All 7 household presets are included (identified by `household:` prefix)
- [x] Test passes without UPDATE_HASHES (fixture comparison works)
- [x] Fixture file is valid JSON with correct format
- [x] Commit message includes full attribution lines
- [x] No test output errors or warnings
- [x] All fixture hashes are valid 8-character hex strings

## Concerns

None. Implementation is complete and verified:
- Test passes consistently (3 independent runs)
- Fixture structure is correct (66 entries, proper naming convention)
- File paths and imports are correct
- Attribution lines included as specified
- No warnings or errors in test output

---

## Fix Round 1: TypeScript Type Declarations

### Issue
The test file used Node.js APIs (`node:fs`, `node:path`, `__dirname`, `process`) but the project lacked `@types/node` declarations, causing `npm run build` (which runs `tsc -b && vite build`) to fail with:
```
tests/engine/lesson-hashes.test.ts(8,16): error TS2307: Cannot find module 'node:fs'
tests/engine/lesson-hashes.test.ts(9,18): error TS2307: Cannot find module 'node:path'
tests/engine/lesson-hashes.test.ts(17,30): error TS2304: Cannot find name '__dirname'
tests/engine/lesson-hashes.test.ts(36,7): error TS2580: Cannot find name 'process'
```

### Fix Applied
Installed `@types/node` as a devDependency:
```bash
npm install -D @types/node
```

**Changes:**
- `package.json`: Added `@types/node` to devDependencies
- `package-lock.json`: Updated with `@types/node@22.10.2` (2 packages added)

**tsconfig.json check:** No `types` setting was needed — `@types/node` is automatically discovered.

### Verification

#### Type Check
Ran: `npx tsc -b`
```
(no output — clean)
```
✓ PASS

#### Test Execution
Ran: `npx vitest run tests/engine/lesson-hashes.test.ts`
```
✓ tests/engine/lesson-hashes.test.ts (1 test)
Test Files: 1 passed (1)
Tests: 1 passed (1)
Duration: 3.96s
```
✓ PASS

### Commit
```
cc40c20 fix(test): Node type declarations for the lesson-hash fixture test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
```

### Files Changed
- `package.json`: Added `@types/node` to devDependencies
- `package-lock.json`: Added type declarations

**Result:** Type check and test both pass. Test behavior unchanged.
