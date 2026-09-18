### Task 8: Editor: AMP tag tool and the AP's AMP polling section

**Files:**
- Modify: `src/editor/FloorPlanEditor.tsx` (tools row near line 294; node creation near 129; SVG node circle 390-394; object list 417-419; properties 521-660), `src/editor/planOps.ts` (`spawnRandomStas` untouched; add `newTag(scenario, pos)` helper), `src/ui/i18n.ts` (`editor.tools.tag`, `editor.amp*`), `src/editor/EditorGuide.tsx` (one paragraph on tags, both languages)
- Test: `tests/editor/planOps.test.ts`

**Interfaces:** `newTag(sc: Scenario, pos: { x: number; y: number }): { sc: Scenario; id: string }` returns the scenario with a node `{ id: 'tag-N', kind: 'amp', name: 'Tag N', pos: { …, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: {} }`.

- [ ] **Step 1: Write the failing test**
```ts
  it('newTag appends an AMP tag on 2.4 GHz with a fresh id', () => {
    const { sc, id } = newTag(defaultScenario(), { x: 3, y: 3 })
    const n = sc.nodes.find((x) => x.id === id)!
    expect(n).toMatchObject({ kind: 'amp', linkId: '2g', txPowerDbm: 0, profiles: ['idle'] })
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    const again = newTag(sc, { x: 4, y: 4 })
    expect(again.id).not.toBe(id)
  })
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement**
- `planOps.ts`: `newTag` as specified (id = `tag-${k}` with the smallest free k).
- Editor tools row: a `🏷 AMP tag` button (`E.tools.tag`); clicking the canvas with that tool active calls `newTag` and selects the node (mirror the `sta` tool's code path at line 129).
- SVG: tag circle radius 0.2, fill `#2dd4bf`; object list dot `#2dd4bf`; the generation short label is replaced by `AMP` for tags.
- Properties for a tag: name, position, `E.txPower`, and `E.ampSens` (number input bound to `ampTag.dlSensDbm`, default −72, hint `E.ampSensHint`). Hide the Wi-Fi generation/features/traffic/link/tamper sections when `selNode.kind === 'amp'` (wrap those blocks in `selNode.kind !== 'amp' && (...)`).
- Properties for the AP when `caps.generation === 'eht'`: a section `E.amp` with a checkbox `E.ampEnable` that sets `ampAp: { ...DEFAULT_AMP_AP }` or `undefined`; when enabled: number inputs for `pollIntervalMs` (10–10000), `slots` (1–16), `acwe` (0–4), selects for `dlKbps` (250, 1000), `ulKbps` (250, 1000, 4000), `protection` (`E.ampProt.ctsSelf` / `.none`), `readMode` (`E.ampRead.inline` / `.twoPhase`); each with a one-line hint. If the AP is not EHT show `E.ampNeedsEht`.
- i18n (en, zh): `tools.tag: '🏷 AMP tag'`, `amp: 'AMP polling (802.11bp)'`, `ampEnable: 'poll ambient-power tags'`, `ampInterval: 'poll every'`, `ampIntervalHint: 'how often the AP contends (AC_BK) for an AMP round'`, `ampSlots: 'slots (N)'`, `ampAcwe: 'ACWE'`, `ampAcweHint: 'ACW = 2^ACWE − 1: the range a tag draws its slot counter from'`, `ampDl: 'DL rate'`, `ampUl: 'UL rate'`, `ampProt: { ctsSelf: 'CTS-to-self before the round', none: 'no protection' }`, `ampRead: { inline: 'reading in the random-access response', twoPhase: 'id first, then a scheduled read' }`, `ampNeedsEht: 'AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)'`, `ampSens: 'DL sensitivity'`, `ampSensHint: 'weakest AMP DL PPDU this tag’s envelope detector can decode (model default −72 dBm)'`.
- `EditorGuide.tsx`: a paragraph under the nodes section: what a tag is, that it lives on 2.4 GHz, that the AP needs Wi-Fi 7 and the AMP polling section.

- [ ] **Step 4: Run** — `npx vitest run tests/editor tests/ui && npx tsc -b && npm run build` → PASS. Then in the app: place two tags, enable AMP polling on the router, simulate, confirm the round appears.

- [ ] **Step 5: Commit** — `git commit -am "feat(editor): AMP tags and the AP's AMP polling settings"`

---

