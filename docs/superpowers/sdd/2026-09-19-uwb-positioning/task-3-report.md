# Task 3 report — Guide section, glossary group, README conformance rows

**Status:** DONE
**Commit:** `a03085df0947e8fcfc0d3cdaed568e06199d7fb4` — `docs(uwb): guide section, glossary group and README conformance rows`
**Branch / worktree:** `feat/uwb-ranging` in `D:\wifi_sim\.claude\worktrees\feat-link-2g`

## What was done

### `tests/ui/uwb-guide.test.ts` (new, written first and seen failing — 11 of 12 red)

12 tests in three groups:

- **glossary** — the `uwb` group exists and is titled in both languages; ≥ 18 items (24 shipped);
  every term on the spec's list is present (case-insensitive match on the joined headwords);
  every item has a non-empty bilingual `alt` and `def`, the `def.zh` carries CJK and is not a copy
  of the English; and the group quotes the three engine figures a learner cannot derive
  (`15.650 ps`, `833.333 ns`, `73.269 µs`).
- **Guide section 11** — renders under both languages and contains `11 · UWB ranging` /
  `11 · UWB 测距`; states the `10×` ellipse draw factor and that the inspector shows the true axes;
  quotes the `200 ms` block and `2 ms` slot the engine defaults to.
- **README** — has the `802.15.4-2024 HRP UWB ranging` heading, cites all eight ranging clauses
  (§10.29.1.1, §10.29.1.4, §10.29.1.5, §10.29.1.2.2, §10.29.1.2.4, §10.29.1.7, §10.32.2, §16.2),
  and records the UWB simplifications (`no CCA`, AoA).

### `src/ui/Guide.tsx`

New section **11 · UWB ranging (802.15.4-2024 HRP)** in EN and **11 · UWB 测距（802.15.4-2024 HRP）**
in ZH, six paragraphs each, using the existing `h`/`p`/`chip()` helpers and the scene's own colours
(`#fbbf24` rings, `#f59e0b` fix and ellipse):

1. what UWB is here — a second radio on channel 5 (6489.6 MHz) or 9 (7987.2 MHz), 499.2 Mchip/s,
   measuring distance rather than carrying traffic; 1 ps = 0.3 mm.
2. the ranging counter (RCTU 15.650 ps, §10.29.1.4) and the RMARKER (73.269 µs into the PPDU,
   §10.29.1.1), plus the SP1/STS frame anatomy (§16.2).
3. SS-TWR (§10.29.1.2.2) vs DS-TWR (§10.29.1.2.4) in the two sentences the brief asked for,
   with the 20 ppm over a 2 ms reply = 20 ns ≈ 6 m cost of the single-sided form.
4. blocks / rounds / slots (§10.32.2): 200 ms block, 2 ms slot, 2N + 2 slots for a DS round,
   no CCA / backoff / NAV, radio off between rounds.
5. what the scene draws: rings are the measured ranges, they and the cross and ellipse fade over
   one ranging block, the ellipse is 1-σ **drawn at 10×** and **the inspector shows the true axes**,
   and its shape is GDOP (geometry), not noise.
6. the model numbers: −14 dBm, −93 dBm, 6 dB capture, path-loss exponent 2, 100 ps 1-σ timestamp
   noise (σ_range = c·σ_ts/√2 ≈ 2.1 cm), 0.2 ppm residual CFO, NLOS 0.2 / 0.5 / 2.0 ns per wall,
   and the FoM values 0x16 / 0x7B expanded (97 % within 0.5 ns, 75 % within 12 ns, §10.29.1.7).

One structural change: `GuideEn` and `GuideZh` are now exported. See "Decision" below.

### `src/ui/glossary.ts`

New group `uwb`, titled *UWB ranging (802.15.4-2024)* / *UWB 测距（802.15.4-2024）*, 24 items —
every term on the spec's list plus two the scene needs:

UWB · HRP UWB PHY · RMARKER · Ranging counter / RCTU · RSTU · STS · SP1 · SS-TWR · DS-TWR ·
Ranging block · Ranging round · Ranging slot · Controller / controlee · Initiator / responder ·
ARC IE · RDM IE · RRTI IE · RMI IE · FoM · NLOS · GDOP · Error ellipse · Range ring · Anchor / tag.

Each carries the value the engine runs, taken from `src/uwb/phy.ts`, `ranging.ts`, `position.ts`,
`session.ts`, `scene.ts` and `src/model/scenario.ts` — not invented. Chinese is written, not
transliterated (the test rejects a `def.zh` identical to its `def.en` or free of CJK).

### `README.md`

- Edit-mode bullet now mentions placing UWB anchors and tags and setting the ranging session;
  a new simulate-mode bullet describes the UWB lane and the floor overlay (rings, cross, 10×
  ellipse, fade over one block).
- New section **802.15.4-2024 HRP UWB ranging**, a 19-row table parallel to the 802.11 one, each
  row tagged `standard §…` / `FiRa` / `model` exactly as the constants in `phy.ts` are tagged.
- Five new **Known simplifications** bullets: no CCA / no contention-based rounds;
  sensitivity-only reception with a 6 dB capture margin and no UWB SINR curve, multipath model or
  channel-5 coexistence; 2-D fix with the tag's z from the scenario, no AoA/PDoA/TDoA;
  NLOS as one excess delay per wall with a two-valued FoM mapping that the solver never reads;
  STS key management, contention-based rounds, round hopping and LRP UWB out of scope.

## Decision worth flagging

The brief suggested setting the language through the store and rendering `Guide`. That cannot
work: zustand v5's `useStore` passes `api.getInitialState` as `getServerSnapshot`, so under
`renderToStaticMarkup` the component reads the store's **initial** state and `setLang` /
`setState` has no effect — the EN render came back in Chinese. Rather than add a test-only `lang`
prop to `Guide`, or mock the store module, `GuideEn` and `GuideZh` are exported and the test
renders the two bodies the `Guide` switch chooses between. `Guide` itself is unchanged.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run tests/ui/uwb-guide.test.ts` | 12 passed |
| `npx tsc -b` | clean, no output |
| `npx vite build` | built in 2.66 s (only the pre-existing chunk-size warning) |
| `npx vitest run` (full suite) | **95 files, 1037 tests, all passed** |

No `any`, no `@ts-ignore`. The hash fixture was not touched. No file owned by the concurrent
editor agent (`src/editor/*`, `src/uwb/ui/*`, `src/ui/Inspector.tsx`, `src/ui/i18n.ts`,
`tests/editor/*`) was read into or modified by this task; no i18n string was added — the Guide and
the glossary keep their bilingual text locally, as they already did.

Committed by explicit pathspec: `src/ui/Guide.tsx`, `src/ui/glossary.ts`, `README.md`,
`tests/ui/uwb-guide.test.ts`. Working tree clean afterwards.

---

# Fix round 1

**Status:** DONE
**Commit:** `f7334a9a88c3f1f9d55e5a25ffb62dc33ebf220b` — `fix(docs): UWB guide and README source tags and counts pinned to the engine`
**Review:** `task-3-review.md` — Spec APPROVED, Quality CHANGES REQUIRED (1 blocking, 5 minor). All six controller rulings done.

## Ruling 1 (blocking, finding 1) — the 40-bit counter was tagged `standard §10.29.1.4`

`README.md`. The RCTU row now carries only the unit, which really is the clause's
(`Tc / 128 = 15.650 ps — 4.7 mm of flight`), and the width has a row of its own:

| Ranging counter width 40 bits | model | the standard says "at minimum 32-bit"; 40 bits, wrapping every 17.2 s, is our choice — every counter difference is taken mod 2⁴⁰ |

Splitting it was preferred to a `standard / model` compound cell: the section's contract is one
source per constant, and `phy.ts:13` tags `COUNTER_BITS` exactly this way. The 17.2 s figure is
`COUNTER_MOD × RCTU_NS`, and the test computes it rather than quoting it.

## Ruling 2 (finding 2) — the unsourced §10.29.6

Dropped the parenthesis: "STS key management, contention-based rounds, round hopping, LRP UWB …".
The ruling's other branch (§10.32.4/§10.32.5) was deliberately **not** taken — those clauses are
the one-to-many *computation* procedures the engine implements (spec line 236 "Who computes
(§10.32.4, §10.32.5)"), so citing them in an out-of-scope bullet would have replaced an
unverifiable claim with a false one.

## Ruling 3 (finding 3) — "four such stamps" is the SS count

`Guide.tsx`, EN and ZH: "a range is nothing but arithmetic on such stamps: four of them in SS-TWR
(two frames), six in DS-TWR (three frames, each stamped at both ends)" / "SS-TWR 用到 4 个（两帧），
DS-TWR 用到 6 个（三帧，每帧在收发两端各打一次）".

## Ruling 4 (finding 4) — the 2 ms slot was not tagged FiRa

`Guide.tsx`, EN and ZH. The attribution now covers both and says what the standard does fix:
"The block is 200 ms and the slot 2 ms — both FiRa's defaults, not the standard's, which fixes only
the RSTU they are counted in." ZH likewise.

## Ruling 5 (finding 5) — §10.29.1.6

New README row: `Clock-offset (CFO) tracking for the SS-TWR correction | standard §10.29.1.6,
collapsed to one number | the standard's ranging tracking offset / tracking interval pair is
modelled as a single measured coffs, with 0.2 ppm of residual error` — the spec's own wording
(design doc line 150).

## Ruling 6 (finding 6) — pin the drift-prone figures

New `describe('figures pinned to the engine')` in `tests/ui/uwb-guide.test.ts`, 6 tests asserting
the EN render, the ZH render and the README against values *computed from the engine*, never
literals:

| Figure | Pinned to |
|---|---|
| 200 ms block, 2 ms slot, 100 ps, 0.2 ppm | `DEFAULT_UWB_SESSION` through `rstuNs` |
| −14 dBm, −93 dBm | `UWB_TX_POWER_DBM`, `UWB_RX_SENS_DBM` |
| 2.1 cm | `rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)` |
| 10× | `ELLIPSE_DRAW_SCALE` |
| 2N + 2 / N + 1 | `uwbSlotsPerTag('ds' \| 'ss', 4)` |
| 14 + 12N, ≤ 9 anchors | `uwbFinalBytes(n)` for n = 1, 4, 9; `UWB_MAX_ANCHORS` |
| 97 % within 0.5 ns / 75 % within 12 ns | `fomText(FOM_LOS \| FOM_NLOS)` |
| 17.2 s wrap, tagged model | `COUNTER_MOD × RCTU_NS`; the row is asserted to contain `\| model \|` |

Two notes on the shape. The FoM assertion is verbatim `fomText` against the EN prose and the
README, but against the ZH it pins the two numbers `fomDecode` returns — the Chinese translates
the sentence, so demanding the English string there would force a mistranslation. The counter-row
test also asserts the row's Source cell is `model`, so ruling 1 cannot silently regress either.

Test count went 12 → 18.

## Verification

| Gate | Result |
|---|---|
| `npx vitest run tests/ui/uwb-guide.test.ts` | **18 passed** |
| `npx tsc -b` | 2 errors, both in `tests/course/_measure-blocks.test.ts` (a changed `lessonKit` signature and a `FrameField.label` that no longer exists) — the concurrent course agent's uncommitted `src/course/lessonKit.ts` / `lessons.ts`. No error in this task's files. |
| `npx vitest run` (full suite) | 94 of 96 files pass, 1064 of 1069 tests. The 5 failures are `tests/course/uwb-blocks.test.ts` (the course agent's new untracked file) and `tests/engine/lesson-hashes.test.ts` (their new lesson scenario `src/course/uwb/uwb-blocks.ts` is not in the fixture yet — theirs to regenerate). Both were green before their edits landed in the worktree and neither touches Guide, glossary or README. |

The hash fixture was not touched by this task. Committed by explicit pathspec
(`src/ui/Guide.tsx`, `src/ui/glossary.ts`, `README.md`, `tests/ui/uwb-guide.test.ts`); `glossary.ts`
needed no change this round, so the commit carries three files.
