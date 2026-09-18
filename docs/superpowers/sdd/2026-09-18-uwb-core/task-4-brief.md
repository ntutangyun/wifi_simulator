### Task 4: Model seams — node kind, session config, records, frames, lanes, view

**Files:**
- Modify: `src/model/types.ts` (NodeKind), `src/model/scenario.ts`, `src/model/records.ts`, `src/model/frames.ts`, `src/model/caps.ts`, `src/model/view.ts`
- Create: `src/uwb/records.ts`, `src/uwb/frames.ts`, `src/uwb/view.ts`, `src/model/lanes.ts`
- Test: `tests/model/uwb-scenario.test.ts`, `tests/uwb/view.test.ts`, `tests/model/lanes.test.ts`

**Interfaces:**

```ts
// src/model/types.ts
export type NodeKind = 'ap' | 'sta' | 'amp' | 'uwb'

// src/model/scenario.ts (additions)
export interface UwbNodeCfg { role: 'anchor' | 'tag'; ppm?: number }
export interface UwbSessionCfg {
  method: 'ss' | 'ds'; blockRstu: number; slotRstu: number; channel: 5 | 9
  tsNoisePs: number; cfoNoisePpm: number; nlos: boolean
}
export const DEFAULT_UWB_SESSION: UwbSessionCfg = { method: 'ds', blockRstu: 240_000, slotRstu: 2400, channel: 9, tsNoisePs: 100, cfoNoisePpm: 0.2, nlos: true }
// NodeCfg gains `uwb?: UwbNodeCfg`; Scenario gains `uwb?: UwbSessionCfg`
// Schema: kind enum adds 'uwb'; node.uwb: z.object({ role: z.enum(['anchor','tag']), ppm: z.number().min(-100).max(100).optional() }).optional();
//   scenario.uwb: z.object({... slotRstu: z.number().int().min(300).refine(v => v % 3 === 0, 'slot must be a multiple of 3 RSTU'), blockRstu: z.number().int().positive().refine(v => v % 3 === 0) ...}).optional()
// superRefine rules (replace the "exactly one AP" rule):
//   - wifi = nodes with kind 'sta' | 'amp'; aps = kind 'ap'; if wifi.length > 0 || aps.length > 1 → require aps.length === 1 (message: 'scenario must have exactly one AP …')
//   - a 'uwb' node must carry `uwb`; a non-'uwb' node must not
//   - if any 'uwb' node: sc.uwb required; ≥ 1 anchor and ≥ 1 tag; tags ≤ floor(blockRstu / (slots · slotRstu)) where slots = method === 'ss' ? anchors + 1 : 2·anchors + 2
//   - keep every existing rule for Wi-Fi nodes

// src/uwb/records.ts
import type { Ns } from '../model/types'
import type { UwbFrameKind } from './frames'
export type UwbRecord =
  | { type: 'UWB_ROUND'; node: string; block: number; round: number; slots: number; slotNs: Ns; method: 'ss' | 'ds'; untilNs: Ns }
  | { type: 'UWB_SLOT'; node: string; slot: number; untilNs: Ns }
  | { type: 'UWB_TS'; node: string; dir: 'tx' | 'rx'; peer: string; frameKind: UwbFrameKind; counter: number; fom?: number }
  | { type: 'UWB_RANGE'; node: string; peer: string; method: 'ss' | 'ds'; tofRctu: number; tofRawRctu?: number; distM: number; trueDistM: number; fom: number; block: number; round: number }
  | { type: 'UWB_POSITION'; node: string; x: number; y: number; trueX: number; trueY: number; gdop: number; ellipse: { a: number; b: number; thetaRad: number }; anchors: string[]; block: number }
  | { type: 'UWB_TIMEOUT'; node: string; slot: number; peer: string; expected: UwbFrameKind }
// src/model/records.ts: MacStateName adds 'uwbWait'; TLRecord's union adds `| UwbRecord` (import type from '../uwb/records')

// src/uwb/frames.ts
export type UwbFrameKind = 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport'
export interface UwbInfo {
  sp: 1; method: 'ss' | 'ds'; block: number; round: number; slot: number
  /** Payload IEs carried, in order (e.g. ['ARC', 'RDM', 'RRMC']). */
  ies: string[]
  /** Poll: the anchors' ids in slot order (RDM IE). */
  schedule?: string[]
  /** Response (SS): RRTI reply time in RCTU. */
  replyRctu?: number
  /** Final (DS): per anchor { id, tround1, treply2 } (RMI + RRTI IEs). */
  finalTimes?: { id: string; tround1: number; treply2: number }[]
  /** Report (DS): the responder's treply1 and tround2 (RMI IE). */
  reportTimes?: { treply1: number; tround2: number }
}
// src/model/frames.ts: FrameKind adds the four kinds; FrameDesc gains `uwb?: UwbInfo` (import type from '../uwb/frames')
// Builders (in src/uwb/frames.ts), each returning a FrameDesc with durationFieldNs 0, mbps 6.81, txTimeNs = uwbPpduNs(bytes):
export function makePoll(tag: string, anchors: string[], method: 'ss' | 'ds', block: number, round: number): FrameDesc      // dst '*' , bytes uwbPollBytes(anchors.length), ies ['ARC','RDM','RRMC']
export function makeResp(anchor: string, tag: string, method: 'ss' | 'ds', block: number, round: number, slot: number, replyRctu?: number): FrameDesc  // ies ['RRMC','RRTI'] (ss) / ['RRMC'] (ds)
export function makeFinal(tag: string, times: { id: string; tround1: number; treply2: number }[], block: number, round: number, slot: number): FrameDesc  // dst '*', ies ['RMI', 'RRTI'], bytes uwbFinalBytes(times.length) (14 + 12N)
export function makeReport(anchor: string, tag: string, treply1: number, tround2: number, block: number, round: number, slot: number): FrameDesc  // ies ['RMI'], bytes 24

// src/model/lanes.ts
import { linkPlanFor } from './caps'
/** Timeline lanes: the Wi-Fi link plan's virtual ids, then every UWB node's id in scenario order. */
export function laneIds(nodes: NodeCfg[]): string[]
// src/model/caps.ts: linkPlanFor ignores nodes of kind 'uwb' everywhere; with no AP it returns { links: [], members: { '2g': [], '5g': [], '6g': [] }, virtualIds: [] }; nodeLinks returns [] for 'uwb'.

// src/uwb/view.ts
export interface UwbRangeView { distM: number; trueDistM: number; method: 'ss' | 'ds'; fom: number; n: number }
export interface UwbPositionView { x: number; y: number; trueX: number; trueY: number; gdop: number; ellipse: { a: number; b: number; thetaRad: number }; n: number }
export interface UwbNodeView {
  role: 'anchor' | 'tag'; block: number; round: number; slot: number | null
  rounds: number; timeouts: number
  ranges: Record<string, UwbRangeView>
  position: UwbPositionView | null
}
export function initUwbNodeView(cfg: UwbNodeCfg): UwbNodeView   // block 0, round 0, slot null, rounds 0, timeouts 0, ranges {}, position null
/** Applies one UWB_* record; returns true when it handled it. */
export function applyUwbRecord(vs: ViewState, r: TLRecord): boolean
//   UWB_ROUND: node.uwb.block/round set, slot 0, rounds += 1
//   UWB_SLOT: slot = r.slot
//   UWB_TS: nothing (event-log only)
//   UWB_RANGE: ranges[peer] = { distM, trueDistM, method, fom, n: (prev.n ?? 0) + 1 }
//   UWB_POSITION: position = { x, y, trueX, trueY, gdop, ellipse, n: (prev.n ?? 0) + 1 }
//   UWB_TIMEOUT: timeouts += 1
// src/model/view.ts: NodeView gains `uwb?: UwbNodeView`; initViewState iterates laneIds(sc.nodes): Wi-Fi lanes as today, UWB lanes with the same base NodeView shape plus uwb = initUwbNodeView(cfg.uwb!), acs null; applyRecord starts with `if (r.type.startsWith('UWB_')) { applyUwbRecord(vs, r); return }`.
```

- [ ] **Step 1: Write the failing tests.**

`tests/model/uwb-scenario.test.ts`: (a) a UWB-only scenario (2 anchors, 1 tag, `uwb: DEFAULT_UWB_SESSION`, no AP) parses; (b) the same with a `sta` and no AP fails with the AP message; (c) a `uwb` node without `uwb` cfg fails; (d) a `sta` node with a `uwb` cfg fails; (e) `slotRstu: 2401` fails, `2400` passes; (f) 11 tags with DS and 4 anchors (10 slots × 2 ms = 20 ms; 10 rounds per 200 ms block) fail, 10 pass; (g) every existing lesson scenario still parses (import `LESSONS` and parse each `scenario()`).

`tests/model/lanes.test.ts`: `laneIds` of [ap, sta, uwb anchor, uwb tag] = ['ap', 'sta', 'anchor', 'tag']; of a UWB-only scenario = the uwb ids in order; of an MLO scenario = the existing virtual ids (compare with `linkPlanFor(...).virtualIds`).

`tests/uwb/view.test.ts`: build a view with `initViewState` for a UWB-only scenario, apply a hand-written record sequence (UWB_ROUND, UWB_SLOT, UWB_TS, UWB_RANGE twice for one peer, UWB_POSITION, UWB_TIMEOUT, MAC_STATE uwbWait) and assert the `uwb` fields (`ranges[peer].n === 2`, `timeouts === 1`, `rounds === 1`, state `uwbWait`); then the snapshot/replay equivalence pattern used in the existing view tests (`cloneView` at the midpoint + replaying the rest equals the live view).

- [ ] **Step 2: Run** the three files — expect failures.
- [ ] **Step 3: Implement** every interface above. In `scenario.ts`, keep the existing AP rule text for the Wi-Fi case. `linkPlanFor` must not throw without an AP.
- [ ] **Step 4: Run** `npx vitest run` (whole suite: `tests/model/caps.test.ts` and the lesson hashes must still pass) and `npx tsc -b`.
- [ ] **Step 5: Commit** `feat(model): UWB node kind, session config, records, frames, lanes and view seam`.

---

