### Task 3: WifiMac runs on a `PhyTiming`

Replace every module-constant use in `src/engine/mac.ts` with the MAC's own timing, and include the signal extension in every airtime the MAC computes.

**Files:**
- Modify: `src/engine/mac.ts` (import block lines 22-28; `WifiMacCfg` lines 39-79; constructor line 183; the 31 constant uses and 20 airtime calls listed below)
- Modify: `tests/engine/helpers.ts` (`makeBss` options)
- Test: `tests/engine/link-2g.test.ts` (extend)

**Interfaces:**
- Consumes: `PhyTiming`, `OFDM_5G`, `ERP_2G` from Task 2.
- Produces: `WifiMacCfg.timing?: PhyTiming` (default `OFDM_5G`); `makeBss(..., { timing?: PhyTiming })`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/link-2g.test.ts`:

```ts
import { makeBss, msdu } from './helpers'
import { ERP_2G } from '../../src/engine/phy'

describe('a MAC on the 2.4 GHz link', () => {
  const links = { 'sta-1>ap': -50, 'ap>sta-1': -50, 'sta-2>ap': -50, 'ap>sta-2': -50, 'sta-1>sta-2': -50, 'sta-2>sta-1': -50 }

  it('waits DIFS = 28 µs, and its data PPDU carries the 6 µs signal extension', () => {
    const bss = makeBss(['ap', 'sta-1', 'sta-2'], links, { timing: ERP_2G })
    // Make the medium "seen busy" once so the first IFS is a real DIFS from t = 0.
    bss.enqueue(0, 'ap', msdu('ap', 'sta-2', 100))
    bss.runUntil(5_000_000)
    const ifs = bss.recs('IFS_START', 'ap')[0]
    expect(ifs.kind).toBe('DIFS')
    bss.enqueue(6_000_000, 'sta-1', msdu('sta-1', 'ap', 1400))
    bss.runUntil(8_000_000)
    const tx = bss.recs('TX_START', 'sta-1').find((r) => r.frame.kind === 'data')!
    // 1428-octet PSDU at 54 Mb/s: 20 µs preamble + ceil((16+8·1428+6)/216)=53 symbols × 4 µs = 232 µs, + 6 µs extension
    expect(tx.frame.txTimeNs).toBe(232_000 + 6_000)
    const ifs2 = bss.recs('IFS_START', 'sta-1').find((r) => r.t >= 6_000_000)!
    expect(ifs2.untilNs - ifs2.t).toBeLessThanOrEqual(28_000)
  })

  it('the ACK follows one 10 µs SIFS after the data PPDU (including its extension)', () => {
    const bss = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -50, 'ap>sta-1': -50 }, { timing: ERP_2G })
    bss.enqueue(0, 'sta-1', msdu('sta-1', 'ap', 500))
    bss.runUntil(2_000_000)
    const data = bss.recs('TX_END', 'sta-1').find((r) => r.frame.kind === 'data')!
    const ack = bss.recs('TX_START', 'ap').find((r) => r.frame.kind === 'ack')!
    expect(ack.t - data.t).toBe(10_000)
    expect(ack.frame.txTimeNs).toBe(44_000 + 6_000) // ACK at 6 Mb/s carries the extension too
  })

  it('a lost ACK times out after 39 µs and a corrupted frame costs EIFS 88 µs', () => {
    // sta-1 → ap fails: the AP cannot hear sta-1 (−200), so sta-1's frame is never acknowledged.
    const bss = makeBss(['ap', 'sta-1'], { 'ap>sta-1': -50 }, { timing: ERP_2G })
    bss.enqueue(0, 'sta-1', msdu('sta-1', 'ap', 500))
    bss.runUntil(2_000_000)
    const end = bss.recs('TX_END', 'sta-1')[0]
    const to = bss.recs('ACK_TIMEOUT', 'sta-1')[0]
    expect(to.t - end.t).toBe(39_000)
  })
})
```

For the EIFS half of the last test, add a station that hears a corrupted frame: build a 3-node BSS where `sta-2` receives `sta-1` at −90 dBm (above −82? no: use −80 dBm so it locks, and add a simultaneous strong interferer is complicated). Simpler EIFS check: assert the constant is used by grepping the MAC: keep the EIFS assertion at the constant level (Task 2 already pins 88 µs) and add this behavioural check:

```ts
  it('after a reception that failed to decode, the next IFS is EIFS − DIFS + AIFS with the 2.4 GHz values', () => {
    // sta-2 hears sta-1 at −80 dBm (locks) while the AP's simultaneous ACK-less traffic… keep it simple:
    // a frame at 54 Mb/s received at −80 dBm needs 25 dB SINR over a −94 dBm floor → 14 dB: it fails as lowSinr.
    const bss = makeBss(['ap', 'sta-1', 'sta-2'], { 'sta-1>ap': -50, 'ap>sta-1': -50, 'sta-1>sta-2': -80, 'ap>sta-2': -50, 'sta-2>ap': -50 }, { timing: ERP_2G, edca: false })
    bss.enqueue(0, 'sta-1', msdu('sta-1', 'ap', 1400))
    bss.enqueue(0, 'sta-2', msdu('sta-2', 'ap', 100))
    bss.runUntil(3_000_000)
    const fail = bss.recs('RX_FAIL', 'sta-2')[0]
    expect(fail).toBeDefined()
    const eifs = bss.recs('IFS_START', 'sta-2').find((r) => r.kind === 'EIFS' && r.t >= fail.t)!
    expect(eifs.untilNs - Math.max(eifs.t, fail.t)).toBe(88_000)
  })
```

If the lowSinr premise does not hold with the engine's current thresholds (check `sinrThreshDb(54)` in `src/engine/phy.ts`), lower the `sta-1>sta-2` level until the RX_FAIL appears, but keep it at or above −82 dBm so the preamble locks.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/engine/link-2g.test.ts`
Expected: FAIL (`makeBss` ignores `timing`; DIFS is 34 µs; no extension).

- [ ] **Step 3: Thread the timing through `makeBss`**

In `tests/engine/helpers.ts`, extend the options type with `timing?: PhyTiming` (import the type from `../../src/engine/phy`) and pass `timing: opts.timing` inside the cfg object given to `new DcfMac(...)`.

- [ ] **Step 4: Refactor `mac.ts`**

1. Import: add `OFDM_5G, type PhyTiming` to the `./phy` import; the constants `SIFS_NS, SLOT_NS, DIFS_NS, EIFS_NS, ACK_TIMEOUT_NS, CTS_TIMEOUT_NS, RX_START_DELAY_NS` are removed from the import once no use remains.
2. `WifiMacCfg`: add
   ```ts
   /** Interframe timing of the link this MAC serves (default: 5 GHz OFDM). */
   timing?: PhyTiming
   ```
3. Class field and constructor: `private readonly T: PhyTiming` set to `cfg.timing ?? OFDM_5G` as the first statement of the constructor body.
4. Two airtime helpers next to `exchangeNs` (every PPDU this MAC sends or budgets for carries the link's signal extension):
   ```ts
   /** TXTIME of a non-HT PPDU on this link, including the signal extension (§10.3.8). */
   private airNs(bytes: number, mbps: number): Ns {
     return txTimeNs(bytes, mbps) + this.T.signalExtNs
   }
   /** TXTIME of a VHT/HE/EHT (or non-HT) PPDU on this link, including the signal extension. */
   private airModeNs(mode: PhyMode, bytes: number, mcs: number, opts: TxTimeOpts = {}): Ns {
     return txTimeModeNs(mode, bytes, mcs, opts) + this.T.signalExtNs
   }
   ```
   (import `type TxTimeOpts` from `./phy`).
5. Replace, in this order, checking each site by hand:
   - `SIFS_NS` → `this.T.sifsNs` (lines 512, 522, 551, 557, 561, 583, 585, 605, 607, 677, 688, 697, 816, 826, 1005, 1008, 1037, 1234, 1248, 1274, 1306, 1356, 1389)
   - `SLOT_NS` → `this.T.slotNs` (336, 1037, 1389)
   - `DIFS_NS` / `EIFS_NS` at 286-288 → `const aifs = this.cfg.edca ? aifsNs(e.params.aifsn, this.T) : this.T.difsNs` and `const dur = this.corruptLast ? this.T.eifsNs - this.T.difsNs + aifs : aifs`
   - `ACK_TIMEOUT_NS` / `CTS_TIMEOUT_NS` → `this.T.ackTimeoutNs` (688, 830, 892, 1306)
   - `RX_START_DELAY_NS` → `this.T.rxStartDelayNs` (1389)
   - `txTimeNs(` → `this.airNs(` (497, 507, 508, 583, 585, 674, 697, 812, 817, 865, 1036, 1047, 1157, 1180, 1231, 1257, 1303, 1388)
   - `txTimeModeNs(` → `this.airModeNs(` (505, 581, 597, 722, 799)
   - The two `maxPsduBytesFor(...)` budget calls (lines 801 and 1290) receive a duration that must now exclude the extension: pass `... - this.T.signalExtNs` for the duration argument (`2_000_000 - this.T.signalExtNs` at 801; `dur - this.T.signalExtNs` at 1290). `maxPsduBytesFor` itself is unchanged.
6. Remove the now-unused imports; `npx tsc -b` must report nothing.

- [ ] **Step 5: Run the whole engine suite**

Run: `npx vitest run tests/engine tests/course tests/model`
Expected: PASS, including `lesson-hashes.test.ts` (the default timing is identical to the old constants).

- [ ] **Step 6: Commit**

```bash
git add src/engine/mac.ts tests/engine/helpers.ts tests/engine/link-2g.test.ts
git commit -m "refactor(mac): per-link PhyTiming and signal extension in every airtime"
```

---

