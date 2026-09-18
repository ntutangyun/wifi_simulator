### Task 6: Session schedule, devices, network, and the Simulation host seam

**Files:**
- Create: `src/uwb/session.ts`, `src/uwb/device.ts`, `src/uwb/network.ts`
- Modify: `src/engine/simulation.ts` (export `hashStr`; host the UWB engine; Wi-Fi wiring only with an AP)
- Test: `tests/uwb/session.test.ts`, `tests/uwb/network.test.ts`, `tests/engine/simulation.test.ts` (one added case)

**Interfaces:**

```ts
// src/uwb/session.ts
export interface RoundPlan { method: 'ss' | 'ds'; anchors: number; slots: number; slotNs: Ns; roundNs: Ns; blockNs: Ns; roundsPerBlock: number }
export function rstuNs(rstu: number): Ns                       // Math.round(rstu * 416_000 / 499.2)
export function roundPlan(cfg: UwbSessionCfg, anchors: number): RoundPlan   // slots = ss ? anchors + 1 : 2·anchors + 2
export function slotStartNs(p: RoundPlan, block: number, round: number, slot: number): Ns
export type SlotAction =
  | { kind: 'uwbPoll'; tx: 'tag' }
  | { kind: 'uwbResp'; tx: 'anchor'; anchor: number }          // anchor index 0-based; slot 1 + anchor
  | { kind: 'uwbFinal'; tx: 'tag' }                             // DS slot anchors + 1
  | { kind: 'uwbReport'; tx: 'anchor'; anchor: number }        // DS slot anchors + 2 + anchor
export function slotAction(p: RoundPlan, slot: number): SlotAction

// src/uwb/device.ts
export interface UwbDeviceCfg { role: 'anchor' | 'tag'; pos: Vec3; tsNoisePs: number; cfoNoisePpm: number; method: 'ss' | 'ds' }
export class UwbDevice implements UwbRadio {
  constructor(readonly id: string, cfg: UwbDeviceCfg, clock: UwbClock, rng: Rng, q: EventQueue, now: () => Ns, ch: UwbChannel, emit: EmitFn,
              geometry: { trueDistM: (a: string, b: string) => number; anchorPos: (id: string) => AnchorPos })
  readonly clock: UwbClock
  state: 'idle' | 'uwbWait' | 'rx' | 'tx'
  /** Tag: begin its round (emits UWB_ROUND); anchor: note the round it serves. */
  beginRound(block: number, round: number, plan: RoundPlan, tagId: string, anchors: string[]): void
  /** Called by the network at each slot start of a round this device takes part in. */
  onSlot(slot: number, action: SlotAction, slotEndNs: Ns, peers: { tag: string; anchors: string[] }): void
  /** Tag: solve the position from this round's ranges (≥ 3) and emit UWB_POSITION; both roles: clear round state. */
  endRound(): void
  listening(): boolean; onRxStart(...); onRxOk(...); onRxFail(...)
}

// src/uwb/network.ts
export class UwbNetwork {
  readonly devices: Map<string, UwbDevice>
  readonly plan: RoundPlan
  constructor(q: EventQueue, now: () => Ns, nodes: NodeCfg[] /* uwb only, scenario order */, walls: Wall[], cfg: UwbSessionCfg, root: Rng, emit: EmitFn)
}
```

Device behaviour (the spec's Part B, made concrete):

- `onSlot` for the transmitter of the slot: build the frame (Task 4 builders), set state `tx` (MAC_STATE), compute its **TX counter** = `clock.counter(now + UWB_RMARKER_NS)` and emit `UWB_TS { dir: 'tx', peer, frameKind, counter }`, then `ch.transmit(id, frame)`; on TX end (schedule at `now + txTimeNs`, phase 2) state `idle`. The UWB_SLOT record is emitted by the **tag** at every slot start of its round (`untilNs = slotEndNs`).
  - Poll: `schedule = anchors`; SS: RRMC(0); DS: RRMC(2). The tag stores `txPoll`.
  - Response (anchor i, slot 1 + i): SS: `replyRctu = counterDiff(txRespCounter, rxPollCounter)` embedded; DS: none. The anchor stores `txResp`. An anchor that did not receive the poll stays silent (no frame, no UWB_TS).
  - Final (tag): `finalTimes` = for each anchor that answered: `tround1 = counterDiff(rxResp, txPoll)`, `treply2 = counterDiff(txFinal, rxResp)`; anchors that did not answer are omitted.
  - Report (anchor i): only if it received the Final and found its entry: `reportTimes = { treply1: counterDiff(txResp, rxPoll), tround2: counterDiff(rxFinal, txResp) }`.
- `onSlot` for a listener (every other participant expecting that frame: anchors listen to poll and final; the tag listens to responses and reports): state `uwbWait` (MAC_STATE), `listening()` true; schedule a timeout at `slotEndNs` (phase 0) that, if no RX_OK arrived for the expected frame, emits `UWB_TIMEOUT { slot, peer: expected transmitter, expected: kind }` and returns to `idle`. Anchors listen to responses of other anchors? No: only the frames addressed to them or broadcast by the tag.
- `onRxStart`: state `rx`. `onRxFail`: back to `uwbWait` (the timeout will fire). `onRxOk(from, frame, info)`:
  - **RX counter** = `clock.counter(info.txStartNs + UWB_RMARKER_NS + info.propNs, info.nlosNs + gaussian(rng) · tsNoisePs / 1000)`; `fom = fomFor(info.nlos)`; emit `UWB_TS { dir: 'rx', peer: from, frameKind, counter, fom }`. Clock-offset estimate `coffs = (info.txPpm − clock.ppm) · 1e-6 + gaussian(rng) · cfoNoisePpm · 1e-6` (draw order: timestamp noise first, then coffs).
  - poll at an anchor: store `rxPoll`, `coffs`, `fom`.
  - response at the tag: store `rxResp[from]`, `coffs[from]`, `fom[from]`; SS: emit `UWB_RANGE { method: 'ss', tofRawRctu: ssTwrRaw(tround, replyRctu), tofRctu: ssTwrCorrected(tround, replyRctu, coffs), distM: rctuToMetres(tofRctu), trueDistM, fom }` and keep `distM` for the position.
  - final at an anchor: find its entry; `tof = dsTwr(tround1, treply1, tround2, treply2)`; emit `UWB_RANGE { method: 'ds', node: anchor, peer: tag, … }`.
  - report at the tag: `tof = dsTwr(tround1[from], treply1, tround2, treply2[from])`; emit `UWB_RANGE { node: tag, peer: from }`; keep `distM`.
  - Cancel the slot's timeout; state `idle`.
- `endRound` (tag): if ≥ 3 ranges this round → `solvePosition(anchorPositions, ranges, pos.z, rangeSigmaM(tsNoisePs))` → `UWB_POSITION { x, y, trueX: pos.x, trueY: pos.y, gdop, ellipse, anchors: ids used, block }`. Clear per-round storage (both roles).
- Truth: `trueDistM(a, b)` is the 3-D distance from the scenario positions; `UWB_RANGE.distM` uses the corrected/DS tof.

Network: builds the plan from `cfg` and the anchor count; devices in scenario order, each with `UwbClock.fromRng(root.fork(hashStr(id + '#uwb')), cfg ppm)` — **one fork per node, used for both the clock draw and the noise stream** (fork once, pass the same `Rng` to the clock factory and the device). Tag k's round index is k (index among tags). For every block b (starting at 0; the next block is scheduled at `b·blockNs` when block b starts) and tag k, schedule at `slotStartNs(plan, b, k, s)` phase 0 for each slot s: on slot 0 call `beginRound` on the tag and every anchor, then `onSlot` on every participant; after the last slot's end (`slotStartNs(…, slots − 1) + slotNs`, phase 0) call `endRound` on all. Tags outside the block's round count never exist (schema).

Simulation host: in the constructor, `const ap = sc.nodes.find(n => n.kind === 'ap')`; wrap the existing Wi-Fi wiring (link plan, channels, MACs, traffic) in `if (ap) { … }` using `ap` as before; then `const uwbNodes = sc.nodes.filter(n => n.kind === 'uwb'); if (uwbNodes.length && sc.uwb) this.uwb = new UwbNetwork(this.q, () => this.nowNs, uwbNodes, sc.walls, sc.uwb, root, baseEmit)`. The traffic loop's fork index `i` stays the index in `sc.nodes` (document in a comment: lesson scenarios list UWB nodes last). Export `hashStr`.

- [ ] **Step 1: Write the failing tests.**

`tests/uwb/session.test.ts`: `rstuNs(2400) === 2_000_000`, `rstuNs(240_000) === 200_000_000`, `rstuNs(600) === 500_000`; `roundPlan(DEFAULT_UWB_SESSION, 4)` → slots 10, roundNs 20 ms, roundsPerBlock 10; SS with 4 anchors → 5 slots; `slotStartNs(p, 1, 2, 3)` = 200 ms + 40 ms + 6 ms; `slotAction` table for DS/4: slot 0 poll, 1–4 resp anchors 0–3, 5 final, 6–9 report anchors 0–3; SS/4: 0 poll, 1–4 resp.

`tests/uwb/network.test.ts` (run `new Simulation(sc).runUntil(…)` on UWB-only scenarios built inline; helper `uwbScenario(anchors: {x,y,z}[], tags: {x,y,z,ppm?}[], session: Partial<UwbSessionCfg>, walls = [])` with `rooms: [{x:0,y:0,w:12,h:10,name:'lab'}]`, seed 7, `rtsThresholdBytes: 3000`, `snapshotIntervalMs: 10`, `servers: []`):
  - SS, 1 anchor at (0,0,1), tag at (5,0,1), ppm 0/0, nlos false, run 30 ms: exactly one `UWB_RANGE` (node tag, method 'ss'), `|distM − 5| < 3·rangeSigmaM(100)`, `tofRawRctu` within 3σ of `tofRctu`; `UWB_TS` records: tx poll at the tag, rx poll at the anchor, tx resp at the anchor, rx resp at the tag, in that time order; `UWB_ROUND` at t = 0 with slots 2; `UWB_SLOT` at 0 and 2 ms; the response's `TX_START.t === 2_000_000`; `RX_START.t − TX_START.t === 17` for both frames.
  - SS, tag +10 ppm, anchors −10 ppm, 4 anchors at 5 m (positions (5,0),(0,5),(−5,0),(0,−5) around a tag at (0,0)), run 30 ms: raw errors `rctuToMetres(tofRawRctu) − 5` for anchors 1–4 ≈ 5.996 / 11.99 / 17.99 / 23.98 m (± 0.15 m: noise plus the −ToF term in Treply); corrected errors < 0.15 m.
  - DS, same scene, run 30 ms: 8 `UWB_RANGE` records (4 on anchor lanes after the Final, 4 on the tag lane after the reports), tag-lane errors < 3σ_r; a `UWB_POSITION` at the tag with `hypot(x − 0, y − 0) < 0.2`, `anchors.length === 4`; the round's records end before 20 ms; slot 5 carries the `uwbFinal` with 62 octets and `txTimeNs === 236_603` (496 bits = two RS blocks, 96 parity bits).
  - DS, an anchor at 40 m: the tag emits `UWB_TIMEOUT` for its response slot (`expected: 'uwbResp'`) and the anchor emits `UWB_TIMEOUT` for the poll; the Final's `finalTimes.length === 3`; the position still solves from 3.
  - Three tags, DS, 4 anchors, run 450 ms: `UWB_ROUND` at 0, 20, 40 ms (block 0) and 200, 220, 240 ms (block 1); each tag gets a `UWB_POSITION` per block.
  - Determinism: two runs of the DS scene give identical record arrays (`toEqual`).
  - Wi-Fi + UWB: take `defaultScenario()`, append 3 anchors and 1 tag (kind 'uwb') and `uwb: DEFAULT_UWB_SESSION`; run 100 ms; the sequence of non-UWB records (filter out `UWB_*` types and records whose `node` is a UWB id, and drop `seq`) equals the same run of `defaultScenario()` alone.

`tests/engine/simulation.test.ts`: add one case — a UWB-only scenario constructs and runs 10 ms without an AP.

- [ ] **Step 2: Run** — failures. **Step 3: Implement** session, device, network, the host seam. **Step 4: Run** the whole suite (`npx vitest run`): everything green including `lesson-hashes`; `npx tsc -b`.
- [ ] **Step 5: Commit** `feat(uwb): scheduled ranging sessions (SS/DS-TWR), devices, network and the Simulation host`.

---

