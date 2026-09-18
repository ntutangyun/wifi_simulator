# Final-review fix wave — findings to address (branch feat/link-2g, head e706fb3)

Context: the 2.4 GHz link branch. Spec Part A: docs/superpowers/specs/2026-09-18-amp-tier-design.md. Every shipped scenario must stay bit-identical (tests/engine/lesson-hashes.test.ts). The existing snapshot/replay equivalence test (tests/engine/simulation.test.ts) must keep passing after any view change.

## Critical

1. **View: the AP's shared queue never drains for 2.4 GHz downlink.** `src/model/view.ts` `siblingId` (~line 194) pairs only `vid` ↔ `vid#6g`. The AP now has a `#2g` lane sharing the same `AcQueues`; DL MSDUs are ENQUEUEd on the primary (5g) lane and DEQUEUEd with `node: 'ap#2g'`, so the DEQUEUE handler (~263-272) never finds the MSDU (siblingId('ap#2g') → 'ap#2g#6g' → null). Result: the 5 GHz queue view grows without bound, every snapshot clones it, and txLatency/rxLatency/appRtt read zero for every 2.4 GHz device.
   Fix: replace `siblingId` with `siblingIds(vs, vid): string[]` = every other lane of the same physical node (`Object.keys(vs.nodes).filter(v => v !== vid && physicalId(v) === physicalId(vid))`), and use it in `queueHolder`, `syncQueueLen` and the DEQUEUE fallback. Add a test in `tests/model/` (or `tests/engine/`) that runs a scenario with a 2.4 GHz downlink station (default scenario with `sta-1` video on `linkId: '2g'`, 200 ms) through the live view and asserts the AP's queue stays bounded (e.g. < 50) and `rxLatency.n > 0` on the `sta-1#2g` lane and `txLatency.n > 0` on the AP.

2. **Lookups keyed by physical id miss a station with no 5 GHz lane.** Three sites:
   - `src/model/view.ts` ~284 `const rx = vs.nodes[m.dst]` (rxLatency/appRtt/relayLatency never recorded for a 2g-only station).
   - `src/model/view.ts` ~400 `const sender = vs.nodes[r.from]` (a 2.4 GHz station's `txOk` stays 0).
   - `src/scene/viewport.tsx` ~74 `const nv = view.nodes[id]` (a 2.4 GHz node's 3D visual never updates).
   Fix: add `primaryLaneOf(vs, physId)` in `view.ts` (the node's first lane in LINK_ORDER: the bare id if present, else `id#6g`, else `id#2g`, resolved by `linkOfVirtual`/`LINK_ORDER` from `src/model/caps.ts`) and use it at all three sites. Extend the test from finding 1 to assert `txOk > 0` on `sta-1#2g` after the run.

3. **EditorGuide teaching text is false.** `src/editor/EditorGuide.tsx` ~125-128 (en) and ~284-286 (zh): "shown for non-MLO Wi-Fi 6/7 devices … The two bands … 6 GHz carries +1.2 dB". Rewrite both languages: the Link selector is shown for every non-MLO device except Wi-Fi 5 (VHT is 5 GHz only); the three bands are separate channels (devices on different links never hear or contend with each other); 2.4 GHz carries −6.5 dB path loss relative to 5 GHz and uses ERP-OFDM timing (SIFS 10 µs, DIFS 28 µs, a 6 µs signal extension on every frame); 6 GHz carries +1.2 dB; MLO devices use 5 + 6 GHz. Natural Simplified Chinese for zh.

## Important

4. **Stray scratch files at the repo root:** `base_version.ts` and `cp_check.txt` are untracked leftovers from the Task 7 quote repair. Delete them (do not commit them). The quote repair itself is already committed (e706fb3).

5. **`setGeneration` leaves a stale `linkId: '6g'` on 802.11a/g.** `src/editor/FloorPlanEditor.tsx` ~212. Fix: clear `linkId` whenever the new generation cannot use it (VHT: always; nonht: when it is `'6g'`). Also extend the `superRefine` in `src/model/scenario.ts` (~238) to reject `linkId: '6g'` on `nonht`/`vht` with a message containing "6 GHz", and add a schema test for it in `tests/model/scenario.test.ts`.

6. **An all-2.4 GHz scenario builds a phantom, empty 5 GHz link.** `src/model/caps.ts` `linkPlanFor` (~126) seeds `used` with `'5g'` unconditionally. Spec rule: "The AP is a member of every link that has at least one other member." Fix: seed `used` from the stations' links (plus `'6g'` when the AP is MLO), and add `'5g'` only if the set would otherwise be empty (an AP-only scenario keeps one 5 GHz link). Existing 5 GHz-only scenarios must be unchanged (hash fixture). Update/add a `tests/model/caps.test.ts` case: AP + one 2g station → `links: ['2g']`, `virtualIds: ['ap#2g', 'sta#2g']`; AP alone → `links: ['5g']`. NOTE: with this change a 2g-only scenario's AP primary lane becomes `ap#2g` — the `primaryVid` logic in `simulation.ts` already handles that; verify by running the new view test with the phone removed as well.

## Minor (fix in the same wave; all are one- or two-line changes in files the branch owns)

7. `src/engine/simulation.ts` ~180: sibling-poke guard `vid !== virtualId(atNode, '5g')` → `vid !== primaryVid(atNode)`.
8. `src/engine/simulation.ts` ~173: precompute `primaryVid` as a `Map<string, string>` built once from `plan.virtualIds` instead of a linear `find` per enqueue.
9. `src/model/caps.ts` ~92-95 `nodeLinks`: add the missing `n.kind !== 'ap'` guard on the `'6g'` arm for symmetry with the `'2g'` arm, and a one-line comment that the AP's links are decided by `linkPlanFor`.
10. `src/editor/FloorPlanEditor.tsx` ~577: show the band selector only for `selNode.kind === 'sta'` (the AP's `linkId` is ignored).
11. `src/scene/effects.ts` ~137: `is6g = f.from.includes('#6g')` → derive the band with `linkOfVirtual(f.from)` and give 2.4 GHz waves their own colour tint (e.g. slightly warmer/orange-shifted wireframe) so the 3D view tells the bands apart.
12. `src/course/lessonKit.ts` ~164 (`first6g`) and `src/course/lessons.ts` ~1117 (`!r.node.includes('#6g')` labelled "first 5 GHz data frame"): use `linkOfVirtual(r.node) === '6g'` / `=== '5g'`. Records unchanged, so the hash fixture is unaffected.
14. `src/ui/glossary.ts` aSignalExtension entry (en + zh): replace the "so that old 802.11b stations compute the NAV correctly" clause with "so that ERP receivers finish decoding before the SIFS response and the Duration/NAV arithmetic still adds up" (and the equivalent in zh), since the model uses the 9 µs short slot which presumes no 802.11b stations.
15. `tests/engine/link-2g.test.ts` ~31: assert the DIFS wait exactly (`toBe(28_000)`) after forcing a real busy period, or restructure so the assertion is exact; retitle the ACK-timeout test so it does not claim to cover EIFS (the EIFS test is the next `it`).
16. `tests/model/caps.test.ts` lines 2-3: merge the two imports from `../../src/model/caps`.
18. `src/engine/phy.ts` ~191: introduce `const ERP_DIFS_NS = ERP_SIFS_NS + 2 * SLOT_NS` and use it in both `difsNs` and `eifsNs`.
19. `README.md` "Known simplifications": add one bullet: "2.4 GHz always uses the 9 µs short slot (no 802.11b stations are modelled); the 6 µs signal extension is modelled as occupied medium, so a PPDU overlapping only another PPDU's extension counts as interference."

## Deferred (do NOT do now; ledgered)
13. `src/course/tier1/bianchiModel.ts` hardcodes 5 GHz timing — thread `PhyTiming` when a 2.4 GHz lesson arrives.
17. `@types/node` puts Node globals in scope for browser code — consider a `tsconfig` split for `tests/` later.

## Verification before commit
`npx vitest run` (all green, including lesson-hashes and the simulation snapshot/replay equivalence test), `npx tsc -b`, `npm run build`. Commit in one or two commits; commit messages end with:
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL
