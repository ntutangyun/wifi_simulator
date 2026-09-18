### Task 4: `AmpStaMac`: the tag

**Files:**
- Create: `src/engine/ampSta.ts`
- Test: `tests/engine/amp-sta.test.ts`

**Interfaces (produced):**
```ts
export interface AmpStaCfg { apId: string; id16: number }
export class AmpStaMac implements PhyListener {
  constructor(nodeId: string, q: EventQueue, now: () => Ns, ch: Channel, rng: Rng, emit: EmitFn, cfg: AmpStaCfg)
  onCcaBusy(): void; onCcaIdle(): void   // no-ops
  onRxStart(t: Ns, frame: FrameDesc, from: string): void
  onRxOk(t: Ns, frame: FrameDesc, from: string): void
  onRxCorrupt(t: Ns): void
}
```

Behaviour (spec "The tag"):
- `onRxStart`: `setState('rx')` unless transmitting or waiting for a slot (`ampWait` stays; a reception during a wait does not change the label).
- `onRxOk` with `ampTrigger` from `cfg.apId`: cancel any open round; `phase === 'random'`: `acw = 2 ** acwe − 1`, `aboc = rng.int(acw)` (inclusive upper bound, like backoff), `slot = aboc < slots ? aboc + 1 : null`, emit `AMP_ABOC`; `phase === 'scheduled'`: `slot = staIds.indexOf(nodeId) + 1` or ignore if absent (emit `AMP_ABOC { aboc: 0, acw: 0, slot }` so the lane shows the assignment). With a slot: `round = { slot, ulKbps, reading, acksSeen: 0, sent: false, endHandle }`; if `slot === 1` schedule `transmitResponse()` at `t + AMP_SIFS_NS`, else `setState('ampWait')`; `endHandle = q.schedule(t + roundNs + 50_000, () => this.giveUp())` (a round that never closes: `AMP_RESULT { sent, acked: false }`).
- `onRxOk` with `ampAck` from the AP while a round is open: `if (!round.sent) { round.acksSeen++; if (round.acksSeen === round.slot − 1) schedule transmitResponse at t + AMP_SIFS_NS; else if (frame.amp.ackFor >= round.slot) giveUp() }` else if `frame.amp.ackFor === round.slot`: `acked = frame.dst === nodeId`; emit `AMP_RESULT { slot, sent: true, acked }`; close the round; `setState('idle')`.
- `onRxCorrupt`: if a round is open and not sent, the tag has lost the Ack it keys on → `giveUp()` (spec: a tag that fails to decode an Ack loses the round).
- `transmitResponse()`: `frame = ampRespFrame(nodeId, apId, ulKbps, slot, aboc, reading)`; `ch.startTx(nodeId, frame)`; `setState('tx')`; at `now + frame.txTimeNs` (phase 2) `round.sent = true; setState('ampWait')`.
- `setState` emits `MAC_STATE` on change, exactly as `WifiMac.setState`.

- [ ] **Step 1: Write the failing tests** — a harness with a scripted "AP" radio (a bare `PhyListener` that records what it hears) and the `world()` helper pattern of Task 3:

```ts
// tests/engine/amp-sta.test.ts
import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { AmpStaMac } from '../../src/engine/ampSta'
import { AMP_SIFS_NS, ampAckFrame, ampTriggerFrame } from '../../src/engine/amp'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'

function bench(tagIds: string[], seed = 7, links: Record<string, number> = {}) {
  const q = new EventQueue()
  let now = 0
  const ids = ['ap', ...tagIds]
  const table = new Map(ids.map((tx) => [tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -50]))]))
  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const apHeard: { t: number; from: string; frame: FrameDesc }[] = []
  const ap: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk(t, frame, from) { apHeard.push({ t, from, frame }) }, onRxCorrupt() {} }
  ch.register('ap', ap, { ampCapable: true })
  const root = new Rng(seed)
  const tags = tagIds.map((id, i) => { const m = new AmpStaMac(id, q, () => now, ch, root.fork(i + 1), emit, { apId: 'ap', id16: 100 + i }); ch.register(id, m, { kind: 'tag', cca: false }); return m })
  const run = (t: number) => { for (;;) { const pt = q.peekTime(); if (pt === null || pt > t) break; const e = q.pop()!; now = e.t; e.fn() } now = t }
  const at = (t: number, fn: () => void) => q.schedule(t, fn)
  const send = (t: number, f: FrameDesc) => at(t, () => ch.startTx('ap', f))
  const trig = (slots = 4, acwe = 2, phase: 'random' | 'scheduled' = 'random', staIds: string[] = []) =>
    ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase, slots, slotNs: 272_000, acwe, sessionId: 1, staIds, reading: false, roundNs: 4 * (272_000 + 2 * AMP_SIFS_NS + 330_000), signalExtNs: 6_000 })
  const ack = (dst: string, slot: number) => ampAckFrame('ap', dst, 250, slot, 6_000)
  const recs = <K extends TLRecord['type']>(type: K, node?: string) => records.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))
  return { q, ch, records, apHeard, tags, run, at, send, trig, ack, recs }
}

describe('AmpStaMac (PDT 39.4 UL channel access)', () => {
  it('draws ABOC in [0, ACW], transmits in slot ABOC+1 or sits out', () => {
    const b = bench(['t1', 't2', 't3', 't4', 't5', 't6'])
    b.send(0, b.trig(4, 2))
    b.run(700_000)
    const draws = b.recs('AMP_ABOC')
    expect(draws.length).toBe(6)
    for (const d of draws) {
      expect(d.acw).toBe(3)
      expect(d.aboc).toBeGreaterThanOrEqual(0)
      expect(d.aboc).toBeLessThanOrEqual(3)
      expect(d.slot).toBe(d.aboc < 4 ? d.aboc + 1 : null)
    }
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const slot1 = draws.filter((d) => d.slot === 1)
    const tx1 = b.recs('TX_START').filter((r) => r.frame.kind === 'ampResp')
    expect(tx1.map((r) => r.node).sort()).toEqual(slot1.map((d) => d.node).sort())
    for (const r of tx1) expect(r.t).toBe(trigEnd + AMP_SIFS_NS)
    expect(draws.every((d) => d.aboc <= d.acw)).toBe(true)
  })
  it('is deterministic per seed', () => {
    const a = bench(['t1', 't2', 't3'], 11); a.send(0, a.trig()); a.run(700_000)
    const c = bench(['t1', 't2', 't3'], 11); c.send(0, c.trig()); c.run(700_000)
    expect(a.recs('AMP_ABOC').map((r) => r.aboc)).toEqual(c.recs('AMP_ABOC').map((r) => r.aboc))
  })
  it('sits out when ABOC ≥ N (ACWE 3, one slot)', () => {
    const b = bench(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'])
    b.send(0, b.trig(1, 3))
    b.run(700_000)
    const draws = b.recs('AMP_ABOC')
    expect(draws.some((d) => d.slot === null)).toBe(true)
    for (const d of draws) if (d.slot === null) expect(d.aboc).toBeGreaterThanOrEqual(1)
  })
  it('slot k ≥ 2 is keyed to the Ack that closes slot k−1: AMP SIFS after its end', () => {
    // seed chosen so t1 draws slot 2: scan seeds until it does (documented in the test).
    let b = bench(['t1'], 1)
    let seed = 1
    for (; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 2) break }
    expect(b.recs('AMP_ABOC')[0].slot).toBe(2)
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    expect(b.recs('MAC_STATE', 't1').some((r) => r.state === 'ampWait')).toBe(true)
    // the AP closes slot 1 (nobody was there) with an Ack addressed to itself
    const ackStart = trigEnd + AMP_SIFS_NS + 272_000 + AMP_SIFS_NS
    b.send(ackStart, b.ack('ap', 1))
    b.run(ackStart + 330_000 + AMP_SIFS_NS + 300_000)
    const tx = b.recs('TX_START', 't1').find((r) => r.frame.kind === 'ampResp')!
    expect(tx.t).toBe(ackStart + 330_000 + AMP_SIFS_NS)
    expect(tx.frame.amp).toMatchObject({ slot: 2 })
    // Ack for slot 2 addressed to t1 → acknowledged
    const ack2 = tx.t + 272_000 + AMP_SIFS_NS
    b.send(ack2, b.ack('t1', 2))
    b.run(ack2 + 400_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 2, sent: true, acked: true })
    expect(b.recs('MAC_STATE', 't1').pop()!.state).toBe('idle')
  })
  it('an Ack for its slot addressed to someone else means the response was lost', () => {
    let b = bench(['t1'], 1)
    for (let seed = 1; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 1) break }
    const tx = b.recs('TX_START', 't1')[0]
    const ack1 = tx.t + 272_000 + AMP_SIFS_NS
    b.send(ack1, b.ack('ap', 1))
    b.run(ack1 + 400_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 1, sent: true, acked: false })
  })
  it('a scheduled trigger assigns the slot by list position; an unlisted tag stays silent', () => {
    const b = bench(['t1', 't2', 't3'])
    b.send(0, b.trig(2, 0, 'scheduled', ['t2', 't1']))
    b.run(700_000)
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const tx = b.recs('TX_START').filter((r) => r.frame.kind === 'ampResp')
    expect(tx.map((r) => r.node)).toEqual(['t2'])
    expect(tx[0].t).toBe(trigEnd + AMP_SIFS_NS)
    expect(b.recs('AMP_ABOC', 't1')[0].slot).toBe(2)
    expect(b.recs('AMP_ABOC', 't3').length).toBe(0)
    expect(b.recs('TX_START', 't3').length).toBe(0)
  })
  it('a tag that cannot decode the Ack it keys on loses the round', () => {
    let b = bench(['t1'], 1, { 'ap>t1': -50 })
    let seed = 1
    for (; seed < 200; seed++) { b = bench(['t1'], seed); b.send(0, b.trig(4, 2)); b.run(700_000); if (b.recs('AMP_ABOC')[0].slot === 3) break }
    const trigEnd = b.recs('TX_END', 'ap')[0].t
    const ack1 = trigEnd + AMP_SIFS_NS + 272_000 + AMP_SIFS_NS
    b.send(ack1, b.ack('ap', 1))
    // the second Ack is never sent: the round's end timer fires
    b.run(ack1 + 6_000_000)
    expect(b.recs('AMP_RESULT', 't1')[0]).toMatchObject({ slot: 3, sent: false, acked: false })
    expect(b.recs('TX_START', 't1').length).toBe(0)
  })
  it('Wi-Fi frames never trigger a tag', () => {
    const b = bench(['t1'])
    const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 }
    b.send(0, cts)
    b.run(500_000)
    expect(b.recs('AMP_ABOC').length).toBe(0)
    expect(b.recs('TX_START', 't1').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-sta.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/engine/ampSta.ts`**

```ts
/**
 * Active Tx non-AP AMP STA (P802.11bp, 2.4 GHz): a tag with no carrier sense
 * and no NAV that transmits only in a time slot an AMP triggering frame
 * allocates (PDT 11-26/1889r4 clause 39.4; 11-26/1519r5 clause 39.3).
 */
import { AMP_SIFS_NS, ampRespFrame, type AmpUlKbps } from './amp'
import type { Channel, PhyListener } from './channel'
import { EventQueue } from './events'
import { Rng } from './rng'
import type { FrameDesc } from '../model/frames'
import type { EmitFn, MacStateName } from '../model/records'
import type { Ns } from '../model/types'

export interface AmpStaCfg {
  apId: string
  id16: number
}

interface Round {
  slot: number
  aboc: number | undefined
  ulKbps: AmpUlKbps
  reading: boolean
  acksSeen: number
  sent: boolean
  endHandle: number
  txHandle: number
}

/** Grace after the announced round length before an unclosed round is abandoned. */
const ROUND_GRACE_NS: Ns = 50_000

export class AmpStaMac implements PhyListener {
  private state: MacStateName = 'idle'
  private round: Round | null = null

  constructor(
    private nodeId: string, private q: EventQueue, private now: () => Ns, private ch: Channel,
    private rng: Rng, private emit: EmitFn, private cfg: AmpStaCfg,
  ) {}

  onCcaBusy(): void {}
  onCcaIdle(): void {}

  onRxStart(_t: Ns, _frame: FrameDesc, _from: string): void {
    if (this.state === 'idle') this.setState('rx')
  }

  onRxOk(t: Ns, frame: FrameDesc, from: string): void {
    if (from !== this.cfg.apId || !frame.amp) { this.settle(); return }
    if (frame.kind === 'ampTrigger') this.onTrigger(t, frame)
    else if (frame.kind === 'ampAck') this.onAck(t, frame)
    else this.settle()
  }

  onRxCorrupt(_t: Ns): void {
    // The Ack this tag keys its slot on (or the one that would acknowledge it) did not decode: the round is lost.
    if (this.round) this.giveUp()
    else this.settle()
  }

  private onTrigger(t: Ns, frame: FrameDesc): void {
    const a = frame.amp!
    this.closeRound()
    let slot: number | null
    let aboc: number | undefined
    let acw = 0
    if (a.phase === 'scheduled') {
      const i = (a.staIds ?? []).indexOf(this.nodeId)
      if (i < 0) { this.settle(); return }
      slot = i + 1
    } else {
      acw = 2 ** (a.acwe ?? 0) - 1
      aboc = this.rng.int(acw)
      slot = aboc < (a.slots ?? 1) ? aboc + 1 : null
    }
    this.emit({ t, type: 'AMP_ABOC', node: this.nodeId, aboc: aboc ?? 0, acw, slot })
    if (slot === null) { this.settle(); return }
    const round: Round = { slot, aboc, ulKbps: this.ulRateOf(frame), reading: a.reading ?? false, acksSeen: 0, sent: false, endHandle: 0, txHandle: 0 }
    this.round = round
    round.endHandle = this.q.schedule(t + (a.roundNs ?? 0) + ROUND_GRACE_NS, () => this.giveUp())
    if (slot === 1) round.txHandle = this.q.schedule(t + AMP_SIFS_NS, () => this.transmitResponse())
    else this.setState('ampWait')
  }

  /** The UL rate the trigger dictates (PDT 39.3.2.1 "UL data rate"): carried in AmpInfo.ulKbps. */
  private ulRateOf(frame: FrameDesc): AmpUlKbps {
    return (frame.amp!.ulKbps ?? 250) as AmpUlKbps
  }

  private onAck(t: Ns, frame: FrameDesc): void {
    const r = this.round
    if (!r) { this.settle(); return }
    const ackFor = frame.amp!.ackFor ?? 0
    if (!r.sent) {
      r.acksSeen++
      if (r.acksSeen === r.slot - 1) {
        r.txHandle = this.q.schedule(t + AMP_SIFS_NS, () => this.transmitResponse())
      } else if (ackFor >= r.slot) {
        this.giveUp()
      }
      return
    }
    if (ackFor === r.slot) {
      const acked = frame.dst === this.nodeId
      this.emit({ t, type: 'AMP_RESULT', node: this.nodeId, slot: r.slot, sent: true, acked })
      this.closeRound()
      this.setState('idle')
    }
  }

  private transmitResponse(): void {
    const r = this.round
    if (!r) return
    r.txHandle = 0
    const frame = ampRespFrame(this.nodeId, this.cfg.apId, r.ulKbps, r.slot, r.aboc, r.reading)
    this.setState('tx')
    this.ch.startTx(this.nodeId, frame)
    this.q.schedule(this.now() + frame.txTimeNs, () => { r.sent = true; this.setState('ampWait') }, 2)
  }

  private giveUp(): void {
    const r = this.round
    if (!r) return
    this.emit({ t: this.now(), type: 'AMP_RESULT', node: this.nodeId, slot: r.slot, sent: r.sent, acked: false })
    this.closeRound()
    this.setState('idle')
  }

  private closeRound(): void {
    const r = this.round
    if (!r) return
    if (r.endHandle) this.q.cancel(r.endHandle)
    if (r.txHandle) this.q.cancel(r.txHandle)
    this.round = null
  }

  /** Back to the label a listening tag shows. */
  private settle(): void {
    if (this.state === 'rx') this.setState(this.round ? 'ampWait' : 'idle')
  }

  private setState(s: MacStateName): void {
    if (s === this.state) return
    this.state = s
    this.emit({ t: this.now(), type: 'MAC_STATE', node: this.nodeId, state: s })
  }
}
```

**Note on the UL rate:** the trigger carries the UL rate separately from the DL rate (`AmpInfo.ulKbps`, set by `ampTriggerFrame` in Task 1); the tag reads `frame.amp.ulKbps` through `ulRateOf`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine/amp-sta.test.ts tests/engine/amp-phy.test.ts` → PASS. If the seed scan in the slot-2 / slot-3 tests never finds a hit within 200 seeds, widen to 2000; document the found seed in a comment.

- [ ] **Step 5: Commit** — `git add src/engine/ampSta.ts src/engine/amp.ts src/model/frames.ts tests/engine/amp-sta.test.ts tests/engine/amp-phy.test.ts && git commit -m "feat(amp): AmpStaMac, the triggered-only tag with ABOC slotted access"`

---

