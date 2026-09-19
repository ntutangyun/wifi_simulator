# Task 3 review — UL-TDoA, the overlay's TDoA fixes, the editor's one-way fields

Reviewed: `d398c67..1277472` (two commits, `cb74c66` + `1277472`), against
`task-3-brief.md`, the Follow-up section of `task-3-report.md`, the controller's rulings, and
Slice 5 UL-TDoA of `docs/superpowers/specs/2026-09-19-uwb-slices-design.md`.
The working tree matches HEAD for every reviewed file (`git diff HEAD -- src/uwb src/ui/i18n.ts
tests/uwb tests/ui tests/editor` is empty); the only untracked files are the concurrent lesson
agent's (`src/course/uwb/uwb-dl-tdoa.ts`, `tests/tmp-dl-probe.test.ts`), which were not reviewed
and do not enter the test command below.

## Verdict

Spec: APPROVED
Quality: APPROVED

## Commands

- `npx vitest run tests/uwb tests/ui tests/editor tests/engine/lesson-hashes.test.ts`
  → **24 files, 325 tests, all passing** (exit 0). `tests/engine/lesson-hashes.test.ts` green,
  i.e. `tests/fixtures/lesson-hashes.json` is untouched and no course run moved.
- `npx tsc -b` → clean, exit 0, no output. No errors anywhere, course files included.
- Extra, to check the claims about the schema: `npx vitest run tests/model/uwb-scenario.test.ts
  tests/uwb/session.test.ts` → 35 tests, all passing.

## Binding constraints — checked one by one

1. **Tag k blinks in slot 0 of round k and does nothing else.** `session.ts:88` gives a UL round
   exactly one slot and throws on any other; `device.ts onUlSlot` has two branches — the round's
   own tag transmits, everyone else listens — and a tag never reaches `listenFor` in this mode at
   all. The crowd is `[tagId, ...anchors]`, so no other tag is even called. `transmitFor`'s new
   `uwbBlink` case keeps no round state (Task 2's TODO is gone). Pinned: ten TX_STARTs per block,
   in tag order, all slot 0, 14 octets / 181 218 ns, `dst '*'`, `ies ['BLINK']`,
   `MAC_STATE tag-1 = ['tx','idle','tx','idle']`, no `UWB_RANGE`, no `UWB_TIMEOUT`.
2. **Common timebase = true arrival + own timestamp noise + a per-anchor sync offset.**
   `device.ts onRxOk`: `r.ulArrivalNs = trueRmarkerNs + extraNs + this.cfg.syncOffsetNs`, where
   `extraNs = info.nlosNs + gaussian(rng)·σ_ts` — the same value every other mode stamps, so the
   accepted `nlosNs` deviation is real and harmless (zero in every test here). The anchor still
   stamps and logs its own counter (`UWB_TS`) above; the fix does not use it. Correct: the
   counter carries the anchor's crystal, which is what the calibration removes.
3. **Draw order, and only in UL mode.** `network.ts:105` draws `gaussian(rng)·syncErrorNs`
   immediately after `UwbClock.fromRng`, from that node's own stream, guarded by
   `plan.mode === 'ul-tdoa' && n.uwb?.role === 'anchor'`. Nothing else in the constructor draws
   between them, so no other mode's stream moves — pinned by the existing "changes not one record
   of a two-way session" test, which now also passes `syncErrorNs: 4`. Inside `onRxOk` both draws
   (timestamp noise, then the carrier offset) still happen in UL mode before the early return, so
   the per-frame stream is the same shape in all three modes; `coffs` is computed and discarded
   deliberately. Note the draw fires even when `syncErrorNs === 0`, which is what makes the 0 ns
   and 1 ns runs differ **only** in the sync error — a good choice, and the reason the two rows of
   the report's table are comparable.
4. **Anchor 0's own offset is included, and documented.** Every anchor draws, including the
   reference (`network.ts:105` has no index exception); the comment there says "each is left with
   a fixed residual error of it", and `UwbDeviceCfg.syncOffsetNs`'s doc calls it "this anchor's
   own residual calibration error". The arithmetic is right to first order: with both anchors
   carrying an independent offset, a difference carries `√(σ_ts²+σ_ts²+sync²+sync²)`, which is
   exactly the `√2·c·√(σ_ts²+syncErrorNs²)` the ellipse is drawn from.
5. **Anchor 0 emits `UWB_TDOA { …, of: tag }` and `UWB_POSITION { method: 'ul-tdoa', of: tag }`.**
   `solveUlFix` (device.ts:505-548): `node` and `ref` are both anchor 0, `peer` each other anchor
   heard, `trueDtNs = (d(tag,peer) − d(tag,ref))/c`, `of: tagId` on both records; the fix's
   `trueX/trueY` come from the tag's scenario position and `zTag` from its configured height.
   `dtNs` is a plain subtraction — no rate correction, correctly, since no interval is measured on
   any crystal. A deaf reference anchor produces nothing rather than re-referencing (pinned).
   Ordering is safe: `network.ts` reads `ulArrivalNs()` from every anchor and calls `solveUlFix`
   **before** any `endRound`, and the round-boundary invariant (endRound of round k is queued
   before round k+1's slot 0) still holds because `runRound` queues them in that order.
6. **The view routes `of` records to the tag's lane.** One helper, `subject(vs, r) =
   vs.nodes[r.of ?? r.node]?.uwb`, used by both `UWB_TDOA` and `UWB_POSITION`, so the per-peer
   `n` counter and `position.n` land on the tag too. Pinned twice — in `view.test.ts` on the
   reducer and end-to-end in `network.test.ts` (`tag.position.n === 2`, `tdoa` keys
   `anc-2/3/4`, `ranges === {}`, and `anc-1`'s `position === null` / `tdoa === {}`). Anchor 0's
   lane keeps nothing misleading: the inspector's position block is `role === 'tag'`-gated, and
   `UWB_ROUND`/`UWB_SLOT` are tag-only emissions, so the anchor shows only its own `UWB_TS`-level
   activity. The event log is the remaining place anchor 0 speaks, and `format.ts`'s `ofWhom`
   names the subject there.
7. **Overlay: fix + ellipse, no rings, TWR unchanged.** `scene.ts:132` gates the ring loop on
   `u.position === null || u.position.method === 'twr'`, so both TDoA methods (and a future
   `aoa`) suppress rings while a TWR lane — including one that has not fixed yet — keeps every
   ring it had. The twelve existing TWR overlay tests pass unchanged. See finding 2 on the new
   test's power.
8. **Editor fields, EN/ZH.** Mode select (three options), the DL-only clock-correction checkbox,
   the UL-only sync-error number bounded 0–10 to match `ScenarioSchema`
   (`z.number().min(0).max(10)`), each disabled outside its mode with a tooltip that names the
   owner. The schedule select is now disabled under a one-way mode as well as DS-TWR, with a
   distinct `uwbTwrOnly` tooltip, and `uwbModePatch` carries the session back to `schedule:
   'time'` — the same move the method select makes. All eight new keys exist in both tables and
   are structurally enforced by the `Strings` interface (tsc). `uwbSessionIssue` is untouched and
   still the source of the ≥ 4 anchors rule, which no field patches away (pinned).
9. **Ellipse sigmas match the ruling.** UL: `ulDiffSigmaM = √2·c·hypot(σ_ts, syncErrorNs)` —
   exactly `√2·c·√(σ_ts² + syncErrorNs²)`. DL: `dlDiffSigmaM(replyNs) =
   hypot(√2·c·σ_ts, c·replyNs·σ_cfo·1e-6)`, accumulated as `√(Σσ_i²/n)` over the responders
   actually heard — exactly the ruled RMS. Both are labelled first-order in their own doc
   comments, and `ellipseHintTdoa` (EN + ZH) now says the bias-not-noise part in the reader's
   language. The old figure was `√2·rangeSigmaM = c·σ_ts`, a √2 under the truth; that is gone.
   Pinned relations: DL `a = 0.20 m`, UL `a = 0.036 / 0.35 m`, each `> maxErr/3` and `< maxErr`,
   and the UL ellipse tracks `syncErrorNs` while the DL one tracks the reply times.
10. **Schema rules actually enforced** (Task 2's code, re-verified because the brief asks):
    `mode !== 'dl-tdoa' && tags > fits` covers UL with `uwbSlotsPerTag = 1`, and
    `tests/model/uwb-scenario.test.ts` pins 100 tags accepted / 101 rejected at the defaults;
    `uwbSlotFitNs(anchors, 'ul-tdoa')` uses `UWB_BLINK_BYTES`, pinned both against DL/TWR and in
    a 363 RSTU slot that only the blink fits. `UwbNetwork`'s constructor repeats both guards in ns.
11. **Determinism.** `run(ul()) === run(ul())` pinned; every collection iterates `anchors` in
    scenario order; no `Map` iteration order is load-bearing.
12. **`mode: 'twr'` byte-identical.** Pinned by the extended two-way test, and the lesson-hash
    fixture is untouched (test green, `git status` shows no fixture change).
13. **No `any`, `@ts-ignore`, `@ts-expect-error` or `as unknown as`** anywhere in the diff
    (grepped; no hits).

## Findings

All six are Low. None blocks the task.

1. **(Low, doc — stale, and pointing the wrong way) `tests/uwb/network.test.ts:498-502`.**
   `ulSigmaM`'s doc comment still says "(The ellipse the solver draws uses √2·σ_r, i.e. c·σ_ts —
   a √2 below this, as in DL-TDoA: it is the model's documented approximation.)" Commit
   `1277472` made the solver's sigma *exactly* `ulSigmaM(syncErrorNs)`, and changed DL too, so
   both halves of the parenthesis are now false — and the assertions a few lines below
   (`ellipseA(rs) === 0.036` against `ulSigmaM(0) === 0.0424`) are the very numbers that
   contradict it. This is the one comment in the change that would mislead a reader, and the
   lesson author is reading this file for numbers right now. Deleting the parenthesis is enough.

2. **(Low, test gap) The new overlay test does not exercise the ring gate.** In UL-TDoA a tag's
   lane has `u.ranges === {}` (asserted in `network.test.ts`), so
   `expect(names(overlay.group)).toEqual(['ellipse:tag-1', …, 'fix:tag-2'])` would pass
   identically with `scene.ts:132`'s `rings` condition deleted. The gate is the change; nothing
   pins it. The file already has the pattern for this — the "stale fix" test mutates a cloned
   view (`u.position!.block = u.block - 2`) — so putting one range on a cloned TDoA lane and
   asserting no `ring:` object appears (and that flipping `method` to `'twr'` brings it back)
   would close it in a few lines.

3. **(Low, edge/doc) `dlDiffSigmaM` has no term for an uncorrected tag crystal.** With
   `tdoaClockCorrection: false` a difference carries up to 20 ppm of the poll-to-arrival interval
   — the hint's own "0.4 µs, i.e. 120 m" — which is not in the sigma, while `ellipseHintTdoa` now
   says the ellipse is drawn "from what a time difference really carries". In practice this
   almost never shows: Task 2's review recorded that at ±20 ppm the correction-off variant
   produces *no fix at all* (the differences are geometrically impossible), so there is no ellipse
   to be wrong; it only bites for a small non-zero ppm. The ruling's formula is implemented
   exactly as ruled, so this is a doc gap, not a deviation — one clause in `dlDiffSigmaM`'s
   comment ("assumes the rate correction is on; with it off the tag's own crystal dominates and
   is not in this figure") would settle it.

4. **(Low, UX, pre-existing but newly reached) `uwb.noPosition` reads "no fix yet — a tag needs
   ranges to three anchors in one block".** A UL-TDoA tag never measures a range, and in this mode
   it is not even the solver; the line shows on its lane for the whole first block. It arrived
   with Task 2 (DL-TDoA has the same problem) and was not flagged then. A mode-aware variant, or
   simply "…needs three time differences in one block" for a non-TWR session, would fix both.

5. **(Low, style) `scene.ts:133`: `for (const [id, r] of rings ? Object.entries(u.ranges) : [])`.**
   The ternary-in-the-iterable reads as a trick; `if (rings) for (…)` around the loop, or an early
   `continue`, says the same thing plainly. Behaviour is correct either way.

6. **(Low, consistency) ASCII double quotes inside the new Chinese strings.** `i18n.ts:789-791`
   are the only ZH entries in the table that use `"…"` (`"轮询帧→终结帧"`, `"只听"`, `"有线同步"`);
   every other ZH string uses full-width punctuation, and the EN table uses curly quotes (the new
   EN `uwbSyncErrorHint` at line 380 also uses `"wired sync"` where its neighbours use curly
   quotes). Cosmetic, but it is four characters.

## Note for Task 4 (the lesson)

- The ellipse numbers in the report's Follow-up table are the ones now in the code and pinned in
  tests; the *body* of `task-3-report.md` above that section (2.5 × 1.1 cm, "the ellipse is
  unchanged between the two runs") describes the pre-`1277472` behaviour and must not be quoted.
  The live figures are DL 20.1 cm, UL 3.6 cm at 0 ns and 34.8 cm at 1 ns.
- A lost blink is not silent on the infrastructure side: each anchor that misses it emits
  `UWB_TIMEOUT` (`anc-i UWB slot 0: no blink from tag-k`), because the anchor's slot names the
  round's tag. That is reasonable and matches the other modes, but it is untested and worth
  knowing before a lesson asserts "nothing is emitted when a blink is lost".
