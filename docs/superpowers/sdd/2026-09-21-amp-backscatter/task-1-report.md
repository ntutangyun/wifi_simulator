# Task 1 report — Backscatter model, frames, configuration and schema (AMP slice 2)

**Commit:** `e08ed28` — `feat(amp): backscatter model — free-space law, reader floor, Gen2 frames and excitation timings; tag mode and RFID config`
**Branch:** `feat/uwb-ranging` (worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`)
**Status:** DONE_WITH_CONCERNS (two concerns, both hand-offs to Task 2/3; nothing left broken)

---

## What I built

### `src/engine/ampBs.ts` (new, 245 lines)

The whole model half of slice A2, every constant carrying its tag at its definition:

- **Reader and tag:** `AMP_BS_LOSS_DB` 6, `AMP_BS_ISOLATION_DB` 20, `AMP_BS_READER_DR_DB` 50,
  `AMP_BS_ACTIVATION_DBM` −20, `AMP_BS_TAG_PPM` 100 000, `AMP_BS_REQ_SNR_DB` { 250: 3, 1000: 9 },
  `FREQ_24G_MHZ` 2440, `AmpBsUlKbps`.
- **Timing:** `AMP_BS_T1_NS`, `AMP_BS_T2_NS`, `AMP_BS_WRITE_T3_NS`, `AMP_BS_WUP_MIN_NS`,
  `AMP_BS_BST_MIN_NS`, `AMP_BS_DL_SYNC_NS`, `AMP_BS_DL_KBPS`, `AMP_BS_UL_SYNC_CHIPS`,
  `AMP_BS_UL_CHIP_NS`. Two private margins (`BST_T1_MARGIN` 1.2, `BST_REPLY_MARGIN` 1.1) and
  `BST_DELAYED_SLACK_NS` 1 µs are named constants rather than magic numbers inside `bstNs`.
  *(They were tagged `PM-87` / `PM-88` individually here; fix round 1 (d) replaced that with the
  collective `PM-74, PM-75, PM-86…PM-88` the spec actually supports.)*
- **Propagation:** `freeSpacePl0Db` **re-exported** from `src/uwb/units.ts` (imported, not copied —
  it is a leaf, no cycle); `bsPathLossDb`, `monoLeakDbm`, `readerFloorDbm`, `bsReplyDbm`,
  `bsDecodes`, `monoReachM`, `activationReachM`.
- **Gen2 frames:** `Gen2Cmd`/`GEN2_CMD_BYTES`, `Gen2Reply`/`GEN2_REPLY_BYTES`,
  `AMP_RFID_HDR_BYTES`/`AMP_RFID_FCS_BYTES`, `ampRfidBytes`, `bsReplyNs`, `bstNs`,
  `ampBsDlPpduNs`, `ampRfidFrame`, `ampBsReplyFrame`.
- **Identity:** `epcOf` (three `hashStr` calls → 24 lowercase hex), `crc16Epc`
  (CRC-16-CCITT 0x1021 / init 0xFFFF over the 12 EPC octets, 0 and 0xffff folded to 0x5a5a).
- **Helpers added beyond the brief** (allowed): `GEN2_CMD_NAME`, `GEN2_REPLY_NAME` — the Gen2
  proper names, so the lane tooltips and the frame decoder do not embed English in logic; and the
  exported arg interfaces `AmpRfidArgs` / `AmpBsReplyArgs`.

`monoReachM` is written as `bsReplyDbm(bsDbm, PL) − readerFloorDbm(monoLeakDbm(bsDbm)) = reqSnr`
solved for PL rather than pre-cancelled to the constant 64 dB, so the "the excitation cancels"
claim is something the code does, not something a comment asserts. (It also avoids an unused
parameter under `noUnusedParameters`.)

### `src/model/frames.ts`
`FrameKind` gains `'ampRfid' | 'ampBsReply'` alongside `ampTrigger`. `AmpInfo` gains `rfid?` and
`bs?` with exactly the brief's shapes; `bs.incidentDbm?: number` is present but never set by the
builder — Task 2/3 fill it.

### `src/model/scenario.ts`
`AmpTagMode`, `AmpTagCfg.mode?` / `.epc?`, `AmpApCfg.backscatter?: AmpBackscatterCfg`,
`AmpBackscatterCfg`, `DEFAULT_AMP_BS = { q: 2, ulKbps: 250, wupMs: 1, chargeDbm: 10, bsDbm: 0,
txopMs: 4, read: true, write: false }`. Schema: `q` int 0…8, `ulKbps` ∈ {250, 1000}, `wupMs` ≥ 1,
`chargeDbm`/`bsDbm` −10…30, `txopMs` 1…10, `epc` `/^[0-9a-fA-F]{24}$/` with the message
"an EPC is 24 hex characters (96 bits)", `mode` a zod `.default('active')`. The cross-node rule
lives in the scenario `superRefine` beside the other cross-node rules, `path: ['nodes', i]` (the
tag's own index, matching what the node-level AMP rules produce), message exactly
**"a backscatter tag needs an AP with the RFID inventory on"**.

### Forced by the two new frame kinds
- `src/ui/i18n.ts`: `kindName` / `whatIs` / `next` in EN **and** ZH, plus two new lane tooltips
  (`tooltips.ampRfid`, `tooltips.ampBsReply`) in both languages.
- `src/scene/effects.ts`: `frameColor` cases — `ampRfid` joins the AMP teal, `ampBsReply` the
  violet, per the spec's "DL RFID PPDUs are AMP DL frames (teal) … replies violet as today".
  Placeholder; Task 3 owns the palette.
- `src/ui/laneLayout.ts`: the `spanTooltip` chain wires both kinds (there is no `KIND_SHORT` in
  this file — the brief's name for it; the labels are the `T.*` chain).
- `src/model/frameFields.ts` (not in the brief's file list, forced by `tsc`): `SUBTYPE` is
  `Record<Exclude<FrameKind, 'data' | UwbFrameKind>, string>` and the decode switch assigns
  `fields` exhaustively, so both were missing entries. Added the two subtype names and two decode
  cases with Gen2's real field breakdown (`checkSize` passes against `frame.bytes`).
- `src/editor/planOps.ts`: `newTag` now writes `ampTag: { mode: 'active' }`. See RED below.

---

## Tests — RED / GREEN evidence

### `tests/engine/amp-bs-model.test.ts` (new, 15 tests)

Covers everything the brief lists: `freeSpacePl0Db(2440)` ≈ 40.196 (plus 915.5 / 867.5 MHz from
the same law), `bsPathLossDb` at 1 m / 0.1 m / with walls / under the 5 cm clamp, the floor
(−70 dBm at 0 dBm BS, −60 at 10), **11-25/0307r0's table** (−46.4 / −58.4 / −70.5 dBm and SNR
23.6 / 11.6 / −0.5 dB at 0.1 / 0.2 / 0.4 m), `bsDecodes` either side of both thresholds, the
reaches (0.328 / 0.232 m at **five** different `bsDbm`, and a bracketing check that `bsDecodes`
agrees either side of the returned reach), activation 0.309 / 0.978 m and the wall equivalence,
`ampRfidBytes` for all six commands, `bsReplyNs` for all four replies at both rates, `bstNs`
immediate / null / delayed, **all ten pinned DL PPDU durations**, both frame builders, and
`epcOf` / `crc16Epc` determinism and the reserved-word folding.

Reach assertions use an explicit `±0.001 m` helper (`expectReachM`) rather than `toBeCloseTo(_, 3)`:
the closed form gives 0.32754 m against the quoted 0.328, which is inside ±0.001 but only just
inside `toBeCloseTo`'s ±0.0005. Same for 0.231862 / 0.309166 / 0.977734.

**First execution: 15/15 passed.** I wrote the test file before the implementation file, but I did
not capture a literal RED run of it — the first time it was executed, `ampBs.ts` already existed.
To prove the tests actually bite rather than tautologise, I ran a **mutation check**: with
`AMP_BS_LOSS_DB` 6 → 5 and `AMP_BS_UL_SYNC_CHIPS` 24 → 48, **6 of the 15 tests failed** (the 0307
table, the reaches, the reply airtimes, the BST sizing, the DL PPDU table, the frame builders);
both constants were restored and the file is green again. This is a weaker guarantee than a
recorded RED-first run, and I am flagging it rather than glossing it.

### `tests/model/scenario.test.ts` (+4 tests)

Old-scenario parse (no `mode`, no `backscatter`, round-tripped through `JSON.stringify` first) →
`mode` reads back `'active'` and `backscatter` stays `undefined`; the cross-node rule accepted and
refused with its exact message; every reader bound rejected at both ends plus an all-edges
acceptance; the EPC regex over five cases.

**Genuine RED, twice:**

1. First run of the new schema tests: 1 failed —
   `accepts a backscatter tag when the AP runs the RFID inventory, and refuses it otherwise`,
   `expected [Function] to throw an error`. Root cause was **my test helper**, not the schema:
   `function reader(mode, bs: AmpBackscatterCfg | undefined = {...DEFAULT_AMP_BS})` — passing
   `undefined` explicitly takes the JS default parameter, so the "reader off" case was silently
   testing a reader that was on. I verified the schema rule itself fired correctly with a throwaway
   probe before touching anything. Fixed by making the off-case `null`.
2. Full suite: 1 failed — `tests/editor/planOps.test.ts > an AMP lab round-trips through JSON
   unchanged`. This is the real find. `newTag` emitted `ampTag: {}`, and with `mode` as a zod
   `.default`, `scenarioFromJson(scenarioToJson(sc))` now returns `ampTag: { mode: 'active' }`,
   which is not `toEqual` the pre-parse object. The brief mandates the `.default`, so I fixed the
   producer instead: a freshly created tag states `mode: 'active'` explicitly. Old **saved** plans
   still parse without `mode` (that is what the default is for) — only the editor's own fresh node
   is now explicit.

### Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx vite build` | `✓ built in 3.18s` |
| `npx vitest run` | **117 files, 1763 tests, 0 failed** |
| `tests/fixtures/lesson-hashes.json` | untouched (`git status` never listed it) |
| `tests/fixtures/uwb-record-hashes.json` | untouched |

No `any`, no `@ts-ignore`, no `as unknown as` in anything I wrote. (The one cast in my tests is
`{ ulKbps: 4000 as 250 }`, deliberately feeding the schema an out-of-union value.)

---

## Files changed

| File | |
|---|---|
| `src/engine/ampBs.ts` | new |
| `tests/engine/amp-bs-model.test.ts` | new |
| `src/model/frames.ts` | `FrameKind` + `AmpInfo.rfid`/`.bs` |
| `src/model/scenario.ts` | config types, defaults, schema, cross-node rule |
| `src/model/frameFields.ts` | `SUBTYPE` + two decode cases (forced by `tsc`) |
| `src/ui/i18n.ts` | `kindName`/`whatIs`/`next` + 2 tooltips, EN + ZH |
| `src/scene/effects.ts` | `frameColor` cases |
| `src/ui/laneLayout.ts` | tooltip wiring |
| `src/editor/planOps.ts` | `newTag` states `mode: 'active'` |
| `tests/model/scenario.test.ts` | 4 schema tests |

---

## Self-review findings (found and acted on while reviewing my own diff)

1. **`ampPpduLayout` is wrong for `ampRfid`.** `src/model/frameFields.ts` routes every frame with
   `f.amp` through the Active Tx layout: 80 µs AMP-Sync, an AMP-SIG field, a 20 µs padding field.
   A backscatter DL PPDU has a 16 µs sync, no AMP-SIG and no padding, and carries two excitations
   that have no `PpduSegmentKey` yet — so the segments currently degenerate into one very long
   `signalExt`. They still sum to `txTimeNs`, so nothing crashes and no test breaks. I did **not**
   fix it: adding `ampWup`/`ampBst` segment keys forces `SEG_COLOR` (Task 3's palette) and the
   `Record<PpduSegmentKey, string>` label tables, and Task 3's brief explicitly owns "the PPDU
   layout including both excitation fields". I documented the gap in the function's doc comment so
   nobody reads the current output as intended. **This is a hand-off, listed as a concern below.**
   The **uplink** branch, by contrast, is already correct by arithmetic coincidence:
   48 chips × `AMP_UL_CHIP_NS` equals 24 chips × `AMP_BS_UL_CHIP_NS` at both 250 kb/s (48 µs) and
   1 Mb/s (12 µs). I verified this rather than assuming it; it is noted in the doc comment because
   it is load-bearing and fragile.
2. **`epc` case.** The regex accepts upper- and lower-case hex; `epcOf` emits lower-case. Nothing
   downstream compares EPC strings yet, but whoever does (Task 2's inventory bookkeeping) should
   normalise rather than compare raw.
3. **`bstNs`'s delayed branch is not floored at `AMP_BS_BST_MIN_NS`.** Deliberate — the brief's
   formula has no `max` there, and 1.1·T3 is 2.2 ms, so the floor could never bind anyway. Called
   out so it does not read as an oversight.
4. **`DEFAULT_AMP_AP` deliberately has no `backscatter` key.** Adding one would have changed every
   existing AMP scenario's shape; `backscatter` is opt-in, `DEFAULT_AMP_BS` is a separate constant
   for the editor to spread in.
5. **Commit-message accident, caught and amended.** My first `git commit` used PowerShell
   here-string syntax (`-m @'…'@`) through the Bash tool, which passed the `@` delimiters through
   literally and produced a subject line of `@` with the real subject on line 2. Amended via
   `git commit -F <file>`; `git log -1 --format=%B | cat -A` confirms the message is now exactly the
   mandated subject plus the two trailer lines. The pre-amend SHA `a6cb2d4` is dead; the commit is
   `e08ed28`.

---

## Concerns / hand-offs

1. **Task 3 must give `ampRfid` its own PPDU layout** (`ampPpduLayout` in `src/model/frameFields.ts`),
   with segment keys for the WUP- and BST-Excitation, a 16 µs `ampSync`, no `ampSig` and no
   `padding`. Until then the frame-detail PPDU strip for a backscatter DL frame is misleading. The
   MPDU field decode I added *is* correct and byte-exact; only the PPDU strip is pending.
2. **`amp.bs.incidentDbm` is typed but never populated.** Task 2/3 own filling it, as the brief says.
   `ampBsReplyFrame` leaves it `undefined`, and the test asserts that, so if Task 2 starts setting it
   at build time instead of at medium time, that assertion will flag it.
3. **TDD evidence is partial for the model test file** (see above): tests written first, but the
   first executed run was already green; mutation-tested instead. The schema tests did produce two
   genuine REDs, one of which caught a real regression in `planOps.newTag`.
4. **`monoReachM`'s `bsDbm` parameter is genuinely unused in effect** (it cancels). It is kept in the
   signature per the brief and is referenced in the arithmetic, so `noUnusedParameters` is satisfied
   honestly rather than with a `void` statement.

---

# Fix round 1

**Review:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-review-report.md` (2 Important, 8 Minor,
0 Critical). **Commit:** `4299134` (a new commit; `e08ed28` was not amended).

The reviewer was right about the thing that mattered, and my Task 1 report was wrong about it. I had
written that the `ampRfid` PPDU segments "still sum to `txTimeNs`". They did not: the Active Tx
downlink branch computes `ext = txTimeNs − (32 000 + 80 000 + 64 000 + data + 20 000)` and the
`if (ext > 0)` guard silently **drops** a negative remainder, so a QueryRep at 1 Mb/s rendered
452 µs of segments over a 360 µs frame — a 26 % overrun, not "one long signal extension". I
reproduced the −92 000 ns myself before fixing it. My comment certified a property that did not
hold, which is worse than leaving the gap undocumented.

## Important 1 — i18n parity now covers every kind, structurally

`tests/ui/i18n.test.ts`'s `KINDS` was a hand-written array of ten and had gone **six** kinds stale
even before this slice. Rather than add two more entries to a list that had already proved it
drifts, I made the list the single source of truth:

```ts
// src/model/frames.ts
export const FRAME_KINDS = ['data', …, 'ampRfid', 'ampBsReply', …, 'nbReport'] as const
export type FrameKind = typeof FRAME_KINDS[number]
```

The type is now *derived from* the array, so a kind cannot exist without being walked by the parity
test. `tests/ui/i18n.test.ts` imports `FRAME_KINDS` and adds a guard test (≥ 23 kinds, both new ones
present, no duplicates) so the array cannot be quietly truncated either. All 23 kinds × 3 records ×
2 languages are non-empty — the six UWB/4ab kinds included, which were never checked before.

## Important 2 — the RFID PPDU strip is built from the real timing helpers

Ruling was not to defer to Task 3, so `ampPpduLayout` now has a third branch, reading
`src/engine/ampBs.ts`'s own constants:

`legacyPreamble 16 µs · signal 4 µs · usig 12 µs · ampWup wupNs (omitted when 0) · ampSync
AMP_BS_DL_SYNC_NS · ampData ampBitsNs(bytes·8, AMP_BS_DL_KBPS) · ampBst bstNs · signalExt remainder`

No AMP-SIG (SFD PM-65 note) and no padding field. Two new `PpduSegmentKey`s, `ampWup` and `ampBst`,
with EN + ZH labels in `frameDetail.segment` and a placeholder amber pair in `SEG_COLOR` (Task 3 may
restyle). The **uplink** branch also stopped leaning on the coincidence I had documented: it now
reads `AMP_BS_UL_SYNC_CHIPS`/`AMP_BS_UL_CHIP_NS` when `amp.bs` is set, instead of relying on
48 × 1000 happening to equal 24 × 2000. The doc comment describes all three shapes and no longer
claims anything it does not do.

**New test** `tests/model/frameFields.test.ts` → *"backscatter frames decode to their EPC Gen2
fields and excitation layout"*, 5 cases: 5 commands × 2 UL rates × WUP {1 ms, 2 ms} = 20
combinations asserting the sum invariant, the exact segment key order, and the WUP / BST / sync /
extension lengths; the same 10 combinations with WUP 0 asserting the field is absent and the sum
still holds; the QueryRep-at-1-Mb/s case pinned at 360 000 ns explicitly, because that is the one
the old arithmetic overran; the Write BST at 2 429 800 ns; command and reply sizing; and both reply
rates' sync (48 µs and 12 µs).

## Minors

| # | Fix |
|---|---|
| (a) | `crc16Epc` fold is now **exercised**, not just asserted. The old test was vacuous — deleting the fold left it green. Constructed two inputs rather than hunting: CRC-16-CCITT has the property that appending a message's own CRC zeroes the CRC of the extension, so `0123456789abcdef0123` (raw CRC 0x6bbf) + `6bbf` gives raw 0x0000, and the same prefix + `ef70` gives raw 0xffff. Both fold to 0x5a5a; twelve zero octets (raw 0x84f9) pass through. The derivation is in the test's doc comment. |
| (b) | `AmpInfo.rfid` and `AmpRfidArgs` gain `epc?: string`; `frameFields` decodes `crc16Epc(r.epc ?? epcOf(f.dst))`, so a tag with a configured EPC no longer shows an id its own reply contradicts. Test asserts the configured and derived ids differ and that a broadcast command still shows no id. **Note:** this widens the brief's pinned `rfid` shape by one optional field — Task 2/3 should pass it when the tag's config is known. |
| (c) | The "±20 % clock (100 000 ppm, PM-28)" comment stated a false conversion — 100 000 ppm is **±10 %**. Rewritten to say the model applies the framework's own 1.2 / 1.1 response-window margins and does **not** re-derive them from the ppm figure, with the ±10 % stated correctly. |
| (d) | `BST_T1_MARGIN // SFD PM-87` and `BST_REPLY_MARGIN // SFD PM-88` claimed a per-motion attribution the spec does not make. Both now carry the collective `SFD PM-74, PM-75, PM-86…PM-88 (collective)`, matching how the spec and the brief cite the formula; `bstNs`'s doc gained the missing PM-75. |
| (e) | `src/course/lessonKit.ts:150` — the second `ampTag` producer now writes `mode: 'active'` like `editor/planOps.newTag`, so the JSON round-trip invariant holds for lesson-built AMP scenarios too. `tests/engine/lesson-hashes.test.ts` green, fixture untouched: the field is inert in the engine. |
| (f) | Report Minor 7 was right — 0.32754 **is** inside `toBeCloseTo(_, 3)`'s ±0.0005 (|diff| = 0.00046), so my "only just inside" rationale was wrong. The helper stays because ±1 mm is the centimetre the lesson quotes, which is what its own docstring says; the false justification above is struck by this line. |

Reviewer **Minor 2** (the Gen2 field decode being unrequested and untested) is now covered by the
new decode tests, which pin the `checkSize` invariant for all six commands and all four replies.

## Gates

| Gate | Result |
|---|---|
| `npx vitest run` (full) | **120 files, 1802 tests, 0 failed** |
| `npx tsc -b --noEmit` | exit 0, no output |
| `npm run build` | `✓ built in 2.96s` |
| `tests/fixtures/lesson-hashes.json` | unchanged (absent from `git status`) |
| `tests/fixtures/uwb-record-hashes.json` | unchanged |

Staged by explicit pathspec only. `src/engine/channel.ts` and `tests/engine/amp-bs-channel.test.ts`
were dirty in the worktree throughout (the concurrent Task 2 implementer) and are **not** in this
commit; nothing was reset or stashed. Mid-run those two briefly made `tsc -b` report 12 errors, all
inside `channel.ts`; they were gone by the time I ran the final gates.

## Not done

- **Reviewer Minor 8** (`src/ui/laneLayout.ts:325-326`: `?? 'query'` / `?? 'rn16'` fallbacks can
  mask a builder bug) is not in the six the coordinator enumerated, and the reviewer rated it low
  priority as "consistent with the surrounding chain's style" — every neighbouring arm does the same
  (`f.amp?.slot ?? 0`). Removing only these two would make the file inconsistent for no behavioural
  gain, since both fields are non-optional in the types. Left deliberately; flagging it here.
