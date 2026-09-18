# Task 8 review — course track seam, lesson kit, lesson "Timestamps, not throughput"

Reviewed: commit `ac21aac` (review package `task-8-review.diff`, `8adab88..ac21aac`), against
`task-8-brief.md`, `task-8-report.md`, and the house style of `src/course/amp/amp-intro.ts` /
`tests/course/amp-intro.test.ts`. Task 9's concurrent work was ignored (the worktree was clean at
review time; only the committed state was read).

## Commands run

- `npx vitest run tests/course/uwb-intro.test.ts tests/course/lessons.test.ts tests/engine/lesson-hashes.test.ts`
  → **3 files / 70 tests passed** (uwb-intro 28, lessons 41, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, exit 0.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

## What was verified as correct

**Course seam — exactly as the brief.** `Track` (`src/course/curriculum.ts:11`), `Tier extends L10n
{ track }`, `TRACKS` with the brief's four strings, `TIERS[4] = { track: 'uwb', en: 'UWB Tier 1 ·
Ranging foundations', zh: 'UWB 第一阶段 · 测距基础' }`, the four existing tiers carrying
`track: 'wifi'`, `MODULES` index 11 `Time of flight` / `飞行时间` and index 12 `Ranging sessions and
positioning` / `测距会话与定位` (both `tier: 4`), and `COURSE_ORDER` gaining the two comment lines
and the five ids verbatim. `CoursePanel.tsx` filters to tiers with a visible lesson *before*
mapping, so "the previous rendered tier" is well defined, and prints `t(TRACKS[tier.track])` at
13.5 px when the track changes (and for the first shown tier) — correct, and the filter-then-map
ordering is the right fix rather than a hack.

**Kit builders.** `anchor(id, name, x, y, z = 2.2, ppm?)`, `uwbTag(… z = 1.0, ppm?)`,
`uwbSc(house, nodes, session = {}, extra = {})` and all eight `firstUwb*` predicates match the
brief's signatures and defaults; `kind: 'uwb'`, `txPowerDbm: -14`, `profiles: ['idle']`,
`caps: { generation: 'nonht', features: {} }` are as specified. Omitting `ppm` when `undefined`
(so the engine draws a crystal) is a sound improvement on the brief's literal `{ role, ppm }`.

**Lesson shape.** `id 'uwb-intro'`, `module: 11`, 4 jumps, 4 observe, 2 tryThis, 3 quiz, variant
label `20 m apart` / `相距 20 m`, both scenarios schema-valid (pinned), `lessonMinutes` = 25 and
inside [15, 25] (pinned), every jump found in the base run (pinned). Controller rulings honoured:
the local `rangingLab()` 22 × 8 m hall, and the poll PSDU quoted as 37.179 µs (the brief's 35.13 is
not present anywhere).

**Fixture.** `tests/fixtures/lesson-hashes.json` adds exactly `"uwb-intro"` and `"uwb-intro#0"`;
no existing key or value is touched (verified from the diff hunk, which is pure `+`).

**Blast radius.** `tests/course/lessons.test.ts` changed only in the one structural expectation
(`TIERS` length 5, its tracks, `MODULES.map(m => m.tier)` gaining two 4s). `lesson-claims.test.ts`
and `quoted-timestamps.test.ts` are untouched and did not need touching — both are hand-written
per-lesson suites, not generic sweeps, so uwb-intro's claims belong in its own file.

**Bilingual fidelity.** A mechanical pass over all 63 `en`/`zh` pairs found **no numeric
divergence**: the four apparent mismatches are word-order differences over identical multisets
(e.g. "0.2 ppm … 2 ms" vs "2 ms … 0.2 ppm") plus one legitimate repetition (`时隙 1，而时隙 1`).
Curly quotes balance exactly (2 `“`, 2 `”`, both in the range-line quotation, EN and ZH). Every ZH
string contains CJK except the two `formula` lines, which are language-neutral by design. The
source-status sentence is present in both languages (`uwb-intro.ts:49–50`).

**Constants vs the engine.** Verified by reading `src/uwb/phy.ts`, `src/uwb/channel.ts`,
`src/uwb/ranging.ts`, `src/uwb/position.ts`, `src/model/scenario.ts`: chip 2.003 ns, RCTU 15.650 ps,
RSTU 833.333 ns, 3.3356 ns/m, 213.1 RCTU/m, 40-bit wrap 17.2 s, SYNC 65.128 / SFD 8.141 / STS gap
1.026 / STS 65.641 / PHR 19.487 / PSDU 37.179 / poll 197.628 µs / RMARKER 73.269 µs, response
187.372 µs, poll 30 octets, arrival 17 ns and 67 ns, response TX at 2 000 000 ns, σ_r = 4.24 cm.
All agree with the prose, and all but the ones listed below are pinned by an assertion that quotes
its sentence. The lesson's claim that the receiver stamps from the *unrounded* flight time is
effectively pinned: a stamp from the rounded 17 ns would give 1086 RCTU, and the test pins 1070.

---

## Findings

### Blocking

**1. `src/course/uwb/uwb-intro.ts:49` — the source-status sentence's two model constants are
unpinned.** The paragraph names "−14 dBm of transmit power, −93 dBm of sensitivity" as the model's
own choices, and the file header (line 8) promises "Every number quoted below is pinned in
tests/course/uwb-intro.test.ts". Neither `UWB_TX_POWER_DBM` (−14) nor `UWB_RX_SENS_DBM` (−93) is
imported or asserted in `tests/course/uwb-intro.test.ts`; the node-shape test
(`uwb-intro.test.ts:67–80`) checks kind, role, ppm, profiles, servers and the session, but not
`txPowerDbm`. The house style does pin its equivalent — `amp-intro.test.ts` imports
`AMP_TAG_DL_SENS_DBM` precisely to guard "the tag's −72 dBm downlink sensitivity". **Why it
matters:** these are the two numbers the lesson invites the learner to argue with; if either model
default moves, the lesson silently lies and nothing fails. **Do:** import both from `src/uwb/phy`
and assert `UWB_TX_POWER_DBM === -14`, `UWB_RX_SENS_DBM === -93`, plus
`s.nodes.every(n => n.txPowerDbm === UWB_TX_POWER_DBM)`.

**2. `src/course/lessonKit.ts:165` — `txPowerDbm: -14` is re-typed instead of imported.** The
engine already exports `UWB_TX_POWER_DBM = -14` (`src/uwb/phy.ts:69`, with the −41.3 dBm/MHz
rationale the kit's doc comment repeats). The kit now holds a second, independent copy of a model
constant, so the lesson's link budget can drift away from the engine's default with no test
failing. **Do:** `import { UWB_TX_POWER_DBM } from '../uwb/phy'` and use it in `uwbNode()`.

**3. `src/course/uwb/uwb-intro.ts:85` + `tests/course/uwb-intro.test.ts:252–260` — "rounded up,
never to nearest" is asserted nowhere.** The prose makes a specific mechanism claim ("the arrival
is scheduled at the next whole nanosecond up — rounded up, never to nearest, so no frame is ever
delivered a hair earlier than physics allows"). The test's comment says "ceil is what the engine
does", but its assertions are `Math.ceil(flightNs) === 17` and `Math.ceil(20 / C_M_PER_NS) === 67` —
arithmetic on literals, not on the engine. Both lesson distances have a fractional part above 0.5
(16.678 → 17, 66.713 → 67), so `Math.round` produces exactly the same 17/67 and every assertion in
the file would still pass if `src/uwb/channel.ts:151` switched from `Math.ceil` to `Math.round`.
**Why it matters:** this is the one sentence in the lesson about *why* the number on the timeline is
17, and its pin has infinite tolerance for the failure it is meant to catch. **Do:** pin the engine
at a distance where the two differ — e.g. run a 1 m or 3 m placement (fraction 0.336 / 0.007) and
assert the gap is `Math.ceil` and strictly ≥ the true flight — or assert
`rxT - txT >= flightNs && rxT - txT < flightNs + 1` for both distances *and* state that the engine
uses ceil by asserting it on a fraction below 0.5.

### Minor

**4. `src/course/uwb/uwb-intro.ts:67–73` — the table's symbol and chip counts are pinned only
indirectly.** The cells claim "SYNC, 64 preamble symbols", "SFD, 8 symbols", "STS, 64 × 512 chips",
"512 chips of silence" and "PHR, 19 symbols". `uwb-intro.test.ts:179–189` asserts each *duration*
against `chipsToNs(SYNC_SYMBOLS * PSYM_CHIPS)` etc. and against the ns literal, but never that
`SYNC_SYMBOLS === 64`, `SFD_SYMBOLS === 8`, `STS_ACTIVE_CHIPS === 64 * 512`, `STS_GAP_CHIPS === 512`
or `PHR_SYMBOLS === 19`. A compensating change (fewer symbols, longer symbol) keeps the durations
and breaks the prose. Five one-line `expect`s close it.

**5. `src/course/uwb/uwb-intro.ts:73` — "the poll, at 6.81 Mb/s" is unpinned and does not reproduce
the 37.179 µs beside it.** `UWB_MBPS = 6.81` exists (`src/uwb/frames.ts:35`) and is what every UWB
frame reports, so the cell is consistent with the simulator — but the PSDU duration comes from
`psduSymbols(30) · DATA_SYMBOL_CHIPS` (240 data bits + 48 RS parity bits + a 2-symbol tail), and a
learner who checks 30 × 8 / 6.81 gets 35.2 µs, i.e. the brief's own wrong figure. The lesson never
mentions the parity or the tail. **Do:** import `UWB_MBPS` and pin it, and add half a clause to the
cell or the RMARKER paragraph ("240 data bits plus 48 parity bits and a 2-symbol tail").

**6. `tests/course/uwb-intro.test.ts:190` — the PSDU row is pinned as a bare literal.** Every other
row derives its duration from the chip constants (`chipsToNs(SYNC_SYMBOLS * PSYM_CHIPS)` …), but the
PSDU is only `expect(durOf('psdu')).toBe(37_179)`. The brief's Step 1 asks for "field durations from
`chipsToNs` of the chip constants". **Do:** add
`expect(durOf('psdu')).toBe(chipsToNs(psduSymbols(30) * DATA_SYMBOL_CHIPS))`.

**7. `src/course/uwb/uwb-intro.ts:49` — "the 200 ms ranging block" has no ns pin.** The session test
pins `blockRstu: 240_000`, and the slot's 2 ms is pinned via
`Math.round(2400 * RSTU_NS) === 2 * MS` (`uwb-intro.test.ts:129`), but the block's conversion to
200 ms is not. One line, mirroring the slot assertion.

**8. `src/course/uwb/uwb-intro.ts:81` — "The Wi-Fi channel delivers a frame at the instant it was
transmitted" is unpinned.** The claim is true today (`src/engine/channel.ts:291` emits `RX_START`
at the transmit instant; no flight term exists anywhere in the Wi-Fi channel, only in
`src/uwb/channel.ts:148`), and it is the whole rhetorical hinge of the section — but no assertion
guards it. A three-line check over any Wi-Fi lesson scenario (`RX_START.t === TX_START.t` for one
data frame) would. The companion "tens of nanoseconds against a 9 µs slot" is likewise unpinned
(`SLOT_NS` is exported and used in `amp-intro.test.ts`).

**9. `src/course/uwb/uwb-intro.ts:85` — "the ranging underneath runs 64 times finer" is unpinned.**
1 ns / 15.650 ps = 63.9, so the sentence is a rounding the prose performs and no test performs.
`expect(Math.round(1 / RCTU_NS)).toBe(64)` closes it.

**10. `src/course/uwb/uwb-intro.ts:28` — `rangingLab()` is lesson-local, and lessons 2–5 will want
it.** The precedent for a lesson-local house exists (`src/course/lessons.ts:1179`), so this is not a
violation, but Task 9 (`uwb-sstwr`) and the three lessons after it need the same 22 × 8 m hall, and
lesson files must not import each other. **Do:** move `rangingLab()` into `lessonKit.ts` beside
`oneRoom()` / `hallwayHouse()` before the second UWB lesson copies it.

**11. `src/course/lessonKit.ts:182–187` — `uwbSc` lets `extra` silently replace the merged
session.** `sc(house, nodes, { uwb: {…DEFAULT_UWB_SESSION, …session}, ...extra })` spreads `extra`
last, so an `extra.uwb` wipes the merge rather than refining it. No caller does this today; a
one-line reorder or a doc-comment note prevents a confusing later bug.

**12. `src/course/uwb/uwb-intro.ts:14` — the header's word count is stale.** It says "around 1680
words"; the report measures 1692, against a 1725 ceiling. `lessonMinutes` is 25, i.e. at the very
top of the allowed band, so the margin is ~33 words. The range is pinned, so this is only a comment
accuracy nit, but the number in the warning should be the measured one.

**13. `src/course/CoursePanel.tsx:148–170` — the track-heading logic has no test.** The repo has no
`CoursePanel` test at all (`tests/ui/` covers format, i18n and lanes only), so this is a pre-existing
gap rather than a regression; the `filter`-then-`map` ordering and the `shown === 0 ||
shownTiers[shown - 1].tier.track !== tier.track` predicate were read and are correct. Worth a small
pure helper (`trackHeadings(tiers)`) if the panel grows a third track.

**14. `tests/course/uwb-intro.test.ts:104` — one `as unknown as L10n` cast in the bilingual
walker.** No `any` and no `@ts-ignore` anywhere in the change (verified); the cast is guarded by a
`typeof` check immediately above it, so it is safe, but a typed predicate
(`(o): o is L10n => typeof o.en === 'string' && typeof o.zh === 'string'`) removes it.

---

## Claim → pin (unpinned or weakly pinned only)

Every other number and empirical sentence in the EN body / observe / tryThis / quiz has an
assertion that quotes it; the table lists only the gaps.

| Claim (file:line) | Pin | Gap |
|---|---|---|
| "−14 dBm of transmit power" (uwb-intro.ts:49) | none | no assertion; `UWB_TX_POWER_DBM` not imported (finding 1) |
| "−93 dBm of sensitivity" (uwb-intro.ts:49) | none | no assertion; `UWB_RX_SENS_DBM` not imported (finding 1) |
| "the 200 ms ranging block" (uwb-intro.ts:49) | `blockRstu: 240_000` (test:78) | RSTU→ms conversion unasserted (finding 7) |
| "SYNC, 64 preamble symbols" (uwb-intro.ts:67) | duration via `SYNC_SYMBOLS` (test:179) | `SYNC_SYMBOLS === 64` unasserted (finding 4) |
| "SFD, 8 symbols" (uwb-intro.ts:68) | duration via `SFD_SYMBOLS` (test:181) | `SFD_SYMBOLS === 8` unasserted (finding 4) |
| "512 chips of silence" (uwb-intro.ts:69) | duration via `STS_GAP_CHIPS` (test:183) | `STS_GAP_CHIPS === 512` unasserted (finding 4) |
| "STS, 64 × 512 chips" (uwb-intro.ts:70) | duration via `STS_ACTIVE_CHIPS` (test:186) | `STS_ACTIVE_CHIPS === 64 * 512` unasserted (finding 4) |
| "PHR, 19 symbols" (uwb-intro.ts:72) | duration via `PHR_SYMBOLS` (test:188) | `PHR_SYMBOLS === 19` unasserted (finding 4) |
| "the poll, at 6.81 Mb/s" (uwb-intro.ts:73) | none | `UWB_MBPS` not imported; 240 b / 6.81 Mb/s ≠ 37.179 µs (finding 5) |
| PSDU 37.179 µs (uwb-intro.ts:73) | `toBe(37_179)` literal (test:190) | not derived from `chipsToNs(psduSymbols(30)·64)` like every sibling row (finding 6) |
| "The Wi-Fi channel delivers a frame at the instant it was transmitted" (uwb-intro.ts:81) | none | true per `src/engine/channel.ts:291`, but unguarded (finding 8) |
| "tens of nanoseconds against a 9 µs slot" (uwb-intro.ts:81) | none | `SLOT_NS` not imported (finding 8) |
| "rounded up, never to nearest" (uwb-intro.ts:85) | `gaps === [17,17]` / `[67,67]` (test:241, 247) | `Math.round` gives the same 17/67 — the pin cannot fail on the drift it guards (finding 3) |
| "the ranging underneath runs 64 times finer" (uwb-intro.ts:85) | none | 1 ns / RCTU_NS = 63.9, rounding unasserted (finding 9) |
| quiz distractor "One chip, 2.003 ns, about 60 cm" (uwb-intro.ts:147) | none | correct (2.003 ns × c = 0.60 m); a distractor, so low value — noted for completeness |

Counts: **3 blocking, 11 minor.**

---

# Re-review (fix round 1)

Scope: commit `557a49f` (`task-8-fix1.diff`, `c68d3a1..557a49f`), against the rulings listed by the
coordinator and the "Fix round 1" section of `task-8-report.md`. Uncommitted work and
`tests/uwb/zz-probe.test.ts` ignored. `npx vitest run tests/course/uwb-intro.test.ts
tests/engine/lesson-hashes.test.ts` → **2 files / 34 tests passed** (uwb-intro 28 → 33), exit 0.

## Verdict

Spec: APPROVED
Quality: APPROVED

## Each ruling, checked

- **Blocking 1 — done, and the pin bites.** `tests/course/uwb-intro.test.ts` imports
  `UWB_TX_POWER_DBM` / `UWB_RX_SENS_DBM`, asserts `-14` / `-93`, asserts
  `s.nodes.every(n => n.txPowerDbm === UWB_TX_POWER_DBM)` for **both** scenarios and
  `[-14, -14]` for the base, and quotes the source-status sentence. A change to either phy default
  now fails.
- **Blocking 2 — done.** `src/course/lessonKit.ts` imports `UWB_TX_POWER_DBM` from `../uwb/phy` and
  `uwbNode()` uses it; the `-14` literal is gone and the doc comment states why. No cycle is
  introduced (`phy.ts` pulls only a `model/scenario` type).
- **Blocking 3 — done, and the pin can now fail on the drift it guards.** The test builds a scratch
  placement from `uwbIntroScenario(5)` with the tag at x = 2 (exactly 1.00 m, flight 3.336 ns),
  runs it through `Simulation`, and asserts the **measured** gap equals `Math.ceil(flight)` and is 4.
  `Math.round` would give 3, so switching `src/uwb/channel.ts:151` to `Math.round` fails this test —
  which the old `Math.ceil(16.678) === 17` arithmetic could not. The added
  `flight ≤ gap < flight + 1` loop over both frames at both lesson distances is a correct second
  guard. Verified by reading the assertion and the engine, not only by the green run.
- **Minors 4, 6, 7, 9 — done as specified.** `SYNC_SYMBOLS === 64`, `SFD_SYMBOLS === 8`,
  `STS_GAP_CHIPS === 512`, `STS_ACTIVE_CHIPS === 64 * 512`, `PHR_SYMBOLS === 19`;
  `durOf('psdu') === chipsToNs(psduSymbols(30) * DATA_SYMBOL_CHIPS)` beside the literal;
  `Math.round(240_000 * RSTU_NS) === 200 * MS`; `Math.round(1 / RCTU_NS) === 64`.
- **Minor 5 — done.** The PSDU cell now reads "the poll at 6.81 Mb/s: 240 data bits, 48 parity bits,
  a 2-symbol tail", so the 35.2 µs trap is closed in the prose, and the new test pins `UWB_MBPS`,
  `poll.frame.mbps`, `RS_PARITY_BITS`, `TAIL_SYMBOLS` and `psduSymbols(30) === 240 + 48 + 2`.
- **Minor 8 — done.** A new test runs the `airtime` lesson's Wi-Fi scenario and asserts every
  `RX_START` of the first five data frames lands exactly at its `TX_START.t`, plus `SLOT_NS === 9 µs`.
- **Minor 10 — done, fixture genuinely untouched.** `rangingLab()` is now an exported, documented
  builder in `lessonKit.ts` beside `oneRoom()`; the lesson imports it and dropped its `brick` import.
  `git diff` shows the commit touches only the three files, `tests/fixtures/lesson-hashes.json` is
  not in it, and `tests/engine/lesson-hashes.test.ts` passes — so the scenario is unchanged.
- **Minor 11 — done.** `uwbSc` now spreads `extra` first and the merged session last; the doc comment
  names `session` as the only merging argument.
- **Minor 12 — done and independently confirmed.** The header says 1694 words. Reproducing
  `lessonWords` over the file (all `en:` strings plus the 56 words in `N()` cells, minus title and
  variant label, which `lessonWords` does not walk) gives **1694**; raw = 1694/150 + 2·4 + 4·2 =
  27.29 → `lessonMinutes` **25**, still ≤ 25, with the stated ~30 words of headroom (ceiling 1724).
- **Minor 14 — done.** The `as unknown as L10n` cast is replaced by a typed `isL10n` predicate. Still
  no `any` and no `@ts-ignore`.
- **Minor 13 — parked by ruling**, not attempted; agreed.

## Nothing regressed

Bilingual fidelity re-checked mechanically on the current file: 63 `en`/`zh` pairs, **no numeric
divergence** (the four flagged pairs are word-order permutations of identical multisets, as before);
curly quotes still balance 2 `“` / 2 `”`; the only CJK-free `zh` strings are the two language-neutral
`formula` lines. The new PSDU clause matches in both languages (6.81 / 240 / 48 / 2 on both sides),
and the three trims that paid for it ("for so little payload", "the rest is schedule") were removed
from the EN **and** the ZH. Every previously verified pin (counters, 1070 RCTU, the 2 187 389 ns
range line, 17/67 ns, 2 000 000 ns, σ_r) is untouched. The commit touches only
`lessonKit.ts`, `uwb-intro.ts` and `uwb-intro.test.ts`; `lessons.ts`, `lessons.test.ts` and the hash
fixture are unchanged.

## Remaining findings (both nits, neither blocking)

**R1. `tests/course/uwb-intro.test.ts` now imports `LESSONS`** (to reach the `airtime` scenario for
the Wi-Fi contrast test), so this lesson's suite depends on every authored lesson compiling — a
broken in-flight lesson file will now redden uwb-intro. `amp-intro.test.ts` imports only its own
lesson. Unavoidable today, since `airtime` is defined inline in `lessons.ts` with no other import
path; worth revisiting only if `airtime` ever moves to its own file.

**R2. `expect(30 * 8).toBe(240)`** is an assertion about literals and can never fail; the meaningful
pin next to it (`psduSymbols(30) === 240 + RS_PARITY_BITS + TAIL_SYMBOLS`) already carries the claim.
Harmless noise.

Counts: **0 blocking, 2 nits** (minor 13 remains parked by ruling).
