### Task 5: `AmpApRound` and the `WifiMac` hooks; simulation wiring

**Files:**
- Create: `src/engine/ampAp.ts`
- Modify: `src/engine/mac.ts` (`WifiMacCfg`, constructor, `inExchange`, `hasWork`, `hasFrame`, `transmitFor`, `onOwnTxEnd`, `onRxOk`, `onRxCorrupt`, `refreshState`)
- Modify: `src/engine/simulation.ts` (tags, AP AMP config, radio options, `tags` map)
- Test: `tests/engine/amp-ap.test.ts`

**Interfaces (produced):**
```ts
// ampAp.ts
export interface AmpApDeps {
  nodeId: string; q: EventQueue; now: () => Ns; emit: EmitFn; timing: PhyTiming
  /** Put a frame on the air through the MAC (no response expected by the MAC itself). */
  transmit(frame: FrameDesc): void
  /** The round is over: the MAC closes the exchange with a post-transmission backoff. */
  done(): void
}
export class AmpApRound {
  constructor(cfg: AmpApCfg, deps: AmpApDeps)
  readonly stats: { rounds: number; responses: number; failedSlots: number; readings: number; discovered: Set<string> }
  get active(): boolean
  /** Total air of one phase after its trigger PPDU: N × (slot + 2·AMP SIFS + Ack). */
  phaseAirNs(slots: number, reading: boolean): Ns
  /** Everything the CTS-to-self must cover: trigger + phase (+ a worst-case scheduled phase in twoPhase). */
  roundNs(): Ns
  start(): void
  onRxOk(frame: FrameDesc, from: string): void
  onRxFail(): void
}
// mac.ts
//   WifiMacCfg.ampAp?: AmpApCfg
//   WifiMac.ampRound: AmpApRound | null   (readonly, for tests)
// simulation.ts
//   Simulation.tags: Map<string, AmpStaMac>   (keyed by virtual id)
```

Round timeline (`start()`):
1. `t0 = now`. If `cfg.protection === 'ctsSelf'`: transmit `{ kind: 'cts', src: ap, dst: ap, bytes: CTS_BYTES, mbps: 6, durationFieldNs: roundNs() + timing.sifsNs, txTimeNs: txTimeNs(CTS_BYTES, 6) + timing.signalExtNs }`; schedule `sendTrigger('random')` at its end + `timing.sifsNs`. Else `sendTrigger('random')` now.
2. `sendTrigger(phase, staIds = [])`: `reading = phase === 'scheduled' || cfg.readMode === 'inline'`; `slots = phase === 'scheduled' ? staIds.length : cfg.slots`; `slotNs = ampUlPpduNs(cfg.ulKbps, ampRespBytes(reading))`; `frame = ampTriggerFrame({... roundNs: phaseAirNs(slots, reading) ...})`; emit `AMP_ROUND { untilNs: now + frame.txTimeNs + phaseAirNs }`; `stats.rounds++` (random only); `heard = []`, `received = new Map<number, string>()`; transmit; schedule `slotStart(1)` at `now + frame.txTimeNs + AMP_SIFS_NS`.
3. `slotStart(k)`: `current = k`; emit `AMP_SLOT { slot: k, untilNs: now + slotNs }`; schedule `sendAck(k)` at `now + slotNs + AMP_SIFS_NS`.
4. `sendAck(k)`: `dst = received.get(k) ?? nodeId`; transmit `ampAckFrame(nodeId, dst, cfg.dlKbps, k, timing.signalExtNs)`; at its end: `k < slots ? schedule slotStart(k+1) at end + AMP_SIFS_NS : phaseDone()`.
5. `phaseDone()`: if `phase === 'random' && cfg.readMode === 'twoPhase' && heard.length > 0` → schedule `sendTrigger('scheduled', heard)` at `now + AMP_SIFS_NS`; else `active = false; deps.done()`.
6. `onRxOk(frame, from)`: if `frame.kind === 'ampResp' && frame.amp?.slot === current && !received.has(current)`: `received.set(current, from)`, `heard.push(from)` (random phase), `stats.responses++`, `stats.discovered.add(from)`, `if (frame.amp.reading) stats.readings++`.
7. `onRxFail()`: `if (active && current > 0) stats.failedSlots++`.

`roundNs()` = trigger(random) air + phaseAirNs(cfg.slots, inline) + (twoPhase ? AMP_SIFS + trigger(scheduled, cfg.slots ids) air + phaseAirNs(cfg.slots, true) : 0).

`WifiMac` changes:
- cfg `ampAp?: AmpApCfg`; field `readonly ampRound: AmpApRound | null`; `private ampPending = false`. Constructor: if `cfg.ampAp` (only ever set on an AP MAC with EDCA), build the round with deps `{ transmit: (f) => this.transmitFrame(f, false), done: () => this.onAmpDone() }` and call `this.scheduleAmpPoll(0)`.
- `scheduleAmpPoll(at)`: `q.schedule(at, () => { this.ampPending = true; this.startAccessAc(this.edcafs[this.efIndex(0)]); this.scheduleAmpPoll(at + cfg.ampAp.pollIntervalMs * 1_000_000) })`.
- `inExchange()`: `|| (this.ampRound?.active ?? false)`.
- `hasWork(e)` and `hasFrame(idx)`: `|| (this.ampPending && idx === this.efIndex(0))`.
- `transmitFor(e, inTxopBurst)`: first statement after `purgeExpired`: `if (this.cfg.isAp && this.ampRound && this.ampPending && ei === this.efIndex(0) && !inTxopBurst) { this.ampPending = false; this.ampRound.start(); return }`.
- `onOwnTxEnd`: after the `muState` check: `if (this.ampRound?.active) { this.setState('waitAck'); return }`.
- `onRxOk`: before the `awaiting` check: `if (frame.kind === 'ampResp') { this.ampRound?.onRxOk(frame, from); return }`; and `if (frame.kind === 'ampTrigger' || frame.kind === 'ampAck') { this.corruptLast = false; return }` (a Wi-Fi station hearing AMP DL frames: nothing to do, no NAV).
- `onRxCorrupt`: `this.ampRound?.onRxFail()` first (an AP inside a round does not arm EIFS for a lost tag response: skip `corruptLast = true` when `this.ampRound?.active`).
- `onAmpDone()`: `const e = this.edcafs[this.efIndex(0)]; this.endTxop(); e.backoff = null; e.needDraw = true; this.resumeAll()`.
- `refreshState`: `else if (this.awaiting || this.staMuAwait || this.muState || this.ampRound?.active) s = 'waitAck'`.

`Simulation` changes (in the per-link loop):
- `members` includes tags (they are in `plan.members['2g']`). For `n.kind === 'amp'`: `const mac = new AmpStaMac(n.id, this.q, () => this.nowNs, ch, root.fork(hashStr(vid)), linkEmit, { apId: ap.id, id16: n.ampTag?.id16 ?? ampId16(n.id) }); ch.register(n.id, mac, { kind: 'tag', cca: false, floorDbm: n.ampTag?.dlSensDbm ?? AMP_TAG_DL_SENS_DBM }); this.tags.set(vid, mac); continue`.
- For Wi-Fi nodes: `ch.register(n.id, mac, { ampCapable: n.kind === 'ap' && link === '2g' && !!ap.ampAp })`; AP cfg on the 2g link: `ampAp: link === '2g' && members.some((m) => m.kind === 'amp') ? ap.ampAp : undefined`.
- `reachable: (peer) => memberSet.has(peer) && byId.get(peer)?.kind !== 'amp'`; `ulBacklog` filter `byId.get(id)!.kind === 'sta'`; `queuesOf` only for non-tags; traffic sources only for `'sta'` (already).
- `initViewState` already handles tags (Task 2).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/engine/amp-ap.test.ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { AMP_SIFS_NS } from '../../src/engine/amp'
import { DEFAULT_AMP_AP, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
function tag(id: string, x: number, y: number): NodeCfg {
  return { id, kind: 'amp', name: id, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} } }
}
function scenario(over: Partial<typeof DEFAULT_AMP_AP> = {}, extra: NodeCfg[] = []): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }], walls: [], servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    nodes: [
      { id: 'ap', kind: 'ap', name: 'AP', pos: { x: 5, y: 4, z: 2 }, txPowerDbm: 20, profiles: ['idle'], caps: { generation: 'eht', features: { edca: true, txop: true } }, ampAp: { ...DEFAULT_AMP_AP, ...over } },
      tag('tag-1', 4, 4), tag('tag-2', 6, 4),
      ...extra,
    ],
  }
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K, node?: string) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))

describe('the AP’s AMP round', () => {
  it('runs on AC_BK, protected by a CTS-to-self whose Duration covers the round', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const cts = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'cts')!
    expect(cts.frame.dst).toBe('ap')
    expect(cts.frame.mbps).toBe(6)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    expect(trig.t).toBe(cts.t + cts.frame.txTimeNs + 10_000) // 2.4 GHz SIFS
    const lastAck = ofType(rs, 'TX_END', 'ap#2g').filter((r) => r.frame.kind === 'ampAck' && r.frame.amp?.ackFor === 4).pop()!
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs).toBeGreaterThanOrEqual(lastAck.t)
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs - lastAck.t).toBeLessThan(20_000)
    const ifs = ofType(rs, 'IFS_START', 'ap#2g').find((r) => r.t <= cts.t)!
    expect(ifs.ac).toBe(0) // AC_BK
  })
  it('trigger → slot 1 after AMP SIFS → Ack after the slot → slot 2 after AMP SIFS, four slots, four Acks', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const round = ofType(rs, 'AMP_ROUND', 'ap#2g')[0]
    expect(round).toMatchObject({ phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250 })
    const trigEnd = ofType(rs, 'TX_END', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g').filter((r) => r.t >= trigEnd.t).slice(0, 4)
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3, 4])
    expect(slots[0].t).toBe(trigEnd.t + AMP_SIFS_NS)
    const acks = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck').slice(0, 4)
    expect(acks.map((a) => a.frame.amp!.ackFor)).toEqual([1, 2, 3, 4])
    expect(acks[0].t).toBe(slots[0].t + 272_000 + AMP_SIFS_NS)
    expect(slots[1].t).toBe(acks[0].t + 330_000 + AMP_SIFS_NS)
    expect(new Set(acks.map((a) => a.frame.txTimeNs)).size).toBe(1)
  })
  it('Ack ids name the tag heard in that slot, or the AP when nobody was', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const first = ofType(rs, 'AMP_ROUND', 'ap#2g')[0]
    const inRound = rs.filter((r) => r.t >= first.t && r.t <= first.untilNs)
    const acks = ofType(inRound, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck')
    const heard = ofType(inRound, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampResp')
    for (const a of acks) {
      const h = heard.find((r) => r.frame.amp!.slot === a.frame.amp!.ackFor)
      expect(a.frame.dst).toBe(h ? h.from : 'ap')
    }
    expect(acks.some((a) => a.frame.dst !== 'ap')).toBe(true)
  })
  it('rounds repeat every pollIntervalMs and tags get acknowledged', () => {
    const rs = new Simulation(scenario({ pollIntervalMs: 50 })).runUntil(400 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g').filter((r) => r.phase === 'random')
    expect(rounds.length).toBeGreaterThanOrEqual(7)
    for (let i = 1; i < rounds.length; i++) expect(rounds[i].t - rounds[i - 1].t).toBeGreaterThanOrEqual(50 * MS)
    expect(ofType(rs, 'AMP_RESULT', 'tag-1#2g').some((r) => r.acked)).toBe(true)
    expect(ofType(rs, 'AMP_RESULT', 'tag-2#2g').some((r) => r.acked)).toBe(true)
  })
  it('twoPhase: after the random phase, a scheduled trigger lists exactly the tags heard, in order', () => {
    const rs = new Simulation(scenario({ readMode: 'twoPhase' })).runUntil(30 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g')
    const sched = rounds.find((r) => r.phase === 'scheduled')
    if (!sched) return // nobody answered in round one for this seed: covered by the lesson test with 30 rounds
    const random = rounds.filter((r) => r.phase === 'random' && r.t < sched.t).pop()!
    const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampResp' && r.t > random.t && r.t < sched.t).map((r) => r.from)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger' && r.frame.amp?.phase === 'scheduled' && r.t >= sched.t)!
    expect(trig.frame.amp!.staIds).toEqual(heard)
    expect(trig.frame.amp!.reading).toBe(true)
    expect(sched.slots).toBe(heard.length)
  })
  it('protection none: a saturated 2.4 GHz station starts inside a slot and the response fails', () => {
    const cam: NodeCfg = { id: 'cam', kind: 'sta', name: 'Camera', pos: { x: 5, y: 2, z: 1 }, txPowerDbm: 15, profiles: ['saturated'], caps: { generation: 'he', features: { edca: true } }, linkId: '2g' }
    const rs = new Simulation(scenario({ protection: 'none' }, [cam])).runUntil(300 * MS).records
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g')
    const camTx = ofType(rs, 'TX_START', 'cam#2g').filter((r) => r.frame.kind === 'data')
    const inside = camTx.filter((c) => slots.some((s) => c.t > s.t && c.t < s.untilNs))
    expect(inside.length).toBeGreaterThan(0)
    expect(ofType(rs, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBe(0)
    const prot = new Simulation(scenario({ protection: 'ctsSelf' }, [cam])).runUntil(300 * MS).records
    expect(ofType(prot, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBeGreaterThan(0)
  })
  it('the live view and snapshot replay agree with AMP records', () => {
    const sim = new Simulation(scenario({ pollIntervalMs: 20 }))
    const batches = [50, 100, 150].map((ms) => sim.runUntil(ms * MS))
    const records = batches.flatMap((b) => b.records)
    const snapshots = batches.flatMap((b) => b.snapshots)
    const target = 120 * MS
    const snap = [...snapshots].reverse().find((s) => s.t <= target)!
    const { cloneView, applyRecord } = await import('../../src/model/view')
    const rebuilt = cloneView(snap.view)
    for (const r of records) if (r.t > snap.t && r.t <= target) applyRecord(rebuilt, r)
    const live = new Simulation(scenario({ pollIntervalMs: 20 }))
    live.runUntil(target)
    const lv = cloneView(live.view)
    lv.t = rebuilt.t
    expect(rebuilt).toEqual(lv)
  })
})
```
(Make the last test `async` and import `cloneView`/`applyRecord` at the top instead of the dynamic import.)

- [ ] **Step 2: Run to see it fail** — `npx vitest run tests/engine/amp-ap.test.ts` → FAIL.

- [ ] **Step 3: Implement `ampAp.ts`, the `mac.ts` hooks and the simulation wiring** as specified above. Keep `AmpApRound` free of MAC internals: it only calls `deps.transmit`, `deps.emit`, `deps.q.schedule` and `deps.done`.

- [ ] **Step 4: Run** — `npx vitest run tests/engine && npx tsc -b` → PASS, including `lesson-hashes.test.ts`.

- [ ] **Step 5: Commit** — `git add src/engine/ampAp.ts src/engine/mac.ts src/engine/simulation.ts tests/engine/amp-ap.test.ts && git commit -m "feat(amp): the AP's AC_BK polling round with CTS-to-self, Ack-keyed slots and two-phase reads"`

---

