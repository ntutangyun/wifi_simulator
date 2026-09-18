# Task 8 report — course track seam, lesson kit, lesson "Timestamps, not throughput"

## Structure changes

`src/course/curriculum.ts`
- `export type Track = 'wifi' | 'uwb'`, `export interface Tier extends L10n { track: Track }`,
  `export const TRACKS: Record<Track, L10n>` (`Wi-Fi` / `UWB ranging` · `UWB 测距`).
- `TIERS` is now `Tier[]`: the four existing tiers carry `track: 'wifi'`; index 4 is
  `{ track: 'uwb', en: 'UWB Tier 1 · Ranging foundations', zh: 'UWB 第一阶段 · 测距基础' }`.
- `MODULES` gained index 11 `Time of flight` / `飞行时间` and index 12
  `Ranging sessions and positioning` / `测距会话与定位`, both `tier: 4`.
- `COURSE_ORDER` appends the two comment lines and the five ids
  (`uwb-intro`, `uwb-sstwr`, `uwb-dstwr`, `uwb-blocks`, `uwb-position`).

`src/course/CoursePanel.tsx`
- The tier loop now filters to the tiers that have a visible lesson **first**, then maps, so
  "the previous rendered tier" is well defined. Before a tier whose `track` differs from the
  previous rendered tier's (and before the first one), it prints `t(TRACKS[tier.track])` in the
  tier-heading style, slightly larger (13.5 px vs 12 px) and with extra top margin when it is not
  the first heading. Wi-Fi therefore heads the list and `UWB ranging` opens the new section.

`src/course/lessonKit.ts`
- `anchor(id, name, x, y, z = 2.2, ppm?)` and `uwbTag(id, name, x, y, z = 1.0, ppm?)` via a shared
  private `uwbNode()`: `kind: 'uwb'`, `txPowerDbm: -14`, `profiles: ['idle']`,
  `caps: { generation: 'nonht', features: {} }`, `uwb: { role, ppm? }` (`ppm` omitted when undefined,
  so the engine draws a crystal).
- `uwbSc(house, nodes, session = {}, extra = {})` — `sc()` plus `uwb: { ...DEFAULT_UWB_SESSION, ...session }`.
- Predicates `firstUwbPoll`, `firstUwbResp`, `firstUwbFinal`, `firstUwbReport`, `firstUwbRange`,
  `firstUwbPosition`, `firstUwbTimeout`, `firstUwbRxTs`.

`src/course/lessons.ts` — imports and registers `uwbIntro`.

`tests/course/lessons.test.ts` — the one existing structural expectation updated: `TIERS` is 5 long,
its tracks are `['wifi','wifi','wifi','wifi','uwb']`, and `MODULES.map(m => m.tier)` gains two 4s.
No other expectation in the repo changed.

## The lesson

`src/course/uwb/uwb-intro.ts` — `uwbIntro`, id `uwb-intro`, module 11, title
"Timestamps, not throughput" / "重要的是时间戳，而非吞吐量". Scenario `uwbIntroScenario(dM: 5 | 20)`:
`anchor('anchor-1', 'Anchor 1', 1, 4, 2.2, 0)` and `uwbTag('tag-1', 'Phone', 1 + dM, 4, 2.2, 0)`,
`{ method: 'ss', nlos: false }`. Variant `{ en: '20 m apart', zh: '相距 20 m' }`.

Body: source-status sentence (Clause 16 / §10.29 / §10.32 standard; 2 ms slot and 200 ms block FiRa;
−14 dBm, −93 dBm, 100 ps, 0.2 ppm and the NLOS delay named as model) → "A radio that measures time"
(chip, RCTU, one metre, the 40-bit wrap) → the SP1 PPDU table → the RMARKER paragraph → "The delay
Wi-Fi never showed you" (17 ns, why the Wi-Fi channel delivers at the transmit instant, why 17 and
not 16.68) → the SS-TWR `formula` block → "The four lines to subtract" (the four counters as a table,
then the subtraction as a `formula`) → the range line, the CFO correction, and the 0 ppm caveat that
lesson 2 removes. 4 jumps, 4 observe, 2 tryThis, 3 quiz.

### Measured numbers pinned in `tests/course/uwb-intro.test.ts` (28 tests)

Units (from `src/uwb/phy.ts`): chip 2.003 ns at 499.2 MHz; RCTU = chip/2⁷ = 15.650 ps; RSTU
833.333 ns and 2400 RSTU = 2 000 000 ns; 1 m = 3.3356 ns = 213.1 RCTU; one tick = 4.7 mm of flight,
2.3 mm of range; 2⁴⁰ ticks = 17.2 s; ±20 ppm (§16.4.9) ⇒ 40 ns on a 2 ms reply ⇒ ~6 m.

PPDU (from `uwbPpduLayout` / `chipsToNs`, so the numbers are the ones the UI segments show):
SYNC 65 128 ns, SFD 8 141, STS gap 1 026, STS 65 641, STS gap 1 026, PHR 19 487, PSDU 37 179;
whole poll 30 octets / 197 628 ns; structure 160 449 + message 37 179 = 197 628. RMARKER
`chipsToNs(UWB_RMARKER_CHIPS)` = 73 269 ns = 65 128 + 8 141, and the layout's `rmarkerNs` agrees.
Response 20 octets / 187 372 ns, PSDU 26 923 ns, every other segment identical, same RMARKER offset;
197 628 + 187 372 = 385 µs of PPDU in a 4 ms round.

Base run (5 m): `UWB_ROUND` at t = 0, 2 slots × 2 000 000 ns; `UWB_SLOT` at 0 and 2 000 000; the
response `TX_START` at exactly 2 000 000. `RX_START − TX_START = 17` for both frames
(`ceil(16.678)`); 20 m variant 67 (`ceil(66.713)`, and 4 × 16.678 = 66.713).

Counters, in record order tag-tx / anchor-rx / anchor-tx / tag-rx:
336 207 494 656, 26 381 598 252, 26 509 392 384, 336 335 290 928.
Tround = 127 796 272, Treply = 127 794 132, difference 2140, `ssTwrRaw` = 1070 RCTU = 16.75 ns =
5.02 m, and 1070 is exactly the engine's `UWB_RANGE.tofRawRctu`. Truth 1065.7 ticks, so the reading
is 4.3 ticks long. `Treply·RCTU ≈ 2 ms − Tprop` and `Tround·RCTU ≈ 2 ms + Tprop` are asserted to
within 1 ns; the reply is 5 orders of magnitude larger than the flight.

Range: the record is at 2 187 389 ns and `fmtRecord` is pinned verbatim —
`tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)`. `rangeSigmaM(100)` = 0.042 m;
`|rctuToMetres(tofRctu) − 5|` and `|rctuToMetres(tofRawRctu) − 5|` are each under 3σ (equality is
deliberately NOT asserted — at 0 ppm the two still differ by the 0.2 ppm CFO-estimate noise, 7 cm
here, bounded by 3 × (2 ms · 0.2 ppm / 2) · c). Raw reads 2 cm long, corrected 5 cm short. The 20 m
variant reads 19.95 m against a true 20.00 m, error again 5 cm, both readings inside 3σ.

Also pinned: schema validity of scenario and variant; separations exactly 5 m and 20 m; two `uwb`
nodes, roles anchor/tag, both `ppm: 0`, all profiles idle, `servers: []`, session
`{ method:'ss', nlos:false, slotRstu:2400, blockRstu:240_000, tsNoisePs:100, cfoNoisePpm:0.2 }`;
every jump found; module 11; `lessonMinutes` follows the formula and is in [15, 25]; and every
`L10n` in the lesson has non-empty `en`/`zh`, with `zh ≠ en` required for every string holding two
consecutive English words (a number, a log line or a protocol-name cell may legitimately be identical).

## Study time

English words across body + observe + tryThis + quiz: **1692**. `lessonMinutes` = **25**
(raw = 1692/150 + 2·4 + 4·2 = 27.28, which rounds to 25). The ceiling before it rounds to 30 is
1725 words, so 33 words of headroom remain; the file's header comment warns about it.

## Fixture

`UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts` added exactly two lines and
changed none:

```
+  "uwb-intro": "c43c53c3",
+  "uwb-intro#0": "7024af0e",
```

## Verification

`npx tsc -b` clean, `npx vite build` clean, `npx vitest run` → 90 files / 924 tests passed.
No `any`, no `@ts-ignore`.

## Deviations from the brief

1. **The house is not `oneRoom()`.** `oneRoom()` is 10 × 8 m with a brick shell, so the 20 m variant
   put the phone at x = 21 — outside the room and behind two brick walls. The poll never arrived
   (`UWB_TIMEOUT` at both ends, no range at all), which would have made the brief's own required
   observations ("67 ns", "the same-size error") impossible. The lesson therefore defines a local
   `rangingLab()`: a 22 × 8 m hall with the same brick shell, so both placements are indoors with
   nothing in the path and the flight time is exactly the separation over c. Everything else about
   the scenario is as the brief specifies. The 20 m link lands at about −90.5 dBm against the
   −93 dBm model sensitivity, so it works but is not generous; anything much longer would not.
2. **The PSDU is 37.179 µs, not 35.13 µs.** The brief's frame-anatomy figure for the 30-octet poll
   was 35.13; the engine gives `chipsToNs(psduSymbols(30) · 64)` = 37 179 ns, and 160 449 + 37 179 =
   197 628 exactly. The lesson and the test quote the measured 37.179 µs.
3. **No change to `src/ui/i18n.ts`.** The track heading renders `t(TRACKS[track])` from the
   curriculum's own bilingual record, so no new UI string was needed.
4. The `firstUwbFinal`, `firstUwbReport`, `firstUwbPosition` and `firstUwbTimeout` predicates are
   exported as the brief requires but are unused until lessons 2–5; `tsc` and the build are clean
   with them (they are exported module members, not locals).

---

# Fix round 1

Against `task-8-review.md` (3 blocking, 11 minor; minor 13 parked by the controller). Files touched:
`src/course/lessonKit.ts`, `src/course/uwb/uwb-intro.ts`, `tests/course/uwb-intro.test.ts` — nothing
else. `src/course/lessons.ts`, `tests/fixtures/lesson-hashes.json`, `src/course/uwb/uwb-dstwr.ts` and
`tests/course/uwb-dstwr.test.ts` were left alone (lesson 3 is in flight).

**Blocking 1 — the two model constants are pinned.** The test imports `UWB_TX_POWER_DBM` and
`UWB_RX_SENS_DBM` and asserts `=== -14` / `=== -93`, that every node of both scenarios carries
`txPowerDbm === UWB_TX_POWER_DBM`, and that the base scenario's powers are `[-14, -14]`. The
assertion quotes the source-status sentence it guards.

**Blocking 2 — the kit uses the engine's constant.** `lessonKit.ts` imports `UWB_TX_POWER_DBM` from
`src/uwb/phy` and `uwbNode()` uses it; the doc comment now says the power comes from `phy.ts`
"rather than re-typed here, so a lesson's link budget cannot drift away from the engine's".

**Blocking 3 — the ceil claim can now fail.** The old test did `Math.ceil` arithmetic on literals at
two distances whose fractions are both above 0.5, so `Math.round` would have passed it. The test now
builds a scratch scenario from `uwbIntroScenario(5)` with the tag moved to x = 2 — exactly 1.00 m,
flight 3.336 ns, where `Math.round` gives 3 and `ceil` gives 4 — runs it through `Simulation` and
asserts the measured `RX_START − TX_START` gap is `Math.ceil(flight)` and is 4. It then asserts
`gap >= flightNs && gap < flightNs + 1` for both frames at both lesson distances. Measured: the
engine gives 4, so the pin fails if `src/uwb/channel.ts` ever switches to `Math.round`.

**Minor 4** — `SYNC_SYMBOLS === 64`, `SFD_SYMBOLS === 8`, `STS_GAP_CHIPS === 512`,
`STS_ACTIVE_CHIPS === 64 * 512`, `PHR_SYMBOLS === 19`, in a test that names the compensating change
(fewer symbols, longer symbol) it exists to catch.

**Minor 5** — the PSDU cell now reads "the poll at 6.81 Mb/s: 240 data bits, 48 parity bits, a
2-symbol tail" (and the ZH equivalent), so 30 × 8 / 6.81 Mb/s no longer looks like the answer. The
test imports `UWB_MBPS` and pins it, `poll.frame.mbps === UWB_MBPS`, `RS_PARITY_BITS === 48`,
`TAIL_SYMBOLS === 2` and `psduSymbols(30) === 240 + 48 + 2`.

**Minor 6** — `expect(durOf('psdu')).toBe(chipsToNs(psduSymbols(30) * DATA_SYMBOL_CHIPS))` beside the
literal, so the PSDU row derives like every sibling.

**Minor 7** — `expect(Math.round(240_000 * RSTU_NS)).toBe(200 * MS)` beside the slot's 2 ms.

**Minor 8** — a new test runs the `airtime` lesson's Wi-Fi scenario and asserts every `RX_START` for
the first five data frames lands at its `TX_START.t` exactly ("the Wi-Fi channel adds no flight
time"), plus `SLOT_NS === 9 µs` for the companion clause.

**Minor 9** — `expect(Math.round(1 / RCTU_NS)).toBe(64)` pins "the ranging underneath runs 64 times
finer".

**Minor 10** — `rangingLab()` moved into `lessonKit.ts` beside `oneRoom()` / `hallwayHouse()`,
exported and documented as the 22 × 8 m UWB hall (with the reason `oneRoom()` cannot hold a 20 m
span); the lesson imports it. The scenario is byte-identical: the hash fixture was **not**
regenerated and `npx vitest run tests/engine/lesson-hashes.test.ts` passes unchanged.

**Minor 11** — `uwbSc` now spreads `extra` first and the merged session last, so an `extra.uwb`
cannot wipe the `DEFAULT_UWB_SESSION` merge; the doc comment says `session` is the only argument that
merges.

**Minor 12** — the header now says the measured 1694 words (was "around 1680") and "room for thirty
more and no more". The parity/tail clause added 8 words; three small trims elsewhere
("for so little payload", "the rest is schedule", one ZH em-dash repair) kept the total at 1694 and
`lessonMinutes` at 25.

**Minor 14** — the bilingual walker's `as unknown as L10n` is gone, replaced by a typed predicate
`isL10n(o): o is Record<string, unknown> & L10n`.

**Minor 13** — parked by the controller (no `CoursePanel` test exists in the repo); not attempted.

Verification: `npx vitest run` → **92 files / 954 tests passed**; `npx tsc -b` clean; `npx vite build`
clean. `tests/course/uwb-intro.test.ts` grew from 28 to 33 tests. No `any`, no `@ts-ignore`.
