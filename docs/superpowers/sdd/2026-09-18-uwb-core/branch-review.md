# Whole-branch review — `feat/uwb-ranging` (9c6cb69..e559d8e)

Reviewer: Fable 5.1, 2026-09-19. Worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, clean at e559d8e
(the Task 10 scratch file `tests/uwb/zz-probe.test.ts` is gone). Inputs: the spec, the plan, the full
diff, the ten task reviews and the ledger. Items already parked in the ledger (T1, T6, T7, T8, T9) are
not repeated here.

Verification run:

- `npx vitest run` → 92 files, **994 tests passed**, exit 0.
- `npx tsc -b` → clean, exit 0. `npx vite build` → built, exit 0.
- `tests/fixtures/lesson-hashes.json` diff against the base: seven `+` lines, no `-` lines — the
  "existing scenarios bit-identical" guarantee holds.
- A 400-seed measurement of the uwb-intro scene and a 300-seed measurement of the uwb-dstwr scene
  (scratchpad script, `vite-node`) to check the noise figures the lessons state — see finding 1.
- IEEE Std 802.15.4-2024 text and table of contents from the standards corpus
  (`D:\ai_patent_experiments\...\ieee_standards\text\802154-2024.json`) for the RMARKER definition,
  the FoM byte layout and tables, the RSTU table, Figure 10-199 / 10-200 / 10-225 and the clause
  numbers the code and lessons cite — see findings 3 and 4.

## Verdict

**CHANGES REQUIRED** — the engine, seams, determinism and standard formulas are right, but the
range-noise sigma the spec, `rangeSigmaM`, two lessons and their tests all state is twice the value
the simulator actually produces, and that number feeds the error ellipse the next plan builds on.

Findings by severity: 1 blocking, 3 important, 9 minor.

## Findings

### 1. BLOCKING — the stated range-noise sigma is 2× the simulated one, in the spec, the solver and two lessons

**Where.** Spec §"Position" (`σ_r = √2·c·tsNoisePs (two noisy receive counters per range)`) and
§Part D lesson 1 ("σ_r = √2·c·100 ps = 4.2 cm"); `src/uwb/position.ts:454-458` (`rangeSigmaM`);
`src/course/uwb/uwb-intro.ts:107-108` ("against 4.2 cm of range-noise sigma" / "测距噪声的标准差是
4.2 cm"); `src/course/uwb/uwb-sstwr.ts:129` ("timestamp noise, whose 1-σ is 4.2 cm" / "它的 1σ 是
4.2 cm"); pinned by `tests/course/uwb-intro.test.ts:33,455`, `tests/course/uwb-sstwr.test.ts:41,433`,
`tests/uwb/position.test.ts:35`, `tests/uwb/network.test.ts:53`, and compared against in
`tests/course/uwb-dstwr.test.ts:702`.

**What.** SS-TWR is `tof = (Tround − Treply) / 2`. Tround carries one noisy receive stamp (rxResp at
the tag), Treply carries one (rxPoll at the anchor); the two noises add, then the half divides:
`σ_tof = σ_ts·√2 / 2 = σ_ts / √2`, so `σ_r = c·σ_ts/√2 = 2.12 cm` at 100 ps, not `√2·c·σ_ts = 4.24 cm`.
The spec's parenthetical reason ("two noisy receive counters") is exactly why it is `/√2`, not `×√2`.
Measured on the branch itself: uwb-intro raw error over 400 seeds has σ = **2.05 cm** (corrected
6.29 cm — the CFO term, as lesson 1 says); uwb-dstwr per-slot σ = 1.82 / 1.87 / 1.99 / 1.97 cm; the
DS-TWR fix has RMS error **1.97 cm** where the solver's `Σ = σ_r²·(JᵀJ)⁻¹` predicts a 3.0 × 3.0 cm
1-σ ellipse (RMS 4.2 cm). Lesson 3 gets DS right (1.8–1.9 cm, from the weighted derivation in its
test), so a learner reading the track is told SS noise is 4.2 cm and DS noise 1.9 cm — that DS-TWR
halves the timestamp noise, which it does not (2.05 vs 1.9).

**Why it matters.** This is the branch's one physics number that is wrong, and it is the one the
positioning plan inherits: the inspector's "error ellipse (1-σ)" row is 2.1× too large today, and the
spec's lesson-5 pin "the LOS position error within the 3σ ellipse" would be vacuous (a 9σ box).
It is the stated-vs-simulated drift class the project pins tests against, and the tests pin the wrong
statement (`expect((SIGMA_R * 100).toFixed(1)).toBe('4.2')`).

**What to do.** `rangeSigmaM(tsNoisePs) = C_M_PER_NS · (tsNoisePs/1000) / Math.SQRT2` (exact for SS;
for DS the true figure is 0.62–0.65·c·σ_ts depending on the slot — either keep the SS value as the
documented conservative model for the ellipse, or pass the method in). Fix the spec formula and the
lesson-1 pin sentence, lesson 1 line 107/108 ("2.1 cm"), lesson 2 line 129 ("2.1 cm"), the five test
sites above, and the position test's "circle of radius σ/√2" (which stays true in form). Re-check the
3σ bounds after the change: the sstwr perfect-crystals run has a −6.1 cm raw error that is 2.97σ at
the corrected sigma, so a `< 3σ` assertion would be one draw from flapping — pin the values (the
house style) or use 4σ for the envelope tests. Word budget: every lesson is within ~30 words of the
25-minute ceiling, so replace digits, do not add sentences.

### 2. IMPORTANT — `UwbNodeView.slot` never returns to null; the inspector and the 3-D label show a stale slot for 90 % of every block

**Where.** `src/uwb/view.ts:366-367` documents `slot` as "or null between rounds", but `applyUwbRecord`
only ever sets it (`UWB_ROUND` → 0, `UWB_SLOT` → n); nothing at round end clears it. Consumers:
`src/uwb/ui/UwbInspector.tsx:306` (row "ranging slot"), `src/scene/nodes.ts:311` (`statusText` →
"slot 9" over the tag's head).

**What.** After a DS round the tag's lane reads "slot 9" from 20 ms to 200 ms while the device is
idle with the radio off; the anchors, which never receive `UWB_ROUND`/`UWB_SLOT`, read "—" and
"0 / 0 · 0 rounds" forever although their per-peer `n` climbs (`view.ts:382-396` only fires for the
record's `node`, the tag).

**Why it matters.** The spec's `slot: number | null` contract and lesson 4's whole point ("a tag's
radio is on for its own round only", radio-on share 10 %) are contradicted by the UI for the idle 90 %.
The positioning plan's overlay ("fades over the block") has no round-end signal to key on either.

**What to do.** Give the view a round-end: either an explicit record (`UWB_ROUND_END { node }` — a
spec amendment, cheapest for the reducer and the overlay) or keep `untilNs` from `UWB_ROUND` in
`UwbNodeView` and have the inspector/label treat `t ≥ untilNs` as between rounds. Update the anchors'
`block`/`round` from their own `UWB_RANGE` (which carries both) or from a per-participant round record.

### 3. IMPORTANT — clause citations that do not match IEEE Std 802.15.4-2024 (the honesty rule)

Verified against the 2024 table of contents and text:

| Cited | Where | Actual clause |
|---|---|---|
| "§10.29.1.6" for the FoM byte and its three tables | `src/course/uwb/uwb-sstwr.ts:52-53` (both languages), `:107-108`; `src/uwb/phy.ts:126` | **§10.29.1.7 Ranging FoM**; §10.29.1.6 is Crystal characterization (tracking offset/interval — that part of the citation is right) |
| "§10.29.1.2.3 and Figure 10-199 give the three-message double-sided computation" | `src/course/uwb/uwb-dstwr.ts:49-50`; spec line 165 | **§10.29.1.2.4 DS-TWR with three messages**; §10.29.1.2.3 is four-message DS-TWR. Figure 10-199 is right |
| "standard §6.9.7", "§6.9.7.1", "§6.9.7.2" for session/block/slot | `src/uwb/session.ts:297`, `src/model/scenario.ts` (`UwbSessionCfg` comments) | **§10.32.2 Ranging block and round structure** (§10.32.3 modes); there is no ranging clause 6.9 in the 2024 edition |
| "standard §6.9.1 SP1 PPDUs carrying ranging IEs" | `src/uwb/frames.ts:220` | SP1 is §16.2 (Table 16-1 / Figure 16-3); the IEs are §10.29.8 and §10.32.9 |
| "IEEE 802.15.4z-2020 §7.2, §7.4.4.x (ranging IEs), §15.3 (HRP UWB PPDU), §16.2 (SP1 STS)" | `src/uwb/frameFields.ts:47-48` | §7.2 ok; the ranging IEs are **§10.29.8.1 RRTI, §10.29.8.3 RRMC, §10.29.8.4 RMI, §10.32.9.1 ARC, §10.32.9.8 RDM** (§7.4.4 is the generic Nested IE format); **§15.3 is the CSS PHY's chirp waveform** — the HRP UWB PPDU is §16.2; and the branch cites the 2024 edition everywhere else |

**Why it matters.** The spec's honesty rule ("every constant carries its tag") is the reason a learner
can trust a "standard" label; two of these are learner-facing sentences in both languages. Fix the
comments and the two lesson sentences (digit-for-digit, so the word budget is untouched); fix the spec
line 165 while there.

Confirmed correct, for the record: RMARKER = "peak pulse location associated with the first chip
following the SFD" (§10.29.1.1); FoM bits 0–2 / 3–4 / 5–6 / 7 and Table 10-146 values (0 = No FoM,
1 = 20 %, 2 = 55 %, 3 = 75 %, 4 = 85 %, …) exactly as `fomDecode`; RSTU = 416 chips ≈ 833.33 ns
(Table 10-145); the standard's own note that DS-TWR "does not require symmetric reply times" and the
"low picosecond" clock error (§10.29.1.2.3, citing 802.15.8-2017 Annex D); the RDM IE assigning slots
for time-scheduled ranging (§10.32.2) and "RCM & I1" in Figure 10-225; the SS-TWR and DS-TWR formulas,
the corrected-SS sign convention (`coffs = e_tx − e_rx`, positive when the transmitter runs fast —
matches §10.29.1.6.2's sign rule) and the error expansions in lessons 2 and 3 re-derived by hand.

### 4. IMPORTANT — the ranging schedule has no guard that a frame fits its slot

**Where.** `src/model/scenario.ts` (`slotRstu` ≥ 300, multiple of 3), `src/uwb/session.ts:331-337`
(`roundPlan`), `src/uwb/device.ts:256-262` (`closeSlot`).

**What.** The schema allows a 250 µs slot; a four-anchor Final is 236.6 µs plus flight, and
`uwbFinalBytes(N) = 14 + 12N` crosses a third Reed–Solomon block at N = 8 (110 octets, ~283 µs) and
the PHR's 127-octet limit at N = 10. When a PPDU outlives its slot the receiver's `closeSlot` fires
`UWB_TIMEOUT`, drops the expectation and the late `RX_OK` is silently ignored (`onRxOk`, state check
at `device.ts:198-206`) — no error, just a round that mysteriously loses every anchor.

**Why it matters.** Nothing in this slice hits it (2 ms slots, ≤ 4 anchors), but the editor and the
lesson-4 "600 RSTU slots" variant in the next plan expose `slotRstu` to the user, and the failure
mode is a silent timeout rather than a schema message.

**What to do.** In the schema's `superRefine` (or `UwbNetwork`'s constructor, next to the
rounds-per-block check), require `rstuNs(slotRstu) ≥ max PPDU of the round + max propagation` —
`uwbPpduNs(uwbFinalBytes(anchors))` is the longest frame — and cap `anchors` so the Final stays under
127 octets. Make it a schema issue with a message, as the block-fit rule already is.

### 5. MINOR — the Final's reply times are decoded as one 24-octet RRTI IE where the spec says N × 6

`src/uwb/frameFields.ts:116-126` emits a single `ieRrti` row of `n × RRTI_IE_BYTES` ("4 reply times
(treply2), one per anchor"); the spec's frame table says "N × RRTI IE 6" and `UwbInfo.ies` lists
`'RRTI'` once. The Task 10 fix rewrote lesson 3 (`uwb-dstwr.ts:304-305`, "one RRTI IE of 24 holding
the four Treply2 values, 6 each") to match the decoder rather than the spec. The standard's RRTI IE
(§10.29.8.1) carries one reply time. Pick one: the decoder emits N rows of 6 (matches spec and
standard; lesson 3's sentence reverts to "four RRTI IEs of 6"), or amend the spec. Either way the
octet sum is unchanged.

### 6. MINOR — `localeCompare` orders same-instant deliveries (determinism across machines)

`src/uwb/channel.ts:173-174` sorts a batch of arrivals by `rxId.localeCompare(...)` (and
`src/engine/channel.ts:226` does the same for Wi-Fi, pre-existing). `localeCompare` without a locale
uses the host ICU collation; for the ASCII ids in the lessons it equals code-unit order, but ids with
punctuation or case differences can order differently between ICU builds, and that order is the `seq`
order of the `RX_START` records, which is in the timeline hash. Lesson 2's four equidistant anchors
(all at 12 ns) are exactly such a batch. Use a plain code-unit comparison (`a < b ? -1 : a > b ? 1 : 0`)
in both channels.

### 7. MINOR — runtime import cycle `ui/format.ts` ↔ `uwb/format.ts`

`src/ui/format.ts:5` imports `fmtUwbRecord`; `src/uwb/format.ts:8` imports `fmtNs, fmtUs` back from
`ui/format.ts`. It works only because both are hoisted function declarations. It is the one new cycle
on the branch (the `model/records` ↔ `uwb/records`, `model/frames` ↔ `uwb/frames`, `model/frameFields`
↔ `uwb/frameFields` and `model/view` ↔ `uwb/view` pairs are type-only in the uwb→model direction and
erase). Move `fmtNs`/`fmtUs` to a leaf module (or have `fmtRecord` pass them in) so the seam stays
one-directional and a future `madge --circular` is clean.

### 8. MINOR — the decoded "Sequence Number" is invented

`src/uwb/frameFields.ts:160` prints `round r, slot s` in the Sequence Number row because no UWB
`FrameDesc` carries `seqNo`. Either stamp a real per-device sequence number in `UwbDevice.send`
(a one-line counter; the standard's field is 8 bits) or label the row "not modelled". Showing a
schedule tuple under a header named Sequence Number is the kind of thing a learner copies.

### 9. MINOR — FoM ignores walls when `nlos` is off

`src/uwb/channel.ts:154` sets `nlos: nlosNs > 0`, so with `cfg.nlos = false` a path through a brick
wall reports the LOS byte 0x16 ("97 % within 0.5 ns"). The spec's FoM mapping is by path ("a path
through any wall → 75 %"), and `nlos` is described as the delay switch, not the FoM switch. Derive
`nlos` from `wallsCrossed(...).length > 0` independently of the switch, or document that the "ideal
timestamp lab" also idealises the FoM.

### 10. MINOR — FoM "within 0.5 ns" is an interval width, not ±

§10.29.1.7: "The duration of the Confidence Interval … is the duration of the entire interval, not a
plus or minus number." Lesson 2 (`uwb-sstwr.ts:107-108`) converts "97 % within half a nanosecond" to
"15 cm of one-way flight", i.e. ±0.5 ns; the standard's reading is ±0.25 ns ≈ 7.5 cm. `fomText`'s
"97 % within 0.5 ns" is acceptable shorthand; the lesson's centimetre figure should halve (or say "a
half-nanosecond window").

### 11. MINOR — two definitions of "slots per round"

`src/model/scenario.ts` `uwbSlotsPerTag(method, anchors)` and `src/uwb/session.ts` `roundPlan` both
encode `ss ? N+1 : 2N+2`; `UwbNetwork` re-checks the block fit at run time precisely because the two
can drift. `model/scenario` already imports nothing from `src/uwb`, but `model/view` does, so the
direction is allowed: have `roundPlan` call `uwbSlotsPerTag` (or move the helper to `uwb/session.ts`
and import it into the schema) and drop the duplicate.

### 12. MINOR — dead or unused exports in `src/uwb`

`metresToNs` (`ranging.ts:191`), `UWB_CHIP_HZ`, `RCTU_PS`, `COUNTER_BITS` (`phy.ts`, only used to
derive siblings — fine as named constants but not imported anywhere), `Fix.residualM` and
`Fix.iterations` (computed, never read), `UwbChannelCfg` (internal only). `firstUwbTimeout`
(`lessonKit.ts`) is unused until lesson 4 — fine. Nothing in `src/uwb` reaches into Wi-Fi internals
beyond `engine/events`, `engine/rng`, `engine/hash`, `engine/propagation.wallsCrossed` and the
`model/*` types, and nothing in `src/engine`/`src/model` reaches into `src/uwb` except the documented
hooks — the seam is as the spec drew it.

### 13. MINOR — small spec/implementation mismatches to record

- Spec frame table: "RMI IE 13 (address 2, reply time 4, round-trip time 4)" — 2 + 2 + 4 + 4 = 12;
  the code uses 13 as the spec's total says. Make the field list add up (one octet of control, say).
- Lesson titles in ZH differ from the spec's (`重要的是时间戳，而非吞吐量` vs `时间戳，而非吞吐量`;
  `应答时间里藏着的那只时钟` vs `回复时间里藏着的时钟`; `两次往返，把时钟消掉` vs `两次往返，抵消时钟`).
  The lessons' versions read better; update the spec.
- `applyRecord` dispatches the six `UWB_*` types by name, not by prefix as the spec says; the
  behaviour is identical and the switch is exhaustive — no change needed, but say so in the spec.
- `tests/uwb/session.test.ts` holds the pure schedule tests; the timeout / three-tag / idle-time tests
  the spec lists under it live in `network.test.ts`. Fine; the spec's test list is stale.

## What was checked and found sound

- **Engines and seams.** `Simulation` wraps every Wi-Fi structure in `if (ap)`; the UWB network
  forks from `root` without advancing it (`Rng.fork` is pure), so a Wi-Fi + UWB scenario replays the
  Wi-Fi timeline unchanged (`network.test.ts` proves it; the hash fixture only gained keys). The
  traffic fork index is the `sc.nodes` index and lesson scenarios list UWB nodes last. `laneIds`,
  `initViewState`, `applyRecord`, `FrameDesc.uwb`, the six UI hooks and the no-AP audit are all as
  specified; `cloneView` is `structuredClone`, so snapshots do not alias `uwb.ranges`.
- **Determinism.** No `Date`/`Math.random`/`performance.now` in `src/uwb` or the lessons. Event order
  is (t, phase, seq) with FIFO seq; the block layout queues every slot and `endRound` before any
  device runs, so a round's `endRound` precedes the next tag's slot 0 at the same instant. Each node's
  draws come from its own `hashStr(id#uwb)` stream in a fixed per-event order (ts noise, then coffs).
  Same-instant arrivals are batched and ordered by receiver then power, not by call order (finding 6
  is the only caveat). The hash covers `t:seq:type` only, so record key order is irrelevant.
- **Standards.** Formulas, RMARKER, RCTU/RSTU, FoM encoding, the corrected-SS sign, the block/round/
  slot structure and who-computes-what in one-to-many SS/DS-TWR all match the 2024 text; the lessons'
  arithmetic (0.12 ps / 35 µm; 20 ns / 6.0 m; 3.0 cm per ms; 0.23 ps; 1 277 952 000 RCTU; 9.56 % /
  9.67 %; 496 bits / two RS blocks; GDOP 1.00; +12 octets and two slots per extra anchor) re-derives.
- **Course.** The three lessons teach what Part D says, in the right order; every quoted number is
  pinned; ZH tracks EN sentence-for-sentence (the translations are idiomatic, not literal, and carry
  the same numbers and citations — including the two wrong clause numbers). Seed-specific sentences
  are pinned and flagged as draws ("one draw from those four distributions"). The only content errors
  are findings 1, 3 and 10.

## Carry to the positioning plan

1. Fix `rangeSigmaM` (finding 1) **before** writing lesson 5 — its "within the 3σ ellipse" pin and
   the GDOP closed forms are meaningful only with the right σ_r; with the current value the ellipse is
   2.1× too large and the test cannot fail.
2. A round-end signal (finding 2) is what the overlay's "rings fade over the block" needs; while
   there, stamp `block` onto `UwbRangeView` so rings from a previous block can be told from this one.
3. The scene overlay must use the `effects.ts` axis convention (`{ x: pos.x, y: pos.z, z: pos.y }`);
   anchors at z = 2.2 m will sit above the floor plane the ellipse is drawn on.
4. Editor (deferred by design, but the current state to start from): `FloorPlanEditor.tsx:393,420`
   draw UWB nodes as green STA circles; `deleteNode` (`:196`) and the row button (`:426`) still refuse
   to delete the AP unconditionally; `planOps.ts` spawns only STAs and AMP tags; there is no session
   section and the Guide/Glossary have no UWB entries.
5. Add the slot-fit and anchor-count guards (finding 4) before exposing `slotRstu` and node spawning.
6. `tests/course/uwb-*.test.ts` bounds sit at 3σ with one pinned draw at 2.97σ; the next lessons
   should pin values and use a wider envelope for the "within noise" claims.
7. Inspector BSS totals list UWB lanes (parked in T7) — becomes visible in the mixed lesson-5 scene.
8. The word budgets: all three lessons are within 8–30 words of the 25-minute ceiling; lesson 4 and 5
   authors should budget from the start.

## Re-review (fix wave)

Reviewed `44d2ec2..99888ec` (six commits on top of the amended spec `7fcd6ef`; the unrelated plan
commit `98eab75` ignored) against the 13 findings above and the parked per-task minors, from the
review package `fix-wave.diff` and the implementer's `fix-wave-report.md`, with the files re-read
where the diff context was not enough.

Verification run:

- `npx vitest run` → 92 files, **999 tests passed**, exit 0. `npx tsc -b` → exit 0. `npx vite build`
  → built, exit 0. Worktree clean.
- Fixture diff `e559d8e..HEAD` of `tests/fixtures/lesson-hashes.json`: exactly the seven `uwb-*` keys
  changed (for `UWB_ROUND_END`); no Wi-Fi, AMP or household key moved — the `localeCompare` →
  `byCodeUnit` swap in `src/engine/channel.ts` left every existing timeline hash unchanged.
- Runtime import graph re-checked: `src/uwb/phy.ts` imports only types, so `model/scenario.ts` →
  `uwb/phy.ts` is acyclic; `ui/format.ts` ↔ `uwb/format.ts` is broken by the new leaf
  `src/ui/fmtTime.ts`; no `localeCompare` remains in `src/`.
- Slot-fit arithmetic re-derived from the chip constants: `uwbSlotFitNs(5) = 249 110`,
  `uwbSlotFitNs(6) = 267 572` (86 octets = 688 bits = three RS blocks), `rstuNs(300) = 250 000`, so
  the pinned boundary (five fit, six do not) is right and the brief's four-anchor example was indeed
  wrong; `uwbFinalBytes(9) = 122`, `(10) = 134`; the default 2 ms slot clears `uwbSlotFitNs(9) =
  304 295`.

### Verdict

**APPROVED**

### Finding-by-finding

| # | Ruling | Closed by | Checked |
|---|---|---|---|
| 1 (blocking) σ_r | `c·σ_ts/√2` | `44d2ec2` | `rangeSigmaM` and its doc comment; `position.test.ts` pins 0.0212 and the closed form; lesson 1 line 107/108 and lesson 2 line 129 say 2.1 cm in EN and ZH; `uwb-intro.test.ts:33,271,291`, `uwb-sstwr.test.ts:41,445`, `network.test.ts:53` moved; the corrected-SS envelopes now use `hypot(σ_r, ½·Treply·σ_cfo)` (the quantity a corrected reading actually carries); the perfect-crystals "within noise" bound is 4σ so the −6.1 cm draw (2.9σ) cannot flap; `uwb-dstwr.test.ts:708` `max(σ_ds) < rangeSigmaM` is now a real assertion (1.9 < 2.12). Spec lines 181–183 and 309 amended. The `device.ts` header comment corrected in `1bbe167`. |
| 2 (important) stale slot | round-end record | `1bbe167` | `UWB_ROUND_END { node, block, round }` emitted by the tag after `solveFix`; reducer clears `slot` and sets block/round; anchors take block/round from their own `UWB_RANGE`, tags do not (a peer's range would overwrite the round in progress — the right call); `fmtUwbRecord` and `fmtRecord` cover the seventh type; view test covers tick-then-clear, the anchor path and the untouched anchor; the snapshot/replay test still passes over the extended record list. Spec line 252 amended. |
| 3 (important) citations | every row | `026c661` | §10.29.1.7 in lesson 2 (EN + ZH, both sentences) and `phy.ts`; §10.29.1.2.4 in lesson 3 (EN + ZH) and the spec; §10.32.2/§10.32.3 in `session.ts` and `scenario.ts`; §16.2 + §10.29.8/§10.32.9 in `frames.ts`; the 2024 edition and the five IE clauses in `frameFields.ts`. Tests pin the new clause strings. No `6.9.7`, `§15.3`, `802.15.4z` or misplaced `10.29.1.2.3` left in `src/` or the spec. |
| 4 (important) slot fit | schema + engine | `bb57ac0` | `superRefine` adds the slot-fit issue (with the µs it needs) and `anchors ≤ 9`; `UwbNetwork` mirrors both in ns; test pins 5/6 anchors at 300 RSTU and 9/10 anchors. Spec lines 208–209 amended. |
| 5 RRTI rows | N × 6 | `5b95351` | decoder emits one `ieRrti` row per anchor named for it; the RMI row no longer repeats treply2; lesson 3's step and tryThis sentences reverted to "an RRTI IE of its own" / "four RRTI IEs of 6" (EN + ZH), pinned on the renderer. |
| 6 localeCompare | code-unit order | `5b95351` | `byCodeUnit` in `engine/hash.ts`, used by both channels; Wi-Fi hashes unchanged (above). |
| 7 import cycle | leaf module | `5b95351` | `ui/fmtTime.ts`; `ui/format.ts` re-exports `fmtNs`/`fmtUs` so callers are untouched. |
| 8 sequence number | real counter | `5b95351` | `UwbDevice.seqNo`, 8-bit wrap, stamped in `send` on a copy of the builder's FrameDesc (the builders stay pure and their equality tests still hold). |
| 9 FoM vs `nlos` switch | by path | `5b95351` | `UwbChannel.obstructed()` from `wallsCrossed`; channel test asserts `nlos: true` with the switch off. |
| 10 FoM interval | ±0.25 ns | `5b95351` | lesson 2 says "a half-nanosecond window, which is ±0.25 ns, about 7.5 cm" (EN + ZH); test pins 7.5. |
| 11 two slot definitions | one | `bb57ac0` | `uwbSlotsPerTag` and `rstuNs` in `uwb/phy.ts`; `roundPlan` and the schema both call them. Placing them in the leaf rather than `session.ts` is the better choice: it keeps zod out of the engine. |
| 12 dead exports | pruned | `5b95351` | `Fix.iterations` gone, `UwbChannelCfg` internal; `metresToNs` kept for the lesson tests (allowed). |
| 13 spec nits | spec | `7fcd6ef` | RMI IE 13 now itemised (control 1 + address 2 + reply 4 + round-trip 4 + header 2); ZH titles taken from the lessons. |
| parked T1/T6/T7/T8/T9 | — | `99888ec`, `5b95351` | IE constants built from their fields and the frame helpers sum them (values unchanged, phy tests green); `clearExpectation`; `uwbFomText` with `fomWithin`/`noFom` in both tables and the ZH phrase pinned; `EventLog` decodes inside try/catch like `FrameDetail`; `trackHeadings` extracted and tested for the empty, single-track, alternating and filtered cases; numeric min/max in the span test; the FoM scale index decoded rather than assumed. |

### Remaining findings

None blocking or important. Two notes for the ledger, no action required in this wave:

- Lesson 3's "1.9 cm of 1-σ in slots 1 and 4, 1.8 cm in slots 2 and 3" is the test's analytic
  weighting; a 300-seed measurement of the engine gives 1.82 / 1.87 / 1.99 / 1.97 cm — the same
  numbers to within the sampling error of the estimate, so the sentence stands.
- The BSS-totals table listing UWB lanes and the editor's green STA circles for UWB nodes are
  accepted carry-overs to the positioning plan (its Task 2 names both).

The "carry to the positioning plan" list above is reduced to items 3, 4, 7 and 8; items 1, 2, 5 and
6 are closed by this wave.
