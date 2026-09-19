# Task 4 report — docs for contention-based rounds

Status: done.

Commit: bb2423f — docs(uwb): contention-based rounds in the guide, glossary and README

Files touched (exact pathspec commit): src/ui/Guide.tsx, src/ui/glossary.ts, README.md,
src/editor/EditorGuide.tsx, tests/ui/uwb-guide.test.ts.

What changed:
- Guide.tsx section 11: new EN/ZH paragraph on schedule mode 0 (§10.32.2), quoting
  `DEFAULT_UWB_SESSION.contentionSlots`/`maxAttempts` and `UWB_CAPTURE_DB` from imports, the
  RCPS (§10.32.9.5) / RCMA (§10.32.9.6) IEs, `UWB_CONTEND_COLLISION`, and the round-end feedback
  model (network tells the anchor whether it was heard).
- glossary.ts `uwb` group: added "Contention-based ranging", "RCPS IE", "RCMA IE" — bilingual
  alt/def with their clauses, following the existing literal-number style of the group.
- README.md: four new conformance rows (schedule mode 0 standard §10.32.2; RCPS/RCMA content
  sizing model; defaults 8/3 model; feedback model), and rewrote the two "Known simplifications"
  lines that claimed contention-based rounds were out of scope / that UWB was time-scheduled only
  — those were now stale given commits 7abebde/a25364d on this branch.
- EditorGuide.tsx: updated the UWB-session intro (was claiming a session never contends) and
  added "Schedule" and "Response slots / Attempts" entries for the three new session fields,
  EN/ZH, placed before "Block / Slot" to match field order.
- tests/ui/uwb-guide.test.ts: +2 tests (`Contention-based rounds (schedule mode 0)` describe) —
  one pins the Guide's contention numbers/clauses/collision record against engine constants in
  both languages, one checks the glossary's three new terms (bilingual, clause-tagged) and the
  README's new rows.

Verification: `npx tsc -b` clean; `npx vite build` succeeded (pre-existing chunk-size warning
only); `npx vitest run tests/ui/uwb-guide.test.ts` — 26/26 passed; also ran the broader
`tests/ui` + `tests/editor` suites (154/154) for regressions.

Test summary: tests/ui/uwb-guide.test.ts 26 passed, 0 failed.

Concerns: RCPS/RCMA are spelled out as "ranging contention phase structure IE" / "ranging
contention maximum attempts IE" by inference from the acronym letters (matching this codebase's
convention for ARC/RDM/RRTI/RMI) — no spelled-out name was found anywhere in the repo or spec
docs to confirm against the standard text itself.
