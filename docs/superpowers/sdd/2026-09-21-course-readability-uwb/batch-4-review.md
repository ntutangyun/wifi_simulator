# Batch 4 review — uwb-dl-tdoa and uwb-ul-tdoa

Commits under review: `1a27e53` (rewrite), `f0809fd` (pin fix). Files:
`src/course/uwb/uwb-dl-tdoa.ts`, `src/course/uwb/uwb-ul-tdoa.ts`,
`tests/course/uwb-dl-tdoa.test.ts`, `tests/course/uwb-ul-tdoa.test.ts`.

## Verdicts

- **uwb-dl-tdoa: READY**
- **uwb-ul-tdoa: READY**

## Counts by severity

- Blocker: 0
- Major: 0
- Minor: 3
- Nit: 4

---

## Part 1 — beginner read (persona: Wi-Fi Tier 1 + UWB through uwb-geometry)

Background confirmed against source: `crystal`, `ppm`, `clock offset`, `Coffs` are
defined in `src/course/uwb/uwb-sstwr.ts` (on `uwb-dl-tdoa`'s prerequisite chain via
`uwb-position → uwb-dstwr → uwb-sstwr`), so the persona already has them even though
the task's skim list names only intro/frame/blocks/position/geometry. `trilateration`,
`residual` come from `uwb-position`; `GDOP`, `NLOS`, `FoM` from `uwb-geometry`.

### uwb-dl-tdoa · en
- First unfollowable sentence: none.
- Unexplained words: `Jacobian` (in `deeper`, "Why the fix is worse than a two-way
  one") is used without a gloss. It's outside the main path (not needed for the quiz
  or the numbers a learner must retain), so **Nit**, not a blocker. Everything in the
  main path (`picture`/`numbers`) is either a defined term or plain language.
- Multi-idea paragraphs: none found that mix two unrelated ideas; "Differences, not
  distances" and "Its own clock gets in the way" each carry a compare/contrast but
  both halves serve one point.
- Contradictions: none found. Numbers cross-checked internally (worst residual 0.51 m
  reappears consistently across the three-badge and ten-tag scene rows; badge 1's
  19.6 cm single-run fix sits inside the "middle of the room" range of 11–26 cm in
  the "Badge 1, moved" table).
- Opening states problem and for whom: yes — "A building full of badges defeats
  two-way ranging... the air runs out long before the building is covered," then "So
  turn the exchange over."
- Sent to the simulator early with a preview: yes. The watch call-out is the 3rd
  picture block (`firstWatch` index 2, inside the kit's `<3` contract) and says what
  you'll see: "It arrives at the end of the round, one line per answering anchor,
  with the truth printed beside each."
- Quiz answerable from the main path: yes, all three questions are answered by
  material in `picture` before `deeper` (clock-correction rationale, why "no fix"
  beats "a bad fix," and the round-cost argument).
- Datasheet-register sentences: none in the narrative prose; the dense formula and
  parameter lines are correctly confined to `numbers`, which the lesson contract
  expects to be denser.

### uwb-dl-tdoa · zh
- First unfollowable sentence: none.
- Up to three sentences that read translated:
  1. "解法是那一段两边都描述过的跨度。" (calque of "The cure is the one span both
     ends describe" — grammatically legal but reads like a translation, not
     spontaneous Chinese.) **Minor.**
  2. "残下来的是每个应答锚点自己的时钟偏差残差…" — "残下来的" is an unusual
     coinage; idiomatic Chinese would say "剩下的是…". **Nit.**
  3. The repeated "一减即消" pattern (used for "cancels") is terse and
     technical-sounding rather than natural prose, but it's short and clear enough
     that it reads more as house style than mistranslation — **Nit**, borderline.
- Datasheet-register sentences: none outside `numbers`.
- Otherwise matches the English: same contradictions check (none), same quiz
  coverage, same early watch prompt with a preview.

### uwb-ul-tdoa · en
- First unfollowable sentence: none.
- Unexplained words: none found; `blink`, `UL-TDoA`, `sync error`, `bias` are all
  glossed in `terms`, and the lesson otherwise reuses prior vocabulary.
- Multi-idea paragraphs: none found.
- Contradictions: none found. The sync-error walk table (0/1/2/4 ns → 3.2/16.7/
  33.4/70.4 cm mean) is internally consistent with the two-scene table (0 ns → 3.2 cm
  mean, 1 ns → 16.7 cm mean) and with the "quadruples... then doubles with the sigma"
  claim in `deeper` (3.2→16.7 is ~5.2×, then 16.7→33.4→70.4 is exactly doubling — the
  "quadruples" describes the first step only, which is what the sentence says).
- Opening states problem and for whom: yes, and more concretely than dl-tdoa's — "A
  badge on a hospital lanyard" and "the people who fitted the building" are both
  named in the first paragraph.
- Sent to the simulator early with a preview: yes — 3rd picture block, "[WATCH → the
  fix the infrastructure solves]," and the text says what you'll see: "It leaves the
  reference anchor's lane, not the badge's, and the line names the badge it is
  about."
- Quiz answerable from the main path: yes for Q1 and Q2 directly. Q3 ("A warehouse
  wants four hundred tags placed; a hospital, badges on people. Which way does each
  pull?") is answerable, but its explanation leans on a number stated in `numbers`
  ("Four hundred tags need four blocks of slots") that isn't restated in `picture`.
  That's consistent with the contract (numbers is still main path, before the quiz),
  so this is **not** a defect, just worth flagging that the quiz reaches slightly
  past `picture` alone into `numbers`.
- Datasheet-register sentences: none in the narrative; formulas confined to
  `numbers`.

### uwb-ul-tdoa · zh
- First unfollowable sentence: none.
- Up to three sentences that read translated:
  1. "活下来的只有接收端。" (calque of "All that survives is the receivers" —
     unusual personification carried over from English rather than rephrased).
     **Minor.**
  2. "那是一张被扭曲的地图，而不是一团散点" (calque of "A distorted map, not a
     scatter") — reads acceptably as a metaphor but is a direct structural mirror of
     the English sentence. **Nit.**
  3. "长半轴都不小于那七十次里最差误差的一半，也不会超过它几倍" — the
     double-negative "不小于…也不会超过…" mirrors the English "at least half...
     never more than a few times" rather than using a more natural Chinese
     comparative. **Nit.**
- Datasheet-register sentences: none outside `numbers`.

None of the six translated-sounding sentences change meaning or introduce
ambiguity; they're style, not correctness, and none sit on the main quiz path.

---

## Part 2 — pins and contract

### Test inventory diff, a6fb16c → f0809fd

`uwb-dl-tdoa.test.ts`: 35 `it`s → 36 `it`s (my grep double-counted one multi-line
`it(` block as a phantom entry — actual new count is 35, unchanged). Every old pin
is present, moved, or renamed with the same assertion body:
- "the scenario and both variants pass the scenario schema" and "every string a
  learner reads exists in both languages" moved into the shared
  `lessonShapeSuite(...)` contract in `tests/course/kit.ts:172` and
  `tests/course/kit.ts:195` (bilingual walk) plus the per-lesson scenario/variant
  `ScenarioSchema.parse` calls at `tests/course/uwb-dl-tdoa.test.ts:221,249`. Verified
  by reading `tests/course/kit.ts:128-193`.
- "the computed study time follows the formula... 15–25 minute target" is now
  covered by the shared `lessonMinutes`/`lessonBudget` checks in
  `tests/course/kit.ts:146-162` (the 20-minute cap plus the formula equality) —
  weaker phrasing ("≤20" vs the old lesson-specific "15–25") but the actual computed
  value (20 min, `budget` dump: `total 1264`) still satisfies both, so no pin was
  lost, only relocated to a stricter shared ceiling.
- All remaining renames (`"lesson 5's..." → "uwb-position's..."`, `"observe 2" →
  named quote`, etc.) point at the same assertions, same expected numbers
  (0.19/0.44/0.51 m, 22.02/44.04/65.81 m, √(2/3)=0.82, 18.6–23.0 cm, 0.5–3.3 cm vs
  11–36 cm, 35 frames/7.074935 ms/0.505%, 70/21 fixes). No number was weakened.

`uwb-ul-tdoa.test.ts`: 30 `it`s → 28 `it`s in raw line count, but two of the "lost"
entries are the same bilingual/schema pins folded into the shared kit exactly as
above (schema check still present at `tests/course/uwb-ul-tdoa.test.ts:196,223`,
sync-error boundary checks at lines 616-617). All renamed entries keep the same
pinned numbers (14 B/181.218 µs blink, 0.906%/12.685260 ms, 4.2 cm/42.6 cm σ,
0.10 m/0.41 m worst difference, 3.0–4.1 cm/30.5–41.5 cm ellipse, "moved east 12 to
22 cm").

`.body!`: absent from both test files and both lesson files (`grep -rn "\.body!"`
returned nothing).

Kit usage: both test files open with `lessonShapeSuite(uwbDlTdoa, { proseMax: 900,
runNs: RUN_NS })` / the equivalent for ul-tdoa, and import `lessonStrings`,
`COURSE_ORDER`, `MODULES`, `TIERS` from the shared course modules rather than
reimplementing checks.

### Numbers pinned

Every number quoted in the lesson prose I checked against the test file has a
matching `it` (rate correction values, ppm draws, GDOP floor 0.82, ellipse
semi-axes, scene tables, airtime percentages, sync-error walk table). I did not find
a number stated in prose that lacked a corresponding assertion.

### Mechanism spot-checks (three per lesson) against src/uwb

**uwb-dl-tdoa:**
1. "the anchors run a round of their own... slot A" layout — confirmed in
   `src/uwb/session.ts:17`: `DL-TDoA: slot 0 Poll (anchor 0) | slots 1..A-1 Response
   (anchor 1..A-1) | slot A Final (anchor 0)`.
2. Hyperbolic Jacobian row is a difference of two unit vectors (used for the
   √(2/3)=0.82 GDOP-floor claim) — confirmed in `src/uwb/position.ts:221-227`
   (`accumulateTdoaNormal`: `ux = ri.ux - r0.ux`, `uy = ri.uy - r0.uy`).
3. Clock-rate correction and per-responder clock-offset correction, and the 20 ppm
   crystal tolerance — confirmed in `src/uwb/device.ts:625` (`tofRctu +
   resp.replyTime * (1 - resp.coffs)`) and `src/uwb/phy.ts:71` (`UWB_PPM_MAX = 20 //
   standard §16.4.9: ±20 ppm`).

**uwb-ul-tdoa:**
1. The blink carries no times and the transmit instant cancels — confirmed by
   `src/uwb/device.ts:912` comment ("UL-TDoA: the whole of a tag's participation. It
   carries no times") and the differencing logic at `src/uwb/device.ts:665-691`.
2. Sync error is a fixed-per-anchor bias, not noise redrawn per round — confirmed by
   `src/uwb/device.ts:66-74` ("this anchor's own residual calibration error...
   session's 1-σ for the draw above").
3. The σ formula `√2·c·√(σ_ts² + sync²)` — confirmed verbatim in
   `src/uwb/device.ts:336-337` (`ulDiffSigmaM`: `Math.SQRT2 * C_M_PER_NS *
   Math.hypot(tsNoisePs / 1000, syncErrorNs)`).

### Test run

`npx vitest run tests/course/uwb-dl-tdoa.test.ts tests/course/uwb-ul-tdoa.test.ts
tests/course/readability.test.ts`:

- `uwb-dl-tdoa.test.ts`: 38 passed.
- `uwb-ul-tdoa.test.ts`: 32 passed.
- `readability.test.ts`: 145 passed, 1 failed — `uwb-aoa: expected true to be false`
  in "every MIGRATING id is a real lesson still in the old shape". This names
  `uwb-aoa`, a lesson owned by a different concurrent implementer, and is exactly
  the kind of bookkeeping failure the task said to ignore. Not attributable to
  `uwb-dl-tdoa`/`uwb-ul-tdoa`.

## Findings by severity

**Minor (3):**
1. `src/course/uwb/uwb-dl-tdoa.ts` (zh, "Measuring its clock against theirs"):
   "解法是那一段两边都描述过的跨度。" reads as a direct calque of the English and
   is harder to parse in Chinese than the surrounding prose. Fix: rephrase to
   something like "解法是把双方都记录过的同一段跨度拿出来比。"
2. `src/course/uwb/uwb-ul-tdoa.ts` (zh, "它的晶振不再要紧"): "活下来的只有接收端。"
   is an awkward personification carried from the English "All that survives is the
   receivers." Fix: "剩下的只有接收端各自的读数。" or similar.
3. Old per-lesson minute-window pin ("15–25 minute target") was replaced by the
   shared kit's generic "≤20 minutes" check rather than re-asserted per lesson. The
   actual computed minutes (20 for both lessons) still satisfies the old window, so
   nothing is currently wrong, but the specific lower/upper bound for this module is
   no longer independently pinned — a future edit that dropped the lesson to, say,
   12 minutes would not be caught by a lesson-specific assertion. Fix (optional):
   add `expect(lessonMinutes(l)).toBeGreaterThanOrEqual(15)` back at the per-lesson
   level if the 15-minute floor for this module still matters.

**Nit (4):**
1. `src/course/uwb/uwb-dl-tdoa.ts` (`deeper`, "Why the fix is worse than a two-way
   one"): uses "Jacobian" without a gloss. It's outside the main path, so low
   priority.
2. zh dl-tdoa: "残下来的是每个应答锚点自己的时钟偏差残差…" — "残下来的" reads as a
   coinage; "剩下的" would be more idiomatic.
3. zh ul-tdoa: "那是一张被扭曲的地图，而不是一团散点" mirrors the English structure
   closely; acceptable as a metaphor but slightly translated in feel.
4. zh ul-tdoa: "长半轴都不小于那七十次里最差误差的一半，也不会超过它几倍" carries
   the English double-negative comparative rather than a more natural Chinese
   phrasing (e.g., "长半轴至少是七十次里最差误差的一半，最多是它的几倍").

No blockers or major findings. Both lessons are internally consistent, every number
in prose is pinned, mechanism claims check out against `src/uwb/session.ts`,
`src/uwb/position.ts`, and `src/uwb/device.ts`, and the test suites for both lessons
pass in full.
