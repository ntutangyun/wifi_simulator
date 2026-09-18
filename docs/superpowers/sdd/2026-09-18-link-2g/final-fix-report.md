# Final-review fix wave — report (branch feat/link-2g)

Base: `e706fb3`. Result: `58218c5` + `cc92a92`.

- `58218c5` fix(view,model): multi-lane view state and link plan for 2.4 GHz stations
- `cc92a92` fix(ui,docs): editor guide, band selector, glossary and README after the 2.4 GHz link

Findings 1–12, 14–16, 18, 19 are done. 13 and 17 were left alone as instructed.

---

## Per finding

### 1. View: the AP's shared queue never drains for 2.4 GHz downlink — DONE
`src/model/view.ts`:
- `siblingId` (was ~194) replaced by `siblingIds(vs, vid): string[]` at **view.ts:193-202** —
  `Object.keys(vs.nodes).filter(v => v !== vid && physicalId(v) === physicalId(vid))`.
- `queueHolder` **view.ts:204-215** now scans every sibling lane.
- `syncQueueLen` **view.ts:230-238** mirrors the counts onto `[vid, ...siblingIds(...)]`.
- DEQUEUE fallback **view.ts:281-292** loops over every sibling lane and keeps both the
  list and the index it found the MSDU at.

Covering test: `tests/model/view.test.ts:300-345`, describe
*"a station on the 2.4 GHz link, through the live view"* — runs the default scenario with
`sta-1` (downlink video) on `linkId: '2g'` for 400 ms through `initViewState` +
`applyRecord`, and asserts the AP's queue never exceeds 50 entries (and is non-zero, so the
assertion is not vacuous), `sta-1#2g.stats.rxLatency.n > 0`, mean ≤ max, and
`txLatency.n > 0` summed over the AP's lanes.

Note: the run is 400 ms rather than the 200 ms in the finding, because the station's cloud
keepalive ping (`PING_PERIOD_NS = 250 ms` in `src/engine/traffic.ts:63`) is the only uplink
a `video` station generates; at 200 ms `txOk` and `appRtt` are legitimately still zero.

### 2. Lookups keyed by physical id miss a station with no 5 GHz lane — DONE
- New exported helper `primaryLaneOf(vs, physId)` at **view.ts:217-228**: walks `LINK_ORDER`
  through `virtualId`, so it returns the bare lane, else `id#6g`, else `id#2g`.
- **view.ts:305** `const rx = primaryLaneOf(vs, m.dst)` (rxLatency / appRtt / relayLatency).
- **view.ts:421** `const sender = primaryLaneOf(vs, r.from)` (txOk).
- **src/scene/viewport.tsx:75-76** `const nv = primaryLaneOf(view, id)`.

Covering test: same block. `tests/model/view.test.ts:331` asserts `vs.nodes['sta-1']` is
`undefined` (the TV has no 5 GHz lane at all — so the old physical-id lookups could not have
worked), `:333` `rxLatency.n > 0`, `:335` `appRtt.n > 0`, `:336` `txOk > 0`.
The viewport site has no unit test (Three.js render loop); it is the same helper call.

### 3. EditorGuide teaching text is false — DONE
- English `<D t="Link">` **src/editor/EditorGuide.tsx:125-132**.
- Chinese `<D t="频段">` **src/editor/EditorGuide.tsx:287-293**.

Both now state: shown for every non-MLO station except Wi-Fi 5 (VHT is a 5 GHz-only PHY);
three separate channels, devices on different links never hear or contend with each other;
2.4 GHz −6.5 dB and ERP-OFDM timing (SIFS 10 µs, DIFS 28 µs, 6 µs signal extension on every
frame); 6 GHz +1.2 dB; MLO has no selector and runs 5 + 6 GHz.

Non-ASCII safety: edits were made with the Edit tool on exact strings, then verified two
ways — `git diff` of the file shows only the two intended hunks, and a Python code-point
census against `git show HEAD:…` shows **no change at all** in the counts of U+201C/U+201D
(2 each) or U+2018/U+2019. The only count deltas are the Chinese content characters and the
punctuation my new text introduces (U+2212, U+00B5, U+2014, U+FF08/FF09, …).

### 4. Stray scratch files — DONE
`base_version.ts` and `cp_check.txt` deleted from the worktree root; never staged
(`git status` is clean and neither appears in either commit).

### 5. `setGeneration` leaves a stale `linkId: '6g'` — DONE
- **src/editor/FloorPlanEditor.tsx:208-211**: `keepsLink = gen !== 'vht' && !(gen === 'nonht'
  && n.linkId === '6g')`; the patch sends `linkId: undefined` otherwise.
- **src/model/scenario.ts:254-256**: `superRefine` rejects `linkId: '6g'` on `nonht`/`vht`
  with the message *"6 GHz needs Wi-Fi 6 or Wi-Fi 7; 802.11a and Wi-Fi 5 (VHT) have no 6 GHz
  mode"* (contains "6 GHz").

Covering test: `tests/model/scenario.test.ts:72-84` — accepts `6g` on `he` and `eht`,
throws `/6 GHz/` on `nonht` and `vht`.

### 6. An all-2.4 GHz scenario builds a phantom, empty 5 GHz link — DONE
**src/model/caps.ts:123-139**: `used` starts empty, takes `'6g'` when the AP is MLO, then the
stations' links; `if (used.size === 0) used.add('5g')` keeps an AP-only scenario on one
5 GHz link. Existing 5 GHz-only and MLO scenarios are unchanged (an MLO AP still contributes
6 GHz, and any 5 GHz station contributes 5 GHz), which the hash fixture confirms.

Covering tests, `tests/model/caps.test.ts`:
- `:71-77` AP + one 2g station → `links: ['2g']`, `virtualIds: ['ap#2g', 'sta#2g']`,
  `members['5g'] === []`.
- `:79-83` AP alone → `links: ['5g']`, `virtualIds: ['ap']`.
- `:85-90` MLO AP + a 5 GHz station → `links: ['5g','6g']` (the MLO pair is not lost).
- Plus `tests/model/view.test.ts:338-345`, which runs the phone-less, non-MLO-AP variant end
  to end and asserts the view has exactly `['ap#2g', 'sta-1#2g']` — the "verify with the
  phone removed" check the finding asked for. It exercises the `primaryVid` path with a
  primary lane that is not 5 GHz.

### 7. Sibling-poke guard — DONE
**src/engine/simulation.ts:197**: `if (vid !== primaryVid(atNode) && physicalId(vid) === atNode)`.
(`physicalId(vid) === atNode` replaces `vid.startsWith(atNode + '#')`; the bare lane is
excluded by the `primaryVid` clause whenever it exists, since 5 GHz is first in `LINK_ORDER`.)
Covered indirectly by `tests/engine/lesson-hashes.test.ts` (bit-identical) and the 2g-only
view test above.

### 8. Precompute `primaryVid` as a Map — DONE
**src/engine/simulation.ts:176-182**: `primaryVids` built once from `plan.virtualIds`
(first lane per physical id wins), `primaryVid` is a map lookup. Behaviour-identical, proven
by the hash fixture.

### 9. `nodeLinks` 6 GHz arm missing the AP guard — DONE
**src/model/caps.ts:95**: `if (n.kind !== 'ap' && (g === 'he' || g === 'eht') && n.linkId === '6g')`.
The one-line comment the finding asked for was already on the function's docstring
(caps.ts:90) from the previous commit, so it was left as is.

### 10. Band selector only for stations — DONE
**src/editor/FloorPlanEditor.tsx:578**: condition is now
`selNode.kind === 'sta' && selNode.caps.generation !== 'vht' && selNode.caps.features.mlo !== true`.

### 11. 3D wave band derived from the virtual id, 2.4 GHz tinted — DONE
**src/scene/effects.ts:143-155**: `const band = linkOfVirtual(f.from)`; wireframe for
`band !== '5g'`; colour is `warmShift(frameColor(...))` on 2.4 GHz. New helper
`warmShift` at **effects.ts:21-27** blends the frame colour 45 % with orange `#f97300`
(and zeroes most of the blue), which keeps the data/ack/rts colour coding readable while
making the band obvious. Compile-checked only (no unit test for Three.js materials).

### 12. Band matched by string instead of `linkOfVirtual` — DONE
- **src/course/lessonKit.ts:164**: `first6g = txOf((r) => linkOfVirtual(r.node) === '6g' && …)`.
- **src/course/lessons.ts:1118** (`J('first 5 GHz data', …)`):
  `linkOfVirtual(r.node) === '5g'`.
Records are unchanged, so the hash fixture is unaffected — confirmed green.

### 13. Deferred — NOT DONE (as instructed)

### 14. Glossary `aSignalExtension` — DONE
**src/ui/glossary.ts:200-201**. English now reads "…so that ERP receivers finish decoding
before the SIFS response and the Duration/NAV arithmetic still adds up"; the Chinese is the
equivalent ("使 ERP 接收机能在 SIFS 响应之前完成解码，Duration/NAV 的时间计算也才对得上").
Same code-point verification as finding 3: no quote characters changed anywhere in the file.

### 15. `tests/engine/link-2g.test.ts` DIFS assertion and test title — DONE
- **tests/engine/link-2g.test.ts:36-49**: the station now queues **two** back-to-back MSDUs,
  and the assertion is taken on the DIFS that starts at the end of the first exchange's ACK:
  `expect(ifs2.untilNs - ifs2.t).toBe(28_000)`. This was necessary — with the original single
  MSDU at t = 6 ms the medium had been idle for milliseconds and the MAC reports a
  zero-length DIFS, so `toBe(28_000)` failed with `0`; only a wait that begins off a busy
  medium is a real 28 µs DIFS.
- **tests/engine/link-2g.test.ts:64**: retitled to *"a lost ACK times out after 39 µs"*; the
  EIFS claim is gone (the next `it` covers EIFS).

### 16. Merge the two `caps` imports — DONE
**tests/model/caps.test.ts:2-5**: one import block.

### 17. Deferred — NOT DONE (as instructed)

### 18. `ERP_DIFS_NS` — DONE
**src/engine/phy.ts:119-126**: `const ERP_DIFS_NS: Ns = ERP_SIFS_NS + 2 * SLOT_NS // 28_000`,
used in both `difsNs` and `eifsNs`. `tests/engine/link-2g.test.ts:16-18` already pins the
resulting values exactly (DIFS 28 000, EIFS 88 000).

### 19. README known simplification — DONE
**README.md:57**: "2.4 GHz always uses the 9 µs short slot (no 802.11b stations are
modelled); the 6 µs signal extension is modelled as occupied medium, so a PPDU overlapping
only another PPDU's extension counts as interference."

---

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run` | **68 test files passed, 612 tests passed**, 0 failed. Duration 37.3 s. Includes `tests/engine/lesson-hashes.test.ts` ✓ and `tests/engine/simulation.test.ts` ✓ (*"snapshot + record replay reconstructs the live view exactly"*). |
| `npx tsc -b` | clean, no output. |
| `npm run build` | `✓ 99 modules transformed`, `✓ built in 2.42s`. Only the pre-existing >500 kB chunk-size advisory. |

Targeted runs during the wave: `tests/model/view.test.ts` 18/18,
`tests/model/caps.test.ts` 10/10, `tests/model/scenario.test.ts` 10/10,
`tests/engine/link-2g.test.ts` 10/10.

`git status` is clean; `base_version.ts` and `cp_check.txt` are gone and untracked-free.

---

## Not done / caveats

- **Findings 13 and 17** were explicitly out of scope and are untouched.
- **Finding 1's run length**: the view test runs 400 ms, not 200 ms — see finding 1 above.
  200 ms cannot satisfy the `txOk`/`appRtt` part of finding 2 because the only uplink a
  `video` station emits is the 250 ms cloud ping.
- **Finding 15's restructure**: the exact DIFS assertion required changing *how* the busy
  period is forced (two MSDUs, measured after the first ACK) — the finding's own suggestion
  of asserting exactly at t = 6 ms is not achievable, as the MAC correctly reports a
  zero-length DIFS on a long-idle medium.
- **Finding 9's comment**: already present on the `nodeLinks` docstring, so only the guard
  was added.
- **Finding 11** and the `viewport.tsx` part of finding 2 are covered by the type checker and
  the build only; there is no rendering test harness in this repo.
- `siblingIds` is O(lanes) per call where `siblingId` was O(1). With at most a handful of
  lanes per scenario this is not measurable, and the full suite's runtime is unchanged.
- An MLO AP whose only station sits on 2.4 GHz still gets its 6 GHz lane (`used` is seeded
  with `'6g'` for an MLO AP, per the finding's wording). That lane has no station on it, but
  it is the AP's own second MLO link rather than a phantom seeded 5 GHz one, and removing it
  would change existing MLO scenarios.
