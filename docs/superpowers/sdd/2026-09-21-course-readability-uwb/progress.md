# SDD ledger — plan: docs/superpowers/plans/2026-09-21-course-readability-uwb.md

Lean loop per plan header. Pre-flight: batches touch disjoint lesson files; shared files (COURSE_ORDER, lessons.ts, MIGRATING, fixtures) are controller-only — no pair conflicts. Task 0 must land before any batch (kit + READABILITY_INCLUDE).

## Progress
Task 0: dispatched (opus)
Task 0: complete a6fb16c. Batches 1 and 2 dispatched in parallel (opus).
Batch 2: 37dbc77 + registration; reviewer dispatched (sonnet). Batch 3 dispatched (opus).
Batch 1: 84261ae + registration; reviewer dispatched (sonnet). Batch 4 dispatched (opus).
Batch 2 review: all READY, 1 minor + 1 nit → fix wave at the end.
Batch 1 review: READY/READY; medium+low fixed by controller (a85df86); GDOP in deeper allowed.
Batch 3: ddd43dc + registration; reviewer dispatched (sonnet). Batch 5 dispatched (opus).
Batch 4: 1a27e53 + f0809fd + registration; reviewer dispatched (sonnet). Batch 6 dispatched (opus). Carry: acronyms() reduces DL-TDoA to DL (mixed-case tail) — fix in the track fix wave.
Batch 3 review: READY/READY; medium (GDOP unglossed) fixed by controller via needs += uwb-geometry; lows/nits → fix wave.
Batch 4 review: READY/READY; 3 minor + 4 nits → fix wave.
Batch 6: df0006f + registration; reviewer dispatched (sonnet). Waiting on batch 5.
Batch 6 review: READY/READY; 1 minor + 3 nits → fix wave.
Batch 5: 2f6c21b + registration (ff85eaf); reviewer dispatched (sonnet). All 15 UWB lessons registered; MIGRATING has no UWB id. Whole-track review dispatched (fable).
Batch 5 review: READY ×3; 1 minor (stale doc comment uwb-mms.ts:46) + 2 nits → fix wave.
Track review (fable): NEEDS A FIX WAVE — 3 medium, 8 low, 2 nits, 7 amendments (A1–A4 adopted for the wave: tokenizer keeps mixed-case tails, no adjacent heading-less paragraphs in numbers, acronym rule reads cells/observe/quiz, picture terms within the needs closure; A5 vocabulary sheet → next tracks; A6/A7 recorded). ONE fix dispatch (opus).
Fix wave: f4fd240 (declines accepted: hyphen rule narrowed so CTS-to-self stays CTS; A4 scoped to earlier owners; bias reworded not needs; TCXOs removed). UWB track: COMPLETE — merged to main.
