# Task 4 fix round 1 — re-review

**Fix base:** `0573cad` (original review head) · **Head:** `b2829c2`
**Diff package read:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-4-fix1-review.md`

## Finding Verdicts

**Important 1 — `AmpEpcInput` unkeyed, draft follows selection onto the wrong node.**
ADDRESSED. `src/editor/FloorPlanEditor.tsx:786` now reads `<AmpEpcInput key={selNode.id} …>`.
Per the controller's ruling this may be documented rather than tested (the suite is
`environment: 'node'`, no DOM, every UI test is a single-shot `renderToStaticMarkup` — genuinely
cannot express "state resets across a re-render with a changed key" without a DOM test
environment). The component's doc comment (`FloorPlanEditor.tsx:1007-1013`) states the invariant
and the reason a key is required, in the terms the ruling asked for.

**Important 2 — cross-node backscatter rule not routed into the editor.**
ADDRESSED. New `planOps.ts:391-395` `ampTagIssue(sc, id)` reads exactly the schema's own
`superRefine` condition — compared directly against `src/model/scenario.ts:788` (`hasReader =
sc.nodes.some(n => n.kind === 'ap' && n.ampAp?.backscatter !== undefined)`) and `:790`
(`n.kind === 'amp' && n.ampTag?.mode === 'backscatter'`): the boolean logic mirrors it by
construction (`n.kind !== 'amp' || (mode ?? 'active') !== 'backscatter'` is the negation of the
schema's guard; `!sc.nodes.some(ap-with-backscatter)` is the identical `hasReader` check).
Rendered under the Mode select at `FloorPlanEditor.tsx:781` via
`{ampTagIssue(scenario, selNode.id) && <div style={issueStyle}>{E.ampBsNeedsReader}</div>}`, with
new bilingual `ampBsNeedsReader` strings in `i18n.ts` (EN `:494`, ZH `:1047`). Five new tests in
`tests/editor/planOps.test.ts` (`describe('ampTagIssue')`, lines 707-754): reader present → false
+ schema accepts; no reader → true + schema rejects with the exact message regex; Active Tx tag /
missing node / the AP node itself → false; a freshly placed tag (defaults to active) → false; and
the AP's reader being cleared out from under an already-backscatter tag → true. The fifth test is
titled the "unticking AMP polling" trap but clears `ampAp.backscatter` directly rather than
`ampAp` itself — functionally equivalent, since `ampTagIssue`'s only AP-side condition is
`ampAp?.backscatter !== undefined`, which is identically false whether `ampAp` or just
`ampAp.backscatter` is undefined; confirmed by reading the AMP-polling checkbox's own `onChange`
(`FloorPlanEditor.tsx:811`, sets `ampAp: undefined`) which collapses to the same expression. Save
remains advisory-only (unblocked), matching the existing `uwbSessionIssue` precedent and the
ruling's own wording ("shown in the editor's existing issue list") rather than a hard block.

**Important 3 — EditorGuide/i18n figures are retyped literals no test pins to the engine.**
ADDRESSED. `tests/ui/amp-bs-guide.test.ts` gained `describe('i18n hints quote the reach and
activation figures...')` (lines 901-917) asserting `STRINGS[lang].editor.ampBsChargeHint`/
`.ampBsBsHint` contain the `ACTIVATION_10_CM`/`ACTIVATION_20_CM`/`REACH_250_CM`/`REACH_1000_CM`
constants, and a new assertion in the EditorGuide describe block (lines 884-891) checks the
rendered section the same way. Verified `ACTIVATION_*`/`REACH_*` are computed from real
`monoReachM`/`activationReachM` exports of `src/engine/ampBs.ts` (test file lines 27-30), not
literals compared to literals — `expect(REACH_250_CM).toBe('32.8')` etc. is the only
literal-vs-literal pin, and it exists precisely to catch a moved engine constant.

**Important 4 — three README rows carried numbers under an SFD-only source tag.**
ADDRESSED. Read `README.md:62-64` directly: DL PPDU row now ends `; model (the two-power split)`
plus the PEX_C/PEX_B clause; UL PPDU row's source column now includes `PM-57` (cross-checked
against `ampBs.ts:53`'s own `// SFD PM-57` comment) and states the chip timing is "a model reading
of PM-35"; BST-Excitation row's source column now includes `T3 = 2 ms, TGbp 11-26/0120r0
(contribution)`, matching `ampBs.ts:47`'s own tag on `AMP_BS_WRITE_T3_NS`. A new test
(`tests/ui/amp-bs-guide.test.ts:951-960`) isolates each row by its leading marker and asserts the
exact added substrings.

**Important 5 — `BST-Excitation` glossary entry stated the T1/T3/T4 formula in symbols defined
nowhere.**
ADDRESSED for the primary defect. `src/ui/glossary.ts:596-599` now reads in plain words ("it
stays on for about as long as that reply takes... a fraction of a millisecond [for most
commands]... a little over 2 milliseconds" after a Write) with no bare `T1`/`T3`/`T4` symbols —
confirmed no `/T1|T3|T4/` match in either language, and both state "2 milliseconds" / "2 毫秒",
matching `tests/ui/amp-bs-guide.test.ts:848-855`.
PARTIAL on the related SFD-expansion note. The fix report claims "the EPC Gen2 entry's bare 'the
SFD' is now 'the draft's framework document (SFD)' **on first use**" (`glossary.ts:606-607`), but
this is not actually first use: within the same backscatter group, `WUP-Excitation`
(`glossary.ts:590-591`, "SFD PM-72/PM-73") and `BST-Excitation` itself (`:598-599`, "SFD PM-74,
PM-75, PM-86…PM-88") both appear earlier in the `GLOSSARY` array and are rendered in that same
array order with no sorting (`src/ui/GuideWindow.tsx:35-45` filters but does not reorder
`g.items`), so a learner browsing the glossary top-to-bottom meets two unexpanded "SFD" mentions
before reaching the expansion. This is a pre-existing gap the original finding flagged as
"related," not the finding's main defect (which is fully fixed), and two earlier unrelated
glossary entries outside this task's touched lines (`glossary.ts:510`, `:550`) also use bare SFD —
so this is a minor accuracy gap in the fix's own "on first use" claim, not a regression. Not
blocking.

## Guide / EditorGuide read as a beginner

Read `src/ui/Guide.tsx:198-221` (EN) and `:616-639` (ZH), and `src/editor/EditorGuide.tsx:218-268`
(EN) and `:615-665` (ZH) in full. All of Minor 1's named rough spots are smoothed: the switch is
introduced ("flipping a simple switch that reflects..."), "50 dB of headroom... even after the
reader digitally cancels as much of its own transmission as it can" reads clearly without a
prior term, "BS power" is expanded inline to "the editor's BS power field" / "编辑器里的散射窗功率
字段", and "Q = 2, the default, means four slots" glosses `[0, 2^Q − 1]` before it's used. No
sentence in either language's Guide or EditorGuide subsection stopped me. The ZH mid-line spacing
bug (Minor 8) is fixed by construction: every interpolated value that previously started a
fresh source line now sits on the same line as an explicit preceding space (e.g. `反射一次要损耗
{AMP_BS_LOSS_DB} dB`), which is the correct fix for JSX's whitespace-collapse rule (a newline-only
text node adjacent to an expression container is dropped entirely; a same-line trailing space is
kept) — not run through a live render to double-confirm, but the mechanism is correct and matches
the EN side's own long-standing working pattern.

## New Breakage in the Fix Diff

None. Specifically checked the two areas the task flagged as risk:
- `txopMs` clamp (`FloorPlanEditor.tsx:918`): dropped the `int = true` third argument to
  `clampField`, which defaults to `int = false` (`src/ui/inputs.ts:12`) — this now matches the
  schema's `txopMs: z.number().min(1).max(10)` (`scenario.ts:472`, no `.int()`), where before it
  silently rounded a fractional value on first touch. Correct, not a regression.
- `parseEpc` move (`src/ui/inputs.ts:50-54`, imported at `FloorPlanEditor.tsx:10`): identical
  regex and three-way contract (`undefined`/lower-cased 24-hex/`null`) as the inline version it
  replaced; no leftover duplicate regex in `FloorPlanEditor.tsx`; `AmpEpcInput`'s `commit()` now
  calls it directly (`:1021-1026`). Clean extraction.

Also spot-checked the Minor-4 label rename (`<D t="UL rate">`, `<D t="TXOP (ms)">` at
`EditorGuide.tsx:247,266`) against the on-screen labels and against whether another `<D>` entry
already claims the same caption for AMP polling's own UL rate field — it doesn't (`grep` found no
other `D t="UL rate"` in the file), so no duplicate-caption ambiguity was introduced.

## Verification run (this session, not re-trusting the report's numbers)

- `npx vitest run tests/editor tests/ui` → **16 files, 287 tests, 0 failed** — matches the fix
  report's own gate exactly.
- `npx tsc -b --noEmit` → clean, no output.
- `grep -n "key={selNode.id}"` confirms the Important-1 key is actually present (not just claimed).

Ignored per instructions: uncommitted `src/course/uwb/*`, `tests/course/*`, and `wc.tmp.mts` — the
concurrent course implementer's in-progress work, untouched by this fix diff.

## Controller Rulings Applied

- Important 1: documentation-not-test accepted — comment present and states why the key is
  required, and the "cannot test headlessly" claim checks out against the actual Vitest config
  (`environment: 'node'`) and every existing UI test's SSR-only rendering pattern.
- Minor 10: declined-with-reason accepted (README ownership boundary argument holds — `git log
  --follow README.md` shows no Task 3 commit, so the bullet had nowhere else to land without
  violating Task 3's own file-ownership boundary).

## Out-of-Scope Observations

None beyond what's already ledgered in the original review (Task 1's scenario-round-trip coverage
living outside Task 4; the unnumbered `<h4>` styling question the implementer flagged in both
reports).

## Verdict

**Fix round: ALL ADDRESSED** — 5/5 Important and 10/10 Minor findings resolved (Important 5's
related SFD-first-use note is a small residual accuracy gap in the fix's own claim, not a
reopened defect; it does not affect the finding's core requirement, which is met). No new
Critical/Important breakage in the fix diff. `npx vitest run tests/editor tests/ui` (287/287) and
`npx tsc -b --noEmit` both clean, run directly in this session.
