# Task 6 review — Docs (TDoA modes in the guide, glossary and README)

Reviewed: `task-6-brief.md`, `task-6-report.md`, `task-6-review.diff` (commit daa0b1e), and the
files at HEAD (`README.md`, `src/ui/Guide.tsx`, `src/ui/glossary.ts`, `src/editor/EditorGuide.tsx`,
`tests/ui/uwb-guide.test.ts`). Ground truth cross-checked: `src/uwb/device.ts` (`dlDiffSigmaM`,
`ulDiffSigmaM`, `solveTdoaFix`, `onRxOk`'s `ul-tdoa` branch), `src/uwb/network.ts` (`syncOffsetNs`
draw), `src/uwb/position.ts` (`solveTdoa`), `src/model/scenario.ts` (`DEFAULT_UWB_SESSION`,
`tdoaClockCorrection`/`syncErrorNs` schema), `src/uwb/phy.ts`/`frames.ts` (`UWB_BLINK_BYTES` = 9 +
3 + 2 = 14), spec Slice 5 (`docs/superpowers/specs/2026-09-19-uwb-slices-design.md:118-227`),
`task-2-review.md` (rate-ratio cancellation proof, GDOP √(2/3) = 0.8164965809277261) and
`task-3-report.md` incl. its Follow-up (UL/DL ellipse formulas, measured figures).

## Commands

- `npx vitest run tests/ui/uwb-guide.test.ts` → 1 file, **29/29 passed**, exit 0.
- `npx tsc -b` → clean, exit 0, no output (no errors anywhere, including the concurrently-edited
  course files).

## Binding constraints — checked one by one

1. **Guide paragraph, EN/ZH, section with the UWB coexistence content.** `src/ui/Guide.tsx`
   adds one `<p>` per language directly after the existing 6 GHz/UWB coexistence paragraph and
   before "Things to try" — the same (only) UWB block in the file. Content matches: §10.29.1.2.5
   cited; DL-TDoA described as anchor 0 running Poll+Final with responders answering, FiRa-style
   RMI content (model), tag listens only, clock-rate correction with the 20 ppm/20 ms → 120 m
   figure (matches spec §Slice 5 verbatim: "20 ppm over 20 ms is 0.4 µs, i.e. 120 m"); UL-TDoA
   described as one `UWB_BLINK_BYTES`-octet blink, "wired sync" (model), `DEFAULT_UWB_SESSION
   .syncErrorNs` ns default; hyperbolic positioning vs trilateration, ≥3 differences/4 anchors,
   unlimited silent DL audience vs slot-limited UL. EN/ZH are faithful translations of each other.
2. **Six glossary terms, bilingual, standard vs model tags.** TDoA, DL-TDoA, UL-TDoA, Blink,
   Hyperbolic positioning, Clock-rate correction all present under the `uwb` group, each with
   full `alt`/`def` in both languages. TDoA cites §10.29.1.2.5 (standard); DL-TDoA, UL-TDoA and
   Blink are explicitly tagged "model"/"FiRa-style"/"wired sync"; Hyperbolic positioning and
   Clock-rate correction carry no explicit tag, which matches the file's existing convention for
   purely analytic/config-name terms (e.g. the pre-existing `GDOP` entry also carries no
   standard/model tag) — not a gap.
3. **README rows + simplification bullet.** Six new rows added (one `standard §10.29.1.2.5`, five
   `model`/`model, FiRa-style`); the "model, FiRa-style" compound tag matches existing precedent
   (`§10.24 model`, `standard §10.29.1.6, collapsed to one number`). The stale "no TDoA and no
   downlink-TDoA mode" bullet was corrected, and a new bullet states the model/FiRa-style content
   and UL-TDoA's fixed-bias `syncErrorNs` caveat, matching `task-3-report.md`'s Follow-up exactly.
4. **EditorGuide entry.** Three `<D>` items added (Ranging mode, Tag clock correction, Anchor sync
   error), EN and ZH, matching `UwbSessionFields`'s three actual controls (`task-3-report.md`:
   "gained three controls... mode select... tag clock correction checkbox... anchor sync error
   field") including the schedule-forcing-to-time-scheduled behaviour (`uwbModePatch`).
5. **Tests +2, pinned to constants.** `tests/ui/uwb-guide.test.ts` gained exactly two `it`s in a
   new `describe`, both asserting against `UWB_BLINK_BYTES` and `DEFAULT_UWB_SESSION.syncErrorNs`
   rather than hard-coded numbers — correct practice, and they pass.
6. **Drift check — DL.** Anchor 0 runs the round / tags listen only: matches device.ts and
   `task-2-review.md` findings 1–2. Rate ratio: the docs state the tag-clock-cancellation
   mechanism (measuring the Poll-to-Final interval against the anchors' reported true interval)
   without asserting anything about which crystal(s) cancel — no contradiction with the engine's
   dual cancellation (`task-2-review.md` finding 3). No sentence claims a specific fix value when
   correction is off; "120 m of nonsense" describes the raw timing-drift-to-range magnitude, not a
   fabricated fix, consistent with the spec's own wording and with the "no fix without correction"
   engine behaviour (nothing in the diff contradicts it).
7. **Drift check — UL.** 14-octet blink once per tag per round: confirmed (`UWB_BLINK_BYTES` = 9 +
   3 + 2 = 14 in `phy.ts`). Wired sync with per-anchor `N(0, syncErrorNs)` bias: matches
   `network.ts:106` (`gaussian(rng) * cfg.syncErrorNs`, drawn once per anchor). "Anchor 0 computes
   and the tag lane shows": the docs say "the reference anchor computes... the fix itself", which
   is anchor 0 in this engine (`task-3-report.md`: "hands the set to anchor 0's `solveUlFix`") —
   accurate without needing to name it explicitly.
8. **Ellipses first-order.** README's DL formula `√((√2·c·σ_ts)² + (c·replyTimeᵢ·σ_cfo)²)` matches
   `dlDiffSigmaM` in `device.ts:198-203` exactly; UL's `√2·c·√(σ_ts² + syncErrorNs²)` matches
   `ulDiffSigmaM` in `device.ts:215-216` exactly. No sentence anywhere claims the hyperbolic GDOP
   is comparable term-for-term with trilateration's — the glossary's `Hyperbolic positioning`
   entry explicitly says the opposite ("not on the same scale... √(2/3) at a square's centre, not
   1.0"), which matches the pinned value in `task-1-report.md`/`task-1-review.md`.
9. **`alt.en`/`def.en` English only; ZH parity.** The existing test
   `'every glossary term keeps alt.en and def.en free of Chinese characters'` covers all groups
   including the six new terms, and it passes; manual read of all six entries confirms no CJK in
   the English fields and substantive (non-pass-through) Chinese in the ZH fields.
10. **No `any`/`@ts-ignore`.** Grepped the commit's diff for `any`, `@ts-ignore`,
    `@ts-expect-error`, `as unknown` — the only hits are the English word "any" inside prose
    strings ("any number of tags..."), not TypeScript escape hatches.
11. **Scope.** The commit touches exactly the five files the brief named; no course files, no
    engine files.

## Findings

1. (Low, completeness) README's DL ellipse row states the per-difference formula
   `√((√2·c·σ_ts)² + (c·replyTimeᵢ·σ_cfo)²)` but doesn't note that the single sigma actually fed to
   `solveTdoa` is the RMS of that formula over the responders heard (`device.ts:454,469`, spelled
   out in `task-3-report.md`'s Follow-up: "DL: σ = RMS over the responders heard of..."). The table
   row is not wrong — it correctly gives the per-difference formula — but a reader could think one
   number's formula is applied directly rather than aggregated. One clause ("RMS'd across
   responders") would close it. Does not block.

## Verdict

Spec: APPROVED
Quality: APPROVED
