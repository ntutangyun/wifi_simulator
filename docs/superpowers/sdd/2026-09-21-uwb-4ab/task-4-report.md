# Task 4 report — Editor fields, i18n, Guide §12, glossary, README, EditorGuide

Commit: `fc1854c docs(uwb): 802.15.4ab in the editor, Guide, glossary and README`
(9 files, +1113/−18, committed by pathspec; nothing under `src/course/**`, `src/uwb/*.ts`,
`tests/course/**` or `tests/fixtures/**` was touched.)

## What shipped

### Editor (`src/uwb/ui/UwbSessionFields.tsx`)
- The mode select gains the `mms` option; the **Method** select is disabled in MMS mode with
  `E.uwbMmsSsOnly` as its title (MMS ranges single-sided, corrected by the train-derived ratio).
  Verified against the engine: `uwbSlotsPerTag` ignores `method` for `mode: 'mms'`, so the hint
  is true and not merely a UI convention.
- New `MmsFields` section, rendered only in MMS mode:
  - **Parameter set** select over the 17 `MMS_SETS` ids plus `custom`. `custom` is *derived* by
    the new exported `mmsSetIdOf(phy)` — no stored id, so the select can never claim a set the
    five fields are not. Picking a set applies the new exported `mmsSetPatch(id)`: its five PHY
    fields plus `gapMs: 1`, leaving the narrowband settings alone.
  - `rsfs` / `rifs` / `nMsr` / `stsLen` / `gapMs` as a generic `NumSelect` over the sets
    `mms.ts` exports (`RSF_COUNT_SET`, `RIF_COUNT_SET`, `N_MSR_SET`, `STS_LEN_SET`, a local
    `GAP_MS_SET`), so a value the schema's literal unions reject cannot be produced.
  - `gap` as a number input clamped to 0…64.
  - `nbChannels` as a text field of comma-separated integers, committed on blur/Enter. An
    invalid or empty list is **not** committed: the session keeps its last good list and the
    field shows `E.uwbNbChannelsBad` in the same red style the session issue uses (the EN text
    is the schema's own message verbatim, the ZH a translation).
  - `nbLbt` (auto/on/off, hints saying auto = on for channels ≥ 50) and `report`
    (responder/initiator/bi) selects.
  - A read-only derived line: RSF length in µs (`rsfNs`), fragment power in dBm
    (`mmsFragmentDbm`), round length in slots and ms (`mmsLayout` × `slotRstu`).

### Parser (`src/editor/planOps.ts`)
`parseNbChannels(raw): number[] | null` — strict (one `/^\d{1,3}$/` per entry, so `'1e2'`,
`'3.5'` and `''` are refused), 1…250 entries, each 0…249, distinct. A test asserts it agrees
with the schema on both the lists it accepts and the lists it refuses.

### i18n (`src/ui/i18n.ts`)
EN + ZH for 27 new editor keys. `uwbModes.mms` now reads
`narrowband-assisted MMS (802.15.4ab draft)` / `窄带辅助 MMS（802.15.4ab 草案）`, and
`uwbModeHint` was rewritten for four modes (MMS: pairwise rounds, one tag–anchor pair per
round, narrowband control and report, no anchor minimum, `tags × anchors ≤ rounds per block`).
The "draft" disclaimer qualifier sits on the mode name and once on `uwbMmsHint`; the per-number
tags (`4ab draft 15-…`, `standard §…`, regulation, model) are on the individual hints.

### Guide §12 (`src/ui/Guide.tsx`, EN + ZH)
"802.15.4ab: narrowband-assisted multi-millisecond UWB (draft)" — the disclaimer and the four
source documents; the 37 nJ millisecond and 10·log10(X); RSF/RIF/MMRS/N_MSR with the published
length checks (62.18 / 65.64 / 91.28 / 82.05 µs) and the fragment powers; the RSF-RMARKER with
no SHR offset; the train-derived ratio and the 1.5 mm / 1.5 cm / 1.5 m ladder; the narrowband
side (O-QPSK 250 kb/s, 250 channels, the reconstructed centre formula, 576/576/608 µs,
10 dBm / −100 dBm); the pairwise cycle **as a table**; LBT (9 µs, −75 dBm/MHz → −71.02 dBm,
block skip, ≈ 8.6 m and ≈ 15 m); blockwise switching with the hash standing in for AES-CTR;
report modes; and the Known simplifications.

Every figure in the section is computed at module scope from `src/uwb/mms.ts` / `src/uwb/nb.ts`
(`MMS_RSF_US`, `MMS_COMBINE_DB`, `NB_LBT_DBM`, …), so the prose cannot drift from the engine.

### Glossary (`src/ui/glossary.ts`)
New group `uwb-mms`, "P802.15.4ab: narrowband-assisted MMS ranging (draft)", 11 entries: MMS,
RSF, RIF, MMRS, N_MSR, NBA-UWB, NB control channel, LBT / frame-based equipment, Millisecond
energy budget, Coherent combining, Train-derived clock ratio. EN + ZH `alt` and `def`; the EN
side is free of CJK (the existing language-separation test covers every group). The glossary
item shape has no `see` field, so no Guide pointer was added — the group title carries the
section's name instead.

### README
A `### IEEE P802.15.4ab (draft)` subsection under the UWB section with a **Draft status**
paragraph (which contribution gave what, and that D5.0 may differ) and conformance rows in the
table's existing columns: fragment structure, spacing/train shape, RMARKER, the 17 sets, the
millisecond budget, fragment power, train detection, train-derived ratio, NB PHY config #1,
NB channels (reconstructed), NB messages, NB link budget, LBT, block skip, channel switching,
report modes, and the pairwise cycle defaults (0381r5 Tables 1.2.3.2 / 1.2.3.3). Four new
bullets in Known simplifications.

### EditorGuide
An "MMS train (802.15.4ab draft)" section in both languages describing each field in the
guide's voice, plus the "Ranging mode" entry rewritten for four modes.

## Tests
- `tests/editor/uwb-planOps.test.ts` +3 describes (set select derives `custom` and every set
  round-trips through the schema; `mmsSetPatch` writes the five fields plus Z = 1; the parser
  accepts `"100,150,200,210"`, refuses `"3, x"` and empty, and agrees with the schema).
- `tests/ui/uwb-guide.test.ts` +3 describes (Guide §12 in both languages with the draft
  qualifier and every fragment/LBT/NB figure pinned to `mms.ts`/`nb.ts`; the new glossary group
  bilingual with CJK-free EN alts and its numbers pinned; the EditorGuide MMS section).

## Gates
- `npx tsc -b` — clean for every file I own. (Two untracked scratch files of the concurrent
  Task 5 agent, `tests/_scratch*.test.ts`, do produce errors; they are not mine and not staged.)
- `npx vite build` — green.
- `npx vitest run` — 1600 passed, 5 failed. All five are the concurrent Task 5 agent's
  in-progress course work (`tests/course/lessons.test.ts` ×2, `tests/course/uwb-aoa.test.ts`,
  `tests/course/uwb-coexist.test.ts`, `tests/engine/lesson-hashes.test.ts`), caused by their
  edits to `src/course/curriculum.ts` / `lessons.ts` adding `uwb-mms`. `tests/ui` and
  `tests/editor` are 212/212 green. The lesson-hash fixture was not touched by this task.

## Judgement calls
1. **`parseNbChannels` lives in `planOps.ts`** (the brief's own suggestion, and the sibling of
   `clampSixGhzCenterMhz`), so `src/uwb/ui/` now imports one pure helper from `src/editor/` —
   the first such import in the repo. A comment at the import says why. If the reviewer prefers
   the existing direction (editor → uwb only), the function belongs in `src/ui/inputs.ts`,
   which is outside this task's file ownership.
2. **The disabled Method select shows whatever the session stores.** `uwbModePatch('mms')` does
   not force `method: 'ss'`, and an existing test pins that patch's exact shape, so a session
   that was on DS-TWR before switching to MMS still reads "DS-TWR" while greyed out. The hint
   explains that MMS ranges single-sided regardless, and the engine ignores the field in MMS.
3. **The 0.5 ms slot is stated as the draft's default, not the session's.** `DEFAULT_UWB_SESSION`
   carries `slotRstu` 2400 (2 ms), so the Guide and the README both say the draft's own default
   is 600 RSTU and that `slotRstu` is the field that sets it; the 28-slot round and the 1.5 mm
   figure are qualified against it rather than presented as what the shipped default does.
4. **No `see` pointer in the glossary** — `GlossaryItem` has only `term`, `alt` and `def`.

---

# Fix round 1

Commit: `5cb5b42 fix(docs): MMS hints tell the truth in MMS mode; the channel-list parser lives with the inputs; three prose claims trimmed`
(10 files, +279/−104). Rebased on `2f98242` (Task 3 fix round) and `365ddfa` (Task 5's lesson);
neither was reverted, and `tests/fixtures/lesson-hashes.json` was not staged by me.

## Important

**1. Two disabled-field hints were false in MMS.** `oneWay` was "every mode that is not TWR", so
an MMS session explained its greyed-out AoA checkbox with "the anchors only receive a frame from
the tag in two-way ranging: in DL-TDoA the tag never transmits…" and its greyed-out Schedule
select with "the one-way modes are time-scheduled only". An MMS tag transmits and an MMS range is
two-way, so both were wrong in kind, not just in wording.

- The binding is renamed `nonTwr`, with a comment saying why it is not `oneWay`.
- Two new strings, EN + ZH: `uwbAoaMms` (the ranging signal is a bare sequence — no preamble, no
  SFD, no PHR — so there is nothing for a two-antenna array to compare the phase of; it is the
  signal, not the direction of the exchange) and `uwbScheduleMms` (the cycle is laid out pair by
  pair and millisecond by millisecond before the block starts, so no window is left to contend
  for; picking the mode also takes the slot to the draft's 600 RSTU).
- Two pure exported pickers, `uwbAoaHintKey(mode)` and `uwbScheduleHintKey(mode, method)`, so the
  choice is testable without rendering. In MMS the mode's reason wins over `uwbSsOnly`, because
  the Method select is disabled there too and the user cannot act on the method reason.
- `tests/editor/uwb-planOps.test.ts` gains a `why a field is greyed out` describe: the key per
  mode (and per method), plus an assertion that neither MMS string says "one-way"/"单向" or
  "never transmits"/"从不发射|根本不发射" in either language, and that each says what is true.

**2. `parseNbChannels` no longer creates a `uwb/ui → editor` edge.** The general half moved to
`src/ui/inputs.ts` as `parseIntList(raw, lo, hi, maxEntries)` — the leaf module whose own
docstring exists for this — and the narrowband bounds stay in the panel that owns the field:

```ts
export function parseNbChannels(raw: string): number[] | null {
  return parseIntList(raw, 0, NB_CHANNELS - 1, NB_CHANNELS)
}
```

`planOps.ts` lost the function and its `NB_CHANNELS` import. The schema-agreement test stays in
`tests/editor/uwb-planOps.test.ts` (it needs the schema) and now imports from the panel; the new
`tests/ui/inputs.test.ts` covers `parseIntList` itself, including the `''.split(',') === ['']`
case that a bare length check would let through.

## Minor

3. **"far longer than the entire UWB exchange it carries"** was false for the default train
   (576 µs POLL against 8 × 82.05 = 656 µs). Guide EN and ZH now say a single POLL outlasts any
   *one* fragment several times over, quoting 576 µs against the default RSF's 82.05 µs.
   `src/uwb/nb.ts`'s module docstring carried the same claim and is corrected the same way —
   **this is the one file outside the stated pathspec that I touched**; it is a comment only, no
   code or number changed, and the review's item 3 invited it. Flagging it explicitly.
4. "at the layout's 0.5 ms reply" → "at a 0.5 ms reply (the draft's default slot, which the
   editor's MMS mode now uses)", EN and ZH, matching the glossary's wording.
5. `mmsSetIdOf` now compares `gapMs` as well — the reviewer's preferred option. Every set is
   specified at Z = 1, so a session at Z = 2 is not that set. The `gapMs: 2` test flipped from
   `toBe('rsf-1')` to `toBeNull()`, the `MmsSetFields` type and its comment now cover six fields,
   and the EditorGuide claim ("can never claim a set the session is not") is true as written —
   both languages now say "those six… Z included, since every set is specified at Z = 1".
6. The derived line divided 37 nJ by the RSF length even at `rsfs: 0`, where the only fragment is
   the RIF. It uses `mmsLongestFragmentNs(mms)` for the power now and prints that length beside
   the RSF's: `RSF … µs · longest fragment … µs at … dBm · round … slots · … ms` (`uwbMmsDerived`
   gained a parameter, EN + ZH). An empty train falls back to the RSF length rather than dividing
   by zero on the way to the screen — the schema refuses one, but the editor can be there mid-edit.
7. The "holds all three of the round trip, the reply time and the clock ratio" claim was checked
   against `device.ts`'s `onNbReport`, which falls back to the carrier-offset draw when the train
   gave no ratio. Reworded in `uwbReportHint` (EN + ZH), `EditorGuide` (EN + ZH) and Guide §12
   (EN + ZH): a range needs the round trip and the reply time, each side measures one of the two,
   and the ratio comes from the side's own train — or from the narrowband carrier estimate when
   that train gave it a single fragment.
8. Tests: the Guide's channel count is asserted as `250 channels` / `250 个信道` instead of a bare
   `250` that also matched "1…250". `EditorGuideEn`/`EditorGuideZh` are now exported (as
   `GuideEn`/`GuideZh` already were) and the EditorGuide test renders them, slices out the MMS
   section between its own heading and the next one, and asserts each language's markers inside
   that slice — so no marker can be satisfied by a comment or by another part of the panel.
9. The derived dBm is written with U+2212 like the Guide's `dbmFmt`; the dead `parts.length < 1`
   branch is gone (`split` never returns an empty array).

## Gates
- `npx tsc -b` — clean, no exclusions.
- `npx vite build` — green.
- `npx vitest run` — **114 files, 1653 tests, all passing** (Task 5's course work has landed, so
  the five failures reported in the first round are gone). `tests/ui` + `tests/editor` alone:
  13 files, 223 tests, green.
