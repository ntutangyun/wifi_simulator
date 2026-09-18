### Task 6: UI: band labels, inspector link header, editor band selector

**Files:**
- Modify: `src/ui/names.ts` (line 14), `src/ui/Inspector.tsx` (lines 32, 197-200), `src/ui/TimelineStrip.tsx` (lines 88-97), `src/editor/FloorPlanEditor.tsx` (line 212 `setGeneration`; lines 577-585 the link select), `src/ui/i18n.ts` (`Strings.editor.link*`, `Strings.inspector.link*`, both tables)
- Test: `tests/ui/names.test.ts`, `tests/ui/i18n.test.ts`

**Interfaces:**
- Consumes: `BAND_LABEL`, `linkOfVirtual`, `physicalId`, `LinkId` from Task 4.
- Produces: `Strings.editor.bands: Record<LinkId, string>`; `Strings.inspector.linkName: Record<LinkId, string>` (replaces `link5`/`link6`).

- [ ] **Step 1: Write the failing tests**

In `tests/ui/names.test.ts` add to the first `it`:
```ts
    expect(nodeDisplayName(nodes, 'sta-1#2g', 'everyone')).toBe('Laptop (MLO) · 2.4G')
```
In `tests/ui/i18n.test.ts` add:
```ts
describe('band strings', () => {
  it.each(LANGS)('%s names every link in the editor and the inspector', (lang) => {
    for (const l of ['2g', '5g', '6g'] as const) {
      expect(STRINGS[lang].editor.bands[l]).toBeTruthy()
      expect(STRINGS[lang].inspector.linkName[l]).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/ui/names.test.ts tests/ui/i18n.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`names.ts`:
```ts
  const link = linkOfVirtual(id)
  return link === '5g' ? name : `${name} · ${BAND_LABEL[link]}`
```

`i18n.ts`: in `Strings.editor` add `bands: Record<LinkId, string>` (import `LinkId` type); in `Strings.inspector` replace `link5: string; link6: string` with `linkName: Record<LinkId, string>`. Tables:
- en: `bands: { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' }`, `linkName: { '2g': '2.4 GHz link', '5g': '5 GHz link', '6g': '6 GHz link' }`, and change `linkHint` to `'operating band; 802.11g and Wi-Fi 6/7 can use 2.4 GHz, Wi-Fi 6E/7 can use 6 GHz (MLO devices use 5 + 6 GHz)'`.
- zh: `bands: { '2g': '2.4 GHz', '5g': '5 GHz', '6g': '6 GHz' }`, `linkName: { '2g': '2.4 GHz 链路', '5g': '5 GHz 链路', '6g': '6 GHz 链路' }`, `linkHint: '工作频段；802.11g 与 Wi-Fi 6/7 可用 2.4 GHz，Wi-Fi 6E/7 可用 6 GHz（MLO 设备使用 5 + 6 GHz）'`.

`Inspector.tsx`: line 32 → `<strong>{L.linkName[linkOfVirtual(vid)]}</strong>`; lines 197-200 → `const phys = physicalId(selectedNodeId)`, and render every lane of the node, not just a 6g sibling:
```tsx
  const lanes = Object.keys(view.nodes).filter((vid) => physicalId(vid) === phys)
  return (
    <div style={{ padding: 10, overflowY: 'auto' }}>
      <strong>{cfg?.name ?? phys}</strong>
      {lanes.map((vid, i) => (
        <div key={vid} style={i > 0 ? { borderTop: '1px solid var(--border)', marginTop: 8 } : undefined}>
          <NodeSection vid={vid} nv={view.nodes[vid]} t={t} L={L} nameOf={nameOf} serverName={serverName} />
        </div>
      ))}
      <div style={{ ...dim, marginTop: 8, fontSize: 11 }}>t = {fmtNs(t)} s</div>
    </div>
  )
```

`TimelineStrip.tsx` lines 88-97:
```ts
  const bandTag = (vid: string): string => plan.links.length < 2 ? '' : BAND_LABEL[linkOfVirtual(vid)]
  const laneLabel = (vid: string): [string, string] => {
    const cfg = scenario.nodes.find((n) => n.id === physicalId(vid))
    const name = cfg?.name ?? vid
    return plan.links.length < 2 ? [name, ''] : [name, ` · ${BAND_LABEL[linkOfVirtual(vid)]}`]
  }
```

`FloorPlanEditor.tsx`:
- line 212: `linkId: gen === 'vht' ? undefined : n.linkId`
- lines 577-585: show the select when `selNode.caps.generation !== 'vht' && selNode.caps.features.mlo !== true`; options from `(['2g', '5g', '6g'] as LinkId[]).filter((l) => l !== '6g' || selNode.caps.generation === 'he' || selNode.caps.generation === 'eht')`, labelled `E.bands[l]`; `onChange` writes `linkId: e.target.value as LinkId`.

- [ ] **Step 4: Run UI tests and the build**

Run: `npx vitest run tests/ui && npx tsc -b && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Try it in the app**

Run `npm run dev`, open the editor, select a station, set Wi-Fi to Wi-Fi 6 and Link to 2.4 GHz, switch to Simulate: the lanes read "Router · 5G", "Router · 2.4G", "… · 2.4G"; the inspector on the router shows both link sections. (Use the `run` skill if available.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/names.ts src/ui/Inspector.tsx src/ui/TimelineStrip.tsx src/editor/FloorPlanEditor.tsx src/ui/i18n.ts tests/ui/names.test.ts tests/ui/i18n.test.ts
git commit -m "feat(ui): 2.4 GHz band in lanes, inspector and the editor's band selector"
```

---

