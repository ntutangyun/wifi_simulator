# Task 1 report — MMS and narrowband models, configuration and schema

Commit `ccf72d0` — `feat(uwb): P802.15.4ab MMS and narrowband models, session config and schema`,
branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.

## What was built

### `src/uwb/mms.ts` (new)

The multi-millisecond fragment PHY. Every exported name of the brief's contract, unchanged:

- Units and structure: `MS_CHIPS` 499 200, `MS_RSTU` 1200, `MMRS_LEN` 128, `MMS_SPREAD` 4,
  the four value sets (`N_MSR_SET`, `RSF_COUNT_SET`, `RIF_COUNT_SET`, `STS_LEN_SET`) and their
  types, `mmrsSymbolChips` / `rsfChips` / `rifChips`, and `rsfNs` / `rifNs` which round through
  `chipsToNs` exactly as `uwbPpduNs` does, so every fragment length is a whole nanosecond.
- Energy: `UWB_MS_BUDGET_NJ = 37`, `mmsFragmentDbm`, `MMS_COMBINE_MAX_DB`, `combineGainDb`,
  `trainDetected`, `ratioSigma`.
- The train: `MmsPhy`, `MmsSetId` (the 17 ids written out as a literal union, not a template
  type), `MMS_SETS`, `mmsSet` (the spec's helper, returning a fresh copy), `mmsLongestFragmentNs`.
- The round: `MmsLayout`, `mmsLayout`, plus an exported `MMS_RP_MIN_SLOTS = 20`. Added helpers
  beyond the contract: `STS_UNIT_CHIPS`, `mmsSet`, `MMS_RP_MIN_SLOTS`. Nothing was renamed.

`fragmentSlot` returns the absolute slot within the round (control phase 0–3) per the
controller's resolution 2, and throws on an index the train does not have — Task 3 will lean on
that rather than on a silent wrong slot.

### `src/uwb/nb.ts` (new)

The narrowband control radio: PHY constants and `nbPpduNs`, the four message sizes and
`NB_MSG_ID`, the 250-channel plan (`nbCenterMhz`, `nbBand`), the defaults, the link budget
(`NB_TX_DBM`, `NB_RX_SENS_DBM`, `NB_SIR_MIN_DB`, `nbPl0Db`), listen-before-talk
(`NB_LBT_EDT_DBM_PER_MHZ`, `NB_LBT_CCA_US`, `NB_LBT_THRESHOLD_DBM`, `nbLbtRequired`) and the
deterministic per-block hop `nbChannelForBlock`, which uses `hashStr` from `src/engine/hash.ts`.
No `Math.random` anywhere in either module.

Per resolution 7, `uwbPl0Db` was refactored to a shared `freeSpacePl0Db(mhz)` in `phy.ts`
(identical expression, so its value is bit-for-bit what it was) and `nbPl0Db` calls it.

### `src/uwb/phy.ts`

- `freeSpacePl0Db` extracted; `uwbPl0Db` now delegates.
- `uwbSlotsPerTag(..., mode, mms?)` returns `mmsLayout(mms).slots` for `'mms'` and throws
  `uwbSlotsPerTag: mode 'mms' needs the session's MMS parameters` when `mms` is missing.
- `uwbSlotFitNs(anchors, mode, schedule, mms?)` returns `mmsLongestFragmentNs(mms) +
  UWB_SLOT_GUARD_NS` for `'mms'`, with the same throw.
- `uwbLongestFrameBytes(..., 'mms')` throws: an MMS round has no PSDU to be longest.
- New `uwbNbSlotFitNs()` = `nbPpduNs(NB_REPORT_BYTES) + UWB_SLOT_GUARD_NS` = 608 200 ns.

`phy.ts` and `mms.ts` import each other. Neither touches the other's bindings while the modules
evaluate — only inside functions — so the cycle resolves whichever loads first; this is stated
in a comment at the head of `mms.ts`. The build and the whole suite confirm it.

### `src/model/scenario.ts`

- `UwbMode` gains `'mms'`; new `NbLbt`, `NbReportMode`, `UwbMmsCfg extends MmsPhy`.
- `UwbSessionCfg.mms` (required), `DEFAULT_UWB_MMS` exported, and `DEFAULT_UWB_SESSION.mms` set
  to it with a fresh `nbChannels` array so no two sessions share one.
- `UwbMmsSchema` with `.default(() => …)` so a scenario saved without `mms` parses to the
  defaults, each parse getting its own array.
- New rules, all `path: ['uwb']` and all gated on `mode === 'mms'`, in the brief's wording:
  the empty-train rule, the gap rule, the allow-list rule, the 300 RSTU rule, the fragment-fit
  rule and the two-slot narrowband rule (both formatting µs to one decimal like the existing
  slot rule), and the block rule `the UWB block fits N tag–anchor pairs at S slots each (found
  T×A); …`.
- Reworded, as resolution 5 directs: `…one-way and MMS ranging need a time-scheduled session`
  and `…turn it off for TDoA and MMS modes`.
- Skipped for `'mms'`: the `UWB_MAX_ANCHORS` cap, the four-anchor one-way rule (now explicitly
  `dl-tdoa || ul-tdoa`), and the `uwbSlotFitNs` longest-frame rule.

### Call sites and knock-ons

- `src/uwb/session.ts`: `roundPlan` passes `cfg.mms`; `slotAction` throws for `'mms'` with a
  message naming `mmsLayout` (Task 3 fills it). No other behaviour touched.
- `src/uwb/network.ts`: one argument added to the `uwbSlotFitNs` call. Nothing else.
- `src/uwb/format.ts`: `roundName` had to learn `'mms'` — it indexes a
  `Record<UwbFixMethod, string>` with a `UwbMode`, which stops compiling the moment the mode
  union widens. It returns `'MMS'`.
- `src/ui/i18n.ts`: `uwbModes` is typed `Record<UwbMode, string>`, so EN and ZH labels for the
  new mode were forced by the type. Added: `narrowband-assisted MMS (802.15.4ab)` /
  `窄带辅助多毫秒（802.15.4ab）`. The mode `<select>` still lists three options — Task 4 adds the
  fourth with its hint.
- `src/uwb/ui/UwbSessionFields.tsx`: `uwbModePatch('mms')` already yields
  `{ mode, schedule: 'time', aoa: false }` through the existing non-`'twr'` branch; only the
  doc comment changed, to say that MMS takes the same two for its own reasons.

## Tests, with RED/GREEN evidence

### `tests/uwb/mms.test.ts` (18 tests) and `tests/uwb/nb.test.ts` (12 tests) — written first

RED, before either module existed:

```
$ npx vitest run tests/uwb/mms.test.ts tests/uwb/nb.test.ts
 ❯ tests/uwb/nb.test.ts (0 test)
 ❯ tests/uwb/mms.test.ts (0 test)
 FAIL  tests/uwb/mms.test.ts
Error: Failed to load url ../../src/uwb/mms … Does the file exist?
 FAIL  tests/uwb/nb.test.ts
Error: Failed to load url ../../src/uwb/nb … Does the file exist?
 Test Files  2 failed (2)
```

GREEN, after:

```
$ npx vitest run tests/uwb/mms.test.ts tests/uwb/nb.test.ts
 ✓ tests/uwb/nb.test.ts (12 tests) 9ms
 ✓ tests/uwb/mms.test.ts (18 tests) 13ms
 Test Files  2 passed (2)
      Tests  30 passed (30)
```

Everything the brief asks for is covered: the four published fragment lengths to 0.01 µs
(62.18 / 65.64 / 91.28 / 65.64); the ten RSF-only sets against the 0502r3 table; the three
`mmsFragmentDbm` values to 0.01 dB; `combineGainDb(16) === MMS_COMBINE_MAX_DB`;
`trainDetected(−100.2, 8)` true and `(−100.2, 4)` false; `ratioSigma(100, 7) ≈ 2.0203e-8` and
the 0.0202 / 0.0094 ppm the spec quotes; the layouts (8,0,1) → rp 20, 28 slots, reports 24 / 26,
(16,0,1) → rp 32 / 40 slots, (8,8,1) → rp 32 with RIF-0 at 20, (8,8,2) → rp 34 with RIF-0 at 22,
(0,1,1) → rp 20 with RIF-0 at 4; a sweep over all 59 legal (X, Y, Z) trains asserting every
fragment and both reports land inside the round. On the narrowband side: the channel centres at
both band edges, 576 / 608 µs, −71.02 dBm, the full `nbLbtRequired` table, and
`nbChannelForBlock` both deterministic (`=== list[hashStr('7:5') % 4]`) and always in the list.

Reach is computed in `mms.test.ts` from the exported constants only — `UWB_TX_POWER_DBM`,
`UWB_RX_SENS_DBM`, `uwbPl0Db(9)`, `UWB_PL_EXP`, `WALL_LOSS_DB.brick`,
`mmsFragmentDbm(rsfNs(40, 64))`, `combineGainDb` — and lands on 26.6 / 89.6 / 253.4 / 16.0 m
within 0.1 m, the numbers a lesson will quote.

**One tolerance is 0.06 µs, not the brief's 0.05.** Set rsf-7 (N_MSR 32, gap 57) computes to
62.051 µs against the table's printed 62.0 — 0.051 µs away. The other nine are all within
0.05 µs of their printed value, and rounding to three significant figures reproduces nine of ten
exactly, so the disagreement is the draft table's own last digit, not the model's. The loop
allows 0.06 µs, says so in a comment, and `rsfNs(32, 57) === 62_051` is pinned exactly on its
own line so the value cannot drift behind the loose bound.

### `tests/model/uwb-scenario.test.ts` (+11 tests, 34 total)

RED evidence was taken after the fact by temporarily neutering the implementation (the
`if (mode === 'mms')` rule block forced false, and the schema's `mms` key renamed so the default
never applies), running, and restoring from a backup copy:

```
$ npx vitest run tests/model/uwb-scenario.test.ts     # rules disabled
 × the P802.15.4ab MMS session in the schema > a session saved before P802.15.4ab existed reads back with the draft's defaults
 × … > the default MMS session is legal, and every other mode ignores its settings
 × … > a train needs at least one fragment
 × … > the MMRS gap is a whole number of zeros, 0 to 64
 × … > the narrowband allow list is 1…250 distinct channels of the 250 there are
 × … > an MMS ranging slot is a multiple of 300 RSTU, not of the core standard's 3
 × … > a slot has to hold the longest fragment, and two slots a narrowband message
 × … > the block has to hold one round per tag–anchor pair, not one per tag
 × … > skips the rules that are about frames the MMS round does not send
 × … > takes the two rules the one-way modes already carry
 Tests  10 failed | 24 passed (34)
```

```
$ npx vitest run tests/model/uwb-scenario.test.ts     # restored
 Test Files  1 passed (1)
      Tests  34 passed (34)
```

The eleventh test ("accepts exactly the enumerated values mms.ts publishes, and nothing else")
was added during self-review; see below.

The tests pin each rule's exact message, that a session object with no `mms` key parses to
exactly `DEFAULT_UWB_SESSION`, that two parses do not share the allow-list array, that a
non-MMS session carrying nonsense MMS settings is not judged on them, and that the three skipped
rules are in fact skipped (ten anchors parse in MMS and are refused in TWR; one anchor parses in
MMS and is refused in DL-TDoA; a 300 RSTU six-anchor MMS session's error text contains the
narrowband rule and *not* the longest-frame rule).

### `tests/editor/uwb-planOps.test.ts` (+1 test, 29 total)

New: `uwbModePatch('mms')` equals `{ mode: 'mms', schedule: 'time', aoa: false }`, and a
contending, bearing-on session becomes legal once the patch is applied. The existing
angle-of-arrival test now loops over `['dl-tdoa', 'ul-tdoa', 'mms']` and pins the reworded
message. First run of the new test failed on a detail of my own scenario (four anchors × one tag
is four pairs and the default block holds three — the pairwise block rule working as designed);
it uses three anchors.

### Gates

```
$ npx tsc -b            # no output
$ npx vite build        # ✓ built in 2.76s
$ npx vitest run
 Test Files  111 passed (111)
      Tests  1488 passed (1488)
```

`git status --porcelain` after the commit is empty, and `tests/fixtures/lesson-hashes.json` was
never modified — it is not in the commit's 13 files, and `tests/engine/lesson-hashes.test.ts`
passes against the committed fixture.

## Files changed

Created: `src/uwb/mms.ts`, `src/uwb/nb.ts`, `tests/uwb/mms.test.ts`, `tests/uwb/nb.test.ts`.
Modified: `src/model/scenario.ts`, `src/uwb/phy.ts`, `src/uwb/session.ts`, `src/uwb/network.ts`,
`src/uwb/format.ts`, `src/uwb/ui/UwbSessionFields.tsx`, `src/ui/i18n.ts`,
`tests/model/uwb-scenario.test.ts`, `tests/editor/uwb-planOps.test.ts`.

## Self-review findings (and what I did about them)

1. **`as unknown as` in the schema.** My first draft built the four literal unions with a
   `literalUnion(values)` helper that cast an array of `z.literal`s to zod's tuple type. That is
   exactly what the conventions forbid. Fixed: each union is written out as literals, the
   `*_SET` imports in `scenario.ts` are gone, and a new test walks every value of `N_MSR_SET`,
   `RSF_COUNT_SET`, `RIF_COUNT_SET`, `STS_LEN_SET` and `[1, 2]` through the schema (plus one
   rejected value each), so the written-out unions and the exported sets cannot drift apart
   unnoticed. A comment on `UwbMmsSchema` says why it is written that way.
2. **Where the `gap` and `nbChannels` checks live.** They are `z.number()` / `z.array(z.number())`
   at the field level on purpose: a zod field issue stops the object's `superRefine` from running
   at all, and the brief requires these two rules to speak at `path: ['uwb']` in their own
   wording. The comment on `UwbMmsSchema` records the reasoning so it does not read as an
   oversight.
3. **`uwbSlotFitNs(0, 'mms', …)` in the schema.** The anchor count is meaningless in MMS, so the
   rule passes 0 rather than computing an anchor count it does not need. Commented.
4. **Empty train and `mmsLongestFragmentNs`.** It returns 0 rather than throwing, so the
   fragment-fit rule is harmless when the train is empty and the empty-train rule gets to be the
   only issue the user reads. Documented on the function.
5. **`freeSpacePl0Db` refactor.** Same expression, same arguments, so `uwbPl0Db(5)` and
   `uwbPl0Db(9)` are bit-identical; the coexistence tests and the lesson hashes confirm it.

## Concerns / hand-offs for later tasks

1. **`UwbNetwork` still enforces `UWB_MAX_ANCHORS` in MMS.** The schema now allows more than
   nine anchors in MMS (the spec is explicit that the cap does not apply, and the block rule
   bounds it instead), but `src/uwb/network.ts` keeps its own `anchors.length > UWB_MAX_ANCHORS`
   throw for every mode. A ten-anchor MMS scenario therefore parses and would then crash the
   network. I left it alone deliberately — the task instructions reserve `network.ts` behaviour
   for Task 3 — and an MMS network cannot run at all yet (`slotAction` throws). **Task 3 must
   skip that cap for `'mms'`, and must replace the network's `tags.length > roundsPerBlock`
   guard with the pairwise `tags × anchors` count, to match the schema.**
2. **`roundPlan` for `'mms'` is a placeholder.** It produces `slots = mmsLayout(cfg.mms).slots`
   and `roundsPerBlock = floor(blockNs / roundNs)`; it does not yet map a round index to a
   (tag, anchor) pair. `slotAction` throws for `'mms'` by design.
3. **The editor's mode `<select>` has no `'mms'` option yet** (Task 4), so a scenario whose
   session is already `'mms'` would render that select with no matching option. The i18n labels
   are in place for when the option is added, and `uwbModeHint` still says "Both need four
   anchors", which will want rewording when MMS joins the list.
4. **The `62.0` table entry** discussed above is the one place the model and the draft's printed
   number disagree beyond the brief's stated tolerance (by 0.001 µs of slack). Worth a sentence
   in the lesson's honesty note if it quotes the set table.
5. **`phy.ts` ↔ `mms.ts` is a genuine import cycle.** Safe as written and exercised by the whole
   suite and the production build, but it is a constraint on both files: neither may ever call
   into the other at module-evaluation time. The head comment of `mms.ts` says so.
