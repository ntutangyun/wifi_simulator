# Wi-Fi Airtime Simulator

A browser-based, microsecond-resolution simulator of **IEEE 802.11 (CSMA/CA)** channel access inside a 3D house you design yourself — and a learning tool for how Wi-Fi actually works. Draw rooms, place an access point and stations, pick each device's Wi-Fi generation (802.11a legacy / Wi-Fi 5 / 6 / 7) and toggle its features, with a bilingual UI (EN/中文 toggle), then watch — and scrub through — every backoff slot, AIFS wait, NAV reservation, A-MPDU burst, OFDMA trigger exchange, collision and retransmission. Hover any block in the timeline for an explanation of what it is and why it happens; the 📖 Guide tab walks through the protocol from carrier sense to MLO.

Built as a static SPA (Vite + TypeScript + React + Three.js). No backend; deployable on GitHub Pages.

## Quick start

```bash
npm install
npm run dev      # local dev server
npm test         # engine conformance test suite (vitest)
npm run build    # static production build in dist/
```

## Using it

0. **📚 Course mode** — a built-in, bilingual course on the Wi-Fi MAC (DCF foundations → EDCA/A-MPDU/TXOP → OFDMA/MLO → ambient power IoT). Each lesson loads a purpose-built deterministic scenario next to the text, with jump-to buttons that seek the playhead straight to the teachable moment (first collision, first Trigger frame, …), observation checklists, experiments and self-check quizzes. Progress is saved locally.
1. **✎ Edit mode** — draw rooms (▭), punch doors/windows into walls, set wall materials (drywall/brick/glass), drag the AP and STAs around, assign per-station traffic profiles (video, backup, browsing, IoT, saturated), place battery-free **AMP tags** on a Wi-Fi 7 AP's 2.4 GHz link and configure its polling (slots, ACWE, DL/UL rate, protection), place **UWB anchors and tags** and set the ranging session (SS-/DS-TWR, block and slot length, channel, timestamp noise), or 🎲 spawn random stations. Scenarios persist to localStorage and import/export as JSON.
2. **▶ Simulate mode** — the engine (in a Web Worker) simulates ahead and records *every* observable micro-event. The UI is a player over that recording:
   - **Transport bar**: play/pause, slowdown from ×10 to ×10 000, and stepping **±1 µs, ±1 slot (9 µs), ±1 event, ±1 frame exchange — forward and backward**.
   - **3D viewport**: expanding wavefronts per transmission (blue = AP data, green = STA data, white = ACK, orange = RTS/CTS), node state halos, live backoff counters.
   - **Timeline strip**: logic-analyzer-style per-node lanes (TX/RX/backoff/defer/NAV) with wheel-zoom down to single-slot scale; red ticks mark collisions; drag to scrub. AMP tags get their own lane: trigger/Ack reception, an armed "slot k" wait span, and their uplink response.
   - **Inspector**: full MAC state at the playhead — backoff, CW, SSRC/SLRC, NAV, IFS, queue contents, per-node stats (or, for a tag, ABOC/ACW and sent/acked/lost counts).
   - **UWB ranging**: a second radio measuring distance rather than carrying traffic. Each tag gets a lane showing its ranging round slot by slot; the floor of the 3D scene carries one range ring per (tag, anchor) pair, the solved position as a cross and its 1-σ error ellipse (drawn at 10× — the inspector quotes the true axes), all fading out over one ranging block.
   - **Event log**: chronological micro-events; click a TX row to decode the frame.

## 802.11 conformance (IEEE Std 802.11-2024)

| Mechanism | Clause | Notes |
|---|---|---|
| DIFS/SIFS/EIFS interframe spaces | §10.3.2.3 | SIFS 16 µs, slot 9 µs, DIFS 34 µs, EIFS 94 µs (OFDM PHY) |
| Random backoff, CW 15→1023 | §10.3.3 | freeze/resume without redraw; post-TX backoff |
| DCF basic access | §10.3.4 | immediate TX on long-idle medium |
| SRC/LRC, SSRC/SLRC retry counters | §10.3.3 | limits 7 (short) / 4 (long), CW reset rules |
| ACK procedure, AckTimeout 45 µs | §10.3.2.9 | timeout on missing PHY-RXSTART |
| NAV virtual carrier sense | §10.3.2.4 | Duration-field based; RTS-NAV early release |
| RTS/CTS by dot11RTSThreshold | §10.3.2.9 | hidden-node protection |
| OFDM PHY airtime (6–54 Mbps) | §17.4.3, Eq. 17-29 | exact preamble/symbol timing |
| Receiver sensitivity per rate | Table 17-21 | drives RSSI→MCS selection |
| CCA −82 dBm preamble / −62 dBm energy | §17.3.10.6 | asymmetric carrier-sense ranges → hidden/exposed nodes |
| EDCA: 4 ACs, AIFS/CW/TXOP defaults | §10.23, Table 9-194 | per-device toggle (Wi-Fi 5+); internal-collision arbitration |
| TXOP limits per AC | §10.23.2.8 | SIFS-chained bursts; PPDU must fit the TXOP |
| A-MPDU + compressed BlockAck | §10.24 model | ≤64 MPDUs, 4 ms cap, delimiter+padding sizing |
| VHT/HE/EHT PHY rates (20 MHz, Nss 1) | clauses 21/27, 802.11be | MCS0–13 incl. 4096-QAM, real preamble/symbol timing |
| OFDMA DL/UL MU | HE model | RU = 1/n rate scaling, Trigger + Multi-STA BlockAck |
| MLO (STR, 5+6 GHz) | 802.11be model | per-link MACs over shared MLD queues |
| 2.4 GHz ERP-OFDM timing | §18.4.4, Table 18-5, §10.3.8 | SIFS 10 µs, short slot 9 µs, DIFS 28 µs, AckTimeout 39 µs, 6 µs signal extension in every PPDU; 2.4 GHz path loss 6.5 dB below 5 GHz |
| AMP SIFS 10 µs | P802.11bp draft, SFD PM-96 | inter-step gap throughout an AMP round (trigger→slot, Ack→next slot); equal to 2.4 GHz aSIFSTime |
| AMP downlink PPDU anatomy | P802.11bp draft, 11-26/1519r5 §39.3.2.2 | legacy preamble (32 µs) + AMP-Sync (80 µs) + AMP-SIG + Manchester-OOK data + padding (20/36 µs) + 6 µs signal extension |
| AMP uplink PPDU | P802.11bp draft, 11-26/1889r4 | 48-chip AMP-Sync + Manchester-OOK data at 250/1000/4000 kb/s; no legacy preamble, no signal extension |
| AMP slotted random access | P802.11bp draft, 11-26/1889r4 §39.4 | ABOC drawn uniformly from [0, ACW], ACW = 2^ACWE − 1; Ack-keyed slot timing (a tag has no clock of its own) |
| CTS-to-self round protection | P802.11bp draft (model) | a non-HT CTS-to-self reserves the round's Duration for Wi-Fi nodes on the link; tags ignore it (no NAV) |

RF model: log-distance path loss (n = 3.0, 5 GHz) + per-wall attenuation (drywall 5 dB, brick 12 dB, glass 3 dB; openings exempt) + SINR-based capture.

## 802.15.4-2024 HRP UWB ranging

The UWB side is a separate radio with its own PHY, its own schedule and its own units. Every constant below is tagged with where it comes from: a clause of IEEE Std 802.15.4-2024, a FiRa UCI default, or a model choice this simulator made.

| Mechanism | Source | Notes |
|---|---|---|
| Chip rate / peak PRF | standard §16.2.4 | 499.2 Mchip/s, Tc = 2.003205 ns |
| Ranging counter, RCTU | standard §10.29.1.4 | Tc / 128 = 15.650 ps — 4.7 mm of flight |
| Ranging counter width 40 bits | model | the standard says "at minimum 32-bit"; 40 bits, wrapping every 17.2 s, is our choice — every counter difference is taken mod 2⁴⁰ |
| Ranging scheduling unit, RSTU | standard §10.29.1.5, Table 10-145 | 416 chips = 833.333 ns; slots and blocks are configured in RSTU |
| RMARKER | standard §10.29.1.1 | first chip after the SFD, 36 576 chips = 73.269 µs into the PPDU; every timestamp is an RMARKER reading |
| SP1 BPRF PPDU | standard §16.2, Table 16-31 set 3 | SYNC 64 + SFD 8 symbols, one STS segment (512 + 64 × 512 + 512 chips), PHR 850 kb/s, PSDU 6.8 Mb/s |
| SS-TWR | standard §10.29.1.2.2 | tof = (Tround − Treply)/2, with the CFO-corrected form (Tround − Treply·(1 − coffs))/2 |
| Clock-offset (CFO) tracking for the SS-TWR correction | standard §10.29.1.6, collapsed to one number | the standard's ranging tracking offset / tracking interval pair is modelled as a single measured `coffs`, with 0.2 ppm of residual error |
| DS-TWR, three messages | standard §10.29.1.2.4, Figure 10-199 | Poll / Response / Final; clock rate errors divide out. The default method |
| Figure of merit | standard §10.29.1.7, Tables 10-146…148 | LOS 0x16 = 97 % within 0.5 ns; through any wall 0x7B = 75 % within 12 ns; 0x00 = not available |
| Ranging blocks / rounds / slots | standard §10.32.2, time-scheduled | one round per tag per block; SS-TWR takes N + 1 slots, DS-TWR 2N + 2; slot 0 is the Poll |
| Ranging IEs: ARC, RDM, RRTI, RMI, RRMC | standard §10.29.8, §10.32.9 | field lists from the clauses; each IE's width is written out from the fields it stands for |
| Contention-based round, schedule mode 0 | standard §10.32.2 | the Poll opens a shared response phase instead of naming a slot per anchor; every anchor draws one of the RCPS IE's slots uniformly (§10.32.9.5) and retries up to the RCMA IE's budget (§10.32.9.6) before sitting a round out; SS-TWR only |
| RCPS / RCMA IE content | standard §10.32.9.5 / §10.32.9.6; content sizing model | RCPS carries the response-phase window (first slot, last slot); RCMA carries the retry budget; the standard defines each IE's purpose, not its byte layout |
| Contention defaults: 8 response slots, 3 attempts | model | `UwbSessionCfg.contentionSlots` / `maxAttempts`; the standard fixes neither number |
| Contention round feedback | model | an SS-TWR responder has no frame of its own to learn whether it was heard (§10.32.1 NOTE leaves this to the upper layer); here the network tells the anchor at the round's end — a hit refills its retry budget, a miss spends one, and an empty budget sits it out for a round |
| Crystal tolerance ±20 ppm | standard §16.4.9 | per-device ppm, drawn uniformly unless the scenario pins it |
| Ranging block 200 ms, ranging slot 2 ms | FiRa UCI defaults | 240 000 and 2 400 RSTU; a slot must hold the round's longest frame + 200 ns of flight guard |
| DS-TWR deferred as the default method | FiRa | matches FiRa's default ranging round usage |
| Tx −14 dBm, sensitivity −93 dBm, capture 6 dB | model | −14 dBm ≈ the −41.3 dBm/MHz mean EIRP mask over 499.2 MHz |
| Path-loss exponent 2.0, free-space PL₀ | model | indoor LOS; PL₀ from the channel's centre frequency (Table 11-9) |
| Timestamp noise 100 ps 1-σ, residual CFO 0.2 ppm | model | σ_range = c·σ_ts/√2 ≈ 2.1 cm (the conservative SS-TWR form; DS-TWR is 0.62–0.65·c·σ_ts) |
| NLOS excess delay 0.2 / 0.5 / 2.0 ns | model | glass / drywall / brick per wall crossed = 0.06 / 0.15 / 0.60 m of bias |
| 2-D position: Gauss–Newton, GDOP, 1-σ ellipse | model | residual ‖p − aᵢ‖ − dᵢ with the tag's z known; Σ = σ_r²·(JᵀJ)⁻¹; needs ≥ 3 ranges |
| ≤ 9 anchors per round | standard §16.2.7 (consequence) | the DS-TWR Final is 14 + 12N octets and must stay under the 127-octet PSDU limit |
| 6 GHz Wi-Fi ↔ UWB channel-5 coupling | model | `Spectrum` mediator: flat spectral density inside each side's band, foreign power carried by the *transmitter's* own path-loss law; UWB channel 5 is 6 240–6 739.2 MHz, channel 9 is 7 737.6–8 236.8 MHz and never overlaps a 6 GHz Wi-Fi channel |
| UWB SIR floor under in-band Wi-Fi, −12 dB | model | `UWB_SIR_MIN_DB`: rssi − foreignDbm below −12 dB fails the reception (`RX_FAIL { reason: 'lowSinr' }`) and logs `UWB_INTERFERED`; past about 40 cm a UWB frame's in-band power falls below the −62 dBm CCA energy-detect floor, so at any realistic spacing Wi-Fi's own CCA never fires on it — it only shows up as a small SINR noise rise |
| Receiver maximum input, −45 dBm/MHz | standard §16.4.10 | `UWB_MAX_INPUT_DBM_PER_MHZ`, documented for reference — not enforced as a threshold; the model's SIR floor stands in its place |
| One-way ranging (TDoA), DL and UL | standard §10.29.1.2.5 | a time difference of arrival replaces a round trip; the fix comes from hyperbolic least squares (`solveTdoa`) instead of trilateration, needing ≥ 3 differences (4 anchors) |
| DL-TDoA round content | model, FiRa-style | anchor 0 runs the round (Poll + Final), anchors 1…N−1 Respond in between; every message carries the sender's own TX counter plus the RX counters it holds for the rest — RMI-style content, sized like the existing IEs |
| Tag clock-rate correction | model | `UwbSessionCfg.tdoaClockCorrection` (default true): the listening tag measures its own Poll-to-Final interval against the true one the anchors report and rescales its raw differences by that ratio; off, 20 ppm over a 20 ms round is 120 m of error, on it is decimetres |
| UL-TDoA blink, 14 octets | model | `UWB_BLINK_BYTES` = MHR 9 + 3-octet blink IE + FCS 2; the tag's only frame, carrying no time at all — anchors take the arrival instant on their own clocks |
| UL-TDoA anchor sync, "wired sync" | model | `UwbSessionCfg.syncErrorNs` (default 0 ns): anchors share one common timebase and each carries a fixed per-anchor residual calibration error, drawn once for the whole session, not redrawn per round |
| TDoA error ellipse | model | DL: √((√2·c·σ_ts)² + (c·replyTimeᵢ·σ_cfo)²) per difference; UL: √2·c·√(σ_ts² + syncErrorNs²) — a first-order figure, since a sync error is a bias, not noise that averages down |

### Known simplifications

- No beacons/association (pre-associated BSS), no power save, no MU-EDCA/BSR (the OFDMA scheduler reads STA queues directly as a BSR stand-in).
- 20 MHz channels only; PPDU decode is all-or-nothing per receiver (per-MU-part thresholds for OFDMA); receivers lock the first decodable preamble.
- OFDMA RUs modeled as 1/n rate scaling; MLO is STR with a simplified 6 GHz path-loss offset; wall openings are full-height gaps.
- TXOP NAV covers one exchange at a time rather than the full TXOP remainder.
- 2.4 GHz always uses the 9 µs short slot (no 802.11b stations are modelled); the 6 µs signal extension is modelled as occupied medium, so a PPDU overlapping only another PPDU's extension counts as interference.
- AMP models only the Active Tx non-AP AMP STA; backscatter (mono-/bistatic), the energizer, wireless power transfer and energy harvesting are not implemented yet.
- AMP is a draft (P802.11bp D0.5/D1.0): the tag's −72 dBm downlink sensitivity and the OOK SINR thresholds (decoding requirements the draft does not publish) are model choices, not standard values.
- A tag finds its slot by counting AMP Acks in arrival order rather than reading a slot number off them; the draft leaves ABOC retransmission behaviour TBD, so a lost response draws a fresh ABOC next round.
- UWB ranging schedules are either time-scheduled — every slot assigned before the session starts, so two UWB devices never collide — or contention-based (schedule mode 0), a shared response window responders draw a slot from at random. Even the contention schedule has **no CCA**, no backoff and no NAV: the draw is uniform-random against a fixed window and retry budget, not carrier sensing.
- UWB reception is sensitivity-only against another UWB frame: a frame is received when it clears −93 dBm, and interference from another UWB transmission is a 6 dB capture margin — there is no UWB SINR curve or multipath channel model there. Wi-Fi 6E / UWB channel-5 coexistence is a separate, cruder model: flat spectral density inside each side's band, path loss from the *transmitter's* own table, and no adjacent-channel leakage (an emission is either inside a band or contributes nothing to it).
- Positions are solved in 2-D with the tag's z taken from the scenario; there is no AoA (no antenna array, no PDoA) yet — ranging itself now runs as two-way, DL-TDoA or UL-TDoA.
- NLOS is one excess delay per wall crossed, not a delay spread: no first-path/strongest-path split, no leading-edge detection and no ranging bias calibration. The FoM is a two-valued model mapping (LOS / through-a-wall) and is reported, never used by the solver.
- DL-TDoA's per-message RX/TX counter content and UL-TDoA's "wired sync" are model, FiRa-style choices, not something the standard's §10.29.1.2.5 spells out byte for byte; the overlay draws only the fix and its 1-σ ellipse, never the hyperbolae themselves; and a UL-TDoA anchor's `syncErrorNs` is a fixed per-anchor bias, not white noise that repeated blinks average away.
- STS key management, round hopping, LRP UWB, DS-TWR under a contention schedule (its report would need a second contended window) and multi-node round scheduling beyond one round per tag are out of scope.
- A Wi-Fi radio receives a downlink AMP PPDU as an ordinary legacy-preamble reception: it defers for the L-SIG length and then uses AIFS, not EIFS. The coexistence numbers (lesson 3) rest on this — a real 802.11 receiver's behaviour on an OOK payload under a legacy preamble is not something the draft pins down.

## Architecture

```
engine  (pure TS, Web Worker) — deterministic discrete-event sim, ns clock,
        seeded per-STA RNG streams, emits timeline records + ViewState snapshots
player  — scrubs the recorded timeline; backward stepping is just a buffer read
scene   — Three.js house + node visuals driven by the reconstructed ViewState
editor  — 2D floor plan (SVG) → extruded 3D walls, wall-dedupe, openings
ui      — React panels: transport, timeline lanes, inspector, event log
```

The engine never runs in the UI thread and every run is reproducible from (scenario JSON, seed).
