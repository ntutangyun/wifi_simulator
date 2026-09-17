# Slice S1 (Tier 1 MAC foundations): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkboxes.

**Goal:** Tier 1 MAC foundations on a standard-aligned noise/SINR/detection model, with queue limits, a field-level frame decoder, widget blocks and a tiered course.

**Architecture:** Engine changes first (E1, E2), test-first, on branch `feat/tier1`. One re-baseline of every lesson follows. UI infrastructure is built in parallel in a separate worktree. New lessons live in their own files under `src/course/tier1/` and are imported into `LESSONS`, so authors don't collide. The tiered course restructure comes last.

**Tech stack:** TypeScript, React, Vitest, tsx probes (absolute imports, scratchpad).

**Spec:** `docs/superpowers/specs/2026-09-18-tier1-mac-foundations-design.md`

## Global constraints

- Baseline: `npx vitest run` → 52 files, 393 tests green.
- Noise: N(W) = −174 + 10·log10(W·10⁶) + 7 dBm; 20 MHz → −93.99 dBm.
- Required SINR = sens(20 MHz) + 100.99 − 10 dB (non-HT 6 Mb/s 8.99; 54 Mb/s 25.99; HE MCS 11 38.99; EHT MCS 13 44.99).
- Rate ceiling margin: 3 dB. Preamble detection: RSSI ≥ −82 dBm and SINR ≥ 4 dB.
- Queue defaults: limit 500 MSDUs per access category; lifetime 500 ms.
- All user-visible strings are EN+ZH. Every empirical lesson claim is pinned in tests/course.
- Commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Noise per width and required SINR (E1.1–E1.3)
**Files:** `src/engine/phy.ts`, `src/engine/channel.ts`, `src/engine/simulation.ts`; test `tests/engine/phy-noise.test.ts`.
- [ ] Failing tests:
  - `noiseDbm(20) ≈ −93.99`, `noiseDbm(160) ≈ −84.96`;
  - `reqSinrDb('nonht',0) ≈ 8.99`, `reqSinrDb('eht',13) ≈ 44.99`;
  - `reqSinrDb` is independent of width;
  - `mcsForRssi('he', rssi, undefined, W)` is the highest MCS with rssi − noiseDbm(W) ≥ req + 3;
  - a channel-level test: a 160 MHz link and a 20 MHz link facing the same co-channel interferer need the same SIR to decode, while a 160 MHz link needs 9 dB more signal against noise alone.
- [ ] Implement:
  - `NOISE_FIGURE_DB = 7`, `noiseDbm(widthMhz)`, `reqSinrDb(mode, mcs)` (throws on an undefined MCS), with `sinrThreshModeDb`/`sinrThreshDb` delegating to it;
  - channel `interferenceMw` starts from `mw(noiseDbm(lock.frame.widthMhz ?? 20))`;
  - `decodeThreshDb` uses `reqSinrDb`;
  - remove `widthPenaltyDb` from thresholds (keep the exported helper for the UI/lessons);
  - replace `NOISE_DBM` users.
- [ ] Full suite: expect lesson-number failures only; note them for Task 4. Commit.

### Task 2: Preamble detection SINR and CCA after own TX (E1.4–E1.5)
**Files:** `src/engine/channel.ts`, `src/model/records.ts` (`RX_MISS`), `src/model/view.ts` (ignore RX_MISS), `src/ui/format.ts`; test `tests/engine/preamble-detect.test.ts`.
- [ ] Failing tests:
  - a frame at −70 dBm arriving while a −68 dBm interferer is on air produces `RX_MISS` at the receiver, no RX_START, and the receiver's next IFS is not EIFS;
  - a radio that ends its own TX while a −75 dBm signal (started during its TX) is on air reports CCA idle;
  - a −60 dBm signal in the same situation reports CCA busy (ED).
- [ ] Implement:
  - on arrival compute SINR = p − 10·log10(noise + Σ other active signals at rid);
  - lock only if p ≥ −82 and SINR ≥ 4, otherwise emit `RX_MISS {node, from, reason:'preambleSinr'}`;
  - track `observed: Set<txId>` per radio, meaning signals whose start was applied while the radio was not transmitting;
  - CCA: busy if a lock is held, OR some observed signal ≥ −82, OR the sum of all signals ≥ −62.
- [ ] Full suite; commit.

### Task 3: Queue limit and MSDU lifetime (E2)
**Files:** `src/model/scenario.ts` (schema + `queue?`), `src/engine/queues.ts`, `src/engine/mac.ts`, `src/engine/simulation.ts` (pass the config), `src/model/records.ts` (DROP reasons); test `tests/engine/queue-limits.test.ts`.
- [ ] Failing tests:
  - with limit 3, the 4th and later arrivals while none can be sent produce `DROP reason queueFull` and no ENQUEUE;
  - with lifetime 50 ms and a peer out of range, MSDUs older than 50 ms are dropped with reason `lifetime` when the MAC next builds a transmission;
  - defaults are 500 and 500 ms.
- [ ] Implement:
  - `AcQueues(limit)`, whose `enqueue` returns false when full;
  - `purgeExpired(ac, nowNs, lifetimeNs): Msdu[]`;
  - the MAC calls purge at the top of `transmitFor`, `transmitDlMu` and `respondToTrigger`, emitting DROP + DEQUEUE + onDequeue;
  - `enqueue` emits DROP when full.
- [ ] Full suite; commit.

### Task 4: Re-baseline every lesson on E1/E2 (agent)
**Files:** `src/course/lessons.ts`, tests/course/*, `tests/engine/*` (expectation-only changes justified by E1/E2), `docs/reports/*` (tamper report regenerated).
- [ ] Re-measure every failing pinned claim; update the prose (EN+ZH) and tests; rewrite claims whose substance changed; report any teaching point that breaks.
- [ ] Regenerate the EDCA tamper report and re-check its narrative.
- [ ] `tsc` clean, suite green; commit per lesson group.

### Task 5: UI infrastructure (agent, worktree, parallel with Task 4)
**Files:** `src/model/frameFields.ts`, `src/ui/FrameDetail.tsx`, `src/ui/i18n.ts` (decoder strings), `src/course/widgets/LinkBudget.tsx`, `src/course/widgets/McsLadder.tsx`, `src/course/widgetModel.ts` (pure computations), `src/course/CoursePanel.tsx` (render `widget` blocks), `src/course/lessons.ts` (Block union type only); tests `tests/model/frameFields.test.ts`, `tests/course/widgetModel.test.ts`.
- [ ] frameFields:
  - every recorded frame kind (data SU, A-MPDU, MU part, ack, ba, rts, cts, trigger, mba, cfend) decodes to fields whose byte counts sum to `frame.bytes`;
  - the PPDU layout durations sum to `frame.txTimeNs`;
  - addresses follow the ToDS/FromDS rules with the AP as BSSID.
- [ ] widgetModel:
  - `linkBudget({txDbm, distanceM, walls[], widthMhz, mode})` returns RSSI, noise, SINR and highest MCS equal to the engine's propagation + `noiseDbm` + `mcsForRssi`;
  - `mcsLadder(mode)` returns `reqSinrDb` per MCS.
- [ ] Render the widgets (sliders, table, waterfall) in the existing dark style; add the decoder's collapsible field table to FrameDetail.
- [ ] `tsc` clean, suite green; commit on branch `feat/tier1-ui`.

### Task 6: Tiered course and renumbering (U3)
**Files:** `src/course/lessons.ts`, `src/course/CoursePanel.tsx`, `src/ui/i18n.ts`, `tests/course/lessons.test.ts`.
- [ ] Failing tests:
  - `TIERS` structure (4 tiers; Tier 1 has modules M1, M2);
  - no lesson title starts with a number;
  - the panel number equals the position;
  - every lesson's `minutes` is within ±5 of words/150 + 5·observe + 5·tryThis, rounded to 5;
  - hidden lessons are not listed.
- [ ] Implement:
  - tier/module metadata;
  - strip the numbers from titles (EN+ZH); where prose says "lesson N", rewrite it to name the lesson ("the backoff lesson") or compute the number;
  - reorder the existing lessons into the S1 order;
  - retime.
- [ ] Commit.

### Task 7: New lessons (agents, parallel, one file each)
**Files:** `src/course/tier1/{radio-primer,roles-stack,frame-anatomy,retries-queues,bianchi,tier1-project}.ts`, each exporting `Lesson`; import them into `LESSONS` in order; tests `tests/course/tier1-*.test.ts`.
- [ ] Each lesson follows the lesson contract: EN+ZH, a scenario, jumps, observe, try-this, a quiz with explanations, and every empirical claim pinned.
- [ ] Bianchi: the lesson states the fixed-point equations; the test solves them for n = 2, 5, 10 legacy stations (CW 15/1023, m = 6) and compares collision probability and normalised saturation throughput with the simulator within the tolerance the lesson states.
- [ ] Commit per lesson.

### Task 8: Verify, merge, push
- [ ] `npx tsc -b`, `npx vitest run`, `npm run build`.
- [ ] Browser: the radio primer widgets respond; the frame decoder shows fields for data/A-MPDU/RTS; Tier 1 lessons load and play; renumbered Tier 2 lessons load.
- [ ] Merge `feat/tier1` into main, run the tests again, push `main`.
