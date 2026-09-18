### Task 3: Channel: radio kinds, AMP detection and decode thresholds

**Files:**
- Modify: `src/engine/channel.ts` (`RadioState`, `register`, `applyOneTx`, `detectOrMiss`, `decodeThreshDb`, `captureWindowNs`, `othersMw`, `interferenceMw`, `updateAllCca`)
- Test: `tests/engine/amp-collision.test.ts`

**Interfaces (produced):**
```ts
export interface RadioOpts {
  /** 'wifi' (default) decodes 802.11 PPDUs and DL AMP PPDUs' legacy preamble; 'tag' decodes only DL AMP PPDUs. */
  kind?: 'wifi' | 'tag'
  /** Wi-Fi radio that can also decode UL AMP PPDUs (the AMP AP). */
  ampCapable?: boolean
  /** Tags: minimum RSSI to detect a DL AMP PPDU (default AMP_TAG_DL_SENS_DBM). */
  floorDbm?: number
  /** false: never emit CCA records nor call onCcaBusy/onCcaIdle (tags have no carrier sense). */
  cca?: boolean
}
register(nodeId: string, listener: PhyListener, opts?: RadioOpts): void
```

Rules (`private detectFloorDbm(r: RadioState, frame: FrameDesc): number | null`, null = undetectable):
- `frame.amp?.dir === 'ul'`: `r.ampCapable ? ampUlSensDbm(kbps) : null`.
- `frame.amp?.dir === 'dl'`: `r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM`.
- Wi-Fi frame: `r.kind === 'tag' ? null : CCA_PD_DBM`.

`decodeThreshDb(frame, rid, r)`: UL AMP → `AMP_UL_REQ_SINR_DB[kbps]`; DL AMP → tag: `AMP_DL_REQ_SINR_DB`, Wi-Fi: `sinrThreshDb(6)`; otherwise unchanged. `captureWindowNs`: AMP DL → `AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS`; AMP UL → `AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[kbps]`. Noise bandwidth for AMP UL frames: `AMP_UL_BW_MHZ[kbps]` instead of `frame.widthMhz ?? 20` (in `detectOrMiss` and `interferenceMw`). `updateAllCca`: `anyPd` only counts frames whose `amp?.dir !== 'ul'`; radios with `cca === false` are skipped entirely.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/engine/amp-collision.test.ts
import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { ampAckFrame, ampRespFrame, ampTriggerFrame } from '../../src/engine/amp'
import type { FrameDesc } from '../../src/model/frames'

function world(links: Record<string, number>, radios: { id: string; opts?: Parameters<Channel['register']>[2] }[]) {
  const q = new EventQueue()
  let now = 0
  const ids = radios.map((r) => r.id)
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -200]))]))
  const records: TLRecord[] = []
  const ch = new Channel(q, () => now, table, makeEmitter((r) => records.push(r)))
  const heard: Record<string, string[]> = {}
  for (const r of radios) {
    heard[r.id] = []
    const l: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk(_t, f, from) { heard[r.id].push(`${f.kind}:${from}`) }, onRxCorrupt() {} }
    ch.register(r.id, l, r.opts)
  }
  const run = (t: number) => { for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() } now = t }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  return { ch, records, heard, run, at }
}
const trigger = (): FrameDesc => ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: 6_000 })

describe('AMP frames on the channel', () => {
  it('a tag decodes a DL AMP PPDU above its floor and never a Wi-Fi frame', () => {
    const w = world({ 'ap>tag': -60, 'ap>sta': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }, { id: 'sta' }])
    w.at(0, () => w.ch.startTx('ap', trigger()))
    w.run(1_000_000)
    expect(w.heard.tag).toEqual(['ampTrigger:ap'])
    expect(w.heard.sta).toEqual(['ampTrigger:ap']) // the legacy preamble + L-SIG decode
    const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 }
    w.at(2_000_000, () => w.ch.startTx('ap', cts))
    w.run(3_000_000)
    expect(w.heard.tag).toEqual(['ampTrigger:ap'])
    expect(w.records.some((r) => r.type === 'CCA_BUSY' && r.node === 'tag')).toBe(false)
  })
  it('a tag below its DL floor never hears the trigger', () => {
    const w = world({ 'ap>tag': -75 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false, floorDbm: -72 } }])
    w.at(0, () => w.ch.startTx('ap', trigger()))
    w.run(1_000_000)
    expect(w.heard.tag).toEqual([])
  })
  it('the AP decodes a UL response down to −94 dBm at 250 kb/s; a plain Wi-Fi station cannot detect it', () => {
    const w = world({ 'tag>ap': -93, 'tag>sta': -30 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }, { id: 'sta' }])
    w.at(0, () => w.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w.run(1_000_000)
    expect(w.heard.ap).toEqual(['ampResp:tag'])
    expect(w.heard.sta).toEqual([])
    expect(w.records.some((r) => r.type === 'CCA_BUSY' && r.node === 'sta' && r.cause === 'energy')).toBe(true)
    const w2 = world({ 'tag>ap': -96 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'tag', opts: { kind: 'tag', cca: false } }])
    w2.at(0, () => w2.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w2.run(1_000_000)
    expect(w2.heard.ap).toEqual([])
  })
  it('two tags in one slot collide at the AP; a 5 dB stronger one is captured', () => {
    const w = world({ 'a>ap': -60, 'b>ap': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w.at(0, () => { w.ch.startTx('a', ampRespFrame('a', 'ap', 250, 1, 0, false)); w.ch.startTx('b', ampRespFrame('b', 'ap', 250, 1, 0, false)) })
    w.run(1_000_000)
    expect(w.heard.ap).toEqual([])
    expect(w.records.some((r) => r.type === 'COLLISION' && r.nodes.includes('a') && r.nodes.includes('b'))).toBe(true)
    const w2 = world({ 'a>ap': -55, 'b>ap': -70 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w2.at(0, () => { w2.ch.startTx('b', ampRespFrame('b', 'ap', 250, 1, 0, false)) })
    w2.at(10_000, () => { w2.ch.startTx('a', ampRespFrame('a', 'ap', 250, 1, 0, false)) }) // inside b's 48 µs sync: capture
    w2.run(1_000_000)
    expect(w2.heard.ap).toEqual(['ampResp:a'])
  })
  it('an Ack addressed to one tag is still decoded by every tag in range', () => {
    const w = world({ 'ap>a': -60, 'ap>b': -60 }, [{ id: 'ap', opts: { ampCapable: true } }, { id: 'a', opts: { kind: 'tag', cca: false } }, { id: 'b', opts: { kind: 'tag', cca: false } }])
    w.at(0, () => w.ch.startTx('ap', ampAckFrame('ap', 'a', 250, 1, 6_000)))
    w.run(1_000_000)
    expect(w.heard.a).toEqual(['ampAck:ap'])
    expect(w.heard.b).toEqual(['ampAck:ap'])
  })
})
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-collision.test.ts` → FAIL.

- [ ] **Step 3: Implement in `channel.ts`**

`RadioState` gains `kind: 'wifi' | 'tag'`, `ampCapable: boolean`, `floorDbm: number`, `cca: boolean`; `register(nodeId, listener, opts = {})` fills them (`kind: opts.kind ?? 'wifi'`, `ampCapable: opts.ampCapable ?? false`, `floorDbm: opts.floorDbm ?? AMP_TAG_DL_SENS_DBM`, `cca: opts.cca ?? true`). Add:

```ts
function ampNoiseBwMhz(frame: FrameDesc): number {
  return frame.amp?.dir === 'ul' ? AMP_UL_BW_MHZ[frame.amp.kbps as AmpUlKbps] : frame.widthMhz ?? 20
}

/** Lowest RSSI at which this radio can acquire this PPDU, or null when it cannot see it as a PPDU at all. */
function detectFloorDbm(r: RadioState, frame: FrameDesc): number | null {
  if (frame.amp?.dir === 'ul') return r.ampCapable ? ampUlSensDbm(frame.amp.kbps as AmpUlKbps) : null
  if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM
  return r.kind === 'tag' ? null : CCA_PD_DBM
}
```

`decodeThreshDb(frame, rid, r)`: prepend
```ts
  if (frame.amp?.dir === 'ul') return AMP_UL_REQ_SINR_DB[frame.amp.kbps as AmpUlKbps]
  if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? AMP_DL_REQ_SINR_DB : sinrThreshDb(6)
```
(pass the `RadioState` from `endTx`). `captureWindowNs(frame)`: prepend the two AMP cases. In `applyOneTx`, replace both `p >= CCA_PD_DBM` tests with `const floor = detectFloorDbm(r, tx.frame); … floor !== null && p >= floor`. In `detectOrMiss` and `interferenceMw`, replace `noiseDbm(tx.frame.widthMhz ?? 20)` / `noiseDbm(lock.frame.widthMhz ?? 20)` with `noiseDbm(ampNoiseBwMhz(frame))`. In `updateAllCca`: `if (!r.cca) continue` at the top of the loop, and `if (p >= CCA_PD_DBM && r.observed.has(a.txId) && a.frame.amp?.dir !== 'ul') anyPd = true`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine` → PASS (including the hash fixture: Wi-Fi paths are unchanged).

- [ ] **Step 5: Commit** — `git commit -am "feat(channel): radio kinds and AMP OOK detection/decoding"`

---

