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

1. **✎ Edit mode** — draw rooms (▭), punch doors/windows into walls, set wall materials (drywall/brick/glass), drag the AP and STAs around, assign per-station traffic profiles (video, backup, browsing, IoT, saturated), or 🎲 spawn random stations. Scenarios persist to localStorage and import/export as JSON.
2. **▶ Simulate mode** — the engine (in a Web Worker) simulates ahead and records *every* observable micro-event. The UI is a player over that recording:
   - **Transport bar**: play/pause, slowdown from ×10 to ×10 000, and stepping **±1 µs, ±1 slot (9 µs), ±1 event, ±1 frame exchange — forward and backward**.
   - **3D viewport**: expanding wavefronts per transmission (blue = AP data, green = STA data, white = ACK, orange = RTS/CTS), node state halos, live backoff counters.
   - **Timeline strip**: logic-analyzer-style per-node lanes (TX/RX/backoff/defer/NAV) with wheel-zoom down to single-slot scale; red ticks mark collisions; drag to scrub.
   - **Inspector**: full MAC state at the playhead — backoff, CW, SSRC/SLRC, NAV, IFS, queue contents, per-node stats.
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

RF model: log-distance path loss (n = 3.0, 5 GHz) + per-wall attenuation (drywall 5 dB, brick 12 dB, glass 3 dB; openings exempt) + SINR-based capture.

### Known simplifications

- No beacons/association (pre-associated BSS), no power save, no MU-EDCA/BSR (the OFDMA scheduler reads STA queues directly as a BSR stand-in).
- 20 MHz channels only; PPDU decode is all-or-nothing per receiver (per-MU-part thresholds for OFDMA); receivers lock the first decodable preamble.
- OFDMA RUs modeled as 1/n rate scaling; MLO is STR with a simplified 6 GHz path-loss offset; wall openings are full-height gaps.
- TXOP NAV covers one exchange at a time rather than the full TXOP remainder.

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
