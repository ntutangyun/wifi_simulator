# Review — commit c73953d "feat(course): uwb-sts and uwb-capstone; 4ab lessons teach one-to-many rounds"

Verdict: **Approve with minor fixes.** Engine knobs, records, fixture-key moves, pins, and
MODULES/module-index numbering all check out; `npx tsc -b --noEmit` is clean and
`npx vitest run tests/course` is 37 files / 1131 tests green. One Important beginner-facing
prose inconsistency found in `uwb-sts`; two Minor nits.

## Important (1)

- **`uwb-sts`, `numbers` vs `quiz`.** The "same subtraction, in counter units" paragraph
  (`src/course/uwb/uwb-sts.ts:122`) says: "Both receive counters of the round come back low by
  the same amount, and **the two halves of the formula pull the same way**." The quiz's second
  explanation (`uwb-sts.ts:205`) says: "**One reading falls and the other rises** by the same
  amount, so the difference moves by twice the advance...". Both describe the same 3195 RCTU →
  14.99 m mechanism, but in directly conflicting terms ("pull the same way" vs "one falls, one
  rises"). Worked through the actual formula (`Tround − Treply`, with `Treply = txResp − rxPoll`
  and `Tround = rxResp − txPoll`), the quiz's account is the physically accurate one — the
  anchor's counter falling *raises* `Treply` while the tag's counter falling *lowers* `Tround`,
  so the two terms move oppositely and the difference shrinks by twice the raw advance before the
  final `/2`. The numbers-section sentence is the one to fix (e.g. "and the two halves of the
  formula move apart, so the final answer falls by the whole advance" or similar) so a learner
  who reads both sections back-to-back doesn't stop on an apparent contradiction. Nothing is
  numerically wrong — no test needs to change — this is a prose-only fix.

## Minor (2)

- **`src/course/curriculum.ts:98`** (comment above `'uwb-capstone'` in `COURSE_ORDER`): `// UWB
  Tier 3 — M15 the capstone of the ranging track`. `uwb-capstone.module` is `16`
  (`MODULES[16]` = "The ranging capstone"), and the preceding block's comment already claims M15
  for the narrowband-assisted lessons (`MODULES[15]`). The new comment should say M16. Comment
  only; no test or runtime effect.
- **`src/course/uwb/uwb-capstone.ts:187-188`**, rubric table: the "Anchor 3" row states flatly
  "doubles the timeouts" for an actual 18 → 40 change (×2.22, not an exact double), while the
  adjacent "Block rate" row hedges with "roughly double" for a change that *is* an exact double
  (18 → 36, per the pinned test). The hedge is on the wrong row — precision language is backwards
  between two adjacent cells a learner reads side by side.

## Verified clean

- `attacker`/`stsOff`: optional, default-absent (`ScenarioSchema`), gated after the MMS early
  return in `onRxOk`, deterministic (no RNG draw on reject), tagged `model` in comments; STS-on
  path rejects (`UWB_STS_REJECT`, no `UWB_TS` stamp) rather than stamping — confirmed in
  `src/uwb/device.ts:484-503` and pinned in `tests/course/uwb-sts.test.ts`.
- `uwb-sts`'s 50 ns → 14.99 m claim, the 3195 RCTU / 4267→1072 raw flight, the reject's node/peer/
  frameKind and the absent rx `UWB_TS`, and the base-hash equality with `uwb-intro` (both fixture
  files) are all pinned and passing.
- Fixture diff is exactly the four moved keys (`uwb-mms`, `uwb-mms-numbers`, `uwb-nba`,
  `uwb-nba-coexist`) plus the stated additions (`uwb-sts`(=`uwb-intro`)+`#0`/`#1`,
  `uwb-capstone`+`#0..#2`, and each 4ab lesson's `#3` = its old base hash) in both
  `lesson-hashes.json` and `uwb-record-hashes.json`. No other key moved.
- MODULES/module-index numbering: grepped all `.module).toBe(...)` / `MODULES[...]` hard-coded
  indices in `tests/course/*`; all UWB module-11/12/13/14/15/16 assignments are internally
  consistent after the new module-16 insertion, nothing broke.
- `uwb-capstone`'s rubric table cells are all pinned cell-by-cell against the four-scene run
  (`tests/course/uwb-capstone.test.ts`), including the anchor-3 +0.60 m bias, GDOP 1.25, the
  0.55/0.57 m three-range fix, and the one-to-many responder list.
- `UWB_STS_REJECT` has a format line (`src/uwb/format.ts`, routed via `src/ui/format.ts`); no
  glossary/i18n entry exists for it, but none exists for sibling record types either
  (`UWB_INTERFERED`, `UWB_TIMEOUT`) — consistent with the codebase's existing pattern of
  English-only engine record names, exempted from the acronym/translation rule.

## Not exhaustively checked (effort/time)

- Full ZH beginner-read dumps were done for `uwb-sts` only; `uwb-capstone`, `uwb-mms`,
  `uwb-mms-numbers`, `uwb-nba`, `uwb-nba-coexist` were read in EN plus diff-level EN/ZH pairing
  (all touched strings in the diff were edited as matched EN/ZH pairs). `readability.test.ts`
  (283 tests, includes acronym/prerequisite/density checks) passes, which covers much of what a
  ZH pass would catch mechanically.
