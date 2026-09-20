### Task 4: Editor fields, i18n, Guide, glossary, README, EditorGuide

**Files:** modify `src/uwb/ui/UwbSessionFields.tsx` (MMS section), `src/ui/i18n.ts`, `src/editor/planOps.ts` (if the
NB list needs a parser), `src/ui/Guide.tsx` (§12 EN + ZH), `src/ui/glossary.ts`, `README.md`, `src/editor/EditorGuide.tsx`;
tests `tests/editor/uwb-planOps.test.ts` (+3), `tests/ui/uwb-guide.test.ts` (+3), `tests/ui/glossary.test.ts` (language separation already runs).

- [ ] Editor: mode option "narrowband-assisted MMS (802.15.4ab draft)" / "窄带辅助 MMS（802.15.4ab 草案）"; in MMS
  mode: parameter-set select (17 ids + custom; picking a set writes its five PHY fields, editing a field switches
  the select to custom), `rsfs`/`rifs`/`nMsr`/`stsLen` selects over their sets, `gap` number 0…64, `gapMs` select,
  `nbChannels` text (comma-separated, parsed and validated, invalid text keeps the last good list and shows the schema
  message), `nbLbt` and `report` selects; the SS/DS select disabled with the hint. Every hint EN + ZH.
- [ ] Guide §12 (EN + ZH): what MMS is, the millisecond budget and 10·log10(X), the fragment kinds and RMARKER, the
  narrowband control channel and its LBT, the pairwise cycle table, the draft disclaimer, Known simplifications
  (the spec's list). Glossary: MMS, RSF, RIF, MMRS, N_MSR, NBA-UWB, NB control channel, LBT / frame-based equipment,
  millisecond energy budget, coherent combining, train-derived clock ratio. README: "Draft status" paragraph +
  conformance rows with tags. EditorGuide: the MMS section.
- [ ] Commit `docs(uwb): 802.15.4ab in the editor, Guide, glossary and README`.

---

