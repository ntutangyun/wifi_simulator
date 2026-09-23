# C1 review — edca, ampdu, txop, txop-protect

Reviewed at HEAD (6b7e4e1), diff `880f9c7..HEAD` on the eight named paths. Read-only: no edits, no
commits, no state-changing git commands were run.

## Method

1. Read each `steps` block against the engine functions the report names, line by line:
   - `edca`: `startAccessAc` → `beginIfsAc` → `onIfsEndAc` → `decrement` → `onSlotTick` → `markReady` →
     `arbitrate` in `src/engine/mac.ts` (lines 410–563), and `aifsNs`/`EDCA_PARAMS` in `src/engine/phy.ts`.
   - `ampdu`: the aggregation predicate in `MAC.transmitFor`/`queues.claim`
     (`mac.ts:633-635`, `mac.ts:708-710`), the whole-PPDU decode branch at `mac.ts:1416-1421`
     (comment: "no per-subframe bitmap to partially fail on"), and `failAttemptCore` (`mac.ts:1145-1153`).
   - `txop`: `continueOrRelease` (`mac.ts:1170-1193`) and `releaseTxop` (`mac.ts:1200-1212`), matched
     against `EDCA_PARAMS[*].txopLimitNs`.
   - `txop-protect`: `releaseTxop`'s CF-End guard (`announced > t + sifsNs + cfTime + slotNs`,
     `mac.ts:1207`), `planBurstNs`/`announcedEndNs` (`mac.ts:652-697`), `buildDataFrame`'s Duration rule
     (`mac.ts:753-797`), and `onCfEnd` (`mac.ts:1221+`).
   Every step matches the code's own order and the code's own constants. No step tells a story the
   engine does not follow.

2. Verified the "whole-aggregate decode, no per-subframe bitmap" claim directly in `mac.ts:1416-1421`
   (the comment states it verbatim) and in `failAttemptCore`, which fails every MSDU of a timed-out
   attempt together. Confirmed by running `tests/course/ampdu.test.ts` ("steps 5 and 6"), which asserts
   all 14 subframes DEQUEUE at one instant. The claim is correct.

3. Read both dumps end to end for all four lessons (`npx tsx scripts/lesson-dump.ts <id> en|zh`), as a
   Tier-1-plus-earlier-Tier-2 reader. No sentence stopped me in either language. The AP naming seam:
   `txop`'s first "access point"/接入点 lands in `why` ("an access point (AP)" / 接入点（AP）), read
   before the picture ever uses the bare form ("The access point sends to one television" /
   接入点发给一台电视) — the bracket appears before the plain form is ever seen, so it reads as an
   introduction, not a patch. `txop-protect` names it directly inside `picture`'s first paragraph
   ("the access point (AP) in the hallway between them" / 接入点（AP）在中间的走廊里), which is the
   cleanest placement of the four lessons. `edca` and `ampdu` never name AP on the main path (their scenes
   are STA-only there), and both carry 站点（STA） at first use. No bolted-on phrasing found in either
   language.

4. Confirmed pins: `npx vitest run tests/course/edca.test.ts tests/course/ampdu.test.ts
   tests/course/txop.test.ts tests/course/txop-protect.test.ts tests/course/lesson-claims.test.ts
   tests/course/lessons.test.ts` — 224/224 green, including `lessons.test.ts`'s "lesson 7 presents EDCA
   parameters as a table and AIFS as a formula" pin (the `formula` block for AIFS = SIFS + AIFSN × slot
   survived the rewrite). Spot-checked several worked-example rows against the engine constants
   independently (e.g. `OFDM_5G.sifsNs`, `aifsNs(7, OFDM_5G)`, `MAX_PPDU_NS`, `EDCA_PARAMS[*].txopLimitNs`,
   the CF-End guard's three terms) rather than trusting the test file alone.

5. Ran the rules gate: `MECHANISM_INCLUDE=edca,ampdu,txop,txop-protect npx vitest run
   tests/course/readability.test.ts` — 892/894 green; the 2 failures are both in `readability · capstone`
   ("MB" ungprocessed acronym, numbers at 597/550), which is another batch's file and was flagged in the
   task as expected red. `npx tsc -b --noEmit` is clean (the `tests/course/rate.test.ts` `qam4k` error the
   report mentioned has since been fixed by another implementer). `txop-protect` numbers sits at exactly
   550/550 and `edca` at 543/550 — both accurate, no headroom for further additions; I found nothing that
   needed adding, so no trade is required.

## Findings

None. No Important findings, no Minor findings.

The procedure in every `steps` block is the engine's own procedure, in the engine's own order, with the
engine's own constants. The whole-aggregate-decode engine claim is correct and independently verifiable.
Both languages read cleanly for a Tier-1-plus-earlier-Tier-2 reader, and the AP naming seam the follow-up
commit (6b7e4e1) repaired now reads naturally in both `txop` and `txop-protect`, in both languages. Every
pre-existing pin survived both commits, the new steps and worked examples are pinned against engine
constants and event records rather than asserted from prose, and the block-shape pin in
`tests/course/lessons.test.ts` still passes with a true, shortened AIFS formula. All required gates are
green except the two capstone failures explicitly called out as out of scope.

## Verdict

PASS. 0 Important, 0 Minor findings. Worst finding: none — the batch's engine derivation, pins and
bilingual readability all held up under independent verification.
