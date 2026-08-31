# Wi-Fi Airtime Simulator — Design Spec

**Date:** 2026-08-31
**Status:** Approved design, pre-implementation
**Deployment target:** Static SPA on GitHub Pages

## 1. Purpose

A browser-based, single-page 3D simulator of Wi-Fi (IEEE 802.11) channel-access behavior inside a user-built house. Users draw a floor plan, place one AP and several stations (STAs), assign traffic profiles, and run a microsecond-resolution simulation of how nodes compete for airtime under CSMA/CA (DCF). The core experience: **pause at any instant and inspect everything** — backoff counters, NAV, queues, in-flight frames — and **step forward/backward** at fine granularity.

Primary reference: **IEEE Std 802.11-2024** (REVme rollup), searchable corpus at
`D:\ai_patent_experiments\.claude\skills\wifi_patent_skill\references\ieee_standards`.
Key clauses: §10.3 (DCF), §10.3.2.3 (IFS), §10.3.3 (random backoff), §10.3.4 (DCF access),
§10.3.7 (DCF timing relations), clause 17 (OFDM PHY).

## 2. Scope

### v1 (this spec)
- 2D floor-plan editor → extruded 3D house; walls with materials, doors/windows.
- One AP (BSS), N STAs, per-node traffic profiles.
- Strict DCF per 802.11-2024: physical + virtual carrier sense (NAV), SIFS/DIFS/EIFS,
  binary-exponential random backoff, retries (SSRC/SLRC, SRC/LRC), ACK, RTS/CTS by
  dot11RTSThreshold, EIFS after corrupted receptions.
- Non-HT OFDM PHY (clause 17): 8 rates 6–54 Mbps, exact preamble/symbol airtime.
- Log-distance path loss + per-wall attenuation; SINR-based capture model.
- Record-and-scrub timeline: pause, variable-speed playback, step ±1 µs / ±1 slot /
  ±1 event / ±1 frame exchange, backward stepping, jump-to-time.
- Per-node logic-analyzer-style timeline lanes, node inspector, event log, frame decoder.

### Explicitly out of v1 (architecture must allow later)
EDCA/QoS, TXOP, A-MPDU/BlockAck, HT/VHT/HE/EHT PHYs, MU-EDCA, OFDMA/trigger-based
access, MLO, power save, beacons/association procedures (v1 assumes pre-associated BSS),
multiple APs/OBSS, per-feature Wi-Fi 5/6/7 toggles per device.

## 3. Architecture

### 3.1 Record-and-scrub player (approved: option A)

- **Engine** = deterministic discrete-event simulator, pure TypeScript, no DOM
  dependencies, runs in a **Web Worker**.
- **Time** = integer **nanoseconds** (bigint-free: number is safe to 2^53 ns ≈ 104 days).
- **RNG** = seeded PRNG (e.g., splitmix/xoshiro), one independent stream per STA
  (802.11-2024 §10.3.3 NOTE 1). Runs are fully reproducible from (scenario JSON, seed).
- Engine emits an **append-only timeline** of records + periodic **snapshots**
  (full engine state each N ms of sim time) into a buffer shared with the main thread.
- **Main thread is a player**: a playhead scrubs the recorded timeline. Backward stepping
  is a buffer read; jump-to-time = nearest snapshot + replay of records. The worker
  simulates ahead until a sliding window (default ~5 s sim time, configurable) is full;
  old records/snapshots beyond the window are discarded.
- Playback speeds ~100× to 10⁶× slower than real time.

### 3.2 Timeline records

`{ t: ns, node: id|null, type, payload }` for every observable micro-event:
- CCA busy/idle transition per node (with cause: energy/preamble/NAV)
- IFS start/expiry (DIFS/SIFS/EIFS, with which one and why)
- Backoff: draw (value, CW), per-slot decrement, freeze, resume
- TX start/end (frame descriptor: type, addr1/2/3, duration field, seq, size, MCS,
  airtime breakdown), RX outcomes per receiver (decoded / SINR fail / not detected)
- NAV set/expire, CW change, SRC/LRC/SSRC/SLRC change, frame drop (retry limit)
- Queue enqueue/dequeue (traffic arrivals)
- Collision marker (≥2 overlapping TX where a receiver failed decode)

### 3.3 MAC model (strict 802.11-2024 DCF)

Per-node state machine:
- **CS**: medium busy = physical CCA (see §5 PHY/RF) OR NAV > 0 (§10.3.2.1, §10.3.2.4).
- **IFS** (§10.3.2.3): aSIFSTime = 16 µs, aSlotTime = 9 µs (clause 17 / 5 GHz OFDM),
  DIFS = SIFS + 2·slot = 34 µs, EIFS = SIFS + DIFS + ACKTxTime(lowest basic rate).
  EIFS applies when the last busy period ended with a frame not received correctly.
- **Backoff** (§10.3.3, §10.3.4.3): count = uniform[0, CW]; CW ∈ {15, 31, 63, 127, 255,
  511, 1023}; doubles on failed attempt, stays at aCWmax; resets to aCWmin on success or
  SSRC = dot11ShortRetryLimit. Counter decrements once per idle slot; freezes on busy;
  after busy, medium must be idle DIFS/EIFS before slots resume. If counter already
  nonzero after defer, no new draw.
- **Retries**: per-MPDU SRC/LRC, station SSRC/SLRC per §10.3.3; short retry limit 7,
  long retry limit 4; drop MPDU at limit.
- **Exchanges**: DATA –SIFS– ACK. RTS –SIFS– CTS –SIFS– DATA –SIFS– ACK when PSDU >
  dot11RTSThreshold (user-adjustable, default 3000 → RTS off; can lower to demo
  hidden-node protection). ACK timeout / CTS timeout per §10.3.2.9 → failed attempt →
  CW doubling + backoff.
- **NAV**: set from Duration field of any correctly decoded frame not addressed to the
  node; RTS-NAV reset rule (§10.3.2.4) included.

### 3.4 Extensibility model

Every node carries a **capability profile**:
```ts
{ generation: 'nonht' | 'vht' | 'he' | 'eht', features: Record<FeatureFlag, boolean> }
```
Engine layering:
- `channel/` — signal propagation & reception bookkeeping, generation-agnostic.
- `mac/` — pluggable channel-access behaviors; v1 ships `DcfMac`. Later: `EdcaMac`,
  aggregation, trigger-based access — selected/parameterized by capability profile.
- `phy/` — pluggable PPDU airtime + sensitivity calculators per generation; v1 ships
  `NonHtOfdmPhy`.
Interfaces for these seams are defined in v1 even though only one implementation ships.

## 4. Traffic model

Per-node profiles generating MSDUs into queues (AP queues downlink per-STA, FIFO across
all in v1):
- **Video streaming**: heavy downlink CBR-with-jitter (e.g., 15 Mbps, 1400 B MSDUs)
- **Cloud backup**: heavy uplink saturated bursts
- **Web browsing**: bursty request (small UL) / response (burst DL) cycles
- **IoT/idle**: sparse small frames
- **Saturated** (debug): queue never empty
Arrival events are part of the deterministic event stream (seeded).

## 5. PHY & RF model

### 5.1 Airtime (clause 17, non-HT OFDM)
TXTIME = 20 µs (preamble 16 + SIGNAL 4) + 4 µs · ⌈(16 + 8·LENGTH + 6) / N_DBPS⌉.
Rates: 6/9/12/18/24/36/48/54 Mbps. Control responses (ACK/CTS) at highest basic rate ≤
data rate (§10.6). Exact values verified against the standard corpus during implementation.

### 5.2 Propagation
`rx_dBm = txPower_dBm − PL0 − 10·n·log10(d/1m) − Σ wallLoss(material)`
- Defaults: txPower 20 dBm (AP) / 15 dBm (STA), PL0 ≈ 46.7 dB @ 5 GHz 1 m, n = 3.0.
- Wall intersection: straight ray TX→RX vs. wall segments (2D test + floor check);
  openings (doors/windows) exempt that wall when the ray passes through them.
  Materials: drywall 5 dB, brick/concrete 12 dB, glass 3 dB (per-wall setting).
- Per-pair link table cached; recomputed on geometry/placement change.

### 5.3 Reception & carrier sense
- **Preamble detect / decode**: rx ≥ per-rate sensitivity (clause 17 table) AND
  SINR ≥ per-rate threshold, where interference = sum of other concurrent signals
  at the receiver (capture model — the stronger frame may survive a collision).
- **CCA busy**: decodable preamble at ≥ −82 dBm, or total energy ≥ −62 dBm (clause 17
  CCA). Asymmetric CS ranges → hidden/exposed node behavior emerges from geometry.
- Noise floor: −95 dBm.

## 6. House editor

- Top-down 2D grid editor (0.1 m snap), draw rectangular rooms by click-drag;
  shared edges merge into single walls; per-wall material; click wall → punch
  door/window opening.
- Extruded 3D view: 2.6 m wall height, semi-transparent walls.
- Node placement: drag AP/STAs in 2D or 3D (STA at 1.0 m height; AP height selectable).
  "Spawn random STAs" places N devices in random rooms with random profiles.
- Scenario (rooms, walls, nodes, profiles, seed, sim params) serializes to JSON:
  localStorage autosave, file import/export, URL-hash sharing.

## 7. Visualization (Three.js)

Driven entirely by playhead state reconstruction:
- TX = expanding translucent wavefront from transmitter for the frame's real duration;
  color by frame kind (DL data blue, UL data green, ACK white, RTS/CTS orange,
  collision-at-receiver red marker).
- Node halo = MAC state ring: idle / deferring (DIFS/backoff arc + floating backoff
  count) / TX / RX / NAV-blocked.
- Association lines AP↔STA, thickness = current MCS.
- Orbit/pan/zoom; click node → inspector.

## 8. UI (React)

- **Timeline strip** (bottom): per-node lanes with colored bars (TX/RX/backoff/defer/
  NAV) on a µs axis; draggable playhead; zoom ms → single slot. Logic-analyzer feel.
- **Transport**: play/pause, speed slider, step ±1 µs / ±1 slot / ±1 event / ±1 frame
  exchange, jump-to-time.
- **Node inspector**: full MAC state at playhead — backoff, CW, SSRC/SLRC, NAV, IFS
  wait + reason, queue contents (MSDU age/size), last attempt result, stats
  (throughput, airtime %, collisions, retries).
- **Event log**: chronological records around playhead; row expands to decoded frame
  (addresses, Duration, seq, MCS, airtime breakdown).
- **Mode switch**: Edit (floor plan + placement) ↔ Simulate.

## 9. Project structure

```
src/
  model/       # shared types: ScenarioJSON, TimelineRecord, Snapshot, capability profile
  engine/      # pure TS, no DOM — runs in worker and in vitest
    rng/ channel/ phy/ mac/ traffic/ timeline/
  worker/      # worker entry + main↔worker ring-buffer protocol
  player/      # playhead, scrubbing, state reconstruction from records+snapshots
  scene/       # Three.js viewport, meshes, TX effects, halos
  editor/      # 2D floor-plan editor
  ui/          # React panels, timeline strip, transport controls
```
Vite + TypeScript + React + Three.js. `base: './'` for GitHub Pages. No backend.

## 10. Error handling

- Worker crash → surfaced in UI with scenario+seed for repro; player keeps buffered data.
- Malformed imported scenario JSON → schema-validated (zod), rejected with message.
- Buffer window exhaustion (playhead at frontier) → playback waits, shows "simulating…".
- Degenerate geometry (zero-area rooms, nodes inside walls) → editor validation prevents.

## 11. Testing

- **vitest** on the pure engine:
  - Airtime: TXTIME for known LENGTH/rate matches hand-computed clause 17 values.
  - Timing: DIFS = 34 µs, EIFS value, ACK at SIFS boundary, slot-aligned backoff.
  - Backoff: CW sequence 15→31→…→1023, reset rules, freeze/resume, no re-draw
    when counter nonzero.
  - Retry: SRC/SSRC increments, drop at limits, CW reset at SSRC limit.
  - NAV: set from Duration, EIFS after corrupted frame.
  - Scenario-level: 2 saturated STAs in one room → collision rate in Bianchi ballpark;
    hidden-node pair (walls blocking STA↔STA) → high collision rate, fixed by RTS/CTS.
  - Determinism: same scenario+seed → identical timeline hash.
- Snapshot/replay equivalence: state at time t via snapshot+replay ≡ continuous run.

## 12. Decisions log

| Decision | Choice | Why |
|---|---|---|
| MAC fidelity v1 | DCF core, extensible plugin seams | User: start simple, later toggle Wi-Fi 5/6/7 features per device |
| RF physics | Path loss + per-wall attenuation, SINR capture | House geometry must shape results; deterministic |
| Stack | Vite + TS + Three.js + React | Static GH Pages build, maintainable UI growth |
| House editing | 2D plan → extruded 3D | Precision + simple wall math |
| Traffic | Per-node profiles | Realistic emergent contention |
| Time model | Record-and-scrub player (worker simulates ahead) | Instant pause + bidirectional stepping |
