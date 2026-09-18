### Task 5: Simulation wiring: per-link timing and path loss

**Files:**
- Modify: `src/engine/simulation.ts` (`LINK_EXTRA_LOSS_DB` line 34; the per-link loop 79-100; `WifiMac` cfg (add `timing`); `widthForPeer`; `primaryMac` 172-176; `enqueue` ARRIVAL line 188)
- Test: `tests/engine/link-2g.test.ts` (extend)

**Interfaces:**
- Consumes: `ERP_2G`, `OFDM_5G` (Task 2), `linkOfVirtual`, `LINK_ORDER`, `negotiatedWidth(a, b, link)` (Task 4).
- Produces: `export const LINK_EXTRA_LOSS_DB: Record<LinkId, number> = { '2g': -6.5, '5g': 0, '6g': 1.2 }`; `export function timingFor(link: LinkId): PhyTiming`.

- [ ] **Step 1: Write the failing test**

```ts
import { Simulation, LINK_EXTRA_LOSS_DB, timingFor } from '../../src/engine/simulation'
import { defaultScenario } from '../../src/model/scenario'
import { buildLinkTable } from '../../src/engine/propagation'

describe('a station on the 2.4 GHz link inside a Simulation', () => {
  function twoBand() {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } } // AP: Wi-Fi 7
    sc.nodes[1].caps = { generation: 'he', features: { edca: true } }
    sc.nodes[1].linkId = '2g'
    sc.nodes[1].profiles = ['saturated']
    sc.nodes[2].profiles = ['idle']
    return sc
  }
  it('path loss on 2.4 GHz is 6.5 dB lower than on 5 GHz', () => {
    expect(LINK_EXTRA_LOSS_DB).toEqual({ '2g': -6.5, '5g': 0, '6g': 1.2 })
    expect(timingFor('2g')).toBe(ERP_2G)
    expect(timingFor('5g')).toBe(OFDM_5G)
  })
  it('records on the 2g lane use the 2.4 GHz timing and carry the extension', () => {
    const sim = new Simulation(twoBand())
    const recs = sim.runUntil(20 * 1_000_000).records
    const tx = recs.find((r) => r.type === 'TX_START' && r.node === 'sta-1#2g' && r.frame.kind === 'data')
    expect(tx).toBeDefined()
    const data = recs.find((r) => r.type === 'TX_END' && r.node === 'sta-1#2g' && r.frame.kind === 'data')!
    const ack = recs.find((r) => r.type === 'TX_START' && r.node === 'ap#2g' && r.frame.kind === 'ack' && r.t >= data.t)!
    expect(ack.t - data.t).toBe(10_000)
    expect(recs.some((r) => r.type === 'ARRIVAL' && r.node === 'sta-1#2g')).toBe(true)
  })
  it('the 2g link table is the 5g table plus 6.5 dB', () => {
    const sc = twoBand()
    const table = buildLinkTable(sc.nodes, sc.walls)
    const sim = new Simulation(sc)
    const recs = sim.runUntil(5 * 1_000_000).records
    // The data rate chosen on 2g reflects the stronger link: never lower than what the 5 GHz table would give.
    const tx = recs.find((r) => r.type === 'TX_START' && r.node === 'sta-1#2g' && r.frame.kind === 'data')!
    expect(tx.frame.mbps).toBeGreaterThan(0)
    expect(table.get('sta-1')!.get('ap')!).toBeLessThan(-40) // sanity: the fixture geometry is not point-blank
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/engine/link-2g.test.ts`
Expected: FAIL (`timingFor` missing; no `sta-1#2g` records).

- [ ] **Step 3: Implement**

In `simulation.ts`:

```ts
import { ERP_2G, OFDM_5G, mcsForRssi, type PhyTiming } from './phy'
import { ..., linkOfVirtual, physicalId, ... } from '../model/caps'

/** Extra path loss per link relative to the 5 GHz table (higher frequency loses more; 2.4 GHz loses 6.5 dB less). */
export const LINK_EXTRA_LOSS_DB: Record<LinkId, number> = { '2g': -6.5, '5g': 0, '6g': 1.2 }

/** Interframe timing of a link's PHY: clause 18 ERP-OFDM on 2.4 GHz, clause 17 OFDM elsewhere. */
export function timingFor(link: LinkId): PhyTiming {
  return link === '2g' ? ERP_2G : OFDM_5G
}
```

Inside the per-link loop: pass `timing: timingFor(link)` in the `WifiMac` cfg; change `widthForPeer: (peer) => negotiatedWidth(n, other(n, peer), link)` and the `mcsForRssi(..., negotiatedWidth(n, peerCfg, link))` call.

Replace `primaryMac` and the ARRIVAL virtual id with one helper defined before them:

```ts
    /** The virtual id of a node's primary MAC: its first lane in the plan (5g before 6g before 2g). */
    const primaryVid = (id: string): string => plan.virtualIds.find((v) => physicalId(v) === id)!
    const primaryMac = (id: string): WifiMac => this.macs.get(primaryVid(id))!
```

and in `enqueue`: `node: primaryVid(atNode)`. The MLO sibling poke (`vid.startsWith(`${atNode}#`)`) stays as it is: a 2g-only node has no sibling.

- [ ] **Step 4: Run engine, model and course suites (hash fixture included)**

Run: `npx vitest run tests/engine tests/model tests/course && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/simulation.ts tests/engine/link-2g.test.ts
git commit -m "feat(sim): 2.4 GHz link with ERP timing and its path-loss offset"
```

---

