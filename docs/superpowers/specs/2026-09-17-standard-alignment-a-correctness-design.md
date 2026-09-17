# Standard alignment A: correctness fixes

Date: 2026-09-17
Programme: make the simulator a feature superset of ns-3's wifi module (master 62a7c4c), with every behaviour matching IEEE 802.11-2024 / 802.11be.
This spec covers sub-project **A** only.

## Programme rules

1. **Standard over ns-3.** Where ns-3 and the standard disagree (BE/BK TXOP limit 0, VHT SU preamble without SIG-B, obsolete SSRC/SLRC attributes), we follow the standard.
2. **Vendor choices are selectable models.** Where the standard leaves behaviour to the implementation (rate control, MU scheduler, EMLSR policy), ns-3's options become selectable models in later sub-projects.
3. **Courses follow the engine.** Any lesson text, quoted number or UI note that a change makes untrue is corrected in the same sub-project. New lessons are added where a new behaviour deserves teaching.

Sub-project order: **A** correctness → **B** PHY fidelity → **C** MAC data path (starts by splitting `mac.ts`) → **D** legacy PHYs and bands → **E** management and power → **F** HE/EHT advanced → **G** rate-control family.

## Goal of A

Fix behaviour that is wrong against the standard and needs no new subsystem. The comparison reports behind every item are in the session scratchpad (`compare/{access,exchange,phy,he-eht}.md`). This spec restates what matters, so it stands on its own.

## Approach

Fix in place, test first, one commit per item or tightly related group. For each fix:
- add a failing test that reproduces the defect;
- fix the defect;
- update any existing test that locked in the wrong behaviour, saying why in the commit message.

`mac.ts` is not restructured in A; that happens at the start of C.

## Changes

### A1. Mixed HE/EHT DL MU PPDU
- **Defect.** `buildOfdmaParts` and `buildMumimoParts` label the PPDU `he` once any member is HE, but EHT members keep MCS 12/13. The receiver looks up `PHY_MODES.he.sensDbm[12|13]`, gets `undefined`, and every such part fails.
- **Standard.** An HE MU PPDU carries HE-MCS 0–11 only. An EHT STA is HE-capable and can be served in one.
- **Fix.**
  - The PPDU format is `eht` only if every member is EHT; otherwise `he`.
  - In an `he` PPDU each EHT member's MCS is capped at 11. Its airtime and budget use the capped MCS.
  - The rate report for that member refers to the MCS actually used.
  - `sinrThreshModeDb` (and `mcsRateMbps`) throw on an MCS the mode does not define, so a NaN threshold can never recur silently.
- **Test.** One HE and one EHT phone near an AP, with the EHT link at MCS ≥ 12. Every MU part decodes, and the EHT part's frame MCS is ≤ 11.

### A2. Sequence number kept across retransmissions (§10.3.2.14)
- **Defect.** `buildDataFrame` advances `seqCounter` on every attempt, so a retry looks like new data and the view's duplicate filter never fires.
- **Fix.**
  - An MSDU gets its sequence number the first time it is transmitted, stored on the `Msdu`. Retransmissions reuse it.
  - The counter is modulo 4096, per EDCAF as today.
  - A frame's `seqNo` is its first MSDU's number.
- **Tests.**
  - A retried single frame carries the same `seqNo`.
  - With ACKs lost on the return link, the view's `txOk` and delivered bytes count each MSDU once.

### A3. Retry counting per 802.11-2020 and drop by identity
- **Defect.**
  - The 2016 SRC/LRC split has a long limit of 4, and the short/long class is mixed up.
  - At the limit, `queues.claim(ei, null, 64, …)` drops every queued MSDU for the head's destination, including never-sent ones.
- **Standard (2020+).** One retry counter per MSDU/MPDU, limited by dot11ShortRetryLimit = 7; dot11LongRetryLimit is no longer used. The per-AC QSRC drives CW.
- **Fix.**
  - Each `Msdu` carries `retries`. A failed attempt increments it for exactly the MSDUs in that attempt (SU, A-MPDU or one MU part).
  - An MSDU whose count reaches 7 is dropped. Only MSDUs from the failed attempt can be dropped.
  - The EDCAF keeps a QSRC that doubles CW and resets on success. When QSRC reaches the limit, CW resets without a success.
  - `LONG_RETRY_LIMIT`, `lrc`, `ssrc` and `slrc` are removed. The `RETRY` record becomes `{ node, msduId, retries, qsrc, ac? }`.
  - The Inspector row "SSRC / SLRC" becomes "QSRC", with EN and ZH strings and hint text explaining the 2020 model.
- **Deferred to C.** No retry increment under a BA agreement, and lifetime-based discard.
- **Tests.**
  - A 2-MPDU A-MPDU to an absent peer with 20 queued drops exactly 2 after 7 attempts.
  - An above-threshold frame survives 7 attempts, not 4.
  - The existing `mac.test.ts` retry-limit test is re-baselined.

### A4. EIFS lifetime
- **Defect.** `corruptLast` clears only on a correct decode, so EIFS persists across the station's own transmissions.
- **Fix.** Clear it on own TX start and on any RX start, as well as on a correct RX end.
- **Test.** After a corrupt reception followed by the station's own transmission and ACK timeout, the next IFS is AIFS, not EIFS.

### A5. EDCA backoff slot boundary (§10.23.2.4)
- **Defect.** An EDCAF decrements only after each full idle slot following AIFS, so each freeze costs one extra slot.
- **Standard.** The first backoff slot boundary is the end of AIFS, where the EDCAF may decrement.
- **Fix.**
  - For EDCA (not legacy DCF), a resumed or fresh countdown decrements once at IFS end, then once per further idle slot.
  - The transmit instant with no interruption is unchanged: AIFS end + b·slot. Only the count preserved across a freeze changes.
- **Test.** Freeze after k idle slots past AIFS; the resumed value is b − k − 1 for EDCA and b − k for DCF.

### A6. IFS reference after a response timeout
- **Fix.** After an ACK/CTS/BA timeout, the IFS for the retry starts at the timeout's end, not at the station's own TX end.
- **Test.** The backoff draw for a retry lands at TX end + 45 µs + AIFS.

### A7. Internal collision retry accounting (§10.23.2.12.1)
- **Fix.** A losing EDCAF increments its QSRC and the `retries` of the MSDUs it would have sent, and applies the drop rule from A3.
- **Edge case.** Losers are penalised only if the winner actually transmits.
- **Test.** A low AC that keeps losing eventually drops its head frame.

### A8. DL MU outcome
- **Defect.** Any missing BA fails the whole exchange: CW doubles and the TXOP ends.
- **Fix.**
  - If at least one member acknowledges, the exchange is a success: CW resets and the TXOP may continue.
  - Missing members' MSDUs follow A3 individually.
  - If no member acknowledges, the exchange fails as today.
- **Test.** 3 of 4 members acknowledge: CW stays at CWmin, and only the missing member's MSDUs are retried.

### A9. STA after a TB PPDU
- **Standard.** An HE STA resumes EDCA without modifying CW or the backoff counter, whether or not it is acknowledged.
- **Fix.** Remove the CW reset/double and backoff redraw in the TB PPDU acknowledgement and timeout paths. The MSDU `retries` accounting per A3 still applies on a miss.
- **Test.** CW and backoff are identical before and after a triggered uplink.

### A10. Trigger response and NAV
- **Defect.** A Trigger addressed to the STA wipes its NAV, and the STA always responds.
- **Fix.**
  - The MAC records who set its NAV.
  - When CS Required applies, the STA responds only if its NAV is idle or was set by the AP that sent the Trigger. It never clears a NAV set by a third party.
  - A full intra-BSS/basic NAV split is F.
- **Test.** With a third-party NAV active, a triggered STA stays silent and its NAV is intact.

### A11. Maximum PPDU duration
- `MAX_PPDU_NS` = 5 484 000 (aPPDUMaxTime for HT/VHT/HE/EHT).

### A12. Aggregation time budget
- The first PPDU of a TXOP budgets `txopLimit − (RTS + SIFS + CTS + SIFS if protected) − SIFS − response time`, using the actual response PPDU duration.
- The 200 µs floor is removed; if nothing fits, send a single MSDU only when it fits.
- `features.test.ts:76` is extended to assert that the BA end is inside the TXOP.

### A13. DL MU budget within the TXOP
- MU parts are sized to `min(aPPDUMaxTime, remaining TXOP − SIFS − response time)`.
- **Test.** Saturated DL on BE to OFDMA peers never ends a response past the TXOP limit.

### A14. Burst continuation check
- `continueOrRelease` and `planBurstNs` size the next exchange with the QoS header, A-MPDU framing and the real control-response rate.

### A15. RTS NAV reset timer
- The timer adds aRxPHYStartDelay (20 µs for OFDM): 2·SIFS + CTS time + aRxPHYStartDelay + 2·slot.

### A16. Control response rate
- The response uses the highest mandatory rate ≤ the eliciting PPDU's non-HT reference rate (the standard's reference-rate rule for control responses, as ns-3's `GetControlAnswerMode` implements it; the exact clause and table are cited in the code comment after checking the 2024 text), not its 20 MHz/1SS data rate.
- **Example.** HE MCS 2 elicits a 12 Mbps response.

### A17. Byte accounting
- A-MPDU padding applies between subframes only, not after the last one.
- The view subtracts 30 B (26 + 4) per single QoS frame and the real per-MPDU overhead in aggregates.

### A18. Content corrections
- **Lesson 11 (`lessons.ts:1137`).** Drop "Until Wi-Fi 6, one transmission served one receiver". Wi-Fi 5 (802.11ac) introduced DL MU-MIMO; say this simulator models MU-MIMO only for Wi-Fi 6/7.
- **Lesson 11 (`lessons.ts:1143`).** Say simultaneous acknowledgements in the standard are trigger-solicited TB PPDUs, and that the simulator simplifies this.
- **Lesson 12 (`lessons.ts:1209`).** "No longer CSMA at all" becomes: triggered access replaces contention for scheduled transmissions, but the STA still checks carrier sense when the Trigger requires it.
- **Lesson 13 (`lessons.ts:1251`).** Add that MLO also exists in single-radio EMLSR form and on 2.4 + 5 GHz. The simulator models the simultaneous-radio 5 + 6 GHz case.
- **`ui/i18n.ts:223` and `model/presets.ts:144-148`.** "6 GHz off, so no MLO" becomes a statement about this simulator (it models MLO on 5 + 6 GHz only), in EN and ZH.
- **Presets claiming dual-band 2.4/5 GHz.** Add a note that 2.4 GHz is not simulated yet (sub-project D).
- **Out of scope for A.** Lesson 17's RU and preamble numbers change in F, where resource units and per-stream LTFs arrive.

### A19. Re-baselining
- `tests/course/quoted-timestamps.test.ts` and every lesson sentence that quotes a timestamp, count or ratio are re-run and updated to the new engine output.
- The EDCA tamper report (`scripts/tamper-report.ts` → `docs/reports/`) is regenerated, and its narrative is checked against the new numbers, as in commits `ff3f005` / `6ee693c`.

## Out of scope for A
- **B:** width penalty on the noise floor, noise figure, PER tables, preamble SNR detection, CCA after own TX.
- **C:** BA agreements, bitmap and partial retransmission, queue limits and lifetime, A-MSDU, PIFS recovery.
- **F:** real RU sizes, per-stream LTFs, trigger-solicited MU acknowledgements, VHT MU-MIMO, MU EDCA, intra-BSS NAV.

## Verification
- `npm test` passes.
- `npx tsc -b` is clean.
- The four probe scripts from the comparison, re-run against the fixed engine, no longer reproduce the six MAC bugs:
  - mixed-MU failures
  - duplicate `seqNo` inflation
  - over-drop at the retry limit
  - persistent EIFS
  - TXOP overrun with RTS
  - DL MU overrun
- The app is launched and one lesson from each affected group (backoff, NAV, hidden node, OFDMA, MLO) is checked in the browser.
