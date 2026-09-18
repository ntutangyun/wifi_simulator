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
1. **✎ Edit mode** — draw rooms (▭), punch doors/windows into walls, set wall materials (drywall/brick/glass), drag the AP and STAs around, assign per-station traffic profiles (video, backup, browsing, IoT, saturated), place battery-free **AMP tags** on a Wi-Fi 7 AP's 2.4 GHz link and configure its polling (slots, ACWE, DL/UL rate, protection), or 🎲 spawn random stations. Scenarios persist to localStorage and import/export as JSON.
2. **▶ Simulate mode** — the engine (in a Web Worker) simulates ahead and records *every* observable micro-event. The UI is a player over that recording:
   - **Transport bar**: play/pause, slowdown from ×10 to ×10 000, and stepping **±1 µs, ±1 slot (9 µs), ±1 event, ±1 frame exchange — forward and backward**.
   - **3D viewport**: expanding wavefronts per transmission (blue = AP data, green = STA data, white = ACK, orange = RTS/CTS), node state halos, live backoff counters.
   - **Timeline strip**: logic-analyzer-style per-node lanes (TX/RX/backoff/defer/NAV) with wheel-zoom down to single-slot scale; red ticks mark collisions; drag to scrub. AMP tags get their own lane: trigger/Ack reception, an armed "slot k" wait span, and their uplink response.
   - **Inspector**: full MAC state at the playhead — backoff, CW, SSRC/SLRC, NAV, IFS, queue contents, per-node stats (or, for a tag, ABOC/ACW and sent/acked/lost counts).
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

### Known simplifications

- No beacons/association (pre-associated BSS), no power save, no MU-EDCA/BSR (the OFDMA scheduler reads STA queues directly as a BSR stand-in).
- 20 MHz channels only; PPDU decode is all-or-nothing per receiver (per-MU-part thresholds for OFDMA); receivers lock the first decodable preamble.
- OFDMA RUs modeled as 1/n rate scaling; MLO is STR with a simplified 6 GHz path-loss offset; wall openings are full-height gaps.
- TXOP NAV covers one exchange at a time rather than the full TXOP remainder.
- 2.4 GHz always uses the 9 µs short slot (no 802.11b stations are modelled); the 6 µs signal extension is modelled as occupied medium, so a PPDU overlapping only another PPDU's extension counts as interference.
- AMP models only the Active Tx non-AP AMP STA; backscatter (mono-/bistatic), the energizer, wireless power transfer and energy harvesting are not implemented yet.
- AMP is a draft (P802.11bp D0.5/D1.0): the tag's −72 dBm downlink sensitivity and the OOK SINR thresholds (decoding requirements the draft does not publish) are model choices, not standard values.
- A tag finds its slot by counting AMP Acks in arrival order rather than reading a slot number off them; the draft leaves ABOC retransmission behaviour TBD, so a lost response draws a fresh ABOC next round.

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
