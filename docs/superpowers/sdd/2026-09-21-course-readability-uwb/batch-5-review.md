# Batch 5 review — uwb-aoa, uwb-mms, uwb-mms-numbers (commit 2f6c21b)

Reviewed read-only in `D:\wifi_sim\.claude\worktrees\feat-link-2g`. No edits, no commits, no subagents.

## Verdicts

| Lesson | Verdict |
|---|---|
| uwb-aoa | READY |
| uwb-mms | READY |
| uwb-mms-numbers | READY |

## Counts by severity

- Blocker: 0
- Major: 0
- Minor: 1
- Nit: 2

---

## Part 1 — beginner read (EN + ZH, both lessons/both languages via `npx tsx scripts/lesson-dump.ts <id> en|zh`; uwb-mms-numbers dumps fine, no fallback needed)

### uwb-aoa

- First unfollowable sentence: none, in either language. The opening ("Everything so far has needed three or four anchors... Give that anchor a second antenna...") states the problem (one-anchor positioning) and for whom (a reader who already has DS-TWR ranges and knows GDOP/ellipse from earlier positioning lessons) in the first two sentences.
- Unexplained words: none beyond the four `terms` (AoA, phase difference, boresight, field of view). GDOP and "ellipse" are used without re-definition, but those come from the positioning lessons that this module sits after in `curriculum.ts`, not from uwb-dstwr/uwb-blocks directly — reasonable to assume prior knowledge, not a beginner-read failure.
- Paragraphs with >1 idea: none found; each `picture` paragraph carries one idea through to its consequence (e.g. "The same noise costs more degrees off to the side" stays on the FOV/sine-flattening point).
- Contradictions: none.
- Simulator prompt: `[WATCH → the bearing the anchor takes off it]` appears in the second picture paragraph, names what will appear (a bearing plus the truth beside it) before any numbers are given. Good placement.
- Quiz: all three questions are answerable from the main path text (sin θ flattening, cross-range vs range split, the mirror-image explanation are all stated in `picture`/`numbers` before the quiz).
- ZH sentences that read translated: candidates (mild, not blocking) —
  1. "同样的噪声，越偏越贵。" (heading) — terse calque of "The same noise costs more degrees off to the side"; reads slightly compressed in Chinese but is idiomatic enough.
  2. "而它错得离谱的地方在这里。" — a bit blunt/literal for "here is where it fails," could be more natural, but meaning is clear.
  3. "反正弦再没有别的线索" — grammatical but slightly stiff; native technical ZH would more likely say "反正弦别无其他依据可循" or similar. Cosmetic only.
- Datasheet-register sentences: none — no register/bitfield tables, only a scene-parameter table and a bearing/fix table, both narrated.
- "draft"/document-number wording outside `sources`: none. The lesson's only standard reference (§10.29.1.1 of 802.15.4-2024) and all model-provenance language live in the `sources` block; the picture/numbers/deeper sections never mention a draft or document number.

### uwb-mms

- First unfollowable sentence: none. Opens with the problem (frames arrive too quiet to detect) and immediately names the fix strategy in the same paragraph.
- Unexplained words: none beyond the four `terms` (MMS, fragment, RSF, RIF). "Block/round/slot" are correctly treated as already known (from uwb-blocks), and "Poll/Response/Report" as the narrowband analogue of the DS-TWR messages the reader already knows.
- Paragraphs with >1 idea: none found.
- Contradictions: none.
- Simulator prompt: `[WATCH → what the far end made of that train]` appears in the second picture paragraph, tells the reader what one line will show (fragments heard, loudness, sum, verdict) before the arithmetic section.
- Quiz: both questions answerable from the main path (the millisecond-allowance-not-ceiling paragraph, and the "who does the talking" paragraph).
- ZH sentences that read translated: 
  1. "同样的噪声，越偏越贵" — n/a (that's aoa). For uwb-mms: "它没有限住的，是你用掉多少个毫秒" reads slightly literal for "What it does not cap is how many milliseconds you use," but is unambiguous.
  2. "这些片段单独拿出来，一个也听不见" — fine, natural.
  3. No third clear candidate; ZH prose in this lesson reads more natural than uwb-aoa's on the whole.
- Datasheet-register sentences: none.
- "draft"/document-number wording outside `sources`: **checked explicitly** — `P802.15.4ab`, `D5.0`, `TG4ab`, and the four document numbers (15-22/0381r5 etc.) appear only inside the `sources` array (`src/course/uwb/uwb-mms.ts:212-217`). The rendered picture/numbers/deeper text never names the draft or a document number — confirmed via the lesson dump above. (Note: the *source file's own code comments*, e.g. `uwb-mms.ts:4,35,65,67`, do mention "draft" — but those are author-facing TS doc comments, not learner-facing prose, so they don't count against this check.)

### uwb-mms-numbers

- First unfollowable sentence: none. Opens by stating the problem (a train either clears the receiver or not, decided by simple arithmetic) and what the lesson will do (that arithmetic).
- Unexplained words: none beyond the three `terms` (combining gain, clock ratio, parameter set).
- Paragraphs with >1 idea: none found; "Being honest about the gain" stays on one point (separating idea-gain from transmit-power gain) even though it previews three components, all serving that one point.
- Contradictions: none.
- Simulator prompt: reuses `[WATCH → what the far end made of that train]`, same scene as uwb-mms (by design, via `sameSceneAs`), appears early (second picture paragraph) and tells the reader the line will do "the sum out loud."
- Quiz: all three questions answerable from the main path (four-vs-eight-fragments margin flip, the 19.57 dB breakdown table, and the clock-ratio-over-7ms paragraph).
- ZH sentences that read translated: 
  1. "在这里把一串片段和一帧普通的测距帧放在一起比，片段这一串赢得很多" — slightly clause-heavy/literal for "Set a train against an ordinary ranging frame here and the train wins by a lot," but comprehensible.
  2. "真正由“许多毫秒”买来的，只有合成增益" — reads fine, natural enough.
  3. No strong third candidate — this lesson's ZH prose reads cleanly overall.
- Datasheet-register sentences: none (the "What a fragment is, and what it costs" table is narrated with values, not register bitfields).
- "draft"/document-number wording outside `sources`: same check as uwb-mms — `P802.15.4ab`/`D5.0`/`TG4ab`/document numbers appear only in `sources` (`src/course/uwb/uwb-mms-numbers.ts:171-175`), confirmed absent from picture/numbers/deeper text in the dump.

---

## Part 2 — pins and contract

**Old pin inventory.** `git show a6fb16c:tests/course/uwb-aoa.test.ts` (29 `it`s) and `git show a6fb16c:tests/course/uwb-mms.test.ts` (33 `it`s, covering both the old picture and the old numbers half of MMS in one file).

**New pin inventory.** `tests/course/uwb-aoa.test.ts` (29 `it`s), `tests/course/uwb-mms.test.ts` (19 `it`s), `tests/course/uwb-mms-numbers.test.ts` (18 `it`s) — 37 `it`s for the split MMS content vs. 33 before, so coverage grew rather than shrank.

- Every old pin traced to a home: spot-checked the harder-to-place ones by name and content —
  - `"one of the seventeen mandatory sets"` (old `uwb-mms.test.ts:816`, checking both `MMS_SETS` has 17 keys and the prose string) → present verbatim in `tests/course/uwb-mms-numbers.test.ts:197-198`, still checking `Object.keys(MMS_SETS)).toHaveLength(17)` plus the prose string, and additionally now checks the new "costs 20→32 slots, 14→20 ms round, 42→60 ms" deeper-section numbers.
  - `"19.57 dB over a 4z Poll, and only 9.03 of it is the train"` (old `:618`) → `uwb-mms-numbers.test.ts:403`.
  - `"σ_ratio = 0.0202 ppm"` (old `:542`) → `uwb-mms-numbers.test.ts:326`.
  - `"42 timeouts, not one range"` (old `:704`) → `uwb-mms.test.ts:451`.
  - The four `observe` pins (old `:748-813`) → `uwb-mms.test.ts:298-` region (folded into "the log table is the round, line for line" and the inspector-table test) rather than kept as four separate `it`s, but every quoted log line and inspector-row check is still asserted (`fmtRecord`/`txLine` calls for NBPOLL, RSF TX/RX stamps, NBREPORT, and the inspector table).
  - `"replays bit-for-bit, in all four scenes"` present in both old and new (`uwb-mms.test.ts:248` new vs `:823` old) — kept.
  - Old aoa's harder pins (mirror behind anchor, height correction, ellipse orientation, three-spot table, 80° editor variant) all found unchanged by name in the new `uwb-aoa.test.ts` (identical `it` count, 29 = 29, and spot-checked titles match old titles verbatim).
- None weakened: everywhere checked, the new assertions are equal to or stricter than the old ones (e.g. the `rsf-1` pin gained the slots/round-length cost check that wasn't pinned before).
- **The two corrected figures**: `x = 4.5` (anchor "pushed up against the first partition") and `3.6 dB` are pinned in `tests/course/uwb-mms.test.ts:184-190`:
  ```
  const nearWall = Math.hypot(4.5 - TAG_POS.x, 4 - TAG_POS.y, ANCHOR_Z - TAG_Z)
  expect(nearWall.toFixed(2)).toBe('8.58')
  const louder = 10 * UWB_PL_EXP * Math.log10(distTo(MMS_ANCHORS[0]) / nearWall)
  expect(louder.toFixed(1)).toBe('3.6')
  expect(prose()).toContain('would be 8.58 m away, 3.6 decibels louder')
  ```
  This is computed from the engine's own path-loss exponent (`UWB_PL_EXP`) and the real anchor/tag geometry, not asserted as a bare literal — so it is pinned *and* true of the engine, confirmed by the passing test run below. (Minor nit: `src/course/uwb/uwb-mms.ts:46`, a source-file doc comment, still says "in the middle of the bay" and "three and a half decibels" — stale wording left over from before the fix, inconsistent with both the shipped prose ["pushed up against the first partition", "3.6 decibels"] and the test's own `x = 4.5` "pushed up against the wall" framing. Not learner-facing, but worth a follow-up cleanup. See Findings below.)
- Every number in the three lessons' prose is pinned via `cell(...)` / `prose().toContain(...)` checks against engine-computed values (verified by reading through both old and new test files and matching each numeric claim in the lesson-dump output above to a corresponding `expect` in the test files — no unpinned number in the picture/numbers/deeper sections found).
- `sameSceneAs: 'uwb-mms'` is used: `tests/course/uwb-mms-numbers.test.ts:83` — `lessonShapeSuite(uwbMmsNumbers, { proseMax: 950, sameSceneAs: 'uwb-mms', runNs: RUN_NS })`.
- `.body!` is gone: `grep -n "\.body!"` over all three new test files and all three new lesson files returns nothing (it is present twice in the old `a6fb16c` mms test and twice in the old aoa test, confirming the old non-null-assertion pattern was in fact removed, not just avoided by chance).

**Test run:**
```
npx vitest run tests/course/uwb-aoa.test.ts tests/course/uwb-mms.test.ts tests/course/uwb-mms-numbers.test.ts
✓ tests/course/uwb-mms-numbers.test.ts (23 tests) 180ms
✓ tests/course/uwb-aoa.test.ts (29 tests) 150ms
✓ tests/course/uwb-mms.test.ts (24 tests) 328ms
Test Files  3 passed (3)
     Tests  76 passed (76)
```

**Mechanism spot-checks against `src/uwb` (three per lesson):**

- uwb-aoa vs `src/uwb/aoa.ts`:
  1. Phase model `pdoaRad` = `2π·(d/λ)·sin θ` collapsing to `π·sin θ` at `d = λ/2` (aoa.ts:82-88) — matches the lesson's "whole of the physics" formula exactly.
  2. Sigma model `aoaSigmaDeg` = `σ_φ/(π·cos θ)` clamped at 45° (aoa.ts:110-114) — matches the lesson's "what a radian of phase is worth" section and the 45° clamp described in "deeper."
  3. The mirror: `azimuthFromPdoaDeg`'s docstring and `pdoaRad`'s comment both state `sin(180° − θ) = sin θ` (aoa.ts:21-26, 83-84) — matches the lesson's "the half it cannot see" and "sin(180° − θ) = sin θ" claims verbatim.
  4. (Bonus) Height correction `√(r² − Δz²)` referenced in the lesson's "Walk out the floor distance, not the slant" is implemented at `src/uwb/device.ts:1208`.
- uwb-mms / uwb-mms-numbers vs `src/uwb/mms.ts`:
  1. `UWB_MS_BUDGET_NJ = 37` (mms.ts:81) — matches "37 nJ" pinned/quoted in both lessons.
  2. `mmsFragmentDbm(fragNs) = 10·log10(37nJ / fragNs)` (mms.ts:89-90) — matches the −3.46 dBm / −2.25 dBm fragment figures.
  3. `combineGainDb(heard) = 10·log10(heard)` and the detection rule `rxDbm + combineGainDb(heard) >= UWB_RX_SENS_DBM` (mms.ts:96-107) — matches the lesson's "gain = 10·log10(X)" and "margin = rx + gain − (−93 dBm)" formulas and the four/eight/sixteen-fragment table exactly.

No discrepancies found between prose, pinned tests, and engine code in any of the three lessons.

## Findings by severity

- **Minor (1):** `src/course/uwb/uwb-mms.ts:46` — the source-file doc comment above the `MMS_ANCHORS` builder still reads "an anchor pushed up against the first partition / in the middle of the bay would be 8.58 m away, three and a half decibels louder," mixing the old ("middle of the bay", "three and a half decibels") and corrected ("pushed up against the first partition", "3.6 decibels") wording in the same sentence. It is not learner-facing (the shipped `en`/`zh` prose at lines 208-209 is internally consistent and correctly says "pushed up against the first partition" / "3.6 decibels"), and the test pin (`uwb-mms.test.ts:184-190`) checks the correct figures, but the comment should be tidied so it doesn't contradict the code it documents. Fix: replace `uwb-mms.ts:46`'s "in the middle of the bay would be 8.58 m away, three and a half decibels louder" with "pushed up against the first partition would be 8.58 m away, 3.6 decibels louder" to match the shipped prose.
- **Nit (2):** A handful of ZH sentences read slightly translated (quoted above per lesson, e.g. uwb-aoa's "而它错得离谱的地方在这里" and "反正弦再没有别的线索"; uwb-mms-numbers's "在这里把一串片段和一帧普通的测距帧放在一起比…"). None are ambiguous or incorrect; optional polish only, not blocking.

Report path: `D:\wifi_sim\.claude\worktrees\feat-link-2g\.superpowers\sdd\2026-09-21-course-readability-uwb\batch-5-review.md`
