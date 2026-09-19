# Task 5 review — lesson "One blink per tag" (UL-TDoA, module 14)

Reviewed: `28251be..b4ac444` (one commit, `b4ac444`), against `task-5-brief.md`, `task-5-report.md`,
`task-5-review.diff`, the controller's binding constraints and rulings, Slice 5 (UL-TDoA) of
`docs/superpowers/specs/2026-09-19-uwb-slices-design.md`, the Follow-up ruling in `task-3-report.md`
("honest TDoA ellipses"), the UL parts of `src/uwb/device.ts` / `src/uwb/network.ts` /
`src/uwb/position.ts`, and the house style of `src/course/uwb/uwb-dl-tdoa.ts` +
`tests/course/uwb-dl-tdoa.test.ts` as of `28251be` (plus `task-4-review.md`).

Every reviewed file matches HEAD: none of `src/course/uwb/uwb-ul-tdoa.ts`,
`tests/course/uwb-ul-tdoa.test.ts`, `src/course/lessonKit.ts`, `src/course/lessons.ts`,
`tests/course/uwb-coexist.test.ts`, `tests/fixtures/lesson-hashes.json` appears in `git status`.
The working tree's other changes are the concurrent AoA agent's (`src/uwb/aoa.ts`, `device.ts`,
`network.ts`, `records.ts`, `view.ts`, `format.ts`, `src/ui/format.ts`, `src/model/scenario.ts`);
they were not reviewed and no finding below concerns them. Both commands below, and both probes,
were run while the tree was still clean of those edits.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

One Medium (finding 1: the formula note's "changes not one record here" is false — pinning the
badges' crystals changes 70 records, the badges' own `UWB_TS` tx counters; the test pins only that
the fix errors are unchanged). Everything else is Low.

## Commands

- `npx vitest run tests/course/uwb-ul-tdoa.test.ts tests/course/lessons.test.ts
  tests/engine/lesson-hashes.test.ts` → **3 files, 73 tests, all passing**, exit 0
  (30 in the new lesson test, 42 in `lessons.test.ts`, 1 hash test).
- `npx tsc -b` → clean, exit 0, no output. Nothing to ignore: the run predates the AoA agent's edits.
- Two independent probes (temporary test files, run and deleted; `git status` clean afterwards,
  nothing committed):
  - **ppm probe** — the base run against the run with every badge pinned at ±20 ppm, record for
    record: 2520 records, **70 differ**, all of type `UWB_TS`, e.g.
    `{"t":0,"type":"UWB_TS","node":"badge-1","dir":"tx","peer":"*","frameKind":"uwbBlink","counter":1055768249353}`
    vs `…"counter":603652648098`. See finding 1.
  - **budget probe** — `lessonWords` = **1637**, `lessonMinutes` = **25**, body blocks
    `p, p, table, p, formula, p, table, p, p` (9 blocks: two tables, one formula), exactly as the
    report states.
- Source of truth read directly: `802154-2024` §10.29.1.2.5 from the IEEE corpus
  (`…/references/ieee_standards/text/802154-2024.json`, p. 437).

## Binding constraints — checked one by one

1. **Corner anchors, ten tags, `mode: 'ul-tdoa'`.** `UL_ANCHORS` = (0.5, 0.5), (9.5, 0.5),
   (0.5, 7.5), (9.5, 7.5) at z 2.2; ten `badge-*` at `TAG_SPOTS`, z 1.0. Pinned *against the other
   lessons' own scenarios*, not against transcribed numbers: `TAG_SPOTS` is compared with lesson 6's
   exported `DL_TAG_SPOTS`, and the anchors against `uwbDlTdoaScenario('ten')`'s nodes. `mode`,
   `nlos` and every other session field pinned against `DEFAULT_UWB_SESSION`, with
   `n.uwb?.ppm === undefined` for every node in both scenes.
2. **Variant `syncErrorNs: 1`, label "1 ns of sync error" / 1 ns 的同步误差.** `toEqual` on the label;
   one variant only; a JSON strip-compare pins that the variant changes nothing else.
3. **`id 'uwb-ul-tdoa'`, module 14.** Pinned, plus `MODULES[14]`, `TIERS[5].track === 'uwb'`, the
   predecessor (`uwb-dl-tdoa`) and the still-unauthored successor (`uwb-aoa`).
4. **4 observe + 2 tryThis + 3 quiz, `lessonMinutes` ≤ 25 (1637 words accepted).** All pinned;
   measured 1637 / 25 with the 1724 ceiling pinned and its arithmetic re-derived in the test.
   5 jumps, each found in the base run, in order, at t = 0, 0, 181 234 ns, 2 ms, 2 ms.
5. **Fixture additions only, two keys.** `+"uwb-ul-tdoa": "1cfd27f7"` and
   `+"uwb-ul-tdoa#0": "1cfd27f7"`; no other line in `lesson-hashes.json` moved. Identical digests
   accepted per the ruling, and the lesson earns them: the test pins that the two scenes' air is
   byte-for-byte equal (`airNs(recs('sync')) === airNs(rs)`), which is the same claim.
6. **The ellipse first-order.** `:130` — "it is first-order — a bias is not white noise — so read it
   as how far the fix may be off, not as a 68 % interval", the same wording as `device.ts:209`'s
   comment and lesson 6's closing caveat. Pinned, and backed by two measured relations (semi-major
   ≥ worst/2, min semi-major ≥ worst/3 in both scenes).
7. **Compare errors, never raw GDOP across solvers.** No cross-solver GDOP anywhere. GDOP appears
   only inside this lesson's own solver (0.85 in the middle, 3.43 at (9.8, 0.2)); the UL/DL
   paragraph explicitly says the choice "is mostly not a question of accuracy" and compares
   *airtime* (0.505 % vs 0.906 %) and slot count, not error. See finding 7 for the report's
   over-statement here.
8. **§10.29.1.2.5, first case.** Verified against the standard itself: "In one case a message is
   periodically broadcast by the mobile device to multiple fixed nodes that are synchronized in some
   way so that the arrival times can be compared. Typically, the message sent by the mobile device
   is referred to as a blink." The lesson's rendering (`:89`) is accurate and is the complement of
   lesson 6's "second case". Seven `toContain`s pin it on the shipped string.
9. **Model tags: blink size, wired sync, ellipse.** All three owned in the source sentence and
   pinned. See finding 8 for a note on wired sync (the standard names it too).
10. **ZH parity.** The house-style walker (> 40 L10n pairs, both non-empty, ZH ≠ EN for any EN with
    two words) plus `uwbFixRow(..., STRINGS.zh.uwb).method === '上行到达时间差 (UL-TDoA)'`. I also
    checked the numbers by hand paragraph by paragraph: every figure in the EN appears in the ZH
    (14 octets / 181.218 µs / 12.685 260 ms / 29.98 cm / the four draws / 1.15 ns / the seven
    readings / 12–22 cm / 0.505 % / 一百 / the 0-1-2-4 ns walk / 45.3 cm), and nothing is added.
11. **Pure predicates, no `any`, no `as unknown as`.** `firstUwbUlRound` is a one-line pure
    predicate mirroring `firstUwbDlRound`, with the same comment shape. `grep -n '\bany\b|as unknown
    as|@ts-'` over both new files: no hits. Casts in the test are all narrowing type predicates
    (`(r): r is Extract<TLRecord, {type: K}>`) or `NodeCfg`/`Scenario`-typed returns.
12. **Seam-assertion edit limited to one line.** `uwb-coexist.test.ts` changes `after.slice(3)` →
    `after.slice(4)` — one assertion line — plus the comment line directly above it, which would
    otherwise say "the three with no lesson yet" about one lesson. Within the ruling's intent; noted
    in finding 7 only because the report calls it "the one-line tail assertion … with its comment"
    while the diff is 2 lines.
13. **Engine ground truth.** `drawnOffsetNs` replays exactly what `network.ts:99–107` does
    (`root.fork(hashStr('<id>#uwb'))` → `UwbClock.fromRng(rng, undefined)` → `gaussian(rng) *
    syncErrorNs`, anchors only, ul-tdoa only), so the four quoted draws are checked against the draw
    and again through the physics. `ulSigmaM` is `device.ts:215`'s `ulDiffSigmaM` re-derived from
    `DEFAULT_UWB_SESSION`, not transcribed. `roundPlan` supplies the 100-badge ceiling.

## Findings

### 1 · Medium — "changes not one record here" is not what the engine does

`src/course/uwb/uwb-ul-tdoa.ts:112` (EN) and `:113` (ZH, "在这里它连一条记录也改变不了"):

> The ±20 ppm §16.4.9 allows a badge, which cost the previous lesson its centrepiece, **changes not
> one record here.**

The pin (`"no interval is measured on anybody's crystal"…`) compares `fixErrM(off)` with
`fixErrM(recs('base'))` — the fixes, not the records. Record for record, the ppm-pinned run differs
from the base run in **70 records**: every badge's own `UWB_TS { dir: 'tx', frameKind: 'uwbBlink' }`,
whose `counter` comes from `this.clock.counter(...)` at `device.ts:707`/`:833`. Two reasons, both
real: a pinned `ppm` changes the rate the counter is scaled by, and `UwbClock.fromRng` with a given
`ppm` consumes one rng draw instead of two, so the origin differs as well.

Measured (probe, base vs badges pinned at ±20 ppm, 1.3 s):

```
total 2520  differing 70  types: UWB_TS
badge-1 tx blink t=0  counter 1055768249353  ->  603652648098
```

The lesson's *point* survives untouched — the badge's crystal reaches no difference, no fix and no
anchor stamp — but the sentence as written is a stated-vs-simulated drift, and it is the one
sentence in the lesson a sceptical reader would go and check. It is also the sentence whose pin is
weakest relative to its claim.

Suggested repair (either is enough, both are one line):
- reword to what is pinned and true — e.g. "changes not one difference and not one fix here", or
  "…reaches nothing the fix is built from: not one stamp, not one difference, not one position"; or
- keep the sentence and widen the pin to the records, excluding the badges' own tx counters
  (`records.filter(r => !(r.type === 'UWB_TS' && r.dir === 'tx'))` compared with `toEqual`), which
  would then *also* pin the interesting half of the claim.

The ZH must move with the EN.

### 2 · Low — quiz 1's explanation drops "up to" from lesson 6's 6 ms

`:174`: "In DL-TDoA the badge subtracts two of its own arrivals 6 ms apart, so its rate error
multiplies that gap." In lesson 6 the responders sit in slots 1–3, so the arrivals being subtracted
are 2, 4 **or** 6 ms apart, and that lesson says "up to 6 ms apart" (`uwb-dl-tdoa.ts:123`, and its
quiz option at `:189`). Six milliseconds is the worst case, not the case. Adding "up to" restores
parity with the lesson the question refers back to; nothing else changes.

### 3 · Low — observe 4 writes "+0.12" where the inspector prints "0.12 ns"

`:156`: "three time differences, whose errors after seven blocks are +0.12, +0.11 and +0.09 ns".
`uwbTdoaRows` formats with `ns(...)`, which prints a leading minus but no leading plus — the pinned
strings are `['0.12 ns', '0.11 ns', '0.09 ns']`. Try-this 1, two hundred words later, quotes the same
column verbatim including its minus signs ("−0.99, −0.37 and −0.36 ns"), so the two passages set
different expectations about what the panel shows. Prose signs are defensible (the sign is the
point); if they stay, the sentence reads more safely as "are +0.12, +0.11 and +0.09 ns — all three
positive" or simply without the plus signs.

### 4 · Low — "the log … put[s] it on the badge" is true of the text, not of the lane

`:105`: "each says whose it is, so the log, the inspector and the overlay all put it on the badge."
For the inspector and the overlay this is exactly right and pinned: `view.ts:81` routes by
`vs.nodes[r.of ?? r.node]`, and observe 4 pins the badge's rows and anchor 1's empty lane. The log
is different: the record's `node` is `anchor-1`, and the line observe 3 pins verbatim *begins*
"anchor-1 position of badge-1 …" — the log names the badge rather than placing it there. The
sentence is one clause away from being exact ("the log names it, the inspector and the overlay place
it"), and observe 3 already shows the learner the anchor-1 prefix.

### 5 · Low — one empirical sentence about the editor is unpinned (and true)

Try-this 2 (`:162`) opens with "In the editor, the anchor sync error field is live in UL-TDoA only."
Verified by reading `src/uwb/ui/UwbSessionFields.tsx:92–97`: `disabled={oneWay !== 'ul-tdoa'}`, title
`E.uwbSyncErrorHint` vs `E.uwbUlOnly`, label "Anchor sync error" / 锚点同步误差, `min 0 max 10`, so the
0/1/2/4 ns walk is inside the field's range. No test asserts it — here or anywhere
(`tests/editor/uwb-planOps.test.ts` pins `uwbModePatch`/`uwbSessionIssue`, not the field's
`disabled`). It is the only empirical sentence in the lesson with no pin. Lesson 6 has no editor
sentence, so there is no precedent either way; flagging so the controller can decide whether the
claim→pin rule reaches UI affordances.

### 6 · Low — three stale quotations inside the test

The test quotes the shipped strings everywhere it asserts, which is the house style and is what
makes it readable. Three *non-asserting* quotations have drifted from the final text and should be
re-synced so a later reader does not trust them:

- test title `'"The ellipse does grow with the sync error, tenfold"…'` — the shipped sentence is
  "The ellipse grows tenfold with it, from the same σ" (`:130`).
- comment in observe 4's test: `// "Then open anchor 1, which did every bit of that arithmetic…"` —
  shipped: "which did all of that arithmetic" (`:157`).
- comment in the scene test: `// "at the default of 0 ns the anchors are perfect"` — shipped: "the
  default of 0 ns makes them perfect" (`:116`).

### 7 · Low — two bookkeeping corrections to the report

- "Errors are compared with lesson 5/6, never raw GDOP across solvers." The second half holds (see
  constraint 7). The first half does not: the lesson makes **no** numeric error comparison with
  lessons 5 or 6. `UL_ANCHORS`' doc comment says the comparison is one the lesson "is entitled to
  make", and the only cross-lesson number that ships is lesson 6's 0.505 % airtime. Nothing needs to
  change in the lesson — the UL/DL paragraph deliberately argues cost and privacy, not accuracy —
  but the constraint should not be recorded as met by a comparison that is not there.
- "the one-line tail assertion `after.slice(3)` → `after.slice(4)` … with its comment" is a 2-line
  diff in `uwb-coexist.test.ts` (assertion + the comment above it, which had to change from "the
  three with no lesson yet" to "the one"). Within the ruling's intent; recorded for the ledger.

Everything else in the report reproduces exactly: 1637 words / 25 minutes / 87 words of slack, the
two-scene table, the four draws, the seven readings and their −1.15 mean, the 12–22 cm east shift,
the 0/1/2/4 ns walk, 12.685 260 ms / 1.812 180 ms / 0.906 % / 9.06 %, the two fixture keys and the
one new predicate.

### 8 · Low (informational) — the standard does mention wired sync

The source sentence (`:89`) assigns "the anchors' common timebase, its wired-sync calibration and
the fixed residual error each anchor is left with" to the model. §10.29.1.2.5 itself says:
"Synchronization of fixed nodes can be achieved by a wired distribution of the clock signals.
However wireless synchronization schemes are also practical." So wired sync is named by the
standard; what is genuinely the model is the *residual* (`syncErrorNs`), its per-anchor fixed draw
and its size. The brief, the plan and README:112 all say "wired sync is model", so the lesson is
following its instructions and is erring conservatively (claiming less standard backing than it
has) — no change unless the controller wants the attribution tightened across all four places at
once. Related and correct: the standard's RFID blink "can be as short as 12 octets", and the
lesson's 14 octets are owned as the model's.

## Claim → pin table

Every number and every empirical sentence a learner reads. Line numbers are
`src/course/uwb/uwb-ul-tdoa.ts`; "Pin" names the test in `tests/course/uwb-ul-tdoa.test.ts` unless
stated. "Derived" means the test builds the string from the run (or from an engine export) and
compares it with the shipped cell rather than with a literal.

| # | Claim (where) | Pin | OK |
|---|---|---|---|
| 1 | §10.29.1.2.5, first case: a mobile node transmits, synchronised fixed nodes receive, the differences place it; blink size, no times, common timebase, wired sync and the residual are the model's (`:89`) | "names the clause it leans on…" — seven `toContain`s on the shipped string; checked against the standard's own text (p. 437) | ✓ (finding 8) |
| 2 | Lesson 6's room: four corner anchors in the 10 × 8 m lab at 2.20 m, ten badges at 1.00 m, the same ten spots (`:93`) | "is lesson 6's four corner anchors and its ten spots…" — compared against `uwbDlTdoaScenario('ten')` and exported `DL_TAG_SPOTS`; `s.rooms` pinned | ✓ |
| 3 | None of the spots is under an anchor (`:54` doc, scene) | same test — `min(plan gap) > 0.7 m` | ✓ |
| 4 | A badge is the only thing that transmits; one slot of 2 ms per 200 ms block; 70 TX in 1.3 s, all blinks (`:93`, observe 1) | "spends one 14-octet blink per badge per block and nothing else" — first block's `TX_START` = the ten badges in order, 70 total, all `badge-*`; `UWB_RANGE`/`UWB_TIMEOUT` empty | ✓ |
| 5 | Fourteen octets, 181.218 µs, broadcast, no times inside (`:93`, `:99`) | same test — `UWB_BLINK_BYTES === 14`, `uwbPpduNs(14) === 181_218`, every frame's `bytes`/`txTimeNs`, `dst === '*'`, `ies === ['BLINK']`, `9 + 3 + 2 === 14` | ✓ |
| 6 | Then its radio is off until the next block (`:93`) | "its radio is off until the next block" — `MAC_STATE` for badge-1 is exactly tx@b·200 ms, idle@+181 218 ns, seven times; no badge ever stamps an rx | ✓ |
| 7 | 70 transmissions, 12.685 260 ms of air (`:93`) | "70 transmissions … 12.685 260 ms of air" — summed from `frame.txTimeNs`, and from `BLOCKS × BADGES × uwbPpduNs` | ✓ |
| 8 | Ten badges, one block: 1.812 180 ms, 0.906 % (`:101`) | same test — derived per block and `toFixed(3)`-compared with the shipped cell | ✓ |
| 9 | The block's ceiling: 100 badges (240 000 ÷ 2 400 RSTU), 9.06 % (`:102`) | "a badge owns one slot of 2 ms per 200 ms block…" — `roundPlan` gives `roundsPerBlock = floor(blockRstu/slotRstu) = 100`; `blockRstu`/`slotRstu`/`rstuNs` pinned; 9.06 % derived | ✓ |
| 10 | One badge, one block = 1 slot of 2 ms, 1 frame (`:100`) | same test — `plan.slots === 1`, `slotNs === roundNs === 2 ms`, and every `UWB_ROUND` in both scenes (70 of them) has `mode 'ul-tdoa'`, `slots 1`, the right `untilNs` | ✓ |
| 11 | Nothing answers a blink; every anchor that hears it stamps the arrival (`:105`) | rows 4 + 13 — no anchor ever transmits, four rx stamps per blink | ✓ |
| 12 | Anchor 1, the reference, subtracts its own stamp from each of the other three; three differences and one position leave its lane, each named `of` a badge (`:105`) | "the reference anchor emits three differences and one fix per blink" — 210 `UWB_TDOA` all `node === ref === anchor-1`, peers in order, 70 `UWB_POSITION` all `node === ref`, `method === 'ul-tdoa'`, `of` = each badge, `anchors` = the four | ✓ |
| 13 | The log, the inspector and the overlay all put it on the badge (`:105`) | observe 3 (`fmtRecord` verbatim) + observe 4 (view replay: badge holds the rows and the fix, `ref.position === null`, `ref.tdoa === {}`); routing at `view.ts:81` | ✓ text / lane (finding 4) |
| 14 | The badge has no receiver open and gets nothing back (`:105`) | "its radio is off…" — every badge `UWB_TS` has `dir === 'tx'` | ✓ |
| 15 | `arrival_i = t_blink + d/c + noise_i + offset_i`; `Δ_i = arrival_i − arrival_ref` (`:109`) | not asserted as text; read against `device.ts:590–594` and the ul-tdoa branch at `:602–610` — identical, including that the calibration removes the anchor's own ppm and leaves `syncOffsetNs` | ✓ (by inspection) |
| 16 | No interval on anybody's crystal, so no clock-rate correction; `t_blink` cancels (`:112`) | "no interval is measured on anybody's crystal" — badges pinned at ±20 ppm reproduce the base fix errors exactly; `tdoaClockCorrection` pinned at its default | ✓ |
| 17 | The ±20 ppm §16.4.9 allows a badge changes **not one record** here (`:112`) | same test — fix errors only; probe shows 70 `UWB_TS` tx counters do change | ✗ **finding 1** |
| 18 | One nanosecond is 29.98 cm of pseudo-range (`:116`) | "One nanosecond is 29.98 cm" — `C_M_PER_NS * 100` derived | ✓ |
| 19 | `syncErrorNs` is the 1-σ of the calibration; each anchor draws one fixed residual once; the default 0 ns makes them perfect (`:116`) | "the four draws come out…" (replay of `network.ts`'s own draw) + the scene test (`DEFAULT_UWB_SESSION.syncErrorNs === 0`, base 0, variant 1, strip-compare) | ✓ |
| 20 | The four draws: +0.14, −0.97, −0.34, −0.31 ns (`:116`) | "the four draws come out +0.14, −0.97, −0.34 and −0.31 ns" — `seed 7` asserted, `Rng.fork(hashStr('<id>#uwb'))` → `UwbClock.fromRng` → `gaussian·σ`, the order `network.ts:99–107` takes; and `·0` gives exactly 0 | ✓ |
| 21 | Badge 1 against anchor 2 reads ≈1.15 ns short in every round (`:116`) | "badge 1's difference against anchor 2…" — the seven values, their mean, all negative, agreement with the *draw difference* to inside one subtraction's σ, and the base run's same seven changing sign with \|mean\| < 0.1 ns | ✓ |
| 22 | Two-scene table: σ 4.2 / 42.6 cm; worst difference 0.10 / 0.41 m; fix 0.2–7.7 mean 3.2 / 10.4–27.9 mean 16.7 cm; ellipse 3.0–4.1 / 30.5–41.5 cm (`:124`, `:126`) | "the two-scene table is what seven blocks produce…" — every one of the eight cells **derived** from the run (or from `ulSigmaM`) and compared with the shipped string, then the two rows re-asserted literally | ✓ |
| 23 | σ = √2·c·√(σ_ts² + sync²), and every difference and every fix in both runs is inside 4σ (`:130`) | same test — `ulSigmaM` built from `DEFAULT_UWB_SESSION.tsNoisePs` (= `device.ts:215`), max difference and max fix error < 4σ in both scenes | ✓ |
| 24 | Timestamp noise is redrawn per blink, a calibration offset is not; the seven readings −1.18, −1.28, −1.16, −1.11, −1.12, −1.18, −0.99 ns, never the other way (`:130`) | row 21's test, which asserts the seven strings and `every(v => v < 0)` | ✓ |
| 25 | At 1 ns all ten badges are pushed east, 12 to 22 cm on average: a distorted map, not a scatter (`:130`) | "all ten badges are pushed east…" — every badge's mean `dx > 0`, min/max → '12'/'22'; the base run's means < 3 cm and mixed in sign | ✓ |
| 26 | The ellipse grows tenfold, from the same σ, and is first-order — how far the fix may be off, not a 68 % interval (`:130`) | "the ellipse does grow…" — mean semi-major ratio in (9, 11), `ulSigmaM(1)/ulSigmaM(0)` close to it, and in both scenes max semi-major > worst/2, min > worst/3 | ✓ (title quote: finding 6) |
| 27 | A listening round costs 0.505 % of the block whether three badges hear it or three thousand (`:134`, quiz 3) | "a listening round costs the anchors 0.505 %…" — a **fresh run** of lesson 6's ten-badge scene, derived to '0.505', and its air equal to the three-badge scene's | ✓ |
| 28 | A blink costs one slot each and the block runs out at a hundred (`:134`, quiz 3) | same test — `roundsPerBlock === 100`, UL duty > DL duty; "quiz 3's four hundred tags" — `400 / 100 === 4` | ✓ |
| 29 | A blink is a broadcast that names its sender; a listener cannot be counted (`:134`) | row 5 (`dst === '*'`, `src` = the badge) + row 14 (badges never receive) | ✓ |
| 30 | Observe 1: the round line, the blink line, MAC tx→idle, badge 2's round at 2 ms, all 70 TX_START belong to a badge (`:150`) | "observe 1 quotes the lines `fmtRecord` prints" — both lines compared verbatim with `fmtRecord`, plus rows 4 and 6 | ✓ |
| 31 | Observe 2: four RX RMARKERs at 181.234 / 181.237 / 181.240 / 181.242 µs, anchors 1, 3, 2, 4, in distance order from (4, 3.5), eight ns end to end (`:152`) | "observe 2: four stamps, in distance order…" — exact `t` array, node order, `peer`, the 8 ns span, and a 3-D distance sort recomputed from the scene | ✓ |
| 32 | Observe 3: the three differences at 2.000 000 ms (5.33/5.39, 2.49/2.29, 7.19/7.15) and the position line (4.02, 3.46), error 0.05 m, GDOP 0.85 (`:154`) | "observe 3: the differences and the fix at 2.000 000 ms" — two `fmtRecord` lines verbatim, the middle pair as `toFixed(2)` | ✓ |
| 33 | Observe 4: no distances; three differences, errors +0.12/+0.11/+0.09 ns after seven blocks; fix 2.1 cm, GDOP 0.85, ellipse 3.2 × 1.7 cm, UL-TDoA; anchor 1's lane empty (`:156`) | "observe 4: the badge's lane holds it all…" — view replay through `uwbTdoaRows`/`uwbFixRow`, both languages' method string, `rounds === '7'`, ref lane null/empty | ✓ (sign style: finding 3) |
| 34 | Try-this 1: nothing on the air changes — the same 70 blinks, the same 12.685 260 ms (`:160`) | row 7's test — `airNs(recs('sync')) === airNs(base)`, and the shipped sentence asserted | ✓ |
| 35 | Try-this 1: badge 1's errors −0.99, −0.37, −0.36 ns; fix 12.7 cm; ellipse 32.1 × 16.8 cm; 10.4–27.9 vs 0.2–7.7 cm, mean 16.7 vs 3.2 (`:160`) | "try-this 1: the 1 ns scene, badge 1's rows and the whole spread" — view replay of the sync run + row 22 | ✓ |
| 36 | Try-this 2: the walk 0/1/2/4 ns → means 3.2, 16.7, 33.4, 70.4; worst 7.7, 27.9, 54.4, 135.3; linear once clear of the timestamp noise (`:162`) | "try-this 2: the sync-error walk is linear…" — four runs (two fresh), both arrays derived, each inside 4σ(ns), doubling ratios pinned in (1.9, 2.2) and the 0→1 jump > 4 | ✓ |
| 37 | Try-this 2: at (9.8, 0.2) GDOP 0.85 → 3.43, ellipse 32 cm → 1.4 m, worst of seven 45.3 cm (`:162`) | same test — a fresh run with badge 1 moved: `gdop 3.43`, semi-major 143.5 cm → "1.4", worst 45.3 cm, and the sync run's own 0.85 | ✓ |
| 38 | Try-this 2: the anchor sync error field is live in UL-TDoA only (`:162`) | none — true at `src/uwb/ui/UwbSessionFields.tsx:95` (`disabled={oneWay !== 'ul-tdoa'}`), verified by reading | ✓ by inspection (finding 5) |
| 39 | Quiz 1: the badge's ±20 ppm does not matter because both subtracted instants are anchor stamps on one timebase; DL subtracts two of its own arrivals 6 ms apart (`:167`–`:174`) | row 16 for the mechanism; the 6 ms belongs to lesson 6 (`uwb-dl-tdoa.ts:123`, pinned there) | ✓ ("up to": finding 2) |
| 40 | Quiz 2: a bias does not average down — 1.15 ns in all seven rounds, all ten badges the same way; averaging removes the 4 cm and leaves the 30 cm (`:177`–`:184`) | rows 21, 24, 25; the 4 cm and 30 cm are rows 22 and 18 rounded | ✓ |
| 41 | Quiz 3: scale and privacy both pull to DL (0.505 % vs a slot per tag, a hundred per block); four hundred tags need four blocks (`:187`–`:194`) | rows 27, 28, 29 + "quiz 3's four hundred tags need four blocks of slots" | ✓ |
| 42 | Determinism: both scenes replay bit for bit | "replays bit-for-bit, in both scenes" — a second `Simulation` compared with `toEqual` | ✓ |

## What is good

- The bias is established **three** independent ways — replayed from the engine's own rng stream,
  measured as a one-signed 1.15 ns offset through seven rounds, and seen on the floor as a 12–22 cm
  eastward shift of all ten badges — and each way is pinned. That is the strongest evidence block in
  the UWB track so far, and it is what makes "a distorted map, not a scatter" land.
- Every table cell in both tables is derived from the run and compared with the shipped string, so
  the tables cannot rot silently.
- The 0.505 % comparison is a *fresh run* of lesson 6's scene, not a transcribed number — exactly
  the rule the controller set after task 3.
- The two identical hashes are earned rather than excused: the equal-air assertion is the lesson's
  own claim, pinned.
- The scene is pinned against lesson 5's and lesson 6's exported scenarios rather than against
  copied coordinates, so the "same room, same spots" claim cannot drift when those lessons move.

---

## Re-review (fix round 1)

Scope: `b4ac444..5176a49` (one commit, `5176a49`, **lesson + test only** — 14 lines in
`src/course/uwb/uwb-ul-tdoa.ts`, 56 in `tests/course/uwb-ul-tdoa.test.ts`; nothing else in the
package touches the UL lesson). Both files match HEAD — neither appears in `git status`, whose only
entries are the AoA agent's work (`src/uwb/aoa.ts`, `device.ts`, `network.ts`, `records.ts`,
`view.ts`, `scene.ts`, `format.ts`, `rows.ts`, the three UWB UI files, `i18n.ts`,
`src/model/scenario.ts` and their tests), not reviewed here.

### Verdict

Spec: APPROVED
Quality: APPROVED

No remaining findings. Two informational notes carried forward (neither blocks, neither is new
code): the report bookkeeping of round-1 finding 7, and the word budget below.

### Commands

- `npx vitest run tests/course/uwb-ul-tdoa.test.ts` → **30 tests, all passing**, exit 0.
- `npx tsc -b` → clean, exit 0 (run with the AoA agent's working-tree edits present; nothing to
  ignore, no errors anywhere).
- Budget probe (temporary file, deleted; tree unchanged): `lessonWords` **1694**, `lessonMinutes`
  **25**.
- `src/engine/simulation.ts:347` read to confirm what the timeline hash digests.

### Item by item

1. **Medium (finding 1) — fixed, and the new sentence is stronger than the old one.**
   `:112`/`:113` now read: "Pin all ten badges at either end of the ±20 ppm §16.4.9 allows … and the
   run comes back the same: every record at the same instant and of the same type, and the same
   seventy fix errors. The only thing that moves is the counter a badge writes into its own
   transmit stamp, which nothing here reads." Every clause is pinned in
   "the badges' crystals move the counters they write and nothing else whatever":
   - `timelineHash()` equal between the two runs — and `updateHash` digests exactly
     `` `${r.t}:${r.seq}:${r.type}` `` (`simulation.ts:347`), so the hash **is** the "same instant,
     same type, same order" claim rather than a proxy for it;
   - `off.length === base.length` and `off.map(r => [r.t, r.type])` `toEqual` the base's — the same
     claim again, spelled out, so a reader need not trust the hash;
   - `fixErrM(off)` `toEqual` the base's, and `toHaveLength(70)` — "the same seventy fix errors";
   - the index-aligned `differing` set has length exactly 70 and every member is
     `UWB_TS`, `dir 'tx'`, `node.startsWith('badge-')` — "the only thing that moves", and by
     construction every difference, fix and anchor stamp is byte-identical.
   This reproduces my round-1 probe exactly (2520 records, 70 differing, all badge tx `UWB_TS`), and
   "which nothing here reads" is now the pinned fact that those 70 records are the *only* ones that
   move. `prose()` still pins "No interval is measured on anybody's crystal". ZH carries the whole
   sentence, clause for clause ("每一条记录都在同一时刻、是同一类型，七十次定位的误差也一模一样。
   唯一会变的，是胸牌写进自己那条发送时间戳里的计数值，而这里没有谁会去读它").
2. **Low 2 — fixed.** Quiz 1's explanation: "two of its own arrivals, **up to** 6 ms apart";
   ZH "最多相隔 6 ms". Parity holds, and it now matches lesson 6's own wording.
3. **Low 3 — fixed.** Observe 4: "errors after seven blocks are 0.12, 0.11 and 0.09 ns — **all
   three positive**"; ZH "0.12、0.11 与 0.09 ns，三个都是正的". Pinned twice: the new `toContain`, and
   `rows.every(r => !r.error.startsWith('+'))`, which pins the panel's format so the prose cannot
   drift back.
4. **Low 4 — fixed.** `:105`: "so the log names the badge and the inspector and the overlay place
   it there"; ZH "日志会点出那个胸牌的名字，检视面板与叠加层则把它放到那个胸牌身上". This is now exactly
   what observe 3 (`fmtRecord` begins "anchor-1 …of badge-1") and observe 4 (`view.ts:81` routing)
   pin.
5. **Low 5 — addressed as far as a course test reaches, and honestly labelled.** Try-this 2's
   editor sentence is now `toContain`-pinned, with the label in both languages
   (`Anchor sync error` / 锚点同步误差), the "only UL-TDoA uses this" tooltip (`i18n.ts:391`), and the
   walk's range: `ScenarioSchema.parse(withSync(0|1|2|4))` passes and `withSync(11)` throws, which
   is the field's own `max={10}`. The comment states plainly that the `disabled` binding itself
   belongs to the editor's tests. That is the right split; no further action.
6. **Low 6 — fixed.** All three stale quotations re-synced: the test title is now "The ellipse grows
   tenfold with it, from the same σ", and the two comments read "which did all of that arithmetic"
   and "the default of 0 ns makes them perfect".
7. **Low 7 — ledger only, nothing to change in code.** The report's "errors are compared with lesson
   5/6" is still not what the lesson does (it compares airtime and slot cost, deliberately), and the
   coexist seam edit is still a 2-line diff. Both are recorded here for the ledger; the fix commit
   correctly left them alone.
8. **Low 8 — informational, unchanged as intended.** Wired sync stays attributed to the model,
   consistent with the brief, the plan and README:112.

### Checks the fix could have broken, and did not

- **EN/ZH parity.** Walked all four changed passages by hand: every number and every clause in the
  new EN appears in the new ZH and nothing is added on either side. The house-style parity test
  (> 40 pairs, both non-empty, ZH ≠ EN) still passes.
- **`lessonMinutes` ≤ 25.** Still 25, and the 1724-word ceiling is still pinned. Note for the
  controller: the invariance sentence cost 57 words, so `lessonWords` is now **1694** — **30 words
  of slack** where round 1 had 87. Any further prose addition to this lesson has to trade against
  something.
- **Nothing else moved.** The scene, both tables, the four draws, the seven readings, the east
  shift, the sync walk, the 0.505 % comparison, the determinism test and the fixture are untouched;
  30 tests (unchanged count) pass, and no lesson hash could move because no scenario changed.
