### Task 7: Minimal UI — event log, lanes, inspector, frame detail, node meshes, no-AP audit

**Files:**
- Create: `src/uwb/format.ts`, `src/uwb/frameFields.ts`, `src/uwb/ui/UwbInspector.tsx`
- Modify: `src/ui/format.ts`, `src/ui/laneLayout.ts`, `src/ui/TimelineStrip.tsx`, `src/ui/Inspector.tsx`, `src/ui/FrameDetail.tsx`, `src/model/frameFields.ts`, `src/ui/i18n.ts`, `src/ui/names.ts`, `src/scene/nodes.ts`, `src/scene/effects.ts`
- Test: `tests/ui/uwb-format.test.ts`, `tests/model/uwb-frameFields.test.ts`, `tests/ui/uwb-lanes.test.ts`

**Interfaces:**

```ts
// src/uwb/format.ts
export function fmtUwbRecord(r: Extract<TLRecord, { type: `UWB_${string}` }>): string
//  UWB_ROUND   `${node} UWB round ${round} of block ${block} (${method.toUpperCase()}-TWR): ${slots} slots × ${fmtUs(slotNs)}`
//  UWB_SLOT    `${node} UWB slot ${slot} until ${fmtNs(untilNs)}`
//  UWB_TS      `${node} ${dir.toUpperCase()} RMARKER ${dir === 'tx' ? '→' : '←'} ${peer} ${kindShort}: counter ${counter}${fom ? ` (${fomText(fom)})` : ''}`   kindShort: poll | resp | final | report
//  UWB_RANGE   `${node} range → ${peer} (${method.toUpperCase()}): ${distM.toFixed(2)} m (true ${trueDistM.toFixed(2)} m${tofRawRctu !== undefined ? `, raw ${rctuToMetres(tofRawRctu).toFixed(2)} m` : ''})`
//  UWB_POSITION `${node} position (${x.toFixed(2)}, ${y.toFixed(2)}) m, true (${trueX.toFixed(2)}, ${trueY.toFixed(2)}), error ${err.toFixed(2)} m, GDOP ${gdop.toFixed(2)}, ${anchors.length} anchors`
//  UWB_TIMEOUT `${node} UWB slot ${slot}: no ${kindShort} from ${peer}`
// src/ui/format.ts: fmtRecord's switch gets `default: return fmtUwbRecord(r as never)` for the UWB types (keep exhaustive typing: handle the six types explicitly by delegating).

// src/uwb/frameFields.ts
export function uwbFrameFields(f: FrameDesc): DecodedFrame       // same DecodedFrame shape frameFields.ts uses: MHR fields (Frame Control 2, Sequence Number 1, Destination PAN ID 2, Destination Address 2, Source Address 2), one field per IE with its bytes and a value string (e.g. RRTI `reply time 127 803 RCTU = 2.000 ms`), FCS 2 — byte sum === f.bytes
export function uwbPpduLayout(f: FrameDesc): PpduSegment[]        // SYNC 65 128 ns, SFD 8 141, STS gap 1 026, STS active 65 641, STS gap 1 026, PHR 19 487, PSDU = remainder so the sum === f.txTimeNs (assert in test); segment keys added to the PpduSegment key union: 'sync' | 'sfd' | 'stsGap' | 'sts' | 'phr' | 'psdu'
// src/model/frameFields.ts: decodeFrame / ppduLayout delegate to the two functions for the four UWB kinds; FrameDetail's `ap` lookup no longer gates decoding (pass `apId: ap?.id ?? ''`).
```

Other hooks:
- `laneLayout.ts`: `STATE_SPAN.uwbWait = 'slot'`; whatever `Record<FrameKind, …>` colour/label tables exist in `laneLayout.ts`, `TimelineStrip.tsx`, `i18n.ts` (`frameDetail.kindName`, `whatIs`, `next`) get the four kinds (amber `#f59e0b` for tag frames, `#fbbf24` for anchor frames).
- `TimelineStrip.tsx`: `nodeIds = laneIds(scenario.nodes)`; the AP lookup becomes optional (`?.id ?? ''`); lane label for a UWB id = its name, no band suffix.
- `names.ts`: `nodeDisplayName` — a UWB node's id is not a virtual id: return its name with no suffix (check `cfg.kind === 'uwb'` before the link logic).
- `Inspector.tsx`: when `nv.uwb` render `<UwbInspector nv={nv} nameOf={nameOf} />` instead of the Wi-Fi rows (like the `!nv.amp` guards). `UwbInspector` shows: role, block / round / slot, a table (peer, measured m, true m, error cm, FoM text, rounds), and for a tag the position row (est, true, error cm, GDOP, ellipse `a × b cm`).
- `scene/nodes.ts`: `kind === 'uwb'` → anchor: a 0.25 m box, colour `#f59e0b`; tag: a 0.16 × 0.08 × 0.02 slab, colour `#fbbf24`; label as for other nodes; `haloColor` for `uwbWait` = `0xd97706`.
- `scene/effects.ts`: `apId` optional (no association lines when there is no AP; UWB nodes get no lines); `frameColor` for the four kinds (amber).
- `i18n.ts`: a `uwb` section: `{ anchor, tag, role, blockRound, slot, ranges, peer, measured, trueDist, error, fom, rounds, position, estimate, gdop, ellipse, noPosition, timeouts }` in EN and ZH; `inspector` strings reused where they fit.

- [ ] **Step 1: Write the failing tests.**
  - `tests/ui/uwb-format.test.ts`: one line per record type equals the format above (use fixed inputs; `fmtRecord` on a UWB record returns the same string as `fmtUwbRecord`).
  - `tests/model/uwb-frameFields.test.ts`: for `makePoll('tag',['a1','a2','a3','a4'],'ds',0,0)`, `makeResp('a1','tag','ss',0,0,1,127_803)`, `makeFinal(…4 entries…)`, `makeReport(…)`: byte sums equal `bytes`; segment sums equal `txTimeNs`; the PSDU segment of the 62-octet Final is `236_603` minus the other segments (each segment rounded to whole ns on its own, PSDU = remainder).
  - `tests/ui/uwb-lanes.test.ts`: `recordsToSpans` over a MAC_STATE `uwbWait` → `idle` pair yields one `slot` span; `laneIds` order in the strip's inputs (pure function check).
- [ ] **Step 2: Run** — failures. **Step 3: Implement** all hooks; run the dev build (`npx vite build`) to catch JSX errors. **Step 4:** `npx vitest run` and `npx tsc -b` green.
- [ ] **Step 5: Commit** `feat(ui): UWB lanes, event log, inspector, frame detail and node meshes; no-AP audit`.

---

