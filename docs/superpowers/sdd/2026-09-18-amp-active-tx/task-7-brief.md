### Task 7: Frame detail for AMP frames

**Files:**
- Modify: `src/model/frameFields.ts` (`FieldKey`, `PpduSegmentKey`, `controlMpdu`, `ppduLayout`), `src/ui/i18n.ts` (`frameDetail.fields.name`, `frameDetail.fields.segment`, `whatIs`/`next` final text), `src/ui/FrameDetail.tsx` (only if a segment or field needs special rendering; the generic tables should just work)
- Test: `tests/model/frameFields.test.ts`

**Interfaces:** `FieldKey` gains `'ampId' | 'ampTdc' | 'ampStaList'`; `PpduSegmentKey` gains `'usig' | 'ampSync' | 'ampSig' | 'ampData' | 'signalExt'`.

- [ ] **Step 1: Write the failing tests** (append to `tests/model/frameFields.test.ts`; build the three frames with the Task 1 builders):
```ts
describe('AMP frames decode to their P802.11bp fields and PPDU layout', () => {
  const ctx = { apId: 'ap', isEdca: true }
  it('trigger: FC 1, ID 2, TDC 2, body 6, FCS 2 = 13 octets; PPDU segments sum to TXTIME', () => {
    const f = ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: 6_000 })
    const d = decodeFrame(f, ctx)
    const fields = d.users[0].subframes[0].mpdu.fields
    expect(fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['ampTdc', 2], ['body', 6], ['fcs', 2]])
    expect(d.bytes).toBe(13)
    expect(d.ppdu.map((s) => s.key)).toEqual(['legacyPreamble', 'signal', 'usig', 'ampSync', 'ampSig', 'ampData', 'padding', 'signalExt'])
    expect(d.ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(f.txTimeNs)
    expect(d.ppdu.find((s) => s.key === 'ampSig')!.durNs).toBe(64_000)
  })
  it('scheduled trigger lists STA ids; Ack is 4 octets with an 8-bit CRC; response carries its reading', () => {
    const t = ampTriggerFrame({ src: 'ap', dlKbps: 1000, ulKbps: 1000, phase: 'scheduled', slots: 2, slotNs: 132_000, acwe: 0, sessionId: 1, staIds: ['tag-1', 'tag-2'], reading: true, roundNs: 0, signalExtNs: 6_000 })
    expect(decodeFrame(t, ctx).users[0].subframes[0].mpdu.fields.find((x) => x.key === 'ampStaList')).toMatchObject({ bytes: 4 })
    const a = decodeFrame(ampAckFrame('ap', 'tag-1', 250, 2, 6_000), ctx)
    expect(a.users[0].subframes[0].mpdu.fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['fcs', 1]])
    const r = decodeFrame(ampRespFrame('tag-1', 'ap', 250, 2, 1, true), ctx)
    expect(r.users[0].subframes[0].mpdu.fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['ampTdc', 2], ['body', 8], ['fcs', 2]])
    expect(r.ppdu.map((s) => s.key)).toEqual(['ampSync', 'ampData'])
    expect(r.ppdu[0].durNs).toBe(48_000)
  })
})
```

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement** in `controlMpdu` (replace the Task 1 placeholder case):
```ts
    case 'ampTrigger': {
      const a = f.amp!
      const ids = a.phase === 'scheduled' ? a.staIds ?? [] : []
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Trigger' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, value: `AP ${ampId16(f.src).toString(16).padStart(4, '0')} (broadcast trigger)` },
        { key: 'ampTdc', bytes: 2, value: `${a.phase} · UL ${a.ulKbps ?? a.kbps} kb/s · seed 0` },
        { key: 'body', bytes: AMP_TRIGGER_BODY_BYTES, value: `Session ${a.sessionId} · ACWE ${a.acwe} (ACW ${2 ** (a.acwe ?? 0) - 1}) · ${a.slots} slots × ${usOf(a.slotNs ?? 0)} · ${a.reading ? 'reading' : 'id only'}` },
      ]
      if (ids.length) fields.push({ key: 'ampStaList', bytes: AMP_STA_ID_BYTES * ids.length, value: ids.map((id) => ampId16(id).toString(16).padStart(4, '0')).join(' ') })
      fields.push({ key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' })
      checkSize(fields, f.bytes)
      break
    }
    case 'ampAck':
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Ack' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, node: f.dst, value: f.dst === f.src ? 'AP id (nothing received)' : ampId16(f.dst).toString(16).padStart(4, '0') },
        { key: 'fcs', bytes: 1, value: 'CRC-8' },
      ]
      checkSize(fields, AMP_ACK_BYTES)
      break
    case 'ampResp': {
      const a = f.amp!
      fields = [
        { key: 'fc', bytes: 1, bits: [{ key: 'type', value: 'AMP Response' }, { key: 'protected', value: '0' }] },
        { key: 'ampId', bytes: 2, node: f.src, value: ampId16(f.src).toString(16).padStart(4, '0') },
        { key: 'ampTdc', bytes: 2, value: `slot ${a.slot}${a.aboc !== undefined ? ` · ABOC ${a.aboc}` : ''}` },
      ]
      if (a.reading) fields.push({ key: 'body', bytes: AMP_READING_BYTES, value: 'reading' })
      fields.push({ key: 'fcs', bytes: AMP_FCS_BYTES, value: 'CRC-16' })
      checkSize(fields, f.bytes)
      break
    }
```
`ppduLayout`: at the top, `if (f.amp) return ampPpduLayout(f)` with
```ts
function ampPpduLayout(f: FrameDesc): PpduSegment[] {
  const a = f.amp!
  if (a.dir === 'ul') {
    const sync = AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[a.kbps as AmpUlKbps]
    return [{ key: 'ampSync', durNs: sync }, { key: 'ampData', durNs: f.txTimeNs - sync }]
  }
  const sig = ampBitsNs(AMP_DL_SIG_BYTES * 8, a.kbps)
  const data = ampBitsNs(f.bytes * 8, a.kbps)
  const pad = a.padNs ?? AMP_PADDING_NS
  const ext = f.txTimeNs - (AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + sig + data + pad)
  const segs: PpduSegment[] = [
    { key: 'legacyPreamble', durNs: 16_000 }, { key: 'signal', durNs: 4_000 }, { key: 'usig', durNs: 12_000 },
    { key: 'ampSync', durNs: AMP_DL_SYNC_NS }, { key: 'ampSig', durNs: sig }, { key: 'ampData', durNs: data }, { key: 'padding', durNs: pad },
  ]
  if (ext > 0) segs.push({ key: 'signalExt', durNs: ext })
  return segs
}
```
`i18n.ts` `fields.name`: `ampId: 'ID (16-bit AMP identifier)'`, `ampTdc: 'Type Dependent Control'`, `ampStaList: 'STA ID list'`; `fields.segment`: `usig: 'RL-SIG + U-SIG (12 µs)'`, `ampSync: 'AMP-Sync (OOK chips)'`, `ampSig: 'AMP-SIG (2 octets)'`, `ampData: 'AMP-Data (Manchester OOK)'`, `signalExt: 'signal extension (6 µs)'`; zh equivalents. Finalise `whatIs`/`next` for the three kinds (two sentences each, both languages, citing "P802.11bp draft").

- [ ] **Step 4: Run** — `npx vitest run tests/model tests/ui && npx tsc -b` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(frame-detail): field-level decode and PPDU layout of AMP frames"`

---

