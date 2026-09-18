### Task 6: Timeline, event log, inspector, scene

**Files:**
- Modify: `src/ui/laneLayout.ts` (`SpanKind`, `STATE_SPAN`, `HIT_ORDER`, `spanTooltip`), `src/ui/TimelineStrip.tsx` (`SPAN_COLORS`, `txColor`, slot ticks next to the collision-tick drawing: search `COLLISION`), `src/ui/format.ts` (`fmtRecord` cases; `decodeFrame` AMP rows), `src/ui/Inspector.tsx` (`NodeSection`: AMP rows), `src/ui/i18n.ts` (`tooltips.ampTrigger`, `ampAck`, `ampResp`, `ampWait`, `ampWaitNote`; `inspector.amp*`; legend items), `src/scene/nodes.ts` (tag mesh; `haloColor` already), `src/scene/effects.ts` (association line for tags: dashed teal)
- Test: `tests/ui/laneLayout.test.ts`, `tests/ui/format.test.ts`

**Interfaces (produced):** `SpanKind` gains `'slot'`; `Strings.tooltips` gains `ampTrigger: string; ampAck: (dst: string) => string; ampResp: (slot: number) => string; ampWait: string; ampWaitNote: string`; `Strings.inspector` gains `ampTag: string; aboc: string; abocHint: string; slot: string; slotHint: string; ampCounts: string; ampCountsHint: string; ampRound: string; ampRoundHint: string; satOut: string`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/laneLayout.test.ts` (append):
```ts
  it('an ampWait state opens a slot span and AMP frames get their tooltip names', () => {
    const recs: TLRecord[] = [
      { t: 0, seq: 0, type: 'MAC_STATE', node: 'tag-1#2g', state: 'ampWait' },
      { t: 100_000, seq: 1, type: 'MAC_STATE', node: 'tag-1#2g', state: 'tx' },
    ]
    const spans = recordsToSpans(recs, ['tag-1#2g'], 0, 200_000)
    expect(spans[0]).toMatchObject({ kind: 'slot', startNs: 0, endNs: 100_000 })
    const lines = spanTooltip(spans[0], STRINGS.en.tooltips)
    expect(lines[0]).toContain(STRINGS.en.tooltips.ampWait)
  })
```
`tests/ui/format.test.ts` (append):
```ts
  it('formats the four AMP records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ROUND', node: 'ap#2g', phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250, untilNs: 3_000_000 })).toBe('ap#2g AMP round (random): 4 slots × 272.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_SLOT', node: 'ap#2g', slot: 2, untilNs: 1_000_000 })).toBe('ap#2g AMP slot 2 until 0.001 000 000')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 1, acw: 3, slot: 2 })).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 3, acw: 3, slot: null })).toBe('tag-1#2g ABOC 3 of [0, 3] → sits out')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: true })).toBe('tag-1#2g slot 2: acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: false })).toBe('tag-1#2g slot 2: not acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 3, sent: false, acked: false })).toBe('tag-1#2g slot 3: missed its cue')
  })
```

- [ ] **Step 2: Run to see them fail** — `npx vitest run tests/ui` → FAIL.

- [ ] **Step 3: Implement**

`laneLayout.ts`: `export type SpanKind = 'tx' | 'rx' | 'backoff' | 'defer' | 'nav' | 'sifs' | 'slot'`; `STATE_SPAN.ampWait = 'slot'`; `HIT_ORDER.slot = 2`; `spanTooltip`: `case 'slot': return [`${T.ampWait} · ${dur}`, T.ampWaitNote]`; in the `tx` case add before `f.kind === 'rts'`: `f.kind === 'ampTrigger' ? T.ampTrigger : f.kind === 'ampAck' ? T.ampAck(dst) : f.kind === 'ampResp' ? T.ampResp(f.amp?.slot ?? 0) :`; the rate line for AMP frames: `f.amp ? `${f.amp.kbps} kb/s OOK` : …`.

`TimelineStrip.tsx`: `SPAN_COLORS.slot = '#115e59'`; `txColor`: `ampTrigger`/`ampAck` → `'#2dd4bf'`, `ampResp` → `'#a78bfa'`. Slot ticks: where collision ticks are drawn from records of type `COLLISION`, also draw a 1 px `#2dd4bf` vertical tick at each `AMP_SLOT` record's `t` on that record's lane (the AP's 2g lane), full lane height, alpha 0.6.

`format.ts` `fmtRecord`:
```ts
    case 'AMP_ROUND': return `${r.node} AMP round (${r.phase}): ${r.slots} slots × ${fmtUs(r.slotNs)}, ACW ${2 ** r.acwe - 1}, DL ${r.dlKbps} kb/s, UL ${r.ulKbps} kb/s`
    case 'AMP_SLOT': return `${r.node} AMP slot ${r.slot} until ${fmtNs(r.untilNs)}`
    case 'AMP_ABOC': return `${r.node} ABOC ${r.aboc} of [0, ${r.acw}] → ${r.slot === null ? 'sits out' : `slot ${r.slot}`}`
    case 'AMP_RESULT': return `${r.node} slot ${r.slot}: ${!r.sent ? 'missed its cue' : r.acked ? 'acknowledged' : 'not acknowledged'}`
```
`decodeFrame` (the event-log table): for `f.amp` push rows `AMP rate: ${kbps} kb/s (Manchester OOK)`, and for triggers `Slots`, `Slot duration`, `ACWE`, `Phase`; for Acks `Acknowledges slot`; for responses `Slot`, `ABOC`.

`Inspector.tsx` `NodeSection`: when `nv.amp` render instead of the AC table:
```tsx
      <div style={row}><Lbl hint={L.abocHint}>{L.aboc}</Lbl><span>{nv.amp.aboc ?? '—'} / [0, {nv.amp.acw}]</span></div>
      <div style={row}><Lbl hint={L.slotHint}>{L.slot}</Lbl><span>{nv.amp.slot ?? '—'}</span></div>
      <div style={row}><Lbl hint={L.ampCountsHint}>{L.ampCounts}</Lbl><span>{nv.amp.sent} / {nv.amp.acked} / {nv.amp.lost}</span></div>
      <div style={row}><span style={dim}>{L.satOut}</span><span>{nv.amp.roundsSatOut} / {nv.amp.roundsHeard}</span></div>
```
and skip the queue/QSRC/NAV/IFS/CCA rows for tags. When `nv.ampRound` (AP): `<div style={row}><Lbl hint={L.ampRoundHint}>{L.ampRound}</Lbl><span>{nv.ampRound.phase} · slot {nv.ampRound.slot}/{nv.ampRound.slots} · {nv.ampRound.received.map(nameOf).join(', ') || '—'}</span></div>`. `StateBadge` colours: `ampWait: '#0d9488'`.

`i18n.ts` (both languages; zh in natural Simplified Chinese):
- tooltips: `ampTrigger: 'AMP Trigger — the AP opens uplink slots for ambient-power tags'`, `ampAck: (dst) => `AMP Ack → ${dst} — closes a slot and cues the next one``, `ampResp: (slot) => `AMP response in slot ${slot}``, `ampWait: 'waiting for its slot'`, `ampWaitNote: 'A tag has no carrier sense: it counts the AP’s Acks and transmits one AMP SIFS (10 µs) after the Ack that opens its slot.'`.
- inspector: `ampTag: 'AMP tag'`, `aboc: 'ABOC'`, `abocHint: 'AMP backoff counter drawn uniformly in [0, ACW] on each random-access trigger; ABOC < N picks slot ABOC + 1'`, `slot: 'slot'`, `slotHint: 'the uplink slot this tag will use in the current round'`, `ampCounts: 'sent / acked / lost'`, `ampCountsHint: 'responses transmitted, acknowledged by the following AMP Ack, and lost (collision, weak signal or a missed cue)'`, `ampRound: 'AMP round'`, `ampRoundHint: 'the polling round in progress on this link and who has answered so far'`, `satOut: 'sat out / heard'`.
- legend: `{ color: '#2dd4bf', label: 'AMP DL', hint: 'AMP Trigger or AMP Ack: a 2.4 GHz OOK PPDU behind a legacy preamble, addressed to ambient-power tags.' }`, `{ color: '#a78bfa', label: 'AMP UL', hint: 'A tag’s OOK response inside the slot it drew; no preamble Wi-Fi radios can see.' }`, `{ color: '#115e59', label: 'slot wait', hint: 'A tag armed for a later slot, counting the AP’s Acks.' }`.

`scene/nodes.ts` `buildNodeGroup`: for `n.kind === 'amp'` a flat disc `CylinderGeometry(0.12, 0.12, 0.02, 16)` in `0x2dd4bf`; `appLine` returns `''` for tags. `effects.ts`: draw the association line for tags too (`n.kind !== 'ap'`), colour `0x2dd4bf` opacity 0.12.

- [ ] **Step 4: Run** — `npx vitest run tests/ui && npx tsc -b && npm run build` → PASS.

- [ ] **Step 5: Look at it** — with the `run` skill or `npm run dev`, load a scenario with an AMP AP and two tags (Task 8 adds the editor; until then paste the JSON of `scenario()` from `tests/engine/amp-ap.test.ts` through Import). Check: teal trigger/Ack blocks on the AP's 2.4G lane, violet responses on tag lanes, slot ticks, the slot-wait span, the inspector rows.

- [ ] **Step 6: Commit** — `git commit -am "feat(ui): AMP frames, slots and tag state in the timeline, log, inspector and scene"`

---

