# Task 3 review — Guide section 11, glossary group `uwb`, README conformance rows

**Reviewed:** commit `a03085d` *docs(uwb): guide section, glossary group and README conformance rows*
(`42f941b..a03085d`), branch `feat/uwb-ranging`, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`.
**Ground truth:** `src/uwb/phy.ts`, `src/uwb/ranging.ts`, `src/uwb/position.ts`, `src/uwb/scene.ts`,
`src/uwb/session.ts`, `src/model/scenario.ts`, `docs/superpowers/specs/2026-09-18-uwb-ranging-design.md`.
**Method:** every number and every clause number in the added README rows, Guide paragraphs and glossary
items was resolved back to the constant or the spec line it claims to quote; EN and ZH were compared
sentence by sentence; the two gates were run.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

Spec: every deliverable the brief names is present and correct in shape — Guide section
"11 · UWB ranging" (EN) / "11 · UWB 测距" (ZH) covering the counter, the RMARKER, SS vs DS, blocks /
rounds / slots, the rings and the 10× ellipse and the model numbers; glossary group `uwb` with 24
bilingual items (≥ 18 required), each carrying the engine's value; README conformance table with
standard / FiRa / model rows plus five new simplification bullets; the test asserts the glossary group,
both headings, and the README heading and clause list. The ZH text is a real translation, not a paste,
and carries the same numbers as the EN throughout.

Quality: one blocking attribution defect (finding 1) in the conformance table, whose stated contract is
that every constant is tagged by its source; plus five minor items. No `any`, no `@ts-ignore`, no
`@ts-expect-error` in the diff.

## Gates

| Gate | Result |
|---|---|
| `npx vitest run tests/ui/uwb-guide.test.ts` | **12 passed**, 1 file, 640 ms |
| `npx tsc -b` | **exit 0**, no output |
| `npx tsc -b --force` | 2 errors, both in `src/ui/i18n.ts` (lines 286, 655: `ap` missing from the editor-tool label record) — **not this task's**: `git status` shows `src/ui/i18n.ts`, `src/editor/planOps.ts` and `tests/editor/uwb-planOps.test.ts` dirty in the working tree from the concurrent editor agent, mid-edit (an earlier force build showed a different, transient error in `planOps.ts`). No error in `Guide.tsx`, `glossary.ts` or `tests/ui/uwb-guide.test.ts` at any point. |

The commit's own four files type-check and test clean; the force-build failures are the other agent's
uncommitted work and must not be attributed here (nor fixed here).

## Findings

### 1. `README.md:64` — a model constant tagged `standard §10.29.1.4` — **blocking**

```
| Ranging counter, RCTU | standard §10.29.1.4 | Tc / 128 = 15.650 ps (4.7 mm of flight); 40-bit counter, differences mod 2⁴⁰ |
```

**What.** The row's Source column says `standard §10.29.1.4`, but the 40-bit width is a model choice:
`src/uwb/phy.ts:10` is `export const COUNTER_BITS = 40 // model (standard: "at minimum 32-bit")`.

**Why.** The section's own opening sentence is the contract: *"Every constant below is tagged with where
it comes from: a clause of IEEE Std 802.15.4-2024, a FiRa UCI default, or a model choice this simulator
made."* A reader takes away that §10.29.1.4 mandates a 40-bit counter; the standard requires at least 32.
This is the drift class the review is for — the number matches the engine, its *tag* does not match the
engine's own tag — and the AMP rows above it are scrupulous about exactly this ("P802.11bp draft (model)",
"are model choices, not standard values"). The glossary gets it right (`glossary.ts`, *Ranging counter /
RCTU*: "40 bits wide **here**"), so the README is the only place that overstates it.

**What to do.** Keep the row's clause for the RCTU itself and mark the width, e.g. `… (4.7 mm of flight);
40-bit counter (model; the standard requires at least 32 bits), differences mod 2⁴⁰`.

### 2. `README.md:97` — clause `§10.29.6` is sourced nowhere in the repo — minor

"STS key management (§10.29.6), contention-based rounds, round hopping, LRP UWB … are out of scope."
The spec lists STS key management as out of scope (`2026-09-18-uwb-ranging-design.md:18`) but cites no
clause for it, and `§10.29.6` appears in no other file (`grep` over `docs/`, `src/`, `README.md` returns
this one line). Every other clause in the new text traces to `phy.ts` or the spec. Either source it or
drop the parenthesis — an unverifiable clause number in a conformance document is a claim the repo
cannot back.

### 3. `src/ui/Guide.tsx:142` (EN) and `:313` (ZH) — "four such stamps" is the SS-TWR count — minor

"…a range is nothing but arithmetic on four such stamps" / "一次测距无非是对四个这样的读数做算术". True for
SS-TWR (txPoll_A, rxPoll_B, txResp_B, rxResp_A). DS-TWR — the default method (`scenario.ts:191`
`method: 'ds'`), and the method the very next paragraph recommends — reads **six** RMARKERs
(adds txFinal_A, rxFinal_B), which produce the four *intervals* the formula uses. Suggest "four such
stamps in SS-TWR, six in DS-TWR" or simply "arithmetic on such stamps"; in ZH likewise.

### 4. `src/ui/Guide.tsx:156-157` (EN) and `:325-326` (ZH) — the 2 ms slot is not tagged FiRa — minor

"ranging **blocks** (200 ms, FiRa's default) … each round into **slots** of 2 ms" — the FiRa attribution
attaches to the block only, leaving 2 ms reading as though the standard fixed it. Both are FiRa UCI
defaults (`scenario.ts:191` `blockRstu: 240_000, slotRstu: 2400`; spec lines 198-199), and the glossary
(*Ranging slot*: "2 ms (2 400 RSTU), FiRa default") and `README.md:74` both tag them correctly. Extend
the parenthesis to cover the slot, in EN and ZH.

### 5. `README.md:57-81` — §10.29.1.6 (crystal characterisation) is never cited — minor

Both the Guide (SS-TWR paragraph, "unless the carrier-frequency offset the receiver measured is used to
correct it") and the glossary (*SS-TWR*) describe the CFO correction the engine runs, and the README row
"Timestamp noise 100 ps 1-σ, residual CFO 0.2 ppm | model" carries its noise figure — but the clause the
spec names for it (`2026-09-18-uwb-ranging-design.md:150`: "the standard's ranging tracking offset /
interval (§10.29.1.6) collapsed to one number") appears nowhere. Adding `standard §10.29.1.6 (collapsed
to one number)` to the SS-TWR row or the CFO row would complete the clause set. Not required by the
brief; noted because the report claims the README "cites all eight ranging clauses" and §10.29.1.6 is a
ninth the spec uses.

### 6. `tests/ui/uwb-guide.test.ts` — the drift-prone figures are not pinned — minor

The test pins `15.650 ps`, `833.333 ns`, `73.269 µs`, `200 ms`, `2 ms`, `10×`, "inspector", the eight
clause strings and the bilingual shape — good, and it caught the zustand SSR trap honestly. It does not
pin the figures most likely to rot when a constant moves: `2.1 cm` (σ_r = c·σ_ts/√2 at 100 ps),
`14 + 12N` / `≤ 9 anchors`, `97 % within 0.5 ns` / `75 % within 12 ns`, `2N + 2`, `−14 dBm` / `−93 dBm`.
A stronger form asserts against the engine rather than a literal, e.g.
`expect(README).toContain(fomText(FOM_LOS))` and
`expect(en).toContain((rangeSigmaM(100) * 100).toFixed(1))` — then a constant change breaks the doc test
instead of silently falsifying the text.

## Rulings and notes (not findings)

- `GuideEn` / `GuideZh` exported for the SSR test: accepted by the controller. The report's reasoning is
  correct — zustand v5 passes `api.getInitialState` as `getServerSnapshot`, so `setLang` cannot steer a
  `renderToStaticMarkup`; exporting the two bodies is cheaper than a test-only prop or a module mock, and
  `Guide` itself is unchanged.
- The brief says "the 3× draw factor"; `src/uwb/scene.ts:38` is `ELLIPSE_DRAW_SCALE = 10`. The text
  follows the engine (10×) everywhere — Guide EN and ZH, glossary *Error ellipse*, README bullet. Correct
  call; the brief is stale.
- §10.29.1.7 FoM: the text says "97 % within 0.5 ns", i.e. the product of interval 1 ns and scale 0.5,
  matching `fomText(0x16)` exactly — not the raw 1 ns. Same for `0x7B` → "75 % within 12 ns" (3 ns × 4.0).
  The trap the controller flagged is avoided in all four places (`README.md:70`, Guide EN/ZH, glossary
  *FoM*), and the spec's "a confidence interval is the whole window" reading is preserved.
- Claims about other components were spot-checked and hold: the inspector does print unscaled axes
  (`src/uwb/ui/rows.ts:69`, `(a*100).toFixed(1)` cm), the editor does expose method / block / slot /
  channel / timestamp noise (`src/uwb/ui/UwbSessionFields.tsx:31-65`), the UWB tag lane exists
  (`src/ui/TimelineStrip.tsx`, `src/ui/laneLayout.ts`), and reception really is sensitivity-plus-capture
  (`src/uwb/channel.ts:199,210`).
- GDOP 1.0 at the centre of a square (glossary *GDOP*) is not a hand-wave: `tests/uwb/position.test.ts:20`
  asserts `gdop` closeTo 1.0 for that geometry.

## Every number checked, with its source

| Where | Figure as written | Source | ✓ |
|---|---|---|---|
| README 62, Guide EN/ZH, glossary HRP | 499.2 Mchip/s, Tc = 2.003205 ns, §16.2.4 | `phy.ts:6-7` `UWB_CHIP_HZ`, `UWB_CHIP_NS`; spec 64 | ✓ |
| README 64, Guide, glossary RCTU | RCTU = Tc/128 = 15.650 ps, §10.29.1.4 | `phy.ts:8` `RCTU_NS` | ✓ |
| README 64, glossary RCTU | 1 RCTU = 4.7 mm of flight | 0.015650 ns × 0.299792458 = 4.69 mm | ✓ |
| README 64, glossary RCTU | 40-bit counter, mod 2⁴⁰ | `phy.ts:10-11` `COUNTER_BITS = 40` — tagged **model**, see finding 1 | number ✓ / tag ✗ |
| README 65, glossary RSTU | RSTU = 416 chips = 833.333 ns, §10.29.1.5, Table 10-145 | `phy.ts:9-10` `RSTU_CHIPS`, `RSTU_NS`; spec 66 | ✓ |
| README 66, Guide, glossary RMARKER | first chip after SFD, 36 576 chips = 73.269 µs, §10.29.1.1 | `phy.ts:28-30`; spec 96 | ✓ |
| README 67, glossary HRP/SP1 | SYNC 64 + SFD 8 symbols, BPRF set 3, Table 16-31, Figure 16-3 cfg 1 | `phy.ts:17-18`; spec 80-81 | ✓ |
| README 67, glossary STS | STS = 512 + 64 × 512 + 512 = 33 792 chips (67.692 µs) | `phy.ts:19-20,32`; 33 792 × 2.003205 ns = 67 692 ns | ✓ |
| README 67, glossary HRP | PHR 850 kb/s, PSDU 6.8 Mb/s | `phy.ts:22-24`; spec 69-70 | ✓ |
| README 68, Guide, glossary SS-TWR | tof = (Tround − Treply)/2; corrected (Tround − Treply·(1 − coffs))/2; §10.29.1.2.2 | `ranging.ts:4-11`; spec 159-163 | ✓ |
| Guide EN/ZH, glossary SS-TWR | 20 ppm over a 2 ms reply = 20 ns ≈ 6 m | spec 160-161, verbatim | ✓ |
| README 69, Guide, glossary DS-TWR | three messages, Poll/Response/Final, §10.29.1.2.4, Figure 10-199 | `ranging.ts:14-16`; spec 165-168 | ✓ |
| Guide EN/ZH | DS round costs twice the airtime | 2N + 2 vs N + 1 slots (`phy.ts` `uwbSlotsPerTag`) | ✓ |
| README 70, Guide, glossary FoM | 0x16 = 97 % within 0.5 ns | `fomDecode(0x16)` → level 6 = 97 %, interval 1 ns × scale 0.5 | ✓ |
| README 70, Guide, glossary FoM | 0x7B = 75 % within 12 ns | `fomDecode(0x7b)` → 75 %, 3 ns × 4.0 | ✓ |
| README 70, glossary FoM | 0x00 = not available | `phy.ts` `fomText`, §10.29.1.7 | ✓ |
| README 71, Guide, glossary round | SS = N + 1 slots, DS = 2N + 2, slot 0 is the Poll, §10.32.2 | `phy.ts` `uwbSlotsPerTag`; `session.ts:54-60` `slotAction` | ✓ |
| README 72 | ARC / RDM / RRTI / RMI / RRMC from §10.29.8, §10.32.9 | `phy.ts:96-115` | ✓ |
| glossary ARC IE | 10 octets, §10.32.9.1 | `ARC_IE_BYTES = 2 + 8` | ✓ |
| glossary RDM IE | 3 + 3N octets, §10.32.9.8 | `rdmIeBytes` = 3 + 3N | ✓ |
| glossary RRTI IE | 6 octets, 4-octet reply time, §10.29.8.1 | `RRTI_IE_BYTES = 2 + 4` | ✓ |
| glossary RMI IE | Final 3 + 6N; report 13 octets, §10.29.8.4 | `rmiFinalIeBytes`; `RMI_REPORT_IE_BYTES = 2 + 11` | ✓ |
| README 73 | crystal tolerance ±20 ppm, §16.4.9 | `phy.ts:74` `UWB_PPM_MAX = 20`; spec 137-138 | ✓ |
| README 74, Guide, glossary block/slot | block 200 ms = 240 000 RSTU; slot 2 ms = 2 400 RSTU, FiRa | `scenario.ts:191`; 240 000 × 833.333 ns = 200 ms | ✓ (Guide tag: finding 4) |
| README 74, glossary slot | slot must hold the longest frame + 200 ns flight guard (60 m) | `phy.ts` `UWB_SLOT_GUARD_NS = 200`, `uwbSlotFitNs`; `scenario.ts:414` | ✓ |
| README 75, glossary DS-TWR | DS-TWR deferred is the default method (FiRa) | `scenario.ts:191` `method: 'ds'`; spec 197 | ✓ |
| README 76, Guide | Tx −14 dBm, sensitivity −93 dBm, capture 6 dB (model) | `phy.ts:69-71` | ✓ |
| README 77, Guide | path-loss exponent 2.0, free-space PL₀, Table 11-9 (model) | `phy.ts:68` `UWB_PL_EXP`, `uwbPl0Db` | ✓ |
| README 78, Guide, glossary ellipse | 100 ps 1-σ timestamp noise, 0.2 ppm residual CFO (model) | `scenario.ts:191` `tsNoisePs: 100, cfoNoisePpm: 0.2` | ✓ |
| README 78, Guide, glossary ellipse | σ_range = c·σ_ts/√2 ≈ **2.1 cm** | `position.ts:29-32` `rangeSigmaM(100)` = 0.299792458 × 0.1 / √2 = 0.0212 m | ✓ (not 4.2, not 3.0) |
| README 78 | DS-TWR is 0.62–0.65·c·σ_ts | `position.ts:23-28` doc comment, verbatim | ✓ |
| README 79, Guide, glossary NLOS | 0.2 ns glass / 0.5 ns drywall / 2.0 ns brick = 0.06 / 0.15 / 0.60 m | `phy.ts:72` `UWB_NLOS_NS`; × 0.299792458 | ✓ |
| README 80, glossary GDOP / ellipse | GDOP = √trace((JᵀJ)⁻¹); Σ = σ_r²·(JᵀJ)⁻¹; semi-axes √λ₁, √λ₂; ≥ 3 ranges | `position.ts:104,144-160` | ✓ |
| glossary GDOP | square of anchors → GDOP 1.0 | `tests/uwb/position.test.ts:20-22` | ✓ |
| README 81, glossary anchor/tag | ≤ 9 anchors; Final = **14 + 12N** octets; 127-octet PSDU, §16.2.7 | `uwbFinalBytes` = 9 + 3 + 6N + 6N + 2; N = 9 → 122, N = 10 → 134 | ✓ |
| Guide EN/ZH, glossary UWB | channel 5 = 6489.6 MHz, channel 9 = 7987.2 MHz (9 is the default) | `phy.ts:65` `UWB_CHANNEL_MHZ`; `scenario.ts:191` `channel: 9` | ✓ |
| Guide EN/ZH, glossary UWB | 1 ps = 0.3 mm of flight | `C_M_PER_NS = 0.299792458` | ✓ |
| Guide EN/ZH, README bullet, glossary ellipse / ring | ellipse drawn at **10×**, inspector shows the true axes, rings / cross / ellipse fade over one ranging block | `scene.ts:38` `ELLIPSE_DRAW_SCALE = 10`, `:90-96` `fade`; `rows.ts:69` | ✓ |
| Guide EN/ZH | "a couple of centimetres … invisible beside a 3.5 m ring" | `scene.ts:33-36` comment | ✓ |
| README 93-97 | no CCA / no contention, sensitivity-only + 6 dB capture, 2-D fix with z from the scenario, no AoA/PDoA/TDoA, FoM reported never solved on | `session.ts` (no CCA path), `channel.ts:199,210`, `position.ts:70-76`, spec 172-174 | ✓ (clause: finding 2) |

### EN ↔ ZH parity

Paragraph for paragraph, the ZH section states the same facts with the same figures: 6489.6 / 7987.2 MHz,
499.2 Mchip/s, 0.3 mm, 15.650 ps, 1/128 chip, 73.269 µs, 20 ppm / 2 ms / 20 ns / 6 m, 2N + 2, 200 ms,
2 ms, 3.5 m, 10×, −14 / −93 dBm, 6 dB, exponent 2, 100 ps, 2.1 cm, 0.2 ppm, 0.2 / 0.5 / 2.0 ns,
75 % / 12 ns vs 97 % / 0.5 ns, and the same clause numbers (§10.29.1.4, §10.29.1.1, §16.2, §10.29.1.2.2,
§10.29.1.2.4, §10.32.2, §10.29.1.7). No pasted English; the 24 glossary items likewise carry written
Chinese, not transliteration. One wording nit, not a finding: "代价是一倍的空口时间" for "twice the airtime"
is idiomatic but marginally ambiguous — "多一倍" or "两倍" would be unambiguous (the same phrase is used in
the glossary's DS-TWR item, so change both or neither).

---

## Re-review (fix round 1)

**Reviewed:** commit `f7334a9` *fix(docs): UWB guide and README source tags and counts pinned to the
engine* (`3fc67c2..f7334a9`; `3fc67c2` is the concurrent editor agent's work, not in scope).
**Scope:** the six controller rulings only, plus a check that the fixes introduced no new drift.
**Gate:** `npx vitest run tests/ui/uwb-guide.test.ts` — **18 passed**, 1 file, 727 ms. (`tsc` not run,
per the coordinator: the course agent has lesson-4 files in flight.)

### Verdict

Spec: APPROVED
Quality: APPROVED

All six rulings are applied, each in a way that removes the defect rather than papering over it, and no
new figure or clause was introduced that the engine or the spec does not back. No remaining findings.

### Ruling by ruling

1. **40-bit counter tagged model — fixed.** `README.md:64` now carries only the standard's part
   ("Tc / 128 = 15.650 ps — 4.7 mm of flight", `standard §10.29.1.4`), and the width moved to its own
   row, `README.md:65`, Source `model`: *"the standard says \"at minimum 32-bit\"; 40 bits, wrapping
   every 17.2 s, is our choice — every counter difference is taken mod 2⁴⁰"*. The hedge is `phy.ts:10`'s
   own comment, verbatim. The new derived figure checks out: `COUNTER_MOD · RCTU_NS` = 2⁴⁰ × 0.01565004 ns
   = 1.7208 × 10¹⁰ ns = **17.2 s**. Better than the minimum fix — the row now teaches why the width
   matters.
2. **`§10.29.6` dropped — fixed.** `README.md:99` lists STS key management as out of scope with no
   clause; `grep -rn "10\.29\.6\b" README.md src/ docs/` returns nothing. Matches how the spec states it
   (`2026-09-18-uwb-ranging-design.md:18`).
3. **Stamp count — fixed, EN and ZH.** `Guide.tsx:142-143`: *"arithmetic on such stamps: four of them in
   SS-TWR (two frames), six in DS-TWR (three frames, each stamped at both ends)"*; `:314-315` says the
   same in Chinese ("SS-TWR 用到 4 个（两帧），DS-TWR 用到 6 个（三帧，每帧在收发两端各打一次）").
   Correct for both methods: SS = txPoll/rxPoll/txResp/rxResp; DS adds txFinal/rxFinal, the six that feed
   the four intervals of `dsTwr()` (`ranging.ts:14-16`). The deferred measurement report carries values,
   not a seventh stamp the formula reads, so "three frames" is right for the arithmetic.
4. **2 ms / 200 ms tagged FiRa in the Guide — fixed, EN and ZH.** `Guide.tsx:157-159`: *"The block is
   200 ms and the slot 2 ms — both FiRa's defaults, not the standard's, which fixes only the RSTU they
   are counted in"*; `:330` mirrors it ("这两个值都取自 FiRa 的默认配置而非标准本身；标准只规定了计量它们
   的 RSTU"). Accurate: `scenario.ts:191` `blockRstu: 240_000, slotRstu: 2400`, and the standard fixes
   only the RSTU (§10.29.1.5, `phy.ts:9-10`). The added clause is a real improvement on the tag I asked
   for — it says what the standard *does* fix.
5. **§10.29.1.6 cited — fixed.** New row `README.md:70`, Source `standard §10.29.1.6, collapsed to one
   number`: *"the standard's ranging tracking offset / tracking interval pair is modelled as a single
   measured `coffs`, with 0.2 ppm of residual error"* — the spec's own words
   (`2026-09-18-uwb-ranging-design.md:148-150`). The Source cell hedges the model reduction in place, so
   this row does **not** repeat finding 1's problem, and the 0.2 ppm keeps its `model` tag on
   `README.md:78`.
6. **Figures pinned to the engine — fixed, and done the strong way.** The new
   `describe('figures pinned to the engine')` block asserts the prose against imported constants and
   functions, not literals: `DEFAULT_UWB_SESSION` (200 ms / 2 ms via `rstuNs`, 100 ps, 0.2 ppm),
   `UWB_TX_POWER_DBM` / `UWB_RX_SENS_DBM` (with a Unicode-minus helper, since the prose uses −),
   `rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)` → "2.1 cm", `fomText(FOM_LOS)` / `fomText(FOM_NLOS)` and
   `fomDecode` for the ZH sentence, `uwbSlotsPerTag` behind "2N + 2" / "N + 1", `uwbFinalBytes` behind
   "14 + 12N" and `UWB_MAX_ANCHORS` behind "≤ 9 anchors", `ELLIPSE_DRAW_SCALE` behind "10×", and
   `COUNTER_MOD · RCTU_NS` behind "17.2 s". Most assertions sweep EN, ZH and the README together, so a
   constant change now fails the doc test in all three surfaces at once. The last case also asserts the
   counter-width row is tagged `| model |` — finding 1 cannot silently come back. The ZH FoM case is
   correctly weakened to the two decoded numbers with a comment saying why (the sentence is translated,
   not quoted), rather than being dropped.

### New drift check

Every figure the fix touched or added was re-resolved: 15.650 ps, 4.7 mm, 40 bits / mod 2⁴⁰ / 17.2 s,
0.2 ppm, `coffs`, four vs six stamps, 200 ms / 2 ms and the RSTU claim, plus the unchanged rows around
them. All match `phy.ts`, `ranging.ts`, `position.ts`, `scenario.ts` or the spec. No `any`,
`@ts-ignore` or `@ts-expect-error` in the added test code. The glossary was not touched and did not need
to be — its "40 bits wide here" was already correct.

### Remaining

No blocking findings, no minor findings. One optional wording nit carries over from the first round and
was never a finding: "代价是一倍的空口时间" for "twice the airtime" (Guide ZH and the glossary's DS-TWR
item) — "多一倍" or "两倍" is unambiguous; change both or neither.
