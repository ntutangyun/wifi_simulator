### Task 5: The UWB channel — propagation delay, path loss, capture, NLOS

**Files:**
- Create: `src/uwb/channel.ts`
- Test: `tests/uwb/channel.test.ts`

**Interfaces:**
- Consumes: `EventQueue` (`src/engine/events.ts`), `EmitFn` (`src/model/records.ts`), `wallLossDb` and `segIntersectT` (`src/engine/propagation.ts`), Task 1 constants, Task 4 frames.
- Produces:

```ts
export interface UwbRxInfo {
  rssiDbm: number
  /** True propagation delay d / c (float ns). */
  propNs: number
  /** Excess delay the receiver measures on this path (0 when nlos is off or no wall). */
  nlosNs: number
  nlos: boolean
  /** When the PPDU started at the transmitter (event-clock ns). */
  txStartNs: Ns
  /** The transmitter's crystal offset, for the receiver's clock-offset estimate. */
  txPpm: number
}
export interface UwbRadio {
  listening(): boolean
  onRxStart(from: string, frame: FrameDesc): void
  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void
  onRxFail(from: string, reason: RxFailReason): void
}
export class UwbChannel {
  constructor(q: EventQueue, now: () => Ns, nodes: NodeCfg[], walls: Wall[], cfg: { channel: 5 | 9; nlos: boolean }, ppmOf: (id: string) => number, emit: EmitFn)
  register(id: string, radio: UwbRadio): void
  distanceM(from: string, to: string): number           // 3-D
  rssiDbm(from: string, to: string): number             // txPowerDbm − uwbPl0Db(ch) − 10·UWB_PL_EXP·log10(max(d, 0.1)) − wallLossDb(...)
  nlosNs(from: string, to: string): number              // sum of UWB_NLOS_NS[material] over walls crossed (openings exempt, as wallLossDb), 0 when cfg.nlos is false
  /** TX_START now; TX_END at now + txTimeNs (phase 2). Deliveries to each listening node at now + ceil(d / c) (phase 1). */
  transmit(from: string, frame: FrameDesc): void
}
```

Reception rules per receiver: at arrival, if `!radio.listening()` → nothing. If `rssi < UWB_RX_SENS_DBM` → nothing. Otherwise emit `RX_START { node, from, frame }`, call `onRxStart`, and open a reception ending at `arrival + frame.txTimeNs`. If another reception is open at the same receiver: compare powers; the weaker one (or both, when within `UWB_CAPTURE_DB`) is marked doomed. At a reception's end: doomed → `RX_FAIL { node, from, reason: 'collision' }` + `onRxFail`; else `RX_OK { node, from, frame }` + `onRxOk(from, frame, info)`. Use `wallLossDb` for loss and a sibling `wallsCrossed(a, b, walls): Material[]` you add to `src/engine/propagation.ts` (exported, exempting openings the same way) for the NLOS sum.

- [ ] **Step 1: Write the failing tests** `tests/uwb/channel.test.ts` with a stub radio (records what it got) and a tiny harness (`EventQueue`, a `now` closure, `makeEmitter` collecting records, `runUntil` popping events):
  - two nodes 5 m apart: `RX_START.t − TX_START.t === 17`; 20 m apart → 67; `RX_OK` at `RX_START + txTimeNs`; `info.propNs` ≈ 16.678.
  - a node at 40 m on channel 9 with −14 dBm: rssi < −93 → no RX records.
  - a brick wall between: rssi lower by 12 dB; `info.nlosNs === 2.0` and `nlos === true`; with `cfg.nlos = false` → `nlosNs === 0`, `nlos === false`.
  - a non-listening radio gets no records.
  - two transmitters starting together at a listener, 10 dB apart → the stronger RX_OK, the weaker RX_FAIL collision; within 3 dB → both RX_FAIL.
  - `TX_END` at `TX_START + txTimeNs` and only one TX_START per transmit.
- [ ] **Step 2: Run** — failure. **Step 3: Implement.** **Step 4: Run** — PASS; `npx tsc -b`.
- [ ] **Step 5: Commit** `feat(uwb): channel with propagation delay, sensitivity, capture and NLOS excess delay`.

---

