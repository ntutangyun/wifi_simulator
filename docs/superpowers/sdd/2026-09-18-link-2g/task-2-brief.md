### Task 2: `PhyTiming` in phy.ts

**Files:**
- Modify: `src/engine/phy.ts` (after line 19, `CTS_TIMEOUT_NS`; and `aifsNs` at line 278)
- Test: `tests/engine/link-2g.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export interface PhyTiming { sifsNs: Ns; slotNs: Ns; difsNs: Ns; rxStartDelayNs: Ns; ackTimeoutNs: Ns; signalExtNs: Ns; eifsNs: Ns }
  export const OFDM_5G: PhyTiming
  export const ERP_2G: PhyTiming
  export function aifsNs(aifsn: number, T: PhyTiming = OFDM_5G): Ns
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/engine/link-2g.test.ts
import { describe, it, expect } from 'vitest'
import { ERP_2G, OFDM_5G, aifsNs, txTimeNs, ACK_BYTES } from '../../src/engine/phy'

describe('per-link PHY timing (802.11-2024 Table 17-21 / Table 18-5, §10.3.8)', () => {
  it('5 GHz OFDM keeps the clause 17 values', () => {
    expect(OFDM_5G).toEqual({ sifsNs: 16_000, slotNs: 9_000, difsNs: 34_000, rxStartDelayNs: 20_000, ackTimeoutNs: 45_000, signalExtNs: 0, eifsNs: 94_000 })
  })
  it('2.4 GHz ERP-OFDM: SIFS 10, short slot 9, DIFS 28, AckTimeout 39, 6 µs signal extension, EIFS 88', () => {
    expect(ERP_2G).toEqual({ sifsNs: 10_000, slotNs: 9_000, difsNs: 28_000, rxStartDelayNs: 20_000, ackTimeoutNs: 39_000, signalExtNs: 6_000, eifsNs: 88_000 })
    // EIFS = SIFS + DIFS + ACK at 6 Mb/s including its signal extension
    expect(ERP_2G.eifsNs).toBe(ERP_2G.sifsNs + ERP_2G.difsNs + txTimeNs(ACK_BYTES, 6) + ERP_2G.signalExtNs)
  })
  it('AIFS follows the link timing', () => {
    expect(aifsNs(3)).toBe(16_000 + 3 * 9_000)
    expect(aifsNs(3, ERP_2G)).toBe(10_000 + 3 * 9_000)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/engine/link-2g.test.ts`
Expected: FAIL, `ERP_2G` is not exported.

- [ ] **Step 3: Add the timing table**

In `src/engine/phy.ts`, after `export const CTS_TIMEOUT_NS = ACK_TIMEOUT_NS`:

```ts
/**
 * Interframe timing of one link's PHY. 5/6 GHz run the clause 17 OFDM values
 * (the module constants above); 2.4 GHz runs clause 18 ERP-OFDM (Table 18-5):
 * aSIFSTime 10 µs, short slot 9 µs, and a 6 µs signal extension appended to
 * every PPDU (§10.3.8) so that clause 16 stations compute the NAV correctly.
 */
export interface PhyTiming {
  sifsNs: Ns
  slotNs: Ns
  difsNs: Ns
  rxStartDelayNs: Ns
  ackTimeoutNs: Ns
  /** aSignalExtension: no-transmission period counted in every PPDU's TXTIME (0 on 5/6 GHz). */
  signalExtNs: Ns
  eifsNs: Ns
}

export const OFDM_5G: PhyTiming = {
  sifsNs: SIFS_NS, slotNs: SLOT_NS, difsNs: DIFS_NS, rxStartDelayNs: RX_START_DELAY_NS,
  ackTimeoutNs: ACK_TIMEOUT_NS, signalExtNs: 0, eifsNs: 0, // eifsNs filled below (needs txTimeNs)
}
```

and, after `EIFS_NS` is defined (line 93):

```ts
OFDM_5G.eifsNs = EIFS_NS

const ERP_SIFS_NS: Ns = 10_000
const ERP_SIGNAL_EXT_NS: Ns = 6_000
export const ERP_2G: PhyTiming = {
  sifsNs: ERP_SIFS_NS, slotNs: SLOT_NS, difsNs: ERP_SIFS_NS + 2 * SLOT_NS,
  rxStartDelayNs: RX_START_DELAY_NS,
  ackTimeoutNs: ERP_SIFS_NS + SLOT_NS + RX_START_DELAY_NS,
  signalExtNs: ERP_SIGNAL_EXT_NS,
  eifsNs: ERP_SIFS_NS + (ERP_SIFS_NS + 2 * SLOT_NS) + ACK_TX_TIME_6M_NS + ERP_SIGNAL_EXT_NS,
}
```

Replace `aifsNs`:

```ts
export function aifsNs(aifsn: number, T: PhyTiming = OFDM_5G): Ns {
  return T.sifsNs + aifsn * T.slotNs
}
```

(If `OFDM_5G` being mutated after declaration offends the linter, declare it after `EIFS_NS` instead; the exported object must be frozen in value either way.)

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/engine/link-2g.test.ts tests/engine/phy-modes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phy.ts tests/engine/link-2g.test.ts
git commit -m "feat(phy): per-link PhyTiming with the 2.4 GHz ERP-OFDM values"
```

---

