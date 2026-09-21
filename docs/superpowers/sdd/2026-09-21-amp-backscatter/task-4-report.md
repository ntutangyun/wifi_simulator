# Task 4 report — Editor, i18n, Guide, glossary, README, EditorGuide

**Branch:** `feat/uwb-ranging` (worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`)
**Parent:** `0eaac5e` (Task 3, fix round 1)
**Commit:** `0573cad` — `docs(amp): mono-static backscatter in the editor, Guide, glossary and README`
**Status:** DONE

---

## What I built

### `src/model/scenario.ts`, `src/editor/planOps.ts` — no changes needed

Confirmed against Task 1/3's reports: `AmpTagCfg.mode`/`.epc`, `AmpApCfg.backscatter`,
`DEFAULT_AMP_BS` and the schema's cross-node rule ("a backscatter tag needs an AP with the RFID
inventory on") were already in place. `planOps.newTag` already writes `ampTag: { mode: 'active' }`,
so the 🏷 AMP tag tool already keeps placing an Active Tx tag — mode is purely a property. Nothing
to change here.

### `src/editor/FloorPlanEditor.tsx`

- Tag properties: a **Mode** select (Active Tx / Backscatter). Active mode keeps the existing DL
  sensitivity field; backscatter mode swaps it for a new `AmpEpcInput` component (bottom of the
  file, beside `genShort`/`nodeColor`/`nodeBadge`) — a buffered text field, the same draft/commit/
  bad-flag pattern as `NbChannelsInput` in `uwb/ui/UwbSessionFields.tsx`: blank commits `undefined`
  (schema derives an EPC from the node id), 24 hex characters commit lower-cased, anything else
  is left on screen with a red message instead of committing an invalid scenario.
- AP properties: a new **RFID inventory** section nested inside the existing AMP polling block
  (same `marginTop/borderTop` divider style as the AMP section itself), gated on `ampAp` being
  enabled first. An enable checkbox toggles `ampAp.backscatter` between `undefined` and
  `{ ...DEFAULT_AMP_BS }`; when on, seven more controls appear (Q, UL rate, WUP ms, charge dBm,
  BS dBm, TXOP ms, read, write), built with the existing `clampField` helper from `ui/inputs.ts`
  and the same `<label>`/`<input type="number">`/`<select>` layout as the AMP polling fields
  beside them.

### `src/ui/i18n.ts`

19 new `editor.*` keys (`ampMode`/`ampModeHint`/`ampModes`, `ampEpc`/`ampEpcHint`/`ampEpcBad`,
`ampBs`/`ampBsEnable`/`ampBsEnableHint`, and one label+hint pair each for Q, UL rate, WUP, charge
power, BS power, TXOP, read, write), EN and ZH. The charge-power and BS-power hints state the
pinned reach/activation numbers and that a tag beyond activation never boots, per the brief.
`AmpTagMode` added to the type-only import from `../model/scenario`.

### `src/ui/glossary.ts` (`amp` group)

- **Backscatter** — rewritten: no longer says "not modeled in this slice"; now states mono-static
  is modelled and bistatic is a later slice, with the 6 dB modulation loss.
- Nine new terms, EN + ZH, each carrying the numbers a learner would otherwise have to guess:
  **Mono-static**, **WUP-Excitation** (with the 30.9/97.8 cm activation figures), **BST-Excitation**
  (the T1…T4 formula), **EPC Gen2**, **Q / slot counter**, **RN16** (112 µs airtime), **EPC**,
  **Reader dynamic range** (50 dB, the "reach does not move" consequence), **Self-leakage** (20 dB,
  `monoLeakDbm` formula). `Energizer` is left untouched (still a later slice, not this task's).

### `src/ui/Guide.tsx`

New imports from `../engine/ampBs` (`AMP_BS_ACTIVATION_DBM`, `AMP_BS_ISOLATION_DB`,
`AMP_BS_LOSS_DB`, `AMP_BS_READER_DR_DB`, `activationReachM`, `monoReachM`) and four module-level
constants computed from them (reach at 250/1000 kb/s, activation at 10/20 dBm charge power) —
following the same "pin the prose to the live engine, never a retyped literal" discipline as the
rest of the file. A new unnumbered `<h4>` subsection **"Backscatter (mono-static)"** / **"反向散射
（单站式）"** sits inside section 10 (Ambient power), between the existing AMP prose and the
"draft status" disclaimer paragraph's follow-on (before section 11's heading). Two paragraphs: the
reflection/self-leakage/dynamic-range physics and why turning the reader up buys no reply reach but
does buy activation reach; then the Gen2 inventory (Query/QueryRep/RN16/ACK/EPC) and the two
excitations, naming every new glossary term.

### `src/editor/EditorGuide.tsx`

A new h4 section **"AMP backscatter (RFID inventory)"** / **"AMP 反向散射（RFID 盘点）"**, placed
after the existing "🗑 Delete node" entry and before "UWB session" (both languages). One `<D>` entry
per new control — Mode, EPC, RFID inventory (the section itself), Q, UL rate, WUP, Charge power,
BS power, TXOP, read after ACK, write after read — 11 entries × 2 languages, quoting the same
30.9/97.8/32.8/23.2 cm figures the Guide and glossary use.

### `README.md`

- 11 new conformance rows after the existing AMP rows: the Friis propagation law, modulation loss,
  self-leakage/isolation, reader dynamic range, tag activation, mono-static reply reach/required
  SNR, the two-excitation DL PPDU, the UL PPDU, the T1…T4 BST timing, the EPC Gen2 frame tunnel, and
  TXOP persistence — each tagged exactly as the spec tags it (TGbp contribution numbers, SFD PM-/
  FM- items, `model`, or the `11-25/0061r0` "Extend" contribution).
- Known simplifications: the old "backscatter... not implemented yet" line rewritten to say
  mono-static *is* now modelled (bistatic/energizer/WPT/harvesting still are not); five new bullets
  — nominal T1/clock (no per-reply jitter), no Q-adaptation, Friis below 1 m with the 5 cm floor,
  two powers in one PPDU as a model choice, and the reader's energy-detector floor sharing the
  demodulator's threshold (Task 3's deviation, worth disclosing here too).

---

## Tests

### `tests/editor/planOps.test.ts` (+2, in a new `describe('backscatter (mono-static) in the editor)`)

1. *"a plan round-trips a backscatter tag with an EPC through JSON"* — builds the exact object shape
   the editor's Mode-select + EPC-field onChange calls would commit (AP with `ampAp.backscatter`,
   a tag with `ampTag: { mode: 'backscatter', epc: '0123456789abcdef01234567' }`), asserts the
   schema accepts it and that `scenarioFromJson(scenarioToJson(x))` is `toEqual` the original.
2. *"enabling RFID inventory on the AP yields a schema-valid scenario with DEFAULT_AMP_BS"* —
   builds the exact patch the enable checkbox's `onChange` produces, asserts schema acceptance,
   `backscatter` equals `DEFAULT_AMP_BS` by value, and the round trip preserves it.

Both pass; `npx vitest run tests/editor` → 4 files, 85 tests, 0 failed.

### `tests/ui/amp-bs-guide.test.ts` (new, 18 tests, following `tests/ui/uwb-guide.test.ts`'s pattern)

- A `describe` recomputing the four reach/activation figures fresh from `src/engine/ampBs.ts` and
  pinning them to the literals `32.8 / 23.2 / 30.9 / 97.8` (so if the engine's constants ever move,
  this test — not a stale doc — is what fails).
- Guide section: heading present and correctly ordered between "10 · Ambient power" and "11 · UWB
  ranging" (both languages); reach/activation figures and `AMP_BS_ACTIVATION_DBM` present; "never
  boots" stated; self-leakage/dynamic-range/modulation-loss constants present; Gen2 term names
  present.
- Glossary: all 10 backscatter terms exist, the Backscatter entry no longer says "not modeled",
  every new term has non-empty `alt`/`def` in both languages with real Chinese and an English side
  free of CJK, and the WUP-Excitation entry quotes the same activation figures.
- EditorGuide: the new section renders (sliced from its own heading to the next), and every one of
  the 11 new controls is named in both languages; the Mode select's own i18n strings are asserted
  directly against `STRINGS`.
- README: conformance tags present (`11-24/0537r0`, `11-25/0058r1`, `11-25/0307r0`, `PM-74`,
  `FM-44`), the reach/activation figures present, the "not implemented yet" line is gone and
  "mono-static backscatter" is stated, and the four new simplification bullets are present.

All 18 pass on the first run — no RED/GREEN cycle was needed for this task's prose-only tests
(there is no production code path to break first); the editor round-trip tests above are the ones
with real assertions against schema behaviour, and both passed immediately since Task 1/3 had
already built the schema and defaults correctly — I verified this by reading their reports rather
than assuming, then confirmed the exact shapes with `ScenarioSchema.parse`.

---

## Gates

| Gate | Result |
|---|---|
| `npx vitest run tests/editor tests/ui tests/engine/lesson-hashes.test.ts` | 17 files: 16 passed, **1 failed** (`tests/engine/lesson-hashes.test.ts`) — the failure is the concurrent course implementer's in-progress `uwb-frame` lesson not yet in the fixture; confirmed via `git status` that `src/course/**`, `tests/course/**` and the fixture are dirty/untracked from someone else's work, not mine |
| `npx vitest run` (full) | 126 files: 121 passed, **5 failed**, 1892 tests: 1885 passed, 7 failed — every failure is in `tests/course/*.test.ts`, `tests/engine/lesson-hashes.test.ts` or `tests/engine/uwb-record-hashes.test.ts`, all traced to the concurrent `uwb-frame` lesson (word count over budget, a PPDU-layout assertion, and two missing hash-fixture entries); none of my files appear in any failing test's file or stack |
| `npx tsc -b --noEmit` | clean, no output |
| `npm run build` | `✓ built in 3.00s` |
| `tests/fixtures/lesson-hashes.json`, `tests/fixtures/uwb-record-hashes.json` | untouched by me (not in my `git add`; still show as course-implementer-dirty in `git status`) |

---

## Files changed (this commit)

| File | |
|---|---|
| `README.md` | conformance rows + Known simplifications |
| `src/editor/EditorGuide.tsx` | new "AMP backscatter (RFID inventory)" section, EN + ZH |
| `src/editor/FloorPlanEditor.tsx` | tag Mode/EPC, AP RFID inventory section, `AmpEpcInput` helper |
| `src/ui/Guide.tsx` | new "Backscatter (mono-static)" subsection, EN + ZH |
| `src/ui/glossary.ts` | `Backscatter` rewritten + 9 new terms |
| `src/ui/i18n.ts` | 19 new `editor.*` keys, EN + ZH |
| `tests/editor/planOps.test.ts` | +2 tests |
| `tests/ui/amp-bs-guide.test.ts` | new, 18 tests |

Staged by explicit pathspec only (`git add README.md src/editor/EditorGuide.tsx
src/editor/FloorPlanEditor.tsx src/ui/Guide.tsx src/ui/glossary.ts src/ui/i18n.ts
tests/editor/planOps.test.ts tests/ui/amp-bs-guide.test.ts`); never `git add -A`. The concurrent
course implementer's dirty/untracked files (`src/course/curriculum.ts`, `src/course/lessons.ts`,
`src/course/uwb/uwb-intro.ts`, `src/course/uwb/uwb-frame.ts`, `tests/course/*`, `wc.tmp.mts`) were
left exactly as found — not staged, not reset, not stashed.

---

## Self-review findings (fixed before reporting)

1. First draft of the AP's RFID-inventory checkbox duplicated its own hint text as a second
   visible `<label>` line (an editing mistake while assembling the JSX block) — removed; the header
   line now uses `E.ampBs` ("RFID inventory") as a section caption and the checkbox itself carries
   `E.ampBsEnable` as its label, matching the existing AMP-polling section's own
   caption-then-checkbox layout exactly.
2. Confirmed `newTag`/the schema were already correct (Task 1/3) before writing anything, rather
   than assuming from the brief alone — read `planOps.ts` and `scenario.ts` directly first.
3. Verified `tsc -b --noEmit` after each file group (i18n, editor, Guide, glossary) rather than
   only at the end, so a type error would have been caught against a small diff.

## Concerns

None outstanding. The only note worth flagging to whoever reviews: I placed the new Guide
subsection as an unnumbered `<h4>` (the file's numbered headings are 1–12 top-level sections; this
is the first nested, unnumbered one). This matches the brief's wording ("gains a ... subsection")
but is a small stylistic departure worth a second look if the reviewer wants it numbered "10a" or
folded into section 10's existing paragraphs instead.

---

# Fix round 1

**Review:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-4-review-report.md` (0 Critical,
5 Important, 10 Minor). **Commit:** `b2829c2` (a new commit; `0573cad` was not amended).

All 5 Important and all 10 Minor findings are addressed below; none declined outright, though two
Minors got a narrower fix than literally requested, with the reason stated.

## Important 1 — `AmpEpcInput` keyed by node id

`FloorPlanEditor.tsx`'s call site now reads `<AmpEpcInput key={selNode.id} …>`. Without a key, React
reconciled the buffered `draft`/`bad` state of the same component instance across a selection
change, so a rejected draft for tag A stayed on screen wired to tag B's `onCommit` — the reviewer's
exact reproduction. The component's own doc comment now states the invariant and why the key is
required.

**Test:** not addable headlessly, and the ruling allowed documenting instead. This repo's Vitest
config runs with `environment: 'node'` (no DOM at all — not even jsdom), and every existing UI test
in the suite renders once with `react-dom/server`'s `renderToStaticMarkup` for a static string
diff; nothing here re-renders a live component tree, fires DOM events, or exercises React's
reconciliation between two renders of the same element. Proving "a draft does not survive a
selection change" needs exactly that — a second render with a changed `key` prop and an assertion
that state reset — which is not expressible with a single-shot SSR string. Adding that capability
(a DOM test environment plus `@testing-library/react` or equivalent) is a testing-infrastructure
change out of scope for a one-component fix. Documented instead, per the ruling's own fallback:
the invariant and the reason it holds are in `AmpEpcInput`'s doc comment and at its call site.

## Important 2 — the cross-node rule is routed into the editor

New `planOps.ts` export:

```ts
export function ampTagIssue(sc: Scenario, id: string): boolean {
  const n = sc.nodes.find((x) => x.id === id)
  if (!n || n.kind !== 'amp' || (n.ampTag?.mode ?? 'active') !== 'backscatter') return false
  return !sc.nodes.some((x) => x.kind === 'ap' && x.ampAp?.backscatter !== undefined)
}
```

This reads the identical condition `scenario.ts`'s `superRefine` checks (`hasReader = sc.nodes.some
(n => n.kind === 'ap' && n.ampAp?.backscatter !== undefined)`), so it cannot drift from the schema
rule by construction — I read the exact superRefine block before writing it, rather than guessing
at the wording. It returns a boolean rather than the schema's raw (English-only) message, because
the ruling asked for "EN + ZH text": a new i18n key, `ampBsNeedsReader`, carries the bilingual
wording, and `FloorPlanEditor.tsx` renders it in the established red `issueStyle` (matching
`uwb/ui/UwbSessionFields.tsx`'s own `issueStyle`) right under the Mode select — the same
`issue={sessionIssue}` pattern the reviewer pointed at, generalized to a per-node boolean instead
of a scenario-wide string since the UWB session is a singleton but amp tags are not.

This also structurally covers the two related traps the reviewer named (unticking AMP polling,
moving the AP off Wi-Fi 7): both clear `ampAp`/`ampAp.backscatter`, and `ampTagIssue` reads live
scenario state, so the warning appears the next time the orphaned tag is selected — no special-case
wiring needed at the AP's own checkboxes. Save/Import/Export remain advisory-only (unblocked),
exactly as the existing `uwbSessionIssue` precedent already behaves for the UWB session's own cross-
field rules; hard-blocking Save is a larger behavioural change the ruling's concrete instruction
("shown in the editor's existing issue list") does not ask for, and I did not add it.

**Tests** (`tests/editor/planOps.test.ts`, new `describe('ampTagIssue')`, 5 tests): false once an
AP runs the inventory (and the schema agrees); true for a backscatter tag with no reader anywhere
(and the schema's own error message is asserted via regex); false for an Active Tx tag, a missing
node id, and the AP node itself; false for a freshly placed tag (defaults to active); and — the
"unticking AMP polling" trap named in the review — true the instant an existing reader's
`backscatter` is cleared out from under an already-backscatter tag.

## Important 3 — every reach/activation figure is now pinned to the engine

`tests/ui/amp-bs-guide.test.ts` gained a `describe('i18n hints quote the reach and activation
figures...')` block asserting `STRINGS[lang].editor.ampBsChargeHint`/`ampBsBsHint` contain the
computed `ACTIVATION_10_CM`/`ACTIVATION_20_CM`/`REACH_250_CM`/`REACH_1000_CM` strings, and the
EditorGuide `describe` block gained a matching assertion over its own rendered section. Both use
the exact same computed constants (from `monoReachM`/`activationReachM`, the real exported names
from `src/engine/ampBs.ts`) the Guide's own assertions already used — nothing new was computed, the
coverage was just missing for two of the five surfaces the numbers appear on. The Guide itself
already imported and computed these live (unchanged); EditorGuide and the i18n hints still hold
retyped literals in the source (the ruling did not ask me to change the source to compute them,
only to test that the literals match), but now a moved `AMP_BS_ACTIVATION_DBM` or reach constant
fails a test instead of leaving both text surfaces silently stale.

## Important 4 — README source tags corrected

Three rows fixed exactly as specified:
- The DL PPDU row now ends `; model (the two-power split)`, plus a clause naming 11-25/0307r0's
  PEX_C/PEX_B split explicitly.
- The UL PPDU row's source column gained `PM-57` (the 24-chip sync's real citation, read from
  `ampBs.ts:53`'s own comment) and states the chip timing is a model reading of PM-35, not PM-35
  itself.
- The BST-Excitation row's source column gained `T3 = 2 ms, TGbp 11-26/0120r0 (contribution)`,
  matching `ampBs.ts:48`'s own tag for `AMP_BS_WRITE_T3_NS`.

**Test:** `tests/ui/amp-bs-guide.test.ts`'s new `'tags every conformance row the way the spec tags
it'` isolates each row by its leading marker text and asserts the exact added substrings, so a
future edit that drops a tag from one of these three rows fails here.

## Important 5 — BST-Excitation in plain words, SFD expanded on first use

Rewrote the entry to drop the T1/T3/T4 algebra entirely: "stays on for about as long as that reply
takes... a fraction of a millisecond [for most commands]... a little over 2 milliseconds" after a
Write, with the SFD PM- citation kept (a reference tag, not a symbol the reader has to resolve).
The EPC Gen2 entry's bare "the SFD" is now "the draft's framework document (SFD)" on first use
(EN + ZH). **Test:** asserts the BST entry matches no `/T1|T3|T4/` in either language and does
state "2 milliseconds"/"2 毫秒"; asserts the EPC Gen2 entry contains the expansion in both
languages.

## Minors

| # | Fix |
|---|---|
| 1 | `Guide.tsx`'s EN/ZH prose rewritten: the switch is introduced ("flipping a simple switch that reflects..."), the dynamic-range clause is glossed ("even after the reader digitally cancels as much of its own transmission as it can"), "BS power" is expanded to "the editor's BS power field" / "编辑器里的散射窗功率字段", and the Gen2 paragraph now glosses "Q = 2, the default, means four slots" / "默认 Q = 2，即四个时隙" beside `[0, 2^Q − 1]`. |
| 2 | `ampBsWupHint` (EN + ZH) changed from "the whole millisecond" to "the whole window", matching `EditorGuide.tsx`'s own correct wording — the field accepts 1–1000 ms, not just the 1 ms default. |
| 3 | `EditorGuide.tsx`'s "RFID inventory" entry now says "nested inside its **AMP polling** section" instead of "a section beside"; the Mode/EPC entries no longer say "(below)" — they say "in the AP's own properties" and name the red note that appears in place, since the section lives on the AP's panel, not below the tag's own Mode control. Both languages. |
| 4 | `<D t=…>` captions for the RFID inventory's UL rate and TXOP renamed to exactly `"UL rate"` / `"TXOP (ms)"` (ZH: `"上行速率"` / `"TXOP（ms）"`), matching the on-screen labels verbatim like every other entry in the panel; the "this is RFID inventory's own field, separate from AMP polling's" disambiguation moved into the body text instead. |
| 5 | `txopMs`'s `clampField` call dropped `int = true` (third arg removed), matching the schema's `z.number().min(1).max(10)` (no `.int()`) — an imported plan with `txopMs: 4.5` is no longer silently rounded the first time the field is touched. Commented in place so the asymmetry with `q`/`slots`/`acwe` (which *are* int-clamped) reads as deliberate. |
| 6 | `parseEpc(raw): string \| undefined \| null` lifted into `src/ui/inputs.ts` beside `parseIntList`, following the same three-way contract (`undefined` = blank/clear, a lower-cased 24-hex string = valid, `null` = does not parse); `AmpEpcInput` now calls it instead of inlining the regex. New `tests/ui/inputs.test.ts` `describe('parseEpc')`, 3 tests: blank/whitespace clears, valid EPC commits lower-cased and trimmed, five invalid shapes (too short, too long, non-hex character, a dash) all return `null`. |
| 7 | Two assertions tightened in `tests/ui/amp-bs-guide.test.ts`: the heading-order tests now `toContain` all three headings (left, middle, right) before comparing `indexOf` positions, so a heading that silently disappeared can no longer produce a vacuously-true `-1 < n`; `toContain('nominal')` replaced with the exact phrase `'Backscatter timing is nominal'` plus three more exact-phrase assertions for the other three simplifications. |
| 8 | `Guide.tsx`'s ZH paragraph rewritten so no interpolated expression starts a source line without an explicit space before it (three spots: after "反射一次要损耗", after "…也只有", after "…可达") — confirmed by rendering the section and inspecting the raw HTML both before (bug reproduced: "损耗6 dB", "之后50 dB"/"只有…50 dB", "可达97.8 cm") and after (all three now read with the space) the fix. The EN side never had the bug (its interpolations already sat mid-line or used an explicit `{' '}`). |
| 9 | `tests/ui/amp-bs-guide.test.ts` gained `"pins the RN16 entry's airtime to bsReplyNs, not a retyped literal"`: computes `bsReplyNs('rn16', 250)` (asserted `=== 112_000`) and checks both the glossary's `alt` and `def`, EN and ZH, contain `112 µs`. |
| 10 | **Declined, with a reason.** The fifth Known-simplification bullet (the reader's energy detector sharing the demodulator's threshold) is accurate and the reviewer agreed it is worth disclosing; the finding was that it arrived in Task 4's commit rather than Task 3's, which is a controller-level bookkeeping note about which task's commit a line landed in, not a defect in the text itself. Since Task 3 never touched `README.md` (confirmed: `git log --follow README.md` shows no Task 3 commit) and Task 4 owns the README file end to end, there is no file this line could have landed in during Task 3 without violating that task's own file-ownership boundary. Left as is; noted here for the controller. |

## Gates

| Gate | Result |
|---|---|
| `npx vitest run tests/editor tests/ui` | **16 files, 287 tests, 0 failed**, output pristine |
| `npx vitest run` (full) | **126 files: 123 passed, 3 failed**; **1907 tests: 1901 passed, 6 failed** — every failure is in `tests/course/uwb-frame.test.ts`, `tests/course/uwb-intro.test.ts` or `tests/course/readability.test.ts` (word-budget and contract-shape checks on the concurrent implementer's in-progress `uwb-frame`/`uwb-intro` lessons); `tests/engine/lesson-hashes.test.ts` and `tests/engine/uwb-record-hashes.test.ts` are green this round (the course side caught up its fixtures since my first report) |
| `npx tsc -b --noEmit` | clean, no output |
| `npm run build` | `✓ built in 3.01s` |

## Files changed (this round)

`README.md`, `src/editor/EditorGuide.tsx`, `src/editor/FloorPlanEditor.tsx`, `src/editor/planOps.ts`,
`src/ui/Guide.tsx`, `src/ui/glossary.ts`, `src/ui/i18n.ts`, `src/ui/inputs.ts`,
`tests/editor/planOps.test.ts`, `tests/ui/amp-bs-guide.test.ts`, `tests/ui/inputs.test.ts`. Staged
by explicit pathspec only. `src/course/uwb/uwb-frame.ts` and `src/course/uwb/uwb-intro.ts` were
dirty in the worktree throughout (the concurrent course implementer) and are **not** in this
commit; nothing was reset or stashed. An untracked `wc.tmp.mts` at the repo root (not mine, present
before this round started) was also left untouched.

## Concerns carried forward

Same one as round 1: the Guide's new subsection is an unnumbered `<h4>` nested inside numbered
section 10. Unchanged by this round; still worth a second look if a numbering scheme is wanted.
