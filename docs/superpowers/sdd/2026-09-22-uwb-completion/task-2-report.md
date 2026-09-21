# Task 2 — timestamp noise scales with SNR; RIF start per the draft clause

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`, on top of T1 (`d2a2416`).

## Part A — σ_ts(SNR) (decision 1)

### The model, in `src/uwb/phy.ts`

New, all tagged `model`:

| Name | Value | What it is |
| --- | --- | --- |
| `UWB_TS_ACCUM_GAIN_DB` | `10·log10(SYNC_SYMBOLS)` = 18.06 dB | the gain the leading-edge estimator has over the packet detector: it accumulates the whole 64-symbol SYNC field. Derived from the SHR `phy.ts` already sizes, so a different preamble moves it. |
| `UWB_NOISE_FLOOR_DBM` | `UWB_RX_SENS_DBM − UWB_TS_ACCUM_GAIN_DB` = −111.06 dBm | the floor a reception's SNR is measured against for timing. |
| `TS_SNR_REF_DB` | 20 | the SNR the session's `tsNoisePs` is quoted at. |
| `TS_SIGMA_MAX` | 10 | the cap, reached exactly at 0 dB. |
| `tsNoiseScale(snrDb)` | `√(10^((20 − snr)/10))`, clamped to [1, 10] | the Cramér-Rao shape: a ToA estimate's variance goes as 1/SNR. |
| `uwbSinrDb(rxDbm, foreignDbm)` | `rx − 10·log10(noiseMw + foreignMw)` | SNR, or SINR when the mediator reported foreign power over the reception. |
| `tsSigmaNs(tsNoisePs, snrDb)` | `(tsNoisePs/1000) · tsNoiseScale` | the one definition every mode's draw is scaled through. |

### Where the draws changed

- `src/uwb/device.ts` (`onRxOk`): `sigmaNs = tsSigmaNs(cfg.tsNoisePs, uwbSinrDb(info.rssiDbm, info.foreignDbm))`;
  the `gaussian(this.rng)` draw is the same draw, in the same place in the stream — only its scale moved. This
  covers TWR, DL-TDoA and UL-TDoA, all of which take their stamp here.
- `src/uwb/device.mms.ts` (`evaluateTrain`): the train is stamped at the SNR it **combined** to,
  `uwbSinrDb(rxDbm + gainDb, first.foreignDbm)` — the combining gain buys timestamp precision, which is the
  mode's point. `TrainFragment` gained a `foreignDbm` field (carried from `UwbRxInfo`) so a Wi-Fi neighbour
  costs a train precision and not only fragments.

### Why the floor is sensitivity − 18.06 dB and not sensitivity

Decision 1 fixes the shape, the reference and the cap but not what "SNR" is measured against; the engine had no
noise floor at all (the channel computes RSSI, a sensitivity test and an SIR against foreign power). Two
candidates were tried:

- **Floor = sensitivity** (SNR = margin over −93 dBm). Physically defensible, but it puts an ordinary 5 m
  line-of-sight link at 14.5 dB, i.e. 1.9× worse timestamps: **34 of 51** record-hash keys moved and **75**
  course assertions broke, including every taught range-accuracy number in the UWB course in EN and ZH. That
  is a course rewrite, not T2, and it contradicts decision 1's own expectation that default scenes are at or
  above the reference.
- **Floor = sensitivity − the preamble accumulation gain** (chosen). A frame *at* sensitivity still times at
  18.1 dB, so the quoted precision holds out to ~13 m line-of-sight and degrades on the links the plan calls
  weak: through walls, at the MMS delivery floor (a fragment is delivered 12 dB below 4z sensitivity), and
  whenever foreign power is on the air. Two keys move, one pin moves.

Concern for the reviewer: with this floor the *worst* a delivered 4z frame can be timed at is 1.25 × `tsNoisePs`
(at sensitivity exactly). The deep end of the curve — 2× to the 10× cap — is reached only by MMS trains and by
interference-limited receptions. If the plan owner meant the harsher reading, the change is one constant
(`UWB_NOISE_FLOOR_DBM = UWB_RX_SENS_DBM`) plus a full re-pin of the UWB course.

Not changed, deliberately: the *reported* sigmas (`rangeSigmaM`, `dlDiffSigmaM`, `ulDiffSigmaM`, the fix
ellipses) are still computed from the session's quoted `tsNoisePs`, so on a weak link the ellipse now
understates the scatter it draws. Making the report link-aware would move every `UWB_POSITION` record in the
course; it is left as a follow-up.

### Fixture keys that moved

| Key | Weakest link's SNR | Why |
| --- | --- | --- |
| `uwb-mms` | train combines to **19.84–20.02 dB** (anchor-1 ↔ tag-1, 13.0 m through 24 dB of wall) | the trains that land under 20 dB are stamped at up to 1.02 × σ_ts |
| `uwb-mms-numbers` | same scene, same numbers | same |

Every other key (49 of 51, including all four `uwb-mms#…` / `uwb-mms-numbers#…` variants, whose eight-fragment
trains combine to 24.05–24.24 dB) is byte-identical. `tests/engine/lesson-hashes.test.ts` (air-only timeline)
never moved at all.

### Pins that moved

- `src/course/uwb/uwb-mms-numbers.ts`, the "noise floor under all of them" cell: `2.05 cm over 21 ranges` →
  `2.10 cm over 21 ranges`. The cell is an `N(...)` shared number, so EN and ZH move in lockstep with one edit;
  the surrounding prose ("two receive stamps alone are worth 2.1 cm") states the *theoretical* floor and is
  still exactly right.
- `tests/course/uwb-mms-numbers.test.ts`: the same 2.05 → 2.10, in the assertion, the test title and the
  comment (which now names the 19.8–20.0 dB combined SNR that explains it). The test's own sanity bound
  (`rms < 1.2 × rangeSigmaM`) still holds.

### Editor / docs

- `src/ui/i18n.ts` `uwbTsNoiseHint`, EN and ZH: the quoted 1-σ is "what this receiver achieves at 20 dB of SNR:
  a quieter frame is stamped worse, as sqrt(20 dB / SNR), up to ten times this value".
- `src/ui/Guide.tsx`, the UWB model-numbers paragraph, EN and ZH.
- `README.md`, the UWB model-numbers table row.

## Part B — the RIF start offset (decision 2)

**Verified, no behavioural change to the default trains; the rule is now named and cited.**

P802.15.4ab **D5.0 itself is not in the corpus** (`…/references/uwb_tg4ab` holds contributions and comment
databases, no balloted draft). The latest draft *clause text* available there says, in the editor's instruction
of **15-24/0235r2** for **§10.38.5 "UWB MMS ranging phase"** (the clause was §10.35.5 before renumbering; the
same sentence appears in the proposed texts 15-23/0371r1 and 15-23/0412r0):

> (paraphrased) without RSFs the first RIF may go out RpRifOffset into the phase; with RSFs, RpRifOffset after the last RSF started; RpRifOffset is 2 ms when RSFs were sent and 0 ms otherwise.

The last RSF starts at millisecond X − 1, so the first RIF is at X − 1 + Z and RIF number y (counted from 0) at
**X + Z − 1 + y** — exactly the rule `mmsLayout` already used. It is now one named function,
`rifStartMs(rsfs, gapMs, index)` in `src/uwb/mms.ts`, carrying the clause citation and used by `fragmentSlot`,
`slotFragment` and the ranging-phase length, so the three cannot drift apart.

One case did change, and it is the clause's: an **X = 0 (RIF-only) train with Z = 2** used to be pushed one
millisecond into the phase; §10.38.5 says RpRifOffset is 0 ms when no RSF was sent, so its RIFs now open the
phase. No shipped scene or mandatory operating set has X = 0 (`MMS_SETS` are X = 16 or X ≥ 1), so no fixture
moved; the schema does allow the combination.

## Gates

- `npx tsc -b --noEmit` — clean.
- `npx vitest run` — 133 files, 2261 tests, all green.
- New `tests/uwb/ts-noise.test.ts`, 9 tests: σ = `tsNoisePs` at and above 20 dB; exactly 10× at 0 dB; the cap
  held to −∞; the floor/foreign-power arithmetic; a two-anchor DS-TWR scene (2 m vs 26 m, 300 blocks, both
  links delivered every round) whose far anchor's ranges scatter wider than the close one's by about the scale
  factor; and the pairwise MMS lesson variant, every detected train of which combines past the reference — the
  reason its committed record hash is untouched.
