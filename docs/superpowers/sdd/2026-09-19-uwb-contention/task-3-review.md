# Task 3 review — lesson "When the controller does not know who is there"

Reviewed: `ae608ec..f6b990b` (`src/course/lessonKit.ts`, `src/course/lessons.ts`,
`src/course/uwb/uwb-contention.ts`, `tests/course/uwb-coexist.test.ts`,
`tests/course/uwb-contention.test.ts`, `tests/fixtures/lesson-hashes.json`), against
`task-3-brief.md`, `docs/superpowers/sdd/2026-09-19-uwb-contention/task-3-report.md`, the
controller's rulings, Slice 4 of `docs/superpowers/specs/2026-09-19-uwb-slices-design.md`, and
the ground truth in `src/uwb/device.ts`, `src/uwb/phy.ts`, `src/model/scenario.ts`,
`src/uwb/ui/rows.ts`, `src/ui/i18n.ts` (all read at `HEAD`, since the working tree carries
another agent's Slice-5 edits). House style taken from `src/course/uwb/uwb-coexist.ts`, its test
and the reviews under `docs/superpowers/sdd/2026-09-19-uwb-coexist/`.

## Verdict

- **Spec: APPROVED**
- **Quality: APPROVED**

Nine findings, none blocking: six minor, three informational.

## Verification run

- `npx vitest run tests/course/uwb-contention.test.ts tests/course/uwb-coexist.test.ts
  tests/course/lessons.test.ts tests/engine/lesson-hashes.test.ts` → **4 files, 101 tests, all
  passing** (uwb-contention 29, uwb-coexist 29, lessons 42, lesson-hashes 1).
- `npx tsc -b` → **exit 0, no output**. No errors anywhere, so nothing had to be discounted for
  the other agent's files.
- No `any`, `as unknown as`, `@ts-ignore` or `@ts-expect-error` in either new file (the only hit
  for `any` is the English word inside a quiz question). The non-null assertions used
  (`uwbContention.variants!`, `s.uwb!`, `bySlot.get(...)!`) are the established style in
  `uwb-coexist.test.ts`.
- `tests/fixtures/lesson-hashes.json`: exactly three keys added — `uwb-contention`,
  `uwb-contention#0`, `uwb-contention#1` — and no existing line touched. Fixture-additions-only
  constraint met.

## Binding constraints — all met

| Constraint | Where | Verdict |
|---|---|---|
| Six anchors, 3.5 m ring, every 60°, tag at centre, all z 2.2 | `uwb-contention.ts:35-73`; test `:228-245` | met — 3-D distance asserted to 1e-6, angles `[0,60,120,180,240,300]`, room 10 × 8 m |
| SS-TWR, `schedule: 'contention'`, NLOS off, ppm drawn | `:70-72`; test `:247-263` | met — plus `maxAttempts`/`slotRstu`/`tsNoisePs`/`cfoNoisePpm` asserted equal to `DEFAULT_UWB_SESSION`, and every node's `uwb.ppm` asserted `undefined` |
| Defaults 8 / 3; variants S = 4 / 16 with the exact labels | `:41,129-132`; test `:253-272` | met — `CONTENTION_SLOTS.base === DEFAULT_UWB_SESSION.contentionSlots`; variant isolation proved by stripping `contentionSlots` and comparing the JSON |
| `id 'uwb-contention'`, module 14 | `:76-77`; test `:145-146,216-224` | met — also `MODULES[14]`, `TIERS[5].track === 'uwb'`, and the `COURSE_ORDER` successor of `uwb-coexist` |
| 4 observe + 2 tryThis + 3 quiz, `lessonMinutes` ≤ 25 | test `:134-155` | met — `lessonMinutes` recomputed from the curriculum formula, bounded 15–25, and the 1724-word ceiling asserted with the 1725 → 30 tipping point |
| Fixture additions only, three keys | `lesson-hashes.json` | met |
| Three-line change in `uwb-coexist.test.ts`, seam only | `uwb-coexist.test.ts:241-245` | met in substance — see finding 9 (four lines: three assertions plus the comment that counts them) |
| Standard citations §10.32.2 mode 0 / §10.32.9.5 RCPS / §10.32.9.6 RCMA / §10.32.1 NOTE | `:81-82`; test `:200-214` | met — and they match the tags already used in `scenario.ts:192,194`, `Guide.tsx:178-179`, `device.ts:6,209,360` |
| Model tags: 8 / 3 and the feedback loop owned as model | `:81`; test `:211-213` | met — the sentence is asserted to contain the two defaults *interpolated from* `DEFAULT_UWB_SESSION`, plus "The rest is the model" and the feedback-loop clause |
| ZH parity | test `:175-198` | met — >40 L10n pairs walked, both sides non-empty, `zh !== en` for anything prose-shaped; see finding 4 for one drift the walker cannot catch |
| Pure predicates | `lessonKit.ts:274-279` | met — three one-line record predicates, no closure state |
| No `any` / `as unknown as` | both new files | met |

## The controller's rulings

**Both values stated, and the sign explained honestly.** Met, and the explanation is correct. The
body prints the analytic row and the measured row side by side in the table, then "Why the run is
not the formula" states the direction plainly ("4 slots comes out above the formula, 8 and 16
below") and attributes it to thinning. I checked the mechanism independently:

- The direction claim is pinned as an inequality, not a transcription — test `:399-401` asserts
  `measured/round > expectedResponses(6, 4)` and `<` at 8 and 16.
- The thinned expectation is recomputed round by round from the *realised* contender count,
  `expectedResponses(r.drew.size, S)` (test `:355-362`), giving 1.54 / 3.02 / 4.33 against the
  all-six 1.42 / 3.08 / 4.35 — so the sign of the thinning correction matches the sign of each
  row's deviation in all three scenes. Correct.
- The monotonicity that makes that work is pinned rather than asserted in prose: `f(4,4) = 1.69 >
  f(6,4) = 1.42` and `f(4,S) < f(6,S)` for S ∈ {8, 16} (test `:364-369`). I confirmed the
  arithmetic: `4·(7/8)³ = 2.68 < 3.08` and `4·(15/16)³ = 3.30 < 4.35`.
- The residuals are honest about magnitude: thinning accounts for the 4-slot row almost exactly
  (47 vs 46.1, 0.2σ) and for 16 slots within a sigma, while the 8-slot row's 1.8σ is called
  "ordinary scatter" rather than being explained away. See finding 7 for a wording nit.
- The 4σ binomial envelope is computed, not quoted: `sd6 = sqrt(30·6·p(1−p))` with
  `p = (1−1/S)^5` (test `:390-394`).

**The added "the drawn slot is the reply time" section.** Welcome and fully pinned. The
per-millisecond figure is *derived* from the engine (`0.5 · slotMs · cfoNoisePpm · c`, test
`:494-500`) rather than transcribed, which is exactly the house standard; the eight-slot RMS ramp
is recomputed from the run and string-matched against quiz 3's explanation with the Oxford-style
join reconstructed in code (test `:506-508`). The counter-intuitive conclusion — the 4-slot window
is *more accurate* than the roll-call — is pinned from both ends (max drawn slot 4 vs roll-call
slot 6, test `:518-520`).

## Findings

1. **Minor — `−14 dBm` is a re-typed engine constant with no pin.** Body 7 says "Every anchor here
   is 3.50 m away at the same −14 dBm". That is true — `src/uwb/phy.ts:69`
   `UWB_TX_POWER_DBM = -14`, applied unconditionally by `lessonKit.ts:184` — but it is the one
   engine number in the lesson that the test does not tie back to its export, while the file goes
   out of its way to do so for `UWB_CAPTURE_DB`, `slotRstu`, `cfoNoisePpm`, `contentionSlots` and
   `maxAttempts`. A one-line `expect(UWB_TX_POWER_DBM).toBe(-14)` beside the existing
   `expect(UWB_CAPTURE_DB).toBe(6)` (test `:443`) would close it. Not blocking: the substantive
   claim (equal levels, spread < 0.001 dB) *is* pinned at `:447-448`.

2. **Minor — "the average answer now waits eight slots instead of four" is unpinned and rounded
   down.** `tryThis[0]` (`:151`). The mean drawn slot is `(S+1)/2` = 8.5 at S = 16 and 4.5 at
   S = 8, so both figures are 0.5 low; the ratio the sentence is really making survives, but this
   is the only empirical sentence in the lesson with no entry in the test. It is also trivially
   pinnable from `rounds(v).flatMap(r => [...r.drew.values()])`, which the test already builds.

3. **Minor — quiz 3's "nearly four times worse" is 3.52×.** 51.4 / 14.6 = 3.52. Both endpoints are
   pinned (test `:511-515`), so nothing can drift silently, but "three and a half times" would be
   the accurate phrasing and costs the same two words.

4. **Minor — ZH parity drift in `tryThis[1]`.** The Chinese adds a clause the English does not
   have: "…两个输入框变灰**——已经没有什么可抽了**" ("there is nothing left to draw"). The parity test
   (`:175-198`) only checks both sides exist and differ, so it cannot see this. Everywhere else the
   two languages track sentence for sentence; this is the one place they do not.

5. **Minor — the grey-out claim in `tryThis[1]` is unpinned.** "Response slots and Attempts grey
   out" is true — `src/uwb/ui/UwbSessionFields.tsx:40,71,77` disables both inputs unless
   `ssOnly && schedule === 'contention'` — and the label strings match `STRINGS.en`
   (`i18n.ts:373-374` "Response slots" / "Attempts", `:762-763` "响应时隙数" / "尝试次数"). The test
   pins three other UI strings through `STRINGS` (`:465,:488-489`) but not these two, so a label
   rename would leave the lesson quoting a caption that no longer exists.

6. **Minor — "within a sigma" is pinned only to one decimal place.** Body 6 says the 16-slot run is
   explained "within a sigma"; the test pins `|z|.toFixed(1) === '1.0'` (`:371-387`), which admits
   anything up to 1.049. I recomputed it by hand from the pinned inputs — `p = (15/16)^5 = 0.7242`,
   per-round variance `6p(1−p) = 1.198`, `sd ≈ 5.97`, `|124 − 129.9| / 5.97 ≈ 0.99` — so the
   sentence is true today, but the assertion that guards it is the formatted string, not the
   inequality the prose asserts. `expect(Math.abs(measured − exp) / sd).toBeLessThan(1)` for
   `slots16` would make the pin say what the sentence says.

7. **Informational — "The sit-out column is why" reads stronger than the evidence for the 8-slot
   row.** Thinning moves that row's expectation only 3.08 → 3.02 while the measurement is 2.63, so
   the sit-out column explains the *sign* of the deviation and about 5 % of its size; the remaining
   1.8σ is scatter, which the paragraph does go on to say two sentences later. The paragraph is
   honest as a whole, but a learner reading the topic sentence alone would take it as the magnitude
   explanation. Consider "The sit-out column is why they differ in direction."

8. **Informational — kit predicate naming deviates from the brief, undeclared.** The brief names
   `firstUwbContend` and `firstUwbCollision`; the implementation ships `firstUwbContend`,
   `firstUwbContendCollision` and a third, `firstUwbSitOut` (`lessonKit.ts:274-279`). Both
   departures are improvements — `firstCollision` already exists at `:244` for the Wi-Fi
   `COLLISION` record, so `firstUwbCollision` would have been actively misleading, and the sit-out
   predicate earns its place as jump 4 — but neither appears in the report's "Deviations from the
   brief" section, which lists three other deviations. Worth a line there for the ledger.

9. **Informational — the `uwb-coexist.test.ts` edit is four lines, not three.** Three assertions
   plus the comment above them, which counts the not-yet-written lessons and had to go from "the
   four" to "the three". Still strictly limited to the seam assertion, so the constraint is met in
   substance; only the report's "Three lines" is off by one.

## Claim → pin table

Every number and empirical sentence a learner reads. "prose" = also string-matched against the
shipped English by `prose()` / a direct `.toContain`.

| Claim (where it is printed) | Pin |
|---|---|
| §10.32.2 schedule mode 0; §10.32.9.5 RCPS IE; §10.32.9.6 RCMA IE; §10.32.1 NOTE (body 1) | test `:204-209`, each cited clause string-matched; consistent with `device.ts:6,209,360`, `scenario.ts:192,194` |
| "the defaults of 8 slots and 3 attempts" are model (body 1) | test `:211`, interpolated from `DEFAULT_UWB_SESSION.contentionSlots` / `.maxAttempts` |
| "The rest is the model" + the feedback-loop clause (body 1) | test `:212-213` |
| Six anchors every 60°, 3.5 m ring, tag at centre, all z 2.2, true range 3.50 m (body 3) | test `:228-245` — 3-D hypot to 1e-6, angle list, `tag.pos === RING_CENTER` |
| Room holds the ring (10 × 8 m) (scene) | test `:243-244` |
| "A round is 1 + S slots of 2 ms: 10 ms at 4 slots, 18 at 8, 34 at 16, against 14 ms for a time-scheduled round of six anchors" (body 3) | test `:275-291` — `rstuNs(slotRstu) === 2 ms`, `r.slots === 1 + S`, `r.untilNs` per variant, roll-call `1 + 6` slots / 14 ms; prose |
| 30 rounds per scene, and for the roll-call reference | test `:293-296` |
| `P = (1 − 1/S)^(N−1)`, `N·(1 − 1/S)^(N−1)`; S = 4 → 1.42, 8 → 3.08, 16 → 4.35 (body 4, table col 3) | test `:300-312` — recomputed from `expectedResponses`, never transcribed; formula block and table column both matched |
| "Doubling the window from 8 to 16 buys 1.27 more responses a round and costs 16 ms" (body 4 note) | test `:314-319` — gain recomputed; `untilNs` difference `=== 16 ms` |
| Table: responses/round 1.57 / 2.63 / 4.13 | test `:321-343` — `tagRanges(rs).length / 30`, `round2(...).toFixed(2)` |
| Responses totals 47 / 79 / 124 (body 6, body 10) | test `:324-332`, `:385`, `:525` |
| Collided slots 46 / 43 / 26 (table, observe 2, tryThis 1) | test `:333,:337`; inspector row `:464` |
| Sit-outs 23 / 11 / 1 (table, body 8) | test `:334,:338` |
| Fixes 7 / 15 / 27 of 30 (table, tryThis 1, body 10) | test `:328,:335,:339`, `:526`, `:540` |
| "4 slots comes out above the formula, 8 and 16 below" (body 6) | test `:399-401`, as inequalities |
| Contenders per round 5.23 / 5.63 / 5.97 (body 6, quiz 1) | test `:345-353` — `draws/30`; plus draws + sit-outs `=== 30 × 6` (nobody misses a poll); prose |
| Thinned expectation 1.54 / 3.02 / 4.33 (body 6, quiz 1) | test `:355-362` — `expectedResponses(r.drew.size, S)` per round |
| "n·(1 − 1/4)^(n−1) rises from 1.42 at six contenders to 1.69 at four"; hurts at wider windows (body 6, quiz 1) | test `:364-369` |
| "47 against 46.1", "124 against 129.9", "79 against 90.7", 1.8σ / 1.0σ / 0.2σ (body 6) | test `:371-397` — expectation and `|z|` recomputed per round; see finding 6 for "within a sigma" |
| "All three sit inside a 4σ binomial envelope"; "none is the number it printed" (body 6) | test `:388-396` |
| Capture margin 6 dB; "within 6 dB both are lost" (body 7, quiz 1) | test `:443,:449` — `UWB_CAPTURE_DB` imported from `phy.ts`; prose |
| Equal levels ⇒ spread "thousandths of a decibel" (body 7) | test `:445-448` — `20·log10(max d / min d) < 0.001` |
| Zero captures across "the ninety rounds of the three scenes" (body 7) | test `:434-441` — no `UWB_RANGE` in a slot that recorded `UWB_CONTEND_COLLISION`; `3 × 30 === 90` |
| "−14 dBm" (body 7) | **not pinned** — true (`phy.ts:69`, `lessonKit.ts:184`); finding 1 |
| "The record is emitted for a capture too" (body 7) | verified against `device.ts:264-275` (keyed on the slot, emitted on any `'collision'` rx-fail, incl. the captured-weaker case) |
| Round-0 draws: anchor-1 → 4, -2 → 7, -3 → 1, -4 → 4, -5 → 8, -6 → 7, all attempt 1, all at 198.666 µs (observe 1) | test `:406-432` — map equality, `t` and `attempt` arrays, `fmtRecord` line, and each `"<id> slot <n>"` fragment matched back into the observe string |
| "Two pairs picked the same slot, so six anchors yield two ranges" (observe 1) | test `:413-414` — collided slots `[4, 7]`, ranged `['anchor-3','anchor-5']` |
| Every draw inside `[1, S]`, all rounds, all scenes | test `:416-421` (and `device.ts:370` `1 + rng.int(S − 1)` with `int` inclusive — `engine/rng.ts:26` — so the draw really is uniform over S) |
| First collision: slot 4 at 8.187 ms, `"uwb-1 contention collision in slot 4"` (observe 2) | test `:452-457` — `t === 8_187_384` |
| "one record per slot, not per answer lost" (observe 2) | test `:458-460` — round 0 dooms four answers in two slots, two records |
| Inspector row "slots collided" reaching 43 (observe 2) | test `:462-466` — replayed through `initViewState`/`applyRecord`, label from `STRINGS.en.uwb.contendCollisions` |
| "No UWB_TIMEOUT appears anywhere in the run" (observe 2, quiz 2) | test `:469-471`, all three scenes; reason verified in `device.ts:350-353` (an open slot names no peer) |
| anchor-2: attempts 1, 2, 3 in rounds 0–2, sits out round 3 at 600.198666 ms (body 8, observe 3, jump 4) | test `:473-490` — attempt sequence `[1,2,3,'out']`, `rs[0..2].sat === []`, `rs[3].sat === ['anchor-2']`, not ranged in any of the three, `fmtRecord` line, jump instant `3 × 200 ms + 198.666 µs` at `:171` |
| Inspector row "contention draw · sitting this round out" (observe 3) | test `:486-489` — `uwbContendText` + `STRINGS.en.uwb.contend`; ZH counterparts verified at `i18n.ts:807,809` |
| "half the reply time times its 0.2 ppm residual — 3.0 cm per ms, 6.0 cm per 2 ms slot" (body 9, quiz 3) | test `:494-500` — derived from `rstuNs(slotRstu)`, `cfoNoisePpm` (0.2, `scenario.ts:199`) and c; prose |
| Per-slot RMS ramp 7.3, 14.9, 16.2, 23.5, 28.2, 32.0, 22.8, 47.1 cm (quiz 3 explain) | test `:502-508` — recomputed and re-joined into the shipped sentence |
| RMS 14.6 / 26.8 / 51.4 cm vs 20.4 cm time-scheduled (body 9, tryThis 1, tryThis 2) | test `:511-517` |
| "A roll-call of six anchors must reach slot 6; a 4-slot window never gets past slot 4" (tryThis 2) | test `:518-520` |
| "nearly four times worse" (quiz 3 question) | endpoints pinned; ratio is 3.52× — finding 3 |
| "the average answer now waits eight slots instead of four" (tryThis 1) | **not pinned**; `(S+1)/2` = 8.5 / 4.5 — finding 2 |
| "79 ranges and 15 fixes…, the first fix not until block 6, 1.218 s in" (body 10, observe 4) | test `:523-528` — `fixes[0].block === 6`, `t === 1218 ms`; jump instant `:172` |
| "six of those fifteen have only three anchors to work with" (observe 4) | test `:529-530` |
| Roll-call reference: 180 / 180 responses, 30 / 30 fixes, "a round 4 ms shorter" (body 10, tryThis 2) | test `:531-535` (and `:283,:289` for 18 vs 14 ms); `UWB_CONTEND` count 0 in the reference |
| 4-slot fixes "every one on the bare minimum of three anchors" (tryThis 1) | test `:538-543` |
| "Response slots and Attempts grey out" (tryThis 2) | **not pinned**; true per `UwbSessionFields.tsx:40,71,77` and `i18n.ts:373-374,762-763` — finding 5 |
| Jump order and instants (5 jumps) | test `:157-173` — indices non-decreasing, and `t` = 0 / 198.666 µs / 8.187384 ms / 600.198666 ms / 1.218 s |
| Course seam: last in `LESSONS`, after `uwb-coexist` in `COURSE_ORDER`, module 14 tier 5 | test `:216-224`; mirrored in `uwb-coexist.test.ts:241-245` |

## Notes for the next task

- The measurement window is a bare `runUntil(5900 ms)` with the "exactly 30 rounds" argument in a
  comment rather than an assertion of the *last* round's end; the round count is asserted
  (`:293-296`), which is the load-bearing part, so this is fine as is.
- `tests/course/uwb-contention.test.ts:322-327` builds `rows` through an identity `.map` whose only
  job is the tuple cast. `as const` on the literal, or typing the literal directly, would say the
  same thing without the no-op pass. Cosmetic.
