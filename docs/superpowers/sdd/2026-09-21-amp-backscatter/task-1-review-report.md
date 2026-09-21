# Task 1 review — Backscatter model, frames, configuration and schema (AMP slice A2)

**Base:** `567b715` **Head:** `e08ed28`
**Brief:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-brief.md`
**Report:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-report.md`
**Package:** `.superpowers/sdd/2026-09-21-amp-backscatter/task-1-review.md`

## Verdicts

- **Spec compliance: ❌ Issues found** — one stated global constraint is unmet (the i18n parity
  test was not extended to the two new kinds) and one file carries scope the brief assigns to
  Task 3 (`frameFields.ts` field decode).
- **Task quality: Needs fixes** — 2 Important, 7 Minor. No Critical. Every pinned number is
  correct and every test I re-ran is green; the fixes are small.

## Checks I ran

| Check | Result |
|---|---|
| `npx vitest run tests/engine/amp-bs-model.test.ts tests/model tests/ui/i18n.test.ts` | 14 files, **176 tests, 0 failed**, output pristine (no warnings) |
| `npx tsc -b --noEmit` | exit 0, no output |
| Independent arithmetic on all 21 pinned numbers | all match (below) |
| CRC-16-CCITT of the six EPCs the test folds over, and of `'0'×24` | none is 0 or 0xffff (see Minor 1) |
| `ampPpduLayout` residual for `ampRfid` PPDUs | negative for the short cases (see Important 2) |
| `grep FrameKind src/model/caps.ts src/model/lanes.ts` | no hits — the brief listed both, neither needed a change |
| `grep -rn "ampTag:" src tests` | `lessonKit.ts:150` is a second producer with no `mode` (see Minor 6) |
| `src/scene/effects.ts:29-64` `frameColor` | no `default` arm and a `number` return, so the two cases **are** tsc-forced |
| `src/engine/hash.ts` `hashStr` | returns `h >>> 0`, so `epcOf`'s `.toString(16).padStart(8,'0')` is always exactly 8 lowercase hex — the 24-hex invariant holds for every node id, not just the tested ones |

### Pinned numbers — verified independently, not taken from the report

`freeSpacePl0Db(2440)` = 40.196 · `bsPathLossDb(2440, 0.1, 0)` = 20.196 · 0307 table at L = 6:
−46.39 / −58.43 / −70.47 dBm, SNR 23.6 / 11.6 / −0.47 dB against −70 · `monoReachM` = 10^((61/2 −
40.196)/20) = **0.32754 m** (250 kb/s) and 10^((55/2 − 40.196)/20) = **0.23186 m** (1 Mb/s), with
`bsDbm` cancelling algebraically · `activationReachM` = **0.30917 m** (10 dBm) / **0.97773 m**
(20 dBm) · replies 112 / 560 / 464 / 208 µs at 250 kb/s and 28 / 140 / 116 / 52 µs at 1 Mb/s ·
BST 142.4 / 635.2 / 529.6 / 19.2 / 2429.8 / 2258.2 µs · DL PPDUs **1516.4 / 452.4 / 1009.2 /
1063.6 / 2963.8** µs and **1424.0 / 360.0 / 547.2 / 680.8 / 2792.2** µs. Every one agrees with the
brief to the digit, and every one is asserted in `tests/engine/amp-bs-model.test.ts`.

### Do the tests bite? (global constraint 7)

Yes, with one exception. The ten DL PPDU durations and the eight reply airtimes are exact `toBe`
comparisons in nanoseconds — no constant in the timing block can move without breaking one. The
reaches are asserted to ±1 mm, and a 1 dB error in `AMP_BS_LOSS_DB`, `_ISOLATION_DB`, `_READER_DR_DB`
or `AMP_BS_REQ_SNR_DB` moves the reach by 10^(0.5/20) ≈ 5.9 % ≈ 19 mm — caught by a factor of 19.
`tests/engine/amp-bs-model.test.ts:88-93` additionally brackets `monoReachM` against `bsDecodes` at
±0.1 %, so the closed form cannot drift away from the predicate it claims to invert. The missing
absence of a recorded RED run is adequately compensated. The one branch that is **not** covered is
`crc16Epc`'s reserved-word fold (Minor 1).

## Strengths

- **Every pinned number is right and every one is asserted.** `tests/engine/amp-bs-model.test.ts:130-146`
  pins all ten DL PPDU durations at both uplink rates in exact nanoseconds; `:78-84` pins both
  reaches at five different `bsDbm` values, which is what turns "the excitation cancels" from a
  comment into a test.
- **`monoReachM` (src/engine/ampBs.ts:172-175) is written so the physics is executed, not asserted.**
  Keeping `bsDbm` in the expression rather than pre-cancelling to the constant 64 dB means the
  five-power test is a real test rather than a tautology over a constant.
- **Constant tagging is complete and at the point of definition** (`src/engine/ampBs.ts:41-88`):
  every exported value and both private margins carry SFD / PDT / contribution / EPC Gen2 / model.
  I found no untagged constant.
- **No lifted draft prose.** The module header, the i18n `whatIs`/`next` strings (EN and ZH) and
  the scenario comments are original teaching paraphrase; only field names and numbers are quoted.
  Global constraint 1 is met.
- **Existing scenarios are untouched.** `tests/fixtures/lesson-hashes.json` and
  `uwb-record-hashes.json` are absent from the change list, no engine code reads `ampTag.mode`, and
  `tests/model/scenario.test.ts:127-138` proves a pre-backscatter tag still parses through a real
  `JSON.stringify` round trip. Global constraint 5 is met.
- **The uplink-layout coincidence was verified, not assumed** (`src/model/frameFields.ts:397-406`):
  24 × 2000 = 48 × 1000 = 48 µs and 24 × 500 = 48 × 250 = 12 µs. I recomputed both. Documenting a
  load-bearing coincidence instead of leaving it silent is the right call.
- **The `planOps` regression was found by a test and fixed at the producer**, and the report is
  honest about the test-helper bug that produced the first false RED.

---

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

#### 1. `tests/ui/i18n.test.ts:8` — the parity test still lists only ten kinds; the two new ones are absent

```ts
const KINDS: FrameKind[] = ['data', 'ack', 'rts', 'cts', 'ba', 'trigger', 'mba', 'ampTrigger', 'ampAck', 'ampResp']
```

The diff never touches this file, so global constraint 4 ("the i18n parity test must cover them")
is unmet. The exhaustive `Record<FrameKind, string>` at `src/ui/i18n.ts:235/237/239` does make a
*missing* key a compile error, so this is not a live gap today — but it does not catch an **empty
string**, which is exactly what the test exists to catch, and the constraint was explicit.

**Fix:** add `'ampRfid', 'ampBsReply'` to `KINDS`. Better, replace the hand-written array with one
derived from the type so it can never fall behind again — note the six UWB/4ab kinds are missing
from it too (pre-existing), so the list is already stale by six entries.

#### 2. `src/model/frameFields.ts:397-406, 408-424` — the new doc comment's "They still sum to `txTimeNs`" is false for short RFID PPDUs

The added comment states the `ampRfid` segments "still sum to `txTimeNs`". They do not, for any
`ampRfid` PPDU shorter than the Active Tx fixed prefix. The downlink branch computes

```
ext = txTimeNs − (32 000 + 80 000 + 64 000 + data + 20 000)
```

and `if (ext > 0)` at line 422 silently **drops** a negative remainder. Computed for real
`ampRfidFrame` outputs:

| PPDU | `txTimeNs` | fixed segments | `ext` |
|---|---|---|---|
| QueryRep, 1 Mb/s UL | 360 000 | 452 000 | **−92 000** (dropped) |
| QueryRep, 250 kb/s UL | 452 400 | 452 000 | +400 |
| Read, 1 Mb/s UL | 680 800 | 676 000 | +4 800 |

So the frame-detail PPDU strip for a QueryRep at 1 Mb/s renders 452 µs of segments over a 360 µs
frame — a 26 % overrun, not merely "one long signal extension". It also breaks the contract stated
one line below at `src/model/frameFields.ts:426` ("durations sum to frame.txTimeNs") and will make
`tests/model/frameFields.test.ts`'s existing invariant *"PPDU segment durations sum to
frame.txTimeNs"* fail the moment Task 3 records an `ampRfid` frame.

**Why it matters:** the comment is what the next implementer will read. As written it certifies a
property that does not hold and invites Task 3 to defer the layout again.

**Fix (minimal, no palette needed):** either correct the comment to say the segments **overrun**
the frame for short commands and that the strip must not be trusted until Task 3 adds the
excitation keys, or — better and about six lines — route `f.amp.rfid` frames to their own branch
now: `legacyPreamble 16 / signal 4 / usig 12 / ampWup wupNs / ampSync 16 000 / ampData
ampBitsNs(bytes·8, 250) / ampBst bstNs / signalExt remainder`, reusing an existing
`PpduSegmentKey` for the two excitations (e.g. `padding`) until Task 3 gives them their own.

### Minor (Nice to Have)

#### 1. `tests/engine/amp-bs-model.test.ts:186-198` — the `crc16Epc` reserved-word fold is asserted but never exercised

The comment claims *"The two reserved words are mapped away rather than emitted"*, but
`expect(crc16Epc('000000000000000000000000')).not.toBe(0xffff)` passes with or without the fold: I
computed the raw CRC-16-CCITT of twelve zero octets as **0x84f9**. None of the six ids in the loop
produces a reserved word either (0xacce, 0x3415, 0xd5d5, 0xdb8b, 0x301b, 0x039b). Deleting the
`return crc === 0 || crc === 0xffff ? 0x5a5a : crc` clause at `src/engine/ampBs.ts:243` would leave
the suite green — a vacuous assertion under global constraint 3.

**Fix:** extract the fold (`reserveFold(crc)`) and unit-test it on 0, 0xffff and one ordinary
value, or search for a node id whose EPC hits a reserved word and pin it.

#### 2. `src/model/frameFields.ts:302-351` — the Gen2 field decode is 50 lines beyond what `tsc` forces, is Task 3's scope, and has no test

What the compiler forces here is the two `SUBTYPE` entries (line 130, an exhaustive `Record`) and
*an* assignment to `fields` (line 230, definite assignment). The full per-command and per-reply
breakdown is the spec's "Frame detail decodes the RFID frame (command, Q, RN16, EPC)", which sits
in the A2 "Records, view, UI" paragraph the brief assigns elsewhere — and `tests/model/*` never
calls `decodeFrame` on either kind, so the `checkSize` throw at line 418 is an untested failure
path. I checked the arithmetic by hand and it is correct: DL `1+2+2+GEN2_CMD_BYTES+2` equals
`ampRfidBytes` for all six commands, and the four replies sum to 2 / 16 / 13 / 5. Not wrong — just
unrequested and uncovered.

**Fix:** add one test that runs `decodeFrame` over an `ampRfidFrame` for each of the six commands
and an `ampBsReplyFrame` for each of the four replies, so the `checkSize` invariant is pinned.

#### 3. `src/model/frameFields.ts:311-313` — the RFID id field ignores a configured EPC

`crc16Epc(epcOf(f.dst))` always *derives* the EPC from the node id, while `AmpTagCfg.epc` lets a
scenario set one, and `ampBsReply` one case below correctly prefers the carried value
(`b.epc ?? epcOf(f.src)`). A tag with a custom EPC will show a 16-bit id that does not match its
own reply. **Fix:** carry the addressed tag's id16 (or its EPC) in `AmpInfo.rfid` and read it here.

#### 4. `src/engine/ampBs.ts:85-86` — "±20 % clock (100 000 ppm, PM-28)" is arithmetically wrong

100 000 ppm is ±10 %, not ±20 %. The spec's ±20 % appears in the UL-timing paragraph as a separate
tolerance; gluing the two together in one parenthesis states a false conversion in a file whose
whole point is that its numbers are checkable. **Fix:** split the sentence, or say "±10 %
(100 000 ppm, PM-28), and the draft's ±20 % response window".

#### 5. `src/engine/ampBs.ts:90-92` — per-constant SFD attribution the spec does not make

`BST_T1_MARGIN = 1.2 // SFD PM-87` and `BST_REPLY_MARGIN = 1.1 // SFD PM-88` assign each margin to
one specific motion; the spec (and the brief, line 47) attribute the whole formula collectively to
"PM-74, PM-87, PM-88" / "PM-74, PM-75, PM-86…PM-88". Under global constraint 2 a *more* specific
tag than the source supports is a mis-tag, not a better one. **Fix:** tag both with the collective
range the spec uses.

#### 6. `src/editor/planOps.ts:196` vs `src/course/lessonKit.ts:150` — only one of the two tag producers was updated

`newTag` now writes `ampTag: { mode: 'active' }`, restoring the round-trip invariant that
`tests/editor/planOps.test.ts:111` checks. `lessonKit.ts:150` still emits `ampTag: {}` /
`{ dlSensDbm }`, so the same `scenarioFromJson(scenarioToJson(sc)) toEqual sc` invariant remains
broken for every lesson-built AMP scenario — it simply has no test asserting it today. The chosen
fix is correct and minimal for the failing test; it is not the general fix. **Fix (optional):**
either give `lessonKit.ampTagNode` the same explicit `mode`, or normalise in `scenarioToJson`.

#### 7. `tests/engine/amp-bs-model.test.ts:18-20` and the report's rationale for it disagree

The report justifies the custom `expectReachM` (±0.001) by claiming 0.32754 is "only just inside"
`toBeCloseTo(_, 3)`'s ±0.0005. It is inside: |0.32754 − 0.328| = 0.00046, so `toBeCloseTo` would
have passed. The helper is fine (and clearer), but the stated reason is wrong; ±1 mm is the looser
of the two and should be defended as "the centimetre the lesson quotes", which is what its own
docstring says.

#### 8. `src/ui/laneLayout.ts:325-326` — missing frame info silently falls back to a wrong label

`GEN2_CMD_NAME[f.amp?.rfid?.cmd ?? 'query']` and `GEN2_REPLY_NAME[f.amp?.bs?.reply ?? 'rn16']` will
render a malformed frame as a Query / RN16 rather than showing nothing. Consistent with the
surrounding chain's style (`f.amp?.slot ?? 0`), so low priority, but both fields are non-optional
in `AmpInfo.rfid` / `.bs` and the fallback can only ever mask a builder bug.

---

## Spec compliance detail

### ✅ Verified present and correct

- Every symbol in the brief's `Produces` block exists in `src/engine/ampBs.ts` with the stated
  signature: 16 constants, `AmpBsUlKbps`, `freeSpacePl0Db` (re-exported from `src/uwb/units.ts`,
  imported not copied as the brief demands), `bsPathLossDb`, `readerFloorDbm`, `monoLeakDbm`,
  `bsReplyDbm`, `bsDecodes`, `monoReachM`, `activationReachM`, `Gen2Cmd`/`GEN2_CMD_BYTES`,
  `Gen2Reply`/`GEN2_REPLY_BYTES`, `AMP_RFID_HDR_BYTES`/`_FCS_BYTES`, `ampRfidBytes`, `bsReplyNs`,
  `bstNs`, `ampBsDlPpduNs`, `ampRfidFrame`, `ampBsReplyFrame`, `epcOf`, `crc16Epc`.
- `src/model/frames.ts:6, 57-77` — `FrameKind` gains both kinds; `AmpInfo.rfid` and `.bs` carry
  exactly the brief's shapes (plus `bs.incidentDbm?`, which the spec's `AMP_BS_REPLY` record needs).
- `src/model/scenario.ts:152, 171-180, 184-190, 196-202, 463-475, 480-482` — `AmpTagMode`,
  `AmpTagCfg.mode`/`.epc`, `AmpApCfg.backscatter`, `DEFAULT_AMP_BS` with the exact eight defaults,
  and every schema bound the brief lists: `q` int 0…8, `ulKbps` ∈ {250, 1000}, `wupMs` ≥ 1,
  `chargeDbm`/`bsDbm` −10…30, `txopMs` 1…10, `epc` `/^[0-9a-fA-F]{24}$/`.
- `src/model/scenario.ts:783-793` — the cross-node rule with the brief's exact message *"a
  backscatter tag needs an AP with the RFID inventory on"*, placed with the other cross-node rules
  and pathed at the offending tag's index.
- `src/ui/i18n.ts` — `kindName`, `whatIs` and `next` for both kinds in **both** EN (613-670) and ZH
  (1132-1189), plus two lane tooltips in both. Global constraint 4's *strings* half is satisfied;
  only its test half is not (Important 1).
- Commit subject matches the brief verbatim.

### ❌ Issues

- **Missing:** the i18n parity test was not extended (Important 1).
- **Extra:** the Gen2 field decode in `src/model/frameFields.ts` (Minor 2) exceeds the
  compiler-forced minimum and delivers what the spec assigns to the frame-detail/UI work.

### ⚠️ Cannot verify from this diff

- `AMP_BS_T2_NS`, `AMP_BS_TAG_PPM` and `AmpInfo.bs.incidentDbm` are defined but unused — correct
  per the brief (Task 2/3 consume them), but nothing in this task proves they are right.
- The `ampPpduLayout` overrun (Important 2) only becomes observable once Task 3 records `ampRfid`
  frames. The controller should make sure Task 3's brief carries it explicitly, because
  `tests/model/frameFields.test.ts`'s sum invariant will go red at that point.
- The brief listed `src/model/caps.ts` and `src/model/lanes.ts` as files to modify. Neither is in
  the diff, and neither should be: `grep FrameKind` returns nothing in either file, and `tsc -b` is
  clean. This is a brief inaccuracy, not a missed change.
- The report's claim that the full suite is 117 files / 1763 tests / 0 failed is outside the scope
  I was asked to re-run; the 14 files I ran are green.

## Assessment

**Task quality: Needs fixes**

**Reasoning:** The model half is genuinely solid — all 21 pinned numbers reproduce from first
principles, the constants are tagged at their definitions, the reach test is structured so the
"excitation cancels" claim cannot pass vacuously, and no existing scenario moved. The two things
to fix are small and mechanical: extend the i18n `KINDS` array, and either fix or honestly
re-describe `ampPpduLayout`'s behaviour for short RFID PPDUs, where the added comment currently
certifies a sum property that is off by 92 µs.
