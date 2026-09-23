# U5 review — uwb-mms, uwb-mms-numbers, uwb-nba, uwb-nba-coexist

Reviewed against `.superpowers/sdd/2026-09-23-mechanism-before-metaphor/batch-brief.md`,
the "Amendment, 2026-09-23 — mechanism before metaphor" section of
`docs/superpowers/specs/2026-09-21-course-readability-design.md`, and the engine
(`src/uwb/mms.ts`, `src/uwb/session.ts`, `src/uwb/channel.ts`, `src/uwb/phy.ts`,
`src/uwb/units.ts`, `src/engine/propagation.ts`, `src/engine/spectrum.ts`).
Commit `2396f99` touches exactly the eight files named in its message — no scope
creep.

## Verification performed

1. **Procedures against the engine.** Read every `steps` block in all four
   lessons against `mmsLayout` (`src/uwb/mms.ts:309-368`), `nbClear`/`lbtBusy`
   (`src/uwb/channel.ts:281-287`), and the schema checks in
   `src/model/scenario.ts:689-726`. Every step matches the order and constants
   the code uses: `uwb-mms`'s 7 steps against `mmsLayout`'s control/rp/report
   slot arithmetic and `rifStartMs`; `uwb-mms-numbers`'s 6-symbol sum (E, t, P,
   rx, G, margin) against `mmsFragmentDbm`, `rsfNs`, `combineGainDb`,
   `trainDetected`; `uwb-nba`'s 6 steps against the same `mmsLayout` plus the
   two-radio slot-sharing rule; `uwb-nba-coexist`'s 6-step busy check against
   `nbLbtRequired`/`lbtBusy`/`NB_LBT_THRESHOLD_DBM` and `dev.nbSkipBlock`. No
   step asserts something the code does not do.
2. **The engine correction.** `UWB_PL_EXP = 2.0` at `src/uwb/units.ts:46`
   ("model: indoor LOS" — free space for this engine's purposes.) `PL_EXP =
   3.0` at `src/engine/propagation.ts:17`, the Wi-Fi indoor law
   (`pathLossDb`), which `uwbToWifiPathLossDb`/`wifiToUwbPathLossDb` in
   `src/engine/spectrum.ts:58-66` carry into the cross-technology mediator
   unchanged. `uwb-nba-coexist`'s `deeper` arithmetic (`4.95 − (46.7 + 30·log10
   d + 1.2) = −71.02 → d = 8.62 m`) is exactly `wifiToUwbPathLossDb`'s formula,
   and its `sources` explicitly separate "Wi-Fi under the indoor exponent 3 …
   and the narrowband radio under free space" — the two laws are not blurred.
   `uwb-mms-numbers` step 4 correctly uses the engine's own exponent
   (`UWB_PL_EXP`) without naming a number in the step text (figures live in
   the table, per the amendment's own authoring note).
3. **Standing facts** — all four hold:
   - One-to-many is the base scene, pairwise is a variant, and the pairwise
     variant's old numbers are pinned: `uwb-mms.test.ts` ("the pairwise
     variant is the round this lesson used to run: 28 slots, three a block"),
     `uwb-nba.test.ts` (pins `1.504 ms`, 28-slot pair round).
   - 600 RSTU is stated everywhere as the *shortest slot an MMS round may
     use* (a consequence of the fit rules at the draft's default message
     sizes), never as a schema-hardcoded minimum; 300 RSTU is stated
     elsewhere (`uwb-blocks.ts`, `uwb-capstone.ts`) as the schema's general
     floor for any session. The two are not conflated in these four lessons.
   - The Poll grows 3 octets/responder and two 600 RSTU slots (1000 µs) cap a
     round at three responders — pinned via `nbOtmPollBytes(4) = 26` →
     1024.2 µs, refused by `ScenarioSchema`, in both `uwb-mms.test.ts` and
     `uwb-nba.ts`'s own numbers table.
   - RIF-y starts at `X + Z + y − 1` ms — matches `rifStartMs` in
     `src/uwb/mms.ts:184-186` exactly, pinned in `uwb-mms.test.ts`.
4. **这笔账.** Absent from all four lesson source files (grepped). The
   replacement heading "Who pays the difference / 差额由谁来付" is followed by
   real arithmetic (`407.215 → 362.631 Mb/s`, `44.58 Mb/s`, `10.95 %`), not a
   renamed gesture. Both a local pin (`uwb-nba-coexist.test.ts:596-602`) and a
   global rule (`readability.test.ts:465`, matching `/head arithmetic|这笔账|那笔账/`
   across every migrated lesson) guard against recurrence.
5. **Beginner read**, both languages, all four (`lesson-dump.ts <id> en|zh`).
   Read start to finish as someone who finished the rest of the UWB track; no
   sentence stopped me, and no sentence points at an unnamed quantity — every
   number used in a step or worked-example row is introduced or is a plain
   arithmetic step away from one that was. The Chinese reads as written
   Chinese throughout (先/若/于是/其中/而且 constructions, full-width
   punctuation, no English-clause-order calques) — spot-checked all four
   `picture`/`numbers` sections in zh.
6. **Pins and the carry.** `MECHANISM_INCLUDE=uwb-mms,uwb-mms-numbers,uwb-nba,uwb-nba-coexist
   READABILITY_INCLUDE=...` grader: 1014/1014 tests pass. The four lessons'
   own test files: 132/132 pass. `npx tsc -b --noEmit` shows one pre-existing
   error in `tests/course/airtime.test.ts` (`PhyMode | undefined` not
   assignable), part of the concurrent Wi-Fi fix wave and outside this
   batch's four files — ignored per instructions. `CELL_RULE_CARRIES` in
   `tests/course/readability.test.ts` is now `{}` (empty), confirming the
   `uwb-mms-numbers` entry really was dropped rather than merely unused; the
   "2.10 cm over 21 ranges" cell is now the bare value `2.10 cm` with "over 21
   ranges" moved into the bilingual row label
   (`src/course/uwb/uwb-mms-numbers.ts:127`), and it passes the neutral-cell
   rule with the carry disabled.

## Findings

None — Important or Minor. No pointer phrase, no engine-contradicting step, no
lost pin, no stated-vs-simulated drift found across the four lessons, their
tests, or the engine paths they claim to describe.

## Result

PASS. 0 Important, 0 Minor. No worst finding — every check in the review
scope (procedures, the PL_EXP/PL_EXP correction, the four standing facts,
这笔账's replacement, the bilingual beginner read, and the pin/carry
bookkeeping) came back clean.
