# Slice S1: Tier 1 MAC foundations

Date: 2026-09-18
Parent: `2026-09-18-zero-to-hero-curriculum-design.md`

## Goal

Deliver Tier 1 of the curriculum (12 lessons) on an engine whose MAC-visible PHY behaviour follows IEEE 802.11-2024. Also renumber the existing lessons into the tiered course. Every lesson claim is pinned by a test.

## Engine

### E1. Noise, required SINR and detection

1. **Receiver noise.**
   - Formula: N(W) = −174 dBm/Hz + 10·log10(W·10⁶) + NF, with NF = 7 dB (ns-3's default).
   - W is the width of the PPDU being received.
   - At 20 MHz this gives −94.0 dBm.
   - It replaces the fixed −95 dBm everywhere: interference sums, SINR, and the rate ceiling.
2. **Required SINR per mode/MCS, derived from the standard's minimum sensitivity table.**
   - The standard's sensitivity assumes a noise figure of 10 dB and an implementation margin of 5 dB (§17.3.10.2 and the analogous clauses 21/27/36).
   - Required SINR (20 MHz reference) = sensitivity − kTB(20 MHz) − 10 dB.
   - This keeps the 5 dB implementation margin inside the requirement, because it is a receiver impairment that applies to interference as well as to noise.
   - Results: non-HT 6 Mb/s → 9.0 dB; 54 Mb/s → 26.0 dB; HE MCS 11 → 39.0 dB; EHT MCS 13 → 45.0 dB.
   - Consequences:
     - The requirement is independent of width. Wider channels cost range only through N(W).
     - A NF-7 receiver is 3 dB more sensitive than the standard's minimum.
3. **Rate ceiling.** An MCS is usable when RSSI − N(W) ≥ its required SINR + 3 dB margin. This replaces `sens + widthPenalty + 3`.
4. **Preamble detection.** A receiver locks onto a PPDU only if RSSI ≥ −82 dBm and SINR at arrival ≥ 4 dB (ns-3's ThresholdPreambleDetectionModel). If detection fails:
   - there is no RX_START, no RX_FAIL and no EIFS;
   - the signal is recorded as `RX_MISS` (reason `preambleSinr`), so the UI can show it;
   - it still counts toward CCA like any other signal.
5. **CCA after own transmission.** A signal whose preamble started while the radio was transmitting holds CCA busy only through energy detection (the sum of such signals ≥ −62 dBm, §17.3.10.6). Signals whose preamble the radio could observe keep today's −82 dBm rule.
6. **Unchanged, and named in lessons where relevant:**
   - capture (5 dB margin within the locked frame's preamble);
   - worst-case interference over a reception;
   - all-or-nothing A-MPDU;
   - deterministic decoding.

   The seeded PER draw arrives with Tier 3 (S7).

### E2. Queue limit and MSDU lifetime

- **Queue limit.** Each access-category queue (the MLD-level queue for MLO) holds at most `queueLimit` MSDUs (default 500, as in ns-3's WifiMacQueue). An arrival that finds the queue full is dropped: a `DROP` record with reason `queueFull` and no ENQUEUE, matching ns-3's DROP_NEWEST.
- **MSDU lifetime.** An MSDU queued longer than `msduLifetimeMs` (default 500 ms, ns-3's MaxDelay; dot11EDCATableMSDULifetime) is discarded when the MAC next builds a transmission for that access category. It gets a `DROP` record with reason `lifetime`, plus a DEQUEUE record.
- **Configuration.** Both are optional `Scenario` fields (`queue: { limit, lifetimeMs }`), validated by the schema. They are hidden in the editor, and lessons set them explicitly when they matter.

## UI

### U1. Field-level frame decoder

`src/model/frameFields.ts` derives the MAC header and PPDU layout of any recorded `FrameDesc`:
- Frame Control: type/subtype, To DS/From DS, Retry, Power Management and More Data (set to 0 until S5), Protected (0).
- Duration.
- Address 1–4 with roles (RA/TA/DA/SA/BSSID per ToDS/FromDS).
- Sequence Control (sequence number, fragment 0).
- QoS Control (TID from the access category, ack policy).
- Payload size and FCS.
- For A-MPDUs, the delimiter/MPDU/pad structure.
- The PPDU layout: legacy preamble, PHY header and data symbols with their durations.

Byte counts must add up to `frame.bytes`, and this is tested. `FrameDetail` gains a collapsible field table.

### U2. Widget blocks

A new lesson `Block` kind `widget` with `widget: 'linkBudget' | 'mcsLadder'`, parameters, and a caption. Widgets render interactive views computed from the same engine functions the simulation uses (propagation, N(W), required SINR, ceiling). This guarantees that a widget and the simulation never disagree, and a test checks it.
- `linkBudget`: sliders for TX power, distance, walls and width; shows a waterfall to RSSI, the noise floor, SINR and the highest usable MCS.
- `mcsLadder`: the required-SINR table for one mode, with a marker at a chosen SINR.

### U3. Tiered course

- `MODULES` becomes a list of tiers containing modules.
- Lesson titles lose their hard-coded numbers; the panel numbers lessons by position.
- `minutes` is computed as words ÷ 150 + 5 per observe item + 5 per try-this item, rounded to 5. A test keeps each stated value within ±5 min of that computation.
- A lesson with `hidden: true` is not listed.

## Lessons

Tier 1:
1. Radio primer (new, with widgets)
2. Roles and the stack (new)
3. Frame anatomy (new, uses the decoder)
4. Frames cost airtime (existing, reworded to build on 1–3)
5. IFS (existing)
6. Backoff (existing)
7. NAV (existing)
8. Hidden nodes (existing)
9. Rate anomaly (existing)
10. Retries, drops and queues (new)
11. The Bianchi model (new; analytic saturation throughput and collision probability computed in the lesson and compared with a simulated n-station legacy BSS)
12. Tier 1 project (new)

Tier 2, existing lessons in their new order:
- M3: EDCA, A-MPDU, TXOP, burst protection
- M4: width, streams, rate adaptation
- M7: OFDMA downlink, triggers, MU-MIMO, MLO
- M8: capstone

The splits (IFS ladder vs EDCA; rate adaptation I and II) wait for S2.

All existing lessons are re-baselined on E1/E2 with every claim pinned. New lessons are EN+ZH and follow the lesson contract.

## Verification

- `npx tsc -b` clean and `npx vitest run` green.
- New engine behaviour is covered by unit tests: noise per width, required SINR table values, a failed preamble detection producing no EIFS, CCA after own TX, queue-full and lifetime drops.
- The Bianchi lesson's analytic numbers are computed in a test and compared with the simulator within a stated tolerance.
- Browser check of the new lessons, the widgets and the frame decoder.
- Commit, merge to main, push.
