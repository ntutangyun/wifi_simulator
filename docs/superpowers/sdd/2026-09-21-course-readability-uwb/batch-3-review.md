# Batch 3 review — uwb-coexist, uwb-contention (commit ddd43dc)

Reviewed in worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, read-only.

## Verdicts

- **uwb-coexist: READY**
- **uwb-contention: READY**

Both lessons pass their own test files and `readability.test.ts`'s per-lesson
shape checks; the one readability failure observed (`uwb-dl-tdoa` migration
bookkeeping) is out of scope per the task brief. No pin was dropped, weakened,
or left un-migrated; `.body!` is gone from both test files; both use
`lessonShapeSuite` from `tests/course/kit.ts`. Findings below are all
Medium-or-lower polish items, not blockers.

## Counts by severity

- Critical: 0
- High: 0
- Medium: 1
- Low: 4
- Nit: 3

## Part 1 — beginner read

Persona: knows Wi-Fi Tier 1 + UWB through `uwb-blocks` (`uwb-coexist.needs =
['uwb-blocks']`; `uwb-contention.needs = ['uwb-coexist']`), so does **not**
know `uwb-position`/`uwb-geometry`, even though those sit earlier in
`curriculum.ts`'s linear listing — the declared prerequisite graph is what a
learner can legally jump straight in from.

### uwb-coexist EN
- First sentence I couldn't follow: none.
- Unexplained words: **GDOP**, used three times (`src/course/uwb/uwb-coexist.ts:128-129`, `:217-218`, `:276`) with no gloss and not in `new words`. GDOP is only defined in `uwb-geometry.ts`, which this lesson does not require. A reader who took the direct `uwb-blocks → uwb-coexist` path has never seen it. (Medium — see below.)
- `FoM byte` appears once, unglossed, but only inside a **wrong** quiz answer (`uwb-coexist.ts:277`) — low stakes, but a beginner may stall trying to evaluate an option built on a term they don't have. (Low.)
- Paragraphs with >1 idea: none flagged; each subsection carries one claim.
- Contradictions: none found.
- Opening: states the problem (two radios sharing spectrum, neither hearing the other) and gives it a "so what" (prices the damage, picks a working cure), but the audience is only implicit (someone running/reasoning about a ranging session near Wi-Fi) — acceptable for this course's register.
- Sent to the simulator early with a set-up prompt: yes — "[WATCH → the first ranging frame lost to Wi-Fi] Load the simulation and press play, then jump to..." tells you what you'll see (the far anchor answered, the laptop's upload was on air, the log names the loss) before you go.
- Quiz answerable from the main path: yes, both questions draw on `now the numbers` (in-band EIRP calc, the backup-run table), not on `deeper`.
- Datasheet-register-style sentences: none egregious; the `sources` bullets attribute cleanly to §16.4.10 with narrative framing.

### uwb-coexist ZH
- Mirrors EN structurally; no additional contradictions or unglossed terms beyond GDOP/FoM (carried over verbatim in meaning).
- ZH sentences that read translated (up to 3):
  1. "两者之间的差距就是 SIR——信干比——而这里它是一个很深的负数，远低于接收机能够穿透解调的程度。" — "远低于接收机能够穿透解调的程度" is a literal rendering of "far below what the receiver can decode through."
  2. "路由器什么也没损失，它的信道整个躺在测距信道里面。" — "整个躺在...里面" reads as a translated participial clause rather than native phrasing.
- Datasheet-register sentences: none beyond the EN equivalents (same sourcing bullets, same framing).

### uwb-contention EN
- First sentence I couldn't follow: none.
- Unexplained words: heading "The birthday problem, with slots" (`src/course/uwb/uwb-contention.ts:143`) names a classic probability puzzle without a gloss; mitigated because the formula and its one-line explanation follow immediately, so it's recoverable, but a reader unfamiliar with the reference gets no help from the term itself. (Low.)
- RCPS/RCMA/response window/sit-out are all in `new words` and used consistently.
- Paragraphs with >1 idea: none flagged.
- Contradictions: none found; the corrected claim ("a wider window buys fewer collisions and worse ranges") is stated consistently in body text (`:15-16`, `:138`, `:168`) and quiz explain (`:269`).
- Opening: states the problem (controller has no roster) and for whom (a phone walking into a strange warehouse) clearly.
- Sent to the simulator early with a set-up prompt: yes — "[WATCH → the first anchor to draw a slot]... jump to the first anchor to draw. All six draw at the same instant... Read the slot numbers: look for two that match" tells you what to look for.
- Quiz answerable from the main path: yes, both draw on the `now the numbers` tables (contenders/expectation, the wait-cost table), not on `deeper`.
- Datasheet-register-style sentences: the two adjacent `sources` bullets — "§10.32.9.5 is the RCPS IE... §10.32.9.6 is the RCMA IE..." — read as a compact register/field list rather than prose. Acceptable for a sources section but borderline. (Nit.)

### uwb-contention ZH
- ZH sentences that read translated (up to 3):
  1. "而等得越久，两只晶振在这段时间里就漂得越开。" — "两只晶振...漂得越开" is a literal carry-over of "the two crystals drift apart."
  2. "抽签抢时隙并不是让一组已知锚点跑得更快的办法；它是用来与一组你还不认识的设备说话的办法。" — the "A 并不是...的办法；它是...的办法" frame reads translated rather than native contrastive phrasing.
- Datasheet-register sentences: same borderline IE-list pair as EN, in ZH (`:...是 RCPS IE`/`是 RCMA IE`).

## Part 2 — pins and contract

### Test inventory diff (`a6fb16c` → `ddd43dc`)
- `tests/course/uwb-coexist.test.ts`: 29 → 27 `it`s. Every removed title has a live counterpart carrying the same assertion, moved to match the new prose location (e.g. "twenty-five blocks... UWB 0.97%" → same file now asserts UWB **48.6 ms** on-air *and* keeps the 0.97% Wi-Fi-cost pin verbatim at lines 491-492 and 628-642). "every string a learner reads exists in both languages" and "the computed study time follows the formula" are not gone — they now live once in `tests/course/kit.ts`'s `lessonShapeSuite` (`:172`, `:146`), which both test files call (`uwb-coexist.test.ts:78`, `uwb-contention.test.ts:122`). No pin lost.
- `tests/course/uwb-contention.test.ts`: 30 → 28 `it`s. Same pattern — every dropped title's number is verified under a renamed `it`, confirmed by grep for the literal values (1.218, 51.4, 14.6, 26.8, 1.69, 1.42, 6.0, 3.0, 129.9, 90.7, 46.1, 5.23, 5.63, 5.97, "eight and a half", scenario-schema check) all present.
- `.body!`: zero live occurrences in either new test file (only mentioned in the header comment describing the migration). Confirmed via grep.
- Kit usage: both files call `lessonShapeSuite(...)` from `./kit`.

### Numbers pinned
Spot-checked every numeric literal in `uwb-coexist.ts`'s prose against its test file: `-30.81`, `18.8`, `26.99`, `31.92`, `462.6`, `0.37`, `11.09`, `14.21`, `8.16`, `2.58` — all present as literal matches in `uwb-coexist.test.ts`. Same for `uwb-contention.ts`: `1.218`, `51.4`, `14.6`, `26.8`, `1.69`, `1.42`, `6.0`, `3.0`, `129.9`, `90.7`, `46.1`, `5.23`, `5.63`, `5.97`, plus the per-slot RMS ramp `['7.3','14.9','16.2','23.5','28.2','32.0','22.8','47.1']` pinned verbatim at `uwb-contention.test.ts:514`. No unpinned number found in either lesson.

### "Wider window has fewer collisions" correction
Verified against the lesson's own measured table and the passing test suite: collided slots fall 46 → 43 → 26 as response slots rise 4 → 8 → 16, while RMS range error rises 14.6 → 26.8 → 51.4 cm over the same progression — i.e. wider window = fewer collisions, worse range accuracy, exactly as corrected in body text (`uwb-contention.ts:15-16, 138, 168`) and the quiz explain (`:269`). This is internally consistent and matches `uwb-contention.test.ts`'s passing assertions.

### Mechanism spot-checks against src/uwb
- **uwb-coexist**: 6 GHz overlap / in-band EIRP model lives in `src/uwb/phy.ts` (`uwbBandOverlap`, `uwbInBandDbm`, `UWB_SIR_MIN_DB`, `UWB_TX_POWER_DBM`) and `src/engine/spectrum.ts` (`uwbToWifiPathLossDb`, `wifiToUwbPathLossDb`); the lesson's channel-9/channel-7/backup/saturated-upload variants are asserted directly against these exports in the test file — no drift found.
- **uwb-coexist "energy detect never trips"**: `CCA_ED_DBM` and `NB_LBT_THRESHOLD_DBM` / `lbtBusy` in `src/uwb/channel.ts:240-245` implement the busy check the lesson describes; the −62 dBm threshold and "router never defers" claim match.
- **uwb-contention capture rule ("no capture, at these distances")**: `UWB_CAPTURE_DB = 6` in `src/uwb/phy.ts:69`, applied in `src/uwb/channel.ts:354` (`if (strong.rssiDbm - weak.rssiDbm < UWB_CAPTURE_DB) strong.doomed = true`) — matches the lesson's "leads by 6 dB" claim exactly.
- **uwb-contention round/slot structure**: `src/uwb/session.ts` builds a contention round as `slot 0 Poll (tag) | slots 1..S Response (whichever anchors drew the slot)` (`:16`, `:136`), confirming the lesson's "A round is 1 + S slots of 2 ms" pin and the random-draw description.

### Test run
```
npx vitest run tests/course/uwb-coexist.test.ts tests/course/uwb-contention.test.ts tests/course/readability.test.ts
```
Result: 187 tests, 186 passed, 1 failed — the failure is
`readability · migration bookkeeping > every MIGRATING id is a real lesson
still in the old shape` for `uwb-dl-tdoa` (a different lesson id, being
touched by another concurrent implementer per the task brief; ignored as
instructed). `uwb-coexist.test.ts` (31/31) and `uwb-contention.test.ts`
(32/32) both pass in full.

## Findings by severity

**Medium**
1. `GDOP` used unglossed in `uwb-coexist.ts:128-129, 217-218, 276` — not in this lesson's `new words`, not covered by its declared prerequisite (`needs: ['uwb-blocks']`), only defined in `uwb-geometry.ts` which is not required. A learner who takes the shortest legal path (`uwb-blocks → uwb-coexist`) meets an undefined term in the picture (the "fix on three anchors" watch step), the numbers table, and the quiz explain.
   - **Fix**: either add a one-clause gloss on first use ("the fix is there... with the anchor count and GDOP — the crowding number from Positioning — beside it"), or add `'uwb-geometry'` (or `'uwb-position'`) to `needs`.

**Low**
2. `FoM byte` unglossed in the wrong answer at `uwb-coexist.ts:277` — low stakes since it's a distractor, but may stall a beginner evaluating it. Consider swapping for a term already in scope, or a plainer paraphrase ("the receiver's own confidence byte").
3. Heading "The birthday problem, with slots" (`uwb-contention.ts:143`) names an unglossed reference; mitigated by the formula/explanation immediately following. Consider a half-clause aside, e.g. "the birthday problem, run on slots instead of days."
4. Borderline datasheet-register sentence pair in `uwb-contention.ts` sources: "§10.32.9.5 is the RCPS IE... §10.32.9.6 is the RCMA IE..." reads as a field list rather than prose; stylistic only.

**Nit**
5. ZH `uwb-coexist.ts`: "两者之间的差距就是 SIR——信干比——而这里它是一个很深的负数，远低于接收机能够穿透解调的程度" reads translated.
6. ZH `uwb-coexist.ts`: "路由器什么也没损失，它的信道整个躺在测距信道里面" reads translated.
7. ZH `uwb-contention.ts`: "而等得越久，两只晶振在这段时间里就漂得越开" and "抽签抢时隙并不是让一组已知锚点跑得更快的办法；它是用来与一组你还不认识的设备说话的办法" both read translated.

None of the above block shipping; both lessons are READY.
