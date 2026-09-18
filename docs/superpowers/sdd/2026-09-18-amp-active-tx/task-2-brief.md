### Task 2: Model types: tags, AP AMP config, records, view state

**Files:**
- Modify: `src/model/types.ts` (`NodeKind`), `src/model/scenario.ts` (`NodeCfg`, schema, `AmpApCfg`, `AmpTagCfg`), `src/model/records.ts` (`MacStateName`, four records), `src/model/view.ts` (`NodeView.amp`, `NodeView.ampRound`, `initViewState`, `applyRecord`)
- Modify: exhaustive switches on `MacStateName`: `src/scene/nodes.ts` `haloColor` (add `case 'ampWait': return 0x0d9488`), `src/ui/laneLayout.ts` `STATE_SPAN` (add `ampWait: 'slot'` — requires the `SpanKind` change in Task 6; for now map `ampWait: 'sifs'` and change it in Task 6)
- Test: `tests/model/scenario.test.ts`, `tests/model/view.test.ts`

**Interfaces (produced):**

```ts
// types.ts
export type NodeKind = 'ap' | 'sta' | 'amp'
// scenario.ts
export interface AmpApCfg {
  pollIntervalMs: number; slots: number; acwe: number; dlKbps: 250 | 1000; ulKbps: 250 | 1000 | 4000
  protection: 'ctsSelf' | 'none'; readMode: 'inline' | 'twoPhase'
}
export const DEFAULT_AMP_AP: AmpApCfg = { pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline' }
export interface AmpTagCfg { id16?: number; dlSensDbm?: number }
// NodeCfg gains:  ampAp?: AmpApCfg   (AP, generation eht only)   ampTag?: AmpTagCfg   (kind 'amp' only)
// records.ts
export type MacStateName = ... | 'ampWait'
  | { type: 'AMP_ROUND'; node: string; phase: 'random' | 'scheduled'; slots: number; slotNs: Ns; acwe: number; dlKbps: number; ulKbps: number; untilNs: Ns }
  | { type: 'AMP_SLOT'; node: string; slot: number; untilNs: Ns }
  | { type: 'AMP_ABOC'; node: string; aboc: number; acw: number; slot: number | null }
  | { type: 'AMP_RESULT'; node: string; slot: number; sent: boolean; acked: boolean }
// view.ts
export interface AmpTagView { aboc: number | null; acw: number; slot: number | null; sent: number; acked: number; lost: number; roundsHeard: number; roundsSatOut: number }
export interface AmpRoundView { phase: 'random' | 'scheduled'; slot: number; slots: number; untilNs: Ns; received: string[] }
// NodeView gains:  amp?: AmpTagView   ampRound?: AmpRoundView | null
```

Schema rules: `kind: z.enum(['ap', 'sta', 'amp'])`; a node with `kind: 'amp'` must have `linkId` absent or `'2g'` (the plan forces 2g), `profiles` normalised to `['idle']`, and may carry `ampTag`; `ampAp` is allowed only on `kind: 'ap'` with `caps.generation === 'eht'` (superRefine messages: "AMP tags live on the 2.4 GHz link", "AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)"). `ampAp` fields: `pollIntervalMs` 10–10000, `slots` 1–16, `acwe` 0–4, enums as above.

- [ ] **Step 1: Write the failing tests**

`tests/model/scenario.test.ts`:
```ts
import { DEFAULT_AMP_AP, ScenarioSchema, defaultScenario } from '../../src/model/scenario'

describe('AMP nodes in the schema', () => {
  it('a tag is kind amp on 2.4 GHz; AMP polling needs a Wi-Fi 7 AP', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    sc.nodes.push({ id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, ampTag: { dlSensDbm: -70 } })
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    sc.nodes[3].linkId = '5g'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/2\.4 GHz/)
    sc.nodes[3].linkId = '2g'
    sc.nodes[0].caps.generation = 'he'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/Wi-Fi 7/)
  })
})
```

`tests/model/view.test.ts` (append; look at the file's existing helpers for building a `ViewState`, e.g. `initViewState(scenario)`):
```ts
describe('AMP records in the view', () => {
  it('tracks a tag through draw, slot, result and the AP through its round', () => {
    const sc = defaultScenario()
    sc.nodes[0].caps = { generation: 'eht', features: { edca: true } }
    sc.nodes[0].ampAp = { ...DEFAULT_AMP_AP }
    sc.nodes.push({ id: 'tag-1', kind: 'amp', name: 'Tag', pos: { x: 3, y: 3, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} } })
    const vs = initViewState(sc)
    expect(vs.nodes['tag-1#2g'].amp).toEqual({ aboc: null, acw: 0, slot: null, sent: 0, acked: 0, lost: 0, roundsHeard: 0, roundsSatOut: 0 })
    expect(vs.nodes['ap#2g'].ampRound).toBeNull()
    let seq = 0
    const rec = (r: Omit<TLRecord, 'seq'>) => applyRecord(vs, { ...r, seq: seq++ } as TLRecord)
    rec({ t: 0, type: 'AMP_ROUND', node: 'ap#2g', phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250, untilNs: 3_000_000 })
    expect(vs.nodes['ap#2g'].ampRound).toEqual({ phase: 'random', slot: 0, slots: 4, untilNs: 3_000_000, received: [] })
    rec({ t: 618_000, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 1, acw: 3, slot: 2 })
    expect(vs.nodes['tag-1#2g'].amp).toMatchObject({ aboc: 1, acw: 3, slot: 2, roundsHeard: 1 })
    rec({ t: 628_000, type: 'AMP_SLOT', node: 'ap#2g', slot: 1, untilNs: 900_000 })
    expect(vs.nodes['ap#2g'].ampRound!.slot).toBe(1)
    rec({ t: 1_300_000, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: true })
    expect(vs.nodes['tag-1#2g'].amp).toMatchObject({ aboc: null, slot: null, sent: 1, acked: 1, lost: 0 })
    rec({ t: 2_000_000, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 5, acw: 7, slot: null })
    expect(vs.nodes['tag-1#2g'].amp!.roundsSatOut).toBe(1)
    rec({ t: 2_500_000, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 3, sent: true, acked: false })
    expect(vs.nodes['tag-1#2g'].amp!.lost).toBe(1)
  })
})
```

- [ ] **Step 2: Run to see them fail** — `npx vitest run tests/model/scenario.test.ts tests/model/view.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`scenario.ts`: types and defaults as in the interface block; schema entries:
```ts
    kind: z.enum(['ap', 'sta', 'amp']),
    ampAp: z.object({
      pollIntervalMs: z.number().min(10).max(10_000), slots: z.number().int().min(1).max(16), acwe: z.number().int().min(0).max(4),
      dlKbps: z.union([z.literal(250), z.literal(1000)]), ulKbps: z.union([z.literal(250), z.literal(1000), z.literal(4000)]),
      protection: z.enum(['ctsSelf', 'none']), readMode: z.enum(['inline', 'twoPhase']),
    }).optional(),
    ampTag: z.object({ id16: z.number().int().min(1).max(0xfffe).optional(), dlSensDbm: z.number().optional() }).optional(),
```
and in the node `superRefine`:
```ts
      if (n.kind === 'amp' && n.linkId !== undefined && n.linkId !== '2g') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP tags live on the 2.4 GHz link' })
      if (n.ampAp && !(n.kind === 'ap' && n.caps.generation === 'eht')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AMP polling needs a Wi-Fi 7 AP (the AMP DL PPDU carries U-SIG)' })
```
`caps.ts` `nodeLinks`: `if (n.kind === 'amp') return ['2g']` as the first line.

`records.ts`: add `'ampWait'` and the four record variants.

`view.ts`: add the two interfaces; in `initViewState`, for `cfg.kind === 'amp'` set `amp: { aboc: null, acw: 0, slot: null, sent: 0, acked: 0, lost: 0, roundsHeard: 0, roundsSatOut: 0 }` and `acs: null`; for the AP set `ampRound: null` on every AP lane. In `applyRecord`:
```ts
    case 'AMP_ROUND': { const n = vs.nodes[r.node]; n.ampRound = { phase: r.phase, slot: 0, slots: r.slots, untilNs: r.untilNs, received: [] }; break }
    case 'AMP_SLOT': { const n = vs.nodes[r.node]; if (n.ampRound) n.ampRound.slot = r.slot; break }
    case 'AMP_ABOC': { const a = vs.nodes[r.node].amp; if (!a) break; a.aboc = r.aboc; a.acw = r.acw; a.slot = r.slot; a.roundsHeard++; if (r.slot === null) a.roundsSatOut++; break }
    case 'AMP_RESULT': { const a = vs.nodes[r.node].amp; if (!a) break; if (r.sent) a.sent++; if (r.acked) a.acked++; else a.lost++; a.aboc = null; a.slot = null; break }
```
In the existing `RX_OK` case, when `r.frame.kind === 'ampResp'` and the receiving node has `ampRound`, push `r.from` onto `ampRound.received`. When a `TX_START` of an `ampTrigger` arrives, leave `ampRound` as set by `AMP_ROUND`; when the round's last Ack `TX_END` arrives (`r.frame.kind === 'ampAck' && r.frame.amp?.ackFor === n.ampRound?.slots`), set `ampRound = null` only if `ampRound.phase === 'scheduled'` or the scenario's read mode is inline (the reducer does not know the config, so instead: keep `ampRound` until the next `AMP_ROUND` or a `MAC_STATE` record other than `tx`/`waitAck` on that node; implement the latter: in the `MAC_STATE` case, `if (r.state !== 'tx' && r.state !== 'waitAck') n.ampRound = null`).

- [ ] **Step 4: Run** — `npx vitest run tests/model && npx tsc -b` → PASS. Also `npx vitest run tests/engine/lesson-hashes.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(model): AMP tags, AP polling config, AMP records and view state"`

---

