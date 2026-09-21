# Task 4 review — Editor, i18n, Guide, glossary, README, EditorGuide

**Diff under review:** `fc5195d..0573cad` (`0573cad docs(amp): mono-static backscatter in the editor, Guide, glossary and README`)
**Review package:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-4-review.md`
**Brief:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-4-brief.md` · **Report:** `task-4-report.md`

### Spec Compliance

❌ **Issues found.**

- **Missing — the brief's `src/editor/planOps.ts` "issue routing if needed" was needed and was not done.**
  `src/model/scenario.ts:784-794` raises `'a backscatter tag needs an AP with the RFID inventory on'`
  at `path: ['nodes', i]` and its own comment says the path exists "so the editor can point at the node
  that is wrong". Nothing in this commit reads it: `planOps.ts:302 uwbSessionIssue` filters to
  `sc.nodes[i]?.kind === 'uwb'` only, and `FloorPlanEditor.tsx:270,526` is the only issue wiring in the
  editor. Consequences below (Important #2).
- **Constraint 2 (numbers computed from the engine where a test can check them) — partly unmet.**
  `Guide.tsx:31-35` computes all four figures; `EditorGuide.tsx` and `i18n.ts` retype them as bare
  literals and `tests/ui/amp-bs-guide.test.ts` pins only the Guide, the glossary WUP entry and the
  README. See Important #3.
- **Constraint 2 (tagged in README the way the spec tags it) — three rows unmet.** `README.md:62,63,64`
  put model/contribution numbers under an SFD-only source. See Important #4.
- **Constraint 1 (plain language) — one entry fails.** `glossary.ts:595-601` states the BST formula in
  T1/T3/T4, symbols defined nowhere in the Guide, the glossary or the README. See Important #5.
- Everything else in the brief is present and correct: tag **Mode** select + **EPC** field
  (`FloorPlanEditor.tsx:770-788`), the AP **RFID inventory** section with all eight schema fields
  (`:860-932`), 19 EN+ZH `editor.*` keys (`i18n.ts:108-120, 488-497, 1041-1050`), the Guide subsection in
  both languages (`Guide.tsx:198-221, 616-639`), the rewritten `Backscatter` entry plus nine new glossary
  terms (`glossary.ts:571-651`), the EditorGuide section in both languages (`EditorGuide.tsx:218-268,
  615-665`), 11 conformance rows and 5 Known simplifications (`README.md:56-66, 147-151`), 2 editor tests
  and a new guide test file.
- Constraint 7 holds: the package's file list is exactly the eight files; `src/engine`, `src/model`,
  `src/course` and `tests/fixtures` are untouched by this commit.

⚠️ **Cannot verify from this diff:**
- "An existing plan JSON without the new fields still loads" is not tested in this commit; it is covered
  outside it by `tests/model/scenario.test.ts:136` (`out.nodes[3].ampTag?.mode` is `'active'` for a tag
  that carried no mode), from Task 1. No action needed, but the controller should know the coverage does
  not live in Task 4.
- "The tag-placing tool still creates an active tag" is true of unchanged code
  (`planOps.ts:186-199`, `ampTag: { mode: 'active' }`); this commit does not touch it and adds no test.

### Checks run

- `npx vitest run tests/editor tests/ui` → 16 files, **272 tests, all passed**, 1.90 s. Output pristine:
  no warnings, no stderr noise. (`tests/ui/amp-bs-guide.test.ts` 18 tests, `tests/editor/planOps.test.ts`
  18 tests.)
- `npx tsc -b --noEmit` → exit 0, no output.
- Named risk: *the prose's four figures could be wrong.* Read `src/engine/ampBs.ts` and recomputed:
  `monoReachM` cancels `bsDbm` algebraically (`ISOLATION + DR − LOSS − reqSnr − 2·PL`), so "independent of
  BS power" is true; `monoReachM(0,250)=0.328 m`, `monoReachM(0,1000)=0.232 m`, `activationReachM(10)=0.309 m`,
  `activationReachM(20)=0.978 m` — 32.8 / 23.2 / 30.9 / 97.8 cm as quoted. T1 16 µs, T2 16 µs,
  Write T3 2 ms, WUP min 1 ms, DL sync 16 µs, 24-chip UL sync, `DEFAULT_AMP_BS` = q 2 / 250 / 1 ms /
  10 dBm / 0 dBm / 4 ms / read on / write off all match the spec and the README/Guide text.
- Named risk: *editor fields could exceed the schema.* Compared every control against
  `scenario.ts:466-476`: q `int 0…8` ✓, ulKbps 250|1000 ✓, wupMs ≥ 1 (UI caps at 1000, schema has no max) ✓,
  chargeDbm/bsDbm −10…30 ✓, txopMs 1…10 ✓ (but see Minor #5), read/write booleans ✓.

### Strengths

- `Guide.tsx:31-35` derives all four figures from `ampBs.ts` rather than retyping them, and
  `tests/ui/amp-bs-guide.test.ts:31-42` pins those computed values to the literals the spec quotes — a
  moved engine constant fails the test instead of leaving stale prose. That is exactly the drift
  discipline this repo asks for.
- `tests/editor/planOps.test.ts:138-159` are genuinely non-vacuous: real `ScenarioSchema.parse`, real
  `scenarioFromJson(scenarioToJson(x))` round trips, and `toEqual(DEFAULT_AMP_BS)` by value.
- `AmpEpcInput` (`FloorPlanEditor.tsx:1000-1029`) reuses the established buffered-draft pattern rather
  than inventing one, and refuses to commit a scenario the schema would reject.
- The glossary's `Self-leakage` and `Reader dynamic range` entries (`glossary.ts:635-651`) explain the
  mono-static problem in plain words ("hearing a whisper over its own shout") and still carry the tags.
- The ZH side reads naturally throughout and says the same thing as the EN — including the invented but
  consistent 散射窗功率 / 充能功率 / RFID 盘点 terminology, used identically in i18n, EditorGuide and Guide.
- The README's four Known simplifications (`:147-150`) are precise and honest, and the Active Tx section
  of the editor is untouched in `active` mode (`FloorPlanEditor.tsx:783-788` is the old field verbatim).

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**1. `src/editor/FloorPlanEditor.tsx:781` — `AmpEpcInput` is not keyed by node, so an invalid draft
follows the selection onto another tag and can be committed to the wrong node.**
The component holds `draft`/`bad` state (`:1008-1009`) and keeps both when a commit fails (`:1013-1016`).
It is rendered at a fixed position in the properties panel with no `key`, so selecting a different
backscatter tag reconciles onto the same instance and the old, rejected draft stays on screen — now
wired to the new node's `onCommit`. The user corrects the text, blurs, and the EPC intended for tag A
lands on tag B while tag A keeps none.
*Fix:* `<AmpEpcInput key={selNode.id} … />`.

**2. `src/editor/FloorPlanEditor.tsx:770-777` (+ `src/editor/planOps.ts:302-311`) — switching a tag to
Backscatter with no reader on the AP silently produces a scenario the schema rejects, with no feedback
and a data-loss path.**
Nothing in the editor reads the cross-node issue (`scenario.ts:788-793`). The result: the panel looks
fine; pressing Run surfaces the message only as a worker error banner (`sim.worker.ts:51`); **Save**
writes the invalid plan unvalidated (`FloorPlanEditor.tsx:347`, `scenarioToJson` is a bare
`JSON.stringify`), and the next page load parses it, throws, and silently falls back to
`defaultScenario()` (`store.ts:66-73`) — the user's plan is gone. The **Load** button shows the raw
`ZodError` string (`:351`). The same trap fires from the other side: unticking AMP polling
(`:807-809`) or moving the AP off Wi-Fi 7 (`planOps.ts:366`, `ampAp: undefined`) orphans existing
backscatter tags.
*Fix:* mirror the UWB precedent — an `ampTagIssue(sc)`/generalized `uwbSessionIssue` in `planOps.ts` that
returns the issue whose node is the selected `amp` node, rendered under the Mode select the way
`issue={sessionIssue}` is rendered at `:526`. Gating the Backscatter option on a reader being present is
the weaker alternative; it hides the reason.

**3. `src/editor/EditorGuide.tsx:247, 256-257, 261-262` (ZH `:639-640, 648-649, 653-654`) and
`src/ui/i18n.ts:493-494, 1046-1047` — 32.8 / 23.2 / 30.9 / 97.8 cm are retyped literals that no test
pins to the engine.**
The constraint asks for engine-computed numbers "where a test can check them", and
`tests/ui/amp-bs-guide.test.ts` does exactly that for the Guide, the glossary WUP entry and the README —
but never asserts the EditorGuide section or the `ampBsChargeHint` / `ampBsBsHint` strings contain them.
Move `AMP_BS_ACTIVATION_DBM` or `AMP_BS_LOSS_DB` and four learner-facing strings go stale with a green
suite.
*Fix (test-only, cheap):* in the EditorGuide describe block assert `enSection`/`zhSection` contain
`` `${ACTIVATION_10_CM} cm` `` etc., and add the same assertions against
`STRINGS[lang].editor.ampBsChargeHint` / `.ampBsBsHint`.

**4. `README.md:62, 63, 64` — contribution and model numbers carried under an SFD-only source tag.**
The spec's rule is that every number wears the tag of where it came from.
- `:62` "Backscatter DL PPDU: two excitations | SFD PM-15, PM-38, PM-63, PM-65 note, PM-72…PM-90" — the
  Notes then state the `chargeDbm`/`bsDbm` split, which the spec tags **model** (after 11-25/0307r0) and
  which line 150 itself discloses as a model reading. Add `; model (the two-power split)`.
- `:63` "Backscatter UL PPDU | SFD PM-24, PM-35, PM-17, PM-20" — the 24-chip sync is **PM-57**
  (`ampBs.ts:55`) and is missing from the row; the chip timing is a *model reading of PM-35*
  (`ampBs.ts:56`), not PM-35 itself.
- `:64` "BST-Excitation timing, T1…T4 | SFD PM-74, PM-75, PM-86…PM-88" — the Notes quote T3 = 2 ms, which
  the spec and `ampBs.ts:49` tag `TGbp 11-26/0120r0 (contribution)`. Add it.

**5. `src/ui/glossary.ts:595-601` (`BST-Excitation`) — the entry is written in symbols a learner has no
way to resolve.** "at least 1.2·T1 + 1.1·T4 for an immediate reply, 1.1·T3 + 1 µs + 1.1·T4 for a delayed
one" — T1, T3 and T4 appear in no glossary term, no Guide sentence and no README cell that defines them;
the same formula is repeated at `README.md:64`. A glossary is where a reader goes precisely because they
did not follow the term. Related, same entry family: `glossary.ts:605` uses "the SFD" with no expansion
anywhere in the glossary.
*Fix:* name them in words — "T1 (16 µs, the gap the tag waits before answering) and T4 (the reply's own
airtime); a Write answers after T3 = 2 ms" — and write "the draft's framework document (SFD)" on first use.

#### Minor (Nice to Have)

1. `src/ui/Guide.tsx:199-206` — three dense clauses for the stated audience: "{6} dB down **for the
   switch**" (the tag's modulating switch is never introduced), "inside 50 dB of dynamic range **after
   digital cancellation**" (unexplained), and "whatever the **BS** power" (the abbreviation is an editor
   label, expanded nowhere in the Guide). `:213` "[0, 2^Q − 1]" would read better with the editor's own
   gloss ("Q = 2 means four slots").
2. `src/ui/i18n.ts:492` / `:1045` — "a tag needs **the whole millisecond** above −20 dBm" is only true at
   the default; the field accepts 1–1000 ms (`FloorPlanEditor.tsx:891`). `EditorGuide.tsx:251` already
   says "the whole window" — use that wording in both hints.
3. `src/editor/EditorGuide.tsx:236` / ZH `:630` — "a section **beside** AMP polling" is wrong: it is
   nested inside the AMP polling block and appears only on a Wi-Fi 7 AP with polling ticked
   (`FloorPlanEditor.tsx:802-811, 860`). Likewise `:227` / `:623` tell the reader the RFID inventory is
   "(below)" / "下方", but it lives on the **AP's** properties panel, not below the tag's Mode control.
4. `src/editor/EditorGuide.tsx:246, 263` (ZH `:638, 655`) — the captions "UL rate (RFID inventory)" and
   "TXOP (ms, RFID inventory)" do not match the on-screen labels ("UL rate", "TXOP (ms)"); every other
   `<D t=…>` in the panel quotes its control verbatim. Disambiguate in the body instead.
5. `src/editor/FloorPlanEditor.tsx:912` — `txopMs` is clamped with `int = true`, but the schema
   (`scenario.ts:472`) allows a fraction in 1…10. An imported plan with `txopMs: 4.5` is silently rounded
   the first time the field is touched.
6. Tests — the disable path (`backscatter: undefined`) and the EPC input's own rules (blank →
   `undefined`, 24-hex → lower-cased, anything else rejected) have no coverage; the validation lives
   inline in an unexported component (`FloorPlanEditor.tsx:1010-1020`) where no test can reach it.
   *Fix:* lift a `parseEpc(raw): string | undefined | null` into `src/ui/inputs.ts` beside `parseIntList`
   and test it, as `parseNbChannels` is treated.
7. `tests/ui/amp-bs-guide.test.ts` — two weak assertions: `expect(README).toContain('nominal')` matches
   on a very common word, and `expect(en.indexOf('10 · Ambient power')).toBeLessThan(...)` passes
   vacuously if that heading disappears (`-1 < n`). Assert `toContain` on the left-hand heading first.
8. `src/ui/Guide.tsx:619, 621, 625-626` — in the ZH paragraph the interpolated numbers sit at the start of
   a JSX line, so the surrounding newline is trimmed and the text renders as "损耗6 dB" / "之后50 dB"
   with no space between the Chinese and the numeral. Cosmetic; `{' '}` fixes it as the EN side does.
9. `src/ui/glossary.ts:621` — "112 µs of airtime at 250 kb/s (48 µs sync + 64 µs data)" is a literal that
   `bsReplyNs('rn16', 250)` computes; it could be pinned like the reach figures.
10. `README.md:151` — the fifth simplification (the reader's energy detector sharing the demodulator's
    threshold) is Task 3's deviation, outside this task's four. Accurate and worth disclosing, but the
    controller should note it arrived here rather than in Task 3's own commit.

### Assessment

**Spec compliance:** ❌ Issues found
**Task quality:** Needs fixes

**Reasoning:** The prose, i18n and README content are accurate against the engine and the spec, and the
Guide's engine-pinned figures plus the two schema round-trip tests are the right kind of work; but the
editor ships two real defects — an unkeyed buffered EPC field that can write a tag's EPC onto the next
tag selected, and the cross-node backscatter rule left unrouted, which lets the editor save a plan that
silently reverts to the default scenario on the next load — and three of the constraint's tagging /
number-pinning requirements are not met in the README, the EditorGuide and the i18n hints.
